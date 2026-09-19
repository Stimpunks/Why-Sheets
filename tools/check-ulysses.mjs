#!/usr/bin/env node
/**
 * check-ulysses.mjs — find the damage an editor leaves in these sheets, and
 * offer to undo exactly that damage and nothing else.
 *
 * WHY THIS EXISTS
 * This repository is a Ulysses external folder. Ulysses rewrites Markdown when
 * it saves, in two ways, and both land on disk before anything publishes:
 *
 *   1. BACKSLASH ESCAPES on Markdown punctuation. These publish as literal
 *      asterisks and drag the surrounding emphasis onto the wrong words.
 *   2. NON-BREAKING SPACES (U+00A0) in front of emphasis openers. This is the
 *      quieter one and does far more damage, because U+00A0 counts as
 *      whitespace to a Markdown parser: an emphasis run whose opener is
 *      followed by one NEVER OPENS AT ALL, and the delimiters print as text.
 *
 * Measured here on 2026-09-19, before the press existed: 126 non-breaking
 * spaces across nine of the fourteen sheets, forty of them sitting inside an
 * emphasis delimiter. Three sheets carry most of it — Neuroqueer Learning
 * Spaces, Alternatives to ABA, Cavendish Space.
 *
 * THE PUBLISHED PAGES ARE NOT THE DAMAGED COPY; THESE ARE. Checked against the
 * stimpunks.org mirror: /why/alternatives-to-aba/ renders the Autistic SPACE
 * acronym correctly as **S**ensory, **P**redictability, **A**cceptance, while
 * the file here reads `**<nbsp> P**redictability`. The sheet was published
 * before Ulysses touched it. So this is not drift between two authors — it is
 * one file quietly decaying in an editor, and the press is the first thing that
 * would have PRINTED the decay and handed it to somebody in a meeting.
 *
 * WHAT --fix TOUCHES, AND WHAT IT REFUSES TO
 * Only the two artifact classes, never the prose:
 *   · U+00A0 becomes an ordinary space. These are advocacy sheets, not
 *     typography; no non-breaking space here was ever intended.
 *   · Whitespace is closed up between an emphasis delimiter and the word it
 *     opens or closes — but ONLY where that whitespace run contained a U+00A0.
 *     An author's ordinary `** ` is left exactly as written, because collapsing
 *     every delimiter gap would be editing the writing, and this tool does not
 *     edit the writing.
 *
 * It rewrites files in place and prints every change. Run it on a clean tree so
 * `git diff` is the review.
 *
 *     node tools/check-ulysses.mjs           # report
 *     node tools/check-ulysses.mjs --check   # report, non-zero exit if damaged
 *     node tools/check-ulysses.mjs --fix     # repair, printing each change
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const gating = args.includes('--check');
const fixing = args.includes('--fix');

const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'sheets.json'), 'utf8'));
const files = manifest.sheets.map((s) => s.file);

const NBSP = ' ';
const GAP = '[ \\t' + NBSP + ']*' + NBSP + '[ \\t' + NBSP + ']*';

/* A delimiter run with a nbsp-bearing whitespace gap on its INNER side.
 *
 * THE SIDE TEST IS THE WHOLE THING, and getting it wrong is worse than not
 * running. The first version of this matched any delimiter followed by a
 * nbsp — which also matches the CLOSING `**` of `**neuronormativity**<nbsp>=`,
 * and of `**redefine**<nbsp>our terms`. Collapsing there deletes a real space
 * between two words and welds them together: `**redefine**our`. Caught in the
 * diff on the first run, which is why the tool tells you to read it.
 *
 * So each pattern also asserts which side of a word the delimiter is on. An
 * opener has whitespace or a bracket BEFORE it; a closer has punctuation or
 * whitespace AFTER it. A delimiter that fails its test is somebody else's
 * delimiter and gets left alone. */
const OPENER = new RegExp(
  '(^|[\\s(\\[{"‘“—–])(\\*{1,3}|_{1,2})(' + GAP + ')(?=\\S)',
  'gm'
);
const CLOSER = new RegExp(
  '(?<=\\S)(' + GAP + ')(\\*{1,3}|_{1,2})(?=[\\s.,;:!?)\\]}"’”—–]|$)',
  'gm'
);
/* An escape Ulysses added. A deliberate one exists in the wild — `L*` for CIE
   lightness — so escaped letters are reported, never rewritten. */
const ESCAPES = /\\([*~_])/g;

let damaged = 0;
let totalNbsp = 0;
let totalBroken = 0;
let totalEscapes = 0;
const changed = [];

for (const file of files) {
  const abs = path.join(REPO, file);
  if (!fs.existsSync(abs)) {
    console.error('  MISSING  ' + file + '  (named in sheets.json)');
    damaged++;
    continue;
  }
  const before = fs.readFileSync(abs, 'utf8');

  const nbsp = (before.match(new RegExp(NBSP, 'g')) || []).length;
  const broken = (before.match(OPENER) || []).length + (before.match(CLOSER) || []).length;
  const escapes = (before.match(ESCAPES) || []).length;
  totalNbsp += nbsp;
  totalBroken += broken;
  totalEscapes += escapes;

  if (!nbsp && !escapes) continue;
  damaged++;

  const flag = broken ? 'BREAKS EMPHASIS' : 'cosmetic';
  console.log(
    '  ' + file.padEnd(50) + String(nbsp).padStart(4) + ' nbsp  ' +
      String(broken).padStart(3) + ' in a delimiter  ' +
      String(escapes).padStart(3) + ' escape  ' + flag
  );

  if (!fixing) continue;

  /* Close the delimiter gaps FIRST, while the nbsp is still there to identify
     them — that is the whole discriminator between damage and authorial space. */
  let after = before.replace(OPENER, '$1$2').replace(CLOSER, '$2');
  after = after.split(NBSP).join(' ');

  if (after !== before) {
    fs.writeFileSync(abs, after);
    changed.push(file);
  }
}

console.log();
console.log(
  '  ' + files.length + ' sheets · ' + damaged + ' carrying artifacts · ' +
    totalNbsp + ' non-breaking spaces (' + totalBroken + ' inside a delimiter) · ' +
    totalEscapes + ' backslash escapes'
);

if (totalEscapes) {
  console.log('  Backslash escapes are REPORTED, never rewritten — a deliberate');
  console.log('  one is legitimate (CIE lightness is written L*). Read them first.');
}

if (fixing) {
  console.log();
  if (changed.length) {
    console.log('  repaired: ' + changed.join(', '));
    console.log('  Review with `git diff` before committing. The prose is untouched;');
    console.log('  every change is a space that should not have been there.');
  } else {
    console.log('  nothing to repair.');
  }
  process.exit(0);
}

if (gating && damaged) {
  console.log();
  console.log('  FAIL — run `node tools/check-ulysses.mjs --fix`, then read the diff.');
  process.exit(1);
}
process.exit(0);
