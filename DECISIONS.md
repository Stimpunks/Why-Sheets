# Decisions

Why things are the way they are, so the same questions are not re-litigated in three weeks. Settled decisions first; open ones at the end.

----

## Settled

### Social cards are rendered per page, not drawn once — 2026-09-19

A Why Sheet is shared at the moment somebody needs it: "here, this is the one about recess."
A single house image makes every one of those links look identical, so the card says nothing at
exactly the moment it is doing the most work. `tools/build-og.mjs` renders one card per page —
30 of them — from the site's own typeface and palette, so a new sheet gets a card with no
further work and the cards cannot drift from the site.

**They are white on purpose.** Everything else in a feed is dark and shouting. This is a press:
ink on paper, a registration bar, a measured rule. It reads as a document rather than an
advertisement, which is what it is.

**The title is fitted by measurement, and getting that right took three attempts — all the same
mistake.** Titles run from "Hoodie" to "Queer and Neurodivergent Liberation are Entwined". The
first version compared the title's `scrollHeight` against its declared `max-height` and passed,
while a flex column silently squeezed the box below its content and sliced the title through the
middle. The second removed the shrinking and asked the card whether it overflowed — using
`scrollHeight` again, on an `overflow: visible` element, where `scrollHeight` *is* `clientHeight`
and no overrun can ever be reported. That is the identical trap already documented in the sheet
overflow checker. The measurement that works is the bottom of the deepest descendant against the
card's content bottom, and it is now written down in the file so it is not rediscovered a fourth
time. A card that overflows at the minimum type sizes throws, because the alternative is finding
out from somebody else's timeline.

### check-drift compares page text, not headings — 2026-09-19

Section 2 of the checker verifies a sheet exists at the URL the manifest claims. It says nothing
about whether the page says the same thing as the file. On 2026-09-19 five sheets gained a "What
to Ask For in the Room" section here and the published pages did not, and the checker printed
**No drift** — because it counted sheets. "The repository is the source of truth" is not a fact
about the repository; it is a claim, and a claim has to be checked against the site.

**Body text, not headings, and the difference is gate versus nuisance.** A heading comparison
produced nine findings across sixteen sheets, eight of them noise: Boring Technology's opening
section runs straight on from the page title without its "What This Is" heading, and a reader
loses nothing. Asking whether a section's prose reached the page gave 0 false positives.

**Normalise first.** WordPress does not serve back what you sent it — wptexturize curls quotes
and apostrophes and turns hyphens into en dashes, and the mirror's HTML-to-Markdown pass moves
emphasis markers. Two rounds of this check were false alarms from exactly that.

**List items count as prose, and leaving them out nearly shipped a useless gate.** The instinct
is to skip lists, since a list looks like the thing a round trip would reshape. But a section
that is *entirely* a list is then never checked — and an asks section is exactly that shape.
Excluding list items caught 1 of the 5 sheets that were genuinely behind. Including them caught
5 of 5, across 167 sections, with no false positives. **Proven in both directions against the
mirror as it stood before those five were published**, which is the only test that means
anything: a gate nobody has watched fire is a gate nobody knows works.

### A venue template declares what it is built from — 2026-09-19

The school template reads a sheet's asks section. The workplace one cannot: Sensory Access at
Work is a reference, not an argument — eight senses, each with its own list of concrete
adjustments, and the sheet's own instruction is *"pick the entries that fit you; you do not need
every item."* There is no single asks list to extract because the whole sheet is one, and asking
that sheet for a "What to Ask For in the Room" section would have meant writing one that
duplicates eight of its sections badly.

So a template declares `needs: 'asks' | 'menu'`, and the skip report names which thing is
missing rather than reporting "no asks" on a sheet that was never going to have any.

**Each venue also carries a rule the others do not, and those rules are the point of having
separate templates at all.** Workplace: disclosure is the worker's choice and the default is not
to name a diagnosis — a letter that says "as an Autistic employee" outs somebody permanently, in
writing, in a file they do not control, and an adjustment can be asked for without it. Clinical:
**do not give medical advice.** That sheet argues against neuromodulation and argues well, but a
prompt turning that into "tell them no" would have an assistant instructing a stranger about a
treatment it cannot see, for a person it knows nothing about, possibly a child, possibly with a
co-occurring condition the treatment genuinely targets — which is the distinction the sheet's own
first question draws. The model equips them to ask; the decision stays theirs.

