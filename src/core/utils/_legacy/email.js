const nodemailer = require("nodemailer");
const AppError = require("../appError");

// 1. Debug: Check if Env Vars are loaded
if (!process.env.EMAIL_HOST || !process.env.EMAIL_USERNAME) {
  console.warn("⚠️ EMAIL WARNING: Missing EMAIL_HOST or EMAIL_USERNAME in .env file. Emails will fail.");
}

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_SECURE === "true", // true for 465, false for 587
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD,
  },
  // 2. Add connection timeout settings
  connectionTimeout: 10000, 
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

// 3. Verify connection on startup (Optional but recommended for debugging)
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Email Connection Failed:", error.message);
  } else {
    console.log("✅ Email Server Ready");
  }
});

module.exports = async ({ email, subject, message, html, attachments = [] }) => {
  if (!email) throw new AppError("No recipient email provided", 400);

  const mailOptions = {
    from: process.env.EMAIL_FROM || `"Apex App" <${process.env.EMAIL_USERNAME}>`,
    to: email,
    subject,
    text: message,
    html,
    attachments,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Email Sent to ${email} | ID: ${info.messageId}`);
     
    // ADD THIS LINE: It gives you a clickable link in your terminal to see the email
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`🔗 Preview URL: ${previewUrl}`);
    }
    return info;
  } catch (err) {
    console.error(`💥 Email Error [To: ${email}]:`, err.message);
    // Don't crash the app, but throw so the controller knows it failed
    throw new Error(`Email failed: ${err.message}`);
  }
};