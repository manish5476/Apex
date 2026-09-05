'use strict';

const mongoose = require('mongoose');
const ExpenseClaim = require('../models/expenseClaim.model');
const Employee = require('../../core-hr/models/employee.model');
const ApiFeatures = require('../../../../core/utils/api/ApiFeatures');
const AppError = require('../../../../core/utils/api/appError');

class ExpenseClaimService {
  async getList(orgId, queryString, currentUser) {
    const filter = { organizationId: orgId };

    // If querying personal claims only
    if (queryString.myOnly === 'true' || queryString.myOnly === true) {
      filter.user = currentUser._id;
    } else if (queryString.user) {
      filter.user = queryString.user;
    }

    if (queryString.status) filter.status = queryString.status;
    if (queryString.employeeId) filter.employeeId = queryString.employeeId;

    const features = new ApiFeatures(ExpenseClaim.find(filter), queryString)
      .filter()
      .search(['title', 'claimNumber'])
      .sort()
      .limitFields()
      .paginate()
      .populate([
        { path: 'user', select: 'name email avatar' },
        { path: 'employeeId', select: 'employeeId firstName lastName displayName departmentId designationId', populate: [{ path: 'departmentId', select: 'name' }] },
        { path: 'approvedBy', select: 'name email' },
      ]);

    return await features.execute();
  }

  async getById(orgId, id) {
    const claim = await ExpenseClaim.findOne({ _id: id, organizationId: orgId })
      .populate('user', 'name email avatar phone')
      .populate('employeeId', 'employeeId firstName lastName displayName departmentId designationId')
      .populate('approvedBy', 'name email')
      .populate('approvalFlow.approver', 'name email');

    if (!claim) throw new AppError('Expense claim not found', 404);
    return claim;
  }

  async create(orgId, payload, currentUser) {
    const emp = await Employee.findOne({ user: currentUser._id, organizationId: orgId }).select('_id branchId');

    const claimNumber = `EXP-${Date.now().toString(36).toUpperCase()}`;

    const claim = await ExpenseClaim.create({
      ...payload,
      organizationId: orgId,
      branchId: emp?.branchId || currentUser.branchId,
      user: currentUser._id,
      employeeId: emp?._id || payload.employeeId,
      claimNumber,
      status: payload.status === 'submitted' ? 'submitted' : 'draft',
      submittedAt: payload.status === 'submitted' ? new Date() : undefined,
      createdBy: currentUser._id,
      updatedBy: currentUser._id,
    });

    return this.getById(orgId, claim._id);
  }

  async update(orgId, id, payload, currentUser) {
    const claim = await ExpenseClaim.findOne({ _id: id, organizationId: orgId });
    if (!claim) throw new AppError('Expense claim not found', 404);

    if (['approved', 'reimbursed'].includes(claim.status)) {
      throw new AppError(`Cannot update an expense claim that is already ${claim.status}`, 400);
    }

    if (payload.status === 'submitted' && claim.status === 'draft') {
      payload.submittedAt = new Date();
    }

    const updated = await ExpenseClaim.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      { ...payload, updatedBy: currentUser._id },
      { new: true, runValidators: true }
    ).populate('user', 'name email');

    return updated;
  }

  async approve(orgId, id, { approvedAmount, comments }, approverUser) {
    const claim = await ExpenseClaim.findOne({ _id: id, organizationId: orgId });
    if (!claim) throw new AppError('Expense claim not found', 404);

    if (claim.status === 'approved' || claim.status === 'reimbursed') {
      throw new AppError('Expense claim is already approved', 400);
    }

    const finalAmount = approvedAmount !== undefined ? Number(approvedAmount) : claim.totalAmount;
    if (finalAmount > claim.totalAmount) {
      throw new AppError('Approved amount cannot exceed claim total', 400);
    }

    claim.status = finalAmount < claim.totalAmount ? 'partially_approved' : 'approved';
    claim.approvedAmount = finalAmount;
    claim.approvedBy = approverUser._id;
    claim.approvedAt = new Date();
    claim.approvalFlow.push({
      approver: approverUser._id,
      status: 'approved',
      comments: comments || 'Approved',
      actionAt: new Date(),
    });

    await claim.save();
    return this.getById(orgId, claim._id);
  }

  async reject(orgId, id, { comments }, approverUser) {
    const claim = await ExpenseClaim.findOne({ _id: id, organizationId: orgId });
    if (!claim) throw new AppError('Expense claim not found', 404);

    claim.status = 'rejected';
    claim.approvedBy = approverUser._id;
    claim.approvedAt = new Date();
    claim.approvalFlow.push({
      approver: approverUser._id,
      status: 'rejected',
      comments: comments || 'Rejected',
      actionAt: new Date(),
    });

    await claim.save();
    return this.getById(orgId, claim._id);
  }

  async delete(orgId, id, currentUser) {
    const claim = await ExpenseClaim.findOne({ _id: id, organizationId: orgId });
    if (!claim) throw new AppError('Expense claim not found', 404);

    if (claim.status !== 'draft' && claim.status !== 'rejected') {
      throw new AppError('Only draft or rejected claims can be deleted', 400);
    }

    await ExpenseClaim.findByIdAndDelete(id);
    return true;
  }
}

module.exports = new ExpenseClaimService();