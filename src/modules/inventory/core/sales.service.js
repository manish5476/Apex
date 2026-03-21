const mongoose = require('mongoose');
const Sales = require('./sales.model');
const Invoice = require('../../accounting/billing/invoice.model');
const Customer = require('../../organization/core/customer.model');
const Product = require('./product.model'); // Adjust path if needed in your folder structure
const AccountEntry = require('../../accounting/core/accountEntry.model');
const Account = require('../../accounting/core/account.model');

/* ======================================================
   HELPER: ATOMIC ACCOUNT GET/CREATE
   (Prevents duplicate key errors during parallel requests)
====================================================== */
async function getOrInitAccount(orgId, type, name, code, session) {
  return await Account.findOneAndUpdate(
    { organizationId: orgId, code },
    {
      $setOnInsert: {
        organizationId: orgId,
        name,
        code,
        type,
        isGroup: false,
        isActive: true
      }
    },
    { upsert: true, new: true, session }
  );
}

class SalesService {

  /* =============================================================
   * 1. CREATE: Manual Standalone Sale (e.g., POS / Direct Sale)
   * ============================================================= */
  static async create(data) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // 1. Enrich Items (Fetch COGS) & Validate Stock simultaneously
      const enrichedItems = await this._enrichItemsAndValidateStock(data.items, data.branchId, data.organizationId, session);
      data.items = enrichedItems;
      
      // 2. Save Sale Record
      const [sales] = await Sales.create([data], { session });
      
      // 3. Atomic Stock Deduction (Prevents Race Conditions)
      await this._reduceStockAtomically(enrichedItems, data.branchId, data.organizationId, session);
      
      // 4. Update Customer Stats
      if (data.customerId) {
        await Customer.findByIdAndUpdate(
          data.customerId,
          { $inc: { totalPurchases: data.totalAmount } },
          { session }
        );
      }

      // 5. Record COGS & Inventory Reduction in Ledger
      await this._recordCOGSAccounting(sales, session);
      
      await session.commitTransaction();
      return sales;
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /* =============================================================
   * 2. CREATE FROM INVOICE (Transactional Wrapper)
   * Called by InvoiceController when converting Draft -> Issued
   * ============================================================= */
  static async createFromInvoiceTransactional(invoiceDoc, session) {
    const existing = await Sales.findOne({ invoiceId: invoiceDoc._id }).session(session);
    if (existing) return existing;

    let mappedData = this._mapInvoiceToSales(invoiceDoc);
    
    // Enrich with COGS and validate stock
    mappedData.items = await this._enrichItemsAndValidateStock(mappedData.items, mappedData.branchId, mappedData.organizationId, session);

    const [created] = await Sales.create([mappedData], { session });
    
    // Deduct physical stock
    await this._reduceStockAtomically(mappedData.items, mappedData.branchId, mappedData.organizationId, session);

    // Book COGS
    await this._recordCOGSAccounting(created, session);
    
    // Update Customer Stats
    if (created.customerId) {
      await Customer.findByIdAndUpdate(
        created.customerId,
        { $inc: { totalPurchases: created.totalAmount } },
        { session }
      );
    }

    return created;
  }

  /* =============================================================
   * 3. CREATE FROM INVOICE (Standalone / Non-Transactional)
   * ============================================================= */
  static async createFromInvoice(invoiceId, organizationId) {
    if (!mongoose.Types.ObjectId.isValid(invoiceId)) throw new Error('Invalid invoice id');

    const invoice = await Invoice.findById(invoiceId).populate('items.productId').lean().exec();
    if (!invoice) throw new Error('Invoice not found');

    if (organizationId && invoice.organizationId.toString() !== organizationId.toString()) {
        throw new Error('Unauthorized: Invoice does not belong to this organization');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const sales = await this.createFromInvoiceTransactional(invoice, session);
      await session.commitTransaction();
      return sales;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  /* =============================================================
   * 4. UPDATE FROM INVOICE (Transactional)
   * ============================================================= */
  static async updateFromInvoiceTransactional(invoiceDoc, session) {
    const salesRecord = await Sales.findOne({ invoiceId: invoiceDoc._id }).session(session);
    
    if (!salesRecord) {
      return this.createFromInvoiceTransactional(invoiceDoc, session);
    }

    // Note: If quantities change on an update, you'd technically need to calculate 
    // the diff and adjust stock/COGS. For strict ERPs, invoices shouldn't be edited 
    // after issuance (they should be cancelled/refunded). 
    // Assuming this updates non-financial metadata mostly.
    const mappedData = this._mapInvoiceToSales(invoiceDoc);
    Object.assign(salesRecord, mappedData);
    
    await salesRecord.save({ session });
    return salesRecord;
  }

  /* =============================================================
   * 5. CANCEL SALE (Restore Stock & Reverse COGS)
   * ============================================================= */
  static async remove(id) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const sale = await Sales.findById(id).session(session);
      if (!sale) throw new Error('Sale not found');
      if (sale.status === 'cancelled') throw new Error('Sale already cancelled');
      
      // 1. Restore Stock
      await this._restoreStock(sale.items, sale.branchId, sale.organizationId, session);
      
      // 2. Update Customer Stats
      if (sale.customerId) {
        await Customer.findByIdAndUpdate(
          sale.customerId,
          { $inc: { totalPurchases: -sale.totalAmount } },
          { session }
        );
      }
      
      // 3. Reverse COGS Accounting
      await this._reverseCOGSAccounting(sale, session);

      // 4. Mark as cancelled
      sale.status = 'cancelled';
      await sale.save({ session });
      
      await session.commitTransaction();
      return sale;
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /* =============================================================
   * 6. STANDARD CRUD / QUERIES
   * ============================================================= */
  static async getById(id) {
    return Sales.findById(id)
      .populate('invoiceId customerId branchId items.productId createdBy')
      .lean()
      .exec();
  }

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

  static async update(id, data) {
    // Only non-financial fields should be updated directly here
    return await Sales.findByIdAndUpdate(id, data, { new: true }).exec();
  }

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
      { $project: { _id: 0, totalSales: 1, totalCount: 1, totalPaid: 1 } }
    ]);

