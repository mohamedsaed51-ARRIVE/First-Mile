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
    // ---- جودة العميل: متوسط الشحنات لكل طلب ----
    // العميل «جيد» لو متوسط شحناته لكل طلب ≥ 1.25 × المتوسط العام، و«ضعيف» لو ≤ 0.75 ×
    // المتوسط العام (طلبات كثيرة وشحنات قليلة). العملاء بأقل من 10 طلبات «غير كافٍ».
    // الحدود مقترحة (قابلة للتعديل هنا فقط) وليست قاعدة معتمدة من ARRIVE.
    const CQ = { minReqs: 10, good: 1.25, low: 0.75 };
    // rowSet: صفوف [..., cl=6, ..., count=8, fees=9, ships=10] — يُحسب المتوسط العام من نفس المجموعة
    function computeClientQuality(rowSet){
      const per = new Map(); let totReq=0, totShip=0, totDone=0;
      rowSet.forEach(r=>{
        const cl=r[6], cnt=r[8], sh=r[10]||0;
        let g = per.get(cl); if(!g){ g={cl, reqs:0, done:0, ships:0}; per.set(cl,g); }
        g.reqs+=cnt; g.ships+=sh; if(r[5]===DONE_IDX) g.done+=cnt;
        totReq+=cnt; totShip+=sh; if(r[5]===DONE_IDX) totDone+=cnt;
      });
      // المتوسط على الطلبات المكتملة (تم) فقط، لأن الطلب الفاشل لا شحنات له
      const avg = totDone ? totShip/totDone : 0;
      const classOf = new Map(); const list = [];
      per.forEach(g=>{
        const perReq = g.done ? g.ships/g.done : 0;
        const ratio = avg ? perReq/avg : 0;
        let cls = 'na';
        if(avg>0 && g.done>0 && g.reqs>=CQ.minReqs) cls = ratio>=CQ.good ? 'good' : (ratio<=CQ.low ? 'low' : 'mid');
        classOf.set(g.cl, cls);
        list.push({ cl:g.cl, reqs:g.reqs, done:g.done, ships:g.ships, perReq, ratio, cls });
      });
      return { avg, totReq, totDone, totShip, classOf, list, thresholds: CQ };
    }
    let lastClientQuality = null;
    // يطبّق فلتر جودة العميل (state.clientQuality) على مجموعة صفوف بعد بقية الفلاتر
    function applyQuality(rowSet, remember){
      const cq = computeClientQuality(rowSet);
      if(remember) lastClientQuality = cq;
      if(!state.clientQuality || state.clientQuality==='all') return rowSet;
      return rowSet.filter(r=>cq.classOf.get(r[6])===state.clientQuality);
    }
    function getClientQuality(){ return lastClientQuality; }

    function filteredRows(){
      return applyQuality(filterEngine.filterRows(state), true);
    }

    // Reduces a row set to {total, done, fail, fees, ships}. Independent of how
    // the row set was produced, so it's reused for the current period,
    // the previous period, and anywhere else a quick summary is needed.
    function aggregate(rowSet){
      let total=0,done=0,fail=0,fees=0,ships=0;
      rowSet.forEach(r=>{ const [,,,,,si,,,count,f,sh]=r; total+=count; fees+=f; ships+=(sh||0); if(si===DONE_IDX) done+=count; else if(si===FAIL_IDX) fail+=count; });
      return {total,done,fail,fees,ships};
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

    return { filteredRows, aggregate, filteredPickupDays, computePickupDaysByClient, applyQuality, getClientQuality, CQ };
  }

  return { createAggregations };
})();
