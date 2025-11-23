const express = require('express');
const multer = require('multer');
const noteController = require('../../controllers/noteController');
const authController = require('../../controllers/authController');

const router = express.Router();

// --- MULTER CONFIGURATION ---
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } 
});

// Protect all routes
router.use(authController.protect);

// ============================================================
// 1. SPECIFIC ROUTES (Must come FIRST)
// ============================================================

// Uploads
router.post(
  '/upload-media', 
  upload.array('files', 5), 
  noteController.uploadMedia
);

// Calendar & Summary endpoints
router.get('/calendar-summary', noteController.getNotesForMonth);
router.get('/day/:date', noteController.getNotesForDay);

// Daily count endpoint (if you use a separate one, or reuse summary)
router.get('/daily-count', noteController.getNotesForMonth); 

// ============================================================
// 2. GENERAL ROUTES ( / )
// ============================================================
router
  .route('/')
  .get(noteController.getNotes)
  .post(noteController.createNote);

// ============================================================
// 3. GENERIC ID ROUTES (Must come LAST)
// ============================================================
// This catches /:id, so it must be at the bottom to avoid 
// catching "calendar-summary" or "upload-media" by mistake.
router
  .route('/:id')
  .get(noteController.getNoteById)
  .patch(noteController.updateNote)
  .delete(noteController.deleteNote);

module.exports = router;

// const express = require('express');
// const multer = require('multer'); // IMPORT MULTER
// const noteController = require('../../controllers/noteController');
// const authController = require('../../controllers/authController');

// const router = express.Router();

// // --- MULTER CONFIGURATION ---
// // Store files in memory (RAM) as buffers so we can pass them to Cloudinary
// const upload = multer({ 
//   storage: multer.memoryStorage(),
//   limits: { fileSize: 5 * 1024 * 1024 } // Limit to 5MB per file (optional safety)
// });

// // Protect all routes
// router.use(authController.protect);

// // --- UPLOAD ROUTE (Step 1 of creation) ---
// // 'files' is the name of the field the frontend must use in FormData
// // 5 is the max number of files allowed at once
// router.post(
//   '/upload-media', 
//   upload.array('files', 5), 
//   noteController.uploadMedia
// );

// // --- NOTE ROUTES (Step 2 of creation) ---
// router
//   .route('/')
//   .get(noteController.getNotes)
//   .post(noteController.createNote); // Send the uploaded URLs/Ids here

// router
//   .route('/:id')
//   .get(noteController.getNoteById)
//   .patch(noteController.updateNote)
//   .delete(noteController.deleteNote);

// // Calendar / summary endpoints
// router.get('/calendar-summary', noteController.getNotesForMonth);
// router.get('/day/:date', noteController.getNotesForDay);

// module.exports = router;
