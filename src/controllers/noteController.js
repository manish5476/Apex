
const mongoose = require('mongoose');
const Note = require('../models/noteModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

/* --- HELPERS --- */
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

/* --- UPLOAD MEDIA --- */
exports.uploadMedia = catchAsync(async (req, res) => {
  if (!req.files || !req.files.length) {
    return res.status(200).json({ status: 'success', data: [] });
  }

  const files = req.files.map(file => ({
    url: `/uploads/notes/${file.filename}`,
    publicId: file.filename, // Added to match your NoteAttachment model
    fileType: file.mimetype.startsWith('image/') ? 'image' : 'file'
  }));

  res.status(200).json({ status: 'success', data: files });
});

/* --- CREATE NOTE --- */
exports.createNote = catchAsync(async (req, res) => {
  const note = await Note.create({
    owner: req.user._id, // 🔥 Fixed: Uses 'owner' from your Schema
    title: req.body.title,
    content: req.body.content,
    tags: req.body.tags || [],
    attachments: req.body.attachments || [],
    noteDate: req.body.noteDate || new Date(), // 🔥 Uses noteDate for functional calendar logic
    visibility: req.body.visibility || 'public',
    importance: req.body.importance || 'normal',
    isPinned: req.body.isPinned || false
  });

  res.status(201).json({ status: 'success', data: note });
});

/* --- GET NOTES (Filtered by Date or All) --- */
exports.getNotes = catchAsync(async (req, res) => {
  // 🔥 Filter by 'owner' and ignore soft-deleted notes
  const filter = { owner: req.user._id, isDeleted: false };

  if (req.query.date) {
    filter.noteDate = {
      $gte: startOfDay(req.query.date),
      $lte: endOfDay(req.query.date)
    };
  }

  const notes = await Note.find(filter)
    .sort({ noteDate: -1 }) // Sort by the actual note date
    .lean();

  res.status(200).json({
    status: 'success',
    data: { notes }
  });
});

/* --- GET NOTE BY ID --- */
exports.getNoteById = catchAsync(async (req, res, next) => {
  const note = await Note.findOne({
    _id: req.params.id,
    owner: req.user._id,
    isDeleted: false
  });

  if (!note) return next(new AppError('Note not found', 404));

  res.status(200).json({ status: 'success', data: note });
});

/* --- UPDATE NOTE --- */
exports.updateNote = catchAsync(async (req, res, next) => {
  const note = await Note.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id },
    req.body, // Pass the whole body (title, content, tags, importance, etc.)
    { new: true, runValidators: true }
  );

  if (!note) return next(new AppError('Note not found', 404));

  res.status(200).json({ status: 'success', data: note });
});

/* --- DELETE NOTE (Soft Delete) --- */
exports.deleteNote = catchAsync(async (req, res, next) => {
  // Using soft delete as per your model's 'isDeleted' field
  const note = await Note.findOneAndUpdate(
    { _id: req.params.id, owner: req.user._id },
    { isDeleted: true, deletedAt: new Date() }
  );

  if (!note) return next(new AppError('Note not found', 404));

  res.status(204).json({ status: 'success', data: null });
});

/* --- SEARCH NOTES --- */
exports.searchNotes = catchAsync(async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(200).json({ status: 'success', data: [] });

  const notes = await Note.find({
    owner: req.user._id,
    isDeleted: false,
    $text: { $search: query } // Uses the text indexes defined in your model
  })
    .sort({ score: { $meta: "textScore" } })
    .lean();

  res.status(200).json({ status: 'success', data: { notes } });
});

/* --- CALENDAR – MONTHLY STATS --- */
exports.getNotesForMonth = catchAsync(async (req, res) => {
  const year = parseInt(req.query.year);
  const month = parseInt(req.query.month) - 1;

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);

  const stats = await Note.aggregate([
    {
      $match: {
        owner: new mongoose.Types.ObjectId(req.user._id),
        isDeleted: false,
        noteDate: { $gte: start, $lt: end }
      }
    },
    {
      $group: {
        _id: { $dayOfMonth: '$noteDate' },
        count: { $sum: 1 }
      }
    },
    {
      $project: { _id: 0, day: '$_id', count: 1 }
    }
  ]);

  res.status(200).json({ status: 'success', data: stats });
});

// const mongoose = require('mongoose');
// const Note = require('../models/noteModel');
// const catchAsync = require('../utils/catchAsync');
// const AppError = require('../utils/appError');

