
'use strict';

const express = require('express');
const router = express.Router();

// ─── Core Utils & Middleware ──────────────────────────────────────────────────
const dropdownFactory = require('../../../../core/utils/api/dropdownFactory');
const { protect } = require('../../../auth/core/auth.controller');

// ─── Organization & Auth Models ───────────────────────────────────────────────
const Branch = require('../../../organization/core/branch.model');
const Role = require('../../../auth/core/role.model');
const Customer = require('../../../organization/core/customer.model');
const Supplier = require('../../../organization/core/supplier.model');
const User = require('../../../auth/core/user.model');
const Master = require('../model/master.model');
const Channel = require('../../../organization/core/channel.model');
const TransferRequest = require('../../../organization/core/transferrequest.model');

// ─── Inventory Models ─────────────────────────────────────────────────────────
const Product = require('../../../inventory/core/model/product.model');
const Purchase = require('../../../inventory/core/model/purchase.model');
const Sales = require('../../../inventory/core/model/sales.model');
const SalesReturn = require('../../../inventory/core/model/salesReturn.model');
const PurchaseReturn = require('../../../inventory/core/model/purchase.return.model');

// ─── Accounting Models ────────────────────────────────────────────────────────
const Account = require('../../../accounting/core/model/account.model');
const Invoice = require('../../../accounting/billing/invoice.model');
const Payment = require('../../../accounting/payments/payment.model');
const EMI = require('../../../accounting/payments/emi.model');

// ─── HRMS Models ──────────────────────────────────────────────────────────────
const Department = require('../../../HRMS/models/department.model');
const Designation = require('../../../HRMS/models/designation.model');
const Shift = require('../../../HRMS/models/shift.model');
const ShiftAssignment = require('../../../HRMS/models/shiftAssignment.model');
const Holiday = require('../../../HRMS/models/holiday.model');
const GeoFencing = require('../../../HRMS/models/geoFencing.model');
const AttendanceMachine = require('../../../HRMS/models/attendanceMachine.model');
const AttendanceRequest = require('../../../HRMS/models/attendanceRequest.model');
const LeaveRequest = require('../../../HRMS/models/leaveRequest.model');

// ─── Notes & CRM ─────────────────────────────────────────────────────────────
const Meeting = require('../../../Notes/meeting.model');

// ─── Auth guard on all dropdown routes ───────────────────────────────────────
router.use(protect);

/* ============================================================================
   ORGANIZATION & AUTH
============================================================================ */

router.get('/users', dropdownFactory.getDropdownList(User, {
  defaultSearchField: 'name',
  defaultLabelField: ['name', 'email'],
  metaFields: ['phone', 'role'],
  populate: { path: 'role', select: 'name' },
}));

router.get('/branches', dropdownFactory.getDropdownList(Branch, {
  defaultSearchField: 'name',
  labelTemplate: '{{name}} [{{branchCode}}]',
  metaFields: ['isMainBranch'],
}));

router.get('/roles', dropdownFactory.getDropdownList(Role, {
  defaultSearchField: 'name',
  defaultLabelField: 'name',
  metaFields: ['description', 'isSuperAdmin'],
  allowStatusFilter: true,
}));

router.get('/customers', dropdownFactory.getDropdownList(Customer, {
  defaultSearchField: 'name',
  defaultLabelField: ['name', 'phone'],
  metaFields: ['outstandingBalance', 'type', 'email'],
  allowedFilters: ['type'],
}));

router.get('/suppliers', dropdownFactory.getDropdownList(Supplier, {
  defaultSearchField: 'companyName',
  defaultLabelField: ['companyName', 'contactPerson'],
  metaFields: ['phone', 'outstandingBalance', 'paymentTerms'],
}));

router.get('/masters', dropdownFactory.getDropdownList(Master, {
  defaultSearchField: 'name',
  labelTemplate: '{{name}} [{{code}}]',
  metaFields: ['type', 'description'],
  allowedFilters: ['type', 'parentId'],
}));

router.get('/channels', dropdownFactory.getDropdownList(Channel, {
  defaultSearchField: 'name',
  defaultLabelField: 'name',
  metaFields: ['description'],
}));

router.get('/transfer-requests', dropdownFactory.getDropdownList(TransferRequest, {
  defaultSearchField: 'transferNumber',
  labelTemplate: '{{transferNumber}} — {{status}}',
  metaFields: ['status', 'createdAt'],
}));

/* ============================================================================
   INVENTORY
============================================================================ */

