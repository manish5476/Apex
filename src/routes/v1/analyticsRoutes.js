const express = require("express");
const router = express.Router();
const analyticsController = require("../../controllers/analyticsController");
const authController = require("../../controllers/authController");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

// All analytics routes require authentication
router.use(authController.protect);

/* ==========================================================================
   📊 ANALYTICS API DOCUMENTATION
   ==========================================================================

   COMMON QUERY PARAMETERS (Applicable to most endpoints):
   --------------------------------------------------------------------------
   | Parameter  | Type    | Default                      | Description     |
   |------------|---------|------------------------------|-----------------|
   | startDate  | String  | Start of current month       | YYYY-MM-DD      |
   | endDate    | String  | End of current day           | YYYY-MM-DD      |
   | branchId   | String  | All branches in organization | ObjectId        |
   | cache      | Boolean | true                         | Enable caching  |
   | limit      | Number  | Varies by endpoint           | Results limit   |
   --------------------------------------------------------------------------

   DATE RANGE BEHAVIOR:
   - If only startDate provided: From startDate to current day
   - If only endDate provided: From start of month to endDate
   - If invalid dates: Uses defaults
   - Maximum range: 365 days (auto-adjusted for performance)
   - endDate is inclusive (sets to 23:59:59.999)

   RESPONSE FORMAT:
   {
     "status": "success",
     "data": {...},
     "meta": {
       "timestamp": "2024-01-15T10:30:00.000Z",
       "responseTime": "245.67ms",
       "cached": false,
       "branchId": "all",
       ...additional metadata
     }
   }

   ERROR RESPONSES:
   - 400: Invalid parameters / missing required fields
   - 401: Authentication required / token expired
   - 403: Insufficient permissions
   - 404: Resource not found
   - 500: Server error (with error details in development)
   ========================================================================== */

// ==========================================================================
// 1. 📈 EXECUTIVE DASHBOARDS (High-level overviews)
// ==========================================================================

/**
 * @api {get} /api/v1/analytics/dashboard Comprehensive Executive Dashboard
 * @apiName GetDashboardOverview
 * @apiGroup Analytics
 * @apiPermission analytics:view:executive
 * @apiVersion 1.0.0
 * 
 * @apiDescription Get comprehensive executive dashboard with all key metrics, trends, alerts, and recommendations. 
 * Combines financial, inventory, customer, and operational data in a single response.
 * 
 * @apiQuery {String} [startDate] Start date (YYYY-MM-DD)
 * @apiQuery {String} [endDate] End date (YYYY-MM-DD)
 * @apiQuery {String} [branchId] Filter by specific branch
 * @apiQuery {Boolean} [cache=true] Enable/disable response caching
 * 
 * @apiSuccess {Object} period Date range information
 * @apiSuccess {Object} financial Financial KPIs (revenue, expenses, profit)
 * @apiSuccess {Object} trends Chart data and trends
 * @apiSuccess {Object} inventory Inventory health and alerts
 * @apiSuccess {Object} leaders Top customers and products
 * @apiSuccess {Object} alerts System and business alerts
 * @apiSuccess {Object} customers Customer segmentation and risk
 * @apiSuccess {Object} operations Operational metrics
 * @apiSuccess {Object} insights Generated business insights
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/dashboard?startDate=2024-01-01&endDate=2024-01-31&branchId=65a1b2c3d4e5f67890123456"
 * 
 * @apiSuccessExample {json} Success Response:
 * HTTP/1.1 200 OK
 * {
 *   "status": "success",
 *   "data": {
 *     "period": {
 *       "start": "2024-01-01T00:00:00.000Z",
 *       "end": "2024-01-31T23:59:59.999Z",
 *       "days": 31
 *     },
 *     "financial": {...},
 *     "trends": {...},
 *     "inventory": {...},
 *     "leaders": {...},
 *     "alerts": {...},
 *     "customers": {...},
 *     "operations": {...},
 *     "insights": {...}
 *   },
 *   "meta": {
 *     "timestamp": "2024-01-15T10:30:00.000Z",
 *     "responseTime": "245.67ms",
 *     "cached": false,
 *     "branchId": "65a1b2c3d4e5f67890123456"
 *   }
 * }
 */
router.get(
    "/dashboard",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
    analyticsController.getDashboardOverview
);

/**
 * @api {get} /api/v1/analytics/branch-comparison Branch Performance Comparison
 * @apiName GetBranchComparison
 * @apiGroup Analytics
 * @apiPermission analytics:view:branch_comparison
 * @apiVersion 1.0.0
 * 
 * @apiDescription Compare performance across all branches by various metrics. Useful for identifying top performers and areas for improvement.
 * 
 * @apiQuery {String} [startDate] Start date (YYYY-MM-DD)
 * @apiQuery {String} [endDate] End date (YYYY-MM-DD)
 * @apiQuery {String="revenue","invoiceCount","avgBasketValue"} [groupBy=revenue] Sort branches by this metric
 * @apiQuery {Number} [limit=50] Maximum number of branches to return
 * 
 * @apiSuccess {Object} comparison Branch comparison data
 * @apiSuccess {Number} comparison.total Total number of branches
 * @apiSuccess {Object} comparison.topPerformer Top performing branch
 * @apiSuccess {Object} comparison.lowestPerformer Lowest performing branch
 * @apiSuccess {Array} comparison.branches List of branches with metrics
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/branch-comparison?startDate=2024-01-01&groupBy=invoiceCount"
 */
router.get(
    "/branch-comparison",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_BRANCH_COMPARISON),
    analyticsController.getBranchComparison
);

// ==========================================================================
// 2. 💰 FINANCIAL INTELLIGENCE SUITE (Money-related analytics)
// ==========================================================================

/**
 * @api {get} /api/v1/analytics/financials Comprehensive Financial Dashboard
 * @apiName GetFinancialDashboard
 * @apiGroup Analytics
 * @apiPermission analytics:view:financial
 * @apiVersion 1.0.0
 * 
 * @apiDescription Deep dive into financial metrics including cash flow, profitability, taxes, receivables, and payment behavior.
 * 
 * @apiQuery {String} [startDate] Start date (YYYY-MM-DD)
 * @apiQuery {String} [endDate] End date (YYYY-MM-DD)
 * @apiQuery {String} [branchId] Filter by specific branch
 * 
 * @apiSuccess {Object} period Date range
 * @apiSuccess {Object} summary High-level financial summary
 * @apiSuccess {Object} cashFlow Cash flow analysis and payment modes
 * @apiSuccess {Object} profitability Gross profit margins
 * @apiSuccess {Object} tax Tax compliance and liabilities
 * @apiSuccess {Object} receivables Debtor aging analysis
 * @apiSuccess {Object} credit EMI and credit sales
 * @apiSuccess {Array} paymentBehavior Top 10 customer payment behaviors
 * @apiSuccess {Array} recommendations Financial recommendations
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/financials?startDate=2024-01-01&branchId=65a1b2c3d4e5f67890123456"
 */
router.get(
    "/financials",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL),
    analyticsController.getFinancialDashboard
);

/**
 * @api {get} /api/v1/analytics/cash-flow Cash Flow Analysis (Alias)
 * @apiName GetCashFlow
 * @apiGroup Analytics
 * @apiPermission analytics:view:cashflow
 * @apiVersion 1.0.0
 * 
 * @apiDescription Alias for /financials endpoint with cash flow focus. Returns same data as financials endpoint.
 * 
 * @apiQuery {String} [startDate] Start date (YYYY-MM-DD)
 * @apiQuery {String} [endDate] End date (YYYY-MM-DD)
 * @apiQuery {String} [branchId] Filter by specific branch
 * 
 * @apiSee GetFinancialDashboard
 */
router.get(
    "/cash-flow",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CASHFLOW),
    analyticsController.getFinancialDashboard
);

// ==========================================================================
// 3. 👥 CUSTOMER INTELLIGENCE HUB (Customer-focused analytics)
// ==========================================================================

/**
 * @api {get} /api/v1/analytics/customer-intelligence Complete Customer Intelligence
 * @apiName GetCustomerIntelligence
 * @apiGroup Analytics
 * @apiPermission analytics:view:customer_segmentation
 * @apiVersion 1.0.0
 * 
 * @apiDescription Comprehensive customer analytics including segmentation, lifetime value, churn risk, and payment behavior.
 * 
 * @apiQuery {String} [branchId] Filter by specific branch
 * 
 * @apiSuccess {Object} segmentation RFM (Recency, Frequency, Monetary) analysis
 * @apiSuccess {Object} riskAnalysis Churn risk and credit risk customers
 * @apiSuccess {Object} valueAnalysis Lifetime value analysis by tiers
 * @apiSuccess {Object} behavior Payment behavior patterns
 * @apiSuccess {Object} recommendations Customer-focused recommendations
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/customer-intelligence?branchId=65a1b2c3d4e5f67890123456"
 */
router.get(
    "/customer-intelligence",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION),
    analyticsController.getCustomerIntelligence
);

/**
 * @api {get} /api/v1/analytics/customer-segmentation Customer Segmentation (RFM)
 * @apiName GetCustomerSegmentation
 * @apiGroup Analytics
 * @apiPermission analytics:view:customer_segmentation
 * @apiVersion 1.0.0
 * 
 * @apiDescription RFM (Recency, Frequency, Monetary) segmentation analysis. Groups customers into segments like Champions, Loyal, At Risk, etc.
 * 
 * @apiSuccess {Object} segments Customer distribution by RFM segments
 * @apiSuccess {Number} segments.Champion Count of Champion customers
 * @apiSuccess {Number} segments.Loyal Count of Loyal customers
 * @apiSuccess {Number} segments.At Risk Count of At Risk customers
 * @apiSuccess {Number} segments['New Customer'] Count of New customers
 * @apiSuccess {Number} segments.Standard Count of Standard customers
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/customer-segmentation"
 */
router.get(
    "/customer-segmentation",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION),
    analyticsController.getCustomerSegmentation
);

/**
 * @api {get} /api/v1/analytics/customer-ltv Customer Lifetime Value
 * @apiName GetCustomerLTV
 * @apiGroup Analytics
 * @apiPermission analytics:view:customer_ltv
 * @apiVersion 1.0.0
 * 
 * @apiDescription Calculate and analyze customer lifetime value across different tiers (Platinum, Gold, Silver, Bronze).
 * 
 * @apiQuery {String} [branchId] Filter by specific branch
 * 
 * @apiSuccess {Array} customers List of customers with LTV data (top 100)
 * @apiSuccess {Object} summary LTV summary statistics
 * @apiSuccess {Number} summary.totalLTV Total LTV of all customers
 * @apiSuccess {Number} summary.avgLTV Average LTV per customer
 * @apiSuccess {Object} summary.topCustomer Highest LTV customer
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/customer-ltv"
 */
router.get(
    "/customer-ltv",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_LTV),
    analyticsController.getCustomerLifetimeValue
);

/**
 * @api {get} /api/v1/analytics/churn-risk Customer Churn Risk Analysis
 * @apiName GetChurnRisk
 * @apiGroup Analytics
 * @apiPermission analytics:view:churn
 * @apiVersion 1.0.0
 * 
 * @apiDescription Identify customers at risk of churning based on inactivity period.
 * 
 * @apiQuery {Number} [threshold=90] Days of inactivity to consider as churn risk
 * 
 * @apiSuccess {Array} atRiskCustomers List of customers at risk of churning
 * @apiSuccess {String} atRiskCustomers.name Customer name
 * @apiSuccess {String} atRiskCustomers.phone Customer phone
 * @apiSuccess {Date} atRiskCustomers.lastPurchaseDate Last purchase date
 * @apiSuccess {Number} atRiskCustomers.daysSinceLastPurchase Days since last purchase
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/churn-risk?threshold=60"
 */
router.get(
    "/churn-risk",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CHURN),
    analyticsController.getChurnRiskAnalysis
);

/**
 * @api {get} /api/v1/analytics/market-basket Market Basket Analysis
 * @apiName GetMarketBasket
 * @apiGroup Analytics
 * @apiPermission analytics:view:market_basket
 * @apiVersion 1.0.0
 * 
 * @apiDescription Identify products that are frequently bought together (association rules).
 * 
 * @apiQuery {Number} [minSupport=2] Minimum number of co-occurrences to consider
 * 
 * @apiSuccess {Array} frequentlyBoughtTogether List of product pairs
 * @apiSuccess {String} frequentlyBoughtTogether.productA First product name
 * @apiSuccess {String} frequentlyBoughtTogether.productB Second product name
 * @apiSuccess {Number} frequentlyBoughtTogether.timesBoughtTogether Count of co-occurrences
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/market-basket?minSupport=5"
 */
router.get(
    "/market-basket",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_MARKET_BASKET),
    analyticsController.getMarketBasketAnalysis
);

