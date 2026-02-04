const { StorefrontPage } = require('../../models/storefront');
const LayoutService = require('../../services/storefront/layout.service');
const AppError = require('../../../core/utils/appError');

class StorefrontAdminController {

  // --- LAYOUT & THEME MANAGEMENT ---

  /**
   * Update Layout (Themes, Header, Footer)
   */
  async updateLayout(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { header, footer, globalSettings, themeConfig } = req.body;

      // Ensure themeConfig has the required structure if provided
      if (themeConfig && !themeConfig.activeThemeId) {
        return next(new AppError('activeThemeId is required when updating theme configuration', 400));
      }

      const updatedLayout = await LayoutService.updateLayout(organizationId, {
        header,
        footer,
        globalSettings,
        themeConfig // Now validated
      });

      res.status(200).json({
        status: 'success',
        message: 'Store layout updated',
        data: updatedLayout
      });
    } catch (error) {
      next(error);
    }
  }

  // --- PAGE MANAGEMENT ---

  async createPage(req, res, next) {
    try {
      const { organizationId } = req.user;
      
      // Prevent creating duplicate homepages manually
      if (req.body.isHomepage) {
        await StorefrontPage.updateMany(
          { organizationId, isHomepage: true }, 
          { isHomepage: false }
        );
      }

      const page = await StorefrontPage.create({
        ...req.body,
        organizationId,
        isSystemPage: false // Users cannot create system pages manually
      });

      res.status(201).json({ status: 'success', data: page });
    } catch (error) {
      next(error);
    }
  }

  async deletePage(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { pageId } = req.params;

      const page = await StorefrontPage.findOne({ _id: pageId, organizationId });
      
      if (!page) return next(new AppError('Page not found', 404));

      // PROTECTION: Don't allow deleting System Pages or Homepage
      if (page.isSystemPage) {
        return next(new AppError('Cannot delete a system page (e.g. Checkout, Cart)', 403));
      }
      if (page.isHomepage) {
        return next(new AppError('Cannot delete the active homepage', 400));
      }

      // SOFT DELETE (Pro Best Practice)
      page.isDeleted = true;
      page.status = 'archived';
      await page.save();

      res.status(200).json({ status: 'success', message: 'Page moved to trash' });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new StorefrontAdminController();

// const LayoutService = require('../../services/storefront/layout.service');
// const SectionValidator = require('../../middleware/validation/section.validator');
// const AppError = require('../../../core/utils/appError');

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