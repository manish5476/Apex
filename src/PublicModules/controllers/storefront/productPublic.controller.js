const mongoose = require('mongoose');
const Product = require('../../../modules/inventory/core/product.model');
const Organization = require('../../../modules/organization/core/organization.model');
const Master = require('../../../modules/master/core/master.model'); 
const AppError = require('../../../core/utils/appError');

// Services
const LayoutService = require('../../services/storefront/layout.service');
const DataHydrationService = require('../../services/storefront/dataHydration.service');

// SEO Utils
const { buildProductSchema } = require('../../utils/constants/seo/productSchema.util');
const { buildProductListSchema } = require('../../utils/constants/seo/productListSchema.util');
const { buildCanonicalUrl, buildRobotsMeta } = require('../../utils/constants/seo/seo.util');

const MAX_LIMIT = 50;
const ALLOWED_SORT_FIELDS = ['createdAt', 'sellingPrice', 'name', 'views', 'discountedPrice', 'salesCount']; // ✅ Added salesCount
class ProductPublicController {

  // =====================================================
  // 1. GET PRODUCTS (Listing + Smart Filters)
  // Route: GET /:organizationSlug/products
  // =====================================================
  getProducts = async (req, res, next) => {
    try {
      const { organizationSlug } = req.params;
      const org = await this._resolveOrg(organizationSlug);
      if (!org) return next(new AppError('Store not found', 404));

      // 1. Destructure ALL possible inputs
      let { 
        page = 1, limit = 20, 
        sort, sortBy, sortOrder, // ✅ Capture 'sort' (frontend default) AND 'sortBy' (manual)
        category, brand, subCategory, 
        minPrice, maxPrice, minDiscount,
        search, tags, inStock 
      } = req.query;

      // -------------------------------------------------------
      // 🔧 FIX: Intelligent Sort Parsing
      // -------------------------------------------------------
      // If frontend sends ?sort=-sellingPrice, we parse it here.
      if (sort) {
        if (sort.startsWith('-')) {
          sortBy = sort.substring(1); // Remove '-'
          sortOrder = 'desc';
        } else {
          sortBy = sort;
          sortOrder = 'asc';
        }
      }

      // Default Fallbacks
      sortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
      sortOrder = (sortOrder === 'asc' || sortOrder === '1') ? 'asc' : 'desc';

      // Pagination
      page = Math.max(parseInt(page, 10) || 1, 1);
      limit = Math.min(parseInt(limit, 10) || 20, 50);
      const skip = (page - 1) * limit;

      // -------------------------------------------------------
      // 🔍 BUILD QUERY
      // -------------------------------------------------------
      const query = { organizationId: org._id, isActive: true };

      // Category & Brand (Resolves Names OR IDs)
      if (category) query.categoryId = await this._resolveMasterId(org._id, 'category', category);
      if (brand) query.brandId = await this._resolveMasterId(org._id, 'brand', brand);
      if (subCategory) query.subCategoryId = await this._resolveMasterId(org._id, 'category', subCategory);

      // Price Range (Handle String Inputs Safeley)
      if (minPrice || maxPrice) {
        query.sellingPrice = {};
        if (minPrice) query.sellingPrice.$gte = Number(minPrice);
        if (maxPrice) query.sellingPrice.$lte = Number(maxPrice);
      }

      // In Stock Logic
      if (String(inStock) === 'true') { // ✅ Robust string check
        query.inventory = { $elemMatch: { quantity: { $gt: 0 } } };
      }

      // Tags
      if (tags) {
        // Handle "tag1,tag2" or array
        const tagList = Array.isArray(tags) ? tags : tags.split(',');
        const cleanTags = tagList.map(t => t.trim()).filter(Boolean);
        if (cleanTags.length > 0) query.tags = { $in: cleanTags };
      }

      // Search
      if (search) {
        const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        query.$or = [
          { name: { $regex: searchRegex } },
          { sku: { $regex: searchRegex } }
        ];
      }

      // -------------------------------------------------------
      // 🚀 EXECUTE
      // -------------------------------------------------------
      const [products, total, layoutData] = await Promise.all([
        Product.find(query)
          .select('name slug description images sellingPrice discountedPrice categoryId brandId tags sku inventory createdAt')
          .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 }) // ✅ Applies cleaned sort
          .skip(skip)
          .limit(limit)
          .populate('categoryId brandId', 'name slug')
          .lean(),
        Product.countDocuments(query),
        LayoutService.getLayout(org._id)
      ]);

      // ... (Rest of Hydration & Response remains the same) ...
      
      const [hydratedHeader, hydratedFooter] = await Promise.all([
        DataHydrationService.hydrateSections(layoutData.header, org._id),
        DataHydrationService.hydrateSections(layoutData.footer, org._id)
      ]);

      const transformed = this._transformProducts(products, organizationSlug);
      const listSchema = buildProductListSchema(transformed);

