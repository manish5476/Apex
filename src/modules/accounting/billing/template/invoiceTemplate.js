const PDFDocument = require("pdfkit");
const { toWords } = require("number-to-words");
const AppError = require("../../../../core/utils/api/appError");

// ─── DESIGN SYSTEM ────────────────────────────────────────────────────────────
const W = 595.28;
const H = 841.89;
const MARGIN = 48;

// Palette — obsidian & gold, like a black Amex card
const C = {
  // Backgrounds
  pageBg:      "#F7F8FA",
  cardBg:      "#FFFFFF",
  headerBg:    "#0A0F1E",   // deep navy-black
  accentStrip: "#0D1526",

  // Ink
  inkPrimary:  "#0A0F1E",
  inkSecondary:"#6B7280",
  inkMuted:    "#9CA3AF",

  // Brand
  gold:        "#C9A84C",   // true 22k gold
  goldLight:   "#F0D98B",
  goldDark:    "#A07C2E",

  // Status
  paid:        "#059669",
  unpaid:      "#DC2626",
  paidBg:      "#ECFDF5",
  unpaidBg:    "#FEF2F2",

  // Structural
  border:      "#E5E7EB",
  rowAlt:      "#F9FAFB",
  rule:        "#E5E7EB",
  white:       "#FFFFFF",
};

const F = {
  bold:        "Helvetica-Bold",
  reg:         "Helvetica",
  oblique:     "Helvetica-Oblique",
};

// ─── UTILITIES ────────────────────────────────────────────────────────────────
const money = (n) =>
  parseFloat(n || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  });

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const inWords = (amount) => {
  const total = parseFloat(amount || 0);
  const r = Math.floor(total);
  const p = Math.round((total - r) * 100);
  let w = toWords(r).replace(/\b\w/g, (c) => c.toUpperCase()) + " Rupees";
  if (p > 0) w += " and " + toWords(p).replace(/\b\w/g, (c) => c.toUpperCase()) + " Paise";
  return w + " Only";
};

const hRule = (doc, x, y, w, color = C.border, thickness = 0.5) =>
  doc.moveTo(x, y).lineTo(x + w, y).strokeColor(color).lineWidth(thickness).stroke();

// Draws a pill/badge
const badge = (doc, x, y, w, h, fillColor, label, textColor = C.white, fontSize = 7.5) => {
  doc.roundedRect(x, y, w, h, h / 2).fill(fillColor);
  doc.font(F.bold).fontSize(fontSize).fillColor(textColor)
     .text(label, x, y + (h / 2) - (fontSize * 0.42), { width: w, align: "center" });
};

