// src/utils/runInTransaction.js
const mongoose = require("mongoose");
const { log } = require("./txnLogger");

async function runInTransaction(workFn, maxRetries = 3, ctx = {}) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const session = await mongoose.startSession();
    session.startTransaction();

    log("TXN_START", { attempt, ctx });

    try {
      const result = await workFn(session);

      await session.commitTransaction();
      session.endSession();

      log("TXN_COMMIT", { attempt, ctx });

      return result;
    } catch (err) {
      lastError = err;

      const isTransient =
        err.errorLabels?.includes("TransientTransactionError") ||
        err.errorLabels?.includes("UnknownTransactionCommitResult") ||
        err.code === 112;

      log("TXN_ERROR", {
        attempt,
        ctx,
        error: err.message,
        name: err.name,
        code: err.code,
        labels: err.errorLabels
      });

      try {
        await session.abortTransaction();
        log("TXN_ABORT", { attempt, ctx });
      } catch (_) {}

      session.endSession();

      if (isTransient && attempt < maxRetries) {
        log("TXN_RETRY", { attempt, ctx });
        continue;
      }

      log("TXN_FAIL", { ctx, error: err.message });
      throw err;
    }
  }

  throw lastError;
}

module.exports = { runInTransaction };
