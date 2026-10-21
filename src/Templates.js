/**
 * Email templates and outreach scripts, kept in a Templates tab so José can
 * edit wording without code. Placeholders: {business_name}, {street},
 * {opening_phrase} ("opening at" / "your new location at"), {category_paragraph}.
 */

var TEMPLATE_DEFAULTS = [
  ['frame',
    'Hi {business_name} team,\n\n' +
    'Congratulations on {opening_phrase} {street}! We\'re Ibarra Brothers Printing, a family-owned print shop at ' +
    '1009 Valencia St that has been part of the neighborhood for about 40 years. Small local businesses do best ' +
    'when we support each other, so we wanted to say welcome.\n\n' +
    '{category_paragraph}\n\n' +
    'As a welcome to the neighborhood, we\'re offering 15% off your first order. Just mention you\'re a new customer.\n\n' +
    'Call us at (415) 826-6700, reply to this email, or stop by the shop. We\'d love to meet you.\n\n' +
    'José Maria Ibarra & the Ibarra Brothers team\n' +
    'Ibarra Brothers Printing\n1009 Valencia St, San Francisco, CA 94110\n(415) 826-6700 · sales@ibarrabrothersprinting.com\n' +
    'Hablamos español.\n\n' +
    'If you\'d prefer not to hear from us, just reply "no thanks" and we won\'t email you again.',
    'Shared email body. {category_paragraph} is replaced with the paragraph for the lead\'s category.'],
  ['subject_Restaurant', 'Menus, signs & cards for {business_name}, from your neighbors on Valencia St', ''],
  ['paragraph_Restaurant', 'New restaurants usually need a lot printed in the first few months: menus, to-go menus, table tents, business cards, window signs and banners. We print all of it locally, and you\'re welcome to come by and see samples and paper options. And when your prices change, there\'s no charge for updating your menu. You only pay for the printing.', ''],
  ['subject_Cafe/Bakery/Food maker', 'Menus, labels & cards for {business_name}, from your neighbors on Valencia St', ''],
  ['paragraph_Cafe/Bakery/Food maker', 'Whether it\'s menu boards, product labels, stickers, loyalty cards, bags or business cards, we can help you look great from day one, all printed right here in the Mission.', ''],
  ['subject_Bar/Brewery', 'Menus, posters & signs for {business_name}, from your neighbors on Valencia St', ''],
  ['paragraph_Bar/Brewery', 'We print drink menus, event posters, coasters, banners and staff shirts, and we\'re used to quick turnarounds when an event comes up.', ''],
  ['subject_Retail', 'Signs, cards & bags for {business_name}, from your neighbors on Valencia St', ''],
  ['paragraph_Retail', 'A new shop needs to get noticed: window signs, banners, business cards, price tags, flyers and branded bags or stickers. We\'d be glad to help you get set up.', ''],
  ['subject_Salon/Beauty/Wellness', 'Cards & signs for {business_name}, from your neighbors on Valencia St', ''],
  ['paragraph_Salon/Beauty/Wellness', 'We print appointment cards, business cards, price lists, gift certificates, window signs and flyers, the everyday pieces that bring clients back.', ''],
  ['subject_Trades/Home services', 'Business cards, forms & signs for {business_name}, from your neighbors on Valencia St', ''],
  ['paragraph_Trades/Home services', 'We print business cards, estimate and invoice forms, door hangers, yard signs, vehicle magnets and work shirts, so customers remember who to call.', ''],
  ['subject_Childcare/Education', 'Flyers, forms & signs for {business_name}, from your neighbors on Valencia St', ''],
  ['paragraph_Childcare/Education', 'We print enrollment forms, flyers, signs, certificates, name tags and business cards, everything you need to welcome new families.', ''],
  ['subject_Startup/Tech', 'Cards, banners & shirts for {business_name}, from your neighbors on Valencia St', ''],
  ['paragraph_Startup/Tech', 'We print business cards, event banners, stickers, posters and team shirts, with quick local turnaround when you have a launch or meetup coming up.', ''],
  ['subject_Other', 'Printing for {business_name}, from your neighbors on Valencia St', ''],
  ['paragraph_Other', 'We print business cards, flyers, signs, banners, forms and shirts, whatever a new business needs to get started.', ''],
  ['subject_New owner', 'Fresh menus & signs for {business_name}, from your neighbors on Valencia St', 'Used for liquor-license leads with a new owner'],
  ['paragraph_New owner', 'A change of ownership is a great time to refresh the menus, signs, business cards and banners. We print all of it locally, and you\'re welcome to come by and see samples and paper options.', 'Used for liquor-license leads with a new owner'],
  ['subject_Adding alcohol', 'Drink menus & signs for {business_name}, from your neighbors on Valencia St', 'Used for liquor-license leads adding alcohol'],
  ['paragraph_Adding alcohol', 'Adding beer, wine or cocktails usually means new drink menus, table tents, chalkboard and window signs, and an updated food menu. We print all of it locally and quickly, and you\'re welcome to come by and see samples and paper options.', 'Used for liquor-license leads adding alcohol'],
  ['call_script', 'Hi, I\'m calling from Ibarra Brothers Printing on Valencia St. I saw you just opened, congratulations! We\'re a family print shop that\'s been in the neighborhood about 40 years. If you need menus, cards, signs or anything printed, we\'re offering 15% off the first order for new customers. Could we send you some information or drop by with samples?', 'What to say when calling'],
  ['mail_note', 'Send the Ibarra Brothers new-customer postcard to this address.', 'Shown on the Postcard option, next to the mailing address']
];

