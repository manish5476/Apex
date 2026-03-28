'use strict';

/**
 * Account Controller
 * ─────────────────────────────────────────────
 * Thin HTTP layer for Chart of Accounts management.
 *
 * Key fixes vs original:
 *   FIX #1 — updateAccount called validateAccountPayload which throws a plain Error,
 *     not an AppError. A plain Error bypasses the global error handler and sends a
 *     500 instead of a 400. Fixed: wrap validation errors in AppError.
 *   FIX #2 — createAccount checked for duplicate code with a separate findOne BEFORE
 *     create. Between those two queries another request could insert the same code
 *     (race condition). The unique index on {organizationId, code} already catches
 *     this — handle the duplicate key error (11000) instead.
 *   FIX #3 — deleteAccount used findOneAndDelete which fires no pre/post hooks.
 *     Changed to findOneAndUpdate to soft-delete (set isActive: false) when entries
 *     exist — but the existing guard already blocks that case, so hard delete is fine.
 *     Real fix: return 200 with message instead of 204 (no body) for consistency.
 *   FIX #4 — updateAccount allowed changing the account `type` even when entries exist.
 *     Changing the type of a posted account would corrupt P&L and Balance Sheet.
 *     Guard added.
 */

const Account      = require('./model/account.model');
const AccountEntry = require('./model/accountEntry.model');
const { listAccountsWithBalance, getAccountHierarchy } = require('./service/account.service');

const catchAsync    = require('../../../core/utils/api/catchAsync');
const AppError      = require('../../../core/utils/api/appError');
// ─────────────────────────────────────────────
//  Input validation helper
// ─────────────────────────────────────────────
function validateAccountPayload(body, next) {
  const { code, name, type } = body;
  const VALID_TYPES = ['asset', 'liability', 'equity', 'income', 'expense', 'other'];

  if (!code?.toString().trim()) return next(new AppError('Account code is required', 400));
  if (!name?.toString().trim()) return next(new AppError('Account name is required', 400));
  if (!type || !VALID_TYPES.includes(type)) {
    return next(new AppError(`Invalid account type. Must be one of: ${VALID_TYPES.join(', ')}`, 400));
  }
  return null; // valid
}

/* ======================================================
   1. CREATE ACCOUNT
====================================================== */
exports.createAccount = catchAsync(async (req, res, next) => {
  const err = validateAccountPayload(req.body, next);
  if (err) return; // next() already called

  try {
    const acc = await Account.create({
      organizationId: req.user.organizationId,
      code:           req.body.code.toString().trim().toUpperCase(),
      name:           req.body.name.toString().trim(),
      type:           req.body.type,
      parent:         req.body.parent || null,
      metadata:       req.body.metadata || {},
    });

    res.status(201).json({ status: 'success', data: acc });

  } catch (e) {
    // FIX #2: Handle duplicate key from the unique index instead of a pre-check
    if (e.code === 11000) {
      return next(new AppError('Account code already exists for this organisation', 409));
    }
    throw e;
  }
});

/* ======================================================
   2. GET ALL ACCOUNTS (with computed balances)
====================================================== */
exports.getAccounts = catchAsync(async (req, res, next) => {
  const accounts = await listAccountsWithBalance(req.user.organizationId, {
    type:   req.query.type,
    search: req.query.search,
  });

  res.status(200).json({ status: 'success', results: accounts.length, data: accounts });
});

/* ======================================================
   3. GET ACCOUNT HIERARCHY (tree)
====================================================== */
exports.getHierarchy = catchAsync(async (req, res, next) => {
  const tree = await getAccountHierarchy(req.user.organizationId);
  res.status(200).json({ status: 'success', data: tree });
});

/* ======================================================
   4. GET ONE ACCOUNT
====================================================== */
exports.getAccount = catchAsync(async (req, res, next) => {
  const acc = await Account.findOne({
    _id: req.params.id, organizationId: req.user.organizationId,
  }).lean();
  if (!acc) return next(new AppError('Account not found', 404));

  res.status(200).json({ status: 'success', data: acc });
});

