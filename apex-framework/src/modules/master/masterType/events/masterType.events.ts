import { eventBus } from '../../../../../core/events';
import { IMasterType } from '../../infrastructure/models/masterType.model';

/**
 * ⚠️ New infrastructure, not a port — old code never emitted events.
 * Required by the architecture's cross-module communication rule.
 */
export const MasterTypeEvents = {
  CREATED: 'masterType.created',
  UPDATED: 'masterType.updated',
  DELETED: 'masterType.deleted',
} as const;

export interface MasterTypeEventPayload {
  id: string;
  name: string;
}

export function publishMasterTypeCreated(record: Pick<IMasterType, '_id' | 'name'>): void {
  eventBus.publish<MasterTypeEventPayload>(MasterTypeEvents.CREATED, {
    id: String(record._id),
    name: record.name,
  });
}

export function publishMasterTypeUpdated(record: Pick<IMasterType, '_id' | 'name'>): void {
  eventBus.publish<MasterTypeEventPayload>(MasterTypeEvents.UPDATED, {
    id: String(record._id),
    name: record.name,
  });
}

export function publishMasterTypeDeleted(id: string, name: string): void {
  eventBus.publish<MasterTypeEventPayload>(MasterTypeEvents.DELETED, { id, name });
}