// src/controllers/storefront/productPublic.controller.js

const { Product } = require('../../../modules/inventory/core/product.model');
const { Organization } = require('../../../modules/organization/core/organization.model');
const AppError = require('../../../core/utils/appError');

const { buildProductSchema } = require('../../utils/constants/seo/productSchema.util');
const { buildProductListSchema } = require('../../utils/constants/seo/productListSchema.util');
const { buildCanonicalUrl, buildRobotsMeta } = require('../../utils/constants/seo/seo.util');

const MAX_LIMIT = 50;
const ALLOWED_SORT_FIELDS = ['createdAt', 'sellingPrice', 'name'];

class ProductPublicController {

  // =====================================================
  // GET PRODUCTS (PUBLIC LISTING)
  // =====================================================
  async getProducts(req, res, next) {
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

      // -----------------------------
      // Normalize & guard inputs
      // -----------------------------
      page = Math.max(parseInt(page, 10) || 1, 1);
      limit = Math.min(parseInt(limit, 10) || 20, MAX_LIMIT);
      sortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
      sortOrder = sortOrder === 'asc' ? 'asc' : 'desc';

      const skip = (page - 1) * limit;

      // -----------------------------
      // Resolve organization
      // -----------------------------
      const organization = await Organization.findOne({
        uniqueShopId: organizationSlug.toUpperCase(),
        isActive: true
      }).select('_id');

      if (!organization) {
        return next(new AppError('Store not found', 404));
      }

      // -----------------------------
      // Build Mongo query
      // -----------------------------
      const query = {
        organizationId: organization._id,
        isActive: true
      };

      if (category) query.category = category;

      if (tags) {
        query.tags = { $in: tags.split(',') };
      }

      if (minPrice || maxPrice) {
        query.sellingPrice = {};
        if (minPrice) query.sellingPrice.$gte = Number(minPrice);
        if (maxPrice) query.sellingPrice.$lte = Number(maxPrice);
      }

      if (inStock === 'true') {
        query.inventory = { $elemMatch: { quantity: { $gt: 0 } } };
      }

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { sku: { $regex: search, $options: 'i' } }
        ];
      }

      // -----------------------------
      // Execute queries
      // -----------------------------
      const [products, total] = await Promise.all([
        Product.find(query)
          .select('name slug description images sellingPrice discountedPrice category tags sku inventory')
          .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Product.countDocuments(query)
      ]);

      // -----------------------------
      // Public-safe transform
      // -----------------------------
      const transformed = products.map(p => ({
        id: p._id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        images: p.images || [],
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
          available: p.inventory?.some(i => i.quantity > 0) || false
        },
        url: `/store/${organizationSlug}/products/${p.slug}`
      }));

      // -----------------------------
      // SEO (ItemList)
      // -----------------------------
      const listSchema = buildProductListSchema(transformed);

      res.set({
        'Link': `<${buildCanonicalUrl(req)}>; rel="canonical"`,
        'X-Robots-Tag': buildRobotsMeta(false)
      });

      res.status(200).json({
        organizationSlug,
        products: transformed,
        seo: {
          canonical: buildCanonicalUrl(req),
          jsonLd: listSchema
        },
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (err) {
      next(err);
    }
  }

  // =====================================================
  // GET SINGLE PRODUCT
  // =====================================================
  async getProductBySlug(req, res, next) {
    try {
      const { organizationSlug, productSlug } = req.params;

      const organization = await Organization.findOne({
        uniqueShopId: organizationSlug.toUpperCase(),
        isActive: true
      }).select('_id name');

      if (!organization) {
        return next(new AppError('Store not found', 404));
      }

      const product = await Product.findOne({
        organizationId: organization._id,
        slug: productSlug,
        isActive: true
      })
        .select('name slug description images sellingPrice discountedPrice category subCategory brand tags sku inventory taxRate isTaxInclusive')
        .lean();

      if (!product) {
        return next(new AppError('Product not found', 404));
      }

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
        stock: {
          available: product.inventory?.some(i => i.quantity > 0) || false
        },
        organization: {
          id: organization._id,
          name: organization.name
        }
      };

      // async, non-blocking
      this.incrementProductViews(product._id);

      const schema = buildProductSchema(publicProduct, organizationSlug);

      res.set({
        'Link': `<${buildCanonicalUrl(req)}>; rel="canonical"`,
        'X-Robots-Tag': buildRobotsMeta(false)
      });

      res.status(200).json({
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
  // GET CATEGORIES (NOINDEX)
  // =====================================================
  async getCategories(req, res, next) {
    try {
      const { organizationSlug } = req.params;

      const organization = await Organization.findOne({
        uniqueShopId: organizationSlug.toUpperCase(),
        isActive: true
      }).select('_id');

      if (!organization) {
        return next(new AppError('Store not found', 404));
      }

      const categories = await Product.aggregate([
        { $match: { organizationId: organization._id, isActive: true, category: { $exists: true, $ne: '' } } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $project: { _id: 0, name: '$_id', count: 1 } },
        { $sort: { count: -1 } }
      ]);

      res.set({ 'X-Robots-Tag': buildRobotsMeta(true) });

      res.status(200).json({
        organizationSlug,
        categories,
        totalCategories: categories.length
      });

    } catch (err) {
      next(err);
    }
  }

  // =====================================================
  // GET TAGS (NOINDEX)
  // =====================================================
  async getTags(req, res, next) {
    try {
      const { organizationSlug } = req.params;

      const organization = await Organization.findOne({
        uniqueShopId: organizationSlug.toUpperCase(),
        isActive: true
      }).select('_id');

      if (!organization) {
        return next(new AppError('Store not found', 404));
      }

      const tags = await Product.aggregate([
        { $match: { organizationId: organization._id, isActive: true, tags: { $exists: true, $ne: [] } } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags' } },
        { $limit: 50 }
      ]);

      res.set({ 'X-Robots-Tag': buildRobotsMeta(true) });

      res.status(200).json({
        count: tags.length,
        tags: tags.map(t => t._id)
      });

    } catch (err) {
      next(err);
    }
  }

  // =====================================================
  // SEARCH (NOINDEX)
  // =====================================================
  async searchProducts(req, res, next) {
    try {
      const { organizationSlug } = req.params;
      const q = (req.query.q || '').trim();

      if (q.length < 2) {
        return res.status(200).json({ results: [] });
      }

      const organization = await Organization.findOne({
        uniqueShopId: organizationSlug.toUpperCase(),
        isActive: true
      }).select('_id');

      if (!organization) {
        return next(new AppError('Store not found', 404));
      }

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

    } catch (err) {
      next(err);
    }
  }

  // =====================================================
  // VIEW COUNTER (SAFE, NON-BLOCKING)
  // =====================================================
  async incrementProductViews(productId) {
    try {
      await Product.findByIdAndUpdate(productId, { $inc: { views: 1 } });
    } catch (_) {}
  }
}

module.exports = new ProductPublicController();


// // src/controllers/storefront/productPublic.controller.js

// const { Product } = require('../../../modules/inventory/core/product.model');
// const { Organization } = require('../../../modules/organization/core/organization.model');
// const AppError = require('../../../core/utils/appError');
//       const { buildProductSchema } = require('../../utils/constants/seo/productSchema.util');
// const { buildCanonicalUrl, buildRobotsMeta } = require('../../utils/constants/seo/seo.util');

// const MAX_LIMIT = 50;

// class ProductPublicController {

//   // =====================================================
//   // GET PRODUCTS (PUBLIC LISTING)
//   // =====================================================
//   async getProducts(req, res, next) {
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

//       // -----------------------------
//       // Normalize & protect inputs
//       // -----------------------------
//       page = Math.max(parseInt(page, 10) || 1, 1);
//       limit = Math.min(parseInt(limit, 10) || 20, MAX_LIMIT);
//       const skip = (page - 1) * limit;

//       // -----------------------------
//       // Resolve organization
//       // -----------------------------
//       const organization = await Organization.findOne({
//         uniqueShopId: organizationSlug.toUpperCase(),
//         isActive: true
//       }).select('_id');

//       if (!organization) {
//         return next(new AppError('Store not found', 404));
//       }

//       // -----------------------------
//       // Build Mongo query
//       // -----------------------------
//       const query = {
//         organizationId: organization._id,
//         isActive: true
//       };

//       if (category) query.category = category;

//       if (tags) {
//         query.tags = { $in: tags.split(',') };
//       }

//       if (minPrice || maxPrice) {
//         query.sellingPrice = {};
//         if (minPrice) query.sellingPrice.$gte = Number(minPrice);
//         if (maxPrice) query.sellingPrice.$lte = Number(maxPrice);
//       }

//       if (inStock === 'true') {
//         query.inventory = { $elemMatch: { quantity: { $gt: 0 } } };
//       }

//       if (search) {
//         query.$or = [
//           { name: { $regex: search, $options: 'i' } },
//           { description: { $regex: search, $options: 'i' } },
//           { sku: { $regex: search, $options: 'i' } }
//         ];
//       }

//       // -----------------------------
//       // Execute queries
//       // -----------------------------
//       const [products, total] = await Promise.all([
//         Product.find(query)
//           .select('name slug description images sellingPrice discountedPrice category tags sku inventory')
//           .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
//           .skip(skip)
//           .limit(limit)
//           .lean(),
//         Product.countDocuments(query)
//       ]);

//       // -----------------------------
//       // Public-safe transform
//       // -----------------------------
//       const transformed = products.map(p => ({
//         id: p._id,
//         name: p.name,
//         slug: p.slug,
//         description: p.description,
//         images: p.images || [],
//         price: {
//           original: p.sellingPrice,
//           discounted: p.discountedPrice,
//           currency: 'USD',
//           hasDiscount: !!(p.discountedPrice && p.discountedPrice < p.sellingPrice)
//         },
//         category: p.category,
//         tags: p.tags || [],
//         sku: p.sku,
//         stock: {
//           available: p.inventory?.some(i => i.quantity > 0) || false
//         },
//         url: `/store/${organizationSlug}/products/${p.slug}`
//       }));

//       res.status(200).json({
//         organizationSlug,
//         products: transformed,
//         pagination: {
//           page,
//           limit,
//           total,
//           pages: Math.ceil(total / limit)
//         }
//       });

//     } catch (err) {
//       next(err);
//     }
//   }

//   // =====================================================
//   // GET SINGLE PRODUCT
//   // =====================================================
//   async getProductBySlug(req, res, next) {
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
//         .select('name slug description images sellingPrice discountedPrice category subCategory brand tags sku inventory taxRate isTaxInclusive')
//         .lean();

//       if (!product) {
//         return next(new AppError('Product not found', 404));
//       }

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
//         stock: {
//           available: product.inventory?.some(i => i.quantity > 0) || false
//         },
//         organization: {
//           id: organization._id,
//           name: organization.name
//         }
//       };

//       this.incrementProductViews(product._id);

//       // res.status(200).json({
//       //   product: publicProduct,
//         const schema = buildProductSchema( publicProduct,  organizationSlug);
//         res.set({
//           'Link': `<${buildCanonicalUrl(req)}>; rel="canonical"`,
//           'X-Robots-Tag': buildRobotsMeta(false)
//         });
//           res.status(200).json({
//           product: publicProduct,
//           seo: {canonical: buildCanonicalUrl(req),jsonLd: schema},
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
//   async getCategories(req, res, next) {
//     try {
//       const { organizationSlug } = req.params;

//       const organization = await Organization.findOne({
//         uniqueShopId: organizationSlug.toUpperCase(),
//         isActive: true
//       }).select('_id');

//       if (!organization) {
//         return next(new AppError('Store not found', 404));
//       }

//       const categories = await Product.aggregate([
//         {
//           $match: {
//             organizationId: organization._id,
//             isActive: true,
//             category: { $exists: true, $ne: '' }
//           }
//         },
//         {
//           $group: {
//             _id: '$category',
//             count: { $sum: 1 }
//           }
//         },
//         {
//           $project: {
//             _id: 0,
//             name: '$_id',
//             count: 1
//           }
//         },
//         { $sort: { count: -1 } }
//       ]);

//       res.status(200).json({
//         organizationSlug,
//         categories,
//         totalCategories: categories.length
//       });

//     } catch (err) {
//       next(err);
//     }
//   }

//   // =====================================================
//   // GET TAGS
//   // =====================================================
//   async getTags(req, res, next) {
//     try {
//       const { organizationSlug } = req.params;

//       const organization = await Organization.findOne({
//         uniqueShopId: organizationSlug.toUpperCase(),
//         isActive: true
//       }).select('_id');

//       if (!organization) {
//         return next(new AppError('Store not found', 404));
//       }

//       const tags = await Product.aggregate([
//         {
//           $match: {
//             organizationId: organization._id,
//             isActive: true,
//             tags: { $exists: true, $ne: [] }
//           }
//         },
//         { $unwind: '$tags' },
//         { $group: { _id: '$tags' } },
//         { $limit: 50 }
//       ]);

//       res.status(200).json({
//         count: tags.length,
//         tags: tags.map(t => t._id)
//       });

//     } catch (err) {
//       next(err);
//     }
//   }

//   // =====================================================
//   // SEARCH
//   // =====================================================
//   async searchProducts(req, res, next) {
//     try {
//       const { organizationSlug } = req.params;
//       const q = (req.query.q || '').trim();

//       if (q.length < 2) {
//         return res.status(200).json({ results: [], suggestions: [] });
//       }

//       const organization = await Organization.findOne({
//         uniqueShopId: organizationSlug.toUpperCase(),
//         isActive: true
//       }).select('_id');

//       if (!organization) {
//         return next(new AppError('Store not found', 404));
//       }

//       const results = await Product.find({
//         organizationId: organization._id,
//         isActive: true,
//         $or: [
//           { name: { $regex: q, $options: 'i' } },
//           { sku: { $regex: q, $options: 'i' } },
//           { tags: { $regex: q, $options: 'i' } }
//         ]
//       })
//         .select('name slug images sellingPrice category')
//         .limit(10)
//         .lean();

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

//     } catch (err) {
//       next(err);
//     }
//   }

//   // =====================================================
//   // VIEW COUNTER (SAFE)
//   // =====================================================
//   async incrementProductViews(productId) {
//     try {
//       await Product.findByIdAndUpdate(productId, {
//         $inc: { views: 1 }
//       });
//     } catch (_) {}
//   }
// }

// module.exports = new ProductPublicController();


// // // src/controllers/storefront/productPublic.controller.js
// // const { Product } = require('../../../modules/inventory/core/product.model');
// // const { Organization } = require('../../../modules/organization/core/organization.model');
// // const AppError = require('../../../core/utils/appError');

// // class ProductPublicController {
// //   /**
// //    * Get products for public storefront
// //    * Route: GET /public/:organizationSlug/products
// //    */
// //   async getProducts(req, res, next) {
// //     try {
// //       const { organizationSlug } = req.params;
// //       const {
// //         page = 1,
// //         limit = 20,
// //         sortBy = 'createdAt',
// //         sortOrder = 'desc',
// //         category,
// //         minPrice,
// //         maxPrice,
// //         search,
// //         tags,
// //         inStock
// //       } = req.query;
      
// //       // Find organization
// //       const organization = await Organization.findOne({
// //         uniqueShopId: organizationSlug.toUpperCase(),
// //         isActive: true
// //       }).select('_id');
      
// //       if (!organization) {
// //         return next(new AppError('Store not found', 404));
// //       }
      
// //       // Build query
// //       const query = {
// //         organizationId: organization._id,
// //         isActive: true
// //       };
      
// //       // Apply filters
// //       if (category) {
// //         query.category = category;
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
// //         query['inventory.quantity'] = { $gt: 0 };
// //       }
      
// //       if (search) {
// //         query.$or = [
// //           { name: { $regex: search, $options: 'i' } },
// //           { description: { $regex: search, $options: 'i' } },
// //           { sku: { $regex: search, $options: 'i' } }
// //         ];
// //       }
      
// //       // Calculate pagination
// //       const skip = (page - 1) * limit;
      
// //       // Execute query with pagination
// //       const [products, total] = await Promise.all([
// //         Product.find(query)
// //           .select('name slug description images sellingPrice discountedPrice category tags sku inventory')
// //           .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
// //           .skip(skip)
// //           .limit(Number(limit))
// //           .lean(),
// //         Product.countDocuments(query)
// //       ]);
      
// //       // Transform products for public view
// //       const transformedProducts = products.map(product => ({
// //         id: product._id,
// //         name: product.name,
// //         slug: product.slug,
// //         description: product.description,
// //         images: product.images || [],
// //         price: {
// //           original: product.sellingPrice,
// //           discounted: product.discountedPrice,
// //           currency: 'USD'
// //         },
// //         category: product.category,
// //         tags: product.tags || [],
// //         sku: product.sku,
// //         stock: {
// //           total: product.inventory?.reduce((sum, inv) => sum + (inv.quantity || 0), 0) || 0,
// //           available: product.inventory?.some(inv => inv.quantity > 0) || false
// //         },
// //         url: `/store/${organizationSlug}/products/${product.slug}`
// //       }));
      
// //       res.status(200).json({
// //         organizationSlug,
// //         products: transformedProducts,
// //         pagination: {
// //           page: Number(page),
// //           limit: Number(limit),
// //           total,
// //           pages: Math.ceil(total / limit)
// //         },
// //         filters: {
// //           category,
// //           minPrice,
// //           maxPrice,
// //           search,
// //           tags,
// //           inStock
// //         },
// //         sort: {
// //           by: sortBy,
// //           order: sortOrder
// //         }
// //       });
      
// //     } catch (error) {
// //       next(error);
// //     }
// //   }
  
// //   /**
// //    * Get single product by slug
// //    * Route: GET /public/:organizationSlug/products/:productSlug
// //    */
// //   async getProductBySlug(req, res, next) {
// //     try {
// //       const { organizationSlug, productSlug } = req.params;
      
// //       // Find organization
// //       const organization = await Organization.findOne({
// //         uniqueShopId: organizationSlug.toUpperCase(),
// //         isActive: true
// //       }).select('_id name');
      
// //       if (!organization) {
// //         return next(new AppError('Store not found', 404));
// //       }
      
// //       // Find product
// //       const product = await Product.findOne({
// //         organizationId: organization._id,
// //         slug: productSlug,
// //         isActive: true
// //       }).lean();
      
// //       if (!product) {
// //         return next(new AppError('Product not found', 404));
// //       }
      
// //       // Transform for public view (hide private data)
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
// //           isTaxInclusive: product.isTaxInclusive
// //         },
// //         category: product.category,
// //         subCategory: product.subCategory,
// //         brand: product.brand,
// //         tags: product.tags || [],
// //         sku: product.sku,
// //         stock: {
// //           total: product.inventory?.reduce((sum, inv) => sum + (inv.quantity || 0), 0) || 0,
// //           available: product.inventory?.some(inv => inv.quantity > 0) || false,
// //           lowStock: product.inventory?.some(inv => inv.quantity <= (inv.reorderLevel || 10)) || false
// //         },
// //         organization: {
// //           id: organization._id,
// //           name: organization.name
// //         },
// //         // Related products (same category)
// //         relatedProductsUrl: `/public/${organizationSlug}/products?category=${encodeURIComponent(product.category)}&limit=4`,
// //         // Add to cart URL (to be implemented)
// //         addToCartUrl: `/api/cart/add?product=${product._id}`,
// //         // Share URLs
// //         shareUrls: {
// //           facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`/store/${organizationSlug}/products/${productSlug}`)}`,
// //           twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(`/store/${organizationSlug}/products/${productSlug}`)}&text=${encodeURIComponent(product.name)}`
// //         }
// //       };
      
// //       // Increment product views (async)
// //       this.incrementProductViews(product._id);
      
// //       res.status(200).json({
// //         product: publicProduct,
// //         breadcrumbs: [
// //           { name: 'Home', url: `/store/${organizationSlug}` },
// //           { name: 'Products', url: `/store/${organizationSlug}/products` },
// //           { name: product.category, url: `/store/${organizationSlug}/products?category=${encodeURIComponent(product.category)}` },
// //           { name: product.name, url: `/store/${organizationSlug}/products/${productSlug}` }
// //         ]
// //       });
      
// //     } catch (error) {
// //       next(error);
// //     }
// //   }
  
// //   /**
// //    * Get product categories
// //    * Route: GET /public/:organizationSlug/categories
// //    */
// //   async getCategories(req, res, next) {
// //     try {
// //       const { organizationSlug } = req.params;
      
// //       const organization = await Organization.findOne({
// //         uniqueShopId: organizationSlug.toUpperCase()
// //       }).select('_id');
      
// //       if (!organization) {
// //         return next(new AppError('Store not found', 404));
// //       }
      
// //       const categories = await Product.aggregate([
// //         {
// //           $match: {
// //             organizationId: organization._id,
// //             isActive: true,
// //             category: { $exists: true, $ne: '' }
// //           }
// //         },
// //         {
// //           $group: {
// //             _id: '$category',
// //             count: { $sum: 1 },
// //             subCategories: { $addToSet: '$subCategory' }
// //           }
// //         },
// //         {
// //           $project: {
// //             name: '$_id',
// //             _id: 0,
// //             count: 1,
// //             subCategories: {
// //               $filter: {
// //                 input: '$subCategories',
// //                 as: 'sub',
// //                 cond: { $and: [{ $ne: ['$$sub', null] }, { $ne: ['$$sub', ''] }] }
// //               }
// //             }
// //           }
// //         },
// //         { $sort: { count: -1 } }
// //       ]);
      
// //       res.status(200).json({
// //         organizationSlug,
// //         categories,
// //         totalCategories: categories.length
// //       });
      
// //     } catch (error) {
// //       next(error);
// //     }
// //   }

// //   // ==========================================
// //   // ADDED: Missing getTags Method
// //   // ==========================================
// //   /**
// //    * Get all unique product tags for the organization
// //    * Route: GET /public/:organizationSlug/tags
// //    */
// //   async getTags(req, res, next) {
// //     try {
// //       const { organizationSlug } = req.params;
  
// //       // 1. Verify Organization Exists
// //       const organization = await Organization.findOne({
// //         uniqueShopId: organizationSlug.toUpperCase(),
// //         isActive: true
// //       }).select('_id');
  
// //       if (!organization) {
// //         return next(new AppError('Store not found', 404));
// //       }
  
// //       // 2. Aggregate Tags from Products
// //       // We unwind the tags array, group by tag to count occurrences, and sort by popularity
// //       const tags = await Product.aggregate([
// //         {
// //           $match: {
// //             organizationId: organization._id,
// //             isActive: true,
// //             tags: { $exists: true, $ne: [] }
// //           }
// //         },
// //         { $unwind: '$tags' },
// //         {
// //           $group: {
// //             _id: '$tags',
// //             count: { $sum: 1 }
// //           }
// //         },
// //         { $sort: { count: -1 } }, // Most popular tags first
// //         { $limit: 50 }, // Limit to top 50 tags to keep response light
// //         {
// //           $project: {
// //             _id: 0,
// //             name: '$_id', // Return as a simple string array usually, but Angular service expects string[]
// //           }
// //         }
// //       ]);
  
// //       // Transform to simple string array to match typical frontend expectations
// //       const tagList = tags.map(t => t.name);
  
// //       res.status(200).json({
// //         status: 'success',
// //         count: tagList.length,
// //         tags: tagList
// //       });
  
// //     } catch (error) {
// //       next(error);
// //     }
// //   }
  
// //   /**
// //    * Search products
// //    * Route: GET /public/:organizationSlug/search
// //    */
// //   async searchProducts(req, res, next) {
// //     try {
// //       const { organizationSlug } = req.params;
// //       const { q, limit = 10 } = req.query;
      
// //       if (!q || q.length < 2) {
// //         return res.status(200).json({ results: [], suggestions: [] });
// //       }
      
// //       const organization = await Organization.findOne({
// //         uniqueShopId: organizationSlug.toUpperCase()
// //       }).select('_id');
      
// //       if (!organization) {
// //         return next(new AppError('Store not found', 404));
// //       }
      
// //       const results = await Product.find({
// //         organizationId: organization._id,
// //         isActive: true,
// //         $or: [
// //           { name: { $regex: q, $options: 'i' } },
// //           { description: { $regex: q, $options: 'i' } },
// //           { sku: { $regex: q, $options: 'i' } },
// //           { tags: { $regex: q, $options: 'i' } }
// //         ]
// //       })
// //       .select('name slug images sellingPrice category')
// //       .limit(Number(limit))
// //       .lean();
      
// //       // Get search suggestions (categories, tags)
// //       const suggestions = await Product.aggregate([
// //         {
// //           $match: {
// //             organizationId: organization._id,
// //             isActive: true,
// //             $or: [
// //               { name: { $regex: q, $options: 'i' } },
// //               { category: { $regex: q, $options: 'i' } },
// //               { tags: { $regex: q, $options: 'i' } }
// //             ]
// //           }
// //         },
// //         {
// //           $project: {
// //             suggestions: {
// //               $concatArrays: [
// //                 ['$name'],
// //                 ['$category'],
// //                 { $ifNull: ['$tags', []] }
// //               ]
// //             }
// //           }
// //         },
// //         { $unwind: '$suggestions' },
// //         { $match: { suggestions: { $regex: q, $options: 'i' } } },
// //         { $group: { _id: '$suggestions' } },
// //         { $limit: 5 }
// //       ]);
      
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
// //         })),
// //         suggestions: suggestions.map(s => s._id),
// //         totalResults: results.length
// //       });
      
// //     } catch (error) {
// //       next(error);
// //     }
// //   }
  
// //   /**
// //    * Increment product views (async)
// //    */
// //   async incrementProductViews(productId) {
// //     try {
// //       // You could add view tracking logic here
// //       // For example, increment a viewCount field on Product model
// //       await Product.findByIdAndUpdate(productId, {
// //         $inc: { views: 1 }
// //       });
// //     } catch (error) {
// //       console.error('Error incrementing product views:', error);
// //     }
// //   }
// // }

// // module.exports = new ProductPublicController();