const cron = require('node-cron');
const { createClient } = require('redis');
const { checkAndSendLowStockAlerts } = require('../services/inventoryAlertService');

const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.connect().catch(console.error);

const SCHEDULE = process.env.INVENTORY_ALERT_CRON || '0 10 * * *';

cron.schedule(SCHEDULE, async () => {
  const LOCK_KEY = 'lock:cron:inventory_alert';
  
  try {
    const acquired = await redisClient.set(LOCK_KEY, 'locked', { NX: true, EX: 600 });
    if (!acquired) return console.log('[Inventory Cron] Skipped (Locked).');

    console.log('[Inventory Cron] Starting check...');
    await checkAndSendLowStockAlerts();
    console.log('[Inventory Cron] Done.');
  } catch (err) {
    console.error('❌ Inventory alert failed:', err.message);
  }
});
// // src/jobs/inventoryAlertCronJob.js
// const cron = require('node-cron');
// const { checkAndSendLowStockAlerts } = require('../services/inventoryAlertService');

// const SCHEDULE = process.env.INVENTORY_ALERT_CRON || '0 10 * * *'; // every day 10 AM

// console.log('⏰ Inventory Alert Cron initialized.');

// cron.schedule(SCHEDULE, async () => {
//   console.log('📦 Running daily inventory alert check...');
//   try {
//     await checkAndSendLowStockAlerts();
//   } catch (err) {
//     console.error('❌ Inventory alert cron job failed:', err.message);
//   }
// });
