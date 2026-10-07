import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { GoogleVerifier } from './auth/google.js';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { meRouter } from './routes/me.js';
import { syncRouter } from './routes/sync.js';

export const API_VERSION = '0.3.0';

// What the app needs from outside. Tests pass a test database, a fake Google verifier and a fixed clock.
export type AppDeps = {
  db: Db;
  verifyGoogle: GoogleVerifier;
  now?: () => Date;
};

// Builds the Express app without starting a server, so tests can drive it directly.
export function createApp(config: Config, logger: Logger, deps: AppDeps): Express {
  const app = express();
  const now = deps.now ?? (() => new Date());

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
  app.use(
    '/auth',
    authRouter({
      ctx: { db: deps.db, secret: config.JWT_SECRET, now },
      verifyGoogle: deps.verifyGoogle,
      devLogin: config.AUTH_DEV_LOGIN,
    }),
  );
  app.use('/me', requireAuth(config.JWT_SECRET, now), meRouter(deps.db, now));
  app.use('/sync', requireAuth(config.JWT_SECRET, now), syncRouter(deps.db, now));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
