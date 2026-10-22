import assert from 'node:assert/strict';
import { waitFor } from './workout-browser-driver.mjs';

export async function checkSessionDraftChanges(browser, base, session, row, output) {
  await browser.clickText(`Adjust 2. ${row}`);
  await browser.clickText(`Do 2. ${row} later`);
  await waitFor(
    async () => (await browser.text()).includes(`Train 3. ${row} now`),
    'deferred occurrence moves',
  );
  await browser.clickText(`Train 3. ${row} now`);
  await waitFor(
    async () => (await browser.value('Set notes')) === 'Keep my row draft',
    'deferred draft kept',
  );
  await browser.clickText(`Skip remaining 3. ${row} sets`);
  await browser.fill('Reason (optional)', 'Equipment occupied');
  await browser.clickText('Confirm adjustment');
  await waitFor(
    async () => (await browser.text()).includes(`Restore 3. ${row}`),
    'skip remains restorable',
  );
  await browser.clickText(`Restore 3. ${row}`);
  await browser.clickText(`Move 3. ${row} up`);
  await waitFor(
    async () => (await browser.text()).includes(`Train 2. ${row} now`),
    'restored occurrence reorders',
  );
  await browser.clickText(`Train 2. ${row} now`);
  await waitFor(
    async () => (await browser.value('Set notes')) === 'Keep my row draft',
    'restored draft kept',
  );
  await browser.clickText('Easier today: off');
  await waitFor(
    async () => (await browser.text()).includes('Easier today: on'),
    'easier-today saved',
  );
  assert.equal(await browser.value('Reps'), '10', 'existing reps draft is not rescaled');

  // A profile change arriving from the API must not reinterpret an existing local draft.
  await fetch(`${base}/api/me`, {
    method: 'PATCH',
    body: JSON.stringify({ unitSystem: 'imperial' }),
  });
  await browser.command('POST', '/refresh', {});
  await browser.clickText('Choose or adjust exercises');
  await browser.clickText(`Train 2. ${row} now`);
  await waitFor(
    async () => (await browser.text()).includes('This draft keeps kg and metres'),
    'draft pins display units',
  );
  assert.equal(await browser.value('Weight (kg)'), '10');
  assert.equal(await browser.value('Set notes'), 'Keep my row draft');
  await browser.screenshot(`${output}/320-dark-pinned-units.png`);

  await browser.clickText('Train 3. Bench press now');
  await waitFor(
    async () => (await browser.value('Weight (lb)')) === '132.277',
    'new occurrence uses pounds and current load',
  );
  await browser.clickLabel('Increase weight by 5 lb');
  assert.equal(await browser.value('Weight (lb)'), '137.277');
  assert.equal(await browser.value('Reps'), '10', 'new draft uses the gentler target');
  await browser.clickText(`Train 2. ${row} now`);
  await waitFor(
    async () => (await browser.value('Weight (kg)')) === '10',
    'separate occurrence draft remains metric',
  );

  // Restore the profile preference for the remaining screenshots, without touching either draft.
  await fetch(`${base}/api/me`, {
    method: 'PATCH',
    body: JSON.stringify({ unitSystem: 'metric' }),
  });
  await browser.navigate(`${base}/workouts/${session}`);
  await browser.clickText('Choose or adjust exercises');
  await browser.clickText(`Train 2. ${row} now`);
  await waitFor(
    async () => (await browser.value('Set notes')) === 'Keep my row draft',
    'draft survives profile round trip',
  );
  console.log(
    'PASS rendered adaptations: defer, skip/restore, reorder, easier-today and metric/imperial draft isolation',
  );
}
