# CHANGELOG — ARRIVE First Mile Dashboard FINAL Package

Base used to build this package (see note at top of file): the previously delivered **First-Mile-Phase5.zip** (Phase 4 print/export + Phase 5 executive-report polish) for the frontend, plus the just-verified **ARRIVE_First_Mile_Code_Phase6A.gs** for the backend. No newer frontend/backend files were attached with the request that produced this package — see the note under "Known limitations / manual verification needed" below.

## Files modified

| File | What changed | Why |
|---|---|---|
| `aggregations.js` | Added `pickupDays` param (defaults to `[]` if absent/not an array) to `createAggregations()`; added two new exported functions, `filteredPickupDays()` and `computePickupDaysByClient()`. Existing `filteredRows()` and `aggregate()` are byte-for-byte unchanged. | Phase 6A: expose the new backend dataset to the frontend, safely, without touching existing logic. |
| `dashboard.js` | `initDashboard(DATA)` destructuring now includes `pickupDays = []` (default-safe). `createAggregations(...)` call now passes `pickupDays` through. Added a `window.__pickupDaysMeasure` debug hook (3 lines) exposing the new helpers to the browser console. No UI, chart, table, or KPI rendering code was touched. | Same as above — wiring only, no visible UI change. |
| `Code.gs` | Replaced with the verified Phase 6A backend (the one delivered and regression-tested earlier in this conversation): adds the independent `pickupDays` dataset to `readPickupRequest()`/`buildPayload()`. `rows` grouping/encoding is untouched — verified byte-identical against the pre-Phase-6A baseline via an automated Node.js regression test. | Bring the backend up to Phase 6A. |
| `SETUP_GUIDE.md` | Fixed a **pre-existing stale reference**: three places referred to a file named `First_Mile_Dashboard.html`, which does not exist in this project (the real file is `index.html`). Corrected to `index.html`. Added a new "Phase 6A — pickupDays" section explaining the new field and the debug hook. | Genuine bug found during file-reference audit (see Section 5 of the request) — fixed with the smallest possible change, not silently carried forward. |
| `README.md` | Rewrote the file list to match what's actually in the package (was a generic/outdated list), added a `pickupDays` note, bumped version label to v2.2 (Phase 6A — FINAL). | Accuracy — the old file list didn't match the real project files. |

## Files created

| File | Purpose |
|---|---|
| `OPERATING_GUIDE_AR.md` | Arabic step-by-step operating guide (unzip → open → configure API URL → run → verify → dev tools → troubleshoot → redeploy), as requested. |
| `CHANGELOG_FINAL.md` | This file. |

## Files NOT modified (protected, verified untouched)

`arrive-data-service.js`, `i18n.js`, `formatters.js`, `tables.js`, `charts.js`, `filters.js`, `filter-ui.js`, `comparison.js`, `reportData.js`, `reportPreview.js`, `reportPdf.js`, `config.js`, `logo.png`.

## pickupDays — summary of the change

- `pickupDays` is additive only. `rows`, its grouping/encoding, and every dictionary (`months/cities/areas/drivers/clients/types/statuses/reasons`) are unchanged — confirmed via an automated regression test that runs the real, unmodified backend code twice (pre-Phase-6A baseline vs. Phase 6A) against identical mock sheet data and diffs every field. All pre-existing fields came back byte-identical.
- The frontend does **not** assume `pickupDays` exists. `dashboard.js` defaults it to `[]`, and `aggregations.js` guards with `Array.isArray(...)`. An older/cached API response with no `pickupDays` field, or a malformed one, cannot break dashboard load — verified with dedicated tests (see `TEST_REPORT.md`).
- No dashboard UI, chart, table, filter, KPI, or report currently reads or displays `pickupDays`. It is available via `window.__pickupDaysMeasure` in the browser console only, for future use.

## Changes in how data loads

None. `arrive-data-service.js` (the fetch/retry/timeout/auto-refresh layer) was not touched. The API URL is still configured in exactly one place, `config.js`.

## Risks / points that still need manual verification

1. **This package was assembled from the last verified files in this conversation, not from a fresh attachment.** The request said files would be attached; none arrived except the instructions themselves. If you have newer manual edits to the frontend or a different `Code.gs` than the Phase 6A version delivered earlier today, this package does **not** include them — please tell me and I'll rebuild against the correct source.
2. **Live Google Apps Script deployment.** As with every prior phase, I have no access to your actual Google account, Sheet, or Apps Script project. Pasting `Code.gs` and deploying it is a manual step you must do yourself (see `OPERATING_GUIDE_AR.md` §12), and only your live deployment can confirm `pickupDays` is actually served.
3. **Browser testing was real but sandboxed.** I loaded the actual `index.html` in a real headless Chromium browser (not a simulation) with a mocked API response and confirmed zero JavaScript errors/exceptions in both a "with pickupDays" and a "without pickupDays" scenario. I did **not** test against your real Google Sheet data, your real network environment, or in a non-Chromium browser — see `TEST_REPORT.md` for exact scope.
