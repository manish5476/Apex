const mongoose = require("mongoose");
const Note = require("../models/noteModel");
const Meeting = require("../models/meetingModel");
const User = require("../../auth/core/user.model");
const catchAsync = require("../../../core/utils/catchAsync");
const AppError = require("../../../core/utils/appError");
const { emitToUser, emitToOrg } = require("../../../core/utils/_legacy/socket");

// Helper functions
const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const getEventColor = (noteType, priority) => {
  const colors = {
    note: {
      low: "#6b7280",
      medium: "#3b82f6",
      high: "#f59e0b",
      urgent: "#ef4444",
    },
    task: {
      low: "#10b981",
      medium: "#8b5cf6",
      high: "#f97316",
      urgent: "#dc2626",
    },
    meeting: "#4f46e5",
    idea: "#8b5cf6",
    journal: "#14b8a6",
    project: "#f59e0b",
  };

  if (noteType === "meeting") return colors.meeting;
  return colors[noteType]?.[priority] || colors.note.medium;
};

/* ==================== MEDIA UPLOAD ==================== */
exports.uploadMedia = catchAsync(async (req, res) => {
  if (!req.files || !req.files.length) {
    return res.status(200).json({ status: "success", data: [] });
  }

  const files = req.files.map((file) => ({
    url: `/uploads/notes/${file.filename}`,
    publicId: file.filename,
    fileType: file.mimetype.startsWith("image/") ? "image" : "file",
    fileName: file.originalname,
    size: file.size,
  }));

  res.status(200).json({ status: "success", data: files });
});

/* ==================== CREATE NOTE ==================== */
exports.createNote = catchAsync(async (req, res, next) => {
  const {
    title,
    content,
    noteType,
    startDate,
    dueDate,
    priority,
    category,
    tags,
    isMeeting,
    meetingDetails,
    participants,
    visibility,
    projectId,
    attachments,
    ...otherFields
  } = req.body;

  let meeting = null;
  if (isMeeting && meetingDetails) {
    meeting = await Meeting.create({
      organizationId: req.user.organizationId,
      organizer: req.user._id,
      title: title,
      description: content,
      startTime: meetingDetails.startTime || startDate,
      endTime: meetingDetails.endTime || dueDate,
      locationType: meetingDetails.locationType,
      virtualLink: meetingDetails.videoLink,
      participants: participants?.map((p) => ({
        user: p.user,
        role: p.role || "attendee",
      })),
    });

    if (participants && participants.length > 0) {
      const socketPayload = {
        type: "MEETING_INVITATION",
        data: {
          meetingId: meeting._id,
          title: meeting.title,
          organizer: req.user.name,
          startTime: meeting.startTime,
        },
      };

      participants.forEach((participant) => {
        emitToUser(participant.user, "newMeeting", socketPayload);
      });
    }
  }

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
    tags: Array.isArray(tags) ? tags : tags ? [tags] : [],
    isMeeting: !!isMeeting,
    meetingDetails: meetingDetails || {},
    participants: participants || [],
    visibility: visibility || "private",
    projectId,
    attachments: attachments || [],
    ...otherFields,
  });

  if (meeting) {
    note.meetingId = meeting._id;
    await note.save();
  }

  res.status(201).json({
    status: "success",
    data: { note, meeting },
  });
});

/* ==================== GET NOTES ==================== */
exports.getNotes = catchAsync(async (req, res) => {
  const {
    type,
    status,
    priority,
    category,
    date,
    startDate,
    endDate,
    tag,
    search,
    page = 1,
    limit = 20,
    sort = "-createdAt",
  } = req.query;

  const filter = {
    organizationId: req.user.organizationId,
    isDeleted: false,
    $or: [
      { owner: req.user._id },
      { sharedWith: req.user._id },
      { visibility: "organization" },
    ],
  };

  if (date) {
    filter.$or = [
      { startDate: { $gte: startOfDay(date), $lte: endOfDay(date) } },
      { dueDate: { $gte: startOfDay(date), $lte: endOfDay(date) } },
      { createdAt: { $gte: startOfDay(date), $lte: endOfDay(date) } },
    ];
  }

  if (type) filter.noteType = type;
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (category) filter.category = category;
  if (tag) filter.tags = tag;

  if (startDate || endDate) {
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    filter.$or = [
      { startDate: dateFilter },
      { dueDate: dateFilter },
      { createdAt: dateFilter },
    ];
  }

  if (search) {
    filter.$text = { $search: search };
  }

  const skip = (page - 1) * limit;

  const [notes, total] = await Promise.all([
    Note.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate("owner", "name email avatar")
      .populate("participants.user", "name email avatar")
      .lean(),
    Note.countDocuments(filter),
  ]);

  res.status(200).json({
    status: "success",
    data: {
      notes,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit),
      },
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
    ],
  })
    .populate("owner", "name email avatar")
    .populate("participants.user", "name email avatar")
    .populate("projectId", "name");

  if (!note) {
    return next(
      new AppError(
        "Note not found or you do not have permission to view it",
        404,
      ),
    );
  }

  note.logActivity("viewed", req.user._id);
  await note.save();

  res.status(200).json({
    status: "success",
    data: { note },
  });
});