// Wording updates to default templates. Applied only when the Sheet still has the
// exact previous default, so hand edits are never overwritten.
var TEMPLATE_UPGRADES = [
  ['paragraph_Restaurant', 'New restaurants usually need a lot printed in the first few months: menus, to-go menus, table tents, business cards, window signs and banners. We print all of it locally, and you\'re welcome to come by and see samples and paper options.'],
  ['mail_note', 'Send José\'s new-customer postcard to this address.'],
  ['frame', 'Hi {business_name} team,\n\n' +
    'Congratulations on {opening_phrase} {street}! We\'re Ibarra Brothers Printing, a family-owned print shop at ' +
    '1009 Valencia St that has been part of the neighborhood for about 40 years. Small local businesses do best ' +
    'when we support each other, so we wanted to say welcome.\n\n' +
    '{category_paragraph}\n\n' +
    'As a welcome to the neighborhood, we\'re offering 15% off your first order. Just mention you\'re a new customer.\n\n' +
    'Call us at (415) 826-6700, reply to this email, or stop by the shop. We\'d love to meet you.\n\n' +
    'José Maria Ibarra\n' +
    'Ibarra Brothers Printing\n1009 Valencia St, San Francisco, CA 94110\n(415) 826-6700 · sales@ibarrabrothersprinting.com\n' +
    'Hablamos español.\n\n' +
    'If you\'d prefer not to hear from us, just reply "no thanks" and we won\'t email you again.'],
  ['call_script', 'Hi, I\'m José Maria from Ibarra Brothers Printing on Valencia St. I saw you just opened, congratulations! We\'re a family print shop that\'s been in the neighborhood about 40 years. If you need menus, cards, signs or anything printed, we\'re offering 15% off the first order for new customers. Can I leave you our card?']
];

function getTemplates_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Templates');
  if (!sheet) {
    sheet = ss.insertSheet('Templates');
    sheet.getRange(1, 1, 1, 3).setValues([['Key', 'Text', 'Notes']]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 240);
    sheet.setColumnWidth(2, 700);
  }
  var existing = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(function (r) { existing[r[0]] = r[1]; });
  }
  TEMPLATE_UPGRADES.forEach(function (u) {
    if (existing[u[0]] === u[1].replace(/\\'/g, "'")) {
      setTemplateRow_(sheet, u[0], defaultTemplate_(u[0]));
      existing[u[0]] = defaultTemplate_(u[0]);
    }
  });
  var missing = TEMPLATE_DEFAULTS.filter(function (t) { return !(t[0] in existing); });
  if (missing.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, missing.length, 3).setValues(missing);
    missing.forEach(function (t) { existing[t[0]] = t[1]; });
  }
  return existing;
}

var TEMPLATE_KEYS = TEMPLATE_DEFAULTS.map(function (t) { return t[0]; });

function setTemplateRow_(sheet, key, text) {
  var keys = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) if (keys[i][0] === key) { sheet.getRange(i + 2, 2).setValue(text); return; }
}

/** Write one template's text to the Templates tab (row found by key). */
function setTemplate_(key, text) {
  getTemplates_(); // makes sure the tab and every default row exist
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Templates');
  var keys = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (keys[i][0] === key) { sheet.getRange(i + 2, 2).setValue(text); return; }
  }
  sheet.appendRow([key, text, '']);
}

function defaultTemplate_(key) {
  for (var i = 0; i < TEMPLATE_DEFAULTS.length; i++) if (TEMPLATE_DEFAULTS[i][0] === key) return TEMPLATE_DEFAULTS[i][1];
  return null;
}
