'use strict';

const mongoose = require('mongoose');

const Branch   = require('../../organization/core/branch.model');
const Role     = require('../../auth/core/role.model');
const Customer = require('../../organization/core/customer.model');
const Supplier = require('../../organization/core/supplier.model');
const Product  = require('../../inventory/core/model/product.model');
const Master   = require('./model/master.model');
const Account  = require('../../accounting/core/model/account.model');
const User     = require('../../auth/core/user.model');
const Invoice  = require('../../accounting/billing/invoice.model');
const Purchase = require('../../inventory/core/model/purchase.model');
const Sales    = require('../../inventory/core/model/sales.model');
const Payment  = require('../../accounting/payments/payment.model');
const EMI      = require('../../accounting/payments/emi.model');
const { PERMISSIONS_LIST } = require('../../../config/permissions');

const catchAsync = require('../../../core/utils/api/catchAsync');
const AppError   = require('../../../core/utils/api/appError');
const { Parser } = require('json2csv');

// ── Escape regex special characters to prevent ReDoS ─────────────────────────
const escapeRegex = (text) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

// ── Org ID cast helper ────────────────────────────────────────────────────────
const toObjectId = (id) => new mongoose.Types.ObjectId(id);

// ── Base filter that every entity query must include ──────────────────────────
const baseFilter = (orgId) => ({
  organizationId: toObjectId(orgId),
  isDeleted:      { $ne: true },
});

// ── Static dropdown option lists (built once, not per request) ────────────────
const STATIC_OPTIONS = {
  status: [
    { value: 'all',      label: 'All Status' },
    { value: 'active',   label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ],
  dateRanges: [
    { value: 'today',      label: 'Today' },
    { value: 'yesterday',  label: 'Yesterday' },
    { value: 'this_week',  label: 'This Week' },
    { value: 'last_week',  label: 'Last Week' },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' },
    { value: 'this_year',  label: 'This Year' },
    { value: 'custom',     label: 'Custom Range' },
  ],
  paymentStatus: [
    { value: 'all',     label: 'All Payments' },
    { value: 'paid',    label: 'Paid' },
    { value: 'unpaid',  label: 'Unpaid' },
    { value: 'partial', label: 'Partial' },
  ],
  invoiceStatus: [
    { value: 'all',       label: 'All Status' },
    { value: 'draft',     label: 'Draft' },
    { value: 'issued',    label: 'Issued' },
    { value: 'paid',      label: 'Paid' },
    { value: 'cancelled', label: 'Cancelled' },
  ],
  gstTypes: [
    { value: 'all',         label: 'All GST Types' },
    { value: 'intra-state', label: 'Intra-State' },
    { value: 'inter-state', label: 'Inter-State' },
    { value: 'export',      label: 'Export' },
  ],
  paymentTypes: [
    { value: 'all',     label: 'All Types' },
    { value: 'inflow',  label: 'Inflow (Received)' },
    { value: 'outflow', label: 'Outflow (Paid)' },
  ],
  paymentMethods: [
    { value: 'all',    label: 'All Methods' },
    { value: 'cash',   label: 'Cash' },
    { value: 'bank',   label: 'Bank Transfer' },
    { value: 'upi',    label: 'UPI' },
    { value: 'cheque', label: 'Cheque' },
    { value: 'other',  label: 'Other' },
  ],
  emiStatus: [
    { value: 'all',       label: 'All Status' },
    { value: 'active',    label: 'Active' },
    { value: 'completed', label: 'Completed' },
    { value: 'defaulted', label: 'Defaulted' },
  ],
  stockStatus: [
    { value: 'all',        label: 'All Stock' },
    { value: 'inStock',    label: 'In Stock' },
    { value: 'outOfStock', label: 'Out of Stock' },
    { value: 'lowStock',   label: 'Low Stock (<10)' },
  ],
};

/* ============================================================================
   FILTER BUILDER UTILITY
   Builds a scoped, safe Mongoose query object for a given entity type.
   Only type-specific filters are applied — cross-type params are ignored.
============================================================================ */
const buildFilterQuery = (type, filters = {}, orgId) => {
  const query = { ...baseFilter(orgId) };

  // ── Search ──────────────────────────────────────────────────────────────────
  if (filters.search) {
    const searchRegex = new RegExp(escapeRegex(filters.search), 'i');
    switch (type) {
      case 'customer':
        query.$or = [
          { name:                  searchRegex },
          { phone:                 searchRegex },
          { email:                 searchRegex },
          { 'billingAddress.city': searchRegex },
        ];
        break;
      case 'supplier':
        query.$or = [
          { companyName:   searchRegex },
          { contactPerson: searchRegex },
          { phone:         searchRegex },
        ];
        break;
      case 'product':
        query.$or = [
          { name:     searchRegex },
          { sku:      searchRegex },
          { category: searchRegex },
          { brand:    searchRegex },
        ];
        break;
      case 'invoice':
        query.$or = [
          { invoiceNumber: searchRegex },
          { notes:         searchRegex },
        ];
        break;
      case 'payment':
        query.$or = [
          { referenceNumber: searchRegex },
          { transactionId:   searchRegex },
          { remarks:         searchRegex },
        ];
        break;
      case 'sales':
        query.$or = [
          { invoiceNumber: searchRegex },
          { notes:         searchRegex },
        ];
        break;
      case 'purchase':
        query.$or = [
          { invoiceNumber: searchRegex },
        ];
        break;
      default:
        query.name = searchRegex;
    }
  }

  // ── Status ──────────────────────────────────────────────────────────────────
  if (filters.status && filters.status !== 'all') {
    if (['active', 'inactive'].includes(filters.status)) {
      query.isActive = filters.status === 'active';
    } else {
      query.status = filters.status;
    }
  }

  // ── Date range (field name varies by entity type) ───────────────────────────
  if (filters.startDate || filters.endDate) {
    const dateFieldMap = {
      purchase: 'purchaseDate',
      invoice:  'invoiceDate',
      payment:  'paymentDate',
      sales:    'saleDate',
    };
    const dateField = dateFieldMap[type] || 'createdAt';
    query[dateField] = {};
    if (filters.startDate) query[dateField].$gte = new Date(filters.startDate);
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      query[dateField].$lte = end;
    }
  }

  // ── Type-specific filters ───────────────────────────────────────────────────
  switch (type) {
    case 'customer':
      if (filters.type && filters.type !== 'all') query.type = filters.type;
      if (filters.minBalance !== undefined || filters.maxBalance !== undefined) {
        query.outstandingBalance = {};
        if (filters.minBalance !== undefined) query.outstandingBalance.$gte = parseFloat(filters.minBalance);
        if (filters.maxBalance !== undefined) query.outstandingBalance.$lte = parseFloat(filters.maxBalance);
      }
      // Fixed: $nin handles both null and '' in a single operator
      if (filters.hasGst === 'true') query.gstNumber = { $exists: true, $nin: [null, ''] };
      break;

    case 'supplier':
      if (filters.minBalance !== undefined || filters.maxBalance !== undefined) {
        query.outstandingBalance = {};
        if (filters.minBalance !== undefined) query.outstandingBalance.$gte = parseFloat(filters.minBalance);
        if (filters.maxBalance !== undefined) query.outstandingBalance.$lte = parseFloat(filters.maxBalance);
      }
      break;

    case 'product':
      if (filters.category && filters.category !== 'all') query.category = filters.category;
      if (filters.brand    && filters.brand    !== 'all') query.brand    = filters.brand;
      if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
        query.sellingPrice = {};
        if (filters.minPrice !== undefined) query.sellingPrice.$gte = parseFloat(filters.minPrice);
        if (filters.maxPrice !== undefined) query.sellingPrice.$lte = parseFloat(filters.maxPrice);
      }
      // inStock and lowStock are mutually exclusive — lowStock takes priority if both passed
      if (filters.lowStock === 'true') {
        query.$or = [
          { 'inventory.quantity': { $gt: 0, $lte: 10 } },
          { totalStock:           { $gt: 0, $lte: 10 } },
        ];
      } else if (filters.inStock === 'true') {
        query.$or = [
          { 'inventory.quantity': { $gt: 0 } },
          { totalStock:           { $gt: 0 } },
        ];
      }
      break;

    case 'invoice':
      if (filters.paymentStatus && filters.paymentStatus !== 'all') query.paymentStatus = filters.paymentStatus;
      if (filters.invoiceStatus  && filters.invoiceStatus  !== 'all') query.status       = filters.invoiceStatus;
      if (filters.customerId     && filters.customerId     !== 'all') query.customerId   = filters.customerId;
      if (filters.branchId       && filters.branchId       !== 'all') query.branchId     = filters.branchId;
      if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
        query.grandTotal = {};
        if (filters.minAmount !== undefined) query.grandTotal.$gte = parseFloat(filters.minAmount);
        if (filters.maxAmount !== undefined) query.grandTotal.$lte = parseFloat(filters.maxAmount);
      }
      if (filters.overdue === 'true') {
        query.dueDate       = { $lt: new Date() };
        query.paymentStatus = { $in: ['unpaid', 'partial'] };
      }
      break;

    case 'payment':
      if (filters.paymentType   && filters.paymentType   !== 'all') query.type          = filters.paymentType;
      if (filters.paymentMethod && filters.paymentMethod !== 'all') query.paymentMethod = filters.paymentMethod;
      if (filters.customerId    && filters.customerId    !== 'all') query.customerId    = filters.customerId;
      if (filters.supplierId    && filters.supplierId    !== 'all') query.supplierId    = filters.supplierId;
      if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
        query.amount = {};
        if (filters.minAmount !== undefined) query.amount.$gte = parseFloat(filters.minAmount);
        if (filters.maxAmount !== undefined) query.amount.$lte = parseFloat(filters.maxAmount);
      }
      break;

    case 'emi':
      if (filters.emiStatus  && filters.emiStatus  !== 'all') query.status     = filters.emiStatus;
      if (filters.customerId && filters.customerId !== 'all') query.customerId = filters.customerId;
      break;

    case 'purchase':
      if (filters.paymentStatus && filters.paymentStatus !== 'all') query.paymentStatus = filters.paymentStatus;
      if (filters.supplierId    && filters.supplierId    !== 'all') query.supplierId    = filters.supplierId;
      if (filters.branchId      && filters.branchId      !== 'all') query.branchId      = filters.branchId;
      break;

    case 'sales':
      if (filters.customerId && filters.customerId !== 'all') query.customerId = filters.customerId;
      if (filters.branchId   && filters.branchId   !== 'all') query.branchId   = filters.branchId;
      break;

    case 'user':
      if (filters.role     && filters.role     !== 'all') query.role     = filters.role;
      if (filters.branchId && filters.branchId !== 'all') query.branchId = filters.branchId;
      break;
  }

  return query;
};

