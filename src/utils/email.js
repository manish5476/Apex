// src/utils/email.js
const nodemailer = require("nodemailer");
const AppError = require("./appError");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_SECURE === "true", // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

/**
 * sendEmail({ email, subject, message, html, attachments })
 */
module.exports = async ({
  email,
  subject,
  message,
  html,
  attachments = [],
}) => {
  if (!email) throw new AppError("No recipient email provided", 400);

  const mailOptions = {
    from: process.env.EMAIL_FROM || `"No Reply" <${process.env.EMAIL_USER}>`,
    to: email,
    subject,
    text: message,
    html,
    attachments,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email] Sent to ${email}: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error("[Email] send error", err);
    throw new AppError("Failed to send email", 500);
  }
};
