const router = require('./api/routes/globalDeliveryPartner.routes');
const globalDeliveryPartnerService = require('./application/services/globalDeliveryPartner.service');
const { GLOBAL_DELIVERY_PARTNER_EVENTS } = require('./events/globalDeliveryPartner.events');

module.exports = {
  router,
  service: globalDeliveryPartnerService,
  events: GLOBAL_DELIVERY_PARTNER_EVENTS,
};
