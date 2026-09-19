/**
 * chrome.mjs — drive headless Chrome over the DevTools Protocol, with no
 * dependencies.
 *
 * Ported from `check-sheets.mjs` in the Stimpunks Knowledge System, which does
 * the same thing to measure whether a broadside lands on the paper. Node 22 has
 * a global WebSocket, so the whole of a browser automation library here is one
 * socket and a map of pending message ids. Puppeteer would be 300 MB of Chromium
 * to launch the Chrome already on the machine.
 *
 * WAIT ON A CONDITION, NOT A CLOCK. Every settle below polls `document.readyState`
 * and then waits for the rendered text length to hold steady across two samples,
 * and for `document.fonts.ready`. A fixed sleep is a race: it is too long on
 * every good run and too short on the one run that matters, and a PDF printed
 * before the webfont arrives is laid out in fallback metrics — which is
 * pagination, not cosmetics. It changes where the page breaks fall.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object} [opts]
 * @param {number} [opts.port]  9414 by default. The Knowledge System's tools use
 *   9411, 9412 and 9413 and are run back to back with these; a shared port lets
 *   one tool attach to a browser another is still shutting down, which it did.
 */
export async function launch({ port = 9414 } = {}) {
  const bin = CANDIDATES.find((p) => fs.existsSync(p));
  if (!bin) {
    throw new Error(
      'No Chrome or Chromium found. Install Google Chrome, or add its path to ' +
        'CANDIDATES in tools/lib/chrome.mjs.'
    );
  }

  const profile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'whysheets-')), 'profile');
  const proc = spawn(
    bin,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      /* Tagged PDF output: the structure a screen reader needs to read a PDF as
         a document rather than a picture of one. These sheets exist for Disabled
         people; an untagged PDF would be an odd thing to hand them. */
      '--export-tagged-pdf',
      '--remote-debugging-port=' + port,
      '--user-data-dir=' + profile,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  let version = null;
  for (let i = 0; i < 80; i++) {
    try {
      version = await (await fetch('http://127.0.0.1:' + port + '/json/version')).json();
      break;
    } catch {
      await sleep(250);
    }
  }
  if (!version) {
    proc.kill();
    throw new Error('Chrome did not open a debugging port on ' + port + ' within 20 seconds.');
  }

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('Could not attach to Chrome.'));
  });

  let msgId = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve) => {
      const id = ++msgId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });

  const { targetId } = (await send('Target.createTarget', { url: 'about:blank' })).result;
  const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: true })).result;
  const S = (method, params) => send(method, params, sessionId);
  await S('Page.enable');
  await S('Runtime.enable');

  return {
    /** Load a local file or URL and wait until it has stopped changing. */
    async open(target) {
      const url = /^https?:|^file:/.test(target) ? target : 'file://' + path.resolve(target);
      await S('Page.navigate', { url });

      let steady = -1;
      for (let i = 0; i < 120; i++) {
        const probe = JSON.parse(
          (
            await S('Runtime.evaluate', {
              expression:
                'JSON.stringify({r:document.readyState,' +
                'n:document.body?document.body.textContent.length:0,' +
                'f:!!(document.fonts&&document.fonts.status==="loaded")})',
              returnByValue: true,
            })
          ).result.result.value
        );
        if (probe.r === 'complete' && probe.f && probe.n === steady && probe.n > 0) return;
        steady = probe.n;
        await sleep(60);
      }
    },

    /** @returns {Buffer} the PDF */
    async pdf(options) {
      const res = await S('Page.printToPDF', {
        printBackground: false,
        preferCSSPageSize: true,
        generateTaggedPDF: true,
        ...options,
      });
      if (!res.result || !res.result.data) {
        throw new Error('printToPDF returned nothing: ' + JSON.stringify(res.error || res));
      }
      return Buffer.from(res.result.data, 'base64');
    },

    /* Measure what the PRINTER will lay out, not what the screen shows. A print
       media query resolves against the page box, so a sheet has to be measured
       at the page's own width with print media emulated — measuring at a desktop
       viewport tests a layout no printer ever produces. */
    async emulatePrint(widthPx, heightPx = 1200) {
      await S('Emulation.setEmulatedMedia', { media: 'print' });
      await S('Emulation.setDeviceMetricsOverride', {
        width: Math.round(widthPx),
        height: Math.round(heightPx),
        deviceScaleFactor: 1,
        mobile: false,
      });
    },

    async evaluate(expression) {
      const res = await S('Runtime.evaluate', { expression, returnByValue: true });
      return res.result.result.value;
    },

    async close() {
      try {
        ws.close();
      } catch {
        /* already gone */
      }
      proc.kill();
    },
  };
}

/** Count physical pages in a PDF buffer: /Type /Page but not /Type /Pages. */
export function countPages(buffer) {
  const text = buffer.toString('latin1');
  return (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
}
