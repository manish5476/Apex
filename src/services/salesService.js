// src/services/salesService.js
const Sales = require('../models/salesModel');
const Invoice = require('../models/invoiceModel');
const Customer = require('../models/customerModel');
const mongoose = require('mongoose');

class SalesService {

  /* -------------------------------------------------------------
   * Manual Create
  ------------------------------------------------------------- */
  static async create(data) {
    const sales = new Sales(data);
    await sales.save();
    return sales;
  }

  /* -------------------------------------------------------------
   * Find by ID
  ------------------------------------------------------------- */
  static async getById(id) {
    return Sales.findById(id)
      .populate('invoiceId customerId branchId items.productId createdBy')
      .lean()
      .exec();
  }

  /* -------------------------------------------------------------
   * List
  ------------------------------------------------------------- */
  static async list(filter = {}, options = {}) {
    const { limit = 50, page = 1, sort = { createdAt: -1 } } = options;
    const skip = (page - 1) * limit;

    const rows = await Sales.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('invoiceId customerId branchId items.productId createdBy')
      .exec();

    const total = await Sales.countDocuments(filter);

    return { rows, total, page, limit };
  }

  /* -------------------------------------------------------------
   * Update
  ------------------------------------------------------------- */
  static async update(id, data) {
    return await Sales.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  /* -------------------------------------------------------------
   * Soft Delete
  ------------------------------------------------------------- */
  static async remove(id) {
    return await Sales.findByIdAndUpdate(
      id,
      { status: 'cancelled' },
      { new: true }
    ).exec();
  }

  /* -------------------------------------------------------------
   * Create Sales FROM INVOICE (non-transactional)
  ------------------------------------------------------------- */
  static async createFromInvoice(invoiceId) {
    if (!mongoose.Types.ObjectId.isValid(invoiceId))
      throw new Error('Invalid invoice id');

    const invoice = await Invoice.findById(invoiceId)
      .populate('items.productId')
      .lean()
      .exec();

    if (!invoice) throw new Error('Invoice not found');

    const existing = await Sales.findOne({ invoiceId: invoice._id }).exec();
    if (existing) return existing;

    return await this._buildSalesFromInvoice(invoice);
  }

  /* -------------------------------------------------------------
   * Create Sales INSIDE SAME TRANSACTION
  ------------------------------------------------------------- */
  static async createFromInvoiceTransactional(invoiceDoc, session) {
    const existing = await Sales.findOne({ invoiceId: invoiceDoc._id })
      .session(session);

    if (existing) return existing;

    const salesRecord = this._mapInvoiceToSales(invoiceDoc);

    const created = await Sales.create([salesRecord], { session });
    return created[0];
  }

  /* -------------------------------------------------------------
   * Convert Invoice → Sales Object (Corrected)
  ------------------------------------------------------------- */
  static _mapInvoiceToSales(invoice) {
    const items = (invoice.items || []).map(i => {
      const qty = Number(i.quantity || 0);
      const rate = Number(i.price || 0);
      const discount = Number(i.discount || 0);
      const tax = Number(i.taxRate || 0);

      const lineTotal = qty * rate - discount + tax;

      return {
        productId: i.productId,
        sku: i.sku || "",
        name: i.name || "",
        qty,
        rate,
        discount,
        tax,
        lineTotal: isNaN(lineTotal) ? 0 : lineTotal
      };
    });

    return {
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      branchId: invoice.branchId,

      items,

      subTotal: invoice.subTotal || 0,
      taxTotal: invoice.totalTax || 0,
      discountTotal: invoice.totalDiscount || 0,
      totalAmount: invoice.grandTotal || 0,

      paidAmount: invoice.paidAmount || 0,
      dueAmount: (invoice.grandTotal || 0) - (invoice.paidAmount || 0),

      paymentStatus: invoice.paymentStatus,
      status: "active", // Always valid enum

      createdBy: invoice.createdBy,
      meta: { fromInvoice: true }
    };
  }

  /* -------------------------------------------------------------
   * Build Sales (Non Transactional)
  ------------------------------------------------------------- */
  static async _buildSalesFromInvoice(invoice) {
    const salesRecord = this._mapInvoiceToSales(invoice);
    const doc = await Sales.create(salesRecord);

    if (doc.customerId) {
      await Customer.findByIdAndUpdate(doc.customerId, {
        $inc: { totalPurchases: doc.totalAmount }
      });
    }

    return doc;
  }

  /* -------------------------------------------------------------
   * Aggregation For Dashboard
  ------------------------------------------------------------- */
  static async aggregateTotal(filter = {}) {
    const res = await Sales.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$totalAmount' },
          totalCount: { $sum: 1 },
          totalPaid: { $sum: '$paidAmount' }
        }
      },
      {
        $project: {
          _id: 0,
          totalSales: 1,
          totalCount: 1,
          totalPaid: 1
        }
      }
    ]);

    return res[0] || {
      totalSales: 0,
      totalCount: 0,
      totalPaid: 0
    };
  }
}

