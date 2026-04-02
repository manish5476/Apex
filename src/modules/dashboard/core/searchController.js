'use strict';

const catchAsync = require('../../../core/utils/api/catchAsync');
const AppError = require('../../../core/utils/api/appError');

const Customer = require('../../organization/core/customer.model');
const Supplier = require('../../organization/core/supplier.model');
const Product = require('../../inventory/core/model/product.model');
const Invoice = require('../../accounting/billing/invoice.model');
const Purchase = require('../../inventory/core/model/purchase.model');
const Payment = require('../../accounting/payments/payment.model');
const User = require('../../auth/core/user.model');

// ── Escape regex special characters — prevents ReDoS ─────────────────────────
const escapeRegex = (str) => str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

// ── Per-entity search config ──────────────────────────────────────────────────
// Adding a new entity = one entry here, zero code changes elsewhere.
const SEARCH_CONFIG = [
  {
    key: 'customers',
    Model: Customer,
    type: 'customer',
    icon: 'person',
    section: 'Customers',
    buildQuery: (regex, orgId) => ({
      organizationId: orgId,
      isDeleted: false,
      isActive: true,
      $or: [{ name: regex }, { phone: regex }, { email: regex }],
    }),
    select: '_id name phone email avatar type',
    format: (doc) => ({
      _id: doc._id,
      title: doc.name,
      subtitle: doc.phone || doc.email || '',
      meta: doc.type ? doc.type.charAt(0).toUpperCase() + doc.type.slice(1) : '',
      avatar: doc.avatar || null,
      type: 'customer',
      icon: 'person',
      link: `/customers/${doc._id}`,
      searchTerms: `${doc.name} ${doc.phone} ${doc.email}`,
    }),
  },
  {
    key: 'suppliers',
    Model: Supplier,
    type: 'supplier',
    icon: 'local_shipping',
    section: 'Suppliers',
    buildQuery: (regex, orgId) => ({
      organizationId: orgId,
      isDeleted: false,
      isActive: true,
      $or: [{ companyName: regex }, { contactPerson: regex }, { phone: regex }],
    }),
    select: '_id companyName contactPerson phone avatar',
    format: (doc) => ({
      _id: doc._id,
      title: doc.companyName,
      subtitle: doc.contactPerson || doc.phone || '',
      meta: 'Supplier',
      avatar: doc.avatar || null,
      type: 'supplier',
      icon: 'local_shipping',
      link: `/suppliers/${doc._id}`,
      searchTerms: `${doc.companyName} ${doc.contactPerson} ${doc.phone}`,
    }),
  },
  {
    key: 'products',
    Model: Product,
    type: 'product',
    icon: 'inventory_2',
    section: 'Products',
    buildQuery: (regex, orgId) => ({
      organizationId: orgId,
      isDeleted: false,
      isActive: true,
      $or: [{ name: regex }, { sku: regex }, { category: regex }],
    }),
    select: '_id name sku sellingPrice category totalStock images',
    format: (doc) => ({
      _id: doc._id,
      title: doc.name,
      subtitle: `SKU: ${doc.sku || 'N/A'} · ₹${doc.sellingPrice || 0}`,
      meta: doc.totalStock > 0 ? `${doc.totalStock} in stock` : 'Out of stock',
      metaColor: doc.totalStock > 0 ? 'green' : 'red',
      avatar: doc.images?.[0] || null,
      type: 'product',
      icon: 'inventory_2',
      link: `/inventory/products/${doc._id}`,
      searchTerms: `${doc.name} ${doc.sku} ${doc.category}`,
    }),
  },
  {
    key: 'invoices',
    Model: Invoice,
    type: 'invoice',
    icon: 'receipt',
    section: 'Invoices',
    buildQuery: (regex, orgId) => ({
      organizationId: orgId,
      isDeleted: false,
      $or: [{ invoiceNumber: regex }],
    }),
    select: '_id invoiceNumber grandTotal paymentStatus invoiceDate customerId',
    populate: [{ path: 'customerId', select: 'name' }],
    format: (doc) => ({
      _id: doc._id,
      title: doc.invoiceNumber,
      subtitle: doc.customerId?.name || 'Unknown Customer',
      meta: `₹${doc.grandTotal || 0} · ${doc.paymentStatus || ''}`,
      metaColor: doc.paymentStatus === 'paid' ? 'green'
        : doc.paymentStatus === 'partial' ? 'orange' : 'red',
      avatar: null,
      type: 'invoice',
      icon: 'receipt',
      link: `/billing/invoices/${doc._id}`,
      searchTerms: `${doc.invoiceNumber} ${doc.customerId?.name || ''}`,
    }),
  },
  {
    key: 'purchases',
    Model: Purchase,
    type: 'purchase',
    icon: 'shopping_cart',
    section: 'Purchases',
    buildQuery: (regex, orgId) => ({
      organizationId: orgId,
      isDeleted: false,
      $or: [{ invoiceNumber: regex }],
    }),
    select: '_id invoiceNumber grandTotal paymentStatus purchaseDate supplierId',
    populate: [{ path: 'supplierId', select: 'companyName' }],
    format: (doc) => ({
      _id: doc._id,
      title: doc.invoiceNumber,
      subtitle: doc.supplierId?.companyName || 'Unknown Supplier',
      meta: `₹${doc.grandTotal || 0} · ${doc.paymentStatus || ''}`,
      metaColor: doc.paymentStatus === 'paid' ? 'green'
        : doc.paymentStatus === 'partial' ? 'orange' : 'red',
      avatar: null,
      type: 'purchase',
      icon: 'shopping_cart',
      link: `/purchases/${doc._id}`,
      searchTerms: `${doc.invoiceNumber} ${doc.supplierId?.companyName || ''}`,
    }),
  },
  {
    key: 'payments',
    Model: Payment,
    type: 'payment',
    icon: 'payments',
    section: 'Payments',
    buildQuery: (regex, orgId) => ({
      organizationId: orgId,
      isDeleted: false,
      $or: [{ referenceNumber: regex }, { transactionId: regex }],
    }),
    select: '_id referenceNumber amount type paymentDate paymentMethod status customerId supplierId',
    populate: [
      { path: 'customerId', select: 'name' },
      { path: 'supplierId', select: 'companyName' },
    ],
    format: (doc) => {
      const isInflow = doc.type === 'inflow';
      const party = isInflow
        ? doc.customerId?.name || 'Unknown'
        : doc.supplierId?.companyName || 'Unknown';
      return {
        _id: doc._id,
        title: doc.referenceNumber || `Payment #${doc._id}`,
        subtitle: party,
        meta: `${isInflow ? '+' : '-'}₹${doc.amount || 0} · ${doc.paymentMethod || ''}`,
        metaColor: isInflow ? 'green' : 'red',
        avatar: null,
        type: 'payment',
        icon: 'payments',
        link: `/accounting/payments/${doc._id}`,
        searchTerms: `${doc.referenceNumber} ${party}`,
      };
    },
  },
  {
    key: 'users',
    Model: User,
    type: 'user',
    icon: 'badge',
    section: 'Staff',
    buildQuery: (regex, orgId) => ({
      organizationId: orgId,
      isDeleted: false,
      isActive: true,
      status: 'approved',
      $or: [
        { name: regex },
        { email: regex },
        { phone: regex },
        { 'employeeProfile.employeeId': regex },
      ],
    }),
    select: '_id name email phone avatar employeeProfile.employeeId',
    format: (doc) => ({
      _id: doc._id,
      title: doc.name,
      subtitle: doc.email,
      meta: doc.employeeProfile?.employeeId || doc.phone || '',
      avatar: doc.avatar || null,
      type: 'user',
      icon: 'badge',
      link: `/hr/employees/${doc._id}`,
      searchTerms: `${doc.name} ${doc.email} ${doc.phone} ${doc.employeeProfile?.employeeId || ''}`,
    }),
  },
];

