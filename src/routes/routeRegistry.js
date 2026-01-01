// src/routes/routeRegistry.js

/**
 * Central Route Registry
 * - Defines API paths
 * - Maps them to route modules
 * - Does NOT import controllers or middleware
 */

const routeRegistry = [
  // ====================== AUTHENTICATION & USERS ======================
  { path: "/api/v1/auth", file: "authRoutes", description: "Authentication endpoints" },
  { path: "/api/v1/users", file: "userRoutes", description: "User management" },
  { path: "/api/v1/roles", file: "rolesRoutes", description: "Role and permission management" },
  { path: "/api/v1/sessions", file: "sessionRoutes", description: "Session management" },

  // ====================== ORGANIZATION ======================
  { path: "/api/v1/organization", file: "organizationRoutes", description: "Organization management" },
  { path: "/api/v1/neworganization", file: "organizationExtrasRoutes", description: "Organization extra features" },
  { path: "/api/v1/ownership", file: "ownership.routes", description: "Ownership transfer" },

  // ====================== BUSINESS OPERATIONS ======================
  { path: "/api/v1/branches", file: "branchRoutes", description: "Branch management" },
  { path: "/api/v1/products", file: "productRoutes", description: "Product management" },
  { path: "/api/v1/customers", file: "customerRoutes", description: "Customer management" },
  { path: "/api/v1/suppliers", file: "supplierRoutes", description: "Supplier management" },
  { path: "/api/v1/purchases", file: "purchaseRoutes", description: "Purchase management" },

  // ====================== SALES & INVOICING ======================
  { path: "/api/v1/invoices", file: "invoiceRoutes", description: "Invoice management" },
  { path: "/api/v1/invoices/pdf", file: "invoicePDFRoutes", description: "Invoice PDF generation" },
  { path: "/api/v1/sales", file: "salesRoutes", description: "Sales management" },
  { path: "/api/v1/sales-returns", file: "salesReturnRoutes", description: "Sales returns management" },

  // ====================== FINANCE & ACCOUNTING ======================
  { path: "/api/v1/payments", file: "paymentRoutes", description: "Payment processing" },
  { path: "/api/v1/emi", file: "emiRoutes", description: "EMI management" },
  { path: "/api/v1/transactions", file: "transactionRoutes", description: "Transaction tracking" },
  { path: "/api/v1/partytransactions", file: "partyTransactionRoutes", description: "Party transactions" },
  { path: "/api/v1/ledgers", file: "ledgerRoutes", description: "Ledger management" },
  { path: "/api/v1/statements", file: "statementsRoutes", description: "Financial statements" },
  { path: "/api/v1/accounts", file: "accountRoutes", description: "Account management" },
  { path: "/api/v1/reconciliation", file: "reconciliationRoutes", description: "Reconciliation" },

  // ====================== INVENTORY & STOCK ======================
  { path: "/api/v1/inventory", file: "inventoryRoutes", description: "Inventory management" },
  { path: "/api/v1/stock", file: "stockRoutes", description: "Stock management" },

  // ====================== ANALYTICS & REPORTING ======================
  { path: "/api/v1/dashboard", file: "dashboardRoutes", description: "Dashboard data" },
  { path: "/api/v1/analytics", file: "analyticsRoutes", description: "Analytics and insights" },
  { path: "/api/v1/chart", file: "chartRoutes", description: "Chart data" },
  { path: "/api/v1/admin", file: "adminRoutes", description: "Admin dashboard" },
  { path: "/api/v1/search", file: "searchRoutes", description: "Global search" },

  // ====================== COMMUNICATION ======================
  { path: "/api/v1/notifications", file: "notificationRoutes", description: "Notification management" },
  { path: "/api/v1/notes", file: "noteRoutes", description: "Notes and planning" },
  { path: "/api/v1/chat", file: "chatRoutes", description: "Chat functionality" },
  { path: "/api/v1/announcements", file: "announcementRoutes", description: "Announcements" },
  { path: "/api/v1/feed", file: "feedRoutes", description: "Activity feed" },

  // ====================== AUTOMATION & AI ======================
  { path: "/api/v1/automation", file: "automationRoutes", description: "Automation workflows" },
  { path: "/api/v1/ai-agent", file: "AiAgentRoutes", description: "AI agent features" },

  // ====================== MASTER DATA & SYSTEM ======================
  { path: "/api/v1/master", file: "masterRoutes", description: "Master data management" },
  { path: "/api/v1/master-list", file: "masterListRoutes", description: "Master list views" },
  { path: "/api/v1/master-types", file: "masterTypeRoutes", description: "Master type management" },
  { path: "/api/v1/logs", file: "logRoutes", description: "System logs" },

  // ====================== ATTENDANCE & TIME ======================
  { path: "/api/v1/attendance", file: "attendanceRoutes", description: "Attendance management" },
  { path: "/api/v1/shifts", file: "shiftRoutes", description: "Shift management" },
  { path: "/api/v1/holidays", file: "holidayRoutes", description: "Holiday management" }
];

