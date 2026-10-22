import assert from 'node:assert/strict';
import { waitFor } from './workout-browser-driver.mjs';

// Inject browser storage failures around the real form. No app storage adapter is replaced.
export async function checkDraftFailures(browser) {
  await browser.script(`
    window.fixtureSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('workout-draft:')) throw new Error('Fixture disk full');
      return window.fixtureSetItem.call(this, key, value);
    };
  `);
  await browser.fill('Weight (kg)', '61');
  await waitFor(
    async () => (await browser.text()).includes('Draft is only in memory'),
    'write failure status',
  );
  assert.equal(await browser.value('Weight (kg)'), '61');
  await browser.script('Storage.prototype.setItem = window.fixtureSetItem');
  await browser.clickText('Retry saving draft');
  await waitFor(
    async () => (await browser.text()).includes('Draft saved on this phone'),
    'write retry saved',
  );

  const injection = await browser.command('POST', '/goog/cdp/execute', {
    cmd: 'Page.addScriptToEvaluateOnNewDocument',
    params: {
      source: `
      window.fixtureGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function(key) {
        if (key.startsWith('workout-draft:')) throw new Error('Fixture disk unavailable');
        return window.fixtureGetItem.call(this, key);
      };
    `,
    },
  });
  await browser.command('POST', '/refresh', {});
  await waitFor(
    async () => (await browser.text()).includes('Retry draft recovery'),
    'read failure blocks editing',
  );
  assert.equal(await browser.value('Weight (kg)'), null);
  await browser.command('POST', '/goog/cdp/execute', {
    cmd: 'Page.removeScriptToEvaluateOnNewDocument',
    params: { identifier: injection.identifier },
  });
  await browser.script('Storage.prototype.getItem = window.fixtureGetItem');
  await browser.clickText('Retry draft recovery');
  await waitFor(
    async () => (await browser.value('Weight (kg)')) === '61',
    'read retry keeps durable text',
  );

  const key = await browser.script(`
    return Object.keys(localStorage).find((key) => {
      if (!key.startsWith('workout-draft:')) return false;
      try { return JSON.parse(localStorage.getItem(key)).entry.draft.weight === '61'; }
      catch { return false; }
    });
  `);
  assert(key, 'find only the reviewed draft for failure injection');
  await browser.script('localStorage.setItem(arguments[0], "{broken")', [key]);
  await browser.command('POST', '/refresh', {});
  await waitFor(
    async () => (await browser.text()).includes('Discard unreadable draft'),
    'corrupt draft blocked',
  );
  await browser.clickText('Discard unreadable draft');
  await browser.clickText('Keep saved draft');
  assert.equal(await browser.script('return localStorage.getItem(arguments[0])', [key]), '{broken');
  await browser.clickText('Discard unreadable draft');
  await browser.clickText('Confirm discard draft');
  await waitFor(
    async () => (await browser.value('Weight (kg)')) === '60',
    'confirmed fresh prefill from saved work',
  );
  console.log(
    'PASS rendered draft failures: write retry, read retry, cancelled and confirmed discard',
  );
}
