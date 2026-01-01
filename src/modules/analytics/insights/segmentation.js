const mongoose = require('mongoose');
const Invoice = require('../../models/invoiceModel');

const toObjectId = (id) => (id ? new mongoose.Types.ObjectId(id) : null);


// ------------------------ RFM SEGMENTATION ------------------------

exports.getRFM = async ({ orgId }) => {

    const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };

    const now = new Date();

    const data = await Invoice.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$customerId',
                lastPurchase: { $max: '$invoiceDate' },
                frequency: { $sum: 1 },
                monetary: { $sum: '$grandTotal' }
            }
        }
    ]);

    if (!data.length) {
        return {
            summary: { totalCustomers: 0 },
            alerts: { warning: 'No invoice history available for segmentation.' },
            charts: [],
            reportTables: [],
            advisory: [ 'Start recording sales before segmentation has meaning.' ]
        };
    }

    // Map scores
    const scored = data.map(entry => {
        const daysSinceLast = Math.floor((now - entry.lastPurchase) / 86400000);

        const r = daysSinceLast <= 30 ? 3 : (daysSinceLast <= 90 ? 2 : 1);
        const f = entry.frequency >= 10 ? 3 : (entry.frequency >= 3 ? 2 : 1);
        const m = entry.monetary >= 50000 ? 3 : (entry.monetary >= 10000 ? 2 : 1);

        let segment = 'Standard';

        if (r === 3 && f === 3 && m === 3) segment = 'Champion';
        else if (r === 1 && m === 3) segment = 'At Risk';
        else if (r === 3 && f === 1) segment = 'New Customer';
        else if (f === 3) segment = 'Loyal';

        return { ...entry, segment, r, f, m };
    });

    const segmentCount = scored.reduce((acc, cur) => {
        acc[cur.segment] = (acc[cur.segment] || 0) + 1;
        return acc;
    }, {});


    // Advisory logic
    const advisory = [];

    if (segmentCount['At Risk'] > 0) {
        advisory.push('Customers marked "At Risk" need proactive engagement — emails, offers, or reminders.');
    }

    if (segmentCount['Champion'] > 0) {
        advisory.push('Champions should be protected with loyalty benefits or exclusive access.');
    }

    if (segmentCount['New Customer'] > segmentCount['Champion']) {
        advisory.push('Large inflow of new buyers detected — automate onboarding nurture sequences.');
    }

    if (segmentCount['Loyal'] > 0) {
        advisory.push('Loyal customers present upsell opportunities — topic: accessories, AMC, warranties.');
    }

    return {
        summary: {
            totalCustomers: scored.length,
            segments: segmentCount
        },
        alerts: segmentCount['At Risk'] > scored.length * 0.2
            ? { risk: 'High churn risk detected — retention priority.' }
            : {},
        charts: [
            { label: 'Customer Segment Breakdown', dataset: Object.entries(segmentCount).map(([k,v]) => ({ segment:k, count:v })) }
        ],
        reportTables: {
            rfmTable: scored
        },
        advisory
    };
};




// ------------------------ COHORT RETENTION ------------------------

exports.getCohortRetention = async ({ orgId, monthsBack = 6 }) => {

    const match = { organizationId: toObjectId(orgId), status: { $ne: 'cancelled' } };

    const start = new Date();
    start.setMonth(start.getMonth() - monthsBack);
    start.setDate(1);

    const raw = await Invoice.aggregate([
        { $match: { ...match, invoiceDate: { $gte: start } } },
        {
            $group: {
                _id: '$customerId',
                firstPurchase: { $min: '$invoiceDate' },
                purchases: { $push: '$invoiceDate' }
            }
        },
        {
            $project: {
                cohort: { $dateToString: { format: '%Y-%m', date: '$firstPurchase' } },
                activeMonths: {
                    $map: {
                        input: '$purchases',
                        as: 'd',
                        in: { $dateToString: { format: '%Y-%m', date: '$$d' } }
                    }
                }
            }
        },
        { $unwind: '$activeMonths' },
        {
            $group: {
                _id: { cohort: '$cohort', active: '$activeMonths' },
                customers: { $addToSet: '$_id' }
            }
        },
        { $project: { cohort: '$_id.cohort', active: '$_id.active', count: { $size: '$customers' }, _id: 0 } },
        { $sort: { cohort: 1, active: 1 } }
    ]);

    if (!raw.length) {
        return {
            summary: {},
            alerts: { warning: 'Not enough purchasing history to form cohorts.' },
            charts: [],
            reportTables: [],
            advisory: [
                'Cohort analysis begins to matter once more than 3 months of customer repeat patterns exist.'
            ]
        };
    }

    const cohortMap = {};
    raw.forEach(row => {
        if (!cohortMap[row.cohort]) cohortMap[row.cohort] = {};
        cohortMap[row.cohort][row.active] = row.count;
    });

    // Generate retention % grid
    const retention = Object.entries(cohortMap).map(([cohort, months]) => {
        const base = months[cohort] || 0;
        const row = { cohort, base, months: [] };

        Object.entries(months).forEach(([m, count]) => {
            row.months.push({
                month: m,
                count,
                retention: base > 0 ? Math.round((count / base) * 100) : 0
            });
        });

        return row;
    });

    // Advisory
    const advisory = [];
    const avgRetention = retention.reduce((acc, r) => acc + (r.months[1]?.retention || 0), 0) / retention.length;

    if (avgRetention > 50) advisory.push('Strong month-2 retention. Customers find repeat value.');
    else advisory.push('Retention weak after first purchase — run loyalty and feedback campaigns.');

    if (retention.length >= 6) {
        advisory.push('Retention trend detectable across multiple cohorts — optimize based on best-performing month.');
    }

    return {
        summary: {
            cohortsAnalyzed: retention.length,
            avgSecondMonthRetention: Math.round(avgRetention)
        },
        alerts: avgRetention < 25
            ? { risk: 'Low retention detected — customer lifecycle health weak.' }
            : {},
        charts: [
            { label: 'Cohort Retention Matrix', dataset: retention }
        ],
        reportTables: { retention },
        advisory
    };
};
