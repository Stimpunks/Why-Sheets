/**
 * selection.js — which sheets are in your packet.
 *
 * The whole of the state this site keeps. It lives in localStorage, on your own
 * device, and it is a list of slugs. There is no account, no server, no
 * identifier, and nothing that could say what anybody was reading about. A list
 * of Why Sheets somebody is assembling says a great deal about what is
 * happening to them, and it is nobody else's business.
 *
 * EVERY ACCESS IS WRAPPED. localStorage throws outright in some private-browsing
 * modes and when site data is blocked, and a thrown exception on the first line
 * of a module takes the whole page's scripting with it. The shelf has to keep
 * working — worse selection, same reading — so a failure here degrades to an
 * in-memory list that lasts until the tab closes.
 */

const KEY = 'whysheets.packet.v1';
let memory = [];

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return memory;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : memory;
  } catch {
    return memory;
  }
}

function write(list) {
  memory = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* Private window, blocked site data, full quota. The tab keeps its list. */
  }
  window.dispatchEvent(new CustomEvent('packet:change', { detail: { list } }));
}

export const get = () => read();
export const has = (slug) => read().includes(slug);
export const count = () => read().length;

export function add(slug) {
  const list = read();
  if (!list.includes(slug)) write([...list, slug]);
}

export function remove(slug) {
  write(read().filter((s) => s !== slug));
}

export function toggle(slug) {
  const next = !has(slug);
  next ? add(slug) : remove(slug);
  return next;
}

export function setOrder(list) {
  write(list.slice());
}

export function clear() {
  write([]);
}

/** Subscribe to changes, including those made in another tab. */
export function onChange(fn) {
  window.addEventListener('packet:change', (e) => fn(e.detail.list));
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) fn(read());
  });
}
