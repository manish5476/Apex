import fs from 'fs';
import path from 'path';

const logPath = path.join(__dirname, '../../../logs/transactions.log');

export class TransactionLogger {
  static log(message: string, meta: Record<string, unknown> = {}): void {
    const timestamp = new Date().toISOString();
    const entry = { timestamp, message, meta };
    const line = JSON.stringify(entry) + "\n";
    
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
      try {
        fs.mkdirSync(logDir, { recursive: true });
      } catch (err) {
        console.error('[TransactionLogger] Failed to create log directory:', err);
        return; 
      }
    }

    try {
      fs.appendFileSync(logPath, line, { encoding: 'utf8' });
    } catch (err) {
      console.error('[TransactionLogger] Failed to write to transaction log:', err);
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[TXN]', message, meta);
    }
  }
}