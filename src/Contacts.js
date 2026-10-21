/**
 * Contact discovery: Google Places first (free tier), Claude web search for
 * promising leads Places can't match, then a robots.txt-respecting crawl of
 * any website found for email addresses. Every paid call is capped and
 * counted in the Usage tab; when a service is unavailable the lead simply
 * keeps its "Search on Google" fallback.
 */

var PLACES_FIELDS = 'places.id,places.displayName,places.formattedAddress,places.websiteUri,' +
  'places.nationalPhoneNumber,places.businessStatus,places.googleMapsUri';
var CLAUDE_PRICE = { // USD, used to count spend against claude_monthly_usd_cap
  'claude-haiku-4-5': { input: 1 / 1e6, output: 5 / 1e6 },
  search: 0.01
};

/** Google Places Text Search. Returns the best same-street-number match or null. */
function placesLookup_(key, lead) {
  var resp = UrlFetchApp.fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': PLACES_FIELDS },
    payload: JSON.stringify({ textQuery: lead.name + ', ' + lead.address + ', San Francisco, CA', pageSize: 3 })
  });
  var code = resp.getResponseCode();
  if (code !== 200) {
    var err = new Error('Places HTTP ' + code + ': ' + resp.getContentText().slice(0, 200));
    err.fatal = (code === 403 || code === 429 || code === 400);
    throw err;
  }
  return pickPlace_(JSON.parse(resp.getContentText()).places || [], lead.name, lead.address);
}

/** Accept only a result at the same street number whose name shares a word with ours. */
function pickPlace_(places, name, address) {
  var num = (String(address).match(/^\d+/) || [''])[0];
  var words = function (s) {
    return String(s || '').toLowerCase().replace(/['’`]/g, '')
      .replace(/\b(llc|inc|corp|co|the|sf|and)\b/g, ' ')
      .split(/[^a-z0-9]+/).filter(function (w) { return w.length > 2; });
  };
  var ours = words(name);
  var best = null;
  places.forEach(function (p) {
    var addr = p.formattedAddress || '';
    if (!num || addr.indexOf(num + ' ') !== 0) return;
    var theirs = words(p.displayName && p.displayName.text);
    var shared = ours.filter(function (w) {
      return theirs.some(function (t) { return t === w || (w.length > 4 && (t.indexOf(w) === 0 || w.indexOf(t) === 0)); });
    }).length;
    if (shared > 0 && !best) best = p;
  });
  if (!best) return null;
  return {
    placesName: best.displayName ? best.displayName.text : '',
    businessStatus: best.businessStatus || '',
    website: best.websiteUri || '',
    phone: best.nationalPhoneNumber || '',
    mapsUrl: best.googleMapsUri || ''
  };
}

/** Claude web search for one lead. Returns {found, website, phone, email, cost}. */
function claudeLookup_(key, lead, model) {
  var prompt = [
    'Find public contact information for this newly registered San Francisco business.',
    'Business name (DBA): ' + lead.name,
    'Registered owner: ' + lead.owner,
    'Business address: ' + lead.address + ', San Francisco, CA',
    'Category: ' + lead.category,
    '',
    'Search the web for this specific business. Only report details you found on a page that clearly',
    'refers to this business at or near this address (or this owner running this business). Never guess.',
    'Respond with only a JSON object, no other text:',
    '{"found": true|false, "website": string|null, "phone": string|null, "email": string|null}'
  ].join('\n');
  var body = {
    model: model, max_tokens: 1000,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2,
      user_location: { type: 'approximate', city: 'San Francisco', region: 'California', country: 'US' } }],
    messages: [{ role: 'user', content: prompt }]
  };
  var tokensIn = 0, tokensOut = 0, searches = 0, msg;
  for (var turn = 0; turn < 3; turn++) {
    msg = callClaude_(key, body);
    var u = msg.usage || {};
    tokensIn += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    tokensOut += u.output_tokens || 0;
    searches += (u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
    if (msg.stop_reason !== 'pause_turn') break;
    body.messages = [body.messages[0], { role: 'assistant', content: msg.content }];
  }
  var price = CLAUDE_PRICE[model] || CLAUDE_PRICE['claude-haiku-4-5'];
  var cost = tokensIn * price.input + tokensOut * price.output + searches * CLAUDE_PRICE.search;
  var text = (msg.content || []).filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; }).join('\n');
  var parsed = {};
  var m = text.match(/\{[\s\S]*\}/);
  if (m) { try { parsed = JSON.parse(m[0]); } catch (e) { parsed = {}; } }
  return {
    found: !!parsed.found, website: parsed.website || '', phone: parsed.phone || '',
    email: isValidEmail_(parsed.email) ? String(parsed.email).trim() : '', cost: cost
  };
}

