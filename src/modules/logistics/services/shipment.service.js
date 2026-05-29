'use strict';

const Shipment = require('../models/shipment.model');
const ShipmentEvent = require('../models/shipmentEvent.model');
const ShipmentActivity = require('../models/shipmentActivity.model');
const OutboxEvent = require('../models/outboxEvent.model');
const mongoose = require('mongoose');
const { assertTransition } = require('../domain/shipmentStateMachine');

function requiredTenantError(field) {
  const err = new Error(`${field} is required for logistics tenancy`);
  err.statusCode = 400;
  return err;
}

function normalizeTenantScope(user, body = {}) {
  const organizationId = user?.organizationId || body.organizationId;
  if (!organizationId) throw requiredTenantError('organizationId');

  return {
    organizationId,
    businessId: body.businessId || null,
    storeId: body.storeId || body.shopId || user?.branchId || null,
    shopId: body.shopId || null,
    warehouseId: body.warehouseId || null
  };
}

async function nextSequence(shipmentId) {
  const lastEvent = await ShipmentEvent.findOne({ aggregateId: shipmentId }).sort({ sequence: -1 }).lean();
  return (lastEvent?.sequence || 0) + 1;
}

async function recordShipmentEvent({ shipment, eventType, actor, fromStatus, toStatus, reason, payload, requestId }) {
  const sequence = await nextSequence(shipment._id);
  await ShipmentEvent.create({
    organizationId: shipment.organizationId,
    aggregateId: shipment._id,
    eventType,
    sequence,
    actorId: actor?._id || actor?.id || null,
    actorType: actor?.type || 'user',
    fromStatus,
    toStatus,
    reason: reason || '',
    payload: payload || {},
    requestId: requestId || ''
  });

  await ShipmentActivity.create({
    organizationId: shipment.organizationId,
    shipmentId: shipment._id,
    type: eventType,
    title: humanizeEvent(eventType),
    body: reason || statusBody(fromStatus, toStatus),
    actorId: actor?._id || actor?.id || null,
    actorName: actor?.name || actor?.email || '',
    metadata: payload || {}
  });

  await OutboxEvent.create({
    topic: 'logistics.shipment.events',
    eventType,
    aggregateId: shipment._id,
    organizationId: shipment.organizationId,
    payload: {
      shipmentId: shipment._id,
      shipmentNumber: shipment.shipmentNumber,
      trackingNumber: shipment.trackingNumber,
      organizationId: shipment.organizationId,
      fromStatus,
      toStatus,
      ...payload
    }
  });
}

