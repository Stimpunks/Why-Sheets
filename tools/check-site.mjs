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
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/chrome.mjs';
import { serve } from './lib/serve.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* From the manifest, not a literal: the host moved once already (whysheet.press
   replaced whysheets.press before launch) and a checker carrying its own copy
   would have kept passing against the old one. */
const HOST = JSON.parse(fs.readFileSync(path.join(REPO, 'sheets.json'), 'utf8')).press.host;
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
  /* A <script> with a body, as opposed to one that only carries a src.
   *
   * DATA BLOCKS ARE EXEMPT, AND ONLY DATA BLOCKS. `script-src` governs script
   * the browser EXECUTES. A <script> whose type is not a JavaScript MIME type —
   * application/ld+json here — is a data block: the HTML parser stores its text
   * and never runs it, so no inline-script check applies and a strict CSP with
   * no 'unsafe-inline' does not block it. That is why every site with a real CSP
   * still ships JSON-LD inline.
   *
   * The exemption is by exact type, not by "has a type attribute", because
   * type="module" and type="text/javascript" both execute.
   *
   * VERIFIED AGAINST THE LIVE CSP, not taken from a reading of the spec: with
   * the real header served by Netlify, /sheets/hoodie/ reports zero console
   * errors, the JSON-LD parses out of the DOM, and the page's own module script
   * still runs — so the policy is active and accepted the data block. Checking
   * locally could not have shown this: the preview server sends no CSP at all,
   * which is the whole reason this class of error only ever appears in
   * production. */
  const DATA_BLOCK = /\btype=["']application\/ld\+json["']/i;
  /* Speculation rules ARE executed-ish as far as CSP is concerned — script-src
     governs them, which is why _headers carries 'inline-speculation-rules'. So
     the exemption here is conditional on that keyword actually being in the
     policy: drop the keyword and this check starts failing again, which is the
     correct behaviour rather than a permanently blind spot. */
  const SPECULATION = /\btype=["']speculationrules["']/i;
  const cspAllowsSpeculation = fs
    .readFileSync(path.join(REPO, '_headers'), 'utf8')
    .includes("'inline-speculation-rules'");
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (SPECULATION.test(m[1])) {
      if (!cspAllowsSpeculation) {
        fail(where, "inline speculation rules but the CSP lacks 'inline-speculation-rules'");
      }
      continue;
    }
    if (m[2].trim() && !/\bsrc=/.test(m[1]) && !DATA_BLOCK.test(m[1])) {
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

  /* --- the Markdown alternate resolves --- */
  /* A rel="alternate" is not an href the link loop checks, and it is an absolute
     URL besides, so nothing else here would notice it rotting. */
  for (const m of html.matchAll(/<link rel="alternate" type="text\/markdown" href="([^"]+)"/g)) {
    const pre = 'https://' + HOST;
    if (!m[1].startsWith(pre) || !fs.existsSync(path.join(REPO, m[1].slice(pre.length)))) {
      fail(where, 'markdown alternate ' + m[1] + ' resolves to nothing');
    }
  }

  /* --- the feed autodiscovery link resolves --- */
  /* Same blind spot as the line above, and the same fix. This one is on EVERY
     page, so a typo in the shell would advertise a feed that is not there to
     every reader that ever looks for one. */
  for (const m of html.matchAll(/<link rel="alternate" type="application\/rss\+xml"[^>]*href="([^"]+)"/g)) {
    const target = m[1].replace('https://' + HOST, '');
    if (!fs.existsSync(path.join(REPO, target.replace(/^\//, '')))) {
      fail(where, 'feed autodiscovery points at ' + m[1] + ', which resolves to nothing');
    }
  }

  /* --- JSON-LD is valid JSON --- */
  /* Structured data that does not parse is worse than none: a consumer that
     chokes on it may discard the page's metadata entirely. It is generated, so
     this only fires if the generator breaks — which is exactly when nobody is
     looking at the <head> of a sheet. */
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1].replace(/\\u003c/g, '<'));
      if (!data['@context'] || !data['@type']) fail(where, 'JSON-LD has no @context or @type');
    } catch {
      fail(where, 'JSON-LD does not parse as JSON');
    }
  }

  /* --- every table names itself --- */
  /* A screen reader announces a table by its <caption>. Without one it says
     "table" and the listener has to read cells to work out what they are looking
     at. lib/md.mjs derives one from the heading above the table, so this only
     fires if that stops working or a table arrives from somewhere else. */
  /* A GREEDY window, not a lazy one. `([\s\S]{0,200}?)<` stops at the FIRST
     `<`, which is the newline before <caption> — so the capture is "\n", it
     never contains <caption>, and the check fails on a table that is correct.
     It fired when the caption was removed and went on firing once it was put
     back, which is a gate stuck on rather than a gate working. */
  for (const m of html.matchAll(/<table\b[^>]*>([\s\S]{0,200})/g)) {
    if (!/<caption/.test(m[1])) fail(where, 'a <table> has no <caption>');
  }

  /* --- the Open Graph card --- */
  /* An og:image is emitted as an absolute URL, so nothing else on this page
     resolves it and no link check would ever notice it rotting. A broken one is
     worse than none: the client renders an empty frame where the card should be,
     and we would only ever find out by seeing our own link in somebody's feed. */
  for (const m of html.matchAll(/<meta property="og:image" content="([^"]+)">/g)) {
    const u = m[1];
    const pre = 'https://' + HOST;
    if (!u.startsWith(pre)) {
      fail(where, 'og:image ' + u + ' is not on ' + HOST);
      continue;
    }
    if (!fs.existsSync(path.join(REPO, u.slice(pre.length))))
      fail(where, 'og:image ' + u + ' resolves to nothing');
  }

  /* Every page somebody could share should have a card. Two exceptions, and both
     are the same reason in different clothes: a print.html is the document Chrome
     prints, not a page (see the note above), and 404.html is not a destination
     anyone links to on purpose. */
  const shareable = !isPrintDocument && !/(^|\/)404\.html$/.test(where);
  if (shareable && !/property="og:image"/.test(html)) {
    fail(where, 'has no og:image — a shared link to it arrives as grey text');
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

/* --- the agent skill's digest, and every link in the catalogue --- */
{
  const skillIdx = path.join(REPO, '.well-known', 'agent-skills', 'index.json');
  if (fs.existsSync(skillIdx)) {
    const idx = JSON.parse(fs.readFileSync(skillIdx, 'utf8'));
    if (!/\/0\.2\.0\//.test(idx.$schema || '')) {
      fail('.well-known/agent-skills/index.json',
        'no 0.2.0 $schema — clients fall back to 0.1.0 parsing and may ignore the entries');
    }
    for (const skill of idx.skills || []) {
      /* A DRIFTED DIGEST IS WORSE THAN NO DIGEST: the RFC says a compliant
         client refuses an artefact it cannot verify, so a stale hash silently
         turns the skill off rather than serving an old one. It is generated
         from the bytes in the same build, so this only fires if that breaks. */
      const rel_ = skill.url.replace('https://' + HOST + '/', '');
      const file = path.join(REPO, rel_);
      if (!fs.existsSync(file)) {
        fail('.well-known/agent-skills/index.json', 'names ' + skill.url + ', which does not exist');
        continue;
      }
      const got = 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      if (got !== skill.digest) {
        fail('.well-known/agent-skills/index.json',
          'digest for ' + skill.name + ' does not match the file it names');
      }
      const body = fs.readFileSync(file, 'utf8');
      if (!/^---\r?\n[\s\S]*?\bname:\s*\S/.test(body) || !/\bdescription:\s*\S/.test(body)) {
        fail(rel_, 'SKILL.md frontmatter needs both name and description');
      }
    }
  }

  const cat = path.join(REPO, '.well-known', 'api-catalog');
  if (fs.existsSync(cat)) {
    const linkset = JSON.parse(fs.readFileSync(cat, 'utf8')).linkset || [];
    /* RFC 8288: an extension relation type must be a URI. A bare token that
       IANA has not registered makes the document invalid, and RFC 9727's named
       failure mode is a strict client skipping all of it. */
    const IANA = new Set([
      'describedby', 'sitemap', 'alternate', 'license', 'author',
      'privacy-policy', 'terms-of-service', 'service-desc', 'service-doc', 'status',
    ]);
    for (const entry of linkset) {
      for (const [relName, links] of Object.entries(entry)) {
        if (relName === 'anchor') continue;
        if (!IANA.has(relName) && !/^https?:\/\//.test(relName)) {
          fail('.well-known/api-catalog',
            'relation "' + relName + '" is neither IANA-registered nor a URI');
        }
        for (const l of links) {
          /* Every URL it points at must 200 from this origin — the spec's own
             verification step, done against the build rather than the network. */
          if (!l.href.startsWith('https://' + HOST + '/')) continue;
          const f = l.href.replace('https://' + HOST + '/', '');
          const onDisk = path.join(REPO, f.endsWith('/') ? f + 'index.html' : f);
          if (!fs.existsSync(onDisk)) {
            fail('.well-known/api-catalog', 'points at ' + l.href + ', which does not exist');
          }
        }
      }
    }
  }
}

/* --- the feed --- */
/* A FEED FAILS SILENTLY AND PERMANENTLY. Nobody reports a broken feed: their
   reader shows an error once, or simply stops updating, and they conclude the
   press went quiet. There is no analytics here to notice the drop-off either.
   So everything about it that could rot is asserted here.

   The one that actually matters is the last: an item's guid is a permalink into
   /changelog/, and a reader clicking it lands on the anchor. If the id it names
   is not on that page, the browser drops them at the top of a page of releases
   with no indication which one they came for. That is exactly the dangling
   anchor this repository already gates on in printed packets — same failure,
   different medium. */
{
  const feedPath = path.join(REPO, 'feed.xml');
  if (!fs.existsSync(feedPath)) {
    fail('feed.xml', 'missing — run tools/build-site.mjs');
  } else {
    const xml = fs.readFileSync(feedPath, 'utf8');

    /* Well-formedness, without an XML parser. Strip every complete tag; what is
       left is text content, and text content may not contain a bare `<`, `>` or
       an `&` that does not open a known entity. This is the shape of the real
       failure: a changelog entry quotes markup or an ampersand, the escaping
       misses it, and every reader rejects the whole document — not just the one
       item — because XML is not permitted to recover. */
    const text = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<[^<>]*>/g, '');
    if (/[<>]/.test(text)) fail('feed.xml', 'an unescaped < or > reaches the XML text — no reader will parse this');
    for (const m of text.matchAll(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g)) {
      fail('feed.xml', 'a bare & at offset ' + m.index + ' of the text — XML has no error recovery for it');
    }

    /* RSS 2.0 has no self-reference; this is the one Atom element it borrows,
       and aggregators use it to tell where a feed lives after it is copied. */
    const self = /<atom:link href="([^"]+)" rel="self"/.exec(xml);
    if (!self) fail('feed.xml', 'no <atom:link rel="self"> — every validator asks for it');
    else if (self[1] !== 'https://' + HOST + '/feed.xml')
      fail('feed.xml', 'rel="self" says ' + self[1] + ', which is not where this file is served');

    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
    if (!items.length) fail('feed.xml', 'has no items');

    const stamps = new Set();
    const changelogIds = idsByPath.get('/changelog/');
    if (!changelogIds) fail('feed.xml', 'there is no /changelog/ page for its items to point at');

    for (const item of items) {
      const guid = /<guid[^>]*>([^<]+)<\/guid>/.exec(item);
      const title = /<title>([^<]*)<\/title>/.exec(item);
      const date = /<pubDate>([^<]+)<\/pubDate>/.exec(item);
      const where = 'feed.xml item "' + (title ? title[1].slice(0, 40) : '(untitled)') + '"';

      if (!title || !title[1].trim()) fail(where, 'has no title');
      if (!/<description>/.test(item)) fail(where, 'has no description — it would show as a bare headline');

      /* EVERY LINK IN A FEED ITEM MUST BE ABSOLUTE. A feed reader has no base
         URL — it is showing our HTML inside its own document, often inside its
         own origin — so an href of "/sheets/hoodie/" resolves against the
         READER and 404s there. It works perfectly on the page it came from,
         which is the only place anybody would think to check it. The entries in
         CHANGELOG.md happen to be written with absolute URLs today; nothing
         about writing the next one makes that obvious. */
      for (const h of item.matchAll(/&lt;a href=&quot;(?!https?:|mailto:)([^&]*)&quot;/g)) {
        fail(where, 'links to "' + h[1] + '", which is relative — in a feed reader that resolves against their site, not ours');
      }

      if (!date) fail(where, 'has no pubDate');
      else {
        const t = Date.parse(date[1]);
        if (Number.isNaN(t)) fail(where, 'pubDate "' + date[1] + '" is not RFC 822');
        else if (stamps.has(t)) {
          /* Two items at the same instant sort arbitrarily, and most readers
             reverse them — so the oldest release in the feed presents as the
             newest thing on the press. lib/changelog.mjs spreads same-day
             entries a minute apart to prevent exactly this. */
          fail(where, 'shares a pubDate with another item — readers will not agree on their order');
        } else stamps.add(t);
      }

      if (!guid) {
        fail(where, 'has no guid — a reader cannot tell it from a revision of another item');
        continue;
      }
      const pre = 'https://' + HOST + '/changelog/#';
      if (!guid[1].startsWith(pre)) {
        fail(where, 'guid ' + guid[1] + ' is not a permalink into /changelog/');
        continue;
      }
      const frag = guid[1].slice(pre.length);
      if (changelogIds && !changelogIds.has(frag)) {
        fail(where, 'points at #' + frag + ', which is not an id on /changelog/');
      }
    }
  }
}