/* ============================================================================
   GLOBAL SEARCH
   GET /api/v1/search?q=john&types=customer,supplier&limit=5

   Returns:
   - `grouped`  — results organized by entity type (for tabbed/sectioned UI)
   - `flat`     — single merged array sorted by relevance (for unified list UI)
   - `summary`  — count per type (for badges/tabs)
============================================================================ */
exports.globalSearch = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const q = (req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit) || 5, 20); // per-type cap

  // Filter to specific entity types if requested (e.g. ?types=customer,invoice)
  const requestedTypes = req.query.types
    ? req.query.types.split(',').map(t => t.trim().toLowerCase())
    : null;

  // ── Input validation ────────────────────────────────────────────────────────
  if (!q || q.length < 2) {
    return res.status(200).json({
      status: 'success',
      data: { grouped: {}, flat: [], summary: {} },
    });
  }

  if (q.length > 100) {
    return next(new AppError('Search query too long (max 100 characters)', 400));
  }

  const regex = { $regex: escapeRegex(q), $options: 'i' };

  // ── Select which entities to search ────────────────────────────────────────
  const activeConfigs = requestedTypes
    ? SEARCH_CONFIG.filter(c => requestedTypes.includes(c.type))
    : SEARCH_CONFIG;

  // ── Run all searches in parallel ────────────────────────────────────────────
  const results = await Promise.all(
    activeConfigs.map(async (config) => {
      try {
        const query = config.buildQuery(regex, orgId);
        let q = config.Model.find(query).select(config.select).limit(limit);
        if (config.populate) q = q.populate(config.populate);
        const docs = await q.lean();
        return { config, docs };
      } catch (err) {
        // One entity failing shouldn't kill the whole search
        console.error(`Search failed for ${config.key}:`, err.message);
        return { config, docs: [] };
      }
    })
  );

  // ── Build response ──────────────────────────────────────────────────────────
  const grouped = {};
  const flat = [];
  const summary = {};

  for (const { config, docs } of results) {
    if (!docs.length) {
      summary[config.key] = 0;
      continue;
    }

    const formatted = docs.map(config.format);

    grouped[config.key] = {
      section: config.section,
      type: config.type,
      icon: config.icon,
      count: formatted.length,
      items: formatted,
    };

    flat.push(...formatted);
    summary[config.key] = formatted.length;
  }

  // Sort flat results: exact title matches first, then partial matches
  const qLower = q.toLowerCase();
  flat.sort((a, b) => {
    const aExact = a.title?.toLowerCase().startsWith(qLower) ? 0 : 1;
    const bExact = b.title?.toLowerCase().startsWith(qLower) ? 0 : 1;
    return aExact - bExact;
  });

  res.status(200).json({
    status: 'success',
    query: q,
    totalResults: flat.length,
    data: {
      grouped, // use for tabbed UI / sectioned dropdown
      flat,    // use for single unified list
      summary, // use for tab badges: { customers: 3, invoices: 1, ... }
    },
  });
});

