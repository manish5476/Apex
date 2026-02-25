const mongoose = require("mongoose");
const Note = require("./noteModel");
const Meeting = require("./meetingModel");
const User = require("../auth/core/user.model");
const catchAsync = require("../../core/utils/api/catchAsync");
const AppError = require("../../core/utils/api/appError");
const { emitToUser, emitToOrg } = require("../../socketHandlers/socket");
const { uploadImage } = require('../uploads/imageUploadService');

const startOfDay = (date) => { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; };
const endOfDay = (date) => { const d = new Date(date); d.setHours(23, 59, 59, 999); return d; };
const extractHashtags = (text) => {
  if (!text) return [];
  const hashRegex = /#(\w+)/g;
  const matches = text.match(hashRegex);
  return matches ? matches.map(tag => tag.substring(1).toLowerCase()) : [];
};

const getEventColor = (noteType, priority) => {
  const colors = {
    note: { low: "#6b7280", medium: "#3b82f6", high: "#f59e0b", urgent: "#ef4444", },
    task: { low: "#10b981", medium: "#8b5cf6", high: "#f97316", urgent: "#dc2626", },
    meeting: "#4f46e5",
    idea: "#8b5cf6",
    journal: "#14b8a6",
    project: "#f59e0b",
  };
  if (noteType === "meeting") return colors.meeting;
  return colors[noteType]?.[priority] || colors.note.medium;
};

/* ==================== MEDIA UPLOAD ==================== */
exports.uploadMedia = catchAsync(async (req, res, next) => {
  if (!req.files || !req.files.length) { return next(new AppError('Please upload at least one file.', 400)); }
  const uploadedFiles = [];
  const uploadPromises = req.files.map(async (file) => {
    if (!file.mimetype.startsWith('image/')) { throw new AppError('Only image uploads are supported.', 400); }
    const uploaded = await uploadImage(file.buffer, 'notes');
    return {
      url: uploaded.url || uploaded,
      publicId: uploaded.publicId || null,
      fileType: 'image',
      fileName: file.originalname,
      size: file.size
    };
  });
  const results = await Promise.all(uploadPromises);
  res.status(201).json({
    status: 'success',
    message: 'Media uploaded successfully',
    data: results
  });
});

/* ==================== GET NOTES (Enhanced Filter) ==================== */
exports.getNotes = catchAsync(async (req, res) => {
  const { type, status, priority, category, date, startDate, endDate, tag, search, isPinned, projectId, page = 1, limit = 20, sort = "-createdAt" } = req.query;

  const filter = {
    organizationId: req.user.organizationId,
    isDeleted: false,
    $or: [
      { owner: req.user._id },
      { sharedWith: req.user._id },
      { visibility: "organization" },
      { "participants.user": req.user._id }
    ],
  };

  // Standard filters
  if (type) filter.noteType = type;
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (category) filter.category = category;
  if (projectId) filter.projectId = projectId;
  if (isPinned) filter.isPinned = isPinned === 'true';

  // Tag filter (array intersection)
  if (tag) {
    filter.tags = { $in: Array.isArray(tag) ? tag : [tag] };
  }

  // Date filters
  if (date) {
    filter.$or = [
      { startDate: { $gte: startOfDay(date), $lte: endOfDay(date) } },
      { dueDate: { $gte: startOfDay(date), $lte: endOfDay(date) } },
      { createdAt: { $gte: startOfDay(date), $lte: endOfDay(date) } },
    ];
  } else if (startDate || endDate) {
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    // Smart filter: checks start, due, OR created date
    filter.$or = [
      { startDate: dateFilter },
      { dueDate: dateFilter },
      { createdAt: dateFilter },
    ];
  }

  // Text Search
  if (search) {
    filter.$text = { $search: search };
  }

  const skip = (page - 1) * limit;

  // Execute query with Lean for performance
  const [notes, total] = await Promise.all([
    Note.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate("owner", "name email avatar")
      .populate("participants.user", "name email avatar")
      .select("-content") // Optimization: Don't fetch heavy content for list view, fetch only on detail
      .lean(),
    Note.countDocuments(filter),
  ]);

  res.status(200).json({
    status: "success",
    data: {
      notes,
      pagination: { total, page: parseInt(page), pages: Math.ceil(total / limit), limit: parseInt(limit) },
    },
  });
});

/* ==================== GET NOTE BY ID ==================== */
exports.getNoteById = catchAsync(async (req, res, next) => {
  const note = await Note.findOne({
    _id: req.params.id,
    isDeleted: false,
    $or: [
      { owner: req.user._id },
      { sharedWith: req.user._id },
      { visibility: "organization" },
      { "participants.user": req.user._id }
    ],
  })
    .populate("owner", "name email avatar")
    .populate("participants.user", "name email avatar")
    .populate("projectId", "name")
    .populate("relatedNotes", "title noteType status");

  if (!note) { return next(new AppError("Note not found or access denied", 404)); }

  note.logActivity("viewed", req.user._id);
  note.save({ validateBeforeSave: false });
  res.status(200).json({
    status: "success",
    data: { note },
  });
});

/* ==================== UPDATE NOTE ==================== */
exports.updateNote = catchAsync(async (req, res, next) => {
  const { content, tags, relatedNotes, ...updates } = req.body;
  let finalTags = tags;
  if (content) {
    const extractedTags = extractHashtags(content);
    if (tags) {
      finalTags = [...new Set([...tags, ...extractedTags])];
    }
  }
  const note = await Note.findOne({ _id: req.params.id, owner: req.user._id, isDeleted: false });
  if (!note) return next(new AppError("Note not found", 404));

  // 3. Optimistic Concurrency Control (Optional but Pro)
  // if (req.body.__v !== undefined && note.__v !== req.body.__v) {
  //   return next(new AppError("This note has been modified by someone else. Please refresh.", 409));
  // }

  if (relatedNotes) {
    const newLinks = relatedNotes.filter(id => !note.relatedNotes.includes(id));
    if (newLinks.length > 0) {
      await Note.updateMany(
        { _id: { $in: newLinks } },
        { $addToSet: { relatedNotes: note._id } }
      );
    }
    note.relatedNotes = relatedNotes;
  }

  Object.keys(updates).forEach(key => note[key] = updates[key]);
  if (content) note.content = content;
  if (finalTags) note.tags = finalTags;
  note.logActivity("updated", req.user._id);
  const updatedNote = await note.save();
  await updatedNote.populate("owner participants.user relatedNotes");
  res.status(200).json({
    status: "success",
    data: { note: updatedNote },
  });
});

