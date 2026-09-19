/**
 * shelf.js — the library page: filtering, picking, and the tray.
 *
 * PROGRESSIVE, NOT OPTIONAL-EXTRA. Every sheet is a real link to a real page
 * with a real PDF, and all of that works with this file blocked. What scripting
 * adds is the one thing markup cannot do: carrying a selection across pages and
 * joining several PDFs into one. The page says so in a note rather than
 * assuming.
 *
 * FILTERING HIDES, IT DOES NOT REMOVE. A hidden card keeps its checkbox state,
 * so narrowing the shelf to "school", picking three, then switching to "work"
 * and picking two more gives you five — which is what somebody preparing for a
 * meeting actually does. Clearing the filter brings all five back into view.
 */
import { has, toggle, clear, count, onChange } from './selection.js';

const cards = [...document.querySelectorAll('.card[data-slug]')];
const chips = [...document.querySelectorAll('.chip[data-topic]')];
const tray = document.querySelector('[data-tray]');
const trayCount = document.querySelector('[data-tray-count]');
const trayLabel = document.querySelector('[data-tray-label]');
const trayClear = document.querySelector('[data-tray-clear]');
const status = document.querySelector('[data-shelf-status]');

/* ── picking ────────────────────────────────────────────────────────────── */

function syncBoxes() {
  for (const card of cards) {
    const box = card.querySelector('input[data-pick]');
    if (box) box.checked = has(card.dataset.slug);
  }
}

function syncTray() {
  const n = count();
  trayCount.textContent = String(n);
  tray.hidden = n === 0;
  /* The label is a sentence, not a number: a screen reader announcing "3" on
     its own tells you nothing about what has three. It gets its own element so
     updating it cannot disturb the count beside it. */
  if (trayLabel) trayLabel.textContent = n === 1 ? 'sheet in your packet' : 'sheets in your packet';
}

document.addEventListener('change', (e) => {
  const box = e.target.closest('input[data-pick]');
  if (!box) return;
  const slug = box.dataset.pick;
  const nowIn = toggle(slug);
  announce(
    (nowIn ? 'Added ' : 'Removed ') +
      titleOf(slug) +
      (nowIn ? '. ' : '. ') +
      count() +
      (count() === 1 ? ' sheet in your packet.' : ' sheets in your packet.')
  );
});

trayClear?.addEventListener('click', () => {
  clear();
  announce('Packet cleared.');
});

const titleOf = (slug) =>
  document.querySelector('.card[data-slug="' + CSS.escape(slug) + '"] .card__title')?.textContent.trim() ||
  slug;

let announceTimer;
function announce(message) {
  if (!status) return;
  clearTimeout(announceTimer);
  /* Re-setting identical text does not re-announce in every screen reader, so
     the region is cleared first on a short timer. */
  status.textContent = '';
  announceTimer = setTimeout(() => {
    status.textContent = message;
  }, 60);
}

/* ── filtering ──────────────────────────────────────────────────────────── */

let activeTopic = '*';

function applyFilter() {
  let shown = 0;
  for (const card of cards) {
    const topics = (card.dataset.topics || '').split(/\s+/);
    const show = activeTopic === '*' || topics.includes(activeTopic);
    card.hidden = !show;
    if (show) shown++;
  }
  for (const chip of chips) {
    chip.setAttribute('aria-pressed', chip.dataset.topic === activeTopic ? 'true' : 'false');
  }
  announce(
    shown === cards.length
      ? 'Showing all ' + cards.length + ' sheets.'
      : 'Showing ' + shown + ' of ' + cards.length + ' sheets.'
  );
}

for (const chip of chips) {
  chip.addEventListener('click', () => {
    activeTopic = chip.dataset.topic === activeTopic ? '*' : chip.dataset.topic;
    applyFilter();
  });
}

/* ── go ─────────────────────────────────────────────────────────────────── */

onChange(() => {
  syncBoxes();
  syncTray();
});
syncBoxes();
syncTray();
