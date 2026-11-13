'use strict';

/*
 * Odměny – rozhraní aplikace.
 * Výpočty a importy jsou v core.js (S, evaluate, buildPeriod…). Tady je jen
 * vykreslení, ovládání a šifrované ukládání přes OdmVault. Každý text z dat se
 * vkládá přes esc(); bezpečnostní politika stránky navíc nepustí žádný cizí skript.
 */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const Vault = window.OdmVault;
const ui = {
  view: 'prehled', selPerson: null, selPos: null, personOpen: false, posOpen: false,
  ovSort: { k: 'score', dir: -1 }, openDetail: null,
  sanDraft: { key: '', period: '', reason: '', other: '', pct: 10, wage: false, note: '' }, sanFilter: '',
  lastAoa: null, lastFile: '', locking: false,
  me: { cardId: '', label: '', device: '' }, profileKey: null, prevView: 'lide',
  t5: { tab: 'week', week: null, caseId: null, filter: 'active', q: '', cdraft: null },
  kt: { tab: 'plan', week: null, range: '12', dept: '' },
  qk: { n: 5, dept: '', slot: null, present: true, list: null, want: 0, short: 0, at: 0, anim: false, swapped: '' },
  // Rychlý scan (2.77): dávka jen v paměti okna, kamera, poslední kód (ať se hned nenačte znovu)
  sc: { batch: [], list: '', range: 'today', cam: false, busy: false, last: '', lastAt: 0, lastQty: null, badText: '', done: '' },
  hist: [], popping: false, listY: 0, homeShift: '', fabOpen: false,
  lb: { sel: null, open: false, listY: 0, openSteps: new Set(), mode: 'year', year: new Date().getFullYear(), from: '', to: '', intro: true, extra: true },
  sv: { tab: 'ship', draft: null, open: null, all: false, q: '' },
  sh: { open: null, q: '', plan: null, ops: [], depts: [], deptOpen: false, merge: null, mode: 'list', last: null, tiers: [], age: '', outOpen: true },
  tk: { part: 'list', agQ: '', sel: null, filter: 'open', owner: '', q: '', draft: {}, alertOff: '', listY: 0, dueTimer: null, lastDue: '' },
  wa: { tab: 'prehled', hist: 26, hFrom: '', hTo: '', group: '', planRange: 'f13', pFrom: '', pTo: '', planBusy: false, mode: 'month', month: '', week: '', from: '', to: '', groups: false, allEdits: false, opQ: '', opFilter: 'all', ctPre: 'b3', ctFrom: '', ctTo: '', ctPage: '', dvMode: 'day', dvDay: '', dvMonth: '', dvSort: 'group', kp: { month: '', sort: 'ks', dir: 'best', dept: '' } },
};
/* base = poslední stav uložený na serveru; změny proti němu se při uložení zapíšou do historie. */
const store = { rev: 0, dirty: false, saving: false, timer: null, retry: null, firstDirty: 0, conflict: false, error: null, savedAt: null, base: null, note: null };

/* ==========================================================================
   Osobní nastavení pohledu: jen pro tuto kartičku (šifrované na serveru).
   Filtry, období nebo skryté sloupce jednoho člověka se ostatním nemění.
   ========================================================================== */
const PREF_DEFAULTS = {
  period: null, sort: { k: 'score', dir: -1 }, pos: '', onlyImported: true, onlyOpen: false, hiddenCols: [],
  sanFilter: '', lockMinutes: 15, logSeen: 0, matrixDept: '', matrixShift: '*', mxTab: 'matrix', profileRange: '12', profileFrom: '', profileTo: '',
  t5PdfShort: false, matrixIds: false,
};
let P = { ...PREF_DEFAULTS };
const prefStore = { timer: null, saving: false, dirty: false };
const SORT_KEYS = ['name', 'days', 'hours', 'wk', 'kafe', 'lvl', 'prod', 'att', 'pen', 'adj', 'score', 'iss', 'raise', 'ncut'];
const MONTH_RE = /^\d{4}-\d{2}$/;

