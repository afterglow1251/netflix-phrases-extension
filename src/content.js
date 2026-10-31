// Watches the Netflix player's subtitle layer and saves every cue that is
// shown on screen, so only the parts you actually watch end up in the list.
(function () {
  const { splitCue, isKnown, continuesPrevious } = globalThis.Phrases;

  let enabled = true;
  let lastRaw = '';
  let scheduled = false;
  // The player's subtitle layer currently being observed.
  let layer = null;
  // The phrase saved last in this tab, used to join sentences split over cues.
  let previous = null;
  let writes = Promise.resolve();

  chrome.storage.local.get({ enabled: true }, (data) => {
    enabled = data.enabled;
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) enabled = changes.enabled.newValue;
  });

  function currentVideoId() {
    const match = location.pathname.match(/^\/watch\/(\d+)/);
    if (match) return match[1];
    const player = document.querySelector('[data-uia="player"][data-videoid]');
    return player ? player.dataset.videoid : null;
  }

  function readCue() {
    const containers = (layer || document).querySelectorAll('.player-timedtext-text-container');
    return Array.from(containers, (c) => c.innerText).join('\n').trim();
  }

  function readTitle() {
    const el = document.querySelector('[data-uia="video-title"]');
    if (!el) return '';
    return el.innerText.split('\n').map((s) => s.trim()).filter(Boolean).join(' · ');
  }

  function check() {
    scheduled = false;
    if (!chrome.runtime?.id) {
      stop();
      return;
    }
    const videoId = currentVideoId();
    if (!videoId) return;

    const raw = readCue();
    if (raw === lastRaw) return;
    lastRaw = raw;
    if (recorder.onCue) recorder.onCue(raw);
    if (!raw || !enabled) return;

    const phrases = splitCue(raw);
    if (!phrases.length) return;

    const video = document.querySelector('video');
    const time = video ? video.currentTime : 0;
    const title = readTitle();
    // A cue starting with a dash is a new speaker, never a continuation.
    const newSpeaker = /^\s*[-–—]/.test(raw);
    writes = writes
      .then(() => save(videoId, title, phrases, time, newSpeaker))
      .catch((err) => console.warn('[Netflix Phrases]', err));
  }

  async function save(videoId, title, phrases, time, newSpeaker) {
    const key = 'v:' + videoId;
    const stored = (await chrome.storage.local.get(key))[key];
    const entry = stored || { id: videoId, title: '', items: [] };
    if (title) entry.title = title;
    if (!entry.title) entry.title = 'Netflix ' + videoId;

    let changed = false;
    for (const [index, text] of phrases.entries()) {
      // Only the first line of a cue can continue the previous cue; the other
      // lines are separate speakers.
      const prevItem =
        index === 0 && !newSpeaker && previous && previous.videoId === videoId
          ? entry.items.find((item) => item.id === previous.itemId)
          : null;

      if (
        prevItem &&
        continuesPrevious({ text: prevItem.text, lastTime: previous.lastTime }, time) &&
        !isKnown(text, entry.items.filter((item) => item !== prevItem))
      ) {
        prevItem.text += ' ' + text;
        previous.lastTime = time;
        changed = true;
        continue;
      }
      if (isKnown(text, entry.items)) {
        previous = null;
        continue;
      }

      const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), text, t: time };
      entry.items.push(item);
      previous = { videoId, itemId: item.id, lastTime: time };
      changed = true;
    }

    if (!changed && stored && (!title || stored.title === title)) return;
    entry.updatedAt = Date.now();
    await chrome.storage.local.set({ [key]: entry });
  }

  // Shared with ui.js, which runs in the same content-script world and sets
  // onCue to follow the subtitle on screen.
  const recorder = (globalThis.PhrasesRecorder = { currentVideoId, onCue: null });

  // One cue arrives as several mutations; read it once they settle.
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(check, 100);
  }

  // Observe only the subtitle layer, not the whole page: Netflix changes its
  // DOM constantly during playback. The layer is rebuilt with the player (new
  // episode, page change), so look for it once a second.
  const observer = new MutationObserver(schedule);

  function attach() {
    if (!chrome.runtime?.id) {
      stop();
      return;
    }
    const found = document.querySelector('.player-timedtext');
    if (found === layer) return;
    observer.disconnect();
    layer = found;
    if (layer) {
      observer.observe(layer, { childList: true, subtree: true, characterData: true });
      schedule();
    }
  }

  // The extension was reloaded or removed; this copy can't save anymore.
  function stop() {
    clearInterval(timer);
    observer.disconnect();
  }

  const timer = setInterval(attach, 1000);
  attach();
})();