/* ============================================================================
   ENRICH DATA — adds computed/display fields per entity type
============================================================================ */
const enrichData = (type, items) => {
  const now = new Date();

  return items.map(item => {
    switch (type) {
      case 'payment': {
        const isReceived = item.type === 'inflow';
        const name       = isReceived
          ? item.customerId?.name          || 'Unknown Customer'
          : item.supplierId?.companyName   || 'Unknown Supplier';
        const symbol = isReceived ? '+' : '-';
        return {
          ...item,
          customLabel:     `${symbol} ₹${item.amount} | ${name} | ${item.referenceNumber || 'No Ref'}`,
          searchKey:       `${item.amount} ${item.referenceNumber} ${name} ${item.paymentMethod}`,
          formattedAmount: `${symbol}₹${item.amount}`,
          statusColor:     item.status === 'completed' ? 'green' : item.status === 'pending' ? 'orange' : 'red',
          direction:       isReceived ? 'Received' : 'Paid',
          source:          name,
        };
      }

      case 'emi': {
        const cust     = item.customerId?.name         || 'Unknown';
        const inv      = item.invoiceId?.invoiceNumber || 'No Invoice';
        const progress = item.totalAmount > 0
          ? ((item.totalAmount - item.balanceAmount) / item.totalAmount) * 100
          : 0;
        const installmentAmt = item.numberOfInstallments > 0
          ? item.totalAmount / item.numberOfInstallments
          : 0;
        return {
          ...item,
          customLabel:            `${cust} (${inv}) - ${item.status?.toUpperCase()} (${progress.toFixed(0)}%)`,
          searchKey:              `${cust} ${inv} ${item.status}`,
          progress,
          remainingInstallments:  installmentAmt > 0 ? Math.ceil(item.balanceAmount / installmentAmt) : 0,
        };
      }

      case 'invoice':
      case 'sales': {
        const customer   = item.customerId?.name  || 'Unknown';
        const phone      = item.customerId?.phone || '';
        const isOverdue  = !!(item.dueDate && new Date(item.dueDate) < now &&
                             ['unpaid', 'partial'].includes(item.paymentStatus));
        const overdueDays = isOverdue
          ? Math.floor((now - new Date(item.dueDate)) / 86400000)
          : 0;
        return {
          ...item,
          customLabel:  `${item.invoiceNumber} - ${customer}${phone ? ` (${phone})` : ''}`,
          searchKey:    `${item.invoiceNumber} ${customer} ${phone}`,
          isOverdue,
          overdueDays,
          statusColor:  item.paymentStatus === 'paid' ? 'green'
                      : item.paymentStatus === 'partial' ? 'orange' : 'red',
        };
      }

      case 'customer': {
        const city          = item.billingAddress?.city  || '';
        const state         = item.billingAddress?.state || '';
        const balanceStatus = item.outstandingBalance > 0 ? 'Due' : 'Clear';
        return {
          ...item,
          customLabel:   `${item.name} (${item.phone}) - ${balanceStatus}: ₹${item.outstandingBalance}`,
          searchKey:     `${item.name} ${item.phone} ${city} ${state}`,
          location:      city ? `${city}, ${state}` : 'Location not set',
          balanceStatus,
          balanceColor:  item.outstandingBalance > 0 ? 'red' : 'green',
        };
      }

      case 'supplier': {
        const city          = item.address?.city  || '';
        const state         = item.address?.state || '';
        const balanceStatus = item.outstandingBalance > 0 ? 'Due' : 'Clear';
        return {
          ...item,
          customLabel:   `${item.companyName} (${item.contactPerson || 'No Contact'})`,
          searchKey:     `${item.companyName} ${item.contactPerson} ${item.phone}`,
          location:      city ? `${city}, ${state}` : 'Location not set',
          balanceStatus,
          balanceColor:  item.outstandingBalance > 0 ? 'red' : 'green',
        };
      }

      case 'product': {
        const stock       = item.totalStock || 0;
        const stockStatus = stock > 10 ? 'In Stock' : stock > 0 ? 'Low Stock' : 'Out of Stock';
        const stockColor  = stock > 10 ? 'green'    : stock > 0 ? 'orange'    : 'red';
        const profit      = (item.sellingPrice || 0) - (item.purchasePrice || 0);
        const margin      = item.sellingPrice > 0 ? (profit / item.sellingPrice) * 100 : 0;
        return {
          ...item,
          customLabel:    `${item.name} (${item.sku}) - ${stockStatus}: ${stock}`,
          searchKey:      `${item.name} ${item.sku} ${item.category} ${item.brand}`,
          stockStatus,
          stockColor,
          inStock:        stock > 0,
          lowStock:       stock > 0 && stock <= 10,
          profit,
          margin,
          formattedPrice: `₹${item.sellingPrice}`,
          formattedCost:  item.purchasePrice ? `₹${item.purchasePrice}` : 'Not set',
        };
      }

      case 'user': {
        return {
          ...item,
          customLabel:         `${item.name} (${item.email}) - ${item.isActive ? 'Active' : 'Inactive'}`,
          searchKey:           `${item.name} ${item.email} ${item.role?.name || ''}`,
          status:              item.isActive ? 'Active' : 'Inactive',
          statusColor:         item.isActive ? 'green' : 'red',
          lastLoginFormatted:  item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleDateString() : 'Never',
        };
      }

      case 'purchase': {
        const supplier      = item.supplierId?.companyName || 'Unknown';
        const purchaseStatus = item.paymentStatus === 'paid' ? 'Paid'
                             : item.paymentStatus === 'partial' ? 'Partial' : 'Pending';
        return {
          ...item,
          customLabel:    `${item.invoiceNumber} - ${supplier} - ${purchaseStatus}`,
          searchKey:      `${item.invoiceNumber} ${supplier} ${item.paymentStatus}`,
          purchaseStatus,
          statusColor:    item.paymentStatus === 'paid' ? 'green'
                        : item.paymentStatus === 'partial' ? 'orange' : 'red',
        };
      }

      default:
        return item;
    }
  });
};

/* ============================================================================
   GET FILTER OPTIONS
   Returns dropdown options for a given entity type.
   Static options served from constants; dynamic options fetched from DB.
   GET /master/filter-options?type=invoice
============================================================================ */
exports.getFilterOptions = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const { type } = req.query;

  if (!type) return next(new AppError("Please provide a 'type' query parameter", 400));

  const options = {
    common: {
      status:     STATIC_OPTIONS.status,
      dateRanges: STATIC_OPTIONS.dateRanges,
    },
  };

  // Dropdown cap for safety
  const DROPDOWN_LIMIT = 500;
  const activeFilter   = { organizationId: orgId, isActive: true, isDeleted: { $ne: true } };

  switch (type.toLowerCase()) {
    case 'customer': {
      const [customerTypes, cities] = await Promise.all([
        Customer.distinct('type', activeFilter),
        // billingAddress is a subdoc (not array) — no $unwind needed
        Customer.aggregate([
          { $match: { ...activeFilter, 'billingAddress.city': { $exists: true, $nin: [null, ''] } } },
          { $group: { _id: '$billingAddress.city' } },
          { $sort:  { _id: 1 } },
          { $limit: 200 },
        ]),
      ]);
      options.type   = [{ value: 'all', label: 'All Types' }, ...customerTypes.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))];
      options.cities = [{ value: 'all', label: 'All Cities' }, ...cities.map(c => ({ value: c._id, label: c._id }))];
      break;
    }

    case 'supplier': {
      const cities = await Supplier.aggregate([
        { $match: { ...activeFilter, 'address.city': { $exists: true, $nin: [null, ''] } } },
        { $group: { _id: '$address.city' } },
        { $sort:  { _id: 1 } },
        { $limit: 200 },
      ]);
      options.cities = [{ value: 'all', label: 'All Cities' }, ...cities.map(c => ({ value: c._id, label: c._id }))];
      break;
    }

    case 'product': {
      const [categories, brands] = await Promise.all([
        Product.distinct('category', { ...activeFilter, category: { $exists: true, $nin: [null, ''] } }),
        Product.distinct('brand',    { ...activeFilter, brand:    { $exists: true, $nin: [null, ''] } }),
      ]);
      options.categories  = [{ value: 'all', label: 'All Categories' }, ...categories.map(c => ({ value: c, label: c }))];
      options.brands      = [{ value: 'all', label: 'All Brands' },     ...brands.map(b => ({ value: b, label: b }))];
      options.stockStatus = STATIC_OPTIONS.stockStatus;
      break;
    }

    case 'invoice': {
      const customers = await Customer.find(activeFilter)
        .select('_id name').sort('name').limit(DROPDOWN_LIMIT).lean();
      options.paymentStatus = STATIC_OPTIONS.paymentStatus;
      options.invoiceStatus = STATIC_OPTIONS.invoiceStatus;
      options.gstTypes      = STATIC_OPTIONS.gstTypes;
      options.customers     = [{ value: 'all', label: 'All Customers' }, ...customers.map(c => ({ value: c._id, label: c.name }))];
      break;
    }

    case 'payment': {
      const [customers, suppliers] = await Promise.all([
        Customer.find(activeFilter).select('_id name').sort('name').limit(DROPDOWN_LIMIT).lean(),
        Supplier.find(activeFilter).select('_id companyName').sort('companyName').limit(DROPDOWN_LIMIT).lean(),
      ]);
      options.paymentTypes   = STATIC_OPTIONS.paymentTypes;
      options.paymentMethods = STATIC_OPTIONS.paymentMethods;
      options.customers      = [{ value: 'all', label: 'All Customers' }, ...customers.map(c => ({ value: c._id, label: c.name }))];
      options.suppliers      = [{ value: 'all', label: 'All Suppliers' }, ...suppliers.map(s => ({ value: s._id, label: s.companyName }))];
      break;
    }

    case 'emi': {
      const customers = await Customer.find(activeFilter)
        .select('_id name').sort('name').limit(DROPDOWN_LIMIT).lean();
      options.emiStatus = STATIC_OPTIONS.emiStatus;
      options.customers = [{ value: 'all', label: 'All Customers' }, ...customers.map(c => ({ value: c._id, label: c.name }))];
      break;
    }

    case 'purchase': {
      const suppliers = await Supplier.find(activeFilter)
        .select('_id companyName').sort('companyName').limit(DROPDOWN_LIMIT).lean();
      options.paymentStatus = STATIC_OPTIONS.paymentStatus;
      options.suppliers     = [{ value: 'all', label: 'All Suppliers' }, ...suppliers.map(s => ({ value: s._id, label: s.companyName }))];
      break;
    }

    case 'sales': {
      const customers = await Customer.find(activeFilter)
        .select('_id name').sort('name').limit(DROPDOWN_LIMIT).lean();
      options.customers = [{ value: 'all', label: 'All Customers' }, ...customers.map(c => ({ value: c._id, label: c.name }))];
      break;
    }

    case 'user': {
      const roles = await Role.find({ organizationId: orgId, isDeleted: false, isActive: true })
        .select('_id name').sort('name').lean();
      options.roles = [{ value: 'all', label: 'All Roles' }, ...roles.map(r => ({ value: r._id, label: r.name }))];
      break;
    }
  }

  // Add branches for transaction types
  if (['invoice', 'purchase', 'sales', 'payment'].includes(type.toLowerCase())) {
    const branches = await Branch.find({ organizationId: orgId, isActive: true, isDeleted: { $ne: true } })
      .select('_id name').sort('name').lean();
    options.branches = [{ value: 'all', label: 'All Branches' }, ...branches.map(b => ({ value: b._id, label: b.name }))];
  }

  res.status(200).json({ status: 'success', data: options });
});

