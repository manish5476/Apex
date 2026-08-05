import rateLimit from 'express-rate-limit';

export const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Allow only 3 attempts
  message: {
    status: 'fail',
    message: 'Too many password reset attempts. Try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});