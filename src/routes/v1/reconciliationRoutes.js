const express = require('express');
const router = express.Router();
const recon = require('../../controllers/reconciliationController');
const auth = require('../../controllers/authController');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(auth.protect);

router.get('/top', checkPermission(PERMISSIONS.RECONCILIATION.READ), recon.topMismatches);
router.get('/detail', checkPermission(PERMISSIONS.RECONCILIATION.READ), recon.detail);

module.exports = router;

// const express = require('express');
// const router = express.Router();
// const recon = require('../../controllers/reconciliationController');
// const auth = require('../../controllers/authController');

// router.use(auth.protect);
// router.get('/top', recon.topMismatches);
// router.get('/detail', recon.detail);
// module.exports = router;
