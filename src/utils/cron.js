/**
 * CRON JOB AGGREGATOR
 * Requires all individual job files to register them with node-cron.
 */

console.log('[Cron Manager] Loading background jobs...');

// 1. EMI Checks
require('../jobs/emiCronJob');

// 2. Inventory Alerts (Low stock)
require('../jobs/inventoryAlertCronJob');

// 3. Notifications (General)
require('../jobs/notificationCronJob');

// 4. Overdue Reminders (Invoices)
require('../jobs/overdueReminderCronJob');

// 5. Payment Reminders
require('../jobs/paymentReminderCronJob');

console.log('[Cron Manager] All jobs registered.');
// // src/utils/cron.js
// console.log("🕒 Initializing scheduled cron jobs...");

// require("../jobs/emiCronJob"); // Handles EMI overdue checks
// require("../jobs/notificationCronJob"); // Sends system / email notifications
// require("../jobs/inventoryAlertCronJob"); // Low stock alert emails

// // --- New reminder jobs ---
// require("../jobs/paymentReminderCronJob"); // Sends reminders before due date
// require("../jobs/overdueReminderCronJob"); // Sends overdue notices after due date

// console.log("✅ All cron jobs initialized successfully!");
