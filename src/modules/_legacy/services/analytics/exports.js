const mongoose = require('mongoose');
const Invoice = require('../../../accounting/billing/invoice.model');
const Product = require('../../../inventory/core/product.model');

const toObjectId = (id) => (id ? new mongoose.Types.ObjectId(id) : null);

// --------------------------------------------------
// 1. SALES EXPORT (Invoice-level snapshot)
// --------------------------------------------------
const getSalesExportRows = async ({ orgId, startDate, endDate }) => {
    const match = { organizationId: toObjectId(orgId), invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) }, isDeleted: { $ne: true } };
    const invoices = await Invoice.find(match).populate('customerId', 'name').populate('branchId', 'name').lean();
    return invoices.map(inv => ({
        Date: inv.invoiceDate ? inv.invoiceDate.toISOString().split('T')[0] : '',
        InvoiceNo: inv.invoiceNumber,
        Customer: inv.customerId?.name || 'Walk-in',
        Branch: inv.branchId?.name || 'Main',
        Amount: inv.grandTotal,
        Taxable: inv.subTotal,
        TaxAmount: inv.totalTax,
        Discount: inv.totalDiscount,
        Status: inv.paymentStatus,
        PaymentMethod: inv.paymentMethod,
        CreatedAt: inv.createdAt ? inv.createdAt.toISOString() : '',
    }));
};


// --------------------------------------------------
// 2. INVENTORY EXPORT (Flatten inventory per branch)
// --------------------------------------------------
const getInventoryExportRows = async ({ orgId }) => {
    const products = await Product.find({
        organizationId: toObjectId(orgId),
        isActive: { $ne: false }
    })
        .populate('defaultSupplierId', 'companyName')
        .lean();

    const rows = [];

    products.forEach(p => {
        if (Array.isArray(p.inventory) && p.inventory.length > 0) {
            p.inventory.forEach(inv => {
                rows.push({
                    Product: p.name,
                    SKU: p.sku,
                    Category: p.category || '',
                    Brand: p.brand || '',
                    BranchId: inv.branchId ? String(inv.branchId) : '',
                    Stock: inv.quantity,
                    ReorderLevel: inv.reorderLevel ?? 0,
                    PurchasePrice: p.purchasePrice,
                    SellingPrice: p.sellingPrice,
                    StockValue: inv.quantity * (p.purchasePrice || 0),
                    DefaultSupplier: p.defaultSupplierId?.companyName || ''
                });
            });
        } else {
            rows.push({
                Product: p.name,
                SKU: p.sku,
                Category: p.category || '',
                Brand: p.brand || '',
                BranchId: '',
                Stock: 0,
                ReorderLevel: 0,
                PurchasePrice: p.purchasePrice,
                SellingPrice: p.sellingPrice,
                StockValue: 0,
                DefaultSupplier: p.defaultSupplierId?.companyName || ''
            });
        }
    });

    return rows;
};


// --------------------------------------------------
// 3. TAX EXPORT (GST / Tax breakdown)
// --------------------------------------------------
const getTaxExportRows = async ({ orgId, startDate, endDate }) => {
    const match = {
        organizationId: toObjectId(orgId),
        invoiceDate: { $gte: new Date(startDate), $lte: new Date(endDate) },
        status: { $ne: 'cancelled' },
        isDeleted: { $ne: true }
    };

    const invoices = await Invoice.find(match)
        .populate('customerId', 'name')
        .lean();

    return invoices.map(inv => ({
        Date: inv.invoiceDate ? inv.invoiceDate.toISOString().split('T')[0] : '',
        InvoiceNo: inv.invoiceNumber,
        Customer: inv.customerId?.name || 'Walk-in',
        TaxableValue: inv.subTotal,
        TaxAmount: inv.totalTax,
        Total: inv.grandTotal,
        GSTType: inv.gstType || '',
        PlaceOfSupply: inv.placeOfSupply || '',
    }));
};


// --------------------------------------------------
// 4. UNIFIED EXPORT DISPATCHER
// --------------------------------------------------
exports.getExportData = async ({ orgId, type, startDate, endDate }) => {
    if (!type) {
        throw new Error('Export type is required (sales | inventory | tax)');
    }

    // Normalise type
    const t = String(type).toLowerCase();

    if (t === 'sales') {
        const rows = await getSalesExportRows({ orgId, startDate, endDate });
        return {
            type: 'sales',
            period: { startDate, endDate },
            rows
        };
    }

    if (t === 'inventory') {
        const rows = await getInventoryExportRows({ orgId });
        return {
            type: 'inventory',
            rows
        };
    }

    if (t === 'tax') {
        const rows = await getTaxExportRows({ orgId, startDate, endDate });
        return { type: 'tax', period: { startDate, endDate }, rows };
    }

    throw new Error(`Unsupported export type: ${type}`);
};


// Optionally export raw helpers if you ever want direct use:
exports._helpers = {
    getSalesExportRows,
    getInventoryExportRows,
    getTaxExportRows
};
