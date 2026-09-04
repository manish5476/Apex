import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { nanoid } from 'nanoid';

export interface IMasterRecordMetadata {
  isFeatured: boolean;
  sortOrder: number;
}

export interface IMasterRecord extends Document {
  organizationId: Types.ObjectId;
  type: string;
  name: string;
  slug: string;
  code?: string;
  description?: string;
  imageUrl?: string;
  parentId: Types.ObjectId | null;
  isActive: boolean;
  metadata: IMasterRecordMetadata;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/** URL-friendly slug helper — kept exactly as your original implementation. */
function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

const masterRecordSchema = new Schema<IMasterRecord>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    type: { type: String, required: true, trim: true, lowercase: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, lowercase: true, trim: true, index: true },
    code: { type: String, trim: true, uppercase: true },
    description: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Master', default: null },
    isActive: { type: Boolean, default: true },
    metadata: {
      isFeatured: { type: Boolean, default: false },
      sortOrder: { type: Number, default: 0 },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Auto-generate slug before saving — only fires via .save(), matches original.
masterRecordSchema.pre('save', function (this: IMasterRecord, next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = `${slugify(this.name)}-${nanoid(6)}`;
  }
  next();
});

masterRecordSchema.index({ organizationId: 1, type: 1, name: 1 }, { unique: true });
masterRecordSchema.index({ organizationId: 1, type: 1, slug: 1 }, { unique: true });

// ⚠️ Registered model name stays "Master" (NOT "MasterRecord") — other modules
// already reference `ref: "Master"` against this exact collection. Only the
// TS symbol/file name changed to match your masterRecord/ folder.
export const MasterRecord: Model<IMasterRecord> = mongoose.model<IMasterRecord>(
  'Master',
  masterRecordSchema
);