// modules/Notes/meetingController.js
// ─────────────────────────────────────────────────────────────────────────────
//  Import fix: NoteActivity now imported from its own dedicated file.
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const Meeting = require('./meeting.model');
const Note = require('./noteModel');
const User = require('../auth/core/user.model');
const NoteActivity = require('./noteActivity.model');   // FIX: dedicated file
const catchAsync = require('../../core/utils/api/catchAsync');
const AppError = require('../../core/utils/api/appError');
const { emitToUser } = require('../../socketHandlers/socket');

// ─────────────────────────────────────────────
//  CREATE MEETING
// ─────────────────────────────────────────────

exports.createMeeting = catchAsync(async (req, res, next) => {
  const {
    title, description, startTime, endTime, timezone,
    locationType, physicalLocation, virtual,
    participants, agendaItems, tags, category,
    recurrence, isRecurring, reminders,
    settings, bufferBefore, bufferAfter,
    ...otherFields
  } = req.body;

  // Validate participants belong to org before opening transaction
  const participantIds = (participants || []).map(p => p.user).filter(Boolean);
  if (participantIds.length) {
    const validUsers = await User.find({
      _id: { $in: participantIds },
      organizationId: req.user.organizationId,
      isActive: true,
    }).select('_id').lean();

    if (validUsers.length !== participantIds.length) {
      return next(new AppError('One or more participants not found in your organisation', 400));
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [meeting] = await Meeting.create([{
      organizationId: req.user.organizationId,
      organizer: req.user._id,
      createdBy: req.user._id,
      title,
      description,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      timezone: timezone || 'UTC',
      locationType: locationType || 'virtual',
      physicalLocation,
      virtual,
      participants: (participants || []).map(p => ({
        user: p.user,
        role: p.role || 'attendee',
        invitationStatus: 'pending',
        invitedAt: new Date(),
      })),
      agendaItems: (agendaItems || []).map((item, i) => ({ ...item, order: i + 1 })),
      tags: tags || [],
      category,
      isRecurring: !!isRecurring,
      recurrence: isRecurring ? recurrence : undefined,
      reminders: reminders || [],
      settings: settings || {},
      bufferBefore: bufferBefore || 0,
      bufferAfter: bufferAfter || 0,
      ...otherFields,
    }], { session });

    // Create the linked meeting_note Note
    const [note] = await Note.create([{
      organizationId: req.user.organizationId,
      owner: req.user._id,
      createdBy: req.user._id,
      title: `📋 ${title}`,
      content: (agendaItems || []).map((a, i) => `${i + 1}. ${a.title}`).join('\n') || description || '',
      itemType: 'meeting_note',
      status: 'open',
      startDate: new Date(startTime),
      dueDate: new Date(endTime),
      meetingId: meeting._id,
      visibility: 'team',
      assignees: [
        { user: req.user._id, assignedBy: req.user._id, role: 'owner', status: 'accepted', acceptedAt: new Date() },
        ...participantIds.map(uid => ({ user: uid, assignedBy: req.user._id, role: 'collaborator', status: 'pending' })),
      ],
      watchers: [req.user._id, ...participantIds],
    }], { session });

    await Meeting.findByIdAndUpdate(meeting._id, { linkedNoteId: note._id }, { session });

    await session.commitTransaction();

    // Notify participants (outside transaction — non-critical)
    participantIds.forEach(uid => {
      emitToUser(uid, 'meetingInvitation', {
        type: 'MEETING_INVITATION',
        meetingId: meeting._id,
        title: meeting.title,
        organizer: req.user.name,
        startTime: meeting.startTime,
        virtualLink: meeting.virtual?.link,
      });
    });

    NoteActivity.log({
      meetingId: meeting._id, organizationId: req.user.organizationId,
      actor: req.user._id, action: 'meeting_created',
    });

    res.status(201).json({ status: 'success', data: { meeting, note } });

  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
});

// ─────────────────────────────────────────────
//  GET MEETINGS
// ─────────────────────────────────────────────

exports.getUserMeetings = catchAsync(async (req, res) => {
  const { status, startDate, endDate, limit = 50, page = 1 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const filter = {
    organizationId: req.user.organizationId,
    isDeleted: false,
    $or: [{ organizer: req.user._id }, { 'participants.user': req.user._id }],
  };

  if (status) filter.status = status;
  if (startDate) filter.startTime = { $gte: new Date(startDate) };
  if (endDate) filter.endTime = { $lte: new Date(endDate) };

  const [meetings, total] = await Promise.all([
    Meeting.find(filter)
      .sort({ startTime: 1 })
      .skip(skip).limit(parseInt(limit))
      .populate('organizer', 'name email avatar')
      .populate('participants.user', 'name email avatar')
      .lean(),
    Meeting.countDocuments(filter),
  ]);

  res.status(200).json({
    status: 'success',
    data: { meetings, pagination: { total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } },
  });
});

exports.getMeetingById = catchAsync(async (req, res, next) => {
  const meeting = await Meeting.findOne({
    _id: req.params.meetingId, organizationId: req.user.organizationId, isDeleted: false,
    $or: [{ organizer: req.user._id }, { 'participants.user': req.user._id }],
  })
    .populate('organizer', 'name email avatar')
    .populate('participants.user', 'name email avatar')
    .populate('actionItems.assignedTo', 'name email avatar')
    .populate('agendaItems.presenter', 'name email')
    .populate('linkedNoteId', 'title content updatedAt');

  if (!meeting) return next(new AppError('Meeting not found', 404));
  res.status(200).json({ status: 'success', data: { meeting } });
});

// ─────────────────────────────────────────────
//  UPDATE MEETING
// ─────────────────────────────────────────────

exports.updateMeeting = catchAsync(async (req, res, next) => {
  const meeting = await Meeting.findOne({
    _id: req.params.meetingId, organizationId: req.user.organizationId, isDeleted: false,
    $or: [
      { organizer: req.user._id },
      { 'participants': { $elemMatch: { user: req.user._id, role: { $in: ['organizer', 'presenter'] } } } },
    ],
  });
  if (!meeting) return next(new AppError('Meeting not found or insufficient permissions', 404));

  const { status, minutes, actionItems, agendaItems, ...rest } = req.body;
  if (status) meeting.status = status;
  if (minutes) meeting.minutes = minutes;
  if (actionItems) meeting.actionItems = actionItems;
  if (agendaItems) meeting.agendaItems = agendaItems;
  Object.assign(meeting, rest);
  meeting.updatedBy = req.user._id;
  await meeting.save();

  if (minutes && meeting.linkedNoteId) {
    await Note.findByIdAndUpdate(meeting.linkedNoteId, {
      content: minutes,
      summary: minutes.length > 200 ? minutes.substring(0, 200) + '…' : minutes,
    });
  }

  if (status === 'cancelled') {
    meeting.participants.forEach(p => {
      if (p.user) emitToUser(p.user, 'meetingCancelled', { meetingId: meeting._id, title: meeting.title });
    });
  }

  res.status(200).json({ status: 'success', data: { meeting } });
});

exports.cancelMeeting = catchAsync(async (req, res, next) => {
  const { reason } = req.body;
  const meeting = await Meeting.findOneAndUpdate(
    { _id: req.params.meetingId, organizer: req.user._id, isDeleted: false },
    { status: 'cancelled', cancelReason: reason, updatedBy: req.user._id },
    { new: true }
  );
  if (!meeting) return next(new AppError('Meeting not found', 404));
  meeting.participants.forEach(p => {
    if (p.user) emitToUser(p.user, 'meetingCancelled', { meetingId: meeting._id, title: meeting.title, reason });
  });
  res.status(200).json({ status: 'success', data: { meeting } });
});

// ─────────────────────────────────────────────
//  RSVP
// ─────────────────────────────────────────────

exports.meetingRSVP = catchAsync(async (req, res, next) => {
  const { response } = req.body;
  const VALID = ['accepted', 'declined', 'tentative'];
  if (!VALID.includes(response)) return next(new AppError(`Response must be one of: ${VALID.join(', ')}`, 400));

  const meeting = await Meeting.findOne({
    _id: req.params.meetingId, 'participants.user': req.user._id, isDeleted: false,
  });
  if (!meeting) return next(new AppError('Meeting not found or you are not invited', 404));

  const participant = meeting.participants.find(p => p.user?.toString() === req.user._id.toString());
  if (participant) { participant.invitationStatus = response; participant.respondedAt = new Date(); }
  await meeting.save();

  emitToUser(meeting.organizer, 'meetingRSVP', { meetingId: meeting._id, userId: req.user._id, userName: req.user.name, response });

  const actionMap = { accepted: 'rsvp_accepted', declined: 'rsvp_declined', tentative: 'rsvp_tentative' };
  NoteActivity.log({ meetingId: meeting._id, organizationId: req.user.organizationId, actor: req.user._id, action: actionMap[response] });

  res.status(200).json({ status: 'success', message: `You have ${response} the meeting` });
});

// ─────────────────────────────────────────────
//  ATTENDANCE
// ─────────────────────────────────────────────

exports.joinMeeting = catchAsync(async (req, res, next) => {
  const meeting = await Meeting.findOne({
    _id: req.params.meetingId, isDeleted: false,
    $or: [{ organizer: req.user._id }, { 'participants.user': req.user._id }],
  });
  if (!meeting) return next(new AppError('Meeting not found', 404));
  meeting.recordJoin(req.user._id);
  if (meeting.status === 'scheduled') meeting.status = 'in_progress';
  await meeting.save();
  NoteActivity.log({ meetingId: meeting._id, organizationId: req.user.organizationId, actor: req.user._id, action: 'participant_joined' });
  res.status(200).json({ status: 'success', data: { meeting } });
});

exports.leaveMeeting = catchAsync(async (req, res, next) => {
  const meeting = await Meeting.findOne({ _id: req.params.meetingId, isDeleted: false });
  if (!meeting) return next(new AppError('Meeting not found', 404));
  meeting.recordLeave(req.user._id);
  await meeting.save();
  NoteActivity.log({ meetingId: meeting._id, organizationId: req.user.organizationId, actor: req.user._id, action: 'participant_left' });
  res.status(200).json({ status: 'success', data: { meeting } });
});

// ─────────────────────────────────────────────
//  ACTION ITEMS
// ─────────────────────────────────────────────

exports.addActionItem = catchAsync(async (req, res, next) => {
  const { title, description, assignedTo, dueDate, priority } = req.body;
  const meeting = await Meeting.findOneAndUpdate(
    { _id: req.params.meetingId, isDeleted: false, $or: [{ organizer: req.user._id }, { 'participants.user': req.user._id }] },
    { $push: { actionItems: { title, description, assignedTo, dueDate, priority: priority || 'medium', status: 'open' } } },
    { new: true }
  );
  if (!meeting) return next(new AppError('Meeting not found', 404));
  if (assignedTo) emitToUser(assignedTo, 'actionItemAssigned', { meetingId: meeting._id, title, dueDate });
  res.status(200).json({ status: 'success', data: { meeting } });
});

exports.convertActionItemToTask = catchAsync(async (req, res, next) => {
  const { meetingId, actionItemId } = req.params;
  const meeting = await Meeting.findOne({ _id: meetingId, isDeleted: false });
  if (!meeting) return next(new AppError('Meeting not found', 404));

  const noteData = meeting.getActionItemAsNote(actionItemId);
  const note = await Note.create({ ...noteData, organizationId: req.user.organizationId, owner: req.user._id, createdBy: req.user._id });

  const actionItem = meeting.actionItems.id(actionItemId);
  actionItem.noteId = note._id;
  await meeting.save();

  NoteActivity.log({ meetingId: meeting._id, noteId: note._id, organizationId: req.user.organizationId, actor: req.user._id, action: 'action_item_converted_to_task' });
  res.status(201).json({ status: 'success', data: { note } });
});

// ─────────────────────────────────────────────
//  PARTICIPANTS
// ─────────────────────────────────────────────

exports.addParticipants = catchAsync(async (req, res, next) => {
  const { users } = req.body;
  const meeting = await Meeting.findOne({ _id: req.params.meetingId, organizer: req.user._id, isDeleted: false });
  if (!meeting) return next(new AppError('Meeting not found', 404));
  users.forEach(u => meeting.addParticipant(u.user, u.role));
  await meeting.save();
  users.forEach(u => emitToUser(u.user, 'meetingInvitation', { meetingId: meeting._id, title: meeting.title, organizer: req.user.name, startTime: meeting.startTime }));
  res.status(200).json({ status: 'success', data: { meeting } });
});

exports.removeParticipant = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const meeting = await Meeting.findOne({ _id: req.params.meetingId, organizer: req.user._id, isDeleted: false });
  if (!meeting) return next(new AppError('Meeting not found', 404));
  meeting.participants = meeting.participants.filter(p => p.user?.toString() !== userId);
  await meeting.save();
  res.status(200).json({ status: 'success', data: { meeting } });
});

// ─────────────────────────────────────────────
//  POLLS
// ─────────────────────────────────────────────

exports.createPoll = catchAsync(async (req, res, next) => {
  const { question, options, isAnonymous } = req.body;
  const meeting = await Meeting.findOneAndUpdate(
    { _id: req.params.meetingId, isDeleted: false, $or: [{ organizer: req.user._id }, { 'participants.user': req.user._id }] },
    { $push: { polls: { question, options: options.map(o => ({ label: o, votes: [] })), isAnonymous: !!isAnonymous, createdBy: req.user._id } } },
    { new: true }
  );
  if (!meeting) return next(new AppError('Meeting not found', 404));
  res.status(201).json({ status: 'success', data: { polls: meeting.polls } });
});

exports.votePoll = catchAsync(async (req, res, next) => {
  const { meetingId, pollId } = req.params;
  const { optionIndex } = req.body;
  const meeting = await Meeting.findOne({ _id: meetingId, isDeleted: false, 'participants.user': req.user._id });
  if (!meeting) return next(new AppError('Meeting not found', 404));

  const poll = meeting.polls.id(pollId);
  if (!poll) return next(new AppError('Poll not found', 404));
  if (poll.closedAt && poll.closedAt < new Date()) return next(new AppError('Poll is closed', 400));

  const option = poll.options[optionIndex];
  if (!option) return next(new AppError('Invalid option index', 400));

  // Single-choice: remove existing vote across all options
  poll.options.forEach(o => { o.votes = o.votes.filter(v => v.toString() !== req.user._id.toString()); });
  option.votes.push(req.user._id);

  await meeting.save();
  NoteActivity.log({ meetingId: meeting._id, organizationId: req.user.organizationId, actor: req.user._id, action: 'poll_voted', meta: { pollId, optionIndex } });
  res.status(200).json({ status: 'success', data: { poll } });
});

// ─────────────────────────────────────────────
//  ANALYTICS
// ─────────────────────────────────────────────

exports.getMeetingAnalytics = catchAsync(async (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 30, 365);
  const cutoff = new Date(Date.now() - days * 86_400_000);

  const stats = await Meeting.aggregate([
    {
      $match: {
        organizationId: new mongoose.Types.ObjectId(req.user.organizationId),
        isDeleted: false,
        startTime: { $gte: cutoff },
        $or: [
          { organizer: new mongoose.Types.ObjectId(req.user._id) },
          { 'participants.user': new mongoose.Types.ObjectId(req.user._id) },
        ],
      },
    },
    {
      $facet: {
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        byType: [{ $group: { _id: '$locationType', count: { $sum: 1 } } }],
        avgDuration: [{ $project: { dur: { $divide: [{ $subtract: ['$endTime', '$startTime'] }, 60_000] } } }, { $group: { _id: null, avg: { $avg: '$dur' } } }],
        attendanceRate: [{ $project: { rate: '$analytics.attendanceRate' } }, { $group: { _id: null, avg: { $avg: '$rate' } } }],
      },
    },
  ]);

  res.status(200).json({ status: 'success', data: { period: `${days} days`, ...stats[0] } });
});



