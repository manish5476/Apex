/**
 * StorefrontAdminController
 *
 * Full page management for the visual page builder.
 *
 * Routes:
 *   GET    /admin/storefront/pages
 *   POST   /admin/storefront/pages
 *   GET    /admin/storefront/pages/:pageId
 *   PUT    /admin/storefront/pages/:pageId
 *   DELETE /admin/storefront/pages/:pageId
 *
 *   POST   /admin/storefront/pages/:pageId/publish
 *   POST   /admin/storefront/pages/:pageId/unpublish
 *   POST   /admin/storefront/pages/:pageId/duplicate
 *
 *   GET    /admin/storefront/section-types
 *   GET    /admin/storefront/templates
 *   GET    /admin/storefront/themes
 *   GET    /admin/storefront/pages/:pageId/analytics
 */

'use strict';

const { StorefrontPage, SectionTemplate } = require('../../models/storefront/index');
const SectionRegistry  = require('../../services/storefront/sectionRegistry.service');
const SectionValidator = require('../../middleware/validation/section.validator');
const AppError         = require('../../../core/utils/api/appError');
const { THEME_LIST }   = require('../../utils/constants/storefront/themes.constants');

class StorefrontAdminController {

  // ---------------------------------------------------------------------------
  // LIST pages
  // GET /admin/storefront/pages
  // ---------------------------------------------------------------------------

  getPages = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { status, pageType, search, page = 1, limit = 20 } = req.query;

