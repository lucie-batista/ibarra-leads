// An existing Leads tab from the previous schema (no website_status) must gain the
// column in the right place without shifting José's data into the wrong columns.
const vm = require('vm');
const { ctx, sheets } = require('./harness.js');
const run = c => vm.runInContext(c, ctx);
const cols = run('LEAD_COLS.map(function(c){return c[0];})');
const old = cols.filter(c => c !== 'website_status');
const sheet = run("SpreadsheetApp.getActiveSpreadsheet().insertSheet('Leads')");
sheet.data.push(old.slice());
const row = old.map(c => c === 'lead_id' ? 'L1' : c === 'status' ? 'Customer' : c === 'notes' ? 'loves menus' : c === 'maps_url' ? 'https://maps/x' : c === 'draft_body' ? 'body' : '');
sheet.data.push(row);
run('leadsSheet_()');
const h = sheets.Leads.data[0], r = sheets.Leads.data[1];
console.log('header matches schema:', JSON.stringify(h) === JSON.stringify(cols));
console.log('data aligned:', r[h.indexOf('status')] === 'Customer', r[h.indexOf('notes')] === 'loves menus', r[h.indexOf('maps_url')] === 'https://maps/x', r[h.indexOf('draft_body')] === 'body', r[h.indexOf('website_status')] === '');
run('leadsSheet_()');
console.log('idempotent:', sheets.Leads.data[0].length === cols.length);
