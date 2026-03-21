// cron/paymentCronManager.js
const cron = require('node-cron');
const mongoose = require('mongoose');
const Payment = require('../../modules/accounting/payments/payment.model');
const EMI = require('../../modules/accounting/payments/emi.model');
const Invoice = require('../../modules/accounting/billing/invoice.model');
const Customer = require('../../modules/organization/core/customer.model');
const AccountEntry = require('../../modules/accounting/core/accountEntry.model');

// Import your existing services
const emiService = require('../../modules/_legacy/services/emiService');

class PaymentCronManager {
  // Store active cron jobs
  static jobs = new Map();
  
  /**
   * 1. PAYMENT ALLOCATION JOB (Every 30 minutes)
   * Auto-allocates unallocated payments to invoices/EMIs
   * THIS IS THE CRITICAL JOB YOU NEEDED!
   */
  static async runPaymentAllocationJob() {
    console.log('🔄 [PAYMENT CRON] Starting payment allocation...');
    
    try {
      // Get unallocated payments older than 1 hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const unallocatedPayments = await Payment.find({
        allocationStatus: { $in: ['unallocated', 'partially_allocated'] },
        type: 'inflow',
        status: 'completed',
        paymentDate: { $lte: oneHourAgo },
        customerId: { $ne: null },
        $or: [
          { remainingAmount: { $gt: 0 } },
          { remainingAmount: { $exists: false } }
        ]
      })
      .populate('customerId')
      .limit(50);

      console.log(`📊 Found ${unallocatedPayments.length} payments to allocate`);

      let successCount = 0;
      let failCount = 0;

      for (const payment of unallocatedPayments) {
        try {
          // Allocate to the customer's invoices/EMIs
          await this.allocatePaymentToCustomer(payment);
          successCount++;
          console.log(`✅ Allocated payment ${payment._id}: ₹${payment.amount}`);
        } catch (error) {
          failCount++;
          console.error(`❌ Failed to allocate payment ${payment._id}:`, error.message);
          
          // Mark for manual review after 3 failures
          if (!payment.failedAllocationAttempts) {
            payment.failedAllocationAttempts = 1;
          } else {
            payment.failedAllocationAttempts += 1;
          }
          
          if (payment.failedAllocationAttempts >= 3) {
            payment.allocationStatus = 'requires_manual_review';
          }
          
          await payment.save();
        }
      }

