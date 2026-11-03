/**
 * SelfMate: server code (Google Apps Script)
 * ------------------------------------------------------------
 * All your data lives in the Google Sheet this script belongs to.
 * You never need to edit this file to change your data: edit the
 * Sheet tabs (Dates, Categories, Rules, Goals...) directly.
 *
 * Useful functions you can run from the Apps Script editor
 * (pick the name in the toolbar dropdown, then press ▶ Run):
 *   setup()             create missing tabs, links, calendars, triggers
 *   showMyLinks()       print your private link and your partner's link
 *   resetPartnerLink()  make a new partner link (the old one stops working)
 *   syncCalendar()      push all dates to Google Calendar now
 *   sendWeeklySummary() send the Sunday email now (to test it)
 */

// ---------- Sheet structure ----------
const TABS = {
  Settings:     ['Key', 'Value', 'Notes'],
  Dates:        ['Title', 'Area', 'Due', 'RepeatMonths', 'Cost', 'Private', 'LastDone', 'Notes', 'EventId'],
  Categories:   ['Group', 'Category', 'Emoji', 'Type', 'MonthlyTarget'],
  Rules:        ['Match', 'Category'],
  // Trip = the trip this payment belongs to (flights, hotels, everything paid while away)
  Transactions: ['Date', 'Amount', 'Currency', 'Merchant', 'Category', 'Account', 'Source', 'Note', 'Hash', 'Person', 'Trip'],
  Goals:        ['Goal', 'Emoji', 'Target', 'Saved'],
  // Hobbies (the Sheet tabs keep their first names: Projects, Tasks, Items, ProjectLog).
  // Owner = whose hobby it is (owner | partner): hobbies are personal, each link sees only its own.
  // Tools = what this hobby tracks, comma separated: time, money, journal, count, distance, tasks, parts.
  // CountName = what you count (e.g. "loaves"). Category = money category whose bank payments belong to it.
  Projects:     ['Project', 'Emoji', 'Budget', 'Status', 'Started', 'Owner', 'Tools', 'CountName', 'Category'],
  Tasks:        ['Project', 'Phase', 'Task', 'Status', 'Owner'],
  Items:        ['Project', 'Item', 'Price', 'Shop', 'Bought', 'Date', 'Qty', 'Category', 'Link', 'Notes', 'Owner'],
  // Photo / Thumb = Google Drive file ids (folder "SelfMate photos" in the owner's Drive)
  ProjectLog:   ['Date', 'Project', 'Type', 'Hours', 'Km', 'Cost', 'Note', 'Count', 'Photo', 'Thumb', 'Owner'],
  Invoices:     ['Number', 'Date', 'Client', 'Amount', 'PaidOn', 'Notes'],
  SrlMonths:    ['Month', 'Balance', 'Revenue', 'Costs', 'Plan', 'Notes'],   // Plan = yes for forecast rows
  SrlCosts:     ['Date', 'Amount', 'Item', 'Type'],
  // Countries = ISO codes visited on this trip ("GR,IT"). Who went: both | owner | partner (empty = both; private trips = owner).
  // Approx: empty = exact dates; month / year = an old trip you only remember roughly (Start = first day of that month/year).
  Trips:        ['Trip', 'Emoji', 'Start', 'End', 'Budget', 'Private', 'Notes', 'Countries', 'Who', 'Approx'],
  // Type: plan (itinerary) | booking (tickets, hotels) | todo | pack | stop (a place on the route: Title = place, Notes = what you did)
  //       | extra (a cost that is not in any bank import: cash, paid by someone else, remembered)
  TripItems:    ['Trip', 'Type', 'Date', 'Time', 'Title', 'Cost', 'Done', 'Notes'],
  // Countries you have been to, marked by hand (trips add theirs automatically). Personal: each link has its own map.
  Countries:    ['Country', 'Owner', 'Years', 'Notes'],
  // Kind: cash | savings | investment. Amounts you update by hand (cash at home, EUR, savings accounts...)
  Balances:     ['Name', 'Emoji', 'Amount', 'Currency', 'Kind', 'Updated'],
};
// Home-screen / browser icon (Microsoft Fluent 3D emoji "Seedling", free to use under the MIT licence)
const ICON_URL = 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Seedling/3D/seedling_3d.png';
const PRIVATE_TABS =['Invoices', 'SrlMonths', 'SrlCosts'];
const HOBBY_TABS = ['Projects', 'Tasks', 'Items', 'ProjectLog'];   // personal: each row belongs to one person
const PERSONAL_TABS = HOBBY_TABS.concat(['Countries']);   // rows with an Owner: each link sees and changes only its own
const EDITABLE_TABS = ['Dates', 'Transactions', 'Goals', 'Categories', 'Rules', 'Trips', 'TripItems', 'Balances'].concat(PRIVATE_TABS, PERSONAL_TABS);
const DELETABLE_TABS = ['Goals', 'Balances', 'ProjectLog', 'Countries', 'TripItems'];   // rows you can remove from the app (everything else: delete in the Sheet)
const BIG_PROJECT_TOOLS = 'time,money,journal,distance,tasks,parts';
const DATE_COLS = ['Due', 'LastDone', 'Date', 'Started', 'PaidOn', 'Start', 'End', 'Updated'];
const PARTNER_SETTINGS = ['LastCheckin'];

