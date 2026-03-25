const mongoose = require('mongoose');
const AuditLog = require('../../../core/utils/db/auditLogModel');
const { toObjectId } = require('../utils/analytics.utils');

/* ==========================================================================
   🔒 SECURITY & AUDIT ANALYTICS SERVICE
   ========================================================================== */

/**
 * 1. SECURITY PULSE: Recent audit logs and risky actions
 */
async function getSecurityPulse(orgId, startDate, endDate) {
    try {
        if (!orgId) throw new Error('Organization ID is required');
        if (!AuditLog) return { recentEvents: [], riskyActions: 0 };

        const match = {
            organizationId: toObjectId(orgId),
            createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
        };

        const [logs, riskCount] = await Promise.all([
            AuditLog.find(match).sort({ createdAt: -1 }).limit(20).populate('userId', 'name email'),
            AuditLog.countDocuments({ ...match, action: { $in: ['DELETE_INVOICE', 'EXPORT_DATA', 'FORCE_UPDATE'] } })
        ]);

        return { recentEvents: logs, riskyActions: riskCount };
    } catch (error) {
        console.error('Error in getSecurityPulse:', error);
        throw new Error(`Failed to fetch security pulse: ${error.message}`);
    }
}

/**
 * 2. AUDIT ANALYTICS: Action + module grouping
 */
async function getAuditAnalytics(orgId, startDate, endDate) {
    try {
        if (!orgId) throw new Error('Organization ID is required');

        const match = {
            organizationId: toObjectId(orgId),
            createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
        };

        return await AuditLog.aggregate([
            { $match: match },
            { $group: { _id: { action: '$action', module: '$module' }, count: { $sum: 1 }, users: { $addToSet: '$userId' }, recent: { $max: '$createdAt' } } },
            { $project: { action: '$_id.action', module: '$_id.module', count: 1, userCount: { $size: '$users' }, recent: 1 } },
            { $sort: { count: -1 } }
        ]);
    } catch (error) {
        console.error('Error in getAuditAnalytics:', error);
        throw new Error(`Failed to fetch audit analytics: ${error.message}`);
    }
}

/**
 * 3. RISK ANALYSIS: Per-user risk scoring
 */
async function getRiskAnalysis(orgId) {
    try {
        if (!orgId) throw new Error('Organization ID is required');

        const riskyActions = ['DELETE_INVOICE', 'EXPORT_DATA', 'FORCE_UPDATE', 'MODIFY_PERMISSIONS', 'OVERRIDE_SETTINGS'];

        return await AuditLog.aggregate([
            { $match: { organizationId: toObjectId(orgId), action: { $in: riskyActions } } },
            { $group: { _id: '$userId', riskCount: { $sum: 1 }, actions: { $push: { action: '$action', timestamp: '$createdAt', module: '$module' } }, lastRiskyAction: { $max: '$createdAt' } } },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
            { $unwind: '$user' },
            {
                $project: {
                    userId: '$_id', userName: '$user.name', userEmail: '$user.email', riskCount: 1,
                    riskLevel: {
                        $switch: {
                            branches: [
                                { case: { $gte: ['$riskCount', 10] }, then: 'HIGH' },
                                { case: { $gte: ['$riskCount', 5] }, then: 'MEDIUM' },
                                { case: { $gte: ['$riskCount', 1] }, then: 'LOW' }
                            ],
                            default: 'NONE'
                        }
                    },
                    lastRiskyAction: 1,
                    actions: { $slice: ['$actions', 5] }
                }
            },
            { $sort: { riskCount: -1 } }
        ]);
    } catch (error) {
        console.error('Error in getRiskAnalysis:', error);
        throw new Error(`Failed to fetch risk analysis: ${error.message}`);
    }
}

/**
 * 4. USER ACTIVITY LOGS: Filtered activity feed
 */
async function getUserActivityLogs(orgId, userId = null, startDate, endDate, limit = 50) {
    try {
        if (!orgId) throw new Error('Organization ID is required');

        const match = {
            organizationId: toObjectId(orgId),
            createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
        };
        if (userId) match.userId = toObjectId(userId);

        return await AuditLog.find(match)
            .populate('userId', 'name email role')
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
    } catch (error) {
        console.error('Error in getUserActivityLogs:', error);
        throw new Error(`Failed to fetch user activity logs: ${error.message}`);
    }
}

/**
 * 5. SUSPICIOUS ACTIVITY DETECTION: High-frequency + multi-IP scoring
 */
async function getSuspiciousActivities(orgId, thresholdHours = 24) {
    try {
        if (!orgId) throw new Error('Organization ID is required');

        const cutoff = new Date(Date.now() - (thresholdHours * 60 * 60 * 1000));

        return await AuditLog.aggregate([
            { $match: { organizationId: toObjectId(orgId), createdAt: { $gte: cutoff } } },
            { $group: { _id: '$userId', activityCount: { $sum: 1 }, ipAddresses: { $addToSet: '$ipAddress' }, differentActions: { $addToSet: '$action' } } },
            { $match: { activityCount: { $gte: 20 } } },
            {
                $lookup: {
                    from: 'users',
                    let: { uid: '$_id' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$_id', '$$uid'] } } },
                        { $project: { name: 1, email: 1 } }
                    ],
                    as: 'user'
                }
            },
            { $unwind: '$user' },
            {
                $project: {
                    userName: '$user.name', activityCount: 1,
                    uniqueIPCount: { $size: '$ipAddresses' },
                    suspiciousScore: {
                        $add: [
                            { $multiply: ['$activityCount', 0.2] },
                            { $multiply: [{ $size: '$ipAddresses' }, 10] }
                        ]
                    }
                }
            },
            { $sort: { suspiciousScore: -1 } }
        ]).allowDiskUse(true);
    } catch (error) {
        throw new Error(`Security Analytics Audit Failed: ${error.message}`);
    }
}

module.exports = {
    getSecurityPulse,
    getAuditAnalytics,
    getRiskAnalysis,
    getUserActivityLogs,
    getSuspiciousActivities
};