      res.status(200).json({
        organization: this._formatOrg(org, organizationSlug),
        layout: { header: hydratedHeader, footer: hydratedFooter },
        products: transformed,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        seo: { canonical: buildCanonicalUrl(req), jsonLd: listSchema }
      });

    } catch (err) { next(err); }
  }
  // getProducts = async (req, res, next) => {
  //   try {
  //     const { organizationSlug } = req.params;
  //     const org = await this._resolveOrg(organizationSlug);
  //     if (!org) return next(new AppError('Store not found', 404));

  //     let { 
  //       page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', 
  //       category, brand, subCategory, 
  //       minPrice, maxPrice, minDiscount,
  //       search, tags, inStock 
  //     } = req.query;

  //     // --- A. Normalize Inputs ---
  //     page = Math.max(parseInt(page, 10) || 1, 1);
  //     limit = Math.min(parseInt(limit, 10) || 20, MAX_LIMIT);
  //     sortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
  //     const skip = (page - 1) * limit;

  //     const query = { organizationId: org._id, isActive: true };

  //     // --- B. Smart Filter Resolution (Name -> ID) ---
  //     if (category) query.categoryId = await this._resolveMasterId(org._id, 'category', category);
  //     if (brand) query.brandId = await this._resolveMasterId(org._id, 'brand', brand);
  //     if (subCategory) query.subCategoryId = await this._resolveMasterId(org._id, 'category', subCategory);

  //     // --- C. Standard Filters ---
  //     if (tags) {
  //       const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
  //       if (tagList.length > 0) query.tags = { $in: tagList };
  //     }

  //     if (minPrice || maxPrice) {
  //       query.sellingPrice = {};
  //       if (minPrice) query.sellingPrice.$gte = Number(minPrice);
  //       if (maxPrice) query.sellingPrice.$lte = Number(maxPrice);
  //     }

  //     if (inStock === 'true') {
  //       query.inventory = { $elemMatch: { quantity: { $gt: 0 } } };
  //     }

  //     // --- D. Discount Filter (New) ---
  //     if (minDiscount) {
  //       const discountVal = parseInt(minDiscount);
  //       if (discountVal > 0) {
  //         query.discountedPrice = { $exists: true, $ne: null };
  //         const factor = 1 - (discountVal / 100);
  //         query.$expr = {
  //           $lte: ["$discountedPrice", { $multiply: ["$sellingPrice", factor] }]
  //         };
  //       }
  //     }

  //     // --- E. Search Logic ---
  //     if (search) {
  //       const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  //       query.$or = [
  //         { name: { $regex: searchRegex } },
  //         { description: { $regex: searchRegex } },
  //         { sku: { $regex: searchRegex } }
  //       ];
  //     }

  //     // --- F. Execution (Parallel) ---
  //     const [products, total, layoutData] = await Promise.all([
  //       Product.find(query)
  //         .select('name slug description images sellingPrice discountedPrice categoryId brandId tags sku inventory createdAt')
  //         .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
  //         .skip(skip)
  //         .limit(limit)
  //         .populate('categoryId brandId', 'name slug') 
  //         .lean(),
  //       Product.countDocuments(query),
  //       LayoutService.getLayout(org._id)
  //     ]);

  //     // --- G. Hydration & Transform ---
  //     const [hydratedHeader, hydratedFooter] = await Promise.all([
  //       DataHydrationService.hydrateSections(layoutData.header, org._id),
  //       DataHydrationService.hydrateSections(layoutData.footer, org._id)
  //     ]);

  //     const transformed = this._transformProducts(products, organizationSlug);

  //     // --- H. Response ---
  //     const listSchema = buildProductListSchema(transformed);
      
  //     res.set({
  //       'Link': `<${buildCanonicalUrl(req)}>; rel="canonical"`,
  //       'X-Robots-Tag': buildRobotsMeta(false)
  //     });

  //     res.status(200).json({
  //       organization: this._formatOrg(org, organizationSlug),
  //       layout: { header: hydratedHeader, footer: hydratedFooter },
  //       settings: layoutData.globalSettings || {},
  //       products: transformed,
  //       pagination: {
  //         page, limit, total,
  //         pages: Math.ceil(total / limit)
  //       },
  //       seo: { canonical: buildCanonicalUrl(req), jsonLd: listSchema }
  //     });

  //   } catch (err) { next(err); }
  // }

  // =====================================================
  // 2. GET SINGLE PRODUCT (Detailed)
  // Route: GET /:organizationSlug/products/:productSlug
  // =====================================================
  getProductBySlug = async (req, res, next) => {
    try {
      const { organizationSlug, productSlug } = req.params;
      const org = await this._resolveOrg(organizationSlug);
      if (!org) return next(new AppError('Store not found', 404));

      const [product, layoutData] = await Promise.all([
        Product.findOne({ organizationId: org._id, slug: productSlug, isActive: true }).lean(),
        LayoutService.getLayout(org._id)
      ]);

      if (!product) return next(new AppError('Product not found', 404));

      // Async View Increment
      this.incrementProductViews(product._id);

      const [hydratedHeader, hydratedFooter] = await Promise.all([
        DataHydrationService.hydrateSections(layoutData.header, org._id),
        DataHydrationService.hydrateSections(layoutData.footer, org._id)
      ]);

      // Detailed Transform
      const totalStock = product.inventory?.reduce((sum, inv) => sum + (inv.quantity || 0), 0) || 0;
      const hasDiscount = !!(product.discountedPrice && product.discountedPrice < product.sellingPrice);
      const discountPercent = hasDiscount 
        ? Math.round(((product.sellingPrice - product.discountedPrice) / product.sellingPrice) * 100) 
        : 0;

      const publicProduct = {
        id: product._id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        images: product.images || [],
        
        price: {
          original: product.sellingPrice,
          discounted: product.discountedPrice,
          currency: 'USD',
          taxRate: product.taxRate,
          isTaxInclusive: product.isTaxInclusive,
          hasDiscount,
          discountLabel: hasDiscount ? `${discountPercent}% OFF` : null
        },

        category: {
            id: product.categoryId?._id,
            name: product.categoryId?.name,
            image: product.categoryId?.imageUrl,
            slug: product.categoryId?.slug
        },
        brand: {
            id: product.brandId?._id,
            name: product.brandId?.name,
            slug: product.brandId?.slug
        },
        unit: product.unitId?.name,
        tags: product.tags || [],
        sku: product.sku,
        stock: {
          available: totalStock > 0,
          quantity: totalStock,
          status: totalStock === 0 ? 'Out of Stock' : (totalStock < 5 ? 'Low Stock' : 'In Stock')
        }
      };

      const schema = buildProductSchema(publicProduct, organizationSlug);

      res.status(200).json({
        organization: this._formatOrg(org, organizationSlug),
        layout: { header: hydratedHeader, footer: hydratedFooter },
        settings: layoutData.globalSettings || {},
        product: publicProduct,
        seo: { canonical: buildCanonicalUrl(req), jsonLd: schema },
        breadcrumbs: [
          { name: 'Home', url: `/store/${organizationSlug}` },
          { name: 'Products', url: `/store/${organizationSlug}/products` },
          { name: publicProduct.category?.name || 'Category', url: `/store/${organizationSlug}/products?category=${publicProduct.category?.slug || publicProduct.category?.id}` },
          { name: product.name, url: `#` }
        ]
      });

    } catch (err) { next(err); }
  }

  // =====================================================
  // 3. SMART SEARCH (Master + Product)
  // Route: GET /:organizationSlug/search
  // =====================================================
  searchProducts = async (req, res, next) => {
    try {
      const { organizationSlug } = req.params;
      const q = (req.query.q || '').trim();
      if (q.length < 2) return res.status(200).json({ results: [] });

      const org = await this._resolveOrg(organizationSlug);
      if (!org) return res.status(200).json({ results: [] });

      // Step 1: Find Master IDs matching the search term
      const masterMatches = await Master.find({
        organizationId: org._id,
        isActive: true,
        name: { $regex: q, $options: 'i' }
      }).select('_id type');

      const categoryIds = masterMatches.filter(m => m.type === 'category').map(m => m._id);
      const brandIds = masterMatches.filter(m => m.type === 'brand').map(m => m._id);

      // Step 2: Search Products
      const results = await Product.find({
        organizationId: org._id,
        isActive: true,
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { sku: { $regex: q, $options: 'i' } },
          { tags: { $regex: q, $options: 'i' } },
          { categoryId: { $in: categoryIds } }, 
          { brandId: { $in: brandIds } }
        ]
      })
      .select('name slug images sellingPrice discountedPrice categoryId brandId')
      .populate('categoryId', 'name')
      .limit(12)
      .lean();

      // Transform
      const transformed = results.map(p => ({
        id: p._id,
        name: p.name,
        slug: p.slug,
        image: p.images?.[0],
        price: p.discountedPrice || p.sellingPrice,
        originalPrice: p.sellingPrice,
        category: p.categoryId?.name,
        url: `/store/${organizationSlug}/products/${p.slug}`
      }));

      res.status(200).json({ query: q, results: transformed });

    } catch (err) { next(err); }
  }

  // =====================================================
  // 4. RESTORED & UPGRADED: TAGS
  // Route: GET /:organizationSlug/tags
  // =====================================================
  getTags = async (req, res, next) => {
    try {
      const { organizationSlug } = req.params;
      const org = await this._resolveOrg(organizationSlug);
      if (!org) return next(new AppError('Store not found', 404));

      const tags = await Product.aggregate([
        { $match: { organizationId: org._id, isActive: true, tags: { $exists: true, $ne: [] } } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } }, // Added count for tag cloud sizing
        { $sort: { count: -1 } }, // Popular tags first
        { $limit: 50 }
      ]);

      res.set({ 'X-Robots-Tag': buildRobotsMeta(true) });
      res.status(200).json({ 
        count: tags.length, 
        tags: tags.map(t => ({ name: t._id, count: t.count })) // Return object for richer UI
      });
    } catch (err) { next(err); }
  }

  // =====================================================
  // 5. RESTORED & UPGRADED: CATEGORIES (Aggregated)
  // Route: GET /:organizationSlug/categories
  // =====================================================
  getCategories = async (req, res, next) => {
    try {
      const { organizationSlug } = req.params;
      const org = await this._resolveOrg(organizationSlug);
      if (!org) return next(new AppError('Store not found', 404));

      const categories = await Product.aggregate([
        { $match: { organizationId: org._id, isActive: true, categoryId: { $exists: true } } },
        { $group: { _id: '$categoryId', productCount: { $sum: 1 } } },
        {
            $lookup: {
                from: 'masters', // Ensure this matches your collection name in DB (usually 'masters')
                localField: '_id',
                foreignField: '_id',
                as: 'masterInfo'
            }
        },
        { $unwind: '$masterInfo' },
        { 
            $project: { 
                _id: 1, 
                name: '$masterInfo.name', 
                slug: '$masterInfo.slug', 
                image: '$masterInfo.imageUrl',
                count: '$productCount' 
            } 
        },
        { $sort: { count: -1 } }
      ]);

      res.status(200).json({ results: categories });
    } catch (err) { next(err); }
  }

  // =====================================================
  // 6. EXTRA: BRANDS (Aggregated)
  // Route: GET /:organizationSlug/brands (If you add it later)
  // =====================================================
  getBrands = async (req, res, next) => {
    try {
      const { organizationSlug } = req.params;
      const org = await this._resolveOrg(organizationSlug);
      if (!org) return next(new AppError('Store not found', 404));

      const brands = await Product.aggregate([
        { $match: { organizationId: org._id, isActive: true, brandId: { $exists: true } } },
        { $group: { _id: '$brandId', productCount: { $sum: 1 } } },
        {
            $lookup: {
                from: 'masters',
                localField: '_id',
                foreignField: '_id',
                as: 'brandInfo'
            }
        },
        { $unwind: '$brandInfo' },
        { 
            $project: { 
                _id: 1, 
                name: '$brandInfo.name', 
                slug: '$brandInfo.slug',
                count: '$productCount' 
            } 
        },
        { $sort: { name: 1 } }
      ]);

      res.status(200).json({ results: brands });
    } catch (err) { next(err); }
  }

  // =====================================================
  // 7. FACETS (Combined Filters)
  // Route: GET /:organizationSlug/filters (Optional/New)
  // =====================================================
  getShopFilters = async (req, res, next) => {
    try {
      const { organizationSlug } = req.params;
      const org = await this._resolveOrg(organizationSlug);
      if (!org) return next(new AppError('Store not found', 404));
      
      const [categories, brands, priceRange] = await Promise.all([
        // Categories
        Product.aggregate([
            { $match: { organizationId: org._id, isActive: true } },
            { $group: { _id: '$categoryId', count: { $sum: 1 } } },
            { $lookup: { from: 'masters', localField: '_id', foreignField: '_id', as: 'm' } },
            { $unwind: '$m' },
            { $project: { id: '$_id', name: '$m.name', slug: '$m.slug', count: 1, _id: 0 } },
            { $sort: { count: -1 } }
        ]),
        // Brands
        Product.aggregate([
            { $match: { organizationId: org._id, isActive: true } },
            { $group: { _id: '$brandId', count: { $sum: 1 } } },
            { $lookup: { from: 'masters', localField: '_id', foreignField: '_id', as: 'm' } },
            { $unwind: '$m' },
            { $project: { id: '$_id', name: '$m.name', slug: '$m.slug', count: 1, _id: 0 } },
            { $sort: { name: 1 } }
        ]),
        // Price Range
        Product.aggregate([
            { $match: { organizationId: org._id, isActive: true } },
            { $group: { _id: null, min: { $min: '$sellingPrice' }, max: { $max: '$sellingPrice' } } }
        ])
      ]);

      res.status(200).json({
        categories,
        brands,
        price: priceRange[0] || { min: 0, max: 0 }
      });
    } catch (err) { next(err); }
  }

  // =====================================================
  // ✅ NEW: GET STORE METADATA (Enums + Tags + Limits)
  // Route: GET /:organizationSlug/meta
  // Use this to populate all your Dropdowns & Filters in one go.
  // =====================================================
  // getStoreMetadata = async (req, res, next) => {
  //   try {
  //     const { organizationSlug } = req.params;
  //     const org = await this._resolveOrg(organizationSlug);
  //     if (!org) return next(new AppError('Store not found', 404));

  //     // Execute 3 heavy queries in Parallel for speed
  //     const [masters, tags, priceRange] = await Promise.all([
        
  //       // 1. Fetch All Masters (Categories & Brands)
  //       Master.find({ 
  //         organizationId: org._id, 
  //         isActive: true, 
  //         type: { $in: ['category', 'brand', 'unit'] } 
  //       })
  //       .select('name slug type imageUrl parentId metadata')
  //       .sort({ 'metadata.sortOrder': 1, name: 1 })
  //       .lean(),

  //       // 2. Fetch Aggregated Tags (from Products)
  //       Product.aggregate([
  //         { $match: { organizationId: org._id, isActive: true, tags: { $exists: true, $ne: [] } } },
  //         { $unwind: '$tags' },
  //         { $group: { _id: '$tags', count: { $sum: 1 } } },
  //         { $sort: { count: -1 } },
  //         { $limit: 50 }
  //       ]),

  //       // 3. Fetch Price Limits (Min/Max for Sliders)
  //       Product.aggregate([
  //         { $match: { organizationId: org._id, isActive: true } },
  //         { $group: { _id: null, min: { $min: '$sellingPrice' }, max: { $max: '$sellingPrice' } } }
  //       ])
  //     ]);

  //     // Separate Masters into clean lists
  //     const categories = masters.filter(m => m.type === 'category');
  //     const brands = masters.filter(m => m.type === 'brand');
  //     const units = masters.filter(m => m.type === 'unit'); // Useful for display logic

  //     res.status(200).json({
  //       organization: { id: org._id, slug: organizationSlug },
  //       enums: {
  //         categories: categories.map(c => ({
  //            id: c._id, 
  //            name: c.name, 
  //            slug: c.slug, 
  //            image: c.imageUrl,
  //            parentId: c.parentId 
  //         })),
  //         brands: brands.map(b => ({
  //            id: b._id, 
  //            name: b.name, 
  //            slug: b.slug
  //         })),
  //         units: units.map(u => ({ id: u._id, name: u.name })),
  //         tags: tags.map(t => t._id) // Just return the array of strings
  //       },
  //       filters: {
  //         price: priceRange[0] || { min: 0, max: 0 },
  //         maxTags: tags.length
  //       }
  //     });

  //   } catch (err) { next(err); }
  // }
  // =====================================================
  // ✅ FINAL: GET STORE METADATA (Hybrid Master + Counts)
  // Route: GET /:organizationSlug/meta
  // Fixes "No Data" issue and adds 'type' for UI grouping
  // =====================================================
  getStoreMetadata = async (req, res, next) => {
    try {
      const { organizationSlug } = req.params;
      const org = await this._resolveOrg(organizationSlug);
      if (!org) return next(new AppError('Store not found', 404));

      // ⚡ PARALLEL EXECUTION: Fetch Masters AND Product Counts simultaneously
      const [allMasters, productStats, tagStats] = await Promise.all([
        
        // 1. Fetch ALL Masters (The Source of Truth)
        // We fetch everything active so the UI knows about "Furniture", "Electronics", etc.
        Master.find({ 
          organizationId: org._id, 
          isActive: true,
          type: { $in: ['category', 'brand', 'unit', 'department'] } // Added 'department'
        })
        .select('name slug type imageUrl parentId metadata')
        .sort({ 'metadata.sortOrder': 1, name: 1 })
        .lean(),

        // 2. Aggregate Real-Time Counts from Products (The Facets)
        Product.aggregate([
          { $match: { organizationId: org._id, isActive: true } },
          { 
            $facet: {
              // Count per Category ID
              byCategory: [{ $group: { _id: '$categoryId', count: { $sum: 1 } } }],
              // Count per Brand ID
              byBrand: [{ $group: { _id: '$brandId', count: { $sum: 1 } } }],
              // Price Min/Max
              priceRange: [{ $group: { _id: null, min: { $min: '$sellingPrice' }, max: { $max: '$sellingPrice' } } }]
            }
          }
        ]),

        // 3. Aggregate Tags separately (Cleaner)
        Product.aggregate([
          { $match: { organizationId: org._id, isActive: true, tags: { $exists: true, $ne: [] } } },
          { $unwind: '$tags' },
          { $group: { _id: '$tags', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 30 }
        ])
      ]);

      // --- DATA MERGING ---
      // Convert arrays to Maps for O(1) instant lookup
      const catCounts = productStats[0].byCategory.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {});
      const brandCounts = productStats[0].byBrand.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {});
      const priceInfo = productStats[0].priceRange[0] || { min: 0, max: 0 };

      // Helper to Format Master for UI
      const formatMaster = (m) => ({
        id: m._id,
        name: m.name,
        slug: m.slug,
        type: m.type, // ✅ THE FIELD YOU REQUESTED
        image: m.imageUrl,
        parentId: m.parentId,
        // If type is category, use catCounts; if brand, use brandCounts. Default to 0.
        count: (m.type === 'category' ? catCounts[m._id] : brandCounts[m._id]) || 0
      });

      // Group by Type
      const enums = {
        categories: allMasters.filter(m => m.type === 'category').map(formatMaster),
        brands: allMasters.filter(m => m.type === 'brand').map(formatMaster),
        departments: allMasters.filter(m => m.type === 'department').map(formatMaster),
        units: allMasters.filter(m => m.type === 'unit').map(m => ({ id: m._id, name: m.name })),
        tags: tagStats.map(t => t._id)
      };

      res.status(200).json({
        organization: { id: org._id, slug: organizationSlug },
        enums,
        filters: {
          price: { min: priceInfo.min, max: priceInfo.max }
        }
      });

    } catch (err) { next(err); }
  }
  // =====================================================
  // 🔒 PRIVATE HELPERS
  // =====================================================

  // async _resolveOrg(slug) {
  //   // Basic cache logic could be added here later
  //   return await Organization.findOne({
  //     uniqueShopId: slug.toUpperCase(),
  //     isActive: true
  //   }).select('_id name uniqueShopId primaryEmail primaryPhone logo');
  // }

  // async _resolveMasterId(organizationId, type, value) {
  //   if (!value) return null;
  //   if (mongoose.Types.ObjectId.isValid(value)) return value;

  //   const master = await Master.findOne({
  //     organizationId,
  //     type,
  //     $or: [
  //       { slug: value.toLowerCase() },
  //       { name: { $regex: new RegExp(`^${value}$`, 'i') } }
  //     ]
  //   }).select('_id');
    
  //   return master ? master._id : null;
  // }
