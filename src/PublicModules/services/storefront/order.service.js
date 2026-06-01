'use strict';

/**
 * StorefrontOrderService
 * ─────────────────────────────────────────────
 * Handles storefront cart → order conversion.
 *
 * CRM Integration (via StorefrontCRMBridgeService):
 *   - Every order creation triggers a CRM Invoice + Sales + Stock + Journals.
 *   - If the customer has no phone, crmSyncStatus = 'pending_phone' and
 *     CRM records are created later when phone is provided.
 *   - Order cancellation triggers CRM record reversal.
 *   - Stock deduction is handled atomically by CRMBridge (per branch via StockService).
 *   - Raw product.save() for stock is REMOVED — never bypasses StockService again.
 */

const StorefrontCart     = require('../../models/storefront/storefrontCart.model');
const StorefrontCartItem = require('../../models/storefront/storefrontCartItem.model');
const StorefrontOrder    = require('../../models/storefront/storefrontOrder.model');
const StorefrontCustomer = require('../../models/storefront/storefrontCustomer.model');
const CustomerService    = require('./customer.service');
const CartService        = require('./cart.service');
const CRMBridge          = require('./crmBridge.service');
const AppError           = require('../../../core/utils/api/appError');

class StorefrontOrderService {

  /* ============================================================
   * CREATE FROM CART
   *
   * Converts an active cart into a StorefrontOrder AND immediately
   * creates the corresponding CRM Invoice + Sale + Stock movement.
   *
   * Flow:
   *   1. Validate cart contents (stock, availability)
   *   2. Find or create a StorefrontCustomer
   *   3. Find or create a CRM Customer (requires phone)
   *   4. Create StorefrontOrder document
   *   5. CRMBridge.createOrderCRMRecords() → Invoice + Sales + Stock + Journals
   *   6. Update StorefrontOrder with CRM record IDs and sync status
   *   7. Update StorefrontCustomer stats
   *   8. Mark cart as converted, increment coupon usage
   *
   * ============================================================ */
  async createFromCart(organizationId, identity, payload = {}) {
    // ── Step 1: Validate cart ──────────────────────────────────────
    const validation = await CartService.validateForCheckout(organizationId, identity);
    if (!validation.valid) {
      const err = new AppError('Cart has validation issues', 409);
      err.issues = validation.issues;
      throw err;
    }

    const cart = await StorefrontCart.findOne({
      organizationId,
      status: 'active',
      ...(identity.customerId ? { customerId: identity.customerId } : { sessionId: identity.sessionId })
    }).lean();
    if (!cart) throw new AppError('Cart not found', 404);

    const items = await StorefrontCartItem.find({ cartId: cart._id, organizationId }).lean();
    if (items.length === 0) throw new AppError('Cart is empty', 400);

    // ── Step 2: Resolve or create StorefrontCustomer ───────────────
    let sfCustomerId = identity.customerId;
    let sfCustomer   = null;
    if (!sfCustomerId) {
      sfCustomer   = await CustomerService.getOrCreateGuest(organizationId, identity.sessionId, payload.customer ?? payload.contact ?? {});
      sfCustomerId = sfCustomer._id;
    } else {
      sfCustomer = await StorefrontCustomer.findOne({ _id: sfCustomerId, organizationId }).lean();
    }

    // ── Step 3: Address normalization ──────────────────────────────
    const shippingAddress = this.normalizeAddress(payload.shippingAddress);
    const billingAddress  = this.normalizeAddress(payload.billingAddress ?? payload.shippingAddress);
    if (!shippingAddress || !billingAddress) {
      throw new AppError('Shipping and billing addresses are required', 400);
    }

    // Optionally save address to customer profile
    if (payload.saveAddress && sfCustomerId) {
      await CustomerService.addAddress(organizationId, sfCustomerId, {
        ...shippingAddress,
        isDefault: payload.defaultAddress ?? false
      }).catch(() => {}); // Non-blocking — address save failure shouldn't block order
    }

    // ── Step 4: Build order items ───────────────────────────────────
    // NOTE: Stock deduction is handled by CRMBridge via StockService (NOT here).
    // Raw product.save() for stock reservation has been removed permanently.
    const orderItems = items.map(item => {
      const unitPrice = item.snapshot.discountedPrice ?? item.snapshot.sellingPrice;
      const lineTotal = Number((unitPrice * item.quantity).toFixed(2));
      return {
        productId:      item.productId,
        variantId:      item.variantId,
        branchId:       item.branchId,
        snapshot:       item.snapshot,
        quantity:       item.quantity,
        unitPrice,
        taxAmount:      0,
        discountAmount: 0,
        lineTotal,
      };
    });

    const subtotal    = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const discount    = cart.discountTotals?.total ?? 0;
    const shipping    = cart.shippingTotals?.total ?? 0;
    const tax         = cart.taxTotals?.total ?? 0;
    const grandTotal  = Math.max(0, subtotal - discount + shipping + tax);
    const paymentMethod = String(payload.paymentMethod || payload.payment?.method || 'COD').toUpperCase();
    const fulfilledBy   = payload.fulfilledBy === 'platform' ? 'platform' : 'merchant';

    // ── Step 5: Create StorefrontOrder ─────────────────────────────
    const order = await StorefrontOrder.create({
      organizationId,
      storefrontId:   cart.storefrontId,
      customerId:     sfCustomerId,
      sessionId:      identity.sessionId,
      guestOrder:     !identity.customerId,
      cartId:         cart._id,
      shippingAddress,
      billingAddress,
      items:          orderItems,
      totals: {
        subtotal:   Number(subtotal.toFixed(2)),
        discount,
        shipping,
        tax,
        grandTotal: Number(grandTotal.toFixed(2)),
        currency:   cart.currency,
      },
      totalAmount:    Number(grandTotal.toFixed(2)),
      paymentMethod,
      deliveryFee:    shipping,
      fulfilledBy,
      appliedCoupons: (cart.appliedCoupons ?? []).map(c => c.code),
      crmSyncStatus:  'pending', // will be updated below
    });

    // ── Step 6: CRM Integration ────────────────────────────────────
    // Attempt to find/create CRM Customer and create CRM records.
    // If customer has no phone → crmSyncStatus = 'pending_phone'.
    // Failure here does NOT block the order — it is logged and retried via backfill.
    let crmSyncStatus = 'failed';
    let crmSyncError  = null;
    let crmUpdates    = {};

    try {
      const crmResult = await CRMBridge.ensureCRMCustomer(organizationId, sfCustomer, {
        shippingAddress,
      });

      if (!crmResult) {
        // No phone — cannot create CRM customer yet
        crmSyncStatus = 'pending_phone';
      } else {
        const { crmCustomer } = crmResult;

        // Create Invoice + Sales + Stock + Journals
        const { invoice, sale } = await CRMBridge.createOrderCRMRecords(order, crmCustomer);

        // Sync storefront customer link
        await CRMBridge.syncStorefrontCustomerLink(sfCustomerId, crmCustomer);

        crmSyncStatus = 'synced';
        crmUpdates    = {
          crmInvoiceId:  invoice._id,
          crmSaleId:     sale._id,
          crmCustomerId: crmCustomer._id,
        };
      }
    } catch (crmErr) {
      // CRM sync failure must NOT cancel the order — log and mark for retry
      console.error(
        `[CRMBridge] Failed to sync storefront order ${order.orderNumber} to CRM:`,
        crmErr.message
      );
      crmSyncStatus = 'failed';
      crmSyncError  = crmErr.message?.substring(0, 500) || 'Unknown error';
    }

    // Update order with CRM sync result (non-transactional — order already committed)
    await StorefrontOrder.findByIdAndUpdate(order._id, {
      $set: { crmSyncStatus, crmSyncError: crmSyncError || null, ...crmUpdates }
    });

    // ── Step 7: Post-order side effects ────────────────────────────
    const couponPromises = (cart.appliedCoupons ?? []).map(async (c) => {
      const mongoose = require('mongoose');
      const StorefrontCoupon = mongoose.model('StorefrontCoupon');
      await StorefrontCoupon.updateOne(
        { organizationId, code: c.code },
        { $inc: { usedCount: 1 } }
      );
    });

    await Promise.all([
      ...couponPromises,
      StorefrontCart.updateOne({ _id: cart._id }, { $set: { status: 'converted' } }),
      StorefrontCustomer.updateOne(
        { _id: sfCustomerId, organizationId },
        {
          $set:  { lastOrderAt: new Date(), lastSeenAt: new Date() },
          $inc:  { orderCount: 1, totalSpent: grandTotal }
        }
      ),
    ]);

    return order;
  }