/* ============================================================================
   GET MASTER LIST
   Lightweight dropdown-safe lists for all entity types.
   Does NOT return full records — only the fields needed for dropdowns and
   reference data (IDs + display names).
   Heavy transaction data (invoices, payments) is capped at sensible limits.
   GET /master/list
============================================================================ */
exports.getMasterList = catchAsync(async (req, res, next) => {
  const orgId      = req.user.organizationId;
  const activeBase = { organizationId: orgId, isActive: true, isDeleted: { $ne: true } };
  const txBase     = { organizationId: toObjectId(orgId), isDeleted: { $ne: true } };

  const [
    branches,
    roles,
    customers,
    suppliers,
    products,
    masters,
    accounts,
    users,
    recentInvoices,
    recentPurchases,
    recentSales,
    recentPayments,
    emis,
  ] = await Promise.all([
    Branch.find(activeBase)
      .select('_id name branchCode isMainBranch')
      .sort('name')
      .lean(),

    Role.find({ organizationId: orgId, isActive: true, isDeleted: { $ne: true } })
      .select('_id name description isSuperAdmin')
      .sort('name')
      .lean(),

    // Dropdown-safe: only ID + display fields, capped at 500
    Customer.find(activeBase)
      .select('_id name phone email type outstandingBalance')
      .sort('name')
      .limit(500)
      .lean(),

    Supplier.find(activeBase)
      .select('_id companyName contactPerson phone outstandingBalance')
      .sort('companyName')
      .limit(500)
      .lean(),

    Product.find(activeBase)
      .select('_id name sku sellingPrice category brand totalStock')
      .sort('name')
      .limit(500)
      .lean(),

    Master.find(activeBase)
      .select('_id type name code description')
      .lean(),

    Account.find({ organizationId: orgId, isDeleted: { $ne: true } })
      .select('_id name code type cachedBalance')
      .lean(),

    User.find(activeBase)
      .select('_id name email phone role isActive')
      .populate('role', 'name')
      .sort('name')
      .lean(),

    // Recent transactions — limited, not full-history
    Invoice.find({ ...txBase, status: { $in: ['issued', 'paid', 'partial'] } })
      .select('_id invoiceNumber grandTotal paymentStatus invoiceDate dueDate customerId branchId')
      .sort({ invoiceDate: -1 })
      .limit(50)
      .populate('customerId', 'name')
      .populate('branchId', 'name')
      .lean(),

    Purchase.find(txBase)
      .select('_id invoiceNumber grandTotal paymentStatus purchaseDate supplierId branchId')
      .sort({ purchaseDate: -1 })
      .limit(50)
      .populate('supplierId', 'companyName')
      .populate('branchId', 'name')
      .lean(),

    Sales.find(txBase)
      .select('_id invoiceNumber grandTotal saleDate customerId branchId paymentStatus')
      .sort({ saleDate: -1 })
      .limit(50)
      .populate('customerId', 'name')
      .populate('branchId', 'name')
      .lean(),

    Payment.find({ ...txBase, status: 'completed' })
      .select('_id referenceNumber amount type paymentDate customerId supplierId paymentMethod status')
      .sort({ paymentDate: -1 })
      .limit(50)
      .populate('customerId', 'name')
      .populate('supplierId', 'companyName')
      .lean(),

    EMI.find({ ...txBase, status: 'active' })
      .select('_id totalAmount balanceAmount status customerId invoiceId numberOfInstallments')
      .populate('customerId', 'name')
      .populate('invoiceId', 'invoiceNumber')
      .lean(),
  ]);

  // Group masters by type (keep only one key in response)
  const groupedMasters = masters.reduce((acc, item) => {
    (acc[item.type] ??= []).push({ _id: item._id, name: item.name, code: item.code, description: item.description });
    return acc;
  }, {});

  res.status(200).json({
    status: 'success',
    data: {
      organizationId: orgId,
      branches,
      roles,
      customers,
      suppliers,
      products:       enrichData('product', products),
      accounts,
      users,
      masters:        groupedMasters,
      recentInvoices: enrichData('invoice', recentInvoices),
      recentPurchases,
      recentSales:    enrichData('sales', recentSales),
      recentPayments: enrichData('payment', recentPayments),
      emis:           enrichData('emi', emis),
    },
  });
});

/* ============================================================================
   GET SPECIFIC LIST
   Paginated, filterable list for a single entity type.
   Use this for full list screens (not dropdowns).
   GET /master/specific?type=invoice&page=1&limit=50&paymentStatus=unpaid
============================================================================ */
exports.getSpecificList = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const { type, ...filters } = req.query;

  if (!type) return next(new AppError("Please provide a 'type' query parameter", 400));

  const page  = Math.max(parseInt(filters.page)  || 1, 1);
  const limit = Math.min(parseInt(filters.limit) || 50, 500); // hard cap
  const skip  = (page - 1) * limit;

  const query = buildFilterQuery(type, filters, orgId);

  // Per-type config
  const TYPE_CONFIG = {
    payment: {
      Model:  Payment,
      select: '_id referenceNumber amount type paymentDate customerId supplierId paymentMethod status transactionId',
      populate: [
        { path: 'customerId', select: 'name phone' },
        { path: 'supplierId', select: 'companyName' },
      ],
      sort: { paymentDate: -1 },
    },
    emi: {
      Model:  EMI,
      select: '_id totalAmount balanceAmount status emiStartDate emiEndDate customerId invoiceId numberOfInstallments',
      populate: [
        { path: 'customerId', select: 'name phone' },
        { path: 'invoiceId',  select: 'invoiceNumber grandTotal' },
      ],
      sort: { emiStartDate: -1 },
    },
    invoice: {
      Model:  Invoice,
      select: '_id invoiceNumber grandTotal paymentStatus invoiceDate dueDate customerId branchId status',
      populate: [
        { path: 'customerId', select: 'name phone email' },
        { path: 'branchId',   select: 'name' },
      ],
      sort: { invoiceDate: -1 },
    },
    sales: {
      Model:  Sales,
      select: '_id invoiceNumber grandTotal saleDate customerId branchId paymentStatus',
      populate: [
        { path: 'customerId', select: 'name phone' },
        { path: 'branchId',   select: 'name' },
      ],
      sort: { saleDate: -1 },
    },
    customer: {
      Model:  Customer,
      select: '_id name phone email type billingAddress outstandingBalance totalPurchases lastPurchaseDate gstNumber',
      populate: null,
      sort: { name: 1 },
    },
    supplier: {
      Model:  Supplier,
      select: '_id companyName contactPerson phone email address outstandingBalance paymentTerms',
      populate: null,
      sort: { companyName: 1 },
    },
    product: {
      Model:  Product,
      select: '_id name sku sellingPrice purchasePrice category brand inventory totalStock isActive',
      populate: null,
      sort: { name: 1 },
    },
    user: {
      Model:  User,
      select: '_id name email role phone isActive lastLoginAt',
      populate: { path: 'role', select: 'name' },
      sort: { name: 1 },
    },
    purchase: {
      Model:  Purchase,
      select: '_id invoiceNumber grandTotal paymentStatus purchaseDate dueDate supplierId branchId',
      populate: [
        { path: 'supplierId', select: 'companyName' },
        { path: 'branchId',   select: 'name' },
      ],
      sort: { purchaseDate: -1 },
    },
  };

  const config = TYPE_CONFIG[type.toLowerCase()];
  if (!config) return next(new AppError(`Type '${type}' is not supported`, 400));

  const { Model, select, populate, sort } = config;

  const [total, rawData] = await Promise.all([
    Model.countDocuments(query),
    (() => {
      let q = Model.find(query).select(select).sort(sort).skip(skip).limit(limit);
      if (populate) q = q.populate(populate);
      return q.lean();
    })(),
  ]);

  const data = enrichData(type.toLowerCase(), rawData);

  // Summary stats (computed only for types that need them)
  let summary = {};

  if (type.toLowerCase() === 'invoice') {
    summary = {
      totalAmount:   data.reduce((s, i) => s + (i.grandTotal      || 0), 0),
      paidAmount:    data.filter(i => i.paymentStatus === 'paid').reduce((s, i) => s + (i.grandTotal || 0), 0),
      pendingAmount: data.filter(i => ['unpaid', 'partial'].includes(i.paymentStatus)).reduce((s, i) => s + (i.balanceAmount || i.grandTotal || 0), 0),
      overdueCount:  data.filter(i => i.isOverdue).length,
    };
  } else if (type.toLowerCase() === 'payment') {
    const inflow  = data.filter(p => p.type === 'inflow').reduce((s, p)  => s + (p.amount || 0), 0);
    const outflow = data.filter(p => p.type === 'outflow').reduce((s, p) => s + (p.amount || 0), 0);
    summary = { totalInflow: inflow, totalOutflow: outflow, netFlow: inflow - outflow };
  } else if (type.toLowerCase() === 'customer') {
    const totalBalance = data.reduce((s, c) => s + (c.outstandingBalance || 0), 0);
    summary = {
      totalCustomers: total,
      totalBalance,
      averageBalance: data.length > 0 ? totalBalance / data.length : 0,
    };
  } else if (type.toLowerCase() === 'product') {
    summary = {
      inStockCount:    data.filter(p => p.inStock && !p.lowStock).length,
      lowStockCount:   data.filter(p => p.lowStock).length,
      outOfStockCount: data.filter(p => !p.inStock).length,
    };
  }

  res.status(200).json({
    status:     'success',
    results:    data.length,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    type,
    filters:    Object.keys(filters).length > 0 ? filters : 'none',
    summary,
    data,
  });
});

/* ============================================================================
   GET QUICK STATS
   Org-level KPI summary for the dashboard.
   GET /master/quick-stats?period=month
============================================================================ */
exports.getQuickStats = catchAsync(async (req, res, next) => {
  const orgId  = req.user.organizationId;
  const orgOid = toObjectId(orgId);
  const { period = 'month' } = req.query;

  const now       = new Date();
  const startDate = new Date();

  switch (period) {
    case 'today': startDate.setHours(0, 0, 0, 0);                    break;
    case 'week':  startDate.setDate(now.getDate() - 7);               break;
    case 'year':  startDate.setFullYear(now.getFullYear() - 1);       break;
    default:      startDate.setMonth(now.getMonth() - 1);             break; // month
  }

  const activeBase = { organizationId: orgOid, isActive: true, isDeleted: { $ne: true } };

  const [
    totalCustomers,
    totalSuppliers,
    totalProducts,
    totalInvoices,
    totalPayments,
    salesAgg,
    balanceAgg,
    lowStockCount,
  ] = await Promise.all([
    Customer.countDocuments(activeBase),
    Supplier.countDocuments(activeBase),
    Product.countDocuments(activeBase),

    Invoice.countDocuments({
      organizationId: orgOid,
      invoiceDate:    { $gte: startDate },
      status:         { $in: ['issued', 'paid'] },
      isDeleted:      { $ne: true },
    }),

    Payment.countDocuments({
      organizationId: orgOid,
      paymentDate:    { $gte: startDate },
      status:         'completed',
      isDeleted:      { $ne: true },
    }),

    Invoice.aggregate([
      { $match: { organizationId: orgOid, invoiceDate: { $gte: startDate }, status: { $in: ['issued', 'paid'] }, isDeleted: { $ne: true } } },
      { $group: { _id: null, totalRevenue: { $sum: '$grandTotal' }, count: { $sum: 1 } } },
    ]),

    Customer.aggregate([
      { $match: { ...activeBase } },
      { $group: { _id: null, totalOutstanding: { $sum: '$outstandingBalance' } } },
    ]),

    Product.countDocuments({
      ...activeBase,
      $or: [
        { 'inventory.quantity': { $gt: 0, $lte: 10 } },
        { totalStock:           { $gt: 0, $lte: 10 } },
      ],
    }),
  ]);

  const sales   = salesAgg[0]   || { totalRevenue: 0, count: 0 };
  const balance = balanceAgg[0] || { totalOutstanding: 0 };

  res.status(200).json({
    status: 'success',
    period,
    data: {
      customers:           totalCustomers,
      suppliers:           totalSuppliers,
      products:            totalProducts,
      invoices:            totalInvoices,
      payments:            totalPayments,
      revenue:             sales.totalRevenue,
      averageInvoiceValue: sales.count > 0 ? sales.totalRevenue / sales.count : 0,
      outstandingBalance:  balance.totalOutstanding,
      lowStockCount,
    },
  });
});

