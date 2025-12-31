const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: false },
  action: { type: String, required: true }, // e.g. 'read:transactions', 'export:transactions', 'create:invoice'
  entityType: { type: String, required: false }, // e.g. 'transaction', 'invoice'
  entityId: { type: mongoose.Schema.Types.ObjectId, required: false },
  ip: { type: String, required: false },
  userAgent: { type: String, required: false },
  meta: { type: mongoose.Schema.Types.Mixed, required: false }, // filters, query, rowCount, fileName etc
  createdAt: { type: Date, default: Date.now, index: true }
});

auditLogSchema.index({ organizationId: 1 });
auditLogSchema.index({ userId: 1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
