// src/utils/invoiceTemplate.js
const PDFDocument = require("pdfkit");
const { toWords } = require("number-to-words");
const AppError = require("./appError");

// --- CONFIGURATION ---
const PAGE = { width: 595.28, height: 841.89, margin: 40 };
const COLORS = {
  primary: "#005b96",     // Main Brand Blue
  secondary: "#003d66",   // Darker Blue for contrast
  textDark: "#1f2937",    // Slate 900
  textGray: "#64748b",    // Slate 500
  white: "#ffffff",
  tableHeader: "#f1f5f9", // Light Gray
  rowOdd: "#ffffff",
  rowEven: "#f8fafc",     // Very subtle blue-gray
  accent: "#fbbf24",      // Amber for Grand Total (High Visibility)
  danger: "#ef4444",      // Red for Unpaid
  success: "#22c55e"      // Green for Paid
};

const FONTS = {
  bold: "Helvetica-Bold",
  regular: "Helvetica",
  mono: "Courier" // Good for numbers/IDs
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

/**
 * GENERATE PDF BUFFER
 */
exports.generateInvoicePDFBuffer = async (invoice, organization) => {
  if (!invoice || !organization)
    throw new AppError("Missing invoice or organization data", 400);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ==============================
    // 1. HEADER SECTION (Deep Blue)
    // ==============================
    const headerHeight = 180;
    
    // Gradient-like effect using two rects
    doc.rect(0, 0, PAGE.width, headerHeight).fill(COLORS.primary);
    doc.save();
    // Add a subtle geometric accent design
    doc.circle(PAGE.width, 0, 100).fillOpacity(0.1).fill(COLORS.white);
    doc.circle(0, headerHeight, 60).fillOpacity(0.1).fill(COLORS.white);
    doc.restore();

    let y = 50;
    const margin = PAGE.margin;

    // Left: Title & Date
    doc.fillColor(COLORS.white).font(FONTS.bold).fontSize(32).text("INVOICE", margin, y);
    
    y += 40;
    doc.fontSize(10).font(FONTS.regular).fillColor(COLORS.white).fillOpacity(0.9);
    doc.text("DATE:", margin, y);
    doc.font(FONTS.bold).text(formatDate(invoice.invoiceDate), margin + 40, y);
    
    y += 15;
    doc.font(FONTS.regular).text("NO:", margin, y);
    doc.font(FONTS.bold).text(`#${invoice.invoiceNumber}`, margin + 40, y);

    // Right: Company Details
    // Pull address from Branch if available, else Organization
    const branch = invoice.branchId || {};
    const addressObj = branch.address || {};
    const fullAddress = [addressObj.street, addressObj.city, addressObj.state, addressObj.zipCode, addressObj.country].filter(Boolean).join(", ");

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
    // 2. FLOATING CARD ("Bill To" & Status)
    // ==============================
    const cardY = 140;
    const cardHeight = 100;
    const cardWidth = PAGE.width - (margin * 2);

    // Draw Shadow first (offset gray rect)
    doc.roundedRect(margin + 3, cardY + 3, cardWidth, cardHeight, 8).fill("#00000010");
    // Draw Main White Card
    doc.roundedRect(margin, cardY, cardWidth, cardHeight, 8).fill(COLORS.white);

    // Card Content
    const innerY = cardY + 20;
    
    // -- Left: Customer Info --
    const customer = invoice.customerId || {};
    doc.fillColor(COLORS.textGray).font(FONTS.bold).fontSize(8).text("BILL TO:", margin + 20, innerY);
    
    doc.fillColor(COLORS.primary).font(FONTS.bold).fontSize(12).text(customer.name || "Valued Customer", margin + 20, innerY + 15);
    
    doc.fillColor(COLORS.textDark).font(FONTS.regular).fontSize(9);
    if (customer.phone) doc.text(`Phone: ${customer.phone}`, margin + 20, innerY + 32);
    if (customer.email) doc.text(`Email: ${customer.email}`, margin + 20, innerY + 46);

    // -- Right: Status Badge & Total --
    const badgeWidth = 100;
    const badgeX = margin + cardWidth - badgeWidth - 20;
    
    // Status Badge
    const status = (invoice.paymentStatus || "unpaid").toUpperCase();
    const statusColor = status === "PAID" ? COLORS.success : COLORS.danger;
    
    doc.save();
    doc.roundedRect(badgeX, innerY, badgeWidth, 20, 10).fill(statusColor);
    doc.fillColor(COLORS.white).font(FONTS.bold).fontSize(8).text(status, badgeX, innerY + 6, { width: badgeWidth, align: "center" });
    doc.restore();

    // Grand Total inside Card
    doc.fillColor(COLORS.textGray).font(FONTS.bold).fontSize(8).text("AMOUNT DUE", badgeX, innerY + 35, { width: badgeWidth, align: "right" });
    doc.fillColor(COLORS.textDark).font(FONTS.bold).fontSize(16).text(formatCurrency(invoice.grandTotal), badgeX - 50, innerY + 48, { width: badgeWidth + 50, align: "right" });


    // ==============================
    // 3. ITEMS TABLE
    // ==============================
    y = 280;
    
    // Headers
    const headers = [
        { label: "#", x: margin, width: 30, align: "left" },
        { label: "ITEM DESCRIPTION", x: margin + 40, width: 220, align: "left" },
        { label: "UNIT PRICE", x: 330, width: 70, align: "right" },
        { label: "QTY", x: 410, width: 40, align: "center" },
        { label: "TOTAL", x: 470, width: 80, align: "right" }
    ];

    // Draw Header Background
    doc.rect(margin, y - 5, PAGE.width - (margin * 2), 20).fill(COLORS.tableHeader);
    doc.fillColor(COLORS.textDark).font(FONTS.bold).fontSize(8);
    headers.forEach(h => doc.text(h.label, h.x, y, { width: h.width, align: h.align }));
    
    y += 25;

    // Draw Items
    doc.font(FONTS.regular).fontSize(9);
    
    (invoice.items || []).forEach((item, i) => {
        const isEven = i % 2 === 0;
        const rowHeight = 35;
        
        // Zebra Striping
        if (!isEven) {
            doc.rect(margin, y - 8, PAGE.width - (margin * 2), rowHeight).fill(COLORS.rowEven);
        }

        // Item Data
        const itemName = item.name || item.productId?.name || "Item"; // Prioritize item.name from your data
        
        doc.fillColor(COLORS.textDark);
        doc.text((i + 1).toString(), headers[0].x, y, { width: headers[0].width, align: "left" });
        doc.font(FONTS.bold).text(itemName, headers[1].x, y, { width: headers[1].width, align: "left" });
        doc.font(FONTS.regular); // Reset
        
        doc.text(formatCurrency(item.price || item.rate), headers[2].x, y, { width: headers[2].width, align: "right" });
        doc.text(item.quantity, headers[3].x, y, { width: headers[3].width, align: "center" });
        doc.font(FONTS.bold).text(formatCurrency(item.price * item.quantity), headers[4].x, y, { width: headers[4].width, align: "right" });

        y += rowHeight;

        // Page Break Logic
        if (y > PAGE.height - 150) {
            doc.addPage();
            y = 50;
        }
    });

    // Divider Line
    doc.moveTo(margin, y).lineTo(PAGE.width - margin, y).strokeColor(COLORS.primary).lineWidth(1).stroke();
    y += 20;


    // ==============================
    // 4. TOTALS & BANK INFO
    // ==============================
    
    // -- Right Side: Calculation --
    const rightColX = 350;
    const valColX = 480;
    let totalY = y;

    const drawTotalRow = (label, value, isGrand = false) => {
        doc.font(isGrand ? FONTS.bold : FONTS.regular).fontSize(isGrand ? 10 : 9).fillColor(COLORS.textDark);
        doc.text(label, rightColX, totalY, { width: 120, align: "right" });
        doc.text(value, valColX, totalY, { width: 70, align: "right" });
        totalY += isGrand ? 25 : 18;
    };

    drawTotalRow("Sub Total", formatCurrency(invoice.subTotal));
    if (invoice.totalDiscount > 0) drawTotalRow("Discount", `-${formatCurrency(invoice.totalDiscount)}`);
    drawTotalRow("Tax", formatCurrency(invoice.totalTax));
    
    // Grand Total Pill
    totalY += 5;
    doc.roundedRect(rightColX + 20, totalY - 5, 180, 30, 15).fill(COLORS.accent);
    doc.fillColor(COLORS.textDark).font(FONTS.bold).fontSize(11).text("GRAND TOTAL", rightColX + 40, totalY + 4);
    doc.text(formatCurrency(invoice.grandTotal), valColX, totalY + 4, { width: 70, align: "right" });


    // -- Left Side: Bank Details (Crucial for Indian Businesses) --
    let bankY = y;
    doc.font(FONTS.bold).fontSize(9).fillColor(COLORS.primary).text("BANK DETAILS", margin, bankY);
    bankY += 15;
    
    // Bank Grid Box
    doc.roundedRect(margin, bankY, 250, 60, 5).strokeColor(COLORS.border).lineWidth(1).stroke();
    
    const bankDetails = [
        { label: "Bank", val: "HDFC Bank" }, // Replace with organization.bankName if available
        { label: "Account No", val: "XXXX-XXXX-XXXX" },
        { label: "IFSC Code", val: "HDFC0001234" },
        { label: "UPI ID", val: organization.phone ? `${organization.phone}@upi` : "N/A" }
    ];

    let bx = margin + 10;
    let by = bankY + 10;
    
    doc.font(FONTS.regular).fontSize(8).fillColor(COLORS.textDark);
    bankDetails.forEach(d => {
        doc.text(d.label, bx, by, { width: 60 });
        doc.font(FONTS.bold).text(`:  ${d.val}`, bx + 60, by);
        doc.font(FONTS.regular);
        by += 12;
    });

    // Words
    by += 25;
    doc.font(FONTS.bold).fontSize(8).fillColor(COLORS.textGray).text("AMOUNT IN WORDS:", margin, by);
    const words = toWords(parseInt(invoice.grandTotal));
    doc.font(FONTS.regular).fillColor(COLORS.textDark).text(`${words} Rupees Only`.toUpperCase(), margin + 90, by);


    // ==============================
    // 5. FOOTER
    // ==============================
    const footerY = PAGE.height - 100;
    
    // Terms
    doc.font(FONTS.bold).fontSize(8).fillColor(COLORS.textDark).text("TERMS & CONDITIONS", margin, footerY);
    doc.font(FONTS.regular).fontSize(7).fillColor(COLORS.textGray).text(
        "1. Goods once sold will not be taken back.\n2. Interest @ 18% p.a. will be charged if payment is delayed.\n3. Subject to local jurisdiction.",
        margin, footerY + 15, { width: 300 }
    );

    // Signature Area
    const sigX = PAGE.width - margin - 120;
    doc.moveTo(sigX, footerY + 30).lineTo(PAGE.width - margin, footerY + 30).strokeColor(COLORS.textDark).lineWidth(1).stroke();
    doc.font(FONTS.bold).fontSize(9).fillColor(COLORS.textDark).text(organization.name, sigX, footerY + 35, { align: "center", width: 120 });
    doc.font(FONTS.regular).fontSize(7).fillColor(COLORS.textGray).text("Authorized Signatory", sigX, footerY + 48, { align: "center", width: 120 });

    doc.end();
  });
};

