const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const Product = require('../../../modules/inventory/core/product.model');
const StorefrontPage = require('../../models/storefront/storefrontPage.model');
const Branch = require('../../../modules/organization/core/branch.model');
const Master = require('../../../modules/master/core/master.model');
const SmartRuleEngine = require('./smartRuleEngine.service');

class DataHydrationService {

  // ============================================================
  // MAIN ENTRY
  // ============================================================
  async hydrateSections(sections = [], organizationId) {
    if (!Array.isArray(sections) || sections.length === 0) return [];

    const tasks = sections.map(section =>
      this.hydrateSingleSection(section, organizationId)
    );

    const results = await Promise.all(tasks);
    return results.filter(Boolean);
  }

  // ============================================================
  // SINGLE SECTION
  // ============================================================
  async hydrateSingleSection(section, organizationId) {
    if (!section || section.isActive === false) return null;

    const hydrated = JSON.parse(JSON.stringify(section));
    hydrated.data = null;
    hydrated.dataSource = hydrated.dataSource || 'static';

    try {
      // Navigation
      if (hydrated.type.includes('navbar')) {
        await this.hydrateNavigation(hydrated, organizationId);
        return hydrated;
      }

      // Product Grid (ALWAYS smart rule driven)
      if (hydrated.type === 'product_grid') {
        return await this.hydrateProductGrid(hydrated, organizationId);
      }

      // Dynamic sections
      if (hydrated.dataSource === 'dynamic') {
        hydrated.data = await this.hydrateDynamicSection(hydrated, organizationId);
        return hydrated;
      }

      // Manual sections
      if (hydrated.dataSource === 'manual') {
        hydrated.data = await this.hydrateManualSection(hydrated, organizationId);
        return hydrated;
      }

      return hydrated;

    } catch (err) {
      console.error(`[Hydration Error] ${hydrated.type}`, err.message);
      hydrated.error = true;
      hydrated.data = [];
      return hydrated;
    }
  }

  // ============================================================
  // PRODUCT GRID (SMART RULE ONLY)
  // ============================================================
  async hydrateProductGrid(section, organizationId) {
    const config = section.config || {};

    if (!config.ruleType) {
      section.data = [];
      section.dataSource = 'missing_rule';
      return section;
    }

    const adhocRule = {
      ruleType: config.ruleType,
      filters: config.filters || [],
      sortBy: config.sortBy,
      sortOrder: config.sortOrder,
      limit: config.limit || 12
    };

    const products = await SmartRuleEngine.executeAdHocRule(
      adhocRule,
      organizationId
    );

    section.data = this.transformProductsForPublic(products);
    section.dataSource = 'smart_rule';

    return section;
  }

  // ============================================================
  // MANUAL PRODUCT SECTION
  // ============================================================
  async hydrateManualSection(section, organizationId) {
    if (!section.manualData?.productIds?.length) return [];

    const products = await Product.find({
      _id: { $in: section.manualData.productIds },
      organizationId,
      isActive: true
    })
      .populate('categoryId brandId', 'name slug imageUrl')
      .lean();

    return this.transformProductsForPublic(products);
  }

  // ============================================================
  // DYNAMIC SECTIONS
  // ============================================================
  async hydrateDynamicSection(section, organizationId) {
    switch (section.type) {
      case 'category_grid':
        return this.hydrateCategoryGrid(section, organizationId);
      case 'map_locations':
        return this.getBranches(organizationId);
      default:
        return [];
    }
  }

  // ============================================================
  // CATEGORY GRID
  // ============================================================
  async hydrateCategoryGrid(section, organizationId) {
    const config = section.config || {};
    const limit = config.limit || 12;

    const query = {
      organizationId: mongoose.Types.ObjectId(organizationId),
      type: 'category',
      isActive: true
    };

    if (Array.isArray(config.selectedCategories) && config.selectedCategories.length) {
      query._id = {
        $in: config.selectedCategories.map(id => mongoose.Types.ObjectId(id))
      };
    }

    const categories = await Master.find(query)
      .sort({ 'metadata.sortOrder': 1, createdAt: -1 })
      .limit(limit)
      .lean();

    return categories.map(cat => ({
      id: cat._id,
      name: cat.name,
      slug: cat.slug,
      image: cat.imageUrl || 'assets/placeholder-category.jpg',
      url: `/products?category=${cat._id}`
    }));
  }