/** POST to the Messages API with retries on overload; throws with .fatal for credit/auth problems. */
function callClaude_(key, body) {
  for (var attempt = 0; attempt < 3; attempt++) {
    var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify(body)
    });
    var code = resp.getResponseCode();
    if (code === 200) return JSON.parse(resp.getContentText());
    if (code === 429 || code === 529 || code >= 500) { Utilities.sleep(5000 * (attempt + 1)); continue; }
    var detail = {};
    try { detail = JSON.parse(resp.getContentText()).error || {}; } catch (e) {}
    var err = new Error('Claude HTTP ' + code + ': ' + (detail.message || resp.getContentText().slice(0, 200)));
    err.fatal = (code === 401 || code === 403 || /credit|billing/i.test(err.message));
    throw err;
  }
  throw new Error('Claude unavailable after retries');
}

var EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

/** True for a real-looking address (rejects placeholders like "[email protected]"). */
function isValidEmail_(e) {
  e = String(e || '').trim();
  return EMAIL_RE.test(e) && !/protected|example\.|sentry|wixpress/i.test(e);
}

/** Decode Cloudflare-obfuscated emails (data-cfemail / /cdn-cgi/l/email-protection#...). */
function cloudflareEmails_(html) {
  var out = [], re = /(?:data-cfemail="|email-protection#)([0-9a-fA-F]{6,})/g, m;
  while ((m = re.exec(html))) {
    var hex = m[1], key = parseInt(hex.substr(0, 2), 16), s = '';
    for (var i = 2; i + 1 < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.substr(i, 2), 16) ^ key);
    if (isValidEmail_(s)) out.push(s);
  }
  return out;
}

/** Read a site's homepage (and one contact page) for email addresses, respecting robots.txt. */
function crawlEmails_(website, deadline) {
  // UrlFetchApp can't time out a slow site, so don't start a fetch unless
  // there's comfortably enough time left in this execution.
  var timeLeft = function () { return !deadline || deadline - Date.now() > 75 * 1000; };
  if (!timeLeft()) return { emails: [], status: 'skipped' };
  var url = /^https?:\/\//i.test(website) ? website : 'https://' + website;
  var EMAIL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
  var JUNK = /(example\.|sentry|wixpress|\.png|\.jpg|\.gif|\.webp|@2x|domain\.com|yourname|email\.com|godaddy)/i;
  var clean = function (html) {
    return cloudflareEmails_(html).concat((html.match(EMAIL) || []).filter(function (e) {
      return !JUNK.test(e) && isValidEmail_(e);
    }));
  };
  try {
    if (!robotsAllows_(url)) return { emails: [], status: 'robots-disallow' };
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    if (resp.getResponseCode() >= 400) return { emails: [], status: 'unreachable' };
    var html = resp.getContentText();
    var found = clean(html);
    if (!found.length && timeLeft()) {
      var m = html.match(/href="([^"]*contact[^"]*)"/i);
      if (m) {
        var contactUrl = /^https?:/i.test(m[1]) ? m[1] : url.replace(/\/+$/, '') + '/' + m[1].replace(/^\/+/, '');
        if (robotsAllows_(contactUrl)) {
          var c = UrlFetchApp.fetch(contactUrl, { muteHttpExceptions: true });
          if (c.getResponseCode() < 400) found = clean(c.getContentText());
        }
      }
    }
    var uniq = found.map(function (e) { return e.toLowerCase(); })
      .filter(function (e, i, a) { return a.indexOf(e) === i; });
    return { emails: uniq, status: 'ok' };
  } catch (e) {
    // DNS failure, certificate error, timeout...: the site didn't load.
    return { emails: [], status: 'unreachable' };
  }
}

/** Minimal robots.txt check: honors Disallow rules in the "User-agent: *" group. */
function robotsAllows_(url) {
  var m = url.match(/^(https?:\/\/[^\/]+)(\/.*)?$/i);
  if (!m) return true;
  var path = m[2] || '/';
  try {
    var resp = UrlFetchApp.fetch(m[1] + '/robots.txt', { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return true;
    var applies = false, disallowed = [];
    resp.getContentText().split(/\r?\n/).forEach(function (line) {
      var kv = line.replace(/#.*/, '').trim().match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
      if (!kv) return;
      var k = kv[1].toLowerCase(), v = kv[2].trim();
      if (k === 'user-agent') applies = (v === '*');
      else if (k === 'disallow' && applies && v) disallowed.push(v);
    });
    return !disallowed.some(function (d) { return path.indexOf(d) === 0; });
  } catch (e) {
    return true;
  }
}
