/**
 * page.mjs — the HTML shell every page on the press shares.
 *
 * ONE SHELL, NOT A TEMPLATE LANGUAGE. There are five kinds of page here and
 * they differ in their body, not their frame. A template engine would be a
 * dependency and a second syntax to learn for the sake of string
 * concatenation that fits on a screen.
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
 */
export function shell({ title, description, path, body, scripts = [], stylesheets = [], bodyClass = '', host }) {
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
<link rel="stylesheet" href="/assets/press.css">
${stylesheets.map((s) => `<link rel="stylesheet" href="${esc(s)}">`).join('\n')}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="license" href="https://creativecommons.org/publicdomain/zero/1.0/">
<meta name="theme-color" content="#9a1750">
<meta property="og:type" content="website">
<meta property="og:site_name" content="The Why Sheet Press">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
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
  </div>
</footer>
</body>
</html>
`;
}