  // ============================================================
  // NAVIGATION
  // ============================================================
  async hydrateNavigation(section, organizationId) {
    const pages = await StorefrontPage.find({
      organizationId,
      status: 'published',
      isPublished: true
    })
      .select('name slug isHomepage')
      .sort({ isHomepage: -1, createdAt: 1 })
      .lean();

    const links = pages.map(p => ({
      label: p.name,
      url: p.isHomepage ? '/' : `/${p.slug}`,
      type: 'page',
      id: p._id.toString()
    }));

    section.config.menuItems = [
      ...(section.config.menuItems || []),
      ...links.filter(l =>
        !(section.config.menuItems || []).some(e => e.url === l.url)
      )
    ];

    section.data = links;
  }

  // ============================================================
  // BRANCHES
  // ============================================================
  async getBranches(organizationId) {
    return Branch.find({
      organizationId,
      isActive: true,
      isDeleted: false
    }).lean();
  }

  // ============================================================
  // PRODUCT TRANSFORM (PUBLIC SAFE)
  // ============================================================
  transformProductsForPublic(products = []) {
    return products.map(p => {
      const totalStock =
        p.inventory?.reduce((s, i) => s + (i.quantity || 0), 0) || 0;

      const hasDiscount =
        p.discountedPrice && p.discountedPrice < p.sellingPrice;

      const discountPct = hasDiscount
        ? Math.round(((p.sellingPrice - p.discountedPrice) / p.sellingPrice) * 100)
        : 0;

      return {
        id: p._id,
        name: p.name,
        slug: p.slug,
        images: p.images || [],
        category: p.categoryId?.name || null,
        brand: p.brandId?.name || null,
        price: {
          original: p.sellingPrice,
          discounted: p.discountedPrice,
          hasDiscount,
          label: hasDiscount ? `${discountPct}% OFF` : null,
          currency: 'INR'
        },
        stock: {
          available: totalStock > 0,
          quantity: totalStock
        },
        tags: p.tags || [],
        url: `/products/${p.slug}`
      };
    });
  }
}

module.exports = new DataHydrationService();


// const mongoose = require('mongoose');
// const { nanoid } = require('nanoid');


// const Product = require('../../../modules/inventory/core/product.model');
// const StorefrontPage = require('../../models/storefront/storefrontPage.model');
// const Branch = require('../../../modules/organization/core/branch.model');
// const Master = require('../../../modules/master/core/master.model');
// const SmartRuleEngine = require('./smartRuleEngine.service');

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

//   async hydrateSmartSection(section, organizationId) {
//     try {
//       const config = section.config || {};
//       const limit = parseInt(config.limit || config.itemsPerView || 12);
//       const sort = { createdAt: -1 };

//       let query = {
//         organizationId: mongoose.Types.ObjectId(organizationId),
//         isActive: true
//       };


//       const sourceType = config.sourceType || 'rule';

//       if (sourceType === 'category' && config.sourceValue) {
//         const categoryId = await this.resolveMasterId(organizationId, 'category', config.sourceValue);
//         if (categoryId) query.categoryId = categoryId;
//         else return [];
//       }
//       else if (sourceType === 'brand' && config.sourceValue) {
//         const brandId = await this.resolveMasterId(organizationId, 'brand', config.sourceValue);
//         if (brandId) query.brandId = brandId;
//         else return [];
//       }


//       if (sourceType === 'rule' || config.ruleType) {


//         if (config.ruleType === 'dead_stock') {
//           const threeMonthsAgo = new Date();
//           threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

//           query.inventory = { $elemMatch: { quantity: { $gt: 5 } } };
//           query.$or = [
//             { lastSold: { $exists: false } },
//             { lastSold: { $lt: threeMonthsAgo } }
//           ];
//           sort.createdAt = 1;
//         }


//         else if (config.ruleType === 'heavy_discount') {
//           query.discountedPrice = { $exists: true, $ne: null };


//           const minDiscount = parseInt(config.minDiscount || 0);

//           if (minDiscount > 0) {
//             const factor = 1 - (minDiscount / 100);
//             query.$expr = {
//               $lte: ["$discountedPrice", { $multiply: ["$sellingPrice", factor] }]
//             };
//           }

//           sort.createdAt = -1;
//         }


//         else if (config.ruleType === 'featured') {
//           query.tags = 'featured';
//         }


//         else if (config.ruleType) {
//           const products = await SmartRuleEngine.executeAdHocRule(config, organizationId);
//           return this.transformProductsForPublic(products);
//         }
//       }


//       const products = await Product.find(query)
//         .select('name slug description images sellingPrice discountedPrice categoryId brandId tags sku inventory lastSold')
//         .sort(sort)
//         .limit(limit)
//         .populate('categoryId brandId', 'name slug imageUrl')
//         .lean();

//       return this.transformProductsForPublic(products);

