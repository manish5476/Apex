// src/controllers/accountController.js
const Account = require('../models/accountModel');
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const { listAccountsWithBalance, getAccountHierarchy } = require('../services/accountService');
const AccountEntry = require('../models/accountModel');


// src/controllers/accountingController.js
// const { postJournalEntries } = require('../services/accountingService');

// exports.postJournal = asyncHandler(async (req,res) => {
//   const orgId = req.user.organizationId;
//   const { date, entries } = req.body;
//   // validate entries format on server
//   if (!Array.isArray(entries) || entries.length < 1) return res.status(400).json({ status:'fail', message:'entries required' });
//   const created = await postJournalEntries(orgId, date || new Date(), entries.map(e=>({ ...e, referenceType: e.referenceType, referenceId: e.referenceId })), { updateBalances:true });
//   res.json({ status:'success', created });
// });



// Helpers
function validateAccountPayload(body) {
  const { code, name, type } = body;
  if (!code || !String(code).trim()) throw new Error('Account code is required');
  if (!name || !String(name).trim()) throw new Error('Account name is required');
  if (!type || !['asset','liability','equity','income','expense','other'].includes(type))
    throw new Error('Invalid account type');
}

exports.createAccount = asyncHandler(async (req, res) => {
  // only admins allowed
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
  // ensure uniqueness per org
  const existing = await Account.findOne({ organizationId: orgId, code: payload.code });
  if (existing) return res.status(409).json({ status: 'fail', message: 'Account code already exists' });

  const acc = await Account.create(payload);
  res.status(201).json({ status: 'success', data: acc });
});

exports.getAccounts = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const params = { type: req.query.type, search: req.query.search };
  const accounts = await listAccountsWithBalance(orgId, params);
  res.status(200).json({ status: 'success', results: accounts.length, data: accounts });
});

exports.getHierarchy = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const tree = await getAccountHierarchy(orgId);
  res.status(200).json({ status: 'success', data: tree });
});


// exports.getAccounts = asyncHandler(async (req, res) => {
//   const orgId = req.user.organizationId;
//   const q = { organizationId: orgId };

//   // optional filters: type, search (code or name)
//   if (req.query.type) q.type = req.query.type;
//   if (req.query.search) {
//     const re = new RegExp(req.query.search, 'i');
//     q.$or = [{ code: re }, { name: re }];
//   }

//   const accounts = await Account.find(q).sort({ code: 1 }).lean();
//   res.status(200).json({ status: 'success', results: accounts.length, data: accounts });
// });

exports.getAccount = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const acc = await Account.findOne({ _id: req.params.id, organizationId: orgId }).lean();
  if (!acc) return res.status(404).json({ status: 'fail', message: 'Account not found' });
  res.status(200).json({ status: 'success', data: acc });
});

exports.updateAccount = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  validateAccountPayload(req.body);
  const update = {
    code: req.body.code,
    name: req.body.name,
    type: req.body.type,
    parent: req.body.parent || null,
    metadata: req.body.metadata || {}
  };
  const acc = await Account.findOneAndUpdate({ _id: req.params.id, organizationId: orgId }, update, { new: true });
  if (!acc) return res.status(404).json({ status: 'fail', message: 'Account not found' });
  res.status(200).json({ status: 'success', data: acc });
});

exports.deleteAccount = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const child = await Account.findOne({ parent: req.params.id, organizationId: orgId });
  if (child) return res.status(400).json({ status: 'fail', message: 'Cannot delete account with child accounts' });

  const entry = await Account.findOne({ accountId: req.params.id, organizationId: orgId }).lean();
  if (entry) return res.status(400).json({ status: 'fail', message: 'Cannot delete account with posted entries' });

  const acc = await Account.findOneAndDelete({ _id: req.params.id, organizationId: orgId });
  if (!acc) return res.status(404).json({ status: 'fail', message: 'Account not found' });
  res.status(200).json({ status: 'success', message: 'Deleted' });
});

// Reparent account
exports.reparentAccount = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const accountId = req.params.id;
  const newParentId = req.body.parent || null;

  if (newParentId && String(newParentId) === String(accountId)) {
    return res.status(400).json({ status: 'fail', message: 'Account cannot be parent of itself' });
  }

  // load all accounts for org (small optimization: fetch subtree when large orgs use different logic)
  const accounts = await Account.find({ organizationId: orgId }).lean();
  const map = {};
  accounts.forEach(a => { map[String(a._id)] = a; });

  if (newParentId && !map[String(newParentId)]) {
    return res.status(404).json({ status: 'fail', message: 'New parent not found' });
  }

  // detect cycle: traverse up from newParent and ensure we don't meet accountId
  let cur = newParentId;
  while (cur) {
    if (String(cur) === String(accountId)) {
      return res.status(400).json({ status: 'fail', message: 'Reparent would create a cycle' });
    }
    const parent = map[String(cur)];
    cur = parent ? parent.parent : null;
  }

  // optional: disallow reparent when account has entries -- safer
  const allowIfEntries = process.env.ALLOW_REPARENT_WITH_ENTRIES === 'true';
  if (!allowIfEntries) {
    const entry = await require('../models/accountEntryModel').findOne({ accountId: accountId, organizationId: orgId }).lean();
    if (entry) return res.status(400).json({ status: 'fail', message: 'Cannot reparent account with posted entries' });
  }

  const updated = await Account.findOneAndUpdate({ _id: accountId, organizationId: orgId }, { parent: newParentId || null }, { new: true });
  if (!updated) return res.status(404).json({ status: 'fail', message: 'Account not found' });
  res.status(200).json({ status: 'success', data: updated });
});



// exports.deleteAccount = asyncHandler(async (req, res) => {
//   const orgId = req.user.organizationId;
//   // Prevent deleting accounts that have entries or children ideally. Minimal check: children.
//   const child = await Account.findOne({ parent: req.params.id, organizationId: orgId });
//   if (child) return res.status(400).json({ status: 'fail', message: 'Cannot delete account with child accounts' });

//   const acc = await Account.findOneAndDelete({ _id: req.params.id, organizationId: orgId });
//   if (!acc) return res.status(404).json({ status: 'fail', message: 'Account not found' });
//   res.status(200).json({ status: 'success', message: 'Deleted' });
// });
