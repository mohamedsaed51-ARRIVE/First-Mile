/**
 * filter-ui.js — ARRIVE First Mile Dashboard (Phase 1: Filtering System)
 * ------------------------------------------------------------------
 * Renders every control in the filter panel and keeps them in sync
 * with the shared `state` object. This file only ever *reads and
 * mutates* state and calls the `onChange` callback it's given — it
 * has no idea how rendering/aggregation works, and dashboard.js has
 * no idea how any individual control is drawn. That split is what
 * lets each filter type (chips vs. dropdown vs. toggle) be a small,
 * reusable function instead of five near-identical ones.
 *
 * Two reusable primitives do almost all the work:
 *   - buildChips()          small fixed sets (city, type, status, branch)
 *   - buildMultiSelect()    large/unbounded sets (area, driver, merchant,
 *                           reason, and the period's multi-month picker) —
 *                           a searchable checkbox dropdown so the panel
 *                           stays usable when there are hundreds of drivers
 * Everything else (presets, date inputs, tri-toggles, search boxes,
 * active chips) is a thin function built on top of those.
 * ------------------------------------------------------------------
 */
window.DashboardFilterUI = (function(){

  const DEBOUNCE_MS = 150;

  /**
   * createFilterUI(deps) — deps:
   *   state          the live, mutable filter-state object
   *   lookups         { months, cities, areas, branches, types, statuses, drivers, clients, reasons }
   *   filterEngine    a DashboardFilters engine (for resolvePreset/resolveDateRange)
   *   t, esc, typeLabel, statusLabel, monthLabel   i18n/formatting helpers
   *   onChange()      called after any filter-affecting change; caller
   *                   (dashboard.js) decides what to re-render
   *   ids             DOM element ids for every container (see index.html)
   */
  function createFilterUI(deps){
    const { state, lookups, filterEngine, t, esc, typeLabel, statusLabel, monthLabel, onChange, ids } = deps;
    const { months, cities, areas, branches, types, statuses, drivers, clients, reasons } = lookups;

    // ---- loading indicator + change dispatch --------------------------
    // Filtering 100k+ rows synchronously can take a visible moment; a
    // rAF between "show spinner" and "do the work" guarantees the
    // browser paints the spinner before the heavy computation blocks
    // the thread, so the UI never feels frozen without needing a
    // Web Worker for this data size.
    const loadingEl = document.getElementById(ids.loading);
    function fireChange(){
      if(loadingEl) loadingEl.classList.remove('hidden');
      requestAnimationFrame(()=>{
        onChange();
        if(loadingEl) loadingEl.classList.add('hidden');
      });
    }

    // Debounced version for free-text inputs, so a fast typist doesn't
    // trigger a full recompute on every keystroke.
    function debounced(fn){
      let timer = null;
      return (...args)=>{ clearTimeout(timer); timer = setTimeout(()=>fn(...args), DEBOUNCE_MS); };
    }

    // Mutates `set` in place to equal `values`, instead of reassigning
    // state.X to a brand-new Set. The multi-select dropdowns (area/driver/
    // merchant/reason/months) capture their Set by reference when built;
    // reassigning state.X would silently orphan them from that point on.
    function setAll(set, values){ set.clear(); values.forEach(v=>set.add(v)); }

    // A single delegated "click outside closes the panel" listener shared
    // by every dropdown, instead of one document-level listener per
    // dropdown. initDashboard() (and therefore createFilterUI) runs again
    // on every background data refresh, so without this the old listener
    // would never be removed and they'd accumulate over time; removing the
    // previous one before adding a new one keeps exactly one at all times.
    if(window.__filterUIOutsideClickHandler){
      document.removeEventListener('click', window.__filterUIOutsideClickHandler);
    }
    window.__filterUIOutsideClickHandler = function(e){
      document.querySelectorAll('.ms-dropdown').forEach(wrap=>{
        if(!wrap.contains(e.target)) { const p = wrap.querySelector('.ms-panel'); if(p) p.classList.add('hidden'); }
      });
    };
    document.addEventListener('click', window.__filterUIOutsideClickHandler);

    function buildChips(container, items, selectedSet, labelFn, extraClass){
      container.innerHTML='';
      items.forEach(item=>{
        const chip=document.createElement('div');
        chip.className='chip'+(selectedSet.has(item)?' active':'')+(extraClass?' '+extraClass+'-'+item:'');
        chip.textContent = labelFn ? labelFn(item) : item;
        chip.dataset.value=item;
        chip.addEventListener('click', ()=>{
          if(selectedSet.has(item)){ selectedSet.delete(item); } else { selectedSet.add(item); }
          fireChange();
        });
        container.appendChild(chip);
      });
    }

    // ---- primitive: searchable multi-select dropdown -------------------
    // Used for anything whose option count can grow large (areas,
    // drivers, merchants, reasons, and the period's month picker).
    function buildMultiSelect(container, opts){
      const { label, options, selectedSet, formatLabel } = opts;
      container.innerHTML='';
      const wrap=document.createElement('div'); wrap.className='ms-dropdown';
      const btn=document.createElement('button'); btn.type='button'; btn.className='ms-btn';
      const panel=document.createElement('div'); panel.className='ms-panel hidden';
      const search=document.createElement('input'); search.type='text'; search.className='ms-search'; search.placeholder=t('filterTablePlaceholder');
      const actions=document.createElement('div'); actions.className='ms-actions';
      const selectAllBtn=document.createElement('button'); selectAllBtn.type='button'; selectAllBtn.textContent=t('selectAllOpt');
      const clearBtn=document.createElement('button'); clearBtn.type='button'; clearBtn.textContent=t('clearOpt');
      const list=document.createElement('div'); list.className='ms-list';

      function fmt(o){ return formatLabel ? formatLabel(o) : String(o); }
      function updateBtnLabel(){
        const n = selectedSet.size;
        const allSelected = n===options.length;
        btn.textContent = `${label} (${allSelected ? t('allSelected') : t('nSelected',{n})})`;
        btn.classList.toggle('narrowed', !allSelected);
      }
      function renderList(query){
        list.innerHTML='';
        const filtered = options.filter(o=>!query || fmt(o).toLowerCase().includes(query));
        if(filtered.length===0){ list.innerHTML = `<div class="ms-empty">${t('noDataFilters')}</div>`; return; }
        filtered.forEach(o=>{
          const row=document.createElement('label'); row.className='ms-option';
          const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=selectedSet.has(o);
          cb.addEventListener('change', ()=>{
            if(cb.checked) selectedSet.add(o); else selectedSet.delete(o);
            updateBtnLabel();
            fireChange();
          });
          const span=document.createElement('span'); span.textContent=fmt(o);
          row.appendChild(cb); row.appendChild(span);
          list.appendChild(row);
        });
      }
      search.addEventListener('input', ()=>renderList(search.value.trim().toLowerCase()));
      selectAllBtn.addEventListener('click', ()=>{ options.forEach(o=>selectedSet.add(o)); renderList(search.value.trim().toLowerCase()); updateBtnLabel(); fireChange(); });
      clearBtn.addEventListener('click', ()=>{ selectedSet.clear(); renderList(search.value.trim().toLowerCase()); updateBtnLabel(); fireChange(); });
      btn.addEventListener('click', (e)=>{ e.stopPropagation(); document.querySelectorAll('.ms-panel').forEach(p=>{ if(p!==panel) p.classList.add('hidden'); }); panel.classList.toggle('hidden'); });

      actions.appendChild(selectAllBtn); actions.appendChild(clearBtn);
      panel.appendChild(search); panel.appendChild(actions); panel.appendChild(list);
      wrap.appendChild(btn); wrap.appendChild(panel);
      container.appendChild(wrap);
      renderList('');
      updateBtnLabel();
      return { refresh: ()=>{ renderList(search.value.trim().toLowerCase()); updateBtnLabel(); } };
    }

    // ---- primitive: tri-state toggle (All / A / B) ----------------------
    function buildTriToggle(container, opts){
      const { options, get, set, disabled, disabledNote } = opts; // options: [{key,label}]
      container.innerHTML='';
      container.classList.toggle('disabled', !!disabled);
      options.forEach(o=>{
        const b=document.createElement('button'); b.type='button'; b.className='tri-btn'+(get()===o.key?' active':'');
        b.textContent=o.label; b.disabled=!!disabled;
        if(disabled && disabledNote) b.title = disabledNote;
        if(!disabled) b.addEventListener('click', ()=>{ set(o.key); refreshTri(); fireChange(); });
        container.appendChild(b);
      });
      function refreshTri(){ container.querySelectorAll('.tri-btn').forEach((b,i)=>b.classList.toggle('active', options[i].key===get())); }
      return { refresh: refreshTri };
    }

    // ==== PERIOD ==========================================================
    const presetDefs = [
      {key:'today', label:t('presetToday')},
      {key:'thisWeek', label:t('presetThisWeek')},
      {key:'thisMonth', label:t('presetThisMonth')},
      {key:'lastMonth', label:t('presetLastMonth')},
      {key:'custom', label:t('presetCustom')}
    ];
    const presetContainer = document.getElementById(ids.periodPresets);
    function renderPresets(){
      presetContainer.innerHTML='';
      presetDefs.forEach(p=>{
        const chip=document.createElement('div'); chip.className='preset-chip'+(state.activePreset===p.key?' active':'');
        chip.textContent=p.label;
        chip.addEventListener('click', ()=>{
          if(p.key==='custom'){
            state.activePreset='custom';
            renderPresets();
            return; // just switches mode; user picks dates below
          }
          const range = filterEngine.resolvePreset(p.key);
          if(range){
            state.periodMode='range'; state.monthFrom=range.monthFrom; state.monthTo=range.monthTo;
            state.activePreset=p.key; state.customFrom=''; state.customTo='';
            document.getElementById(ids.fromDate).value=''; document.getElementById(ids.toDate).value='';
          }
          renderPresets();
          if(monthsMulti) monthsMulti.refresh();
          fireChange();
        });
        presetContainer.appendChild(chip);
      });
    }
    renderPresets();

    const fromDateEl = document.getElementById(ids.fromDate);
    const toDateEl = document.getElementById(ids.toDate);
    if(fromDateEl && lookups.dateMin) fromDateEl.min = lookups.dateMin;
    if(toDateEl && lookups.dateMax) toDateEl.max = lookups.dateMax;
    function onDateInputChange(){
      state.customFrom = fromDateEl.value; state.customTo = toDateEl.value;
      const range = filterEngine.resolveDateRange(state.customFrom, state.customTo);
      if(range){
        state.periodMode='range'; state.monthFrom=range.monthFrom; state.monthTo=range.monthTo; state.activePreset='custom';
        renderPresets();
        if(monthsMulti) monthsMulti.refresh();
        fireChange();
      }
    }
    if(fromDateEl) fromDateEl.addEventListener('change', onDateInputChange);
    if(toDateEl) toDateEl.addEventListener('change', onDateInputChange);

    // Multi-month picker: checking/unchecking a month switches the period
    // into 'multi' mode (independent of the range/preset controls above).
    const monthsMulti = buildMultiSelect(document.getElementById(ids.periodMonths), {
      label: t('periodMonthsLabel'),
      options: months.map((_,i)=>i),
      selectedSet: state.selectedMonths,
      formatLabel: (i)=>monthLabel(months[i])
    });
    // wrap the checkbox onChange to also flip periodMode — buildMultiSelect
    // already calls fireChange(); we hook in by re-binding after creation
    // via a MutationObserver-free approach: simplest is to re-derive mode
    // whenever selectedMonths differs from "all" AND the user is interacting
    // with this control specifically. We do this by listening on the
    // container for checkbox changes (event delegation) at capture time.
    document.getElementById(ids.periodMonths).addEventListener('change', (e)=>{
      if(e.target && e.target.type==='checkbox'){
        state.periodMode='multi'; state.activePreset=null;
        renderPresets();
      }
    }, true);

    // ==== LOCATION =========================================================
    buildChips(document.getElementById(ids.cityChips), cities, state.cities);
    const areaMulti = buildMultiSelect(document.getElementById(ids.areaMulti), { label:t('areaFilterLabel'), options:areas, selectedSet:state.areas });
    buildChips(document.getElementById(ids.branchChips), branches, state.branches);

    // ==== OPERATIONAL =======================================================
    buildChips(document.getElementById(ids.typeChips), types, state.types, typeLabel);
    buildChips(document.getElementById(ids.statusChips), statuses, state.statuses, statusLabel, 'status');
    const driverMulti = buildMultiSelect(document.getElementById(ids.driverMulti), { label:t('driverFilterLabel'), options:drivers, selectedSet:state.drivers, formatLabel:(d)=>d.trim() });
    const merchantMulti = buildMultiSelect(document.getElementById(ids.merchantMulti), { label:t('merchantFilterLabel'), options:clients, selectedSet:state.clients });
    const reasonMulti = buildMultiSelect(document.getElementById(ids.reasonMulti), { label:t('reasonFilterLabel'), options:reasons, selectedSet:state.reasons });

    const feesToggle = buildTriToggle(document.getElementById(ids.feesToggle), {
      options: [{key:'all',label:t('feesAll')},{key:'has',label:t('feesHas')},{key:'none',label:t('feesNone')}],
      get: ()=>state.feesMode, set: (k)=>{ state.feesMode=k; }
    });
    const recordedToggle = buildTriToggle(document.getElementById(ids.recordedToggle), {
      options: [{key:'all',label:t('recordedAll')},{key:'yes',label:t('recordedYesOpt')},{key:'no',label:t('recordedNoOpt')}],
      get: ()=>state.recordedMode, set: (k)=>{ state.recordedMode=k; },
      disabled: true, disabledNote: t('recordedUnavailable')
    });

    // ==== SEARCH ============================================================
    function wireSearch(elId, stateKey){
      const el = document.getElementById(elId);
      if(!el) return;
      const handler = debounced(()=>{ state[stateKey] = el.value.trim().toLowerCase(); fireChange(); });
      el.addEventListener('input', handler);
    }
    wireSearch(ids.globalSearch, 'globalQuery');
    wireSearch(ids.driverSearch, 'driverQuery');
    wireSearch(ids.merchantSearch, 'clientQuery');
    wireSearch(ids.areaSearch, 'areaQuery');

    // ==== ACTIVE FILTER CHIPS (clearable) ===================================
    // Each entry: { active(): bool, label(): string, clear(): void }
    function buildDimensionDefs(){
      return [
        { active: ()=> state.periodMode==='multi' ? state.selectedMonths.size<months.length : !(state.monthFrom===0 && state.monthTo===months.length-1),
          label: ()=> state.periodMode==='multi' ? `${t('periodChipLabel')}: ${state.selectedMonths.size}/${months.length}` : `${monthLabel(months[state.monthFrom])} → ${monthLabel(months[state.monthTo])}`,
          clear: ()=>{ state.periodMode='range'; state.monthFrom=0; state.monthTo=months.length-1; setAll(state.selectedMonths, months.map((_,i)=>i)); state.activePreset=null; state.customFrom=''; state.customTo=''; if(fromDateEl) fromDateEl.value=''; if(toDateEl) toDateEl.value=''; renderPresets(); monthsMulti.refresh(); } },
        { active: ()=> state.cities.size<cities.length, label: ()=>`${t('cityLabel')}: ${state.cities.size}/${cities.length}`, clear: ()=>{ setAll(state.cities, cities); buildChips(document.getElementById(ids.cityChips), cities, state.cities); } },
        { active: ()=> state.areas.size<areas.length, label: ()=>`${t('areaFilterLabel')}: ${state.areas.size}/${areas.length}`, clear: ()=>{ setAll(state.areas, areas); areaMulti.refresh(); } },
        { active: ()=> state.branches.size<branches.length, label: ()=>`${t('branchFilterLabel')}: ${state.branches.size}/${branches.length}`, clear: ()=>{ setAll(state.branches, branches); buildChips(document.getElementById(ids.branchChips), branches, state.branches); } },
        { active: ()=> state.types.size<types.length, label: ()=>`${t('requestTypeLabel')}: ${state.types.size}/${types.length}`, clear: ()=>{ setAll(state.types, types); buildChips(document.getElementById(ids.typeChips), types, state.types, typeLabel); } },
        { active: ()=> state.statuses.size<statuses.length, label: ()=>`${t('statusLabel')}: ${state.statuses.size}/${statuses.length}`, clear: ()=>{ setAll(state.statuses, statuses); buildChips(document.getElementById(ids.statusChips), statuses, state.statuses, statusLabel, 'status'); } },
        { active: ()=> state.drivers.size<drivers.length, label: ()=>`${t('driverChipLabel')}: ${state.drivers.size}/${drivers.length}`, clear: ()=>{ setAll(state.drivers, drivers); driverMulti.refresh(); } },
        { active: ()=> state.clients.size<clients.length, label: ()=>`${t('merchantChipLabel')}: ${state.clients.size}/${clients.length}`, clear: ()=>{ setAll(state.clients, clients); merchantMulti.refresh(); } },
        { active: ()=> state.reasons.size<reasons.length, label: ()=>`${t('reasonChipLabel')}: ${state.reasons.size}/${reasons.length}`, clear: ()=>{ setAll(state.reasons, reasons); reasonMulti.refresh(); } },
        { active: ()=> state.feesMode!=='all', label: ()=>`${t('feesChipLabel')}: ${state.feesMode==='has'?t('feesHas'):t('feesNone')}`, clear: ()=>{ state.feesMode='all'; feesToggle.refresh(); } },
        { active: ()=> !!state.globalQuery, label: ()=>`${t('globalSearchLabel')}: "${state.globalQuery}"`, clear: ()=>{ state.globalQuery=''; const el=document.getElementById(ids.globalSearch); if(el) el.value=''; } },
        { active: ()=> !!state.driverQuery, label: ()=>`${t('courierSearchLabel')}: "${state.driverQuery}"`, clear: ()=>{ state.driverQuery=''; const el=document.getElementById(ids.driverSearch); if(el) el.value=''; } },
        { active: ()=> !!state.clientQuery, label: ()=>`${t('merchantSearchLabel')}: "${state.clientQuery}"`, clear: ()=>{ state.clientQuery=''; const el=document.getElementById(ids.merchantSearch); if(el) el.value=''; } },
        { active: ()=> !!state.areaQuery, label: ()=>`${t('areaSearchLabel')}: "${state.areaQuery}"`, clear: ()=>{ state.areaQuery=''; const el=document.getElementById(ids.areaSearch); if(el) el.value=''; } }
      ];
    }
    const dimensionDefs = buildDimensionDefs();

    function renderActiveChips(){
      const row = document.getElementById(ids.activeChips);
      row.innerHTML = `<span class="af-label">${t('activeFiltersLabel')}</span>`;
      const active = dimensionDefs.filter(d=>d.active());
      if(active.length===0){
        const el=document.createElement('span'); el.className='af-chip'; el.textContent=t('allDataNoFilters'); row.appendChild(el);
        return;
      }
      active.forEach(d=>{
        const chip=document.createElement('span'); chip.className='af-chip';
        chip.textContent=d.label();
        const clearBtn=document.createElement('span'); clearBtn.className='af-chip-clear'; clearBtn.textContent='✕';
        clearBtn.setAttribute('role','button'); clearBtn.setAttribute('aria-label', t('clearFilterAria'));
        clearBtn.addEventListener('click', (e)=>{ e.stopPropagation(); d.clear(); renderActiveChips(); fireChange(); });
        chip.appendChild(clearBtn);
        row.appendChild(chip);
      });
    }

    // ==== RESET ALL ==========================================================
    function resetAll(){
      state.periodMode='range'; state.monthFrom=0; state.monthTo=months.length-1;
      setAll(state.selectedMonths, months.map((_,i)=>i)); state.activePreset=null; state.customFrom=''; state.customTo='';
      if(fromDateEl) fromDateEl.value=''; if(toDateEl) toDateEl.value='';
      setAll(state.cities, cities); setAll(state.areas, areas); setAll(state.branches, branches);
      setAll(state.types, types); setAll(state.statuses, statuses);
      setAll(state.drivers, drivers); setAll(state.clients, clients); setAll(state.reasons, reasons);
      state.feesMode='all';
      state.globalQuery=''; state.driverQuery=''; state.clientQuery=''; state.areaQuery='';
      [ids.globalSearch, ids.driverSearch, ids.merchantSearch, ids.areaSearch].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
      refreshAllControls();
      fireChange();
    }
    const resetBtn = document.getElementById(ids.resetBtn);
    if(resetBtn) resetBtn.addEventListener('click', resetAll);

    // Re-syncs every control's visual state to match `state` — used after
    // Reset All and after a background data refresh restores a filter
    // snapshot (see bootstrapOrUpdate in dashboard.js).
    function refreshAllControls(){
      renderPresets();
      monthsMulti.refresh();
      buildChips(document.getElementById(ids.cityChips), cities, state.cities);
      areaMulti.refresh();
      buildChips(document.getElementById(ids.branchChips), branches, state.branches);
      buildChips(document.getElementById(ids.typeChips), types, state.types, typeLabel);
      buildChips(document.getElementById(ids.statusChips), statuses, state.statuses, statusLabel, 'status');
      driverMulti.refresh();
      merchantMulti.refresh();
      reasonMulti.refresh();
      feesToggle.refresh();
      renderActiveChips();
    }

    renderActiveChips();

    return { renderActiveChips, refreshAllControls, resetAll };
  }

  return { createFilterUI };
})();
