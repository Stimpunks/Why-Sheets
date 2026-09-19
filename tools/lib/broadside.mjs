/**
 * broadside.mjs — take a WordPress Custom HTML block apart into the pieces a
 * static site can serve under a strict Content-Security-Policy.
 *
 * A BROADSIDE BLOCK IS BUILT FOR A HOSTILE HOST. It carries its own namespaced
 * stylesheet and its own print script because it has to survive being pasted
 * into a WordPress page full of theme CSS, and because calling `window.print()`
 * there would print the header, the nav, the sidebar and the cookie banner with
 * the sheet somewhere inside. Its script clones both sides into a hidden iframe
 * and prints that instead.
 *
 * NONE OF THAT IS TRUE HERE, so three things come apart:
 *
 *   1. THE SCRIPT IS DROPPED. The press serves its own pages; there is no theme
 *      to escape and no chrome to exclude, because our own print stylesheet
 *      already hides the navigation. Keeping it would mean either an inline
 *      `<script>` — which `script-src 'self'` forbids, and loosening that for
 *      decoration is not a trade worth making — or nine per-file hashes that go
 *      stale on every sync.
 *   2. THE PRINT CSS IS RESCUED OUT OF IT FIRST. The rules that make the sheet
 *      land on 190x259mm live inside that script as a run of string literals, so
 *      dropping the script naively would drop the pagination with it and produce
 *      a PDF of the wrong shape. This lifts them out and re-emits them as a real
 *      `@media print` block — the same extraction `make-print-proof.mjs` does
 *      upstream, for the same reason: one source of truth, so the printed sheet
 *      cannot drift from the published one.
 *   3. INLINE `style=` ATTRIBUTES BECOME RULES. There is exactly one in the
 *      current nine. Hoisting it keeps `style-src 'self'` honest without an
 *      exception that would then cover everything forever.
 *
 * `hidden` comes off side B as well. In the block it is the state an on-page
 * toggle drives; here both sides are shown, and both must reach the printer.
 */


/* Remove every <div> carrying `className`, including its nested children, by
   walking opening and closing tags and counting depth. */
function removeElement(html, className) {
  const open = new RegExp('<div class="[^"]*\\b' + className + '\\b[^"]*"[^>]*>', 'g');
  let out = html;
  for (;;) {
    open.lastIndex = 0;
    const m = open.exec(out);
    if (!m) return out;

    let depth = 1;
    const tag = /<\/?div\b[^>]*>/g;
    tag.lastIndex = m.index + m[0].length;
    let end = -1;
    for (let t; (t = tag.exec(out)); ) {
      depth += t[0].startsWith('</') ? -1 : 1;
      if (depth === 0) {
        end = t.index + t[0].length;
        break;
      }
    }
    if (end === -1) {
      /* Unbalanced markup. Leaving the element in place is the safe failure:
         a visible dead control is better than a truncated sheet. */
      return out;
    }
    out = out.slice(0, m.index) + out.slice(end).replace(/^\s*\n/, '');
  }
}


/* Local @font-face for the two families the blocks use.
 *
 * WHY THIS EXISTS. Every one of the nine blocks opens its stylesheet with
 *   @import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next…&family=Space+Mono…')
 * which is right for a WordPress page and wrong twice over here.
 *
 * On the SITE it is a third-party request from a page somebody is reading about
 * their own child, and `style-src 'self'` blocks it — correctly, but the
 * consequence is that Space Mono never arrives and every small-caps label on a
 * broadside falls back. Found on the live deploy; the local preview sends no CSP
 * and so could not have found it.
 *
 * In the PDF BUILD it is worse and quieter: print.html carries the same import,
 * headless Chrome has no CSP, and so the nine broadside PDFs were laid out with
 * fonts fetched from Google at build time. A slow or failed fetch would have
 * produced sheets in fallback metrics — which is not a cosmetic difference on a
 * fixed-height sheet, it is where the page breaks fall. The build was not
 * hermetic and nothing said so.
 *
 * Both families are OFL and both are already in the estate: Atkinson from
 * Penguin Pebbling, Space Mono from Star Stuff. See ATTRIBUTIONS.md. */
