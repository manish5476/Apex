'use strict';

const Department = require("../models/department.model");
const Designation = require("../models/designation.model");
const catchAsync = require("../../../core/utils/catchAsync");
const factory = require("../../../core/utils/handlerFactory");

// ======================================================
//  DEPARTMENTS
// ======================================================

exports.createDepartment = catchAsync(async (req, res, next) => {
  req.body.organizationId = req.user.organizationId;
  const doc = await Department.create(req.body);
  res.status(201).json({ status: 'success', data: { data: doc } });
});

exports.getAllDepartments = catchAsync(async (req, res, next) => {
  req.query.organizationId = req.user.organizationId;
  return factory.getAll(Department)(req, res, next);
});

exports.updateDepartment = factory.updateOne(Department);
exports.deleteDepartment = factory.deleteOne(Department);

// ======================================================
//  DESIGNATIONS
// ======================================================

exports.createDesignation = catchAsync(async (req, res, next) => {
  req.body.organizationId = req.user.organizationId;
  const doc = await Designation.create(req.body);
  res.status(201).json({ status: 'success', data: { data: doc } });
});

exports.getAllDesignations = catchAsync(async (req, res, next) => {
  req.query.organizationId = req.user.organizationId;
  return factory.getAll(Designation)(req, res, next);
});

exports.updateDesignation = factory.updateOne(Designation);
exports.deleteDesignation = factory.deleteOne(Designation);