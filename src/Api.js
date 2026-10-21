/**
 * Backend API for the web app (no UI code). Every function returns plain
 * JSON-serializable data and checks the session first, so these could later
 * be exposed as a JSON API for a static frontend.
 */

var DATASET_URL = 'https://data.sf.gov/resource/g8m3-pdis.json';
var SHOP_ADDRESS = '1009 Valencia St, San Francisco, CA 94110';
// Fallback if geocoding fails (approximate location of 1009 Valencia St).
var SHOP_FALLBACK = { lat: 37.7565, lon: -122.4213 };

var STATUSES = ['New', 'Contacted', 'Replied', 'Quoted', 'Customer', 'No thanks'];
var CONTACT_METHODS = ['Email', 'Call', 'Visit', 'Mail'];
// User-editable fields and the Leads column each one maps to.
var EDITABLE = { status: 'status', notes: 'notes', manualEmail: 'manual_email', contactedVia: 'contacted_via',
  draftSubject: 'draft_subject', draftBody: 'draft_body' };

/** Everything the UI needs in one call: leads (excluding Skip), templates, settings. */
function api_getData(token) {
  requireSession_(token);
  var cfg = getConfig();
  var leads = readLeadRows_().filter(function (row) {
    return row[leadCol_('category')] !== 'Skip';
  }).map(leadForUi_);
  return {
    leads: leads,
    templates: getTemplates_(),
    settings: {
      visitRadiusMiles: cfgNum_(cfg, 'visit_radius_miles', 2),
      radiusMiles: cfgNum_(cfg, 'radius_miles', 2),
      lookbackDays: cfgNum_(cfg, 'lookback_days', 180)
    },
    statuses: STATUSES,
    contactMethods: CONTACT_METHODS,
    lastRefresh: lastRefresh_(),
    generatedAt: new Date().toISOString()
  };
}

/**
 * Save José's changes to one lead. `changes` may contain status, notes,
 * manualEmail, contactedVia, draftSubject, draftBody. Returns the updated lead.
 */
function api_updateLead(token, leadId, changes) {
  requireSession_(token);
  changes = changes || {};
  if (changes.status !== undefined && STATUSES.indexOf(changes.status) < 0) throw new Error('Unknown status');
  if (changes.contactedVia && CONTACT_METHODS.indexOf(changes.contactedVia) < 0) throw new Error('Unknown contact method');
  if (changes.manualEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(changes.manualEmail).trim())) {
    throw new Error('That email address doesn\'t look right.');
  }
  var sheet = leadsSheet_();
  return withRowLock_(function () {
    var rowNum = findLeadRow_(leadId);
    if (rowNum < 0) throw new Error('Lead not found (it may have been removed).');
    var row = sheet.getRange(rowNum, 1, 1, LEAD_COLS.length).getValues()[0];
    Object.keys(EDITABLE).forEach(function (k) {
      if (changes[k] === undefined) return;
      var v = String(changes[k]).slice(0, 5000);
      row[leadCol_(EDITABLE[k])] = k === 'manualEmail' ? v.trim() : v;
    });
    if (changes.status !== undefined) row[leadCol_('status_date')] = new Date();
    // Back to New = not contacted (e.g. undoing a test click).
    if (changes.status === 'New') row[leadCol_('contacted_via')] = '';
    // Only José's columns are written; pipeline columns stay as they are.
    sheet.getRange(rowNum, SYS_COUNT + 1, 1, LEAD_COLS.length - SYS_COUNT).setValues([row.slice(SYS_COUNT)]);
    return leadForUi_(row);
  });
}

/**
 * Save one template from the Templates page. Leads with their own saved
 * draft keep it; everything else uses the new wording. `text` = null resets
 * the template to the original wording.
 */
function api_saveTemplate(token, key, text) {
  requireSession_(token);
  if (TEMPLATE_KEYS.indexOf(key) < 0) throw new Error('Unknown template');
  var value = text === null ? defaultTemplate_(key) : String(text).replace(/\r\n/g, '\n').slice(0, 5000);
  if (!value.trim()) throw new Error('The text can\'t be empty.');
  if (key === 'frame' && value.indexOf('{category_paragraph}') < 0) {
    throw new Error('The email body must keep {category_paragraph}, which is where the category text goes.');
  }
  setTemplate_(key, value);
  return getTemplates_();
}

function leadForUi_(row) {
  var g = function (c) { return row[leadCol_(c)]; };
  var date = function (v) {
    return Object.prototype.toString.call(v) === '[object Date]' ? v.toISOString() : String(v || '');
  };
  return {
    id: String(g('lead_id')), name: g('name'), owner: g('owner'), category: g('category'),
    kind: g('kind'), homeBased: g('home_based') === true, address: g('address'), zip: String(g('zip')),
    neighborhood: g('neighborhood'), distanceMi: g('distance_mi') === '' ? null : Number(g('distance_mi')),
    lat: g('lat'), lon: g('lon'), opened: g('opened') ? dateKey_(g('opened')) : '', mailing: g('mailing_address'),
    closed: g('closed') ? dateKey_(g('closed')) : '', score: Number(g('score')) || 0, scoreExplain: g('score_explain'),
    contactStatus: g('contact_status'), placesName: g('places_name'), placesStatus: g('places_status'),
    website: g('website'), phone: String(g('phone') || ''),
    email: isValidEmail_(g('email')) ? g('email') : '', emailSource: isValidEmail_(g('email')) ? g('email_source') : '',
    mapsUrl: g('maps_url'), websiteStatus: g('website_status'), source: g('source') || 'registry',
    licenseNote: g('license_note'), status: g('status') || 'New', statusDate: date(g('status_date')),
    manualEmail: g('manual_email'), notes: g('notes'), contactedVia: g('contacted_via'),
    draftSubject: g('draft_subject'), draftBody: g('draft_body')
  };
}

function lastRefresh_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.LOG);
  if (!sheet || sheet.getLastRow() < 2) return '';
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (rows[i][1] === 'refresh' && String(rows[i][2]).indexOf('FAILED') < 0) {
      return Object.prototype.toString.call(rows[i][0]) === '[object Date]' ? rows[i][0].toISOString() : String(rows[i][0]);
    }
  }
  return '';
}

/** Geocode the shop once and cache the result in Script Properties. */
function getShopLocation_() {
  var props = PropertiesService.getScriptProperties();
  var cached = props.getProperty('SHOP_LATLON');
  if (cached) return JSON.parse(cached);
  try {
    var res = Maps.newGeocoder().geocode(SHOP_ADDRESS);
    if (res.status === 'OK' && res.results.length) {
      var loc = res.results[0].geometry.location;
      var shop = { lat: loc.lat, lon: loc.lng };
      props.setProperty('SHOP_LATLON', JSON.stringify(shop));
      return shop;
    }
  } catch (e) {
    console.warn('Shop geocode failed, using fallback: ' + e);
  }
  return SHOP_FALLBACK;
}

function haversineMiles_(lat1, lon1, lat2, lon2) {
  var toRad = Math.PI / 180, R = 3958.8;
  var dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
  var a = Math.pow(Math.sin(dLat / 2), 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.pow(Math.sin(dLon / 2), 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}
