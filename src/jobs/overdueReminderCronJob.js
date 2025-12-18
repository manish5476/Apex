const cron = require("node-cron");
const { createClient } = require('redis');
const { runOverdueReminderJob } = require("../services/overdueReminderService");

const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.connect().catch(console.error);

// Daily at 9:30 AM
cron.schedule("30 9 * * *", async () => {
  const LOCK_KEY = 'lock:cron:overdue_reminders';

  try {
    const acquired = await redisClient.set(LOCK_KEY, 'locked', { NX: true, EX: 600 });
    if (!acquired) return console.log("[Overdue Cron] Skipped (Locked).");

    console.log("🔔 Running daily overdue reminder job...");
    await runOverdueReminderJob();
    console.log("✅ Overdue reminder job completed.");
  } catch (err) {
    console.error("❌ Overdue reminder job failed:", err.message);
  }
});
// // src/jobs/overdueReminderCronJob.js
// const cron = require("node-cron");
// const { runOverdueReminderJob } = require("../services/overdueReminderService");

// // Run daily at 9:30 AM
// cron.schedule("30 9 * * *", async () => {
//   console.log("🔔 Running daily overdue reminder job...");
//   try {
//     await runOverdueReminderJob();
//     console.log("✅ Overdue reminder job completed.");
//   } catch (err) {
//     console.error("❌ Overdue reminder job failed:", err.message);
//   }
// });
