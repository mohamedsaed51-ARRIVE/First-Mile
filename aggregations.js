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
 * ------------------------------------------------------------------
 */
window.DashboardAggregations = (function(){

  /**
   * createAggregations(deps) — deps: { state, DONE_IDX, FAIL_IDX, filterEngine }
   *   state: the live filter-state object (read at call time, not copied)
   *   filterEngine: a DashboardFilters engine bound to the loaded dataset
   */
  function createAggregations(deps){
    const { state, DONE_IDX, FAIL_IDX, filterEngine } = deps;

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

    return { filteredRows, aggregate };
  }

  return { createAggregations };
})();
