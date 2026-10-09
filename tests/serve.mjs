// dist/ を静的配信するだけの簡易サーバー (検証用)。
// BASE_PATH 配下にのみ配置する。GitHub Pages / IIS 仮想ディレクトリと同様、
// ルート絶対パスで参照している資材があればここで 404 になる。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', process.env.DIST_DIR || 'dist');
const base = process.env.BASE_PATH || '/drawio-poc/';
const port = Number(process.env.PORT || 4173);

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.xml': 'application/xml',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.ttf': 'font/ttf',
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (!pathname.startsWith(base)) { res.writeHead(404).end('outside base path'); return; }
  let file = path.join(root, pathname.slice(base.length));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} at http://127.0.0.1:${port}${base}`));