/* ==================== UPDATE NOTE ==================== */
exports.updateNote = catchAsync(async (req, res, next) => {
  const note = await Note.findOneAndUpdate(
    {
      _id: req.params.id,
      owner: req.user._id,
      isDeleted: false,
    },
    {
      ...req.body,
      ...(req.body.tags && {
        tags: Array.isArray(req.body.tags) ? req.body.tags : [req.body.tags],
      }),
    },
    {
      new: true,
      runValidators: true,
    },
  )
    .populate("owner", "name email avatar")
    .populate("participants.user", "name email avatar");

  if (!note) {
    return next(
      new AppError(
        "Note not found or you do not have permission to update it",
        404,
      ),
    );
  }

  note.logActivity("updated", req.user._id);
  await note.save();

  res.status(200).json({
    status: "success",
    data: { note },
  });
});

/* ==================== DELETE NOTE ==================== */
exports.deleteNote = catchAsync(async (req, res, next) => {
  const note = await Note.findOneAndUpdate(
    {
      _id: req.params.id,
      owner: req.user._id,
    },
    {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: req.user._id,
    },
    { new: true },
  );

  if (!note) {
    return next(
      new AppError(
        "Note not found or you do not have permission to delete it",
        404,
      ),
    );
  }

  res.status(204).json({
    status: "success",
    data: null,
  });
});

/* ==================== SEARCH NOTES ==================== */
exports.searchNotes = catchAsync(async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(200).json({ status: "success", data: [] });
  }

  const notes = await Note.find({
    organizationId: req.user.organizationId,
    isDeleted: false,
    $or: [
      { owner: req.user._id },
      { sharedWith: req.user._id },
      { visibility: "organization" },
    ],
    $text: { $search: query },
  })
    .sort({ score: { $meta: "textScore" } })
    .populate("owner", "name email avatar")
    .lean();

  res.status(200).json({
    status: "success",
    data: { notes },
  });
});

