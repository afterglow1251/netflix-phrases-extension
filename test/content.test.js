// Runs content.js against a fake Netflix player page and in-memory storage.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function setup({ pathname = '/watch/81234567', title = 'Dark\nE1\nSecrets' } = {}) {
  const store = {};
  const listeners = [];
  const page = { cue: [], time: 0, title };
  let onMutate = null;
  let observed = null;

  const chrome = {
    runtime: { id: 'test', onMessage: { addListener() {} } },
    storage: {
      local: {
        get(query, callback) {
          let result;
          if (typeof query === 'string') result = query in store ? { [query]: structuredClone(store[query]) } : {};
          else result = { ...query, ...structuredClone(store) };
          if (callback) callback(result);
          return Promise.resolve(result);
        },
        set(values) {
          const changes = {};
          for (const [key, value] of Object.entries(values)) {
            changes[key] = { newValue: value };
            store[key] = structuredClone(value);
          }
          listeners.forEach((fn) => fn(changes));
          return Promise.resolve();
        },
      },
      onChanged: { addListener: (fn) => listeners.push(fn) },
    },
  };

  const cues = (selector) => {
    assert.strictEqual(selector, '.player-timedtext-text-container');
    return page.cue.map((text) => ({ innerText: text }));
  };
  const layer = { querySelectorAll: cues };

  const document = {
    body: {},
    querySelectorAll: cues,
    querySelector(selector) {
      if (selector === '.player-timedtext') return layer;
      if (selector === 'video') return { currentTime: page.time };
      if (selector === '[data-uia="video-title"]') return page.title ? { innerText: page.title } : null;
      return null;
    },
  };

  class MutationObserver {
    constructor(fn) { onMutate = fn; }
    observe(target) { observed = target; }
    disconnect() { observed = null; }
  }

  const context = vm.createContext({
    chrome, document, MutationObserver, setTimeout, console, location: { pathname },
    // unref so the attach poll doesn't keep the test process alive.
    setInterval: (fn, ms) => setInterval(fn, ms).unref(),
    clearInterval,
  });
  vm.runInContext(read('src/phrases.js'), context);
  vm.runInContext(read('src/content.js'), context);

  // Show a cue at a given video time and let the throttled check and the
  // storage write finish.
  async function show(cue, time) {
    page.cue = cue === null ? [] : [cue];
    page.time = time;
    // Only the subtitle layer is observed, not the whole page.
    if (observed === layer) onMutate([]);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return { store, page, show, chrome };
}

test('saves the cues that are shown, cleaned and deduplicated', async () => {
  const { store, show } = setup();
  await show('- Hi.\n- Hello there.', 1);
  await show(null, 2);
  await show('[thunder]', 3);
  await show('Hi.', 4);
  await show('We need to\ntalk.', 5);

  const entry = store['v:81234567'];
  assert.strictEqual(entry.title, 'Dark · E1 · Secrets');
  assert.deepStrictEqual(entry.items.map((i) => i.text), ['Hi.', 'Hello there.', 'We need to talk.']);
  assert.deepStrictEqual(entry.items.map((i) => i.t), [1, 1, 5]);
});

test('joins a sentence split over two cues and skips it when re-watched', async () => {
  const { store, show } = setup();
  await show('I was going', 10);
  await show('to the store.', 12);
  // Rewind and watch it again.
  await show('I was going', 10);
  await show('to the store.', 12);

  assert.deepStrictEqual(store['v:81234567'].items.map((i) => i.text), ['I was going to the store.']);
});

test('records nothing while paused by the toggle or outside the player', async () => {
  const paused = setup();
  await paused.chrome.storage.local.set({ enabled: false });
  await paused.show('Hello.', 1);
  assert.strictEqual(paused.store['v:81234567'], undefined);

  const browse = setup({ pathname: '/browse' });
  await browse.show('Hello.', 1);
  assert.deepStrictEqual(Object.keys(browse.store), []);
});

test('falls back to a generic title when the player hides it', async () => {
  const { store, show } = setup({ title: '' });
  await show('Hello.', 1);
  assert.strictEqual(store['v:81234567'].title, 'Netflix 81234567');
});

test('keeps two speakers in one cue apart, even after an open line', async () => {
  const { store, show } = setup();
  await show('- Wait\n- What is it?', 1);
  await show('So you', 3);
  await show('- Hey.\n- Hi.', 4);

  assert.deepStrictEqual(store['v:81234567'].items.map((i) => i.text), ['Wait', 'What is it?', 'So you', 'Hey.', 'Hi.']);
});

test('does not join a line cut off with a dash to the next one', async () => {
  const { store, show } = setup();
  await show('I was—', 1);
  await show('Stop talking.', 2);

  assert.deepStrictEqual(store['v:81234567'].items.map((i) => i.text), ['I was—', 'Stop talking.']);
});

test('does not join an already saved line to a new open line', async () => {
  const { store, show } = setup();
  await show('We need to talk.', 5);
  // Rewind: a new open line appears right before the saved one.
  await show('Listen', 4);
  await show('We need to talk.', 5);

  assert.deepStrictEqual(store['v:81234567'].items.map((i) => i.text), ['We need to talk.', 'Listen']);
});

test('observes only the subtitle layer', async () => {
  const { store, show } = setup();
  await show('Only the layer.', 1);
  assert.deepStrictEqual(store['v:81234567'].items.map((i) => i.text), ['Only the layer.']);
});
