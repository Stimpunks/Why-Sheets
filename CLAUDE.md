# Working in this repository

This repository is two things at once: **the fourteen Why Sheets**, and **the press that publishes them** at [whysheets.press](https://whysheets.press/). The sheets are the source. Everything else is derived from them and committed.

Read [README.md](README.md) first for what the press is. This file is how to work on it without breaking something quietly.

----

## The one command

```bash
node tools/ship.mjs
```

Six stages, in the only order that works, stopping at the first failure. Run it before every commit. `--check` writes nothing.

Running stages by hand is fine when you know why; running them **out of order** produces a site that is confidently wrong without erroring — PDFs printed from last week's pages, a drift report passing because it read files nothing regenerated.

----

## The rules that are not preferences

### The Markdown sheets are the source. Nothing else is.

Do not edit a generated page, a generated stylesheet, or a PDF. They are overwritten. If a page is wrong, the sheet is wrong or the generator is wrong.

`sheets.json` holds everything the sheets cannot: slugs, published URLs, what each one is for, and when somebody reaches for it. **Slugs are declared, never computed** — `Neuromodulation & Autism.md` publishes at `/why/neuromodulation/`, and a generator that guessed from the filename would link a printed packet at a 404.

### Ulysses damages these files, and the damage prints

This repository is a Ulysses external folder — there is a `.Ulysses-Group.plist` beside the sheets. Ulysses rewrites Markdown when it saves, in two ways, and both land on disk before anything publishes:

- **Backslash escapes** on Markdown punctuation, which publish as literal asterisks and drag the surrounding emphasis onto the wrong words.
- **Non-breaking spaces (U+00A0) in front of emphasis openers.** This is the quieter one and does far more damage: U+00A0 counts as whitespace to a Markdown parser, so an emphasis run whose opener is followed by one **never opens at all**.

There were **126 non-breaking spaces across nine of the fourteen sheets** when the press was built, twenty-four of them inside a delimiter. The published pages on stimpunks.org were *not* the damaged copy — these were. The sheets had been published before Ulysses touched them, and were quietly decaying in an editor afterwards.

```bash
node tools/check-ulysses.mjs          # report
node tools/check-ulysses.mjs --fix    # repair, then read `git diff`
```

`--fix` touches only the two artifact classes, never the prose, and it closes a delimiter gap **only** where the whitespace contained a non-breaking space — an author's ordinary `** ` is left alone. Read the diff anyway. An earlier version of that rule matched closing delimiters too and welded words together (`**redefine**our terms`); it was caught in the diff, which is the only reason it did not ship.

**Backslash escapes are reported, never rewritten.** A deliberate one exists in the wild — CIE lightness is written `L*` — so a human decides.

This applies to `README.md` and this file as well: they are Markdown in a folder Ulysses can open.

### A guard that refuses is the system working

Every irreversible or invisible step here has a check that fails by default:

- **`build-pdfs` asserts the page count of every broadside.** Two pages, or it is not one sheet printed both sides. This is not decoration: `.sb-sheet` has a fixed height, so content that overruns is *clipped*, not paginated — the sheet silently loses the bottom of side B and still looks finished. It fired three times during the build, and each time it was right.
- **`build-site` refuses a sheet whose first heading disagrees with `sheets.json`**, which is a sheet retitled in one place and not the other.
- **`check-site` measures contrast in a real browser, in both themes**, against computed colours rather than the values in the stylesheet.
- **`check-drift` prints all the counts side by side** whether they agree or not.

When one refuses, fix the thing. Do not raise the threshold.

### Paper sizes are measured, not chosen

Two pages, for two different reasons, and neither number is a preference:

- **Why Sheets: 190 × 259 mm.** The intersection of A4 and US Letter. A PDF sized to either one is a different physical object depending on the reader's country. Sized to the overlap it prints at actual size on both.
- **Broadsides: 208 × 277 mm, margins 9 / 7 / 7.** The *largest* page that fits both papers, giving a 194 mm column. A broadside is a fixed composition, not reflowing text, and 194 mm is the narrowest width at which all nine clear — measured under emulated print media, not guessed. At 192 mm, which is the A4 case, *Developmental Pace* overflows by 0.6 mm. **That is a real finding about the upstream sheet**, and it belongs in the Knowledge System's broadsides repository rather than being papered over here.

### The Content-Security-Policy is real, and the preview cannot test it

`_headers` declares `script-src 'self'` and `style-src 'self'` with no `unsafe-inline`. The local preview sends no CSP at all, so an inline `<script>`, a `style=` attribute or a third-party origin breaks the page **in production only**. `check-site` is the only thing that would catch it before a reader does.

This is why the nine broadside blocks are taken apart at build time rather than pasted in: each arrives from WordPress as a self-contained `<style>` plus an inline `<script>`, and both are re-emitted as files. The easy version of that decision is one exception in `_headers` that then covers everything forever.

----

## The broadside mirror

`broadsides/source/*.block.html` is **mirrored read-only** from the Stimpunks Knowledge System. Edit them there and re-run `tools/sync-broadsides.mjs`; a change made here is overwritten and never reaches the published page on stimpunks.org.

`broadsides/source/_PROVENANCE.md` records the source commit, so staleness is *detectable*: compare it with that repository's HEAD. Nothing detects it automatically, because re-syncing pulls whatever is at the HEAD of a working repository, and that is a decision rather than a chore.

The blocks are CC0. The build tooling in that repository is CC BY-SA 4.0 and is deliberately not copied.

----

## Checking links on stimpunks.org

**Read the local `site/` mirror in the Knowledge System. Never burst-check the live site.** A parallel sweep trips its bot protection, after which *every* URL returns 403 — including ones that answered 200 seconds earlier — and the run is useless in both directions while still producing something formatted like a report.

And on that site **a 3xx is a failure, not a pass**: WordPress core's `redirect_guess_404_permalink()` takes a wrong path carrying a known slug and sends it to whatever else owns that slug, so a link to a page that does not exist lands on a glossary term and looks like it worked.

`check-drift.mjs` reads the mirror for exactly these reasons. Re-sync it first, or "not published" means "not synced yet".

----

## House style for anything published here

The [Stimpunks Editorial Voice](https://stimpunks.org/fieldguide/editorial/style-guide/) applies to every word on the press. The hard rules: **capitalize Autistic and Disabled**, and use **identity-first language** — "Autistic person", not "person with autism". Plainspoken, declarative, one idea per sentence. Take a position; neutrality toward harmful systems is itself harmful.

Horizontal rules in Markdown here are **four dashes**, not three.

----

## No dependencies

There is no `package.json` and there should not be one. Every tool is zero-dependency Node with its reasoning written beside it, matching the sibling Stimpunks sites (Star Stuff, Penguin Pebbling, Queering Earth). The single exception is **pdf-lib**, vendored at `assets/vendor/`, which runs in the reader's browser and never at build time — see [ATTRIBUTIONS.md](ATTRIBUTIONS.md) and [DECISIONS.md](DECISIONS.md).

The comments in `tools/` are long on purpose. Each one records what went wrong to make the code look like that. Delete the code before you delete the comment.
