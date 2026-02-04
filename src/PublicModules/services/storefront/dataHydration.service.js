const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

// Models
const Product = require('../../../modules/inventory/core/product.model');
const StorefrontPage = require('../../models/storefront/storefrontPage.model');
const Branch = require('../../../modules/organization/core/branch.model');
const Master = require('../../../modules/master/core/master.model'); // ✅ Required for Category/Brand lookups
const SmartRuleEngine = require('./smartRuleEngine.service');

class DataHydrationService {

  /**
   * Main Entry Point: Hydrates a list of sections with live data
   */
  async hydrateSections(sections, organizationId) {
    if (!sections || sections.length === 0) return [];

    const hydrationTasks = sections.map(async (section) => {
      // 1. Deep Clone to avoid mutation side-effects
      const hydratedSection = JSON.parse(JSON.stringify(section));
      hydratedSection.data = null;

      if (!hydratedSection.isActive) return null;

      try {
        // A. Navigation Sections (Menus)
        if (hydratedSection.type.includes('navbar') || hydratedSection.dataSource === 'pages') {
          await this.hydrateNavigation(hydratedSection, organizationId);
          return hydratedSection;
        }

        // B. Content Sections (Based on Data Source)
        switch (hydratedSection.dataSource) {
          case 'smart':
            // ✅ Handles Rules, Brands, Categories, Dead Stock
            hydratedSection.data = await this.hydrateSmartSection(hydratedSection, organizationId);
            break;
          case 'manual':
            // ✅ Handles specific product selection
            hydratedSection.data = await this.hydrateManualSection(hydratedSection, organizationId);
            break;
          case 'dynamic':
            // ✅ Handles Category Grids, Locations
            hydratedSection.data = await this.hydrateDynamicSection(hydratedSection, organizationId);
            break;
        }
      } catch (error) {
        console.error(`[Hydration Error] ${hydratedSection.type}:`, error.message);
        hydratedSection.error = true; // Flag for UI to show safe fallback
      }

      return hydratedSection;
    });

    const results = await Promise.all(hydrationTasks);
    return results.filter(Boolean);
  }

  /**
   * ✅ ENHANCED: Handles Smart Rules, Dead Stock, and ID-based Category lookups
   */
  /**
   * ✅ ENHANCED: Handles Smart Rules with Dynamic Discount Filtering
   */
  async hydrateSmartSection(section, organizationId) {
    try {
      const config = section.config || {};
      const limit = parseInt(config.limit || config.itemsPerView || 12);
      const sort = { createdAt: -1 };

      let query = {
        organizationId: mongoose.Types.ObjectId(organizationId),
        isActive: true
      };

      // 1. SOURCE TYPE HANDLER (Category/Brand)
      const sourceType = config.sourceType || 'rule';

      if (sourceType === 'category' && config.sourceValue) {
        const categoryId = await this.resolveMasterId(organizationId, 'category', config.sourceValue);
        if (categoryId) query.categoryId = categoryId;
        else return [];
      }
      else if (sourceType === 'brand' && config.sourceValue) {
        const brandId = await this.resolveMasterId(organizationId, 'brand', config.sourceValue);
        if (brandId) query.brandId = brandId;
        else return [];
      }

      // 2. RULE HANDLER
      if (sourceType === 'rule' || config.ruleType) {

        // A. DEAD STOCK
        if (config.ruleType === 'dead_stock') {
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

          query.inventory = { $elemMatch: { quantity: { $gt: 5 } } };
          query.$or = [
            { lastSold: { $exists: false } },
            { lastSold: { $lt: threeMonthsAgo } }
          ];
          sort.createdAt = 1;
        }

        // B. HEAVY DISCOUNT (With User Input for %)
        else if (config.ruleType === 'heavy_discount') {
          query.discountedPrice = { $exists: true, $ne: null };

          // Get the user input (e.g. 30 for 30%)
          const minDiscount = parseInt(config.minDiscount || 0);

          if (minDiscount > 0) {
            const factor = 1 - (minDiscount / 100);
            query.$expr = {
              $lte: ["$discountedPrice", { $multiply: ["$sellingPrice", factor] }]
            };
          }
          // Optional: Sort by cheapest result or newest
          sort.createdAt = -1;
        }

        // C. FEATURED
        else if (config.ruleType === 'featured') {
          query.tags = 'featured';
        }

        // D. COMPLEX RULES
        else if (config.ruleType) {
          const products = await SmartRuleEngine.executeAdHocRule(config, organizationId);
          return this.transformProductsForPublic(products);
        }
      }

      // 3. EXECUTE QUERY
      const products = await Product.find(query)
        .select('name slug description images sellingPrice discountedPrice categoryId brandId tags sku inventory lastSold')
        .sort(sort)
        .limit(limit)
        .populate('categoryId brandId', 'name slug imageUrl')
        .lean();

      return this.transformProductsForPublic(products);

    } catch (error) {
      console.error('Error hydrating smart section:', error);
      return [];
    }
  }
  //   async hydrateSmartSection(section, organizationId) {
  //     try {
  //       const config = section.config || {};
  //       const limit = parseInt(config.limit || config.itemsPerView || 12);
  //       const sort = { createdAt: -1 }; // Default: Newest first

