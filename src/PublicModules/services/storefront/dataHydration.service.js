const Product = require('../../../modules/inventory/core/product.model');
// FIX: Point directly to the file to avoid "Module not found" or undefined errors
const StorefrontPage = require('../../models/storefront/storefrontPage.model'); 
const Branch = require('../../../modules/organization/core/branch.model');
const SmartRuleEngine = require('./smartRuleEngine.service');

class DataHydrationService {
async hydrateSections(sections, organizationId) {
    if (!sections || sections.length === 0) return [];

    const hydrationTasks = sections.map(async (section) => {
      const hydratedSection = JSON.parse(JSON.stringify(section));
      hydratedSection.data = null;

      if (!hydratedSection.isActive) return null;

      try {
        // Navigation Logic (Existing)
        if (hydratedSection.type.includes('navbar') || hydratedSection.dataSource === 'pages') {
           await this.hydrateNavigation(hydratedSection, organizationId);
           return hydratedSection; 
        }

        // Main Hydration Switch
        switch (hydratedSection.dataSource) {
          case 'smart':
            // ✅ UPDATED: Now handles Brands and Categories too
            hydratedSection.data = await this.hydrateSmartSection(hydratedSection, organizationId);
            break;
          case 'manual':
            hydratedSection.data = await this.hydrateManualSection(hydratedSection, organizationId);
            break;
          case 'dynamic':
            hydratedSection.data = await this.hydrateDynamicSection(hydratedSection, organizationId);
            break;
        }
      } catch (error) {
        console.error(`[Hydration Error] ${hydratedSection.type}:`, error.message);
        hydratedSection.error = true;
      }

      return hydratedSection;
    });

    const results = await Promise.all(hydrationTasks);
    return results.filter(Boolean);
  }

  /**
   * ✅ UPGRADED: Handles Rules, Brands, and Categories
   */
  async hydrateSmartSection(section, organizationId) {
    try {
      const config = section.config || {};
      let query = { 
        organizationId, 
        isActive: true 
      };

      // 1. LIMIT & SORT
      const limit = parseInt(config.limit || config.itemsPerView || 12);
      const sort = { createdAt: -1 }; // Default Newest

      // 2. CHECK SOURCE TYPE
      // The user can now select 'rule', 'brand', or 'category' in the Admin UI
      const sourceType = config.sourceType || 'rule'; 

      // CASE A: Specific Brand
      if (sourceType === 'brand' && config.sourceValue) {
        query.brand = { $regex: new RegExp(`^${config.sourceValue}$`, 'i') }; // Case-insensitive match
      }
      
      // CASE B: Specific Category
      else if (sourceType === 'category' && config.sourceValue) {
        query.category = { $regex: new RegExp(`^${config.sourceValue}`, 'i') };
      }

      // CASE C: Smart Rule (Best Sellers, New Arrivals, etc.)
      else {
        // If it's a rule, we delegate to the Rule Engine
        // Note: We return immediately because Rule Engine builds its own aggregation pipeline
        if (config.ruleType) {
          const products = await SmartRuleEngine.executeAdHocRule(config, organizationId);
          return this.transformProductsForPublic(products);
        }
      }

      // 3. EXECUTE QUERY (For Brand/Category)
      const products = await Product.find(query)
        .select('name slug description images sellingPrice discountedPrice category tags sku inventory brand')
        .sort(sort)
        .limit(limit)
        .lean();

      return this.transformProductsForPublic(products);

    } catch (error) {
      console.error('Error hydrating smart section:', error);
      return [];
    }
  }