      console.log(`🎯 Allocation completed: ${successCount} succeeded, ${failCount} failed`);
    } catch (error) {
      console.error('❌ Payment allocation job failed:', error.message);
    }
  }

  /**
   * Core allocation logic
   */
  static async allocatePaymentToCustomer(payment) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      let remainingAmount = payment.amount;
      const allocations = [];
      
      // 1. Find all unpaid invoices for this customer
      const invoices = await Invoice.find({
        organizationId: payment.organizationId,
        customerId: payment.customerId,
        balanceAmount: { $gt: 0 },
        status: { $in: ['issued', 'partially_paid'] }
      }).sort({ dueDate: 1 }).session(session);

      // 2. Allocate to invoices
      for (const invoice of invoices) {
        if (remainingAmount <= 0) break;

        // Check if invoice has EMI
        const emi = await EMI.findOne({
          organizationId: payment.organizationId,
          invoiceId: invoice._id,
          status: 'active'
        }).session(session);

        if (emi) {
          // Allocate to EMI installments
          const allocated = await this.allocateToEMI(
            emi, 
            Math.min(invoice.balanceAmount, remainingAmount), 
            payment._id, 
            session
          );
          
          allocations.push({
            type: 'emi',
            invoiceId: invoice._id,
            emiId: emi._id,
            amount: allocated
          });
          
          remainingAmount -= allocated;
          invoice.balanceAmount -= allocated;
          invoice.paidAmount += allocated;
        } else {
          // Direct invoice payment
          const toAllocate = Math.min(invoice.balanceAmount, remainingAmount);
          allocations.push({
            type: 'invoice',
            invoiceId: invoice._id,
            amount: toAllocate
          });
          
          remainingAmount -= toAllocate;
          invoice.balanceAmount -= toAllocate;
          invoice.paidAmount += toAllocate;
        }

        // Update invoice status
        if (invoice.balanceAmount <= 0) {
          invoice.status = 'paid';
        } else if (invoice.paidAmount > 0) {
          invoice.status = 'partially_paid';
        }

        await invoice.save({ session });
      }

      // 3. If still has remaining amount, store as advance
      if (remainingAmount > 0) {
        const customer = await Customer.findById(payment.customerId).session(session);
        customer.advanceBalance = (customer.advanceBalance || 0) + remainingAmount;
        await customer.save({ session });
        
        allocations.push({
          type: 'advance',
          amount: remainingAmount
        });
      }

      // 4. Update payment allocation status
      payment.allocatedTo = allocations;
      payment.allocationStatus = 'fully_allocated';
      payment.remainingAmount = 0;
      await payment.save({ session });

      await session.commitTransaction();
      return true;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Allocate payment to specific EMI installments
   */
  static async allocateToEMI(emi, amount, paymentId, session) {
    let remaining = amount;
    let totalAllocated = 0;

    // Sort installments by due date (oldest first)
    emi.installments.sort((a, b) => a.dueDate - b.dueDate);

    for (const installment of emi.installments) {
      if (remaining <= 0) break;
      
      if (installment.paymentStatus !== 'paid') {
        const dueAmount = installment.totalAmount - installment.paidAmount;
        const toAllocate = Math.min(dueAmount, remaining);
        
        installment.paidAmount += toAllocate;
        remaining -= toAllocate;
        totalAllocated += toAllocate;
        
        // Update status
        if (installment.paidAmount >= installment.totalAmount) {
          installment.paymentStatus = 'paid';
          installment.paymentId = paymentId;
        } else if (installment.paidAmount > 0) {
          installment.paymentStatus = 'partial';
        }
      }
    }

    // Update EMI overall status
    if (emi.installments.every(i => i.paymentStatus === 'paid')) {
      emi.status = 'completed';
    }

    await emi.save({ session });
    return totalAllocated;
  }

  /**
   * 2. CUSTOMER BALANCE RECALCULATION (Every 6 hours)
   * Ensures customer balances match actual invoices
   */
  static async recalculateCustomerBalances() {
    console.log('⚖️ [PAYMENT CRON] Recalculating customer balances...');
    
    try {
      const customers = await Customer.find({})
        .select('_id organizationId outstandingBalance')
        .lean();

      let updatedCount = 0;

      for (const customer of customers) {
        // Get all outstanding invoices for this customer
        const invoices = await Invoice.find({
          organizationId: customer.organizationId,
          customerId: customer._id,
          status: { $in: ['issued', 'partially_paid'] }
        });

        const totalOutstanding = invoices.reduce(
          (sum, inv) => sum + (inv.balanceAmount || 0), 0
        );

        // Update if different (more than ₹1 difference)
        if (Math.abs((customer.outstandingBalance || 0) - totalOutstanding) > 1) {
          await Customer.findByIdAndUpdate(customer._id, {
            outstandingBalance: totalOutstanding,
            lastBalanceRecalculation: new Date()
          });
          updatedCount++;
          
          if (Math.abs((customer.outstandingBalance || 0) - totalOutstanding) > 1000) {
            console.log(`📈 Customer ${customer._id} balance changed significantly`);
          }
        }
      }

      console.log(`✅ Balances recalculated: ${updatedCount} customers updated`);
    } catch (error) {
      console.error('❌ Balance recalculation failed:', error.message);
    }
  }

  /**
   * 3. ACCOUNTING INTEGRITY CHECK (Daily at 2:00 AM)
   */
  static async runAccountingIntegrityCheck() {
    console.log('🕵️ [PAYMENT CRON] Running accounting integrity check...');
    
    try {
      const stats = await AccountEntry.aggregate([
        { 
          $group: {
            _id: "$organizationId",
            totalDebit: { $sum: "$debit" },
            totalCredit: { $sum: "$credit" }
          }
        }
      ]);

      for (const org of stats) {
        const diff = Math.abs(org.totalDebit - org.totalCredit);
        
        if (diff > 0.01) {
          console.error(`🚨 CRITICAL: Organization ${org._id} is OUT OF BALANCE!`);
          console.error(`   Debit: ${org.totalDebit}, Credit: ${org.totalCredit}, Diff: ${diff}`);
          // TODO: Send alert to admin
        }
      }
      
      console.log('✅ Accounting integrity check completed');
    } catch (error) {
      console.error('❌ Accounting integrity check failed:', error.message);
    }
  }

  /**
   * 4. CLEANUP OLD DATA (Daily at 3:00 AM)
   */
  static async cleanupOldData() {
    console.log('🧹 [PAYMENT CRON] Cleaning up old data...');
    
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Cleanup old pending reconciliations
      const recResult = await mongoose.connection.db.collection('pendingreconciliations').deleteMany({
        status: 'pending',
        createdAt: { $lt: thirtyDaysAgo }
      });

      // Cleanup payments marked for manual review older than 7 days
      const paymentResult = await Payment.deleteMany({
        allocationStatus: 'requires_manual_review',
        updatedAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      });

      console.log(`🗑️ Cleaned up: ${recResult.deletedCount} reconciliations, ${paymentResult.deletedCount} payments`);
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
    }
  }

  /**
   * Schedule only NEW payment cron jobs
   * Don't duplicate existing ones!
   */
  static schedulePaymentJobs() {
    console.log('⏰ [PAYMENT CRON] Scheduling NEW payment cron jobs...');

    // 1. Payment Allocation (Every 30 minutes) - NEW!
    this.jobs.set('payment-allocation', cron.schedule('*/30 * * * *', () => {
      this.runPaymentAllocationJob();
    }));

    // 2. Customer Balance Recalculation (Every 6 hours) - NEW!
    this.jobs.set('customer-balances', cron.schedule('0 */6 * * *', () => {
      this.recalculateCustomerBalances();
    }));

    // 3. Accounting Integrity Check (Daily 2:00 AM) - You might already have this
    this.jobs.set('accounting-integrity', cron.schedule('0 2 * * *', () => {
      this.runAccountingIntegrityCheck();
    }));

    // 4. Cleanup Old Data (Daily 3:00 AM) - NEW!
    this.jobs.set('data-cleanup', cron.schedule('0 3 * * *', () => {
      this.cleanupOldData();
    }));

    console.log(`✅ [PAYMENT CRON] ${this.jobs.size} NEW jobs scheduled`);
    console.log('⚠️ Note: Existing cron jobs (reminders, EMI overdue) continue running separately');
  }

  /**
   * Stop all NEW payment cron jobs
   */
  static stopAllJobs() {
    this.jobs.forEach((job, name) => {
      job.stop();
      console.log(`⏹️ Stopped job: ${name}`);
    });
    this.jobs.clear();
  }

  /**
   * Get job status
   */
  static getJobStatus() {
    const status = {};
    this.jobs.forEach((job, name) => {
      status[name] = {
        running: job.task ? job.task.isRunning() : false,
        schedule: job.options ? job.options.rule : 'Unknown'
      };
    });
    return status;
  }

  /**
   * Manual trigger for testing
   */
  static async runJobManually(jobName) {
    console.log(`🔧 [MANUAL] Running job: ${jobName}`);
    
    switch (jobName) {
      case 'allocation':
        await this.runPaymentAllocationJob();
        break;
      case 'balances':
        await this.recalculateCustomerBalances();
        break;
      case 'integrity':
        await this.runAccountingIntegrityCheck();
        break;
      case 'cleanup':
        await this.cleanupOldData();
        break;
      case 'all':
        await this.runPaymentAllocationJob();
        await this.recalculateCustomerBalances();
        await this.runAccountingIntegrityCheck();
        await this.cleanupOldData();
        break;
      default:
        throw new Error(`Unknown job: ${jobName}`);
    }
    
    console.log(`✅ [MANUAL] Job ${jobName} completed`);
    return { success: true, job: jobName };
  }
}

