const catchAsync = require("../../../core/utils/catchAsync");
const Customer = require("../../organization/core/customer.model");
const Product = require("../../inventory/core/product.model");
const Invoice = require("../../accounting/billing/invoice.model");

exports.globalSearch = catchAsync(async (req, res, next) => {
  const q = req.query.q || "";
  const orgId = req.user.organizationId;
  const limit = 5; // Keep it snappy

  if (!q) return res.status(200).json({ status: "success", data: {} });

  const regex = { $regex: q, $options: "i" };

  // Run all queries in parallel for maximum speed
  const [customers, products, invoices] = await Promise.all([
    Customer.find({
      organizationId: orgId,
      $or: [{ name: regex }, { phone: regex }, { email: regex }]
    }).limit(limit).select("name phone email avatar"),

    Product.find({
      organizationId: orgId,
      $or: [{ name: regex }, { sku: regex }]
    }).limit(limit).select("name sku price stock images"),

    Invoice.find({
      organizationId: orgId,
      invoiceNumber: regex
    }).limit(limit).select("invoiceNumber grandTotal status invoiceDate")
  ]);

  res.status(200).json({
    status: "success",
    results: {
      customers: customers.length,
      products: products.length,
      invoices: invoices.length,
    },
    data: { customers, products, invoices },
  });
});