// /* ======================================================
//    HELPERS
// ====================================================== */

// const startOfDay = (date) => {
//   const d = new Date(date);
//   d.setHours(0, 0, 0, 0);
//   return d;
// };

// const endOfDay = (date) => {
//   const d = new Date(date);
//   d.setHours(23, 59, 59, 999);
//   return d;
// };

// /* ======================================================
//    UPLOAD MEDIA
// ====================================================== */
// exports.uploadMedia = catchAsync(async (req, res) => {
//   if (!req.files || !req.files.length) {
//     return res.status(200).json({
//       status: 'success',
//       data: []
//     });
//   }

//   const files = req.files.map(file => ({
//     url: `/uploads/notes/${file.filename}`,
//     name: file.originalname,
//     type: file.mimetype,
//     size: file.size
//   }));

//   res.status(200).json({
//     status: 'success',
//     data: files
//   });
// });

// /* ======================================================
//    CREATE NOTE
// ====================================================== */
// exports.createNote = catchAsync(async (req, res) => {
//   const note = await Note.create({
//     title: req.body.title,
//     content: req.body.content,
//     tags: req.body.tags || [],
//     attachments: req.body.attachments || [],
//     createdAt: req.body.createdAt || new Date(),
//     user: req.user._id
//   });

//   res.status(201).json({
//     status: 'success',
//     data: note
//   });
// });

// /* ======================================================
//    GET NOTES (DAILY / ALL)
// ====================================================== */
// exports.getNotes = catchAsync(async (req, res) => {
//   const filter = { user: req.user._id };

//   // 📅 Daily filter
//   if (req.query.date) {
//     const dayStart = startOfDay(req.query.date);
//     const dayEnd = endOfDay(req.query.date);

//     filter.createdAt = {
//       $gte: dayStart,
//       $lte: dayEnd
//     };
//   }

//   const notes = await Note.find(filter)
//     .sort({ createdAt: -1 })
//     .lean();

//   res.status(200).json({
//     status: 'success',
//     data: {
//       notes
//     }
//   });
// });

// /* ======================================================
//    GET NOTE BY ID
// ====================================================== */
// exports.getNoteById = catchAsync(async (req, res, next) => {
//   if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
//     return next(new AppError('Invalid note ID', 400));
//   }

//   const note = await Note.findOne({
//     _id: req.params.id,
//     user: req.user._id
//   });

//   if (!note) {
//     return next(new AppError('Note not found', 404));
//   }

//   res.status(200).json({
//     status: 'success',
//     data: note
//   });
// });

// /* ======================================================
//    UPDATE NOTE
// ====================================================== */
// exports.updateNote = catchAsync(async (req, res, next) => {
//   const note = await Note.findOneAndUpdate(
//     { _id: req.params.id, user: req.user._id },
//     {
//       title: req.body.title,
//       content: req.body.content,
//       tags: req.body.tags,
//       attachments: req.body.attachments
//     },
//     {
//       new: true,
//       runValidators: true
//     }
//   );

//   if (!note) {
//     return next(new AppError('Note not found', 404));
//   }

//   res.status(200).json({
//     status: 'success',
//     data: note
//   });
// });

// /* ======================================================
//    DELETE NOTE
// ====================================================== */
// exports.deleteNote = catchAsync(async (req, res, next) => {
//   const note = await Note.findOneAndDelete({
//     _id: req.params.id,
//     user: req.user._id
//   });

//   if (!note) {
//     return next(new AppError('Note not found', 404));
//   }

//   res.status(204).json({
//     status: 'success',
//     data: null
//   });
// });

// /* ======================================================
//    SEARCH NOTES
// ====================================================== */
// exports.searchNotes = catchAsync(async (req, res) => {
//   const query = req.query.q;

//   if (!query) {
//     return res.status(200).json({
//       status: 'success',
//       data: []
//     });
//   }

//   const notes = await Note.find({
//     user: req.user._id,
//     $or: [
//       { title: { $regex: query, $options: 'i' } },
//       { content: { $regex: query, $options: 'i' } },
//       { tags: { $regex: query, $options: 'i' } }
//     ]
//   })
//     .sort({ createdAt: -1 })
//     .lean();

//   res.status(200).json({
//     status: 'success',
//     data: notes
//   });
// });

// /* ======================================================
//    CALENDAR – MONTHLY NOTE COUNTS
// ====================================================== */
// exports.getNotesForMonth = catchAsync(async (req, res) => {
//   const year = parseInt(req.query.year);
//   const month = parseInt(req.query.month) - 1;

