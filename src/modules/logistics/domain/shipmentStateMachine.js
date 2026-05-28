'use strict';

const SHIPMENT_STATUSES = Object.freeze({
  DRAFT: 'draft',
  READY_FOR_FULFILLMENT: 'ready_for_fulfillment',
  PENDING_ASSIGNMENT: 'pending_assignment',
  ASSIGNED: 'assigned',
  ACCEPTED: 'accepted',
  PICKUP_SCHEDULED: 'pickup_scheduled',
  PICKUP_STARTED: 'pickup_started',
  ARRIVED_AT_PICKUP: 'arrived_at_pickup',
  PICKED_UP: 'picked_up',
  IN_TRANSIT: 'in_transit',
  NEAR_DESTINATION: 'near_destination',
  DELIVERY_ATTEMPTED: 'delivery_attempted',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  RETURN_PENDING: 'return_pending',
  RETURN_IN_TRANSIT: 'return_in_transit',
  RETURNED: 'returned',
  CANCELLED: 'cancelled',
  ESCALATED: 'escalated'
});

const TERMINAL_STATUSES = new Set([
  SHIPMENT_STATUSES.DELIVERED,
  SHIPMENT_STATUSES.RETURNED,
  SHIPMENT_STATUSES.CANCELLED
]);

const TRANSITIONS = Object.freeze({
  mark_ready: {
    from: [SHIPMENT_STATUSES.DRAFT],
    to: SHIPMENT_STATUSES.READY_FOR_FULFILLMENT,
    eventType: 'shipment.ready_for_fulfillment'
  },
  request_assignment: {
    from: [SHIPMENT_STATUSES.READY_FOR_FULFILLMENT],
    to: SHIPMENT_STATUSES.PENDING_ASSIGNMENT,
    eventType: 'shipment.assignment_requested'
  },
  assign: {
    from: [SHIPMENT_STATUSES.PENDING_ASSIGNMENT, SHIPMENT_STATUSES.READY_FOR_FULFILLMENT],
    to: SHIPMENT_STATUSES.ASSIGNED,
    eventType: 'shipment.assigned'
  },
  accept: {
    from: [SHIPMENT_STATUSES.ASSIGNED],
    to: SHIPMENT_STATUSES.ACCEPTED,
    eventType: 'shipment.accepted'
  },
  schedule_pickup: {
    from: [SHIPMENT_STATUSES.ACCEPTED, SHIPMENT_STATUSES.ASSIGNED],
    to: SHIPMENT_STATUSES.PICKUP_SCHEDULED,
    eventType: 'shipment.pickup_scheduled'
  },
  start_pickup: {
    from: [SHIPMENT_STATUSES.ACCEPTED, SHIPMENT_STATUSES.PICKUP_SCHEDULED],
    to: SHIPMENT_STATUSES.PICKUP_STARTED,
    eventType: 'shipment.pickup_started'
  },
  arrive_pickup: {
    from: [SHIPMENT_STATUSES.PICKUP_STARTED],
    to: SHIPMENT_STATUSES.ARRIVED_AT_PICKUP,
    eventType: 'shipment.arrived_at_pickup'
  },
  confirm_pickup: {
    from: [SHIPMENT_STATUSES.ARRIVED_AT_PICKUP, SHIPMENT_STATUSES.PICKUP_STARTED],
    to: SHIPMENT_STATUSES.PICKED_UP,
    eventType: 'shipment.picked_up'
  },
  start_transit: {
    from: [SHIPMENT_STATUSES.PICKED_UP],
    to: SHIPMENT_STATUSES.IN_TRANSIT,
    eventType: 'shipment.in_transit'
  },
  near_destination: {
    from: [SHIPMENT_STATUSES.IN_TRANSIT],
    to: SHIPMENT_STATUSES.NEAR_DESTINATION,
    eventType: 'shipment.near_destination'
  },
  attempt_delivery: {
    from: [SHIPMENT_STATUSES.IN_TRANSIT, SHIPMENT_STATUSES.NEAR_DESTINATION],
    to: SHIPMENT_STATUSES.DELIVERY_ATTEMPTED,
    eventType: 'shipment.delivery_attempted'
  },
  deliver: {
    from: [SHIPMENT_STATUSES.IN_TRANSIT, SHIPMENT_STATUSES.NEAR_DESTINATION, SHIPMENT_STATUSES.DELIVERY_ATTEMPTED],
    to: SHIPMENT_STATUSES.DELIVERED,
    eventType: 'shipment.delivered'
  },
  fail: {
    from: [
      SHIPMENT_STATUSES.PENDING_ASSIGNMENT,
      SHIPMENT_STATUSES.ASSIGNED,
      SHIPMENT_STATUSES.ACCEPTED,
      SHIPMENT_STATUSES.PICKUP_STARTED,
      SHIPMENT_STATUSES.PICKED_UP,
      SHIPMENT_STATUSES.IN_TRANSIT,
      SHIPMENT_STATUSES.NEAR_DESTINATION,
      SHIPMENT_STATUSES.DELIVERY_ATTEMPTED
    ],
    to: SHIPMENT_STATUSES.FAILED,
    eventType: 'shipment.failed'
  },
  start_return: {
    from: [SHIPMENT_STATUSES.FAILED, SHIPMENT_STATUSES.DELIVERY_ATTEMPTED],
    to: SHIPMENT_STATUSES.RETURN_PENDING,
    eventType: 'shipment.return_requested'
  },
  return_in_transit: {
    from: [SHIPMENT_STATUSES.RETURN_PENDING],
    to: SHIPMENT_STATUSES.RETURN_IN_TRANSIT,
    eventType: 'shipment.return_in_transit'
  },
  complete_return: {
    from: [SHIPMENT_STATUSES.RETURN_IN_TRANSIT, SHIPMENT_STATUSES.RETURN_PENDING],
    to: SHIPMENT_STATUSES.RETURNED,
    eventType: 'shipment.returned'
  },
  cancel: {
    from: [
      SHIPMENT_STATUSES.DRAFT,
      SHIPMENT_STATUSES.READY_FOR_FULFILLMENT,
      SHIPMENT_STATUSES.PENDING_ASSIGNMENT,
      SHIPMENT_STATUSES.ASSIGNED,
      SHIPMENT_STATUSES.ACCEPTED,
      SHIPMENT_STATUSES.PICKUP_SCHEDULED
    ],
    to: SHIPMENT_STATUSES.CANCELLED,
    eventType: 'shipment.cancelled'
  },
  escalate: {
    from: Object.values(SHIPMENT_STATUSES).filter((status) => !TERMINAL_STATUSES.has(status)),
    to: SHIPMENT_STATUSES.ESCALATED,
    eventType: 'shipment.escalated'
  }
});

function getTransition(command) {
  return TRANSITIONS[command] || null;
}

function assertTransition(currentStatus, command) {
  const transition = getTransition(command);
  if (!transition) {
    const error = new Error(`Unknown shipment transition command: ${command}`);
    error.statusCode = 400;
    throw error;
  }

  if (!transition.from.includes(currentStatus)) {
    const error = new Error(`Cannot apply "${command}" when shipment is "${currentStatus}"`);
    error.statusCode = 409;
    throw error;
  }

  return transition;
}

module.exports = {
  SHIPMENT_STATUSES,
  TRANSITIONS,
  assertTransition
};