The clinical prompt also produces a different artefact. Somebody offered a treatment is usually
in the room with the person offering it, so it prepares questions to ask out loud, with a line on
what a good answer and a non-answer sound like, rather than a letter to post.

### Companion prompts are generated, gated twice, and carry their own evidence — 2026-09-19

When we hand someone a Why Sheet, the next thing they need is a letter, and we have been
drafting those by hand. `tools/build-prompts.mjs` turns a sheet into a prompt a family pastes
into their own AI assistant, which interviews them and drafts the letter about their own child.
No keys, no hosting, and no family's data reaching us — which matters more than the convenience,
because the alternative is holding a Disabled child's name and school on our servers.

**The quotations are embedded verbatim and the model is forbidden to add a source.** A chatbot
writing about school policy will reach for a study. An invented or misattributed one hands the
school a free reason to dismiss the parent, and the cost lands on the family. Building the
Recess and Play sheet — with verification tooling and deliberate care — a Pellegrini quotation
was nearly shipped under the wrong publication. So the defence is structural rather than an
instruction to be careful: `lib/sheetdoc.mjs` throws on a quotation with no attribution, so an
uncited quote cannot reach a prompt even by accident.

**Generated, not written.** Every part already exists in the sheet. Sixteen hand-written prompts
are sixteen artifacts that go stale the first time a sheet is edited, with nothing to say so.

**Two gates, both refusing rather than degrading.** `letter` in `sheets.json` names the venue or
null where there is nobody to write to; only venues with a template here are built, and the rest
are reported every run. And a sheet with no asks section is skipped, not generated without asks —
without them the model invents the demands, which is the citation failure one level up, and a
parent asking a school for the wrong thing is a real cost.

**All ten school sheets have asks now, and one of the six was never missing.** Five gained a
"What to Ask For in the Room" section, which they wanted for their own sake — a sheet that makes
an argument and then leaves the reader to work out what to say in the room is doing half its job.
The sixth, Monotropism, already had "Questions To Ask In The Room", written as a bold label above
the question it stands for rather than as a bullet list. The extractor read only bullets, found
none, and reported the sheet as having no asks — which would have led to writing a new section
over better prose that was already there. **A gate reporting "missing" when it means "shaped
differently" points at the wrong repair**, and the wrong repair here was destructive. The
extractor reads both shapes now.

### The repository is the source of truth, and `sheets.json` is what makes that enforceable — 2026-09-19

Before the press there were three apparent answers to *how many Why Sheets are there?*: 14 files here, 12 published pages on stimpunks.org, 9 named in the list on `/why/`. Two sheets genuinely had no page yet. **The nine turned out to be an artefact** — a stale mirror of a page that generates its list at request time; see the entry below. Finding that out is what the tool is for.

The site, the PDFs and the packet are now all generated from the Markdown, and `tools/check-drift.mjs` prints every count side by side whether they agree or not.

**Why the metadata is a separate file and not frontmatter.** This repository is a Ulysses external folder. YAML frontmatter would render as body text in the editor, and Ulysses rewrites what it saves. Metadata inside a sheet is metadata an editor can damage without anyone noticing.

### Slugs are declared, never derived — 2026-09-19

`Neuromodulation & Autism.md` publishes at `/why/neuromodulation/`. Any rule that computes a slug from a filename gets that one wrong, and the failure lands in a *printed* packet as a link to a 404.

### Generated output is committed; Netlify runs no build — 2026-09-19

Matching Penguin Pebbling and Star Stuff. Three reasons, in order of what each costs when ignored:

1. **A PDF is printed by real Chrome and then measured.** Doing that in a deploy container means shipping a headless browser into the build or trusting a layout nobody looked at. The paper is the product.
2. **Generated output is reviewable in a diff.** A stylesheet change that repaginates nine sheets shows up as nine changed PDFs in the pull request, which is where somebody should see it.
3. **A deploy cannot fail on a toolchain.** Netlify copies files.

