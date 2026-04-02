'use strict';

const mongoose = require('mongoose');

const Notification = require('./notification.model');
const Invoice      = require('../../accounting/billing/invoice.model');
const Product      = require('../../inventory/core/model/product.model');
const Organization = require('../../organization/core/organization.model'); // top-level import
const Customer     = require('../../organization/core/customer.model');
const EMI          = require('../../accounting/payments/emi.model');
const sendEmail    = require('../../../core/infra/email');
const logger       = require('../../../bootstrap/logger');
const { emitToUser } = require('../../../socketHandlers/socket');

const { BUSINESS_TYPE_UI_MAP } = require('./notification.model');

// ── Priority map ──────────────────────────────────────────────────────────────
const BUSINESS_TYPE_PRIORITY = {
  STOCK_ALERT_CRITICAL: 'critical',
  PAYMENT_OVERDUE:      'critical',
  TASK_OVERDUE:         'high',
  STOCK_ALERT:          'high',
  PAYMENT_RECEIVED:     'normal',
  INVOICE_CREATED:      'normal',
  TASK_COMPLETED:       'normal',
  TASK:                 'normal',
  USER_SIGNUP:          'low',
  SYSTEM:               'low',
};

class NotificationService {

  // ============================================================
  //  CORE — single unified creation method
  // ============================================================

  /**
   * Create a notification and emit it via socket.
   *
   * @param {Object} params
   * @param {ObjectId|string} params.organizationId
   * @param {ObjectId|string} params.recipientId
   * @param {string}          params.businessType   — must be a key in BUSINESS_TYPE_UI_MAP
   * @param {string}          params.title
   * @param {string}          params.message
   * @param {Object}          [params.metadata]     — navigation context { invoiceId, userId, ... }
   * @param {ObjectId|string} [params.createdBy]    — actor who triggered the event
   * @param {boolean}         [params.isSystem]
   */
  static async create({
    organizationId,
    recipientId,
    businessType,
    title,
    message,
    metadata   = {},
    createdBy  = null,
    isSystem   = false,
  }) {
    try {
      const priority = BUSINESS_TYPE_PRIORITY[businessType] || 'normal';

      const notification = await Notification.create({
        organizationId,
        recipientId,
        businessType,
        title,
        message,
        metadata,
        priority,
        isSystem,
        createdBy,
      });

      // Non-blocking socket emit
      if (emitToUser) {
        emitToUser(String(recipientId), 'newNotification', notification.toObject());
      }

      return notification;
    } catch (err) {
      logger.error('NotificationService.create failed:', err.message);
      return null; // never throw — notifications are non-critical
    }
  }

  /**
   * Create notifications for multiple recipients at once.
   * All recipients get the same title/message/businessType.
   *
   * @param {Object}   shared         — fields common to all notifications
   * @param {string[]} recipientIds   — array of user IDs
   */
  static async createBulk(shared, recipientIds) {
    if (!recipientIds?.length) return [];

    const priority = BUSINESS_TYPE_PRIORITY[shared.businessType] || 'normal';

    const docs = recipientIds.map(recipientId => ({
      ...shared,
      recipientId,
      priority,
    }));

    try {
      const notifications = await Notification.insertMany(docs, { ordered: false });

      if (emitToUser) {
        notifications.forEach(n =>
          emitToUser(String(n.recipientId), 'newNotification', n.toObject())
        );
      }

      return notifications;
    } catch (err) {
      logger.error('NotificationService.createBulk failed:', err.message);
      return [];
    }
  }

  /**
   * Get unread count for a user.
   */
  static async getUnreadCount(userId, organizationId) {
    return Notification.countDocuments({ recipientId: userId, organizationId, isRead: false });
  }

  // ============================================================
  //  AUTOMATED ALERTS
  // ============================================================

