const Sales = require('../models/salesModel');
const Invoice = require('../models/invoiceModel');
const Customer = require('../models/customerModel');
const Product = require('../models/productModel'); // Add this import
const mongoose = require('mongoose');

class SalesService {

  /* -------------------------------------------------------------
   * Manual Create
   * ------------------------------------------------------------- */
  static async create(data) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // First validate stock availability
      const stockValid = await this._validateStock(data.items, data.branchId, data.organizationId, session);
      if (!stockValid.isValid) {
        throw new Error(`Stock validation failed: ${stockValid.errors.join(', ')}`);
      }
      
      const sales = new Sales(data);
      await sales.save({ session });
      
      // Reduce stock
      await this._reduceStock(data.items, data.branchId, data.organizationId, session);
      
      // Update customer if exists
      if (data.customerId) {
        await Customer.findByIdAndUpdate(
          data.customerId,
          { $inc: { totalPurchases: data.totalAmount } },
          { session }
        );
      }
      
      await session.commitTransaction();
      return sales;
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /* -------------------------------------------------------------
   * Find by ID
   * ------------------------------------------------------------- */
  static async getById(id) {
    return Sales.findById(id)
      .populate('invoiceId customerId branchId items.productId createdBy')
      .lean()
      .exec();
  }

  /* -------------------------------------------------------------
   * List
   * ------------------------------------------------------------- */
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
   * ------------------------------------------------------------- */
  static async update(id, data) {
    // For sales, updates should be limited to non-financial fields
    // Stock adjustments should be handled separately
    return await Sales.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  /* -------------------------------------------------------------
   * Soft Delete (Cancel Sale)
   * ------------------------------------------------------------- */
  static async remove(id) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Get sale first
      const sale = await Sales.findById(id).session(session);
      if (!sale) throw new Error('Sale not found');
      
      // Restore stock
      await this._restoreStock(sale.items, sale.branchId, sale.organizationId, session);
      
      // Update customer stats
      if (sale.customerId) {
        await Customer.findByIdAndUpdate(
          sale.customerId,
          { $inc: { totalPurchases: -sale.totalAmount } },
          { session }
        );
      }
      
      // Mark as cancelled
      const updated = await Sales.findByIdAndUpdate(
        id,
        { status: 'cancelled' },
        { new: true, session }
      );
      
      await session.commitTransaction();
      return updated;
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /* -------------------------------------------------------------
   * Create Sales FROM INVOICE (non-transactional)
   * ------------------------------------------------------------- */
  static async createFromInvoice(invoiceId, organizationId) {
    if (!mongoose.Types.ObjectId.isValid(invoiceId))
      throw new Error('Invalid invoice id');

    const invoice = await Invoice.findById(invoiceId)
      .populate('items.productId')
      .lean()
      .exec();

    if (!invoice) throw new Error('Invoice not found');

    // 🔒 Security Check: Ensure invoice belongs to the requesting Org
    if (organizationId && invoice.organizationId.toString() !== organizationId.toString()) {
        throw new Error('Unauthorized: Invoice does not belong to this organization');
    }

    const existing = await Sales.findOne({ invoiceId: invoice._id }).exec();
    if (existing) return existing;

    return await this._buildSalesFromInvoice(invoice);
  }

  /* -------------------------------------------------------------
   * Create Sales INSIDE SAME TRANSACTION
   * ------------------------------------------------------------- */
  static async createFromInvoiceTransactional(invoiceDoc, session) {
    const existing = await Sales.findOne({ invoiceId: invoiceDoc._id })
      .session(session);

    if (existing) return existing;

    // Validate stock before creating sale
    const stockValid = await this._validateStock(
      invoiceDoc.items,
      invoiceDoc.branchId,
      invoiceDoc.organizationId,
      session
    );
    
    if (!stockValid.isValid) {
      throw new Error(`Insufficient stock: ${stockValid.errors.join(', ')}`);
    }

    const salesRecord = this._mapInvoiceToSales(invoiceDoc);
    const created = await Sales.create([salesRecord], { session });
    
    // Reduce stock
    await this._reduceStock(
      invoiceDoc.items,
      invoiceDoc.branchId,
      invoiceDoc.organizationId,
      session
    );
    
    return created[0];
  }

  /* -------------------------------------------------------------
   * Convert Invoice → Sales Object (FIXED)
   * ------------------------------------------------------------- */
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
      // 1. TENANCY MAPPING (The Fix)
      organizationId: invoice.organizationId,
      branchId: invoice.branchId,

      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      
      items,

      subTotal: invoice.subTotal || 0,
      taxTotal: invoice.totalTax || 0,
      discountTotal: invoice.totalDiscount || 0,
      totalAmount: invoice.grandTotal || 0,

      paidAmount: invoice.paidAmount || 0,
      dueAmount: (invoice.grandTotal || 0) - (invoice.paidAmount || 0),

      paymentStatus: invoice.paymentStatus,
      status: "active", 

      createdBy: invoice.createdBy,
      meta: { fromInvoice: true }
    };
  }

  /* -------------------------------------------------------------
   * Build Sales (Non Transactional)
   * ------------------------------------------------------------- */
  static async _buildSalesFromInvoice(invoice) {
    const salesRecord = this._mapInvoiceToSales(invoice);
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Validate stock
      const stockValid = await this._validateStock(
        invoice.items,
        invoice.branchId,
        invoice.organizationId,
        session
      );
      
      if (!stockValid.isValid) {
        throw new Error(`Insufficient stock: ${stockValid.errors.join(', ')}`);
      }
      
      // Create sales record
      const [doc] = await Sales.create([salesRecord], { session });
      
      // Reduce stock
      await this._reduceStock(
        invoice.items,
        invoice.branchId,
        invoice.organizationId,
        session
      );
      
      // Update customer
      if (doc.customerId) {
        await Customer.findByIdAndUpdate(
          doc.customerId,
          { $inc: { totalPurchases: doc.totalAmount } },
          { session }
        );
      }

      await session.commitTransaction();
      return doc;
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /* -------------------------------------------------------------
   * STOCK MANAGEMENT HELPERS
   * ------------------------------------------------------------- */
  
  // Validate stock availability
  static async _validateStock(items, branchId, organizationId, session = null) {
    const errors = [];
    
    for (const item of items) {
      const query = Product.findOne({
        _id: item.productId,
        organizationId
      });
      
      if (session) query.session(session);
      
      const product = await query;
      
      if (!product) {
        errors.push(`Product ${item.productId} not found`);
        continue;
      }
      
      const inventory = product.inventory.find(
        inv => String(inv.branchId) === String(branchId)
      );
      
      const availableQty = inventory?.quantity || 0;
      const requiredQty = item.quantity || item.qty || 0;
      
      if (availableQty < requiredQty) {
        errors.push(
          `${product.name}: Available ${availableQty}, Required ${requiredQty}`
        );
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  // Reduce stock after sale
  static async _reduceStock(items, branchId, organizationId, session = null) {
    for (const item of items) {
      const quantity = item.quantity || item.qty || 0;
      
      const updateQuery = Product.findOneAndUpdate(
        { 
          _id: item.productId,
          organizationId,
          "inventory.branchId": branchId 
        },
        { $inc: { "inventory.$.quantity": -quantity } },
        { new: true }
      );
      
      if (session) updateQuery.session(session);
      
      await updateQuery;
      
      // If inventory entry doesn't exist, create it with negative quantity (shouldn't happen if validated)
      const product = await Product.findOne({
        _id: item.productId,
        organizationId,
        "inventory.branchId": { $ne: branchId }
      }).session(session);
      
      if (product) {
        product.inventory.push({
          branchId: branchId,
          quantity: -quantity
        });
        await product.save({ session });
      }
    }
  }
  
  // Restore stock when sale is cancelled
  static async _restoreStock(items, branchId, organizationId, session = null) {
    for (const item of items) {
      const quantity = item.quantity || item.qty || 0;
      
      const updateQuery = Product.findOneAndUpdate(
        { 
          _id: item.productId,
          organizationId,
          "inventory.branchId": branchId 
        },
        { $inc: { "inventory.$.quantity": quantity } },
        { new: true }
      );
      
      if (session) updateQuery.session(session);
      
      await updateQuery;
    }
  }

  /* -------------------------------------------------------------
   * Aggregation For Dashboard
   * ------------------------------------------------------------- */
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
  
  /* -------------------------------------------------------------
   * Get Available Stock
   * ------------------------------------------------------------- */
  static async getAvailableStock(productId, branchId, organizationId) {
    const product = await Product.findOne({
      _id: productId,
      organizationId
    });
    
    if (!product) return 0;
    
    const inventory = product.inventory.find(
      inv => String(inv.branchId) === String(branchId)
    );
    
    return inventory?.quantity || 0;
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
//    * Manual Create
//    * ------------------------------------------------------------- */
//   static async create(data) {
//     const sales = new Sales(data);
//     await sales.save();
//     return sales;
//   }

//   /* -------------------------------------------------------------
//    * Find by ID
//    * ------------------------------------------------------------- */
//   static async getById(id) {
//     return Sales.findById(id)
//       .populate('invoiceId customerId branchId items.productId createdBy')
//       .lean()
//       .exec();
//   }

//   /* -------------------------------------------------------------
//    * List
//    * ------------------------------------------------------------- */
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
//    * ------------------------------------------------------------- */
//   static async update(id, data) {
//     return await Sales.findByIdAndUpdate(id, data, { new: true }).exec();
//   }

//   /* -------------------------------------------------------------
//    * Soft Delete
//    * ------------------------------------------------------------- */
//   static async remove(id) {
//     return await Sales.findByIdAndUpdate(
//       id,
//       { status: 'cancelled' },
//       { new: true }
//     ).exec();
//   }

//   /* -------------------------------------------------------------
//    * Create Sales FROM INVOICE (non-transactional)
//    * ------------------------------------------------------------- */
//   static async createFromInvoice(invoiceId, organizationId) {
//     if (!mongoose.Types.ObjectId.isValid(invoiceId))
//       throw new Error('Invalid invoice id');

//     const invoice = await Invoice.findById(invoiceId)
//       .populate('items.productId')
//       .lean()
//       .exec();

//     if (!invoice) throw new Error('Invoice not found');

//     // 🔒 Security Check: Ensure invoice belongs to the requesting Org
//     if (organizationId && invoice.organizationId.toString() !== organizationId.toString()) {
//         throw new Error('Unauthorized: Invoice does not belong to this organization');
//     }

//     const existing = await Sales.findOne({ invoiceId: invoice._id }).exec();
//     if (existing) return existing;

//     return await this._buildSalesFromInvoice(invoice);
//   }

//   /* -------------------------------------------------------------
//    * Create Sales INSIDE SAME TRANSACTION
//    * ------------------------------------------------------------- */
//   static async createFromInvoiceTransactional(invoiceDoc, session) {
//     const existing = await Sales.findOne({ invoiceId: invoiceDoc._id })
//       .session(session);

//     if (existing) return existing;

//     const salesRecord = this._mapInvoiceToSales(invoiceDoc);

//     const created = await Sales.create([salesRecord], { session });
//     return created[0];
//   }

//   /* -------------------------------------------------------------
//    * Convert Invoice → Sales Object (FIXED)
//    * ------------------------------------------------------------- */
//   static _mapInvoiceToSales(invoice) {
//     const items = (invoice.items || []).map(i => {
//       const qty = Number(i.quantity || 0);
//       const rate = Number(i.price || 0);
//       const discount = Number(i.discount || 0);
//       const tax = Number(i.taxRate || 0);

//       const lineTotal = qty * rate - discount + tax;

//       return {
//         productId: i.productId,
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
//       // 1. TENANCY MAPPING (The Fix)
//       organizationId: invoice.organizationId, // 👈 CRITICAL: Must map this from Invoice
//       branchId: invoice.branchId,

//       invoiceId: invoice._id,
//       invoiceNumber: invoice.invoiceNumber,
//       customerId: invoice.customerId,
      
//       items,

//       subTotal: invoice.subTotal || 0,
//       taxTotal: invoice.totalTax || 0,
//       discountTotal: invoice.totalDiscount || 0,
//       totalAmount: invoice.grandTotal || 0,

//       paidAmount: invoice.paidAmount || 0,
//       dueAmount: (invoice.grandTotal || 0) - (invoice.paidAmount || 0),

//       paymentStatus: invoice.paymentStatus,
//       status: "active", 

//       createdBy: invoice.createdBy,
//       meta: { fromInvoice: true }
//     };
//   }

//   /* -------------------------------------------------------------
//    * Build Sales (Non Transactional)
//    * ------------------------------------------------------------- */
//   static async _buildSalesFromInvoice(invoice) {
//     const salesRecord = this._mapInvoiceToSales(invoice);
//     const doc = await Sales.create(salesRecord);

//     if (doc.customerId) {
//       await Customer.findByIdAndUpdate(doc.customerId, {
//         $inc: { totalPurchases: doc.totalAmount }
//       });
//     }

//     return doc;
//   }

//   /* -------------------------------------------------------------
//    * Aggregation For Dashboard
//    * ------------------------------------------------------------- */
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
