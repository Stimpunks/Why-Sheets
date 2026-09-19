/* build-prompts.mjs — a companion advocacy prompt for each Why Sheet that has a
 * venue and a set of asks. Writes prompts/<slug>.txt.
 *
 * WHAT THESE ARE FOR. When we hand someone a Why Sheet to help them advocate, the
 * next thing they need is a letter, and we have been drafting those by hand. A
 * family that has an AI agent already can draft it themselves — if they are handed
 * a prompt that does the hard part correctly. So: the sheet makes the argument, the
 * prompt turns it into their letter about their child. No keys, no hosting, and no
 * family's data touching us, which matters more here than convenience: the
 * alternative is us holding a Disabled child's name and school on our servers.
 *
 * ── THE ONE THING THIS FILE EXISTS TO PREVENT ───────────────────────────────────
 * A chatbot writing a letter about school policy will cite a study. If it invents
 * one, or misattributes a real one, the school gets a free reason to dismiss the
 * parent — and the cost lands on the family, in a room where they are already
 * outnumbered. It is not a hypothetical: building the Recess and Play sheet, with
 * verification tooling and deliberate care, a Pellegrini quotation was nearly
 * shipped attributed to the wrong publication.
 *
 * So the defence is structural, never an instruction to be careful:
 *   1. Every quotation the letter may use is EMBEDDED IN THE PROMPT, verbatim,
 *      with its attribution attached. The model never has to reach into memory.
 *   2. The prompt forbids adding any source it was not given, in the first rule,
 *      before anything else — including sources the model is confident about.
 *   3. sheetdoc.mjs THROWS on a quotation with no attribution, so an uncited quote
 *      cannot reach a prompt even by accident. One uncited quotation in the file
 *      teaches the model that uncited quotations belong in this document.
 *
 * ── WHY A GENERATOR AND NOT SIXTEEN WRITTEN FILES ───────────────────────────────
 * Every part of a prompt already exists in its sheet: the asks, the quotations,
 * the attributions, the published URL. Hand-written, they are N artifacts that go
 * stale the first time a sheet is edited, and nothing says so. Generated, they are
 * covered by the same drift check as everything else here.
 *
 * ── WHY ONLY SOME SHEETS GET ONE ────────────────────────────────────────────────
 * Two gates, and both refuse rather than degrade:
 *
 * VENUE. `letter` in sheets.json names who the letter is addressed to, or null
 * where there is nobody — Boring Technology argues a position; there is no
 * decision-maker to write to about it. Only venues with a TEMPLATE here are built;
 * a sheet declaring "work" or "clinical" is reported as a backlog item every run,
 * because a silent skip is how the queering.earth mirror sat at 1 page of 9.
 *
 * ASKS. A sheet with no "What to Ask For in the Room" or "What to Do Instead"
 * section is SKIPPED, not generated with the asks left out. Without them the model
 * invents the demands from the argument — which is the same failure as inventing a
 * citation, one level up, and a parent asking a school for the wrong thing is a
 * real cost. Five of the ten school sheets are in this state today. The fix is to
 * write those sections into the sheets, where they belong for their own sake.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from './lib/sheetdoc.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* --check regenerates into memory and compares. A prompt that differs from what
   its sheet now says is stale, and stale is the failure mode this generator
   exists to remove — so it is an error, not a warning. */
const checkOnly = process.argv.includes('--check');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'sheets.json'), 'utf8'));
const HOST = manifest.press.host;

const rule = (t) => '═'.repeat(79) + (t ? `\n${t}\n` + '═'.repeat(79) : '');

/* Sheets whose argument leans on a named statute need the model told which country
   it belongs to. A UK parent's letter citing 34 CFR is worse than no letter: it is
   dismissible on its face, and it signals the letter was not written by them. */
const LAW = /\b(34 CFR|IDEA|Section 504|IEP\b|Equality Act|SEND Code|EHCP|ADA\b)/;

