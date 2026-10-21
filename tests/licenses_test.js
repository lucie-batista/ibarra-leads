// Imports the real ABC CSVs in data/ through the Apps Script code path
// (Drive folder mocked; registry lookups are live). Checks counts, kinds,
// idempotency, and that a registry refresh never merges into license leads.
const vm = require('vm');
const { ctx, sheets } = require('./harness.js');
const run = c => vm.runInContext(c, ctx);
run('ensureConfigSheet_(); refreshLeads_();');
const before = sheets.Leads.data.length;
const r1 = run('importLicenses_()');
console.log('import 1:', JSON.stringify(r1));
const r2 = run('importLicenses_()');
console.log('import 2 (same files again):', JSON.stringify(r2));
run('refreshLeads_(); rescoreAll_();');
const h = sheets.Leads.data[0], c = n => h.indexOf(n);
const lic = sheets.Leads.data.slice(1).filter(r => r[c('source')] === 'abc');
console.log('license leads in sheet:', lic.length, '| rows added:', sheets.Leads.data.length - before);
console.log('still tagged abc after refresh:', lic.every(r => String(r[c('lead_id')]).startsWith('ABC-')));
lic.sort((a, b) => b[c('score')] - a[c('score')]).forEach(r =>
  console.log('  ', String(r[c('score')]).padStart(3), r[c('kind')].padEnd(14), r[c('category')].padEnd(12), String(r[c('name')]).slice(0, 28).padEnd(28), '|', r[c('address')], '|', r[c('license_note')].slice(0, 70)));
