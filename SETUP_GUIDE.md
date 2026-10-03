# First Mile Dashboard — Live Data Setup Guide

This connects the dashboard to your live Google Sheet, using the shared ARRIVE architecture: **Google Sheets → Apps Script → JSON → `arrive-data-service.js` → Dashboard**.

## Files in this delivery

| File | Change per dashboard? | Purpose |
|---|---|---|
| `index.html` | No | The dashboard UI and First-Mile-specific render logic. |
| `config.js` | **Yes — the only file you edit** | Apps Script URL, auto-refresh interval, retry/timeout settings. |
| `arrive-data-service.js` | No — reused as-is | Generic fetch/retry/timeout/auto-refresh layer. No knowledge of First Mile at all. |
| `Code.gs` | Yes, per sheet | Goes inside the Google Sheet's Apps Script editor (not opened in a browser). |

Keep `index.html` and every `.js`/`.css` file in the **same folder** — the HTML loads them all as `<script src="...">` (see the full file list below).

### Reusing this for Inventory / Fleet / Control Tower
Copy `arrive-data-service.js` unchanged into the new dashboard's folder. Write a new `Code.gs` for that dashboard's sheet, write a new `config.js` pointing at its own Apps Script URL, and build that dashboard's own HTML/render logic. The loading screen, retry button, error screen, manual refresh, auto-refresh, and background-refresh banner all come for free from `arrive-data-service.js` — no need to rebuild that plumbing per dashboard.

## Step 1 — Put `Code.gs` in your Google Sheet

1. Open the Google Sheet that will replace `First_Mile_tracking_sheet_.xlsx` (same 4 tabs: `Pickup Request`, `Customer Data`, `Courier Data Info`, `Courier Salary`).
2. Menu: **Extensions → Apps Script**.
3. Delete any placeholder code in `Code.gs`, paste in the full contents of the `Code.gs` file provided.
4. Only touch the `CONFIG` block at the top if your tab names differ from the ones listed (matching is prefix-based and case-insensitive, so `"Pickup Request "` with a trailing space still matches `pickup: 'Pickup Request'`).
5. Save (Ctrl+S / Cmd+S).

## Step 2 — Deploy as a Web App

1. Top-right **Deploy → New deployment**.
2. Click the gear icon next to "Select type" → **Web app**.
3. Settings:
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**. Google will ask you to authorize the script the first time — approve it (it only reads your own sheet).
5. Copy the **Web app URL** it gives you. It looks like:
   `https://script.google.com/macros/s/AKfycb.../exec`

## Step 3 — Point the dashboard at it

1. Open `config.js` in a text editor (not the HTML file).
2. Replace the placeholder:
   ```js
   window.ARRIVE_CONFIG = {
     APPS_SCRIPT_URL: 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE',
     ...
   };
   ```
   with the URL from Step 2. That is the **only edit needed** — everything else (aggregation, KPIs, charts, tables) reads from this one endpoint automatically.
3. Save, keep `config.js` next to `index.html` and the other project files, and open `index.html` (or host the folder anywhere — Google Drive, an internal server, etc.).

## Loading & refresh behavior

- **First open:** full loading screen, then either the dashboard or a full error screen with a Retry button if the fetch fails.
- **Manual refresh:** the "Refresh" button in the header re-fetches without a full-screen flash — filters you've set stay as they were. If it fails, a small dismissible banner appears at the top ("Couldn't refresh — showing last loaded data") while the dashboard keeps showing the last good data; the banner has its own Retry button.
- **Auto-refresh:** runs every `AUTO_REFRESH_MINUTES` (default 5, set in `config.js`; `0` disables it) using the exact same background-refresh path as the manual button — same banner-on-failure behavior, same filter preservation.
- **Synced label:** the header shows "Synced just now / N min ago" so it's obvious how fresh the data on screen is.

The Apps Script itself also caches its response for 5 minutes by default (`CONFIG.CACHE_SECONDS` in `Code.gs`) to keep repeated requests fast; add `?refresh=1` to the Apps Script URL to force a fresh sheet read if you need to bypass that cache.

## If the dashboard shows a "couldn't load data" error

- Double check the URL ends in `/exec`, not `/dev`.
- Make sure the deployment's "Who has access" is set to **Anyone** (not "Anyone with Google account" — that requires sign-in and will block the fetch).
- If you redeploy, Apps Script sometimes issues a **new** URL — update `CONFIG.APPS_SCRIPT_URL` again after any redeploy (or use "Manage deployments → Edit → same deployment" to keep the URL stable).
- Open the Apps Script URL directly in a browser tab — if it downloads/shows raw JSON, the backend is fine and the issue is on the dashboard/CORS side; if it shows an error page, the issue is in `Code.gs` (check sheet/column names against `CONFIG.SHEET_NAMES`).

## Phase 6A — `pickupDays` (backend addition, no UI change yet)

The current `Code.gs` also returns a second, independent dataset called
`pickupDays` alongside the existing `rows` — one entry per individual
Pickup-type request with a valid date (not aggregated by month like
`rows`). It exists to support a future "Pickup Days per client" report
and analytics; it does **not** power any visible chart, table, or KPI in
this version of the dashboard yet, and it does not change how `rows`,
the filters, the tables, or the charts behave.

- The frontend reads it safely: if you're still running an older
  deployment of `Code.gs` that doesn't send `pickupDays`, the dashboard
  defaults it to an empty list and works exactly as before — nothing
  breaks.
- For QA/debugging, once the dashboard is loaded you can open the
  browser's Developer Console and run:
  ```js
  window.__pickupDaysMeasure.byClientForCurrentFilters()
  ```
  to see the distinct pickup-day count per client (by client index) for
  whatever filters are currently applied. This is a debugging aid only —
  there is no dashboard UI for it in this package.

## Known scope limits (carried over from the Excel-based build)

- `Courier Salary` data only covers a partial roster (shown as reference only, excluded from KPIs).
- `Hiring Date` in `Courier Data Info` has too little coverage to support a reliable tenure KPI, so it isn't used.
- Chart bar/line geometry stays left-to-right internally even in Arabic mode — this is standard practice for numeric charts and keeps trend lines legible in both languages. All text, tables, and layout fully mirror to RTL.
