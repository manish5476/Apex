const express = require('express');
const router = express.Router();
const multer = require('multer');
const noteController = require('../../controllers/noteController');
const authController = require('../../controllers/authController');
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(authController.protect);

router.post('/upload-media', checkPermission(PERMISSIONS.NOTE.WRITE), upload.array('files', 5), noteController.uploadMedia);
router.get('/calendar-summary', checkPermission(PERMISSIONS.NOTE.READ), noteController.getNotesForMonth);
router.get('/day/:date', checkPermission(PERMISSIONS.NOTE.READ), noteController.getNotesForDay);
router.get('/daily-count', checkPermission(PERMISSIONS.NOTE.READ), noteController.getNotesForMonth);
router.get('/search', checkPermission(PERMISSIONS.NOTE.READ), noteController.searchNotes);
router.patch('/:id/tags', checkPermission(PERMISSIONS.NOTE.WRITE), noteController.updateTags);

router.route('/')
  .get(checkPermission(PERMISSIONS.NOTE.READ), noteController.getNotes)
  .post(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.createNote);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.NOTE.READ), noteController.getNoteById)
  .patch(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.updateNote)
  .delete(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.deleteNote);

module.exports = router;



// const express = require('express');
// const multer = require('multer');
// const noteController = require('../../controllers/noteController');
// const authController = require('../../controllers/authController');

// const router = express.Router();

// // --- MULTER CONFIGURATION ---
// const upload = multer({ 
//   storage: multer.memoryStorage(),
//   limits: { fileSize: 5 * 1024 * 1024 } 
// });

// // Protect all routes
// router.use(authController.protect);

// // ============================================================
// // 1. SPECIFIC ROUTES (Must come FIRST)
// // ============================================================

// // Uploads
// router.post(
//   '/upload-media', 
//   upload.array('files', 5), 
//   noteController.uploadMedia
// );

// // Calendar & Summary endpoints
// router.get('/calendar-summary', noteController.getNotesForMonth);
// router.get('/day/:date', noteController.getNotesForDay);

// // Daily count endpoint (if you use a separate one, or reuse summary)
// router.get('/daily-count', noteController.getNotesForMonth); 

// // ============================================================
// // 2. GENERAL ROUTES ( / )
// // ============================================================
// router
//   .route('/')
//   .get(noteController.getNotes)
//   .post(noteController.createNote);

// // ============================================================
// // 3. GENERIC ID ROUTES (Must come LAST)
// // ============================================================
// // This catches /:id, so it must be at the bottom to avoid 
// // catching "calendar-summary" or "upload-media" by mistake.
// router
//   .route('/:id')
//   .get(noteController.getNoteById)
//   .patch(noteController.updateNote)
//   .delete(noteController.deleteNote);




// router.get('/search', noteController.searchNotes);
// router.patch('/:id/tags', noteController.updateTags);

// module.exports = router;
