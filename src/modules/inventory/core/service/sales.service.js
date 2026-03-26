'use strict';

const mongoose = require('mongoose');

const Sales    = require('../model/sales.model');
const Invoice  = require('../../../accounting/billing/invoice.model');
const Customer = require('../../../organization/core/customer.model');
const Product  = require('../model/product.model');

const StockService   = require('./stock.service');
const JournalService = require('./Journal.service');
const AppError       = require('../../../../core/utils/api/appError');

/**
 * SalesService
 * ─────────────────────────────────────────────
 * All sales business logic lives here.
 *
 * Key fixes vs original:
 *   - purchasePriceAtSale defaults to null (not 0) — preserves null-guard in Sales model
 *   - _restoreStock throws on failure instead of silently doing nothing
 *   - updateFromInvoiceTransactional only updates safe metadata fields
 *   - list() always enforces organizationId
 *   - createFromInvoice scopes the invoice fetch to the org (no cross-tenant leak)
 *   - _enrichItemsAndValidateStock does one batch Product.find instead of N+1 queries
 *   - COGS accounting routed through JournalService (single source of truth)
 *   - _reduceStockAtomically routed through StockService
 */
class SalesService {

  /* ============================================================
   * 1. CREATE — Manual / POS sale
   * ============================================================ */
  static async create(data) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Enrich items + validate stock (batch query, not N+1)
      const enrichedItems = await this._enrichItemsAndValidateStock(
        data.items, data.branchId, data.organizationId, session
      );
      data.items = enrichedItems;

      const [sale] = await Sales.create([data], { session, ordered: true });

      // Stock deduction via StockService (atomic guard included)
      await StockService.decrement(
        enrichedItems.map(i => ({ productId: i.productId, quantity: i.qty })),
        data.branchId, data.organizationId, session
      );

      // Customer stats
      if (data.customerId) {
        await Customer.findByIdAndUpdate(
          data.customerId,
          { $inc: { totalPurchases: data.totalAmount } },
          { session }
        );
      }

      // COGS journal via JournalService
      await this._postCOGS(sale, session);

      await session.commitTransaction();
      return sale;

    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  /* ============================================================
   * 2. CREATE FROM INVOICE — called inside an existing transaction
   * ============================================================ */
  static async createFromInvoiceTransactional(invoiceDoc, session) {
    // Idempotency guard — unique index on invoiceId backs this up
    const existing = await Sales.findOne({ invoiceId: invoiceDoc._id }).session(session);
    if (existing) return existing;

    const mappedData    = this._mapInvoiceToSales(invoiceDoc);
    const enrichedItems = await this._enrichItemsAndValidateStock(
      mappedData.items, mappedData.branchId, mappedData.organizationId, session
    );
    mappedData.items = enrichedItems;

    const [created] = await Sales.create([mappedData], { session, ordered: true });

    await StockService.decrement(
      enrichedItems.map(i => ({ productId: i.productId, quantity: i.qty })),
      mappedData.branchId, mappedData.organizationId, session
    );

    await this._postCOGS(created, session);

    if (created.customerId) {
      await Customer.findByIdAndUpdate(
        created.customerId,
        { $inc: { totalPurchases: created.totalAmount } },
        { session }
      );
    }

    return created;
  }

  /* ============================================================
   * 3. CREATE FROM INVOICE — standalone entry point (own session)
   *
   * ⚠️  Never call this inside an existing transaction.
   *     Use createFromInvoiceTransactional instead.
   * ============================================================ */
  static async createFromInvoice(invoiceId, organizationId) {
    if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
      throw new AppError('Invalid invoice ID', 400);
    }

    // Scope query to org so we never leak cross-tenant invoice IDs
    const invoice = await Invoice
      .findOne({ _id: invoiceId, organizationId })
      .populate('items.productId')
      .lean();

