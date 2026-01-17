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

  // /**
  //  * Hydrate sections with live data (Optimized)
  //  */
  // async hydrateSections(sections, organizationId) {
  //   if (!sections || sections.length === 0) return [];

  //   const hydrationTasks = sections.map(async (section) => {
  //     // 1. Create a safe copy of the section
  //     // We parse/stringify to ensure we aren't mutating a frozen Mongoose object
  //     const hydratedSection = JSON.parse(JSON.stringify(section));
  //     hydratedSection.data = null;

  //     if (!hydratedSection.isActive) return null;

  //     try {
  //       // SPECIAL CASE: Auto-detect Navigation/Header sections
  //       // This runs if type contains 'navbar' OR if you manually set dataSource to 'pages'
  //       if (hydratedSection.type.includes('navbar') || hydratedSection.dataSource === 'pages') {
  //          await this.hydrateNavigation(hydratedSection, organizationId);
  //          return hydratedSection; 
  //       }

  //       // Standard Hydration
  //       switch (hydratedSection.dataSource) {
  //         case 'smart':
  //           hydratedSection.data = await this.hydrateSmartSection(hydratedSection, organizationId);
  //           break;
  //         case 'manual':
  //           hydratedSection.data = await this.hydrateManualSection(hydratedSection, organizationId);
  //           break;
  //         case 'category':
  //           hydratedSection.data = await this.hydrateCategorySection(hydratedSection, organizationId);
  //           break;
  //         case 'dynamic':
  //           hydratedSection.data = await this.hydrateDynamicSection(hydratedSection, organizationId);
  //           break;
  //       }
  //     } catch (error) {
  //       // Log the exact error to your server console so you can see it
  //       console.error(`[Hydration Error] Section ${hydratedSection.type}:`, error.message);
        
  //       // Return the section with an error flag, but keep static data (like the logo) intact
  //       hydratedSection.error = true;
  //       hydratedSection.errorMessage = error.message;
  //     }

  //     return hydratedSection;
  //   });

  //   const results = await Promise.all(hydrationTasks);
  //   return results.filter(Boolean);
  // }

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

  // ==========================================
  // EXISTING METHODS (No Changes Needed Below)
  // ==========================================

  // async hydrateSmartSection(section, organizationId) {
  //   try {
  //     if (section.smartRuleId) {
  //       const products = await SmartRuleEngine.executeRule(
  //         section.smartRuleId,
  //         organizationId,
  //         { limit: section.config?.limit || section.config?.itemsPerView }
  //       );
  //       return this.transformProductsForPublic(products);
  //     }
  //     if (section.config && section.config.ruleType) {
  //       const products = await SmartRuleEngine.executeAdHocRule(
  //         section.config,
  //         organizationId
  //       );
  //       return this.transformProductsForPublic(products);
  //     }
  //     return [];
  //   } catch (error) {
  //     console.error('Error hydrating smart section:', error);
  //     return [];
  //   }
  // }

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
    return branches.map(branch => ({
      id: branch._id,
      name: branch.name,
      address: branch.address,
      phone: branch.phoneNumber,
      isMain: branch.isMainBranch
    }));
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
  // transformProductsForPublic(products) {
  //   return products.map(product => ({
  //     id: product._id,
  //     name: product.name,
  //     slug: product.slug,
  //     images: product.images || [],
  //     price: {
  //       original: product.sellingPrice,
  //       discounted: product.discountedPrice,
  //       currency: 'USD',
  //       hasDiscount: !!(product.discountedPrice && product.discountedPrice < product.sellingPrice)
  //     },
  //     stock: {
  //       available: product.inventory?.some(inv => inv.quantity > 0) || false
  //     }
  //   }));
  // }
}

module.exports = new DataHydrationService();
// // FIX: Removed curly braces
// const Product = require('../../../modules/inventory/core/product.model');
// const Branch = require('../../../modules/organization/core/branch.model');
// const SmartRuleEngine = require('./smartRuleEngine.service');

