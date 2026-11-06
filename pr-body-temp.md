## Summary

This branch implements [Spec #1](https://github.com/andre-goldmann/police-ticker/issues/1): paste an arbitrary `http`/`https` RSS URL in the PoliceTicker feed selector, load via `/api/custom-rss` alongside presets, client validation, server scheme + host guard (private/loopback/link-local/unspecified, IPv4-mapped/compatible IPv6), redirects rejected in `readRssFeed`, `CONTEXT.md` + ADR 0001.

**Latest:** Close the DNS rebinding gap: after `ensurePublicHost` resolves and accepts addresses, `/api/custom-rss` passes them into `readRssFeed`, which uses Undici with a **pinned connector** (`buildConnector` + `lookup` returning only those addresses, `servername` for TLS SNI) so the outbound TCP connect does not perform a second uncontrolled DNS resolution for that hostname. Removed the accidental `scratch/` tree (including nested `proof/` assets). Added direct `undici` dependency. Server tests assert `readRssFeed` receives the original URL plus the pinned `addresses` on success.

**Validation:** `npm run test:server` → 11 tests pass.

Closes #1

---

SUMMARY

Custom RSS URLs flow through `/api/custom-rss` with scheme validation, host resolution checks against restricted ranges (including IPv4-mapped IPv6 and unspecified `0.0.0.0/8` / `::`), pinned Undici fetch so TCP connect targets only guard-approved addresses (mitigates DNS rebinding between validation and fetch), client UI for pasted URLs with 100-item cap and preset flow preserved. Scratch/proof artifacts removed from the branch; ADR 0001 updated.

STORY 1 — Paste and load a custom feed URL (precedence over preset; submit works without preset)

EVIDENCE: `src/app/rss-feed.component.ts` (`fetchFeed`, `canSubmitFeed`, synthesized feed); `src/app/rss-feed.component.html` (custom input). Karma: `src/app/rss-feed.component.spec.ts` — custom URL encoded to `/api/custom-rss`, submit without preset, preference over preset. Use `CHROME_BIN=/home/soulsaver/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome` for `ng test` if needed.

STORY 2 — Invalid URL: client-only “Enter a valid http(s) URL”, no request

EVIDENCE: Client validation + inline message in component; Karma asserts no `HttpClient` request for invalid schemes/parsing.

STORY 3 — Custom feed header: hostname + “Custom feed”

EVIDENCE: Synthesized `PoliceFeed` in `fetchFeed`; template feed info; Karma asserts hostname and description.

STORY 4 — AI flows unchanged for loaded items

EVIDENCE: Same `/api/openrouter-chat` and `/api/analyze-rss-feed` usage from items; Karma expects payloads from item title/description.

STORY 5 — Cap rendered list at 100 items client-side

EVIDENCE: `MAX_CUSTOM_FEED_ITEMS` + slice; Karma 100 vs fewer items.

STORY 6 — Ephemeral: `policeFeeds` unchanged, no persistence

EVIDENCE: No mutation of preset list; Karma localStorage spy + dropdown options unchanged.

STORY 7 — Server rejects non-http(s) before fetch

EVIDENCE: `validateCustomRssUrl` in `src/custom-rss-url-guard.ts`; `src/server.ts` 400; `server-tests/custom-rss.test.ts` `file://` / `ftp://` / success `https`.

STORY 8 — Server rejects private, loopback, link-local, unspecified, IPv4-mapped/compatible; no `readRssFeed` on 400; pinned connect (DNS rebinding mitigation)

EVIDENCE: `ensurePublicHost` returns `addresses` when ok; `src/server.ts` `openrouter.readRssFeed(urlParam, hostCheck.addresses)`; `src/openrouter-client.ts` `readRssFeed` uses `buildConnector` pin + `UndiciClient` + `undiciFetch` with `redirect: 'error'`. `server-tests/custom-rss.test.ts` covers reject cases and asserts success calls include `{ url, addresses }`. Run: `npm run test:server` → 11 passed.

STORY 9 — Preset paths frozen

EVIDENCE: Changes focus on custom-rss stack, docs, and tests; `/api/german-police-feeds` and preset list behavior unchanged.

STORY 10 — CONTEXT.md glossary + ADR

EVIDENCE: `CONTEXT.md`; `docs/adr/0001-custom-rss-feed-source-and-host-restrictions.md` (ranges, redirects, pinned fetch).