    return res[0] || { totalSales: 0, totalCount: 0, totalPaid: 0 };
  }

  static async getAvailableStock(productId, branchId, organizationId) {
    const product = await Product.findOne({ _id: productId, organizationId });
    if (!product) return 0;
    
    const inventory = product.inventory.find(inv => String(inv.branchId) === String(branchId));
    return inventory?.quantity || 0;
  }

  /* =============================================================
   * INTERNAL STOCK & FINANCIAL HELPERS
   * ============================================================= */
  
  static async _enrichItemsAndValidateStock(items, branchId, organizationId, session) {
    const enrichedItems = [];
    const errors = [];

    for (const item of items) {
      const product = await Product.findOne({ _id: item.productId, organizationId }).session(session);
      
      if (!product) {
        errors.push(`Product ${item.productId} not found`);
        continue;
      }
      
      const inventory = product.inventory.find(inv => String(inv.branchId) === String(branchId));
      const availableQty = inventory?.quantity || 0;
      const requiredQty = Number(item.quantity || item.qty || 0);
      
      if (availableQty < requiredQty) {
        errors.push(`${product.name}: Available ${availableQty}, Required ${requiredQty}`);
      }

      // Capture historical cost for accurate Profit Margin
      enrichedItems.push({
        ...item,
        qty: requiredQty,
        name: product.name,
        sku: product.sku || item.sku,
        purchasePriceAtSale: Number(item.purchasePriceAtSale) || Number(product.purchasePrice) || 0
      });
    }

    if (errors.length > 0) {
      throw new Error(`Stock validation failed: ${errors.join(' | ')}`);
    }

    return enrichedItems;
  }

  static async _reduceStockAtomically(items, branchId, organizationId, session) {
    for (const item of items) {
      const qty = Number(item.qty);
      
      const updated = await Product.findOneAndUpdate(
        { 
          _id: item.productId,
          organizationId,
          // 🟢 ATOMIC GUARD: Ensures stock is sufficient exactly when deducting
          inventory: { $elemMatch: { branchId: branchId, quantity: { $gte: qty } } }
        },
        { $inc: { "inventory.$.quantity": -qty } },
        { new: true, session }
      );
      
      if (!updated) {
        throw new Error(`Race condition caught: Insufficient stock for product ${item.name} at checkout.`);
      }
    }
  }

  static async _restoreStock(items, branchId, organizationId, session) {
    for (const item of items) {
      await Product.findOneAndUpdate(
        { _id: item.productId, organizationId, "inventory.branchId": branchId },
        { $inc: { "inventory.$.quantity": Number(item.qty) } },
        { new: true, session }
      );
    }
  }

  static async _recordCOGSAccounting(sale, session) {
    const totalCogsValue = sale.items.reduce((sum, item) => sum + (item.qty * item.purchasePriceAtSale), 0);

    if (totalCogsValue > 0) {
      const inventoryAcc = await getOrInitAccount(sale.organizationId, 'asset', 'Inventory Asset', '1500', session);
      const cogsAcc = await getOrInitAccount(sale.organizationId, 'expense', 'Cost of Goods Sold', '5000', session);

      await AccountEntry.create([
        { // DEBIT: COGS (Expense goes up)
          organizationId: sale.organizationId,
          branchId: sale.branchId,
          accountId: cogsAcc._id,
          date: new Date(),
          debit: totalCogsValue, credit: 0,
          description: `COGS for Sale/Invoice ${sale.invoiceNumber || 'Manual'}`,
          referenceType: 'journal', referenceId: sale._id,
          createdBy: sale.createdBy
        },
        { // CREDIT: Inventory (Asset goes down)
          organizationId: sale.organizationId,
          branchId: sale.branchId,
          accountId: inventoryAcc._id,
          date: new Date(),
          debit: 0, credit: totalCogsValue,
          description: `Inventory reduction for Sale ${sale.invoiceNumber || 'Manual'}`,
          referenceType: 'journal', referenceId: sale._id,
          createdBy: sale.createdBy
        }
      ], { session, ordered: true });
    }
  }

  static async _reverseCOGSAccounting(sale, session) {
    const totalCogsValue = sale.items.reduce((sum, item) => sum + (item.qty * item.purchasePriceAtSale), 0);
    
    if (totalCogsValue > 0) {
      const inventoryAcc = await getOrInitAccount(sale.organizationId, 'asset', 'Inventory Asset', '1500', session);
      const cogsAcc = await getOrInitAccount(sale.organizationId, 'expense', 'Cost of Goods Sold', '5000', session);

      await AccountEntry.create([
        { // DEBIT: Inventory (Asset goes back up)
          organizationId: sale.organizationId, branchId: sale.branchId,
          accountId: inventoryAcc._id, date: new Date(),
          debit: totalCogsValue, credit: 0,
          description: `Stock restored - Sale Cancelled ${sale.invoiceNumber}`,
          referenceType: 'journal', referenceId: sale._id, createdBy: sale.createdBy
        },
        { // CREDIT: COGS (Expense goes back down)
          organizationId: sale.organizationId, branchId: sale.branchId,
          accountId: cogsAcc._id, date: new Date(),
          debit: 0, credit: totalCogsValue,
          description: `COGS reversed - Sale Cancelled ${sale.invoiceNumber}`,
          referenceType: 'journal', referenceId: sale._id, createdBy: sale.createdBy
        }
      ], { session, ordered: true });
    }
  }

  static _mapInvoiceToSales(invoice) {
    const items = (invoice.items || []).map(i => {
      const qty = Number(i.quantity || i.qty || 0);
      const rate = Number(i.price || i.rate || 0);
      const discount = Number(i.discount || 0);
      const taxRate = Number(i.taxRate || 0);
      
      const lineTax = (taxRate / 100) * (qty * rate - discount);
      const lineTotal = qty * rate - discount + lineTax;

      return {
        productId: i.productId,
        sku: i.sku || i.hsnCode || "",
        name: i.name || "",
        qty, 
        rate, 
        discount,
        purchasePriceAtSale: Number(i.purchasePriceAtSale || 0), 
        tax: lineTax, 
        lineTotal: isNaN(lineTotal) ? 0 : lineTotal
      };
    });

    return {
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
      status: invoice.status === 'cancelled' ? 'cancelled' : 'active',
      createdBy: invoice.createdBy,
      meta: { fromInvoice: true, snapshotDate: new Date() }
    };
  }
}

