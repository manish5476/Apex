// src/services/paymentReminderService.js
const cron = require("node-cron");
const Invoice = require("../models/invoiceModel");
const invoicePDFService = require("./invoicePDFService");
const {
  getInvoiceEmailHTML,
} = require("../utils/templates/invoiceEmailTemplate");
const sendEmail = require("../utils/email");
const AppError = require("../utils/appError");

/**
 * Sends a reminder email for a single invoice.
 * @param {Object} invoice
 */
async function sendPaymentReminder(invoice) {
  try {
    const customer = invoice.customerId;
    const organization = invoice.organizationId;

    if (!customer?.email) {
      console.warn(
        `Skipping reminder: Customer has no email (${customer.name || customer._id})`,
      );
      return;
    }

    const pdfBuffer = await invoicePDFService.generateInvoicePDF(
      invoice._id,
      organization._id,
    );
    const html = `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2 style="color: ${organization.themePrimary || "#1e40af"};">Payment Reminder</h2>
        <p>Dear ${customer.name || "Customer"},</p>
        <p>This is a friendly reminder that your invoice <strong>#${invoice.invoiceNumber}</strong> 
        of <strong>₹${invoice.grandTotal.toLocaleString("en-IN")}</strong> 
        is due on <strong>${new Date(invoice.dueDate).toLocaleDateString("en-IN")}</strong>.</p>
        <p>Please ensure payment to avoid late fees or service interruptions.</p>
        <p>Thank you for your business with <strong>${organization.name}</strong>.</p>
        <p style="margin-top: 20px;">You can find the invoice attached below.</p>
        <br/>
        <p>Warm regards,</p>
        <p><strong>${organization.name}</strong></p>
      </div>
    `;

    await sendEmail({
      email: customer.email,
      subject: `Payment Reminder: Invoice #${invoice.invoiceNumber} due soon`,
      html,
      attachments: [
        {
          filename: `Invoice_${invoice.invoiceNumber}.pdf`,
          content: pdfBuffer,
        },
      ],
    });

    console.log(
      `✅ Reminder sent for invoice ${invoice.invoiceNumber} to ${customer.email}`,
    );

    // Mark as reminder sent
    invoice.reminderSent = true;
    await invoice.save();
  } catch (err) {
    console.error(
      `❌ Failed to send reminder for invoice ${invoice._id}:`,
      err.message,
    );
  }
}

/**
 * Finds invoices due in 24 hours and sends reminders.
 */
exports.runPaymentReminderJob = async () => {
  console.log("🕐 Running daily payment reminder job...");
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Find all unpaid or partial invoices due within 24 hours
  const invoices = await Invoice.find({
    paymentStatus: { $in: ["unpaid", "partial"] },
    dueDate: { $gte: now, $lte: tomorrow },
    reminderSent: { $ne: true },
  })
    .populate("customerId", "name email")
    .populate("organizationId", "name primaryEmail themePrimary themeAccent")
    .lean(false);

  if (!invoices.length) {
    console.log("✅ No upcoming due invoices found.");
    return;
  }

  console.log(`📨 Found ${invoices.length} invoices due soon.`);

  for (const invoice of invoices) {
    await sendPaymentReminder(invoice);
  }
};

/**
 * Initialize the daily cron job
 * Runs every day at 9:00 AM server time
 */
exports.startPaymentReminderCron = () => {
  console.log("⏰ Payment reminder cron initialized (daily at 9:00 AM).");
  cron.schedule("0 9 * * *", async () => {
    await exports.runPaymentReminderJob();
  });
};
