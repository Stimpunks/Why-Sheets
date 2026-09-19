#!/usr/bin/env node
/**
 * sync-broadsides.mjs — mirror the broadside blocks into this repository.
 *
 * WHY THE BLOCKS LIVE SOMEWHERE ELSE
 * Broadsides are authored in the Stimpunks Knowledge System, next to the four
 * print gates that measure them (`check-markup`, `check-sheets`,
 * `check-contrast`, `make-print-proof`) and the README that records why every
 * number in them is the number it is. They are written to be pasted into a
 * WordPress Custom HTML block on stimpunks.org. That is their home and this
 * does not change it.
 *
 * WHY THEY ARE MIRRORED HERE ANYWAY
 * The press publishes the whole printable library, and a broadside that exists
 * only inside a private repository and a WordPress page cannot be built into a
 * PDF or handed to anyone. So the blocks are copied in, READ-ONLY, the way
 * `projects/` mirrors project Markdown in the Knowledge System: edit them at the
 * source, re-run this, never here. A change made in `broadsides/source/` is
 * overwritten on the next sync and never reaches the published page.
 *
 * WHAT MAKES THAT SAFE TO PUBLISH. The blocks are CC0 1.0, stated in the
 * source repository's own README, and that covers the text, the markup and the
 * stylesheet written for them. The TOOLING there is CC BY-SA 4.0 and is
 * deliberately not copied.
 *
 * STALENESS IS DETECTABLE, NOT PREVENTED. Each sync writes _PROVENANCE.md with
 * the source commit. Compare it against that repository's HEAD to know whether
 * this mirror is behind. A mirror with no provenance is just a fork nobody
 * admits to.
 *
 *     node tools/sync-broadsides.mjs
 *     node tools/sync-broadsides.mjs --check           # report only, write nothing
 *     node tools/sync-broadsides.mjs --from <repo>     # non-default source checkout
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const checking = args.includes('--check');
const fromArg = args.indexOf('--from');
const SOURCE_REPO =
  fromArg !== -1
    ? path.resolve(args[fromArg + 1])
    : path.join(os.homedir(), 'Documents', 'Claude', 'Projects', 'Stimpunks Knowledge System');

const SRC = path.join(SOURCE_REPO, 'broadsides');
const DEST = path.join(REPO, 'broadsides', 'source');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'sheets.json'), 'utf8'));

if (!fs.existsSync(SRC)) {
  console.error('  No broadsides at ' + SRC);
  console.error('  Pass --from <path to the Stimpunks Knowledge System checkout>.');
  process.exit(2);
}

/* The manifest decides what the press publishes; the source directory decides
   what exists. Report both directions — a block that appeared upstream and was
   never added here is as much a gap as one named here and missing there. */
const wanted = manifest.broadsides.map((b) => b.slug);
const available = fs
  .readdirSync(SRC)
  .filter((f) => f.endsWith('.block.html'))
  .map((f) => f.replace(/\.block\.html$/, ''));

const missing = wanted.filter((s) => !available.includes(s));
const unlisted = available.filter((s) => !wanted.includes(s));

for (const s of missing) console.error('  MISSING upstream   ' + s + '  (named in sheets.json)');
for (const s of unlisted) console.log('  not published      ' + s + '  (upstream, absent from sheets.json)');

fs.mkdirSync(DEST, { recursive: true });

let copied = 0;
let unchanged = 0;
const externals = new Map();

for (const slug of wanted) {
  const src = path.join(SRC, slug + '.block.html');
  if (!fs.existsSync(src)) continue;
  const content = fs.readFileSync(src, 'utf8');

  /* A block reaching out to another origin would need a CSP hole to render, and
     would leak a request to whoever is reading a sheet about their own child.
     Find them here rather than discovering them in a console. */
  const hits = [...content.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)/g)].map((m) => m[1]);
  const fetched = hits.filter((u) => !/^https?:\/\/(www\.)?(stimpunks\.org|creativecommons\.org)/.test(u));
  if (fetched.length) externals.set(slug, fetched);

  const dest = path.join(DEST, slug + '.block.html');
  const before = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;
  if (before === content) {
    unchanged++;
    continue;
  }
  copied++;
  if (!checking) fs.writeFileSync(dest, content);
  console.log('  ' + (checking ? 'STALE  ' : before === null ? 'new    ' : 'updated') + '  ' + slug);
}

let commit = 'unknown';
let when = 'unknown';
try {
  commit = execFileSync('git', ['-C', SOURCE_REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  when = execFileSync('git', ['-C', SOURCE_REPO, 'log', '-1', '--format=%cI'], { encoding: 'utf8' }).trim();
} catch {
  /* Not a git checkout, or git is unavailable. Say so in the provenance rather
     than writing a commit we do not have. */
}

const provenance = `# Provenance

These files are **mirrored, read-only**. Edit them at the source and re-run
\`node tools/sync-broadsides.mjs\`. A change made here is overwritten on the next
sync and never reaches the published page on stimpunks.org.

- **Source repository:** Stimpunks Knowledge System (private), \`broadsides/\`
- **Source commit:** \`${commit}\`
- **Source commit date:** ${when}
- **Mirrored:** ${new Date().toISOString().slice(0, 10)}
- **Files:** ${wanted.filter((s) => fs.existsSync(path.join(SRC, s + '.block.html'))).length}

## Licence

The blocks are **CC0 1.0**, as stated in the source repository's own README:
the text, the markup, and the stylesheet written for them. Quoted material inside
a sheet belongs to whoever wrote it and sits outside that grant.

The build tooling in that repository is **CC BY-SA 4.0** and is deliberately not
copied here.

## Staleness

Compare \`Source commit\` above against that repository's \`HEAD\`. If they differ,
this mirror is behind. Nothing detects that automatically — re-running the sync is
a decision, because it pulls whatever is at HEAD of a working repository.
`;

const provPath = path.join(DEST, '_PROVENANCE.md');
if (!checking) fs.writeFileSync(provPath, provenance);

console.log();
console.log(
  '  ' + wanted.length + ' broadsides · ' + copied + ' ' + (checking ? 'stale' : 'copied') +
    ' · ' + unchanged + ' unchanged · source ' + commit.slice(0, 8)
);

if (externals.size) {
  console.log();
  console.log('  EXTERNAL REQUESTS in mirrored blocks — these need a CSP decision:');
  for (const [slug, urls] of externals) {
    console.log('    ' + slug);
    for (const u of [...new Set(urls)]) console.log('      ' + u);
  }
}

if (missing.length) process.exit(1);
if (checking && copied) process.exit(1);
process.exit(0);
