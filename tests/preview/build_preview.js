// Renders the real web app UI as a static page with a mocked google.script.run,
// using real leads (contacts stubbed). Output goes to data/preview (gitignored).
// Usage: node tests/preview/build_preview.js [--public]
const fs = require('fs'), path = require('path'), vm = require('vm');
const { ctx, props } = require('../harness.js');
const run = c => vm.runInContext(c, ctx);
props.GOOGLE_PLACES_API_KEY = 'stub'; props.ANTHROPIC_API_KEY = 'stub'; props.USAGE_SEEDED = '1';
let n = 0;
run(`placesLookup_ = function (k, lead) { var i = __n();
  if (i % 3 === 0) return { placesName: lead.name, businessStatus: 'OPERATIONAL', website: 'example-site.test', phone: '(415) 555-01' + String(i % 100).padStart(2, '0'), mapsUrl: 'https://maps.google.com' };
  return null; };
  claudeLookup_ = function () { return { found: false, cost: 0 }; };
  crawlEmails_ = function () { return { emails: __n() % 2 ? ['hello@business-example.test'] : [], status: 'ok' }; };`,
  Object.assign(ctx, { __n: () => n++ }));
run('setup()');
run('importLicenses_(); rescoreAll_();');
props.PASSCODE_NEW = 'preview'; run('applyPendingPasscode_()');
const token = run("api_login('preview')");
const data = run(`api_getData('${token}')`);
data.leads.forEach((l, i) => { if (i % 4 === 1) { l.email = 'hello@business-example.test'; l.emailSource = 'website'; } });
// --public: a shareable demo. Drops home-based registrations, hides owner names and
// uses the business address for postcards, so no personal names or home addresses show.
const isPublic = process.argv.includes('--public');
if (isPublic) {
  data.leads = data.leads.filter(l => !l.homeBased);
  data.leads.forEach(l => { l.owner = ''; l.mailing = l.address + ', San Francisco, CA ' + (l.zip || ''); });
}

const src = f => fs.readFileSync(path.join(__dirname, '../../src', f), 'utf8');
const banner = '<div style="position:fixed;left:0;right:0;bottom:0;z-index:30;background:#fff3c4;color:#5c4400;' +
  'font:600 13px/1.4 -apple-system,sans-serif;text-align:center;padding:8px 12px;border-top:1px solid #e8d48a">' +
  (isPublic
    ? 'DEMO: real public business registrations; emails, phone numbers and websites are made-up samples. Any passcode works.'
    : 'LOCAL PREVIEW: real businesses, but emails, phone numbers and websites are made-up samples. Nothing here changes the real Sheet.') + '</div>';
const mock = banner + `<script>
  var __data = ${JSON.stringify(data)};
  window.google = { script: { get run() {
    var ok = function () {}, fail = function () {};
    var api = {
      withSuccessHandler: function (f) { ok = f; return api; },
      withFailureHandler: function (f) { fail = f; return api; },
      api_login: function () { setTimeout(function () { ok('tok'); }, 50); },
      api_getData: function () { setTimeout(function () { ok(JSON.parse(JSON.stringify(__data))); }, 50); },
      api_updateLead: function (t, id, ch) { setTimeout(function () {
        var l = __data.leads.filter(function (x) { return x.id === id; })[0]; Object.assign(l, ch); ok(JSON.parse(JSON.stringify(l))); }, 50); },
      api_saveTemplate: function (t, k, v) { setTimeout(function () { if (v !== null) __data.templates[k] = v; ok(__data.templates); }, 50); }
    };
    return api;
  } } };
</script>`;
// HtmlService adds the viewport tag on the live site (Code.js addMetaTag); mirror it here.
let html = src('Index.html')
  .replace('<base target="_top">', '<base target="_top"><meta name="viewport" content="width=device-width, initial-scale=1">')
  .replace("<?!= include('Styles'); ?>", src('Styles.html'))
  .replace("<?!= include('App'); ?>", mock + src('App.html'));
const out = path.join(process.env.IBARRA_DATA || path.join(__dirname, '../../data'), 'preview');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('wrote', path.join(out, 'index.html'), 'leads:', data.leads.length);
