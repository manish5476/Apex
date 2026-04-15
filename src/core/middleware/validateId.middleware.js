'use strict';

const mongoose = require('mongoose');
const AppError = require('../utils/api/appError');

/**
 * Middleware to validate that specific parameters are valid MongoDB ObjectIds.
 * If a parameter is invalid (e.g., 'undefined'), it returns a 400 Bad Request.
 * @param {...string} paramNames - The names of the parameters to validate
 */
const validateIds = (...paramNames) => {
  return (req, res, next) => {
    for (const name of paramNames) {
      const id = req.params[name];
      if (id && !mongoose.Types.ObjectId.isValid(id)) {
        return next(new AppError(`Invalid ${name} format: ${id}`, 400));
      }
    }
    next();
  };
};

module.exports = validateIds;