module.exports = SalesService;
// const Sales = require('./sales.model');
// const Invoice = require('../../accounting/billing/invoice.model');
// const Customer = require('../../organization/core/customer.model');
// const Product = require('./product.model'); 
// const mongoose = require('mongoose');

// class SalesService {

//   /* -------------------------------------------------------------
//    * Manual Create (Standalone Sales)
//    * ------------------------------------------------------------- */
//   static async create(data) {
//     const session = await mongoose.startSession();
//     session.startTransaction();
    
//     try {
//       // First validate stock availability
//       const stockValid = await this._validateStock(data.items, data.branchId, data.organizationId, session);
//       if (!stockValid.isValid) {
//         throw new Error(`Stock validation failed: ${stockValid.errors.join(', ')}`);
//       }
      
//       const sales = new Sales(data);
//       await sales.save({ session });
      
//       // Reduce stock
//       await this._reduceStock(data.items, data.branchId, data.organizationId, session);
      
//       // Update customer if exists
//       if (data.customerId) {
//         await Customer.findByIdAndUpdate(
//           data.customerId,
//           { $inc: { totalPurchases: data.totalAmount } },
//           { session }
//         );
//       }
      
//       await session.commitTransaction();
//       return sales;
      
//     } catch (error) {
//       await session.abortTransaction();
//       throw error;
//     } finally {
//       session.endSession();
//     }
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
//     // For sales, updates should be limited to non-financial fields
//     // Stock adjustments should be handled separately
//     return await Sales.findByIdAndUpdate(id, data, { new: true }).exec();
//   }

