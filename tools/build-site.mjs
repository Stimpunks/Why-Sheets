#!/usr/bin/env node
/**
 * build-site.mjs — turn the fourteen Markdown sheets and nine broadsides into
 * the pages of whysheet.press.
 *
 * THE REPOSITORY IS THE SOURCE OF TRUTH AND THIS IS WHAT MAKES THAT TRUE.
 * Before the press existed there were three answers to "how many Why Sheets are
 * there": fourteen in this repository, twelve published as pages on
 * stimpunks.org, nine named in the list on /why/. Three numbers, one library.
 * Nothing generated the site from the sheets, so nothing could disagree out
 * loud. Now the sheets generate the site, `sheets.json` declares what is
 * published where, and tools/check-drift.mjs reports every disagreement between
 * the three. A count that can drift is a count nobody is keeping.
 *
 * WHAT IT WRITES, all into the repository root, all committed:
 *   index.html                    the library, with the packet tray
 *   sheets/<slug>/index.html      one sheet, print-first
 *   broadsides/index.html         the broadside line
 *   broadsides/<slug>/index.html  one broadside, both sides, print-first
 *   packet/index.html             assemble, order, cover, download
 *   about/index.html              what a Why Sheet is and where the form comes from
 *   404.html  sitemap.xml  robots.txt  llms.txt  search-index.json
 *   assets/library.json           what the browser needs to know about the shelf
 *
 * Netlify runs no build. It publishes this repository as it stands, the way it
 * does for Penguin Pebbling and Star Stuff — so the generated files are checked
 * in and reviewable in a diff, and a deploy cannot fail on a toolchain.
 *
 *     node tools/build-site.mjs
 *     node tools/build-site.mjs --check    # regenerate into memory, diff, write nothing
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, resolveAnchors, firstParagraph, escapeHtml } from './lib/md.mjs';
import { shell } from './lib/page.mjs';
import { splitBlock, printDocument } from './lib/broadside.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* The OG card for a page, or undefined if it has not been built. Returning
   undefined rather than a hopeful path means a page never advertises an image
   that is not there — a broken og:image is worse than none, because the client
   renders an empty frame where the card should be. tools/build-og.mjs runs
   before this stage in ship.mjs; check-site.mjs gates that every emitted
   og:image resolves. */
const og = (slug) =>
  fs.existsSync(path.join(REPO, 'og', slug + '.png')) ? '/og/' + slug + '.png' : undefined;
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'sheets.json'), 'utf8'));
const HOST = manifest.press.host;
const checking = process.argv.includes('--check');

const written = new Map();
const problems = [];

function emit(rel, content) {
  written.set(rel, content);
}

/* ── read every sheet once ──────────────────────────────────────────────── */

