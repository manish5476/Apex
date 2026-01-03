// services/analytics/alerts.js
const inventoryService = require('./inventory');
const segmentationService = require('./segmentation');
const securityService = require('./security');
const operationalService = require('./operational');
const salesService = require('./sales');

exports.getCriticalAlerts = async ({ orgId, branchId }) => {

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
        inventory,
        segmentation,
        securityPulse,
        operational,
        sales
    ] = await Promise.all([
        inventoryService.getInventoryAnalytics(orgId, branchId),
        segmentationService.getCustomerRFM({ orgId }),
        securityService.getSecurityRiskScore({
            orgId,
            startDate: monthStart,
            endDate: now
        }),
        operationalService.getOperationalOverview({
            orgId,
            branchId,
            startDate: monthStart,
            endDate: now
        }),
        salesService.getSalesInsights({
            orgId,
            branchId,
            startDate: monthStart,
            endDate: now
        })
    ]);

    const alerts = [];

    if (inventory.lowStockAlerts?.length > 0) {
        alerts.push({
            type: 'inventory',
            severity: 'high',
            message: `${inventory.lowStockAlerts.length} items need restocking`
        });
    }

    if (segmentation.segments?.['At Risk'] > 0) {
        alerts.push({
            type: 'customer-churn',
            severity: 'medium',
            message: `${segmentation.segments['At Risk']} customers risk churn`
        });
    }

    if (securityPulse.summary?.riskLevel === 'HIGH' || securityPulse.summary?.riskLevel === 'CRITICAL') {
        alerts.push({
            type: 'security',
            severity: 'critical',
            message: `Security posture flagged as ${securityPulse.summary.riskLevel}`
        });
    }

    if (operational.summary?.cancellationRate > 20) {
        alerts.push({
            type: 'operations',
            severity: 'high',
            message: `Cancellation rate is high (${operational.summary.cancellationRate}%).`
        });
    }

    if (sales?.trend === 'down') {
        alerts.push({
            type: 'revenue',
            severity: 'warning',
            message: 'Sales trending downward vs previous period.'
        });
    }

    return {
        timestamp: new Date(),
        count: alerts.length,
        alerts
    };
};
