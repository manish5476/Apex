const mongoose = require('mongoose');
const Invoice = require('../../accounting/billing/invoice.model');
const Payment = require('../../accounting/payments/payment.model');
const Note = require('../models/noteModel');
const catchAsync = require('../../../core/utils/catchAsync');

exports.getCustomerFeed = catchAsync(async (req, res, next) => {
    const { customerId } = req.params;
    const orgId = req.user.organizationId;
    const limit = parseInt(req.query.limit) || 20;

    // Fetch parallelly
    const [invoices, payments, notes] = await Promise.all([
        Invoice.find({ organizationId: orgId, customerId }).select('invoiceNumber grandTotal status invoiceDate').lean(),
        Payment.find({ organizationId: orgId, customerId }).select('referenceNumber amount status paymentDate paymentMethod').lean(),
        Note.find({ organizationId: orgId, relatedTo: customerId }).select('content createdAt').populate('createdBy', 'name').lean()
    ]);

    // Normalize & Merge
    const feed = [
        ...invoices.map(i => ({
            type: 'invoice',
            id: i._id,
            date: i.invoiceDate,
            title: `Invoice #${i.invoiceNumber}`,
            subtitle: `Amount: ${i.grandTotal}`,
            status: i.status,
            icon: 'file-text'
        })),
        ...payments.map(p => ({
            type: 'payment',
            id: p._id,
            date: p.paymentDate,
            title: `Payment Received`,
            subtitle: `Amount: ${p.amount} via ${p.paymentMethod}`,
            status: p.status,
            icon: 'dollar-sign'
        })),
        ...notes.map(n => ({
            type: 'note',
            id: n._id,
            date: n.createdAt,
            title: `Note by ${n.createdBy?.name || 'Unknown'}`,
            subtitle: n.content,
            status: 'info',
            icon: 'message-square'
        }))
    ];

    // Sort Descending
    feed.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.status(200).json({
        status: 'success',
        results: feed.length,
        data: { feed: feed.slice(0, limit) }
    });
});