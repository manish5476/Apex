const mongoose = require('mongoose');
const Product = require('../../../modules/inventory/core/product.model');
const Organization = require('../../../modules/organization/core/organization.model');
const Master = require('../../../modules/master/core/master.model');
const AppError = require('../../../core/utils/appError');
const redis = require('../../../core/utils/_legacy/redis');

class ProductPublicController {

  /**
   * ============================================================
   * 1. ADVANCED PRODUCT LISTING (The "Amazon" Endpoint)
   * Supports: Multi-select, Price Ranges, Search, Sorting, & Facets
   * Route: GET /public/:organizationSlug/products
   * ============================================================
   */
  getProducts = async (req, res, next) => {
    try {
      const { organizationSlug } = req.params;
      const { 
        page = 1, limit = 24, 
        sort = 'newest', 
        q, // Search query
        category, brand, 
        minPrice, maxPrice, 
        tags, 
        inStock,
        includeFacets = 'true' // If true, calculates filter counts (heavy op)
      } = req.query;

      // 1. Resolve Org (Cache this ID ideally, but fast enough via index)
      const organization = await Organization.findOne({
        uniqueShopId: organizationSlug.toUpperCase(),
        isActive: true
      }).select('_id currency');

      if (!organization) return next(new AppError('Store not found', 404));

      // 2. BUILD THE MATCHER (The Filtering Engine)
      const matchStage = { 
        organizationId: organization._id, 
        isActive: true,
        isDeleted: { $ne: true } // Safety check if you added soft delete
      };

      // A. Text Search (Regex is safer for partial matches than $text)
      if (q) {
        const regex = new RegExp(q.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
        matchStage.$or = [
          { name: regex },
          { sku: regex },
          { tags: regex }
        ];
      }

      // B. Multi-Select Categories (?category=id1,id2)
      if (category) {
        const catIds = category.split(',').filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => mongoose.Types.ObjectId(id));
        if (catIds.length) matchStage.categoryId = { $in: catIds };
      }

      // C. Multi-Select Brands (?brand=id1,id2)
      if (brand) {
        const brandIds = brand.split(',').filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => mongoose.Types.ObjectId(id));
        if (brandIds.length) matchStage.brandId = { $in: brandIds };
      }

      // D. Price Range
      if (minPrice || maxPrice) {
        matchStage.sellingPrice = {};
        if (minPrice) matchStage.sellingPrice.$gte = Number(minPrice);
        if (maxPrice) matchStage.sellingPrice.$lte = Number(maxPrice);
      }

      // E. Tags
      if (tags) {
        const tagList = tags.split(',').map(t => new RegExp(`^${t.trim()}$`, 'i'));
        matchStage.tags = { $in: tagList };
      }

      // F. In Stock Only
      if (inStock === 'true') {
        matchStage.inventory = { $elemMatch: { quantity: { $gt: 0 } } };
      }

      // 3. BUILD SORTING
      let sortStage = { createdAt: -1 }; // Default: Newest
      if (sort === 'price_asc') sortStage = { sellingPrice: 1 };
      else if (sort === 'price_desc') sortStage = { sellingPrice: -1 };
      else if (sort === 'name_asc') sortStage = { name: 1 };
      else if (sort === 'popularity') sortStage = { views: -1 }; // Assumes views/salesCount exists

      // 4. EXECUTE AGGREGATION PIPELINE (The "Big Organization" Way)
      // We use aggregation instead of .find() to get Facets + Products in one go
      const pipeline = [
        { $match: matchStage },
        { 
          $facet: {
            // -- Branch 1: The Products --
            products: [
              { $sort: sortStage },
              { $skip: (Number(page) - 1) * Number(limit) },
              { $limit: Number(limit) },
              // Lookup details only for the paginated subset (Performance)
              { $lookup: { from: 'masters', localField: 'categoryId', foreignField: '_id', as: 'category' } },
              { $lookup: { from: 'masters', localField: 'brandId', foreignField: '_id', as: 'brand' } },
              { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
              { $unwind: { path: '$brand', preserveNullAndEmptyArrays: true } }
            ],
            // -- Branch 2: Total Count (For Pagination) --
            totalCount: [{ $count: 'count' }],
          }
        }
      ];

      // Add Facets (Filter Counts) if requested
      // This tells the UI: "Nike (5 items), Adidas (2 items)"
      if (includeFacets === 'true') {
        pipeline[0].$facet.facets = [
          { 
            $facet: {
              brands: [
                { $group: { _id: '$brandId', count: { $sum: 1 } } },
                { $lookup: { from: 'masters', localField: '_id', foreignField: '_id', as: 'info' } },
                { $project: { id: '$_id', name: { $arrayElemAt: ['$info.name', 0] }, count: 1 } }
              ],
              categories: [
                { $group: { _id: '$categoryId', count: { $sum: 1 } } },
                { $lookup: { from: 'masters', localField: '_id', foreignField: '_id', as: 'info' } },
                { $project: { id: '$_id', name: { $arrayElemAt: ['$info.name', 0] }, count: 1 } }
              ],
              price: [
                { $group: { _id: null, min: { $min: '$sellingPrice' }, max: { $max: '$sellingPrice' } } }
              ]
            }
          }
        ];
      }

      const [result] = await Product.aggregate(pipeline);
      
      const products = result.products || [];
      const total = result.totalCount?.[0]?.count || 0;
      const facets = result.facets?.[0] || {};

      // 5. TRANSFORM RESPONSE (Clean JSON for Frontend)
      const cleanProducts = products.map(p => this.transformProduct(p, organizationSlug));

      res.status(200).json({
        meta: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        },
        facets: includeFacets === 'true' ? facets : undefined,
        products: cleanProducts
      });

    } catch (err) {
      next(err);
    }
  }

  /**
   * ============================================================
   * 2. SINGLE PRODUCT + RELATED ITEMS
   * Route: GET /public/:organizationSlug/products/:productSlug
   * ============================================================
   */
  getProductBySlug = async (req, res, next) => {
    try {
      const { organizationSlug, productSlug } = req.params;

      const organization = await Organization.findOne({
        uniqueShopId: organizationSlug.toUpperCase(),
        isActive: true
      }).select('_id name');

      if (!organization) return next(new AppError('Store not found', 404));

      // 1. Fetch Main Product
      const product = await Product.findOne({
        organizationId: organization._id,
        slug: productSlug,
        isActive: true
      })
      .populate('categoryId', 'name slug imageUrl')
      .populate('brandId', 'name slug')
      .lean();

      if (!product) return next(new AppError('Product not found', 404));

      // 2. Fetch Related Products (Cross-Selling Algorithm)
      // Logic: Same Category OR Same Brand, excluding self, limit 8
      const relatedProducts = await Product.find({
        organizationId: organization._id,
        isActive: true,
        _id: { $ne: product._id }, // Exclude self
        $or: [
          { categoryId: product.categoryId?._id },
          { brandId: product.brandId?._id }
        ]
      })
      .select('name slug images sellingPrice discountedPrice categoryId')
      .limit(8)
      .sort({ views: -1 }) // Show popular related items
      .lean();

      // 3. Increment View Count (Fire & Forget)
      Product.findByIdAndUpdate(product._id, { $inc: { views: 1 } }).exec();

      res.status(200).json({
        product: this.transformProduct(product, organizationSlug),
        related: relatedProducts.map(p => this.transformProduct(p, organizationSlug)),
        breadcrumbs: [
          { label: 'Home', url: '/' },
          { label: 'Shop', url: '/products' },
          { label: product.categoryId?.name || 'Category', url: `/products?category=${product.categoryId?._id}` },
          { label: product.name, url: null } // Current page
        ]
      });

    } catch (err) {
      next(err);
    }
  }

  /**
   * ============================================================
   * 3. INSTANT SEARCH (Autocomplete)
   * Lightweight endpoint for the search bar dropdown
   * Route: GET /public/:organizationSlug/search
   * ============================================================
   */
  searchProducts = async (req, res, next) => {
    try {
      const { organizationSlug } = req.params;
      const { q } = req.query;

      if (!q || q.length < 2) return res.status(200).json([]);

      const organization = await Organization.findOne({ uniqueShopId: organizationSlug.toUpperCase() }).select('_id');
      
      const regex = new RegExp(q.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');

      const results = await Product.find({
        organizationId: organization._id,
        isActive: true,
        $or: [{ name: regex }, { sku: regex }]
      })
      .select('name slug images sellingPrice categoryId')
      .populate('categoryId', 'name')
      .limit(6)
      .lean();

      res.status(200).json(results.map(p => ({
        name: p.name,
        slug: p.slug,
        image: p.images?.[0],
        price: p.sellingPrice,
        category: p.categoryId?.name,
        url: `/products/${p.slug}`
      })));

    } catch (err) {
      next(err);
    }
  }

  /**
   * ============================================================
   * HELPER: Standardize Product JSON
   * Ensures consistent frontend data structure
   * ============================================================
   */
  transformProduct(p, orgSlug) {
    const totalStock = p.inventory?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 0;
    
    return {
      id: p._id,
      name: p.name,
      slug: p.slug,
      sku: p.sku,
      description: p.description,
      // Images: Ensure at least one fallback
      images: (p.images && p.images.length) ? p.images : ['https://via.placeholder.com/300'],
      image: (p.images && p.images.length) ? p.images[0] : 'https://via.placeholder.com/300',
      
      price: {
        original: p.sellingPrice,
        discounted: p.discountedPrice || null,
        // Calculate saving percentage for UI badge
        discountPercent: (p.discountedPrice && p.discountedPrice < p.sellingPrice) 
          ? Math.round(((p.sellingPrice - p.discountedPrice) / p.sellingPrice) * 100) 
          : 0,
        currency: 'USD' // Should come from Organization settings in a real app
      },

      // Flatten nested objects safely
      category: p.category?.name || p.categoryId?.name || null,
      categoryId: p.category?._id || p.categoryId?._id || p.categoryId,
      brand: p.brand?.name || p.brandId?.name || null,
      
      tags: p.tags || [],
      
      stock: {
        inStock: totalStock > 0,
        qty: totalStock,
        isLow: totalStock > 0 && totalStock < 5
      },
      
      link: `/products/${p.slug}`
    };
  }
}

