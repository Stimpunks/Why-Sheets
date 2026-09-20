#!/usr/bin/env node
/**
 * to-wordpress.mjs — turn a Why Sheet into Gutenberg block markup for
 * stimpunks.org.
 *
 * WHY BLOCKS AND NOT JUST HTML. WordPress will accept a wall of HTML and render
 * it, but it becomes one opaque "Classic" block in the editor: unsearchable by
 * block type, unreachable by the block-section tools, and impossible to edit a
 * paragraph of without editing all of it. The twelve Why Sheets already on the
 * site are block markup. A thirteenth that is not would be the odd one out in
 * the one place that matters — the editor somebody opens in two years to fix a
 * sentence.
 *
 * WHAT IT EMITS, matching the shapes already on /why/ (read out of that page's
 * own `content.raw`, not guessed):
 *   <!-- wp:paragraph -->   <p>…</p>
 *   <!-- wp:heading -->     <h2 id="h-…" class="wp-block-heading">…</h2>
 *   <!-- wp:quote -->       <blockquote class="wp-block-quote"> … <cite>…</cite>
 *   <!-- wp:list -->        <ul class="wp-block-list"> + wp:list-item per <li>
 *   <!-- wp:separator -->   <hr class="wp-block-separator has-alpha-channel-opacity"/>
 *   <!-- wp:table -->       <figure class="wp-block-table"><table>…
 *
 * THE H1 IS DROPPED. WordPress renders the page title itself; a sheet that kept
 * its own would say its name twice, which is exactly what the press's own pages
 * did until build-site started lifting it off.
 *
 * ANCHORS ARE `h-` PREFIXED, which is what the block editor generates, so a
 * table of contents copied off a published page keeps working. Note that the
 * editor derives its own anchor at publish time and turns an apostrophe into a
 * HYPHEN — "can't" becomes "can-t". Setting the anchor explicitly here is what
 * stops that from happening silently.
 *
 *     node tools/to-wordpress.mjs "ABA Tactics.md"           # print the blocks
 *     node tools/to-wordpress.mjs "ABA Tactics.md" -o out.html
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, resolveAnchors, slugify, unescapeHtml } from './lib/md.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @returns {string} Gutenberg block markup */
export function toBlocks(markdown) {
  const r = render(markdown);
  const a = resolveAnchors(r.html, r.headings);
  if (a.unresolved.length) {
    throw new Error('in-page anchors that match no heading: ' + a.unresolved.join(', '));
  }

  /* Split the rendered HTML into top-level elements. The renderer joins blocks
     with a blank line and never indents a top-level tag, so this is reliable
     for what it produces — and it throws below on anything it does not know,
     rather than passing an unwrapped element through as Classic content. */
  /* `data-print-url` is the press's own attribute — it feeds the print
     stylesheet that writes a link's destination after it on paper. It has no
     meaning on stimpunks.org and would sit in that page's stored content
     forever. Strip it before anything else looks at the markup. */
  const cleaned = a.html.replace(/ data-print-url="[^"]*"/g, '');

  const chunks = cleaned
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    /* ONE PARAGRAPH PER BLOCK. The renderer joins a run of paragraphs with a
       single newline, so a chunk can hold several <p>. Left alone that emits one
       wp:paragraph wrapping three paragraphs, which is not a paragraph block —
       it is a Classic block wearing the wrong comment, and the editor cannot
       move or edit the middle one. */
    .flatMap((c) =>
      /^<p>/.test(c) && /<\/p>\s*\n\s*<p>/.test(c)
        ? [...c.matchAll(/<p>[\s\S]*?<\/p>/g)].map((m) => m[0])
        : [c]
    );
  const out = [];
  let droppedH1 = false;

  for (const chunk of chunks) {
    const tag = (/^<(\w+)/.exec(chunk) || [])[1];

    if (tag === 'h1' && !droppedH1) {
      droppedH1 = true;
      continue;
    }

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag[1]);
      const inner = chunk.replace(/^<h\d[^>]*>/, '').replace(/<\/h\d>$/, '');
      const text = unescapeHtml(inner.replace(/<[^>]+>/g, ''));
      const anchor = 'h-' + slugify(text);
      const attrs = level === 2 ? { anchor } : { level, anchor };
      out.push(
        '<!-- wp:heading ' + JSON.stringify(attrs) + ' -->\n' +
          '<h' + level + ' id="' + anchor + '" class="wp-block-heading">' + inner + '</h' + level + '>\n' +
          '<!-- /wp:heading -->'
      );
      continue;
    }

    if (tag === 'p') {
      out.push('<!-- wp:paragraph -->\n' + chunk + '\n<!-- /wp:paragraph -->');
      continue;
    }

    if (tag === 'hr') {
      out.push(
        '<!-- wp:separator -->\n' +
          '<hr class="wp-block-separator has-alpha-channel-opacity"/>\n' +
          '<!-- /wp:separator -->'
      );
      continue;
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = [...chunk.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
      const cls = 'wp-block-list';
      const attrs = tag === 'ol' ? ' {"ordered":true}' : '';
      out.push(
        '<!-- wp:list' + attrs + ' -->\n<' + tag + ' class="' + cls + '">' +
          items
            .map((i) => '<!-- wp:list-item -->\n<li>' + i + '</li>\n<!-- /wp:list-item -->')
            .join('') +
          '</' + tag + '>\n<!-- /wp:list -->'
      );
      continue;
    }

    if (tag === 'blockquote') {
      /* The renderer puts the attribution in <footer><cite>; WordPress wants a
         bare <cite> as the last child of the blockquote. */
      const cite = (/<footer>[\s\S]*?<cite>([\s\S]*?)<\/cite><\/footer>/.exec(chunk) || [])[1];
      const body = chunk
        .replace(/<footer>[\s\S]*?<\/footer>/, '')
        .replace(/^<blockquote>\s*/, '')
        .replace(/\s*<\/blockquote>$/, '')
        .trim();
      const paras = [...body.matchAll(/<p>[\s\S]*?<\/p>/g)].map((m) => m[0]);
      out.push(
        '<!-- wp:quote -->\n<blockquote class="wp-block-quote">' +
          paras.map((p) => '<!-- wp:paragraph -->\n' + p + '\n<!-- /wp:paragraph -->').join('') +
          (cite ? '<cite>' + cite + '</cite>' : '') +
          '</blockquote>\n<!-- /wp:quote -->'
      );
      continue;
    }

    if (tag === 'table') {
      out.push(
        '<!-- wp:table -->\n<figure class="wp-block-table">' +
          chunk.replace('<table>', '<table class="has-fixed-layout">') +
          '</figure>\n<!-- /wp:table -->'
      );
      continue;
    }

    throw new Error(
      'no block mapping for <' + tag + '>: ' + chunk.slice(0, 90) + '\n' +
        'Refusing to emit it unwrapped — an unwrapped element becomes a Classic block ' +
        'and the page stops being editable a paragraph at a time.'
    );
  }

  if (!droppedH1) throw new Error('the sheet does not open with a level-one heading');
  return out.join('\n\n') + '\n';
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const args = process.argv.slice(2);
  const src = args.find((x) => !x.startsWith('-'));
  if (!src) {
    console.error('usage: to-wordpress.mjs <sheet.md> [-o out.html]');
    process.exit(1);
  }
  const blocks = toBlocks(fs.readFileSync(path.join(REPO, src), 'utf8'));
  const outIdx = args.indexOf('-o');
  if (outIdx !== -1) {
    fs.writeFileSync(args[outIdx + 1], blocks);
    const counts = {};
    for (const m of blocks.matchAll(/<!-- wp:(\w+)/g)) counts[m[1]] = (counts[m[1]] || 0) + 1;
    console.error(
      '  ' + args[outIdx + 1] + '  ' + blocks.length.toLocaleString() + ' chars  ' +
        Object.entries(counts).map(([k, v]) => k + ' ' + v).join(', ')
    );
  } else {
    process.stdout.write(blocks);
  }
}
