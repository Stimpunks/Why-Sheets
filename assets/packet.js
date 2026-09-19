/**
 * packet.js — join the chosen sheets into one PDF, in the browser.
 *
 * THIS IS THE WHOLE POINT OF THE PRESS. Everything else here is a website. The
 * difference between "nine pages you could each print separately" and "the
 * folder you carry into the room" is assembly, pagination and a cover page, and
 * that is the part that eats an evening.
 *
 * WHY THE PDFs ARE BUILT AHEAD OF TIME AND ONLY JOINED HERE
 * Laying out a document is typesetting, and a browser doing it on the fly at
 * eleven at night on somebody's phone is a bad place to discover a widow, a
 * clipped table or a font that did not load. So every sheet is rendered to PDF
 * at build time by real Chrome, at 190x259mm, checked, and committed. What
 * happens here is only concatenation: load those files, copy their pages into
 * one document, draw a cover, number the result. Nothing is re-flowed, so the
 * page you get is the page that was measured.
 *
 * NOTHING LEAVES THE DEVICE. These are the same PDFs anyone can download. They
 * are fetched, joined and handed back. There is no upload, no account, no
 * analytics, and no record anywhere of which sheets somebody put together —
 * which, for a packet about a particular child at a particular school, matters
 * more than it does for most software.
 *
 * pdf-lib (MIT, vendored at assets/vendor/) is imported only when the button is
 * pressed. It is half a megabyte, and a reader who never builds a packet should
 * never pay for it. See ATTRIBUTIONS.md.
 */
import { get, remove, setOrder, onChange } from './selection.js';

const listEl = document.querySelector('[data-packet-list]');
const buildEl = document.querySelector('[data-build]');
const statusEl = document.querySelector('[data-status]');
const coverFields = [...document.querySelectorAll('[data-cover]')];

let library = { sheets: [], broadsides: [] };
let byline = new Map();

const say = (message, state = 'idle') => {
  statusEl.textContent = message;
  statusEl.dataset.state = state;
};

/* ── the list ───────────────────────────────────────────────────────────── */

async function loadLibrary() {
  try {
    const res = await fetch('/assets/library.json');
    library = await res.json();
    byline = new Map(library.sheets.map((s) => [s.slug, s]));
  } catch {
    say('Could not load the list of sheets. Reload the page, or use the PDF on each sheet.', 'error');
  }
}

function renderList() {
  const chosen = get().filter((slug) => byline.has(slug));
  /* A slug that no longer exists — a sheet renamed since somebody's last visit —
     is dropped rather than shown as a broken row. */
  if (chosen.length !== get().length) setOrder(chosen);

  if (!chosen.length) {
    listEl.innerHTML =
      '<li><span class="name">Nothing picked yet.</span> <span class="pages">' +
      '<a href="/">Go to the library</a> and tick the sheets you need.</span></li>';
    buildEl.disabled = true;
    say('Pick some sheets and this builds a PDF.');
    return;
  }

  listEl.innerHTML = chosen
    .map((slug, i) => {
      const s = byline.get(slug);
      return (
        '<li data-row="' + slug + '">' +
        '<span class="grip">' + (i + 1) + '.</span>' +
        '<span class="name">' + escapeText(s.title) + '</span>' +
        (s.version ? '<span class="pages">v' + escapeText(s.version) + '</span>' : '') +
        '<span class="move">' +
        '<button type="button" class="icon-button" data-up="' + slug + '"' +
        (i === 0 ? ' disabled' : '') + ' aria-label="Move ' + escapeText(s.title) + ' earlier">↑</button>' +
        '<button type="button" class="icon-button" data-down="' + slug + '"' +
        (i === chosen.length - 1 ? ' disabled' : '') + ' aria-label="Move ' + escapeText(s.title) + ' later">↓</button>' +
        '<button type="button" class="icon-button" data-drop="' + slug + '"' +
        ' aria-label="Remove ' + escapeText(s.title) + ' from the packet">✕</button>' +
        '</span></li>'
      );
    })
    .join('');

  buildEl.disabled = false;
  say(
    chosen.length === 1
      ? 'One sheet, plus a cover page.'
      : chosen.length + ' sheets, plus a cover page, numbered straight through.'
  );
}

const escapeText = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

listEl.addEventListener('click', (e) => {
  const up = e.target.closest('[data-up]');
  const down = e.target.closest('[data-down]');
  const drop = e.target.closest('[data-drop]');
  if (!up && !down && !drop) return;

  const list = get();
  if (drop) {
    remove(drop.dataset.drop);
    return;
  }
  const slug = (up || down).dataset[up ? 'up' : 'down'];
  const i = list.indexOf(slug);
  const j = up ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  setOrder(list);

  /* Keep the keyboard where the reader left it: after a move, focus the same
     control on the row that moved, not the top of the list. */
  requestAnimationFrame(() => {
    const attr = up ? 'data-up' : 'data-down';
    document.querySelector('[' + attr + '="' + CSS.escape(slug) + '"]')?.focus();
  });
});

