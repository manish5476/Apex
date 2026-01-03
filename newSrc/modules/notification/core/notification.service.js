// src/services/notificationService.js
const Invoice = require("../models/invoiceModel");
const Product = require("../models/productModel");
const Customer = require("../models/customerModel");
const Notification = require("../models/notificationModel");
const EMI = require("../models/emiModel");
const sendEmail = require("../utils/email");
const inventoryAlertService = require("./inventoryAlertService");

exports.createNotification = async (organizationId, recipientId, type, title, message, io = null) => {
  const notification = await Notification.create({
    organizationId, recipientId, type, title, message,
  });
  if (io) {
    io.to(recipientId.toString()).emit("newNotification", notification);
  }
  return notification;
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
    const org = await require("../models/organizationModel")
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
