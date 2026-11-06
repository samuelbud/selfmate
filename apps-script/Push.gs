/**
 * SelfMate: evening reminder as a real phone notification (Web Push).
 * ------------------------------------------------------------
 * How it works:
 *  1. The 🌱 home-screen app (GitHub Pages) asks the phone for a push address and sends it here (doGet ?push=sub).
 *  2. Every 15 minutes pushTick() checks who is due (their evening time, not rated today) and sends an EMPTY push
 *     to Google's / Mozilla's push service. Nothing about you is in the push itself.
 *  3. The phone wakes the home-screen app, which asks this script for tonight's line (?push=line) and shows it.
 * The push is signed with a key pair made here once (VAPID, ES256), kept in the script's hidden properties.
 * Apps Script has no elliptic-curve signing, so the small P-256 routine below does it with BigInt.
 */

// ---------- P-256 (secp256r1) ECDSA, just enough to sign a token ----------
// Apps Script's code checker rejects BigInt literals (0n), so the small numbers are made once here.
const N0_ = BigInt(0), N1_ = BigInt(1), N2_ = BigInt(2), N3_ = BigInt(3), N4_ = BigInt(4), N8_ = BigInt(8), N255_ = BigInt(255);
const EC_ = {
  p: BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff'),
  n: BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551'),
  b: BigInt('0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b'),
  gx: BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'),
  gy: BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5'),
};
function ecMod_(a, m) { const r = a % m; return r < N0_ ? r + m : r; }
function ecInv_(a, m) {   // extended Euclid
  let [r0, r1, s0, s1] = [ecMod_(a, m), m, N1_, N0_];
  while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; }
  return ecMod_(s0, m);
}
// Points in Jacobian coordinates [X, Y, Z] (x = X/Z², y = Y/Z³), so no division until the end. a = -3 for P-256.
function ecDouble_(P) {
  const p = EC_.p, [X, Y, Z] = P;
  if (!Y) return [N0_, N1_, N0_];
  const d = ecMod_(Y * Y, p), s = ecMod_(N4_ * X * d, p), zz = ecMod_(Z * Z, p);
  const m = ecMod_(N3_ * (X - zz) * (X + zz), p), x3 = ecMod_(m * m - N2_ * s, p);
  return [x3, ecMod_(m * (s - x3) - N8_ * d * d, p), ecMod_(N2_ * Y * Z, p)];
}
function ecAdd_(P, Q) {
  const p = EC_.p;
  if (!P[2]) return Q;
  if (!Q[2]) return P;
  const z1 = ecMod_(P[2] * P[2], p), z2 = ecMod_(Q[2] * Q[2], p);
  const u1 = ecMod_(P[0] * z2, p), u2 = ecMod_(Q[0] * z1, p);
  const s1 = ecMod_(P[1] * z2 * Q[2], p), s2 = ecMod_(Q[1] * z1 * P[2], p);
  if (u1 === u2) return s1 === s2 ? ecDouble_(P) : [N0_, N1_, N0_];
  const h = ecMod_(u2 - u1, p), r = ecMod_(s2 - s1, p), hh = ecMod_(h * h, p), hhh = ecMod_(h * hh, p);
  const x3 = ecMod_(r * r - hhh - N2_ * u1 * hh, p);
  return [x3, ecMod_(r * (u1 * hh - x3) - s1 * hhh, p), ecMod_(h * P[2] * Q[2], p)];
}
function ecMul_(k) {   // k × G, returned as affine [x, y]
  let R = [N0_, N1_, N0_], A = [EC_.gx, EC_.gy, N1_];
  for (; k > N0_; k >>= N1_) { if (k & N1_) R = ecAdd_(R, A); A = ecDouble_(A); }
  const zi = ecInv_(R[2], EC_.p), zi2 = ecMod_(zi * zi, EC_.p);
  return [ecMod_(R[0] * zi2, EC_.p), ecMod_(R[1] * zi2 * zi, EC_.p)];
}

