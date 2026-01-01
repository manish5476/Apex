const mongoose = require('mongoose');
const AuditLog = require('../../models/auditLogModel');
const Session = require('../../models/sessionModel');

const toObjectId = (id) => (id ? new mongoose.Types.ObjectId(id) : null);


// ----------------------------
// SECURITY EVENTS + RISK TRENDS
// ----------------------------

exports.getSecurityPulse = async ({ orgId, startDate, endDate }) => {

    const match = {
        organizationId: toObjectId(orgId),
        createdAt: { $gte: startDate, $lte: endDate }
    };

    const logs = await AuditLog.find(match)
        .sort({ createdAt: -1 })
        .limit(50)
        .populate('userId', 'name email')
        .lean();


    // Risk classification
    const riskKeywords = [
        'DELETE',
        'EXPORT',
        'FORCE_UPDATE',
        'RESET',
        'PRIVILEGE_CHANGE'
    ];

    const riskyActions = logs.filter(l =>
        riskKeywords.some(k => l.action.toUpperCase().includes(k))
    );


    // Pattern: too many reads/exports in short time
    const excessiveExport = logs.filter(l =>
        l.action.toLowerCase().includes('export')
    ).length > 10;


    return {
        period: { startDate, endDate },

        summary: {
            totalEvents: logs.length,
            riskyEvents: riskyActions.length
        },

        alerts: {
            excessiveExportsDetected: excessiveExport ? true : false,
            securityCritical: riskyActions.length >= 5
        },

        charts: [
            {
                label: 'Security Event Breakdown',
                dataset: [
                    { type: 'normal', count: logs.length - riskyActions.length },
                    { type: 'risky', count: riskyActions.length }
                ]
            }
        ],

        reportTables: {
            recentEvents: logs,
            riskyEvents: riskyActions
        },

        advisory: [
            riskyActions.length > 0
                ? 'Risk actions detected — review event log for insider threats.'
                : 'No high-risk actions detected.',
            excessiveExport
                ? 'Unusual number of exports observed — potential data leakage attempt.'
                : ''
        ].filter(Boolean)
    };
};



// ----------------------------
// LOGIN & SESSION RISK
// ----------------------------

exports.getAuthRiskProfile = async ({ orgId, days = 30 }) => {

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const sessions = await Session.find({
        organizationId: toObjectId(orgId),
        loggedInAt: { $gte: cutoff }
    }).lean();


    if (!sessions.length) {
        return {
            summary: { activeSessions: 0 },
            alerts: { advisory: 'No login activity detected — dashboard unused or system offline.' },
            charts: [],
            reportTables: [],
            advisory: [ 'Enable MFA if not enforced.' ]
        };
    }

    // Count unique IPs per user -> anomaly if > 5
    const userMap = {};
    sessions.forEach(s => {
        if (!userMap[s.userId]) userMap[s.userId] = new Set();
        if (s.ipAddress) userMap[s.userId].add(s.ipAddress);
    });

    const suspiciousIPUsage = Object.values(userMap).filter(ipSet => ipSet.size > 5).length;

    return {
        period: { windowDays: days },

        summary: {
            activeSessions: sessions.length,
            usersTracked: Object.keys(userMap).length
        },

        alerts: {
            suspiciousLoginPatterns: suspiciousIPUsage > 0
        },

        charts: [
            {
                label: 'Unique IP count per user',
                dataset: Object.entries(userMap).map(([uid, ips]) => ({
                    userId: uid,
                    uniqueIps: ips.size
                }))
            }
        ],

        reportTables: {
            sessionDetails: sessions
        },

        advisory: [
            suspiciousIPUsage > 0
                ? 'Multiple IPs per user detected — possible credential sharing.'
                : 'No abnormal authentication behavior detected.',
            'Consider enforcing IP whitelisting for staff accounts.',
            'Enable auto-logout and session expiry enforcement.'
        ]
    };
};



// ----------------------------
// SUSPICIOUS BEHAVIOR SCORING
// ----------------------------

exports.getSecurityRiskScore = async ({ orgId, startDate, endDate }) => {
    
    const match = {
        organizationId: toObjectId(orgId),
        createdAt: { $gte: startDate, $lte: endDate }
    };

    const logs = await AuditLog.find(match).lean();

    const scoreWeights = {
        export: 5,
        delete: 7,
        roleChange: 10,
        failedLogin: 4,
        forceUpdate: 6
    };

    let score = 0;

    logs.forEach(log => {
        const action = log.action.toLowerCase();
        if (action.includes('export')) score += scoreWeights.export;
        if (action.includes('delete')) score += scoreWeights.delete;
        if (action.includes('role')) score += scoreWeights.roleChange;
        if (action.includes('failed')) score += scoreWeights.failedLogin;
        if (action.includes('force')) score += scoreWeights.forceUpdate;
    });

    let riskLevel = 'LOW';
    if (score >= 100) riskLevel = 'CRITICAL';
    else if (score >= 50) riskLevel = 'HIGH';
    else if (score >= 20) riskLevel = 'MEDIUM';

    return {
        period: { startDate, endDate },

        summary: { riskScore: score, riskLevel },

        alerts: {
            systemThreat: riskLevel === 'CRITICAL' || riskLevel === 'HIGH'
        },

        charts: [
            {
                label: 'Security Score Timeline Placeholder (frontend handles time resolution)',
                score
            }
        ],

        reportTables: {
            contributingEvents: logs
        },

        advisory: [
            riskLevel === 'CRITICAL'
                ? 'Immediate admin review required — lock roles and audit user permissions.'
                : null,
            riskLevel === 'HIGH'
                ? 'Security posture vulnerable — restrict exports and enforce MFA.'
                : null,
            riskLevel === 'MEDIUM'
                ? 'Monitor activity — risk trending upward.'
                : 'System behavior stable.'
        ].filter(Boolean)
    };
};