// class DataHydrationService {

//   async hydrateSections(sections, organizationId) {
//     if (!sections || sections.length === 0) return [];

//     const hydrationTasks = sections.map(async (section) => {
//       // Clone to protect original
//       const hydratedSection = { ...section, data: null };

//       if (!section.isActive) return null;

//       try {
//         // SPECIAL CASE: Auto-detect Navigation/Header sections
//         if (section.type.includes('navbar') || section.dataSource === 'pages') {
//           await this.hydrateNavigation(hydratedSection, organizationId);
//           return hydratedSection;
//         }

//         // Standard Hydration
//         switch (section.dataSource) {
//           case 'smart':
//             hydratedSection.data = await this.hydrateSmartSection(section, organizationId);
//             break;
//           case 'manual':
//             hydratedSection.data = await this.hydrateManualSection(section, organizationId);
//             break;
//           case 'category':
//             hydratedSection.data = await this.hydrateCategorySection(section, organizationId);
//             break;
//           case 'dynamic':
//             hydratedSection.data = await this.hydrateDynamicSection(section, organizationId);
//             break;
//         }
//       } catch (error) {
//         console.error(`Error hydrating section ${section.type}:`, error);
//         hydratedSection.error = true;
//       }

//       return hydratedSection;
//     });

//     const results = await Promise.all(hydrationTasks);
//     return results.filter(Boolean);
//   }

//   /**
//    * NEW: Automatically fetch published pages for the menu
//    */
//   async hydrateNavigation(section, organizationId) {
//     // 1. Fetch only PUBLISHED pages (ignoring drafts like 'manis')
//     const pages = await StorefrontPage.find({
//       organizationId,
//       status: 'published',
//       isPublished: true
//     })
//       .select('name slug isHomepage')
//       .sort({ isHomepage: -1, createdAt: 1 }) // Home first, then by date
//       .lean();

//     // 2. Transform into Menu Items
//     const dynamicLinks = pages.map(page => ({
//       label: page.name,
//       // If it's homepage, url is '/', otherwise '/slug'
//       url: page.isHomepage ? '/' : `/${page.slug}`,
//       type: 'page',
//       id: page._id
//     }));

//     // 3. Merge with existing static items (if any)
//     // We update the config.menuItems directly so the frontend renders them combined
//     const existingItems = section.config.menuItems || [];

//     // Avoid duplicates: Filter out static items that have the same URL as dynamic ones
//     const uniqueDynamicLinks = dynamicLinks.filter(dLink =>
//       !existingItems.some(sLink => sLink.url === dLink.url)
//     );

//     section.config.menuItems = [...existingItems, ...uniqueDynamicLinks];

//     // Also attach to .data just in case frontend prefers it there
//     section.data = uniqueDynamicLinks;
//   }
  
//   async hydrateSmartSection(section, organizationId) {
//     try {
//       // CASE 1: Saved Rule (Reference to SmartRule collection)
//       if (section.smartRuleId) {
//         const products = await SmartRuleEngine.executeRule(
//           section.smartRuleId,
//           organizationId,
//           { limit: section.config?.limit || section.config?.itemsPerView }
//         );
//         return this.transformProductsForPublic(products);
//       }

//       // CASE 2: Ad-Hoc Rule (Defined directly in section config)
//       // This matches your JSON structure: { config: { ruleType: "best_sellers", ... } }
//       if (section.config && section.config.ruleType) {
//         const products = await SmartRuleEngine.executeAdHocRule(
//           section.config,
//           organizationId
//         );
//         return this.transformProductsForPublic(products);
//       }

//       return [];
//     } catch (error) {
//       console.error('Error hydrating smart section:', error);
//       return [];
//     }
//   }
//   /**
//    * Hydrate manual section with specific products
//    */
//   async hydrateManualSection(section, organizationId) {
//     if (!section.manualData?.productIds?.length) {
//       return [];
//     }

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

