'use strict';

const jwt = require('jsonwebtoken');
const StorefrontDeliveryAgent = require('../models/storefront/storefrontDeliveryAgent.model');
const AppError = require('../../core/utils/api/appError');

function readBearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

exports.protectStorefrontDeliveryAgent = async (req, res, next) => {
  try {
    const token = readBearerToken(req);
    if (!token) return next(new AppError('Delivery agent authentication required', 401));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded?.type !== 'storefront_delivery_agent' || !decoded?.organizationId) {
      return next(new AppError('Invalid token type for delivery agent', 403));
    }

    const agent = await StorefrontDeliveryAgent.findOne({
      _id: decoded.id,
      organizationId: decoded.organizationId
    }).lean();

    if (!agent || agent.isActive === false) {
      return next(new AppError('Delivery agent is inactive or no longer exists', 401));
    }

    req.user = {
      id: agent._id,
      _id: agent._id,
      type: 'storefront_delivery_agent',
      role: 'delivery_agent',
      organizationId: agent.organizationId,
      phone: agent.phone
    };
    req.deliveryAgent = agent;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Delivery agent session expired. Please login again.', 401));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid delivery agent token', 401));
    }
    next(err);
  }
};