const FONT_FACES = `
@font-face{font-family:'Atkinson Hyperlegible Next';font-style:normal;font-weight:200 800;font-display:swap;src:url(/fonts/atkinson-hyperlegible-next-roman-latin.woff2) format('woff2')}
@font-face{font-family:'Atkinson Hyperlegible Next';font-style:italic;font-weight:200 800;font-display:swap;src:url(/fonts/atkinson-hyperlegible-next-italic-latin.woff2) format('woff2')}
@font-face{font-family:'Space Mono';font-style:normal;font-weight:400;font-display:swap;src:url(/fonts/spacemono-normal-400-latin.woff2) format('woff2')}
@font-face{font-family:'Space Mono';font-style:normal;font-weight:700;font-display:swap;src:url(/fonts/spacemono-normal-700-latin.woff2) format('woff2')}
@font-face{font-family:'Space Mono';font-style:italic;font-weight:400;font-display:swap;src:url(/fonts/spacemono-italic-400-latin.woff2) format('woff2')}
`;

/**
 * @param {string} html   a *.block.html file
 * @param {string} slug
 * @returns {{css:string, printCss:string, markup:string, sides:number, styleId:string}}
 */
export function splitBlock(html, slug) {
  const styleM = html.match(/<style id="([^"]+)">([\s\S]*?)<\/style>/);
  if (!styleM) throw new Error(slug + ': no <style id="..."> in the block');
  const [, styleId, cssRaw] = styleM;

  const rootM = html.match(/(<div class="sb-root"[\s\S]*?)\n<script>/);
  if (!rootM) throw new Error(slug + ': no .sb-root ... <script> region in the block');

  /* The print-document CSS, lifted from the block's own script: it is built
     there as adjacent single-quoted literals between an opening <style> and the
     closing </style></head>. */
  const scriptM = html.match(/doc\.write\(([\s\S]*?)\);/);
  if (!scriptM) throw new Error(slug + ': no print-document writer in the script');
  const printCss = [...scriptM[1].matchAll(/'([^']*)'/g)]
    .map((m) => m[1])
    .join('')
    .replace(/^[\s\S]*?<style>/, '')
    .replace(/<\/style>[\s\S]*$/, '')
    .replace(/'\s*\+\s*css\s*\+\s*'/g, '')
    .trim();

  if (!/@page/.test(printCss)) {
    throw new Error(
      slug + ': the extracted print CSS has no @page rule, so the extraction is wrong. ' +
        'Refusing to build a sheet of the wrong shape.'
    );
  }

  /* Both sides visible, and the print toggle's own buttons gone: they do
     nothing without the script, and a dead control is worse than none. */
  let markup = rootM[1].replace(/\s+hidden(?=[\s>])/g, '');

  /* `.sb-controls` is the Side A / Side B toggle and the Print button. Without
     the script they are dead controls, and a dead control is worse than none:
     somebody presses Print and nothing happens.
     REMOVED BY COUNTING TAGS, NOT BY A REGEX. Two earlier attempts shipped the
     toggle inert. The first targeted `.sb-actions`, which exists in none of these
     blocks, so it matched nothing. The second was nesting-naive — the controls
     contain nested <div>s, so a lazy match stopped at the FIRST </div> and the
     lookahead after it then failed, which is the correct behaviour of the wrong
     pattern. A regex cannot match balanced tags; this walks them. */
  markup = removeElement(markup, 'sb-controls');

  /* Hoist inline style attributes into real rules. */
  const hoisted = [];
  markup = markup.replace(/\s+style="([^"]*)"/g, (_, decls) => {
    const cls = 'sb-inline-' + slug.replace(/[^a-z0-9]+/g, '-') + '-' + hoisted.length;
    hoisted.push('.' + cls + '{' + decls + '}');
    return ' data-hoisted="' + cls + '"';
  });
  /* data-hoisted became the hook a moment ago only so the replace could be a
     single pass; turn it into a real class now. */
  markup = markup.replace(/ data-hoisted="([^"]+)"/g, (_, cls) => ' class="' + cls + '"')
    .replace(/class="([^"]*)" class="(sb-inline-[^"]+)"/g, 'class="$1 $2"');

  /* The Google Fonts import comes out and the local faces go in its place. */
  const deImported = cssRaw.replace(/@import\s+url\([^)]*\)\s*;?/g, '').trim();
  const css = FONT_FACES + deImported + (hoisted.length ? '\n\n/* hoisted from inline style attributes */\n' + hoisted.join('\n') : '');
  const sides = (markup.match(/class="sb-sheet /g) || []).length;

  return { css, printCss, markup, sides, styleId };
}

/**
 * The standalone document Chrome prints to make the broadside's PDF. It is the
 * block's own stylesheet plus the block's own print rules, and nothing else —
 * no site chrome, no fonts we chose, no navigation. What the printer receives
 * upstream is what the printer receives here.
 */
export function printDocument({ css, printCss, markup, title }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title.replace(/[&<>]/g, '')}</title>
<style>
${css}

/* ---- print document, as the block's own script builds it, less its @page ---- */
${printCss.replace(/@page\s*\{[^}]*\}/g, '')}

