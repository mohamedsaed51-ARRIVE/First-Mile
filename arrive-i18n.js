/**
 * arrive-i18n.js v2 — نواة الترجمة المشتركة لداشبوردات ARRIVE (نموذج أولي، مستخلصة من تصميم First-Mile)
 * ------------------------------------------------------------------------------------------------
 * بلا اعتماديات ولا خطوة بناء. تضيف على نمط First-Mile (t(lang,key,vars) + data-i18n):
 *   1) حفظ اللغة:   ?lang=  >  localStorage  >  الافتراضي        (+ استقبال اللغة من البوابة عبر postMessage)
 *   2) RTL/LTR:    تضبط lang و dir على <html> وعلى كل عنصر يحمل data-dir-follow
 *   3) الجمع:      tn(key, n, vars) باستخدام Intl.PluralRules (العربية: zero/one/two/few/many/other)
 *   4) المفاتيح الناقصة: تُسجَّل في missing() ولا تمرّ بصمت (وضع التشخيص يُظهرها ⚠)
 *   5) قيم الشيت:  tv(group, raw) تترجم المفردات المضبوطة فقط؛ غير المعرّف يبقى كما هو ويُسجَّل في unmapped()
 *   6) (v2) طبقة النص المصدر للداشبوردات القديمة ذات HTML/JS المولَّد: addPhrases/addPatterns + مراقب DOM (init({dom:true}))
 *      تترجم الواجهة عند العرض فقط دون تعديل منطق الحساب؛ تحفظ النص الأصلي لكل عقدة فتعود العربية حرفيًا؛
 *      untranslated() تكشف أي نص عربي ظاهر لم يُترجم. tr(src,vars) لنصوص JS التي لا تمر بالـ DOM (رسوم، رسائل).
 * المبدأ: بيانات المصدر (قيم الشيت) تبقى هي المفتاح المنطقي؛ الترجمة للعرض فقط ولا تدخل في أي حساب.
 */
