// src/models/masterModel.js
const mongoose = require("mongoose");

const masterSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    type: {
      type: String,
      required: [true, "Master type is required (e.g., category, brand, etc.)"],
      trim: true,
      lowercase: true,
    },

    name: {
      type: String,
      required: [true, "Master name is required"],
      trim: true,
    },

    code: {
      type: String,
      trim: true,
      uppercase: true,
    },

    description: {
      type: String,
      trim: true,
    },

    // ✅ Image URL (S3, Cloudinary, CDN, etc.)
    imageUrl: {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !v || /^(https?:\/\/)/i.test(v);
        },
        message: "Image URL must be a valid HTTP/HTTPS URL",
      },
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

// Prevent duplicate masters per organization + type + name
masterSchema.index({ organizationId: 1, type: 1, name: 1 }, { unique: true });

const Master = mongoose.model("Master", masterSchema);
module.exports = Master;


// // src/models/masterModel.js
// const mongoose = require("mongoose");

// const masterSchema = new mongoose.Schema(
//   {
//     organizationId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Organization",
//       required: true,
//       index: true,
//     },
//     type: {
//       type: String,
//       required: [true, "Master type is required (e.g., category, brand, etc.)"],
//       trim: true,
//       lowercase: true,
//     },
//     name: {
//       type: String,
//       required: [true, "Master name is required"],
//       trim: true,
//     },
//     code: {
//       type: String,
//       trim: true,
//       uppercase: true,
//     },
//     description: {
//       type: String,
//       trim: true,
//     },
//     isActive: {
//       type: Boolean,
//       default: true,
//     },
//     createdBy: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//     },
//   },
//   { timestamps: true }
// );

// masterSchema.index({ organizationId: 1, type: 1, name: 1 }, { unique: true });
// const Master = mongoose.model("Master", masterSchema);
// module.exports = Master;