  /**
   * Email org owners about overdue invoices.
   * Called by a scheduled job (e.g. daily cron).
   */
  static async sendOverdueInvoiceAlerts() {
    const today    = new Date();
    const overdue  = await Invoice.find({
      status:  { $in: ['unpaid', 'partial', 'partially paid'] },
      dueDate: { $lt: today },
    }).populate('organizationId', 'name primaryEmail');

    if (!overdue.length) {
      logger.info('[Notify] No overdue invoices found');
      return;
    }

    // Group by org
    const grouped = overdue.reduce((acc, inv) => {
      const orgId = inv.organizationId?._id?.toString();
      if (!orgId) return acc;
      (acc[orgId] ??= { org: inv.organizationId, invoices: [] }).invoices.push(inv);
      return acc;
    }, {});

    const promises = Object.values(grouped)
      .filter(({ org }) => org?.primaryEmail)
      .map(({ org, invoices }) => {
        const rows = invoices
          .map(i => `<li>Invoice ${i.invoiceNumber} — ₹${i.grandTotal} — Due ${i.dueDate.toDateString()}</li>`)
          .join('');
        return sendEmail({
          email:   org.primaryEmail,
          subject: `Overdue invoices for ${org.name}`,
          html:    `<p>Hi ${org.name},</p><p>The following invoices are overdue:</p><ul>${rows}</ul>`,
        });
      });

    const results = await Promise.allSettled(promises);
    const failed  = results.filter(r => r.status === 'rejected').length;
    logger.info(`[Notify] Overdue invoice emails: ${promises.length} sent, ${failed} failed`);
  }

  /**
   * Email org owners about low-stock products.
   */
  static async sendLowStockAlerts(threshold = 10) {
    const groups = await Product.aggregate([
      { $unwind: '$inventory' },
      { $group: {
        _id:   { org: '$organizationId', prod: '$_id' },
        name:  { $first: '$name' },
        sku:   { $first: '$sku' },
        total: { $sum: '$inventory.quantity' },
      }},
      { $match: { total: { $lt: threshold } } },
      { $group: {
        _id:   '$_id.org',
        items: { $push: { name: '$name', sku: '$sku', total: '$total' } },
      }},
    ]);

    if (!groups.length) {
      logger.info('[Notify] No low-stock products found');
      return;
    }

    const orgIds = groups.map(g => g._id);
    const orgs   = await Organization.find({ _id: { $in: orgIds } })
      .select('name primaryEmail')
      .lean();

    const orgMap = orgs.reduce((acc, o) => { acc[String(o._id)] = o; return acc; }, {});

    const promises = groups
      .map(g => {
        const org = orgMap[String(g._id)];
        if (!org?.primaryEmail) return null;
        const list = g.items.map(i => `<li>${i.name} (SKU: ${i.sku}) — ${i.total} remaining</li>`).join('');
        return sendEmail({
          email:   org.primaryEmail,
          subject: `Low stock alert for ${org.name}`,
          html:    `<p>Hi ${org.name},</p><p>The following items are running low:</p><ul>${list}</ul>`,
        });
      })
      .filter(Boolean);

    const results = await Promise.allSettled(promises);
    const failed  = results.filter(r => r.status === 'rejected').length;
    logger.info(`[Notify] Low stock emails: ${promises.length} sent, ${failed} failed`);
  }

