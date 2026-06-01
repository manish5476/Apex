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
  // FORGOT / RESET PASSWORD
  // ---------------------------------------------------------------------------
  forgotPassword = async (req, res, next) => {
    try {
      const { email, phone, orgSlug } = req.body;
      if (!orgSlug) return next(new AppError('Organization slug is required', 400));
      if (!email && !phone) return next(new AppError('Please provide an email or phone number', 400));

      const Organization = require('../../../modules/organization/core/organization.model');
      const org = await Organization.findOne({ uniqueShopId: new RegExp(`^${orgSlug}$`, 'i'), isActive: true });
      if (!org) return next(new AppError('Organization not found', 404));

      const query = { organizationId: org._id };
      if (email) query.email = email;
      else query.phone = phone;

      const agent = await StorefrontDeliveryAgent.findOne(query);
      if (!agent) {
        return next(new AppError('No account found with that information in this organization', 404));
      }

      // Generate token
      const crypto = require('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      
      // Hash and store
      agent.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
      agent.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
      await agent.save({ validateBeforeSave: false });

      // Send email if they have one
      if (agent.email) {
        const resetURL = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/store/${orgSlug}/delivery/reset-password/${resetToken}`;
        const sendEmail = require('../../../core/infra/email');
        
        try {
          await sendEmail({
            email: agent.email,
            subject: `Password Reset Request - ${org.name} Delivery`,
            message: `Forgot your password? Reset it here: ${resetURL}\nIf you didn't forget your password, please ignore this email.`,
            html: `<p>Forgot your password? Reset it here: <a href="${resetURL}">${resetURL}</a></p><p>If you didn't forget your password, please ignore this email.</p>`
          });
          
          res.status(200).json({
            status: 'success',
            message: 'Token sent to email!'
          });
        } catch (err) {
          agent.passwordResetToken = undefined;
          agent.passwordResetExpires = undefined;
          await agent.save({ validateBeforeSave: false });
          return next(new AppError('There was an error sending the email. Try again later!', 500));
        }
      } else {
        // Fallback for SMS-less environments when no email exists
        res.status(200).json({
          status: 'success',
          message: 'Secure reset link generated. Please contact your store administrator to receive it.',
          resetToken // Included for testing/dev environments
        });
      }
    } catch (err) {
      next(err);
    }
  }

  resetPassword = async (req, res, next) => {
    try {
      const crypto = require('crypto');
      const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

      const agent = await StorefrontDeliveryAgent.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: Date.now() }
      }).select('+password');

      if (!agent) {
        return next(new AppError('Token is invalid or has expired', 400));
      }

      if (!req.body.password) {
         return next(new AppError('Please provide a new password', 400));
      }

      agent.password = req.body.password;
      agent.passwordResetToken = undefined;
      agent.passwordResetExpires = undefined;
      agent.passwordChangedAt = Date.now();
      await agent.save();

      const token = jwt.sign(
        {
          id: agent._id,
          type: 'storefront_delivery_agent',
          role: 'delivery_agent',
          organizationId: agent.organizationId
        },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: process.env.JWT_EXPIRES_IN || '90d' }
      );

      res.status(200).json({
        status: 'success',
        token,
        message: 'Password successfully reset'
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // PROFILE
  // ---------------------------------------------------------------------------
  getProfile = async (req, res, next) => {
    try {
      const agent = await StorefrontDeliveryAgent.findById(req.user.id);
      if (!agent) return next(new AppError('Delivery agent not found', 404));
      
      res.status(200).json({
        status: 'success',
        data: agent
      });
    } catch (err) {
      next(err);
    }
  }

  updateProfile = async (req, res, next) => {
    try {
      const allowedUpdates = ['name', 'email', 'alternatePhone', 'vehicleType', 'vehicleRegistrationNumber'];
      const updateData = {};
      for (const key of allowedUpdates) {
        if (req.body[key] !== undefined) {
          updateData[key] = req.body[key];
        }
      }

      // If email is being changed, check if it already exists
      if (updateData.email) {
        const existingEmail = await StorefrontDeliveryAgent.findOne({
          organizationId: req.user.organizationId,
          email: updateData.email,
          _id: { $ne: req.user.id }
        });
        if (existingEmail) {
          return next(new AppError('This email is already in use by another agent', 409));
        }
      }

      const agent = await StorefrontDeliveryAgent.findByIdAndUpdate(req.user.id, updateData, {
        new: true,
        runValidators: true
      });

      res.status(200).json({
        status: 'success',
        data: agent
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

  // ---------------------------------------------------------------------------
  // FORGOT PASSWORD
  // POST /delivery-agent/forgot-password
  // ---------------------------------------------------------------------------
  forgotPassword = async (req, res, next) => {
    try {
      const { phoneOrEmail, orgSlug } = req.body;
      
      if (!phoneOrEmail || !orgSlug) {
        return next(new AppError('Phone/Email and organization slug are required', 400));
      }

      // Lookup Organization
      const Organization = require('../../../modules/organization/core/organization.model');
      const org = await Organization.findOne({
        uniqueShopId: new RegExp(`^${orgSlug}$`, 'i'),
        isActive: true
      });

      if (!org) {
        return next(new AppError('Organization not found', 404));
      }

      // Find agent by phone or email
      const agent = await StorefrontDeliveryAgent.findOne({
        organizationId: org._id,
        $or: [
          { phone: phoneOrEmail },
          { email: phoneOrEmail.toLowerCase() }
        ]
      });

      if (!agent) {
        // Return success to prevent enumeration, or we can just error out for internal tool
        return next(new AppError('No active delivery agent found with this detail in this organization.', 404));
      }

      if (!agent.isActive) {
        return next(new AppError('Your account has been deactivated', 403));
      }

      if (!agent.email) {
        return next(new AppError('You do not have an email address associated with your account. Please contact your store administrator to reset your password.', 400));
      }

      const crypto = require('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      
      agent.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
      agent.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 min

      await agent.save({ validateBeforeSave: false });

      // Build Reset URL
      const resetURL = `${process.env.FRONTEND_URL}/store/${orgSlug}/delivery/reset-password/${resetToken}`;

      try {
        const sendEmail = require('../../../core/infra/email');
        await sendEmail({
          email: agent.email,
          subject: 'Delivery Agent Password Reset Request',
          html: `
            <h2>Password Reset Request</h2>
            <p>Hello ${agent.name},</p>
            <p>Click the link below to reset your delivery agent password:</p>
            <p><a href="${resetURL}" style="padding:10px 20px;background:#4F46E5;color:white;text-decoration:none;border-radius:5px;">Reset Password</a></p>
            <p>Or copy this link: ${resetURL}</p>
            <p>This link will expire in 10 minutes.</p>
            <p>If you didn't request this, please ignore this email.</p>
          `,
        });
      } catch (err) {
        agent.passwordResetToken = undefined;
        agent.passwordResetExpires = undefined;
        await agent.save({ validateBeforeSave: false });
        return next(new AppError('Failed to send reset email. Please try again later.', 500));
      }

      res.status(200).json({
        status: 'success',
        message: 'Password reset link sent to your email.'
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // RESET PASSWORD
  // PATCH /delivery-agent/reset-password/:token
  // ---------------------------------------------------------------------------
  resetPassword = async (req, res, next) => {
    try {
      const { token } = req.params;
      const { password, orgSlug } = req.body;

      if (!password) {
        return next(new AppError('Please provide a new password', 400));
      }

      const crypto = require('crypto');
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

      const agent = await StorefrontDeliveryAgent.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: Date.now() }
      }).select('+password');

      if (!agent) {
        return next(new AppError('Token is invalid or has expired', 400));
      }

      // In real life we could check organization slug matches agent.organizationId,
      // but the token is cryptographically secure enough.
      
      agent.password = password;
      agent.passwordResetToken = undefined;
      agent.passwordResetExpires = undefined;
      agent.passwordChangedAt = Date.now();

      await agent.save();

      res.status(200).json({
        status: 'success',
        message: 'Password reset successfully. You can now login.'
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // PROFILE
  // GET /delivery-agent/profile
  // PATCH /delivery-agent/profile
  // ---------------------------------------------------------------------------
  getProfile = async (req, res, next) => {
    try {
      const agent = await StorefrontDeliveryAgent.findById(req.user.id);
      if (!agent) {
        return next(new AppError('Delivery agent not found', 404));
      }
      res.status(200).json({
        status: 'success',
        data: agent
      });
    } catch (err) {
      next(err);
    }
  }

  updateProfile = async (req, res, next) => {
    try {
      const { email, alternatePhone, vehicleType, vehicleRegistrationNumber } = req.body;
      const updateData = {};

      if (email !== undefined) updateData.email = email;
      if (alternatePhone !== undefined) updateData.alternatePhone = alternatePhone;
      if (vehicleType !== undefined) updateData.vehicleType = vehicleType;
      if (vehicleRegistrationNumber !== undefined) updateData.vehicleRegistrationNumber = vehicleRegistrationNumber;

      const agent = await StorefrontDeliveryAgent.findByIdAndUpdate(
        req.user.id,
        updateData,
        { new: true, runValidators: true }
      );

      if (!agent) {
        return next(new AppError('Delivery agent not found', 404));
      }

      res.status(200).json({
        status: 'success',
        data: agent
      });
    } catch (err) {
      next(err);
    }
  }

}

module.exports = new StorefrontDeliveryAgentController();