// Thin gold accent line
const goldRule = (doc, x, y, w) =>
  doc.moveTo(x, y).lineTo(x + w, y).strokeColor(C.gold).lineWidth(1.5).stroke();

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
exports.generateInvoicePDFBuffer = async (invoice, organization) => {
  if (!invoice || !organization) throw new AppError("Missing data", 400);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      bufferPages: true,
      compress: true,
      info: {
        Title: `Invoice #${invoice.invoiceNumber}`,
        Author: organization.name,
        Creator: organization.name,
      },
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const items    = invoice.items || [];
    const customer = invoice.customerId || {};
    const branch   = invoice.branchId  || {};
    const org      = organization;
    const status   = (invoice.paymentStatus || "unpaid").toUpperCase();
    const isPaid   = status === "PAID";

    // ── Page background ───────────────────────────────────────────
    doc.rect(0, 0, W, H).fill(C.pageBg);

    // ── White card shadow (simulated with a slightly darker rect) ─
    doc.rect(MARGIN + 2, 42, W - MARGIN * 2, H - 60)
       .fill("#E8EBF0");
    // White card
    doc.rect(MARGIN, 40, W - MARGIN * 2, H - 58).fill(C.white);

    const CX = MARGIN;          // card left
    const CW = W - MARGIN * 2;  // card width

    // ── HEADER BAND ───────────────────────────────────────────────
    const HEADER_H = 110;
    doc.rect(CX, 40, CW, HEADER_H).fill(C.headerBg);

    // Subtle grid texture on header (thin vertical lines)
    doc.save();
    doc.rect(CX, 40, CW, HEADER_H).clip();
    doc.strokeColor("#FFFFFF").lineWidth(0.12).opacity(0.04);
    for (let gx = CX; gx < CX + CW; gx += 18) {
      doc.moveTo(gx, 40).lineTo(gx, 40 + HEADER_H).stroke();
    }
    for (let gy = 40; gy < 40 + HEADER_H; gy += 18) {
      doc.moveTo(CX, gy).lineTo(CX + CW, gy).stroke();
    }
    doc.restore();
    doc.opacity(1);

    // Gold accent bar — top of card
    doc.rect(CX, 40, CW, 3).fill(C.gold);

    // Org name — left side of header
    const orgName = org.name || "Organization";
    doc.font(F.bold).fontSize(18).fillColor(C.white)
       .text(orgName.toUpperCase(), CX + 28, 62, { characterSpacing: 1.5 });

    // Org sub-info
    doc.font(F.reg).fontSize(7.5).fillColor("rgba(255,255,255,0.45)");
    const subParts = [org.primaryEmail, org.gstNumber ? `GSTIN ${org.gstNumber}` : null].filter(Boolean);
    if (subParts.length) doc.text(subParts.join("   ·   "), CX + 28, 84);

    // "INVOICE" label — right side of header (large, ghosted)
    doc.font(F.bold).fontSize(38).fillColor(C.white).opacity(0.06)
       .text("INVOICE", CX + CW - 210, 52, { width: 190, align: "right", characterSpacing: 4 });
    doc.opacity(1);

    // Invoice number + date — right side header
    doc.font(F.bold).fontSize(10).fillColor(C.gold)
       .text(`#${invoice.invoiceNumber}`, CX + CW - 210, 58, { width: 190, align: "right" });
    doc.font(F.reg).fontSize(7.5).fillColor("rgba(255,255,255,0.5)")
       .text(fmtDate(invoice.invoiceDate), CX + CW - 210, 74, { width: 190, align: "right" });
    if (invoice.dueDate) {
      doc.font(F.reg).fontSize(7.5).fillColor("rgba(255,255,255,0.35)")
         .text(`Due: ${fmtDate(invoice.dueDate)}`, CX + CW - 210, 86, { width: 190, align: "right" });
    }

    // Status badge — bottom-right of header
    const sColor  = isPaid ? C.paid   : C.unpaid;
    const sBgHex  = isPaid ? "#1A4A38" : "#4A1A1A";
    badge(doc, CX + CW - 100, 40 + HEADER_H - 32, 76, 20, sBgHex, status, sColor, 8);

    // ── META STRIP ────────────────────────────────────────────────
    const STRIP_Y = 40 + HEADER_H;
    doc.rect(CX, STRIP_Y, CW, 28).fill("#F0F4F8");
    hRule(doc, CX, STRIP_Y, CW, C.border, 0.5);
    hRule(doc, CX, STRIP_Y + 28, CW, C.border, 0.5);

    // Meta items in strip
    const metaItems = [
      { label: "INVOICE NO",  value: `#${invoice.invoiceNumber}` },
      { label: "ISSUE DATE",  value: fmtDate(invoice.invoiceDate) },
      invoice.dueDate ? { label: "DUE DATE", value: fmtDate(invoice.dueDate) } : null,
      { label: "STATUS",      value: status, color: sColor },
    ].filter(Boolean);

    const metaColW = CW / metaItems.length;
    metaItems.forEach((m, i) => {
      const mx = CX + i * metaColW;
      doc.font(F.reg).fontSize(6.5).fillColor(C.inkMuted)
         .text(m.label, mx + 14, STRIP_Y + 6, { width: metaColW - 14, characterSpacing: 0.5 });
      doc.font(F.bold).fontSize(8).fillColor(m.color || C.inkPrimary)
         .text(m.value, mx + 14, STRIP_Y + 15, { width: metaColW - 14 });
      if (i > 0) {
        doc.moveTo(mx, STRIP_Y + 6).lineTo(mx, STRIP_Y + 22).strokeColor(C.border).lineWidth(0.5).stroke();
      }
    });

    // ── BILL FROM / BILL TO ───────────────────────────────────────
    let y = STRIP_Y + 28 + 22;

    const halfW = (CW - 28) / 2;
    const billFromX = CX + 18;
    const billToX   = CX + 18 + halfW + 14;

    // Section labels
    const sectionLabel = (label, sx, sy) => {
      doc.font(F.bold).fontSize(6.5).fillColor(C.gold)
         .text(label, sx, sy, { characterSpacing: 1.2 });
      goldRule(doc, sx, sy + 11, 28);
    };

    sectionLabel("BILL FROM", billFromX, y);
    sectionLabel("BILL TO",   billToX,   y);
    y += 16;

    // From
    let addrParts = [];
    if (branch.address && typeof branch.address === "object") {
      const { street, city, state, zipCode } = branch.address;
      addrParts = [street, city, state, zipCode].filter(Boolean);
    } else if (typeof org.address === "string") {
      addrParts = [org.address];
    }

    doc.font(F.bold).fontSize(9.5).fillColor(C.inkPrimary).text(orgName, billFromX, y, { width: halfW - 18 });
    const fromY2 = doc.y + 3;
    doc.font(F.reg).fontSize(8).fillColor(C.inkSecondary);
    if (addrParts.length) doc.text(addrParts.join(", "), billFromX, fromY2, { width: halfW - 18 });
    if (org.primaryEmail) doc.text(org.primaryEmail, billFromX, doc.y + 3, { width: halfW - 18 });

    // To
    doc.font(F.bold).fontSize(9.5).fillColor(C.inkPrimary).text(customer.name || "Customer", billToX, y, { width: halfW - 18 });
    const toY2 = doc.y + 3;
    doc.font(F.reg).fontSize(8).fillColor(C.inkSecondary);
    if (customer.phone) doc.text(customer.phone, billToX, toY2, { width: halfW - 18 });
    if (customer.email) doc.text(customer.email, billToX, doc.y + 3, { width: halfW - 18 });

    y += 52;

    // ── ITEMS TABLE ───────────────────────────────────────────────
    // Thin gold rule before table
    goldRule(doc, CX + 18, y, CW - 36);
    y += 10;

    const cols = [
      { label: "#",           x: CX + 18,         w: 20,           align: "left"   },
      { label: "DESCRIPTION", x: CX + 44,          w: CW - 220,     align: "left"   },
      { label: "UNIT PRICE",  x: CX + CW - 172,    w: 68,           align: "right"  },
      { label: "QTY",         x: CX + CW - 100,    w: 28,           align: "center" },
      { label: "AMOUNT",      x: CX + CW - 68,     w: 54,           align: "right"  },
    ];

    const drawTableHeader = (ty) => {
      doc.rect(CX + 14, ty - 5, CW - 28, 22).fill("#F0F4F8");
      doc.font(F.bold).fontSize(6.5).fillColor(C.inkMuted);
      cols.forEach((c) => doc.text(c.label, c.x, ty + 3, { width: c.w, align: c.align, characterSpacing: 0.5 }));
    };

    drawTableHeader(y);
    y += 26;

    const ROW_H = 30;
    doc.font(F.reg).fontSize(8.5).fillColor(C.inkPrimary);

    items.forEach((item, i) => {
      if (y + ROW_H > H - 190) {
        doc.addPage();
        // Re-draw card bg on new page
        doc.rect(0, 0, W, H).fill(C.pageBg);
        doc.rect(MARGIN, 40, W - MARGIN * 2, H - 58).fill(C.white);
        doc.rect(CX, 40, CW, 3).fill(C.gold);
        y = 56;
        drawTableHeader(y);
        y += 26;
      }

      // Alternating row
      if (i % 2 === 1) {
        doc.rect(CX + 14, y - 6, CW - 28, ROW_H).fill(C.rowAlt);
      }

      const name = item.name || item.productId?.name || "Item";
      const sku  = item.productId?.sku ? `SKU: ${item.productId.sku}` : null;

      doc.font(F.reg).fontSize(8.5).fillColor(C.inkMuted)
         .text(`${i + 1}`, cols[0].x, y, { width: cols[0].w });

      doc.font(F.bold).fontSize(8.5).fillColor(C.inkPrimary)
         .text(name, cols[1].x, y, { width: cols[1].w });
      if (sku) {
        doc.font(F.reg).fontSize(7).fillColor(C.inkMuted)
           .text(sku, cols[1].x, y + 11, { width: cols[1].w });
      }

      doc.font(F.reg).fontSize(8.5).fillColor(C.inkSecondary)
         .text(money(item.price), cols[2].x, y, { width: cols[2].w, align: "right" });
      doc.text(`${item.quantity}`, cols[3].x, y, { width: cols[3].w, align: "center" });

      doc.font(F.bold).fontSize(8.5).fillColor(C.inkPrimary)
         .text(money(item.price * item.quantity), cols[4].x, y, { width: cols[4].w, align: "right" });

      y += ROW_H;
    });

    // Bottom table rule — gold
    goldRule(doc, CX + 18, y, CW - 36);
    y += 20;

    // ── TOTALS ────────────────────────────────────────────────────
    const tLX = CX + CW - 230;
    const tVX = CX + CW - 66;
    const tLW = 156;
    const tVW = 52;

    const tRow = (label, value, highlight = false) => {
      if (highlight) {
        // Grand total row — gold background chip
        doc.rect(tLX - 14, y - 5, tVX - tLX + tVW + 22, 26).fill(C.gold);
        doc.font(F.bold).fontSize(9.5).fillColor(C.inkPrimary)
           .text(label, tLX, y + 3, { width: tLW, align: "right" });
        doc.font(F.bold).fontSize(9.5).fillColor(C.inkPrimary)
           .text(value, tVX, y + 3, { width: tVW, align: "right" });
        y += 32;
      } else {
        doc.font(F.reg).fontSize(8).fillColor(C.inkSecondary)
           .text(label, tLX, y, { width: tLW, align: "right" });
        doc.font(F.reg).fontSize(8).fillColor(C.inkPrimary)
           .text(value, tVX, y, { width: tVW, align: "right" });
        y += 15;
      }
    };

    tRow("Subtotal", money(invoice.subTotal));
    if (invoice.totalDiscount) tRow("Discount", `− ${money(invoice.totalDiscount)}`);
    tRow("Tax", money(invoice.totalTax));
    y += 6;
    tRow("GRAND TOTAL", money(invoice.grandTotal), true);

    // Amount in words
    doc.font(F.oblique).fontSize(7).fillColor(C.inkMuted)
       .text(inWords(invoice.grandTotal), CX + 18, y, { width: CW - 36 });
    y += 22;

    // ── BANK DETAILS ──────────────────────────────────────────────
    const bank = org.bankDetails || {};
    const hasBankDetails = bank.bankName || bank.accountNumber;

    if (hasBankDetails) {
      hRule(doc, CX + 18, y, CW - 36, C.border, 0.5);
      y += 14;

      doc.font(F.bold).fontSize(6.5).fillColor(C.gold)
         .text("PAYMENT DETAILS", CX + 18, y, { characterSpacing: 1.2 });
      goldRule(doc, CX + 18, y + 11, 36);
      y += 18;

      const bPairs = [
        ["Bank Name",   bank.bankName      || "—"],
        ["Account No",  bank.accountNumber || "—"],
        ["IFSC Code",   bank.ifsc          || "—"],
        ["UPI ID",      bank.upiId         || (org.phone ? `${org.phone}@upi` : "—")],
      ];

      // 2-column grid for bank details
      bPairs.forEach(([l, v], i) => {
        const col = i % 2 === 0 ? CX + 18 : CX + 18 + (CW - 36) / 2 + 20;
        const row = y + Math.floor(i / 2) * 18;
        doc.font(F.reg).fontSize(7).fillColor(C.inkMuted).text(l, col, row, { width: 72 });
        doc.font(F.bold).fontSize(8).fillColor(C.inkPrimary).text(v, col + 76, row, { width: 110 });
      });
      y += Math.ceil(bPairs.length / 2) * 18 + 8;
    }

    // ── FOOTER ────────────────────────────────────────────────────
    const FOOTER_Y = H - 66;
    doc.rect(CX, FOOTER_Y - 8, CW, 50).fill(C.headerBg);
    // Gold top rule on footer
    doc.rect(CX, FOOTER_Y - 8, CW, 2).fill(C.gold);

    doc.font(F.reg).fontSize(7.5).fillColor("rgba(255,255,255,0.4)")
       .text("Thank you for your business.", CX + 18, FOOTER_Y + 4, { width: CW / 2 });

    // Signature area
    const sigX = CX + CW - 160;
    doc.moveTo(sigX, FOOTER_Y + 4).lineTo(sigX + 120, FOOTER_Y + 4)
       .strokeColor(C.gold).lineWidth(0.5).stroke();
    doc.font(F.bold).fontSize(8).fillColor(C.white)
       .text(orgName, sigX, FOOTER_Y + 9, { width: 120, align: "center" });
    doc.font(F.reg).fontSize(6.5).fillColor("rgba(255,255,255,0.4)")
       .text("Authorised Signatory", sigX, FOOTER_Y + 21, { width: 120, align: "center" });

    doc.end();
  });
};
// const PDFDocument = require("pdfkit");
// const { toWords } = require("number-to-words");
// const AppError = require("../../../../core/utils/api/appError");

