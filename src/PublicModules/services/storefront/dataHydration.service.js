const Product = require('../../../modules/inventory/core/product.model');
const StorefrontPage = require('../../models/storefront/storefrontPage.model'); 
const Branch = require('../../../modules/organization/core/branch.model');
const SmartRuleEngine = require('./smartRuleEngine.service');
const Master = require('../../../modules/master/core/master.model'); // Import your new Master model
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

  
  // async hydrateDynamicSection(section, organizationId) {
  //   switch (section.type) {
  //     case 'category_grid':
  //       return await this.getCategories(organizationId);
  //     case 'map_locations':
  //       return await this.getBranches(organizationId);
  //     default:
  //       return null;
  //   }
  // }
async hydrateDynamicSection(section, organizationId) {
    switch (section.type) {
      
      case 'category_grid':
        return await this.hydrateCategoryGrid(section, organizationId);

      case 'map_locations':
        return await this.getBranches(organizationId);
      
      default:
        return null;
    }
  }

  // async hydrateCategoryGrid(section, organizationId) {
  //   const config = section.config || {};

  //   // 1. MANUAL MODE: Return user-defined categories directly
  //   if (config.sourceType === 'manual' && config.categories?.length > 0) {
  //     return config.categories.map(cat => ({
  //       name: cat.name,
  //       image: cat.image,
  //       // Generate link if not provided: /products?category=CategoryName
  //       linkUrl: cat.linkUrl || `/products?category=${encodeURIComponent(cat.name)}`, 
  //       productCount: null // Manual mode usually doesn't show live counts unless we do an extra query
  //     }));
  //   }

  //   // 2. DYNAMIC MODE: Aggregate from Products DB
  //   // This existing logic is good, just ensures images are attached.
  //   const categories = await Product.aggregate([
  //     { 
  //       $match: { 
  //         organizationId: new mongoose.Types.ObjectId(organizationId), 
  //         isActive: true, 
  //         category: { $exists: true, $ne: '' } 
  //       } 
  //     },
  //     { $sort: { createdAt: -1 } }, // Newest products first for image selection
  //     { 
  //       $group: { 
  //         _id: '$category', 
  //         productCount: { $sum: 1 }, 
  //         image: { $first: '$images' } // Pick 1st image of newest product
  //       } 
  //     },
  //     { 
  //       $project: { 
  //         name: '$_id', 
  //         // Link logic handled here or frontend. 
  //         // Backend generating standard URL path is safer:
  //         linkUrl: { $concat: ["/products?category=", "$_id"] }, 
  //         productCount: 1, 
  //         image: { $arrayElemAt: ['$image', 0] } 
  //       } 
  //     },
  //     { $sort: { productCount: -1 } }
  //   ]);
    
  //   return categories;
  // }
  async hydrateCategoryGrid(section, organizationId) {
    const config = section.config || {};
    const sourceType = config.sourceType || 'dynamic'; // Default to dynamic

    // =================================================
    // CASE 1: MANUAL (Static)
    // User manually typed names and uploaded images in Admin Panel
    // =================================================
    if (sourceType === 'manual') {
      if (!config.categories || config.categories.length === 0) return [];
      
      return config.categories.map(cat => ({
        id: 'manual_' + Math.random().toString(36).substr(2, 9),
        name: cat.name,
        image: cat.image || 'assets/placeholder-category.jpg',
        // Manual links default to search query if no specific URL provided
        linkUrl: cat.linkUrl || `/products?category=${encodeURIComponent(cat.name)}`, 
        productCount: null
      }));
    }

    // =================================================
    // CASE 2: DYNAMIC (From Master DB)
    // Fetches real categories created in Inventory
    // =================================================
    else {
      // 1. Build Query for Master Table
      const query = {
        organizationId: mongoose.Types.ObjectId(organizationId),
        type: 'category', // Ensure we only get categories
        isActive: true
      };

      // Optional: Filter by specific IDs if user selected "Specific Categories" in Dynamic mode
      if (config.selectedCategories && config.selectedCategories.length > 0) {
        query._id = { $in: config.selectedCategories.map(id => mongoose.Types.ObjectId(id)) };
      }

      // 2. Fetch Masters
      const masters = await Master.find(query)
        .sort({ 'metadata.sortOrder': 1, createdAt: -1 }) // Respect sort order
        .limit(config.limit || 12)
        .lean();

      // 3. (Optional) Get Product Counts if UI requires it
      // We do a parallel aggregation to count active products per category
      let countsMap = {};
      if (config.showProductCount) {
        const counts = await Product.aggregate([
          { $match: { organizationId: mongoose.Types.ObjectId(organizationId), isActive: true } },
          { $group: { _id: '$categoryId', count: { $sum: 1 } } }
        ]);
        // Convert array to object for O(1) lookup: { "catId": 50, "catId2": 10 }
        countsMap = counts.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {});
      }

      // 4. Map to Frontend Structure
      return masters.map(master => ({
        id: master._id,
        name: master.name,
        // Use Master image -> Fallback to Product Image (if you added logic) -> Default
        image: master.imageUrl || 'assets/placeholder-category.jpg', 
        // Use the SEO slug for the link
        linkUrl: `/products?category=${master.slug || master._id}`, 
        productCount: countsMap[master._id] || 0
      }));
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