/* ============================================================================
   QUICK LOOKUP BY TYPE
   GET /api/v1/search/lookup?type=customer&q=john
   Lightweight — returns only _id + display label for autocomplete dropdowns.
   No populate, minimal select, fastest possible query.
============================================================================ */
exports.quickLookup = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const q = (req.query.q || '').trim();
  const type = req.query.type?.toLowerCase();
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);

  if (!type) return next(new AppError("Please provide a 'type' query parameter", 400));
  if (!q || q.length < 1) return res.status(200).json({ status: 'success', data: [] });
  if (q.length > 100) return next(new AppError('Query too long (max 100 characters)', 400));

  const regex = { $regex: escapeRegex(q), $options: 'i' };

  // Lookup config — minimal fields only, no populate
  const LOOKUP_CONFIG = {
    customer: {
      Model: Customer,
      query: { organizationId: orgId, isActive: true, isDeleted: false, $or: [{ name: regex }, { phone: regex }] },
      select: '_id name phone',
      format: (d) => ({ _id: d._id, label: `${d.name} (${d.phone || 'No phone'})`, sublabel: d.phone }),
    },
    supplier: {
      Model: Supplier,
      query: { organizationId: orgId, isActive: true, isDeleted: false, $or: [{ companyName: regex }, { phone: regex }] },
      select: '_id companyName phone',
      format: (d) => ({ _id: d._id, label: d.companyName, sublabel: d.phone }),
    },
    product: {
      Model: Product,
      query: { organizationId: orgId, isActive: true, isDeleted: false, $or: [{ name: regex }, { sku: regex }] },
      select: '_id name sku sellingPrice',
      format: (d) => ({ _id: d._id, label: `${d.name} (${d.sku || 'No SKU'})`, sublabel: `₹${d.sellingPrice || 0}` }),
    },
    user: {
      Model: User,
      query: { organizationId: orgId, isActive: true, isDeleted: false, status: 'approved', $or: [{ name: regex }, { email: regex }] },
      select: '_id name email avatar',
      format: (d) => ({ _id: d._id, label: d.name, sublabel: d.email, avatar: d.avatar }),
    },
    invoice: {
      Model: Invoice,
      query: { organizationId: orgId, isDeleted: false, $or: [{ invoiceNumber: regex }] },
      select: '_id invoiceNumber grandTotal paymentStatus',
      format: (d) => ({ _id: d._id, label: d.invoiceNumber, sublabel: `₹${d.grandTotal} · ${d.paymentStatus}` }),
    },
  };

  const config = LOOKUP_CONFIG[type];
  if (!config) return next(new AppError(`Lookup not supported for type '${type}'`, 400));

  const docs = await config.Model.find(config.query)
    .select(config.select)
    .sort({ name: 1, companyName: 1 })
    .limit(limit)
    .lean();

  res.status(200).json({
    status: 'success',
    results: docs.length,
    data: docs.map(config.format),
  });
});