router.get('/products', dropdownFactory.getDropdownList(Product, {
  defaultSearchField: 'name',
  labelTemplate: '{{name}} ({{sku}})',
  metaFields: ['sellingPrice', 'purchasePrice', 'totalStock', 'category', 'brand', 'sku', 'unit', 'taxRate'],
}));

router.get('/purchases', dropdownFactory.getDropdownList(Purchase, {
  defaultSearchField: 'invoiceNumber',
  defaultLabelField: 'invoiceNumber',
  metaFields: ['grandTotal', 'paymentStatus', 'purchaseDate'],
  populate: { path: 'supplierId', select: 'companyName' },
}));

router.get('/sales', dropdownFactory.getDropdownList(Sales, {
  defaultSearchField: 'invoiceNumber',
  defaultLabelField: 'invoiceNumber',
  metaFields: ['grandTotal', 'paymentStatus', 'saleDate'],
  populate: { path: 'customerId', select: 'name' },
}));

router.get('/sales-returns', dropdownFactory.getDropdownList(SalesReturn, {
  defaultSearchField: 'returnNumber',
  defaultLabelField: 'returnNumber',
  metaFields: ['totalRefundAmount', 'status'],
  populate: { path: 'originalInvoiceId', select: 'invoiceNumber' },
}));

router.get('/purchase-returns', dropdownFactory.getDropdownList(PurchaseReturn, {
  defaultSearchField: 'returnNumber',
  defaultLabelField: 'returnNumber',
  metaFields: ['totalRefundAmount', 'status'],
  populate: { path: 'originalPurchaseId', select: 'invoiceNumber' },
}));

// ─── Master Type Based Routes ────────────────────────────────────────────────
router.get('/master-departments', dropdownFactory.getDropdownList(Master, {
  defaultSearchField: 'name',
  defaultLabelField: 'name',
  extraFilter: { type: 'department' },
  metaFields: ['description', 'code'],
}));

router.get('/brands', dropdownFactory.getDropdownList(Master, {
  defaultSearchField: 'name',
  defaultLabelField: 'name',
  extraFilter: { type: 'brand' },
  metaFields: ['description', 'code'],
}));

router.get('/categories', dropdownFactory.getDropdownList(Master, {
  defaultSearchField: 'name',
  defaultLabelField: 'name',
  extraFilter: { type: 'category' },
  metaFields: ['description', 'code'],
  allowedFilters: ['parentId'],
}));

router.get('/subcategories', dropdownFactory.getDropdownList(Master, {
  defaultSearchField: 'name',
  defaultLabelField: 'name',
  extraFilter: { type: 'sub_category' },
  metaFields: ['description', 'code'],
  allowedFilters: ['parentId'],
}));

router.get('/sub-categories', dropdownFactory.getDropdownList(Master, {
  defaultSearchField: 'name',
  defaultLabelField: 'name',
  extraFilter: { type: 'sub_category' },
  metaFields: ['description', 'code'],
  allowedFilters: ['parentId'],
}));

router.get('/units', dropdownFactory.getDropdownList(Master, {
  defaultSearchField: 'name',
  labelTemplate: '{{name}} [{{code}}]',
  extraFilter: { type: 'unit' },
  metaFields: ['description', 'code'],
}));

router.get('/tax-rates', dropdownFactory.getDropdownList(Master, {
  defaultSearchField: 'name',
  labelTemplate: '{{name}} [{{code}}]',
  extraFilter: { type: 'tax_rate' },
  metaFields: ['description', 'code'],
}));

router.get('/warranty-plans', dropdownFactory.getDropdownList(Master, {
  defaultSearchField: 'name',
  defaultLabelField: 'name',
  extraFilter: { type: 'warranty_plan' },
  metaFields: ['description', 'code'],
}));

router.get('/product-conditions', dropdownFactory.getDropdownList(Master, {
  defaultSearchField: 'name',
  defaultLabelField: 'name',
  extraFilter: { type: 'product_condition' },
  metaFields: ['description', 'code'],
}));

router.get('/tags', dropdownFactory.getDropdownList(Master, {
  defaultSearchField: 'name',
  defaultLabelField: 'name',
  extraFilter: { type: 'tag' },
  metaFields: ['description', 'code'],
}));

router.get('/supplier-categories', dropdownFactory.getDropdownList(Master, {
  defaultSearchField: 'name',
  defaultLabelField: 'name',
  extraFilter: { type: 'supplier_category' },
  metaFields: ['description', 'code'],
}));

/* ============================================================================
   ACCOUNTING
============================================================================ */