module.exports = SalesService;


// // src/services/salesService.js
// const Sales = require('../models/salesModel');
// const Invoice = require('../models/invoiceModel');
// const Customer = require('../models/customerModel');
// const mongoose = require('mongoose');

// class SalesService {
//   /* -------------------------------------------------------------
//    * Manual Create (not used often, but needed for admin operations)
//   ------------------------------------------------------------- */
//   static async create(data) {
//     const sales = new Sales(data);
//     await sales.save();
//     return sales;
//   }

//   /* -------------------------------------------------------------
//    * Find by ID
//   ------------------------------------------------------------- */
//   static async getById(id) {
//     return Sales.findById(id)
//       .populate('invoice customer branch items.product createdBy')
//       .lean()
//       .exec();
//   }

//   /* -------------------------------------------------------------
//    * List with filters
//   ------------------------------------------------------------- */
//   static async list(filter = {}, options = {}) {
//     const { limit = 50, page = 1, sort = { createdAt: -1 } } = options;
//     const skip = (page - 1) * limit;

//     const rows = await Sales.find(filter)
//       .sort(sort)
//       .skip(skip)
//       .limit(limit)
//       .populate('invoiceId customerId branchId items.productId createdBy')
//       .exec();

//     const total = await Sales.countDocuments(filter);

//     return { rows, total, page, limit };
//   }

//   /* -------------------------------------------------------------
//    * Update
//   ------------------------------------------------------------- */
//   static async update(id, data) {
//     return await Sales.findByIdAndUpdate(id, data, { new: true }).exec();
//   }

//   /* -------------------------------------------------------------
//    * Soft Delete
//   ------------------------------------------------------------- */
//   static async remove(id) {
//     return await Sales.findByIdAndUpdate(
//       id,
//       { status: 'cancelled' },
//       { new: true }
//     ).exec();
//   }

//   /* -------------------------------------------------------------
//    * Create Sales FROM INVOICE (non-transactional)
//    * Use this only when NOT inside invoice creation
//   ------------------------------------------------------------- */
//   static async createFromInvoice(invoiceId) {
//     if (!mongoose.Types.ObjectId.isValid(invoiceId))
//       throw new Error('Invalid invoice id');

//     const invoice = await Invoice.findById(invoiceId)
//       .populate('items.productId')
//       .lean()
//       .exec();

//     if (!invoice) throw new Error('Invoice not found');

//     const existing = await Sales.findOne({ invoice: invoice._id }).exec();
//     if (existing) return existing;

//     return await this._buildSalesFromInvoice(invoice);
//   }

//   /* -------------------------------------------------------------
//    * Create Sales INSIDE THE SAME TRANSACTION
//    * This is the one we use inside invoiceController
//   ------------------------------------------------------------- */
//   static async createFromInvoiceTransactional(invoiceDoc, session) {
//     // const existing = await Sales.findOne({ invoice: invoiceDoc._id }).session(session);
//     const existing = await Sales.findOne({ invoiceId: invoiceDoc._id }).session(session);

//     if (existing) return existing;

//     const salesRecord = this._mapInvoiceToSales(invoiceDoc);

//     const created = await Sales.create([salesRecord], { session });
//     return created[0];
//   }

