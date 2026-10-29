// اختبار واجهة فصل الرواتب (First-Mile) — بيانات اصطناعية. Code.gs الحقيقي (vm) ← SalarySplit.gs (حسب الدور) ← الواجهة في متصفح حقيقي.
// يقارن بنسخة الأصل (الفرع الأساس) عبر ORIG=<مجلد>. التشغيل: ORIG=/path/to/original node tests/salary-ui.test.js
const { chromium } = require('playwright');
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..'), ORIG = process.env.ORIG;
let pass = 0, fail = 0;
const check = (n, c, extra) => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c || extra === undefined ? '' : ' ' + JSON.stringify(extra).slice(0, 500))); };
// ---- بيانات اصطناعية: فرع A (7 مناديب + N1 بلا مرتب)، فرع B (3 مناديب) ----
const names = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'N1', 'B1', 'B2', 'B3'].map((n) => 'مندوب ' + n);
const branchOf = (n) => (/ B/.test(n) ? 'فرع ب' : 'فرع أ');
const pickupH = ['Date', 'Client', 'City', 'Area', 'Requst type', 'Driver', 'Request Status', 'Pickup #', 'Extra Fees', 'Pickup', 'Reason', 'Recorded on system'];
const pickup = [pickupH]; const clients = ['عميل 1', 'عميل 2', 'عميل 3'];
names.forEach((n, di) => [7, 8, 9].forEach((m) => { for (let k = 0; k < 4; k++) pickup.push([new Date(2026, m - 1, 3 + k * 5), clients[(di + k) % 3], 'القاهرة', 'مدينة نصر', 'Pickup', n, k === 3 ? 'Fail' : 'Done', 'P' + di + m + k, 0, 10 + di + k, k === 3 ? 'سبب' : '', 'Yes']); }));
const sal = [['Name', 'vehicle Type', 'Fixd Salary', 'Extra Salary', 'Month']]; const SENT = new Set();
names.forEach((n, di) => { if (/N1/.test(n)) return; [7, 8, 9].forEach((m) => { if (/A6/.test(n) && m === 9) return; const f = 7000 + 113 * di + m * 3, x = 250 + 7 * di; sal.push([n, 'موتوسيكل', f, x, m]); SENT.add(f); SENT.add(x); SENT.add(f + x); }); });
const sheets = { 'Pickup Request': pickup, 'Customer Data': [['Customer Name'], ...clients.map((c) => [c])], 'Courier Data Info': [['Name', 'Branch'], ...names.map((n) => [n, branchOf(n)])], 'Courier Salary': sal };
const ss = { getSheets: () => Object.entries(sheets).map(([n, d]) => ({ getName: () => n, getDataRange: () => ({ getValues: () => d }) })) };
const mkSb = (extra) => { const sb = Object.assign({ console: { log() {}, info() {}, warn() {}, error() {} }, Date, Math, JSON, Object, Number, String, isFinite, Array, parseInt, parseFloat, isNaN, RegExp, Error, Set, Map, Logger: { log() {} },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) }, ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ s, setMimeType() { return this; } }) }, SpreadsheetApp: { getActiveSpreadsheet: () => ss } }, extra || {}); vm.createContext(sb); return sb; };
const sb = mkSb(); vm.runInContext(fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8'), sb);
const raw = JSON.parse(sb.doGet({ parameter: { refresh: '1' } }).s);
const sp = mkSb(); vm.runInContext(fs.readFileSync(path.join(ROOT, 'security-design', 'SalarySplit.gs'), 'utf8'), sp);
const splitFor = (role) => JSON.stringify(vm.runInContext('salarySplitPayload_(' + JSON.stringify(raw) + ', ' + JSON.stringify(role) + ')', sp));
const bodies = { raw: JSON.stringify(raw), finance: splitFor('finance'), ops: splitFor('viewer') };
const fmtV = (v) => [String(v), Number(v).toLocaleString('en-US')];
const tables = (pg) => pg.evaluate(() => [...document.querySelectorAll('#reportOverlay table')].map((t) => ({ head: [...t.querySelectorAll('tr')[0].children].map((x) => x.innerText.trim()), rows: [...t.querySelectorAll('tr')].slice(1).map((tr) => [...tr.children].map((c) => c.innerText.trim())) })));
const nnum = (s) => { const m = String(s).replace(/[^\d.\-]/g, ''); return m === '' ? null : Number(m); };

(async () => {
  check('الرد الخام (الحالي) يحوي الرواتب الفردية — ضابط سالب يثبت أن الفصل ضروري', raw.salaryRef.length > 20 && /fixed_salary/.test(bodies.raw), raw.salaryRef && raw.salaryRef.length);
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const served = {};
  const open = async (root, which, label) => {
    const pg = await b.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; pg.on('pageerror', (e) => errs.push(String(e).slice(0, 140))); pg.__errs = errs; served[label] = [];
    await pg.route('**/*', (r) => { const u = r.request().url(); if (u.includes('script.google.com')) { served[label].push(bodies[which]); return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: bodies[which] }); } return u.startsWith('file:') ? r.continue() : r.abort(); });
    await pg.goto('file://' + path.join(root, 'index.html'), { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(3500); await pg.evaluate("document.getElementById('langBtn').click()"); await pg.waitForTimeout(800); return pg;   // الافتراضي عربي ⇒ نبدّل للإنجليزية
  };
  const report = async (pg) => { await pg.evaluate("document.getElementById('reportBtn').click()"); await pg.waitForTimeout(1500); await pg.evaluate("document.querySelector('[data-report-type=driverCost]').click()"); await pg.waitForTimeout(1800); };
  const closeReport = (pg) => pg.evaluate("document.getElementById('reportCloseBtn').click()");
  const section = (pg) => pg.evaluate("document.getElementById('salaryRefNote').innerText + '|' + document.getElementById('salaryRefTable').innerText");
  const filterDriver = async (pg, nm) => { await pg.evaluate((n) => { const dd = [...document.querySelectorAll('.ms-dropdown')].find((d) => /^Driver/i.test(d.querySelector('.ms-btn').textContent)); [...dd.querySelectorAll('.ms-option')].find((o) => o.innerText.trim() === n).querySelector('input').click(); }, nm); await pg.waitForTimeout(1200); };

  // ===== 1) Finance مقابل الأصل =====
  const orig = await open(ORIG, 'raw', 'orig'), fin = await open(ROOT, 'finance', 'fin'), ops = await open(ROOT, 'ops', 'ops');
  check('الأصل يعمل على الرد الخام ببيانات اصطناعية (قسم المرتبات فيه 10 صفوف)', (await section(orig)).split('\n').length >= 10, await section(orig));
  check('Finance: قسم المرتبات المرجعي مطابق للأصل حرفيًا', (await section(fin)) === (await section(orig)));
  await report(orig); await report(fin);
  const to = await tables(orig), tf = await tables(fin);
  check('Finance: تقرير تكلفة المندوب (كل الجداول) مطابق للأصل حرفيًا', JSON.stringify(to) === JSON.stringify(tf) && to.length > 0, [to.length, tf.length]);
  const kpiTxt = (pg) => pg.evaluate("document.getElementById('reportOverlay').innerText");
  const ot = await kpiTxt(orig), ft = await kpiTxt(fin);
  check('Finance: نص التقرير الكامل (مؤشرات، ملاحظات، استنتاجات) مطابق للأصل حرفيًا', ot === ft, [ot.length, ft.length]);
  check('Finance: لا أخطاء JS', fin.__errs.length === 0 && orig.__errs.length === 0, [fin.__errs, orig.__errs]);
  const drvTable = tf.find((t) => t.head.some((h) => /Driver/i.test(h)) && t.head.some((h) => /Fixed/i.test(h)));
  check('Finance: جدول المناديب يحوي الرواتب والتكلفة/شحنة لكل مندوب', !!drvTable && drvTable.rows.filter((r) => nnum(r[5]) > 0).length >= 8, drvTable && drvTable.head);
  const fRows = drvTable.rows.filter((r) => /^مندوب/.test(r[1]));
  const exp = {}; fRows.forEach((r) => { if (r[8] === '—') return; const br = r[2]; const e = exp[br] || (exp[br] = { cost: 0, ships: 0, n: 0 }); e.cost += nnum(r[8]); e.ships += nnum(r[4]); e.n++; });

  // ===== 2) التشغيلي: لا مبالغ في أي رد أو شاشة =====
  const reqBodies = served.ops.join('');
  check('التشغيلي: أي رد وصل الواجهة لا يحوي salaryRef/fixed_salary/extra_salary', !/salaryRef|fixed_salary|extra_salary/.test(reqBodies) && served.ops.length > 0, served.ops.length);
  const leakNums = [...SENT].filter((v) => fmtV(v).some((s) => new RegExp('(^|[^\\d.,])' + s.replace(/[.,]/g, '\\$&') + '([^\\d]|$)').test(reqBodies)));
  check('التشغيلي: لا قيمة مرتب فردية (ثابت/إضافي/مجموع) في أي رد (' + SENT.size + ' قيمة فُحصت)', leakNums.length === 0, leakNums.slice(0, 5));
  await ops.evaluate("document.getElementById('dashboardRoot')"); const secOps = await section(ops);
  check('التشغيلي: قسم المرتبات يوضح أن الحجب بالصلاحية (لا «لا توجد بيانات») ويعرض مجاميع الفروع فقط', /not available for your permission level/.test(secOps) && /Hidden \(fewer than 5 couriers\)/.test(secOps) && !/موتوسيكل/.test(secOps), secOps);
  await report(ops); const to2 = await tables(ops); const opsText = await kpiTxt(ops);
  const domNums = [...SENT].filter((v) => fmtV(v).some((s) => new RegExp('(^|[^\\d.,])' + s.replace(/[.,]/g, '\\$&') + '([^\\d]|$)').test(secOps + opsText)));
  check('التشغيلي: لا قيمة مرتب فردية في الشاشة (القسم + التقرير)', domNums.length === 0, domNums.slice(0, 5));
  const brT = to2.find((t) => t.head.some((h) => /Branch payroll/i.test(h))), drT = to2.find((t) => t.head.some((h) => /^Salary data$/i.test(h)));
  check('التشغيلي: جدول «تكلفة الشحنة حسب الفرع» + جدول المناديب بحالة بيانات المرتب (بلا أعمدة مبالغ)', !!brT && !!drT && !drT.head.some((h) => /Fixed|Extra|Total cost/i.test(h)), to2.map((t) => t.head));
  const brA = brT.rows.find((r) => r[0] === 'أ'), brB = brT.rows.find((r) => r[0] === 'ب');
  check('التشغيلي: فرع B (3 مناديب) مخفي بوضوح وليس «0» أو «بلا مرتب»', brB && /Hidden \(fewer than 5 couriers\)/.test(brB[3]) && /Restricted/.test(brB[4]), brB);
  const expA = exp['أ'];
  check('التشغيلي: مرتبات الفرع A وشحناته = تجميع Finance لنفس الفرع حرفيًا، وتكلفة الشحنة تطابق ضمن تقريب العرض (0.5)', brA && nnum(brA[3]) === expA.cost && nnum(brA[2]) === expA.ships && Math.abs(nnum(brA[4]) - expA.cost / expA.ships) <= 0.5, [brA, expA]);
  check('التشغيلي: لا علامة نطاق عند عدم وجود فلاتر', brA && brA[5] === '', brA);
  const nosal = (t, col) => t.rows.filter((r) => /No salary row/.test(r[col])).map((r) => r[1]);
  check('التشغيلي: «بلا صف مرتب» = المندوب الفعلي بلا مرتب فقط (N1)، لا كل المناديب', JSON.stringify(nosal(drT, 6)) === JSON.stringify(['مندوب N1']), nosal(drT, 6));
  check('التشغيلي: مؤشر «مناديب بلا بيانات مرتب» = Finance', /without salary data\s*\n?\s*1\b/i.test(opsText.replace(/\n+/g, ' ')) || (opsText.match(/Couriers without salary data[^\d]*(\d+)/i) || [])[1] === (ft.match(/Couriers without salary data[^\d]*(\d+)/i) || [])[1], (opsText.match(/Couriers without salary data[^\d]*(\d+)/i) || [])[1]);
  check('التشغيلي: لا استنتاج مضلل (لا «كل المناديب بلا مرتب») وتظهر ملاحظة تقييد الصلاحية', !/Couriers without salary data\D*11/.test(opsText) && /restricted for your permission level/.test(opsText), opsText.slice(0, 200));
  check('التشغيلي: لا أخطاء JS', ops.__errs.length === 0, ops.__errs);
  // ===== 3) الفلاتر: تكلفة الشحنة لا تتغير بصمت =====
  await closeReport(fin); await closeReport(ops);
  await filterDriver(fin, 'مندوب A1'); await filterDriver(ops, 'مندوب A1');
  await report(fin); await report(ops);
  const tf2 = await tables(fin), to3 = await tables(ops);
  const fr2 = tf2.find((t) => t.head.some((h) => /Fixed/i.test(h))).rows.filter((r) => /^مندوب/.test(r[1]) && r[2] === 'أ' && r[8] !== '—');
  const finA2 = fr2.reduce((s, r) => s + nnum(r[8]), 0) / fr2.reduce((s, r) => s + nnum(r[4]), 0);
  const opsA2 = to3.find((t) => t.head.some((h) => /Branch payroll/i.test(h))).rows.find((r) => r[0] === 'أ');
  check('فلتر يستبعد مندوبًا محتسبًا (A1): رقم الفرع التشغيلي يختلف عن Finance (موثّق) ولا يختلف بصمت', opsA2 && Math.abs(nnum(opsA2[4]) - finA2) > 0.5 && /Filters exclude 1 courier/.test(opsA2[5]), [opsA2, finA2]);
  check('فلتر يستبعد مندوبًا: التقرير يعرض استنتاج النطاق (rtFindDcScope) ويشرح الفرق', /Branches where filters exclude couriers/.test(await kpiTxt(ops)) && /includes the salary of any courier the filters exclude/.test(await kpiTxt(ops)));
  check('فلتر: Finance يتغير رقمه (المقام والبسط معًا) كما في الأصل — لا تغيير في سلوكه', finA2 > 0 && Math.abs(finA2 - exp['أ'].cost / exp['أ'].ships) > 0.001);
  // ===== 4) العربية والمفاتيح =====
  await closeReport(ops); await ops.evaluate("document.getElementById('langBtn').click()"); await ops.waitForTimeout(800); await report(ops);
  const arText = await kpiTxt(ops), arSec = await section(ops);
  check('العربية: نصوص الوضع المقيَّد مترجمة (لا مفاتيح خام ولا إنجليزية متبقية)', /غير متاح لصلاحيتك/.test(arText) && /تكلفة شحنة الفرع/.test(arText) && !/\brt[A-Z]\w+\b|\bsalaryRestricted/.test(arText + arSec) && /المرتبات الفردية غير متاحة/.test(arSec), arText.slice(0, 200));
  check('العربية: لا أخطاء JS', ops.__errs.length === 0, ops.__errs);
  await b.close();
  console.log(`\n${pass}/${pass + fail} اختبارًا ناجحًا`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.stack || e.message); process.exit(2); });
