const cron = require('node-cron');
const mongoose = require('mongoose');
const { createClient } = require('redis');
const emiService = require('../services/emiService');

// Create a dedicated Redis client for locking (separate from Socket.IO)
const redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.connect().catch(console.error);

cron.schedule('0 0 * * *', async () => {
  const LOCK_KEY = 'lock:cron:emi_daily';
  
  try {
    if (mongoose.connection.readyState !== 1) return;

    // 🔒 Acquire Lock: Set key only if not exists (NX), expire in 10 mins (EX 600)
    const acquired = await redisClient.set(LOCK_KEY, 'locked', { NX: true, EX: 600 });
    
    if (!acquired) {
      console.log('[EMI Cron] Skipped - handled by another instance.');
      return;
    }

    console.log('[EMI Cron] 🔒 Lock acquired. Starting job...');
    await emiService.markOverdueInstallments();
    console.log('[EMI Cron] Completed.');

  } catch (err) {
    console.error('[EMI Cron] Error:', err.message);
  }
});
// const cron = require('node-cron');
// const mongoose = require('mongoose');
// const emiService = require('../services/emiService');

// // Run every day at midnight (00:00)
// cron.schedule('0 0 * * *', async () => {
//   const now = new Date().toISOString();

//   // 🛡️ Safety: Don't run if DB is disconnected
//   if (mongoose.connection.readyState !== 1) {
//     console.error(`[EMI Cron] Skipped at ${now} - Database not connected.`);
//     return;
//   }

//   try {
//     console.log(`[EMI Cron] Starting daily overdue check at ${now}...`);
//     await emiService.markOverdueInstallments();
//     console.log('[EMI Cron] Completed successfully.');
//   } catch (err) {
//     console.error('[EMI Cron] Error:', err.message);
//   }
// });
// // const cron = require('node-cron');
// // const emiService = require('../services/emiService');

// // // Run every day at midnight
// // // Cron format: second minute hour day month day-of-week
// // // "0 0 * * *" → 00:00 every day
// // cron.schedule('0 0 * * *', async () => {
// //   try {
// //     console.log('[EMI Cron] Starting daily overdue check...');
// //     await emiService.markOverdueInstallments();
// //     console.log('[EMI Cron] Completed daily overdue check.');
// //   } catch (err) {
// //     console.error('[EMI Cron] Error during overdue check:', err.message);
// //   }
// // });
