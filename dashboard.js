const CONFIG = window.ARRIVE_CONFIG || {};

(function(){


  const appState = { lang: (CONFIG.DEFAULT_LANG==='ar'?'ar':'en') };
  // PHASE 0A: i18n strings + formatting helpers now live in i18n.js /
  // formatters.js. These wrappers keep every call site below (t(...),
  // typeLabel(...), esc(...), etc.) unchanged — only where the data/logic
  // lives has moved.
  function t(key, vars){ return DashboardI18n.t(appState.lang, key, vars); }
  function typeLabel(v){ return DashboardI18n.typeLabel(appState.lang, v); }
  function statusLabel(v){ return DashboardI18n.statusLabel(appState.lang, v); }
  const esc = DashboardFormatters.esc;

  function applyStaticTranslations(){
    document.documentElement.lang = appState.lang;
    document.documentElement.dir = appState.lang==='ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach(el=>{
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{
      const key = el.getAttribute('data-i18n-placeholder');
      el.setAttribute('placeholder', t(key));
    });
  }

  document.getElementById('langBtn').addEventListener('click', ()=>{
    appState.lang = appState.lang==='ar' ? 'en' : 'ar';
    applyStaticTranslations();
    if(window.__dashboardRender) window.__dashboardRender();
  });
  applyStaticTranslations();

  const loadingEl = document.getElementById('loadingScreen');
  const errorEl = document.getElementById('errorScreen');
  const rootEl = document.getElementById('dashboardRoot');
  const refreshBtn = document.getElementById('refreshBtn');
  const bannerEl = document.getElementById('refreshBanner');
  const bannerTextEl = document.getElementById('refreshBannerText');
  const syncStatusLabel = document.getElementById('syncStatusLabel');

  function showLoading(){ loadingEl.classList.remove('hidden'); errorEl.classList.add('hidden'); rootEl.classList.add('hidden'); }
  function showError(msg){ loadingEl.classList.add('hidden'); errorEl.classList.remove('hidden'); rootEl.classList.add('hidden'); document.getElementById('errorDetail').textContent = msg; }
  function showDashboard(){ loadingEl.classList.add('hidden'); errorEl.classList.add('hidden'); rootEl.classList.remove('hidden'); }

  let lastSyncDate = null;
  function syncLabelText(){
    if(!lastSyncDate) return t('syncNever');
    const mins = Math.floor((Date.now() - lastSyncDate) / 60000);
    return mins < 1 ? t('syncJustNow') : t('syncMinAgo', {n:mins});
  }
  function refreshSyncLabel(){ if(syncStatusLabel) syncStatusLabel.textContent = syncLabelText(); }
  setInterval(refreshSyncLabel, 30000);

  function hideBanner(){ bannerEl.classList.add('hidden'); }
  function showBanner(msg){ bannerTextEl.textContent = t('bannerRefreshFailed', {msg}); bannerEl.classList.remove('hidden'); }
  document.getElementById('bannerDismissBtn').addEventListener('click', hideBanner);
  document.getElementById('bannerRetryBtn').addEventListener('click', ()=> controller.refreshNow());

  // Reusable ARRIVE data service: same fetch/retry/timeout/auto-refresh
  // logic every ARRIVE dashboard uses. Only the handlers below are
  // First-Mile-specific (what to do with the data once it arrives).
  const controller = ArriveDataService.createController(CONFIG, {
    onLoading(isFirstLoad){
      if(isFirstLoad){ showLoading(); }
      else { refreshBtn.classList.add('spinning'); hideBanner(); }
    },
    onSuccess(data, isFirstLoad){
      lastSyncDate = new Date();
      refreshSyncLabel();
      refreshBtn.classList.remove('spinning');
      if(isFirstLoad){ showDashboard(); }
      bootstrapOrUpdate(data, isFirstLoad);
    },
    onError(msg, isFirstLoad){
      refreshBtn.classList.remove('spinning');
      if(isFirstLoad){ showError(msg); }
      else { showBanner(msg); }
    }
  });
  document.getElementById('retryBtn').addEventListener('click', ()=> controller.refreshNow());
  refreshBtn.addEventListener('click', ()=> controller.refreshNow());
  controller.start();

  // ---- keep user filter selections across a background refresh ----
  // PHASE 1: extended to capture every new filter dimension (area/branch/
  // driver-exact/merchant/reason/fees mode/period mode/search queries) —
  // not just the handful the pre-Phase-1 panel had — so a background
  // auto-refresh never silently drops an enterprise-style filter the
  // user built up.
  let filterSnapshot = null;
  function resetInteractiveNodes(){
    ['periodFromDate','periodToDate','globalSearch','driverSearch','merchantSearch','areaGlobalSearch',
     'driverTableSearch','areaTableSearch','clientTableSearch','resetBtn','exportBtn'].forEach(id=>{
      const el = document.getElementById(id);
      if(el){ const clone = el.cloneNode(true); el.parentNode.replaceChild(clone, el); }
    });
    document.querySelectorAll('table thead th[data-key]').forEach(th=>{
      const clone = th.cloneNode(true);
      th.parentNode.replaceChild(clone, th);
    });
  }
  function bootstrapOrUpdate(data, isFirstLoad){
    if(!isFirstLoad){
      const s = window.__dashboardState;
      filterSnapshot = s ? {
        periodMode: s.periodMode, monthFrom: s.monthFrom, monthTo: s.monthTo,
        selectedMonths: Array.from(s.selectedMonths), activePreset: s.activePreset,
        customFrom: s.customFrom, customTo: s.customTo,
        cities: Array.from(s.cities), areas: Array.from(s.areas), branches: Array.from(s.branches),
        types: Array.from(s.types), statuses: Array.from(s.statuses),
        drivers: Array.from(s.drivers), clients: Array.from(s.clients), reasons: Array.from(s.reasons),
        feesMode: s.feesMode,
        globalQuery: s.globalQuery, driverQuery: s.driverQuery, clientQuery: s.clientQuery, areaQuery: s.areaQuery
      } : null;
      resetInteractiveNodes();
      if(filterSnapshot){
        const fill = (id,val)=>{ const el=document.getElementById(id); if(el) el.value = val || ''; };
        fill('periodFromDate', filterSnapshot.customFrom); fill('periodToDate', filterSnapshot.customTo);
        fill('globalSearch', filterSnapshot.globalQuery); fill('driverSearch', filterSnapshot.driverQuery);
        fill('merchantSearch', filterSnapshot.clientQuery); fill('areaGlobalSearch', filterSnapshot.areaQuery);
      }
    }
    initDashboard(data);
  }

  function initDashboard(DATA){
    const { months, cities, areas, drivers, clients, types, statuses, reasons, rows, driverBranch, salaryRef, meta } = DATA;
    const DONE_IDX = statuses.indexOf('Done');
    const FAIL_IDX = statuses.indexOf('Fail');
    const TYPE_COLORS = ['#C8912B','#0F7A6C','#101B30','#C1432E'];

    // PHASE 1: the canonical filtering engine — see filters.js. Built once
    // per dataset load; every filter-affecting function below reads
    // through it instead of re-implementing row matching.
    const filterEngine = DashboardFilters.createFilterEngine({ rows, months, cities, areas, drivers, clients, types, statuses, reasons, driverBranch });
    const branches = filterEngine.branches;

    const state = {
      // period
      periodMode: 'range', // 'range' | 'multi'
      monthFrom: 0, monthTo: months.length - 1,
      selectedMonths: new Set(months.map((_,i)=>i)),
      activePreset: null, customFrom: '', customTo: '',
      // location
      cities: new Set(cities), areas: new Set(areas), branches: new Set(branches),
      // operational
      types: new Set(types), statuses: new Set(statuses),
      drivers: new Set(drivers), clients: new Set(clients), reasons: new Set(reasons),
      feesMode: 'all', recordedMode: 'all', // recordedMode: UI-only, see filters.js header note
      // search
      globalQuery: '', driverQuery: '', clientQuery: '', areaQuery: '',
      // table-local (unrelated to Phase 1; unchanged since Phase 0)
      driverSort:{key:'count', dir:-1}, driverTableFilter:'', driverPage:1, driverPageSize:12,
      areaSort:{key:'count', dir:-1}, areaTableFilter:'', areaPage:1, areaPageSize:12,
      clientSort:{key:'count', dir:-1}, clientTableFilter:'', clientPage:1, clientPageSize:12
    };
    if(filterSnapshot){
      state.periodMode = filterSnapshot.periodMode || 'range';
      state.monthFrom = Math.min(filterSnapshot.monthFrom, months.length-1);
      state.monthTo = Math.min(filterSnapshot.monthTo, months.length-1);
      if(state.monthFrom > state.monthTo) state.monthFrom = state.monthTo;
      state.selectedMonths = new Set(filterSnapshot.selectedMonths.filter(i=>i<months.length));
      if(state.selectedMonths.size===0) state.selectedMonths = new Set(months.map((_,i)=>i));
      state.activePreset = filterSnapshot.activePreset || null;
      state.customFrom = filterSnapshot.customFrom || ''; state.customTo = filterSnapshot.customTo || '';
      // intersect every set with the current lookup arrays so a value that
      // disappeared from the refreshed sheet doesn't stick around silently
      const restore = (arr, universe) => { const s = new Set(arr.filter(v=>universe.includes(v))); return s.size ? s : new Set(universe); };
      state.cities = restore(filterSnapshot.cities, cities);
      state.areas = restore(filterSnapshot.areas, areas);
      state.branches = restore(filterSnapshot.branches, branches);
      state.types = restore(filterSnapshot.types, types);
      state.statuses = restore(filterSnapshot.statuses, statuses);
      state.drivers = restore(filterSnapshot.drivers, drivers);
      state.clients = restore(filterSnapshot.clients, clients);
      state.reasons = restore(filterSnapshot.reasons, reasons);
      state.feesMode = filterSnapshot.feesMode || 'all';
      state.globalQuery = filterSnapshot.globalQuery || '';
      state.driverQuery = filterSnapshot.driverQuery || '';
      state.clientQuery = filterSnapshot.clientQuery || '';
      state.areaQuery = filterSnapshot.areaQuery || '';
    }
    window.__dashboardState = state;

    const ICONS = {
      total:'<path d="M4 7h16M4 12h16M4 17h10"/>', done:'<path d="M20 6L9 17l-5-5"/>', fail:'<path d="M18 6L6 18M6 6l12 12"/>',
      rate:'<path d="M3 17l6-6 4 4 8-8M21 7v6M21 7h-6"/>',
      fees:'<circle cx="12" cy="12" r="9"/><path d="M12 7v10M15 9.5a3 2.2 0 00-3-1.5c-2 0-3 1-3 2.2 0 3 6 1.5 6 4.3 0 1.2-1 2.2-3 2.2a3 2.2 0 01-3-1.5"/>',
      avgfee:'<path d="M12 3v18M17 6.5a5 3 0 00-5-2.5c-3 0-5 1.7-5 3.8 0 5 10 2.5 10 7.2 0 2.1-2 3.8-5 3.8a5 3 0 01-5-2.5"/>',
      drivers:'<circle cx="8" cy="8" r="3.2"/><circle cx="17" cy="9" r="2.6"/><path d="M2.5 20c0-3.6 2.8-6 5.5-6s5.5 2.4 5.5 6M13 20c.2-2.7 1.7-5 4.5-5 2.4 0 4.5 1.7 5 4.2"/>',
      cities:'<path d="M4 21V9l7-5 7 5v12M9 21v-6h4v6M4 21h16"/>', avgpd:'<path d="M4 19V5m4 14V9m4 10V13m4 6V7m4 12V11"/>',
      compliance:'<path d="M9 12l2 2 4-4M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z"/>'
    };
    function icon(name, color){ return `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]||''}</svg>`; }
    // PHASE 0A: extracted to formatters.js (createFormatters reads
    // appState.lang live, so behavior on language toggle is unchanged).
    const __fmt = DashboardFormatters.createFormatters(()=>appState.lang);
    function monthLabel(m){ return __fmt.monthLabel(m); }
    function locale(){ return __fmt.locale(); }
    function fmtNum(n){ return __fmt.fmtNum(n); }
    function fmtCurrency(n){ return __fmt.fmtCurrency(n); }
    function rateClass(rate){ return __fmt.rateClass(rate); }

    function refreshHeaderStatics(){
      document.getElementById('dateRangeLabel').textContent = `${meta.dateMin} → ${meta.dateMax}`;
      document.getElementById('lastUpdatedLabel').textContent = meta.dateMax;
      document.getElementById('clientCountLabel').textContent = fmtNum(meta.uniqueClients);
      document.getElementById('registeredCountLabel').textContent = fmtNum(meta.registeredMerchants);
      document.getElementById('totalRecordsLabel').textContent = fmtNum(meta.totalRecords);
    }

    // PHASE 0C: the SVG chart renderers now live in charts.js, unchanged
    // logic, wired up with the closures they used to read directly (t,
    // fmtNum, esc).
    const __charts = DashboardCharts.createCharts({ t, fmtNum, esc });
    const { renderComboChart, renderHStackedBar, renderHBar, renderDonut } = __charts;

    // PHASE 0D + 1: filteredRows() now delegates to filters.js (the
    // canonical engine); aggregate() is an unrelated pure reduction.
    const __agg = DashboardAggregations.createAggregations({ state, DONE_IDX, FAIL_IDX, filterEngine });
    const { filteredRows, aggregate } = __agg;
    function trendHtml(curr, prev, higherIsBetter){
      if(prev===null||prev===undefined||prev===0) return `<span class="trend flat">${t('trendNA')}</span>`;
      const diff=curr-prev, pct=diff/prev*100;
      if(Math.abs(pct)<0.5) return `<span class="trend flat">${t('trendFlat')}</span>`;
      const good = higherIsBetter ? pct>0 : pct<0; const arrow = pct>0?'▲':'▼';
      return `<span class="trend ${good?'up':'down'}">${arrow} ${Math.abs(pct).toFixed(1)}% ${t('trendVsPrior')}</span>`;
    }

    // PHASE 0B: the 3 sortable-table renderers + pagination helpers live
    // in tables.js. Their pagination click handlers only need to redraw
    // tables, so they call renderTables() (see PHASE 1 perf note below),
    // not the full renderAll().
    const __tables = DashboardTables.createTables({ state, drivers, areas, clients, t, esc, fmtNum, rateClass, render: ()=>renderTables() });
    function renderDriverTable(driverAgg){ __tables.renderDriverTable(driverAgg); }
    function renderAreaTable(areaAgg){ __tables.renderAreaTable(areaAgg); }
    function renderClientTable(clientAgg, totalAll){ __tables.renderClientTable(clientAgg, totalAll); }

    // PHASE 1 — performance requirement: "filtering must not rerender
    // charts unnecessarily; only affected components should update."
    // The heavy per-render work (filtering the full row set + building
    // every per-dimension aggregate) now happens once in renderAll() and
    // is cached; renderTables() (table-local search/sort/pagination —
    // unrelated to the Phase 1 filter panel) reuses that cache instead
    // of recomputing it, exactly like the KPIs/charts/summary do.
    let cachedAgg = null;
    function computeAggregates(){
      const fr = filteredRows();
      const driverAgg = {}, areaAgg = {}, clientAgg = {}, reasonAgg = {}, cityAgg = {}, typeAgg = {}, branchAgg = {};
      const driverSet = new Set(), citySet = new Set();
      let total=0, done=0, fail=0, fees=0;
      fr.forEach(r=>{
        const [,ci,ai,di,ti,si,cli,ri,count,f] = r;
        total+=count; fees+=f; if(si===DONE_IDX) done+=count; else if(si===FAIL_IDX) fail+=count;
        driverSet.add(di); citySet.add(ci);
        if(!driverAgg[di]) driverAgg[di]={count:0,done:0,fees:0};
        driverAgg[di].count+=count; driverAgg[di].fees+=f; if(si===DONE_IDX) driverAgg[di].done+=count;
        if(!areaAgg[ai]) areaAgg[ai]={count:0,done:0,fees:0,city:cities[ci]};
        areaAgg[ai].count+=count; areaAgg[ai].fees+=f; if(si===DONE_IDX) areaAgg[ai].done+=count;
        if(!clientAgg[cli]) clientAgg[cli]={count:0,done:0};
        clientAgg[cli].count+=count; if(si===DONE_IDX) clientAgg[cli].done+=count;
        if(si===FAIL_IDX){ reasonAgg[ri]=(reasonAgg[ri]||0)+count; }
        if(!cityAgg[cities[ci]]) cityAgg[cities[ci]]={done:0,fail:0,fees:0};
        if(si===DONE_IDX) cityAgg[cities[ci]].done+=count; else if(si===FAIL_IDX) cityAgg[cities[ci]].fail+=count;
        cityAgg[cities[ci]].fees += f;
        typeAgg[types[ti]] = (typeAgg[types[ti]]||0)+count;
        const br = driverBranch[di];
        if(br){ branchAgg[br]=(branchAgg[br]||0)+count; }
      });
      cachedAgg = { fr, driverAgg, areaAgg, clientAgg, reasonAgg, cityAgg, typeAgg, branchAgg, total, done, fail, fees, driverSet, citySet };
      return cachedAgg;
    }

    function renderAll(){
      refreshHeaderStatics();
      filterUI.renderActiveChips();

      const agg = computeAggregates();
      const { fr, driverAgg, areaAgg, clientAgg, reasonAgg, cityAgg, typeAgg, branchAgg, total, done, fail, fees, driverSet, citySet } = agg;

      document.getElementById('filteredRecordCount').innerHTML =
        `${t('filteredRecordsLabel')}: <b>${fmtNum(total)}</b> ${t('ofTotalLabel',{n:fmtNum(meta.totalRecords)})}`;

      const span = state.monthTo - state.monthFrom + 1;
      const prevTo = state.monthFrom - 1, prevFrom = prevTo - span + 1;
      let prevAgg = null;
      if(prevFrom >= 0 && state.periodMode==='range'){
        // PHASE 1: reuses the SAME predicate as the current period via
        // filterEngine.filterRowsByMonthRange — no more hand-duplicated
        // filter logic for the "previous period" comparison.
        const prevRows = filterEngine.filterRowsByMonthRange(state, prevFrom, prevTo);
        prevAgg = aggregate(prevRows);
      }

      const successRate = total ? done/total*100 : 0;
      const avgFee = total ? fees/total : 0;
      const avgPerDriver = driverSet.size ? total/driverSet.size : 0;
      const prevSuccessRate = prevAgg && prevAgg.total ? prevAgg.done/prevAgg.total*100 : null;
      const recordedTotal = meta.recordedYes + meta.recordedNo;
      const complianceRate = recordedTotal ? meta.recordedYes/recordedTotal*100 : 0;

      const kpis = [
        {label:t('kpiTotalRequests'), icon:'total', value:fmtNum(total), foot:trendHtml(total, prevAgg?prevAgg.total:null, true)},
        {label:t('kpiCompleted'), icon:'done', value:fmtNum(done), foot:`${total?(done/total*100).toFixed(1):'0'}% ${t('footOfTotal')}`},
        {label:t('kpiFailed'), icon:'fail', value:fmtNum(fail), foot:`${total?(fail/total*100).toFixed(1):'0'}% ${t('footOfTotal')}`},
        {label:t('kpiSuccessRate'), icon:'rate', value:successRate.toFixed(1)+'%', foot:trendHtml(successRate, prevSuccessRate, true)},
        {label:t('kpiExtraFees'), icon:'fees', value:fmtCurrency(fees), foot:trendHtml(fees, prevAgg?prevAgg.fees:null, true)},
        {label:t('kpiAvgExtraFee'), icon:'avgfee', value:avgFee.toFixed(1)+(appState.lang==='ar'?' جنيه':' EGP'), foot:t('footPerRequest')},
        {label:t('kpiAvgPerCourier'), icon:'avgpd', value:avgPerDriver.toFixed(1), foot:t('footAcrossCouriers',{n:fmtNum(driverSet.size)})},
        {label:t('kpiActiveCouriers'), icon:'drivers', value:fmtNum(driverSet.size), foot:t('footOfRoster',{n:fmtNum(drivers.length)})},
        {label:t('kpiActiveCities'), icon:'cities', value:fmtNum(citySet.size), foot:t('footOfCovered',{n:fmtNum(cities.length)})},
        {label:t('kpiCompliance'), icon:'compliance', value:complianceRate.toFixed(0)+'%', foot:t('footAllTimeOf',{n:fmtNum(recordedTotal)})}
      ];
      const kpiRow = document.getElementById('kpiRow'); kpiRow.innerHTML='';
      kpis.forEach(k=>{ const el=document.createElement('div'); el.className='kpi fade-in';
        el.innerHTML=`<div class="kpi-icon">${icon(k.icon,'#C8912B')}</div><div class="kpi-label">${esc(k.label)}</div><div class="kpi-value">${k.value}</div><div class="kpi-foot">${k.foot}</div>`;
        kpiRow.appendChild(el); });

      renderSummary(total, done, fail, fees, successRate, driverAgg, areaAgg, clientAgg, reasonAgg);
      renderInsights(driverAgg, areaAgg, clientAgg, reasonAgg, cityAgg, typeAgg, branchAgg);

      const monthAgg = {};
      (state.periodMode==='multi' ? Array.from(state.selectedMonths) : Array.from({length:state.monthTo-state.monthFrom+1},(_,k)=>state.monthFrom+k))
        .forEach(i=>{ monthAgg[i]={done:0,fail:0}; });
      fr.forEach(r=>{ const [mi,,,,,si,,,count]=r; if(!monthAgg[mi]) return; if(si===DONE_IDX) monthAgg[mi].done+=count; else if(si===FAIL_IDX) monthAgg[mi].fail+=count; });
      const monthKeys=Object.keys(monthAgg).map(Number).sort((a,b)=>a-b);
      renderComboChart('monthlyChart', monthKeys.map(i=>monthLabel(months[i])), monthKeys.map(i=>monthAgg[i].done), monthKeys.map(i=>monthAgg[i].fail),
        monthKeys.map(i=>{ const tt=monthAgg[i].done+monthAgg[i].fail; return tt?+(monthAgg[i].done/tt*100).toFixed(1):null; }));
      document.getElementById('monthlyPanelNote').textContent = t('monthsInRange',{n:monthKeys.length});

      const activeCities = cities.filter(c=>state.cities.has(c) && cityAgg[c] && (cityAgg[c].done+cityAgg[c].fail)>0)
        .sort((a,b)=>(cityAgg[b].done+cityAgg[b].fail)-(cityAgg[a].done+cityAgg[a].fail));
      renderHStackedBar('cityChart', activeCities, activeCities.map(c=>cityAgg[c].done), activeCities.map(c=>cityAgg[c].fail));

      const activeTypes = types.filter(tp=>state.types.has(tp) && typeAgg[tp]>0);
      renderDonut('typeChart','typeLegend', activeTypes.map(typeLabel), activeTypes.map(tp=>typeAgg[tp]), activeTypes.map(tp=>TYPE_COLORS[types.indexOf(tp)%TYPE_COLORS.length]));

      const areaList = Object.keys(areaAgg).map(ai=>({idx:+ai, name:areas[ai], city:areaAgg[ai].city, count:areaAgg[ai].count, fees:areaAgg[ai].fees, done:areaAgg[ai].done}));
      const topByVolume = areaList.slice().sort((a,b)=>b.count-a.count).slice(0,10);
      renderHBar('areaChart', topByVolume.map(a=>a.name.length>26?a.name.slice(0,24)+'…':a.name), topByVolume.map(a=>a.count), '#101B30');
      const topByFees = areaList.slice().sort((a,b)=>b.fees-a.fees).slice(0,10);
      renderHBar('areaFeesChart', topByFees.map(a=>a.name.length>26?a.name.slice(0,24)+'…':a.name), topByFees.map(a=>a.fees), '#C8912B');

      const reasonList = Object.keys(reasonAgg).map(ri=>({name:reasons[ri], count:reasonAgg[ri]})).filter(r=>r.name!=='N/A').sort((a,b)=>b.count-a.count);
      renderHBar('reasonChart', reasonList.map(r=>r.name), reasonList.map(r=>r.count), '#C1432E');
      document.getElementById('reasonPanelNote').textContent = reasonList.length ? t('failedReasonNote',{n:fmtNum(reasonList.reduce((a,b)=>a+b.count,0))}) : t('noFailedInRange');

      renderTopBottomDrivers(driverAgg);
      renderRecommendations(driverAgg, areaAgg, cityAgg, reasonAgg, branchAgg);
      renderSalaryRef();
      renderDQ();

      renderTables();
    }

    // PHASE 1 perf: table-local interactions (search/sort/pagination on
    // the 3 sortable tables) call only this — it reuses the aggregates
    // renderAll() already computed instead of recomputing KPIs/charts/
    // summary/insights/recommendations for a change that can't affect them.
    function renderTables(){
      const agg = cachedAgg || computeAggregates();
      renderDriverTable(agg.driverAgg);
      renderAreaTable(agg.areaAgg);
      renderClientTable(agg.clientAgg, agg.total);
    }

    function renderSummary(total, done, fail, fees, successRate, driverAgg, areaAgg, clientAgg, reasonAgg){
      const el = document.getElementById('summaryText');
      if(total===0){ el.innerHTML = t('summaryNoData'); return; }
      const periodTxt = (state.monthFrom===0 && state.monthTo===months.length-1 && state.periodMode==='range') ? t('summaryFullDataset') : `${monthLabel(months[state.monthFrom])}–${monthLabel(months[state.monthTo])}`;
      const driverList = Object.keys(driverAgg).map(di=>({name:drivers[di].trim(), count:driverAgg[di].count, rate:driverAgg[di].count?driverAgg[di].done/driverAgg[di].count*100:0})).filter(d=>d.count>=15);
      const bestDriver = driverList.slice().sort((a,b)=>b.rate-a.rate)[0];
      const topArea = Object.keys(areaAgg).map(ai=>({name:areas[ai], count:areaAgg[ai].count})).sort((a,b)=>b.count-a.count)[0];
      const topClient = Object.keys(clientAgg).map(ci=>({name:clients[ci], count:clientAgg[ci].count})).sort((a,b)=>b.count-a.count)[0];
      const topReasonEntry = Object.keys(reasonAgg).map(ri=>({name:reasons[ri], count:reasonAgg[ri]})).filter(r=>r.name!=='N/A').sort((a,b)=>b.count-a.count)[0];
      const health = successRate>=90 ? `<span class="good">${t('summaryHealthy')}</span>` : (successRate>=75 ? t('summaryModerate') : `<span class="bad">${t('summaryConcerning')}</span>`);
      let html = t('summaryIntro',{period:periodTxt, total:fmtNum(total), rate:successRate.toFixed(1), health, fees:fmtCurrency(fees)});
      if(bestDriver) html += t('summaryBestDriver',{name:`<b>${esc(bestDriver.name)}</b>`, rate:bestDriver.rate.toFixed(1)});
      if(topArea) html += t('summaryTopArea',{area:`<b>${esc(topArea.name)}</b>`, n:fmtNum(topArea.count)});
      if(topClient) html += t('summaryTopClient',{client:`<b>${esc(topClient.name)}</b>`});
      if(topReasonEntry) html += t('summaryFailReason',{reason:`<b>${esc(topReasonEntry.name)}</b>`, n:fmtNum(topReasonEntry.count), pct:(topReasonEntry.count/fail*100).toFixed(0)});
      el.innerHTML = html;
    }

    function renderInsights(driverAgg, areaAgg, clientAgg, reasonAgg, cityAgg, typeAgg, branchAgg){
      const MIN_VOL=15;
      const driverList = Object.keys(driverAgg).map(di=>({name:drivers[di].trim(), count:driverAgg[di].count, rate:driverAgg[di].count?driverAgg[di].done/driverAgg[di].count*100:0})).filter(d=>d.count>=MIN_VOL);
      const bestDriver = driverList.slice().sort((a,b)=>b.rate-a.rate)[0];
      const worstDriver = driverList.slice().sort((a,b)=>a.rate-b.rate)[0];
      const areaList = Object.keys(areaAgg).map(ai=>({name:areas[ai], count:areaAgg[ai].count, fees:areaAgg[ai].fees}));
      const topArea = areaList.slice().sort((a,b)=>b.count-a.count)[0];
      const topFeesArea = areaList.slice().sort((a,b)=>b.fees-a.fees)[0];
      const topCity = Object.keys(cityAgg).sort((a,b)=>(cityAgg[b].done+cityAgg[b].fail)-(cityAgg[a].done+cityAgg[a].fail))[0];
      const topType = Object.keys(typeAgg).sort((a,b)=>typeAgg[b]-typeAgg[a])[0];
      const clientList = Object.keys(clientAgg).map(ci=>({name:clients[ci], count:clientAgg[ci].count}));
      const topClient = clientList.slice().sort((a,b)=>b.count-a.count)[0];
      const reasonList = Object.keys(reasonAgg).map(ri=>({name:reasons[ri], count:reasonAgg[ri]})).filter(r=>r.name!=='N/A');
      const topReason = reasonList.slice().sort((a,b)=>b.count-a.count)[0];
      const topBranch = Object.keys(branchAgg).sort((a,b)=>branchAgg[b]-branchAgg[a])[0];

      const cards=[];
      if(bestDriver) cards.push({tag:t('tagBestCourier'), main:esc(bestDriver.name), sub:t('subSuccessMin',{rate:bestDriver.rate.toFixed(1), n:fmtNum(bestDriver.count), min:MIN_VOL})});
      if(worstDriver && worstDriver.name!==bestDriver?.name) cards.push({tag:t('tagNeedsAttention'), main:esc(worstDriver.name), sub:t('subSuccessMin',{rate:worstDriver.rate.toFixed(1), n:fmtNum(worstDriver.count), min:MIN_VOL})});
      if(topClient) cards.push({tag:t('tagTopClient'), main:esc(topClient.name), sub:t('subReqRange',{n:fmtNum(topClient.count)})});
      if(topArea) cards.push({tag:t('tagTopArea'), main:esc(topArea.name), sub:t('subReqRange',{n:fmtNum(topArea.count)})});
      if(topFeesArea) cards.push({tag:t('tagHighestFeesArea'), main:esc(topFeesArea.name), sub:t('subFeesRange',{fees:fmtCurrency(topFeesArea.fees)})});
      if(topReason) cards.push({tag:t('tagMostCommonReason'), main:esc(topReason.name), sub:t('subFailedN',{n:fmtNum(topReason.count)})});
      if(topCity) cards.push({tag:t('tagMostActiveCity'), main:esc(topCity), sub:t('subFeesCity',{fees:fmtCurrency(cityAgg[topCity].fees)})});
      if(topType) cards.push({tag:t('tagDominantType'), main:typeLabel(topType), sub:t('subReqRangeType',{n:fmtNum(typeAgg[topType])})});
      if(topBranch) cards.push({tag:t('tagTopBranch'), main:esc(topBranch), sub:t('subBranchCoverage',{n:fmtNum(branchAgg[topBranch]), c:meta.branchCoverage, t:meta.branchTotal})});

      const row=document.getElementById('insightRow'); row.innerHTML='';
      cards.forEach(c=>{ const el=document.createElement('div'); el.className='insight-card fade-in';
        el.innerHTML=`<div class="insight-tag">${esc(c.tag)}</div><div class="insight-main">${c.main}</div><div class="insight-sub">${esc(c.sub)}</div>`; row.appendChild(el); });
    }

    function renderTopBottomDrivers(driverAgg){
      const MIN_VOL=15;
      const list = Object.keys(driverAgg).map(di=>({name:drivers[di].trim(), count:driverAgg[di].count, rate:driverAgg[di].count?driverAgg[di].done/driverAgg[di].count*100:0})).filter(d=>d.count>=MIN_VOL);
      const top = list.slice().sort((a,b)=>b.rate-a.rate).slice(0,10);
      const bottom = list.slice().sort((a,b)=>a.rate-b.rate).slice(0,10);
      const renderList = (el, arr) => {
        el.innerHTML = arr.length===0 ? `<div class="empty-state">${t('notEnoughQualifying',{min:MIN_VOL})}</div>` :
          arr.map((d,i)=>`<div class="mini-lb-row"><span class="rnk">${i+1}</span><span class="nm">${esc(d.name)}</span><span class="vl">${d.rate.toFixed(1)}% · ${fmtNum(d.count)}</span></div>`).join('');
      };
      renderList(document.getElementById('topDriversList'), top);
      renderList(document.getElementById('bottomDriversList'), bottom);
    }

    function renderRecommendations(driverAgg, areaAgg, cityAgg, reasonAgg, branchAgg){
      const items=[];
      const areaList = Object.keys(areaAgg).map(ai=>({name:areas[ai], count:areaAgg[ai].count, fees:areaAgg[ai].fees}));
      const topArea = areaList.slice().sort((a,b)=>b.count-a.count)[0];
      const feesArea = areaList.slice().sort((a,b)=>b.fees-a.fees)[0];
      const driverList = Object.keys(driverAgg).map(di=>({name:drivers[di].trim(), count:driverAgg[di].count, rate:driverAgg[di].count?driverAgg[di].done/driverAgg[di].count*100:0})).filter(d=>d.count>=15);
      const topDriver = driverList.slice().sort((a,b)=>b.count-a.count)[0];
      let worstCityName=null, worstRate=101;
      Object.keys(cityAgg).forEach(c=>{ const tt=cityAgg[c].done+cityAgg[c].fail; if(tt>=30){ const rate=cityAgg[c].done/tt*100; if(rate<worstRate){worstRate=rate; worstCityName=c;} } });
      const reasonList = Object.keys(reasonAgg).map(ri=>({name:reasons[ri], count:reasonAgg[ri]})).filter(r=>r.name!=='N/A').sort((a,b)=>b.count-a.count);

      if(topArea) items.push(t('recTopArea',{area:`<b>${esc(topArea.name)}</b>`, n:fmtNum(topArea.count)}));
      if(topDriver) items.push(t('recTopDriver',{name:`<b>${esc(topDriver.name)}</b>`, n:fmtNum(topDriver.count), rate:topDriver.rate.toFixed(1)}));
      if(worstCityName) items.push(t('recWorstCity',{city:`<b>${esc(worstCityName)}</b>`, rate:worstRate.toFixed(1)}));
      if(feesArea) items.push(t('recFeesArea',{area:`<b>${esc(feesArea.name)}</b>`, fees:fmtCurrency(feesArea.fees)}));
      if(reasonList[0] && reasonList[0].count>0) items.push(t('recTopReason',{reason:`<b>${esc(reasonList[0].name)}</b>`, n:fmtNum(reasonList[0].count)}));

      const list=document.getElementById('recList');
      list.innerHTML = items.length===0 ? `<div class="empty-state">${t('notEnoughRecs')}</div>` :
        items.map(txt=>`<div class="rec-item"><div class="rec-icon">${icon('rate','#fff')}</div><div class="rec-text">${txt}</div></div>`).join('');
    }

    function renderSalaryRef(){
      const table = document.getElementById('salaryRefTable');
      document.getElementById('salaryRefNote').textContent = t('salaryRefNote',{n:salaryRef.length, t:drivers.length});
      table.innerHTML = `<tr><td style="font-weight:700;">${t('salaryColName')}</td><td style="font-weight:700;">${t('salaryColVehicle')}</td><td style="font-weight:700; text-align:end;">${t('salaryColSalary')}</td></tr>` +
        salaryRef.map(s=>`<tr><td>${esc(s.name||'—')}</td><td>${esc(s.vehicle||'—')}</td><td style="text-align:end;">${s.fixed_salary!=null?fmtNum(s.fixed_salary)+(appState.lang==='ar'?' جنيه':' EGP'):'—'}</td></tr>`).join('');
    }

    function renderDQ(){
      const grid = document.getElementById('dqGrid');
      const items = [
        {val: fmtNum(meta.totalRecords), lbl:t('dqTotalRecords')},
        {val: `${meta.dateMin} → ${meta.dateMax}`, lbl:t('dqDateCoverage')},
        {val: fmtNum(meta.uniqueCities), lbl:t('dqCities')},
        {val: fmtNum(meta.uniqueDrivers), lbl:t('dqCouriers')},
        {val: fmtNum(meta.uniqueTypes), lbl:t('dqRequestTypes')}
      ];
      grid.innerHTML = items.map(i=>`<div class="dq-item"><div class="dq-val">${i.val}</div><div class="dq-lbl">${esc(i.lbl)}</div></div>`).join('');
      const warn = document.getElementById('dqWarnings');
      warn.innerHTML = (meta.partialMonths||[]).map(m=>`<div class="dq-warn">${t('dqPartialMonthWarn',{month:monthLabel(m)})}</div>`).join('');
      const fillRows = document.getElementById('dqFillRows');
      const recordedTotal = meta.recordedYes+meta.recordedNo;
      const rows2 = [
        [t('dqAreaNorm'), t('dqAreaNormVal',{n:fmtNum(meta.uniqueAreas)})],
        [t('dqRecordedFill'), `${fmtNum(recordedTotal)} / ${fmtNum(meta.totalRecords)} (${(recordedTotal/meta.totalRecords*100).toFixed(0)}%)`],
        [t('dqBranchMap'), `${fmtNum(meta.branchCoverage)} / ${fmtNum(meta.branchTotal)} (${(meta.branchCoverage/meta.branchTotal*100).toFixed(0)}%)`],
        [t('dqRegistered'), `${fmtNum(meta.uniqueClients)} / ${fmtNum(meta.registeredMerchants)} (${(meta.uniqueClients/meta.registeredMerchants*100).toFixed(0)}%)`],
        [t('dqUnused'), t('dqUnusedVal')],
        [t('dqSalarySheet'), t('dqSalaryVal',{t:fmtNum(meta.branchTotal)})]
      ];
      fillRows.innerHTML = rows2.map(r=>`<div class="dq-fill-row"><span>${esc(r[0])}</span><b>${r[1]}</b></div>`).join('');
    }

    document.querySelectorAll('table thead th[data-key]').forEach(th=>{
      th.addEventListener('click', ()=>{
        const key = th.dataset.key, tbl = th.dataset.table;
        const sortState = tbl==='driver'?state.driverSort : tbl==='area'?state.areaSort : state.clientSort;
        if(sortState.key===key) sortState.dir*=-1; else { sortState.key=key; sortState.dir=-1; }
        if(tbl==='driver') state.driverPage=1; if(tbl==='area') state.areaPage=1; if(tbl==='client') state.clientPage=1;
        const table = th.closest('table');
        table.querySelectorAll('thead th').forEach(x=>x.classList.remove('active'));
        th.classList.add('active');
        renderTables();
      });
    });
    document.getElementById('driverTableSearch').addEventListener('input', e=>{ state.driverTableFilter=e.target.value.trim().toLowerCase(); state.driverPage=1; renderTables(); });
    document.getElementById('areaTableSearch').addEventListener('input', e=>{ state.areaTableFilter=e.target.value.trim().toLowerCase(); state.areaPage=1; renderTables(); });
    document.getElementById('clientTableSearch').addEventListener('input', e=>{ state.clientTableFilter=e.target.value.trim().toLowerCase(); state.clientPage=1; renderTables(); });
    document.getElementById('exportBtn').addEventListener('click', exportCSV);

    // PHASE 1: CSV export now goes through the exact same filteredRows()
    // (→ filters.js) as the on-screen dashboard, so every filter in the
    // panel — period, location, operational, search — is reflected in
    // what gets exported, not just the month range like before.
    function exportCSV(){
      const fr = filteredRows();
      const driverAgg = {};
      fr.forEach(r=>{ const [,,,di,,si,,,count,f]=r; if(!driverAgg[di]) driverAgg[di]={count:0,done:0,fees:0}; driverAgg[di].count+=count; driverAgg[di].fees+=f; if(si===DONE_IDX) driverAgg[di].done+=count; });
      const driverList = Object.keys(driverAgg).map(di=>{ const a=driverAgg[di]; return {name:drivers[di].trim(), requests:a.count, success_rate:a.count?(a.done/a.count*100).toFixed(1):'0', extra_fees:a.fees}; }).sort((a,b)=>b.requests-a.requests);
      const header=[t('courierHeader'),t('requestsHeader'),t('successHeader')+' %',t('extraFeesHeader')+' (EGP)'];
      const csvRows=[header.join(',')].concat(driverList.map(d=>[`"${d.name}"`, d.requests, d.success_rate, d.extra_fees].join(',')));
      const blob=new Blob(["\uFEFF"+csvRows.join('\n')], {type:'text/csv;charset=utf-8;'});
      const url=URL.createObjectURL(blob); const a=document.createElement('a');
      a.href=url; a.download=`first-mile-courier-leaderboard_${months[state.monthFrom]}_to_${months[state.monthTo]}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    }

    // PHASE 1: the filter panel itself — every control (period presets,
    // date pickers, multi-month picker, city/branch/type/status chips,
    // area/driver/merchant/reason dropdowns, fees toggle, the 4 search
    // boxes, active-filter chips, Reset All) is built and wired here.
    // onChange always triggers a full renderAll() because every one of
    // these controls changes which rows are in scope.
    const filterUI = DashboardFilterUI.createFilterUI({
      state,
      lookups: { months, cities, areas, branches, types, statuses, drivers, clients, reasons, dateMin: meta.dateMin, dateMax: meta.dateMax },
      filterEngine, t, esc, typeLabel, statusLabel, monthLabel,
      onChange: ()=> renderAll(),
      ids: {
        periodPresets:'periodPresets', periodMonths:'periodMonthsMulti', fromDate:'periodFromDate', toDate:'periodToDate',
        cityChips:'cityChips', areaMulti:'areaMulti', branchChips:'branchChips',
        typeChips:'typeChips', statusChips:'statusChips', driverMulti:'driverMulti', merchantMulti:'merchantMulti', reasonMulti:'reasonMulti',
        feesToggle:'feesToggle', recordedToggle:'recordedToggle',
        globalSearch:'globalSearch', driverSearch:'driverSearch', merchantSearch:'merchantSearch', areaSearch:'areaGlobalSearch',
        activeChips:'activeFiltersRow', resetBtn:'resetBtn', loading:'filterLoadingIndicator'
      }
    });

    window.__dashboardRender = renderAll;
    renderAll();
  }

})();
