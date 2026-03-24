/**
 * LayoutAdminController
 *
 * Manages the master layout (header, footer, globalSettings) for an organization.
 * One layout document per org — not page-specific.
 *
 * Routes (all require auth + organizationId on req.user):
 *   GET    /admin/storefront/layout
 *   PUT    /admin/storefront/layout
 *   DELETE /admin/storefront/layout/reset
 */

'use strict';

const LayoutService    = require('../../services/storefront/layout.service');
const SectionValidator = require('../../middleware/validation/section.validator');
const AppError         = require('../../../core/utils/api/appError');

class LayoutAdminController {

  // ---------------------------------------------------------------------------
  // GET /admin/storefront/layout
  // ---------------------------------------------------------------------------

  getLayout = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const layout = await LayoutService.getLayout(organizationId);

      res.status(200).json({
        status: 'success',
        data:   layout
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // PUT /admin/storefront/layout
  // ---------------------------------------------------------------------------

  updateLayout = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { header, footer, globalSettings } = req.body;

      // Validate header sections if provided
      if (header !== undefined) {
        if (!Array.isArray(header)) {
          return next(new AppError('"header" must be an array of sections', 400));
        }
        const result = SectionValidator.validateSections(header);
        if (!result.valid) {
          return next(new AppError(`Header validation failed:\n${result.errors.join('\n')}`, 400));
        }
      }

      // Validate footer sections if provided
      if (footer !== undefined) {
        if (!Array.isArray(footer)) {
          return next(new AppError('"footer" must be an array of sections', 400));
        }
        const result = SectionValidator.validateSections(footer);
        if (!result.valid) {
          return next(new AppError(`Footer validation failed:\n${result.errors.join('\n')}`, 400));
        }
      }

      // Build update payload — only include keys that were actually sent
      const updateData = {};
      if (header        !== undefined) updateData.header        = header;
      if (footer        !== undefined) updateData.footer        = footer;
      if (globalSettings !== undefined) updateData.globalSettings = globalSettings;

      if (Object.keys(updateData).length === 0) {
        return next(new AppError('No update data provided. Send header, footer, or globalSettings.', 400));
      }

      const layout = await LayoutService.updateLayout(organizationId, updateData);

      res.status(200).json({
        status:  'success',
        message: 'Layout updated successfully',
        data:    layout
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // DELETE /admin/storefront/layout/reset
  // Resets layout to defaults (useful for onboarding / "start fresh")
  // ---------------------------------------------------------------------------

  resetLayout = async (req, res, next) => {
    try {
      const { organizationId } = req.user;

      // Force re-creation by deleting then re-creating default
      const StorefrontLayout = require('../models/storefrontLayout.model');
      await StorefrontLayout.deleteOne({ organizationId });

      const layout = await LayoutService.createDefaultLayout(organizationId);

      res.status(200).json({
        status:  'success',
        message: 'Layout reset to defaults',
        data:    layout
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new LayoutAdminController();


// const LayoutService = require('../../services/storefront/layout.service');
// const SectionValidator = require('../../middleware/validation/section.validator');
// const AppError = require('../../../core/utils/api/appError');

// class LayoutAdminController {
  
//   /**
//    * GET /admin/storefront/layout
//    */
//   getLayout = async (req, res, next) => {
//     try {
//       const { organizationId } = req.user;
//       const layout = await LayoutService.getLayout(organizationId);
      
//       res.status(200).json({
//         status: 'success',
//         data: layout
//       });
//     } catch (error) {
//       next(error);
//     }
//   }

//   /**
//    * PUT /admin/storefront/layout
//    */
//   updateLayout = async (req, res, next) => {
//     try {
//       const { organizationId } = req.user;
//       const { header, footer, globalSettings } = req.body;

//       // 1. Validate Header Sections
//       if (header) {
//         for (const section of header) {
//           const validation = await SectionValidator.validateSection(section);
//           if (!validation.valid) return next(new AppError(`Header Error: ${validation.error}`, 400));
//         }
//       }

//       // 2. Validate Footer Sections
//       if (footer) {
//         for (const section of footer) {
//           const validation = await SectionValidator.validateSection(section);
//           if (!validation.valid) return next(new AppError(`Footer Error: ${validation.error}`, 400));
//         }
//       }

//       // 3. Save
//       const updatedLayout = await LayoutService.updateLayout(organizationId, {
//         header,
//         footer,
//         globalSettings
//       });

//       res.status(200).json({
//         status: 'success',
//         message: 'Layout updated successfully',
//         data: updatedLayout
//       });
//     } catch (error) {
//       next(error);
//     }
//   }
// }

// module.exports = new LayoutAdminController();