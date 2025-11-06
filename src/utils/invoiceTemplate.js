// src/utils/invoiceTemplate.js
const PDFDocument = require("pdfkit");
const { toWords } = require("number-to-words");
const AppError = require("./appError");

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 50;
const CONTENT_WIDTH = PAGE.width - 2 * MARGIN;

const THEMES = {
  modern: {
    primary: "#1e40af",
    accent: "#059669",
    text: "#1f2937",
    light: "#6b7280",
    border: "#e5e7eb",
    headerBg: "#f8fafc",
    rowAlt: "#f1f5f9",
    font: { header: "Helvetica-Bold", body: "Helvetica" },
  },
};

const formatINR = (num) =>
  (num || 0).toLocaleString("en-IN", { style: "currency", currency: "INR" });

const toWordsINR = (num) => {
  if (!num) return "Zero Rupees Only";
  const [r, p] = num.toFixed(2).split(".");
  let words = toWords(r);
  if (+p > 0) words += ` and ${toWords(p)} paise`;
  return `${words.charAt(0).toUpperCase() + words.slice(1)} only`;
};

const drawLine = (doc, y, color = "#e5e7eb") =>
  doc
    .strokeColor(color)
    .lineWidth(0.5)
    .moveTo(MARGIN, y)
    .lineTo(PAGE.width - MARGIN, y)
    .stroke();

