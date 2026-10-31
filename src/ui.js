// The phrases panel on the Netflix player, in the style of Claude Chat
// Outline: docked on the right, resizable, collapsing to a slim tab on the
// edge (Cmd/Ctrl+Shift+O). The tab hides with the mouse, like Netflix's own
// controls, so it stays out of the picture.
(function () {
  const { splitCue, phraseKey, formatTime, toCsv, claudePrompt, claudeUrl, plural, byTime, safeFileName } =
    globalThis.Phrases;
  const recorder = globalThis.PhrasesRecorder;

  const PASTE_KEY = /Mac/i.test(navigator.platform) ? '⌘V' : 'Ctrl+V';
  const SHORTCUT = /Mac/i.test(navigator.platform) ? '⌘⇧O' : 'Ctrl+Shift+O';
  const IDLE_MS = 3000;
  const WIDTH_MIN = 240;
  const WIDTH_MAX = 520;
  const RIGHT_GAP = 8; // panel distance from the player's right edge (see STYLE)
  const NOTICE_MS = 4000;
  // Jump a little before the line, so it is heard from its start.
  const SEEK_LEAD = 0.4;

  const ICON = {
    collapse: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    expand: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>',
    download: '<svg viewBox="0 0 24 24"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
    remove: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    sparkle: '<svg class="fill" viewBox="0 0 24 24"><path d="M12 4l1.9 6.1L20 12l-6.1 1.9L12 20l-1.9-6.1L4 12l6.1-1.9z"/></svg>',
  };

  const STYLE = `
    :host {
      --bg: #262624;
      --fg: #ece9e1;
      --muted: #9c9a92;
      --border: rgba(255, 255, 255, 0.1);
      --hover: rgba(255, 255, 255, 0.05);
      --active-bg: rgba(229, 72, 77, 0.16);
      --active-hover-bg: rgba(229, 72, 77, 0.24);
      --accent: #e5484d;
      --accent-hover: #ef6a6e;
      --focus: #66a7ee;
      --input-bg: #1f1e1d;
      --shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
      position: absolute;
      inset: 0;
      z-index: 2147483000;
      pointer-events: none;
      color-scheme: dark;
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }

    .panel, .tab {
      font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
      color: var(--fg);
      background: var(--bg);
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
      pointer-events: auto;
    }

    /* ----- panel ----- */

    .panel {
      position: absolute;
      top: 72px;
      right: ${RIGHT_GAP}px;
      bottom: 104px;
      display: flex;
      flex-direction: column;
      width: var(--width, 320px);
      min-height: 220px;
      overflow: hidden;
      border-radius: 12px;
    }
    .panel.resizing { user-select: none; }

    .resizer { position: absolute; top: 0; left: 0; bottom: 0; z-index: 1; width: 6px; cursor: ew-resize; }
    .resizer:hover, .panel.resizing .resizer { background: var(--border); }

    .header {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 8px 8px 8px 14px;
      border-bottom: 1px solid var(--border);
    }
    .title {
      flex: 1;
      min-width: 0;
      margin: 0;
      overflow: hidden;
      font-size: 13px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .title-link { padding: 0; border-radius: 4px; font-weight: 600; }
    .title-link:hover { text-decoration: underline; text-underline-offset: 3px; }
    .count { margin-left: 4px; color: var(--muted); font-weight: 400; }

    button { margin: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
    button:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }

    .icon-btn {
      display: inline-grid;
      flex: none;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      color: var(--muted);
    }
    .icon-btn:hover:not(:disabled) { background: var(--hover); color: var(--fg); }
    .icon-btn:disabled { opacity: 0.35; cursor: default; }
    .icon-btn.danger:hover:not(:disabled) { color: var(--accent); }

    svg {
      display: block;
      width: 16px;
      height: 16px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    svg.fill { fill: currentColor; stroke: none; }

    /* Recording on or paused. */
    .switch { display: inline-grid; flex: none; place-items: center; width: 40px; height: 28px; border-radius: 6px; cursor: pointer; }
    .switch:hover { background: var(--hover); }
    .switch input { position: absolute; opacity: 0; pointer-events: none; }
    .track { position: relative; width: 26px; height: 16px; border-radius: 8px; background: rgba(255, 255, 255, 0.18); transition: background 0.15s; }
    .track::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--fg);
      transition: transform 0.15s;
    }
    .switch input:checked + .track { background: var(--accent); }
    .switch input:checked + .track::after { transform: translateX(10px); background: #fff; }
    .switch input:focus-visible + .track { outline: 2px solid var(--focus); outline-offset: 2px; }

    /* ----- status line ----- */

    .status {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-bottom: 1px solid var(--border);
      color: var(--muted);
    }
    .status[data-kind='danger'] { color: var(--fg); background: var(--active-bg); }
    .status-text { flex: 1; min-width: 0; }
    .link-btn { flex: none; padding: 0 2px; border-radius: 4px; color: var(--fg); text-decoration: underline; text-underline-offset: 2px; }
    .link-btn.strong { color: var(--accent); font-weight: 600; }

    /* ----- filter ----- */

    .search { display: flex; align-items: center; gap: 2px; padding: 8px 8px 8px 10px; border-bottom: 1px solid var(--border); }
    .search-box { position: relative; display: flex; flex: 1; align-items: center; min-width: 0; margin-right: 4px; }
    .search-box > svg { position: absolute; left: 9px; width: 14px; height: 14px; color: var(--muted); pointer-events: none; }
    .search-input {
      width: 100%;
      height: 30px;
      padding: 0 52px 0 30px;
      border: 1px solid var(--border);
      border-radius: 8px;
      outline: none;
      background: var(--input-bg);
      color: var(--fg);
      font: inherit;
    }
    .search-input::placeholder { color: var(--muted); }
    .search-input:focus-visible { border-color: var(--focus); box-shadow: 0 0 0 1px var(--focus); }
    .search-count {
      position: absolute;
      right: 9px;
      color: var(--muted);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      pointer-events: none;
    }

    /* ----- list ----- */

    .scroll {
      position: relative;
      flex: 1;
      min-height: 0;
      padding: 6px;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
    }
    .list { margin: 0; padding: 0; list-style: none; }
    .list li { position: relative; display: flex; align-items: flex-start; border-radius: 6px; user-select: none; }
    .list li:hover { background: var(--hover); }
    .list li.current { background: var(--active-bg); }
    .list li.current:hover { background: var(--active-hover-bg); }

    .item {
      display: flex;
      flex: 1;
      gap: 8px;
      min-width: 0;
      padding: 6px 4px 6px 10px;
      border-radius: 6px;
      color: var(--muted);
      text-align: left;
    }
    li:hover .item, li.current .item { color: var(--fg); }
    .num { flex: none; min-width: 3.2em; font-variant-numeric: tabular-nums; opacity: 0.8; }
    .label { overflow-wrap: anywhere; }
    mark { border-radius: 2px; background: rgba(229, 72, 77, 0.35); color: var(--fg); }

    /* Floats over the end of the line, so it takes no width when hidden. */
    .row-tools {
      position: absolute;
      top: 0;
      right: 0;
      display: flex;
      border-radius: 6px;
      background: #2d2d2b;
      opacity: 0;
    }
    li.current .row-tools { background: #43292a; }
    li:hover .row-tools, li:has(:focus-visible) .row-tools { opacity: 1; }
    .row-btn { display: grid; place-items: center; width: 26px; height: 30px; border-radius: 6px; color: var(--muted); }
    .row-btn svg { width: 14px; height: 14px; }
    .row-btn:hover { color: var(--fg); }

    .empty { margin: 0; padding: 16px 10px; color: var(--muted); text-align: center; }

    /* ----- Claude ----- */

    .foot { padding: 8px; border-top: 1px solid var(--border); }
    .primary {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      height: 34px;
      border-radius: 8px;
      background: var(--accent);
      color: #fff;
      font-weight: 600;
    }
    .primary:hover:not(:disabled) { background: #d13a3f; }
    .primary:disabled { opacity: 0.4; cursor: default; }
    .primary svg { width: 14px; height: 14px; }

    /* ----- collapsed tab ----- */

    .tab {
      position: absolute;
      top: 80px;
      right: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      width: 28px;
      padding: 10px 0;
      border-right: 0;
      border-radius: 8px 0 0 8px;
      color: var(--muted);
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s, visibility 0.2s;
    }
    .tab:hover { color: var(--fg); }
    :host(.awake) .tab, .tab:focus-visible { opacity: 1; visibility: visible; }
    .tab-label { font-size: 12px; writing-mode: vertical-rl; }
  `;

  const HTML = `
    <div class="panel" hidden>
      <div class="resizer" role="separator" aria-orientation="vertical" aria-label="Resize panel" tabindex="0"></div>
      <div class="header">
        <h2 class="title"><button class="title-link" title="All episodes"></button><span class="count"></span></h2>
        <label class="switch"><input class="rec" type="checkbox" role="switch" checked><span class="track"></span></label>
        <button class="icon-btn collapse" aria-label="Collapse" title="Collapse (${SHORTCUT})">${ICON.collapse}</button>
      </div>
      <div class="status" role="status" aria-live="polite" hidden>
        <span class="status-text"></span>
        <button class="link-btn status-action" hidden></button>
        <button class="link-btn status-cancel" hidden>Cancel</button>
      </div>
      <div class="search">
        <div class="search-box">
          ${ICON.search}
          <input class="search-input" type="text" placeholder="Filter phrases" aria-label="Filter phrases" autocomplete="off" spellcheck="false">
          <span class="search-count"></span>
        </div>
        <button class="icon-btn copy" title="Copy lines" aria-label="Copy lines">${ICON.copy}</button>
        <button class="icon-btn export" title="Export as CSV" aria-label="Export as CSV">${ICON.download}</button>
        <button class="icon-btn danger delete" title="Delete all phrases of this episode" aria-label="Delete all phrases of this episode">${ICON.trash}</button>
      </div>
      <div class="scroll">
        <ul class="list"></ul>
        <p class="empty" hidden></p>
      </div>
      <div class="foot">
        <button class="primary claude">${ICON.sparkle}Find useful phrases with Claude</button>
      </div>
    </div>
    <button class="tab" aria-label="Show phrases" title="Show phrases (${SHORTCUT})">${ICON.expand}<span class="tab-label">Phrases</span></button>
  `;

  const host = document.createElement('div');
  host.id = 'netflix-phrases';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${STYLE}</style>${HTML}`;
  const $ = (selector) => root.querySelector(selector);
  const els = {
    panel: $('.panel'),
    resizer: $('.resizer'),
    title: $('.title-link'),
    count: $('.count'),
    rec: $('.rec'),
    collapse: $('.collapse'),
    status: $('.status'),
    statusText: $('.status-text'),
    statusAction: $('.status-action'),
    statusCancel: $('.status-cancel'),
    search: $('.search-input'),
    searchCount: $('.search-count'),
    copy: $('.copy'),
    export: $('.export'),
    delete: $('.delete'),
    scroll: $('.scroll'),
    list: $('.list'),
    empty: $('.empty'),
    claude: $('.claude'),
    tab: $('.tab'),
  };

  const ROW_COPY = svg(ICON.copy);
  const ROW_REMOVE = svg(ICON.remove);

  let videoId = null;
  // Stored entry of the video being watched.
  let entry = null;
  let enabled = true;
  // Panel settings, kept between visits like Outline's.
  let ui = { collapsed: true, width: 320 };
  // Keys of the subtitle lines on screen right now, to mark them.
  let cueKeys = [];
  let userScrolledAt = 0;
  let awakeTimer = null;
  let lastWake = 0;
  let noticeTimer = null;

  function svg(markup) {
    const template = document.createElement('template');
    template.innerHTML = markup;
    return template.content.firstElementChild;
  }

  function storageKey() {
    return 'v:' + videoId;
  }

  function query() {
    return els.search.value.trim().toLowerCase();
  }

  function allItems() {
    return entry ? byTime(entry.items) : [];
  }

  function visibleItems() {
    const q = query();
    const items = allItems();
    return q ? items.filter((item) => item.text.toLowerCase().includes(q)) : items;
  }

  function clampWidth(width) {
    return Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, Math.round(Number(width) || 320)));
  }

  /* ----- layout ----- */

  function apply() {
    els.panel.hidden = ui.collapsed;
    els.tab.hidden = !ui.collapsed;
    els.panel.style.setProperty('--width', `${ui.width}px`);
  }

  function setCollapsed(collapsed) {
    ui.collapsed = collapsed;
    chrome.storage.local.set({ panel: ui });
    apply();
    if (!collapsed) render({ jump: true });
  }

  /* ----- rendering ----- */

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
    const jump = document.createElement('button');
    jump.className = 'item';
    jump.dataset.action = 'seek';
    jump.title = 'Play from here';
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = formatTime(item.t);
    const label = document.createElement('span');
    label.className = 'label';
    appendHighlighted(label, item.text, q);
    jump.append(num, label);
    const tools = document.createElement('span');
    tools.className = 'row-tools';
    li.append(jump, tools);
    for (const [icon, action, title] of [[ROW_COPY, 'copy', 'Copy phrase'], [ROW_REMOVE, 'remove', 'Remove phrase']]) {
      const button = document.createElement('button');
      button.className = 'row-btn';
      button.dataset.action = action;
      button.title = title;
      button.setAttribute('aria-label', title);
      button.append(icon.cloneNode(true));
      tools.append(button);
    }
    return li;
  }

  function renderHeader() {
    const total = entry ? entry.items.length : 0;
    els.title.textContent = entry ? entry.title : 'Phrases';
    els.count.textContent = total ? String(total) : '';
    els.rec.checked = enabled;
    els.rec.parentElement.title = enabled ? 'Recording phrases. Click to pause' : 'Paused. Click to record phrases';
    els.rec.setAttribute('aria-label', 'Record phrases');
  }

  // The list is only built while the panel is open.
  function render({ jump = false } = {}) {
    renderHeader();
    if (ui.collapsed || !host.isConnected) return;

    const q = query();
    const items = visibleItems();
    const total = entry ? entry.items.length : 0;
    els.list.replaceChildren(...items.map((item) => row(item, q)));
    els.searchCount.textContent = q ? `${items.length}/${total}` : '';
    els.empty.hidden = items.length > 0;
    els.empty.textContent = q
      ? 'No phrases match.'
      : 'No phrases yet. Turn on subtitles and keep watching: every line you see is saved here.';
    for (const button of [els.claude, els.copy, els.export]) button.disabled = !items.length;
    els.delete.disabled = !total;
    markCurrent({ jump });
  }

  // The saved phrase for the subtitle on screen. After a rewind the same line
  // can match several times, so take the one closest to the playback time.
  function currentItemId() {
    if (!entry || !cueKeys.length) return null;
    const video = document.querySelector('video');
    const now = video ? video.currentTime : 0;
    let best = null;
    for (const item of entry.items) {
      const key = phraseKey(item.text);
      if (!cueKeys.some((cue) => key.includes(cue))) continue;
      if (!best || Math.abs(item.t - now) < Math.abs(best.t - now)) best = item;
    }
    return best && best.id;
  }

  // Mark the line on screen and keep it in view, unless the list was just
  // scrolled by hand. With jump (panel opened), go there at once, or to the
  // newest phrase if no line is on screen.
  function markCurrent({ jump = false } = {}) {
    if (ui.collapsed) return;
    const id = currentItemId();
    let current = null;
    for (const li of els.list.children) {
      const isCurrent = li.dataset.id === id;
      li.classList.toggle('current', isCurrent);
      if (isCurrent) current = li;
    }
    const scroll = els.scroll;
    if (!jump && Date.now() - userScrolledAt < 4000) return;
    if (current) {
      const top = current.offsetTop;
      const visible = top >= scroll.scrollTop && top + current.offsetHeight <= scroll.scrollTop + scroll.clientHeight;
      if (jump || !visible) {
        scroll.scrollTo({ top: top - (scroll.clientHeight - current.offsetHeight) / 2, behavior: jump ? 'auto' : 'smooth' });
      }
    } else if (jump) {
      scroll.scrollTop = scroll.scrollHeight;
    }
  }

  /* ----- status line ----- */

  // One line under the header for results, undo and confirmations, as in
  // Outline. A notice with an action stays longer; a confirmation stays.
  function showStatus(text, { action = null, onAction = null, cancel = false, kind = '', sticky = false } = {}) {
    clearTimeout(noticeTimer);
    els.statusText.textContent = text;
    els.status.dataset.kind = kind;
    els.statusAction.hidden = !action;
    els.statusAction.textContent = action || '';
    els.statusAction.classList.toggle('strong', kind === 'danger');
    els.statusAction.onclick = onAction
      ? () => {
          hideStatus();
          onAction();
        }
      : null;
    els.statusCancel.hidden = !cancel;
    els.status.hidden = false;
    if (!sticky) noticeTimer = setTimeout(hideStatus, action ? NOTICE_MS + 2000 : NOTICE_MS);
  }

  function hideStatus() {
    clearTimeout(noticeTimer);
    els.status.hidden = true;
  }

  /* ----- actions ----- */

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for pages whose permissions policy blocks the async API.
      const area = document.createElement('textarea');
      area.value = text;
      root.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
  }

  function seek(seconds) {
    window.dispatchEvent(new CustomEvent('netflix-phrases:seek', { detail: Math.max(0, seconds - SEEK_LEAD) }));
  }

  async function removeItem(itemId) {
    // Read fresh: the recorder may have saved phrases since the last render.
    const key = storageKey();
    const stored = (await chrome.storage.local.get(key))[key];
    const item = stored && stored.items.find((i) => i.id === itemId);
    if (!item) return;
    stored.items = stored.items.filter((i) => i !== item);
    if (stored.items.length) await chrome.storage.local.set({ [key]: stored });
    else await chrome.storage.local.remove(key);

    showStatus('Phrase removed.', {
      action: 'Undo',
      onAction: async () => {
        const fresh = (await chrome.storage.local.get(key))[key] || { ...stored, items: [] };
        if (!fresh.items.some((i) => i.id === item.id)) fresh.items.push(item);
        await chrome.storage.local.set({ [key]: fresh });
      },
    });
  }

  async function deleteEpisode() {
    const key = storageKey();
    const stored = (await chrome.storage.local.get(key))[key];
    if (!stored) return;
    await chrome.storage.local.remove(key);
    showStatus(`Deleted ${plural(stored.items.length, 'phrase')}.`, {
      action: 'Undo',
      onAction: () => chrome.storage.local.set({ [key]: stored }),
    });
  }

  function download(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    root.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ----- events ----- */

  // Keep Netflix from treating clicks and keys in the panel as player
  // controls (space pauses, a click toggles play, F goes fullscreen).
  for (const type of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'keyup', 'keypress', 'wheel']) {
    host.addEventListener(type, (event) => event.stopPropagation());
  }

  els.tab.addEventListener('click', () => setCollapsed(false));
  els.collapse.addEventListener('click', () => setCollapsed(true));
  els.title.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'openLibrary', videoId }));
  els.rec.addEventListener('change', () => chrome.storage.local.set({ enabled: els.rec.checked }));

  els.search.addEventListener('input', () => render());
  els.search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      els.search.value = '';
      els.search.blur();
      render({ jump: true });
    }
  });

  for (const type of ['wheel', 'touchmove']) {
    els.scroll.addEventListener(type, () => (userScrolledAt = Date.now()), { passive: true });
  }

  els.list.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const itemId = button.closest('li').dataset.id;
    const item = entry && entry.items.find((i) => i.id === itemId);
    if (!item) return;
    if (button.dataset.action === 'seek') seek(item.t);
    else if (button.dataset.action === 'remove') removeItem(itemId);
    else copyText(item.text).then(() => showStatus('Phrase copied.'));
  });

  els.copy.addEventListener('click', async () => {
    const items = visibleItems();
    await copyText(items.map((item) => item.text).join('\n'));
    showStatus(`${plural(items.length, 'line')} copied.`);
  });

  els.export.addEventListener('click', () => {
    download(safeFileName(entry.title) + '.csv', toCsv([{ ...entry, items: visibleItems() }]));
  });

  els.delete.addEventListener('click', () => {
    showStatus(`Delete all ${plural(entry.items.length, 'phrase')} of this episode?`, {
      action: 'Delete',
      onAction: deleteEpisode,
      cancel: true,
      kind: 'danger',
      sticky: true,
    });
  });
  els.statusCancel.addEventListener('click', hideStatus);

  els.claude.addEventListener('click', async () => {
    const prompt = claudePrompt(entry.title, visibleItems());
    // Copied too, in case the chat opens empty (long episode).
    await copyText(prompt);
    window.open(claudeUrl(prompt), '_blank', 'noopener');
    showStatus(`Opened Claude. If the chat is empty, paste with ${PASTE_KEY}.`);
  });

  // Drag the left edge to resize; the pointer capture keeps the drag alive
  // when the pointer leaves the thin handle.
  let dragging = false;
  els.resizer.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging = true;
    els.resizer.setPointerCapture(event.pointerId);
    els.panel.classList.add('resizing');
  });
  els.resizer.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    ui.width = clampWidth(host.getBoundingClientRect().right - RIGHT_GAP - event.clientX);
    apply();
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    els.panel.classList.remove('resizing');
    chrome.storage.local.set({ panel: ui });
  };
  els.resizer.addEventListener('pointerup', endDrag);
  els.resizer.addEventListener('lostpointercapture', endDrag);
  els.resizer.addEventListener('keydown', (event) => {
    const step = event.key === 'ArrowLeft' ? 16 : event.key === 'ArrowRight' ? -16 : 0;
    if (!step) return;
    event.preventDefault();
    ui.width = clampWidth(ui.width + step);
    apply();
    chrome.storage.local.set({ panel: ui });
  });

  // Cmd/Ctrl+Shift+O opens and closes the panel, as in Outline. Capture
  // phase on window, to see it before Netflix's own key handlers.
  window.addEventListener(
    'keydown',
    (event) => {
      if (!host.isConnected) return;
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.altKey || event.code !== 'KeyO') return;
      event.preventDefault();
      event.stopPropagation();
      setCollapsed(!ui.collapsed);
    },
    true
  );

  // Show the tab while the mouse moves, like Netflix's own controls.
  function wake() {
    const now = Date.now();
    if (now - lastWake < 200) return;
    lastWake = now;
    host.classList.add('awake');
    clearTimeout(awakeTimer);
    awakeTimer = setTimeout(() => host.classList.remove('awake'), IDLE_MS);
  }
  document.addEventListener('mousemove', wake, { passive: true });

  recorder.onCue = (raw) => {
    cueKeys = splitCue(raw).map(phraseKey).filter(Boolean);
    markCurrent();
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.enabled) enabled = changes.enabled.newValue !== false;
    if (videoId && changes[storageKey()]) entry = changes[storageKey()].newValue || null;
    if (changes.enabled || (videoId && changes[storageKey()])) render();
  });

  chrome.storage.local.get({ enabled: true, panel: ui }, (data) => {
    enabled = data.enabled;
    ui = { collapsed: data.panel.collapsed !== false, width: clampWidth(data.panel.width) };
    apply();
    render({ jump: true });
  });

  async function loadEntry() {
    const key = storageKey();
    const stored = (await chrome.storage.local.get(key))[key];
    if (key === storageKey()) {
      entry = stored || null;
      render({ jump: true });
    }
  }

  // Keep the panel inside the player (so it shows in fullscreen too); Netflix
  // rebuilds the player when the episode or page changes.
  function attach() {
    if (!chrome.runtime?.id) {
      clearInterval(timer);
      host.remove();
      return;
    }
    const id = recorder.currentVideoId();
    const player = id && (document.querySelector('[data-uia="player"]') || document.querySelector('.watch-video'));
    if (!player) {
      if (host.isConnected) host.remove();
      videoId = null;
      return;
    }
    if (host.parentElement !== player) {
      player.append(host);
      render({ jump: true });
    }
    if (id !== videoId) {
      videoId = id;
      entry = null;
      els.search.value = '';
      hideStatus();
      loadEntry();
    }
  }

  apply();
  const timer = setInterval(attach, 1000);
  attach();
})();
