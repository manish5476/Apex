const mongoose = require('mongoose');
const Note = require('../models/noteModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { uploadMultipleImages } = require('../services/uploads/imageUploadService');
// ------------------ CREATE NOTE ------------------
exports.createNote = catchAsync(async (req, res, next) => {
  const newNote = await Note.create({
    ...req.body,
    owner: req.user.id,
    organizationId: req.user.organizationId,
    branchId: req.user.branchId,
  });

  res.status(201).json({
    status: 'success',
    data: { note: newNote },
  });
});

// ------------------ GET ALL NOTES ------------------
exports.getNotes = catchAsync(async (req, res, next) => {
  const { date, week, month, year, relatedTo, relatedId } = req.query;
  const owner = req.user.id;

  let startDate, endDate;
  const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

  if (date) {
    startDate = new Date(date);
    startDate.setUTCHours(0, 0, 0, 0);
    endDate = new Date(date);
    endDate.setUTCHours(23, 59, 59, 999);
  } else if (week) {
    const weekDate = new Date(week);
    const dayOfWeek = weekDate.getUTCDay();
    startDate = new Date(weekDate);
    startDate.setUTCDate(weekDate.getUTCDate() - dayOfWeek);
    startDate.setUTCHours(0, 0, 0, 0);
    endDate = new Date(startDate);
    endDate.setUTCDate(startDate.getUTCDate() + 6);
    endDate.setUTCHours(23, 59, 59, 999);
  } else if (month && year) {
    startDate = new Date(Date.UTC(year, month - 1, 1));
    endDate = new Date(Date.UTC(year, month, 1));
    endDate.setUTCMilliseconds(endDate.getUTCMilliseconds() - 1);
  } else if (year) {
    startDate = new Date(Date.UTC(year, 0, 1));
    endDate = new Date(Date.UTC(parseInt(year) + 1, 0, 1));
    endDate.setUTCMilliseconds(endDate.getUTCMilliseconds() - 1);
  } else {
    return next(new AppError('Please provide a valid time period.', 400));
  }

  if (endDate - startDate > MAX_RANGE_MS) {
    return next(new AppError('The date range cannot exceed one year.', 400));
  }

  const filter = {
    owner,
    organizationId: req.user.organizationId,
    branchId: req.user.branchId,
    createdAt: { $gte: startDate, $lte: endDate },
  };

  if (relatedTo && relatedId) {
    filter.relatedTo = relatedTo;
    filter.relatedId = relatedId;
  }

  const notes = await Note.find(filter).sort({ createdAt: -1 });

  res.status(200).json({
    status: 'success',
    results: notes.length,
    data: { notes },
  });
});

// ------------------ GET NOTES FOR SPECIFIC DAY ------------------
exports.getNotesForDay = catchAsync(async (req, res, next) => {
  const { date } = req.params;
  const owner = req.user.id;

  if (!date) return next(new AppError('Please provide a valid date', 400));

  const startOfDay = new Date(date);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const notes = await Note.find({
    owner,
    organizationId: req.user.organizationId,
    branchId: req.user.branchId,
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  }).sort({ createdAt: -1 });

  res.status(200).json({
    status: 'success',
    results: notes.length,
    data: { notes },
  });
});

// ------------------ GET NOTES FOR MONTH (CALENDAR SUMMARY) ------------------
exports.getNotesForMonth = catchAsync(async (req, res, next) => {
  const { year, month } = req.query;
  const owner = req.user.id;

  if (!year || !month) return next(new AppError('Please provide both year and month', 400));

  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const notes = await Note.find({
    owner,
    organizationId: req.user.organizationId,
    branchId: req.user.branchId,
    createdAt: { $gte: startDate, $lte: endDate },
  }).select('createdAt');

  const dailyCounts = [...new Set(notes.map(n => new Date(n.createdAt).getUTCDate()))]
    .map(day => ({ day }));

  res.status(200).json({
    status: 'success',
    results: dailyCounts.length,
    data: dailyCounts,
  });
});

// ------------------ GET NOTE BY ID ------------------
exports.getNoteById = catchAsync(async (req, res, next) => {
  const note = await Note.findOne({
    _id: req.params.id,
    owner: req.user.id,
    organizationId: req.user.organizationId,
    branchId: req.user.branchId,
  });

  if (!note) return next(new AppError('Note not found', 404));

  res.status(200).json({
    status: 'success',
    data: { note },
  });
});

// ------------------ UPDATE NOTE ------------------
exports.updateNote = catchAsync(async (req, res, next) => {
  const note = await Note.findOneAndUpdate(
    { _id: req.params.id, owner: req.user.id },
    req.body,
    { new: true, runValidators: true }
  );

  if (!note) return next(new AppError('Note not found', 404));

  res.status(200).json({
    status: 'success',
    data: { note },
  });
});

// ------------------ DELETE NOTE ------------------
exports.deleteNote = catchAsync(async (req, res, next) => {
  const note = await Note.findOneAndUpdate(
    { _id: req.params.id, owner: req.user.id },
    { isDeleted: true, deletedAt: new Date() },
    { new: true }
  );

  if (!note) return next(new AppError('Note not found', 404));

  res.status(204).json({ status: 'success', data: null });
});

// ------------------ NEW: MEDIA UPLOAD HANDLER ------------------
exports.uploadMedia = catchAsync(async (req, res, next) => {
  // 1. Check for files (Multer puts them in req.files)
  if (!req.files || req.files.length === 0) {
    return next(new AppError('Please upload at least one file.', 400));
  }

  // 2. Extract buffers from the uploaded files
  const imageBuffers = req.files.map(file => file.buffer);

  // 3. Upload to Cloudinary (using your service)
  // 'notes_attachments' is the folder name in Cloudinary
  const uploadResults = await uploadMultipleImages(imageBuffers, 'notes_attachments');

  // 4. Format the data for the frontend
  // The frontend will receive this array and attach it to the "createNote" payload
  const formattedAttachments = uploadResults.map(img => ({
    url: img.url,
    publicId: img.public_id, // Essential for deletion
    fileType: 'image'
  }));

  res.status(201).json({
    status: 'success',
    message: 'Media uploaded successfully',
    data: formattedAttachments
  });
});