router.get('/accounts', dropdownFactory.getDropdownList(Account, {
  defaultSearchField: 'name',
  labelTemplate: '{{code}} — {{name}}',
  metaFields: ['type', 'cachedBalance'],
  allowStatusFilter: true,
  allowedFilters: ['type'],
}));

router.get('/invoices', dropdownFactory.getDropdownList(Invoice, {
  defaultSearchField: 'invoiceNumber',
  labelTemplate: '{{invoiceNumber}} ({{paymentStatus}})',
  metaFields: ['grandTotal', 'dueDate', 'invoiceDate'],
  populate: { path: 'customerId', select: 'name phone' },
}));

router.get('/payments', dropdownFactory.getDropdownList(Payment, {
  defaultSearchField: 'referenceNumber',
  labelTemplate: '{{referenceNumber}} — ₹{{amount}}',
  metaFields: ['amount', 'type', 'paymentMethod', 'paymentDate'],
  populate: [
    { path: 'customerId', select: 'name' },
    { path: 'supplierId', select: 'companyName' },
  ],
  allowedFilters: ['type'],
}));

router.get('/emis', dropdownFactory.getDropdownList(EMI, {
  defaultSearchField: 'loanNumber',
  defaultLabelField: 'loanNumber',
  metaFields: ['totalAmount', 'balanceAmount', 'status', 'numberOfInstallments'],
  populate: [
    { path: 'customerId', select: 'name phone' },
    { path: 'invoiceId', select: 'invoiceNumber' },
  ],
}));

/* ============================================================================
   HRMS
============================================================================ */

router.get('/departments', dropdownFactory.getDropdownList(Department, {
  defaultSearchField: 'name',
  defaultLabelField: 'name',
  metaFields: ['description'],
  populate: { path: 'parentDepartment', select: 'name' },
}));

router.get('/designations', dropdownFactory.getDropdownList(Designation, {
  defaultSearchField: 'title',
  defaultLabelField: 'title',
  metaFields: ['level'],
}));

router.get('/shifts', dropdownFactory.getDropdownList(Shift, {
  defaultSearchField: 'name',
  labelTemplate: '{{name}} ({{startTime}}–{{endTime}})',
  metaFields: ['startTime', 'endTime', 'workingDays'],
}));

router.get('/shift-assignments', dropdownFactory.getDropdownList(ShiftAssignment, {
  defaultSearchField: 'user',
  labelTemplate: '{{user.name}} - {{shiftId.name}}',
  metaFields: ['startDate', 'endDate', 'status'],
  populate: [
    { path: 'user', select: 'name' },
    { path: 'shiftId', select: 'name' },
  ],
}));

router.get('/holidays', dropdownFactory.getDropdownList(Holiday, {
  defaultSearchField: 'name',
  labelTemplate: '{{name}} ({{date}})',
  metaFields: ['date', 'type'],
  allowedFilters: ['type'],
}));

router.get('/geofencing', dropdownFactory.getDropdownList(GeoFencing, {
  defaultSearchField: 'name',
  labelTemplate: '{{name}} ({{radius}}m)',
  metaFields: ['radius', 'latitude', 'longitude'],
}));

router.get('/attendance-machines', dropdownFactory.getDropdownList(AttendanceMachine, {
  defaultSearchField: 'name',
  defaultLabelField: 'name',
  metaFields: ['ipAddress', 'status', 'connectionStatus'],
}));

router.get('/attendance-requests', dropdownFactory.getDropdownList(AttendanceRequest, {
  defaultSearchField: 'type',
  labelTemplate: '{{user.name}} - {{type}}',
  metaFields: ['targetDate', 'status', 'appliedAt'],
  populate: { path: 'user', select: 'name' },
  allowedFilters: ['type', 'status'],
}));

router.get('/leave-requests', dropdownFactory.getDropdownList(LeaveRequest, {
  defaultSearchField: 'leaveType',
  labelTemplate: '{{user.name}} - {{leaveType}}',
  metaFields: ['startDate', 'endDate', 'status', 'daysCount'],
  populate: { path: 'user', select: 'name' },
  allowedFilters: ['leaveType', 'status'],
}));

/* ============================================================================
   NOTES & CRM
============================================================================ */

router.get('/meetings', dropdownFactory.getDropdownList(Meeting, {
  defaultSearchField: 'title',
  labelTemplate: '{{title}} ({{startTime}})',
  metaFields: ['startTime', 'endTime', 'status', 'locationType'],
  populate: { path: 'organizer', select: 'name' },
}));

module.exports = router;