module.exports = PaymentCronManager;
// // cron/paymentCronManager.js
// const cron = require('node-cron');
// const { runPaymentReminderJob } = require('../../../modules/notification/core/paymentReminder.service');
// const { runOverdueReminderJob } = require('../../../modules/notification/core/overdueReminder.service');
// const notificationService = require('../../modules//core/notification.service');
// const emiService = require('../../../modules/_legacy/services/emiService');
// const paymentAllocationService = require('./paymentAllocation.service');
// const mongoose = require('mongoose');
// const AccountEntry = require('../../../modules/accounting/core/accountEntry.model');
// // const cron = require('node-cron');
// const paymentAllocationService = require('./paymentAllocation.service');
// const Payment = require('.payment.model');

// class PaymentCronManager {
  
//   /**
//    * 1. PAYMENT ALLOCATION JOB (Every 30 minutes)
//    * Auto-allocates unallocated payments to invoices/EMIs
//    */
//   static async runPaymentAllocationJob() {
//     console.log('🔄 [PAYMENT CRON] Starting payment allocation...');
    
//     try {
//       // Get unallocated payments older than 1 hour
//       const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
//       const unallocatedPayments = await mongoose.model('Payment').find({
//         allocationStatus: { $in: ['unallocated', 'partially_allocated'] },
//         type: 'inflow',
//         status: 'completed',
//         paymentDate: { $lte: oneHourAgo },
//         customerId: { $ne: null }
//       }).limit(50);