// =====================================================
  // 🔒 PRIVATE HELPERS (Keep these)
  // =====================================================
  async _resolveOrg(slug) {
    return await Organization.findOne({
      uniqueShopId: slug.toUpperCase(),
      isActive: true
    }).select('_id name uniqueShopId primaryEmail primaryPhone logo');
  }

  async _resolveMasterId(organizationId, type, value) {
    if (!value) return null;
    if (mongoose.Types.ObjectId.isValid(value)) return value;
    const master = await Master.findOne({
      organizationId,
      type,
      $or: [{ slug: value.toLowerCase() }, { name: { $regex: new RegExp(`^${value}$`, 'i') } }]
    }).select('_id');
    return master ? master._id : null;
  }
  
  _transformProducts(products, orgSlug) {
    return products.map(p => {
      const totalStock = p.inventory?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
      
      let hasDiscount = false;
      let discountLabel = null;
      if (p.discountedPrice && p.discountedPrice < p.sellingPrice) {
        hasDiscount = true;
        const pct = Math.round(((p.sellingPrice - p.discountedPrice) / p.sellingPrice) * 100);
        discountLabel = `${pct}% OFF`;
      }

      const isNew = p.createdAt && (new Date() - new Date(p.createdAt) < 14 * 24 * 60 * 60 * 1000);

      return {
        id: p._id,
        name: p.name,
        slug: p.slug,
        image: p.images?.[0] || null,
        images: p.images || [],
        brand: p.brandId?.name || null,
        category: p.categoryId?.name || null,
        price: {
          original: p.sellingPrice,
          discounted: p.discountedPrice,
          currency: 'USD',
          hasDiscount,
          discountLabel
        },
        stock: {
          available: totalStock > 0,
          qty: totalStock,
          status: totalStock === 0 ? 'Out of Stock' : (totalStock < 5 ? 'Low Stock' : 'In Stock')
        },
        isNew,
        url: `/store/${orgSlug}/products/${p.slug}`
      };
    });
  }

  _formatOrg(org, slug) {
    return {
      id: org._id,
      name: org.name,
      slug: slug,
      logo: org.logo,
      contact: { email: org.primaryEmail, phone: org.primaryPhone }
    };
  }

  async incrementProductViews(productId) {
    try { await Product.findByIdAndUpdate(productId, { $inc: { views: 1 } }); } catch (_) {}
  }
}

