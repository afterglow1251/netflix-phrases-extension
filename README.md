# Netflix Phrases

Chrome/Edge extension that saves the subtitle lines of the parts of Netflix
shows you actually watch. Then it hands them to Claude to pick out the phrases
worth learning.

## Install

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose this folder.
4. Reload any open Netflix tab. Do this again every time you reload or update
   the extension: a tab opened before that doesn't record.

## Use

1. Watch something on Netflix with subtitles turned on.
2. Move the mouse over the player: a slim **Phrases** tab shows on the right
   edge (it hides again when the mouse rests). Click it, or press
   Cmd/Ctrl+Shift+O, to open the panel. Its layout follows Claude Chat
   Outline: drag its left edge to resize, the arrow in its header collapses it,
   and it stays as you left it.
3. The line on screen right now is marked. Click any line to play the video
   from there; hover it to copy or remove it.
4. Click **Find useful phrases with Claude**. Claude opens with the prompt and
   the lines already typed in; send it to get the idioms, phrasal verbs and
   collocations with meanings. The prompt is also copied, in case a very long
   episode doesn't fit in the link: then paste it.

In the panel header: the episode title opens the page with all episodes, the
switch pauses or resumes recording. Next to the filter: copy the lines,
export them as CSV, or delete **all** phrases of this episode (it asks first,
and can be undone).

The toolbar icon also opens the all-episodes page, with search and CSV export.

What it does with the subtitles:

- Saves only lines that appear on screen, so skipped parts are not included.
- Removes sound descriptions (`[door creaks]`), speaker labels and `♪`.
- Splits lines with two speakers and joins sentences split over two cues.
- Skips lines it already saved, for example when you rewind.

To change what Claude is asked, edit `CLAUDE_PROMPT` in `src/phrases.js`.

## Files

- `src/content.js`: records subtitles from the player.
- `src/ui.js`: the panel on the player.
- `src/seek.js`: jumps the video to a line, through Netflix's player API.
- `src/phrases.js`: text cleanup, CSV and the Claude prompt, shared by all.
- `library/`: the all-episodes page.
- `background.js`: opens that page from the toolbar icon.

## Tests

```sh
node --test test/*.test.js
```
