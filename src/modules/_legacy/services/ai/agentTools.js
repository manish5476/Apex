
const Sales = require("../../../inventory/core/sales.model");
const Product = require("../../../inventory/core/product.model");
const Customer = require("../../../organization/core/customer.model");
const EMI = require("../../../accounting/payments/emi.model");
const Payment = require("../../../accounting/payments/payment.model"); // Ensure this path matches your architecture

// 1. Dynamic Sales Tool
async function salesTool(args) {
  const { startDate, endDate, paymentStatus, invoiceNumber, minAmount, maxAmount, organizationId, branchId } = args;
  if (!organizationId) return { error: "organizationId required" };
  
  const q = { organizationId };
  if (branchId) q.branchId = branchId;
  if (paymentStatus) q.paymentStatus = paymentStatus;
  
  // Dynamic Invoice search
  if (invoiceNumber) q.invoiceNumber = { $regex: invoiceNumber, $options: "i" };
  
  // Dynamic Date Ranges
  if (startDate || endDate) {
    q.createdAt = {};
    if (startDate) q.createdAt.$gte = new Date(startDate);
    if (endDate) q.createdAt.$lte = new Date(endDate);
  }
  
  // Dynamic Amount Filtering
  if (minAmount !== undefined || maxAmount !== undefined) {
    q.totalAmount = {};
    if (minAmount !== undefined) q.totalAmount.$gte = Number(minAmount);
    if (maxAmount !== undefined) q.totalAmount.$lte = Number(maxAmount);
  }

  const rows = await Sales.find(q)
    .select("invoiceNumber totalAmount dueAmount paidAmount createdAt paymentStatus customerId")
    .populate("customerId", "name phone")
    .sort({ createdAt: -1 })
    .lean()
    .limit(100); // Cap for LLM context window safety
    
  const totalRevenue = rows.reduce((s, r) => s + (r.totalAmount || 0), 0);
  const totalDue = rows.reduce((s, r) => s + (r.dueAmount || 0), 0);
  
  return {
    meta: { count: rows.length, totalRevenue, totalDue },
    rows: rows,
  };
}

// 2. Dynamic Product Tool
async function productTool(args) {
  const { searchQuery, inStockOnly, organizationId, branchId } = args;
  if (!organizationId) return { error: "organizationId required" };
  
  const q = { organizationId };
  
  // Multi-field search capability (Name, SKU, or Barcode)
  if (searchQuery) {
    q.$or = [
      { name: { $regex: searchQuery, $options: "i" } },
      { sku: { $regex: searchQuery, $options: "i" } },
      { barcode: { $regex: searchQuery, $options: "i" } }
    ];
  }

  const products = await Product.find(q)
    .select("name sku barcode sellingPrice inventory")
    .lean()
    .limit(50);

  let mapped = products.map((p) => {
    const branchInv = (p.inventory || []).find((i) => String(i.branchId || "") === String(branchId || p.inventory?.[0]?.branchId || ""));
    const totalStock = (p.inventory || []).reduce((s, it) => s + (it.quantity || 0), 0);
    return {
      name: p.name, sku: p.sku, barcode: p.barcode, price: p.sellingPrice, branchStock: branchInv ? branchInv.quantity : 0, totalStock,
    };
  });

  // Dynamic filter for in-stock items only
  if (inStockOnly) {
    mapped = mapped.filter(p => branchId ? p.branchStock > 0 : p.totalStock > 0);
  }

  return { meta: { count: mapped.length }, rows: mapped };
}

// 3. Dynamic Customer Tool (Expanded from customerDuesTool)
async function customerTool(args) {
  const { searchQuery, hasDues, minDues = 0, organizationId } = args;
  if (!organizationId) return { error: "organizationId required" };

  const q = { organizationId };

  // Search by name or phone
  if (searchQuery) {
    q.$or = [
      { name: { $regex: searchQuery, $options: "i" } },
      { phone: { $regex: searchQuery, $options: "i" } }
    ];
  }

  // Dynamic Dues filtering
  if (hasDues || minDues > 0) {
    q.outstandingBalance = { $gt: minDues };
  }

  const customers = await Customer.find(q)
    .select("name phone type outstandingBalance totalPurchases invoiceCount")
    .sort({ outstandingBalance: -1 })
    .limit(50)
    .lean();

  return { meta: { count: customers.length }, rows: customers };
}

