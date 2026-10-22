import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { openBrowser, waitFor } from './workout-browser-driver.mjs';
import { holdAccountDraftRead } from './workout-browser-account-probe.mjs';

const base = 'http://127.0.0.1:8082';
const firstUser = '00000000-0000-4000-8000-000000000041';
const secondUser = '00000000-0000-4000-8000-000000000051';
const firstSession = '00000000-0000-4000-8000-000000000044';
const secondSession = '00000000-0000-4000-8000-000000000054';
const output = process.argv[2] ?? 'workout-browser-artifacts';
const row = 'One arm dumbbell row with a deliberately long exercise name';
await mkdir(output, { recursive: true });
await waitFor(() => fetch(`${base}/fixture/state`).then((r) => r.ok), 'account fixture');
await waitFor(() => fetch('http://127.0.0.1:9515/status').then((r) => r.ok), 'ChromeDriver');

async function openYou(browser) {
  const element = await waitFor(
    () =>
      browser.command('POST', '/element', {
        using: 'css selector',
        value: 'a[href="/you"]',
      }),
    'hydrated You tab',
  );
  await browser.command(
    'POST',
    `/element/${element['element-6066-11e4-a52e-4f735466cecf']}/click`,
    {},
  );
}

async function switchAccount(browser, email) {
  await openYou(browser);
  await browser.clickText('Sign out');
  await waitFor(async () => (await browser.text()).includes('Sign out of ProFit'), 'confirmation');
  await browser.clickText('Sign out');
  await waitFor(async () => (await browser.value('Email')) === '', 'existing developer sign-in');
  await browser.fill('Email', email);
  await browser.clickText('Sign in');
  await waitFor(
    async () => (await browser.text()).includes('Resume Workout acceptance'),
    'new account Home',
  );
}

for (const outcome of ['resolve', 'reject']) {
  await fetch(`${base}/fixture/reset`, { method: 'POST' });
  const browser = await openBrowser();
  try {
    await browser.viewport(390, 844);
    await browser.navigate(base);
    await browser.clickText('Resume Workout acceptance');
    await waitFor(async () => (await browser.value('Reps')) === '8', 'first account workout');
    await browser.fill('Weight (kg)', '61.75');
    await waitFor(
      async () => (await browser.text()).includes('Draft saved on this phone'),
      'first account saved draft',
    );
    await browser.clickText('Choose or adjust exercises');
    await browser.clickText(`Train 2. ${row} now`);
    await waitFor(async () => (await browser.value('Reps')) === '10', 'different slot');
    await holdAccountDraftRead(browser, firstUser, secondUser, '61.75', outcome);
    await browser.settleScroll();
    await browser.clickText('Train 1. Bench press now');
    await waitFor(() => browser.script('return !!window.profitAccountProbe.heldKey'), 'held read');
    assert((await browser.text()).includes('Recovering saved set draft'));
    assert.equal(await browser.value('Weight (kg)'), null, 'no editable input before recovery');
    await waitFor(
      () =>
        browser.script(`
          const message = [...document.querySelectorAll('div')].find((element) =>
            !element.children.length && element.textContent === 'Recovering saved set draft');
          const top = message?.getBoundingClientRect().top;
          return top >= 0 && top < 400;
        `),
      'pending recovery returns into view before capture',
    );
    await browser.screenshot(`${output}/account-${outcome}-pending.png`);

    // Browser Back pops the app's Resume navigation. No reload, token edit or store injection.
    await browser.command('POST', '/back', {});
    await switchAccount(browser, 'second-workout@example.invalid');
    assert.equal(await browser.script('return window.profitAccountProbe.settled'), false);
    await browser.clickText('Resume Workout acceptance');
    await waitFor(async () => (await browser.value('Reps')) === '8', 'second account workout');
    assert.equal(await browser.value('Weight (kg)'), '', 'second account starts independently');
    await browser.fill('Weight (kg)', '22.25');
    await waitFor(
      async () => (await browser.text()).includes('Draft saved on this phone'),
      'second account saved draft',
    );
    await browser.script('window.profitAccountProbe.release()');
    await browser.command('POST', '/execute/async', {
      script:
        'const done = arguments[0]; requestAnimationFrame(() => requestAnimationFrame(done));',
      args: [],
    });
    const report = await browser.script('return window.profitAccountProbe.report()');
    assert.equal(report.settled, true);
    assert.equal(report.owner, secondUser);
    assert.equal(report.originalUnchanged, true);
    assert.deepEqual(report.leaks, []);
    assert(
      report.writes.some(
        (write) =>
          write.owner === secondUser && JSON.parse(write.value).entry.draft.weight === '22.25',
      ),
      'observed a separate second-account draft write',
    );
    assert.equal(await browser.value('Weight (kg)'), '22.25', 'late read cannot replace input');
    assert(!(await browser.text()).includes('Delayed previous-account read failed'));
    await writeFile(`${output}/account-${outcome}-report.json`, JSON.stringify(report, null, 2));
    await browser.screenshot(`${output}/account-${outcome}-isolated.png`);

    await browser.navigate(`${base}/workouts/${firstSession}`);
    await waitFor(
      async () => (await browser.text()).includes('Session unavailable'),
      'foreign session',
    );
    assert.equal(await browser.value('Weight (kg)'), null);
    await browser.navigate(`${base}/workouts/${secondSession}`);
    await waitFor(
      async () => (await browser.value('Weight (kg)')) === '22.25',
      'second draft reload',
    );
    await browser.navigate(base);
    await switchAccount(browser, 'workout@example.invalid');
    await browser.clickText('Resume Workout acceptance');
    await waitFor(
      async () => (await browser.value('Weight (kg)')) === '61.75',
      'first draft recovered',
    );
    const state = await fetch(`${base}/fixture/state`).then((r) => r.json());
    assert.equal(state.records.filter((record) => record.collection === 'set_logs').length, 0);
    await fetch(`${base}/fixture/history`, { method: 'POST' });
    await browser.navigate(`${base}/workouts/history`);
    await waitFor(
      async () => (await browser.text()).includes('History session 30'),
      'first account saved history',
    );
    await browser.navigate(base);
    await switchAccount(browser, 'second-workout@example.invalid');
    await browser.navigate(`${base}/workouts/history`);
    await waitFor(
      async () => (await browser.text()).includes('No saved workouts here'),
      'second account empty history',
    );
    assert(
      !(await browser.text()).includes('History session 30'),
      'saved history remains account scoped',
    );
    await browser.screenshot(`${output}/account-${outcome}-history-isolated.png`);
    console.log(
      `PASS account switch with delayed ${outcome}: no draft leak, overwrite or result, and saved history isolation`,
    );
  } catch (error) {
    await browser.screenshot(`${output}/account-${outcome}-failure.png`).catch(() => {});
    await writeFile(
      `${output}/account-${outcome}-failure.json`,
      JSON.stringify({ error: String(error), text: await browser.text().catch(() => '') }, null, 2),
    );
    throw error;
  } finally {
    await browser.quit();
  }
}
