// src/routes/invoicePDFRoutes.js
const express = require("express");
const authController = require("../../controllers/authController");
const invoicePDFController = require("../../controllers/invoicePDFController");

const router = express.Router();
router.use(authController.protect);
// FIXED: Changed .generateInvoicePDF -> .downloadInvoicePDF
router.get("/:id/download", invoicePDFController.downloadInvoicePDF);
// FIXED: Changed .sendInvoiceEmail -> .emailInvoice
router.post("/:id/email", invoicePDFController.emailInvoice);
module.exports = router;
