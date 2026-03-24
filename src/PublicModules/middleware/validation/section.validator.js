/**
 * SectionValidator
 *
 * Validates section objects before they are saved to StorefrontPage or StorefrontLayout.
 *
 * Fixed issues vs v1:
 *   - Removed check for `section.position` (field does not exist in schema)
 *   - validateConfig() is now real (delegated to SectionRegistry)
 *   - errors array vs error string is consistent throughout
 *   - Works as both a utility (validateSection) and Express middleware (validateSectionsMiddleware)
 */

'use strict';

const SectionRegistry = require('../../services/storefront/sectionRegistry.service');
const AppError        = require('../../../core/utils/api/appError');

class SectionValidator {

  // ---------------------------------------------------------------------------
  // Validate a single section object
  // Returns { valid: true } or { valid: false, error: string }
  // ---------------------------------------------------------------------------

  static validateSection(section) {
    if (!section || typeof section !== 'object') {
      return { valid: false, error: 'Section must be an object' };
    }

    // type is required
    if (!section.type || typeof section.type !== 'string') {
      return { valid: false, error: 'Section "type" is required' };
    }

    // config must be an object if provided
    if (section.config !== undefined && (typeof section.config !== 'object' || Array.isArray(section.config))) {
      return { valid: false, error: '"config" must be an object' };
    }

    // Validate config against registry schema
    const configResult = SectionRegistry.validateConfig(section.type, section.config ?? {});
    if (!configResult.valid) {
      // configResult.errors is always an array from the new SectionRegistry
      return {
        valid: false,
        error: configResult.errors.join('; ')
      };
    }

    // dataSource cross-checks (optional field — only validate if present)
    if (section.dataSource) {
      const def = SectionRegistry.getDefinition(section.type);
      const allowed = def?.allowedDataSources ?? [];

      if (allowed.length > 0 && !allowed.includes(section.dataSource)) {
        return {
          valid: false,
          error: `dataSource "${section.dataSource}" is not allowed for type "${section.type}". Allowed: ${allowed.join(', ')}`
        };
      }

      // manual data source requires productIds
      if (section.dataSource === 'manual' && !section.manualData?.productIds?.length) {
        return { valid: false, error: 'Sections with dataSource "manual" require manualData.productIds' };
      }
    }

    // smartRuleId cross-check: if set, it's a string/ObjectId
    if (section.smartRuleId !== undefined && section.smartRuleId !== null) {
      if (typeof section.smartRuleId !== 'string' && typeof section.smartRuleId !== 'object') {
        return { valid: false, error: '"smartRuleId" must be a valid ObjectId string' };
      }
    }

    return { valid: true };
  }

  // ---------------------------------------------------------------------------
  // Validate an array of sections — returns aggregated errors
  // ---------------------------------------------------------------------------

  static validateSections(sections) {
    if (!Array.isArray(sections)) {
      return { valid: false, errors: ['"sections" must be an array'] };
    }

    const errors = [];

    for (let i = 0; i < sections.length; i++) {
      const result = SectionValidator.validateSection(sections[i]);
      if (!result.valid) {
        const typeLabel = sections[i]?.type ?? `index ${i}`;
        errors.push(`Section [${i}] (${typeLabel}): ${result.error}`);
      }
    }

    return errors.length > 0
      ? { valid: false, errors }
      : { valid: true };
  }

  // ---------------------------------------------------------------------------
  // Express middleware — validates req.body.sections if present
  // ---------------------------------------------------------------------------

  static validateSectionsMiddleware(req, res, next) {
    if (!req.body.sections) return next(); // Nothing to validate

    const result = SectionValidator.validateSections(req.body.sections);

    if (!result.valid) {
      return next(new AppError(`Invalid sections:\n${result.errors.join('\n')}`, 400));
    }

    next();
  }
}

module.exports = SectionValidator;

// // src/middleware/validation/section.validator.js
// const SectionRegistry = require('../../services/storefront/sectionRegistry.service');
// const AppError = require('../../../core/utils/api/appError');

// class SectionValidator {
//   /**
//    * Validate section configuration
//    */
//   static async validateSection(section) {
//     // Check required fields
//     if (!section.type) {
//       return { valid: false, error: 'Section type is required' };
//     }
    
//     // Allow empty config (some sections might not need it), but object must exist
//     if (!section.config && typeof section.config !== 'object') {
//       return { valid: false, error: 'Section config is required' };
//     }
    
//     if (section.position === undefined || section.position === null) {
//       return { valid: false, error: 'Section position is required' };
//     }
    
//     // Get section definition
//     const definition = SectionRegistry.getSectionDefinition(section.type);
//     if (!definition) {
//       return { valid: false, error: `Invalid section type: ${section.type}` };
//     }
    
//     // Validate config
//     const configValidation = SectionRegistry.validateConfig(section.type, section.config || {});
//     if (!configValidation.valid) {
//       return { 
//         valid: false, 
//         error: `Invalid config for ${section.type}: ${configValidation.errors.join(', ')}` 
//       };
//     }
    
//     // ✅ FIX IS HERE: Validate data source safely
//     // We check if definition.dataSource exists before calling .includes
//     if (section.dataSource) {
//         const allowedSources = definition.dataSource || []; // Default to empty array if undefined
        
//         // If the section definition doesn't specify ANY allowed sources, 
//         // but the section tries to use one, you might want to flag it or ignore it.
//         // For now, only validate if allowedSources are actually defined.
//         if (allowedSources.length > 0 && !allowedSources.includes(section.dataSource)) {
//             return { 
//                 valid: false, 
//                 error: `Invalid data source for ${section.type}. Allowed: ${allowedSources.join(', ')}` 
//             };
//         }
//     }
    
//     // Validate manual data if dataSource is manual
//     if (section.dataSource === 'manual') {
//       if (!section.manualData?.productIds?.length) {
//         return { valid: false, error: 'Manual sections require productIds' };
//       }
//     }
    
//     // Validate category filter if dataSource is category
//     if (section.dataSource === 'category' && !section.categoryFilter) {
//       return { valid: false, error: 'Category sections require categoryFilter' };
//     }
    
//     return { valid: true };
//   }
  
//   /**
//    * Middleware for validating sections in request
//    */
//   static async validateSectionsMiddleware(req, res, next) {
//     if (req.body.sections && Array.isArray(req.body.sections)) {
//       const errors = [];
      
//       // Validate each section - Use for...of loop to handle async nicely if needed
//       for (const [index, section] of req.body.sections.entries()) {
//         // Note: validateSection is static async, so we should await it
//         const validation = await SectionValidator.validateSection(section);
//         if (!validation.valid) {
//           errors.push(`Section ${index} (${section.type}): ${validation.error}`);
//         }
//       }
      
//       if (errors.length > 0) {
//         return next(new AppError(`Invalid sections: ${errors.join('; ')}`, 400));
//       }
//     }
    
//     next();
//   }
// }

// module.exports = SectionValidator;
