/**
 * tables.js — ARRIVE First Mile Dashboard (Phase 0B extraction)
 * ------------------------------------------------------------------
 * The driver/area/client sortable table renderers, moved out of the
 * inline script AS-IS — logic is byte-for-byte the same as before,
 * just relocated. They used to read `state`, `drivers`, `areas`,
 * `clients`, `t`, `esc`, `fmtNum`, `rateClass` and `render` directly
 * from the enclosing closure; createTables(deps) now receives those
 * explicitly instead. No deduplication/generalization has been done
 * here yet — that's a separate, later concern if requested.
 * ------------------------------------------------------------------
 */
window.DashboardTables = (function(){

  function createTables(deps){
    const { state, drivers, areas, clients, t, esc, fmtNum, rateClass, render } = deps;

    function paginate(list, page, pageSize){
      const totalPages = Math.max(1, Math.ceil(list.length/pageSize));
      const p = Math.min(page, totalPages);
      const start = (p-1)*pageSize;
      return { pageList: list.slice(start, start+pageSize), totalPages, page:p, start };
    }
    function renderPaginationControls(elId, page, totalPages, onPrev, onNext){
      const pag=document.getElementById(elId);
      pag.innerHTML = `<button class="pg-btn" id="${elId}Prev" ${page<=1?'disabled':''}>${t('prevBtn')}</button><span>${t('pageOf',{p:page,t:totalPages})}</span><button class="pg-btn" id="${elId}Next" ${page>=totalPages?'disabled':''}>${t('nextBtn')}</button>`;
      const prevBtn=document.getElementById(elId+'Prev'), nextBtn=document.getElementById(elId+'Next');
      if(prevBtn) prevBtn.addEventListener('click', onPrev);
      if(nextBtn) nextBtn.addEventListener('click', onNext);
    }

    function renderDriverTable(driverAgg){
      let list = Object.keys(driverAgg).map(di=>{ const a=driverAgg[di]; return {name:drivers[di].trim(), count:a.count, rate:a.count?a.done/a.count*100:0, fees:a.fees}; });
      if(state.driverTableFilter) list = list.filter(d=>d.name.toLowerCase().includes(state.driverTableFilter));
      const {key,dir}=state.driverSort; list.sort((a,b)=>(a[key]>b[key]?1:a[key]<b[key]?-1:0)*dir);
      document.getElementById('driverPanelNote').textContent = t('couriersMatched',{n:list.length});
      const maxCount = list.length ? Math.max(...list.map(d=>d.count)) : 1;
      const {pageList, totalPages, page, start} = paginate(list, state.driverPage, state.driverPageSize); state.driverPage=page;
      const tbody=document.getElementById('driverTableBody');
      tbody.innerHTML = pageList.length===0 ? `<tr><td colspan="5"><div class="empty-state">${t('noCouriersMatch')}</div></td></tr>` :
        pageList.map((d,idx)=>{ const gr=start+idx+1; const w=Math.max(4, d.count/maxCount*100);
          return `<tr><td class="rank ${gr<=3?'top3':''}">${gr}</td><td class="name-cell">${esc(d.name)}</td>
          <td class="num"><div class="bar-cell"><div class="mini-bar"><div class="mini-bar-fill" style="width:${w}%; background:#101B30;"></div></div><span>${fmtNum(d.count)}</span></div></td>
          <td class="num"><span class="rate-badge ${rateClass(d.rate)}">${d.rate.toFixed(0)}%</span></td>
          <td class="num">${fmtNum(d.fees)}</td></tr>`; }).join('');
      renderPaginationControls('driverPagination', page, totalPages, ()=>{state.driverPage--; render();}, ()=>{state.driverPage++; render();});
    }

    function renderAreaTable(areaAgg){
      let list = Object.keys(areaAgg).map(ai=>{ const a=areaAgg[ai]; return {name:areas[ai], city:a.city, count:a.count, rate:a.count?a.done/a.count*100:0, fees:a.fees}; });
      if(state.areaTableFilter) list = list.filter(a=>a.name.toLowerCase().includes(state.areaTableFilter));
      const {key,dir}=state.areaSort; const sortKey = key==='area'?'name':key;
      list.sort((a,b)=>(a[sortKey]>b[sortKey]?1:a[sortKey]<b[sortKey]?-1:0)*dir);
      document.getElementById('areaPanelNote').textContent = t('areasMatched',{n:list.length});
      const {pageList, totalPages, page, start} = paginate(list, state.areaPage, state.areaPageSize); state.areaPage=page;
      const tbody=document.getElementById('areaTableBody');
      tbody.innerHTML = pageList.length===0 ? `<tr><td colspan="6"><div class="empty-state">${t('noAreasMatch')}</div></td></tr>` :
        pageList.map((a,idx)=>{ const gr=start+idx+1;
          return `<tr><td class="rank ${gr<=3?'top3':''}">${gr}</td><td class="name-cell">${esc(a.name)}</td><td>${esc(a.city)}</td>
          <td class="num">${fmtNum(a.count)}</td><td class="num"><span class="rate-badge ${rateClass(a.rate)}">${a.rate.toFixed(0)}%</span></td><td class="num">${fmtNum(a.fees)}</td></tr>`; }).join('');
      renderPaginationControls('areaPagination', page, totalPages, ()=>{state.areaPage--; render();}, ()=>{state.areaPage++; render();});
    }

    function renderClientTable(clientAgg, totalAll){
      let list = Object.keys(clientAgg).map(ci=>{ const a=clientAgg[ci]; return {name:clients[ci], count:a.count, rate:a.count?a.done/a.count*100:0, contribution: totalAll?a.count/totalAll*100:0}; });
      if(state.clientTableFilter) list = list.filter(c=>c.name.toLowerCase().includes(state.clientTableFilter));
      const {key,dir}=state.clientSort; const sortKey = key==='name'?'name':key;
      list.sort((a,b)=>(a[sortKey]>b[sortKey]?1:a[sortKey]<b[sortKey]?-1:0)*dir);
      document.getElementById('clientPanelNote').textContent = t('clientsMatched',{n:list.length});
      const {pageList, totalPages, page, start} = paginate(list, state.clientPage, state.clientPageSize); state.clientPage=page;
      const tbody=document.getElementById('clientTableBody');
      tbody.innerHTML = pageList.length===0 ? `<tr><td colspan="5"><div class="empty-state">${t('noClientsMatch')}</div></td></tr>` :
        pageList.map((c,idx)=>{ const gr=start+idx+1;
          return `<tr><td class="rank ${gr<=3?'top3':''}">${gr}</td><td class="name-cell">${esc(c.name)}</td>
          <td class="num">${fmtNum(c.count)}</td><td class="num"><span class="rate-badge ${rateClass(c.rate)}">${c.rate.toFixed(0)}%</span></td><td class="num">${c.contribution.toFixed(2)}%</td></tr>`; }).join('');
      renderPaginationControls('clientPagination', page, totalPages, ()=>{state.clientPage--; render();}, ()=>{state.clientPage++; render();});
    }

    return { paginate, renderPaginationControls, renderDriverTable, renderAreaTable, renderClientTable };
  }

  return { createTables };
})();
