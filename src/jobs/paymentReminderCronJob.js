const cron = require("node-cron");
const { createClient } = require('redis');
const { runPaymentReminderJob } = require("../services/paymentReminderService");

const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.connect().catch(console.error);

// Daily at 9:00 AM
cron.schedule("0 9 * * *", async () => {
  const LOCK_KEY = 'lock:cron:payment_reminders';

  try {
    const acquired = await redisClient.set(LOCK_KEY, 'locked', { NX: true, EX: 600 });
    if (!acquired) return console.log("[Payment Cron] Skipped (Locked).");

    console.log("⏰ Running daily payment reminder job...");
    await runPaymentReminderJob();
    console.log("✅ Payment reminder job completed.");
  } catch (err) {
    console.error("❌ Payment reminder job failed:", err.message);
  }
});
// // src/jobs/paymentReminderCronJob.js
// const cron = require("node-cron");
// const { runPaymentReminderJob } = require("../services/paymentReminderService");

// // Run daily at 9:00 AM server time
// cron.schedule("0 9 * * *", async () => {
//   console.log("⏰ Running daily payment reminder job...");
//   try {
//     await runPaymentReminderJob();
//     console.log("✅ Payment reminder job completed.");
//   } catch (err) {
//     console.error("❌ Payment reminder job failed:", err.message);
//   }
// });
