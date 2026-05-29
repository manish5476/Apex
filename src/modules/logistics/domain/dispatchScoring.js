'use strict';

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function scoreDispatchCandidate(candidate = {}, shipment = {}, weights = {}) {
  const resolvedWeights = {
    proximity: 0.25,
    availability: 0.2,
    capacity: 0.2,
    reliability: 0.2,
    cost: 0.1,
    sla: 0.05,
    ...weights
  };

  const signals = {
    proximity: clamp(candidate.proximityScore ?? 50),
    availability: clamp(candidate.availabilityScore ?? (candidate.status === 'available' ? 100 : 20)),
    capacity: clamp(candidate.capacityScore ?? 70),
    reliability: clamp(candidate.reliabilityScore ?? 70),
    cost: clamp(candidate.costScore ?? 70),
    sla: clamp(candidate.slaScore ?? (shipment.priority === 'urgent' ? 80 : 65))
  };

  const weightedScore = Object.entries(resolvedWeights).reduce((total, [key, weight]) => {
    return total + ((signals[key] || 0) * weight);
  }, 0);

  const riskPenalty = clamp(candidate.riskPenalty || 0);

  return {
    score: clamp(Math.round(weightedScore - riskPenalty)),
    signals,
    weights: resolvedWeights,
    riskPenalty
  };
}

module.exports = {
  scoreDispatchCandidate
};
