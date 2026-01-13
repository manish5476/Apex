const express = require('express');
const router = express.Router();
const storefrontPublicController = require('../../controllers/storefront/storefrontPublic.controller');
const productPublicController = require('../../controllers/storefront/productPublic.controller');
const rateLimit = require('../../middleware/validation/publicRateLimit.middleware');

router.use(rateLimit);

// Public storefront routes
router.get('/:organizationSlug', storefrontPublicController.getOrganizationInfo);
router.get('/:organizationSlug/sitemap', storefrontPublicController.getSitemap);
router.get('/:organizationSlug/:pageSlug', storefrontPublicController.getPublicPage);

// Public product routes
router.get('/:organizationSlug/products', productPublicController.getProducts);
router.get('/:organizationSlug/products/:productSlug', productPublicController.getProductBySlug);
router.get('/:organizationSlug/categories', productPublicController.getCategories);

// ADDED: Missing tags route
router.get('/:organizationSlug/tags', productPublicController.getTags);

router.get('/:organizationSlug/search', productPublicController.searchProducts);

module.exports = router;
