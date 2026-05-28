'use strict';

const { assertTransition, SHIPMENT_STATUSES } = require('../src/modules/logistics/domain/shipmentStateMachine');
const { scoreDispatchCandidate } = require('../src/modules/logistics/domain/dispatchScoring');

describe('logistics shipment state machine', () => {
  test('allows valid lifecycle transitions', () => {
    const transition = assertTransition(SHIPMENT_STATUSES.DRAFT, 'mark_ready');
    expect(transition.to).toBe(SHIPMENT_STATUSES.READY_FOR_FULFILLMENT);
    expect(transition.eventType).toBe('shipment.ready_for_fulfillment');
  });

  test('rejects invalid lifecycle transitions', () => {
    expect(() => assertTransition(SHIPMENT_STATUSES.DRAFT, 'deliver')).toThrow(
      'Cannot apply "deliver" when shipment is "draft"'
    );
  });
});

describe('logistics dispatch scoring', () => {
  test('returns a bounded score and scoring trace', () => {
    const result = scoreDispatchCandidate(
      {
        status: 'available',
        proximityScore: 88,
        capacityScore: 74,
        reliabilityScore: 91,
        costScore: 62,
        riskPenalty: 7
      },
      { priority: 'urgent' }
    );

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.signals.proximity).toBe(88);
    expect(result.riskPenalty).toBe(7);
  });
});