  //       // Base Query
  //       let query = {
  //         organizationId: mongoose.Types.ObjectId(organizationId),
  //         isActive: true
  //       };

  //       // -------------------------------------------------------
  //       // 1. SOURCE TYPE HANDLER (Category/Brand from Master)
  //       // -------------------------------------------------------
  //       const sourceType = config.sourceType || 'rule';

  //       if (sourceType === 'category' && config.sourceValue) {
  //         // ✅ Fix: Resolve ID instead of using Regex on product collection
  //         const categoryId = await this.resolveMasterId(organizationId, 'category', config.sourceValue);
  //         if (categoryId) query.categoryId = categoryId; 
  //         else return []; // If category not found, return empty
  //       } 
  //       else if (sourceType === 'brand' && config.sourceValue) {
  //         const brandId = await this.resolveMasterId(organizationId, 'brand', config.sourceValue);
  //         if (brandId) query.brandId = brandId;
  //         else return [];
  //       }

  //       // -------------------------------------------------------
  //       // 2. RULE HANDLER (Dead Stock, Discounts, Best Sellers)
  //       // -------------------------------------------------------
  //       if (sourceType === 'rule' || config.ruleType) {

  //         // A. DEAD STOCK (Stock > 5 but No Sales in 3 Months)
  //         if (config.ruleType === 'dead_stock') {
  //           const threeMonthsAgo = new Date();
  //           threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  //           query.inventory = { $elemMatch: { quantity: { $gt: 5 } } }; // Has stock
  //           query.$or = [
  //             { lastSold: { $exists: false } }, // Never sold
  //             { lastSold: { $lt: threeMonthsAgo } } // Sold long ago
  //           ];
  //           sort.createdAt = 1; // Show oldest items first to clear them
  //         }

  //         // // B. HEAVY DISCOUNT (Simple check for existence of discount)
  //         // else if (config.ruleType === 'heavy_discount') {
  //         //   query.discountedPrice = { $exists: true, $ne: null };
  //         //   // We rely on the transform step to calculate exact %, 
  //         //   // or we could sort by a calculated diff if using aggregation.
  //         //   // For simple .find(), we just ensure discount exists.
  //         // }
  // // B. HEAVY DISCOUNT (User sets Minimum % Off)
  //         else if (config.ruleType === 'heavy_discount') {
  //           // 1. Ensure discount exists
  //           query.discountedPrice = { $exists: true, $ne: null };

  //           // 2. Check if User provided a Minimum Discount (e.g., 20, 30, 50)
  //           const minDiscount = parseInt(config.minDiscount || 0);

  //           if (minDiscount > 0) {
  //             // MATH: discountedPrice <= sellingPrice * (1 - minDiscount/100)
  //             // Example: 50% off -> discountedPrice <= sellingPrice * 0.5
  //             const factor = 1 - (minDiscount / 100);

  //             // We use $expr to compare two fields in the same document
  //             query.$expr = {
  //               $lte: [
  //                 "$discountedPrice", 
  //                 { $multiply: ["$sellingPrice", factor] }
  //               ]
  //             };
  //           }

