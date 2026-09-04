const express = require('express');
const router = express.Router();

/**
 * This is a NAMESPACE, not a module with its own model/service.
 * It only aggregates its sub-modules' routers below. Each one is a
 * fully independent module with its own model, repository, service,
 * events and cache — they do NOT import each other directly, only
 * communicate via the event bus.
 */
router.use('/platform-delivery-agent', require('./platformDeliveryAgent').router);
router.use('/section-template', require('./sectionTemplate').router);
router.use('/smart-rule', require('./smartRule').router);
router.use('/storefront-cart', require('./storefrontCart').router);
router.use('/storefront-cart-item', require('./storefrontCartItem').router);
router.use('/storefront-coupon', require('./storefrontCoupon').router);
router.use('/storefront-customer', require('./storefrontCustomer').router);
router.use('/storefront-customer-address', require('./storefrontCustomerAddress').router);
router.use('/storefront-delivery-agent', require('./storefrontDeliveryAgent').router);
router.use('/storefront-form-submission', require('./storefrontFormSubmission').router);
router.use('/storefront-layout', require('./storefrontLayout').router);
router.use('/storefront-order', require('./storefrontOrder').router);
router.use('/storefront-page', require('./storefrontPage').router);
router.use('/storefront-page-snapshot', require('./storefrontPageSnapshot').router);
router.use('/storefront-session', require('./storefrontSession').router);
router.use('/storefront-wishlist', require('./storefrontWishlist').router);

module.exports = { router };