// // --- CONFIGURATION ---
// const PAGE = { width: 595.28, height: 841.89, margin: 40 };
// const COLORS = {
//   primary: "#005b96",     // Brand Blue
//   secondary: "#003d66",   // Dark Blue
//   textDark: "#1f2937",    // Black/Gray
//   textGray: "#64748b",    // Muted
//   white: "#ffffff",
//   tableHeader: "#f1f5f9",
//   rowOdd: "#ffffff",
//   rowEven: "#f8fafc",
//   accent: "#fbbf24",      // Amber
//   danger: "#ef4444",
//   success: "#22c55e",
//   border: "#e2e8f0"
// };

// // Standard Fonts (No crash risk)
// const FONTS = {
//   bold: "Helvetica-Bold",
//   regular: "Helvetica",
//   mono: "Courier"
// };

// // --- HELPERS ---
// const formatCurrency = (amount) => {
//   return parseFloat(amount || 0).toLocaleString("en-IN", {
//     style: "currency",
//     currency: "INR",
//     minimumFractionDigits: 2
//   });
// };

// const formatDate = (date) => {
//   if (!date) return "";
//   return new Date(date).toLocaleDateString("en-IN", {
//     day: "2-digit",
//     month: "short",
//     year: "numeric",
//   });
// };

// // Words with Paise support
// const amountToWords = (amount) => {
//     const total = parseFloat(amount || 0);
//     const rupees = Math.floor(total);
//     const paise = Math.round((total - rupees) * 100);
    