exports.generateInvoicePDFBuffer = async (invoice, organization) => {
  if (!invoice || !organization)
    throw new AppError("Missing invoice or organization", 400);

  const theme = THEMES.modern;

  return new Promise(async (resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN });
    const chunks = [];
    doc.on("data", chunks.push.bind(chunks));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      // HEADER
      doc.font(theme.font.header).fontSize(22).fillColor(theme.primary);
      doc.text(organization.name || "INVOICE", MARGIN, 50);
      doc.fontSize(12).fillColor(theme.text);
      doc.text(`Invoice #${invoice.invoiceNumber}`, MARGIN, 80);
      doc.text(
        `Date: ${new Date(invoice.invoiceDate).toLocaleDateString("en-IN")}`,
        MARGIN,
        95,
      );
      if (organization.gstNumber)
        doc.text(`GSTIN: ${organization.gstNumber}`, MARGIN, 110);

      // CUSTOMER INFO
      const customer = invoice.customerId || {};
      doc.font(theme.font.header).fontSize(12).fillColor(theme.primary);
      doc.text("Bill To:", MARGIN, 150);
      doc.font(theme.font.body).fillColor(theme.text);
      doc.text(customer.name || "Customer", MARGIN, 165);
      if (customer.email) doc.text(customer.email, MARGIN, 180);

      // ITEMS TABLE
      let y = 220;
      doc.font(theme.font.header).fontSize(10).fillColor(theme.text);
      const headers = ["#", "Description", "Qty", "Rate", "Tax", "Amount"];
      const colWidths = [30, 210, 60, 80, 60, 100];
      let x = MARGIN;
      headers.forEach((h, i) => {
        doc.text(h, x, y, { width: colWidths[i], align: "left" });
        x += colWidths[i];
      });
      y += 20;
      drawLine(doc, y);
      y += 10;

      doc.font(theme.font.body).fontSize(10);
      (invoice.items || []).forEach((item, i) => {
        x = MARGIN;
        const isEven = i % 2 === 0;
        if (isEven)
          doc
            .rect(MARGIN, y - 5, CONTENT_WIDTH, 18)
            .fill(theme.rowAlt)
            .fillColor(theme.text);
        const row = [
          i + 1,
          item.productId?.name || item.customTitle || "Item",
          item.quantity,
          formatINR(item.rate),
          `${item.taxRate || 0}%`,
          formatINR(item.amount),
        ];
        row.forEach((val, j) => {
          doc.text(val.toString(), x, y, {
            width: colWidths[j],
            align: j > 1 ? "right" : "left",
          });
          x += colWidths[j];
        });
        y += 20;
      });
      drawLine(doc, y + 10);

      // TOTALS
      y += 30;
      doc.font(theme.font.header).fontSize(12).fillColor(theme.primary);
      doc.text("Subtotal:", PAGE.width - MARGIN - 180, y);
      doc.text(
        formatINR(invoice.subTotal || invoice.grandTotal),
        PAGE.width - MARGIN - 80,
        y,
        {
          align: "right",
        },
      );
      y += 20;
      doc.text("Total Tax:", PAGE.width - MARGIN - 180, y);
      doc.text(formatINR(invoice.totalTax || 0), PAGE.width - MARGIN - 80, y, {
        align: "right",
      });
      y += 25;
      doc.rect(PAGE.width - MARGIN - 200, y, 200, 30).fill(theme.primary);
      doc
        .fillColor("#fff")
        .fontSize(13)
        .text("GRAND TOTAL", PAGE.width - MARGIN - 190, y + 8);
      doc.text(
        formatINR(invoice.grandTotal || invoice.totalAmount),
        PAGE.width - MARGIN - 80,
        y + 8,
        { align: "right" },
      );

      y += 60;
      doc.fillColor(theme.light).fontSize(10);
      doc.text("Amount in Words:", MARGIN, y);
      doc.fillColor(theme.text).font(theme.font.body);
      doc.text(
        toWordsINR(invoice.grandTotal || invoice.totalAmount),
        MARGIN + 110,
        y,
      );

      // FOOTER
      drawLine(doc, PAGE.height - 100);
      doc.font(theme.font.body).fontSize(9).fillColor(theme.light);
      doc.text(`Generated by ${organization.name}`, MARGIN, PAGE.height - 80);
      doc.text("Thank you for your business!", MARGIN, PAGE.height - 60, {
        align: "center",
        width: CONTENT_WIDTH,
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

//
// src/utils/invoiceTemplate.js
// const PDFDocument = require("pdfkit");
// const fs = require("fs").promises;
// const path = require("path");
// const { toWords } = require("number-to-words");
// const AppError = require("./appError");

// // ========== Utility Helpers ==========
// const PAGE = { width: 595.28, height: 841.89 };
// const MARGIN = 50;
// const CONTENT_WIDTH = PAGE.width - 2 * MARGIN;

// const formatINR = (num) =>
//   (num || 0).toLocaleString("en-IN", {
//     style: "currency",
//     currency: "INR",
//     minimumFractionDigits: 2,
//   });

// const toWordsINR = (num) => {
//   if (!num) return "Zero Rupees Only";
//   const [rupees, paise] = num.toFixed(2).split(".");
//   let words = toWords(rupees);
//   if (+paise > 0) words += ` and ${toWords(paise)} paise`;
//   return `${words.charAt(0).toUpperCase() + words.slice(1)} only`;
// };

// const THEMES = {
//   modern: {
//     primary: "#1e40af",
//     accent: "#059669",
//     text: "#1f2937",
//     light: "#6b7280",
//     border: "#e5e7eb",
//     headerBg: "#f8fafc",
//     rowAlt: "#f1f5f9",
//     font: { header: "Helvetica-Bold", body: "Helvetica" },
//   },
// };

// const drawLine = (doc, y, color = "#e5e7eb") =>
//   doc
//     .strokeColor(color)
//     .lineWidth(0.5)
//     .moveTo(MARGIN, y)
//     .lineTo(PAGE.width - MARGIN, y)
//     .stroke();

// // ========== MAIN EXPORT ==========
// exports.generateInvoicePDFBuffer = async (invoice, organization) => {
//   if (!invoice) throw new AppError("Invoice data required", 400);

//   const theme = THEMES.modern;
//   return new Promise(async (resolve, reject) => {
//     const doc = new PDFDocument({ size: "A4", margin: MARGIN });
//     const chunks = [];
//     doc.on("data", chunks.push.bind(chunks));
//     doc.on("end", () => resolve(Buffer.concat(chunks)));
//     doc.on("error", reject);

//     try {
//       // HEADER
//       doc.font(theme.font.header).fontSize(20).fillColor(theme.primary);
//       doc.text(`${organization.name || "Invoice"}`, MARGIN, 50);
//       doc.fontSize(12).fillColor(theme.text);
//       doc.text(`Invoice #${invoice.invoiceNumber}`, MARGIN, 80);
//       doc.text(
//         `Date: ${new Date(invoice.invoiceDate).toLocaleDateString("en-IN")}`,
//         MARGIN,
//         95,
//       );

//       // CUSTOMER INFO
//       const customer = invoice.customerId || invoice.buyer || {};
//       doc.moveDown();
//       doc.font(theme.font.header).fontSize(12).fillColor(theme.primary);
//       doc.text("Bill To:", MARGIN, 130);
//       doc.font(theme.font.body).fillColor(theme.text);
//       doc.text(customer.name || customer.fullname || "Customer", MARGIN, 145);
//       if (customer.email) doc.text(customer.email, MARGIN, 160);

//       // ITEMS TABLE
//       let y = 200;
//       doc.font(theme.font.header).fontSize(10).fillColor(theme.text);
//       doc.text("#", MARGIN, y);
//       doc.text("Description", MARGIN + 30, y);
//       doc.text("Qty", MARGIN + 250, y);
//       doc.text("Rate", MARGIN + 300, y);
//       doc.text("Amount", MARGIN + 400, y);
//       y += 20;

//       doc.font(theme.font.body).fontSize(10);
//       (invoice.items || []).forEach((item, i) => {
//         const rowY = y + i * 20;
//         doc.text(i + 1, MARGIN, rowY);
//         doc.text(
//           item.customTitle || item.product?.title || "Item",
//           MARGIN + 30,
//           rowY,
//           { width: 200 },
//         );
//         doc.text(item.quantity, MARGIN + 250, rowY);
//         doc.text(formatINR(item.rate), MARGIN + 300, rowY);
//         doc.text(formatINR(item.amount), MARGIN + 400, rowY);
//       });

//       y += (invoice.items?.length || 1) * 20 + 20;

//       // TOTALS
//       doc.font(theme.font.header).fontSize(12);
//       doc.text("Total:", MARGIN + 300, y);
//       doc.text(
//         formatINR(invoice.grandTotal || invoice.totalAmount),
//         MARGIN + 400,
//         y,
//       );

//       doc.moveDown();
//       doc.font(theme.font.body).fillColor(theme.light).fontSize(10);
//       doc.text(
//         `Amount in Words: ${toWordsINR(invoice.totalAmount || 0)}`,
//         MARGIN,
//         y + 30,
//       );

//       doc.end();
//     } catch (err) {
//       reject(err);
//     }
//   });
// };

// /**
//  * Generates simple HTML template for email body.
//  */
// exports.getInvoiceEmailHTML = (customer, invoice, organization) => `
// <!DOCTYPE html>
// <html><body>
// <h2>Invoice #${invoice.invoiceNumber}</h2>
// <p>Dear ${customer.name || customer.fullname || "Customer"},</p>
// <p>Thank you for your business with ${organization.name}.</p>
// <p>Total Amount: <strong>${formatINR(invoice.totalAmount)}</strong></p>
// <p>Invoice Date: ${new Date(invoice.invoiceDate).toLocaleDateString("en-IN")}</p>
// <p>Due Date: ${new Date(invoice.dueDate).toLocaleDateString("en-IN")}</p>
// <p>Your invoice PDF is attached.</p>
// </body></html>`;
