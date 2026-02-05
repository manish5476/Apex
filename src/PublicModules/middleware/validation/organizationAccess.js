// src/middleware/validation/section.validator.js
const SectionRegistry = require('../../services/storefront/sectionRegistry.service');
const AppError = require('../../../core/utils/appError');

class SectionValidator {
  /**
   * Validate section configuration
   */
  static async validateSection(section) {
    // Check required fields
    if (!section.type) {
      return { valid: false, error: 'Section type is required' };
    }
    
    // Allow empty config (some sections might not need it), but object must exist
    if (!section.config && typeof section.config !== 'object') {
      return { valid: false, error: 'Section config is required' };
    }
    
    if (section.position === undefined || section.position === null) {
      return { valid: false, error: 'Section position is required' };
    }
    
    // Get section definition
    const definition = SectionRegistry.getSectionDefinition(section.type);
    if (!definition) {
      return { valid: false, error: `Invalid section type: ${section.type}` };
    }
    
    // Validate config
    const configValidation = SectionRegistry.validateConfig(section.type, section.config || {});
    if (!configValidation.valid) {
      return { 
        valid: false, 
        error: `Invalid config for ${section.type}: ${configValidation.errors.join(', ')}` 
      };
    }
    
    // ✅ FIX IS HERE: Validate data source safely
    // We check if definition.dataSource exists before calling .includes
    if (section.dataSource) {
        const allowedSources = definition.dataSource || []; // Default to empty array if undefined
        
        // If the section definition doesn't specify ANY allowed sources, 
        // but the section tries to use one, you might want to flag it or ignore it.
        // For now, only validate if allowedSources are actually defined.
        if (allowedSources.length > 0 && !allowedSources.includes(section.dataSource)) {
            return { 
                valid: false, 
                error: `Invalid data source for ${section.type}. Allowed: ${allowedSources.join(', ')}` 
            };
        }
    }
    
    // Validate manual data if dataSource is manual
    if (section.dataSource === 'manual') {
      if (!section.manualData?.productIds?.length) {
        return { valid: false, error: 'Manual sections require productIds' };
      }
    }
    
    // Validate category filter if dataSource is category
    if (section.dataSource === 'category' && !section.categoryFilter) {
      return { valid: false, error: 'Category sections require categoryFilter' };
    }
    
    return { valid: true };
  }
  
  /**
   * Middleware for validating sections in request
   */
  static async validateSectionsMiddleware(req, res, next) {
    if (req.body.sections && Array.isArray(req.body.sections)) {
      const errors = [];
      
      // Validate each section - Use for...of loop to handle async nicely if needed
      for (const [index, section] of req.body.sections.entries()) {
        // Note: validateSection is static async, so we should await it
        const validation = await SectionValidator.validateSection(section);
        if (!validation.valid) {
          errors.push(`Section ${index} (${section.type}): ${validation.error}`);
        }
      }
      
      if (errors.length > 0) {
        return next(new AppError(`Invalid sections: ${errors.join('; ')}`, 400));
      }
    }
    
    next();
  }
}

module.exports = SectionValidator;
// // src/middleware/security/organizationAccess.js
// const { Organization } = require('../../../modules/organization/core/organization.model');
// const AppError = require('../../utils/appError');

// /**
//  * Middleware to check if user has access to organization
//  */
// exports.checkOrganizationAccess = async (req, res, next) => {
//   try {
//     const { organizationId } = req.user;
//     const { organizationSlug } = req.params;
    
//     let organization;
    
//     // If organizationSlug is provided in params
//     if (organizationSlug) {
//       organization = await Organization.findOne({
//         uniqueShopId: organizationSlug.toUpperCase()
//       });
      
//       if (!organization) {
//         return next(new AppError('Organization not found', 404));
//       }
      
//       // Check if user belongs to this organization
//       if (organization._id.toString() !== organizationId.toString()) {
//         return next(new AppError('You do not have access to this organization', 403));
//       }
      
//       // Add organization to request for later use
//       req.organization = organization;
//     }
    
//     next();
//   } catch (error) {
//     next(error);
//   }
// };

// /**
//  * Middleware to check if organization is active
//  */
// exports.checkOrganizationActive = async (req, res, next) => {
//   try {
//     const organization = req.organization;
    
//     if (!organization.isActive) {
//       return next(new AppError('This organization is inactive', 403));
//     }
    
//     next();
//   } catch (error) {
//     next(error);
//   }
// };
