import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMasterType extends Document {
  name: string;
  label: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const masterTypeSchema = new Schema<IMasterType>(
  {
    name: {
      type: String,
      required: [true, 'Master type name is required'],
      trim: true,
      lowercase: true,
      unique: true,
    },
    label: {
      type: String,
      required: [true, 'Master type label is required'],
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export const MasterType: Model<IMasterType> = mongoose.model<IMasterType>(
  'MasterType',
  masterTypeSchema
);