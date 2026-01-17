
const Product = require('../../../modules/inventory/core/product.model');
const Organization = require('../../../modules/organization/core/organization.model');
const AppError = require('../../../core/utils/appError');

// ✅ NEW IMPORTS FOR LAYOUT
const LayoutService = require('../../services/storefront/layout.service');
const DataHydrationService = require('../../services/storefront/dataHydration.service');

const { buildProductSchema } = require('../../utils/constants/seo/productSchema.util');
const { buildProductListSchema } = require('../../utils/constants/seo/productListSchema.util');
const { buildCanonicalUrl, buildRobotsMeta } = require('../../utils/constants/seo/seo.util');

const MAX_LIMIT = 50;
const ALLOWED_SORT_FIELDS = ['createdAt', 'sellingPrice', 'name'];

class ProductPublicController {

  // =====================================================
  // GET PRODUCTS (PUBLIC LISTING + LAYOUT)
  // =====================================================
  getProducts = async (req, res, next) => {
    try {
      const { organizationSlug } = req.params;
      let {
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        category,
        minPrice,
        maxPrice,
        search,
        tags,
        inStock
      } = req.query;

      // 1. Normalize Inputs
      page = Math.max(parseInt(page, 10) || 1, 1);
      limit = Math.min(parseInt(limit, 10) || 20, MAX_LIMIT);
      sortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
      sortOrder = sortOrder === 'asc' ? 'asc' : 'desc';
      const skip = (page - 1) * limit;

      // 2. Resolve Organization
      const organization = await Organization.findOne({
        uniqueShopId: organizationSlug.toUpperCase(),
        isActive: true
      }).select('_id name uniqueShopId primaryEmail primaryPhone logo'); // Selected more fields for response

      if (!organization) {
        return next(new AppError('Store not found', 404));
      }

      // 3. Build Query
      const query = {
        organizationId: organization._id,
        isActive: true
      };

      // ... (Keep your existing Filter Logic here) ...
      if (category) {
        const escapedCategory = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.category = { $regex: new RegExp('^' + escapedCategory, 'i') };
      }
      if (tags) {
        const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
        if (tagList.length > 0) query.tags = { $in: tagList };
      }
      if (minPrice || maxPrice) {
        query.sellingPrice = {};
        if (minPrice) query.sellingPrice.$gte = Number(minPrice);
        if (maxPrice) query.sellingPrice.$lte = Number(maxPrice);
      }
      if (search) {
        const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        query.$or = [
          { name: { $regex: searchRegex } },
          { description: { $regex: searchRegex } },
          { sku: { $regex: searchRegex } }
        ];
      }
      if (inStock === 'true') {
        query.inventory = { $elemMatch: { quantity: { $gt: 0 } } };
      }

      // 4. Execute Queries AND Fetch Layout (PARALLEL)
      // ✅ We added LayoutService.getLayout() to the promise array
      const [products, total, layoutData] = await Promise.all([
        Product.find(query)
          .select('name slug description images sellingPrice discountedPrice category tags sku inventory brand')
          .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Product.countDocuments(query),
        LayoutService.getLayout(organization._id)
      ]);

      // 5. Hydrate Layout (PARALLEL)
      // ✅ Hydrate header and footer so they match the rest of the site
      const [hydratedHeader, hydratedFooter] = await Promise.all([
        DataHydrationService.hydrateSections(layoutData.header, organization._id),
        DataHydrationService.hydrateSections(layoutData.footer, organization._id)
      ]);

      // 6. Transform Data for Public API
      const transformed = products.map(p => {
        const totalStock = p.inventory?.reduce((sum, inv) => sum + (inv.quantity || 0), 0) || 0;
        return {
          id: p._id,
          name: p.name,
          slug: p.slug,
          description: p.description, 
          images: p.images || [],
          brand: p.brand,
          price: {
            original: p.sellingPrice,
            discounted: p.discountedPrice,
            currency: 'USD',
            hasDiscount: !!(p.discountedPrice && p.discountedPrice < p.sellingPrice)
          },
          category: p.category,
          tags: p.tags || [],
          sku: p.sku,
          stock: {
            available: totalStock > 0,
            lowStock: totalStock > 0 && totalStock < 5,
            qty: totalStock 
          },
          url: `/store/${organizationSlug}/products/${p.slug}`
        };
      });

      // 7. SEO Headers
      const listSchema = buildProductListSchema(transformed);
      res.set({
        'Link': `<${buildCanonicalUrl(req)}>; rel="canonical"`,
        'X-Robots-Tag': buildRobotsMeta(false)
      });

      // 8. Response (Includes Layout & Settings now)
      res.status(200).json({
        organization: {
          id: organization._id,
          name: organization.name,
          slug: organizationSlug,
          logo: organization.logo,
          contact: {
             email: organization.primaryEmail,
             phone: organization.primaryPhone
          }
        },
        // ✅ Layout Added
        layout: {
          header: hydratedHeader,
          footer: hydratedFooter
        },
        // ✅ Settings Added
        settings: layoutData.globalSettings || {},
        
        products: transformed,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        seo: {
          canonical: buildCanonicalUrl(req),
          jsonLd: listSchema
        }
      });

    } catch (err) {
      next(err);
    }
  }

