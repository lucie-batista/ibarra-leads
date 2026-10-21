/**
 * Leads tab: schema, ingest from data.sf.gov, and upsert. The refresh pulls
 * the whole window (radius + lookback) every run, so it is idempotent and
 * picks up late-arriving registrations and newly closed businesses.
 *
 * System columns are rewritten by the pipeline; user columns (status, notes,
 * manual email, dates) are never overwritten by a refresh.
 */

// [header, owner] - owner 'sys' = pipeline writes it, 'user' = José/UI writes it.
var LEAD_COLS = [
  ['lead_id', 'sys'], ['name', 'sys'], ['owner', 'sys'], ['category', 'sys'], ['category_reason', 'sys'],
  ['kind', 'sys'], ['home_based', 'sys'], ['address', 'sys'], ['zip', 'sys'], ['neighborhood', 'sys'],
  ['lat', 'sys'], ['lon', 'sys'], ['distance_mi', 'sys'], ['opened', 'sys'], ['business_started', 'sys'],
  ['mailing_address', 'sys'], ['naics', 'sys'], ['license', 'sys'], ['closed', 'sys'],
  ['first_seen', 'sys'], ['last_seen', 'sys'],
  ['score', 'sys'], ['score_explain', 'sys'],
  ['contact_status', 'sys'], ['contact_checked', 'sys'], ['places_name', 'sys'], ['places_status', 'sys'],
  ['website', 'sys'], ['phone', 'sys'], ['email', 'sys'], ['email_source', 'sys'], ['maps_url', 'sys'],
  ['website_status', 'sys'], ['source', 'sys'], ['license_note', 'sys'],
  ['status', 'user'], ['status_date', 'user'], ['manual_email', 'user'], ['notes', 'user'],
  ['contacted_via', 'user'], ['draft_subject', 'user'], ['draft_body', 'user']
];
// System columns come first and are contiguous, so the pipeline can write
// [1..SYS_COUNT] without ever touching José's columns (and vice versa).
var SYS_COUNT = LEAD_COLS.filter(function (c) { return c[1] === 'sys'; }).length;

function leadCol_(name) {
  for (var i = 0; i < LEAD_COLS.length; i++) if (LEAD_COLS[i][0] === name) return i;
  throw new Error('Unknown lead column ' + name);
}

function leadsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.LEADS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.LEADS, 0);
    sheet.getRange(1, 1, 1, LEAD_COLS.length).setValues([LEAD_COLS.map(function (c) { return c[0]; })])
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(2);
    // Keep codes/IDs/ZIPs as text so Sheets doesn't turn them into numbers or dates.
    ['lead_id', 'zip', 'naics', 'opened', 'business_started', 'phone'].forEach(function (c) {
      sheet.getRange(1, leadCol_(c) + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
    });
  }
  migrateLeadColumns_(sheet);
  return sheet;
}

/**
 * Bring an existing Leads tab up to the current schema: insert any column
 * added in a later version at its proper position, so system columns stay
 * contiguous and existing data (including José's columns) shifts with it.
 */
function migrateLeadColumns_(sheet) {
  var width = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, width).getValues()[0];
  var changed = false;
  for (var i = 0; i < LEAD_COLS.length; i++) {
    var name = LEAD_COLS[i][0];
    if (header[i] === name) continue;
    if (header.indexOf(name) >= 0) throw new Error('Leads tab columns are out of order at "' + name + '". Restore the header row.');
    if (i < header.length && header[i] !== '') sheet.insertColumnBefore(i + 1);
    sheet.getRange(1, i + 1).setValue(name).setFontWeight('bold');
    header.splice(i, header[i] === '' ? 1 : 0, name);
    changed = true;
  }
  if (changed) logEvent_('schema', 'Leads tab columns updated');
}

/** Read all leads as row arrays (no header). */
function readLeadRows_() {
  var sheet = leadsSheet_();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, LEAD_COLS.length).getValues();
}

/**
 * Write pipeline results. Existing rows: system columns only, so edits José
 * makes while a run is in progress are never overwritten. New rows (index >=
 * existingCount): the full row, including the default status.
 */
