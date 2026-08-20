# Emerald City Reader

Learn English with Seattle news. Live at **https://zhen-miao.github.io/emerald-reader/**

On iPhone: open that link in Safari → **Share → Add to Home Screen** for an app-like icon.

## Fresh articles every morning, automatically

A GitHub Action runs **every day at 9 AM Seattle time**, pulls all 16 news feeds, and
commits the results to `feed.json`. The app loads that file when you open it, so the
news is already there — no need to press **⟳ Refresh**.

- **The schedule:** [`.github/workflows/daily-feed.yml`](.github/workflows/daily-feed.yml).
  GitHub's cron only speaks UTC, so it fires at 16:00 and 17:00 UTC and a guard step runs
  whichever one is 9 AM in Seattle that day (this handles daylight saving automatically).
- **The fetcher:** [`tools/build-feed.js`](tools/build-feed.js) — plain Node, no dependencies.
  It reads the source list straight out of `index.html`, so adding a news source there is
  enough; the daily build picks it up.
- **Run it right now:** repo → **Actions** tab → *Daily feed* → **Run workflow**.
- **Change the time:** edit the two `cron:` lines and the `-ge 9` hour check in the workflow.

The ⟳ **Refresh** button still works and fetches live in your browser — useful for checking
for news later in the day. Anything it finds is merged with the daily batch.

### Two things worth knowing

- GitHub's scheduled jobs are **best-effort**: a run can be queued 5–20 minutes late during
  busy periods. The guard tolerates that — it builds any time from 9 AM onward if the day's
  feed isn't built yet.
- GitHub **pauses cron jobs in repos with 60 days of no activity**, and the bot's own daily
  commits may not reset that timer. If the news ever goes stale, open the Actions tab and
  press **Run workflow** to wake it back up.

## Your data

**Progress does not sync between devices.** Saved words and reading history live in each
browser's local storage. To move them: tap **⬇ export** on one device, **⬆ import** on the other.

The repo is public (required for free GitHub Pages), so the app file and the fetched
headlines are visible to anyone — but your reading progress and saved words are never in
the repo.

## Updating the app

Replace `index.html` and commit; the site rebuilds in about a minute. Article content
belongs to the publishers — the app shows a headline plus an excerpt (or the full text where
the publisher's own feed provides it) and always links back to the original.
