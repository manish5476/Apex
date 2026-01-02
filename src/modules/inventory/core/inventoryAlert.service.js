// src/services/inventoryAlertService.js
const Product = require('./product.model');
const Organization = require('../../organization/core/organization.model');
const sendEmail = require('../../../core/utils/_legacy/email');
const AppError = require('../../../core/utils/appError');

// Default low-stock threshold (can be overridden by org settings or env)
const LOW_STOCK_THRESHOLD = process.env.LOW_STOCK_THRESHOLD
  ? Number(process.env.LOW_STOCK_THRESHOLD)
  : 10;

/**
 * Finds low-stock products and sends email alerts to the organization owner.
 */
exports.checkAndSendLowStockAlerts = async () => {
  console.log('🔍 Checking for low-stock products...');

  try {
    // 1️⃣ Find all products below threshold
    const lowStockProducts = await Product.find({
      'inventory.quantity': { $lt: LOW_STOCK_THRESHOLD },
      isActive: true,
    })
      .populate('organizationId', 'name owner primaryEmail')
      .populate('organizationId.owner', 'email name')
      .lean();

    if (!lowStockProducts.length) {
      console.log('✅ No low-stock products found today.');
      return;
    }

    // 2️⃣ Group by organization
    const groupedByOrg = lowStockProducts.reduce((acc, product) => {
      const orgId = product.organizationId._id.toString();
      if (!acc[orgId]) acc[orgId] = { org: product.organizationId, products: [] };
      acc[orgId].products.push(product);
      return acc;
    }, {});

    // 3️⃣ Send alerts per organization
    for (const orgId in groupedByOrg) {
      const { org, products } = groupedByOrg[orgId];
      const email = org.primaryEmail || org.owner?.email;
      if (!email) continue;

      const html = generateLowStockEmail(org.name, products);

      await sendEmail({
        email,
        subject: `⚠️ Low Stock Alert — ${products.length} Products Below Threshold`,
        html,
      });

      console.log(`📦 Sent low-stock alert to ${email} (${products.length} items)`);
    }

    console.log('✅ Inventory alert job completed successfully.');
  } catch (err) {
    console.error('💥 Error running inventory alert job:', err.message);
    throw new AppError('Failed to process inventory alerts', 500);
  }
};

/**
 * Builds HTML email template for low stock alert
 */
function generateLowStockEmail(orgName, products) {
  const productRows = products
    .map(
      (p) => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;">${p.name}</td>
        <td style="padding:8px;border:1px solid #ddd;">${p.sku || '-'}</td>
        <td style="padding:8px;border:1px solid #ddd;">${
          p.inventory?.[0]?.quantity || 0
        }</td>
      </tr>`
    )
    .join('');

  return `
    <div style="font-family:Arial,sans-serif;color:#333;">
      <h2>🚨 Low Stock Alert</h2>
      <p>Dear <b>${orgName}</b>,</p>
      <p>The following products are running low on stock:</p>
      <table style="border-collapse:collapse;width:100%;margin-top:10px;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:8px;border:1px solid #ddd;">Product</th>
            <th style="padding:8px;border:1px solid #ddd;">SKU</th>
            <th style="padding:8px;border:1px solid #ddd;">Stock Qty</th>
          </tr>
        </thead>
        <tbody>${productRows}</tbody>
      </table>
      <p style="margin-top:20px;">Please consider reordering soon to prevent stockouts.</p>
      <p>Best Regards,<br><b>Shivam Electronics CRM</b></p>
    </div>
  `;
}