function writeLeadRows_(rows, existingCount) {
  var sheet = leadsSheet_();
  if (!rows.length) return;
  sheet.getRange(2, 1, rows.length, SYS_COUNT).setValues(rows.map(function (r) { return r.slice(0, SYS_COUNT); }));
  if (existingCount !== undefined && rows.length > existingCount) {
    var fresh = rows.slice(existingCount);
    sheet.getRange(2 + existingCount, SYS_COUNT + 1, fresh.length, LEAD_COLS.length - SYS_COUNT)
      .setValues(fresh.map(function (r) { return r.slice(SYS_COUNT); }));
  }
}

/** Write one row's system columns (used per lead during contact lookups). */
function writeSysRow_(sheet, index, row) {
  sheet.getRange(index + 2, 1, 1, SYS_COUNT).setValues([row.slice(0, SYS_COUNT)]);
}

/** Fetch every registration in the window from data.sf.gov (one or a few requests). */
function fetchWindow_(cfg, shop) {
  var radiusM = Math.round(cfgNum_(cfg, 'radius_miles', 2) * 1609.34);
  var since = new Date(Date.now() - cfgNum_(cfg, 'lookback_days', 180) * 86400000);
  var sinceStr = Utilities.formatDate(since, 'America/Los_Angeles', "yyyy-MM-dd'T'00:00:00");
  var where = "location_start_date > '" + sinceStr + "' AND within_circle(location, " +
    shop.lat + ', ' + shop.lon + ', ' + radiusM + ')';
  var zips = String(cfg.zip_filter || '').split(',').map(function (z) { return z.trim(); }).filter(String);
  if (zips.length) where += " AND business_zip in('" + zips.join("','") + "')";

  var all = [], pageSize = 5000;
  for (var offset = 0; offset < 50000; offset += pageSize) {
    var url = DATASET_URL + '?' + ['$where=' + encodeURIComponent(where), '$limit=' + pageSize,
      '$offset=' + offset, '$order=' + encodeURIComponent('uniqueid')].join('&');
    var resp = fetchWithRetry_(url);
    var page = JSON.parse(resp.getContentText());
    all = all.concat(page);
    if (page.length < pageSize) break;
  }
  return all;
}

function fetchWithRetry_(url) {
  var last;
  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (resp.getResponseCode() === 200) return resp;
      last = new Error('data.sf.gov HTTP ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 200));
    } catch (e) {
      last = e;
    }
    Utilities.sleep(3000 * (attempt + 1));
  }
  throw last;
}

