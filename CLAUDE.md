# Working in this repository

This repository is two things at once: **the sixteen Why Sheets**, and **the press that publishes them** at [whysheet.press](https://whysheet.press/). The sheets are the source. Everything else is derived from them and committed.

Read [README.md](README.md) first for what the press is. This file is how to work on it without breaking something quietly.

----

## The one command

```bash
node tools/ship.mjs
```

Nine stages, in the only order that works, stopping at the first failure. Run it before every commit. `--check` writes nothing.

Running stages by hand is fine when you know why; running them **out of order** produces a site that is confidently wrong without erroring — PDFs printed from last week's pages, a drift report passing because it read files nothing regenerated.

----

## What this repository does not do

The press builds and publishes **whysheet.press**. Three things that look like they belong here
do not, and each lives in the **Stimpunks Knowledge System** (private) for a reason rather than
by accident.

**Broadsides are authored there, not here.** They are WordPress block markup destined for
stimpunks.org; this repository mirrors them read-only so the press can show and print them. The
authoring tools — contrast measurement, markup checking, print proofs, live-block verification —
and the `draft-broadside` skill all live in that repository, and **that tooling is CC BY-SA 4.0
while everything here is CC0**. Copying it in would relicense it by accident. See *The broadside
mirror* below.

**Publishing to stimpunks.org happens there.** It needs the WPVibe connection, the local `site/`
mirror, and the post-publication checks. A sheet published from here would skip all of them.

**Researching and writing a new sheet starts there.** The reason a Why Sheet can cite real
sources is a local search index over some twenty thousand documents — the reading library, the
highlights, the bookmark archive, the site mirror. That cannot move: it is built over a 2.6 GB
`raw/` that is too large to commit and lives complete on exactly one machine. Research in the
garden, write the `.md` into this checkout, run `ship` here.

**The end-to-end workflow is written down once, in the Knowledge System's `CLAUDE.md`**, under
*Publishing a Why Sheet*. It spans both repositories — research and broadside there, sheet and
press here, publication there — so neither file owns it and only one of them should carry it.
Two things from it matter here even if you never read the rest: a `letter: "school"` sheet needs
a **What to Ask For in the Room** section or the prompt generator refuses it, and `published:` in
`sheets.json` is set **after** the page exists on stimpunks.org, never in anticipation.

**None of that is an access boundary.** Both repositories sit on the same disk and a session in
either can read and write the other. It is a *context* boundary: this file is what a session
working on the press is given, so anything the press genuinely needs has to be written down here
rather than left in the other repository's instructions. The hazards below are here for exactly
that reason.

**A checkout without the Knowledge System still works.** `sync-broadsides` is a soft stage in
`ship.mjs` and `check-drift` reports a missing mirror rather than failing, because the mirrored
blocks are committed here and a contributor should not need a private repository to build the
site. Do not make either of them fatal.

----

## The rules that are not preferences

### The Markdown sheets are the source. Nothing else is.

Do not edit a generated page, a generated stylesheet, or a PDF. They are overwritten. If a page is wrong, the sheet is wrong or the generator is wrong.

`sheets.json` holds everything the sheets cannot: slugs, published URLs, what each one is for, and when somebody reaches for it. **Slugs are declared, never computed** — `Neuromodulation & Autism.md` publishes at `/why/neuromodulation/`, and a generator that guessed from the filename would link a printed packet at a 404.

### `CHANGELOG.md` is a source file too, and its headings are a contract

`/changelog/` and `/feed.xml` are both generated from it. Do not edit either one.

```
## YYYY-MM-DD — Title
```

An ISO date, an **em dash**, a title. The anchor a feed item permalinks to, the `pubDate` a
reader sorts by, and the order the page lists releases in are all derived from that line, so
`tools/lib/changelog.mjs` **refuses a heading that does not match** rather than folding the
release into the one above it — where it reads fine on the page and never appears in the feed.
Releases run **newest first**, and that is checked for the same reason: an entry appended at the
bottom out of habit publishes as the newest thing on the press.

**Every link in an entry must be absolute.** A feed reader has no base URL, so `/sheets/hoodie/`
resolves against *their* site. It works perfectly on the page it came from, which is the only
place anybody would think to check it. `check-site.mjs` gates it.

**A new sheet is a release, and gets its own entry.** This was not written down until
2026-09-20, and the omission showed: the first seven entries were all press infrastructure —
prompts, social cards, a feed — and the seventeenth Why Sheet shipped without a line. Somebody
subscribed to the feed to hear about sheets was told about the plumbing and not about AAC. The
changelog and the feed are the only way a reader who found the press before the sheet they need
existed ever learns it now does, so a sheet landing on the press is the most important thing the
feed can carry, not the least. Write the entry when the sheet lands here, and say plainly whether
it is on stimpunks.org yet — those are two different events and the reader cares about both.

Nothing in the feed may come from the clock, for the reason in the next rule.

### No generated file may take a value from the clock

Every file this repository writes is compared, byte for byte, against its committed copy —
that is the whole mechanism behind `--check` and the sentence *"the committed site is behind the
sources."* A generator that reaches for `Date.now()` puts a value in its output that no source
can account for, so **that file reports itself stale on every run, on a completely clean tree**.

This is not a cosmetic failure. It is a gate stuck on, and a gate that is always on says nothing:
the next real staleness arrives as one more line in a report that has cried wolf since the day it
was written.

**`.well-known/security.txt` did exactly this**, and for as long as it existed nobody noticed,
because `ship.mjs` without `--check` writes rather than compares and that is the command anybody
actually runs. RFC 9116 needs a future `Expires`, so the date cannot be hardcoded either. The way
out is to make the value a function of the sources: **carry the committed one forward while it
has time left, and mint a new one only when it is running out.** `feed.xml` has the same shape of
problem and the same answer — its channel date is the newest release's date, not the build's.

If you add a generator that genuinely needs a future date, **its renewal window must be wider
than whatever window `check-site.mjs` fails on**, or there is a band of dates where the checker
refuses the file and rebuilding does not produce a new one. That pair is currently 45 days
against 30, and the reasoning is written beside both numbers.

### Ulysses damages these files, and the damage prints

This repository is a Ulysses external folder — there is a `.Ulysses-Group.plist` beside the sheets. Ulysses rewrites Markdown when it saves, in two ways, and both land on disk before anything publishes:

- **Backslash escapes** on Markdown punctuation, which publish as literal asterisks and drag the surrounding emphasis onto the wrong words.
- **Non-breaking spaces (U+00A0) in front of emphasis openers.** This is the quieter one and does far more damage: U+00A0 counts as whitespace to a Markdown parser, so an emphasis run whose opener is followed by one **never opens at all**.

There were **126 non-breaking spaces across nine of the fourteen sheets that existed then** when the press was built, twenty-four of them inside a delimiter. The published pages on stimpunks.org were *not* the damaged copy — these were. The sheets had been published before Ulysses touched them, and were quietly decaying in an editor afterwards.

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

## Publishing hazards on stimpunks.org

Every one of these was found on a live page, never in a draft. **They share a shape, and it is
why no pre-publication check catches them: the source is clean and only the rendered page is
wrong.** They are recorded here, not only in the Knowledge System, because a session working on
the press is the one most likely to touch a published page and the least likely to be holding
that repository's instructions.

### Two `$` in one passage become an image

WordPress reads the pair as inline maths and replaces everything between them with a picture of
itself. It has fired three times on our accountability writing — most recently on a reflection
where a deficit figure vanished from the sentence whose whole job was publishing the deficit.
The corruption lands in stored `post_content`, so the draft always looks fine.

**Write published money as `&#36;`** — not `$`, and not `\$`, which protects the Markdown parser
only and is a bare `$` by the time the filter runs. After publishing, grep the live HTML for
`latex.php` and require zero.

### An apostrophe in a heading becomes a hyphen, not nothing

*"A Generation That Can't See a Toy Anymore"* gets the id `h-a-generation-that-can-t-see-a-toy-anymore`.
The slug is generated by the platform at publish time and **cannot be derived from the source**,
so every pre-publication link check passes it. Two of fourteen table-of-contents anchors on one
post pointed at headings that did not exist — exactly the two containing apostrophes.

Any post with a table of contents needs its anchors checked against the rendered HTML
afterwards: every `href="#…"` must match a real `id=`. `tools/to-wordpress.mjs` sets anchors
explicitly for this reason — do not let it stop.

### A page built from other content is mirrored once and then frozen

The sibling of the rule above about reading the mirror, and the more dangerous one: that makes a
page *uneditable*, this makes it *silently stale*. The mirror syncs incrementally on `modified`,
and `modified` tracks a page's own stored content — not what its blocks render. A page built from
a subpages block, a table of contents, or a query loop keeps its old `modified` forever while the
live page moves, and the sync correctly skips it every run.

**`/why/` is the standing example.** Its list of Why Sheets is one self-closing block that renders
the page's published children at request time. Three sheets were published and appeared on the
live page within seconds; the mirrored copy went six weeks without re-fetching and still showed
nine. A drift check read it and reported three published sheets as missing, with a recommended
edit to markup that does not exist.

**So before reasoning about any page's *rendered* content out of the mirror, compare that page's
`modified` against the date of whatever it is supposed to contain.** Nothing incremental will
refresh them — only a full re-sync.

### A link to a page that does not exist yet keeps its slug

The corollary of *a 3xx is a failure*. When a sheet links somewhere not yet published, keep the
correct final slug and mark it `(planned)` beside the link, so it **self-heals** the moment that
page goes up. Never drop the link instead: a missed marker leaves a page stale, a missed re-link
leaves it broken, and stale is the cheaper failure. `check-drift.mjs` gates links into `/why/`
that nothing is published at.

### Editing a published page: the call shape, written down

Use WPVibe's `POST /wpvibe/v1/content/edit` — surgical, **keeps a revision** so there is an undo,
and the page content never enters the conversation. The parameters are not the obvious ones and
guessing them costs quota, since a rejected call still counts:

```json
{ "target_type": "post", "post_id": 70000, "field": "post_content",
  "old_content": "…exact bytes…", "new_content": "…", "replace_all": true }
```

Sent through the MCP's `rest_api` tool with `site_url` and `route`. `target_type` takes **post,
meta, or option** only — the post type is inferred from the id, so a page, a glossary term and a
synced pattern are all `post`. **Omit `replace_all` to keep the match-once guard** whenever you
expect exactly one hit.

**`replaced:` is the verification, and it only means something if you predicted it.** Count the
occurrences first and compare. Two traps, both paid for: `grep -c` counts matching *lines*, not
occurrences; and the returned `bytes` is a **byte** count while most string lengths you compute
are **characters**, so a section containing one em dash comes back two larger than predicted.

The account is on WPVibe's Pro plan — 500 calls per rolling 24 hours. Check `list_sites` for the
live figure before a large batch rather than trusting this sentence.

**Avoid `posts.update` / `pages.update`** — a full-content rewrite, and our block markup cannot be
reproduced byte-exactly as tool input. Never raw SQL on `post_content`: no revision, so no undo.

----

## House style for anything published here

The [Stimpunks Editorial Voice](https://stimpunks.org/fieldguide/editorial/style-guide/) applies to every word on the press. The hard rules: **capitalize Autistic and Disabled**, and use **identity-first language** — "Autistic person", not "person with autism". Plainspoken, declarative, one idea per sentence. Take a position; neutrality toward harmful systems is itself harmful.

Horizontal rules in Markdown here are **four dashes**, not three.

----

## No dependencies

There is no `package.json` and there should not be one. Every tool is zero-dependency Node with its reasoning written beside it, matching the sibling Stimpunks sites (Star Stuff, Penguin Pebbling, Queering Earth). The single exception is **pdf-lib**, vendored at `assets/vendor/`, which runs in the reader's browser and never at build time — see [ATTRIBUTIONS.md](ATTRIBUTIONS.md) and [DECISIONS.md](DECISIONS.md).

The comments in `tools/` are long on purpose. Each one records what went wrong to make the code look like that. Delete the code before you delete the comment.