// ---------- Starter data (edit freely in the Sheet afterwards) ----------
const SEED = {
  Settings: () => [
    ['MonthlyIncome', 0, 'Your net monthly salary in lei'],
    ['MonthlySavings', 0, 'What goes automatically to savings/goals on payday'],
    ['OwnerEmail', Session.getEffectiveUser().getEmail(), 'Gets the full weekly email'],
    ['PartnerEmail', '', 'Gets the household weekly email (leave empty for none)'],
    ['SrlTaxPotPct', 1, '% of each SRL invoice to set aside (micro tax with employee: 1%, confirm with accountant)'],
    ['HabitStart', new Date(), 'Day you started the Sunday check-in habit'],
    ['LastCheckin', '', 'Filled in by the app'],
  ],
  Dates: () => {
    const d = (y, m, day) => new Date(y, m - 1, day);
    // Title, Area, Due, RepeatMonths, Cost, Private, LastDone, Notes
    return [
      ['Rovinieta: Car 1', 'Car', '', 12, '', '', '', 'Set the date from your last purchase'],
      ['RCA: Car 1', 'Car', '', 12, '', '', '', 'Compare 3 offers 30 days before'],
      ['ITP: Car 1', 'Car', '', 24, '', '', '', 'Interval depends on car age'],
      ['Service: Car 1', 'Car', '', 12, '', '', '', ''],
      ['Rovinieta: Car 2', 'Car', '', 12, '', '', '', 'Rename "Car 2" to your car'],
      ['RCA: Car 2', 'Car', '', 12, '', '', '', ''],
      ['ITP: Car 2', 'Car', '', 24, '', '', '', ''],
      ['RCA: Motorbike', 'Car', '', 12, '', '', '', 'Rename or delete this row if not needed'],
      ['ITP: Motorbike', 'Car', '', 24, '', '', '', ''],
      ['Winter tyres', 'Car', d(2026, 11, 15), 12, '', '', '', ''],
      ['Summer tyres', 'Car', d(2027, 4, 15), 12, '', '', '', ''],
      ['Impozite locale: tranșa 1 (clădiri, teren, auto)', 'Taxes', d(2027, 3, 31), 12, '', '', '', 'Pay the full year by 31 March for the discount'],
      ['Impozite locale: tranșa 2', 'Taxes', d(2027, 9, 30), 12, '', '', '', ''],
      ['Declarația unică', 'Taxes', d(2027, 5, 25), 12, '', '', '', 'If you have income besides salary (dividends: check CASS)'],
      ['Formular 230: 3.5% to an NGO', 'Taxes', d(2027, 5, 25), 12, '', '', '', 'Free: redirects part of your income tax'],
      ['PAD home insurance', 'Home', '', 12, '', '', '', 'Mandatory for owned homes'],
      ['Home insurance (optional)', 'Home', '', 12, '', '', '', ''],
      ['Verificare instalație gaze', 'Home', '', 24, '', '', '', ''],
      ['Revizie centrală (ISCIR)', 'Home', '', 24, '', '', '', ''],
      ['Autocitire index (curent/gaz/apă)', 'Home', d(2026, 11, 20), 1, '', '', '', 'Check your supplier\'s reading window'],
      ['Întreținere (asociație)', 'Home', '', 1, '', '', '', ''],
      ['Rental contract end', 'Home', '', 0, '', '', '', 'Only if you rent'],
      ['Electricity contract end', 'Home', '', 0, '', '', '', 'Renegotiate or switch'],
      ['Gas contract end', 'Home', '', 0, '', '', '', ''],
      ['Internet / phone contract end', 'Home', '', 0, '', '', '', ''],
      ['CI expiry: me', 'Documents', '', 0, '', '', '', 'Original kept: ...'],
      ['CI expiry: partner', 'Documents', '', 0, '', '', '', ''],
      ['Passport expiry', 'Documents', '', 0, '', '', '', ''],
      ['Driving licence (permis) expiry', 'Documents', '', 0, '', '', '', ''],
      ['Dentist check-up', 'Health', '', 6, '', '', '', ''],
      ['Analize anuale', 'Health', '', 12, '', '', '', ''],
      ['Eye test', 'Health', '', 24, '', '', '', ''],
      ['Life / health insurance renewal', 'Insurance', '', 12, '', '', '', ''],
      ['Pilon III pension: yearly statement', 'Insurance', '', 12, '', '', '', ''],
      ['Partner birthday', 'People', '', 12, '', '', '', ''],
      ['Anniversary', 'People', '', 12, '', '', '', ''],
      ['Yearly backup: File → Download → Excel', 'Digital', d(2027, 1, 10), 12, '', '', '', 'Save it somewhere safe'],
      // Private (only you): SRL and business
      ['D112: salaries declaration', 'SRL', d(2026, 11, 25), 1, '', 'yes', '', 'Accountant files it; check it is done'],
      ['Send documents to accountant', 'SRL', d(2026, 11, 10), 1, '', 'yes', '', 'Invoices, bank statement, receipts'],
      ['D100: micro tax (quarterly)', 'SRL', d(2027, 1, 25), 3, '', 'yes', '', ''],
      ['Situații financiare anuale (bilanț)', 'SRL', d(2027, 5, 29), 12, '', 'yes', '', 'Deadline: confirm with accountant (sources say 120–150 days)'],
      ['Company website domain', 'Digital', '', 12, '', 'yes', '', 'Check at your registrar'],
      ['Company website hosting', 'Digital', '', 12, '', 'yes', '', ''],
    ];
  },
  // v2: merged with the categories from the old Monitorizare_Financiara file (20 spending categories)
  Categories: () => [
    ['🏠 Home', 'Rent / Mortgage', '🏠', 'fixed', 0],
    ['🏠 Home', 'Utilities & bills', '💡', 'fixed', 0],
    ['🏠 Home', 'Home & household', '🧴', 'flex', 0],
    ['🍽 Food', 'Groceries', '🛒', 'flex', 0],
    ['🍽 Food', 'Eating out', '🍕', 'flex', 0],
    ['🍽 Food', 'Coffee', '☕', 'flex', 0],
    ['🚗 Transport', 'Fuel', '⛽', 'flex', 0],
    ['🚗 Transport', 'Car costs', '🚗', 'pot', 0],
    ['🚗 Transport', 'Public transport & taxi', '🚕', 'flex', 0],
    ['❤️ Health & people', 'Health', '💊', 'flex', 0],
    ['❤️ Health & people', 'Gifts', '🎁', 'flex', 0],
    ['🎉 Fun', 'Going out', '🎉', 'flex', 0],
    ['🎉 Fun', 'Sport & hobbies', '🏃', 'flex', 0],
    ['🎉 Fun', 'Travel', '✈️', 'flex', 0],
    ['🎉 Fun', 'Subscriptions', '📺', 'fixed', 0],
    ['👤 Personal', 'Personal: me', '👤', 'flex', 0],
    ['👤 Personal', 'Personal: partner', '👤', 'flex', 0],
    ['💰 Money', 'Savings', '💰', 'savings', 0],
    ['💰 Money', 'Taxes & fees', '🧾', 'pot', 0],
    ['💰 Money', 'Other', '📦', 'flex', 0],
    ['💰 Money', 'Unsorted', '❓', 'flex', 0],
    ['— System', 'Income', '💵', 'income', 0],
    ['— System', 'Transfers', '🔁', 'ignore', 0],
    ['— System', 'Campervan project', '🚐', 'project', 0],
  ],
  Rules: () => [
    ['KAUFLAND', 'Groceries'], ['LIDL', 'Groceries'], ['MEGA IMAGE', 'Groceries'], ['CARREFOUR', 'Groceries'],
    ['PROFI', 'Groceries'], ['PENNY', 'Groceries'], ['AUCHAN', 'Groceries'], ['SELGROS', 'Groceries'],
    ['BOLT FOOD', 'Eating out'], ['GLOVO', 'Eating out'], ['TAZZ', 'Eating out'], ['WOLT', 'Eating out'],
    ['MCDONALD', 'Eating out'], ['KFC', 'Eating out'], ['STARBUCKS', 'Coffee'],
    ['UBER', 'Public transport & taxi'], ['BOLT', 'Public transport & taxi'], ['STB', 'Public transport & taxi'],
    ['METROREX', 'Public transport & taxi'], ['CFR', 'Public transport & taxi'], ['CTP', 'Public transport & taxi'],
    ['PANEMAR', 'Groceries'], ['BONAPP', 'Eating out'], ['5 TO GO', 'Coffee'], ['TUCANO', 'Coffee'], ['FIDELIS', 'Savings'],
    ['OMV', 'Fuel'], ['PETROM', 'Fuel'], ['MOL ', 'Fuel'], ['ROMPETROL', 'Fuel'], ['LUKOIL', 'Fuel'], ['SOCAR', 'Fuel'],
    ['ENEL', 'Utilities & bills'], ['ENGIE', 'Utilities & bills'], ['E.ON', 'Utilities & bills'], ['ELECTRICA', 'Utilities & bills'],
    ['HIDROELECTRICA', 'Utilities & bills'], ['PPC', 'Utilities & bills'], ['DIGI', 'Utilities & bills'], ['ORANGE', 'Utilities & bills'],
    ['VODAFONE', 'Utilities & bills'], ['APA NOVA', 'Utilities & bills'],
    ['NETFLIX', 'Subscriptions'], ['SPOTIFY', 'Subscriptions'], ['YOUTUBE', 'Subscriptions'],
    ['APPLE.COM', 'Subscriptions'], ['GOOGLE', 'Subscriptions'], ['HBO', 'Subscriptions'], ['DISNEY', 'Subscriptions'],
    ['DEDEMAN', 'Home & household'], ['LEROY MERLIN', 'Home & household'], ['HORNBACH', 'Home & household'],
    ['BRICO', 'Home & household'], ['IKEA', 'Home & household'],
    ['CATENA', 'Health'], ['DR. MAX', 'Health'], ['DR MAX', 'Health'], ['HELP NET', 'Health'], ['SENSIBLU', 'Health'],
    ['REGINA MARIA', 'Health'], ['MEDLIFE', 'Health'],
    ['DM DROGERIE', 'Home & household'], ['DECATHLON', 'Sport & hobbies'],
    ['TOP-UP', 'Transfers'], ['EXCHANGE', 'Transfers'], ['TRANSFER INTRE CONTURI', 'Transfers'],
    ['ROVINIETA', 'Car costs'], ['ERovinieta', 'Car costs'], ['GHISEUL', 'Taxes & fees'],
  ],
  Goals: () => [
    ['Emergency buffer (1 month of costs)', '🛟', 0, 0],
    ['Yearly bills pot', '📆', 0, 0],
    ['Holiday', '🏖️', 0, 0],
  ],
  Trips: () => [['Example trip', '✈️', '', '', 0, '', 'Rename it, set dates, or delete this row']],
  TripItems: () => [
    ['todo', 'Check passport/CI valid 6+ months after return'], ['todo', 'Buy travel insurance'],
    ['todo', 'Tell the bank / check card works abroad'], ['todo', 'Download offline maps'],
    ['booking', 'Flights'], ['booking', 'Accommodation'], ['booking', 'Airport transfer / parking'],
    ['pack', 'Passport / CI'], ['pack', 'Cards + some cash'], ['pack', 'Phone charger + power bank'],
    ['pack', 'Medicines'], ['pack', 'Toiletries'], ['pack', 'Travel adapter'],
  ].map(i => ['Example trip', i[0], '', '', i[1], '', '', '']),
  Balances: () => [
    ['Cash at home', '💵', 0, 'RON', 'cash', ''],
    ['Cash in EUR', '💶', 0, 'EUR', 'cash', ''],
    ['Savings account', '🏦', 0, 'RON', 'savings', ''],
  ],
};