  //           // Sort by the biggest "gap" between prices (Deepest Discount First)
  //           // Note: Standard sort can't easily do (price - discount), so we default 
  //           // to sorting by created date or we can sort by discountedPrice (lowest first).
  //           sort.discountedPrice = 1; 
  //         }
  //         // C. FEATURED PRODUCTS (Tag based)
  //         else if (config.ruleType === 'featured') {
  //           query.tags = 'featured'; 
  //         }

  //         // D. COMPLEX RULES (Best Sellers, etc. -> Delegate to Engine)
  //         else if (config.ruleType) {
  //            // Note: executeAdHocRule returns transformed data directly
  //            const products = await SmartRuleEngine.executeAdHocRule(config, organizationId);
  //            return this.transformProductsForPublic(products);
  //         }
  //       }

  //       // -------------------------------------------------------
  //       // 3. EXECUTE STANDARD QUERY
  //       // -------------------------------------------------------
  //       const products = await Product.find(query)
  //         .select('name slug description images sellingPrice discountedPrice categoryId brandId tags sku inventory lastSold createdAt')
  //         .sort(sort)
  //         .limit(limit)
  //         .populate('categoryId brandId', 'name slug imageUrl') // Populate Master data
  //         .lean();

  //       return this.transformProductsForPublic(products);

  //     } catch (error) {
  //       console.error('Error hydrating smart section:', error);
  //       return [];
  //     }
  //   }

  /**
   * ✅ NEW HELPER: Resolves Slug/Name to Master ObjectId
   * Prevents slow Regex scanning on the Product table
   */
  async resolveMasterId(organizationId, type, value) {
    // If it looks like an ObjectId, return it directly
    if (mongoose.Types.ObjectId.isValid(value)) return value;

    // Otherwise, find the Master ID by Slug or Name
    const master = await Master.findOne({
      organizationId,
      type, // 'category' or 'brand'
      $or: [
        { slug: value },
        { name: { $regex: new RegExp(`^${value}$`, 'i') } } // Fallback to name match on Master
      ]
    }).select('_id');

    return master ? master._id : null;
  }

  /**
   * Hydrates Manual Product Selection
   */
  async hydrateManualSection(section, organizationId) {
    if (!section.manualData?.productIds?.length) return [];
    try {
      const products = await Product.find({
        _id: { $in: section.manualData.productIds },
        organizationId,
        isActive: true
      })
        .populate('categoryId brandId', 'name slug')
        .lean();

      return this.transformProductsForPublic(products);
    } catch (error) {
      console.error('Error hydrating manual section:', error);
      return [];
    }
  }

  /**
   * Hydrates Dynamic Components (Category Grids, Maps)
   */
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

  /**
   * Hydrates Category Grid with counts and images
   */
  async hydrateCategoryGrid(section, organizationId) {
    const config = section.config || {};
    const limit = config.limit || 12;

    // 1. Dynamic Mode: Fetch from Master Model
    if (!config.sourceType || config.sourceType === 'dynamic') {

      const query = {
        organizationId: mongoose.Types.ObjectId(organizationId),
        type: 'category',
        isActive: true
      };

      // Handle Specific Selection (if admin picked specific categories)
      if (config.selectedCategories && config.selectedCategories.length > 0) {
        query._id = { $in: config.selectedCategories.map(id => mongoose.Types.ObjectId(id)) };
      }

      const masters = await Master.find(query)
        .sort({ 'metadata.sortOrder': 1, createdAt: -1 })
        .limit(limit)
        .lean();

      // Aggregate Product Counts
      let countsMap = {};
      if (config.showProductCount) {
        const counts = await Product.aggregate([
          { $match: { organizationId: mongoose.Types.ObjectId(organizationId), isActive: true } },
          { $group: { _id: '$categoryId', count: { $sum: 1 } } }
        ]);
        countsMap = counts.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {});
      }

      return masters.map(master => ({
        id: master._id,
        name: master.name,
        // Use Master Image -> Fallback
        image: master.imageUrl || 'assets/placeholder-category.jpg',
        linkUrl: `/products?category=${master._id}`, // Using ID is safer than name
        slug: master.slug,
        productCount: countsMap[master._id] || 0
      }));
    }