module.exports = new ProductPublicController();

// const Product = require('../../../modules/inventory/core/product.model');
// const Organization = require('../../../modules/organization/core/organization.model');
// const Master = require('../../../modules/master/core/master.model');
// const AppError = require('../../../core/utils/appError');
// const redis = require('../../../core/utils/_legacy/redis'); // Your Redis utility

// class ProductPublicController {

//   /**
//    * GET PRODUCTS (Listing + Pagination)
//    */
//   getProducts = async (req, res, next) => {
//     try {
//       const { organizationSlug } = req.params;
//       const { 
//         page = 1, limit = 20, 
//         sortBy = 'createdAt', sortOrder = 'desc', 
//         category, brand, minPrice, maxPrice, search, tags 
//       } = req.query;

//       // 1. Organization Check
//       const organization = await Organization.findOne({
//         uniqueShopId: organizationSlug.toUpperCase(),
//         isActive: true
//       }).select('_id');

//       if (!organization) return next(new AppError('Store not found', 404));

//       // 2. Build Query
//       const query = { organizationId: organization._id, isActive: true };

//       // Handle Category/Brand Lookups (ID vs Slug)
//       if (category) query.categoryId = category; // Assumes Frontend sends ID. If Slug, need lookup.
//       if (brand) query.brandId = brand;
      
//       if (minPrice || maxPrice) {
//         query.sellingPrice = {};
//         if (minPrice) query.sellingPrice.$gte = Number(minPrice);
//         if (maxPrice) query.sellingPrice.$lte = Number(maxPrice);
//       }

//       if (search) {
//         query.$text = { $search: search }; // Requires Text Index on Product Model
//       }

//       // 3. Execute Query
//       const skip = (page - 1) * limit;
      
