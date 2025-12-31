// routes/v1/noteRoutes.js
const express = require("express");
const router = express.Router();

const noteController = require("../../controllers/noteController");
const authController = require("../../controllers/authController");
const { upload } = require("../../middleware/uploadMiddleware");
const {
  checkPermission,
  checkAnyPermission,
  checkAllPermissions,
  checkIsOwner,
  checkIsSuperAdmin,
} = require("../../middleware/permissionMiddleware");

// Apply authentication to all routes
router.use(authController.protect);

// ==================== MEDIA UPLOAD ====================
router.post(
  "/upload",
  checkPermission("file:upload"),
  upload.array("attachments", 5),
  noteController.uploadMedia,
);

// ==================== NOTE CRUD OPERATIONS ====================

// Get all notes with filters
router.get("/", checkPermission("note:read"), noteController.getNotes);

// Create new note
router.post("/", checkPermission("note:write"), noteController.createNote);

// Get single note by ID
router.get("/:id", checkPermission("note:read"), noteController.getNoteById);

// Update note
router.patch("/:id", checkPermission("note:write"), noteController.updateNote);

// Delete note (soft delete)
router.delete(
  "/:id",
  checkPermission("note:delete"),
  noteController.deleteNote,
);

// ==================== SEARCH & FILTERS ====================

// Search notes by text
router.get("/search", checkPermission("note:read"), noteController.searchNotes);

// ==================== CALENDAR & VIEWS ====================

// Get calendar view (notes and meetings)
router.get(
  "/calendar/view",
  checkPermission("note:view_calendar"),
  noteController.getCalendarView,
);

// Get monthly notes for calendar
router.get(
  "/calendar/monthly",
  checkPermission("note:read"),
  noteController.getNotesForMonth,
);

// ==================== ANALYTICS & HEAT MAP ====================

// Get heat map data (activity visualization)
router.get(
  "/analytics/heatmap",
  checkPermission("note:view_analytics"),
  noteController.getHeatMapData,
);

// Get note analytics
router.get(
  "/analytics/summary",
  checkAnyPermission(["note:view_analytics", "analytics:read"]),
  noteController.getNoteAnalytics,
);

// Export note data
router.get(
  "/export/data",
  checkPermission("note:export_data"),
  noteController.exportNoteData,
);

// ==================== SHARING & COLLABORATION ====================

// Share note with other users
router.post(
  "/:id/share",
  checkPermission("note:share"),
  noteController.shareNote,
);

// Get shared notes with me
router.get(
  "/shared/with-me",
  checkPermission("note:read"),
  noteController.getSharedNotesWithMe,
);

// Get notes shared by me
router.get(
  "/shared/by-me",
  checkPermission("note:read"),
  noteController.getNotesSharedByMe,
);

// Update sharing permissions
router.patch(
  "/:id/share/permissions",
  checkPermission("note:manage_shared"),
  noteController.updateSharePermissions,
);

// Remove user from shared note
router.delete(
  "/:id/share/:userId",
  checkPermission("note:manage_shared"),
  noteController.removeUserFromSharedNote,
);

// ==================== TEMPLATE OPERATIONS ====================

// Create note template
router.post(
  "/templates",
  checkPermission("note:create_template"),
  noteController.createNoteTemplate,
);

// Get all templates
router.get(
  "/templates",
  checkAnyPermission(["note:use_template", "note:create_template"]),
  noteController.getNoteTemplates,
);

// Create note from template
router.post(
  "/templates/:templateId/create",
  checkPermission("note:use_template"),
  noteController.createFromTemplate,
);

// Update template
router.patch(
  "/templates/:templateId",
  checkPermission("note:create_template"),
  noteController.updateNoteTemplate,
);

// Delete template
router.delete(
  "/templates/:templateId",
  checkPermission("note:create_template"),
  noteController.deleteNoteTemplate,
);

// ==================== BULK OPERATIONS ====================

// Bulk update notes
router.patch(
  "/bulk/update",
  checkPermission("note:bulk_update"),
  noteController.bulkUpdateNotes,
);

// Bulk delete notes
router.delete(
  "/bulk/delete",
  checkPermission("note:bulk_delete"),
  noteController.bulkDeleteNotes,
);

// ==================== SPECIAL OPERATIONS ====================

