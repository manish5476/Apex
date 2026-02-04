const { StorefrontPage } = require('../../models/storefront');
const LayoutService = require('../../services/storefront/layout.service');
const Organization = require('../../../modules/organization/core/organization.model');
const DataHydrationService = require('../../services/storefront/dataHydration.service'); // The wrapper for our Resolvers
const AppError = require('../../../core/utils/appError');

class StorefrontPublicController {

  /**
   * ============================================================
   * GET PUBLIC PAGE
   * Route: GET /public/:organizationSlug/:pageSlug
   * ============================================================
   */
  getPublicPage = async (req, res, next) => {
    try {
      const { organizationSlug, pageSlug } = req.params;
      const start = Date.now();

      // 1. Resolve Organization (Lean & Fast)
      const organization = await Organization.findOne({
        uniqueShopId: organizationSlug.toUpperCase(),
        isActive: true
      }).select('_id name uniqueShopId settings primaryEmail primaryPhone logo');

      if (!organization) {
        return next(new AppError('Store not found', 404));
      }

      // 2. Fetch Page & Layout CONCURRENTLY
      const [pageData, layoutData] = await Promise.all([
        this.findPage(organization._id, pageSlug),
        LayoutService.getLayout(organization._id)
      ]);

      if (!pageData) {
        return next(new AppError('Page not found', 404));
      }

      // 3. Hydrate Sections (The "Pro" Safety Net)
      // We use the Service which internally uses Promise.allSettled
      const [hydratedHeader, hydratedBody, hydratedFooter] = await Promise.all([
        DataHydrationService.hydrateSections(layoutData.header, organization._id),
        DataHydrationService.hydrateSections(pageData.sections, organization._id),
        DataHydrationService.hydrateSections(layoutData.footer, organization._id)
      ]);

      // 4. THEME LOGIC (Merging Global + Page Specific)
      // If the page has a specific theme (e.g. Dark Landing Page), it overrides the global one
      const effectiveThemeId = pageData.pageThemeId || layoutData.themeConfig.activeThemeId;
      
      const themeResponse = {
        id: effectiveThemeId,
        mode: layoutData.themeConfig.mode,
        overrides: layoutData.themeConfig.overrides || {}
      };

      // 5. Analytics (Fire & Forget - Don't await)
      // In a real Pro app, push this to a queue (RabbitMQ/Bull) instead of writing to DB
      this.trackView(pageData._id);

      // 6. Construct Response
      const response = {
        meta: {
          generatedIn: `${Date.now() - start}ms`
        },
        organization: {
          id: organization._id,
          name: organization.name,
          slug: organization.uniqueShopId.toLowerCase(),
          logo: organization.logo,
          contact: {
            email: organization.primaryEmail,
            phone: organization.primaryPhone
          }
        },
        
        // THEME & SETTINGS
        theme: themeResponse,
        settings: {
          ...layoutData.globalSettings,
          // Inject Scripts if they exist (Enterprise Feature)
          scripts: layoutData.globalSettings?.customScripts 
        },

        // LAYOUT
        layout: {
          header: hydratedHeader,
          footer: hydratedFooter
        },

        // PAGE CONTENT
        page: {
          id: pageData._id,
          name: pageData.name,
          slug: pageData.slug,
          type: pageData.pageType,
          sections: hydratedBody, // Contains resolved data (Products, Categories, etc.)
          
          seo: {
            title: pageData.seo?.title || pageData.name,
            description: pageData.seo?.description || layoutData.globalSettings?.defaultSeo?.siteName,
            image: pageData.seo?.ogImage || layoutData.globalSettings?.defaultSeo?.defaultImage,
            noIndex: pageData.seo?.noIndex || false
          }
        }
      };

      // 7. Cache Headers (CDN Optimization)
      res.set({
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=30', // Cache for 60s
        'X-Theme-ID': effectiveThemeId
      });

      res.status(200).json(response);

    } catch (error) {
      next(error);
    }
  }

  // --- Helpers ---

