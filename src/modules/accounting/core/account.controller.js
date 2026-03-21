const Account = require('./account.model');
const AccountEntry = require('./accountEntry.model'); // ✅ Needed for delete check
const catchAsync = require('../../../core/utils/api/catchAsync'); // Using your project's standard util
const AppError = require('../../../core/utils/api/appError');
const { listAccountsWithBalance, getAccountHierarchy } = require('./account.service');
// Helper
function validateAccountPayload(body) {
  const { code, name, type } = body;
  if (!code || !String(code).trim()) throw new Error('Account code is required');
  if (!name || !String(name).trim()) throw new Error('Account name is required');
  if (!type || !['asset', 'liability', 'equity', 'income', 'expense', 'other'].includes(type))
    throw new Error('Invalid account type');
}
exports.createAccount = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  validateAccountPayload(req.body);

  const payload = {
    organizationId: orgId,
    code: req.body.code,
    name: req.body.name,
    type: req.body.type,
    parent: req.body.parent || null,
    metadata: req.body.metadata || {}
  };

  // Ensure uniqueness per org
  const existing = await Account.findOne({ organizationId: orgId, code: payload.code });
  if (existing) return next(new AppError('Account code already exists', 409));

  const acc = await Account.create(payload);
  res.status(201).json({ status: 'success', data: acc });
});

exports.getAccounts = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const params = { type: req.query.type, search: req.query.search };
  // Ensure your service handles the empty check
  const accounts = await listAccountsWithBalance(orgId, params);
  res.status(200).json({ status: 'success', results: accounts.length, data: accounts });
});

exports.getHierarchy = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const tree = await getAccountHierarchy(orgId);
  res.status(200).json({ status: 'success', data: tree });
});

exports.getAccount = catchAsync(async (req, res, next) => {
  const acc = await Account.findOne({ _id: req.params.id, organizationId: req.user.organizationId }).lean();
  if (!acc) return next(new AppError('Account not found', 404));
  res.status(200).json({ status: 'success', data: acc });
});

exports.updateAccount = catchAsync(async (req, res, next) => {
  validateAccountPayload(req.body);
  const update = {
    code: req.body.code,
    name: req.body.name,
    type: req.body.type,
    parent: req.body.parent || null,
    metadata: req.body.metadata || {}
  };

  const acc = await Account.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    update,
    { new: true }
  );
  if (!acc) return next(new AppError('Account not found', 404));

  res.status(200).json({ status: 'success', data: acc });
});
exports.deleteAccount = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const accountId = req.params.id;
  const child = await Account.findOne({ parent: accountId, organizationId: orgId });
  if (child) return next(new AppError('Cannot delete account with child accounts', 400));
  const entry = await AccountEntry.findOne({ accountId: accountId, organizationId: orgId });
  if (entry) return next(new AppError('Cannot delete account with posted entries. Archive it instead.', 400));
  const acc = await Account.findOneAndDelete({ _id: accountId, organizationId: orgId });
  if (!acc) return next(new AppError('Account not found', 404));
  res.status(200).json({ status: 'success', message: 'Deleted' });
});

exports.reparentAccount = catchAsync(async (req, res, next) => {
  const orgId = req.user.organizationId;
  const accountId = req.params.id;
  const newParentId = req.body.parent || null;
  if (newParentId && String(newParentId) === String(accountId)) { return next(new AppError('Account cannot be parent of itself', 400)) }
  const accounts = await Account.find({ organizationId: orgId }).lean();
  const map = {};
  accounts.forEach(a => { map[String(a._id)] = a; });
  if (newParentId && !map[String(newParentId)]) { return next(new AppError('New parent not found', 404)) }
  let cur = newParentId;
  while (cur) {
    if (String(cur) === String(accountId)) {
      return next(new AppError('Reparent would create a cycle', 400));
    }
    const parent = map[String(cur)];
    cur = parent ? parent.parent : null;
  }

  const updated = await Account.findOneAndUpdate(
    { _id: accountId, organizationId: orgId },
    { parent: newParentId || null },
    { new: true }
  );
  if (!updated) return next(new AppError('Account not found', 404));
  res.status(200).json({ status: 'success', data: updated });
});