const express = require("express");
const purchaseController = require("../../controllers/purchaseController");
const authController = require("../../controllers/authController");

const router = express.Router();

router.use(authController.protect);

// Permissions: read_purchases, create_purchases
router
  .route("/")
  .get(authController.restrictTo("read_purchases"), purchaseController.getAllPurchases)
  .post(authController.restrictTo("create_purchases"), purchaseController.createPurchase);

router
  .route("/:id")
  .get(authController.restrictTo("read_purchases"), purchaseController.getPurchase)
  .patch(authController.restrictTo("update_purchases"), purchaseController.updatePurchase)
  .delete(authController.restrictTo("delete_purchases"), purchaseController.deletePurchase);

module.exports = router;