  /**
   * Email org owners and customers about overdue EMI installments.
   */
  static async sendEmiOverdueAlerts() {
    const today = new Date();
    const emis  = await EMI.find({
      status:                        'active',
      'installments.dueDate':        { $lt: today },
      'installments.paymentStatus':  { $in: ['pending', 'partial'] },
    }).populate('organizationId customerId invoiceId');

    if (!emis.length) {
      logger.info('[Notify] No overdue EMIs found');
      return;
    }

    const promises = [];

    for (const emi of emis) {
      const { organizationId: org, customerId: customer } = emi;

      const overdueInst = emi.installments.filter(
        i => i.dueDate < today && ['pending', 'partial'].includes(i.paymentStatus)
      );
      if (!overdueInst.length) continue;

      const instHtml = overdueInst
        .map(i => `<li>Installment #${i.installmentNumber} — Due ${i.dueDate.toDateString()} — ₹${i.totalAmount}</li>`)
        .join('');

      if (org?.primaryEmail) {
        promises.push(sendEmail({
          email:   org.primaryEmail,
          subject: `EMI overdue alert for ${org.name}`,
          html:    `<p>EMI overdue for Invoice ${emi.invoiceId?.invoiceNumber || emi.invoiceId}:</p><ul>${instHtml}</ul>`,
        }));
      }

      if (customer?.email) {
        promises.push(sendEmail({
          email:   customer.email,
          subject: 'Your EMI payment is overdue',
          html:    `<p>Dear ${customer.name || 'Customer'},</p><p>You have overdue EMI installments:</p><ul>${instHtml}</ul>`,
        }));
      }
    }

    const results = await Promise.allSettled(promises);
    const failed  = results.filter(r => r.status === 'rejected').length;
    logger.info(`[Notify] EMI overdue emails: ${promises.length} sent, ${failed} failed`);
  }
}

module.exports = NotificationService;























// // src/services/notificationService.js
// const Invoice = require("../../accounting/billing/invoice.model");
// const Product = require("../../inventory/core/model/product.model");
// const Customer = require("../../organization/core/customer.model");
// const Notification = require("./notification.model");
// const EMI = require("../../accounting/payments/emi.model");
// const sendEmail = require("../../../core/infra/email");
// const inventoryAlertService = require("../../inventory/core/service/inventoryAlert.service");
// const { emitToUser } = require("../../../socketHandlers/socket");

// class NotificationService {
  
//   // ==========================================================================
//   // CORE NOTIFICATION LOGIC
//   // ==========================================================================

//   static async createNotification(organizationId, recipientId, type, title, message, metadata = {}) {
//     try {
//       const notification = await Notification.create({
//         organizationId,
//         recipientId,
//         type,
//         title,
//         message,
//         metadata,
//         priority: this.determinePriorityFromType(type),
//         createdAt: new Date()
//       });

//       // Safely emit to socket
//       if (emitToUser) {
//         emitToUser(recipientId.toString(), "newNotification", notification);
//       }

//       return notification;
//     } catch (err) {
//       console.error("Create notification error:", err);
//       return null;
//     }
//   }

//   static async createSystemNotification(organizationId, recipientId, businessType, title, message, metadata = {}) {
//     const type = this.mapBusinessTypeToUIType(businessType);
//     const priority = this.determinePriority(businessType);

//     try {
//       const notification = await Notification.create({
//         organizationId,
//         recipientId,
//         type,
//         title,
//         message,
//         metadata,
//         isSystem: true,
//         priority
//       });

//       if (emitToUser) {
//         emitToUser(recipientId.toString(), "newNotification", notification);
//       }

//       return notification;
//     } catch (err) {
//       console.error("Create system notification error:", err);
//       return null;
//     }
//   }

//   static async bulkCreateNotifications(notificationsData) {
//     try {
//       const notifications = await Notification.insertMany(notificationsData);
      
//       if (emitToUser) {
//         notifications.forEach(notification => {
//           emitToUser(notification.recipientId.toString(), "newNotification", notification);
//         });
//       }
//       return notifications;
//     } catch (err) {
//       console.error("Bulk create notifications error:", err);
//       return [];
//     }
//   }

//   static async getUnreadCount(userId, organizationId) {
//     return await Notification.countDocuments({
//       recipientId: userId,
//       organizationId,
//       isRead: false
//     });
//   }

//   // ==========================================================================
//   // ASYNC AUTOMATED ALERTS (Optimized with Promise.allSettled)
//   // ==========================================================================

//   static async sendOverdueInvoiceAlerts() {
//     const today = new Date();
//     const overdue = await Invoice.find({
//       organizationId: { $exists: true },
//       status: { $in: ["unpaid", "partial", "partially paid"] },
//       dueDate: { $lt: today },
//     }).populate("organizationId", "name primaryEmail");

