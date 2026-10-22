// Browser-only fault injection at the asynchronous draft storage boundary.
export async function holdAccountDraftRead(browser, firstUser, secondUser, secret, outcome) {
  await browser.script(
    `
    const [firstUser, secondUser, secret, outcome] = arguments;
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    const probe = { heldKey: null, settled: false, leaks: [], writes: [] };
    window.profitAccountProbe = probe;
    const owner = () => JSON.parse(get.call(localStorage, 'profit.auth') ?? 'null')?.user.id;
    const inspect = () => {
      if (owner() !== secondUser) return;
      if ([...document.querySelectorAll('input,textarea')].some((input) => input.value === secret))
        probe.leaks.push('Previous account input rendered');
    };
    new MutationObserver(inspect).observe(document.body, {
      childList: true, subtree: true, attributes: true, characterData: true,
    });
    for (const prototype of [HTMLInputElement.prototype, HTMLTextAreaElement.prototype]) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      Object.defineProperty(prototype, 'value', {
        ...descriptor,
        set(value) {
          descriptor.set.call(this, value);
          if (owner() === secondUser && value === secret)
            probe.leaks.push('Previous account input assigned');
        },
      });
    }
    Storage.prototype.getItem = function(key) {
      const raw = get.call(this, key);
      if (!probe.heldKey && key.startsWith('workout-draft:v1:' + firstUser + ':') &&
          JSON.parse(raw ?? 'null')?.entry.draft.weight === secret) {
        probe.heldKey = key;
        probe.original = raw;
        return new Promise((resolve, reject) => {
          probe.release = () => {
            probe.settled = true;
            if (outcome === 'resolve') resolve(raw);
            else reject(new Error('Delayed previous-account read failed'));
          };
        });
      }
      return raw;
    };
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('workout-draft:')) {
        probe.writes.push({ key, value, owner: owner() });
        if (owner() === secondUser &&
            (key.startsWith('workout-draft:v1:' + firstUser + ':') ||
             JSON.parse(value).entry.draft.weight === secret))
          probe.leaks.push('Previous account draft written after switching');
      }
      return set.call(this, key, value);
    };
    probe.report = () => ({
      heldKey: probe.heldKey, settled: probe.settled, leaks: probe.leaks,
      writes: probe.writes, originalUnchanged: get.call(localStorage, probe.heldKey) === probe.original,
      owner: owner(),
    });
    `,
    [firstUser, secondUser, secret, outcome],
  );
}
