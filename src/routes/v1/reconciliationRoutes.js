<<<<<<< HEAD
const express = require('express');
const router = express.Router();
const recon = require('../../controllers/reconciliationController');
const auth = require('../../controllers/authController');

router.use(auth.protect);
router.get('/top', recon.topMismatches);
router.get('/detail', recon.detail);
module.exports = router;
=======
// const express = require('express');
// const router = express.Router();
// const recon = require('../../controllers/reconciliationController');
// const auth = require('../../controllers/authController');

// router.use(auth.protect);
// router.get('/top', recon.topMismatches);
// router.get('/detail', recon.detail);
// module.exports = router;
>>>>>>> e9b25ad40e0445fb45883f37de0e63f61403ca9c