//       const [products, total] = await Promise.all([
//         Product.find(query)
//           .select('name slug description images sellingPrice discountedPrice categoryId brandId tags sku inventory')
//           .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
//           .skip(skip)
//           .limit(Number(limit))
//           .populate('categoryId', 'name slug')
//           .populate('brandId', 'name')
//           .lean(),
//         Product.countDocuments(query)
//       ]);

//       // 4. Transform (Pro Format)
//       const transformed = products.map(p => ({
//         id: p._id,
//         name: p.name,
//         slug: p.slug,
//         image: p.images?.[0] || null,
//         price: {
//           original: p.sellingPrice,
//           discounted: p.discountedPrice,
//           hasDiscount: !!(p.discountedPrice && p.discountedPrice < p.sellingPrice)
//         },
//         category: p.categoryId?.name,
//         brand: p.brandId?.name,
//         stock: {
//           available: p.inventory?.some(inv => inv.quantity > 0)
//         }
//       }));

//       res.status(200).json({
//         products: transformed,
//         pagination: {
//           page: Number(page),
//           limit: Number(limit),
//           total,
//           pages: Math.ceil(total / limit)
//         }
//       });

//     } catch (err) {
//       next(err);
//     }
//   }

//   /**
//    * GET FILTERS (Cached!)
//    * Returns available Brands, Categories, and Price Range for the sidebar
//    */
//   getShopFilters = async (req, res, next) => {
//     try {
//       const { organizationSlug } = req.params;
//       const cacheKey = `filters:${organizationSlug}`;

//       // 1. Try Cache First
//       if (redis.status === 'ready') {
//         const cached = await redis.get(cacheKey);
//         if (cached) return res.status(200).json(JSON.parse(cached));
//       }

//       const organization = await Organization.findOne({ 
//         uniqueShopId: organizationSlug.toUpperCase() 
//       }).select('_id');

//       // 2. Heavy Aggregation
//       const [categories, brands, priceRange] = await Promise.all([
//         // Count products per Category
//         Product.aggregate([
//           { $match: { organizationId: organization._id, isActive: true } },
//           { $group: { _id: '$categoryId', count: { $sum: 1 } } },
//           { $lookup: { from: 'masters', localField: '_id', foreignField: '_id', as: 'm' } },
//           { $unwind: '$m' },
//           { $project: { id: '$_id', name: '$m.name', count: 1 } },
//           { $sort: { count: -1 } }
//         ]),
//         // Count products per Brand
//         Product.aggregate([
//           { $match: { organizationId: organization._id, isActive: true } },
//           { $group: { _id: '$brandId', count: { $sum: 1 } } },
//           { $lookup: { from: 'masters', localField: '_id', foreignField: '_id', as: 'm' } },
//           { $unwind: '$m' },
//           { $project: { id: '$_id', name: '$m.name', count: 1 } },
//           { $sort: { name: 1 } }
//         ]),
//         // Get Min/Max Price
//         Product.aggregate([
//           { $match: { organizationId: organization._id, isActive: true } },
//           { $group: { _id: null, min: { $min: '$sellingPrice' }, max: { $max: '$sellingPrice' } } }
//         ])
//       ]);

//       const responseData = {
//         categories,
//         brands,
//         price: priceRange[0] || { min: 0, max: 0 }
//       };

//       // 3. Save to Cache (5 Minutes)
//       if (redis.status === 'ready') {
//         await redis.setex(cacheKey, 300, JSON.stringify(responseData));
//       }

//       res.status(200).json(responseData);

//     } catch (err) {
//       next(err);
//     }
//   }
// }

// module.exports = new ProductPublicController();

// // const Product = require('../../../modules/inventory/core/product.model');
// // const Organization = require('../../../modules/organization/core/organization.model');
// // const Master = require('../../../modules/master/core/master.model'); // ✅ Import Master for lookups
// // const AppError = require('../../../core/utils/appError');

// // // ✅ IMPORTS FOR LAYOUT
// // const LayoutService = require('../../services/storefront/layout.service');
// // const DataHydrationService = require('../../services/storefront/dataHydration.service');

// // const { buildProductSchema } = require('../../utils/constants/seo/productSchema.util');
// // const { buildProductListSchema } = require('../../utils/constants/seo/productListSchema.util');
// // const { buildCanonicalUrl, buildRobotsMeta } = require('../../utils/constants/seo/seo.util');

// // const MAX_LIMIT = 50;
// // const ALLOWED_SORT_FIELDS = ['createdAt', 'sellingPrice', 'name', 'views'];

// // class ProductPublicController {

// //   // =====================================================
// //   // 1. GET PRODUCTS (LISTING + FILTERS + LAYOUT)
// //   // =====================================================
// //   getProducts = async (req, res, next) => {
// //     try {
// //       const { organizationSlug } = req.params;
// //       let {page = 1,limit = 20,sortBy = 'createdAt',sortOrder = 'desc',category,brand,subCategory,minPrice,maxPrice,search,tags,inStock
// //       } = req.query;

// //       // 1. Normalize Inputs
// //       page = Math.max(parseInt(page, 10) || 1, 1);
// //       limit = Math.min(parseInt(limit, 10) || 20, MAX_LIMIT);
// //       sortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
// //       sortOrder = sortOrder === 'asc' ? 'asc' : 'desc';
// //       const skip = (page - 1) * limit;

// //       // 2. Resolve Organization
// //       const organization = await Organization.findOne({
// //         uniqueShopId: organizationSlug.toUpperCase(),
// //         isActive: true
// //       }).select('_id name uniqueShopId primaryEmail primaryPhone logo');

// //       if (!organization) return next(new AppError('Store not found', 404));

// //       // 3. Build Query
// //       const query = {
// //         organizationId: organization._id,
// //         isActive: true
// //       };

// //       // ---------------------------------------------------------
// //       // 🔍 SMART FILTERING (Name -> ID Lookup)
// //       // ---------------------------------------------------------
// //       // If user sends ?category=Electronics, we need to find the ID for "Electronics"
      
// //       if (category) {
// //         // Check if it's a valid ObjectId, otherwise treat as Name
// //         if (category.match(/^[0-9a-fA-F]{24}$/)) {
// //            query.categoryId = category;
// //         } else {
// //            // Lookup Master ID by Name
// //            const catMaster = await Master.findOne({ 
// //              organizationId: organization._id, 
// //              type: 'category', 
// //              name: { $regex: new RegExp(`^${category}$`, 'i') } 
// //            }).select('_id');
// //            if (catMaster) query.categoryId = catMaster._id;
// //         }
// //       }

