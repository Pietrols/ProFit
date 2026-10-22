// Disposable D24-style fixture server. Never connect this harness to a real account.
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureAuth, fixtureUser, workoutFixture } from './workout-fixture';

const mime: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

export async function startWorkoutPreview(directory: string, port = 0) {
  const root = resolve(directory);
  let fixture = await workoutFixture();
  const server = createServer(async (req, res) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    const json = (body: unknown) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(body));
    };
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/fixture/reset' && req.method === 'POST') {
        fixture = await workoutFixture();
        json({ reset: true });
        return;
      }
      if (url.pathname === '/fixture/state') {
        json({ online: fixture.server.state.online, records: [...fixture.server.rows.values()] });
        return;
      }
      if (['/fixture/offline', '/fixture/online'].includes(url.pathname)) {
        fixture.server.state.online = url.pathname.endsWith('/online');
        json({ online: fixture.server.state.online });
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        if (!fixture.server.state.online) {
          req.socket.destroy();
          return;
        }
        let body = '';
        for await (const chunk of req) body += chunk;
        if (url.pathname === '/api/me') {
          if (req.method === 'PATCH') Object.assign(fixture.profile, JSON.parse(body));
          json({ user: fixtureUser, profile: fixture.profile });
        } else if (req.method === 'POST' && url.pathname === '/api/sync/push') {
          json(await fixture.client.post('/sync/push', JSON.parse(body)));
        } else {
          json(await fixture.client.get(url.pathname.slice(4) + url.search));
        }
        return;
      }
      const requested = resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (requested !== root && !requested.startsWith(`${root}/`)) {
        res.statusCode = 404;
        res.end();
        return;
      }
      const file = extname(requested) ? requested : resolve(root, 'index.html');
      let bytes = await readFile(file);
      if (extname(file) === '.html') {
        const auth = JSON.stringify(JSON.stringify(fixtureAuth));
        const me = JSON.stringify(JSON.stringify({ user: fixtureUser, profile: fixture.profile }));
        const script = `if (!localStorage.getItem('profit.auth')) { localStorage.setItem('profit.auth', ${auth}); localStorage.setItem('profit.me.${fixtureUser.id}', ${me}); }`;
        bytes = Buffer.from(bytes.toString().replace('<head>', `<head><script>${script}</script>`));
      }
      res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
      res.end(bytes);
    } catch (error) {
      res.statusCode = 500;
      json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await startWorkoutPreview(process.argv[2] ?? 'mobile/dist', 8082);
  console.log('Workout fixture ready on http://127.0.0.1:8082');
  process.on('SIGTERM', () => server.close());
}
