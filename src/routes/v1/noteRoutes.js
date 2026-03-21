const express = require("express");
const router = express.Router();

const noteController = require("../../modules/Notes/noteController");
const authController = require("../../modules/auth/core/auth.controller");
const { upload } = require("../../core/middleware/upload.middleware");
const { checkPermission, checkAnyPermission, checkAllPermissions, checkIsSuperAdmin} = require("../../core/middleware/permission.middleware");
const { PERMISSIONS } = require("../../config/permissions");

// Apply authentication to all routes
router.use(authController.protect);

// ==============================================================================
// 1. GLOBAL & STATIC MODULES (Must come before /:id routes)
// ==============================================================================

// --- MEDIA & FILES ---
router.post("/upload", checkPermission(PERMISSIONS.FILE.UPLOAD), upload.array("attachments", 5), noteController.uploadMedia);

// --- SEARCH ---
router.get("/search", checkPermission(PERMISSIONS.NOTE.READ), noteController.searchNotes);

// --- VISUALIZATION & ANALYTICS ---
router.get("/graph/network", checkPermission(PERMISSIONS.NOTE.READ), noteController.getKnowledgeGraph);
router.get("/analytics/heatmap", checkPermission(PERMISSIONS.NOTE.VIEW_ANALYTICS), noteController.getHeatMapData);
router.get("/analytics/summary", checkAnyPermission([PERMISSIONS.NOTE.VIEW_ANALYTICS, PERMISSIONS.ANALYTICS.READ]), noteController.getNoteAnalytics);

// --- CALENDAR MODULE ---
router.get("/calendar/view", checkPermission(PERMISSIONS.NOTE.VIEW_CALENDAR), noteController.getCalendarView);
router.get("/calendar/monthly", checkPermission(PERMISSIONS.NOTE.READ), noteController.getNotesForMonth);

// --- STATISTICS & ACTIVITY ---
router.get("/stats/summary", checkPermission(PERMISSIONS.NOTE.READ), noteController.getNoteStatistics);
router.get("/activity/recent", checkPermission(PERMISSIONS.NOTE.READ), noteController.getRecentActivity);

// --- EXPORT MODULE ---
router.get("/export/data", checkPermission(PERMISSIONS.NOTE.EXPORT_DATA), noteController.exportNoteData);
router.get("/export/all", checkPermission(PERMISSIONS.NOTE.EXPORT_DATA), noteController.exportAllUserNotes);

// --- TEMPLATES MODULE ---
router.post("/templates", checkPermission(PERMISSIONS.NOTE.CREATE_TEMPLATE), noteController.createNoteTemplate);
router.get("/templates", checkAnyPermission([PERMISSIONS.NOTE.USE_TEMPLATE, PERMISSIONS.NOTE.CREATE_TEMPLATE]), noteController.getNoteTemplates);
router.post("/templates/:templateId/create", checkPermission(PERMISSIONS.NOTE.USE_TEMPLATE), noteController.createFromTemplate);
router.patch("/templates/:templateId", checkPermission(PERMISSIONS.NOTE.CREATE_TEMPLATE), noteController.updateNoteTemplate);
router.delete("/templates/:templateId", checkPermission(PERMISSIONS.NOTE.CREATE_TEMPLATE), noteController.deleteNoteTemplate);

// --- BULK OPERATIONS ---
router.patch("/bulk/update", checkPermission(PERMISSIONS.NOTE.BULK_UPDATE), noteController.bulkUpdateNotes);
router.delete("/bulk/delete", checkPermission(PERMISSIONS.NOTE.BULK_DELETE), noteController.bulkDeleteNotes);

// --- TRASH MANAGEMENT ---
router.get("/trash/bin", checkPermission(PERMISSIONS.NOTE.READ), noteController.getTrash);
router.post("/trash/:id/restore", checkPermission(PERMISSIONS.NOTE.WRITE), noteController.restoreFromTrash);
router.delete("/trash/empty", checkPermission(PERMISSIONS.NOTE.DELETE), noteController.emptyTrash);

