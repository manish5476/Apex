const mongoose = require('mongoose');
const { Schema } = mongoose;

const noteSchema = new Schema({
  organizationId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Organization', 
    required: true, 
    index: true 
  },
  owner: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true 
  },
  
  // FIXED: Added missing reference used in controllers
  meetingId: {
    type: Schema.Types.ObjectId,
    ref: 'Meeting',
    index: true
  },

  // Core Note Information
  title: { 
    type: String, 
    trim: true, 
    required: [true, 'Note title is required'] 
  },
  content: { 
    type: String, 
    required: [true, 'Content is required'] 
  },
  summary: { type: String, trim: true },
  
  // Note Types
  noteType: {
    type: String,
    enum: ['note', 'task', 'meeting', 'idea', 'journal', 'project'],
    default: 'note',
    index: true
  },
  
  // Status & Priority
  status: {
    type: String,
    enum: ['draft', 'active', 'completed', 'archived', 'deferred'],
    default: 'active',
    index: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
    index: true
  },
  
  // Time Management
  startDate: { type: Date, index: true },
  dueDate: { type: Date, index: true },
  completedAt: Date,
  duration: Number, // in minutes
  
  // Categorization
  category: { type: String, index: true },
  tags: [{ 
    type: String, 
    lowercase: true, 
    trim: true, 
    index: true 
  }],
  
  // Meetings Specific Fields
  isMeeting: { type: Boolean, default: false },
  meetingDetails: {
    agenda: String,
    minutes: String,
    location: String,
    meetingType: {
      type: String,
      enum: ['in-person', 'virtual', 'hybrid']
    },
    videoLink: String,
    recurrence: {
      type: String,
      enum: ['none', 'daily', 'weekly', 'monthly', 'yearly']
    },
    recurrenceEndDate: Date
  },
  
  // Participants
  participants: [{
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['organizer', 'attendee', 'contributor', 'viewer'] },
    rsvp: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'tentative']
    }
  }],
  
  // Attachments
  attachments: [{
    url: String,
    publicId: String,
    fileType: String,
    fileName: String,
    size: Number,
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // References
  relatedNotes: [{ type: Schema.Types.ObjectId, ref: 'Note' }],
  projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
  
  // Visibility
  visibility: {
    type: String,
    enum: ['private', 'team', 'department', 'organization'],
    default: 'private',
    index: true
  },
  sharedWith: [{ 
    type: Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  allowedDepartments: [{ 
    type: Schema.Types.ObjectId, 
    ref: 'Department' 
  }],
  
  // Metadata
  isPinned: { type: Boolean, default: false, index: true },
  isTemplate: { type: Boolean, default: false },
  templateId: { type: Schema.Types.ObjectId, ref: 'Note' },
  
  // Progress & Activity
  progress: { type: Number, min: 0, max: 100, default: 0 },
  subtasks: [{
    title: String,
    completed: { type: Boolean, default: false },
    completedAt: Date
  }],
  activityLog: [{
    action: String,
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now }
  }],
  lastAccessed: { type: Date, default: Date.now },
  accessCount: { type: Number, default: 0 },
  
  // Soft Delete
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: Date,
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// RESTORED: Virtuals
noteSchema.virtual('isOverdue').get(function() {
  if (!this.dueDate || this.status === 'completed') return false;
  return this.dueDate < new Date();
});

noteSchema.virtual('timeRemaining').get(function() {
  if (!this.dueDate || this.status === 'completed') return null;
  return Math.max(0, this.dueDate - new Date());
});

noteSchema.virtual('formattedDate').get(function() {
  return this.startDate ? this.startDate.toISOString().split('T')[0] : null;
});

// Indexes
noteSchema.index({ organizationId: 1, owner: 1, noteType: 1, status: 1 });
noteSchema.index({ organizationId: 1, dueDate: 1, priority: 1 });
noteSchema.index({ organizationId: 1, isMeeting: 1, startDate: 1 });
noteSchema.index({ 'participants.user': 1 });
noteSchema.index({ createdAt: -1 });
noteSchema.index({ updatedAt: -1 });
noteSchema.index({ 
  title: "text", 
  content: "text", 
  "meetingDetails.agenda": "text" 
}, {
  weights: {
    title: 10,
    "meetingDetails.agenda": 6,
    content: 2
  },
  name: "NotesTextSearch"
});

// RESTORED: Pre-save middleware
noteSchema.pre('save', function(next) {
  if (this.isMeeting && !this.startDate) {
    this.startDate = new Date();
  }
  
  if (this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  
  if (this.isModified('content') && this.content.length > 200) {
    this.summary = this.content.substring(0, 200) + '...';
  }
  
  next();
});

// RESTORED: Static methods
noteSchema.statics.getHeatMapData = async function(userId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        owner: mongoose.Types.ObjectId(userId),
        createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) },
        isDeleted: false
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        },
        count: { $sum: 1 },
        notes: { $push: '$$ROOT._id' }
      }
    },
    {
      $project: {
        _id: 0,
        date: {
          $dateFromParts: {
            year: '$_id.year',
            month: '$_id.month',
            day: '$_id.day'
          }
        },
        count: 1,
        notes: 1
      }
    },
    { $sort: { date: 1 } }
  ]);
};

