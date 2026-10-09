// D24 preview harness. Test fixtures only, never connected to a production account.
// Run: node --import ./backend/node_modules/tsx/dist/loader.mjs scripts/phase4-preview.ts /absolute/path/to/web-export
// Two origins have separate browser SQLite stores and share the existing test sync server.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fakeSyncServer } from '../mobile/src/features/sync/__tests__/fakeSyncServer';
const root = resolve(process.argv[2] ?? 'mobile/dist');
const user = { id: '00000000-0000-4000-8000-000000000041', email: 'phase4@example.invalid', displayName: 'Phase 4 Test', avatarUrl: null };
const session = { accessToken: 'phase4-fixture', refreshToken: 'phase4-fixture', accessTokenExpiresAt: '2999-01-01T00:00:00.000Z' };
const profile = { goal: null, experience: null, trainingPlace: null, unitSystem: 'metric', birthYear: null, sex: null, heightCm: null, daysPerWeek: null, limitations: null, onboardingStatus: 'skipped', updatedAt: new Date().toISOString() };
const server = fakeSyncServer(); const client = server.clientFor(user.id);
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
for (const port of [8082, 8083]) createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin'); res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin'); res.setHeader('Cache-Control', 'no-store');
  const json = (body: unknown) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
  try {
    if (url.pathname === '/phone') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><title>ProFit browser phone</title></head><body><iframe title="ProFit phone" src="/" width="390" height="844" style="border:0"></iframe></body></html>'); return; }
    if (url.pathname === '/fixture/offline' || url.pathname === '/fixture/online') { server.state.online = url.pathname.endsWith('/online'); json({ online: server.state.online }); return; }
    if (url.pathname.startsWith('/api/')) {
      if (!server.state.online) { req.socket.destroy(); return; }
      if (url.pathname === '/api/me') { json({ user, profile }); return; }
      if (url.pathname === '/api/sync/pull') { json(await client.get(url.pathname.slice(4) + url.search)); return; }
      if (url.pathname === '/api/sync/push') {
        let body = ''; for await (const chunk of req) body += chunk;
        json(await client.post('/sync/push', JSON.parse(body))); return;
      }
      res.statusCode = 404; json({ error: { code: 'NOT_FOUND', message: 'Preview fixture does not implement this route.' } }); return;
    }
    const requested = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (requested !== root && !requested.startsWith(`${root}/`)) { res.statusCode = 404; res.end(); return; }
    const isAsset = !!extname(requested);
    const file = isAsset ? requested : resolve(root, 'index.html');
    let bytes = await readFile(file);
    if (!isAsset || extname(file) === '.html') {
      const fixture = `if (!localStorage.getItem('profit.auth')) { localStorage.setItem('profit.auth', ${JSON.stringify(JSON.stringify({ user, session }))}); localStorage.setItem('profit.me.${user.id}', ${JSON.stringify(JSON.stringify({ user, profile }))}); }`;
      bytes = Buffer.from(bytes.toString().replace('<head>', `<head><script>${fixture}</script>`));
    }
    res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream'); res.end(bytes);
  } catch (e) { res.statusCode = 500; json({ error: { code: 'PREVIEW_ERROR', message: e instanceof Error ? e.message : String(e) } }); }
}).listen(port, '0.0.0.0', () => console.log(`Fixture phone: http://localhost:${port}/phone`));