//   if (isNaN(year) || isNaN(month)) {
//     return res.status(400).json({
//       status: 'fail',
//       message: 'Invalid year or month'
//     });
//   }

//   const start = new Date(year, month, 1);
//   const end = new Date(year, month + 1, 1);

//   const stats = await Note.aggregate([
//     {
//       $match: {
//         user: req.user._id,
//         createdAt: { $gte: start, $lt: end }
//       }
//     },
//     {
//       $group: {
//         _id: { $dayOfMonth: '$createdAt' },
//         count: { $sum: 1 }
//       }
//     },
//     {
//       $project: {
//         _id: 0,
//         day: '$_id',
//         count: 1
//       }
//     }
//   ]);

//   res.status(200).json({
//     status: 'success',
//     data: stats
//   });
// });


// // const mongoose = require('mongoose');
// // const Note = require('../models/noteModel');
// // const catchAsync = require('../utils/catchAsync');
// // const AppError = require('../utils/appError');
// // const { uploadMultipleImages } = require('../services/uploads/imageUploadService');

// // /* =========================================================
// //    HELPERS
// // ========================================================= */

// // const buildVisibilityFilter = (req) => ({
// //   $or: [
// //     { visibility: 'public' },
// //     { owner: req.user.id },
// //     { visibility: 'team', branchId: req.user.branchId }
// //   ]
// // });

// // const sanitizeUpdate = (body) => {
// //   const allowed = [
// //     'title',
// //     'content',
// //     'tags',
// //     'attachments',
// //     'visibility',
// //     'importance',
// //     'isPinned',
// //     'noteDate'
// //   ];

// //   const clean = {};
// //   allowed.forEach(k => {
// //     if (body[k] !== undefined) clean[k] = body[k];
// //   });
// //   return clean;
// // };

// // /* =========================================================
// //    CREATE NOTE
// // ========================================================= */
// // exports.createNote = catchAsync(async (req, res) => {
// //   const note = await Note.create({
// //     title: req.body.title,
// //     content: req.body.content,
// //     tags: req.body.tags || [],
// //     attachments: req.body.attachments || [],
// //     noteDate: req.body.noteDate || new Date(),
// //     visibility: req.body.visibility || 'public',
// //     importance: req.body.importance || 'normal',

// //     owner: req.user.id,
// //     organizationId: req.user.organizationId,
// //     branchId: req.user.branchId
// //   });

// //   res.status(201).json({
// //     status: 'success',
// //     data: { note }
// //   });
// // });

// // /* =========================================================
// //    GET NOTES (CALENDAR / ARCHIVE)
// // ========================================================= */
// // exports.getNotes = catchAsync(async (req, res) => {
// //   const { date, search, tag } = req.query;

// //   const filter = {
// //     organizationId: req.user.organizationId,
// //     ...buildVisibilityFilter(req)
// //   };

// //   // Day filter (calendar sidebar)
// //   if (date) {
// //     const start = new Date(date);
// //     start.setHours(0, 0, 0, 0);

// //     const end = new Date(date);
// //     end.setHours(23, 59, 59, 999);

// //     filter.noteDate = { $gte: start, $lte: end };
// //   }

// //   // Tag filter (archive)
// //   if (tag && tag !== 'all') {
// //     filter.tags = tag;
// //   }

// //   // Full text search
// //   if (search) {
// //     filter.$text = { $search: search };
// //   }

// //   const notes = await Note.find(filter)
// //     .sort({ isPinned: -1, noteDate: -1 })
// //     .populate('owner', 'name avatar');

// //   res.status(200).json({
// //     status: 'success',
// //     results: notes.length,
// //     data: { notes }
// //   });
// // });

// // /* =========================================================
// //    CALENDAR SUMMARY (FAST)
// // ========================================================= */
// // exports.getNotesForMonth = catchAsync(async (req, res) => {
// //   const { year, month } = req.query;

// //   if (!year || !month) {
// //     throw new AppError('Year and month required', 400);
// //   }

// //   const start = new Date(Date.UTC(year, month - 1, 1));
// //   const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

