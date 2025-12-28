const express = require("express");
const router = express.Router();

const noteController = require("../../controllers/noteController");
const authController = require("../../controllers/authController");
const { upload } = require("../../middleware/uploadMiddleware");
const { checkPermission } = require("../../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../../config/permissions");

router.use(authController.protect);

// Calendar and Search routes
router.get(
  '/calendar', 
  checkPermission(PERMISSIONS.NOTE.READ), 
  noteController.getNotesForMonth
);

router.get(
  '/search',
  checkPermission(PERMISSIONS.NOTE.READ),
  noteController.searchNotes
);

// Media Upload
router.post(
  '/upload', 
  checkPermission(PERMISSIONS.NOTE.WRITE), 
  upload.array('attachments', 5), 
  noteController.uploadMedia
);

// CRUD Routes
router.route('/')
  .get(checkPermission(PERMISSIONS.NOTE.READ), noteController.getNotes)
  .post(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.createNote);

router.route('/:id')
  .get(checkPermission(PERMISSIONS.NOTE.READ), noteController.getNoteById)
  .patch(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.updateNote)
  .delete(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.deleteNote);

module.exports = router;