/**
 * md.mjs — the Markdown subset the Why Sheets are actually written in.
 *
 * WHY A HAND-ROLLED PARSER AND NOT A DEPENDENCY
 * The sibling Stimpunks static sites (Star Stuff, Penguin Pebbling, Queering
 * Earth) carry no package.json at all: every tool is zero-dependency Node with
 * its reasoning written down beside it. A Markdown library here would be the
 * first `node_modules` in the family, to parse fourteen files written in a
 * grammar narrow enough to list. So this handles that grammar and REPORTS
 * anything outside it, rather than degrading quietly. A parser that silently
 * drops an element is how a printed packet comes to say less than the sheet —
 * and the packet is the thing somebody carries into a meeting.
 *
 * THE GRAMMAR, in full:
 *   #..###### headings · paragraphs · > blockquotes (with an attribution line)
 *   - and 1. lists · --- or ---- horizontal rules · ``` code fences
 *   **strong** *em* `code` [text](url) <https://autolink> and backslash escapes
 *   two trailing spaces = hard break (the License block relies on this)
 *
 * BLOCKQUOTE ATTRIBUTION IS A SEPARATE THING, not a paragraph. Every sheet is
 * built out of sourced quotations — that is what makes it usable in a room where
 * someone will ask "says who?" — and the last line of a quote is nearly always
 * the source, sometimes with an em dash, sometimes without. Rendering it as
 * <footer><cite> rather than a second paragraph is what lets the stylesheet set
 * it apart on paper, and what lets the citation count mean anything.
 *
 * ULYSSES ESCAPES ARE HANDLED AS REAL MARKDOWN, NOT SWEPT UP. A backslashed
 * asterisk renders as a literal asterisk here, which is what the syntax means.
 * It is also exactly what a Ulysses-damaged sheet looks like, so the repair
 * belongs in the source, not in the renderer — tools/check-ulysses.mjs is the
 * gate that says so out loud.
 */

const NUL = String.fromCharCode(0);
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ESC[c]);

/* Slug for a heading id. Lowercase, strip apostrophes entirely (rather than
   turning them into hyphens, which is what WordPress does and which is why
   /why/ tables of contents can point at headings that do not exist), collapse
   everything else to single hyphens. resolveAnchors() below reconciles this
   against whatever the hand-written TOCs in the sheets already say. */
export const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/* A loose key for matching two anchors that mean the same heading but were
   spelled by different slug algorithms: letters and digits only.
 *
 * The leading `h-` comes off first. That prefix is WordPress's, added to every
 * heading id the block editor generates, and the Monotropism sheet's
 * table of contents was written by copying anchors back off the published page:
 * all seventeen of its entries point at `#h-what-this-is` and friends. Without
 * this the TOC of the longest sheet in the library resolves to nothing. */
const looseKey = (s) =>
  s.toLowerCase().replace(/^h-/, '').replace(/[^a-z0-9]+/g, '');

/* What a link should say when it is printed on paper, where nobody can click it.
 *
 * Normally: the URL itself, because a citation a reader cannot follow is not a
 * citation. But the Hoodie sheet carries a SIGNED AMAZON S3 URL of about 1,500
 * characters — an expired one, at that. Printed in full at 8pt it filled most of
 * a side of paper with hexadecimal, on a two-page sheet, for a source nobody
 * could ever reach by typing it. So a long URL is shortened to the part a person
 * could actually use: the host and the first step of the path. The full address
 * is still in the PDF as a real hyperlink and still in the HTML; only the ink
 * spent on it is capped. */
