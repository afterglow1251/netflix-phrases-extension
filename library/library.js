const { formatTime, toCsv, claudePrompt, claudeUrl, plural, byTime, safeFileName } = globalThis.Phrases;

const PASTE_KEY = /Mac/i.test(navigator.platform) ? '⌘V' : 'Ctrl+V';

const $ = (id) => document.getElementById(id);
const els = {
  enabled: $('enabled'),
  app: $('app'),
  episodes: $('episodes'),
  exportAll: $('exportAll'),
  title: $('title'),
  count: $('count'),
  askClaude: $('askClaude'),
  search: $('search'),
  copy: $('copy'),
  export: $('export'),
  delete: $('delete'),
  confirm: $('confirm'),
  confirmText: $('confirmText'),
  confirmYes: $('confirmYes'),
  confirmNo: $('confirmNo'),
  list: $('list'),
  noMatch: $('noMatch'),
  empty: $('empty'),
  toast: $('toast'),
  toastText: $('toastText'),
  toastAction: $('toastAction'),
};

function svg(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup;
  return template.content.firstElementChild;
}

const COPY_ICON = svg('<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>');
const REMOVE_ICON = svg('<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>');

// Stored entries that have phrases, most recently watched first.
let videos = [];
let selectedId = null;
let toastTimer = null;

function sortVideos() {
  videos.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function selectedVideo() {
  return videos.find((video) => video.id === selectedId) || null;
}

function query() {
  return els.search.value.trim().toLowerCase();
}

function visibleItems() {
  const video = selectedVideo();
  if (!video) return [];
  const q = query();
  const items = byTime(video.items);
  return q ? items.filter((item) => item.text.toLowerCase().includes(q)) : items;
}

function formatDate(ms) {
  if (!ms) return '';
  const date = new Date(ms);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'today';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/* Rendering */

function renderEpisodes() {
  const has = videos.length > 0;
  els.app.hidden = !has;
  els.empty.hidden = has;

  els.episodes.replaceChildren(
    ...videos.map((video) => {
      const button = document.createElement('button');
      button.className = 'episode' + (video.id === selectedId ? ' selected' : '');
      button.dataset.id = video.id;
      const title = document.createElement('span');
      title.className = 'episode-title';
      title.textContent = video.title;
      title.title = video.title;
      const meta = document.createElement('span');
      meta.className = 'episode-meta';
      meta.textContent = `${plural(video.items.length, 'phrase')} · ${formatDate(video.updatedAt)}`;
      button.append(title, meta);
      return button;
    })
  );
}

function appendHighlighted(parent, text, q) {
  if (!q) {
    parent.textContent = text;
    return;
  }
  const lower = text.toLowerCase();
  let start = 0;
  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, start)) {
    if (at > start) parent.append(text.slice(start, at));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(at, at + q.length);
    parent.append(mark);
    start = at + q.length;
  }
  if (start < text.length) parent.append(text.slice(start));
}

function row(item, q) {
  const li = document.createElement('li');
  li.dataset.id = item.id;
  const time = document.createElement('span');
  time.className = 'time';
  time.textContent = formatTime(item.t);
  const text = document.createElement('span');
  text.className = 'text';
  appendHighlighted(text, item.text, q);
  const tools = document.createElement('span');
  tools.className = 'row-tools';
  for (const [icon, action, label] of [[COPY_ICON, 'copy', 'Copy phrase'], [REMOVE_ICON, 'remove', 'Remove phrase']]) {
    const button = document.createElement('button');
    button.className = 'icon';
    button.dataset.action = action;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.append(icon.cloneNode(true));
    tools.append(button);
  }
  li.append(time, text, tools);
  return li;
}

function renderList() {
  const video = selectedVideo();
  if (!video) return;
  const items = visibleItems();
  const q = query();

  els.title.textContent = video.title;
  els.count.textContent = q
    ? `${items.length} of ${plural(video.items.length, 'phrase')}`
    : plural(video.items.length, 'phrase');
  els.list.replaceChildren(...items.map((item) => row(item, q)));
  els.noMatch.hidden = !(q && !items.length);
  for (const button of [els.askClaude, els.copy, els.export]) button.disabled = !items.length;
  els.askClaude.title = `Opens Claude with ${plural(items.length, 'line')} and the prompt filled in`;
}

function select(id) {
  selectedId = id;
  els.search.value = '';
  hideConfirm();
  history.replaceState(null, '', id ? '#' + id : location.pathname);
  renderEpisodes();
  renderList();
  els.list.scrollTop = 0;
}

function showToast(text, undo) {
  clearTimeout(toastTimer);
  els.toastText.textContent = text;
  els.toastAction.hidden = !undo;
  els.toastAction.onclick = undo
    ? () => {
        els.toast.hidden = true;
        undo();
      }
    : null;
  els.toast.hidden = false;
  toastTimer = setTimeout(() => (els.toast.hidden = true), undo ? 5000 : 2500);
}