  /* ============================================================
   * CANCEL ORDER
   *
   * Cancels a StorefrontOrder and reverses all CRM records:
   * - Stock restored per branch
   * - Invoice cancelled
   * - Sales record cancelled
   * - Revenue + COGS journals reversed
   * - Customer stats reversed
   * ============================================================ */
  async cancelOrder(organizationId, orderId, actor = null) {
    const order = await StorefrontOrder.findOne({ _id: orderId, organizationId });
    if (!order) throw new AppError('Order not found', 404);
    if (order.orderStatus === 'cancelled') throw new AppError('Order already cancelled', 400);

    const oldStatus = order.orderStatus;

    order.orderStatus = 'cancelled';
    order.timeline.push({
      type:    'order_cancelled',
      message: 'Order cancelled',
      actorId: actor?._id || null,
    });

    // Reverse CRM records if they exist
    if (order.crmInvoiceId) {
      try {
        await CRMBridge.cancelOrderCRMRecords(order, actor);
      } catch (crmErr) {
        console.error(
          `[CRMBridge] Failed to cancel CRM records for order ${order.orderNumber}:`,
          crmErr.message
        );
        order.timeline.push({
          type:    'crm_cancel_failed',
          message: `CRM reversal failed: ${crmErr.message}`,
        });
        order.crmSyncError  = crmErr.message?.substring(0, 500);
        order.crmSyncStatus = 'failed';
      }
    }

    await order.save();

    // Revert customer stats
    await StorefrontCustomer.updateOne(
      { _id: order.customerId, organizationId },
      {
        $inc: { orderCount: -1, totalSpent: -order.totalAmount },
      }
    );

    return order;
  }

