const eventBus = require('../../../../core/eventBus');

const GLOBAL_DELIVERY_PARTNER_EVENTS = {
  CREATED: 'globalDeliveryPartner.created',
  UPDATED: 'globalDeliveryPartner.updated',
  DELETED: 'globalDeliveryPartner.deleted',
};

function publishGlobalDeliveryPartnerCreated(entity) {
  eventBus.publish(GLOBAL_DELIVERY_PARTNER_EVENTS.CREATED, { id: entity._id });
}

function publishGlobalDeliveryPartnerUpdated(entity) {
  eventBus.publish(GLOBAL_DELIVERY_PARTNER_EVENTS.UPDATED, { id: entity._id });
}

function publishGlobalDeliveryPartnerDeleted(id) {
  eventBus.publish(GLOBAL_DELIVERY_PARTNER_EVENTS.DELETED, { id });
}

module.exports = {
  GLOBAL_DELIVERY_PARTNER_EVENTS,
  publishGlobalDeliveryPartnerCreated,
  publishGlobalDeliveryPartnerUpdated,
  publishGlobalDeliveryPartnerDeleted,
};
