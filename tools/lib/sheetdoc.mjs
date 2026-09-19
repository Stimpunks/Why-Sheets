/* sheetdoc.mjs — read a Why Sheet as STRUCTURE, not as HTML.
 *
 * lib/md.mjs renders a sheet for the web: it returns a string of HTML. The prompt
 * generator needs a different view of the same file — which sections exist, which
 * quotations carry which attribution, which bullets are the asks — so it parses
 * the Markdown again rather than trying to claw structure back out of rendered
 * HTML. Two small parsers over one format is the cheaper mistake; a regex that
 * mines <blockquote> out of a string is the expensive one.
 *
 * WHAT MAKES THIS SAFETY-CRITICAL AND NOT JUST PLUMBING. The prompts exist to stop
 * a family's AI agent inventing sources. That only works if every quotation handed
 * to the model arrives WITH its attribution attached. So an unattributed quote is
 * not parsed leniently and passed through — it throws, and the build stops. A
 * prompt that ships one uncited quotation teaches the model that uncited
 * quotations are acceptable in this document, which is the whole failure we are
 * buying insurance against.
 *
 * TWO ATTRIBUTION STYLES, BOTH REAL. The sheets were written over two years and
 * the house style changed. Both are the LAST non-empty line of the blockquote:
 *
 *   — Laura Hanby Hudgens, [Recess Is Not a Privilege](url), *HuffPost*, 2015
 *   [More Human Than a Ladder or Pyramid | HRP | Chris McNutt](url)
 *
 * Verified across all 16 sheets: 61 blockquotes, 61 matched by these two shapes,
 * 0 unmatched. Do not "simplify" this to the em-dash form — five sheets use the
 * other one and would start throwing.
 *
 * URLS ARE STRIPPED FROM ATTRIBUTIONS ON PURPOSE, and not to save space. The
 * Hoodie sheet cites a PDF through a 1.5 kB pre-signed S3 URL carrying an
 * X-Amz-Expires of 1800 seconds. It was already dead when the sheet was written.
 * A prompt that hands that to a model invites the model to put a link in a
 * parent's letter that 403s the moment anyone checks it — worse than no link,
 * because a dead citation reads as a fabricated one. The prompt carries author
 * and title; the sheet, which the prompt tells the parent to attach, carries the
 * links.
 */

const LINK_ONLY = /^\[([^\]]+)\]\([^)]*\)$/;

/* Markdown inline → plain text. Links become their label, emphasis is dropped.
   A prompt is a text file pasted into a chat box; it has no renderer. */
