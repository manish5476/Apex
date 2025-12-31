const PDFDocument = require("pdfkit");
const { toWords } = require("number-to-words");
const AppError = require("../utils/appError");

// --- CONFIGURATION ---
const PAGE = { width: 595.28, height: 841.89, margin: 40 };
const COLORS = {
  primary: "#005b96",     // Brand Blue
  secondary: "#003d66",   // Dark Blue
  textDark: "#1f2937",    // Black/Gray
  textGray: "#64748b",    // Muted
  white: "#ffffff",
  tableHeader: "#f1f5f9",
  rowOdd: "#ffffff",
  rowEven: "#f8fafc",
  accent: "#fbbf24",      // Amber
  danger: "#ef4444",
  success: "#22c55e",
  border: "#e2e8f0"
};

// Standard Fonts (No crash risk)
const FONTS = {
  bold: "Helvetica-Bold",
  regular: "Helvetica",
  mono: "Courier"
};

// --- HELPERS ---
const formatCurrency = (amount) => {
  return parseFloat(amount || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2
  });
};

const formatDate = (date) => {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

// Words with Paise support
const amountToWords = (amount) => {
    const total = parseFloat(amount || 0);
    const rupees = Math.floor(total);
    const paise = Math.round((total - rupees) * 100);
    
    let words = toWords(rupees) + " Rupees";
    if (paise > 0) words += " and " + toWords(paise) + " Paise";
    return words + " Only";
};

/**
 * GENERATE PDF BUFFER
 */
exports.generateInvoicePDFBuffer = async (invoice, organization) => {
  if (!invoice || !organization) throw new AppError("Missing data", 400);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ==============================
    // 1. HEADER (Modern Blue)
    // ==============================
    const headerHeight = 180;
    doc.rect(0, 0, PAGE.width, headerHeight).fill(COLORS.primary);
    
    // Accents
    doc.save();
    doc.circle(PAGE.width, 0, 100).fillOpacity(0.1).fill(COLORS.white);
    doc.circle(0, headerHeight, 60).fillOpacity(0.1).fill(COLORS.white);
    doc.restore();

    let y = 50;
    const margin = PAGE.margin;

    // Title
    doc.fillColor(COLORS.white).font(FONTS.bold).fontSize(32).text("INVOICE", margin, y);

    y += 40;
    doc.fontSize(10).font(FONTS.regular).fillColor(COLORS.white).fillOpacity(0.9);
    doc.text("DATE:", margin, y);
    doc.font(FONTS.bold).text(formatDate(invoice.invoiceDate), margin + 40, y);

    y += 15;
    doc.font(FONTS.regular).text("NO:", margin, y);
    doc.font(FONTS.bold).text(`#${invoice.invoiceNumber}`, margin + 40, y);

    // Organization Info (Right Aligned)
    // Logic: Prefer Branch Address -> Org Address -> "N/A"
    const branch = invoice.branchId || {};
    let fullAddress = "Address Not Available";
    
    if (branch.address && typeof branch.address === 'object') {
        const { street, city, state, zipCode, country } = branch.address;
        fullAddress = [street, city, state, zipCode, country].filter(Boolean).join(", ");
    } else if (organization.address) {
        fullAddress = typeof organization.address === 'string' ? organization.address : "Address Not Available";
    }

    let rightY = 50;
    doc.fillColor(COLORS.white).fillOpacity(1).font(FONTS.bold).fontSize(18);
    doc.text(organization.name.toUpperCase(), 0, rightY, { align: "right", width: PAGE.width - margin });

    rightY += 25;
    doc.fontSize(9).font(FONTS.regular).fillOpacity(0.8);
    doc.text(fullAddress, 0, rightY, { align: "right", width: PAGE.width - margin });

    rightY += 12;
    if (organization.primaryEmail) {
        doc.text(organization.primaryEmail, 0, rightY, { align: "right", width: PAGE.width - margin });
    }
    rightY += 12;
    if (organization.gstNumber) {
        doc.text(`GSTIN: ${organization.gstNumber}`, 0, rightY, { align: "right", width: PAGE.width - margin });
    }

    // ==============================
    // 2. FLOATING CARD (Bill To)
    // ==============================
    const cardY = 140;
    const cardHeight = 100;
    const cardWidth = PAGE.width - (margin * 2);

    // Shadow & Card
    doc.roundedRect(margin + 3, cardY + 3, cardWidth, cardHeight, 8).fill("#00000010");
    doc.roundedRect(margin, cardY, cardWidth, cardHeight, 8).fill(COLORS.white);

    const innerY = cardY + 20;
    const customer = invoice.customerId || {};

    // Customer Details
    doc.fillColor(COLORS.textGray).font(FONTS.bold).fontSize(8).text("BILL TO:", margin + 20, innerY);
    doc.fillColor(COLORS.primary).font(FONTS.bold).fontSize(12).text(customer.name || "Customer", margin + 20, innerY + 15);
    doc.fillColor(COLORS.textDark).font(FONTS.regular).fontSize(9);
    if (customer.phone) doc.text(`Phone: ${customer.phone}`, margin + 20, innerY + 32);
    if (customer.email) doc.text(`Email: ${customer.email}`, margin + 20, innerY + 46);

    // Status Badge & Total
    const badgeWidth = 100;
    const badgeX = margin + cardWidth - badgeWidth - 20;
    const status = (invoice.paymentStatus || "unpaid").toUpperCase();
    const statusColor = status === "PAID" ? COLORS.success : COLORS.danger;

    doc.save();
    doc.roundedRect(badgeX, innerY, badgeWidth, 20, 10).fill(statusColor);
    doc.fillColor(COLORS.white).font(FONTS.bold).fontSize(8).text(status, badgeX, innerY + 6, { width: badgeWidth, align: "center" });
    doc.restore();

    doc.fillColor(COLORS.textGray).font(FONTS.bold).fontSize(8).text("AMOUNT DUE", badgeX, innerY + 35, { width: badgeWidth, align: "right" });
    doc.fillColor(COLORS.textDark).font(FONTS.bold).fontSize(16).text(formatCurrency(invoice.grandTotal), badgeX - 50, innerY + 48, { width: badgeWidth + 50, align: "right" });

    // ==============================
    // 3. TABLE
    // ==============================
    y = 280;
    const headers = [
        { label: "#", x: margin, width: 30, align: "left" },
        { label: "ITEM DESCRIPTION", x: margin + 40, width: 220, align: "left" },
        { label: "PRICE", x: 330, width: 70, align: "right" },
        { label: "QTY", x: 410, width: 40, align: "center" },
        { label: "TOTAL", x: 470, width: 80, align: "right" }
    ];

    const drawHeaders = (topY) => {
        doc.rect(margin, topY - 5, PAGE.width - (margin * 2), 20).fill(COLORS.tableHeader);
        doc.fillColor(COLORS.textDark).font(FONTS.bold).fontSize(8);
        headers.forEach(h => doc.text(h.label, h.x, topY, { width: h.width, align: h.align }));
    };

    drawHeaders(y);
    y += 25;

    doc.font(FONTS.regular).fontSize(9);

    (invoice.items || []).forEach((item, i) => {
        // Zebra Stripe
        if (i % 2 !== 0) doc.rect(margin, y - 8, PAGE.width - (margin * 2), 35).fill(COLORS.rowEven);

        const itemName = item.name || item.productId?.name || "Item";
        
        doc.fillColor(COLORS.textDark);
        doc.text((i + 1).toString(), headers[0].x, y, { width: headers[0].width, align: "left" });
        doc.font(FONTS.bold).text(itemName, headers[1].x, y, { width: headers[1].width, align: "left" });
        doc.font(FONTS.regular);
        doc.text(formatCurrency(item.price), headers[2].x, y, { width: headers[2].width, align: "right" });
        doc.text(item.quantity, headers[3].x, y, { width: headers[3].width, align: "center" });
        doc.font(FONTS.bold).text(formatCurrency(item.price * item.quantity), headers[4].x, y, { width: headers[4].width, align: "right" });

        y += 35;

        // 🛡️ CRASH PROTECTION: Auto-Pagination
        if (y > PAGE.height - 150) { 
            doc.addPage(); 
            y = 50; 
            drawHeaders(y); 
            y += 25; 
        }
    });

    doc.moveTo(margin, y).lineTo(PAGE.width - margin, y).strokeColor(COLORS.primary).lineWidth(1).stroke();
    y += 20;

    // ==============================
    // 4. TOTALS & BANK
    // ==============================
    
    // Totals (Right)
    const rightColX = 350;
    const valColX = 480;
    let totalY = y;

    const drawRow = (l, v, isBold = false) => {
        doc.font(isBold ? FONTS.bold : FONTS.regular).fontSize(isBold ? 10 : 9).fillColor(COLORS.textDark);
        doc.text(l, rightColX, totalY, { width: 120, align: "right" });
        doc.text(v, valColX, totalY, { width: 70, align: "right" });
        totalY += isBold ? 25 : 18;
    };

    drawRow("Sub Total", formatCurrency(invoice.subTotal));
    if (invoice.totalDiscount) drawRow("Discount", `-${formatCurrency(invoice.totalDiscount)}`);
    drawRow("Tax", formatCurrency(invoice.totalTax));
    
    totalY += 5;
    doc.roundedRect(rightColX + 20, totalY - 5, 180, 30, 15).fill(COLORS.accent);
    doc.fillColor(COLORS.textDark).font(FONTS.bold).fontSize(11).text("GRAND TOTAL", rightColX + 40, totalY + 4);
    doc.text(formatCurrency(invoice.grandTotal), valColX, totalY + 4, { width: 70, align: "right" });

    // Bank Details (Left) - DYNAMIC
    let bankY = y;
    doc.font(FONTS.bold).fontSize(9).fillColor(COLORS.primary).text("BANK DETAILS", margin, bankY);
    bankY += 15;
    doc.roundedRect(margin, bankY, 250, 60, 5).strokeColor(COLORS.border).lineWidth(1).stroke();

    const bank = organization.bankDetails || {
        bankName: "Setup in Settings",
        accountNumber: "----",
        ifsc: "----",
        upiId: organization.phone ? `${organization.phone}@upi` : "N/A"
    };

    const details = [
        { l: "Bank", v: bank.bankName },
        { l: "Acc No", v: bank.accountNumber },
        { l: "IFSC", v: bank.ifsc },
        { l: "UPI", v: bank.upiId }
    ];

    let by = bankY + 10;
    doc.font(FONTS.regular).fontSize(8).fillColor(COLORS.textDark);
    details.forEach(d => {
        doc.text(d.l, margin + 10, by, { width: 60 });
        doc.font(FONTS.bold).text(`:  ${d.v}`, margin + 70, by);
        doc.font(FONTS.regular);
        by += 12;
    });

    // Words
    by += 25;
    doc.font(FONTS.bold).fontSize(8).fillColor(COLORS.textGray).text("AMOUNT IN WORDS:", margin, by);
    doc.font(FONTS.regular).fillColor(COLORS.textDark).text(amountToWords(invoice.grandTotal).toUpperCase(), margin + 90, by);

    // ==============================
    // 5. FOOTER
    // ==============================
    const footerY = PAGE.height - 100;
    const sigX = PAGE.width - margin - 120;
    
    doc.moveTo(sigX, footerY + 30).lineTo(PAGE.width - margin, footerY + 30).strokeColor(COLORS.textDark).lineWidth(1).stroke();
    doc.font(FONTS.bold).fontSize(9).text(organization.name, sigX, footerY + 35, { align: "center", width: 120 });
    doc.font(FONTS.regular).fontSize(7).fillColor(COLORS.textGray).text("Authorized Signatory", sigX, footerY + 48, { align: "center", width: 120 });

    doc.end();
  });
};