//     if (!overdue.length) return console.log("[Notify] No overdue invoices");

//     const grouped = overdue.reduce((acc, inv) => {
//       const orgId = inv.organizationId?._id?.toString();
//       if (!acc[orgId]) acc[orgId] = { org: inv.organizationId, invoices: [] };
//       acc[orgId].invoices.push(inv);
//       return acc;
//     }, {});

//     const emailPromises = []; // ✅ Collect promises to prevent blocking

//     for (const orgId in grouped) {
//       const { org, invoices } = grouped[orgId];
//       if (!org.primaryEmail) continue;

//       const rows = invoices.map(i => `<li>Invoice ${i.invoiceNumber} — ${i.grandTotal} — Due ${i.dueDate.toDateString()}</li>`).join("");
//       const html = `<p>Hi ${org.name || "Admin"},</p><p>The following invoices are overdue:</p><ul>${rows}</ul><p>Please review in the dashboard.</p>`;

//       emailPromises.push(
//         sendEmail({ email: org.primaryEmail, subject: `Overdue invoices for ${org.name}`, html })
//       );
//     }

//     // ✅ Process all emails concurrently
//     await Promise.allSettled(emailPromises);
//     console.log(`[Notify] Processed ${emailPromises.length} overdue invoice emails`);
//   }

//   static async sendLowStockAlerts(threshold = 10) {
//     const prods = await Product.aggregate([
//       { $unwind: "$inventory" },
//       { $group: {
//           _id: { org: "$organizationId", prod: "$_id" },
//           name: { $first: "$name" },
//           sku: { $first: "$sku" },
//           total: { $sum: "$inventory.quantity" },
//       }},
//       { $match: { total: { $lt: threshold } } },
//       { $group: {
//           _id: "$_id.org",
//           items: { $push: { name: "$name", sku: "$sku", total: "$total" } },
//       }},
//     ]);

//     if (!prods.length) return console.log("[Notify] No low-stock found");

//     const emailPromises = [];

//     for (const g of prods) {
//       const org = await require("../../organization/core/organization.model").findById(g._id).select("name primaryEmail").lean();
//       if (!org || !org.primaryEmail) continue;

//       const list = g.items.map((i) => `<li>${i.name} (SKU:${i.sku}) — ${i.total}</li>`).join("");
//       const html = `<p>Hi ${org.name},</p><p>Low stock items:</p><ul>${list}</ul>`;
      
//       emailPromises.push(sendEmail({ email: org.primaryEmail, subject: `Low stock items for ${org.name}`, html }));
//     }

//     await Promise.allSettled(emailPromises);
//     console.log(`[Notify] Processed ${emailPromises.length} low stock emails`);
//   }

//   static async sendEmiOverdueAlerts() {
//     const today = new Date();
//     const emis = await EMI.find({
//       status: "active",
//       "installments.dueDate": { $lt: today },
//       "installments.paymentStatus": { $in: ["pending", "partial"] },
//     }).populate("organizationId customerId invoiceId");

//     if (!emis.length) return console.log("[Notify] No EMI overdue");

//     const emailPromises = [];

//     for (const emi of emis) {
//       const { organizationId: org, customerId: customer } = emi;
//       const overdueInst = emi.installments.filter(i => i.dueDate < today && ["pending", "partial"].includes(i.paymentStatus));
//       if (!overdueInst.length) continue;

//       const instHtml = overdueInst.map(i => `<li>Inst#${i.installmentNumber} — Due ${i.dueDate.toDateString()} — Amount ${i.totalAmount}</li>`).join("");

//       if (org?.primaryEmail) {
//         emailPromises.push(sendEmail({
//           email: org.primaryEmail,
//           subject: `EMI overdue for ${org.name}`,
//           html: `<p>EMI overdue for Invoice ${emi.invoiceId?.invoiceNumber || emi.invoiceId}:</p><ul>${instHtml}</ul>`
//         }));
//       }
//       if (customer?.email) {
//         emailPromises.push(sendEmail({
//           email: customer.email,
//           subject: `Your EMI is overdue`,
//           html: `<p>Dear ${customer.name || "Customer"},</p><p>You have overdue EMI installments:</p><ul>${instHtml}</ul>`
//         }));
//       }
//     }