//   /* -------------------------------------------------------------
//    * Soft Delete (Cancel Sale)
//    * ------------------------------------------------------------- */
//   static async remove(id) {
//     const session = await mongoose.startSession();
//     session.startTransaction();
    
//     try {
//       // Get sale first
//       const sale = await Sales.findById(id).session(session);
//       if (!sale) throw new Error('Sale not found');
      
//       // Restore stock
//       await this._restoreStock(sale.items, sale.branchId, sale.organizationId, session);
      
//       // Update customer stats
//       if (sale.customerId) {
//         await Customer.findByIdAndUpdate(
//           sale.customerId,
//           { $inc: { totalPurchases: -sale.totalAmount } },
//           { session }
//         );
//       }
      
//       // Mark as cancelled
//       const updated = await Sales.findByIdAndUpdate(
//         id,
//         { status: 'cancelled' },
//         { new: true, session }
//       );
      
//       await session.commitTransaction();
//       return updated;
      
//     } catch (error) {
//       await session.abortTransaction();
//       throw error;
//     } finally {
//       session.endSession();
//     }
//   }

  
//   /* -------------------------------------------------------------
//    * Update Sales INSIDE SAME TRANSACTION (Add this method)
//    * ------------------------------------------------------------- */
//   static async updateFromInvoiceTransactional(invoiceDoc, session) {
//     const salesRecord = await Sales.findOne({ invoiceId: invoiceDoc._id }).session(session);
    
//     if (!salesRecord) {
//       // If it doesn't exist (maybe created before sales tracking), create it
//       return this.createFromInvoiceTransactional(invoiceDoc, session);
//     }

//     // Remap the latest data from the invoice
//     const mappedData = this._mapInvoiceToSales(invoiceDoc);
    
//     // Update fields
//     Object.assign(salesRecord, mappedData);
//     await salesRecord.save({ session });
    
//     return salesRecord;
//   }

//   /* -------------------------------------------------------------
//    * Convert Invoice → Sales Object
//    * ------------------------------------------------------------- */
//   static _mapInvoiceToSales(invoice) {
//     const items = (invoice.items || []).map(i => {
//       const qty = Number(i.quantity || 0);
//       const rate = Number(i.price || 0);
//       const discount = Number(i.discount || 0);
//       // In your Invoice, taxRate is the percentage (e.g., 18)
//       const taxRate = Number(i.taxRate || 0);
      
//       // Calculate the actual tax amount for the Sales record
//       const lineTax = (taxRate / 100) * (qty * rate - discount);
//       const lineTotal = qty * rate - discount + lineTax;

//       return {
//         productId: i.productId,
//         sku: i.sku || i.hsnCode || "",
//         name: i.name || "",
//         qty,
//         rate,
        
//         // 🟢 THE CRITICAL ADDITION: Mapping the snapshot from Invoice to Sales
//         purchasePriceAtSale: Number(i.purchasePriceAtSale || 0), 
        
//         discount,
//         tax: lineTax, // Storing the amount here makes analytics faster
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
//       meta: { 
//         fromInvoice: true,
//         snapshotDate: new Date() 
//       }
//     };
//   }
  
//   // /* -------------------------------------------------------------
//   //  * Convert Invoice → Sales Object
//   //  * ------------------------------------------------------------- */
//   // static _mapInvoiceToSales(invoice) {
//   //   const items = (invoice.items || []).map(i => {
//   //     const qty = Number(i.quantity || 0);
//   //     const rate = Number(i.price || 0);
//   //     const discount = Number(i.discount || 0);
//   //     const tax = Number(i.taxRate || 0);
//   //     const lineTotal = qty * rate - discount + tax;

//   //     return {
//   //       productId: i.productId,
//   //       sku: i.sku || "",
//   //       name: i.name || "",
//   //       qty,
//   //       rate,
//   //       discount,
//   //       tax,
//   //       lineTotal: isNaN(lineTotal) ? 0 : lineTotal
//   //     };
//   //   });

//   //   return {
//   //     organizationId: invoice.organizationId,
//   //     branchId: invoice.branchId,
//   //     invoiceId: invoice._id,
//   //     invoiceNumber: invoice.invoiceNumber,
//   //     customerId: invoice.customerId,
//   //     items,
//   //     subTotal: invoice.subTotal || 0,
//   //     taxTotal: invoice.totalTax || 0,
//   //     discountTotal: invoice.totalDiscount || 0,
//   //     totalAmount: invoice.grandTotal || 0,
//   //     paidAmount: invoice.paidAmount || 0,
//   //     dueAmount: (invoice.grandTotal || 0) - (invoice.paidAmount || 0),
//   //     paymentStatus: invoice.paymentStatus,
//   //     status: invoice.status === 'cancelled' ? 'cancelled' : 'active',
//   //     createdBy: invoice.createdBy,
//   //     meta: { fromInvoice: true }
//   //   };
//   // }
  
