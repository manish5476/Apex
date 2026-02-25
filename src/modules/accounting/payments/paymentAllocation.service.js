// services/paymentAllocation.service.js
const mongoose = require('mongoose');
const Payment = require('./payment.model');
const Invoice = require('../billing/invoice.model');
const EMI = require('./emi.model');
const Customer = require('../../organization/core/customer.model');
const catchAsync = require('../../../core/utils/api/catchAsync');
const AppError = require('../../../core/utils/api/appError');

class PaymentAllocationService {
  
  /**
   * Get comprehensive customer payment summary
   */
  async getCustomerPaymentSummary(customerId, organizationId) {
    const [customer, invoices, emis, payments] = await Promise.all([
      Customer.findById(customerId),
      Invoice.find({
        organizationId,
        customerId,
        status: { $in: ['issued', 'partially_paid'] }
      }),
      EMI.find({
        organizationId,
        customerId,
        status: 'active'
      }).populate('invoiceId'),
      Payment.find({
        organizationId,
        customerId,
        type: 'inflow',
        status: 'completed'
      }).populate('allocatedTo.documentId')
    ]);

    // Calculate totals
    let totalInvoiceOutstanding = 0;
    let totalEMIOutstanding = 0;
    let totalAdvanceBalance = 0;
    
    // Invoice calculations
    invoices.forEach(inv => {
      totalInvoiceOutstanding += inv.balanceAmount;
    });

    // EMI calculations
    const upcomingEMIs = [];
    emis.forEach(emi => {
      emi.installments.forEach(inst => {
        const pendingAmount = inst.totalAmount - inst.paidAmount;
        if (pendingAmount > 0) {
          totalEMIOutstanding += pendingAmount;
          
          if (inst.dueDate >= new Date()) {
            upcomingEMIs.push({
              emiId: emi._id,
              invoiceNumber: emi.invoiceId?.invoiceNumber,
              installmentNumber: inst.installmentNumber,
              dueDate: inst.dueDate,
              dueAmount: pendingAmount,
              status: inst.paymentStatus,
              overdue: inst.dueDate < new Date() && inst.paymentStatus !== 'paid'
            });
          }
        }
      });
      
      // Include EMI advance balance
      totalAdvanceBalance += emi.advanceBalance || 0;
    });

    // Calculate unallocated payments
    const unallocatedPayments = payments.filter(p => 
      p.allocationStatus === 'unallocated' || p.allocationStatus === 'partially_allocated'
    );

    // Calculate total allocated vs unallocated
    let totalAllocated = 0;
    let totalUnallocated = 0;
    
    payments.forEach(payment => {
      if (payment.allocatedTo.length > 0) {
        const allocated = payment.allocatedTo.reduce((sum, a) => sum + a.amount, 0);
        totalAllocated += allocated;
        totalUnallocated += (payment.amount - allocated);
      } else {
        totalUnallocated += payment.amount;
      }
    });

    // Sort upcoming EMIs
    upcomingEMIs.sort((a, b) => a.dueDate - b.dueDate);

    return {
      customer: {
        id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        storedOutstandingBalance: customer.outstandingBalance || 0,
        advanceBalance: customer.advanceBalance || 0
      },
      totals: {
        totalOutstanding: totalInvoiceOutstanding + totalEMIOutstanding,
        invoiceOutstanding: totalInvoiceOutstanding,
        emiOutstanding: totalEMIOutstanding,
        totalAdvance: totalAdvanceBalance + (customer.advanceBalance || 0),
        totalPaymentsReceived: payments.reduce((sum, p) => sum + p.amount, 0),
        allocatedPayments: totalAllocated,
        unallocatedPayments: totalUnallocated
      },
      breakdown: {
        totalInvoices: invoices.length,
        activeEMIs: emis.length,
        upcomingInstallments: upcomingEMIs.length,
        overdueInstallments: upcomingEMIs.filter(e => e.overdue).length
      },
      invoices: invoices.map(inv => ({
        id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        date: inv.invoiceDate,
        total: inv.grandTotal,
        paid: inv.paidAmount,
        balance: inv.balanceAmount,
        status: inv.status,
        hasEMI: emis.some(e => e.invoiceId.toString() === inv._id.toString())
      })),
      upcomingEMIs,
      paymentStatus: {
        fullyAllocated: payments.filter(p => p.allocationStatus === 'fully_allocated').length,
        partiallyAllocated: payments.filter(p => p.allocationStatus === 'partially_allocated').length,
        unallocated: payments.filter(p => p.allocationStatus === 'unallocated').length
      }
    };
  }

