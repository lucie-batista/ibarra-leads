/**
 * Category classification for registered businesses (pure logic, no Apps
 * Script services, so it can also run under Node for previews/tests).
 *
 * The dataset's NAICS descriptions were removed in July 2026, so we map
 * self-reported NAICS code prefixes ourselves. Longest matching prefix wins.
 */

var CATEGORIES = [
  'Restaurant', 'Bar/Brewery', 'Cafe/Bakery/Food maker', 'Retail', 'Salon/Beauty/Wellness',
  'Trades/Home services', 'Childcare/Education', 'Startup/Tech', 'Other', 'Skip'
];

// [prefix, category, short description for the review table]
var NAICS_MAP = [
  // Food service
  ['7225', 'Restaurant', 'Restaurants (full-service, limited-service, buffets)'],
  ['722515', 'Cafe/Bakery/Food maker', 'Coffee shops, snack and juice bars'],
  ['7223', 'Restaurant', 'Caterers, food trucks, food service contractors'],
  ['7224', 'Bar/Brewery', 'Bars and drinking places'],
  ['31212', 'Bar/Brewery', 'Breweries'],
  ['31213', 'Bar/Brewery', 'Wineries'],
  ['31214', 'Bar/Brewery', 'Distilleries'],
  ['311', 'Cafe/Bakery/Food maker', 'Food manufacturing (bakeries, candy, sauces, etc.)'],
  ['3121', 'Cafe/Bakery/Food maker', 'Beverage makers (non-alcoholic)'],
  ['4452', 'Cafe/Bakery/Food maker', 'Specialty food stores (bakery, meat, produce, candy)'],
  ['4451', 'Retail', 'Grocery and convenience stores'],
  ['4453', 'Retail', 'Liquor stores'],
  // Retail
  ['44', 'Retail', 'Retail stores'],
  ['45', 'Retail', 'Retail stores'],
  ['454110', 'Retail', 'Online retail'],
  // Personal care / wellness
  ['8121', 'Salon/Beauty/Wellness', 'Barbers, salons, nails, spas, tattoo, other personal care'],
  ['713940', 'Salon/Beauty/Wellness', 'Gyms, fitness and yoga studios'],
  ['621310', 'Salon/Beauty/Wellness', 'Chiropractors'],
  ['621340', 'Salon/Beauty/Wellness', 'Physical/occupational therapists'],
  ['621399', 'Salon/Beauty/Wellness', 'Other health practitioners (acupuncture, massage)'],
  ['812910', 'Salon/Beauty/Wellness', 'Pet grooming and pet care'],
  // Trades / home services
  ['23', 'Trades/Home services', 'Construction and specialty trades'],
  ['5617', 'Trades/Home services', 'Cleaning, landscaping, pest control'],
  ['8111', 'Trades/Home services', 'Auto repair'],
  ['8112', 'Trades/Home services', 'Electronics repair'],
  ['8113', 'Trades/Home services', 'Equipment repair'],
  ['8114', 'Trades/Home services', 'Home goods repair, upholstery'],
  ['8123', 'Trades/Home services', 'Dry cleaning and laundry'],
  // Childcare / education
  ['6244', 'Childcare/Education', 'Child day care'],
  ['611', 'Childcare/Education', 'Schools, tutoring, classes'],
  // Startup / tech
  ['5132', 'Startup/Tech', 'Software publishers'],
  ['5112', 'Startup/Tech', 'Software publishers (older code)'],
  ['5182', 'Startup/Tech', 'Data processing and hosting'],
  ['5415', 'Startup/Tech', 'Computer systems design and programming'],
  ['5417', 'Startup/Tech', 'Research and development'],
  ['5192', 'Startup/Tech', 'Internet publishing and web search'],
  // Skip: not realistic print customers
  ['721199', 'Skip', 'Short-term rentals'],
  ['531', 'Skip', 'Landlords, property managers, real estate agents'],
  ['525', 'Skip', 'Trusts, funds, investment vehicles'],
  ['551', 'Skip', 'Holding companies'],
  ['814', 'Skip', 'Private households (nannies, housekeepers employed by a household)'],
  ['4853', 'Skip', 'Taxi and rideshare drivers'],
  ['4921', 'Skip', 'Couriers and delivery drivers']
];

// Codes that usually mean a one-person consultant/freelancer. These become
// Skip only when other signals also say "solo" (see classify()).
var SOLO_PREFIXES = ['5416', '5419', '711510', '541430', '541810', '541820', '541921', '541922', '621330'];

// Some records carry a city license description that is more specific than
// the self-reported NAICS code.
var LICENSE_RULES = [
  [/RESTAURANT|FOOD PREP|CATERER|MOBILE FOOD/i, 'Restaurant'],
  [/BAR|TAVERN|LIQUOR ON-SALE/i, 'Bar/Brewery'],
  [/TATTOO|MASSAGE|COSMETOLOG|BARBER/i, 'Salon/Beauty/Wellness'],
  [/TOW CAR|TAXI/i, 'Skip']
];