/* --- the icon set and the manifest --- */
/* A <link rel="icon"> pointing at nothing is invisible: the browser silently
   falls back to /favicon.ico, and if that is missing too the tab just shows a
   blank page and every crawler logs a 404 forever. Nothing about a missing icon
   announces itself, which is why it is checked rather than noticed. */
{
  for (const f of [
    'favicon.svg',
    'favicon.ico',
    'apple-touch-icon.png',
    'icon-192.png',
    'icon-512.png',
    'icon-maskable-512.png',
    'site.webmanifest',
  ]) {
    if (!fs.existsSync(path.join(REPO, f))) fail(f, 'missing — run tools/build-icons.mjs');
  }

  const mf = path.join(REPO, 'site.webmanifest');
  if (fs.existsSync(mf)) {
    let m = null;
    try {
      m = JSON.parse(fs.readFileSync(mf, 'utf8'));
    } catch {
      fail('site.webmanifest', 'does not parse as JSON');
    }
    if (m) {
      /* Every icon the manifest names has to exist, or an install silently gets
         a generic glyph — and an install is the one surface nobody re-checks. */
      for (const icon of m.icons || []) {
        if (!fs.existsSync(path.join(REPO, icon.src.replace(/^\//, '')))) {
          fail('site.webmanifest', 'names ' + icon.src + ', which does not exist');
        }
      }
      if (!(m.icons || []).some((i) => /\bmaskable\b/.test(i.purpose || ''))) {
        fail('site.webmanifest', 'no maskable icon — Android crops the "any" icon to its own shape');
      }
    }
  }
}

/* --- every sheet serves its Markdown source --- */
{
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'sheets.json'), 'utf8'));
  for (const sheet of manifest.sheets) {
    if (!fs.existsSync(path.join(REPO, 'sheets', sheet.slug + '.md'))) {
      fail('sheets/' + sheet.slug + '.md', 'no Markdown source endpoint for this sheet');
    }
  }
}

