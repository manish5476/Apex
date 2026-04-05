'use strict';

const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const Product = require('../model/product.model');
const StockService = require('./stock.service');
const JournalService = require('./Journal.service');
const AppError = require('../../../../core/utils/api/appError');
const { runInTransaction } = require('../../../../core/utils/db/runInTransaction');

const slugify = (value) =>
  value.toString().trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * ProductService
 * ─────────────────────────────────────────────
 * All product business logic lives here.
 * StockService owns all inventory movements.
 * JournalService owns all AccountEntry writes.
 * This service orchestrates them together.
 */
class ProductService {

  /* ============================================================
   * 1. CREATE PRODUCT (with opening stock journal)
   * ============================================================ */
  static async createProduct(data, user) {
    let product;

    await runInTransaction(async (session) => {
      // Normalize flat quantity → inventory array
      if (data.quantity && (!data.inventory || data.inventory.length === 0)) {
        data.inventory = [{
          branchId: user.branchId,
          quantity: Number(data.quantity),
          reorderLevel: data.reorderLevel || 10,
        }];
      }

      [product] = await Product.create([{
        ...data,
        organizationId: user.organizationId,
        slug: `${slugify(data.name)}-${nanoid(6)}`,
        createdBy: user._id,
      }], { session, ordered: true });

      // Opening stock journal (Dr Inventory / Cr Equity)
      const totalQty = product.inventory?.reduce((a, b) => a + (b.quantity || 0), 0) || 0;
      const stockValue = totalQty * (product.purchasePrice || 0);

      if (stockValue > 0) {
        await JournalService.postOpeningStockJournal({
          orgId: user.organizationId,
          branchId: user.branchId,
          product,
          stockValue,
          userId: user._id,
          session,
        });
      }
    }, 3, { action: 'CREATE_PRODUCT', userId: user._id });

    return product;
  }

  /* ============================================================
   * 2. UPDATE PRODUCT (metadata only — no stock/cost mutation)
   * ============================================================ */
  static async updateProduct(productId, data, user) {
    // Hard guards — these must go through proper flows
    if (data.quantity !== undefined || data.inventory !== undefined) {
      throw new AppError('Stock cannot be changed here. Use Purchase or Stock Adjustment.', 400);
    }
    if (data.purchasePrice !== undefined) {
      throw new AppError('Cost price cannot be edited directly. Use purchase entries.', 400);
    }

    // Auto-update slug if name changes
    if (data.name) {
      data.slug = `${slugify(data.name)}-${nanoid(6)}`;
    }

    const product = await Product.findOneAndUpdate(
      { _id: productId, organizationId: user.organizationId },
      data,
      { new: true, runValidators: true }
    );

    if (!product) throw new AppError('Product not found', 404);
    return product;
  }

  /* ============================================================
   * 3. DELETE PRODUCT (soft-delete, only if stock = 0)
   * ============================================================ */
  static async deleteProduct(productId, user) {
    const product = await Product.findOne({
      _id: productId, organizationId: user.organizationId,
    });
    if (!product) throw new AppError('Product not found', 404);

    const totalStock = product.inventory?.reduce((a, b) => a + (b.quantity || 0), 0) || 0;
    if (totalStock > 0) {
      throw new AppError(
        `Cannot delete product with stock (${totalStock} units remaining). Write off stock first.`, 400
      );
    }

    product.isDeleted = true;
    product.isActive = false;
    await product.save();
  }

  /* ============================================================
   * 4. STOCK ADJUSTMENT (add / subtract with journal)
   * ============================================================ */
  static async adjustStock(productId, { type, quantity, reason, branchId }, user) {
    if (!['add', 'subtract'].includes(type)) {
      throw new AppError('Invalid type. Must be "add" or "subtract"', 400);
    }
    const qty = Number(quantity);
    if (!qty || qty <= 0) throw new AppError('Quantity must be positive', 400);

    let product;

    await runInTransaction(async (session) => {
      const targetBranch = branchId || user.branchId;
      const item = { productId, quantity: qty };

      if (type === 'subtract') {
        // StockService.decrement validates availability before touching DB
        await StockService.decrement([item], targetBranch, user.organizationId, session);
      } else {
        await StockService.increment([item], targetBranch, user.organizationId, session);
      }

      product = await Product.findOne({ _id: productId, organizationId: user.organizationId })
        .session(session);

      await JournalService.postStockAdjustmentJournal({
        orgId: user.organizationId,
        branchId: targetBranch,
        product,
        quantity: qty,
        type,
        reason,
        userId: user._id,
        session,
      });

    }, 3, { action: 'ADJUST_STOCK', userId: user._id });

    return product;
  }

