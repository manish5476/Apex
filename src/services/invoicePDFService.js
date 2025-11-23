// src/services/invoicePDFService.js
const Invoice = require("../models/invoiceModel");
const Organization = require("../models/organizationModel");
const Customer = require("../models/customerModel");
const { generateInvoicePDFBuffer } = require("../utils/invoiceTemplate");
const { getInvoiceEmailHTML } = require("../utils/templates/invoiceEmailTemplate");
const sendEmail = require("../utils/email");
const AppError = require("../utils/appError");

/**
 * Generate an invoice PDF buffer for download.
 * NAME: downloadInvoicePDF
 */
exports.downloadInvoicePDF = async (invoiceId, organizationId) => {
  // 1. Fetch Invoice with ALL necessary data for the PDF
  const invoice = await Invoice.findOne({
    _id: invoiceId,
    organizationId,
  })
    .populate("customerId", "name email phone address") 
    .populate("organizationId", "name primaryEmail gstNumber phone") 
    .populate("branchId", "name address") // Critical for PDF Address
    .populate("items.productId", "name sku"); // Critical for PDF Item Names

  if (!invoice) throw new AppError("Invoice not found.", 404);

  const pdfBuffer = await generateInvoicePDFBuffer(
    invoice,
    invoice.organizationId
  );
  return pdfBuffer;
};

/**
 * Send invoice PDF by email to the customer.
 * NAME: emailInvoice
 */
exports.emailInvoice = async (invoiceId, organizationId) => {
  // 1. Fetch Invoice with the SAME robust population
  const invoice = await Invoice.findOne({
    _id: invoiceId,
    organizationId,
  })
    .populate("customerId", "name email phone")
    .populate("organizationId", "name primaryEmail gstNumber phone") 
    .populate("branchId", "name address") // Critical for PDF Address
    .populate("items.productId", "name sku"); // Critical for PDF Item Names

  if (!invoice) throw new AppError("Invoice not found.", 404);

  const customer = invoice.customerId;
  const organization = invoice.organizationId;

  if (!customer?.email)
    throw new AppError("Customer does not have an email.", 400);

  // 2. Generate the PDF Buffer 
  const pdfBuffer = await generateInvoicePDFBuffer(invoice, organization);

  // 3. Generate the HTML Email Body
  const html = getInvoiceEmailHTML(customer, invoice, organization);

  // 4. Send Email with Attachment
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

  console.log(`✅ Invoice ${invoice.invoiceNumber} sent to ${customer.email}`);
  return true;
};

// // src/services/invoicePDFService.js
// const Invoice = require("../models/invoiceModel");
// const Organization = require("../models/organizationModel");
// const Customer = require("../models/customerModel");
// const { generateInvoicePDFBuffer } = require("../utils/invoiceTemplate");
// const {
//   getInvoiceEmailHTML,
// } = require("../utils/templates/invoiceEmailTemplate");
// const sendEmail = require("../utils/email");
// const AppError = require("../utils/appError");

// /**
//  * Generate an invoice PDF buffer for download or email.
//  * @param {string} invoiceId
//  * @param {string} organizationId
//  * @returns {Promise<Buffer>}
//  */
// exports.generateInvoicePDF = async (invoiceId, organizationId) => {
//   const invoice = await Invoice.findOne({
//     _id: invoiceId,
//     organizationId,
//   })
//     .populate("customerId", "name email phone")
//     .populate("organizationId", "name primaryEmail gstNumber uniqueShopId")
//     .populate("branchId", "name address")
//     .populate("items.productId", "name sku");

//   if (!invoice) throw new AppError("Invoice not found.", 404);

//   const pdfBuffer = await generateInvoicePDFBuffer(
//     invoice,
//     invoice.organizationId,
//   );
//   return pdfBuffer;
// };

// /**
//  * Send invoice PDF by email to the customer.
//  */
// exports.sendInvoiceEmail = async (invoiceId, organizationId) => {
//   const invoice = await Invoice.findOne({
//     _id: invoiceId,
//     organizationId,
//   })
//     .populate("customerId", "name email")
//     .populate(
//       "organizationId",
//       "name primaryEmail themePrimary themeAccent website gstNumber",
//     );

//   if (!invoice) throw new AppError("Invoice not found.", 404);

//   const customer = invoice.customerId;
//   const organization = invoice.organizationId;

//   if (!customer?.email)
//     throw new AppError("Customer does not have an email.", 400);

//   const pdfBuffer = await generateInvoicePDFBuffer(invoice, organization);
//   const html = getInvoiceEmailHTML(customer, invoice, organization);

//   await sendEmail({
//     email: customer.email,
//     subject: `Invoice #${invoice.invoiceNumber} from ${organization.name}`,
//     html,
//     attachments: [
//       {
//         filename: `Invoice_${invoice.invoiceNumber}.pdf`,
//         content: pdfBuffer,
//       },
//     ],
//   });

//   console.log(`✅ Invoice ${invoice.invoiceNumber} sent to ${customer.email}`);
//   return true;
// };
