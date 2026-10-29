// اختبارات أمان First-Mile — بيانات اصطناعية فقط. يشغّل Code.gs الحقيقي في vm بشيت ضار ويمرّر الرد للواجهة (الشبكة محجوبة).
// التشغيل: node tests/security.test.js     ROOT=<مجلد> لاختبار نسخة أخرى.   (playwright + chromium)
const { chromium } = require('playwright');
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = process.env.ROOT || path.join(__dirname, '..');
const X = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
let pass = 0, fail = 0;
const check = (n, c, extra) => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c || extra === undefined ? '' : ' ' + JSON.stringify(extra))); };

const mk = (data) => ({ getName: null, getDataRange: () => ({ getValues: () => data }) });
const pickupH = ['Date', 'Client', 'City', 'Area', 'Requst type', 'Driver', 'Request Status', 'Pickup #', 'Extra Fees', 'Pickup', 'Reason', 'Recorded on system'];
const prow = (i, o) => Object.assign({ Date: new Date(2026, 9, 1 + (i % 20)), Client: 'عميل ' + (i % 5), City: 'القاهرة', Area: 'مدينة نصر', 'Requst type': 'Pickup', Driver: 'مندوب ' + (i % 4), 'Request Status': i % 3 ? 'Done' : 'Fail', 'Pickup #': 'P' + i, 'Extra Fees': i % 4 ? 0 : 5, Pickup: 3, Reason: i % 3 ? '' : 'سبب عادي', 'Recorded on system': 'Yes' }, o || {});
const rowsObj = [];
for (let i = 0; i < 12; i++) rowsObj.push(prow(i, i < 6 ? { Client: X + 'C' + i, City: X + 'CITY' + (i % 2), Area: X + 'AR' + (i % 3), Driver: X + 'DR' + (i % 2), Reason: X + 'RS', 'Request Status': i % 2 ? 'Fail' : 'Done' } : {}));
rowsObj.push(prow(30, { Driver: '=HYPERLINK("http://x","c")' }));
rowsObj.push(prow(31, { Driver: 'مندوب عادي - Ali "A"' }));
const pickup = [pickupH, ...rowsObj.map((o) => pickupH.map((h) => o[h]))];
const sheets = {
  'Pickup Request': pickup,
  'Customer Data': [['Customer Name'], ['عميل 1'], ['عميل 2']],
  'Courier Data Info': [['Name', 'Branch'], ['مندوب 0', X + 'BR'], ['مندوب 1', 'القاهرة']],
  'Courier Salary': [['Name', 'vehicle Type', 'Fixd Salary', 'Extra Salary', 'Month'], [X + 'SAL', X + 'VEH', 1000, 50, 10], ['مندوب 1', 'موتوسيكل', 2000, 0, 10]],
};
const ss = { getSheets: () => Object.entries(sheets).map(([n, d]) => ({ getName: () => n, getDataRange: () => ({ getValues: () => d }) })) };
const sb = { console: { log() {}, info() {}, warn() {}, error() {} }, Date, Math, JSON, Object, Number, String, isFinite, Array, parseInt, parseFloat, isNaN, RegExp, Error, Set, Map, Logger: { log() {} },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ s, setMimeType() { return this; } }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ss } };
vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8'), sb);
const apiOut = () => sb.doGet({ parameter: { refresh: '1' } }).s;

(async () => {
  const payload = JSON.parse(apiOut());
  check('Code.gs الحقيقي (vm) أعاد حمولة بيانات سليمة', !payload.error && payload.meta && payload.meta.totalRecords > 0, payload.message);
  // خطأ الخادم لا يعيد stack
  const bad = sb.doGet({ get parameter() { throw new Error('boom'); } });
  const errBody = JSON.parse(bad.s);
  check('Code.gs: رد الخطأ لا يحوي stack', errBody.error === true && !('stack' in errBody), Object.keys(errBody));

  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
  const body = apiOut();
  await pg.route('**/*', (r) => { const u = r.request().url();
    if (u.includes('script.google.com')) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body });
    return u.startsWith('file:') ? r.continue() : r.abort(); });
  await pg.addInitScript(() => { window.__blobs = []; const o = URL.createObjectURL; URL.createObjectURL = (b) => { window.__blobs.push(b); return o.call(URL, b); }; });
  await pg.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(4000);
  check('الواجهة عرضت البيانات (الجذر ظاهر)', await pg.evaluate("!document.getElementById('dashboardRoot').classList.contains('hidden')"));
  // تفاعل: تبديل اللغة، فتح كل الفلاتر والخيارات، تمرير على عناصر، التقرير، تصدير CSV
  for (let k = 0; k < 2; k++) { await pg.evaluate("document.getElementById('langBtn').click()"); await pg.waitForTimeout(700); }
  await pg.evaluate("document.getElementById('exportBtn').click()"); await pg.waitForTimeout(400);
  await pg.evaluate(() => { document.querySelectorAll('input[type=checkbox]').forEach((c) => { try { c.click(); } catch (e) {} }); });
  await pg.waitForTimeout(800);
  await pg.evaluate(() => { document.querySelectorAll('tr, .hb, [data-key], button').forEach((e) => e.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))); });
  await pg.evaluate("document.getElementById('reportBtn').click()"); await pg.waitForTimeout(2500);
  await pg.evaluate("document.getElementById('langBtn').click()"); await pg.waitForTimeout(800);
  await pg.evaluate(() => { document.querySelectorAll('[onfocus],[autofocus]').forEach((e) => e.focus && e.focus()); });
  const n = await pg.evaluate('window.__xss||0');
  check('XSS: لا تنفيذ (جداول، فلاتر، تقرير، لغتان)', n === 0, n);
  check('XSS: لا img[onerror] في DOM', (await pg.evaluate("document.querySelectorAll('img[onerror]').length")) === 0);
  check('لا أخطاء JavaScript', errs.length === 0, errs.slice(0, 2));
  // CSV
  const csv = await pg.evaluate(async () => { const b = window.__blobs.find(() => true); return b ? await b.text() : ''; });
  if (process.env.DBG) console.log('CSV>>', JSON.stringify(csv.split('\n')));
  check('الوظيفة: النص الضار ظاهر كنص في الواجهة (لم يُحذف)', await pg.evaluate("document.body.innerText.includes('<img src=x') || document.body.innerText.includes('img src=x')"));
  check('CSV: تم توليد الملف', csv.length > 0);
  check("CSV: =HYPERLINK سبقها ' وعلامات الاقتباس مهرَّبة", csv.includes("\"'=HYPERLINK(\"\"http://x\"\",\"\"c\"\")\""));
  check('CSV: اسم عادي مع علامة اقتباس لم يكسر الملف', csv.includes('"مندوب عادي - Ali ""A"""'));
  await b.close();
  console.log(`\n${pass}/${pass + fail} اختبارًا ناجحًا`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