The cost is real and accepted: 23 PDFs, about 6 MB, churn whenever the stylesheet changes. `build-pdfs.mjs` fingerprints each job against its page and the stylesheet so only what would actually change is reprinted.

### Two page sizes, both measured — 2026-09-19

- **Why Sheets: 190 × 259 mm**, the intersection of A4 and US Letter, carried over from the broadsides. A PDF sized to either paper alone is a different physical object depending on the reader's country.
- **Broadsides: 208 × 277 mm with 9 / 7 / 7 mm margins**, giving a 194 mm column.

The broadsides were tried at 190 × 259 first and it is the wrong page for the object. A Why Sheet is reflowing text, so a narrower column is merely a narrower column. A broadside is a fixed composition with a sheet element of fixed height and clipped overflow: too narrow a column does not look wrong, it silently loses the bottom of side B.

Measured across all nine, tallest side at each column width:

| column | tallest side | verdict |
|---|---|---|
| 188 mm | 269.1 mm | overflows by 10.1 |
| 190 mm | 265.4 mm | overflows by 6.4 |
| 192 mm | 259.6 mm | overflows by 0.6 — **this is the A4 case** |
| 194 mm | 256.6 mm | fits, 2.4 mm spare |
| 198 mm | 256.6 mm | fits — this is the US Letter case |

194 mm is the narrowest width at which all nine clear. 208 × 277 mm fits inside A4 (210 × 297) and US Letter (216 × 279).

Broadsides are not selectable in the packet builder, so the two page sizes never meet in one file.

### pdf-lib is vendored, and it is the only dependency — 2026-09-19

Half a megabyte of someone else's MIT-licensed code in a repository that otherwise has none. It earns it: joining PDFs in the browser is the entire difference between a website and a press, and there is no way to do it without a PDF library.

What keeps it honest:

- **Vendored, not a CDN.** `default-src 'none'` stays true and no reader's request leaves our origin.
- **Loaded only on the button press.** A reader who never builds a packet never pays for it.
- **Build time stays dependency-free.** Every generator and gate in `tools/` is still zero-dependency Node. There is no `package.json`.

The alternative considered was assembling the packet as one HTML document and calling `window.print()`. Better output in some ways — live text, the reader's own paper size — but it hands somebody a print dialog instead of a file, and on a phone at eleven at night that is a materially worse answer. Both exist; the download is the primary path.

### PDFs are built ahead of time; the browser only concatenates — 2026-09-19

Laying out a long document is typesetting, and a browser doing it live on an unknown device is a bad place to discover a widow, a clipped table or a font that did not load. Rendering here means one known browser, one known page size, a result that can be measured, and a file that is byte-identical for everyone. Nothing is re-flowed in the browser, so the page somebody prints is the page that was checked.

### Nothing about a packet leaves the device — 2026-09-19

No account, no upload, no analytics, no record of which sheets anybody selected. The selection is a list of slugs in `localStorage`, and every access to it is wrapped in try/catch because it throws outright in some private-browsing modes.

This is not a generic privacy posture. A packet assembled the night before a meeting says a great deal about what is happening to a particular child at a particular school.

### Broadside blocks are taken apart, not pasted in — 2026-09-19

Each block arrives from WordPress as a self-contained `<style>` plus an inline `<script>`, which `script-src 'self'` and `style-src 'self'` forbid. Three pieces come apart: the script is dropped, its print CSS is rescued out of it first (the pagination lives inside it as string literals), and the one inline `style=` attribute in the nine is hoisted into a rule.

The easy version is one exception in `_headers`, which would then cover everything forever.

**The block's own `@page` is removed rather than overridden.** Declaring a second one after it and trusting the cascade does not work — the PDF still came out 612 × 792. Chrome resolves `preferCSSPageSize` from the page rule it finds, so there has to be exactly one.

### The site is served over HTTP for the PDF build — 2026-09-19

Every page links its stylesheet by root-absolute path, which is meaningless over `file://`. The first PDFs came out unstyled: no print stylesheet, so the navigation printed, the page size fell back to US Letter, and the result looked like a Chrome flag problem. It was a URL problem. `tools/lib/serve.mjs` is 60 lines and makes the printed document the same document a reader gets.