// //   const stats = await Note.aggregate([
// //     {
// //       $match: {
// //         organizationId: new mongoose.Types.ObjectId(req.user.organizationId),
// //         noteDate: { $gte: start, $lte: end },
// //         isDeleted: { $ne: true },
// //         ...buildVisibilityFilter(req)
// //       }
// //     },
// //     {
// //       $group: {
// //         _id: { $dayOfMonth: '$noteDate' },
// //         count: { $sum: 1 },
// //         hasHighPriority: {
// //           $max: { $cond: [{ $eq: ['$importance', 'high'] }, 1, 0] }
// //         }
// //       }
// //     },
// //     {
// //       $project: {
// //         day: '$_id',
// //         count: 1,
// //         hasHighPriority: 1,
// //         _id: 0
// //       }
// //     },
// //     { $sort: { day: 1 } }
// //   ]);

// //   res.status(200).json({
// //     status: 'success',
// //     data: stats
// //   });
// // });

// // /* =========================================================
// //    GET SINGLE NOTE
// // ========================================================= */
// // exports.getNoteById = catchAsync(async (req, res) => {
// //   const note = await Note.findOne({
// //     _id: req.params.id,
// //     organizationId: req.user.organizationId
// //   }).populate('owner', 'name avatar');

// //   if (!note) throw new AppError('Note not found', 404);

// //   if (note.visibility === 'private' && String(note.owner._id) !== String(req.user.id)) {
// //     throw new AppError('Access denied', 403);
// //   }

// //   res.status(200).json({
// //     status: 'success',
// //     data: { note }
// //   });
// // });

// // /* =========================================================
// //    UPDATE NOTE
// // ========================================================= */
// // exports.updateNote = catchAsync(async (req, res) => {
// //   const note = await Note.findOne({
// //     _id: req.params.id,
// //     organizationId: req.user.organizationId
// //   });

// //   if (!note) throw new AppError('Note not found', 404);

// //   if (String(note.owner) !== String(req.user.id) && req.user.role !== 'admin') {
// //     throw new AppError('You can only edit your own notes', 403);
// //   }

// //   Object.assign(note, sanitizeUpdate(req.body));
// //   await note.save();

// //   res.status(200).json({
// //     status: 'success',
// //     data: { note }
// //   });
// // });

// // /* =========================================================
// //    DELETE NOTE (SOFT)
// // ========================================================= */
// // exports.deleteNote = catchAsync(async (req, res) => {
// //   const note = await Note.findOne({
// //     _id: req.params.id,
// //     organizationId: req.user.organizationId
// //   });

// //   if (!note) throw new AppError('Note not found', 404);

// //   if (String(note.owner) !== String(req.user.id) && req.user.role !== 'admin') {
// //     throw new AppError('Unauthorized', 403);
// //   }

// //   note.isDeleted = true;
// //   note.deletedAt = new Date();
// //   await note.save();

// //   res.status(204).send();
// // });

// // /* =========================================================
// //    MEDIA UPLOAD
// // ========================================================= */
// // exports.uploadMedia = catchAsync(async (req, res) => {
// //   if (!req.files?.length) {
// //     throw new AppError('No files uploaded', 400);
// //   }

// //   const buffers = req.files.map(f => f.buffer);
// //   const uploads = await uploadMultipleImages(buffers, 'notes');

// //   res.status(201).json({
// //     status: 'success',
// //     data: uploads.map(img => ({
// //       url: img.url,
// //       publicId: img.public_id,
// //       fileType: 'image'
// //     }))
// //   });
// // });

// // // const mongoose = require('mongoose');
// // // const Note = require('../models/noteModel');
// // // const catchAsync = require('../utils/catchAsync');
// // // const AppError = require('../utils/appError');
// // // const { uploadMultipleImages } = require('../services/uploads/imageUploadService');

// // // /* =====================================================
// // //    CREATE NOTE
// // // ===================================================== */
// // // exports.createNote = catchAsync(async (req, res, next) => {
// // //   const noteDate = req.body.noteDate
// // //     ? new Date(req.body.noteDate)
// // //     : new Date();

// // //   const note = await Note.create({
// // //     title: req.body.title,
// // //     content: req.body.content,
// // //     visibility: req.body.visibility || 'public',
// // //     importance: req.body.importance || 'normal',
// // //     tags: req.body.tags || [],
// // //     relatedTo: req.body.relatedTo,
// // //     relatedId: req.body.relatedId,
// // //     noteDate,
// // //     owner: req.user.id,
// // //     organizationId: req.user.organizationId,
// // //     branchId: req.user.branchId,
// // //   });

// // //   res.status(201).json({
// // //     status: 'success',
// // //     data: { note },
// // //   });
// // // });

