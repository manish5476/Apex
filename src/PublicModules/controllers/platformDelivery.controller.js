const PlatformDeliveryAgent = require('../models/platformDeliveryAgent.model');
const StorefrontOrder = require('../models/storefront/storefrontOrder.model');
const AppError = require('../../core/utils/api/appError');
const jwt = require('jsonwebtoken');

const signToken = (id) => {
  return jwt.sign({ id, type: 'platform_delivery_agent' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

exports.register = async (req, res, next) => {
  try {
    const { name, phone, password, city, state, zipCode, vehicleType, licenseNumber } = req.body;

    if (!name || !phone || !password || !city || !state || !zipCode) {
      return next(new AppError('Please provide all required fields (name, phone, password, city, state, zipCode)', 400));
    }

    const existing = await PlatformDeliveryAgent.findOne({ phone });
    if (existing) {
      return next(new AppError('Phone number already in use', 400));
    }

    const agent = await PlatformDeliveryAgent.create({
      name, phone, password, city, state, zipCode, vehicleType, licenseNumber, status: 'available'
    });

    const token = signToken(agent._id);
    agent.password = undefined;

    res.status(201).json({
      status: 'success',
      token,
      data: agent
    });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return next(new AppError('Phone and password are required', 400));
    }

    const agent = await PlatformDeliveryAgent.findOne({ phone }).select('+password');
    if (!agent) {
      return next(new AppError('Invalid phone number or password', 401));
    }

    if (!agent.isActive) {
      return next(new AppError('Your account has been deactivated', 403));
    }

    const isMatch = await agent.matchPassword(password);
    if (!isMatch) {
      return next(new AppError('Invalid phone number or password', 401));
    }

    const token = signToken(agent._id);
    agent.password = undefined;

    res.status(200).json({
      status: 'success',
      token,
      data: agent
    });
  } catch (err) {
    next(err);
  }
};

exports.updatePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return next(new AppError('Please provide both old and new password', 400));
    }

    const agent = await PlatformDeliveryAgent.findById(req.user.id).select('+password');
    if (!agent) {
      return next(new AppError('Platform agent not found', 404));
    }

    const isMatch = await agent.matchPassword(oldPassword);
    if (!isMatch) {
      return next(new AppError('Incorrect old password', 401));
    }

    agent.password = newPassword;
    await agent.save();

    res.status(200).json({
      status: 'success',
      message: 'Password updated successfully'
    });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// DASHBOARD & SCANNING
// ---------------------------------------------------------------------------
exports.getAvailableOrders = async (req, res, next) => {
  try {
    const agentId = req.user.id;
    const agent = await PlatformDeliveryAgent.findById(agentId);

    // Get orders fulfilled by platform that are either unassigned OR assigned to this agent
    // Also, optionally filter by agent's city/zipCode if they are unassigned.
    // For simplicity, we just fetch all orders fulfilled by platform that need delivery in the agent's area,
    // plus any orders already assigned to this agent.

    const orders = await StorefrontOrder.find({
      fulfilledBy: 'platform',
      $or: [
        { platformDeliveryAgent: agentId },
        {
          platformDeliveryAgent: null,
          'shippingAddress.city': { $regex: new RegExp(`^${agent.city}$`, 'i') },
          fulfillmentStatus: { $in: ['unfulfilled', 'partial'] },
          orderStatus: { $nin: ['cancelled', 'closed'] }
        }
      ]
    }).sort({ createdAt: -1 }).populate('organizationId', 'name address'); // populate org so agent knows pickup location

    res.status(200).json({
      status: 'success',
      results: orders.length,
      data: orders
    });
  } catch (err) {
    next(err);
  }
};

exports.scanOrder = async (req, res, next) => {
  try {
    const { identifier } = req.params;
    const agentId = req.user.id;

    // Find the order by orderNumber or trackingNumber
    const order = await StorefrontOrder.findOne({
      $or: [{ orderNumber: identifier }, { trackingNumber: identifier }],
      fulfilledBy: 'platform'
    }).populate('organizationId', 'name address');

    if (!order) {
      return next(new AppError('Order not found or not a platform order', 404));
    }

    // Assign to agent if not already assigned
    if (!order.platformDeliveryAgent) {
      order.platformDeliveryAgent = agentId;
      order.timeline.push({ type: 'delivery_assigned', message: 'Assigned to Apex Delivery Partner', actorId: agentId });
      await order.save();
    } else if (order.platformDeliveryAgent.toString() !== agentId.toString()) {
      return next(new AppError('This order is assigned to another delivery partner', 403));
    }

    res.status(200).json({
      status: 'success',
      data: order
    });
  } catch (err) {
    next(err);
  }
};

exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { status, paymentCollected } = req.body;
    const agentId = req.user.id;

    const order = await StorefrontOrder.findOne({ _id: orderId, platformDeliveryAgent: agentId, fulfilledBy: 'platform' }).populate('organizationId', 'name address');

    if (!order) {
      return next(new AppError('Order not found or not assigned to you', 404));
    }

    const validStatuses = ['out_for_delivery', 'delivered', 'failed_attempt'];
    if (!validStatuses.includes(status)) {
      return next(new AppError('Invalid delivery status', 400));
    }

    order.fulfillmentStatus = status === 'out_for_delivery' ? 'shipped' : status === 'delivered' ? 'delivered' : order.fulfillmentStatus;

    if (status === 'delivered') {
      if (order.paymentStatus !== 'paid') {
        if (order.paymentMethod === 'COD' && paymentCollected) {
          order.paymentStatus = 'paid';
          order.timeline.push({ type: 'payment_collected', message: 'Payment collected by delivery partner', actorId: agentId });
        } else {
          return next(new AppError('Payment must be collected for COD orders before marking as delivered', 400));
        }
      }
      order.timeline.push({ type: 'delivered', message: 'Order delivered by Apex Partner', actorId: agentId });
    } else if (status === 'out_for_delivery') {
      order.timeline.push({ type: 'out_for_delivery', message: 'Out for delivery', actorId: agentId });
    } else if (status === 'failed_attempt') {
      order.timeline.push({ type: 'failed_delivery', message: 'Delivery attempt failed', actorId: agentId });
    }

    await order.save();

    res.status(200).json({
      status: 'success',
      data: order
    });
  } catch (err) {
    next(err);
  }
};