    // 2. Manual Mode (Data hardcoded in UI config)
    if (config.sourceType === 'manual' && config.categories) {
      return config.categories.map(cat => ({
        id: 'manual_' + nanoid(6),
        name: cat.name,
        image: cat.image,
        linkUrl: cat.linkUrl || `/products?category=${encodeURIComponent(cat.name)}`,
        productCount: null
      }));
    }
    return [];
  }

  /**
   * Hydrates Navigation Menu with Published Pages
   */
  async hydrateNavigation(section, organizationId) {
    if (!section.config) section.config = {};
    if (!section.config.menuItems) section.config.menuItems = [];

    // Fetch published pages
    const pages = await StorefrontPage.find({
      organizationId,
      status: 'published',
      isPublished: true
    })
      .select('name slug isHomepage pageType')
      .sort({ isHomepage: -1, createdAt: 1 })
      .lean();

    const dynamicLinks = pages.map(page => ({
      label: page.name,
      url: page.isHomepage ? '/' : `/${page.slug}`,
      type: 'page',
      id: page._id.toString()
    }));

    // Merge without duplicates
    const existingItems = section.config.menuItems;
    const uniqueDynamicLinks = dynamicLinks.filter(dLink =>
      !existingItems.some(sLink => sLink.url === dLink.url)
    );

    section.config.menuItems = [...existingItems, ...uniqueDynamicLinks];
    section.data = uniqueDynamicLinks;
  }

  /**
   * Helper: Get Branches for Maps
   */
  async getBranches(organizationId) {
    return await Branch.find({ organizationId, isActive: true, isDeleted: false }).lean();
  }

  /**
   * ✅ UPGRADED: Transforms Raw DB Product to Clean UI Object
   * Calculates Live Discount % and Inventory Status Strings
   */
  transformProductsForPublic(products) {
    if (!Array.isArray(products)) return [];

    return products.map(p => {
      // 1. Calculate Total Inventory
      const totalStock = p.inventory?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;

      // 2. Calculate Discount Percentage
      let discountPercentage = 0;
      let hasDiscount = false;

      if (p.discountedPrice && p.discountedPrice < p.sellingPrice) {
        hasDiscount = true;
        discountPercentage = Math.round(((p.sellingPrice - p.discountedPrice) / p.sellingPrice) * 100);
      }

      // 3. Determine Stock Status String
      let stockStatus = 'In Stock';
      if (totalStock === 0) stockStatus = 'Out of Stock';
      else if (totalStock < 5) stockStatus = 'Low Stock';

      // 4. Identify New Arrivals (Last 14 days)
      const isNew = p.createdAt && (new Date() - new Date(p.createdAt) < 14 * 24 * 60 * 60 * 1000);

      return {
        id: p._id,
        name: p.name,
        slug: p.slug,
        images: p.images || [],

        // Handle Populated Master Fields
        category: p.categoryId?.name || null,
        brand: p.brandId?.name || null,

        price: {
          original: p.sellingPrice,
          discounted: p.discountedPrice,
          currency: 'INR',
          hasDiscount: hasDiscount,
          // ✅ New: String for badges
          discountLabel: hasDiscount ? `${discountPercentage}% OFF` : null
        },

        stock: {
          available: totalStock > 0,
          quantity: totalStock,
          status: stockStatus
        },

        tags: p.tags || [],
        isNew: isNew,
        // Helper link
        url: `/products/${p.slug}`
      };
    });
  }
}

module.exports = new DataHydrationService();