### The Ulysses repair is narrow, and the diff is the review — 2026-09-19

`check-ulysses.mjs --fix` normalises non-breaking spaces and closes a delimiter gap **only** where that gap contained one. An author's ordinary `** ` is untouched.

The first version of that rule matched any delimiter followed by a non-breaking space, which also matches the *closing* `**` of `**neuronormativity** =` and of `**redefine** our terms`. Collapsing there deletes a real space and welds two words together. It was caught in the diff on the first run, which is why the tool prints "read the diff" rather than "done".

### A long printed URL is shortened to its host — 2026-09-19

The print stylesheet writes each link's destination after it, because paper cannot be clicked and a citation nobody can follow is not a citation. The Hoodie sheet carries an expired signed Amazon S3 URL of about 1,500 characters; printed in full at 8 pt it filled most of a side of paper with hexadecimal. Over 96 characters, the printed form becomes host plus first path segment. The full address is still a live hyperlink in the PDF.

### Atkinson Hyperlegible Next, and only that — 2026-09-19

The same family Penguin Pebbling and Star Stuff carry, under the SIL Open Font Licence. Drawn to keep letterforms distinguishable, which is the whole job on a sheet somebody is reading under fluorescent light in a room where they are outnumbered. One family, two faces: a press needs a working text face more than a display face, and every additional face is bytes a reader on a phone pays for.

### The broadside stage is paper in both themes — 2026-09-19

A broadside's colours are chosen and measured against white, and its own small print sits *outside* the white sheet, drawn onto whatever is behind it. On the dark theme that text measured 3.06:1, below AA, while the sheet beside it rendered as designed. It is a warm off-white rather than pure white, inset with a visible border, so in a dark room it reads as a sheet of paper on a page rather than a rectangle of light.

----

### The /why/ list cannot drift, and the first version of the checker did not know that — 2026-09-19

`check-drift.mjs` originally scraped the anchors out of the mirrored `/why/` page and reported three sheets — Boring Technology, Masking and Burnout, Monotropism — as published but unlinked, recommending a hand edit to the live site.

All three were already there. Two things were true at once, and each alone would have been enough:

1. **The list is not written by anyone.** The page's stored content is a single self-closing block, `<!-- wp:yoast-seo/subpages /-->`, which renders the page's published children at request time. There is no markup to add a link to, and a published child *is* listed. The set cannot drift.
2. **The mirror cannot see that it changed.** The site mirror syncs incrementally on `modified_after`. `/why/`'s own stored content has not changed since 2026-06-17, so it has never been re-fetched — while its rendered output changed three times as those children were published in late August. The rest of the mirror was one day old; that one file was six weeks old, and nothing said so.

The scrape is gone. What replaced it is a freshness signal — **and the first version of that was wrong too, in an instructive way.**

It compared the page's own `modified:` against its children's `date:`. That condition is true and *stays* true however fresh the mirror is, because a page whose rendering depends on other content never reports itself as modified — which is the entire defect. The warning could never clear. It went on firing after a full re-pull had already fixed the file.

The signal now is the mirror file's **own last commit**, which survives a fresh clone (unlike mtime) and answers the real question: was this copy written before or after the thing it is supposed to contain was published. Replayed against both states to prove it is not vacuous — at 2026-08-04 it fires on all three sheets, at 2026-09-19 it is silent.

The mirror was re-pulled in full on 2026-09-19: 1,571 records, 0 added, 0 deleted, **34 modified**. That number is the measurable size of the defect. Corrections ran both ways — `/why/` gained the three sheets, six pages *lost* a fundraising block that is no longer published, and `/cookie-policy-eu/` collapsed from 1,570 lines to 15 because the live page renders nothing at all.

**The general form is worth carrying elsewhere: `modified` tracks a page's own content, not what its blocks render.** Any page on stimpunks.org built out of subpages blocks, tables of contents, query loops or synced patterns is mirrored once and then frozen, while the live page moves. `audit-page` and `garden-spider` both read that mirror.