// //       if (brand) {
// //         if (brand.match(/^[0-9a-fA-F]{24}$/)) {
// //            query.brandId = brand;
// //         } else {
// //            const brandMaster = await Master.findOne({ 
// //              organizationId: organization._id, 
// //              type: 'brand', 
// //              name: { $regex: new RegExp(`^${brand}$`, 'i') } 
// //            }).select('_id');
// //            if (brandMaster) query.brandId = brandMaster._id;
// //         }
// //       }

// //       if (subCategory) {
// //          if (subCategory.match(/^[0-9a-fA-F]{24}$/)) {
// //            query.subCategoryId = subCategory;
// //         }
// //       }

// //       if (tags) {
// //         const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
// //         if (tagList.length > 0) query.tags = { $in: tagList };
// //       }

// //       if (minPrice || maxPrice) {
// //         query.sellingPrice = {};
// //         if (minPrice) query.sellingPrice.$gte = Number(minPrice);
// //         if (maxPrice) query.sellingPrice.$lte = Number(maxPrice);
// //       }

// //       if (search) {
// //         const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
// //         query.$or = [
// //           { name: { $regex: searchRegex } },
// //           { description: { $regex: searchRegex } },
// //           { sku: { $regex: searchRegex } }
// //         ];
// //       }

// //       if (inStock === 'true') {
// //         // Query inside inventory array
// //         query.inventory = { $elemMatch: { quantity: { $gt: 0 } } };
// //       }

// //       // 4. Execute Queries (Parallel)
// //       // Note: Product.find() will auto-populate via your Model's 'pre' hook
// //       const [products, total, layoutData] = await Promise.all([
// //         Product.find(query)
// //           // .select() is optional if you want everything, but good for performance
// //           .select('name slug description images sellingPrice discountedPrice categoryId brandId tags sku inventory')
// //           .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
// //           .skip(skip)
// //           .limit(limit)
// //           .lean(),
// //         Product.countDocuments(query),
// //         LayoutService.getLayout(organization._id)
// //       ]);

// //       // 5. Hydrate Layout
// //       const [hydratedHeader, hydratedFooter] = await Promise.all([
// //         DataHydrationService.hydrateSections(layoutData.header, organization._id),
// //         DataHydrationService.hydrateSections(layoutData.footer, organization._id)
// //       ]);

// //       // 6. Transform Data (Handle Populated References)
// //       const transformed = products.map(p => {
// //         const totalStock = p.inventory?.reduce((sum, inv) => sum + (inv.quantity || 0), 0) || 0;
        
// //         return {
// //           id: p._id,
// //           name: p.name,
// //           slug: p.slug,
// //           description: p.description, 
// //           image: p.images?.[0] || null, // Main image
// //           images: p.images || [],
          
// //           // ✅ Correctly map Populated Object to String Name
// //           brand: p.brandId?.name || null,
// //           category: p.categoryId?.name || null,
          
// //           price: {
// //             original: p.sellingPrice,
// //             discounted: p.discountedPrice,
// //             currency: 'USD',
// //             hasDiscount: !!(p.discountedPrice && p.discountedPrice < p.sellingPrice)
// //           },
          
// //           tags: p.tags || [],
// //           sku: p.sku,
// //           stock: {
// //             available: totalStock > 0,
// //             qty: totalStock 
// //           },
// //           url: `/store/${organizationSlug}/products/${p.slug}`
// //         };
// //       });

// //       // 7. SEO
// //       const listSchema = buildProductListSchema(transformed);
// //       res.set({
// //         'Link': `<${buildCanonicalUrl(req)}>; rel="canonical"`,
// //         'X-Robots-Tag': buildRobotsMeta(false)
// //       });

// //       // 8. Response
// //       res.status(200).json({
// //         organization: {
// //           id: organization._id,
// //           name: organization.name,
// //           slug: organizationSlug,
// //           logo: organization.logo,
// //           contact: {
// //              email: organization.primaryEmail,
// //              phone: organization.primaryPhone
// //           }
// //         },
// //         layout: {
// //           header: hydratedHeader,
// //           footer: hydratedFooter
// //         },
// //         settings: layoutData.globalSettings || {},
        
// //         products: transformed,
// //         pagination: {
// //           page,
// //           limit,
// //           total,
// //           pages: Math.ceil(total / limit)
// //         },
// //         seo: {
// //           canonical: buildCanonicalUrl(req),
// //           jsonLd: listSchema
// //         }
// //       });

// //     } catch (err) {
// //       next(err);
// //     }
// //   }

// //   // =====================================================
// //   // 2. GET SINGLE PRODUCT
// //   // =====================================================
// //   getProductBySlug = async (req, res, next) => {
// //     try {
// //       const { organizationSlug, productSlug } = req.params;

// //       const organization = await Organization.findOne({
// //         uniqueShopId: organizationSlug.toUpperCase(),
// //         isActive: true
// //       }).select('_id name uniqueShopId primaryEmail primaryPhone logo');

// //       if (!organization) return next(new AppError('Store not found', 404));

// //       const [product, layoutData] = await Promise.all([
// //         Product.findOne({
// //           organizationId: organization._id,
// //           slug: productSlug,
// //           isActive: true
// //         }).lean(), // Auto-populates via model hook
// //         LayoutService.getLayout(organization._id)
// //       ]);

// //       if (!product) return next(new AppError('Product not found', 404));

// //       const [hydratedHeader, hydratedFooter] = await Promise.all([
// //         DataHydrationService.hydrateSections(layoutData.header, organization._id),
// //         DataHydrationService.hydrateSections(layoutData.footer, organization._id)
// //       ]);

// //       this.incrementProductViews(product._id);

// //       const totalStock = product.inventory?.reduce((sum, inv) => sum + (inv.quantity || 0), 0) || 0;

// //       const publicProduct = {
// //         id: product._id,
// //         name: product.name,
// //         slug: product.slug,
// //         description: product.description,
// //         images: product.images || [],
        
