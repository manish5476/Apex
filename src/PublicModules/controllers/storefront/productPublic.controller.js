const mongoose = require('mongoose');
const Product = require('../../../modules/inventory/core/product.model');
const Organization = require('../../../modules/organization/core/organization.model');
const Master = require('../../../modules/master/core/master.model'); 
const AppError = require('../../../core/utils/api/appError');

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
