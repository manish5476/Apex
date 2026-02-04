// routes/v1/noteRoutes.js
const express = require("express");
const router = express.Router();

const noteController = require("../../modules/_legacy/controllers/noteController");
const authController = require("../../modules/auth/core/auth.controller");
const { upload } = require("../../core/middleware/upload.middleware");
const {
  checkPermission,
  checkAnyPermission,
  checkAllPermissions,
  checkIsOwner,
  checkIsSuperAdmin,
} = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Apply authentication to all routes
router.use(authController.protect);

// ==================== MEDIA UPLOAD ====================
router.post(
  "/upload",
  checkPermission(PERMISSIONS.FILE.UPLOAD),
  upload.array("attachments", 5),
  noteController.uploadMedia,
);

// ==================== NOTE CRUD OPERATIONS ====================

// Search notes by text
router.get("/search", checkPermission(PERMISSIONS.NOTE.READ), noteController.searchNotes);

// Get all notes with filters
router.get("/", checkPermission(PERMISSIONS.NOTE.READ), noteController.getNotes);

// Create new note
router.post("/", checkPermission(PERMISSIONS.NOTE.WRITE), noteController.createNote);

// Get single note by ID
router.get("/:id", checkPermission(PERMISSIONS.NOTE.READ), noteController.getNoteById);

// Update note
router.patch("/:id", checkPermission(PERMISSIONS.NOTE.WRITE), noteController.updateNote);

// Delete note (soft delete)
router.delete(
  "/:id",
  checkPermission(PERMISSIONS.NOTE.DELETE),
  noteController.deleteNote,
);

// ==================== SEARCH & FILTERS ====================

// ==================== CALENDAR & VIEWS ====================

// Get calendar view (notes and meetings)
router.get(
  "/calendar/view",
  checkPermission(PERMISSIONS.NOTE.VIEW_CALENDAR),
  noteController.getCalendarView,
);

// Get monthly notes for calendar
router.get(
  "/calendar/monthly",
  checkPermission(PERMISSIONS.NOTE.READ),
  noteController.getNotesForMonth,
);

// ==================== ANALYTICS & HEAT MAP ====================

// Get heat map data (activity visualization)
router.get(
  "/analytics/heatmap",
  checkPermission(PERMISSIONS.NOTE.VIEW_ANALYTICS),
  noteController.getHeatMapData,
);

// Get note analytics
router.get(
  "/analytics/summary",
  checkAnyPermission([PERMISSIONS.NOTE.VIEW_ANALYTICS, PERMISSIONS.ANALYTICS.READ]),
  noteController.getNoteAnalytics,
);

// Export note data
router.get(
  "/export/data",
  checkPermission(PERMISSIONS.NOTE.EXPORT_DATA),
  noteController.exportNoteData,
);

// ==================== SHARING & COLLABORATION ====================

// Share note with other users
router.post(
  "/:id/share",
  checkPermission(PERMISSIONS.NOTE.SHARE),
  noteController.shareNote,
);

// Get shared notes with me
router.get(
  "/shared/with-me",
  checkPermission(PERMISSIONS.NOTE.READ),
  noteController.getSharedNotesWithMe,
);

// Get notes shared by me
router.get(
  "/shared/by-me",
  checkPermission(PERMISSIONS.NOTE.READ),
  noteController.getNotesSharedByMe,
);

// Update sharing permissions
router.patch(
  "/:id/share/permissions",
  checkPermission(PERMISSIONS.NOTE.MANAGE_SHARED),
  noteController.updateSharePermissions,
);

// Remove user from shared note
router.delete(
  "/:id/share/:userId",
  checkPermission(PERMISSIONS.NOTE.MANAGE_SHARED),
  noteController.removeUserFromSharedNote,
);

// ==================== TEMPLATE OPERATIONS ====================

// Create note template
router.post(
  "/templates",
  checkPermission(PERMISSIONS.NOTE.CREATE_TEMPLATE),
  noteController.createNoteTemplate,
);

// Get all templates
router.get(
  "/templates",
  checkAnyPermission([PERMISSIONS.NOTE.USE_TEMPLATE, PERMISSIONS.NOTE.CREATE_TEMPLATE]),
  noteController.getNoteTemplates,
);

// Create note from template
router.post(
  "/templates/:templateId/create",
  checkPermission(PERMISSIONS.NOTE.USE_TEMPLATE),
  noteController.createFromTemplate,
);

