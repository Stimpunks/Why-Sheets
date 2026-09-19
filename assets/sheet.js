/**
 * sheet.js — the two controls on a single sheet's page.
 *
 * "Add to your packet" is a button rather than a checkbox here on purpose: on
 * the shelf you are picking from a list, and on a sheet's own page you have
 * already read it and are deciding about this one thing. The label says which
 * state you are in, not which state you would move to — "Remove from your
 * packet" means it is in, which is the reading people actually make.
 */
import { has, toggle, onChange } from './selection.js';

const button = document.querySelector('[data-pick-toggle]');
const printer = document.querySelector('[data-print-page]');

if (button) {
  const slug = button.dataset.pickToggle;

  const sync = () => {
    const inside = has(slug);
    button.textContent = inside ? 'Remove from your packet' : 'Add to your packet';
    button.setAttribute('aria-pressed', inside ? 'true' : 'false');
  };

  button.addEventListener('click', () => {
    toggle(slug);
    sync();
  });

  onChange(sync);
  sync();
}

/* The print stylesheet already strips the navigation, the actions and the
   colophon, so this really is just the browser's own print dialog. It is here
   because "Print this sheet" is what somebody is looking for, and hunting
   through a browser menu on a phone at eleven at night is a tax. */
printer?.addEventListener('click', () => window.print());
