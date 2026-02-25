// src/jobs/inventoryAlertCronJob.js
const cron = require('node-cron');
const { checkAndSendLowStockAlerts } = require('../../modules/inventory/core/inventoryAlert.service');

const SCHEDULE = process.env.INVENTORY_ALERT_CRON || '0 10 * * *'; // every day 10 AM

console.log('⏰ Inventory Alert Cron initialized.');

cron.schedule(SCHEDULE, async () => {
  console.log('📦 Running daily inventory alert check...');
  try {
    await checkAndSendLowStockAlerts();
  } catch (err) {
    console.error('❌ Inventory alert cron job failed:', err.message);
  }
});
