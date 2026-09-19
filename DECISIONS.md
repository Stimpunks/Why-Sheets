# Decisions

Why things are the way they are, so the same questions are not re-litigated in three weeks. Settled decisions first; open ones at the end.

----

## Settled

### The repository is the source of truth, and `sheets.json` is what makes that enforceable — 2026-09-19

Before the press there were three live answers to *how many Why Sheets are there?*: 14 files here, 12 published pages on stimpunks.org, 9 named in the list on `/why/`. None was wrong on its own. Two sheets genuinely had no page yet, and three published sheets had simply never been added to the list. The failure was that nothing read all three.

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

## Open

### The three published-but-unlisted sheets on stimpunks.org

`boring-technology`, `masking-and-burnout` and `monotropism` are published and nothing on [/why/](https://stimpunks.org/why/) links to them. A reader who does not already know the URL cannot find them.

This is a **stimpunks.org edit, not a repository one**, and it is Ryan's to make. `check-drift.mjs` reports it as a note rather than a failure for exactly that reason.

### `Masking and Burnout.md` still says "Not yet published"

Its own header calls itself a draft for a page that has been live for some time. A one-line fix in the sheet, but it is Ryan's prose.

### *Developmental Pace* overflows by 0.6 mm on A4

Measured at a 192 mm column — the A4 case with the 9 mm margins the broadsides are designed against. The press avoids it by using a 194 mm column, but the sheet as published on stimpunks.org is over. **This belongs upstream**, in the Knowledge System's `broadsides/`, not here.

### Should broadsides be selectable in a packet?

They are not, today, and that is what lets the two page sizes coexist. If they should be, the packet needs a rule for mixing page sizes — probably grouping broadsides after the sheets, or a second download. Nobody has asked for it yet.

### Two sheets have no page on stimpunks.org

`ABA Tactics` and `Sensory Access at Work` are published on the press and not on the site. That is a legitimate state, declared in `sheets.json` as `published: null`, and each sheet's page says so plainly. Whether they should get pages is an editorial decision.
