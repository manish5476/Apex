const express = require('express');
// Ensure this path matches your actual file structure (e.g. ../controllers/...)
const masterListController = require('../../controllers/masterListController'); 
const authController = require('../../controllers/authController');

const router = express.Router();

// Protect all routes in this file
router.use(authController.protect);

// 1. Fetch EVERYTHING (Heavy load)
// Usage: Initial app load to get all dropdowns at once
// URL: GET /api/v1/masters/
router.get('/', masterListController.getMasterList);

// 2. Fetch SPECIFIC List (Lightweight & Dynamic)
// Usage: When you need just one list or need to search (e.g., searching for a specific Invoice)
// URL: GET /api/v1/masters/list?type=invoice
router.get('/list', masterListController.getSpecificList);

module.exports = router;