// Import all services
const cacheService = require('./services/cache.service');
const executiveService = require('./services/executive.service');
const financialService = require('./services/financial.service');
const inventoryService = require('./services/inventory.service');
const customerService = require('./services/customer.service');
const salesService = require('./services/sales.service');
const staffService = require('./services/staff.service');
const operationsService = require('./services/operations.service');
const insightsService = require('./services/insights.service');
const securityService = require('./services/security.service');
const exportService = require('./services/export.service');
const analyticsUtils = require('./utils/analytics.utils');

// Export everything in a structured way
module.exports = {
    // Cache Management
    ...cacheService,
    
    // Executive & Core Analytics
    ...executiveService,
    
    ...securityService,
    // Financial Analytics
    ...financialService,
    
    // Inventory Analytics
    ...inventoryService,
    
    // Customer Analytics
    ...customerService,
    
    // Sales Analytics
    ...salesService,
    
    // Staff Analytics
    ...staffService,
    
    // Operations Analytics
    ...operationsService,
    
    // Insights & Recommendations
    ...insightsService,
    
    // Export Services
    ...exportService,
    
    // Utilities
    ...analyticsUtils,
    
    // You can also export services as namespaced objects if preferred
    cache: cacheService,
    executive: executiveService,
    financial: financialService,
    inventory: inventoryService,
    customer: customerService,
    sales: salesService,
    staff: staffService,
    operations: operationsService,
    insights: insightsService,
    export: exportService,
    utils: analyticsUtils
};