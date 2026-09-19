/* build-og.mjs — one Open Graph card per page, rendered in headless Chrome.
 *
 * WHY A CARD PER PAGE AND NOT ONE SITE-WIDE IMAGE. A Why Sheet is shared into a
 * Discord channel or a Bluesky thread at the moment somebody needs it — "here,
 * this is the one about recess". A single house image makes every one of those
 * links look identical, so the card tells the reader nothing at the exact moment
 * it is doing the most work. The card carries the sheet's title and the moment
 * you reach for it, which is the same pair the shelf shows.
 *
 * WHY RENDER RATHER THAN DRAW. The repository already drives headless Chrome to
 * print the PDFs, and the site already has a typeface, a palette and a CSS file
 * that agree with each other. Rendering HTML means a new sheet gets a card with
 * no further work, and the cards cannot drift away from the site's own look the
 * way a set of hand-made images would.
 *
 * WHY THE CARDS ARE WHITE. Everything else in a feed is dark, saturated and
 * shouting. This is a press: ink on paper, a registration bar at the top, a
 * measured rule. It reads as a document rather than an advertisement, which is
 * what it is — and it matches what comes out of the printer.
 *
 * THE TITLE IS FITTED BY MEASUREMENT, NOT BY GUESS. Titles here run from
 * "Hoodie" to "Queer and Neurodivergent Liberation are Entwined". A fixed size
 * either wastes two thirds of the card or overflows it. The fitting is done in
 * the page by the driver's evaluate(), stepping the size down until the block
 * fits its box — the same measure-don't-assume approach as the sheet overflow
 * check, and for the same reason: a card that overflows is only visible once it
 * is already on somebody's timeline.
 *
 * THE CARD HTML CARRIES AN INLINE <style>, WHICH THE SHELL FORBIDS. That rule
 * exists because the site's CSP is `style-src 'self'` with no unsafe-inline.
 * These files are build-time scaffolding: they are written to og/.cards/, which
 * is git-ignored and never deployed, and the only thing that ever loads them is
 * this script. Nothing under og/ that reaches a reader is anything but a PNG.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/chrome.mjs';
import { serve } from './lib/serve.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'sheets.json'), 'utf8'));
const HOST = manifest.press.host;
const checkOnly = process.argv.includes('--check');

/* 1200x630 is the size every consumer of these still asks for, and the one that
   survives being cropped to 2:1 by the clients that do that. Rendered at
   deviceScaleFactor 2 and left at 2400x1260: the text is the whole content, and
   it is the difference between crisp and soft on a phone. */
