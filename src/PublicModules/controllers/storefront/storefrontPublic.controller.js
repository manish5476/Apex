const { StorefrontPage } = require('../../models/storefront');
const Organization = require('../../../modules/organization/core/organization.model');
const SmartRuleEngine = require('../../services/storefront/smartRuleEngine.service');
const DataHydrationService = require('../../services/storefront/dataHydration.service');
const AppError = require('../../../core/utils/appError');

class StorefrontPublicController {
  /**
   * Get public storefront page
   * Route: GET /public/:organizationSlug/:pageSlug
   */
  getPublicPage = async (req, res, next) => {
    try {
      const { organizationSlug, pageSlug } = req.params;
      
      // Find organization by uniqueShopId
      const organization = await Organization.findOne({
        uniqueShopId: organizationSlug.toUpperCase(),
        isActive: true
      }).select('_id name uniqueShopId primaryEmail primaryPhone logo');
      
      if (!organization) {
        return next(new AppError('Store not found or inactive', 404));
      }
      
      // Find published page
      let page = await StorefrontPage.findOne({
        organizationId: organization._id,
        slug: pageSlug,
        isPublished: true,
        status: 'published'
      }).lean();
      
      // If page not found and requested home, try to find homepage
      if (!page && pageSlug === 'home') {
        page = await StorefrontPage.findOne({
          organizationId: organization._id,
          isHomepage: true,
          isPublished: true,
          status: 'published'
        }).lean();
      }
      
      if (!page) {
        return next(new AppError('Page not found', 404));
      }
      
      // Increment view count (This caused your error!)
      // Now it works because we are using arrow functions
      this.incrementViewCount(page._id);
      
      // Hydrate sections with live data
      const hydratedSections = await DataHydrationService.hydrateSections(
        page.sections,
        organization._id
      );
      
      // Prepare response
      const response = {
        organization: {
          id: organization._id,
          name: organization.name,
          slug: organization.uniqueShopId.toLowerCase(),
          contact: {
            email: organization.primaryEmail,
            phone: organization.primaryPhone
          },
          logo: organization.logo
        },
        page: {
          id: page._id,
          name: page.name,
          slug: page.slug,
          pageType: page.pageType,
          sections: hydratedSections,
          seo: page.seo,
          theme: page.theme,
          viewCount: page.viewCount + 1 // Show updated count
        },
        meta: {
          generatedAt: new Date().toISOString(),
          cacheControl: 'public, max-age=300' 
        }
      };
      
      // Set SEO headers
      res.set({
        'X-Store-Name': organization.name,
        'X-Page-Title': page.seo?.title || page.name,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
        // 'Cache-Control': 'public, max-age=300'
      });
      
      res.status(200).json(response);
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get organization info
   * Route: GET /public/:organizationSlug
   */
  getOrganizationInfo = async (req, res, next) => {
    try {
      const { organizationSlug } = req.params;
      
      const organization = await Organization.findOne({
        uniqueShopId: organizationSlug.toUpperCase(),
        isActive: true
      }).select('_id name uniqueShopId primaryEmail primaryPhone logo description');
      
      if (!organization) {
        return next(new AppError('Store not found', 404));
      }
      
      res.status(200).json({
        organization: {
          id: organization._id,
          name: organization.name,
          slug: organization.uniqueShopId.toLowerCase(),
          description: organization.description,
          contact: {
            email: organization.primaryEmail,
            phone: organization.primaryPhone
          },
          logo: organization.logo
        }
      });
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Get all published pages for sitemap
   * Route: GET /public/:organizationSlug/sitemap
   */
  getSitemap = async (req, res, next) => {
    try {
      const { organizationSlug } = req.params;
      
      const organization = await Organization.findOne({
        uniqueShopId: organizationSlug.toUpperCase()
      }).select('_id');
      
      if (!organization) {
        return next(new AppError('Store not found', 404));
      }
      
      const pages = await StorefrontPage.find({
        organizationId: organization._id,
        isPublished: true,
        status: 'published',
        'seo.noIndex': { $ne: true }
      })
      .select('slug pageType seo.title updatedAt')
      .sort('slug')
      .lean();
      
      const sitemap = pages.map(page => ({
        url: `/store/${organizationSlug}/${page.slug}`,
        pageType: page.pageType,
        title: page.seo?.title,
        lastModified: page.updatedAt
      }));
      
      res.status(200).json({
        organizationSlug,
        pages: sitemap,
        count: sitemap.length
      });
      
    } catch (error) {
      next(error);
    }
  }
  
  /**
   * Increment view count (async)
   */
  incrementViewCount = async (pageId) => {
    try {
      await StorefrontPage.findByIdAndUpdate(
        pageId,
        {
          $inc: { viewCount: 1 },
          $set: { lastViewedAt: new Date() }
        }
      );
    } catch (error) {
      console.error('Error incrementing view count:', error);
    }
  }
}

module.exports = new StorefrontPublicController();
