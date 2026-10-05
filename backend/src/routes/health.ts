import { Router } from 'express';

const startedAt = Date.now();

// Liveness check used by the app (to show "server reachable") and by deployment monitoring.
export function healthRouter(version: string): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json({ status: 'ok', version, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) });
  });
  return router;
}
