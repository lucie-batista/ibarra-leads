/** Web app entry point and HTML helpers (UI side). */
function doGet() {
  applyPendingPasscode_();
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Ibarra Leads')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