/* ============================================================================
   GET FILTER OPTIONS META (static enums for UI forms)
   Returns all static option lists in one call — no DB hit needed.
   GET /master/options-meta
============================================================================ */
exports.getOptionsMeta = (req, res) => {
  res.status(200).json({ status: 'success', data: STATIC_OPTIONS });
};

/* ============================================================================
   EXPORT FILTERED DATA
   Returns CSV or JSON for a specific entity type + filters.
   GET /master/export?type=invoice&format=csv&paymentStatus=unpaid
============================================================================ */
exports.exportFilteredData = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const { type, format = 'json', ...filters } = req.query;

  if (!type) return next(new AppError("Please provide a 'type' query parameter", 400));

  const EXPORT_CONFIG = {
    payment:  { Model: Payment,  select: 'referenceNumber amount type paymentDate paymentMethod status transactionId remarks' },
    invoice:  { Model: Invoice,  select: 'invoiceNumber grandTotal paymentStatus invoiceDate dueDate status notes' },
    customer: { Model: Customer, select: 'name phone email type billingAddress outstandingBalance totalPurchases lastPurchaseDate' },
    supplier: { Model: Supplier, select: 'companyName contactPerson phone email address outstandingBalance' },
    product:  { Model: Product,  select: 'name sku sellingPrice purchasePrice category brand totalStock' },
    purchase: { Model: Purchase, select: 'invoiceNumber grandTotal paymentStatus purchaseDate dueDate' },
  };

  const config = EXPORT_CONFIG[type.toLowerCase()];
  if (!config) return next(new AppError(`Export not supported for type '${type}'`, 400));

  const query = buildFilterQuery(type, filters, orgId);
  const data  = await config.Model.find(query)
    .select(config.select)
    .sort({ createdAt: -1 })
    .limit(10000) // safety cap on exports
    .lean();

  if (data.length === 0)
    return res.status(200).json({ status: 'success', message: 'No data found for the given filters', data: [] });

  const filename = `${type}-export-${Date.now()}`;

  if (format === 'csv') {
    try {
      const parser = new Parser(); // auto-detects fields from first row
      const csv    = parser.parse(data);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.setHeader('Content-Type', 'text/csv');
      return res.send(csv);
    } catch (err) {
      return next(new AppError('Failed to generate CSV', 500));
    }
  }

  // JSON export
  const exportPayload = JSON.stringify({
    metadata: { exportedAt: new Date().toISOString(), type, filters, count: data.length },
    data,
  }, null, 2);

  res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(exportPayload);
});

/* ============================================================================
   GET ENTITY DETAILS BY ID
   GET /master/entity/:type/:id
============================================================================ */
exports.getEntityDetails = catchAsync(async (req, res, next) => {
  const orgId      = req.user.organizationId;
  const { type, id } = req.params;

  if (!type || !id) return next(new AppError('Please provide type and id parameters', 400));

  const ENTITY_CONFIG = {
    customer: {
      Model:   Customer,
      populate: null,
    },
    invoice: {
      Model:   Invoice,
      populate: [
        { path: 'customerId', select: 'name phone email billingAddress' },
        { path: 'branchId',   select: 'name address' },
        { path: 'items.productId', select: 'name sku purchasePrice' },
      ],
    },
    payment: {
      Model:   Payment,
      populate: [
        { path: 'customerId', select: 'name phone' },
        { path: 'supplierId', select: 'companyName' },
        { path: 'invoiceId',  select: 'invoiceNumber' },
      ],
    },
    product: {
      Model:   Product,
      populate: { path: 'defaultSupplierId', select: 'companyName' },
    },
    supplier: {
      Model:   Supplier,
      populate: null,
    },
    purchase: {
      Model:   Purchase,
      populate: [
        { path: 'supplierId', select: 'companyName phone' },
        { path: 'branchId',   select: 'name' },
      ],
    },
  };

  const config = ENTITY_CONFIG[type.toLowerCase()];
  if (!config) return next(new AppError(`Details not supported for type '${type}'`, 400));

  let q = config.Model.findOne({ _id: id, organizationId: orgId, isDeleted: { $ne: true } });
  if (config.populate) q = q.populate(config.populate);
  const entity = await q.lean();

  if (!entity) return next(new AppError(`${type} not found`, 404));

  // Attach related data for types that need it
  const relatedData = {};

  if (type.toLowerCase() === 'customer') {
    const [invoices, payments] = await Promise.all([
      Invoice.find({ customerId: id, organizationId: orgId, isDeleted: { $ne: true } })
        .select('invoiceNumber invoiceDate grandTotal paymentStatus')
        .sort({ invoiceDate: -1 })
        .limit(10)
        .lean(),
      Payment.find({ customerId: id, organizationId: orgId, isDeleted: { $ne: true } })
        .select('referenceNumber amount paymentDate paymentMethod')
        .sort({ paymentDate: -1 })
        .limit(10)
        .lean(),
    ]);
    relatedData.invoices = invoices;
    relatedData.payments = payments;
  }

  if (type.toLowerCase() === 'product') {
    relatedData.recentSales = await Invoice.find({
      organizationId:    orgId,
      'items.productId': id,
      isDeleted:         { $ne: true },
    })
      .select('invoiceNumber invoiceDate customerId')
      .populate('customerId', 'name')
      .sort({ invoiceDate: -1 })
      .limit(5)
      .lean();
  }

  if (type.toLowerCase() === 'supplier') {
    const [purchases, payments] = await Promise.all([
      Purchase.find({ supplierId: id, organizationId: orgId, isDeleted: { $ne: true } })
        .select('invoiceNumber purchaseDate grandTotal paymentStatus')
        .sort({ purchaseDate: -1 })
        .limit(10)
        .lean(),
      Payment.find({ supplierId: id, organizationId: orgId, isDeleted: { $ne: true } })
        .select('referenceNumber amount paymentDate paymentMethod')
        .sort({ paymentDate: -1 })
        .limit(10)
        .lean(),
    ]);
    relatedData.purchases = purchases;
    relatedData.payments  = payments;
  }

  res.status(200).json({ status: 'success', data: { entity, relatedData } });
});

/* ============================================================================
   PERMISSIONS METADATA
   GET /master/permissions
============================================================================ */
exports.getPermissionsMetadata = (req, res) => {
  res.status(200).json({
    status:  'success',
    results: PERMISSIONS_LIST.length,
    data:    PERMISSIONS_LIST,
  });
};

/* ============================================================================
   EXPORT MASTER LIST (full org snapshot)
   GET /master/export-all?format=csv|json
============================================================================ */
exports.exportMasterList = catchAsync(async (req, res, next) => {
  const orgId       = req.user.organizationId;
  const { format = 'json' } = req.query;
  const activeBase  = { organizationId: orgId, isActive: true, isDeleted: { $ne: true } };

  const [branches, customers, suppliers, products, masters, accounts, users] = await Promise.all([
    Branch.find(activeBase).select('_id name branchCode address').lean(),
    Customer.find(activeBase).select('_id name phone email type billingAddress outstandingBalance').lean(),
    Supplier.find(activeBase).select('_id companyName contactPerson phone email address outstandingBalance').lean(),
    Product.find(activeBase).select('_id name sku sellingPrice purchasePrice category brand totalStock').lean(),
    Master.find(activeBase).select('_id type name code description').lean(),
    Account.find({ organizationId: orgId, isDeleted: { $ne: true } }).select('_id name code type cachedBalance').lean(),
    User.find(activeBase).select('_id name email phone').lean(),
  ]);

  const groupedMasters = masters.reduce((acc, item) => {
    (acc[item.type] ??= []).push(item);
    return acc;
  }, {});

  const payload = {
    organizationId: orgId,
    exportedAt:     new Date().toISOString(),
    branches,
    customers,
    suppliers,
    products,
    accounts,
    users,
    masters: groupedMasters,
  };

  const filename = `master-list-export-${Date.now()}`;

  if (format === 'csv') {
    // Flatten all entities into a unified CSV
    try {
      const rows = [
        ...branches.map(b  => ({ entityType: 'Branch',   _id: b._id, name: b.name,          code: b.branchCode,                detail: JSON.stringify(b.address) })),
        ...customers.map(c => ({ entityType: 'Customer', _id: c._id, name: c.name,          code: c.phone,                     detail: `Balance: ₹${c.outstandingBalance}` })),
        ...suppliers.map(s => ({ entityType: 'Supplier', _id: s._id, name: s.companyName,   code: s.phone,                     detail: `Balance: ₹${s.outstandingBalance}` })),
        ...products.map(p  => ({ entityType: 'Product',  _id: p._id, name: p.name,          code: p.sku,                       detail: `₹${p.sellingPrice} | Stock: ${p.totalStock}` })),
        ...accounts.map(a  => ({ entityType: 'Account',  _id: a._id, name: a.name,          code: a.code,                      detail: `Balance: ₹${a.cachedBalance}` })),
        ...users.map(u     => ({ entityType: 'User',     _id: u._id, name: u.name,          code: u.email,                     detail: u.phone || '' })),
      ];
      const parser = new Parser({ fields: ['entityType', '_id', 'name', 'code', 'detail'] });
      const csv    = parser.parse(rows);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.setHeader('Content-Type', 'text/csv');
      return res.send(csv);
    } catch (err) {
      return next(new AppError('Failed to generate CSV export', 500));
    }
  }

  res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(payload, null, 2));
});

// const Branch = require("../../organization/core/branch.model");
// const Role = require("../../auth/core/role.model");
// const Customer = require("../../organization/core/customer.model");
// const Supplier = require("../../organization/core/supplier.model");
// const Product = require("../../inventory/core/model/product.model");
// const Master = require("./model/master.model");
// const Account = require("../../accounting/core/model/account.model");
// const User = require("../../auth/core/user.model");
// const Invoice = require("../../accounting/billing/invoice.model");
// const Purchase = require("../../inventory/core/model/purchase.model");
// const Sales = require("../../inventory/core/model/sales.model");
// const Payment = require("../../accounting/payments/payment.model");
// const EMI = require("../../accounting/payments/emi.model");
// const { PERMISSIONS_LIST } = require('../../../config/permissions');

