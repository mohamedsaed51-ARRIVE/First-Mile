/**
 * aggregations.js — ARRIVE First Mile Dashboard
 * ------------------------------------------------------------------
 * Phase 0D extracted filteredRows()/aggregate() out of the inline
 * script. Phase 1 goes one step further: filteredRows() no longer
 * owns its own filter predicate — it delegates to filters.js (the
 * new canonical filtering engine), which is also used by CSV export
 * and the previous-period KPI comparison. That removes the last of
 * the duplicated filter-predicate logic flagged in the original
 * audit. aggregate() is untouched — it's a pure reduction over
 * whatever row set it's given and has no filtering logic to dedupe.
 *
 * Phase 6A (additive): the backend now optionally sends a second,
 * independent dataset, `pickupDays` — one un-aggregated entry per
 * Pickup-type request with a valid date (see Code.gs). It uses the
 * exact same dictionary-encoding positions 0–9 as `rows`, plus a
 * trailing ISO date string at index 10, so filters.js's existing
 * matchesRow(r, state) predicate — which only reads positions 0–7
 * and 9 — works on pickupDays rows unmodified, with zero changes to
 * filters.js. `rows` itself, filteredRows(), and aggregate() below
 * are completely untouched by this addition. If the API response is
 * old and has no `pickupDays` field, deps.pickupDays is undefined and
 * we default it to an empty array so nothing here ever throws — this
 * new code path is simply inert until the backend sends the field.
 * ------------------------------------------------------------------
 */
window.DashboardAggregations = (function(){

  /**
   * createAggregations(deps) — deps: { state, DONE_IDX, FAIL_IDX, filterEngine, pickupDays }
   *   state: the live filter-state object (read at call time, not copied)
   *   filterEngine: a DashboardFilters engine bound to the loaded dataset
   *   pickupDays: optional array from the API payload (Phase 6A); safely
   *     defaults to [] when absent (older cached/deployed API response).
   */
  function createAggregations(deps){
    const { state, DONE_IDX, FAIL_IDX, filterEngine } = deps;
    const pickupDays = Array.isArray(deps.pickupDays) ? deps.pickupDays : [];

    // Rows currently matching every active filter. Delegates entirely to
    // filters.js so this logic exists in exactly one place.
    function filteredRows(){
      return filterEngine.filterRows(state);
    }

    // Reduces a row set to {total, done, fail, fees}. Independent of how
    // the row set was produced, so it's reused for the current period,
    // the previous period, and anywhere else a quick summary is needed.
    function aggregate(rowSet){
      let total=0,done=0,fail=0,fees=0;
      rowSet.forEach(r=>{ const [,,,,,si,,,count,f]=r; total+=count; fees+=f; if(si===DONE_IDX) done+=count; else if(si===FAIL_IDX) fail+=count; });
      return {total,done,fail,fees};
    }

    // ---- Phase 6A: pickupDays helpers (additive, not used by any
    // existing render path — available for future Pickup-Day reports) ----

    // pickupDays entries share the same 0–7/9 layout as `rows`, so the
    // existing canonical predicate applies unmodified.
    function filteredPickupDays(){
      return pickupDays.filter(r=>filterEngine.matchesRow(r, state));
    }

    // Distinct pickup dates per client, from a given (already-filtered)
    // pickupDays row set. Returns {clientName: distinctDayCount}.
    function computePickupDaysByClient(pickupDayRowSet){
      const datesByClient = {};
      (pickupDayRowSet || []).forEach(r=>{
        const cli = r[6], date = r[10];
        if(!date) return;
        if(!datesByClient[cli]) datesByClient[cli] = new Set();
        datesByClient[cli].add(date);
      });
      const result = {};
      Object.keys(datesByClient).forEach(cli=>{ result[cli] = datesByClient[cli].size; });
      return result;
    }

    return { filteredRows, aggregate, filteredPickupDays, computePickupDaysByClient };
  }

  return { createAggregations };
})();
