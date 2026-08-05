
import app from './app';
import { closeAll } from './core/database';

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
});

async function shutdown(signal: string) {
  console.log(`[server] received ${signal}, shutting down...`);
  server.close(async () => {
    await closeAll();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
