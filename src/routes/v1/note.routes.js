// routes/notes.routes.js
// ─────────────────────────────────────────────────────────────────────────────
//  Notes, Tasks, and Meetings router.
//  Updated to match the refactored noteController and meetingController.
//
//  Route ordering rules (critical for Express):
//    1. Literal static paths first  (e.g. /search, /trash/bin)
//    2. Generic root CRUD           (GET / POST /)
//    3. Param routes last           (/:id and sub-paths)
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();

const noteController = require('../../modules/Notes/note.controller');
const meetingController = require('../../modules/Notes/meeting.controller');
const authController = require('../../modules/auth/core/auth.controller');
const { upload } = require('../../core/middleware/upload.middleware');
const {
  checkPermission,
  checkAnyPermission,
  checkAllPermissions,
  checkIsSuperAdmin,
} = require('../../core/middleware/permission.middleware');
const { PERMISSIONS } = require('../../config/permissions');

// All routes require authentication
router.use(authController.protect);

// ==============================================================================
// 1. MEDIA & FILES
// ==============================================================================

router.post('/upload', checkPermission(PERMISSIONS.FILE.UPLOAD), upload.array('attachments', 5), noteController.uploadMedia);

// ==============================================================================
// 2. SEARCH & GRAPH
// ==============================================================================

router.get('/search', checkPermission(PERMISSIONS.NOTE.READ), noteController.searchNotes);
router.get('/graph/network', checkPermission(PERMISSIONS.NOTE.READ), noteController.getKnowledgeGraph);

// ==============================================================================
// 3. ANALYTICS
// ==============================================================================

router.get('/analytics/heatmap', checkPermission(PERMISSIONS.NOTE.VIEW_ANALYTICS), noteController.getHeatMapData);
router.get('/analytics/summary', checkAnyPermission([PERMISSIONS.NOTE.VIEW_ANALYTICS, PERMISSIONS.ANALYTICS.READ]), noteController.getNoteAnalytics);
router.get('/stats/summary', checkPermission(PERMISSIONS.NOTE.READ), noteController.getNoteStatistics);
router.get('/activity/recent', checkPermission(PERMISSIONS.NOTE.READ), noteController.getRecentActivity);

// ==============================================================================
// 4. CALENDAR
// ==============================================================================

router.get('/calendar/view', checkPermission(PERMISSIONS.NOTE.VIEW_CALENDAR), noteController.getCalendarView);
router.get('/calendar/monthly', checkPermission(PERMISSIONS.NOTE.READ), noteController.getNotesForMonth);

// ==============================================================================
// 5. EXPORT
// ==============================================================================

router.get('/export/data', checkPermission(PERMISSIONS.NOTE.EXPORT_DATA), noteController.exportNoteData);
router.get('/export/all', checkPermission(PERMISSIONS.NOTE.EXPORT_DATA), noteController.exportAllUserNotes);

// ==============================================================================
// 6. TEMPLATES
// ==============================================================================

router.post('/templates', checkPermission(PERMISSIONS.NOTE.CREATE_TEMPLATE), noteController.createNoteTemplate);
router.get('/templates', checkAnyPermission([PERMISSIONS.NOTE.USE_TEMPLATE, PERMISSIONS.NOTE.CREATE_TEMPLATE]), noteController.getNoteTemplates);
router.post('/templates/:templateId/create', checkPermission(PERMISSIONS.NOTE.USE_TEMPLATE), noteController.createFromTemplate);
router.patch('/templates/:templateId', checkPermission(PERMISSIONS.NOTE.CREATE_TEMPLATE), noteController.updateNoteTemplate);
router.delete('/templates/:templateId', checkPermission(PERMISSIONS.NOTE.CREATE_TEMPLATE), noteController.deleteNoteTemplate);

// ==============================================================================
// 7. BULK OPERATIONS
// ==============================================================================

router.patch('/bulk/update', checkPermission(PERMISSIONS.NOTE.BULK_UPDATE), noteController.bulkUpdateNotes);
router.delete('/bulk/delete', checkPermission(PERMISSIONS.NOTE.BULK_DELETE), noteController.bulkDeleteNotes);

