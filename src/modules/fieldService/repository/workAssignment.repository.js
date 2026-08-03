const WorkAssignment = require('../models/workAssignment.model');
const ApiFeatures = require('../../../core/utils/api/ApiFeatures');

const POPULATE_LIST = [
  { path: 'assignedTo',    select: 'name email avatar' },
  { path: 'customerId',    select: 'name phone email' },
  { path: 'branchId',      select: 'name address' },
  { path: 'requiredSkills', select: 'name code' },
  { path: 'createdBy',     select: 'name' },
];

const POPULATE_DETAIL = [
  ...POPULATE_LIST,
  { path: 'parentAssignment', select: 'title scheduledAt status' },
  { path: 'inventoryItems.productId', select: 'name sku unit' },
];

class WorkAssignmentRepository {

  async getList(orgId, queryString) {
    // Support explicit date-range filter: ?startDate=&endDate=
    const baseFilter = { organizationId: orgId };

    if (queryString.startDate || queryString.endDate) {
      baseFilter.scheduledAt = {};
      if (queryString.startDate) baseFilter.scheduledAt.$gte = new Date(queryString.startDate);
      if (queryString.endDate)   baseFilter.scheduledAt.$lte = new Date(queryString.endDate);
    }

    if (queryString.status)   baseFilter.status   = queryString.status;
    if (queryString.priority) baseFilter.priority = queryString.priority;
    if (queryString.assignedTo) baseFilter.assignedTo = queryString.assignedTo;
    if (queryString.seriesId)   baseFilter.seriesId  = queryString.seriesId;

    const features = new ApiFeatures(WorkAssignment.find(baseFilter), queryString)
      .filter()
      .search(['title', 'description', 'location.address'])
      .sort('-scheduledAt')
      .paginate()
      .populate(POPULATE_LIST);

    return features.execute();
  }

  async getById(orgId, id) {
    return WorkAssignment
      .findOne({ _id: id, organizationId: orgId })
      .populate(POPULATE_DETAIL);
  }

  async getBySeries(orgId, seriesId) {
    return WorkAssignment
      .find({ organizationId: orgId, seriesId })
      .sort('scheduledAt')
      .populate(POPULATE_LIST);
  }

  async create(orgId, payload) {
    return WorkAssignment.create({ ...payload, organizationId: orgId });
  }

  async createMany(orgId, docs) {
    return WorkAssignment.insertMany(
      docs.map(d => ({ ...d, organizationId: orgId })),
      { ordered: false }
    );
  }

  async updateById(orgId, id, payload) {
    return WorkAssignment.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      { $set: payload },
      { new: true, runValidators: true }
    ).populate(POPULATE_DETAIL);
  }

  async updateSeries(orgId, seriesId, payload, fromDate) {
    // Update all future occurrences in a series
    const filter = { organizationId: orgId, seriesId };
    if (fromDate) filter.scheduledAt = { $gte: fromDate };
    return WorkAssignment.updateMany(filter, { $set: payload });
  }

  async deleteById(orgId, id) {
    return WorkAssignment.findOneAndDelete({ _id: id, organizationId: orgId });
  }

  async getCalendarRange(orgId, startDate, endDate, filters = {}) {
    const query = {
      organizationId: orgId,
      scheduledAt: { $gte: startDate, $lte: endDate },
      status: { $nin: ['cancelled'] },
      ...filters,
    };
    return WorkAssignment.find(query)
      .select('_id title scheduledAt estimatedDurationMins status priority assignedTo sla recurrenceRule seriesId')
      .populate([
        { path: 'assignedTo', select: 'name avatar' },
        { path: 'requiredSkills', select: 'name' },
      ])
      .sort('scheduledAt');
  }

  async getSlaAtRisk(orgId) {
    return WorkAssignment.findSlaAtRisk(orgId);
  }

  async getStats(orgId) {
    return WorkAssignment.aggregate([
      { $match: { organizationId: orgId } },
      {
        $facet: {
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          byPriority: [
            { $group: { _id: '$priority', count: { $sum: 1 } } },
          ],
          sla: [
            {
              $group: {
                _id: null,
                total:   { $sum: 1 },
                breached:{ $sum: { $cond: ['$sla.breached', 1, 0] } },
                withSla: { $sum: { $cond: [{ $ifNull: ['$sla.completionDeadline', false] }, 1, 0] } },
              },
            },
          ],
          completion: [
            {
              $group: {
                _id: null,
                avgDuration:   { $avg: '$ai.actualDuration' },
                avgRating:     { $avg: '$ai.customerRating' },
                fvrCount:      { $sum: { $cond: ['$ai.firstVisitResolution', 1, 0] } },
                totalClosed:   { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } },
              },
            },
          ],
        },
      },
    ]);
  }
}

module.exports = new WorkAssignmentRepository();