//       console.log(`📊 Found ${unallocatedPayments.length} payments to allocate`);

//       for (const payment of unallocatedPayments) {
//         try {
//           // Check if payment already has allocation service
//           if (paymentAllocationService && typeof paymentAllocationService.autoAllocatePayment === 'function') {
//             await paymentAllocationService.autoAllocatePayment(payment._id, payment.organizationId);
//           } else {
//             // Fallback: Use your existing emiService for reconciliation
//             const emi = await mongoose.model('EMI').findOne({
//               organizationId: payment.organizationId,
//               customerId: payment.customerId,
//               status: 'active'
//             });

//             if (emi && payment.invoiceId) {
//               await emiService.reconcileExternalPayment({
//                 organizationId: payment.organizationId,
//                 branchId: payment.branchId,
//                 invoiceId: payment.invoiceId,
//                 amount: payment.amount,
//                 paymentDate: payment.paymentDate,
//                 paymentMethod: payment.paymentMethod,
//                 transactionId: payment.transactionId,
//                 referenceNumber: payment.referenceNumber,
//                 createdBy: payment.createdBy || null
//               });
//             }
//           }
          
//           console.log(`✅ Allocated payment ${payment._id}`);
//         } catch (error) {
//           console.error(`❌ Failed to allocate payment ${payment._id}:`, error.message);
//         }
//       }
//     } catch (error) {
//       console.error('❌ Payment allocation job failed:', error.message);
//     }
//   }

//   /**
//    * 2. EMI OVERDUE MARKING (Daily at midnight)
//    * Updates EMI installment statuses
//    */
//   static async runEMIOverdueJob() {
//     console.log('📅 [PAYMENT CRON] Starting EMI overdue marking...');
    
//     try {
//       await emiService.markOverdueInstallments();
//       console.log('✅ EMI overdue marking completed');
//     } catch (error) {
//       console.error('❌ EMI overdue marking failed:', error.message);
//     }
//   }

//   /**
//    * 3. PAYMENT REMINDERS (Daily at 9:00 AM)
//    * Your existing reminder service
//    */
//   static async runPaymentReminders() {
//     console.log('📧 [PAYMENT CRON] Running payment reminders...');
    
//     try {
//       await runPaymentReminderJob();
//       console.log('✅ Payment reminders sent');
//     } catch (error) {
//       console.error('❌ Payment reminders failed:', error.message);
//     }
//   }

//   /**
//    * 4. OVERDUE REMINDERS (Daily at 9:30 AM)
//    * Your existing overdue reminder service
//    */
//   static async runOverdueReminders() {
//     console.log('🔔 [PAYMENT CRON] Running overdue reminders...');
    
//     try {
//       await runOverdueReminderJob();
//       console.log('✅ Overdue reminders sent');
//     } catch (error) {
//       console.error('❌ Overdue reminders failed:', error.message);
//     }
//   }

//   /**
//    * 5. CUSTOMER BALANCE RECALCULATION (Every 6 hours)
//    * Ensures customer balances match ledger
//    */
//   static async recalculateCustomerBalances() {
//     console.log('⚖️ [PAYMENT CRON] Recalculating customer balances...');
    
