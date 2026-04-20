
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
  populate: { path: 'departmentId', select: 'name' },
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




// 'use strict';

// const express = require('express');
// const router = express.Router();

// // ─── Core Utils & Middleware ──────────────────────────────────────────────────
// const dropdownFactory = require('../../../../core/utils/api/dropdownFactory');
// const { protect } = require('../../../auth/core/auth.controller');

// // ─── Organization & Auth Models ───────────────────────────────────────────────
// const Branch = require('../../../organization/core/branch.model');
// const Role = require('../../../auth/core/role.model');
// const Customer = require('../../../organization/core/customer.model');
// const Supplier = require('../../../organization/core/supplier.model');
// const User = require('../../../auth/core/user.model');
// const Master = require('../model/master.model');
// const Channel = require('../../../organization/core/channel.model');
// const TransferRequest = require('../../../organization/core/transferrequest.model');

// // ─── Inventory Models ─────────────────────────────────────────────────────────
// const Product = require('../../../inventory/core/model/product.model');
// const Purchase = require('../../../inventory/core/model/purchase.model');
// const Sales = require('../../../inventory/core/model/sales.model');
// const SalesReturn = require('../../../inventory/core/model/salesReturn.model');
// const PurchaseReturn = require('../../../inventory/core/model/purchase.return.model');

// // ─── Inventory Catalog Models ─────────────────────────────────────────────────
// // ✅ FIX 5: Added missing models that exist in Angular DropdownEndpoint type
// // but had no backend route — would have caused silent 404s
// const Brand = require('../../../inventory/core/model/brand.model');
// const Category = require('../../../inventory/core/model/category.model');
// const SubCategory = require('../../../inventory/core/model/subCategory.model');
// const Unit = require('../../../inventory/core/model/unit.model');
// const Tax = require('../../../inventory/core/model/tax.model');

// // ─── Accounting Models ────────────────────────────────────────────────────────
// const Account = require('../../../accounting/core/model/account.model');
// const Invoice = require('../../../accounting/billing/invoice.model');
// const Payment = require('../../../accounting/payments/payment.model');
// const EMI = require('../../../accounting/payments/emi.model');

// // ─── HRMS Models ──────────────────────────────────────────────────────────────
// const Department = require('../../../HRMS/models/department.model');
// const Designation = require('../../../HRMS/models/designation.model');
// const Shift = require('../../../HRMS/models/shift.model');
// const ShiftAssignment = require('../../../HRMS/models/shiftAssignment.model');
// const Holiday = require('../../../HRMS/models/holiday.model');
// const GeoFencing = require('../../../HRMS/models/geoFencing.model');
// const AttendanceMachine = require('../../../HRMS/models/attendanceMachine.model');
// const AttendanceRequest = require('../../../HRMS/models/attendanceRequest.model');
// const LeaveRequest = require('../../../HRMS/models/leaveRequest.model');

// // ─── Notes & CRM ─────────────────────────────────────────────────────────────
// const Meeting = require('../../../Notes/meeting.model');

// // ─── Auth guard on all dropdown routes ───────────────────────────────────────
// router.use(protect);

// /* ============================================================================
//    ORGANIZATION & AUTH
// ============================================================================ */

// router.get('/users', dropdownFactory.getDropdownList(User, {
//   defaultSearchField: 'name',
//   defaultLabelField: ['name', 'email'],
//   metaFields: ['phone', 'role'],
//   populate: { path: 'role', select: 'name' },
// }));

// router.get('/branches', dropdownFactory.getDropdownList(Branch, {
//   defaultSearchField: 'name',
//   labelTemplate: '{{name}} [{{branchCode}}]',
//   metaFields: ['isMainBranch'],
// }));

// router.get('/roles', dropdownFactory.getDropdownList(Role, {
//   defaultSearchField: 'name',
//   defaultLabelField: 'name',
//   metaFields: ['description', 'isSuperAdmin'],
//   allowStatusFilter: true,
// }));

// router.get('/customers', dropdownFactory.getDropdownList(Customer, {
//   defaultSearchField: 'name',
//   defaultLabelField: ['name', 'phone'],
//   metaFields: ['outstandingBalance', 'type', 'email'],
//   allowedFilters: ['type'],
// }));

// router.get('/suppliers', dropdownFactory.getDropdownList(Supplier, {
//   defaultSearchField: 'companyName',
//   defaultLabelField: ['companyName', 'contactPerson'],
//   metaFields: ['phone', 'outstandingBalance', 'paymentTerms'],
// }));