/* ---- the page, pinned ----
   The block prints with @page { size: auto; margin: 9mm }, which is right for a
   reader hitting Print on a WordPress page: it flexes to whatever paper is in
   their tray. It is wrong for a PDF we hand out, because auto resolves to
   Chrome's default paper — US Letter, 216 mm wide — and a Letter-sized PDF does
   NOT fit A4, which is 210 mm. The reader gets it scaled or clipped, silently.

   THE COLUMN IS 194 mm, AND THAT NUMBER WAS MEASURED, NOT CHOSEN. Each sheet is
   a fixed 259 mm tall with overflow clipped, so a column narrower than the
   composition needs does not look wrong — it loses the bottom of side B. The
   nine sheets were rendered under emulated print media at widths from 188 mm
   up, and the tallest side of any of them came out:

       188 mm -> 269.1 mm   overflows by 10.1
       190 mm -> 265.4 mm   overflows by  6.4
       192 mm -> 259.6 mm   overflows by  0.6      <- this is the A4 case
       194 mm -> 256.6 mm   fits, with 2.4 mm spare
       198 mm -> 256.6 mm   fits                   <- this is the US Letter case

   Two things follow. The press uses 194 mm, the narrowest width at which all
   nine clear. And DEVELOPMENTAL PACE IS ALREADY 0.6 mm OVER ON A4 as published —
   a real finding about the upstream sheet, not about this build, and one for
   that repository to fix at the source.

   The page is therefore 208 x 277 mm with margins of 9 mm top, 7 mm sides and
   bottom: 208 fits inside A4's 210 and Letter's 216, and 277 inside A4's 297 and
   Letter's 279. Content box 194 x 261 mm — the same 261 mm height these sheets
   already get on US Letter, which is the tightest case known to print correctly.

   THE BLOCK'S OWN @page IS REMOVED ABOVE RATHER THAN OVERRIDDEN. Declaring a
   second one after it and trusting the cascade does not work: the PDF still came
   out 612 x 792. Chrome resolves preferCSSPageSize from the page rule it finds,
   so there has to be exactly one. */
@page { size: 208mm 277mm; margin: 9mm 7mm 7mm; }
   reader hitting Print on a WordPress page: it flexes to whatever paper is in
   their tray. It is wrong for a PDF we hand out, because auto resolves to
   Chrome's default paper — US Letter, 216 mm wide — and a Letter-sized PDF does
   NOT fit A4, which is 210 mm. The reader gets it scaled or clipped, silently.

   208 x 277 mm IS THE LARGEST PAGE THAT FITS BOTH PAPERS: under A4's 210 x 297
   and under Letter's 216 x 279. With the 9 mm margin the block already expects,
   the content box is exactly 190 x 259 mm — the dimensions the broadsides were
   designed to, so nothing reflows and the composition is the one that was
   checked upstream.

   The conservative 190 x 259 PAGE was tried first, and it is the wrong shape for
   this object: it makes the content box 172 x 241, and Sensory Access at Work —
   the fullest of the nine — spilled onto a third side. That is the page the Why
   Sheets use, where the type reflows freely and a narrower column is merely a
   narrower column. A broadside is a fixed composition; it needs its own page.

   THE BOTTOM MARGIN IS 7 mm, NOT 9, AND THAT 2 mm IS THE WHOLE MARGIN OF ERROR.
   A sheet is exactly 259 mm tall, so a 259 mm content box leaves nothing: with a
   symmetric 9 mm margin, Developmental Pace and Masking and Burnout both tipped
   onto a third side while the other seven held. 7 mm makes the content box
   190 x 261 — which is precisely the box these sheets get on US Letter with the
   9 mm margin they were designed against, and the tightest case that is known to
   print correctly. The page still fits inside both papers.

   THE BLOCK'S OWN @page IS REMOVED ABOVE RATHER THAN OVERRIDDEN. Declaring a
   second one after it and trusting the cascade does not work: the PDF still came
   out 612 x 792. Chrome resolves preferCSSPageSize from the page rule it finds,
   so there has to be exactly one. */
@page { size: 208mm 277mm; margin: 9mm 9mm 7mm; }
</style>
</head>
<body>
${markup}
</body>
</html>
`;
}
