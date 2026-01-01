// src/services/paymentPDFService.js
const Payment = require("../models/paymentModel"); // Assuming you have a Payment model
const { generatePaymentSlipBuffer } = require("../utils/paymentSlipTemplate");
const { getPaymentEmailHTML } = require("../utils/templates/paymentEmailTemplate");
const sendEmail = require("../utils/email");
const AppError = require("../utils/appError");

exports.downloadPaymentPDF = async (paymentId, organizationId) => {
  const payment = await Payment.findOne({ _id: paymentId, organizationId })
    .populate("customerId", "name email")
    .populate("organizationId", "name primaryEmail")
    .populate("branchId", "address"); // Critical for header address

  if (!payment) throw new AppError("Payment not found", 404);

  return await generatePaymentSlipBuffer(payment, payment.organizationId);
};

exports.emailPaymentSlip = async (paymentId, organizationId) => {
  const payment = await Payment.findOne({ _id: paymentId, organizationId })
    .populate("customerId", "name email")
    .populate("organizationId", "name primaryEmail")
    .populate("branchId", "address");

  if (!payment) throw new AppError("Payment not found", 404);
  
  const customer = payment.customerId;
  if (!customer || !customer.email) throw new AppError("Customer has no email", 400);

  const pdfBuffer = await generatePaymentSlipBuffer(payment, payment.organizationId);
  const html = getPaymentEmailHTML(customer, payment, payment.organizationId);

  await sendEmail({
    email: customer.email,
    subject: `Payment Receipt from ${payment.organizationId.name}`,
    html,
    attachments: [
      {
        filename: `Receipt_${paymentId}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf"
      }
    ]
  });

  return true;
};