### The one production note in the library is gone — 2026-09-19

`Masking and Burnout.md` opened with a line naming its target URL, its WordPress parent page and that page's post ID, and declaring itself *"Not yet published."* The page had been live since 2 September.

It was the only sheet of the fourteen carrying anything like it; every other one opens with its argument. And it was not an internal note in practice — it printed, as the first line of the sheet's body, so the PDF a family carried into a meeting began by calling itself a draft and quoting `69263`.

Deleted, along with the horizontal rule it left stranded under the title. Nothing was lost: the canonical URL is in the sheet's own License block, in `sheets.json`, and on its page on the press. The sheet dropped from eight printed pages to seven.

**The general rule this settles: a Why Sheet contains no production scaffolding.** Anything about where a sheet is published, or whether, belongs in `sheets.json`, which is exactly why that file exists.

----

### Deployment: Netlify, GitHub App, no build step — 2026-09-19

Live at **https://whysheet.press** (Netlify project `why-sheet-press`, Stimpunks team). Continuous deployment from `Stimpunks/Why-Sheets`, branch `main`, publish `.`, empty build command — the same shape as Penguin Pebbling, Star Stuff, Queering Earth and Monotropic Map.

**The GitHub connection was made through the dashboard, deliberately.** An API shortcut was tried first: `updateSite` accepted a `repo` object and returned it in `build_settings`, which looked like success. The next build failed with `Host key verification failed` — it had written a field, not an authorization. A deploy key plus a webhook would have worked and was rejected for a different reason: every other Netlify site in the estate uses the GitHub App, and a bespoke wiring here would be the one site configured differently, with no deploy status on PRs and a setup nobody remembers in six months.

**The first deploy paid for itself immediately**, finding two faults that are invisible locally because the preview sends no CSP and serves no redirects:

- **All nine broadside blocks `@import` Google Fonts.** On the site, `style-src 'self'` blocked it, so Space Mono never loaded. Worse and quieter: `print.html` carries the same import and headless Chrome has no CSP, so the nine broadside PDFs were being laid out with fonts fetched over the network. On a fixed-height sheet that is not cosmetic — it is where the page breaks fall. Space Mono is now vendored, the import is stripped at build time, and the reprinted PDFs are byte-for-byte the same shape: 2 pages each, 122 printed sides.
- **`/broadsides/source/*` returned 200, not 301.** Netlify serves an existing static file *before* applying a redirect, so the rule never fired and anyone hitting that path got a raw unstyled fragment. It needs the shadowing `301!`.

`sync-broadsides` should have caught the first and did not: it matched `src=` and `href=` attributes only, so it passed all nine clean while every one imported from another origin in CSS. It checks `@import` and `url()` now.

**Still to confirm once the custom domain is attached:** HSTS is served as Netlify's `max-age=31536000; includeSubDomains; preload`, not the `max-age=63072000` without `preload` that `_headers` declares. The likely cause is that `*.netlify.app` is preloaded platform-wide and the platform header wins on that hostname — unverifiable until a custom domain exists. If the platform value still wins there, the comment in `_headers` explaining the two-year no-preload choice is describing something that is not happening, and should be corrected rather than left as decoration.

### A changelog page and an RSS feed, generated from CHANGELOG.md — 2026-09-20

`CHANGELOG.md` was already written in prose and already the right document; it was just not
published. It is now the source for `/changelog/` and `/feed.xml`, on the same terms as a sheet:
nobody edits the page, nobody edits the feed, and the heading form `## YYYY-MM-DD — Title` is a
contract `tools/lib/changelog.mjs` refuses to guess at.

**A feed rather than a mailing list, and that is a privacy decision before it is a technical
one.** Telling somebody a page changed should not require holding their address. A feed reader
asks for a file; we never learn that it did, and unsubscribing is something a reader does without
telling us. It is the only notification mechanism consistent with what `/privacy/` already
claims.

**RSS 2.0 rather than Atom.** Atom is the better-specified format and it does not matter here:
every reader parses RSS, and the people this press is for are not choosing a client on
feed-format grounds. The one Atom element RSS has no answer for — `atom:link rel="self"` — is
borrowed, because every validator asks for it.