// --- MEETING MODULE ---
router.post("/meetings", checkPermission(PERMISSIONS.MEETING.SCHEDULE), noteController.createMeeting);
router.get("/meetings", checkPermission(PERMISSIONS.MEETING.READ), noteController.getUserMeetings);
router.patch("/meetings/:meetingId/status", checkPermission(PERMISSIONS.MEETING.WRITE), noteController.updateMeetingStatus);
router.post("/meetings/:meetingId/rsvp", checkPermission(PERMISSIONS.MEETING.RSVP), noteController.meetingRSVP);

// --- SHARED LISTS ---
router.get("/shared/with-me", checkPermission(PERMISSIONS.NOTE.READ), noteController.getSharedNotesWithMe);
router.get("/shared/by-me", checkPermission(PERMISSIONS.NOTE.READ), noteController.getNotesSharedByMe);

// --- ADMIN ---
router.get("/organization/all", checkIsSuperAdmin(), noteController.getAllOrganizationNotes);

// ==============================================================================
// 2. CORE CRUD (Generic Root)
// ==============================================================================
router.get("/", checkPermission(PERMISSIONS.NOTE.READ), noteController.getNotes);
router.post("/", checkPermission(PERMISSIONS.NOTE.WRITE), noteController.createNote);

// ==============================================================================
// 3. ID-DEPENDENT ROUTES (Must come last)
// ==============================================================================

// --- SUBTASKS ---
router.post("/:id/subtasks", checkPermission(PERMISSIONS.NOTE.WRITE), noteController.addSubtask);
router.patch("/:id/subtasks/:subtaskId", checkPermission(PERMISSIONS.NOTE.WRITE), noteController.toggleSubtask);
router.delete("/:id/subtasks/:subtaskId", checkPermission(PERMISSIONS.NOTE.WRITE), noteController.removeSubtask);

// --- SHARING & PERMISSIONS ---
router.post("/:id/share", checkPermission(PERMISSIONS.NOTE.SHARE), noteController.shareNote);
router.patch("/:id/share/permissions", checkPermission(PERMISSIONS.NOTE.MANAGE_SHARED), noteController.updateSharePermissions);
router.delete("/:id/share/:userId", checkPermission(PERMISSIONS.NOTE.MANAGE_SHARED), noteController.removeUserFromSharedNote);

// --- UTILITY ACTIONS ---
router.post("/:id/link", checkPermission(PERMISSIONS.NOTE.WRITE), noteController.linkNote);
router.post("/:id/convert-to-task", checkAllPermissions([PERMISSIONS.NOTE.WRITE, PERMISSIONS.TASK.CREATE]), noteController.convertToTask);
router.post("/:id/duplicate", checkPermission(PERMISSIONS.NOTE.WRITE), noteController.duplicateNote);
router.patch("/:id/pin", checkPermission(PERMISSIONS.NOTE.PIN), noteController.togglePinNote);
router.patch("/:id/archive", checkPermission(PERMISSIONS.NOTE.WRITE), noteController.archiveNote);
router.patch("/:id/restore", checkPermission(PERMISSIONS.NOTE.WRITE), noteController.restoreNote);

// --- INFO & HISTORY ---
router.get("/:id/history", checkPermission(PERMISSIONS.NOTE.READ), noteController.getNoteHistory);
router.delete("/:id/permanent", checkPermission(PERMISSIONS.NOTE.DELETE), noteController.hardDeleteNote);

// --- STANDARD RESOURCE ACCESS (Always Last) ---
router.get("/:id", checkPermission(PERMISSIONS.NOTE.READ), noteController.getNoteById);
router.patch("/:id", checkPermission(PERMISSIONS.NOTE.WRITE), noteController.updateNote);
router.delete("/:id", checkPermission(PERMISSIONS.NOTE.DELETE), noteController.deleteNote);

module.exports = router;