function schoolPrompt(sheet, doc) {
  const educatorFacing = /what to do instead/i.test(doc.asks.heading);
  const url = `https://${HOST}/sheets/${sheet.slug}/`;
  const lawNote = LAW.test(fs.readFileSync(path.join(ROOT, sheet.file), 'utf8'))
    ? `\n5. THIS SHEET REFERS TO SPECIFIC LAW AND SCHOOL PROCESSES. They are not the
   same in every country. Use them only if the parent's country matches, and never
   name a statute the parent did not mention and this prompt did not give you.\n`
    : '';

  return `You are helping a parent or carer write a short letter to their child's school
about ${sheet.title.toLowerCase()}. Work through the steps in order. Do not skip the questions.

${rule('RULES YOU MUST NOT BREAK')}
1. USE ONLY THE QUOTATIONS PROVIDED BELOW. Do not add any other study, statistic,
   author, organisation, or law — not even one you are confident about. If you
   think a further source would help, say so to the parent at the end. Never put
   it in the letter.

2. DO NOT STATE WHAT THE LAW REQUIRES unless the parent has told you their country
   and you are using text they gave you. This sheet makes an evidence argument,
   not a legal one. A letter citing the wrong country's law is dismissed on that
   alone.

3. QUOTE EXACTLY. Reproduce a quotation word for word and name its author. Never
   paraphrase inside quotation marks.

4. USE AT MOST TWO QUOTATIONS. A letter is not a literature review. The parent's
   own account of their own child is the strongest evidence in the room.
${lawNote}
${rule('STEP 1 — ASK THESE QUESTIONS, THEN WAIT')}
Ask them all at once, numbered, and wait for the answers before writing anything.
Tell the parent they may skip any of them.

  1. Your child's first name, and how you would like them referred to.
  2. Their age, and their year or grade.
  3. Your country, and the school's name if you want it in the letter.
  4. What happened — what was said or done, when, and how often.
  5. What you saw afterwards, at home. How were the rest of that day and evening?
  6. Who are you writing to — class teacher, head teacher or principal, SENCO or
     case manager, or the whole IEP / EHCP / 504 team?
  7. Has this been raised before, and what were you told?
  8. What do you want to happen? If you are not sure, say so and I will suggest
     options from the sheet.
  9. Do you want a warm letter that assumes good faith, or a firm letter that
     creates a written record? Most first letters should be warm.

${rule('STEP 2 — WRITE THE LETTER')}
Length: 200-350 words. Shorter is read; longer is filed.

Shape:
  - One sentence saying why you are writing.
  - What happened, in the parent's own words, with dates if they gave any.
  - What the parent observed at home. Only they can write this, and it is the part
    that changes minds. Give it real space.
  - The argument, in one short paragraph, drawn from THE ARGUMENT below. At most
    two quotations.
  - A short numbered list of asks — no more than three, taken from the ASKS
    section and shaped to what the parent told you.
  - A closing line offering to meet.

Voice:
  - Plain sentences. Most under 20 words.
  - Identity-first language: "Autistic child", not "child with autism". Capitalise
    Autistic and Disabled.
  - Never describe the child as struggling, low-functioning, or challenging.
  - No "I hope this email finds you well." No "I wanted to reach out."
  - Do not thank them for their time twice.
  - Assume the teacher is working inside a policy they did not write.

${rule('STEP 3 — AFTER THE LETTER')}
Briefly give the parent:
  - One line on what to do if there is no reply in two weeks.
  - A note to attach or link the ${sheet.title} Why Sheet: ${url}
  - Anything you wanted to cite and could not, so they can look it up themselves.

${rule('THE ARGUMENT')}
${(doc.shortVersion.length ? doc.shortVersion : [sheet.summary]).map((l) => wrap(l)).join('\n\n')}

${rule(doc.quotes.length ? 'THE EVIDENCE — THESE QUOTATIONS AND NO OTHERS' : 'THE EVIDENCE')}${
    doc.quotes.length
      ? '\n' +
        doc.quotes
          .map((q) => `"${wrap(q.text)}"\n  — ${wrap(q.source, 2)}`)
          .join('\n\n')
      : '\nThis sheet carries no quotations. Make the argument in the parent\'s own\nwords and cite nothing.'
  }

${rule('ASKS — CHOOSE AT MOST THREE, AND REWORD THEM FOR THIS FAMILY')}${
    educatorFacing
      ? '\nThese are written as things the SCHOOL should do. Turn them into things the\nparent is asking for.\n'
      : ''
  }
${doc.asks.bullets.map((b) => '  - ' + wrap(b, 4)).join('\n')}

${'═'.repeat(79)}

Source: ${sheet.title} Why Sheet — ${url}${sheet.published ? `\nAlso published at ${sheet.published}` : ''}
This prompt is CC0. Quoted material remains the property of its authors.
`;
}

