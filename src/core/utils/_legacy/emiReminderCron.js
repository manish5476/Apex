const cron = require('node-cron');
const EMI = require('../../../modules/accounting/payments/emi.model');

cron.schedule('0 9 * * *', async () => {
  const today = new Date();
  today.setHours(0,0,0,0);

  const emis = await EMI.find({
    status: 'active',
    installments: {
      $elemMatch: {
        paymentStatus: { $in: ['pending', 'overdue'] },
        dueDate: { $lte: today }
      }
    }
  }).populate('customerId', 'name phone email');

  for (const emi of emis) {
    const dueInst = emi.installments.find(
      i =>
        i.paymentStatus !== 'paid' &&
        i.dueDate.toDateString() === today.toDateString()
    );

    if (!dueInst) continue;

    console.log(
      `📢 EMI Reminder → ${emi.customerId.name} | Installment #${dueInst.installmentNumber}`
    );

    // 🔔 Plug SMS / Email / WhatsApp here
  }
});
