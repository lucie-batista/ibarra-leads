/**
 * Liquor-license leads from CA ABC "New Applications" reports.
 *
 * ABC publishes these reports for download (abc.ca.gov → Licensing →
 * Licensing Reports). Someone at the shop downloads the CSVs and drops them
 * into the "ABC reports" Drive folder; this file imports them. The tool never
 * fetches from ABC's site.
 *
 * Keeps San Francisco food/drink retail applications (citywide), de-duplicated
 * by license number, and tags each one by checking the SF business registry:
 *   Opening soon   - no open registration with this name at this address yet
 *   New owner      - license transfer (PER) at an existing business
 *   Adding alcohol - new license (ORI) at an existing business
 */

var ABC_FOLDER_NAME = 'ABC reports';
// Retail license types relevant to print customers.
var ABC_TYPES = {
  '20': ['Retail', 'beer & wine store'], '21': ['Retail', 'liquor store'],
  '40': ['Bar/Brewery', 'beer bar'], '42': ['Bar/Brewery', 'beer & wine bar'], '48': ['Bar/Brewery', 'bar'],
  '61': ['Bar/Brewery', 'beer bar'], '75': ['Bar/Brewery', 'brewpub'],
  '41': ['Restaurant', 'beer & wine (restaurant)'], '47': ['Restaurant', 'full bar (restaurant)'],
  '57': ['Restaurant', 'special on-sale'], '58': ['Restaurant', 'caterer'], '59': ['Restaurant', 'seasonal on-sale'],
  '86': ['Retail', 'instructional tasting']
};
var ABC_ACTIONS = { ORI: 'new license', PER: 'transfer to a new owner', PRM: 'transfer to a new location' };

/** Import any new CSVs from the "ABC reports" folder. Returns counts. */
function importLicenses_() {
  var folders = DriveApp.getFoldersByName(ABC_FOLDER_NAME);
  if (!folders.hasNext()) return { skipped: 'No "' + ABC_FOLDER_NAME + '" folder in Drive yet' };
  var folder = folders.next();
  var props = PropertiesService.getScriptProperties();
  var done = JSON.parse(props.getProperty('ABC_FILES_DONE') || '{}');

  var apps = {}, newFiles = [];
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (done[f.getId()] || !/\.csv$/i.test(f.getName())) continue;
    newFiles.push(f.getId());
    parseAbcCsv_(f.getBlob().getDataAsString()).forEach(function (a) {
      var cur = apps[a.license];
      if (cur) { a.types.forEach(function (t) { if (cur.types.indexOf(t) < 0) cur.types.push(t); }); }
      else apps[a.license] = a;
    });
  }
  if (!newFiles.length) return { files: 0 };

  var rows = readLeadRows_(), existingCount = rows.length, known = {};
  rows.forEach(function (r) { known[r[leadCol_('lead_id')]] = true; });
  var shop = getShopLocation_(), now = new Date(), added = 0, kinds = {};

  Object.keys(apps).forEach(function (lic) {
    var a = apps[lic], id = 'ABC-' + lic;
    if (known[id] || !isSanFrancisco_(a) || !abcCategory_(a.types)) return;
    var kind = abcKind_(a);
    var geo = geocodeSf_(a.address);
    var row = LEAD_COLS.map(function () { return ''; });
    var set = function (k, v) { row[leadCol_(k)] = v; };
    set('lead_id', id); set('name', a.dba || a.owner); set('owner', a.owner);
    set('category', abcCategory_(a.types)); set('category_reason', 'Liquor license type ' + a.types.join(', '));
    set('kind', kind); set('home_based', false); set('address', a.address); set('zip', a.zip);
    set('lat', geo ? geo.lat : ''); set('lon', geo ? geo.lon : '');
    set('distance_mi', geo ? Math.round(haversineMiles_(shop.lat, shop.lon, geo.lat, geo.lon) * 100) / 100 : '');
    // ABC reports carry no application date; the day we first saw it stands in for recency.
    set('opened', Utilities.formatDate(now, 'America/Los_Angeles', 'yyyy-MM-dd'));
    set('mailing_address', a.mailing); set('license', a.types.map(function (t) { return ABC_TYPES[t] ? ABC_TYPES[t][1] : t; }).join(', '));
    set('first_seen', now); set('last_seen', now); set('source', 'abc');
    set('license_note', abcNote_(a));
    set('status', 'New');
    rows.push(row); known[id] = true; added++;
    kinds[kind] = (kinds[kind] || 0) + 1;
  });

  writeLeadRows_(rows, existingCount);
  newFiles.forEach(function (fid) { done[fid] = true; });
  props.setProperty('ABC_FILES_DONE', JSON.stringify(done));
  return { files: newFiles.length, applications: Object.keys(apps).length, added: added, kinds: kinds };
}

