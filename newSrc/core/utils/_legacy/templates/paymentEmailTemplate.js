// src/utils/templates/paymentEmailTemplate.js
const formatCurrency = (amount) => {
  return parseFloat(amount || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
  });
};

exports.getPaymentEmailHTML = (customer, payment, organization) => {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Helvetica, Arial, sans-serif; background: #f3f4f6; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; }
    .header { background: #005b96; padding: 30px; text-align: center; color: white; }
    .amount { font-size: 32px; font-weight: bold; margin: 10px 0; }
    .content { padding: 30px; color: #333; }
    .row { display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding: 10px 0; }
    .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>PAYMENT RECEIVED</div>
      <div class="amount">${formatCurrency(payment.amount)}</div>
      <div>${new Date(payment.paymentDate).toLocaleDateString("en-IN")}</div>
    </div>
    <div class="content">
      <p>Dear ${customer.name},</p>
      <p>We have received your payment. Thank you!</p>
      
      <div class="row">
        <span>Payment Method</span>
        <strong>${(payment.paymentMethod || 'Cash').toUpperCase()}</strong>
      </div>
      <div class="row">
        <span>Receipt No</span>
        <strong>${payment._id.toString().slice(-6).toUpperCase()}</strong>
      </div>

      <p style="margin-top: 20px;">Please find the official receipt attached to this email.</p>
    </div>
    <div class="footer">
      ${organization.name}
    </div>
  </div>
</body>
</html>
  `;
};