    if (!invoice) throw new AppError('Invoice not found or access denied', 404);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const sale = await this.createFromInvoiceTransactional(invoice, session);
      await session.commitTransaction();
      return sale;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  /* ============================================================
   * 4. UPDATE FROM INVOICE — only safe metadata fields
   *
   * FIX: Original used Object.assign(salesRecord, mappedData) which
   * silently overwrote totalAmount, items, paidAmount without adjusting
   * stock or COGS. Now only updates non-financial fields.
   * ============================================================ */
  static async updateFromInvoiceTransactional(invoiceDoc, session) {
    const salesRecord = await Sales.findOne({ invoiceId: invoiceDoc._id }).session(session);

    if (!salesRecord) {
      return this.createFromInvoiceTransactional(invoiceDoc, session);
    }

    // Only update fields that don't affect stock / accounting
    const SAFE_FIELDS = ['invoiceNumber', 'status', 'paymentStatus', 'dueAmount', 'paidAmount', 'meta'];
    const mappedData  = this._mapInvoiceToSales(invoiceDoc);

    for (const field of SAFE_FIELDS) {
      if (mappedData[field] !== undefined) {
        salesRecord[field] = mappedData[field];
      }
    }

    await salesRecord.save({ session });
    return salesRecord;
  }

  /* ============================================================
   * 5. CANCEL SALE — restore stock + reverse COGS
   * ============================================================ */
  static async remove(saleId, organizationId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const sale = await Sales.findOne({ _id: saleId, organizationId }).session(session);
      if (!sale)                        throw new AppError('Sale not found', 404);
      if (sale.status === 'cancelled')  throw new AppError('Sale already cancelled', 400);

      // Restore stock — StockService.increment throws if branch entry missing
      await StockService.increment(
        sale.items.map(i => ({ productId: i.productId, quantity: i.qty })),
        sale.branchId, sale.organizationId, session
      );

      if (sale.customerId) {
        await Customer.findByIdAndUpdate(
          sale.customerId,
          { $inc: { totalPurchases: -sale.totalAmount } },
          { session }
        );
      }

      await this._reverseCOGS(sale, session);

      sale.status = 'cancelled';
      await sale.save({ session });

      await session.commitTransaction();
      return sale;

    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  /* ============================================================
   * 6. QUERIES
   * ============================================================ */

  static async getById(id, organizationId) {
    return Sales.findOne({ _id: id, organizationId })
      .populate('invoiceId customerId branchId items.productId createdBy')
      .lean();
  }

  /**
   * FIX: organizationId is now a required parameter — list() never
   * returns cross-org data even if caller passes an empty filter.
   */
  static async list(organizationId, filter = {}, options = {}) {
    if (!organizationId) throw new AppError('organizationId is required', 400);

    const { limit = 50, page = 1, sort = { createdAt: -1 } } = options;
    const skip = (page - 1) * limit;

    const query = { ...filter, organizationId };

    const [rows, total] = await Promise.all([
      Sales.find(query)
        .sort(sort).skip(skip).limit(limit)
        .populate('invoiceId customerId branchId items.productId createdBy'),
      Sales.countDocuments(query),
    ]);

    return { rows, total, page, limit };
  }

  /**
   * Safe update — only non-financial fields.
   * FIX: Callers that need financial changes must cancel + recreate.
   */
  static async update(id, data, organizationId) {
    const BLOCKED = ['items', 'totalAmount', 'paidAmount', 'dueAmount', 'subTotal'];
    for (const field of BLOCKED) {
      if (field in data) {
        throw new AppError(
          `Field "${field}" cannot be updated directly. Cancel and recreate the sale.`, 400
        );
      }
    }

    const sale = await Sales.findOneAndUpdate(
      { _id: id, organizationId },
      data,
      { new: true, runValidators: true }
    );
    if (!sale) throw new AppError('Sale not found', 404);
    return sale;
  }

  static async aggregateTotal(organizationId, filter = {}) {
    const result = await Sales.aggregate([
      { $match: { ...filter, organizationId: new mongoose.Types.ObjectId(organizationId) } },
      {
        $group: {
          _id:        null,
          totalSales: { $sum: '$totalAmount' },
          totalCount: { $sum: 1 },
          totalPaid:  { $sum: '$paidAmount' },
        },
      },
      { $project: { _id: 0, totalSales: 1, totalCount: 1, totalPaid: 1 } },
    ]);
    return result[0] || { totalSales: 0, totalCount: 0, totalPaid: 0 };
  }

  /* ============================================================
   * PRIVATE HELPERS
   * ============================================================ */

  /**
   * FIX: Batch fetch — one Product.find for all items instead of N+1.
   * FIX: purchasePriceAtSale defaults to null (not 0) so the Sales model
   *      null-guard correctly excludes zero-cost items from margin calc.
   */
  static async _enrichItemsAndValidateStock(items, branchId, organizationId, session) {
    const productIds = items.map(i => i.productId).filter(Boolean);

    const query = Product.find({
      _id: { $in: productIds },
      organizationId,
      isActive: true,
    }).select('name sku inventory purchasePrice');
    if (session) query.session(session);

    const products   = await query;
    const productMap = new Map(products.map(p => [p._id.toString(), p]));

    const errors        = [];
    const enrichedItems = [];

    for (const item of items) {
      const requiredQty = Number(item.quantity ?? item.qty ?? 0);

      if (!requiredQty || requiredQty <= 0) {
        errors.push(`Invalid quantity (${requiredQty}) for product ${item.productId}`);
        continue;
      }

      const product = productMap.get(String(item.productId));
      if (!product) {
        errors.push(`Product ${item.productId} not found or inactive`);
        continue;
      }

      const inv          = product.inventory?.find(i => String(i.branchId) === String(branchId));
      const availableQty = inv?.quantity ?? 0;

      if (!inv) {
        errors.push(`"${product.name}" is not stocked at this branch`);
        continue;
      }

      if (availableQty < requiredQty) {
        errors.push(
          `Insufficient stock for "${product.name}". Available: ${availableQty}, Required: ${requiredQty}`
        );
        continue;
      }

      // FIX: null when cost is unknown — preserves analytics null-guard
      const purchasePriceAtSale =
        item.purchasePriceAtSale != null ? Number(item.purchasePriceAtSale)
        : product.purchasePrice  != null ? Number(product.purchasePrice)
        : null;

      enrichedItems.push({
        ...item,
        qty:  requiredQty,
        name: product.name,
        sku:  product.sku || item.sku,
        purchasePriceAtSale,
      });
    }

    if (errors.length > 0) {
      throw new AppError(errors.join(' | '), 400);
    }

    return enrichedItems;
  }

  /**
   * FIX: COGS routed through JournalService.
   * FIX: Items with null purchasePriceAtSale are skipped with a warning
   *      instead of silently treated as zero-cost.
   */
  static async _postCOGS(sale, session) {
    let totalCogs = 0;
    for (const item of sale.items) {
      if (item.purchasePriceAtSale == null) {
        console.warn(`[COGS] Missing cost for product ${item.productId} in sale ${sale._id}`);
        continue;
      }
      totalCogs += item.qty * item.purchasePriceAtSale;
    }
    if (totalCogs <= 0) return;

    await JournalService.postCOGSJournal({
      orgId:    sale.organizationId,
      branchId: sale.branchId,
      sale,
      totalCogs,
      userId:   sale.createdBy,
      session,
    });
  }

  static async _reverseCOGS(sale, session) {
    let totalCogs = 0;
    for (const item of sale.items) {
      if (item.purchasePriceAtSale == null) continue;
      totalCogs += item.qty * item.purchasePriceAtSale;
    }
    if (totalCogs <= 0) return;

    await JournalService.reverseCOGSJournal({
      orgId:    sale.organizationId,
      branchId: sale.branchId,
      sale,
      totalCogs,
      userId:   sale.createdBy,
      session,
    });
  }

  /**
   * FIX: purchasePriceAtSale defaults to null (not 0).
   */
  static _mapInvoiceToSales(invoice) {
    const items = (invoice.items || []).map(i => {
      const qty      = Number(i.quantity ?? i.qty  ?? 0);
      const rate     = Number(i.price    ?? i.rate ?? 0);
      const discount = Number(i.discount ?? 0);
      const taxRate  = Number(i.taxRate  ?? 0);

      const lineTax   = (taxRate / 100) * (qty * rate - discount);
      const lineTotal = qty * rate - discount + lineTax;

      return {
        productId: i.productId,
        sku:       i.sku || i.hsnCode || '',
        name:      i.name || '',
        qty,
        rate,
        discount,
        // FIX: null when not available — not 0
        purchasePriceAtSale:
          i.purchasePriceAtSale != null ? Number(i.purchasePriceAtSale) : null,
        tax:       lineTax,
        lineTotal: isNaN(lineTotal) ? 0 : parseFloat(lineTotal.toFixed(2)),
      };
    });

    return {
      organizationId: invoice.organizationId,
      branchId:       invoice.branchId,
      invoiceId:      invoice._id,
      invoiceNumber:  invoice.invoiceNumber,
      customerId:     invoice.customerId,
      items,
      subTotal:       invoice.subTotal      || 0,
      taxTotal:       invoice.totalTax      || 0,
      discountTotal:  invoice.totalDiscount || 0,
      totalAmount:    invoice.grandTotal    || 0,
      paidAmount:     invoice.paidAmount    || 0,
      dueAmount:      (invoice.grandTotal   || 0) - (invoice.paidAmount || 0),
      paymentStatus:  invoice.paymentStatus,
      status:         invoice.status === 'cancelled' ? 'cancelled' : 'active',
      createdBy:      invoice.createdBy,
      meta:           { fromInvoice: true, snapshotDate: new Date() },
    };
  }
}

module.exports = SalesService;



// const mongoose = require('mongoose');
// const Sales = require('../model/sales.model');
// const Invoice = require('../../../accounting/billing/invoice.model');
// const Customer = require('../../../organization/core/customer.model');
// const Product = require('../model/product.model'); // Adjust path if needed in your folder structure
// const AccountEntry = require('../../../accounting/core/accountEntry.model');
// const Account = require('../../../accounting/core/account.model');

// /* ======================================================
//    HELPER: ATOMIC ACCOUNT GET/CREATE
//    (Prevents duplicate key errors during parallel requests)
// ====================================================== */
// async function getOrInitAccount(orgId, type, name, code, session) {
//   return await Account.findOneAndUpdate(
//     { organizationId: orgId, code },
//     {
//       $setOnInsert: {
//         organizationId: orgId,
//         name,
//         code,
//         type,
//         isGroup: false,
//         isActive: true
//       }
//     },
//     { upsert: true, new: true, session }
//   );
// }

// class SalesService {

//   /* =============================================================
//    * 1. CREATE: Manual Standalone Sale (e.g., POS / Direct Sale)
//    * ============================================================= */
//   static async create(data) {
//     const session = await mongoose.startSession();
//     session.startTransaction();
    
//     try {
//       // 1. Enrich Items (Fetch COGS) & Validate Stock simultaneously
//       const enrichedItems = await this._enrichItemsAndValidateStock(data.items, data.branchId, data.organizationId, session);
//       data.items = enrichedItems;
      
//       // 2. Save Sale Record
//       const [sales] = await Sales.create([data], { session });
      
//       // 3. Atomic Stock Deduction (Prevents Race Conditions)
//       await this._reduceStockAtomically(enrichedItems, data.branchId, data.organizationId, session);
      
//       // 4. Update Customer Stats
//       if (data.customerId) {
//         await Customer.findByIdAndUpdate(
//           data.customerId,
//           { $inc: { totalPurchases: data.totalAmount } },
//           { session }
//         );
//       }

//       // 5. Record COGS & Inventory Reduction in Ledger
//       await this._recordCOGSAccounting(sales, session);
      
//       await session.commitTransaction();
//       return sales;
      
//     } catch (error) {
//       await session.abortTransaction();
//       throw error;
//     } finally {
//       session.endSession();
//     }
//   }

//   /* =============================================================
//    * 2. CREATE FROM INVOICE (Transactional Wrapper)
//    * Called by InvoiceController when converting Draft -> Issued
//    * ============================================================= */
//   static async createFromInvoiceTransactional(invoiceDoc, session) {
//     const existing = await Sales.findOne({ invoiceId: invoiceDoc._id }).session(session);
//     if (existing) return existing;

//     let mappedData = this._mapInvoiceToSales(invoiceDoc);
    
//     // Enrich with COGS and validate stock
//     mappedData.items = await this._enrichItemsAndValidateStock(mappedData.items, mappedData.branchId, mappedData.organizationId, session);

//     const [created] = await Sales.create([mappedData], { session });
    
//     // Deduct physical stock
//     await this._reduceStockAtomically(mappedData.items, mappedData.branchId, mappedData.organizationId, session);

//     // Book COGS
//     await this._recordCOGSAccounting(created, session);
    
//     // Update Customer Stats
//     if (created.customerId) {
//       await Customer.findByIdAndUpdate(
//         created.customerId,
//         { $inc: { totalPurchases: created.totalAmount } },
//         { session }
//       );
//     }

//     return created;
//   }

//   /* =============================================================
//    * 3. CREATE FROM INVOICE (Standalone / Non-Transactional)
//    * ============================================================= */
//   static async createFromInvoice(invoiceId, organizationId) {
//     if (!mongoose.Types.ObjectId.isValid(invoiceId)) throw new Error('Invalid invoice id');

//     const invoice = await Invoice.findById(invoiceId).populate('items.productId').lean().exec();
//     if (!invoice) throw new Error('Invoice not found');

//     if (organizationId && invoice.organizationId.toString() !== organizationId.toString()) {
//         throw new Error('Unauthorized: Invoice does not belong to this organization');
//     }

//     const session = await mongoose.startSession();
//     session.startTransaction();

//     try {
//       const sales = await this.createFromInvoiceTransactional(invoice, session);
//       await session.commitTransaction();
//       return sales;
//     } catch (err) {
//       await session.abortTransaction();
//       throw err;
//     } finally {
//       session.endSession();
//     }
//   }

//   /* =============================================================
//    * 4. UPDATE FROM INVOICE (Transactional)
//    * ============================================================= */
//   static async updateFromInvoiceTransactional(invoiceDoc, session) {
//     const salesRecord = await Sales.findOne({ invoiceId: invoiceDoc._id }).session(session);
    
//     if (!salesRecord) {
//       return this.createFromInvoiceTransactional(invoiceDoc, session);
//     }

//     // Note: If quantities change on an update, you'd technically need to calculate 
//     // the diff and adjust stock/COGS. For strict ERPs, invoices shouldn't be edited 
//     // after issuance (they should be cancelled/refunded). 
//     // Assuming this updates non-financial metadata mostly.
//     const mappedData = this._mapInvoiceToSales(invoiceDoc);
//     Object.assign(salesRecord, mappedData);
    
//     await salesRecord.save({ session });
//     return salesRecord;
//   }

//   /* =============================================================
//    * 5. CANCEL SALE (Restore Stock & Reverse COGS)
//    * ============================================================= */
//   static async remove(id) {
//     const session = await mongoose.startSession();
//     session.startTransaction();
    
//     try {
//       const sale = await Sales.findById(id).session(session);
//       if (!sale) throw new Error('Sale not found');
//       if (sale.status === 'cancelled') throw new Error('Sale already cancelled');
      
//       // 1. Restore Stock
//       await this._restoreStock(sale.items, sale.branchId, sale.organizationId, session);
      
//       // 2. Update Customer Stats
//       if (sale.customerId) {
//         await Customer.findByIdAndUpdate(
//           sale.customerId,
//           { $inc: { totalPurchases: -sale.totalAmount } },
//           { session }
//         );
//       }
      
//       // 3. Reverse COGS Accounting
//       await this._reverseCOGSAccounting(sale, session);

//       // 4. Mark as cancelled
//       sale.status = 'cancelled';
//       await sale.save({ session });
      
//       await session.commitTransaction();
//       return sale;
      
//     } catch (error) {
//       await session.abortTransaction();
//       throw error;
//     } finally {
//       session.endSession();
//     }
//   }

//   /* =============================================================
//    * 6. STANDARD CRUD / QUERIES
//    * ============================================================= */
//   static async getById(id) {
//     return Sales.findById(id)
//       .populate('invoiceId customerId branchId items.productId createdBy')
//       .lean()
//       .exec();
//   }

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

//   static async update(id, data) {
//     // Only non-financial fields should be updated directly here
//     return await Sales.findByIdAndUpdate(id, data, { new: true }).exec();
//   }

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
//       { $project: { _id: 0, totalSales: 1, totalCount: 1, totalPaid: 1 } }
//     ]);

//     return res[0] || { totalSales: 0, totalCount: 0, totalPaid: 0 };
//   }

//   static async getAvailableStock(productId, branchId, organizationId) {
//     const product = await Product.findOne({ _id: productId, organizationId });
//     if (!product) return 0;
    
//     const inventory = product.inventory.find(inv => String(inv.branchId) === String(branchId));
//     return inventory?.quantity || 0;
//   }

//   /* =============================================================
//    * INTERNAL STOCK & FINANCIAL HELPERS
//    * ============================================================= */
  
//   static async _enrichItemsAndValidateStock(items, branchId, organizationId, session) {
//     const enrichedItems = [];
//     const errors = [];

//     for (const item of items) {
//       const product = await Product.findOne({ _id: item.productId, organizationId }).session(session);
      
//       if (!product) {
//         errors.push(`Product ${item.productId} not found`);
//         continue;
//       }
      
//       const inventory = product.inventory.find(inv => String(inv.branchId) === String(branchId));
//       const availableQty = inventory?.quantity || 0;
//       const requiredQty = Number(item.quantity || item.qty || 0);
      
//       if (availableQty < requiredQty) {
//         errors.push(`${product.name}: Available ${availableQty}, Required ${requiredQty}`);
//       }

//       // Capture historical cost for accurate Profit Margin
//       enrichedItems.push({
//         ...item,
//         qty: requiredQty,
//         name: product.name,
//         sku: product.sku || item.sku,
//         purchasePriceAtSale: Number(item.purchasePriceAtSale) || Number(product.purchasePrice) || 0
//       });
//     }

//     if (errors.length > 0) {
//       throw new Error(`Stock validation failed: ${errors.join(' | ')}`);
//     }

//     return enrichedItems;
//   }

//   static async _reduceStockAtomically(items, branchId, organizationId, session) {
//     for (const item of items) {
//       const qty = Number(item.qty);
      
//       const updated = await Product.findOneAndUpdate(
//         { 
//           _id: item.productId,
//           organizationId,
//           // 🟢 ATOMIC GUARD: Ensures stock is sufficient exactly when deducting
//           inventory: { $elemMatch: { branchId: branchId, quantity: { $gte: qty } } }
//         },
//         { $inc: { "inventory.$.quantity": -qty } },
//         { new: true, session }
//       );
      
//       if (!updated) {
//         throw new Error(`Race condition caught: Insufficient stock for product ${item.name} at checkout.`);
//       }
//     }
//   }

//   static async _restoreStock(items, branchId, organizationId, session) {
//     for (const item of items) {
//       await Product.findOneAndUpdate(
//         { _id: item.productId, organizationId, "inventory.branchId": branchId },
//         { $inc: { "inventory.$.quantity": Number(item.qty) } },
//         { new: true, session }
//       );
//     }
//   }

//   static async _recordCOGSAccounting(sale, session) {
//     const totalCogsValue = sale.items.reduce((sum, item) => sum + (item.qty * item.purchasePriceAtSale), 0);

//     if (totalCogsValue > 0) {
//       const inventoryAcc = await getOrInitAccount(sale.organizationId, 'asset', 'Inventory Asset', '1500', session);
//       const cogsAcc = await getOrInitAccount(sale.organizationId, 'expense', 'Cost of Goods Sold', '5000', session);

//       await AccountEntry.create([
//         { // DEBIT: COGS (Expense goes up)
//           organizationId: sale.organizationId,
//           branchId: sale.branchId,
//           accountId: cogsAcc._id,
//           date: new Date(),
//           debit: totalCogsValue, credit: 0,
//           description: `COGS for Sale/Invoice ${sale.invoiceNumber || 'Manual'}`,
//           referenceType: 'journal', referenceId: sale._id,
//           createdBy: sale.createdBy
//         },
//         { // CREDIT: Inventory (Asset goes down)
//           organizationId: sale.organizationId,
//           branchId: sale.branchId,
//           accountId: inventoryAcc._id,
//           date: new Date(),
//           debit: 0, credit: totalCogsValue,
//           description: `Inventory reduction for Sale ${sale.invoiceNumber || 'Manual'}`,
//           referenceType: 'journal', referenceId: sale._id,
//           createdBy: sale.createdBy
//         }
//       ], { session, ordered: true });
//     }
//   }

//   static async _reverseCOGSAccounting(sale, session) {
//     const totalCogsValue = sale.items.reduce((sum, item) => sum + (item.qty * item.purchasePriceAtSale), 0);
    
//     if (totalCogsValue > 0) {
//       const inventoryAcc = await getOrInitAccount(sale.organizationId, 'asset', 'Inventory Asset', '1500', session);
//       const cogsAcc = await getOrInitAccount(sale.organizationId, 'expense', 'Cost of Goods Sold', '5000', session);

//       await AccountEntry.create([
//         { // DEBIT: Inventory (Asset goes back up)
//           organizationId: sale.organizationId, branchId: sale.branchId,
//           accountId: inventoryAcc._id, date: new Date(),
//           debit: totalCogsValue, credit: 0,
//           description: `Stock restored - Sale Cancelled ${sale.invoiceNumber}`,
//           referenceType: 'journal', referenceId: sale._id, createdBy: sale.createdBy
//         },
//         { // CREDIT: COGS (Expense goes back down)
//           organizationId: sale.organizationId, branchId: sale.branchId,
//           accountId: cogsAcc._id, date: new Date(),
//           debit: 0, credit: totalCogsValue,
//           description: `COGS reversed - Sale Cancelled ${sale.invoiceNumber}`,
//           referenceType: 'journal', referenceId: sale._id, createdBy: sale.createdBy
//         }
//       ], { session, ordered: true });
//     }
//   }

//   static _mapInvoiceToSales(invoice) {
//     const items = (invoice.items || []).map(i => {
//       const qty = Number(i.quantity || i.qty || 0);
//       const rate = Number(i.price || i.rate || 0);
//       const discount = Number(i.discount || 0);
//       const taxRate = Number(i.taxRate || 0);
      
//       const lineTax = (taxRate / 100) * (qty * rate - discount);
//       const lineTotal = qty * rate - discount + lineTax;

//       return {
//         productId: i.productId,
//         sku: i.sku || i.hsnCode || "",
//         name: i.name || "",
//         qty, 
//         rate, 
//         discount,
//         purchasePriceAtSale: Number(i.purchasePriceAtSale || 0), 
//         tax: lineTax, 
//         lineTotal: isNaN(lineTotal) ? 0 : lineTotal
//       };
//     });

//     return {
//       organizationId: invoice.organizationId,
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
//       status: invoice.status === 'cancelled' ? 'cancelled' : 'active',
//       createdBy: invoice.createdBy,
//       meta: { fromInvoice: true, snapshotDate: new Date() }
//     };
//   }
// }

// module.exports = SalesService;