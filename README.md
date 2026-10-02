# Launcher news

Edit `news.json` on this branch to publish player-facing updates. Add an entry with
`date` (ISO 8601 including timezone), `title`, and plain-text `body`. Newest dates
appear first. Use `\n` for paragraphs. Keep this file valid JSON.

Publish only reviewed, public information. Do not copy private logs, player IDs,
addresses, credentials, internal diagnostics, or unverified claims into this feed.
This branch is the curated feed, not an automatic dump of commit messages.

Servers opt in with:

```
CONTENT_NEWS_URL=https://raw.githubusercontent.com/mixutin/dauntless-revived/launcher-news/news.json
```

The server checks GitHub at most once per minute while news is being requested.
Updated launchers refresh once per minute while connected. Older launchers load
news when opened or reconnected. GitHub caching can add a delay. If GitHub fails
or the document is invalid, the last valid news stays visible.