module.exports = new ProductPublicController();

// const mongoose = require('mongoose');
// const Product = require('../../../modules/inventory/core/product.model');
// const Organization = require('../../../modules/organization/core/organization.model');
// const Master = require('../../../modules/master/core/master.model'); 
// const AppError = require('../../../core/utils/appError');

// // Services
// const LayoutService = require('../../services/storefront/layout.service');
// const DataHydrationService = require('../../services/storefront/dataHydration.service');

// // SEO Utils
// const { buildProductSchema } = require('../../utils/constants/seo/productSchema.util');
// const { buildProductListSchema } = require('../../utils/constants/seo/productListSchema.util');
// const { buildCanonicalUrl, buildRobotsMeta } = require('../../utils/constants/seo/seo.util');

// const MAX_LIMIT = 50;
// const ALLOWED_SORT_FIELDS = ['createdAt', 'sellingPrice', 'name', 'views', 'discountedPrice'];

// class ProductPublicController {

//   // =====================================================
//   // 1. GET PRODUCTS (Listing + Smart Filters)
//   // =====================================================
//   getProducts = async (req, res, next) => {
//     try {
//       const { organizationSlug } = req.params;
//       const org = await this._resolveOrg(organizationSlug);
//       if (!org) return next(new AppError('Store not found', 404));

