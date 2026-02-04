const LayoutService = require('../../services/storefront/layout.service');
const SectionValidator = require('../../middleware/validation/section.validator');
const AppError = require('../../../core/utils/appError');

class LayoutAdminController {
  
  /**
   * GET /admin/storefront/layout
   */
  getLayout = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const layout = await LayoutService.getLayout(organizationId);
      
      res.status(200).json({
        status: 'success',
        data: layout
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/storefront/layout
   */
  updateLayout = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { header, footer, globalSettings } = req.body;

      // 1. Validate Header Sections
      if (header) {
        for (const section of header) {
          const validation = await SectionValidator.validateSection(section);
          if (!validation.valid) return next(new AppError(`Header Error: ${validation.error}`, 400));
        }
      }

      // 2. Validate Footer Sections
      if (footer) {
        for (const section of footer) {
          const validation = await SectionValidator.validateSection(section);
          if (!validation.valid) return next(new AppError(`Footer Error: ${validation.error}`, 400));
        }
      }

      // 3. Save
      const updatedLayout = await LayoutService.updateLayout(organizationId, {
        header,
        footer,
        globalSettings
      });

      res.status(200).json({
        status: 'success',
        message: 'Layout updated successfully',
        data: updatedLayout
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new LayoutAdminController();