// const catchAsync = require("../../../core/utils/api/catchAsync");
// const AppError = require("../../../core/utils/api/appError");

// /* ============================================================================
//    FILTER BUILDER UTILITY
// ============================================================================ */
// const buildFilterQuery = (type, filters = {}, organizationId) => {
//   const query = { organizationId };
  
//   // Common filters for most models
//   if (filters.search) {
//     const searchRegex = new RegExp(filters.search, 'i');
//     switch(type) {
//       case 'customer':
//         query.$or = [
//           { name: searchRegex },
//           { phone: searchRegex },
//           { email: searchRegex },
//           { 'billingAddress.city': searchRegex }
//         ];
//         break;
//       case 'supplier':
//         query.$or = [
//           { companyName: searchRegex },
//           { contactPerson: searchRegex },
//           { phone: searchRegex }
//         ];
//         break;
//       case 'product':
//         query.$or = [
//           { name: searchRegex },
//           { sku: searchRegex },
//           { category: searchRegex },
//           { brand: searchRegex }
//         ];
//         break;
//       case 'invoice':
//         query.$or = [
//           { invoiceNumber: searchRegex },
//           { notes: searchRegex }
//         ];
//         break;
//       case 'payment':
//         query.$or = [
//           { referenceNumber: searchRegex },
//           { transactionId: searchRegex },
//           { remarks: searchRegex }
//         ];
//         break;
//       default:
//         query.name = searchRegex;
//     }
//   }

//   // Status filters
//   if (filters.status && filters.status !== 'all') {
//     if (['active', 'inactive'].includes(filters.status)) {
//       query.isActive = filters.status === 'active';
//     } else {
//       query.status = filters.status;
//     }
//   }

//   // Date range filters
//   if (filters.startDate || filters.endDate) {
//     const dateField = type === 'purchase' ? 'purchaseDate' : 
//                      type === 'invoice' ? 'invoiceDate' :
//                      type === 'payment' ? 'paymentDate' :
//                      type === 'sales' ? 'saleDate' : 'createdAt';
    
//     query[dateField] = {};
//     if (filters.startDate) query[dateField].$gte = new Date(filters.startDate);
//     if (filters.endDate) query[dateField].$lte = new Date(filters.endDate);
//   }

//   // Type-specific filters
//   switch(type) {
//     case 'customer':
//       if (filters.type && filters.type !== 'all') {
//         query.type = filters.type;
//       }
//       if (filters.minBalance !== undefined) {
//         query.outstandingBalance = query.outstandingBalance || {};
//         query.outstandingBalance.$gte = parseFloat(filters.minBalance);
//       }
//       if (filters.maxBalance !== undefined) {
//         query.outstandingBalance = query.outstandingBalance || {};
//         query.outstandingBalance.$lte = parseFloat(filters.maxBalance);
//       }
//       if (filters.hasGst === 'true') {
//         query.gstNumber = { $exists: true, $ne: null, $ne: '' };
//       }
//       break;

//     case 'supplier':
//       if (filters.minBalance !== undefined) {
//         query.outstandingBalance = query.outstandingBalance || {};
//         query.outstandingBalance.$gte = parseFloat(filters.minBalance);
//       }
//       if (filters.maxBalance !== undefined) {
//         query.outstandingBalance = query.outstandingBalance || {};
//         query.outstandingBalance.$lte = parseFloat(filters.maxBalance);
//       }
//       break;

//     case 'product':
//       if (filters.category && filters.category !== 'all') {
//         query.category = filters.category;
//       }
//       if (filters.brand && filters.brand !== 'all') {
//         query.brand = filters.brand;
//       }
//       if (filters.minPrice !== undefined) {
//         query.sellingPrice = query.sellingPrice || {};
//         query.sellingPrice.$gte = parseFloat(filters.minPrice);
//       }
//       if (filters.maxPrice !== undefined) {
//         query.sellingPrice = query.sellingPrice || {};
//         query.sellingPrice.$lte = parseFloat(filters.maxPrice);
//       }
//       if (filters.inStock === 'true') {
//         query.$or = [
//           { 'inventory.quantity': { $gt: 0 } },
//           { totalStock: { $gt: 0 } }
//         ];
//       }
//       if (filters.lowStock === 'true') {
//         query.$or = [
//           { 'inventory.quantity': { $gt: 0, $lte: 10 } },
//           { totalStock: { $gt: 0, $lte: 10 } }
//         ];
//       }
//       break;

//     case 'invoice':
//       if (filters.paymentStatus && filters.paymentStatus !== 'all') {
//         query.paymentStatus = filters.paymentStatus;
//       }
//       if (filters.invoiceStatus && filters.invoiceStatus !== 'all') {
//         query.status = filters.invoiceStatus;
//       }
//       if (filters.customerId && filters.customerId !== 'all') {
//         query.customerId = filters.customerId;
//       }
//       if (filters.branchId && filters.branchId !== 'all') {
//         query.branchId = filters.branchId;
//       }
//       if (filters.minAmount !== undefined) {
//         query.grandTotal = query.grandTotal || {};
//         query.grandTotal.$gte = parseFloat(filters.minAmount);
//       }
//       if (filters.maxAmount !== undefined) {
//         query.grandTotal = query.grandTotal || {};
//         query.grandTotal.$lte = parseFloat(filters.maxAmount);
//       }
//       if (filters.overdue === 'true') {
//         query.dueDate = { $lt: new Date() };
//         query.paymentStatus = { $in: ['unpaid', 'partial'] };
//       }
//       break;

//     case 'payment':
//       if (filters.paymentType && filters.paymentType !== 'all') {
//         query.type = filters.paymentType;
//       }
//       if (filters.paymentMethod && filters.paymentMethod !== 'all') {
//         query.paymentMethod = filters.paymentMethod;
//       }
//       if (filters.customerId && filters.customerId !== 'all') {
//         query.customerId = filters.customerId;
//       }
//       if (filters.supplierId && filters.supplierId !== 'all') {
//         query.supplierId = filters.supplierId;
//       }
//       if (filters.minAmount !== undefined) {
//         query.amount = query.amount || {};
//         query.amount.$gte = parseFloat(filters.minAmount);
//       }
//       if (filters.maxAmount !== undefined) {
//         query.amount = query.amount || {};
//         query.amount.$lte = parseFloat(filters.maxAmount);
//       }
//       break;

//     case 'emi':
//       if (filters.emiStatus && filters.emiStatus !== 'all') {
//         query.status = filters.emiStatus;
//       }
//       if (filters.customerId && filters.customerId !== 'all') {
//         query.customerId = filters.customerId;
//       }
//       break;

//     case 'purchase':
//       if (filters.paymentStatus && filters.paymentStatus !== 'all') {
//         query.paymentStatus = filters.paymentStatus;
//       }
//       if (filters.supplierId && filters.supplierId !== 'all') {
//         query.supplierId = filters.supplierId;
//       }
//       break;
//   }

//   // Soft delete filter (exclude deleted by default)
//   if (filters.includeDeleted !== 'true') {
//     query.isDeleted = { $ne: true };
//   }
//   return query;
// };

// /* ============================================================================
//    GET FILTER OPTIONS FOR EACH TYPE
// ============================================================================ */
// exports.getFilterOptions = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const { type } = req.query;

//   if (!type) {
//     return next(new AppError("Please provide a 'type' query parameter", 400));
//   }

//   const options = {
//     common: {
//       status: [
//         { value: 'all', label: 'All Status' },
//         { value: 'active', label: 'Active' },
//         { value: 'inactive', label: 'Inactive' }
//       ],
//       dateRanges: [
//         { value: 'today', label: 'Today' },
//         { value: 'yesterday', label: 'Yesterday' },
//         { value: 'this_week', label: 'This Week' },
//         { value: 'last_week', label: 'Last Week' },
//         { value: 'this_month', label: 'This Month' },
//         { value: 'last_month', label: 'Last Month' },
//         { value: 'this_year', label: 'This Year' },
//         { value: 'custom', label: 'Custom Range' }
//       ]
//     }
//   };

//   switch(type.toLowerCase()) {
//     case 'customer':
//       // Get customer types
//       const customerTypes = await Customer.distinct('type', { organizationId: orgId });
//       options.type = [
//         { value: 'all', label: 'All Types' },
//         ...customerTypes.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))
//       ];

//       // Get cities from billing addresses
//       const cities = await Customer.aggregate([
//         { $match: { organizationId: orgId } },
//         { $unwind: { path: '$billingAddress', preserveNullAndEmptyArrays: true } },
//         { $match: { 'billingAddress.city': { $exists: true, $ne: '' } } },
//         { $group: { _id: '$billingAddress.city' } },
//         { $sort: { _id: 1 } }
//       ]);
//       options.cities = [
//         { value: 'all', label: 'All Cities' },
//         ...cities.map(c => ({ value: c._id, label: c._id }))
//       ];
//       break;

//     case 'supplier':
//       // Get cities from supplier addresses
//       const supplierCities = await Supplier.aggregate([
//         { $match: { organizationId: orgId } },
//         { $unwind: { path: '$address', preserveNullAndEmptyArrays: true } },
//         { $match: { 'address.city': { $exists: true, $ne: '' } } },
//         { $group: { _id: '$address.city' } },
//         { $sort: { _id: 1 } }
//       ]);
//       options.cities = [
//         { value: 'all', label: 'All Cities' },
//         ...supplierCities.map(c => ({ value: c._id, label: c._id }))
//       ];
//       break;

//     case 'product':
//       // Get categories
//       const categories = await Product.distinct('category', { 
//         organizationId: orgId, 
//         category: { $exists: true, $ne: '' } 
//       });
//       options.categories = [
//         { value: 'all', label: 'All Categories' },
//         ...categories.map(c => ({ value: c, label: c }))
//       ];

//       // Get brands
//       const brands = await Product.distinct('brand', { 
//         organizationId: orgId, 
//         brand: { $exists: true, $ne: '' } 
//       });
//       options.brands = [
//         { value: 'all', label: 'All Brands' },
//         ...brands.map(b => ({ value: b, label: b }))
//       ];

//       // Stock status
//       options.stockStatus = [
//         { value: 'all', label: 'All Stock' },
//         { value: 'inStock', label: 'In Stock' },
//         { value: 'outOfStock', label: 'Out of Stock' },
//         { value: 'lowStock', label: 'Low Stock (<10)' }
//       ];
//       break;

//     case 'invoice':
//       // Get payment status options
//       options.paymentStatus = [
//         { value: 'all', label: 'All Payments' },
//         { value: 'paid', label: 'Paid' },
//         { value: 'unpaid', label: 'Unpaid' },
//         { value: 'partial', label: 'Partial' }
//       ];

//       // Get invoice status options
//       options.invoiceStatus = [
//         { value: 'all', label: 'All Status' },
//         { value: 'draft', label: 'Draft' },
//         { value: 'issued', label: 'Issued' },
//         { value: 'paid', label: 'Paid' },
//         { value: 'cancelled', label: 'Cancelled' }
//       ];

