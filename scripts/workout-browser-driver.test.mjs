import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { driverRequest, waitFor } from './workout-browser-driver.mjs';

test('browser checks propagate protocol errors and bound failed polling', async () => {
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/ok') res.end(JSON.stringify({ value: { ready: true } }));
    else {
      res.statusCode = 500;
      res.end(
        JSON.stringify({ value: { error: 'invalid session id', message: 'Session closed' } }),
      );
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepEqual(await driverRequest(base, 'GET', '/ok'), { ready: true });
    await assert.rejects(driverRequest(base, 'GET', '/bad'), /Session closed/);
    await assert.rejects(
      waitFor(() => false, 'missing form', 5),
      /Timed out: missing form/,
    );
    let attempts = 0;
    assert.equal(await waitFor(() => ++attempts > 1 && 'ready', 'form', 1000), 'ready');
  } finally {
    await new Promise((done) => server.close(done));
  }
});