//     await Promise.allSettled(emailPromises);
//     console.log(`[Notify] Processed ${emailPromises.length} EMI overdue emails`);
//   }

//   // ==========================================================================
//   // UTILITIES
//   // ==========================================================================

//   static determinePriorityFromType(type) {
//     const priorityMap = { 'urgent': 'critical', 'error': 'high', 'warning': 'high', 'success': 'normal', 'info': 'low' };
//     return priorityMap[type] || 'normal';
//   }

//   static mapBusinessTypeToUIType(businessType) {
//     const map = { 'USER_SIGNUP': 'info', 'INVOICE_CREATED': 'info', 'PAYMENT_RECEIVED': 'success', 'STOCK_ALERT': 'warning', 'TASK_OVERDUE': 'error', 'TASK_COMPLETED': 'success', 'SYSTEM': 'info' };
//     return map[businessType] || 'info';
//   }

//   static determinePriority(businessType) {
//     const criticalTypes = ['STOCK_ALERT_CRITICAL', 'PAYMENT_OVERDUE'];
//     if (criticalTypes.includes(businessType)) return 'critical';
//     if (['STOCK_ALERT', 'TASK_OVERDUE'].includes(businessType)) return 'high';
//     return 'normal';
//   }
// }

// module.exports = NotificationService;






// // // src/services/notificationService.js
// // const Invoice = require("../../accounting/billing/invoice.model");
// // const Product = require("../../inventory/core/product.model");
// // const Customer = require("../../organization/core/customer.model");
// // const Notification = require("./notification.model");
// // const EMI = require("../../accounting/payments/emi.model");
// // const sendEmail = require("../../../core/infra/email");
// // const inventoryAlertService = require("../../inventory/core/inventoryAlert.service");

// // exports.createNotification = async (organizationId, recipientId, type, title, message, metadata = {}, io = null) => {
// //   const notification = await Notification.create({
// //     organizationId,
// //     recipientId,
// //     type,
// //     title,
// //     message,
// //     metadata, // ✅ Add metadata support
// //     priority: this.determinePriorityFromType(type), // ✅ Add priority
// //     createdAt: new Date()
// //   });

// //   try {
// //     const { emitToUser } = require("../../../socketHandlers/socket");
// //     emitToUser(recipientId.toString(), "newNotification", notification);
// //   } catch (err) {
// //     console.log("Socket utils not available");
// //   }

// //   return notification;
// // };

// // // Helper function
// // exports.determinePriorityFromType = (type) => {
// //   const priorityMap = {
// //     'urgent': 'critical',
// //     'error': 'high',
// //     'warning': 'high',
// //     'success': 'normal',
// //     'info': 'low'
// //   };
// //   return priorityMap[type] || 'normal';
// // };
// // /**
// //  * Send overdue invoice emails to organizations
// //  */
// // exports.sendOverdueInvoiceAlerts = async () => {
// //   const today = new Date();
// //   const overdue = await Invoice.find({
// //     organizationId: { $exists: true },
// //     status: { $in: ["unpaid", "partial", "partially paid"] },
// //     dueDate: { $lt: today },
// //   })
// //     .populate("organizationId", "name primaryEmail")
// //     .populate("customerId", "name email");

// //   if (!overdue.length) return console.log("[Notify] No overdue invoices");

// //   const grouped = {};
// //   for (const inv of overdue) {
// //     const orgId = inv.organizationId?._id?.toString();
// //     if (!grouped[orgId])
// //       grouped[orgId] = { org: inv.organizationId, invoices: [] };
// //     grouped[orgId].invoices.push(inv);
// //   }

