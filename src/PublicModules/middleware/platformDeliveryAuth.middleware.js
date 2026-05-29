'use strict';

const jwt = require('jsonwebtoken');
const PlatformDeliveryAgent = require('../models/platformDeliveryAgent.model');
const AppError = require('../../core/utils/api/appError');

function readBearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

exports.protectPlatformDeliveryAgent = async (req, res, next) => {
  try {
    const token = readBearerToken(req);
    if (!token) return next(new AppError('Platform delivery authentication required', 401));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded?.type !== 'platform_delivery_agent') {
      return next(new AppError('Invalid token type for platform delivery', 403));
    }

    const agent = await PlatformDeliveryAgent.findById(decoded.id).lean();
    if (!agent || agent.isActive === false) {
      return next(new AppError('Platform delivery agent is inactive or no longer exists', 401));
    }

    req.user = {
      id: agent._id,
      _id: agent._id,
      type: 'platform_delivery_agent',
      phone: agent.phone,
      city: agent.city,
      state: agent.state,
      zipCode: agent.zipCode
    };
    req.platformDeliveryAgent = agent;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Platform delivery session expired. Please login again.', 401));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid platform delivery token', 401));
    }
    next(err);
  }
};
