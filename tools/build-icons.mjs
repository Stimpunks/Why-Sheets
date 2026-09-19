/* build-icons.mjs — every icon surface, rendered from the one SVG.
 *
 * WHY GENERATE RATHER THAN HAND-EXPORT. favicon.svg is the source. Six PNGs and
 * an ICO exported by hand from a design tool are seven files that drift the
 * first time the mark changes, and nothing tells you they have. Generated, a
 * change to the SVG rebuilds all of them, and tools/check-site.mjs fails if one
 * is missing.
 *
 * WHY CHROME AND A HAND-WRITTEN ICO. This repository has no dependencies and is
 * not getting any for this. Chrome is already here rendering the PDFs and the
 * social cards, so it rasterises the SVG too. ICO is a container the format
 * spec makes trivial to write: a 6-byte header, one 16-byte directory entry per
 * image, then the image bytes. Every browser since Vista accepts PNG data
 * inside an ICO, so the entries are the PNGs Chrome just produced rather than
 * hand-rolled BMP.
 *
 * THE THREE SURFACES ARE NOT THE SAME PICTURE, and that is the whole reason
 * this file is longer than one loop:
 *
 *   - The BROWSER TAB gets the SVG as-is, rounded corners and all, because the
 *     browser draws it on whatever the tab strip's background happens to be.
 *   - APPLE TOUCH is full-bleed and opaque. iOS applies its own rounding and
 *     stopped adding a background behind transparent icons, so a transparent or
 *     pre-rounded icon shows broken corners on a home screen.
 *   - MASKABLE is full-bleed with the mark inside an 80% safe zone, because the
 *     platform crops it to a circle, a squircle, or whatever the launcher uses.
 *     An icon that fills its own frame loses its edges to that crop — which is
 *     why "maskable" is a separate file and not the 512 with a different name.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/chrome.mjs';
import { serve } from './lib/serve.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const SVG = path.join(REPO, 'favicon.svg');

/* size, output, and how much of the frame the mark is allowed to fill.
   1 = edge to edge; 0.72 keeps the mark inside the maskable safe zone. */
const JOBS = [
  { file: 'icon-16.png', size: 16, scale: 1, bleed: false },
  { file: 'icon-32.png', size: 32, scale: 1, bleed: false },
  { file: 'icon-48.png', size: 48, scale: 1, bleed: false },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.92, bleed: true },
  { file: 'icon-192.png', size: 192, scale: 1, bleed: false },
  { file: 'icon-512.png', size: 512, scale: 1, bleed: false },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.72, bleed: true },
];
/* The ICO carries the three classic sizes. Anything larger belongs in the PNGs;
   an ICO is what old browsers and crawlers hit at the root path. */
const ICO_SIZES = [16, 32, 48];

function cardFor(size, scale, bleed) {
  const inner = Math.round(size * scale);
  return `<!doctype html><html><head><meta charset="utf-8"><title>icon</title>
<style>
  html, body { margin: 0; padding: 0; }
  body {
    width: ${size}px; height: ${size}px;
    display: flex; align-items: center; justify-content: center;
    background: ${bleed ? '#ffffff' : 'transparent'};
  }
  img { width: ${inner}px; height: ${inner}px; display: block; }
</style></head>
<body><img src="/favicon.svg" alt=""></body></html>`;
}

/* An ICO whose entries are PNGs. Header, then one directory entry per image,
   then the image data. A dimension of 0 means 256 — not reachable here, but the
   encoding is why width and height are single bytes. */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  const dir = Buffer.alloc(16 * images.length);
  let offset = header.length + dir.length;

  images.forEach((img, i) => {
    const at = i * 16;
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, at + 0);
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, at + 1);
    dir.writeUInt8(0, at + 2); // palette size, 0 for PNG
    dir.writeUInt8(0, at + 3); // reserved
    dir.writeUInt16LE(1, at + 4); // colour planes
    dir.writeUInt16LE(32, at + 6); // bits per pixel
    dir.writeUInt32LE(img.data.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += img.data.length;
  });

  return Buffer.concat([header, dir, ...images.map((i) => i.data)]);
}

const fingerprint = crypto
  .createHash('sha256')
  .update(fs.readFileSync(SVG))
  .update(JSON.stringify(JOBS))
  .digest('hex')
  .slice(0, 16);

const stampPath = path.join(REPO, 'icons.json');
const stamp = fs.existsSync(stampPath) ? JSON.parse(fs.readFileSync(stampPath, 'utf8')) : {};
const wanted = [...JOBS.map((j) => j.file), 'favicon.ico'];
const missing = wanted.filter((f) => !fs.existsSync(path.join(REPO, f)));
const current = stamp.fingerprint === fingerprint && !missing.length;

if (checkOnly) {
  if (!current) {
    console.error('  STALE or MISSING: ' + (missing.join(', ') || 'favicon.svg changed'));
    console.error('  The icons no longer match favicon.svg. Run without --check.');
    process.exit(1);
  }
  console.log('  ' + wanted.length + ' icons, all current.');
  process.exit(0);
}

if (current) {
  console.log('  ' + wanted.length + ' icons, all current.');
  process.exit(0);
}

const site = await serve({ port: 8791 });
const browser = await launch();
const rendered = new Map();

try {
  const tmp = path.join(REPO, '.icon-card.html');
  for (const job of JOBS) {
    fs.writeFileSync(tmp, cardFor(job.size, job.scale, job.bleed));
    await browser.emulateScreen(job.size, job.size, 1);
    /* Chrome paints an opaque white base layer under every page, so without
       this the tab icon's rounded corners come out as white square ones —
       invisible on a light tab strip, a white box on a dark one. The two
       full-bleed surfaces stay opaque on purpose: iOS no longer puts a
       background behind a transparent home-screen icon, and a maskable icon
       with transparent edges shows the launcher through its own crop. */
    await browser.setTransparentBackground(!job.bleed);
    await browser.open(site.origin + '/.icon-card.html');
    const png = await browser.screenshot();
    fs.writeFileSync(path.join(REPO, job.file), png);
    rendered.set(job.size, png);
    console.log('  ' + job.file.padEnd(28) + job.size + 'x' + job.size + '  ' + png.length + ' B');
  }
  fs.unlinkSync(tmp);

  const ico = buildIco(ICO_SIZES.map((size) => ({ size, data: rendered.get(size) })));
  fs.writeFileSync(path.join(REPO, 'favicon.ico'), ico);
  console.log('  favicon.ico'.padEnd(30) + ICO_SIZES.join('/') + '      ' + ico.length + ' B');
} finally {
  await browser.close();
  await site.close();
}

fs.writeFileSync(stampPath, JSON.stringify({ fingerprint }, null, 2) + '\n');
console.log('\n  ' + wanted.length + ' icons rebuilt from favicon.svg');