/**
 * @api {get} /api/v1/analytics/payment-behavior Payment Behavior Analysis
 * @apiName GetPaymentBehavior
 * @apiGroup Analytics
 * @apiPermission analytics:view:payment_behavior
 * @apiVersion 1.0.0
 * 
 * @apiDescription Analyze customer payment habits including average days to pay and payment reliability.
 * 
 * @apiQuery {String} [branchId] Filter by specific branch
 * 
 * @apiSuccess {Array} paymentBehavior List of customer payment behaviors
 * @apiSuccess {String} paymentBehavior.customer Customer name
 * @apiSuccess {Number} paymentBehavior.avgDaysToPay Average days to make payment
 * @apiSuccess {String} paymentBehavior.rating Payment rating (Excellent, Good, Fair, Poor)
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/payment-behavior?branchId=65a1b2c3d4e5f67890123456"
 */
router.get(
    "/payment-behavior",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_PAYMENT_BEHAVIOR),
    analyticsController.getPaymentBehaviorStats
);

/**
 * @api {get} /api/v1/analytics/customer-insights Customer Risk Insights
 * @apiName GetCustomerInsights
 * @apiGroup Analytics
 * @apiPermission analytics:view:customer_insights
 * @apiVersion 1.0.0
 * 
 * @apiDescription Combined customer insights including segmentation, churn risk, and LTV.
 * 
 * @apiQuery {String} [branchId] Filter by specific branch
 * 
 * @apiSuccess {Object} acquisitionCost Customer acquisition metrics
 * @apiSuccess {Number} retentionRate Customer retention rate
 * @apiSuccess {Number} referralRate Customer referral rate
 * 
 * @apiSee GetCustomerIntelligence
 */
router.get(
    "/customer-insights",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_INSIGHTS),
    analyticsController.getCustomerInsights
);

// ==========================================================================
// 4. 📦 INVENTORY INTELLIGENCE SUITE (Stock and product analytics)
// ==========================================================================

/**
 * @api {get} /api/v1/analytics/inventory-health Complete Inventory Health Dashboard
 * @apiName GetInventoryHealth
 * @apiGroup Analytics
 * @apiPermission analytics:view:inventory
 * @apiVersion 1.0.0
 * 
 * @apiDescription Comprehensive inventory analysis including stock levels, valuation, predictions, and recommendations.
 * 
 * @apiQuery {String} [branchId] Filter by specific branch
 * @apiQuery {Boolean} [includeValuation=true] Include inventory valuation
 * @apiQuery {Boolean} [includePredictions=true] Include stock-out predictions
 * 
 * @apiSuccess {Object} health Inventory health score and status
 * @apiSuccess {Object} alerts Stock alerts summary
 * @apiSuccess {Object} valuation Inventory valuation (if included)
 * @apiSuccess {Object} performance Top sellers and slow movers
 * @apiSuccess {Array} predictions Stock-out predictions (next 30 days)
 * @apiSuccess {Array} suppliers Top 10 supplier performance
 * @apiSuccess {Object} turnover Stock turnover rates
 * @apiSuccess {Array} recommendations Inventory recommendations
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/inventory-health?branchId=65a1b2c3d4e5f67890123456"
 */
router.get(
    "/inventory-health",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY),
    analyticsController.getInventoryHealth
);

/**
 * @api {get} /api/v1/analytics/product-performance Product Performance Analysis
 * @apiName GetProductPerformance
 * @apiGroup Analytics
 * @apiPermission analytics:view:product_performance
 * @apiVersion 1.0.0
 * 
 * @apiDescription Analyze product performance including high-margin products and dead stock.
 * 
 * @apiQuery {String} [branchId] Filter by specific branch
 * 
 * @apiSuccess {Array} highMargin Top 10 high margin products
 * @apiSuccess {Array} deadStock Dead stock (no sales in 90 days)
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/product-performance"
 */
router.get(
    "/product-performance",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE),
    analyticsController.getProductPerformance
);

/**
 * @api {get} /api/v1/analytics/dead-stock Dead Stock Analysis
 * @apiName GetDeadStock
 * @apiGroup Analytics
 * @apiPermission analytics:view:dead_stock
 * @apiVersion 1.0.0
 * 
 * @apiDescription Identify dead stock (inventory with no sales in specified period).
 * 
 * @apiQuery {String} [branchId] Filter by specific branch
 * @apiQuery {Number} [days=90] Days threshold for dead stock
 * 
 * @apiSuccess {Array} deadStock List of dead stock items
 * @apiSuccess {String} deadStock.name Product name
 * @apiSuccess {String} deadStock.sku Product SKU
 * @apiSuccess {Number} deadStock.quantity Current stock quantity
 * @apiSuccess {Number} deadStock.value Inventory value
 * @apiSuccess {Number} deadStock.daysInactive Days since last sale
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/dead-stock?days=180"
 */
router.get(
    "/dead-stock",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEAD_STOCK),
    analyticsController.getDeadStockReport
);

/**
 * @api {get} /api/v1/analytics/stock-predictions Stock-Out Predictions
 * @apiName GetStockPredictions
 * @apiGroup Analytics
 * @apiPermission analytics:view:stock_forecast
 * @apiVersion 1.0.0
 * 
 * @apiDescription Predict which items will run out of stock based on sales velocity.
 * 
 * @apiQuery {String} [branchId] Filter by specific branch
 * 
 * @apiSuccess {Array} predictions Stock-out predictions
 * @apiSuccess {String} predictions.name Product name
 * @apiSuccess {Number} predictions.currentStock Current stock level
 * @apiSuccess {Number} predictions.dailyVelocity Average daily sales
 * @apiSuccess {Number} predictions.daysUntilStockout Predicted days until stockout
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/stock-predictions"
 */
router.get(
    "/stock-predictions",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_STOCK_FORECAST),
    analyticsController.getStockOutPredictions
);

/**
 * @api {get} /api/v1/analytics/category-performance Category Performance Analysis
 * @apiName GetCategoryAnalytics
 * @apiGroup Analytics
 * @apiPermission analytics:view:product_performance
 * @apiVersion 1.0.0
 * 
 * @apiDescription Analyze performance by product category including revenue, margin, and quantity sold.
 * 
 * @apiQuery {String} [startDate] Start date (YYYY-MM-DD) - defaults to 90 days ago
 * @apiQuery {String} [endDate] End date (YYYY-MM-DD) - defaults to today
 * @apiQuery {String} [branchId] Filter by specific branch
 * 
 * @apiSuccess {Array} categories List of categories with performance metrics
 * @apiSuccess {String} categories.category Category name
 * @apiSuccess {Number} categories.totalRevenue Total revenue from category
 * @apiSuccess {Number} categories.totalQuantity Total quantity sold
 * @apiSuccess {Number} categories.marginPercentage Profit margin percentage
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/category-performance?startDate=2024-01-01"
 */
router.get(
    "/category-performance",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE),
    analyticsController.getCategoryAnalytics
);

/**
 * @api {get} /api/v1/analytics/supplier-performance Supplier Performance Analysis
 * @apiName GetSupplierPerformance
 * @apiGroup Analytics
 * @apiPermission analytics:view:procurement
 * @apiVersion 1.0.0
 * 
 * @apiDescription Analyze supplier performance including spend, efficiency, and ratings.
 * 
 * @apiQuery {String} [startDate] Start date (YYYY-MM-DD) - defaults to 90 days ago
 * @apiQuery {String} [endDate] End date (YYYY-MM-DD) - defaults to today
 * @apiQuery {String} [branchId] Filter by specific branch
 * 
 * @apiSuccess {Array} suppliers List of suppliers with performance metrics
 * @apiSuccess {String} suppliers.supplierName Supplier company name
 * @apiSuccess {Number} suppliers.totalSpend Total purchase amount
 * @apiSuccess {Number} suppliers.purchaseCount Number of purchase orders
 * @apiSuccess {Number} suppliers.paymentEfficiency Payment efficiency percentage
 * @apiSuccess {String} suppliers.supplierRating Performance rating (A, B, C, D)
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/supplier-performance?branchId=65a1b2c3d4e5f67890123456"
 */
router.get(
    "/supplier-performance",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT),
    analyticsController.getSupplierPerformance
);

// ==========================================================================
// 5. 🏭 OPERATIONAL EXCELLENCE SUITE (Process and efficiency analytics)
// ==========================================================================

/**
 * @api {get} /api/v1/analytics/operational-metrics Comprehensive Operational Dashboard
 * @apiName GetOperationalMetrics
 * @apiGroup Analytics
 * @apiPermission analytics:view:operational
 * @apiVersion 1.0.0
 * 
 * @apiDescription Operational efficiency metrics including staff performance, peak hours, procurement, and returns.
 * 
 * @apiQuery {String} [startDate] Start date (YYYY-MM-DD)
 * @apiQuery {String} [endDate] End date (YYYY-MM-DD)
 * @apiQuery {String} [branchId] Filter by specific branch
 * 
 * @apiSuccess {Object} efficiency Efficiency score and metrics
 * @apiSuccess {Object} productivity Staff performance and attendance correlation
 * @apiSuccess {Object} operations Peak hours and process metrics
 * @apiSuccess {Object} procurement Procurement analysis (if included)
 * @apiSuccess {Object} returns Return analysis and trends
 * @apiSuccess {Object} kpis Operational KPIs
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/operational-metrics?startDate=2024-01-01"
 */
router.get(
    "/operational-metrics",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
    analyticsController.getOperationalMetrics
);

/**
 * @api {get} /api/v1/analytics/staff-performance Staff Performance Analysis
 * @apiName GetStaffPerformance
 * @apiGroup Analytics
 * @apiPermission analytics:view:staff_performance
 * @apiVersion 1.0.0
 * 
 * @apiDescription Analyze staff performance metrics including sales, invoice count, and discount given.
 * 
 * @apiQuery {String} [startDate] Start date (YYYY-MM-DD)
 * @apiQuery {String} [endDate] End date (YYYY-MM-DD)
 * @apiQuery {String} [branchId] Filter by specific branch
 * @apiQuery {Number} [minSales=0] Minimum sales threshold
 * @apiQuery {String="revenue","invoiceCount","totalDiscountGiven","avgTicketSize"} [sortBy=revenue] Sort field
 * 
 * @apiSuccess {Array} staff List of staff performance metrics
 * @apiSuccess {String} staff.name Staff name
 * @apiSuccess {String} staff.email Staff email
 * @apiSuccess {Number} staff.totalSales Total sales amount
 * @apiSuccess {Number} staff.invoiceCount Number of invoices
 * @apiSuccess {Number} staff.totalDiscountGiven Total discount given
 * @apiSuccess {Number} staff.avgTicketSize Average ticket size
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/staff-performance?minSales=10000&sortBy=invoiceCount"
 */
router.get(
    "/staff-performance",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE),
    analyticsController.getStaffPerformance
);

/**
 * @api {get} /api/v1/analytics/staff-attendance-performance Staff Attendance & Productivity
 * @apiName GetStaffAttendancePerformance
 * @apiGroup Analytics
 * @apiPermission analytics:view:staff_performance
 * @apiVersion 1.0.0
 * 
 * @apiDescription Correlate staff attendance with sales performance to identify productivity patterns.
 * 
 * @apiQuery {String} [startDate] Start date (YYYY-MM-DD)
 * @apiQuery {String} [endDate] End date (YYYY-MM-DD)
 * @apiQuery {String} [branchId] Filter by specific branch
 * 
 * @apiSuccess {Array} staffAttendance List of staff with attendance and sales data
 * @apiSuccess {String} staffAttendance.name Staff name
 * @apiSuccess {Number} staffAttendance.totalRevenue Total sales revenue
 * @apiSuccess {Number} staffAttendance.invoiceCount Number of invoices
 * @apiSuccess {Object} staffAttendance.attendance Attendance summary
 * @apiSuccess {Number} staffAttendance.productivity Revenue per work hour
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/staff-attendance-performance?startDate=2024-01-01"
 */
router.get(
    "/staff-attendance-performance",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE),
    analyticsController.getStaffAttendancePerformance
);

/**
 * @api {get} /api/v1/analytics/peak-hours Peak Business Hours Analysis
 * @apiName GetPeakBusinessHours
 * @apiGroup Analytics
 * @apiPermission analytics:view:peak_hours
 * @apiVersion 1.0.0
 * 
 * @apiDescription Analyze peak business hours to optimize staffing and operations.
 * 
 * @apiQuery {String} [branchId] Filter by specific branch
 * 
 * @apiSuccess {Array} peakHours Hourly analysis for last 30 days
 * @apiSuccess {Number} peakHours.day Day of week (1=Sunday, 7=Saturday)
 * @apiSuccess {Number} peakHours.hour Hour of day (0-23)
 * @apiSuccess {Number} peakHours.count Transaction count
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/peak-hours"
 */
router.get(
    "/peak-hours",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_PEAK_HOURS),
    analyticsController.getPeakBusinessHours
);

/**
 * @api {get} /api/v1/analytics/time-analytics Time-Based Analytics
 * @apiName GetTimeBasedAnalytics
 * @apiGroup Analytics
 * @apiPermission analytics:view:operational
 * @apiVersion 1.0.0
 * 
 * @apiDescription Comprehensive time-based analysis including hourly, daily, weekly, and monthly trends.
 * 
 * @apiQuery {String} [branchId] Filter by specific branch
 * 
 * @apiSuccess {Object} hourly Hourly analysis (last 6 months)
 * @apiSuccess {Object} daily Daily analysis by day of week
 * @apiSuccess {Object} monthly Monthly analysis
 * @apiSuccess {Object} weekly Weekly trends
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/time-analytics"
 */
