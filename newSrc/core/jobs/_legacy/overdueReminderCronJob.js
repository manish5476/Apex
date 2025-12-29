// src/jobs/overdueReminderCronJob.js
const cron = require("node-cron");
const { runOverdueReminderJob } = require("../services/overdueReminderService");

// Run daily at 9:30 AM
cron.schedule("30 9 * * *", async () => {
  console.log("🔔 Running daily overdue reminder job...");
  try {
    await runOverdueReminderJob();
    console.log("✅ Overdue reminder job completed.");
  } catch (err) {
    console.error("❌ Overdue reminder job failed:", err.message);
  }
});
