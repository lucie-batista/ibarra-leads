/**
 * Config tab (tunable settings, editable in the Sheet), logging, and usage
 * counters for paid lookups. No UI code.
 */

var SHEETS = { CONFIG: 'Config', LEADS: 'Leads', LOG: 'Log', USAGE: 'Usage' };

// [key, default, note]. Missing keys are appended to the Config tab; existing
// values are never overwritten, so edits made in the Sheet stick.
var CONFIG_DEFAULTS = [
  ['radius_miles', 2, 'Only businesses within this many miles of the shop'],
  ['lookback_days', 180, 'Only businesses that opened at this location within this many days'],
  ['zip_filter', '', 'Optional comma-separated ZIP list; blank = no ZIP filter'],
  ['visit_radius_miles', 2, 'Suggest "Visit" for leads within this distance'],
  ['weight_Restaurant', 40, 'Category points (max 40)'],
  ['weight_Cafe/Bakery/Food maker', 36, ''],
  ['weight_Bar/Brewery', 32, ''],
  ['weight_Retail', 28, ''],
  ['weight_Salon/Beauty/Wellness', 24, ''],
  ['weight_Trades/Home services', 20, ''],
  ['weight_Childcare/Education', 20, ''],
  ['weight_Startup/Tech', 12, ''],
  ['weight_Startup/Tech_home', 4, 'Startup/Tech at a home address'],
  ['weight_Other', 8, ''],
  ['recency_max', 25, 'Points for opening today; falls to 0 at lookback_days'],
  ['distance_max', 20, 'Points at the shop; falls to 0 at radius_miles'],
  ['contact_email', 30, 'Points for having an email (best contact only). Large on purpose: emailable leads usually rank first, but still decay with age'],
  ['contact_phone', 8, ''],
  ['contact_website', 5, ''],
  ['home_penalty', 10, 'Points subtracted for an Apt/Unit address'],
  ['places_enabled', true, 'Use Google Places to find website/phone'],
  ['places_daily_cap', 30, 'Max Places lookups per day'],
  ['places_monthly_cap', 900, 'Hard stop per calendar month (free tier is 1,000)'],
  ['places_catchup_remaining', 300, 'One-time extra lookups for the first catch-up; counts down to 0'],
  ['claude_enabled', true, 'Use Claude web search when Places finds nothing'],
  ['claude_categories', 'Restaurant,Cafe/Bakery/Food maker,Bar/Brewery,Retail,Salon/Beauty/Wellness,Trades/Home services',
    'Only these categories get automatic Claude lookups'],
  ['claude_daily_cap', 5, 'Max automatic Claude lookups per day'],
  ['claude_catchup_remaining', 40, 'One-time extra Claude lookups for the first catch-up'],
  ['claude_monthly_usd_cap', 3, 'Hard stop for Claude spending per calendar month (USD)'],
  ['claude_model', 'claude-haiku-4-5', 'Model for contact lookups']
];

function getConfig() {
  var sheet = ensureConfigSheet_();
  var cfg = {};
  sheet.getDataRange().getValues().slice(1).forEach(function (r) {
    if (r[0] !== '') cfg[String(r[0])] = r[1];
  });
  return cfg;
}

function setConfigValue_(key, value) {
  var sheet = ensureConfigSheet_();
  var keys = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (var i = 1; i < keys.length; i++) {
    if (keys[i][0] === key) { sheet.getRange(i + 1, 2).setValue(value); return; }
  }
  sheet.appendRow([key, value, '']);
}

function ensureConfigSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.CONFIG);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.CONFIG);
    sheet.getRange(1, 1, 1, 3).setValues([['Setting', 'Value', 'Notes']]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 240);
    sheet.setColumnWidth(3, 420);
  }
  var existing = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().forEach(function (r) { existing[r[0]] = true; });
  }
  var missing = CONFIG_DEFAULTS.filter(function (d) { return !existing[d[0]]; });
  if (missing.length) sheet.getRange(sheet.getLastRow() + 1, 1, missing.length, 3).setValues(missing);
  return sheet;
}