  // =====================================================
  // GET SINGLE PRODUCT (PUBLIC DETAILS + LAYOUT)
  // =====================================================
  getProductBySlug = async (req, res, next) => {
    try {
      const { organizationSlug, productSlug } = req.params;

      const organization = await Organization.findOne({
        uniqueShopId: organizationSlug.toUpperCase(),
        isActive: true
      }).select('_id name uniqueShopId primaryEmail primaryPhone logo');

      if (!organization) {
        return next(new AppError('Store not found', 404));
      }

      // ✅ Fetch Product AND Layout in parallel
      const [product, layoutData] = await Promise.all([
        Product.findOne({
          organizationId: organization._id,
          slug: productSlug,
          isActive: true
        }).select('name slug description images sellingPrice discountedPrice category subCategory brand tags sku inventory taxRate isTaxInclusive attributes').lean(),
        
        LayoutService.getLayout(organization._id)
      ]);

      if (!product) {
        return next(new AppError('Product not found', 404));
      }

      // ✅ Hydrate Header/Footer
      const [hydratedHeader, hydratedFooter] = await Promise.all([
        DataHydrationService.hydrateSections(layoutData.header, organization._id),
        DataHydrationService.hydrateSections(layoutData.footer, organization._id)
      ]);

      // Increment Views (Fire and forget)
      this.incrementProductViews(product._id);

      // Stock Calculation
      const totalStock = product.inventory?.reduce((sum, inv) => sum + (inv.quantity || 0), 0) || 0;

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
          hasDiscount: !!(product.discountedPrice && product.discountedPrice < product.sellingPrice)
        },
        category: product.category,
        subCategory: product.subCategory,
        brand: product.brand,
        tags: product.tags || [],
        sku: product.sku,
        attributes: product.attributes || [],
        stock: {
          available: totalStock > 0,
          quantity: totalStock,
          lowStock: totalStock > 0 && totalStock < 5
        },
        organization: {
          id: organization._id,
          name: organization.name
        }
      };

      const schema = buildProductSchema(publicProduct, organizationSlug);

      res.set({
        'Link': `<${buildCanonicalUrl(req)}>; rel="canonical"`,
        'X-Robots-Tag': buildRobotsMeta(false)
      });