// Used only when the NAICS code is missing or unmapped: the business name
// often makes the category obvious.
var NAME_RULES = [
  [/\b(taqueria|restaurant|kitchen|grill|pizza|pizzeria|sushi|ramen|burger|bbq|deli|diner|bistro|eatery|cantina|tacos?|noodle|pho|dumpling|catering)\b/i, 'Restaurant'],
  [/\b(bar|brewing|brewery|tavern|pub|saloon|lounge|wine bar|taproom)\b/i, 'Bar/Brewery'],
  [/\b(cafe|caf\u00e9|coffee|bakery|bakeshop|panaderia|patisserie|donuts?|creamery|ice cream|tea house|boba|juice|chocolates?|cookies?)\b/i, 'Cafe/Bakery/Food maker'],
  [/\b(salon|barber|barbershop|nails?|spa|lashes|brows|beauty|tattoo|massage|yoga|pilates|fitness|gym|wellness|esthetics|skincare)\b/i, 'Salon/Beauty/Wellness'],
  [/\b(boutique|shop|store|market|mercado|tienda|gallery|florist|flowers|vintage|thrift|apparel|clothing)\b/i, 'Retail'],
  [/\b(construction|plumbing|electric|roofing|painting|contractors?|builders|landscaping|cleaning|janitorial|moving|movers|auto|repair|handyman|hvac)\b/i, 'Trades/Home services'],
  [/\b(preschool|daycare|day care|montessori|academy|tutoring|school|learning)\b/i, 'Childcare/Education']
];

function naicsLookup_(code) {
  var c = String(code || '').replace(/\D/g, '');
  var best = null;
  for (var i = 0; i < NAICS_MAP.length; i++) {
    var p = NAICS_MAP[i][0];
    if (c.indexOf(p) === 0 && (!best || p.length > best[0].length)) best = NAICS_MAP[i];
  }
  return best;
}

function isHomeAddress_(address) {
  return /\b(apt|apartment|unit)\b|#\s*\d/i.test(String(address || ''));
}

function normName_(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Classify one raw dataset record.
 * Returns { category, reason, homeBased, kind } where kind is 'Brand new' or 'Moved/new location'.
 */
function classify(r) {
  var code = String(r.self_reported_naics_code || '');
  var homeBased = isHomeAddress_(r.full_business_address);
  var personNamed = !!r.dba_name && normName_(r.dba_name) === normName_(r.ownership_name);
  var category = 'Other', reason = code ? 'NAICS ' + code + ': no specific mapping' : 'No NAICS code';

  var hit = naicsLookup_(code);
  if (hit) { category = hit[1]; reason = 'NAICS ' + code + ': ' + hit[2]; }

  if (!hit) {
    var name = String(r.dba_name || '');
    for (var n = 0; n < NAME_RULES.length; n++) {
      if (NAME_RULES[n][0].test(name)) {
        category = NAME_RULES[n][1];
        reason = (code ? 'NAICS ' + code + ' unmapped' : 'No NAICS code') + '; name suggests ' + category;
        break;
      }
    }
  }
  // A business "named" after its street address is almost always a rental property.
  if (/^\d+[a-z]?\s+\S+.*\b(st|street|ave|avenue|blvd|way|ter|terrace|pl|place|ct|court)\b\.?$/i.test(String(r.dba_name || '').trim())) {
    category = 'Skip';
    reason = 'Business name is a street address (likely a rental property)';
  }

  var lic = String(r.lic_code_description || '');
  for (var i = 0; i < LICENSE_RULES.length; i++) {
    if (LICENSE_RULES[i][0].test(lic)) { category = LICENSE_RULES[i][1]; reason = 'License: ' + lic; break; }
  }

  var solo = SOLO_PREFIXES.some(function (p) { return code.indexOf(p) === 0; });
  if (solo && category !== 'Skip' && (homeBased || personNamed)) {
    category = 'Skip';
    reason = 'Likely solo consultant/freelancer (NAICS ' + code + (homeBased ? ', home address' : ', business named after owner') + ')';
  }

  var dba = String(r.dba_start_date || '').slice(0, 10);
  var loc = String(r.location_start_date || '').slice(0, 10);
  var kind = (dba && loc && daysBetween_(dba, loc) > 90) ? 'Moved/new location' : 'Brand new';

  return { category: category, reason: reason, homeBased: homeBased, kind: kind };
}

function daysBetween_(a, b) {
  return Math.abs((new Date(b) - new Date(a)) / 86400000);
}

if (typeof module !== 'undefined') {
  module.exports = { classify: classify, CATEGORIES: CATEGORIES, NAICS_MAP: NAICS_MAP, SOLO_PREFIXES: SOLO_PREFIXES };
}