/**
 * Route Loader
 */
class RouteLoader {
  constructor(app) {
    this.app = app;
    this.loadedRoutes = new Map();
  }

  loadAllRoutes() {
    console.log("📁 Loading API routes...");

    routeRegistry.forEach(({ path, file, description }) => {
      try {
        const router = require(`./v1/${file}`);
        this.app.use(path, router);
        this.loadedRoutes.set(path, { file, description, status: "loaded" });
        console.log(`  ✅ ${path.padEnd(32)} → ${description}`);
      } catch (err) {
        console.error(`  ❌ ${path} failed: ${err.message}`);
        this.loadedRoutes.set(path, { file, description, status: "error", error: err.message });
      }
    });

    return this.loadedRoutes;
  }
}

module.exports = { routeRegistry, RouteLoader };


// // src/routes/routeRegistry.js
// const path = require("path");

// const invoiceController =
//   require('@modules/accounting/billing/invoice.controller');

// const authController =
//   require('@modules/auth/core/auth.controller');

// const { checkPermission } =
//   require('@core/middleware/permission.middleware');


// /**
//  * Route Registry Configuration
//  * Centralized management of all API routes
//  */
// const routeRegistry = [
//   // ====================== AUTHENTICATION & USERS ======================
//   {
//     path: "/api/v1/auth",
//     file: "authRoutes",
//     description: "Authentication endpoints"
//   },
//   {
//     path: "/api/v1/users",
//     file: "userRoutes",
//     description: "User management"
//   },
//   {
//     path: "/api/v1/roles",
//     file: "rolesRoutes",
//     description: "Role and permission management"
//   },
//   {
//     path: "/api/v1/sessions",
//     file: "sessionRoutes",
//     description: "Session management"
//   },

//   // ====================== ORGANIZATION ======================
//   {
//     path: "/api/v1/organization",
//     file: "organizationRoutes",
//     description: "Organization management"
//   },
//   {
//     path: "/api/v1/neworganization",
//     file: "organizationExtrasRoutes",
//     description: "Organization extra features"
//   },
//   {
//     path: "/api/v1/ownership",
//     file: "ownership.routes",
//     description: "Ownership transfer"
//   },

//   // ====================== BUSINESS OPERATIONS ======================
//   {
//     path: "/api/v1/branches",
//     file: "branchRoutes",
//     description: "Branch management"
//   },
//   {
//     path: "/api/v1/products",
//     file: "productRoutes",
//     description: "Product management"
//   },
//   {
//     path: "/api/v1/customers",
//     file: "customerRoutes",
//     description: "Customer management"
//   },
//   {
//     path: "/api/v1/suppliers",
//     file: "supplierRoutes",
//     description: "Supplier management"
//   },
//   {
//     path: "/api/v1/purchases",
//     file: "purchaseRoutes",
//     description: "Purchase management"
//   },

//   // ====================== SALES & INVOICING ======================
//   {
//     path: "/api/v1/invoices",
//     file: "invoiceRoutes",
//     description: "Invoice management"
//   },
//   {
//     path: "/api/v1/invoices/pdf",
//     file: "invoicePDFRoutes",
//     description: "Invoice PDF generation"
//   },
//   {
//     path: "/api/v1/sales",
//     file: "salesRoutes",
//     description: "Sales management"
//   },
//   {
//     path: "/api/v1/sales-returns",
//     file: "salesReturnRoutes",
//     description: "Sales returns management"
//   },

//   // ====================== FINANCE & ACCOUNTING ======================
//   {
//     path: "/api/v1/payments",
//     file: "paymentRoutes",
//     description: "Payment processing"
//   },
//   {
//     path: "/api/v1/emi",
//     file: "emiRoutes",
//     description: "EMI management"
//   },
//   {
//     path: "/api/v1/transactions",
//     file: "transactionRoutes",
//     description: "Transaction tracking"
//   },
//   {
//     path: "/api/v1/partytransactions",
//     file: "partyTransactionRoutes",
//     description: "Party transactions"
//   },
//   {
//     path: "/api/v1/ledgers",
//     file: "ledgerRoutes",
//     description: "Ledger management"
//   },
//   {
//     path: "/api/v1/statements",
//     file: "statementsRoutes",
//     description: "Financial statements"
//   },
//   {
//     path: "/api/v1/accounts",
//     file: "accountRoutes",
//     description: "Account management"
//   },
//   {
//     path: "/api/v1/reconciliation",
//     file: "reconciliationRoutes",
//     description: "Reconciliation"
//   },

