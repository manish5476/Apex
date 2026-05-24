// src/routes/storefront/public.routes.js
const express = require('express');
const router = express.Router();

const rateLimit = require('../../middleware/validation/publicRateLimit.middleware');

const storefrontPublicController = require('../../controllers/storefront/storefrontPublic.controller');
const productPublicController = require('../../controllers/storefront/productPublic.controller');
const cartController = require('../../controllers/storefront/cart.controller');
const storefrontCustomerController = require('../../controllers/storefront/storefrontCustomer.controller');

// Rate limit all public storefront traffic
router.use(rateLimit);

// ============================================================
// STORE INFO
// ============================================================
router.get('/:organizationSlug', storefrontPublicController.getOrganizationInfo);
router.get('/:organizationSlug/sitemap', storefrontPublicController.getSitemap);

// ============================================================
// PRODUCT & CATALOGUE  (specific paths before catch-all)
// ============================================================
router.get('/:organizationSlug/meta', productPublicController.getStoreMetadata);
router.get('/:organizationSlug/filters', productPublicController.getShopFilters);
router.get('/:organizationSlug/search', productPublicController.searchProducts);
router.get('/:organizationSlug/categories', productPublicController.getCategories);
router.get('/:organizationSlug/brands', productPublicController.getBrands);
router.get('/:organizationSlug/tags', productPublicController.getTags);

router.get('/:organizationSlug/products', productPublicController.getProducts);
router.get('/:organizationSlug/products/:productSlug', productPublicController.getProductBySlug);

// ============================================================
// CART
// NOTE: All cart routes must come before the /:pageSlug catch-all
// below, otherwise '/cart' gets intercepted as a page slug.
// ============================================================

// Guest + customer (CartController resolves identity from cookie / JWT)
router.get('/:organizationSlug/cart', cartController.getCart);
router.post('/:organizationSlug/cart/items', cartController.addItem);
router.patch('/:organizationSlug/cart/items/:cartItemId', cartController.updateItemQuantity);
router.delete('/:organizationSlug/cart/items/:cartItemId', cartController.removeItem);
router.delete('/:organizationSlug/cart', cartController.clearCart);
router.get('/:organizationSlug/cart/validate', cartController.validateCart);
router.post('/:organizationSlug/cart/coupons', cartController.applyCoupon);
router.post('/:organizationSlug/cart/shipping-estimate', cartController.estimateShipping);
router.post('/:organizationSlug/cart/merge', cartController.mergeCart);

// ============================================================
// STOREFRONT CUSTOMER, CHECKOUT, ORDERS
// ============================================================
router.post('/:organizationSlug/account/register', storefrontCustomerController.register);
router.post('/:organizationSlug/account/login', storefrontCustomerController.login);
router.post('/:organizationSlug/account/logout', storefrontCustomerController.logout);
router.get('/:organizationSlug/account/me', storefrontCustomerController.me);
router.post('/:organizationSlug/account/addresses', storefrontCustomerController.addAddress);
router.post('/:organizationSlug/checkout', storefrontCustomerController.checkout);
router.get('/:organizationSlug/orders/:orderNumber', storefrontCustomerController.trackOrder);

// ============================================================
// PAGE RENDERER  — catch-all, must stay last
// ============================================================
router.get('/:organizationSlug/:pageSlug', storefrontPublicController.getPublicPage);

// Root health/info
router.get('/', (req, res) =>
  res.status(200).json({ status: 'success', message: 'Storefront Public API' })
);

module.exports = router;
