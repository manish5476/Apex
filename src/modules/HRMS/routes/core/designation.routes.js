// routes/core/designation.routes.js
const express = require('express');
const router = express.Router();
const designationController = require('../../controllers/core/designation.controller');
const { validateDesignation } = require('../../middleware/validators');
const authController = require("../../../auth/core/auth.controller");

// All routes require authentication
router.use(authController.protect);

// Special routes
router.get('/salary-bands', designationController.getSalaryBands);
router.get('/promotion-eligible', designationController.getPromotionEligible);
router.get('/hierarchy', designationController.getDesignationHierarchy);
router.post('/bulk', designationController.bulkCreateDesignations);

// Career path
router.get('/career-path/:id', designationController.getCareerPath);

// Standard CRUD
router.route('/')
  .get(designationController.getAllDesignations)
  .post(

    validateDesignation,
    designationController.createDesignation
  );

router.route('/:id')
  .get(designationController.getDesignation)
  .patch(

    validateDesignation,
    designationController.updateDesignation
  )
  .delete(designationController.deleteDesignation);

// Designation employees
router.get('/:id/employees', designationController.getDesignationEmployees);

module.exports = router;