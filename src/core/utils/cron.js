// src/utils/cron.js
console.log("🕒 Initializing scheduled cron jobs...");

require("../jobs/emiCronJob"); // Handles EMI overdue checks
require("../jobs/notificationCronJob"); // Sends system / email notifications
require("../jobs/inventoryAlertCronJob"); // Low stock alert emails

// --- New reminder jobs ---
require("../jobs/paymentReminderCronJob"); // Sends reminders before due date
require("../jobs/overdueReminderCronJob"); // Sends overdue notices after due date
require('../utils/emiReminderCron');
require('../utils/announcementCron');


console.log("✅ All cron jobs initialized successfully!");
