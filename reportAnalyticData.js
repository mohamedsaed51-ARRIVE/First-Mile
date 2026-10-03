/**
 * reportAnalyticData.js — ARRIVE First Mile Dashboard
 * ------------------------------------------------------------------
 * بيانات «التقارير التحليلية» الخمسة: السائقين، التجار، أسباب الفشل،
 * الرسوم الإضافية، الفروع.
 *
 * مبدأ العمل (نفس مبدأ reportData.js): لا يُعاد فلترة أي شيء هنا. كل
 * تقرير يبدأ من نفس الكائن agg الذي حسبته لوحة المتابعة للفلاتر الحالية
 * (agg.fr = الصفوف المطابقة للفلاتر فعلًا)، ثم يُجمّعها حسب البُعد
 * المطلوب. أي تغيير في الفلاتر ينعكس تلقائيًا على التقرير.
 *
 * لا يخترع هذا الملف: مسؤولًا، موعدًا، حالة، أثرًا، أو سببًا جذريًا.
 * الملاحظات (findings) تُشتق فقط من أرقام محسوبة ومن الحدود المعتمدة
 * أصلًا في لوحة المتابعة (rateClass، وحد الحجم الأدنى للسائقين 15 وللمدن
 * والمناطق 30).
 *
 * لا يوجد وصول إلى DOM هنا — بيانات داخلة وبيانات خارجة فقط.
 * ------------------------------------------------------------------
 */
