const Sales = require('../../inventory/core/sales.model');
const Product = require('../../inventory/core/product.model');
const Customer = require('../../organization/core/customer.model');


const getExportData = async (orgId, type, startDate, endDate) => {
    const query = { organizationId: orgId };

    // Apply Date Filters
    if (startDate || endDate) {
        const dateFilter = {};
        if (startDate) dateFilter.$gte = new Date(startDate);
        if (endDate) dateFilter.$lte = new Date(endDate);
        
        // Use 'updatedAt' for inventory (to see stock movement) or remove date filter for current stock
        // For Sales/Customers we use createdAt
        const dateField = type === 'inventory' ? 'updatedAt' : 'createdAt';
        
        // Note: Usually inventory export is "Current State", so we might skip date filter for it
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
            // For inventory, we usually want active products
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
            // Manually calculate stock from inventory array since virtuals don't work in lean()
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

const convertToCSV = (data, config) => {
    if (!data || !data.length) return '';

    // Create Header Row
    const headers = config.map(c => `"${c.header}"`).join(',');

    // Create Data Rows
    const rows = data.map(row => {
        return config.map(col => {
            // Get raw value (supports nested keys like 'customerId.name')
            let val = getNestedValue(row, col.key);

            // Apply transformations (e.g. counting items array)
            if (col.transform) {
                val = col.transform(val);
            }

            // Handle null/undefined
            if (val === undefined || val === null) {
                val = col.default || '';
            } 
            // Handle Dates
            else if (col.format === 'date') {
                try {
                    val = new Date(val).toISOString().split('T')[0];
                } catch (e) { val = ''; }
            } 
            // Handle Currency
            else if (col.format === 'currency') {
                val = Number(val).toFixed(2);
            }

            // Escape quotes in data to prevent CSV breaking
            // e.g. 'John "The Rock"' becomes '"John ""The Rock"""'
            const stringVal = String(val).replace(/"/g, '""');
            
            return `"${stringVal}"`;
        }).join(',');
    });

    return [headers, ...rows].join('\n');
};

const convertToExcel = async (data, config) => {
    try {
        // Stub - implement Excel conversion
        // For now, return CSV as buffer
        const csv = this.convertToCSV(data, config);
        return Buffer.from(csv, 'utf-8');
    } catch (error) {
        console.error('Error in convertToExcel:', error);
        return Buffer.from('');
    }
};

const convertToPDF = async (data, config) => {
    try {
        // Stub - implement PDF conversion
        const csv = this.convertToCSV(data, config);
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
