const router = require('./api/routes/storefrontCoupon.routes');
const storefrontCouponService = require('./application/services/storefrontCoupon.service');
const { STOREFRONT_COUPON_EVENTS } = require('./events/storefrontCoupon.events');

module.exports = {
  router,
  service: storefrontCouponService,
  events: STOREFRONT_COUPON_EVENTS,
};