/* ── cover fields, remembered on this device only ───────────────────────── */

const COVER_KEY = 'whysheets.cover.v1';

function loadCover() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(COVER_KEY) || '{}');
  } catch {
    /* fine — the fields simply start empty */
  }
  for (const field of coverFields) {
    if (saved[field.dataset.cover]) field.value = saved[field.dataset.cover];
  }
  const date = document.querySelector('[data-cover="date"]');
  if (date && !date.value) date.value = new Date().toISOString().slice(0, 10);
}

function saveCover() {
  const out = {};
  for (const f of coverFields) out[f.dataset.cover] = f.value;
  try {
    localStorage.setItem(COVER_KEY, JSON.stringify(out));
  } catch {
    /* nothing to do; the values are still in the form */
  }
}

for (const f of coverFields) f.addEventListener('input', saveCover);

/* ── building ───────────────────────────────────────────────────────────── */

/* The standard PDF fonts are WinAnsi, which has no curly quotes, no em dash and
   no ellipsis. Left alone, pdf-lib throws on the first apostrophe somebody types
   into "Prepared for". Rather than embedding a font for four lines of cover
   text, the text is folded down to characters the standard font can draw. */
const WINANSI = {
  '‘': "'", '’': "'", '‚': ',', '“': '"', '”': '"',
  '–': '-', '—': '—', '…': '...', ' ': ' ',
  '•': '•', '−': '-', 'ʼ': "'",
};
const flatten = (s) =>
  String(s || '')
    .replace(/[‘’‚“”–… −ʼ]/g, (c) => WINANSI[c] ?? c)
    /* Anything still outside Latin-1 would throw at draw time. A question mark
       is a poor substitute, but a cover page that renders beats one that does
       not exist — and the sheets themselves are unaffected, being real PDFs. */
    .replace(/[^ -ÿ—•]/g, '?');

