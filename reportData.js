/**
 * reportData.js — ARRIVE First Mile Dashboard (Phase 1: Management Report)
 * ------------------------------------------------------------------
 * Builds the data model for the Management Report from the EXACT SAME
 * filtered aggregate dashboard.js already computed for the on-screen
 * dashboard (KPIs/charts/tables) — this module never touches `rows`,
 * never calls the filter engine, and never re-filters anything. It is
 * purely a reshaping/summarizing step over numbers that already exist.
 * That is what guarantees the report can never drift from what's on
 * screen: change a filter -> dashboard.js recomputes `agg` once ->
 * both the dashboard AND the report (if reopened, or open and
 * refreshed) read from that same object.
 *
 * Insights and recommendations are NOT recomputed here — they're
 * produced by dashboard.js's computeInsightCards()/
 * computeRecommendationItems()/computeTopBottomDrivers(), passed in as
 * `insightsEngine`, so that logic exists in exactly one place (see the
 * Phase-1-report refactor note at the top of dashboard.js's insight
 * functions).
 *
 * No DOM access — pure data-in, data-out.
 * ------------------------------------------------------------------
 */
window.DashboardReport = (function(){

  /**
   * createReportBuilder(deps) — deps:
   *   lookups: { months, cities, areas, branches, drivers, clients, types, statuses, reasons }
   *   meta: the dataset meta block (dateMin/dateMax/totalRecords/partialMonths/...)
   *   thresholds: { minDriverVolume, minCityVolume } — the SAME constants
   *               dashboard.js's insight/recommendation logic uses, passed
   *               in rather than redefined here (single source of truth).
   *   t, typeLabel, statusLabel, monthLabel, fmtNum, fmtCurrency, esc, rateClass
   *   insightsEngine: { computeInsightCards, computeRecommendationItems, computeTopBottomDrivers }
   *     — dashboard.js's own pure functions, reused as-is.
   */
  function createReportBuilder(deps){
    const { lookups, meta, thresholds, t, typeLabel, statusLabel, monthLabel, fmtNum, fmtCurrency, esc, rateClass, insightsEngine } = deps;
    const { months, cities, areas, branches, drivers, clients, types, statuses, reasons } = lookups;

    // "All" if every option in the universe is selected, otherwise a
    // readable, capped list ("A, B, C +4 more") — used throughout the
    // Report Scope section.
    function describeSet(selectedSet, universe, formatLabel){
      if(!universe.length || selectedSet.size===universe.length) return t('allSelected');
      if(selectedSet.size===0) return t('reportNone');
      const names = universe.filter(v=>selectedSet.has(v)).map(v=>formatLabel?formatLabel(v):v);
      const MAX_SHOWN = 6;
      if(names.length<=MAX_SHOWN) return names.join(', ');
      return names.slice(0,MAX_SHOWN).join(', ') + ' ' + t('reportPlusMore',{n:names.length-MAX_SHOWN});
    }

    function describePeriod(state){
      if(state.periodMode==='multi'){
        if(state.selectedMonths.size===months.length) return t('allSelected');
        const names = months.map((m,i)=>({i,m})).filter(x=>state.selectedMonths.has(x.i)).map(x=>monthLabel(x.m));
        return names.join(', ');
      }
      if(state.monthFrom===0 && state.monthTo===months.length-1) return t('allSelected');
      if(state.monthFrom===state.monthTo) return monthLabel(months[state.monthFrom]);
      return `${monthLabel(months[state.monthFrom])} → ${monthLabel(months[state.monthTo])}`;
    }

    function describeFees(feesMode){
      return feesMode==='has' ? t('feesHas') : feesMode==='none' ? t('feesNone') : t('allSelected');
    }

    function buildScope(state){
      return {
        period: describePeriod(state),
        city: describeSet(state.cities, cities),
        branch: describeSet(state.branches, branches),
        area: describeSet(state.areas, areas),
        requestStatus: describeSet(state.statuses, statuses, statusLabel),
        requestType: describeSet(state.types, types, typeLabel),
        driver: describeSet(state.drivers, drivers, d=>d.trim()),
        client: describeSet(state.clients, clients),
        reason: describeSet(state.reasons, reasons),
        extraFees: describeFees(state.feesMode),
        search: [state.globalQuery, state.driverQuery, state.clientQuery, state.areaQuery].filter(Boolean).join(' · ') || t('reportNone')
      };
    }

    function buildSummary(agg){
      const successRate = agg.total ? agg.done/agg.total*100 : 0;
      return {
        totalRequests: agg.total,
        successfulRequests: agg.done,
        failedRequests: agg.fail,
        successRate,
        totalExtraFees: agg.fees,
        totalRequestsLabel: fmtNum(agg.total),
        successfulRequestsLabel: fmtNum(agg.done),
        failedRequestsLabel: fmtNum(agg.fail),
        successRateLabel: successRate.toFixed(1)+'%',
        totalExtraFeesLabel: fmtCurrency(agg.fees)
      };
    }

    function pct(part, whole){ return whole ? part/whole*100 : 0; }

    function buildPerformance(agg){
      const cityRows = Object.keys(agg.cityAgg).map(c=>{
        const a = agg.cityAgg[c]; const total = a.done+a.fail;
        return { name:c, total, done:a.done, fail:a.fail, successRate:pct(a.done,total), fees:a.fees };
      }).sort((a,b)=>b.total-a.total);

      const areaRows = Object.keys(agg.areaAgg).map(ai=>{
        const a = agg.areaAgg[ai]; 
        return { name:areas[ai], city:a.city, total:a.count, done:a.done, fail:a.count-a.done, successRate:pct(a.done,a.count), fees:a.fees };
      }).sort((a,b)=>b.total-a.total);

      const driverRows = Object.keys(agg.driverAgg).map(di=>{
        const a = agg.driverAgg[di];
        return { name:drivers[di].trim(), total:a.count, done:a.done, fail:a.count-a.done, successRate:pct(a.done,a.count), fees:a.fees };
      }).sort((a,b)=>b.total-a.total);

      // Status breakdown — computed from the same fr the dashboard already
      // filtered, so it always matches whatever status set is active.
      const statusCounts = {};
      agg.fr.forEach(r=>{ const si=r[5]; statusCounts[si]=(statusCounts[si]||0)+r[8]; });
      const statusRows = Object.keys(statusCounts).map(si=>({
        name: statusLabel(statuses[si]), total: statusCounts[si], share: pct(statusCounts[si], agg.total)
      })).sort((a,b)=>b.total-a.total);

      const typeRows = Object.keys(agg.typeAgg).map(tp=>({
        name: typeLabel(tp), total: agg.typeAgg[tp], share: pct(agg.typeAgg[tp], agg.total)
      })).sort((a,b)=>b.total-a.total);

      const reasonRows = Object.keys(agg.reasonAgg).map(ri=>({
        name: reasons[ri], total: agg.reasonAgg[ri], share: pct(agg.reasonAgg[ri], agg.fail)
      })).filter(r=>r.name!=='N/A').sort((a,b)=>b.total-a.total);

      return { cities:cityRows, areas:areaRows, drivers:driverRows, statuses:statusRows, requestTypes:typeRows, reasons:reasonRows };
    }

    // Management Attention: every item here is derived strictly from
    // already-computed aggregates and the project's OWN existing
    // thresholds (rateClass's 75% "bad" cutoff, and the same qualifying-
    // volume thresholds insights/recommendations already use) — nothing
    // new is invented, per the Phase-1 report brief.
    function buildAttention(agg, performance){
      const items = [];

      const badCities = performance.cities.filter(c=>c.total>=thresholds.minCityVolume && rateClass(c.successRate)==='rate-bad');
      if(badCities.length) items.push({
        key:'cities', label:t('reportAttentionAreasFail'),
        detail: badCities.slice(0,5).map(c=>`${c.name} (${c.successRate.toFixed(1)}%)`).join(', ')
      });

      const badAreas = performance.areas.filter(a=>a.total>=thresholds.minCityVolume && rateClass(a.successRate)==='rate-bad');
      if(badAreas.length) items.push({
        key:'areas', label:t('reportAttentionAreasFailArea'),
        detail: badAreas.slice(0,5).map(a=>`${a.name} (${a.successRate.toFixed(1)}%)`).join(', ')
      });

      const { bottom } = insightsEngine.computeTopBottomDrivers(agg.driverAgg);
      const poorDrivers = bottom.filter(d=>rateClass(d.rate)==='rate-bad');
      if(poorDrivers.length) items.push({
        key:'drivers', label:t('reportAttentionDriverPoor'),
        detail: poorDrivers.slice(0,5).map(d=>`${d.name} (${d.rate.toFixed(1)}%)`).join(', ')
      });

      if(performance.reasons.length) items.push({
        key:'reasons', label:t('reportAttentionTopReason'),
        detail: performance.reasons.slice(0,3).map(r=>`${r.name} (${fmtNum(r.total)})`).join(', ')
      });

      const topFeesArea = performance.areas.slice().sort((a,b)=>b.fees-a.fees)[0];
      if(topFeesArea && topFeesArea.fees>0) items.push({
        key:'fees', label:t('reportAttentionHighFees'),
        detail: `${topFeesArea.name} — ${fmtCurrency(topFeesArea.fees)}`
      });

      if(meta.partialMonths && meta.partialMonths.length) items.push({
        key:'partialMonths', label:t('reportAttentionPartialMonth'),
        detail: meta.partialMonths.map(monthLabel).join(', ')
      });

      return items;
    }

    /**
     * buildManagementReportData(agg, state) — the single entry point.
     *   agg: the aggregate object dashboard.js's computeAggregates()
     *        already produced for the current filters (fr, driverAgg,
     *        areaAgg, clientAgg, reasonAgg, cityAgg, typeAgg, branchAgg,
     *        total, done, fail, fees, driverSet, citySet).
     *   state: the live filter-state object.
     * No filtering happens in this function — every number already
     * reflects the current filters before it gets here.
     */
    function buildManagementReportData(agg, state){
      const scope = buildScope(state);
      const summary = buildSummary(agg);
      const performance = buildPerformance(agg);
      const attention = buildAttention(agg, performance);
      const insights = insightsEngine.computeInsightCards(agg.driverAgg, agg.areaAgg, agg.clientAgg, agg.reasonAgg, agg.cityAgg, agg.typeAgg, agg.branchAgg);
      const recommendations = insightsEngine.computeRecommendationItems(agg.driverAgg, agg.areaAgg, agg.cityAgg, agg.reasonAgg, agg.branchAgg);
      return {
        generatedAt: new Date(),
        scope,
        summary,
        performance,
        attention,
        insights,
        recommendations
      };
    }

    return { buildManagementReportData };
  }

  return { createReportBuilder };
})();