// // src/utils/invoiceTemplate.js
// const PDFDocument = require("pdfkit");
// const { toWords } = require("number-to-words");
// const AppError = require("./appError");

// // --- CONFIGURATION ---
// const PAGE = { width: 595.28, height: 841.89, margin: 40 }; // A4 Standard
// const COLORS = {
//   primaryBlue: "#005b96", // The deep blue from the header
//   textWhite: "#ffffff",
//   textDark: "#111827",    // Almost Black
//   textGray: "#6b7280",    // Cool Gray
//   accentGray: "#e5e7eb",  // Light Gray (Top Total Box)
//   accentYellow: "#d4e157", // The Lime/Yellow pill from image
//   termsBg: "#f3f4f6",     // Background for terms
//   border: "#e5e7eb"
// };

// const FONTS = {
//   bold: "Helvetica-Bold",
//   regular: "Helvetica",
// };

// // --- HELPERS ---
// const formatCurrency = (amount) => {
//   return parseFloat(amount || 0).toLocaleString("en-US", { // Changed to US for $ style in image, change to 'en-IN' for ₹
//     style: "currency",
//     currency: "USD", 
//   });
// };

// const formatDate = (date) => {
//   return new Date(date).toLocaleDateString("en-GB", {
//     day: "2-digit",
//     month: "long",
//     year: "numeric",
//   }); // Result: 10/September/2023
// };