// const catchAsync = require("../../../core/utils/api/catchAsync");
// const Customer = require("../../organization/core/customer.model");
// const Product = require("../../inventory/core/model/product.model");
// const Invoice = require("../../accounting/billing/invoice.model");

// // src/controllers/searchController.js

// exports.globalSearch = catchAsync(async (req, res, next) => {
//   const q = req.query.q || "";
//   const orgId = req.user.organizationId;
//   const limit = 5;
//   if (!q || q.length < 2) return res.status(200).json({ status: "success", data: {} });
//   const regex = { $regex: q, $options: "i" };
//   // Parallel execution is the correct way to handle this
//   const [customers, products, invoices] = await Promise.all([
//     Customer.find({
//       organizationId: orgId,
//       $or: [{ name: regex }, { phone: regex }, { email: regex }]
//     }).limit(limit).select("name phone email avatar").lean(),

//     Product.find({
//       organizationId: orgId,
//       $or: [{ name: regex }, { sku: regex }]
//     }).limit(limit).select("name sku price stock images").lean(),

//     Invoice.find({
//       organizationId: orgId,
//       $or: [{ invoiceNumber: regex }] // Added $or for consistency
//     }).limit(limit).select("invoiceNumber grandTotal status invoiceDate").lean()
//   ]);

//   // 🟢 PERFECTION: Standardized Formatting
//   // This allows your Angular frontend to use one 'SearchResult' component
//   const formattedResults = [
//     ...customers.map(c => ({ ...c, type: 'customer', icon: 'person', link: `/customers/${c._id}` })),
//     ...products.map(p => ({ ...p, type: 'product', icon: 'inventory_2', link: `/inventory/products/${p._id}` })),
//     ...invoices.map(i => ({ ...i, type: 'invoice', icon: 'receipt', link: `/billing/invoices/${i._id}` }))
//   ];

//   res.status(200).json({
//     status: "success",
//     resultsCount: formattedResults.length,
//     data: formattedResults // Frontend can now just loop through one array
//   });
// });
