const Holiday = require('../models/holiday.model');
const mongoose = require('mongoose');
const ApiFeatures = require('../../../../core/utils/api.utils');

class HolidayRepository {

  async getList(orgId, queryString) {
    const features = new ApiFeatures(Holiday.find({ organizationId: orgId }), queryString)
      .filter()
      .search(['name', 'description', 'holidayType'])
      .sort({ date: 1 })
      .paginate()
      .populate([{ path: 'branchId', select: 'name' }, { path: 'createdBy', select: 'name' }]);
    return await features.execute();
  }

  async getById(orgId, id, session = null) {
    return Holiday.findOne({ _id: id, organizationId: orgId }).session(session).populate([
      { path: 'branchId', select: 'name address' },
      { path: 'applicableTo.departments', select: 'name' },
      { path: 'createdBy', select: 'name' }
    ]);
  }

  async findExistingDate(orgId, dayStart, dayEnd, branchId, excludeId = null, session = null) {
    const query = {
      organizationId: orgId,
      date: { $gte: dayStart, $lte: dayEnd },
      $or: [{ branchId: branchId || null }, { branchId: null }]
    };
    if (excludeId) query._id = { $ne: excludeId };
    return Holiday.findOne(query).session(session);
  }

  async getByYear(orgId, year, branchId) {
    const query = { organizationId: orgId, year };
    if (branchId) {
      query.$or = [{ branchId: new mongoose.Types.ObjectId(branchId) }, { branchId: null }];
    }
    return Holiday.find(query).populate('branchId', 'name').sort('date');
  }

  async getUpcoming(orgId, branchId, limit) {
    return Holiday.find({
      organizationId: orgId,
      $or: [{ branchId }, { branchId: null }],
      date: { $gte: new Date() },
      isActive: true
    }).populate('branchId', 'name').sort('date').limit(limit);
  }

  async create(orgId, payloads, session = null) {
    const docs = payloads.map(p => ({ ...p, organizationId: orgId }));
    return Holiday.create(docs, { session });
  }

  async updateById(orgId, id, payload, session = null) {
    return Holiday.findByIdAndUpdate(id, { $set: payload }, { new: true, runValidators: true, session });
  }

  async deleteById(orgId, id, session = null) {
    return Holiday.findOneAndDelete({ _id: id, organizationId: orgId }).session(session);
  }

  async getStatsAggregation(orgId, year) {
    return Holiday.aggregate([
      { $match: { organizationId: orgId, year } },
      {
        $facet: {
          byType: [{ $group: { _id: '$holidayType', count: { $sum: 1 }, optional: { $sum: { $cond: ['$isOptional', 1, 0] } } } }],
          byMonth: [{ $group: { _id: { $month: '$date' }, count: { $sum: 1 }, names: { $push: '$name' } } }, { $sort: { '_id': 1 } }],
          byBranch: [
            { $group: { _id: '$branchId', count: { $sum: 1 } } },
            { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } },
            { $addFields: { branchName: { $arrayElemAt: ['$branch.name', 0] } } },
            { $project: { branch: 0 } },
          ],
          summary: [
            { $group: { _id: null, total: { $sum: 1 }, national: { $sum: { $cond: [{ $eq: ['$holidayType', 'national'] }, 1, 0] } }, optional: { $sum: { $cond: ['$isOptional', 1, 0] } }, recurring: { $sum: { $cond: ['$recurring.isRecurring', 1, 0] } } } },
          ]
        }
      }
    ]);
  }
}

module.exports = new HolidayRepository();