// ---------- Web app entry ----------
function doGet(e) {
  const p = (e && e.parameter) || {};
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('OWNER_KEY')) return firstRun_();
  // The owner opening the plain link (no key) gets their links shown again.
  if (!p.k && isOwnerVisiting_()) return linksPage_('🔑 Your SelfMate links');
  if (!auth_(p.k)) {
    return HtmlService.createHtmlOutput('<div style="font-family:sans-serif;padding:24px"><h2>This link is not valid</h2>' +
      '<p>Ask the owner for a new SelfMate link.</p></div>').addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  const t = HtmlService.createTemplateFromFile('Index');
  t.key = p.k;
  return t.evaluate()
    .setTitle('SelfMate')
    .setFaviconUrl(ICON_URL)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
}

// The very first time the owner opens the app, set everything up and show the links once.
function firstRun_() {
  setup();
  return linksPage_('✅ SelfMate is set up');
}

function isOwnerVisiting_() {
  const me = Session.getEffectiveUser().getEmail();
  return !!me && Session.getActiveUser().getEmail() === me;
}

function linksPage_(title) {
  const l = links_();
  return HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;padding:24px;line-height:1.5"><h2>' + title + '</h2>' +
    '<p><b>Your private link</b> (add it to your home screen):<br><a href="' + l.owner + '" target="_top">' + l.owner + '</a></p>' +
    '<p><b>Partner link</b> (household only, send it to your partner):<br><span style="word-break:break-all">' + l.partner + '</span></p>' +
    '<p>Each link also needs a PIN. You create yours when you first open your link; set your partner\'s PIN in ⚙️. ' +
    'Keep the links private anyway. To see them again, open the plain app link while signed in to this Google account.</p></div>'
  ).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------- One-time / maintenance functions ----------
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(prop_('SHEET_ID') || SHEET_ID);
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SHEET_ID', ss.getId());
  ensureTabs_(ss);
  ['Sheet1', 'Foaie1'].forEach(n => { const s = ss.getSheetByName(n); if (s && ss.getSheets().length > 1) ss.deleteSheet(s); });
  ['OWNER_KEY', 'PARTNER_KEY'].forEach(k => { if (!props.getProperty(k)) props.setProperty(k, newKey_()); });
  calendar_('CAL_SHARED', 'SelfMate');
  calendar_('CAL_PRIVATE', 'SelfMate (private)');
  installTriggers_();
  syncCalendar();
  showMyLinks();
}

// Create missing tabs (with starter data) and add missing columns to existing tabs.
function ensureTabs_(ss) {
  Object.keys(TABS).forEach(name => {
    const head = TABS[name];
    let sh = ss.getSheetByName(name);
    if (sh) {
      const have = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
      const missing = head.filter(h => !have.includes(h));
      if (missing.length) sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#e8eefc');
      return;
    }
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e8eefc');
    sh.setFrozenRows(1);
    if (name === 'SrlMonths') sh.getRange('A:A').setNumberFormat('@'); // keep "2025-10" as text, not a date
    const seed = SEED[name] ? SEED[name]() : [];
    if (seed.length) sh.getRange(2, 1, seed.length, head.length).setValues(seed.map(r => pad_(r, head.length)));
    sh.autoResizeColumns(1, head.length);
  });
}

// Runs automatically when the owner opens the app: structure upgrades + one-time history import.
// All one-time import files present in the project (each is a generated .gs file).
function imports_() {
  const list = [];
  if (typeof IMPORT_HISTORY !== 'undefined') list.push(Object.assign({ name: 'Old file (Monitorizare_Financiara)', prefix: 'old|' }, IMPORT_HISTORY));
  if (typeof IMPORT_BANK !== 'undefined') list.push(Object.assign({ name: 'Bank statements BT + Revolut' }, IMPORT_BANK));
  if (typeof IMPORT_FIXES !== 'undefined') list.push(Object.assign({ name: 'Confirmed corrections' }, IMPORT_FIXES));
  if (typeof IMPORT_TRIPS !== 'undefined') list.push(Object.assign({ name: 'Past trips' }, IMPORT_TRIPS));
  return list;
}

function upgrade_() {
  if (prop_('SCHEMA') === '7' && imports_().every(h => prop_('IMPORTED_' + h.id))) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (!prop_('SCHEMA') || prop_('SCHEMA') < '2') {
      ensureTabs_(ss_());
      mergeCategories_();
      setProp_('SCHEMA', '2');
    }
    if (prop_('SCHEMA') < '3') {
      fixTimeZone_();
      setProp_('SCHEMA', '3');
    }
    if (prop_('SCHEMA') < '4') {
      ensureTabs_(ss_());
      setProp_('SCHEMA', '4');
    }
    if (prop_('SCHEMA') < '5') {
      ensureTabs_(ss_());
      hobbiesFromProjects_();
      setProp_('SCHEMA', '5');
    }
    if (prop_('SCHEMA') < '6') {          // v2.6: payments can belong to a trip; countries map
      ensureTabs_(ss_());
      setProp_('SCHEMA', '6');
    }
    if (prop_('SCHEMA') < '7') {          // v2.7: old trips with only a month or a year
      ensureTabs_(ss_());
      setProp_('SCHEMA', '7');
    }
    imports_().filter(h => !prop_('IMPORTED_' + h.id)).forEach(h => {
      appendRows_('Transactions', h.transactions);
      appendRows_('Items', h.items);
      appendRows_('Tasks', h.tasks);
      appendRows_('Invoices', h.invoices);
      appendRows_('SrlMonths', h.srlMonths);
      appendRows_('SrlCosts', h.srlCosts);
      if (h.recategorize) {             // rows from an earlier import that this one shows are the same money
        read_('Transactions').filter(t => h.recategorize[t.Hash])
          .forEach(t => update_('Transactions', t._row, { Category: h.recategorize[t.Hash][0], Note: h.recategorize[t.Hash][1] }));
      }
      (h.dateUpdates || []).forEach(u => {
        const r = read_('Dates').find(d => d.Title === u[0]);
        if (r) { update_('Dates', r._row, u[1]); syncRow_(r._row); }
      });
      (h.transactionUpdates || []).forEach(u => {
        const t = read_('Transactions').find(x => x.Hash === u[0]);
        if (t) update_('Transactions', t._row, u[1]);
      });
      if (h.trips) {                      // a trip whose name is already in the Sheet is kept as it is
        const have = new Set(read_('Trips').map(t => t.Trip));
        appendRows_('Trips', h.trips.filter(t => !have.has(t[0])));
        appendRows_('TripItems', h.tripItems.filter(i => !have.has(i[0])));
      }
      if (h.tripTags) setColumn_('Transactions', 'Trip', 'Hash', h.tripTags, false);
      setProp_('IMPORTED_' + h.id, new Date().toISOString());
    });
  } finally {
    lock.releaseLock();
  }
}

// v2.5: projects become hobbies. Existing projects keep all their data and get every tool ("Big project").
// Tasks / parts / log rows that point to a project missing from the Projects tab get a hobby row too.
function hobbiesFromProjects_() {
  const have = new Set();
  read_('Projects').forEach(p => {
    have.add(p.Project);
    const v = {};
    if (!p.Owner) v.Owner = 'owner';
    if (!p.Tools) v.Tools = BIG_PROJECT_TOOLS;
    if (!p.Category) { const c = projectCategory_(p.Project); if (c) v.Category = c; }
    if (Object.keys(v).length) update_('Projects', p._row, v);
  });
  ['Tasks', 'Items', 'ProjectLog'].forEach(tab => read_(tab).forEach(r => {
    if (!r.Project || have.has(r.Project)) return;
    have.add(r.Project);
    append_('Projects', { Project: r.Project, Emoji: '🛠️', Budget: 0, Status: 'active', Started: '', Owner: 'owner',
                          Tools: BIG_PROJECT_TOOLS, Category: projectCategory_(r.Project) });
  }));
  const s = settings_();
  if (!s.ProjectsName || s.ProjectsName === 'Projects') setSetting_('ProjectsName', 'Hobbies');
}
// The money category of type "project" whose first word is in the project's name ("Campervan project" <-> "My campervan").
function projectCategory_(name) {
  const c = read_('Categories').find(c => c.Type === 'project' && String(name).toLowerCase().includes(String(c.Category).split(' ')[0].toLowerCase()));
  return c ? c.Category : '';
}

