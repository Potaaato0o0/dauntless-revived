# Publishing launcher news

Edit `news.json` on the repository's `launcher-news` branch. Publish reviewed, player-facing text only; omit account identifiers, credentials, infrastructure details and internal logs.

```json
{"items":[{"date":"2026-10-02T20:10:00Z","title":"Server update","body":"Describe the changes players can use."}]}
```

Set `CONTENT_NEWS_URL` in the content server environment to `https://raw.githubusercontent.com/mixutin/dauntless-revived/launcher-news/news.json` and restart the content service once. Later posts require no restart. `CONTENT_NEWS_FILE` remains an optional startup fallback.

The content server checks GitHub at most once per minute, uses conditional requests, and retains the last successful feed if GitHub fails or the document is invalid. Documents are limited to 1 MB and 50 displayed posts. Titles and bodies are plain text. Entries appear newest first by date.

Connected launchers refresh news at most once per minute during status polling. Allow for both refresh intervals and GitHub caching before expecting a new post. Older launchers pick up news when reconnecting.