(function (global) {
  'use strict';
  var LANGS = {
    ar: { dir: 'rtl', locale: 'ar-EG-u-nu-latn', label: 'العربية' }, // أرقام لاتينية (نفس نمط First-Mile)
    en: { dir: 'ltr', locale: 'en-US', label: 'English' }
  };
  var S = { lang: 'ar', def: 'ar', dicts: { ar: {}, en: {} }, values: {}, key: 'arrive_lang', debug: false,
            missing: {}, unmapped: {}, subs: [], origins: [], plural: {}, phrases: {}, patterns: [], untr: {}, dom: false };

  function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) { /* التخزين محجوب: نكمل بدون حفظ */ } }
  function valid(l) { return l === 'ar' || l === 'en'; }

  function resolveInitial() {
    var q = null;
    try { q = new URLSearchParams(global.location.search).get('lang'); } catch (e) {}
    if (valid(q)) { lsSet(S.key, q); return q; }
    var st = lsGet(S.key);
    return valid(st) ? st : S.def;
  }

  function fmt(str, vars) {
    if (!vars) return str;
    return String(str).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] == null ? m : vars[k]; }); // كل ظهور (لا الأول فقط)
  }

  function lookup(key) {
    var d = S.dicts[S.lang] && S.dicts[S.lang][key];
    if (d != null) return d;
    S.missing[S.lang + ':' + key] = true;
    if (S.debug && global.console) global.console.warn('[i18n] missing key', S.lang + ':' + key);
    var f = S.dicts[S.def] && S.dicts[S.def][key];
    return f != null ? f : null;
  }

  function t(key, vars) {
    var v = lookup(key);
    if (v == null) return S.debug ? '⚠' + key : key;
    if (typeof v === 'object') v = v.other != null ? v.other : '';
    return (S.debug && S.missing[S.lang + ':' + key] ? '⚠' : '') + fmt(v, vars);
  }

  function tn(key, n, vars) {
    var v = lookup(key);
    if (v == null) return S.debug ? '⚠' + key : key;
    var pr = S.plural[S.lang] || (S.plural[S.lang] = new Intl.PluralRules(S.lang));
    var form = typeof v === 'object' ? (v[pr.select(n)] != null ? v[pr.select(n)] : v.other) : v;
    var all = { n: fmtNum(n) }; if (vars) for (var k in vars) all[k] = vars[k];
    return fmt(form, all);
  }

  function tv(group, raw) {
    if (raw == null || raw === '') return raw == null ? '' : raw;
    if (S.lang === 'ar') return raw; // مصدر البيانات عربي
    var m = S.values[group];
    if (m && Object.prototype.hasOwnProperty.call(m, raw)) return m[raw];
    (S.unmapped[group] || (S.unmapped[group] = {}))[raw] = true;
    return raw;
  }

  function fmtNum(n, o) { return (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString(LANGS[S.lang].locale, o); }
  function fmtPct(r, digits) { return (r == null || isNaN(r)) ? '—' : (r * 100).toFixed(digits == null ? 1 : digits) + '%'; }

  function apply(root) {
    var el = global.document, h = el.documentElement;
    h.setAttribute('lang', S.lang); h.setAttribute('dir', LANGS[S.lang].dir);
    el.querySelectorAll('[data-dir-follow]').forEach(function (e) { e.setAttribute('dir', LANGS[S.lang].dir); });
    (root || el).querySelectorAll('[data-i18n]').forEach(function (e) { e.textContent = t(e.getAttribute('data-i18n')); });
    (root || el).querySelectorAll('[data-i18n-attr]').forEach(function (e) {
      e.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var p = pair.split(':'); if (p.length === 2) e.setAttribute(p[0].trim(), t(p[1].trim()));
      });
    });
    var tk = h.getAttribute('data-title-key'); if (tk) el.title = t(tk);
    el.querySelectorAll('[data-lang-toggle]').forEach(function (b) { b.textContent = S.lang === 'ar' ? LANGS.en.label : LANGS.ar.label; b.setAttribute('lang', S.lang === 'ar' ? 'en' : 'ar'); });
  }


  // ---------------------------------------------------------------------------
  // (v2) طبقة النص المصدر + مراقب DOM
  // ---------------------------------------------------------------------------
  var AR_RE = /[؀-ۿ]/;
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  var REC = typeof WeakMap !== 'undefined' ? new WeakMap() : null, AREC = REC && new WeakMap(), obs = null, busy = false;

  function addPhrases(map) { for (var k in map) if (Object.prototype.hasOwnProperty.call(map, k)) S.phrases[k] = map[k]; }
  function addPatterns(list) { list.forEach(function (p) { S.patterns.push(p); }); }
  function trValue(x) { var v = S.phrases[x]; return v != null ? v : x; }

  // يعيد الترجمة الإنجليزية لنص مصدر، أو null إن لم توجد (لا يُعدّل النص)
  function trText(src) {
    if (src == null) return null;
    var s = String(src), t0 = s.trim();
    if (!t0 || !AR_RE.test(t0)) return null;
    var key = t0.replace(/\s+/g, ' ');                 // فراغات متعددة/أسطر ⇒ فراغ واحد (النصوص الطويلة في HTML)
    var lead = s.slice(0, s.indexOf(t0)), trail = s.slice(lead.length + t0.length), out = S.phrases[key];
    if (out == null) {
      for (var i = 0; i < S.patterns.length; i++) {
        var re = S.patterns[i][0], rep = S.patterns[i][1], m = key.match(re);
        if (m) { var r = typeof rep === 'function' ? rep(m) : key.replace(re, rep); if (r != null) { out = r; break; } }
      }
    }
    return out == null ? null : lead + out + trail;
  }

  function tr(src, vars) {
    var s = fmt(src, vars);
    if (S.lang === 'ar') return s;
    var o = trText(s);
    if (o == null) { if (AR_RE.test(s)) S.untr[s.trim()] = true; return s; }
    return o;
  }

  // النص الأصلي (قبل الترجمة) لعنصر نصي — لتطبيقات تلتقط نص الواجهة وتعيد كتابته لاحقًا
  function srcText(el) {
    var out = '';
    for (var c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) { var r = REC && REC.get(c); out += (r && c.data === r.out) ? r.src : c.data; }
      else if (c.nodeType === 1) out += srcText(c);
    }
    return out;
  }

  function skipEl(el) {
    for (var e = el; e && e.nodeType === 1; e = e.parentNode) {
      var tn = e.tagName;
      if (tn === 'SCRIPT' || tn === 'STYLE' || tn === 'CANVAS' || tn === 'TEXTAREA') return true;
      if (e.hasAttribute && (e.hasAttribute('data-no-i18n') || e.hasAttribute('data-lang-toggle'))) return true;   // زر اللغة يعرض اسم اللغة الأخرى بلغتها
    }
    return false;
  }

  function xText(n) {
    var rec = REC.get(n), cur = n.data, src = (rec && cur === rec.out) ? rec.src : cur; // تغيّر النص من التطبيق ⇒ أصل جديد
    var out = S.lang === 'en' ? trText(src) : null;
    var want = out == null ? src : out;
    if (n.data !== want) n.data = want;
    if (out != null) REC.set(n, { src: src, out: want }); else REC.delete(n);
  }

  function xAttrs(el) {
    var rec = AREC.get(el) || {}, touched = false;
    ATTRS.forEach(function (a) {
      if (!el.hasAttribute(a)) return;
      var cur = el.getAttribute(a), r = rec[a], src = (r && cur === r.out) ? r.src : cur;
      var out = S.lang === 'en' ? trText(src) : null, want = out == null ? src : out;
      if (cur !== want) el.setAttribute(a, want);
      if (out != null) { rec[a] = { src: src, out: want }; touched = true; } else delete rec[a];
    });
    if (touched) AREC.set(el, rec); else AREC.delete(el);
  }

  function domWalk(root) {
    if (!S.dom || !REC) return;
    var doc = global.document;
    if (root.nodeType === 3) { if (!skipEl(root.parentNode)) xText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    var base = root.nodeType === 9 ? root.documentElement : root;
    if (skipEl(base)) return;
    var tw = doc.createTreeWalker(base, 5 /* SHOW_ELEMENT|SHOW_TEXT */, null), n = tw.currentNode;
    while (n) {
      if (n.nodeType === 3) { if (!skipEl(n.parentNode)) xText(n); }
      else if (n.nodeType === 1) { if (skipEl(n)) { n = nextSkip(tw, n); continue; } xAttrs(n); }
      n = tw.nextNode();
    }
  }
  function nextSkip(tw, n) { // تجاوز فرع كامل
    var nx = n.nextSibling; while (!nx && n.parentNode && n !== tw.root) { n = n.parentNode; nx = n.nextSibling; }
    if (nx) { tw.currentNode = nx; return nx; } return null;
  }

  function domApplyAll() { if (!S.dom) return; busy = true; try { domWalk(global.document); } finally { busy = false; if (obs) obs.takeRecords(); } }

  function startObserver() {
    if (obs || typeof MutationObserver === 'undefined') return;
    obs = new MutationObserver(function (list) {
      if (busy || !S.dom) return; busy = true;
      try {
        list.forEach(function (m) {
          if (m.type === 'childList') m.addedNodes.forEach(function (n) { domWalk(n); });
          else if (m.type === 'characterData') { if (m.target.parentNode && !skipEl(m.target.parentNode)) xText(m.target); }
          else if (m.type === 'attributes') { if (!skipEl(m.target)) xAttrs(m.target); }
        });
      } finally { busy = false; obs.takeRecords(); }
    });
    obs.observe(global.document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  // النصوص العربية الظاهرة التي لم تُترجم (للاختبار/التشخيص). في العربية: فارغة دائمًا.
  function untranslated() {
    var out = {}; if (S.lang !== 'en') return [];
    var doc = global.document, tw = doc.createTreeWalker(doc.documentElement, 5, null), n = tw.currentNode;
    while (n) {
      if (n.nodeType === 3) {
        if (n.parentNode && !skipEl(n.parentNode) && AR_RE.test(n.data)) out[n.data.trim()] = 1;
      } else if (n.nodeType === 1 && !skipEl(n)) {
        ATTRS.forEach(function (a) { var v = n.getAttribute && n.getAttribute(a); if (v && AR_RE.test(v)) out['@' + a + ':' + v.trim()] = 1; });
      }
      n = tw.nextNode();
    }
    Object.keys(S.untr).forEach(function (k) { out['js:' + k] = 1; });
    return Object.keys(out);
  }

  function setLang(l, opt) {
    if (!valid(l)) return;
    S.lang = l; lsSet(S.key, l); apply(); domApplyAll();
    S.subs.forEach(function (f) { try { f(l); } catch (e) { if (global.console) global.console.error(e); } });
    if (!(opt && opt.silent)) try { if (global.parent && global.parent !== global) global.parent.postMessage({ type: 'arrive-lang-changed', lang: l }, '*'); } catch (e) {}
  }

  function onMessage(ev) {
    var d = ev.data; if (!d || d.type !== 'arrive-lang' || !valid(d.lang)) return;
    if (S.origins.indexOf(ev.origin) < 0) return;   // فقط أصول البوابة المصرّح بها صراحةً
    if (d.lang !== S.lang) setLang(d.lang, { silent: true });
  }

  function init(o) {
    S.dicts = o.dicts || { ar: {}, en: {} }; S.values = o.values || {}; S.def = o.defaultLang || 'ar'; S.key = o.storageKey || 'arrive_lang';
    S.origins = o.allowedOrigins || [];
    var dbg = false; try { dbg = /[?&]i18nDebug=1/.test(global.location.search); } catch (e) {}
    S.debug = !!(o.debug || dbg);
    S.lang = resolveInitial();
    S.dom = !!o.dom; if (o.phrases) addPhrases(o.phrases); if (o.patterns) addPatterns(o.patterns);
    apply(); if (S.dom) { domApplyAll(); startObserver(); }
    global.addEventListener('message', onMessage);
    global.document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-lang-toggle]'); if (b) setLang(S.lang === 'ar' ? 'en' : 'ar'); });
    try { if (global.parent && global.parent !== global) global.parent.postMessage({ type: 'arrive-lang-ready', lang: S.lang }, '*'); } catch (e) {}
  }

  function keysDiff() { // أداة فحص (تُستخدم في الاختبارات): فروق المفاتيح والمتغيرات بين اللغتين
    var out = { onlyAr: [], onlyEn: [], varMismatch: [] }, a = S.dicts.ar, b = S.dicts.en;
    var vars = function (v) { var s = typeof v === 'object' ? JSON.stringify(v) : String(v); return (s.match(/\{\w+\}/g) || []).filter(function (x, i, arr) { return arr.indexOf(x) === i; }).sort().join(); };
    Object.keys(a).forEach(function (k) { if (!(k in b)) out.onlyAr.push(k); else if (vars(a[k]) !== vars(b[k])) out.varMismatch.push(k); });
    Object.keys(b).forEach(function (k) { if (!(k in a)) out.onlyEn.push(k); });
    return out;
  }

  global.ArriveI18n = {
    init: init, t: t, tn: tn, tv: tv, setLang: setLang, getLang: function () { return S.lang; }, dir: function () { return LANGS[S.lang].dir; },
    locale: function () { return LANGS[S.lang].locale; }, apply: apply, onChange: function (f) { S.subs.push(f); },
    fmtNum: fmtNum, fmtPct: fmtPct, missing: function () { return Object.keys(S.missing); }, unmapped: function () {
      var o = {}; Object.keys(S.unmapped).forEach(function (g) { o[g] = Object.keys(S.unmapped[g]); }); return o; },
    noteMissing: function (lang, key) { S.missing[lang + ':' + key] = true; if (S.debug && global.console) global.console.warn('[i18n] missing key', lang + ':' + key); return S.debug; }, isDebug: function () { return S.debug; },
    addPhrases: addPhrases, addPatterns: addPatterns, tr: tr, trValue: trValue, trText: trText, srcText: srcText, untranslated: untranslated, domApply: domApplyAll,
    keysDiff: keysDiff, _state: S
  };
})(typeof window !== 'undefined' ? window : this);