// // // /* =====================================================
// // //    GET NOTES (FILTERED + SECURE + FAST)
// // // ===================================================== */
// // // exports.getNotes = catchAsync(async (req, res) => {
// // //   const { date, week, month, year, relatedTo, relatedId, search } = req.query;
// // //   const orgId = req.user.organizationId;
// // //   const userId = req.user.id;
// // //   const branchId = req.user.branchId;

// // //   let startDate, endDate;

// // //   // ---- Date Handling ----
// // //   if (date) {
// // //     startDate = new Date(date);
// // //     startDate.setUTCHours(0, 0, 0, 0);
// // //     endDate = new Date(date);
// // //     endDate.setUTCHours(23, 59, 59, 999);
// // //   } else if (week) {
// // //     const w = new Date(week);
// // //     startDate = new Date(w);
// // //     startDate.setUTCDate(w.getUTCDate() - w.getUTCDay());
// // //     startDate.setUTCHours(0, 0, 0, 0);
// // //     endDate = new Date(startDate);
// // //     endDate.setUTCDate(startDate.getUTCDate() + 6);
// // //     endDate.setUTCHours(23, 59, 59, 999);
// // //   } else if (month && year) {
// // //     startDate = new Date(Date.UTC(year, month - 1, 1));
// // //     endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
// // //   }

// // //   const filter = {
// // //     organizationId: orgId,
// // //     isDeleted: { $ne: true },
// // //     $or: [
// // //       { visibility: 'public' },
// // //       { owner: userId },
// // //       { visibility: 'team', branchId },
// // //     ],
// // //   };

// // //   if (startDate && endDate) {
// // //     filter.noteDate = { $gte: startDate, $lte: endDate };
// // //   }

// // //   if (relatedTo && relatedId) {
// // //     filter.relatedTo = relatedTo;
// // //     filter.relatedId = relatedId;
// // //   }

// // //   // ---- Text Search (optimized) ----
// // //   if (search) {
// // //     delete filter.noteDate;
// // //     filter.$text = { $search: search };
// // //   }

// // //   const notes = await Note.find(filter)
// // //     .sort(
// // //       search
// // //         ? { score: { $meta: 'textScore' } }
// // //         : { isPinned: -1, noteDate: -1 }
// // //     )
// // //     .limit(100)
// // //     .populate('owner', 'name avatar role');

// // //   res.status(200).json({
// // //     status: 'success',
// // //     results: notes.length,
// // //     data: { notes },
// // //   });
// // // });

// // // /* =====================================================
// // //    CALENDAR SUMMARY (FAST AGGREGATION)
// // // ===================================================== */
// // // exports.getNotesForMonth = catchAsync(async (req, res, next) => {
// // //   const { year, month } = req.query;
// // //   if (!year || !month) {
// // //     return next(new AppError('Year and month required', 400));
// // //   }

// // //   const start = new Date(Date.UTC(year, month - 1, 1));
// // //   const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

// // //   const data = await Note.aggregate([
// // //     {
// // //       $match: {
// // //         organizationId: new mongoose.Types.ObjectId(req.user.organizationId),
// // //         isDeleted: { $ne: true },
// // //         noteDate: { $gte: start, $lte: end },
// // //         $or: [
// // //           { visibility: 'public' },
// // //           { owner: new mongoose.Types.ObjectId(req.user.id) },
// // //           {
// // //             visibility: 'team',
// // //             branchId: new mongoose.Types.ObjectId(req.user.branchId),
// // //           },
// // //         ],
// // //       },
// // //     },
// // //     {
// // //       $group: {
// // //         _id: { $dayOfMonth: '$noteDate' },
// // //         count: { $sum: 1 },
// // //         hasHighPriority: {
// // //           $max: {
// // //             $cond: [{ $eq: ['$importance', 'high'] }, 1, 0],
// // //           },
// // //         },
// // //       },
// // //     },
// // //     {
// // //       $project: {
// // //         _id: 0,
// // //         day: '$_id',
// // //         count: 1,
// // //         hasHighPriority: { $toBool: '$hasHighPriority' },
// // //       },
// // //     },
// // //     { $sort: { day: 1 } },
// // //   ]);

// // //   res.status(200).json({
// // //     status: 'success',
// // //     data,
// // //   });
// // // });

// // // /* =====================================================
// // //    GET SINGLE NOTE
// // // ===================================================== */
// // // exports.getNoteById = catchAsync(async (req, res, next) => {
// // //   const note = await Note.findOne({
// // //     _id: req.params.id,
// // //     organizationId: req.user.organizationId,
// // //     isDeleted: { $ne: true },
// // //   }).populate('owner', 'name avatar');