router.get(
    "/time-analytics",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
    analyticsController.getTimeBasedAnalytics
);

/**
 * @api {get} /api/v1/analytics/procurement Procurement Analysis
 * @apiName GetProcurementAnalysis
 * @apiGroup Analytics
 * @apiPermission analytics:view:procurement
 * @apiVersion 1.0.0
 * 
 * @apiDescription Analyze procurement patterns and top suppliers.
 * 
 * @apiQuery {String} [startDate] Start date (YYYY-MM-DD)
 * @apiQuery {String} [endDate] End date (YYYY-MM-DD)
 * @apiQuery {String} [branchId] Filter by specific branch
 * 
 * @apiSuccess {Object} topSuppliers Top 5 suppliers by spend
 * @apiSuccess {String} topSuppliers.name Supplier company name
 * @apiSuccess {Number} topSuppliers.totalSpend Total purchase amount
 * @apiSuccess {Number} topSuppliers.bills Number of purchase bills
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/procurement?startDate=2024-01-01"
 */
router.get(
    "/procurement",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT),
    analyticsController.getProcurementAnalysis
);

// ==========================================================================
// 6. 🔮 PREDICTIVE ANALYTICS & FORECASTING (Future predictions)
// ==========================================================================

/**
 * @api {get} /api/v1/analytics/forecast Sales Forecasting
 * @apiName GetSalesForecast
 * @apiGroup Analytics
 * @apiPermission analytics:view:forecast
 * @apiVersion 1.0.0
 * 
 * @apiDescription Generate sales forecasts using linear regression based on historical data.
 * 
 * @apiQuery {String} [branchId] Filter by specific branch
 * @apiQuery {Number} [periods=3] Number of periods to forecast
 * @apiQuery {Number} [confidence=0.95] Confidence level (0-1)
 * 
 * @apiSuccess {Array} forecast List of forecast periods
 * @apiSuccess {String} forecast.period Forecast period label
 * @apiSuccess {Number} forecast.predictedRevenue Predicted revenue
 * @apiSuccess {Number} forecast.lowerBound Lower bound estimate
 * @apiSuccess {Number} forecast.upperBound Upper bound estimate
 * @apiSuccess {Number} forecast.confidence Confidence percentage
 * @apiSuccess {String} forecast.growth Trend direction (up/down/stable)
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/forecast?periods=6&confidence=0.90"
 */
router.get(
    "/forecast",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST),
    analyticsController.getSalesForecast
);

/**
 * @api {get} /api/v1/analytics/predictive-analytics Comprehensive Predictive Analytics
 * @apiName GetPredictiveAnalytics
 * @apiGroup Analytics
 * @apiPermission analytics:view:forecast
 * @apiVersion 1.0.0
 * 
 * @apiDescription Comprehensive predictive analytics including sales, inventory, and cash flow forecasts.
 * 
 * @apiQuery {String} [branchId] Filter by specific branch
 * @apiQuery {Number} [periods=3] Number of periods to forecast
 * @apiQuery {Number} [confidence=0.95] Confidence level (0-1)
 * 
 * @apiSuccess {Object} sales Sales forecasts with confidence intervals
 * @apiSuccess {Object} inventory Stock-out predictions
 * @apiSuccess {Object} cashFlow Cash flow projections
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/predictive-analytics?periods=12"
 */
router.get(
    "/predictive-analytics",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST),
    analyticsController.getPredictiveAnalytics
);

/**
 * @api {get} /api/v1/analytics/emi-analytics EMI & Credit Sales Analysis
 * @apiName GetEMIAnalytics
 * @apiGroup Analytics
 * @apiPermission analytics:view:financial
 * @apiVersion 1.0.0
 * 
 * @apiDescription Analyze EMI and credit sales performance including completion rates and defaults.
 * 
 * @apiQuery {String} [branchId] Filter by specific branch
 * 
 * @apiSuccess {Array} emiAnalytics EMI statistics by status
 * @apiSuccess {String} emiAnalytics.status EMI status (active/completed/defaulted)
 * @apiSuccess {Number} emiAnalytics.totalAmount Total EMI amount
 * @apiSuccess {Number} emiAnalytics.completionRate Payment completion rate
 * @apiSuccess {Number} emiAnalytics.defaultRate Default rate
 * @apiSuccess {Number} emiAnalytics.totalInterestEarned Total interest earned
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/emi-analytics"
 */
router.get(
    "/emi-analytics",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL),
    analyticsController.getEMIAnalytics
);

// ==========================================================================
// 7. 🚨 REAL-TIME MONITORING & ALERTS (Live monitoring)
// ==========================================================================

/**
 * @api {get} /api/v1/analytics/alerts/realtime Real-Time Monitoring Dashboard
 * @apiName GetRealTimeMonitoring
 * @apiGroup Analytics
 * @apiPermission analytics:view:alerts
 * @apiVersion 1.0.0
 * 
 * @apiDescription Real-time monitoring of system alerts, security events, and business metrics.
 * 
 * @apiQuery {String} [branchId] Filter by specific branch
 * @apiQuery {String="critical","warning","info"} [severity] Filter by alert severity
 * 
 * @apiSuccess {Object} alerts Categorized alerts by severity
 * @apiSuccess {Object} monitoring System health and performance
 * @apiSuccess {Object} security Security audit information
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/alerts/realtime?severity=critical"
 */
router.get(
    "/alerts/realtime",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS),
    analyticsController.getRealTimeMonitoring
);

/**
 * @api {get} /api/v1/analytics/critical-alerts Critical Alerts Summary
 * @apiName GetCriticalAlerts
 * @apiGroup Analytics
 * @apiPermission analytics:view:alerts
 * @apiVersion 1.0.0
 * 
 * @apiDescription Get summary of critical alerts including low stock and high-risk debtors.
 * 
 * @apiQuery {String} [branchId] Filter by specific branch
 * 
 * @apiSuccess {Number} lowStockCount Number of low stock items
 * @apiSuccess {Number} highRiskDebtCount Number of high-risk debtors
 * @apiSuccess {Array} itemsToReorder List of items needing reorder
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/critical-alerts"
 */
router.get(
    "/critical-alerts",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS),
    analyticsController.getCriticalAlerts
);

/**
 * @api {get} /api/v1/analytics/security-audit Security Audit Logs
 * @apiName GetSecurityAuditLog
 * @apiGroup Analytics
 * @apiPermission analytics:view:security_audit
 * @apiVersion 1.0.0
 * 
 * @apiDescription Security audit logs and risky actions monitoring.
 * 
 * @apiQuery {String} [startDate] Start date (YYYY-MM-DD)
 * @apiQuery {String} [endDate] End date (YYYY-MM-DD)
 * @apiQuery {String} [branchId] Filter by specific branch
 * 
 * @apiSuccess {Array} recentEvents Recent security events
 * @apiSuccess {Number} riskyActions Count of risky actions
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/security-audit?startDate=2024-01-01"
 */
router.get(
    "/security-audit",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT),
    analyticsController.getSecurityAuditLog
);

/**
 * @api {get} /api/v1/analytics/compliance-dashboard Compliance Dashboard
 * @apiName GetComplianceDashboard
 * @apiGroup Analytics
 * @apiPermission analytics:view:security_audit
 * @apiVersion 1.0.0
 * 
 * @apiDescription Tax compliance, security audit, and data health dashboard.
 * 
 * @apiQuery {String} [startDate] Start date (YYYY-MM-DD)
 * @apiQuery {String} [endDate] End date (YYYY-MM-DD)
 * @apiQuery {String} [branchId] Filter by specific branch
 * 
 * @apiSuccess {Object} tax Tax compliance status
 * @apiSuccess {Object} audit Security audit logs
 * @apiSuccess {Object} dataHealth Data integrity score and issues
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/compliance-dashboard"
 */
router.get(
    "/compliance-dashboard",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT),
    analyticsController.getComplianceDashboard
);

// ==========================================================================
// 8. 📊 DATA MANAGEMENT & EXPORT (Data export and custom queries)
// ==========================================================================

/**
 * @api {get} /api/v1/analytics/export Export Analytics Data
 * @apiName ExportAnalyticsData
 * @apiGroup Analytics
 * @apiPermission analytics:export:data
 * @apiVersion 1.0.0
 * 
 * @apiDescription Export analytics data in CSV format for external use.
 * 
 * @apiQuery {String="sales","inventory","customers"} type Data type to export
 * @apiQuery {String} [startDate] Start date for sales/customers export
 * @apiQuery {String} [endDate] End date for sales/customers export
 * @apiQuery {String} [format=csv] Export format (currently only CSV supported)
 * 
 * @apiSuccess {File} file CSV file download
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/export?type=sales&startDate=2024-01-01&format=csv" \
 *   -o sales_export.csv
 */
router.get(
    "/export",
    checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA),
    analyticsController.exportAnalyticsData
);

/**
 * @api {post} /api/v1/analytics/query Custom Analytics Query
 * @apiName CustomAnalyticsQuery
 * @apiGroup Analytics
 * @apiPermission analytics:export:data
 * @apiVersion 1.0.0
 * 
 * @apiDescription Execute custom analytics queries with flexible parameters and output formats.
 * 
 * @apiBody {String} queryType Type of query to execute
 * @apiBody {Object} [parameters] Query-specific parameters
 * @apiBody {String="json","csv"} [format=json] Output format
 * @apiBody {Number} [limit=1000] Maximum results to return
 * 
 * @apiParam (Query Types) {String} product_movement Product movement analysis
 * @apiParam (Query Types) {String} inventory_status Current inventory status
 * @apiParam (Query Types) {String} customer_analysis Customer LTV analysis
 * @apiParam (Query Types) {String} staff_performance Staff efficiency metrics
 * 
 * @apiSuccess {Object} query Query execution information
 * @apiSuccess {Array|Object} results Query results
 * @apiSuccess {Object} metadata Results metadata
 * 
 * @apiExample {curl} Example usage:
 * curl -X POST -H "Authorization: Bearer <token>" \
 *   -H "Content-Type: application/json" \
 *   -d '{"queryType":"customer_analysis","parameters":{"branchId":"65a1b2c3d4e5f67890123456"},"format":"csv"}' \
 *   "https://api.yourdomain.com/api/v1/analytics/query"
 */
router.post(
    "/query",
    checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA),
    analyticsController.customAnalyticsQuery
);

// ==========================================================================
// 9. ⚡ SYSTEM PERFORMANCE & HEALTH (Analytics system monitoring)
// ==========================================================================

/**
 * @api {get} /api/v1/analytics/performance Analytics System Performance
 * @apiName GetAnalyticsPerformance
 * @apiGroup Analytics
 * @apiPermission analytics:view:executive
 * @apiVersion 1.0.0
 * 
 * @apiDescription Monitor analytics system performance including response times and cache efficiency.
 * 
 * @apiQuery {Number} [hours=24] Hours of performance data to retrieve
 * 
 * @apiSuccess {Number} avgResponseTime Average response time in milliseconds
 * @apiSuccess {Number} errorRate Error rate percentage
 * @apiSuccess {Number} requestCount Total request count
 * @apiSuccess {Number} cacheHitRate Cache hit rate percentage
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/performance?hours=48"
 */
router.get(
    "/performance",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
    analyticsController.getAnalyticsPerformance
);

/**
 * @api {get} /api/v1/analytics/health/data Data Health Check
 * @apiName GetDataHealth
 * @apiGroup Analytics
 * @apiPermission analytics:view:executive
 * @apiVersion 1.0.0
 * 
 * @apiDescription Check data integrity and health across all analytics datasets.
 * 
 * @apiSuccess {Number} score Data health score (0-100)
 * @apiSuccess {Array} checks Individual health check results
 * @apiSuccess {Array} recommendations Performance improvement recommendations
 * 
 * @apiExample {curl} Example usage:
 * curl -H "Authorization: Bearer <token>" \
 *   "https://api.yourdomain.com/api/v1/analytics/health/data"
 */
router.get(
    "/health/data",
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
    analyticsController.getDataHealth
);