//     try {
//       const customers = await Customer.find({})
//         .select('_id organizationId outstandingBalance')
//         .lean();

//       let updatedCount = 0;

//       for (const customer of customers) {
//         // Get all outstanding invoices for this customer
//         const invoices = await Invoice.find({
//           organizationId: customer.organizationId,
//           customerId: customer._id,
//           status: { $in: ['issued', 'partially_paid'] }
//         });

//         const totalOutstanding = invoices.reduce(
//           (sum, inv) => sum + (inv.balanceAmount || 0), 0
//         );

//         // Update if different
//         if (Math.abs((customer.outstandingBalance || 0) - totalOutstanding) > 1) {
//           await Customer.findByIdAndUpdate(customer._id, {
//             outstandingBalance: totalOutstanding,
//             lastBalanceRecalculation: new Date()
//           });
//           updatedCount++;
//         }
//       }

//       console.log(`✅ Balances recalculated: ${updatedCount} customers updated`);
//     } catch (error) {
//       console.error('❌ Balance recalculation failed:', error.message);
//     }
//   }

//   /**
//    * 6. ACCOUNTING INTEGRITY CHECK (Daily at 2:00 AM)
//    * Your existing integrity check
//    */
//   static async runAccountingIntegrityCheck() {
//     console.log('🕵️ [PAYMENT CRON] Running accounting integrity check...');
    
//     try {
//       const stats = await AccountEntry.aggregate([
//         { 
//           $group: {
//             _id: "$organizationId",
//             totalDebit: { $sum: "$debit" },
//             totalCredit: { $sum: "$credit" }
//           }
//         }
//       ]);

//       for (const org of stats) {
//         const diff = Math.abs(org.totalDebit - org.totalCredit);
        
//         if (diff > 0.01) {
//           console.error(`🚨 CRITICAL: Organization ${org._id} is OUT OF BALANCE!`);
//           console.error(`   Debit: ${org.totalDebit}, Credit: ${org.totalCredit}, Diff: ${diff}`);
//           // TODO: Send alert email
//         }
//       }
      
//       console.log('✅ Accounting integrity check completed');
//     } catch (error) {
//       console.error('❌ Accounting integrity check failed:', error.message);
//     }
//   }

//   /**
//    * 7. CUSTOMER PAYMENT SUMMARY UPDATE (Daily at 11:00 PM)
//    * Updates cached payment summaries
//    */
//   static async updatePaymentSummaries() {
//     console.log('📊 [PAYMENT CRON] Updating payment summaries...');
    
//     try {
//       // This would update cached customer payment summaries
//       // Implement based on your caching strategy
      
//       console.log('✅ Payment summaries updated');
//     } catch (error) {
//       console.error('❌ Payment summaries update failed:', error.message);
//     }
//   }

//   /**
//    * 8. CLEANUP OLD DATA (Daily at 3:00 AM)
//    * Removes old pending reconciliations and failed allocations
//    */
//   static async cleanupOldData() {
//     console.log('🧹 [PAYMENT CRON] Cleaning up old data...');
    
//     try {
//       const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
//       const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

//       // Cleanup old pending reconciliations
//       const recResult = await mongoose.connection.db.collection('pendingreconciliations').deleteMany({
//         status: 'pending',
//         createdAt: { $lt: thirtyDaysAgo }
//       });

//       // Cleanup old payment gateway logs
//       const logResult = await mongoose.connection.db.collection('paymentgatewaylogs').deleteMany({
//         createdAt: { $lt: thirtyDaysAgo }
//       });

//       console.log(`🗑️ Cleaned up: ${recResult.deletedCount} reconciliations, ${logResult.deletedCount} logs`);
//     } catch (error) {
//       console.error('❌ Cleanup failed:', error.message);
//     }
//   }

//   /**
//    * Schedule all payment-related cron jobs
//    */
//   static scheduleAllJobs() {
//     console.log('⏰ [PAYMENT CRON] Scheduling all payment cron jobs...');

//     // 1. Payment Allocation (Every 30 minutes)
//     cron.schedule('*/30 * * * *', () => {
//       this.runPaymentAllocationJob();
//     });