// // //   if (!note) return next(new AppError('Note not found', 404));

// // //   if (
// // //     note.visibility === 'private' &&
// // //     String(note.owner._id) !== String(req.user.id)
// // //   ) {
// // //     return next(new AppError('Access denied', 403));
// // //   }

// // //   res.status(200).json({ status: 'success', data: { note } });
// // // });

// // // /* =====================================================
// // //    UPDATE NOTE (SAFE)
// // // ===================================================== */
// // // exports.updateNote = catchAsync(async (req, res, next) => {
// // //   const note = await Note.findOne({
// // //     _id: req.params.id,
// // //     organizationId: req.user.organizationId,
// // //     isDeleted: { $ne: true },
// // //   });

// // //   if (!note) return next(new AppError('Note not found', 404));

// // //   if (
// // //     String(note.owner) !== String(req.user.id) &&
// // //     req.user.role !== 'admin'
// // //   ) {
// // //     return next(new AppError('Unauthorized', 403));
// // //   }

// // //   const allowedFields = [
// // //     'title',
// // //     'content',
// // //     'visibility',
// // //     'importance',
// // //     'tags',
// // //     'isPinned',
// // //   ];

// // //   allowedFields.forEach(field => {
// // //     if (req.body[field] !== undefined) {
// // //       note[field] = req.body[field];
// // //     }
// // //   });

// // //   await note.save();

// // //   res.status(200).json({ status: 'success', data: { note } });
// // // });

// // // /* =====================================================
// // //    DELETE NOTE (SOFT)
// // // ===================================================== */
// // // exports.deleteNote = catchAsync(async (req, res, next) => {
// // //   const note = await Note.findOne({
// // //     _id: req.params.id,
// // //     organizationId: req.user.organizationId,
// // //   });

// // //   if (!note) return next(new AppError('Note not found', 404));

// // //   if (
// // //     String(note.owner) !== String(req.user.id) &&
// // //     req.user.role !== 'admin'
// // //   ) {
// // //     return next(new AppError('Unauthorized', 403));
// // //   }

// // //   note.isDeleted = true;
// // //   note.deletedAt = new Date();
// // //   await note.save();

// // //   res.status(204).send();
// // // });

// // // /* =====================================================
// // //    MEDIA UPLOAD
// // // ===================================================== */
// // // exports.uploadMedia = catchAsync(async (req, res, next) => {
// // //   if (!req.files?.length) {
// // //     return next(new AppError('No files uploaded', 400));
// // //   }

// // //   const buffers = req.files.map(f => f.buffer);
// // //   const uploads = await uploadMultipleImages(buffers, 'notes_attachments');

// // //   const attachments = uploads.map(img => ({
// // //     url: img.url,
// // //     publicId: img.public_id,
// // //     fileType: 'image',
// // //   }));

// // //   res.status(201).json({
// // //     status: 'success',
// // //     data: attachments,
// // //   });
// // // });

// // // /* =====================================================
// // //    SEARCH NOTES
// // // ===================================================== */
// // // exports.searchNotes = catchAsync(async (req, res, next) => {
// // //   const q = req.query.q;
// // //   if (!q) return next(new AppError('Search query required', 400));

// // //   const notes = await Note.find({
// // //     organizationId: req.user.organizationId,
// // //     isDeleted: { $ne: true },
// // //     $text: { $search: q },
// // //     $or: [
// // //       { visibility: 'public' },
// // //       { owner: req.user.id },
// // //       { visibility: 'team', branchId: req.user.branchId },
// // //     ],
// // //   })
// // //     .sort({ score: { $meta: 'textScore' } })
// // //     .limit(50)
// // //     .populate('owner', 'name');

// // //   res.status(200).json({
// // //     status: 'success',
// // //     results: notes.length,
// // //     data: { notes },
// // //   });
// // // });


// // // // const mongoose = require('mongoose');
// // // // const Note = require('../models/noteModel');
// // // // const catchAsync = require('../utils/catchAsync');
// // // // const AppError = require('../utils/appError');
// // // // const { uploadMultipleImages } = require('../services/uploads/imageUploadService');

// // // // // ------------------ CREATE NOTE ------------------
// // // // exports.createNote = catchAsync(async (req, res, next) => {
// // // //   // Allow user to set specific date, or default to now
// // // //   const noteDate = req.body.noteDate ? new Date(req.body.noteDate) : new Date();

