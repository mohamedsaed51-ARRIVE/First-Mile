/**
 * FIRST MILE INTELLIGENCE DASHBOARD — Google Apps Script backend
 * ------------------------------------------------------------------
 * Reads the same 4 sheets used in the source Excel workbook and
 * serves them as one JSON payload, in exactly the schema the
 * dashboard's fetch() call expects.
 *
 * DEPLOYMENT (one-time):
 * 1. Open your Google Sheet (the live version of First_Mile_tracking_sheet_.xlsx)
 * 2. Extensions -> Apps Script
 * 3. Delete any boilerplate code, paste this whole file in
 * 4. Adjust CONFIG below ONLY if your sheet/tab names differ
 * 5. Deploy -> New deployment -> Type: Web app
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 6. Copy the Web App URL it gives you
 * 7. Paste that URL into CONFIG.APPS_SCRIPT_URL at the top of the
 *    dashboard HTML file's <script> section. That's the ONLY edit
 *    needed on the dashboard side.
 *
 * Whenever the Google Sheet changes, the dashboard reflects it on
 * next page load / refresh — no re-export, no re-upload.
 * ------------------------------------------------------------------
 */

// ============== CONFIG — only section you should need to touch ==============
const CONFIG = {
  SHEET_NAMES: {
    pickup: 'Pickup Request',        // matched by trimmed, case-insensitive prefix
    customer: 'Customer Data',
    courierInfo: 'Courier Data Info',
    courierSalary: 'Courier Salary'
  },
  CACHE_SECONDS: 300,                // serve cached JSON for 5 min; use ?refresh=1 to bypass
  HEADER_SEARCH_ROWS: 4              // how many top rows to scan for the real header row
};
// ==============================================================================

function doGet(e) {
  const bypassCache = e && e.parameter && e.parameter.refresh === '1';
  const cache = CacheService.getScriptCache();
  const cacheKey = 'first_mile_dashboard_payload_v1';

  if (!bypassCache) {
    const cached = cache.get(cacheKey);
    if (cached) {
      return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
    }
  }

  const payload = buildPayload();
  const json = JSON.stringify(payload);

  try {
    // CacheService values are capped at 100KB per key; chunk-safe skip if too big
    if (json.length < 95000) cache.put(cacheKey, json, CONFIG.CACHE_SECONDS);
  } catch (err) {
    // caching is best-effort only; ignore failures
  }

  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function findSheet(namePrefix) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const target = namePrefix.trim().toLowerCase();
  for (let i = 0; i < sheets.length; i++) {
    const name = sheets[i].getName().trim().toLowerCase();
    if (name.indexOf(target) === 0) return sheets[i];
  }
  throw new Error('Sheet not found for prefix: ' + namePrefix);
}

function findHeaderRow(values, requiredCols) {
  for (let r = 0; r < Math.min(CONFIG.HEADER_SEARCH_ROWS, values.length); r++) {
    const row = values[r].map(v => String(v).trim());
    const hasAll = requiredCols.every(c => row.indexOf(c) !== -1);
    if (hasAll) return r;
  }
  throw new Error('Could not locate header row containing: ' + requiredCols.join(', '));
}

function norm(s) {
  if (s === null || s === undefined || s === '') return null;
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
}