      res.status(200).json({
        organization: {
           id: organization._id,
           name: organization.name,
           slug: organizationSlug,
           logo: organization.logo,
           contact: {
              email: organization.primaryEmail,
              phone: organization.primaryPhone
           }
        },
        // ✅ Layout Added
        layout: {
          header: hydratedHeader,
          footer: hydratedFooter
        },
        settings: layoutData.globalSettings || {},

        product: publicProduct,
        seo: {
          canonical: buildCanonicalUrl(req),
          jsonLd: schema
        },
        breadcrumbs: [
          { name: 'Home', url: `/store/${organizationSlug}` },
          { name: 'Products', url: `/store/${organizationSlug}/products` },
          { name: product.category, url: `/store/${organizationSlug}/products?category=${encodeURIComponent(product.category)}` },
          { name: product.name, url: `/store/${organizationSlug}/products/${productSlug}` }
        ]
      });

    } catch (err) {
      next(err);
    }
  }

  // =====================================================
  // GET CATEGORIES
  // =====================================================
  getCategories = async (req, res, next) => {
    try {
      const { organizationSlug } = req.params;
      const organization = await Organization.findOne({
        uniqueShopId: organizationSlug.toUpperCase(),
        isActive: true
      }).select('_id');

      if (!organization) return next(new AppError('Store not found', 404));

      const categories = await Product.aggregate([
        { $match: { organizationId: organization._id, isActive: true, category: { $exists: true, $ne: '' } } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $project: { _id: 0, name: '$_id', count: 1 } },
        { $sort: { count: -1 } }
      ]);

      const formattedCategories = categories.map(c => ({
        _id: c.name, 
        name: c.name,
        count: c.count
      }));

      res.set({ 'X-Robots-Tag': buildRobotsMeta(true) });
      res.status(200).json({ organizationSlug, categories: formattedCategories, totalCategories: categories.length });
    } catch (err) { next(err); }
  }

  // =====================================================
  // GET TAGS
  // =====================================================
  getTags = async (req, res, next) => {
    try {
      const { organizationSlug } = req.params;
      const organization = await Organization.findOne({
        uniqueShopId: organizationSlug.toUpperCase(),
        isActive: true
      }).select('_id');

      if (!organization) return next(new AppError('Store not found', 404));

      const tags = await Product.aggregate([
        { $match: { organizationId: organization._id, isActive: true, tags: { $exists: true, $ne: [] } } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags' } },
        { $limit: 50 },
        { $sort: { _id: 1 } }
      ]);

      res.set({ 'X-Robots-Tag': buildRobotsMeta(true) });
      res.status(200).json({ count: tags.length, tags: tags.map(t => t._id) });
    } catch (err) { next(err); }
  }

  // =====================================================
  // SEARCH
  // =====================================================
  searchProducts = async (req, res, next) => {
    try {
      const { organizationSlug } = req.params;
      const q = (req.query.q || '').trim();
      
      if (q.length < 2) return res.status(200).json({ results: [] });

      const organization = await Organization.findOne({
        uniqueShopId: organizationSlug.toUpperCase(),
        isActive: true
      }).select('_id');

      if (!organization) return next(new AppError('Store not found', 404));

      const results = await Product.find({
        organizationId: organization._id,
        isActive: true,
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { sku: { $regex: q, $options: 'i' } },
          { tags: { $regex: q, $options: 'i' } }
        ]
      })
      .select('name slug images sellingPrice category')
      .limit(10)
      .lean();

      res.set({ 'X-Robots-Tag': buildRobotsMeta(true) });
      res.status(200).json({
        query: q,
        results: results.map(p => ({
          id: p._id,
          name: p.name,
          slug: p.slug,
          image: p.images?.[0],
          price: p.sellingPrice,
          category: p.category,
          url: `/store/${organizationSlug}/products/${p.slug}`
        }))
      });
    } catch (err) { next(err); }
  }

  // =====================================================
  // VIEW COUNTER
  // =====================================================
  incrementProductViews = async (productId) => {
    try {
      await Product.findByIdAndUpdate(productId, { $inc: { views: 1 } });
    } catch (_) {
      // Fail silently for analytics
    }
  }
}

module.exports = new ProductPublicController();

// const Product = require('../../../modules/inventory/core/product.model');
// const Organization = require('../../../modules/organization/core/organization.model');
// const AppError = require('../../../core/utils/appError');

// const { buildProductSchema } = require('../../utils/constants/seo/productSchema.util');
// const { buildProductListSchema } = require('../../utils/constants/seo/productListSchema.util');
// const { buildCanonicalUrl, buildRobotsMeta } = require('../../utils/constants/seo/seo.util');

