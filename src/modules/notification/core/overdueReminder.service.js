// src/services/overdueReminderService.js
const cron = require("node-cron");
const Invoice = require("../../accounting/billing/invoice.model");
const invoicePDFService = require("../../accounting/billing/invoicePDFService");
const sendEmail = require("../../../core/infra/email");
const mongoose = require("mongoose");

/**
 * Send a single overdue reminder for an invoice.
 * Marks invoice.overdueNoticeSent = true and increments overdueCount.
 * Does NOT block if PDF/email fails — logs and continues.
 */
async function sendOverdueReminder(invoice) {
  try {
    const customer = invoice.customerId;
    const organization = invoice.organizationId;

    if (!customer || !customer.email) {
      console.warn(
        `Skipping overdue reminder: no email for customer on invoice ${invoice._id}`,
      );
      return false;
    }

    // Generate PDF buffer (re-uses invoicePDFService)
    const pdfBuffer = await invoicePDFService.generateInvoicePDF(
      invoice._id,
      organization._id,
    );

    // Build simple branded HTML. Move to template file if you prefer.
    const html = `
      <div style="font-family: Arial, sans-serif; color:#333;">
        <h2 style="color:${organization.themePrimary || "#b91c1c"}">Payment Overdue Notice</h2>
        <p>Dear ${customer.name || customer.fullname || "Customer"},</p>
        <p>Your invoice <strong>#${invoice.invoiceNumber}</strong> for <strong>₹${(invoice.grandTotal || invoice.totalAmount).toLocaleString("en-IN")}</strong> was due on <strong>${new Date(invoice.dueDate).toLocaleDateString("en-IN")}</strong> and is now <strong style="color:#b91c1c">overdue</strong>.</p>
        <p>Please arrange payment as soon as possible to avoid further action or fees.</p>
        <p>If you have already paid, please ignore this message or reply with the transaction details.</p>
        <p>Thanks,<br/><strong>${organization.name}</strong></p>
      </div>
    `;

    await sendEmail({
      email: customer.email,
      subject: `Overdue: Invoice #${invoice.invoiceNumber} — Payment required`,
      html,
      attachments: [
        {
          filename: `Invoice_${invoice.invoiceNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    // Mark as sent and increment counter
    invoice.overdueNoticeSent = true;
    invoice.overdueCount = (invoice.overdueCount || 0) + 1;
    // Optionally mark status as 'overdue'
    invoice.status =
      invoice.status === "completed" ? invoice.status : "overdue";
    await invoice.save();

    console.log(
      `✅ Overdue reminder sent for invoice ${invoice.invoiceNumber} to ${customer.email}`,
    );
    return true;
  } catch (err) {
    console.error(
      `❌ Failed to send overdue reminder for invoice ${invoice._id}:`,
      err.message || err,
    );
    return false;
  }
}

/**
 * Find overdue invoices and send reminders.
 * - Looks for invoices with dueDate < now
 * - paymentStatus in unpaid|partial
 * - overdueNoticeSent != true OR allow repeated sends (configurable)
 */
exports.runOverdueReminderJob = async (opts = {}) => {
  const {
    onlyNotified = false, // when false, still sends only if overdueNoticeSent !== true
    limit = 200, // safety cap per run
  } = opts;

  console.log("🔔 Running overdue reminder job...");

  // Find overdue invoices
  const now = new Date();
  const query = {
    paymentStatus: { $in: ["unpaid", "partial"] },
    dueDate: { $lt: now },
    isDeleted: { $ne: true },
    // Only send if not already sent
    overdueNoticeSent: { $ne: true },
  };

  // populate customer & organization for email & branding
  const invoices = await Invoice.find(query)
    .limit(limit)
    .populate("customerId", "name fullname email")
    .populate("organizationId", "name primaryEmail themePrimary themeAccent")
    .lean(false);

  if (!invoices || invoices.length === 0) {
    console.log("✅ No overdue invoices found or already notified.");
    return;
  }

  console.log(
    `📨 Found ${invoices.length} overdue invoices; sending reminders...`,
  );
  for (const invoice of invoices) {
    // For each invoice, attempt to send
    try {
      // Use a transaction when marking the invoice? Not strictly necessary here,
      // but we'll save after successful send inside sendOverdueReminder.
      await sendOverdueReminder(invoice);
    } catch (err) {
      console.error("Error processing overdue invoice", invoice._id, err);
      continue; // continue other invoices
    }
  }
};

/**
 * Start cron schedule for overdue reminders.
 * Default: daily at 09:30 server time (change cron expression below).
 */
exports.startOverdueReminderCron = () => {
  console.log("⏰ Overdue reminder cron initializing (daily at 09:30).");
  // Cron: '30 9 * * *' => every day at 09:30
  cron.schedule("30 9 * * *", async () => {
    try {
      await exports.runOverdueReminderJob();
    } catch (err) {
      console.error("Overdue reminder cron job failed:", err);
    }
  });
};
