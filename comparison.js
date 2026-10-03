/**
 * comparison.js — ARRIVE First Mile Dashboard (Phase 2: Comparison Engine)
 * ------------------------------------------------------------------
 * Compares two periods using data that's already been filtered and
 * aggregated elsewhere:
 *
 *   Period A rows = filterEngine.filterRows(state)                (filters.js — unchanged)
 *   Period B rows = filterEngine.filterRowsByMonthRange(state, ...) (filters.js — unchanged)
 *   aggA = buildFullAggregate(periodARows)                        (dashboard.js — unchanged)
 *   aggB = buildFullAggregate(periodBRows)                        (dashboard.js — unchanged)
 *   comparisonData = buildComparisonData(aggA, aggB)               (THIS FILE)
 *
 * Both periods go through the exact same filter state (every active
 * City/Area/Driver/Client/Type/Status/Reason/Fees/Search filter), only
 * the month range differs — so "Cairo, July vs Cairo, June" is what
 * you get, never "All Egypt, July vs All Egypt, June". This file never
 * touches `rows` and never re-filters anything; it only compares two
 * aggregate objects it's handed.
 *
 * No DOM access — pure data-in, data-out.
 * ------------------------------------------------------------------
 */
window.DashboardComparison = (function(){

  // KPI polarity: whether an increase is good, bad, or neither. Section 7
  // of the brief is explicit that volume metrics (requests) are neutral —
  // more requests isn't inherently good or bad, it's just more volume.
  const KPI_POLARITY = {
    totalRequests: 'neutral',
    successfulRequests: 'neutral',
    failedRequests: 'lowerIsBetter',
    successRate: 'higherIsBetter',
    totalExtraFees: 'lowerIsBetter'
  };

  function createComparisonEngine(deps){
    const { lookups, thresholds, t, typeLabel, monthLabel, fmtNum, fmtCurrency } = deps;
    const { cities, areas, drivers, types, reasons } = lookups;

    // percentageChange = ((current - previous) / previous) * 100, but
    // previous === 0 makes that mathematically undefined regardless of
    // current — returns null (never NaN/Infinity) so callers render "N/A".
    function pctChange(current, previous){
      if(!previous) return null;
      return (current-previous)/previous*100;
    }
    function pctLabel(p){
      return p===null ? t('reportNA') : (p>=0?'+':'')+p.toFixed(1)+'%';
    }

    function direction(polarity, current, previous){
      if(current===previous) return 'neutral';
      if(polarity==='neutral') return 'neutral';
      const increased = current>previous;
      if(polarity==='higherIsBetter') return increased?'improved':'declined';
      if(polarity==='lowerIsBetter') return increased?'declined':'improved';
      return 'neutral';
    }

    // ---- KPI comparison ---------------------------------------------------
    function kpiRow(key, label, current, previous, opts){
      opts = opts||{};
      const change = current-previous;
      const p = pctChange(current, previous);
      const fmtVal = opts.isCurrency ? fmtCurrency : (opts.isPercent ? (v=>v.toFixed(1)+'%') : fmtNum);
      const sign = change>=0 ? '+' : '−';
      const changeLabel = opts.isPercent ? `${sign}${Math.abs(change).toFixed(1)} ${t('ptsUnit')}`
        : opts.isCurrency ? `${sign}${fmtCurrency(Math.abs(change))}`
        : `${sign}${fmtNum(Math.abs(change))}`;
      return {
        key, label, current, previous, change, pct:p,
        direction: direction(KPI_POLARITY[key], current, previous),
        currentLabel: fmtVal(current), previousLabel: fmtVal(previous),
        changeLabel, pctLabel: pctLabel(p)
      };
    }

    function computeKpiComparison(aggA, aggB){
      const rateA = aggA.total ? aggA.done/aggA.total*100 : 0;
      const rateB = aggB.total ? aggB.done/aggB.total*100 : 0;
      return [
        kpiRow('totalRequests', t('kpiTotalRequests'), aggA.total, aggB.total),
        kpiRow('successfulRequests', t('kpiCompleted'), aggA.done, aggB.done),
        kpiRow('failedRequests', t('kpiFailed'), aggA.fail, aggB.fail),
        kpiRow('successRate', t('kpiSuccessRate'), rateA, rateB, {isPercent:true}),
        kpiRow('totalExtraFees', t('kpiExtraFees'), aggA.fees, aggB.fees, {isCurrency:true})
      ];
    }

    // ---- Dimension comparisons ---------------------------------------------
    // Iterates the full lookup universe (not just keys present in one agg)
    // so "exists only in Period A" / "exists only in Period B" resolve to a
    // clean 0 on the missing side instead of being silently dropped.

    function compareCities(cityAggA, cityAggB){
      return cities.map(c=>{
        const a = cityAggA[c] || {done:0,fail:0,fees:0};
        const b = cityAggB[c] || {done:0,fail:0,fees:0};
        const curTotal=a.done+a.fail, prevTotal=b.done+b.fail;
        const curRate = curTotal? a.done/curTotal*100 : 0, prevRate = prevTotal? b.done/prevTotal*100 : 0;
        return {
          name:c, current:curTotal, previous:prevTotal, change:curTotal-prevTotal, pct:pctChange(curTotal,prevTotal),
          currentRate:curRate, previousRate:prevRate, rateChange: curTotal&&prevTotal ? curRate-prevRate : null,
          currentFees:a.fees, previousFees:b.fees,
          onlyIn: curTotal>0&&prevTotal===0?'current':(prevTotal>0&&curTotal===0?'previous':null)
        };
      }).filter(r=>r.current>0||r.previous>0).sort((x,y)=>(y.current+y.previous)-(x.current+x.previous));
    }

    function compareAreas(areaAggA, areaAggB){
      return areas.map((name,i)=>{
        const ai = String(i);
        const a = areaAggA[ai], b = areaAggB[ai];
        const curTotal = a?a.count:0, prevTotal = b?b.count:0;
        const curDone = a?a.done:0, prevDone = b?b.done:0;
        const curRate = curTotal? curDone/curTotal*100 : 0, prevRate = prevTotal? prevDone/prevTotal*100 : 0;
        return {
          name, city: (a&&a.city)||(b&&b.city)||'',
          current:curTotal, previous:prevTotal, change:curTotal-prevTotal, pct:pctChange(curTotal,prevTotal),
          currentRate:curRate, previousRate:prevRate,
          currentFees:a?a.fees:0, previousFees:b?b.fees:0,
          onlyIn: curTotal>0&&prevTotal===0?'current':(prevTotal>0&&curTotal===0?'previous':null)
        };
      }).filter(r=>r.current>0||r.previous>0).sort((x,y)=>(y.current+y.previous)-(x.current+x.previous));
    }

    // Driver comparison respects the SAME minimum-volume qualification
    // Phase 1 already introduced (thresholds.minDriverVolume) — a driver's
    // success-RATE is only shown when that period's volume qualifies;
    // otherwise it's marked "Insufficient Volume" rather than presenting a
    // rate computed from a handful of requests. Request-count comparison
    // itself has no such gate (a count is valid at any volume).
    function compareDrivers(driverAggA, driverAggB){
      return drivers.map((name,i)=>{
        const di = String(i);
        const a = driverAggA[di], b = driverAggB[di];
        const curTotal = a?a.count:0, prevTotal = b?b.count:0;
        const curDone = a?a.done:0, prevDone = b?b.done:0;
        const curQualified = curTotal>=thresholds.minDriverVolume;
        const prevQualified = prevTotal>=thresholds.minDriverVolume;
        const curRate = curTotal? curDone/curTotal*100 : 0, prevRate = prevTotal? prevDone/prevTotal*100 : 0;
        return {
          name: name.trim(), current:curTotal, previous:prevTotal, change:curTotal-prevTotal, pct:pctChange(curTotal,prevTotal),
          currentRate: curQualified?curRate:null, previousRate: prevQualified?prevRate:null,
          currentQualified:curQualified, previousQualified:prevQualified,
          rateChange: (curQualified&&prevQualified) ? curRate-prevRate : null,
          onlyIn: curTotal>0&&prevTotal===0?'current':(prevTotal>0&&curTotal===0?'previous':null)
        };
      }).filter(r=>r.current>0||r.previous>0).sort((x,y)=>(y.current+y.previous)-(x.current+x.previous));
    }

    function compareReasons(reasonAggA, reasonAggB){
      return reasons.map((name,i)=>{
        const ri = String(i);
        if(name==='N/A') return null;
        const cur = reasonAggA[ri]||0, prev = reasonAggB[ri]||0;
        if(cur===0 && prev===0) return null;
        return { name, current:cur, previous:prev, change:cur-prev, pct:pctChange(cur,prev),
          onlyIn: cur>0&&prev===0?'current':(prev>0&&cur===0?'previous':null) };
      }).filter(Boolean).sort((x,y)=>(y.current+y.previous)-(x.current+x.previous));
    }

    function compareRequestTypes(typeAggA, typeAggB){
      return types.map(tp=>{
        const cur = typeAggA[tp]||0, prev = typeAggB[tp]||0;
        return { name: typeLabel(tp), current:cur, previous:prev, change:cur-prev, pct:pctChange(cur,prev),
          onlyIn: cur>0&&prev===0?'current':(prev>0&&cur===0?'previous':null) };
      }).filter(r=>r.current>0||r.previous>0).sort((x,y)=>(y.current+y.previous)-(x.current+x.previous));
    }

    // ---- Comparison insights -------------------------------------------
    // Every statement here is a direct readout of an already-computed
    // number — no causal language, no invented reasoning, matching the
    // brief's explicit example ("Driver X recorded a 12% decrease in
    // success rate", not "performance declined because of...").
    function computeComparisonInsights(kpiRows, cityRows, driverRows, reasonRows){
      const items = [];
      const successRateRow = kpiRows.find(k=>k.key==='successRate');
      if(successRateRow && Math.abs(successRateRow.change)>=0.5){
        items.push(t(successRateRow.change>0?'cmpInsightSuccessRateUp':'cmpInsightSuccessRateDown', {pts: Math.abs(successRateRow.change).toFixed(1)}));
      }
      const failedRow = kpiRows.find(k=>k.key==='failedRequests');
      if(failedRow && failedRow.pct!==null && Math.abs(failedRow.pct)>=1){
        items.push(t(failedRow.change>0?'cmpInsightFailedUp':'cmpInsightFailedDown', {pct: Math.abs(failedRow.pct).toFixed(1)}));
      }
      const growthCities = cityRows.filter(c=>c.pct!==null && c.pct>0).sort((a,b)=>b.pct-a.pct);
      if(growthCities[0]) items.push(t('cmpInsightTopGrowthCity',{city:growthCities[0].name, pct:growthCities[0].pct.toFixed(1)}));
      const declineCities = cityRows.filter(c=>c.pct!==null && c.pct<0).sort((a,b)=>a.pct-b.pct);
      if(declineCities[0]) items.push(t('cmpInsightTopDeclineCity',{city:declineCities[0].name, pct:Math.abs(declineCities[0].pct).toFixed(1)}));
      const topReasonIncrease = reasonRows.filter(r=>r.change>0).sort((a,b)=>b.change-a.change)[0];
      if(topReasonIncrease) items.push(t('cmpInsightReasonIncrease',{reason:topReasonIncrease.name, n:fmtNum(topReasonIncrease.change)}));
      const improvedDrivers = driverRows.filter(d=>d.rateChange!==null && d.rateChange>0).sort((a,b)=>b.rateChange-a.rateChange);
      if(improvedDrivers[0]) items.push(t('cmpInsightDriverImproved',{driver:improvedDrivers[0].name, pts:improvedDrivers[0].rateChange.toFixed(1)}));
      const declinedDrivers = driverRows.filter(d=>d.rateChange!==null && d.rateChange<0).sort((a,b)=>a.rateChange-b.rateChange);
      if(declinedDrivers[0]) items.push(t('cmpInsightDriverDeclined',{driver:declinedDrivers[0].name, pts:Math.abs(declinedDrivers[0].rateChange).toFixed(1)}));
      return items;
    }

    // ---- Entry point ----------------------------------------------------
    // aggA / aggB: full aggregates already built by dashboard.js's
    // buildFullAggregate() from filters.js-filtered rows. periodALabel/
    // periodBLabel: pre-formatted period descriptions for display.
    function buildComparisonData(aggA, aggB, periodALabel, periodBLabel){
      const kpis = computeKpiComparison(aggA, aggB);
      const citiesCmp = compareCities(aggA.cityAgg, aggB.cityAgg);
      const areasCmp = compareAreas(aggA.areaAgg, aggB.areaAgg);
      const driversCmp = compareDrivers(aggA.driverAgg, aggB.driverAgg);
      const reasonsCmp = compareReasons(aggA.reasonAgg, aggB.reasonAgg);
      const typesCmp = compareRequestTypes(aggA.typeAgg, aggB.typeAgg);
      const insights = computeComparisonInsights(kpis, citiesCmp, driversCmp, reasonsCmp);
      return {
        periodALabel, periodBLabel,
        kpis, cities: citiesCmp, areas: areasCmp, drivers: driversCmp, reasons: reasonsCmp, requestTypes: typesCmp,
        insights
      };
    }

    return { buildComparisonData, pctChange, pctLabel, direction };
  }

  return { createComparisonEngine };
})();
