const { StorefrontPage, SmartRule, SectionTemplate } = require('../../models/storefront');
// FIX: Removed curly braces
const Organization = require('../../../modules/organization/core/organization.model');
const SectionRegistry = require('../../services/storefront/sectionRegistry.service');
const SectionValidator = require('../../middleware/validation/section.validator');
const AppError = require('../../../core/utils/appError');

class StorefrontAdminController {
  /**
   * Get all pages for organization (admin)
   * Route: GET /admin/storefront/pages
   */
  async getPages(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { status, pageType, search } = req.query;

      const query = { organizationId };

      if (status) query.status = status;
      if (pageType) query.pageType = pageType;
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { slug: { $regex: search, $options: 'i' } }
        ];
      }

      const pages = await StorefrontPage.find(query)
        .select('name slug pageType status isPublished isHomepage viewCount updatedAt sectionsCount')
        .sort({ updatedAt: -1 })
        .lean();

      res.status(200).json({
        pages,
        total: pages.length
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Get single page by ID (admin)
   * Route: GET /admin/storefront/pages/:pageId
   */
  async getPageById(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { pageId } = req.params;

      const page = await StorefrontPage.findOne({
        _id: pageId,
        organizationId
      });

      if (!page) {
        return next(new AppError('Page not found', 404));
      }

      res.status(200).json({
        page
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Create new page
   * Route: POST /admin/storefront/pages
   */
  async createPage(req, res, next) {
    try {
      const { organizationId } = req.user;
      const {
        name,
        slug,
        pageType = 'custom',
        sections = [],
        seo = {},
        theme = {},
        isHomepage = false
      } = req.body;

      // Check if slug already exists
      const existingPage = await StorefrontPage.findOne({
        organizationId,
        slug
      });

      if (existingPage) {
        return next(new AppError('Page with this slug already exists', 400));
      }

      // Validate all sections
      for (const section of sections) {
        const validation = await SectionValidator.validateSection(section);
        if (!validation.valid) {
          return next(new AppError(`Invalid section: ${validation.error}`, 400));
        }
      }

      // Create page
      const page = new StorefrontPage({
        organizationId,
        name,
        slug,
        pageType,
        sections,
        seo,
        theme,
        isHomepage,
        status: 'draft'
      });

      await page.save();

      res.status(201).json({
        status: 'success',
        message: 'Page created successfully',
        page
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Update page
   * Route: PUT /admin/storefront/pages/:pageId
   */
  async updatePage(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { pageId } = req.params;
      const updateData = req.body;

      const page = await StorefrontPage.findOne({
        _id: pageId,
        organizationId
      });

      if (!page) {
        return next(new AppError('Page not found', 404));
      }

      // If updating sections, validate them
      if (updateData.sections) {
        for (const section of updateData.sections) {
          const validation = await SectionValidator.validateSection(section);
          if (!validation.valid) {
            return next(new AppError(`Invalid section: ${validation.error}`, 400));
          }
        }
      }

      // Update page
      Object.assign(page, updateData);
      page.version += 1;

      await page.save();

      res.status(200).json({
        status: 'success',
        message: 'Page updated successfully',
        page
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete page
   * Route: DELETE /admin/storefront/pages/:pageId
   */
  async deletePage(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { pageId } = req.params;

      const page = await StorefrontPage.findOne({
        _id: pageId,
        organizationId
      });

      if (!page) {
        return next(new AppError('Page not found', 404));
      }

      // Don't delete homepage
      if (page.isHomepage) {
        return next(new AppError('Cannot delete homepage. Set another page as homepage first.', 400));
      }

      await page.remove();

      res.status(200).json({
        status: 'success',
        message: 'Page deleted successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Publish page
   * Route: POST /admin/storefront/pages/:pageId/publish
   */
  async publishPage(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { pageId } = req.params;

      const page = await StorefrontPage.findOne({
        _id: pageId,
        organizationId
      });

      if (!page) {
        return next(new AppError('Page not found', 404));
      }

      page.status = 'published';
      page.isPublished = true;
      page.publishedAt = new Date();

      await page.save();

      res.status(200).json({
        status: 'success',
        message: 'Page published successfully',
        page: {
          id: page._id,
          name: page.name,
          slug: page.slug,
          isPublished: page.isPublished,
          publishedAt: page.publishedAt
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Unpublish page
   * Route: POST /admin/storefront/pages/:pageId/unpublish
   */
  async unpublishPage(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { pageId } = req.params;

      const page = await StorefrontPage.findOne({
        _id: pageId,
        organizationId
      });

      if (!page) {
        return next(new AppError('Page not found', 404));
      }

      page.status = 'draft';
      page.isPublished = false;

      await page.save();

      res.status(200).json({
        status: 'success',
        message: 'Page unpublished successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Duplicate page
   * Route: POST /admin/storefront/pages/:pageId/duplicate
   */
  async duplicatePage(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { pageId } = req.params;
      const { newSlug, newName } = req.body;

      const originalPage = await StorefrontPage.findOne({
        _id: pageId,
        organizationId
      });

      if (!originalPage) {
        return next(new AppError('Page not found', 404));
      }

      // Check if new slug exists
      const existingPage = await StorefrontPage.findOne({
        organizationId,
        slug: newSlug
      });

      if (existingPage) {
        return next(new AppError('Page with this slug already exists', 400));
      }

      // Create duplicate
      const duplicatePage = new StorefrontPage({
        organizationId,
        name: newName || `${originalPage.name} (Copy)`,
        slug: newSlug || `${originalPage.slug}-copy`,
        pageType: originalPage.pageType,
        sections: originalPage.sections,
        seo: originalPage.seo,
        theme: originalPage.theme,
        status: 'draft',
        isPublished: false,
        isHomepage: false,
        parentVersionId: originalPage._id
      });

      await duplicatePage.save();

      res.status(201).json({
        status: 'success',
        message: 'Page duplicated successfully',
        page: duplicatePage
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Get available section types
   * Route: GET /admin/storefront/sections
   */
  async getSectionTypes(req, res, next) {
    try {
      const sectionTypes = SectionRegistry.getSectionTypes(); // Make sure this service is imported correctly
      res.status(200).json({ sectionTypes });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get section templates
   * Route: GET /admin/storefront/templates
   */
  async getTemplates(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { sectionType, category } = req.query;

      const query = {
        $or: [
          { isPublic: true },
          { organizationId },
          { isSystemTemplate: true }
        ]
      };

      if (sectionType) query.sectionType = sectionType;
      if (category) query.category = category;

      const templates = await SectionTemplate.find(query)
        .sort({ usageCount: -1, createdAt: -1 })
        .lean();

      res.status(200).json({
        templates
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Get analytics for page
   * Route: GET /admin/storefront/pages/:pageId/analytics
   */
  async getPageAnalytics(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { pageId } = req.params;
      const { period = '7d' } = req.query; // 7d, 30d, 90d, 1y

      const page = await StorefrontPage.findOne({
        _id: pageId,
        organizationId
      }).select('viewCount lastViewedAt');

      if (!page) {
        return next(new AppError('Page not found', 404));
      }

      // Here you would typically fetch detailed analytics
      // For now, return basic stats
      const analytics = {
        views: {
          total: page.viewCount,
          last24h: 0, // Would come from analytics service
          last7d: 0,
          change: '+12%' // Example
        },
        engagement: {
          avgTimeOnPage: '2m 30s',
          bounceRate: '45%'
        },
        sections: {
          // Would track clicks/engagement per section
          mostEngaged: [],
          leastEngaged: []
        }
      };

      res.status(200).json({
        pageId,
        pageName: page.name,
        analytics,
        period
      });

    } catch (error) {
      next(error);
    }
  }
}


module.exports = new StorefrontAdminController();
