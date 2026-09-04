const eventBus = require('../../../../core/eventBus');

const SECTION_TEMPLATE_EVENTS = {
  CREATED: 'sectionTemplate.created',
  UPDATED: 'sectionTemplate.updated',
  DELETED: 'sectionTemplate.deleted',
};

function publishSectionTemplateCreated(entity) {
  eventBus.publish(SECTION_TEMPLATE_EVENTS.CREATED, { id: entity._id });
}

function publishSectionTemplateUpdated(entity) {
  eventBus.publish(SECTION_TEMPLATE_EVENTS.UPDATED, { id: entity._id });
}

function publishSectionTemplateDeleted(id) {
  eventBus.publish(SECTION_TEMPLATE_EVENTS.DELETED, { id });
}

module.exports = {
  SECTION_TEMPLATE_EVENTS,
  publishSectionTemplateCreated,
  publishSectionTemplateUpdated,
  publishSectionTemplateDeleted,
};