//   /* -------------------------------------------------------------
//    * Create Sales FROM INVOICE (non-transactional wrapper)
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
//    * Create Sales INSIDE SAME TRANSACTION (FIXED)
//    * This is called by InvoiceController.createInvoice
//    * ------------------------------------------------------------- */
//   static async createFromInvoiceTransactional(invoiceDoc, session) {
//     const existing = await Sales.findOne({ invoiceId: invoiceDoc._id })
//       .session(session);

//     if (existing) return existing;

//     // --- CRITICAL FIX START ---
//     // Removed _validateStock and _reduceStock calls here.
//     // The Invoice Controller handles stock validation and reduction physically.
//     // This service only creates the analytics/reporting record.
//     // --- CRITICAL FIX END ---

//     const salesRecord = this._mapInvoiceToSales(invoiceDoc);
//     const created = await Sales.create([salesRecord], { session });
    
//     return created[0];
//   }

//   /* -------------------------------------------------------------
//    * Convert Invoice → Sales Object
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
//       status: "active", 

//       createdBy: invoice.createdBy,
//       meta: { fromInvoice: true }
//     };
//   }

//   /* -------------------------------------------------------------
//    * Build Sales (Non Transactional Helper)
//    * ------------------------------------------------------------- */
//   static async _buildSalesFromInvoice(invoice) {
//     const salesRecord = this._mapInvoiceToSales(invoice);
    
//     const session = await mongoose.startSession();
//     session.startTransaction();
    
//     try {
//       // NOTE: Here we DO need stock validation because this is likely 
//       // a standalone call (e.g., converting Draft -> Issued manually)
//       // where the controller didn't handle it yet.
      
//       const stockValid = await this._validateStock(
//         invoice.items,
//         invoice.branchId,
//         invoice.organizationId,
//         session
//       );
      
//       if (!stockValid.isValid) {
//         throw new Error(`Insufficient stock: ${stockValid.errors.join(', ')}`);
//       }
      
//       const [doc] = await Sales.create([salesRecord], { session });
      
//       await this._reduceStock(
//         invoice.items,
//         invoice.branchId,
//         invoice.organizationId,
//         session
//       );
      
//       if (doc.customerId) {
//         await Customer.findByIdAndUpdate(
//           doc.customerId,
//           { $inc: { totalPurchases: doc.totalAmount } },
//           { session }
//         );
//       }

//       await session.commitTransaction();
//       return doc;
      
//     } catch (error) {
//       await session.abortTransaction();
//       throw error;
//     } finally {
//       session.endSession();
//     }
//   }

//   /* -------------------------------------------------------------
//    * STOCK MANAGEMENT HELPERS
//    * ------------------------------------------------------------- */
  
//   // Validate stock availability
//   static async _validateStock(items, branchId, organizationId, session = null) {
//     const errors = [];
    
//     for (const item of items) {
//       const query = Product.findOne({
//         _id: item.productId,
//         organizationId
//       });
      
//       if (session) query.session(session);
      
//       const product = await query;
      
//       if (!product) {
//         errors.push(`Product ${item.productId} not found`);
//         continue;
//       }
      
//       const inventory = product.inventory.find(
//         inv => String(inv.branchId) === String(branchId)
//       );
      
//       const availableQty = inventory?.quantity || 0;
//       const requiredQty = item.quantity || item.qty || 0;
      
//       if (availableQty < requiredQty) {
//         errors.push(
//           `${product.name}: Available ${availableQty}, Required ${requiredQty}`
//         );
//       }
//     }
    
//     return {
//       isValid: errors.length === 0,
//       errors
//     };
//   }
  
//   // Reduce stock after sale
//   static async _reduceStock(items, branchId, organizationId, session = null) {
//     for (const item of items) {
//       const quantity = item.quantity || item.qty || 0;
      
//       const updateQuery = Product.findOneAndUpdate(
//         { 
//           _id: item.productId,
//           organizationId,
//           "inventory.branchId": branchId 
//         },
//         { $inc: { "inventory.$.quantity": -quantity } },
//         { new: true }
//       );
      
//       if (session) updateQuery.session(session);
      
//       await updateQuery;
//     }
//   }
  
//   // Restore stock when sale is cancelled
//   static async _restoreStock(items, branchId, organizationId, session = null) {
//     for (const item of items) {
//       const quantity = item.quantity || item.qty || 0;
      