/* --- security.txt has not quietly lapsed --- */
/* RFC 9116 makes Expires mandatory and a lapsed file INVALID — a researcher's
   tooling will discard it, which is the opposite of the point. This only fires
   when nothing has been rebuilt for about eleven months; that is precisely the
   case a calendar reminder never catches, because by then nobody is thinking
   about this file.

   THIS THRESHOLD IS HALF OF A PAIR. build-site.mjs carries the committed
   Expires forward untouched while it has time left, and mints a new one when
   fewer than 45 days remain (SECURITY_TXT_RENEW_WITHIN) — it does not recompute
   it on every run, because a value taken from the clock made the file differ
   from its committed copy on every build and jammed the staleness check on.
   The renewal window there MUST stay wider than the 30 days here. If this
   number ever rises above 45, there is a band of dates in which this fails and
   rebuilding does not mint a new date, so nothing clears it. Move them
   together, and keep the margin. */
{
  const f = path.join(REPO, '.well-known', 'security.txt');
  if (!fs.existsSync(f)) {
    fail('.well-known/security.txt', 'missing');
  } else {
    const txt = fs.readFileSync(f, 'utf8');
    const m = /^Expires:\s*(\S+)/m.exec(txt);
    if (!m) {
      fail('.well-known/security.txt', 'no Expires field — RFC 9116 makes the file invalid without one');
    } else {
      const days = (Date.parse(m[1]) - Date.now()) / 864e5;
      if (!Number.isFinite(days)) {
        fail('.well-known/security.txt', 'Expires is not a parseable timestamp: ' + m[1]);
      } else if (days < 30) {
        fail('.well-known/security.txt',
          'Expires is ' + Math.round(days) + ' days away — rebuild to renew it before it lapses');
      }
    }
    if (!/^Contact:\s*\S/m.test(txt)) {
      fail('.well-known/security.txt', 'no Contact field — RFC 9116 requires at least one');
    }
  }
}

