'use strict';

/**
 * StorefrontBranchResolver
 * ─────────────────────────────────────────────
 * Resolves a branchId from a storefront order for use in CRM records.
 *
 * Strategy:
 *   1. Use the first item's branchId (the branch the product ships from).
 *   2. Fallback to the organization's first active branch.
 *   3. Throw a descriptive error if neither is available.
 *
 * For multi-branch orders, items should be grouped by branchId before
 * calling StockService.decrement(). The primaryBranchId returned here
 * is only for the Invoice/Sales accounting record level.
 */

/**
 * Resolve the primary branchId for a storefront order.
 * @param {Object} storefrontOrder - StorefrontOrder document (plain or mongoose)
 * @param {import('mongoose').ClientSession|null} session
 * @returns {Promise<import('mongoose').Types.ObjectId>}
 */
async function resolvePrimaryBranchId(storefrontOrder, session = null) {
  // 1. Use the first item's branchId
  const firstItemBranchId = storefrontOrder.items?.[0]?.branchId;
  if (firstItemBranchId) {
    return firstItemBranchId;
  }

  // 2. Fallback — query for the organization's first active branch
  const Branch = require('../../../modules/organization/core/branch.model');
  const query = Branch.findOne({
    organizationId: storefrontOrder.organizationId,
    isActive: { $ne: false },
    isDeleted: { $ne: true },
  }).sort({ createdAt: 1 }).select('_id');

  if (session) query.session(session);
  const branch = await query.lean();

  if (branch) return branch._id;

  // 3. No branch found — cannot proceed
  const AppError = require('../../../core/utils/api/appError');
  throw new AppError(
    `No branch found for organization ${storefrontOrder.organizationId}. ` +
    'At least one active branch must exist before storefront orders can be processed.',
    500
  );
}

/**
 * Group storefront order items by their branchId.
 * Items with no branchId fall into the primary branch bucket.
 *
 * @param {Array} items - StorefrontOrder items
 * @param {Object} primaryBranchId - Fallback branchId
 * @returns {Map<string, Array>} map of branchId string → [{productId, quantity}]
 */
function groupItemsByBranch(items, primaryBranchId) {
  const groups = new Map();
  const primaryStr = primaryBranchId?.toString();

  for (const item of items) {
    const bid = item.branchId?.toString() || primaryStr;
    if (!bid) continue;
    if (!groups.has(bid)) groups.set(bid, []);
    groups.get(bid).push({
      productId: item.productId,
      quantity: item.quantity,
    });
  }

  return groups;
}

module.exports = { resolvePrimaryBranchId, groupItemsByBranch };