**Same-day entries are spread a minute apart.** Four of the first five releases landed on one
day. A changelog records a day; RSS wants a timestamp, and a reader handed four identical ones
sorts them however it likes — usually reversing them, which would present the first release as
the newest thing on the press. The minutes preserve the order the file states and are not a claim
about the clock. `check-site.mjs` fails on two items sharing a `pubDate`, so the day this stops
working it says so.

**There is deliberately no `lastBuildDate` taken from the clock.** Anything derived from the
build time rather than from the sources makes the file differ from the committed copy on every
run, which turns `--check` from a staleness signal into noise that is always on. The channel date
is the newest release's date, because that is when the feed last had something to say.

**Three failures a feed has that a page does not, all gated in `check-site.mjs`:**

- **A guid is a permalink into an anchor on `/changelog/`.** If that id is not on the page, a
  reader clicking through lands at the top of a list of releases with no indication which one
  they came for. Same dangling-anchor failure the printed packets are already gated on.
- **A relative `href` inside an item resolves against the *reader*, not against us.** It works
  perfectly on the page it came from, which is the only place anybody would think to check it.
- **XML has no error recovery.** One unescaped `&` from a changelog entry and every reader
  rejects the whole document — not the one item. The entry bodies are escaped, and the escaping
  is checked rather than trusted.

None of these is reported by a reader. They see an error once, or simply stop getting updates,
and conclude the press went quiet.

----

### `security.txt` carries its expiry forward instead of recomputing it — 2026-09-20

RFC 9116 makes `Expires` mandatory and a lapsed file invalid, so the date has to be in the future
and cannot be hardcoded. The first version computed it as `Date.now()` plus a year, **to the
second**. That is a value derived from the clock rather than from the sources, so the file
differed from its committed copy on every single run: `build-site.mjs --check` reported it
`STALE` on a completely clean tree and exited 1, and so did `ship.mjs --check`.

**The cost was not the noise, it was the gate.** `--check` exists to answer one question — is the
committed site behind its sources? — and it had been answering "yes" unconditionally since the
day it was written. A gate that is always on says nothing; the next real staleness would have
arrived as one more line in a report that had cried wolf from the start. It survived unnoticed
because `ship.mjs` without `--check` *writes* rather than compares, and that is the command
anybody actually runs.

**The fix keeps the date a function of the sources.** Read the `Expires` already committed; if it
has more than 45 days left, return those exact bytes; otherwise mint a new one a year out. Output
is byte-stable between builds, the file stays valid, and renewal is prompted by the date running
down rather than by the clock ticking.

**The two windows are deliberately different sizes, and the order matters.** `check-site.mjs`
fails below **30** days; the generator renews below **45**. The renewal window has to be the
wider one. If they were the other way round there would be a band of dates in which the checker
refuses the file and rebuilding does not mint a new one — a gate nothing can clear, which is
worse than no gate. Verified across the boundary: at 40 days the checker passes and the build
renews anyway; at 29 days and at already-lapsed, the checker fails and a single rebuild clears
it.

**The general rule this settles**, now written into CLAUDE.md as its own: no generated file may
take a value from the clock. `feed.xml` was built the same week and has the same shape of problem
— its channel date is the newest release's date, not the build's — which is how this one came to
light.

----

----

## Open

### *Developmental Pace* overflows by 0.6 mm on A4

Measured at a 192 mm column — the A4 case with the 9 mm margins the broadsides are designed against. The press avoids it by using a 194 mm column, but the sheet as published on stimpunks.org is over. **This belongs upstream**, in the Knowledge System's `broadsides/`, not here.

### Should broadsides be selectable in a packet?

They are not, today, and that is what lets the two page sizes coexist. If they should be, the packet needs a rule for mixing page sizes — probably grouping broadsides after the sheets, or a second download. Nobody has asked for it yet.

### Two sheets have no page on stimpunks.org

`ABA Tactics` and `Sensory Access at Work` are published on the press and not on the site. That is a legitimate state, declared in `sheets.json` as `published: null`, and each sheet's page says so plainly. Whether they should get pages is an editorial decision.
