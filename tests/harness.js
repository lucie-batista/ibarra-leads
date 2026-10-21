// Minimal in-memory stand-ins for the Apps Script services the backend uses,
// so the pipeline can run under Node against live data.sf.gov.
// Usage: node tests/harness.js  (paid APIs are stubbed; no keys needed)
const fs = require('fs'), vm = require('vm'), path = require('path'), { execFileSync } = require('child_process');

// Real Sheets converts "2026-10-15" to a Date and strips a leading apostrophe.
function sheetsValue(x) {
  if (typeof x !== 'string') return x;
  if (x.startsWith("'")) return x.slice(1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(x)) return new Date(x + 'T00:00:00-07:00');
  return x;
}

function makeSheet(name) {
  let data = [];
  const sheet = {
    name, data,
    getLastRow: () => data.length,
    getLastColumn: () => Math.max(0, ...data.map(r => r.length)),
    getMaxRows: () => 5000,
    getDataRange: () => sheet.getRange(1, 1, Math.max(1, data.length), Math.max(1, ...data.map(r => r.length))),
    appendRow: row => { data.push(row.map(sheetsValue)); },
    deleteRows: (start, n) => { data.splice(start - 1, n); },
    insertColumnBefore: c => { data.forEach(r => r.splice(c - 1, 0, '')); },
    setFrozenRows() {}, setFrozenColumns() {}, setColumnWidth() {}, clear: () => { data.length = 0; },
    getRange(a, b, c, d) {
      if (typeof a === 'string') return { setNumberFormat() { return this; } };
      const r = a, col = b, nr = c || 1, nc = d || 1;
      const range = {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => {
          const row = data[r - 1 + i] || []; const v = row[col - 1 + j]; return v === undefined ? '' : v; })),
        getValue: () => range.getValues()[0][0],
        setValues: vals => { vals.forEach((v, i) => { const row = data[r - 1 + i] || (data[r - 1 + i] = []);
          v.forEach((x, j) => { row[col - 1 + j] = sheetsValue(x); }); }); return range; },
        clearContent: () => { for (let i = 0; i < nr; i++) { const row = data[r - 1 + i]; if (row) for (let j = 0; j < nc; j++) row[col - 1 + j] = ''; } return range; },
        setValue: v => range.setValues([[v]]),
        setFontWeight: () => range, setNumberFormat: () => range,
        sort: ({ column, ascending }) => { const block = data.slice(r - 1, r - 1 + nr);
          block.sort((x, y) => (ascending ? 1 : -1) * ((Number(x[column - 1]) || 0) - (Number(y[column - 1]) || 0)));
          data.splice(r - 1, nr, ...block); }
      };
      return range;
    }
  };
  return sheet;
}

const sheets = {};
const ss = {
  getSheetByName: n => sheets[n] || null,
  insertSheet: (n) => (sheets[n] = makeSheet(n)),
};
const props = {};
const ctx = {
  console,
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, setProperties: o => Object.assign(props, o), deleteProperty: k => { delete props[k]; } }) },
  UrlFetchApp: {
    fetch(url, opts = {}) {
      if (/places\.googleapis|anthropic\.com/.test(url)) throw new Error('paid API should not be called in harness');
      const out = execFileSync('curl', ['-sS', '-L', '--max-time', '60', '-w', '\n%{http_code}', url], { maxBuffer: 64 << 20 }).toString();
      const i = out.lastIndexOf('\n'); const body = out.slice(0, i), code = Number(out.slice(i + 1));
      return { getResponseCode: () => code, getContentText: () => body };
    }
  },
  Utilities: {
    formatDate: (d, tz, fmt) => { const s = new Date(d.getTime() - 7 * 3600e3).toISOString(); // PDT
      return fmt.startsWith("yyyy-MM-dd'T'") ? s.slice(0, 10) + 'T00:00:00' : s.slice(0, 10); },
    sleep() {},
    parseCsv: text => { // RFC 4180-ish parser, enough for ABC reports
      const rows = []; let row = [], cur = '', q = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
        else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; }
        else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else if (c !== '\r') cur += c;
      }
      if (cur || row.length) { row.push(cur); rows.push(row); }
      return rows;
    },
    getUuid: () => require('crypto').randomUUID(),
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, str) => Array.from(require('crypto').createHash('sha256').update(str, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
  },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }), getDocumentLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: (() => { const m = {}; return { getScriptCache: () => ({ get: k => (k in m ? m[k] : null), put: (k, v) => { m[k] = String(v); }, remove: k => { delete m[k]; } }) }; })(),
  ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => ({ timeBased: () => ({ after: () => ({ create() {} }), everyDays: () => ({ atHour: () => ({ inTimezone: () => ({ create() {} }) }) }) }) }) },
  // Drive folder "ABC reports" backed by data/CA-ABC-*.csv (tests only).
  DriveApp: { getFoldersByName: name => {
    const dir = process.env.IBARRA_DATA || path.join(__dirname, '../data');
    const files = name === 'ABC reports' && fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^CA-ABC.*\.csv$/i.test(f)) : [];
    let given = false;
    return { hasNext: () => files.length > 0 && !given, next: () => { given = true; let i = 0;
      return { getFiles: () => ({ hasNext: () => i < files.length, next: () => { const f = files[i++];
        return { getId: () => f, getName: () => f, getBlob: () => ({ getDataAsString: () => fs.readFileSync(path.join(dir, f), 'utf8') }) }; } }) }; } };
  } },
  Maps: { newGeocoder: () => ({ geocode: () => ({ status: 'OK', results: [{ geometry: { location: { lat: 37.7565, lng: -122.4213 } } }] }) }) },
};
vm.createContext(ctx);
for (const f of fs.readdirSync(path.join(__dirname, '../src')).filter(f => f.endsWith('.js'))) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', f), 'utf8'), ctx, { filename: f });
}
module.exports = { ctx, sheets, props };

if (require.main === module) {
  vm.runInContext('setup()', ctx);
  const leads = sheets.Leads.data;
  console.log('rows (incl header):', leads.length);
  const h = leads[0]; const c = n => h.indexOf(n);
  const cats = {}; leads.slice(1).forEach(r => cats[r[c('category')]] = (cats[r[c('category')]] || 0) + 1);
  console.log('categories:', cats);
  console.log('top 8:'); leads.slice(1, 9).forEach(r => console.log(' ', r[c('score')], r[c('category')], r[c('name')], r[c('distance_mi')] + 'mi', r[c('opened')], r[c('kind')]));
  console.log('log:'); sheets.Log.data.slice(1).forEach(r => console.log(' ', r[1], r[2], r[3]));
  // Idempotency: a second run must not add rows.
  vm.runInContext('dailyRun()', ctx);
  console.log('rows after second run:', sheets.Leads.data.length);
  console.log('status column untouched:', new Set(sheets.Leads.data.slice(1).map(r => r[c('status')])));
}