//       let { 
//         page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', 
//         category, brand, subCategory, 
//         minPrice, maxPrice, minDiscount,
//         search, tags, inStock 
//       } = req.query;

//       // --- A. Normalize Inputs ---
//       page = Math.max(parseInt(page, 10) || 1, 1);
//       limit = Math.min(parseInt(limit, 10) || 20, MAX_LIMIT);
//       sortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
//       const skip = (page - 1) * limit;

//       const query = { organizationId: org._id, isActive: true };

//       // --- B. Smart Filter Resolution (Name -> ID) ---
//       // This fixes the issue where "Electronics" wouldn't match because DB stores ObjectId
//       if (category) query.categoryId = await this._resolveMasterId(org._id, 'category', category);
//       if (brand) query.brandId = await this._resolveMasterId(org._id, 'brand', brand);
//       if (subCategory) query.subCategoryId = await this._resolveMasterId(org._id, 'category', subCategory);

//       // --- C. Standard Filters ---
//       if (tags) {
//         const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
//         if (tagList.length > 0) query.tags = { $in: tagList };
//       }

//       if (minPrice || maxPrice) {
//         query.sellingPrice = {};
//         if (minPrice) query.sellingPrice.$gte = Number(minPrice);
//         if (maxPrice) query.sellingPrice.$lte = Number(maxPrice);
//       }