// /**
//  * GENERATE PDF BUFFER
//  */
// exports.generateInvoicePDFBuffer = async (invoice, organization) => {
//   console.log(invoice)
//   if (!invoice || !organization)
//     throw new AppError("Missing invoice or organization data", 400);

//   return new Promise((resolve, reject) => {
//     const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
//     const chunks = [];

//     doc.on("data", (chunk) => chunks.push(chunk));
//     doc.on("end", () => resolve(Buffer.concat(chunks)));
//     doc.on("error", reject);

//     // --- 1. BLUE HEADER BACKGROUND ---
//     // Covers top 25% of the page
//     const headerHeight = 170;
//     doc.rect(0, 0, PAGE.width, headerHeight).fill(COLORS.primaryBlue);

//     // --- 2. HEADER CONTENT ---
//     let y = 50;
//     const margin = PAGE.margin;

//     // Left: "INVOICE" (Huge Text)
//     doc.fillColor(COLORS.textWhite).font(FONTS.bold).fontSize(40);
//     doc.text("INVOICE", margin, y);

//     // Date below Invoice
//     doc.fontSize(9).font(FONTS.regular).fillColor(COLORS.textWhite);
//     doc.text(`DATE    ${formatDate(invoice.invoiceDate)}`, margin, y + 45, { characterSpacing: 1 });

