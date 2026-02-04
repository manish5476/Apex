// src/publicModules/routes/index.js
const express = require('express');
const router = express.Router();

const storefrontPublicRoutes = require('./public.routes');
const storefrontAdminRoutes = require('./admin.routes');
// src/routes/index.js
const smartRuleRoutes = require('./smartRule.routes');

// Add to existing routes
router.use('/admin/storefront/smart-rules', smartRuleRoutes);
router.use('/public', storefrontPublicRoutes);
router.use('/admin/storefront', storefrontAdminRoutes);

module.exports = router;