const sheets = manifest.sheets.map((meta) => {
  const abs = path.join(REPO, meta.file);
  if (!fs.existsSync(abs)) {
    problems.push(meta.file + ' is named in sheets.json and is not on disk');
    return null;
  }
  const raw = fs.readFileSync(abs, 'utf8');
  const r = render(raw);
  const a = resolveAnchors(r.html, r.headings);
  for (const u of a.unresolved) problems.push(meta.slug + ': in-page link #' + u + ' matches no heading');
  for (const u of r.unknown) problems.push(meta.slug + ': ' + u);

  /* The trailing License block is the sheet's own colophon. It is rendered on
     the page, but the version number is also lifted out for the card and the
     packet cover — a reader in a meeting should be able to say which revision
     they are holding. */
  /* Every sheet opens with its own `# Title`, and the page already prints that
     title in its header. Rendering both gives a document that says "Hoodie"
     twice before it says anything — which is what the first PDF did. The h1 is
     lifted off and checked against the manifest instead: a mismatch means the
     sheet was retitled in the file and nowhere else, which is exactly the drift
     the manifest exists to catch. */
  let body = a.html;
  const leadH1 = /^<h1 id="[^"]*">([\s\S]*?)<\/h1>\n*/.exec(body);
  if (leadH1) {
    const inFile = leadH1[1]
      .replace(/<[^>]+>/g, '')
      /* The heading arrives HTML-escaped, so "Neuromodulation &amp; Autism" has
         to be decoded before it can be compared with the plain title. */
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .trim();
    if (inFile !== meta.title) {
      problems.push(
        meta.slug + ': the file opens with "' + inFile + '" but sheets.json says "' + meta.title + '"'
      );
    }
    body = body.slice(leadH1[0].length);
  } else {
    problems.push(meta.slug + ': the file does not open with a level-one heading');
  }

  const version = (/Version:\s*([0-9]+(?:\.[0-9]+)*)/.exec(raw) || [])[1] || null;
  const signatories = (raw.match(/^## Signatories([\s\S]*?)(?=\n## |\n?$)/m) || [])[1];
  const signatureCount = signatories ? (signatories.match(/^- /gm) || []).length : 0;

  return {
    ...meta,
    html: body,
    headings: r.headings.filter((h) => h.level > 1),
    quotes: r.quotes,
    words: (raw.match(/\b[\w’'-]+\b/g) || []).length,
    version,
    signatureCount,
    intro: meta.summary || firstParagraph(a.html),
    source: meta.file,
  };
}).filter(Boolean);

const bySlug = new Map(sheets.map((s) => [s.slug, s]));

/* ── web app manifest ─────────────────────────────────────── */

/* Here for the icons before anything else: a maskable icon has nowhere to be
 * declared except a manifest. Installing the site is a side effect, and a
 * welcome one — somebody who keeps a sheet for a meeting on Tuesday may well
 * want it on a home screen.
 *
 * display is "minimal-ui", not "standalone". This is a site you print from and
 * follow links out of, to stimpunks.org and to sources. Hiding the browser's
 * own controls would take the back button and the address bar away from a
 * reader who needs both. */
emit(
  'site.webmanifest',
  JSON.stringify(
    {
      name: 'The Why Sheet Press',
      short_name: 'Why Sheets',
      description: manifest.press.tagline,
      start_url: '/',
      scope: '/',
      display: 'minimal-ui',
      background_color: '#ffffff',
      theme_color: '#9a1750',
      lang: 'en',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    null,
    2
  ) + '\n'
);

/* ── /.well-known/security.txt (RFC 9116) ──────────────────── */

/* EXPIRES IS GENERATED, NOT TYPED, AND IT IS CHECKED. RFC 9116 makes the field
 * mandatory and a lapsed file invalid, and the spec's own advice is to treat it
 * like a certificate. A hand-typed date in a static file is a date nobody looks
 * at again, so it is computed a year out at build time and check-site.mjs fails
 * when the file is within 30 days of lapsing. That turns "remember to update
 * this" into something the build says out loud.
 *
 * Contact is the address published across stimpunks.org and actually monitored.
 * An unmonitored address here is worse than no file at all. */
const SECURITY_TXT_DAYS = 365;
const securityExpires = new Date(Date.now() + SECURITY_TXT_DAYS * 864e5)
  .toISOString()
  .replace(/\.\d+Z$/, 'Z');

emit(
  '.well-known/security.txt',
  `Contact: mailto:stimpunks@stimpunks.org
Expires: ${securityExpires}
Preferred-Languages: en
Canonical: https://${HOST}/.well-known/security.txt
Policy: https://${HOST}/privacy/

# This is a static site. No accounts, no database, no forms that submit, no
# cookies, no server-side code — so the interesting surface is small: the
# headers, the redirects, and the client-side packet builder. Tell us anyway.
# We would rather hear it.
`
);

/* ── privacy ────────────────────────────────────────────────────────────── */

/* WHY THIS PAGE EXISTS AND WHY IT IS NOT A LINK TO stimpunks.org.
 * The organisation's policy is the stock WordPress one: comments, Gravatar,
 * login cookies, media uploads. This site has none of those and does one thing
 * that policy does not mention — it remembers, on your own device, the name you
 * type on a packet cover. Pointing here at a document describing practices we
 * do not have, while omitting the one we do, is worse than having no page.
 *
 * The claims on /packet/ and on every prompt block ("nothing is uploaded",
 * "nothing you type reaches us") are the strongest things this site says, and
 * they are about a child's name. This states them as policy rather than prose. */
emit(
  'privacy/index.html',
  shell({
    host: HOST,
    title: 'Privacy',
    path: '/privacy/',
    description:
      'What this site does and does not do with your information. It sets no cookies, runs no analytics, and never receives what you type.',
    image: og('privacy'),
    imageAlt: 'Privacy on The Why Sheet Press. No cookies, no analytics, nothing sent to us.',
    body: `<div class="wrap wrap--narrow">
  <h1>Privacy</h1>
  <p class="lede">This site sets no cookies, runs no analytics, and never receives what you type
    into it. That is the whole summary. The rest is the detail, because a promise with no detail
    behind it is just a nicer way of saying nothing.</p>
  <p class="note">Last updated 19 September 2026.</p>

  <h2>Who is responsible</h2>
  <p><a href="https://stimpunks.org/" rel="noopener">Stimpunks Foundation</a>, a 501(c)(3)
    non-profit, publishes this site and is the data controller for it. For anything on this page,
    including a request about your own information, write to
    <a href="mailto:stimpunks@stimpunks.org">stimpunks@stimpunks.org</a>. A postal address is
    available on request through our <a href="https://stimpunks.org/contact/" rel="noopener">contact
    page</a>.</p>

  <h2>What we collect</h2>
  <p><strong>Nothing you give us, because there is nothing here to give.</strong> No accounts, no
    sign-up, no newsletter, no comments, no contact form, no payment. Every sheet, PDF, and prompt
    downloads without identifying you.</p>
  <p>Two things happen anyway, and you should know about both.</p>

  <h3>Our host keeps server logs</h3>
  <p>The site is served by <a href="https://www.netlify.com/" rel="noopener">Netlify</a>, which
    records the ordinary things a web server records: the IP address a request came from, the time,
    the page, and the browser's user-agent string. An IP address is personal data, so this is worth
    saying plainly rather than filing under "technical". We do not read these logs page by page, we
    do not join them to anything else, and we have no way to connect them to a person. They exist so
    the site can be served and abuse can be stopped.</p>
  <p>Netlify processes this on our behalf under its own
    <a href="https://www.netlify.com/privacy/" rel="noopener">privacy policy</a>, and it is a US
    company, so this involves a transfer outside the UK and EEA under its standard contractual
    clauses. The lawful basis is our legitimate interest in running a website at all
    (UK/EU GDPR Article 6(1)(f)).</p>
  <p>We would like to tell you exactly how long those logs are kept, and we cannot: Netlify's
    privacy statement says only that it retains data &quot;for a period of time consistent with the
    original purpose of collection&quot; and asks you to contact it for the specifics. We would
    rather write that down than print a confident number we have not verified. We keep no copy of
    the logs ourselves, and we retain nothing at all beyond what Netlify holds.</p>

  <h3>Your browser remembers your packet, on your device</h3>
  <p>If you tick sheets for a packet, this site stores that list in your own browser using
    <code>localStorage</code>, under the key <code>whysheets.packet.v1</code>. If you type a name and
    a date on the packet cover, those are stored the same way, under
    <code>whysheets.cover.v1</code>, so you do not have to type them again.</p>
  <p><strong>Neither is ever sent to us or to anyone else.</strong> They sit on the device you are
    using, we cannot read them, and no request carries them anywhere. This matters more here than in
    most places: the name on a packet cover is often a child's. Clear your browser's site data for
    this domain and both are gone. Nothing breaks if you do — the site works with no stored state at
    all, and works in a private window where storage is blocked outright.</p>
  <p>These are not cookies, nothing about them is used to track you, and they are strictly necessary
    to the feature you asked for, so there is nothing here to consent to.</p>

  <h2>What we do not do</h2>
  <ul>
    <li><strong>No cookies.</strong> Not ours, not anyone's.</li>
    <li><strong>No analytics.</strong> We do not know how many people read any sheet.</li>
    <li><strong>No third-party scripts, fonts, or embeds.</strong> Every script, stylesheet, and font
      on this site is served from this domain. Your browser makes no request to any other company
      while you are here — which is also enforced by the site's
      Content-Security-Policy, not merely promised.</li>
    <li><strong>No advertising, no trackers, no fingerprinting, no data sold or shared.</strong></li>
    <li><strong>No profiling and no automated decisions</strong> about anybody.</li>
  </ul>

  <h2>The packet builder, and the prompts</h2>
  <p>The packet builder assembles your PDF <em>in your browser</em>. It downloads the same public
    PDFs anyone can download and joins them on your device. Nothing is uploaded, and no record of
    which sheets you chose exists anywhere but your own machine.</p>
  <p>The companion prompts are plain text files you copy. What you then type into your own AI
    assistant — your child's name, their school, what happened — goes to whoever makes that
    assistant, under their terms, and never to us. We never see it. Before you paste anything about
    a child into any assistant, it is worth knowing that company's policy on keeping and training on
    what you type.</p>

  <h2>Your rights</h2>
  <p>Under the UK GDPR and EU GDPR you have the right to access your personal data, to have it
    corrected or erased, to restrict or object to processing, and to data portability. In practice
    we hold nothing that identifies you, so for almost any request the honest answer is that there is
    nothing to produce. Ask anyway if you want that confirmed in writing — write to
    <a href="mailto:stimpunks@stimpunks.org">stimpunks@stimpunks.org</a> and we will answer within
    one month.</p>
  <p>If you are unhappy with how we have handled it, you can complain to your own supervisory
    authority — in the UK the
    <a href="https://ico.org.uk/make-a-complaint/" rel="noopener">Information Commissioner's
    Office</a>, and in the EEA your national data protection authority.</p>

  <h2>Children</h2>
  <p>This site is written for adults advocating for children, not for children, and it asks nobody
    for their age. It collects no information from anyone, so it collects none from a child either.
    The child a packet is about is named only on your own device, if you choose to type it.</p>

  <h2>Changes</h2>
  <p>If this changes, the date at the top changes with it, and the change is recorded in this
    site's <a href="https://github.com/Stimpunks/Why-Sheets" rel="noopener">public repository</a>
    along with everything else here — so you can see what it used to say, not just what it says
    now.</p>

  <div class="source-note">
    <p><strong>This page describes this site only.</strong>
      <a href="https://stimpunks.org/" rel="noopener">stimpunks.org</a> is a WordPress site with
      comments, embedded media, and logins, and it has
      <a href="https://stimpunks.org/privacy/" rel="noopener">its own privacy policy</a> covering
      those. Do not read this one as describing that one.</p>
  </div>
</div>`,
  })
);

/* ── broadsides ─────────────────────────────────────────────────────────── */

const broadsides = manifest.broadsides.map((meta) => {
  const abs = path.join(REPO, 'broadsides', 'source', meta.slug + '.block.html');
  if (!fs.existsSync(abs)) {
    problems.push('broadside ' + meta.slug + ' has no mirrored source (run tools/sync-broadsides.mjs)');
    return null;
  }
  try {
    const parts = splitBlock(fs.readFileSync(abs, 'utf8'), meta.slug);
    if (parts.sides !== 2) {
      problems.push(meta.slug + ': ' + parts.sides + ' sides, expected 2 (one sheet, printed both sides)');
    }
    return { ...meta, ...parts };
  } catch (e) {
    problems.push(String(e.message));
    return null;
  }
}).filter(Boolean);

/* ── shared fragments ───────────────────────────────────────────────────── */

/* Only topics that narrow the shelf to more than one sheet get a chip. Every
   topic used once produced a filter that selected a single card — which is what
   the card's own title already does — and on a phone sixteen chips pushed the
   library itself below the fold. The tags still show on every card; they are
   description. A chip is a promise that pressing it leaves you with something
   to choose between. */
const topicCounts = new Map();
for (const s of sheets) for (const t of s.topics) topicCounts.set(t, (topicCounts.get(t) || 0) + 1);
const topics = [...topicCounts.entries()]
  .filter(([, n]) => n > 1)
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([t]) => t);

const TOPIC_LABEL = {
  aba: 'ABA',
  iep: 'IEP',
  school: 'school',
  work: 'work',
  sensory: 'sensory',
  clinical: 'clinical',
  health: 'health',
  ethics: 'ethics',
  design: 'design',
  space: 'space',
  policy: 'policy',
  access: 'access',
  liberation: 'liberation',
  history: 'history',
  technology: 'technology',
  understanding: 'understanding',
  uniform: 'uniform',
};
const label = (t) => TOPIC_LABEL[t] || t;

function cardFor(s) {
  const bs = s.broadside ? broadsides.find((b) => b.slug === s.broadside) : null;
  return `    <li class="card" data-slug="${s.slug}" data-topics="${s.topics.join(' ')}">
      <p class="card__pick">
        <label>
          <input type="checkbox" data-pick="${s.slug}">
          <span class="visually-hidden">Add ${escapeHtml(s.title)} to your packet</span>
        </label>
      </p>
      <h2 class="card__title"><a href="/sheets/${s.slug}/">${escapeHtml(s.title)}</a></h2>
      <p class="card__summary">${escapeHtml(s.summary)}</p>
      <p class="card__moment">Reach for it ${escapeHtml(s.moment.charAt(0).toLowerCase() + s.moment.slice(1))}</p>
${s.content_note ? `      <p class="note"><strong>Content note.</strong> ${escapeHtml(s.content_note)}</p>\n` : ''}      <ul class="card__meta">
        <li>${s.words.toLocaleString('en')} words</li>
${s.quotes ? `        <li>${s.quotes} sourced quotation${s.quotes === 1 ? '' : 's'}</li>\n` : ''}${s.signatureCount ? `        <li>${s.signatureCount} signatories</li>\n` : ''}${s.version ? `        <li>version ${escapeHtml(s.version)}</li>\n` : ''}${bs ? `        <li><a href="/broadsides/${bs.slug}/">one-sheet broadside</a></li>\n` : ''}${s.topics.map((t) => `        <li><span class="tag">${escapeHtml(label(t))}</span></li>`).join('\n')}
      </ul>
    </li>`;
}

/* ── the library ────────────────────────────────────────────────────────── */

emit(
  'index.html',
  shell({
    host: HOST,
    title: '',
    path: '/',
    image: og('home'),
    imageAlt: 'The Why Sheet Press. Print the argument. Carry it into the room.',
    description:
      'Every Stimpunks Why Sheet, print-first. Tick the sheets you need and get one paginated PDF with a cover page — the folder you carry into the room.',
    scripts: ['/assets/shelf.js'],
    body: `<div class="wrap">
  <h1>Print the argument. Carry it into the room.</h1>
  <p class="lede">Why Sheets make the case for a practice, a right, or an approach that families
    and educators should not have to defend alone — but constantly do. Tick the ones you need.
    You get back a single, correctly paginated PDF with a cover page, and the citations intact.</p>

  <form>
    <fieldset class="filters">
      <legend>Narrow the shelf</legend>
      <button type="button" class="chip" data-topic="*" aria-pressed="true">everything</button>
${topics.map((t) => `      <button type="button" class="chip" data-topic="${t}" aria-pressed="false">${escapeHtml(label(t))} <span class="chip__n">${topicCounts.get(t)}</span></button>`).join('\n')}
    </fieldset>
  </form>

  <p class="visually-hidden" role="status" data-shelf-status></p>

  <ul class="shelf">
${sheets.map(cardFor).join('\n')}
  </ul>

  <p class="no-js-note" data-print="hide"><strong>No JavaScript?</strong> Every sheet on this
    shelf has its own page and its own PDF, linked from its title. Assembling several into one
    packet is the only thing here that needs scripting.</p>
</div>

<div class="tray" hidden data-tray>
  <div class="wrap tray__inner">
    <p class="tray__count"><span data-tray-count>0</span> <span data-tray-label>sheets in your packet</span></p>
    <div class="tray__actions">
      <button type="button" class="button button--quiet" data-tray-clear>Clear</button>
      <a class="button" href="/packet/" data-tray-go>Build the packet</a>
    </div>
  </div>
</div>`,
  })
);


/* When a sheet last actually changed, from git rather than from the clock. A
   build timestamp would say every sheet changed today, every day — worse than
   no date, because it tells an agent the corpus is churning when it is not. */
import { execFileSync } from 'node:child_process';
function lastChanged(file) {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cI', '--', file], {
      cwd: REPO, encoding: 'utf8',
    }).trim() || null;
  } catch { return null; }
}

const PUBLISHER = { '@type': 'Organization', name: 'Stimpunks Foundation', url: 'https://stimpunks.org/' };
const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';

/* ── one sheet ──────────────────────────────────────────────────────────── */

/* Which sheets have a companion advocacy prompt. build-prompts.mjs decides that —
   it needs a venue and a set of asks — and runs before this stage in ship.mjs. The
   directory is read rather than the rule re-implemented, so the two cannot disagree. */
const PROMPTS = fs.existsSync(path.join(REPO, 'prompts'))
  ? new Set(fs.readdirSync(path.join(REPO, 'prompts')).filter((f) => f.endsWith('.txt')).map((f) => f.replace(/\.txt$/, '')))
  : new Set();

for (const s of sheets) {
  const bs = s.broadside ? broadsides.find((b) => b.slug === s.broadside) : null;
  const repoUrl =
    'https://github.com/Stimpunks/Why-Sheets/blob/main/' + encodeURIComponent(s.file);

  const provenance = s.published
    ? `<p>This sheet is also published as a page on
       <a href="${escapeHtml(s.published)}" rel="noopener">stimpunks.org</a>.</p>`
    : `<p>This sheet lives in the repository and does not yet have a page on stimpunks.org.
       It is finished enough to print and use; it has not been through the site's publishing
       pass. Nothing about that changes the licence.</p>`;

  /* THE MARKDOWN SOURCE, AT /sheets/<slug>.md.
   *
   * This site can do this honestly where most cannot: the sheet IS Markdown, so
   * the .md endpoint is the real source rather than HTML converted back into
   * something Markdown-shaped. One file now feeds the page, the PDF, the
   * companion prompt and the agent-facing source, and they cannot disagree
   * because there is nothing to keep in sync.
   *
   * NO X-Markdown-Tokens HEADER. The spec suggests one and says, correctly, not
   * to invent the number. There is no tokeniser here and this repository has no
   * dependencies to add one, so it is omitted rather than filled with an
   * estimate dressed as a count. Content-Length already sizes the body.
   *
   * NO CONTENT NEGOTIATION, deliberately. Serving Markdown from the canonical
   * URL on `Accept: text/markdown` needs an edge function, and this site has no
   * build step and no server by design. The spec calls the suffix the minimum
   * and negotiation the layer above; that layer costs the thing which makes all
   * the rest of this cheap. */
  const mdPath = '/sheets/' + s.slug + '.md';
  const changed = lastChanged(s.file);
  emit(
    'sheets/' + s.slug + '.md',
    [
      '---',
      'title: ' + JSON.stringify(s.title),
      'url: ' + JSON.stringify('https://' + HOST + '/sheets/' + s.slug + '/'),
      s.published ? 'published_at: ' + JSON.stringify(s.published) : null,
      'summary: ' + JSON.stringify(s.summary),
      'reach_for_it: ' + JSON.stringify(s.moment),
      'topics: [' + s.topics.join(', ') + ']',
      changed ? 'updated: ' + JSON.stringify(changed) : null,
      'licence: "CC0 1.0"',
      'licence_url: ' + JSON.stringify(CC0),
      'source: ' + JSON.stringify(repoUrl),
      'pdf: ' + JSON.stringify('https://' + HOST + '/pdf/' + s.slug + '.pdf'),
      PROMPTS.has(s.slug) ? 'companion_prompt: ' + JSON.stringify('https://' + HOST + '/prompts/' + s.slug + '.txt') : null,
      '---',
      '',
      fs.readFileSync(path.join(REPO, s.file), 'utf8').trim(),
      '',
    ].filter((l) => l !== null).join('\n')
  );

  emit(
    'sheets/' + s.slug + '/index.html',
    shell({
      host: HOST,
      title: s.title,
      path: '/sheets/' + s.slug + '/',
      ogType: 'article',
      image: og('sheets-' + s.slug),
      imageAlt: `Why Sheet: ${s.title}. Reach for it ${s.moment.charAt(0).toLowerCase() + s.moment.slice(1)}`,
      description: s.summary,
      markdown: mdPath,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: s.title,
        description: s.summary,
        url: 'https://' + HOST + '/sheets/' + s.slug + '/',
        inLanguage: 'en',
        isAccessibleForFree: true,
        license: CC0,
        publisher: PUBLISHER,
        ...(changed ? { dateModified: changed.slice(0, 10) } : {}),
        ...(s.published ? { sameAs: [s.published] } : {}),
        encoding: [
          { '@type': 'MediaObject', contentUrl: 'https://' + HOST + '/pdf/' + s.slug + '.pdf', encodingFormat: 'application/pdf' },
          { '@type': 'MediaObject', contentUrl: 'https://' + HOST + mdPath, encodingFormat: 'text/markdown' },
        ],
      },
      scripts: ['/assets/sheet.js'],
      body: `<div class="wrap wrap--narrow">
  <header class="sheet-head">
    <p class="kicker">Why Sheet${s.version ? ' · version ' + escapeHtml(s.version) : ''}</p>
    <h1>${escapeHtml(s.title)}</h1>
    <p class="lede">${escapeHtml(s.summary)}</p>
    <p class="card__moment">Reach for it ${escapeHtml(s.moment.charAt(0).toLowerCase() + s.moment.slice(1))}</p>
${s.content_note ? `    <p class="note"><strong>Content note.</strong> ${escapeHtml(s.content_note)}</p>\n` : ''}    <div class="actions" data-print="hide">
      <a class="button" href="/pdf/${s.slug}.pdf" download>Download the PDF</a>
      <button type="button" class="button button--quiet" data-pick-toggle="${s.slug}">Add to your packet</button>
      <button type="button" class="button button--quiet" data-print-page>Print this sheet</button>
    </div>
  </header>

  <div class="sheet-body">
${s.html}
  </div>

${
    PROMPTS.has(s.slug)
      ? `  <section class="prompt-note" data-print="hide">
    <h2>Write the letter</h2>
    <p>When we hand someone a Why Sheet, the next thing they usually need is a letter — and
      we have been drafting those by hand. If you already use an AI assistant, this prompt
      gets you a first draft about <em>your</em> child. Paste it in; it will ask you what
      happened before it writes anything.</p>
    <p>It carries this sheet's quotations inside it, word for word, and tells the assistant
      to add no source it was not given. That is deliberate: an assistant writing about
      school policy will reach for a study, and an invented or misattributed one hands the
      school a reason to dismiss you. Read the draft before you send it. It is a draft.</p>
    <div class="actions">
      <button type="button" class="button" data-copy-prompt="/prompts/${s.slug}.txt">Copy the prompt</button>
      <a class="button button--quiet" href="/prompts/${s.slug}.txt" download>Download it instead</a>
    </div>
    <p class="note">Nothing you type into your assistant reaches us. We never see your
      child's name, your school, or your letter.</p>
  </section>

`
      : ''
  }  <div class="source-note">
    <p><strong>Where this sheet comes from.</strong> It is written and revised as Markdown in
      the open: <a href="${escapeHtml(repoUrl)}" rel="noopener">${escapeHtml(s.file)}</a>.
      That file is the source this page and its PDF are both generated from, so the three cannot
      say different things.</p>
    ${provenance}
    ${bs ? `<p>There is a <a href="/broadsides/${bs.slug}/">one-sheet broadside</a> of this argument — the version you pin up.</p>` : ''}
  </div>
</div>`,
    })
  );
}

