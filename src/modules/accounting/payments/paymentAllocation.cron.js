// cron/paymentCronManager.js
const cron = require('node-cron');
const mongoose = require('mongoose');
const Payment = require('./payment.model');
const EMI = require('./emi.model');
const Invoice = require('../billing/invoice.model');
const Customer = require('../../organization/core/customer.model');
const AccountEntry = require('../core/model/accountEntry.model');

// Import your existing services
const emiService = require('./emi.service');

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
   * 5. SCHEDULE ALL JOBS
   * Initializes and schedules all payment-related cron jobs
   */
  static scheduleAllJobs() {
    console.log('📅 [PAYMENT CRON] Scheduling all payment-related jobs...');

    // A. Payment Allocation (Every 30 minutes)
    cron.schedule('0,30 * * * *', async () => {
      await this.runPaymentAllocationJob();
    });

    // B. Customer Balance Recalculation (Daily at 1 AM)
    cron.schedule('0 1 * * *', async () => {
      await this.recalculateCustomerBalances();
    });

    // C. Accounting Integrity Check (Daily at 2 AM)
    cron.schedule('0 2 * * *', async () => {
      await this.runAccountingIntegrityCheck();
    });

    // D. Cleanup Old Data (Weekly on Sunday at 3 AM)
    cron.schedule('0 3 * * 0', async () => {
      await this.cleanupOldData();
    });

    console.log('✅ [PAYMENT CRON] All jobs scheduled successfully!');
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

module.exports = { PaymentCronManager };