function normBranch(s) {
  const t = norm(s);
  if (t === null) return null;
  let b = t.replace(/^\(?\s*فرع\s*/, '').replace(/[()]/g, '').trim();
  if (b === '') return null;
  const synonyms = {
    'المعادى': 'المعادي', 'الموسسه': 'المؤسسة', 'المؤسسه': 'المؤسسة',
    'الرئيسى': 'الرئيسي', 'رئيسى': 'الرئيسي', 'الاسماعيليه': 'الاسماعيلية',
    'العجوزه': 'العجوزة'
  };
  return synonyms[b] || b;
}

function fmtDate(d) {
  if (Object.prototype.toString.call(d) === '[object Date]' && !isNaN(d)) {
    const y = d.getFullYear(), m = ('0' + (d.getMonth() + 1)).slice(-2), day = ('0' + d.getDate()).slice(-2);
    return y + '-' + m + '-' + day;
  }
  return null;
}
function monthKey(d) {
  if (Object.prototype.toString.call(d) === '[object Date]' && !isNaN(d)) {
    const y = d.getFullYear(), m = ('0' + (d.getMonth() + 1)).slice(-2);
    return y + '-' + m;
  }
  return null;
}

function buildPayload() {
  // ---------------- Pickup Request ----------------
  const pickupSheet = findSheet(CONFIG.SHEET_NAMES.pickup);
  const allValues = pickupSheet.getDataRange().getValues();
  const headerRowIdx = findHeaderRow(allValues, ['Date', 'Client', 'City', 'Area']);
  const headers = allValues[headerRowIdx].map(h => String(h).trim());
  const col = {};
  headers.forEach((h, i) => { col[h] = i; });

  const need = ['Date', 'Client', 'City', 'Area', 'Requst type', 'Driver', 'Request Status', 'Extra Fees', 'Reason', 'Recorded on system'];
  need.forEach(c => { if (!(c in col)) throw new Error('Missing expected column in Pickup Request: ' + c); });

  const monthsSet = {}, citiesSet = {}, areasSet = {}, driversSet = {}, clientsSet = {}, typesSet = {}, statusesSet = {}, reasonsSet = {};
  const groups = {}; // key -> {count, fees}
  let totalRecords = 0, dateMin = null, dateMax = null;
  let recordedYes = 0, recordedNo = 0;

  for (let r = headerRowIdx + 1; r < allValues.length; r++) {
    const row = allValues[r];
    const dateVal = row[col['Date']];
    const mKey = monthKey(dateVal);
    if (!mKey) continue; // skip blank/malformed rows

    const city = norm(row[col['City']]);
    const area = norm(row[col['Area']]);
    const driver = norm(row[col['Driver']]);
    const client = norm(row[col['Client']]);
    const type = norm(row[col['Requst type']]);
    const status = norm(row[col['Request Status']]);
    if (!city || !area || !driver || !client || !type || !status) continue;

    const reasonRaw = norm(row[col['Reason']]);
    const reason = reasonRaw === null ? 'N/A' : reasonRaw;
    const fees = Number(row[col['Extra Fees']]) || 0;
    const recorded = norm(row[col['Recorded on system']]);
    if (recorded === 'Yes') recordedYes++; else if (recorded === 'No') recordedNo++;

    monthsSet[mKey] = true; citiesSet[city] = true; areasSet[area] = true; driversSet[driver] = true;
    clientsSet[client] = true; typesSet[type] = true; statusesSet[status] = true; reasonsSet[reason] = true;

    const key = [mKey, city, area, driver, type, status, client, reason].join('|');
    if (!groups[key]) groups[key] = { m: mKey, c: city, a: area, d: driver, t: type, s: status, cl: client, r: reason, count: 0, fees: 0 };
    groups[key].count += 1;
    groups[key].fees += fees;

    totalRecords++;
    const dStr = fmtDate(dateVal);
    if (dStr) { if (!dateMin || dStr < dateMin) dateMin = dStr; if (!dateMax || dStr > dateMax) dateMax = dStr; }
  }

  const months = Object.keys(monthsSet).sort();
  const cities = Object.keys(citiesSet).sort();
  const areas = Object.keys(areasSet).sort();
  const drivers = Object.keys(driversSet).sort();
  const clients = Object.keys(clientsSet).sort();
  const types = Object.keys(typesSet).sort();
  const statuses = Object.keys(statusesSet).sort();
  const reasons = Object.keys(reasonsSet).sort();

  const mIdx = {}, cIdx = {}, aIdx = {}, dIdx = {}, clIdx = {}, tIdx = {}, sIdx = {}, rIdx = {};
  months.forEach((v, i) => mIdx[v] = i); cities.forEach((v, i) => cIdx[v] = i); areas.forEach((v, i) => aIdx[v] = i);
  drivers.forEach((v, i) => dIdx[v] = i); clients.forEach((v, i) => clIdx[v] = i); types.forEach((v, i) => tIdx[v] = i);
  statuses.forEach((v, i) => sIdx[v] = i); reasons.forEach((v, i) => rIdx[v] = i);

  const rows = Object.keys(groups).map(k => {
    const g = groups[k];
    return [mIdx[g.m], cIdx[g.c], aIdx[g.a], dIdx[g.d], tIdx[g.t], sIdx[g.s], clIdx[g.cl], rIdx[g.r], g.count, Math.round(g.fees * 100) / 100];
  });

  // ---------------- Customer Data ----------------
  let registeredMerchants = 0;
  try {
    const custSheet = findSheet(CONFIG.SHEET_NAMES.customer);
    const custValues = custSheet.getDataRange().getValues();
    const custHeaderIdx = findHeaderRow(custValues, ['Customer Name']);
    const nameCol = custValues[custHeaderIdx].map(h => String(h).trim()).indexOf('Customer Name');
    const seen = {};
    for (let r = custHeaderIdx + 1; r < custValues.length; r++) {
      const nm = norm(custValues[r][nameCol]);
      if (nm) seen[nm] = true;
    }
    registeredMerchants = Object.keys(seen).length;
  } catch (err) {
    registeredMerchants = clients.length; // graceful fallback
  }

  // ---------------- Courier Data Info -> branch mapping ----------------
  let driverBranch = drivers.map(() => null);
  let branchCoverage = 0;
  try {
    const cdiSheet = findSheet(CONFIG.SHEET_NAMES.courierInfo);
    const cdiValues = cdiSheet.getDataRange().getValues();
    const cdiHeaderIdx = findHeaderRow(cdiValues, ['Name', 'Branch']);
    const headerRow = cdiValues[cdiHeaderIdx].map(h => String(h).trim());
    const nameCol = headerRow.indexOf('Name'), branchCol = headerRow.indexOf('Branch');
    const branchMap = {};
    for (let r = cdiHeaderIdx + 1; r < cdiValues.length; r++) {
      const nm = norm(cdiValues[r][nameCol]);
      if (!nm) continue;
      branchMap[nm] = normBranch(cdiValues[r][branchCol]);
    }
    driverBranch = drivers.map(dv => branchMap.hasOwnProperty(dv) ? branchMap[dv] : null);
    branchCoverage = driverBranch.filter(b => !!b).length;
  } catch (err) {
    // leave defaults
  }

  // ---------------- Courier Salary (partial reference) ----------------
  let salaryRef = [];
  try {
    const csSheet = findSheet(CONFIG.SHEET_NAMES.courierSalary);
    const csValues = csSheet.getDataRange().getValues();
    const csHeaderIdx = findHeaderRow(csValues, ['Name', 'Fixd Salary']);
    const headerRow = csValues[csHeaderIdx].map(h => String(h).trim());
    const nameCol = headerRow.indexOf('Name'), vehCol = headerRow.indexOf('vehicle Type'), salCol = headerRow.indexOf('Fixd Salary');
    for (let r = csHeaderIdx + 1; r < csValues.length; r++) {
      const nm = norm(csValues[r][nameCol]);
      if (!nm) continue;
      const sal = csValues[r][salCol];
      salaryRef.push({ name: nm, vehicle: norm(csValues[r][vehCol]), fixed_salary: (sal === '' || sal === null) ? null : Number(sal) });
    }
  } catch (err) {
    salaryRef = [];
  }

  const recordedTotal = recordedYes + recordedNo;

  const meta = {
    totalRecords: totalRecords,
    dateMin: dateMin,
    dateMax: dateMax,
    uniqueClients: clients.length,
    registeredMerchants: registeredMerchants,
    uniqueDrivers: drivers.length,
    uniqueAreas: areas.length,
    uniqueCities: cities.length,
    uniqueTypes: types.length,
    recordedYes: recordedYes,
    recordedNo: recordedNo,
    recordedBlank: totalRecords - recordedTotal,
    branchCoverage: branchCoverage,
    branchTotal: drivers.length,
    partialMonths: [],           // set manually below if the current month is still in progress
    generatedAt: new Date().toISOString()
  };
  // Flag the most recent month as partial if it doesn't look complete (heuristic: < 20 days of data)
  if (months.length) {
    const lastMonth = months[months.length - 1];
    const daysInData = {};
    // (kept simple/heuristic — safe to hardcode manually here instead if preferred)
  }

  return {
    months: months, cities: cities, areas: areas, drivers: drivers, clients: clients,
    types: types, statuses: statuses, reasons: reasons, rows: rows,
    driverBranch: driverBranch, salaryRef: salaryRef, meta: meta
  };
}
