const Sales = require('../../inventory/core/sales.model');
const Product = require('../../inventory/core/product.model');
const Customer = require('../../organization/core/customer.model');

/* ==========================================================================
   📤 EXPORT ANALYTICS SERVICE
   ========================================================================== */

const getExportData = async (orgId, type, startDate, endDate) => {
    const query = { organizationId: orgId };

    if (startDate || endDate) {
        const dateFilter = {};
        if (startDate) dateFilter.$gte = new Date(startDate);
        if (endDate) dateFilter.$lte = new Date(endDate);

        const dateField = type === 'inventory' ? 'updatedAt' : 'createdAt';
        if (type !== 'inventory') {
            query[dateField] = dateFilter;
        }
    }

    switch (type) {
        case 'sales':
            return await Sales.find(query)
                .populate('customerId', 'name email phone')
                .sort({ createdAt: -1 })
                .lean();
        case 'inventory':
            query.isActive = true;
            return await Product.find(query)
                .populate('categoryId', 'name')
                .populate('brandId', 'name')
                .sort({ name: 1 })
                .lean();
        case 'customers':
            return await Customer.find(query)
                .sort({ name: 1 })
                .lean();
        default:
            throw new Error('Invalid export type. Must be sales, inventory, or customers.');
    }
};

const getExportConfig = (type) => {
    const configs = {
        sales: [
            { header: 'Date', key: 'createdAt', format: 'date' },
            { header: 'Invoice No', key: 'invoiceNumber' },
            { header: 'Customer', key: 'customerId.name', default: 'Walk-in' },
            { header: 'Status', key: 'status' },
            { header: 'Payment Status', key: 'paymentStatus' },
            { header: 'Total Amount', key: 'totalAmount', format: 'currency' },
            { header: 'Paid Amount', key: 'paidAmount', format: 'currency' },
            { header: 'Items Count', key: 'items', transform: (items) => items ? items.length : 0 }
        ],
        inventory: [
            { header: 'Product Name', key: 'name' },
            { header: 'SKU', key: 'sku' },
            { header: 'Category', key: 'categoryId.name', default: '-' },
            { header: 'Brand', key: 'brandId.name', default: '-' },
            { header: 'Selling Price', key: 'sellingPrice', format: 'currency' },
            { header: 'Total Stock', key: 'inventory', transform: (inv) => inv ? inv.reduce((sum, i) => sum + i.quantity, 0) : 0 },
            { header: 'Last Sold', key: 'lastSold', format: 'date' }
        ],
        customers: [
            { header: 'Name', key: 'name' },
            { header: 'Type', key: 'type' },
            { header: 'Phone', key: 'phone' },
            { header: 'Email', key: 'email', default: '-' },
            { header: 'GSTIN', key: 'gstNumber', default: '-' },
            { header: 'Outstanding Balance', key: 'outstandingBalance', format: 'currency' },
            { header: 'Total Purchases', key: 'totalPurchases', format: 'currency' },
            { header: 'Last Purchase', key: 'lastPurchaseDate', format: 'date' }
        ]
    };
    return configs[type] || [];
};

/**
 * Helper to get nested object values (e.g. 'customerId.name')
 */
const getNestedValue = (obj, key) => {
    return key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
};

const convertToCSV = (data, config) => {
    if (!data || !data.length) return '';

    const headers = config.map(c => `"${c.header}"`).join(',');

    const rows = data.map(row => {
        return config.map(col => {
            let val = getNestedValue(row, col.key);

            if (col.transform) val = col.transform(val);

            if (val === undefined || val === null) {
                val = col.default || '';
            } else if (col.format === 'date') {
                try { val = new Date(val).toISOString().split('T')[0]; }
                catch (e) { val = ''; }
            } else if (col.format === 'currency') {
                val = Number(val).toFixed(2);
            }

            const stringVal = String(val).replace(/"/g, '""');
            return `"${stringVal}"`;
        }).join(',');
    });

    return [headers, ...rows].join('\n');
};

// FIX: Use direct function call instead of `this.convertToCSV`
const convertToExcel = async (data, config) => {
    try {
        const csv = convertToCSV(data, config);
        return Buffer.from(csv, 'utf-8');
    } catch (error) {
        console.error('Error in convertToExcel:', error);
        return Buffer.from('');
    }
};

// FIX: Use direct function call instead of `this.convertToCSV`
const convertToPDF = async (data, config) => {
    try {
        const csv = convertToCSV(data, config);
        return Buffer.from(csv, 'utf-8');
    } catch (error) {
        console.error('Error in convertToPDF:', error);
        return Buffer.from('');
    }
};

module.exports = {
    getExportData,
    getExportConfig,
    convertToCSV,
    convertToExcel,
    convertToPDF
};
