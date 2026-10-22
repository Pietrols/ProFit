// Real exported app, real browser storage, disposable API fixture. This is not a native phone test.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { openBrowser, waitFor } from './workout-browser-driver.mjs';

const base = 'http://127.0.0.1:8082';
const session = '00000000-0000-4000-8000-000000000044';
const row = 'One arm dumbbell row with a deliberately long exercise name';
const output = process.argv[2] ?? 'workout-browser-artifacts';
await mkdir(output, { recursive: true });
await waitFor(() => fetch(`${base}/fixture/state`).then((r) => r.ok), 'fixture server');
await waitFor(() => fetch('http://127.0.0.1:9515/status').then((r) => r.ok), 'ChromeDriver');

for (const width of [320, 390])
  for (const theme of ['dark', 'light']) {
    const name = `${width}-${theme}`;
    await fetch(`${base}/fixture/reset`, { method: 'POST' });
    const browser = await openBrowser();
    try {
      await browser.viewport(width, 844);
      await browser.navigate(base);
      await browser.script('localStorage.setItem("profit.theme", arguments[0])', [theme]);
      await browser.navigate(`${base}/workouts/${session}`);
      await waitFor(async () => (await browser.value('Reps')) === '8', 'current set form');
      await waitFor(
        async () => (await browser.text()).includes('Draft saved on this phone'),
        'durable draft',
      );
      const layout = await browser.script(`
      const buttons = [...document.querySelectorAll('[role="button"]')];
      const save = buttons.find((el) => el.textContent === 'Log set');
      const settings = buttons.find((el) => el.textContent === 'Timer settings');
      return { width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth,
        save: save?.getBoundingClientRect().toJSON(), settings: settings?.getBoundingClientRect().toJSON() };
    `);
      assert.equal(layout.width, width);
      assert.equal(layout.overflow, false, 'no horizontal page overflow');
      assert(
        layout.save && layout.settings && layout.save.y < layout.settings.y,
        'logging precedes settings',
      );
      assert(layout.save.bottom <= 844, 'normal logging fits before configuration');
      await browser.screenshot(`${output}/${name}-current.png`);
      const ax = await browser.command('POST', '/goog/cdp/execute', {
        cmd: 'Accessibility.getFullAXTree',
        params: {},
      });
      assert(ax.nodes.some((node) => node.name?.value === 'Increase weight by 2.5 kg'));
      await writeFile(`${output}/${name}-accessibility.json`, JSON.stringify(ax, null, 2));

      await browser.fill('Weight (kg)', '60,75');
      await browser.clickLabel('Increase weight by 2.5 kg');
      assert.equal(await browser.value('Weight (kg)'), '63.25');
      await browser.clickLabel('Decrease weight by 2.5 kg');
      assert.equal(await browser.value('Weight (kg)'), '60.75');
      await browser.fill('Weight (kg)', '60');
      await browser.clickText('Choose or adjust exercises');
      await browser.clickText(`Train 2. ${row} now`);
      await waitFor(async () => (await browser.value('Reps')) === '10', 'selected exercise form');
      await browser.fill('Weight (kg)', '10');
      await browser.fill('Set notes', 'Keep my row draft');
      await waitFor(
        async () => (await browser.text()).includes('Draft saved on this phone'),
        'row draft saved',
      );
      await browser.screenshot(`${output}/${name}-custom-fields.png`);
      await browser.clickText('Train 1. Bench press now');
      await waitFor(async () => (await browser.value('Weight (kg)')) === '60', 'bench draft kept');
      await fetch(`${base}/fixture/offline`);
      await browser.command('POST', '/refresh', {});
      await waitFor(
        async () => (await browser.value('Weight (kg)')) === '60',
        'offline draft recovery',
      );
      await browser.clickText('Log set');
      await waitFor(
        async () => (await browser.text()).includes('Set 2 of 3'),
        'saved set advances',
      );
      await browser.screenshot(`${output}/${name}-rest.png`);
      await fetch(`${base}/fixture/online`);
      await browser.command('POST', '/refresh', {});
      await waitFor(async () => {
        const state = await fetch(`${base}/fixture/state`).then((r) => r.json());
        return state.records.filter((item) => item.collection === 'set_logs').length === 1;
      }, 'one synced result after offline logging');
      await browser.clickText('Choose or adjust exercises');
      await browser.clickText(`Train 2. ${row} now`);
      await waitFor(
        async () => (await browser.value('Set notes')) === 'Keep my row draft',
        'other draft after reload',
      );
      await browser.script(`
      for (const el of document.querySelectorAll('div,input,textarea')) {
        if (el.children.length || (!el.textContent && !el.matches('input,textarea'))) continue;
        const style = getComputedStyle(el);
        el.style.fontSize = parseFloat(style.fontSize) * 1.5 + 'px';
        const line = parseFloat(style.lineHeight);
        if (Number.isFinite(line)) el.style.lineHeight = line * 1.5 + 'px';
      }
    `);
      await browser.screenshot(`${output}/${name}-enlarged-text.png`);
      await writeFile(`${output}/${name}-layout.json`, JSON.stringify(layout, null, 2));
      console.log(
        `PASS ${name}: current-set layout, labels, steppers, selection, offline reload and single result`,
      );
    } catch (error) {
      await browser.screenshot(`${output}/${name}-failure.png`).catch(() => {});
      const details = {
        error: String(error),
        text: await browser.text().catch(() => ''),
        logs: await browser.command('POST', '/log', { type: 'browser' }).catch(() => []),
      };
      await writeFile(`${output}/${name}-failure.json`, JSON.stringify(details, null, 2));
      throw error;
    } finally {
      await browser.quit();
    }
  }
