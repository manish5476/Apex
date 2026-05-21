const express = require('express');
const formController = require('../controllers/storefrontForm.controller');
const authController = require('../../modules/auth/core/auth.controller');

const router = express.Router();

// ==========================================
// PUBLIC ROUTES (Used by the Storefront App)
// ==========================================

// POST /api/v1/store/:uniqueShopId/forms/submit
router.post('/store/:uniqueShopId/forms/submit', formController.submitForm);


// ==========================================
// PROTECTED ROUTES (Used by CRM Admin Dashboard)
// ==========================================

router.use(authController.protect);

// GET /api/v1/storefront-forms/submissions
router
  .route('/storefront-forms/submissions')
  .get(formController.getSubmissions);

router
  .route('/storefront-forms/submissions/:id')
  .patch(formController.updateSubmissionStatus)
  .delete(formController.deleteSubmission);

module.exports = router;