// Update template
router.patch(
  "/templates/:templateId",
  checkPermission(PERMISSIONS.NOTE.CREATE_TEMPLATE),
  noteController.updateNoteTemplate,
);

// Delete template
router.delete(
  "/templates/:templateId",
  checkPermission(PERMISSIONS.NOTE.CREATE_TEMPLATE),
  noteController.deleteNoteTemplate,
);

// ==================== BULK OPERATIONS ====================

// Bulk update notes
router.patch(
  "/bulk/update",
  checkPermission(PERMISSIONS.NOTE.BULK_UPDATE),
  noteController.bulkUpdateNotes,
);

// Bulk delete notes
router.delete(
  "/bulk/delete",
  checkPermission(PERMISSIONS.NOTE.BULK_DELETE),
  noteController.bulkDeleteNotes,
);

// ==================== SPECIAL OPERATIONS ====================

// Convert note to task
router.post(
  "/:id/convert-to-task",
  checkAllPermissions([PERMISSIONS.NOTE.WRITE, PERMISSIONS.TASK.CREATE]),
  noteController.convertToTask,
);

// Pin/unpin note
router.patch(
  "/:id/pin",
  checkPermission(PERMISSIONS.NOTE.PIN),
  noteController.togglePinNote,
);

// ==================== MEETING ROUTES ====================

// Create meeting
router.post(
  "/meetings",
  checkPermission(PERMISSIONS.MEETING.SCHEDULE),
  noteController.createMeeting,
);

// Get user meetings
router.get(
  "/meetings",
  checkPermission(PERMISSIONS.MEETING.READ),
  noteController.getUserMeetings,
);

// Update meeting status
router.patch(
  "/meetings/:meetingId/status",
  checkPermission(PERMISSIONS.MEETING.WRITE),
  noteController.updateMeetingStatus,
);

// RSVP to meeting
router.post(
  "/meetings/:meetingId/rsvp",
  checkPermission(PERMISSIONS.MEETING.RSVP),
  noteController.meetingRSVP,
);

// ==================== UTILITY ROUTES ====================

// Get note statistics
router.get(
  "/stats/summary",
  checkPermission(PERMISSIONS.NOTE.READ),
  noteController.getNoteStatistics,
);

// Get recent activity
router.get(
  "/activity/recent",
  checkPermission(PERMISSIONS.NOTE.READ),
  noteController.getRecentActivity,
);

// ==================== ADMIN/OWNER ONLY ROUTES ====================
// Get all organization notes (owners/super admins only)
router.get(
  "/organization/all",
  checkIsSuperAdmin(),
  noteController.getAllOrganizationNotes,
);

// routes/v1/noteRoutes.js (Add these under Special Operations)

// Duplicate a note
router.post(
  "/:id/duplicate",
  checkPermission(PERMISSIONS.NOTE.WRITE), 
  noteController.duplicateNote
);

// Archive a note
router.patch(
  "/:id/archive",
  checkPermission(PERMISSIONS.NOTE.WRITE),
  noteController.archiveNote
);

// Restore an archived note
router.patch(
  "/:id/restore",
  checkPermission(PERMISSIONS.NOTE.WRITE),
  noteController.restoreNote
);

// Export ALL user notes (Controller has this, but route was missing)
router.get(
  "/export/all",
  checkPermission(PERMISSIONS.NOTE.EXPORT_DATA),
  noteController.exportAllUserNotes
);

// ==================== HISTORY (Fixes your 404) ====================
router.get(
  "/:id/history",
  checkPermission(PERMISSIONS.NOTE.READ),
  noteController.getNoteHistory
);

// ==================== SUBTASKS ====================
router.post(
  "/:id/subtasks",
  checkPermission(PERMISSIONS.NOTE.WRITE),
  noteController.addSubtask
);

router.patch(
  "/:id/subtasks/:subtaskId",
  checkPermission(PERMISSIONS.NOTE.WRITE),
  noteController.toggleSubtask
);

router.delete(
  "/:id/subtasks/:subtaskId",
  checkPermission(PERMISSIONS.NOTE.WRITE),
  noteController.removeSubtask
);

// ==================== TRASH MANAGEMENT ====================
// (You already have the soft delete route "/:id", this is for permanent)
router.delete(
  "/:id/permanent",
  checkPermission(PERMISSIONS.NOTE.DELETE),
  noteController.hardDeleteNote
);

// ==================== LINKING ====================
router.post(
  "/:id/link",
  checkPermission(PERMISSIONS.NOTE.WRITE),
  noteController.linkNote
);
module.exports = router;
