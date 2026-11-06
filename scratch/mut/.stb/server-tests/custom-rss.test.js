"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
/**
 * Handler-level tests for the /api/custom-rss endpoint (stories 7 and 8 of the
 * custom RSS feed spec).
 *
 * DNS resolution and `OpenRouterClient.readRssFeed` are stubbed, so no live
 * network call is ever made.
 */
require("./setup-ssr-manifest");
const strict_1 = tslib_1.__importDefault(require("node:assert/strict"));
const dns = tslib_1.__importStar(require("node:dns"));
const node_test_1 = require("node:test");
const server_1 = require("../src/server");
const openrouter_client_1 = require("../src/openrouter-client");
const originalLookup = dns.promises.lookup;
const originalReadRssFeed = openrouter_client_1.OpenRouterClient.prototype.readRssFeed;
let readRssFeedCalls;
const rssItems = [
    {
        title: 'Press release',
        link: 'https://example.com/1',
        pubDate: 'today',
        description: 'A stubbed RSS item',
    },
];
/** Replace DNS resolution for the duration of one handler call. */
function stubLookup(lookup) {
    dns.promises.lookup = lookup;
}
function resolvesTo(addresses) {
    return async () => addresses.map((entry) => ({ ...entry }));
}
function resolvesToNothing() {
    return async () => [];
}
/** Call the real /api/custom-rss handler with the given feed URL. */
async function callHandler(feedUrl) {
    return (0, server_1.netlifyAppEngineHandler)(new Request(`http://localhost/api/custom-rss?url=${encodeURIComponent(feedUrl)}`, {
        method: 'GET',
    }));
}
(0, node_test_1.beforeEach)(() => {
    readRssFeedCalls = [];
    openrouter_client_1.OpenRouterClient.prototype.readRssFeed = async (url) => {
        readRssFeedCalls.push(url);
        return rssItems;
    };
});
(0, node_test_1.afterEach)(() => {
    stubLookup(originalLookup);
    openrouter_client_1.OpenRouterClient.prototype.readRssFeed = originalReadRssFeed;
});
(0, node_test_1.describe)('/api/custom-rss', () => {
    (0, node_test_1.describe)('non-http(s) schemes (story 7)', () => {
        (0, node_test_1.it)('responds 400 with an error body and does not call readRssFeed for file:// URLs', async () => {
            const response = await callHandler('file:///etc/hosts');
            strict_1.default.equal(response.status, 400);
            const body = await response.json();
            strict_1.default.equal(typeof body.error, 'string');
            strict_1.default.equal(readRssFeedCalls.length, 0);
        });
        (0, node_test_1.it)('responds 400 and does not call readRssFeed for ftp:// URLs', async () => {
            const response = await callHandler('ftp://example.com/feed.xml');
            strict_1.default.equal(response.status, 400);
            strict_1.default.equal(readRssFeedCalls.length, 0);
        });
        (0, node_test_1.it)('responds 200 and calls readRssFeed with the requested http(s) URL', async () => {
            stubLookup(resolvesTo([{ address: '153.92.100.206', family: 4 }]));
            const target = 'https://www.polizei.sachsen.de/de/presse_rss_pdl.xml';
            const response = await callHandler(target);
            strict_1.default.equal(response.status, 200);
            strict_1.default.deepEqual(readRssFeedCalls, [target]);
            strict_1.default.deepEqual(await response.json(), rssItems);
        });
    });
    (0, node_test_1.describe)('private, loopback, and link-local targets (story 8)', () => {
        (0, node_test_1.it)('responds 400 and does not call readRssFeed when the host resolves only to a loopback address', async () => {
            const cases = [
                ['http://127.0.0.1/feed.xml', [{ address: '127.0.0.1', family: 4 }]],
                ['http://[::1]/feed.xml', [{ address: '::1', family: 6 }]],
            ];
            for (const [feedUrl, addresses] of cases) {
                stubLookup(resolvesTo(addresses));
                const response = await callHandler(feedUrl);
                strict_1.default.equal(response.status, 400, `${feedUrl} should be rejected`);
                const body = await response.json();
                strict_1.default.equal(typeof body.error, 'string');
            }
            strict_1.default.equal(readRssFeedCalls.length, 0);
        });
        (0, node_test_1.it)('responds 400 and does not call readRssFeed when the host resolves only to a private address', async () => {
            const cases = [
                ['http://intranet.example.com/feed.xml', [{ address: '10.1.2.3', family: 4 }]],
                ['http://gateway.example.com/feed.xml', [{ address: '172.16.0.9', family: 4 }]],
                ['http://printer.example.com/feed.xml', [{ address: '192.168.1.10', family: 4 }]],
                ['http://nas.example.com/feed.xml', [{ address: 'fd12::1', family: 6 }]],
            ];
            for (const [feedUrl, addresses] of cases) {
                stubLookup(resolvesTo(addresses));
                const response = await callHandler(feedUrl);
                strict_1.default.equal(response.status, 400, `${feedUrl} should be rejected`);
            }
            strict_1.default.equal(readRssFeedCalls.length, 0);
        });
        (0, node_test_1.it)('responds 400 and does not call readRssFeed when the host resolves only to a link-local address', async () => {
            const cases = [
                ['http://linklocal.example.com/feed.xml', [{ address: '169.254.3.4', family: 4 }]],
                ['http://v6linklocal.example.com/feed.xml', [{ address: 'fe80::a', family: 6 }]],
            ];
            for (const [feedUrl, addresses] of cases) {
                stubLookup(resolvesTo(addresses));
                const response = await callHandler(feedUrl);
                strict_1.default.equal(response.status, 400, `${feedUrl} should be rejected`);
            }
            strict_1.default.equal(readRssFeedCalls.length, 0);
        });
        (0, node_test_1.it)('responds 400 and does not call readRssFeed when the host resolves to an IPv4-mapped or IPv4-compatible IPv6 address', async () => {
            const cases = [
                ['http://mappedprivate.example.com/feed.xml', [{ address: '::ffff:192.168.0.1', family: 6 }]],
                ['http://mappedloopback.example.com/feed.xml', [{ address: '::ffff:127.0.0.1', family: 6 }]],
                ['http://mappedten.example.com/feed.xml', [{ address: '::ffff:10.0.0.1', family: 6 }]],
                ['http://compatibleloopback.example.com/feed.xml', [{ address: '::127.0.0.1', family: 6 }]],
            ];
            for (const [feedUrl, addresses] of cases) {
                stubLookup(resolvesTo(addresses));
                const response = await callHandler(feedUrl);
                strict_1.default.equal(response.status, 400, `${feedUrl} should be rejected`);
                const body = await response.json();
                strict_1.default.equal(typeof body.error, 'string');
            }
            strict_1.default.equal(readRssFeedCalls.length, 0);
        });
        (0, node_test_1.it)('responds 400 and does not call readRssFeed when the host resolves to an unspecified address', async () => {
            // 0.0.0.0 ("this network") and :: (IPv6 unspecified) reach loopback on
            // Linux, so they are treated like the loopback targets above.
            const cases = [
                ['http://0.0.0.0/feed.xml', [{ address: '0.0.0.0', family: 4 }]],
                ['http://[::]/feed.xml', [{ address: '::', family: 6 }]],
            ];
            for (const [feedUrl, addresses] of cases) {
                stubLookup(resolvesTo(addresses));
                const response = await callHandler(feedUrl);
                strict_1.default.equal(response.status, 400, `${feedUrl} should be rejected`);
                const body = await response.json();
                strict_1.default.equal(typeof body.error, 'string');
            }
            strict_1.default.equal(readRssFeedCalls.length, 0);
        });
        (0, node_test_1.it)('responds 400 with an error body and does not call readRssFeed when the hostname does not resolve', async () => {
            stubLookup(resolvesToNothing());
            const response = await callHandler('https://missing.example.com/feed.xml');
            strict_1.default.equal(response.status, 400);
            const body = await response.json();
            strict_1.default.equal(typeof body.error, 'string');
            strict_1.default.equal(readRssFeedCalls.length, 0);
        });
        (0, node_test_1.it)('responds 200 and calls readRssFeed with the original URL string when the host resolves to a public address', async () => {
            stubLookup(resolvesTo([{ address: '153.92.100.206', family: 4 }]));
            const target = 'https://www.polizei.sachsen.de/de/presse_rss_pdl.xml';
            const response = await callHandler(target);
            strict_1.default.equal(response.status, 200);
            strict_1.default.deepEqual(readRssFeedCalls, [target]);
        });
    });
});