/* --- the print documents are told not to be indexed --- */
/* A print.html is a bare fragment with no landmarks and no navigation, served
   publicly because the PDF build fetches it over HTTP. robots.txt allows
   everything, so without an explicit header a search engine that finds one
   indexes it as though it were a page of the site. This is a header rather than
   a <meta>, because adding a meta robots tag to the printed document would
   change what the printer receives — which is the one thing that file exists to
   keep constant. */
{
  const headers = fs.readFileSync(path.join(REPO, '_headers'), 'utf8');
  /* The window has to clear that rule's comment, which explains why the file is
     not a page and runs well past 400 characters. Too small a window is a gate
     that fails on its own correct configuration. */
  const hasRule = /\/broadsides\/\*\/print\.html[\s\S]{0,1200}?X-Robots-Tag:\s*noindex/.test(headers);
  const printDocs = pages.filter((p) => /(^|\/)print\.html$/.test(rel(p))).length;
  if (printDocs && !hasRule) {
    fail('_headers', printDocs + ' print.html documents are served with no X-Robots-Tag: noindex');
  }
}

console.log('  ' + pages.length + ' pages checked for links, CSP shape, headings, ids, tables, JSON-LD, Markdown sources, icons, OG cards, prompts and PDFs.');

/* ── 4. contrast, in a browser, in both themes ──────────────────────────── */

if (!skipBrowser) {
  const site = await serve({ port: 8790 });
  const browser = await launch({ port: 9415 });

  /* Sample every page kind rather than every page: the fourteen sheet pages
     share one template and one stylesheet, so measuring all of them measures
     the same rules fourteen times. One of each kind, plus the longest sheet. */
  const sample = [
    '/', '/about/', '/packet/', '/broadsides/', '/changelog/',
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