const PRINT_URL_MAX = 96;
function printForm(url) {
  if (url.length <= PRINT_URL_MAX) return url;
  const m = /^(https?:\/\/[^/]+)(\/[^/?#]*)?/.exec(url);
  if (!m) return url.slice(0, PRINT_URL_MAX) + '\u2026';
  return (m[1] + (m[2] || '') + '/\u2026').replace(/^https?:\/\//, '');
}

/* ── inline ─────────────────────────────────────────────────────────────── */

/* Placeholders keep already-rendered spans away from later passes: a URL
   containing an underscore or an asterisk must not be re-read as emphasis. */
function inline(src) {
  const held = [];
  const hold = (html) => NUL + (held.push(html) - 1) + NUL;

  let s = src;

  /* Backslash escapes first, held so nothing downstream sees the character. */
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!~<>|])/g, (_, c) => hold(escapeHtml(c)));

  /* `code` before links: a backtick span is opaque. */
  s = s.replace(/`([^`]+)`/g, (_, c) => hold('<code>' + escapeHtml(c) + '</code>'));

  /* [text](url). The URL may carry parentheses and a long query string — the
     Hoodie sheet holds a 1.5 kB signed S3 URL that proves it — so the pattern
     tolerates balanced pairs rather than stopping at the first ')'. */
  s = s.replace(/\[([^\]]*)\]\(\s*([^\s)]+(?:\([^)]*\)[^\s)]*)*)\s*\)/g, (_, text, url) => {
    const safe = /^(https?:|mailto:|#|\/)/i.test(url) ? url : '#';
    const external = /^https?:/i.test(safe);
    const printable = external ? ' data-print-url="' + escapeHtml(printForm(safe)) + '"' : '';
    return hold(
      '<a href="' + escapeHtml(safe) + '"' + (external ? ' rel="noopener"' : '') + printable + '>' +
        inline(text) + '</a>'
    );
  });

  /* <https://…> autolinks. */
  s = s.replace(/<((?:https?|mailto):[^>\s]+)>/g, (_, url) =>
    hold('<a href="' + escapeHtml(url) + '" rel="noopener">' + escapeHtml(url) + '</a>')
  );

  s = escapeHtml(s);

  /* Three-asterisk runs before two before one, or a ***triple*** comes out as an
     italic wearing two loose asterisks — precisely the damage the Week 37
     changelog shipped 37 times. */
  s = s.replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*(?=\S)([^*]*?\S)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/(^|\s)_(?=\S)([^_]*?\S)_(?!\w)/g, '$1<em>$2</em>');

  return s.replace(new RegExp(NUL + '(\\d+)' + NUL, 'g'), (_, i) => held[+i]);
}

/* ── blocks ─────────────────────────────────────────────────────────────── */

const isRule = (l) => /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l);
const isHeading = (l) => /^(#{1,6})\s+(.*)$/.exec(l);
const isBullet = (l) => /^\s*[-*+]\s+(.*)$/.exec(l);
const isNumber = (l) => /^\s*(\d+)[.)]\s+(.*)$/.exec(l);

function paragraphs(lines) {
  const out = [];
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    /* A run of lines is ONE paragraph unless some line ended in two spaces,
       which is the hard break the License block uses to keep Version, License
       and Repository on three lines of their own. */
    const hard = buf.some((l) => /\S {2,}$/.test(l));
    out.push(
      hard
        ? '<p>' + buf.map((l) => inline(l.replace(/\s+$/, ''))).join('<br>\n') + '</p>'
        : '<p>' + inline(buf.join(' ').replace(/\s+/g, ' ').trim()) + '</p>'
    );
    buf = [];
  };
  for (const l of lines) {
    if (!l.trim()) flush();
    else buf.push(l);
  }
  flush();
  return out.join('\n');
}

function renderQuote(lines) {
  const blocks = [];
  let buf = [];
  for (const l of lines) {
    if (!l.trim()) {
      if (buf.length) {
        blocks.push(buf);
        buf = [];
      }
    } else buf.push(l);
  }
  if (buf.length) blocks.push(buf);
  if (!blocks.length) return { html: '', cite: null };

  let cite = null;
  const last = blocks[blocks.length - 1].join(' ').trim();
  const dashed = /^[—–-]\s*(.+)$/.exec(last);
  const bare = /^\[[^\]]+\]\([^\s)]+(?:\([^)]*\)[^\s)]*)*\)[.,]?$/.test(last);
  if (dashed || bare) {
    cite = dashed ? dashed[1] : last;
    blocks.pop();
  }

  const body = blocks.map((b) => '<p>' + inline(b.join(' ')) + '</p>').join('\n');
  const foot = cite ? '\n<footer>— <cite>' + inline(cite) + '</cite></footer>' : '';
  return { html: '<blockquote>\n' + body + foot + '\n</blockquote>', cite };
}

/**
 * Render a whole sheet.
 * @returns {{html:string, headings:Array, quotes:number, cited:number,
 *            links:string[], unknown:string[]}}
 */
export function render(md) {
  const src = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const headings = [];
  const unknown = [];
  const ids = new Set();
  let quotes = 0;
  let cited = 0;
  let i = 0;
  let buf = [];

  const flushText = () => {
    if (buf.length) {
      out.push(paragraphs(buf));
      buf = [];
    }
  };

  while (i < src.length) {
    const line = src[i];

    const h = isHeading(line);
    if (h) {
      flushText();
      const level = h[1].length;
      const text = h[2].trim().replace(/\s*#+\s*$/, '');
      const base = slugify(text) || 'section-' + (headings.length + 1);
      let id = base;
      let n = 2;
      while (ids.has(id)) id = base + '-' + n++;
      ids.add(id);
      headings.push({ level, text, id });
      out.push('<h' + level + ' id="' + id + '">' + inline(text) + '</h' + level + '>');
      i++;
      continue;
    }

    if (isRule(line)) {
      flushText();
      out.push('<hr>');
      i++;
      continue;
    }

    if (/^\s*>/.test(line)) {
      flushText();
      /* A BLANK LINE ENDS THE QUOTE. This used to continue across one, on the
         theory that a quotation and its attribution might be separated by a
         gap — and the result was that the seven separately sourced quotations
         on the Hoodie sheet rendered as ONE blockquote carrying one citation.
         Six sources vanished into a seventh's attribution, and because the
         merged block then could not break across a page, it also wasted most of
         page one. An attribution is separated by a line reading `>` with nothing
         after it, which stays inside the quote where it belongs. */
      const q = [];
      while (i < src.length && /^\s*>/.test(src[i])) {
        q.push(src[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      const r = renderQuote(q);
      out.push(r.html);
      quotes++;
      if (r.cite) cited++;
      continue;
    }

    if (isBullet(line) || isNumber(line)) {
      flushText();
      const ordered = !isBullet(line);
      const items = [];
      while (i < src.length) {
        const m = ordered ? isNumber(src[i]) : isBullet(src[i]);
        if (m) {
          items.push([ordered ? m[2] : m[1]]);
          i++;
          while (
            i < src.length &&
            /^\s{2,}\S/.test(src[i]) &&
            !isBullet(src[i]) &&
            !isNumber(src[i])
          ) {
            items[items.length - 1].push(src[i].trim());
            i++;
          }
          continue;
        }
        if (!src[i].trim() && (isBullet(src[i + 1] || '') || isNumber(src[i + 1] || ''))) {
          i++;
          continue;
        }
        break;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(
        '<' + tag + '>\n' +
          items.map((it) => '<li>' + inline(it.join(' ')) + '</li>').join('\n') +
          '\n</' + tag + '>'
      );
      continue;
    }

    if (/^\s*```/.test(line)) {
      flushText();
      const code = [];
      i++;
      while (i < src.length && !/^\s*```/.test(src[i])) code.push(src[i++]);
      i++;
      out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
      continue;
    }

    /* Pipe tables. Only one sheet uses one — Monotropism's "Instead of /
       Consider" reframing — and it is load-bearing content, not decoration, so
       a parser that dropped it would print a sheet missing its own argument.
       Header row, separator, body. No alignment colons, no inline pipes: the
       one table here needs neither, and inventing support for syntax nothing
       uses is how a parser grows features it cannot test. */
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(src[i + 1] || '')) {
      flushText();
      const cells = (l) =>
        l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < src.length && /^\s*\|.*\|\s*$/.test(src[i])) body.push(cells(src[i++]));
      out.push(
        '<table>\n<thead>\n<tr>' +
          head.map((c) => '<th scope="col">' + inline(c) + '</th>').join('') +
          '</tr>\n</thead>\n<tbody>\n' +
          body
            .map((r) => '<tr>' + r.map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>')
            .join('\n') +
          '\n</tbody>\n</table>'
      );
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) unknown.push('table-like line without a header rule, line ' + (i + 1));

    buf.push(line);
    i++;
  }
  flushText();

  const html = out.filter(Boolean).join('\n\n');
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  return { html, headings, quotes, cited, links, unknown };
}

/**
 * Reconcile in-page anchors against the ids we actually generated.
 *
 * The sheets carry hand-written tables of contents whose anchors were spelled
 * for WordPress, not for us. Rather than adopt WordPress's slug algorithm —
 * which has its own defect, turning an apostrophe into a hyphen so that half a
 * TOC points at headings that do not exist — every in-page anchor is matched
 * back to a real heading by letters and digits alone, and rewritten. Anything
 * still unmatched is RETURNED, not swallowed: a dangling anchor in a printed
 * packet is a reader turning to a page that is not there.
 */
export function resolveAnchors(html, headings) {
  const byLoose = new Map();
  for (const h of headings) {
    byLoose.set(looseKey(h.id), h.id);
    byLoose.set(looseKey(h.text), h.id);
  }
  const ids = new Set(headings.map((h) => h.id));
  const unresolved = [];

  const fixed = html.replace(/href="#([^"]*)"/g, (whole, frag) => {
    if (!frag || ids.has(frag)) return whole;
    const hit = byLoose.get(looseKey(frag));
    if (hit) return 'href="#' + hit + '"';
    unresolved.push(frag);
    return whole;
  });
  return { html: fixed, unresolved };
}

/** First paragraph of a rendered sheet, as plain text. */
export function firstParagraph(html) {
  const m = /<p>([\s\S]*?)<\/p>/.exec(html);
  return m ? m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim() : '';
}
