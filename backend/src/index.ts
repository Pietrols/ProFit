import { createApp } from './app.js';
import { createGoogleVerifier } from './auth/google.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { createLogger } from './lib/logger.js';

const config = loadConfig();
const logger = createLogger(config);
const database = createDatabase(config.DATABASE_URL);
const verifyGoogle = createGoogleVerifier({ clientIds: config.googleClientIds });
const app = createApp(config, logger, { db: database.db, verifyGoogle });

if (config.AUTH_DEV_LOGIN) logger.warn('Developer sign-in is on (AUTH_DEV_LOGIN). Never enable this in production.');
if (config.googleClientIds.length === 0) logger.warn('GOOGLE_CLIENT_IDS is empty, so Google sign-in will be refused.');

const server = app.listen(config.PORT, () => {
  logger.info(`ProFit API listening on http://localhost:${config.PORT}`);
});

// Finish in-flight requests before exiting when the host stops the process.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => {
      void database.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
