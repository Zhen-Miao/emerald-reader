# Emerald City Reader — host it free on GitHub Pages (~3 minutes)

This gives you a private-ish URL that works on your iPhone, iPad, and any computer.

## Steps

1. Go to **github.com** and sign in (or create a free account).
2. Click **+** (top right) → **New repository**.
   - Name: `emerald-reader` (anything works)
   - Visibility: **Public** (required for free GitHub Pages)
   - Click **Create repository**.
3. On the new repo page, click **uploading an existing file**, drag in the `index.html` from this folder, and click **Commit changes**.
4. Go to the repo's **Settings** → **Pages** (left sidebar).
5. Under **Build and deployment → Branch**, choose `main` and folder `/ (root)`, then **Save**.
6. Wait ~1 minute, refresh the Pages settings page — your site URL appears, like:
   `https://<your-username>.github.io/emerald-reader/`

Open that URL on your iPhone in Safari, then tap **Share → Add to Home Screen** to get an app-like icon.

## Good to know

- **Your progress does not sync between devices.** The phone version and the desktop file each keep their own saved words and reading history in that browser. To move data: tap the **⬇ export** button on one device, then **⬆ import** the file on the other.
- The repo is public, which means the app file itself is visible to anyone — but your reading progress and saved words are NOT in the repo; they live only in each device's browser.
- To update the app later (when Claude gives you a new version): repo → click `index.html` → pencil icon (or re-upload) → commit. The site updates in about a minute.