//     // Right: Company Logo/Name
//     doc.fontSize(19).font(FONTS.bold).text(organization.name.toUpperCase(), 0, y + 10, { align: "right", width: PAGE.width - margin });
//     // doc.fontSize(8).font(FONTS.regular).text("♾️", 0, y + 22, { align: "right", width: PAGE.width - margin });
//     // (Optional: Insert Logo image here if you have one)
//     // doc.image('path/to/logo.png', PAGE.width - margin - 50, y - 10, { width: 40 });

//     // --- 3. "INVOICE TO" SECTION (The White Card Effect) ---
//     // We simulate the "Card" by drawing a rounded white rect starting inside the blue area
//     const cardY = 120;
//     const cardHeight = 90;
//     const cardWidth = PAGE.width - (margin * 2);

//     doc.roundedRect(margin, cardY, cardWidth, cardHeight, 10).fill(COLORS.textWhite);

//     // Content Inside the Card
//     const innerY = cardY + 20;
//     const innerX = margin + 20;

//     // Label
//     doc.fillColor(COLORS.textDark).font(FONTS.bold).fontSize(9).text("INVOICE TO :", innerX, innerY);
    
//     // Customer Details (Left Side)
//     const detailX = innerX;
//     const labelWidth = 60;
//     const valX = detailX + labelWidth;

//     // Row 1: Name
//     doc.font(FONTS.bold).fontSize(9).fillColor(COLORS.textDark).text("Name", detailX, innerY + 20);
//     doc.font(FONTS.regular).text(invoice.customerId?.name || "John Doe", valX, innerY + 20);
    
