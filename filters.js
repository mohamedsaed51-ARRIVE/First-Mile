/**
 * filters.js — ARRIVE First Mile Dashboard (Phase 1: Filtering System)
 * ------------------------------------------------------------------
 * The canonical row-filtering engine. Everything that needs to answer
 * "is this row currently in scope" — the main render pipeline, the
 * previous-period comparison used for KPI trend arrows, and CSV
 * export — calls into the SAME matchesRow()/filterRows() here instead
 * of each re-implementing its own copy of the filter predicate. This
 * is what phase 0's audit flagged as duplicated logic (filteredRows()
 * vs. the inline "previous period" filter vs. exportCSV's own
 * re-aggregation); this file is now the one place that logic lives.
 *
 * Data-model note: rows only carry a MONTH index (not a per-request
 * date) — see the module doc-comment in dashboard.js for why "Today /
 * This Week / custom date range" resolve to whole months rather than
 * exact days, and why "Recorded on System" cannot be filtered here at
 * all (it isn't part of the row's grouping key in the source JSON).
 *
 * No DOM access — pure data-in, data-out — so it's usable from the
 * render pipeline, the CSV exporter, or a future Web Worker without
 * any changes.
 * ------------------------------------------------------------------
 */
window.DashboardFilters = (function(){

  /**
   * createFilterEngine(deps) — deps: the lookup arrays already loaded
   * from the Apps Script JSON (rows, months, cities, areas, drivers,
   * clients, types, statuses, reasons, driverBranch). Returns an
   * engine bound to that dataset.
   */
  function createFilterEngine(deps){
    const { rows, months, cities, areas, drivers, clients, types, statuses, reasons, driverBranch } = deps;

    const UNASSIGNED_BRANCH = 'Unassigned';
    // branches: derived from driverBranch (per-driver), not a raw column.
    // A driver with no branch mapping falls into the "Unassigned" bucket
    // rather than being silently dropped from every branch-filtered view.
    const branches = Array.from(new Set(driverBranch.map(b=>b || UNASSIGNED_BRANCH))).sort();
    function branchOfDriver(di){ return driverBranch[di] || UNASSIGNED_BRANCH; }

    // ---- period helpers -------------------------------------------------
    function isoDate(d){ return d.toISOString().slice(0,10); }

    // Maps an arbitrary [fromDateStr, toDateStr] (YYYY-MM-DD, either may be
    // blank) onto the inclusive month-index span it overlaps. Rows only
    // have month granularity, so a date range can only ever narrow down to
    // whole months — this is the deliberate, documented approximation.
    // Returns null if the range doesn't overlap any month in the dataset.
    function resolveDateRange(fromDateStr, toDateStr){
      if(!fromDateStr && !toDateStr) return null;
      const fromKey = fromDateStr ? fromDateStr.slice(0,7) : months[0];
      const toKey = toDateStr ? toDateStr.slice(0,7) : months[months.length-1];
      let fromIdx = months.findIndex(m=>m>=fromKey);
      if(fromIdx===-1) fromIdx = months.length-1;
      let toIdx = -1;
      for(let i=months.length-1;i>=0;i--){ if(months[i]<=toKey){ toIdx=i; break; } }
      if(toIdx===-1) toIdx = 0;
      if(fromIdx>toIdx) return null;
      return { monthFrom: fromIdx, monthTo: toIdx };
    }

    // Resolves a named quick preset to a {monthFrom, monthTo} month-index
    // range using the real "today". Returns null if today's (or last
    // month's) data isn't present in the loaded dataset at all.
    function resolvePreset(preset){
      const now = new Date();
      if(preset==='today') return resolveDateRange(isoDate(now), isoDate(now));
      if(preset==='thisWeek'){
        const day = now.getDay();
        const start = new Date(now); start.setDate(now.getDate()-day);
        const end = new Date(start); end.setDate(start.getDate()+6);
        return resolveDateRange(isoDate(start), isoDate(end));
      }
      if(preset==='thisMonth') return resolveDateRange(isoDate(now), isoDate(now));
      if(preset==='lastMonth'){
        const d = new Date(now.getFullYear(), now.getMonth()-1, 1);
        return resolveDateRange(isoDate(d), isoDate(d));
      }
      return null;
    }

    // ---- the canonical predicate -----------------------------------------
    // filterState shape (see dashboard.js state object):
    //   periodMode: 'range' | 'multi'
    //   monthFrom, monthTo: number (used when periodMode==='range')
    //   selectedMonths: Set<number> (used when periodMode==='multi')
    //   cities, areas, branches, types, statuses, drivers, clients, reasons: Set<string>
    //   feesMode: 'all' | 'has' | 'none'
    //   driverQuery, clientQuery, areaQuery, globalQuery: lowercased strings ('' = no filter)
    function matchesRow(r, state){
      const [mi,ci,ai,di,ti,si,cli,ri,,fees] = r;

      if(state.periodMode==='multi'){
        if(!state.selectedMonths.has(mi)) return false;
      } else {
        if(mi<state.monthFrom || mi>state.monthTo) return false;
      }

      if(!state.cities.has(cities[ci])) return false;
      if(!state.areas.has(areas[ai])) return false;
      if(!state.branches.has(branchOfDriver(di))) return false;
      if(!state.types.has(types[ti])) return false;
      if(!state.statuses.has(statuses[si])) return false;
      if(!state.drivers.has(drivers[di])) return false;
      if(!state.clients.has(clients[cli])) return false;
      if(!state.reasons.has(reasons[ri])) return false;

      if(state.feesMode==='has' && !(fees>0)) return false;
      if(state.feesMode==='none' && fees>0) return false;
      // state.recordedMode is intentionally NOT checked here — the source
      // JSON doesn't carry this field per row (see file header note), so
      // the control exists in the UI (disabled) but has no filtering effect.

      if(state.driverQuery && !drivers[di].toLowerCase().includes(state.driverQuery)) return false;
      if(state.clientQuery && !clients[cli].toLowerCase().includes(state.clientQuery)) return false;
      if(state.areaQuery && !areas[ai].toLowerCase().includes(state.areaQuery)) return false;
      if(state.globalQuery){
        const hay = (cities[ci]+' '+areas[ai]+' '+drivers[di]+' '+clients[cli]).toLowerCase();
        if(!hay.includes(state.globalQuery)) return false;
      }
      return true;
    }

    function filterRows(state){
      return rows.filter(r=>matchesRow(r, state));
    }

    // Same predicate, but with the period overridden to an arbitrary
    // month range — used for the "previous period" KPI comparison so
    // that logic isn't duplicated a second time in dashboard.js.
    function filterRowsByMonthRange(state, monthFrom, monthTo){
      const overridden = Object.assign({}, state, { periodMode:'range', monthFrom, monthTo });
      return rows.filter(r=>matchesRow(r, overridden));
    }

    return { branches, UNASSIGNED_BRANCH, branchOfDriver, resolveDateRange, resolvePreset, matchesRow, filterRows, filterRowsByMonthRange };
  }

  return { createFilterEngine };
})();