// //         price: {
// //           original: product.sellingPrice,
// //           discounted: product.discountedPrice,
// //           currency: 'USD',
// //           taxRate: product.taxRate,
// //           isTaxInclusive: product.isTaxInclusive,
// //           hasDiscount: !!(product.discountedPrice && product.discountedPrice < product.sellingPrice)
// //         },

// //         // ✅ Map References to Full Objects or Names
// //         category: {
// //             id: product.categoryId?._id,
// //             name: product.categoryId?.name,
// //             image: product.categoryId?.imageUrl
// //         },
// //         brand: {
// //             id: product.brandId?._id,
// //             name: product.brandId?.name
// //         },
// //         unit: product.unitId?.name,
        
// //         tags: product.tags || [],
// //         sku: product.sku,
// //         stock: {
// //           available: totalStock > 0,
// //           quantity: totalStock,
// //           lowStock: totalStock > 0 && totalStock < 5
// //         },
// //         organization: {
// //           id: organization._id,
// //           name: organization.name
// //         }
// //       };

// //       const schema = buildProductSchema(publicProduct, organizationSlug);

// //       res.status(200).json({
// //         organization: { /*... simple org details ...*/ }, // (Simplified for brevity, same as list)
// //         layout: { header: hydratedHeader, footer: hydratedFooter },
// //         settings: layoutData.globalSettings || {},
// //         product: publicProduct,
// //         seo: { canonical: buildCanonicalUrl(req), jsonLd: schema },
// //         breadcrumbs: [
// //           { name: 'Home', url: `/store/${organizationSlug}` },
// //           { name: 'Products', url: `/store/${organizationSlug}/products` },
// //           { name: publicProduct.category?.name || 'Category', url: `/store/${organizationSlug}/products?category=${publicProduct.category?.id}` },
// //           { name: product.name, url: `#` }
// //         ]
// //       });

// //     } catch (err) { next(err); }
// //   }

// //     getTags = async (req, res, next) => {
// //     try {
// //       const { organizationSlug } = req.params;
// //       const organization = await Organization.findOne({
// //         uniqueShopId: organizationSlug.toUpperCase(),
// //         isActive: true
// //       }).select('_id');

// //       if (!organization) return next(new AppError('Store not found', 404));

// //       const tags = await Product.aggregate([
// //         { $match: { organizationId: organization._id, isActive: true, tags: { $exists: true, $ne: [] } } },
// //         { $unwind: '$tags' },
// //         { $group: { _id: '$tags' } },
// //         { $limit: 50 },
// //         { $sort: { _id: 1 } }
// //       ]);

// //       res.set({ 'X-Robots-Tag': buildRobotsMeta(true) });
// //       res.status(200).json({ count: tags.length, tags: tags.map(t => t._id) });
// //     } catch (err) { next(err); }
// //   }
// //   // =====================================================
// //   // 3. GET CATEGORIES (Aggregated from Products)
// //   // =====================================================
// //   getCategories = async (req, res, next) => {
// //     try {
// //       const { organizationSlug } = req.params;
// //       const organization = await Organization.findOne({ uniqueShopId: organizationSlug.toUpperCase() }).select('_id');
// //       if (!organization) return next(new AppError('Store not found', 404));

// //       // ✅ Aggregate by categoryId reference
// //       const categories = await Product.aggregate([
// //         { $match: { organizationId: organization._id, isActive: true, categoryId: { $exists: true } } },
// //         { 
// //             $group: { 
// //                 _id: '$categoryId', // Group by Reference ID
// //                 productCount: { $sum: 1 } 
// //             } 
// //         },
// //         // ✅ Lookup to get Name from Masters
// //         {
// //             $lookup: {
// //                 from: 'masters',
// //                 localField: '_id',
// //                 foreignField: '_id',
// //                 as: 'masterInfo'
// //             }
// //         },
// //         { $unwind: '$masterInfo' },
// //         { 
// //             $project: { 
// //                 _id: 1, 
// //                 name: '$masterInfo.name', 
// //                 image: '$masterInfo.imageUrl',
// //                 count: '$productCount' 
// //             } 
// //         },
// //         { $sort: { count: -1 } }
// //       ]);

// //       res.status(200).json({ results: categories });
// //     } catch (err) { next(err); }
// //   }

// //   // =====================================================
// //   // 4. NEW: GET BRANDS (Aggregated from Products)
// //   // =====================================================
// //   getBrands = async (req, res, next) => {
// //     try {
// //       const { organizationSlug } = req.params;
// //       const organization = await Organization.findOne({ uniqueShopId: organizationSlug.toUpperCase() }).select('_id');
// //       if (!organization) return next(new AppError('Store not found', 404));

// //       const brands = await Product.aggregate([
// //         { $match: { organizationId: organization._id, isActive: true, brandId: { $exists: true } } },
// //         { 
// //             $group: { 
// //                 _id: '$brandId', 
// //                 productCount: { $sum: 1 } 
// //             } 
// //         },
// //         {
// //             $lookup: {
// //                 from: 'masters',
// //                 localField: '_id',
// //                 foreignField: '_id',
// //                 as: 'brandInfo'
// //             }
// //         },
// //         { $unwind: '$brandInfo' },
// //         { 
// //             $project: { 
// //                 _id: 1, 
// //                 name: '$brandInfo.name', 
// //                 count: '$productCount' 
// //             } 
// //         },
// //         { $sort: { name: 1 } }
// //       ]);

// //       res.status(200).json({ results: brands });
// //     } catch (err) { next(err); }
// //   }

// //   // =====================================================
// //   // 5. NEW: GET SHOP FILTERS (Combined Facets)
// //   // =====================================================
// //   // Returns Categories, Brands, and Price Range in one call
// //   getShopFilters = async (req, res, next) => {
// //       try {
// //         const { organizationSlug } = req.params;
// //         const organization = await Organization.findOne({ uniqueShopId: organizationSlug.toUpperCase() }).select('_id');
        
