/**
 * charts.js — ARRIVE First Mile Dashboard (Phase 0C extraction)
 * ------------------------------------------------------------------
 * The hand-rolled SVG chart renderers, moved out of the inline
 * script AS-IS — pixel math and markup are byte-for-byte unchanged,
 * just relocated. They used to read `t`, `fmtNum` and `esc` directly
 * from the enclosing closure; createCharts(deps) now receives them
 * explicitly instead.
 * ------------------------------------------------------------------
 */
window.DashboardCharts = (function(){
  const SVGNS = 'http://www.w3.org/2000/svg';

  function createCharts(deps){
    const { t, fmtNum, esc } = deps;

    function svgEl(tag, attrs){ const el=document.createElementNS(SVGNS, tag); for(const k in attrs) el.setAttribute(k, attrs[k]); return el; }
    function niceMax(v){ if(v<=0) return 10; const mag=Math.pow(10, Math.floor(Math.log10(v))); const norm=v/mag; let step; if(norm<=1) step=1; else if(norm<=2) step=2; else if(norm<=5) step=5; else step=10; return step*mag; }

    function renderComboChart(containerId, labels, doneArr, failArr, rateArr){
      const container=document.getElementById(containerId); container.innerHTML='';
      const W=900,H=320, marginL=46,marginR=46,marginT=16,marginB=34, plotW=W-marginL-marginR, plotH=H-marginT-marginB, n=labels.length;
      const svg=svgEl('svg',{viewBox:`0 0 ${W} ${H}`, preserveAspectRatio:'xMidYMid meet'});
      if(n===0){ const tx=svgEl('text',{x:W/2,y:H/2,'text-anchor':'middle',class:'axis-label'}); tx.textContent=t('noDataFilters'); svg.appendChild(tx); container.appendChild(svg); return; }
      const totals=labels.map((_,i)=>doneArr[i]+failArr[i]); const maxTotal=niceMax(Math.max(...totals,1));
      for(let g=0; g<=4; g++){ const val=maxTotal*g/4; const y=marginT+plotH-(val/maxTotal)*plotH;
        svg.appendChild(svgEl('line',{x1:marginL,x2:W-marginR,y1:y,y2:y,class:'grid-line'}));
        const lbl=svgEl('text',{x:marginL-8,y:y+3,'text-anchor':'end',class:'axis-label'}); lbl.textContent=Math.round(val).toLocaleString('en-US'); svg.appendChild(lbl); }
      for(let g=0; g<=4; g++){ const val=100*g/4; const y=marginT+plotH-(val/100)*plotH;
        const lbl=svgEl('text',{x:W-marginR+8,y:y+3,'text-anchor':'start',class:'axis-label'}); lbl.textContent=Math.round(val)+'%'; lbl.setAttribute('fill','#C8912B'); svg.appendChild(lbl); }
      const bandW=plotW/n, barW=Math.min(bandW*0.46,34);
      labels.forEach((lab,i)=>{
        const cx=marginL+bandW*i+bandW/2, doneH=(doneArr[i]/maxTotal)*plotH, failH=(failArr[i]/maxTotal)*plotH, baseY=marginT+plotH;
        if(doneArr[i]>0){ const r1=svgEl('rect',{x:cx-barW/2,y:baseY-doneH,width:barW,height:Math.max(doneH,0),fill:'#0F7A6C',rx:3});
          const t1=svgEl('title',{}); t1.textContent=`${lab}: ${fmtNum(doneArr[i])} ${t('doneLegend')}`; r1.appendChild(t1); svg.appendChild(r1); }
        if(failArr[i]>0){ const r2=svgEl('rect',{x:cx-barW/2,y:baseY-doneH-failH,width:barW,height:Math.max(failH,0),fill:'#C1432E',rx:3});
          const t2=svgEl('title',{}); t2.textContent=`${lab}: ${fmtNum(failArr[i])} ${t('failLegend')}`; r2.appendChild(t2); svg.appendChild(r2); }
        const xl=svgEl('text',{x:cx,y:H-marginB+18,'text-anchor':'middle',class:'cat-label'}); xl.textContent=lab; svg.appendChild(xl);
      });
      let pathD='';
      labels.forEach((lab,i)=>{ const cx=marginL+bandW*i+bandW/2, rate=rateArr[i]; if(rate===null||rate===undefined) return; const y=marginT+plotH-(rate/100)*plotH; pathD += (pathD===''?'M':'L')+cx+','+y+' '; });
      if(pathD){ const path=svgEl('path',{d:pathD.trim(),fill:'none',stroke:'#C8912B','stroke-width':2.5,'stroke-linecap':'round','stroke-linejoin':'round'}); svg.appendChild(path);
        labels.forEach((lab,i)=>{ const rate=rateArr[i]; if(rate===null||rate===undefined) return; const cx=marginL+bandW*i+bandW/2, y=marginT+plotH-(rate/100)*plotH;
          const dot=svgEl('circle',{cx,cy:y,r:4,fill:'#C8912B',stroke:'#fff','stroke-width':1.5}); const tt=svgEl('title',{}); tt.textContent=`${lab}: ${rate.toFixed(1)}%`; dot.appendChild(tt); svg.appendChild(dot); }); }
      svg.appendChild(svgEl('line',{x1:marginL,x2:W-marginR,y1:marginT+plotH,y2:marginT+plotH,stroke:'#DEE3DA','stroke-width':1}));
      container.appendChild(svg);
    }

    function renderHStackedBar(containerId, labels, doneArr, failArr){
      const container=document.getElementById(containerId); container.innerHTML='';
      const n=labels.length, rowH=34, marginL=130, marginR=60, marginT=10, marginB=10, W=620, plotH=n*rowH, H=plotH+marginT+marginB, plotW=W-marginL-marginR;
      const svg=svgEl('svg',{viewBox:`0 0 ${W} ${H}`, preserveAspectRatio:'xMidYMid meet'});
      if(n===0){ const tx=svgEl('text',{x:W/2,y:H/2||40,'text-anchor':'middle',class:'axis-label'}); tx.textContent=t('noDataFilters'); svg.appendChild(tx); container.appendChild(svg); return; }
      const totals=labels.map((_,i)=>doneArr[i]+failArr[i]); const maxTotal=niceMax(Math.max(...totals,1));
      labels.forEach((lab,i)=>{
        const cy=marginT+rowH*i+rowH/2, barH=18, doneW=(doneArr[i]/maxTotal)*plotW, failW=(failArr[i]/maxTotal)*plotW;
        const lbl=svgEl('text',{x:marginL-10,y:cy+4,'text-anchor':'end',class:'cat-label'}); lbl.textContent=lab; svg.appendChild(lbl);
        if(doneArr[i]>0){ const r1=svgEl('rect',{x:marginL,y:cy-barH/2,width:Math.max(doneW,0),height:barH,fill:'#0F7A6C',rx:3}); const t1=svgEl('title',{}); t1.textContent=`${lab}: ${fmtNum(doneArr[i])}`; r1.appendChild(t1); svg.appendChild(r1); }
        if(failArr[i]>0){ const r2=svgEl('rect',{x:marginL+doneW,y:cy-barH/2,width:Math.max(failW,0),height:barH,fill:'#C1432E',rx:3}); const t2=svgEl('title',{}); t2.textContent=`${lab}: ${fmtNum(failArr[i])}`; r2.appendChild(t2); svg.appendChild(r2); }
        const totalLbl=svgEl('text',{x:marginL+doneW+failW+8,y:cy+4,class:'bar-value'}); totalLbl.textContent=fmtNum(totals[i]); svg.appendChild(totalLbl);
      });
      container.appendChild(svg);
    }

    function renderHBar(containerId, labels, values, color){
      const container=document.getElementById(containerId); container.innerHTML='';
      const n=labels.length, rowH=26, marginL=175, marginR=55, marginT=8, marginB=8, W=620, plotH=n*rowH, H=plotH+marginT+marginB, plotW=W-marginL-marginR;
      const svg=svgEl('svg',{viewBox:`0 0 ${W} ${Math.max(H,40)}`, preserveAspectRatio:'xMidYMid meet'});
      if(n===0){ const tx=svgEl('text',{x:W/2,y:24,'text-anchor':'middle',class:'axis-label'}); tx.textContent=t('noDataFilters'); svg.appendChild(tx); container.appendChild(svg); return; }
      const maxV=niceMax(Math.max(...values,1));
      labels.forEach((lab,i)=>{
        const cy=marginT+rowH*i+rowH/2, barH=14, w=(values[i]/maxV)*plotW;
        const lbl=svgEl('text',{x:marginL-10,y:cy+4,'text-anchor':'end',class:'cat-label'}); lbl.textContent=lab; svg.appendChild(lbl);
        const r=svgEl('rect',{x:marginL,y:cy-barH/2,width:Math.max(w,0),height:barH,fill:color,rx:3}); const tt=svgEl('title',{}); tt.textContent=`${lab}: ${fmtNum(values[i])}`; r.appendChild(tt); svg.appendChild(r);
        const vLbl=svgEl('text',{x:marginL+w+8,y:cy+4,class:'bar-value'}); vLbl.textContent=fmtNum(values[i]); svg.appendChild(vLbl);
      });
      container.appendChild(svg);
    }

    function renderDonut(containerId, legendId, labels, values, colors){
      const container=document.getElementById(containerId); container.innerHTML='';
      const legend=document.getElementById(legendId); legend.innerHTML='';
      const W=260,H=260, cx=W/2, cy=H/2, rOuter=95, rInner=58;
      const svg=svgEl('svg',{viewBox:`0 0 ${W} ${H}`, preserveAspectRatio:'xMidYMid meet'});
      const total=values.reduce((a,b)=>a+b,0);
      if(total<=0){ const tx=svgEl('text',{x:cx,y:cy,'text-anchor':'middle',class:'axis-label'}); tx.textContent=t('noDataFilters'); svg.appendChild(tx); container.appendChild(svg); return; }
      let angleStart=-Math.PI/2;
      labels.forEach((lab,i)=>{
        const frac=values[i]/total, angleEnd=angleStart+frac*Math.PI*2;
        const x1o=cx+rOuter*Math.cos(angleStart), y1o=cy+rOuter*Math.sin(angleStart), x2o=cx+rOuter*Math.cos(angleEnd), y2o=cy+rOuter*Math.sin(angleEnd);
        const x1i=cx+rInner*Math.cos(angleEnd), y1i=cy+rInner*Math.sin(angleEnd), x2i=cx+rInner*Math.cos(angleStart), y2i=cy+rInner*Math.sin(angleStart);
        const largeArc=(angleEnd-angleStart)>Math.PI?1:0;
        const d=`M ${x1o} ${y1o} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x2i} ${y2i} Z`;
        const path=svgEl('path',{d, fill:colors[i%colors.length]}); const tt=svgEl('title',{}); tt.textContent=`${lab}: ${fmtNum(values[i])} (${(frac*100).toFixed(1)}%)`; path.appendChild(tt); svg.appendChild(path);
        angleStart=angleEnd;
        const legendItem=document.createElement('span'); legendItem.innerHTML=`<i style="background:${colors[i%colors.length]}"></i>${esc(lab)} — ${(frac*100).toFixed(0)}%`; legend.appendChild(legendItem);
      });
      const centerLbl=svgEl('text',{x:cx,y:cy-4,'text-anchor':'middle',class:'donut-pct',fill:'#101B30','font-size':'22'}); centerLbl.textContent=fmtNum(total); svg.appendChild(centerLbl);
      const centerSub=svgEl('text',{x:cx,y:cy+16,'text-anchor':'middle',class:'axis-label'}); centerSub.textContent=t('requestsHeader'); svg.appendChild(centerSub);
      container.appendChild(svg);
    }

    return { svgEl, niceMax, renderComboChart, renderHStackedBar, renderHBar, renderDonut };
  }

  return { createCharts };
})();