/* ==========================================================================
   🔍 SEARCH INDEX - Quick Reference
   ==========================================================================

   Financial Analytics:
   - /dashboard           - Comprehensive executive dashboard
   - /financials          - Financial metrics and cash flow
   - /branch-comparison   - Compare branch performance

   Customer Analytics:
   - /customer-intelligence - Complete customer insights
   - /customer-segmentation - RFM customer segments
   - /customer-ltv        - Lifetime value analysis
   - /churn-risk          - Customer churn prediction
   - /market-basket       - Products bought together
   - /payment-behavior    - Payment patterns analysis

   Inventory Analytics:
   - /inventory-health    - Complete inventory analysis
   - /product-performance - High margin and dead stock
   - /dead-stock          - Slow moving inventory
   - /stock-predictions   - Stock-out forecasting
   - /category-performance- Category-wise analysis
   - /supplier-performance- Supplier evaluation

   Operational Analytics:
   - /operational-metrics - Operational efficiency
   - /staff-performance   - Staff sales performance
   - /staff-attendance-performance - Attendance correlation
   - /peak-hours          - Business hour analysis
   - /time-analytics      - Time-based trends
   - /procurement         - Purchase analysis

   Predictive Analytics:
   - /forecast           - Sales forecasting
   - /predictive-analytics - Comprehensive predictions
   - /emi-analytics      - Credit sales analysis

   Monitoring & Alerts:
   - /alerts/realtime    - Real-time monitoring
   - /critical-alerts    - Critical business alerts
   - /security-audit     - Security logs
   - /compliance-dashboard - Compliance status

   Data Management:
   - /export             - Export data in CSV
   - /query              - Custom analytics queries

   System Health:
   - /performance        - Analytics system performance
   - /health/data        - Data integrity checks
   ========================================================================== */

router.get(
    '/redis-status',
    checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
    analyticsController.getRedisStatus
);
module.exports = router;





















































































































































// const express = require("express");
// const router = express.Router();
// const analyticsController = require("../../controllers/analyticsController");
// const authController = require("../../controllers/authController");
// const { checkPermission } = require("../../middleware/permissionMiddleware");
// const { PERMISSIONS } = require("../../config/permissions");

// // All analytics routes require authentication
// router.use(authController.protect);

// // ==========================================================================
// // 1. EXECUTIVE DASHBOARDS
// // ==========================================================================

// router.get(
//     "/dashboard",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
//     analyticsController.getDashboardOverview,
// );

// router.get(
//     "/branch-comparison",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_BRANCH_COMPARISON),
//     analyticsController.getBranchComparison,
// );

// // ==========================================================================
// // 2. FINANCIAL INTELLIGENCE SUITE
// // ==========================================================================

// router.get(
//     "/financials",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL),
//     analyticsController.getFinancialDashboard,
// );

// router.get(
//     "/cash-flow",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CASHFLOW),
//     analyticsController.getFinancialDashboard,
// );

// // ==========================================================================
// // 3. CUSTOMER INTELLIGENCE HUB
// // ==========================================================================

// router.get(
//     "/customer-intelligence",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION),
//     analyticsController.getCustomerIntelligence,
// );

// router.get(
//     "/customer-segmentation",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION),
//     analyticsController.getCustomerSegmentation,
// );

// router.get(
//     "/customer-ltv",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_LTV),
//     analyticsController.getCustomerLifetimeValue,
// );

// router.get(
//     "/churn-risk",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CHURN),
//     analyticsController.getChurnRiskAnalysis,
// );

// router.get(
//     "/market-basket",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_MARKET_BASKET),
//     analyticsController.getMarketBasketAnalysis,
// );

// router.get(
//     "/payment-behavior",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PAYMENT_BEHAVIOR),
//     analyticsController.getPaymentBehaviorStats,
// );

// router.get(
//     "/customer-insights",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_INSIGHTS),
//     analyticsController.getCustomerInsights,
// );

// // ==========================================================================
// // 4. INVENTORY INTELLIGENCE SUITE
// // ==========================================================================

// router.get(
//     "/inventory-health",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY),
//     analyticsController.getInventoryHealth,
// );

// router.get(
//     "/product-performance",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE),
//     analyticsController.getProductPerformance,
// );

// router.get(
//     "/dead-stock",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEAD_STOCK),
//     analyticsController.getDeadStockReport,
// );

// router.get(
//     "/stock-predictions",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_STOCK_FORECAST),
//     analyticsController.getStockOutPredictions,
// );

// router.get(
//     "/category-performance",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE),
//     analyticsController.getCategoryAnalytics,
// );

// router.get(
//     "/supplier-performance",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT),
//     analyticsController.getSupplierPerformance,
// );

// // ==========================================================================
// // 5. OPERATIONAL EXCELLENCE SUITE
// // ==========================================================================

// router.get(
//     "/operational-metrics",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
//     analyticsController.getOperationalMetrics,
// );

// router.get(
//     "/staff-performance",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE),
//     analyticsController.getStaffPerformance,
// );

// router.get(
//     "/staff-attendance-performance",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE),
//     analyticsController.getStaffAttendancePerformance,
// );

// router.get(
//     "/peak-hours",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PEAK_HOURS),
//     analyticsController.getPeakBusinessHours,
// );

// router.get(
//     "/time-analytics",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
//     analyticsController.getTimeBasedAnalytics,
// );

// router.get(
//     "/procurement",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT),
//     analyticsController.getProcurementAnalysis,
// );

// // ==========================================================================
// // 6. PREDICTIVE ANALYTICS & FORECASTING
// // ==========================================================================

// router.get(
//     "/forecast",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST),
//     analyticsController.getSalesForecast,
// );

// router.get(
//     "/predictive-analytics",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST),
//     analyticsController.getPredictiveAnalytics,
// );

// router.get(
//     "/emi-analytics",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL),
//     analyticsController.getEMIAnalytics,
// );

// // ==========================================================================
// // 7. REAL-TIME MONITORING & ALERTS
// // ==========================================================================

// router.get(
//     "/alerts/realtime",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS),
//     analyticsController.getRealTimeMonitoring,
// );

// router.get(
//     "/critical-alerts",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS),
//     analyticsController.getCriticalAlerts,
// );

// router.get(
//     "/security-audit",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT),
//     analyticsController.getSecurityAuditLog,
// );

// router.get(
//     "/compliance-dashboard",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT),
//     analyticsController.getComplianceDashboard,
// );

// // ==========================================================================
// // 8. DATA MANAGEMENT & EXPORT
// // ==========================================================================

// router.get(
//     "/export",
//     checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA),
//     analyticsController.exportAnalyticsData,
// );

// router.post(
//     "/query",
//     checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA),
//     analyticsController.customAnalyticsQuery,
// );

// // ==========================================================================
// // 9. SYSTEM PERFORMANCE & HEALTH
// // ==========================================================================

// router.get(
//     "/performance",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
//     analyticsController.getAnalyticsPerformance,
// );

// router.get(
//     "/health/data",
//     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
//     analyticsController.getDataHealth,
// );

// module.exports = router;

// // const express = require("express");
// // const router = express.Router();
// // const analyticsController = require("../../controllers/analyticsController");
// // const authController = require("../../controllers/authController");
// // const { checkPermission } = require("../../middleware/permissionMiddleware");
// // const { PERMISSIONS } = require("../../config/permissions");

// // // All analytics routes require authentication
// // router.use(authController.protect);

// // /**
// //  * UTILITY: Common Query Parameters
// //  * Most endpoints accept the following optional query params:
// //  * - startDate (YYYY-MM-DD): Filter start date (defaults to start of current month)
// //  * - endDate (YYYY-MM-DD): Filter end date (defaults to end of current day)
// //  * - branchId (ObjectId): Filter by specific branch (defaults to all branches in org)
// //  * - cache (boolean): Enable/disable caching (default: true)
// //  */

// // // ==========================================================================
// // // 1. EXECUTIVE DASHBOARDS
// // // ==========================================================================

// // /**
// //  * @route GET /api/v1/analytics/dashboard
// //  * @desc Comprehensive executive dashboard with all metrics
// //  */
// // router.get(
// //     "/dashboard",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
// //     analyticsController.getDashboardOverview,
// // );

// // /**
// //  * @route GET /api/v1/analytics/branch-comparison
// //  * @desc Branch performance comparison
// //  */
// // router.get(
// //     "/branch-comparison",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_BRANCH_COMPARISON),
// //     analyticsController.getBranchComparison,
// // );

// // // ==========================================================================
// // // 2. FINANCIAL INTELLIGENCE SUITE
// // // ==========================================================================

// // /**
// //  * @route GET /api/v1/analytics/financials
// //  * @desc Comprehensive financial dashboard
// //  */
// // router.get(
// //     "/financials",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL),
// //     analyticsController.getFinancialDashboard,
// // );

// // /**
// //  * @route GET /api/v1/analytics/profitability
// //  * @desc Profit margin analysis
// //  */
// // router.get(
// //     "/profitability",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROFITABILITY),
// //     analyticsController.getProfitabilityReport,
// // );

// // /**
// //  * @route GET /api/v1/analytics/cash-flow
// //  * @desc Cash flow analysis with projections
// //  */
// // router.get(
// //     "/cash-flow",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CASHFLOW),
// //     analyticsController.getCashFlowReport,
// // );

// // /**
// //  * @route GET /api/v1/analytics/debtor-aging
// //  * @desc Accounts receivable aging analysis
// //  */
// // router.get(
// //     "/debtor-aging",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEBTOR_AGING),

// //     analyticsController.getDebtorAgingReport,
// // );

// // /**
// //  * @route GET /api/v1/analytics/tax-report
// //  * @desc Tax compliance and liability analysis
// //  */
// // router.get(
// //     "/tax-report",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_TAX),
// //     analyticsController.getTaxReport,
// // );

// // // ==========================================================================
// // // 3. CUSTOMER INTELLIGENCE HUB
// // // ==========================================================================

// // /**
// //  * @route GET /api/v1/analytics/customer-intelligence
// //  * @desc Complete customer intelligence dashboard
// //  */
// // router.get(
// //     "/customer-intelligence",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION),
// //     analyticsController.getCustomerIntelligence,
// // );

// // /**
// //  * @route GET /api/v1/analytics/customer-segmentation
// //  * @desc Legacy customer segmentation endpoint
// //  */
// // router.get(
// //     "/customer-segmentation",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION),
// //     analyticsController.getCustomerSegmentation,
// // );

// // /**
// //  * @route GET /api/v1/analytics/customer-retention
// //  * @desc Customer retention and cohort analysis
// //  */
// // router.get(
// //     "/customer-retention",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_RETENTION),
// //     analyticsController.getCustomerRetention,
// // );

// // /**
// //  * @route GET /api/v1/analytics/customer-ltv
// //  * @desc Customer lifetime value analysis
// //  */
// // router.get(
// //     "/customer-ltv",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_LTV),
// //     analyticsController.getCustomerLifetimeValue,
// // );

// // /**
// //  * @route GET /api/v1/analytics/churn-risk
// //  * @desc Customer churn risk analysis
// //  */
// // router.get(
// //     "/churn-risk",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CHURN),
// //     analyticsController.getChurnRiskAnalysis,
// // );

// // /**
// //  * @route GET /api/v1/analytics/market-basket
// //  * @desc Market basket and cross-selling analysis
// //  */
// // router.get(
// //     "/market-basket",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_MARKET_BASKET),
// //     analyticsController.getMarketBasketAnalysis,
// // );

// // /**
// //  * @route GET /api/v1/analytics/payment-behavior
// //  * @desc Customer payment behavior analysis
// //  */
// // router.get(
// //     "/payment-behavior",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PAYMENT_BEHAVIOR),
// //     analyticsController.getPaymentBehaviorStats,
// // );

// // /**
// //  * @route GET /api/v1/analytics/customer-insights
// //  * @desc Customer risk and credit insights
// //  */
// // router.get(
// //     "/customer-insights",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_INSIGHTS),
// //     analyticsController.getCustomerInsights,
// // );

// // // ==========================================================================
// // // 4. INVENTORY INTELLIGENCE SUITE
// // // ==========================================================================

// // /**
// //  * @route GET /api/v1/analytics/inventory-health
// //  * @desc Complete inventory health dashboard
// //  */
// // router.get(
// //     "/inventory-health",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY),
// //     analyticsController.getInventoryHealth,
// // );

// // /**
// //  * @route GET /api/v1/analytics/inventory
// //  * @desc Legacy inventory endpoint
// //  */
// // router.get(
// //     "/inventory",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY),
// //     analyticsController.getInventoryReport,
// // );

// // /**
// //  * @route GET /api/v1/analytics/product-performance
// //  * @desc Product performance analysis
// //  */
// // router.get(
// //     "/product-performance",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE),
// //     analyticsController.getProductPerformance,
// // );

// // /**
// //  * @route GET /api/v1/analytics/dead-stock
// //  * @desc Dead stock and slow-moving inventory analysis
// //  */
// // router.get(
// //     "/dead-stock",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEAD_STOCK),
// //     analyticsController.getDeadStockReport,
// // );

// // /**
// //  * @route GET /api/v1/analytics/stock-predictions
// //  * @desc Stock-out predictions and replenishment
// //  */
// // router.get(
// //     "/stock-predictions",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_STOCK_FORECAST),
// //     analyticsController.getStockOutPredictions,
// // );

// // /**
// //  * @route GET /api/v1/analytics/category-performance
// //  * @desc Product category performance analysis
// //  */
// // router.get(
// //     "/category-performance",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE),
// //     analyticsController.getCategoryAnalytics,
// // );

// // /**
// //  * @route GET /api/v1/analytics/supplier-performance
// //  * @desc Supplier performance and procurement analysis
// //  */
// // router.get(
// //     "/supplier-performance",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT),
// //     analyticsController.getSupplierPerformance,
// // );

