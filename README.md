# ARRIVE First Mile Dashboard

Executive Dashboard for ARRIVE First Mile Operations.

## Features

- 📊 Executive KPIs
- 📈 Interactive Charts
- 🌐 Live Google Sheets Integration
- 🔄 Google Apps Script API
- 🇪🇬 Arabic (RTL) / 🇺🇸 English (LTR)
- 🔄 Auto Refresh
- 📋 Executive Summary
- 📊 Data Quality Analysis
- 📄 Export Reports

## Architecture

Google Sheets

↓

Google Apps Script

↓

JSON API

↓

ARRIVE First Mile Dashboard

## Project Files

All files sit in one flat folder — `index.html` loads every script below with a relative `<script src="...">` tag, in this order:

- `index.html` — main dashboard page (open this to run the dashboard)
- `config.js` — **the only file you edit**: Google Apps Script URL + refresh settings
- `arrive-data-service.js` — fetch/retry/timeout/auto-refresh layer
- `i18n.js` — Arabic/English translation strings
- `formatters.js` — number/date formatting helpers
- `tables.js` — data-quality and salary reference tables
- `charts.js` — SVG chart rendering (no canvas/rasterization)
- `filters.js` — canonical row-filtering engine
- `aggregations.js` — KPI/summary aggregation logic (includes the Phase 6A `pickupDays` helpers)
- `filter-ui.js` — filter panel UI wiring
- `comparison.js` — period-over-period comparison engine
- `reportData.js` — Management Report data builder
- `reportPreview.js` — Management Report HTML rendering
- `reportPdf.js` — native browser print/PDF export
- `dashboard.js` — orchestrates all of the above (loaded last)
- `logo.png` — ARRIVE logo asset
- `Code.gs` — Google Apps Script backend (paste into your Google Sheet's Apps Script editor — see `SETUP_GUIDE.md`)
- `SETUP_GUIDE.md` — technical setup instructions (English)
- `OPERATING_GUIDE_AR.md` — دليل تشغيل عملي بالعربية
- `CHANGELOG_FINAL.md` — what changed in this FINAL package vs. the previous delivery

## Deployment

Static files — host the folder anywhere that serves static HTML (Vercel, GitHub Pages, an internal server, Google Drive, or opened directly via `index.html`). See `SETUP_GUIDE.md` / `OPERATING_GUIDE_AR.md` for details and browser/CORS notes.

## Configuration

Update the Apps Script URL inside `config.js` — it is the single, only place the API URL lives.

## pickupDays (Phase 6A)

The backend (`Code.gs`) now also returns an independent `pickupDays` dataset (per-request pickup dates, for a future "Pickup Days" report). The frontend reads it safely and defaults to an empty list if it's missing from an older deployment — `rows` and every existing chart/table/filter/report are unaffected. See `SETUP_GUIDE.md` → "Phase 6A — pickupDays" for details.

## Version

Current Version: **v2.2 (Phase 6A — FINAL)**
