const mongoose = require('mongoose');

const storefrontFormSubmissionSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },
    formType: {
      type: String,
      enum: ['newsletter', 'contact'],
      required: true
    },
    visitorName: {
      type: String,
      trim: true
    },
    visitorEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    visitorPhone: {
      type: String,
      trim: true
    },
    message: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: ['new', 'read', 'replied'],
      default: 'new'
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },
  {
    timestamps: true
  }
);

const StorefrontFormSubmission = mongoose.model('StorefrontFormSubmission', storefrontFormSubmissionSchema);

module.exports = StorefrontFormSubmission;