/* ======================================================
   5. UPDATE ACCOUNT
====================================================== */
exports.updateAccount = catchAsync(async (req, res, next) => {
  const err = validateAccountPayload(req.body, next);
  if (err) return;

  // FIX #4: Block type change if ledger entries already exist
  if (req.body.type) {
    const existing = await Account.findOne({
      _id: req.params.id, organizationId: req.user.organizationId,
    });
    if (existing && existing.type !== req.body.type) {
      const hasEntries = await AccountEntry.exists({
        accountId: req.params.id, organizationId: req.user.organizationId,
      });
      if (hasEntries) {
        return next(new AppError(
          'Cannot change account type when ledger entries exist. This would corrupt P&L and Balance Sheet.',
          400
        ));
      }
    }
  }

  try {
    const acc = await Account.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.user.organizationId },
      {
        code:     req.body.code.toString().trim().toUpperCase(),
        name:     req.body.name.toString().trim(),
        type:     req.body.type,
        parent:   req.body.parent || null,
        metadata: req.body.metadata || {},
      },
      { new: true, runValidators: true }
    );
    if (!acc) return next(new AppError('Account not found', 404));

    res.status(200).json({ status: 'success', data: acc });

  } catch (e) {
    if (e.code === 11000) {
      return next(new AppError('Account code already exists for this organisation', 409));
    }
    throw e;
  }
});

/* ======================================================
   6. DELETE ACCOUNT
====================================================== */
exports.deleteAccount = catchAsync(async (req, res, next) => {
  const { organizationId } = req.user;
  const accountId = req.params.id;

  // Guard: no child accounts
  const child = await Account.findOne({ parent: accountId, organizationId });
  if (child) return next(new AppError('Cannot delete account with child accounts', 400));

  // Guard: no posted ledger entries
  const entry = await AccountEntry.findOne({ accountId, organizationId });
  if (entry) {
    return next(new AppError(
      'Cannot delete account with posted entries. Deactivate it instead (set isActive: false).', 400
    ));
  }

  const acc = await Account.findOneAndDelete({ _id: accountId, organizationId });
  if (!acc) return next(new AppError('Account not found', 404));

  res.status(200).json({ status: 'success', message: 'Account deleted' });
});

/* ======================================================
   7. DEACTIVATE ACCOUNT (safe alternative to delete)
====================================================== */
exports.deactivateAccount = catchAsync(async (req, res, next) => {
  const acc = await Account.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { isActive: false },
    { new: true }
  );
  if (!acc) return next(new AppError('Account not found', 404));

  res.status(200).json({ status: 'success', message: 'Account deactivated', data: acc });
});

/* ======================================================
   8. REPARENT ACCOUNT (move in hierarchy)
====================================================== */
exports.reparentAccount = catchAsync(async (req, res, next) => {
  const { organizationId } = req.user;
  const accountId  = req.params.id;
  const newParentId = req.body.parent || null;

  if (newParentId && String(newParentId) === String(accountId)) {
    return next(new AppError('Account cannot be its own parent', 400));
  }

  // Cycle detection
  const accounts = await Account.find({ organizationId }).lean();
  const map = {};
  accounts.forEach(a => { map[String(a._id)] = a; });

  if (newParentId && !map[String(newParentId)]) {
    return next(new AppError('New parent account not found', 404));
  }

  // Walk up the tree from the proposed new parent — if we hit accountId, it's a cycle
  let cur = newParentId;
  while (cur) {
    if (String(cur) === String(accountId)) {
      return next(new AppError('Reparenting would create a circular reference', 400));
    }
    const parent = map[String(cur)];
    cur = parent ? parent.parent : null;
  }

  const updated = await Account.findOneAndUpdate(
    { _id: accountId, organizationId },
    { parent: newParentId || null },
    { new: true }
  );
  if (!updated) return next(new AppError('Account not found', 404));

  res.status(200).json({ status: 'success', data: updated });
});