/* ── broadsides ─────────────────────────────────────────────────────────── */

emit(
  'broadsides/index.html',
  shell({
    host: HOST,
    title: 'Broadsides',
    path: '/broadsides/',
    image: og('broadsides'),
    imageAlt: 'Broadsides from The Why Sheet Press. The version you pin up.',
    description:
      'One physical sheet, printed both sides, made to be carried into a room and handed to someone. Nine broadsides, each compressing a Why Sheet.',
    body: `<div class="wrap">
  <h1>Broadsides</h1>
  <p class="lede">A Why Sheet is the argument. A broadside is the sheet you can put in a hand —
    one piece of paper, printed both sides, sized to land correctly on A4 and US Letter alike.
    Side A is a face you would pin up. Side B does the work.</p>

  <ul class="shelf">
${broadsides
  .map((b) => {
    const parent = b.parent ? bySlug.get(b.parent) : null;
    return `    <li class="card" data-slug="${b.slug}">
      <h2 class="card__title"><a href="/broadsides/${b.slug}/">${escapeHtml(b.title)}</a></h2>
      <p class="card__summary">${
        parent
          ? escapeHtml(parent.summary)
          : 'A broadside without a Why Sheet behind it — the line has started writing its own subjects.'
      }</p>
      <ul class="card__meta">
        <li>two sides, one sheet</li>
        <li><a href="/pdf/broadside-${b.slug}.pdf" download>PDF</a></li>
${parent ? `        <li>from the <a href="/sheets/${parent.slug}/">${escapeHtml(parent.title)}</a> Why Sheet</li>` : ''}
      </ul>
    </li>`;
  })
  .join('\n')}
  </ul>
</div>`,
  })
);

