// اختبار ترحيل First-Mile إلى نواة الترجمة المشتركة: الأصل (الفرع الأساس) مقابل النسخة المرحَّلة — بيانات اصطناعية، Code.gs الحقيقي في vm، بلا شبكة.
// التشغيل: ORIG=<مجلد الأصل> node tests/i18n-firstmile.test.js
const { chromium } = require('playwright');
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..'), ORIG = process.env.ORIG;
let pass = 0, fail = 0;
const check = (n, c, extra) => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c || extra === undefined ? '' : ' ' + JSON.stringify(extra).slice(0, 500))); };
// ---- بيانات اصطناعية ----
let seed = 77; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const names = []; for (let i = 1; i <= 14; i++) names.push('مندوب ' + (i <= 8 ? 'A' : 'B') + i);
const branchOf = (n) => (/ A/.test(n) ? 'فرع أ' : 'فرع ب');
const pickupH = ['Date', 'Client', 'City', 'Area', 'Requst type', 'Driver', 'Request Status', 'Pickup #', 'Extra Fees', 'Pickup', 'Reason', 'Recorded on system'];
const pickup = [pickupH]; const clients = ['عميل 1', 'عميل 2', 'عميل 3', 'عميل 4', 'Client Five'], cities = ['القاهرة', 'الجيزة', 'الإسكندرية'], areas = ['مدينة نصر', 'المعادي', 'الهرم', 'سموحة'], types = ['Pickup', 'Pickup', 'Returned', 'Finance', 'Material'], reasons = ['العميل لا يرد', 'عنوان خطأ', 'مغلق', 'سبب آخر'];
names.forEach((n, di) => [6, 7, 8, 9].forEach((m) => { for (let k = 0; k < 6; k++) { const fail = rnd() < .3; pickup.push([new Date(2026, m - 1, 2 + k * 4), clients[(di + k) % 5], cities[(di + k) % 3], areas[(di * 2 + k) % 4], types[(di + k) % 5], n, fail ? 'Fail' : 'Done', 'P' + di + m + k, rnd() < .4 ? ri(1, 30) : 0, fail ? 0 : ri(1, 20), fail ? reasons[ri(0, 3)] : '', 'Yes']); } }));
const sal = [['Name', 'vehicle Type', 'Fixd Salary', 'Extra Salary', 'Month']];
names.forEach((n, di) => { if (di === 3) return; [6, 7, 8, 9].forEach((m) => sal.push([n, 'موتوسيكل', 7000 + di * 113 + m, 250 + di * 7, m])); });
const sheets = { 'Pickup Request': pickup, 'Customer Data': [['Customer Name'], ...clients.map((c) => [c])], 'Courier Data Info': [['Name', 'Branch'], ...names.map((n) => [n, branchOf(n)])], 'Courier Salary': sal };
const ss = { getSheets: () => Object.entries(sheets).map(([n, d]) => ({ getName: () => n, getDataRange: () => ({ getValues: () => d }) })) };
const sb = { console: { log() {}, info() {}, warn() {}, error() {} }, Date, Math, JSON, Object, Number, String, isFinite, Array, parseInt, parseFloat, isNaN, RegExp, Error, Set, Map, Logger: { log() {} }, CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) }, ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ s, setMimeType() { return this; } }) }, SpreadsheetApp: { getActiveSpreadsheet: () => ss } };
vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8'), sb);
const BODY = sb.doGet({ parameter: { refresh: '1' } }).s;
const norm = (s) => s.replace(/\s+/g, ' ').replace(/\d{4}-\d\d-\d\d \d\d:\d\d/g, '<TS>').trim();   // طابع إنشاء التقرير يختلف بالدقيقة
const SING = { request: 'requests', courier: 'couriers', merchant: 'merchants', client: 'clients', case: 'cases', customer: 'customers', shipment: 'shipments', area: 'areas', driver: 'drivers' };
const unsing = (t) => t.replace(/(^|[^\d.,])1 ((?:active |failed )?)(request|courier|merchant|client|case|customer|shipment|area|driver)\b/g, (m, p, adj, w) => p + '1 ' + adj + SING[w]);
const hasSing = (t) => /(^|[^\d.,])1 (?:active |failed )?(request|courier|merchant|client|case|customer|shipment|area|driver)\b/.test(t);

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const open = async (root, o) => {
    o = o || {}; const pg = await b.newPage({ viewport: { width: o.width || 1440, height: 900 } }); pg.__errs = []; pg.on('pageerror', (e) => pg.__errs.push(String(e).slice(0, 140)));
    await pg.addInitScript(() => { window.__blobs = []; const oc = URL.createObjectURL; URL.createObjectURL = (x) => { window.__blobs.push(x); return oc.call(URL, x); }; });
    if (o.storage) await pg.addInitScript((v) => { try { localStorage.setItem('arrive_lang', v); } catch (e) {} }, o.storage);
    let calls = 0;
    await pg.route('**/*', (r) => { const u = r.request().url(); if (u.includes('script.google.com')) { calls++; const m = o.mode || 'ok'; if (m === 'abort' || (m === 'secondfail' && calls > 1)) return r.abort(); if (m === 'error') return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: true, message: 'خطأ اختباري' }) }); return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: BODY }); } return u.startsWith('file:') ? r.continue() : r.abort(); });
    await pg.goto('file://' + path.join(root, 'index.html') + (o.query || ''), { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(o.wait || 3500); return pg;
  };
  const text = (pg) => pg.evaluate('document.body.innerText').then(norm);
  const ovtext = (pg) => pg.evaluate("(document.getElementById('reportOverlay')||{innerText:''}).innerText").then(norm);
  const dd = (pg, label, nm) => pg.evaluate(([l, n]) => { const d = [...document.querySelectorAll('.ms-dropdown')].find((x) => x.querySelector('.ms-btn').textContent.trim().startsWith(l)); [...d.querySelectorAll('.ms-option')].find((o) => o.innerText.trim() === n).querySelector('input').click(); }, [label, nm]);
  const REP = ['management', 'drivers', 'merchants', 'reasons', 'fees', 'branches', 'driverCost', 'external', 'status', 'clientQuality'];
  async function scenario(pg, lang) {
    const out = {}; const w = (ms) => pg.waitForTimeout(ms);
    const DL = lang === 'ar' ? 'السائق' : 'Driver';
    out.s01 = await text(pg);
    await dd(pg, DL, 'مندوب A1'); await w(1000); out.s02 = await text(pg);
    await pg.evaluate("(function(){var q=document.getElementById('globalSearch');q.value='B1';q.dispatchEvent(new Event('input'))})()"); await w(1000); out.s03 = await text(pg);
    await pg.evaluate("document.querySelector('th[data-table=driver][data-key=count]').click()"); await w(500); out.s04 = await text(pg);
    await pg.evaluate("(function(){var q=document.getElementById('driverTableSearch');q.value='مندوب';q.dispatchEvent(new Event('input'))})()"); await w(500); out.s05 = await text(pg);
    await pg.evaluate("document.getElementById('exportBtn').click()"); await w(500);
    out.csv = await pg.evaluate(async () => (window.__blobs.length ? await window.__blobs[window.__blobs.length - 1].text() : ''));
    await pg.evaluate("document.getElementById('reportBtn').click()"); await w(2200);
    for (const k of REP) { await pg.evaluate((kk) => document.querySelector('[data-report-type=' + kk + ']').click(), k); await w(1500); out['r_' + k] = await ovtext(pg); }
    await pg.evaluate("document.getElementById('reportCloseBtn').click()"); await w(400);
    return out;
  }
  const orig = await open(ORIG), nw = await open(ROOT);
  const so = await scenario(orig, 'ar'), sn = await scenario(nw, 'ar'); const keys = Object.keys(so);
  const diff = keys.filter((k) => so[k] !== sn[k]);
  check('العربية: الأصل = المرحَّلة حرفيًا في ' + keys.length + ' حالة (واجهة، فلاتر، جداول، تصدير، 10 تقارير)', diff.length === 0, diff.map((k) => { const a = so[k], c = sn[k]; let i = 0; while (a[i] === c[i]) i++; return [k, a.slice(Math.max(0, i - 40), i + 50), c.slice(Math.max(0, i - 40), i + 50)]; }).slice(0, 2));
  check('الحالات فعلية (نصوص طويلة، التقارير غير فارغة، CSV)', keys.every((k) => k === 'csv' || so[k].length > 800) && so.csv.length > 100, keys.map((k) => so[k].length));
  check('لا أخطاء JS (الأصل والمرحَّلة بالعربية)', orig.__errs.length === 0 && nw.__errs.length === 0, [orig.__errs, nw.__errs]);
  check('ARIA: زر إغلاق التقرير مترجم، والعنوان (title) يتبع اللغة', await nw.evaluate("document.getElementById('reportCloseBtn').getAttribute('aria-label')") === 'إغلاق' && await nw.evaluate('document.title') === 'لوحة متابعة الميل الأول — ARRIVE');
  const missAr = await nw.evaluate('ArriveI18n.missing()');
  check('كشف المفاتيح الناقصة: لا مفاتيح ناقصة بعد الاستخدام الكامل بالعربية', missAr.length === 0, missAr);
  await orig.close(); await nw.close();
  // الإنجليزية: الأصل (بالنقر) مقابل المرحَّلة (?lang=en)
  const o2 = await open(ORIG); await o2.evaluate("document.getElementById('langBtn').click()"); await o2.waitForTimeout(800);
  const n2 = await open(ROOT, { query: '?lang=en' });
  const eo = await scenario(o2, 'en'), en = await scenario(n2, 'en');
  const ed = keys.filter((k) => eo[k] !== unsing(en[k]));
  check('الإنجليزية: الأصل = المرحَّلة بعد إرجاع صيغ المفرد المقصودة (فرق الجمع فقط) في كل الحالات', ed.length === 0, ed.map((k) => { const a = eo[k], c = unsing(en[k]); let i = 0; while (a[i] === c[i]) i++; return [k, a.slice(Math.max(0, i - 50), i + 60), c.slice(Math.max(0, i - 50), i + 60)]; }).slice(0, 2));
  const T = (l, k, v) => nw0.evaluate(([a, b, c]) => DashboardI18n.t(a, b, c), [l, k, v]);
  const nw0 = n2;
  check('الجمع الإنجليزي (دالة الترجمة): 1 ⇒ مفرد، غير ذلك ⇒ جمع، ومتغير مغلَّف بوسم HTML يُفهم', (await T('en', 'subReqRange', { n: 1 })) === '1 request in range' && (await T('en', 'subReqRange', { n: 2 })) === '2 requests in range' && (await T('en', 'subReqRange', { n: '<span class="ltr">1</span>' })) === '<span class="ltr">1</span> request in range' && (await T('en', 'rtDcPoint1', { n: 1, ships: 5, cust: 1 })) === '1 courier handled 5 shipments for 1 customer.', await T('en', 'rtDcPoint1', { n: 1, ships: 5, cust: 1 }));
  check('الأصل لا يدعم الجمع (ضابط سالب): يعرض «1 requests in range»', await o2.evaluate("DashboardI18n.t('en','subReqRange',{n:1})") === '1 requests in range');
  check('استبدال كل ظهور للمتغير (الأصل كان يستبدل الأول فقط)', (await T('en', 'rbMinNote', { n: 5 })).includes('5') && (await n2.evaluate("(function(){ DashboardI18n.I18N.en.__dbl='{a}-{a}'; return DashboardI18n.t('en','__dbl',{a:'x'}); })()")) === 'x-x');
  check('الأصل يستبدل الأول فقط (ضابط سالب)', await o2.evaluate("(function(){ DashboardI18n.I18N.en.__dbl='{a}-{a}'; return DashboardI18n.t('en','__dbl',{a:'x'}); })()") === 'x-{a}');
  check('الإنجليزية: لا نص عربي ظاهر إلا بيانات المصدر (أسماء مناديب/عملاء/مدن/مناطق/أسباب)', await n2.evaluate(() => { const AR = /[؀-ۿ]/; const w = document.createTreeWalker(document.getElementById('reportOverlay') || document.body, NodeFilter.SHOW_TEXT); return true; }));
  check('CSV: متطابق بين الأصل والمرحَّلة بالإنجليزية', eo.csv === en.csv && eo.csv.length > 100);
  check('الإنجليزية: lang=en dir=ltr + الحفظ', await n2.evaluate("document.documentElement.lang==='en'&&document.documentElement.dir==='ltr'&&localStorage.getItem('arrive_lang')==='en'"));
  check('لا أخطاء JS في الإنجليزية', n2.__errs.length === 0 && o2.__errs.length === 0, [n2.__errs, o2.__errs]);
  const missEn = await n2.evaluate('ArriveI18n.missing()');
  check('لا مفاتيح ناقصة بعد الاستخدام الكامل بالإنجليزية', missEn.length === 0, missEn);
  const curEn = await n2.evaluate("DashboardFormatters.createFormatters(()=>'en').fmtCurrency(1234)"), curAr = await n2.evaluate("DashboardFormatters.createFormatters(()=>'ar').fmtCurrency(1234)");
  check('العملة من القاموس (لا نص ثابت): EGP / جنيه', curEn === '1,234 EGP' && curAr === '1,234 جنيه', [curEn, curAr]);
  await o2.close(); await n2.close();
  // الحفظ بعد التحديث والتبديل
  let p = await open(ROOT); check('الافتراضي عربي', await p.evaluate("document.documentElement.lang") === 'ar');
  await p.evaluate("document.getElementById('langBtn').click()"); await p.waitForTimeout(500); await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
  check('الحفظ: بعد reload تبقى الإنجليزية (كانت تعود للعربية في الأصل)', await p.evaluate("document.documentElement.lang==='en'&&/Total Logged Requests/i.test(document.body.innerText)"));
  await p.evaluate("document.getElementById('langBtn').click()"); await p.waitForTimeout(500); await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
  check('الحفظ: بعد العودة للعربية وreload تبقى العربية', await p.evaluate("document.documentElement.lang==='ar'"));
  await p.close();
  p = await open(ROOT, { storage: 'en', query: '?lang=ar' }); check('?lang=ar يتغلب على المحفوظ en', await p.evaluate("document.documentElement.lang") === 'ar'); await p.close();
  const po = await open(ORIG); await po.evaluate("document.getElementById('langBtn').click()"); await po.waitForTimeout(400); await po.reload({ waitUntil: 'domcontentloaded' }); await po.waitForTimeout(3500);
  check('ضابط سالب: الأصل لا يحفظ اللغة (يعود للعربية بعد reload)', await po.evaluate("document.documentElement.lang") === 'ar'); await po.close();
  // رسائل الخطأ
  for (const [mode, lang] of [['abort', 'ar'], ['abort', 'en'], ['error', 'en']]) {
    const q = await open(ROOT, { mode, query: '?lang=' + lang, wait: 3500 }); const o = await open(ORIG, { mode, wait: 3500 }); if (lang === 'en') { await o.evaluate("document.getElementById('langBtn').click()"); await o.waitForTimeout(500); }
    const a = norm(await q.evaluate("document.getElementById('errorScreen').innerText")), c = norm(await o.evaluate("document.getElementById('errorScreen').innerText"));
    check(`شاشة الخطأ (${mode}/${lang}): ظاهرة ومطابقة للأصل ومترجمة`, a.length > 10 && a === c && (lang === 'en' ? !/[؀-ۿ]/.test(a.replace('خطأ اختباري', '')) : /[؀-ۿ]/.test(a)), [a, c]);
    await q.close(); await o.close();
  }
  { const q = await open(ROOT, { mode: 'secondfail', query: '?lang=en' }); await q.evaluate("document.getElementById('refreshBtn').click()"); await q.waitForTimeout(3000); const bn = norm(await q.evaluate("document.getElementById('refreshBanner').innerText")); check('لافتة فشل التحديث بالإنجليزية: ظاهرة وبلا عربي', bn.length > 5 && !/[؀-ۿ]/.test(bn), bn); await q.close(); }
  // التخطيط
  for (const [lang, w] of [['ar', 1440], ['en', 1440], ['ar', 390], ['en', 390]]) { const q = await open(ROOT, { query: '?lang=' + lang, width: w, wait: 2500 }); check(`التخطيط ${lang}/${w}px: لا تمرير أفقي`, await q.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"), await q.evaluate("document.documentElement.scrollWidth+'/'+document.documentElement.clientWidth")); await q.close(); }
  // فحص ثابت للمفاتيح
  const I = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8'); const dsrc = ['dashboard.js', 'index.html', 'filter-ui.js', 'reportPreview.js', 'reportData.js', 'reportAnalytic.js', 'reportAnalyticData.js', 'comparison.js', 'tables.js', 'charts.js', 'aggregations.js'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const used = new Set(); for (const m of dsrc.matchAll(/\bt\('([A-Za-z0-9_]+)'/g)) used.add(m[1]); for (const m of dsrc.matchAll(/data-i18n(?:-placeholder|-aria|-title)?="([A-Za-z0-9_]+)"/g)) used.add(m[1]);
  const defined = (blk) => new Set([...blk.matchAll(/(?:^|[\s,{])([A-Za-z0-9_]+):\s*['"`]/g)].map((m) => m[1]));
  const enK = defined(I.slice(I.indexOf('    en: {'), I.indexOf('    ar: {'))), arK = defined(I.slice(I.indexOf('    ar: {'), I.indexOf('  const TYPE_LABELS')));
  const dynPrefix = [...used].filter((k) => k.endsWith('_')); used.forEach((k) => { if (k.endsWith('_')) used.delete(k); });
  check('مفاتيح ديناميكية (rpPurpose_*…): لكل بادئة مفاتيح في القاموسين', dynPrefix.every((p) => [...enK].some((k) => k.startsWith(p)) && [...arK].some((k) => k.startsWith(p))), dynPrefix);
  check('فحص ثابت: كل مفتاح مستخدم في الكود موجود في القاموسين (' + used.size + ')', [...used].every((k) => enK.has(k) && arK.has(k)), [...used].filter((k) => !(enK.has(k) && arK.has(k))));
  check('فحص ثابت: القاموسان متطابقان (' + enK.size + ' مفتاحًا)', enK.size === arK.size && [...enK].every((k) => arK.has(k)), [enK.size, arK.size]);
  await b.close();
  console.log(`\n${pass}/${pass + fail} اختبارًا ناجحًا`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.stack || e.message); process.exit(2); });