function hideConfirm() {
  els.confirm.hidden = true;
}

/* Actions */

async function removeItem(itemId) {
  // Read fresh: a Netflix tab may have saved phrases since the last render.
  const key = 'v:' + selectedId;
  const video = (await chrome.storage.local.get(key))[key];
  const item = video && video.items.find((i) => i.id === itemId);
  if (!item) return;
  video.items = video.items.filter((i) => i !== item);
  if (video.items.length) await chrome.storage.local.set({ [key]: video });
  else await chrome.storage.local.remove(key);

  showToast('Phrase removed', async () => {
    const fresh = (await chrome.storage.local.get(key))[key] || { ...video, items: [] };
    if (!fresh.items.some((i) => i.id === item.id)) fresh.items.push(item);
    await chrome.storage.local.set({ [key]: fresh });
  });
}

async function deleteEpisode() {
  hideConfirm();
  const key = 'v:' + selectedId;
  const video = (await chrome.storage.local.get(key))[key];
  if (!video) return;
  await chrome.storage.local.remove(key);
  showToast(`Deleted ${plural(video.items.length, 'phrase')}`, () => chrome.storage.local.set({ [key]: video }));
}

async function copyText(text, message) {
  await navigator.clipboard.writeText(text);
  showToast(message);
}

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Events */

els.enabled.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: els.enabled.checked });
});

els.episodes.addEventListener('click', (event) => {
  const button = event.target.closest('.episode');
  if (button) select(button.dataset.id);
});

els.search.addEventListener('input', renderList);

document.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement !== els.search) {
    event.preventDefault();
    els.search.focus();
  } else if (event.key === 'Escape' && document.activeElement === els.search) {
    els.search.value = '';
    els.search.blur();
    renderList();
  }
});

els.list.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const itemId = button.closest('li').dataset.id;
  if (button.dataset.action === 'remove') {
    removeItem(itemId);
    return;
  }
  const item = selectedVideo().items.find((i) => i.id === itemId);
  if (item) copyText(item.text, 'Phrase copied');
});

els.askClaude.addEventListener('click', async () => {
  const prompt = claudePrompt(selectedVideo().title, visibleItems());
  // Copied too, in case the chat opens empty (long episode).
  await navigator.clipboard.writeText(prompt);
  showToast(`Prompt also copied: if Claude opens empty, paste with ${PASTE_KEY}`);
  window.open(claudeUrl(prompt), '_blank', 'noopener');
});

els.copy.addEventListener('click', () => {
  const items = visibleItems();
  copyText(items.map((item) => item.text).join('\n'), `${plural(items.length, 'line')} copied`);
});

els.export.addEventListener('click', () => {
  const video = selectedVideo();
  download(safeFileName(video.title) + '.csv', toCsv([{ ...video, items: visibleItems() }]));
});

els.exportAll.addEventListener('click', () => {
  download('netflix-phrases.csv', toCsv(videos.map((video) => ({ ...video, items: byTime(video.items) }))));
});

els.delete.addEventListener('click', () => {
  if (!els.confirm.hidden) {
    hideConfirm();
    return;
  }
  els.confirmText.textContent = `Delete all ${plural(selectedVideo().items.length, 'phrase')} of this episode?`;
  els.confirm.hidden = false;
});
els.confirmYes.addEventListener('click', deleteEpisode);
els.confirmNo.addEventListener('click', hideConfirm);

// Apply only what changed: a Netflix tab saves a phrase every few seconds.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.enabled) els.enabled.checked = changes.enabled.newValue !== false;
  const keys = Object.keys(changes).filter((key) => key.startsWith('v:'));
  if (!keys.length) return;

  let selectedChanged = false;
  for (const key of keys) {
    const id = key.slice(2);
    const video = changes[key].newValue;
    videos = videos.filter((v) => v.id !== id);
    if (video && video.items.length) videos.push(video);
    if (id === selectedId) selectedChanged = true;
  }
  sortVideos();
  if (!selectedVideo()) {
    select(videos.length ? videos[0].id : null);
    return;
  }
  renderEpisodes();
  if (selectedChanged) renderList();
});

async function init() {
  const data = await chrome.storage.local.get(null);
  els.enabled.checked = data.enabled !== false;
  videos = Object.keys(data)
    .filter((key) => key.startsWith('v:'))
    .map((key) => data[key])
    .filter((video) => video.items.length);
  sortVideos();
  // "All episodes" in the player panel opens this page on that episode.
  const fromHash = location.hash.slice(1);
  select(videos.some((v) => v.id === fromHash) ? fromHash : videos.length ? videos[0].id : null);
}

init();
