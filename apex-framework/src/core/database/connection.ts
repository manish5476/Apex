import mongoose, { Connection, ConnectOptions } from 'mongoose';

const connections: Record<string, Connection> = {};

/**
 * Get (or lazily create) a mongoose connection for a given logical database.
 *
 * Usage inside a module's model file:
 *   import { getConnection } from '../../../core/database';
 *   const conn = getConnection('products_db');
 *   export default conn.model('Product', schema);
 *
 * All modules can share ONE physical MongoDB deployment while still being
 * logically separated by database name. This means when a module is
 * eventually extracted into its own service, its data comes with it —
 * no migration needed, no cross-module joins to untangle.
 *
 * If you don't need per-module DB isolation yet, just call
 * getConnection('main') everywhere — it's still a single connection.
 */
export function getConnection(dbName = 'main'): Connection {
  const existing = connections[dbName];
  if (existing) return existing;

  const baseUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
  const uri = baseUri.endsWith('/') ? `${baseUri}${dbName}` : `${baseUri}/${dbName}`;

  const options: ConnectOptions = {
    maxPoolSize: 10,
  };

  const conn = mongoose.createConnection(uri, options);

  conn.on('connected', () => console.log(`[mongo] connected -> ${dbName}`));
  conn.on('error', (err: Error) => console.error(`[mongo] error on ${dbName}:`, err.message));

  connections[dbName] = conn;
  return conn;
}

export async function closeAll(): Promise<void> {
  await Promise.all(Object.values(connections).map((c) => c.close()));
}