//   /* -------------------------------------------------------------
//    * Shared: Convert Invoice → Sales object
//   ------------------------------------------------------------- */
//   // static _mapInvoiceToSales(invoice) {
//   //   const items = invoice.items.map(i => ({
//   //     product: i.productId,
//   //     sku: i.sku,
//   //     name: i.name,
//   //     qty: i.quantity,
//   //     rate: i.sellingPrice,
//   //     discount: i.discount || 0,
//   //     tax: i.taxRate || 0,
//   //     lineTotal:
//   //       (i.quantity * i.sellingPrice) -
//   //       (i.discount || 0) +
//   //       (i.taxRate || 0)
//   //   }));

//   //   return {
//   //     invoice: invoice._id,
//   //     invoiceNo: invoice.invoiceNumber,
//   //     customer: invoice.customerId,
//   //     branch: invoice.branchId,
//   //     items,
//   //     subTotal: invoice.subTotal || 0,
//   //     taxTotal: invoice.taxTotal || 0,
//   //     discountTotal: invoice.discountTotal || 0,
//   //     totalAmount: invoice.grandTotal,
//   //     paidAmount: invoice.paidAmount || 0,
//   //     dueAmount: invoice.grandTotal - (invoice.paidAmount || 0),
//   //     paymentStatus: invoice.paymentStatus,
//   //     status: invoice.status || 'active',
//   //     createdBy: invoice.createdBy,
//   //     meta: { fromInvoice: true }
//   //   };
//   // }
//   static _mapInvoiceToSales(invoice) {
//     const items = invoice.items.map(i => {
//       const qty = Number(i.quantity || 0);
//       const rate = Number(i.price || 0);
//       const discount = Number(i.discount || 0);
//       const tax = Number(i.taxRate || 0);

//       const lineTotal = qty * rate - discount + tax;

//       return {
//         product: i.productId,
//         sku: i.sku || "",
//         name: i.name || "",
//         qty,
//         rate,
//         discount,
//         tax,
//         lineTotal: isNaN(lineTotal) ? 0 : lineTotal
//       };
//     });

//     return {
//       invoiceId: invoice._id,
//       invoiceNo: invoice.invoiceNumber,
//       customer: invoice.customerId,
//       branch: invoice.branchId,
//       items,
//       subTotal: invoice.subTotal || 0,
//       taxTotal: invoice.totalTax || 0,
//       discountTotal: invoice.totalDiscount || 0,
//       totalAmount: invoice.grandTotal || 0,
//       paidAmount: invoice.paidAmount || 0,
//       dueAmount: (invoice.grandTotal || 0) - (invoice.paidAmount || 0),

//       paymentStatus: invoice.paymentStatus,

//       // FIX STATUS MISMATCH — ALWAYS VALID ENUM
//       status: "active",

//       createdBy: invoice.createdBy,
//       meta: { fromInvoice: true }
//     };
//   }

//   /* -------------------------------------------------------------
//    * Shared builder (non-transactional version)
//   ------------------------------------------------------------- */
//   static async _buildSalesFromInvoice(invoice) {
//     const salesRecord = this._mapInvoiceToSales(invoice);
//     const doc = await Sales.create(salesRecord);

//     // Optional customer metrics update
//     if (doc.customer) {
//       await Customer.findByIdAndUpdate(doc.customer, {
//         $inc: { totalPurchases: doc.totalAmount }
//       }).exec();
//     }

//     return doc;
//   }

//   /* -------------------------------------------------------------
//    * Aggregation helper for dashboard
//   ------------------------------------------------------------- */
//   static async aggregateTotal(filter = {}) {
//     const res = await Sales.aggregate([
//       { $match: filter },
//       {
//         $group: {
//           _id: null,
//           totalSales: { $sum: '$totalAmount' },
//           totalCount: { $sum: 1 },
//           totalPaid: { $sum: '$paidAmount' }
//         }
//       },
//       {
//         $project: {
//           _id: 0,
//           totalSales: 1,
//           totalCount: 1,
//           totalPaid: 1
//         }
//       }
//     ]);

//     return res[0] || {
//       totalSales: 0,
//       totalCount: 0,
//       totalPaid: 0
//     };
//   }
// }

// module.exports = SalesService;

