// config/chartConfig.js
module.exports = {
    environment: process.env.NODE_ENV || 'development',
    
    limits: {
        maxDateRangeDays: parseInt(process.env.MAX_DATE_RANGE_DAYS) || 730,
        topPerformersMaxLimit: parseInt(process.env.TOP_PERFORMERS_MAX_LIMIT) || 50,
        heatmapMaxDays: parseInt(process.env.HEATMAP_MAX_DAYS) || 90,
        exportMaxRecords: parseInt(process.env.EXPORT_MAX_RECORDS) || 10000
    },
    
    caching: {
        enabled: process.env.CACHE_ENABLED !== 'false',
        ttl: {
            financialTrend: parseInt(process.env.CHART_CACHE_TTL_FINANCIAL) || 300,
            distribution: parseInt(process.env.CHART_CACHE_TTL_DISTRIBUTION) || 600,
            yoy: parseInt(process.env.CHART_CACHE_TTL_YOY) || 3600,
            topPerformers: parseInt(process.env.CHART_CACHE_TTL_TOP_PERFORMERS) || 300,
            customerAcquisition: parseInt(process.env.CHART_CACHE_TTL_ACQUISITION) || 1800,
            aov: parseInt(process.env.CHART_CACHE_TTL_AOV) || 1800,
            heatmap: parseInt(process.env.CHART_CACHE_TTL_HEATMAP) || 900,
            radar: parseInt(process.env.CHART_CACHE_TTL_RADAR) || 600,
            funnel: parseInt(process.env.CHART_CACHE_TTL_FUNNEL) || 300,
            default: parseInt(process.env.CHART_CACHE_TTL_DEFAULT) || 300
        }
    },
    
    thresholds: {
        abortOnMoreThan: parseInt(process.env.ABORT_ON_MORE_THAN) || 1000000,
        timeoutMs: parseInt(process.env.CHART_TIMEOUT_MS) || 30000,
        slowQueryThreshold: parseInt(process.env.SLOW_QUERY_THRESHOLD) || 5000
    }
};
