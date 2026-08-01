/**
 * ARRIVE DATA SERVICE — shared across all ARRIVE dashboards
 * ------------------------------------------------------------------
 * This file has zero knowledge of "First Mile" or any specific
 * dashboard's data shape. It only knows how to:
 *   - fetch JSON from a Google Apps Script Web App URL
 *   - time out and retry on failure
 *   - poll on an interval (auto-refresh)
 *   - tell the caller whether a load is the FIRST load (show full
 *     loading/error screens) or a BACKGROUND refresh (keep showing
 *     the last good data, surface a small non-blocking notice on
 *     failure instead)
 *
 * Every ARRIVE dashboard (First Mile, Inventory, Fleet, Control
 * Tower, ...) includes this same file unmodified and drives it with
 * its own config.js + its own render logic. This is the reusable
 * "API layer" — only config.js and the dashboard's own render code
 * change per dashboard.
 *
 * USAGE
 *   const controller = ArriveDataService.createController(window.ARRIVE_CONFIG, {
 *     onLoading:   (isFirstLoad) => { ... },
 *     onSuccess:   (data, isFirstLoad) => { ... },
 *     onError:     (message, isFirstLoad) => { ... }
 *   });
 *   controller.start();       // does first load, then schedules auto-refresh
 *   controller.refreshNow();  // manual refresh / retry button calls this
 *   controller.stop();        // stop auto-refresh (e.g. on page unload)
 * ------------------------------------------------------------------
 */
window.ArriveDataService = (function () {

  function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { method: 'GET', signal: controller.signal, cache: 'no-store' })
      .finally(() => clearTimeout(timer));
  }

  function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  async function fetchWithRetry(url, attempts, retryDelayMs, timeoutMs) {
    let lastErr;
    for (let i = 0; i <= attempts; i++) {
      try {
        const res = await fetchWithTimeout(url, timeoutMs);
        if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
        const data = await res.json();
        if (!data || typeof data !== 'object') throw new Error('Response was not a JSON object.');
        return data;
      } catch (err) {
        lastErr = err;
        if (i < attempts) await delay(retryDelayMs);
      }
    }
    throw lastErr;
  }

  function createController(config, handlers) {
    handlers = handlers || {};
    const onLoading = handlers.onLoading || function () {};
    const onSuccess = handlers.onSuccess || function () {};
    const onError = handlers.onError || function () {};

    let timer = null;
    let firstLoadDone = false;
    let inFlight = false;

    function describeError(err) {
      if (err && err.name === 'AbortError') return 'Request timed out.';
      return String(err && err.message ? err.message : err);
    }

    async function load() {
      if (inFlight) return; // avoid overlapping fetches if a manual refresh fires mid-auto-refresh
      const isFirstLoad = !firstLoadDone;

      if (!config.APPS_SCRIPT_URL || config.APPS_SCRIPT_URL.indexOf('PASTE_YOUR') === 0) {
        onError('config.js: APPS_SCRIPT_URL is not set yet. See SETUP_GUIDE.md.', isFirstLoad);
        return;
      }

      inFlight = true;
      onLoading(isFirstLoad);
      try {
        const data = await fetchWithRetry(
          config.APPS_SCRIPT_URL,
          config.RETRY_ATTEMPTS != null ? config.RETRY_ATTEMPTS : 2,
          config.RETRY_DELAY_MS != null ? config.RETRY_DELAY_MS : 1500,
          config.REQUEST_TIMEOUT_MS != null ? config.REQUEST_TIMEOUT_MS : 15000
        );
        firstLoadDone = true;
        onSuccess(data, isFirstLoad);
      } catch (err) {
        const msg = describeError(err);
        if (config.DASHBOARD_ID) console.warn('[' + config.DASHBOARD_ID + ']', 'data load failed:', msg);
        onError(msg, isFirstLoad);
      } finally {
        inFlight = false;
      }
    }

    function scheduleAutoRefresh() {
      if (timer) clearInterval(timer);
      const minutes = config.AUTO_REFRESH_MINUTES;
      if (minutes && minutes > 0) {
        timer = setInterval(load, minutes * 60000);
      }
    }

    return {
      start() { load(); scheduleAutoRefresh(); },
      refreshNow() { load(); },
      stop() { if (timer) clearInterval(timer); timer = null; },
      isFirstLoadDone() { return firstLoadDone; }
    };
  }

  return { createController };
})();