// The Sheet was created in New York time while the script runs in Bucharest time, so every stored
// date sat a few hours before midnight of the previous day. Switch the Sheet to the script's time zone,
// then round every date cell to the nearest midnight and store trip times as plain text.
function fixTimeZone_() {
  const ss = ss_();
  ss.setSpreadsheetTimeZone(Session.getScriptTimeZone());
  SpreadsheetApp.flush();
  // Measure the shift on the imported rows, whose true dates are known exactly.
  let shift = 0;
  if (typeof IMPORT_HISTORY !== 'undefined') {
    const truth = {};
    IMPORT_HISTORY.transactions.forEach(t => truth[t[8]] = t[0]);
    const counts = {};
    read_('Transactions').forEach(t => { if (truth[t.Hash]) { const d = daysBetween_(t.Date, truth[t.Hash]); counts[d] = (counts[d] || 0) + 1; } });
    const keys = Object.keys(counts);
    if (keys.length > 1) {                                     // not one clear shift: change nothing, the Data check will show it
      setProp_('DATE_SHIFT_FIXED', 'NOT FIXED, inconsistent: ' + JSON.stringify(counts));
      return;
    }
    if (keys.length === 1) shift = Number(keys[0]);           // one consistent shift for every row: safe to correct
    setProp_('DATE_SHIFT_FIXED', JSON.stringify(counts));
  }
  Object.keys(TABS).concat(['Settings']).forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return;
    const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    head.forEach((h, j) => {
      const isDate = DATE_COLS.includes(h) || (name === 'Settings' && h === 'Value');
      if (!isDate && h !== 'Time') return;
      const rng = sh.getRange(2, j + 1, sh.getLastRow() - 1, 1);
      if (h === 'Time') {
        const v = rng.getValues().map(r => [r[0] instanceof Date ? Utilities.formatDate(r[0], Session.getScriptTimeZone(), 'HH:mm') : r[0]]);
        rng.setNumberFormat('@').setValues(v);
      } else {
        rng.setValues(rng.getValues().map(r => {
          if (!(r[0] instanceof Date)) return [r[0]];
          const d = dayOf_(r[0]), s = name === 'Settings' ? 0 : shift; // Settings values were saved as text, not shifted
          return [new Date(d.getFullYear(), d.getMonth(), d.getDate() + s)];
        }));
      }
    });
  });
  syncCalendar();
}
// Compare the history rows in the live Sheet with the per-month totals taken from the original file.
function dataCheck_() {
  const all = read_('Transactions'), r2 = n => Math.round(n * 100) / 100;
  const sections = imports_().filter(h => h.expected).map(h => {
    const live = {};
    all.filter(t => String(t.Hash).indexOf(h.prefix) === 0).forEach(t => {
      const m = String(t.Date).slice(0, 7), e = live[m] = live[m] || { rows: 0, out: 0, in: 0 };
      e.rows++;
      if (t.Amount < 0) e.out -= t.Amount; else e.in += Number(t.Amount);
    });
    const months = Object.keys(h.expected).concat(Object.keys(live)).filter((m, i, a) => a.indexOf(m) === i).sort().map(m => {
      const x = h.expected[m] || { rows: 0, out: 0, in: 0 }, l = live[m] || { rows: 0, out: 0, in: 0 };
      return { month: m, rows: l.rows, expRows: x.rows, out: r2(l.out), expOut: x.out, in: r2(l.in), expIn: x.in,
               ok: l.rows === x.rows && Math.abs(l.out - x.out) < 0.01 && Math.abs(l.in - x.in) < 0.01 };
    });
    return { name: h.name, months: months, ok: months.every(m => m.ok) };
  });
  const first = sheet_('Transactions').getRange(2, 1, 1, 1);
  const hobbies = hobbyCheck_(), trips = tripCheck_(all);
  return { ok: sections.every(s => s.ok) && hobbies.ok && trips.ok, sections: sections, hobbies: hobbies, trips: trips, months: [].concat.apply([], sections.map(s => s.months)),
           sheetTimeZone: ss_().getSpreadsheetTimeZone(), scriptTimeZone: Session.getScriptTimeZone(),
           shiftFound: prop_('DATE_SHIFT_FIXED') || 'not measured',
           sample: { shown: first.getDisplayValues()[0][0], raw: String(first.getValues()[0][0]) } };
}

// Hobbies: totals per hobby, and rows whose hobby is missing (they would be invisible in the app).
function hobbyCheck_() {
  const hobbies = read_('Projects'), key = r => (r.Owner || 'owner') + '|' + r.Project;
  const known = new Set(hobbies.map(key)), orphans = [], rows = {};
  ['Tasks', 'Items', 'ProjectLog'].forEach(tab => rows[tab] = read_(tab));
  Object.keys(rows).forEach(tab => rows[tab].forEach(r => { if (!known.has(key(r))) orphans.push(tab + ' row ' + r._row + ': ' + r.Project); }));
  const list = hobbies.map(h => {
    const mine = tab => rows[tab].filter(r => key(r) === key(h));
    return { name: h.Project, owner: h.Owner || 'owner', tools: h.Tools, tasks: mine('Tasks').length, items: mine('Items').length,
             itemsLei: mine('Items').reduce((s, i) => s + (Number(i.Price) || 0), 0), log: mine('ProjectLog').length,
             hours: mine('ProjectLog').reduce((s, l) => s + (Number(l.Hours) || 0), 0) };
  });
  return { ok: !orphans.length && hobbies.every(h => h.Tools), list: list, orphans: orphans };
}

// Trips: payments linked to each trip, compared with the confirmed import (if any); links to trips that don't exist.
function tripCheck_(all) {
  const r2 = n => Math.round(n * 100) / 100, exp = {};
  imports_().filter(h => h.tripExpected).forEach(h => Object.assign(exp, h.tripExpected));
  const trips = read_('Trips'), names = new Set(trips.map(t => t.Trip)), live = {};
  all.filter(t => t.Trip).forEach(t => { const e = live[t.Trip] = live[t.Trip] || { rows: 0, spent: 0 }; e.rows++; e.spent -= Number(t.Amount) || 0; });
  const list = trips.filter(t => live[t.Trip] || exp[t.Trip]).map(t => {
    const l = live[t.Trip] || { rows: 0, spent: 0 }, x = exp[t.Trip];
    return { name: t.Trip, rows: l.rows, spent: r2(l.spent), expRows: x ? x.rows : null, expSpent: x ? x.spent : null,
             ok: !x || (l.rows === x.rows && Math.abs(l.spent - x.spent) < 0.01) };
  });
  const orphans = Object.keys(live).filter(n => !names.has(n)).map(n => n + ': ' + live[n].rows + ' payments');
  return { ok: list.every(t => t.ok) && !orphans.length, list: list, orphans: orphans };
}

// Nearest midnight (script time zone) to a date value.
function dayOf_(d) {
  const x = new Date(d.getTime() + 12 * 3600e3);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

// v2 categories: rename/merge the v1 ones everywhere, then rewrite the Categories tab (keeping guide amounts).
function mergeCategories_() {
  const RENAME = { 'Utilities': 'Utilities & bills', 'Home maintenance': 'Home & household', 'Household & care': 'Home & household',
                   'Taxi & public transport': 'Public transport & taxi', 'Hobbies': 'Sport & hobbies', 'Kids & pets': 'Other' };
  ['Transactions', 'Rules'].forEach(tab => {
    const sh = sheet_(tab), col = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].indexOf('Category') + 1;
    if (sh.getLastRow() < 2) return;
    const rng = sh.getRange(2, col, sh.getLastRow() - 1, 1);
    rng.setValues(rng.getValues().map(r => [RENAME[r[0]] || r[0]]));
  });
  const old = {};
  read_('Categories').forEach(c => old[RENAME[c.Category] || c.Category] = c.MonthlyTarget);
  const rows = SEED.Categories().map(r => { r[4] = Number(old[r[1]]) || 0; return r; });
  const sh = sheet_('Categories');
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  const have = new Set(read_('Rules').map(r => String(r.Match).toUpperCase()));
  SEED.Rules().filter(r => !have.has(r[0].toUpperCase())).forEach(r => append_('Rules', { Match: r[0], Category: r[1] }));
}

