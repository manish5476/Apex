import mongoose, { ClientSession, MongoError } from 'mongoose';
import { TransactionLogger } from './transactionLogger';

export async function runInTransaction<T>(
  workFn: (session: ClientSession) => Promise<T>,
  maxRetries = 3,
  ctx: Record<string, unknown> = {}
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const session = await mongoose.startSession();
    session.startTransaction();

    TransactionLogger.log("TXN_START", { attempt, ctx });

    try {
      const result = await workFn(session);

      await session.commitTransaction();
      await session.endSession();

      TransactionLogger.log("TXN_COMMIT", { attempt, ctx });

      return result;
    } catch (err) {
      lastError = err;
      const mongoErr = err as MongoError;

      const isTransient =
        mongoErr.hasErrorLabel?.('TransientTransactionError') ||
        mongoErr.hasErrorLabel?.('UnknownTransactionCommitResult') ||
        mongoErr.code === 112;

      TransactionLogger.log("TXN_ERROR", {
        attempt,
        ctx,
        error: mongoErr.message,
        name: mongoErr.name,
        code: mongoErr.code
      });

      try {
        await session.abortTransaction();
        TransactionLogger.log("TXN_ABORT", { attempt, ctx });
      } catch (_) {
        // Ignore abort errors
      }

      await session.endSession();

      if (isTransient && attempt < maxRetries) {
        TransactionLogger.log("TXN_RETRY", { attempt, ctx });
        continue;
      }

      TransactionLogger.log("TXN_FAIL", { ctx, error: mongoErr.message });
      throw err;
    }
  }

  throw lastError;
}