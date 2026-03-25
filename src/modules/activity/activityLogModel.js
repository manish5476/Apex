const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },

    // FIX #1 — userId remains optional (for system/cron-generated logs),
    // but we now have a `source` field to distinguish WHY it is null.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // FIX #2 — Added `source` field to distinguish between user-triggered actions,
    // system background jobs, and cron tasks.
    // Without this, you cannot filter meaningful audit trails from noise.
    source: {
      type: String,
      enum: ['user', 'system', 'cron', 'api', 'webhook'],
      default: 'user',
      index: true,
    },

    action: {
      type: String,
      required: true,
      index: true, // FIX #3 — Index action for filtering by event type in dashboards
    },

    description: {
      type: String,
      required: true,
    },

    // FIX #4 — Added `entityType` and `entityId` for structured entity tracking.
    // Previously, all context had to be buried in the unstructured `metadata` object,
    // making it impossible to efficiently query "all activity on Invoice X".
    entityType: {
      type: String,
      enum: ['Invoice', 'Payment', 'Purchase', 'Customer', 'Supplier', 'Product', 'User', 'EMI', 'Sales', 'Other'],
      default: null,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    metadata: {
      type: Object,
      default: {},
    },

    // FIX #5 — Added ipAddress for security auditing (login events, sensitive actions)
    ipAddress: { type: String, default: null },
  },
  { timestamps: true }
);

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────

// Primary query: org's activity log, newest first
activityLogSchema.index({ organizationId: 1, createdAt: -1 });

// FIX #6 — Added compound index for entity-scoped activity feed.
// Common query: "show all activity on this invoice / customer / product"
activityLogSchema.index(
  { organizationId: 1, entityType: 1, entityId: 1, createdAt: -1 },
  { sparse: true, name: 'idx_org_entity_activity' }
);

// FIX #7 — Added user activity index for user audit trail
activityLogSchema.index(
  { organizationId: 1, userId: 1, createdAt: -1 },
  { sparse: true, name: 'idx_org_user_activity' }
);

module.exports = mongoose.model('ActivityLog', activityLogSchema);

// const mongoose = require("mongoose");

// const activityLogSchema = new mongoose.Schema(
//   {
//     organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, },
//     userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", },
//     action: { type: String, required: true, },
//     description: { type: String, required: true, },
//     metadata: { type: Object, default: {}, },
//   },
//   { timestamps: true }
// );

// module.exports = mongoose.model("ActivityLog", activityLogSchema);