// Append many rows given in the tab's TABS column order (dates as "yyyy-mm-dd" strings).
function appendRows_(name, rows) {
  if (!rows || !rows.length) return;
  const sh = sheet_(name), sheetHead = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String), head = TABS[name];
  const out = rows.map(r => sheetHead.map(h => { const i = head.indexOf(h); return i < 0 ? '' : toCell_(h, r[i]); }));
  sh.getRange(sh.getLastRow() + 1, 1, out.length, sheetHead.length).setValues(out);
}

// Write one column for many rows at once: rows whose key column is in map get map[key].
// overwrite = false keeps cells that already have a value. Returns how many cells changed.
function setColumn_(name, col, keyCol, map, overwrite) {
  const sh = sheet_(name), head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const c = head.indexOf(col), k = head.indexOf(keyCol), n = sh.getLastRow() - 1;
  if (c < 0 || k < 0 || n < 1) return 0;
  const keys = sh.getRange(2, k + 1, n, 1).getValues(), rng = sh.getRange(2, c + 1, n, 1), v = rng.getValues();
  let changed = 0;
  keys.forEach((r, i) => {
    if (!(r[0] in map) || (!overwrite && v[i][0] !== '') || v[i][0] === map[r[0]]) return;
    v[i][0] = map[r[0]]; changed++;
  });
  if (changed) rng.setValues(v);
  return changed;
}

function showMyLinks() {
  const l = links_();
  Logger.log('Your private link: ' + l.owner);
  Logger.log('Partner link:      ' + l.partner);
}

function resetPartnerLink() {
  PropertiesService.getScriptProperties().setProperty('PARTNER_KEY', newKey_());
  cleanSessions_('partner');
  showMyLinks();
}

function links_() {
  const url = ScriptApp.getService().getUrl() || '(deploy the web app first)';
  return { owner: url + '?k=' + prop_('OWNER_KEY'), partner: url + '?k=' + prop_('PARTNER_KEY') };
}

function installTriggers_() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['syncCalendar', 'sendWeeklySummary'].includes(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncCalendar').timeBased().everyDays(1).atHour(6).create();
  ScriptApp.newTrigger('sendWeeklySummary').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(9).create();
}

// ---------- API called by the phone app ----------
function api(key, action, data) {
  const who = auth_(key);
  if (!who) throw new Error('This link is not valid');
  data = data || {};
  // PIN lock: these work without a session, everything else needs one.
  if (action === 'pinStatus') return { role: who.role, hasPin: !!prop_(pinKey_(who)), valid: sessionOk_(who, data._s) };
  if (action === 'login') return login_(who, data.pin, data.remember);
  if (action === 'createPin') {
    if (who.role !== 'owner' || prop_('PIN_OWNER')) throw new Error('PIN already set');
    checkPinFormat_(data.pin);
    setProp_('PIN_OWNER', hash_(data.pin));
    return login_(who, data.pin, true);
  }
  if (!sessionOk_(who, data._s)) throw new Error('LOCKED');
  if (action === 'getData') return getData_(who);
  if (action === 'photos') return photos_(who, data.ids || []);   // read-only: no lock needed

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    switch (action) {
      case 'addRow':
        checkTab_(data.tab, who, data.values);
        if (PERSONAL_TABS.includes(data.tab)) checkHobby_(data.tab, who, data.values, 0);
        if (data.tab === 'ProjectLog' && data.values._photo) Object.assign(data.values, savePhoto_(data.values));
        const row = append_(data.tab, data.values);
        if (data.tab === 'Dates') queueSync_(row);
        return row;
      case 'updateRow':
        checkTab_(data.tab, who, data.values);
        if (['Dates', 'Trips', 'TripItems', 'Transactions'].includes(data.tab)) {
          const old = read_(data.tab).find(r => r._row === data.row);
          if (old) checkTab_(data.tab, who, old);
        }
        if (PERSONAL_TABS.includes(data.tab)) checkHobby_(data.tab, who, data.values, data.row);
        update_(data.tab, data.row, data.values);
        if (data.tab === 'Dates') queueSync_(data.row);
        return true;
      case 'markDone': return markDone_(data.row, who);
      case 'tagTrip': return tagTrip_(who, data.trip, data.add || [], data.remove || []);
      case 'import': return import_(data.text, data.account, data.person);
      case 'answer': return answer_(data);
      case 'setSetting':
        if (who.role !== 'owner' && !PARTNER_SETTINGS.includes(data.key)) throw new Error('Only the owner can change this');
        setSetting_(data.key, data.value);
        return true;
      case 'share':
        if (who.role !== 'owner') throw new Error('Only the owner can share');
        PropertiesService.getScriptProperties().setProperty('PRIVATE_UNTIL', String(Date.now() + (data.minutes || 60) * 60000));
        return true;
      case 'unshare':
        if (who.role !== 'owner') throw new Error('Only the owner can do this');
        PropertiesService.getScriptProperties().setProperty('PRIVATE_UNTIL', '0');
        return true;
      case 'checkin': return checkin_();
      case 'deleteRow':
        if (!DELETABLE_TABS.includes(data.tab)) throw new Error('Delete these in the Sheet');
        if (PERSONAL_TABS.includes(data.tab)) checkHobby_(data.tab, who, {}, data.row);
        if (data.tab === 'TripItems') checkTab_(data.tab, who, read_('TripItems').find(r => r._row === data.row));
        if (data.tab === 'ProjectLog') {
          const l = read_('ProjectLog').find(r => r._row === data.row);
          [l.Photo, l.Thumb].filter(Boolean).forEach(trashFile_);   // photos go to the Drive bin (restorable for 30 days)
        }
        sheet_(data.tab).deleteRow(data.row);
        return true;
      case 'renameCategory':
        if (who.role !== 'owner') throw new Error('Only the owner can rename categories');
        return renameCategory_(data.from, data.to);
      case 'dataCheck':
        if (who.role !== 'owner') throw new Error('Only the owner can do this');
        return dataCheck_();
      case 'logout':
        PropertiesService.getScriptProperties().deleteProperty('S_' + data._s);
        return true;
      case 'setPin': { // owner sets the partner PIN or changes their own; that role's devices get logged out
        if (who.role !== 'owner') throw new Error('Only the owner can change PINs');
        checkPinFormat_(data.pin);
        const target = data.target === 'owner' ? 'owner' : 'partner';
        setProp_(target === 'owner' ? 'PIN_OWNER' : 'PIN_PARTNER', hash_(data.pin));
        cleanSessions_(target);
        return target === 'owner' ? login_(who, data.pin, true) : true;
      }
    }
    throw new Error('Unknown action ' + action);
  } finally {
    lock.releaseLock();
  }
}

function auth_(key) {
  if (!key) return null;
  if (key === prop_('OWNER_KEY')) return { role: 'owner', canPrivate: true, until: 0 };
  if (key === prop_('PARTNER_KEY')) {
    const until = Number(prop_('PRIVATE_UNTIL') || 0);
    return { role: 'partner', canPrivate: Date.now() < until, until: until };
  }
  return null;
}

// ---------- PIN lock ----------
// PINs are stored only as salted SHA-256 hashes in the script's hidden properties, never in the Sheet.
function pinKey_(who) { return who.role === 'owner' ? 'PIN_OWNER' : 'PIN_PARTNER'; }
function checkPinFormat_(pin) { if (!/^\d{4,8}$/.test(String(pin))) throw new Error('The PIN must be 4 to 8 digits'); }
function hash_(pin) {
  let salt = prop_('PIN_SALT');
  if (!salt) { salt = newKey_(); setProp_('PIN_SALT', salt); }
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pin));
}
function login_(who, pin, remember) {
  const r = who.role, lockUntil = Number(prop_('LOCK_' + r) || 0);
  if (Date.now() < lockUntil) throw new Error('Too many wrong tries. Try again in ' + Math.ceil((lockUntil - Date.now()) / 60000) + ' min.');
  if (!prop_(pinKey_(who))) throw new Error(r === 'owner' ? 'Create a PIN first' : 'Ask the owner to set your PIN');
  if (hash_(String(pin)) !== prop_(pinKey_(who))) {
    const fails = Number(prop_('FAILS_' + r) || 0) + 1;
    if (fails >= 5) {
      setProp_('LOCK_' + r, String(Date.now() + 15 * 60000));
      setProp_('FAILS_' + r, '0');
      throw new Error('Wrong PIN 5 times: locked for 15 minutes.');
    }
    setProp_('FAILS_' + r, String(fails));
    throw new Error('Wrong PIN (' + (5 - fails) + ' tries left)');
  }
  setProp_('FAILS_' + r, '0');
  cleanSessions_();
  const token = newKey_();
  setProp_('S_' + token, r + '|' + (Date.now() + (remember ? 30 : 0.5) * 864e5)); // 30 days or 12 hours
  return token;
}
function sessionOk_(who, token) {
  const v = token ? prop_('S_' + token) : null;
  if (!v) return false;
  const parts = v.split('|');
  return parts[0] === who.role && Date.now() < Number(parts[1]);
}
// Remove expired sessions, and all sessions of `role` when given.
function cleanSessions_(role) {
  const props = PropertiesService.getScriptProperties(), all = props.getProperties();
  Object.keys(all).filter(k => k.indexOf('S_') === 0).forEach(k => {
    const parts = all[k].split('|');
    if (Date.now() > Number(parts[1]) || parts[0] === role) props.deleteProperty(k);
  });
}
function setProp_(k, v) { PropertiesService.getScriptProperties().setProperty(k, v); }

