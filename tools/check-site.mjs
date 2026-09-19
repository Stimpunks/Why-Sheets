#!/usr/bin/env node
/**
 * check-site.mjs — the gate that runs before anything ships.
 *
 * Five checks, in the order of how quietly each one fails in the wild.
 *
 *   1. INTERNAL LINKS AND ANCHORS. Every same-origin href has to resolve to a
 *      file, and every `#fragment` to an id that exists on the page it points
 *      at. This is the one that matters most here: the sheets carry
 *      hand-written tables of contents copied from WordPress, whose heading-id
 *      scheme is not ours, and a dangling anchor in a document somebody PRINTS
 *      is a reader turning to a page that is not there.
 *
 *   2. THE CONTENT-SECURITY-POLICY, checked against the markup rather than
 *      assumed. `_headers` declares `script-src 'self'` and `style-src 'self'`
 *      with no unsafe-inline. An inline <script>, a `style=` attribute or a
 *      third-party origin does not break the build — it breaks the PAGE, in
 *      production only, because the local preview sends no CSP at all. There is
 *      nothing else that would catch it before a reader does.
 *
 *   3. ONE H1, A TITLE, A DESCRIPTION, NO DUPLICATE IDS. Ordinary document
 *      hygiene, and the duplicate-id check earns its place because nine
 *      broadside blocks are spliced in from another repository.
 *
 *   4. CONTRAST, MEASURED IN A BROWSER, IN BOTH THEMES. Computed colours, not
 *      the values in the stylesheet, because what a reader sees is the cascade's
 *      answer and not the author's intention. WCAG AA: 4.5:1 for body text,
 *      3:1 for large text. A site for Disabled people that had never measured
 *      its own contrast would be an odd thing to publish.
 *
 *   5. EVERY PDF THE PAGES OFFER ACTUALLY EXISTS. A download button linking at
 *      nothing is worse than no button: somebody finds out in the moment they
 *      needed the file.
 *
 *     node tools/check-site.mjs
 *     node tools/check-site.mjs --check     # non-zero exit on any failure
 *     node tools/check-site.mjs --no-browser  # skip the contrast pass
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/chrome.mjs';
import { serve } from './lib/serve.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const gating = args.includes('--check');
const skipBrowser = args.includes('--no-browser');

const failures = [];
const fail = (where, what) => failures.push({ where, what });

/* ── collect the pages ──────────────────────────────────────────────────── */

/* `broadsides/source/` holds the mirrored WordPress blocks. They are source, not
   pages: each is a bare fragment with an inline <style> and an inline <script>,
   written to be pasted into a Custom HTML block and to open directly in a
   browser as a local preview. Checking them as pages condemned all nine, 47
   findings deep, for being exactly what they are meant to be. They are excluded
   here and redirected away in `_redirects`, so nobody lands on one and gets it
   unstyled under our CSP. */
const NOT_PAGES = new Set(['node_modules', 'tools', 'source']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || NOT_PAGES.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (entry.name.endsWith('.html')) out.push(abs);
  }
  return out;
}

const pages = walk(REPO).sort();
const rel = (abs) => path.relative(REPO, abs);

/* The URL a page is served at, so a root-absolute href can be resolved. */
const idsByPath = new Map();
const docs = new Map();

