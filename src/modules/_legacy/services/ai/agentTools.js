// src/services/ai/agentTools.js
// Lightweight tool wrappers that call your models directly.
// No external agent dependency here — pure async functions.

const Sales = require("../../../inventory/core/sales.model");
const Product = require("../../../inventory/core/product.model");
const Customer = require("../../../organization/core/customer.model");
const EMI = require("../../../accounting/payments/emi.model");

async function salesTool({ startDate, endDate, paymentStatus, organizationId, branchId }) {
  if (!organizationId) return { error: "organizationId required" };

  const q = { organizationId };
  if (branchId) q.branch = branchId;
  if (paymentStatus) q.paymentStatus = paymentStatus;
  if (startDate || endDate) q.createdAt = {};
  if (startDate) q.createdAt.$gte = new Date(startDate);
  if (endDate) q.createdAt.$lte = new Date(endDate);

  const rows = await Sales.find(q)
    .select("invoiceNo totalAmount paidAmount createdAt paymentStatus customer")
    .populate("customer", "name")
    .lean()
    .limit(500);

  const totalRevenue = rows.reduce((s, r) => s + (r.totalAmount || 0), 0);

  return {
    meta: { count: rows.length, totalRevenue },
    rows: rows.slice(0, 200), // safe cap
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
    const branchInv = (p.inventory || []).find((i) =>
      String(i.branchId || "") === String(branchId || p.inventory?.[0]?.branchId || "")
    );
    const totalStock = (p.inventory || []).reduce((s, it) => s + (it.quantity || 0), 0);
    return {
      name: p.name,
      sku: p.sku,
      price: p.sellingPrice,
      branchStock: branchInv ? branchInv.quantity : 0,
      totalStock,
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
    .select("customerId totalAmount balanceAmount nextInstallmentDate status")
    .populate("customerId", "name phone")
    .limit(50)
    .lean();

  return { rows: emis };
}

module.exports = {
  salesTool,
  productTool,
  customerDuesTool,
  emiTool,
};