// //   for (const orgId in grouped) {
// //     const { org, invoices } = grouped[orgId];
// //     const rows = invoices
// //       .map(
// //         (i) =>
// //           `<li>Invoice ${i.invoiceNumber} — ${i.grandTotal} — Due ${i.dueDate.toDateString()}</li>`,
// //       )
// //       .join("");
// //     const html = `<p>Hi ${org.name || "Admin"},</p>
// //       <p>The following invoices are overdue:</p><ul>${rows}</ul>
// //       <p>Please review in the dashboard.</p>`;
// //     if (org.primaryEmail) {
// //       await sendEmail({
// //         email: org.primaryEmail,
// //         subject: `Overdue invoices for ${org.name}`,
// //         html,
// //       });
// //       console.log(`[Notify] overdue invoices sent to ${org.primaryEmail}`);
// //     }
// //   }
// // };

// // /**
// //  * Send low stock alerts
// //  */
// // exports.sendLowStockAlerts = async (threshold = 10) => {
// //   // Find organizations that have low stock products
// //   const prods = await Product.aggregate([
// //     { $unwind: "$inventory" },
// //     {
// //       $group: {
// //         _id: { org: "$organizationId", prod: "$_id" },
// //         name: { $first: "$name" },
// //         sku: { $first: "$sku" },
// //         total: { $sum: "$inventory.quantity" },
// //       },
// //     },
// //     { $match: { total: { $lt: threshold } } },
// //     {
// //       $group: {
// //         _id: "$_id.org",
// //         items: { $push: { name: "$name", sku: "$sku", total: "$total" } },
// //       },
// //     },
// //   ]);

// //   if (!prods.length) return console.log("[Notify] No low-stock found");

// //   for (const g of prods) {
// //     const orgId = g._id;
// //     const org = await require("../../organization/core/organization.model")
// //       .findById(orgId)
// //       .select("name primaryEmail");
// //     if (!org || !org.primaryEmail) continue;
// //     const list = g.items
// //       .map((i) => `<li>${i.name} (SKU:${i.sku}) — ${i.total}</li>`)
// //       .join("");
// //     const html = `<p>Hi ${org.name},</p><p>Low stock items:</p><ul>${list}</ul>`;
// //     await sendEmail({
// //       email: org.primaryEmail,
// //       subject: `Low stock items for ${org.name}`,
// //       html,
// //     });
// //     console.log(`[Notify] low stock email sent to ${org.primaryEmail}`);
// //   }
// // };

// // /**
// //  * Send EMI overdue alerts to organization + customers
// //  */
// // exports.sendEmiOverdueAlerts = async () => {
// //   const today = new Date();
// //   const emis = await EMI.find({
// //     status: "active",
// //     "installments.dueDate": { $lt: today },
// //     "installments.paymentStatus": { $in: ["pending", "partial"] },
// //   }).populate("organizationId customerId invoiceId");

// //   if (!emis.length) return console.log("[Notify] No EMI overdue");

// //   for (const emi of emis) {
// //     const org = emi.organizationId;
// //     const customer = emi.customerId;
// //     // collect overdue installments for this EMI
// //     const overdueInst = emi.installments.filter(
// //       (i) =>
// //         i.dueDate < today && ["pending", "partial"].includes(i.paymentStatus),
// //     );
// //     if (!overdueInst.length) continue;

// //     const instHtml = overdueInst
// //       .map(
// //         (i) =>
// //           `<li>Inst#${i.installmentNumber} — Due ${i.dueDate.toDateString()} — Amount ${i.totalAmount}</li>`,
// //       )
// //       .join("");
// //     // Notify org admin
// //     if (org?.primaryEmail) {
// //       const html = `<p>EMI overdue for Invoice ${emi.invoiceId?.invoiceNumber || emi.invoiceId}:</p><ul>${instHtml}</ul>`;
// //       await sendEmail({
// //         email: org.primaryEmail,
// //         subject: `EMI overdue for ${org.name}`,
// //         html,
// //       });
// //       console.log(`[Notify] EMI overdue sent to ${org.primaryEmail}`);
// //     }
// //     // Notify customer
// //     if (customer?.email) {
// //       const html = `<p>Dear ${customer.name || "Customer"},</p><p>You have overdue EMI installments:</p><ul>${instHtml}</ul>`;
// //       await sendEmail({
// //         email: customer.email,
// //         subject: `Your EMI is overdue`,
// //         html,
// //       });
// //       console.log(`[Notify] EMI overdue sent to customer ${customer.email}`);
// //     }
// //   }
// // };