// ---------- bytes ----------
// Apps Script bytes are Java bytes (-128..127); these helpers work with plain 0..255 arrays.
const u8_ = bytes => bytes.map(b => b & 255);
const s8_ = bytes => bytes.map(b => (b > 127 ? b - 256 : b));
function bigToBytes_(n, len) { const out = []; for (let i = 0; i < len; i++) { out.unshift(Number(n & N255_)); n >>= N8_; } return out; }
function bytesToBig_(a) { return a.reduce((n, b) => (n << N8_) | BigInt(b & 255), N0_); }
const b64u_ = bytes => Utilities.base64EncodeWebSafe(s8_(bytes)).replace(/=+$/, '');
const b64uText_ = s => Utilities.base64EncodeWebSafe(s, Utilities.Charset.UTF_8).replace(/=+$/, '');
const sha256_ = bytes => u8_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s8_(bytes)));
const hmac_ = (key, msg) => u8_(Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, s8_(msg), s8_(key)));

// Deterministic nonce (RFC 6979): no random number generator needed, and the same message never leaks the key.
function ecSign_(msgBytes, d) {
  const n = EC_.n, h = sha256_(msgBytes), x = bigToBytes_(d, 32), h1 = bigToBytes_(ecMod_(bytesToBig_(h), n), 32);
  let V = new Array(32).fill(1), K = new Array(32).fill(0);
  K = hmac_(K, V.concat([0], x, h1)); V = hmac_(K, V);
  K = hmac_(K, V.concat([1], x, h1)); V = hmac_(K, V);
  const e = bytesToBig_(h);
  for (;;) {
    V = hmac_(K, V);
    const k = bytesToBig_(V);
    if (k > N0_ && k < n) {
      const r = ecMod_(ecMul_(k)[0], n);
      const s = ecMod_(ecInv_(k, n) * (e + r * d), n);
      if (r && s) return bigToBytes_(r, 32).concat(bigToBytes_(s, 32));   // JWT wants r‖s, 64 bytes
    }
    K = hmac_(K, V.concat([0])); V = hmac_(K, V);
  }
}