//       const updateQuery = Product.findOneAndUpdate(
//         { 
//           _id: item.productId,
//           organizationId,
//           "inventory.branchId": branchId 
//         },
//         { $inc: { "inventory.$.quantity": quantity } },
//         { new: true }
//       );
      
//       if (session) updateQuery.session(session);
      
//       await updateQuery;
//     }
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
  
//   /* -------------------------------------------------------------
//    * Get Available Stock
//    * ------------------------------------------------------------- */
//   static async getAvailableStock(productId, branchId, organizationId) {
//     const product = await Product.findOne({
//       _id: productId,
//       organizationId
//     });
    
//     if (!product) return 0;
    
//     const inventory = product.inventory.find(
//       inv => String(inv.branchId) === String(branchId)
//     );
    
//     return inventory?.quantity || 0;
//   }
// }

// module.exports = SalesService;









// // const Sales = require('./sales.model');
// // const Invoice = require('../../accounting/billing/invoice.model');
// // const Customer = require('../../organization/core/customer.model');
// // const Product = require('./product.model'); // Add this import
// // const mongoose = require('mongoose');

// // class SalesService {

// //   /* -------------------------------------------------------------
// //    * Manual Create
// //    * ------------------------------------------------------------- */
// //   static async create(data) {
// //     const session = await mongoose.startSession();
// //     session.startTransaction();
    
// //     try {
// //       // First validate stock availability
// //       const stockValid = await this._validateStock(data.items, data.branchId, data.organizationId, session);
// //       if (!stockValid.isValid) {
// //         throw new Error(`Stock validation failed: ${stockValid.errors.join(', ')}`);
// //       }
      
// //       const sales = new Sales(data);
// //       await sales.save({ session });
      
// //       // Reduce stock
// //       await this._reduceStock(data.items, data.branchId, data.organizationId, session);
      
// //       // Update customer if exists
// //       if (data.customerId) {
// //         await Customer.findByIdAndUpdate(
// //           data.customerId,
// //           { $inc: { totalPurchases: data.totalAmount } },
// //           { session }
// //         );
// //       }
      
// //       await session.commitTransaction();
// //       return sales;
      
// //     } catch (error) {
// //       await session.abortTransaction();
// //       throw error;
// //     } finally {
// //       session.endSession();
// //     }
// //   }

// //   /* -------------------------------------------------------------
// //    * Find by ID
// //    * ------------------------------------------------------------- */
// //   static async getById(id) {
// //     return Sales.findById(id)
// //       .populate('invoiceId customerId branchId items.productId createdBy')
// //       .lean()
// //       .exec();
// //   }

// //   /* -------------------------------------------------------------
// //    * List
// //    * ------------------------------------------------------------- */
// //   static async list(filter = {}, options = {}) {
// //     const { limit = 50, page = 1, sort = { createdAt: -1 } } = options;
// //     const skip = (page - 1) * limit;

// //     const rows = await Sales.find(filter)
// //       .sort(sort)
// //       .skip(skip)
// //       .limit(limit)
// //       .populate('invoiceId customerId branchId items.productId createdBy')
// //       .exec();

// //     const total = await Sales.countDocuments(filter);

// //     return { rows, total, page, limit };
// //   }

// //   /* -------------------------------------------------------------
// //    * Update
// //    * ------------------------------------------------------------- */
// //   static async update(id, data) {
// //     // For sales, updates should be limited to non-financial fields
// //     // Stock adjustments should be handled separately
// //     return await Sales.findByIdAndUpdate(id, data, { new: true }).exec();
// //   }

// //   /* -------------------------------------------------------------
// //    * Soft Delete (Cancel Sale)
// //    * ------------------------------------------------------------- */
// //   static async remove(id) {
// //     const session = await mongoose.startSession();
// //     session.startTransaction();
    
// //     try {
// //       // Get sale first
// //       const sale = await Sales.findById(id).session(session);
// //       if (!sale) throw new Error('Sale not found');
      
// //       // Restore stock
// //       await this._restoreStock(sale.items, sale.branchId, sale.organizationId, session);
      
// //       // Update customer stats
// //       if (sale.customerId) {
// //         await Customer.findByIdAndUpdate(
// //           sale.customerId,
// //           { $inc: { totalPurchases: -sale.totalAmount } },
// //           { session }
// //         );
// //       }
      
// //       // Mark as cancelled
// //       const updated = await Sales.findByIdAndUpdate(
// //         id,
// //         { status: 'cancelled' },
// //         { new: true, session }
// //       );
      
// //       await session.commitTransaction();
// //       return updated;
      
// //     } catch (error) {
// //       await session.abortTransaction();
// //       throw error;
// //     } finally {
// //       session.endSession();
// //     }
// //   }