//       // Get GST types
//       options.gstTypes = [
//         { value: 'all', label: 'All GST Types' },
//         { value: 'intra-state', label: 'Intra-State' },
//         { value: 'inter-state', label: 'Inter-State' },
//         { value: 'export', label: 'Export' }
//       ];

//       // Get customers for dropdown
//       const invoiceCustomers = await Customer.find({ organizationId: orgId })
//         .select('_id name')
//         .sort('name')
//         .lean();
//       options.customers = [
//         { value: 'all', label: 'All Customers' },
//         ...invoiceCustomers.map(c => ({ value: c._id, label: c.name }))
//       ];
//       break;

//     case 'payment':
//       // Get payment types
//       options.paymentTypes = [
//         { value: 'all', label: 'All Types' },
//         { value: 'inflow', label: 'Inflow (Received)' },
//         { value: 'outflow', label: 'Outflow (Paid)' }
//       ];

//       // Get payment methods
//       options.paymentMethods = [
//         { value: 'all', label: 'All Methods' },
//         { value: 'cash', label: 'Cash' },
//         { value: 'bank', label: 'Bank Transfer' },
//         { value: 'upi', label: 'UPI' },
//         { value: 'cheque', label: 'Cheque' },
//         { value: 'other', label: 'Other' }
//       ];

//       // Get customers for dropdown
//       const paymentCustomers = await Customer.find({ organizationId: orgId })
//         .select('_id name')
//         .sort('name')
//         .lean();
//       options.customers = [
//         { value: 'all', label: 'All Customers' },
//         ...paymentCustomers.map(c => ({ value: c._id, label: c.name }))
//       ];

//       // Get suppliers for dropdown
//       const paymentSuppliers = await Supplier.find({ organizationId: orgId })
//         .select('_id companyName')
//         .sort('companyName')
//         .lean();
//       options.suppliers = [
//         { value: 'all', label: 'All Suppliers' },
//         ...paymentSuppliers.map(s => ({ value: s._id, label: s.companyName }))
//       ];
//       break;

//     case 'emi':
//       // Get EMI status options
//       options.emiStatus = [
//         { value: 'all', label: 'All Status' },
//         { value: 'active', label: 'Active' },
//         { value: 'completed', label: 'Completed' },
//         { value: 'defaulted', label: 'Defaulted' }
//       ];

//       // Get customers for dropdown
//       const emiCustomers = await Customer.find({ organizationId: orgId })
//         .select('_id name')
//         .sort('name')
//         .lean();
//       options.customers = [
//         { value: 'all', label: 'All Customers' },
//         ...emiCustomers.map(c => ({ value: c._id, label: c.name }))
//       ];
//       break;

//     case 'purchase':
//       // Get payment status options
//       options.paymentStatus = [
//         { value: 'all', label: 'All Payments' },
//         { value: 'paid', label: 'Paid' },
//         { value: 'unpaid', label: 'Unpaid' },
//         { value: 'partial', label: 'Partial' }
//       ];

//       // Get suppliers for dropdown
//       const purchaseSuppliers = await Supplier.find({ organizationId: orgId })
//         .select('_id companyName')
//         .sort('companyName')
//         .lean();
//       options.suppliers = [
//         { value: 'all', label: 'All Suppliers' },
//         ...purchaseSuppliers.map(s => ({ value: s._id, label: s.companyName }))
//       ];
//       break;

//     case 'sales':
//       // Get customers for dropdown
//       const salesCustomers = await Customer.find({ organizationId: orgId })
//         .select('_id name')
//         .sort('name')
//         .lean();
//       options.customers = [
//         { value: 'all', label: 'All Customers' },
//         ...salesCustomers.map(c => ({ value: c._id, label: c.name }))
//       ];
//       break;

//     case 'user':
//       // Get roles for dropdown
//       const roles = await Role.find({ organizationId: orgId })
//         .select('_id name')
//         .sort('name')
//         .lean();
//       options.roles = [
//         { value: 'all', label: 'All Roles' },
//         ...roles.map(r => ({ value: r._id, label: r.name }))
//       ];
//       break;
//   }

//   // Get branches for location-based filters
//   if (['invoice', 'purchase', 'sales', 'payment'].includes(type.toLowerCase())) {
//     const branches = await Branch.find({ organizationId: orgId, isActive: true })
//       .select('_id name')
//       .sort('name')
//       .lean();
//     options.branches = [
//       { value: 'all', label: 'All Branches' },
//       ...branches.map(b => ({ value: b._id, label: b.name }))
//     ];
//   }

//   res.status(200).json({
//     status: "success",
//     data: options
//   });
// });

// /* ============================================================================
//    ENHANCED FULL MASTER LIST WITH FILTERS
// ============================================================================ */
// exports.getMasterList = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const filters = req.query;

//   if (!orgId) {
//     return next(new AppError("Organization not found for current user.", 400));
//   }

//   // Apply filters to each entity type
//   const [
//     branches,
//     roles,
//     customers,
//     suppliers,
//     products,
//     masters,
//     accounts,
//     users,
//     invoices,
//     purchases,
//     sales,
//     payments,
//     emis
//   ] = await Promise.all([
//     Branch.find(buildFilterQuery('branch', filters, orgId))
//       .select("_id name branchCode address isMainBranch")
//       .lean(),

//     Role.find(buildFilterQuery('role', filters, orgId))
//       .select("_id name description isActive")
//       .lean(),

//     Customer.find(buildFilterQuery('customer', filters, orgId))
//       .select("_id name phone email billingAddress outstandingBalance type lastPurchaseDate")
//       .lean(),

//     Supplier.find(buildFilterQuery('supplier', filters, orgId))
//       .select("_id companyName contactPerson phone email address outstandingBalance")
//       .lean(),

//     Product.find(buildFilterQuery('product', filters, orgId))
//       .select("_id name sku sellingPrice purchasePrice category brand inventory totalStock")
//       .lean(),

//     Master.find(buildFilterQuery('master', filters, orgId))
//       .select("_id type name code description")
//       .lean(),

//     Account.find(buildFilterQuery('account', filters, orgId))
//       .select("_id name code type cachedBalance")
//       .lean(),

//     User.find(buildFilterQuery('user', filters, orgId))
//       .select("_id name email role phone isActive lastLogin")
//       .lean(),

//     Invoice.find(buildFilterQuery('invoice', filters, orgId))
//       .select("_id invoiceNumber grandTotal paymentStatus invoiceDate dueDate customerId branchId")
//       .sort({ invoiceDate: -1 })
//       .limit(100)
//       .populate('customerId', 'name')
//       .populate('branchId', 'name')
//       .lean(),

//     Purchase.find(buildFilterQuery('purchase', filters, orgId))
//       .select("_id invoiceNumber grandTotal paymentStatus purchaseDate dueDate supplierId branchId")
//       .sort({ purchaseDate: -1 })
//       .limit(100)
//       .populate('supplierId', 'companyName')
//       .populate('branchId', 'name')
//       .lean(),

//     Sales.find(buildFilterQuery('sales', filters, orgId))
//       .select("_id invoiceNumber grandTotal saleDate customerId branchId")
//       .sort({ saleDate: -1 })
//       .limit(100)
//       .populate('customerId', 'name')
//       .populate('branchId', 'name')
//       .lean(),

//     Payment.find(buildFilterQuery('payment', filters, orgId))
//       .select("_id referenceNumber amount type paymentDate customerId supplierId paymentMethod status")
//       .sort({ paymentDate: -1 })
//       .limit(50)
//       .populate('customerId', 'name')
//       .populate('supplierId', 'companyName')
//       .lean(),

//     EMI.find(buildFilterQuery('emi', filters, orgId))
//       .select("_id totalAmount balanceAmount status emiStartDate customerId invoiceId numberOfInstallments")
//       .populate('customerId', 'name')
//       .populate('invoiceId', 'invoiceNumber')
//       .lean()
//   ]);

//   // Group masters by type
//   const groupedMasters = masters.reduce((acc, item) => {
//     if (!acc[item.type]) acc[item.type] = [];
//     acc[item.type].push({ 
//       _id: item._id, 
//       name: item.name, 
//       code: item.code,
//       description: item.description 
//     });
//     return acc;
//   }, {});

//   // Add calculated fields
//   const enhancedProducts = products.map(product => ({
//     ...product,
//     inStock: product.totalStock > 0,
//     lowStock: product.totalStock > 0 && product.totalStock <= 10,
//     profitMargin: product.purchasePrice > 0 
//       ? ((product.sellingPrice - product.purchasePrice) / product.sellingPrice) * 100 
//       : 0
//   }));

//   const enhancedInvoices = invoices.map(invoice => ({
//     ...invoice,
//     isOverdue: invoice.dueDate && new Date(invoice.dueDate) < new Date() && 
//               ['unpaid', 'partial'].includes(invoice.paymentStatus),
//     overdueDays: invoice.dueDate && new Date(invoice.dueDate) < new Date() ? 
//                  Math.floor((new Date() - new Date(invoice.dueDate)) / (1000 * 60 * 60 * 24)) : 0
//   }));

//   const enhancedPayments = payments.map(payment => ({
//     ...payment,
//     direction: payment.type === 'inflow' ? 'Received' : 'Paid',
//     formattedAmount: `${payment.type === 'inflow' ? '+' : '-'}${payment.amount}`,
//     source: payment.customerId ? payment.customerId.name : 
//             payment.supplierId ? payment.supplierId.companyName : 'Unknown'
//   }));

//   // Return filter metadata
//   const filterMetadata = {
//     appliedFilters: filters,
//     totalEntities: {
//       branches: branches.length,
//       customers: customers.length,
//       suppliers: suppliers.length,
//       products: enhancedProducts.length,
//       invoices: enhancedInvoices.length,
//       payments: enhancedPayments.length,
//       emis: emis.length
//     }
//   };

//   res.status(200).json({
//     status: "success",
//     metadata: filterMetadata,
//     data: {
//       organizationId: orgId,
//       branches,
//       roles,
//       customers,
//       suppliers,
//       products: enhancedProducts,
//       accounts,
//       users,
//       masterData:masters,
//       masters: groupedMasters,
//       recentInvoices: enhancedInvoices,
//       recentPurchases: purchases,
//       recentSales: sales,
//       recentPayments: enhancedPayments,
//       emis
//     },
//   });
// });

// /* ============================================================================
//    ENHANCED SPECIFIC LIST FETCHER WITH FILTERS
// ============================================================================ */
// exports.getSpecificList = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const { type, ...filters } = req.query;
//   const page = parseInt(filters.page) || 1;
//   const limit = parseInt(filters.limit) || 50;
//   const skip = (page - 1) * limit;

//   if (!type) {
//     return next(new AppError("Please provide a 'type' query parameter", 400));
//   }

//   let Model = null;
//   let selectFields = "";
//   let query = buildFilterQuery(type, filters, orgId);
//   let populateOptions = null;
//   let sortField = { createdAt: -1 };

//   switch (type.toLowerCase()) {
//     case "payment":
//       Model = Payment;
//       selectFields = "_id referenceNumber amount type paymentDate customerId supplierId paymentMethod status transactionId";
//       populateOptions = [
//         { path: 'customerId', select: 'name phone' },
//         { path: 'supplierId', select: 'companyName' }
//       ];
//       sortField = { paymentDate: -1 };
//       break;

