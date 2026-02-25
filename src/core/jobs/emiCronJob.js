const cron = require('node-cron');
const emiService = require('../../modules/accounting/payments/emiService');

// Run every day at midnight
// Cron format: second minute hour day month day-of-week
// "0 0 * * *" → 00:00 every day
cron.schedule('0 0 * * *', async () => {
  try {
    console.log('[EMI Cron] Starting daily overdue check...');
    await emiService.markOverdueInstallments();
    console.log('[EMI Cron] Completed daily overdue check.');
  } catch (err) {
    console.error('[EMI Cron] Error during overdue check:', err.message);
  }
});
