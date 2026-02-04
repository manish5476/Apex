const express = require('express');
const router = express.Router();
const storefrontPublicController = require('../../controllers/storefront/storefrontPublic.controller');
const productPublicController = require('../../controllers/storefront/productPublic.controller');
const rateLimit = require('../../middleware/validation/publicRateLimit.middleware');

router.use(rateLimit);

// 1. Info Routes
router.get('/:organizationSlug', storefrontPublicController.getOrganizationInfo);
router.get('/:organizationSlug/sitemap', storefrontPublicController.getSitemap);

// 2. Product Routes (SPECIFIC FIRST)
router.get('/:organizationSlug/products', productPublicController.getProducts);
router.get('/:organizationSlug/products/:productSlug', productPublicController.getProductBySlug);
router.get('/:organizationSlug/categories', productPublicController.getCategories);
router.get('/:organizationSlug/tags', productPublicController.getTags);
router.get('/:organizationSlug/search', productPublicController.searchProducts);

// 3. Page Route (WILDCARD LAST)
// Catches /shivam/home, /shivam/about, but NOT /shivam/products
router.get('/:organizationSlug/:pageSlug', storefrontPublicController.getPublicPage);

module.exports = router;

// const express = require('express');
// const router = express.Router();
// const storefrontPublicController = require('../../controllers/storefront/storefrontPublic.controller');
// const productPublicController = require('../../controllers/storefront/productPublic.controller');
// const rateLimit = require('../../middleware/validation/publicRateLimit.middleware');

// router.use(rateLimit);

// // 1. ORGANIZATION INFO
// router.get('/:organizationSlug', storefrontPublicController.getOrganizationInfo);
// router.get('/:organizationSlug/sitemap', storefrontPublicController.getSitemap);

// // 2. PRODUCT ROUTES (Must come BEFORE the generic page route)
// router.get('/:organizationSlug/products', productPublicController.getProducts);
// router.get('/:organizationSlug/products/:productSlug', productPublicController.getProductBySlug);
// router.get('/:organizationSlug/categories', productPublicController.getCategories);
// router.get('/:organizationSlug/tags', productPublicController.getTags);
// router.get('/:organizationSlug/search', productPublicController.searchProducts);

// // 3. GENERIC PAGE ROUTE (Catch-all for /home, /about, etc.)
// // ⚠️ This must be the LAST route in this file
// router.get('/:organizationSlug/:pageSlug', storefrontPublicController.getPublicPage);

// module.exports = router;

// // const express = require('express');
// // const router = express.Router();
// // const storefrontPublicController = require('../../controllers/storefront/storefrontPublic.controller');
// // const productPublicController = require('../../controllers/storefront/productPublic.controller');
// // const rateLimit = require('../../middleware/validation/publicRateLimit.middleware');

// // router.use(rateLimit);

// // // Public storefront routes
// // router.get('/:organizationSlug', storefrontPublicController.getOrganizationInfo);
// // router.get('/:organizationSlug/sitemap', storefrontPublicController.getSitemap);
// // router.get('/:organizationSlug/:pageSlug', storefrontPublicController.getPublicPage);

// // // Public product routes
// // router.get('/:organizationSlug/products', productPublicController.getProducts);
// // router.get('/:organizationSlug/products/:productSlug', productPublicController.getProductBySlug);
// // router.get('/:organizationSlug/categories', productPublicController.getCategories);

// // // ADDED: Missing tags route
// // router.get('/:organizationSlug/tags', productPublicController.getTags);

// // router.get('/:organizationSlug/search', productPublicController.searchProducts);

// // module.exports = router;