// const Product = require('../../../modules/inventory/core/product.model');
// const StorefrontPage = require('../../models/storefront/storefrontPage.model');
// const Branch = require('../../../modules/organization/core/branch.model');
// const SmartRuleEngine = require('./smartRuleEngine.service');
// const Master = require('../../../modules/master/core/master.model'); // Import your new Master model
// class DataHydrationService {
//   async hydrateSections(sections, organizationId) {
//     if (!sections || sections.length === 0) return [];
//     const hydrationTasks = sections.map(async (section) => {
//       const hydratedSection = JSON.parse(JSON.stringify(section));
//       hydratedSection.data = null;
//       if (!hydratedSection.isActive) return null;
//       try {
//         if (hydratedSection.type.includes('navbar') || hydratedSection.dataSource === 'pages') {
//           await this.hydrateNavigation(hydratedSection, organizationId);
//           return hydratedSection;
//         }
//         switch (hydratedSection.dataSource) {
//           case 'smart':
//             hydratedSection.data = await this.hydrateSmartSection(hydratedSection, organizationId);
//             break;
//           case 'manual':
//             hydratedSection.data = await this.hydrateManualSection(hydratedSection, organizationId);
//             break;
//           case 'dynamic':
//             hydratedSection.data = await this.hydrateDynamicSection(hydratedSection, organizationId);
//             break;
//         }
//       } catch (error) {
//         console.error(`[Hydration Error] ${hydratedSection.type}:`, error.message);
//         hydratedSection.error = true;
//       }
//       return hydratedSection;
//     });
//     const results = await Promise.all(hydrationTasks);
//     return results.filter(Boolean);
//   }
//   /**
//    * ✅ UPGRADED: Handles Rules, Brands, and Categories
//    */
//   async hydrateSmartSection(section, organizationId) {
//     try {
//       const config = section.config || {};
//       let query = {
//         organizationId,
//         isActive: true
//       };
//       const limit = parseInt(config.limit || config.itemsPerView || 12);
//       const sort = { createdAt: -1 }; // Default Newest
//       const sourceType = config.sourceType || 'rule';
//       if (sourceType === 'brand' && config.sourceValue) {
//         query.brand = { $regex: new RegExp(`^${config.sourceValue}$`, 'i') }; // Case-insensitive match
//       }
//       else if (sourceType === 'category' && config.sourceValue) {
//         query.category = { $regex: new RegExp(`^${config.sourceValue}`, 'i') };
//       }
//       else {
//         if (config.ruleType) {
//           const products = await SmartRuleEngine.executeAdHocRule(config, organizationId);
//           return this.transformProductsForPublic(products);
//         }
//       }
//       const products = await Product.find(query)
//         .select('name slug description images sellingPrice discountedPrice category tags sku inventory brand')
//         .sort(sort)
//         .limit(limit)
//         .lean();
//       return this.transformProductsForPublic(products);

//     } catch (error) {
//       console.error('Error hydrating smart section:', error);
//       return [];
//     }
//   }

//   /**
//    * NEW: Automatically fetch published pages for the menu
//    */
//   async hydrateNavigation(section, organizationId) {
//     if (!section.config) section.config = {};
//     if (!section.config.menuItems) section.config.menuItems = [];
//     const pages = await StorefrontPage.find({
//       organizationId,
//       status: 'published',
//       isPublished: true
//     })
//       .select('name slug isHomepage pageType')
//       .sort({ isHomepage: -1, createdAt: 1 }) // Home first, then chronological
//       .lean();
//     const dynamicLinks = pages.map(page => ({
//       label: page.name,
//       // Logic: Homepage is '/', everything else is '/slug'
//       url: page.isHomepage ? '/' : `/${page.slug}`,
//       type: 'page',
//       id: page._id.toString()
//     }));
//     const existingItems = section.config.menuItems;
//     const uniqueDynamicLinks = dynamicLinks.filter(dLink =>
//       !existingItems.some(sLink => sLink.url === dLink.url)
//     );
//     section.config.menuItems = [...existingItems, ...uniqueDynamicLinks];
//     section.data = uniqueDynamicLinks;
//   }

//   async hydrateManualSection(section, organizationId) {
//     if (!section.manualData?.productIds?.length) return [];
//     try {
//       const products = await Product.find({
//         _id: { $in: section.manualData.productIds },
//         organizationId,
//         isActive: true
//       })
//         .select('name slug description images sellingPrice discountedPrice category tags sku inventory')
//         .lean();
//       return this.transformProductsForPublic(products);
//     } catch (error) {
//       console.error('Error hydrating manual section:', error);
//       return [];
//     }
//   }

//   async hydrateCategorySection(section, organizationId) {
//     const category = section.categoryFilter;
//     if (!category) return [];
//     try {
//       const products = await Product.find({
//         organizationId,
//         category,
//         isActive: true
//       })
//         .select('name slug description images sellingPrice discountedPrice category tags sku inventory')
//         .limit(Number(section.config?.limit) || 12)
//         .sort(section.config?.sortBy || 'createdAt')
//         .lean();
//       return this.transformProductsForPublic(products);
//     } catch (error) {
//       console.error('Error hydrating category section:', error);
//       return [];
//     }
//   }

