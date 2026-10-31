// Local demo server. Only explicit public assets and synthetic fixtures are served.
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const ALLOWED = ['web/', 'src/lib/', 'templates/', 'fixtures/klient-demo/', 'fixtures/klient-demo-lejek/', 'fixtures/klient-demo-pii/'];
function allowed(root, filename) {
  const rel = path.relative(root, filename).split(path.sep).join('/');
  return !path.isAbsolute(rel) && !rel.split('/').some(part => part.startsWith('.')) && ALLOWED.some(prefix => rel.startsWith(prefix));
}
export function createPreviewServer(root = ROOT) {
  return createServer(async (req, res) => {
    try {
      let address = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (address === '/') address = '/web/index.html';
      else if (address.endsWith('/')) address += 'index.html';
      const filename = path.resolve(root, '.' + address);
      if (!allowed(root, filename)) { res.writeHead(403).end(); return; }
      const resolved = await realpath(filename);
      if (!allowed(await realpath(root), resolved)) { res.writeHead(403).end(); return; }
      const data = await readFile(resolved);
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.csv': 'text/csv', '.woff2': 'font/woff2' };
      res.writeHead(200, { 'content-type': types[path.extname(resolved)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
      res.end(data);
    } catch { res.writeHead(404).end('Not found'); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2]) || 8770;
  createPreviewServer().listen(port, '127.0.0.1', () => console.log(`Demo: http://127.0.0.1:${port}/web/`));
}