// // // ==========================================================================
// // // 5. OPERATIONAL EXCELLENCE SUITE
// // // ==========================================================================

// // /**
// //  * @route GET /api/v1/analytics/operational-metrics
// //  * @desc Comprehensive operational efficiency dashboard
// //  */
// // router.get(
// //     "/operational-metrics",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
// //     analyticsController.getOperationalMetrics,
// // );

// // /**
// //  * @route GET /api/v1/analytics/staff-performance
// //  * @desc Staff productivity and performance
// //  */
// // router.get(
// //     "/staff-performance",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE),
// //     analyticsController.getStaffPerformance,
// // );

// // /**
// //  * @route GET /api/v1/analytics/staff-attendance-performance
// //  * @desc Staff attendance and productivity correlation
// //  */
// // router.get(
// //     "/staff-attendance-performance",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE),
// //     analyticsController.getStaffAttendancePerformance,
// // );

// // /**
// //  * @route GET /api/v1/analytics/peak-hours
// //  * @desc Business hour analysis and staffing optimization
// //  */
// // router.get(
// //     "/peak-hours",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PEAK_HOURS),
// //     analyticsController.getPeakBusinessHours,
// // );

// // /**
// //  * @route GET /api/v1/analytics/time-analytics
// //  * @desc Time-based analytics (hourly, daily, monthly)
// //  */
// // router.get(
// //     "/time-analytics",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
// //     analyticsController.getTimeBasedAnalytics,
// // );

// // /**
// //  * @route GET /api/v1/analytics/procurement
// //  * @desc Procurement and supplier analysis
// //  */
// // router.get(
// //     "/procurement",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT),
// //     analyticsController.getProcurementAnalysis,
// // );

// // // ==========================================================================
// // // 6. PREDICTIVE ANALYTICS & FORECASTING
// // // ==========================================================================

// // /**
// //  * @route GET /api/v1/analytics/forecast
// //  * @desc Sales forecasting with confidence intervals
// //  */
// // router.get(
// //     "/forecast",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST),
// //     analyticsController.getSalesForecast,
// // );

// // /**
// //  * @route GET /api/v1/analytics/predictive-analytics
// //  * @desc Comprehensive predictive analytics suite
// //  */
// // router.get(
// //     "/predictive-analytics",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST),
// //     analyticsController.getPredictiveAnalytics,
// // );

// // /**
// //  * @route GET /api/v1/analytics/emi-analytics
// //  * @desc EMI and credit sales analysis
// //  */
// // router.get(
// //     "/emi-analytics",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL),
// //     analyticsController.getEMIAnalytics,
// // );

// // // ==========================================================================
// // // 7. REAL-TIME MONITORING & ALERTS
// // // ==========================================================================

// // /**
// //  * @route GET /api/v1/analytics/alerts/realtime
// //  * @desc Real-time monitoring dashboard
// //  */
// // router.get(
// //     "/alerts/realtime",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS),
// //     analyticsController.getRealTimeMonitoring,
// // );

// // /**
// //  * @route GET /api/v1/analytics/critical-alerts
// //  * @desc Critical alerts summary
// //  */
// // router.get(
// //     "/critical-alerts",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS),
// //     analyticsController.getCriticalAlerts,
// // );

// // /**
// //  * @route GET /api/v1/analytics/security-audit
// //  * @desc Security audit logs and compliance
// //  */
// // router.get(
// //     "/security-audit",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT),
// //     analyticsController.getSecurityAuditLog,
// // );

// // /**
// //  * @route GET /api/v1/analytics/compliance-dashboard
// //  * @desc Compliance and regulatory dashboard
// //  */
// // router.get(
// //     "/compliance-dashboard",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT),
// //     analyticsController.getComplianceDashboard,
// // );

// // // ==========================================================================
// // // 8. DATA MANAGEMENT & EXPORT
// // // ==========================================================================

// // /**
// //  * @route GET /api/v1/analytics/export
// //  * @desc Export analytics data in multiple formats
// //  */
// // router.get(
// //     "/export",
// //     checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA),
// //     analyticsController.exportAnalyticsData,
// // );

// // /**
// //  * @route POST /api/v1/analytics/query
// //  * @desc Custom analytics query builder
// //  */
// // router.post(
// //     "/query",
// //     checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA),
// //     analyticsController.customAnalyticsQuery,
// // );

// // /**
// //  * @route POST /api/v1/analytics/custom-query
// //  * @desc Legacy custom query endpoint
// //  */
// // router.post(
// //     "/custom-query",
// //     checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA),
// //     analyticsController.customQuery,
// // );

// // // ==========================================================================
// // // 9. SYSTEM PERFORMANCE & HEALTH
// // // ==========================================================================

// // /**
// //  * @route GET /api/v1/analytics/performance
// //  * @desc Analytics system performance metrics
// //  */
// // router.get(
// //     "/performance",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
// //     analyticsController.getAnalyticsPerformance,
// // );

// // /**
// //  * @route GET /api/v1/analytics/health/data
// //  * @desc Data integrity and health check
// //  */
// // router.get(
// //     "/health/data",
// //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
// //     analyticsController.getDataHealth,
// // );

// // module.exports = router;

// // // const express = require("express");
// // // const router = express.Router();
// // // const analyticsController = require("../../controllers/analyticsController");
// // // const authController = require("../../controllers/authController");
// // // const { checkPermission } = require("../../middleware/permissionMiddleware");
// // // const { PERMISSIONS } = require("../../config/permissions");

// // // // All analytics routes require authentication
// // // router.use(authController.protect);

// // // /**
// // //  * UTILITY: Common Query Parameters
// // //  * Most endpoints accept the following optional query params:
// // //  * - startDate (YYYY-MM-DD): Filter start date (defaults to start of current month)
// // //  * - endDate (YYYY-MM-DD): Filter end date (defaults to end of current day)
// // //  * - branchId (ObjectId): Filter by specific branch (defaults to all branches in org)
// // //  */

// // // // ==========================================================================
// // // // 1. EXECUTIVE & STRATEGIC
// // // // ==========================================================================

// // // router.get(
// // //     "/dashboard",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
// // //     analyticsController.getDashboardOverview,
// // // );

// // // router.get(
// // //     "/branch-comparison",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_BRANCH_COMPARISON),
// // //     analyticsController.getBranchComparison,
// // // );

// // // // ==========================================================================
// // // // 2. FINANCIAL INTELLIGENCE
// // // // ==========================================================================

// // // // Both endpoints point to the same function
// // // router.get(
// // //     "/financials",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL),
// // //     analyticsController.getFinancialDashboard,
// // // );

// // // router.get(
// // //     "/profitability",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROFITABILITY),
// // //     analyticsController.getProfitabilityReport,
// // // );

// // // router.get(
// // //     "/cash-flow",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CASHFLOW),
// // //     analyticsController.getCashFlowReport,
// // // );

// // // router.get(
// // //     "/debtor-aging",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEBTOR_AGING),
// // //     analyticsController.getDebtorAgingReport,
// // // );

// // // router.get(
// // //     "/tax-report",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_TAX),
// // //     analyticsController.getTaxReport,
// // // );

// // // // ==========================================================================
// // // // 3. OPERATIONAL & STAFF EFFICIENCY
// // // // ==========================================================================

// // // router.get(
// // //     "/staff-performance",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE),
// // //     analyticsController.getStaffPerformance,
// // // );

// // // router.get(
// // //     "/operational-metrics",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
// // //     analyticsController.getOperationalMetrics,
// // // );

// // // router.get(
// // //     "/peak-hours",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PEAK_HOURS),
// // //     analyticsController.getPeakBusinessHours,
// // // );

// // // router.get(
// // //     "/procurement",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT),
// // //     analyticsController.getProcurementAnalysis,
// // // );

// // // router.get(
// // //     "/customer-insights",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_INSIGHTS),
// // //     analyticsController.getCustomerInsights,
// // // );

// // // // ==========================================================================
// // // // 4. INVENTORY INTELLIGENCE
// // // // ==========================================================================

// // // // Both endpoints point to the same function
// // // router.get(
// // //     "/inventory",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY),
// // //     analyticsController.getInventoryReport,
// // // );

// // // router.get(
// // //     "/product-performance",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE),
// // //     analyticsController.getProductPerformance,
// // // );

// // // router.get(
// // //     "/dead-stock",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEAD_STOCK),
// // //     analyticsController.getDeadStockReport,
// // // );

// // // router.get(
// // //     "/stock-predictions",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_STOCK_FORECAST),
// // //     analyticsController.getStockOutPredictions,
// // // );

// // // // ==========================================================================
// // // // 5. PREDICTIVE & ADVANCED
// // // // ==========================================================================

// // // // Both endpoints point to the same function
// // // router.get(
// // //     "/forecast",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST),
// // //     analyticsController.getSalesForecast,
// // // );

// // // router.get(
// // //     "/customer-segmentation",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION),
// // //     analyticsController.getCustomerSegmentation,
// // // );

// // // router.get(
// // //     "/customer-retention",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_RETENTION),
// // //     analyticsController.getCustomerRetention,
// // // );

// // // router.get(
// // //     "/critical-alerts",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS),
// // //     analyticsController.getCriticalAlerts,
// // // );

// // // // ==========================================================================
// // // // 6. CUSTOMER 360 INTELLIGENCE
// // // // ==========================================================================

// // // router.get(
// // //     "/customer-ltv",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_LTV),
// // //     analyticsController.getCustomerLifetimeValue,
// // // );

// // // router.get(
// // //     "/churn-risk",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CHURN),
// // //     analyticsController.getChurnRiskAnalysis,
// // // );

// // // router.get(
// // //     "/market-basket",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_MARKET_BASKET),
// // //     analyticsController.getMarketBasketAnalysis,
// // // );

// // // router.get(
// // //     "/payment-behavior",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PAYMENT_BEHAVIOR),
// // //     analyticsController.getPaymentBehaviorStats,
// // // );

// // // // ==========================================================================
// // // // 7. SECURITY & EXPORT
// // // // ==========================================================================

// // // router.get(
// // //     "/security-audit",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT),
// // //     analyticsController.getSecurityAuditLog,
// // // );

// // // router.get(
// // //     "/export",
// // //     checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA),
// // //     analyticsController.exportAnalyticsData,
// // // );

// // // // ==========================================================================
// // // // 8. ADVANCED ENDPOINTS (Optional - can be enabled later)
// // // // ==========================================================================

// // // // Optional endpoints - comment out if not needed yet
// // // router.get(
// // //     "/customer-intelligence",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION),
// // //     analyticsController.getCustomerIntelligence,
// // // );

// // // router.get(
// // //     "/inventory-health",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY),
// // //     analyticsController.getInventoryHealth,
// // // );

// // // router.get(
// // //     "/alerts/realtime",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS),
// // //     analyticsController.getSystemAlerts,
// // // );

// // // router.post(
// // //     "/query",
// // //     checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA),
// // //     analyticsController.customQuery,
// // // );

// // // router.get(
// // //     "/performance",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
// // //     analyticsController.getAnalyticsPerformance,
// // // );

// // // router.get(
// // //     "/health/data",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
// // //     analyticsController.getDataHealth,
// // // );

// // // /* ==========================================================================
// // //    NEW ROUTES TO ADD TO YOUR ANALYTICS ROUTES
// // //    ========================================================================== */

// // // // Add these to your routes file:

// // // router.get(
// // //     "/staff-attendance-performance",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE),
// // //     analyticsController.getStaffAttendancePerformance,
// // // );

// // // router.get(
// // //     "/category-performance",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE),
// // //     analyticsController.getCategoryAnalytics,
// // // );

// // // router.get(
// // //     "/supplier-performance",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT),
// // //     analyticsController.getSupplierPerformance,
// // // );

// // // router.get(
// // //     "/emi-analytics",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL),
// // //     analyticsController.getEMIAnalytics,
// // // );

// // // router.get(
// // //     "/time-analytics",
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
// // //     analyticsController.getTimeBasedAnalytics,
// // // );

// // // module.exports = router;
// // // const express = require('express');
// // // const router = express.Router();
// // // const analyticsController = require('../../controllers/analyticsController');
// // // const authController = require('../../controllers/authController');
// // // const { checkPermission } = require("../../middleware/permissionMiddleware");
// // // const { PERMISSIONS } = require("../../config/permissions");

// // // // All analytics routes require authentication
// // // router.use(authController.protect);

// // // /**
// // //  * UTILITY: Common Query Parameters
// // //  * Most endpoints accept the following optional query params:
// // //  * - startDate (YYYY-MM-DD): Filter start date (defaults to start of current month)
// // //  * - endDate (YYYY-MM-DD): Filter end date (defaults to end of current day)
// // //  * - branchId (ObjectId): Filter by specific branch (defaults to all branches in org)
// // //  * - cache (boolean): Enable/disable caching (default: true)
// // //  */

// // // // ==========================================================================
// // // // 1. SMART EXECUTIVE DASHBOARDS
// // // // ==========================================================================