  async findPage(organizationId, slug) {
    const query = { 
      organizationId, 
      isPublished: true, 
      isDeleted: false // Safety check
    };

    if (slug === 'home' || !slug) {
      query.isHomepage = true;
    } else {
      query.slug = slug;
    }

    return await StorefrontPage.findOne(query).lean();
  }

  trackView(pageId) {
    // In production, send to Redis/Analytics Service
    // For now, simple DB increment is okay for low traffic
    StorefrontPage.findByIdAndUpdate(pageId, { $inc: { viewCount: 1 } }).exec();
  }
}

module.exports = new StorefrontPublicController();

// const { StorefrontPage } = require('../../models/storefront');
// const LayoutService = require('../../services/storefront/layout.service');
// const Organization = require('../../../modules/organization/core/organization.model');
// const DataHydrationService = require('../../services/storefront/dataHydration.service');
// const AppError = require('../../../core/utils/appError');

// class StorefrontPublicController {

//   /**
//    * ============================================================
//    * GET PUBLIC PAGE (The Main Handler)
//    * Merges Layout (Header/Footer) + Page Content + Live Data
//    * Route: GET /public/:organizationSlug/:pageSlug
//    * ============================================================
//    */
//   getPublicPage = async (req, res, next) => {
//     try {
//       const { organizationSlug, pageSlug } = req.params;
//       const start = Date.now();

//       // 1. Resolve Organization
//       // We select 'settings' too, in case you have legacy settings stored there
//       const organization = await Organization.findOne({
//         uniqueShopId: organizationSlug.toUpperCase(),
//         isActive: true
//       }).select('_id name uniqueShopId settings primaryEmail primaryPhone logo');

//       if (!organization) {
//         return next(new AppError('Store not found or inactive', 404));
//       }

//       // 2. Fetch Page and Layout CONCURRENTLY (Parallel Execution)
//       // This is crucial for performance. We don't wait for one to finish before starting the other.
//       const [pageData, layoutData] = await Promise.all([
//         this.findPage(organization._id, pageSlug),
//         LayoutService.getLayout(organization._id)
//       ]);

//       if (!pageData) {
//         return next(new AppError('Page not found', 404));
//       }

//       // 3. Hydrate All Sections CONCURRENTLY
//       // We hydrate the Header, the Page Body, and the Footer all at the same time.
//       const [hydratedHeader, hydratedBody, hydratedFooter] = await Promise.all([
//         DataHydrationService.hydrateSections(layoutData.header, organization._id),
//         DataHydrationService.hydrateSections(pageData.sections, organization._id),
//         DataHydrationService.hydrateSections(layoutData.footer, organization._id)
//       ]);

//       // 4. Increment View Count (Async - Fire and forget)
//       this.incrementViewCount(pageData._id);

//       // 5. Construct The "Best Design" Response
//       const response = {
//         meta: {
//           generatedIn: `${Date.now() - start}ms`,
//           timestamp: new Date().toISOString()
//         },
//         organization: {
//           id: organization._id,
//           name: organization.name,
//           slug: organization.uniqueShopId.toLowerCase(),
//           logo: organization.logo,
//           contact: {
//             email: organization.primaryEmail,
//             phone: organization.primaryPhone
//           }
//         },
//         // GLOBAL SITE SETTINGS (Favicon, Social Links, etc.)
//         settings: layoutData.globalSettings || {},

//         // MASTER LAYOUT (Fixed elements)
//         layout: {
//           header: hydratedHeader,
//           footer: hydratedFooter
//         },

//         // DYNAMIC PAGE CONTENT
//         page: {
//           id: pageData._id,
//           name: pageData.name,
//           slug: pageData.slug,
//           type: pageData.pageType,
//           // Hydrated sections (with Products/Categories inside)
//           sections: hydratedBody, 
          
//           // SEO Logic: Use Page SEO, fallback to Global SEO
//           seo: {
//             title: pageData.seo?.title || pageData.name,
//             description: pageData.seo?.description || layoutData.globalSettings?.defaultSeo?.siteName,
//             image: pageData.seo?.ogImage || layoutData.globalSettings?.defaultSeo?.defaultImage,
//             keywords: pageData.seo?.keywords || []
//           },
//           theme: pageData.theme, // Page-specific theme overrides
//           viewCount: pageData.viewCount + 1
//         }
//       };

