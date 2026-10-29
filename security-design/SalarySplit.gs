// ============================================================
// SalarySplit.gs — فصل بيانات الرواتب عن الرد التشغيلي (نموذج أولي — غير موصول بـ Code.gs ولا منشور)
// ------------------------------------------------------------
// salarySplitPayload_(payload, role, opts):
//   role 'finance'|'admin'  → الرد كما هو + salaryAccess:'granted'
//   أي دور آخر            → لا salaryRef ولا أي مبلغ فردي؛ بدلها costFeed مجمّع حسب (فرع، شهر)
//                            مع إخفاء أي مجموعة أقل من minGroup مندوبين، وقائمة coverage (وجود مرتب فقط).
// ============================================================
var SALARY_MIN_GROUP = 5;

function salaryNormName_(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase(); }

function salarySplitPayload_(payload, role, opts) {
  var minGroup = (opts && opts.minGroup) || SALARY_MIN_GROUP;
  var out = {};
  for (var k in payload) if (Object.prototype.hasOwnProperty.call(payload, k)) out[k] = payload[k];
  if (role === 'finance' || role === 'admin') { out.salaryAccess = 'granted'; return out; }
  var ref = payload.salaryRef || [], drivers = payload.drivers || [], branchOf = payload.driverBranch || [];
  var idx = {}; drivers.forEach(function (d, i) { idx[salaryNormName_(d)] = i; });
  var cells = {}, coverage = [], seen = {};
  ref.forEach(function (s) {
    if (!s || !s.name || s.fixed_salary == null) return;
    var key = salaryNormName_(s.name), di = idx[key], month = s.month || 0;
    coverage.push({ name: s.name, month: month });          // وجود صف مرتب فقط — بلا مبلغ
    if (di === undefined || !branchOf[di]) return;           // مندوب بلا فرع معروف: لا يدخل أي تجميع
    var ck = branchOf[di] + '|' + month;
    var c = cells[ck] || (cells[ck] = { branch: branchOf[di], month: month, cost: 0, names: {} });
    c.cost += Number(s.fixed_salary) + Number(s.extra_salary || 0); c.names[key] = 1;
  });
  var feed = Object.keys(cells).map(function (ck) {
    var c = cells[ck], n = Object.keys(c.names).length;
    return n >= minGroup ? { branch: c.branch, month: c.month, couriers: n, cost: c.cost } : { branch: c.branch, month: c.month, couriers: n, suppressed: true };
  });
  delete out.salaryRef;
  out.salaryAccess = 'denied';
  out.costFeed = { minGroup: minGroup, byBranchMonth: feed, coverage: coverage };
  return out;
}
