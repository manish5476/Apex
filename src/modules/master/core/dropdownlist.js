const express = require('express');
const router = express.Router();

// 1. Core Utils & Middleware
const dropdownFactory = require('../../../core/utils/api/dropdownFactory');
const { protect } = require('../../auth/core/auth.controller'); // Assuming you have auth middleware

// 2. Organization & Auth Models
const Branch = require("../../organization/core/branch.model");
const Role = require("../../auth/core/role.model");
const Customer = require("../../organization/core/customer.model");
const Supplier = require("../../organization/core/supplier.model");
const User = require("../../auth/core/user.model");
const Master = require("./master.model");

// 3. Inventory Models
const Product = require("../../inventory/core/product.model");
const Purchase = require("../../inventory/core/purchase.model");
const Sales = require("../../inventory/core/sales.model");

// 4. Accounting Models
const Account = require("../../accounting/core/account.model");
const Invoice = require("../../accounting/billing/invoice.model");
const Payment = require("../../accounting/payments/payment.model");
const EMI = require("../../accounting/payments/emi.model");

// 5. HRMS Models
const Shift = require("../../HRMS/models/shift.model");
const AttendenceDaily = require("../../HRMS/models/attendanceDaily.model");
const AttendenceLog = require("../../HRMS/models/attendanceLog.model");
const AttendenceMachine = require("../../HRMS/models/attendanceMachine.model");
const Department = require("../../HRMS/models/department.model");
const Designation = require("../../HRMS/models/designation.model");
const Holiday = require("../../HRMS/models/holiday.model"); // Capitalized model name
const ShiftAssignment = require("../../HRMS/models/shiftAssignment.model"); // Capitalized model name
const geoFencing = require("../../HRMS/models/geoFencing.model"); // Capitalized model name

// ==========================================
// 🚀 MASTER DROPDOWN ROUTES
// ==========================================

// Secure all dropdown routes to ensure multi-tenant isolation
router.use(protect);

// --- Auth & Org ---
router.get('/users', dropdownFactory.getDropdownList(User, { defaultSearchField: 'name', defaultLabelField: 'name' }));
router.get('/branches', dropdownFactory.getDropdownList(Branch, { defaultSearchField: 'name', defaultLabelField: 'name' }));
router.get('/roles', dropdownFactory.getDropdownList(Role, { defaultSearchField: 'name', defaultLabelField: 'name' }));
router.get('/customers', dropdownFactory.getDropdownList(Customer, { defaultSearchField: 'companyName', defaultLabelField: 'companyName' }));
router.get('/suppliers', dropdownFactory.getDropdownList(Supplier, { defaultSearchField: 'supplierName', defaultLabelField: 'supplierName' }));
router.get('/masters', dropdownFactory.getDropdownList(Master, { defaultSearchField: 'name', defaultLabelField: 'name' }));

// --- Inventory ---
router.get('/products', dropdownFactory.getDropdownList(Product, { defaultSearchField: 'productName', defaultLabelField: 'productName' }));
router.get('/purchases', dropdownFactory.getDropdownList(Purchase, { defaultSearchField: 'purchaseOrderNumber', defaultLabelField: 'purchaseOrderNumber' }));
router.get('/sales', dropdownFactory.getDropdownList(Sales, { defaultSearchField: 'salesOrderNumber', defaultLabelField: 'salesOrderNumber' }));

// --- Accounting ---
router.get('/accounts', dropdownFactory.getDropdownList(Account, { defaultSearchField: 'accountName', defaultLabelField: 'accountName' }));
router.get('/invoices', dropdownFactory.getDropdownList(Invoice, { defaultSearchField: 'invoiceNumber', defaultLabelField: 'invoiceNumber' }));
router.get('/payments', dropdownFactory.getDropdownList(Payment, { defaultSearchField: 'transactionId', defaultLabelField: 'transactionId' }));
router.get('/emis', dropdownFactory.getDropdownList(EMI, { defaultSearchField: 'loanNumber', defaultLabelField: 'loanNumber' }));

// --- HRMS ---
router.get('/geofencing', dropdownFactory.getDropdownList(geoFencing, { defaultSearchField: 'name', defaultLabelField: 'name' }));
router.get('/departments', dropdownFactory.getDropdownList(Department, { defaultSearchField: 'name', defaultLabelField: 'name' }));
router.get('/designations', dropdownFactory.getDropdownList(Designation, { defaultSearchField: 'title', defaultLabelField: 'title' }));
router.get('/shifts', dropdownFactory.getDropdownList(Shift, { defaultSearchField: 'name', defaultLabelField: 'name' }));
router.get('/holidays', dropdownFactory.getDropdownList(Holiday, { defaultSearchField: 'name', defaultLabelField: 'name' }));
router.get('/shift-assignments', dropdownFactory.getDropdownList(ShiftAssignment, { defaultSearchField: 'employeeId', defaultLabelField: 'employeeId' }));
router.get('/attendance-machines', dropdownFactory.getDropdownList(AttendenceMachine, { defaultSearchField: 'machineIp', defaultLabelField: 'machineName' }));

module.exports = router;