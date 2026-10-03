/**
 * arrive-ds.js — جسر بين رموز التصميم (CSS variables) وكود JavaScript.
 * يقرأ الألوان من tokens/arrive-tokens.css حتى لا يبقى أي لون مكتوب داخل
 * ملفات الرسوم أو التقارير. تغيير لون ARRIVE يتم في ملف الـ tokens فقط.
 * عرض فقط — لا علاقة له بالبيانات أو الحسابات.
 */
window.ArriveDS = (function(){
  const MAP = {
    blue:'--arrive-blue', teal:'--arrive-teal', navy:'--arrive-navy', gray:'--arrive-gray',
    done:'--chart-done', fail:'--chart-fail', rate:'--chart-rate', grid:'--chart-grid', axis:'--chart-axis', label:'--chart-label',
    series1:'--chart-1', series2:'--chart-2', series3:'--chart-3', series4:'--chart-4',
    success:'--status-success', progress:'--status-in-progress', action:'--status-under-action', violation:'--status-violation', closed:'--status-closed'
  };
  const FALLBACK = {
    '--arrive-blue':'#0837C9','--arrive-teal':'#00C7E6','--arrive-navy':'#0F172A','--arrive-gray':'#64748B',
    '--chart-done':'#22C55E','--chart-fail':'#EF4444','--chart-rate':'#0837C9','--chart-grid':'#E2E8F0','--chart-axis':'#CBD5E1','--chart-label':'#64748B',
    '--chart-1':'#0837C9','--chart-2':'#00C7E6','--chart-3':'#0F172A','--chart-4':'#94A3B8',
    '--status-success':'#22C55E','--status-in-progress':'#3B82F6','--status-under-action':'#F59E0B','--status-violation':'#EF4444','--status-closed':'#64748B'
  };
  function color(name){
    const v = MAP[name] || name;
    try{
      const s = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
      if(s) return s;
    }catch(e){}
    return FALLBACK[v] || '#0837C9';
  }
  // ألوان أنواع الطلبات في الرسم الدائري: سلسلة العلامة بالترتيب
  function typeColors(){ return [color('series1'), color('series2'), color('series3'), color('series4')]; }
  return { color, typeColors };
})();
