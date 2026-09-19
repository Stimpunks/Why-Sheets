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
 * None of those numbers was wrong on its own. Two sheets genuinely had no page
 * yet, and three published sheets had simply never been added to the list. The
 * failure was that nothing anywhere could notice, because nothing read all
 * three. A library with three catalogues has no catalogue.
 *
 * WHAT IT COMPARES, and the one thing it deliberately does not do
 * Four sources: this repository's files, `sheets.json`, the local mirror of
 * stimpunks.org, and the list on the /why/ page inside that mirror.
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

/* ── 3. the list on /why/ against what is actually published ────────────── */

const whyPage = path.join(pagesDir, 'why.md');
if (mirrorOk && fs.existsSync(whyPage)) {
  const text = fs.readFileSync(whyPage, 'utf8');
  const listed = new Set(
    [...text.matchAll(/https:\/\/stimpunks\.org\/why\/([a-z0-9-]+)\//g)].map((m) => m[1])
  );

  const unlisted = [...published.keys()].filter((s) => !listed.has(s)).sort();
  const ghosts = [...listed].filter((s) => !published.has(s)).sort();

  if (unlisted.length) {
    note('warn', 'PUBLISHED BUT NOT LISTED on stimpunks.org/why/  (' + unlisted.length + ')\n' +
      unlisted.map((s) => '        ' + s).join('\n') + '\n' +
      '      These pages exist and nothing on the parent page links to them. A reader who does not\n' +
      '      already know the URL cannot find them. This is a stimpunks.org edit, not a repository one.');
  }
  if (ghosts.length) {
    note('error', 'LISTED BUT NOT PUBLISHED on stimpunks.org/why/  (' + ghosts.length + ')\n' +
      ghosts.map((s) => '        ' + s).join('\n') + '\n' +
      '      Each of these 404s — or worse, 301s to whatever else owns the slug, which looks like it worked.');
  }
} else if (mirrorOk) {
  note('warn', 'The mirror has no pages/why.md, so the list on the parent page is unchecked.');
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
