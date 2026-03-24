const PDFDocument = require("pdfkit");
const { toWords } = require("number-to-words");
const AppError = require("../../../../core/utils/api/appError");

// ─── DESIGN SYSTEM ────────────────────────────────────────────────────────────
const W = 595.28;
const H = 841.89;
const MARGIN = 48;

// Palette — obsidian & gold, matches Invoice
const C = {
  pageBg:      "#F7F8FA",
  cardBg:      "#FFFFFF",
  headerBg:    "#0A0F1E",   // deep navy-black
  accentStrip: "#0D1526",
  inkPrimary:  "#0A0F1E",
  inkSecondary:"#6B7280",
  inkMuted:    "#9CA3AF",
  gold:        "#C9A84C",   // true 22k gold
  goldLight:   "#F0D98B",
  success:     "#059669",
  border:      "#E5E7EB",
  rowAlt:      "#F9FAFB",
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

const hRule = (doc, x, y, w, color = C.border, thickness = 0.5) =>
  doc.moveTo(x, y).lineTo(x + w, y).strokeColor(color).lineWidth(thickness).stroke();

const goldRule = (doc, x, y, w) =>
  doc.moveTo(x, y).lineTo(x + w, y).strokeColor(C.gold).lineWidth(1.5).stroke();

const badge = (doc, x, y, w, h, fillColor, label, textColor = C.white, fontSize = 7.5) => {
  doc.roundedRect(x, y, w, h, h / 2).fill(fillColor);
  doc.font(F.bold).fontSize(fontSize).fillColor(textColor)
     .text(label, x, y + (h / 2) - (fontSize * 0.42), { width: w, align: "center" });
};

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
exports.generatePaymentSlipBuffer = async (payment, organization) => {
  if (!payment || !organization) throw new AppError("Missing data", 400);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      bufferPages: true,
      compress: true,
      info: {
        Title: `Payment Receipt - ${payment._id.toString().slice(-6).toUpperCase()}`,
        Author: organization.name,
      },
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Data Preparation
    const branch   = payment.branchId || {};
    const org      = organization;
    const receiptNo = payment._id.toString().slice(-6).toUpperCase();
    const status    = "SUCCESSFUL";

    // ── Page background ───────────────────────────────────────────
    doc.rect(0, 0, W, H).fill(C.pageBg);

    // ── White card shadow ─────────────────────────────────────────
    doc.rect(MARGIN + 2, 42, W - MARGIN * 2, H - 180).fill("#E8EBF0");
    // White card
    doc.rect(MARGIN, 40, W - MARGIN * 2, H - 178).fill(C.white);

    const CX = MARGIN;
    const CW = W - MARGIN * 2;

    // ── HEADER BAND ───────────────────────────────────────────────
    const HEADER_H = 110;
    doc.rect(CX, 40, CW, HEADER_H).fill(C.headerBg);

    // Subtle grid texture
    doc.save();
    doc.rect(CX, 40, CW, HEADER_H).clip();
    doc.strokeColor("#FFFFFF").lineWidth(0.12).opacity(0.04);
    for (let gx = CX; gx < CX + CW; gx += 18) doc.moveTo(gx, 40).lineTo(gx, 40 + HEADER_H).stroke();
    for (let gy = 40; gy < 40 + HEADER_H; gy += 18) doc.moveTo(CX, gy).lineTo(CX + CW, gy).stroke();
    doc.restore();

    // Gold accent bar
    doc.rect(CX, 40, CW, 3).fill(C.gold);

    // Org name
    doc.font(F.bold).fontSize(18).fillColor(C.white)
       .text(org.name.toUpperCase(), CX + 28, 62, { characterSpacing: 1.5 });

    // "PAYMENT RECEIPT" label — ghosted
    doc.font(F.bold).fontSize(30).fillColor(C.white).opacity(0.06)
       .text("RECEIPT", CX + CW - 210, 56, { width: 190, align: "right", characterSpacing: 4 });
    doc.opacity(1);

    // Receipt number + date
    doc.font(F.bold).fontSize(10).fillColor(C.gold)
       .text(`RECEIPT #${receiptNo}`, CX + CW - 210, 58, { width: 190, align: "right" });
    doc.font(F.reg).fontSize(7.5).fillColor("rgba(255,255,255,0.5)")
       .text(fmtDate(payment.paymentDate), CX + CW - 210, 74, { width: 190, align: "right" });

    // Status badge
    badge(doc, CX + CW - 100, 40 + HEADER_H - 32, 76, 20, "#1A4A38", status, C.success, 8);

    // ── META STRIP ────────────────────────────────────────────────
    const STRIP_Y = 40 + HEADER_H;
    doc.rect(CX, STRIP_Y, CW, 28).fill("#F0F4F8");
    hRule(doc, CX, STRIP_Y, CW, C.border, 0.5);
    hRule(doc, CX, STRIP_Y + 28, CW, C.border, 0.5);

    const metaItems = [
      { label: "METHOD", value: (payment.paymentMethod || "Cash").toUpperCase() },
      { label: "REF ID", value: payment.transactionId || payment.referenceNumber || "N/A" },
      { label: "TYPE",   value: (payment.type || "Inflow").toUpperCase() },
      { label: "STATUS", value: status, color: C.success },
    ];

    const metaColW = CW / metaItems.length;
    metaItems.forEach((m, i) => {
      const mx = CX + i * metaColW;
      doc.font(F.reg).fontSize(6.5).fillColor(C.inkMuted).text(m.label, mx + 14, STRIP_Y + 6);
      doc.font(F.bold).fontSize(8).fillColor(m.color || C.inkPrimary).text(m.value, mx + 14, STRIP_Y + 15);
      if (i > 0) doc.moveTo(mx, STRIP_Y + 6).lineTo(mx, STRIP_Y + 22).strokeColor(C.border).lineWidth(0.5).stroke();
    });

    // ── RECEIVED FROM ─────────────────────────────────────────────
    let y = STRIP_Y + 28 + 30;
    const billX = CX + 18;
    
    doc.font(F.bold).fontSize(6.5).fillColor(C.gold).text("RECEIVED FROM", billX, y, { characterSpacing: 1.2 });
    goldRule(doc, billX, y + 11, 28);
    y += 22;

    doc.font(F.bold).fontSize(11).fillColor(C.inkPrimary).text(payment.customerId?.name || "Customer", billX, y);
    y += 15;
    if (payment.customerId?.phone || payment.customerId?.email) {
        doc.font(F.reg).fontSize(9).fillColor(C.inkSecondary);
        const contact = [payment.customerId?.phone, payment.customerId?.email].filter(Boolean).join("   ·   ");
        doc.text(contact, billX, y);
        y += 20;
    }

    // ── PAYMENT BOX ───────────────────────────────────────────────
    y += 20;
    const boxW = CW - 36;
    doc.rect(CX + 18, y, boxW, 80).fill("#F9FAFB");
    doc.rect(CX + 18, y, boxW, 2).fill(C.gold);
    
    doc.font(F.bold).fontSize(8).fillColor(C.inkMuted).text("AMOUNT RECEIVED", CX + 18, y + 20, { width: boxW, align: "center" });
    doc.font(F.bold).fontSize(28).fillColor(C.inkPrimary).text(money(payment.amount), CX + 18, y + 35, { width: boxW, align: "center" });
    
    y += 100;

    // Amount in words
    const words = toWords(parseInt(payment.amount)).toUpperCase();
    doc.font(F.oblique).fontSize(7.5).fillColor(C.inkMuted)
       .text(`${words} RUPEES ONLY`, CX + 18, y, { width: CW - 36, align: "center" });

    // ── FOOTER ────────────────────────────────────────────────────
    const FOOTER_Y = H - 110;
    doc.rect(CX, FOOTER_Y - 8, CW, 50).fill(C.headerBg);
    doc.rect(CX, FOOTER_Y - 8, CW, 2).fill(C.gold);

    doc.font(F.reg).fontSize(7.5).fillColor("rgba(255,255,255,0.4)")
       .text("Thank you for your payment.", CX + 18, FOOTER_Y + 4);

    const sigX = CX + CW - 160;
    doc.moveTo(sigX, FOOTER_Y + 4).lineTo(sigX + 120, FOOTER_Y + 4).strokeColor(C.gold).lineWidth(0.5).stroke();
    doc.font(F.bold).fontSize(8).fillColor(C.white).text(org.name, sigX, FOOTER_Y + 9, { width: 120, align: "center" });
    doc.font(F.reg).fontSize(6.5).fillColor("rgba(255,255,255,0.4)").text("Authorised Signatory", sigX, FOOTER_Y + 21, { width: 120, align: "center" });

    doc.end();
  });
};