/* ==================== DELETE NOTE (Soft) ==================== */
exports.deleteNote = catchAsync(async (req, res, next) => {
  const note = await Note.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id },
    {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: req.user._id,
      status: 'archived'
    },
    { new: true },
  );
  if (!note) return next(new AppError("Note not found", 404));
  res.status(204).json({ status: "success", data: null });
});

/* ==================== TRASH MANAGEMENT ==================== */
exports.getTrash = catchAsync(async (req, res) => {
  const notes = await Note.find({ owner: req.user._id, isDeleted: true }).sort('-deletedAt').lean();
  res.status(200).json({ status: 'success', data: { notes } });
});

exports.restoreFromTrash = catchAsync(async (req, res, next) => {
  const note = await Note.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id, isDeleted: true },
    { isDeleted: false, deletedAt: null, deletedBy: null, status: 'active' },
    { new: true }
  );
  if (!note) return next(new AppError("Note not found in trash", 404));
  res.status(200).json({ status: 'success', data: { note } });
});

exports.emptyTrash = catchAsync(async (req, res) => {
  await Note.deleteMany({ owner: req.user._id, isDeleted: true });
  res.status(204).json({ status: 'success', data: null });
});

/* ==================== SEARCH NOTES ==================== */
exports.searchNotes = catchAsync(async (req, res) => {
  const query = req.query.q?.trim();
  if (!query) return res.status(200).json({ status: 'success', data: { notes: [] } });

  // Use aggregation for a robust search (Text match + partial match fallback)
  const notes = await Note.find(
    {
      organizationId: req.user.organizationId,
      isDeleted: false,
      $or: [
        { owner: req.user._id },
        { sharedWith: req.user._id },
        { visibility: 'organization' }
      ],
      $text: { $search: query }
    },
    { score: { $meta: 'textScore' } }
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(50)
    .lean();

  res.status(200).json({ status: 'success', data: { notes } });
});

/* ==================== KNOWLEDGE GRAPH ==================== */
exports.getKnowledgeGraph = catchAsync(async (req, res) => {
  // Fetches minimal data to construct a node-link graph (Obsidian style)
  const notes = await Note.find({
    owner: req.user._id,
    isDeleted: false
  }).select('_id title noteType relatedNotes category').lean();

  const nodes = notes.map(n => ({
    id: n._id,
    label: n.title,
    group: n.category || 'Uncategorized',
    type: n.noteType
  }));

  const links = [];
  notes.forEach(source => {
    if (source.relatedNotes && source.relatedNotes.length) {
      source.relatedNotes.forEach(targetId => {
        // Ensure target exists in our fetched set to avoid dangling links
        if (notes.find(n => n._id.toString() === targetId.toString())) {
          links.push({ source: source._id, target: targetId });
        }
      });
    }
  });

  res.status(200).json({ status: 'success', data: { nodes, links } });
});

exports.getNotesForMonth = catchAsync(async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const month = parseInt(req.query.month) - 1 || new Date().getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);
  const stats = await Note.aggregate([
    {
      $match: {
        organizationId: new mongoose.Types.ObjectId(req.user.organizationId),
        owner: new mongoose.Types.ObjectId(req.user._id),
        isDeleted: false,
        $or: [
          { startDate: { $gte: start, $lt: end } },
          { dueDate: { $gte: start, $lt: end } },
          { createdAt: { $gte: start, $lt: end } },
        ],
      },
    },
    {
      $group: {
        _id: {
          // Group by the effective date
          $dateToString: { format: "%Y-%m-%d", date: { $ifNull: ["$startDate", "$createdAt"] } },
        },
        count: { $sum: 1 },
        notes: { $push: "$$ROOT._id" },
      },
    },
    {
      $project: {
        _id: 0,
        date: "$_id",
        count: 1,
        notes: 1,
      },
    },
    { $sort: { date: 1 } },
  ]);

  res.status(200).json({ status: "success", data: stats });
});