// 4. Dynamic EMI Tool
async function emiTool(args) {
  const { status, organizationId } = args;
  if (!organizationId) return { error: "organizationId required" };

  const q = { organizationId };
  if (status) q.status = status;

  const emis = await EMI.find(q)
    .select("customerId totalAmount balanceAmount status installments")
    .populate("customerId", "name phone")
    .limit(50)
    .lean();

  const processedEmis = emis.map(emi => {
    let nextInstallment = null;
    let overdueCount = 0;
    
    if (emi.installments && emi.installments.length > 0) {
      const pending = emi.installments.filter(i => i.paymentStatus !== 'paid');
      
      // Calculate how many installments are actually overdue based on today's date
      overdueCount = pending.filter(i => new Date(i.dueDate) < new Date()).length;

      if (pending.length > 0) {
        nextInstallment = pending.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
      }
    }
    return {
      customerName: emi.customerId?.name,
      customerPhone: emi.customerId?.phone,
      totalAmount: emi.totalAmount,
      balanceAmount: emi.balanceAmount,
      status: emi.status,
      overdueInstallments: overdueCount,
      nextDueDate: nextInstallment ? nextInstallment.dueDate : "None",
      nextDueAmount: nextInstallment ? nextInstallment.totalAmount : 0
    };
  });

  return { meta: { count: processedEmis.length }, rows: processedEmis };
}

// 5. NEW: Dynamic Payment Tool
async function paymentTool(args) {
  const { type, status, method, startDate, endDate, organizationId, branchId } = args;
  if (!organizationId) return { error: "organizationId required" };

  const q = { organizationId };
  if (branchId) q.branchId = branchId;
  if (type) q.type = type; // 'inflow' (received) or 'outflow' (paid)
  if (status) q.status = status;
  if (method) q.paymentMethod = method; // 'cash', 'upi', 'bank', etc.

  if (startDate || endDate) {
    q.paymentDate = {};
    if (startDate) q.paymentDate.$gte = new Date(startDate);
    if (endDate) q.paymentDate.$lte = new Date(endDate);
  }

  const payments = await Payment.find(q)
    .select("type amount paymentDate paymentMethod status referenceNumber customerId supplierId")
    .populate("customerId", "name")
    .sort({ paymentDate: -1 })
    .lean()
    .limit(100);

  const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  return { 
    meta: { count: payments.length, totalAmount }, 
    rows: payments 
  };
}

module.exports = {
  salesTool,
  productTool,
  customerTool,
  customerDuesTool: customerTool, // Alias exported to prevent breaking legacy fallback code
  emiTool,
  paymentTool
};

// const Sales = require("../../../inventory/core/sales.model");
// const Product = require("../../../inventory/core/product.model");
// const Customer = require("../../../organization/core/customer.model");
// const EMI = require("../../../accounting/payments/emi.model");

// async function salesTool({ startDate, endDate, paymentStatus, organizationId, branchId }) {
//   if (!organizationId) return { error: "organizationId required" };
//   const q = { organizationId };
//   if (branchId) q.branchId = branchId; // Fixed: using branchId instead of branch
//   if (paymentStatus) q.paymentStatus = paymentStatus;
  
//   if (startDate || endDate) {
//     q.createdAt = {};
//     if (startDate) q.createdAt.$gte = new Date(startDate);
//     if (endDate) q.createdAt.$lte = new Date(endDate);
//   }

//   const rows = await Sales.find(q)
//     // Fixed: Selected "invoiceNumber" and "customerId" based on SalesSchema
//     .select("invoiceNumber totalAmount paidAmount createdAt paymentStatus customerId")
//     .populate("customerId", "name") // Fixed: Populate customerId
//     .lean()
//     .limit(500);
    
//   const totalRevenue = rows.reduce((s, r) => s + (r.totalAmount || 0), 0);
//   return {
//     meta: { count: rows.length, totalRevenue },
//     rows: rows.slice(0, 200),
//   };
// }

// async function productTool({ productName, organizationId, branchId }) {
//   if (!organizationId) return { error: "organizationId required" };
//   const q = { organizationId, name: { $regex: productName || "", $options: "i" } };
  
//   const products = await Product.find(q)
//     .select("name sku sellingPrice inventory")
//     .lean()
//     .limit(50);

//   const mapped = products.map((p) => {
//     const branchInv = (p.inventory || []).find((i) => String(i.branchId || "") === String(branchId || p.inventory?.[0]?.branchId || ""));
//     const totalStock = (p.inventory || []).reduce((s, it) => s + (it.quantity || 0), 0);
//     return {
//       name: p.name, sku: p.sku, price: p.sellingPrice, branchStock: branchInv ? branchInv.quantity : 0, totalStock,
//     };
//   });
//   return { rows: mapped };
// }

// async function customerDuesTool({ minAmount = 0, organizationId }) {
//   if (!organizationId) return { error: "organizationId required" };

