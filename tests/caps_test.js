// Verifies contact-lookup caps with stubbed paid APIs (no network for Places/Claude).
const vm = require('vm');
const { ctx, sheets, props } = require('./harness.js');
props.GOOGLE_PLACES_API_KEY = 'stub'; props.ANTHROPIC_API_KEY = 'stub';
let placesCalls = 0, claudeCalls = 0;
vm.runInContext(`
  placesLookup_ = function (key, lead) { __p(); return (__n() % 3 === 0) ? { placesName: lead.name, businessStatus: 'OPERATIONAL', website: '', phone: 'stub-phone', mapsUrl: '' } : null; };
  claudeLookup_ = function () { __c(); return { found: true, website: '', phone: '', email: 'hi@example.org', cost: 0.035 }; };
`, Object.assign(ctx, { __p: () => placesCalls++, __c: () => claudeCalls++, __n: () => placesCalls }));
vm.runInContext('setup()', ctx);
const cfg = Object.fromEntries(sheets.Config.data.slice(1).map(r => [r[0], r[1]]));
console.log('places calls:', placesCalls, '(expected 300 if today is 2026-10-15 [seeded 53 used the daily 30], else 330 = 30 daily + 300 catch-up)');
console.log('claude calls:', claudeCalls, '(expected ~33: $3 cap minus $1.83 already spent, at $0.035 each)');
console.log('catch-up remaining -> places:', cfg.places_catchup_remaining, 'claude:', cfg.claude_catchup_remaining);
console.log('usage rows:', sheets.Usage.data.slice(1));
// Second run the same day must make no further paid calls (caps exhausted).
const p0 = placesCalls, c0 = claudeCalls;
vm.runInContext('dailyRun()', ctx);
console.log('second run extra calls -> places:', placesCalls - p0, 'claude:', claudeCalls - c0, '(expected 0, 0)');
const h = sheets.Leads.data[0], c = n => h.indexOf(n);
const withEmail = sheets.Leads.data.slice(1).filter(r => r[c('email')]).length;
console.log('leads with email now:', withEmail, '| top 3:', sheets.Leads.data.slice(1, 4).map(r => r[c('score')] + ' ' + r[c('name')] + ' ' + (r[c('email')] ? '(email)' : '')));
