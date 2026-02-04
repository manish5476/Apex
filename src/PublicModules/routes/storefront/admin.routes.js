// src/routes/storefront/admin.routes.js
const express = require('express');
const router = express.Router();
const auth = require('../../../core/middleware/auth.middleware');
const storefrontAdminController = require('../../controllers/storefront/storefrontAdmin.controller');

// All routes require authentication
router.use(auth.protect);

router.route('/layout')
  .get(storefrontAdminController.getLayout)
  .put(storefrontAdminController.updateLayout);
  
// Page management
router.route('/pages')
  .get(storefrontAdminController.getPages)
  .post(storefrontAdminController.createPage);
router.get('/themes', storefrontAdminController.getAvailableThemes);
router.route('/pages/:pageId')
  .get(storefrontAdminController.getPageById)
  .put(storefrontAdminController.updatePage)
  .delete(storefrontAdminController.deletePage);

router.post('/pages/:pageId/publish', storefrontAdminController.publishPage);
router.post('/pages/:pageId/unpublish', storefrontAdminController.unpublishPage);
router.post('/pages/:pageId/duplicate', storefrontAdminController.duplicatePage);

// Sections and templates
router.get('/sections', storefrontAdminController.getSectionTypes);
router.get('/templates', storefrontAdminController.getTemplates);

// Analytics
router.get('/pages/:pageId/analytics', storefrontAdminController.getPageAnalytics);

module.exports = router;