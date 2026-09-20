# Why Sheets

**Free, editable, open-licensed sheets that make the case for you.**
Fourteen of them, published as a print-first library at **[whysheet.press](https://whysheet.press/)**.

Families navigating schools, hospitals and systems are constantly asked to justify what should be obvious. The answers exist — in research, in law, in lived experience — but finding them, organising them and presenting them concisely in a meeting is exhausting work, and it lands on the people with the least left over. Why Sheets do that work in advance.

----

## What is here

| | |
|---|---|
| `*.md` at the root | **The sixteen Why Sheets.** These are the source. Everything else is derived from them. |
| `sheets.json` | The manifest: slug, published URL, what each sheet is for, and when somebody reaches for it. |
| `broadsides/source/` | Ten broadsides, mirrored read-only from the Stimpunks Knowledge System. |
| `CHANGELOG.md` | What changed, in prose. The source for [/changelog/](https://whysheet.press/changelog/) and the RSS feed. |
| `tools/` | The generators and the gates. Zero dependencies, Node 22+. |
| everything else | Generated, and committed — the site as Netlify publishes it. |

----

## The press

[whysheet.press](https://whysheet.press/) is the whole library, print-first.

You tick the sheets you need for Thursday's meeting. It gives you back **one correctly paginated PDF**, with a cover page you can put a name and a date on, numbered straight through, citations intact. It is the difference between *"here are nine pages you could each print separately"* and *"here is the folder you carry into the room."*

The sheets already do the argument. The press does the logistics, which is the part that eats an evening at eleven o'clock the night before.

**[What changed](https://whysheet.press/changelog/)** lists every release in plain words, with a feed at **[/feed.xml](https://whysheet.press/feed.xml)** — because a sheet you printed in March may not be the sheet that is there now, and telling you so should not require us to hold your email address.

Every PDF is **190 × 259 mm** — the intersection of A4 and US Letter — so it prints at actual size in either country with no scaling. Broadsides are **208 × 277 mm**, the largest page that still fits both, because they are fixed compositions rather than reflowing text. Nothing is uploaded: the packet is assembled in your own browser, and there is no account, no analytics and no record of which sheets anybody put together.

----

## The repository is the source of truth

That was not true before the press existed. There were three apparent answers to *how many Why Sheets are there?*: **14** files here, **12** pages published on stimpunks.org, and **9** in the list on [/why/](https://stimpunks.org/why/).

`tools/check-drift.mjs` now prints every count side by side whether they agree or not — and the first thing it did was catch itself. The nine were an artefact: that list is generated from child pages at request time, and the local site mirror had not re-fetched the page in six weeks because its *stored* content had not changed. A count read out of a stale snapshot is worse than no count, because it arrives formatted as an answer. The check that produced it is gone; what replaced it is the staleness signal that would have caught it.

----

## Working on a sheet

Edit the Markdown. Then:

```bash
node tools/ship.mjs
```

That runs every stage in the one order that works — check the sources, mirror the broadsides, build the pages, print the PDFs, check the site, check for drift — and stops at the first failure rather than building on top of it.

Deploying is a push. Netlify publishes this repository as it stands; there is no build step in the cloud, which is why the generated pages and all 23 PDFs are committed and reviewable in a diff.

**If you edit a sheet in Ulysses, run `node tools/check-ulysses.mjs` before you commit.** Ulysses rewrites Markdown when it saves: it adds backslash escapes and non-breaking spaces in front of emphasis openers, and a non-breaking space after `**` means the bold never opens at all — it publishes as literal asterisks. There were 126 of them in nine of these sheets when the press was built.

----

## The licence, plainly

Every sheet is **[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)**. Print it. Change it. Delete the parts that do not apply to you. Put your own name on it. Hand it to a hundred people. You do not need permission and you do not need to credit us.

Two things sit outside that, and both matter:

- **Quoted material belongs to whoever wrote it.** These sheets are built out of other people's sourced words. Those are quoted, not given away.
- **Signatories endorsed the sheet they signed.** If you change one substantially, take the signature list off — it is no longer the document they put their name to.

Build tooling in `tools/` is CC0 like the rest. The one vendored dependency is not ours; see [ATTRIBUTIONS.md](ATTRIBUTIONS.md).

[Add your signature to a Why Sheet](https://stimpunks.org/fieldguide/operations/forms/sign-why-sheet/), or open an issue or a pull request. These are developed in public on purpose: the people these sheets serve should have real power over what they say.

----

## Where the form comes from

The Why Sheet is not our invention. It is [Alfie Kohn's](https://www.alfiekohn.org/blogs/why/).

> I imagined a set of handouts, each consisting of a single (double-sided) sheet that responded to a common question. The idea was to lay out the case briskly, making liberal use of bullet points and offering a short bibliography at the end for anyone who wanted more information.
>
> — [The Why Axis](https://www.alfiekohn.org/blogs/why/)

> In short, any practice that's constructive yet still controversial would be fair game for one of these punchy handouts.
>
> — [The Why Axis](https://www.alfiekohn.org/blogs/why/)

And the reason the form is needed at all is what Chomsky called **concision**: ideas that align with power need no explanation, and ideas that do not need a great deal.

> Having concision means that **ideas which align with forces of power in our society need no explanation and those that do not align with those forces of power need significant explanation.**
>
> — [Think Traditional Education "Works"? Prove it](https://andrewfaulstich.substack.com/p/think-traditional-education-works)

> Now, the kinds of things that I would say on Nightline, you can't say in one sentence, because they depart from standard religion. **If you want to repeat the religion you can get away with it between two commercials. If you wanna say something that questions the religion, you're expected to give evidence, and that you can't do between two commercials**, so therefore you lack concision so therefore you can't talk. I think that's a terrific technique of propaganda.
>
> — Noam Chomsky, [Conversations with History](https://www.youtube.com/watch?v=8ghoXQxdk6s)

[Concision](https://stimpunks.org/glossary/concision/) puts advocates at a disadvantage. We have to define all our terms. [Thinking differently often requires speaking differently](https://stimpunks.org/language/), so we end up sounding like we are from somewhere else.

Students and families battling [behaviorism](https://stimpunks.org/why/behaviorism/), [school-induced anxiety](https://stimpunks.org/glossary/school-induced-anxiety/) and systemic exclusion need whatever resources we can give them.

----

Published by [Stimpunks Foundation](https://stimpunks.org/).