// // // //   const newNote = await Note.create({
// // // //     ...req.body,
// // // //     noteDate,
// // // //     owner: req.user.id,
// // // //     organizationId: req.user.organizationId,
// // // //     branchId: req.user.branchId, // Optional: override if needed
// // // //   });

// // // //   res.status(201).json({
// // // //     status: 'success',
// // // //     data: { note: newNote },
// // // //   });
// // // // });

// // // // // ------------------ GET ALL NOTES (Org Wide + Security) ------------------
// // // // exports.getNotes = catchAsync(async (req, res, next) => {
// // // //   const { date, week, month, year, relatedTo, relatedId, search } = req.query;
// // // //   const orgId = req.user.organizationId;
// // // //   const userId = req.user.id;

// // // //   let startDate, endDate;
// // // //   const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

// // // //   // 1. Date Logic (Using noteDate)
// // // //   if (date) {
// // // //     startDate = new Date(date); startDate.setUTCHours(0, 0, 0, 0);
// // // //     endDate = new Date(date); endDate.setUTCHours(23, 59, 59, 999);
// // // //   } else if (week) {
// // // //     const w = new Date(week);
// // // //     startDate = new Date(w); startDate.setUTCDate(w.getUTCDate() - w.getUTCDay()); startDate.setUTCHours(0,0,0,0);
// // // //     endDate = new Date(startDate); endDate.setUTCDate(startDate.getUTCDate() + 6); endDate.setUTCHours(23,59,59,999);
// // // //   } else if (month && year) {
// // // //     startDate = new Date(Date.UTC(year, month - 1, 1));
// // // //     endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
// // // //   } else {
// // // //     // Default: Current Month if nothing specified
// // // //     const now = new Date();
// // // //     startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
// // // //     endDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));
// // // //   }

// // // //   // 🛡️ VISIBILITY LOGIC (The "Apex Standard")
// // // //   // Show note IF: It belongs to Org AND (is Public OR belongs to Me)
// // // //   const filter = {
// // // //     organizationId: orgId,
// // // //     noteDate: { $gte: startDate, $lte: endDate },
// // // //     $or: [
// // // //         { visibility: 'public' },
// // // //         { owner: userId }
// // // //     ]
// // // //   };

// // // //   // Specific Filters
// // // //   if (relatedTo && relatedId) {
// // // //     filter.relatedTo = relatedTo;
// // // //     filter.relatedId = relatedId;
// // // //   }

// // // //   // Text Search (Optional mix-in)
// // // //   if (search) {
// // // //       filter.$text = { $search: search };
// // // //   }

// // // //   // Fetch
// // // //   const notes = await Note.find(filter)
// // // //     .sort({ isPinned: -1, noteDate: -1 }) // Pinned first, then newest
// // // //     .populate('owner', 'name avatar role'); // Show who wrote it

// // // //   res.status(200).json({
// // // //     status: 'success',
// // // //     results: notes.length,
// // // //     data: { notes },
// // // //   });
// // // // });

// // // // // ------------------ CALENDAR SUMMARY ------------------
// // // // exports.getNotesForMonth = catchAsync(async (req, res, next) => {
// // // //   const { year, month } = req.query;
// // // //   if (!year || !month) return next(new AppError('Year and Month required', 400));

// // // //   const start = new Date(Date.UTC(year, month - 1, 1));
// // // //   const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

// // // //   // Efficient Aggregation
// // // //   const counts = await Note.aggregate([
// // // //     { 
// // // //       $match: { 
// // // //         organizationId: new mongoose.Types.ObjectId(req.user.organizationId),
// // // //         noteDate: { $gte: start, $lte: end },
// // // //         isDeleted: { $ne: true },
// // // //         // Same visibility logic as above
// // // //         $or: [{ visibility: 'public' }, { owner: new mongoose.Types.ObjectId(req.user.id) }]
// // // //       } 
// // // //     },
// // // //     {
// // // //       $group: {
// // // //         _id: { $dayOfMonth: "$noteDate" },
// // // //         count: { $sum: 1 },
// // // //         hasHighPriority: { $max: { $cond: [{ $eq: ["$importance", "high"] }, 1, 0] } } // Flag if urgent note exists
// // // //       }
// // // //     },
// // // //     { $project: { day: "$_id", count: 1, hasHighPriority: 1, _id: 0 } },
// // // //     { $sort: { day: 1 } }
// // // //   ]);