// Convert note to task
router.post(
  "/:id/convert-to-task",
  checkAllPermissions(["note:write", "task:create"]),
  noteController.convertToTask,
);

// Pin/unpin note
router.patch(
  "/:id/pin",
  checkPermission("note:pin"),
  noteController.togglePinNote,
);

// ==================== MEETING ROUTES ====================

// Create meeting
router.post(
  "/meetings",
  checkPermission("meeting:schedule"),
  noteController.createMeeting,
);

// Get user meetings
router.get(
  "/meetings",
  checkPermission("meeting:read"),
  noteController.getUserMeetings,
);

// Update meeting status
router.patch(
  "/meetings/:meetingId/status",
  checkPermission("meeting:write"),
  noteController.updateMeetingStatus,
);

// RSVP to meeting
router.post(
  "/meetings/:meetingId/rsvp",
  checkPermission("meeting:rsvp"),
  noteController.meetingRSVP,
);

// ==================== UTILITY ROUTES ====================

// Get note statistics
router.get(
  "/stats/summary",
  checkPermission("note:read"),
  noteController.getNoteStatistics,
);

// Get recent activity
router.get(
  "/activity/recent",
  checkPermission("note:read"),
  noteController.getRecentActivity,
);

// ==================== ADMIN/OWNER ONLY ROUTES ====================

// Get all organization notes (owners/super admins only)
router.get(
  "/organization/all",
  checkIsSuperAdmin(),
  noteController.getAllOrganizationNotes,
);

module.exports = router;
// // routes/v1/noteRoutes.js
// const express = require("express");
// const router = express.Router();

// const noteController = require("../../controllers/noteController");
// const authController = require("../../controllers/authController");
// const { upload } = require("../../middleware/uploadMiddleware");
// const {
//   checkPermission,
//   checkAnyPermission,
//   checkAllPermissions,
//   checkIsOwner,
//   checkIsSuperAdmin,
// } = require("../../middleware/permissionMiddleware");

// // Apply authentication to all routes
// router.use(authController.protect);

// // ==================== MEDIA UPLOAD ====================
// router.post(
//   "/upload",
//   checkPermission("file:upload"),
//   upload.array("attachments", 5),
//   noteController.uploadMedia,
// );

// // ==================== NOTE CRUD OPERATIONS ====================

// // Get all notes with filters
// router.get("/", checkPermission("note:read"), noteController.getNotes);

// // Create new note
// router.post("/", checkPermission("note:write"), noteController.createNote);

// // Get single note by ID
// router.get("/:id", checkPermission("note:read"), noteController.getNoteById);

// // Update note
// router.patch("/:id", checkPermission("note:write"), noteController.updateNote);

// // Delete note (soft delete)
// router.delete(
//   "/:id",
//   checkPermission("note:delete"),
//   noteController.deleteNote,
// );

// // ==================== SEARCH & FILTERS ====================

// // Search notes by text
// router.get("/search", checkPermission("note:read"), noteController.searchNotes);

// // ==================== CALENDAR & VIEWS ====================

// // Get calendar view (notes and meetings)
// router.get(
//   "/calendar/view",
//   checkPermission("note:view_calendar"),
//   noteController.getCalendarView,
// );

// // Get monthly notes for calendar
// router.get(
//   "/calendar/monthly",
//   checkPermission("note:read"),
//   noteController.getNotesForMonth,
// );

// // ==================== ANALYTICS & HEAT MAP ====================

// // Get heat map data (activity visualization)
// router.get(
//   "/analytics/heatmap",
//   checkPermission("note:view_analytics"),
//   noteController.getHeatMapData,
// );

// // Get note analytics
// router.get(
//   "/analytics/summary",
//   checkAnyPermission(["note:view_analytics", "analytics:read"]),
//   noteController.getNoteAnalytics,
// );

// // Export note data
// router.get(
//   "/export/data",
//   checkPermission("note:export_data"),
//   noteController.exportNoteData,
// );

// // ==================== SHARING & COLLABORATION ====================

// // Share note with other users
// router.post(
//   "/:id/share",
//   checkPermission("note:share"),
//   noteController.shareNote,
// );

// // Get shared notes with me
// router.get(
//   "/shared/with-me",
//   checkPermission("note:read"),
//   noteController.getSharedNotesWithMe,
// );