  /**
   * Auto-allocate payment to outstanding documents
   */
  async autoAllocatePayment(paymentId, organizationId) {
    const payment = await Payment.findOne({
      _id: paymentId,
      organizationId,
      type: 'inflow'
    }).populate('customerId');

    if (!payment || payment.customerId === null) {
      throw new AppError('Payment not found or no customer associated', 400);
    }

    let remainingAmount = payment.remainingAmount || payment.amount;
    const allocations = [];
    
    // 1. First, use customer advance if available
    const customer = await Customer.findById(payment.customerId);
    if (customer.advanceBalance > 0) {
      const advanceUsed = Math.min(customer.advanceBalance, remainingAmount);
      customer.advanceBalance -= advanceUsed;
      remainingAmount -= advanceUsed;
      
      allocations.push({
        type: 'advance',
        amount: advanceUsed,
        allocatedAt: new Date()
      });
      
      await customer.save();
    }

    // 2. Find all EMIs for this customer
    const emis = await EMI.find({
      organizationId,
      customerId: payment.customerId,
      status: 'active'
    }).populate('invoiceId');

    // 3. Allocate to EMI installments first (oldest due first)
    for (const emi of emis) {
      if (remainingAmount <= 0) break;
      
      // Sort installments by due date
      const sortedInstallments = [...emi.installments].sort((a, b) => {
        // First by payment status (pending first), then by due date
        if (a.paymentStatus !== b.paymentStatus) {
          return a.paymentStatus === 'pending' ? -1 : 1;
        }
        return a.dueDate - b.dueDate;
      });

      for (const installment of sortedInstallments) {
        if (remainingAmount <= 0) break;
        
        if (installment.paymentStatus !== 'paid') {
          const dueAmount = installment.totalAmount - installment.paidAmount;
          const toAllocate = Math.min(dueAmount, remainingAmount);
          
          // Update installment
          installment.paidAmount += toAllocate;
          remainingAmount -= toAllocate;
          
          // Update status
          if (installment.paidAmount >= installment.totalAmount) {
            installment.paymentStatus = 'paid';
          } else if (installment.paidAmount > 0) {
            installment.paymentStatus = 'partial';
          }
          
          allocations.push({
            type: 'emi',
            documentId: emi.invoiceId._id,
            emiId: emi._id,
            installmentNumber: installment.installmentNumber,
            amount: toAllocate,
            allocatedAt: new Date()
          });
        }
      }
      
      // Update EMI status
      const allPaid = emi.installments.every(i => i.paymentStatus === 'paid');
      if (allPaid) {
        emi.status = 'completed';
      }
      
      await emi.save();
      
      // Update invoice
      const invoice = await Invoice.findById(emi.invoiceId);
      if (invoice) {
        const totalAllocatedToInvoice = allocations
          .filter(a => a.documentId && a.documentId.toString() === invoice._id.toString())
          .reduce((sum, a) => sum + a.amount, 0);
        
        invoice.paidAmount += totalAllocatedToInvoice;
        invoice.balanceAmount -= totalAllocatedToInvoice;
        
        if (invoice.balanceAmount <= 0) {
          invoice.status = 'paid';
        } else if (invoice.paidAmount > 0) {
          invoice.status = 'partially_paid';
        }
        
        await invoice.save();
      }
    }

    // 4. Allocate to non-EMI invoices (if any remaining)
    if (remainingAmount > 0) {
      const nonEMIInvoices = await Invoice.find({
        organizationId,
        customerId: payment.customerId,
        status: { $in: ['issued', 'partially_paid'] },
        _id: { $nin: emis.map(e => e.invoiceId) }
      }).sort({ dueDate: 1 });

      for (const invoice of nonEMIInvoices) {
        if (remainingAmount <= 0) break;
        
        const toAllocate = Math.min(invoice.balanceAmount, remainingAmount);
        invoice.paidAmount += toAllocate;
        invoice.balanceAmount -= toAllocate;
        remainingAmount -= toAllocate;
        
        if (invoice.balanceAmount <= 0) {
          invoice.status = 'paid';
        } else if (invoice.paidAmount > 0) {
          invoice.status = 'partially_paid';
        }
        
        allocations.push({
          type: 'invoice',
          documentId: invoice._id,
          amount: toAllocate,
          allocatedAt: new Date()
        });
        
        await invoice.save();
      }
    }

    // 5. If still remaining, add to customer advance
    if (remainingAmount > 0) {
      customer.advanceBalance += remainingAmount;
      await customer.save();
      
      allocations.push({
        type: 'advance',
        amount: remainingAmount,
        allocatedAt: new Date()
      });
    }

    // 6. Update payment allocation status
    payment.allocatedTo = allocations;
    payment.remainingAmount = 0;
    payment.allocationStatus = allocations.length > 0 ? 'fully_allocated' : 'unallocated';
    await payment.save();

    // 7. Recalculate customer outstanding balance
    await this.recalculateCustomerBalance(payment.customerId, organizationId);

    return {
      paymentId: payment._id,
      originalAmount: payment.amount,
      allocated: payment.amount - remainingAmount,
      remainingAdvance: remainingAmount,
      allocations
    };
  }

