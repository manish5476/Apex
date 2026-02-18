// routes/core/designation.routes.js
const express = require('express');
const router = express.Router();
const designationController = require('../../controllers/core/designation.controller');
const { protect, restrictTo } = require('../../middleware/auth');
const { validateDesignation } = require('../../middleware/validators');

router.use(protect);

// Special routes
router.get('/salary-bands', restrictTo('admin', 'hr', 'finance'), designationController.getSalaryBands);
router.get('/promotion-eligible', restrictTo('admin', 'hr'), designationController.getPromotionEligible);
router.get('/hierarchy', designationController.getDesignationHierarchy);
router.post('/bulk', restrictTo('admin'), designationController.bulkCreateDesignations);

// Career path
router.get('/career-path/:id', designationController.getCareerPath);

// Standard CRUD
router.route('/')
  .get(designationController.getAllDesignations)
  .post(
    restrictTo('admin', 'hr'),
    validateDesignation,
    designationController.createDesignation
  );

router.route('/:id')
  .get(designationController.getDesignation)
  .patch(
    restrictTo('admin', 'hr'),
    validateDesignation,
    designationController.updateDesignation
  )
  .delete(restrictTo('admin'), designationController.deleteDesignation);

// Designation employees
router.get('/:id/employees', designationController.getDesignationEmployees);

module.exports = router;