// // Get notes shared by me
// router.get(
//   "/shared/by-me",
//   checkPermission("note:read"),
//   noteController.getNotesSharedByMe,
// );

// // Update sharing permissions
// router.patch(
//   "/:id/share/permissions",
//   checkPermission("note:manage_shared"),
//   noteController.updateSharePermissions,
// );

// // Remove user from shared note
// router.delete(
//   "/:id/share/:userId",
//   checkPermission("note:manage_shared"),
//   noteController.removeUserFromSharedNote,
// );

// // ==================== TEMPLATE OPERATIONS ====================

// // Create note template
// router.post(
//   "/templates",
//   checkPermission("note:create_template"),
//   noteController.createNoteTemplate,
// );

// // Get all templates
// router.get(
//   "/templates",
//   checkAnyPermission(["note:use_template", "note:create_template"]),
//   noteController.getNoteTemplates,
// );

// // Create note from template
// router.post(
//   "/templates/:templateId/create",
//   checkPermission("note:use_template"),
//   noteController.createFromTemplate,
// );

// // Update template
// router.patch(
//   "/templates/:templateId",
//   checkPermission("note:create_template"),
//   noteController.updateNoteTemplate,
// );

// // Delete template
// router.delete(
//   "/templates/:templateId",
//   checkPermission("note:create_template"),
//   noteController.deleteNoteTemplate,
// );

// // ==================== BULK OPERATIONS ====================

// // Bulk update notes
// router.patch(
//   "/bulk/update",
//   checkPermission("note:bulk_update"),
//   noteController.bulkUpdateNotes,
// );

// // Bulk delete notes
// router.delete(
//   "/bulk/delete",
//   checkPermission("note:bulk_delete"),
//   noteController.bulkDeleteNotes,
// );

// // ==================== SPECIAL OPERATIONS ====================

// // Convert note to task
// router.post(
//   "/:id/convert-to-task",
//   checkAllPermissions(["note:write", "task:create"]),
//   noteController.convertToTask,
// );

// // Pin/unpin note
// router.patch(
//   "/:id/pin",
//   checkPermission("note:pin"),
//   noteController.togglePinNote,
// );

// // Archive note
// router.patch(
//   "/:id/archive",
//   checkPermission("note:write"),
//   noteController.archiveNote,
// );

// // Restore archived note
// router.patch(
//   "/:id/restore",
//   checkPermission("note:write"),
//   noteController.restoreNote,
// );

// // Duplicate note
// router.post(
//   "/:id/duplicate",
//   checkPermission("note:write"),
//   noteController.duplicateNote,
// );

// // ==================== MEETING ROUTES ====================

// // Get all meetings
// router.get(
//   "/meetings/all",
//   checkPermission("meeting:read"),
//   noteController.getAllMeetings,
// );

// // Create meeting
// router.post(
//   "/meetings",
//   checkPermission("meeting:schedule"),
//   noteController.createMeeting,
// );

// // Get meeting by ID
// router.get(
//   "/meetings/:meetingId",
//   checkPermission("meeting:read"),
//   noteController.getMeetingById,
// );

// // Update meeting
// router.patch(
//   "/meetings/:meetingId",
//   checkPermission("meeting:write"),
//   noteController.updateMeeting,
// );

// // Delete meeting
// router.delete(
//   "/meetings/:meetingId",
//   checkPermission("meeting:delete"),
//   noteController.deleteMeeting,
// );

// // Reschedule meeting
// router.patch(
//   "/meetings/:meetingId/reschedule",
//   checkPermission("meeting:reschedule"),
//   noteController.rescheduleMeeting,
// );

// // Cancel meeting
// router.patch(
//   "/meetings/:meetingId/cancel",
//   checkPermission("meeting:cancel"),
//   noteController.cancelMeeting,
// );

// // Invite participants to meeting
// router.post(
//   "/meetings/:meetingId/invite",
//   checkPermission("meeting:invite"),
//   noteController.inviteToMeeting,
// );

// // RSVP to meeting
// router.post(
//   "/meetings/:meetingId/rsvp",
//   checkPermission("meeting:rsvp"),
//   noteController.meetingRSVP,
// );

// // Start meeting
// router.post(
//   "/meetings/:meetingId/start",
//   checkPermission("meeting:start"),
//   noteController.startMeeting,
// );