function checkTab_(tab, who, values) {
  if (!EDITABLE_TABS.includes(tab)) throw new Error('Tab not editable: ' + tab);
  if (who.canPrivate) return;
  const v = values || {};
  const priv = PRIVATE_TABS.includes(tab) ||
    (['Dates', 'Trips'].includes(tab) && v.Private === 'yes') ||
    (['TripItems', 'Transactions'].includes(tab) && v.Trip && privateTrips_().has(v.Trip));
  if (priv) throw new Error('This part is private');
}

function privateTrips_() {
  return new Set(read_('Trips').filter(t => t.Private === 'yes').map(t => t.Trip));
}

// Hobbies are personal: you can only add to, change or delete your own.
function checkHobby_(tab, who, values, row) {
  const mine = r => (r.Owner || 'owner') === who.role;
  if (row) {
    const old = read_(tab).find(r => r._row === row);
    if (!old || !mine(old)) throw new Error('This belongs to someone else');
  }
  if ('Owner' in values && values.Owner !== who.role) throw new Error('This belongs to someone else');
  if (!row) values.Owner = who.role;
  if (tab === 'Countries') {
    if (!row && !/^[A-Z]{2}$/.test(String(values.Country || ''))) throw new Error('Unknown country');
    if (!row && read_('Countries').some(c => mine(c) && c.Country === values.Country)) throw new Error('Already on your map');
  } else if (tab === 'Projects') {
    if (!row && !String(values.Project || '').trim()) throw new Error('Give it a name');
    if (!row && read_('Projects').some(p => mine(p) && p.Project === values.Project)) throw new Error('You already have a hobby with that name');
    if (row && 'Project' in values) throw new Error('Names cannot be changed here');
  } else if ('Project' in values && !read_('Projects').some(p => mine(p) && p.Project === values.Project)) {
    throw new Error('Hobby not found');
  }
}