// //   /* -------------------------------------------------------------
// //    * Create Sales FROM INVOICE (non-transactional)
// //    * ------------------------------------------------------------- */
// //   static async createFromInvoice(invoiceId, organizationId) {
// //     if (!mongoose.Types.ObjectId.isValid(invoiceId))
// //       throw new Error('Invalid invoice id');

// //     const invoice = await Invoice.findById(invoiceId)
// //       .populate('items.productId')
// //       .lean()
// //       .exec();

// //     if (!invoice) throw new Error('Invoice not found');

// //     // 🔒 Security Check: Ensure invoice belongs to the requesting Org
// //     if (organizationId && invoice.organizationId.toString() !== organizationId.toString()) {
// //         throw new Error('Unauthorized: Invoice does not belong to this organization');
// //     }

// //     const existing = await Sales.findOne({ invoiceId: invoice._id }).exec();
// //     if (existing) return existing;

// //     return await this._buildSalesFromInvoice(invoice);
// //   }

// //   /* -------------------------------------------------------------
// //    * Create Sales INSIDE SAME TRANSACTION
// //    * ------------------------------------------------------------- */
// //   static async createFromInvoiceTransactional(invoiceDoc, session) {
// //     const existing = await Sales.findOne({ invoiceId: invoiceDoc._id })
// //       .session(session);

// //     if (existing) return existing;

// //     // Validate stock before creating sale
// //     // const stockValid = await this._validateStock(
// //     //   invoiceDoc.items,
// //     //   invoiceDoc.branchId,
// //     //   invoiceDoc.organizationId,
// //     //   session
// //     // );
    
// //     // if (!stockValid.isValid) {
// //     //   throw new Error(`Insufficient stock: ${stockValid.errors.join(', ')}`);
// //     // }

// //     const salesRecord = this._mapInvoiceToSales(invoiceDoc);
// //     const created = await Sales.create([salesRecord], { session });
    
// //     // Reduce stock
// //     await this._reduceStock(
// //       invoiceDoc.items,
// //       invoiceDoc.branchId,
// //       invoiceDoc.organizationId,
// //       session
// //     );
    
// //     return created[0];
// //   }

// //   /* -------------------------------------------------------------
// //    * Convert Invoice → Sales Object (FIXED)
// //    * ------------------------------------------------------------- */
// //   static _mapInvoiceToSales(invoice) {
// //     const items = (invoice.items || []).map(i => {
// //       const qty = Number(i.quantity || 0);
// //       const rate = Number(i.price || 0);
// //       const discount = Number(i.discount || 0);
// //       const tax = Number(i.taxRate || 0);

// //       const lineTotal = qty * rate - discount + tax;

// //       return {
// //         productId: i.productId,
// //         sku: i.sku || "",
// //         name: i.name || "",
// //         qty,
// //         rate,
// //         discount,
// //         tax,
// //         lineTotal: isNaN(lineTotal) ? 0 : lineTotal
// //       };
// //     });

// //     return {
// //       // 1. TENANCY MAPPING (The Fix)
// //       organizationId: invoice.organizationId,
// //       branchId: invoice.branchId,

// //       invoiceId: invoice._id,
// //       invoiceNumber: invoice.invoiceNumber,
// //       customerId: invoice.customerId,
      
// //       items,

// //       subTotal: invoice.subTotal || 0,
// //       taxTotal: invoice.totalTax || 0,
// //       discountTotal: invoice.totalDiscount || 0,
// //       totalAmount: invoice.grandTotal || 0,

// //       paidAmount: invoice.paidAmount || 0,
// //       dueAmount: (invoice.grandTotal || 0) - (invoice.paidAmount || 0),

// //       paymentStatus: invoice.paymentStatus,
// //       status: "active", 

// //       createdBy: invoice.createdBy,
// //       meta: { fromInvoice: true }
// //     };
// //   }

// //   /* -------------------------------------------------------------
// //    * Build Sales (Non Transactional)
// //    * ------------------------------------------------------------- */
// //   static async _buildSalesFromInvoice(invoice) {
// //     const salesRecord = this._mapInvoiceToSales(invoice);
    
// //     const session = await mongoose.startSession();
// //     session.startTransaction();
    
// //     try {
// //       // Validate stock
// //       const stockValid = await this._validateStock(
// //         invoice.items,
// //         invoice.branchId,
// //         invoice.organizationId,
// //         session
// //       );
      
// //       if (!stockValid.isValid) {
// //         throw new Error(`Insufficient stock: ${stockValid.errors.join(', ')}`);
// //       }
      
// //       // Create sales record
// //       const [doc] = await Sales.create([salesRecord], { session });
      
// //       // Reduce stock
// //       await this._reduceStock(
// //         invoice.items,
// //         invoice.branchId,
// //         invoice.organizationId,
// //         session
// //       );
      
