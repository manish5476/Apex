const eventBus = require('../../../../core/eventBus');

const STOREFRONT_COUPON_EVENTS = {
  CREATED: 'storefrontCoupon.created',
  UPDATED: 'storefrontCoupon.updated',
  DELETED: 'storefrontCoupon.deleted',
};

function publishStorefrontCouponCreated(entity) {
  eventBus.publish(STOREFRONT_COUPON_EVENTS.CREATED, { id: entity._id });
}

function publishStorefrontCouponUpdated(entity) {
  eventBus.publish(STOREFRONT_COUPON_EVENTS.UPDATED, { id: entity._id });
}

function publishStorefrontCouponDeleted(id) {
  eventBus.publish(STOREFRONT_COUPON_EVENTS.DELETED, { id });
}

module.exports = {
  STOREFRONT_COUPON_EVENTS,
  publishStorefrontCouponCreated,
  publishStorefrontCouponUpdated,
  publishStorefrontCouponDeleted,
};