      const query = { organizationId };
      if (status)   query.status   = status;
      if (pageType) query.pageType = pageType;
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { slug: { $regex: search, $options: 'i' } }
        ];
      }

      const skip  = (Math.max(parseInt(page), 1) - 1) * Math.min(parseInt(limit), 50);
      const total = await StorefrontPage.countDocuments(query);

      const pages = await StorefrontPage.find(query)
        .select('name slug pageType status isPublished isHomepage viewCount updatedAt sections')
        .sort({ isHomepage: -1, updatedAt: -1 })
        .skip(skip)
        .limit(Math.min(parseInt(limit), 50))
        .lean();

      res.status(200).json({
        status:  'success',
        results: pages.length,
        total,
        data: pages.map(p => ({
          ...p,
          sectionsCount: p.sections?.length ?? 0,
          sections:      undefined // Omit heavy payload in list view
        }))
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // GET single page
  // GET /admin/storefront/pages/:pageId
  // ---------------------------------------------------------------------------

  getPageById = async (req, res, next) => {
    try {
      const { organizationId }   = req.user;
      const { pageId }           = req.params;

      const page = await StorefrontPage.findOne({ _id: pageId, organizationId });
      if (!page) return next(new AppError('Page not found', 404));

      res.status(200).json({ status: 'success', data: page });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // CREATE page
  // POST /admin/storefront/pages
  // ---------------------------------------------------------------------------

  createPage = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const {
        name, slug, pageType = 'custom',
        sections = [], seo = {},
        themeOverride = {}, isHomepage = false
      } = req.body;

      if (!name || !slug) {
        return next(new AppError('"name" and "slug" are required', 400));
      }

      // Slug format check
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return next(new AppError('Slug may only contain lowercase letters, numbers, and hyphens', 400));
      }

      // Slug uniqueness
      const exists = await StorefrontPage.findOne({ organizationId, slug: slug.toLowerCase() });
      if (exists) {
        return next(new AppError(`A page with slug "${slug}" already exists`, 409));
      }

      // Validate sections if provided
      if (sections.length > 0) {
        const result = SectionValidator.validateSections(sections);
        if (!result.valid) {
          return next(new AppError(`Section validation failed:\n${result.errors.join('\n')}`, 400));
        }
      }

      const page = await StorefrontPage.create({
        organizationId,
        name,
        slug:         slug.toLowerCase(),
        pageType,
        sections,
        seo,
        themeOverride,
        isHomepage,
        status:       'draft',
        createdBy:    req.user._id
      });

      res.status(201).json({
        status:  'success',
        message: 'Page created',
        data:    page
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // UPDATE page (the core builder save endpoint)
  // PUT /admin/storefront/pages/:pageId
  // ---------------------------------------------------------------------------

  updatePage = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { pageId }         = req.params;
      const updateData         = { ...req.body };

      // Prevent direct status/publish manipulation through this endpoint
      // (use /publish and /unpublish endpoints instead)
      delete updateData.status;
      delete updateData.isPublished;
      delete updateData.publishedAt;
      delete updateData.organizationId; // Never allow org change

      // Validate sections if they're being updated
      if (updateData.sections !== undefined) {
        if (!Array.isArray(updateData.sections)) {
          return next(new AppError('"sections" must be an array', 400));
        }
        const result = SectionValidator.validateSections(updateData.sections);
        if (!result.valid) {
          return next(new AppError(`Section validation failed:\n${result.errors.join('\n')}`, 400));
        }
      }

      // Validate slug uniqueness if being changed
      if (updateData.slug) {
        updateData.slug = updateData.slug.toLowerCase();
        if (!/^[a-z0-9-]+$/.test(updateData.slug)) {
          return next(new AppError('Slug may only contain lowercase letters, numbers, and hyphens', 400));
        }
        const conflict = await StorefrontPage.findOne({
          organizationId,
          slug: updateData.slug,
          _id:  { $ne: pageId }
        });
        if (conflict) {
          return next(new AppError(`Slug "${updateData.slug}" is already used by another page`, 409));
        }
      }

      const page = await StorefrontPage.findOneAndUpdate(
        { _id: pageId, organizationId },
        { $set: updateData, $inc: { version: 1 } },
        { new: true, runValidators: true }
      );

      if (!page) return next(new AppError('Page not found', 404));

      res.status(200).json({
        status:  'success',
        message: 'Page saved',
        data:    page
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // DELETE page
  // DELETE /admin/storefront/pages/:pageId
  // ---------------------------------------------------------------------------

  deletePage = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { pageId }         = req.params;

      const page = await StorefrontPage.findOne({ _id: pageId, organizationId });
      if (!page) return next(new AppError('Page not found', 404));

      if (page.isHomepage) {
        return next(new AppError(
          'Cannot delete the active homepage. Assign a different page as homepage first.',
          400
        ));
      }

      if (page.status === 'published') {
        return next(new AppError(
          'Unpublish this page before deleting it.',
          400
        ));
      }

      await page.deleteOne();

      res.status(200).json({ status: 'success', message: 'Page deleted' });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // PUBLISH
  // POST /admin/storefront/pages/:pageId/publish
  // ---------------------------------------------------------------------------

  publishPage = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { pageId }         = req.params;

      const page = await StorefrontPage.findOneAndUpdate(
        { _id: pageId, organizationId },
        { status: 'published', isPublished: true, publishedAt: new Date() },
        { new: true }
      );
      if (!page) return next(new AppError('Page not found', 404));

      res.status(200).json({ status: 'success', message: 'Page is now live', data: page });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // UNPUBLISH
  // POST /admin/storefront/pages/:pageId/unpublish
  // ---------------------------------------------------------------------------

  unpublishPage = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { pageId }         = req.params;

      const page = await StorefrontPage.findOneAndUpdate(
        { _id: pageId, organizationId },
        { status: 'draft', isPublished: false },
        { new: true }
      );
      if (!page) return next(new AppError('Page not found', 404));

      res.status(200).json({ status: 'success', message: 'Page unpublished', data: page });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // SET HOMEPAGE
  // POST /admin/storefront/pages/:pageId/set-homepage
  // ---------------------------------------------------------------------------

  setHomepage = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { pageId }         = req.params;

      const page = await StorefrontPage.findOne({ _id: pageId, organizationId });
      if (!page) return next(new AppError('Page not found', 404));

      if (page.status !== 'published') {
        return next(new AppError('Only published pages can be set as homepage', 400));
      }

      // The pre-save hook on StorefrontPage handles clearing isHomepage on others
      page.isHomepage = true;
      await page.save();

      res.status(200).json({ status: 'success', message: 'Homepage updated', data: page });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // DUPLICATE
  // POST /admin/storefront/pages/:pageId/duplicate
  // ---------------------------------------------------------------------------

  duplicatePage = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { pageId }         = req.params;
      const { newSlug, newName } = req.body;

      const original = await StorefrontPage.findOne({ _id: pageId, organizationId }).lean();
      if (!original) return next(new AppError('Page not found', 404));

      // Generate unique slug if not provided
      const baseSlug  = newSlug ?? `${original.slug}-copy`;
      const finalSlug = await this._uniqueSlug(organizationId, baseSlug);

      const { _id, createdAt, updatedAt, __v, ...rest } = original;

      const newPage = await StorefrontPage.create({
        ...rest,
        organizationId,
        name:        newName ?? `${original.name} (Copy)`,
        slug:        finalSlug,
        status:      'draft',
        isPublished: false,
        isHomepage:  false,
        publishedAt: null,
        viewCount:   0,
        version:     1,
        createdBy:   req.user._id
      });

      res.status(201).json({ status: 'success', message: 'Page duplicated', data: newPage });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // SECTION TYPES catalogue (drives the page builder sidebar)
  // GET /admin/storefront/section-types
  // ---------------------------------------------------------------------------

  getSectionTypes = async (req, res, next) => {
    try {
      const { includeSystem = 'false' } = req.query;
      let types = SectionRegistry.getSectionTypes();

      if (includeSystem !== 'true') {
        types = types.filter(t => !t.isSystem);
      }

      res.status(200).json({
        status:  'success',
        results: types.length,
        data:    types
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // TEMPLATES
  // GET /admin/storefront/templates
  // ---------------------------------------------------------------------------

  getTemplates = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { sectionType, category } = req.query;

      const query = {
        $or: [
          { isPublic: true },
          { isSystemTemplate: true },
          { organizationId }
        ]
      };
      if (sectionType) query.sectionType = sectionType;
      if (category)    query.category    = category;

      const templates = await SectionTemplate.find(query)
        .sort({ isSystemTemplate: -1, usageCount: -1 })
        .lean();

      res.status(200).json({ status: 'success', results: templates.length, data: templates });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // THEMES
  // GET /admin/storefront/themes
  // ---------------------------------------------------------------------------

  getAvailableThemes = async (req, res, next) => {
    try {
      res.status(200).json({
        status:  'success',
        results: THEME_LIST.length,
        data:    { themes: THEME_LIST }
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // PAGE ANALYTICS
  // GET /admin/storefront/pages/:pageId/analytics
  // ---------------------------------------------------------------------------

  getPageAnalytics = async (req, res, next) => {
    try {
      const { organizationId } = req.user;
      const { pageId }         = req.params;

      const page = await StorefrontPage.findOne({ _id: pageId, organizationId })
        .select('name viewCount lastViewedAt status');
      if (!page) return next(new AppError('Page not found', 404));

      res.status(200).json({
        status: 'success',
        data: {
          pageId,
          pageName:    page.name,
          pageStatus:  page.status,
          views: {
            total:       page.viewCount,
            lastViewedAt:page.lastViewedAt ?? null
          }
          // Wire to real analytics service here when available
        }
      });
    } catch (err) {
      next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  async _uniqueSlug(organizationId, base) {
    let slug    = base;
    let attempt = 0;
    while (await StorefrontPage.exists({ organizationId, slug })) {
      attempt++;
      slug = `${base}-${attempt}`;
    }
    return slug;
  }
}

module.exports = new StorefrontAdminController();



// const { StorefrontPage, SectionTemplate } = require('../../models/storefront');
// const SectionRegistry = require('../../services/storefront/sectionRegistry.service');
// const LayoutService = require('../../services/storefront/layout.service');
// const { THEME_LIST } = require('../../utils/constants/storefront/themes.constants');
// const AppError = require('../../../core/utils/api/appError');

// class StorefrontAdminController {

//   // ============================================================
//   // 1. LAYOUT MANAGEMENT (Header, Footer, Global Settings)
//   // ============================================================

//   /**
//    * Get Master Layout
//    * Route: GET /admin/storefront/layout
//    */
//   async getLayout(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       // Use Service Layer (Handles Cache & Default Creation)
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
//    * Update Master Layout
//    * Route: PUT /admin/storefront/layout
//    */
//   async updateLayout(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const { header, footer, globalSettings } = req.body;

//       // 1. Validate Header Sections
//       if (header && Array.isArray(header)) {
//         for (const section of header) {
//           const validation = SectionRegistry.validateConfig(section.type, section.config);
//           if (!validation.valid) {
//             return next(new AppError(`Header Section Error (${section.type}): ${validation.error}`, 400));
//           }
//         }
//       }

//       // 2. Validate Footer Sections
//       if (footer && Array.isArray(footer)) {
//         for (const section of footer) {
//           const validation = SectionRegistry.validateConfig(section.type, section.config);
//           if (!validation.valid) {
//             return next(new AppError(`Footer Section Error (${section.type}): ${validation.error}`, 400));
//           }
//         }
//       }

//       // 3. Update via Service (Handles Cache Invalidation)
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

//   // ============================================================
//   // 2. THEME REGISTRY
//   // ============================================================

//   /**
//    * Get Available Themes
//    * Route: GET /admin/storefront/themes
//    */
//   async getAvailableThemes(req, res, next) {
//     try {
//       res.status(200).json({
//         status: 'success',
//         results: THEME_LIST.length,
//         data: {
//           themes: THEME_LIST
//         }
//       });
//     } catch (error) {
//       next(error);
//     }
//   }

//   // ============================================================
//   // 3. PAGE MANAGEMENT (CRUD)
//   // ============================================================

//   /**
//    * Get all pages for organization
//    * Route: GET /admin/storefront/pages
//    */
//   async getPages(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const { status, pageType, search } = req.query;

//       const query = { organizationId };

//       if (status) query.status = status;
//       if (pageType) query.pageType = pageType;
//       if (search) {
//         query.$or = [
//           { name: { $regex: search, $options: 'i' } },
//           { slug: { $regex: search, $options: 'i' } }
//         ];
//       }

//       const pages = await StorefrontPage.find(query)
//         .select('name slug pageType status isPublished isHomepage viewCount updatedAt sections')
//         .sort({ isHomepage: -1, updatedAt: -1 })
//         .lean();

//       // Enriched response with section count
//       const result = pages.map(p => ({
//         ...p,
//         sectionsCount: p.sections?.length || 0,
//         sections: undefined // Don't send heavy payload in list view
//       }));

//       res.status(200).json({
//         status: 'success',
//         results: result.length,
//         data: result
//       });

//     } catch (error) {
//       next(error);
//     }
//   }

//   /**
//    * Get single page by ID
//    * Route: GET /admin/storefront/pages/:pageId
//    */
//   async getPageById(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const { pageId } = req.params;

//       const page = await StorefrontPage.findOne({ _id: pageId, organizationId });

//       if (!page) {
//         return next(new AppError('Page not found', 404));
//       }

//       res.status(200).json({
//         status: 'success',
//         data: page
//       });

//     } catch (error) {
//       next(error);
//     }
//   }

//   /**
//    * Create new page
//    * Route: POST /admin/storefront/pages
//    */
//   async createPage(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const {
//         name,
//         slug,
//         pageType = 'custom',
//         sections = [],
//         seo = {},
//         themeOverride = {},
//         isHomepage = false
//       } = req.body;

//       // 1. Slug Uniqueness Check
//       const existingPage = await StorefrontPage.findOne({ organizationId, slug });
//       if (existingPage) {
//         return next(new AppError(`Page with slug '${slug}' already exists`, 400));
//       }

//       // 2. Create Page
//       const page = await StorefrontPage.create({
//         organizationId,
//         name,
//         slug: slug.toLowerCase(),
//         pageType,
//         sections, // Empty array initially usually
//         seo,
//         themeOverride,
//         isHomepage,
//         status: 'draft'
//       });

//       res.status(201).json({
//         status: 'success',
//         message: 'Page created successfully',
//         data: page
//       });

//     } catch (error) {
//       next(error);
//     }
//   }

//   /**
//    * Update page content (The Core Builder Save Endpoint)
//    * Route: PUT /admin/storefront/pages/:pageId
//    */
//   async updatePage(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const { pageId } = req.params;
//       const updateData = req.body;

//       // 1. Validate Sections if present
//       if (updateData.sections && Array.isArray(updateData.sections)) {
//         for (const section of updateData.sections) {
//           const validation = SectionRegistry.validateConfig(section.type, section.config);
//           if (!validation.valid) {
//             return next(new AppError(`Section Error (${section.type}): ${validation.error}`, 400));
//           }
//         }
//       }

//       // 2. Find and Update
//       const page = await StorefrontPage.findOneAndUpdate(
//         { _id: pageId, organizationId },
//         { 
//           $set: updateData,
//           $inc: { version: 1 } // Optimistic Locking / Versioning
//         },
//         { new: true, runValidators: true }
//       );

//       if (!page) return next(new AppError('Page not found', 404));

//       res.status(200).json({
//         status: 'success',
//         message: 'Page saved',
//         data: page
//       });

//     } catch (error) {
//       next(error);
//     }
//   }

//   /**
//    * Delete page
//    * Route: DELETE /admin/storefront/pages/:pageId
//    */
//   async deletePage(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const { pageId } = req.params;

//       const page = await StorefrontPage.findOne({ _id: pageId, organizationId });
//       if (!page) return next(new AppError('Page not found', 404));

//       if (page.isHomepage) {
//         return next(new AppError('Cannot delete the active Homepage. Assign a new homepage first.', 400));
//       }

//       await page.deleteOne();

//       res.status(200).json({
//         status: 'success',
//         message: 'Page deleted successfully'
//       });

//     } catch (error) {
//       next(error);
//     }
//   }

//   // ============================================================
//   // 4. UTILITIES (Publish, Duplicate, Registry, Analytics)
//   // ============================================================

//   async publishPage(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const page = await StorefrontPage.findOneAndUpdate(
//         { _id: req.params.pageId, organizationId },
//         { status: 'published', isPublished: true, publishedAt: new Date() },
//         { new: true }
//       );
//       if (!page) return next(new AppError('Page not found', 404));

//       res.status(200).json({ status: 'success', message: 'Page published live', data: page });
//     } catch (error) {
//       next(error);
//     }
//   }

//   async unpublishPage(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const page = await StorefrontPage.findOneAndUpdate(
//         { _id: req.params.pageId, organizationId },
//         { status: 'draft', isPublished: false },
//         { new: true }
//       );
//       if (!page) return next(new AppError('Page not found', 404));

//       res.status(200).json({ status: 'success', message: 'Page unpublished', data: page });
//     } catch (error) {
//       next(error);
//     }
//   }

//   async duplicatePage(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const { newSlug, newName } = req.body;
//       const original = await StorefrontPage.findOne({ _id: req.params.pageId, organizationId }).lean();

//       if (!original) return next(new AppError('Page not found', 404));

//       delete original._id;
//       delete original.createdAt;
//       delete original.updatedAt;
//       delete original.__v;

//       const newPage = await StorefrontPage.create({
//         ...original,
//         name: newName || `${original.name} (Copy)`,
//         slug: newSlug || `${original.slug}-copy-${Date.now()}`,
//         status: 'draft',
//         isPublished: false,
//         isHomepage: false,
//         viewCount: 0
//       });

//       res.status(201).json({ status: 'success', message: 'Page duplicated', data: newPage });
//     } catch (error) {
//       next(error);
//     }
//   }

//   async getSectionTypes(req, res, next) {
//     try {
//       const sectionTypes = SectionRegistry.getSectionTypes();
//       res.status(200).json({ 
//         status: 'success',
//         results: sectionTypes.length,
//         data: sectionTypes 
//       });
//     } catch (error) {
//       next(error);
//     }
//   }

//   async getTemplates(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const { sectionType, category } = req.query;

//       const query = {
//         $or: [
//           { isPublic: true },
//           { organizationId }, // Own templates
//           { isSystemTemplate: true }
//         ]
//       };

//       if (sectionType) query.sectionType = sectionType;
//       if (category) query.category = category;

//       const templates = await SectionTemplate.find(query)
//         .sort({ isSystemTemplate: -1, usageCount: -1 })
//         .lean();

//       res.status(200).json({ 
//         status: 'success',
//         data: templates 
//       });
//     } catch (error) {
//       next(error);
//     }
//   }

//   async getPageAnalytics(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const { pageId } = req.params;
//       const { period = '7d' } = req.query;

//       const page = await StorefrontPage.findOne({ _id: pageId, organizationId })
//         .select('viewCount lastViewedAt name');

//       if (!page) return next(new AppError('Page not found', 404));

//       const analytics = {
//         views: {
//           total: page.viewCount,
//           last24h: 0, // Placeholder: Would integrate with real analytics service in future
//           last7d: 0,
//           change: '+0%'
//         },
//         engagement: {
//           avgTimeOnPage: '0s', // Placeholder
//           bounceRate: '0%'
//         },
//         sections: {
//           mostEngaged: [],
//           leastEngaged: []
//         }
//       };

//       res.status(200).json({
//         status: 'success',
//         data: {
//           pageId,
//           pageName: page.name,
//           analytics,
//           period
//         }
//       });

//     } catch (error) {
//       next(error);
//     }
//   }
// }

// module.exports = new StorefrontAdminController();
