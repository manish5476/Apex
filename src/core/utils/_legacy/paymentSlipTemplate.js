// src/utils/paymentSlipTemplate.js
const PDFDocument = require("pdfkit");
const { toWords } = require("number-to-words");
const AppError = require("../appError");

// --- CONFIGURATION ---
const PAGE = { width: 595.28, height: 841.89, margin: 50 };
const COLORS = {
  primary: "#005b96",     // Brand Blue
  secondary: "#1e293b",   // Dark Slate
  textGray: "#64748b",    // Light Slate
  white: "#ffffff",
  bgLight: "#f1f5f9",
  border: "#e2e8f0",
  success: "#22c55e"      // Green for "Success"
};

const FONTS = {
  bold: "Helvetica-Bold",
  regular: "Helvetica",
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

exports.generatePaymentSlipBuffer = async (payment, organization) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // 1. BLUE HEADER
    doc.rect(0, 0, PAGE.width, 160).fill(COLORS.primary);
    
    // Title
    doc.fillColor(COLORS.white).font(FONTS.bold).fontSize(30)
       .text("PAYMENT RECEIPT", PAGE.margin, 50);
    
    doc.fontSize(10).font(FONTS.regular).fillOpacity(0.9)
       .text(`Receipt No: ${payment._id.toString().slice(-6).toUpperCase()}`, PAGE.margin, 90); // Using last 6 chars of ID as receipt #
    doc.text(`Date: ${formatDate(payment.paymentDate)}`, PAGE.margin, 105);

    // Organization Info (Right Side)
    doc.fillColor(COLORS.white).fillOpacity(1).font(FONTS.bold).fontSize(16);
    doc.text(organization.name.toUpperCase(), 0, 50, { align: "right", width: PAGE.width - PAGE.margin });
    
    // Address from Branch
    const branch = payment.branchId || {};
    const addressObj = branch.address || {};
    const fullAddress = [addressObj.city, addressObj.state, "India"].filter(Boolean).join(", ");
    
    doc.fontSize(9).font(FONTS.regular).fillOpacity(0.9)
       .text(fullAddress, 0, 75, { align: "right", width: PAGE.width - PAGE.margin });
    if(organization.primaryEmail) {
        doc.text(organization.primaryEmail, 0, 90, { align: "right", width: PAGE.width - PAGE.margin });
    }

    let y = 200;

    // 2. AMOUNT RECEIVED BOX
    // A central, prominent box showing the amount
    const boxHeight = 100;
    doc.roundedRect(PAGE.margin, y, PAGE.width - (PAGE.margin * 2), boxHeight, 8)
       .fill(COLORS.bgLight);
    
    const boxCenterY = y + 35;
    doc.fillColor(COLORS.textGray).font(FONTS.bold).fontSize(10)
       .text("AMOUNT RECEIVED", 0, y + 20, { align: "center", width: PAGE.width });
    
    doc.fillColor(COLORS.primary).fontSize(28)
       .text(formatCurrency(payment.amount), 0, boxCenterY, { align: "center", width: PAGE.width });

    doc.fillColor(COLORS.success).fontSize(10)
       .text("Payment Successful", 0, boxCenterY + 35, { align: "center", width: PAGE.width });

    y += 140;

    // 3. PAYMENT DETAILS GRID
    doc.font(FONTS.bold).fontSize(12).fillColor(COLORS.secondary).text("Transaction Details", PAGE.margin, y);
    y += 20;

    const drawRow = (label, value) => {
        doc.rect(PAGE.margin, y, PAGE.width - (PAGE.margin * 2), 35).fill(COLORS.white); // Row bg
        // Bottom border
        doc.moveTo(PAGE.margin, y + 35).lineTo(PAGE.width - PAGE.margin, y + 35).strokeColor(COLORS.border).lineWidth(1).stroke();
        
        doc.font(FONTS.regular).fontSize(10).fillColor(COLORS.textGray)
           .text(label, PAGE.margin + 10, y + 12);
        
        doc.font(FONTS.bold).fillColor(COLORS.secondary)
           .text(value, PAGE.margin, y + 12, { align: "right", width: PAGE.width - (PAGE.margin * 2) - 10 });
        
        y += 35;
    };

    // Customer Name
    drawRow("Received From", payment.customerId?.name || "Customer");
    
    // Payment Mode
    drawRow("Payment Method", (payment.paymentMethod || "Cash").toUpperCase());
    
    // Reference/Transaction ID
    const refNo = payment.transactionId || payment.referenceNumber || "N/A";
    drawRow("Transaction / Ref ID", refNo);

    // Transaction Type
    drawRow("Transaction Type", (payment.type || "Inflow").toUpperCase());

    // Amount in Words
    y += 20;
    const words = toWords(parseInt(payment.amount));
    doc.font(FONTS.bold).fontSize(9).fillColor(COLORS.textGray).text("AMOUNT IN WORDS:", PAGE.margin, y);
    doc.font(FONTS.regular).fillColor(COLORS.secondary).text(`${words} Rupees Only`.toUpperCase(), PAGE.margin + 100, y);


    // 4. FOOTER
    const footerY = PAGE.height - 100;
    
    doc.moveTo(PAGE.width - PAGE.margin - 150, footerY).lineTo(PAGE.width - PAGE.margin, footerY).strokeColor(COLORS.secondary).lineWidth(1).stroke();
    doc.fontSize(9).font(FONTS.bold).text(organization.name, PAGE.width - PAGE.margin - 150, footerY + 10, { align: "center", width: 150 });
    doc.fontSize(8).font(FONTS.regular).fillColor(COLORS.textGray).text("Authorized Signatory", PAGE.width - PAGE.margin - 150, footerY + 22, { align: "center", width: 150 });

    doc.text("Thank you for your payment.", PAGE.margin, footerY + 10);

    doc.end();
  });
};