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