window.DashboardReportAnalyticData = (function(){

  // أنواع التقارير: مفاتيح الترجمة فقط. الترتيب هو ترتيب التبويبات.
  const REPORT_TYPES = [
    { key:'management', tab:'rtManagement', title:'reportTitle',       print:'reportPrintFooterBrand' },
    { key:'drivers',    tab:'rtDrivers',    title:'rtDriversTitle',    analytic:true },
    { key:'merchants',  tab:'rtMerchants',  title:'rtMerchantsTitle',  analytic:true },
    { key:'reasons',    tab:'rtReasons',    title:'rtReasonsTitle',    analytic:true },
    { key:'fees',       tab:'rtFees',       title:'rtFeesTitle',       analytic:true },
    { key:'branches',   tab:'rtBranches',   title:'rtBranchesTitle',   analytic:true }
  ];

  function create(deps){
    const { lookups, meta, thresholds, driverBranch, t, typeLabel, monthLabel, fmtNum, fmtCurrency, esc, rateClass, insightsEngine, base } = deps;
    const { months, cities, areas, drivers, clients, types, statuses, reasons } = lookups;
    const DONE_IDX = statuses.indexOf('Done');
    const FAIL_IDX = statuses.indexOf('Fail');
    const MIN_D = thresholds.minDriverVolume;   // 15 — نفس حد لوحة المتابعة
    const MIN_C = thresholds.minCityVolume;     // 30 — نفس حد المدن والمناطق
    const NA_REASON = 'N/A';
    const TOP_N = 10;

    const ltr = v => `<span class="ltr">${esc(String(v))}</span>`;
    const p1 = n => n.toFixed(1)+'%';
    const pct = (part, whole) => whole ? part/whole*100 : 0;
    const branchOf = di => (driverBranch && driverBranch[di]) || null;
    const rateOf = g => pct(g.done, g.total);

    // ---------- تجميع صفوف الفلاتر الحالية حسب بُعد ----------
    // صف المصدر: [شهر, مدينة, منطقة, سائق, نوع, حالة, تاجر, سبب, عدد, رسوم]
    function group(fr, keyFn){
      const m = new Map();
      fr.forEach(r=>{
        const k = keyFn(r);
        let g = m.get(k);
        if(!g){ g = { key:k, total:0, done:0, fail:0, fees:0, reasons:{}, drivers:new Set(), cities:new Set() }; m.set(k, g); }
        const count = r[8];
        g.total += count; g.fees += r[9];
        if(r[5]===DONE_IDX) g.done += count;
        else if(r[5]===FAIL_IDX){ g.fail += count; g.reasons[r[7]] = (g.reasons[r[7]]||0) + count; }
        g.drivers.add(r[3]); g.cities.add(r[1]);
      });
      return Array.from(m.values());
    }
    // أعلى سبب فشل مسجّل (يستثني N/A لأنه غياب سبب وليس سببًا)
    function topReasonOf(g){
      let best = null;
      Object.keys(g.reasons).forEach(ri=>{
        if(reasons[ri]===NA_REASON) return;
        const c = g.reasons[ri];
        if(!best || c>best.count) best = { name:reasons[ri], count:c };
      });
      return best;
    }
    const byTotalDesc = (a,b)=>b.total-a.total;

    function selectedMonthSet(state){
      if(state.periodMode==='multi') return new Set(state.selectedMonths);
      const s = new Set(); for(let i=state.monthFrom;i<=state.monthTo;i++) s.add(i); return s;
    }
    // ملاحظات مشتركة بين كل التقارير
    function commonNotes(state){
      const notes = [];
      const sel = selectedMonthSet(state);
      const partial = (meta.partialMonths||[]).filter(pm=>sel.has(months.indexOf(pm)));
      if(partial.length) notes.push(t('rnPartialMonths',{months: partial.map(monthLabel).join(', ')}));
      return notes;
    }

    function skeleton(type, agg, state){
      const scope = base.buildScope(state);
      return {
        type, generatedAt:new Date(),
        cover:{ scopeLine: base.buildCoverScopeLine(scope), periodLabel: scope.period },
        scope, summary: base.buildSummary(agg),
        kpis:[], keyPoints:[], findings:[], notes: commonNotes(state),
        comparison:null, managementMessage:[], body:{}
      };
    }
    const kpi = (label, value, tone) => ({ label, value, tone: tone||'main' });

    // ======================================================================
    // 1) السائقين
    // ======================================================================
    function buildDrivers(agg, state){
      const R = skeleton('drivers', agg, state);
      const groups = group(agg.fr, r=>r[3]);
      const rows = groups.map(g=>({
        name: drivers[g.key].trim(), branch: branchOf(g.key),
        total:g.total, done:g.done, fail:g.fail, rate:rateOf(g), fees:g.fees, qualified: g.total>=MIN_D
      })).sort(byTotalDesc);
      rows.forEach((r,i)=>{ r.rank = i+1; });
      const totals = { total:agg.total, done:agg.done, fail:agg.fail, fees:agg.fees, rate:pct(agg.done, agg.total) };
      const qualified = rows.filter(r=>r.qualified);
      const bands = { good:0, mid:0, bad:0 };
      qualified.forEach(r=>{ const c = rateClass(r.rate); if(c==='rate-good') bands.good++; else if(c==='rate-mid') bands.mid++; else bands.bad++; });
      const { top, bottom } = insightsEngine.computeTopBottomDrivers(agg.driverAgg);
      const top10Share = pct(rows.slice(0,TOP_N).reduce((s,r)=>s+r.total,0), agg.total);
      const avg = rows.length ? agg.total/rows.length : 0;

      R.kpis = [
        kpi(t('kpiActiveCouriers'), fmtNum(rows.length), 'main'),
        kpi(t('kpiTotalRequests'), fmtNum(agg.total), 'main'),
        kpi(t('kpiSuccessRate'), p1(totals.rate), 'good'),
        kpi(t('rtKpiBelow75'), fmtNum(bands.bad), bands.bad? 'bad':'good')
      ];
      if(rows.length){
        R.keyPoints.push(t('rtDrvPoint1',{n:ltr(fmtNum(rows.length)), total:ltr(fmtNum(agg.total)), avg:ltr(avg.toFixed(1))}));
        R.keyPoints.push(t('rtDrvPoint2',{q:ltr(fmtNum(qualified.length)), min:ltr(MIN_D), bad:ltr(fmtNum(bands.bad))}));
        if(top.length && bottom.length){
          R.keyPoints.push(t('rtDrvPoint3',{best:esc(top[0].name), bestRate:ltr(p1(top[0].rate)), worst:esc(bottom[0].name), worstRate:ltr(p1(bottom[0].rate))}));
        }
        R.keyPoints.push(t('rtDrvPoint4',{pct:ltr(p1(top10Share)), n:ltr(Math.min(TOP_N, rows.length))}));
      }
      const poor = bottom.filter(d=>rateClass(d.rate)==='rate-bad');
      if(poor.length) R.findings.push({ key:'drivers', label:t('reportAttentionDriverPoor'),
        detail: poor.slice(0,5).map(d=>`${d.name} (${d.rate.toFixed(1)}%)`).join(', ') });
      const lowVol = rows.filter(r=>!r.qualified);
      if(lowVol.length) R.findings.push({ key:'lowvol', label:t('rtFindLowVolDrivers',{min:MIN_D}),
        detail: t('rtFindLowVolDriversDetail',{n:fmtNum(lowVol.length), total:fmtNum(rows.length)}) });

      R.notes.push(t('rnMinDriver',{n:MIN_D}));
      R.notes.push(t('rnBranchBlank'));

      R.body = { rows, totals, top, bottom, bands, volumeTop: rows.slice(0,TOP_N), minVolume: MIN_D };
      R.managementMessage = R.keyPoints;
      return R;
    }

    // ======================================================================
    // 2) التجار
    // ======================================================================
    function buildMerchants(agg, state){
      const R = skeleton('merchants', agg, state);
      const groups = group(agg.fr, r=>r[6]);
      const rows = groups.map(g=>{
        const tr = topReasonOf(g);
        return { name: clients[g.key], total:g.total, done:g.done, fail:g.fail, rate:rateOf(g),
          share: pct(g.total, agg.total), fees:g.fees, topReason: tr ? tr.name : null };
      }).sort(byTotalDesc);
      rows.forEach((r,i)=>{ r.rank = i+1; });
      const totals = { total:agg.total, done:agg.done, fail:agg.fail, fees:agg.fees, rate:pct(agg.done, agg.total) };
      const top5 = rows.slice(0,5);
      const top5Share = pct(top5.reduce((s,r)=>s+r.total,0), agg.total);
      const attention = rows.filter(r=>r.total>=MIN_C && rateClass(r.rate)==='rate-bad')
        .sort((a,b)=>a.rate-b.rate || b.total-a.total);

      R.kpis = [
        kpi(t('rtKpiActiveMerchants'), fmtNum(rows.length), 'main'),
        kpi(t('kpiTotalRequests'), fmtNum(agg.total), 'main'),
        kpi(t('kpiSuccessRate'), p1(totals.rate), 'good'),
        kpi(t('rtKpiTop5Share'), p1(top5Share), 'main'),
        kpi(t('rtKpiMerchantsBad',{n:MIN_C}), fmtNum(attention.length), attention.length ? 'bad':'good')
      ];
      if(rows.length){
        R.keyPoints.push(t('rtMerPoint1',{n:ltr(fmtNum(rows.length)), total:ltr(fmtNum(agg.total))}));
        R.keyPoints.push(t('rtMerPoint2',{name:esc(rows[0].name), share:ltr(p1(rows[0].share)), top5:ltr(p1(top5Share))}));
        R.keyPoints.push(t('rtMerPoint3',{n:ltr(fmtNum(attention.length)), min:ltr(MIN_C)}));
      }
      if(attention.length) R.findings.push({ key:'merchants', label:t('rtFindMerchantsPoor'),
        detail: attention.slice(0,5).map(r=>`${r.name} (${r.rate.toFixed(1)}%)`).join(', ') });
      if(rows.length) R.findings.push({ key:'concentration', label:t('rtFindConcentration'),
        detail: top5.map(r=>`${r.name} (${r.share.toFixed(1)}%)`).join(', ') });

      R.notes.push(t('rnMinMerchant',{n:MIN_C}));
      R.body = { rows, totals, top: rows.slice(0,TOP_N), attention: attention.slice(0,TOP_N), attentionCount: attention.length, minVolume: MIN_C };
      R.managementMessage = R.keyPoints;
      return R;
    }

    // ======================================================================
    // 3) أسباب الفشل
    // ======================================================================
    function buildReasons(agg, state){
      const R = skeleton('reasons', agg, state);
      const failTotal = agg.fail;
      const reasonRows = Object.keys(agg.reasonAgg).map(ri=>({
        name: reasons[ri], total: agg.reasonAgg[ri], share: pct(agg.reasonAgg[ri], failTotal),
        shareAll: pct(agg.reasonAgg[ri], agg.total), isNA: reasons[ri]===NA_REASON, ri:+ri
      }));
      const named = reasonRows.filter(r=>!r.isNA).sort((a,b)=>b.total-a.total);
      const naRow = reasonRows.find(r=>r.isNA) || null;
      const ordered = named.concat(naRow ? [naRow] : []);
      const top3Share = named.slice(0,3).reduce((s,r)=>s+r.share,0);
      const failRate = pct(agg.fail, agg.total);

      // مصفوفة المدن × أعلى 5 أسباب مسجّلة
      const topCols = named.slice(0,5);
      const cityGroups = group(agg.fr, r=>r[1]).filter(g=>g.fail>0).sort((a,b)=>b.fail-a.fail).slice(0,8);
      const cityMatrix = { cols: topCols.map(c=>c.name), rows: cityGroups.map(g=>{
        const cells = topCols.map(c=>g.reasons[c.ri]||0);
        const other = g.fail - cells.reduce((s,x)=>s+x,0);
        return { name: cities[g.key], cells, other, fail:g.fail, failRate: pct(g.fail, g.total) };
      }) };

      const whoRows = (keyFn, nameFn, extra) => group(agg.fr, keyFn).filter(g=>g.fail>0)
        .sort((a,b)=>b.fail-a.fail).slice(0,TOP_N).map(g=>{
          const tr = topReasonOf(g);
          return Object.assign({ name:nameFn(g.key), fail:g.fail, total:g.total, failRate:pct(g.fail,g.total),
            topReason: tr ? tr.name : null, topShare: tr ? pct(tr.count, g.fail) : null }, extra ? extra(g) : {});
        });
      const merchantsRows = whoRows(r=>r[6], k=>clients[k]);
      const driversRows = whoRows(r=>r[3], k=>drivers[k].trim());
      const areasRows = whoRows(r=>r[2], k=>areas[k], g=>({ city: cities[[...g.cities][0]] }));

      R.kpis = [
        kpi(t('kpiFailed'), fmtNum(agg.fail), 'bad'),
        kpi(t('rtKpiFailRate'), p1(failRate), 'bad'),
        kpi(t('rtKpiTopReason'), named[0] ? named[0].name : t('notInSource'), 'main'),
        kpi(t('rtKpiTop3Share'), p1(top3Share), 'main'),
        kpi(t('rtKpiNoReason'), naRow ? fmtNum(naRow.total) : '0', naRow && naRow.total ? 'bad' : 'good')
      ];
      if(agg.fail){
        R.keyPoints.push(t('rtReaPoint1',{fail:ltr(fmtNum(agg.fail)), total:ltr(fmtNum(agg.total)), rate:ltr(p1(failRate))}));
        if(named[0]) R.keyPoints.push(t('rtReaPoint2',{name:esc(named[0].name), n:ltr(fmtNum(named[0].total)), share:ltr(p1(named[0].share))}));
        if(named.length>=3) R.keyPoints.push(t('rtReaPoint3',{pct:ltr(p1(top3Share))}));
        if(naRow && naRow.total) R.keyPoints.push(t('rtReaPoint4',{n:ltr(fmtNum(naRow.total)), share:ltr(p1(naRow.share))}));
      }
      if(named.length) R.findings.push({ key:'reasons', label:t('reportAttentionTopReason'),
        detail: named.slice(0,3).map(r=>`${r.name} (${fmtNum(r.total)})`).join(', ') });
      if(named.length>=3) R.findings.push({ key:'concentration', label:t('rtFindReasonConcentration'),
        detail: t('reportFailureConcentrationLine',{pct:p1(top3Share)}) });
      if(naRow && naRow.total) R.findings.push({ key:'noreason', label:t('rtFindNoReason'),
        detail: t('rtFindNoReasonDetail',{n:fmtNum(naRow.total), pct:p1(naRow.share)}) });

      R.notes.push(t('rnReasonsScope'));
      R.notes.push(t('rnReasonsNA'));
      R.body = { ordered, named, failTotal, totalAll: agg.total, topNamed: named.slice(0,8), cityMatrix,
        merchants: merchantsRows, drivers: driversRows, areas: areasRows };
      R.managementMessage = R.keyPoints;
      return R;
    }

    // ======================================================================
    // 4) الرسوم الإضافية
    // ======================================================================
    function buildFees(agg, state){
      const R = skeleton('fees', agg, state);
      const feesTotal = agg.fees;
      const mk = (g, name, extra) => Object.assign({ name, total:g.total, fees:g.fees, avg: g.total ? g.fees/g.total : 0, share: pct(g.fees, feesTotal) }, extra||{});
      const byFees = (a,b)=>b.fees-a.fees;

      const monthRows = group(agg.fr, r=>r[0]).sort((a,b)=>a.key-b.key).map(g=>mk(g, monthLabel(months[g.key])));
      const cityRows = group(agg.fr, r=>r[1]).map(g=>mk(g, cities[g.key])).sort(byFees);
      const areaAll = group(agg.fr, r=>r[2]).map(g=>mk(g, areas[g.key], { city: cities[[...g.cities][0]] })).sort(byFees);
      const driverAll = group(agg.fr, r=>r[3]).map(g=>mk(g, drivers[g.key].trim())).sort(byFees);
      const merchantAll = group(agg.fr, r=>r[6]).map(g=>mk(g, clients[g.key])).sort(byFees);
      const typeRows = group(agg.fr, r=>r[4]).map(g=>mk(g, typeLabel(types[g.key]))).sort(byFees);
      const avg = agg.total ? feesTotal/agg.total : 0;
      const top5AreasShare = areaAll.slice(0,5).reduce((s,r)=>s+r.share,0);
      const perDriver = agg.driverSet.size ? feesTotal/agg.driverSet.size : 0;
      const unit = fmtCurrency(0).replace(/^\S+/, '');   // وحدة العملة بنفس صيغة fmtCurrency (جنيه / EGP)

      R.kpis = [
        kpi(t('kpiExtraFees'), fmtCurrency(feesTotal), 'main'),
        kpi(t('kpiTotalRequests'), fmtNum(agg.total), 'main'),
        kpi(t('kpiAvgExtraFee'), avg.toFixed(1)+unit, 'main'),
        kpi(t('rtKpiFeesPerCourier'), fmtCurrency(perDriver), 'main'),
        kpi(t('rtKpiTop5AreasShare'), p1(top5AreasShare), 'main')
      ];
      if(feesTotal>0){
        R.keyPoints.push(t('rtFeePoint1',{fees:ltr(fmtCurrency(feesTotal)), avg:ltr(avg.toFixed(1)+unit)}));
        if(areaAll[0]) R.keyPoints.push(t('rtFeePoint2',{area:esc(areaAll[0].name), fees:ltr(fmtCurrency(areaAll[0].fees)), share:ltr(p1(areaAll[0].share))}));
        if(driverAll[0]) R.keyPoints.push(t('rtFeePoint3',{name:esc(driverAll[0].name), fees:ltr(fmtCurrency(driverAll[0].fees)), share:ltr(p1(driverAll[0].share))}));
        R.findings.push({ key:'fees', label:t('reportAttentionHighFees'),
          detail: areaAll.slice(0,3).map(a=>`${a.name} — ${fmtCurrency(a.fees)} (${a.share.toFixed(1)}%)`).join(' · ') });
      }
      R.notes.push(t('rnFeesGrouped'));
      R.body = { feesTotal, totalReq: agg.total, avg, months: monthRows, cities: cityRows,
        areas: areaAll.slice(0,TOP_N), drivers: driverAll.slice(0,TOP_N), merchants: merchantAll.slice(0,TOP_N), types: typeRows,
        areaChart: areaAll.slice(0,TOP_N) };
      R.managementMessage = R.keyPoints;
      return R;
    }

    // ======================================================================
    // 5) الفروع (عن طريق ربط السائق بالفرع — بيانات السائقين)
    // ======================================================================
    function buildBranches(agg, state){
      const R = skeleton('branches', agg, state);
      const groups = group(agg.fr, r=>branchOf(r[3]) || '');
      const toRow = g => {
        const tr = topReasonOf(g);
        return { name: g.key, drivers:g.drivers.size, total:g.total, share:pct(g.total, agg.total), done:g.done, fail:g.fail,
          rate:rateOf(g), fees:g.fees, topReason: tr ? tr.name : null };
      };
      const mapped = groups.filter(g=>g.key!=='').map(toRow).sort(byTotalDesc);
      const unG = groups.find(g=>g.key==='');
      const unmapped = unG ? toRow(unG) : null;
      if(unmapped) unmapped.name = t('rtBranchUnmapped');
      const mappedReq = mapped.reduce((s,r)=>s+r.total,0);
      const mappedDrivers = new Set(); groups.forEach(g=>{ if(g.key!=='') g.drivers.forEach(d=>mappedDrivers.add(d)); });
      const activeDrivers = agg.driverSet.size;
      const totals = { total:agg.total, done:agg.done, fail:agg.fail, fees:agg.fees, rate:pct(agg.done, agg.total), drivers: activeDrivers };
      const qualified = mapped.filter(r=>r.total>=MIN_C);
      const best = qualified.slice().sort((a,b)=>b.rate-a.rate)[0];
      const worst = qualified.slice().sort((a,b)=>a.rate-b.rate)[0];

      R.kpis = [
        kpi(t('rtKpiBranches'), fmtNum(mapped.length), 'main'),
        kpi(t('kpiTotalRequests'), fmtNum(agg.total), 'main'),
        kpi(t('rtKpiMappedReq'), p1(pct(mappedReq, agg.total)), mappedReq<agg.total ? 'bad':'good'),
        kpi(t('rtKpiMappedDrivers'), `${fmtNum(mappedDrivers.size)} / ${fmtNum(activeDrivers)}`, 'main'),
        kpi(t('kpiSuccessRate'), p1(totals.rate), 'good')
      ];
      if(mapped.length){
        R.keyPoints.push(t('rtBrPoint1',{n:ltr(fmtNum(mapped.length)), pct:ltr(p1(pct(mappedReq, agg.total)))}));
        R.keyPoints.push(t('rtBrPoint2',{d:ltr(fmtNum(mappedDrivers.size)), t:ltr(fmtNum(activeDrivers))}));
        if(best && worst && best.name!==worst.name){
          R.keyPoints.push(t('rtBrPoint3',{best:esc(best.name), bestRate:ltr(p1(best.rate)), worst:esc(worst.name), worstRate:ltr(p1(worst.rate)), min:ltr(MIN_C)}));
        }
      }
      if(unmapped) R.findings.push({ key:'branchgap', label:t('rtFindBranchGap'),
        detail: t('rtFindBranchGapDetail',{n:fmtNum(unmapped.total), pct:p1(unmapped.share), d:fmtNum(unmapped.drivers)}) });
      const poorBr = qualified.filter(r=>rateClass(r.rate)==='rate-bad').sort((a,b)=>a.rate-b.rate);
      if(poorBr.length) R.findings.push({ key:'branches', label:t('rtFindBranchPoor'),
        detail: poorBr.slice(0,5).map(r=>`${r.name} (${r.rate.toFixed(1)}%)`).join(', ') });

      R.notes.push(t('rnBranchMap',{c:fmtNum(meta.branchCoverage||0), t:fmtNum(meta.branchTotal||0)}));
      R.notes.push(t('rnMinBranch',{n:MIN_C}));
      R.body = { mapped, unmapped, totals, mappedReq, minVolume: MIN_C };
      R.managementMessage = R.keyPoints;
      return R;
    }

    const BUILDERS = { drivers:buildDrivers, merchants:buildMerchants, reasons:buildReasons, fees:buildFees, branches:buildBranches };
    function build(type, agg, state){ return BUILDERS[type](agg, state); }

    return { build };
  }

  return { REPORT_TYPES, create };
})();
