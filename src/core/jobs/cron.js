// src/core/utils/_legacy/cron.js
console.log("🕒 Initializing scheduled cron jobs...");

// Load legacy cron jobs
require("./emiCronJob.js"); // Handles EMI overdue checks
require("./notificationCronJob.js"); // Sends system / email notifications
require("./inventoryAlertCronJob.js"); // Low stock alert emails

// Reminder jobs
require("./paymentReminderCronJob.js"); // Sends reminders before due date
require("./overdueReminderCronJob.js"); // Sends overdue notices after due date
require('./emiReminderCron.js');
require('./announcementCron.js');

// --- NEW: Load Payment Cron Manager ---
try {
  
  const { PaymentCronManager } = require("../../modules/accounting/payments/paymentAllocation.cron.js");

  console.log("🔄 Starting Payment Cron Manager...");
  PaymentCronManager.scheduleAllJobs();
  global.PaymentCronManager = PaymentCronManager;

  console.log("✅ Payment Cron Manager initialized successfully!");
} catch (error) {
  console.error("⚠️ Payment Cron Manager initialization failed:", error.message);
  console.log("⚠️ Falling back to legacy cron jobs only");
}

console.log("✅ All cron jobs initialized successfully!");







// //src\core\utils\_legacy\cron.js
// console.log("🕒 Initializing scheduled cron jobs...");

// require("../../jobs/_legacy/emiCronJob"); // Handles EMI overdue checks
// require("../../jobs/_legacy/notificationCronJob"); // Sends system / email notifications
// require("../../jobs/_legacy/inventoryAlertCronJob"); // Low stock alert emails

// // --- New reminder jobs ---
// require("../../jobs/_legacy/paymentReminderCronJob"); // Sends reminders before due date
// require("../../jobs/_legacy/overdueReminderCronJob"); // Sends overdue notices after due date
// require('./emiReminderCron');
// require('./announcementCron');


// console.log("✅ All cron jobs initialized successfully!");
