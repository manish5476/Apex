const Sales = require("../../../inventory/core/sales.model");
const Product = require("../../../inventory/core/product.model");
const Customer = require("../../../organization/core/customer.model");
const EMI = require("../../../accounting/payments/emi.model");

async function salesTool({ startDate, endDate, paymentStatus, organizationId, branchId }) {
  if (!organizationId) return { error: "organizationId required" };
  const q = { organizationId };
  if (branchId) q.branchId = branchId; // Fixed: using branchId instead of branch
  if (paymentStatus) q.paymentStatus = paymentStatus;
  
  if (startDate || endDate) {
    q.createdAt = {};
    if (startDate) q.createdAt.$gte = new Date(startDate);
    if (endDate) q.createdAt.$lte = new Date(endDate);
  }

  const rows = await Sales.find(q)
    // Fixed: Selected "invoiceNumber" and "customerId" based on SalesSchema
    .select("invoiceNumber totalAmount paidAmount createdAt paymentStatus customerId")
    .populate("customerId", "name") // Fixed: Populate customerId
    .lean()
    .limit(500);
    
  const totalRevenue = rows.reduce((s, r) => s + (r.totalAmount || 0), 0);
  return {
    meta: { count: rows.length, totalRevenue },
    rows: rows.slice(0, 200),
  };
}

async function productTool({ productName, organizationId, branchId }) {
  if (!organizationId) return { error: "organizationId required" };
  const q = { organizationId, name: { $regex: productName || "", $options: "i" } };
  
  const products = await Product.find(q)
    .select("name sku sellingPrice inventory")
    .lean()
    .limit(50);

  const mapped = products.map((p) => {
    const branchInv = (p.inventory || []).find((i) => String(i.branchId || "") === String(branchId || p.inventory?.[0]?.branchId || ""));
    const totalStock = (p.inventory || []).reduce((s, it) => s + (it.quantity || 0), 0);
    return {
      name: p.name, sku: p.sku, price: p.sellingPrice, branchStock: branchInv ? branchInv.quantity : 0, totalStock,
    };
  });
  return { rows: mapped };
}

async function customerDuesTool({ minAmount = 0, organizationId }) {
  if (!organizationId) return { error: "organizationId required" };

  const q = { organizationId, outstandingBalance: { $gt: minAmount } };

  const customers = await Customer.find(q)
    .select("name phone outstandingBalance")
    .sort({ outstandingBalance: -1 })
    .limit(50)
    .lean();

  return { rows: customers };
}

async function emiTool({ status, organizationId }) {
  if (!organizationId) return { error: "organizationId required" };

  const q = { organizationId };
  if (status) q.status = status;

  const emis = await EMI.find(q)
    // Fixed: Selected "installments" instead of non-existent "nextInstallmentDate"
    .select("customerId totalAmount balanceAmount status installments")
    .populate("customerId", "name phone")
    .limit(50)
    .lean();

  // Process the nearest installment date in memory for the agent
  const processedEmis = emis.map(emi => {
    let nextInstallment = null;
    if (emi.installments && emi.installments.length > 0) {
      const pending = emi.installments.filter(i => i.paymentStatus !== 'paid');
      if (pending.length > 0) {
        // Find the earliest due date
        nextInstallment = pending.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
      }
    }
    return {
      customerName: emi.customerId?.name,
      customerPhone: emi.customerId?.phone,
      totalAmount: emi.totalAmount,
      balanceAmount: emi.balanceAmount,
      status: emi.status,
      nextDueDate: nextInstallment ? nextInstallment.dueDate : "None"
    };
  });

  return { rows: processedEmis };
}

module.exports = {
  salesTool,
  productTool,
  customerDuesTool,
  emiTool,
};
// const Sales = require("../../../inventory/core/sales.model");
// const Product = require("../../../inventory/core/product.model");
// const Customer = require("../../../organization/core/customer.model");
// const EMI = require("../../../accounting/payments/emi.model");

// async function salesTool({ startDate, endDate, paymentStatus, organizationId, branchId }) {
//   if (!organizationId) return { error: "organizationId required" };
//   const q = { organizationId };
//   if (branchId) q.branch = branchId;
//   if (paymentStatus) q.paymentStatus = paymentStatus;
//   if (startDate || endDate) q.createdAt = {};
//   if (startDate) q.createdAt.$gte = new Date(startDate);
//   if (endDate) q.createdAt.$lte = new Date(endDate);

//   const rows = await Sales.find(q)
//     .select("invoiceNo totalAmount paidAmount createdAt paymentStatus customer")
//     .populate("customer", "name")
//     .lean()
//     .limit(500);
//   const totalRevenue = rows.reduce((s, r) => s + (r.totalAmount || 0), 0);
//   return {
//     meta: { count: rows.length, totalRevenue },
//     rows: rows.slice(0, 200), // safe cap
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
//     .select("customerId totalAmount balanceAmount nextInstallmentDate status")
//     .populate("customerId", "name phone")
//     .limit(50)
//     .lean();

//   return { rows: emis };
// }

// module.exports = {
//   salesTool,
//   productTool,
//   customerDuesTool,
//   emiTool,
// };

