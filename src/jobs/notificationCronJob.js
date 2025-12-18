const cron = require("node-cron");
const { createClient } = require('redis');
const notificationService = require("../services/notificationService");

const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.connect().catch(console.error);

// Daily at 08:00
cron.schedule("0 8 * * *", async () => {
  const LOCK_KEY = 'lock:cron:notifications_daily';

  try {
    const acquired = await redisClient.set(LOCK_KEY, 'locked', { NX: true, EX: 1800 }); // 30 mins lock
    if (!acquired) return console.log("[Notify Cron] Skipped (Locked).");

    console.log("[Notify Cron] Starting...");
    await notificationService.sendOverdueInvoiceAlerts();
    await notificationService.sendLowStockAlerts(10);
    await notificationService.sendEmiOverdueAlerts();
    console.log("[Notify Cron] Completed.");
  } catch (err) {
    console.error("[Notify Cron] Error:", err.message);
  }
});
// // src/jobs/notificationCronJob.js
// const cron = require("node-cron");
// const notificationService = require("../services/notificationService");

// // Schedule: run daily at 08:00 server time
// cron.schedule("0 8 * * *", async () => {
//   console.log("[Cron] Notification job starting...");
//   try {
//     await notificationService.sendOverdueInvoiceAlerts();
//     await notificationService.sendLowStockAlerts(10);
//     await notificationService.sendEmiOverdueAlerts();
//     console.log("[Cron] Notification job completed.");
//   } catch (err) {
//     console.error("[Cron] Notification job error:", err.message);
//   }
// });
