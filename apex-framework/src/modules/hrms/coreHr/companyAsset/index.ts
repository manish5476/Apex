const router = require('./api/routes/companyAsset.routes');
const companyAssetService = require('./application/services/companyAsset.service');
const { COMPANY_ASSET_EVENTS } = require('./events/companyAsset.events');

module.exports = {
  router,
  service: companyAssetService,
  events: COMPANY_ASSET_EVENTS,
};
