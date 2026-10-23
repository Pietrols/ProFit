import assert from 'node:assert/strict';
import { waitFor } from './workout-browser-driver.mjs';

const hasSession = (text, number) =>
  text
    .split('\n')
    .some(
      (line) =>
        line === `History session ${number}` || line.startsWith(`History session ${number} ·`),
    );

export async function checkWorkoutHistory(browser, base, output, name) {
  const seed = await fetch(`${base}/fixture/history`, { method: 'POST' }).then((response) =>
    response.json(),
  );
  await browser.navigate(`${base}/train`);
  await browser.clickText('Workout history');
  await waitFor(async () => hasSession(await browser.text(), 30), 'newest saved workout');
  assert(
    (await browser.text()).includes('Resume Workout acceptance'),
    'active workouts have a separate resume section',
  );
  assert.equal(
    await browser.script('return document.documentElement.scrollWidth > innerWidth'),
    false,
  );
  await browser.screenshot(`${output}/${name}-history.png`);
  await browser.clickText('Older workouts');
  await waitFor(async () => hasSession(await browser.text(), 1), 'second history page');
  assert((await browser.text()).includes('Page 2'));
  assert(!hasSession(await browser.text(), 30));
  await browser.clickText('Previous history page');
  await waitFor(async () => hasSession(await browser.text(), 30), 'previous page');

  await browser.clickText('Filter workout history');
  await browser.fill('Plan name', 'No matching routine');
  await browser.clickText('Apply history filters');
  await waitFor(
    async () => (await browser.text()).includes('No saved workouts here'),
    'empty filter state',
  );
  await browser.clickText('Clear history filters');
  await waitFor(async () => hasSession(await browser.text(), 30), 'cleared name filter');
  await browser.clickText('Rest days', 'radio');
  await browser.clickText('Apply history filters');
  await waitFor(async () => hasSession(await browser.text(), 2), 'rest-day history');
  assert((await browser.text()).includes('Rest day, completed'));
  assert(!hasSession(await browser.text(), 30));
  await browser.clickText('Abandoned', 'radio');
  await browser.clickText('Apply history filters');
  await waitFor(async () => hasSession(await browser.text(), 1), 'abandoned history');
  assert((await browser.text()).includes('abandoned'));
  await browser.clickText('Clear history filters');
  await waitFor(async () => hasSession(await browser.text(), 30), 'clear status filter');
  await browser.clickText('History for History routine');
  await waitFor(
    async () => (await browser.text()).includes('Filtering the selected plan.'),
    'exact plan filter',
  );
  await browser.clickText('Clear history filters');
  await waitFor(async () => hasSession(await browser.text(), 30), 'clear exact plan filter');
  await browser.clickText(`Open History session 30 on ${seed.localDate}`);
  await waitFor(async () => (await browser.text()).includes('Session summary'), 'saved detail');
  assert((await browser.text()).includes('Planned and actual'));
  await browser.clickText('Review Bench press comparison');
  await waitFor(
    async () => (await browser.text()).includes('Unknown for this older result.'),
    'legacy target honesty',
  );
  await browser.screenshot(`${output}/${name}-comparison.png`);
  await browser.clickText('Edit Bench press set 1');
  await waitFor(async () => (await browser.value('Weight (kg)')) === '74', 'historical correction');
  await browser.fill('Weight (kg)', '80');
  await browser.clickText('Save correction');
  await waitFor(
    async () => (await browser.text()).includes('Set corrected.'),
    'historical correction saved',
  );
  assert.equal(await browser.value('Weight (kg)'), null, 'the correction form closed after commit');
  assert((await browser.text()).includes('Volume: 640.0 kg total'));
  await browser.clickText('Recent results for Bench press');
  await waitFor(
    async () => (await browser.text()).includes('Recent exercise results'),
    'exercise history route',
  );
  await waitFor(
    async () => (await browser.text()).includes('Weight (kg): 80'),
    'exercise result follows correction',
  );
  assert((await browser.text()).includes('Weight (kg) change: +7'));
  await browser.screenshot(`${output}/${name}-exercise-results.png`);
  await browser.clickText('Older exercise results');
  await waitFor(async () => hasSession(await browser.text(), 5), 'older exercise results');
  await browser.clickText('Previous results page');
  await waitFor(
    async () => (await browser.text()).includes('Weight (kg): 80'),
    'newer exercise results',
  );

  await fetch(`${base}/fixture/offline`);
  try {
    await browser.navigate(`${base}/workouts/history`);
    await waitFor(async () => hasSession(await browser.text(), 30), 'offline saved history');
    await browser.clickText(`Open History session 30 on ${seed.localDate}`);
    await waitFor(
      async () => (await browser.text()).includes('Volume: 640.0 kg total'),
      'offline corrected detail',
    );
    await browser.screenshot(`${output}/${name}-offline-history-detail.png`);
  } finally {
    await fetch(`${base}/fixture/online`);
  }
  console.log(
    `PASS ${name} saved history: pagination, filters, snapshot review, correction, exercise comparison and offline reload`,
  );
}
