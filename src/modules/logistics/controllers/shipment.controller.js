'use strict';

const shipmentService = require('../services/shipment.service');

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function sendSuccess(res, data, statusCode = 200) {
  res.status(statusCode).json({ status: 'success', data });
}

exports.createShipment = asyncHandler(async (req, res) => {
  const shipment = await shipmentService.createShipment({
    user: req.user,
    body: req.body,
    requestId: req.id
  });
  sendSuccess(res, shipment, 201);
});

exports.listShipments = asyncHandler(async (req, res) => {
  const result = await shipmentService.listShipments({
    user: req.user,
    query: req.query
  });
  sendSuccess(res, result);
});

exports.getShipment = asyncHandler(async (req, res) => {
  const detail = await shipmentService.getShipmentDetail({
    user: req.user,
    shipmentId: req.params.shipmentId
  });
  sendSuccess(res, detail);
});

exports.transitionShipment = asyncHandler(async (req, res) => {
  const shipment = await shipmentService.transitionShipment({
    user: req.user,
    shipmentId: req.params.shipmentId,
    body: req.body,
    requestId: req.id
  });
  sendSuccess(res, shipment);
});

exports.getOperationsSummary = asyncHandler(async (req, res) => {
  const summary = await shipmentService.getOperationsSummary({ user: req.user });
  sendSuccess(res, summary);
});