for (const abs of pages) {
  const html = fs.readFileSync(abs, 'utf8');
  docs.set(abs, html);
  const urlPath = '/' + rel(abs).replace(/index\.html$/, '');
  idsByPath.set(urlPath, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  if (urlPath.endsWith('/')) idsByPath.set(urlPath.replace(/\/$/, ''), idsByPath.get(urlPath));
  idsByPath.set('/' + rel(abs), idsByPath.get(urlPath));
}

/* ── 1. links, 2. CSP shape, 3. hygiene ─────────────────────────────────── */

const resolveTarget = (href, fromAbs) => {
  const clean = href.split('?')[0];
  if (clean === '' || clean === '/') return path.join(REPO, 'index.html');
  const base = clean.startsWith('/') ? path.join(REPO, clean) : path.resolve(path.dirname(fromAbs), clean);
  if (fs.existsSync(base) && fs.statSync(base).isDirectory()) return path.join(base, 'index.html');
  return base;
};

for (const abs of pages) {
  const html = docs.get(abs);
  const where = rel(abs);

  /* A `print.html` is not a page of the site. It is the standalone document
     Chrome prints to make a broadside's PDF: the block's own markup and its own
     stylesheet, with no site chrome at all, and that is the point — what the
     printer receives has to be what the printer receives upstream. It carries no
     <h1>, no meta description and no navigation, and adding them would change
     the printed sheet. Its links and its PDFs are still checked; its document
     hygiene is not, because it is not that kind of document.
     Its inline <style> is exempt for the same reason with one caveat recorded
     honestly: it IS served publicly, so a reader who opens it directly gets it
     unstyled under our CSP. Nothing links to it and no sitemap lists it. */
  const isPrintDocument = /(^|\/)print\.html$/.test(where);

  /* --- CSP shape --- */
  /* A <script> with a body, as opposed to one that only carries a src. */
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (m[2].trim() && !/\bsrc=/.test(m[1])) {
      fail(where, "inline <script> body — blocked by script-src 'self'");
    }
  }
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) {
    if (m[1].trim() && !isPrintDocument) fail(where, "inline <style> — blocked by style-src 'self'");
  }
  if (/\sstyle="/.test(html)) fail(where, "inline style= attribute — blocked by style-src 'self'");
  for (const m of html.matchAll(/\s(?:src|href)="(https?:\/\/[^"]+)"/g)) {
    /* rel=canonical, og:url and outbound citations are LINKS, not subresource
       loads, and CSP does not govern them. Only what the browser fetches counts:
       scripts, stylesheets, fonts, images.
       The tag has to be sliced to its own closing bracket. Reading a fixed
       window past the href instead ran into the NEXT element, so every page's
       rel=canonical was condemned by the rel="stylesheet" on the line below it —
       47 pages of confident, wrong output. */
    const tagStart = html.lastIndexOf('<', m.index);
    const tagEnd = html.indexOf('>', m.index);
    const tag = html.slice(tagStart, tagEnd === -1 ? undefined : tagEnd + 1);
    const fetched =
      /^<(script|img|source|iframe|embed|object)\b/.test(tag) ||
      (/^<link\b/.test(tag) && /rel="(stylesheet|preload|prefetch|modulepreload)"/.test(tag));
    if (fetched) fail(where, 'external subresource ' + m[1] + " — blocked by default-src 'none'");
  }

  /* --- hygiene --- */
  if (!isPrintDocument) {
    const h1s = [...html.matchAll(/<h1\b/g)].length;
    if (h1s !== 1) fail(where, h1s + ' <h1> elements, expected exactly 1');
    if (!/<meta name="description" content="[^"]+"/.test(html)) fail(where, 'no meta description');
  }
  if (!/<title>[^<]+<\/title>/.test(html)) fail(where, 'no <title>');

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) fail(where, 'duplicate id="' + id + '"');
    seen.add(id);
  }

  /* --- links --- */
  for (const m of html.matchAll(/\shref="([^"]+)"/g)) {
    const href = m[1];
    if (/^(https?:|mailto:|tel:|data:)/.test(href)) continue;

    const [target, frag] = href.split('#');

    if (target === '') {
      /* A bare #fragment: must exist on this page. */
      if (frag && !seen.has(frag)) fail(where, 'anchor #' + frag + ' matches no id on this page');
      continue;
    }

    const file = resolveTarget(target, abs);
    if (!fs.existsSync(file)) {
      fail(where, 'link ' + href + ' resolves to nothing (' + rel(file) + ')');
      continue;
    }
    if (frag) {
      const known = idsByPath.get(target.endsWith('/') ? target : target + '/') || idsByPath.get(target);
      if (known && !known.has(frag)) fail(where, 'link ' + href + ' points at an id that page does not have');
    }
  }

  /* --- no dead controls from a spliced-in block --- */
  /* The broadside blocks ship with a Side A / Side B toggle and a Print button
     that only work with the inline script the CSP forbids. They are stripped at
     build time — twice unsuccessfully, because a regex cannot match balanced
     tags. A button that does nothing is worse than no button: somebody presses
     Print, nothing happens, and they conclude the site is broken. */
  if (/class="[^"]*\bsb-controls\b/.test(html)) {
    fail(where, 'a broadside block\'s Side A / Side B toggle survived the build — it has no script and does nothing');
  }

  /* --- the prompt a page offers to copy --- */
  /* data-copy-prompt is an ATTRIBUTE, not an href, so the link loop above never
     sees it. A sheet that loses its asks section stops having a prompt generated
     while its page goes on offering a button that fetches a 404 — and the button
     fails silently into "Could not copy", which reads as a broken site rather
     than a missing file. Check the target like any other link. */
  for (const m of html.matchAll(/data-copy-prompt="([^"]+)"/g)) {
    if (!fs.existsSync(path.join(REPO, m[1])))
      fail(where, 'offers to copy ' + m[1] + ', which does not exist');
  }

  /* --- 5. the PDFs the page offers --- */
  for (const m of html.matchAll(/href="(\/pdf\/[^"]+\.pdf)"/g)) {
    if (!fs.existsSync(path.join(REPO, m[1]))) fail(where, 'offers ' + m[1] + ', which does not exist');
  }
}