/* Hard-wrap at 78 for a plain-text file that will be pasted into a chat box and
   read in a monospace editor. The sheets themselves are one-line-per-paragraph;
   these are not sheets. */
function wrap(s, indent = 0) {
  const pad = ' '.repeat(indent);
  const words = String(s).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > 78 - indent) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines.join('\n' + pad);
}

const TEMPLATES = { school: schoolPrompt };

const built = [];
const stale = [];
const skipped = { noAsks: [], noTemplate: [], noVenue: 0 };

for (const sheet of manifest.sheets) {
  if (!sheet.letter) {
    skipped.noVenue++;
    continue;
  }
  const tpl = TEMPLATES[sheet.letter];
  if (!tpl) {
    skipped.noTemplate.push(`${sheet.slug} (${sheet.letter})`);
    continue;
  }
  const doc = parse(fs.readFileSync(path.join(ROOT, sheet.file), 'utf8'), sheet.slug);
  if (!doc.asks) {
    skipped.noAsks.push(sheet.slug);
    continue;
  }
  const text = tpl(sheet, doc);
  if (/ /.test(text)) throw new Error(`${sheet.slug}: non-breaking space in prompt`);
  const out = path.join(ROOT, 'prompts', sheet.slug + '.txt');
  if (checkOnly) {
    const have = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
    if (have !== text) stale.push(sheet.slug);
  } else {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text);
  }
  built.push({ slug: sheet.slug, words: text.split(/\s+/).length, quotes: doc.quotes.length });
}

for (const b of built) {
  console.log(`  prompts/${b.slug}.txt`.padEnd(46) + `${b.words} words, ${b.quotes} quotations`);
}
console.log(`\n  built ${built.length}`);
if (skipped.noAsks.length)
  console.log(
    `  skipped ${skipped.noAsks.length} with no asks section — write one into the sheet:\n` +
      skipped.noAsks.map((s) => '      ' + s).join('\n')
  );
if (skipped.noTemplate.length)
  console.log(
    `  skipped ${skipped.noTemplate.length} declaring a venue with no template here:\n` +
      skipped.noTemplate.map((s) => '      ' + s).join('\n')
  );
console.log(`  ${skipped.noVenue} sheets declare no venue (nobody to write to)`);

/* An orphan is a prompt whose sheet no longer declares a venue, or lost its asks.
   It would go on being served, and being wrong, with nothing pointing at it. */
const dir = path.join(ROOT, 'prompts');
const expected = new Set(built.map((b) => b.slug + '.txt'));
const orphans = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => f.endsWith('.txt') && !expected.has(f))
  : [];
if (orphans.length) {
  console.error(`\n  ORPHANED: ${orphans.join(', ')}`);
  console.error('  A prompt exists for a sheet that no longer qualifies for one.');
  console.error('  Delete it, or restore what the sheet lost.');
  process.exit(1);
}
if (stale.length) {
  console.error(`\n  STALE: ${stale.join(', ')}`);
  console.error('  These differ from what their sheets now say. Run without --check.');
  process.exit(1);
}
if (checkOnly) console.log('  all prompts current');
