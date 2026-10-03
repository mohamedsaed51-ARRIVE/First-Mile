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
    const { t, esc, fmtNum, rateClass, NA, charts, fmtStamp } = h;
    const DS = window.ArriveDS;
    const LIST_N = 5;

    const p1 = n => n.toFixed(1)+'%';
    const ltr = v => `<span class="ltr">${esc(String(v))}</span>`;
    const panel = (title, inner, note) => `<div class="panel"><div class="panel-head"><div class="panel-title">${esc(title)}</div></div>${inner}${note?`<div class="rp-foot-note">${esc(note)}</div>`:''}</div>`;
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

    function kpis(data){
      return `<div class="report-kpis rp-kpis-auto">${data.kpis.map(k=>{
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
      const top = tbl(['#', t('merchantFilterLabel'), t('requestsHeader'), t('rtColShare'), t('successHeader')],
        b.top.slice(0,LIST_N).map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td class="num">${fmtNum(r.total)}</td><td class="num">${p1(r.share)}</td><td class="num">${rateCell(r.rate)}</td></tr>`));
      const attn = b.attention.length
        ? tbl(['#', t('merchantFilterLabel'), t('requestsHeader'), t('successHeader')],
            b.attention.slice(0,LIST_N).map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td class="num">${fmtNum(r.total)}</td><td class="num">${rateCell(r.rate)}</td></tr>`))
        : empty(t('rtMerNoAttention',{n:b.minVolume}));
      const attnNote = b.attentionCount>LIST_N ? t('rtMerAttentionMore',{n:LIST_N, c:fmtNum(b.attentionCount)}) : t('rbMinNote',{n:b.minVolume});
      return grid(panel(t('rbMerTop'), top), panel(t('rbMerAttn'), attn, attnNote));
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
    const BODY = { drivers, merchants, reasons, fees, branches };

    function renderBrief(data, titleKey){
      return head(data, titleKey) + `<section class="rp-section rp-brief">
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
