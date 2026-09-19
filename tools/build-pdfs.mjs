#!/usr/bin/env node
/**
 * build-pdfs.mjs — print every sheet and every broadside to PDF, once, here.
 *
 * WHY AT BUILD TIME AND NOT IN THE READER'S BROWSER
 * Laying out a long document is typesetting. Doing it live, on an unknown device,
 * at the moment somebody needs the file, is a bad place to find out that a
 * webfont did not load, a table was clipped, or a heading ended up alone at the
 * foot of a page. Rendering here means one known browser, one known page size,
 * a result that can be measured, and a file that is byte-identical for everyone.
 * The packet builder in the browser then does nothing but concatenate — no
 * reflow, so the page somebody prints is the page that was checked.
 *
 * THE PAGE IS 190 x 259 mm AND THAT NUMBER IS NOT A PREFERENCE.
 * It is the intersection of A4 (210x297) and US Letter (216x279). A PDF sized to
 * either one is a different physical object depending on which country the
 * reader is in: printed on the other paper it is scaled, or it spills, or the
 * last lines are clipped. Sized to the overlap it prints at actual size on both.
 * The Stimpunks broadsides settled this the expensive way — a sheet that said
 * "two-sided single sheet" in its own copy while printing on three sides of US
 * Letter and two of A4, for a year, with nothing in the repository able to see
 * it. Hence the check below: the page count is asserted, not assumed.
 *
 *     node tools/build-pdfs.mjs                # everything that changed
 *     node tools/build-pdfs.mjs --all          # rebuild all of them
 *     node tools/build-pdfs.mjs eye-contact    # just these
 *     node tools/build-pdfs.mjs --check        # report staleness, write nothing
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { launch, countPages } from './lib/chrome.mjs';
import { serve } from './lib/serve.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'sheets.json'), 'utf8'));
const args = process.argv.slice(2);
const checking = args.includes('--check');
const forcing = args.includes('--all');
const named = args.filter((a) => !a.startsWith('--'));

const OUT = path.join(REPO, 'pdf');
const STATE = path.join(OUT, 'index.json');
fs.mkdirSync(OUT, { recursive: true });

const previous = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { entries: {} };

/* A job's fingerprint is the page it is printed from plus the stylesheet that
   lays it out. Either changing changes the paper, so either changing rebuilds. */
const pressCss = fs.readFileSync(path.join(REPO, 'assets', 'press.css'), 'utf8');
const digest = (...parts) => crypto.createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 16);

const jobs = [];

for (const s of manifest.sheets) {
  const page = path.join(REPO, 'sheets', s.slug, 'index.html');
  if (!fs.existsSync(page)) {
    console.error('  MISSING  sheets/' + s.slug + '/index.html — run tools/build-site.mjs first');
    process.exit(1);
  }
  jobs.push({
    id: s.slug,
    kind: 'sheet',
    title: s.title,
    page,
    url: '/sheets/' + s.slug + '/',
    out: path.join(OUT, s.slug + '.pdf'),
    hash: digest(fs.readFileSync(page, 'utf8'), pressCss),
    /* A running footer, because a page of a printed packet that has come loose
       should still say what it is and where the rest of it lives. No page
       numbers here: the packet builder numbers the whole document straight
       through, and two numbering schemes on one page is worse than one. */
    footer:
      '<div style="width:100%;font:7.5pt -apple-system,Helvetica,sans-serif;color:#555;' +
      'padding:0 16mm;display:flex;justify-content:space-between;">' +
      '<span>' + esc(s.title) + ' · a Stimpunks Why Sheet' + (s.version ? ' · v' + esc(s.version) : '') + '</span>' +
      '<span>whysheet.press · CC0</span></div>',
    expect: null,
  });
}

for (const b of manifest.broadsides) {
  const page = path.join(REPO, 'broadsides', b.slug, 'print.html');
  if (!fs.existsSync(page)) {
    console.error('  MISSING  broadsides/' + b.slug + '/print.html — run tools/build-site.mjs first');
    process.exit(1);
  }
  jobs.push({
    id: 'broadside-' + b.slug,
    kind: 'broadside',
    title: b.title,
    page,
    url: '/broadsides/' + b.slug + '/print.html',
    out: path.join(OUT, 'broadside-' + b.slug + '.pdf'),
    hash: digest(fs.readFileSync(page, 'utf8')),
    /* No footer at all. A broadside is a designed object with a registration bar
       at the head and its own colophon; a browser-drawn strip across the bottom
       would be somebody else's furniture on our sheet. */
    footer: null,
    /* One sheet, printed both sides. Two pages, or it is not a broadside. */
    expect: 2,
  });
}

const selected = named.length ? jobs.filter((j) => named.includes(j.id) || named.includes(j.id.replace(/^broadside-/, ''))) : jobs;
if (!selected.length) {
  console.error('  Nothing matched: ' + named.join(', '));
  process.exit(1);
}

const stale = selected.filter(
  (j) => forcing || !fs.existsSync(j.out) || previous.entries[j.id]?.hash !== j.hash
);

if (!stale.length) {
  console.log('  ' + selected.length + ' PDFs, all current.');
  process.exit(0);
}

if (checking) {
  for (const j of stale) console.log('  STALE   ' + path.relative(REPO, j.out));
  console.log();
  console.log('  ' + stale.length + ' of ' + selected.length + ' PDFs are behind their source.');
  process.exit(1);
}

/* Served over HTTP rather than opened from disk: see tools/lib/serve.mjs. Every
   page links its stylesheet by root-absolute path, which is meaningless over
   file:// — and an unstyled page prints at the default paper size with the
   navigation still on it, which looks like a Chrome problem and is not. */
const site = await serve({ port: 8789 });
const browser = await launch();
const entries = { ...previous.entries };
let failures = 0;

try {
  for (const job of stale) {
    await browser.open(site.origin + job.url);
    const buffer = await browser.pdf(
      job.footer
        ? {
            displayHeaderFooter: true,
            headerTemplate: '<div></div>',
            footerTemplate: job.footer,
          }
        : { displayHeaderFooter: false }
    );

    const pages = countPages(buffer);

    if (job.expect !== null && pages !== job.expect) {
      console.error(
        '  FAIL    ' + job.id.padEnd(40) + pages + ' pages, expected ' + job.expect +
          ' — this is not one sheet printed both sides.'
      );
      failures++;
      continue;
    }

    fs.writeFileSync(job.out, buffer);
    entries[job.id] = {
      hash: job.hash,
      pages,
      bytes: buffer.length,
      title: job.title,
      kind: job.kind,
    };
    console.log(
      '  ' + job.id.padEnd(40) + String(pages).padStart(3) + ' pages  ' +
        (buffer.length / 1024).toFixed(0).padStart(5) + ' kB'
    );
  }
} finally {
  await browser.close();
  await site.close();
}

fs.writeFileSync(
  STATE,
  JSON.stringify(
    {
      $comment:
        'Written by tools/build-pdfs.mjs. `hash` fingerprints the page and stylesheet a PDF was ' +
        'printed from, so a rebuild happens when the paper would actually change. `pages` is ' +
        'measured from the PDF, never predicted.',
      page: '190x259mm, the intersection of A4 and US Letter',
      entries,
    },
    null,
    2
  ) + '\n'
);

const totalPages = Object.values(entries).reduce((n, e) => n + e.pages, 0);
console.log();
console.log(
  '  ' + stale.length + ' rebuilt · ' + Object.keys(entries).length + ' PDFs on file · ' +
    totalPages + ' printed sides in the whole library'
);

function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

process.exit(failures ? 1 : 0);
