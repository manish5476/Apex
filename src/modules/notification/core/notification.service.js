// src/services/notificationService.js
const Invoice = require("../../accounting/billing/invoice.model");
const Product = require("../../inventory/core/product.model");
const Customer = require("../../organization/core/customer.model");
const Notification = require("./notification.model");
const EMI = require("../../accounting/payments/emi.model");
const sendEmail = require("../../../core/infra/email");
const inventoryAlertService = require("../../inventory/core/inventoryAlert.service");

// exports.createNotification = async (organizationId, recipientId, type, title, message, io = null) => {
//   const notification = await Notification.create({
//     organizationId, recipientId, type, title, message,
//   });
//   if (io) {
//     io.to(recipientId.toString()).emit("newNotification", notification);
//   }
//   return notification;
// };
// Update your existing createNotification function
exports.createNotification = async (organizationId, recipientId, type, title, message, metadata = {}, io = null) => {
  const notification = await Notification.create({
    organizationId,
    recipientId,
    type,
    title,
    message,
    metadata, // ✅ Add metadata support
    priority: this.determinePriorityFromType(type), // ✅ Add priority
    createdAt: new Date()
  });

  if (io) {
    io.to(recipientId.toString()).emit("newNotification", notification);
  }

  // Also use socket utils if available
  try {
    const { emitToUser } = require("../../../socketHandlers/socket");
    emitToUser(recipientId.toString(), "newNotification", notification);
  } catch (err) {
    console.log("Socket utils not available");
  }

  return notification;
};

// Helper function
exports.determinePriorityFromType = (type) => {
  const priorityMap = {
    'urgent': 'critical',
    'error': 'high',
    'warning': 'high',
    'success': 'normal',
    'info': 'low'
  };
  return priorityMap[type] || 'normal';
};
/**
 * Send overdue invoice emails to organizations
 */
exports.sendOverdueInvoiceAlerts = async () => {
  const today = new Date();
  const overdue = await Invoice.find({
    organizationId: { $exists: true },
    status: { $in: ["unpaid", "partial", "partially paid"] },
    dueDate: { $lt: today },
  })
    .populate("organizationId", "name primaryEmail")
    .populate("customerId", "name email");

  if (!overdue.length) return console.log("[Notify] No overdue invoices");

  const grouped = {};
  for (const inv of overdue) {
    const orgId = inv.organizationId?._id?.toString();
    if (!grouped[orgId])
      grouped[orgId] = { org: inv.organizationId, invoices: [] };
    grouped[orgId].invoices.push(inv);
  }

  for (const orgId in grouped) {
    const { org, invoices } = grouped[orgId];
    const rows = invoices
      .map(
        (i) =>
          `<li>Invoice ${i.invoiceNumber} — ${i.grandTotal} — Due ${i.dueDate.toDateString()}</li>`,
      )
      .join("");
    const html = `<p>Hi ${org.name || "Admin"},</p>
      <p>The following invoices are overdue:</p><ul>${rows}</ul>
      <p>Please review in the dashboard.</p>`;
    if (org.primaryEmail) {
      await sendEmail({
        email: org.primaryEmail,
        subject: `Overdue invoices for ${org.name}`,
        html,
      });
      console.log(`[Notify] overdue invoices sent to ${org.primaryEmail}`);
    }
  }
};

/**
 * Send low stock alerts
 */
exports.sendLowStockAlerts = async (threshold = 10) => {
  // Find organizations that have low stock products
  const prods = await Product.aggregate([
    { $unwind: "$inventory" },
    {
      $group: {
        _id: { org: "$organizationId", prod: "$_id" },
        name: { $first: "$name" },
        sku: { $first: "$sku" },
        total: { $sum: "$inventory.quantity" },
      },
    },
    { $match: { total: { $lt: threshold } } },
    {
      $group: {
        _id: "$_id.org",
        items: { $push: { name: "$name", sku: "$sku", total: "$total" } },
      },
    },
  ]);

  if (!prods.length) return console.log("[Notify] No low-stock found");

  for (const g of prods) {
    const orgId = g._id;
    const org = await require("../../organization/core/organization.model")
      .findById(orgId)
      .select("name primaryEmail");
    if (!org || !org.primaryEmail) continue;
    const list = g.items
      .map((i) => `<li>${i.name} (SKU:${i.sku}) — ${i.total}</li>`)
      .join("");
    const html = `<p>Hi ${org.name},</p><p>Low stock items:</p><ul>${list}</ul>`;
    await sendEmail({
      email: org.primaryEmail,
      subject: `Low stock items for ${org.name}`,
      html,
    });
    console.log(`[Notify] low stock email sent to ${org.primaryEmail}`);
  }
};

/**
 * Send EMI overdue alerts to organization + customers
 */