//     let words = toWords(rupees) + " Rupees";
//     if (paise > 0) words += " and " + toWords(paise) + " Paise";
//     return words + " Only";
// };

// /**
//  * GENERATE PDF BUFFER
//  */
// exports.generateInvoicePDFBuffer = async (invoice, organization) => {
//   if (!invoice || !organization) throw new AppError("Missing data", 400);

//   return new Promise((resolve, reject) => {
//     const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
//     const chunks = [];

//     doc.on("data", (chunk) => chunks.push(chunk));
//     doc.on("end", () => resolve(Buffer.concat(chunks)));
//     doc.on("error", reject);

//     // ==============================
//     // 1. HEADER (Modern Blue)
//     // ==============================
//     const headerHeight = 180;
//     doc.rect(0, 0, PAGE.width, headerHeight).fill(COLORS.primary);
    
//     // Accents
//     doc.save();
//     doc.circle(PAGE.width, 0, 100).fillOpacity(0.1).fill(COLORS.white);
//     doc.circle(0, headerHeight, 60).fillOpacity(0.1).fill(COLORS.white);
//     doc.restore();

//     let y = 50;
//     const margin = PAGE.margin;

//     // Title
//     doc.fillColor(COLORS.white).font(FONTS.bold).fontSize(32).text("INVOICE", margin, y);

