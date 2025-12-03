const express = require('express');
const router = express.Router();
const analyticsController = require('../../controllers/analyticsController');
const authController = require('../../controllers/authController');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

// 1. Executive
router.get('/dashboard', checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), analyticsController.getDashboardOverview);

// 2. Financial
router.get('/financials', checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), analyticsController.getFinancialReport);
router.get('/cash-flow', checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), analyticsController.getCashFlowReport);
router.get('/tax-report', checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), analyticsController.getTaxReport);

// 3. Operational
router.get('/inventory', checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), analyticsController.getInventoryReport);
router.get('/product-performance', checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), analyticsController.getProductPerformance);
router.get('/procurement', checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), analyticsController.getProcurementAnalysis);
router.get('/customer-insights', checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), analyticsController.getCustomerInsights);

module.exports = router;
// const express = require('express');
// const router = express.Router();
// const analyticsController = require('../../controllers/analyticsController');
// const authController = require('../../controllers/authController');
// const { checkPermission } = require("../../middleware/permissionMiddleware");
// const { PERMISSIONS } = require("../../config/permissions");

// router.use(authController.protect);

// router.get('/dashboard', checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), analyticsController.getDashboardOverview);

// router.get('/financials', checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), analyticsController.getFinancialReport);
// router.get('/cash-flow', checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), analyticsController.getCashFlowReport);
// router.get('/tax-report', checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), analyticsController.getTaxReport);

// router.get('/inventory', checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), analyticsController.getInventoryReport);
// router.get('/product-performance', checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), analyticsController.getProductPerformance);
// router.get('/procurement', checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), analyticsController.getProcurementAnalysis);
// router.get('/customer-insights', checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), analyticsController.getCustomerInsights);

// module.exports = router;


// // const express = require('express');
// // const router = express.Router();
// // const analyticsController = require('../../controllers/analyticsController');
// // // Import your existing adminController for specific drill-down reports
// // const adminController = require('../../controllers/adminController'); 
// // const authController = require('../../controllers/authController');

// // // Protect all routes
// // router.use(authController.protect);

// // // ==============================================================================
// // // 1. EXECUTIVE DASHBOARD (C-Level View)
// // // ==============================================================================
// // // [Replaces old /summary, /monthly, /top-customers, /top-products]
// // // Returns critical KPIs: Revenue, Expense, Net Profit, Growth %, 
// // // Quick Inventory Health, and Top Leaderboards in ONE optimized call.
// // router.get('/dashboard', analyticsController.getDashboardOverview);


// // // ==============================================================================
// // // 2. FINANCIAL INTELLIGENCE
// // // ==============================================================================
// // // Deep dive into P&L: Income vs Expense timelines, Profit margins.
// // router.get('/financials', analyticsController.getFinancialReport);

// // // Cash Flow & Payments:
// // // - Payment Mode Breakdown (Cash vs UPI vs Credit)
// // // - Aging Analysis (Debtors Bucket: 0-30, 30-60, 60-90, 90+ days)
// // // - Liquidity Position (Inflow vs Outflow trends)
// // router.get('/cash-flow', analyticsController.getCashFlowReport);

// // // Tax & Compliance:
// // // - Input Tax Credit (Purchases) vs Output Tax Liability (Sales)
// // // - GST Summary
// // router.get('/tax-report', analyticsController.getTaxReport);


// // // ==============================================================================
// // // 3. INVENTORY & PRODUCT INTELLIGENCE
// // // ==============================================================================
// // // Stock Levels & Valuation (FIFO/Average Cost)
// // router.get('/inventory', analyticsController.getInventoryReport);

// // // Product Performance:
// // // - Dead Stock Analysis (Items not sold in X days)
// // // - High Margin Products (Most profitable items vs high volume items)
// // // - Inventory Turnover Ratio (Efficiency)
// // router.get('/product-performance', analyticsController.getProductPerformance);

// // // Procurement Analysis:
// // // - Purchase Spending Trends
// // // - Supplier Performance (Top suppliers by spend)
// // // - Cost Analysis
// // router.get('/procurement', analyticsController.getProcurementAnalysis);


// // // ==============================================================================
// // // 4. CUSTOMER INSIGHTS & RISK
// // // ==============================================================================
// // // - Customer Acquisition Rate (New vs Recurring)
// // // - Churn Risk (Customers who haven't bought recently)
// // // - Credit Risk (Customers with high outstanding balance)
// // router.get('/customer-insights', analyticsController.getCustomerInsights);


// // // ==============================================================================
// // // 5. DETAILED OPERATIONAL REPORTS (Drill-Downs)
// // // ==============================================================================
// // // These endpoints return raw lists/tables for export or detailed viewing.

// // // Detailed List of Debtors/Creditors (Specific invoices pending)
// // router.get('/outstanding-list', adminController.outstanding); 

// // // Branch vs Branch Comparison Report (Multi-branch performance)
// // router.get('/branch-performance', authController.restrictTo('admin', 'superadmin'), adminController.branchSales);

// // module.exports = router;