/* ==================== ANALYTICS (Heatmap) ==================== */
exports.getHeatMapData = catchAsync(async (req, res) => {
  const { startDate, endDate, userId } = req.query;
  const targetUserId = userId || req.user._id;
  const start = startDate ? new Date(startDate) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();

  const heatMapData = await Note.aggregate([
    {
      $match: {
        owner: new mongoose.Types.ObjectId(targetUserId),
        isDeleted: false,
        createdAt: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    }
  ]);

  const formattedData = {};
  heatMapData.forEach(item => {
    formattedData[item._id] = { count: item.count, intensity: Math.min(item.count / 5, 4) }; // Scale 0-4
  });

  res.status(200).json({
    status: "success",
    data: { heatMap: formattedData, stats: { totalDays: heatMapData.length } },
  });
});

exports.shareNote = catchAsync(async (req, res, next) => {
  const noteId = req.params.id || req.params.noteId;
  const { userIds, permission = "viewer" } = req.body;
  const note = await Note.findOne({
    _id: noteId,
    owner: req.user._id,
    isDeleted: false,
  });

  if (!note) return next(new AppError("Note not found", 404));
  const incomingIds = (Array.isArray(userIds) ? userIds : [userIds]).map(id => new mongoose.Types.ObjectId(id)
  );

  // Merge with existing
  const existingStr = note.sharedWith.map(id => id.toString());
  incomingIds.forEach(objId => {
    if (!existingStr.includes(objId.toString())) {
      note.sharedWith.push(objId);
    }
  });

  // Add to participants logic
  incomingIds.forEach((objId) => {
    if (!note.participants.some((p) => p.user.toString() === objId.toString())) {
      note.participants.push({
        user: objId,
        role: permission,
        rsvp: "pending",
      });
    }
  });

  await note.save();

  // Socket notification logic...
  if (Array.isArray(userIds)) {
    userIds.forEach(uid => emitToUser(uid, "noteShared", { title: note.title }));
  }

  res.status(200).json({ status: "success", data: { note } });
});

/* ==================== GET NOTE ANALYTICS ==================== */
exports.getNoteAnalytics = catchAsync(async (req, res) => {
  const { period = "month" } = req.query;
  const now = new Date();
  let startDate = new Date(now.setMonth(now.getMonth() - 1)); // Default month
  if (period === 'week') startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if (period === 'year') startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const analytics = await Note.aggregate([
    {
      $match: {
        // FIX: Added 'new'
        organizationId: new mongoose.Types.ObjectId(req.user.organizationId),
        owner: new mongoose.Types.ObjectId(req.user._id),
        isDeleted: false,
        createdAt: { $gte: startDate },
      },
    },
    {
      $facet: {
        byType: [
          { $group: { _id: "$noteType", count: { $sum: 1 } } },
        ],
        byStatus: [
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ],
        byPriority: [
          { $group: { _id: "$priority", count: { $sum: 1 } } },
        ],
      },
    },
  ]);

  const result = analytics[0];

  res.status(200).json({
    status: "success",
    data: {
      byType: result.byType || [],
      byStatus: result.byStatus || [],
      byPriority: result.byPriority || [],
      period,
    },
  });
});

/* ==================== CONVERT TO TASK ==================== */
exports.convertToTask = catchAsync(async (req, res, next) => {
  const { noteId } = req.params;
  const { dueDate, priority } = req.body;

  const note = await Note.findOneAndUpdate(
    {
      _id: noteId,
      owner: req.user._id,
      isDeleted: false,
    },
    {
      noteType: "task",
      dueDate: dueDate ? new Date(dueDate) : undefined,
      priority: priority || "medium",
      status: "active",
    },
    { new: true },
  );

  if (!note) {
    return next(new AppError("Note not found", 404));
  }

  res.status(200).json({
    status: "success",
    data: { note },
  });
});

/* ==================== CREATE FROM TEMPLATE ==================== */
exports.createFromTemplate = catchAsync(async (req, res, next) => {
  const { templateId } = req.params;
  const { title, content, ...overrides } = req.body;

  const template = await Note.findOne({
    _id: templateId,
    isTemplate: true,
    $or: [{ owner: req.user._id }, { visibility: "organization" }],
    isDeleted: false,
  });

  if (!template) {
    return next(new AppError("Template not found", 404));
  }

  const templateData = template.toObject();
  delete templateData._id;
  delete templateData.createdAt;
  delete templateData.updatedAt;

  const newNote = await Note.create({
    ...templateData,
    title: title || template.title,
    content: content || template.content,
    owner: req.user._id,
    organizationId: req.user.organizationId,
    isTemplate: false,
    templateId: template._id,
    ...overrides,
  });

  res.status(201).json({
    status: "success",
    data: { note: newNote },
  });
});



// Additional controller methods for the new routes

// Get shared notes with me
exports.getSharedNotesWithMe = catchAsync(async (req, res) => {
  const notes = await Note.find({
    sharedWith: req.user._id,
    isDeleted: false,
  })
    .populate("owner", "name email avatar")
    .sort({ updatedAt: -1 })
    .lean();

  res.status(200).json({
    status: "success",
    data: { notes },
  });
});

// Get notes shared by me
exports.getNotesSharedByMe = catchAsync(async (req, res) => {
  const notes = await Note.find({
    owner: req.user._id,
    sharedWith: { $exists: true, $ne: [] },
    isDeleted: false,
  })
    .populate("sharedWith", "name email")
    .sort({ updatedAt: -1 })
    .lean();

  res.status(200).json({
    status: "success",
    data: { notes },
  });
});

// Update share permissions
exports.updateSharePermissions = catchAsync(async (req, res, next) => {
  const { noteId } = req.params;
  const { userId, permission } = req.body;

  const note = await Note.findOne({
    _id: noteId,
    owner: req.user._id,
    isDeleted: false,
  });

  if (!note) {
    return next(new AppError("Note not found or you are not the owner", 404));
  }

  // Find and update participant role
  const participantIndex = note.participants.findIndex(
    (p) => p.user.toString() === userId,
  );

  if (participantIndex > -1) {
    note.participants[participantIndex].role = permission;
  }

  await note.save();

  res.status(200).json({
    status: "success",
    message: "Share permissions updated",
  });
});

// Remove user from shared note
exports.removeUserFromSharedNote = catchAsync(async (req, res, next) => {
  const { noteId, userId } = req.params;

  const note = await Note.findOne({
    _id: noteId,
    owner: req.user._id,
    isDeleted: false,
  });

  if (!note) {
    return next(new AppError("Note not found or you are not the owner", 404));
  }

  // Remove from sharedWith array
  note.sharedWith = note.sharedWith.filter((id) => id.toString() !== userId);

  // Remove from participants
  note.participants = note.participants.filter(
    (p) => p.user.toString() !== userId,
  );

  await note.save();

  res.status(200).json({
    status: "success",
    message: "User removed from shared note",
  });
});

// Create note template
exports.createNoteTemplate = catchAsync(async (req, res) => {
  const { title, content, category, tags } = req.body;

  const template = await Note.create({
    owner: req.user._id,
    organizationId: req.user.organizationId,
    title,
    content,
    category,
    tags: tags || [],
    isTemplate: true,
    visibility: "private",
  });

  res.status(201).json({
    status: "success",
    data: { template },
  });
});

// Get note templates
exports.getNoteTemplates = catchAsync(async (req, res) => {
  const templates = await Note.find({
    $or: [
      { owner: req.user._id, isTemplate: true },
      {
        organizationId: req.user.organizationId,
        isTemplate: true,
        visibility: "organization",
      },
    ],
    isDeleted: false,
  })
    .sort({ updatedAt: -1 })
    .lean();

  res.status(200).json({
    status: "success",
    data: { templates },
  });
});

// Update note template
exports.updateNoteTemplate = catchAsync(async (req, res, next) => {
  const { templateId } = req.params;

  const template = await Note.findOneAndUpdate(
    {
      _id: templateId,
      owner: req.user._id,
      isTemplate: true,
      isDeleted: false,
    },
    req.body,
    { new: true, runValidators: true },
  );

  if (!template) {
    return next(
      new AppError("Template not found or you are not the owner", 404),
    );
  }

  res.status(200).json({
    status: "success",
    data: { template },
  });
});

// Delete note template
exports.deleteNoteTemplate = catchAsync(async (req, res, next) => {
  const { templateId } = req.params;

  const template = await Note.findOneAndUpdate(
    {
      _id: templateId,
      owner: req.user._id,
      isTemplate: true,
    },
    { isDeleted: true, deletedAt: new Date() },
  );

  if (!template) {
    return next(
      new AppError("Template not found or you are not the owner", 404),
    );
  }

  res.status(200).json({
    status: "success",
    message: "Template deleted successfully",
  });
});

// Export note data
exports.exportNoteData = catchAsync(async (req, res) => {
  const { format = "json", startDate, endDate } = req.query;

  const filter = {
    owner: req.user._id,
    isDeleted: false,
  };

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const notes = await Note.find(filter)
    .select("-__v -isDeleted -deletedAt")
    .sort({ createdAt: -1 })
    .lean();

  if (format === "csv") {
    // Convert to CSV (you'll need to implement this based on your needs)
    const csv = convertToCSV(notes);
    res.header("Content-Type", "text/csv");
    res.attachment(`notes-export-${Date.now()}.csv`);
    return res.send(csv);
  }

  // Default to JSON
  res.status(200).json({
    status: "success",
    data: notes,
    count: notes.length,
    exportedAt: new Date(),
  });
});

// Helper function for CSV export
function convertToCSV(data) {
  if (!data || data.length === 0) return "";

  const headers = Object.keys(data[0]);
  const csvRows = [];

  // Add headers
  csvRows.push(headers.join(","));

  // Add data rows
  for (const row of data) {
    const values = headers.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) return "";
      if (typeof value === "object")
        return JSON.stringify(value).replace(/"/g, '""');
      return `"${String(value).replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(","));
  }

  return csvRows.join("\n");
}

// Get note statistics
exports.getNoteStatistics = catchAsync(async (req, res) => {
  const stats = await Note.aggregate([
    {
      $match: {
        owner: req.user._id,
        isDeleted: false,
      },
    },
    {
      $facet: {
        totalNotes: [{ $count: "count" }],
        byType: [{ $group: { _id: "$noteType", count: { $sum: 1 } } }],
        byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
        byPriority: [{ $group: { _id: "$priority", count: { $sum: 1 } } }],
        recentActivity: [
          { $sort: { updatedAt: -1 } },
          { $limit: 10 },
          { $project: { title: 1, noteType: 1, updatedAt: 1 } },
        ],
      },
    },
  ]);

  res.status(200).json({
    status: "success",
    data: stats[0],
  });
});

// Get recent activity
exports.getRecentActivity = catchAsync(async (req, res) => {
  const { limit = 20 } = req.query;

  const notes = await Note.find({
    $or: [{ owner: req.user._id }, { sharedWith: req.user._id }],
    isDeleted: false,
  })
    .select("title noteType status priority updatedAt activityLog")
    .sort({ updatedAt: -1 })
    .limit(parseInt(limit))
    .lean();

  res.status(200).json({
    status: "success",
    data: { notes },
  });
});

// Archive note
exports.archiveNote = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const note = await Note.findOneAndUpdate(
    {
      _id: id,
      owner: req.user._id,
      isDeleted: false,
    },
    {
      status: "archived",
    },
    { new: true },
  );

  if (!note) {
    return next(new AppError("Note not found or you are not the owner", 404));
  }

  res.status(200).json({
    status: "success",
    data: { note },
  });
});

// Restore archived note
exports.restoreNote = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const note = await Note.findOneAndUpdate(
    {
      _id: id,
      owner: req.user._id,
      status: "archived",
    },
    {
      status: "active",
    },
    { new: true },
  );

  if (!note) {
    return next(
      new AppError("Archived note not found or you are not the owner", 404),
    );
  }

  res.status(200).json({
    status: "success",
    data: { note },
  });
});

// Duplicate note
exports.duplicateNote = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const originalNote = await Note.findOne({
    _id: id,
    $or: [{ owner: req.user._id }, { sharedWith: req.user._id }],
    isDeleted: false,
  });

  if (!originalNote) {
    return next(new AppError("Note not found or you do not have access", 404));
  }

  // Create duplicate
  const duplicateNote = await Note.create({
    ...originalNote.toObject(),
    _id: undefined,
    title: `Copy of ${originalNote.title}`,
    owner: req.user._id,
    isTemplate: false,
    isPinned: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  res.status(201).json({
    status: "success",
    data: { note: duplicateNote },
  });
});

// Toggle pin note
exports.togglePinNote = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const note = await Note.findOne({
    _id: id,
    owner: req.user._id,
    isDeleted: false,
  });

  if (!note) {
    return next(new AppError("Note not found or you are not the owner", 404));
  }

  note.isPinned = !note.isPinned;
  await note.save();

  res.status(200).json({
    status: "success",
    data: { note },
  });
});

// Bulk update notes
exports.bulkUpdateNotes = catchAsync(async (req, res) => {
  const { noteIds, updates } = req.body;
  if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
    return next(new AppError("Please provide note IDs to update", 400));
  }
  const result = await Note.updateMany(
    {
      _id: { $in: noteIds },
      owner: req.user._id,
      isDeleted: false,
    },
    updates,
    { runValidators: true },
  );

  res.status(200).json({
    status: "success",
    message: `Updated ${result.modifiedCount} notes`,
    data: result,
  });
});

// Bulk delete notes
exports.bulkDeleteNotes = catchAsync(async (req, res) => {
  const { noteIds } = req.body;

  if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
    return next(new AppError("Please provide note IDs to delete", 400));
  }

  const result = await Note.updateMany(
    {
      _id: { $in: noteIds },
      owner: req.user._id,
    },
    {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: req.user._id,
    },
  );

  res.status(200).json({
    status: "success",
    message: `Deleted ${result.modifiedCount} notes`,
    data: result,
  });
});

// Get all organization notes with advanced filters
exports.getAllOrganizationNotes = catchAsync(async (req, res) => {
  if (!req.user.isOwner && !req.user.isSuperAdmin) {
    return res.status(403).json({
      status: "error",
      message: "Only organization owners or super admins can access all notes",
    });
  }

  const {
    status,
    priority,
    noteType,
    category,
    owner,
    visibility,
    isMeeting,
    tags,
    search,
    overdue,
    createdFrom,
    createdTo,
    dueFrom,
    dueTo,
    page = 1,
    limit = 20,
    sortBy = "createdAt",
    order = "desc"
  } = req.query;

  const query = {
    organizationId: req.user.organizationId,
    isDeleted: false,
  };

  // --- Basic filters ---
  if (status) query.status = status;
  if (priority) query.priority = priority;
  if (noteType) query.noteType = noteType;
  if (category) query.category = category;
  if (visibility) query.visibility = visibility;
  if (owner) query.owner = owner;

  // --- Meeting filter ---
  if (isMeeting !== undefined) {
    query.isMeeting = isMeeting === "true";
  }

  // --- Tags filter ---
  if (tags) {
    const tagArray = tags.split(",");
    query.tags = { $in: tagArray };
  }

  // --- Overdue filter ---
  if (overdue === "true") {
    query.dueDate = { $lt: new Date() };
    query.status = { $ne: "completed" };
  }

  // --- Created date range ---
  if (createdFrom || createdTo) {
    query.createdAt = {};
    if (createdFrom) query.createdAt.$gte = new Date(createdFrom);
    if (createdTo) query.createdAt.$lte = new Date(createdTo);
  }

  // --- Due date range ---
  if (dueFrom || dueTo) {
    query.dueDate = {};
    if (dueFrom) query.dueDate.$gte = new Date(dueFrom);
    if (dueTo) query.dueDate.$lte = new Date(dueTo);
  }

  // --- Text search ---
  if (search) {
    query.$text = { $search: search };
  }

  // --- Sorting ---
  const sort = {};
  sort[sortBy] = order === "asc" ? 1 : -1;

  // --- Pagination ---
  const skip = (page - 1) * limit;

  const [notes, total] = await Promise.all([
    Note.find(query)
      .populate("owner", "name email")
      .sort(sort)
      .skip(skip)
      .limit(Number(limit))
      .lean(),

    Note.countDocuments(query),
  ]);

  res.status(200).json({
    status: "success",
    results: notes.length,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
    data: { notes },
  });
});


// // Get all organization notes (for owners/super admins)
// exports.getAllOrganizationNotes = catchAsync(async (req, res) => {
//   if (!req.user.isOwner && !req.user.isSuperAdmin) {
//     return res.status(403).json({
//       status: "error",
//       message: "Only organization owners or super admins can access all notes",
//     });
//   }

//   const notes = await Note.find({organizationId: req.user.organizationId,isDeleted: false,  })
//     .populate("owner", "name email")
//     .sort({ createdAt: -1 })
//     .lean();

//   res.status(200).json({
//     status: "success",
//     data: { notes },
//   });
// });

// Helper function for CSV export (you already have this)
function convertToCSV(data) {
  if (!data || data.length === 0) return "";
  const headers = Object.keys(data[0]);
  const csvRows = [];
  // Add headers
  csvRows.push(headers.join(","));

  // Add data rows
  for (const row of data) {
    const values = headers.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) return "";
      if (typeof value === "object")
        return JSON.stringify(value).replace(/"/g, '""');
      return `"${String(value).replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(","));
  }

  return csvRows.join("\n");
}

// Export all user notes
exports.exportAllUserNotes = catchAsync(async (req, res) => {
  const { format = "json" } = req.query;

  const notes = await Note.find({
    owner: req.user._id,
    isDeleted: false,
  })
    .select("-__v -isDeleted -deletedAt -deletedBy")
    .sort({ createdAt: -1 })
    .lean();

  if (format === "csv") {
    const csv = convertToCSV(notes);
    res.header("Content-Type", "text/csv");
    res.attachment(`notes-export-${Date.now()}.csv`);
    return res.send(csv);
  }

  // Default to JSON
  res.status(200).json({
    status: "success",
    data: notes,
    count: notes.length,
    exportedAt: new Date(),
  });
});

/* ==================== NEW: HISTORY & LOGS ==================== */
exports.getNoteHistory = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const note = await Note.findOne({
    _id: id,
    $or: [
      { owner: req.user._id },
      { sharedWith: req.user._id },
      { visibility: 'organization' }
    ]
  })
    .select('activityLog')
    .populate('activityLog.user', 'name email avatar');
  if (!note) {
    return next(new AppError('Note not found', 404));
  }
  const history = note.activityLog.sort((a, b) => b.timestamp - a.timestamp);
  res.status(200).json({
    status: 'success',
    data: { activityLog: history }
  });
});

