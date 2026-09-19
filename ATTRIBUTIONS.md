# Attributions

Everything in this repository is **CC0 1.0** — the sheets, the site, the tooling —
with the exceptions below, which are not ours to give away.

----

## Quoted material inside the sheets

The Why Sheets are built out of other people's sourced words. **Every quotation
belongs to whoever wrote it and sits outside the CC0 grant.** Each is attributed
and linked where it appears. Quote them as you would from any source; do not
treat them as public domain because the sheet around them is.

This matters most where a colleague's work is quoted with permission rather than
merely cited — Helen Edgar's guides in *Masking and Burnout*, for instance. Her
words remain hers.

## Signatories

The people, organisations and communities listed on a sheet endorsed **that
sheet**. If you change one substantially, take the signature list off. It is no
longer the document they put their name to, and leaving it on implies an
endorsement nobody gave.

----

## Atkinson Hyperlegible Next

`fonts/*.woff2` — © Braille Institute of America, Inc.
**SIL Open Font Licence 1.1.** Full text in
[`fonts/AtkinsonHyperlegibleNext-OFL.txt`](fonts/AtkinsonHyperlegibleNext-OFL.txt).

Drawn to keep letterforms distinguishable from one another. It is here for the
same reason the rest of the press exists: somebody is reading this under
fluorescent light in a room where they are outnumbered.

## pdf-lib

`assets/vendor/pdf-lib.esm.min.js` — version 1.17.1, © 2019 Andrew Dillon.
**MIT Licence.** Full text in
[`assets/vendor/pdf-lib-LICENSE.md`](assets/vendor/pdf-lib-LICENSE.md).

The only third-party code that runs on the site. It joins the sheets' PDFs into
a packet, in the reader's browser, and is loaded only when the button is pressed.
Vendored rather than loaded from a CDN so that `default-src 'none'` stays true
and no reader's request leaves this origin. See [DECISIONS.md](DECISIONS.md).

----

## The broadside blocks

`broadsides/source/*.block.html` are mirrored from the Stimpunks Knowledge
System and are **CC0 1.0**, as that repository's own README states: the text,
the markup and the stylesheet written for them.

The build tooling in that repository is **CC BY-SA 4.0** and is deliberately not
copied here. `tools/lib/chrome.mjs` was written fresh for this repository; it
solves the same problem as `check-sheets.mjs` there — drive headless Chrome over
the DevTools Protocol with no dependencies — because that is what the protocol
requires, not because the code was taken.

----

## The form itself

The Why Sheet is [Alfie Kohn's](https://www.alfiekohn.org/blogs/why/) idea, named
and described by him. The broadside format — one sheet, two sides, sized to land
on both A4 and US Letter — is a functional constraint rather than borrowed
expression, and constraints are not copyrightable.