//     y += 40;
//     doc.fontSize(10).font(FONTS.regular).fillColor(COLORS.white).fillOpacity(0.9);
//     doc.text("DATE:", margin, y);
//     doc.font(FONTS.bold).text(formatDate(invoice.invoiceDate), margin + 40, y);

//     y += 15;
//     doc.font(FONTS.regular).text("NO:", margin, y);
//     doc.font(FONTS.bold).text(`#${invoice.invoiceNumber}`, margin + 40, y);

//     // Organization Info (Right Aligned)
//     // Logic: Prefer Branch Address -> Org Address -> "N/A"
//     const branch = invoice.branchId || {};
//     let fullAddress = "Address Not Available";
    
//     if (branch.address && typeof branch.address === 'object') {
//         const { street, city, state, zipCode, country } = branch.address;
//         fullAddress = [street, city, state, zipCode, country].filter(Boolean).join(", ");
//     } else if (organization.address) {
//         fullAddress = typeof organization.address === 'string' ? organization.address : "Address Not Available";
//     }

//     let rightY = 50;
//     doc.fillColor(COLORS.white).fillOpacity(1).font(FONTS.bold).fontSize(18);
//     doc.text(organization.name.toUpperCase(), 0, rightY, { align: "right", width: PAGE.width - margin });

