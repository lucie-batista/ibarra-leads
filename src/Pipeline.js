/**
 * Pipeline entry points.
 *   setup()       - run once from the editor: creates tabs, seeds usage, installs the daily trigger, runs the first refresh.
 *   dailyRun()    - daily trigger: refresh leads -> find contacts (within caps) -> rescore.
 *   continueRun() - one-off continuation when contact lookups ran out of time but still have allowance.
 */

// Stay well under the 6-minute limit: a single slow website can take a minute+
// and UrlFetchApp has no per-request timeout.
var TIME_BUDGET_MS = 3.5 * 60 * 1000;

function setup() {
  ensureConfigSheet_();
  leadsSheet_();
  usageSheet_();
  seedUsage_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyRun') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyRun').timeBased().everyDays(1).atHour(6).inTimezone('America/Los_Angeles').create();
  logEvent_('setup', 'Daily trigger installed (6-7 AM Pacific)');
  dailyRun();
}

/** The M2 tests ran before usage tracking existed; count them so October caps are accurate. */
function seedUsage_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('USAGE_SEEDED')) return;
  usageSheet_().appendRow(["'2026-10-15", 53, 0, 1.83]);
  props.setProperty('USAGE_SEEDED', '1');
}

function dailyRun() {
  withLock_('dailyRun', function () {
    var start = Date.now();
    logEvent_('run', 'Daily run started');
    try {
      var r = refreshLeads_();
      logEvent_('refresh', 'Leads refreshed', r);
    } catch (e) {
      // Keep going with the leads we already have; contacts and scores still update.
      logEvent_('refresh', 'FAILED: ' + e.message);
    }
    try {
      var lic = importLicenses_();
      if (lic.files || lic.skipped) logEvent_('licenses', 'Liquor-license import', lic);
    } catch (e) {
      logEvent_('licenses', 'FAILED: ' + e.message);
    }
    resetStuckLookups_();
    rescoreAll_();
    enrichAndScore_(start);
  });
}

/** Leads left "in-progress" by a run that was killed get retried after a day. */
function resetStuckLookups_() {
  var rows = readLeadRows_(), changed = false;
  var dayAgo = Date.now() - 86400000;
  rows.forEach(function (row) {
    var checked = row[leadCol_('contact_checked')];
    if (row[leadCol_('contact_status')] === 'in-progress' && (!checked || new Date(checked).getTime() < dayAgo)) {
      row[leadCol_('contact_status')] = '';
      changed = true;
    }
  });
  if (changed) writeLeadRows_(rows);
}

function continueRun() {
  clearTriggers_('continueRun');
  withLock_('continueRun', function () {
    logEvent_('run', 'Continuation started');
    enrichAndScore_(Date.now());
  });
}

/**
 * Clean emails saved before validation existed: invalid ones are cleared and,
 * when the lead has a website, the site is re-read (free) to find the real one.
 */
function repairEmails_(start) {
  var sheet = leadsSheet_(), rows = readLeadRows_(), fixed = 0, cleared = 0;
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i], email = row[leadCol_('email')];
    if (!email || isValidEmail_(email)) continue;
    if (Date.now() - start > TIME_BUDGET_MS / 2) break;
    var found = '';
    if (row[leadCol_('website')]) {
      var crawl = crawlEmails_(row[leadCol_('website')], start + TIME_BUDGET_MS);
      row[leadCol_('website_status')] = crawl.status;
      if (crawl.emails.length) found = crawl.emails[0];
    }
    row[leadCol_('email')] = found;
    row[leadCol_('email_source')] = found ? 'website' : '';
    writeSysRow_(sheet, i, row);
    if (found) fixed++; else cleared++;
  }
  if (fixed || cleared) logEvent_('contacts', 'Repaired invalid emails', { fixed: fixed, cleared: cleared });
}

function enrichAndScore_(start) {
  // Safety net: if this execution gets killed by the 6-minute limit, the
  // continuation still fires. Removed below when no work remains.
  clearTriggers_('continueRun');
  ScriptApp.newTrigger('continueRun').timeBased().after(2 * 60 * 1000).create();
  var res;
  try {
    repairEmails_(start);
    res = enrichContacts_(start);
    logEvent_('contacts', 'Contact lookups done', res);
  } catch (e) {
    logEvent_('contacts', 'FAILED: ' + e.message);
  }
  rescoreAll_();
  if (res && res.outOfTime && res.remainingAllowance > 0) {
    logEvent_('contacts', 'More lookups allowed today; continuing in ~2 minutes');
  } else {
    clearTriggers_('continueRun');
  }
}

/**
 * Look up contacts for the best-ranked leads that haven't been checked yet.
 * Places first; Claude only for priority categories Places couldn't match.
 */
