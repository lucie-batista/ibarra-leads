/**
 * Passcode protection for the web app. Only a salted SHA-256 hash is stored
 * (Script Properties PASSCODE_HASH / PASSCODE_SALT). To set or change the
 * passcode, add a Script Property PASSCODE_NEW with the plain passcode; the
 * next page load hashes it and deletes PASSCODE_NEW.
 * Sessions are random tokens kept in CacheService for 6 hours.
 */

var SESSION_SECONDS = 6 * 60 * 60;
var MAX_FAILS = 10, FAIL_WINDOW_SECONDS = 15 * 60;

function hashPasscode_(salt, passcode) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + passcode, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/** Turn a pending PASSCODE_NEW into a stored hash. Safe to call often. */
function applyPendingPasscode_() {
  var props = PropertiesService.getScriptProperties();
  var plain = props.getProperty('PASSCODE_NEW');
  if (!plain) return;
  var salt = Utilities.getUuid();
  props.setProperties({ PASSCODE_SALT: salt, PASSCODE_HASH: hashPasscode_(salt, String(plain).trim()) });
  props.deleteProperty('PASSCODE_NEW');
}

function passcodeIsSet_() {
  return !!PropertiesService.getScriptProperties().getProperty('PASSCODE_HASH');
}

/** Returns a session token, or throws a friendly error. */
function api_login(passcode) {
  applyPendingPasscode_();
  var props = PropertiesService.getScriptProperties();
  var hash = props.getProperty('PASSCODE_HASH'), salt = props.getProperty('PASSCODE_SALT');
  if (!hash) throw new Error('No passcode has been set up yet. See the handoff guide.');
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('login_fails') || 0);
  if (fails >= MAX_FAILS) throw new Error('Too many wrong attempts. Please wait 15 minutes and try again.');
  if (hashPasscode_(salt, String(passcode || '').trim()) !== hash) {
    cache.put('login_fails', String(fails + 1), FAIL_WINDOW_SECONDS);
    Utilities.sleep(1000);
    throw new Error('Wrong passcode.');
  }
  var token = Utilities.getUuid();
  cache.put('session_' + token, '1', SESSION_SECONDS);
  return token;
}

function requireSession_(token) {
  if (!token || !CacheService.getScriptCache().get('session_' + token)) {
    throw new Error('SESSION_EXPIRED');
  }
}
