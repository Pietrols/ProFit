import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { Config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { healthRouter } from './routes/health.js';

export const API_VERSION = '0.1.0';

// Builds the Express app without starting a server, so tests can drive it directly.
export function createApp(config: Config, logger: Logger): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : false }));
  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      logger.info({ method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, ms: Math.round(ms) }, 'request');
    });
    next();
  });

  app.use('/health', healthRouter(API_VERSION));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