//       if (inStock === 'true') {
//         query.inventory = { $elemMatch: { quantity: { $gt: 0 } } };
//       }

//       // --- D. Discount Filter (New) ---
//       if (minDiscount) {
//         const discountVal = parseInt(minDiscount);
//         if (discountVal > 0) {
//           query.discountedPrice = { $exists: true, $ne: null };
//           // Logic: discounted <= selling * (1 - 0.minDiscount)
//           const factor = 1 - (discountVal / 100);
//           query.$expr = {
//             $lte: ["$discountedPrice", { $multiply: ["$sellingPrice", factor] }]
//           };
//         }
//       }

//       // --- E. Search Logic ---
//       if (search) {
//         const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
//         query.$or = [
//           { name: { $regex: searchRegex } },
//           { description: { $regex: searchRegex } },
//           { sku: { $regex: searchRegex } }
//         ];
//       }

//       // --- F. Execution (Parallel) ---
//       const [products, total, layoutData] = await Promise.all([
//         Product.find(query)
//           .select('name slug description images sellingPrice discountedPrice categoryId brandId tags sku inventory createdAt')
//           .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
//           .skip(skip)
//           .limit(limit)
//           .populate('categoryId brandId', 'name slug') // Populate for display
//           .lean(),
//         Product.countDocuments(query),
//         LayoutService.getLayout(org._id)
//       ]);

//       // --- G. Hydration & Transform ---
//       const [hydratedHeader, hydratedFooter] = await Promise.all([
//         DataHydrationService.hydrateSections(layoutData.header, org._id),
//         DataHydrationService.hydrateSections(layoutData.footer, org._id)
//       ]);

//       const transformed = this._transformProducts(products, organizationSlug);

