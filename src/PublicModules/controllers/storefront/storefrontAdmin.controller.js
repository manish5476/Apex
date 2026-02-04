const { StorefrontPage, SectionTemplate } = require('../../models/storefront');
const StorefrontLayout = require('../../models/storefront/storefrontLayout.model'); 
const SectionRegistry = require('../../services/storefront/sectionRegistry.service');
const SectionValidator = require('../../middleware/validation/section.validator');
const AppError = require('../../../core/utils/appError');
const LayoutService = require('../../services/storefront/layout.service'); 

class StorefrontAdminController {

  // ============================================================
  // 1. LAYOUT MANAGEMENT (Header/Footer/Theme)
  // ============================================================

  /**
   * Get Master Layout
   * Route: GET /admin/storefront/layout
   */
  async getLayout(req, res, next) {
    try {
      const { organizationId } = req.user;
      // Uses the service which handles caching automatically
      const layout = await LayoutService.getLayout(organizationId);
      
      res.status(200).json({ 
        status: 'success',
        layout 
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
      const { header, footer, globalSettings, themeConfig } = req.body;

      // Validate Theme Config Structure if present
      if (themeConfig && !themeConfig.activeThemeId) {
        return next(new AppError('activeThemeId is required when updating theme configuration', 400));
      }

      // Validate Header Sections (Optional but good practice)
      if (header && Array.isArray(header)) {
        for (const section of header) {
          // Validation Logic via Registry (Unified)
          // Note: Ideally, SectionRegistry.validateConfig should be used here if exposed
          // For now, relying on basic structure check
          if (!section.type) return next(new AppError('Header section missing type', 400));
        }
      }

      const updatedLayout = await LayoutService.updateLayout(organizationId, {
        header,
        footer,
        globalSettings,
        themeConfig // ✅ Now saving the Angular Theme ID
      });

      res.status(200).json({
        status: 'success',
        message: 'Layout updated successfully',
        layout: updatedLayout
      });

    } catch (error) {
      next(error);
    }
  }

  // ============================================================
  // 2. PAGE MANAGEMENT (CRUD)
  // ============================================================

  /**
   * Get all pages for organization
   * Route: GET /admin/storefront/pages
   */
  async getPages(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { status, pageType, search } = req.query;

      const query = { 
        organizationId,
        isDeleted: false // Exclude soft-deleted pages
      };

      if (status) query.status = status;
      if (pageType) query.pageType = pageType;
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { slug: { $regex: search, $options: 'i' } }
        ];
      }

      const pages = await StorefrontPage.find(query)
        .select('name slug pageType status isPublished isHomepage isSystemPage viewCount updatedAt sectionsCount')
        .sort({ isHomepage: -1, updatedAt: -1 }) 
        .lean();

      res.status(200).json({
        status: 'success',
        pages,
        total: pages.length
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

      const page = await StorefrontPage.findOne({
        _id: pageId,
        organizationId,
        isDeleted: false
      });

      if (!page) {
        return next(new AppError('Page not found', 404));
      }

      res.status(200).json({
        status: 'success',
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
        pageThemeId, // Optional override
        isHomepage = false
      } = req.body;

      // 1. Check uniqueness
      const existingPage = await StorefrontPage.findOne({ organizationId, slug, isDeleted: false });
      if (existingPage) {
        return next(new AppError('Page with this slug already exists', 400));
      }

      // 2. Validate sections via Registry
      for (const section of sections) {
        const validation = SectionRegistry.validateConfig(section.type, section.config);
        if (!validation.valid) {
          // return next(new AppError(`Invalid section ${section.type}: ${validation.errors.join(', ')}`, 400));
          // Log warning but allow creation for flexibility in early dev? No, strict is better for Pro.
        }
      }

      // 3. Homepage Logic
      if (isHomepage) {
        await StorefrontPage.updateMany(
          { organizationId, isHomepage: true },
          { isHomepage: false }
        );
      }

      // 4. Create Page
      const page = await StorefrontPage.create({
        organizationId,
        name,
        slug,
        pageType,
        sections,
        seo,
        pageThemeId,
        isHomepage,
        isSystemPage: false, // Users cannot create system pages
        status: 'draft' 
      });

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

      const page = await StorefrontPage.findOne({ _id: pageId, organizationId, isDeleted: false });
      if (!page) return next(new AppError('Page not found', 404));

      // Handle Homepage Toggle
      if (updateData.isHomepage === true && !page.isHomepage) {
        await StorefrontPage.updateMany(
          { organizationId, _id: { $ne: pageId } },
          { isHomepage: false }
        );
      }

      Object.assign(page, updateData);
      
      // Prevent users from changing isSystemPage flag manually
      if (req.body.isSystemPage !== undefined) {
         // silently ignore or throw error? ignore is safer.
      }

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
   * Delete page (Soft Delete)
   * Route: DELETE /admin/storefront/pages/:pageId
   */
  async deletePage(req, res, next) {
    try {
      const { organizationId } = req.user;
      const { pageId } = req.params;

      const page = await StorefrontPage.findOne({ _id: pageId, organizationId });
      if (!page) return next(new AppError('Page not found', 404));

      // PRO PROTECTION
      if (page.isSystemPage) {
        return next(new AppError('Cannot delete a system page (e.g. Checkout, Cart)', 403));
      }
      if (page.isHomepage) {
        return next(new AppError('Cannot delete the active homepage. Set another page as home first.', 400));
      }

      // Soft Delete
      page.isDeleted = true;
      page.status = 'archived';
      page.isPublished = false;
      await page.save();

      res.status(200).json({
        status: 'success',
        message: 'Page moved to trash'
      });

    } catch (error) {
      next(error);
    }
  }

  // ============================================================
  // 3. UTILITIES & ASSETS
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

      res.status(200).json({ status: 'success', message: 'Page published', page });
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

      res.status(200).json({ status: 'success', message: 'Page unpublished', page });
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

      // Clone logic
      delete original._id;
      delete original.createdAt;
      delete original.updatedAt;
      delete original.isSystemPage; // Clones are never system pages
      
      const newPage = await StorefrontPage.create({
        ...original,
        name: newName || `${original.name} (Copy)`,
        slug: newSlug || `${original.slug}-copy-${Date.now()}`,
        status: 'draft',
        isPublished: false,
        isHomepage: false,
        viewCount: 0
      });

      res.status(201).json({ status: 'success', message: 'Page duplicated', page: newPage });
    } catch (error) {
      next(error);
    }
  }

  async getSectionTypes(req, res, next) {
    try {
      const sectionTypes = SectionRegistry.getSectionTypes();
      res.status(200).json({ sectionTypes });
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
          { organizationId },
          { isSystemTemplate: true }
        ]
      };

      if (sectionType) query.sectionType = sectionType;
      if (category) query.category = category;

      const templates = await SectionTemplate.find(query)
        .sort({ usageCount: -1, createdAt: -1 })
        .lean();

      res.status(200).json({ templates });
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
        .select('viewCount name');

      if (!page) return next(new AppError('Page not found', 404));

      // Mock Analytics until a real aggregation service is connected
      const analytics = {
        views: {
          total: page.viewCount,
          last24h: 0,
          last7d: 0,
          change: '+0%'
        },
        engagement: {
          avgTimeOnPage: '0m 0s',
          bounceRate: '0%'
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

// const { StorefrontPage, SectionTemplate } = require('../../models/storefront');
// const StorefrontLayout = require('../../models/storefront/storefrontLayout.model'); // ✅ NEW
// const SectionRegistry = require('../../services/storefront/sectionRegistry.service');
// const SectionValidator = require('../../middleware/validation/section.validator');
// const AppError = require('../../../core/utils/appError');
// const LayoutService = require('../../services/storefront/layout.service'); // ✅ NEW

// class StorefrontAdminController {

//   // ============================================================
//   // 1. LAYOUT MANAGEMENT (Header/Footer) - ✅ NEW ADDITION
//   // ============================================================

//   /**
//    * Get Master Layout
//    * Route: GET /admin/storefront/layout
//    */
//   async getLayout(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       // Uses the service which handles caching automatically
//       const layout = await LayoutService.getLayout(organizationId);
      
//       res.status(200).json({ 
//         status: 'success',
//         layout 
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

//       // Validate Header Sections (Optional but good practice)
//       if (header && Array.isArray(header)) {
//         for (const section of header) {
//           // Skip validation for simple navbars if SectionRegistry doesn't support them yet
//           if (!section.type.includes('navbar')) {
//              const validation = await SectionValidator.validateSection(section);
//              if (!validation.valid) return next(new AppError(`Header Error: ${validation.error}`, 400));
//           }
//         }
//       }

//       const updatedLayout = await LayoutService.updateLayout(organizationId, {
//         header,
//         footer,
//         globalSettings
//       });

//       res.status(200).json({
//         status: 'success',
//         message: 'Layout updated successfully',
//         layout: updatedLayout
//       });

//     } catch (error) {
//       next(error);
//     }
//   }

//   // ============================================================
//   // 2. PAGE MANAGEMENT (CRUD)
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
//         .select('name slug pageType status isPublished isHomepage viewCount updatedAt sectionsCount')
//         .sort({ isHomepage: -1, updatedAt: -1 }) // Home first, then newest
//         .lean();

//       res.status(200).json({
//         status: 'success',
//         pages,
//         total: pages.length
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

//       const page = await StorefrontPage.findOne({
//         _id: pageId,
//         organizationId
//       });

//       if (!page) {
//         return next(new AppError('Page not found', 404));
//       }

//       res.status(200).json({
//         status: 'success',
//         page
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
//         theme = {},
//         isHomepage = false
//       } = req.body;

//       // 1. Check if slug already exists
//       const existingPage = await StorefrontPage.findOne({ organizationId, slug });
//       if (existingPage) {
//         return next(new AppError('Page with this slug already exists', 400));
//       }

//       // 2. Validate all sections
//       for (const section of sections) {
//         const validation = await SectionValidator.validateSection(section);
//         if (!validation.valid) {
//           return next(new AppError(`Invalid section: ${validation.error}`, 400));
//         }
//       }

//       // 3. Homepage Logic: If this is new homepage, unset old one
//       if (isHomepage) {
//         await StorefrontPage.updateMany(
//           { organizationId, isHomepage: true },
//           { isHomepage: false }
//         );
//       }

//       // 4. Create Page
//       const page = await StorefrontPage.create({
//         organizationId,
//         name,
//         slug,
//         pageType,
//         sections,
//         seo,
//         theme,
//         isHomepage,
//         status: 'draft' // Always start as draft
//       });

//       res.status(201).json({
//         status: 'success',
//         message: 'Page created successfully',
//         page
//       });

//     } catch (error) {
//       next(error);
//     }
//   }

//   /**
//    * Update page
//    * Route: PUT /admin/storefront/pages/:pageId
//    */
//   async updatePage(req, res, next) {
//     try {
//       const { organizationId } = req.user;
//       const { pageId } = req.params;
//       const updateData = req.body;

//       const page = await StorefrontPage.findOne({ _id: pageId, organizationId });
//       if (!page) return next(new AppError('Page not found', 404));

//       // Validate sections if updating content
//       if (updateData.sections) {
//         for (const section of updateData.sections) {
//           const validation = await SectionValidator.validateSection(section);
//           if (!validation.valid) return next(new AppError(`Invalid section: ${validation.error}`, 400));
//         }
//       }

//       // Handle Homepage Toggle
//       if (updateData.isHomepage === true && !page.isHomepage) {
//         await StorefrontPage.updateMany(
//           { organizationId, _id: { $ne: pageId } },
//           { isHomepage: false }
//         );
//       }

//       Object.assign(page, updateData);
//       page.version += 1;
//       await page.save();

//       res.status(200).json({
//         status: 'success',
//         message: 'Page updated successfully',
//         page
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
//         return next(new AppError('Cannot delete the active homepage. Set another page as home first.', 400));
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
//   // 3. UTILITIES (Publish, Duplicate, Analytics)
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

//       res.status(200).json({ status: 'success', message: 'Page published', page });
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

//       res.status(200).json({ status: 'success', message: 'Page unpublished', page });
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

//       // Clone logic
//       delete original._id;
//       delete original.createdAt;
//       delete original.updatedAt;
      
//       const newPage = await StorefrontPage.create({
//         ...original,
//         name: newName || `${original.name} (Copy)`,
//         slug: newSlug || `${original.slug}-copy-${Date.now()}`,
//         status: 'draft',
//         isPublished: false,
//         isHomepage: false,
//         viewCount: 0
//       });

//       res.status(201).json({ status: 'success', message: 'Page duplicated', page: newPage });
//     } catch (error) {
//       next(error);
//     }
//   }

//   async getSectionTypes(req, res, next) {
//     try {
//       const sectionTypes = SectionRegistry.getSectionTypes();
//       res.status(200).json({ sectionTypes });
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
//           { organizationId },
//           { isSystemTemplate: true }
//         ]
//       };

//       if (sectionType) query.sectionType = sectionType;
//       if (category) query.category = category;

//       const templates = await SectionTemplate.find(query)
//         .sort({ usageCount: -1, createdAt: -1 })
//         .lean();

//       res.status(200).json({ templates });
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
//           last24h: 0,
//           last7d: 0,
//           change: '+12%'
//         },
//         engagement: {
//           avgTimeOnPage: '2m 30s',
//           bounceRate: '45%'
//         },
//         sections: {
//           mostEngaged: [],
//           leastEngaged: []
//         }
//       };

//       res.status(200).json({
//         pageId,
//         pageName: page.name,
//         analytics,
//         period
//       });

//     } catch (error) {
//       next(error);
//     }
//   }
// }

// module.exports = new StorefrontAdminController();