// const MAX_LIMIT = 50;
// const ALLOWED_SORT_FIELDS = ['createdAt', 'sellingPrice', 'name'];

// class ProductPublicController {

//   // =====================================================
//   // GET PRODUCTS (PUBLIC LISTING)
//   // =====================================================
//   getProducts = async (req, res, next) => {
//     try {
//       const { organizationSlug } = req.params;
//       let {
//         page = 1,
//         limit = 20,
//         sortBy = 'createdAt',
//         sortOrder = 'desc',
//         category,
//         minPrice,
//         maxPrice,
//         search,
//         tags,
//         inStock
//       } = req.query;

//       // 1. Normalize Inputs
//       page = Math.max(parseInt(page, 10) || 1, 1);
//       limit = Math.min(parseInt(limit, 10) || 20, MAX_LIMIT);
//       sortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
//       sortOrder = sortOrder === 'asc' ? 'asc' : 'desc';
//       const skip = (page - 1) * limit;

//       // 2. Resolve Organization
//       const organization = await Organization.findOne({
//         uniqueShopId: organizationSlug.toUpperCase(),
//         isActive: true
//       }).select('_id');

//       if (!organization) {
//         return next(new AppError('Store not found', 404));
//       }

//       // 3. Build Query
//       const query = {
//         organizationId: organization._id,
//         isActive: true
//       };

//       // Filter: Category (Case-insensitive & Safe)
//       if (category) {
//         const escapedCategory = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
//         query.category = { $regex: new RegExp('^' + escapedCategory, 'i') };
//       }

//       // Filter: Tags
//       if (tags) {
//         const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
//         if (tagList.length > 0) {
//           query.tags = { $in: tagList };
//         }
//       }

//       // Filter: Price Range
//       if (minPrice || maxPrice) {
//         query.sellingPrice = {};
//         if (minPrice) query.sellingPrice.$gte = Number(minPrice);
//         if (maxPrice) query.sellingPrice.$lte = Number(maxPrice);
//       }

//       // Filter: Search (Name, SKU, Description)
//       if (search) {
//         const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
//         query.$or = [
//           { name: { $regex: searchRegex } },
//           { description: { $regex: searchRegex } },
//           { sku: { $regex: searchRegex } }
//         ];
//       }
//       if (inStock === 'true') {
//         query.inventory = { $elemMatch: { quantity: { $gt: 0 } } };
//       }

//       // 4. Execute Queries (Parallel)
//       const [products, total] = await Promise.all([
//         Product.find(query)
//           .select('name slug description images sellingPrice discountedPrice category tags sku inventory brand')
//           .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
//           .skip(skip)
//           .limit(limit)
//           .lean(),
//         Product.countDocuments(query)
//       ]);

//       // 5. Transform Data for Public API
//       const transformed = products.map(p => {
//         // Calculate total available stock across all branches
//         const totalStock = p.inventory?.reduce((sum, inv) => sum + (inv.quantity || 0), 0) || 0;
        
//         return {
//           id: p._id,
//           name: p.name,
//           slug: p.slug,
//           description: p.description, 
//           images: p.images || [],
//           brand: p.brand,
//           price: {
//             original: p.sellingPrice,
//             discounted: p.discountedPrice,
//             currency: 'USD',
//             hasDiscount: !!(p.discountedPrice && p.discountedPrice < p.sellingPrice)
//           },
//           category: p.category,
//           tags: p.tags || [],
//           sku: p.sku,
//           stock: {
//             available: totalStock > 0,
//             lowStock: totalStock > 0 && totalStock < 5,
//             qty: totalStock 
//           },
//           url: `/store/${organizationSlug}/products/${p.slug}`
//         };
//       });

//       // 6. SEO Headers
//       const listSchema = buildProductListSchema(transformed);
//       res.set({
//         'Link': `<${buildCanonicalUrl(req)}>; rel="canonical"`,
//         'X-Robots-Tag': buildRobotsMeta(false)
//       });

