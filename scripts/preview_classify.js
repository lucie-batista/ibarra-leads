// Preview the category mapping on a local data pull (e.g. data/window-2mi-180d.json).
// Usage: node scripts/preview_classify.js data/window-2mi-180d.json
const fs = require('fs');
const { classify } = require('../src/Classify.js');
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const seen = new Set();
const open = rows.filter(r => {
  if (r.location_end_date) return false;
  const k = (r.dba_name || '').toLowerCase().replace(/[^a-z0-9]/g, '') + '|' + (r.full_business_address || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (seen.has(r.ttxid) || seen.has(k)) return false;
  seen.add(r.ttxid); seen.add(k);
  return true;
});
const by = {}, otherCodes = {}, kinds = {}, home = {};
const samples = {};
for (const r of open) {
  const c = classify(r);
  by[c.category] = (by[c.category] || 0) + 1;
  kinds[c.kind] = (kinds[c.kind] || 0) + 1;
  if (c.homeBased) home[c.category] = (home[c.category] || 0) + 1;
  if (c.category === 'Other') { const k = r.self_reported_naics_code || '(none)'; otherCodes[k] = (otherCodes[k] || 0) + 1; }
  (samples[c.category] = samples[c.category] || []).push(`${r.dba_name} | ${r.full_business_address} | ${c.reason}`);
}
console.log(`records=${rows.length} open+deduped=${open.length}`);
console.log('kind:', kinds);
for (const [k, v] of Object.entries(by).sort((a, b) => b[1] - a[1])) console.log(`${k.padEnd(24)} ${String(v).padStart(4)}  home-based: ${home[k] || 0}`);
console.log('\nTop "Other" codes:', Object.entries(otherCodes).sort((a, b) => b[1] - a[1]).slice(0, 15));
for (const [k, list] of Object.entries(samples)) {
  console.log(`\n== ${k} (sample)`);
  for (let i = 0; i < Math.min(5, list.length); i++) console.log('  ' + list[Math.floor(i * list.length / 5)]);
}
