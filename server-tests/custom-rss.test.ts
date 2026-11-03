/**
 * Handler-level tests for the /api/custom-rss endpoint (stories 7 and 8 of the
 * custom RSS feed spec).
 *
 * DNS resolution and `OpenRouterClient.readRssFeed` are stubbed, so no live
 * network call is ever made.
 */
import './setup-ssr-manifest';

import assert from 'node:assert/strict';
import * as dns from 'node:dns';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { netlifyAppEngineHandler } from '../src/server';
import { OpenRouterClient } from '../src/openrouter-client';

type TestLookup = (
  hostname: string,
  options: { all: true },
) => Promise<Array<{ address: string; family: number }>>;

const originalLookup = dns.promises.lookup;
const originalReadRssFeed = OpenRouterClient.prototype.readRssFeed;

let readRssFeedCalls: string[];

const rssItems = [
  {
    title: 'Press release',
    link: 'https://example.com/1',
    pubDate: 'today',
    description: 'A stubbed RSS item',
  },
];

/** Replace DNS resolution for the duration of one handler call. */
function stubLookup(lookup: TestLookup) {
  (dns.promises as unknown as { lookup: TestLookup }).lookup = lookup;
}

function resolvesTo(addresses: Array<{ address: string; family: number }>): TestLookup {
  return async () => addresses.map((entry) => ({ ...entry }));
}

function resolvesToNothing(): TestLookup {
  return async () => [];
}

/** Call the real /api/custom-rss handler with the given feed URL. */
async function callHandler(feedUrl: string): Promise<Response> {
  return netlifyAppEngineHandler(
    new Request(`http://localhost/api/custom-rss?url=${encodeURIComponent(feedUrl)}`, {
      method: 'GET',
    }),
  );
}

beforeEach(() => {
  readRssFeedCalls = [];
  OpenRouterClient.prototype.readRssFeed = async (url: string) => {
    readRssFeedCalls.push(url);
    return rssItems;
  };
});

afterEach(() => {
  stubLookup(originalLookup);
  OpenRouterClient.prototype.readRssFeed = originalReadRssFeed;
});

describe('/api/custom-rss', () => {
  describe('non-http(s) schemes (story 7)', () => {
    it('responds 400 with an error body and does not call readRssFeed for file:// URLs', async () => {
      const response = await callHandler('file:///etc/hosts');

      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(typeof body.error, 'string');
      assert.equal(readRssFeedCalls.length, 0);
    });

    it('responds 400 and does not call readRssFeed for ftp:// URLs', async () => {
      const response = await callHandler('ftp://example.com/feed.xml');

      assert.equal(response.status, 400);
      assert.equal(readRssFeedCalls.length, 0);
    });

    it('responds 200 and calls readRssFeed with the requested http(s) URL', async () => {
      stubLookup(resolvesTo([{ address: '153.92.100.206', family: 4 }]));
      const target = 'https://www.polizei.sachsen.de/de/presse_rss_pdl.xml';

      const response = await callHandler(target);

      assert.equal(response.status, 200);
      assert.deepEqual(readRssFeedCalls, [target]);
      assert.deepEqual(await response.json(), rssItems);
    });
  });

  describe('private, loopback, and link-local targets (story 8)', () => {
    it('responds 400 and does not call readRssFeed when the host resolves only to a loopback address', async () => {
      const cases: Array<[string, Array<{ address: string; family: number }>]> = [
        ['http://127.0.0.1/feed.xml', [{ address: '127.0.0.1', family: 4 }]],
        ['http://[::1]/feed.xml', [{ address: '::1', family: 6 }]],
      ];

      for (const [feedUrl, addresses] of cases) {
        stubLookup(resolvesTo(addresses));
        const response = await callHandler(feedUrl);

        assert.equal(response.status, 400, `${feedUrl} should be rejected`);
        const body = await response.json();
        assert.equal(typeof body.error, 'string');
      }
      assert.equal(readRssFeedCalls.length, 0);
    });

    it('responds 400 and does not call readRssFeed when the host resolves only to a private address', async () => {
      const cases: Array<[string, Array<{ address: string; family: number }>]> = [
        ['http://intranet.example.com/feed.xml', [{ address: '10.1.2.3', family: 4 }]],
        ['http://gateway.example.com/feed.xml', [{ address: '172.16.0.9', family: 4 }]],
        ['http://printer.example.com/feed.xml', [{ address: '192.168.1.10', family: 4 }]],
        ['http://nas.example.com/feed.xml', [{ address: 'fd12::1', family: 6 }]],
      ];

      for (const [feedUrl, addresses] of cases) {
        stubLookup(resolvesTo(addresses));
        const response = await callHandler(feedUrl);

        assert.equal(response.status, 400, `${feedUrl} should be rejected`);
      }
      assert.equal(readRssFeedCalls.length, 0);
    });

    it('responds 400 and does not call readRssFeed when the host resolves only to a link-local address', async () => {
      const cases: Array<[string, Array<{ address: string; family: number }>]> = [
        ['http://linklocal.example.com/feed.xml', [{ address: '169.254.3.4', family: 4 }]],
        ['http://v6linklocal.example.com/feed.xml', [{ address: 'fe80::a', family: 6 }]],
      ];

      for (const [feedUrl, addresses] of cases) {
        stubLookup(resolvesTo(addresses));
        const response = await callHandler(feedUrl);

        assert.equal(response.status, 400, `${feedUrl} should be rejected`);
      }
      assert.equal(readRssFeedCalls.length, 0);
    });

    it('responds 400 with an error body and does not call readRssFeed when the hostname does not resolve', async () => {
      stubLookup(resolvesToNothing());

      const response = await callHandler('https://missing.example.com/feed.xml');

      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(typeof body.error, 'string');
      assert.equal(readRssFeedCalls.length, 0);
    });

    it('responds 200 and calls readRssFeed with the original URL string when the host resolves to a public address', async () => {
      stubLookup(resolvesTo([{ address: '153.92.100.206', family: 4 }]));
      const target = 'https://www.polizei.sachsen.de/de/presse_rss_pdl.xml';

      const response = await callHandler(target);

      assert.equal(response.status, 200);
      assert.deepEqual(readRssFeedCalls, [target]);
    });
  });
});