function humanizeEvent(eventType) {
  return eventType
    .replace(/^shipment\./, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusBody(fromStatus, toStatus) {
  if (!fromStatus) return `Shipment entered ${toStatus}`;
  return `Shipment moved from ${fromStatus} to ${toStatus}`;
}

async function createShipment({ user, body, requestId }) {
  const tenant = normalizeTenantScope(user, body);
  const shipment = await Shipment.create({
    ...tenant,
    sourceType: body.sourceType || 'manual',
    sourceId: body.sourceId || null,
    sourceNumber: body.sourceNumber || '',
    fulfillmentMode: body.fulfillmentMode || 'merchant_internal',
    priority: body.priority || 'normal',
    serviceLevel: body.serviceLevel || 'standard',
    slaDeadlineAt: body.slaDeadlineAt || null,
    scheduledPickupAt: body.scheduledPickupAt || null,
    promisedDeliveryAt: body.promisedDeliveryAt || null,
    pickupAddress: body.pickupAddress,
    dropoffAddress: body.dropoffAddress,
    returnAddress: body.returnAddress || null,
    parcels: body.parcels || [],
    cod: body.cod || undefined,
    customer: body.customer || undefined,
    notes: body.notes || '',
    metadata: body.metadata || {}
  });

  await recordShipmentEvent({
    shipment,
    eventType: 'shipment.created',
    actor: user,
    fromStatus: '',
    toStatus: shipment.status,
    reason: 'Shipment created',
    payload: { sourceType: shipment.sourceType, sourceId: shipment.sourceId },
    requestId
  });

  return shipment;
}

async function listShipments({ user, query }) {
  const organizationId = user?.organizationId || query.organizationId;
  if (!organizationId) throw requiredTenantError('organizationId');

  const filter = { organizationId };
  if (query.status) filter.status = query.status;
  if (query.fulfillmentMode) filter.fulfillmentMode = query.fulfillmentMode;
  if (query.storeId) filter.storeId = query.storeId;
  if (query.search) {
    filter.$or = [
      { shipmentNumber: new RegExp(query.search, 'i') },
      { trackingNumber: new RegExp(query.search, 'i') },
      { sourceNumber: new RegExp(query.search, 'i') },
      { 'customer.name': new RegExp(query.search, 'i') },
      { 'customer.phone': new RegExp(query.search, 'i') }
    ];
  }

  const limit = Math.min(Number(query.limit) || 50, 200);
  const page = Math.max(Number(query.page) || 1, 1);
  const [items, total] = await Promise.all([
    Shipment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Shipment.countDocuments(filter)
  ]);

  return { items, total, page, limit };
}

async function transitionShipment({ user, shipmentId, body, requestId }) {
  const organizationId = user?.organizationId || body.organizationId;
  if (!organizationId) throw requiredTenantError('organizationId');

  const shipment = await Shipment.findOne({ _id: shipmentId, organizationId });
  if (!shipment) {
    const err = new Error('Shipment not found');
    err.statusCode = 404;
    throw err;
  }

  const transition = assertTransition(shipment.status, body.command);
  const fromStatus = shipment.status;

  shipment.status = transition.to;
  shipment.lastEventType = transition.eventType;
  shipment.lastEventAt = new Date();

  if (body.assignedDriverId) shipment.assignedDriverId = body.assignedDriverId;
  if (body.assignedVehicleId) shipment.assignedVehicleId = body.assignedVehicleId;
  if (body.providerId) shipment.providerId = body.providerId;
  if (body.partnerId) shipment.partnerId = body.partnerId;
  if (body.codCollected === true) {
    shipment.cod.collected = true;
    shipment.cod.collectedAt = new Date();
  }

  await shipment.save();

  await recordShipmentEvent({
    shipment,
    eventType: transition.eventType,
    actor: user,
    fromStatus,
    toStatus: shipment.status,
    reason: body.reason || '',
    payload: body.metadata || {},
    requestId
  });

  return shipment;
}

async function getShipmentDetail({ user, shipmentId }) {
  const organizationId = user?.organizationId;
  if (!organizationId) throw requiredTenantError('organizationId');

  const [shipment, activity, events] = await Promise.all([
    Shipment.findOne({ _id: shipmentId, organizationId }).lean(),
    ShipmentActivity.find({ shipmentId, organizationId }).sort({ occurredAt: -1 }).limit(100).lean(),
    ShipmentEvent.find({ aggregateId: shipmentId, organizationId }).sort({ sequence: 1 }).lean()
  ]);

  if (!shipment) {
    const err = new Error('Shipment not found');
    err.statusCode = 404;
    throw err;
  }

  return { shipment, activity, events };
}

async function getOperationsSummary({ user }) {
  const organizationId = user?.organizationId;
  if (!organizationId) throw requiredTenantError('organizationId');
  const scopedOrganizationId = new mongoose.Types.ObjectId(String(organizationId));

  const [byStatus, slaRisk, recent] = await Promise.all([
    Shipment.aggregate([
      { $match: { organizationId: scopedOrganizationId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    Shipment.countDocuments({
      organizationId,
      status: { $nin: ['delivered', 'returned', 'cancelled'] },
      slaDeadlineAt: { $lte: new Date(Date.now() + 60 * 60 * 1000) }
    }),
    Shipment.find({ organizationId }).sort({ updatedAt: -1 }).limit(8).lean()
  ]);

  return {
    byStatus,
    slaRisk,
    recent,
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  createShipment,
  listShipments,
  transitionShipment,
  getShipmentDetail,
  getOperationsSummary
};
