const eventBus = require('../../../../../core/eventBus');

const COMPANY_ASSET_EVENTS = {
  CREATED: 'companyAsset.created',
  UPDATED: 'companyAsset.updated',
  DELETED: 'companyAsset.deleted',
};

function publishCompanyAssetCreated(entity) {
  eventBus.publish(COMPANY_ASSET_EVENTS.CREATED, { id: entity._id });
}

function publishCompanyAssetUpdated(entity) {
  eventBus.publish(COMPANY_ASSET_EVENTS.UPDATED, { id: entity._id });
}

function publishCompanyAssetDeleted(id) {
  eventBus.publish(COMPANY_ASSET_EVENTS.DELETED, { id });
}

module.exports = {
  COMPANY_ASSET_EVENTS,
  publishCompanyAssetCreated,
  publishCompanyAssetUpdated,
  publishCompanyAssetDeleted,
};