// ---------- Hobby photos (Google Drive, only files SelfMate made itself: drive.file permission) ----------
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
function drive_(url, opt) {
  opt = Object.assign({ muteHttpExceptions: true }, opt || {});
  opt.headers = Object.assign({ Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, opt.headers || {});
  const r = UrlFetchApp.fetch(url, opt);
  if (r.getResponseCode() >= 300) throw new Error('Google Drive said: ' + r.getContentText().slice(0, 200));
  return r;
}
function photoFolder_() {
  let id = prop_('PHOTO_FOLDER');
  if (id) {
    try { if (!JSON.parse(drive_(DRIVE_API + '/' + id + '?fields=trashed').getContentText()).trashed) return id; } catch (e) { /* gone: make a new one */ }
  }
  id = JSON.parse(drive_(DRIVE_API + '?fields=id', { method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ name: 'SelfMate photos', mimeType: 'application/vnd.google-apps.folder' }) }).getContentText()).id;
  setProp_('PHOTO_FOLDER', id);
  return id;
}
function uploadJpeg_(name, base64, folder) {
  const b = 'selfmate' + Date.now();
  const meta = JSON.stringify({ name: name, parents: [folder], mimeType: 'image/jpeg' });
  const bytes = Utilities.newBlob('--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta +
                                  '\r\n--' + b + '\r\nContent-Type: image/jpeg\r\n\r\n').getBytes()
    .concat(Utilities.base64Decode(base64), Utilities.newBlob('\r\n--' + b + '--').getBytes());
  return JSON.parse(drive_('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    { method: 'post', contentType: 'multipart/related; boundary=' + b, payload: bytes }).getContentText()).id;
}
// The phone sends the picture already shrunk: a large one (about 1600 px) and a small one for the timeline.
function savePhoto_(v) {
  const clean = s => String(s || '').replace(/^data:image\/\w+;base64,/, '');
  const folder = photoFolder_(), name = String(v.Date || iso_(new Date())) + ' ' + String(v.Project || 'hobby').replace(/[\\/:*?"<>|]/g, '');
  const out = { Photo: uploadJpeg_(name + '.jpg', clean(v._photo), folder),
                Thumb: v._thumb ? uploadJpeg_(name + ' (small).jpg', clean(v._thumb), folder) : '' };
  delete v._photo; delete v._thumb;
  return out;
}
function trashFile_(id) {
  try { drive_(DRIVE_API + '/' + id, { method: 'patch', contentType: 'application/json', payload: JSON.stringify({ trashed: true }) }); } catch (e) { /* already gone */ }
}
// Send photos to the phone, but only ones from hobbies this link may see.
function photos_(who, ids) {
  const allowed = new Set();
  visibleHobbyRows_(who, 'ProjectLog').forEach(l => { if (l.Photo) allowed.add(String(l.Photo)); if (l.Thumb) allowed.add(String(l.Thumb)); });
  const out = {};
  ids.slice(0, 24).filter(id => allowed.has(String(id))).forEach(id => {
    try { out[id] = 'data:image/jpeg;base64,' + Utilities.base64Encode(drive_(DRIVE_API + '/' + id + '?alt=media').getContent()); } catch (e) { out[id] = ''; }
  });
  return out;
}
// Your own hobby rows; while the owner shares private views, the partner also sees the owner's (read-only).
function visibleHobbyRows_(who, tab) {
  return read_(tab).filter(r => {
    const o = r.Owner || 'owner';
    return o === who.role || (who.role === 'partner' && who.canPrivate && o === 'owner');
  }).map(r => { if ((r.Owner || 'owner') !== who.role) r._ro = true; return r; });
}

// Meal vouchers (Up card) never show up in bank data: each month add the voucher income and,
// since it is all spent on food, the matching grocery spending. Safe-to-spend ignores the "Up card" account.
// Settings added after the first version: names for the greeting and the shared check-in counter (plant leaves).
function ensureSettings_() {
  const s = settings_();
  if (s.OwnerName === undefined) setSetting_('OwnerName', '');
  if (s.PartnerName === undefined) setSetting_('PartnerName', '');
  if (s.Checkins === undefined) setSetting_('Checkins', s.LastCheckin ? 1 : 0);
  [['SrlName', 'SRL'], ['ProjectsName', 'Hobbies'], ['City', 'Cluj-Napoca'], ['EurRate', 5], ['HomeCountry', 'RO']].forEach(kv => { if (s[kv[0]] === undefined) setSetting_(kv[0], kv[1]); });
}

// Rename a category in the Categories tab and in every transaction and rule that uses it.
function renameCategory_(from, to) {
  to = String(to || '').trim();
  if (!to) throw new Error('Give the category a name');
  if (read_('Categories').some(c => c.Category === to)) throw new Error('That name is already used');
  let n = 0;
  ['Categories', 'Transactions', 'Rules'].forEach(tab => {
    const sh = sheet_(tab), head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const col = head.indexOf('Category') + 1;
    if (sh.getLastRow() < 2 || !col) return;
    const rng = sh.getRange(2, col, sh.getLastRow() - 1, 1);
    rng.setValues(rng.getValues().map(r => { if (r[0] === from) { n++; return [to]; } return r; }));
  });
  return n;
}

// One check-in per day counts; each one grows a leaf on the shared plant.
function checkin_() {
  const s = settings_(), today = iso_(new Date());
  let n = Number(s.Checkins) || 0;
  const last = s.LastCheckin instanceof Date ? iso_(s.LastCheckin) : String(s.LastCheckin || '').slice(0, 10);
  if (last !== today) { n++; setSetting_('Checkins', n); setSetting_('LastCheckin', today); }
  return n;
}

function ensureVouchers_() {
  const s = settings_();
  if (s.MealVouchers === undefined) {
    setSetting_('MealVouchers', 800);           // lei per month, change in the app (⚙️)
    setSetting_('MealVouchersSince', 202511);   // yyyymm of the first month to record
    s.MealVouchers = 800; s.MealVouchersSince = 202511;
  }
  const amount = Number(s.MealVouchers) || 0, since = String(s.MealVouchersSince || '');
  if (!amount || !/^\d{6}$/.test(since)) return;
  const have = new Set(read_('Transactions').filter(t => String(t.Hash).indexOf('up|') === 0).map(t => t.Hash));
  const rows = [], now = new Date();
  for (let d = new Date(+since.slice(0, 4), +since.slice(4) - 1, 1); d <= now; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const m = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
    if (!have.has('up|' + m + '|in'))
      rows.push([m + '-01', amount, 'RON', 'Bonuri de masă (Up card)', 'Income', 'Up card', 'vouchers', '', 'up|' + m + '|in', 'S']);
    if (!have.has('up|' + m + '|out'))
      rows.push([m + '-01', -amount, 'RON', 'Groceries paid with Up card (estimate)', 'Groceries', 'Up card', 'vouchers', '', 'up|' + m + '|out', 'S']);
  }
  if (!rows.length) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { appendRows_('Transactions', rows); } finally { lock.releaseLock(); }
}

function getData_(who) {
  if (who.role === 'owner') { upgrade_(); ensureSettings_(); ensureVouchers_(); }
  const s = settings_();
  const out = {
    role: who.role,
    canPrivate: who.canPrivate,
    privateUntil: who.until,
    settings: s,
    me: s[who.role === 'owner' ? 'OwnerName' : 'PartnerName'] || '',
    dates: read_('Dates').filter(r => who.canPrivate || r.Private !== 'yes'),
    categories: read_('Categories'),
    transactions: read_('Transactions'),
    goals: read_('Goals'),
    balances: read_('Balances'),
    trips: read_('Trips'),
    tripitems: read_('TripItems'),
  };
  if (!who.canPrivate) {
    const hidden = privateTrips_();
    out.trips = out.trips.filter(t => t.Private !== 'yes');
    out.tripitems = out.tripitems.filter(i => !hidden.has(i.Trip));
    out.transactions.forEach(t => { if (hidden.has(t.Trip)) t.Trip = ''; });
  }
  out.countries = read_('Countries').filter(c => (c.Owner || 'owner') === who.role);
  if (who.canPrivate) PRIVATE_TABS.forEach(t => out[t.toLowerCase()] = read_(t));
  HOBBY_TABS.forEach(t => out[t.toLowerCase()] = visibleHobbyRows_(who, t));
  return out;
}

// Link payments to a trip (add) or unlink them (remove). Rows are Sheet row numbers of the Transactions tab.
function tagTrip_(who, trip, add, remove) {
  const t = read_('Trips').find(x => x.Trip === trip);
  if (!t) throw new Error('Trip not found');
  checkTab_('Trips', who, t);
  const hidden = who.canPrivate ? new Set() : privateTrips_(), map = {};
  read_('Transactions').forEach(x => {
    if (add.includes(x._row) && !hidden.has(x.Trip)) map[x._row] = trip;
    if (remove.includes(x._row) && x.Trip === trip) map[x._row] = '';
  });
  const sh = sheet_('Transactions'), head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String), c = head.indexOf('Trip') + 1;
  Object.keys(map).forEach(r => sh.getRange(Number(r), c).setValue(map[r]));
  return Object.keys(map).length;
}

function markDone_(row, who) {
  const r = read_('Dates').find(x => x._row === row);
  if (!r) throw new Error('Date not found');
  if (r.Private === 'yes' && !who.canPrivate) throw new Error('This part is private');
  const today = iso_(new Date());
  const n = Number(r.RepeatMonths) || 0;
  const values = { LastDone: today };
  if (n > 0 && r.Due) {
    let next = parse_(r.Due);
    do { next = addMonths_(next, n); } while (iso_(next) <= today);
    values.Due = iso_(next);
  }
  update_('Dates', row, values);
  queueSync_(row);
  return values;
}

// ---------- Bank statement import (BT, Revolut, most CSVs) ----------
function import_(text, account, person) {
  const rows = Utilities.parseCsv(text, delimiter_(text));
  const hi = rows.findIndex(r => r.some(c => /^(completed date|data|date|started date)/i.test(String(c).trim())) &&
                                 r.some(c => /^(amount|suma|sumă|valoare|debit|credit)/i.test(String(c).trim())));
  if (hi < 0) throw new Error('Could not find the column headers. Please export as CSV.');
  const head = rows[hi].map(h => String(h).trim());
  const col = re => head.findIndex(h => re.test(h));
  const c = {
    date: col(/^completed date/i) >= 0 ? col(/^completed date/i) : col(/^(data|date|started date)/i),
    amount: col(/^(amount|suma|sumă|valoare)/i),
    debit: col(/debit/i), credit: col(/credit/i),
    desc: col(/(description|descriere|detalii|explica|beneficiar)/i),
    fee: col(/^fee$/i), state: col(/^state$/i), cur: col(/^(currency|valuta|moneda|monedă)/i), type: col(/^type$/i),
  };
  const existing = new Set(read_('Transactions').map(t => t.Hash));
  const rules = rules_();
  const out = [];
  let skipped = 0;
  rows.slice(hi + 1).forEach(r => {
    if (c.state >= 0 && r[c.state] && !/completed/i.test(r[c.state])) return;
    const date = parseAnyDate_(r[c.date]);
    let amount = c.amount >= 0 ? num_(r[c.amount])
      : Math.abs(num_(r[c.credit])) - Math.abs(num_(r[c.debit]));
    if (c.fee >= 0) amount -= Math.abs(num_(r[c.fee]));
    if (!date || !amount || isNaN(amount)) return;
    const merchant = cleanMerchant_(c.desc >= 0 ? r[c.desc] : '');
    const currency = (c.cur >= 0 && r[c.cur]) ? String(r[c.cur]).toUpperCase().replace('LEI', 'RON') : 'RON';
    const hash = [date, amount.toFixed(2), currency, merchant].join('|');
    if (existing.has(hash)) { skipped++; return; }
    existing.add(hash);
    let cat = categorize_(merchant, rules);
    if (!cat && c.type >= 0 && /top.?up|exchange|transfer/i.test(r[c.type])) cat = 'Transfers';
    if (!cat) cat = amount > 0 ? 'Income' : 'Unsorted';
    out.push({ Date: date, Amount: Math.round(amount * 100) / 100, Currency: currency, Merchant: merchant,
               Category: cat, Account: account || 'Bank', Source: 'import', Hash: hash, Person: person || 'S' });
  });
  appendRows_('Transactions', out.map(o => TABS.Transactions.map(h => o[h])));
  return { added: out.length, skipped: skipped, unsorted: out.filter(o => o.Category === 'Unsorted').length };
}

// Answer an "Unsorted" question: optionally learn a rule and apply it to all matching rows.
function answer_(data) {
  const kw = String(data.keyword || '').trim().toUpperCase();
  if (kw) append_('Rules', { Match: kw, Category: data.category });
  const sh = sheet_('Transactions');
  const colCat = TABS.Transactions.indexOf('Category') + 1;
  let n = 0;
  read_('Transactions').forEach(t => {
    const hit = t._row === data.row || (kw && t.Category === 'Unsorted' && String(t.Merchant).toUpperCase().includes(kw));
    if (hit) { sh.getRange(t._row, colCat).setValue(data.category); n++; }
  });
  return n;
}

function rules_() {
  return read_('Rules').map(r => ({ m: String(r.Match).toUpperCase(), c: r.Category }))
    .filter(r => r.m).sort((a, b) => b.m.length - a.m.length); // longest match wins ("BOLT FOOD" before "BOLT")
}
function categorize_(merchant, rules) {
  const up = String(merchant).toUpperCase();
  const hit = rules.find(r => up.includes(r.m));
  return hit ? hit.c : '';
}

// Keep only the useful part of a bank description, and drop card numbers / IBANs for privacy.
function cleanMerchant_(s) {
  return String(s || '')
    .replace(/RO\d{2}[A-Z]{4}[0-9A-Z]{10,}/gi, '')
    .replace(/X{2,}\S*/gi, '')
    .replace(/\b(TID|RRN|REF|AUTH|NR\.?)\s*[:.]?\s*\S+/gi, '')
    .replace(/(?:\d[ -]?){4,}/g, '')
    .replace(/PLATA LA POS( NON-BT)?( CU CARD)?( (VISA|MASTERCARD|MAESTRO))?/gi, '')
    .replace(/\s{2,}/g, ' ').trim().slice(0, 80);
}

function delimiter_(text) {
  const head = text.split(/\r?\n/).slice(0, 30).join('\n');
  const count = ch => head.split(ch).length;
  return [';', '\t', ','].sort((a, b) => count(b) - count(a))[0];
}

function num_(s) {
  let t = String(s == null ? '' : s).replace(/[^\d,.\-]/g, '');
  if (!t) return 0;
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (t.includes(',')) t = t.replace(',', '.');
  return parseFloat(t) || 0;
}

function parseAnyDate_(s) {
  if (s instanceof Date) return iso_(s);
  const t = String(s || '').trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso_(new Date(+m[1], m[2] - 1, +m[3]));
  m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return iso_(new Date(+m[3], m[2] - 1, +m[1]));
  return '';
}

// ---------- Google Calendar ----------
function syncCalendar() {
  read_('Dates').forEach(r => syncOne_(r));
}
// The phone should not wait for Google Calendar (slow): remember which rows changed and
// sync them a minute later in the background. The daily syncCalendar is the safety net.
function queueSync_(row) {
  const q = JSON.parse(prop_('CAL_QUEUE') || '[]');
  if (!q.includes(row)) q.push(row);
  setProp_('CAL_QUEUE', JSON.stringify(q));
  if (Date.now() - Number(prop_('CAL_QUEUE_AT') || 0) < 10 * 60000) return;   // a background sync is already planned
  setProp_('CAL_QUEUE_AT', String(Date.now()));
  ScriptApp.newTrigger('syncQueued').timeBased().after(60 * 1000).create();
}
function syncQueued() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncQueued').forEach(t => ScriptApp.deleteTrigger(t));
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let q;
  try { q = JSON.parse(prop_('CAL_QUEUE') || '[]'); setProp_('CAL_QUEUE', '[]'); setProp_('CAL_QUEUE_AT', '0'); } finally { lock.releaseLock(); }
  const rows = read_('Dates');
  q.forEach(n => { const r = rows.find(x => x._row === n); if (r) syncOne_(r); });
}
function syncRow_(row) {
  const r = read_('Dates').find(x => x._row === row);
  if (r) syncOne_(r);
}
function syncOne_(r) {
  const cal = calendar_(r.Private === 'yes' ? 'CAL_PRIVATE' : 'CAL_SHARED');
  if (!cal) return;
  const col = TABS.Dates.indexOf('EventId') + 1;
  let ev = null;
  if (r.EventId) { try { ev = cal.getEventById(r.EventId); } catch (e) { ev = null; } }
  if (!r.Due || isDone_(r)) {
    if (ev) ev.deleteEvent();
    if (r.EventId) sheet_('Dates').getRange(r._row, col).setValue('');
    return;
  }
  const day = parse_(r.Due);
  if (!ev) {
    ev = cal.createAllDayEvent(r.Title, day);
    ev.removeAllReminders();
    [40320, 10080, 900].forEach(m => ev.addPopupReminder(m)); // 28 days (Google's max), 7 days, day before
    sheet_('Dates').getRange(r._row, col).setValue(ev.getId());
  } else {
    if (ev.getTitle() !== r.Title) ev.setTitle(r.Title);
    ev.setAllDayDate(day);
  }
}
function calendar_(propKey, name) {
  const id = prop_(propKey);
  let cal = id ? CalendarApp.getCalendarById(id) : null;
  if (!cal && name) {
    cal = CalendarApp.createCalendar(name, { color: propKey === 'CAL_SHARED' ? CalendarApp.Color.BLUE : CalendarApp.Color.GRAY });
    PropertiesService.getScriptProperties().setProperty(propKey, cal.getId());
  }
  return cal;
}

// ---------- Sunday email ----------
function sendWeeklySummary() {
  const s = settings_();
  const l = links_();
  const today = iso_(new Date());
  const dates = read_('Dates');
  const unsorted = read_('Transactions').filter(t => t.Category === 'Unsorted').length;
  const soon = rows => rows.filter(r => r.Due && !isDone_(r) && daysBetween_(today, r.Due) <= 30)
    .sort((a, b) => a.Due < b.Due ? -1 : 1);
  const html = (rows, missing, link) =>
    '<div style="font-family:sans-serif;line-height:1.5"><h2>🗓️ Your SelfMate week</h2>' +
    '<p>10-minute check-in: open the app, look at the next 30 days, sort new transactions, tick what is done.</p>' +
    (rows.length ? '<ul>' + rows.map(r => '<li><b>' + r.Due + '</b> · ' + r.Title +
      ' <span style="color:' + (daysBetween_(today, r.Due) <= 7 ? '#c0392b' : '#b7791f') + '">(' +
      daysBetween_(today, r.Due) + ' days)</span></li>').join('') + '</ul>' : '<p>Nothing due in the next 30 days 🎉</p>') +
    (unsorted ? '<p>❓ ' + unsorted + ' transactions need a category.</p>' : '') +
    (missing ? '<p>📝 ' + missing + ' items still need a date.</p>' : '') +
    '<p><a href="' + link + '">Open SelfMate</a></p></div>';
  const household = dates.filter(r => r.Private !== 'yes');
  if (s.OwnerEmail) MailApp.sendEmail({ to: s.OwnerEmail, subject: 'SelfMate: your week',
    htmlBody: html(soon(dates), dates.filter(r => !r.Due).length, l.owner) });
  if (s.PartnerEmail) MailApp.sendEmail({ to: s.PartnerEmail, subject: 'SelfMate: our week',
    htmlBody: html(soon(household), household.filter(r => !r.Due).length, l.partner) });
}

// ---------- Sheet helpers ----------
let SS_ = null;   // opening the spreadsheet is slow, so do it once per request
function ss_() { return SS_ || (SS_ = SpreadsheetApp.openById(prop_('SHEET_ID') || SHEET_ID)); }
function sheet_(name) { return ss_().getSheetByName(name); }
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function newKey_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }
function pad_(r, n) { const a = r.slice(0, n); while (a.length < n) a.push(''); return a; }

function read_(name) {
  const sh = sheet_(name);
  if (!sh) return [];
  const v = sh.getDataRange().getValues();
  const head = v.shift().map(String);
  return v.map((r, i) => {
    const o = { _row: i + 2 };
    head.forEach((h, j) => o[h] = !(r[j] instanceof Date) ? r[j]
      : h === 'Time' ? Utilities.formatDate(r[j], Session.getScriptTimeZone(), 'HH:mm') : iso_(dayOf_(r[j])));
    return o;
  }).filter(o => head.some(h => o[h] !== '' && o[h] != null));
}

function append_(name, obj) {
  const sh = sheet_(name);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  sh.appendRow(head.map(h => toCell_(h, obj[h])));
  return sh.getLastRow();
}

function update_(name, row, obj) {
  const sh = sheet_(name);
  const n = sh.getLastColumn(), head = sh.getRange(1, 1, 1, n).getValues()[0].map(String);
  const rng = sh.getRange(row, 1, 1, n), v = rng.getValues()[0];   // one read and one write instead of one per cell
  let changed = false;
  Object.keys(obj).forEach(k => {
    const j = head.indexOf(k);
    if (j >= 0) { v[j] = toCell_(k, obj[k]); changed = true; }
  });
  if (changed) rng.setValues([v]);
}

function toCell_(h, v) {
  if (v == null) return '';
  if (DATE_COLS.includes(h) && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) return parse_(v);
  return v;
}

function settings_() {
  const o = {};
  read_('Settings').forEach(r => o[r.Key] = r.Value);
  return o;
}
function setSetting_(k, v) {
  const r = read_('Settings').find(x => x.Key === k);
  if (r) update_('Settings', r._row, { Value: v });
  else append_('Settings', { Key: k, Value: v });
}

function isDone_(r) { return r.LastDone && r.Due && r.LastDone >= r.Due && !(Number(r.RepeatMonths) > 0); }
function iso_(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function parse_(s) { const p = String(s).split('-'); return new Date(+p[0], p[1] - 1, +p[2]); }
function daysBetween_(a, b) { return Math.round((parse_(b) - parse_(a)) / 864e5); }
function addMonths_(d, n) {
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(d.getDate(), last));
  return t;
}