//   const q = { organizationId, outstandingBalance: { $gt: minAmount } };

//   const customers = await Customer.find(q)
//     .select("name phone outstandingBalance")
//     .sort({ outstandingBalance: -1 })
//     .limit(50)
//     .lean();

//   return { rows: customers };
// }

// async function emiTool({ status, organizationId }) {
//   if (!organizationId) return { error: "organizationId required" };

//   const q = { organizationId };
//   if (status) q.status = status;

//   const emis = await EMI.find(q)
//     // Fixed: Selected "installments" instead of non-existent "nextInstallmentDate"
//     .select("customerId totalAmount balanceAmount status installments")
//     .populate("customerId", "name phone")
//     .limit(50)
//     .lean();

//   // Process the nearest installment date in memory for the agent
//   const processedEmis = emis.map(emi => {
//     let nextInstallment = null;
//     if (emi.installments && emi.installments.length > 0) {
//       const pending = emi.installments.filter(i => i.paymentStatus !== 'paid');
//       if (pending.length > 0) {
//         // Find the earliest due date
//         nextInstallment = pending.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
//       }
//     }
//     return {
//       customerName: emi.customerId?.name,
//       customerPhone: emi.customerId?.phone,
//       totalAmount: emi.totalAmount,
//       balanceAmount: emi.balanceAmount,
//       status: emi.status,
//       nextDueDate: nextInstallment ? nextInstallment.dueDate : "None"
//     };
//   });

//   return { rows: processedEmis };
// }

// module.exports = {
//   salesTool,
//   productTool,
//   customerDuesTool,
//   emiTool,
// };
// // const Sales = require("../../../inventory/core/sales.model");
// // const Product = require("../../../inventory/core/product.model");
// // const Customer = require("../../../organization/core/customer.model");
// // const EMI = require("../../../accounting/payments/emi.model");

// // async function salesTool({ startDate, endDate, paymentStatus, organizationId, branchId }) {
// //   if (!organizationId) return { error: "organizationId required" };
// //   const q = { organizationId };
// //   if (branchId) q.branch = branchId;
// //   if (paymentStatus) q.paymentStatus = paymentStatus;
// //   if (startDate || endDate) q.createdAt = {};
// //   if (startDate) q.createdAt.$gte = new Date(startDate);
// //   if (endDate) q.createdAt.$lte = new Date(endDate);

// //   const rows = await Sales.find(q)
// //     .select("invoiceNo totalAmount paidAmount createdAt paymentStatus customer")
// //     .populate("customer", "name")
// //     .lean()
// //     .limit(500);
// //   const totalRevenue = rows.reduce((s, r) => s + (r.totalAmount || 0), 0);
// //   return {
// //     meta: { count: rows.length, totalRevenue },
// //     rows: rows.slice(0, 200), // safe cap
// //   };
// // }

// // async function productTool({ productName, organizationId, branchId }) {
// //   if (!organizationId) return { error: "organizationId required" };
// //   const q = { organizationId, name: { $regex: productName || "", $options: "i" } };
// //   const products = await Product.find(q)
// //     .select("name sku sellingPrice inventory")
// //     .lean()
// //     .limit(50);

// //   const mapped = products.map((p) => {
// //     const branchInv = (p.inventory || []).find((i) => String(i.branchId || "") === String(branchId || p.inventory?.[0]?.branchId || ""));
// //     const totalStock = (p.inventory || []).reduce((s, it) => s + (it.quantity || 0), 0);
// //     return {
// //       name: p.name, sku: p.sku, price: p.sellingPrice, branchStock: branchInv ? branchInv.quantity : 0, totalStock,
// //     };
// //   });
// //   return { rows: mapped };
// // }

// // async function customerDuesTool({ minAmount = 0, organizationId }) {
// //   if (!organizationId) return { error: "organizationId required" };

// //   const q = { organizationId, outstandingBalance: { $gt: minAmount } };

// //   const customers = await Customer.find(q)
// //     .select("name phone outstandingBalance")
// //     .sort({ outstandingBalance: -1 })
// //     .limit(50)
// //     .lean();

// //   return { rows: customers };
// // }

// // async function emiTool({ status, organizationId }) {
// //   if (!organizationId) return { error: "organizationId required" };

// //   const q = { organizationId };
// //   if (status) q.status = status;

// //   const emis = await EMI.find(q)
// //     .select("customerId totalAmount balanceAmount nextInstallmentDate status")
// //     .populate("customerId", "name phone")
// //     .limit(50)
// //     .lean();

// //   return { rows: emis };
// // }

// // module.exports = {
// //   salesTool,
// //   productTool,
// //   customerDuesTool,
// //   emiTool,
// // };