//       // 7. Response
//       res.status(200).json({
//         organizationSlug,
//         products: transformed,
//         pagination: {
//           page,
//           limit,
//           total,
//           pages: Math.ceil(total / limit)
//         },
//         seo: {
//           canonical: buildCanonicalUrl(req),
//           jsonLd: listSchema
//         }
//       });

//     } catch (err) {
//       next(err);
//     }
//   }

//   // =====================================================
//   // GET SINGLE PRODUCT
//   // =====================================================
//   getProductBySlug = async (req, res, next) => {
//     try {
//       const { organizationSlug, productSlug } = req.params;

//       const organization = await Organization.findOne({
//         uniqueShopId: organizationSlug.toUpperCase(),
//         isActive: true
//       }).select('_id name');

//       if (!organization) {
//         return next(new AppError('Store not found', 404));
//       }

//       const product = await Product.findOne({
//         organizationId: organization._id,
//         slug: productSlug,
//         isActive: true
//       })
//       .select('name slug description images sellingPrice discountedPrice category subCategory brand tags sku inventory taxRate isTaxInclusive attributes')
//       .lean();

//       if (!product) {
//         return next(new AppError('Product not found', 404));
//       }

//       // Increment Views (Fire and forget)
//       this.incrementProductViews(product._id);

//       // Stock Calculation
//       const totalStock = product.inventory?.reduce((sum, inv) => sum + (inv.quantity || 0), 0) || 0;

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
//           hasDiscount: !!(product.discountedPrice && product.discountedPrice < product.sellingPrice)
//         },
//         category: product.category,
//         subCategory: product.subCategory,
//         brand: product.brand,
//         tags: product.tags || [],
//         sku: product.sku,
//         attributes: product.attributes || [], // Specific details like Color, Size
//         stock: {
//           available: totalStock > 0,
//           quantity: totalStock,
//           lowStock: totalStock > 0 && totalStock < 5
//         },
//         organization: {
//           id: organization._id,
//           name: organization.name
//         }
//       };

//       const schema = buildProductSchema(publicProduct, organizationSlug);

//       res.set({
//         'Link': `<${buildCanonicalUrl(req)}>; rel="canonical"`,
//         'X-Robots-Tag': buildRobotsMeta(false)
//       });

//       res.status(200).json({
//         product: publicProduct,
//         seo: {
//           canonical: buildCanonicalUrl(req),
//           jsonLd: schema
//         },
//         breadcrumbs: [
//           { name: 'Home', url: `/store/${organizationSlug}` },
//           { name: 'Products', url: `/store/${organizationSlug}/products` },
//           { name: product.category, url: `/store/${organizationSlug}/products?category=${encodeURIComponent(product.category)}` },
//           { name: product.name, url: `/store/${organizationSlug}/products/${productSlug}` }
//         ]
//       });

//     } catch (err) {
//       next(err);
//     }
//   }

//   // =====================================================
//   // GET CATEGORIES
//   // =====================================================
//   getCategories = async (req, res, next) => {
//     try {
//       const { organizationSlug } = req.params;
//       const organization = await Organization.findOne({
//         uniqueShopId: organizationSlug.toUpperCase(),
//         isActive: true
//       }).select('_id');

//       if (!organization) return next(new AppError('Store not found', 404));

//       const categories = await Product.aggregate([
//         { $match: { organizationId: organization._id, isActive: true, category: { $exists: true, $ne: '' } } },
//         { $group: { _id: '$category', count: { $sum: 1 } } },
//         { $project: { _id: 0, name: '$_id', count: 1 } },
//         { $sort: { count: -1 } }
//       ]);

//       // Remap for cleaner frontend consumption
//       const formattedCategories = categories.map(c => ({
//         _id: c.name, 
//         name: c.name,
//         count: c.count
//       }));

//       res.set({ 'X-Robots-Tag': buildRobotsMeta(true) });
//       res.status(200).json({ organizationSlug, categories: formattedCategories, totalCategories: categories.length });
//     } catch (err) { next(err); }
//   }