// // // /**
// // //  * @route GET /api/v1/analytics/dashboard
// // //  * @desc Get executive dashboard with all key metrics, charts, and insights
// // //  * @access Analytics - View Executive
// // //  * @params startDate, endDate, branchId, cache
// // //  */
// // // router.get(
// // //     '/dashboard',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
// // //     analyticsController.getDashboardOverview
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/branch-comparison
// // //  * @desc Compare performance across all branches
// // //  * @access Analytics - View Branch Comparison
// // //  * @params startDate, endDate, groupBy (revenue|efficiency), limit
// // //  */
// // // router.get(
// // //     '/branch-comparison',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_BRANCH_COMPARISON),
// // //     analyticsController.getBranchComparison
// // // );

// // // // ==========================================================================
// // // // 2. ENHANCED FINANCIAL INTELLIGENCE
// // // // ==========================================================================

// // // /**
// // //  * @route GET /api/v1/analytics/financials
// // //  * @desc Comprehensive financial dashboard with trends and recommendations
// // //  * @access Analytics - View Financial
// // //  * @params startDate, endDate, branchId, interval (auto|day|week|month|year), metrics (all|revenue|expenses|profit)
// // //  */
// // // router.get(
// // //     '/financials',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL),
// // //     analyticsController.getFinancialDashboard
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/cash-flow
// // //  * @desc Detailed cash flow analysis with projections
// // //  * @access Analytics - View Cashflow
// // //  * @params startDate, endDate, branchId, projectionDays
// // //  */
// // // router.get(
// // //     '/cash-flow',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CASHFLOW),
// // //     analyticsController.getCashFlowReport
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/profitability
// // //  * @desc Gross profit analysis with margin breakdown
// // //  * @access Analytics - View Profitability
// // //  * @params startDate, endDate, branchId
// // //  */
// // // router.get(
// // //     '/profitability',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROFITABILITY),
// // //     analyticsController.getProfitabilityReport
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/tax-report
// // //  * @desc Tax liability and compliance analysis
// // //  * @access Analytics - View Tax
// // //  * @params startDate, endDate, branchId
// // //  */
// // // router.get(
// // //     '/tax-report',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_TAX),
// // //     analyticsController.getTaxReport
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/debtor-aging
// // //  * @desc Aging analysis of accounts receivable
// // //  * @access Analytics - View Debtor Aging
// // //  * @params branchId
// // //  */
// // // router.get(
// // //     '/debtor-aging',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEBTOR_AGING),
// // //     analyticsController.getDebtorAgingReport
// // // );

// // // // ==========================================================================
// // // // 3. ADVANCED OPERATIONAL INTELLIGENCE
// // // // ==========================================================================

// // // /**
// // //  * @route GET /api/v1/analytics/staff-performance
// // //  * @desc Staff productivity and performance metrics
// // //  * @access Analytics - View Staff Performance
// // //  * @params startDate, endDate, branchId, minSales, sortBy (revenue|productivity|orders)
// // //  */
// // // router.get(
// // //     '/staff-performance',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE),
// // //     analyticsController.getStaffPerformance
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/operational-metrics
// // //  * @desc Comprehensive operational efficiency dashboard
// // //  * @access Analytics - View Operational
// // //  * @params startDate, endDate, branchId, includeDetails
// // //  */
// // // router.get(
// // //     '/operational-metrics',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
// // //     analyticsController.getOperationalMetrics
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/peak-hours
// // //  * @desc Business hour heatmap and staffing recommendations
// // //  * @access Analytics - View Peak Hours
// // //  * @params branchId
// // //  */
// // // router.get(
// // //     '/peak-hours',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PEAK_HOURS),
// // //     analyticsController.getPeakBusinessHours
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/procurement
// // //  * @desc Supplier analysis and procurement optimization
// // //  * @access Analytics - View Procurement
// // //  * @params startDate, endDate, branchId
// // //  */
// // // router.get(
// // //     '/procurement',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT),
// // //     analyticsController.getProcurementAnalysis
// // // );

// // // // ==========================================================================
// // // // 4. INTELLIGENT INVENTORY MANAGEMENT
// // // // ==========================================================================

// // // /**
// // //  * @route GET /api/v1/analytics/inventory/health
// // //  * @desc Complete inventory health dashboard with alerts and recommendations
// // //  * @access Analytics - View Inventory
// // //  * @params branchId, includeValuation, includePredictions
// // //  */
// // // router.get(
// // //     '/inventory/health',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY),
// // //     analyticsController.getInventoryHealth
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/inventory/performance
// // //  * @desc Product performance by revenue, margin, and volume
// // //  * @access Analytics - View Product Performance
// // //  * @params branchId, period (7d|30d|90d|365d)
// // //  */
// // // router.get(
// // //     '/inventory/performance',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE),
// // //     analyticsController.getProductPerformance
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/inventory/dead-stock
// // //  * @desc Identify slow-moving and non-moving inventory
// // //  * @access Analytics - View Dead Stock
// // //  * @params branchId, daysThreshold
// // //  */
// // // router.get(
// // //     '/inventory/dead-stock',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEAD_STOCK),
// // //     analyticsController.getDeadStockReport
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/inventory/predictions
// // //  * @desc Stock-out predictions and replenishment recommendations
// // //  * @access Analytics - View Stock Forecast
// // //  * @params branchId
// // //  */
// // // router.get(
// // //     '/inventory/predictions',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_STOCK_FORECAST),
// // //     analyticsController.getStockOutPredictions
// // // );

// // // // ==========================================================================
// // // // 5. PREDICTIVE ANALYTICS & FORECASTING
// // // // ==========================================================================

// // // /**
// // //  * @route GET /api/v1/analytics/forecast/sales
// // //  * @desc AI-powered sales forecasting with confidence intervals
// // //  * @access Analytics - View Forecast
// // //  * @params branchId, periods, confidence
// // //  */
// // // router.get(
// // //     '/forecast/sales',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST),
// // //     analyticsController.getSalesForecast
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/customers/intelligence
// // //  * @desc Complete customer intelligence hub with segmentation and LTV
// // //  * @access Analytics - View Customer Segmentation
// // //  * @params branchId, includeSegments, includeChurn
// // //  */
// // // router.get(
// // //     '/customers/intelligence',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION),
// // //     analyticsController.getCustomerIntelligence
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/customers/retention
// // //  * @desc Cohort analysis and retention metrics
// // //  * @access Analytics - View Customer Retention
// // //  * @params months
// // //  */
// // // router.get(
// // //     '/customers/retention',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_RETENTION),
// // //     analyticsController.getCustomerRetention
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/customers/insights
// // //  * @desc Customer risk analysis and credit insights
// // //  * @access Analytics - View Customer Insights
// // //  * @params branchId
// // //  */
// // // router.get(
// // //     '/customers/insights',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_INSIGHTS),
// // //     analyticsController.getCustomerInsights
// // // );

// // // // ==========================================================================
// // // // 6. ADVANCED CUSTOMER INTELLIGENCE
// // // // ==========================================================================

// // // /**
// // //  * @route GET /api/v1/analytics/customers/ltv
// // //  * @desc Customer Lifetime Value calculation and ranking
// // //  * @access Analytics - View Customer LTV
// // //  * @params branchId
// // //  */
// // // router.get(
// // //     '/customers/ltv',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_LTV),
// // //     analyticsController.getCustomerLifetimeValue
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/customers/churn-risk
// // //  * @desc Predictive churn risk analysis
// // //  * @access Analytics - View Churn
// // //  * @params daysThreshold
// // //  */
// // // router.get(
// // //     '/customers/churn-risk',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CHURN),
// // //     analyticsController.getChurnRiskAnalysis
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/customers/market-basket
// // //  * @desc Market basket analysis for cross-selling opportunities
// // //  * @access Analytics - View Market Basket
// // //  * @params minSupport
// // //  */
// // // router.get(
// // //     '/customers/market-basket',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_MARKET_BASKET),
// // //     analyticsController.getMarketBasketAnalysis
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/customers/payment-behavior
// // //  * @desc Customer payment habits and credit risk assessment
// // //  * @access Analytics - View Payment Behavior
// // //  * @params branchId
// // //  */
// // // router.get(
// // //     '/customers/payment-behavior',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PAYMENT_BEHAVIOR),
// // //     analyticsController.getPaymentBehaviorStats
// // // );

// // // // ==========================================================================
// // // // 7. REAL-TIME MONITORING & ALERTS
// // // // ==========================================================================

// // // /**
// // //  * @route GET /api/v1/analytics/alerts/realtime
// // //  * @desc Real-time system alerts and notifications
// // //  * @access Analytics - View Alerts
// // //  * @params branchId, severity (critical|warning|info), limit
// // //  */
// // // router.get(
// // //     '/alerts/realtime',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS),
// // //     analyticsController.getSystemAlerts
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/alerts/critical
// // //  * @desc Critical alerts summary across all departments
// // //  * @access Analytics - View Alerts
// // //  * @params branchId
// // //  */
// // // router.get(
// // //     '/alerts/critical',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS),
// // //     analyticsController.getCriticalAlerts
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/security/audit
// // //  * @desc Security audit logs and risk assessment
// // //  * @access Analytics - View Security Audit
// // //  * @params startDate, endDate
// // //  */
// // // router.get(
// // //     '/security/audit',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT),
// // //     analyticsController.getSecurityAuditLog
// // // );

// // // // ==========================================================================
// // // // 8. ADVANCED EXPORT & DATA MANAGEMENT
// // // // ==========================================================================

// // // /**
// // //  * @route GET /api/v1/analytics/export
// // //  * @desc Export analytics data in multiple formats
// // //  * @access Analytics - Export Data
// // //  * @params type (sales|inventory|customers|financial), format (csv|excel|pdf|json), compression, columns
// // //  */
// // // router.get(
// // //     '/export',
// // //     checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA),
// // //     analyticsController.exportAnalyticsData
// // // );

// // // /**
// // //  * @route POST /api/v1/analytics/query
// // //  * @desc Custom analytics query builder (for advanced users)
// // //  * @access Analytics - Export Data
// // //  * @body {query: string, parameters: object, limit: number}
// // //  */
// // // router.post(
// // //     '/query',
// // //     checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA),
// // //     analyticsController.customQuery
// // // );

// // // // ==========================================================================
// // // // 9. SYSTEM PERFORMANCE & HEALTH
// // // // ==========================================================================

// // // /**
// // //  * @route GET /api/v1/analytics/performance
// // //  * @desc Analytics system performance metrics
// // //  * @access Analytics - View Executive
// // //  * @params hours (default: 24)
// // //  */
// // // router.get(
// // //     '/performance',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
// // //     analyticsController.getAnalyticsPerformance
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/health/data
// // //  * @desc Data integrity and health check
// // //  * @access Analytics - View Executive
// // //  * @params none
// // //  */
// // // router.get(
// // //     '/health/data',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
// // //     analyticsController.getDataHealth
// // // );

// // // // ==========================================================================
// // // // 10. LEGACY ENDPOINTS (For backward compatibility)
// // // // ==========================================================================

// // // /**
// // //  * @route GET /api/v1/analytics/inventory
// // //  * @desc Legacy inventory endpoint - redirects to /inventory/health
// // //  * @access Analytics - View Inventory
// // //  * @params branchId
// // //  */
// // // router.get(
// // //     '/inventory',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY),
// // //     analyticsController.getInventoryReport
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/product-performance
// // //  * @desc Legacy product performance endpoint
// // //  * @access Analytics - View Product Performance
// // //  * @params branchId
// // //  */
// // // router.get(
// // //     '/product-performance',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE),
// // //     analyticsController.getProductPerformance
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/forecast
// // //  * @desc Legacy forecast endpoint
// // //  * @access Analytics - View Forecast
// // //  * @params branchId
// // //  */
// // // router.get(
// // //     '/forecast',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST),
// // //     analyticsController.getSalesForecast
// // // );

// // // /**
// // //  * @route GET /api/v1/analytics/customer-segmentation
// // //  * @desc Legacy customer segmentation endpoint
// // //  * @access Analytics - View Customer Segmentation
// // //  * @params none
// // //  */
// // // router.get(
// // //     '/customer-segmentation',
// // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION),
// // //     analyticsController.getCustomerSegmentation
// // // );

// // // module.exports = router;

// // // // const express = require('express');
// // // // const router = express.Router();
// // // // const analyticsController = require('../../controllers/analyticsController');
// // // // const authController = require('../../controllers/authController');
// // // // const { checkPermission } = require("../../middleware/permissionMiddleware");
// // // // const { PERMISSIONS } = require("../../config/permissions");

// // // // // All analytics routes require authentication
// // // // router.use(authController.protect);

// // // // /**
// // // //  * UTILITY: Common Query Parameters
// // // //  * Most endpoints accept the following optional query params:
// // // //  * - startDate (YYYY-MM-DD): Filter start date (defaults to start of current month)
// // // //  * - endDate (YYYY-MM-DD): Filter end date (defaults to end of current day)
// // // //  * - branchId (ObjectId): Filter by specific branch (defaults to all branches in org)
// // // //  * - cache (boolean): Enable/disable caching (default: true)
// // // //  */

