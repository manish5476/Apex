const mongoose = require('mongoose');
const { Schema } = mongoose;

/* -------------------------------------------------------------
 * 1. WEBHOOKS (For External Integrations)
 * Pushes data to external URLs when events happen.
 ------------------------------------------------------------- */
const WebhookSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true }, // e.g., "SAP Sync"
  url: { type: String, required: true },
  secret: { type: String }, // For signature verification
  events: [{ 
    type: String, 
    enum: ['invoice.created', 'payment.received', 'stock.low', 'customer.created'] 
  }],
  isActive: { type: Boolean, default: true },
  failures: { type: Number, default: 0 }
}, { timestamps: true });

/* -------------------------------------------------------------
 * 2. WORKFLOW RULES (Internal Logic)
 * "If [Condition] Then [Action]"
 ------------------------------------------------------------- */
const WorkflowSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true }, // e.g., "High Value Alert"
  triggerEvent: { 
    type: String, 
    required: true,
    enum: ['invoice.created', 'payment.received', 'stock.low'] 
  },
  
  // Logic Engine: Simple JSON-based rules
  // Example: { field: "grandTotal", operator: "gt", value: 10000 }
  conditions: [{
    field: String,
    operator: { type: String, enum: ['eq', 'neq', 'gt', 'lt', 'contains'] },
    value: Schema.Types.Mixed
  }],

  // Actions to take
  actions: [{
    type: { type: String, enum: ['email', 'notification', 'suspend_account'] },
    target: String, // email address or user role
    template: String // message content
  }],

  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = {
  Webhook: mongoose.model('Webhook', WebhookSchema),
  Workflow: mongoose.model('Workflow', WorkflowSchema)
};