/* ==================== GET NOTES FOR MONTH ==================== */
exports.getNotesForMonth = catchAsync(async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const month = parseInt(req.query.month) - 1 || new Date().getMonth();

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);

  const stats = await Note.aggregate([
    {
      $match: {
        organizationId: mongoose.Types.ObjectId(req.user.organizationId),
        owner: mongoose.Types.ObjectId(req.user._id),
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
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
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

  res.status(200).json({
    status: "success",
    data: stats,
  });
});

/* ==================== HEAT MAP DATA ==================== */
exports.getHeatMapData = catchAsync(async (req, res) => {
  const { startDate, endDate, userId } = req.query;

  const targetUserId = userId || req.user._id;
  const start = startDate
    ? new Date(startDate)
    : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const end = endDate ? new Date(endDate) : new Date();

  const heatMapData = await Note.aggregate([
    {
      $match: {
        owner: mongoose.Types.ObjectId(targetUserId),
        isDeleted: false,
        createdAt: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
          day: { $dayOfMonth: "$createdAt" },
        },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        date: {
          $dateFromParts: {
            year: "$_id.year",
            month: "$_id.month",
            day: "$_id.day",
          },
        },
        count: 1,
      },
    },
    { $sort: { date: 1 } },
  ]);

  const formattedData = heatMapData.reduce((acc, item) => {
    const dateStr = item.date.toISOString().split("T")[0];
    acc[dateStr] = {
      count: item.count,
      intensity: Math.min(item.count / 10, 1),
    };
    return acc;
  }, {});

  res.status(200).json({
    status: "success",
    data: {
      heatMap: formattedData,
      stats: {
        totalDays: Object.keys(formattedData).length,
        totalNotes: heatMapData.reduce((sum, item) => sum + item.count, 0),
        averagePerDay:
          heatMapData.length > 0
            ? (
                heatMapData.reduce((sum, item) => sum + item.count, 0) /
                heatMapData.length
              ).toFixed(2)
            : 0,
      },
    },
  });
});

/* ==================== CALENDAR VIEW ==================== */
exports.getCalendarView = catchAsync(async (req, res) => {
  const { start, end, view = "month" } = req.query;

  const startDate = new Date(start || new Date().setDate(1));
  const endDate = new Date(
    end || new Date().setMonth(new Date().getMonth() + 1),
  );

  const filter = {
    organizationId: req.user.organizationId,
    isDeleted: false,
    $or: [
      { owner: req.user._id },
      { sharedWith: req.user._id },
      { "participants.user": req.user._id },
    ],
    $or: [
      { startDate: { $gte: startDate, $lte: endDate } },
      { dueDate: { $gte: startDate, $lte: endDate } },
      { createdAt: { $gte: startDate, $lte: endDate } },
    ],
  };

  const notes = await Note.find(filter)
    .select(
      "title noteType startDate dueDate priority status isMeeting participants",
    )
    .populate("participants.user", "name")
    .lean();

  const calendarEvents = notes.map((note) => ({
    id: note._id.toString(),
    title: note.title,
    start: note.startDate || note.dueDate || note.createdAt,
    end:
      note.dueDate ||
      note.startDate ||
      new Date((note.startDate || note.createdAt).getTime() + 60 * 60 * 1000),
    allDay: !note.startDate || !note.dueDate,
    extendedProps: {
      noteType: note.noteType,
      priority: note.priority,
      status: note.status,
      isMeeting: note.isMeeting,
      participants: note.participants?.map((p) => p.user?.name).filter(Boolean),
    },
    color: getEventColor(note.noteType, note.priority),
    textColor: "#ffffff",
  }));

  const meetings = await Meeting.find({
    organizationId: req.user.organizationId,
    startTime: { $gte: startDate, $lte: endDate },
    status: { $ne: "cancelled" },
    $or: [{ organizer: req.user._id }, { "participants.user": req.user._id }],
  })
    .select("title startTime endTime status participants")
    .populate("participants.user", "name")
    .lean();

  meetings.forEach((meeting) => {
    calendarEvents.push({
      id: `meeting_${meeting._id}`,
      title: `📅 ${meeting.title}`,
      start: meeting.startTime,
      end: meeting.endTime,
      allDay: false,
      extendedProps: {
        noteType: "meeting",
        type: "meeting",
        meetingId: meeting._id,
        status: meeting.status,
        participants: meeting.participants
          ?.map((p) => p.user?.name)
          .filter(Boolean),
      },
      color: "#4f46e5",
      textColor: "#ffffff",
    });
  });

  res.status(200).json({
    status: "success",
    data: { events: calendarEvents },
  });
});

/* ==================== SHARE NOTE ==================== */
exports.shareNote = catchAsync(async (req, res, next) => {
  const { noteId } = req.params;
  const { userIds, permission = "viewer" } = req.body;

  const note = await Note.findOne({
    _id: noteId,
    owner: req.user._id,
    isDeleted: false,
  });

  if (!note) {
    return next(new AppError("Note not found or you are not the owner", 404));
  }

  const uniqueUserIds = [
    ...new Set([
      ...note.sharedWith.map((id) => id.toString()),
      ...(Array.isArray(userIds) ? userIds : [userIds]),
    ]),
  ];

  note.sharedWith = uniqueUserIds.map((id) => mongoose.Types.ObjectId(id));

  userIds.forEach((userId) => {
    if (
      !note.participants.some((p) => p.user.toString() === userId.toString())
    ) {
      note.participants.push({
        user: userId,
        role: permission,
        rsvp: "pending",
      });
    }
  });

  await note.save();

  const socketPayload = {
    type: "NOTE_SHARED",
    data: {
      noteId: note._id,
      title: note.title,
      sharedBy: req.user.name,
      permission,
    },
  };

  if (Array.isArray(userIds)) {
    userIds.forEach((userId) => {
      emitToUser(userId, "noteShared", socketPayload);
    });
  }

  res.status(200).json({
    status: "success",
    message: "Note shared successfully",
    data: { note },
  });
});

/* ==================== GET NOTE ANALYTICS ==================== */
exports.getNoteAnalytics = catchAsync(async (req, res) => {
  const { period = "month" } = req.query;
  const now = new Date();
  let startDate;

  switch (period) {
    case "week":
      startDate = new Date(now.setDate(now.getDate() - 7));
      break;
    case "month":
      startDate = new Date(now.setMonth(now.getMonth() - 1));
      break;
    case "quarter":
      startDate = new Date(now.setMonth(now.getMonth() - 3));
      break;
    case "year":
      startDate = new Date(now.setFullYear(now.getFullYear() - 1));
      break;
    default:
      startDate = new Date(now.setMonth(now.getMonth() - 1));
  }

  const analytics = await Note.aggregate([
    {
      $match: {
        organizationId: mongoose.Types.ObjectId(req.user.organizationId),
        owner: mongoose.Types.ObjectId(req.user._id),
        isDeleted: false,
        createdAt: { $gte: startDate },
      },
    },
    {
      $facet: {
        byType: [
          {
            $group: {
              _id: "$noteType",
              count: { $sum: 1 },
            },
          },
        ],
        byStatus: [
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ],
        byPriority: [
          {
            $group: {
              _id: "$priority",
              count: { $sum: 1 },
            },
          },
        ],
        dailyActivity: [
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
        completionRate: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              completed: {
                $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
              },
            },
          },
        ],
        topTags: [
          { $unwind: "$tags" },
          {
            $group: {
              _id: "$tags",
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
      },
    },
  ]);

  const result = analytics[0];

  res.status(200).json({
    status: "success",
    data: {
      byType: result.byType,
      byStatus: result.byStatus,
      byPriority: result.byPriority,
      dailyActivity: result.dailyActivity,
      completionRate: result.completionRate[0] || { total: 0, completed: 0 },
      topTags: result.topTags,
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

/* ==================== CREATE MEETING ==================== */
exports.createMeeting = catchAsync(async (req, res, next) => {
  const {
    title,
    description,
    agenda,
    startTime,
    endTime,
    locationType,
    virtualLink,
    participants,
    recurrencePattern,
    ...otherFields
  } = req.body;

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

  const note = await Note.create({
    organizationId: req.user.organizationId,
    owner: req.user._id,
    title: `Meeting: ${title}`,
    content: agenda || description,
    noteType: "meeting",
    isMeeting: true,
    startDate: startTime,
    dueDate: endTime,
    meetingId: meeting._id,
    participants: participants || [],
    visibility: "team",
  });

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
      emitToUser(participant.user, "meetingInvitation", socketPayload);
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
    { new: true, runValidators: true },
  );

  if (!meeting) {
    return next(
      new AppError("Meeting not found or insufficient permissions", 404),
    );
  }

  if (minutes) {
    await Note.findOneAndUpdate(
      { meetingId: meeting._id },
      { content: minutes, summary: minutes.substring(0, 200) + "..." },
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
  const { response } = req.body;

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

  emitToUser(meeting.organizer, "meetingRSVP", {
    type: "MEETING_RSVP",
    data: {
      meetingId: meeting._id,
      userId: req.user._id,
      userName: req.user.name,
      response,
    },
  });

  res.status(200).json({
    status: "success",
    message: `You have ${response} the meeting`,
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

// Add these methods to your existing noteController.js

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

// Get all organization notes (for owners/super admins)
exports.getAllOrganizationNotes = catchAsync(async (req, res) => {
  // Only owners/super admins can access this
  if (!req.user.isOwner && !req.user.isSuperAdmin) {
    return res.status(403).json({
      status: "error",
      message: "Only organization owners or super admins can access all notes",
    });
  }

  const notes = await Note.find({
    organizationId: req.user.organizationId,
    isDeleted: false,
  })
    .populate("owner", "name email")
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    status: "success",
    data: { notes },
  });
});

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

module.exports = exports;
