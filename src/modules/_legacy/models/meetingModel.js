const mongoose = require('mongoose');
const { Schema } = mongoose;

const meetingSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  organizer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: String,
  agenda: String,
  minutes: String,
  meetingNotes: { type: Schema.Types.ObjectId, ref: 'Note' },
  startTime: { type: Date, required: true, index: true },
  endTime: { type: Date, required: true, index: true },
  timezone: { type: String, default: 'UTC' },
  locationType: { type: String, enum: ['physical', 'virtual', 'hybrid'], default: 'virtual' },
  physicalLocation: String,
  virtualLink: String,
  meetingId: String,
  meetingPassword: String,
  isRecurring: { type: Boolean, default: false },
  recurrencePattern: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly', 'custom'] },
  recurrenceEndDate: Date,
  recurrenceDays: [Number],
  recurrenceInterval: Number,
  participants: [{
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['organizer', 'presenter', 'attendee', 'guest'], default: 'attendee' },
    invitationStatus: { type: String, enum: ['pending', 'accepted', 'declined', 'tentative'], default: 'pending' },
    responseAt: Date,
    attended: { type: Boolean, default: false },
    joinedAt: Date,
    leftAt: Date,
    duration: Number
  }],


  status: { type: String, enum: ['scheduled', 'in-progress', 'completed', 'cancelled', 'postponed'], default: 'scheduled', index: true },
  attachments: [{
    url: String, fileName: String, fileType: String, uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' }, uploadedAt: { type: Date, default: Date.now }
  }],


  actionItems: [{
    description: String, assignedTo: { type: Schema.Types.ObjectId, ref: 'User' }, dueDate: Date, status: { type: String, enum: ['pending', 'in-progress', 'completed', 'blocked'], default: 'pending' }, completedAt: Date
  }],


  recordingEnabled: { type: Boolean, default: false },
  recordingUrl: String,
  chatEnabled: { type: Boolean, default: true },
  waitingRoom: { type: Boolean, default: false },
  autoRecording: { type: Boolean, default: false },


  reminders: [{
    type: String, enum: ['email', 'push', 'sms'], timeBefore: Number // minutes before meeting
  }],


  attendanceRate: Number,
  averageAttendanceDuration: Number,


  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtuals
meetingSchema.virtual('duration').get(function () {
  if (!this.startTime || !this.endTime) return 0;
  return (this.endTime - this.startTime) / (1000 * 60); // in minutes
});

meetingSchema.virtual('isUpcoming').get(function () {
  return this.startTime > new Date();
});

meetingSchema.virtual('isPast').get(function () {
  return this.endTime < new Date();
});

meetingSchema.virtual('isInProgress').get(function () {
  const now = new Date();
  return this.startTime <= now && this.endTime >= now;
});

// Indexes
meetingSchema.index({ organizationId: 1, startTime: 1, status: 1 });
meetingSchema.index({ organizer: 1, startTime: -1 });
meetingSchema.index({ 'participants.user': 1, startTime: -1 });
meetingSchema.index({ title: 'text', description: 'text', agenda: 'text' });

module.exports = mongoose.model('Meeting', meetingSchema);