//     rightY += 25;
//     doc.fontSize(9).font(FONTS.regular).fillOpacity(0.8);
//     doc.text(fullAddress, 0, rightY, { align: "right", width: PAGE.width - margin });

//     rightY += 12;
//     if (organization.primaryEmail) {
//         doc.text(organization.primaryEmail, 0, rightY, { align: "right", width: PAGE.width - margin });
//     }
//     rightY += 12;
//     if (organization.gstNumber) {
//         doc.text(`GSTIN: ${organization.gstNumber}`, 0, rightY, { align: "right", width: PAGE.width - margin });
//     }

//     // ==============================
//     // 2. FLOATING CARD (Bill To)
//     // ==============================
//     const cardY = 140;
//     const cardHeight = 100;
//     const cardWidth = PAGE.width - (margin * 2);

//     // Shadow & Card
//     doc.roundedRect(margin + 3, cardY + 3, cardWidth, cardHeight, 8).fill("#00000010");
//     doc.roundedRect(margin, cardY, cardWidth, cardHeight, 8).fill(COLORS.white);

//     const innerY = cardY + 20;
//     const customer = invoice.customerId || {};

//     // Customer Details
//     doc.fillColor(COLORS.textGray).font(FONTS.bold).fontSize(8).text("BILL TO:", margin + 20, innerY);
//     doc.fillColor(COLORS.primary).font(FONTS.bold).fontSize(12).text(customer.name || "Customer", margin + 20, innerY + 15);
//     doc.fillColor(COLORS.textDark).font(FONTS.regular).fontSize(9);
//     if (customer.phone) doc.text(`Phone: ${customer.phone}`, margin + 20, innerY + 32);
//     if (customer.email) doc.text(`Email: ${customer.email}`, margin + 20, innerY + 46);

//     // Status Badge & Total
//     const badgeWidth = 100;
//     const badgeX = margin + cardWidth - badgeWidth - 20;
//     const status = (invoice.paymentStatus || "unpaid").toUpperCase();
//     const statusColor = status === "PAID" ? COLORS.success : COLORS.danger;

//     doc.save();
//     doc.roundedRect(badgeX, innerY, badgeWidth, 20, 10).fill(statusColor);
//     doc.fillColor(COLORS.white).font(FONTS.bold).fontSize(8).text(status, badgeX, innerY + 6, { width: badgeWidth, align: "center" });
//     doc.restore();

//     doc.fillColor(COLORS.textGray).font(FONTS.bold).fontSize(8).text("AMOUNT DUE", badgeX, innerY + 35, { width: badgeWidth, align: "right" });
//     doc.fillColor(COLORS.textDark).font(FONTS.bold).fontSize(16).text(formatCurrency(invoice.grandTotal), badgeX - 50, innerY + 48, { width: badgeWidth + 50, align: "right" });

//     // ==============================
//     // 3. TABLE
//     // ==============================
//     y = 280;
//     const headers = [
//         { label: "#", x: margin, width: 30, align: "left" },
//         { label: "ITEM DESCRIPTION", x: margin + 40, width: 220, align: "left" },
//         { label: "PRICE", x: 330, width: 70, align: "right" },
//         { label: "QTY", x: 410, width: 40, align: "center" },
//         { label: "TOTAL", x: 470, width: 80, align: "right" }
//     ];

//     const drawHeaders = (topY) => {
//         doc.rect(margin, topY - 5, PAGE.width - (margin * 2), 20).fill(COLORS.tableHeader);
//         doc.fillColor(COLORS.textDark).font(FONTS.bold).fontSize(8);
//         headers.forEach(h => doc.text(h.label, h.x, topY, { width: h.width, align: h.align }));
//     };

//     drawHeaders(y);
//     y += 25;

//     doc.font(FONTS.regular).fontSize(9);

//     (invoice.items || []).forEach((item, i) => {
//         // Zebra Stripe
//         if (i % 2 !== 0) doc.rect(margin, y - 8, PAGE.width - (margin * 2), 35).fill(COLORS.rowEven);

//         const itemName = item.name || item.productId?.name || "Item";
        
