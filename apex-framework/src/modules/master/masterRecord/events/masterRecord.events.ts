import { eventBus } from '../../../../../core/events';
import { IMasterRecord } from '../../infrastructure/models/masterRecord.model';

/**
 * ⚠️ New infrastructure, not a port — old code never emitted events.
 * Required by the architecture's rule that modules communicate only via
 * events, not direct imports. Payloads carry only what other modules would
 * plausibly need (id, org, type) — no invented business meaning.
 */
export const MasterRecordEvents = {
  CREATED: 'masterRecord.created',
  UPDATED: 'masterRecord.updated',
  DELETED: 'masterRecord.deleted',
} as const;

export interface MasterRecordEventPayload {
  id: string;
  organizationId: unknown;
  type: string;
}

export function publishMasterRecordCreated(record: Pick<IMasterRecord, '_id' | 'organizationId' | 'type'>): void {
  eventBus.publish<MasterRecordEventPayload>(MasterRecordEvents.CREATED, {
    id: String(record._id),
    organizationId: record.organizationId,
    type: record.type,
  });
}

export function publishMasterRecordUpdated(record: Pick<IMasterRecord, '_id' | 'organizationId' | 'type'>): void {
  eventBus.publish<MasterRecordEventPayload>(MasterRecordEvents.UPDATED, {
    id: String(record._id),
    organizationId: record.organizationId,
    type: record.type,
  });
}

export function publishMasterRecordDeleted(id: string, organizationId: unknown, type: string): void {
  eventBus.publish<MasterRecordEventPayload>(MasterRecordEvents.DELETED, { id, organizationId, type });
}