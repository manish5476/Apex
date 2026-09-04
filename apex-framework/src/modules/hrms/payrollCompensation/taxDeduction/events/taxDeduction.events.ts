const eventBus = require('../../../../../core/eventBus');

const TAX_DEDUCTION_EVENTS = {
  CREATED: 'taxDeduction.created',
  UPDATED: 'taxDeduction.updated',
  DELETED: 'taxDeduction.deleted',
};

function publishTaxDeductionCreated(entity) {
  eventBus.publish(TAX_DEDUCTION_EVENTS.CREATED, { id: entity._id });
}

function publishTaxDeductionUpdated(entity) {
  eventBus.publish(TAX_DEDUCTION_EVENTS.UPDATED, { id: entity._id });
}

function publishTaxDeductionDeleted(id) {
  eventBus.publish(TAX_DEDUCTION_EVENTS.DELETED, { id });
}

module.exports = {
  TAX_DEDUCTION_EVENTS,
  publishTaxDeductionCreated,
  publishTaxDeductionUpdated,
  publishTaxDeductionDeleted,
};