function enrichContacts_(start) {
  var cfg = getConfig();
  var props = PropertiesService.getScriptProperties();
  var placesKey = cfgBool_(cfg, 'places_enabled') ? props.getProperty('GOOGLE_PLACES_API_KEY') : null;
  var claudeKey = cfgBool_(cfg, 'claude_enabled') ? props.getProperty('ANTHROPIC_API_KEY') : null;
  var claudeCats = String(cfg.claude_categories || '').split(',').map(function (s) { return s.trim(); });
  var model = String(cfg.claude_model || 'claude-haiku-4-5');

  var usage = getUsage_();
  var placesCatchup = cfgNum_(cfg, 'places_catchup_remaining', 0);
  var claudeCatchup = cfgNum_(cfg, 'claude_catchup_remaining', 0);
  var placesLeft = Math.min(
    Math.max(0, cfgNum_(cfg, 'places_daily_cap', 30) - usage.placesToday) + placesCatchup,
    Math.max(0, cfgNum_(cfg, 'places_monthly_cap', 900) - usage.placesMonth));
  var claudeLeft = Math.max(0, cfgNum_(cfg, 'claude_daily_cap', 5) - usage.claudeToday) + claudeCatchup;
  var claudeUsdLeft = Math.max(0, cfgNum_(cfg, 'claude_monthly_usd_cap', 3) - usage.claudeUsdMonth);

  var sheet = leadsSheet_();
  var rows = readLeadRows_();
  var col = function (n) { return leadCol_(n); };
  // Queue: unchecked, open, not skipped, not do-not-contact; highest score first (rows are kept sorted).
  var queue = [];
  rows.forEach(function (row, i) {
    if (row[col('contact_status')] || row[col('closed')] || row[col('category')] === 'Skip') return;
    if (row[col('status')] === 'Do not contact') return;
    queue.push(i);
  });

  var stats = { queued: queue.length, places: 0, placesMatched: 0, claude: 0, claudeFound: 0, emails: 0, claudeUsd: 0 };
  var placesUsedToday = usage.placesToday, claudeUsedToday = usage.claudeToday;
  var outOfTime = false;

  for (var q = 0; q < queue.length; q++) {
    if (Date.now() - start > TIME_BUDGET_MS) { outOfTime = true; break; }
    if (!placesKey || placesLeft <= 0) break;
    var i = queue[q], row = rows[i], lead = rowToLead_(row);
    var info = null, source = '';
    row[col('contact_status')] = 'in-progress';
    row[col('contact_checked')] = new Date();
    writeSysRow_(sheet, i, row);

    try {
      info = placesLookup_(placesKey, lead);
      stats.places++; placesLeft--; addUsage_(1, 0, 0);
      placesUsedToday++;
      if (placesUsedToday > cfgNum_(cfg, 'places_daily_cap', 30) && placesCatchup > 0) {
        placesCatchup--;
        setConfigValue_('places_catchup_remaining', placesCatchup);
      }
      if (info) { stats.placesMatched++; source = 'places'; }
    } catch (e) {
      logEvent_('places', 'Lookup failed for ' + lead.name + ': ' + e.message);
      row[col('contact_status')] = '';
      writeSysRow_(sheet, i, row);
      if (e.fatal) { placesKey = null; break; }
      continue;
    }

    var wantClaude = !info && claudeKey && claudeCats.indexOf(lead.category) >= 0 &&
      claudeLeft > 0 && claudeUsdLeft > 0.05;
    if (wantClaude) {
      try {
        var c = claudeLookup_(claudeKey, lead, model);
        stats.claude++; claudeLeft--; claudeUsdLeft -= c.cost; stats.claudeUsd += c.cost;
        addUsage_(0, 1, c.cost);
        claudeUsedToday++;
        if (claudeUsedToday > cfgNum_(cfg, 'claude_daily_cap', 5) && claudeCatchup > 0) {
          claudeCatchup--;
          setConfigValue_('claude_catchup_remaining', claudeCatchup);
        }
        if (c.found && (c.website || c.phone || c.email)) {
          stats.claudeFound++; source = 'claude';
          info = { placesName: '', businessStatus: '', website: c.website, phone: c.phone, mapsUrl: '', email: c.email };
        }
      } catch (e) {
        logEvent_('claude', 'Lookup failed for ' + lead.name + ': ' + e.message);
        if (e.fatal) claudeKey = null; // e.g. out of credit: keep going with Places only
      }
    }

    var email = (info && info.email) || '', emailSource = email ? source : '';
    var websiteStatus = '';
    if (info && info.website && !email) {
      var crawl = crawlEmails_(info.website, start + TIME_BUDGET_MS);
      websiteStatus = crawl.status;
      if (crawl.emails.length) { email = crawl.emails[0]; emailSource = 'website'; }
    }
    if (email) stats.emails++;

    row[col('contact_status')] = info ? 'found-' + source : (wantClaude ? 'not-found' : 'places-no-match');
    row[col('contact_checked')] = new Date();
    if (info) {
      row[col('places_name')] = info.placesName || '';
      row[col('places_status')] = info.businessStatus || '';
      row[col('website')] = info.website || '';
      row[col('phone')] = info.phone || '';
      row[col('maps_url')] = info.mapsUrl || '';
    }
    row[col('email')] = email;
    row[col('email_source')] = emailSource;
    row[col('website_status')] = websiteStatus;
    // Save each lead as we go so a timeout never loses paid lookups.
    writeSysRow_(sheet, i, row);
  }

  stats.claudeUsd = Math.round(stats.claudeUsd * 100) / 100;
  stats.outOfTime = outOfTime;
  stats.remainingAllowance = placesKey ? placesLeft : 0;
  return stats;
}

function withLock_(name, fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) { logEvent_(name, 'Skipped: another run is in progress'); return; }
  try { fn(); } finally { lock.releaseLock(); }
}

function clearTriggers_(handler) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === handler) ScriptApp.deleteTrigger(t);
  });
}
