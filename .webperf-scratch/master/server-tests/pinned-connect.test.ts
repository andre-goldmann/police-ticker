/**
 * Witness test for DNS-rebinding pinning: when a resolved-address list is
 * passed to `OpenRouterClient.readRssFeed`, the TCP connection must use only
 * those addresses while the original hostname stays in the Host header. The
 * feed URL uses a hostname under the reserved `.invalid` TLD (RFC 6761) that
 * cannot resolve publicly, so this test fails if the pinning is removed and
 * a second DNS resolution is used instead. Runs against a loopback HTTP
 * server, so no live network call is made.
 */
import assert from 'node:assert/strict';
import * as http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { OpenRouterClient } from '../src/openrouter-client';

const RSS_BODY =
  '<?xml version="1.0"?><rss><channel><item>' +
  '<title>Pinned Witness</title><link>http://pinned-witness.invalid/a</link>' +
  '<pubDate>Thu, 01 Jan 2026 00:00:00 GMT</pubDate>' +
  '<description>served via pinned lookup</description>' +
  '</item></channel></rss>';

describe('readRssFeed pinned connect', () => {
  let server: http.Server;
  let port: number;
  const seenRequests: Array<{ url: string | undefined; host: string | undefined }> = [];

  before(async () => {
    server = http.createServer((request, response) => {
      seenRequests.push({ url: request.url, host: request.headers.host });
      response.writeHead(200, { 'Content-Type': 'application/xml' });
      response.end(RSS_BODY);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Could not determine test server port');
    }
    port = address.port;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('connects to the pinned address while keeping the original Host header', async () => {
    seenRequests.length = 0;
    const client = new OpenRouterClient();

    // The hostname never resolves publicly, so the request can only succeed
    // if the TCP connection uses the pinned 127.0.0.1 address.
    const items = await client.readRssFeed(`http://pinned-witness.invalid:${port}/feed.xml`, [
      { address: '127.0.0.1', family: 4 },
    ]);

    assert.equal(items.length, 1);
    assert.equal(items[0]!.title, 'Pinned Witness');
    assert.deepEqual(
      seenRequests,
      [{ url: '/feed.xml', host: `pinned-witness.invalid:${port}` }],
      'the loopback server must receive the request with the original Host header',
    );
  });
});