function cleanPrefs(input) {
  const x = input && typeof input === 'object' ? input : {};
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  return {
    period: MONTH_RE.test(String(x.period)) ? x.period : null,
    sort: { k: SORT_KEYS.includes(x.sort?.k) ? x.sort.k : 'score', dir: x.sort?.dir === 1 ? 1 : -1 },
    pos: str(x.pos, 40),
    onlyImported: x.onlyImported !== false,
    onlyOpen: x.onlyOpen === true,
    hiddenCols: Array.isArray(x.hiddenCols) ? x.hiddenCols.filter(k => OV_COLUMN_KEYS.includes(k)) : [],
    sanFilter: MONTH_RE.test(String(x.sanFilter)) ? x.sanFilter : '',
    lockMinutes: [5, 10, 15, 30, 60].includes(+x.lockMinutes) ? +x.lockMinutes : 15,
    logSeen: Number.isFinite(+x.logSeen) ? Math.max(0, +x.logSeen) : 0,
    matrixDept: str(x.matrixDept, 80),   // id skupiny, nebo „d:“ + název oddělení
    matrixShift: ['*', 'R', 'O', 'S1', 'S2', ''].includes(x.matrixShift) ? x.matrixShift : '*',
    mxTab: ['matrix', 'groups', 'cap', 'leads'].includes(x.mxTab) ? x.mxTab : 'matrix',
    profileRange: ['month', '3', '6', '12', 'year', 'all', 'custom'].includes(x.profileRange) ? x.profileRange : '12',
    profileFrom: MONTH_RE.test(String(x.profileFrom)) ? x.profileFrom : '',
    profileTo: MONTH_RE.test(String(x.profileTo)) ? x.profileTo : '',
    t5PdfShort: x.t5PdfShort === true,
    matrixIds: x.matrixIds === true,   // matice jen s ID z evidence práce místo jmen (2.20)
    // filtr seznamu Lidé (2.23): g = id skupiny nebo „d:“ + oddělení, st = stav (LIDE_STATES)
    lideF: { g: str(x.lideF?.g, 80), st: LIDE_STATES.some(t => t[0] === x.lideF?.st) ? x.lideF.st : '' },
    // Rychlý scan (2.77): poslední pozice a hromadné načítání (výchozí zapnuté)
    scanPos: str(x.scanPos, 120),
    scanBatch: x.scanBatch !== false,
  };
}

function setPref(patch) {
  Object.assign(P, patch);
  prefStore.dirty = true;
  clearTimeout(prefStore.timer);
  prefStore.timer = setTimeout(flushPrefs, 700);
}

async function flushPrefs() {
  if (!prefStore.dirty || prefStore.saving || ui.locking) return;
  prefStore.saving = true;
  prefStore.dirty = false;
  try {
    await Vault.savePrefs(P);
  } catch (error) {
    if (error.status === 426) { updatedElsewhere(); return; }
    if (error.status !== 401) { prefStore.dirty = true; prefStore.timer = setTimeout(flushPrefs, 10000); }
  } finally {
    prefStore.saving = false;
  }
}

/** Vybrané období je osobní; když ho data nemají (třeba ho někdo smazal), platí nejnovější. */
function applyPeriodPref() {
  const ids = Object.keys(S.periods).sort().reverse();
  S.current = P.period && S.periods[P.period] ? P.period : (ids[0] || null);
}

function setPeriod(id) {
  S.current = id || null;
  ui.openDetail = null;
  setPref({ period: S.current });
}

let reloadAsked = false;
async function updatedElsewhere() {
  if (reloadAsked) return;
  reloadAsked = true;
  await dialog({ title: 'Aplikace byla aktualizována', html: '<p>Na serveru běží nová verze aplikace. Obnov stránku a přihlas se znovu. Změny z posledních několika vteřin se nemusely uložit.</p>', ok: 'Obnovit stránku', cancel: '' });
  location.reload();
}

function toast(message, error = false) { window.odmToast(message, error); }
function setWidths(root = document) { $$('[data-w]', root).forEach(element => { element.style.width = `${element.dataset.w}%`; }); }

