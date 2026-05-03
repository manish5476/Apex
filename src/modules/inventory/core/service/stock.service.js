'use strict';

const Product = require('../model/product.model');

const AppError = require("../../../../core/utils/api/appError");


/**
 * StockService
 * ─────────────────────────────────────────────
 * Single owner of ALL physical stock movements.
 * No controller or other service should call Product.findOneAndUpdate
 * for inventory purposes — route through here instead.
 *
 * Every public method accepts an optional `session` so callers
 * can include stock changes inside their own transactions.
 */
class StockService {

  /* ============================================================
   * 1. INCREMENT (Goods IN — purchase received, return accepted)
   * ============================================================ */
  static async increment(items, branchId, organizationId, session = null) {
    await Promise.all(items.map(item =>
      this._adjustOne(item, branchId, organizationId, 'increment', session)
    ));
  }

  /* ============================================================
   * 2. DECREMENT (Goods OUT — sale, purchase return, write-off)
   * ============================================================ */
  static async decrement(items, branchId, organizationId, session = null) {
    // Validate ALL items before touching the DB
    await this.validateAvailability(items, branchId, organizationId, session);

    await Promise.all(items.map(item =>
      this._adjustOne(item, branchId, organizationId, 'decrement', session)
    ));
  }

  /* ============================================================
   * 3. TRANSFER (Branch A → Branch B, no net change)
   * ============================================================ */
  static async transfer({ productId, fromBranchId, toBranchId, quantity, organizationId }, session = null) {
    if (String(fromBranchId) === String(toBranchId)) {
      throw new AppError('Source and destination branch cannot be the same', 400);
    }

    const item = { productId, quantity };

    // Decrement source (includes availability check)
    await this.decrement([item], fromBranchId, organizationId, session);

    // Increment destination (creates entry if branch is new)
    await this.increment([item], toBranchId, organizationId, session);
  }

  /* ============================================================
   * 4. VALIDATE AVAILABILITY (pre-flight check, no DB writes)
   * ============================================================ */
  static async validateAvailability(items, branchId, organizationId, session = null) {
    const productIds = items.map(i => i.productId);

    const query = Product.find({
      _id: { $in: productIds },
      organizationId,
      isActive: true,
      isDeleted: false,
    }).select('name inventory');

    if (session) query.session(session);
    const products = await query;

    const productMap = new Map(products.map(p => [p._id.toString(), p]));
    const errors = [];

    for (const item of items) {
      const qty = Number(item.quantity ?? item.qty ?? 0);
      const product = productMap.get(String(item.productId));

      if (!product) {
        errors.push(`Product ${item.productId} not found or inactive`);
        continue;
      }

      const inv = product.inventory?.find(
        i => String(i.branchId) === String(branchId)
      );

      if (!inv) {
        errors.push(`"${product.name}" is not stocked at this branch`);
        continue;
      }

      if (inv.quantity < qty) {
        errors.push(
          `Insufficient stock for "${product.name}". ` +
          `Available: ${inv.quantity}, Required: ${qty}`
        );
      }
    }

    if (errors.length > 0) {
      throw new AppError(errors.join(' | '), 400);
    }
  }

  /* ============================================================
   * 5. GET AVAILABLE QUANTITY (single product, single branch)
   * ============================================================ */
  static async getAvailable(productId, branchId, organizationId, session = null) {
    const query = Product.findOne({ _id: productId, organizationId })
      .select('inventory');
    if (session) query.session(session);

    const product = await query;
    if (!product) return 0;

    const inv = product.inventory?.find(
      i => String(i.branchId) === String(branchId)
    );
    return inv?.quantity ?? 0;
  }

  /* ============================================================
   * 6. GET STOCK VALUE AT COST (for a branch)
   * ============================================================ */
  static async getStockValue(branchId, organizationId) {
    const products = await Product.find({ organizationId, isActive: true, isDeleted: false })
      .select('inventory purchasePrice');

    let totalValue = 0;
    for (const product of products) {
      const inv = product.inventory?.find(
        i => String(i.branchId) === String(branchId)
      );
      if (inv?.quantity > 0) {
        totalValue += inv.quantity * (product.purchasePrice || 0);
      }
    }
    return parseFloat(totalValue.toFixed(2));
  }

  /* ============================================================
   * 7. GET MOVEMENT HISTORY (aggregation across collections)
   * ============================================================ */
  static async getMovementHistory(productId, branchId, organizationId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const orgId  = this._toObjectId(organizationId);
    const brId   = this._toObjectId(branchId);
    const prodId = this._toObjectId(productId);

    const [purchases, sales, returns] = await Promise.all([
      this._aggregateMovement('Purchase',    { orgId, brId, prodId, startDate }, 'purchaseDate', 'items.quantity'),
      this._aggregateMovement('Sales',       { orgId, brId, prodId, startDate }, 'createdAt',    'items.qty'),
      this._aggregateMovement('SalesReturn', { orgId, brId, prodId, startDate }, 'createdAt',    'items.quantity'),
    ]);

    return {
      purchases:     purchases[0]?.total || 0,
      purchaseCount: purchases[0]?.count || 0,
      sales:         sales[0]?.total     || 0,
      salesCount:    sales[0]?.count     || 0,
      returns:       returns[0]?.total   || 0,
      returnCount:   returns[0]?.count   || 0,
    };
  }

