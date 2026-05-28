'use strict';

const AppError = require('../../../core/utils/api/appError');
const StorefrontDeliveryAgent = require('../../models/storefront/storefrontDeliveryAgent.model');
const StorefrontOrder = require('../../models/storefront/storefrontOrder.model');
const jwt = require('jsonwebtoken');

class StorefrontDeliveryAgentController {
  
  // ---------------------------------------------------------------------------
  // AUTHENTICATION
  // POST /delivery-agent/login
  // ---------------------------------------------------------------------------
  login = async (req, res, next) => {
    try {
      const { phone, password, orgSlug } = req.body;
      
      if (!phone || !password || !orgSlug) {
        return next(new AppError('Phone, password, and organization slug are required', 400));
      }

      // Lookup Organization using uniqueShopId which corresponds to orgSlug
      const Organization = require('../../../modules/organization/core/organization.model');
      const org = await Organization.findOne({
        uniqueShopId: new RegExp(`^${orgSlug}$`, 'i'),
        isActive: true
      });

      if (!org) {
        return next(new AppError('Organization not found or inactive', 404));
      }

      const agent = await StorefrontDeliveryAgent.findOne({ phone, organizationId: org._id }).select('+password');
      if (!agent) {
        return next(new AppError('Invalid phone number or password for this organization', 401));
      }

      if (!agent.isActive) {
        return next(new AppError('Your account has been deactivated', 403));
      }

      const isMatch = await agent.matchPassword(password);
      if (!isMatch) {
        return next(new AppError('Invalid phone number or password', 401));
      }

      agent.lastActiveAt = new Date();
      await agent.save({ validateBeforeSave: false });

      const token = jwt.sign(
        {
          id: agent._id,
          type: 'storefront_delivery_agent',
          role: 'delivery_agent',
          organizationId: agent.organizationId
        },
        process.env.JWT_SECRET || 'fallback-secret', // Should use actual JWT_SECRET
        { expiresIn: process.env.JWT_EXPIRES_IN || '90d' }
      );

      agent.password = undefined;

      res.status(200).json({
        status: 'success',
        token,
        data: agent
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // UPDATE PASSWORD
  // PATCH /delivery-agent/update-password
  // ---------------------------------------------------------------------------
  updatePassword = async (req, res, next) => {
    try {
      const { oldPassword, newPassword } = req.body;
      if (!oldPassword || !newPassword) {
        return next(new AppError('Please provide both old and new password', 400));
      }

      const agent = await StorefrontDeliveryAgent.findById(req.user.id).select('+password');
      if (!agent) {
        return next(new AppError('Delivery agent not found', 404));
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
  }

  // ---------------------------------------------------------------------------
  // DASHBOARD & SCANNING
  // GET /delivery-agent/orders
  // GET /delivery-agent/scan/:identifier
  // ---------------------------------------------------------------------------
  getAssignedOrders = async (req, res, next) => {
    try {
      const agentId = req.user.id;
      const organizationId = req.user.organizationId;
      
      // Get orders assigned to this agent that are NOT delivered or returned
      const orders = await StorefrontOrder.find({
        deliveryAgent: agentId,
        organizationId,
        fulfillmentStatus: { $nin: ['delivered', 'returned'] },
        orderStatus: { $ne: 'cancelled' }
      }).sort({ createdAt: 1 }).lean();

      res.status(200).json({
        status: 'success',
        results: orders.length,
        data: orders
      });
    } catch (err) {
      next(err);
    }
  }

  scanOrder = async (req, res, next) => {
    try {
      const agentId = req.user.id;
      const organizationId = req.user.organizationId;
      const { identifier } = req.params;

      let order = await StorefrontOrder.findOne({
        $or: [
          { trackingNumber: identifier },
          { orderNumber: identifier }
        ],
        organizationId
      }).lean();

      if (!order && identifier.length === 24) {
        // Fallback for _id if it's a valid object ID length
         const orderById = await StorefrontOrder.findOne({ _id: identifier, organizationId }).lean();
         if (orderById) {
             order = orderById;
         }
      }

      if (!order) {
        return next(new AppError('Order not found', 404));
      }

      if (order.deliveryAgent?.toString() !== agentId.toString()) {
        return next(new AppError('This order is not assigned to you', 403));
      }

      res.status(200).json({
        status: 'success',
        data: order
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // UPDATE STATUS
  // PATCH /delivery-agent/orders/:orderId/status
  // ---------------------------------------------------------------------------
  updateOrderStatus = async (req, res, next) => {
    try {
      const agentId = req.user.id;
      const organizationId = req.user.organizationId;
      const { orderId } = req.params;
      const { status } = req.body; // expected: 'shipped', 'delivered', etc.

      if (!['shipped', 'delivered'].includes(status)) {
        return next(new AppError('Invalid status update for delivery agent', 400));
      }

      const order = await StorefrontOrder.findOne({
        _id: orderId,
        organizationId,
        deliveryAgent: agentId
      });

      if (!order) {
        return next(new AppError('Order not found or not assigned to you', 404));
      }

      // We only allow forward movement by agent
      const oldFulfillmentStatus = order.fulfillmentStatus;
      
      let msg = '';
      if (status === 'shipped' && oldFulfillmentStatus !== 'shipped') {
         msg = 'Order picked up and is out for delivery';
      } else if (status === 'delivered' && oldFulfillmentStatus !== 'delivered') {
         // COD Validation
         if (order.paymentMethod === 'COD' && order.paymentStatus !== 'paid') {
           const { paymentCollected } = req.body;
           if (!paymentCollected) {
             return next(new AppError('You must confirm cash collection for Cash on Delivery orders', 400));
           }
           order.paymentStatus = 'paid';
           msg = 'Order delivered and payment collected';
         } else {
           msg = 'Order delivered successfully';
         }
      }

      if (msg) {
        order.fulfillmentStatus = status;
        
        const agent = await StorefrontDeliveryAgent.findById(agentId);
        
        order.timeline.push({
          type: 'delivery_update',
          message: `${msg} by ${agent ? agent.name : 'Delivery Agent'}`,
          actorId: agentId
        });

        // Deduct physical stock if status is delivered
        if (status === 'delivered' && oldFulfillmentStatus !== 'delivered') {
          const Product = require('../../../modules/inventory/core/model/product.model');
          for (const item of order.items) {
            if (!item.productId) continue;
            const product = await Product.findOne({ _id: item.productId, organizationId });
            if (product && product.inventory && product.inventory.length > 0) {
              let inv = product.inventory.find(i => i.branchId?.toString() === item.branchId?.toString());
              if (!inv) inv = product.inventory[0];
              inv.quantity = Math.max(0, inv.quantity - item.quantity);
              inv.reservedQuantity = Math.max(0, (inv.reservedQuantity || 0) - item.quantity);
              await product.save();
            }
          }
          // Note: In real life, might also generate Invoice here if not done yet.
        }

        await order.save();
      }

      res.status(200).json({
        status: 'success',
        message: msg || 'Status was already up to date',
        data: order
      });
    } catch (err) {
      next(err);
    }
  }

}

module.exports = new StorefrontDeliveryAgentController();
