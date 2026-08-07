/**
 * filter-ui.js — ARRIVE First Mile Dashboard (Phase 1 filtering + compact
 * executive-toolbar redesign)
 * ------------------------------------------------------------------
 * Renders every control in the filter panel and keeps them in sync
 * with the shared `state` object. This file only ever *reads and
 * mutates* state and calls the `onChange` callback it's given — it
 * has no idea how rendering/aggregation works, and dashboard.js has
 * no idea how any individual control is drawn.
 *
 * Redesign note: every filterable dimension (city, branch, area, driver,
 * merchant, request type, status, reason) now renders through the SAME
 * buildMultiSelect() primitive — a compact searchable checkbox dropdown —
 * instead of some being wide chip-rows and others being dropdowns. That's
 * what cut the panel's height: one dense, uniform row of small buttons
 * instead of four labeled sections each with their own chip grid. The
 * filtering behavior behind every one of these controls is unchanged.
 *
 * The Period section is intentionally reduced to only the 4 quick-date
 * shortcuts (Today / This Week / This Month / Last Month) — Custom Range,
 * explicit date pickers, and the multi-month checklist have been removed
 * from the UI to keep the panel compact. filters.js still supports all of
 * that underneath (periodMode:'multi', arbitrary date ranges); it's just
 * not exposed here anymore.
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
    // state.X to a brand-new Set. The multi-select dropdowns capture
    // their Set by reference when built; reassigning state.X would
    // silently orphan them from that point on.
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

    // ---- primitive: searchable multi-select dropdown -------------------
    // The single control used for every filterable dimension in the
    // compact toolbar (city, branch, area, driver, merchant, request
    // type, status, reason) — one implementation, reused everywhere,
    // instead of a separate chip-row implementation for the small sets.
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
    // Compact redesign: only the 4 quick-date shortcuts remain in the UI.
    // Custom Range / explicit date pickers / the multi-month checklist are
    // removed from the panel to cut height — the underlying engine
    // (filters.js) still supports periodMode:'multi' and arbitrary date
    // ranges unchanged; they're just not exposed here anymore.
    const presetDefs = [
      {key:'today', label:t('presetToday')},
      {key:'thisWeek', label:t('presetThisWeek')},
      {key:'thisMonth', label:t('presetThisMonth')},
      {key:'lastMonth', label:t('presetLastMonth')}
    ];
    const presetContainer = document.getElementById(ids.periodPresets);
    function renderPresets(){
      presetContainer.innerHTML='';
      presetDefs.forEach(p=>{
        const chip=document.createElement('div'); chip.className='preset-chip'+(state.activePreset===p.key?' active':'');
        chip.textContent=p.label;
        chip.addEventListener('click', ()=>{
          const range = filterEngine.resolvePreset(p.key);
          if(range){
            state.periodMode='range'; state.monthFrom=range.monthFrom; state.monthTo=range.monthTo;
            state.activePreset=p.key; state.customFrom=''; state.customTo='';
          }
          renderPresets();
          fireChange();
        });
        presetContainer.appendChild(chip);
      });
    }
    renderPresets();

    // ==== LOCATION =========================================================
    // Compact redesign: City/Branch (previously chip-rows) now use the same
    // searchable dropdown as Area/Driver/etc — same buildMultiSelect(), no
    // duplicated logic, just a uniform, denser control.
    const cityMulti = buildMultiSelect(document.getElementById(ids.cityChips), { label:t('cityLabel'), options:cities, selectedSet:state.cities });
    const areaMulti = buildMultiSelect(document.getElementById(ids.areaMulti), { label:t('areaFilterLabel'), options:areas, selectedSet:state.areas });
    const branchMulti = buildMultiSelect(document.getElementById(ids.branchChips), { label:t('branchFilterLabel'), options:branches, selectedSet:state.branches });

    // ==== OPERATIONAL =======================================================
    const typeMulti = buildMultiSelect(document.getElementById(ids.typeChips), { label:t('requestTypeLabel'), options:types, selectedSet:state.types, formatLabel:typeLabel });
    const statusMulti = buildMultiSelect(document.getElementById(ids.statusChips), { label:t('statusLabel'), options:statuses, selectedSet:state.statuses, formatLabel:statusLabel });
    const driverMulti = buildMultiSelect(document.getElementById(ids.driverMulti), { label:t('driverFilterLabel'), options:drivers, selectedSet:state.drivers, formatLabel:(d)=>d.trim() });
    const merchantMulti = buildMultiSelect(document.getElementById(ids.merchantMulti), { label:t('merchantFilterLabel'), options:clients, selectedSet:state.clients });
    const reasonMulti = buildMultiSelect(document.getElementById(ids.reasonMulti), { label:t('reasonFilterLabel'), options:reasons, selectedSet:state.reasons });

    const feesToggle = buildTriToggle(document.getElementById(ids.feesToggle), {
      options: [{key:'all',label:t('feesAll')},{key:'has',label:t('feesHas')},{key:'none',label:t('feesNone')}],
      get: ()=>state.feesMode, set: (k)=>{ state.feesMode=k; }
    });
    // Recorded-on-System can't be filtered (see filters.js header note) —
    // shown as a single compact disabled badge instead of 3 buttons, since
    // it never does anything but explain why.
    const recordedEl = document.getElementById(ids.recordedToggle);
    if(recordedEl){
      recordedEl.innerHTML = `<span class="recorded-badge" title="${esc(t('recordedUnavailable'))}">${esc(t('recordedFilterLabel'))}: ${esc(t('recordedAll'))}</span>`;
    }

    // ==== SEARCH ============================================================
    // Compact redesign: only Global Search remains visible (it already
    // matches driver/merchant/area/city together). The dedicated per-field
    // search boxes are gone, but that capability isn't lost — each of the
    // Driver/Merchant/Area dropdowns has its own internal search-to-filter
    // input, reached by opening the dropdown.
    function wireSearch(elId, stateKey){
      const el = document.getElementById(elId);
      if(!el) return;
      const handler = debounced(()=>{ state[stateKey] = el.value.trim().toLowerCase(); fireChange(); });
      el.addEventListener('input', handler);
    }
    wireSearch(ids.globalSearch, 'globalQuery');

    // ==== ACTIVE FILTER CHIPS (clearable) ===================================
    // Each entry: { active(): bool, label(): string, clear(): void }
    function buildDimensionDefs(){
      return [
        { active: ()=> state.periodMode==='multi' ? state.selectedMonths.size<months.length : !(state.monthFrom===0 && state.monthTo===months.length-1),
          label: ()=> state.periodMode==='multi' ? `${t('periodChipLabel')}: ${state.selectedMonths.size}/${months.length}` : `${monthLabel(months[state.monthFrom])} → ${monthLabel(months[state.monthTo])}`,
          clear: ()=>{ state.periodMode='range'; state.monthFrom=0; state.monthTo=months.length-1; setAll(state.selectedMonths, months.map((_,i)=>i)); state.activePreset=null; state.customFrom=''; state.customTo=''; renderPresets(); } },
        { active: ()=> state.cities.size<cities.length, label: ()=>`${t('cityLabel')}: ${state.cities.size}/${cities.length}`, clear: ()=>{ setAll(state.cities, cities); cityMulti.refresh(); } },
        { active: ()=> state.areas.size<areas.length, label: ()=>`${t('areaFilterLabel')}: ${state.areas.size}/${areas.length}`, clear: ()=>{ setAll(state.areas, areas); areaMulti.refresh(); } },
        { active: ()=> state.branches.size<branches.length, label: ()=>`${t('branchFilterLabel')}: ${state.branches.size}/${branches.length}`, clear: ()=>{ setAll(state.branches, branches); branchMulti.refresh(); } },
        { active: ()=> state.types.size<types.length, label: ()=>`${t('requestTypeLabel')}: ${state.types.size}/${types.length}`, clear: ()=>{ setAll(state.types, types); typeMulti.refresh(); } },
        { active: ()=> state.statuses.size<statuses.length, label: ()=>`${t('statusLabel')}: ${state.statuses.size}/${statuses.length}`, clear: ()=>{ setAll(state.statuses, statuses); statusMulti.refresh(); } },
        { active: ()=> state.drivers.size<drivers.length, label: ()=>`${t('driverChipLabel')}: ${state.drivers.size}/${drivers.length}`, clear: ()=>{ setAll(state.drivers, drivers); driverMulti.refresh(); } },
        { active: ()=> state.clients.size<clients.length, label: ()=>`${t('merchantChipLabel')}: ${state.clients.size}/${clients.length}`, clear: ()=>{ setAll(state.clients, clients); merchantMulti.refresh(); } },
        { active: ()=> state.reasons.size<reasons.length, label: ()=>`${t('reasonChipLabel')}: ${state.reasons.size}/${reasons.length}`, clear: ()=>{ setAll(state.reasons, reasons); reasonMulti.refresh(); } },
        { active: ()=> state.feesMode!=='all', label: ()=>`${t('feesChipLabel')}: ${state.feesMode==='has'?t('feesHas'):t('feesNone')}`, clear: ()=>{ state.feesMode='all'; feesToggle.refresh(); } },
        { active: ()=> !!state.globalQuery, label: ()=>`${t('globalSearchLabel')}: "${state.globalQuery}"`, clear: ()=>{ state.globalQuery=''; const el=document.getElementById(ids.globalSearch); if(el) el.value=''; } }
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
      setAll(state.cities, cities); setAll(state.areas, areas); setAll(state.branches, branches);
      setAll(state.types, types); setAll(state.statuses, statuses);
      setAll(state.drivers, drivers); setAll(state.clients, clients); setAll(state.reasons, reasons);
      state.feesMode='all';
      state.globalQuery=''; state.driverQuery=''; state.clientQuery=''; state.areaQuery='';
      const el=document.getElementById(ids.globalSearch); if(el) el.value='';
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
      cityMulti.refresh();
      areaMulti.refresh();
      branchMulti.refresh();
      typeMulti.refresh();
      statusMulti.refresh();
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