const W = 1200;
const H = 630;

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function card({ kicker, title, note, foot }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>card</title>
<link rel="stylesheet" href="/assets/press.css">
<style>
  html, body { margin: 0; padding: 0; background: #fff; }
  .og {
    width: ${W}px; height: ${H}px; box-sizing: border-box;
    border-top: 14px solid var(--spot);
    padding: 58px 72px 46px;
    display: flex; flex-direction: column;
    font-family: 'Atkinson Hyperlegible Next', system-ui, sans-serif;
    color: var(--ink); background: #fff;
  }
  .og__kicker {
    font-family: 'Space Mono', ui-monospace, monospace;
    font-size: 21px; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--spot); margin: 0 0 28px;
  }
  /* flex-shrink:0 on every child, and no max-height anywhere. Both matter.
     A flex column silently squeezes its children when the content is too tall,
     so a box can be SMALLER than its content without the content reporting any
     overflow of its own — which is how the first version measured a title as
     fitting and rendered it sliced through the middle. With shrinking off, an
     oversized title makes the CARD overflow, which is a thing that can be
     measured honestly. */
  .og > * { flex: 0 0 auto; }
  .og__title {
    font-weight: 800; line-height: 1.04; letter-spacing: -0.015em;
    margin: 0; font-size: 92px;
  }
  .og__rule { height: 3px; background: var(--rule-firm); margin: 32px 0 26px; width: 120px; }
  .og__note { font-size: 30px; line-height: 1.38; color: var(--ink-soft); margin: 0; }
  .og__foot {
    margin-top: auto; padding-top: 28px;
    display: flex; justify-content: space-between; align-items: baseline;
    font-family: 'Space Mono', ui-monospace, monospace;
    font-size: 20px; color: var(--ink-faint);
  }
  .og__foot strong { color: var(--ink); font-weight: 700; }
</style></head>
<body><div class="og">
  <p class="og__kicker">${esc(kicker)}</p>
  <h1 class="og__title">${esc(title)}</h1>
  <div class="og__rule"></div>
  <p class="og__note">${esc(note)}</p>
  <div class="og__foot"><span><strong>${esc(HOST)}</strong></span><span>${esc(foot)}</span></div>
</div></body></html>`;
}

/* Every page that gets a card, and what goes on it. */
const jobs = [];

jobs.push({
  slug: 'home',
  card: {
    kicker: 'The Why Sheet Press',
    title: 'Print the argument. Carry it into the room.',
    note: `${manifest.sheets.length} Why Sheets on the things families and educators should not have to defend alone — and constantly do. Free, CC0, made to be printed.`,
    foot: 'CC0 1.0',
  },
});

for (const s of manifest.sheets) {
  jobs.push({
    slug: 'sheets-' + s.slug,
    card: {
      kicker: 'Why Sheet',
      title: s.title,
      note: 'Reach for it ' + s.moment.charAt(0).toLowerCase() + s.moment.slice(1),
      foot: 'CC0 1.0',
    },
  });
}

const broadsideDirs = fs
  .readdirSync(path.join(REPO, 'broadsides'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== 'source')
  .map((d) => d.name);

for (const slug of broadsideDirs) {
  const parent = manifest.sheets.find((s) => s.broadside === slug);
  jobs.push({
    slug: 'broadsides-' + slug,
    card: {
      kicker: 'Broadside',
      title: parent ? parent.title : slug,
      note: 'One sheet, printed both sides, made to be handed to someone. The argument compressed to what fits in a hand.',
      foot: 'CC0 1.0',
    },
  });
}

for (const [slug, c] of [
  [
    'packet',
    {
      kicker: 'Build a packet',
      title: 'Tick the sheets you need.',
      note: 'One correctly paginated PDF, with a cover page and a contents list. Assembled in your own browser — nothing is uploaded and nothing is recorded.',
      foot: 'CC0 1.0',
    },
  ],
  [
    'broadsides',
    {
      kicker: 'Broadsides',
      title: 'The version you pin up.',
      note: 'One physical sheet, printed both sides, made to be carried into a room and handed to someone.',
      foot: 'CC0 1.0',
    },
  ],
  [
    'about',
    {
      kicker: 'About the press',
      title: 'Where the form comes from.',
      note: 'A broadside was always the cheap, urgent, disposable format — printed to be handed out. This is that, for families and educators.',
      foot: 'CC0 1.0',
    },
  ],
]) {
  jobs.push({ slug, card: c });
}

/* Fingerprint on the card's own HTML plus the stylesheet it pulls in, exactly as
   build-pdfs.mjs does: re-rendering 31 PNGs on every build churns the repository
   and makes a real change invisible in a diff of thirty-one binaries. */
const cssHash = crypto
  .createHash('sha256')
  .update(fs.readFileSync(path.join(REPO, 'assets', 'press.css')))
  .digest('hex')
  .slice(0, 16);

const stampPath = path.join(REPO, 'og', 'index.json');
const stamp = fs.existsSync(stampPath) ? JSON.parse(fs.readFileSync(stampPath, 'utf8')) : {};
const next = {};

const cardsDir = path.join(REPO, 'og', '.cards');
fs.mkdirSync(cardsDir, { recursive: true });
fs.mkdirSync(path.join(REPO, 'og'), { recursive: true });

const todo = [];
for (const job of jobs) {
  const html = card(job.card);
  const fp = crypto.createHash('sha256').update(html).update(cssHash).digest('hex').slice(0, 16);
  next[job.slug] = fp;
  const png = path.join(REPO, 'og', job.slug + '.png');
  job.html = html;
  job.png = png;
  if (stamp[job.slug] !== fp || !fs.existsSync(png)) todo.push(job);
}

/* An orphan is a card for a page that no longer exists — it would go on being
   served and being wrong, with nothing pointing at it. */
const expected = new Set(jobs.map((j) => j.slug + '.png'));
const orphans = fs
  .readdirSync(path.join(REPO, 'og'))
  .filter((f) => f.endsWith('.png') && !expected.has(f));

if (checkOnly) {
  if (orphans.length) {
    console.error('  ORPHANED: ' + orphans.join(', '));
    process.exit(1);
  }
  if (todo.length) {
    console.error('  STALE: ' + todo.map((j) => j.slug).join(', '));
    console.error('  These cards no longer match their pages. Run without --check.');
    process.exit(1);
  }
  console.log('  ' + jobs.length + ' OG cards, all current.');
  process.exit(0);
}

for (const f of orphans) fs.unlinkSync(path.join(REPO, 'og', f));

if (!todo.length) {
  fs.writeFileSync(stampPath, JSON.stringify(next, null, 2) + '\n');
  console.log('  ' + jobs.length + ' OG cards, all current.');
  process.exit(0);
}

const site = await serve({ port: 8790 });
const browser = await launch();
let bytes = 0;

try {
  await browser.emulateScreen(W, H, 2);

  for (const job of todo) {
    const rel = path.join('og', '.cards', job.slug + '.html');
    fs.writeFileSync(path.join(REPO, rel), job.html);
    await browser.open(site.origin + '/' + rel);

    /* Fit the title by measuring it. Step down until the rendered block fits its
       box, rather than picking a size per title by eye and finding out on a
       timeline. Returns the size actually used, which is reported so a title
       that has been squeezed to the floor is visible here and not a surprise. */
    const fit = await browser.evaluate(`(() => {
      const og = document.querySelector('.og');
      const title = document.querySelector('.og__title');
      const note = document.querySelector('.og__note');
      /* DO NOT USE scrollHeight HERE. It only exceeds clientHeight on a scroll
         container, and this card is overflow:visible — so scrollHeight reports
         the box, never the overrun, and every title measures as fitting. That
         mistake has now been made three times in this codebase (the sheet
         overflow check, then twice here), so it is written down: measure the
         bottom of the deepest descendant against the card's content bottom. */
      const floor = og.getBoundingClientRect().top + og.clientHeight;
      const over = () => {
        let deepest = 0;
        for (const el of og.querySelectorAll('*')) {
          const b = el.getBoundingClientRect().bottom;
          if (b > deepest) deepest = b;
        }
        return deepest > floor + 0.5;
      };

      let t = 92, n = 30;
      title.style.fontSize = t + 'px';
      note.style.fontSize = n + 'px';

      /* Title first — it has the most room to give and is the least information
         per pixel. The note is the sentence that tells a reader whether this is
         the sheet they need, so it is shrunk only once the title is at its floor. */
      while (t > 34 && over()) { t -= 2; title.style.fontSize = t + 'px'; }
      while (n > 21 && over()) { n -= 1; note.style.fontSize = n + 'px'; }

      return { t, n, over: over() };
    })()`);

    /* If it still does not fit at the floor, say so rather than shipping a card
       that is clipped on somebody's timeline where we will never see it. */
    if (fit.over) {
      throw new Error(
        job.slug + ': card overflows even at the minimum type sizes.\n' +
          '  Shorten the note in tools/build-og.mjs, or the moment in sheets.json.'
      );
    }
    const size = fit.t;

    const png = await browser.screenshot();
    fs.writeFileSync(job.png, png);
    bytes += png.length;
    console.log(
      '  ' + (job.slug + '.png').padEnd(52) + String(Math.round(png.length / 1024)).padStart(4) + ' kB' +
        (size < 92 ? '   title ' + size + 'px' : '') + (fit.n < 30 ? '  note ' + fit.n + 'px' : '')
    );
  }
} finally {
  await browser.close();
  await site.close();
}

fs.writeFileSync(stampPath, JSON.stringify(next, null, 2) + '\n');
console.log(
  '\n  ' + todo.length + ' rebuilt · ' + jobs.length + ' cards on file · ' +
    Math.round(bytes / 1024) + ' kB written'
);
