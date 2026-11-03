# 0001 — Custom RSS feed source and host restrictions

## Status

Accepted

## Context

Users want to load arbitrary RSS feeds into the PoliceTicker feed selector,
alongside the preset German police feeds. The server already exposes
`/api/custom-rss`, which fetches and parses whatever URL it is handed. Left
unguarded, that endpoint lets the server be used as a proxy against internal
targets: non-HTTP schemes such as `file://` can point at local files, and
hostnames that resolve to private, loopback, or link-local addresses can
reach services inside the deployment network (SSRF).

## Decision

- Custom feeds ride the existing `/api/custom-rss` endpoint. No new endpoint
  is introduced, `readRssFeed()` and the response shape are unchanged, and the
  preset feeds keep flowing through the same path as before.
- `/api/custom-rss` accepts only `http`/`https` URLs, and it accepts a URL
  only when its hostname resolves and none of the resolved addresses is in a
  private (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fc00::/7), loopback
  (127.0.0.0/8, ::1), or link-local (169.254.0.0/16, fe80::/10) range.
  Rejected requests get a 400 response with a JSON `error` body, and
  `readRssFeed()` is never called for them. DNS resolution is injected into
  the guard, so tests can stub it without live network calls.

## Consequences

- The feed selector accepts any pasted `http`/`https` feed URL; invalid
  schemes and internal hosts are rejected by the server with a 400 whose
  message surfaces through the existing client error banner.
- The `file://` and fetch-internal-host vectors for this endpoint are closed;
  hosts are checked at request time over every resolved address, so literal
  IPs and IPv4-mapped IPv6 forms are covered too.
- A hostname whose DNS changes between validation and fetch is out of scope;
  guarding against that (TOCTOU pinning) would require fetching through the
  resolved addresses themselves.