// // controllers/meetingController.js
// // ─────────────────────────────────────────────────────────────────────────────
// //  Meeting controller.
// //
// //  Key fix from original:
// //   BUG-1 — createMeeting was defined TWICE. The second definition (without
// //            session/transaction) silently overwrote the first (with session).
// //            Now there is exactly one createMeeting function.
// // ─────────────────────────────────────────────────────────────────────────────

// const mongoose = require('mongoose');
// const Meeting = require('./meetingModel');
// const Note = require('./noteModel');
// const User = require('../auth/core/user.model');
// const catchAsync = require('../../core/utils/api/catchAsync');
// const AppError = require('../../core/utils/api/appError');
// const { emitToUser } = require('../../socketHandlers/socket');
// const { NoteActivity } = require('./noteCommentModel');

// // ─────────────────────────────────────────────
// //  CREATE MEETING
// // ─────────────────────────────────────────────

// /**
//  * POST /api/meetings
//  *
//  * BUG-1 FIX — one definition only, with proper transaction for atomicity.
//  * Creates a Meeting + a linked meeting_note Note in a single transaction.
//  */
// exports.createMeeting = catchAsync(async (req, res, next) => {
//   const {
//     title, description, startTime, endTime, timezone,
//     locationType, physicalLocation, virtual,
//     participants, agendaItems, tags, category,
//     recurrence, isRecurring, reminders,
//     settings, bufferBefore, bufferAfter,
//     ...otherFields
//   } = req.body;

