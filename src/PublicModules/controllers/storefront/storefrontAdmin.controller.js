const { StorefrontPage, SectionTemplate } = require('../../models/storefront');
const SectionRegistry = require('../../services/storefront/sectionRegistry.service');
const LayoutService = require('../../services/storefront/layout.service');
const { THEME_LIST } = require('../../utils/constants/storefront/themes.constants');
const AppError = require('../../../core/utils/api/appError');

class StorefrontAdminController {

  // ============================================================
  // 1. LAYOUT MANAGEMENT (Header, Footer, Global Settings)
  // ============================================================

  /**
   * Get Master Layout
   * Route: GET /admin/storefront/layout
   */
  async getLayout(req, res, next) {
    try {
      const { organizationId } = req.user;
      // Use Service Layer (Handles Cache & Default Creation)
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
   * Update Master Layout
   * Route: PUT /admin/storefront/layout
   */
  async updateLayout(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { header, footer, globalSettings } = req.body;

      // 1. Validate Header Sections
      if (header && Array.isArray(header)) {
        for (const section of header) {
          const validation = SectionRegistry.validateConfig(section.type, section.config);
          if (!validation.valid) {
            return next(new AppError(`Header Section Error (${section.type}): ${validation.error}`, 400));
          }
        }
      }

      // 2. Validate Footer Sections
      if (footer && Array.isArray(footer)) {
        for (const section of footer) {
          const validation = SectionRegistry.validateConfig(section.type, section.config);
          if (!validation.valid) {
            return next(new AppError(`Footer Section Error (${section.type}): ${validation.error}`, 400));
          }
        }
      }

      // 3. Update via Service (Handles Cache Invalidation)
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

  // ============================================================
  // 2. THEME REGISTRY
  // ============================================================

  /**
   * Get Available Themes
   * Route: GET /admin/storefront/themes
   */
  async getAvailableThemes(req, res, next) {
    try {
      res.status(200).json({
        status: 'success',
        results: THEME_LIST.length,
        data: {
          themes: THEME_LIST
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // ============================================================
  // 3. PAGE MANAGEMENT (CRUD)
  // ============================================================

  /**
   * Get all pages for organization
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
        .select('name slug pageType status isPublished isHomepage viewCount updatedAt sections')
        .sort({ isHomepage: -1, updatedAt: -1 })
        .lean();

      // Enriched response with section count
      const result = pages.map(p => ({
        ...p,
        sectionsCount: p.sections?.length || 0,
        sections: undefined // Don't send heavy payload in list view
      }));

      res.status(200).json({
        status: 'success',
        results: result.length,
        data: result
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Get single page by ID
   * Route: GET /admin/storefront/pages/:pageId
   */
  async getPageById(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { pageId } = req.params;

      const page = await StorefrontPage.findOne({ _id: pageId, organizationId });

      if (!page) {
        return next(new AppError('Page not found', 404));
      }

      res.status(200).json({
        status: 'success',
        data: page
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
        themeOverride = {},
        isHomepage = false
      } = req.body;

      // 1. Slug Uniqueness Check
      const existingPage = await StorefrontPage.findOne({ organizationId, slug });
      if (existingPage) {
        return next(new AppError(`Page with slug '${slug}' already exists`, 400));
      }

      // 2. Create Page
      const page = await StorefrontPage.create({
        organizationId,
        name,
        slug: slug.toLowerCase(),
        pageType,
        sections, // Empty array initially usually
        seo,
        themeOverride,
        isHomepage,
        status: 'draft'
      });

      res.status(201).json({
        status: 'success',
        message: 'Page created successfully',
        data: page
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Update page content (The Core Builder Save Endpoint)
   * Route: PUT /admin/storefront/pages/:pageId
   */
  async updatePage(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { pageId } = req.params;
      const updateData = req.body;

      // 1. Validate Sections if present
      if (updateData.sections && Array.isArray(updateData.sections)) {
        for (const section of updateData.sections) {
          const validation = SectionRegistry.validateConfig(section.type, section.config);
          if (!validation.valid) {
            return next(new AppError(`Section Error (${section.type}): ${validation.error}`, 400));
          }
        }
      }

      // 2. Find and Update
      const page = await StorefrontPage.findOneAndUpdate(
        { _id: pageId, organizationId },
        { 
          $set: updateData,
          $inc: { version: 1 } // Optimistic Locking / Versioning
        },
        { new: true, runValidators: true }
      );

      if (!page) return next(new AppError('Page not found', 404));

      res.status(200).json({
        status: 'success',
        message: 'Page saved',
        data: page
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

      const page = await StorefrontPage.findOne({ _id: pageId, organizationId });
      if (!page) return next(new AppError('Page not found', 404));

      if (page.isHomepage) {
        return next(new AppError('Cannot delete the active Homepage. Assign a new homepage first.', 400));
      }

      await page.deleteOne();

      res.status(200).json({
        status: 'success',
        message: 'Page deleted successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  // ============================================================
  // 4. UTILITIES (Publish, Duplicate, Registry, Analytics)
  // ============================================================

  async publishPage(req, res, next) {
    try {
      const { organizationId } = req.user;
      const page = await StorefrontPage.findOneAndUpdate(
        { _id: req.params.pageId, organizationId },
        { status: 'published', isPublished: true, publishedAt: new Date() },
        { new: true }
      );
      if (!page) return next(new AppError('Page not found', 404));

      res.status(200).json({ status: 'success', message: 'Page published live', data: page });
    } catch (error) {
      next(error);
    }
  }

  async unpublishPage(req, res, next) {
    try {
      const { organizationId } = req.user;
      const page = await StorefrontPage.findOneAndUpdate(
        { _id: req.params.pageId, organizationId },
        { status: 'draft', isPublished: false },
        { new: true }
      );
      if (!page) return next(new AppError('Page not found', 404));

      res.status(200).json({ status: 'success', message: 'Page unpublished', data: page });
    } catch (error) {
      next(error);
    }
  }

  async duplicatePage(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { newSlug, newName } = req.body;
      const original = await StorefrontPage.findOne({ _id: req.params.pageId, organizationId }).lean();

      if (!original) return next(new AppError('Page not found', 404));

      delete original._id;
      delete original.createdAt;
      delete original.updatedAt;
      delete original.__v;

      const newPage = await StorefrontPage.create({
        ...original,
        name: newName || `${original.name} (Copy)`,
        slug: newSlug || `${original.slug}-copy-${Date.now()}`,
        status: 'draft',
        isPublished: false,
        isHomepage: false,
        viewCount: 0
      });

      res.status(201).json({ status: 'success', message: 'Page duplicated', data: newPage });
    } catch (error) {
      next(error);
    }
  }

  async getSectionTypes(req, res, next) {
    try {
      const sectionTypes = SectionRegistry.getSectionTypes();
      res.status(200).json({ 
        status: 'success',
        results: sectionTypes.length,
        data: sectionTypes 
      });
    } catch (error) {
      next(error);
    }
  }

  async getTemplates(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { sectionType, category } = req.query;

      const query = {
        $or: [
          { isPublic: true },
          { organizationId }, // Own templates
          { isSystemTemplate: true }
        ]
      };

      if (sectionType) query.sectionType = sectionType;
      if (category) query.category = category;

      const templates = await SectionTemplate.find(query)
        .sort({ isSystemTemplate: -1, usageCount: -1 })
        .lean();

      res.status(200).json({ 
        status: 'success',
        data: templates 
      });
    } catch (error) {
      next(error);
    }
  }

  async getPageAnalytics(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { pageId } = req.params;
      const { period = '7d' } = req.query;

      const page = await StorefrontPage.findOne({ _id: pageId, organizationId })
        .select('viewCount lastViewedAt name');

      if (!page) return next(new AppError('Page not found', 404));

      const analytics = {
        views: {
          total: page.viewCount,
          last24h: 0, // Placeholder: Would integrate with real analytics service in future
          last7d: 0,
          change: '+0%'
        },
        engagement: {
          avgTimeOnPage: '0s', // Placeholder
          bounceRate: '0%'
        },
        sections: {
          mostEngaged: [],
          leastEngaged: []
        }
      };

      res.status(200).json({
        status: 'success',
        data: {
          pageId,
          pageName: page.name,
          analytics,
          period
        }
      });

    } catch (error) {
      next(error);
    }
  }
}

module.exports = new StorefrontAdminController();
