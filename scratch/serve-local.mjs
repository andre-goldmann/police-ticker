/**
 * Local dev-only host for the built Angular SSR app (scratch/, not on the branch).
 * Wraps the exported request handler in a plain Node HTTP server and falls back
 * to static files from dist/police-ticker/browser.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { netlifyAppEngineHandler } from '../dist/police-ticker/server/server.mjs';

const port = Number(process.env.PORT || 4310);
const browserDir = new URL('../dist/police-ticker/browser/', import.meta.url).pathname;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const body =
      req.method === 'GET' || req.method === 'HEAD'
        ? undefined
        : Buffer.from(await new Response(req).arrayBuffer());
    const resp = await netlifyAppEngineHandler(
      new Request(url.href, {
        method: req.method,
        headers: req.headers,
        body,
        // @ts-expect-error duplex is valid for Node's undici Request
        duplex: 'half',
      }),
    );
    if (resp.status === 404 || resp.status === 501) {
      const clean = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
      const file = join(browserDir, clean === '' || clean === '.' ? 'index.csr.html' : clean);
      try {
        const data = await readFile(file);
        res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
        res.end(data);
        return;
      } catch {
        /* fall through to handler response */
      }
    }
    const headers = {};
    resp.headers.forEach((v, k) => {
      if (k !== 'content-encoding' && k !== 'transfer-encoding') headers[k] = v;
    });
    res.writeHead(resp.status, headers);
    res.end(Buffer.from(await resp.arrayBuffer()));
  } catch (e) {
    console.error('request failed:', e && e.message ? e.message : e);
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('internal error');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`job page listening on http://127.0.0.1:${port}`);
});