export function plain(s) {
  return s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Split a sheet into `## ` sections. Everything before the first one is the
   preamble, which on every sheet is the `# Title` line and nothing else. */
export function sections(src) {
  const out = [];
  let cur = { heading: null, lines: [] };
  for (const ln of src.split('\n')) {
    const h = /^## (.+)$/.exec(ln);
    if (h) {
      out.push(cur);
      cur = { heading: h[1].trim(), lines: [] };
    } else cur.lines.push(ln);
  }
  out.push(cur);
  return out;
}

/* Every blockquote in the sheet, with its attribution separated out.
   Throws on an unattributed quote — see the header. */
export function quotes(src, label) {
  const blocks = [];
  let cur = [];
  for (const ln of src.split('\n')) {
    if (/^>/.test(ln)) cur.push(ln.replace(/^>\s?/, ''));
    else {
      if (cur.length) blocks.push(cur);
      cur = [];
    }
  }
  if (cur.length) blocks.push(cur);

  return blocks.map((b) => {
    const body = b.filter((l) => l.trim());
    const last = body[body.length - 1].trim();
    const isDash = last.startsWith('—');
    const isLink = LINK_ONLY.test(last);
    if (!isDash && !isLink) {
      throw new Error(
        `${label}: blockquote has no attribution line.\n` +
          `  last line: ${last.slice(0, 90)}\n` +
          `  An attribution is either "— Author, Title, Publication" or a single\n` +
          `  [Title | Publication | Author](url) link. A quotation cannot enter a\n` +
          `  prompt without one — see tools/lib/sheetdoc.mjs.`
      );
    }
    const text = plain(body.slice(0, -1).join(' ')).replace(/^["“](.*)["”]$/, '$1');
    const source = plain(last.replace(/^—\s*/, '')).replace(/\s*\|\s*/g, ' — ');
    return { text, source };
  });
}

/* The asks. Exactly two headings count: "What to Ask For in the Room" addresses
   the parent, "What to Do Instead" addresses the educator. Both are lists of
   things that should change, which is what a letter asks for; the generator
   rewords the educator-facing ones.
   Returns null when the sheet has neither — the caller decides what that means.
 *
 * THE MATCH IS DELIBERATELY NARROW. A first version also matched /^instead of /,
 * which caught "Instead of ABA" on the Alternatives sheet — a 250-line catalogue
 * of therapeutic approaches, 110 bullets, and not a list of things to ask a
 * school for at all. It parsed cleanly and would have produced a prompt the size
 * of the sheet. So: an allow-list of headings that MEAN asks, plus a plausibility
 * gate below. A heading pattern that is "probably asks" is how a sheet's wrong
 * section ends up in a parent's letter.
 */
const ASK_HEADING = /^(what to ask for|what to do instead|questions to ask)/i;
const ASK_MAX = 15;

export function asks(src) {
  for (const sec of sections(src)) {
    if (!sec.heading || !ASK_HEADING.test(sec.heading)) continue;
    /* TWO SHAPES, BOTH REAL, AND THE SECOND WAS NEARLY REWRITTEN BY MISTAKE.
       Most sheets state asks as a bullet list. Monotropism states them as a bold
       label followed by the question it stands for:

         **Warning**

         What notice does this young person get before a change?

       That is a genuine asks section and a good one. Reading only bullets found
       zero in it, which read as "this sheet has no asks" — and the remedy that
       suggests is writing a new section over prose that was already there and
       already better. Check for the label shape before concluding a section is
       empty. */
    const labelled = [];
    let pendingLabel = null;
    for (const ln of sec.lines) {
      const t = ln.trim();
      if (!t) continue;
      const lab = /^\*\*(.+?)\*\*$/.exec(t);
      if (lab) {
        pendingLabel = plain(lab[1]);
      } else if (pendingLabel && !t.startsWith('-') && !t.startsWith('#')) {
        labelled.push(pendingLabel + ' — ' + plain(t));
        pendingLabel = null;
      }
    }

    /* ONLY THE FIRST CONTIGUOUS BULLET RUN. A section can hold more than one list.
       Eye Contact's "What to Do Instead" states the asks, then a second list of
       engagement signals to watch for instead ("responding to questions",
       "participating in discussion"). Swept up as asks those become a parent
       demanding that the school do "responding to questions", which is not a
       sentence. Prose between two lists ends the asks. */
    const bullets = [];
    let started = false;
    for (const ln of sec.lines) {
      const t = ln.trim();
      const m = /^- (.+)$/.exec(t);
      if (m) {
        bullets.push(plain(m[1]));
        started = true;
      } else if (started && t) break;
    }
    if (!bullets.length && labelled.length) return { heading: sec.heading, bullets: labelled };
    if (!bullets.length) continue;
    if (bullets.length > ASK_MAX) {
      throw new Error(
        `asks: section "${sec.heading}" has ${bullets.length} bullets (max ${ASK_MAX}).\n` +
          `  That is too many to be a list of asks, so the heading match is probably\n` +
          `  wrong — or the section needs splitting. Refusing rather than emitting a\n` +
          `  prompt built from the wrong part of the sheet.`
      );
    }
    return { heading: sec.heading, bullets };
  }
  return null;
}

/* A CATALOGUE SHEET'S MENU: every `### Heading` with its bullets.
 *
 * Most sheets make one argument and end with a fixed list of asks. Sensory
 * Access at Work does not — it is a reference covering eight senses, each with
 * its own list of concrete adjustments, and its own instructions say "pick the
 * entries that fit you; you do not need every item". There is no single asks
 * list to extract because the whole sheet is the list.
 *
 * So a workplace prompt is built from this instead: the model gets the full
 * vocabulary of adjustments, grouped as the sheet groups them, and the
 * interview does the picking. Asking a sheet like this for a
 * "What to Ask For in the Room" section would mean writing one that duplicates
 * eight sections of the sheet badly.
 *
 * Returns [] for a sheet with no `###` subsections, which is most of them.
 */
export function menu(src) {
  const out = [];
  let cur = null;
  for (const ln of src.split('\n')) {
    const h = /^###\s+(.+?)\s*$/.exec(ln);
    if (h) {
      cur = { heading: plain(h[1]), items: [] };
      out.push(cur);
      continue;
    }
    if (/^##\s/.test(ln)) {
      cur = null;
      continue;
    }
    const b = /^-\s+(.+)$/.exec(ln.trim());
    if (b && cur) cur.items.push(plain(b[1]));
  }
  return out.filter((g) => g.items.length);
}

/* The Short Version — the sheet's own compressed argument, which is exactly what
   the letter's one argument paragraph should be built from. */
export function shortVersion(src) {
  const sec = sections(src).find((s) => s.heading && /^the short version$/i.test(s.heading));
  if (!sec) return [];
  return sec.lines
    .map((l) => l.trim())
    /* Drop horizontal rules. The house convention is four dashes, but the older
       sheets use three, so match any run rather than the convention. */
    .filter((l) => l && !/^-{3,}$/.test(l) && !l.startsWith('>'))
    .map(plain);
}

export function parse(src, label) {
  return {
    quotes: quotes(src, label),
    asks: asks(src),
    menu: menu(src),
    shortVersion: shortVersion(src),
  };
}
