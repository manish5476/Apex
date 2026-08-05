const eventBus = require('../../../../../core/eventBus');

const PAYSLIP_EVENTS = {
  CREATED: 'payslip.created',
  UPDATED: 'payslip.updated',
  DELETED: 'payslip.deleted',
};

function publishPayslipCreated(entity) {
  eventBus.publish(PAYSLIP_EVENTS.CREATED, { id: entity._id });
}

function publishPayslipUpdated(entity) {
  eventBus.publish(PAYSLIP_EVENTS.UPDATED, { id: entity._id });
}

function publishPayslipDeleted(id) {
  eventBus.publish(PAYSLIP_EVENTS.DELETED, { id });
}

module.exports = {
  PAYSLIP_EVENTS,
  publishPayslipCreated,
  publishPayslipUpdated,
  publishPayslipDeleted,
};
