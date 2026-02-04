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
    
    if (!section.config) {
      return { valid: false, error: 'Section config is required' };
    }
    
    if (section.position === undefined) {
      return { valid: false, error: 'Section position is required' };
    }
    
    // Get section definition
    const definition = SectionRegistry.getSectionDefinition(section.type);
    if (!definition) {
      return { valid: false, error: `Invalid section type: ${section.type}` };
    }
    
    // Validate config
    const configValidation = SectionRegistry.validateConfig(section.type, section.config);
    if (!configValidation.valid) {
      return { 
        valid: false, 
        error: `Invalid config for ${section.type}: ${configValidation.errors.join(', ')}` 
      };
    }
    
    // Validate data source
    if (section.dataSource && !definition.dataSource.includes(section.dataSource)) {
      return { 
        valid: false, 
        error: `Invalid data source for ${section.type}. Allowed: ${definition.dataSource.join(', ')}` 
      };
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
  static validateSectionsMiddleware(req, res, next) {
    if (req.body.sections) {
      const errors = [];
      
      // Validate each section
      req.body.sections.forEach((section, index) => {
        const validation = this.validateSection(section);
        if (!validation.valid) {
          errors.push(`Section ${index}: ${validation.error}`);
        }
      });
      
      if (errors.length > 0) {
        return next(new AppError(`Invalid sections: ${errors.join('; ')}`, 400));
      }
    }
    
    next();
  }
}

module.exports = SectionValidator;