// The key pair, made once. Java's UUIDs come from a secure random source; hashing three gives 256 random bits.
function vapidKeys_() {
  let d = prop_('VAPID_D');
  if (!d) {
    let k = N0_;
    while (!k || k >= EC_.n) k = bytesToBig_(sha256_(Utilities.newBlob(Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid()).getBytes()));
    const pub = ecMul_(k);
    setProp_('VAPID_D', k.toString(16));
    setProp_('VAPID_PUB', b64u_([4].concat(bigToBytes_(pub[0], 32), bigToBytes_(pub[1], 32))));
    d = prop_('VAPID_D');
  }
  return { d: BigInt('0x' + d), pub: prop_('VAPID_PUB') };
}
function vapidJwt_(endpoint) {
  const keys = vapidKeys_(), aud = endpoint.match(/^https:\/\/[^/]+/)[0];
  const body = b64uText_(JSON.stringify({ typ: 'JWT', alg: 'ES256' })) + '.' +
    b64uText_(JSON.stringify({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:' + Session.getEffectiveUser().getEmail() }));
  return { jwt: body + '.' + b64u_(ecSign_(u8_(Utilities.newBlob(body).getBytes()), keys.d)), pub: keys.pub };
}

// ---------- subscriptions (one list per person, at most 5 phones each) ----------
// Only real push services: the server never posts to any other address a phone might send.
const PUSH_HOSTS = /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[\w.-]+\.notify\.windows\.com|web\.push\.apple\.com)\//;
const subsOf_ = role => JSON.parse(prop_('PUSH_' + role) || '[]');
function saveSubs_(role, list) { setProp_('PUSH_' + role, JSON.stringify(list.slice(-5))); }

// Send an empty push to every phone of this person. Returns how many accepted it; dead addresses are forgotten.
function pushTo_(role) {
  const subs = subsOf_(role), alive = [];
  let ok = 0;
  subs.forEach(s => {
    const v = vapidJwt_(s.endpoint);
    let code = 0;
    try {
      code = UrlFetchApp.fetch(s.endpoint, { method: 'post', muteHttpExceptions: true, payload: '',
        headers: { TTL: '7200', Urgency: 'normal', Authorization: 'vapid t=' + v.jwt + ', k=' + v.pub } }).getResponseCode();
    } catch (e) { code = 0; }
    if (code === 404 || code === 410) return;   // the phone dropped this address (app removed, permission off)
    alive.push(s);
    if (code >= 200 && code < 300) ok++;
  });
  if (alive.length !== subs.length) saveSubs_(role, alive);
  return ok;
}

// ---------- the evening reminder ----------
const moodKey_ = (role, k) => (role === 'owner' ? '' : 'Partner') + k;   // MoodTime / PartnerMoodTime …
function moodPrefs_(role, s) {
  const t = String(s[moodKey_(role, 'MoodTime')] || '');
  return { time: /^\d{1,2}:\d{2}$/.test(t) ? ('0' + t).slice(-5) : '21:00', on: s[moodKey_(role, 'MoodPush')] !== 'off' };
}
function ratedOn_(role, day) { return read_('Mood').some(m => m.Date === day && (m.Owner || 'owner') === role); }

function pushTick() {
  const s = settings_(), now = new Date(), today = iso_(now), hm = Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm');
  ['owner', 'partner'].forEach(role => {
    if (!subsOf_(role).length) return;
    const pref = moodPrefs_(role, s), snooze = Number(prop_('PUSH_SNOOZE_' + role) || 0);
    const due = snooze ? Date.now() >= snooze : pref.on && hm >= pref.time && prop_('PUSH_SENT_' + role) !== today;
    if (!due) return;
    setProp_('PUSH_SNOOZE_' + role, '0');
    setProp_('PUSH_SENT_' + role, today);
    if (!ratedOn_(role, today)) pushTo_(role);
  });
}
function ensurePushTrigger_() {
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'pushTick'))
    ScriptApp.newTrigger('pushTick').timeBased().everyMinutes(15).create();
}

// Tonight's line: a different one each day, from the Lines tab (edit them in the app or the Sheet).
function lineOfDay_(role, day) {
  const lines = read_('Lines').map(l => String(l.Line || '').trim()).filter(Boolean);
  if (!lines.length) return '';
  const p = day.split('-').map(Number), n = Math.floor(Date.UTC(p[0], p[1] - 1, p[2]) / 864e5) + (role === 'owner' ? 0 : 7);   // same count as the app
  return lines[n % lines.length];
}
function notice_(role) {
  const s = settings_(), name = s[role === 'owner' ? 'OwnerName' : 'PartnerName'], today = iso_(new Date());
  return { title: '🌙 How was your day' + (name ? ', ' + name : '') + '?', body: lineOfDay_(role, today), rated: ratedOn_(role, today) };
}

