const formatCurrency = (amount) => {
  return parseFloat(amount || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
  });
};

exports.getInvoiceEmailHTML = (customer, invoice, organization) => {
  const amount = formatCurrency(invoice.grandTotal || invoice.totalAmount);
  const invoiceDate = new Date(invoice.invoiceDate).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const paymentStatus = (invoice.paymentStatus || 'Unpaid').toUpperCase();
  const statusColor = invoice.paymentStatus === 'paid' ? '#22c55e' : '#ef4444';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Helvetica', sans-serif; margin: 0; padding: 0; background-color: #f3f4f6; }
    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background-color: #005b96; padding: 30px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 22px; }
    .content { padding: 40px 30px; color: #1f2937; }
    .details { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px; margin: 20px 0; }
    .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
    .label { color: #64748b; font-size: 14px; }
    .value { font-weight: bold; font-size: 14px; }
    .footer { background-color: #1f2937; padding: 20px; text-align: center; color: #9ca3af; font-size: 12px; }
    .footer a { color: #fbbf24; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>INVOICE FROM ${organization.name.toUpperCase()}</h1>
    </div>
    <div class="content">
      <p>Hello <strong>${customer.name}</strong>,</p>
      <p>Please find attached the invoice for your recent purchase.</p>

      <div class="details">
        <div class="row">
          <span class="label">Invoice No:</span>
          <span class="value">#${invoice.invoiceNumber}</span>
        </div>
        <div class="row">
          <span class="label">Date:</span>
          <span class="value">${invoiceDate}</span>
        </div>
        <div class="row">
          <span class="label">Status:</span>
          <span class="value" style="color: ${statusColor}">${paymentStatus}</span>
        </div>
        <div style="border-top: 1px solid #e2e8f0; margin-top: 10px; padding-top: 10px;" class="row">
          <span class="label" style="color:#005b96; font-weight:bold;">AMOUNT DUE</span>
          <span class="value" style="color:#005b96; font-size:18px;">${amount}</span>
        </div>
      </div>

      <p>Thank you for your business!</p>
    </div>
    <div class="footer">
      <p>${organization.name} | ${organization.primaryEmail}</p>
    </div>
  </div>
</body>
</html>
  `;
};
// // src/utils/templates/invoiceEmailTemplate.js
// exports.getInvoiceEmailHTML = (customer, invoice, organization) => `
// <!DOCTYPE html>
// <html lang="en">
// <head>
// <meta charset="UTF-8" />
// <meta name="viewport" content="width=device-width, initial-scale=1.0" />
// <title>Invoice #${invoice.invoiceNumber}</title>
// <style>
// body { background-color: #f9fafb; font-family: 'Inter', Arial, sans-serif; color: #374151; margin: 0; padding: 0; }
// .container { max-width: 640px; margin: 30px auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden; }
// .header { background: linear-gradient(135deg, ${organization.themePrimary || "#1e40af"}, #1e3a8a); color: #fff; text-align: center; padding: 40px 20px; }
// .header h1 { margin: 0; font-size: 26px; font-weight: 700; }
// .header p { margin: 8px 0 0; font-size: 15px; opacity: 0.9; }
// .content { padding: 30px 35px; }
// .content h2 { font-size: 22px; color: #111827; margin-top: 0; }
// .summary { background-color: #f8fafc; border-left: 4px solid ${organization.themePrimary || "#1e40af"}; padding: 18px 20px; border-radius: 8px; margin-bottom: 25px; }
// .summary p { margin: 5px 0; font-size: 14px; }
// .summary strong { color: #111827; }
// .btn { display: inline-block; background: ${organization.themeAccent || "#059669"}; color: #fff !important; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px; margin-top: 15px; }
// .footer { background-color: #f3f4f6; text-align: center; padding: 15px 20px; font-size: 12px; color: #6b7280; }
// .footer a { color: ${organization.themePrimary || "#1e40af"}; text-decoration: none; }
// </style>
// </head>
// <body>
// <div class="container">
//   <div class="header">
//     <h1>${organization.name}</h1>
//     <p>Your Invoice is Ready</p>
//   </div>
//   <div class="content">
//     <h2>Invoice #${invoice.invoiceNumber}</h2>
//     <div class="summary">
//       <p><strong>Date:</strong> ${new Date(invoice.invoiceDate).toLocaleDateString("en-IN")}</p>
//       <p><strong>Customer:</strong> ${customer.name || customer.fullname || "Valued Customer"}</p>
//       <p><strong>Total:</strong> ₹${invoice.totalAmount.toLocaleString("en-IN")}</p>
//       <p><strong>Status:</strong> ${invoice.status.toUpperCase()}</p>
//     </div>
//     <p>Dear ${customer.name || "Customer"},</p>
//     <p>Thank you for your business with <strong>${organization.name}</strong>. Your invoice is attached for your records.</p>
//     <p>If you have any questions, feel free to contact us at <a href="mailto:${organization.primaryEmail}">${organization.primaryEmail}</a>.</p>
//     <a href="${organization.website || "#"}" class="btn">Visit Our Store</a>
//   </div>
//   <div class="footer">
//     <p>Thank you for shopping with ${organization.name}. Need help? <a href="mailto:${organization.primaryEmail}">Contact Support</a></p>
//   </div>
// </div>
// </body>
// </html>`;

// // exports.getInvoiceEmailHTML = (customer, invoice, organization) => `
// // <!DOCTYPE html>
// // <html lang="en">
// // <head>
// //   <meta charset="UTF-8" />
// //   <meta name="viewport" content="width=device-width, initial-scale=1.0" />
// //   <title>Your Invoice #${invoice.invoiceNumber}</title>
// //   <style>
// //     body {
// //       background-color: #f9fafb;
// //       font-family: 'Inter', Arial, sans-serif;
// //       color: #374151;
// //       margin: 0;
// //       padding: 0;
// //     }
// //     .container {
// //       max-width: 640px;
// //       margin: 30px auto;
// //       background-color: #ffffff;
// //       border-radius: 12px;
// //       overflow: hidden;
// //       box-shadow: 0 4px 20px rgba(0,0,0,0.08);
// //     }
// //     .header {
// //       background: linear-gradient(135deg, ${organization.themePrimary || "#1e40af"}, #1e3a8a);
// //       color: #ffffff;
// //       text-align: center;
// //       padding: 40px 20px 30px;
// //     }
// //     .header h1 {
// //       margin: 0;
// //       font-size: 26px;
// //       font-weight: 700;
// //     }
// //     .header p {
// //       margin: 8px 0 0;
// //       font-size: 15px;
// //       opacity: 0.9;
// //     }
// //     .content {
// //       padding: 30px 35px;
// //     }
// //     .content h2 {
// //       font-size: 22px;
// //       color: #111827;
// //       margin-top: 0;
// //     }
// //     .summary {
// //       background-color: #f8fafc;
// //       border-left: 4px solid ${organization.themePrimary || "#1e40af"};
// //       padding: 18px 20px;
// //       border-radius: 8px;
// //       margin-bottom: 25px;
// //     }
// //     .summary p {
// //       margin: 5px 0;
// //       font-size: 14px;
// //     }
// //     .summary strong {
// //       color: #111827;
// //     }
// //     .btn {
// //       display: inline-block;
// //       background-color: ${organization.themeAccent || "#059669"};
// //       color: #fff !important;
// //       padding: 12px 28px;
// //       text-decoration: none;
// //       border-radius: 6px;
// //       font-weight: 600;
// //       font-size: 15px;
// //       margin-top: 15px;
// //     }
// //     .footer {
// //       background-color: #f3f4f6;
// //       text-align: center;
// //       padding: 15px 20px;
// //       font-size: 12px;
// //       color: #6b7280;
// //     }
// //     .footer a {
// //       color: ${organization.themePrimary || "#1e40af"};
// //       text-decoration: none;
// //     }
// //   </style>
// // </head>
// // <body>
// //   <div class="container">
// //     <div class="header">
// //       <h1>${organization.name}</h1>
// //       <p>Your Invoice is Ready</p>
// //     </div>
// //     <div class="content">
// //       <h2>Invoice #${invoice.invoiceNumber}</h2>
// //       <div class="summary">
// //         <p><strong>Date:</strong> ${new Date(invoice.invoiceDate).toLocaleDateString("en-IN")}</p>
// //         <p><strong>Customer:</strong> ${customer.name || customer.fullname || "Valued Customer"}</p>
// //         <p><strong>Total:</strong> ₹${invoice.totalAmount.toLocaleString("en-IN")}</p>
// //         <p><strong>Status:</strong> ${invoice.status.toUpperCase()}</p>
// //       </div>
// //       <p>Dear ${customer.name || customer.fullname || "Customer"},</p>
// //       <p>Thank you for your business with <strong>${organization.name}</strong>. Your invoice is attached to this email as a PDF document for your records.</p>
// //       <p>If you have any questions, please contact us at <a href="mailto:${organization.primaryEmail}">${organization.primaryEmail}</a>.</p>
// //       <a href="${organization.website || "#"}" class="btn">Visit Our Store</a>
// //     </div>
// //     <div class="footer">
// //       <p>Thank you for shopping with ${organization.name}.<br>
// //       Need help? <a href="mailto:${organization.primaryEmail}">Contact support</a></p>
// //     </div>
// //   </div>
// // </body>
// // </html>
// // `;