//     // 2. EMI Overdue Marking (Daily midnight)
//     cron.schedule('0 0 * * *', () => {
//       this.runEMIOverdueJob();
//     });

//     // 3. Payment Reminders (Daily 9:00 AM - your existing)
//     cron.schedule('0 9 * * *', () => {
//       this.runPaymentReminders();
//     });

//     // 4. Overdue Reminders (Daily 9:30 AM - your existing)
//     cron.schedule('30 9 * * *', () => {
//       this.runOverdueReminders();
//     });

//     // 5. Customer Balance Recalculation (Every 6 hours)
//     cron.schedule('0 */6 * * *', () => {
//       this.recalculateCustomerBalances();
//     });

//     // 6. Accounting Integrity Check (Daily 2:00 AM)
//     cron.schedule('0 2 * * *', () => {
//       this.runAccountingIntegrityCheck();
//     });

//     // 7. Payment Summaries Update (Daily 11:00 PM)
//     cron.schedule('0 23 * * *', () => {
//       this.updatePaymentSummaries();
//     });

//     // 8. Cleanup Old Data (Daily 3:00 AM)
//     cron.schedule('0 3 * * *', () => {
//       this.cleanupOldData();
//     });

//     console.log('✅ [PAYMENT CRON] All jobs scheduled successfully');
//   }

//   /**
//    * Manual trigger for testing/debugging
//    */
//   static async runJobManually(jobName) {
//     console.log(`🔧 [MANUAL] Running job: ${jobName}`);
    
//     switch (jobName) {
//       case 'allocation':
//         await this.runPaymentAllocationJob();
//         break;
//       case 'emi-overdue':
//         await this.runEMIOverdueJob();
//         break;
//       case 'reminders':
//         await this.runPaymentReminders();
//         break;
//       case 'overdue':
//         await this.runOverdueReminders();
//         break;
//       case 'balances':
//         await this.recalculateCustomerBalances();
//         break;
//       case 'integrity':
//         await this.runAccountingIntegrityCheck();
//         break;
//       case 'summaries':
//         await this.updatePaymentSummaries();
//         break;
//       case 'cleanup':
//         await this.cleanupOldData();
//         break;
//       case 'all':
//         await this.runPaymentAllocationJob();
//         await this.runEMIOverdueJob();
//         await this.runPaymentReminders();
//         await this.runOverdueReminders();
//         await this.recalculateCustomerBalances();
//         await this.runAccountingIntegrityCheck();
//         await this.updatePaymentSummaries();
//         await this.cleanupOldData();
//         break;
//       default:
//         throw new Error(`Unknown job: ${jobName}`);
//     }
    
//     console.log(`✅ [MANUAL] Job ${jobName} completed`);
//   }
// }

// module.exports = PaymentCronManager;

// // // cron/paymentAllocation.cron.js
// // const cron = require('node-cron');
// // const paymentAllocationService = require('./paymentAllocation.service');
// // const Payment = require('.payment.model');

// // // Run every hour to auto-allocate unallocated payments
// // cron.schedule('0 * * * *', async () => {
// //   console.log('Running payment auto-allocation cron job...');
  
// //   try {
// //     // Find unallocated payments older than 1 hour
// //     const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
// //     const unallocatedPayments = await Payment.find({
// //       allocationStatus: 'unallocated',
// //       type: 'inflow',
// //       status: 'completed',
// //       createdAt: { $lte: oneHourAgo },
// //       customerId: { $ne: null }
// //     }).limit(50); // Process 50 at a time

// //     for (const payment of unallocatedPayments) {
// //       try {
// //         await paymentAllocationService.autoAllocatePayment(
// //           payment._id,
// //           payment.organizationId
// //         );
// //         console.log(`Auto-allocated payment ${payment._id}`);
// //       } catch (error) {
// //         console.error(`Failed to auto-allocate payment ${payment._id}:`, error.message);
// //       }
// //     }
    
// //     console.log(`Auto-allocation completed. Processed ${unallocatedPayments.length} payments.`);
// //   } catch (error) {
// //     console.error('Error in payment auto-allocation cron:', error);
// //   }
// // });