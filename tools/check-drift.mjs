#!/usr/bin/env node
/**
 * check-drift.mjs — is there one answer to "how many Why Sheets are there?"
 *
 * WHY THIS IS THE FIRST TOOL THE PRESS NEEDED
 * On 2026-09-19 there were three answers, all of them live at once:
 *
 *     14  Markdown sheets in this repository
 *     12  pages published at stimpunks.org/why/<slug>/
 *      9  named in the "Our Why Sheets" list on stimpunks.org/why/
 *
 * Two sheets genuinely had no page yet. THE THIRD NUMBER WAS AN ARTEFACT — see
 * the note above section 3 — and finding that out is what this tool is for: the
 * nine came from a mirrored copy of a page that renders its list dynamically and
 * had not been re-fetched in six weeks. A library with three catalogues has no
 * catalogue, and a catalogue read out of a stale snapshot is worse than none,
 * because it is formatted like an answer.
 *
 * WHAT IT COMPARES, and the one thing it deliberately does not do
 * Three sources: this repository's files, `sheets.json`, and the local mirror of
 * stimpunks.org. It no longer reads the list on the /why/ page — that list is
 * generated, not written, and the mirrored copy of a generated list is a
 * snapshot of a moment. Section 3 says why at length.
 *
 * IT READS THE MIRROR, NEVER THE LIVE SITE. Checking links against
 * stimpunks.org by fetching them does not work: a burst of requests trips its
 * bot protection, after which EVERY url returns 403 — including ones that
 * answered 200 seconds earlier — and the run is useless in both directions
 * while still producing something formatted like a report. The mirror is
 * rebuilt from the WordPress REST API and every published page carries its
 * canonical url in frontmatter, so resolving against it is instant and cannot
 * be rate-limited. Re-sync the mirror first, or "not published" here means
 * "not synced yet".
 *
 * A REDIRECT ON stimpunks.org IS A FAILURE, NOT A PASS — which is the other
 * reason not to fetch. WordPress core's redirect_guess_404_permalink() takes a
 * wrong path carrying a known slug and sends it to whatever else owns that
 * slug, so a link to a page that does not exist lands on a glossary term and
 * looks like it worked.
 *
 *     node tools/check-drift.mjs
 *     node tools/check-drift.mjs --check          # non-zero exit on any drift
 *     node tools/check-drift.mjs --mirror <path>  # a mirror somewhere else
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const gating = args.includes('--check');
const mIdx = args.indexOf('--mirror');
const MIRROR =
  mIdx !== -1
    ? path.resolve(args[mIdx + 1])
    : path.join(
        os.homedir(),
        'Documents', 'Claude', 'Projects', 'Stimpunks Knowledge System',
        'site', 'stimpunks.org'
      );

const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'sheets.json'), 'utf8'));
const findings = [];
const note = (level, text) => findings.push({ level, text });

/* ── 1. the repository against the manifest ─────────────────────────────── */

const onDisk = fs
  .readdirSync(REPO)
  .filter((f) => f.endsWith('.md') && f !== 'README.md' && f !== 'CHANGELOG.md' &&
    f !== 'DECISIONS.md' && f !== 'ATTRIBUTIONS.md' && f !== 'CLAUDE.md' && f !== 'CONTRIBUTING.md')
  .sort();

const declared = new Set(manifest.sheets.map((s) => s.file));

for (const f of onDisk) {
  if (!declared.has(f)) {
    note('error', 'ORPHAN SHEET  ' + f + '\n' +
      '      A sheet in the repository that sheets.json does not know about. It will not be\n' +
      '      published, indexed, or turned into a PDF. Add it to sheets.json or delete it.');
  }
}
for (const s of manifest.sheets) {
  if (!fs.existsSync(path.join(REPO, s.file))) {
    note('error', 'MISSING FILE  ' + s.file + '  (declared as ' + s.slug + ')');
  }
}

/* ── 2. the manifest against the stimpunks.org mirror ───────────────────── */

const pagesDir = path.join(MIRROR, 'pages');
let mirrorOk = fs.existsSync(pagesDir);