// //         // Parallel aggregation
// //         const [categories, brands, priceRange] = await Promise.all([
// //             // 1. Categories
// //             Product.aggregate([
// //                 { $match: { organizationId: organization._id, isActive: true } },
// //                 { $group: { _id: '$categoryId', count: { $sum: 1 } } },
// //                 { $lookup: { from: 'masters', localField: '_id', foreignField: '_id', as: 'm' } },
// //                 { $unwind: '$m' },
// //                 { $project: { id: '$_id', name: '$m.name', count: 1, _id: 0 } },
// //                 { $sort: { count: -1 } }
// //             ]),
// //             // 2. Brands
// //             Product.aggregate([
// //                 { $match: { organizationId: organization._id, isActive: true } },
// //                 { $group: { _id: '$brandId', count: { $sum: 1 } } },
// //                 { $lookup: { from: 'masters', localField: '_id', foreignField: '_id', as: 'm' } },
// //                 { $unwind: '$m' },
// //                 { $project: { id: '$_id', name: '$m.name', count: 1, _id: 0 } },
// //                 { $sort: { name: 1 } }
// //             ]),
// //             // 3. Price Stats
// //             Product.aggregate([
// //                 { $match: { organizationId: organization._id, isActive: true } },
// //                 { $group: { _id: null, min: { $min: '$sellingPrice' }, max: { $max: '$sellingPrice' } } }
// //             ])
// //         ]);

// //         res.status(200).json({
// //             categories,
// //             brands,
// //             price: priceRange[0] || { min: 0, max: 0 }
// //         });
// //       } catch(err) { next(err); }
// //   }

// //   // =====================================================
// //   // 6. SEARCH (Simple Text)
// //   // =====================================================
// //   searchProducts = async (req, res, next) => {
// //     try {
// //       const { organizationSlug } = req.params;
// //       const q = (req.query.q || '').trim();
      
// //       if (q.length < 2) return res.status(200).json({ results: [] });

// //       const organization = await Organization.findOne({
// //         uniqueShopId: organizationSlug.toUpperCase(),
// //         isActive: true
// //       }).select('_id');

// //       // Note: For searching by Category NAME in a text search, you usually need 
// //       // a generic text index on the Product collection that includes the populated string, 
// //       // OR perform a Master search first. 
// //       // Here we search Product Name/SKU/Tags
// //       const results = await Product.find({
// //         organizationId: organization._id,
// //         isActive: true,
// //         $or: [
// //           { name: { $regex: q, $options: 'i' } },
// //           { sku: { $regex: q, $options: 'i' } },
// //           { tags: { $regex: q, $options: 'i' } }
// //         ]
// //       })
// //       .select('name slug images sellingPrice categoryId')
// //       .limit(10)
// //       .lean();
// //       res.status(200).json({
// //         query: q,
// //         results: results.map(p => ({
// //           id: p._id,
// //           name: p.name,
// //           slug: p.slug,
// //           image: p.images?.[0],
// //           price: p.sellingPrice,
// //           category: p.categoryId?.name, // Auto-populated
// //           url: `/store/${organizationSlug}/products/${p.slug}`
// //         }))
// //       });
// //     } catch (err) { next(err); }
// //   }
// //   incrementProductViews = async (productId) => {
// //     try { await Product.findByIdAndUpdate(productId, { $inc: { views: 1 } }); } catch (_) {}
// //   }
// // }
// // module.exports = new ProductPublicController();







// // // const Product = require('../../../modules/inventory/core/product.model');
// // // const Organization = require('../../../modules/organization/core/organization.model');
// // // const AppError = require('../../../core/utils/appError');

// // // // ✅ NEW IMPORTS FOR LAYOUT
// // // const LayoutService = require('../../services/storefront/layout.service');
// // // const DataHydrationService = require('../../services/storefront/dataHydration.service');

// // // const { buildProductSchema } = require('../../utils/constants/seo/productSchema.util');
// // // const { buildProductListSchema } = require('../../utils/constants/seo/productListSchema.util');
// // // const { buildCanonicalUrl, buildRobotsMeta } = require('../../utils/constants/seo/seo.util');

// // // const MAX_LIMIT = 50;
// // // const ALLOWED_SORT_FIELDS = ['createdAt', 'sellingPrice', 'name'];

// // // class ProductPublicController {

// // //   // =====================================================
// // //   // GET PRODUCTS (PUBLIC LISTING + LAYOUT)
// // //   // =====================================================
// // //   getProducts = async (req, res, next) => {
// // //     try {
// // //       const { organizationSlug } = req.params;
// // //       let {
// // //         page = 1,
// // //         limit = 20,
// // //         sortBy = 'createdAt',
// // //         sortOrder = 'desc',
// // //         category,
// // //         minPrice,
// // //         maxPrice,
// // //         search,
// // //         tags,
// // //         inStock
// // //       } = req.query;

// // //       // 1. Normalize Inputs
// // //       page = Math.max(parseInt(page, 10) || 1, 1);
// // //       limit = Math.min(parseInt(limit, 10) || 20, MAX_LIMIT);
// // //       sortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
// // //       sortOrder = sortOrder === 'asc' ? 'asc' : 'desc';
// // //       const skip = (page - 1) * limit;

// // //       // 2. Resolve Organization
// // //       const organization = await Organization.findOne({
// // //         uniqueShopId: organizationSlug.toUpperCase(),
// // //         isActive: true
// // //       }).select('_id name uniqueShopId primaryEmail primaryPhone logo'); // Selected more fields for response

// // //       if (!organization) {
// // //         return next(new AppError('Store not found', 404));
// // //       }

// // //       // 3. Build Query
// // //       const query = {
// // //         organizationId: organization._id,
// // //         isActive: true
// // //       };

// // //       // ... (Keep your existing Filter Logic here) ...
// // //       if (category) {
// // //         const escapedCategory = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// // //         query.category = { $regex: new RegExp('^' + escapedCategory, 'i') };
// // //       }
// // //       if (tags) {
// // //         const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
// // //         if (tagList.length > 0) query.tags = { $in: tagList };
// // //       }
// // //       if (minPrice || maxPrice) {
// // //         query.sellingPrice = {};
// // //         if (minPrice) query.sellingPrice.$gte = Number(minPrice);
// // //         if (maxPrice) query.sellingPrice.$lte = Number(maxPrice);
// // //       }
// // //       if (search) {
// // //         const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
// // //         query.$or = [
// // //           { name: { $regex: searchRegex } },
// // //           { description: { $regex: searchRegex } },
// // //           { sku: { $regex: searchRegex } }
// // //         ];
// // //       }
// // //       if (inStock === 'true') {
// // //         query.inventory = { $elemMatch: { quantity: { $gt: 0 } } };
// // //       }

