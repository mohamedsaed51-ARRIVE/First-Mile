// اختبار تصميم فصل الرواتب — يستعمل reportAnalyticData.js الحقيقي + SalarySplit.gs، بيانات اصطناعية بالكامل.
// التشغيل: node tests/salary-separation.test.js
const fs = require('fs'), vm = require('vm'), path = require('path');
let pass = 0, fail = 0;
const check = (n, c, extra) => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c || extra === undefined ? '' : ' ' + JSON.stringify(extra).slice(0, 400))); };
const load = (f, g) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), g);
const w = { console, Date, Math, JSON, Object, Number, String, Array, Set, Map, parseInt, isFinite }; w.window = w; vm.createContext(w);
load('reportAnalyticData.js', w); load('security-design/SalarySplit.gs', w);
const RAD = w.DashboardReportAnalyticData, split = w.salarySplitPayload_;

// ---- بيانات اصطناعية ----
const months = ['2026-07', '2026-08', '2026-09'];
const names = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B1', 'B2', 'B3', 'C1', 'N1']; // A=7 مناديب، B=3 (أقل من الحد)، C=1، N1 بلا مرتب
const branchOfIdx = names.map((n) => n[0] === 'N' ? 'A' : n[0]);
const driverBranch = branchOfIdx;
const sal = (name, m, fixed, extra) => ({ name, month: m, fixed_salary: fixed, extra_salary: extra, vehicle: 'x' });
const salaryRef = [];
names.slice(0, 11).forEach((n, i) => [7, 8, 9].forEach((m) => { if (n === 'A6' && m === 9) return; // A6 بلا صف في الشهر 9 (تغطية جزئية)
  salaryRef.push(sal(n, m, 7777.77 + i * 1000 + m, 123.45 + i)); }));
const SENTINELS = ['7777.77', '8777.77', '123.45'];
const fr = []; // [شهر, مدينة, منطقة, سائق, نوع, حالة, تاجر, سبب, عدد, رسوم, شحنات]
names.forEach((n, di) => [0, 1, 2].forEach((m) => { fr.push([m, 0, 0, di, 0, 0, di % 3, 0, 10 + di, 0, 20 + di + m]); }));
const payload = { months, drivers: names, driverBranch, salaryRef, rows: fr, meta: {} };
const lookups = { months, cities: ['c'], areas: ['a'], drivers: names, clients: ['x', 'y', 'z'], types: ['t'], statuses: ['Done', 'Fail'], reasons: ['r'] };
const fmt = (n) => String(Math.round(n * 100) / 100);
const mk = (ref, frRows) => RAD.create({ lookups, meta: { hasShipments: true }, thresholds: { minDriverVolume: 15, minCityVolume: 30 }, driverBranch, salaryRef: ref,
  t: (k) => k, statusLabel: (x) => x, typeLabel: (x) => x, monthLabel: (x) => x, fmtNum: fmt, fmtCurrency: fmt, esc: (x) => x, rateClass: () => 'rate-mid', insightsEngine: {}, 
  base: { buildScope: () => ({ period: 'p' }), buildCoverScopeLine: () => '', buildSummary: () => ({}) } });
const state = { periodMode: 'range', monthFrom: 0, monthTo: 2 };
const agg = (rows) => ({ fr: rows, total: rows.reduce((s, r) => s + r[8], 0), ships: rows.reduce((s, r) => s + r[10], 0) });
const run = (ref, rows) => { const R = mk(ref).build('driverCost', agg(rows || fr), state); R.generatedAt = 0; return R; };

// 1) الأساس (Golden): السلوك الحالي بالرواتب الكاملة
const base = run(salaryRef);
check('الأساس: 11 مندوبًا بمرتب + مندوب واحد بلا مرتب، ومتوسط تكلفة/شحنة محسوب', base.body.rows.length === 12 && base.body.rows.filter((r) => !r.hasSalary).length === 1 && base.body.totals.avgPerShip > 0, base.body.totals);
check('الأساس: A6 تغطية جزئية (missing=1)', base.body.rows.find((r) => r.name === 'A6').missing === 1);

// 2) دور Finance: الرد مطابق حرفيًا ⇒ التقرير مطابق حرفيًا
const fin = split(payload, 'finance');
check('Finance: الرد كما هو + salaryAccess=granted', fin.salaryAccess === 'granted' && fin.salaryRef.length === salaryRef.length);
check('Finance: تقرير تكلفة المندوب مطابق للأساس حرفيًا', JSON.stringify(run(fin.salaryRef)) === JSON.stringify(base));

