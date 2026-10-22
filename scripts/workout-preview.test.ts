import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWorkoutPreview } from './workout-preview';
import { fixtureSessionId } from './workout-fixture';

test('isolates the exported app and serves protocol-compatible disposable workout fixtures', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'profit-preview-'));
  await writeFile(
    join(directory, 'index.html'),
    '<html><head></head><body>Fixture app</body></html>',
  );
  const server = await startWorkoutPreview(directory);
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(`${base}/workouts/${fixtureSessionId}`);
    assert.equal(response.headers.get('Cross-Origin-Opener-Policy'), 'same-origin');
    assert.equal(response.headers.get('Cross-Origin-Embedder-Policy'), 'require-corp');
    assert.match(await response.text(), /workout-fixture/);
    const capability = await fetch(`${base}/api/sync/capabilities`).then((r) => r.json());
    assert(capability.features.includes('workout_structure_v1'));
    const pulled = await fetch(`${base}/api/sync/pull?since=0&protocol=2`).then((r) => r.json());
    assert.equal(pulled.changes.workout_sessions[0].id, fixtureSessionId);
    await fetch(`${base}/fixture/offline`);
    await assert.rejects(fetch(`${base}/api/me`));
    await fetch(`${base}/fixture/reset`, { method: 'POST' });
    assert.equal((await fetch(`${base}/fixture/state`).then((r) => r.json())).online, true);
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  }
});