/* ==================== NEW: SUBTASKS ==================== */
exports.addSubtask = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { title } = req.body;
  const note = await Note.findOneAndUpdate(
    { _id: id, owner: req.user._id, isDeleted: false },
    { $push: { subtasks: { title, completed: false } } },
    { new: true, runValidators: true }
  );
  if (!note) return next(new AppError('Note not found', 404));
  res.status(200).json({ status: 'success', data: { note } });
});

exports.toggleSubtask = catchAsync(async (req, res, next) => {
  const { id, subtaskId } = req.params;
  const { completed } = req.body;
  const note = await Note.findOne({ _id: id, owner: req.user._id });
  if (!note) return next(new AppError('Note not found', 404));
  const subtask = note.subtasks.id(subtaskId);
  if (!subtask) return next(new AppError('Subtask not found', 404));
  subtask.completed = completed;
  if (completed) subtask.completedAt = new Date();
  const total = note.subtasks.length;
  const done = note.subtasks.filter(t => t.completed).length;
  note.progress = total === 0 ? 0 : Math.round((done / total) * 100);
  await note.save();
  res.status(200).json({ status: 'success', data: { note } });
});

exports.removeSubtask = catchAsync(async (req, res, next) => {
  const { id, subtaskId } = req.params;
  const note = await Note.findOneAndUpdate(
    { _id: id, owner: req.user._id },
    { $pull: { subtasks: { _id: subtaskId } } },
    { new: true }
  );
  if (!note) return next(new AppError('Note not found', 404));
  res.status(200).json({ status: 'success', data: { note } });
});

