/**
 * reportPreview.js — ARRIVE First Mile Dashboard (Phase 1: Management Report)
 * ------------------------------------------------------------------
 * Renders the Management Report overlay from the plain data object
 * reportData.js produces. This file has no filtering logic and no
 * aggregation logic — it only knows how to turn a report-data object
 * into HTML. It reuses the dashboard's existing visual language
 * (.panel, table/thead/tbody, .insight-card, .rec-item, .rate-badge)
 * instead of inventing a parallel style system.
 * ------------------------------------------------------------------
 */
window.DashboardReportPreview = (function(){

  /**
   * createReportPreview(deps) — deps:
   *   overlayId, closeBtnId, bodyId, generatedLabelId: DOM ids (see index.html)
   *   t, esc, fmtNum, fmtCurrency, rateClass: i18n/formatting helpers
   *   charts: a DashboardCharts.createCharts(...) instance (Phase 3) — the
   *     SAME chart-drawing functions the main dashboard uses, reused here
   *     rather than re-implemented for the report.
   */
  function createReportPreview(deps){
    const { overlayId, closeBtnId, bodyId, generatedLabelId, t, esc, fmtNum, fmtCurrency, rateClass, charts } = deps;
    const overlay = document.getElementById(overlayId);
    const body = document.getElementById(bodyId);
    const generatedLabel = document.getElementById(generatedLabelId);
    let open = false;
    let lastData = null;

    function scopeRow(label, value){
      return `<div class="report-scope-item"><span class="report-scope-label">${esc(label)}</span><span class="report-scope-value">${esc(value)}</span></div>`;
    }

    function renderScope(scope){
      return `<div class="report-section">
        <div class="report-section-title">${esc(t('reportScopeTitle'))}</div>
        <div class="report-scope-grid">
          ${scopeRow(t('periodLabel'), scope.period)}
          ${scopeRow(t('cityLabel'), scope.city)}
          ${scopeRow(t('branchFilterLabel'), scope.branch)}
          ${scopeRow(t('areaFilterLabel'), scope.area)}
          ${scopeRow(t('statusLabel'), scope.requestStatus)}
          ${scopeRow(t('requestTypeLabel'), scope.requestType)}
          ${scopeRow(t('driverFilterLabel'), scope.driver)}
          ${scopeRow(t('merchantFilterLabel'), scope.client)}
          ${scopeRow(t('reasonFilterLabel'), scope.reason)}
          ${scopeRow(t('extraFeesFilterLabel'), scope.extraFees)}
          ${scopeRow(t('searchSectionLabel'), scope.search)}
        </div>
      </div>`;
    }

    function renderSummary(summary){
      const cards = [
        [t('kpiTotalRequests'), summary.totalRequestsLabel],
        [t('kpiCompleted'), summary.successfulRequestsLabel],
        [t('kpiFailed'), summary.failedRequestsLabel],
        [t('kpiSuccessRate'), summary.successRateLabel],
        [t('kpiExtraFees'), summary.totalExtraFeesLabel]
      ];
      return `<div class="report-section">
        <div class="report-section-title">${esc(t('reportExecutiveSummary'))}</div>
        <div class="report-summary-layout">
          <div class="report-kpis">
            ${cards.map(([label,val])=>`<div class="report-kpi"><div class="report-kpi-label">${esc(label)}</div><div class="report-kpi-value">${esc(val)}</div></div>`).join('')}
          </div>
          <div class="report-donut-block">
            <div class="chart-box report-donut" id="reportSummaryDonut"></div>
            <div class="chart-legend" id="reportSummaryDonutLegend"></div>
          </div>
        </div>
      </div>`;
    }

    function table(headers, rows){
      if(rows.length===0) return `<div class="empty-state">${esc(t('reportNone'))}</div>`;
      return `<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
    }

    function renderPerformance(perf){
      const top = (arr,n)=>arr.slice(0,n);
      const cityRows = top(perf.cities,5).map(c=>`<tr><td>${esc(c.name)}</td><td class="num">${fmtNum(c.total)}</td><td class="num"><span class="rate-badge ${rateClass(c.successRate)}">${c.successRate.toFixed(0)}%</span></td><td class="num">${fmtCurrency(c.fees)}</td></tr>`);
      const areaRows = top(perf.areas,5).map(a=>`<tr><td>${esc(a.name)}</td><td>${esc(a.city)}</td><td class="num">${fmtNum(a.total)}</td><td class="num"><span class="rate-badge ${rateClass(a.successRate)}">${a.successRate.toFixed(0)}%</span></td></tr>`);
      const driverRows = top(perf.drivers,5).map(d=>`<tr><td>${esc(d.name)}</td><td class="num">${fmtNum(d.total)}</td><td class="num"><span class="rate-badge ${rateClass(d.successRate)}">${d.successRate.toFixed(0)}%</span></td></tr>`);
      const statusRows = perf.statuses.map(s=>`<tr><td>${esc(s.name)}</td><td class="num">${fmtNum(s.total)}</td><td class="num">${s.share.toFixed(1)}%</td></tr>`);
      const typeRows = perf.requestTypes.map(tp=>`<tr><td>${esc(tp.name)}</td><td class="num">${fmtNum(tp.total)}</td><td class="num">${tp.share.toFixed(1)}%</td></tr>`);

      return `<div class="report-section">
        <div class="report-section-title">${esc(t('reportPerformanceAnalysis'))}</div>
        <div class="report-grid-2">
          <div class="panel"><div class="panel-head"><div class="panel-title">${esc(t('reportCityPerformance'))}</div></div>
            <div class="chart-box" id="reportCityChart"></div>
            <div class="chart-legend"><span><i style="background:#0F7A6C"></i><span>${esc(t('doneLegend'))}</span></span><span><i style="background:#C1432E"></i><span>${esc(t('failLegend'))}</span></span></div>
            ${table([t('cityLabel'),t('requestsHeader'),t('successHeader'),t('extraFeesHeader')], cityRows)}</div>
          <div class="panel"><div class="panel-head"><div class="panel-title">${esc(t('reportAreaPerformance'))}</div></div>${table([t('areaFilterLabel'),t('cityLabel'),t('requestsHeader'),t('successHeader')], areaRows)}</div>
          <div class="panel"><div class="panel-head"><div class="panel-title">${esc(t('reportDriverPerformance'))}</div></div>${table([t('driverFilterLabel'),t('requestsHeader'),t('successHeader')], driverRows)}</div>
          <div class="panel"><div class="panel-head"><div class="panel-title">${esc(t('reportStatusBreakdown'))}</div></div>${table([t('statusLabel'),t('requestsHeader'),'%'], statusRows)}</div>
          <div class="panel"><div class="panel-head"><div class="panel-title">${esc(t('reportTypeBreakdown'))}</div></div>
            <div class="report-donut-block"><div class="chart-box report-donut" id="reportTypeChart"></div><div class="chart-legend" id="reportTypeChartLegend"></div></div>
            ${table([t('requestTypeLabel'),t('requestsHeader'),'%'], typeRows)}</div>
          <div class="panel"><div class="panel-head"><div class="panel-title">${esc(t('reportReasonBreakdown'))}</div></div>
            <div class="chart-box" id="reportReasonChart"></div></div>
        </div>
      </div>`;
    }

    function renderAttention(items){
      const body = items.length===0
        ? `<div class="empty-state">${esc(t('reportNoAttentionItems'))}</div>`
        : items.map((it,i)=>`<div class="report-attention-item"><span class="report-attention-idx">${i+1}</span><div><div class="report-attention-label">${esc(it.label)}</div><div class="report-attention-detail">${esc(it.detail)}</div></div></div>`).join('');
      return `<div class="report-section">
        <div class="report-section-title">${esc(t('reportManagementAttention'))}</div>
        ${body}
      </div>`;
    }

    function renderInsightsRecs(insights, recommendations){
      const insightsHtml = insights.map(c=>`<div class="insight-card"><div class="insight-tag">${esc(c.tag)}</div><div class="insight-main">${c.main}</div><div class="insight-sub">${esc(c.sub)}</div></div>`).join('');
      const recsHtml = recommendations.length===0
        ? `<div class="empty-state">${esc(t('notEnoughRecs'))}</div>`
        : recommendations.map(txt=>`<div class="rec-item"><div class="rec-text">${txt}</div></div>`).join('');
      return `<div class="report-section">
        <div class="report-section-title">${esc(t('reportInsightsRecommendations'))}</div>
        <div class="insight-row report-insight-row">${insightsHtml}</div>
        <div class="rec-list report-rec-list">${recsHtml}</div>
      </div>`;
    }

    function renderDetailedTables(perf){
      const cityRows = perf.cities.map(c=>`<tr><td>${esc(c.name)}</td><td class="num">${fmtNum(c.total)}</td><td class="num">${fmtNum(c.done)}</td><td class="num">${fmtNum(c.fail)}</td><td class="num"><span class="rate-badge ${rateClass(c.successRate)}">${c.successRate.toFixed(1)}%</span></td><td class="num">${fmtCurrency(c.fees)}</td></tr>`);
      const areaRows = perf.areas.map(a=>`<tr><td>${esc(a.name)}</td><td>${esc(a.city)}</td><td class="num">${fmtNum(a.total)}</td><td class="num"><span class="rate-badge ${rateClass(a.successRate)}">${a.successRate.toFixed(1)}%</span></td><td class="num">${fmtCurrency(a.fees)}</td></tr>`);
      const driverRows = perf.drivers.map(d=>`<tr><td>${esc(d.name)}</td><td class="num">${fmtNum(d.total)}</td><td class="num"><span class="rate-badge ${rateClass(d.successRate)}">${d.successRate.toFixed(1)}%</span></td><td class="num">${fmtCurrency(d.fees)}</td></tr>`);
      const reasonRows = perf.reasons.map(r=>`<tr><td>${esc(r.name)}</td><td class="num">${fmtNum(r.total)}</td><td class="num">${r.share.toFixed(1)}%</td></tr>`);

      return `<div class="report-section">
        <div class="report-section-title">${esc(t('reportDetailedTables'))}</div>
        <div class="panel"><div class="panel-head"><div class="panel-title">${esc(t('reportCityPerformance'))}</div></div>${table([t('cityLabel'),t('requestsHeader'),t('doneLegend'),t('failLegend'),t('successHeader'),t('extraFeesHeader')], cityRows)}</div>
        <div class="panel"><div class="panel-head"><div class="panel-title">${esc(t('reportAreaPerformance'))}</div></div>${table([t('areaFilterLabel'),t('cityLabel'),t('requestsHeader'),t('successHeader'),t('extraFeesHeader')], areaRows)}</div>
        <div class="panel"><div class="panel-head"><div class="panel-title">${esc(t('reportDriverPerformance'))}</div></div>${table([t('driverFilterLabel'),t('requestsHeader'),t('successHeader'),t('extraFeesHeader')], driverRows)}</div>
        <div class="panel"><div class="panel-head"><div class="panel-title">${esc(t('reportReasonBreakdown'))}</div></div>${table([t('reasonFilterLabel'),t('requestsHeader'),'%'], reasonRows)}</div>
      </div>`;
    }

    // Phase 2: pct is a raw number or null (comparison.js never returns
    // NaN/Infinity) — this only turns it into a display string.
    function pctLabel(p){ return p===null ? t('reportNA') : (p>=0?'+':'')+p.toFixed(1)+'%'; }
    function onlyInBadge(onlyIn){
      if(onlyIn==='current') return `<span class="comparison-onlyin-badge">${esc(t('comparisonOnlyInCurrent'))}</span>`;
      if(onlyIn==='previous') return `<span class="comparison-onlyin-badge">${esc(t('comparisonOnlyInPrevious'))}</span>`;
      return '';
    }
    function arrowFor(dir){ return dir==='improved' ? '↑' : dir==='declined' ? '↓' : '→'; }

    function renderComparisonSection(cmp){
      if(!cmp) return '';
      const kpiCards = cmp.kpis.map(k=>`
        <div class="comparison-kpi">
          <div class="comparison-kpi-label">${esc(k.label)}</div>
          <div class="comparison-kpi-values"><span class="comparison-kpi-current">${k.currentLabel}</span><span class="comparison-kpi-previous">${esc(t('comparisonPreviousCol'))}: ${k.previousLabel}</span></div>
          <div class="comparison-kpi-change ${k.direction}">${arrowFor(k.direction)} ${k.changeLabel} (${k.pctLabel})</div>
        </div>`).join('');

      const dimTable = (title, rows, cols) => rows.length===0
        ? `<div class="panel"><div class="panel-head"><div class="panel-title">${esc(title)}</div></div><div class="empty-state">${esc(t('comparisonNoData'))}</div></div>`
        : `<div class="panel"><div class="panel-head"><div class="panel-title">${esc(title)}</div></div><div class="comparison-table-scroll">${table(cols, rows)}</div></div>`;

      const cityRows = cmp.cities.map(c=>`<tr><td>${esc(c.name)}${onlyInBadge(c.onlyIn)}</td><td class="num">${fmtNum(c.current)}</td><td class="num">${fmtNum(c.previous)}</td><td class="num">${c.change>=0?'+':''}${fmtNum(c.change)}</td><td class="num">${pctLabel(c.pct)}</td></tr>`);
      const areaRows = cmp.areas.map(a=>`<tr><td>${esc(a.name)}${onlyInBadge(a.onlyIn)}</td><td class="num">${fmtNum(a.current)}</td><td class="num">${fmtNum(a.previous)}</td><td class="num">${a.change>=0?'+':''}${fmtNum(a.change)}</td><td class="num">${pctLabel(a.pct)}</td></tr>`);
      const driverRows = cmp.drivers.map(d=>`<tr><td>${esc(d.name)}${onlyInBadge(d.onlyIn)}</td><td class="num">${fmtNum(d.current)}</td><td class="num">${fmtNum(d.previous)}</td>
        <td class="num">${d.currentRate===null?`<span class="comparison-badge-insufficient">${esc(t('comparisonInsufficientVolume'))}</span>`:d.currentRate.toFixed(1)+'%'}</td>
        <td class="num">${d.previousRate===null?`<span class="comparison-badge-insufficient">${esc(t('comparisonInsufficientVolume'))}</span>`:d.previousRate.toFixed(1)+'%'}</td>
        <td class="num">${d.rateChange===null?'—':(d.rateChange>=0?'+':'')+d.rateChange.toFixed(1)+' pts'}</td></tr>`);
      const reasonRows = cmp.reasons.map(r=>`<tr><td>${esc(r.name)}${onlyInBadge(r.onlyIn)}</td><td class="num">${fmtNum(r.current)}</td><td class="num">${fmtNum(r.previous)}</td><td class="num">${r.change>=0?'+':''}${fmtNum(r.change)}</td><td class="num">${pctLabel(r.pct)}</td></tr>`);
      const typeRows = cmp.requestTypes.map(tp=>`<tr><td>${esc(tp.name)}${onlyInBadge(tp.onlyIn)}</td><td class="num">${fmtNum(tp.current)}</td><td class="num">${fmtNum(tp.previous)}</td><td class="num">${tp.change>=0?'+':''}${fmtNum(tp.change)}</td><td class="num">${pctLabel(tp.pct)}</td></tr>`);

      const insightsHtml = cmp.insights.length===0 ? `<div class="empty-state">${esc(t('comparisonNoData'))}</div>` :
        `<div class="comparison-insight-list">${cmp.insights.map(txt=>`<div class="comparison-insight-item">${txt}</div>`).join('')}</div>`;

      return `<div class="report-section">
        <div class="report-section-title">${esc(t('comparisonSummaryTitle'))}</div>
        <div class="report-scope-item" style="margin-bottom:14px;"><span class="report-scope-label">${esc(t('comparisonCurrentPeriod'))} ${esc(t('comparisonLabel'))} ${esc(t('comparisonComparePeriod'))}</span><span class="report-scope-value">${esc(cmp.periodALabel)} vs ${esc(cmp.periodBLabel)}</span></div>
        <div class="comparison-kpis" style="margin-bottom:14px;">${kpiCards}</div>
        <div class="panel">
          <div class="panel-head"><div class="panel-title">${esc(t('comparisonKpiTitle'))}</div></div>
          <div class="chart-box" id="reportCmpKpiChart"></div>
          <div class="chart-legend"><span><i style="background:#101B30"></i><span>${esc(t('comparisonCurrentCol'))}</span></span><span><i style="background:#C8912B"></i><span>${esc(t('comparisonPreviousCol'))}</span></span></div>
        </div>
        ${dimTable(t('comparisonCityTitle'), cityRows, [t('cityLabel'), t('comparisonCurrentCol'), t('comparisonPreviousCol'), t('comparisonChangeCol'), t('comparisonChangePctCol')])}
        <div class="panel">
          <div class="panel-head"><div class="panel-title">${esc(t('comparisonChangePctCol'))} — ${esc(t('comparisonCityTitle'))}</div></div>
          <div class="chart-box" id="reportCmpCityChart"></div>
          <div class="chart-legend"><span><i style="background:#0F7A6C"></i><span>${esc(t('comparisonImproved'))}</span></span><span><i style="background:#C1432E"></i><span>${esc(t('comparisonDeclined'))}</span></span></div>
        </div>
        ${dimTable(t('comparisonAreaTitle'), areaRows, [t('areaFilterLabel'), t('comparisonCurrentCol'), t('comparisonPreviousCol'), t('comparisonChangeCol'), t('comparisonChangePctCol')])}
        ${dimTable(t('comparisonDriverTitle'), driverRows, [t('driverFilterLabel'), t('comparisonCurrentCol'), t('comparisonPreviousCol'), t('kpiSuccessRate')+' ('+t('comparisonCurrentCol')+')', t('kpiSuccessRate')+' ('+t('comparisonPreviousCol')+')', t('comparisonChangeCol')])}
        ${dimTable(t('comparisonReasonTitle'), reasonRows, [t('reasonFilterLabel'), t('comparisonCurrentCol'), t('comparisonPreviousCol'), t('comparisonChangeCol'), t('comparisonChangePctCol')])}
        ${dimTable(t('comparisonTypeTitle'), typeRows, [t('requestTypeLabel'), t('comparisonCurrentCol'), t('comparisonPreviousCol'), t('comparisonChangeCol'), t('comparisonChangePctCol')])}
        <div class="panel"><div class="panel-head"><div class="panel-title">${esc(t('comparisonInsightsTitle'))}</div></div>${insightsHtml}</div>
      </div>`;
    }

    // Phase 3: populates every chart container with the SAME chart-drawing
    // functions the main dashboard uses (see charts.js) — must run AFTER
    // body.innerHTML is set, since these functions manipulate real DOM
    // nodes via getElementById/appendChild, not string templates. Every
    // labels/values array here is a direct reshaping of numbers reportData.js
    // (and comparison.js, for the comparison charts) already computed —
    // no new aggregation or filtering happens in this function.
    const TYPE_COLORS = ['#C8912B','#0F7A6C','#101B30','#C1432E'];
    function renderCharts(data){
      if(!charts) return;

      // Executive Summary: Done vs Fail donut
      if(document.getElementById('reportSummaryDonut')){
        charts.renderDonut('reportSummaryDonut', 'reportSummaryDonutLegend',
          [t('doneLegend'), t('failLegend')],
          [data.summary.successfulRequests, data.summary.failedRequests],
          ['#0F7A6C', '#C1432E']);
      }

      // Performance Analysis: City done/fail stacked bar (top 8 by volume)
      if(document.getElementById('reportCityChart')){
        const topCities = data.performance.cities.slice(0,8);
        charts.renderHStackedBar('reportCityChart', topCities.map(c=>c.name), topCities.map(c=>c.done), topCities.map(c=>c.fail));
      }
      // Request Type donut
      if(document.getElementById('reportTypeChart')){
        const types = data.performance.requestTypes;
        charts.renderDonut('reportTypeChart', 'reportTypeChartLegend', types.map(tp=>tp.name), types.map(tp=>tp.total), TYPE_COLORS);
      }
      // Failure reasons — top 8 by volume
      if(document.getElementById('reportReasonChart')){
        const topReasons = data.performance.reasons.slice(0,8);
        charts.renderHBar('reportReasonChart', topReasons.map(r=>r.name), topReasons.map(r=>r.total), '#C1432E');
      }

      // Comparison (only present when Comparison Mode is on)
      if(data.comparison){
        if(document.getElementById('reportCmpKpiChart')){
          const countKpis = data.comparison.kpis.filter(k=>['totalRequests','successfulRequests','failedRequests'].includes(k.key));
          charts.renderGroupedBar('reportCmpKpiChart', countKpis.map(k=>k.label), countKpis.map(k=>k.current), countKpis.map(k=>k.previous), '#101B30', '#C8912B');
        }
        if(document.getElementById('reportCmpCityChart')){
          const topChangeCities = data.comparison.cities.filter(c=>c.pct!==null).slice().sort((a,b)=>Math.abs(b.pct)-Math.abs(a.pct)).slice(0,10);
          charts.renderDivergingBar('reportCmpCityChart', topChangeCities.map(c=>c.name), topChangeCities.map(c=>c.pct), '#0F7A6C', '#C1432E');
        }
      }
    }

    function render(data){
      lastData = data;
      generatedLabel.textContent = t('reportGeneratedOn',{date: data.generatedAt.toLocaleString()});
      body.innerHTML = [
        renderScope(data.scope),
        renderSummary(data.summary),
        renderPerformance(data.performance),
        renderComparisonSection(data.comparison),
        renderAttention(data.attention),
        renderInsightsRecs(data.insights, data.recommendations),
        renderDetailedTables(data.performance)
      ].join('');
      renderCharts(data);
    }

    function show(data){
      render(data);
      overlay.classList.remove('hidden');
      document.body.classList.add('report-open');
      open = true;
    }
    function hide(){
      overlay.classList.add('hidden');
      document.body.classList.remove('report-open');
      open = false;
    }
    document.getElementById(closeBtnId).addEventListener('click', hide);
    overlay.addEventListener('click', (e)=>{ if(e.target===overlay) hide(); });
    // createReportPreview() runs again on every background data refresh
    // (initDashboard() re-runs); without removing the previous document-
    // level handler first, Escape-key listeners would accumulate forever.
    if(window.__reportPreviewKeydownHandler){
      document.removeEventListener('keydown', window.__reportPreviewKeydownHandler);
    }
    window.__reportPreviewKeydownHandler = (e)=>{ if(e.key==='Escape' && open) hide(); };
    document.addEventListener('keydown', window.__reportPreviewKeydownHandler);

    return {
      show,
      hide,
      isOpen: ()=>open,
      // Re-renders with fresh data if the report is currently open — so a
      // filter change while the report is on screen updates it live,
      // with no need to close and reopen.
      refreshIfOpen: (data)=>{ if(open) render(data); }
    };
  }

  return { createReportPreview };
})();