if (!mirrorOk) {
  note('warn', 'NO MIRROR at ' + MIRROR + '\n' +
    '      Everything below about stimpunks.org is unchecked. Pass --mirror <path>, or run\n' +
    "      the Knowledge System's sync-site skill. An unchecked claim is not a passing one.");
}

const published = new Map(); // slug -> canonical url, from the mirror
if (mirrorOk) {
  for (const file of fs.readdirSync(pagesDir)) {
    const m = /^why__(.+)\.md$/.exec(file);
    if (!m) continue;
    const text = fs.readFileSync(path.join(pagesDir, file), 'utf8');
    const url = (/^url:\s*"?([^"\n]+)"?/m.exec(text) || [])[1];
    published.set(m[1], (url || '').trim());
  }

  for (const s of manifest.sheets) {
    const live = published.has(s.slug);
    if (s.published && !live) {
      note('error', 'CLAIMED, NOT PUBLISHED  ' + s.slug + '\n' +
        '      sheets.json says it is at ' + s.published + ', and the mirror has no such page.\n' +
        '      Either the sheet was unpublished, or the mirror is stale. Re-sync before believing this.');
    }
    if (!s.published && live) {
      note('error', 'PUBLISHED, NOT CLAIMED  ' + s.slug + '\n' +
        '      The mirror has ' + published.get(s.slug) + ' and sheets.json says published: null.\n' +
        '      Set it, so the press links there instead of implying the sheet is unpublished.');
    }
    if (s.published && live && published.get(s.slug) && s.published !== published.get(s.slug)) {
      note('error', 'URL MISMATCH  ' + s.slug + '\n' +
        '      sheets.json: ' + s.published + '\n' +
        '      the mirror:  ' + published.get(s.slug));
    }
  }

  for (const slug of published.keys()) {
    if (!manifest.sheets.some((s) => s.slug === slug)) {
      note('error', 'ON THE SITE, NOT IN THE REPOSITORY  /why/' + slug + '/\n' +
        '      A published Why Sheet with no Markdown source here. The repository is supposed to be\n' +
        '      the source of truth, and it cannot be while a sheet exists only as a web page.');
    }
  }
}

/* ── 2b. the repository's sections against what the page actually carries ── */
/* THE COUNTS CAN ALL AGREE WHILE THE PAGES ARE WRONG. Section 2 checks that a
 * sheet exists at the URL the manifest claims. It says nothing about whether the
 * page says the same thing as the file. On 2026-09-19 five sheets gained a "What
 * to Ask For in the Room" section in this repository and the published pages did
 * not, and this checker printed "No drift" — because it counted sheets. The whole
 * premise here is that the repository is the source of truth; that is not a fact
 * about the repository, it is a claim that has to be checked against the site.
 *
 * IT COMPARES BODY TEXT, NOT HEADINGS, and that distinction is the difference
 * between a gate and a nuisance. A heading comparison flags Boring Technology,
 * whose opening section runs straight on from the page title without its "What
 * This Is" heading — the words are all there and a reader loses nothing. Nine
 * findings, eight of them noise, is a gate somebody turns off. Asking "did this
 * section's prose reach the page" gave 123 sections checked and 0 false
 * positives.
 *
 * NORMALISE BEFORE COMPARING, because WordPress does not serve back what you
 * sent it. wptexturize turns quotes and apostrophes curly and hyphens into en
 * dashes, and the mirror's own HTML-to-Markdown pass moves emphasis markers
 * around. Every one of those differences is rendering, not drift. Two rounds of
 * this check were false alarms from exactly that: "Look at Me" against “Look at
 * Me”, and a hyphen against an en dash.
 *
 * SECTIONS THE SITE DELIBERATELY DOES NOT CARRY ARE LISTED, NOT SILENTLY SKIPPED.
 * License and Signatories live in the page furniture rather than the body, and a
 * Table of Contents renders as a list without its heading. */
const NOT_ON_PAGE = new Set([
  'license',
  'signatories',
  'table of contents',
  'references',
  'resources',
  'further reading',
]);