/* ==================== NEW: HARD DELETE ==================== */
exports.hardDeleteNote = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const note = await Note.findOneAndDelete({
    _id: id,
    owner: req.user._id,
    isDeleted: true
  });
  if (!note) {
    return next(new AppError('Note not found in trash or permission denied', 404));
  }
  res.status(204).json({ status: 'success', data: null });
});

/* ==================== LINKING ==================== */
exports.linkNote = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { targetNoteId } = req.body;
  const note = await Note.findOneAndUpdate(
    { _id: id, owner: req.user._id },
    { $addToSet: { relatedNotes: targetNoteId } },
    { new: true }
  ).populate('relatedNotes', 'title status');
  await Note.findByIdAndUpdate(targetNoteId, {
    $addToSet: { relatedNotes: id }
  });
  res.status(200).json({ status: 'success', data: { note } });
});


/* ==================== CREATE MEETING ==================== */

// Fix createMeeting with proper error handling and validation
exports.createMeeting = catchAsync(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { title, description, agenda, startTime, endTime, participants } = req.body;
    
    // Validate participants exist
    if (participants?.length) {
      const existingUsers = await User.find({ 
        _id: { $in: participants.map(p => p.user) },
        organizationId: req.user.organizationId
      }).session(session);
      
      if (existingUsers.length !== participants.length) {
        throw new AppError('Some participants not found', 400);
      }
    }
    
    const meeting = await Meeting.create([{
      organizationId: req.user.organizationId,
      organizer: req.user._id,
      title,
      description,
      agenda,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      participants: participants?.map(p => ({
        user: p.user,
        role: p.role || "attendee",
        invitationStatus: "pending",
      }))
    }], { session });
    
    const note = await Note.create([{
      organizationId: req.user.organizationId,
      owner: req.user._id,
      title: `Meeting: ${title}`,
      content: agenda || description,
      noteType: "meeting",
      isMeeting: true,
      startDate: startTime,
      dueDate: endTime,
      meetingId: meeting[0]._id,
      participants: participants || [],
      visibility: "team",
    }], { session });
    
    await session.commitTransaction();
    
    // Batch socket emissions
    if (participants?.length) {
      const socketPayload = {
        type: "MEETING_INVITATION",
        data: {
          meetingId: meeting[0]._id,
          title: meeting[0].title,
          organizer: req.user.name,
          startTime: meeting[0].startTime,
          virtualLink: meeting[0].virtualLink,
        },
      };
      
      // Use batch emit if available
      emitToUsers(participants.map(p => p.user), "meetingInvitation", socketPayload);
    }
    
    res.status(201).json({
      status: "success",
      data: { meeting: meeting[0], note: note[0] },
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
});


/* ==================== CREATE MEETING ==================== */
exports.createMeeting = catchAsync(async (req, res, next) => {
  const { 
    title, description, agenda, startTime, endTime, 
    locationType, virtualLink, participants, recurrencePattern, 
    ...otherFields 
  } = req.body;

  // 1. Create the Meeting
  const meeting = await Meeting.create({
    organizationId: req.user.organizationId,
    organizer: req.user._id,
    title,
    description,
    agenda,
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    locationType,
    virtualLink,
    participants: participants?.map((p) => ({
      user: p.user,
      role: p.role || "attendee",
      invitationStatus: "pending",
    })),
    recurrencePattern,
    ...otherFields,
  });

  // 2. Create the Associated Note (Agenda/Minutes)
  const note = await Note.create({
    organizationId: req.user.organizationId,
    owner: req.user._id,
    title: `Meeting: ${title}`,
    content: agenda || description || "No agenda provided.",
    noteType: "meeting",
    isMeeting: true,
    meetingId: meeting._id, // Link to Meeting
    startDate: startTime,
    dueDate: endTime,
    participants: participants || [],
    visibility: "team",
  });

  // 3. Update Meeting with Note Reference (Bi-directional link)
  meeting.meetingNotes = note._id;
  await meeting.save();

  // 4. Socket Notifications
  if (participants && participants.length > 0) {
    const socketPayload = {
      type: "MEETING_INVITATION",
      data: {
        meetingId: meeting._id,
        title: meeting.title,
        organizer: req.user.name,
        startTime: meeting.startTime,
        virtualLink: meeting.virtualLink,
      },
    };

    participants.forEach((participant) => {
      // emitToUser(participant.user, "meetingInvitation", socketPayload);
    });
  }

  res.status(201).json({
    status: "success",
    data: { meeting, note },
  });
});

/* ==================== GET USER MEETINGS ==================== */
exports.getUserMeetings = catchAsync(async (req, res) => {
  const { status, startDate, endDate, limit = 50 } = req.query;
  const filter = {
    organizationId: req.user.organizationId,
    $or: [{ organizer: req.user._id }, { "participants.user": req.user._id }],
  };
  
  if (status) filter.status = status;
  if (startDate) filter.startTime = { $gte: new Date(startDate) };
  if (endDate) filter.endTime = { $lte: new Date(endDate) };

  const meetings = await Meeting.find(filter)
    .sort({ startTime: 1 })
    .limit(parseInt(limit))
    .populate("organizer", "name email avatar")
    .populate("participants.user", "name email avatar")
    .lean();

  res.status(200).json({
    status: "success",
    data: { meetings },
  });
});

/* ==================== UPDATE MEETING STATUS ==================== */
exports.updateMeetingStatus = catchAsync(async (req, res, next) => {
  const { meetingId } = req.params;
  const { status, actionItems, minutes } = req.body;

  const meeting = await Meeting.findOneAndUpdate(
    {
      _id: meetingId,
      $or: [
        { organizer: req.user._id },
        {
          "participants.user": req.user._id,
          "participants.role": { $in: ["organizer", "presenter"] },
        },
      ],
    },
    {
      $set: {
        ...(status && { status }),
        ...(minutes && { minutes }),
        ...(actionItems && { actionItems }),
      },
    },
    { new: true, runValidators: true }
  );

  if (!meeting) {
    return next(
      new AppError("Meeting not found or insufficient permissions", 404),
    );
  }

  // Sync minutes to the associated Note
  if (minutes) {
    // Note: We use the meetingId field we added to the Note schema in Phase 1
    await Note.findOneAndUpdate(
      { meetingId: meeting._id },
      { 
        content: minutes, 
        summary: minutes.length > 200 ? minutes.substring(0, 200) + "..." : minutes 
      }
    );
  }

  res.status(200).json({
    status: "success",
    data: { meeting },
  });
});

/* ==================== MEETING RSVP ==================== */
exports.meetingRSVP = catchAsync(async (req, res, next) => {
  const { meetingId } = req.params;
  const { response } = req.body; // 'accepted', 'declined', 'tentative'

  const meeting = await Meeting.findOne({
    _id: meetingId,
    "participants.user": req.user._id,
  });

  if (!meeting) {
    return next(new AppError("Meeting not found or you are not invited", 404));
  }

  const participantIndex = meeting.participants.findIndex(
    (p) => p.user.toString() === req.user._id.toString(),
  );

  if (participantIndex > -1) {
    meeting.participants[participantIndex].invitationStatus = response;
    meeting.participants[participantIndex].responseAt = new Date();
    await meeting.save();
  }

  // Notify Organizer
  // emitToUser(meeting.organizer, "meetingRSVP", {
  //   type: "MEETING_RSVP",
  //   data: {
  //     meetingId: meeting._id,
  //     userId: req.user._id,
  //     userName: req.user.name,
  //     response,
  //   },
  // });

  res.status(200).json({
    status: "success",
    message: `You have ${response} the meeting`,
  });
});

/* ==================== GET CALENDAR VIEW ==================== */
exports.getCalendarView = catchAsync(async (req, res) => {
  const { start, end } = req.query;
  // Robust date parsing to prevent invalid date errors
  const startDate = start && !isNaN(Date.parse(start)) ? new Date(start) : new Date(new Date().setDate(1));
  const endDate = end && !isNaN(Date.parse(end)) ? new Date(end) : new Date(new Date().setMonth(new Date().getMonth() + 1));

  // Run Queries in Parallel
  const [notes, meetings] = await Promise.all([
    Note.find({
      organizationId: req.user.organizationId,
      isDeleted: false,
      // Filter out shadow notes created by meetings to prevent duplicates
      $or: [
        { owner: req.user._id }, 
        { sharedWith: req.user._id }, 
        { "participants.user": req.user._id }
      ],
      $or: [
        { startDate: { $gte: startDate, $lte: endDate } },
        { dueDate: { $gte: startDate, $lte: endDate } },
      ],
    }).select("title noteType startDate dueDate priority status isMeeting meetingId").lean(),

    Meeting.find({
      organizationId: req.user.organizationId,
      startTime: { $gte: startDate, $lte: endDate },
      status: { $ne: "cancelled" },
      $or: [{ organizer: req.user._id }, { "participants.user": req.user._id }],
    }).select("title startTime endTime status").lean()
  ]);

  const calendarEvents = [];

  // Process Notes
  notes.forEach((note) => {
    // Skip notes that are just shadows of meetings (handled by Meeting query)
    if (note.isMeeting && note.meetingId) return; 

    calendarEvents.push({
      id: note._id.toString(),
      title: note.title,
      start: note.startDate || note.createdAt,
      end: note.dueDate || note.startDate, // Fallback if no due date
      allDay: !note.startDate, // If no specific start time, treat as all day task
      extendedProps: {
        type: 'note',
        noteType: note.noteType,
        priority: note.priority,
        status: note.status,
      },
      color: note.priority === 'urgent' ? '#ef4444' : '#10b981', // Red for urgent, Green for others
    });
  });

  // Process Meetings
  meetings.forEach((meeting) => {
    calendarEvents.push({
      id: `meeting_${meeting._id}`,
      title: `📅 ${meeting.title}`,
      start: meeting.startTime,
      end: meeting.endTime,
      extendedProps: {
        type: 'meeting',
        status: meeting.status,
        meetingId: meeting._id
      },
      color: "#4f46e5", // Indigo for meetings
    });
  });

  res.status(200).json({ status: "success", data: { events: calendarEvents } });
});

/* ==================== CREATE NOTE (With Meeting Option) ==================== */
exports.createNote = catchAsync(async (req, res, next) => {
  const { 
    title, content, noteType, startDate, dueDate, 
    priority, category, tags, isMeeting, meetingDetails, 
    participants, visibility, projectId, attachments, 
    relatedNotes, ...otherFields 
  } = req.body;

  let meeting = null;

  // 1. Create Meeting if requested
  if (isMeeting && meetingDetails) {
    meeting = await Meeting.create({
      organizationId: req.user.organizationId,
      organizer: req.user._id,
      title: title,
      description: content,
      startTime: meetingDetails.startTime || startDate || new Date(),
      endTime: meetingDetails.endTime || dueDate || new Date(Date.now() + 3600000), // Default 1 hour
      locationType: meetingDetails.locationType,
      virtualLink: meetingDetails.videoLink,
      participants: participants?.map((p) => ({
        user: p.user,
        role: p.role || "attendee",
      })),
    });
    
    // Notify participants
    // if (participants && participants.length > 0) { ... socket logic ... }
  }

  // 2. Create Note
  const note = await Note.create({
    organizationId: req.user.organizationId,
    owner: req.user._id,
    title,
    content,
    noteType: noteType || (isMeeting ? "meeting" : "note"),
    startDate: startDate ? new Date(startDate) : undefined,
    dueDate: dueDate ? new Date(dueDate) : undefined,
    priority: priority || "medium",
    category,
    tags: tags, 
    isMeeting: !!isMeeting,
    meetingId: meeting ? meeting._id : undefined, // Link to meeting if created
    meetingDetails: meetingDetails || {},
    participants: participants || [],
    visibility: visibility || "private",
    projectId,
    attachments: attachments || [],
    relatedNotes: relatedNotes || [],
    ...otherFields,
  });

  // 3. Link Meeting back to Note (Bi-directional link)
  if (meeting) {
    meeting.meetingNotes = note._id;
    await meeting.save();
  }

  // 4. Update referenced notes (Bidirectional linking for relatedNotes)
  if (relatedNotes && relatedNotes.length > 0) {
    await Note.updateMany(
      { _id: { $in: relatedNotes } },
      { $addToSet: { relatedNotes: note._id } }
    );
  }

  res.status(201).json({
    status: "success",
    data: { note, meeting },
  });
});

// /* ==================== GET USER MEETINGS ==================== */
// exports.getUserMeetings = catchAsync(async (req, res) => {
//   const { status, startDate, endDate, limit = 50 } = req.query;
//   const filter = {
//     organizationId: req.user.organizationId,
//     $or: [{ organizer: req.user._id }, { "participants.user": req.user._id }],
//   };
//   if (status) filter.status = status;
//   if (startDate) filter.startTime = { $gte: new Date(startDate) };
//   if (endDate) filter.endTime = { $lte: new Date(endDate) };

//   const meetings = await Meeting.find(filter).sort({ startTime: 1 }).limit(parseInt(limit)).populate("organizer", "name email avatar").populate("participants.user", "name email avatar").lean();
//   res.status(200).json({
//     status: "success",
//     data: { meetings },
//   });
// });

// /* ==================== UPDATE MEETING STATUS ==================== */
// exports.updateMeetingStatus = catchAsync(async (req, res, next) => {
//   const { meetingId } = req.params;
//   const { status, actionItems, minutes } = req.body;

//   const meeting = await Meeting.findOneAndUpdate(
//     {
//       _id: meetingId,
//       $or: [
//         { organizer: req.user._id },
//         {
//           "participants.user": req.user._id,
//           "participants.role": { $in: ["organizer", "presenter"] },
//         },
//       ],
//     },
//     {
//       $set: {
//         ...(status && { status }),
//         ...(minutes && { minutes }),
//         ...(actionItems && { actionItems }),
//       },
//     },
//     { new: true, runValidators: true },
//   );

//   if (!meeting) {
//     return next(
//       new AppError("Meeting not found or insufficient permissions", 404),
//     );
//   }

//   if (minutes) {
//     await Note.findOneAndUpdate(
//       { meetingId: meeting._id },
//       { content: minutes, summary: minutes.substring(0, 200) + "..." },
//     );
//   }

//   res.status(200).json({
//     status: "success",
//     data: { meeting },
//   });
// });

// /* ==================== MEETING RSVP ==================== */
// exports.meetingRSVP = catchAsync(async (req, res, next) => {
//   const { meetingId } = req.params;
//   const { response } = req.body;

//   const meeting = await Meeting.findOne({
//     _id: meetingId,
//     "participants.user": req.user._id,
//   });

//   if (!meeting) {
//     return next(new AppError("Meeting not found or you are not invited", 404));
//   }

//   const participantIndex = meeting.participants.findIndex(
//     (p) => p.user.toString() === req.user._id.toString(),
//   );

//   if (participantIndex > -1) {
//     meeting.participants[participantIndex].invitationStatus = response;
//     meeting.participants[participantIndex].responseAt = new Date();
//     await meeting.save();
//   }

//   emitToUser(meeting.organizer, "meetingRSVP", {
//     type: "MEETING_RSVP",
//     data: {
//       meetingId: meeting._id,
//       userId: req.user._id,
//       userName: req.user.name,
//       response,
//     },
//   });

//   res.status(200).json({
//     status: "success",
//     message: `You have ${response} the meeting`,
//   });
// });

// /* ==================== CALENDAR VIEW (Optimized) ==================== */
// exports.getCalendarView = catchAsync(async (req, res) => {
//   const { start, end } = req.query;
//   const startDate = start ? new Date(start) : new Date(new Date().setDate(1));
//   const endDate = end ? new Date(end) : new Date(new Date().setMonth(new Date().getMonth() + 1));

//   // Run Queries in Parallel
//   const [notes, meetings] = await Promise.all([
//     Note.find({
//       organizationId: req.user.organizationId,
//       isDeleted: false,
//       $or: [{ owner: req.user._id }, { sharedWith: req.user._id }, { "participants.user": req.user._id }],
//       $or: [
//         { startDate: { $gte: startDate, $lte: endDate } },
//         { dueDate: { $gte: startDate, $lte: endDate } },
//       ],
//     }).select("title noteType startDate dueDate priority status isMeeting participants").lean(),

//     Meeting.find({
//       organizationId: req.user.organizationId,
//       startTime: { $gte: startDate, $lte: endDate },
//       status: { $ne: "cancelled" },
//       $or: [{ organizer: req.user._id }, { "participants.user": req.user._id }],
//     }).select("title startTime endTime status participants").lean()
//   ]);

//   const calendarEvents = [];

//   // Process Notes
//   notes.forEach((note) => {
//     if (note.isMeeting && note.meetingId) return; // Skip meeting notes, we'll use actual meetings

//     calendarEvents.push({
//       id: note._id.toString(),
//       title: note.title,
//       start: note.startDate || note.createdAt,
//       end: note.dueDate || note.startDate,
//       allDay: !note.startDate?.getHours(), // Guess all day if no specific time
//       extendedProps: {
//         type: 'note',
//         noteType: note.noteType,
//         priority: note.priority,
//         status: note.status,
//       },
//       color: getEventColor(note.noteType, note.priority),
//       textColor: "#ffffff",
//     });
//   });

//   // Process Meetings
//   meetings.forEach((meeting) => {
//     calendarEvents.push({
//       id: `meeting_${meeting._id}`,
//       title: `📅 ${meeting.title}`,
//       start: meeting.startTime,
//       end: meeting.endTime,
//       extendedProps: {
//         type: 'meeting',
//         status: meeting.status,
//         meetingId: meeting._id
//       },
//       color: "#4f46e5",
//       textColor: "#ffffff",
//     });
//   });

//   res.status(200).json({ status: "success", data: { events: calendarEvents } });
// });

// exports.createNote = catchAsync(async (req, res, next) => {
//   const { title, content, noteType, startDate, dueDate, priority, category, tags, isMeeting, meetingDetails, participants, visibility, projectId, attachments, relatedNotes, ...otherFields } = req.body;

//   // 1. Auto-tagging Logic
//   const extractedTags = extractHashtags(content);
//   const finalTags = [...new Set([...(tags || []), ...extractedTags])];

//   let meeting = null;
//   if (isMeeting && meetingDetails) {
//     meeting = await Meeting.create({
//       organizationId: req.user.organizationId,
//       organizer: req.user._id,
//       title: title,
//       description: content,
//       startTime: meetingDetails.startTime || startDate,
//       endTime: meetingDetails.endTime || dueDate,
//       locationType: meetingDetails.locationType,
//       virtualLink: meetingDetails.videoLink,
//       participants: participants?.map((p) => ({
//         user: p.user,
//         role: p.role || "attendee",
//       })),
//     });

//     if (participants && participants.length > 0) {
//       const socketPayload = {
//         type: "MEETING_INVITATION",
//         data: {
//           meetingId: meeting._id,
//           title: meeting.title,
//           organizer: req.user.name,
//           startTime: meeting.startTime,
//         },
//       };
//       participants.forEach((participant) => {
//         emitToUser(participant.user, "newMeeting", socketPayload);
//       });
//     }
//   }

//   const note = await Note.create({
//     organizationId: req.user.organizationId,
//     owner: req.user._id,
//     title,
//     content,
//     noteType: noteType || (isMeeting ? "meeting" : "note"),
//     startDate: startDate ? new Date(startDate) : undefined,
//     dueDate: dueDate ? new Date(dueDate) : undefined,
//     priority: priority || "medium",
//     category,
//     tags: finalTags,
//     isMeeting: !!isMeeting,
//     meetingDetails: meetingDetails || {},
//     participants: participants || [],
//     visibility: visibility || "private",
//     projectId,
//     attachments: attachments || [],
//     relatedNotes: relatedNotes || [],
//     ...otherFields,
//   });

//   if (meeting) {
//     note.meetingId = meeting._id;
//     await note.save();
//   }

//   // 2. Bidirectional Linking: Update referenced notes to point back to this new note
//   if (relatedNotes && relatedNotes.length > 0) {
//     await Note.updateMany(
//       { _id: { $in: relatedNotes } },
//       { $addToSet: { relatedNotes: note._id } }
//     );
//   }

//   res.status(201).json({
//     status: "success",
//     data: { note, meeting },
//   });
// });

module.exports = exports;



// exports.createMeeting = catchAsync(async (req, res, next) => {
//   const { title, description, agenda, startTime, endTime, locationType, virtualLink, participants, recurrencePattern, ...otherFields } = req.body;
//   const meeting = await Meeting.create({
//     organizationId: req.user.organizationId,
//     organizer: req.user._id,
//     title,
//     description,
//     agenda,
//     startTime: new Date(startTime),
//     endTime: new Date(endTime),
//     locationType,
//     virtualLink,
//     participants: participants?.map((p) => ({
//       user: p.user,
//       role: p.role || "attendee",
//       invitationStatus: "pending",
//     })),
//     recurrencePattern,
//     ...otherFields,
//   });

//   const note = await Note.create({
//     organizationId: req.user.organizationId,
//     owner: req.user._id,
//     title: `Meeting: ${title}`,
//     content: agenda || description,
//     noteType: "meeting",
//     isMeeting: true,
//     startDate: startTime,
//     dueDate: endTime,
//     meetingId: meeting._id,
//     participants: participants || [],
//     visibility: "team",
//   });

//   if (participants && participants.length > 0) {
//     const socketPayload = {
//       type: "MEETING_INVITATION",
//       data: {
//         meetingId: meeting._id,
//         title: meeting.title,
//         organizer: req.user.name,
//         startTime: meeting.startTime,
//         virtualLink: meeting.virtualLink,
//       },
//     };

//     participants.forEach((participant) => {
//       emitToUser(participant.user, "meetingInvitation", socketPayload);
//     });
//   }

//   res.status(201).json({
//     status: "success",
//     data: { meeting, note },
//   });
// });