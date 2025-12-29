const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  body: { type: String, trim: true },

  // 👇 FIX: Handle the 'type' field correctly
  attachments: [{
    name: String,
    url: String,
    type: { type: String }, // ✅ CORRECT: Wraps the reserved keyword
    size: Number,
    publicId: String
  }],

  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  deleted: { type: Boolean, default: false },
  editedAt: { type: Date }
  
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);

// const mongoose = require('mongoose');

// const messageSchema = new mongoose.Schema({
//   organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
//   channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true, index: true },
//   senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
//   body: { type: String, trim: true },

//   // 👇 Mongoose compiles this ONCE on server start.
//   // If this was [String] before, you MUST restart the server to make it [{ object }]
//   attachments: [{
//     name: String,
//     url: String,
//     type: String,
//     size: Number,
//     publicId: String
//   }],

//   readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
//   deleted: { type: Boolean, default: false },
//   editedAt: { type: Date }
  
// }, { timestamps: true });

// module.exports = mongoose.model('Message', messageSchema);
// // // src/models/messageModel.js
// // const mongoose = require('mongoose');

// // const messageSchema = new mongoose.Schema({
// //   organizationId: {
// //     type: mongoose.Schema.Types.ObjectId,
// //     ref: 'Organization',
// //     required: true,
// //     index: true,
// //   },

// //   channelId: {
// //     type: mongoose.Schema.Types.ObjectId,
// //     ref: 'Channel',
// //     required: true,
// //     index: true,
// //   },

// //   senderId: {
// //     type: mongoose.Schema.Types.ObjectId,
// //     ref: 'User',
// //     required: true,
// //   },

// //   body: {
// //     type: String,
// //     trim: true,
// //   },

// //   attachments: [{
// //     name: String,
// //     url: String,
// //     type: String,
// //     size: Number,
// //     publicId: String
// //   }],

// //   // attachments: [{
// //   //   url: String,
// //   //   type: String,
// //   // }],

// //   // readBy: [{
// //   //   type: mongoose.Schema.Types.ObjectId,
// //   //   ref: 'User',
// //   // }]
// //   readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
// //   deleted: { type: Boolean, default: false },
// //   editedAt: { type: Date }
  
// // }, { timestamps: true });

// // module.exports = mongoose.model('Message', messageSchema);