//   // =====================================================
//   // GET TAGS
//   // =====================================================
//   getTags = async (req, res, next) => {
//     try {
//       const { organizationSlug } = req.params;
//       const organization = await Organization.findOne({
//         uniqueShopId: organizationSlug.toUpperCase(),
//         isActive: true
//       }).select('_id');

//       if (!organization) return next(new AppError('Store not found', 404));

//       const tags = await Product.aggregate([
//         { $match: { organizationId: organization._id, isActive: true, tags: { $exists: true, $ne: [] } } },
//         { $unwind: '$tags' },
//         { $group: { _id: '$tags' } },
//         { $limit: 50 },
//         { $sort: { _id: 1 } }
//       ]);

//       res.set({ 'X-Robots-Tag': buildRobotsMeta(true) });
//       res.status(200).json({ count: tags.length, tags: tags.map(t => t._id) });
//     } catch (err) { next(err); }
//   }

//   // =====================================================
//   // SEARCH
//   // =====================================================
//   searchProducts = async (req, res, next) => {
//     try {
//       const { organizationSlug } = req.params;
//       const q = (req.query.q || '').trim();
      
//       if (q.length < 2) return res.status(200).json({ results: [] });

//       const organization = await Organization.findOne({
//         uniqueShopId: organizationSlug.toUpperCase(),
//         isActive: true
//       }).select('_id');

//       if (!organization) return next(new AppError('Store not found', 404));

//       const results = await Product.find({
//         organizationId: organization._id,
//         isActive: true,
//         $or: [
//           { name: { $regex: q, $options: 'i' } },
//           { sku: { $regex: q, $options: 'i' } },
//           { tags: { $regex: q, $options: 'i' } }
//         ]
//       })
//       .select('name slug images sellingPrice category')
//       .limit(10)
//       .lean();

//       res.set({ 'X-Robots-Tag': buildRobotsMeta(true) });
//       res.status(200).json({
//         query: q,
//         results: results.map(p => ({
//           id: p._id,
//           name: p.name,
//           slug: p.slug,
//           image: p.images?.[0],
//           price: p.sellingPrice,
//           category: p.category,
//           url: `/store/${organizationSlug}/products/${p.slug}`
//         }))
//       });
//     } catch (err) { next(err); }
//   }

//   // =====================================================
//   // VIEW COUNTER
//   // =====================================================
//   incrementProductViews = async (productId) => {
//     try {
//       await Product.findByIdAndUpdate(productId, { $inc: { views: 1 } });
//     } catch (_) {
//       // Fail silently for analytics
//     }
//   }
// }

// module.exports = new ProductPublicController();

// // const Product = require('../../../modules/inventory/core/product.model');
// // const Organization = require('../../../modules/organization/core/organization.model');
// // const AppError = require('../../../core/utils/appError');

// // const { buildProductSchema } = require('../../utils/constants/seo/productSchema.util');
// // const { buildProductListSchema } = require('../../utils/constants/seo/productListSchema.util');
// // const { buildCanonicalUrl, buildRobotsMeta } = require('../../utils/constants/seo/seo.util');

// // const MAX_LIMIT = 50;
// // const ALLOWED_SORT_FIELDS = ['createdAt', 'sellingPrice', 'name'];

// // class ProductPublicController {

// //   // =====================================================
// //   // GET PRODUCTS (PUBLIC LISTING)
// //   // =====================================================
// //   getProducts = async (req, res, next) => {
// //     try {
// //       const { organizationSlug } = req.params;

// //       let { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', category, minPrice, maxPrice, search, tags, inStock } = req.query;
// //       page = Math.max(parseInt(page, 10) || 1, 1);
// //       limit = Math.min(parseInt(limit, 10) || 20, MAX_LIMIT);
// //       sortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
// //       sortOrder = sortOrder === 'asc' ? 'asc' : 'desc';

// //       const skip = (page - 1) * limit;

// //       const organization = await Organization.findOne({
// //         uniqueShopId: organizationSlug.toUpperCase(),
// //         isActive: true
// //       }).select('_id');