function normalise(t) {
  const pairs = [
    ['\u2019', "'"], ['\u2018', "'"], ['\u201c', '"'], ['\u201d', '"'],
    ['\u2013', '-'], ['\u2014', '-'], ['\u2212', '-'], ['\u00a0', ' '],
  ];
  for (const [a, b] of pairs) t = t.split(a).join(b);
  return t
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#\\]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

if (mirrorOk) {
  let checked = 0;
  const behind = [];

  for (const s of manifest.sheets) {
    if (!s.published || !published.has(s.slug)) continue;
    const live = normalise(
      fs.readFileSync(path.join(pagesDir, 'why__' + s.slug + '.md'), 'utf8')
    );
    const src = fs.readFileSync(path.join(REPO, s.file), 'utf8');
    const parts = src.split(/^##+[ \t]+(.+?)[ \t]*$/m);

    for (let i = 1; i < parts.length; i += 2) {
      const heading = parts[i].trim();
      if (NOT_ON_PAGE.has(heading.toLowerCase())) continue;

      /* The section's first line of prose OR list item, with the bullet marker
         stripped. Skipping list items — the obvious first instinct, since a list
         looks like the thing a round trip would reshape — makes the check blind
         to any section that is ENTIRELY a list, and an asks section is exactly
         that shape. Tested: excluding them caught 1 of the 5 sheets that were
         genuinely behind; including them caught 5 of 5 and still produced 0 false
         positives across 167 sections. Quotes, tables, images and raw HTML stay
         excluded, because those really are reshaped by the round trip. */
      const line = (parts[i + 1].split('\n').find(
        (l) => l.trim() && !/^\s*[>|!<]/.test(l)
      ) || '').replace(/^\s*[-*]\s+/, '');
      const probe = normalise(line).slice(0, 70);
      if (probe.length < 25) continue;

      checked++;
      if (!live.includes(probe)) behind.push({ slug: s.slug, heading });
    }
  }

  for (const b of behind) {
    note('error', 'IN THE REPOSITORY, NOT ON THE PAGE  ' + b.slug + ' \u2014 "' + b.heading + '"\n' +
      '      This section exists in ' + b.slug + ' here and its text is not on the published page.\n' +
      '      Either publish it, or the repository is not the source of truth it claims to be.\n' +
      '      Re-sync the mirror first — a stale mirror reports this too.');
  }

  console.log('  ' + checked + ' published sections compared against the page text \u00b7 ' +
    behind.length + ' behind');
  console.log();
}

/* ── 3. the /why/ list — which is NOT a list ────────────────────────────── */

/* THIS CHECK WAS WRONG, AND THE WAY IT WAS WRONG IS WORTH KEEPING.
 *
 * It used to scrape the anchors out of the mirrored /why/ page and compare them
 * against the published sheets. On 2026-09-19 it reported three sheets —
 * Boring Technology, Masking and Burnout, Monotropism — as published but not
 * linked from the parent page, and recommended a hand edit to add them.
 *
 * All three were already there. Two things were true at once:
 *
 *   1. THE LIST IS NOT WRITTEN BY ANYONE. The page's stored content at that
 *      point is a single self-closing block, `<!-- wp:yoast-seo/subpages /-->`,
 *      which renders the page's published children at request time. There is no
 *      markup to add a link to, and a sheet cannot be "missing" from it: being
 *      a published child IS being listed. The set cannot drift, by construction.
 *
 *   2. THE MIRROR CANNOT SEE THAT IT CHANGED. The site mirror syncs
 *      incrementally on `modified_after`, and /why/'s own stored content has not
 *      changed since 2026-06-17 — so it has never been re-fetched, while its
 *      rendered output changed three times as those children were published in
 *      late August. The rest of the mirror was one day old. That one file was
 *      six weeks old, and nothing said so, because `modified` tracks a page's
 *      own content and not what its blocks render.
 *
 * So the scrape is gone. What is left is the staleness signal that would have
 * caught it: if any sheet was published after the parent page was last modified,
 * the mirrored copy of that parent predates it and must not be read as evidence
 * of anything. That is reported as a fact about the mirror, not as drift in the
 * library.
 */

if (mirrorOk && fs.existsSync(path.join(pagesDir, 'why.md'))) {
  const parent = fs.readFileSync(path.join(pagesDir, 'why.md'), 'utf8');
  const parentModified = ((/^modified:\s*"?([^"\n]+)"?/m.exec(parent) || [])[1] || '').trim();

  /* THE QUESTION IS WHEN THE MIRROR FILE WAS LAST REFRESHED, NOT WHEN THE PAGE
   * WAS LAST EDITED, and the first version of this asked the wrong one.
   *
   * It compared the page's own `modified:` against its children's `date:`. That
   * condition is true and STAYS true however fresh the mirror is, because a page
   * whose rendering depends on other content never reports itself as modified —
   * which is the entire defect. So the warning could never clear. It went on
   * firing after a full re-pull had already fixed the file.
   *
   * The honest signal is the mirror file's own last commit. It survives a fresh
   * clone, unlike mtime, and it answers the real question: was this copy written
   * before or after the thing it is supposed to contain was published. */
  const lastCommitted = (rel) => {
    try {
      return execFileSync('git', ['-C', MIRROR, 'log', '-1', '--format=%cI', '--', rel], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return '';
    }
  };

  const parentFetched = lastCommitted(path.join('pages', 'why.md'));

  const newer = manifest.sheets
    .filter((s) => s.published)
    .map((s) => {
      const file = path.join(pagesDir, 'why__' + s.slug + '.md');
      if (!fs.existsSync(file)) return null;
      const d = ((/^date:\s*"?([^"\n]+)"?/m.exec(fs.readFileSync(file, 'utf8')) || [])[1] || '').trim();
      return d && parentFetched && d > parentFetched ? { slug: s.slug, date: d.slice(0, 10) } : null;
    })
    .filter(Boolean);

  if (!parentFetched) {
    note('warn',
      'CANNOT DATE THE MIRRORED /why/ PAGE\n' +
      '      ' + MIRROR + ' is not a git checkout, so there is no way to tell when that file was\n' +
      '      last refreshed. Its list of sheets is rendered from its children at request time, so\n' +
      '      an old copy shows an old list and nothing in the file itself says so. Treat anything\n' +
      '      read out of that page as undated.');
  } else if (newer.length) {
    note('warn',
      'THE MIRRORED /why/ PAGE IS OLDER THAN ' + newer.length + ' OF ITS OWN CHILDREN\n' +
      '      That file was last refreshed ' + parentFetched.slice(0, 10) + '; these were published after:\n' +
      newer.map((n) => '        ' + n.slug + '  (' + n.date + ')').join('\n') + '\n' +
      '      Its list of sheets is rendered from its children at request time, and the sync is\n' +
      '      incremental on `modified` — which tracks the page\'s own content, not what its blocks\n' +
      '      render. Nothing incremental will refresh it. Run:\n' +
      '        wordpress_content.py sync --site stimpunks.org --full\n' +
      '      Until then, do not read that page out of the mirror. Nothing is wrong with the library.');
  }

  /* A real failure, and the only one possible here: a sheet claimed as published
     whose URL is not under /why/ would not be a child, so the block would not
     render it however long anyone waited. */
  for (const s of manifest.sheets) {
    if (s.published && !/^https:\/\/stimpunks\.org\/why\/[a-z0-9-]+\/$/.test(s.published)) {
      note('error', 'NOT A CHILD OF /why/  ' + s.slug + '\n' +
        '      ' + s.published + ' is not under /why/, so the parent page\'s subpages block\n' +
        '      will never list it, whatever else is true.');
    }
  }
} else if (mirrorOk) {
  note('warn', 'The mirror has no pages/why.md, so the parent page is unchecked.');
}

/* ── 3b. links into /why/ that nothing is published at ──────────────────── */

/* A SHEET MAY NOT LINK TO AN UNPUBLISHED /why/ PAGE, and on this site that is
 * worse than an ordinary dead link. WordPress core's
 * redirect_guess_404_permalink() takes a wrong path carrying a known slug and
 * 301s it to whatever else owns that slug — so the link does not 404, it
 * delivers the reader somewhere else entirely and looks like it worked.
 *
 * Caught on the Recess and Play sheet, which pointed at
 * /why/developmental-pace/ while that sheet was published only on the press.
 * The fix is never to drop the link: point it at whysheet.press, where the
 * sheet does exist, and move it back if and when the page is published. */
const unpublished = new Set(manifest.sheets.filter((s) => !s.published).map((s) => s.slug));

for (const s of manifest.sheets) {
  const file = path.join(REPO, s.file);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/https:\/\/stimpunks\.org\/why\/([a-z0-9-]+)\//g)) {
    if (unpublished.has(m[1])) {
      note('error', 'LINK TO AN UNPUBLISHED /why/ PAGE  ' + s.file + '\n' +
        '      points at /why/' + m[1] + '/ , and that sheet is declared published: null.\n' +
        '      On stimpunks.org this does not 404 — core guesses the slug and 301s the reader\n' +
        '      to whatever else owns it. Point at whysheet.press/sheets/' + m[1] + '/ instead.');
    }
  }
}

/* ── 4. the press against itself ────────────────────────────────────────── */

for (const s of manifest.sheets) {
  const page = path.join(REPO, 'sheets', s.slug, 'index.html');
  const pdf = path.join(REPO, 'pdf', s.slug + '.pdf');
  if (!fs.existsSync(page)) note('error', 'NO PAGE BUILT  ' + s.slug + '  (run tools/build-site.mjs)');
  if (!fs.existsSync(pdf)) note('error', 'NO PDF BUILT   ' + s.slug + '  (run tools/build-pdfs.mjs)');
}
for (const b of manifest.broadsides) {
  if (!fs.existsSync(path.join(REPO, 'pdf', 'broadside-' + b.slug + '.pdf'))) {
    note('error', 'NO PDF BUILT   broadside-' + b.slug);
  }
  if (b.parent && !manifest.sheets.some((s) => s.slug === b.parent)) {
    note('error', 'BROADSIDE PARENT MISSING  ' + b.slug + ' names ' + b.parent + ', which is not a sheet');
  }
}

/* ── report ─────────────────────────────────────────────────────────────── */

const counts = {
  repository: onDisk.length,
  manifest: manifest.sheets.length,
  published_claimed: manifest.sheets.filter((s) => s.published).length,
  published_mirror: mirrorOk ? published.size : null,
  press_pages: manifest.sheets.filter((s) => fs.existsSync(path.join(REPO, 'sheets', s.slug, 'index.html'))).length,
  pdfs: fs.existsSync(path.join(REPO, 'pdf'))
    ? fs.readdirSync(path.join(REPO, 'pdf')).filter((f) => f.endsWith('.pdf')).length
    : 0,
};

console.log('  HOW MANY WHY SHEETS ARE THERE?');
console.log('    ' + String(counts.repository).padStart(3) + '  Markdown sheets in this repository');
console.log('    ' + String(counts.manifest).padStart(3) + '  declared in sheets.json');
console.log('    ' + String(counts.press_pages).padStart(3) + '  pages built on the press');
console.log('    ' + String(counts.published_claimed).padStart(3) + '  claimed as published on stimpunks.org');
console.log(
  '    ' + String(counts.published_mirror === null ? '  ?' : counts.published_mirror).padStart(3) +
    '  actually published, per the site mirror'
);
console.log('    ' + String(counts.pdfs).padStart(3) + '  PDFs (sheets and broadsides together)');
console.log();

const errors = findings.filter((f) => f.level === 'error');
const warnings = findings.filter((f) => f.level === 'warn');

for (const f of findings) {
  console.log('  ' + (f.level === 'error' ? 'DRIFT   ' : 'NOTE    ') + f.text);
  console.log();
}

if (!findings.length) {
  console.log('  No drift. Every sheet is declared, built, and where the manifest says it is.');
}

console.log(
  '  ' + errors.length + ' drift' + (errors.length === 1 ? '' : 's') + ' · ' +
    warnings.length + ' note' + (warnings.length === 1 ? '' : 's')
);

process.exit(gating && errors.length ? 1 : 0);
