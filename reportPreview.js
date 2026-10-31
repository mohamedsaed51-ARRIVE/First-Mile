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
    const { overlayId, closeBtnId, bodyId, generatedLabelId, tabsId, titleId, requestData, t, esc, fmtNum, fmtCurrency, rateClass, charts } = deps;
    const REPORT_TYPES = DashboardReportAnalyticData.REPORT_TYPES;
    const typeDef = key => REPORT_TYPES.find(x=>x.key===key) || REPORT_TYPES[0];
    // آخر نوع تقرير مفتوح يبقى محفوظًا حتى بعد التحديث التلقائي للبيانات
    let currentType = window.__reportType || 'management';
    const SECTION_ICON = '';
    const overlay = document.getElementById(overlayId);
    const body = document.getElementById(bodyId);
    const generatedLabel = document.getElementById(generatedLabelId);
    let open = false;
    let lastData = null;

    // Phase 5: small display-only helpers, used by both the Executive
    // Summary (per-KPI delta chips) and the Comparison section further
    // down. Pure formatting over numbers/strings comparison.js already
    // computed — no new arithmetic.
    function pctLabel(p){ return p===null ? t('reportNA') : (p>=0?'+':'')+p.toFixed(1)+'%'; }
    function onlyInBadge(onlyIn){
      if(onlyIn==='current') return `<span class="comparison-onlyin-badge">${esc(t('comparisonOnlyInCurrent'))}</span>`;
      if(onlyIn==='previous') return `<span class="comparison-onlyin-badge">${esc(t('comparisonOnlyInPrevious'))}</span>`;
      return '';
    }
    function arrowFor(dir){ return dir==='improved' ? '↑' : dir==='declined' ? '↓' : '→'; }

    // تنسيق تاريخ الإنشاء: ISO ثابت (yyyy-mm-dd hh:mm) داخل عنصر LTR حتى لا ينقلب داخل النص العربي.
    function pad(n){ return String(n).padStart(2,'0'); }
    function fmtStamp(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
    function ltr(txt){ return `<span class="ltr">${esc(txt)}</span>`; }
    const NA = () => `<span class="rp-na">${esc(t('notInSource'))}</span>`;

    // رأس القسم المرقّم (SectionHeader): دائرة زرقاء + عنوان
    function sectionHeader(n, title){
      return `<div class="rp-sec-head"><span class="rp-sec-num">${n}</span><h2 class="rp-sec-title">${esc(title)}</h2></div>`;
    }

    // التقارير التحليلية (سائقين، تجار، أسباب فشل، رسوم، فروع)
    const analytic = DashboardReportAnalytic.create({ t, esc, fmtNum, fmtCurrency, rateClass, NA, charts, fmtStamp });

    // الغلاف: صفحة كاملة بالأزرق الرسمي والشعار الرسمي مباشرة (بدون تعديل)
    function renderCover(data){
      const cmp = data.comparison;
      const row = (label, valueHtml) => `<div class="rp-cover-row"><span class="rp-cover-label">${esc(label)}</span><span class="rp-cover-value">${valueHtml}</span></div>`;
      return `<section class="rp-cover">
        <div class="rp-cover-top"><img class="rp-cover-logo" src="brand/arrive-logo.png" alt="ARRIVE"><span class="rp-cover-tag">${esc(t('reportConfidential'))}</span></div>
        <div class="rp-cover-main">
          <div class="rp-cover-kicker">${esc(data.type==='management' || !data.type ? t('reportCoverKicker') : t('rtKicker'))}</div>
          <h1 class="rp-cover-title">${esc(data.type==='management' || !data.type ? t('reportCoverDocTitle') : t(typeDef(data.type).title))}</h1>
          <div class="rp-cover-rule"></div>
          <div class="rp-cover-meta">
            ${row(t('periodLabel'), esc(data.cover.periodLabel))}
            ${cmp ? row(t('reportCoverComparisonLabel'), `${esc(cmp.periodALabel)} ${esc(t('vsWord'))} ${esc(cmp.periodBLabel)}`) : ''}
            ${row(t('reportCoverScopeLabel'), esc(data.cover.scopeLine))}
            ${row(t('reportCoverGeneratedLabel'), ltr(fmtStamp(data.generatedAt)))}
          </div>
        </div>
        <div class="rp-cover-foot"><span>${esc(t('reportCoverBrand'))}</span></div>
      </section>`;
    }

    // Phase 5: KPI_KEY_MAP ties each Executive Summary card to the matching
    // comparison.js kpi (by the SAME `key` comparison.js already assigns —
    // see KPI_POLARITY in comparison.js). Used only to look up an
    // already-computed kpi object; no new comparison math happens here.
    const SUMMARY_KPI_KEYS = { totalRequests:'totalRequests', successfulRequests:'successfulRequests', failedRequests:'failedRequests', successRate:'successRate', totalExtraFees:'totalExtraFees' };

    function renderSummary(summary, comparison, mgmtLines, n){
      const findKpi = key => comparison ? comparison.kpis.find(k=>k.key===key) : null;
      const sharePct = v => (summary.totalRequests ? v/summary.totalRequests*100 : 0).toFixed(1)+'%';
      // كرتا المكتمل والفاشل: النسبة والعدد في نفس الكرت
      const countSub = v => `<div class="report-kpi-sub"><span class="ltr">${esc(fmtNum(v))}</span> ${esc(t('requestsHeader'))}</div>`;
      const cards = [
        `<div class="report-kpi tone-main"><div class="report-kpi-label">${esc(t('kpiTotalRequests'))}</div><div class="report-kpi-value">${esc(summary.totalRequestsLabel)}</div></div>`,
        `<div class="report-kpi tone-main"><div class="report-kpi-label">${esc(t('kpiTotalShipments'))}</div><div class="report-kpi-value">${esc(summary.totalShipmentsLabel)}</div></div>`,
        `<div class="report-kpi tone-good"><div class="report-kpi-label">${esc(t('rpMgmtCompletedCard'))}</div><div class="report-kpi-value">${esc(sharePct(summary.successfulRequests))}</div>${countSub(summary.successfulRequests)}</div>`,
        `<div class="report-kpi tone-bad"><div class="report-kpi-label">${esc(t('rpMgmtFailedCard'))}</div><div class="report-kpi-value">${esc(sharePct(summary.failedRequests))}</div>${countSub(summary.failedRequests)}</div>`
      ];
      return `<section class="rp-section rp-break">
        ${sectionHeader(n, t('reportSecSummary'))}
        <div class="rp-purpose"><div class="rp-purpose-title">${esc(t('rpPurposeTitle'))}</div><p>${esc(t('rpPurpose_management'))}</p></div>
        <div class="rp-mini-title rp-kpis-title">${esc(t('rpKpisTitle'))}</div>
        <div class="report-summary-layout">
          <div class="report-kpis report-kpis-2">${cards.join('')}</div>
          <div class="report-donut-block">
            <div class="rp-mini-title">${esc(t('reportSummaryDonutTitle'))}</div>
            <div class="chart-box report-donut" id="reportSummaryDonut"></div>
            <div class="chart-legend" id="reportSummaryDonutLegend"></div>
          </div>
        </div>
      </section>`;
    }

    function table(headers, rows){
      if(rows.length===0) return `<div class="empty-state">${esc(t('emptyFilters'))}</div>`;
      return `<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
    }

    const pctOf = (part, whole) => (whole ? part/whole*100 : 0).toFixed(1)+'%';
    const panel = (title, inner) => `<div class="panel"><div class="panel-head"><div class="panel-title">${esc(title)}</div></div>${inner}</div>`;

    // تحليل الأداء بالترتيب: (1) حالة الطلبات + نوعها (2) المناطق + السائقين (3) المدن
    function renderPerformance(perf, summary, n){
      const top = (arr,k)=>arr.slice(0,k);
      const statusRows = perf.statuses.map(s=>`<tr><td>${esc(s.name)}</td><td class="num">${fmtNum(s.total)}</td><td class="num">${s.share.toFixed(1)}%</td></tr>`);
      const typeRows = perf.requestTypes.map(tp=>`<tr><td>${esc(tp.name)}</td><td class="num">${fmtNum(tp.total)}</td><td class="num">${tp.share.toFixed(1)}%</td></tr>`);
      const areaRows = top(perf.areas,10).map(a=>`<tr><td>${esc(a.name)}</td><td>${esc(a.city)}</td><td class="num">${fmtNum(a.total)}</td><td class="num"><span class="rate-badge ${rateClass(a.successRate)}">${a.successRate.toFixed(1)}%</span></td></tr>`);
      const driverRows = top(perf.drivers,10).map(d=>`<tr><td>${esc(d.name)}</td><td class="num">${fmtNum(d.total)}</td><td class="num"><span class="rate-badge ${rateClass(d.successRate)}">${d.successRate.toFixed(1)}%</span></td></tr>`);
      const cityRows = perf.cities.map(c=>`<tr><td>${esc(c.name)}</td><td class="num">${fmtNum(c.total)}</td><td class="num">${fmtNum(c.done)} (${pctOf(c.done,c.total)})</td><td class="num">${fmtNum(c.fail)} (${pctOf(c.fail,c.total)})</td></tr>`);

      return `<section class="rp-section rp-break">
        ${sectionHeader(n, t('reportPerformanceAnalysis'))}
        <div class="report-grid-2 report-grid-flat">
          ${panel(t('reportStatusBreakdown'), table([t('statusLabel'),t('requestsHeader'),'%'], statusRows))}
          ${panel(t('reportTypeBreakdown'), `<div class="report-donut-block"><div class="chart-box report-donut" id="reportTypeChart"></div><div class="chart-legend" id="reportTypeChartLegend"></div></div>`+table([t('requestTypeLabel'),t('requestsHeader'),'%'], typeRows))}
          ${panel(t('reportAreaPerformance'), table([t('areaFilterLabel'),t('cityLabel'),t('requestsHeader'),t('successHeader')], areaRows))}
          ${panel(t('reportDriverPerformance'), table([t('driverFilterLabel'),t('requestsHeader'),t('successHeader')], driverRows))}
        </div>
          ${panel(t('reportCityPerformance'), `<div class="chart-box" id="reportCityChart"></div>
            <div class="chart-legend"><span><i style="background:${ArriveDS.color('done')}"></i><span>${esc(t('doneLegend'))}</span></span><span><i style="background:${ArriveDS.color('fail')}"></i><span>${esc(t('failLegend'))}</span></span></div>`
            + table([t('cityLabel'),t('rpOrdersTotalHeader'),t('rpCitySuccessHeader'),t('rpCityFailHeader')], cityRows))}
      </section>`;
    }

    // تحليل أسباب الفشل: نسبة الفشل من الإجمالي ← الأسباب ← أكثر الفروع/المناطق/المناديب فشلًا
    function renderFailureAnalysis(perf, summary, failure, n){
      const reasonRows = perf.reasons.map(r=>`<tr><td>${esc(r.name)}</td><td class="num">${fmtNum(r.total)}</td><td class="num">${r.share.toFixed(1)}%</td></tr>`);
      const failRows = (rows, withCity) => rows.map(r=>`<tr><td>${esc(r.name)}</td>${withCity?`<td>${esc(r.city||'')}</td>`:''}<td class="num">${fmtNum(r.total)}</td><td class="num">${fmtNum(r.fail)}</td><td class="num">${r.failRate.toFixed(1)}%</td></tr>`);
      const base = [t('requestsHeader'),t('rpFailCountHeader'),t('rpFailRateHeader')];
      return `<section class="rp-section rp-break">
        ${sectionHeader(n, t('reportFailureAnalysisTitle'))}
        <div class="report-kpis report-kpis-compact">
          <div class="report-kpi tone-bad"><div class="report-kpi-label">${esc(t('rpFailShareLabel'))}</div><div class="report-kpi-value">${esc(failure.failShare.toFixed(1)+'%')}</div><div class="report-kpi-sub"><span class="ltr">${esc(summary.failedRequestsLabel)}</span> / <span class="ltr">${esc(summary.totalRequestsLabel)}</span></div></div>
        </div>
        ${perf.topFailureReasons.length ? `<div class="rp-alert">${esc(t('reportFailureConcentrationLine',{pct: perf.failureConcentrationPct.toFixed(1)+'%'}))}</div>` : ''}
        ${panel(t('rpFailReasonsTitle'), `<div class="chart-box" id="reportReasonChart"></div>`+table([t('reasonFilterLabel'),t('requestsHeader'),'%'], reasonRows))}
        <div class="report-grid-2 report-grid-flat">
          ${panel(t('rpFailTopBranches'), table([t('rpBranchHeader'),...base], failRows(failure.byBranch,false)))}
          ${panel(t('rpFailTopAreas'), table([t('areaFilterLabel'),t('cityLabel'),...base], failRows(failure.byArea,true)))}
          ${panel(t('rpFailTopDrivers'), table([t('driverFilterLabel'),...base], failRows(failure.byDriver,false)))}
        </div>
      </section>`;
    }

    // تحليل العملاء: أكبر 10 بعدد الشحنات + أسوأ 10 بنسبة الفشل
    function renderCustomers(customers, n){
      const topRows = customers.top.map(c=>`<tr><td>${esc(c.name)}</td><td class="num">${fmtNum(c.reqs)}</td><td class="num">${c.reqShare.toFixed(1)}%</td><td class="num">${fmtNum(c.ships)}</td><td class="num">${c.shipShare.toFixed(1)}%</td></tr>`);
      const worstRows = customers.worst.map(c=>`<tr><td>${esc(c.name)}</td><td class="num">${fmtNum(c.reqs)}</td><td class="num">${c.reqShare.toFixed(1)}%</td><td class="num">${fmtNum(c.ships)}</td><td class="num">${c.shipShare.toFixed(1)}%</td><td class="num">${fmtNum(c.fail)}</td><td class="num"><span class="rate-badge rate-bad">${c.failRate.toFixed(1)}%</span></td></tr>`);
      const head = [t('rpCustomerHeader'),t('rpCustReqsHeader'),t('rpCustReqsPct'),t('rpCustShipsHeader'),t('rpCustShipsPct')];
      return `<section class="rp-section rp-break">
        ${sectionHeader(n, t('rpSecCustomers'))}
        ${panel(t('rpTopCustomers'), table(head, topRows))}
        ${panel(t('rpWorstCustomers'), table([...head,t('rpFailCountHeader'),t('rpFailRateHeader')], worstRows))}
        <p class="rp-lead">${esc(t('rpWorstCustomersNote',{n: customers.minVol}))}</p>
      </section>`;
    }

    // الملاحظات (FindingCard): الملاحظة ← الدليل ← الأثر ← المسؤول ← الموعد ← الحالة.
    // الحقول التي لا يوفرها المصدر تُعرض «غير محدد بالمصدر» ولا تُنشأ حالة افتراضية.
    // الخطورة «حرجة» تظهر فقط للمدن/المناطق/السائقين لأنها مشتقة من حد نسبة النجاح
    // المعتمد أصلًا (أقل من 75%)، وليس لباقي الأنواع.
    const RATE_KEYS = ['cities','areas','drivers'];
    function renderFindings(items, n){
      const field = (label, valueHtml) => `<div class="rp-fld"><span class="rp-fld-label">${esc(label)}</span><span class="rp-fld-value">${valueHtml}</span></div>`;
      const body = items.length===0
        ? `<div class="empty-state">${esc(t('reportNoAttentionItems'))}</div>`
        : items.map((it,i)=>`<article class="rp-finding">
            <header class="rp-finding-head"><span class="rp-finding-idx">${i+1}</span><h3 class="rp-finding-title">${esc(it.label)}</h3>${RATE_KEYS.includes(it.key)?`<span class="status-badge status-violation">${esc(t('sevCritical'))}</span>`:''}</header>
            <div class="rp-finding-body">
              ${field(t('fldEvidence'), esc(it.detail).replace(/(\([\d.,]+%\)|[\d.,]+%)/g,'<span class="ltr">$1</span>'))}
              <div class="rp-fld-grid">
                ${field(t('fldImpact'), NA())}
                ${field(t('fldRoot'), NA())}
                ${field(t('fldOwner'), NA())}
                ${field(t('fldDue'), NA())}
                ${field(t('fldStatus'), NA())}
              </div>
            </div>
          </article>`).join('');
      return `<section class="rp-section rp-break">
        ${sectionHeader(n, t('reportSecFindings'))}
        ${body}
      </section>`;
    }

    function renderKeyInsights(insights, n){
      const html = insights.length===0 ? `<div class="empty-state">${esc(t('emptyFilters'))}</div>`
        : insights.map(c=>`<div class="insight-card"><div class="insight-tag">${esc(c.tag)}</div><div class="insight-main">${c.main}</div><div class="insight-sub">${esc(c.sub)}</div></div>`).join('');
      return `<section class="rp-section">
        ${sectionHeader(n, t('reportSecInsights'))}
        <div class="insight-row report-insight-row">${html}</div>
      </section>`;
    }

    // جدول التوصيات: المشكلة | التأثير | الإجراء المطلوب | المسؤول | الأولوية | الحالة
    function renderRecommendations(recommendations, n){
      const rows = recommendations.rows || [];
      const body = rows.length===0
        ? `<div class="empty-state">${esc(t('notEnoughRecs'))}</div>`
        : `<table class="rp-rec-table"><thead><tr><th class="rp-c-idx">#</th><th>${esc(t('recColProblem'))}</th><th>${esc(t('recColImpact'))}</th><th>${esc(t('recColAction'))}</th><th>${esc(t('recColOwner'))}</th><th>${esc(t('recColPriority'))}</th><th>${esc(t('recColStatus'))}</th></tr></thead><tbody>${
            rows.map((r,i)=>`<tr><td class="rp-c-idx">${i+1}</td><td class="rp-c-text">${r.problem}</td><td>${NA()}</td><td class="rp-c-text">${r.action?esc(r.action):NA()}</td><td>${NA()}</td><td>${NA()}</td><td>${NA()}</td></tr>`).join('')
          }</tbody></table>`;
      return `<section class="rp-section">
        ${sectionHeader(n, t('reportSecRecs'))}
        ${body}
      </section>`;
    }

    function renderDetailedTables(perf, n){
      const cityRows = perf.cities.map(c=>`<tr><td>${esc(c.name)}</td><td class="num">${fmtNum(c.total)}</td><td class="num">${fmtNum(c.done)}</td><td class="num">${fmtNum(c.fail)}</td><td class="num"><span class="rate-badge ${rateClass(c.successRate)}">${c.successRate.toFixed(1)}%</span></td></tr>`);
      const areaRows = perf.areas.map(a=>`<tr><td>${esc(a.name)}</td><td>${esc(a.city)}</td><td class="num">${fmtNum(a.total)}</td><td class="num"><span class="rate-badge ${rateClass(a.successRate)}">${a.successRate.toFixed(1)}%</span></td></tr>`);
      const driverRows = perf.drivers.map(d=>`<tr><td>${esc(d.name)}</td><td class="num">${fmtNum(d.total)}</td><td class="num"><span class="rate-badge ${rateClass(d.successRate)}">${d.successRate.toFixed(1)}%</span></td></tr>`);
      const reasonRows = perf.reasons.map(r=>`<tr><td>${esc(r.name)}</td><td class="num">${fmtNum(r.total)}</td><td class="num">${r.share.toFixed(1)}%</td></tr>`);

      return `<section class="rp-section rp-break">
        ${sectionHeader(n, t('reportSecAppendix'))}
        <div class="panel"><div class="panel-head"><div class="panel-title">${esc(t('reportCityPerformance'))}</div></div>${table([t('cityLabel'),t('requestsHeader'),t('doneLegend'),t('failLegend'),t('successHeader')], cityRows)}</div>
        <div class="panel"><div class="panel-head"><div class="panel-title">${esc(t('reportAreaPerformance'))}</div></div>${table([t('areaFilterLabel'),t('cityLabel'),t('requestsHeader'),t('successHeader')], areaRows)}</div>
        <div class="panel"><div class="panel-head"><div class="panel-title">${esc(t('reportDriverPerformance'))}</div></div>${table([t('driverFilterLabel'),t('requestsHeader'),t('successHeader')], driverRows)}</div>
        <div class="panel"><div class="panel-head"><div class="panel-title">${esc(t('reportReasonBreakdown'))}</div></div>${table([t('reasonFilterLabel'),t('requestsHeader'),'%'], reasonRows)}</div>
      </section>`;
    }

    // صفحة الخاتمة
    function renderClosing(data, n){
      const sign = label => `<div class="rp-sign"><div class="rp-sign-line"></div><div class="rp-sign-label">${esc(label)}</div></div>`;
      return `<section class="rp-section rp-break rp-closing">
        ${sectionHeader(n, t('reportSecClosing'))}
        <p class="rp-lead">${esc(t('reportClosingLead'))}</p>
        <div class="rp-alert rp-alert-info">${esc(data.type && data.type!=='management' ? t('rtClosingTodo') : t('reportClosingTodo'))}</div>
        <div class="rp-signs">${sign(t('reportSignPrepared'))}${sign(t('reportSignReviewed'))}${sign(t('reportSignApproved'))}</div>
        <div class="rp-closing-foot">
          <div>${esc(t('reportDataSources'))}</div>
          <div>${esc(t('reportCoverBrand'))} · ${ltr(fmtStamp(data.generatedAt))}</div>
        </div>
      </section>`;
    }

    // Phase 2: pct is a raw number or null (comparison.js never returns
    // NaN/Infinity) — this only turns it into a display string.
    function renderComparisonSection(cmp, n){
      if(!cmp) return '';
      const kpiCards = cmp.kpis.map(k=>`
        <div class="comparison-kpi">
          <div class="comparison-kpi-label">${esc(k.label)}</div>
          <div class="comparison-kpi-values"><span class="comparison-kpi-current">${k.currentLabel}</span><span class="comparison-kpi-previous">${esc(t('comparisonPreviousCol'))}: ${k.previousLabel}</span></div>
          <div class="comparison-kpi-change ${k.direction}">${arrowFor(k.direction)} <span class="ltr">${k.changeLabel} (${k.pctLabel})</span></div>
        </div>`).join('');

      const dimTable = (title, rows, cols) => rows.length===0
        ? `<div class="panel"><div class="panel-head"><div class="panel-title">${esc(title)}</div></div><div class="empty-state">${esc(t('comparisonNoData'))}</div></div>`
        : `<div class="panel"><div class="panel-head"><div class="panel-title">${esc(title)}</div></div><div class="comparison-table-scroll">${table(cols, rows)}</div></div>`;

      const cityRows = cmp.cities.map(c=>`<tr><td>${esc(c.name)}${onlyInBadge(c.onlyIn)}</td><td class="num">${fmtNum(c.current)}</td><td class="num">${fmtNum(c.previous)}</td><td class="num">${c.change>=0?'+':''}${fmtNum(c.change)}</td><td class="num">${pctLabel(c.pct)}</td></tr>`);
      const areaRows = cmp.areas.map(a=>`<tr><td>${esc(a.name)}${onlyInBadge(a.onlyIn)}</td><td class="num">${fmtNum(a.current)}</td><td class="num">${fmtNum(a.previous)}</td><td class="num">${a.change>=0?'+':''}${fmtNum(a.change)}</td><td class="num">${pctLabel(a.pct)}</td></tr>`);
      const driverRows = cmp.drivers.map(d=>`<tr><td>${esc(d.name)}${onlyInBadge(d.onlyIn)}</td><td class="num">${fmtNum(d.current)}</td><td class="num">${fmtNum(d.previous)}</td>
        <td class="num">${d.currentRate===null?`<span class="comparison-badge-insufficient">${esc(t('comparisonInsufficientVolume'))}</span>`:d.currentRate.toFixed(1)+'%'}</td>
        <td class="num">${d.previousRate===null?`<span class="comparison-badge-insufficient">${esc(t('comparisonInsufficientVolume'))}</span>`:d.previousRate.toFixed(1)+'%'}</td>
        <td class="num">${d.rateChange===null?'—':(d.rateChange>=0?'+':'')+d.rateChange.toFixed(1)+' '+t('ptsUnit')}</td></tr>`);
      const reasonRows = cmp.reasons.map(r=>`<tr><td>${esc(r.name)}${onlyInBadge(r.onlyIn)}</td><td class="num">${fmtNum(r.current)}</td><td class="num">${fmtNum(r.previous)}</td><td class="num">${r.change>=0?'+':''}${fmtNum(r.change)}</td><td class="num">${pctLabel(r.pct)}</td></tr>`);
      const typeRows = cmp.requestTypes.map(tp=>`<tr><td>${esc(tp.name)}${onlyInBadge(tp.onlyIn)}</td><td class="num">${fmtNum(tp.current)}</td><td class="num">${fmtNum(tp.previous)}</td><td class="num">${tp.change>=0?'+':''}${fmtNum(tp.change)}</td><td class="num">${pctLabel(tp.pct)}</td></tr>`);

      const insightsHtml = cmp.insights.length===0 ? `<div class="empty-state">${esc(t('comparisonNoData'))}</div>` :
        `<div class="comparison-insight-list">${cmp.insights.map(txt=>`<div class="comparison-insight-item">${txt}</div>`).join('')}</div>`;

      return `<section class="rp-section rp-break">
        ${sectionHeader(n, t('comparisonSummaryTitle'))}
        <div class="report-scope-item" style="margin-bottom:14px;"><span class="report-scope-label">${esc(t('comparisonCurrentPeriod'))} ${esc(t('comparisonLabel'))} ${esc(t('comparisonComparePeriod'))}</span><span class="report-scope-value">${esc(cmp.periodALabel)} ${esc(t('vsWord'))} ${esc(cmp.periodBLabel)}</span></div>
        <div class="comparison-kpis" style="margin-bottom:14px;">${kpiCards}</div>
        <div class="panel">
          <div class="panel-head"><div class="panel-title">${esc(t('comparisonKpiTitle'))}</div></div>
          <div class="chart-box" id="reportCmpKpiChart"></div>
          <div class="chart-legend"><span><i style="background:${ArriveDS.color('series1')}"></i><span>${esc(t('comparisonCurrentCol'))}</span></span><span><i style="background:${ArriveDS.color('series4')}"></i><span>${esc(t('comparisonPreviousCol'))}</span></span></div>
        </div>
        ${dimTable(t('comparisonCityTitle'), cityRows, [t('cityLabel'), t('comparisonCurrentCol'), t('comparisonPreviousCol'), t('comparisonChangeCol'), t('comparisonChangePctCol')])}
        <div class="panel">
          <div class="panel-head"><div class="panel-title">${esc(t('comparisonChangePctCol'))} — ${esc(t('comparisonCityTitle'))}</div></div>
          <div class="chart-box" id="reportCmpCityChart"></div>
          <div class="chart-legend"><span><i style="background:${ArriveDS.color('done')}"></i><span>${esc(t('comparisonImproved'))}</span></span><span><i style="background:${ArriveDS.color('fail')}"></i><span>${esc(t('comparisonDeclined'))}</span></span></div>
        </div>
        ${dimTable(t('comparisonAreaTitle'), areaRows, [t('areaFilterLabel'), t('comparisonCurrentCol'), t('comparisonPreviousCol'), t('comparisonChangeCol'), t('comparisonChangePctCol')])}
        ${dimTable(t('comparisonDriverTitle'), driverRows, [t('driverFilterLabel'), t('comparisonCurrentCol'), t('comparisonPreviousCol'), t('kpiSuccessRate')+' ('+t('comparisonCurrentCol')+')', t('kpiSuccessRate')+' ('+t('comparisonPreviousCol')+')', t('comparisonChangeCol')])}
        ${dimTable(t('comparisonReasonTitle'), reasonRows, [t('reasonFilterLabel'), t('comparisonCurrentCol'), t('comparisonPreviousCol'), t('comparisonChangeCol'), t('comparisonChangePctCol')])}
        ${dimTable(t('comparisonTypeTitle'), typeRows, [t('requestTypeLabel'), t('comparisonCurrentCol'), t('comparisonPreviousCol'), t('comparisonChangeCol'), t('comparisonChangePctCol')])}
        <div class="panel"><div class="panel-head"><div class="panel-title">${esc(t('comparisonInsightsTitle'))}</div></div>${insightsHtml}</div>
      </section>`;
    }

    // Phase 3: populates every chart container with the SAME chart-drawing
    // functions the main dashboard uses (see charts.js) — must run AFTER
    // body.innerHTML is set, since these functions manipulate real DOM
    // nodes via getElementById/appendChild, not string templates. Every
    // labels/values array here is a direct reshaping of numbers reportData.js
    // (and comparison.js, for the comparison charts) already computed —
    // no new aggregation or filtering happens in this function.
    const TYPE_COLORS = ArriveDS.typeColors();
    function renderCharts(data){
      if(!charts) return;

      // Executive Summary: Done vs Fail donut
      if(document.getElementById('reportSummaryDonut')){
        charts.renderDonut('reportSummaryDonut', 'reportSummaryDonutLegend',
          [t('doneLegend'), t('failLegend')],
          [data.summary.successfulRequests, data.summary.failedRequests],
          [ArriveDS.color('done'), ArriveDS.color('fail')]);
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
        charts.renderHBar('reportReasonChart', topReasons.map(r=>r.name), topReasons.map(r=>r.total), ArriveDS.color('fail'));
      }

      // Comparison (only present when Comparison Mode is on)
      if(data.comparison){
        if(document.getElementById('reportCmpKpiChart')){
          const countKpis = data.comparison.kpis.filter(k=>['totalRequests','successfulRequests','failedRequests'].includes(k.key));
          charts.renderGroupedBar('reportCmpKpiChart', countKpis.map(k=>k.label), countKpis.map(k=>k.current), countKpis.map(k=>k.previous), ArriveDS.color('series1'), ArriveDS.color('series4'));
        }
        if(document.getElementById('reportCmpCityChart')){
          const topChangeCities = data.comparison.cities.filter(c=>c.pct!==null).slice().sort((a,b)=>Math.abs(b.pct)-Math.abs(a.pct)).slice(0,10);
          charts.renderDivergingBar('reportCmpCityChart', topChangeCities.map(c=>c.name), topChangeCities.map(c=>c.pct), ArriveDS.color('done'), ArriveDS.color('fail'));
        }
      }
    }

    // يُحقن @page بنصوص اللغة الحالية: رأس الصفحة وترقيم "صفحة X من Y" (الغلاف بلا هوامش ولا رأس).
    function applyPageStyle(){
      const def = typeDef(currentType);
      const printTitle = def.print ? t(def.print) : 'ARRIVE — ' + t(def.title);
      let st = document.getElementById('reportPageStyle');
      if(!st){ st = document.createElement('style'); st.id = 'reportPageStyle'; document.head.appendChild(st); }
      const q = txt => '"' + String(txt).replace(/\\/g,'\\\\').replace(/"/g,'\\"') + '"';
      st.textContent = `
        @page{ @top-center{ content:${q(printTitle)}; } @bottom-center{ content:${q(t('reportPage'))} " " counter(page) " " ${q(t('reportOf'))} " " counter(pages); } }
        @page cover{ @top-center{ content:none; } @bottom-center{ content:none; } }`;
    }

    // تبويبات أنواع التقارير داخل رأس النافذة (تُعاد كتابتها عند كل عرض لتتبع اللغة)
    function renderTabs(){
      const el = document.getElementById(tabsId);
      if(!el) return;
      el.setAttribute('aria-label', t('rtTabsAria'));
      el.innerHTML = REPORT_TYPES.map(def=>`<button type="button" role="tab" class="report-tab" data-report-type="${def.key}" aria-selected="${def.key===currentType}">${esc(t(def.tab))}</button>`).join('');
    }
    function renderAnalyticReport(data){
      return analytic.renderBrief(data, typeDef(currentType).title);
    }
    function renderManagementReport(data){
      let n = 0;
      const next = ()=> ++n;
      return [
        renderCover(data),
        renderSummary(data.summary, data.comparison, data.managementMessage, next()),
        renderPerformance(data.performance, data.summary, next()),
        renderFailureAnalysis(data.performance, data.summary, data.failure, next()),
        renderCustomers(data.customers, next()),
        data.comparison ? renderComparisonSection(data.comparison, next()) : '',
        renderFindings(data.attention, next()),
        renderKeyInsights(data.insights, next()),
        renderRecommendations(data.recommendations, next()),
        renderDetailedTables(data.performance, next()),
        renderClosing(data, next())
      ].join('');
    }

    function render(data){
      lastData = data;
      currentType = data.type || 'management';
      window.__reportType = currentType;
      generatedLabel.textContent = t('reportGeneratedOn',{date: fmtStamp(data.generatedAt)});
      const titleEl = document.getElementById(titleId);
      if(titleEl) titleEl.textContent = t(typeDef(currentType).title);
      renderTabs();
      body.classList.toggle('rp-an', currentType!=='management');
      body.innerHTML = currentType==='management' ? renderManagementReport(data) : renderAnalyticReport(data);
      applyPageStyle();
      if(currentType==='management') renderCharts(data); else analytic.draw(data);
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
    const tabsEl = document.getElementById(tabsId);
    if(tabsEl) tabsEl.addEventListener('click', (e)=>{
      const btn = e.target.closest('[data-report-type]');
      if(!btn || !requestData) return;
      const type = btn.getAttribute('data-report-type');
      if(type===currentType) return;
      render(requestData(type));
      overlay.scrollTo(0,0);
    });
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
      refreshIfOpen: (data)=>{ if(open) render(data); },
      // Phase 4: read-only accessor for the export/print pipeline — returns
      // the exact same data object last passed to render() (built by
      // buildManagementReportData). No recomputation happens here.
      getLastData: ()=>lastData,
      getType: ()=>currentType
    };
  }

  return { createReportPreview };
})();