//         doc.fillColor(COLORS.textDark);
//         doc.text((i + 1).toString(), headers[0].x, y, { width: headers[0].width, align: "left" });
//         doc.font(FONTS.bold).text(itemName, headers[1].x, y, { width: headers[1].width, align: "left" });
//         doc.font(FONTS.regular);
//         doc.text(formatCurrency(item.price), headers[2].x, y, { width: headers[2].width, align: "right" });
//         doc.text(item.quantity, headers[3].x, y, { width: headers[3].width, align: "center" });
//         doc.font(FONTS.bold).text(formatCurrency(item.price * item.quantity), headers[4].x, y, { width: headers[4].width, align: "right" });

//         y += 35;

//         // 🛡️ CRASH PROTECTION: Auto-Pagination
//         if (y > PAGE.height - 150) { 
//             doc.addPage(); 
//             y = 50; 
//             drawHeaders(y); 
//             y += 25; 
//         }
//     });

//     doc.moveTo(margin, y).lineTo(PAGE.width - margin, y).strokeColor(COLORS.primary).lineWidth(1).stroke();
//     y += 20;

//     // ==============================
//     // 4. TOTALS & BANK
//     // ==============================
    
//     // Totals (Right)
//     const rightColX = 350;
//     const valColX = 480;
//     let totalY = y;

//     const drawRow = (l, v, isBold = false) => {
//         doc.font(isBold ? FONTS.bold : FONTS.regular).fontSize(isBold ? 10 : 9).fillColor(COLORS.textDark);
//         doc.text(l, rightColX, totalY, { width: 120, align: "right" });
//         doc.text(v, valColX, totalY, { width: 70, align: "right" });
//         totalY += isBold ? 25 : 18;
//     };

//     drawRow("Sub Total", formatCurrency(invoice.subTotal));
//     if (invoice.totalDiscount) drawRow("Discount", `-${formatCurrency(invoice.totalDiscount)}`);
//     drawRow("Tax", formatCurrency(invoice.totalTax));
    
//     totalY += 5;
//     doc.roundedRect(rightColX + 20, totalY - 5, 180, 30, 15).fill(COLORS.accent);
//     doc.fillColor(COLORS.textDark).font(FONTS.bold).fontSize(11).text("GRAND TOTAL", rightColX + 40, totalY + 4);
//     doc.text(formatCurrency(invoice.grandTotal), valColX, totalY + 4, { width: 70, align: "right" });

//     // Bank Details (Left) - DYNAMIC
//     let bankY = y;
//     doc.font(FONTS.bold).fontSize(9).fillColor(COLORS.primary).text("BANK DETAILS", margin, bankY);
//     bankY += 15;
//     doc.roundedRect(margin, bankY, 250, 60, 5).strokeColor(COLORS.border).lineWidth(1).stroke();

//     const bank = organization.bankDetails || {
//         bankName: "Setup in Settings",
//         accountNumber: "----",
//         ifsc: "----",
//         upiId: organization.phone ? `${organization.phone}@upi` : "N/A"
//     };

//     const details = [
//         { l: "Bank", v: bank.bankName },
//         { l: "Acc No", v: bank.accountNumber },
//         { l: "IFSC", v: bank.ifsc },
//         { l: "UPI", v: bank.upiId }
//     ];

//     let by = bankY + 10;
//     doc.font(FONTS.regular).fontSize(8).fillColor(COLORS.textDark);
//     details.forEach(d => {
//         doc.text(d.l, margin + 10, by, { width: 60 });
//         doc.font(FONTS.bold).text(`:  ${d.v}`, margin + 70, by);
//         doc.font(FONTS.regular);
//         by += 12;
//     });

//     // Words
//     by += 25;
//     doc.font(FONTS.bold).fontSize(8).fillColor(COLORS.textGray).text("AMOUNT IN WORDS:", margin, by);
//     doc.font(FONTS.regular).fillColor(COLORS.textDark).text(amountToWords(invoice.grandTotal).toUpperCase(), margin + 90, by);

//     // ==============================
//     // 5. FOOTER
//     // ==============================
//     const footerY = PAGE.height - 100;
//     const sigX = PAGE.width - margin - 120;
    
//     doc.moveTo(sigX, footerY + 30).lineTo(PAGE.width - margin, footerY + 30).strokeColor(COLORS.textDark).lineWidth(1).stroke();
//     doc.font(FONTS.bold).fontSize(9).text(organization.name, sigX, footerY + 35, { align: "center", width: 120 });
//     doc.font(FONTS.regular).fontSize(7).fillColor(COLORS.textGray).text("Authorized Signatory", sigX, footerY + 48, { align: "center", width: 120 });

//     doc.end();
//   });
// };