//   // ── Pre-flight: validate participants ─────────────────────────────────────
//   const participantIds = (participants || []).map(p => p.user).filter(Boolean);
//   if (participantIds.length) {
//     const validUsers = await User.find({
//       _id: { $in: participantIds },
//       organizationId: req.user.organizationId,
//       isActive: true,
//     }).select('_id').lean();

//     if (validUsers.length !== participantIds.length) {
//       return next(new AppError('One or more participants not found in your organisation', 400));
//     }
//   }

//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     // 1. Create the Meeting
//     const [meeting] = await Meeting.create([{
//       organizationId: req.user.organizationId,
//       organizer: req.user._id,
//       createdBy: req.user._id,
//       title,
//       description,
//       startTime: new Date(startTime),
//       endTime: new Date(endTime),
//       timezone: timezone || 'UTC',
//       locationType: locationType || 'virtual',
//       physicalLocation,
//       virtual,
//       participants: (participants || []).map(p => ({
//         user: p.user,
//         role: p.role || 'attendee',
//         invitationStatus: 'pending',
//         invitedAt: new Date(),
//       })),
//       agendaItems: (agendaItems || []).map((item, i) => ({ ...item, order: i + 1 })),
//       tags: tags || [],
//       category,
//       isRecurring: !!isRecurring,
//       recurrence: isRecurring ? recurrence : undefined,
//       reminders: reminders || [],
//       settings: settings || {},
//       bufferBefore: bufferBefore || 0,
//       bufferAfter: bufferAfter || 0,
//       ...otherFields,
//     }], { session });

