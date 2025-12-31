const express = require('express');
const router = express.Router();
const noteController = require('../controllers/noteController');
const authController = require('../controllers/authController');
const { upload } = require('../middleware/uploadMiddleware');
const { checkPermission } = require('../middleware/permissionMiddleware');
const { PERMISSIONS } = require('../config/permissions');

router.use(authController.protect);

/* ==================== NOTE ROUTES ==================== */

// Calendar & Heat Map
router.get(
  '/calendar',
  checkPermission(PERMISSIONS.NOTE.READ),
  noteController.getCalendarView
);

router.get(
  '/heatmap',
  checkPermission(PERMISSIONS.NOTE.READ),
  noteController.getHeatMapData
);

router.get(
  '/analytics',
  checkPermission(PERMISSIONS.NOTE.READ),
  noteController.getNoteAnalytics
);

// Template operations
router.post(
  '/templates/:templateId',
  checkPermission(PERMISSIONS.NOTE.WRITE),
  noteController.createFromTemplate
);

// Convert operations
router.patch(
  '/:noteId/convert-to-task',
  checkPermission(PERMISSIONS.NOTE.WRITE),
  noteController.convertToTask
);

// Sharing
router.post(
  '/:noteId/share',
  checkPermission(PERMISSIONS.NOTE.SHARE),
  noteController.shareNote
);

// CRUD operations
router.route('/')
  .get(checkPermission(PERMISSIONS.NOTE.READ), noteController.getNotes)
  .post(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.createNote);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.NOTE.READ), noteController.getNoteById)
  .patch(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.updateNote)
  .delete(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.deleteNote);

/* ==================== MEETING ROUTES ==================== */

router.route('/meetings')
  .get(checkPermission(PERMISSIONS.MEETING.READ), noteController.getUserMeetings)
  .post(checkPermission(PERMISSIONS.MEETING.WRITE), noteController.createMeeting);

router.route('/meetings/:meetingId/status')
  .patch(checkPermission(PERMISSIONS.MEETING.WRITE), noteController.updateMeetingStatus);

router.post(
  '/meetings/:meetingId/rsvp',
  checkPermission(PERMISSIONS.MEETING.READ),
  noteController.meetingRSVP
);

module.exports = router;
// const express = require("express");
// const router = express.Router();

// const noteController = require("../../controllers/noteController");
// const authController = require("../../controllers/authController");
// const { upload } = require("../../middleware/uploadMiddleware");
// const { checkPermission } = require("../../middleware/permissionMiddleware");
// const { PERMISSIONS } = require("../../config/permissions");

// router.use(authController.protect);

// // Calendar and Search routes
// router.get(
//   '/calendar', 
//   checkPermission(PERMISSIONS.NOTE.READ), 
//   noteController.getNotesForMonth
// );
// router.get(
//   '/search',
//   checkPermission(PERMISSIONS.NOTE.READ),
//   noteController.searchNotes
// );

// // Media Upload
// router.post(
//   '/upload', 
//   checkPermission(PERMISSIONS.NOTE.WRITE), 
//   upload.array('attachments', 5), 
//   noteController.uploadMedia
// );

// // CRUD Routes
// router.route('/')
//   .get(checkPermission(PERMISSIONS.NOTE.READ), noteController.getNotes)
//   .post(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.createNote);

// router.route('/:id')
//   .get(checkPermission(PERMISSIONS.NOTE.READ), noteController.getNoteById)
//   .patch(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.updateNote)
//   .delete(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.deleteNote);

// module.exports = router;