  /* ============================================================
   * 5. STOCK TRANSFER (inter-branch, no GL entries)
   * ============================================================ */
  static async transferStock(productId, { fromBranchId, toBranchId, quantity }, user) {
    if (!fromBranchId || !toBranchId) {
      throw new AppError('Source and destination branches are required', 400);
    }
    if (String(fromBranchId) === String(toBranchId)) {
      throw new AppError('Source and destination cannot be the same branch', 400);
    }
    const qty = Number(quantity);
    if (!qty || qty <= 0) throw new AppError('Quantity must be positive', 400);

    await runInTransaction(async (session) => {
      // Verify product belongs to this org
      const exists = await Product.exists({
        _id: productId, organizationId: user.organizationId,
      }).session(session);
      if (!exists) throw new AppError('Product not found', 404);

      await StockService.transfer({
        productId,
        fromBranchId,
        toBranchId,
        quantity: qty,
        organizationId: user.organizationId,
      }, session);

    }, 3, { action: 'TRANSFER_STOCK', userId: user._id });
  }

  /* ============================================================
   * 6. BULK IMPORT (batched, with opening stock journals)
   * ============================================================ */
  static async bulkImport(rawProducts, user) {
    if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
      throw new AppError('Provide an array of products', 400);
    }
    if (rawProducts.length > 500) {
      throw new AppError('Maximum 500 products per bulk import', 400);
    }

    // Pre-validate before opening a transaction
    for (const p of rawProducts) {
      const qty = p.quantity || p.inventory?.reduce((a, i) => a + (i.quantity || 0), 0) || 0;
      if (qty > 0 && (!p.purchasePrice || p.purchasePrice <= 0)) {
        throw new AppError(`purchasePrice is required for stocked item: "${p.name}"`, 400);
      }
    }

    let importedCount = 0;
    let journalCount = 0;

    await runInTransaction(async (session) => {
      // Pre-fetch accounts once for the whole import
      const [inventoryAcc, equityAcc] = await Promise.all([
        JournalService.getOrInitAccount(user.organizationId, 'asset', 'Inventory Asset', '1500', session),
        JournalService.getOrInitAccount(user.organizationId, 'equity', 'Opening Balance Equity', '3000', session),
      ]);

      const BATCH_SIZE = 100;
      const journalEntries = [];

      for (let i = 0; i < rawProducts.length; i += BATCH_SIZE) {
        const batch = rawProducts.slice(i, i + BATCH_SIZE);

        const mapped = batch.map(p => ({
          ...p,
          organizationId: user.organizationId,
          slug: `${slugify(p.name)}-${nanoid(6)}`,
          inventory: p.inventory?.length
            ? p.inventory
            : (p.quantity ? [{ branchId: user.branchId, quantity: Number(p.quantity) }] : []),
          createdBy: user._id,
        }));

        const created = await Product.insertMany(mapped, { session });
        importedCount += created.length;

        // Build journal entries — iterate RESULT to get generated _ids
        for (const product of created) {
          const totalQty = product.inventory.reduce((s, i) => s + (i.quantity || 0), 0);
          const stockValue = parseFloat((totalQty * (product.purchasePrice || 0)).toFixed(2));

          if (stockValue > 0) {
            journalEntries.push(
              {
                organizationId: user.organizationId,
                branchId: user.branchId,
                accountId: inventoryAcc._id,
                date: new Date(),
                debit: stockValue,
                credit: 0,
                description: `Opening Stock: ${product.name}`,
                referenceType: 'opening_stock',
                referenceId: product._id,
                createdBy: user._id,
              },
              {
                organizationId: user.organizationId,
                branchId: user.branchId,
                accountId: equityAcc._id,
                date: new Date(),
                debit: 0,
                credit: stockValue,
                description: `Opening Stock Equity: ${product.name}`,
                referenceType: 'opening_stock',
                referenceId: product._id,
                createdBy: user._id,
              }
            );
            journalCount += 2;
          }
        }
      }

      // Insert all journal entries in one call
      if (journalEntries.length > 0) {
        const AccountEntry = require('../../accounting/core/model/accountEntry.model');
        await AccountEntry.insertMany(journalEntries, { session });
      }

    }, 3, { action: 'BULK_IMPORT_PRODUCTS', userId: user._id });