//       // --- H. Response ---
//       const listSchema = buildProductListSchema(transformed);
      
//       res.set({
//         'Link': `<${buildCanonicalUrl(req)}>; rel="canonical"`,
//         'X-Robots-Tag': buildRobotsMeta(false)
//       });

//       res.status(200).json({
//         organization: this._formatOrg(org, organizationSlug),
//         layout: { header: hydratedHeader, footer: hydratedFooter },
//         settings: layoutData.globalSettings || {},
//         products: transformed,
//         pagination: {
//           page, limit, total,
//           pages: Math.ceil(total / limit)
//         },
//         seo: { canonical: buildCanonicalUrl(req), jsonLd: listSchema }
//       });

//     } catch (err) { next(err); }
//   }

//   // =====================================================
//   // 2. GET SINGLE PRODUCT (Detailed)
//   // =====================================================
//   getProductBySlug = async (req, res, next) => {
//     try {
//       const { organizationSlug, productSlug } = req.params;
//       const org = await this._resolveOrg(organizationSlug);
//       if (!org) return next(new AppError('Store not found', 404));

//       const [product, layoutData] = await Promise.all([
//         Product.findOne({ organizationId: org._id, slug: productSlug, isActive: true }).lean(),
//         LayoutService.getLayout(org._id)
//       ]);

//       if (!product) return next(new AppError('Product not found', 404));

//       // Async View Increment (Fire & Forget)
//       this.incrementProductViews(product._id);

//       const [hydratedHeader, hydratedFooter] = await Promise.all([
//         DataHydrationService.hydrateSections(layoutData.header, org._id),
//         DataHydrationService.hydrateSections(layoutData.footer, org._id)
//       ]);

//       // Detailed Transform
//       const totalStock = product.inventory?.reduce((sum, inv) => sum + (inv.quantity || 0), 0) || 0;
//       const hasDiscount = !!(product.discountedPrice && product.discountedPrice < product.sellingPrice);
//       const discountPercent = hasDiscount 
//         ? Math.round(((product.sellingPrice - product.discountedPrice) / product.sellingPrice) * 100) 
//         : 0;

//       const publicProduct = {
//         id: product._id,
//         name: product.name,
//         slug: product.slug,
//         description: product.description,
//         images: product.images || [],
        
//         price: {
//           original: product.sellingPrice,
//           discounted: product.discountedPrice,
//           currency: 'USD',
//           taxRate: product.taxRate,
//           isTaxInclusive: product.isTaxInclusive,
//           hasDiscount,
//           discountLabel: hasDiscount ? `${discountPercent}% OFF` : null
//         },

//         category: {
//             id: product.categoryId?._id,
//             name: product.categoryId?.name,
//             image: product.categoryId?.imageUrl,
//             slug: product.categoryId?.slug
//         },
//         brand: {
//             id: product.brandId?._id,
//             name: product.brandId?.name,
//             slug: product.brandId?.slug
//         },
//         unit: product.unitId?.name,
//         tags: product.tags || [],
//         sku: product.sku,
//         stock: {
//           available: totalStock > 0,
//           quantity: totalStock,
//           status: totalStock === 0 ? 'Out of Stock' : (totalStock < 5 ? 'Low Stock' : 'In Stock')
//         }
//       };

//       const schema = buildProductSchema(publicProduct, organizationSlug);

//       res.status(200).json({
//         organization: this._formatOrg(org, organizationSlug),
//         layout: { header: hydratedHeader, footer: hydratedFooter },
//         settings: layoutData.globalSettings || {},
//         product: publicProduct,
//         seo: { canonical: buildCanonicalUrl(req), jsonLd: schema },
//         breadcrumbs: [
//           { name: 'Home', url: `/store/${organizationSlug}` },
//           { name: 'Products', url: `/store/${organizationSlug}/products` },
//           { name: publicProduct.category?.name || 'Category', url: `/store/${organizationSlug}/products?category=${publicProduct.category?.slug || publicProduct.category?.id}` },
//           { name: product.name, url: `#` }
//         ]
//       });

//     } catch (err) { next(err); }
//   }

//   // =====================================================
//   // 3. SMART SEARCH (Master + Product)
//   // =====================================================
//   searchProducts = async (req, res, next) => {
//     try {
//       const { organizationSlug } = req.params;
//       const q = (req.query.q || '').trim();
//       if (q.length < 2) return res.status(200).json({ results: [] });

//       const org = await this._resolveOrg(organizationSlug);
//       if (!org) return res.status(200).json({ results: [] });

//       // Step 1: Find Master IDs matching the search term (e.g., Search "Nike" finds the Brand ID)
//       const masterMatches = await Master.find({
//         organizationId: org._id,
//         isActive: true,
//         name: { $regex: q, $options: 'i' }
//       }).select('_id type');

//       const categoryIds = masterMatches.filter(m => m.type === 'category').map(m => m._id);
//       const brandIds = masterMatches.filter(m => m.type === 'brand').map(m => m._id);

//       // Step 2: Search Products (Name OR SKU OR Matched Category OR Matched Brand)
//       const results = await Product.find({
//         organizationId: org._id,
//         isActive: true,
//         $or: [
//           { name: { $regex: q, $options: 'i' } },
//           { sku: { $regex: q, $options: 'i' } },
//           { tags: { $regex: q, $options: 'i' } },
//           { categoryId: { $in: categoryIds } }, // ✅ Finds products in matching category
//           { brandId: { $in: brandIds } }        // ✅ Finds products in matching brand
//         ]
//       })
//       .select('name slug images sellingPrice discountedPrice categoryId brandId')
//       .populate('categoryId', 'name')
//       .limit(12)
//       .lean();