// Called by the home-screen app (doGet ?push=…&k=<private link key>). Answers in JSON.
// A script error comes back as a Google error page the home-screen app isn't allowed to read, which the phone only
// reports as "Failed to fetch". So every error goes back as an answer the app can read and show.
const pushOut_ = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
function pushApi_(p) {
  try { return pushOut_(pushAnswer_(auth_(p.k), p)); } catch (e) { return pushOut_({ error: 'SelfMate could not do that: ' + (e.message || e) }); }
}
// After publishing: tools/check-live.js. Runs each step and says which one fails. Returns no personal data and no secrets.
function pushCheck_() {
  const steps = { keys: () => !!vapidKeys_().pub, sign: () => !!vapidJwt_('https://fcm.googleapis.com/check').jwt, triggers: () => ScriptApp.getProjectTriggers().length >= 0, lock: () => { const l = LockService.getScriptLock(); l.waitLock(20000); l.releaseLock(); return true; } };
  const res = {};
  Object.keys(steps).forEach(k => { const t = Date.now(); try { res[k] = { ok: steps[k](), ms: Date.now() - t }; } catch (e) { res[k] = { ok: false, ms: Date.now() - t, error: String(e.message || e).slice(0, 200) }; } });
  return pushOut_(res);
}
function pushAnswer_(who, p) {
  if (!who) return { error: 'This link is not valid' };
  if (p.push === 'key') return { key: vapidKeys_().pub };
  if (p.push === 'line') return notice_(who.role);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (p.push === 'sub' || p.push === 'unsub') {
      const sub = JSON.parse(p.sub || '{}');
      if (!PUSH_HOSTS.test(String(sub.endpoint || ''))) return { error: 'Unknown push service' };
      const list = subsOf_(who.role).filter(x => x.endpoint !== sub.endpoint);
      if (p.push === 'sub') { list.push({ endpoint: sub.endpoint, at: iso_(new Date()) }); ensurePushTrigger_(); }
      saveSubs_(who.role, list);
      return { ok: true, devices: subsOf_(who.role).length };
    }
    if (p.push === 'snooze') { setProp_('PUSH_SNOOZE_' + who.role, String(Date.now() + 60 * 60000)); return { ok: true }; }
  } finally {
    lock.releaseLock();
  }
  return { error: 'Unknown request' };
}

// Starter lines for the evening notification. Short thoughts, not advice; replace them with your own any time.
const SEED_LINES = [
  'The rear-view mirror is small and the windscreen is big for a reason. Glance back, then look ahead.',
  'An arrow only flies once you let it go. Whatever held you back today is part of the aim.',
  'You do not have to feel ready. You only have to start small.',
  'Rest is part of the work, not a break from it.',
  'One honest minute with yourself counts.',
  'Seeds look like nothing for a while. Then they don\'t.',
  'A bad day is one day, not a direction.',
  'You can be proud of today and still want more from tomorrow.',
  'Small steps still cover the whole road.',
  'Slow progress is still progress. Standing still is a choice too.',
  'The view from the top needs the climb. Today was some of the climb.',
  'Tired is information, not failure.',
  'Habits are votes for who you want to be. One small vote counts.',
  'The best time to plant a tree was years ago. The second best is tonight.',
  'Nobody waters a garden once. Same with you.',
  'Say one kind thing to yourself before you sleep.',
  'Done is often kinder than perfect.',
  'Missing once is life. Missing twice is a pattern. Tomorrow is a fresh page.',
  'Calm water shows the sky. Give your mind a quiet minute.',
  'A rope gets stronger with every strand. So do habits.',
  'Mountains are climbed one step at a time, and so are weeks.',
  'You can\'t pour from an empty cup. What filled yours today?',
  'Even the moon has phases. You are allowed to have them too.',
  'Notice one good thing from today, however small.',
  'Waves come back. So does your energy.',
  'Tomorrow does not need all of you. It needs the next step.',
  'Clouds move. They always do.',
  'Every expert was once a beginner who kept going.',
  'Light a candle instead of counting the dark.',
  'A ship is safe in the harbour, but that is not what ships are for.',
  'You are not behind. You are on your own road.',
  'The roots grow when nobody is watching.',
  'Energy follows attention. Where did yours go today?',
  'It\'s a good day to be gentle with yourself.',
  'Big doors swing on small hinges. Small choices count.',
  'Stars need the dark to shine. Rough days have their place too.',
  'You showed up today. That matters.',
  'Breathe out longer than you breathe in. Then rate your day.',
  'Every sunset is also a promise of a sunrise.',
  'What would you tell a friend who had your day?',
];
