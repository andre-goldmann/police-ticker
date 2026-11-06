/**
 * Unit test for redirect handling in `OpenRouterClient.readRssFeed`, the fetch
 * used by the guarded /api/custom-rss endpoint. The host guard validates only
 * the requested URL, so the fetch must not follow a 3xx that could point at an
 * internal target. Runs against a loopback HTTP server, so no live network
 * call is made.
 */
import assert from 'node:assert/strict';
import * as http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { OpenRouterClient } from '../src/openrouter-client';

const RSS_BODY =
  '<?xml version="1.0"?><rss><channel><item><title>Internal</title></item></channel></rss>';

describe('readRssFeed redirect handling', () => {
  const requestedPaths: string[] = [];
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    server = http.createServer((request, response) => {
      requestedPaths.push(request.url ?? '');
      if (request.url === '/feed.xml') {
        // A public-looking feed URL that redirects to an internal target.
        response.writeHead(302, { Location: '/internal-target.xml' });
        response.end();
      } else {
        response.writeHead(200, { 'Content-Type': 'application/xml' });
        response.end(RSS_BODY);
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Could not determine test server port');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('rejects a redirecting feed URL and never requests the redirect target', async () => {
    const client = new OpenRouterClient();

    await assert.rejects(client.readRssFeed(`${baseUrl}/feed.xml`));

    assert.ok(requestedPaths.includes('/feed.xml'), 'the feed URL itself was requested');
    assert.ok(
      !requestedPaths.includes('/internal-target.xml'),
      'the redirect target must not be requested',
    );
  });
});