//   async hydrateDynamicSection(section, organizationId) {
//     switch (section.type) {

//       case 'category_grid':
//         return await this.hydrateCategoryGrid(section, organizationId);

//       case 'map_locations':
//         return await this.getBranches(organizationId);

//       default:
//         return null;
//     }
//   }

//   async hydrateCategoryGrid(section, organizationId) {
//     const config = section.config || {};
//     const sourceType = config.sourceType || 'dynamic'; // Default to dynamic

//     // =================================================
//     // CASE 1: MANUAL (Static)
//     // User manually typed names and uploaded images in Admin Panel
//     // =================================================
//     if (sourceType === 'manual') {
//       if (!config.categories || config.categories.length === 0) return [];

//       return config.categories.map(cat => ({
//         id: 'manual_' + Math.random().toString(36).substr(2, 9),
//         name: cat.name,
//         image: cat.image || 'assets/placeholder-category.jpg',
//         // Manual links default to search query if no specific URL provided
//         linkUrl: cat.linkUrl || `/products?category=${encodeURIComponent(cat.name)}`,
//         productCount: null
//       }));
//     }

//     // =================================================
//     // CASE 2: DYNAMIC (From Master DB)
//     // Fetches real categories created in Inventory
//     // =================================================
//     else {
//       // 1. Build Query for Master Table
//       const query = {
//         organizationId: mongoose.Types.ObjectId(organizationId),
//         type: 'category', // Ensure we only get categories
//         isActive: true
//       };

//       // Optional: Filter by specific IDs if user selected "Specific Categories" in Dynamic mode
//       if (config.selectedCategories && config.selectedCategories.length > 0) {
//         query._id = { $in: config.selectedCategories.map(id => mongoose.Types.ObjectId(id)) };
//       }

//       // 2. Fetch Masters
//       const masters = await Master.find(query)
//         .sort({ 'metadata.sortOrder': 1, createdAt: -1 }) // Respect sort order
//         .limit(config.limit || 12)
//         .lean();
//       let countsMap = {};
//       if (config.showProductCount) {
//         const counts = await Product.aggregate([
//           { $match: { organizationId: mongoose.Types.ObjectId(organizationId), isActive: true } },
//           { $group: { _id: '$categoryId', count: { $sum: 1 } } }
//         ]);
//         countsMap = counts.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {});
//       }

//       // 4. Map to Frontend Structure
//       return masters.map(master => ({
//         id: master._id,
//         name: master.name,
//         image: master.imageUrl || 'assets/placeholder-category.jpg',
//         linkUrl: `/products?category=${master.slug || master._id}`,
//         productCount: countsMap[master._id] || 0
//       }));
//     }
//   }

//   async getCategories(organizationId) {
//     const categories = await Product.aggregate([
//       { $match: { organizationId: mongoose.Types.ObjectId(organizationId), isActive: true, category: { $exists: true, $ne: '' } } },
//       { $group: { _id: '$category', productCount: { $sum: 1 }, image: { $first: '$images' } } },
//       { $project: { name: '$_id', slug: { $toLower: { $replaceAll: { input: '$_id', find: ' ', replacement: '-' } } }, productCount: 1, image: { $arrayElemAt: ['$image', 0] } } },
//       { $sort: { productCount: -1 } }
//     ]);
//     return categories;
//   }

//   async getBranches(organizationId) {
//     const branches = await Branch.find({ organizationId, isActive: true, isDeleted: false }).lean();
//     return branches
//   }
//   transformProductsForPublic(products) {
//     return products.map(product => ({
//       id: product._id,
//       name: product.name,
//       slug: product.slug,
//       images: product.images || [],
//       brand: product.brand, // Added Brand
//       price: {
//         original: product.sellingPrice, discounted: product.discountedPrice, currency: 'USD', hasDiscount: !!(product.discountedPrice && product.discountedPrice < product.sellingPrice)
//       },
//       stock: {
//         available: product.inventory?.some(inv => inv.quantity > 0) || false
//       }
//     }));
//   }
// }

// module.exports = new DataHydrationService();