// // //       // 4. Execute Queries AND Fetch Layout (PARALLEL)
// // //       // ✅ We added LayoutService.getLayout() to the promise array
// // //       const [products, total, layoutData] = await Promise.all([
// // //         Product.find(query)
// // //           .select('name slug description images sellingPrice discountedPrice category tags sku inventory brand')
// // //           .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
// // //           .skip(skip)
// // //           .limit(limit)
// // //           .lean(),
// // //         Product.countDocuments(query),
// // //         LayoutService.getLayout(organization._id)
// // //       ]);

// // //       // 5. Hydrate Layout (PARALLEL)
// // //       // ✅ Hydrate header and footer so they match the rest of the site
// // //       const [hydratedHeader, hydratedFooter] = await Promise.all([
// // //         DataHydrationService.hydrateSections(layoutData.header, organization._id),
// // //         DataHydrationService.hydrateSections(layoutData.footer, organization._id)
// // //       ]);

// // //       // 6. Transform Data for Public API
// // //       const transformed = products.map(p => {
// // //         const totalStock = p.inventory?.reduce((sum, inv) => sum + (inv.quantity || 0), 0) || 0;
// // //         return {
// // //           id: p._id,
// // //           name: p.name,
// // //           slug: p.slug,
// // //           description: p.description, 
// // //           images: p.images || [],
// // //           brand: p.brand,
// // //           price: {
// // //             original: p.sellingPrice,
// // //             discounted: p.discountedPrice,
// // //             currency: 'USD',
// // //             hasDiscount: !!(p.discountedPrice && p.discountedPrice < p.sellingPrice)
// // //           },
// // //           category: p.category,
// // //           tags: p.tags || [],
// // //           sku: p.sku,
// // //           stock: {
// // //             available: totalStock > 0,
// // //             lowStock: totalStock > 0 && totalStock < 5,
// // //             qty: totalStock 
// // //           },
// // //           url: `/store/${organizationSlug}/products/${p.slug}`
// // //         };
// // //       });

// // //       // 7. SEO Headers
// // //       const listSchema = buildProductListSchema(transformed);
// // //       res.set({
// // //         'Link': `<${buildCanonicalUrl(req)}>; rel="canonical"`,
// // //         'X-Robots-Tag': buildRobotsMeta(false)
// // //       });

// // //       // 8. Response (Includes Layout & Settings now)
// // //       res.status(200).json({
// // //         organization: {
// // //           id: organization._id,
// // //           name: organization.name,
// // //           slug: organizationSlug,
// // //           logo: organization.logo,
// // //           contact: {
// // //              email: organization.primaryEmail,
// // //              phone: organization.primaryPhone
// // //           }
// // //         },
// // //         // ✅ Layout Added
// // //         layout: {
// // //           header: hydratedHeader,
// // //           footer: hydratedFooter
// // //         },
// // //         // ✅ Settings Added
// // //         settings: layoutData.globalSettings || {},
        
// // //         products: transformed,
// // //         pagination: {
// // //           page,
// // //           limit,
// // //           total,
// // //           pages: Math.ceil(total / limit)
// // //         },
// // //         seo: {
// // //           canonical: buildCanonicalUrl(req),
// // //           jsonLd: listSchema
// // //         }
// // //       });

// // //     } catch (err) {
// // //       next(err);
// // //     }
// // //   }

// // //   // =====================================================
// // //   // GET SINGLE PRODUCT (PUBLIC DETAILS + LAYOUT)
// // //   // =====================================================
// // //   getProductBySlug = async (req, res, next) => {
// // //     try {
// // //       const { organizationSlug, productSlug } = req.params;

// // //       const organization = await Organization.findOne({
// // //         uniqueShopId: organizationSlug.toUpperCase(),
// // //         isActive: true
// // //       }).select('_id name uniqueShopId primaryEmail primaryPhone logo');

// // //       if (!organization) {
// // //         return next(new AppError('Store not found', 404));
// // //       }

// // //       // ✅ Fetch Product AND Layout in parallel
// // //       const [product, layoutData] = await Promise.all([
// // //         Product.findOne({
// // //           organizationId: organization._id,
// // //           slug: productSlug,
// // //           isActive: true
// // //         }).select('name slug description images sellingPrice discountedPrice category subCategory brand tags sku inventory taxRate isTaxInclusive attributes').lean(),
        
// // //         LayoutService.getLayout(organization._id)
// // //       ]);

// // //       if (!product) {
// // //         return next(new AppError('Product not found', 404));
// // //       }

// // //       // ✅ Hydrate Header/Footer
// // //       const [hydratedHeader, hydratedFooter] = await Promise.all([
// // //         DataHydrationService.hydrateSections(layoutData.header, organization._id),
// // //         DataHydrationService.hydrateSections(layoutData.footer, organization._id)
// // //       ]);

// // //       // Increment Views (Fire and forget)
// // //       this.incrementProductViews(product._id);

// // //       // Stock Calculation
// // //       const totalStock = product.inventory?.reduce((sum, inv) => sum + (inv.quantity || 0), 0) || 0;

// // //       const publicProduct = {
// // //         id: product._id,
// // //         name: product.name,
// // //         slug: product.slug,
// // //         description: product.description,
// // //         images: product.images || [],
// // //         price: {
// // //           original: product.sellingPrice,
// // //           discounted: product.discountedPrice,
// // //           currency: 'USD',
// // //           taxRate: product.taxRate,
// // //           isTaxInclusive: product.isTaxInclusive,
// // //           hasDiscount: !!(product.discountedPrice && product.discountedPrice < product.sellingPrice)
// // //         },
// // //         category: product.category,
// // //         subCategory: product.subCategory,
// // //         brand: product.brand,
// // //         tags: product.tags || [],
// // //         sku: product.sku,
// // //         attributes: product.attributes || [],
// // //         stock: {
// // //           available: totalStock > 0,
// // //           quantity: totalStock,
// // //           lowStock: totalStock > 0 && totalStock < 5
// // //         },
// // //         organization: {
// // //           id: organization._id,
// // //           name: organization.name
// // //         }
// // //       };

