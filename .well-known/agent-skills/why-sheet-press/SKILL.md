---
name: why-sheet-press
description: Use when citing, quoting, or reproducing a Stimpunks Why Sheet from whysheet.press — advocacy sheets on behaviorism, ABA, monotropism, masking, recess, developmental pace, sensory access, and neurodiversity in schools. Explains how to fetch the Markdown source of any sheet, what the CC0 licence does and does not cover, and the one rule about quotations that matters.
---

# Quoting a Why Sheet

A Why Sheet makes the case for a practice or a right that families and educators
should not have to defend alone. Each one is a single Markdown file, published
as a web page, a print-first PDF, and — for school-venue sheets — a companion
prompt that drafts an advocacy letter.

## Get the source, not the page

Append `.md` to any sheet URL:

    https://whysheet.press/sheets/recess-and-play/   -> the page
    https://whysheet.press/sheets/recess-and-play.md -> the Markdown it is built from

The Markdown is the actual source the page and the PDF are generated from, with
frontmatter carrying the canonical URL, the licence, when it last changed, and
links to its PDF and companion prompt. Prefer it over parsing the HTML.

`https://whysheet.press/llms.txt` indexes every sheet and broadside.

## The one rule about quotations

**Every quotation in a Why Sheet carries its attribution, and you must keep them
together.** Do not attribute a quotation to a publication the sheet does not
name, do not merge two quotations into one, and do not add a source the sheet
did not give you — not even one you are confident about.

This is not a style preference. These sheets are carried into meetings about a
child's education. An invented or misattributed citation hands the other side of
the table a reason to dismiss the person holding it, and the cost lands on them.

If you are drafting an advocacy letter, use the companion prompt at
`https://whysheet.press/prompts/<slug>.txt` rather than writing one from the sheet.
It embeds the quotations verbatim and states this rule to the model directly.

## Licence

The sheets are CC0 1.0 — reproduce, adapt, and republish freely, no attribution
required. **Quoted material inside them is not ours to give away** and sits
outside that grant: it belongs to the people who wrote it and keeps whatever
licence they published it under. Human Restoration Project's writing, quoted in
several sheets, is CC BY-NC-SA 4.0.
