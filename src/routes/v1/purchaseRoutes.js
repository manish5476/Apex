const express = require("express");
const multer = require("multer");
const purchaseController = require("../../controllers/purchaseController");
const authController = require("../../controllers/authController");

const router = express.Router();
router.use(authController.protect);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, });
router
  .route("/")
  .get(authController.restrictTo("read_purchases"), purchaseController.getAllPurchases)
  .post(authController.restrictTo("create_purchases"), upload.array("attachments", 10), purchaseController.createPurchase);
router
  .route("/:id")
  .get(authController.restrictTo("read_purchases"), purchaseController.getPurchase)
  .patch(authController.restrictTo("update_purchases"), upload.array("attachments", 10), purchaseController.updatePurchase)
  .delete(authController.restrictTo("delete_purchases"), purchaseController.deletePurchase);

// remove one attached file
router.delete("/:id/attachments/:fileIndex", authController.restrictTo("update_purchases"), purchaseController.deleteAttachment);
module.exports = router;

// const fd = new FormData();
// fd.append('supplierId', supplierId);
// fd.append('invoiceNumber', invoiceNum);
// fd.append('items', JSON.stringify(itemsArray));
// files.forEach(f => fd.append('attachments', f));
// this.api.post('/purchases', fd).subscribe(...)