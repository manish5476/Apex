const mongoose = require('mongoose');

const platformAuditSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    action: {
      type: String,
      required: true,
      enum: [
        'CREATE',
        'UPDATE',
        'DELETE',
        'LOGIN',
        'LOGOUT',
        'EXPORT',
        'IMPERSONATE',
        'CONFIG_CHANGE',
        'SECURITY_EVENT',
        'INTERNAL_TOOL',
      ],
      index: true,
    },
    resource: { type: String, required: true, trim: true, index: true },
    resourceId: { type: String, trim: true, index: true },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ipAddress: { type: String },
    userAgent: { type: String },
    requestId: { type: String, index: true },
  },
  { timestamps: true }
);

platformAuditSchema.index({ organizationId: 1, createdAt: -1 });
platformAuditSchema.index({ actorId: 1, createdAt: -1 });
platformAuditSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });

module.exports = mongoose.model('PlatformAudit', platformAuditSchema);