for (const b of broadsides) {
  const parent = b.parent ? bySlug.get(b.parent) : null;

  /* The block's own stylesheet, served as a file rather than inlined, so the
     Content-Security-Policy stays `style-src 'self'`. Its print rules are
     included but scoped to print, where they only govern the sheet itself. */
  emit(
    'broadsides/' + b.slug + '/block.css',
    '/* GENERATED from broadsides/source/' + b.slug + '.block.html by tools/build-site.mjs.\n' +
      '   Do not edit. Edit the block at its source and re-run tools/sync-broadsides.mjs. */\n\n' +
      b.css + '\n\n@media print {\n' + b.printCss + '\n}\n'
  );

  /* The document Chrome prints to make this broadside's PDF: the block and its
     own print rules, with no site chrome at all. Kept as a file so the PDF build
     is a separate step that can be re-run without re-deriving anything, and so
     what went to the printer is reviewable in a diff. */
  emit(
    'broadsides/' + b.slug + '/print.html',
    printDocument({ css: b.css, printCss: b.printCss, markup: b.markup, title: b.title })
  );

  emit(
    'broadsides/' + b.slug + '/index.html',
    shell({
      host: HOST,
      title: b.title + ' (broadside)',
      path: '/broadsides/' + b.slug + '/',
      ogType: 'article',
      image: og('broadsides-' + b.slug),
      imageAlt: `Broadside: ${parent ? parent.title : b.slug}. One sheet, printed both sides, made to be handed to someone.`,
      stylesheets: ['/broadsides/' + b.slug + '/block.css'],
      description:
        (parent ? parent.summary + ' ' : '') +
        'A single sheet, printed both sides, sized for A4 and US Letter alike.',
      body: `<div class="wrap">
  <header class="sheet-head">
    <p class="kicker">Broadside · one sheet, two sides</p>
    <h1>${escapeHtml(b.title)}</h1>
    ${parent ? `<p class="lede">${escapeHtml(parent.summary)}</p>` : ''}
    <div class="actions" data-print="hide">
      <a class="button" href="/pdf/broadside-${b.slug}.pdf" download>Download the PDF</a>
      ${parent ? `<a class="button button--quiet" href="/sheets/${parent.slug}/">Read the full Why Sheet</a>` : ''}
    </div>
  </header>

  <div class="broadside-stage">
${b.markup}
  </div>

  <div class="source-note">
    <p><strong>How to print it.</strong> Two sides of one sheet, at 190&nbsp;&times;&nbsp;259&nbsp;mm —
      the overlap of A4 and US Letter, so it lands correctly on either without scaling.
      Print double-sided, actual size, background graphics off. The PDF above is already set that way.</p>
    ${parent ? `<p>The argument in full is on the <a href="/sheets/${parent.slug}/">${escapeHtml(parent.title)}</a> Why Sheet. A broadside invents no claim its parent does not carry.</p>` : ''}
  </div>
</div>`,
    })
  );
}

