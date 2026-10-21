/**
 * Lead ranking (pure logic, Node-testable). Points: category + recency +
 * distance + best contact - home penalty. An email is worth a large bonus
 * (default 30) so emailable leads usually lead, but old ones still decay below
 * brand-new leads. Higher score = higher in the list.
 */

// Used when a weight is missing from the Config tab (mirrors CONFIG_DEFAULTS).
var DEFAULT_CATEGORY_WEIGHTS = {
  'Restaurant': 40, 'Cafe/Bakery/Food maker': 36, 'Bar/Brewery': 32, 'Retail': 28,
  'Salon/Beauty/Wellness': 24, 'Trades/Home services': 20, 'Childcare/Education': 20,
  'Startup/Tech': 12, 'Startup/Tech_home': 4, 'Other': 8, 'Skip': 0
};

function scoreLead(lead, cfg, today) {
  var num = function (k, d) { var v = Number(cfg[k]); return isNaN(v) || cfg[k] === '' ? d : v; };
  var lookback = num('lookback_days', 180), radius = num('radius_miles', 2);

  var cat = lead.category;
  if (cat === 'Startup/Tech' && lead.homeBased) cat = 'Startup/Tech_home';
  var category = num('weight_' + cat, DEFAULT_CATEGORY_WEIGHTS[cat] || 0);

  var ageDays = lead.opened ? Math.max(0, (today - new Date(lead.opened)) / 86400000) : lookback;
  var recency = Math.max(0, 1 - ageDays / lookback) * num('recency_max', 25);

  var distance = (lead.distanceMi === '' || lead.distanceMi == null) ? 0 :
    Math.max(0, 1 - Number(lead.distanceMi) / radius) * num('distance_max', 20);

  var hasEmail = !!(lead.email || lead.manualEmail);
  var contact = hasEmail ? num('contact_email', 30) :
    lead.phone ? num('contact_phone', 8) : lead.website ? num('contact_website', 5) : 0;

  var penalty = lead.homeBased ? num('home_penalty', 10) : 0;
  var score = Math.max(0, Math.round(category + recency + distance + contact - penalty));
  return {
    score: score,
    hasEmail: hasEmail,
    explain: 'category ' + Math.round(category) + ' + recency ' + Math.round(recency) + ' + distance ' +
      Math.round(distance) + ' + contact ' + contact + (penalty ? ' - home ' + penalty : '')
  };
}

if (typeof module !== 'undefined') module.exports = { scoreLead: scoreLead };
