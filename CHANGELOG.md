# Changelog

## 2026-09-20 — Demand Avoidance

**An eighteenth Why Sheet, for the meeting where a child has been called defiant.** [Demand
Avoidance](https://whysheet.press/sheets/demand-avoidance/) is for the room where a child's
inability to meet demands has been filed as a choice, and the plan on the table is more pressure.
The distinction the room keeps collapsing is the whole argument: can't, not won't.

**The evidence points at the setting, not the child.** Connolly, Constable and Mullally record
that an unrecognised demand avoidant presentation "is viewed as defiance and deliberately
challenging behavior, leading to school exclusions", and that "pressure to comply with direct
demands is well-documented to lead to escalation in emotional reactivity and challenging
behavior". A 2018 survey they cite found 70% of school aged demand avoidant children were either
not enrolled or unable to tolerate their school environment. Seventy percent is a description of
a setting.

**It does not ask the school to accept the label, and that is the design.** Truman and colleagues
found parents reporting teachers who did not necessarily believe PDA exists, so a sheet that only
works after a school concedes a contested diagnosis fails in most rooms. Richard Woods is the way
round it: the adjustments recommended for PDA are "suitable for most children, not just those
diagnosed with PDA". Ask for the practice, not the diagnosis.

**The asks are practice, not statute.** The strongest legal framing in this literature is UK —
the Equality Act, the unlawfulness of informal exclusions — and a US parent in an IEP meeting
cannot use it. So the sheet asks for the demand to be reduced first, for choices instead of
instructions, for rewards and sanctions named and removed, and for anger logged as communication
rather than as an incident.

**Twenty-two quotations, every one checked as a string against its source.** Including the two
places a machine-generated caption mis-heard a word, which are marked in square brackets rather
than quietly corrected. A companion prompt for a letter to school comes with it.

Published at [stimpunks.org/why/demand-avoidance/](https://stimpunks.org/why/demand-avoidance/).

## 2026-09-20 — The staleness check can fail again

**`security.txt` was rewriting itself on every build.** RFC 9116 wants a future expiry date, and
ours was computed as a year from `Date.now()` — to the second. So that one file differed from its
committed copy every single run, and `node tools/build-site.mjs --check` reported it stale on a
completely clean tree.

**The cost was not the noise. It was the gate.** That check exists to answer one question — is
the published site behind the sheets it is built from? — and it had been answering "yes"
unconditionally since the day it was written. A gate that is always on says nothing: the next
real drift would have arrived as one more line in a report that had cried wolf from the start.

**It carries the date forward now.** If the committed expiry has more than 45 days left it is
kept exactly as it is; only when it is running out is a new one minted, a year ahead. The file
stays valid, the build stays honest, and renewal is prompted by the date running down rather than
by the clock ticking.

**The renewal window is wider than the window that fails the build, on purpose.** The build
refuses the file below 30 days and renews it below 45. The other way round would leave a stretch
of dates where the check refuses and rebuilding does not fix it — a gate nothing can clear, which
is worse than no gate at all.

**And the general rule is written down now:** nothing this repository generates may take a value
from the clock. This was found while building the
[feed](https://whysheet.press/feed.xml), which was one decision away from the same bug.

## 2026-09-20 — A changelog you can subscribe to

**This page.** The sheets get revised — a section added, a quotation re-sourced, a claim
corrected — and somebody is carrying an earlier version into a meeting on Tuesday. A commit
history does not answer them. "What changed, and does it change what I hand over" is a question
in prose, and this file has been answering it in prose since the first release. Now it is
published at [whysheet.press/changelog](https://whysheet.press/changelog/) rather than sitting in
a repository, generated from the same Markdown like everything else here.

**And a feed, at [/feed.xml](https://whysheet.press/feed.xml).** A reader who finds the press
before the sheet they need exists has no way back except remembering to look. There are no
accounts here and there is no mailing list, because both mean holding somebody's address in order
to tell them a page changed. A feed is the version of that which collects nothing: your reader
asks for a file, we never learn that it did, and you unsubscribe without telling us.

**Same-day releases are a minute apart, and that is not a claim about the clock.** Four of the
first five releases here landed on one day. A changelog records a day; RSS wants a timestamp, and
a reader handed four identical ones sorts them however it likes — usually backwards, which would
have presented the oldest entry as the newest thing on the press. The minutes exist to preserve
the order this file states, and nothing else reads them.

**The feed is gated like everything else.** Every item's link is a permalink into an anchor on
the changelog page, and the build fails if that anchor is not there — the same dangling-anchor
check the printed packets already get, in a medium where nobody would ever report it. A feed
breaks silently and permanently: a reader sees an error once, or just stops getting updates, and
concludes the press went quiet.

## 2026-09-19 — AAC Is Not a Last Resort

**A seventeenth Why Sheet, logged here late.** [AAC Is Not a Last
Resort](https://whysheet.press/sheets/aac/) argues that a robust communication system is a right
rather than a reward for proving you deserve one, and that AAC does not delay speech — it
supports it. For the moment a school or clinic says a child needs to develop speech before they
can have a communication system.

**It answers the prerequisite myth with the profession that refutes it**, sets out where the
right is written down, and makes the case for presuming competence as the least dangerous
assumption. A device on its own is not enough: somebody has to model it.

**It has a broadside and a companion prompt**, and it is published at
[stimpunks.org/why/aac/](https://stimpunks.org/why/aac/).

**This entry is a backfill.** The sheet shipped on 2026-09-19 and no release note was written,
which is how a changelog with seven entries about prompts, cards and feeds had nothing to say
about the seventeenth sheet. The policy is written down now.

## 2026-09-19 — Prompts for work and clinic

**Every sheet that has somewhere to write now has a companion prompt** — twelve of sixteen, up
from ten. The four without one argue a position with no decision-maker at the other end.

**Sensory Access at Work** builds an accommodation request from the sheet's own menu of
forty-five adjustments across eight senses. It asks what you want to disclose before it writes
anything, and defaults to naming nothing: an adjustment can be asked for without naming a
diagnosis, and naming one puts it in a file you do not control.

**Neuromodulation & Autism** prepares the appointment rather than writing a letter. Six questions
to ask out loud, shaped to your situation, each with a line on what a good answer and a
non-answer sound like. Its first rule is that it must not give medical advice — the questions are
what make a decision informed, and the decision stays yours.

## 2026-09-19 — Asks sections, published

**All ten school sheets now say what to ask for.** Five gained a "What to Ask For in the Room"
section — Behaviorism, Alternatives to ABA, ABA Tactics, Positive Greetings at the Door, and
Hoodie — and all five are live on stimpunks.org as well as here. A sheet that makes the argument
and then leaves you to work out what to say in the room is doing half its job.

**Monotropism was never missing one.** It has had "Questions To Ask In The Room" all along,
written as a bold label above each question rather than as a list. The tooling read only lists,
found none, and reported the sheet as having no asks — which would have led to writing a new
section over better prose that was already there.

**All ten sheets now generate a companion prompt**, up from four.

**And the drift checker can see content now.** It used to count sheets, which is how five
sections could exist here and not on the site while it reported no drift. It compares the text of
every published section against the page — 167 of them — and fails the build when one is behind.

## 2026-09-19 — Social cards

**Every page now has a card.** Share a Why Sheet into Discord, Bluesky or Slack and the link
arrives with the sheet's title and the moment you reach for it, set in the site's own type on
white — a document, not an advertisement. Thirty cards: the library, each of the sixteen sheets,
each of the ten broadsides, the packet builder and the about page. Before this, every one of
those links arrived as a line of grey text.

**Rendered from the pages, so they cannot drift.** A new sheet gets a card with no further work.
The build fails if a card no longer matches its page, if a page has no card, or if a card
overflows at the minimum type size.

**`og:image:alt` carries what each card says.** A card is the only part of a shared link that a
blind reader would otherwise get nothing from.

## 2026-09-19 — Companion prompts

**A prompt to go with the sheet.** Four Why Sheets now carry a companion prompt: plain text you
copy into whatever AI assistant you already use, which asks you what happened — your child's
name, their year, what was said, how the evening went — and then drafts the letter. Eye Contact,
Masking and Burnout, Developmental Pace, and Recess and Play. Nothing you type reaches us.

**Each one carries its sheet's quotations inside it, word for word, and forbids the assistant
from adding any source it was not given.** That is the whole design. An assistant writing about
school policy will reach for a study, and an invented or misattributed citation hands a school a
free reason to dismiss you — in a room where you are already outnumbered. The generator refuses
to put a quotation into a prompt without its attribution attached.

**Generated from the sheets, so they cannot drift.** `tools/build-prompts.mjs` reads the
argument, the quotations and the asks out of the Markdown. `--check` fails the build if any
prompt no longer matches its sheet.

**And it only builds the ones it can build honestly.** A sheet with no "What to Ask For in the
Room" section is skipped rather than shipped without asks, because the alternative is an
assistant inventing what to demand of a school. Six school sheets are in that state and are
named on every build.

## 2026-09-19 — The Why Sheet Press

The first release. Fourteen Why Sheets and nine broadsides, published as a
print-first library at [whysheet.press](https://whysheet.press/), generated
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