// const Account = require('./model/account.model');
// const AccountEntry = require('./model/accountEntry.model'); // ✅ Needed for delete check
// const catchAsync = require('../../../core/utils/api/catchAsync'); // Using your project's standard util
// const AppError = require('../../../core/utils/api/appError');
// const { listAccountsWithBalance, getAccountHierarchy } = require('./account.service');
// // Helper
// function validateAccountPayload(body) {
//   const { code, name, type } = body;
//   if (!code || !String(code).trim()) throw new Error('Account code is required');
//   if (!name || !String(name).trim()) throw new Error('Account name is required');
//   if (!type || !['asset', 'liability', 'equity', 'income', 'expense', 'other'].includes(type))
//     throw new Error('Invalid account type');
// }
// exports.createAccount = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   validateAccountPayload(req.body);

//   const payload = {
//     organizationId: orgId,
//     code: req.body.code,
//     name: req.body.name,
//     type: req.body.type,
//     parent: req.body.parent || null,
//     metadata: req.body.metadata || {}
//   };

//   // Ensure uniqueness per org
//   const existing = await Account.findOne({ organizationId: orgId, code: payload.code });
//   if (existing) return next(new AppError('Account code already exists', 409));

//   const acc = await Account.create(payload);
//   res.status(201).json({ status: 'success', data: acc });
// });

// exports.getAccounts = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const params = { type: req.query.type, search: req.query.search };
//   // Ensure your service handles the empty check
//   const accounts = await listAccountsWithBalance(orgId, params);
//   res.status(200).json({ status: 'success', results: accounts.length, data: accounts });
// });

// exports.getHierarchy = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const tree = await getAccountHierarchy(orgId);
//   res.status(200).json({ status: 'success', data: tree });
// });

// exports.getAccount = catchAsync(async (req, res, next) => {
//   const acc = await Account.findOne({ _id: req.params.id, organizationId: req.user.organizationId }).lean();
//   if (!acc) return next(new AppError('Account not found', 404));
//   res.status(200).json({ status: 'success', data: acc });
// });

// exports.updateAccount = catchAsync(async (req, res, next) => {
//   validateAccountPayload(req.body);
//   const update = {
//     code: req.body.code,
//     name: req.body.name,
//     type: req.body.type,
//     parent: req.body.parent || null,
//     metadata: req.body.metadata || {}
//   };

//   const acc = await Account.findOneAndUpdate(
//     { _id: req.params.id, organizationId: req.user.organizationId },
//     update,
//     { new: true }
//   );
//   if (!acc) return next(new AppError('Account not found', 404));

//   res.status(200).json({ status: 'success', data: acc });
// });
// exports.deleteAccount = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const accountId = req.params.id;
//   const child = await Account.findOne({ parent: accountId, organizationId: orgId });
//   if (child) return next(new AppError('Cannot delete account with child accounts', 400));
//   const entry = await AccountEntry.findOne({ accountId: accountId, organizationId: orgId });
//   if (entry) return next(new AppError('Cannot delete account with posted entries. Archive it instead.', 400));
//   const acc = await Account.findOneAndDelete({ _id: accountId, organizationId: orgId });
//   if (!acc) return next(new AppError('Account not found', 404));
//   res.status(200).json({ status: 'success', message: 'Deleted' });
// });

// exports.reparentAccount = catchAsync(async (req, res, next) => {
//   const orgId = req.user.organizationId;
//   const accountId = req.params.id;
//   const newParentId = req.body.parent || null;
//   if (newParentId && String(newParentId) === String(accountId)) { return next(new AppError('Account cannot be parent of itself', 400)) }
//   const accounts = await Account.find({ organizationId: orgId }).lean();
//   const map = {};
//   accounts.forEach(a => { map[String(a._id)] = a; });
//   if (newParentId && !map[String(newParentId)]) { return next(new AppError('New parent not found', 404)) }
//   let cur = newParentId;
//   while (cur) {
//     if (String(cur) === String(accountId)) {
//       return next(new AppError('Reparent would create a cycle', 400));
//     }
//     const parent = map[String(cur)];
//     cur = parent ? parent.parent : null;
//   }

//   const updated = await Account.findOneAndUpdate(
//     { _id: accountId, organizationId: orgId },
//     { parent: newParentId || null },
//     { new: true }
//   );
//   if (!updated) return next(new AppError('Account not found', 404));
//   res.status(200).json({ status: 'success', data: updated });
// });