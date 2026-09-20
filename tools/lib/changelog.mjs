/**
 * changelog.mjs — CHANGELOG.md, read as a list of releases.
 *
 * THE CHANGELOG IS A SOURCE FILE, LIKE A SHEET. It is written by hand, in the
 * same Markdown subset lib/md.mjs parses, and the page at /changelog/ and the
 * feed at /feed.xml are both generated from it. Nobody edits the page and
 * nobody edits the feed — the same rule the sheets live under, for the same
 * reason: two places to say what changed is two places to disagree.
 *
 * THE HEADING IS A CONTRACT, NOT A CONVENTION.
 *
 *     ## 2026-09-19 — Asks sections, published
 *
 * An ISO date, an em dash, a title. Everything downstream is derived from those
 * three things: the anchor a feed item points at, the pubDate a reader sorts
 * by, the order the page lists them in. A heading that does not parse is
 * REPORTED rather than skipped — a release silently dropped from the feed is a
 * release nobody hears about, which is the one job the feed has.
 *
 * NEWEST FIRST, AND THAT IS CHECKED. The file reads top-down as most-recent-
 * first, and the feed inherits that order. An entry appended at the bottom out
 * of habit would publish as the newest thing on the press to every reader whose
 * client trusts document order. parse() refuses instead.
 *
 * WHY ENTRIES ON THE SAME DAY GET DIFFERENT TIMES. Four of the first five
 * releases here landed on 2026-09-19, because the press was built in a week.
 * A changelog records a day; RSS wants a timestamp, and a feed reader given
 * four identical ones sorts them however it likes — usually reversing them.
 * So entries on a shared date are spread a minute apart, descending, to
 * preserve the order the file states. Those minutes are not a claim that
 * anything happened at 11:58. They exist so a reader sees the same sequence the
 * page shows, and nothing else reads them.
 */
import { render, slugify, firstParagraph } from './md.mjs';

const RELEASE = /^##\s+(\d{4}-\d{2}-\d{2})\s+—\s+(.+?)\s*$/;

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** RFC 822, which is what RSS 2.0 requires. Always GMT: a two-digit offset is
 *  legal and is also the field most often got wrong, and nothing here is local
 *  to a timezone. */
export function rfc822(d) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    DAY[d.getUTCDay()] + ', ' + p(d.getUTCDate()) + ' ' + MONTH[d.getUTCMonth()] + ' ' +
    d.getUTCFullYear() + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' +
    p(d.getUTCSeconds()) + ' GMT'
  );
}

/* Noon rather than midnight. A date-only entry rendered at 00:00 UTC is the
   previous evening for every reader west of Greenwich, so a release dated the
   19th shows up in a US feed reader as the 18th. Noon puts the whole inhabited
   range of offsets inside the right day. */
const NOON = 12 * 3600e3;

/**
 * Parse CHANGELOG.md.
 * @returns {{releases: Array<{date,title,id,html,summary,pubDate,date822}>, problems: string[]}}
 */
export function parse(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const problems = [];
  const raw = [];
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s/.test(line) && !/^###/.test(line)) {
      const m = RELEASE.exec(line);
      if (!m) {
        /* Not skipped quietly. A heading one character off the contract — a
           hyphen where the em dash goes, a date written out in words — would
           otherwise fold its release into the previous one's body, where it
           reads fine on the page and never appears in the feed at all. */
        problems.push(
          'CHANGELOG.md line ' + (i + 1) + ': "' + line.trim() + '" is not a release heading. ' +
            'The form is "## YYYY-MM-DD — Title", with an em dash.'
        );
        continue;
      }
      current = { date: m[1], title: m[2], body: [] };
      raw.push(current);
      continue;
    }
    if (current) current.body.push(line);
  }

  if (!raw.length) problems.push('CHANGELOG.md has no release headings.');

  /* Newest first, checked rather than assumed — see the header. */
  for (let i = 1; i < raw.length; i++) {
    if (raw[i].date > raw[i - 1].date) {
      problems.push(
        'CHANGELOG.md: ' + raw[i].date + ' ("' + raw[i].title + '") is listed below the older ' +
          raw[i - 1].date + '. Releases run newest first; the feed takes its order from this file.'
      );
    }
  }

  /* How many entries share each date, so the minute offsets below can be
     assigned descending within a day. */
  const perDate = new Map();
  for (const r of raw) perDate.set(r.date, (perDate.get(r.date) || 0) + 1);
  const used = new Map();

  const ids = new Set();
  const releases = raw.map((r) => {
    const base = r.date + '-' + (slugify(r.title) || 'release');
    let id = base;
    let n = 2;
    while (ids.has(id)) id = base + '-' + n++;
    ids.add(id);

    const seen = used.get(r.date) || 0;
    used.set(r.date, seen + 1);
    const stamp = new Date(Date.parse(r.date + 'T00:00:00Z') + NOON - seen * 60e3);
    if (Number.isNaN(stamp.getTime())) problems.push('CHANGELOG.md: ' + r.date + ' is not a real date.');

    const out = render(r.body.join('\n').trim() + '\n');
    for (const u of out.unknown) problems.push('CHANGELOG.md, ' + r.date + ': ' + u);

    /* Heading ids are namespaced to their release. render() dedupes within one
       call and this is one call per entry, so two releases that both grew an
       "### Why" would collide on a page that lists all of them — and a
       duplicate id is an anchor that lands on whichever came first. */
    const html = out.html
      .replace(/ id="([^"]+)"/g, (_, x) => ' id="' + id + '--' + x + '"')
      .replace(/ href="#([^"]+)"/g, (_, x) => ' href="#' + id + '--' + x + '"');

    return {
      date: r.date,
      title: r.title,
      id,
      html,
      summary: firstParagraph(html),
      pubDate: stamp,
      date822: rfc822(stamp),
    };
  });

  return { releases, problems };
}