  /**
   * NEW: Automatically fetch published pages for the menu
   */
  async hydrateNavigation(section, organizationId) {
    // Safety check: ensure config exists
    if (!section.config) section.config = {};
    if (!section.config.menuItems) section.config.menuItems = [];

    // 1. Fetch only PUBLISHED pages
    const pages = await StorefrontPage.find({
      organizationId,
      status: 'published',
      isPublished: true
    })
    .select('name slug isHomepage pageType')
    .sort({ isHomepage: -1, createdAt: 1 }) // Home first, then chronological
    .lean();

    // 2. Transform into Menu Items
    const dynamicLinks = pages.map(page => ({
      label: page.name,
      // Logic: Homepage is '/', everything else is '/slug'
      url: page.isHomepage ? '/' : `/${page.slug}`,
      type: 'page',
      id: page._id.toString()
    }));

    // 3. Merge with existing static items
    const existingItems = section.config.menuItems;
    
    // Filter out dynamic links that conflict with existing static links (avoid duplicates)
    const uniqueDynamicLinks = dynamicLinks.filter(dLink => 
      !existingItems.some(sLink => sLink.url === dLink.url)
    );

    // 4. Update the section config
    // This pushes the new pages to the RIGHT side of the menu
    section.config.menuItems = [...existingItems, ...uniqueDynamicLinks];
    
    // Also attach to .data property for flexibility
    section.data = uniqueDynamicLinks;
  }

  async hydrateManualSection(section, organizationId) {
    if (!section.manualData?.productIds?.length) return [];
    try {
      const products = await Product.find({
        _id: { $in: section.manualData.productIds },
        organizationId,
        isActive: true
      })
      .select('name slug description images sellingPrice discountedPrice category tags sku inventory')
      .lean();
      return this.transformProductsForPublic(products);
    } catch (error) {
      console.error('Error hydrating manual section:', error);
      return [];
    }
  }

  async hydrateCategorySection(section, organizationId) {
    const category = section.categoryFilter;
    if (!category) return [];
    try {
      const products = await Product.find({
        organizationId,
        category,
        isActive: true
      })
      .select('name slug description images sellingPrice discountedPrice category tags sku inventory')
      .limit(Number(section.config?.limit) || 12)
      .sort(section.config?.sortBy || 'createdAt')
      .lean();
      return this.transformProductsForPublic(products);
    } catch (error) {
      console.error('Error hydrating category section:', error);
      return [];
    }
  }

  async hydrateDynamicSection(section, organizationId) {
    switch (section.type) {
      case 'category_grid':
        return await this.getCategories(organizationId);
      case 'map_locations':
        return await this.getBranches(organizationId);
      default:
        return null;
    }
  }

  async getCategories(organizationId) {
    const categories = await Product.aggregate([
      { $match: { organizationId: mongoose.Types.ObjectId(organizationId), isActive: true, category: { $exists: true, $ne: '' } } },
      { $group: { _id: '$category', productCount: { $sum: 1 }, image: { $first: '$images' } } },
      { $project: { name: '$_id', slug: { $toLower: { $replaceAll: { input: '$_id', find: ' ', replacement: '-' } } }, productCount: 1, image: { $arrayElemAt: ['$image', 0] } } },
      { $sort: { productCount: -1 } }
    ]);
    return categories;
  }

  async getBranches(organizationId) {
    const branches = await Branch.find({ organizationId, isActive: true, isDeleted: false }).lean();
    return branches
    // .map(branch => ({
    //   id: branch._id,
    //   name: branch.name,
    //   address: branch.address,
    //   location:branch.location,
    //   phone: branch.phoneNumber,
    //   isMain: branch.isMainBranch
    // }));
  }
transformProductsForPublic(products) {
    return products.map(product => ({
      id: product._id,
      name: product.name,
      slug: product.slug,
      images: product.images || [],
      brand: product.brand, // Added Brand
      price: {
        original: product.sellingPrice,
        discounted: product.discountedPrice,
        currency: 'USD',
        hasDiscount: !!(product.discountedPrice && product.discountedPrice < product.sellingPrice)
      },
      stock: {
        available: product.inventory?.some(inv => inv.quantity > 0) || false
      }
    }));
  }
}

module.exports = new DataHydrationService();