//     case "emi":
//       Model = EMI;
//       selectFields = "_id totalAmount balanceAmount status emiStartDate emiEndDate customerId invoiceId numberOfInstallments";
//       populateOptions = [
//         { path: 'customerId', select: 'name phone' },
//         { path: 'invoiceId', select: 'invoiceNumber grandTotal' }
//       ];
//       sortField = { emiStartDate: -1 };
//       break;

//     case "invoice":
//       Model = Invoice;
//       selectFields = "_id invoiceNumber grandTotal paymentStatus invoiceDate dueDate customerId branchId status";
//       populateOptions = [
//         { path: 'customerId', select: 'name phone email' },
//         { path: 'branchId', select: 'name' }
//       ];
//       sortField = { invoiceDate: -1 };
//       break;

//     case "sales":
//       Model = Sales;
//       selectFields = "_id invoiceNumber grandTotal saleDate customerId branchId paymentStatus";
//       populateOptions = { path: 'customerId', select: 'name phone' };
//       sortField = { saleDate: -1 };
//       break;

//     case "customer":
//       Model = Customer;
//       selectFields = "_id name phone email type billingAddress outstandingBalance totalPurchases lastPurchaseDate gstNumber";
//       sortField = { name: 1 };
//       break;

//     case "supplier":
//       Model = Supplier;
//       selectFields = "_id companyName contactPerson phone email address outstandingBalance paymentTerms";
//       sortField = { companyName: 1 };
//       break;

//     case "product":
//       Model = Product;
//       selectFields = "_id name sku sellingPrice purchasePrice category brand inventory totalStock isActive";
//       sortField = { name: 1 };
//       break;

//     case "user":
//       Model = User;
//       selectFields = "_id name email role phone isActive lastLogin";
//       populateOptions = { path: 'role', select: 'name' };
//       sortField = { name: 1 };
//       break;

//     case "purchase":
//       Model = Purchase;
//       selectFields = "_id invoiceNumber grandTotal paymentStatus purchaseDate dueDate supplierId branchId";
//       populateOptions = [
//         { path: 'supplierId', select: 'companyName' },
//         { path: 'branchId', select: 'name' }
//       ];
//       sortField = { purchaseDate: -1 };
//       break;

//     default:
//       return next(new AppError(`Type ${type} not configured for specific list`, 400));
//   }

//   // Get total count for pagination
//   const total = await Model.countDocuments(query);

//   // Build query
//   let queryObj = Model.find(query)
//     .select(selectFields)
//     .sort(sortField)
//     .skip(skip)
//     .limit(limit);

//   if (populateOptions) {
//     queryObj = queryObj.populate(populateOptions);
//   }

//   let data = await queryObj.lean();

//   // Enhance data with custom labels and calculations
//   data = data.map(item => {
//     switch(type.toLowerCase()) {
//       case 'payment':
//         const isReceived = item.type === 'inflow';
//         const name = isReceived
//           ? item.customerId?.name || 'Unknown Customer'
//           : item.supplierId?.companyName || 'Unknown Supplier';
//         const symbol = isReceived ? '+' : '-';
//         const statusColor = item.status === 'completed' ? 'green' : 
//                           item.status === 'pending' ? 'orange' : 'red';

//         return {
//           ...item,
//           customLabel: `${symbol} ₹${item.amount} | ${name} | ${item.referenceNumber || 'No Ref'}`,
//           searchKey: `${item.amount} ${item.referenceNumber} ${name} ${item.paymentMethod}`,
//           formattedAmount: `${symbol}₹${item.amount}`,
//           statusColor
//         };

//       case 'emi':
//         const cust = item.customerId?.name || 'Unknown';
//         const inv = item.invoiceId?.invoiceNumber || 'No Invoice';
//         const progress = item.totalAmount > 0 ? 
//           ((item.totalAmount - item.balanceAmount) / item.totalAmount) * 100 : 0;

//         return {
//           ...item,
//           customLabel: `${cust} (${inv}) - ${item.status.toUpperCase()} (${progress.toFixed(0)}%)`,
//           searchKey: `${cust} ${inv} ${item.status}`,
//           progress,
//           remainingInstallments: Math.ceil(item.balanceAmount / (item.totalAmount / item.numberOfInstallments))
//         };

//       case 'invoice':
//       case 'sales':
//         const customer = item.customerId?.name || 'Unknown';
//         const phone = item.customerId?.phone || '';
//         const isOverdue = item.dueDate && new Date(item.dueDate) < new Date() && 
//                          ['unpaid', 'partial'].includes(item.paymentStatus);
//         const overdueDays = isOverdue ? 
//           Math.floor((new Date() - new Date(item.dueDate)) / (1000 * 60 * 60 * 24)) : 0;

//         return {
//           ...item,
//           customLabel: `${item.invoiceNumber} - ${customer} ${phone ? `(${phone})` : ''}`,
//           searchKey: `${item.invoiceNumber} ${customer} ${phone}`,
//           isOverdue,
//           overdueDays,
//           statusColor: item.paymentStatus === 'paid' ? 'green' : 
//                       item.paymentStatus === 'partial' ? 'orange' : 'red'
//         };

//       case 'customer':
//         const city = item.billingAddress?.city || '';
//         const state = item.billingAddress?.state || '';
//         const balanceStatus = item.outstandingBalance > 0 ? 'Due' : 'Clear';

//         return {
//           ...item,
//           customLabel: `${item.name} (${item.phone}) - ${balanceStatus}: ₹${item.outstandingBalance}`,
//           searchKey: `${item.name} ${item.phone} ${city} ${state}`,
//           location: city ? `${city}, ${state}` : 'Location not set',
//           balanceStatus,
//           balanceColor: item.outstandingBalance > 0 ? 'red' : 'green'
//         };

//       case 'supplier':
//         const supplierCity = item.address?.city || '';
//         const supplierState = item.address?.state || '';
//         const supplierBalanceStatus = item.outstandingBalance > 0 ? 'Due' : 'Clear';

//         return {
//           ...item,
//           customLabel: `${item.companyName} (${item.contactPerson || 'No Contact'})`,
//           searchKey: `${item.companyName} ${item.contactPerson} ${item.phone}`,
//           location: supplierCity ? `${supplierCity}, ${supplierState}` : 'Location not set',
//           balanceStatus: supplierBalanceStatus,
//           balanceColor: item.outstandingBalance > 0 ? 'red' : 'green'
//         };

//       case 'product':
//         const stockStatus = item.totalStock > 10 ? 'In Stock' : 
//                            item.totalStock > 0 ? 'Low Stock' : 'Out of Stock';
//         const stockColor = item.totalStock > 10 ? 'green' : 
//                           item.totalStock > 0 ? 'orange' : 'red';
//         const profit = item.sellingPrice - (item.purchasePrice || 0);
//         const margin = item.sellingPrice > 0 ? (profit / item.sellingPrice) * 100 : 0;

//         return {
//           ...item,
//           customLabel: `${item.name} (${item.sku}) - ${stockStatus}: ${item.totalStock}`,
//           searchKey: `${item.name} ${item.sku} ${item.category} ${item.brand}`,
//           stockStatus,
//           stockColor,
//           profit,
//           margin,
//           formattedPrice: `₹${item.sellingPrice}`,
//           formattedCost: item.purchasePrice ? `₹${item.purchasePrice}` : 'Not set'
//         };

//       case 'user':
//         const lastLogin = item.lastLogin ? 
//           new Date(item.lastLogin).toLocaleDateString() : 'Never';
//         const status = item.isActive ? 'Active' : 'Inactive';

//         return {
//           ...item,
//           customLabel: `${item.name} (${item.email}) - ${status}`,
//           searchKey: `${item.name} ${item.email} ${item.role?.name || ''}`,
//           status,
//           statusColor: item.isActive ? 'green' : 'red',
//           lastLoginFormatted: lastLogin
//         };

//       case 'purchase':
//         const supplier = item.supplierId?.companyName || 'Unknown';
//         const purchaseStatus = item.paymentStatus === 'paid' ? 'Paid' : 
//                               item.paymentStatus === 'partial' ? 'Partial' : 'Pending';

//         return {
//           ...item,
//           customLabel: `${item.invoiceNumber} - ${supplier} - ${purchaseStatus}`,
//           searchKey: `${item.invoiceNumber} ${supplier} ${item.paymentStatus}`,
//           purchaseStatus,
//           statusColor: item.paymentStatus === 'paid' ? 'green' : 
//                       item.paymentStatus === 'partial' ? 'orange' : 'red'
//         };

//       default:
//         return item;
//     }
//   });

//   // Calculate summary stats
//   let summary = {};
//   if (type.toLowerCase() === 'invoice') {
//     summary = {
//       totalAmount: data.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0),
//       paidAmount: data.filter(inv => inv.paymentStatus === 'paid')
//                      .reduce((sum, inv) => sum + (inv.grandTotal || 0), 0),
//       pendingAmount: data.filter(inv => ['unpaid', 'partial'].includes(inv.paymentStatus))
//                         .reduce((sum, inv) => sum + (inv.balanceAmount || inv.grandTotal || 0), 0),
//       overdueCount: data.filter(inv => inv.isOverdue).length
//     };
//   } else if (type.toLowerCase() === 'payment') {
//     summary = {
//       totalInflow: data.filter(p => p.type === 'inflow')
//                       .reduce((sum, p) => sum + (p.amount || 0), 0),
//       totalOutflow: data.filter(p => p.type === 'outflow')
//                        .reduce((sum, p) => sum + (p.amount || 0), 0),
//       netFlow: data.filter(p => p.type === 'inflow')
//                   .reduce((sum, p) => sum + (p.amount || 0), 0) -
//                data.filter(p => p.type === 'outflow')
//                   .reduce((sum, p) => sum + (p.amount || 0), 0)
//     };
//   } else if (type.toLowerCase() === 'customer') {
//     summary = {
//       totalCustomers: total,
//       totalBalance: data.reduce((sum, cust) => sum + (cust.outstandingBalance || 0), 0),
//       averageBalance: data.length > 0 ? 
//                      data.reduce((sum, cust) => sum + (cust.outstandingBalance || 0), 0) / data.length : 0
//     };
//   }

//   res.status(200).json({
//     status: "success",
//     results: data.length,
//     total,
//     page,
//     totalPages: Math.ceil(total / limit),
//     type,
//     filters: Object.keys(filters).length > 0 ? filters : 'none',
//     summary,
//     data
//   });
// });

// /* ============================================================================
//    GET QUICK STATS DASHBOARD
// ============================================================================ */
// exports.getQuickStats = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const { period = 'month' } = req.query; // today, week, month, year

//   const now = new Date();
//   let startDate = new Date();

//   switch(period) {
//     case 'today':
//       startDate.setHours(0, 0, 0, 0);
//       break;
//     case 'week':
//       startDate.setDate(now.getDate() - 7);
//       break;
//     case 'month':
//       startDate.setMonth(now.getMonth() - 1);
//       break;
//     case 'year':
//       startDate.setFullYear(now.getFullYear() - 1);
//       break;
//     default:
//       startDate.setMonth(now.getMonth() - 1);
//   }