function normKey_(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Pull the window and upsert into the Leads tab. Returns counts.
 * Dedupe: same ttxid, or same normalized name + address.
 */
function refreshLeads_() {
  var cfg = getConfig();
  var shop = getShopLocation_();
  var records = fetchWindow_(cfg, shop);
  var now = new Date();

  var rows = readLeadRows_();
  var existingCount = rows.length;
  var byId = {}, byNameAddr = {};
  rows.forEach(function (row, i) {
    byId[row[leadCol_('lead_id')]] = i;
    // Liquor-license leads (source "abc") are separate leads; registry records never merge into them.
    if (row[leadCol_('source')] !== 'abc') {
      byNameAddr[normKey_(row[leadCol_('name')]) + '|' + normKey_(row[leadCol_('address')])] = i;
    }
  });

  // Collapse duplicate registrations (same name + address) to one record,
  // preferring an open one, then the most recent, so re-runs are stable.
  var chosen = {};
  records.forEach(function (r) {
    var k = normKey_(r.dba_name || r.ownership_name) + '|' + normKey_(r.full_business_address);
    var cur = chosen[k];
    var better = !cur || (cur.location_end_date && !r.location_end_date) ||
      (!!cur.location_end_date === !!r.location_end_date &&
        String(r.location_start_date || '') > String(cur.location_start_date || ''));
    if (better) chosen[k] = r;
  });
  var dupes = records.length - Object.keys(chosen).length;
  records = Object.keys(chosen).map(function (k) { return chosen[k]; });

  var added = 0, updated = 0, closed = 0;
  records.forEach(function (r) {
    var id = r.ttxid || r.uniqueid;
    if (!id) return;
    var name = r.dba_name || r.ownership_name || '(no name)';
    var nameAddr = normKey_(name) + '|' + normKey_(r.full_business_address);
    var idx = byId[id];
    if (idx === undefined && byNameAddr[nameAddr] !== undefined) {
      // Same business re-registered under another account: keep the existing row.
      idx = byNameAddr[nameAddr];
    }

    var c = classify(r);
    var coords = r.location && r.location.coordinates;
    var lat = coords ? coords[1] : '', lon = coords ? coords[0] : '';
    var miles = coords ? Math.round(haversineMiles_(shop.lat, shop.lon, lat, lon) * 100) / 100 : '';
    var mailing = [r.mailing_address_1, r.mail_city, r.mail_state, r.mail_zipcode].filter(Boolean).join(', ');
    var sys = {
      lead_id: id, name: name, owner: r.ownership_name || '', category: c.category, category_reason: c.reason,
      kind: c.kind === 'Brand new' ? 'New business or new owner' : 'Moved/new location',
      home_based: c.homeBased, address: r.full_business_address || '', zip: r.business_zip || '',
      neighborhood: r.neighborhoods_analysis_boundaries || '', lat: lat, lon: lon, distance_mi: miles,
      opened: String(r.location_start_date || '').slice(0, 10),
      business_started: String(r.dba_start_date || '').slice(0, 10),
      mailing_address: mailing, naics: r.self_reported_naics_code || '', license: r.lic_code_description || '',
      closed: r.location_end_date ? String(r.location_end_date).slice(0, 10) : '', last_seen: now,
      source: 'registry'
    };

    if (idx === undefined) {
      var row = LEAD_COLS.map(function () { return ''; });
      Object.keys(sys).forEach(function (k) { row[leadCol_(k)] = sys[k]; });
      row[leadCol_('first_seen')] = now;
      row[leadCol_('status')] = 'New';
      rows.push(row);
      byId[id] = rows.length - 1;
      byNameAddr[nameAddr] = rows.length - 1;
      added++;
    } else {
      var existing = rows[idx];
      if (sys.closed && !existing[leadCol_('closed')]) closed++;
      // Only system fields from the dataset are refreshed; contact info and user fields stay.
      Object.keys(sys).forEach(function (k) {
        if (k === 'lead_id') return;
        existing[leadCol_(k)] = sys[k];
      });
      updated++;
    }
  });

  writeLeadRows_(rows, existingCount);
  return { fetched: records.length + dupes, added: added, updated: updated, newlyClosed: closed, duplicatesMerged: dupes, total: rows.length };
}

/** Recompute scores for every lead (recency changes daily). */
function rescoreAll_() {
  var cfg = getConfig();
  var rows = readLeadRows_();
  var today = new Date();
  rows.forEach(function (row) {
    var s = scoreLead(rowToLead_(row), cfg, today);
    row[leadCol_('score')] = row[leadCol_('category')] === 'Skip' || row[leadCol_('closed')] ? 0 : s.score;
    row[leadCol_('score_explain')] = s.explain;
  });
  writeLeadRows_(rows);
  // Highest score first, so the Sheet itself reads as a ranked list.
  var sheet = leadsSheet_();
  if (rows.length > 1) {
    // Sorting moves rows; the document lock keeps a UI save from landing on the wrong row.
    withRowLock_(function () {
      sheet.getRange(2, 1, rows.length, LEAD_COLS.length).sort({ column: leadCol_('score') + 1, ascending: false });
    });
  }
}

function rowToLead_(row) {
  var o = {};
  LEAD_COLS.forEach(function (c, i) { o[c[0]] = row[i]; });
  return {
    id: o.lead_id, name: o.name, owner: o.owner, category: o.category, homeBased: o.home_based === true,
    address: o.address, opened: o.opened, distanceMi: o.distance_mi, email: o.email,
    manualEmail: o.manual_email, phone: o.phone, website: o.website, closed: o.closed, status: o.status,
    contactStatus: o.contact_status, score: o.score, source: o.source, kind: o.kind
  };
}

/** Find a lead's sheet row number (1-based, including header) by id, or -1. */
function findLeadRow_(leadId) {
  var sheet = leadsSheet_();
  if (sheet.getLastRow() < 2) return -1;
  var range = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1);
  if (range.createTextFinder) {
    var hit = range.createTextFinder(String(leadId)).matchEntireCell(true).findNext();
    return hit ? hit.getRow() : -1;
  }
  var ids = range.getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(leadId)) return i + 2;
  return -1;
}

/** Short lock shared by the pipeline's sort and UI saves (separate from the pipeline's script lock). */
function withRowLock_(fn) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