// RESTORED: Instance methods
noteSchema.methods.addParticipant = function(userId, role = 'attendee') {
  if (!this.participants.some(p => p.user.toString() === userId.toString())) {
    this.participants.push({
      user: userId,
      role: role,
      rsvp: 'pending'
    });
  }
};

noteSchema.methods.logActivity = function(action, userId) {
  this.activityLog.push({
    action,
    user: userId,
    timestamp: new Date()
  });
  this.lastAccessed = new Date();
  this.accessCount += 1;
};

module.exports = mongoose.model('Note', noteSchema);

// const mongoose = require('mongoose');
// const { Schema } = mongoose;

// const noteSchema = new Schema({
//   organizationId: { 
//     type: Schema.Types.ObjectId, 
//     ref: 'Organization', 
//     required: true, 
//     index: true 
//   },
//   owner: { 
//     type: Schema.Types.ObjectId, 
//     ref: 'User', 
//     required: true, 
//     index: true 
//   },
  
//   // FIXED: Added missing reference used in controllers
//   meetingId: {
//     type: Schema.Types.ObjectId,
//     ref: 'Meeting',
//     index: true
//   },

//   // Core Note Information
//   title: { 
//     type: String, 
//     trim: true, 
//     required: [true, 'Note title is required'] 
//   },
//   content: { 
//     type: String, 
//     required: [true, 'Content is required'] 
//   },
//   summary: { type: String, trim: true },
  
//   // Note Types
//   noteType: {
//     type: String,
//     enum: ['note', 'task', 'meeting', 'idea', 'journal', 'project'],
//     default: 'note',
//     index: true
//   },
  
//   // Status & Priority
//   status: {
//     type: String,
//     enum: ['draft', 'active', 'completed', 'archived', 'deferred'],
//     default: 'active',
//     index: true
//   },
//   priority: {
//     type: String,
//     enum: ['low', 'medium', 'high', 'urgent'],
//     default: 'medium',
//     index: true
//   },
  
//   // Time Management
//   startDate: { type: Date, index: true },
//   dueDate: { type: Date, index: true },
//   completedAt: Date,
//   duration: Number, // in minutes
  
//   // Categorization
//   category: { type: String, index: true },
//   tags: [{ 
//     type: String, 
//     lowercase: true, 
//     trim: true, 
//     index: true 
//   }],
  
//   // Meetings Specific Fields
//   isMeeting: { type: Boolean, default: false },
//   meetingDetails: {
//     agenda: String,
//     minutes: String,
//     location: String,
//     meetingType: {
//       type: String,
//       enum: ['in-person', 'virtual', 'hybrid']
//     },
//     videoLink: String,
//     recurrence: {
//       type: String,
//       enum: ['none', 'daily', 'weekly', 'monthly', 'yearly']
//     },
//     recurrenceEndDate: Date
//   },
  
//   // Participants
//   participants: [{
//     user: { type: Schema.Types.ObjectId, ref: 'User' },
//     role: { type: String, enum: ['organizer', 'attendee', 'contributor', 'viewer'] },
//     rsvp: {
//       type: String,
//       enum: ['pending', 'accepted', 'declined', 'tentative']
//     }
//   }],
  
//   // Attachments
//   attachments: [{
//     url: String,
//     publicId: String,
//     fileType: String,
//     fileName: String,
//     size: Number,
//     uploadedAt: { type: Date, default: Date.now }
//   }],
  
//   // References
//   relatedNotes: [{ type: Schema.Types.ObjectId, ref: 'Note' }],
//   projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
  
//   // Visibility
//   visibility: {
//     type: String,
//     enum: ['private', 'team', 'department', 'organization'],
//     default: 'private',
//     index: true
//   },
//   sharedWith: [{ 
//     type: Schema.Types.ObjectId, 
//     ref: 'User' 
//   }],
//   allowedDepartments: [{ 
//     type: Schema.Types.ObjectId, 
//     ref: 'Department' 
//   }],
  
//   // Metadata
//   isPinned: { type: Boolean, default: false, index: true },
//   isTemplate: { type: Boolean, default: false },
//   templateId: { type: Schema.Types.ObjectId, ref: 'Note' },
  
