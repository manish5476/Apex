// src/jobs/notificationCronJob.js
const cron = require("node-cron");
const notificationService = require("../../../modules/notification/core/notification.service");

// Schedule: run daily at 08:00 server time
cron.schedule("0 8 * * *", async () => {
  console.log("[Cron] Notification job starting...");
  try {
    await notificationService.sendOverdueInvoiceAlerts();
    await notificationService.sendLowStockAlerts(10);
    await notificationService.sendEmiOverdueAlerts();
    console.log("[Cron] Notification job completed.");
  } catch (err) {
    console.error("[Cron] Notification job error:", err.message);
  }
});