function cfgNum_(cfg, key, fallback) {
  var v = Number(cfg[key]);
  return isNaN(v) || cfg[key] === '' ? fallback : v;
}

function cfgBool_(cfg, key) {
  var v = cfg[key];
  return v === true || String(v).toUpperCase() === 'TRUE';
}

/** Append a row to the Log tab (keeps the newest 1,000 rows). */
function logEvent_(step, message, detail) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEETS.LOG);
    if (!sheet) {
      sheet = ss.insertSheet(SHEETS.LOG);
      sheet.getRange(1, 1, 1, 4).setValues([['Time', 'Step', 'Message', 'Detail']]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([new Date(), step, String(message).slice(0, 500), detail ? JSON.stringify(detail).slice(0, 1000) : '']);
    var extra = sheet.getLastRow() - 1001;
    if (extra > 0) sheet.deleteRows(2, extra);
  } catch (e) {
    console.error('logEvent_ failed: ' + e);
  }
  console.log(step + ': ' + message + (detail ? ' ' + JSON.stringify(detail) : ''));
}

/** Usage counters per day: places lookups, claude lookups, claude USD. */
function usageSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.USAGE);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.USAGE);
    sheet.getRange(1, 1, 1, 4).setValues([['Date', 'Places lookups', 'Claude lookups', 'Claude cost (USD)']]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange('A:A').setNumberFormat('@');
  }
  return sheet;
}

function todayKey_() {
  return Utilities.formatDate(new Date(), 'America/Los_Angeles', 'yyyy-MM-dd');
}

/** Sheets turns "2026-10-15" into a Date, so normalize whatever comes back. */
function dateKey_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, 'America/Los_Angeles', 'yyyy-MM-dd');
  return String(v).slice(0, 10);
}

/** Merge rows to one per date (older versions appended a row per lookup). */
function compactUsage_() {
  var sheet = usageSheet_();
  var rows = sheet.getDataRange().getValues().slice(1);
  var byDate = {}, order = [];
  rows.forEach(function (r) {
    var d = dateKey_(r[0]);
    if (!d) return;
    if (!byDate[d]) { byDate[d] = [0, 0, 0]; order.push(d); }
    byDate[d][0] += Number(r[1]) || 0; byDate[d][1] += Number(r[2]) || 0; byDate[d][2] += Number(r[3]) || 0;
  });
  if (order.length === rows.length) return;
  var out = order.map(function (d) {
    return ["'" + d, byDate[d][0], byDate[d][1], Math.round(byDate[d][2] * 10000) / 10000];
  });
  sheet.getRange(2, 1, out.length, 4).setValues(out);
  if (rows.length > out.length) sheet.deleteRows(2 + out.length, rows.length - out.length);
}

function getUsage_() {
  compactUsage_();
  var rows = usageSheet_().getDataRange().getValues().slice(1);
  var today = todayKey_(), month = today.slice(0, 7);
  var u = { placesToday: 0, placesMonth: 0, claudeToday: 0, claudeUsdMonth: 0 };
  rows.forEach(function (r) {
    var d = dateKey_(r[0]);
    if (d === today) { u.placesToday += Number(r[1]) || 0; u.claudeToday += Number(r[2]) || 0; }
    if (d.slice(0, 7) === month) { u.placesMonth += Number(r[1]) || 0; u.claudeUsdMonth += Number(r[3]) || 0; }
  });
  return u;
}

function addUsage_(places, claudeCalls, claudeUsd) {
  var sheet = usageSheet_();
  var today = todayKey_();
  var last = sheet.getLastRow();
  if (last > 1 && dateKey_(sheet.getRange(last, 1).getValue()) === today) {
    var r = sheet.getRange(last, 2, 1, 3).getValues()[0];
    sheet.getRange(last, 2, 1, 3).setValues([[(Number(r[0]) || 0) + places, (Number(r[1]) || 0) + claudeCalls,
      Math.round(((Number(r[2]) || 0) + claudeUsd) * 10000) / 10000]]);
  } else {
    // Leading apostrophe keeps the date as text in Sheets.
    sheet.appendRow(["'" + today, places, claudeCalls, Math.round(claudeUsd * 10000) / 10000]);
  }
}
