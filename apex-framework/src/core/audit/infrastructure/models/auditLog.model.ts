import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IAuditLog extends Document {
  userId?: Types.ObjectId;
  organizationId?: Types.ObjectId;
  action: string;
  entityType?: string;
  entityId?: Types.ObjectId;
  ip?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: false },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: false },
  action: { type: String, required: true },
  entityType: { type: String, required: false },
  entityId: { type: Schema.Types.ObjectId, required: false },
  ip: { type: String, required: false },
  userAgent: { type: String, required: false },
  meta: { type: Schema.Types.Mixed, required: false },
  createdAt: { type: Date, default: Date.now, index: true }
});

auditLogSchema.index({ organizationId: 1 });
auditLogSchema.index({ userId: 1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);