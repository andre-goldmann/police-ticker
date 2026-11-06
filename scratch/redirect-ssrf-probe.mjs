// Local probe: does the real readRssFeed follow redirects past the host guard,
// and does it reflect internal response bodies into the thrown error / items?
// Loopback server A stands in for the attacker's *public* URL (the guard only
// inspects the entry URL string, so A would pass with public DNS); it 302s to
// loopback server B, a target ensurePublicHost would always reject.
import http from 'node:http';
import { OpenRouterClient } from '../node_modules/.server-test-build/src/openrouter-client.js';

const bodies = {
  ok: `<?xml version="1.0"?><rss><channel><item><title>INTERNAL-SECRET-TITLE</title><link>http://internal/1</link><description>internal data</description></item></channel></rss>`,
  err: 'SECRET-INTERNAL-ERROR db_password=hunter2',
};

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function runCase(name, bHandler, bStatus, bBody) {
  const b = await listen(bHandler);
  const portB = b.address().port;
  const a = await listen((req, res) => {
    res.writeHead(302, { Location: `http://127.0.0.1:${portB}/internal` });
    res.end();
  });
  const portA = a.address().port;

  const client = new OpenRouterClient();
  try {
    const items = await client.readRssFeed(`http://127.0.0.1:${portA}/feed.xml`);
    console.log(`[${name}] readRssFeed RETURNED items ->`, JSON.stringify(items).slice(0, 200));
  } catch (e) {
    console.log(`[${name}] readRssFeed THREW ->`, e.message.slice(0, 200));
  } finally {
    a.close();
    b.close();
  }
}

await runCase(
  'A: redirect 302 -> internal 200 XML',
  (req, res) => { res.writeHead(200, { 'content-type': 'application/xml' }); res.end(bodies.ok); },
);
await runCase(
  'A: redirect 302 -> internal 500 text',
  (req, res) => { res.writeHead(500, { 'content-type': 'text/plain' }); res.end(bodies.err); },
);
await runCase(
  'A: no redirect, internal-style direct (control: entry URL itself would be guard-blocked)',
  (req, res) => { res.writeHead(200, { 'content-type': 'application/xml' }); res.end(bodies.ok); },
);
