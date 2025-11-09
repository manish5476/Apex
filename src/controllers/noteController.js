const Note = require('../models/noteModel'); // Assuming you have this model from our previous steps
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// createNote function (remains the same)
exports.createNote = catchAsync(async (req, res, next) => {
    const newNote = await Note.create({ ...req.body, owner: req.user.id });
    res.status(201).json({
        status: 'success',
        data: {
            note: newNote,
        },
    });
});

// getNotes function (remains the same)
exports.getNotes = catchAsync(async (req, res, next) => {
    const { date, week, month, year } = req.query;
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

    const notes = await Note.find({
        owner,
        createdAt: { $gte: startDate, $lte: endDate },
    }).sort({ createdAt: -1 });

    res.status(200).json({
        status: 'success',
        results: notes.length,
        data: { notes },
    });
});


/**
 * @desc    Update an existing note
 * @route   PATCH /api/v1/notes/:id
 * @access  Private
 */
exports.updateNote = catchAsync(async (req, res, next) => {
    const note = await Note.findOneAndUpdate(
        { _id: req.params.id, owner: req.user.id }, // Ensure user owns the note
        req.body,
        {
            new: true, // Return the updated document
            runValidators: true, // Run model validators on update
        }
    );

    if (!note) {
        return next(new AppError('No note found with that ID for the current user.', 404));
    }

    res.status(200).json({
        status: 'success',
        data: {
            note,
        },
    });
});

/**
 * @desc    Delete a note
 * @route   DELETE /api/v1/notes/:id
 * @access  Private
 */
exports.deleteNote = catchAsync(async (req, res, next) => {
    const note = await Note.findOneAndDelete({ _id: req.params.id, owner: req.user.id });

    if (!note) {
        return next(new AppError('No note found with that ID for the current user.', 404));
    }

    // For soft delete (if you have `isDeleted` in your model), you would do this instead:
    // note.isDeleted = true;
    // note.deletedAt = new Date();
    // await note.save();

    res.status(204).json({ // 204 No Content is standard for successful deletions
        status: 'success',
        data: null,
    });
});

/**
 * @desc  Get all note days for a specific month (used for calendar heatmap)
 * @route GET /api/v1/notes/calendar-summary?year=2025&month=11
 * @access Private
 */
exports.getNotesForMonth = catchAsync(async (req, res, next) => {
    const { year, month } = req.query;
    const owner = req.user.id;

    if (!year || !month) {
        return next(new AppError('Please provide both year and month', 400));
    }

    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const notes = await Note.find({
        owner,
        createdAt: { $gte: startDate, $lte: endDate },
    }).select('createdAt');

    const uniqueDays = [
        ...new Set(notes.map((n) => new Date(n.createdAt).getUTCDate())),
    ].map((day) => ({ day }));

    res.status(200).json({
        status: 'success',
        results: uniqueDays.length,
        data: uniqueDays,
    });
});

/**
 * @desc  Get all notes for a specific date (YYYY-MM-DD)
 * @route GET /api/v1/notes/day/:date
 * @access Private
 */
exports.getNotesForDay = catchAsync(async (req, res, next) => {
    const owner = req.user.id;
    const { date } = req.params;

    if (!date) {
        return next(new AppError('Please provide a valid date', 400));
    }

    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const notes = await Note.find({
        owner,
        createdAt: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ createdAt: -1 });

    res.status(200).json({
        status: 'success',
        results: notes.length,
        data: { notes },
    });
});
