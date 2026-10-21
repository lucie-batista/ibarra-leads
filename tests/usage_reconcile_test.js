// Reproduces the real Usage tab after the date bug (one Date-typed row per lookup)
// and checks compaction + caps: expect 200 Places (catch-up) and 0 Claude (October cap already exceeded).
const vm = require('vm');
const { ctx, sheets, props } = require('./harness.js');
props.GOOGLE_PLACES_API_KEY = 'stub'; props.ANTHROPIC_API_KEY = 'stub'; props.USAGE_SEEDED = '1';
let p = 0, c = 0;
vm.runInContext(`placesLookup_ = function () { __p(); return null; };
  claudeLookup_ = function () { __c(); return { found: false, cost: 0.035 }; };`,
  Object.assign(ctx, { __p: () => p++, __c: () => c++ }));
vm.runInContext('ensureConfigSheet_(); usageSheet_(); refreshLeads_();', ctx);
// Use today's date so the scenario is always "earlier today".
const day = new Date(vm.runInContext('todayKey_()', ctx) + 'T00:00:00-07:00');
sheets.Usage.data.push([day, 53, 0, 1.83]);
for (let i = 0; i < 100; i++) sheets.Usage.data.push([day, 1, 0, 0]);
for (let i = 0; i < 50; i++) sheets.Usage.data.push([day, 0, 1, 0.034]);
vm.runInContext("setConfigValue_('places_catchup_remaining', 200); setConfigValue_('claude_catchup_remaining', 0);", ctx);
vm.runInContext('continueRun()', ctx);
console.log('places calls:', p, '(expected 200)', '| claude calls:', c, '(expected 0)');
console.log('usage rows after compaction:', sheets.Usage.data.slice(1));
