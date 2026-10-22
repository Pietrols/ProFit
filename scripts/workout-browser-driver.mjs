// A small WebDriver client for the runner's existing ChromeDriver, with no npm dependencies.
import { writeFile } from 'node:fs/promises';

export async function driverRequest(base, method, path, body) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  const result = await response.json();
  if (!response.ok || result.value?.error)
    throw new Error(`${method} ${path}: ${result.value?.message ?? response.status}`);
  return result.value;
}

export async function waitFor(check, description, timeout = 30000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${description}${lastError ? ` (${lastError.message})` : ''}`);
}

export async function openBrowser(base = 'http://127.0.0.1:9515') {
  const session = await driverRequest(base, 'POST', '/session', {
    capabilities: {
      alwaysMatch: {
        browserName: 'chrome',
        'goog:chromeOptions': {
          args: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
        },
        'goog:loggingPrefs': { browser: 'ALL' },
      },
    },
  });
  const root = `/session/${session.sessionId}`;
  const command = (method, path, body) => driverRequest(base, method, root + path, body);
  const script = (source, args = []) => command('POST', '/execute/sync', { script: source, args });
  const element = (value, using = 'css selector') =>
    waitFor(() => command('POST', '/element', { using, value }), `element ${value}`);
  const elementPath = (value) => `/element/${value['element-6066-11e4-a52e-4f735466cecf']}`;
  return {
    command,
    script,
    async navigate(url) {
      await command('POST', '/url', { url });
    },
    async viewport(width, height) {
      await command('POST', '/goog/cdp/execute', {
        cmd: 'Emulation.setDeviceMetricsOverride',
        params: { width, height, deviceScaleFactor: 1, mobile: true },
      });
    },
    async clickText(text, role = 'button') {
      if (text.includes('"') || !['button', 'radio'].includes(role))
        throw new Error('Use a supported fixture role and unquoted label.');
      const value = await element(`//*[@role="${role}" and normalize-space(.)="${text}"]`, 'xpath');
      await command('POST', elementPath(value) + '/click', {});
    },
    async clickLabel(label) {
      const value = await element(`[aria-label=${JSON.stringify(label)}]`);
      await command('POST', elementPath(value) + '/click', {});
    },
    async fill(label, text) {
      const value = await element(
        `input[aria-label=${JSON.stringify(label)}],textarea[aria-label=${JSON.stringify(label)}]`,
      );
      await command('POST', elementPath(value) + '/clear', {});
      await command('POST', elementPath(value) + '/value', { text });
    },
    value(label) {
      return script(
        'return document.querySelector("input[aria-label=" + JSON.stringify(arguments[0]) + "],textarea[aria-label=" + JSON.stringify(arguments[0]) + "]")?.value',
        [label],
      );
    },
    text() {
      return script('return document.body.innerText');
    },
    async screenshot(path) {
      const value = await command('GET', '/screenshot');
      await writeFile(path, Buffer.from(value, 'base64'));
    },
    quit() {
      return command('DELETE', '');
    },
  };
}