//     // Row 2: Phone (Underline separator above it)
//     doc.moveTo(detailX, innerY + 33).lineTo(detailX + 200, innerY + 33).strokeColor(COLORS.border).lineWidth(0.5).stroke();
//     doc.font(FONTS.bold).fontSize(9).fillColor(COLORS.textDark).text("Phone No", detailX, innerY + 40);
//     doc.font(FONTS.regular).text(invoice.customerId?.phone || "+123-456-7890", valX, innerY + 40);

//     // Top Grand Total Box (Gray Box on Right side of card)
//     const boxWidth = 180;
//     const boxHeight = 60;
//     const boxX = (margin + cardWidth) - boxWidth - 15;
//     const boxY = cardY + 15;

//     doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 8).fill(COLORS.accentGray);
    
//     doc.fillColor(COLORS.textDark).font(FONTS.bold).fontSize(8).text("GRAND TOTAL", boxX, boxY + 15, { width: boxWidth, align: "center" });
//     doc.fontSize(18).text(formatCurrency(invoice.grandTotal || invoice.totalAmount), boxX, boxY + 30, { width: boxWidth, align: "center" });

//     // --- 4. TABLE HEADERS ---
//     y = 240;
//     const colX = { desc: margin, price: 320, qty: 390, sub: 470 };
    
//     doc.font(FONTS.bold).fontSize(8).fillColor(COLORS.textDark);
//     doc.text("ITEM DESCRIPTION", colX.desc, y);
//     doc.text("PRICE", colX.price, y, { width: 60, align: "right" });
//     doc.text("QTY", colX.qty, y, { width: 40, align: "center" });
//     doc.text("SUBTOTAL", colX.sub, y, { width: 80, align: "right" });

//     // Thick Blue Header Line
//     y += 15;
//     doc.moveTo(margin, y).lineTo(PAGE.width - margin, y).strokeColor(COLORS.primaryBlue).lineWidth(1.5).stroke();
//     y += 15;

//     // --- 5. ITEMS LOOP ---
//     doc.font(FONTS.regular).fontSize(9);

//     (invoice.items || []).forEach((item, i) => {
//         const itemName = item.productId?.name || "Service Item";
//         const itemDesc = item.customTitle; // Subtext

//         // Layout: Item Name (Bold), Description (Light) below it
//         doc.font(FONTS.bold).fillColor(COLORS.textDark).fontSize(9);
//         doc.text(itemName, colX.desc, y);
        
//         const nameHeight = doc.heightOfString(itemName);
//         doc.font(FONTS.regular).fillColor(COLORS.textGray).fontSize(8);
//         doc.text(itemDesc, colX.desc, y + nameHeight + 2);

//         const rowHeight = 40; // Fixed height for clean look like image

//         // Numbers
//         doc.font(FONTS.bold).fillColor(COLORS.textDark).fontSize(9);
//         doc.text(formatCurrency(item.rate), colX.price, y + 10, { width: 60, align: "right" });
//         doc.text(item.quantity.toString().padStart(2, '0'), colX.qty, y + 10, { width: 40, align: "center" }); // 01, 02 format
//         doc.text(formatCurrency(item.amount), colX.sub, y + 10, { width: 80, align: "right" });

//         // Underline (Short, leaving gaps, like image)
//         const lineY = y + rowHeight - 10;
//         doc.moveTo(colX.desc, lineY).lineTo(colX.desc + 200, lineY).strokeColor(COLORS.border).lineWidth(1).stroke();
//         doc.moveTo(colX.price, lineY).lineTo(colX.price + 60, lineY).stroke();
//         doc.moveTo(colX.qty, lineY).lineTo(colX.qty + 40, lineY).stroke();
//         doc.moveTo(colX.sub, lineY).lineTo(colX.sub + 80, lineY).stroke();

//         y += rowHeight;
        
//         // Auto Page Break
//         if (y > PAGE.height - 150) {
//             doc.addPage();
//             y = 50;
//         }
//     });