  /* ============================================================
   * PRIVATE HELPERS
   * ============================================================ */

  /**
   * Adjust a single product's inventory at one branch.
   * Handles the "branch not yet stocked" case by pushing a new entry.
   *
   * Cost Pricing Strategy: WEIGHTED AVERAGE COST (WAC)
   * ─────────────────────────────────────────────────────
   * When goods come IN from any supplier, we blend the incoming price
   * with the existing stock value instead of overwriting ("last wins"):
   *
   *   New WAC = (currentQty × currentCost + incomingQty × incomingCost)
   *             ─────────────────────────────────────────────────────────
   *             (currentQty + incomingQty)
   *
   * Example — two suppliers, ₹500 price difference:
   *   Existing:  100 units @ ₹10,000  = ₹10,00,000
   *   Incoming:   50 units @ ₹10,500  =  ₹5,25,000
   *   WAC     = ₹15,25,000 ÷ 150     = ₹10,166.67  ✓
   *
   * Decrement (sale / purchase return) never mutates the cost price.
   */
  static async _adjustOne(item, branchId, organizationId, direction, session) {
    const qty  = Number(item.quantity ?? item.qty ?? 0);
    const opts = { new: true, runValidators: true };
    if (session) opts.session = session;

    // ── DECREMENT path ───────────────────────────────────────────────────
    if (direction === 'decrement') {
      const updated = await Product.findOneAndUpdate(
        {
          _id: item.productId,
          organizationId,
          inventory: { $elemMatch: { branchId, quantity: { $gte: qty } } },
        },
        { $inc: { 'inventory.$.quantity': -qty } },
        opts
      );

      if (!updated) {
        throw new AppError(
          `Race condition: stock depleted for product ${item.productId} during transaction`,
          409
        );
      }
      return;
    }

    // ── INCREMENT path: compute Weighted Average Cost ────────────────────
    const incomingCost = Number(item.purchasePrice ?? 0);

    let newCostPrice = null; // null = do not update purchasePrice
    if (incomingCost > 0) {
      // Read current state to calculate WAC
      const readQuery = Product.findOne(
        { _id: item.productId, organizationId },
        { purchasePrice: 1, inventory: 1 }
      );
      if (session) readQuery.session(session);
      const current = await readQuery;

      if (!current) throw new AppError(`Product ${item.productId} not found`, 404);

      const branchInv   = current.inventory?.find(i => String(i.branchId) === String(branchId));
      const currentQty  = branchInv?.quantity ?? 0;
      const currentCost = current.purchasePrice ?? 0;

      if (currentQty <= 0 || currentCost <= 0) {
        // No existing stock → incoming price becomes the catalog cost
        newCostPrice = incomingCost;
      } else {
        // WAC: blend existing stock value with new purchase value
        newCostPrice = parseFloat(
          ((currentQty * currentCost + qty * incomingCost) / (currentQty + qty)).toFixed(2)
        );
      }
    }

    const updateOp = {
      $inc: { 'inventory.$.quantity': qty },
      ...(newCostPrice !== null ? { $set: { purchasePrice: newCostPrice } } : {}),
    };

    // Try updating existing branch row
    const updated = await Product.findOneAndUpdate(
      { _id: item.productId, organizationId, 'inventory.branchId': branchId },
      updateOp,
      opts
    );

    if (updated) return; // happy path

    // ── Fallback: branch not yet stocked → push new inventory entry ──────
    const pushOp = {
      $push: { inventory: { branchId, quantity: qty, reorderLevel: 10 } },
      ...(newCostPrice !== null ? { $set: { purchasePrice: newCostPrice } } : {}),
    };

    const pushed = await Product.findOneAndUpdate(
      { _id: item.productId, organizationId },
      pushOp,
      opts
    );

    if (!pushed) {
      throw new AppError(`Product ${item.productId} not found`, 404);
    }
  }

  static async _aggregateMovement(modelName, { orgId, brId, prodId, startDate }, dateField, qtyField) {
    const Model = require('mongoose').model(modelName);
    const statusFilter = modelName === 'Purchase' ? 'received' : { $ne: 'cancelled' };

    return Model.aggregate([
      {
        $match: {
          organizationId: orgId,
          branchId:       brId,
          status:         statusFilter,
          [dateField]:    { $gte: startDate },
        },
      },
      { $unwind: `$items` },
      { $match: { 'items.productId': prodId } },
      { $group: { _id: null, total: { $sum: `$${qtyField}` }, count: { $sum: 1 } } },
    ]);
  }

  static _toObjectId(id) {
    const { Types } = require('mongoose');
    return new Types.ObjectId(id);
  }
}

module.exports = StockService;
