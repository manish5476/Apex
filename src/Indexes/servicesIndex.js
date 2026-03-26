// --- Accounting Services ---
export { default as accountingService } from './modules/accounting/core/accounting.service.js';
export { default as accountService } from './modules/accounting/core/account.service.js';
export { default as journalService } from './modules/accounting/core/journal.service.js';
export { default as ledgerCacheService } from './modules/accounting/core/ledgerCache.service.js';
export { default as statementsService } from './modules/accounting/core/statementsService.js';
export { default as transactionService } from './modules/accounting/core/transaction.service.js';
export { default as invoicePdfService } from './modules/accounting/billing/invoicePDFService.js';
export { default as emiService } from './modules/accounting/payments/emiService.js';
export { default as paymentAllocationService } from './modules/accounting/payments/paymentAllocation.service.js';
export { default as paymentPdfService } from './modules/accounting/payments/paymentPDF.service.js';
export { default as payrollService } from './modules/accounting/payments/payroll.service.js';

// --- Analytics Services ---
export { default as cacheAnalyticsService } from './modules/analytics/services/cache.service.js';
export { default as customerAnalyticsService } from './modules/analytics/services/customer.service.js';
export { default as executiveAnalyticsService } from './modules/analytics/services/executive.service.js';
export { default as exportAnalyticsService } from './modules/analytics/services/export.service.js';
export { default as financialAnalyticsService } from './modules/analytics/services/financial.service.js';
export { default as insightsAnalyticsService } from './modules/analytics/services/insights.service.js';
export { default as inventoryAnalyticsService } from './modules/analytics/services/inventory.service.js';
export { default as operationsAnalyticsService } from './modules/analytics/services/operations.service.js';
export { default as salesAnalyticsService } from './modules/analytics/services/sales.service.js';
export { default as securityAnalyticsService } from './modules/analytics/services/security.service.js';
export { default as staffAnalyticsService } from './modules/analytics/services/staff.service.js';

// --- Inventory Services ---
export { default as inventoryAlertService } from './modules/inventory/core/service/inventoryAlert.service.js';
export { default as inventoryJournalService } from './modules/inventory/core/service/inventoryJournal.service.js';
export { default as salesJournalService } from './modules/inventory/core/service/salesJournal.service.js';
export { default as salesService } from './modules/inventory/core/service/sales.service.js';
export { default as stockValidationService } from './modules/inventory/core/service/stockValidation.service.js';

// --- Legacy Services ---
export { default as adminService } from './modules/_legacy/services/adminService.js';
export { default as chartService } from './modules/_legacy/services/chartService.js';
export { default as dashboardService } from './modules/_legacy/services/dashboardService.js';

// --- Notification & Automation Services ---
export { default as notificationService } from './modules/notification/core/notification.service.js';
export { default as overdueReminderService } from './modules/notification/core/overdueReminder.service.js';
export { default as paymentReminderService } from './modules/notification/core/paymentReminder.service.js';
export { default as automationService } from './modules/webhook/automationService.js';

// --- Organization & Utility Services ---
export { default as activityLogService } from './modules/activity/activityLogService.js';
export { default as aiAgentService } from './modules/ai/agentService.js';
export { default as ownershipService } from './modules/organization/core/ownership.service.js';
export { default as fileUploadService } from './modules/uploads/fileUploadService.js';
export { default as imageUploadService } from './modules/uploads/imageUploadService.js';

// --- Public Modules (Storefront) Services ---
export { default as dataHydrationService } from './PublicModules/services/storefront/dataHydration.service.js';
export { default as layoutService } from './PublicModules/services/storefront/layout.service.js';
export { default as ruleQueryBuilderService } from './PublicModules/services/storefront/ruleQueryBuilder.service.js';
export { default as sectionRegistryService } from './PublicModules/services/storefront/sectionRegistry.service.js';
export { default as smartRuleEngineService } from './PublicModules/services/storefront/smartRuleEngine.service.js';