/* ── the packet ─────────────────────────────────────────────────────────── */

emit(
  'packet/index.html',
  shell({
    host: HOST,
    title: 'Your packet',
    path: '/packet/',
    image: og('packet'),
    imageAlt: 'Build a packet. Tick the sheets you need and get one correctly paginated PDF.',
    description:
      'Put the sheets in order, put a name and a date on the cover, and get one paginated PDF.',
    scripts: ['/assets/packet.js'],
    body: `<div class="wrap wrap--narrow">
  <h1>Your packet</h1>
  <p class="lede">One PDF. A cover page you can put a name and a date on, then the sheets in the
    order you choose, numbered straight through. Print it double-sided and it is a folder.</p>

  <h2>What is in it</h2>
  <ol class="packet-list" data-packet-list>
    <li><span class="name">Loading your selection…</span></li>
  </ol>
  <p><a class="button button--quiet" href="/">Add more sheets</a></p>

  <h2>The cover page</h2>
  <p>All three are optional and none of it leaves your browser. Nothing here is uploaded,
    stored, or counted — the PDF is assembled on your own device.</p>

  <div class="field">
    <label for="cover-for">Prepared for</label>
    <input type="text" id="cover-for" data-cover="for" autocomplete="off" maxlength="120">
    <span class="hint">A child's name, a school, a clinic. Whatever should be at the top of the page.</span>
  </div>
  <div class="field">
    <label for="cover-by">Prepared by</label>
    <input type="text" id="cover-by" data-cover="by" autocomplete="off" maxlength="120">
  </div>
  <div class="field">
    <label for="cover-date">Date</label>
    <input type="date" id="cover-date" data-cover="date">
  </div>
  <div class="field">
    <label for="cover-note">One line of your own</label>
    <input type="text" id="cover-note" data-cover="note" autocomplete="off" maxlength="160">
    <span class="hint">For example: the meeting this is for, or the question you want answered.</span>
  </div>

  <div class="actions" data-print="hide">
    <button type="button" class="button" data-build disabled>Download the packet</button>
    <a class="button button--quiet" href="#" data-print-all hidden>Print instead</a>
  </div>

  <p class="status" data-status data-state="idle">Pick some sheets and this builds a PDF.</p>

  <p class="no-js-note" data-print="hide"><strong>If this does not work</strong> — an old browser, a
    blocked script, a device that will not cooperate — every sheet still has its own PDF on its own
    page, and printing them one at a time gets you the same paper. The packet saves you the
    assembly, not the argument.</p>

  <div class="source-note">
    <p><strong>Nothing is sent anywhere.</strong> This page downloads the same PDFs anyone can
      download, joins them in your browser, and hands you the result. There is no account, no
      upload, no analytics, and no record of which sheets you picked. What you are assembling is
      nobody else's business.</p>
  </div>
</div>`,
  })
);

