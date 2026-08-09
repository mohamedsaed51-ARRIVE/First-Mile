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
   */
  function createReportPreview(deps){
    const { overlayId, closeBtnId, bodyId, generatedLabelId, t, esc, fmtNum, fmtCurrency, rateClass } = deps;
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
        <div class="report-kpis">
          ${cards.map(([label,val])=>`<div class="report-kpi"><div class="report-kpi-label">${esc(label)}</div><div class="report-kpi-value">${esc(val)}</div></div>`).join('')}
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
          <div class="panel"><div class="panel-head"><div class="panel-title">${esc(t('reportCityPerformance'))}</div></div>${table([t('cityLabel'),t('requestsHeader'),t('successHeader'),t('extraFeesHeader')], cityRows)}</div>
          <div class="panel"><div class="panel-head"><div class="panel-title">${esc(t('reportAreaPerformance'))}</div></div>${table([t('areaFilterLabel'),t('cityLabel'),t('requestsHeader'),t('successHeader')], areaRows)}</div>
          <div class="panel"><div class="panel-head"><div class="panel-title">${esc(t('reportDriverPerformance'))}</div></div>${table([t('driverFilterLabel'),t('requestsHeader'),t('successHeader')], driverRows)}</div>
          <div class="panel"><div class="panel-head"><div class="panel-title">${esc(t('reportStatusBreakdown'))}</div></div>${table([t('statusLabel'),t('requestsHeader'),'%'], statusRows)}</div>
          <div class="panel"><div class="panel-head"><div class="panel-title">${esc(t('reportTypeBreakdown'))}</div></div>${table([t('requestTypeLabel'),t('requestsHeader'),'%'], typeRows)}</div>
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

    function render(data){
      lastData = data;
      generatedLabel.textContent = t('reportGeneratedOn',{date: data.generatedAt.toLocaleString()});
      body.innerHTML = [
        renderScope(data.scope),
        renderSummary(data.summary),
        renderPerformance(data.performance),
        renderAttention(data.attention),
        renderInsightsRecs(data.insights, data.recommendations),
        renderDetailedTables(data.performance)
      ].join('');
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
