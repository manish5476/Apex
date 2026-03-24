// --- Core & Analytics ---
export { default as errorController } from './core/error/errorController.js';
export { default as analyticsController } from './modules/analytics/analyticsController.js';
export { default as searchController } from './modules/dashboard/core/searchController.js';
export { default as feedController } from './modules/feed/feedController.js';

// --- Accounting ---
export { default as invoiceAuditController } from './modules/accounting/billing/invoiceControllers/invoice.audit.controller.js';
export { default as invoiceController } from './modules/accounting/billing/invoiceControllers/invoice.controller.js';
export { default as invoicePaymentController } from './modules/accounting/billing/invoiceControllers/invoice.payment.controller.js';
export { default as invoiceProfitController } from './modules/accounting/billing/invoiceControllers/invoice.profit.controller.js';
export { default as invoiceReportController } from './modules/accounting/billing/invoiceControllers/invoice.report.controller.js';
export { default as invoicePdfController } from './modules/accounting/billing/invoicePDF.controller.js';
export { default as accountController } from './modules/accounting/core/account.controller.js';
export { default as ledgerController } from './modules/accounting/core/ledger.controller.js';
export { default as partyTransactionController } from './modules/accounting/core/partyTransactionController.js';
export { default as reconciliationController } from './modules/accounting/core/reconciliation.controller.js';
export { default as statementsController } from './modules/accounting/core/statementsController.js';
export { default as transactionController } from './modules/accounting/core/transaction.controller.js';
export { default as paymentCronController } from './modules/accounting/payments/cron.controller.js';
export { default as emiController } from './modules/accounting/payments/emi.controller.js';
export { default as paymentController } from './modules/accounting/payments/payment.controller.js';

// --- Auth ---
export { default as authController } from './modules/auth/core/auth.controller.js';
export { default as roleController } from './modules/auth/core/role.controller.js';
export { default as sessionController } from './modules/auth/core/session.controller.js';
export { default as userController } from './modules/auth/core/user.controller.js';

// --- HRMS ---
export { default as attendanceDailyController } from './modules/HRMS/controllers/attendance/attendanceDaily.controller.js';
export { default as attendanceLogController } from './modules/HRMS/controllers/attendance/attendanceLog.controller.js';
export { default as attendanceMachineController } from './modules/HRMS/controllers/attendance/attendanceMachine.controller.js';
export { default as geoFenceController } from './modules/HRMS/controllers/attendance/geoFence.controller.js';
export { default as holidayController } from './modules/HRMS/controllers/attendance/holiday.controller.js';
export { default as departmentController } from './modules/HRMS/controllers/core/department.controller.js';
export { default as designationController } from './modules/HRMS/controllers/core/designation.controller.js';
export { default as shiftController } from './modules/HRMS/controllers/core/shift.controller.js';
export { default as shiftGroupController } from './modules/HRMS/controllers/core/shiftGroup.controller.js';
export { default as leaveBalanceController } from './modules/HRMS/controllers/leave/leaveBalance.controller.js';
export { default as leaveRequestController } from './modules/HRMS/controllers/leave/leaveRequest.controller.js';

// --- Inventory ---
export { default as inventoryController } from './modules/inventory/core/inventory.controller.js';
export { default as productController } from './modules/inventory/core/product.controller.js';
export { default as purchaseController } from './modules/inventory/core/purchase.controller.js';
export { default as salesController } from './modules/inventory/core/sales.controller.js';
export { default as salesReturnController } from './modules/inventory/core/salesReturn.controller.js';

// --- Legacy & Master ---
export { default as legacyAdminController } from './modules/_legacy/controllers/adminController.js';
export { default as chartController } from './modules/_legacy/controllers/chartController.js';
export { default as dashboardController } from './modules/_legacy/controllers/dashboardController.js';
export { default as masterController } from './modules/master/core/master.controller.js';
export { default as masterListController } from './modules/master/core/masterList.controller.js';
export { default as masterTypeController } from './modules/master/core/masterType.controller.js';

// --- Notes, Notification & Uploads ---
export { default as noteController } from './modules/Notes/noteController.js';
export { default as announcementController } from './modules/notification/core/announcement.controller.js';
export { default as messageController } from './modules/notification/core/message.controller.js';
export { default as notificationController } from './modules/notification/core/notification.controller.js';
export { default as assetController } from './modules/uploads/assetController.js';
export { default as automationController } from './modules/webhook/automationController.js';

// --- Organization ---
export { default as branchController } from './modules/organization/core/branch.controller.js';
export { default as channelController } from './modules/organization/core/channel.controller.js';
export { default as customerController } from './modules/organization/core/customer.controller.js';
export { default as organizationController } from './modules/organization/core/organization.controller.js';
export { default as organizationExtrasController } from './modules/organization/core/organizationExtras.controller.js';
export { default as ownershipController } from './modules/organization/core/ownership.controller.js';
export { default as supplierController } from './modules/organization/core/supplier.controller.js';

// --- Public Modules (Storefront) ---
export { default as layoutAdminController } from './PublicModules/controllers/storefront/layoutAdmin.controller.js';
export { default as productPublicController } from './PublicModules/controllers/storefront/productPublic.controller.js';
export { default as smartRuleController } from './PublicModules/controllers/storefront/smartRule.controller.js';
export { default as storefrontAdminController } from './PublicModules/controllers/storefront/storefrontAdmin.controller.js';
export { default as storefrontPublicController } from './PublicModules/controllers/storefront/storefrontPublic.controller.js';