// router.get('/masters', dropdownFactory.getDropdownList(Master, {
//   defaultSearchField: 'name',
//   labelTemplate: '{{name}} [{{code}}]',
//   metaFields: ['type', 'description'],
//   allowedFilters: ['type', 'parentId'],
// }));

// router.get('/channels', dropdownFactory.getDropdownList(Channel, {
//   defaultSearchField: 'name',
//   defaultLabelField: 'name',
//   metaFields: ['description'],
// }));

// router.get('/transfer-requests', dropdownFactory.getDropdownList(TransferRequest, {
//   defaultSearchField: 'transferNumber',
//   labelTemplate: '{{transferNumber}} — {{status}}',
//   metaFields: ['status', 'createdAt'],
// }));

// /* ============================================================================
//    INVENTORY
// ============================================================================ */

// router.get('/products', dropdownFactory.getDropdownList(Product, {
//   defaultSearchField: 'name',
//   labelTemplate: '{{name}} ({{sku}})',
//   metaFields: ['sellingPrice', 'purchasePrice', 'totalStock', 'category', 'brand', 'sku', 'unit', 'taxRate'],
// }));

// router.get('/purchases', dropdownFactory.getDropdownList(Purchase, {
//   defaultSearchField: 'invoiceNumber',
//   defaultLabelField: 'invoiceNumber',
//   metaFields: ['grandTotal', 'paymentStatus', 'purchaseDate'],
//   populate: { path: 'supplierId', select: 'companyName' },
// }));

// router.get('/sales', dropdownFactory.getDropdownList(Sales, {
//   defaultSearchField: 'invoiceNumber',
//   defaultLabelField: 'invoiceNumber',
//   metaFields: ['grandTotal', 'paymentStatus', 'saleDate'],
//   populate: { path: 'customerId', select: 'name' },
// }));

// router.get('/sales-returns', dropdownFactory.getDropdownList(SalesReturn, {
//   defaultSearchField: 'returnNumber',
//   defaultLabelField: 'returnNumber',
//   metaFields: ['totalRefundAmount', 'status'],
//   populate: { path: 'originalInvoiceId', select: 'invoiceNumber' },
// }));

// router.get('/purchase-returns', dropdownFactory.getDropdownList(PurchaseReturn, {
//   defaultSearchField: 'returnNumber',
//   defaultLabelField: 'returnNumber',
//   metaFields: ['totalRefundAmount', 'status'],
//   populate: { path: 'originalPurchaseId', select: 'invoiceNumber' },
// }));

// // ✅ FIX 5: Inventory catalog routes — were in Angular type but missing here
// router.get('/brands', dropdownFactory.getDropdownList(Brand, {
//   defaultSearchField: 'name',
//   defaultLabelField: 'name',
//   metaFields: ['description'],
// }));

// router.get('/categories', dropdownFactory.getDropdownList(Category, {
//   defaultSearchField: 'name',
//   defaultLabelField: 'name',
//   metaFields: ['description'],
//   allowedFilters: ['parentId'],
// }));

// router.get('/subcategories', dropdownFactory.getDropdownList(SubCategory, {
//   defaultSearchField: 'name',
//   defaultLabelField: 'name',
//   metaFields: ['description'],
//   allowedFilters: ['categoryId'],
// }));

// router.get('/units', dropdownFactory.getDropdownList(Unit, {
//   defaultSearchField: 'name',
//   labelTemplate: '{{name}} ({{symbol}})',
//   metaFields: ['symbol', 'type'],
// }));

// router.get('/taxes', dropdownFactory.getDropdownList(Tax, {
//   defaultSearchField: 'name',
//   labelTemplate: '{{name}} ({{rate}}%)',
//   metaFields: ['rate', 'type'],
// }));

// /* ============================================================================
//    ACCOUNTING
// ============================================================================ */

// router.get('/accounts', dropdownFactory.getDropdownList(Account, {
//   defaultSearchField: 'name',
//   labelTemplate: '{{code}} — {{name}}',
//   metaFields: ['type', 'cachedBalance'],
//   allowStatusFilter: true,
//   allowedFilters: ['type'],
// }));