//       // Transform for quick view
//       const transformed = results.map(p => ({
//         id: p._id,
//         name: p.name,
//         slug: p.slug,
//         image: p.images?.[0],
//         price: p.discountedPrice || p.sellingPrice,
//         originalPrice: p.sellingPrice,
//         category: p.categoryId?.name,
//         url: `/store/${organizationSlug}/products/${p.slug}`
//       }));

//       res.status(200).json({ query: q, results: transformed });

//     } catch (err) { next(err); }
//   }

//   // =====================================================
//   // 4. AGGREGATION HELPERS (Facets)
//   // =====================================================
  
//   // Get all facets in one go
//   getShopFilters = async (req, res, next) => {
//     try {
//       const { organizationSlug } = req.params;
//       const org = await this._resolveOrg(organizationSlug);
//       if (!org) return next(new AppError('Store not found', 404));
      
//       const [categories, brands, priceRange] = await Promise.all([
//         // Categories with counts
//         Product.aggregate([
//             { $match: { organizationId: org._id, isActive: true } },
//             { $group: { _id: '$categoryId', count: { $sum: 1 } } },
//             { $lookup: { from: 'masters', localField: '_id', foreignField: '_id', as: 'm' } },
//             { $unwind: '$m' },
//             { $project: { id: '$_id', name: '$m.name', slug: '$m.slug', count: 1, _id: 0 } },
//             { $sort: { count: -1 } }
//         ]),
//         // Brands with counts
//         Product.aggregate([
//             { $match: { organizationId: org._id, isActive: true } },
//             { $group: { _id: '$brandId', count: { $sum: 1 } } },
//             { $lookup: { from: 'masters', localField: '_id', foreignField: '_id', as: 'm' } },
//             { $unwind: '$m' },
//             { $project: { id: '$_id', name: '$m.name', slug: '$m.slug', count: 1, _id: 0 } },
//             { $sort: { name: 1 } }
//         ]),
//         // Price Min/Max
//         Product.aggregate([
//             { $match: { organizationId: org._id, isActive: true } },
//             { $group: { _id: null, min: { $min: '$sellingPrice' }, max: { $max: '$sellingPrice' } } }
//         ])
//       ]);

//       res.status(200).json({
//         categories,
//         brands,
//         price: priceRange[0] || { min: 0, max: 0 }
//       });
//     } catch (err) { next(err); }
//   }

//   // =====================================================
//   // 🔒 PRIVATE HELPERS
//   // =====================================================

//   /**
//    * Helper: Resolves Org Slug to Doc (Cached mostly by DB index)
//    */
//   async _resolveOrg(slug) {
//     return await Organization.findOne({
//       uniqueShopId: slug.toUpperCase(),
//       isActive: true
//     }).select('_id name uniqueShopId primaryEmail primaryPhone logo');
//   }

//   /**
//    * Helper: Resolves a query param (Name or ID) to a Master ObjectId
//    */
//   async _resolveMasterId(organizationId, type, value) {
//     if (!value) return null;
//     if (mongoose.Types.ObjectId.isValid(value)) return value;

//     // Fuzzy match name or slug
//     const master = await Master.findOne({
//       organizationId,
//       type,
//       $or: [
//         { slug: value.toLowerCase() },
//         { name: { $regex: new RegExp(`^${value}$`, 'i') } }
//       ]
//     }).select('_id');
    
//     return master ? master._id : null;
//   }

//   /**
//    * Helper: Standard Product Transform
//    */
//   _transformProducts(products, orgSlug) {
//     return products.map(p => {
//       const totalStock = p.inventory?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
      
//       let hasDiscount = false;
//       let discountLabel = null;
//       if (p.discountedPrice && p.discountedPrice < p.sellingPrice) {
//         hasDiscount = true;
//         const pct = Math.round(((p.sellingPrice - p.discountedPrice) / p.sellingPrice) * 100);
//         discountLabel = `${pct}% OFF`;
//       }

//       // Detect New Arrival (14 days)
//       const isNew = p.createdAt && (new Date() - new Date(p.createdAt) < 14 * 24 * 60 * 60 * 1000);

//       return {
//         id: p._id,
//         name: p.name,
//         slug: p.slug,
//         image: p.images?.[0] || null,
//         images: p.images || [],
//         brand: p.brandId?.name || null,
//         category: p.categoryId?.name || null,
//         price: {
//           original: p.sellingPrice,
//           discounted: p.discountedPrice,
//           currency: 'USD',
//           hasDiscount,
//           discountLabel
//         },
//         stock: {
//           available: totalStock > 0,
//           qty: totalStock,
//           status: totalStock === 0 ? 'Out of Stock' : (totalStock < 5 ? 'Low Stock' : 'In Stock')
//         },
//         isNew,
//         url: `/store/${orgSlug}/products/${p.slug}`
//       };
//     });
//   }

//   _formatOrg(org, slug) {
//     return {
//       id: org._id,
//       name: org.name,
//       slug: slug,
//       logo: org.logo,
//       contact: { email: org.primaryEmail, phone: org.primaryPhone }
//     };
//   }

//   async incrementProductViews(productId) {
//     try { await Product.findByIdAndUpdate(productId, { $inc: { views: 1 } }); } catch (_) {}
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