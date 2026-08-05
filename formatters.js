/**
 * formatters.js — ARRIVE First Mile Dashboard
 * ------------------------------------------------------------------
 * Pure display-formatting helpers, extracted unchanged from the
 * original inline <script> (esc, monthLabel, locale, fmtNum,
 * fmtCurrency, rateClass). No DOM access.
 * Depends on DashboardI18n for the month name arrays.
 * ------------------------------------------------------------------
 */
window.DashboardFormatters = (function(){

  function esc(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function rateClass(rate){ return rate>=90?'rate-good':(rate>=75?'rate-mid':'rate-bad'); }

  // getLang: () => 'en' | 'ar' — read live so formatters always reflect
  // the current language toggle without needing to be recreated.
  function createFormatters(getLang){
    const { MONTHS_AR, MONTHS_EN } = window.DashboardI18n;

    function monthLabel(m){
      const [y,mo]=m.split('-'); const arr = getLang()==='ar'?MONTHS_AR:MONTHS_EN; const idx=parseInt(mo,10)-1;
      return getLang()==='ar' ? (arr[idx]+' '+y) : (arr[idx]+" '"+y.slice(2));
    }
    function locale(){ return getLang()==='ar' ? 'ar-EG-u-nu-latn' : 'en-US'; }
    function fmtNum(n){ return Math.round(n).toLocaleString(locale()); }
    function fmtCurrency(n){ return fmtNum(n) + (getLang()==='ar' ? ' جنيه' : ' EGP'); }

    return { monthLabel, locale, fmtNum, fmtCurrency, rateClass };
  }

  return { esc, rateClass, createFormatters };
})();