// // //       const schema = buildProductSchema(publicProduct, organizationSlug);

// // //       res.set({
// // //         'Link': `<${buildCanonicalUrl(req)}>; rel="canonical"`,
// // //         'X-Robots-Tag': buildRobotsMeta(false)
// // //       });

// // //       res.status(200).json({
// // //         organization: {
// // //            id: organization._id,
// // //            name: organization.name,
// // //            slug: organizationSlug,
// // //            logo: organization.logo,
// // //            contact: {
// // //               email: organization.primaryEmail,
// // //               phone: organization.primaryPhone
// // //            }
// // //         },
// // //         // ✅ Layout Added
// // //         layout: {
// // //           header: hydratedHeader,
// // //           footer: hydratedFooter
// // //         },
// // //         settings: layoutData.globalSettings || {},

// // //         product: publicProduct,
// // //         seo: {
// // //           canonical: buildCanonicalUrl(req),
// // //           jsonLd: schema
// // //         },
// // //         breadcrumbs: [
// // //           { name: 'Home', url: `/store/${organizationSlug}` },
// // //           { name: 'Products', url: `/store/${organizationSlug}/products` },
// // //           { name: product.category, url: `/store/${organizationSlug}/products?category=${encodeURIComponent(product.category)}` },
// // //           { name: product.name, url: `/store/${organizationSlug}/products/${productSlug}` }
// // //         ]
// // //       });

// // //     } catch (err) {
// // //       next(err);
// // //     }
// // //   }

// // //   // =====================================================
// // //   // GET CATEGORIES
// // //   // =====================================================
// // //   getCategories = async (req, res, next) => {
// // //     try {
// // //       const { organizationSlug } = req.params;
// // //       const organization = await Organization.findOne({
// // //         uniqueShopId: organizationSlug.toUpperCase(),
// // //         isActive: true
// // //       }).select('_id');

// // //       if (!organization) return next(new AppError('Store not found', 404));

// // //       const categories = await Product.aggregate([
// // //         { $match: { organizationId: organization._id, isActive: true, category: { $exists: true, $ne: '' } } },
// // //         { $group: { _id: '$category', count: { $sum: 1 } } },
// // //         { $project: { _id: 0, name: '$_id', count: 1 } },
// // //         { $sort: { count: -1 } }
// // //       ]);

// // //       const formattedCategories = categories.map(c => ({
// // //         _id: c.name, 
// // //         name: c.name,
// // //         count: c.count
// // //       }));

// // //       res.set({ 'X-Robots-Tag': buildRobotsMeta(true) });
// // //       res.status(200).json({ organizationSlug, categories: formattedCategories, totalCategories: categories.length });
// // //     } catch (err) { next(err); }
// // //   }

// // //   // =====================================================
// // //   // GET TAGS
// // //   // =====================================================
// // //   getTags = async (req, res, next) => {
// // //     try {
// // //       const { organizationSlug } = req.params;
// // //       const organization = await Organization.findOne({
// // //         uniqueShopId: organizationSlug.toUpperCase(),
// // //         isActive: true
// // //       }).select('_id');

// // //       if (!organization) return next(new AppError('Store not found', 404));

// // //       const tags = await Product.aggregate([
// // //         { $match: { organizationId: organization._id, isActive: true, tags: { $exists: true, $ne: [] } } },
// // //         { $unwind: '$tags' },
// // //         { $group: { _id: '$tags' } },
// // //         { $limit: 50 },
// // //         { $sort: { _id: 1 } }
// // //       ]);

// // //       res.set({ 'X-Robots-Tag': buildRobotsMeta(true) });
// // //       res.status(200).json({ count: tags.length, tags: tags.map(t => t._id) });
// // //     } catch (err) { next(err); }
// // //   }

// // //   // =====================================================
// // //   // SEARCH
// // //   // =====================================================
// // //   searchProducts = async (req, res, next) => {
// // //     try {
// // //       const { organizationSlug } = req.params;
// // //       const q = (req.query.q || '').trim();
      
// // //       if (q.length < 2) return res.status(200).json({ results: [] });

// // //       const organization = await Organization.findOne({
// // //         uniqueShopId: organizationSlug.toUpperCase(),
// // //         isActive: true
// // //       }).select('_id');

// // //       if (!organization) return next(new AppError('Store not found', 404));

// // //       const results = await Product.find({
// // //         organizationId: organization._id,
// // //         isActive: true,
// // //         $or: [
// // //           { name: { $regex: q, $options: 'i' } },
// // //           { sku: { $regex: q, $options: 'i' } },
// // //           { tags: { $regex: q, $options: 'i' } }
// // //         ]
// // //       })
// // //       .select('name slug images sellingPrice category')
// // //       .limit(10)
// // //       .lean();

// // //       res.set({ 'X-Robots-Tag': buildRobotsMeta(true) });
// // //       res.status(200).json({
// // //         query: q,
// // //         results: results.map(p => ({
// // //           id: p._id,
// // //           name: p.name,
// // //           slug: p.slug,
// // //           image: p.images?.[0],
// // //           price: p.sellingPrice,
// // //           category: p.category,
// // //           url: `/store/${organizationSlug}/products/${p.slug}`
// // //         }))
// // //       });
// // //     } catch (err) { next(err); }
// // //   }

// // //   // =====================================================
// // //   // VIEW COUNTER
// // //   // =====================================================
// // //   incrementProductViews = async (productId) => {
// // //     try {
// // //       await Product.findByIdAndUpdate(productId, { $inc: { views: 1 } });
// // //     } catch (_) {
// // //       // Fail silently for analytics
// // //     }
// // //   }
// // // }

// // // module.exports = new ProductPublicController();


