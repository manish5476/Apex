const Invoice = require("../models/invoiceModel");
const Organization = require("../models/organizationModel");
const Customer = require("../models/customerModel");
const { generateInvoicePDFBuffer } = require("../utils/invoiceTemplate");
const { getInvoiceEmailHTML } = require("../utils/templates/invoiceEmailTemplate");
const sendEmail = require("../utils/email");
const AppError = require("../utils/appError");

/**
 * Generate an invoice PDF buffer for download.
 */
exports.downloadInvoicePDF = async (invoiceId, organizationId) => {
  // 1. Fetch Invoice with DEEP population
  const invoice = await Invoice.findOne({ _id: invoiceId, organizationId })
    .populate("customerId", "name email phone address") 
    .populate("organizationId", "name primaryEmail gstNumber phone address bankDetails") // ✅ Get Bank Details
    .populate("branchId", "name address phone") // ✅ Get Branch Address
    .populate("items.productId", "name sku hsn");

  if (!invoice) throw new AppError("Invoice not found.", 404);

  // 2. Generate Buffer
  const pdfBuffer = await generateInvoicePDFBuffer(invoice, invoice.organizationId);
  return pdfBuffer;
};

/**
 * Send invoice PDF by email to the customer.
 */
exports.emailInvoice = async (invoiceId, organizationId) => {
  const invoice = await Invoice.findOne({ _id: invoiceId, organizationId })
    .populate("customerId", "name email phone")
    .populate("organizationId", "name primaryEmail gstNumber phone address bankDetails") 
    .populate("branchId", "name address")
    .populate("items.productId", "name sku");

  if (!invoice) throw new AppError("Invoice not found.", 404);

  const customer = invoice.customerId;
  const organization = invoice.organizationId;

  if (!customer?.email) throw new AppError("Customer does not have an email address.", 400);

  // 2. Generate PDF
  const pdfBuffer = await generateInvoicePDFBuffer(invoice, organization);

  // 3. Generate Email Body
  const html = getInvoiceEmailHTML(customer, invoice, organization);

  // 4. Send
  await sendEmail({
    email: customer.email,
    subject: `Invoice #${invoice.invoiceNumber} from ${organization.name}`,
    html,
    attachments: [
      {
        filename: `Invoice_${invoice.invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });

  return true;
};