// // // // // ==========================================================================
// // // // // 1. SMART EXECUTIVE DASHBOARDS
// // // // // ==========================================================================

// // // // /**
// // // //  * @route GET /api/v1/analytics/dashboard
// // // //  * @desc Get executive dashboard with all key metrics, charts, and insights
// // // //  * @access Analytics - View Executive
// // // //  * @params startDate, endDate, branchId, cache
// // // //  */
// // // // router.get(
// // // //     '/dashboard',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
// // // //     analyticsController.getDashboardOverview
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/branch-comparison
// // // //  * @desc Compare performance across all branches
// // // //  * @access Analytics - View Branch Comparison
// // // //  * @params startDate, endDate, groupBy (revenue|efficiency), limit
// // // //  */
// // // // router.get(
// // // //     '/branch-comparison',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_BRANCH_COMPARISON),
// // // //     analyticsController.getBranchComparison
// // // // );

// // // // // ==========================================================================
// // // // // 2. ENHANCED FINANCIAL INTELLIGENCE
// // // // // ==========================================================================

// // // // /**
// // // //  * @route GET /api/v1/analytics/financials
// // // //  * @desc Comprehensive financial dashboard with trends and recommendations
// // // //  * @access Analytics - View Financial
// // // //  * @params startDate, endDate, branchId, interval (auto|day|week|month|year), metrics (all|revenue|expenses|profit)
// // // //  */
// // // // router.get(
// // // //     '/financials',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL),
// // // //     analyticsController.getFinancialDashboard
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/cash-flow
// // // //  * @desc Detailed cash flow analysis with projections
// // // //  * @access Analytics - View Cashflow
// // // //  * @params startDate, endDate, branchId, projectionDays
// // // //  */
// // // // router.get(
// // // //     '/cash-flow',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CASHFLOW),
// // // //     analyticsController.getCashFlowReport
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/profitability
// // // //  * @desc Gross profit analysis with margin breakdown
// // // //  * @access Analytics - View Profitability
// // // //  * @params startDate, endDate, branchId
// // // //  */
// // // // router.get(
// // // //     '/profitability',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROFITABILITY),
// // // //     analyticsController.getProfitabilityReport
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/tax-report
// // // //  * @desc Tax liability and compliance analysis
// // // //  * @access Analytics - View Tax
// // // //  * @params startDate, endDate, branchId
// // // //  */
// // // // router.get(
// // // //     '/tax-report',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_TAX),
// // // //     analyticsController.getTaxReport
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/debtor-aging
// // // //  * @desc Aging analysis of accounts receivable
// // // //  * @access Analytics - View Debtor Aging
// // // //  * @params branchId
// // // //  */
// // // // router.get(
// // // //     '/debtor-aging',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEBTOR_AGING),
// // // //     analyticsController.getDebtorAgingReport
// // // // );

// // // // // ==========================================================================
// // // // // 3. ADVANCED OPERATIONAL INTELLIGENCE
// // // // // ==========================================================================

// // // // /**
// // // //  * @route GET /api/v1/analytics/staff-performance
// // // //  * @desc Staff productivity and performance metrics
// // // //  * @access Analytics - View Staff Performance
// // // //  * @params startDate, endDate, branchId, minSales, sortBy (revenue|productivity|orders)
// // // //  */
// // // // router.get(
// // // //     '/staff-performance',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE),
// // // //     analyticsController.getStaffPerformance
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/operational-metrics
// // // //  * @desc Comprehensive operational efficiency dashboard
// // // //  * @access Analytics - View Operational
// // // //  * @params startDate, endDate, branchId, includeDetails
// // // //  */
// // // // router.get(
// // // //     '/operational-metrics',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
// // // //     analyticsController.getOperationalMetrics
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/peak-hours
// // // //  * @desc Business hour heatmap and staffing recommendations
// // // //  * @access Analytics - View Peak Hours
// // // //  * @params branchId
// // // //  */
// // // // router.get(
// // // //     '/peak-hours',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PEAK_HOURS),
// // // //     analyticsController.getPeakBusinessHours
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/procurement
// // // //  * @desc Supplier analysis and procurement optimization
// // // //  * @access Analytics - View Procurement
// // // //  * @params startDate, endDate, branchId
// // // //  */
// // // // router.get(
// // // //     '/procurement',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT),
// // // //     analyticsController.getProcurementAnalysis
// // // // );

// // // // // ==========================================================================
// // // // // 4. INTELLIGENT INVENTORY MANAGEMENT
// // // // // ==========================================================================

// // // // /**
// // // //  * @route GET /api/v1/analytics/inventory/health
// // // //  * @desc Complete inventory health dashboard with alerts and recommendations
// // // //  * @access Analytics - View Inventory
// // // //  * @params branchId, includeValuation, includePredictions
// // // //  */
// // // // router.get(
// // // //     '/inventory/health',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY),
// // // //     analyticsController.getInventoryHealth
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/inventory/performance
// // // //  * @desc Product performance by revenue, margin, and volume
// // // //  * @access Analytics - View Product Performance
// // // //  * @params branchId, period (7d|30d|90d|365d)
// // // //  */
// // // // router.get(
// // // //     '/inventory/performance',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE),
// // // //     analyticsController.getProductPerformance
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/inventory/dead-stock
// // // //  * @desc Identify slow-moving and non-moving inventory
// // // //  * @access Analytics - View Dead Stock
// // // //  * @params branchId, daysThreshold
// // // //  */
// // // // router.get(
// // // //     '/inventory/dead-stock',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEAD_STOCK),
// // // //     analyticsController.getDeadStockReport
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/inventory/predictions
// // // //  * @desc Stock-out predictions and replenishment recommendations
// // // //  * @access Analytics - View Stock Forecast
// // // //  * @params branchId
// // // //  */
// // // // router.get(
// // // //     '/inventory/predictions',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_STOCK_FORECAST),
// // // //     analyticsController.getStockOutPredictions
// // // // );

// // // // // ==========================================================================
// // // // // 5. PREDICTIVE ANALYTICS & FORECASTING
// // // // // ==========================================================================

// // // // /**
// // // //  * @route GET /api/v1/analytics/forecast/sales
// // // //  * @desc AI-powered sales forecasting with confidence intervals
// // // //  * @access Analytics - View Forecast
// // // //  * @params branchId, periods, confidence
// // // //  */
// // // // router.get(
// // // //     '/forecast/sales',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST),
// // // //     analyticsController.getSalesForecast
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/customers/intelligence
// // // //  * @desc Complete customer intelligence hub with segmentation and LTV
// // // //  * @access Analytics - View Customer Segmentation
// // // //  * @params branchId, includeSegments, includeChurn
// // // //  */
// // // // router.get(
// // // //     '/customers/intelligence',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION),
// // // //     analyticsController.getCustomerIntelligence
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/customers/retention
// // // //  * @desc Cohort analysis and retention metrics
// // // //  * @access Analytics - View Customer Retention
// // // //  * @params months
// // // //  */
// // // // router.get(
// // // //     '/customers/retention',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_RETENTION),
// // // //     analyticsController.getCustomerRetention
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/customers/insights
// // // //  * @desc Customer risk analysis and credit insights
// // // //  * @access Analytics - View Customer Insights
// // // //  * @params branchId
// // // //  */
// // // // router.get(
// // // //     '/customers/insights',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_INSIGHTS),
// // // //     analyticsController.getCustomerInsights
// // // // );

// // // // // ==========================================================================
// // // // // 6. ADVANCED CUSTOMER INTELLIGENCE
// // // // // ==========================================================================

// // // // /**
// // // //  * @route GET /api/v1/analytics/customers/ltv
// // // //  * @desc Customer Lifetime Value calculation and ranking
// // // //  * @access Analytics - View Customer LTV
// // // //  * @params branchId
// // // //  */
// // // // router.get(
// // // //     '/customers/ltv',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_LTV),
// // // //     analyticsController.getCustomerLifetimeValue
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/customers/churn-risk
// // // //  * @desc Predictive churn risk analysis
// // // //  * @access Analytics - View Churn
// // // //  * @params daysThreshold
// // // //  */
// // // // router.get(
// // // //     '/customers/churn-risk',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CHURN),
// // // //     analyticsController.getChurnRiskAnalysis
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/customers/market-basket
// // // //  * @desc Market basket analysis for cross-selling opportunities
// // // //  * @access Analytics - View Market Basket
// // // //  * @params minSupport
// // // //  */
// // // // router.get(
// // // //     '/customers/market-basket',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_MARKET_BASKET),
// // // //     analyticsController.getMarketBasketAnalysis
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/customers/payment-behavior
// // // //  * @desc Customer payment habits and credit risk assessment
// // // //  * @access Analytics - View Payment Behavior
// // // //  * @params branchId
// // // //  */
// // // // router.get(
// // // //     '/customers/payment-behavior',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PAYMENT_BEHAVIOR),
// // // //     analyticsController.getPaymentBehaviorStats
// // // // );

// // // // // ==========================================================================
// // // // // 7. REAL-TIME MONITORING & ALERTS
// // // // // ==========================================================================

// // // // /**
// // // //  * @route GET /api/v1/analytics/alerts/realtime
// // // //  * @desc Real-time system alerts and notifications
// // // //  * @access Analytics - View Alerts
// // // //  * @params branchId, severity (critical|warning|info), limit
// // // //  */
// // // // router.get(
// // // //     '/alerts/realtime',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS),
// // // //     analyticsController.getSystemAlerts
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/alerts/critical
// // // //  * @desc Critical alerts summary across all departments
// // // //  * @access Analytics - View Alerts
// // // //  * @params branchId
// // // //  */
// // // // router.get(
// // // //     '/alerts/critical',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS),
// // // //     analyticsController.getCriticalAlerts
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/security/audit
// // // //  * @desc Security audit logs and risk assessment
// // // //  * @access Analytics - View Security Audit
// // // //  * @params startDate, endDate
// // // //  */
// // // // router.get(
// // // //     '/security/audit',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT),
// // // //     analyticsController.getSecurityAuditLog
// // // // );

// // // // // ==========================================================================
// // // // // 8. ADVANCED EXPORT & DATA MANAGEMENT
// // // // // ==========================================================================

// // // // /**
// // // //  * @route GET /api/v1/analytics/export
// // // //  * @desc Export analytics data in multiple formats
// // // //  * @access Analytics - Export Data
// // // //  * @params type (sales|inventory|customers|financial), format (csv|excel|pdf|json), compression, columns
// // // //  */
// // // // router.get(
// // // //     '/export',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA),
// // // //     analyticsController.exportAnalyticsData
// // // // );

// // // // /**
// // // //  * @route POST /api/v1/analytics/query
// // // //  * @desc Custom analytics query builder (for advanced users)
// // // //  * @access Analytics - Export Data
// // // //  * @body {query: string, parameters: object, limit: number}
// // // //  */
// // // // router.post(
// // // //     '/query',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA),
// // // //     analyticsController.customQuery
// // // // );

// // // // // ==========================================================================
// // // // // 9. SYSTEM PERFORMANCE & HEALTH
// // // // // ==========================================================================

// // // // /**
// // // //  * @route GET /api/v1/analytics/performance
// // // //  * @desc Analytics system performance metrics
// // // //  * @access Analytics - View Executive
// // // //  * @params hours (default: 24)
// // // //  */
// // // // router.get(
// // // //     '/performance',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
// // // //     analyticsController.getAnalyticsPerformance
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/health/data
// // // //  * @desc Data integrity and health check
// // // //  * @access Analytics - View Executive
// // // //  * @params none
// // // //  */
// // // // router.get(
// // // //     '/health/data',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
// // // //     analyticsController.getDataHealth
// // // // );

// // // // // ==========================================================================
// // // // // 10. LEGACY ENDPOINTS (For backward compatibility)
// // // // // ==========================================================================

// // // // /**
// // // //  * @route GET /api/v1/analytics/inventory
// // // //  * @desc Legacy inventory endpoint - redirects to /inventory/health
// // // //  * @access Analytics - View Inventory
// // // //  * @params branchId
// // // //  */
// // // // router.get(
// // // //     '/inventory',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY),
// // // //     analyticsController.getInventoryReport
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/product-performance
// // // //  * @desc Legacy product performance endpoint
// // // //  * @access Analytics - View Product Performance
// // // //  * @params branchId
// // // //  */
// // // // router.get(
// // // //     '/product-performance',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE),
// // // //     analyticsController.getProductPerformance
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/forecast
// // // //  * @desc Legacy forecast endpoint
// // // //  * @access Analytics - View Forecast
// // // //  * @params branchId
// // // //  */
// // // // router.get(
// // // //     '/forecast',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST),
// // // //     analyticsController.getSalesForecast
// // // // );

// // // // /**
// // // //  * @route GET /api/v1/analytics/customer-segmentation
// // // //  * @desc Legacy customer segmentation endpoint
// // // //  * @access Analytics - View Customer Segmentation
// // // //  * @params none
// // // //  */
// // // // router.get(
// // // //     '/customer-segmentation',
// // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION),
// // // //     analyticsController.getCustomerSegmentation
// // // // );