/* Název v exportech (PDF, záloha): uživatel chce „HALA 2“ místo názvu aplikace (2.13). */
const EXPORT_NAME = 'HALA 2';
/* Zkušební doba (2.52): ikona u jména, po najetí (na telefonu klepnutím) od kdy u nás pracuje
   a kdy končí zkušební doba. */
function probIcon(e) {
  const x = S && e ? probationOf(e) : null;
  if (!x) return '';
  const t = probText(x);
  return ` <span class="prob-ic${x.left <= 14 ? ' soon' : ''}" title="${esc(t)}" aria-label="${esc(t)}" role="img" data-prob="${esc(t)}">${I.hourglass}</span>`;
}
const I = {
  undo: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  tab: '<svg class="icon tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8.5c0-2 1.6-3.5 3.5-3.5h5C16.4 5 18 6.5 18 8.5V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19z"/><path d="M6 10h12M10 14.5c1.3-1 2.7-1 4 0"/></svg>',
  kafe: '<svg class="icon kafe-ico-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 9.5h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z"/><path d="M16.5 11h1.5a2.5 2.5 0 0 1 0 5h-1.8M8 3.5c-.8 1 .8 2 0 3M12 3.5c-.8 1 .8 2 0 3"/></svg>',
  check: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  sparkle: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M11 3.5 12.9 9 18.5 11 12.9 13 11 18.5 9.1 13 3.5 11 9.1 9z"/><path d="M18.5 14.5l.8 2.1 2.2.8-2.2.8-.8 2.3-.8-2.3-2.2-.8 2.2-.8z"/><path d="M18 2.5l.6 1.5 1.4.6-1.4.6-.6 1.5-.6-1.5-1.4-.6 1.4-.6z"/></svg>',
  back: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>',
  arrow: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  clock: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  user: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-3.8 3.8-5.5 7-5.5s6 1.7 7 5.5"/></svg>',
  repeat: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11V9a3 3 0 0 1 3-3h12"/><path d="m16 3 3 3-3 3"/><path d="M20 13v2a3 3 0 0 1-3 3H5"/><path d="m8 21-3-3 3-3"/></svg>',
  chat: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5a2.5 2.5 0 0 1-2.5 2.5H9l-4.5 3.5V6.5A2.5 2.5 0 0 1 7 4h10.5A2.5 2.5 0 0 1 20 6.5z"/></svg>',
  x: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  scan: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M7 9v6M10 9v6M13 9v6M17 9v6"/></svg>',
  shield: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v5.5c0 4.2 2.9 8 7 9.5 4.1-1.5 7-5.3 7-9.5V6z"/><path d="m9 12 2 2 4-4"/></svg>',
  sun: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5"/></svg>',
  moon: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  search: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5.5 5.5"/></svg>',
  grid: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>',
  chart: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 20.5h17"/><path d="M6.5 16v-4M11 16V7.5M15.5 16v-6M20 16V5"/></svg>',
  warn: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5 21 19.5H3z"/><path d="M12 10v4.5M12 17.2v.1"/></svg>',
  hourglass: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h10M7 21h10M8 3c0 4 4 5.5 4 9s-4 5-4 9M16 3c0 4-4 5.5-4 9s4 5 4 9"/></svg>',
  home: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/></svg>',
  unlock: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 7.6-1.8"/></svg>',
  lock: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>',
  camera: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3l1.4-2h5.6l1.4 2h2.3A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  up: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg>',
  down: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 10 6 6 6-6"/></svg>',
  info: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.1"/></svg>',
  swap: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 9.5a7.5 7.5 0 0 1 13.4-3.2L20 8.5"/><path d="M20 4v4.5h-4.5"/><path d="M19.5 14.5a7.5 7.5 0 0 1-13.4 3.2L4 15.5"/><path d="M4 20v-4.5h4.5"/></svg>',
  dice: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none"/></svg>',
  share: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 12.5v6A2 2 0 0 0 7 20.5h10a2 2 0 0 0 2-2v-6"/></svg>',
};