//   // Progress & Activity
//   progress: { type: Number, min: 0, max: 100, default: 0 },
//   subtasks: [{
//     title: String,
//     completed: { type: Boolean, default: false },
//     completedAt: Date
//   }],
//   activityLog: [{
//     action: String,
//     user: { type: Schema.Types.ObjectId, ref: 'User' },
//     timestamp: { type: Date, default: Date.now }
//   }],
//   lastAccessed: { type: Date, default: Date.now },
//   accessCount: { type: Number, default: 0 },
  
//   // Soft Delete
//   isDeleted: { type: Boolean, default: false, index: true },
//   deletedAt: Date,
//   deletedBy: { type: Schema.Types.ObjectId, ref: 'User' }
// }, { 
//   timestamps: true,
//   toJSON: { virtuals: true },
//   toObject: { virtuals: true }
// });

// // Indexes
// noteSchema.index({ organizationId: 1, owner: 1, noteType: 1, status: 1 });
// noteSchema.index({ title: "text", content: "text", "meetingDetails.agenda": "text" });

// module.exports = mongoose.model('Note', noteSchema);


// // const mongoose = require('mongoose');
// // const { Schema } = mongoose;

// // const noteSchema = new Schema({
// //   organizationId: { 
// //     type: Schema.Types.ObjectId, 
// //     ref: 'Organization', 
// //     required: true, 
// //     index: true 
// //   },
// //   owner: { 
// //     type: Schema.Types.ObjectId, 
// //     ref: 'User', 
// //     required: true, 
// //     index: true 
// //   },
  
// //   // Core Note Information
// //   title: { 
// //     type: String, 
// //     trim: true, 
// //     required: [true, 'Note title is required'] 
// //   },
// //   content: { 
// //     type: String, 
// //     required: [true, 'Content is required'] 
// //   },
// //   summary: { type: String, trim: true }, // Auto-generated or manual summary
  
// //   // Note Types
// //   noteType: {
// //     type: String,
// //     enum: ['note', 'task', 'meeting', 'idea', 'journal', 'project'],
// //     default: 'note',
// //     index: true
// //   },
  
// //   // Status & Priority
// //   status: {
// //     type: String,
// //     enum: ['draft', 'active', 'completed', 'archived', 'deferred'],
// //     default: 'active',
// //     index: true
// //   },
// //   priority: {
// //     type: String,
// //     enum: ['low', 'medium', 'high', 'urgent'],
// //     default: 'medium',
// //     index: true
// //   },
  
// //   // Time Management
// //   startDate: { type: Date, index: true },
// //   dueDate: { type: Date, index: true },
// //   completedAt: Date,
// //   duration: Number, // in minutes
  
// //   // Categorization
// //   category: { type: String, index: true },
// //   tags: [{ 
// //     type: String, 
// //     lowercase: true, 
// //     trim: true, 
// //     index: true 
// //   }],
  
// //   // Meetings Specific Fields
// //   isMeeting: { type: Boolean, default: false },
// //   meetingDetails: {
// //     agenda: String,
// //     minutes: String,
// //     location: String,
// //     meetingType: {
// //       type: String,
// //       enum: ['in-person', 'virtual', 'hybrid']
// //     },
// //     videoLink: String,
// //     recurrence: {
// //       type: String,
// //       enum: ['none', 'daily', 'weekly', 'monthly', 'yearly']
// //     },
// //     recurrenceEndDate: Date
// //   },
  
// //   // Participants & Collaboration
// //   participants: [{
// //     user: { type: Schema.Types.ObjectId, ref: 'User' },
// //     role: { type: String, enum: ['organizer', 'attendee', 'contributor', 'viewer'] },
// //     rsvp: {
// //       type: String,
// //       enum: ['pending', 'accepted', 'declined', 'tentative']
// //     }
// //   }],
  
// //   // Attachments
// //   attachments: [{
// //     url: String,
// //     publicId: String,
// //     fileType: String,
// //     fileName: String,
// //     size: Number,
// //     uploadedAt: { type: Date, default: Date.now }
// //   }],
  
// //   // References & Links
// //   relatedNotes: [{ type: Schema.Types.ObjectId, ref: 'Note' }],
// //   projectId: { type: Schema.Types.ObjectId, ref: 'Project' },
  
// //   // Visibility & Access Control
// //   visibility: {
// //     type: String,
// //     enum: ['private', 'team', 'department', 'organization'],
// //     default: 'private',
// //     index: true
// //   },
// //   sharedWith: [{ 
// //     type: Schema.Types.ObjectId, 
// //     ref: 'User' 
// //   }],
// //   allowedDepartments: [{ 
// //     type: Schema.Types.ObjectId, 
// //     ref: 'Department' 
// //   }],
  
