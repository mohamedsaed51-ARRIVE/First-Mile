/**
 * reportAnalytic.js — ARRIVE First Mile Dashboard
 * ------------------------------------------------------------------
 * عرض (HTML) «التقارير التحليلية» الخمسة من البيانات الجاهزة التي
 * يبنيها reportAnalyticData.js. لا فلترة ولا تجميع هنا: كل رقم يصل
 * جاهزًا ويُنسَّق فقط.
 *
 * يعيد استعمال نفس مكونات التصميم المعتمدة في تقرير الإدارة:
 * SectionHeader (رأس مرقّم)، KPI، Panel، DataTable (مع صف الإجمالي
 * الاختياري في tfoot)، rate-badge، الرسوم البيانية من charts.js.
 * ------------------------------------------------------------------
 */
window.DashboardReportAnalytic = (function(){

  function create(h){
    const { t, esc, fmtNum, fmtCurrency, rateClass, sectionHeader, NA, charts } = h;
    const DS = window.ArriveDS;

    // ---------- أدوات صغيرة مشتركة ----------
    const p1 = n => n.toFixed(1)+'%';
    const panel = (title, inner, note) => `<div class="panel"><div class="panel-head"><div class="panel-title">${esc(title)}</div></div>${inner}${note?`<div class="rp-foot-note">${note}</div>`:''}</div>`;
    const chartBox = (id, hasData) => hasData ? `<div class="chart-box" id="${id}"></div>` : `<div class="empty-state">${esc(t('emptyFilters'))}</div>`;
    const legendDoneFail = () => `<div class="chart-legend"><span><i style="background:${DS.color('done')}"></i><span>${esc(t('doneLegend'))}</span></span><span><i style="background:${DS.color('fail')}"></i><span>${esc(t('failLegend'))}</span></span></div>`;
    const short = (s, n) => s.length>n ? s.slice(0,n-2)+'…' : s;

    // جدول: ranked=true يضيف عمود الترتيب ويطبّق تنسيقه. foot = صف الإجمالي الاختياري (يأتي من البيانات وليس ضمن الصفوف).
    function tbl(headers, rows, foot, opts){
      if(!rows.length) return `<div class="empty-state">${esc(t('emptyFilters'))}</div>`;
      const cls = (opts && opts.ranked ? 'rp-rank-table ' : '') + (opts && opts.cls ? opts.cls : '');
      return `<table class="${cls.trim()}"><thead><tr>${headers.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody>${foot?`<tfoot>${foot}</tfoot>`:''}</table>`;
    }
    // نسبة النجاح: شارة ملوّنة (لون + أيقونة + رقم) للمؤهّل فقط؛ غير المؤهّل رقم محايد بلا حكم
    const rateCell = (rate, ok) => ok===false
      ? `<span class="rp-plain-rate">${p1(rate)}</span>`
      : `<span class="rate-badge ${rateClass(rate)}">${p1(rate)}</span>`;
    const reasonCell = name => name ? esc(name) : NA();
    const totalLabel = () => esc(t('rtTotal'));

    // ======================================================================
    // الملخص (مؤشرات + أهم النقاط)
    // ======================================================================
    function renderSummary(data, n){
      const cards = data.kpis.map(k=>{
        const isText = String(k.value).length > 14;
        return `<div class="report-kpi tone-${k.tone}"><div class="report-kpi-label">${esc(k.label)}</div><div class="report-kpi-value${isText?' is-text':''}">${esc(k.value)}</div></div>`;
      }).join('');
      const points = data.keyPoints.length
        ? `<div class="rp-callout"><div class="rp-callout-title">${esc(t('rtKeyPointsTitle'))}</div><ul class="rp-callout-list">${data.keyPoints.map(l=>`<li>${l}</li>`).join('')}</ul></div>`
        : `<div class="empty-state">${esc(t('emptyFilters'))}</div>`;
      // تقرير السائقين: دائرة توزيع نسب النجاح بجوار المؤشرات (نفس تخطيط ملخص تقرير الإدارة)
      const donut = data.type==='drivers'
        ? `<div class="report-donut-block"><div class="rp-mini-title">${esc(t('rtDrvBandsChart'))}</div><div class="chart-box report-donut" id="rpChartB"></div><div class="chart-legend" id="rpChartBLegend"></div></div>` : '';
      const note = data.type==='drivers' ? `<div class="rp-foot-note">${esc(t('rtDrvBandsNote',{n:data.body.minVolume}))}</div>` : '';
      return `<section class="rp-section rp-break">
        ${sectionHeader(n, t('reportSecSummary'))}
        ${points}
        <div class="report-summary-layout"><div class="report-kpis rp-kpis-auto">${cards}</div>${donut}</div>
        ${note}
      </section>`;
    }

    // ======================================================================
    // السائقين
    // ======================================================================
    function drivers(data, next){
      const b = data.body;
      const rankTbl = (list, title) => panel(title, tbl(
        ['#', t('driverFilterLabel'), t('requestsHeader'), t('successHeader')],
        list.map((d,i)=>`<tr><td>${i+1}</td><td>${esc(d.name)}</td><td class="num">${fmtNum(d.count)}</td><td class="num">${rateCell(d.rate)}</td></tr>`),
        null, {ranked:true}));
      const sec1 = `<section class="rp-section rp-break">
        ${sectionHeader(next(), t('rtDrvSecRanking'))}
        ${panel(t('rtDrvVolumeChart',{n:b.volumeTop.length}), chartBox('rpChartA', b.volumeTop.length>0))}
        <div class="rp-grid-2 rp-grid-keep">
          ${rankTbl(b.top, t('rtDrvTopTitle'))}
          ${rankTbl(b.bottom, t('rtDrvBottomTitle'))}
        </div>
        <div class="rp-foot-note">${esc(t('rtDrvRankNote',{n:b.minVolume}))}</div>
      </section>`;
      const foot = `<tr><td colspan="3">${totalLabel()}</td><td class="num">${fmtNum(b.totals.total)}</td><td class="num">${fmtNum(b.totals.done)}</td><td class="num">${fmtNum(b.totals.fail)}</td><td class="num">${rateCell(b.totals.rate)}</td><td class="num">${fmtNum(b.totals.fees)}</td></tr>`;
      const sec2 = `<section class="rp-section rp-break">
        ${sectionHeader(next(), t('rtDrvSecFull'))}
        ${tbl(['#', t('driverFilterLabel'), t('rtColBranch'), t('requestsHeader'), t('doneLegend'), t('failLegend'), t('successHeader'), t('extraFeesHeader')],
          b.rows.map(r=>`<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td>${r.branch?esc(r.branch):NA()}</td><td class="num">${fmtNum(r.total)}</td><td class="num">${fmtNum(r.done)}</td><td class="num">${fmtNum(r.fail)}</td><td class="num">${rateCell(r.rate, r.qualified)}</td><td class="num">${fmtNum(r.fees)}</td></tr>`),
          foot, {ranked:true})}
        <div class="rp-foot-note">${esc(t('rtDrvFullNote',{n:b.minVolume}))}</div>
      </section>`;
      return sec1 + sec2;
    }
    function drawDrivers(data){
      const b = data.body;
      if(document.getElementById('rpChartA')) charts.renderHBar('rpChartA', b.volumeTop.map(r=>short(r.name,26)), b.volumeTop.map(r=>r.total), DS.color('blue'));
      if(document.getElementById('rpChartB')){
        const labels = [t('rtBandGood'), t('rtBandMid'), t('rtBandBad')];
        const vals = [b.bands.good, b.bands.mid, b.bands.bad];
        if(vals.some(v=>v>0)) charts.renderDonut('rpChartB', 'rpChartBLegend', labels, vals, [DS.color('success'), DS.color('action'), DS.color('violation')], t('rtUnitCouriers'));
        else document.getElementById('rpChartB').innerHTML = `<div class="empty-state">${esc(t('reportNoQualifyingData'))}</div>`;
      }
    }

    // ======================================================================
    // التجار
    // ======================================================================
    function merchants(data, next){
      const b = data.body;
      const sec1 = `<section class="rp-section rp-break">
        ${sectionHeader(next(), t('rtMerSecTop'))}
        ${panel(t('rtMerTopChart',{n:b.top.length}), chartBox('rpChartA', b.top.length>0) + legendDoneFail())}
        ${tbl(['#', t('merchantFilterLabel'), t('requestsHeader'), t('rtColShare'), t('successHeader'), t('rtColTopReason')],
          b.top.map(r=>`<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td class="num">${fmtNum(r.total)}</td><td class="num">${p1(r.share)}</td><td class="num">${rateCell(r.rate)}</td><td>${reasonCell(r.topReason)}</td></tr>`),
          null, {ranked:true})}
      </section>`;
      const sec2 = `<section class="rp-section rp-keep">
        ${sectionHeader(next(), t('rtMerSecAttention'))}
        <p class="rp-lead">${esc(t('rtMerAttentionLead',{n:b.minVolume, c:fmtNum(b.attentionCount)}))}</p>
        ${b.attention.length ? tbl(['#', t('merchantFilterLabel'), t('requestsHeader'), t('failLegend'), t('successHeader'), t('rtColTopReason')],
          b.attention.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td class="num">${fmtNum(r.total)}</td><td class="num">${fmtNum(r.fail)}</td><td class="num">${rateCell(r.rate)}</td><td>${reasonCell(r.topReason)}</td></tr>`),
          null, {ranked:true}) : `<div class="empty-state">${esc(t('rtMerNoAttention',{n:b.minVolume}))}</div>`}
        ${b.attentionCount>b.attention.length ? `<div class="rp-foot-note">${esc(t('rtMerAttentionMore',{n:b.attention.length, c:fmtNum(b.attentionCount)}))}</div>`:''}
      </section>`;
      const foot = `<tr><td colspan="2">${totalLabel()}</td><td class="num">${fmtNum(b.totals.total)}</td><td class="num">${fmtNum(b.totals.done)}</td><td class="num">${fmtNum(b.totals.fail)}</td><td class="num">${rateCell(b.totals.rate)}</td><td class="num">100.0%</td><td class="num">${fmtNum(b.totals.fees)}</td></tr>`;
      const sec3 = `<section class="rp-section rp-break">
        ${sectionHeader(next(), t('rtMerSecFull'))}
        ${tbl(['#', t('merchantFilterLabel'), t('requestsHeader'), t('doneLegend'), t('failLegend'), t('successHeader'), t('rtColShare'), t('extraFeesHeader')],
          b.rows.map(r=>`<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td class="num">${fmtNum(r.total)}</td><td class="num">${fmtNum(r.done)}</td><td class="num">${fmtNum(r.fail)}</td><td class="num">${rateCell(r.rate)}</td><td class="num">${p1(r.share)}</td><td class="num">${fmtNum(r.fees)}</td></tr>`),
          foot, {ranked:true})}
      </section>`;
      return sec1 + sec2 + sec3;
    }
    function drawMerchants(data){
      const b = data.body;
      if(document.getElementById('rpChartA')) charts.renderHStackedBar('rpChartA', b.top.map(r=>short(r.name,26)), b.top.map(r=>r.done), b.top.map(r=>r.fail));
    }

    // ======================================================================
    // أسباب الفشل
    // ======================================================================
    function reasons(data, next){
      const b = data.body;
      const rows = b.ordered.map(r=>`<tr${r.isNA?' class="rp-row-muted"':''}><td>${esc(r.isNA ? t('rtReasonNone') : r.name)}</td><td class="num">${fmtNum(r.total)}</td><td class="num">${p1(r.share)}</td><td class="num">${p1(r.shareAll)}</td></tr>`);
      const foot = `<tr><td>${totalLabel()}</td><td class="num">${fmtNum(b.failTotal)}</td><td class="num">100.0%</td><td class="num">${p1(b.totalAll ? b.failTotal/b.totalAll*100 : 0)}</td></tr>`;
      const sec1 = `<section class="rp-section rp-break">
        ${sectionHeader(next(), t('rtReaSecRanking'))}
        ${panel(t('reportReasonBreakdown'), chartBox('rpChartA', b.topNamed.length>0))}
        ${tbl([t('reasonFilterLabel'), t('failLegend'), t('rtColShareFail'), t('rtColShareAll')], rows, b.ordered.length ? foot : null)}
      </section>`;
      const m = b.cityMatrix;
      const mHead = [t('cityLabel')].concat(m.cols, [t('rtColOther'), t('rtColFailTotal'), t('rtColFailRate')]);
      const mRows = m.rows.map(r=>`<tr><td>${esc(r.name)}</td>${r.cells.map(c=>`<td class="num">${c?fmtNum(c):'—'}</td>`).join('')}<td class="num">${r.other?fmtNum(r.other):'—'}</td><td class="num"><b>${fmtNum(r.fail)}</b></td><td class="num">${p1(r.failRate)}</td></tr>`);
      const sec2 = `<section class="rp-section rp-break">
        ${sectionHeader(next(), t('rtReaSecCity'))}
        <div class="rp-matrix-wrap">${tbl(mHead, mRows, null, {cls:'rp-matrix'})}</div>
        <div class="rp-foot-note">${esc(t('rtReaMatrixNote'))}</div>
      </section>`;
      const whoHead = first => ['#', first, t('failLegend'), t('rtColFailRate'), t('rtColTopReason'), t('rtColTopReasonShare')];
      const whoRow = (r,i) => `<tr><td>${i+1}</td><td>${esc(r.name)}</td><td class="num">${fmtNum(r.fail)}</td><td class="num">${p1(r.failRate)}</td><td>${reasonCell(r.topReason)}</td><td class="num">${r.topShare===null?'—':p1(r.topShare)}</td></tr>`;
      const sec3 = `<section class="rp-section rp-break">
        ${sectionHeader(next(), t('rtReaSecWho'))}
        ${panel(t('rtReaWhoMerchants',{n:b.merchants.length}), tbl(whoHead(t('merchantFilterLabel')), b.merchants.map(whoRow), null, {ranked:true}))}
        ${panel(t('rtReaWhoDrivers',{n:b.drivers.length}), tbl(whoHead(t('driverFilterLabel')), b.drivers.map(whoRow), null, {ranked:true}))}
        ${panel(t('rtReaWhoAreas',{n:b.areas.length}), tbl(whoHead(t('areaFilterLabel')), b.areas.map((r,i)=>whoRow(Object.assign({}, r, {name: r.name+' — '+r.city}), i)), null, {ranked:true}))}
      </section>`;
      return sec1 + sec2 + sec3;
    }
    function drawReasons(data){
      const b = data.body;
      if(document.getElementById('rpChartA')) charts.renderHBar('rpChartA', b.topNamed.map(r=>short(r.name,30)), b.topNamed.map(r=>r.total), DS.color('fail'));
    }

    // ======================================================================
    // الرسوم الإضافية
    // ======================================================================
    function feeTable(firstHeader, list, b, withTotal){
      const foot = withTotal ? `<tr><td>${totalLabel()}</td><td class="num">${fmtNum(b.totalReq)}</td><td class="num">${fmtNum(b.feesTotal)}</td><td class="num">100.0%</td><td class="num">${b.avg.toFixed(1)}</td></tr>` : null;
      return tbl([firstHeader, t('requestsHeader'), t('extraFeesHeader'), t('rtColShareFees'), t('rtColAvgFee')],
        list.map(r=>`<tr><td>${esc(r.name)}</td><td class="num">${fmtNum(r.total)}</td><td class="num">${fmtNum(r.fees)}</td><td class="num">${p1(r.share)}</td><td class="num">${r.avg.toFixed(1)}</td></tr>`), foot);
    }
    function fees(data, next){
      const b = data.body;
      const rankedFee = (first, list) => tbl(['#', first, t('requestsHeader'), t('extraFeesHeader'), t('rtColShareFees'), t('rtColAvgFee')],
        list.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td class="num">${fmtNum(r.total)}</td><td class="num">${fmtNum(r.fees)}</td><td class="num">${p1(r.share)}</td><td class="num">${r.avg.toFixed(1)}</td></tr>`), null, {ranked:true});
      const sec1 = `<section class="rp-section rp-break">
        ${sectionHeader(next(), t('rtFeeSecTrend'))}
        ${panel(t('rtFeeByMonth'), chartBox('rpChartA', b.months.length>0) + feeTable(t('rtColMonth'), b.months, b, true))}
        ${panel(t('rtFeeTopAreasChart',{n:b.areaChart.length}), chartBox('rpChartB', b.areaChart.length>0))}
      </section>`;
      const sec2 = `<section class="rp-section rp-break">
        ${sectionHeader(next(), t('rtFeeSecDims'))}
        ${panel(t('rtFeeByCity'), feeTable(t('cityLabel'), b.cities, b, true))}
        ${panel(t('rtFeeByType'), feeTable(t('requestTypeLabel'), b.types, b, true))}
        ${panel(t('rtFeeByArea',{n:b.areas.length}), rankedFee(t('areaFilterLabel'), b.areas.map(a=>Object.assign({}, a, {name:a.name+' — '+a.city}))))}
      </section>`;
      const sec3 = `<section class="rp-section rp-break">
        ${sectionHeader(next(), t('rtFeeSecWho'))}
        ${panel(t('rtFeeByDriver',{n:b.drivers.length}), rankedFee(t('driverFilterLabel'), b.drivers))}
        ${panel(t('rtFeeByMerchant',{n:b.merchants.length}), rankedFee(t('merchantFilterLabel'), b.merchants))}
      </section>`;
      return sec1 + sec2 + sec3;
    }
    function drawFees(data){
      const b = data.body;
      if(document.getElementById('rpChartA')) charts.renderHBar('rpChartA', b.months.map(r=>r.name), b.months.map(r=>r.fees), DS.color('blue'));
      if(document.getElementById('rpChartB')) charts.renderHBar('rpChartB', b.areaChart.map(r=>short(r.name,26)), b.areaChart.map(r=>r.fees), DS.color('teal'));
    }

    // ======================================================================
    // الفروع
    // ======================================================================
    function branches(data, next){
      const b = data.body;
      const all = b.mapped.concat(b.unmapped ? [b.unmapped] : []);
      const row = (r, muted) => `<tr${muted?' class="rp-row-muted"':''}><td>${esc(r.name)}</td><td class="num">${fmtNum(r.drivers)}</td><td class="num">${fmtNum(r.total)}</td><td class="num">${p1(r.share)}</td><td class="num">${fmtNum(r.done)}</td><td class="num">${fmtNum(r.fail)}</td><td class="num">${muted ? `<span class="rp-plain-rate">${p1(r.rate)}</span>` : rateCell(r.rate, r.total>=b.minVolume)}</td><td class="num">${fmtNum(r.fees)}</td><td>${reasonCell(r.topReason)}</td></tr>`;
      const foot = `<tr><td>${totalLabel()}</td><td class="num">${fmtNum(b.totals.drivers)}</td><td class="num">${fmtNum(b.totals.total)}</td><td class="num">100.0%</td><td class="num">${fmtNum(b.totals.done)}</td><td class="num">${fmtNum(b.totals.fail)}</td><td class="num">${rateCell(b.totals.rate)}</td><td class="num">${fmtNum(b.totals.fees)}</td><td></td></tr>`;
      if(!b.mapped.length){
        return `<section class="rp-section rp-break">${sectionHeader(next(), t('rtBrSecMain'))}<div class="empty-state">${esc(t('rtBrNoMapped'))}</div></section>`;
      }
      return `<section class="rp-section rp-break">
        ${sectionHeader(next(), t('rtBrSecMain'))}
        ${panel(t('rtBrChart'), chartBox('rpChartA', all.length>0) + legendDoneFail())}
        ${tbl([t('branchFilterLabel'), t('rtColDrivers'), t('requestsHeader'), t('rtColShare'), t('doneLegend'), t('failLegend'), t('successHeader'), t('extraFeesHeader'), t('rtColTopReason')],
          all.map((r,i)=>row(r, b.unmapped && i===all.length-1)), foot)}
        <div class="rp-foot-note">${esc(t('rtBrTableNote',{n:b.minVolume}))}</div>
      </section>`;
    }
    function drawBranches(data){
      const b = data.body;
      const all = b.mapped.concat(b.unmapped ? [b.unmapped] : []);
      if(document.getElementById('rpChartA')) charts.renderHStackedBar('rpChartA', all.map(r=>short(r.name,26)), all.map(r=>r.done), all.map(r=>r.fail));
    }

    // ======================================================================
    // ملاحظات المنهجية والقيود
    // ======================================================================
    function renderNotes(notes, n){
      if(!notes.length) return '';
      return `<section class="rp-section">
        ${sectionHeader(n, t('rtSecNotes'))}
        <ul class="rp-callout-list rp-notes-list">${notes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
      </section>`;
    }

    const BODY = { drivers, merchants, reasons, fees, branches };
    const DRAW = { drivers:drawDrivers, merchants:drawMerchants, reasons:drawReasons, fees:drawFees, branches:drawBranches };

    return {
      renderSummary,
      renderBody: (data, next) => BODY[data.type](data, next),
      renderNotes,
      draw: data => { if(charts && DRAW[data.type]) DRAW[data.type](data); }
    };
  }

  return { create };
})();