    return { importedCount, journalEntriesCreated: journalCount };
  }

  /* ============================================================
   * 7. BULK UPDATE (safe fields only, with org-scoped filter)
   * ============================================================ */
  static async bulkUpdate(updates, user) {
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new AppError('Provide an array of updates', 400);
    }

    const FORBIDDEN = [
      'quantity', 'inventory', 'purchasePrice', 'costPrice',
      'openingStock', 'organizationId', 'createdBy', '_id',
    ];
    const ALLOWED = [
      'name', 'description', 'sku', 'barcode', 'hsnCode',
      'categoryId', 'brandId', 'unitId', 'sellingPrice', 'mrp',
      'taxRate', 'isActive', 'reorderLevel', 'images',
    ];

    const bulkOps = [];

    for (const u of updates) {
      if (!u._id || !u.update) {
        throw new AppError('Each item must have _id and update fields', 400);
      }

      for (const key of Object.keys(u.update)) {
        if (FORBIDDEN.includes(key)) {
          throw new AppError(`Field "${key}" cannot be bulk-updated. Use stock adjustment.`, 400);
        }
      }

      const cleanUpdate = {};
      for (const key of ALLOWED) {
        if (u.update[key] !== undefined) cleanUpdate[key] = u.update[key];
      }

      if (cleanUpdate.name) {
        cleanUpdate.slug = `${slugify(cleanUpdate.name)}-${nanoid(6)}`;
      }

      if (Object.keys(cleanUpdate).length > 0) {
        bulkOps.push({
          updateOne: {
            filter: {
              _id: new mongoose.Types.ObjectId(u._id),
              organizationId: new mongoose.Types.ObjectId(user.organizationId),
            },
            update: { $set: cleanUpdate },
          },
        });
      }
    }

    if (bulkOps.length === 0) {
      return { matched: 0, modified: 0 };
    }

    const result = await Product.bulkWrite(bulkOps);
    return { matched: result.matchedCount, modified: result.modifiedCount };
  }

  /* ============================================================
   * 8. GET PRODUCT HISTORY (cross-collection movement ledger)
   * ============================================================ */
  static async getProductHistory(productId, orgId, { startDate, endDate }) {
    const Invoice = require('../../accounting/billing/invoice.model');
    const Purchase = require('../model/purchase.model');
    const PurchaseReturn = require('../model/purchase.return.model');
    const AccountEntry = require('../../accounting/core/model/accountEntry.model');

    // Build a clean date filter — guard against "null" / "undefined" strings
    const dateFilter = {};
    if (startDate && endDate && startDate !== 'null' && startDate !== 'undefined') {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        dateFilter.$gte = start;
        dateFilter.$lte = end;
      }
    }

    const applyDate = Object.keys(dateFilter).length > 0;

    // Run all four queries in parallel
    const [invoices, purchases, returns, adjustments] = await Promise.all([
      Invoice.find({
        organizationId: orgId,
        'items.productId': productId,
        status: { $ne: 'cancelled' },
        ...(applyDate ? { invoiceDate: dateFilter } : {}),
      }).populate('customerId', 'name').lean(),

      Purchase.find({
        organizationId: orgId,
        'items.productId': productId,
        status: { $ne: 'cancelled' },
        isDeleted: false,
        ...(applyDate ? { purchaseDate: dateFilter } : {}),
      }).populate('supplierId', 'companyName').lean(),

      PurchaseReturn.find({
        organizationId: orgId,
        'items.productId': productId,
        ...(applyDate ? { returnDate: dateFilter } : {}),
      }).populate('supplierId', 'companyName').lean(),

      AccountEntry.find({
        organizationId: orgId,
        referenceId: productId,
        referenceType: { $in: ['journal', 'opening_stock'] },
        ...(applyDate ? { date: dateFilter } : {}),
      }).lean(),
    ]);

    const salesHistory = invoices.flatMap(inv => {
      const item = inv.items.find(i => String(i.productId) === String(productId));
      if (!item) return [];
      return [{
        _id: inv._id, type: 'SALE',
        date: inv.invoiceDate, reference: inv.invoiceNumber,
        party: inv.customerId?.name || 'Walk-in Customer',
        quantity: -Math.abs(item.quantity),
        value: item.price * item.quantity,
        description: 'Sale Invoice',
      }];
    });

    const purchaseHistory = purchases.flatMap(pur => {
      const item = pur.items.find(i => String(i.productId) === String(productId));
      if (!item) return [];
      return [{
        _id: pur._id, type: 'PURCHASE',
        date: pur.purchaseDate, reference: pur.invoiceNumber,
        party: pur.supplierId?.companyName || 'Unknown Supplier',
        quantity: Math.abs(item.quantity),
        value: item.purchasePrice * item.quantity,
        description: 'Purchase Bill',
      }];
    });

    const returnHistory = returns.flatMap(ret => {
      const item = ret.items.find(i => String(i.productId) === String(productId));
      if (!item) return [];
      return [{
        _id: ret._id, type: 'PURCHASE_RETURN',
        date: ret.returnDate,
        reference: `Return to ${ret.supplierId?.companyName || 'Supplier'}`,
        party: ret.supplierId?.companyName,
        quantity: -Math.abs(item.quantity),
        value: item.returnPrice * item.quantity,
        description: ret.reason || 'Debit Note',
      }];
    });

    const adjustmentHistory = adjustments.map(entry => ({
      _id: entry._id,
      type: entry.referenceType === 'opening_stock' ? 'OPENING STOCK' : 'ADJUSTMENT',
      date: entry.date, reference: 'Journal',
      party: 'System Admin', quantity: null,
      value: entry.debit > 0 ? entry.debit : -entry.credit,
      description: entry.description,
    }));

    return [...salesHistory, ...purchaseHistory, ...returnHistory, ...adjustmentHistory]
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  /* ============================================================
   * 9. LOW STOCK REPORT (pure aggregation — no memory load)
   * ============================================================ */
  static async getLowStockProducts(user) {
    const orgId = new mongoose.Types.ObjectId(user.organizationId);

    return Product.aggregate([
      { $match: { organizationId: orgId, isActive: true, isDeleted: false } },
      {
        $addFields: {
          totalStockCalculated: { $sum: '$inventory.quantity' },
          maxReorderLevel: {
            $cond: {
              if: { $gt: [{ $size: '$inventory' }, 0] },
              then: { $max: '$inventory.reorderLevel' },
              else: 10,
            },
          },
        },
      },
      {
        $match: { $expr: { $lte: ['$totalStockCalculated', '$maxReorderLevel'] } },
      },
      {
        $project: {
          name: 1, sku: 1, barcode: 1,
          currentStock: '$totalStockCalculated',
          reorderLevel: '$maxReorderLevel',
          image: { $arrayElemAt: ['$images', 0] },
        },
      },
      { $sort: { currentStock: 1 } },
    ]);
  }

  /* ============================================================
   * 10. SCAN PRODUCT (POS barcode / SKU lookup)
   * ============================================================ */
  // static async scanProduct(code, branchId, user) {
  //   if (!code) throw new AppError('Please provide a scan code', 400);

  //   const product = await Product.findOne({
  //     organizationId: user.organizationId,
  //     isActive:  true,
  //     isDeleted: false,
  //     $or: [{ barcode: code }, { sku: code }],
  //   })
  //     .select('_id name sku sellingPrice taxRate unitId inventory')
  //     .lean();

  //   if (!product) throw new AppError('Product not found', 404);

  //   const targetBranchId  = branchId || user.branchId;
  //   const branchInventory = product.inventory?.find(
  //     inv => String(inv.branchId) === String(targetBranchId)
  //   );
  //   const availableStock = branchInventory?.quantity ?? 0;

  //   // Strip raw inventory array from the response payload
  //   const { inventory: _inv, ...productData } = product;

  //   return { product: productData, availableStock };
  // }
  static async scanProduct(scanValue, branchId, user) {
    // Update the error check to look at scanValue
    if (!scanValue) throw new AppError('Please provide a scan code', 400);

    const product = await Product.findOne({
      organizationId: user.organizationId,
      isActive: true,
      isDeleted: false,
      // Check against scanValue
      $or: [{ barcode: scanValue }, { sku: scanValue }],
    })
      .select('_id name sku sellingPrice taxRate unitId inventory')
      .lean();

    if (!product) throw new AppError('Product not found', 404);

    const targetBranchId = branchId || user.branchId;
    const branchInventory = product.inventory?.find(
      inv => String(inv.branchId) === String(targetBranchId)
    );
    const availableStock = branchInventory?.quantity ?? 0;

    const { inventory: _inv, ...productData } = product;

    return { product: productData, availableStock };
  }
}

module.exports = ProductService;