//     // 2. Create the linked meeting_note Note (the "living document")
//     const [note] = await Note.create([{
//       organizationId: req.user.organizationId,
//       owner: req.user._id,
//       createdBy: req.user._id,
//       title: `📋 ${title}`,
//       content: (agendaItems || []).map((a, i) => `${i + 1}. ${a.title}`).join('\n') || description || '',
//       itemType: 'meeting_note',
//       status: 'open',
//       startDate: new Date(startTime),
//       dueDate: new Date(endTime),
//       meetingId: meeting._id,
//       visibility: 'team',
//       assignees: [
//         { user: req.user._id, assignedBy: req.user._id, role: 'owner', status: 'accepted', acceptedAt: new Date() },
//         ...(participantIds.map(uid => ({
//           user: uid, assignedBy: req.user._id, role: 'collaborator', status: 'pending',
//         }))),
//       ],
//       watchers: [req.user._id, ...participantIds],
//     }], { session });

//     // 3. Link Meeting → Note (bidirectional)
//     await Meeting.findByIdAndUpdate(meeting._id, { linkedNoteId: note._id }, { session });

//     await session.commitTransaction();

//     // 4. Notify participants (outside transaction — non-critical)
//     participantIds.forEach(uid => {
//       emitToUser(uid, 'meetingInvitation', {
//         type: 'MEETING_INVITATION',
//         meetingId: meeting._id,
//         title: meeting.title,
//         organizer: req.user.name,
//         startTime: meeting.startTime,
//         virtualLink: meeting.virtual?.link,
//       });
//     });