/* ── about ──────────────────────────────────────────────────────────────── */

emit(
  'about/index.html',
  shell({
    host: HOST,
    title: 'About',
    path: '/about/',
    image: og('about'),
    imageAlt: 'About The Why Sheet Press. Where the form comes from.',
    description:
      'What a Why Sheet is, where the form comes from, why it is free, and how to add your name to one.',
    body: `<div class="wrap wrap--narrow">
  <h1>About the press</h1>

  <p class="lede">Advocates are always expected to explain themselves. The status quo is never
    asked to. That asymmetry is a form of power, and it wears families down.</p>

  <p>Families navigating schools, hospitals and systems are constantly asked to justify what
    should be obvious. Why does my child need that support? Why is this not working? Why are you
    doing it that way? The answers exist — in research, in law, in lived experience — but finding
    them, organising them, and presenting them concisely in a meeting is exhausting work, and it
    lands on the people with the least left over.</p>

  <p>Why Sheets do that work in advance. This press does the rest of it: the printing, the
    pagination, the cover page, the folder. That is the part that eats an evening at eleven o'clock
    the night before a meeting.</p>

  <h2>Where the form comes from</h2>

  <p>The Why Sheet is not our invention. It is <a href="https://www.alfiekohn.org/blogs/why/" rel="noopener">Alfie
    Kohn's</a>, and he described it exactly:</p>

  <blockquote>
    <p>I imagined a set of handouts, each consisting of a single (double-sided) sheet that
      responded to a common question. The idea was to lay out the case briskly, making liberal use
      of bullet points and offering a short bibliography at the end for anyone who wanted more
      information.</p>
    <footer>— <cite><a href="https://www.alfiekohn.org/blogs/why/" rel="noopener">The Why Axis</a></cite></footer>
  </blockquote>

  <blockquote>
    <p>In short, any practice that's constructive yet still controversial would be fair game for
      one of these punchy handouts.</p>
    <footer>— <cite><a href="https://www.alfiekohn.org/blogs/why/" rel="noopener">The Why Axis</a></cite></footer>
  </blockquote>

  <h2>Why concision is the whole problem</h2>

  <p>Noam Chomsky's word for it is <a href="https://stimpunks.org/glossary/concision/" rel="noopener">concision</a>:
    ideas that align with power need no explanation, and ideas that do not need a great deal.</p>

  <blockquote>
    <p>If you want to repeat the religion you can get away with it between two commercials. If you
      wanna say something that questions the religion, you're expected to give evidence, and that
      you can't do between two commercials, so therefore you lack concision so therefore you can't
      talk.</p>
    <footer>— <cite>Noam Chomsky, <a href="https://www.youtube.com/watch?v=8ghoXQxdk6s" rel="noopener">Conversations with History</a></cite></footer>
  </blockquote>

  <p>We have to define all our terms. Thinking differently often means speaking differently, so we
    end up sounding like we are from somewhere else. A Why Sheet is what a good balance of concision
    and explanation looks like when you are the one being asked to explain.</p>

  <h2>Sheets and broadsides</h2>

  <p>A <strong>Why Sheet</strong> is the argument, at whatever length the argument needs. A
    <strong><a href="/broadsides/">broadside</a></strong> is one physical sheet, printed both sides,
    that compresses an argument already made at length and points back at it. A broadside invents no
    claim its parent does not carry. If you cannot finish the sentence <em>"someone picks this up
    when…"</em>, what you have is a summary, and a summary belongs on the page it summarises.</p>

  <h2>The licence, plainly</h2>

  <p>Every sheet is <a href="https://creativecommons.org/publicdomain/zero/1.0/" rel="noopener">CC0 1.0</a>.
    Print it. Change it. Delete the parts that do not apply to you. Put your own name on it. Hand it to
    a hundred people. You do not need permission and you do not need to credit us.</p>

  <p>Two things sit outside that. <strong>Quoted material belongs to whoever wrote it</strong> —
    the sheets are built out of other people's sourced words, and those are quoted, not given away.
    And the <strong>signatories</strong> on a sheet endorsed <em>that</em> sheet; if you change one
    substantially, take the signature list off, because it is no longer the document they signed.</p>

  <h2>Add your name, or change a sheet</h2>

  <p>These are developed in public. You can
    <a href="https://stimpunks.org/fieldguide/operations/forms/sign-why-sheet/" rel="noopener">sign a Why Sheet</a>,
    which is how a sheet gets grounded in more than our own voice, or open an issue or a pull request at
    <a href="https://github.com/Stimpunks/Why-Sheets" rel="noopener">github.com/Stimpunks/Why-Sheets</a>.
    Defaulting to open means the people these sheets serve get real power over what they say.</p>

  <h2>How this site is built</h2>

  <p>The fourteen Markdown files in that repository are the source. This site, every PDF on it, and
    the packet you assemble are all generated from them, so they cannot come to say different things.
    Sheets that are also published on <a href="https://stimpunks.org/why/" rel="noopener">stimpunks.org</a>
    say so on their own page and link there.</p>

  <p>No analytics, no cookies, no accounts, no third-party anything. The packet builder runs in your
    browser and sends nothing anywhere.</p>
</div>`,
  })
);

