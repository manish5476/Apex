/**
 * Formats a number to Indian Rupee currency for email display
 */
const money = (n) =>
  parseFloat(n || 0).toLocaleString("en-IN", { style: "currency", currency: "INR" });

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

/**
 * Professional fintech-grade Invoice Email HTML.
 * Design language: obsidian + 22k gold — precision-crafted for trust.
 * Table-based, fully inlined, ~12 KB, email-client hardened.
 */
exports.getInvoiceEmailHTML = (customer, invoice, organization) => {
  const amount       = money(invoice.grandTotal ?? invoice.totalAmount);
  const invoiceDate  = fmtDate(invoice.invoiceDate);
  const isPaid       = (invoice.paymentStatus || "").toLowerCase() === "paid";
  const statusLabel  = isPaid ? "PAID" : "PAYMENT DUE";
  const statusFg     = isPaid ? "#059669" : "#B45309";
  const statusBg     = isPaid ? "#ECFDF5" : "#FFFBEB";
  const statusBorder = isPaid ? "#A7F3D0" : "#FDE68A";
  const orgName      = organization.name || "Us";
  const orgEmail     = organization.primaryEmail || "";
  const custName     = customer.name || "Valued Customer";
  const invoiceNo    = invoice.invoiceNumber || "—";

  // Item rows — capped at 20 for email safety
  const items = (invoice.items || []).slice(0, 20);
  const itemsBlock = items.length
    ? `
      <!-- Items Table -->
      <tr><td height="8" style="line-height:8px;font-size:8px;">&nbsp;</td></tr>
      <tr>
        <td style="padding:0 40px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="border-collapse:collapse;border-radius:6px;overflow:hidden;
                        border:1px solid #E5E7EB;">
            <!-- Table header -->
            <tr style="background:#0A0F1E;">
              <td style="padding:10px 14px;font-family:Georgia,'Times New Roman',serif;
                         font-size:10px;font-weight:700;color:#C9A84C;
                         letter-spacing:.08em;border-bottom:1px solid #1E2840;">DESCRIPTION</td>
              <td style="padding:10px 14px;font-family:Georgia,'Times New Roman',serif;
                         font-size:10px;font-weight:700;color:#C9A84C;letter-spacing:.08em;
                         text-align:center;border-bottom:1px solid #1E2840;">QTY</td>
              <td style="padding:10px 14px;font-family:Georgia,'Times New Roman',serif;
                         font-size:10px;font-weight:700;color:#C9A84C;letter-spacing:.08em;
                         text-align:right;border-bottom:1px solid #1E2840;">AMOUNT</td>
            </tr>
            ${items.map((item, i) => {
              const name = item.name || item.productId?.name || "Item";
              const sku  = item.productId?.sku ? `<br><span style="font-size:10px;color:#9CA3AF;">SKU: ${item.productId.sku}</span>` : "";
              const bg   = i % 2 === 0 ? "#FFFFFF" : "#F9FAFB";
              const isLast = i === items.length - 1;
              const borderStyle = isLast ? "none" : "1px solid #F3F4F6";
              return `
            <tr style="background:${bg};">
              <td style="padding:11px 14px;font-family:Georgia,'Times New Roman',serif;
                         font-size:13px;color:#0A0F1E;border-bottom:${borderStyle};">
                         ${name}${sku}</td>
              <td style="padding:11px 14px;font-family:Georgia,'Times New Roman',serif;
                         font-size:13px;color:#6B7280;text-align:center;
                         border-bottom:${borderStyle};">${item.quantity}</td>
              <td style="padding:11px 14px;font-family:Georgia,'Times New Roman',serif;
                         font-size:13px;font-weight:700;color:#0A0F1E;text-align:right;
                         border-bottom:${borderStyle};">${money(item.price * item.quantity)}</td>
            </tr>`;
            }).join("")}
          </table>
        </td>
      </tr>`
    : "";

  // Totals block
  const subtotalRow = invoice.subTotal != null ? `
    <tr>
      <td style="font-family:Georgia,'Times New Roman',serif;font-size:12px;
                 color:#6B7280;padding:4px 0;">Subtotal</td>
      <td style="font-family:Georgia,'Times New Roman',serif;font-size:12px;
                 color:#374151;text-align:right;padding:4px 0;">${money(invoice.subTotal)}</td>
    </tr>` : "";

  const discountRow = invoice.totalDiscount ? `
    <tr>
      <td style="font-family:Georgia,'Times New Roman',serif;font-size:12px;
                 color:#6B7280;padding:4px 0;">Discount</td>
      <td style="font-family:Georgia,'Times New Roman',serif;font-size:12px;
                 color:#059669;text-align:right;padding:4px 0;">− ${money(invoice.totalDiscount)}</td>
    </tr>` : "";

  const taxRow = invoice.totalTax != null ? `
    <tr>
      <td style="font-family:Georgia,'Times New Roman',serif;font-size:12px;
                 color:#6B7280;padding:4px 0;">Tax</td>
      <td style="font-family:Georgia,'Times New Roman',serif;font-size:12px;
                 color:#374151;text-align:right;padding:4px 0;">${money(invoice.totalTax)}</td>
    </tr>` : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>Invoice #${invoiceNo} — ${orgName}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:#F0F4F8;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F0F4F8;"><tr><td align="center"><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:#F0F4F8;min-height:100vh;">
  <tr>
    <td align="center" style="padding:40px 16px 40px;">

      <!-- Outer wrapper — max width -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="max-width:580px;">

        <!-- ═══ TOP LABEL ════════════════════════════════ -->
        <tr>
          <td style="padding:0 0 10px;font-family:Georgia,'Times New Roman',serif;
                     font-size:11px;color:#9CA3AF;letter-spacing:.12em;text-align:center;">
            SECURE INVOICE NOTIFICATION
          </td>
        </tr>

        <!-- ═══ CARD ════════════════════════════════════ -->
        <tr>
          <td style="background:#FFFFFF;border-radius:10px;
                     box-shadow:0 4px 32px rgba(10,15,30,.10);overflow:hidden;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

              <!-- GOLD TOP BAR -->
              <tr>
                <td height="4" style="background:linear-gradient(90deg,#C9A84C,#F0D98B,#C9A84C);
                                      line-height:4px;font-size:4px;">&nbsp;</td>
              </tr>

              <!-- ── HEADER ─────────────────────────── -->
              <tr>
                <td style="background:#0A0F1E;padding:32px 40px 28px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <!-- Org info -->
                      <td valign="bottom">
                        <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;
                                    font-weight:700;color:#FFFFFF;letter-spacing:.05em;
                                    line-height:1.2;">${orgName.toUpperCase()}</div>
                        ${orgEmail ? `
                        <div style="font-family:Georgia,'Times New Roman',serif;font-size:11px;
                                    color:rgba(255,255,255,.4);margin-top:5px;">${orgEmail}</div>` : ""}
                      </td>
                      <!-- Invoice chip -->
                      <td align="right" valign="top">
                        <div style="display:inline-block;background:transparent;
                                    border:1px solid rgba(201,168,76,.4);
                                    border-radius:4px;padding:5px 14px;">
                          <span style="font-family:Georgia,'Times New Roman',serif;
                                       font-size:10px;font-weight:700;color:#C9A84C;
                                       letter-spacing:.1em;">INVOICE</span>
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- ── META STRIP ──────────────────────── -->
              <tr>
                <td style="background:#0D1526;padding:12px 40px;
                           border-top:1px solid rgba(255,255,255,.05);
                           border-bottom:1px solid rgba(255,255,255,.05);">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="font-family:Georgia,'Times New Roman',serif;font-size:12px;">
                        <span style="color:#C9A84C;font-weight:700;letter-spacing:.04em;">#${invoiceNo}</span>
                        <span style="color:rgba(255,255,255,.25);margin:0 8px;">·</span>
                        <span style="color:rgba(255,255,255,.5);font-size:11px;">${invoiceDate}</span>
                      </td>
                      <td align="right">
                        <span style="display:inline-block;background:${statusBg};
                                     color:${statusFg};font-family:Georgia,'Times New Roman',serif;
                                     font-size:10px;font-weight:700;letter-spacing:.08em;
                                     padding:4px 14px;border-radius:20px;
                                     border:1px solid ${statusBorder};">${statusLabel}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- ── GREETING ────────────────────────── -->
              <tr>
                <td style="padding:32px 40px 0;">
                  <p style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;
                             font-size:18px;font-weight:700;color:#0A0F1E;line-height:1.3;">
                    Hello, ${custName}.
                  </p>
                  <p style="margin:0;font-family:Georgia,'Times New Roman',serif;
                             font-size:13px;color:#6B7280;line-height:1.7;">
                    ${isPaid
                      ? "Your payment has been received and your invoice has been marked as settled. Please find a summary below and the full PDF attached for your records."
                      : "Please find the details of your invoice below. A PDF copy is attached for your records. Kindly arrange payment before the due date."
                    }
                  </p>
                </td>
              </tr>

              ${itemsBlock}

              <!-- ── AMOUNT BOX ──────────────────────── -->
              <tr>
                <td style="padding:24px 40px 0;">
                  <!-- Outer container with gold border -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                         style="border-radius:8px;overflow:hidden;border:1px solid #E5E7EB;">
                    <!-- Totals rows -->
                    <tr>
                      <td style="padding:20px 20px 16px;background:#F9FAFB;
                                 border-bottom:1px solid #E5E7EB;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          ${subtotalRow}
                          ${discountRow}
                          ${taxRow}
                        </table>
                      </td>
                    </tr>
                    <!-- Grand total -->
                    <tr>
                      <td style="background:#0A0F1E;padding:18px 20px;">
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                          <tr>
                            <td style="font-family:Georgia,'Times New Roman',serif;
                                       font-size:11px;font-weight:700;color:rgba(255,255,255,.45);
                                       letter-spacing:.1em;">
                              ${isPaid ? "AMOUNT PAID" : "AMOUNT DUE"}
                            </td>
                            <td align="right" style="font-family:Georgia,'Times New Roman',serif;
                                                     font-size:26px;font-weight:700;color:#C9A84C;
                                                     letter-spacing:-.5px;">${amount}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- ── DIVIDER ──────────────────────────── -->
              <tr>
                <td style="padding:28px 40px 0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td height="1" style="background:#E5E7EB;line-height:1px;font-size:1px;">&nbsp;</td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- ── SIGN OFF ─────────────────────────── -->
              <tr>
                <td style="padding:24px 40px 32px;">
                  <p style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;
                             font-size:13px;color:#6B7280;line-height:1.7;">
                    For any queries regarding this invoice, please don't hesitate to reach out to us.
                  </p>
                  <p style="margin:0;font-family:Georgia,'Times New Roman',serif;
                             font-size:13px;color:#374151;line-height:1.6;">
                    Regards,<br>
                    <strong style="color:#0A0F1E;">${orgName}</strong>
                    ${orgEmail ? `<br><a href="mailto:${orgEmail}"
                      style="color:#C9A84C;text-decoration:none;font-size:12px;">${orgEmail}</a>` : ""}
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

        <!-- ═══ FOOTER ══════════════════════════════════ -->
        <tr>
          <td style="padding:20px 0 0;text-align:center;">
            <p style="margin:0;font-family:Georgia,'Times New Roman',serif;
                      font-size:11px;color:#9CA3AF;line-height:1.8;">
              ${orgName}
              ${orgEmail ? ` &middot; <a href="mailto:${orgEmail}"
                style="color:#9CA3AF;text-decoration:none;">${orgEmail}</a>` : ""}
            </p>
            <p style="margin:4px 0 0;font-family:Georgia,'Times New Roman',serif;
                      font-size:10px;color:#C9CAD1;">
              This is a system-generated communication. Please do not reply to this email.
            </p>
          </td>
        </tr>

      </table>
      <!-- /Outer wrapper -->

    </td>
  </tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->

</body>
</html>`;
};
// /**
//  * Formats a number to Indian Rupee currency — no minimumFractionDigits for email display
//  */
// const money = (n) =>
//   parseFloat(n || 0).toLocaleString("en-IN", { style: "currency", currency: "INR" });

// const date = (d) =>
//   d
//     ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
//     : "";

// /**
//  * Generates the Invoice Email HTML.
//  * Optimised: inlined CSS only where needed, table-based layout for email clients,
//  * no web fonts (server-safe), minimal DOM, ~8 KB output.
//  */
// exports.getInvoiceEmailHTML = (customer, invoice, organization) => {
//   const amount       = money(invoice.grandTotal ?? invoice.totalAmount);
//   const invoiceDate  = date(invoice.invoiceDate);
//   const isPaid       = (invoice.paymentStatus || "").toLowerCase() === "paid";
//   const statusLabel  = isPaid ? "PAID" : "UNPAID";
//   const statusBg     = isPaid ? "#16a34a" : "#dc2626";
//   const orgName      = organization.name || "Us";
//   const orgEmail     = organization.primaryEmail || "";
//   const custName     = customer.name || "Valued Customer";
//   const invoiceNo    = invoice.invoiceNumber || "—";

//   // Item rows — only rendered if items exist (saves ~30% HTML when absent)
//   const items = (invoice.items || []).slice(0, 20); // cap for email safety
//   const itemsBlock = items.length
//     ? `
//       <tr><td height="24"></td></tr>
//       <tr>
//         <td style="padding:0 32px;">
//           <table width="100%" cellpadding="0" cellspacing="0" border="0"
//                  style="border-collapse:collapse;font-family:Georgia,'Times New Roman',serif;font-size:13px;">
//             <tr style="background:#1e3a8a;">
//               <td style="color:#ffffff;font-weight:700;padding:8px 10px;font-size:11px;letter-spacing:.05em;">ITEM</td>
//               <td style="color:#ffffff;font-weight:700;padding:8px 10px;text-align:center;font-size:11px;">QTY</td>
//               <td style="color:#ffffff;font-weight:700;padding:8px 10px;text-align:right;font-size:11px;">AMOUNT</td>
//             </tr>
//             ${items.map((item, i) => {
//               const name = item.name || item.productId?.name || "Item";
//               const bg   = i % 2 === 0 ? "#ffffff" : "#f8fafc";
//               return `
//             <tr style="background:${bg};">
//               <td style="padding:9px 10px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${name}</td>
//               <td style="padding:9px 10px;text-align:center;color:#0f172a;border-bottom:1px solid #e2e8f0;">${item.quantity}</td>
//               <td style="padding:9px 10px;text-align:right;font-weight:700;color:#0f172a;border-bottom:1px solid #e2e8f0;">${money(item.price * item.quantity)}</td>
//             </tr>`;
//             }).join("")}
//           </table>
//         </td>
//       </tr>`
//     : "";

//   return `<!DOCTYPE html>
// <html lang="en">
// <head>
// <meta charset="utf-8">
// <meta name="viewport" content="width=device-width,initial-scale=1">
// <meta name="x-apple-disable-message-reformatting">
// <title>Invoice #${invoiceNo} from ${orgName}</title>
// </head>
// <body style="margin:0;padding:0;background:#f1f5f9;-webkit-text-size-adjust:100%;">

// <!--[if mso]><table width="100%" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
// <table width="100%" cellpadding="0" cellspacing="0" border="0"
//        style="background:#f1f5f9;font-family:Georgia,'Times New Roman',serif;">
//   <tr>
//     <td align="center" style="padding:32px 12px;">

//       <!-- Card -->
//       <table width="100%" cellpadding="0" cellspacing="0" border="0"
//              style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;
//                     box-shadow:0 4px 24px rgba(0,0,0,.08);">

//         <!-- Header -->
//         <tr>
//           <td style="background:#1e40af;padding:32px 32px 24px;">
//             <table width="100%" cellpadding="0" cellspacing="0" border="0">
//               <tr>
//                 <td>
//                   <div style="color:#ffffff;font-size:22px;font-weight:700;
//                                letter-spacing:.04em;">${orgName.toUpperCase()}</div>
//                   ${orgEmail
//                     ? `<div style="color:rgba(255,255,255,.65);font-size:12px;margin-top:4px;">${orgEmail}</div>`
//                     : ""}
//                 </td>
//                 <td align="right" valign="top">
//                   <div style="background:#ffffff;color:#1e40af;font-size:11px;font-weight:700;
//                                letter-spacing:.08em;padding:5px 14px;border-radius:20px;
//                                display:inline-block;">INVOICE</div>
//                 </td>
//               </tr>
//             </table>
//           </td>
//         </tr>

//         <!-- Meta strip -->
//         <tr>
//           <td style="background:#1e3a8a;padding:12px 32px;">
//             <table width="100%" cellpadding="0" cellspacing="0" border="0">
//               <tr>
//                 <td style="color:rgba(255,255,255,.7);font-size:11px;">
//                   <span style="color:#ffffff;font-weight:700;">#${invoiceNo}</span>
//                   &nbsp;&middot;&nbsp;${invoiceDate}
//                 </td>
//                 <td align="right">
//                   <span style="background:${statusBg};color:#ffffff;font-size:10px;
//                                font-weight:700;letter-spacing:.06em;padding:3px 12px;
//                                border-radius:20px;">${statusLabel}</span>
//                 </td>
//               </tr>
//             </table>
//           </td>
//         </tr>

//         <!-- Body -->
//         <tr>
//           <td style="padding:32px 32px 0;">
//             <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;">
//               Hello ${custName},
//             </p>
//             <p style="margin:0;font-size:14px;color:#475569;line-height:1.6;">
//               Please find the details of your invoice below.
//               A&nbsp;PDF copy is attached for your records.
//             </p>
//           </td>
//         </tr>

//         ${itemsBlock}

//         <!-- Amount box -->
//         <tr>
//           <td style="padding:24px 32px 0;">
//             <table width="100%" cellpadding="0" cellspacing="0" border="0"
//                    style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
//               <tr>
//                 <td style="padding:18px 20px;">
//                   <table width="100%" cellpadding="0" cellspacing="0" border="0">
//                     <tr>
//                       <td style="color:#64748b;font-size:12px;">AMOUNT DUE</td>
//                       <td align="right" style="font-size:24px;font-weight:700;color:#1e40af;">${amount}</td>
//                     </tr>
//                   </table>
//                 </td>
//               </tr>
//             </table>
//           </td>
//         </tr>

//         <!-- Sign-off -->
//         <tr>
//           <td style="padding:24px 32px 32px;">
//             <p style="margin:0;font-size:13px;color:#475569;line-height:1.7;">
//               If you have any questions about this invoice, please don't hesitate to reach out.
//             </p>
//             <p style="margin:16px 0 0;font-size:13px;color:#0f172a;">
//               Best regards,<br>
//               <strong>${orgName}</strong>
//             </p>
//           </td>
//         </tr>

//         <!-- Footer -->
//         <tr>
//           <td style="background:#0f172a;padding:20px 32px;text-align:center;">
//             <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.6;">
//               ${orgName}
//               ${orgEmail ? `&nbsp;&middot;&nbsp;<a href="mailto:${orgEmail}"
//                 style="color:#f59e0b;text-decoration:none;">${orgEmail}</a>` : ""}
//             </p>
//             <p style="margin:6px 0 0;color:#475569;font-size:10px;">
//               This is an automatically generated email. Please do not reply directly.
//             </p>
//           </td>
//         </tr>

//       </table>
//       <!-- /Card -->

//     </td>
//   </tr>
// </table>
// <!--[if mso]></td></tr></table><![endif]-->

// </body>
// </html>`;
// };

// // /**
// //  * Formats a number to Indian Rupee currency format
// //  */
// // const formatCurrency = (amount) => {
// //   return parseFloat(amount || 0).toLocaleString("en-IN", {
// //     style: "currency",
// //     currency: "INR",
// //   });
// // };

// // /**
// //  * Generates the HTML for the Invoice Email
// //  */
// // exports.getInvoiceEmailHTML = (customer, invoice, organization) => {
// //   const amount = formatCurrency(invoice.grandTotal || invoice.totalAmount);
  
// //   const invoiceDate = new Date(invoice.invoiceDate).toLocaleDateString("en-IN", {
// //     day: "numeric",
// //     month: "short",
// //     year: "numeric",
// //   });

// //   const paymentStatus = (invoice.paymentStatus || 'Unpaid').toUpperCase();
// //   const isPaid = invoice.paymentStatus?.toLowerCase() === 'paid';
// //   const statusColor = isPaid ? '#22c55e' : '#ef4444'; // Green for paid, Red for unpaid/other

// //   return `
// // <!DOCTYPE html>
// // <html>
// // <head>
// //   <meta charset="utf-8">
// //   <meta name="viewport" content="width=device-width, initial-scale=1.0">
// //   <title>Invoice #${invoice.invoiceNumber}</title>
// //   <style>
// //     body { font-family: 'Helvetica', 'Arial', sans-serif; margin: 0; padding: 0; background-color: #f3f4f6; }
// //     .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
// //     .header { background-color: #005b96; padding: 40px 20px; text-align: center; }
// //     .header h1 { color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 1px; text-transform: uppercase; }
// //     .content { padding: 40px 30px; color: #1f2937; line-height: 1.6; }
// //     .greeting { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
// //     .details-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px; margin: 20px 0; }
// //     .row { display: flex; justify-content: space-between; margin-bottom: 10px; }
// //     .label { color: #64748b; font-size: 14px; }
// //     .value { font-weight: bold; color: #1f2937; font-size: 14px; }
// //     .total-row { border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 10px; display: flex; justify-content: space-between; align-items: center; }
// //     .total-label { font-weight: bold; color: #005b96; font-size: 16px; }
// //     .total-value { font-size: 22px; font-weight: bold; color: #005b96; }
// //     .footer { background-color: #1f2937; padding: 25px; text-align: center; color: #9ca3af; font-size: 12px; }
// //     .footer a { color: #fbbf24; text-decoration: none; }
// //     .footer p { margin: 5px 0; }
// //   </style>
// // </head>
// // <body>
// //   <div class="container">
// //     <div class="header">
// //       <h1>Invoice from ${organization.name}</h1>
// //     </div>

// //     <div class="content">
// //       <div class="greeting">Hello ${customer.name},</div>
// //       <p>Thank you for your business. Please find the details of your recent invoice below.</p>

// //       <div class="details-box">
// //         <div class="row">
// //           <span class="label">Invoice No:</span>
// //           <span class="value">#${invoice.invoiceNumber}</span>
// //         </div>
// //         <div class="row">
// //           <span class="label">Date:</span>
// //           <span class="value">${invoiceDate}</span>
// //         </div>
// //         <div class="row">
// //           <span class="label">Status:</span>
// //           <span class="value" style="color: ${statusColor};">${paymentStatus}</span>
// //         </div>
// //         <div class="total-row">
// //           <span class="total-label">AMOUNT DUE</span>
// //           <span class="total-value">${amount}</span>
// //         </div>
// //       </div>

// //       <p>A PDF copy of this invoice has been attached for your records.</p>
// //       <p>Best regards,<br><strong>${organization.name}</strong></p>
// //     </div>

// //     <div class="footer">
// //       <p><strong>${organization.name}</strong></p>
// //       <p>${organization.primaryEmail}</p>
// //       <p>Questions? Contact us at <a href="mailto:${organization.primaryEmail}">${organization.primaryEmail}</a></p>
// //     </div>
// //   </div>
// // </body>
// // </html>
// //   `;
// // };