// // End meeting
// router.post(
//   "/meetings/:meetingId/end",
//   checkPermission("meeting:end"),
//   noteController.endMeeting,
// );

// // Upload meeting materials
// router.post(
//   "/meetings/:meetingId/materials",
//   checkPermission("meeting:upload_materials"),
//   upload.array("materials", 10),
//   noteController.uploadMeetingMaterials,
// );

// // Get meeting attendance report
// router.get(
//   "/meetings/:meetingId/attendance",
//   checkPermission("meeting:view_attendance"),
//   noteController.getMeetingAttendance,
// );

// // Export meeting minutes
// router.get(
//   "/meetings/:meetingId/minutes/export",
//   checkPermission("meeting:export_minutes"),
//   noteController.exportMeetingMinutes,
// );

// // ==================== TASK ROUTES ====================

// // Get all tasks
// router.get(
//   "/tasks/all",
//   checkPermission("task:read"),
//   noteController.getAllTasks,
// );

// // Create task
// router.post("/tasks", checkPermission("task:write"), noteController.createTask);

// // Assign task to user
// router.post(
//   "/tasks/:taskId/assign",
//   checkPermission("task:assign"),
//   noteController.assignTask,
// );

// // Complete task
// router.patch(
//   "/tasks/:taskId/complete",
//   checkPermission("task:complete"),
//   noteController.completeTask,
// );

// // Reopen task
// router.patch(
//   "/tasks/:taskId/reopen",
//   checkPermission("task:reopen"),
//   noteController.reopenTask,
// );

// // Set task priority
// router.patch(
//   "/tasks/:taskId/priority",
//   checkPermission("task:set_priority"),
//   noteController.setTaskPriority,
// );

// // Set task deadline
// router.patch(
//   "/tasks/:taskId/deadline",
//   checkPermission("task:set_deadline"),
//   noteController.setTaskDeadline,
// );

// // Add subtask
// router.post(
//   "/tasks/:taskId/subtasks",
//   checkPermission("task:add_subtask"),
//   noteController.addSubtask,
// );

// // Track time on task
// router.post(
//   "/tasks/:taskId/track-time",
//   checkPermission("task:track_time"),
//   noteController.trackTaskTime,
// );

// // ==================== ADMIN/OWNER ONLY ROUTES ====================

// // Get all organization notes (owners/super admins only)
// router.get(
//   "/organization/all",
//   checkIsSuperAdmin(),
//   noteController.getAllOrganizationNotes,
// );

// // Manage organization templates (owners/super admins only)
// router.get(
//   "/organization/templates",
//   checkIsSuperAdmin(),
//   noteController.getOrganizationTemplates,
// );

// // Update organization template
// router.patch(
//   "/organization/templates/:templateId",
//   checkIsSuperAdmin(),
//   noteController.updateOrganizationTemplate,
// );

// // Delete organization template
// router.delete(
//   "/organization/templates/:templateId",
//   checkIsSuperAdmin(),
//   noteController.deleteOrganizationTemplate,
// );

// // Get organization analytics (owners/super admins only)
// router.get(
//   "/organization/analytics",
//   checkIsSuperAdmin(),
//   noteController.getOrganizationAnalytics,
// );

// // ==================== UTILITY ROUTES ====================

// // Get note statistics
// router.get(
//   "/stats/summary",
//   checkPermission("note:read"),
//   noteController.getNoteStatistics,
// );

// // Get recent activity
// router.get(
//   "/activity/recent",
//   checkPermission("note:read"),
//   noteController.getRecentActivity,
// );

// // Clean up old notes (owners/super admins only)
// router.post(
//   "/cleanup/old-notes",
//   checkIsSuperAdmin(),
//   noteController.cleanupOldNotes,
// );

// // Export all user notes
// router.get(
//   "/export/all",
//   checkPermission("note:export_data"),
//   noteController.exportAllUserNotes,
// );

// module.exports = router;

// // // routes/v1/noteRoutes.js - Example usage
// // const express = require("express");
// // const router = express.Router();

// // const { PERMISSIONS } = require("../../config/permissions");
// // const noteController = require("../../controllers/noteController");
// // const authController = require("../../controllers/authController");
// // const { upload } = require("../../middleware/uploadMiddleware");
// // const {
// //   checkPermission,
// //   checkAnyPermission,
// //   checkAllPermissions,
// // } = require("../../middleware/permissionMiddleware");