// //   // Metadata
// //   isPinned: { type: Boolean, default: false, index: true },
// //   isTemplate: { type: Boolean, default: false },
// //   templateId: { type: Schema.Types.ObjectId, ref: 'Note' },
  
// //   // Progress Tracking
// //   progress: { type: Number, min: 0, max: 100, default: 0 },
// //   subtasks: [{
// //     title: String,
// //     completed: { type: Boolean, default: false },
// //     completedAt: Date
// //   }],
  
// //   // Heat Map & Activity Tracking
// //   activityLog: [{
// //     action: String,
// //     user: { type: Schema.Types.ObjectId, ref: 'User' },
// //     timestamp: { type: Date, default: Date.now }
// //   }],
// //   lastAccessed: { type: Date, default: Date.now },
// //   accessCount: { type: Number, default: 0 },
  
// //   // Soft Delete
// //   isDeleted: { type: Boolean, default: false, index: true },
// //   deletedAt: Date,
// //   deletedBy: { type: Schema.Types.ObjectId, ref: 'User' }
// // }, { 
// //   timestamps: true,
// //   toJSON: { virtuals: true },
// //   toObject: { virtuals: true }
// // });

// // // Virtuals
// // noteSchema.virtual('isOverdue').get(function() {
// //   if (!this.dueDate || this.status === 'completed') return false;
// //   return this.dueDate < new Date();
// // });

// // noteSchema.virtual('timeRemaining').get(function() {
// //   if (!this.dueDate || this.status === 'completed') return null;
// //   return Math.max(0, this.dueDate - new Date());
// // });

// // noteSchema.virtual('formattedDate').get(function() {
// //   return this.startDate ? this.startDate.toISOString().split('T')[0] : null;
// // });

// // // Indexes
// // noteSchema.index({ organizationId: 1, owner: 1, noteType: 1, status: 1 });
// // noteSchema.index({ organizationId: 1, dueDate: 1, priority: 1 });
// // noteSchema.index({ organizationId: 1, isMeeting: 1, startDate: 1 });
// // noteSchema.index({ 'participants.user': 1 });
// // noteSchema.index({ createdAt: -1 });
// // noteSchema.index({ updatedAt: -1 });

// // // Pre-save middleware
// // noteSchema.pre('save', function(next) {
// //   if (this.isMeeting && !this.startDate) {
// //     this.startDate = new Date();
// //   }
  
// //   if (this.status === 'completed' && !this.completedAt) {
// //     this.completedAt = new Date();
// //   }
  
// //   if (this.isModified('content') && this.content.length > 200) {
// //     this.summary = this.content.substring(0, 200) + '...';
// //   }
  
// //   next();
// // });

// // // Static methods
// // noteSchema.statics.getHeatMapData = async function(userId, startDate, endDate) {
// //   return this.aggregate([
// //     {
// //       $match: {
// //         owner: mongoose.Types.ObjectId(userId),
// //         createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) },
// //         isDeleted: false
// //       }
// //     },
// //     {
// //       $group: {
// //         _id: {
// //           year: { $year: '$createdAt' },
// //           month: { $month: '$createdAt' },
// //           day: { $dayOfMonth: '$createdAt' }
// //         },
// //         count: { $sum: 1 },
// //         notes: { $push: '$$ROOT._id' }
// //       }
// //     },
// //     {
// //       $project: {
// //         _id: 0,
// //         date: {
// //           $dateFromParts: {
// //             year: '$_id.year',
// //             month: '$_id.month',
// //             day: '$_id.day'
// //           }
// //         },
// //         count: 1,
// //         notes: 1
// //       }
// //     },
// //     { $sort: { date: 1 } }
// //   ]);
// // };

// // // Instance methods
// // noteSchema.methods.addParticipant = function(userId, role = 'attendee') {
// //   if (!this.participants.some(p => p.user.toString() === userId.toString())) {
// //     this.participants.push({
// //       user: userId,
// //       role: role,
// //       rsvp: 'pending'
// //     });
// //   }
// // };

// // noteSchema.methods.logActivity = function(action, userId) {
// //   this.activityLog.push({
// //     action,
// //     user: userId,
// //     timestamp: new Date()
// //   });
// //   this.lastAccessed = new Date();
// //   this.accessCount += 1;
// // };

// // noteSchema.index(
// //   {
// //     title: "text",
// //     content: "text",
// //     "meetingDetails.agenda": "text"
// //   },
// //   {
// //     weights: {
// //       title: 10,
// //       "meetingDetails.agenda": 6,
// //       content: 2
// //     },
// //     name: "NotesTextSearch"
// //   }
// // );


// // module.exports = mongoose.model('Note', noteSchema);