console.log('  ' + pages.length + ' pages checked for links, CSP shape, headings, ids, prompts and PDFs.');

/* ── 4. contrast, in a browser, in both themes ──────────────────────────── */

if (!skipBrowser) {
  const site = await serve({ port: 8790 });
  const browser = await launch({ port: 9415 });

  /* Sample every page kind rather than every page: the fourteen sheet pages
     share one template and one stylesheet, so measuring all of them measures
     the same rules fourteen times. One of each kind, plus the longest sheet. */
  const sample = [
    '/', '/about/', '/packet/', '/broadsides/',
    '/sheets/alternatives-to-aba/', '/sheets/monotropism/',
    '/broadsides/eye-contact/', '/404.html',
  ];

  const MEASURE = `(() => {
    const srgb = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
    const parse = (s) => (s.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
    const alpha = (s) => { const p = (s.match(/[\\d.]+/g) || []); return p.length > 3 ? Number(p[3]) : 1; };
    const bgOf = (el) => {
      let node = el;
      while (node && node !== document.documentElement) {
        const c = getComputedStyle(node).backgroundColor;
        if (c && alpha(c) > 0.95) return parse(c);
        node = node.parentElement;
      }
      return parse(getComputedStyle(document.documentElement).backgroundColor || 'rgb(255,255,255)');
    };
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('[hidden]') || el.hidden) continue;
      const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
      if (!text) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      const fg = parse(cs.color);
      const bg = bgOf(el);
      const L1 = lum(fg), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const px = parseFloat(cs.fontSize);
      const weight = Number(cs.fontWeight) || 400;
      const large = px >= 24 || (px >= 18.66 && weight >= 700);
      const need = large ? 3 : 4.5;
      if (ratio < need - 0.005) {
        out.push({
          sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : ''),
          text: text.slice(0, 44), ratio: Math.round(ratio * 100) / 100, need, px: Math.round(px * 10) / 10,
        });
      }
    }
    return JSON.stringify(out);
  })()`;

  let contrastFailures = 0;
  try {
    for (const theme of ['light', 'dark']) {
      for (const url of sample) {
        await browser.open(site.origin + url);
        await browser.evaluate("document.documentElement.setAttribute('data-theme','" + theme + "')");
        const found = JSON.parse(await browser.evaluate(MEASURE));
        for (const f of found) {
          contrastFailures++;
          fail(
            url + ' [' + theme + ']',
            'contrast ' + f.ratio + ':1 needs ' + f.need + ':1 at ' + f.px + 'px — ' +
              f.sel + ' — "' + f.text + '"'
          );
        }
      }
    }
  } finally {
    await browser.close();
    await site.close();
  }
  console.log(
    '  ' + sample.length * 2 + ' page/theme combinations measured for contrast · ' +
      contrastFailures + ' below WCAG AA.'
  );
} else {
  console.log('  contrast pass skipped (--no-browser)');
}

/* ── report ─────────────────────────────────────────────────────────────── */

console.log();
if (!failures.length) {
  console.log('  Everything passes.');
  process.exit(0);
}

const byWhere = new Map();
for (const f of failures) {
  if (!byWhere.has(f.where)) byWhere.set(f.where, []);
  byWhere.get(f.where).push(f.what);
}
for (const [where, list] of byWhere) {
  console.log('  ' + where);
  for (const what of list) console.log('      ' + what);
}
console.log();
console.log('  ' + failures.length + ' failure' + (failures.length === 1 ? '' : 's') + ' across ' + byWhere.size + ' pages.');
process.exit(gating ? 1 : 0);