// // // // module.exports = router;
// // // // // const express = require('express');
// // // // // const router = express.Router();
// // // // // const analyticsController = require('../../controllers/analyticsController');
// // // // // const authController = require('../../controllers/authController');
// // // // // const { checkPermission } = require("../../middleware/permissionMiddleware");
// // // // // const { PERMISSIONS } = require("../../config/permissions");

// // // // // // All analytics routes require authentication
// // // // // router.use(authController.protect);

// // // // // /**
// // // // //  * UTILITY: Common Query Parameters
// // // // //  * Most endpoints accept the following optional query params:
// // // // //  * - startDate (YYYY-MM-DD): Filter start date (defaults to start of current month)
// // // // //  * - endDate (YYYY-MM-DD): Filter end date (defaults to end of current day)
// // // // //  * - branchId (ObjectId): Filter by specific branch (defaults to all branches in org)
// // // // //  */

// // // // // // ==========================================================================
// // // // // // 1. EXECUTIVE & STRATEGIC
// // // // // // ==========================================================================

// // // // // // GET /api/v1/analytics/dashboard
// // // // // // Params: startDate, endDate, branchId
// // // // // router.get(
// // // // //     '/dashboard',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE),
// // // // //     analyticsController.getDashboardOverview
// // // // // );

// // // // // // GET /api/v1/analytics/branch-comparison
// // // // // // Params: startDate, endDate
// // // // // router.get(
// // // // //     '/branch-comparison',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_BRANCH_COMPARISON),
// // // // //     analyticsController.getBranchComparison
// // // // // );

// // // // // // ==========================================================================
// // // // // // 2. FINANCIAL
// // // // // // ==========================================================================

// // // // // // GET /api/v1/analytics/financials
// // // // // // Params: startDate, endDate, branchId, interval ('day' | 'month' | 'year')
// // // // // router.get(
// // // // //     '/financials',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL),
// // // // //     analyticsController.getFinancialReport
// // // // // );

// // // // // // GET /api/v1/analytics/profitability
// // // // // // Params: startDate, endDate, branchId
// // // // // router.get(
// // // // //     '/profitability',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROFITABILITY),
// // // // //     analyticsController.getProfitabilityReport
// // // // // );

// // // // // // GET /api/v1/analytics/cash-flow
// // // // // // Params: startDate, endDate, branchId
// // // // // router.get(
// // // // //     '/cash-flow',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CASHFLOW),
// // // // //     analyticsController.getCashFlowReport
// // // // // );

// // // // // // GET /api/v1/analytics/tax-report
// // // // // // Params: startDate, endDate, branchId
// // // // // router.get(
// // // // //     '/tax-report',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_TAX),
// // // // //     analyticsController.getTaxReport
// // // // // );

// // // // // // GET /api/v1/analytics/debtor-aging
// // // // // // Params: branchId
// // // // // router.get(
// // // // //     '/debtor-aging',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEBTOR_AGING),
// // // // //     analyticsController.getDebtorAgingReport
// // // // // );

// // // // // // ==========================================================================
// // // // // // 3. OPERATIONAL
// // // // // // ==========================================================================

// // // // // // GET /api/v1/analytics/staff-performance
// // // // // // Params: startDate, endDate, branchId
// // // // // router.get(
// // // // //     '/staff-performance',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE),
// // // // //     analyticsController.getStaffPerformance
// // // // // );

// // // // // // GET /api/v1/analytics/operational-metrics
// // // // // // Params: startDate, endDate, branchId
// // // // // router.get(
// // // // //     '/operational-metrics',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL),
// // // // //     analyticsController.getOperationalMetrics
// // // // // );

// // // // // // GET /api/v1/analytics/peak-hours
// // // // // // Params: branchId (Analyzes last 30 days by default)
// // // // // router.get(
// // // // //     '/peak-hours',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PEAK_HOURS),
// // // // //     analyticsController.getPeakBusinessHours
// // // // // );

// // // // // // GET /api/v1/analytics/procurement
// // // // // // Params: startDate, endDate, branchId
// // // // // router.get(
// // // // //     '/procurement',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT),
// // // // //     analyticsController.getProcurementAnalysis
// // // // // );

// // // // // // GET /api/v1/analytics/customer-insights
// // // // // // Params: branchId
// // // // // router.get(
// // // // //     '/customer-insights',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_INSIGHTS),
// // // // //     analyticsController.getCustomerInsights
// // // // // );

// // // // // // ==========================================================================
// // // // // // 4. INVENTORY
// // // // // // ==========================================================================

// // // // // // GET /api/v1/analytics/inventory
// // // // // // Params: branchId
// // // // // router.get(
// // // // //     '/inventory',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY),
// // // // //     analyticsController.getInventoryReport
// // // // // );

// // // // // // GET /api/v1/analytics/product-performance
// // // // // // Params: branchId
// // // // // router.get(
// // // // //     '/product-performance',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE),
// // // // //     analyticsController.getProductPerformance
// // // // // );

// // // // // // GET /api/v1/analytics/dead-stock
// // // // // // Params: branchId, daysThreshold (number, default: 90)
// // // // // router.get(
// // // // //     '/dead-stock',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEAD_STOCK),
// // // // //     analyticsController.getDeadStockReport
// // // // // );

// // // // // // GET /api/v1/analytics/stock-predictions
// // // // // // Params: branchId
// // // // // router.get(
// // // // //     '/stock-predictions',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_STOCK_FORECAST),
// // // // //     analyticsController.getStockOutPredictions
// // // // // );

// // // // // // ==========================================================================
// // // // // // 5. PREDICTIVE
// // // // // // ==========================================================================

// // // // // // GET /api/v1/analytics/forecast
// // // // // // Params: branchId
// // // // // router.get(
// // // // //     '/forecast',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST),
// // // // //     analyticsController.getSalesForecast
// // // // // );

// // // // // // GET /api/v1/analytics/customer-segmentation
// // // // // // Params: None (Analyzes full customer base)
// // // // // router.get(
// // // // //     '/customer-segmentation',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION),
// // // // //     analyticsController.getCustomerSegmentation
// // // // // );

// // // // // // GET /api/v1/analytics/customer-retention
// // // // // // Params: months (number, default: 6)
// // // // // router.get(
// // // // //     '/customer-retention',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_RETENTION),
// // // // //     analyticsController.getCustomerRetention
// // // // // );

// // // // // // GET /api/v1/analytics/critical-alerts
// // // // // // Params: branchId
// // // // // router.get(
// // // // //     '/critical-alerts',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS),
// // // // //     analyticsController.getCriticalAlerts
// // // // // );

// // // // // // ==========================================================================
// // // // // // 6. CUSTOMER INTELLIGENCE (NEW)
// // // // // // ==========================================================================

// // // // // // GET /api/v1/analytics/customer-ltv
// // // // // // Params: branchId
// // // // // router.get(
// // // // //     '/customer-ltv',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_LTV),
// // // // //     analyticsController.getCustomerLifetimeValue
// // // // // );

// // // // // // GET /api/v1/analytics/churn-risk
// // // // // // Params: daysThreshold (number, default: 90)
// // // // // router.get(
// // // // //     '/churn-risk',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_CHURN),
// // // // //     analyticsController.getChurnRiskAnalysis
// // // // // );

// // // // // // GET /api/v1/analytics/market-basket
// // // // // // Params: minSupport (number, default: 2)
// // // // // router.get(
// // // // //     '/market-basket',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_MARKET_BASKET),
// // // // //     analyticsController.getMarketBasketAnalysis
// // // // // );

// // // // // // GET /api/v1/analytics/payment-behavior
// // // // // // Params: branchId
// // // // // router.get(
// // // // //     '/payment-behavior',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_PAYMENT_BEHAVIOR),
// // // // //     analyticsController.getPaymentBehaviorStats
// // // // // );

// // // // // // ==========================================================================
// // // // // // 7. SECURITY / EXPORT
// // // // // // ==========================================================================

// // // // // // GET /api/v1/analytics/security-audit
// // // // // // Params: startDate, endDate
// // // // // router.get(
// // // // //     '/security-audit',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT),
// // // // //     analyticsController.getSecurityAuditLog
// // // // // );

// // // // // // GET /api/v1/analytics/export
// // // // // // Params: startDate, endDate, type ('sales'|'inventory'|'tax'), format ('csv'|'json', default: 'csv')
// // // // // router.get(
// // // // //     '/export',
// // // // //     checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA),
// // // // //     analyticsController.exportAnalyticsData
// // // // // );

// // // // // module.exports = router;

// // // // // // const express = require('express');
// // // // // // const router = express.Router();
// // // // // // const analyticsController = require('../../controllers/analyticsController');
// // // // // // const authController = require('../../controllers/authController');
// // // // // // const { checkPermission } = require("../../middleware/permissionMiddleware");
// // // // // // const { PERMISSIONS } = require("../../config/permissions");

// // // // // // router.use(authController.protect);

// // // // // // // Executive
// // // // // // router.get('/dashboard', checkPermission(PERMISSIONS.ANALYTICS.VIEW_EXECUTIVE), analyticsController.getDashboardOverview);
// // // // // // router.get('/branch-comparison', checkPermission(PERMISSIONS.ANALYTICS.VIEW_BRANCH_COMPARISON), analyticsController.getBranchComparison);

// // // // // // // Financial
// // // // // // router.get('/financials', checkPermission(PERMISSIONS.ANALYTICS.VIEW_FINANCIAL), analyticsController.getFinancialReport);
// // // // // // router.get('/profitability', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROFITABILITY), analyticsController.getProfitabilityReport);
// // // // // // router.get('/cash-flow', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CASHFLOW), analyticsController.getCashFlowReport);
// // // // // // router.get('/tax-report', checkPermission(PERMISSIONS.ANALYTICS.VIEW_TAX), analyticsController.getTaxReport);
// // // // // // router.get('/debtor-aging', checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEBTOR_AGING), analyticsController.getDebtorAgingReport);

// // // // // // // Operational
// // // // // // router.get('/staff-performance', checkPermission(PERMISSIONS.ANALYTICS.VIEW_STAFF_PERFORMANCE), analyticsController.getStaffPerformance);
// // // // // // router.get('/operational-metrics', checkPermission(PERMISSIONS.ANALYTICS.VIEW_OPERATIONAL), analyticsController.getOperationalMetrics);
// // // // // // router.get('/peak-hours', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PEAK_HOURS), analyticsController.getPeakBusinessHours);
// // // // // // router.get('/procurement', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PROCUREMENT), analyticsController.getProcurementAnalysis);
// // // // // // router.get('/customer-insights', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_INSIGHTS), analyticsController.getCustomerInsights);

// // // // // // // Inventory
// // // // // // router.get('/inventory', checkPermission(PERMISSIONS.ANALYTICS.VIEW_INVENTORY), analyticsController.getInventoryReport);
// // // // // // router.get('/product-performance', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PRODUCT_PERFORMANCE), analyticsController.getProductPerformance);
// // // // // // router.get('/dead-stock', checkPermission(PERMISSIONS.ANALYTICS.VIEW_DEAD_STOCK), analyticsController.getDeadStockReport);
// // // // // // router.get('/stock-predictions', checkPermission(PERMISSIONS.ANALYTICS.VIEW_STOCK_FORECAST), analyticsController.getStockOutPredictions);

// // // // // // // Predictive
// // // // // // router.get('/forecast', checkPermission(PERMISSIONS.ANALYTICS.VIEW_FORECAST), analyticsController.getSalesForecast);
// // // // // // router.get('/customer-segmentation', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_SEGMENTATION), analyticsController.getCustomerSegmentation);
// // // // // // router.get('/customer-retention', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_RETENTION), analyticsController.getCustomerRetention);
// // // // // // router.get('/critical-alerts', checkPermission(PERMISSIONS.ANALYTICS.VIEW_ALERTS), analyticsController.getCriticalAlerts);

// // // // // // // Customer Intelligence (new)
// // // // // // router.get('/customer-ltv', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CUSTOMER_LTV), analyticsController.getCustomerLifetimeValue);
// // // // // // router.get('/churn-risk', checkPermission(PERMISSIONS.ANALYTICS.VIEW_CHURN), analyticsController.getChurnRiskAnalysis);
// // // // // // router.get('/market-basket', checkPermission(PERMISSIONS.ANALYTICS.VIEW_MARKET_BASKET), analyticsController.getMarketBasketAnalysis);
// // // // // // router.get('/payment-behavior', checkPermission(PERMISSIONS.ANALYTICS.VIEW_PAYMENT_BEHAVIOR), analyticsController.getPaymentBehaviorStats);

// // // // // // // Security / Export
// // // // // // router.get('/security-audit', checkPermission(PERMISSIONS.ANALYTICS.VIEW_SECURITY_AUDIT), analyticsController.getSecurityAuditLog);
// // // // // // router.get('/export', checkPermission(PERMISSIONS.ANALYTICS.EXPORT_DATA), analyticsController.exportAnalyticsData);

// // // // // // module.exports = router;