// // router.use(authController.protect);

// // // ==================== CALENDAR & ANALYTICS ====================
// // router.get(
// //   "/calendar",
// //   checkPermission(PERMISSIONS.NOTE.VIEW_CALENDAR),
// //   noteController.getCalendarView,
// // );

// // router.get(
// //   "/heatmap",
// //   checkPermission(PERMISSIONS.NOTE.VIEW_ANALYTICS),
// //   noteController.getHeatMapData,
// // );

// // router.get(
// //   "/analytics",
// //   checkPermission(PERMISSIONS.NOTE.VIEW_ANALYTICS),
// //   noteController.getNoteAnalytics,
// // );

// // // ==================== SEARCH ====================
// // router.get(
// //   "/search",
// //   checkPermission(PERMISSIONS.NOTE.READ),
// //   noteController.searchNotes,
// // );

// // // ==================== UPLOAD ====================
// // router.post(
// //   "/upload",
// //   checkPermission(PERMISSIONS.NOTE.WRITE),
// //   upload.array("attachments", 5),
// //   noteController.uploadMedia,
// // );

// // // ==================== MONTHLY STATS ====================
// // router.get(
// //   "/calendar/monthly",
// //   checkPermission(PERMISSIONS.NOTE.READ),
// //   noteController.getNotesForMonth,
// // );

// // // ==================== CRUD ROUTES ====================
// // router
// //   .route("/")
// //   .get(checkPermission(PERMISSIONS.NOTE.READ), noteController.getNotes)
// //   .post(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.createNote);

// // router
// //   .route("/:id")
// //   .get(checkPermission(PERMISSIONS.NOTE.READ), noteController.getNoteById)
// //   .patch(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.updateNote)
// //   .delete(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.deleteNote);

// // // ==================== MEETING ROUTES ====================
// // router
// //   .route("/meetings")
// //   .get(
// //     checkPermission(PERMISSIONS.MEETING.READ),
// //     noteController.getUserMeetings,
// //   )
// //   .post(
// //     checkPermission(PERMISSIONS.MEETING.WRITE),
// //     noteController.createMeeting,
// //   );

// // router
// //   .route("/meetings/:meetingId/status")
// //   .patch(
// //     checkPermission(PERMISSIONS.MEETING.WRITE),
// //     noteController.updateMeetingStatus,
// //   );

// // router.post(
// //   "/meetings/:meetingId/rsvp",
// //   checkPermission(PERMISSIONS.MEETING.READ),
// //   noteController.meetingRSVP,
// // );

// // // Make sure this is the only export
// // module.exports = router;
// // // // Note routes with enhanced permissions
// // // router.get(
// // //   "/calendar",
// // //   checkPermission(PERMISSIONS.NOTE.VIEW_CALENDAR),
// // //   noteController.getCalendarView,
// // // );

// // // router.get(
// // //   "/heatmap",
// // //   checkPermission(PERMISSIONS.NOTE.VIEW_ANALYTICS),
// // //   noteController.getHeatMapData,
// // // );

// // // router.post(
// // //   "/templates/:templateId",
// // //   checkAnyPermission([
// // //     PERMISSIONS.NOTE.CREATE_TEMPLATE,
// // //     PERMISSIONS.NOTE.USE_TEMPLATE,
// // //   ]),
// // //   noteController.createFromTemplate,
// // // );

// // // router.post(
// // //   "/:noteId/share",
// // //   checkPermission(PERMISSIONS.NOTE.SHARE),
// // //   noteController.shareNote,
// // // );

// // // // Meeting routes
// // // router.post(
// // //   "/meetings",
// // //   checkPermission(PERMISSIONS.MEETING.SCHEDULE),
// // //   noteController.createMeeting,
// // // );

// // // router.post(
// // //   "/meetings/:meetingId/rsvp",
// // //   checkPermission(PERMISSIONS.MEETING.RSVP),
// // //   noteController.meetingRSVP,
// // // );

// // // // Task routes
// // // router.post(
// // //   "/:noteId/convert-to-task",
// // //   checkAllPermissions([PERMISSIONS.NOTE.WRITE, PERMISSIONS.TASK.CREATE]),
// // //   noteController.convertToTask,
// // // );

