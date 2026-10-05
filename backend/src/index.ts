import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './lib/logger.js';

const config = loadConfig();
const logger = createLogger(config);
const app = createApp(config, logger);

const server = app.listen(config.PORT, () => {
  logger.info(`ProFit API listening on http://localhost:${config.PORT}`);
});

// Finish in-flight requests before exiting when the host stops the process.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
