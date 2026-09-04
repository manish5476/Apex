const eventBus = require('../../../../../core/eventBus');

const SALARY_STRUCTURE_EVENTS = {
  CREATED: 'salaryStructure.created',
  UPDATED: 'salaryStructure.updated',
  DELETED: 'salaryStructure.deleted',
};

function publishSalaryStructureCreated(entity) {
  eventBus.publish(SALARY_STRUCTURE_EVENTS.CREATED, { id: entity._id });
}

function publishSalaryStructureUpdated(entity) {
  eventBus.publish(SALARY_STRUCTURE_EVENTS.UPDATED, { id: entity._id });
}

function publishSalaryStructureDeleted(id) {
  eventBus.publish(SALARY_STRUCTURE_EVENTS.DELETED, { id });
}

module.exports = {
  SALARY_STRUCTURE_EVENTS,
  publishSalaryStructureCreated,
  publishSalaryStructureUpdated,
  publishSalaryStructureDeleted,
};
