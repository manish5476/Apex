import multer, { FileFilterCallback } from 'multer';
import { Request, RequestHandler } from 'express';
import { ApiError } from '../../errors/ApiError';

const multerStorage = multer.memoryStorage();

const multerFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(ApiError.badRequest('Not an image! Please upload only images.') as unknown as Error);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

export const uploadSingleImage: RequestHandler = upload.single('image');