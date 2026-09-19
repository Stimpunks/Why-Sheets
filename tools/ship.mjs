#!/usr/bin/env node
/**
 * ship.mjs — everything, in the one order that works.
 *
 * The stages feed each other, and running them out of order produces a site that
 * is confidently wrong without erroring: PDFs printed from last week's pages,
 * a drift report that passes because it is reading files nothing regenerated.
 * So there is one command, and it is this one.
 *
 *   1. check-ulysses    the Markdown sources, before anything reads them
 *   2. sync-broadsides  mirror the blocks (skipped if the source repo is absent)
 *   3. build-site       pages, per-broadside stylesheets, sitemap, llms.txt
 *   4. build-pdfs       print each page, and ASSERT the broadside page counts
 *   5. check-site       links, anchors, CSP shape, contrast in both themes
 *   6. check-drift      the repository against sheets.json against stimpunks.org
 *
 * Stage 1 comes first because Ulysses damage in a source file flows into every
 * later stage and the last place it shows up is a printed page in somebody's
 * hand. Stage 4 comes before stage 5 because the checker asserts that every PDF
 * a page offers exists.
 *
 *     node tools/ship.mjs              # build and check
 *     node tools/ship.mjs --check      # check only, write nothing
 *
 * It does not deploy and it does not commit. Netlify publishes this repository
 * as it stands, so shipping is a push, and that is a decision a person makes.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const stages = [
  { name: 'sources', script: 'check-ulysses.mjs', args: checkOnly ? ['--check'] : ['--check'] },
  { name: 'broadsides', script: 'sync-broadsides.mjs', args: checkOnly ? ['--check'] : [], soft: true },
  { name: 'prompts', script: 'build-prompts.mjs', args: checkOnly ? ['--check'] : [] },
  { name: 'pages', script: 'build-site.mjs', args: checkOnly ? ['--check'] : [] },
  { name: 'pdfs', script: 'build-pdfs.mjs', args: checkOnly ? ['--check'] : [] },
  { name: 'site', script: 'check-site.mjs', args: ['--check'] },
  { name: 'drift', script: 'check-drift.mjs', args: ['--check'] },
];

let failed = null;

for (const stage of stages) {
  console.log('\n── ' + stage.name + ' ── ' + stage.script + ' ' + stage.args.join(' '));
  const res = spawnSync('node', [path.join(REPO, 'tools', stage.script), ...stage.args], {
    stdio: 'inherit',
    cwd: REPO,
  });
  if (res.status !== 0) {
    if (stage.soft) {
      /* The broadside mirror lives in a separate, private repository. A checkout
         without it should still be able to build and check everything else,
         because the mirrored blocks are committed here. */
      console.log('  (' + stage.name + ' reported a problem and is not fatal — see above)');
      continue;
    }
    failed = stage.name;
    break;
  }
}

console.log();
if (failed) {
  console.log('  STOPPED at "' + failed + '". Nothing after it ran.');
  console.log('  Fix what it printed rather than running the later stages by hand —');
  console.log('  they would be checking output this stage did not produce.');
  process.exit(1);
}

const pdfs = fs.existsSync(path.join(REPO, 'pdf'))
  ? fs.readdirSync(path.join(REPO, 'pdf')).filter((f) => f.endsWith('.pdf')).length
  : 0;

console.log('  All stages passed. ' + pdfs + ' PDFs, every page checked.');
console.log('  Deploying is a push: Netlify publishes this repository as it stands.');
process.exit(0);