//     await NoteActivity.log({
//       meetingId: meeting._id, organizationId: req.user.organizationId,
//       actor: req.user._id, action: 'meeting_created',
//     }).catch(() => { });

//     res.status(201).json({ status: 'success', data: { meeting, note } });

//   } catch (error) {
//     await session.abortTransaction();
//     next(error);
//   } finally {
//     session.endSession();
//   }
// });

// // ─────────────────────────────────────────────
// //  GET MEETINGS
// // ─────────────────────────────────────────────

// exports.getUserMeetings = catchAsync(async (req, res) => {
//   const { status, startDate, endDate, limit = 50, page = 1 } = req.query;
//   const skip = (parseInt(page) - 1) * parseInt(limit);

//   const filter = {
//     organizationId: req.user.organizationId,
//     isDeleted: false,
//     $or: [{ organizer: req.user._id }, { 'participants.user': req.user._id }],
//   };

//   if (status) filter.status = status;
//   if (startDate) filter.startTime = { $gte: new Date(startDate) };
//   if (endDate) filter.endTime = { $lte: new Date(endDate) };

//   const [meetings, total] = await Promise.all([
//     Meeting.find(filter)
//       .sort({ startTime: 1 })
//       .skip(skip).limit(parseInt(limit))
//       .populate('organizer', 'name email avatar')
//       .populate('participants.user', 'name email avatar')
//       .lean(),
//     Meeting.countDocuments(filter),
//   ]);

