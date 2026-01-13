// src/middleware/security/organizationAccess.js
const { Organization } = require('../../../modules/organization/core/organization.model');
const AppError = require('../../utils/appError');

/**
 * Middleware to check if user has access to organization
 */
exports.checkOrganizationAccess = async (req, res, next) => {
  try {
    const { organizationId } = req.user;
    const { organizationSlug } = req.params;
    
    let organization;
    
    // If organizationSlug is provided in params
    if (organizationSlug) {
      organization = await Organization.findOne({
        uniqueShopId: organizationSlug.toUpperCase()
      });
      
      if (!organization) {
        return next(new AppError('Organization not found', 404));
      }
      
      // Check if user belongs to this organization
      if (organization._id.toString() !== organizationId.toString()) {
        return next(new AppError('You do not have access to this organization', 403));
      }
      
      // Add organization to request for later use
      req.organization = organization;
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to check if organization is active
 */
exports.checkOrganizationActive = async (req, res, next) => {
  try {
    const organization = req.organization;
    
    if (!organization.isActive) {
      return next(new AppError('This organization is inactive', 403));
    }
    
    next();
  } catch (error) {
    next(error);
  }
};