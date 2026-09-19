/**
 * page.mjs — the HTML shell every page on the press shares.
 *
 * ONE SHELL, NOT A TEMPLATE LANGUAGE. There are five kinds of page here and
 * they differ in their body, not their frame. A template engine would be a
 * dependency and a second syntax to learn for the sake of string
 * concatenation that fits on a screen.
 *
 * THE OG CARD IS A REAL IMAGE, GENERATED PER PAGE. og:image is not decoration
 * here: a Why Sheet gets shared into a Discord channel or a thread at the moment
 * somebody needs it, and without a card that link arrives as a line of grey text.
 * tools/build-og.mjs renders one per page from this site's own typeface and
 * palette, so a new sheet gets a card with no further work and the cards cannot
 * drift from the site. og:image:alt carries what the card actually says, because
 * some clients read it out and a card is the only part of a shared link that a
 * blind reader would otherwise get nothing from.
 *
 * `twitter:card` is the ONE twitter: property emitted. The rest (title,
 * description, image) fall back to the og: equivalents in every client that
 * reads them; `summary_large_image` has no og: equivalent and is what turns a
 * postage stamp into the full-width card.
 *
 * NO INLINE SCRIPT AND NO INLINE STYLE ANYWHERE. The Content-Security-Policy in
 * `_headers` is `script-src 'self'` with no `unsafe-inline`, matching the
 * sibling sites. That is only true if nothing here ever emits a `<script>` with
 * a body or a `style=` attribute — so the shell does not offer the option.
 */

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const escapeAttr = esc;

const NAV = [
  { href: '/', label: 'The library' },
  { href: '/packet/', label: 'Your packet' },
  { href: '/broadsides/', label: 'Broadsides' },
  { href: '/about/', label: 'About' },
];

/**
 * @param {object} o
 * @param {string} o.title      page title, without the site name
 * @param {string} o.description  meta description, one sentence
 * @param {string} o.path       canonical path, e.g. '/sheets/hoodie/'
 * @param {string} o.body       the <main> contents
 * @param {string[]} [o.scripts]  root-absolute script paths, deferred modules
 * @param {string[]} [o.stylesheets]  extra root-absolute stylesheets, after the main one
 * @param {string} [o.bodyClass]
 * @param {string} [o.host]     canonical host
 * @param {string} [o.image]    root-absolute path to this page's OG card
 * @param {string} [o.imageAlt] what the card says, for people using a screen reader
 * @param {string} [o.ogType]   'website' (default) or 'article'
 * @param {string} [o.markdown] root-absolute path to this page's Markdown source
 * @param {object} [o.jsonLd]   schema.org graph for this page, emitted as JSON-LD
 */
export function shell({ title, description, path, body, scripts = [], stylesheets = [], bodyClass = '', host, image, imageAlt, ogType = 'website', markdown, jsonLd }) {
  const full = title ? title + ' — The Why Sheet Press' : 'The Why Sheet Press';
  const canonical = 'https://' + host + path;
  const current = (href) => (href === path ? ' aria-current="page"' : '');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<!-- The one face that sets everything above the fold. Preloading only this one
     is deliberate: preload everything and the browser stops prioritising, which
     is the opposite of the point. The italic and the mono face load normally. -->
<link rel="preload" href="/fonts/atkinson-hyperlegible-next-roman-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/press.css">
${stylesheets.map((s) => `<link rel="stylesheet" href="${esc(s)}">`).join('\n')}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="license" href="https://creativecommons.org/publicdomain/zero/1.0/">
<meta name="theme-color" content="#9a1750">
<!-- Declared in the markup as well as in CSS. The stylesheet sets the same
     property on :root, but that only applies once the CSS has parsed, and a
     dark-mode reader gets a white flash before then. This tag sits in the first
     bytes of head and tells the browser before it paints. -->
<meta name="color-scheme" content="light dark">
<meta property="og:type" content="${esc(ogType)}">
<meta property="og:site_name" content="The Why Sheet Press">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:locale" content="en">
${
    image
      ? `<meta property="og:image" content="${esc('https://' + host + image)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta property="og:image:alt" content="${esc(imageAlt || full)}">
<meta name="twitter:card" content="summary_large_image">`
      : ''
  }
${
    markdown
      ? `<link rel="alternate" type="text/markdown" href="${esc('https://' + host + markdown)}" title="${esc(title || 'The Why Sheet Press')} — Markdown source">`
      : ''
  }
${
    jsonLd
      ? /* JSON-LD is the one <script> on this site with a body, and it does not
           need a CSP exception: `script-src` governs EXECUTABLE script, and a
           type="application/ld+json" block is data the parser never runs. The
           payload is JSON.stringify'd, and `<` is escaped so a string in the
           data can never close the element early. */
        `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`
      : ''
  }
<!-- Speculation rules. Prerender a sheet on hover-with-intent, because the
     shelf is a list of sixteen and a reader opens one; prefetch anything else
     same-origin only on pointerdown. PDFs, prompts and .md sources are excluded
     from the prefetch: those are downloads, and speculatively pulling a 300 kB
     PDF because a cursor crossed the button is somebody's data allowance.
     Chromium-only today. Other browsers ignore the block entirely — no
     regression, just no upside.
     This IS governed by script-src, unlike the JSON-LD data block above, which
     is why _headers carries 'inline-speculation-rules' — a keyword that permits
     exactly this and nothing else executable. -->
<script type="speculationrules">{"prerender":[{"where":{"href_matches":"/sheets/*/"},"eagerness":"moderate"}],"prefetch":[{"where":{"and":[{"href_matches":"/*"},{"not":{"href_matches":"/pdf/*"}},{"not":{"href_matches":"/prompts/*"}},{"not":{"href_matches":"/sheets/*.md"}}]},"eagerness":"conservative"}]}</script>
${scripts.map((s) => `<script type="module" src="${esc(s)}" defer></script>`).join('\n')}
</head>
<body${bodyClass ? ` class="${esc(bodyClass)}"` : ''}>
<a class="skip-link" href="#main">Skip to the content</a>
<header class="masthead">
  <div class="wrap masthead__inner">
    <a class="masthead__name" href="/">The Why Sheet <span>Press</span></a>
    <nav aria-label="Sections">
      <ul>
${NAV.map((n) => `        <li><a href="${n.href}"${current(n.href)}>${esc(n.label)}</a></li>`).join('\n')}
      </ul>
    </nav>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="colophon">
  <div class="wrap">
    <p><strong>Why Sheets are free.</strong> Every sheet here is
      <a href="https://creativecommons.org/publicdomain/zero/1.0/" rel="noopener">CC0 1.0</a> —
      print it, change it, put your own name on it, hand it out. No permission, no attribution required.
      Quoted material belongs to the people who wrote it and sits outside that grant.</p>
    <p>Published by <a href="https://stimpunks.org/" rel="noopener">Stimpunks Foundation</a>.
      The sheets are written and revised in the open at
      <a href="https://github.com/Stimpunks/Why-Sheets" rel="noopener">github.com/Stimpunks/Why-Sheets</a>,
      which is the source this site is built from.
      <a href="https://stimpunks.org/fieldguide/operations/forms/sign-why-sheet/" rel="noopener">Sign a Why Sheet</a>.</p>
    <p><a href="/privacy/">Privacy</a> — no cookies, no analytics, and nothing you type reaches us.
      The long version says why you can check that rather than take our word for it.</p>
  </div>
</footer>
</body>
</html>
`;
}
