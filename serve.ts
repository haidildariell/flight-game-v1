// serve.ts — tiny static server for local playtesting of LANGIT NUSANTARA.
// Serves game/ at http://localhost:8080 (or $PORT). Standard library only.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const gameDir = join(repoRoot, 'game');
const port = Number(process.env.PORT || 8080);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const server = createServer((req, res) => {
  const raw = decodeURIComponent(req.url || '/').split('?')[0];
  const rel = raw === '/' ? 'index.html' : raw.replace(/^\/+/, '');
  const path = normalize(join(gameDir, rel));
  if (!path.startsWith(gameDir) || !existsSync(path) || !statSync(path).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
  res.end(readFileSync(path));
});

server.listen(port, () => {
  console.log('LANGIT NUSANTARA at http://localhost:' + port + '/');
});
