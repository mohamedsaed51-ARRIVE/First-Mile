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

    // Phase 5: a condensed, one-line "what's this report actually scoped
    // to" summary for the executive cover — reuses the exact same
    // describeSet()/describePeriod() strings buildScope() already
    // produces, just drops the ones that are simply "All" so the cover
    // stays clean instead of listing 11 unfiltered rows. No new scope
    // logic — this is a display-only filter over buildScope()'s output.
    function buildCoverScopeLine(scope){
      const allLabel = t('allSelected');
      const parts = [
        [t('cityLabel'), scope.city], [t('branchFilterLabel'), scope.branch],
        [t('areaFilterLabel'), scope.area], [t('statusLabel'), scope.requestStatus],
        [t('requestTypeLabel'), scope.requestType], [t('driverFilterLabel'), scope.driver],
        [t('merchantFilterLabel'), scope.client], [t('reasonFilterLabel'), scope.reason],
        [t('extraFeesFilterLabel'), scope.extraFees]
      ].filter(([,v])=>v && v!==allLabel && v!==t('reportNone'));
      return parts.length ? parts.map(([l,v])=>`${l}: ${v}`).join(' · ') : t('reportCoverAllOperations');
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

      // Phase 5: "Best Performers" / "Areas Requiring Attention" splits —
      // presentation-only regrouping of the SAME cityRows/areaRows this
      // function already built, using the SAME qualifying-volume
      // threshold and the SAME rateClass() cutoff buildAttention() below
      // already uses for badCities/badAreas. No new ranking formula: it's
      // the existing successRate field, filtered by the existing
      // threshold, sorted by the existing field. Drivers reuse
      // insightsEngine.computeTopBottomDrivers() as-is (Phase 1 logic,
      // unchanged) rather than recomputing a top/bottom split here.
      const qualifyingCities = cityRows.filter(c=>c.total>=thresholds.minCityVolume);
      const cityBest = qualifyingCities.slice().sort((a,b)=>b.successRate-a.successRate).slice(0,5);
      const cityAttention = qualifyingCities.filter(c=>rateClass(c.successRate)==='rate-bad').slice().sort((a,b)=>a.successRate-b.successRate).slice(0,5);
      const qualifyingAreas = areaRows.filter(a=>a.total>=thresholds.minCityVolume);
      const areaBest = qualifyingAreas.slice().sort((a,b)=>b.successRate-a.successRate).slice(0,5);
      const areaAttention = qualifyingAreas.filter(a=>rateClass(a.successRate)==='rate-bad').slice().sort((a,b)=>a.successRate-b.successRate).slice(0,5);
      const { top: driverBest, bottom: driverBottomAll } = insightsEngine.computeTopBottomDrivers(agg.driverAgg);
      const driverAttention = driverBottomAll.filter(d=>rateClass(d.rate)==='rate-bad');

      // Failure concentration: a plain sum of the top-3 reasons' already-
      // computed `.share` values — not a new source calculation.
      const topReasons = reasonRows.slice(0,3);
      const failureConcentrationPct = topReasons.reduce((s,r)=>s+r.share,0);

      return {
        cities:cityRows, areas:areaRows, drivers:driverRows, statuses:statusRows, requestTypes:typeRows, reasons:reasonRows,
        cityBest, cityAttention, areaBest, areaAttention,
        driverBest: driverBest.slice(0,5), driverAttention: driverAttention.slice(0,5),
        topFailureReasons: topReasons, failureConcentrationPct
      };
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

    // Phase 5: a short "what should management take away from this"
    // message — assembled ONLY from numbers/strings already computed
    // above (summary, attention, insights) or already computed by
    // comparison.js (kpis[].direction/pctLabel/changeLabel). No new
    // arithmetic happens here; this is template selection + lookup only.
    function buildManagementMessage(summary, attentionItems, insights, comparisonData){
      const lines = [];
      lines.push(t('msgOverviewLine', { total: summary.totalRequestsLabel, rate: summary.successRateLabel }));
      lines.push(attentionItems.length
        ? t('msgAttentionLine', { n: attentionItems.length })
        : t('msgAttentionLineNone'));
      if(insights[0]) lines.push(t('msgTopInsightLine', { tag: insights[0].tag, main: insights[0].main }));
      if(comparisonData){
        const rateKpi = comparisonData.kpis.find(k=>k.key==='successRate');
        if(rateKpi){
          const key = rateKpi.direction==='improved' ? 'msgTrendImproved'
            : rateKpi.direction==='declined' ? 'msgTrendDeclined' : 'msgTrendNeutral';
          lines.push(t(key, { rate: rateKpi.currentLabel, pct: rateKpi.pctLabel }));
        }
      }
      return lines;
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
    // Phase 2: comparisonData is the object comparison.js's
    // buildComparisonData() already produced (or null if Comparison Mode
    // is off) — this function does not compute or touch it, only carries
    // it into the report's data shape so reportPreview.js can render a
    // Comparison section when it's present.
    function buildManagementReportData(agg, state, comparisonData){
      const scope = buildScope(state);
      const summary = buildSummary(agg);
      const performance = buildPerformance(agg);
      const attention = buildAttention(agg, performance);
      const insights = insightsEngine.computeInsightCards(agg.driverAgg, agg.areaAgg, agg.clientAgg, agg.reasonAgg, agg.cityAgg, agg.typeAgg, agg.branchAgg);
      const recommendations = insightsEngine.computeRecommendationItems(agg.driverAgg, agg.areaAgg, agg.cityAgg, agg.reasonAgg, agg.branchAgg);
      const cover = { scopeLine: buildCoverScopeLine(scope), periodLabel: scope.period };
      const managementMessage = buildManagementMessage(summary, attention, insights, comparisonData);
      return {
        generatedAt: new Date(),
        cover,
        scope,
        summary,
        performance,
        attention,
        insights,
        recommendations,
        managementMessage,
        comparison: comparisonData || null
      };
    }

    return { buildManagementReportData };
  }

  return { createReportBuilder };
})();
