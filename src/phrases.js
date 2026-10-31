// Pure text helpers shared by the content scripts, the all-episodes page and
// the tests: a global `Phrases` in the browser, module.exports in Node.
(function () {
  const SENTENCE_END = /[.?!…"'”»)\]—–-]$/;

  // One subtitle cue can hold several speakers ("- Hi.\n- Hello."), sound
  // descriptions ("[door creaks]") and speaker labels ("JOHN: ..."). Turn it
  // into clean, separate phrases.
  function splitCue(raw) {
    const lines = String(raw || '')
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const groups = [];
    for (const line of lines) {
      if (/^[-–—]\s*/.test(line) || groups.length === 0) {
        groups.push(line.replace(/^[-–—]\s*/, ''));
      } else {
        groups[groups.length - 1] += ' ' + line;
      }
    }

    return groups.map(cleanPhrase).filter((p) => /\p{L}/u.test(p));
  }

  function cleanPhrase(text) {
    return text
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[♪♫]/g, ' ')
      .replace(/^\s*[\p{Lu}][\p{Lu}0-9 .'-]*:\s*/u, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Every new cue is compared with all saved phrases, so remember their keys.
  const keyCache = new Map();

  // Comparison key: case, punctuation and spacing don't matter.
  function phraseKey(text) {
    let key = keyCache.get(text);
    if (key !== undefined) return key;
    const words = text
      .toLowerCase()
      .replace(/[’`]/g, "'")
      .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    key = words ? ' ' + words + ' ' : '';
    if (keyCache.size > 20000) keyCache.clear();
    keyCache.set(text, key);
    return key;
  }

  // A phrase is already known if it, as whole words, appears in a saved one.
  // This also covers re-watching a scene whose cues were merged before.
  function isKnown(text, items) {
    const key = phraseKey(text);
    if (!key) return true;
    return items.some((item) => phraseKey(item.text).includes(key));
  }

  // Netflix often splits one sentence over two cues. Join the new cue to the
  // previous one if that one was left open and the new one follows closely.
  function continuesPrevious(prev, time) {
    if (!prev || SENTENCE_END.test(prev.text)) return false;
    const gap = time - prev.lastTime;
    return gap >= 0 && gap < 6;
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }

  function toCsv(videos) {
    const cell = (value) => '"' + String(value).replace(/"/g, '""') + '"';
    const rows = [['Title', 'Time', 'Phrase'].map(cell).join(',')];
    for (const video of videos) {
      for (const item of video.items) {
        rows.push([video.title, formatTime(item.t), item.text].map(cell).join(','));
      }
    }
    // BOM so Excel opens the file as UTF-8.
    return '﻿' + rows.join('\r\n') + '\r\n';
  }

  // Edit this to change what Claude does with your phrases.
  const CLAUDE_PROMPT = `Below are subtitle lines from the Netflix show "{title}" that I watched. I'm learning English.

Pick the phrases worth learning: idioms, phrasal verbs, collocations and natural everyday expressions. Skip names, single basic words and phrases any beginner already knows.

For each one give:
- the phrase
- a short meaning in simple English
- the subtitle line it came from

Group them by type.

Subtitles:
{lines}`;

  function claudePrompt(title, items) {
    const lines = items.map((item) => item.text).join('\n');
    // Function replacements, so "$" in a title or line is kept as is.
    return CLAUDE_PROMPT.replace('{title}', () => title).replace('{lines}', () => lines);
  }

  // claude.ai opens a new chat with ?q= already typed in. Very long prompts
  // don't fit in a link, so then it opens empty and the prompt gets pasted.
  const CLAUDE_URL = 'https://claude.ai/new';
  const MAX_URL_LENGTH = 12000;

  function claudeUrl(prompt) {
    const url = CLAUDE_URL + '?q=' + encodeURIComponent(prompt);
    return url.length <= MAX_URL_LENGTH ? url : CLAUDE_URL;
  }

  function plural(n, word) {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
  }

  // Phrases in the order they appear in the episode.
  function byTime(items) {
    return [...items].sort((a, b) => a.t - b.t);
  }

  function safeFileName(name) {
    return name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
  }

  const api = {
    splitCue, cleanPhrase, phraseKey, isKnown, continuesPrevious, formatTime, toCsv,
    claudePrompt, claudeUrl, plural, byTime, safeFileName,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.Phrases = api;
})();