//     // Final Line across full width
//     doc.moveTo(margin, y).lineTo(PAGE.width - margin, y).strokeColor(COLORS.primaryBlue).lineWidth(1).stroke();
//     y += 30;

//     // --- 6. BOTTOM SECTION ---
    
//     // -- LEFT: Payment Methods --
//     const bottomStart = y;
//     doc.font(FONTS.bold).fontSize(9).fillColor(COLORS.textDark).text("Payment Method", margin, y);
//     y += 15;
//     doc.font(FONTS.bold).fontSize(8).text("Payment", margin, y);
//     doc.font(FONTS.regular).fillColor(COLORS.textGray).text("Visa, Mastercard, Paypal", margin + 45, y);
//     y += 12;
//     doc.font(FONTS.bold).fillColor(COLORS.textDark).text("Check", margin, y);
//     doc.font(FONTS.regular).fillColor(COLORS.textGray).text("Not Accepted", margin + 45, y);
    
//     // -- RIGHT: Totals --
//     let totalY = bottomStart;
//     const rightAlignX = 400;
//     const valAlignX = 480;

//     const drawTotalLine = (label, value) => {
//         doc.font(FONTS.bold).fillColor(COLORS.textDark).text(label, rightAlignX, totalY);
//         doc.text(":", rightAlignX + 60, totalY);
//         doc.text(value, valAlignX, totalY, { align: "right", width: 70 });
//         totalY += 20;
//     }

//     drawTotalLine("Subtotal", formatCurrency(invoice.subTotal || invoice.grandTotal));
//     drawTotalLine("Tax %", `${invoice.taxRate || 0}%`);
    
//     // -- THE YELLOW GRAND TOTAL PILL --
//     totalY += 10;
//     const pillWidth = 200;
//     const pillHeight = 30;
//     const pillX = PAGE.width - margin - pillWidth; // Right aligned
//     doc.font(FONTS.bold).fillColor(COLORS.textDark).text("Grand Total", pillX, totalY + 8);
//     // Draw Yellow Pill
//     doc.roundedRect(pillX + 80, totalY, 120, pillHeight, 15).fill(COLORS.accentYellow);
//     doc.fillColor(COLORS.textDark).text(formatCurrency(invoice.grandTotal), pillX + 80, totalY + 8, { width: 120, align: "center" });

//     // --- 7. FOOTER (Terms & Signature) ---
//     const footerY = PAGE.height - 120;

//     // Terms Box (Gray Rounded Bottom Left)
//     doc.roundedRect(margin, footerY, 300, 60, 10).fill(COLORS.termsBg);
//     doc.fillColor(COLORS.textDark).font(FONTS.bold).fontSize(9).text("Terms And Condition", margin + 15, footerY + 15);
//     doc.font(FONTS.regular).fontSize(7).fillColor(COLORS.textGray).text(
//         "Payment is due max 7 days after invoice without deduction.\nThank you for your business.", 
//         margin + 15, 
//         footerY + 30,
//         { width: 270 }
//     );

//     // Signature (Bottom Right)
//     const sigX = PAGE.width - margin - 120; // Adjusted width slightly to fit longer company names
    
//     // Simulate signature line
//     doc.moveTo(sigX, footerY + 30)
//        .lineTo(PAGE.width - margin, footerY + 30)
//        .strokeColor(COLORS.textDark)
//        .lineWidth(1)
//        .stroke();

//     // DYNAMIC SELLER NAME
//     doc.fontSize(9) // Slightly larger for clarity
//        .font(FONTS.bold)
//        .fillColor(COLORS.textDark)
//        .text(organization.name, sigX, footerY + 35, { 
//            align: "center", 
//            width: 120 
//        });

//     // Standard Business Title
//     doc.fontSize(8)
//        .font(FONTS.regular)
//        .fillColor(COLORS.textGray)
//        .text("Authorized Signatory", sigX, footerY + 48, { 
//            align: "center", 
//            width: 120 
//        });

//     doc.end();
//   });
// };