//   // ====================== INVENTORY & STOCK ======================
//   {
//     path: "/api/v1/inventory",
//     file: "inventoryRoutes",
//     description: "Inventory management"
//   },
//   {
//     path: "/api/v1/stock",
//     file: "stockRoutes",
//     description: "Stock management"
//   },

//   // ====================== ANALYTICS & REPORTING ======================
//   {
//     path: "/api/v1/dashboard",
//     file: "dashboardRoutes",
//     description: "Dashboard data"
//   },
//   {
//     path: "/api/v1/analytics",
//     file: "analyticsRoutes",
//     description: "Analytics and insights"
//   },
//   {
//     path: "/api/v1/chart",
//     file: "chartRoutes",
//     description: "Chart data"
//   },
//   {
//     path: "/api/v1/admin",
//     file: "adminRoutes",
//     description: "Admin dashboard"
//   },
//   {
//     path: "/api/v1/search",
//     file: "searchRoutes",
//     description: "Global search"
//   },

//   // ====================== COMMUNICATION ======================
//   {
//     path: "/api/v1/notifications",
//     file: "notificationRoutes",
//     description: "Notification management"
//   },
//   {
//     path: "/api/v1/notes",
//     file: "noteRoutes",
//     description: "Notes and planning"
//   },
//   {
//     path: "/api/v1/chat",
//     file: "chatRoutes",
//     description: "Chat functionality"
//   },
//   {
//     path: "/api/v1/announcements",
//     file: "announcementRoutes",
//     description: "Announcements"
//   },
//   {
//     path: "/api/v1/feed",
//     file: "feedRoutes",
//     description: "Activity feed"
//   },

//   // ====================== AUTOMATION & AI ======================
//   {
//     path: "/api/v1/automation",
//     file: "automationRoutes",
//     description: "Automation workflows"
//   },
//   {
//     path: "/api/v1/ai-agent",
//     file: "AiAgentRoutes",
//     description: "AI agent features"
//   },

//   // ====================== MASTER DATA & SYSTEM ======================
//   {
//     path: "/api/v1/master",
//     file: "masterRoutes",
//     description: "Master data management"
//   },
//   {
//     path: "/api/v1/master-list",
//     file: "masterListRoutes",
//     description: "Master list views"
//   },
//   {
//     path: "/api/v1/master-types",
//     file: "masterTypeRoutes",
//     description: "Master type management"
//   },
//   {
//     path: "/api/v1/logs",
//     file: "logRoutes",
//     description: "System logs"
//   },

//   // ====================== ATTENDANCE & TIME ======================
//   {
//     path: "/api/v1/attendance",
//     file: "attendanceRoutes",
//     description: "Attendance management"
//   },
//   {
//     path: "/api/v1/shifts",
//     file: "shiftRoutes",
//     description: "Shift management"
//   },
//   {
//     path: "/api/v1/holidays",
//     file: "holidayRoutes",
//     description: "Holiday management"
//   }
// ];

// /**
//  * Route Loader Utility
//  */
// class RouteLoader {
//   constructor(app) {
//     this.app = app;
//     this.loadedRoutes = new Map();
//     this.registry = routeRegistry;
//   }

//   /**
//    * Load all routes from registry
//    */
//   loadAllRoutes() {
//     console.log("📁 Loading API routes...");
    
//     this.registry.forEach(routeConfig => {
//       try {
//         const routeModule = require(`./v1/${routeConfig.file}`);
//         this.app.use(routeConfig.path, routeModule);
//         this.loadedRoutes.set(routeConfig.path, {
//           file: routeConfig.file,
//           description: routeConfig.description,
//           status: "loaded"
//         });
        
//         console.log(`  ✅ ${routeConfig.path.padEnd(30)} → ${routeConfig.description}`);
//       } catch (error) {
//         console.error(`  ❌ Failed to load ${routeConfig.path}:`, error.message);
//         this.loadedRoutes.set(routeConfig.path, {
//           file: routeConfig.file,
//           description: routeConfig.description,
//           status: "error",
//           error: error.message
//         });
//       }
//     });
    
//     console.log(`📊 Loaded ${this.loadedRoutes.size} route modules`);
//     return this.loadedRoutes;
//   }

//   /**
//    * Get route information for API documentation
//    */
//   getRoutesInfo() {
//     return Array.from(this.loadedRoutes.entries()).map(([path, info]) => ({
//       path,
//       description: info.description,
//       status: info.status,
//       error: info.error
//     }));
//   }

//   /**
//    * Get route by path
//    */
//   getRoute(path) {
//     return this.loadedRoutes.get(path);
//   }

//   /**
//    * Check if all routes loaded successfully
//    */
//   allRoutesLoaded() {
//     return Array.from(this.loadedRoutes.values())
//       .every(route => route.status === "loaded");
//   }
// }

// module.exports = {
//   routeRegistry,
//   RouteLoader
// };