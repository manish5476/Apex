const express = require('express');
const noteController = require('../../controllers/noteController');
const authController = require('../../controllers/authController');

const router = express.Router();

router.use(authController.protect);

router
  .route('/')
  .get(noteController.getNotes)
  .post( noteController.createNote);

router
  .route('/:id')
  .patch(noteController.updateNote)
  .delete(noteController.deleteNote);

/** ✅ NEW ROUTES FOR CALENDAR FEATURES **/
router.get(
  '/calendar-summary',
  noteController.getNotesForMonth
);

router.get(
  '/day/:date',
  noteController.getNotesForDay
);

module.exports = router; 