//   res.status(200).json({
//     status: 'success',
//     data: { meetings, pagination: { total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } },
//   });
// });

// exports.getMeetingById = catchAsync(async (req, res, next) => {
//   const meeting = await Meeting.findOne({
//     _id: req.params.meetingId,
//     organizationId: req.user.organizationId,
//     isDeleted: false,
//     $or: [{ organizer: req.user._id }, { 'participants.user': req.user._id }],
//   })
//     .populate('organizer', 'name email avatar')
//     .populate('participants.user', 'name email avatar')
//     .populate('actionItems.assignedTo', 'name email avatar')
//     .populate('agendaItems.presenter', 'name email')
//     .populate('linkedNoteId', 'title content updatedAt');

//   if (!meeting) return next(new AppError('Meeting not found', 404));

//   res.status(200).json({ status: 'success', data: { meeting } });
// });

// // ─────────────────────────────────────────────
// //  UPDATE MEETING
// // ─────────────────────────────────────────────

// exports.updateMeeting = catchAsync(async (req, res, next) => {
//   const meeting = await Meeting.findOne({
//     _id: req.params.meetingId,
//     organizationId: req.user.organizationId,
//     isDeleted: false,
//     $or: [
//       { organizer: req.user._id },
//       { 'participants': { $elemMatch: { user: req.user._id, role: { $in: ['organizer', 'presenter'] } } } },
//     ],
//   });

//   if (!meeting) return next(new AppError('Meeting not found or insufficient permissions', 404));

//   const { status, minutes, actionItems, agendaItems, participants, ...rest } = req.body;

//   if (status) meeting.status = status;
//   if (minutes) meeting.minutes = minutes;
//   if (actionItems) meeting.actionItems = actionItems;
//   if (agendaItems) meeting.agendaItems = agendaItems;
//   Object.assign(meeting, rest);
//   meeting.updatedBy = req.user._id;

//   await meeting.save();

//   // Sync minutes to the linked Note
//   if (minutes && meeting.linkedNoteId) {
//     await Note.findByIdAndUpdate(meeting.linkedNoteId, {
//       content: minutes,
//       summary: minutes.length > 200 ? minutes.substring(0, 200) + '…' : minutes,
//     });
//   }

//   // Notify participants of changes
//   if (status === 'cancelled') {
//     meeting.participants.forEach(p => {
//       if (p.user) emitToUser(p.user, 'meetingCancelled', { meetingId: meeting._id, title: meeting.title });
//     });
//   }

//   res.status(200).json({ status: 'success', data: { meeting } });
// });

// exports.cancelMeeting = catchAsync(async (req, res, next) => {
//   const { reason } = req.body;
//   const meeting = await Meeting.findOneAndUpdate(
//     { _id: req.params.meetingId, organizer: req.user._id, isDeleted: false },
//     { status: 'cancelled', cancelReason: reason, updatedBy: req.user._id },
//     { new: true }
//   );
//   if (!meeting) return next(new AppError('Meeting not found', 404));

//   meeting.participants.forEach(p => {
//     if (p.user) emitToUser(p.user, 'meetingCancelled', { meetingId: meeting._id, title: meeting.title, reason });
//   });