// // // //   res.status(200).json({
// // // //     status: 'success',
// // // //     results: counts.length,
// // // //     data: counts,
// // // //   });
// // // // });

// // // // // ------------------ GET SINGLE NOTE ------------------
// // // // exports.getNoteById = catchAsync(async (req, res, next) => {
// // // //   const note = await Note.findOne({ 
// // // //       _id: req.params.id, 
// // // //       organizationId: req.user.organizationId 
// // // //   }).populate('owner', 'name avatar');

// // // //   if (!note) return next(new AppError('Note not found', 404));

// // // //   // Security: Block private notes of others
// // // //   if (note.visibility === 'private' && String(note.owner._id) !== String(req.user.id)) {
// // // //       return next(new AppError('You do not have permission to view this private note.', 403));
// // // //   }

// // // //   res.status(200).json({ status: 'success', data: { note } });
// // // // });

// // // // // ------------------ UPDATE NOTE ------------------
// // // // exports.updateNote = catchAsync(async (req, res, next) => {
// // // //   const note = await Note.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
// // // //   if (!note) return next(new AppError('Note not found', 404));

// // // //   // Permission: Only Owner or Admin
// // // //   if (String(note.owner) !== String(req.user.id) && req.user.role !== 'admin') {
// // // //       return next(new AppError('You can only edit your own notes', 403));
// // // //   }

// // // //   // Prevent moving notes to other Orgs
// // // //   if (req.body.organizationId) delete req.body.organizationId;

// // // //   Object.assign(note, req.body);
// // // //   await note.save();

// // // //   res.status(200).json({ status: 'success', data: { note } });
// // // // });

// // // // // ------------------ DELETE NOTE ------------------
// // // // exports.deleteNote = catchAsync(async (req, res, next) => {
// // // //   const note = await Note.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
// // // //   if (!note) return next(new AppError('Note not found', 404));

// // // //   // Permission: Only Owner or Admin
// // // //   if (String(note.owner) !== String(req.user.id) && req.user.role !== 'admin') {
// // // //       return next(new AppError('You can only delete your own notes', 403));
// // // //   }

// // // //   note.isDeleted = true;
// // // //   note.deletedAt = new Date();
// // // //   await note.save();

// // // //   res.status(204).json({ status: 'success', data: null });
// // // // });

// // // // // ------------------ MEDIA UPLOAD ------------------
// // // // exports.uploadMedia = catchAsync(async (req, res, next) => {
// // // //   if (!req.files || req.files.length === 0) {
// // // //     return next(new AppError('Please upload at least one file.', 400));
// // // //   }

// // // //   const imageBuffers = req.files.map(file => file.buffer);
// // // //   const uploadResults = await uploadMultipleImages(imageBuffers, 'notes_attachments');

// // // //   const formattedAttachments = uploadResults.map(img => ({
// // // //     url: img.url,
// // // //     publicId: img.public_id,
// // // //     fileType: 'image'
// // // //   }));

// // // //   res.status(201).json({
// // // //     status: 'success',
// // // //     message: 'Media uploaded successfully',
// // // //     data: formattedAttachments
// // // //   });
// // // // });

// // // // // ------------------ SEARCH ------------------
// // // // exports.searchNotes = catchAsync(async (req, res, next) => {
// // // //   const q = req.query.q || "";
// // // //   if (!q) return next(new AppError('Search query required', 400));

// // // //   const notes = await Note.find({
// // // //     organizationId: req.user.organizationId,
// // // //     $or: [{ visibility: 'public' }, { owner: req.user.id }],
// // // //     $text: { $search: q }
// // // //   })
// // // //   .sort({ score: { $meta: "textScore" } })
// // // //   .limit(50)
// // // //   .populate('owner', 'name');

// // // //   res.status(200).json({ status: "success", results: notes.length, data: { notes } });
// // // // });

// // // // // ------------------ TAGS ------------------
// // // // exports.updateTags = catchAsync(async (req, res, next) => {
// // // //   const { tags } = req.body;
// // // //   if (!Array.isArray(tags)) return next(new AppError("Tags must be an array", 400));

// // // //   const note = await Note.findOneAndUpdate(
// // // //       { _id: req.params.id, organizationId: req.user.organizationId, owner: req.user.id }, // Strict Owner Check
// // // //       { tags }, 
// // // //       { new: true }
// // // //   );

// // // //   if (!note) return next(new AppError("Note not found or unauthorized", 404));
// // // //   res.status(200).json({ status: "success", data: { note } });
// // // // });