// // // ✅ ADD NEW CLASS METHODS
// // class NotificationService {
// //   /**
// //    * Create a system notification (for automated processes)
// //    * Uses your existing notification model structure
// //    */
// //   static async createSystemNotification(organizationId, recipientId, businessType, title, message, metadata = {}) {
// //     try {
// //       // Map businessType to your existing type field
// //       const type = this.mapBusinessTypeToUIType(businessType);

// //       const notification = await Notification.create({
// //         organizationId,
// //         recipientId,
// //         type, // This is your existing 'type' field
// //         title,
// //         message,
// //         metadata,
// //         isSystem: true,
// //         priority: this.determinePriority(businessType)
// //       });

// //       // Use socket if available
// //       emitToUser(recipientId.toString(), "newNotification", notification);

// //       return notification;
// //     } catch (err) {
// //       console.error("Create system notification error:", err);
// //       return null;
// //     }
// //   }

// //   /**
// //    * Map business type to UI type
// //    * Adapts to your existing type system
// //    */
// //   static mapBusinessTypeToUIType(businessType) {
// //     const map = {
// //       'USER_SIGNUP': 'info',
// //       'INVOICE_CREATED': 'info',
// //       'PAYMENT_RECEIVED': 'success',
// //       'STOCK_ALERT': 'warning',
// //       'TASK_OVERDUE': 'error',
// //       'TASK_COMPLETED': 'success',
// //       'SYSTEM': 'info'
// //     };
// //     return map[businessType] || 'info';
// //   }

// //   /**
// //    * Determine priority based on business type
// //    */
// //   static determinePriority(businessType) {
// //     const criticalTypes = ['STOCK_ALERT_CRITICAL', 'PAYMENT_OVERDUE'];
// //     const highTypes = ['STOCK_ALERT', 'TASK_OVERDUE'];

// //     if (criticalTypes.includes(businessType)) return 'critical';
// //     if (highTypes.includes(businessType)) return 'high';
// //     return 'normal';
// //   }

// //   /**
// //    * Bulk create notifications
// //    */
// //   static async bulkCreateNotifications(notificationsData) {
// //     try {
// //       const notifications = await Notification.insertMany(notificationsData);

// //       // Emit socket events for each
// //       notifications.forEach(notification => {
// //         emitToUser(notification.recipientId.toString(), "newNotification", notification);
// //       });

// //       return notifications;
// //     } catch (err) {
// //       console.error("Bulk create notifications error:", err);
// //       return [];
// //     }
// //   }

// //   /**
// //    * Get user's unread count
// //    */
// //   static async getUnreadCount(userId, organizationId) {
// //     return await Notification.countDocuments({
// //       recipientId: userId,
// //       organizationId,
// //       isRead: false
// //     });
// //   }

// //   /**
// //    * Create notification and send email
// //    */
// //   static async createNotificationWithEmail(organizationId, recipientId, type, title, message, emailData = null) {
// //     try {
// //       // Create notification
// //       const notification = await exports.createNotification(
// //         organizationId,
// //         recipientId,
// //         type,
// //         title,
// //         message
// //       );

// //       // Send email if emailData provided
// //       if (emailData && emailData.email) {
// //         await sendEmail({
// //           email: emailData.email,
// //           subject: emailData.subject || title,
// //           html: emailData.html || message
// //         });
// //       }

// //       return notification;
// //     } catch (err) {
// //       console.error("Create notification with email error:", err);
// //       return null;
// //     }
// //   }
// // }

// // // ✅ Export the class as well
// // exports.NotificationService = NotificationService;