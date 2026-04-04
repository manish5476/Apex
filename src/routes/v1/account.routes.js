const express = require('express');
const router = express.Router();
const accountController = require('../../modules/accounting/core/account.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { checkPermission } = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

/**
 * GET /hierarchy
 * @payload none
 */
router.get('/hierarchy', checkPermission(PERMISSIONS.ACCOUNT.READ), accountController.getHierarchy);

/**
 * PUT /:id/reparent
 * @params { id }
 * @payload { parentId* }
 */
router.put('/:id/reparent', checkPermission(PERMISSIONS.ACCOUNT.MANAGE), accountController.reparentAccount);

router.route('/')
  /**
   * GET /
   * @payload none
   */
  .get(checkPermission(PERMISSIONS.ACCOUNT.READ), accountController.getAccounts) 
  /**
   * POST /
   * @payload { name*, type*, parentId, description }
   */
  .post(checkPermission(PERMISSIONS.ACCOUNT.MANAGE), accountController.createAccount);

router.route('/:id')
  /**
   * GET /:id
   * @params { id }
   * @payload none
   */
  .get(checkPermission(PERMISSIONS.ACCOUNT.READ), accountController.getAccount)
  /**
   * PUT /:id
   * @params { id }
   * @payload { name, type, parentId, description }
   */
  .put(checkPermission(PERMISSIONS.ACCOUNT.MANAGE), accountController.updateAccount)
  /**
   * DELETE /:id
   * @params { id }
   * @payload none
   */
  .delete(checkPermission(PERMISSIONS.ACCOUNT.MANAGE), accountController.deleteAccount);

module.exports = router;