//   res.status(200).json({ status: 'success', data: { meeting } });
// });

// // ─────────────────────────────────────────────
// //  RSVP
// // ─────────────────────────────────────────────

// exports.meetingRSVP = catchAsync(async (req, res, next) => {
//   const { response } = req.body; // 'accepted' | 'declined' | 'tentative'
//   const VALID = ['accepted', 'declined', 'tentative'];
//   if (!VALID.includes(response)) return next(new AppError(`Response must be one of: ${VALID.join(', ')}`, 400));

//   const meeting = await Meeting.findOne({
//     _id: req.params.meetingId,
//     'participants.user': req.user._id,
//     isDeleted: false,
//   });

//   if (!meeting) return next(new AppError('Meeting not found or you are not invited', 404));

//   const participant = meeting.participants.find(p => p.user?.toString() === req.user._id.toString());
//   if (participant) {
//     participant.invitationStatus = response;
//     participant.respondedAt = new Date();
//   }

//   await meeting.save();

//   emitToUser(meeting.organizer, 'meetingRSVP', {
//     meetingId: meeting._id,
//     userId: req.user._id,
//     userName: req.user.name,
//     response,
//   });

//   res.status(200).json({ status: 'success', message: `You have ${response} the meeting` });
// });

// // ─────────────────────────────────────────────
// //  ATTENDANCE
// // ─────────────────────────────────────────────

// exports.joinMeeting = catchAsync(async (req, res, next) => {
//   const meeting = await Meeting.findOne({
//     _id: req.params.meetingId,
//     isDeleted: false,
//     $or: [{ organizer: req.user._id }, { 'participants.user': req.user._id }],
//   });

//   if (!meeting) return next(new AppError('Meeting not found', 404));

//   meeting.recordJoin(req.user._id);
//   if (meeting.status === 'scheduled') meeting.status = 'in_progress';
//   await meeting.save();

//   res.status(200).json({ status: 'success', data: { meeting } });
// });

// exports.leaveMeeting = catchAsync(async (req, res, next) => {
//   const meeting = await Meeting.findOne({ _id: req.params.meetingId, isDeleted: false });
//   if (!meeting) return next(new AppError('Meeting not found', 404));

//   meeting.recordLeave(req.user._id);
//   await meeting.save();

//   res.status(200).json({ status: 'success', data: { meeting } });
// });

// // ─────────────────────────────────────────────
// //  ACTION ITEMS
// // ─────────────────────────────────────────────

// exports.addActionItem = catchAsync(async (req, res, next) => {
//   const { title, description, assignedTo, dueDate, priority } = req.body;

//   const meeting = await Meeting.findOneAndUpdate(
//     {
//       _id: req.params.meetingId, isDeleted: false,
//       $or: [{ organizer: req.user._id }, { 'participants.user': req.user._id }]
//     },
//     { $push: { actionItems: { title, description, assignedTo, dueDate, priority: priority || 'medium', status: 'open' } } },
//     { new: true }
//   );

//   if (!meeting) return next(new AppError('Meeting not found', 404));

//   if (assignedTo) {
//     emitToUser(assignedTo, 'actionItemAssigned', { meetingId: meeting._id, title, dueDate });
//   }

//   res.status(200).json({ status: 'success', data: { meeting } });
// });

// exports.convertActionItemToTask = catchAsync(async (req, res, next) => {
//   const { meetingId, actionItemId } = req.params;

//   const meeting = await Meeting.findOne({ _id: meetingId, isDeleted: false });
//   if (!meeting) return next(new AppError('Meeting not found', 404));

//   const noteData = meeting.getActionItemAsNote(actionItemId);
//   const note = await Note.create({
//     ...noteData,
//     organizationId: req.user.organizationId,
//     owner: req.user._id,
//     createdBy: req.user._id,
//   });

//   // Link action item → note
//   const actionItem = meeting.actionItems.id(actionItemId);
//   actionItem.noteId = note._id;
//   await meeting.save();

//   res.status(201).json({ status: 'success', data: { note } });
// });

// // ─────────────────────────────────────────────
// //  POLLS
// // ─────────────────────────────────────────────

// exports.createPoll = catchAsync(async (req, res, next) => {
//   const { question, options, isAnonymous } = req.body;