// 3) الدور التشغيلي: لا مبالغ فردية في أي مكان من الرد
const ops = split(payload, 'viewer'); const ser = JSON.stringify(ops);
check('التشغيلي: لا salaryRef ولا fixed_salary ولا extra_salary في الرد', !('salaryRef' in ops) && !/fixed_salary|extra_salary|salaryRef/.test(ser));
check('التشغيلي: لا أي قيمة مرتب فردية في JSON (بحث نصي عن القيم المميزة)', SENTINELS.every((s) => !ser.includes(s)) && !salaryRef.some((s) => ser.includes(String(s.fixed_salary)) ));
check('التشغيلي: salaryAccess=denied والبيانات التشغيلية الأخرى لم تتغير', ops.salaryAccess === 'denied' && JSON.stringify(ops.rows) === JSON.stringify(payload.rows) && ops.drivers.length === 12);
const feed = ops.costFeed.byBranchMonth;
check('المجموعات الأقل من 5 مناديب (فرع B وC) مخفية بلا مبلغ', feed.filter((c) => c.branch !== 'A').every((c) => c.suppressed && !('cost' in c)), feed);
check('فرع A (7 مناديب) يحمل مجموعًا فقط، والشهر 9 فيه 6 مناديب محتسبين (A6 بلا صف)', feed.filter((c) => c.branch === 'A').every((c) => !c.suppressed && c.cost > 0) && feed.find((c) => c.branch === 'A' && c.month === 9).couriers === 6);
check('الحجب لا يُنتج استثناءً ولا يكسر مصدر الخادم: split لا يعدّل الأصل', payload.salaryRef.length === salaryRef.length && !!payload.salaryRef[0].fixed_salary);

// 4) المشكلة التي يجب تفاديها: «الإخفاء الساذج» يغيّر نتائج التقرير ويضلّل
const naive = run([]);
check('الإخفاء الساذج (salaryRef=[]) يجعل كل المناديب «بلا مرتب» ويُفقد المتوسط ⇒ استنتاج مضلل', naive.body.rows.every((r) => !r.hasSalary) && naive.body.totals.avgPerShip === null && naive.findings.some((f) => f.key === 'dcnosalary'));

// 5) حساب الفرع للتشغيلي من costFeed = نفس تجميع Finance عند تحقق الشرط (كل مناديب الفرع نشطون في الفلاتر)
const scope = [7, 8, 9];
const opsBranchPerShip = (feedObj, rows, branch) => {
  const cost = feedObj.byBranchMonth.filter((c) => c.branch === branch && scope.includes(c.month)).reduce((s, c) => s + (c.suppressed ? NaN : c.cost), 0);
  const costedNames = new Set(); feedObj.coverage.forEach((c) => costedNames.add(salaryNormName(c.name)));
  const ships = rows.filter((r) => driverBranch[r[3]] === branch && costedNames.has(salaryNormName(names[r[3]]))).reduce((s, r) => s + r[10], 0);
  return cost / ships; };
function salaryNormName(s) { return String(s).replace(/\s+/g, ' ').trim().toLowerCase(); }
const finBranch = (R, branch) => { const rs = R.body.rows.filter((r) => r.branch === branch && r.hasSalary); return rs.reduce((s, r) => s + r.cost, 0) / rs.reduce((s, r) => s + r.ships, 0); };
const a1 = opsBranchPerShip(ops.costFeed, fr, 'A'), a2 = finBranch(base, 'A');
check('تكافؤ: تكلفة/شحنة للفرع A من costFeed = تجميع Finance (فرق < 1e-9)', Math.abs(a1 - a2) < 1e-9, [a1, a2]);
// 6) حدّ التصميم الموثّق: عند فلترة تستبعد مندوبًا مرتّبه محتسب في الفرع ⇒ يختلف الرقم (لذلك يُسمّى «تكلفة الفرع»، لا يُقارن بتكلفة المندوب)
const frSub = fr.filter((r) => r[3] !== 0);       // A1 غير نشط في الفلتر
const baseSub = run(salaryRef, frSub), a3 = opsBranchPerShip(ops.costFeed, frSub, 'A'), a4 = finBranch(baseSub, 'A');
check('حدّ معروف: مع استبعاد مندوب بالفلتر يختلف رقم الفرع التشغيلي عن Finance (موثّق، ليس خطأ)', Math.abs(a3 - a4) > 1e-6, [a3, a4]);
// 7) هجوم الفرق: ضمن costFeed لا يمكن عزل مرتب مندوب واحد (كل خلية ≥5 أو مخفية)
const exposedSingles = feed.filter((c) => !c.suppressed && c.couriers < 5);
check('لا توجد خلية مكشوفة بأقل من 5 مناديب', exposedSingles.length === 0);
console.log(`\n${pass}/${pass + fail} اختبارًا ناجحًا`); process.exit(fail ? 1 : 0);