/** Parse one ABC "New Applications" CSV into application objects. */
function parseAbcCsv_(text) {
  var data = Utilities.parseCsv(String(text).replace(/^﻿/, ''));
  if (!data.length) return [];
  var h = data[0].map(function (x) { return String(x).trim(); });
  var col = function (name) { return h.indexOf(name); };
  if (col('License Number') < 0) return [];
  return data.slice(1).filter(function (r) { return r[col('License Number')]; }).map(function (r) {
    var get = function (name) { var i = col(name); return i < 0 ? '' : String(r[i] || '').trim(); };
    var dbaMatch = get('Primary Owner and Premises Addr.').match(/DBA:\s*(.+?)\s{2,}/);
    var ownerMatch = get('Primary Owner and Premises Addr.').replace(/DBA:\s*.+?\s{2,}/, '').match(/^\s*(.+?)\s{2,}/);
    var mailing = [get('Mailing Street'), get('Mailing City'), get('Mailing State'), get('Mailing Zip Code')].filter(String).join(', ');
    return {
      license: get('License Number'), types: [get('Type| Dup').split('|')[0].trim()], action: get('Action'),
      escrow: !!get('Escrow'), dba: dbaMatch ? titleCase_(dbaMatch[1]) : '', owner: ownerMatch ? titleCase_(ownerMatch[1]) : '',
      address: titleCase_(get('Prem Street')), city: get('City'), county: get('County'), zip: get('Zip Code'),
      mailing: titleCase_(mailing)
    };
  });
}

function isSanFrancisco_(a) { return a.county === '38' || String(a.city).toUpperCase() === 'SAN FRANCISCO'; }

function abcCategory_(types) {
  var order = ['Restaurant', 'Bar/Brewery', 'Retail'];
  var cats = types.map(function (t) { return ABC_TYPES[t] ? ABC_TYPES[t][0] : null; }).filter(Boolean);
  for (var i = 0; i < order.length; i++) if (cats.indexOf(order[i]) >= 0) return order[i];
  return null;
}

function abcNote_(a) {
  var acts = String(a.action).split('/').map(function (x) { return ABC_ACTIONS[x] || x; }).join(' + ');
  return 'Applied for a liquor license (' + a.types.map(function (t) { return ABC_TYPES[t] ? ABC_TYPES[t][1] : 'type ' + t; }).join(', ') +
    '): ' + acts + (a.escrow ? ', sale in escrow' : '');
}

/** Opening soon / New owner / Adding alcohol, from the registry at this address. */
function abcKind_(a) {
  var regs = registryAt_(a);
  var here = regs.filter(function (x) {
    return !x.location_end_date && samePlace_(x.full_business_address, a.address) && similarName_(x.dba_name, a.dba);
  });
  if (!here.length) return 'Opening soon';
  return /PER/.test(a.action) ? 'New owner' : 'Adding alcohol';
}

function registryAt_(a) {
  var num = (String(a.address).match(/^\d+/) || [''])[0];
  var street = ((String(a.address).slice(num.length).match(/[A-Za-z][A-Za-z0-9']*/) || [''])[0]).replace(/'/g, '%').toUpperCase();
  var word = (String(a.dba).match(/[A-Za-z']{4,}/g) || []).filter(function (w) { return w.toUpperCase() !== 'THE'; })[0] || '';
  var wheres = [];
  if (word) wheres.push("upper(dba_name) like '%" + word.toUpperCase().replace(/'/g, "''") + "%'");
  if (num && street) wheres.push("upper(full_business_address) like '" + num + ' ' + street + "%'");
  var out = [];
  wheres.forEach(function (w) {
    var url = DATASET_URL + '?' + ['$where=' + encodeURIComponent("city='San Francisco' AND " + w),
      '$select=' + encodeURIComponent('dba_name,full_business_address,location_start_date,location_end_date'), '$limit=500'].join('&');
    try { out = out.concat(JSON.parse(fetchWithRetry_(url).getContentText())); } catch (e) { console.warn('registry lookup failed: ' + e); }
  });
  return out;
}

function samePlace_(a, b) {
  var num = function (s) { return (String(s || '').match(/^\d+/) || [''])[0]; };
  var word = function (s) {
    return (String(s || '').toLowerCase().replace(/'/g, '').slice(num(s).length).match(/[a-z][a-z0-9]*/) || [''])[0];
  };
  return !!num(a) && num(a) === num(b) && !!word(a) && word(a) === word(b);
}

function similarName_(a, b) {
  var stop = { the: 1, llc: 1, inc: 1, restaurant: 1, cafe: 1, bar: 1, and: 1, san: 1, francisco: 1, sf: 1 };
  var words = function (s) {
    return (String(s || '').toLowerCase().replace(/'/g, '').match(/[a-z0-9]+/g) || [])
      .filter(function (w) { return w.length > 2 && !stop[w]; });
  };
  var wb = words(b);
  if (!wb.length) return true; // no DBA on the application: any open business at the address counts
  var wa = words(a);
  return wb.some(function (w) { return wa.indexOf(w) >= 0; });
}

function geocodeSf_(address) {
  try {
    var res = Maps.newGeocoder().geocode(address + ', San Francisco, CA');
    if (res.status === 'OK' && res.results.length) {
      var loc = res.results[0].geometry.location;
      return { lat: loc.lat, lon: loc.lng };
    }
  } catch (e) {
    console.warn('geocode failed for ' + address + ': ' + e);
  }
  return null;
}

function titleCase_(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
    .replace(/(^|[\s\-\/&(])([a-z])/g, function (m, p, c) { return p + c.toUpperCase(); })
    .replace(/\b(Llc|Inc|Ca)\b/g, function (m) { return m.toUpperCase(); });
}

/** Run from the editor to import right away instead of waiting for the daily run. */
function importLicensesNow() {
  var r = importLicenses_();
  logEvent_('licenses', 'Liquor-license import', r);
  rescoreAll_();
}