// //       // Update customer
// //       if (doc.customerId) {
// //         await Customer.findByIdAndUpdate(
// //           doc.customerId,
// //           { $inc: { totalPurchases: doc.totalAmount } },
// //           { session }
// //         );
// //       }

// //       await session.commitTransaction();
// //       return doc;
      
// //     } catch (error) {
// //       await session.abortTransaction();
// //       throw error;
// //     } finally {
// //       session.endSession();
// //     }
// //   }

// //   /* -------------------------------------------------------------
// //    * STOCK MANAGEMENT HELPERS
// //    * ------------------------------------------------------------- */
  
// //   // Validate stock availability
// //   static async _validateStock(items, branchId, organizationId, session = null) {
// //     const errors = [];
    
// //     for (const item of items) {
// //       const query = Product.findOne({
// //         _id: item.productId,
// //         organizationId
// //       });
      
// //       if (session) query.session(session);
      
// //       const product = await query;
      
// //       if (!product) {
// //         errors.push(`Product ${item.productId} not found`);
// //         continue;
// //       }
      
// //       const inventory = product.inventory.find(
// //         inv => String(inv.branchId) === String(branchId)
// //       );
      
// //       const availableQty = inventory?.quantity || 0;
// //       const requiredQty = item.quantity || item.qty || 0;
      
// //       if (availableQty < requiredQty) {
// //         errors.push(
// //           `${product.name}: Available ${availableQty}, Required ${requiredQty}`
// //         );
// //       }
// //     }
    
// //     return {
// //       isValid: errors.length === 0,
// //       errors
// //     };
// //   }
  
// //   // Reduce stock after sale
// //   static async _reduceStock(items, branchId, organizationId, session = null) {
// //     for (const item of items) {
// //       const quantity = item.quantity || item.qty || 0;
      
// //       const updateQuery = Product.findOneAndUpdate(
// //         { 
// //           _id: item.productId,
// //           organizationId,
// //           "inventory.branchId": branchId 
// //         },
// //         { $inc: { "inventory.$.quantity": -quantity } },
// //         { new: true }
// //       );
      
// //       if (session) updateQuery.session(session);
      
// //       await updateQuery;
      
// //       // If inventory entry doesn't exist, create it with negative quantity (shouldn't happen if validated)
// //       const product = await Product.findOne({
// //         _id: item.productId,
// //         organizationId,
// //         "inventory.branchId": { $ne: branchId }
// //       }).session(session);
      
// //       if (product) {
// //         product.inventory.push({
// //           branchId: branchId,
// //           quantity: -quantity
// //         });
// //         await product.save({ session });
// //       }
// //     }
// //   }
  
// //   // Restore stock when sale is cancelled
// //   static async _restoreStock(items, branchId, organizationId, session = null) {
// //     for (const item of items) {
// //       const quantity = item.quantity || item.qty || 0;
      
// //       const updateQuery = Product.findOneAndUpdate(
// //         { 
// //           _id: item.productId,
// //           organizationId,
// //           "inventory.branchId": branchId 
// //         },
// //         { $inc: { "inventory.$.quantity": quantity } },
// //         { new: true }
// //       );
      
// //       if (session) updateQuery.session(session);
      
// //       await updateQuery;
// //     }
// //   }

// //   /* -------------------------------------------------------------
// //    * Aggregation For Dashboard
// //    * ------------------------------------------------------------- */
// //   static async aggregateTotal(filter = {}) {
// //     const res = await Sales.aggregate([
// //       { $match: filter },
// //       {
// //         $group: {
// //           _id: null,
// //           totalSales: { $sum: '$totalAmount' },
// //           totalCount: { $sum: 1 },
// //           totalPaid: { $sum: '$paidAmount' }
// //         }
// //       },
// //       {
// //         $project: {
// //           _id: 0,
// //           totalSales: 1,
// //           totalCount: 1,
// //           totalPaid: 1
// //         }
// //       }
// //     ]);

// //     return res[0] || {
// //       totalSales: 0,
// //       totalCount: 0,
// //       totalPaid: 0
// //     };
// //   }
  
// //   /* -------------------------------------------------------------
// //    * Get Available Stock
// //    * ------------------------------------------------------------- */
// //   static async getAvailableStock(productId, branchId, organizationId) {
// //     const product = await Product.findOne({
// //       _id: productId,
// //       organizationId
// //     });
    
// //     if (!product) return 0;
    
// //     const inventory = product.inventory.find(
// //       inv => String(inv.branchId) === String(branchId)
// //     );
    
// //     return inventory?.quantity || 0;
// //   }
// // }

// // module.exports = SalesService;