//   const meeting = await Meeting.findOneAndUpdate(
//     {
//       _id: req.params.meetingId, isDeleted: false,
//       $or: [{ organizer: req.user._id }, { 'participants.user': req.user._id }]
//     },
//     { $push: { polls: { question, options: options.map(o => ({ label: o, votes: [] })), isAnonymous: !!isAnonymous, createdBy: req.user._id } } },
//     { new: true }
//   );

//   if (!meeting) return next(new AppError('Meeting not found', 404));
//   res.status(201).json({ status: 'success', data: { polls: meeting.polls } });
// });

// exports.votePoll = catchAsync(async (req, res, next) => {
//   const { meetingId, pollId } = req.params;
//   const { optionIndex } = req.body;

//   const meeting = await Meeting.findOne({
//     _id: meetingId, isDeleted: false, 'participants.user': req.user._id,
//   });

//   if (!meeting) return next(new AppError('Meeting not found', 404));

//   const poll = meeting.polls.id(pollId);
//   if (!poll) return next(new AppError('Poll not found', 404));
//   if (poll.closedAt && poll.closedAt < new Date()) return next(new AppError('Poll is closed', 400));

//   const option = poll.options[optionIndex];
//   if (!option) return next(new AppError('Invalid option index', 400));

//   // Remove any existing vote from this user across all options (single-choice)
//   poll.options.forEach(o => {
//     o.votes = o.votes.filter(v => v.toString() !== req.user._id.toString());
//   });
//   option.votes.push(req.user._id);

//   await meeting.save();
//   res.status(200).json({ status: 'success', data: { poll } });
// });

// // ─────────────────────────────────────────────
// //  PARTICIPANTS
// // ─────────────────────────────────────────────

// exports.addParticipants = catchAsync(async (req, res, next) => {
//   const { users } = req.body;

//   const meeting = await Meeting.findOne({ _id: req.params.meetingId, organizer: req.user._id, isDeleted: false });
//   if (!meeting) return next(new AppError('Meeting not found', 404));

//   users.forEach(u => meeting.addParticipant(u.user, u.role));
//   await meeting.save();

//   users.forEach(u => {
//     emitToUser(u.user, 'meetingInvitation', {
//       meetingId: meeting._id, title: meeting.title, organizer: req.user.name, startTime: meeting.startTime,
//     });
//   });

//   res.status(200).json({ status: 'success', data: { meeting } });
// });

// exports.removeParticipant = catchAsync(async (req, res, next) => {
//   const { userId } = req.params;
//   const meeting = await Meeting.findOne({ _id: req.params.meetingId, organizer: req.user._id, isDeleted: false });
//   if (!meeting) return next(new AppError('Meeting not found', 404));

//   meeting.participants = meeting.participants.filter(p => p.user?.toString() !== userId);
//   await meeting.save();

//   res.status(200).json({ status: 'success', data: { meeting } });
// });

// // ─────────────────────────────────────────────
// //  ANALYTICS
// // ─────────────────────────────────────────────

// exports.getMeetingAnalytics = catchAsync(async (req, res) => {
//   const { days = 30 } = req.query;
//   const cutoff = new Date(Date.now() - parseInt(days) * 86_400_000);

//   const stats = await Meeting.aggregate([
//     {
//       $match: {
//         organizationId: new mongoose.Types.ObjectId(req.user.organizationId),
//         isDeleted: false,
//         startTime: { $gte: cutoff },
//         $or: [
//           { organizer: new mongoose.Types.ObjectId(req.user._id) },
//           { 'participants.user': new mongoose.Types.ObjectId(req.user._id) },
//         ],
//       },
//     },
//     {
//       $facet: {
//         byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
//         byType: [{ $group: { _id: '$locationType', count: { $sum: 1 } } }],
//         avgDuration: [
//           { $project: { duration: { $divide: [{ $subtract: ['$endTime', '$startTime'] }, 60_000] } } },
//           { $group: { _id: null, avg: { $avg: '$duration' } } },
//         ],
//         attendanceRate: [
//           { $project: { rate: '$analytics.attendanceRate' } },
//           { $group: { _id: null, avg: { $avg: '$rate' } } },
//         ],
//       },
//     },
//   ]);

//   res.status(200).json({ status: 'success', data: { period: `${days} days`, ...stats[0] } });
// });