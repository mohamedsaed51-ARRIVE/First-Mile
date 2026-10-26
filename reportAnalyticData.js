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
    { key:'branches',   tab:'rtBranches',   title:'rtBranchesTitle',   analytic:true },
    { key:'driverCost', tab:'rtDrvCost',    title:'rtDrvCostTitle',    analytic:true },
    { key:'external',   tab:'rtExternal',   title:'rtExternalTitle',   analytic:true },
    { key:'status',     tab:'rtStatus',     title:'rtStatusTitle',     analytic:true },
    { key:'clientQuality', tab:'rtCq',      title:'rtCqTitle',         analytic:true }
  ];

  function create(deps){
    const { lookups, meta, thresholds, driverBranch, salaryRef, t, statusLabel, typeLabel, monthLabel, fmtNum, fmtCurrency, esc, rateClass, insightsEngine, base } = deps;
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

    // ======================================================================
    // 6) أداء المناديب وتكلفة الشحنة (مرتب ثابت + عمولة إضافية من Courier Salary)
    // صف المصدر: [شهر, مدينة, منطقة, سائق, نوع, حالة, تاجر, سبب, عدد, رسوم, شحنات]
    // ======================================================================
    const normName = s => String(s==null ? '' : s).replace(/\s+/g,' ').trim().toLowerCase();
    // شيت Courier Salary فيه صف لكل مندوب في كل شهر (عمود Month = رقم الشهر)
    // salaryMap: اسم المندوب -> Map(رقم الشهر أو 0 لو بلا شهر -> {fixed, extra})
    const salaryMap = new Map();
    (salaryRef||[]).forEach(s=>{
      if(!s || !s.name || s.fixed_salary==null) return;
      const k = normName(s.name);
      if(!salaryMap.has(k)) salaryMap.set(k, new Map());
      salaryMap.get(k).set(s.month||0, { fixed:s.fixed_salary, extra:s.extra_salary||0 });
    });
    const monthNum = mi => parseInt(String(months[mi]).slice(5,7), 10);
    const money = n => fmtCurrency(n);
    const money2 = n => n==null ? null : fmtCurrency(Math.round(n*100)/100);

    function buildDriverCost(agg, state){
      const R = skeleton('driverCost', agg, state);
      const scopeMonths = Array.from(selectedMonthSet(state)).sort((a,b)=>a-b);
      const m = new Map();
      agg.fr.forEach(r=>{
        let g = m.get(r[3]);
        if(!g){ g = { di:r[3], clients:new Set(), months:new Set(), reqs:0, ships:0 }; m.set(r[3], g); }
        g.clients.add(r[6]); g.months.add(r[0]); g.reqs += r[8]; g.ships += (r[10]||0);
      });
      const rows = Array.from(m.values()).map(g=>{
        const name = drivers[g.di].trim();
        const sal = salaryMap.get(normName(name));
        // نجمع مرتب وعمولة كل شهر ضمن الفترة المختارة (مطابقة برقم الشهر)؛ صف بلا شهر يُحسب مرة لكل شهر نشاط
        let fixed = 0, extra = 0, salMonths = 0, missing = 0;
        if(sal){
          scopeMonths.forEach(mi=>{
            const row = sal.get(monthNum(mi)) || sal.get(0);
            if(row){ fixed += row.fixed; extra += row.extra; salMonths++; }
            else if(g.months.has(mi)) missing++;
          });
        }
        const hasSalary = salMonths>0;
        const cost = hasSalary ? fixed+extra : null;
        return { name, branch: branchOf(g.di), customers:g.clients.size, reqs:g.reqs, ships:g.ships,
          fixed: hasSalary ? fixed : null, extra: hasSalary ? extra : null, months: salMonths, missing,
          cost, perShip: (hasSalary && g.ships>0) ? cost/g.ships : null, hasSalary };
      }).sort((a,b)=>b.ships-a.ships || b.reqs-a.reqs);
      rows.forEach((r,i)=>{ r.rank = i+1; });

      const allClients = new Set(); agg.fr.forEach(r=>allClients.add(r[6]));
      const costed = rows.filter(r=>r.hasSalary);
      const costTotal = costed.reduce((s,r)=>s+r.cost,0);
      const shipsCosted = costed.reduce((s,r)=>s+r.ships,0);
      const avgPerShip = shipsCosted>0 ? costTotal/shipsCosted : null;
      const noSalary = rows.filter(r=>!r.hasSalary);
      const partial = costed.filter(r=>r.missing>0);
      const zeroShips = costed.filter(r=>r.ships===0);
      const ranked = costed.filter(r=>r.perShip!=null).sort((a,b)=>b.perShip-a.perShip);

      R.kpis = [
        kpi(t('kpiActiveCouriers'), fmtNum(rows.length), 'main'),
        kpi(t('kpiTotalShipments'), fmtNum(agg.ships), 'main'),
        kpi(t('rtKpiCustomers'), fmtNum(allClients.size), 'main'),
        kpi(t('rtKpiAvgCostShip'), avgPerShip==null ? '—' : money2(avgPerShip), 'main'),
        kpi(t('rtKpiNoSalary'), fmtNum(noSalary.length), noSalary.length ? 'bad' : 'good')
      ];
      if(rows.length){
        R.keyPoints.push(t('rtDcPoint1',{n:ltr(fmtNum(rows.length)), ships:ltr(fmtNum(agg.ships)), cust:ltr(fmtNum(allClients.size))}));
        if(avgPerShip!=null) R.keyPoints.push(t('rtDcPoint2',{avg:ltr(money2(avgPerShip))}));
        if(ranked[0]) R.keyPoints.push(t('rtDcPoint3',{name:esc(ranked[0].name), cost:ltr(money2(ranked[0].perShip))}));
        if(noSalary.length) R.keyPoints.push(t('rtDcPoint4',{n:ltr(fmtNum(noSalary.length))}));
      }
      if(ranked.length) R.findings.push({ key:'dchigh', label:t('rtFindDcHigh'),
        detail: ranked.slice(0,5).map(r=>`${r.name} (${money2(r.perShip)})`).join(', ') });
      if(noSalary.length) R.findings.push({ key:'dcnosalary', label:t('rtFindDcNoSalary'),
        detail: noSalary.slice(0,8).map(r=>r.name).join(', ') + (noSalary.length>8 ? ` +${noSalary.length-8}` : '') });
      if(partial.length) R.findings.push({ key:'dcpartial', label:t('rtFindDcPartial'),
        detail: partial.slice(0,8).map(r=>r.name).join(', ') + (partial.length>8 ? ` +${partial.length-8}` : '') });
      if(zeroShips.length) R.findings.push({ key:'dczero', label:t('rtFindDcZero'),
        detail: zeroShips.slice(0,8).map(r=>r.name).join(', ') + (zeroShips.length>8 ? ` +${zeroShips.length-8}` : '') });

      R.notes.push(t('rnDcMethod'));
      R.notes.push(t('rnDcNoShip'));
      if(meta.hasShipments===false) R.notes.push(t('shipmentsColMissing'));
      R.body = { rows, totals:{ couriers:rows.length, customers:allClients.size, reqs:agg.total, ships:agg.ships, cost:costTotal, avgPerShip } };
      R.managementMessage = R.keyPoints;
      return R;
    }

    // ======================================================================
    // 7) البيك أب بتكلفة خارجية (Extra Fees > 0) — لكل عميل
    // ======================================================================
    function buildExternal(agg, state){
      const R = skeleton('external', agg, state);
      const ext = agg.fr.filter(r=>r[9]>0);
      const m = new Map();
      ext.forEach(r=>{
        let g = m.get(r[6]);
        if(!g){ g = { ci:r[6], reqs:0, ships:0, cost:0 }; m.set(r[6], g); }
        g.reqs += r[8]; g.ships += (r[10]||0); g.cost += r[9];
      });
      const rows = Array.from(m.values()).map(g=>({
        name: clients[g.ci], reqs:g.reqs, ships:g.ships, cost:g.cost, perShip: g.ships>0 ? g.cost/g.ships : null
      })).sort((a,b)=>b.cost-a.cost);
      rows.forEach((r,i)=>{ r.rank = i+1; });
      const reqs = rows.reduce((s,r)=>s+r.reqs,0);
      const ships = rows.reduce((s,r)=>s+r.ships,0);
      const cost = rows.reduce((s,r)=>s+r.cost,0);
      const avg = ships>0 ? cost/ships : null;
      const shareShips = pct(ships, agg.ships);
      const perShipRanked = rows.filter(r=>r.perShip!=null).sort((a,b)=>b.perShip-a.perShip);

      R.kpis = [
        kpi(t('rtKpiExtReq'), fmtNum(reqs), 'main'),
        kpi(t('rtKpiExtShips'), fmtNum(ships), 'main'),
        kpi(t('rtKpiCustomers'), fmtNum(rows.length), 'main'),
        kpi(t('rtKpiExtCost'), money(cost), 'main'),
        kpi(t('rtKpiAvgCostShip'), avg==null ? '—' : money2(avg), 'main'),
        kpi(t('rtKpiExtShare'), p1(shareShips), 'main')
      ];
      if(rows.length){
        R.keyPoints.push(t('rtExPoint1',{req:ltr(fmtNum(reqs)), ships:ltr(fmtNum(ships)), cust:ltr(fmtNum(rows.length))}));
        if(avg!=null) R.keyPoints.push(t('rtExPoint2',{cost:ltr(money(cost)), avg:ltr(money2(avg))}));
        R.keyPoints.push(t('rtExPoint3',{name:esc(rows[0].name), cost:ltr(money(rows[0].cost))}));
        R.findings.push({ key:'extop', label:t('rtFindExTop'),
          detail: rows.slice(0,5).map(r=>`${r.name} (${money(r.cost)})`).join(', ') });
        if(perShipRanked.length) R.findings.push({ key:'excostly', label:t('rtFindExCostly'),
          detail: perShipRanked.slice(0,5).map(r=>`${r.name} (${money2(r.perShip)})`).join(', ') });
      }
      R.notes.push(t('rnExMethod'));
      R.notes.push(t('rnDcNoShip'));
      if(meta.hasShipments===false) R.notes.push(t('shipmentsColMissing'));
      R.body = { rows, totals:{ reqs, ships, customers:rows.length, cost, avg, shareShips } };
      R.managementMessage = R.keyPoints;
      return R;
    }

    // ======================================================================
    // 8) حالة الطلبات (تم / فشل) حسب الحالة والشهر ونوع الطلب والمدينة
    // ======================================================================
    function buildStatus(agg, state){
      const R = skeleton('status', agg, state);
      const sm = new Map();
      agg.fr.forEach(r=>{ const g = sm.get(r[5]) || { si:r[5], total:0, ships:0 }; g.total += r[8]; g.ships += (r[10]||0); sm.set(r[5], g); });
      const statusRows = Array.from(sm.values()).map(g=>({ name: statusLabel(statuses[g.si]), total:g.total, share:pct(g.total, agg.total), ships:g.ships, isDone:g.si===DONE_IDX, isFail:g.si===FAIL_IDX }))
        .sort(byTotalDesc);
      const dim = (keyFn, nameFn) => group(agg.fr, keyFn).map(g=>({ name:nameFn(g.key), key:g.key, total:g.total, done:g.done, fail:g.fail, rate:rateOf(g) }));
      const monthRows = dim(r=>r[0], k=>monthLabel(months[k])).sort((a,b)=>a.key-b.key);
      const typeRows = dim(r=>r[4], k=>typeLabel(types[k])).sort(byTotalDesc);
      const cityRows = dim(r=>r[1], k=>cities[k]).sort(byTotalDesc).slice(0,TOP_N);
      const reasonRows = Object.keys(agg.reasonAgg).filter(ri=>reasons[ri]!==NA_REASON)
        .map(ri=>({ name:reasons[ri], total:agg.reasonAgg[ri], share:pct(agg.reasonAgg[ri], agg.fail) })).sort(byTotalDesc).slice(0,5);
      const rate = pct(agg.done, agg.total);
      const other = agg.total - agg.done - agg.fail;

      R.kpis = [
        kpi(t('kpiTotalRequests'), fmtNum(agg.total), 'main'),
        kpi(t('kpiTotalShipments'), fmtNum(agg.ships||0), 'main'),
        kpi(t('kpiCompleted'), fmtNum(agg.done), 'good'),
        kpi(t('kpiFailed'), fmtNum(agg.fail), agg.fail ? 'bad' : 'good'),
        kpi(t('kpiSuccessRate'), p1(rate), 'good')
      ];
      if(agg.total){
        R.keyPoints.push(t('rtStPoint1',{total:ltr(fmtNum(agg.total)), done:ltr(fmtNum(agg.done)), fail:ltr(fmtNum(agg.fail)), rate:ltr(p1(rate))}));
        if(typeRows[0]) R.keyPoints.push(t('rtStPoint2',{name:esc(typeRows[0].name), n:ltr(fmtNum(typeRows[0].total)), rate:ltr(p1(typeRows[0].rate))}));
        if(reasonRows[0]) R.keyPoints.push(t('rtStPoint3',{name:esc(reasonRows[0].name), n:ltr(fmtNum(reasonRows[0].total)), share:ltr(p1(reasonRows[0].share))}));
        if(other>0) R.keyPoints.push(t('rtStPoint4',{n:ltr(fmtNum(other))}));
      }
      if(reasonRows.length) R.findings.push({ key:'streason', label:t('reportAttentionTopReason'),
        detail: reasonRows.slice(0,3).map(r=>`${r.name} (${fmtNum(r.total)})`).join(', ') });
      const weakTypes = typeRows.filter(r=>r.total>=MIN_C && rateClass(r.rate)==='rate-bad');
      if(weakTypes.length) R.findings.push({ key:'sttype', label:t('rtFindStType'),
        detail: weakTypes.map(r=>`${r.name} (${r.rate.toFixed(1)}%)`).join(', ') });
      R.notes.push(t('rnStScope'));
      R.body = { statusRows, monthRows, typeRows, cityRows, reasonRows, totals:{ total:agg.total, done:agg.done, fail:agg.fail, rate, ships:agg.ships||0 } };
      R.managementMessage = R.keyPoints;
      return R;
    }

    // ======================================================================
    // 9) جودة العملاء: الشحنات لكل طلب (agg.cq من aggregations.js)
    // ======================================================================
    function buildClientQuality(agg, state){
      const R = skeleton('clientQuality', agg, state);
      const cq = agg.cq || { avg:0, list:[], thresholds:thresholds.clientQuality };
      const TH = cq.thresholds || thresholds.clientQuality;
      const toRow = c => ({ name: clients[c.cl], reqs:c.reqs, done:c.done, failRate: pct(c.reqs-c.done, c.reqs), ships:c.ships, perReq:c.perReq, ratio:c.ratio, cls:c.cls });
      const all = cq.list.map(toRow);
      const by = k => all.filter(r=>r.cls===k);
      const good = by('good').sort((a,b)=>b.ratio-a.ratio || b.ships-a.ships);
      const low  = by('low').sort((a,b)=>b.reqs-a.reqs || a.ratio-b.ratio);
      const mid = by('mid'), na = by('na');
      const lowReqs = low.reduce((s,r)=>s+r.reqs,0), lowShips = low.reduce((s,r)=>s+r.ships,0);
      const goodReqs = good.reduce((s,r)=>s+r.reqs,0), goodShips = good.reduce((s,r)=>s+r.ships,0);

      R.kpis = [
        kpi(t('rtKpiActiveMerchants'), fmtNum(all.length), 'main'),
        kpi(t('rtCqKpiAvg'), cq.avg.toFixed(1), 'main'),
        kpi(t('rtCqKpiGood'), fmtNum(good.length), 'good'),
        kpi(t('rtCqKpiLow'), fmtNum(low.length), low.length ? 'bad' : 'good'),
        kpi(t('rtCqKpiNa',{n:TH.minReqs}), fmtNum(na.length), 'main')
      ];
      if(all.length){
        R.keyPoints.push(t('rtCqPoint1',{avg:ltr(cq.avg.toFixed(1)), ships:ltr(fmtNum(cq.totShip)), reqs:ltr(fmtNum(cq.totReq))}));
        if(good.length) R.keyPoints.push(t('rtCqPoint2',{n:ltr(fmtNum(good.length)), name:esc(good[0].name), per:ltr(good[0].perReq.toFixed(1))}));
        if(low.length) R.keyPoints.push(t('rtCqPoint3',{n:ltr(fmtNum(low.length)), reqs:ltr(fmtNum(lowReqs)), pr:ltr(p1(pct(lowReqs, cq.totReq))), ships:ltr(fmtNum(lowShips)), ps:ltr(p1(pct(lowShips, cq.totShip)))}));
      }
      if(low.length) R.findings.push({ key:'cqlow', label:t('rtFindCqLow'),
        detail: low.slice(0,5).map(r=>`${r.name} (${fmtNum(r.reqs)} / ${fmtNum(r.ships)})`).join(', ') });
      if(good.length) R.findings.push({ key:'cqgood', label:t('rtFindCqGood'),
        detail: good.slice(0,5).map(r=>`${r.name} (${r.perReq.toFixed(1)})`).join(', ') });
      R.notes.push(t('rnCqMethod',{min:TH.minReqs, good:TH.good, low:TH.low}));
      R.notes.push(t('rnCqProposed'));
      if(meta.hasShipments===false) R.notes.push(t('shipmentsColMissing'));
      if(state.clientQuality && state.clientQuality!=='all') R.notes.push(t('rnCqFilterOn'));
      R.body = { good: good.slice(0,TOP_N), low: low.slice(0,TOP_N), goodCount:good.length, lowCount:low.length, midCount:mid.length, naCount:na.length,
        avg:cq.avg, goodReqs, goodShips, lowReqs, lowShips, totReq:cq.totReq, totShip:cq.totShip, minReqs:TH.minReqs };
      R.managementMessage = R.keyPoints;
      return R;
    }

    const BUILDERS = { drivers:buildDrivers, merchants:buildMerchants, reasons:buildReasons, fees:buildFees, branches:buildBranches,
      driverCost:buildDriverCost, external:buildExternal, status:buildStatus, clientQuality:buildClientQuality };
    // التقارير الخمسة الأصلية تحصل على كارت «إجمالي الشحنات» هنا؛ التقريران الجديدان يضيفانه بنفسيهما.
    const HAS_OWN_SHIPMENTS_KPI = { driverCost:true, external:true, status:true };
    function build(type, agg, state){
      const R = BUILDERS[type](agg, state);
      if(!HAS_OWN_SHIPMENTS_KPI[type]) R.kpis.splice(Math.min(2, R.kpis.length), 0, kpi(t('kpiTotalShipments'), fmtNum(agg.ships||0), 'main'));
      return R;
    }

    return { build };
  }

  return { REPORT_TYPES, create };
})();
