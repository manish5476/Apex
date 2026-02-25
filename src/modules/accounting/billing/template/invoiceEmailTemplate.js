/**
 * Formats a number to Indian Rupee currency format
 */
const formatCurrency = (amount) => {
  return parseFloat(amount || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
  });
};

/**
 * Generates the HTML for the Invoice Email
 */
exports.getInvoiceEmailHTML = (customer, invoice, organization) => {
  const amount = formatCurrency(invoice.grandTotal || invoice.totalAmount);
  
  const invoiceDate = new Date(invoice.invoiceDate).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const paymentStatus = (invoice.paymentStatus || 'Unpaid').toUpperCase();
  const isPaid = invoice.paymentStatus?.toLowerCase() === 'paid';
  const statusColor = isPaid ? '#22c55e' : '#ef4444'; // Green for paid, Red for unpaid/other

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice #${invoice.invoiceNumber}</title>
  <style>
    body { font-family: 'Helvetica', 'Arial', sans-serif; margin: 0; padding: 0; background-color: #f3f4f6; }
    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background-color: #005b96; padding: 40px 20px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 1px; text-transform: uppercase; }
    .content { padding: 40px 30px; color: #1f2937; line-height: 1.6; }
    .greeting { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
    .details-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px; margin: 20px 0; }
    .row { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .label { color: #64748b; font-size: 14px; }
    .value { font-weight: bold; color: #1f2937; font-size: 14px; }
    .total-row { border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 10px; display: flex; justify-content: space-between; align-items: center; }
    .total-label { font-weight: bold; color: #005b96; font-size: 16px; }
    .total-value { font-size: 22px; font-weight: bold; color: #005b96; }
    .footer { background-color: #1f2937; padding: 25px; text-align: center; color: #9ca3af; font-size: 12px; }
    .footer a { color: #fbbf24; text-decoration: none; }
    .footer p { margin: 5px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Invoice from ${organization.name}</h1>
    </div>

    <div class="content">
      <div class="greeting">Hello ${customer.name},</div>
      <p>Thank you for your business. Please find the details of your recent invoice below.</p>

      <div class="details-box">
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
          <span class="value" style="color: ${statusColor};">${paymentStatus}</span>
        </div>
        <div class="total-row">
          <span class="total-label">AMOUNT DUE</span>
          <span class="total-value">${amount}</span>
        </div>
      </div>

      <p>A PDF copy of this invoice has been attached for your records.</p>
      <p>Best regards,<br><strong>${organization.name}</strong></p>
    </div>

    <div class="footer">
      <p><strong>${organization.name}</strong></p>
      <p>${organization.primaryEmail}</p>
      <p>Questions? Contact us at <a href="mailto:${organization.primaryEmail}">${organization.primaryEmail}</a></p>
    </div>
  </div>
</body>
</html>
  `;
};

// // src/utils/templates/invoiceEmailTemplate.js

// const formatCurrency = (amount) => {
//   return parseFloat(amount || 0).toLocaleString("en-IN", {
//     style: "currency",
//     currency: "INR",
//   });
// };

// exports.getInvoiceEmailHTML = (customer, invoice, organization) => {
//   const amount = formatCurrency(invoice.grandTotal || invoice.totalAmount);
//   const invoiceDate = new Date(invoice.invoiceDate).toLocaleDateString("en-IN", {
//     day: "numeric",
//     month: "short",
//     year: "numeric",
//   });

//   return `
// <!DOCTYPE html>
// <html>
// <head>
//   <meta charset="utf-8">
//   <meta name="viewport" content="width=device-width, initial-scale=1.0">
//   <title>Invoice #${invoice.invoiceNumber}</title>
//   <style>
//     body { font-family: 'Helvetica', 'Arial', sans-serif; margin: 0; padding: 0; background-color: #f3f4f6; }
//     .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
//     .header { background-color: #005b96; padding: 40px 20px; text-align: center; }
//     .header h1 { color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 1px; }
//     .content { padding: 40px 30px; color: #1f2937; }
//     .greeting { font-size: 18px; font-weight: bold; margin-bottom: 20px; }
//     .details-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px; margin: 20px 0; }
//     .row { display: flex; justify-content: space-between; margin-bottom: 10px; }
//     .label { color: #64748b; font-size: 14px; }
//     .value { font-weight: bold; color: #1f2937; font-size: 14px; }
//     .total-row { border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 10px; display: flex; justify-content: space-between; }
//     .total-label { font-weight: bold; color: #005b96; }
//     .total-value { font-size: 20px; font-weight: bold; color: #005b96; }
//     .btn-container { text-align: center; margin-top: 30px; }
//     .btn { background-color: #fbbf24; color: #1f2937; padding: 14px 30px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block; }
//     .footer { background-color: #1f2937; padding: 20px; text-align: center; color: #9ca3af; font-size: 12px; }
//     .footer a { color: #fbbf24; text-decoration: none; }
//   </style>
// </head>
// <body>
//   <div class="container">
//     <div class="header">
//       <h1>INVOICE FROM ${organization.name.toUpperCase()}</h1>
//     </div>

//     <div class="content">
//       <div class="greeting">Hello ${customer.name},</div>
//       <p>Thank you for your business. Here is the invoice for your recent purchase.</p>

//       <div class="details-box">
//         <div class="row">
//           <span class="label">Invoice No:</span>
//           <span class="value">#${invoice.invoiceNumber}</span>
//         </div>
//         <div class="row">
//           <span class="label">Date:</span>
//           <span class="value">${invoiceDate}</span>
//         </div>
//         <div class="row">
//           <span class="label">Status:</span>
//           <span class="value" style="color: ${invoice.paymentStatus === 'paid' ? '#22c55e' : '#ef4444'}">
//             ${(invoice.paymentStatus || 'Unpaid').toUpperCase()}
//           </span>
//         </div>
//         <div class="total-row">
//           <span class="total-label">AMOUNT DUE</span>
//           <span class="total-value">${amount}</span>
//         </div>
//       </div>

//       <p>A PDF copy of the invoice is attached to this email for your records.</p>

//       </div>

//     <div class="footer">
//       <p>${organization.name} | ${organization.primaryEmail}</p>
//       <p>Questions? Contact us at <a href="mailto:${organization.primaryEmail}">${organization.primaryEmail}</a></p>
//     </div>
//   </div>
// </body>
// </html>
//   `;
// };