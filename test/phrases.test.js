const test = require('node:test');
const assert = require('node:assert');
const P = require('../src/phrases.js');

test('splitCue joins wrapped lines and splits speakers', () => {
  assert.deepStrictEqual(P.splitCue('I was going\nto the store.'), ['I was going to the store.']);
  assert.deepStrictEqual(P.splitCue('- Hi there.\n- Hello.'), ['Hi there.', 'Hello.']);
  assert.deepStrictEqual(P.splitCue('-Where?\n-Over\nthere.'), ['Where?', 'Over there.']);
});

test('splitCue removes sound descriptions, labels and music marks', () => {
  assert.deepStrictEqual(P.splitCue('[door creaks]'), []);
  assert.deepStrictEqual(P.splitCue('(sighs) Fine.'), ['Fine.']);
  assert.deepStrictEqual(P.splitCue('JOHN: Get out of here!'), ['Get out of here!']);
  assert.deepStrictEqual(P.splitCue('♪ Here comes the sun ♪'), ['Here comes the sun']);
  assert.deepStrictEqual(P.splitCue(''), []);
  assert.deepStrictEqual(P.splitCue('...'), []);
});

test('isKnown matches whole words, ignoring case and punctuation', () => {
  const items = [{ text: 'I was going to the store.' }];
  assert.strictEqual(P.isKnown('I was going to', items), true);
  assert.strictEqual(P.isKnown('the STORE!', items), true);
  assert.strictEqual(P.isKnown('the stor', items), false);
  assert.strictEqual(P.isKnown('No.', [{ text: 'I know.' }]), false);
});

test('continuesPrevious only joins open sentences that follow closely', () => {
  assert.strictEqual(P.continuesPrevious({ text: 'I was going', lastTime: 10 }, 12), true);
  assert.strictEqual(P.continuesPrevious({ text: 'I was going.', lastTime: 10 }, 12), false);
  assert.strictEqual(P.continuesPrevious({ text: 'I was going', lastTime: 10 }, 20), false);
  assert.strictEqual(P.continuesPrevious({ text: 'I was going', lastTime: 10 }, 5), false);
  assert.strictEqual(P.continuesPrevious(null, 5), false);
});

test('formatTime', () => {
  assert.strictEqual(P.formatTime(5), '0:05');
  assert.strictEqual(P.formatTime(125.7), '2:05');
  assert.strictEqual(P.formatTime(3725), '1:02:05');
});

test('toCsv escapes quotes and adds a BOM', () => {
  const csv = P.toCsv([{ title: 'Show · E1', items: [{ t: 65, text: 'He said "no", right?' }] }]);
  assert.strictEqual(
    csv,
    '﻿"Title","Time","Phrase"\r\n"Show · E1","1:05","He said ""no"", right?"\r\n'
  );
});

test('claudeUrl prefills short prompts and falls back for long ones', () => {
  const prompt = P.claudePrompt('Show $1', [{ text: 'Hang in there.' }]);
  assert.ok(prompt.includes('"Show $1"') && prompt.endsWith('Hang in there.'));
  assert.strictEqual(P.claudeUrl(prompt), 'https://claude.ai/new?q=' + encodeURIComponent(prompt));
  assert.strictEqual(P.claudeUrl('x'.repeat(20000)), 'https://claude.ai/new');
});