// ==============================================================================
// 8. TRASH
// ==============================================================================

router.get('/trash/bin', checkPermission(PERMISSIONS.NOTE.READ), noteController.getTrash);
router.post('/trash/:id/restore', checkPermission(PERMISSIONS.NOTE.WRITE), noteController.restoreFromTrash);
router.delete('/trash/empty', checkPermission(PERMISSIONS.NOTE.DELETE), noteController.emptyTrash);

// ==============================================================================
// 9. MEETINGS(all /meetings/* before /:id to avoid param capture)
// ==============================================================================

// --- Meeting CRUD ---
router.post('/meetings', checkPermission(PERMISSIONS.MEETING.SCHEDULE), meetingController.createMeeting);
router.get('/meetings', checkPermission(PERMISSIONS.MEETING.READ), meetingController.getUserMeetings);
router.get('/meetings/:meetingId', checkPermission(PERMISSIONS.MEETING.READ), meetingController.getMeetingById);
router.patch('/meetings/:meetingId', checkPermission(PERMISSIONS.MEETING.WRITE), meetingController.updateMeeting);
router.delete('/meetings/:meetingId/cancel', checkPermission(PERMISSIONS.MEETING.WRITE), meetingController.cancelMeeting);

// --- Meeting RSVP & Attendance ---
router.post('/meetings/:meetingId/rsvp', checkPermission(PERMISSIONS.MEETING.RSVP), meetingController.meetingRSVP);
router.post('/meetings/:meetingId/join', checkPermission(PERMISSIONS.MEETING.READ), meetingController.joinMeeting);
router.post('/meetings/:meetingId/leave', checkPermission(PERMISSIONS.MEETING.READ), meetingController.leaveMeeting);

// --- Meeting Participants ---
router.post('/meetings/:meetingId/participants', checkPermission(PERMISSIONS.MEETING.WRITE), meetingController.addParticipants);
router.delete('/meetings/:meetingId/participants/:userId', checkPermission(PERMISSIONS.MEETING.WRITE), meetingController.removeParticipant);

// --- Meeting Action Items ---
router.post('/meetings/:meetingId/action-items', checkPermission(PERMISSIONS.MEETING.WRITE), meetingController.addActionItem);
router.post('/meetings/:meetingId/action-items/:actionItemId/convert', checkAllPermissions([PERMISSIONS.MEETING.WRITE, PERMISSIONS.NOTE.WRITE]), meetingController.convertActionItemToTask);

// --- Meeting Polls ---
router.post('/meetings/:meetingId/polls', checkPermission(PERMISSIONS.MEETING.WRITE), meetingController.createPoll);
router.post('/meetings/:meetingId/polls/:pollId/vote', checkPermission(PERMISSIONS.MEETING.READ), meetingController.votePoll);

// --- Meeting Analytics ---
router.get('/meetings/analytics/summary', checkPermission(PERMISSIONS.MEETING.READ), meetingController.getMeetingAnalytics);

// ==============================================================================
// 10. SHARED LISTS
// ==============================================================================

router.get('/shared/with-me', checkPermission(PERMISSIONS.NOTE.READ), noteController.getSharedNotesWithMe);
router.get('/shared/by-me', checkPermission(PERMISSIONS.NOTE.READ), noteController.getNotesSharedByMe);

// ==============================================================================
// 11. ADMIN
// ==============================================================================

router.get('/organization/all', checkIsSuperAdmin(), noteController.getAllOrganizationNotes);

// ==============================================================================
// 12. CORE CRUD (root — must come after all /specific-paths)
// ==============================================================================

router.get('/', checkPermission(PERMISSIONS.NOTE.READ), noteController.getNotes);
router.post('/', checkPermission(PERMISSIONS.NOTE.WRITE), noteController.createNote);

// ==============================================================================
// 13. PARAM ROUTES — /:id and sub-paths (always last)
// ==============================================================================