// // // const express = require("express");
// // // const router = express.Router();

// // // const noteController = require("../../controllers/noteController");
// // // const authController = require("../../controllers/authController");
// // // const { upload } = require("../../middleware/uploadMiddleware");
// // // const { checkPermission } = require("../../middleware/permissionMiddleware");
// // // const { PERMISSIONS } = require("../../config/permissions");

// // // router.use(authController.protect);

// // // // ==================== CALENDAR & ANALYTICS ====================
// // // router.get(
// // //   "/calendar",
// // //   checkPermission(PERMISSIONS.NOTE.READ),
// // //   noteController.getCalendarView,
// // // );

// // // router.get(
// // //   "/heatmap",
// // //   checkPermission(PERMISSIONS.NOTE.READ),
// // //   noteController.getHeatMapData,
// // // );

// // // router.get(
// // //   "/analytics",
// // //   checkPermission(PERMISSIONS.NOTE.READ),
// // //   noteController.getNoteAnalytics,
// // // );

// // // // ==================== SEARCH ====================
// // // router.get(
// // //   "/search",
// // //   checkPermission(PERMISSIONS.NOTE.READ),
// // //   noteController.searchNotes,
// // // );

// // // // ==================== TEMPLATES ====================
// // // router.post(
// // //   "/templates/:templateId",
// // //   checkPermission(PERMISSIONS.NOTE.WRITE),
// // //   noteController.createFromTemplate,
// // // );

// // // // ==================== CONVERSION ====================
// // // router.patch(
// // //   "/:noteId/convert-to-task",
// // //   checkPermission(PERMISSIONS.NOTE.WRITE),
// // //   noteController.convertToTask,
// // // );

// // // // ==================== SHARING ====================
// // // router.post(
// // //   "/:noteId/share",
// // //   checkPermission(PERMISSIONS.NOTE.SHARE),
// // //   noteController.shareNote,
// // // );

// // // // ==================== UPLOAD ====================
// // // router.post(
// // //   "/upload",
// // //   checkPermission(PERMISSIONS.NOTE.WRITE),
// // //   upload.array("attachments", 5),
// // //   noteController.uploadMedia,
// // // );

// // // // ==================== MONTHLY STATS ====================
// // // router.get(
// // //   "/calendar/monthly",
// // //   checkPermission(PERMISSIONS.NOTE.READ),
// // //   noteController.getNotesForMonth,
// // // );

// // // // ==================== CRUD ROUTES ====================
// // // router
// // //   .route("/")
// // //   .get(checkPermission(PERMISSIONS.NOTE.READ), noteController.getNotes)
// // //   .post(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.createNote);

// // // router
// // //   .route("/:id")
// // //   .get(checkPermission(PERMISSIONS.NOTE.READ), noteController.getNoteById)
// // //   .patch(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.updateNote)
// // //   .delete(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.deleteNote);

// // // // ==================== MEETING ROUTES ====================
// // // router
// // //   .route("/meetings")
// // //   .get(
// // //     checkPermission(PERMISSIONS.MEETING.READ),
// // //     noteController.getUserMeetings,
// // //   )
// // //   .post(
// // //     checkPermission(PERMISSIONS.MEETING.WRITE),
// // //     noteController.createMeeting,
// // //   );

// // // router
// // //   .route("/meetings/:meetingId/status")
// // //   .patch(
// // //     checkPermission(PERMISSIONS.MEETING.WRITE),
// // //     noteController.updateMeetingStatus,
// // //   );

// // // router.post(
// // //   "/meetings/:meetingId/rsvp",
// // //   checkPermission(PERMISSIONS.MEETING.READ),
// // //   noteController.meetingRSVP,
// // // );

// // // module.exports = router;

// // // // const express = require("express");
// // // // const router = express.Router();
// // // // const noteController = require("../../controllers/noteController");
// // // // const authController = require("../../controllers/authController");
// // // // const { upload } = require("../../middleware/uploadMiddleware");
// // // // const { checkPermission } = require("../../middleware/permissionMiddleware");
// // // // const { PERMISSIONS } = require("../../config/permissions");

// // // // router.use(authController.protect);

// // // // /* ==================== NOTE ROUTES ==================== */