// router.get('/invoices', dropdownFactory.getDropdownList(Invoice, {
//   defaultSearchField: 'invoiceNumber',
//   labelTemplate: '{{invoiceNumber}} ({{paymentStatus}})',
//   metaFields: ['grandTotal', 'dueDate', 'invoiceDate'],
//   populate: { path: 'customerId', select: 'name phone' },
// }));

// router.get('/payments', dropdownFactory.getDropdownList(Payment, {
//   defaultSearchField: 'referenceNumber',
//   labelTemplate: '{{referenceNumber}} — ₹{{amount}}',
//   metaFields: ['amount', 'type', 'paymentMethod', 'paymentDate'],
//   populate: [
//     { path: 'customerId', select: 'name' },
//     { path: 'supplierId', select: 'companyName' },
//   ],
//   allowedFilters: ['type'],
// }));

// router.get('/emis', dropdownFactory.getDropdownList(EMI, {
//   defaultSearchField: 'loanNumber',
//   defaultLabelField: 'loanNumber',
//   metaFields: ['totalAmount', 'balanceAmount', 'status', 'numberOfInstallments'],
//   populate: [
//     { path: 'customerId', select: 'name phone' },
//     { path: 'invoiceId', select: 'invoiceNumber' },
//   ],
// }));

// /* ============================================================================
//    HRMS
// ============================================================================ */

// router.get('/departments', dropdownFactory.getDropdownList(Department, {
//   defaultSearchField: 'name',
//   defaultLabelField: 'name',
//   metaFields: ['description'],
//   populate: { path: 'parentDepartment', select: 'name' },
// }));

// router.get('/designations', dropdownFactory.getDropdownList(Designation, {
//   defaultSearchField: 'title',
//   defaultLabelField: 'title',
//   metaFields: ['level'],
//   populate: { path: 'departmentId', select: 'name' },
// }));

// router.get('/shifts', dropdownFactory.getDropdownList(Shift, {
//   defaultSearchField: 'name',
//   labelTemplate: '{{name}} ({{startTime}}–{{endTime}})',
//   metaFields: ['startTime', 'endTime', 'workingDays'],
// }));

// router.get('/shift-assignments', dropdownFactory.getDropdownList(ShiftAssignment, {
//   defaultSearchField: 'user',
//   labelTemplate: '{{user.name}} - {{shiftId.name}}',
//   metaFields: ['startDate', 'endDate', 'status'],
//   populate: [
//     { path: 'user', select: 'name' },
//     { path: 'shiftId', select: 'name' },
//   ],
// }));

// router.get('/holidays', dropdownFactory.getDropdownList(Holiday, {
//   defaultSearchField: 'name',
//   labelTemplate: '{{name}} ({{date}})',
//   metaFields: ['date', 'type'],
//   allowedFilters: ['type'],
// }));

// router.get('/geofencing', dropdownFactory.getDropdownList(GeoFencing, {
//   defaultSearchField: 'name',
//   labelTemplate: '{{name}} ({{radius}}m)',
//   metaFields: ['radius', 'latitude', 'longitude'],
// }));

// router.get('/attendance-machines', dropdownFactory.getDropdownList(AttendanceMachine, {
//   defaultSearchField: 'name',
//   defaultLabelField: 'name',
//   metaFields: ['ipAddress', 'status', 'connectionStatus'],
// }));

// router.get('/attendance-requests', dropdownFactory.getDropdownList(AttendanceRequest, {
//   defaultSearchField: 'type',
//   labelTemplate: '{{user.name}} - {{type}}',
//   metaFields: ['targetDate', 'status', 'appliedAt'],
//   populate: { path: 'user', select: 'name' },
//   allowedFilters: ['type', 'status'],
// }));

// router.get('/leave-requests', dropdownFactory.getDropdownList(LeaveRequest, {
//   defaultSearchField: 'leaveType',
//   labelTemplate: '{{user.name}} - {{leaveType}}',
//   metaFields: ['startDate', 'endDate', 'status', 'daysCount'],
//   populate: { path: 'user', select: 'name' },
//   allowedFilters: ['leaveType', 'status'],
// }));

// /* ============================================================================
//    NOTES & CRM
// ============================================================================ */

// router.get('/meetings', dropdownFactory.getDropdownList(Meeting, {
//   defaultSearchField: 'title',
//   labelTemplate: '{{title}} ({{startTime}})',
//   metaFields: ['startTime', 'endTime', 'status', 'locationType'],
//   populate: { path: 'organizer', select: 'name' },
// })); 

// module.exports = router;