  /* ============================================================
   * LIST ORDERS FOR CUSTOMER
   * ============================================================ */
  async listForCustomer(organizationId, customerId) {
    return StorefrontOrder.find({ organizationId, customerId }).sort({ createdAt: -1 }).lean();
  }

  /* ============================================================
   * TRACK ORDER (public endpoint — verify by email or phone)
   * ============================================================ */
  async trackOrder(organizationId, orderNumber, emailOrPhone) {
    const order = await StorefrontOrder.findOne({ organizationId, orderNumber })
      .populate('customerId', 'email phone firstName lastName')
      .populate('deliveryAgent', 'name phone')
      .lean();
    if (!order) throw new AppError('Order not found', 404);
    const email = order.customerId?.email;
    const phone = order.customerId?.phone;
    if (emailOrPhone && emailOrPhone !== email && emailOrPhone !== phone) {
      throw new AppError('Order verification failed', 403);
    }
    return order;
  }

  /* ============================================================
   * PRIVATE: Normalize address from various input shapes
   * ============================================================ */
  normalizeAddress(address) {
    if (!address) return null;
    return {
      fullName:     address.fullName || address.name,
      phone:        address.phone,
      country:      address.country || 'India',
      state:        address.state,
      city:         address.city,
      postalCode:   address.postalCode || address.zipCode,
      addressLine1: address.addressLine1 || address.street,
      addressLine2: address.addressLine2 || '',
      landmark:     address.landmark || '',
    };
  }
}

module.exports = new StorefrontOrderService();