// // // // // Calendar & Heat Map
// // // // router.get(
// // // //   "/calendar",
// // // //   checkPermission(PERMISSIONS.NOTE.READ),
// // // //   noteController.getCalendarView,
// // // // );

// // // // router.get(
// // // //   "/heatmap",
// // // //   checkPermission(PERMISSIONS.NOTE.READ),
// // // //   noteController.getHeatMapData,
// // // // );

// // // // router.get(
// // // //   "/analytics",
// // // //   checkPermission(PERMISSIONS.NOTE.READ),
// // // //   noteController.getNoteAnalytics,
// // // // );

// // // // // Template operations
// // // // router.post(
// // // //   "/templates/:templateId",
// // // //   checkPermission(PERMISSIONS.NOTE.WRITE),
// // // //   noteController.createFromTemplate,
// // // // );

// // // // // Convert operations
// // // // router.patch(
// // // //   "/:noteId/convert-to-task",
// // // //   checkPermission(PERMISSIONS.NOTE.WRITE),
// // // //   noteController.convertToTask,
// // // // );

// // // // // Sharing
// // // // router.post(
// // // //   "/:noteId/share",
// // // //   checkPermission(PERMISSIONS.NOTE.SHARE),
// // // //   noteController.shareNote,
// // // // );

// // // // // CRUD operations
// // // // router
// // // //   .route("/")
// // // //   .get(checkPermission(PERMISSIONS.NOTE.READ), noteController.getNotes)
// // // //   .post(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.createNote);

// // // // router
// // // //   .route("/:id")
// // // //   .get(checkPermission(PERMISSIONS.NOTE.READ), noteController.getNoteById)
// // // //   .patch(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.updateNote)
// // // //   .delete(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.deleteNote);

// // // // /* ==================== MEETING ROUTES ==================== */

// // // // router
// // // //   .route("/meetings")
// // // //   .get(
// // // //     checkPermission(PERMISSIONS.MEETING.READ),
// // // //     noteController.getUserMeetings,
// // // //   )
// // // //   .post(
// // // //     checkPermission(PERMISSIONS.MEETING.WRITE),
// // // //     noteController.createMeeting,
// // // //   );

// // // // router
// // // //   .route("/meetings/:meetingId/status")
// // // //   .patch(
// // // //     checkPermission(PERMISSIONS.MEETING.WRITE),
// // // //     noteController.updateMeetingStatus,
// // // //   );

// // // // router.post(
// // // //   "/meetings/:meetingId/rsvp",
// // // //   checkPermission(PERMISSIONS.MEETING.READ),
// // // //   noteController.meetingRSVP,
// // // // );

// // // // module.exports = router;
// // // // // const express = require("express");
// // // // // const router = express.Router();

// // // // // const noteController = require("../../controllers/noteController");
// // // // // const authController = require("../../controllers/authController");
// // // // // const { upload } = require("../../middleware/uploadMiddleware");
// // // // // const { checkPermission } = require("../../middleware/permissionMiddleware");
// // // // // const { PERMISSIONS } = require("../../config/permissions");

// // // // // router.use(authController.protect);

// // // // // // Calendar and Search routes
// // // // // router.get(
// // // // //   '/calendar',
// // // // //   checkPermission(PERMISSIONS.NOTE.READ),
// // // // //   noteController.getNotesForMonth
// // // // // );
// // // // // router.get(
// // // // //   '/search',
// // // // //   checkPermission(PERMISSIONS.NOTE.READ),
// // // // //   noteController.searchNotes
// // // // // );

// // // // // // Media Upload
// // // // // router.post(
// // // // //   '/upload',
// // // // //   checkPermission(PERMISSIONS.NOTE.WRITE),
// // // // //   upload.array('attachments', 5),
// // // // //   noteController.uploadMedia
// // // // // );

// // // // // // CRUD Routes
// // // // // router.route('/')
// // // // //   .get(checkPermission(PERMISSIONS.NOTE.READ), noteController.getNotes)
// // // // //   .post(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.createNote);

// // // // // router.route('/:id')
// // // // //   .get(checkPermission(PERMISSIONS.NOTE.READ), noteController.getNoteById)
// // // // //   .patch(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.updateNote)
// // // // //   .delete(checkPermission(PERMISSIONS.NOTE.WRITE), noteController.deleteNote);

// // // // // module.exports = router;