//   // Get stats in parallel
//   const [
//     totalCustomers,
//     totalSuppliers,
//     totalProducts,
//     totalInvoices,
//     totalPayments,
//     recentSales,
//     outstandingBalance,
//     lowStockProducts
//   ] = await Promise.all([
//     Customer.countDocuments({ organizationId: orgId, isActive: true }),
//     Supplier.countDocuments({ organizationId: orgId, isActive: true }),
//     Product.countDocuments({ organizationId: orgId, isActive: true }),
//     Invoice.countDocuments({ 
//       organizationId: orgId, 
//       invoiceDate: { $gte: startDate },
//       status: { $in: ['issued', 'paid'] }
//     }),
//     Payment.countDocuments({ 
//       organizationId: orgId, 
//       paymentDate: { $gte: startDate },
//       status: 'completed'
//     }),
//     Invoice.aggregate([
//       {
//         $match: {
//           organizationId: orgId,
//           invoiceDate: { $gte: startDate },
//           status: { $in: ['issued', 'paid'] }
//         }
//       },
//       {
//         $group: {
//           _id: null,
//           totalRevenue: { $sum: '$grandTotal' },
//           count: { $sum: 1 }
//         }
//       }
//     ]),
//     Customer.aggregate([
//       {
//         $match: { organizationId: orgId, isActive: true }
//       },
//       {
//         $group: {
//           _id: null,
//           totalOutstanding: { $sum: '$outstandingBalance' }
//         }
//       }
//     ]),
//     Product.countDocuments({
//       organizationId: orgId,
//       isActive: true,
//       $or: [
//         { 'inventory.quantity': { $gt: 0, $lte: 10 } },
//         { totalStock: { $gt: 0, $lte: 10 } }
//       ]
//     })
//   ]);

//   const salesData = recentSales[0] || { totalRevenue: 0, count: 0 };
//   const balanceData = outstandingBalance[0] || { totalOutstanding: 0 };

//   res.status(200).json({
//     status: "success",
//     period,
//     data: {
//       customers: totalCustomers,
//       suppliers: totalSuppliers,
//       products: totalProducts,
//       invoices: totalInvoices,
//       payments: totalPayments,
//       revenue: salesData.totalRevenue,
//       averageInvoiceValue: salesData.count > 0 ? salesData.totalRevenue / salesData.count : 0,
//       outstandingBalance: balanceData.totalOutstanding,
//       lowStockCount: lowStockProducts
//     }
//   });
// });

// /* ============================================================================
//    EXPORT FILTERED DATA
// ============================================================================ */
// exports.exportFilteredData = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const { type, format = 'json', ...filters } = req.query;

//   if (!type) {
//     return next(new AppError("Please provide a 'type' query parameter", 400));
//   }

//   // Get filtered data using the same logic as getSpecificList
//   const query = buildFilterQuery(type, filters, orgId);
//   let Model, selectFields;

//   switch(type.toLowerCase()) {
//     case "payment":
//       Model = Payment;
//       selectFields = "referenceNumber amount type paymentDate paymentMethod status transactionId remarks";
//       break;
//     case "invoice":
//       Model = Invoice;
//       selectFields = "invoiceNumber grandTotal paymentStatus invoiceDate dueDate status notes";
//       break;
//     case "customer":
//       Model = Customer;
//       selectFields = "name phone email type billingAddress outstandingBalance totalPurchases lastPurchaseDate";
//       break;
//     case "product":
//       Model = Product;
//       selectFields = "name sku sellingPrice purchasePrice category brand inventory totalStock";
//       break;
//     default:
//       return next(new AppError(`Export not supported for type ${type}`, 400));
//   }

//   const data = await Model.find(query)
//     .select(selectFields)
//     .sort({ createdAt: -1 })
//     .lean();

//   // Format data based on export format
//   let exportData, filename, contentType;

//   switch(format) {
//     case 'csv':
//       // Convert to CSV
//       const headers = Object.keys(data[0] || {}).join(',');
//       const rows = data.map(item => Object.values(item).join(','));
//       exportData = [headers, ...rows].join('\n');
//       filename = `${type}-export-${Date.now()}.csv`;
//       contentType = 'text/csv';
//       break;

//     case 'excel':
//       // For Excel, you'd use a library like exceljs
//       // For now, return JSON
//       exportData = JSON.stringify(data, null, 2);
//       filename = `${type}-export-${Date.now()}.json`;
//       contentType = 'application/json';
//       break;

//     default: // json
//       exportData = JSON.stringify({
//         metadata: {
//           exportedAt: new Date().toISOString(),
//           type,
//           filters,
//           count: data.length
//         },
//         data
//       }, null, 2);
//       filename = `${type}-export-${Date.now()}.json`;
//       contentType = 'application/json';
//   }

//   res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
//   res.setHeader('Content-Type', contentType);
//   res.send(exportData);
// });

// /* ============================================================================
//    GET ENTITY DETAILS BY ID
// ============================================================================ */
// exports.getEntityDetails = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const { type, id } = req.params;

//   if (!type || !id) {
//     return next(new AppError("Please provide type and id parameters", 400));
//   }

//   let Model, query, populateOptions;

//   switch(type.toLowerCase()) {
//     case 'customer':
//       Model = Customer;
//       query = { _id: id, organizationId: orgId };
//       populateOptions = null;
//       break;
//     case 'invoice':
//       Model = Invoice;
//       query = { _id: id, organizationId: orgId };
//       populateOptions = [
//         { path: 'customerId', select: 'name phone email billingAddress' },
//         { path: 'branchId', select: 'name address' },
//         { path: 'items.productId', select: 'name sku purchasePrice' }
//       ];
//       break;
//     case 'payment':
//       Model = Payment;
//       query = { _id: id, organizationId: orgId };
//       populateOptions = [
//         { path: 'customerId', select: 'name phone' },
//         { path: 'supplierId', select: 'companyName' },
//         { path: 'invoiceId', select: 'invoiceNumber' }
//       ];
//       break;
//     case 'product':
//       Model = Product;
//       query = { _id: id, organizationId: orgId };
//       populateOptions = { path: 'defaultSupplierId', select: 'companyName' };
//       break;
//     default:
//       return next(new AppError(`Details not supported for type ${type}`, 400));
//   }

//   const entity = await Model.findOne(query).populate(populateOptions).lean();

//   if (!entity) {
//     return next(new AppError(`${type} not found`, 404));
//   }

//   // Add related data based on type
//   let relatedData = {};
//   if (type.toLowerCase() === 'customer') {
//     relatedData.invoices = await Invoice.find({ customerId: id, organizationId: orgId })
//       .select('invoiceNumber invoiceDate grandTotal paymentStatus')
//       .sort({ invoiceDate: -1 })
//       .limit(10)
//       .lean();
    
//     relatedData.payments = await Payment.find({ customerId: id, organizationId: orgId })
//       .select('referenceNumber amount paymentDate paymentMethod')
//       .sort({ paymentDate: -1 })
//       .limit(10)
//       .lean();
//   } else if (type.toLowerCase() === 'product') {
//     relatedData.recentSales = await Invoice.find({ 
//       organizationId: orgId,
//       'items.productId': id 
//     })
//       .select('invoiceNumber invoiceDate customerId')
//       .populate('customerId', 'name')
//       .sort({ invoiceDate: -1 })
//       .limit(5)
//       .lean();
//   }

//   res.status(200).json({
//     status: "success",
//     data: {
//       entity,
//       relatedData
//     }
//   });
// });

// /* ============================================================================
//    PERMISSIONS METADATA
// ============================================================================ */
// exports.getPermissionsMetadata = (req, res, next) => {
//   res.status(200).json({
//     status: "success",
//     results: PERMISSIONS_LIST.length,
//     data: PERMISSIONS_LIST
//   });
// };

// /* ============================================================================
//    EXPORT MASTER LIST
// ============================================================================ */
// exports.exportMasterList = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const { format = 'json' } = req.query;

//   // Get all master data
//   const [
//     branches,
//     customers,
//     suppliers,
//     products,
//     masters,
//     accounts,
//     users
//   ] = await Promise.all([
//     Branch.find({ organizationId: orgId, isActive: true })
//       .select("_id name branchCode address")
//       .lean(),
//     Customer.find({ organizationId: orgId, isActive: true })
//       .select("_id name phone email type billingAddress outstandingBalance")
//       .lean(),
//     Supplier.find({ organizationId: orgId, isActive: true })
//       .select("_id companyName contactPerson phone email address outstandingBalance")
//       .lean(),
//     Product.find({ organizationId: orgId, isActive: true })
//       .select("_id name sku sellingPrice purchasePrice category brand totalStock")
//       .lean(),
//     Master.find({ organizationId: orgId, isActive: true })
//       .select("_id type name code description")
//       .lean(),
//     Account.find({ organizationId: orgId })
//       .select("_id name code type cachedBalance")
//       .lean(),
//     User.find({ organizationId: orgId, isActive: true })
//       .select("_id name email role phone")
//       .lean()
//   ]);

//   // Group masters by type
//   const groupedMasters = masters.reduce((acc, item) => {
//     if (!acc[item.type]) acc[item.type] = [];
//     acc[item.type].push(item);
//     return acc;
//   }, {});

//   const masterListData = {
//     organizationId: orgId,
//     exportedAt: new Date().toISOString(),
//     branches,
//     customers,
//     suppliers,
//     products,
//     accounts,
//     users,
//     masters: groupedMasters
//   };

//   // Format based on requested format
//   let exportData, filename, contentType;

//   switch(format) {
//     case 'csv':
//       // Simple CSV conversion (for complex data, use a CSV library)
//       const csvData = [];
//       csvData.push('Entity Type,ID,Name,Code,Details');
      
//       // Add branches
//       branches.forEach(b => csvData.push(`Branch,${b._id},${b.name},${b.branchCode || ''},${b.address ? JSON.stringify(b.address) : ''}`));
      
//       // Add customers
//       customers.forEach(c => csvData.push(`Customer,${c._id},${c.name},,${c.phone},${c.email},${c.outstandingBalance}`));
      
//       // Add suppliers
//       suppliers.forEach(s => csvData.push(`Supplier,${s._id},${s.companyName},,${s.contactPerson},${s.phone},${s.outstandingBalance}`));
      
//       // Add products
//       products.forEach(p => csvData.push(`Product,${p._id},${p.name},${p.sku},${p.sellingPrice},${p.category},${p.totalStock}`));
      
//       exportData = csvData.join('\n');
//       filename = `master-list-export-${Date.now()}.csv`;
//       contentType = 'text/csv';
//       break;

//     case 'excel':
//       // For Excel export, you would typically use a library like exceljs
//       // For now, we'll return JSON and you can implement Excel generation separately
//       exportData = JSON.stringify(masterListData, null, 2);
//       filename = `master-list-export-${Date.now()}.json`;
//       contentType = 'application/json';
//       break;

//     default: // json
//       exportData = JSON.stringify(masterListData, null, 2);
//       filename = `master-list-export-${Date.now()}.json`;
//       contentType = 'application/json';
//   }

//   res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
//   res.setHeader('Content-Type', contentType);
//   res.send(exportData);
// });