// --- Comments ---
router.get('/:id/comments', checkPermission(PERMISSIONS.NOTE.READ), noteController.getComments);
router.post('/:id/comments', checkPermission(PERMISSIONS.NOTE.WRITE), noteController.addComment);
router.delete('/:id/comments/:commentId', checkPermission(PERMISSIONS.NOTE.WRITE), noteController.deleteComment);
router.post('/:id/comments/:commentId/react', checkPermission(PERMISSIONS.NOTE.READ), noteController.reactToComment);

// --- Assignment ---
router.post('/:id/assign', checkPermission(PERMISSIONS.NOTE.WRITE), noteController.assignUsers);
router.patch('/:id/assignment-status', checkPermission(PERMISSIONS.NOTE.WRITE), noteController.updateAssignmentStatus);

// --- Checklist / Subtasks ---
router.post('/:id/checklist', checkPermission(PERMISSIONS.NOTE.WRITE), noteController.addChecklistItem);
router.patch('/:id/checklist/:subtaskId', checkPermission(PERMISSIONS.NOTE.WRITE), noteController.toggleSubtask);
router.delete('/:id/checklist/:subtaskId', checkPermission(PERMISSIONS.NOTE.WRITE), noteController.removeSubtask);
// Backward-compatible aliases (old routes used /subtasks)
router.post('/:id/subtasks', checkPermission(PERMISSIONS.NOTE.WRITE), noteController.addSubtask);
router.patch('/:id/subtasks/:subtaskId', checkPermission(PERMISSIONS.NOTE.WRITE), noteController.toggleSubtask);
router.delete('/:id/subtasks/:subtaskId', checkPermission(PERMISSIONS.NOTE.WRITE), noteController.removeSubtask);

// --- Time Tracking ---
router.post('/:id/time-log', checkPermission(PERMISSIONS.NOTE.WRITE), noteController.logTime);

// --- Sharing & Permissions ---
router.post('/:id/share', checkPermission(PERMISSIONS.NOTE.SHARE), noteController.shareNote);
router.patch('/:id/share/permissions', checkPermission(PERMISSIONS.NOTE.MANAGE_SHARED), noteController.updateSharePermissions);
router.delete('/:id/share/:userId', checkPermission(PERMISSIONS.NOTE.MANAGE_SHARED), noteController.removeUserFromSharedNote);

// --- Utility Actions ---
router.post('/:id/link', checkPermission(PERMISSIONS.NOTE.WRITE), noteController.linkNote);
router.post('/:id/unlink', checkPermission(PERMISSIONS.NOTE.WRITE), noteController.unlinkNote);
router.post('/:id/duplicate', checkPermission(PERMISSIONS.NOTE.WRITE), noteController.duplicateNote);
router.post('/:id/convert-to-task', checkAllPermissions([PERMISSIONS.NOTE.WRITE, PERMISSIONS.TASK.CREATE]), noteController.convertToTask);
router.patch('/:id/pin', checkPermission(PERMISSIONS.NOTE.PIN), noteController.togglePinNote);
router.patch('/:id/archive', checkPermission(PERMISSIONS.NOTE.WRITE), noteController.archiveNote);
router.patch('/:id/restore', checkPermission(PERMISSIONS.NOTE.WRITE), noteController.restoreNote);

// --- History & Hard Delete ---
router.get('/:id/history', checkPermission(PERMISSIONS.NOTE.READ), noteController.getNoteHistory);
router.delete('/:id/permanent', checkPermission(PERMISSIONS.NOTE.DELETE), noteController.hardDeleteNote);

// --- Standard CRUD (always last within /:id block) ---
router.get('/:id', checkPermission(PERMISSIONS.NOTE.READ), noteController.getNoteById);
router.patch('/:id', checkPermission(PERMISSIONS.NOTE.WRITE), noteController.updateNote);
router.delete('/:id', checkPermission(PERMISSIONS.NOTE.DELETE), noteController.deleteNote);

module.exports = router;