// //       if (!organization) {
// //         return next(new AppError('Store not found', 404));
// //       }

// //       const query = {
// //         organizationId: organization._id,
// //         isActive: true
// //       };

// //       if (category) {
// //         const escapedCategory = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// //         query.category = { $regex: new RegExp('^' + escapedCategory, 'i') };
// //       }

// //       if (tags) {
// //         query.tags = { $in: tags.split(',') };
// //       }

// //       if (minPrice || maxPrice) {
// //         query.sellingPrice = {};
// //         if (minPrice) query.sellingPrice.$gte = Number(minPrice);
// //         if (maxPrice) query.sellingPrice.$lte = Number(maxPrice);
// //       }

// //       if (inStock === 'true') {
// //         query.inventory = { $elemMatch: { quantity: { $gt: 0 } } };
// //       }

// //       if (search) {
// //         query.$or = [
// //           { name: { $regex: search, $options: 'i' } },
// //           { description: { $regex: search, $options: 'i' } },
// //           { sku: { $regex: search, $options: 'i' } }
// //         ];
// //       }

// //       const [products, total] = await Promise.all([
// //         Product.find(query)
// //           .select('name slug description images sellingPrice discountedPrice category tags sku inventory')
// //           .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
// //           .skip(skip)
// //           .limit(limit)
// //           .lean(),
// //         Product.countDocuments(query)
// //       ]);

// //       const transformed = products.map(p => ({
// //         id: p._id,
// //         name: p.name,
// //         slug: p.slug,
// //         description: p.description,
// //         images: p.images || [],
// //         price: {
// //           original: p.sellingPrice,
// //           discounted: p.discountedPrice,
// //           currency: 'USD',
// //           hasDiscount: !!(p.discountedPrice && p.discountedPrice < p.sellingPrice)
// //         },
// //         category: p.category,
// //         tags: p.tags || [],
// //         sku: p.sku,
// //         stock: {
// //           available: p.inventory?.some(i => i.quantity > 0) || false
// //         },
// //         url: `/store/${organizationSlug}/products/${p.slug}`
// //       }));

// //       const listSchema = buildProductListSchema(transformed);

// //       res.set({
// //         'Link': `<${buildCanonicalUrl(req)}>; rel="canonical"`,
// //         'X-Robots-Tag': buildRobotsMeta(false)
// //       });

// //       res.status(200).json({
// //         organizationSlug,
// //         products: transformed,
// //         seo: {
// //           canonical: buildCanonicalUrl(req),
// //           jsonLd: listSchema
// //         },
// //         pagination: {
// //           page,
// //           limit,
// //           total,
// //           pages: Math.ceil(total / limit)
// //         }
// //       });

// //     } catch (err) {
// //       next(err);
// //     }
// //   }

// //   // =====================================================
// //   // GET SINGLE PRODUCT
// //   // =====================================================
// //   getProductBySlug = async (req, res, next) => {
// //     try {
// //       const { organizationSlug, productSlug } = req.params;

// //       const organization = await Organization.findOne({
// //         uniqueShopId: organizationSlug.toUpperCase(),
// //         isActive: true
// //       }).select('_id name');

// //       if (!organization) {
// //         return next(new AppError('Store not found', 404));
// //       }

// //       const product = await Product.findOne({
// //         organizationId: organization._id,
// //         slug: productSlug,
// //         isActive: true
// //       })
// //         .select('name slug description images sellingPrice discountedPrice category subCategory brand tags sku inventory taxRate isTaxInclusive')
// //         .lean();

// //       if (!product) {
// //         return next(new AppError('Product not found', 404));
// //       }

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
// //         category: product.category,
// //         subCategory: product.subCategory,
// //         brand: product.brand,
// //         tags: product.tags || [],
// //         sku: product.sku,
// //         stock: {
// //           available: product.inventory?.some(i => i.quantity > 0) || false
// //         },
// //         organization: {
// //           id: organization._id,
// //           name: organization.name
// //         }
// //       };

// //       // THIS calls the internal method below, so 'this' must be correct
// //       this.incrementProductViews(product._id);

