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

/* "Copy the prompt" fetches the .txt and puts it on the clipboard.
 *
 * WHY FETCH AND NOT INLINE THE TEXT. A prompt is 900-1,800 words. Inlining four
 * of them would put the largest thing on the page into every sheet's HTML for a
 * button most readers never press, and it would be a second copy that can drift
 * from prompts/<slug>.txt. One file, fetched on demand. `connect-src 'self'` in
 * _headers already allows this — the packet builder relies on the same thing.
 *
 * THE DOWNLOAD LINK BESIDE IT IS NOT A FALLBACK, IT IS THE OTHER HALF. The
 * Clipboard API needs a secure context and permission that a browser can refuse
 * without warning, and readers on locked-down school devices meet that. So a
 * failure says so and points at the link, rather than leaving a button that
 * looks like it worked.
 */
for (const el of document.querySelectorAll('[data-copy-prompt]')) {
  const original = el.textContent;
  let timer;

  el.addEventListener('click', async () => {
    clearTimeout(timer);
    const say = (msg) => {
      el.textContent = msg;
      timer = setTimeout(() => (el.textContent = original), 4000);
    };
    /* THE FETCH IS HANDED TO THE CLIPBOARD AS A PROMISE, NOT AWAITED FIRST.
       Writing to the clipboard needs transient user activation, and awaiting a
       network round trip before the write spends it. Chrome is lenient; WebKit
       is not, so `await fetch(); await writeText()` copies on a laptop and
       silently fails on an iPhone — which is precisely the reader we are
       building for, drafting a letter on a phone the evening before a meeting.
       ClipboardItem accepts a pending Promise, so the write is registered inside
       the activation window and resolves afterwards.
       writeText() stays as the fallback for browsers without ClipboardItem. */
    const load = fetch(el.dataset.copyPrompt).then((res) => {
      if (!res.ok) throw new Error(res.status);
      return res.text();
    });

    try {
      if (typeof ClipboardItem === 'function' && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': load.then((t) => new Blob([t], { type: 'text/plain' })),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(await load);
      }
      say('Copied — paste it into your assistant');
    } catch {
      say('Could not copy — use Download it instead');
    }
  });
}