//   /**
//    * Hydrate category section
//    */
//   async hydrateCategorySection(section, organizationId) {
//     const category = section.categoryFilter;
//     if (!category) {
//       return [];
//     }

//     try {
//       const products = await Product.find({
//         organizationId,
//         category,
//         isActive: true
//       })
//         .select('name slug description images sellingPrice discountedPrice category tags sku inventory')
//         .limit(section.config?.limit || 12)
//         .sort(section.config?.sortBy || 'createdAt')
//         .lean();

//       return this.transformProductsForPublic(products);
//     } catch (error) {
//       console.error('Error hydrating category section:', error);
//       return [];
//     }
//   }

//   /**
//    * Hydrate dynamic section (branches, categories, etc.)
//    */
//   async hydrateDynamicSection(section, organizationId) {
//     switch (section.type) {
//       case 'category_grid':
//         return await this.getCategories(organizationId);

//       case 'map_locations':
//         return await this.getBranches(organizationId);

//       default:
//         return null;
//     }
//   }

//   /**
//    * Get categories for organization
//    */
//   async getCategories(organizationId) {
//     const categories = await Product.aggregate([
//       {
//         $match: {
//           organizationId,
//           isActive: true,
//           category: { $exists: true, $ne: '' }
//         }
//       },
//       {
//         $group: {
//           _id: '$category',
//           productCount: { $sum: 1 },
//           image: { $first: '$images' }
//         }
//       },
//       {
//         $project: {
//           name: '$_id',
//           slug: {
//             $toLower: {
//               $replaceAll: {
//                 input: '$_id',
//                 find: ' ',
//                 replacement: '-'
//               }
//             }
//           },
//           productCount: 1,
//           image: { $arrayElemAt: ['$image', 0] }
//         }
//       },
//       { $sort: { productCount: -1 } }
//     ]);

//     return categories;
//   }

//   /**
//    * Get branches for organization
//    */
//   async getBranches(organizationId) {
//     const branches = await Branch.find({
//       organizationId,
//       isActive: true,
//       isDeleted: false
//     })
//       .select('name branchCode address location phoneNumber isMainBranch')
//       .lean();

//     return branches.map(branch => ({
//       id: branch._id,
//       name: branch.name,
//       code: branch.branchCode,
//       address: branch.address,
//       location: branch.location,
//       phone: branch.phoneNumber,
//       isMain: branch.isMainBranch,
//       fullAddress: [
//         branch.address?.street,
//         branch.address?.city,
//         branch.address?.state,
//         branch.address?.zipCode,
//         branch.address?.country
//       ].filter(Boolean).join(', ')
//     }));
//   }

//   /**
//    * Transform products for public view
//    */
//   transformProductsForPublic(products) {
//     return products.map(product => ({
//       id: product._id,
//       name: product.name,
//       slug: product.slug,
//       description: product.description,
//       images: product.images || [],
//       price: {
//         original: product.sellingPrice,
//         discounted: product.discountedPrice,
//         currency: 'USD',
//         formattedOriginal: `$${product.sellingPrice?.toFixed(2)}`,
//         formattedDiscounted: product.discountedPrice ? `$${product.discountedPrice?.toFixed(2)}` : null,
//         hasDiscount: !!product.discountedPrice && product.discountedPrice < product.sellingPrice
//       },
//       category: product.category,
//       tags: product.tags || [],
//       sku: product.sku,
//       stock: {
//         total: product.inventory?.reduce((sum, inv) => sum + (inv.quantity || 0), 0) || 0,
//         available: product.inventory?.some(inv => inv.quantity > 0) || false,
//         lowStock: product.inventory?.some(inv => inv.quantity <= (inv.reorderLevel || 10)) || false
//       },
//       quickActions: {
//         addToCart: true,
//         addToWishlist: true,
//         quickView: true
//       }
//     }));
//   }
// }

// module.exports = new DataHydrationService();