/* ── 404 ────────────────────────────────────────────────────────────────── */

emit(
  '404.html',
  shell({
    host: HOST,
    title: 'Not found',
    path: '/404.html',
    description: 'That page is not here.',
    body: `<div class="wrap wrap--narrow">
  <h1>That page is not here</h1>
  <p class="lede">The shelf is small enough to scan in a minute.
    <a href="/">Go and look at all of it.</a></p>
  <p>If you followed a link from somewhere and it broke, that is our fault rather than yours, and
    we would like to know: <a href="https://github.com/Stimpunks/Why-Sheets/issues" rel="noopener">open an issue</a>.</p>
</div>`,
  })
);

/* ── machine-readable siblings ──────────────────────────────────────────── */

const urls = [
  '/',
  '/about/',
  '/privacy/',
  '/packet/',
  '/broadsides/',
  ...sheets.map((s) => '/sheets/' + s.slug + '/'),
  ...broadsides.map((b) => '/broadsides/' + b.slug + '/'),
];

emit(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>https://${HOST}${u}</loc></url>`).join('\n')}
</urlset>
`
);

emit(
  'robots.txt',
  `# Everything here is CC0. Read it, index it, train on it, print it.
User-agent: *
Allow: /

Sitemap: https://${HOST}/sitemap.xml
`
);

emit(
  'llms.txt',
  `# The Why Sheet Press

> ${manifest.press.tagline} Free, CC0, editable advocacy sheets for families and educators
> navigating schools, hospitals and systems. Published by Stimpunks Foundation.

Every sheet is generated from Markdown in <https://github.com/Stimpunks/Why-Sheets>, which is the
source of truth.

**The Markdown source of any sheet is served directly.** Append .md to a sheet's URL —
<https://whysheet.press/sheets/hoodie.md> — and you get the file the page and the PDF are both
built from, with frontmatter carrying the canonical URL, the licence, when it last changed, and
links to its PDF and companion prompt. Each page also declares it with a
link rel="alternate" type="text/markdown" element. There is no content negotiation on the
canonical URL: this site has no server. Each sheet page links its own source file. Everything is CC0 1.0 except quoted
material, which belongs to the people who wrote it.

## Why Sheets

${sheets
  .map(
    (s) =>
      `- [${s.title}](https://${HOST}/sheets/${s.slug}/): ${s.summary} Reach for it ${s.moment.charAt(0).toLowerCase() + s.moment.slice(1)}${s.published ? ` Also published at ${s.published}` : ''}`
  )
  .join('\n')}

## Broadsides

One sheet, two sides, sized for A4 and US Letter alike.

${broadsides.map((b) => `- [${b.title}](https://${HOST}/broadsides/${b.slug}/)`).join('\n')}

## Companion prompts

Plain-text prompts a family pastes into their own AI assistant to draft an advocacy letter about
their own child. Each one interviews the reader first, then writes. Each embeds its sheet's
quotations verbatim with attribution and instructs the assistant to add no source it was not
given — because an invented or misattributed citation hands a school a reason to dismiss the
letter. Nothing is sent to us. CC0, like the sheets.

${[...PROMPTS].sort().map((slug) => { const sh = sheets.find((x) => x.slug === slug); return `- [${sh.title}](https://${HOST}/prompts/${slug}.txt): a school letter from the ${sh.title} Why Sheet`; }).join('\n')}

## Optional

- [About the press](https://${HOST}/about/): where the form comes from, and the licence in plain words
- [Build a packet](https://${HOST}/packet/): assemble several sheets into one paginated PDF
`
);

emit(
  'search-index.json',
  JSON.stringify(
    {
      generated: 'from sheets.json and the Markdown sources',
      records: [
        ...sheets.map((s) => ({
          url: '/sheets/' + s.slug + '/',
          title: s.title,
          kind: 'why-sheet',
          summary: s.summary,
          moment: s.moment,
          topics: s.topics,
          headings: s.headings.filter((h) => h.level <= 3).map((h) => h.text),
        })),
        ...broadsides.map((b) => ({
          url: '/broadsides/' + b.slug + '/',
          title: b.title,
          kind: 'broadside',
          summary: b.parent && bySlug.get(b.parent) ? bySlug.get(b.parent).summary : '',
          topics: b.parent && bySlug.get(b.parent) ? bySlug.get(b.parent).topics : [],
          headings: [],
        })),
      ],
    },
    null,
    2
  ) + '\n'
);

/* What the browser needs. Deliberately small: the shelf and the packet page
   need titles, slugs and topics, not the prose. */
emit(
  'assets/library.json',
  JSON.stringify(
    {
      sheets: sheets.map((s) => ({
        slug: s.slug,
        title: s.title,
        version: s.version,
        pdf: '/pdf/' + s.slug + '.pdf',
        topics: s.topics,
      })),
      broadsides: broadsides.map((b) => ({
        slug: b.slug,
        title: b.title,
        pdf: '/pdf/broadside-' + b.slug + '.pdf',
      })),
    },
    null,
    2
  ) + '\n'
);

/* ── write ──────────────────────────────────────────────────────────────── */

let changed = 0;
let same = 0;
for (const [rel, content] of written) {
  const abs = path.join(REPO, rel);
  const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  if (before === content) {
    same++;
    continue;
  }
  changed++;
  if (checking) {
    console.log('  STALE   ' + rel);
    continue;
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  console.log('  ' + (before === null ? 'new    ' : 'updated') + '  ' + rel);
}

console.log();
console.log(
  '  ' + sheets.length + ' sheets · ' + broadsides.length + ' broadsides · ' +
    written.size + ' files (' + changed + ' ' + (checking ? 'stale' : 'written') + ', ' + same + ' unchanged)'
);

if (problems.length) {
  console.log();
  console.log('  PROBLEMS');
  for (const p of problems) console.log('    - ' + p);
  process.exit(1);
}
if (checking && changed) {
  console.log();
  console.log('  FAIL — the committed site is behind the sources. Run tools/build-site.mjs.');
  process.exit(1);
}
process.exit(0);
