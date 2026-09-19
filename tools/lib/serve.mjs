/**
 * serve.mjs — a static file server for the repository, for local preview and
 * for the PDF build.
 *
 * WHY THE PDF BUILD NEEDS ONE AT ALL. Every page here links its stylesheet,
 * scripts and fonts by root-absolute path — `/assets/press.css` — which is
 * correct for a site served from a domain root and meaningless over `file://`,
 * where it resolves against the filesystem root instead. Printing a page from
 * disk therefore produced an unstyled document: no print stylesheet, so the
 * navigation printed, the page size fell back to US Letter, and the PDF was the
 * wrong shape in a way that looked like a Chrome flag problem. It was a URL
 * problem. Serving the repository over HTTP makes the printed document the same
 * document a reader gets.
 *
 * Deliberately small and deliberately local: it binds 127.0.0.1, serves only
 * files under the repository, and refuses any path that escapes it.
 *
 *     node tools/lib/serve.mjs          # preview at http://127.0.0.1:8788
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

export function serve({ port = 8788, root = REPO } = {}) {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (rel.endsWith('/')) rel += 'index.html';

    const abs = path.join(root, rel);
    /* Never serve outside the repository, whatever a path traversal asks for. */
    if (!abs.startsWith(root + path.sep)) {
      res.writeHead(403).end('outside the repository');
      return;
    }
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found: ' + rel);
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(abs)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    fs.createReadStream(abs).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () =>
      resolve({
        origin: 'http://127.0.0.1:' + port,
        close: () => new Promise((done) => server.close(done)),
      })
    );
  });
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const { origin } = await serve();
  console.log('  serving ' + REPO);
  console.log('  ' + origin);
}
