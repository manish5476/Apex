const mongoose = require("mongoose");

const masterTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Master type name is required"],
      trim: true,
      lowercase: true,
      unique: true,
    },
    label: {
      type: String,
      required: [true, "Master type label is required"],
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    }
  },
  { timestamps: true }
);

const MasterType = mongoose.model("MasterType", masterTypeSchema);
module.exports = MasterType;