async function build() {
  const chosen = get().filter((slug) => byline.has(slug));
  if (!chosen.length) return;

  buildEl.disabled = true;
  say('Loading pdf-lib…', 'working');

  let PDFLib;
  try {
    PDFLib = await import('/assets/vendor/pdf-lib.esm.min.js');
  } catch {
    say(
      'The PDF assembler could not load. Every sheet still has its own PDF on its own page — ' +
        'those always work.',
      'error'
    );
    buildEl.disabled = false;
    return;
  }

  const { PDFDocument, StandardFonts, rgb } = PDFLib;

  try {
    const out = await PDFDocument.create();
    const body = await out.embedFont(StandardFonts.Helvetica);
    const bold = await out.embedFont(StandardFonts.HelveticaBold);

    /* 190 x 259 mm in PostScript points: the intersection of A4 and US Letter,
       so one file prints correctly on either without scaling.
       MEASURED FROM THE FIRST SHEET RATHER THAN COMPUTED, because Chrome's own
       rounding lands on 539.04 x 733.92 while the arithmetic here gives
       538.58 x 734.17. A 0.16 mm difference is invisible on paper, but a PDF
       whose pages are not all the same size is one some viewers offer to
       "fit to page" — and a scaled packet is the thing this page exists to
       avoid. */
    const firstDoc = await PDFDocument.load(
      await (await fetch(byline.get(chosen[0]).pdf)).arrayBuffer()
    );
    const firstSize = firstDoc.getPage(0).getSize();
    const PAGE = [firstSize.width, firstSize.height];
    const MARGIN = (16 / 25.4) * 72;

    const cover = { };
    for (const f of coverFields) cover[f.dataset.cover] = flatten(f.value.trim());

    /* ── the cover ─────────────────────────────────────────────────────── */
    const page = out.addPage(PAGE);
    const [W, H] = PAGE;
    const ink = rgb(0.08, 0.086, 0.102);
    const soft = rgb(0.35, 0.36, 0.39);
    const spot = rgb(0.604, 0.09, 0.314);

    page.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: spot });

    let y = H - MARGIN - 34;
    page.drawText('WHY SHEETS', { x: MARGIN, y, size: 10, font: bold, color: spot, characterSpacing: 2 });

    y -= 46;
    const heading = cover.for ? 'Prepared for ' + cover.for : 'A packet of Why Sheets';
    for (const line of wrap(heading, bold, 26, W - MARGIN * 2)) {
      page.drawText(line, { x: MARGIN, y, size: 26, font: bold, color: ink });
      y -= 32;
    }

    if (cover.note) {
      y -= 8;
      for (const line of wrap(cover.note, body, 12.5, W - MARGIN * 2)) {
        page.drawText(line, { x: MARGIN, y, size: 12.5, font: body, color: soft });
        y -= 17;
      }
    }

    y -= 26;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: W - MARGIN, y },
      thickness: 0.75,
      color: rgb(0.83, 0.82, 0.8),
    });

    y -= 28;
    page.drawText('In this packet', { x: MARGIN, y, size: 11, font: bold, color: soft });
    y -= 22;

    /* Page numbers on the contents list are filled in after the merge, when the
       real offsets are known. A contents list with the wrong numbers on it is
       worse than none — somebody turns to page 7 in a meeting and finds a
       different argument. */
    const contents = [];
    for (const slug of chosen) {
      const s = byline.get(slug);
      contents.push({ y, title: flatten(s.title), version: s.version });
      page.drawText(flatten(s.title), { x: MARGIN, y, size: 12.5, font: body, color: ink });
      y -= 19;
      if (y < MARGIN + 120) break;
    }

    let footY = MARGIN + 46;
    page.drawLine({
      start: { x: MARGIN, y: footY + 18 },
      end: { x: W - MARGIN, y: footY + 18 },
      thickness: 0.75,
      color: rgb(0.83, 0.82, 0.8),
    });
    const stamp = [cover.by && 'Prepared by ' + cover.by, cover.date && niceDate(cover.date)]
      .filter(Boolean)
      .join('  ·  ');
    if (stamp) {
      page.drawText(stamp, { x: MARGIN, y: footY, size: 10, font: body, color: soft });
      footY -= 15;
    }
    page.drawText(
      'Free to print, change and share. CC0 1.0. whysheet.press',
      { x: MARGIN, y: footY, size: 9, font: body, color: soft }
    );
    footY -= 13;
    page.drawText('Quoted material belongs to the people who wrote it.', {
      x: MARGIN, y: footY, size: 9, font: body, color: soft,
    });

    /* ── the sheets ────────────────────────────────────────────────────── */
    let n = 0;
    const startPages = [];
    for (const slug of chosen) {
      n++;
      say('Adding ' + byline.get(slug).title + ' (' + n + ' of ' + chosen.length + ')…', 'working');
      /* The first sheet was already loaded to measure the page; not fetched
         a second time. */
      const src =
        n === 1
          ? firstDoc
          : await PDFDocument.load(await (await fetch(byline.get(slug).pdf)).arrayBuffer());
      /* The number the READER will see, which is not the PDF's page index.
         The cover is not page 1 of anything, so the footers number the sheets
         from 1 starting after it — and the contents list has to agree, or
         somebody turns to "page 13" in a meeting and finds the page whose own
         footer says 12. It did exactly that on the first build. The count
         BEFORE this sheet is added is already the reader's number for its
         first page. */
      startPages.push(out.getPageCount());
      const copied = await out.copyPages(src, src.getPageIndices());
      for (const p of copied) out.addPage(p);
    }

    /* Now the contents list can be truthful. */
    contents.forEach((entry, i) => {
      if (startPages[i] === undefined) return;
      const text = 'page ' + startPages[i];
      const width = body.widthOfTextAtSize(text, 10);
      page.drawText(text, {
        x: W - MARGIN - width,
        y: entry.y,
        size: 10,
        font: body,
        color: soft,
      });
    });

    /* ── continuous numbering ──────────────────────────────────────────── */
    const pages = out.getPages();
    pages.forEach((p, i) => {
      if (i === 0) return; /* the cover is not page 1 of anything */
      const text = String(i) + ' of ' + (pages.length - 1);
      const size = 8.5;
      const width = body.widthOfTextAtSize(text, size);
      const { width: pw } = p.getSize();
      p.drawText(text, {
        x: (pw - width) / 2,
        y: (8 / 25.4) * 72,
        size,
        font: body,
        color: rgb(0.35, 0.36, 0.39),
      });
    });

    const blob = new Blob([await out.save()], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName(cover, chosen.length);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);

    say(
      'Done — ' + (pages.length - 1) + ' pages plus a cover, in ' + a.download + '. ' +
        'Print it double-sided and it is a folder.'
    );
  } catch (err) {
    say(
      'Something went wrong assembling the packet: ' + (err && err.message ? err.message : err) +
        '. Every sheet still has its own PDF on its own page.',
      'error'
    );
  } finally {
    buildEl.disabled = false;
  }
}

function wrap(text, font, size, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? line + ' ' + word : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function niceDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fileName(cover, count) {
  const who = (cover.for || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const date = (cover.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  return ['why-sheets', who || count + '-sheets', date].filter(Boolean).join('-') + '.pdf';
}

buildEl.addEventListener('click', build);

/* ── go ─────────────────────────────────────────────────────────────────── */

onChange(renderList);
loadCover();
await loadLibrary();
renderList();
