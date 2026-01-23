const mongoose = require('mongoose');



const toObjectId = (id) => id ? new mongoose.Types.ObjectId(id) : null;

const calculateGrowth = (current, previous) => {
    if (previous === 0) return current === 0 ? 0 : 100;
    return Number(((current - previous) / previous * 100).toFixed(1));
};

const calculatePercentage = (part, total) => {
    if (total === 0) return 0;
    return Number((part / total * 100).toFixed(1));
};

const getNestedValue = (obj, path) => {
    return path.split('.').reduce((o, key) => (o && o[key] !== undefined) ? o[key] : null, obj);
};

const validateAndParseQuery = (query) => {
    try {
        // Stub - implement query validation
        return query;
    } catch (error) {
        console.error('Error in validateAndParseQuery:', error);
        return {};
    }
};

const executeCustomQuery = async (orgId, query, parameters, limit) => {
    try {
        // Stub - implement custom query execution
        return {
            data: [],
            total: 0,
            executionTime: 0,
            metadata: { query, parameters }
        };
    } catch (error) {
        console.error('Error in executeCustomQuery:', error);
        return {
            data: [],
            total: 0,
            executionTime: 0,
            metadata: {}
        };
    }
};

const getPerformanceMetrics = async (orgId, hours) => {
    try {
        // Stub - implement performance metrics
        return {
            avgResponseTime: 250,
            errorRate: 0.02,
            requestCount: 1500,
            cacheHitRate: 0.65
        };
    } catch (error) {
        console.error('Error in getPerformanceMetrics:', error);
        return {
            avgResponseTime: 0,
            errorRate: 0,
            requestCount: 0,
            cacheHitRate: 0
        };
    }
};

const performDataHealthCheck = async (orgId) => {
    try {
        // Stub - implement data health check
        return [
            {
                check: 'Invoice data consistency',
                status: 'healthy',
                details: 'All invoices have valid customer references'
            },
            {
                check: 'Product inventory sync',
                status: 'warning',
                details: '5 products have negative inventory'
            }
        ];
    } catch (error) {
        console.error('Error in performDataHealthCheck:', error);
        return [];
    }
};

const calculateDataHealthScore = (healthCheck) => {
    try {
        // Stub - implement data health score calculation
        const healthyChecks = healthCheck.filter(item => item.status === 'healthy').length;
        return Math.round((healthyChecks / healthCheck.length) * 100);
    } catch (error) {
        console.error('Error in calculateDataHealthScore:', error);
        return 0;
    }
};
module.exports = {
    toObjectId,
    calculateGrowth,
    calculatePercentage,
    getNestedValue,
    validateAndParseQuery,
    executeCustomQuery,
    getPerformanceMetrics,
    performDataHealthCheck,
    calculateDataHealthScore
};