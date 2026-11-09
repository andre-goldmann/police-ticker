# CONTEXT

Glossary for the PoliceTicker feed selector.

## Preset feed

A feed served by `/api/german-police-feeds` or the built-in default
"Polizei Sachsen" feed. Preset feeds make up the feed selector dropdown and
are loaded through `/api/custom-rss` like any other feed.

## Custom feed

A user-pasted RSS feed URL, loaded through `/api/custom-rss`. A custom feed is
not part of `policeFeeds` (it never appears in the dropdown and is not
persisted); it is ephemeral to the current browser session and only
`http`/`https` URLs whose host is not private, loopback, or link-local are
accepted.

## Currently loaded feed

The feed whose items are actually displayed — preset or custom, tracked by
the component from URL and kind when a load succeeds. The Refresh button
always reloads the currently loaded feed, ignoring any unsubmitted edits to
the dropdown or the custom URL field; only "Load Selected Feed" applies
those inputs.
