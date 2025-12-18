const cron = require('node-cron');
const mongoose = require('mongoose');
const emiService = require('../services/emiService');

// Run every day at midnight (00:00)
cron.schedule('0 0 * * *', async () => {
  const now = new Date().toISOString();

  // 🛡️ Safety: Don't run if DB is disconnected
  if (mongoose.connection.readyState !== 1) {
    console.error(`[EMI Cron] Skipped at ${now} - Database not connected.`);
    return;
  }

  try {
    console.log(`[EMI Cron] Starting daily overdue check at ${now}...`);
    await emiService.markOverdueInstallments();
    console.log('[EMI Cron] Completed successfully.');
  } catch (err) {
    console.error('[EMI Cron] Error:', err.message);
  }
});
// const cron = require('node-cron');
// const emiService = require('../services/emiService');

// // Run every day at midnight
// // Cron format: second minute hour day month day-of-week
// // "0 0 * * *" → 00:00 every day
// cron.schedule('0 0 * * *', async () => {
//   try {
//     console.log('[EMI Cron] Starting daily overdue check...');
//     await emiService.markOverdueInstallments();
//     console.log('[EMI Cron] Completed daily overdue check.');
//   } catch (err) {
//     console.error('[EMI Cron] Error during overdue check:', err.message);
//   }
// });
