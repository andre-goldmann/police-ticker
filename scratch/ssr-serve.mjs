// Dev-only review harness: serves the built SSR handler from dist on a local
// port. Not part of the app; lives in scratch/ and is never committed.
import { createServer } from 'node:http';
import { netlifyAppEngineHandler } from '../dist/police-ticker/server/server.mjs';

const PORT = Number(process.env.PORT || 4300);

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(', '));
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
  const request = new Request(url, {
    method: req.method,
    headers,
    body: body && req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
  });
  try {
    const response = await netlifyAppEngineHandler(request);
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    res.writeHead(response.status, responseHeaders);
    if (req.method === 'HEAD') res.end();
    else res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(`review harness error: ${error instanceof Error ? error.message : String(error)}`);
  }
});

server.listen(PORT, () => console.log(`review harness listening on http://localhost:${PORT}`));