//       // 6. Set Response Headers
//       res.set({
//         'X-Store-Name': organization.name,
//         'X-Response-Time': `${Date.now() - start}ms`,
//         'Cache-Control': 'no-cache, no-store, must-revalidate' // For dev. In prod, use: 'public, max-age=60'
//       });

//       res.status(200).json(response);

//     } catch (error) {
//       next(error);
//     }
//   }

//   /**
//    * ============================================================
//    * HELPER: Find Page Logic
//    * Handles "home" slug and status checks
//    * ============================================================
//    */
//   async findPage(organizationId, slug) {
//     const query = { 
//       organizationId, 
//       isPublished: true, 
//       status: 'published' 
//     };

//     if (slug === 'home' || !slug) {
//       query.isHomepage = true;
//     } else {
//       query.slug = slug;
//     }

//     // Return lean object for performance
//     return await StorefrontPage.findOne(query).lean();
//   }

//   /**
//    * ============================================================
//    * GET ORGANIZATION INFO
//    * Lightweight endpoint for initial app load if needed
//    * Route: GET /public/:organizationSlug
//    * ============================================================
//    */
//   getOrganizationInfo = async (req, res, next) => {
//     try {
//       const { organizationSlug } = req.params;

//       const organization = await Organization.findOne({
//         uniqueShopId: organizationSlug.toUpperCase(),
//         isActive: true
//       }).select('_id name uniqueShopId primaryEmail primaryPhone logo description');

//       if (!organization) {
//         return next(new AppError('Store not found', 404));
//       }

//       // Also fetch Global Settings here for the initial app shell
//       const layout = await LayoutService.getLayout(organization._id);

//       res.status(200).json({
//         organization: {
//           id: organization._id,
//           name: organization.name,
//           slug: organization.uniqueShopId.toLowerCase(),
//           description: organization.description,
//           contact: {
//             email: organization.primaryEmail,
//             phone: organization.primaryPhone
//           },
//           logo: organization.logo
//         },
//         settings: layout.globalSettings || {}
//       });

//     } catch (error) {
//       next(error);
//     }
//   }

//   /**
//    * ============================================================
//    * GET SITEMAP
//    * For SEO Crawlers
//    * Route: GET /public/:organizationSlug/sitemap
//    * ============================================================
//    */
//   getSitemap = async (req, res, next) => {
//     try {
//       const { organizationSlug } = req.params;

//       const organization = await Organization.findOne({
//         uniqueShopId: organizationSlug.toUpperCase()
//       }).select('_id');

//       if (!organization) {
//         return next(new AppError('Store not found', 404));
//       }

//       const pages = await StorefrontPage.find({
//         organizationId: organization._id,
//         isPublished: true,
//         status: 'published',
//         'seo.noIndex': { $ne: true }
//       })
//       .select('slug pageType seo.title updatedAt')
//       .sort('slug')
//       .lean();

//       const sitemap = pages.map(page => ({
//         url: `/store/${organizationSlug}/${page.slug}`,
//         pageType: page.pageType,
//         title: page.seo?.title,
//         lastModified: page.updatedAt
//       }));

//       res.status(200).json({
//         organizationSlug,
//         pages: sitemap,
//         count: sitemap.length
//       });

//     } catch (error) {
//       next(error);
//     }
//   }

//   /**
//    * ============================================================
//    * HELPER: Increment Views
//    * ============================================================
//    */
//   incrementViewCount = async (pageId) => {
//     try {
//       await StorefrontPage.findByIdAndUpdate(
//         pageId,
//         {
//           $inc: { viewCount: 1 },
//           $set: { lastViewedAt: new Date() }
//         }
//       );
//     } catch (error) {
//       console.error('Error incrementing view count:', error);
//     }
//   }
// }

// module.exports = new StorefrontPublicController();
