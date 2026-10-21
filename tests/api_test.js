// Passcode, data load, and save paths of the web app API (Places/Claude disabled).
const vm = require('vm');
const { ctx, sheets, props } = require('./harness.js');
const run = code => vm.runInContext(code, ctx);
run('ensureConfigSheet_(); refreshLeads_(); rescoreAll_();');
const expectErr = (code, re) => { try { run(code); console.log('FAIL no error:', code); } catch (e) { console.log(re.test(e.message) ? 'ok' : 'FAIL', '-', e.message); } };
expectErr("api_login('x')", /No passcode/);
props.PASSCODE_NEW = 'tortilla 42';
run('applyPendingPasscode_()');
console.log('plain passcode removed:', !('PASSCODE_NEW' in props), '| hash stored:', !!props.PASSCODE_HASH);
expectErr("api_login('wrong')", /Wrong passcode/);
expectErr("api_getData('not-a-token')", /SESSION_EXPIRED/);
expectErr("api_updateLead('', 'x', {status:'Customer'})", /SESSION_EXPIRED/);
const token = run("api_login('  tortilla 42 ')");
const data = run(`api_getData('${token}')`);
console.log('leads to UI:', data.leads.length, '| any Skip:', data.leads.some(l => l.category === 'Skip'), '| templates:', Object.keys(data.templates).length);
const id = data.leads[0].id;
// Simulate the pipeline re-sorting + rewriting system columns after a UI edit: edit must survive.
const up = run(`api_updateLead('${token}', '${id}', {status:'Contacted', contactedVia:'Email', notes:'called back', draftSubject:'Hi'})`);
console.log('updated:', up.status, up.contactedVia, up.notes, up.draftSubject);
run('refreshLeads_(); rescoreAll_();');
const after = run(`api_getData('${token}')`).leads.find(l => l.id === id);
console.log('edit survives refresh:', after.status === 'Contacted' && after.notes === 'called back' && after.draftSubject === 'Hi');
expectErr(`api_updateLead('${token}', '${id}', {status:'Hacked'})`, /Unknown status/);
expectErr(`api_updateLead('${token}', '${id}', {manualEmail:'not-an-email'})`, /doesn't look right/);
for (let i = 0; i < 9; i++) { try { run("api_login('nope')"); } catch (e) {} }
expectErr("api_login('tortilla 42')", /Too many/);