exports.sendEmiOverdueAlerts = async () => {
  const today = new Date();
  const emis = await EMI.find({
    status: "active",
    "installments.dueDate": { $lt: today },
    "installments.paymentStatus": { $in: ["pending", "partial"] },
  }).populate("organizationId customerId invoiceId");

  if (!emis.length) return console.log("[Notify] No EMI overdue");

  for (const emi of emis) {
    const org = emi.organizationId;
    const customer = emi.customerId;
    // collect overdue installments for this EMI
    const overdueInst = emi.installments.filter(
      (i) =>
        i.dueDate < today && ["pending", "partial"].includes(i.paymentStatus),
    );
    if (!overdueInst.length) continue;

    const instHtml = overdueInst
      .map(
        (i) =>
          `<li>Inst#${i.installmentNumber} — Due ${i.dueDate.toDateString()} — Amount ${i.totalAmount}</li>`,
      )
      .join("");
    // Notify org admin
    if (org?.primaryEmail) {
      const html = `<p>EMI overdue for Invoice ${emi.invoiceId?.invoiceNumber || emi.invoiceId}:</p><ul>${instHtml}</ul>`;
      await sendEmail({
        email: org.primaryEmail,
        subject: `EMI overdue for ${org.name}`,
        html,
      });
      console.log(`[Notify] EMI overdue sent to ${org.primaryEmail}`);
    }
    // Notify customer
    if (customer?.email) {
      const html = `<p>Dear ${customer.name || "Customer"},</p><p>You have overdue EMI installments:</p><ul>${instHtml}</ul>`;
      await sendEmail({
        email: customer.email,
        subject: `Your EMI is overdue`,
        html,
      });
      console.log(`[Notify] EMI overdue sent to customer ${customer.email}`);
    }
  }
};

// ✅ ADD NEW CLASS METHODS
class NotificationService {
  /**
   * Create a system notification (for automated processes)
   * Uses your existing notification model structure
   */
  static async createSystemNotification(organizationId, recipientId, businessType, title, message, metadata = {}) {
    try {
      // Map businessType to your existing type field
      const type = this.mapBusinessTypeToUIType(businessType);

      const notification = await Notification.create({
        organizationId,
        recipientId,
        type, // This is your existing 'type' field
        title,
        message,
        metadata,
        isSystem: true,
        priority: this.determinePriority(businessType)
      });

      // Use socket if available
      emitToUser(recipientId.toString(), "newNotification", notification);

      return notification;
    } catch (err) {
      console.error("Create system notification error:", err);
      return null;
    }
  }

  /**
   * Map business type to UI type
   * Adapts to your existing type system
   */
  static mapBusinessTypeToUIType(businessType) {
    const map = {
      'USER_SIGNUP': 'info',
      'INVOICE_CREATED': 'info',
      'PAYMENT_RECEIVED': 'success',
      'STOCK_ALERT': 'warning',
      'TASK_OVERDUE': 'error',
      'TASK_COMPLETED': 'success',
      'SYSTEM': 'info'
    };
    return map[businessType] || 'info';
  }

  /**
   * Determine priority based on business type
   */
  static determinePriority(businessType) {
    const criticalTypes = ['STOCK_ALERT_CRITICAL', 'PAYMENT_OVERDUE'];
    const highTypes = ['STOCK_ALERT', 'TASK_OVERDUE'];

    if (criticalTypes.includes(businessType)) return 'critical';
    if (highTypes.includes(businessType)) return 'high';
    return 'normal';
  }

  /**
   * Bulk create notifications
   */
  static async bulkCreateNotifications(notificationsData) {
    try {
      const notifications = await Notification.insertMany(notificationsData);

      // Emit socket events for each
      notifications.forEach(notification => {
        emitToUser(notification.recipientId.toString(), "newNotification", notification);
      });

      return notifications;
    } catch (err) {
      console.error("Bulk create notifications error:", err);
      return [];
    }
  }

  /**
   * Get user's unread count
   */
  static async getUnreadCount(userId, organizationId) {
    return await Notification.countDocuments({
      recipientId: userId,
      organizationId,
      isRead: false
    });
  }

  /**
   * Create notification and send email
   */
  static async createNotificationWithEmail(organizationId, recipientId, type, title, message, emailData = null) {
    try {
      // Create notification
      const notification = await exports.createNotification(
        organizationId,
        recipientId,
        type,
        title,
        message
      );

      // Send email if emailData provided
      if (emailData && emailData.email) {
        await sendEmail({
          email: emailData.email,
          subject: emailData.subject || title,
          html: emailData.html || message
        });
      }

      return notification;
    } catch (err) {
      console.error("Create notification with email error:", err);
      return null;
    }
  }
}

// ✅ Export the class as well
exports.NotificationService = NotificationService;