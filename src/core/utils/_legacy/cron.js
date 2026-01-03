// src/utils/cron.js
console.log("🕒 Initializing scheduled cron jobs...");

require("../../jobs/_legacy/emiCronJob"); // Handles EMI overdue checks
require("../../jobs/_legacy/notificationCronJob"); // Sends system / email notifications
require("../../jobs/_legacy/inventoryAlertCronJob"); // Low stock alert emails

// --- New reminder jobs ---
require("../../jobs/_legacy/paymentReminderCronJob"); // Sends reminders before due date
require("../../jobs/_legacy/overdueReminderCronJob"); // Sends overdue notices after due date
require('./emiReminderCron');
require('./announcementCron');


console.log("✅ All cron jobs initialized successfully!");