// //       const schema = buildProductSchema(publicProduct, organizationSlug);

// //       res.set({
// //         'Link': `<${buildCanonicalUrl(req)}>; rel="canonical"`,
// //         'X-Robots-Tag': buildRobotsMeta(false)
// //       });

// //       res.status(200).json({
// //         product: publicProduct,
// //         seo: {
// //           canonical: buildCanonicalUrl(req),
// //           jsonLd: schema
// //         },
// //         breadcrumbs: [
// //           { name: 'Home', url: `/store/${organizationSlug}` },
// //           { name: 'Products', url: `/store/${organizationSlug}/products` },
// //           { name: product.category, url: `/store/${organizationSlug}/products?category=${encodeURIComponent(product.category)}` },
// //           { name: product.name, url: `/store/${organizationSlug}/products/${productSlug}` }
// //         ]
// //       });

// //     } catch (err) {
// //       next(err);
// //     }
// //   }

// //   // ... (Other methods should also be arrow functions like below) ...

// //   getCategories = async (req, res, next) => {
// //     // ... Copy logic from previous turn or leave as is if not calling 'this' ...
// //     // BUT safest to convert ALL to arrow functions.
// //     try {
// //       const { organizationSlug } = req.params;
// //       const organization = await Organization.findOne({
// //         uniqueShopId: organizationSlug.toUpperCase(),
// //         isActive: true
// //       }).select('_id');

// //       if (!organization) return next(new AppError('Store not found', 404));

// //       const categories = await Product.aggregate([
// //         { $match: { organizationId: organization._id, isActive: true, category: { $exists: true, $ne: '' } } },
// //         { $group: { _id: '$category', count: { $sum: 1 } } },
// //         { $project: { _id: 0, name: '$_id', count: 1 } },
// //         { $sort: { count: -1 } }
// //       ]);

// //       res.set({ 'X-Robots-Tag': buildRobotsMeta(true) });
// //       res.status(200).json({ organizationSlug, categories, totalCategories: categories.length });
// //     } catch (err) { next(err); }
// //   }

// //   getTags = async (req, res, next) => {
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
// //         { $limit: 50 }
// //       ]);

// //       res.set({ 'X-Robots-Tag': buildRobotsMeta(true) });
// //       res.status(200).json({ count: tags.length, tags: tags.map(t => t._id) });
// //     } catch (err) { next(err); }
// //   }

// //   searchProducts = async (req, res, next) => {
// //     try {
// //       const { organizationSlug } = req.params;
// //       const q = (req.query.q || '').trim();
// //       if (q.length < 2) return res.status(200).json({ results: [] });

// //       const organization = await Organization.findOne({
// //         uniqueShopId: organizationSlug.toUpperCase(),
// //         isActive: true
// //       }).select('_id');

// //       if (!organization) return next(new AppError('Store not found', 404));

// //       const results = await Product.find({
// //         organizationId: organization._id,
// //         isActive: true,
// //         $or: [
// //           { name: { $regex: q, $options: 'i' } },
// //           { sku: { $regex: q, $options: 'i' } },
// //           { tags: { $regex: q, $options: 'i' } }
// //         ]
// //       })
// //         .select('name slug images sellingPrice category')
// //         .limit(10)
// //         .lean();

// //       res.set({ 'X-Robots-Tag': buildRobotsMeta(true) });
// //       res.status(200).json({
// //         query: q,
// //         results: results.map(p => ({
// //           id: p._id,
// //           name: p.name,
// //           slug: p.slug,
// //           image: p.images?.[0],
// //           price: p.sellingPrice,
// //           category: p.category,
// //           url: `/store/${organizationSlug}/products/${p.slug}`
// //         }))
// //       });
// //     } catch (err) { next(err); }
// //   }

// //   incrementProductViews = async (productId) => {
// //     try {
// //       await Product.findByIdAndUpdate(productId, { $inc: { views: 1 } });
// //     } catch (_) { }
// //   }
// // }

// // module.exports = new ProductPublicController();