  /**
   * Manual allocation of payment
   */
  async manualAllocatePayment(paymentId, allocations, organizationId, userId) {
    const payment = await Payment.findOne({
      _id: paymentId,
      organizationId
    });

    if (!payment) {
      throw new AppError('Payment not found', 404);
    }

    // Validate allocations don't exceed payment amount
    const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
    if (totalAllocated > payment.amount) {
      throw new AppError('Total allocation exceeds payment amount', 400);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const processedAllocations = [];

      for (const alloc of allocations) {
        switch (alloc.type) {
          case 'emi':
            await this.allocateToEMI(alloc, session);
            break;
          case 'invoice':
            await this.allocateToInvoice(alloc, session);
            break;
          case 'advance':
            await this.allocateToAdvance(alloc, session);
            break;
        }
        
        processedAllocations.push({
          ...alloc,
          allocatedAt: new Date(),
          allocatedBy: userId
        });
      }

      // Update payment
      payment.allocatedTo = processedAllocations;
      payment.allocationStatus = totalAllocated >= payment.amount ? 'fully_allocated' : 'partially_allocated';
      payment.remainingAmount = payment.amount - totalAllocated;
      payment.updatedBy = userId;
      await payment.save({ session });

      // Update customer balance
      const customerId = payment.customerId;
      if (customerId) {
        await this.recalculateCustomerBalance(customerId, organizationId, session);
      }

      await session.commitTransaction();
      
      return {
        success: true,
        paymentId: payment._id,
        allocations: processedAllocations
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Recalculate customer balance from scratch
   */
  async recalculateCustomerBalance(customerId, organizationId, session = null) {
    const options = session ? { session } : {};
    
    // Get all invoices
    const invoices = await Invoice.find({
      organizationId,
      customerId,
      status: { $in: ['issued', 'partially_paid'] }
    }, null, options);

    const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.balanceAmount, 0);

    // Update customer
    await Customer.findByIdAndUpdate(
      customerId,
      { outstandingBalance: totalOutstanding },
      options
    );

    return totalOutstanding;
  }

  /**
   * Get unallocated payments for a customer
   */
  async getUnallocatedPayments(customerId, organizationId) {
    return await Payment.find({
      organizationId,
      customerId,
      type: 'inflow',
      status: 'completed',
      $or: [
        { allocationStatus: 'unallocated' },
        { allocationStatus: 'partially_allocated' }
      ]
    }).sort({ paymentDate: 1 });
  }

  /**
   * Get payment allocation report
   */
  async getAllocationReport(organizationId, startDate, endDate) {
    const payments = await Payment.find({
      organizationId,
      paymentDate: { $gte: startDate, $lte: endDate },
      type: 'inflow',
      status: 'completed'
    }).populate('customerId', 'name')
      .populate('allocatedTo.documentId');

    const report = {
      totalPayments: payments.length,
      totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
      fullyAllocated: payments.filter(p => p.allocationStatus === 'fully_allocated').length,
      partiallyAllocated: payments.filter(p => p.allocationStatus === 'partially_allocated').length,
      unallocated: payments.filter(p => p.allocationStatus === 'unallocated').length,
      details: payments.map(p => ({
        id: p._id,
        paymentDate: p.paymentDate,
        customer: p.customerId?.name || 'N/A',
        amount: p.amount,
        allocationStatus: p.allocationStatus,
        allocatedTo: p.allocatedTo.map(a => ({
          type: a.type,
          amount: a.amount,
          documentId: a.documentId?._id || a.documentId
        }))
      }))
    };

    return report;
  }
}

module.exports = new PaymentAllocationService();