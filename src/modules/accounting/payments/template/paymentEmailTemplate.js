const money = (n) =>
  parseFloat(n || 0).toLocaleString("en-IN", { style: "currency", currency: "INR" });

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

/**
 * Professional fintech-grade Payment Receipt Email HTML.
 * Design language: matches the Invoice (Obsidian & Gold).
 */
exports.getPaymentEmailHTML = (customer, payment, organization) => {
  const amount = money(payment.amount);
  const paymentDate = fmtDate(payment.paymentDate);
  const receiptNo = payment._id.toString().slice(-6).toUpperCase();
  const orgName = organization.name || "Us";
  const orgEmail = organization.primaryEmail || "";
  const custName = customer.name || "Valued Customer";
  const method = (payment.paymentMethod || "Cash").toUpperCase();
  const refNo = payment.transactionId || payment.referenceNumber || "N/A";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>Payment Receipt #${receiptNo} — ${orgName}</title>
</head>
<body style="margin:0;padding:0;background:#F0F4F8;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F4F8;"><tr><td align="center"><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:#F0F4F8;min-height:100vh;">
  <tr>
    <td align="center" style="padding:40px 16px;">

      <!-- Outer wrapper -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="max-width:580px;">

        <!-- TOP LABEL -->
        <tr>
          <td style="padding:0 0 10px;font-family:Georgia,'Times New Roman',serif;
                     font-size:11px;color:#9CA3AF;letter-spacing:.12em;text-align:center;">
            SECURE PAYMENT NOTIFICATION
          </td>
        </tr>

        <!-- CARD -->
        <tr>
          <td style="background:#FFFFFF;border-radius:10px;
                     box-shadow:0 4px 32px rgba(10,15,30,.10);overflow:hidden;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

              <!-- GOLD TOP BAR -->
              <tr>
                <td height="4" style="background:linear-gradient(90deg,#C9A84C,#F0D98B,#C9A84C);
                                      line-height:4px;font-size:4px;">&nbsp;</td>
              </tr>

              <!-- HEADER -->
              <tr>
                <td style="background:#0A0F1E;padding:32px 40px 28px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td valign="bottom">
                        <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;
                                    font-weight:700;color:#FFFFFF;letter-spacing:.05em;">${orgName.toUpperCase()}</div>
                      </td>
                      <td align="right" valign="top">
                        <div style="display:inline-block;border:1px solid rgba(201,168,76,.4);
                                    border-radius:4px;padding:5px 14px;">
                          <span style="font-family:Georgia,'Times New Roman',serif;
                                       font-size:10px;font-weight:700;color:#C9A84C;
                                       letter-spacing:.1em;">RECEIPT</span>
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- META STRIP -->
              <tr>
                <td style="background:#0D1526;padding:12px 40px;
                           border-top:1px solid rgba(255,255,255,.05);
                           border-bottom:1px solid rgba(255,255,255,.05);">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="font-family:Georgia,'Times New Roman',serif;font-size:12px;">
                        <span style="color:#C9A84C;font-weight:700;letter-spacing:.04em;">#${receiptNo}</span>
                        <span style="color:rgba(255,255,255,.25);margin:0 8px;">·</span>
                        <span style="color:rgba(255,255,255,.5);font-size:11px;">${paymentDate}</span>
                      </td>
                      <td align="right">
                        <span style="display:inline-block;background:#ECFDF5;
                                     color:#059669;font-family:Georgia,'Times New Roman',serif;
                                     font-size:10px;font-weight:700;letter-spacing:.08em;
                                     padding:4px 14px;border-radius:20px;
                                     border:1px solid #A7F3D0;">SUCCESSFUL</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- GREETING -->
              <tr>
                <td style="padding:32px 40px 0;">
                  <p style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;
                             font-size:18px;font-weight:700;color:#0A0F1E;">
                    Hello, ${custName}.
                  </p>
                  <p style="margin:0;font-family:Georgia,'Times New Roman',serif;
                             font-size:13px;color:#6B7280;line-height:1.7;">
                    Your payment has been successfully processed. Please find the details of your transaction below. A PDF receipt is attached for your records.
                  </p>
                </td>
              </tr>

              <!-- AMOUNT BOX -->
              <tr>
                <td style="padding:24px 40px 0;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0"
                         style="border-radius:8px;overflow:hidden;border:1px solid #E5E7EB;">
                    <!-- Details rows -->
                    <tr>
                      <td style="padding:20px 20px 16px;background:#F9FAFB;
                                 border-bottom:1px solid #E5E7EB;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="font-family:Georgia,'Times New Roman',serif;font-size:12px;color:#6B7280;padding:4px 0;">Payment Method</td>
                            <td align="right" style="font-family:Georgia,'Times New Roman',serif;font-size:12px;color:#374151;padding:4px 0;">${method}</td>
                          </tr>
                          <tr>
                            <td style="font-family:Georgia,'Times New Roman',serif;font-size:12px;color:#6B7280;padding:4px 0;">Reference ID</td>
                            <td align="right" style="font-family:Georgia,'Times New Roman',serif;font-size:12px;color:#374151;padding:4px 0;">${refNo}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <!-- Total -->
                    <tr>
                      <td style="background:#0A0F1E;padding:18px 20px;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="font-family:Georgia,'Times New Roman',serif;
                                       font-size:11px;font-weight:700;color:rgba(255,255,255,.45);
                                       letter-spacing:.1em;">AMOUNT RECEIVED</td>
                            <td align="right" style="font-family:Georgia,'Times New Roman',serif;
                                                     font-size:26px;font-weight:700;color:#C9A84C;">${amount}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- SIGN OFF -->
              <tr>
                <td style="padding:32px 40px 32px;">
                  <p style="margin:0;font-family:Georgia,'Times New Roman',serif;
                             font-size:13px;color:#374151;line-height:1.6;">
                    Regards,<br>
                    <strong style="color:#0A0F1E;">${orgName}</strong>
                    ${orgEmail ? `<br><a href="mailto:${orgEmail}" style="color:#C9A84C;text-decoration:none;">${orgEmail}</a>` : ""}
                  </p>
                </td>
              </tr>

              <!-- GOLD BOTTOM BAR -->
              <tr>
                <td height="2" style="background:linear-gradient(90deg,#C9A84C,#F0D98B,#C9A84C);
                                      line-height:2px;font-size:2px;">&nbsp;</td>
              </tr>

            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="padding:20px 0 0;text-align:center;">
            <p style="margin:0;font-family:Georgia,'Times New Roman',serif;
                      font-size:10px;color:#9CA3AF;">
              This is a system-generated communication. Please do not reply.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->

</body>
</html>`;
};