//     } catch (error) {
//       console.error('Error hydrating smart section:', error);
//       return [];
//     }
//   }
//   async resolveMasterId(organizationId, type, value) {
//     if (mongoose.Types.ObjectId.isValid(value)) return value;
//     const master = await Master.findOne({
//       organizationId, type, $or: [{ slug: value }, { name: { $regex: new RegExp(`^${value}$`, 'i') } }]
//     }).select('_id');
//     return master ? master._id : null;
//   }

//   async hydrateManualSection(section, organizationId) {
//     if (!section.manualData?.productIds?.length) return [];
//     try {
//       const products = await Product.find({
//         _id: { $in: section.manualData.productIds },
//         organizationId,
//         isActive: true
//       })
//         .populate('categoryId brandId', 'name slug')
//         .lean();
//       return this.transformProductsForPublic(products);
//     } catch (error) {
//       console.error('Error hydrating manual section:', error);
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
//     const limit = config.limit || 12;
//     if (!config.sourceType || config.sourceType === 'dynamic') {
//       const query = {
//         organizationId: mongoose.Types.ObjectId(organizationId),
//         type: 'category',
//         isActive: true
//       };
//       if (config.selectedCategories && config.selectedCategories.length > 0) {
//         query._id = { $in: config.selectedCategories.map(id => mongoose.Types.ObjectId(id)) };
//       }
//       const masters = await Master.find(query)
//         .sort({ 'metadata.sortOrder': 1, createdAt: -1 })
//         .limit(limit)
//         .lean();
//       let countsMap = {};
//       if (config.showProductCount) {
//         const counts = await Product.aggregate([
//           { $match: { organizationId: mongoose.Types.ObjectId(organizationId), isActive: true } },
//           { $group: { _id: '$categoryId', count: { $sum: 1 } } }
//         ]);
//         countsMap = counts.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {});
//       }

//       return masters.map(master => ({
//         id: master._id,
//         name: master.name,
//         image: master.imageUrl || 'assets/placeholder-category.jpg',
//         linkUrl: `/products?category=${master._id}`,
//         slug: master.slug,
//         productCount: countsMap[master._id] || 0
//       }));
//     }

//     if (config.sourceType === 'manual' && config.categories) {
//       return config.categories.map(cat => ({
//         id: 'manual_' + nanoid(6),
//         name: cat.name,
//         image: cat.image,
//         linkUrl: cat.linkUrl || `/products?category=${encodeURIComponent(cat.name)}`,
//         productCount: null
//       }));
//     }
//     return [];
//   }
//   async hydrateNavigation(section, organizationId) {
//     if (!section.config) section.config = {};
//     if (!section.config.menuItems) section.config.menuItems = [];
//     const pages = await StorefrontPage.find({
//       organizationId,
//       status: 'published',
//       isPublished: true
//     })
//       .select('name slug isHomepage pageType')
//       .sort({ isHomepage: -1, createdAt: 1 })
//       .lean();
//     const dynamicLinks = pages.map(page => ({
//       label: page.name,
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

//   async getBranches(organizationId) {
//     return await Branch.find({ organizationId, isActive: true, isDeleted: false }).lean();
//   }
//   transformProductsForPublic(products) {
//     if (!Array.isArray(products)) return [];
//     return products.map(p => {
//       const totalStock = p.inventory?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
//       let discountPercentage = 0;
//       let hasDiscount = false;
//       if (p.discountedPrice && p.discountedPrice < p.sellingPrice) {
//         hasDiscount = true;
//         discountPercentage = Math.round(((p.sellingPrice - p.discountedPrice) / p.sellingPrice) * 100);
//       }
//       let stockStatus = 'In Stock';
//       if (totalStock === 0) stockStatus = 'Out of Stock';
//       else if (totalStock < 5) stockStatus = 'Low Stock';
//       const isNew = p.createdAt && (new Date() - new Date(p.createdAt) < 14 * 24 * 60 * 60 * 1000);
//       return {
//         id: p._id,
//         name: p.name,
//         slug: p.slug,
//         images: p.images || [],
//         category: p.categoryId?.name || null,
//         brand: p.brandId?.name || null,
//         price: {
//           original: p.sellingPrice,
//           discounted: p.discountedPrice,
//           currency: 'INR',
//           hasDiscount: hasDiscount,
//           discountLabel: hasDiscount ? `${discountPercentage}% OFF` : null
//         },
//         stock: {
//           available: totalStock > 0,
//           quantity: totalStock,
//           status: stockStatus
//         },
//         tags: p.tags || [],
//         isNew: isNew,
//         url: `/products/${p.slug}`
//       };
//     });
//   }
// }
// module.exports = new DataHydrationService();
