const express = require('express');
const router = express.Router();
const storefrontPublicController = require('../../controllers/storefront/storefrontPublic.controller');
const productPublicController = require('../../controllers/storefront/productPublic.controller');
const rateLimit = require('../../middleware/validation/publicRateLimit.middleware');
router.use(rateLimit);
// 1. Info Routes
router.get('/:organizationSlug', storefrontPublicController.getOrganizationInfo);
router.get('/:organizationSlug/sitemap', storefrontPublicController.getSitemap);
router.get('/:organizationSlug/meta', productPublicController.getStoreMetadata);
// 2. Product Routes (SPECIFIC FIRST)
router.get('/:organizationSlug/products', productPublicController.getProducts);
router.get('/:organizationSlug/products/:productSlug', productPublicController.getProductBySlug);
router.get('/:organizationSlug/categories', productPublicController.getCategories);
router.get('/:organizationSlug/tags', productPublicController.getTags);
router.get('/:organizationSlug/search', productPublicController.searchProducts);
router.get('/:organizationSlug/:pageSlug', storefrontPublicController.getPublicPage);
router.get('/', (req, res) => res.status(200).json({ message: 'Storefront API Public' }));
module.exports = router;
