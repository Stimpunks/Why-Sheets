# Changelog

## 2026-09-19 — The Why Sheet Press

The first release. Fourteen Why Sheets and nine broadsides, published as a
print-first library at [whysheets.press](https://whysheets.press/), generated
from the Markdown in this repository.

**The press.** Every sheet gets a page and a PDF. Tick the ones you need and the
packet builder returns a single correctly paginated PDF — cover page with a name
and a date, contents list with real page numbers, everything numbered straight
through. Assembled in your own browser; nothing is uploaded and nothing is
recorded.

**One source of truth.** The site, the PDFs and the packet are all generated
from the Markdown, and `tools/check-drift.mjs` prints every count side by side
whether they agree or not.

**And the first thing it caught was itself.** It reported three sheets as
published but missing from the list on `/why/`. All three were already there.
That list is generated from the page's child pages at request time, so it cannot
drift — and the local site mirror had not re-fetched the page in six weeks,
because a page whose *rendered* output depends on other content never reports
itself as modified. The scrape is gone; the staleness signal that would have
caught it is in its place.

**126 non-breaking spaces repaired.** Nine of the fourteen sheets had been
quietly damaged by Ulysses, twenty-four of the spaces sitting inside an emphasis
delimiter where they stop the emphasis opening at all. The published pages were
not the damaged copy; these files were. `tools/check-ulysses.mjs` now finds them
and repairs exactly that, never the prose.

**Seven quotations that had become one.** The Hoodie sheet's seven separately
sourced quotations were rendering as a single blockquote carrying a single
citation — six sources folded into a seventh's attribution. A blank line ends a
quotation now.

**Two paper sizes, both measured.** Why Sheets print at 190 × 259 mm, the
intersection of A4 and US Letter. Broadsides print at 208 × 277 mm, the largest
page that fits both, giving the 194 mm column that is the narrowest width at
which all nine clear. Measured, not chosen — and the measuring turned up that
*Developmental Pace* is already 0.6 mm over on A4 as published.

**Gates.** Broadside page counts are asserted rather than assumed. Contrast is
measured in a real browser in both themes. Every internal link and anchor is
resolved. The Content-Security-Policy is checked against the markup, because the
local preview sends no CSP and an inline script breaks the page in production
only.
