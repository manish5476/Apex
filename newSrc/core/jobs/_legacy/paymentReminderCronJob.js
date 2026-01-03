// src/jobs/paymentReminderCronJob.js
const cron = require("node-cron");
const { runPaymentReminderJob } = require("../services/paymentReminderService");

// Run daily at 9:00 AM server time
cron.schedule("0 9 * * *", async () => {
  console.log("⏰ Running daily payment reminder job...");
  try {
    await runPaymentReminderJob();
    console.log("✅ Payment reminder job completed.");
  } catch (err) {
    console.error("❌ Payment reminder job failed:", err.message);
  }
});
