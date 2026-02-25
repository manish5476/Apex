const mongoose = require('mongoose');
const AuditLog = require('../../../core/utils/db/auditLogModel'); // Adjust path as needed
const { toObjectId } = require('../utils/analytics.utils');


/**
 * Security Pulse - Get security audit logs and risky actions
 */
async function getSecurityPulse(orgId, startDate, endDate) {
    try {
        if (!orgId) throw new Error('Organization ID is required');

        if (!AuditLog) return { recentEvents: [], riskyActions: 0 };

        const match = { 
            organizationId: toObjectId(orgId),
            createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
        };

        const logs = await AuditLog.find(match)
            .sort({ createdAt: -1 })
            .limit(20)
            .populate('userId', 'name email');

        const riskCount = await AuditLog.countDocuments({
            ...match,
            action: { $in: ['DELETE_INVOICE', 'EXPORT_DATA', 'FORCE_UPDATE'] }
        });

        return { recentEvents: logs, riskyActions: riskCount };
    } catch (error) {
        console.error('Error in getSecurityPulse:', error);
        throw new Error(`Failed to fetch security pulse: ${error.message}`);
    }
}

/**
 * Get detailed audit analytics
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
            {
                $group: {
                    _id: {
                        action: '$action',
                        module: '$module'
                    },
                    count: { $sum: 1 },
                    users: { $addToSet: '$userId' },
                    recent: { $max: '$createdAt' }
                }
            },
            {
                $project: {
                    action: '$_id.action',
                    module: '$_id.module',
                    count: 1,
                    userCount: { $size: '$users' },
                    recent: 1
                }
            },
            { $sort: { count: -1 } }
        ]);
    } catch (error) {
        console.error('Error in getAuditAnalytics:', error);
        throw new Error(`Failed to fetch audit analytics: ${error.message}`);
    }
}

/**
 * Get risk analysis by user
 */
async function getRiskAnalysis(orgId) {
    try {
        if (!orgId) throw new Error('Organization ID is required');

        const riskyActions = ['DELETE_INVOICE', 'EXPORT_DATA', 'FORCE_UPDATE', 'MODIFY_PERMISSIONS', 'OVERRIDE_SETTINGS'];
        
        return await AuditLog.aggregate([
            { 
                $match: { 
                    organizationId: toObjectId(orgId),
                    action: { $in: riskyActions }
                } 
            },
            {
                $group: {
                    _id: '$userId',
                    riskCount: { $sum: 1 },
                    actions: { $push: { action: '$action', timestamp: '$createdAt', module: '$module' } },
                    lastRiskyAction: { $max: '$createdAt' }
                }
            },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
            { $unwind: '$user' },
            {
                $project: {
                    userId: '$_id',
                    userName: '$user.name',
                    userEmail: '$user.email',
                    riskCount: 1,
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
                    actions: { $slice: ['$actions', 5] } // Last 5 actions
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
 * Get user activity logs with filters
 */
async function getUserActivityLogs(orgId, userId = null, startDate, endDate, limit = 50) {
    try {
        if (!orgId) throw new Error('Organization ID is required');

        const match = {
            organizationId: toObjectId(orgId),
            createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
        };

        if (userId) {
            match.userId = toObjectId(userId);
        }

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
 * Senior Architect Refactor: Suspicious Activity Detection
 * Fixed: RAM limits, Data Privacy, and Timezone issues.
 */
async function getSuspiciousActivities(orgId, thresholdHours = 24) {
    try {
        if (!orgId) throw new Error('Organization ID is required');

        // Force UTC Absolute Time
        const cutoff = new Date(Date.now() - (thresholdHours * 60 * 60 * 1000));

        return await AuditLog.aggregate([
            { 
                $match: { 
                    organizationId: toObjectId(orgId),
                    createdAt: { $gte: cutoff } 
                } 
            },
            {
                $group: {
                    _id: '$userId',
                    activityCount: { $sum: 1 },
                    ipAddresses: { $addToSet: '$ipAddress' },
                    differentActions: { $addToSet: '$action' }
                }
            },
            // Threshold: Keep the working set small for performance
            { $match: { activityCount: { $gte: 20 } } }, 
            { 
                $lookup: { 
                    from: 'users', 
                    let: { uid: '$_id' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$_id', '$$uid'] } } },
                        { $project: { name: 1, email: 1 } } // ZERO sensitive data leakage
                    ],
                    as: 'user' 
                } 
            },
            { $unwind: '$user' },
            {
                $project: {
                    userName: '$user.name',
                    activityCount: 1,
                    uniqueIPCount: { $size: '$ipAddresses' },
                    // Risk scoring logic: High IP diversity = High Risk
                    suspiciousScore: {
                        $add: [
                            { $multiply: ['$activityCount', 0.2] },
                            { $multiply: [{ $size: '$ipAddresses' }, 10] } 
                        ]
                    }
                }
            },
            { $sort: { suspiciousScore: -1 } }
        ]).allowDiskUse(true); // Prevent memory-limit crashes
    } catch (error) {
        throw new Error(`Security Analytics Audit Failed: ${error.message}`);
    }
}
// /**
//  * Detect suspicious activities
//  */
// async function getSuspiciousActivities(orgId, thresholdHours = 24) {
//     try {
//         if (!orgId) throw new Error('Organization ID is required');

//         const cutoff = new Date();
//         cutoff.setHours(cutoff.getHours() - thresholdHours);

//         return await AuditLog.aggregate([
//             { 
//                 $match: { 
//                     organizationId: toObjectId(orgId),
//                     createdAt: { $gte: cutoff }
//                 } 
//             },
//             {
//                 $group: {
//                     _id: '$userId',
//                     activityCount: { $sum: 1 },
//                     differentActions: { $addToSet: '$action' },
//                     ipAddresses: { $addToSet: '$ipAddress' },
//                     recentActivities: { $push: { action: '$action', time: '$createdAt', module: '$module' } }
//                 }
//             },
//             { $match: { activityCount: { $gte: 20 } } }, // Suspicious if >20 activities in threshold period
//             { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
//             { $unwind: '$user' },
//             {
//                 $project: {
//                     userId: '$_id',
//                     userName: '$user.name',
//                     userEmail: '$user.email',
//                     activityCount: 1,
//                     differentActionCount: { $size: '$differentActions' },
//                     uniqueIPs: { $size: '$ipAddresses' },
//                     suspiciousScore: {
//                         $add: [
//                             { $multiply: ['$activityCount', 0.5] },
//                             { $multiply: [{ $size: '$differentActions' }, 2] },
//                             { $multiply: [{ $size: '$ipAddresses' }, 3] }
//                         ]
//                     },
//                     recentActivities: { $slice: ['$recentActivities', 10] }
//                 }
//             },
//             { $sort: { suspiciousScore: -1 } }
//         ]);
//     } catch (error) {
//         console.error('Error in getSuspiciousActivities:', error);
//         throw new Error(`Failed to fetch suspicious activities: ${error.message}`);
//     }
// }

module.exports = {
    getSecurityPulse,
    // Add other security/audit related functions here
    getAuditAnalytics,
    getRiskAnalysis,
    getUserActivityLogs,
    getSuspiciousActivities
};
