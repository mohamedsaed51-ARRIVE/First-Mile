/**
 * reportAnalytic.js — ARRIVE First Mile Dashboard
 * ------------------------------------------------------------------
 * «تقارير إدارية مختصرة» (سائقين، تجار، أسباب فشل، رسوم، فروع).
 * كل تقرير = ترويسة مختصرة + مؤشرات رئيسية + أهم النقاط + جدولان صغيران
 * (أعلى 5 / يحتاج انتباه) + ملاحظات المتابعة. الجداول الكاملة تبقى في
 * لوحة المتابعة ولا تُطبع هنا.
 *
 * لا فلترة ولا تجميع: كل رقم يصل جاهزًا من reportAnalyticData.js.
 * ------------------------------------------------------------------
 */
window.DashboardReportAnalytic = (function(){

  function create(h){
    const { t, esc, fmtNum, fmtCurrency, rateClass, NA, charts, fmtStamp } = h;
    const DS = window.ArriveDS;
    const LIST_N = 5;

    const p1 = n => n.toFixed(1)+'%';
    const ltr = v => `<span class="ltr">${esc(String(v))}</span>`;
    const panel = (title, inner, note, cls) => `<div class="panel${cls?' '+cls:''}"><div class="panel-head"><div class="panel-title">${esc(title)}</div></div>${inner}${note?`<div class="rp-foot-note">${esc(note)}</div>`:''}</div>`;
    const empty = msg => `<div class="empty-state">${esc(msg || t('emptyFilters'))}</div>`;
    const short = (s, n) => s.length>n ? s.slice(0,n-2)+'…' : s;

    function tbl(headers, rows, foot){
      if(!rows.length) return empty();
      return `<table class="rp-rank-table"><thead><tr>${headers.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody>${foot?`<tfoot>${foot}</tfoot>`:''}</table>`;
    }
    const rateCell = (rate, ok) => ok===false
      ? `<span class="rp-plain-rate">${p1(rate)}</span>`
      : `<span class="rate-badge ${rateClass(rate)}">${p1(rate)}</span>`;
    const reasonCell = name => name ? esc(name) : NA();
    const grid = (a, b) => `<div class="rp-grid-2 rp-grid-keep">${a}${b}</div>`;

    // ---------- ترويسة مختصرة بدل صفحة الغلاف ----------
    function head(data, titleKey){
      return `<header class="rp-brief-head">
        <div class="rp-brief-top"><img class="rp-brief-logo" src="brand/arrive-logo.png" alt="ARRIVE"><span class="rp-cover-tag">${esc(t('reportConfidential'))}</span></div>
        <div class="rp-cover-kicker">${esc(t('rtKicker'))}</div>
        <h1 class="rp-brief-title">${esc(t(titleKey))}</h1>
        <div class="rp-brief-meta">
          <div><span>${esc(t('rbPeriod'))}</span><b>${esc(data.cover.periodLabel)}</b></div>
          <div><span>${esc(t('rbScope'))}</span><b>${esc(data.cover.scopeLine)}</b></div>
          <div><span>${esc(t('rbGenerated'))}</span><b>${ltr(fmtStamp(data.generatedAt))}</b></div>
        </div>
      </header>`;
    }

    function purpose(data){
      return `<div class="rp-purpose"><div class="rp-purpose-title">${esc(t('rpPurposeTitle'))}</div><p>${esc(t('rpPurpose_'+data.type))}</p></div>`;
    }
    function kpis(data){
      return `<div class="rp-mini-title rp-kpis-title">${esc(t('rpKpisTitle'))}</div><div class="report-kpis rp-kpis-auto">${data.kpis.map(k=>{
        const isText = String(k.value).length > 14;
        return `<div class="report-kpi tone-${k.tone}"><div class="report-kpi-label">${esc(k.label)}</div><div class="report-kpi-value${isText?' is-text':''}">${esc(k.value)}</div></div>`;
      }).join('')}</div>`;
    }
    function points(data){
      if(!data.keyPoints.length) return empty();
      return `<div class="rp-callout"><div class="rp-callout-title">${esc(t('rtKeyPointsTitle'))}</div><ul class="rp-callout-list">${data.keyPoints.map(l=>`<li>${l}</li>`).join('')}</ul></div>`;
    }

    // ---------- ملاحظات المتابعة: الملاحظة + الدليل فقط (المصدر لا يوفر بقية الحقول) ----------
    function findings(data){
      const items = data.findings;
      const body = items.length
        ? tbl(['#', t('rbColFinding'), t('rbColEvidence')], items.map((it,i)=>`<tr><td>${i+1}</td><td class="rp-c-text"><b>${esc(it.label)}</b></td><td class="rp-c-text">${esc(it.detail).replace(/(\([\d.,]+%\)|[\d.,]+%)/g,'<span class="ltr">$1</span>')}</td></tr>`))
        : empty(t('reportNoAttentionItems'));
      return panel(t('rbFindTitle'), body, t('rbFindOwner'));
    }
    function notes(data){
      if(!data.notes.length) return '';
      return `<div class="rp-brief-notes"><div class="rp-brief-notes-title">${esc(t('rbNotes'))}</div><ul>${data.notes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`;
    }

    // ---------- أجسام التقارير ----------
    function drivers(data){
      const b = data.body;
      const list = arr => tbl(['#', t('driverFilterLabel'), t('requestsHeader'), t('successHeader')],
        arr.slice(0,LIST_N).map((d,i)=>`<tr><td>${i+1}</td><td>${esc(d.name)}</td><td class="num">${fmtNum(d.count)}</td><td class="num">${rateCell(d.rate)}</td></tr>`));
      return grid(panel(t('rbDrvTop'), list(b.top), t('rbMinNote',{n:b.minVolume})), panel(t('rbDrvBottom'), list(b.bottom), t('rbMinNote',{n:b.minVolume})));
    }
    function merchants(data){
      const b = data.body;
      const top = tbl(['#', t('rtColClient'), t('requestsHeader'), t('rtColShare'), t('rtColShips'), t('successHeader')],
        b.top.slice(0,LIST_N).map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td class="num">${fmtNum(r.total)}</td><td class="num">${p1(r.share)}</td><td class="num">${fmtNum(r.ships||0)}</td><td class="num">${rateCell(r.rate)}</td></tr>`));
      const attn = b.attention.length
        ? tbl(['#', t('rtColClient'), t('requestsHeader'), t('successHeader')],
            b.attention.slice(0,LIST_N).map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td class="num">${fmtNum(r.total)}</td><td class="num">${rateCell(r.rate)}</td></tr>`))
        : empty(t('rtMerNoAttention',{n:b.minVolume}));
      const attnNote = b.attentionCount>LIST_N ? t('rtMerAttentionMore',{n:LIST_N, c:fmtNum(b.attentionCount)}) : t('rbMinNote',{n:b.minVolume});
      let html = grid(panel(t('rbMerTop'), top), panel(t('rbMerAttn'), attn, attnNote));
      const tr = b.trend;
      if(tr && tr.available){
        const N = 10, hv = {cur:tr.curLabel, prev:tr.prevLabel};
        const stopped = tr.stopped.length
          ? tbl(['#', t('rtColClient'), t('rtColPrevReqs',hv)],
              tr.stopped.slice(0,N).map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td class="num">${fmtNum(r.prev)}</td></tr>`))
          : empty(t('rtMerNoStopped'));
        const low = tr.low.length
          ? tbl(['#', t('rtColClient'), t('rtColPrevReqs',hv), t('rtColCurReqs',hv), t('rtColChangePct')],
              tr.low.slice(0,N).map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td class="num">${fmtNum(r.prev)}</td><td class="num">${fmtNum(r.cur)}</td><td class="num"><span class="ltr">${r.pct.toFixed(1)}%</span></td></tr>`))
          : empty(t('rtMerNoLow'));
        const more = (cnt) => cnt>N ? t('rtMerTrendMore',{n:N, c:fmtNum(cnt)}) : '';
        html += grid(panel(t('rbMerStopped',hv), stopped, more(tr.stoppedCount)||t('rbMerStoppedNote',{min:tr.minPrev})),
                     panel(t('rbMerLow',hv), low, more(tr.lowCount)||t('rbMerLowNote',{min:tr.minPrev, drop:Math.round(tr.drop*100)})));
      }
      return html;
    }
    function reasons(data){
      const b = data.body;
      const left = tbl([t('reasonFilterLabel'), t('failLegend'), t('rtColShareFail')],
        b.ordered.slice(0,LIST_N).map(r=>`<tr${r.isNA?' class="rp-row-muted"':''}><td>${esc(r.isNA ? t('rtReasonNone') : r.name)}</td><td class="num">${fmtNum(r.total)}</td><td class="num">${p1(r.share)}</td></tr>`));
      const right = tbl(['#', t('cityLabel'), t('failLegend'), t('rtColFailRate')],
        b.cityMatrix.rows.slice(0,LIST_N).map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td class="num">${fmtNum(r.fail)}</td><td class="num">${p1(r.failRate)}</td></tr>`));
      return grid(panel(t('rbReaTop'), left), panel(t('rbReaCities'), right));
    }
    function fees(data){
      const b = data.body;
      const rk = (first, arr) => tbl(['#', first, t('extraFeesHeader'), t('rtColShareFees')],
        arr.slice(0,LIST_N).map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td class="num">${fmtNum(r.fees)}</td><td class="num">${p1(r.share)}</td></tr>`));
      return `<div class="rp-screen-only">${panel(t('rbFeeTrend'), b.months.length ? `<div class="chart-box" id="rpChartA"></div>` : empty())}</div>`
        + grid(panel(t('rbFeeAreas'), rk(t('areaFilterLabel'), b.areas.map(a=>Object.assign({}, a, {name:a.name+' — '+a.city})))),
               panel(t('rbFeeDrivers'), rk(t('driverFilterLabel'), b.drivers)));
    }
    function branches(data){
      const b = data.body;
      if(!b.mapped.length) return panel(t('rbBranches'), empty(t('rtBrNoMapped')));
      const all = b.mapped.concat(b.unmapped ? [b.unmapped] : []);
      const row = (r, muted) => `<tr${muted?' class="rp-row-muted"':''}><td>${esc(r.name)}</td><td class="num">${fmtNum(r.total)}</td><td class="num">${p1(r.share)}</td><td class="num">${muted ? `<span class="rp-plain-rate">${p1(r.rate)}</span>` : rateCell(r.rate, r.total>=b.minVolume)}</td><td class="num">${fmtNum(r.fees)}</td></tr>`;
      const foot = `<tr><td>${esc(t('rtTotal'))}</td><td class="num">${fmtNum(b.totals.total)}</td><td class="num">100.0%</td><td class="num">${rateCell(b.totals.rate)}</td><td class="num">${fmtNum(b.totals.fees)}</td></tr>`;
      return panel(t('rbBranches'), tbl([t('branchFilterLabel'), t('requestsHeader'), t('rtColShare'), t('successHeader'), t('extraFeesHeader')],
        all.map((r,i)=>row(r, b.unmapped && i===all.length-1)), foot), t('rtBrTableNote',{n:b.minVolume}));
    }
    const dash = '—';
    const cur = n => n==null ? dash : fmtCurrency(n);
    const cur2 = n => n==null ? dash : fmtCurrency(Math.round(n*100)/100);
    function driverCost(data){
      const b = data.body, T = b.totals;
      const body = b.rows.map(r=>`<tr${r.hasSalary?'':' class="rp-row-muted"'}><td>${r.rank}</td><td>${esc(r.name)}</td><td>${r.branch?esc(r.branch):NA()}</td>
        <td class="num">${fmtNum(r.customers)}</td><td class="num">${fmtNum(r.ships)}</td><td class="num">${cur(r.fixed)}</td><td class="num">${cur(r.extra)}</td>
        <td class="num">${r.months||dash}</td><td class="num">${cur(r.cost)}</td><td class="num"><b>${cur2(r.perShip)}</b></td></tr>`);
      const foot = `<tr><td></td><td>${esc(t('rtTotal'))}</td><td></td><td class="num">${fmtNum(T.customers)}</td><td class="num">${fmtNum(T.ships)}</td><td></td><td></td><td></td><td class="num">${cur(T.cost)}</td><td class="num">${cur2(T.avgPerShip)}</td></tr>`;
      return panel(t('rbDcTable'), tbl(['#', t('driverFilterLabel'), t('branchFilterLabel'), t('rtColCustomers'), t('rtColShipments'), t('rtColFixed'), t('rtColExtraSal'), t('rtColActiveMonths'), t('rtColTotalCost'), t('rtColCostPerShip')], body, foot), t('rnDcMethod'), 'rp-flow');
    }
    function external(data){
      const b = data.body, T = b.totals;
      const body = b.rows.map(r=>`<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td class="num">${fmtNum(r.reqs)}</td><td class="num">${fmtNum(r.ships)}</td>
        <td class="num">${cur(r.cost)}</td><td class="num"><b>${cur2(r.perShip)}</b></td></tr>`);
      const foot = `<tr><td></td><td>${esc(t('rtTotal'))} (${fmtNum(T.customers)})</td><td class="num">${fmtNum(T.reqs)}</td><td class="num">${fmtNum(T.ships)}</td><td class="num">${cur(T.cost)}</td><td class="num">${cur2(T.avg)}</td></tr>`;
      return panel(t('rbExTable'), tbl(['#', t('merchantFilterLabel'), t('requestsHeader'), t('rtColShipments'), t('rtColExtCost'), t('rtColCostPerShip')], body, foot), t('rnExMethod'), 'rp-flow');
    }
    function status(data){
      const b = data.body;
      const rt = (r) => `<td class="num">${fmtNum(r.total)}</td><td class="num">${fmtNum(r.done)}</td><td class="num">${fmtNum(r.fail)}</td><td class="num">${rateCell(r.rate)}</td>`;
      const st = tbl([t('statusLabel'), t('requestsHeader'), t('rtColShare'), t('rtColShipments')],
        b.statusRows.map(r=>`<tr><td>${esc(r.name)}</td><td class="num">${fmtNum(r.total)}</td><td class="num">${p1(r.share)}</td><td class="num">${fmtNum(r.ships)}</td></tr>`));
      const hdr = first => [first, t('requestsHeader'), t('doneLegend'), t('failLegend'), t('successHeader')];
      const ty = tbl(hdr(t('requestTypeLabel')), b.typeRows.map(r=>`<tr><td>${esc(r.name)}</td>${rt(r)}</tr>`));
      const mo = tbl(hdr(t('periodLabel')), b.monthRows.map(r=>`<tr><td>${esc(r.name)}</td>${rt(r)}</tr>`));
      const ci = tbl(hdr(t('cityLabel')), b.cityRows.map(r=>`<tr><td>${esc(r.name)}</td>${rt(r)}</tr>`));
      const re = b.reasonRows.length ? tbl([t('reasonFilterLabel'), t('failLegend'), t('rtColShareFail')],
        b.reasonRows.map(r=>`<tr><td>${esc(r.name)}</td><td class="num">${fmtNum(r.total)}</td><td class="num">${p1(r.share)}</td></tr>`)) : empty(t('noFailedInRange'));
      return grid(panel(t('rbStStatus'), st), panel(t('rbStType'), ty)) + grid(panel(t('rbStMonth'), mo), panel(t('rbStCity'), ci)) + panel(t('rbStReasons'), re);
    }
    function clientQuality(data){
      const b = data.body;
      const list = (arr, emptyKey) => arr.length ? tbl(['#', t('merchantFilterLabel'), t('requestsHeader'), t('doneLegend'), t('rtColFailRate'), t('rtColShipments'), t('rtCqColPerReq'), t('rtCqColVsAvg')],
        arr.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td class="num">${fmtNum(r.reqs)}</td><td class="num">${fmtNum(r.done)}</td><td class="num">${p1(r.failRate)}</td><td class="num">${fmtNum(r.ships)}</td><td class="num"><b>${r.perReq.toFixed(1)}</b></td><td class="num">×${r.ratio.toFixed(2)}</td></tr>`)) : empty(t(emptyKey,{n:b.minReqs}));
      const dist = tbl([t('rtCqColClass'), t('rtColCustomers'), t('requestsHeader'), t('rtColShipments')], [
        `<tr><td>${esc(t('cqGood'))}</td><td class="num">${fmtNum(b.goodCount)}</td><td class="num">${fmtNum(b.goodReqs)}</td><td class="num">${fmtNum(b.goodShips)}</td></tr>`,
        `<tr><td>${esc(t('cqMid'))}</td><td class="num">${fmtNum(b.midCount)}</td><td class="num">—</td><td class="num">—</td></tr>`,
        `<tr><td>${esc(t('cqLow'))}</td><td class="num">${fmtNum(b.lowCount)}</td><td class="num">${fmtNum(b.lowReqs)}</td><td class="num">${fmtNum(b.lowShips)}</td></tr>`,
        `<tr class="rp-row-muted"><td>${esc(t('cqNa'))}</td><td class="num">${fmtNum(b.naCount)}</td><td class="num">—</td><td class="num">—</td></tr>`]);
      return panel(t('rbCqDist'), dist)
        + grid(panel(t('rbCqGood'), list(b.good,'rtCqNoGood'), b.goodCount>b.good.length ? t('rtCqMore',{n:b.good.length, c:fmtNum(b.goodCount)}) : ''),
               panel(t('rbCqLow'), list(b.low,'rtCqNoLow'), b.lowCount>b.low.length ? t('rtCqMore',{n:b.low.length, c:fmtNum(b.lowCount)}) : ''));
    }
    const BODY = { drivers, merchants, reasons, fees, branches, driverCost, external, status, clientQuality };

    function renderBrief(data, titleKey){
      return head(data, titleKey) + `<section class="rp-section rp-brief">
        ${purpose(data)}
        ${kpis(data)}
        ${points(data)}
        ${BODY[data.type](data)}
        ${findings(data)}
        ${notes(data)}
        <div class="rp-brief-foot">${esc(t('reportDataSources'))}</div>
      </section>`;
    }

    function draw(data){
      if(!charts || data.type!=='fees') return;
      const el = document.getElementById('rpChartA');
      if(el) charts.renderHBar('rpChartA', data.body.months.map(r=>r.name), data.body.months.map(r=>r.fees), DS.color('blue'));
    }

    return { renderBrief, draw };
  }

  return { create };
})();
