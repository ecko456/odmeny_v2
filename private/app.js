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
  sanDraft: { key: '', period: '', reason: '', other: '', pct: 10, note: '' }, sanFilter: '',
  lastAoa: null, lastFile: '', locking: false,
  me: { cardId: '', label: '', device: '' }, profileKey: null, prevView: 'lide',
};
/* base = poslední stav uložený na serveru; změny proti němu se při uložení zapíšou do historie. */
const store = { rev: 0, dirty: false, saving: false, timer: null, retry: null, firstDirty: 0, conflict: false, error: null, savedAt: null, base: null, note: null };

/* ==========================================================================
   Osobní nastavení pohledu: jen pro tuto kartičku (šifrované na serveru).
   Filtry, období nebo skryté sloupce jednoho člověka se ostatním nemění.
   ========================================================================== */
const PREF_DEFAULTS = {
  period: null, sort: { k: 'score', dir: -1 }, pos: '', onlyImported: true, onlyOpen: false, hiddenCols: [],
  sanFilter: '', lockMinutes: 15, logSeen: 0, matrixDept: '', profileRange: '12', profileFrom: '', profileTo: '',
};
let P = { ...PREF_DEFAULTS };
const prefStore = { timer: null, saving: false, dirty: false };
const SORT_KEYS = ['name', 'days', 'hours', 'wk', 'kafe', 'lvl', 'prod', 'att', 'pen', 'adj', 'score', 'iss', 'raise'];
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
    matrixDept: str(x.matrixDept, 60),
    profileRange: ['month', '3', '6', '12', 'year', 'all', 'custom'].includes(x.profileRange) ? x.profileRange : '12',
    profileFrom: MONTH_RE.test(String(x.profileFrom)) ? x.profileFrom : '',
    profileTo: MONTH_RE.test(String(x.profileTo)) ? x.profileTo : '',
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

const I = {
  tab: '<svg class="icon tab-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8.5c0-2 1.6-3.5 3.5-3.5h5C16.4 5 18 6.5 18 8.5V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19z"/><path d="M6 10h12M10 14.5c1.3-1 2.7-1 4 0"/></svg>',
  kafe: '<svg class="icon kafe-ico-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 9.5h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z"/><path d="M16.5 11h1.5a2.5 2.5 0 0 1 0 5h-1.8M8 3.5c-.8 1 .8 2 0 3M12 3.5c-.8 1 .8 2 0 3"/></svg>',
  check: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  back: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>',
  arrow: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  x: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  shield: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v5.5c0 4.2 2.9 8 7 9.5 4.1-1.5 7-5.3 7-9.5V6z"/><path d="m9 12 2 2 4-4"/></svg>',
};

/* ==========================================================================
   Dialogy (místo prohlížečových confirm/prompt)
   ========================================================================== */
let dialogChain = Promise.resolve();
/* Dialogy jdou po sobě: druhý (třeba konflikt při ukládání) počká, až se první zavře. */
function dialog(options) {
  const run = dialogChain.then(() => openDialog(options));
  dialogChain = run.catch(() => {});
  return run;
}

function openDialog({ title, html = '', ok = 'OK', cancel = 'Zrušit', danger = false, wide = false, onOpen = null, validate = null }) {
  return new Promise(resolve => {
    const dlg = $('#dlg');
    const form = $('#dlgForm');
    $('#dlgTitle').textContent = title;
    $('#dlgBody').innerHTML = html;
    $('#dlgOk').textContent = ok || '';
    $('#dlgOk').hidden = !ok;
    $('#dlgOk').className = `btn${danger ? ' btn-danger' : ''}`;
    $('#dlgCancel').textContent = cancel || '';
    $('#dlgCancel').hidden = !cancel;
    dlg.classList.toggle('wide', wide);
    const onSubmit = event => {
      if (event.submitter?.value !== 'ok' || !validate) return;
      const problem = validate(form);
      if (problem) {
        event.preventDefault();
        const box = $('.dlg-error', form) || $('#dlgBody').appendChild(Object.assign(document.createElement('div'), { className: 'note e dlg-error' }));
        box.textContent = problem;
      }
    };
    // Enter v poli potvrdí dialog; jinak by se odeslal první (Zrušit) z tlačítek.
    const onKey = event => {
      if (event.key !== 'Enter' || event.isComposing || event.target.tagName !== 'INPUT' || $('#dlgOk').hidden) return;
      event.preventDefault();
      form.requestSubmit($('#dlgOk'));
    };
    form.addEventListener('submit', onSubmit);
    form.addEventListener('keydown', onKey);
    dlg.addEventListener('close', () => {
      form.removeEventListener('submit', onSubmit);
      form.removeEventListener('keydown', onKey);
      OdmLock.stopScanner();
      resolve({ value: dlg.returnValue, form });
    }, { once: true });
    dlg.returnValue = '';
    dlg.showModal();
    if (onOpen) onOpen(dlg);
    const focus = $('[autofocus]', dlg);
    if (focus) focus.focus();
  });
}

async function confirmBox(title, text, ok = 'Potvrdit', danger = false) {
  return (await dialog({ title, html: `<p>${esc(text)}</p>`, ok, danger })).value === 'ok';
}

async function promptBox(title, label, value = '', ok = 'Uložit', placeholder = '') {
  const result = await dialog({
    title, ok,
    html: `<label class="field"><span>${esc(label)}</span><input name="value" value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="100" required autofocus></label>`,
  });
  return result.value === 'ok' ? result.form.elements.value.value.trim() : null;
}

/* ==========================================================================
   Šifrované ukládání
   ========================================================================== */
onStateChange = () => {
  store.dirty = true;
  if (!store.firstDirty) store.firstDirty = Date.now();
  clearTimeout(store.timer);
  // Hromadná změna (import, obnova, vymazání) se uloží hned a sama: v historii je jen jedním
  // záznamem, a ruční úpravy po ní tak jdou do dalšího uložení i se svými záznamy.
  store.timer = setTimeout(flushSave, store.note || Date.now() - store.firstDirty > 6000 ? 0 : 1200);
  renderSaveState();
};

async function flushSave() {
  if (!S || !store.dirty || store.saving || store.conflict) return;
  store.saving = true;
  store.dirty = false;
  store.firstDirty = 0;
  clearTimeout(store.timer);
  renderSaveState();
  // Na server jdou jen sdílená data; co se proti poslednímu uložení změnilo, přibude do historie.
  const shared = sharedState(S);
  const meta = { at: Date.now(), by: ui.me.label, card: ui.me.cardId };
  let changes = { entries: [], hist: [] };
  if (store.note) changes.entries = [{ ...meta, kind: store.note.kind || 'data', text: store.note.text }];
  else changes = describeChanges(store.base, shared, meta);
  applyHist(shared, changes.hist);
  shared.log = appendLog(shared.log, changes.entries);
  try {
    const result = await Vault.saveData(shared, store.rev);
    store.rev = result.rev;
    store.savedAt = result.saved_at;
    store.error = null;
    store.base = shared;
    store.note = null;
    if (S) { applyHist(S, changes.hist); S.log = shared.log; }
    if (changes.entries.length) renderLogBadge();
  } catch (error) {
    store.dirty = true;
    if (error.status === 426) {
      store.error = 'Aplikace byla aktualizována, obnov stránku.';
      updatedElsewhere();
    } else if (error.status === 409) {
      store.conflict = true;
      resolveConflict();
    } else if (error.status === 401) {
      store.error = 'Relace vypršela.';
      await dialog({ title: 'Aplikace se zamkla', html: '<p>Přihlášení vypršelo. Po odemčení se data načtou ze serveru; poslední změny, které se nestihly uložit, se ztratí.</p>', ok: 'Odemknout', cancel: '' });
      location.reload();
      return;
    } else {
      store.error = error.message;
      clearTimeout(store.retry);
      store.retry = setTimeout(() => { store.error = null; flushSave(); }, 8000);
    }
  } finally {
    store.saving = false;
    renderSaveState();
    if (store.dirty && !store.conflict && !store.error) onStateChange();
  }
}

async function resolveConflict() {
  const result = await dialog({
    title: 'Data se mezitím změnila',
    html: '<p>Na jiném zařízení někdo uložil novější verzi. Můžeš ji načíst (tvoje poslední změny se zahodí), nebo ji přepsat svými změnami.</p>',
    ok: 'Přepsat mými změnami', cancel: 'Načíst novější verzi',
  });
  if (result.value === 'cancel') {
    try {
      const loaded = await Vault.loadData();
      S = sanitizeState(loaded.state || {});
      applyPeriodPref();
      Object.assign(store, { rev: loaded.rev, savedAt: loaded.savedAt, dirty: false, conflict: false, error: null, base: sharedState(S), note: null });
      renderAll();
      toast('Načtena novější verze dat.');
    } catch (error) {
      toast(error.message, true);
    }
    return;
  }
  try {
    // Přepsání: historie změn z druhého zařízení se zachová, přibudou k ní naše.
    const loaded = await Vault.loadData();
    store.rev = loaded.rev;
    if (loaded.state && Array.isArray(loaded.state.log)) {
      const theirs = sanitizeState({ log: loaded.state.log }).log;
      const seen = new Set(S.log.map(x => `${x.at}|${x.card}|${x.text}`));
      S.log = theirs.filter(x => !seen.has(`${x.at}|${x.card}|${x.text}`)).concat(S.log).sort((x, y) => x.at - y.at).slice(-LOG_MAX);
    }
  } catch (error) { /* uložení to zkusí znovu */ }
  store.conflict = false;
  store.dirty = true;
  flushSave();
}

function renderSaveState() {
  const state = store.conflict ? 'conflict' : store.error ? 'error' : store.saving ? 'saving' : store.dirty ? 'dirty' : 'saved';
  const time = store.savedAt ? new Date(store.savedAt).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) : '';
  const text = {
    saved: `Uloženo a zašifrováno${time ? ` · ${time}` : ''}`,
    dirty: 'Neuložené změny…',
    saving: 'Šifruji a ukládám…',
    error: 'Neuloženo, zkouším znovu',
    conflict: 'Konflikt verzí',
  }[state];
  const box = $('#saveState');
  if (box) { box.dataset.state = state; $('span', box).textContent = text; box.title = store.error || text; }
  const dot = $('#saveDot');
  if (dot) { dot.dataset.state = state; dot.title = text; }
}

/* ==========================================================================
   Zamčení
   ========================================================================== */
let lastActivity = Date.now();

async function lockApp(auto = false) {
  if (ui.locking) return;
  if (!auto && (store.dirty || store.saving) && !store.conflict) {
    await flushSave();
    if (store.dirty && !(await confirmBox('Neuložené změny', 'Poslední změny se nepodařilo uložit a po zamčení se ztratí. Přesto zamknout?', 'Zamknout', true))) return;
  } else if (store.dirty) {
    await Promise.race([flushSave(), new Promise(resolve => setTimeout(resolve, 5000))]);
  }
  if (prefStore.dirty) { clearTimeout(prefStore.timer); await Promise.race([flushPrefs(), new Promise(resolve => setTimeout(resolve, 3000))]); }
  ui.locking = true;
  S = null;
  await Vault.lock();
  location.reload();
}

function checkIdle() {
  const minutes = P.lockMinutes || 15;
  if (Date.now() - lastActivity > minutes * 60000) lockApp(true);
}

/* ==========================================================================
   Pomocníci vykreslení
   ========================================================================== */
function jmenW(n) { return n === 1 ? 'jméno' : n >= 2 && n <= 4 ? 'jména' : 'jmen'; }
function periodName2(p) { return p ? periodName(p) : 'bez docházky'; }
function meter(ratio, label) {
  return `<div class="meter"><div class="track"><div class="fill" data-w="${clamp(ratio * 100, 0, 100).toFixed(1)}"></div></div><div class="val">${label}</div></div>`;
}
function posOptions(sel, blankLabel) {
  return `<option value="">${esc(blankLabel || '— bez pozice —')}</option>${S.positions.map(p => `<option value="${esc(p.id)}"${p.id === sel ? ' selected' : ''}>${esc(p.name || '(bez názvu)')}</option>`).join('')}`;
}
function statTile(label, value, note, tone = '') {
  return `<div class="stat${tone ? ` ${tone}` : ''}"><div class="k">${label}</div><div class="v">${value}</div><div class="n">${note}</div></div>`;
}
function emptyState(title, text, action = '') {
  return `<div class="empty"><strong>${title}</strong><p>${text}</p>${action}</div>`;
}
async function xlsx() {
  if (!window.XLSX) await OdmLock.loadScript(`app.php?f=xlsx.js&v=${document.body.dataset.privateVersion || '1'}`);
  return window.XLSX;
}

function renderAll() {
  _prodIdx = null;
  renderPeriodBits();
  renderDemoBanner();
  renderOverview();
  renderPeople();
  renderSanctions();
  renderPositions();
  renderAttendance();
  renderProduction();
  renderSettings();
  renderMatrix();
  if (ui.view === 'profil') renderProfile();
  renderSaveState();
  renderLogBadge();
}

function showView(name) {
  if (name !== 'profil' && ui.view !== 'profil') ui.prevView = name;
  else if (name === 'profil' && ui.view !== 'profil') ui.prevView = ui.view;
  ui.view = name;
  if (name === 'profil') renderProfile();
  if (name === 'matice') renderMatrix();
  $$('#nav [data-view]').forEach(button => button.setAttribute('aria-current', String(button.dataset.view === name)));
  $$('.view').forEach(view => view.classList.toggle('on', view.id === `view-${name}`));
  window.scrollTo({ top: 0, behavior: 'instant' });
  const active = $(`#nav [data-view="${name}"]`);
  if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });
  if (name === 'nastaveni') loadSecurityLists();
}

function renderDemoBanner() {
  const box = $('#demoBanner');
  if (!S.demo) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="banner"><div><b>Ukázková data.</b> Vidíš vymyšlený měsíc, ať je poznat, jak aplikace funguje. Jakmile nahraješ vlastní docházku, ukázka zmizí.</div>
    <div class="banner-actions"><button class="btn small" type="button" data-go="dochazka">Nahrát docházku</button><button class="btn sec small" type="button" id="btnClearDemo">Vymazat ukázku</button></div></div>`;
  $('#btnClearDemo').onclick = async () => {
    if (!(await confirmBox('Vymazat ukázku?', 'Smažou se ukázkoví lidé, docházka, výroba a sankce. Pozice a nastavení zůstanou (bez ukázkového navýšení platu).', 'Vymazat'))) return;
    // Pozice, nastavení a důvody sankcí zůstávají (jak slibuje dialog), mizí jen ukázkoví lidé a jejich data.
    const keep = { positions: S.positions, settings: S.settings, sanReasons: S.sanReasons };
    dropDemoRaise(keep.positions);
    S = Object.assign(blank(), keep); setPeriod(null);
    store.note = { kind: 'data', text: 'Ukázková data vymazána' };
    save(); ui.selPerson = null; renderAll(); toast('Ukázka smazána. Nahraj docházku.');
  };
}

function renderPeriodBits() {
  const p = curPeriod();
  const select = $('#periodSel');
  const ids = Object.keys(S.periods).sort().reverse();
  select.innerHTML = ids.length ? ids.map(id => `<option value="${esc(id)}"${id === S.current ? ' selected' : ''}>${esc(periodName(S.periods[id]))}</option>`).join('') : '<option value="">— žádné období —</option>';
  select.disabled = !ids.length;
  $('#btnDelPeriod').disabled = !p;
  const unassigned = Object.values(S.employees).filter(e => !e.excluded && (!e.positionId || !e.level)).length;
  const badge = $('#navPeople');
  badge.hidden = !unassigned;
  badge.textContent = String(unassigned);
  badge.title = `${unassigned} bez pozice nebo úrovně`;
}

/* ==========================================================================
   PŘEHLED
   ========================================================================== */
const SUMF = (rows, f) => rows.reduce((x, r) => x + (+f(r) || 0), 0);

function ovColumns() {
  const c = [
    { k: 'rank', t: '#', cls: 'rank', cell: (r, i) => i + 1 },
    { k: 'name', t: 'Zaměstnanec', sort: true, cls: 'name',
      cell: r => `<div class="who"><b>${esc(r.e.last)} ${esc(r.e.first)}</b><span class="pos">${r.pos ? esc(r.pos.name) : '<span class="crit">nezařazen</span>'}${r.e.shortFri ? ` · <span title="Zkrácený pátek: ${nf(friShift())} h = celá směna">pá ${nf(friShift())} h</span>` : ''}${r.p && r.att && !r.att.found ? ' · bez docházky' : ''}</span></div>`,
      foot: rows => `<b>Celkem ${rows.length} lidí</b>` },
    { k: 'days', t: 'Dny', sort: true, cls: 'r', hint: 'Odpracované všední dny',
      cell: r => (r.att && r.att.found ? `<span class="num">${r.att.workDays}</span>` : '<span class="muted">—</span>'),
      foot: rows => `<span class="num">${SUMF(rows, r => (r.att ? r.att.workDays : 0))}</span>` },
    { k: 'hours', t: 'Hodiny', sort: true, cls: 'r', hint: 'Odpracované hodiny celkem včetně víkendů',
      cell: r => (r.att && r.att.found ? `<span class="num">${nf(r.att.totalHours)}</span>` : '<span class="muted">—</span>'),
      foot: rows => `<span class="num">${nf(SUMF(rows, r => (r.att ? r.att.totalHours : 0)))}</span>` },
    { k: 'wk', t: 'Víkend', sort: true, cls: 'r', hint: 'Odpracované víkendové a sváteční směny',
      cell: r => (!(r.att && r.att.found) ? '<span class="muted">—</span>' : r.att.wkDays ? `<span class="tag wk">${r.att.wkDays}×</span>` : '<span class="muted num">0</span>'),
      foot: rows => `<span class="num">${SUMF(rows, r => (r.att ? r.att.wkDays : 0))}</span>` },
    { k: 'kafe', t: 'Kafe', sort: true, cls: 'c', hint: 'Splnil minimální počet hodin',
      cell: r => kafeCell(r),
      foot: rows => { const n = rows.filter(r => r.kafe).length; return n ? `<span class="num">${n}×</span>` : ''; } },
    { k: 'lvl', t: 'Úroveň', sort: true, hint: 'Úroveň v pozici a její tabáky',
      cell: r => (r.L.n ? `<span class="lvlcell" title="${esc(r.L.lv.name)}"><span class="lvl l${r.L.n}">${r.L.n}</span><span class="lvlname">${esc(r.L.lv.name)}</span>${r.kafeOnly ? '' : `<b class="num">${r.L.base}</b>`}</span>` : `<span class="muted small">${r.pos ? 'bez úrovně' : '—'}</span>`),
      foot: rows => `<span class="num">${SUMF(rows, r => r.L.base)}</span>` },
  ];
  const unmatched = prodPeriod() ? prodUnmatched().length : 0;
  if (prodPeriod()) c.push({ k: 'prod', t: 'Ø ks/den', sort: true, cls: 'r', hint: 'Vyrobené kusy dělené odpracovanými dny z docházky',
    cell: r => {
      if (!r.prod) return unmatched ? `<button class="warnbtn" type="button" data-pairopen="${esc(r.e.key)}" title="Nespárováno s evidencí práce, kliknutím přiřadíš jméno">!</button>` : '<span class="muted" title="V evidenci práce za tenhle měsíc nemá žádný záznam">—</span>';
      const a = avgPerDay(r.prod, r.att);
      return a == null ? `<span class="muted" title="${esc(avgTitle(r.prod, r.att))}">—</span>` : `<span class="num" title="${esc(avgTitle(r.prod, r.att))}">${nf(a, 1)}</span>`;
    },
    foot: rows => { const t = SUMF(rows, r => (r.prod ? r.prod.total : 0)); const d = SUMF(rows, r => (r.prod ? workedDays(r.att) : 0)); return d ? `<span class="num">${nf(t / d, 1)}</span>` : ''; } });
  c.push(
    { k: 'att', t: 'Docházka', sort: true, cls: 'r', hint: 'Automatická srážka nebo bonus podle pravidel pozice, nejvýš do maxima pozice',
      cell: r => (r.lost ? `<span class="losttag" title="${esc(attExplain(r))}">bez nároku</span>` : deltaCell(r.attEff, attExplain(r)) + (r.capped ? `<span class="captag" title="${esc(`Zastropováno na maximum pozice ${r.max}`)}">max</span>` : '')),
      foot: rows => { const v = SUMF(rows, r => r.attEff); return v ? deltaCell(v, '') : ''; } },
    { k: 'pen', t: 'Sankce', sort: true, cls: 'r', hint: 'Srážky z nároku za vybraný měsíc (10 / 30 / 50 %)',
      cell: r => ((r.pctSum || r.legacy) ? `<span class="pen" title="${esc(`${reasonsOf(r.e.key)} → −${r.pen} ${tabW(r.pen)}`)}">${r.pctSum ? `−${r.pctSum} %` : ''}</span> <span class="muted small num">(−${r.pen})</span>` : '<span class="muted num">0</span>'),
      foot: rows => { const v = SUMF(rows, r => r.pen); return v ? `<span class="pen">−${v}</span>` : ''; } },
    { k: 'adj', t: 'Ruční úprava', cls: 'c', hint: 'Přidat nebo ubrat tabáky nad rámec výpočtu',
      cell: r => (r.kafeOnly ? '<span class="muted">—</span>' : adjCtrl(r)),
      foot: rows => { const v = SUMF(rows, r => r.adj); return v ? `<span class="num">${sgn(v)}</span>` : ''; } },
    { k: 'score', t: 'Tabáky', sort: true, cls: 'score', hint: 'Úroveň ± docházka (nejvýš do maxima) − sankce ± ruční úprava',
      cell: r => (r.kafeOnly ? `<span class="onlykafe" title="${esc(`Pozice ${r.pos.name} nemá tabáky, hodnotí se jen Kafe`)}">jen Kafe</span>` : meter(r.max ? r.total / r.max : 0, `<b>${nf(r.total, 0)}</b> <small>/ ${nf(r.max, 0)}</small>`)),
      foot: rows => `<b class="num">${nf(SUMF(rows, r => r.total), 0)} ${tabW(SUMF(rows, r => r.total))}</b>` },
    ...(S.positions.some(hasRaise) ? [{ k: 'raise', t: 'Plat', sort: true, cls: 'r', hint: 'Navýšení platu podle úrovně a splněných podmínek (docházka, plnění normy, využití fondu)',
      cell: r => raiseCell(r),
      foot: rows => { const n = rows.filter(r => r.raise.pct > 0).length; return n ? `<span class="num" title="Lidí s navýšením">${n}×</span>` : ''; } }] : []),
    { k: 'iss', t: 'Výdej', sort: true, cls: 'c', hint: 'Potvrzení, že byl benefit vydán',
      cell: r => issueCell(r),
      foot: rows => { const n = rows.filter(r => r.issued).length; const of = rows.filter(r => r.toIssue || r.issued).length; return of ? `<span class="num">${n} / ${of}</span>` : ''; } },
  );
  return c;
}

function issueCell(r) {
  if (!r.p) return '<span class="muted">—</span>';
  const k = esc(r.e.key);
  if (r.issued) {
    const was = issueWhat(r.issued.tabaky, r.issued.kafe);
    return `<span class="issued-box"><span class="issued" title="${esc(`Vydáno ${new Date(r.issued.at).toLocaleString('cs-CZ')}: ${was}`)}">${I.check}vydáno <small>${shortDate(r.issued.at)}</small></span>${r.issuedChanged ? `<span class="chgtag" title="${esc(`Od výdeje se hodnocení změnilo: vydáno ${was}, teď ${issueWhat(r.total, r.kafe)}`)}">změna</span>` : ''}<button class="linkbtn" type="button" data-unissue="${k}" title="Zrušit potvrzení výdeje">zrušit</button></span>`;
  }
  if (!r.toIssue) return '<span class="muted small">nic k výdeji</span>';
  return `<button class="issuebtn" type="button" data-issue="${k}" title="${esc(`Potvrdit, že dostal ${issueWhat(r.total, r.kafe)}`)}">Potvrdit výdej</button>`;
}

async function handleExcludeClick(event) {
  const button = event.target.closest('[data-exclude],[data-include]');
  if (!button) return false;
  if (button.dataset.exclude) {
    if (!(await confirmBox('Vyřadit ze seznamu?', `${nameOf(button.dataset.exclude)} se přestane hodnotit. Data zůstanou a vrátit ho jde v části Lidé.`, 'Vyřadit'))) return true;
    setExcluded(button.dataset.exclude, true);
  } else {
    setExcluded(button.dataset.include, false);
  }
  return true;
}

function setExcluded(key, on) {
  const e = S.employees[key];
  if (!e) return;
  if (on) e.excluded = true; else delete e.excluded;
  save();
  renderAll();
  toast(on ? `${e.last} ${e.first} je vyřazen ze seznamu. Vrátit jde v části Lidé.` : `${e.last} ${e.first} je zpátky v seznamu.`);
}

async function handleIssueClick(event) {
  const button = event.target.closest('[data-issue],[data-unissue]');
  if (!button) return false;
  if (button.dataset.issue) {
    const r = allRows().find(x => x.e.key === button.dataset.issue);
    if (!r) return true;
    setIssued(r.e.key, { at: Date.now(), tabaky: r.total, kafe: r.kafe, pos: r.e.positionId || undefined, lvl: r.e.level || undefined });
    renderAll();
    toast(`${nameOf(r.e.key)}: vydáno ${issueWhat(r.total, r.kafe)}.`);
  } else {
    const key = button.dataset.unissue;
    if (!(await confirmBox('Zrušit potvrzení výdeje?', `U ${nameOf(key)} se výdej znovu ukáže jako nevydaný.`, 'Zrušit potvrzení'))) return true;
    setIssued(key, null);
    renderAll();
    toast('Potvrzení výdeje zrušeno.');
  }
  return true;
}

const LOCKED_COLS = ['rank', 'name', 'score'];
function visibleColumns() {
  const hidden = new Set(P.hiddenCols || []);
  return ovColumns().filter(c => LOCKED_COLS.includes(c.k) || !hidden.has(c.k));
}

function renderColPicker() {
  const hidden = new Set(P.hiddenCols || []);
  const optional = ovColumns().filter(c => !LOCKED_COLS.includes(c.k));
  const count = optional.filter(c => hidden.has(c.k)).length;
  $('#colSum').textContent = `Sloupce${count ? ` (${count} skryté)` : ''}`;
  $('#colPanel').innerHTML = `<p class="eyebrow">Zobrazit v přehledu</p>${optional.map(c => `<label class="colopt"><input type="checkbox" data-col="${esc(c.k)}"${hidden.has(c.k) ? '' : ' checked'}><span>${esc(c.t)}</span></label>`).join('')}
    <p class="tiny muted">Jméno a Tabáky jsou vidět vždy. Výběr platí jen pro tvou kartičku; export do Excelu obsahuje všechny sloupce.</p>
    <div class="row"><button class="btn ghost small" type="button" id="colAll">Zobrazit vše</button><button class="btn ghost small" type="button" id="colCompact" title="Skryje Dny, Víkend, Úroveň a Ø ks/den">Úsporné</button></div>`;
  $$('#colPanel [data-col]').forEach(box => {
    box.onchange = () => {
      const set = new Set(P.hiddenCols || []);
      if (box.checked) set.delete(box.dataset.col); else set.add(box.dataset.col);
      setPref({ hiddenCols: [...set] });
      renderOverview();
    };
  });
  $('#colAll').onclick = () => { setPref({ hiddenCols: [] }); renderOverview(); };
  $('#colCompact').onclick = () => { setPref({ hiddenCols: ['days', 'wk', 'lvl', 'prod'] }); renderOverview(); };
}

function deltaCell(v, title) {
  const t = title ? ` title="${esc(title)}"` : '';
  if (v > 0) return `<span class="dplus"${t}>+${v}</span>`;
  if (v < 0) return `<span class="pen"${t}>−${Math.abs(v)}</span>`;
  return `<span class="muted num"${t}>0</span>`;
}

function kafeCell(r) {
  if (!(r.att && r.att.found)) return '<span class="muted">—</span>';
  if (r.lost) return `<span class="kafe-no" title="${esc(attExplain(r))}">—</span>`;
  const t = `${nf(r.att.totalHours)} h z ${nf(r.kafeTh)} h`;
  return r.kafe ? `<span class="kafe-ok" title="${esc(`Splněno: ${t}`)}" aria-label="Kafe splněno">${I.kafe}</span>` : `<span class="kafe-no" title="${esc(`Chybí ${nf(r.kafeTh - r.att.totalHours)} h (${t})`)}">—</span>`;
}

function ovData() {
  const q = norm($('#ovSearch').value);
  const position = S.positions.some(p => p.id === P.pos) ? P.pos : '';
  let rows = activeRows();
  if (P.onlyImported && curPeriod()) rows = rows.filter(r => r.att && r.att.found);
  if (P.onlyOpen) rows = rows.filter(r => (r.toIssue && !r.issued) || r.issuedChanged);
  if (position) rows = rows.filter(r => r.e.positionId === position);
  if (q) rows = rows.filter(r => norm(`${r.e.last} ${r.e.first}`).includes(q));
  const { k, dir } = P.sort;
  const val = r => ({
    name: norm(`${r.e.last} ${r.e.first}`), days: r.att ? r.att.workDays : -1, hours: r.att ? r.att.totalHours : -1,
    wk: r.att ? r.att.wkDays : -1, kafe: r.kafe ? 1 : 0, lvl: r.L.n * 1000 + r.L.base, att: r.attEff,
    prod: r.prod ? (avgPerDay(r.prod, r.att) ?? -0.5) : -1, pen: r.pctSum * 1000 + r.pen, score: r.total, adj: r.adj,
    iss: r.issued ? (r.issuedChanged ? 1 : 2) : (r.toIssue ? 0 : -1),
    raise: r.raise.pct * 10 + r.raise.lvl,
  }[k]);
  rows.sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (typeof x === 'string') return dir * x.localeCompare(y, 'cs');
    return dir * (x - y) || norm(a.e.last).localeCompare(norm(b.e.last), 'cs');
  });
  return rows;
}

function renderTodo(all) {
  const items = [];
  if (!Object.keys(S.periods).length) items.push(['Nahraj docházku', 'Bez ní se nespočítají dny, víkendy ani Kafe.', 'dochazka']);
  const noPos = all.filter(r => !r.pos).length;
  const noLvl = all.filter(r => r.pos && !r.L.n).length;
  if (noPos) items.push([`Zařaď ${noPos} ${noPos === 1 ? 'člověka' : 'lidí'} na pozici`, 'Bez pozice nemají základ tabáků.', 'lide']);
  if (noLvl) items.push([`Doplň úroveň u ${noLvl} ${noLvl === 1 ? 'člověka' : 'lidí'}`, 'Úroveň 1–4 určuje základ tabáků.', 'lide']);
  const unmatched = prodPeriod() ? prodUnmatched().length : 0;
  if (unmatched) items.push([`Spáruj ${unmatched} ${jmenW(unmatched)} z výroby`, 'Jména z evidence práce, která nesedí na nikoho v hodnocení.', 'vyroba']);
  $('#todo').innerHTML = items.length && !S.demo ? `<div class="todo"><p class="eyebrow">Co zbývá udělat</p><div class="todo-list">${items.map(([title, text, view]) => `<button type="button" class="todo-item" data-go="${view}"><span><b>${esc(title)}</b><small>${esc(text)}</small></span>${I.arrow}</button>`).join('')}</div></div>` : '';
}

function renderOverview() {
  const p = curPeriod();
  const sort = visibleColumns().some(c => c.k === P.sort.k) ? P.sort : { k: 'score', dir: -1 };
  if (sort !== P.sort) P.sort = sort;
  const select = $('#ovPos');
  select.innerHTML = posOptions(P.pos, 'Všechny pozice');
  select.value = S.positions.some(p => p.id === P.pos) ? P.pos : '';
  $('#ovOnlyImported').checked = P.onlyImported;
  $('#ovOnlyOpen').checked = P.onlyOpen;
  $('#ovTitle').textContent = p ? periodName(p) : 'Zatím bez docházky';
  const meta = p ? periodMeta(p) : null;
  $('#ovLede').innerHTML = p
    ? `Pracovních dnů ${meta.work}, fond ${nf(meta.fund)} h (směna ${nf(S.settings.shift)} h), sobot ${meta.sats}${meta.hols ? `, svátků ve všední den ${meta.hols}` : ''}. Tabáky = úroveň ± docházka − sankce ± ruční úprava.${cutoffDays() ? ` Od ${cutoffDays()} dní absence bez nároku na tabák i kafe.` : ''}`
    : 'Nahraj docházku v části <b>Docházka</b>. Zařazení na pozice a úrovně zůstává uložené napříč měsíci.';

  $('#kafeCtl').hidden = !p;
  if (p) {
    const input = $('#kafeTh');
    if (document.activeElement !== input) input.value = n2(kafeThreshold(p));
    $('#kafeHint').textContent = kafeIsCustom(p) ? `vlastní práh, fond je ${nf(meta.fund)} h` : '= měsíční fond';
    $('#kafeReset').hidden = !kafeIsCustom(p);
  }

  const rows = ovData();
  const all = activeRows();
  renderTodo(all);
  const noPos = all.filter(r => !r.pos).length;
  const noLvl = all.filter(r => r.pos && !r.L.n).length;
  const sum = SUMF(rows, r => r.total);
  const kafeN = rows.filter(r => r.kafe).length;
  const kafeOf = rows.filter(r => r.att && r.att.found).length;
  const bon = rows.filter(r => r.attEff > 0);
  const mal = rows.filter(r => r.attEff < 0);
  const sumPen = SUMF(rows, r => r.pen);
  const sumAdj = SUMF(rows, r => r.adj);
  const sanN = rows.reduce((x, r) => x + r.sans.length, 0);
  const sanPeople = rows.filter(r => r.sans.length).length;
  const filtered = rows.length !== all.length;
  const iss = rows.filter(r => r.issued).length;
  const issOf = rows.filter(r => r.toIssue || r.issued).length;
  const chg = rows.filter(r => r.issuedChanged).length;
  $('#ovStats').innerHTML = [
    statTile(`${I.tab}Tabáky celkem`, `${nf(sum, 0)}<em>/ ${nf(SUMF(rows, r => r.max), 0)}</em>`, `${filtered ? `za ${rows.length} vybraných lidí` : `za ${rows.length} lidí, z maxim pozic`}${noPos ? `, ${noPos}× bez pozice` : ''}${noLvl ? `, ${noLvl}× bez úrovně` : ''}`, 'tab'),
    statTile(`${I.kafe}Kafe`, p ? `${kafeN}<em>/ ${kafeOf}</em>` : '—', p ? `splnili ${nf(kafeThreshold(p))} h` : 'bez docházky', 'kafe'),
    statTile('Bonus za víkendy', p ? `+${SUMF(bon, r => r.attEff)}` : '—', p ? `${bon.length} lidí, po stropu pozice` : 'bez docházky', 'good'),
    statTile('Srážky za docházku', p ? (mal.length ? `−${Math.abs(SUMF(mal, r => r.attEff))}` : '0') : '—', p ? `${mal.length} lidí${rows.some(r => r.lost) ? `, z toho ${rows.filter(r => r.lost).length} bez nároku` : ''}` : 'bez docházky', mal.length ? 'crit' : ''),
    statTile('Sankce', `${sumPen ? `−${sumPen}` : '0'}${sumAdj ? `<em>úprava ${sgn(sumAdj)}</em>` : ''}`, sanN ? `${sanN} sankcí u ${sanPeople} lidí` : 'žádné sankce'),
    statTile('Výdej', p ? `${iss}<em>/ ${issOf}</em>` : '—', !p ? 'bez docházky' : chg ? `${chg}× změna od výdeje` : (issOf - iss > 0 ? `zbývá vydat ${issOf - iss}` : 'vše vydáno'), chg ? 'warn' : ''),
  ].join('');

  const cols = visibleColumns();
  renderColPicker();
  const excluded = excludedPeople();
  $('#ovExcluded').innerHTML = excluded.length ? `<p class="hint">Vyřazeno ze seznamu (${excluded.length}): ${excluded.map(e => esc(`${e.last} ${e.first}`)).join(', ')}. Vrátit je můžeš v části <button class="link" type="button" data-go="lide">Lidé</button>.</p>` : '';
  $('#ovHead').innerHTML = cols.map(c => {
    const active = P.sort.k === c.k;
    return `<th class="${c.cls || ''} col-${c.k}${c.sort ? ' sortable' : ''}"${c.sort ? ` data-sort="${c.k}" tabindex="0" role="button" aria-sort="${active ? (P.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}"` : ''}${c.hint ? ` title="${esc(c.hint)}"` : ''}>${esc(c.t)}${active ? ` <span class="ar">${P.sort.dir > 0 ? '▲' : '▼'}</span>` : ''}</th>`;
  }).join('');

  if (!rows.length) {
    $('#ovBody').innerHTML = `<tr class="empty-row"><td colspan="${cols.length}">${all.length ? 'Filtru nic neodpovídá.' : 'Zatím tu nikdo není. Nahraj docházku.'}</td></tr>`;
    $('#ovFoot').innerHTML = '';
    return;
  }
  $('#ovBody').innerHTML = rows.map((r, i) => `<tr data-key="${esc(r.e.key)}" class="${r.lost ? 'is-lost' : ''}">${cols.map(c => `<td class="${c.cls || ''} col-${c.k}" data-label="${esc(c.t)}">${c.cell(r, i)}</td>`).join('')}</tr>`).join('');
  $('#ovFoot').innerHTML = `<tr>${cols.map(c => `<td class="${c.cls || ''} col-${c.k}" data-label="${esc(c.t)}">${c.foot ? c.foot(rows) : ''}</td>`).join('')}</tr>`;
  if (ui.openDetail) openDetail(ui.openDetail);
  setWidths($('#ovTable'));
}

function openDetail(key) {
  $$('#ovBody tr.detail').forEach(row => row.remove());
  $$('#ovBody tr.open').forEach(row => row.classList.remove('open'));
  const tr = $$('#ovBody tr[data-key]').find(row => row.dataset.key === key);
  const r = allRows().find(x => x.e.key === key);
  if (!tr || !r) { ui.openDetail = null; return; }
  ui.openDetail = key;
  tr.classList.add('open');
  tr.insertAdjacentHTML('afterend', ovDetailRow(r));
  setWidths(tr.nextElementSibling);
}

function bumpAdj(key, dir) {
  const r = allRows().find(x => x.e.key === key);
  if (!r) return;
  const step = S.settings.adjStep || 1;
  setAdj(key, clamp(adjOf(key) + dir * step, r.adjMin, r.adjMax));
}

function adjCtrl(r) {
  const step = S.settings.adjStep || 1;
  const canDn = r.adj > r.adjMin;
  const canUp = r.adj < r.adjMax;
  const cls = r.adj > 0 ? 'up' : r.adj < 0 ? 'dn' : 'zero';
  return `<span class="adj"><button class="stepbtn" type="button" data-adj="${esc(r.e.key)}" data-dir="-1" aria-label="Ubrat ${step} ${tabW(step)}"${canDn ? '' : ' disabled'}>−</button><span class="adjv ${cls}">${r.adj ? sgn(r.adj) : '0'}</span><button class="stepbtn" type="button" data-adj="${esc(r.e.key)}" data-dir="1" aria-label="Přidat ${step} ${tabW(step)}"${canUp ? '' : ' disabled'}>+</button></span>`;
}

function attKv(r) {
  const a = r.att;
  const t = r.at;
  if (!(a && a.found)) return '<p class="muted small">Pro vybraný měsíc nemá nahranou docházku.</p>';
  const codes = Object.entries(a.codes);
  return `<dl class="kv">
    <dt>Odpracováno celkem</dt><dd>${nf(a.totalHours)} h</dd>
    <dt>Kafe (práh ${nf(r.kafeTh)} h)</dt><dd>${r.kafe ? `<span class="kafe-ok">${I.kafe}</span>` : r.lost ? '<span class="pen">bez nároku</span>' : '<span class="muted">nesplněno</span>'}</dd>
    <dt>Všední dny</dt><dd>${nf(a.cappedHours)} / ${nf(a.fund)} h</dd>
    ${a.shortFri ? `<dt class="sub">zkrácený pátek</dt><dd>${a.fridays}× ${nf(friShift())} h</dd>` : ''}
    <dt>Absence (dny bez docházky)</dt><dd>${t.gross}</dd>
    ${a.shortDays ? `<dt class="sub">kratší směny (jen pro Kafe)</dt><dd>${a.shortDays}×, −${nf(a.shortHours)} h</dd>` : ''}
    <dt>Víkendové směny</dt><dd>${a.wkDays} (${nf(a.wkHours)} h)</dd>
    ${t.filled ? `<dt class="sub">z toho vyplnily absenci</dt><dd>${t.filled}</dd>` : ''}
    ${t.missing ? `<dt>Absence po vyplnění</dt><dd>${t.missing}</dd>` : `<dt>Víkend. směn navíc</dt><dd>${t.wkLeft}</dd>`}
    ${codes.length ? `<dt>Kódy v docházce</dt><dd>${codes.map(c => `${esc(c[0])}×${c[1]}`).join(', ')}</dd>` : ''}
    <dt class="tot">Tabáky za docházku</dt><dd class="tot">${t.delta > 0 ? '+' : t.delta < 0 ? '−' : ''}${Math.abs(t.delta)}</dd>
  </dl><p class="explain">${esc(attExplain(r))}</p>`;
}

function lvlKv(r) {
  if (!r.pos) return '<p class="muted small">Nemá pozici. Zařaď ho v části <b>Lidé</b>.</p>';
  if (!r.L.n) return `<p class="muted small">Pozice ${esc(r.pos.name)}, ale bez úrovně. Vyber úroveň v části <b>Lidé</b>.</p>`;
  return `<div class="lvlcell big"><span class="lvl l${r.L.n}">${r.L.n}</span><b>${esc(r.L.lv.name)}</b><span class="muted">· ${esc(r.pos.name)}</span></div>
    ${r.L.lv.desc ? `<p class="small">${esc(r.L.lv.desc)}</p>` : ''}
    <dl class="kv"><dt class="tot">Základ za úroveň</dt><dd class="tot">${r.L.base}</dd></dl>`;
}

/* ==========================================================================
   NAVÝŠENÍ PLATU (podle úrovně a splněných podmínek)
   ========================================================================== */
function raiseTip(r) {
  const x = r.raise;
  if (!x.own) return 'Úroveň nemá navýšení platu';
  const cond = c => `${c.label} ${pctText(c.val)} (potřeba ${nf(c.min, 1)} %)${c.ok ? '' : ' ✗'}`;
  const head = `Úroveň ${x.own.lvl}: +${nf(x.own.pct, 1)} %${x.own.checks.length ? ` · ${x.own.checks.map(cond).join(', ')}` : ', bez podmínek'}`;
  if (x.pct > 0 && x.lvl !== x.own.lvl) return `${head}\nNesplněno, platí úroveň ${x.lvl}: +${nf(x.pct, 1)} %`;
  return x.pct > 0 ? head : `${head}\nNesplněno, žádné navýšení`;
}

function raiseCell(r) {
  if (!r.pos || !r.L.n || !hasRaise(r.pos)) return '<span class="muted">—</span>';
  const x = r.raise;
  const tip = esc(raiseTip(r));
  if (!(x.pct > 0)) return `<span class="raise-no" title="${tip}">0 %</span>`;
  return `<span class="raise-cell" title="${tip}"><span class="raise-ok">+${nf(x.pct, 1)} %</span>${x.own && x.lvl !== x.own.lvl ? `<small class="raise-lvl">z ú. ${x.lvl}</small>` : ''}</span>`;
}

function raiseKv(r) {
  const x = r.raise;
  const pf = r.perf;
  const lv = x.own ? r.pos.levels[x.own.lvl - 1] : null;
  const rows = PERF_KEYS.map(([k, label, f]) => {
    const min = lv ? lv[f] : null;
    const val = pf[k];
    const ok = min == null ? null : val != null && val >= min - 1e-9;
    return `<dt>${esc(label[0].toUpperCase() + label.slice(1))}${min != null ? ` <small class="muted">≥ ${nf(min, 1)} %</small>` : ''}</dt><dd>${val == null ? '<span class="muted">—</span>' : `<span class="${ok === false ? 'pen' : ok ? 'dplus' : ''}">${nf(val, 1)} %</span>`}</dd>`;
  }).join('');
  const notes = [];
  if (!pf.time) notes.push(prodPeriod() ? 'Evidence práce za tento měsíc nemá sloupec se stráveným časem, plnění normy a využití fondu se nespočítá.' : 'Pro tento měsíc není nahraná evidence práce, plnění normy a využití fondu se nespočítá.');
  else if (pf.norm == null) notes.push('V evidenci práce nejsou řádky se stráveným časem i normou, plnění normy se nespočítá.');
  let verdict = '';
  if (!r.pos || !r.L.n) verdict = '<p class="muted small">Bez pozice nebo úrovně se navýšení neurčí.</p>';
  else if (!hasRaise(r.pos)) verdict = '<p class="muted small">Pozice nemá u úrovní nastavené navýšení platu (Pozice).</p>';
  else if (!x.own) verdict = `<p class="muted small">Úroveň ${r.L.n} ani nižší nemají navýšení platu.</p>`;
  else if (x.pct > 0 && x.lvl === x.own.lvl) verdict = `<p class="explain">Splněny podmínky úrovně ${x.lvl}.</p>`;
  else if (x.pct > 0) verdict = `<p class="explain">Podmínky úrovně ${x.own.lvl} (+${nf(x.own.pct, 1)} %) nesplněny: ${esc(x.own.checks.filter(c => !c.ok).map(c => `${c.label} ${pctText(c.val)} z ${nf(c.min, 1)} %`).join(', '))}. Platí nižší úroveň ${x.lvl}.</p>`;
  else verdict = `<p class="explain">Podmínky nesplněny: ${esc(x.own.checks.filter(c => !c.ok).map(c => `${c.label} ${pctText(c.val)} z ${nf(c.min, 1)} %`).join(', '))}.</p>`;
  return `<dl class="kv">${rows}<dt class="tot">Navýšení platu</dt><dd class="tot">${x.pct > 0 ? `+${nf(x.pct, 1)} %` : '0 %'}</dd></dl>${verdict}${notes.map(n => `<p class="small muted">${esc(n)}</p>`).join('')}`;
}

function sumKv(r) {
  if (r.kafeOnly) {
    return `<p class="small">Pozice <b>${esc(r.pos.name)}</b> nemá tabáky, hodnotí se jen Kafe.</p>
    <dl class="kv"><dt class="tot">Kafe</dt><dd class="tot">${r.kafe ? `<span class="kafe-ok">${I.kafe}</span>` : r.lost ? '<span class="pen">bez nároku</span>' : '<span class="muted">nesplněno</span>'}</dd></dl>
    ${r.issued ? `<div class="note ${r.issuedChanged ? 'w' : 'i'}"><b>Vydáno ${new Date(r.issued.at).toLocaleDateString('cs-CZ')}:</b> ${issueWhat(r.issued.tabaky, r.issued.kafe)}.</div>` : ''}`;
  }
  return `<div class="total-big"><span class="num">${nf(r.total, 0)}</span> <span class="muted">${tabW(r.total)}</span></div>
    ${meter(r.max ? r.total / r.max : 0, `z ${r.max} max. pozice`)}
    <dl class="kv">
      <dt>Úroveň</dt><dd>${r.L.base}</dd>
      <dt>Docházka</dt><dd>${r.at.delta ? sgn(r.at.delta) : '0'}</dd>
      ${r.lost ? `<dt>Absence ${r.at.missing} ${dnW(r.at.missing)} (hranice ${r.cut})</dt><dd><span class="pen">bez nároku</span></dd>` : ''}
      ${r.capped ? `<dt>Strop pozice</dt><dd>${r.max}</dd>` : ''}
      <dt class="tot">Nárok</dt><dd class="tot">${r.narok}</dd>
      ${r.pctSum ? `<dt>Sankce −${r.pctSum} %</dt><dd><span class="pen">${r.sanT ? `−${r.sanT}` : '0'}</span></dd>` : ''}
      ${r.legacy ? `<dt>Sankce (starý záznam)</dt><dd><span class="pen">−${r.legacy}</span></dd>` : ''}
      <dt>Ruční úprava</dt><dd>${r.adj ? sgn(r.adj) : '0'}</dd>
      <dt class="tot">Tabáky</dt><dd class="tot">${r.total}</dd>
    </dl>
    ${r.total > r.max ? `<p class="explain">O ${r.total - r.max} nad maximum pozice díky ruční úpravě (povoleno nejvýš +${+S.settings.adjOver || 0}).</p>` : ''}
    ${r.sans.length ? `<ul class="sanlist">${r.sans.map(s => `<li>${esc(sanLabel(s))}</li>`).join('')}</ul>` : ''}
    ${r.pctSum && r.pctSum < 100 && r.narok ? `<p class="explain">${r.pctSum} % z ${r.narok} = ${nf(r.narok * r.pctSum / 100, 1)} → strženo ${r.sanT} (zaokrouhleno, aspoň 1 za každou sankci)</p>` : ''}
    ${r.issued ? `<div class="note ${r.issuedChanged ? 'w' : 'i'}"><b>Vydáno ${new Date(r.issued.at).toLocaleDateString('cs-CZ')}:</b> ${issueWhat(r.issued.tabaky, r.issued.kafe)}.${r.issuedChanged ? ` Hodnocení se od té doby změnilo, teď vychází ${issueWhat(r.total, r.kafe)}.` : ''}</div>` : ''}`;
}

function ovDetailRow(r) {
  const a = r.att;
  const p = curPeriod();
  return `<tr class="detail"><td colspan="${visibleColumns().length}"><div class="detail-grid">
    <div><p class="eyebrow">Docházka</p>${attKv(r)}</div>
    <div><p class="eyebrow">Úroveň</p>${lvlKv(r)}</div>
    <div><p class="eyebrow">${r.kafeOnly ? 'Kafe' : 'Tabáky'}</p>${sumKv(r)}
      <div class="row gap">${r.kafeOnly ? '' : adjCtrl(r)}<button class="btn sec small" type="button" data-edit="${esc(r.e.key)}">Upravit zařazení</button><button class="btn sec small" type="button" data-profile="${esc(r.e.key)}">Profil a historie</button>${issueCell(r)}</div>
      <button class="btn ghost small" type="button" data-exclude="${esc(r.e.key)}" title="Přestane se hodnotit, data zůstanou; vrátit jde v části Lidé">Vyřadit ze seznamu</button>
    </div>
    ${(r.pos && hasRaise(r.pos)) || r.perf.time ? `<div><p class="eyebrow">Navýšení platu</p>${raiseKv(r)}</div>` : ''}
    ${r.prod ? `<div><p class="eyebrow">Výroba · mimo tabáky</p>${prodKv(r)}</div>` : pairBlock(r)}
    ${a && a.found && p ? `<div class="span-all"><p class="eyebrow">Měsíc po dnech</p>${calStrip(a)}</div>` : ''}
  </div></td></tr>`;
}

function pairBlock(r) {
  if (!prodPeriod()) return '';
  const unmatched = prodUnmatched();
  return `<div class="span-all"><p class="eyebrow">Výroba · nespárováno</p>${unmatched.length
    ? `<p class="small muted">${esc(`${r.e.last} ${r.e.first}`)} nemá v evidenci práce za ${esc(monthLabel(prodPeriod().id))} žádný záznam. Vyber jméno, pod kterým je tam vedený. Volba platí i pro další měsíce.</p>
      <div class="row gap"><select data-pairfor="${esc(r.e.key)}"><option value="">— jméno v evidenci —</option>${unmatched.map(rec => `<option value="${esc(norm(rec.name))}">${esc(prodLabel(rec.name))} · ${nf(rec.total, 0)} ks</option>`).join('')}</select><button class="btn sec small" type="button" data-pairset="${esc(r.e.key)}">Přiřadit</button></div>`
    : `<p class="small muted">V evidenci práce za tenhle měsíc nezbývá žádné nespárované jméno; ${esc(`${r.e.last} ${r.e.first}`)} tam nejspíš nic nevyrobil.</p>`}</div>`;
}

function prodKv(r) {
  const pr = r.prod;
  if (!pr) return '';
  const hours = r.att ? r.att.totalHours : 0;
  const days = workedDays(r.att);
  const avg = avgPerDay(pr, r.att);
  return `<dl class="kv">
    <dt>Vyrobeno kusů</dt><dd>${nf(pr.total, 0)}</dd>
    <dt>Odpracované dny</dt><dd>${days || '—'}</dd>
    <dt>Zápisů v evidenci</dt><dd>${pr.entries} ve ${pr.prodDays} dnech</dd>
    <dt class="tot">Ø kusů na odpracovaný den</dt><dd class="tot">${avg == null ? '—' : nf(avg, 1)}</dd>
    ${hours ? `<dt>Ø na hodinu</dt><dd>${nf(pr.total / hours, 2)}</dd>` : ''}
    ${pr.prodDays ? `<dt>Ø v den se zápisem</dt><dd>${nf(pr.avgEntryDay, 1)}</dd>` : ''}
    ${r.perf && r.perf.time ? `<dt>Strávený čas nad zakázkami</dt><dd>${nf(pr.spent / 60, 1)} h</dd>${pr.nspent ? `<dt>Norma (u řádků s normou)</dt><dd>${nf(pr.norm / 60, 1)} h za ${nf(pr.nspent / 60, 1)} h</dd>` : ''}` : ''}
    ${pr.sources.length > 1 || norm(pr.sources[0]) !== norm(`${r.e.first} ${r.e.last}`) ? `<dt>V evidenci jako</dt><dd class="text">${esc(pr.sources.join(', '))}</dd>` : ''}
  </dl>`;
}

function calStrip(a) {
  return `<div class="calwrap"><div class="calrow">${a.cells.map(c => {
    let cls = 'cell';
    if (c.d.weekend || c.d.hol) cls += c.h > 0 ? ' wk' : ' wk0';
    else if (c.h >= (c.ds || S.settings.shift) - 1e-9) cls += ' full';
    else if (c.h > 0) cls += ' part';
    else if (c.isEx || c.c) cls += ' abs';
    else cls += ' miss';
    const title = `${DOW[c.d.dow]} ${c.d.d}.${c.d.m}. ${c.h > 0 ? `${nf(c.h)} h` : (c.c ? c.c : 'nic')}${c.d.hol ? ` — ${c.d.hol}` : ''}`;
    return `<div class="${cls}" title="${esc(title)}">${c.d.d}</div>`;
  }).join('')}</div></div>`;
}

/* ==========================================================================
   LIDÉ
   ========================================================================== */
function renderPeople() {
  const q = norm($('#lSearch').value);
  let list = Object.values(S.employees).sort((a, b) => (!!a.excluded - !!b.excluded) || norm(a.last).localeCompare(norm(b.last), 'cs'));
  if (q) list = list.filter(e => norm(`${e.last} ${e.first}`).includes(q));
  const p = curPeriod();
  if (list.length && (!ui.selPerson || !S.employees[ui.selPerson])) ui.selPerson = list[0].key;
  let separator = false;
  $('#lList').innerHTML = list.length ? list.map(e => {
    const ev = evaluate(e, p);
    const L = ev.L;
    const sep = e.excluded && !separator ? (separator = true, '<div class="listsep">Vyřazení ze seznamu</div>') : '';
    return `${sep}<button class="list-item${e.excluded ? ' out' : ''}" type="button" data-key="${esc(e.key)}" aria-current="${e.key === ui.selPerson}">
      ${L.n ? `<span class="lvl l${L.n}">${L.n}</span>` : '<span class="lvl l0">?</span>'}
      <span class="nm"><b>${esc(e.last)} ${esc(e.first)}</b><span>${L.pos ? esc(L.pos.name) + (L.n ? ` · ${esc(L.lv.name)}` : ' · <span class="warn-t">bez úrovně</span>') : '<span class="crit">bez pozice</span>'}${e.shortFri ? ` · pá ${nf(friShift())} h` : ''}</span></span>
      ${e.excluded ? '<span class="tag">vyřazen</span>' : `<span class="num small list-val" title="Tabáky za vybraný měsíc">${nf(ev.total, 0)}</span>`}
    </button>`;
  }).join('') : emptyState('Nikdo tu není', 'Nahraj docházku, nebo přidej člověka ručně.');
  $('#peopleSplit').classList.toggle('show-detail', ui.personOpen);
  renderPersonDetail();
}

function renderPersonDetail() {
  const box = $('#lDetail');
  const e = ui.selPerson ? S.employees[ui.selPerson] : null;
  if (!e) { box.innerHTML = '<div class="card">' + emptyState('Vyber člověka', 'Klikni na jméno v seznamu.') + '</div>'; return; }
  const p = curPeriod();
  const ev = evaluate(e, p);
  const a = ev.att;
  const pr = productionOf(e.key);
  const pos = ev.pos;
  const r = { e, ...ev, prod: pr };
  box.innerHTML = `<button class="btn ghost small back-btn" type="button" id="pBack">${I.back}Seznam lidí</button>
    <div class="stack">
    <div class="card">
      <div class="card-head">
        <div><p class="eyebrow">Zaměstnanec</p><h2>${esc(e.last)} ${esc(e.first)}</h2></div>
        <div class="row gap">
          <button class="btn small" type="button" data-profile="${esc(e.key)}">Profil a historie</button>
          ${e.excluded ? `<button class="btn small" type="button" data-include="${esc(e.key)}">Vrátit do seznamu</button>` : `<button class="btn sec small" type="button" data-exclude="${esc(e.key)}" title="Přestane se hodnotit, data zůstanou">Vyřadit</button>`}
          <button class="btn ghost small" type="button" id="pDel" title="Smaže člověka i jeho zařazení a sankce">Smazat</button>
        </div>
      </div>
      ${e.excluded ? '<div class="note w"><b>Vyřazen ze seznamu.</b> Nehodnotí se a není v přehledu, výrobě ani v nabídce sankcí. Zařazení a historie zůstávají.</div>' : ''}
      <div class="form-grid">
        <label class="field"><span>Pozice</span><select id="pPos">${posOptions(e.positionId)}</select></label>
        <label class="field"><span>Poznámka</span><input type="text" id="pNote" value="${esc(e.note || '')}" placeholder="volitelné" maxlength="500"></label>
        <label class="field"><span>ID v evidenci práce</span><input type="text" id="pWid" value="${esc(e.wid || '')}" placeholder="volitelné" maxlength="40" autocomplete="off"></label>
      </div>
      <label class="switch"><input type="checkbox" id="pFri"${e.shortFri ? ' checked' : ''}><span>Zkrácený pátek: ${nf(friShift())} h se počítá jako celá směna</span></label>
    </div>
    <div class="card">
      <h3>Úroveň${pos ? ` · ${esc(pos.name)}` : ''}</h3>
      ${pos ? `<div class="lvlpick" role="radiogroup" aria-label="Úroveň">${pos.levels.map((lv, i) => `<label class="lvlopt${e.level === i + 1 ? ' on' : ''}">
          <input type="radio" name="pLvl" value="${i + 1}"${e.level === i + 1 ? ' checked' : ''}>
          <span class="lvl l${i + 1}">${i + 1}</span>
          <span class="lvltxt"><b>${esc(lv.name)}</b>${lv.desc ? `<span>${esc(lv.desc)}</span>` : '<span class="muted">bez popisu</span>'}</span>
          <span class="lvltab num">${pos.onlyKafe ? `<small>jen Kafe</small>` : `${+lv.tabaky || 0}<small>${tabW(+lv.tabaky || 0)}</small>`}${+lv.raise ? `<small class="lvlraise-tag">plat +${nf(+lv.raise, 1)} %</small>` : ''}</span>
        </label>`).join('')}</div>` : '<p class="muted small">Nejdřív vyber pozici.</p>'}
    </div>
    ${S.positions.some(x => x.id !== e.positionId) ? `<div class="card">
      <h3>Zaučení na dalších pozicích</h3>
      <p class="small muted">Pro matici dovedností. Tabáky se počítají jen z hlavní pozice.</p>
      <div class="skill-list">${S.positions.filter(x => x.id !== e.positionId).map(x => {
        const v = (e.skills && e.skills[x.id]) || 0;
        return `<div class="skill-row"><span class="skill-name">${iluo(v)}<span>${esc(x.name || '(bez názvu)')}<small>${esc(deptOf(x))}</small></span></span>
          <div class="seg" role="group" aria-label="${esc(`Zaučení na pozici ${x.name}`)}">${[0, 1, 2, 3, 4].map(n => `<button type="button" class="${n === v ? 'on' : ''}" data-skill="${esc(x.id)}" data-key="${esc(e.key)}" data-lvl="${n}" aria-pressed="${n === v}" title="${esc(n ? `${n} · ${x.levels[n - 1].name}` : 'nezaučen')}">${n || '–'}</button>`).join('')}</div></div>`;
      }).join('')}</div>
    </div>` : ''}
    <div class="card">
      <h3>Tabáky · ${esc(periodName2(p))}</h3>
      ${sumKv(r)}
      <div class="row gap">${adjCtrl(r)}<span class="small muted">tabáky navíc / méně</span><span class="spacer"></span>${p ? issueCell({ ...r, p }) : ''}</div>
      <hr class="sep"><p class="eyebrow">Docházka</p>${attKv(r)}
      ${a && a.found ? `<hr class="sep">${calStrip(a)}` : ''}
    </div>
    ${pr ? `<div class="card"><h3>Výroba · ${esc(periodName2(p))}</h3>${prodKv({ prod: pr, att: a, e })}<p class="explain">Údaj z evidence práce. Do tabáků se nezapočítává.</p></div>`
      : (prodPeriod() ? '<div class="card"><h3>Výroba</h3><p class="small muted">Pro tenhle měsíc nemá žádný záznam v evidenci práce. Pokud je tam pod jiným tvarem jména, spáruj ho v části <b>Výroba</b>.</p></div>' : '')}
  </div>`;
  setWidths(box);
  $('#pBack').onclick = () => { ui.personOpen = false; renderPeople(); };
  $('#pPos').onchange = event => {
    e.positionId = event.target.value || null;
    if (e.positionId && !e.level) e.level = 1;
    if (e.skills && e.positionId) { delete e.skills[e.positionId]; if (!Object.keys(e.skills).length) delete e.skills; }
    save(); renderPeople(); renderOverview(); renderPeriodBits();
  };
  $('#pNote').oninput = event => { e.note = event.target.value; save(); };
  $('#pWid').onchange = event => {
    const v = String(event.target.value).trim();
    if (!setWid(e.key, v)) { toast(`ID ${v} už má ${nameOf(keyByWid(v))}.`, true); event.target.value = e.wid || ''; return; }
    save(); renderAll(); toast(v ? `ID ${v} uloženo.` : 'ID smazáno.');
  };
  $('#pFri').onchange = event => {
    if (event.target.checked) e.shortFri = true; else delete e.shortFri;
    save(); renderAll();
    toast(`${e.last} ${e.first}${e.shortFri ? `: pátek ${nf(friShift())} h = celá směna.` : `: pátek zase ${nf(S.settings.shift)} h.`}`);
  };
  $('#pDel').onclick = async () => {
    const count = S.sanctions.filter(s => s.key === e.key).length;
    if (!(await confirmBox('Smazat člověka?', `${e.last} ${e.first} zmizí ze seznamu i se zařazením a úrovní.${count ? ` Smaže se i ${count} sankcí.` : ''} Docházka v nahraných souborech zůstane.`, 'Smazat', true))) return;
    delete S.employees[e.key];
    S.sanctions = S.sanctions.filter(s => s.key !== e.key);
    Object.values(S.adjust).forEach(b => { delete b[e.key]; });
    Object.values(S.issued || {}).forEach(b => { delete b[e.key]; });
    ui.selPerson = null; ui.personOpen = false;
    save(); renderAll(); toast('Smazáno.');
  };
  $$('input[name="pLvl"]', box).forEach(radio => {
    radio.onchange = () => { e.level = +radio.value; save(); renderPeople(); renderOverview(); renderPeriodBits(); };
  });
}

/* ==========================================================================
   SANKCE
   ========================================================================== */
function sanPreview() {
  const d = ui.sanDraft;
  const e = d.key ? S.employees[d.key] : null;
  if (!e) return '';
  if (d.period !== S.current || !curPeriod()) return `<p class="small muted">Nárok uvidíš, až bude ${esc(monthLabel(d.period))} vybrané období s docházkou.</p>`;
  const ev = evaluate(e, curPeriod());
  const next = Math.min(100, ev.pctSum + (+d.pct || 0));
  const left = ev.narok - sanDeduct(ev.narok, next, ev.pctCount + 1) - ev.legacy;
  return `<div class="note i">${esc(`${e.last} ${e.first}`)} má za ${esc(monthLabel(d.period))} nárok <b>${ev.narok} ${tabW(ev.narok)}</b>${ev.pctSum ? `, už má sankce <b>−${ev.pctSum} %</b>` : ''}. Po této sankci (celkem −${next} %) zůstane <b>${Math.max(0, left)}</b> před ruční úpravou.</div>`;
}

function renderSanctions() {
  const d = ui.sanDraft;
  const people = Object.values(S.employees).filter(e => !e.excluded).sort((a, b) => norm(a.last).localeCompare(norm(b.last), 'cs'));
  if (!d.period) d.period = S.current || thisMonthId();
  const reasons = S.sanReasons || [];
  if (d.reason && d.reason !== '__other' && !reasons.includes(d.reason)) d.reason = '';
  $('#sanForm').innerHTML = `<h3>Nová sankce</h3>${people.length ? `<div class="stack">
    <label class="field"><span>Zaměstnanec</span><select id="sanWho"><option value="">— vyber —</option>${people.map(e => `<option value="${esc(e.key)}"${e.key === d.key ? ' selected' : ''}>${esc(`${e.last} ${e.first}`)}</option>`).join('')}</select></label>
    <label class="field"><span>Měsíc</span><input type="month" id="sanMonth" value="${esc(d.period)}"></label>
    <label class="field"><span>Důvod</span><select id="sanWhy"><option value="">— vyber důvod —</option>${reasons.map(n => `<option value="${esc(n)}"${n === d.reason ? ' selected' : ''}>${esc(n)}</option>`).join('')}<option value="__other"${d.reason === '__other' ? ' selected' : ''}>Jiný důvod…</option></select></label>
    ${d.reason === '__other' ? `<label class="field"><span>Jiný důvod</span><input type="text" id="sanOther" value="${esc(d.other)}" placeholder="napiš důvod" maxlength="100"></label>` : ''}
    <div class="field"><span>Srážka z nároku</span><div class="pctpick" role="radiogroup" aria-label="Srážka z nároku">${SAN_PCTS.map(v => `<label><input type="radio" name="sanPct" value="${v}"${+d.pct === v ? ' checked' : ''}><span>${v} %</span></label>`).join('')}</div></div>
    <label class="field"><span>Poznámka</span><input type="text" id="sanNote" value="${esc(d.note)}" placeholder="volitelné, co se stalo" maxlength="300"></label>
    <div id="sanPrev">${sanPreview()}</div>
    <button class="btn" type="button" id="sanAdd">Přidat sankci</button>
  </div>` : `<p class="muted small">V evidenci zatím nikdo není. Nahraj docházku, nebo přidej člověka v části <b>Lidé</b>.</p>`}`;

  $('#sanReasons').innerHTML = `<h3>Důvody sankcí</h3><p class="small muted">Společný seznam pro všechny. Procento se volí u každé sankce zvlášť. Přejmenování nemění už zadané sankce.</p>
    <div class="reasons">${reasons.map((n, i) => `<div class="reasonrow" data-rsi="${i}"><input type="text" value="${esc(n)}" aria-label="Důvod sankce" maxlength="100"><button class="icon-btn" type="button" data-rsdel aria-label="Odebrat důvod">${I.x}</button></div>`).join('')}</div>
    <button class="btn sec small" type="button" id="sanReasonAdd">Přidat důvod</button>`;

  const months = [...new Set(S.sanctions.map(s => s.period))].sort().reverse();
  const sanFilter = months.includes(P.sanFilter) ? P.sanFilter : '';
  $('#sanFilter').innerHTML = `<option value="">Všechny měsíce</option>${months.map(m => `<option value="${esc(m)}"${m === sanFilter ? ' selected' : ''}>${esc(monthLabel(m))}</option>`).join('')}`;
  $('#sanFilter').value = sanFilter;
  const q = norm($('#sanSearch').value);
  let list = S.sanctions.slice().sort((a, b) => String(b.period).localeCompare(String(a.period)) || b.at - a.at);
  if (sanFilter) list = list.filter(s => s.period === sanFilter);
  if (q) list = list.filter(s => norm(`${nameOf(s.key)} ${sanLabel(s)}`).includes(q));
  $('#sanList').innerHTML = list.length ? `<div class="table-card"><table class="stack"><thead><tr><th>Měsíc</th><th>Zaměstnanec</th><th>Důvod</th><th class="r">Srážka</th><th>Poznámka</th><th class="r">Zadáno</th><th></th></tr></thead><tbody>${list.map(s => `<tr>
      <td data-label="Měsíc" class="small nowrap">${esc(monthLabel(s.period))}</td>
      <td data-label="Zaměstnanec" class="name"><b>${esc(nameOf(s.key))}</b>${S.employees[s.key] ? '' : ' <span class="tag">není v evidenci</span>'}</td>
      <td data-label="Důvod" class="wrap">${esc(s.pct != null ? s.name : (s.reason || 'Sankce'))}</td>
      <td data-label="Srážka" class="r"><span class="pen">${s.pct != null ? `−${s.pct} %` : `−${+s.points || 0} tab.`}</span></td>
      <td data-label="Poznámka" class="wrap small">${esc(s.pct != null ? (s.note || '') : 'starý záznam, pevná srážka')}</td>
      <td data-label="Zadáno" class="r small muted num nowrap">${new Date(s.at).toLocaleDateString('cs-CZ')}</td>
      <td class="c actions"><button class="icon-btn" type="button" data-del="${esc(s.id)}" aria-label="Smazat sankci">${I.x}</button></td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="7"><b>${list.length} ${list.length === 1 ? 'sankce' : list.length < 5 ? 'sankce' : 'sankcí'}</b></td></tr></tfoot></table></div>`
    : `<div class="card">${emptyState(S.sanctions.length ? 'Filtru nic neodpovídá' : 'Zatím žádné sankce', S.sanctions.length ? 'Zkus jiný měsíc nebo hledání.' : 'Sankci přidáš formulářem vlevo.')}</div>`;

  const preview = () => { const el = $('#sanPrev'); if (el) el.innerHTML = sanPreview(); };
  if (people.length) {
    $('#sanWho').onchange = event => { d.key = event.target.value; preview(); };
    $('#sanMonth').onchange = event => { d.period = event.target.value; preview(); };
    $('#sanWhy').onchange = event => { const was = d.reason === '__other'; d.reason = event.target.value; if (was !== (d.reason === '__other')) renderSanctions(); };
    if ($('#sanOther')) $('#sanOther').oninput = event => { d.other = event.target.value; };
    $$('input[name="sanPct"]').forEach(radio => { radio.onchange = () => { d.pct = +radio.value; preview(); }; });
    $('#sanNote').oninput = event => { d.note = event.target.value; };
    $('#sanNote').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); addSanction(); } };
    $('#sanAdd').onclick = addSanction;
  }
  $$('#sanReasons [data-rsi]').forEach(row => {
    const i = +row.dataset.rsi;
    $('input', row).onchange = event => {
      const v = event.target.value.trim();
      if (v) S.sanReasons[i] = v; else event.target.value = S.sanReasons[i];
      save();
    };
    $('[data-rsdel]', row).onclick = async () => {
      if (!(await confirmBox('Odebrat důvod?', `„${S.sanReasons[i]}“ zmizí z nabídky. Už zadané sankce zůstanou.`, 'Odebrat'))) return;
      S.sanReasons.splice(i, 1); save(); renderSanctions();
    };
  });
  $('#sanReasonAdd').onclick = async () => {
    const value = await promptBox('Nový důvod sankce', 'Důvod', '', 'Přidat');
    if (!value) return;
    if (!S.sanReasons.some(x => norm(x) === norm(value))) S.sanReasons.push(value.slice(0, 100));
    save(); renderSanctions();
  };
  $$('#sanList [data-del]').forEach(button => {
    button.onclick = async () => {
      const s = S.sanctions.find(x => x.id === button.dataset.del);
      if (!s) return;
      if (!(await confirmBox('Smazat sankci?', `${nameOf(s.key)}: ${sanLabel(s)}`, 'Smazat', true))) return;
      S.sanctions = S.sanctions.filter(x => x.id !== s.id);
      save(); renderAll(); toast('Sankce smazána.');
    };
  });
}

function addSanction() {
  const d = ui.sanDraft;
  const pctValue = +d.pct;
  const name = d.reason === '__other' ? String(d.other || '').trim().slice(0, 100) : d.reason;
  if (!d.key) { toast('Vyber zaměstnance.', true); return; }
  if (!/^\d{4}-\d{2}$/.test(d.period || '')) { toast('Vyber měsíc.', true); return; }
  if (!name) { toast('Vyber nebo napiš důvod sankce.', true); return; }
  if (!SAN_PCTS.includes(pctValue)) { toast('Zvol srážku 10, 30 nebo 50 %.', true); return; }
  S.sanctions.push({ id: uid('x'), key: d.key, period: d.period, name, pct: pctValue, note: String(d.note || '').trim().slice(0, 300), at: Date.now() });
  d.note = ''; d.other = '';
  save(); renderAll();
  toast(`${nameOf(d.key)}: ${name} −${pctValue} % za ${monthLabel(d.period)}.`);
}

/* ==========================================================================
   POZICE
   ========================================================================== */
function ruleCard(p, kind) {
  const pen = kind === 'penalty';
  p[kind] = (p[kind] || []).slice().sort((a, b) => (+a.at || 0) - (+b.at || 0));
  const rules = p[kind];
  return `<div class="card" data-rules="${kind}">
    <h3>${pen ? 'Srážka za absenci' : 'Bonus za víkendy'}</h3>
    <p class="small muted">${pen ? 'Absence = celý pracovní den bez docházky. Počítá se to, co zbyde po vyplnění víkendovými směnami.' : 'Jen když nic nechybí. Počítají se víkendové směny, které nebylo potřeba na vyplnění. Nejvýš do maxima pozice.'}</p>
    <div class="rules">${rules.length ? rules.map((r, i) => `<div class="rulerow" data-ri="${i}">
        <span class="rule-part"><span>${pen ? 'Dny absence' : 'Víkendové směny'} ≥</span><input type="number" data-rat value="${+r.at || 0}" min="1" max="31" step="1" aria-label="${pen ? 'Počet chybějících dnů' : 'Počet víkendových směn'}"></span>
        <span class="rule-part"><span>→ ${pen ? '−' : '+'}</span><input type="number" data-rt value="${+r.t || 0}" min="0" max="100" step="1" aria-label="Počet tabáků"><span>tab.</span></span>
        <button class="icon-btn" type="button" data-rdel aria-label="Smazat řádek">${I.x}</button>
      </div>`).join('') : `<p class="small muted">Žádný řádek, ${pen ? 'za chybějící dny se nestrhává nic.' : 'bonus se nedává.'}</p>`}</div>
    <button class="btn sec small" type="button" data-radd>Přidat řádek</button>
  </div>`;
}

function renderPositions() {
  const counts = {};
  Object.values(S.employees).forEach(e => { if (e.positionId) counts[e.positionId] = (counts[e.positionId] || 0) + 1; });
  if (!ui.selPos || !S.positions.some(x => x.id === ui.selPos)) ui.selPos = S.positions[0] ? S.positions[0].id : null;
  const p = S.positions.find(x => x.id === ui.selPos);
  $('#posList').innerHTML = S.positions.length ? S.positions.map(x => `<button class="list-item" type="button" data-selpos="${esc(x.id)}" aria-current="${x.id === ui.selPos}">
      <span class="nm"><b>${esc(x.name || '(bez názvu)')}</b><span>${counts[x.id] || 0} lidí · ${x.onlyKafe ? 'jen Kafe' : `úrovně ${x.levels.map(l => +l.tabaky || 0).join(' / ')} · max ${posMax(x)}`}${hasRaise(x) ? ` · plat ${x.levels.map(l => (+l.raise ? `+${nf(+l.raise, 1)}` : '0')).join(' / ')} %` : ''}</span></span>
    </button>`).join('') : emptyState('Žádné pozice', 'Přidej první pozici tlačítkem nahoře.');
  $('#posSplit').classList.toggle('show-detail', ui.posOpen);
  const editor = $('#posEditor');
  if (!p) { editor.innerHTML = ''; return; }
  editor.innerHTML = `<button class="btn ghost small back-btn" type="button" id="posBack">${I.back}Seznam pozic</button>
    <div class="stack">
    <div class="card">
      <div class="form-grid pos-head">
        <label class="field"><span>Název pozice</span><input type="text" id="posName" value="${esc(p.name)}" maxlength="80"></label>
        <label class="field"><span>Oddělení</span><input type="text" id="posDept" value="${esc(p.dept || '')}" maxlength="60" placeholder="${esc(p.name || 'stejné jako pozice')}" list="deptList"><datalist id="deptList">${[...new Set(S.positions.map(x => (x.dept || '').trim()).filter(Boolean))].map(d => `<option value="${esc(d)}"></option>`).join('')}</datalist></label>
        <label class="field"><span>Maximum tabáků</span><input type="number" id="posMax" value="${p.max != null && p.max !== '' ? p.max : ''}" placeholder="${posMaxAuto(p)}" min="0" max="200" step="1"${p.onlyKafe ? ' disabled' : ''}></label>
      </div>
      <label class="check onlykafe-check"><input type="checkbox" id="posOnlyKafe"${p.onlyKafe ? ' checked' : ''}><span><b>Jen Kafe, bez tabáků</b><small>Lidé na této pozici dostávají jen Kafe (a případně navýšení platu). Tabáky, jejich pravidla docházky a ruční úpravy se nepočítají.</small></span></label>
      <p class="small muted">Oddělení seskupuje pozice v matici dovedností. Když ho nevyplníš, pozice je oddělením sama pro sebe.</p>
      <p class="small muted">${counts[p.id] || 0} lidí na této pozici.${p.onlyKafe ? '' : ` Maximum je strop po sečtení úrovně a docházky; bonus za víkendy nikoho nepustí výš. ${p.max != null && p.max !== '' ? `Vlastní maximum ${posMax(p)}. Smaž hodnotu pro návrat k nejvyšší úrovni (${posMaxAuto(p)}).` : `Teď podle nejvyšší úrovně: ${posMaxAuto(p)}.`}`}</p>
      <div class="row end"><button class="btn danger small" type="button" id="posDel">Smazat pozici</button></div>
    </div>
    <div class="card">
      <h3>${p.onlyKafe ? 'Úrovně a navýšení platu' : 'Úrovně, tabáky a navýšení platu'}</h3>
      <p class="small muted">${p.onlyKafe ? '' : 'Úroveň dává základní počet tabáků. '}Do popisu napiš, co člověk na dané úrovni musí zvládat; uvidí se při zařazování.</p>
      <div class="lvledits">${p.levels.map((lv, i) => `<div class="lvledit" data-li="${i}">
        <span class="lvl l${i + 1}">${i + 1}</span>
        <input type="text" data-lname value="${esc(lv.name)}" aria-label="Název úrovně ${i + 1}" maxlength="40">
        ${p.onlyKafe ? '<span class="tabin muted">bez tabáků</span>' : `<span class="tabin"><input type="number" data-ltab value="${+lv.tabaky || 0}" min="0" max="100" step="1" aria-label="Tabáky úrovně ${i + 1}"><span>tab.</span></span>`}
        <textarea data-ldesc rows="2" placeholder="Co úroveň obnáší…" aria-label="Popis úrovně ${i + 1}" maxlength="500">${esc(lv.desc || '')}</textarea>
        <div class="lvlraise">
          <label class="pctin raise"><span>Navýšení platu</span><span class="pctbox"><input type="number" data-lraise value="${+lv.raise || ''}" min="0" max="100" step="0.5" placeholder="0" aria-label="Navýšení platu na úrovni ${i + 1} v procentech"><i>%</i></span></label>
          <span class="lvlraise-if">${+lv.raise ? 'když splní' : 'podmínky'}</span>
          ${PERF_KEYS.map(([k, label, f]) => `<label class="pctin"><span>${esc(label[0].toUpperCase() + label.slice(1))} ≥</span><span class="pctbox"><input type="number" data-lmin="${f}" value="${lv[f] ?? ''}" min="0" max="${k === 'norm' ? 300 : 100}" step="0.5" placeholder="—" aria-label="${esc(`${label} na úrovni ${i + 1}, nejméně procent`)}"><i>%</i></span></label>`).join('')}
        </div>
      </div>`).join('')}</div>
      <p class="small muted mt-s">Navýšení dostane člověk podle své úrovně, když splní všechny vyplněné podmínky (prázdná se nehlídá). Když je nesplní, platí nejvyšší nižší úroveň, jejíž podmínky splnil. Docházka = odpracované hodiny z fondu, plnění normy = norma ÷ strávený čas, využití fondu = čas nad zakázkami ÷ hodiny v práci; obojí z evidence práce.</p>
    </div>
    ${p.onlyKafe ? `<div class="note i">Kafe dostane, kdo odpracuje aspoň měsíční fond hodin (nebo práh nastavený u období v přehledu).${cutoffDays() ? ` Od ${cutoffDays()} dní absence po vyplnění víkendem nárok zaniká (Nastavení).` : ''}</div>` : `<div class="rule-grid">${ruleCard(p, 'penalty')}${ruleCard(p, 'bonus')}</div>
    <div class="note i">Platí vždy nejvyšší splněný řádek. Absence je celý pracovní den bez docházky; kratší směna absence není (projeví se jen v hodinách u Kafe). Každá odpracovaná víkendová nebo sváteční směna vyplní jeden den absence a víkend použitý na vyplnění se do bonusu nepočítá.${cutoffDays() ? ` Od ${cutoffDays()} dní absence neplatí nic, bez nároku na tabák i kafe (Nastavení).` : ' Hranici, od které člověk ztrácí nárok úplně, nastavíš v Nastavení.'}
      <div class="mt-s"><button class="btn sec small" type="button" id="posCopyRules">Použít srážky a bonusy u všech pozic</button></div></div>`}
  </div>`;
  const refresh = () => { save(); renderOverview(); renderPeople(); };
  $('#posBack').onclick = () => { ui.posOpen = false; renderPositions(); };
  $('#posName').oninput = event => {
    p.name = event.target.value;
    const label = $(`#posList [data-selpos="${CSS.escape(p.id)}"] b`);
    if (label) label.textContent = p.name || '(bez názvu)';
    refresh();
  };
  $('#posDept').onchange = event => {
    p.dept = String(event.target.value).trim().slice(0, 60);
    save(); renderMatrix(); renderPositions();
  };
  $('#posOnlyKafe').onchange = event => {
    p.onlyKafe = event.target.checked;
    refresh(); renderPositions();
  };
  $('#posMax').onchange = event => {
    const v = String(event.target.value).trim();
    p.max = v === '' ? null : clamp(Math.round(+v || 0), 0, 200);
    refresh(); renderPositions();
  };
  $('#posDel').onclick = async () => {
    const n = Object.values(S.employees).filter(e => e.positionId === p.id).length;
    if (!(await confirmBox('Smazat pozici?', `Pozice ${p.name}${n ? ` zmizí a ${n} lidí zůstane bez zařazení.` : ' zmizí.'}`, 'Smazat', true))) return;
    Object.values(S.employees).forEach(e => {
      if (e.positionId === p.id) e.positionId = null;
      if (e.skills) { delete e.skills[p.id]; if (!Object.keys(e.skills).length) delete e.skills; }
    });
    S.positions = S.positions.filter(x => x.id !== p.id);
    ui.selPos = null; ui.posOpen = false;
    save(); renderAll(); toast('Pozice smazána.');
  };
  $$('#posEditor [data-li]').forEach(row => {
    const lv = p.levels[+row.dataset.li];
    $('[data-lname]', row).oninput = event => { lv.name = event.target.value; refresh(); };
    const tab = $('[data-ltab]', row);
    if (tab) tab.onchange = event => { lv.tabaky = clamp(Math.round(+event.target.value || 0), 0, 100); event.target.value = lv.tabaky; refresh(); renderPositions(); };
    /* procenta na desetiny; prázdná podmínka = nehlídá se */
    const pctVal = (v, hi) => { const t = String(v).trim().replace(',', '.'); return t === '' || !Number.isFinite(+t) ? null : Math.round(clamp(+t, 0, hi) * 10) / 10; };
    $('[data-lraise]', row).onchange = event => { lv.raise = pctVal(event.target.value, 100) || 0; event.target.value = lv.raise || ''; refresh(); renderPositions(); };
    $$('[data-lmin]', row).forEach(input => {
      input.onchange = event => { const f = input.dataset.lmin; lv[f] = pctVal(event.target.value, f === 'minNorm' ? 300 : 100); event.target.value = lv[f] ?? ''; refresh(); };
    });
    $('[data-ldesc]', row).oninput = event => { lv.desc = event.target.value; save(); };
  });
  $$('#posEditor [data-rules]').forEach(card => {
    const kind = card.dataset.rules;
    const rules = p[kind];
    $$('[data-ri]', card).forEach(row => {
      const r = rules[+row.dataset.ri];
      $('[data-rat]', row).onchange = event => { r.at = clamp(Math.round(+event.target.value || 1), 1, 31); refresh(); renderPositions(); };
      $('[data-rt]', row).onchange = event => { r.t = clamp(Math.round(+event.target.value || 0), 0, 100); event.target.value = r.t; refresh(); };
      $('[data-rdel]', row).onclick = () => { rules.splice(+row.dataset.ri, 1); refresh(); renderPositions(); };
    });
    $('[data-radd]', card).onclick = () => {
      const last = rules[rules.length - 1];
      rules.push({ at: last ? Math.min(31, (+last.at || 0) + 1) : 1, t: last ? Math.min(100, (+last.t || 0) + 1) : 1 });
      refresh(); renderPositions();
    };
  });
  if ($('#posCopyRules')) $('#posCopyRules').onclick = async () => {
    if (!(await confirmBox('Použít pravidla u všech pozic?', `Srážky a bonusy všech ostatních pozic se přepíšou pravidly z pozice ${p.name}.`, 'Přepsat'))) return;
    S.positions.forEach(q => { if (q !== p) { q.penalty = JSON.parse(JSON.stringify(p.penalty)); q.bonus = JSON.parse(JSON.stringify(p.bonus)); } });
    refresh(); renderPositions(); toast('Pravidla zkopírována do všech pozic.');
  };
}

/* ==========================================================================
   DOCHÁZKA
   ========================================================================== */
function renderAttendance() {
  const p = curPeriod();
  const box = $('#attView');
  if (!p) { box.innerHTML = `<div class="card">${emptyState('Zatím nic nahráno', 'Po nahrání tu uvidíš každého člověka po dnech.')}</div>`; return; }
  const meta = periodMeta(p);
  const rows = Object.keys(p.rows).map(k => ({ k, r: p.rows[k], a: attendance(p, k) })).sort((a, b) => norm(a.r.last).localeCompare(norm(b.r.last), 'cs'));
  box.innerHTML = `<div class="stats">${[
    statTile('Pracovních dnů', meta.work, `${nf(meta.fund)} h fondu`),
    statTile('Sobot', meta.sats, `víkendových dnů ${meta.sats + meta.suns}`),
    statTile('Lidí v souboru', rows.length, esc(p.file || '')),
    statTile('Svátků ve všední den', meta.hols, meta.hols ? 'nepočítají se do fondu' : 'žádné'),
  ].join('')}</div>
  <div class="table-card"><table class="stack att-table"><thead><tr><th>Zaměstnanec</th><th>Měsíc</th><th class="r">Dny</th><th class="r">Hodiny</th><th class="r">Víkend</th></tr></thead><tbody>${rows.map(x => `<tr>
    <td data-label="Zaměstnanec" class="name"><div class="who"><b>${esc(x.r.last)} ${esc(x.r.first)}</b></div></td>
    <td data-label="Měsíc" class="cal">${calStrip(x.a)}</td>
    <td data-label="Dny" class="r num">${x.a.workDays}</td>
    <td data-label="Hodiny" class="r num">${nf(x.a.workHours)}</td>
    <td data-label="Víkend" class="r num">${x.a.wkDays}</td></tr>`).join('')}</tbody></table></div>
  <div class="callegend">${[['full', 'celá směna'], ['part', 'část směny'], ['wk', 'víkend / svátek odpracovaný'], ['abs', 'omluvená absence'], ['miss', 'chybí'], ['wk0', 'volno']].map(([cls, label]) => `<span><i class="cell ${cls}"></i>${label}</span>`).join('')}</div>`;
}

function showImport(res, ask) {
  const box = $('#importMsg');
  let html = '';
  if (res && !res.ok) html += `<div class="note e"><b>Import selhal.</b> ${esc(res.err)}</div>`;
  if (res && res.ok) {
    html += `<div class="note i"><b>Načteno:</b> ${esc(ui.lastFile)}: ${esc(periodName(res.period))}, ${Object.keys(res.period.rows).length} lidí, ${res.period.days.length} dnů (hlavička na řádku ${res.period.headerRow}).</div>`;
    (res.warn || []).forEach(w => { html += `<div class="note w">${esc(w.replace(/&times;/g, '×'))}</div>`; });
  }
  if (ask) {
    html += `<div class="note w period-fix"><span>Sedí období?</span><select id="fixM">${MONL.map((m, i) => `<option value="${i + 1}"${ask.m === i + 1 ? ' selected' : ''}>${m}</option>`).join('')}</select><input type="number" id="fixY" value="${ask.y}" min="2000" max="2100"><button class="btn sec small" type="button" id="fixGo">Přepočítat</button></div>`;
  }
  box.innerHTML = html;
  if (ask) $('#fixGo').onclick = () => doImport(ui.lastAoa, ui.lastFile, +$('#fixY').value, +$('#fixM').value, true);
}

async function doImport(aoa, name, fy, fm, force = false) {
  ui.lastAoa = aoa;
  ui.lastFile = name;
  const res = buildPeriod(aoa, name, fy, fm);
  if (!res.ok) { showImport(res, null); renderAttendance(); return; }
  const per = res.period;
  if (!force && !S.demo && S.periods[per.id]) {
    if (!(await confirmBox('Přepsat docházku?', `Docházka za ${periodName(per)} už je nahraná. Nový soubor ji nahradí; zařazení, sankce, ruční úpravy a výdeje zůstanou.`, 'Přepsat'))) return;
  }
  if (S.demo) {
    S.demo = false; S.periods = {}; S.employees = {}; S.production = {}; S.prodMap = {}; S.sanctions = []; S.adjust = {}; S.kafe = {}; S.issued = {}; S.log = [];
    dropDemoRaise(S.positions);
    store.note = { kind: 'import', text: `Nahrána první docházka za ${periodName(per)} (${Object.keys(per.rows).length} lidí, ${name}); ukázková data smazána` };
  }
  S.periods[per.id] = per;
  setPeriod(per.id);
  let added = 0;
  Object.entries(per.rows).forEach(([k, r]) => {
    if (!S.employees[k]) { S.employees[k] = { key: k, first: r.first, last: r.last, positionId: null, level: null, note: '' }; added += 1; }
    else { S.employees[k].first = r.first; S.employees[k].last = r.last; }
  });
  save();
  showImport(res, { y: per.y, m: per.m });
  renderAll();
  toast(`Nahráno: ${Object.keys(per.rows).length} lidí${added ? `, ${added} nových` : ''}.`);
  if (added) $('#importMsg').insertAdjacentHTML('beforeend', `<div class="note w"><b>${added} nových lidí</b> čeká na zařazení na pozici. <button class="link" type="button" data-go="lide">Zařadit teď</button></div>`);
}

/** Tabulka ze souboru: CSV (UTF-8 i Windows-1250) nebo Excel; u Excelu vybere nejlepší list. */
async function readTable(file, pick) {
  const lower = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return [{ aoa: parseCSV(decodeText(buffer)), name: file.name }];
  const X = await xlsx();
  const workbook = X.read(new Uint8Array(buffer), { type: 'array' });
  return (pick ? pick(workbook.SheetNames) : workbook.SheetNames).map(sheet => ({
    aoa: X.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, raw: true, defval: null, blankrows: true }),
    name: file.name + (workbook.SheetNames.length > 1 ? ` › ${sheet}` : ''),
  }));
}

async function readFile(file) {
  if (!file) return;
  try {
    const sheets = await readTable(file);
    let best = null;
    let bestScore = -Infinity;
    sheets.forEach(sheet => {
      const t = buildPeriod(sheet.aoa, sheet.name);
      const score = t.ok ? Object.keys(t.period.rows).length * 100 + t.period.days.length : -1;
      if (score > bestScore) { bestScore = score; best = sheet; }
    });
    // Oprava: když žádný list nešel přečíst, původní aplikace tiše neudělala nic.
    if (best) await doImport(best.aoa, best.name);
    else showImport({ ok: false, err: 'Soubor neobsahuje žádný list.' }, null);
  } catch (error) {
    showImport({ ok: false, err: `Soubor se nepodařilo otevřít: ${error.message}` }, null);
  }
}

/* ==========================================================================
   VÝROBA
   ========================================================================== */
function renderProduction() {
  const pp = prodPeriod();
  const months = Object.keys(S.production).sort().reverse();
  const box = $('#prodView');
  const pair = $('#prodPair');
  if (!months.length) { pair.innerHTML = ''; box.innerHTML = `<div class="card">${emptyState('Zatím nic nahráno', 'Po nahrání tu uvidíš vyrobené kusy a průměr na odpracovaný den.')}</div>`; return; }
  if (!pp) {
    pair.innerHTML = '';
    box.innerHTML = `<div class="note w"><b>Pro vybrané období nejsou data o výrobě.</b> Nahrané mám: ${months.map(m => `${esc(monthLabel(m))} (${S.production[m].records} zápisů)`).join(', ')}. Přepni období vlevo nahoře, nebo nahraj evidenci za ${esc(S.current ? monthLabel(S.current) : 'vybraný měsíc')}.</div>`;
    return;
  }
  const unmatched = prodUnmatched();
  const people = Object.values(S.employees).filter(e => !e.excluded).sort((a, b) => norm(a.last).localeCompare(norm(b.last), 'cs'));
  const manual = Object.entries(S.prodMap).filter(([n, k]) => S.employees[k] && pp.names[n]);
  pair.innerHTML = (unmatched.length ? `<div class="card warn-card"><h3>Nespárováno · ${unmatched.length} ${jmenW(unmatched.length)} z evidence</h3><p class="small muted">Tahle jména nebo ID v evidenci práce nesedí na nikoho v hodnocení. Přiřaď je ručně (ID se uloží k člověku), nebo nahraj seznam ID v Nastavení. Volba platí i pro další měsíce.</p>
      <div class="pair-list">${unmatched.map(rec => `<div class="pair-row"><div><b>${esc(prodLabel(rec.name))}</b><div class="tiny muted num">${nf(rec.total, 0)} ks · ${rec.count} zápisů</div></div>
        <select data-pairsel="${esc(norm(rec.name))}" aria-label="Přiřadit k"><option value="">— přiřadit k —</option>${people.map(e => `<option value="${esc(e.key)}">${esc(`${e.last} ${e.first}`)}</option>`).join('')}</select>
        <button class="btn sec small" type="button" data-pairgo="${esc(norm(rec.name))}">Spárovat</button></div>`).join('')}</div></div>` : '')
    + (manual.length ? `<div class="card"><h3>Ruční párování</h3>${manual.map(([n, k]) => `<div class="manual-pair"><span><b>${esc(prodLabel(pp.names[n].name))}</b> <span class="muted">→</span> ${esc(nameOf(k))}</span><button class="icon-btn" type="button" data-unpair="${esc(n)}" aria-label="Zrušit párování">${I.x}</button></div>`).join('')}</div>` : '');
  const rows = activeRows().filter(r => r.prod || (r.att && r.att.found) || r.e.positionId)
    .sort((a, b) => (b.prod ? (avgPerDay(b.prod, b.att) ?? -0.5) : -1) - (a.prod ? (avgPerDay(a.prod, a.att) ?? -0.5) : -1));
  const matched = rows.filter(r => r.prod).length;
  const totalKs = Object.values(pp.names).reduce((x, r) => x + r.total, 0);
  const time = !!pp.time;
  const shop = rows.filter(r => r.prod);
  const shopNorm = SUMF(shop, r => r.prod.norm);
  const shopNs = SUMF(shop, r => r.prod.nspent);
  const shopSpent = SUMF(shop, r => r.prod.spent);
  const shopHours = SUMF(shop, r => (r.att && r.att.found ? r.att.totalHours : 0));
  const pctTd = (label, v, min) => `<td data-label="${label}" class="r num">${v == null ? '<span class="muted">—</span>' : `<span class="${min != null && v < min - 1e-9 ? 'pen' : ''}">${nf(v, 1)} %</span>`}</td>`;
  box.innerHTML = `<div class="stats">${[
    statTile('Vyrobeno kusů', nf(pp.total, 0), esc(monthLabel(pp.id))),
    statTile('Zápisů', pp.records, esc(pp.file || '')),
    statTile('Spárováno lidí', `${matched}<em>/ ${Object.keys(pp.names).length}</em>`, unmatched.length ? `${unmatched.length} ${jmenW(unmatched.length)} ${unmatched.length >= 2 && unmatched.length <= 4 ? 'čekají' : 'čeká'} na přiřazení` : 'všechna jména sedí'),
    statTile('Ø kusů na den', nf(rows.reduce((x, r) => x + (r.prod ? r.prod.total : 0), 0) / Math.max(1, rows.reduce((x, r) => x + (r.prod ? workedDays(r.att) : 0), 0)), 1), 'na odpracovaný den, napříč dílnou'),
    ...(time ? [
      statTile('Plnění normy', shopNs ? `${nf(shopNorm / shopNs * 100, 1)} %` : '—', shopNs ? `norma ${nf(shopNorm / 60, 0)} h za ${nf(shopNs / 60, 0)} h práce` : 'v evidenci chybí norma'),
      statTile('Využití fondu', shopHours ? `${nf(shopSpent / (shopHours * 60) * 100, 1)} %` : '—', `${nf(shopSpent / 60, 0)} h nad zakázkami z ${nf(shopHours, 0)} h v práci`),
    ] : []),
  ].join('')}</div>
  <div class="table-card"><table class="stack"><thead><tr><th>Zaměstnanec</th><th class="r">Kusy</th><th class="r">Odprac. dny</th><th class="r">Ø ks/den</th><th class="r">Ø ks/h</th>${time ? '<th class="r">Čas nad zak.</th><th class="r" title="Norma ÷ strávený čas">Plnění normy</th><th class="r" title="Strávený čas ÷ hodiny v práci">Využití fondu</th>' : ''}<th class="r">Zápisů</th><th class="r">Ø v den zápisu</th></tr></thead><tbody>${rows.map(r => {
    const pr = r.prod;
    const who = `<td data-label="Zaměstnanec" class="name"><div class="who"><b>${esc(`${r.e.last} ${r.e.first}`)}</b><span class="pos">${r.pos ? esc(r.pos.name) + (r.L.n ? ` · ${esc(r.L.lv.name)}` : '') : ''}</span></div></td>`;
    if (!pr) return `<tr class="muted-row">${who}<td colspan="${time ? 9 : 6}" class="muted small">bez záznamu v evidenci práce</td></tr>`;
    const own = r.raise.own ? r.pos.levels[r.raise.own.lvl - 1] : null;
    const days = workedDays(r.att);
    const hours = r.att ? r.att.totalHours : 0;
    const avg = avgPerDay(pr, r.att);
    return `<tr>${who}<td data-label="Kusy" class="r num">${nf(pr.total, 0)}</td><td data-label="Odprac. dny" class="r num">${days || '<span class="muted">—</span>'}</td><td data-label="Ø ks/den" class="r num"><b>${avg == null ? '—' : nf(avg, 1)}</b></td><td data-label="Ø ks/h" class="r num">${hours ? nf(pr.total / hours, 2) : '—'}</td>${time ? `<td data-label="Čas nad zak." class="r num">${nf(pr.spent / 60, 1)} h</td>${pctTd('Plnění normy', r.perf.norm, own ? own.minNorm : null)}${pctTd('Využití fondu', r.perf.use, own ? own.minUse : null)}` : ''}<td data-label="Zápisů" class="r num muted">${pr.entries}</td><td data-label="Ø v den zápisu" class="r num muted">${nf(pr.avgEntryDay, 1)}</td></tr>`;
  }).join('')}</tbody><tfoot><tr><td><b>Celkem</b></td><td class="r num" data-label="Kusy"><b>${nf(totalKs, 0)}</b></td><td class="r num" data-label="Odprac. dny">${rows.reduce((x, r) => x + (r.prod ? workedDays(r.att) : 0), 0)}</td><td colspan="${time ? 7 : 4}"></td></tr></tfoot></table></div>
  <p class="hint">Ø ks/den = vyrobené kusy dělené odpracovanými dny z docházky (všední i víkendové směny), takže díl rozdělaný přes několik dnů průměr nezkreslí. Poslední dva sloupce jsou kontrola evidence. Výroba se do tabáků nezapočítává.${time ? ' Plnění normy a využití fondu rozhodují o navýšení platu; červeně je hodnota pod podmínkou úrovně člověka.' : ''}</p>`;
  $$('#prodPair [data-pairgo]').forEach(button => {
    button.onclick = () => {
      const n = button.dataset.pairgo;
      const sel = button.parentElement.querySelector('[data-pairsel]');
      if (!sel || !sel.value) { toast('Vyber, ke komu jméno patří.', true); return; }
      pairProd(pp.names[n] ? pp.names[n].name : n, sel.value); save(); renderAll(); toast(`Spárováno s ${nameOf(sel.value)}.`);
    };
  });
  $$('#prodPair [data-unpair]').forEach(button => {
    button.onclick = () => { delete S.prodMap[button.dataset.unpair]; save(); renderAll(); toast('Párování zrušeno.'); };
  });
}

/* Ruční spárování: ID z evidence se uloží jako ID člověka (uvidí se v Nastavení i v detailu),
   pokud už jiné nemá; jinak jako spárování jména. */
function pairProd(raw, key) {
  const e = S.employees[key];
  if (looksLikeId(raw) && e && !e.wid && setWid(key, raw)) return;
  S.prodMap[norm(raw)] = key;
}

function showProdMsg(html) { $('#prodMsg').innerHTML = html; }

function doProdImport(aoa, name, map) {
  const res = buildProduction(aoa, name, map);
  if (!res.ok) { showProdMsg(`<div class="note e"><b>Import selhal.</b> ${esc(res.err)} <button class="link" type="button" data-prodcols>Vybrat sloupce</button></div>`); return; }
  const ids = Object.keys(res.buckets).sort();
  ids.forEach(id => { S.production[id] = res.buckets[id]; });
  save();
  const current = S.current && res.buckets[S.current];
  const time = map && map.spent != null;
  showProdMsg(`<div class="note i"><b>Načteno:</b> ${esc(name)}: ${res.used} řádků, měsíce: ${ids.map(i => `${esc(monthLabel(i))} (${res.buckets[i].records})`).join(', ')}.${res.skipped ? ` Přeskočeno ${res.skipped} řádků bez data, kusů nebo času.` : ''} ${time ? `Strávený čas${map.norm != null ? ' a norma' : ''} načteny.` : 'Bez stráveného času, plnění normy a využití fondu se nespočítá.'} <button class="link" type="button" data-prodcols>Změnit sloupce</button></div>`
    + (!S.current ? '<div class="note w">Zatím není nahraná žádná docházka. Hodnocený měsíc se vybírá podle ní, takže se výroba zobrazí až po nahrání docházky.</div>'
      : (!current ? `<div class="note w">Vybrané období je ${esc(monthLabel(S.current))} a pro něj soubor data nemá. Období zůstává beze změny.</div>` : '')));
  renderAll();
  const un = prodUnmatched().length;
  toast(un ? `Načteno, ${un} ${jmenW(un)} ${un >= 2 && un <= 4 ? 'čekají' : 'čeká'} na spárování.` : 'Evidence práce načtena.');
}

/* Výběr sloupců evidence práce. Uloží se pro všechny a další soubory se stejnou hlavičkou
   se načtou rovnou; soubor s jinou hlavičkou se zeptá znovu. */
async function chooseProdColumns(aoa, name, info) {
  const saved = S.settings.prodCols;
  const start = saved && prodMapFits(saved, info) ? saved : info.guess;
  const opts = (field, optional) => `${optional ? '<option value="">— není v souboru —</option>' : ''}${info.cols.map(c => `<option value="${c.i}"${start[field] === c.i ? ' selected' : ''}>${esc(`${c.letter}${c.head ? ` · ${c.head}` : ''}${c.sample ? ` (${c.sample})` : ''}`)}</option>`).join('')}`;
  const field = (f, label, optional, hint) => `<label class="field"><span>${esc(label)}${hint ? ` <small class="muted">${esc(hint)}</small>` : ''}</span><select name="${f}">${opts(f, optional)}</select></label>`;
  const read = form => {
    const v = n => (form.elements[n].value === '' ? null : +form.elements[n].value);
    return { header: info.header, name: v('name'), date: v('date'), ks: v('ks'), spent: v('spent'), norm: v('norm'),
      unit: form.elements.unit.value === 'h' ? 'h' : 'min', normPer: form.elements.normPer.value === 'piece' ? 'piece' : 'row' };
  };
  const preview = form => {
    const map = read(form);
    const res = buildProduction(aoa, name, map);
    const box = $('#prodColsPreview');
    if (!res.ok) { box.className = 'note e'; box.textContent = res.err; return; }
    const recs = Object.values(res.buckets).flatMap(b => Object.values(b.names));
    const spent = recs.reduce((x, r) => x + (r.spent || 0), 0);
    const normMin = recs.reduce((x, r) => x + (r.norm || 0), 0);
    const nspent = recs.reduce((x, r) => x + (r.nspent || 0), 0);
    box.className = 'note i';
    box.textContent = `Použitelných řádků ${res.used} (${recs.length} jmen, ${Object.keys(res.buckets).map(monthLabel).join(', ')}).`
      + (map.spent != null ? ` Strávený čas celkem ${nf(spent / 60, 1)} h.` : '')
      + (map.norm != null ? (nspent ? ` Plnění normy ${nf(normMin / nspent * 100, 1)} %.` : ' Norma: žádný řádek s časem i normou.') : '');
  };
  const result = await dialog({
    title: 'Sloupce evidence práce', ok: 'Načíst', wide: true,
    html: `<p class="small muted">${info.header >= 0 ? `Hlavička je na řádku ${info.header + 1}.` : 'Soubor nemá rozpoznanou hlavičku, beru data od prvního řádku.'} Vyber, co je ve kterém sloupci; volba se zapamatuje pro další soubory se stejnou hlavičkou.</p>
      <div class="form-grid prodcols">
        ${field('name', 'Zaměstnanec', false, 'jméno nebo ID')}${field('date', 'Datum', false)}${field('ks', 'Kusy', true)}
        ${field('spent', 'Strávený čas', true, 'nad zakázkou')}
        <label class="field"><span>Čas je v</span><select name="unit"><option value="min"${start.unit !== 'h' ? ' selected' : ''}>minutách</option><option value="h"${start.unit === 'h' ? ' selected' : ''}>hodinách</option></select></label>
        ${field('norm', 'Norma', true, 'v minutách')}
        <label class="field"><span>Norma platí</span><select name="normPer"><option value="row"${start.normPer !== 'piece' ? ' selected' : ''}>za celý řádek</option><option value="piece"${start.normPer === 'piece' ? ' selected' : ''}>za 1 kus (× kusy)</option></select></label>
      </div>
      <p class="tiny muted">Čas ve tvaru 1:30 nebo v časovém formátu Excelu se pozná sám. Plnění normy = norma ÷ strávený čas (jen řádky, kde je obojí), využití fondu = strávený čas ÷ hodiny v práci podle docházky.</p>
      <div id="prodColsPreview" class="note i" role="status"></div>`,
    onOpen: () => { const form = $('#dlgForm'); preview(form); $$('#dlgBody select').forEach(sel => { sel.onchange = () => preview(form); }); },
    validate: form => { const m = read(form); if (m.name == null || m.date == null) return 'Vyber sloupec se zaměstnancem (jméno nebo ID) a s datem.'; if (m.ks == null && m.spent == null) return 'Vyber aspoň kusy, nebo strávený čas.'; return buildProduction(aoa, name, m).ok ? null : 'S tímhle výběrem nejde načíst žádný řádek.'; },
  });
  if (result.value !== 'ok') return;
  const map = read(result.form);
  S.settings.prodCols = cleanProdCols({ ...map, heads: info.heads });
  doProdImport(aoa, name, map);
}

async function readProdFile(file, forceChoose = false) {
  if (!file) return;
  try {
    const sheets = await readTable(file);
    const saved = S.settings.prodCols;
    let best = null;
    let bestN = -Infinity;
    sheets.forEach(sheet => {
      const info = prodColumns(sheet.aoa);
      const map = saved && prodMapFits(saved, info) ? saved : info.guess;
      const t = buildProduction(sheet.aoa, file.name, map);
      const score = t.ok ? t.used : info.header >= 0 ? 0 : -1;
      if (score > bestN) { bestN = score; best = { ...sheet, info, known: map === saved }; }
    });
    if (!best) { showProdMsg('<div class="note e"><b>Import selhal.</b> Soubor neobsahuje žádný list.</div>'); return; }
    ui.lastProd = { aoa: best.aoa, name: best.name, info: best.info };
    if (best.known && !forceChoose) doProdImport(best.aoa, best.name, saved);
    else await chooseProdColumns(best.aoa, best.name, best.info);
  } catch (error) {
    showProdMsg(`<div class="note e">Soubor se nepodařilo otevřít: ${esc(error.message)}</div>`);
  }
}

/* ==========================================================================
   PRAVIDLA DO PDF: vzniká v prohlížeči z dešifrovaných dat, server obsah nevidí
   ========================================================================== */
async function pdfAsset(name) {
  const res = await fetch(`app.php?f=${name}&v=${document.body.dataset.privateVersion || '1'}`, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`nepodařilo se načíst ${name} (${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function drawRules(doc, d) {
  const W = 210, H = 297, M = 16, CW = W - 2 * M;
  const INK = [27, 31, 29], MUTED = [85, 92, 88], LINE = [214, 212, 203], ACC = [14, 107, 93], SOFT = [243, 242, 236];
  const mm = pt => pt * 0.3528;
  let y = M;
  const font = (size, bold = false, color = INK) => { doc.setFont('Plex', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color); };
  const lh = size => mm(size) * 1.38;
  const need = h => { if (y + h > H - M - 6) { doc.addPage(); y = M; return true; } return false; };
  const lines = (text, size, width, bold = false) => { font(size, bold); return doc.splitTextToSize(String(text), width); };
  const write = (list, size, x, top, color = INK, bold = false) => { font(size, bold, color); list.forEach((line, i) => doc.text(line, x, top + i * lh(size) + mm(size) * 0.92)); };
  const heading = (text, size) => { need(lh(size) + 12); font(size, true); doc.text(text, M, y + mm(size) * 0.92); y += lh(size) + 1.5; };

  // Titulek
  font(20, true); doc.text(d.title, M, y + mm(20) * 0.92); y += lh(20);
  font(10.5, false, MUTED); doc.text(`${d.sub} · platné k ${d.date}`, M, y + mm(10.5) * 0.92); y += lh(10.5) + 2;
  doc.setDrawColor(...ACC); doc.setLineWidth(0.7); doc.line(M, y, M + 28, y); y += 7;

  // Obecná pravidla: štítek vlevo, text vpravo
  heading('Jak se hodnotí', 12.5);
  const LW = 30;
  d.general.forEach(([label, text]) => {
    const body = lines(text, 9.5, CW - LW);
    const h = body.length * lh(9.5);
    need(h + 2);
    write([label], 9.5, M, y, INK, true);
    write(body, 9.5, M + LW, y, INK);
    y += h + 2.2;
  });
  y += 4;

  // Pozice: tabulka úrovní
  const cols = [['Úroveň', 50, 'left'], ['Tabáky', 18, 'center'], ['Navýšení platu', 24, 'center'], ['Docházka', 28, 'center'], ['Plnění normy', 29, 'center'], ['Využití fondu', 29, 'center']];
  const cell = (text, [, w, align], x, top, size, color, bold) => {
    const pad = 2;
    const list = lines(text, size, w - 2 * pad, bold);
    font(size, bold, color);
    list.forEach((line, i) => doc.text(line, align === 'center' ? x + w / 2 : x + pad, top + 1.8 + i * lh(size) + mm(size) * 0.92, { align: align === 'center' ? 'center' : 'left' }));
    return list.length;
  };
  d.positions.forEach(p => {
    const rows = p.levels.map(lv => [`${lv.n} · ${lv.name}`, lv.tabaky, lv.raise, lv.att, lv.norm, lv.use]);
    const descs = p.levels.filter(lv => lv.desc.trim());
    // celá pozice se drží pohromadě, pokud se vejde na jednu stranu
    const headLines = Math.max(...cols.map(c => lines(c[0], 8.5, c[1] - 4, true).length));
    const blockH = lh(13) + 1.5 + headLines * lh(8.5) + 3.4
      + rows.reduce((x, r) => x + Math.max(...r.map((t, i) => lines(t, 9.5, cols[i][1] - 4, i === 0).length)) * lh(9.5) + 3.4, 0) + 2.5
      + descs.reduce((x, lv) => x + lines(`${lv.n} · ${lv.name}: ${lv.desc.trim()}`, 8.8, CW).length * lh(8.8) + 0.6, 0)
      + p.rules.reduce((x, rule) => x + lines(rule, 8.8, CW).length * lh(8.8) + 0.4, 0);
    if (blockH < H - 2 * M - 6) need(blockH); else need(lh(13) + 10 + 5 * 8);
    font(13, true); doc.text(p.name, M, y + mm(13) * 0.92);
    const tag = [p.dept && p.dept !== p.name ? `oddělení ${p.dept}` : '', p.onlyKafe ? 'jen Kafe, bez tabáků' : ''].filter(Boolean).join(' · ');
    if (tag) { const nameW = doc.getTextWidth(p.name); font(9.5, false, MUTED); doc.text(tag, M + nameW + 3, y + mm(13) * 0.92); }
    y += lh(13) + 1.5;
    // hlavička tabulky (výška podle nejdelšího popisku)
    const headH = Math.max(...cols.map(c => lines(c[0], 8.5, c[1] - 4, true).length)) * lh(8.5) + 3.4;
    const drawHead = () => {
      doc.setFillColor(...SOFT); doc.rect(M, y, CW, headH, 'F');
      let x = M;
      cols.forEach(c => { cell(c[0], c, x, y, 8.5, MUTED, true); x += c[1]; });
      y += headH;
    };
    drawHead();
    rows.forEach(r => {
      const n = Math.max(...r.map((t, i) => lines(t, 9.5, cols[i][1] - 4, i === 0).length));
      const h = n * lh(9.5) + 3.4;
      if (need(h)) drawHead();
      let cx = M;
      r.forEach((t, i) => { cell(t, cols[i], cx, y, 9.5, t === '—' ? MUTED : INK, i === 0); cx += cols[i][1]; });
      y += h;
      doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(M, y, M + CW, y);
    });
    y += 2.5;
    descs.forEach(lv => {
      const body = lines(`${lv.n} · ${lv.name}: ${lv.desc.trim()}`, 8.8, CW);
      need(body.length * lh(8.8));
      write(body, 8.8, M, y, MUTED);
      y += body.length * lh(8.8) + 0.6;
    });
    p.rules.forEach(rule => {
      const body = lines(rule, 8.8, CW);
      need(body.length * lh(8.8));
      write(body, 8.8, M, y, INK);
      y += body.length * lh(8.8) + 0.4;
    });
    y += 7;
  });

  if (d.reasons.length) {
    heading('Důvody sankcí', 12.5);
    const body = lines(`${d.reasons.join(' · ')}. Srážka ${SAN_PCTS.join(' / ')} % z nároku za vybraný měsíc.`, 9.5, CW);
    need(body.length * lh(9.5));
    write(body, 9.5, M, y);
    y += body.length * lh(9.5);
  }

  // Zápatí na každé stránce
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    font(8, false, MUTED);
    doc.text(`Odměny · ${d.title} · ${d.date}`, M, H - 9);
    doc.text(`strana ${i} / ${pages}`, W - M, H - 9, { align: 'right' });
  }
}

async function exportRulesPdf() {
  const button = $('#btnRulesPdf');
  button.disabled = true;
  try {
    if (!window.jspdf) await OdmLock.loadScript(`app.php?f=jspdf.js&v=${document.body.dataset.privateVersion || '1'}`);
    const [regular, semibold] = await Promise.all([pdfAsset('pdf-regular.ttf'), pdfAsset('pdf-semibold.ttf')]);
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    doc.addFileToVFS('Plex-Regular.ttf', regular);
    doc.addFont('Plex-Regular.ttf', 'Plex', 'normal');
    doc.addFileToVFS('Plex-SemiBold.ttf', semibold);
    doc.addFont('Plex-SemiBold.ttf', 'Plex', 'bold');
    const d = rulesDoc();
    doc.setProperties({ title: d.title, subject: d.sub, creator: 'Odměny' });
    drawRules(doc, d);
    downloadFile(`pravidla-hodnoceni-${new Date().toISOString().slice(0, 10)}.pdf`, doc.output('blob'), 'application/pdf');
    toast('PDF s pravidly se stahuje.');
  } catch (error) {
    toast(`PDF se nepovedlo: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

/* ==========================================================================
   NASTAVENÍ
   ========================================================================== */
function renderSettings() {
  const s = S.settings;
  const p = curPeriod();
  $('#setScore').innerHTML = `<h3>${I.tab}Tabáky a ${I.kafe}Kafe</h3>
    <p class="eyebrow">Kafe</p>
    <p class="small muted">Stejné pro všechny pozice. Kafe dostane, kdo odpracuje (včetně víkendů) aspoň práh hodin. Výchozí práh je fond: pracovní dny × délka směny.</p>
    ${p ? `<label class="field"><span>Práh pro ${esc(periodName(p))} (hodin)</span><input type="number" id="sKafe" value="${n2(kafeThreshold(p))}" min="0" step="0.5"></label>
      <p class="small muted">Fond je ${nf(periodMeta(p).fund)} h. ${kafeIsCustom(p) ? '<button class="link" type="button" id="sKafeReset">Vrátit na fond</button>' : 'Teď se používá fond.'}</p>` : '<p class="small muted">Práh jde nastavit, až bude nahraná docházka.</p>'}
    <hr class="sep"><p class="eyebrow">Ztráta nároku</p>
    <label class="field"><span>Bez nároku od dní absence</span><input type="number" id="sCut" value="${cutoffDays() || ''}" min="1" max="31" step="1" placeholder="vypnuto"></label>
    <p class="small muted">Kdo má po vyplnění víkendy tolik a víc dní absence, nedostane nic: ani tabák, ani kafe, nepomůže ani ruční úprava. Prázdné = vypnuto. Dovolená a nemoc se počítají jako chybějící dny, pokud není zapnuté „Omluvená absence snižuje fond“.</p>
    <hr class="sep"><p class="eyebrow">Tabáky</p>
    <p class="small muted">Úroveň ± docházka, nejvýš do maxima pozice = nárok. Z nároku se strhnou sankce v % (zaokrouhleno na celé tabáky, aspoň 1 za každou sankci). Nakonec ruční úprava.</p>
    <div class="form-grid">
      <label class="field"><span>Krok ruční úpravy</span><input type="number" id="sStep" value="${s.adjStep}" min="1" max="5" step="1"></label>
      <label class="field"><span>Ruční úprava smí přes maximum o</span><input type="number" id="sOver" value="${+s.adjOver || 0}" min="0" max="10" step="1"></label>
    </div>
    <p class="small muted">Tlačítkem + v přehledu jde jít nad maximum pozice nejvýš o tolik tabáků. Bonus za víkendy strop nikdy nepřekročí a výsledek neklesne pod nulu.</p>`;

  $('#setAtt').innerHTML = `<h3>Pravidla docházky</h3>
    <div class="form-grid">
      <label class="field"><span>Délka směny (hodin)</span><input type="number" id="sShift" value="${s.shift}" min="1" max="24" step="0.5"></label>
      <label class="field"><span>Zkrácený pátek (hodin)</span><input type="number" id="sFri" value="${friShift()}" min="1" max="24" step="0.5"></label>
    </div>
    <p class="small muted">Podle směny se počítá fond (dny × směna) a jestli je den odpracovaný celý. Zkrácený pátek platí jen pro lidi se zaškrtnutou volbou v části Lidé: pátek s ${nf(friShift())} h se jim počítá jako celá směna a o rozdíl se sníží jejich fond i práh Kafe.</p>
    <label class="field"><span>Kódy omluvené absence</span><input type="text" id="sExc" value="${esc(s.excused)}" maxlength="300"></label>
    <p class="small muted">Text v buňce místo hodin (dovolená, nemoc…), oddělený čárkou. Na diakritice nezáleží: OČR i OCR znamená totéž.</p>
    <label class="switch"><input type="checkbox" id="sRed"${s.excusedReducesFund ? ' checked' : ''}><span>Omluvená absence snižuje fond hodin</span></label>
    <p class="small muted">Zapnuto: dovolená ani nemoc nezpůsobí srážku tabáků. Vypnuto: počítá se celý měsíční fond a dovolená se bere jako chybějící den.</p>
    <hr class="sep"><p class="small muted">Svátky ČR (včetně pohyblivých velikonočních) se počítají automaticky a do fondu se nezahrnují. Práce ve svátek se počítá jako víkendová směna.</p>`;

  renderSecurity();

  const people = Object.values(S.employees);
  const withId = people.filter(e => e.wid).length;
  $('#setIds').innerHTML = `<h3>ID pro evidenci práce</h3>
    <p class="small muted">Když evidence práce místo jmen obsahuje ID zaměstnance, nahraj tu seznam, kdo má jaké ID: tabulku se jménem (Příjmení a Jméno, nebo Jméno a příjmení v jednom sloupci) a sloupcem ID. Nejsnáz: stáhni seznam lidí, doplň ID a nahraj ho zpátky. ID jde zadat i u člověka v části Lidé.</p>
    <p class="small"><b>${withId}</b> z ${people.length} lidí má ID.</p>
    <div class="row gap"><button class="btn sec small" type="button" id="idDown">Stáhnout seznam lidí</button><button class="btn small" type="button" id="idUp">Nahrát seznam ID</button></div>
    <input type="file" id="idFile" accept=".xlsx,.xls,.csv,.txt" hidden>
    <div id="idMsg" class="mt-s">${ui.idMsg || ''}</div>`;
  $('#idDown').onclick = exportWids;
  $('#idUp').onclick = () => $('#idFile').click();
  $('#idFile').onchange = event => { const file = event.target.files[0]; event.target.value = ''; if (file) readWids(file); };

  $('#setData').innerHTML = `<h3>Data a zálohy</h3>
    <p class="small muted">Data se ukládají na server zašifrovaná klíčem, který mají jen přístupové kartičky. Server drží posledních 30 uložení, k tomu stav z každé hodiny za poslední týden a z každého dne před tím.</p>
    <div class="action-list">
      <button class="action" type="button" id="dBackup"><b>Stáhnout šifrovanou zálohu</b><small>Soubor .odmeny otevře kterákoli platná kartička, i na novém serveru.</small></button>
      <button class="action" type="button" id="dRestore"><b>Obnovit ze zálohy</b><small>Nahradí současná data obsahem zálohy.</small></button>
      <input type="file" id="dRestoreFile" accept=".odmeny,application/json" hidden>
      <button class="action" type="button" id="dVersions"><b>Historie verzí</b><small>Vrátit data do stavu z dřívějška.</small></button>
      <button class="action" type="button" id="dRoster"><b>Export zařazení (Excel)</b><small>Pozice, úrovně a pravidla všech lidí.</small></button>
      <button class="action" type="button" id="dImp"><b>Načíst data z původní aplikace</b><small>Záloha JSON z hodnoceni-operatoru.html.</small></button>
      <input type="file" id="dFile" accept=".json,application/json" hidden>
    </div>
    <hr class="sep"><button class="btn danger" type="button" id="dReset">Vymazat všechna data</button>`;

  const bindNum = (id, fn) => { const el = $(`#${id}`); if (el) el.onchange = () => { fn(el); save(); renderAll(); }; };
  bindNum('sShift', el => { S.settings.shift = clamp(+String(el.value).replace(',', '.') || 7.5, 1, 24); });
  bindNum('sFri', el => { S.settings.friShift = clamp(+String(el.value).replace(',', '.') || 6.5, 1, 24); });
  bindNum('sStep', el => { S.settings.adjStep = clamp(Math.round(+el.value || 1), 1, 5); });
  bindNum('sOver', el => { S.settings.adjOver = clamp(Math.round(+el.value || 0), 0, 10); });
  bindNum('sKafe', el => { setKafe(el.value); });
  bindNum('sCut', el => { const v = String(el.value).trim(); S.settings.absenceCutoff = (v === '' || !(+v > 0)) ? null : clamp(Math.round(+v), 1, 31); });
  if ($('#sKafeReset')) $('#sKafeReset').onclick = () => { setKafe(''); save(); renderAll(); };
  $('#sExc').onchange = event => { S.settings.excused = event.target.value.slice(0, 300); save(); renderAll(); };
  $('#sRed').onchange = event => { S.settings.excusedReducesFund = event.target.checked; save(); renderAll(); };
  $('#dBackup').onclick = downloadBackup;
  $('#dRestore').onclick = () => $('#dRestoreFile').click();
  $('#dRestoreFile').onchange = event => { const file = event.target.files[0]; event.target.value = ''; if (file) restoreBackup(file); };
  $('#dVersions').onclick = showVersions;
  $('#dRoster').onclick = exportRoster;
  $('#dImp').onclick = () => $('#dFile').click();
  $('#dFile').onchange = event => { const file = event.target.files[0]; event.target.value = ''; if (file) importLegacy(file); };
  $('#dReset').onclick = async () => {
    const result = await dialog({ title: 'Vymazat všechna data?', danger: true, ok: 'Vymazat',
      html: '<p>Smažou se pozice, lidé, docházka, výroba, sankce i výdeje. Dosavadní stav zůstane v historii verzí, odkud ho jde vrátit.</p><label class="field"><span>Pro potvrzení napiš SMAZAT</span><input name="confirm" autocomplete="off" required autofocus></label>',
      validate: form => (form.elements.confirm.value.trim().toUpperCase() === 'SMAZAT' ? null : 'Napiš SMAZAT velkými písmeny.') });
    if (result.value !== 'ok') return;
    const keepLog = S.log;
    S = blank(); S.log = keepLog; setPeriod(null);
    store.note = { kind: 'data', text: 'Vymazána všechna data (předchozí stav je v historii verzí)' };
    save(); ui.selPerson = null; renderAll(); toast('Vymazáno.');
  };
}

const secCache = { cards: null, devices: null };

function renderSecurity() {
  const device = Vault.readDevice();
  const lock = P.lockMinutes || 15;
  const spinner = '<div class="spinner small"></div>';
  $('#setSecurity').innerHTML = `<h3>${I.shield}Zabezpečení</h3>
    <p class="small muted">Do aplikace se dostane jen ten, kdo má přístupovou kartičku, nebo zapamatované zařízení s PINem. Každá kartička otevře stejná data.</p>
    <div class="sec-block"><div class="sec-head"><p class="eyebrow">Přístupové kartičky</p><button class="btn sec small" type="button" id="secNewCard">Nová kartička</button></div><div id="secCards" class="sec-list">${secCache.cards ?? spinner}</div></div>
    <div class="sec-block"><div class="sec-head"><p class="eyebrow">Zapamatovaná zařízení</p>${device ? '<button class="btn sec small" type="button" id="secRepin">Změnit PIN</button>' : '<button class="btn sec small" type="button" id="secEnroll">Zapamatovat toto zařízení</button>'}</div><div id="secDevices" class="sec-list">${secCache.devices ?? spinner}</div></div>
    <div class="form-grid">
      <label class="field"><span>Zamknout po nečinnosti (jen tvoje kartička)</span><select id="secLock">${[5, 10, 15, 30, 60].map(m => `<option value="${m}"${m === lock ? ' selected' : ''}>${m} minut</option>`).join('')}</select></label>
      <div class="field"><span>&nbsp;</span><button class="btn sec" type="button" id="secLockNow">Zamknout teď</button></div>
    </div>
    <p class="tiny muted">Přihlášen${ui.me.label ? ` kartičkou <b>${esc(ui.me.label)}</b>` : ''}${ui.me.device ? ` na zařízení ${esc(ui.me.device)}` : ''}. Filtry, vybrané období, řazení a skryté sloupce si aplikace pamatuje zvlášť pro každou kartičku. Verze aplikace ${esc(ui.me.version || '')}.</p>`;
  $('#secLock').onchange = event => { setPref({ lockMinutes: +event.target.value }); toast(`Aplikace se zamkne po ${P.lockMinutes} minutách nečinnosti.`); };
  $('#secLockNow').onclick = () => lockApp();
  $('#secNewCard').onclick = newCard;
  if ($('#secEnroll')) $('#secEnroll').onclick = () => enrollThisDevice(false);
  if ($('#secRepin')) $('#secRepin').onclick = () => enrollThisDevice(true);
  if (secCache.cards === null && ui.view === 'nastaveni') loadSecurityLists();
}

function relTime(iso) {
  if (!iso) return 'nikdy';
  return new Date(iso).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Kartičky a zařízení ze serveru; načítají se při otevření Nastavení a po každé změně. */
async function loadSecurityLists() {
  try {
    const [cards, devices] = await Promise.all([Vault.api('cards'), Vault.api('devices')]);
    secCache.cards = cards.items.map(card => `<div class="sec-item"><div><b>${esc(card.label)}</b>${card.current ? ' <span class="tag acc">tato relace</span>' : ''}<small>vytvořena ${esc(relTime(card.created_at))} · naposledy ${esc(relTime(card.last_used_at))}</small></div>
      ${cards.items.length > 1 ? `<button class="btn danger small" type="button" data-revoke-card="${esc(card.id)}" data-label="${esc(card.label)}">Zrušit</button>` : '<span class="tiny muted">jediná</span>'}</div>`).join('');
    secCache.devices = devices.items.length ? devices.items.map(device => `<div class="sec-item"><div><b>${esc(device.label)}</b>${device.current ? ' <span class="tag acc">toto zařízení</span>' : ''}<small>přes kartičku ${esc(device.card_label)} · naposledy ${esc(relTime(device.last_used_at))}</small></div>
      <button class="btn danger small" type="button" data-revoke-device="${esc(device.id)}" data-label="${esc(device.label)}">Odebrat</button></div>`).join('') : '<p class="small muted">Žádné zařízení si PIN nepamatuje.</p>';
  } catch (error) {
    secCache.cards = `<div class="note e">${esc(error.message)}</div>`;
    secCache.devices = '';
  }
  if ($('#secCards')) $('#secCards').innerHTML = secCache.cards;
  if ($('#secDevices')) $('#secDevices').innerHTML = secCache.devices;
}

async function handleSecurityClick(event) {
  const card = event.target.closest('[data-revoke-card]');
  const device = event.target.closest('[data-revoke-device]');
  if (card) {
    if (!(await confirmBox('Zrušit kartičku?', `Kartička „${card.dataset.label}“ přestane platit a odeberou se i zařízení, která se přes ni zapamatovala. Použij to hlavně při ztrátě kartičky.`, 'Zrušit kartičku', true))) return;
    try {
      const result = await Vault.api('card', { method: 'DELETE', query: { id: card.dataset.revokeCard } });
      if (result.ended) { toast('Kartička, přes kterou jsi přihlášený, je zrušená. Aplikace se zamkne.'); setTimeout(() => lockApp(true), 1500); return; }
      toast('Kartička je zrušená.');
      loadSecurityLists();
    } catch (error) { toast(error.message, true); }
  } else if (device) {
    if (!(await confirmBox('Odebrat zařízení?', `„${device.dataset.label}“ se příště bude muset přihlásit kartičkou.`, 'Odebrat', true))) return;
    try {
      const result = await Vault.api('device', { method: 'DELETE', query: { id: device.dataset.revokeDevice } });
      const own = Vault.readDevice();
      if (own && own.id === device.dataset.revokeDevice) Vault.forgetDevice();
      if (result.ended) { toast('Toto zařízení je odebrané. Aplikace se zamkne.'); setTimeout(() => lockApp(true), 1500); return; }
      toast('Zařízení je odebrané.');
      renderSecurity();
      loadSecurityLists();
    } catch (error) { toast(error.message, true); }
  }
}

async function newCard() {
  const label = await promptBox('Nová přístupová kartička', 'Pro koho kartička je', '', 'Vytvořit', 'třeba Mistr – noční směna');
  if (!label) return;
  let card;
  try { card = await Vault.createCard(label.slice(0, 40)); } catch (error) { toast(error.message, true); return; }
  await dialog({
    title: 'Kartička je vytvořená', wide: true, ok: 'Hotovo', cancel: '',
    html: `<p class="small muted">Vytiskni ji nebo ulož obrázek. Klíč se ukazuje jen teď a nikde se neuchovává.</p><div class="card-preview">${OdmCard.html(card.key, card.label)}</div>
      <div class="row gap"><button class="btn sec" type="button" id="cPrint">Vytisknout</button><button class="btn sec" type="button" id="cPng">Stáhnout obrázek</button></div>`,
    onOpen: () => {
      $('#cPrint').onclick = () => OdmCard.print(card.key, card.label);
      $('#cPng').onclick = () => OdmCard.download(card.key, card.label).catch(error => toast(error.message, true));
    },
  });
  loadSecurityLists();
}

async function askPin(title, text) {
  let pin = null;
  const result = await dialog({
    title, ok: '', cancel: 'Zrušit',
    html: `<p class="small muted">${esc(text)}</p><div id="pinMsg"></div>${OdmLock.pinPadHtml()}`,
    onOpen: dlg => {
      OdmLock.pinPad($('.pin-block', dlg), value => {
        if (OdmLock.weakPin(value)) { $('#pinMsg').innerHTML = '<div class="note w">Tenhle PIN je moc snadný. Zvol jiný.</div>'; return false; }
        pin = value; dlg.close('ok'); return true;
      });
    },
  });
  return result.value === 'ok' ? pin : null;
}

async function enrollThisDevice(replace) {
  const first = await askPin('Zvol PIN', 'Šest číslic, kterými toto zařízení příště odemkneš.');
  if (!first) return;
  const second = await askPin('Zopakuj PIN', 'Pro kontrolu ho zadej ještě jednou.');
  if (!second) return;
  if (first !== second) { toast('PINy se neshodují, zkus to znovu.', true); return; }
  try {
    const old = Vault.readDevice();
    await Vault.enrollDevice(first);
    if (replace && old) await Vault.api('device', { method: 'DELETE', query: { id: old.id } }).catch(() => {});
    toast(replace ? 'PIN je změněný.' : 'Zařízení je zapamatované. Příště stačí PIN.');
  } catch (error) { toast(error.message, true); }
  renderSecurity();
  loadSecurityLists();
}

function downloadFile(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
}

async function downloadBackup() {
  try {
    await flushSave();
    const file = await Vault.backup(S);
    downloadFile(`odmeny-zaloha-${new Date().toISOString().slice(0, 10)}.odmeny`, JSON.stringify(file), 'application/json');
    toast('Záloha stažená. Je šifrovaná, otevře ji jen platná kartička.');
  } catch (error) { toast(error.message, true); }
}

async function askKeyForBackup() {
  let key = null;
  const result = await dialog({
    title: 'Kartička k záloze', ok: 'Otevřít zálohu',
    html: `<p class="small muted">Záloha je z jiné instalace. Opiš nebo vyfoť kartičku, která k ní patří.</p>
      <label class="field"><span>Přístupový klíč</span><input class="key-input" name="key" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-…" autofocus></label>
      <label class="btn sec small" for="keyPhoto">Načíst z fotky kartičky</label><input type="file" id="keyPhoto" accept="image/*" capture="environment" hidden>`,
    onOpen: dlg => {
      $('#keyPhoto', dlg).onchange = async event => {
        const file = event.target.files[0];
        if (!file) return;
        try { dlg.querySelector('[name="key"]').value = Vault.formatKey(await OdmLock.keyFromPhoto(file)); } catch (error) { toast(error.message, true); }
      };
    },
  });
  if (result.value === 'ok') key = result.form.elements.key.value;
  return key;
}

/** Nahradí data (záloha, starší verze, původní aplikace). Historie změn pokračuje dál, jeden záznam o obnovení. */
async function replaceState(next, message, note) {
  const keepLog = S.log;
  S = sanitizeState(next);
  S.log = keepLog;
  applyPeriodPref();
  store.note = { kind: 'data', text: note || message };
  ui.selPerson = null; ui.selPos = null; ui.openDetail = null; ui.profileKey = null;
  if (ui.view === 'profil') showView('lide');
  save();
  renderAll();
  toast(message);
}

async function restoreBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (error) { toast('Soubor zálohy nejde přečíst.', true); return; }
  let opened;
  try {
    opened = await Vault.openBackup(data);
  } catch (error) {
    if (!error.needsKey) { toast(error.message, true); return; }
    const key = await askKeyForBackup();
    if (!key) return;
    try { opened = await Vault.openBackup(data, key); } catch (inner) { toast(inner.message, true); return; }
  }
  const when = data.created_at ? new Date(data.created_at).toLocaleString('cs-CZ') : 'neznámé datum';
  if (!(await confirmBox('Obnovit ze zálohy?', `Současná data se nahradí zálohou z ${when}. Dosavadní stav zůstane v historii verzí.`, 'Obnovit'))) return;
  replaceState(opened.state, 'Data jsou obnovená ze zálohy.', `Obnoveno ze zálohy z ${when}`);
}

async function showVersions() {
  let items;
  try { items = (await Vault.api('versions')).items; } catch (error) { toast(error.message, true); return; }
  let chosen = null;
  await dialog({
    title: 'Historie verzí', wide: true, ok: '', cancel: 'Zavřít',
    html: items.length ? `<p class="small muted">Každé uložení vytvoří verzi. Obnovení vrátí data do vybraného stavu a uloží je jako novou verzi.</p><div class="version-list">${items.map((item, index) => `<div class="version"><div><b>${esc(new Date(item.created_at).toLocaleString('cs-CZ'))}</b><small>${esc(item.by || '')} · ${Math.max(1, Math.round(item.size / 1024))} kB${index === 0 ? ' · aktuální' : ''}</small></div>${index === 0 ? '' : `<button class="btn sec small" type="button" data-rev="${item.rev}">Obnovit</button>`}</div>`).join('')}</div>` : '<p>Zatím žádné verze.</p>',
    onOpen: dlg => { $$('[data-rev]', dlg).forEach(button => { button.onclick = () => { chosen = +button.dataset.rev; dlg.close('ok'); }; }); },
  });
  if (!chosen) return;
  try {
    const state = await Vault.loadVersion(chosen);
    const item = items.find(x => x.rev === chosen);
    replaceState(state, 'Data jsou vrácená do vybrané verze.', `Data vrácena do verze z ${item ? new Date(item.created_at).toLocaleString('cs-CZ') : 'historie'}`);
  } catch (error) { toast(error.message, true); }
}

async function importLegacy(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (error) { toast('Soubor nejde přečíst.', true); return; }
  if (!data || typeof data !== 'object' || !data.positions || !data.employees) { toast('Tohle není záloha původní aplikace (chybí pozice a lidé).', true); return; }
  if (!(await confirmBox('Načíst data z původní aplikace?', 'Současná data se nahradí obsahem souboru. Dosavadní stav zůstane v historii verzí.', 'Načíst'))) return;
  replaceState(data, 'Data z původní aplikace jsou načtená a zašifrovaná.', `Načtena data z původní aplikace (${file.name})`);
}

/* ==========================================================================
   EXPORTY
   ========================================================================== */
function copyTable() {
  const { head, body } = exportRows(ovData());
  const clean = value => String(safeCell(value ?? '')).replace(/[\t\r\n]+/g, ' ');
  const tsv = [head.join('\t')].concat(body.map(row => row.map(clean).join('\t'))).join('\n');
  navigator.clipboard.writeText(tsv).then(() => toast('Tabulka zkopírovaná. Vlož ji do Excelu přes Ctrl+V.'), () => toast('Kopírování se nepovedlo.', true));
}

async function exportXlsx() {
  try {
    const X = await xlsx();
    const { head, body, title } = exportRows(ovData());
    const ws = X.utils.aoa_to_sheet([head].concat(body.map(row => row.map(safeCell))));
    ws['!cols'] = head.map((h, i) => ({ wch: i < 3 ? 16 : Math.max(9, h.length + 2) }));
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, 'Hodnocení');
    downloadFile(`${title.replace(/\s/g, '-')}.xlsx`, new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch (error) { toast(`Export se nepovedl: ${error.message}`, true); }
}

async function exportRoster() {
  try {
    const X = await xlsx();
    const { main, posSheet, rules } = rosterSheets();
    const stamp = new Date().toISOString().slice(0, 10);
    const sheet = (rows, cols) => { const ws = X.utils.aoa_to_sheet(rows.map(row => row.map(safeCell))); ws['!cols'] = cols.map(wch => ({ wch })); return ws; };
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, sheet(main, [18, 14, 18, 12, 16, 16, 15, 18, 28]), 'Zařazení');
    X.utils.book_append_sheet(wb, sheet(posSheet, [18, 8, 16, 9, 60]), 'Úrovně');
    X.utils.book_append_sheet(wb, sheet(rules, [18, 9, 7, 8, 34]), 'Pravidla');
    downloadFile(`zarazeni-${stamp}.xlsx`, new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch (error) { toast(`Export se nepovedl: ${error.message}`, true); }
}

async function exportWids() {
  try {
    const X = await xlsx();
    const ws = X.utils.aoa_to_sheet(widSheet().map(row => row.map(safeCell)));
    ws['!cols'] = [18, 14, 18, 20].map(wch => ({ wch }));
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws, 'ID zaměstnanců');
    downloadFile(`id-zamestnancu-${new Date().toISOString().slice(0, 10)}.xlsx`, new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch (error) { toast(`Export se nepovedl: ${error.message}`, true); }
}

async function readWids(file) {
  try {
    const sheets = await readTable(file);
    let res = null;
    for (const sheet of sheets) { res = applyWids(sheet.aoa); if (!res.err) break; }
    if (res.err) { ui.idMsg = `<div class="note e"><b>Načtení selhalo.</b> ${esc(res.err)}</div>`; renderSettings(); return; }
    const parts = [`<b>ID načtena.</b> Nově přiřazeno ${res.set}${res.same ? `, beze změny ${res.same}` : ''}.`];
    if (res.clash.length) parts.push(`ID přešlo na jiného člověka: ${esc(res.clash.join('; '))}.`);
    if (res.unknown.length) parts.push(`Tahle jména v hodnocení nejsou (přeskočeno): ${esc(res.unknown.slice(0, 15).join(', '))}${res.unknown.length > 15 ? ` a dalších ${res.unknown.length - 15}` : ''}.`);
    if (res.dup.length) parts.push(`Stejné ID u více lidí (přeskočeno): ${esc([...new Set(res.dup)].join(', '))}.`);
    ui.idMsg = `<div class="note ${res.unknown.length || res.dup.length ? 'w' : 'i'}">${parts.join(' ')}</div>`;
    save(); renderAll(); toast('Seznam ID načten.');
  } catch (error) {
    ui.idMsg = `<div class="note e">Soubor nejde otevřít: ${esc(error.message)}</div>`;
    renderSettings();
  }
}

async function readRoster(file) {
  if (!file) return;
  try {
    const sheets = await readTable(file, names => [names.find(n => /zařazení|zarazeni/i.test(n)) || names.find(n => /matice/i.test(n)) || names[0]]);
    const res = applyRoster(sheets[0].aoa);
    $('#rosterMsg').innerHTML = res.err ? `<div class="note e"><b>Načtení selhalo.</b> ${esc(res.err)}</div>`
      : `<div class="note i"><b>Zařazení načteno.</b> ${res.touched} lidí${res.created ? `, z toho ${res.created} nových` : ''}${res.newPos ? `, nové pozice: ${res.newPos}` : ''}${res.noLvl ? `, u ${res.noLvl} nešla přečíst úroveň (nechal jsem původní)` : ''}.</div>`;
    if (!res.err) { save(); ui.selPerson = null; renderAll(); toast('Zařazení načteno.'); }
  } catch (error) {
    $('#rosterMsg').innerHTML = `<div class="note e">Soubor nejde otevřít: ${esc(error.message)}</div>`;
  }
}

/* ==========================================================================
   HISTORIE ZMĚN (kdo, co a kdy změnil)
   ========================================================================== */
const svg = (d, cls = 'icon') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const LOG_ICON = {
  person: svg('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-3.8 3.8-5.5 7-5.5s6 1.7 7 5.5"/>'),
  level: svg('<path d="M4 19h4v-4h4v-4h4V7h4"/>'),
  sanction: svg('<path d="M12 3.5 21 19.5H3z"/><path d="M12 10v4.5M12 17.2v.1"/>'),
  adjust: svg('<path d="M12 5v6M9 8h6M9 17h6"/>'),
  issue: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  import: svg('<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5M12 17.5v-6M9.5 14 12 11.5l2.5 2.5"/>'),
  position: svg('<path d="M4 7h10M4 12h16M4 17h7"/><circle cx="17" cy="7" r="2"/><circle cx="14" cy="17" r="2"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>'),
  data: svg('<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>'),
};
const LOG_FILTERS = [
  ['all', 'Vše', null],
  ['manual', 'Ruční úpravy', ['person', 'level', 'sanction', 'adjust', 'issue', 'position', 'settings']],
  ['people', 'Lidé a úrovně', ['person', 'level']],
  ['sanction', 'Sankce', ['sanction']],
  ['tab', 'Tabáky a výdej', ['adjust', 'issue']],
  ['import', 'Importy a data', ['import', 'data']],
  ['settings', 'Pozice a nastavení', ['position', 'settings']],
];

function unseenLog() {
  return (S?.log || []).filter(x => x.at > P.logSeen && x.card !== ui.me.cardId).length;
}

function renderLogBadge() {
  const badge = $('#logBadge');
  if (!badge || !S) return;
  const n = unseenLog();
  badge.hidden = !n;
  badge.textContent = n > 99 ? '99+' : String(n);
  $('#logBtn').title = n ? `Poslední změny: ${n} nových od ostatních` : 'Poslední změny';
}

function logDay(ts) {
  const d = new Date(ts);
  const today = new Date();
  const start = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 864e5);
  if (diff === 0) return 'Dnes';
  if (diff === 1) return 'Včera';
  return d.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });
}

function logListHtml(items, seen, withProfile = true) {
  let html = '';
  let day = '';
  items.forEach(x => {
    const d = logDay(x.at);
    if (d !== day) { html += `<p class="log-day">${esc(d)}</p>`; day = d; }
    const isNew = x.at > seen && x.card !== ui.me.cardId;
    const time = new Date(x.at).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
    html += `<div class="log-item${isNew ? ' new' : ''}" data-kind="${esc(x.kind)}"><span class="log-ico">${LOG_ICON[x.kind] || LOG_ICON.data}</span>
      <div class="log-body"><p>${esc(x.text)}</p><small>${esc(time)} · ${esc(x.by || 'neznámá kartička')}${ui.me.cardId && x.card === ui.me.cardId ? ' (ty)' : ''}${isNew ? ' · <b>nové</b>' : ''}</small></div>
      ${withProfile && x.key && S.employees[x.key] ? `<button class="btn ghost small" type="button" data-logprofile="${esc(x.key)}">Profil</button>` : ''}</div>`;
  });
  return html;
}

async function openLog() {
  await flushSave();
  const seen = P.logSeen;
  setPref({ logSeen: Date.now() });
  renderLogBadge();
  let filter = 'all';
  let query = '';
  let limit = 80;
  let target = null;
  await dialog({
    title: 'Poslední změny', wide: true, ok: '', cancel: 'Zavřít',
    html: `<p class="small muted">Každá úprava dat s tím, kdo ji udělal (podle přihlášené kartičky) a kdy. Opakované úpravy téže věci během pár minut se slučují.</p>
      <div class="log-tools"><div class="chips">${LOG_FILTERS.map(([k, t]) => `<button type="button" class="chip${k === 'all' ? ' on' : ''}" data-lf="${k}" aria-pressed="${k === 'all'}">${t}</button>`).join('')}</div>
      <input type="search" id="logQ" placeholder="Hledat jméno, kartičku nebo text…" aria-label="Hledat v historii"></div>
      <div class="log-list" id="logList"></div>`,
    onOpen: dlg => {
      const draw = () => {
        const kinds = LOG_FILTERS.find(f => f[0] === filter)[2];
        const all = (S.log || []).slice().reverse().filter(x => (!kinds || kinds.includes(x.kind)) && (!query || norm(`${x.text} ${x.by}`).includes(query)));
        const items = all.slice(0, limit);
        $('#logList', dlg).innerHTML = items.length
          ? logListHtml(items, seen) + (all.length > limit ? `<button class="btn sec small wide" type="button" id="logMore">Zobrazit starší (${all.length - limit})</button>` : '')
          : emptyState(S.log.length ? 'Nic neodpovídá' : 'Zatím žádné změny', S.log.length ? 'Zkus jiný filtr nebo hledání.' : 'Každá úprava dat se tu objeví i s tím, kdo a kdy ji udělal.');
        const more = $('#logMore', dlg);
        if (more) more.onclick = () => { limit += 150; draw(); };
      };
      $$('[data-lf]', dlg).forEach(button => {
        button.onclick = () => {
          filter = button.dataset.lf;
          $$('[data-lf]', dlg).forEach(x => { x.classList.toggle('on', x === button); x.setAttribute('aria-pressed', String(x === button)); });
          limit = 80;
          draw();
        };
      });
      $('#logQ', dlg).oninput = event => { query = norm(event.target.value); limit = 80; draw(); };
      $('#logList', dlg).onclick = event => {
        const button = event.target.closest('[data-logprofile]');
        if (button) { target = button.dataset.logprofile; dlg.close('cancel'); }
      };
      draw();
    },
  });
  if (target) openProfile(target);
}

/* ==========================================================================
   MATICE DOVEDNOSTÍ
   ========================================================================== */
/** Čtvrtinový kruh (ILUO): 1 = čtvrtina … 4 = plný kruh. */
function iluo(n, main = false) {
  const c = 9;
  const r = 7;
  let fill = '';
  if (n >= 4) fill = `<circle class="fill" cx="${c}" cy="${c}" r="${r}"/>`;
  else if (n > 0) {
    const angle = n * Math.PI / 2;
    const x = c + r * Math.sin(angle);
    const y = c - r * Math.cos(angle);
    fill = `<path class="fill" d="M${c} ${c}V${c - r}A${r} ${r} 0 ${n > 2 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z"/>`;
  }
  // Třída „is-home“, ne „main“: .main je rozvržení stránky a nafouklo by ikonu.
  return `<svg class="iluo l${n}${main ? ' is-home' : ''}" viewBox="0 0 18 18" aria-hidden="true"><circle class="ring" cx="${c}" cy="${c}" r="${r}"/>${fill}</svg>`;
}

function setSkill(key, posId, lvl) {
  const e = S.employees[key];
  if (!e || e.positionId === posId || !S.positions.some(p => p.id === posId)) return;
  e.skills = e.skills || {};
  if (lvl >= 1 && lvl <= 4) e.skills[posId] = lvl; else delete e.skills[posId];
  if (!Object.keys(e.skills).length) delete e.skills;
  save();
}

function renderMatrix() {
  const box = $('#matrixView');
  if (!box || !S) return;
  const depts = departments();
  const dept = depts.includes(P.matrixDept) ? P.matrixDept : '';
  $('#matrixDept').innerHTML = `<option value="">Všechna oddělení</option>${depts.map(d => `<option value="${esc(d)}"${d === dept ? ' selected' : ''}>${esc(d)}</option>`).join('')}`;
  $('#matrixLegend').innerHTML = `<span>${iluo(1)} 1 zaučuje se</span><span>${iluo(2)} 2 pokročilý</span><span>${iluo(3)} 3 samostatný</span><span>${iluo(4)} 4 profík, zaučuje ostatní</span><span>${iluo(3, true)} hlavní pozice</span><span><i class="mx-risk-dot"></i> méně než 2 samostatní na pozici</span>`;
  const m = skillMatrix(dept || null);
  if (!m.cols.length || !m.rows.length) {
    box.innerHTML = `<div class="card">${emptyState(m.cols.length ? 'Zatím nikdo' : 'Žádné pozice', m.cols.length ? 'Zařaď lidi na pozice v části Lidé, nebo jim přidej zaučení v jejich detailu.' : 'Nejdřív založ pozice.')}</div>`;
    return;
  }
  const groups = [];
  m.cols.forEach(p => {
    const d = deptOf(p);
    const last = groups[groups.length - 1];
    if (last && last.d === d) last.n += 1; else groups.push({ d, n: 1 });
  });
  const cell = (r, c, j) => {
    const p = m.cols[j];
    if (c.main) return `<td class="mx-cell is-main"><span class="mx-static" title="${esc(`${p.name}: hlavní pozice, úroveň ${c.lvl || 'nevybraná'}. Mění se v detailu člověka.`)}">${iluo(c.lvl, true)}<b>${c.lvl || '?'}</b></span></td>`;
    const next = (c.lvl + 1) % 5;
    return `<td class="mx-cell"><button type="button" class="mx-btn" data-mx="${esc(r.e.key)}" data-pos="${esc(p.id)}" data-lvl="${c.lvl}" title="${esc(`${p.name}: ${c.lvl ? `zaučení ${c.lvl} (${p.levels[c.lvl - 1].name})` : 'nezaučen'}. Kliknutím ${next ? `na ${next}` : 'zrušíš'}.`)}" aria-label="${esc(`${r.e.last} ${r.e.first}, ${p.name}: ${c.lvl || 'nezaučen'}`)}">${iluo(c.lvl)}<b>${c.lvl || ''}</b></button></td>`;
  };
  // Řádek oddělení jen tehdy, když nějaká pozice oddělení má (jinak by opakoval názvy pozic).
  const hasDepts = S.positions.some(p => (p.dept || '').trim());
  box.innerHTML = `<div class="table-card matrix-card"><table class="matrix">
    <thead>${dept || !hasDepts ? '' : `<tr class="mx-depts"><th colspan="2"></th>${groups.map(g => `<th colspan="${g.n}" class="mx-dept">${esc(m.cols.find(p => deptOf(p) === g.d)?.dept?.trim() ? g.d : '')}</th>`).join('')}</tr>`}
      <tr><th class="mx-name">Zaměstnanec</th><th class="mx-main">Hlavní pozice</th>${m.cols.map(p => `<th class="mx-col" title="${esc(p.name)}"><span>${esc(p.name)}</span></th>`).join('')}</tr></thead>
    <tbody>${m.rows.map((r, i) => `${dept && !r.home && (i === 0 || m.rows[i - 1].home) ? `<tr class="mx-sep"><td colspan="${m.cols.length + 2}">Zaučení z jiných oddělení</td></tr>` : ''}<tr>
      <th class="mx-name" scope="row"><button class="linkish" type="button" data-profile="${esc(r.e.key)}">${esc(r.e.last)} ${esc(r.e.first)}</button></th>
      <td class="mx-main">${r.pos ? `${esc(r.pos.name)}${r.e.level ? ` <span class="lvl l${r.e.level}">${r.e.level}</span>` : ''}` : '<span class="muted">—</span>'}</td>
      ${r.cells.map((c, j) => cell(r, c, j)).join('')}</tr>`).join('')}</tbody>
    <tfoot><tr><th colspan="2">Samostatní (úroveň 3–4)</th>${m.coverage.map(c => `<td class="${c.ready < 2 ? 'mx-risk' : ''}" title="${esc(`${c.counts[4]}× profík, ${c.counts[3]}× samostatný`)}">${c.ready}</td>`).join('')}</tr>
      <tr><th colspan="2">Zaučení celkem (1–4)</th>${m.coverage.map(c => `<td>${c.trained}</td>`).join('')}</tr></tfoot>
  </table></div>`;
  // Druhý řádek hlavičky se lepí pod řádek oddělení: odsazení podle jeho skutečné výšky.
  const deptRow = box.querySelector('tr.mx-depts');
  if (deptRow) $$('thead tr:not(.mx-depts) th', box).forEach(th => { th.style.top = `${deptRow.offsetHeight}px`; });
}

async function exportMatrix() {
  try {
    const X = await xlsx();
    const wb = X.utils.book_new();
    matrixSheets().forEach(sheet => {
      const ws = X.utils.aoa_to_sheet(sheet.rows.map(row => row.map(safeCell)));
      ws['!cols'] = sheet.cols.map(wch => ({ wch }));
      X.utils.book_append_sheet(wb, ws, sheet.name);
    });
    downloadFile(`matice-dovednosti-${new Date().toISOString().slice(0, 10)}.xlsx`, new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch (error) { toast(`Export se nepovedl: ${error.message}`, true); }
}

/* ==========================================================================
   PROFIL ČLOVĚKA
   ========================================================================== */
const RANGE_PRESETS = [['month', 'Vybraný měsíc'], ['3', '3 měsíce'], ['6', '6 měsíců'], ['12', '12 měsíců'], ['year', 'Rok'], ['all', 'Celá historie'], ['custom', 'Vlastní období']];

function openProfile(key) {
  if (!S.employees[key]) { toast('Tenhle člověk už v evidenci není.', true); return; }
  ui.profileKey = key;
  showView('profil');
}

function shiftMonth(id, delta) {
  const d = new Date(+id.slice(0, 4), +id.slice(5, 7) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function profileRange(key) {
  const all = personMonths(key);
  const last = all[all.length - 1] || S.current || thisMonthId();
  switch (P.profileRange) {
    case 'month': { const id = S.current || last; return [id, id]; }
    case '3': return [shiftMonth(last, -2), last];
    case '6': return [shiftMonth(last, -5), last];
    case 'year': return [`${last.slice(0, 4)}-01`, `${last.slice(0, 4)}-12`];
    case 'all': return [all[0] || last, last];
    case 'custom': {
      const from = P.profileFrom || all[0] || last;
      const to = P.profileTo || last;
      return from <= to ? [from, to] : [to, from];
    }
    default: return [shiftMonth(last, -11), last];
  }
}

/** Horní mez osy (1, 2, 5, 10 × 10ⁿ). U celých čísel sudá, aby i prostřední značka byla celá. */
function niceMax(v, integer = false) {
  if (integer) return 2 * Math.max(1, Math.ceil(niceMax(v / 2)));
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** Sloupcový graf jedné řady po měsících (SVG). Hodnoty ukazuje tooltip i tabulka pod grafy. */
function columnChart({ title, sub, months, value, tip, tone, yMax = null, fmt = v => nf(v, 1), ref = null, integer = false }) {
  const W = 340;
  const H = 168;
  const L = 34;
  const R = 8;
  const T = 16;
  const B = 24;
  const vals = months.map(value);
  const present = vals.filter(v => v != null);
  if (!present.length) return `<figure class="chart ${tone}"><figcaption><b>${esc(title)}</b><span>${esc(sub)}</span></figcaption><div class="chart-empty">V tomto období bez údajů.</div></figure>`;
  const top = yMax ?? niceMax(Math.max(...present) * 1.08, integer);
  const plotH = H - T - B;
  const band = (W - L - R) / months.length;
  const bw = Math.max(3, Math.min(24, band - 4));
  const y = v => T + plotH - (Math.min(v, top) / top) * plotH;
  const ticks = [0, top / 2, top];
  const every = Math.ceil(months.length / 8);
  let lastIdx = -1;
  vals.forEach((v, i) => { if (v != null) lastIdx = i; });
  const bars = vals.map((v, i) => {
    const x = L + i * band + (band - bw) / 2;
    const base = T + plotH;
    let mark = '';
    if (v != null && v > 0) {
      const yy = y(v);
      const r = Math.min(4, bw / 2, base - yy);
      mark = `<path class="bar" d="M${x.toFixed(1)} ${base}V${(yy + r).toFixed(1)}Q${x.toFixed(1)} ${yy.toFixed(1)} ${(x + r).toFixed(1)} ${yy.toFixed(1)}H${(x + bw - r).toFixed(1)}Q${(x + bw).toFixed(1)} ${yy.toFixed(1)} ${(x + bw).toFixed(1)} ${(yy + r).toFixed(1)}V${base}Z"/>`;
    } else if (v === 0) {
      mark = `<rect class="bar zero" x="${x.toFixed(1)}" y="${base - 1}" width="${bw.toFixed(1)}" height="1"/>`;
    }
    const label = i % every === 0 || i === months.length - 1
      ? `<text class="xl" x="${(L + i * band + band / 2).toFixed(1)}" y="${H - 8}">${esc(MON[+months[i].id.slice(5, 7) - 1])}${i === 0 || months[i].id.slice(5, 7) === '01' ? ` ${months[i].id.slice(2, 4)}` : ''}</text>` : '';
    const cap = i === lastIdx && v != null ? `<text class="cap" x="${(x + bw / 2).toFixed(1)}" y="${(y(v) - 5).toFixed(1)}">${esc(fmt(v))}</text>` : '';
    const hit = `<rect class="hit" x="${(L + i * band).toFixed(1)}" y="${T}" width="${band.toFixed(1)}" height="${plotH}" tabindex="0" data-tip="${esc(tip(months[i], v))}"/>`;
    return mark + cap + label + hit;
  }).join('');
  const grid = ticks.map(t => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="yl" x="${L - 6}" y="${(y(t) + 3.5).toFixed(1)}">${esc(fmt(t))}</text>`).join('');
  const refLine = ref != null && ref <= top ? `<line class="ref" x1="${L}" x2="${W - R}" y1="${y(ref).toFixed(1)}" y2="${y(ref).toFixed(1)}"/>` : '';
  return `<figure class="chart ${tone}"><figcaption><b>${esc(title)}</b><span>${esc(sub)}</span></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${grid}${refLine}${bars}</svg></figure>`;
}

function pfCalendar(cells) {
  return `<div class="calwrap"><div class="calrow">${cells.map(c => {
    let cls = 'cell';
    if (c.wk) cls += c.h > 0 ? ' wk' : ' wk0';
    else if (c.h >= (c.ds || S.settings.shift) - 1e-9) cls += ' full';
    else if (c.h > 0) cls += ' part';
    else if (c.ex || c.c) cls += ' abs';
    else cls += ' miss';
    return `<div class="${cls}" title="${esc(`${DOW[c.dow]} ${c.d}. ${c.h > 0 ? `${nf(c.h)} h` : (c.c || 'nic')}${c.hol ? ` — ${c.hol}` : ''}`)}">${c.d}</div>`;
  }).join('')}</div></div>`;
}

function renderProfile() {
  const box = $('#profileView');
  if (!box || !S) return;
  const e = ui.profileKey ? S.employees[ui.profileKey] : null;
  if (!e) {
    box.innerHTML = `<button class="btn ghost small" type="button" data-pfback>${I.back}Zpět</button><div class="card">${emptyState('Profil není k dispozici', 'Člověk už v evidenci není.')}</div>`;
    return;
  }
  const [from, to] = profileRange(e.key);
  const pd = profileData(e.key, from, to);
  const t = pd.totals;
  const L = levelOf(e);
  const name = `${e.last} ${e.first}`;
  const months = pd.months;
  const rangeLabel = from === to ? monthLabel(from) : `${monthLabel(from)} – ${monthLabel(to)}`;
  const skills = S.positions.filter(p => p.id !== e.positionId && e.skills && e.skills[p.id]);
  const personLog = (S.log || []).filter(x => x.key === e.key).slice(-25).reverse();
  const chartMonths = monthsBetween(from, to).map(id => months.find(m => m.id === id) || { id, label: monthLabel(id), hasAtt: false, prod: null, sanctions: [] });
  /* ukazatele pro navýšení platu: sloupce jen když jsou data (čas v evidenci) nebo pozice navýšení má */
  const showPerf = months.some(m => m.perf.time);
  const showRaise = months.some(m => m.posId && hasRaise(S.positions.find(p => p.id === m.posId)));
  const lastRaise = months.slice().reverse().find(m => m.hasAtt);
  const perfTd = (label, v, min) => `<td data-label="${label}" class="r num nowrap">${v == null ? '<span class="muted">—</span>' : `<span class="${min != null && v < min - 1e-9 ? 'pen' : ''}" title="${nf(v, 1)} %${min != null ? ` (podmínka ${nf(min, 1)} %)` : ''}">${nf(v, 0)} %</span>`}</td>`;
  const ownLv = m => { const p = m.raise.own ? S.positions.find(x => x.id === m.posId) : null; return p ? p.levels[m.raise.own.lvl - 1] : null; };

  box.innerHTML = `<div class="pf-top noprint"><button class="btn ghost small" type="button" data-pfback>${I.back}Zpět</button></div>
    <header class="page-head pf-head">
      <div>
        <p class="eyebrow">Profil zaměstnance</p>
        <h1>${esc(name)}</h1>
        <p class="pf-meta">${L.pos ? `<span class="lvl l${L.n || 0}">${L.n || '?'}</span> <b>${esc(L.pos.name)}</b>${L.n ? ` · ${esc(L.lv.name)} (${L.base} ${tabW(L.base)})` : ' · bez úrovně'} · oddělení ${esc(deptOf(L.pos))}` : '<span class="crit">bez pozice</span>'}${e.shortFri ? ` · zkrácený pátek ${nf(friShift())} h` : ''}${e.excluded ? ' · <span class="tag">vyřazen ze seznamu</span>' : ''}</p>
        ${e.note ? `<p class="small muted">${esc(e.note)}</p>` : ''}
      </div>
      <div class="page-actions noprint">
        <button class="btn sec" type="button" data-pfedit>Upravit zařazení</button>
        <button class="btn sec" type="button" data-pfxlsx>Excel</button>
        <button class="btn sec" type="button" data-pfprint>Tisk</button>
      </div>
    </header>
    <div class="range-bar noprint">
      <div class="chips" role="group" aria-label="Období">${RANGE_PRESETS.map(([k, label]) => `<button type="button" class="chip${P.profileRange === k ? ' on' : ''}" data-range="${k}" aria-pressed="${P.profileRange === k}">${k === 'year' ? `Rok ${to.slice(0, 4)}` : label}</button>`).join('')}</div>
      <div class="range-custom"${P.profileRange === 'custom' ? '' : ' hidden'}>
        <label>Od <input type="month" id="pfFrom" value="${esc(from)}"></label>
        <label>Do <input type="month" id="pfTo" value="${esc(to)}"></label>
      </div>
    </div>
    <p class="pf-range"><b>${esc(rangeLabel)}</b> · ${t.months ? `${t.months} ${t.months === 1 ? 'měsíc' : t.months < 5 ? 'měsíce' : 'měsíců'} se záznamem, docházka za ${t.attMonths}` : 'v tomto období žádné záznamy'}</p>
    <div class="stats">${[
      statTile(`${I.tab}Tabáky (výpočet)`, `${nf(t.tabaky, 0)}<em>/ ${nf(t.max, 0)}</em>`, t.issuedMonths ? `vydáno ${nf(t.issuedTab, 0)} za ${t.issuedMonths} měs.` : 'zatím nic nevydáno', 'tab'),
      statTile(`${I.kafe}Kafe`, t.attMonths ? `${t.kafe}<em>/ ${t.attMonths}</em>` : '—', t.attMonths ? 'měsíců splněno' : 'bez docházky', 'kafe'),
      statTile('Docházka', t.attendance != null ? `${pct(t.attendance)} %` : '—', t.attMonths ? `${nf(t.hours)} h · ${t.workDays} dnů + ${t.wkDays} víkend.` : 'bez docházky', 'good'),
      statTile('Absence', t.attMonths ? String(t.missing) : '—', t.attMonths ? `${dnW(t.missing)} po vyplnění víkendem (celkem ${t.absence})${t.lost ? `, ${t.lost}× bez nároku` : ''}` : 'bez docházky', t.missing ? 'crit' : ''),
      statTile('Sankce', String(t.sanctions), t.sanctions ? `celkem ${t.pen ? `−${t.pen}` : '0'} ${tabW(t.pen)}` : 'žádné', t.sanctions ? 'crit' : ''),
      statTile('Výroba', t.perDay != null ? nf(t.perDay, 1) : '—', t.prodTotal ? `Ø ks/den · ${nf(t.prodTotal, 0)} ks celkem` : 'bez záznamu', ''),
      ...(showPerf || showRaise ? [statTile('Navýšení platu', lastRaise ? (lastRaise.raise.pct > 0 ? `+${nf(lastRaise.raise.pct, 1)} %` : '0 %') : '—',
        `${lastRaise ? `${esc(lastRaise.label)} · ` : ''}norma ${pctText(t.normPct)} · využití ${pctText(t.usePct)}`, lastRaise && lastRaise.raise.pct > 0 ? 'good' : '')] : []),
    ].join('')}</div>
    <div class="pf-charts" id="pfCharts">
      ${columnChart({ title: 'Tabáky po měsících', sub: 'výpočet podle úrovně, docházky a sankcí', tone: 'c-tab', months: chartMonths,
        value: m => (m.hasAtt ? m.total : null), fmt: v => nf(v, 0), integer: true,
        tip: (m, v) => (m.hasAtt ? `${m.label}: ${v} z ${m.max} ${tabW(m.max)}${m.issued ? `, vydáno ${issueWhat(m.issued.tabaky, m.issued.kafe)}` : ''}` : `${m.label}: bez docházky`) })}
      ${columnChart({ title: 'Docházka', sub: 'odpracováno z fondu hodin (%)', tone: 'c-acc', months: chartMonths, yMax: 100, ref: 100,
        value: m => (m.hasAtt && m.fund ? Math.round(Math.min(1, m.capped / m.fund) * 100) : null), fmt: v => `${nf(v, 0)} %`,
        tip: (m, v) => (m.hasAtt ? `${m.label}: ${v} % (${nf(m.hours)} h z fondu ${nf(m.fund)} h), absence ${m.absence} ${dnW(m.absence)}, víkend ${m.wkDays}×` : `${m.label}: bez docházky`) })}
      ${columnChart({ title: 'Výroba', sub: 'Ø kusů na odpracovaný den', tone: 'c-prod', months: chartMonths,
        value: m => (m.prod && m.prod.perDay != null ? m.prod.perDay : null), fmt: v => nf(v, v >= 100 ? 0 : v < 1 ? 2 : 1),
        tip: (m, v) => (m.prod ? `${m.label}: ${v != null ? `${nf(v, 1)} ks/den` : '—'}, celkem ${nf(m.prod.total, 0)} ks za ${m.prod.days} dnů` : `${m.label}: bez záznamu ve výrobě`) })}
      <div class="chart-tip" id="pfTip" role="status" hidden></div>
    </div>
    <div class="card pf-months">
      <h3>Měsíc po měsíci</h3>
      ${months.length ? `<div class="table-card flat"><table class="stack pf-table"><thead><tr><th>Měsíc</th><th>Zařazení</th><th class="r">Dny</th><th class="r">Hodiny</th><th class="r">Absence</th><th class="c">Kafe</th><th class="r">Docházka</th><th class="r">Sankce</th><th class="r">Úprava</th><th class="r">Tabáky</th><th class="c">Vydáno</th><th class="r">Ø ks/den</th>${showPerf ? '<th class="r" title="Norma ÷ strávený čas">Norma</th><th class="r" title="Čas nad zakázkami ÷ hodiny v práci">Využití</th>' : ''}${showRaise ? '<th class="r">Plat</th>' : ''}</tr></thead>
      <tbody>${months.slice().reverse().map(m => `<tr data-pfmonth="${esc(m.id)}" class="${m.lost ? 'is-lost' : ''}">
        <td data-label="Měsíc" class="name nowrap"><b>${esc(m.label)}</b></td>
        <td data-label="Zařazení">${m.pos ? `${esc(m.pos)}${m.lvl ? ` <span class="lvl l${m.lvl}" title="${esc(m.lvlName)}${m.from === 'issued' ? ' (podle výdeje)' : ''}">${m.lvl}</span>` : ''}` : '<span class="muted">—</span>'}</td>
        <td data-label="Dny" class="r num">${m.hasAtt ? `${m.workDays}${m.wkDays ? ` <span class="tag wk">+${m.wkDays}</span>` : ''}` : '<span class="muted">—</span>'}</td>
        <td data-label="Hodiny" class="r num">${m.hasAtt ? nf(m.hours) : '<span class="muted">—</span>'}</td>
        <td data-label="Absence" class="r num">${m.hasAtt ? (m.missing ? `<span class="pen">${m.missing}</span>` : '0') : '<span class="muted">—</span>'}</td>
        <td data-label="Kafe" class="c">${m.hasAtt ? (m.kafe ? `<span class="kafe-ok" aria-label="Kafe splněno">${I.kafe}</span>` : '<span class="kafe-no">—</span>') : '<span class="muted">—</span>'}</td>
        <td data-label="Docházka" class="r">${m.hasAtt ? (m.lost ? '<span class="losttag">bez nároku</span>' : deltaCell(m.attEff, '')) : '<span class="muted">—</span>'}</td>
        <td data-label="Sankce" class="r">${m.sanctions.length ? `<span class="pen">${m.pctSum ? `−${m.pctSum} %` : ''} (${m.pen ? `−${m.pen}` : '0'})</span>` : '<span class="muted num">0</span>'}</td>
        <td data-label="Úprava" class="r num">${m.adj ? sgn(m.adj) : '<span class="muted">0</span>'}</td>
        <td data-label="Tabáky" class="r num">${m.kafeOnly ? '<span class="onlykafe">jen Kafe</span>' : `<b>${m.hasAtt ? `${m.total}` : '—'}</b>${m.hasAtt ? ` <small class="muted">/ ${m.max}</small>` : ''}`}</td>
        <td data-label="Vydáno" class="c">${m.issued ? `<span class="issued" title="${esc(new Date(m.issued.at).toLocaleString('cs-CZ'))}">${I.check}${esc(issueWhat(m.issued.tabaky, m.issued.kafe))}</span>` : '<span class="muted small">ne</span>'}</td>
        <td data-label="Ø ks/den" class="r num">${m.prod && m.prod.perDay != null ? nf(m.prod.perDay, 1) : '<span class="muted">—</span>'}</td>
        ${showPerf ? perfTd('Norma', m.perf.norm, ownLv(m)?.minNorm) + perfTd('Využití', m.perf.use, ownLv(m)?.minUse) : ''}
        ${showRaise ? `<td data-label="Plat" class="r">${!m.hasAtt || !m.raise.own ? '<span class="muted">—</span>' : m.raise.pct > 0 ? `<span class="raise-ok">+${nf(m.raise.pct, 1)} %</span>` : `<span class="raise-no" title="${esc(m.raise.own.checks.filter(c => !c.ok).map(c => `${c.label} ${pctText(c.val)} z ${nf(c.min, 1)} %`).join(', '))}">0 %</span>`}</td>` : ''}
      </tr>`).join('')}</tbody>
      <tfoot><tr><td><b>Celkem</b></td><td></td><td data-label="Dny" class="r num">${t.workDays}${t.wkDays ? ` +${t.wkDays}` : ''}</td><td data-label="Hodiny" class="r num">${nf(t.hours)}</td><td data-label="Absence" class="r num">${t.missing}</td><td data-label="Kafe" class="c num">${t.kafe}×</td><td></td><td data-label="Sankce" class="r num">${t.pen ? `−${t.pen}` : '0'}</td><td data-label="Úprava" class="r num">${t.adj ? sgn(t.adj) : '0'}</td><td data-label="Tabáky" class="r num"><b>${t.tabaky}</b></td><td data-label="Vydáno" class="c num">${t.issuedTab}${t.issuedKafe ? ` + ${t.issuedKafe}× kafe` : ''}</td><td data-label="Ø ks/den" class="r num">${t.perDay != null ? nf(t.perDay, 1) : '—'}</td>${showPerf ? perfTd('Norma', t.normPct, null) + perfTd('Využití', t.usePct, null) : ''}${showRaise ? '<td></td>' : ''}</tr></tfoot></table></div>
      <p class="hint">Klikni na měsíc a uvidíš docházku po dnech a sankce. Úroveň je podle potvrzeného výdeje, jinak podle zařazení platného na konci měsíce; počítá se s dnešními pravidly pozice.</p>` : emptyState('Žádné záznamy', 'Pro vybrané období nemá docházku, výrobu, sankce ani výdej.')}
    </div>
    <div class="grid-2 pf-bottom">
      <div class="card">
        <h3>Sankce v období</h3>
        ${months.some(m => m.sanctions.length) ? `<ul class="pf-sanctions">${months.slice().reverse().flatMap(m => m.sanctions.map(s => `<li><span class="pen">${s.pct != null ? `−${s.pct} %` : `−${s.points} tab.`}</span><div><b>${esc(s.name)}</b><small>${esc(m.label)}${s.note ? ` · ${esc(s.note)}` : ''}${s.at ? ` · zadáno ${esc(new Date(s.at).toLocaleDateString('cs-CZ'))}` : ''}</small></div></li>`)).join('')}</ul>` : '<p class="small muted">V tomto období žádné sankce.</p>'}
      </div>
      <div class="card">
        <h3>Zařazení a dovednosti</h3>
        <ul class="pf-timeline">${pd.changes.length ? pd.changes.slice().reverse().map(h => `<li><b>${esc(h.text)}</b><small>${h.at ? `od ${esc(new Date(h.at).toLocaleDateString('cs-CZ'))}` : 'od začátku evidence'}${h.prev ? ` · předtím ${esc(h.prev)}` : ''}</small></li>`).join('') : '<li><small>Zatím bez záznamu o zařazení.</small></li>'}</ul>
        ${skills.length ? `<p class="eyebrow mt-s">Zaučen i na dalších pozicích</p><ul class="pf-skills">${skills.map(p => `<li>${iluo(e.skills[p.id])}<span>${esc(p.name)} <small class="muted">${e.skills[p.id]} · ${esc(p.levels[e.skills[p.id] - 1].name)}</small></span></li>`).join('')}</ul>` : ''}
      </div>
    </div>
    <div class="card pf-log">
      <h3>Poslední změny u tohoto člověka</h3>
      ${personLog.length ? `<div class="log-list">${logListHtml(personLog, P.logSeen, false)}</div>` : '<p class="small muted">Zatím žádné zaznamenané změny.</p>'}
    </div>`;
}

function toggleProfileMonth(row) {
  const next = row.nextElementSibling;
  if (next && next.classList.contains('pf-detail')) { next.remove(); row.classList.remove('open'); return; }
  const [from, to] = [row.dataset.pfmonth, row.dataset.pfmonth];
  const m = profileData(ui.profileKey, from, to).months[0];
  if (!m) return;
  const cols = row.children.length;
  row.classList.add('open');
  row.insertAdjacentHTML('afterend', `<tr class="pf-detail"><td colspan="${cols}">
    ${m.cells ? pfCalendar(m.cells) : '<p class="small muted">Bez docházky.</p>'}
    <div class="pf-detail-grid">
      ${m.hasAtt ? `<dl class="kv"><dt>Fond</dt><dd>${nf(m.fund)} h</dd><dt>Odpracováno</dt><dd>${nf(m.hours)} h</dd><dt>Absence / po vyplnění</dt><dd>${m.absence} / ${m.missing}</dd><dt>Omluvená absence</dt><dd>${m.excused}</dd>${Object.keys(m.codes).length ? `<dt>Kódy</dt><dd>${esc(Object.entries(m.codes).map(([c, n]) => `${c}×${n}`).join(', '))}</dd>` : ''}</dl>` : ''}
      <dl class="kv"><dt>Základ za úroveň</dt><dd>${m.base}</dd><dt>Docházka</dt><dd>${m.hasAtt ? sgn(m.attDelta) || '0' : '—'}</dd><dt>Nárok</dt><dd>${m.narok}</dd><dt>Sankce</dt><dd>${m.pen ? `−${m.pen}` : '0'}</dd><dt>Ruční úprava</dt><dd>${m.adj ? sgn(m.adj) : '0'}</dd><dt class="tot">Tabáky</dt><dd class="tot">${m.hasAtt ? m.total : '—'}</dd></dl>
      ${m.prod ? `<dl class="kv"><dt>Vyrobeno</dt><dd>${nf(m.prod.total, 0)} ks</dd><dt>Odprac. dny</dt><dd>${m.prod.days || '—'}</dd><dt>Ø ks/den</dt><dd>${m.prod.perDay != null ? nf(m.prod.perDay, 1) : '—'}</dd><dt>Ø ks/h</dt><dd>${m.prod.perHour != null ? nf(m.prod.perHour, 2) : '—'}</dd></dl>` : ''}
      ${m.raise.own || m.perf.time ? `<dl class="kv"><dt>Docházka</dt><dd>${pctText(m.perf.att)}</dd><dt>Plnění normy</dt><dd>${pctText(m.perf.norm)}</dd><dt>Využití fondu</dt><dd>${pctText(m.perf.use)}</dd>${m.perf.spent != null ? `<dt>Čas nad zakázkami</dt><dd>${nf(m.perf.spent / 60, 1)} h</dd>` : ''}<dt class="tot">Navýšení platu</dt><dd class="tot">${m.raise.pct > 0 ? `+${nf(m.raise.pct, 1)} %` : '0 %'}</dd></dl>` : ''}
    </div>
    ${m.raise.own && !(m.raise.pct > 0 && m.raise.lvl === m.raise.own.lvl) ? `<p class="explain">Úroveň ${m.raise.own.lvl} (+${nf(m.raise.own.pct, 1)} %) nesplnila: ${esc(m.raise.own.checks.filter(c => !c.ok).map(c => `${c.label} ${pctText(c.val)} z ${nf(c.min, 1)} %`).join(', '))}${m.raise.pct > 0 ? `; platí úroveň ${m.raise.lvl}` : ''}.</p>` : ''}
    ${m.sanctions.length ? `<ul class="sanlist">${m.sanctions.map(s => `<li>${esc(s.name)} ${s.pct != null ? `${s.pct} %` : `−${s.points} tab.`}${s.note ? ` – ${esc(s.note)}` : ''}</li>`).join('')}</ul>` : ''}
  </td></tr>`);
}

async function exportProfile() {
  try {
    const e = S.employees[ui.profileKey];
    if (!e) return;
    const [from, to] = profileRange(e.key);
    const X = await xlsx();
    const wb = X.utils.book_new();
    profileSheets(profileData(e.key, from, to)).forEach(sheet => {
      const ws = X.utils.aoa_to_sheet(sheet.rows.map(row => row.map(safeCell)));
      ws['!cols'] = sheet.cols.map(wch => ({ wch }));
      X.utils.book_append_sheet(wb, ws, sheet.name);
    });
    const slug = norm(`${e.last}-${e.first}`).replace(/[^a-z0-9]+/g, '-');
    downloadFile(`profil-${slug}-${from}-${to}.xlsx`, new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch (error) { toast(`Export se nepovedl: ${error.message}`, true); }
}

function bindExtraEvents() {
  $('#btnRulesPdf').onclick = exportRulesPdf;
  $('#prodMsg').addEventListener('click', event => {
    if (!event.target.closest('[data-prodcols]')) return;
    if (ui.lastProd) chooseProdColumns(ui.lastProd.aoa, ui.lastProd.name, ui.lastProd.info);
  });
  $('#matrixDept').addEventListener('change', event => { setPref({ matrixDept: event.target.value }); renderMatrix(); });
  $('#btnMatrixXlsx').onclick = exportMatrix;
  $('#btnMatrixPrint').onclick = () => window.print();
  $('#matrixView').addEventListener('click', event => {
    const cell = event.target.closest('[data-mx]');
    if (cell) { setSkill(cell.dataset.mx, cell.dataset.pos, (+cell.dataset.lvl + 1) % 5); renderMatrix(); return; }
    const person = event.target.closest('[data-profile]');
    if (person) openProfile(person.dataset.profile);
  });

  const view = $('#profileView');
  view.addEventListener('click', event => {
    const target = event.target;
    if (target.closest('[data-pfback]')) { showView(ui.prevView && ui.prevView !== 'profil' ? ui.prevView : 'lide'); return; }
    if (target.closest('[data-pfedit]')) { ui.selPerson = ui.profileKey; ui.personOpen = true; renderPeople(); showView('lide'); return; }
    if (target.closest('[data-pfxlsx]')) { exportProfile(); return; }
    if (target.closest('[data-pfprint]')) { window.print(); return; }
    const range = target.closest('[data-range]');
    if (range) {
      const patch = { profileRange: range.dataset.range };
      if (range.dataset.range === 'custom' && !P.profileFrom) {
        const [from, to] = profileRange(ui.profileKey);
        Object.assign(patch, { profileFrom: from, profileTo: to });
      }
      setPref(patch);
      renderProfile();
      return;
    }
    const row = target.closest('tr[data-pfmonth]');
    if (row) toggleProfileMonth(row);
  });
  view.addEventListener('change', event => {
    if (event.target.id === 'pfFrom' || event.target.id === 'pfTo') {
      const from = $('#pfFrom').value;
      const to = $('#pfTo').value;
      if (MONTH_RE.test(from) && MONTH_RE.test(to)) { setPref({ profileRange: 'custom', profileFrom: from, profileTo: to }); renderProfile(); }
    }
  });
  // Tooltip grafů: myš i klávesnice (Tab na sloupec).
  const showTip = hit => {
    const tip = $('#pfTip');
    const wrap = $('#pfCharts');
    if (!tip || !wrap) return;
    tip.textContent = hit.dataset.tip;
    tip.hidden = false;
    const a = hit.getBoundingClientRect();
    const b = wrap.getBoundingClientRect();
    const left = clamp(a.left - b.left + a.width / 2 - tip.offsetWidth / 2, 0, Math.max(0, b.width - tip.offsetWidth));
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(0, a.top - b.top - tip.offsetHeight - 6)}px`;
    $$('.chart .hit.on', wrap).forEach(x => x.classList.remove('on'));
    hit.classList.add('on');
  };
  const hideTip = () => {
    const tip = $('#pfTip');
    if (tip) tip.hidden = true;
    $$('#pfCharts .hit.on').forEach(x => x.classList.remove('on'));
  };
  view.addEventListener('pointerover', event => { const hit = event.target.closest('.chart .hit'); if (hit) showTip(hit); });
  view.addEventListener('pointerout', event => { if (event.target.closest('.chart .hit')) hideTip(); });
  view.addEventListener('focusin', event => { const hit = event.target.closest('.chart .hit'); if (hit) showTip(hit); });
  view.addEventListener('focusout', event => { if (event.target.closest('.chart .hit')) hideTip(); });
}

/* ==========================================================================
   START
   ========================================================================== */
function bindEvents() {
  $('#nav').addEventListener('click', event => {
    const button = event.target.closest('[data-view]');
    if (button) showView(button.dataset.view);
  });
  document.addEventListener('click', event => {
    const go = event.target.closest('[data-go]');
    if (go) { showView(go.dataset.go); return; }
    const pick = $('#colPick');
    if (pick.open && !pick.contains(event.target)) pick.open = false;
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') $('#colPick').open = false; });
  $('#periodSel').onchange = event => { setPeriod(event.target.value); renderAll(); };
  $('#lockBtn').onclick = () => lockApp();
  $('#lockBtnTop').onclick = () => lockApp();
  $('#logBtn').onclick = () => openLog();

  // Filtry přehledu jsou osobní: pamatují se jen pro tuto kartičku.
  $('#ovSearch').addEventListener('input', renderOverview);
  $('#ovPos').addEventListener('change', event => { setPref({ pos: event.target.value }); renderOverview(); });
  $('#ovOnlyImported').addEventListener('change', event => { setPref({ onlyImported: event.target.checked }); renderOverview(); });
  $('#ovOnlyOpen').addEventListener('change', event => { setPref({ onlyOpen: event.target.checked }); renderOverview(); });
  $('#kafeTh').addEventListener('change', event => { setKafe(event.target.value); save(); renderAll(); });
  $('#kafeTh').addEventListener('keydown', event => { if (event.key === 'Enter') event.target.blur(); });
  $('#kafeReset').onclick = () => { setKafe(''); save(); renderAll(); toast('Kafe se zase počítá z fondu.'); };
  $('#ovHead').addEventListener('click', event => {
    const th = event.target.closest('[data-sort]');
    if (!th) return;
    const k = th.dataset.sort;
    setPref({ sort: { k, dir: P.sort.k === k ? -P.sort.dir : (k === 'name' ? 1 : -1) } });
    renderOverview();
  });
  $('#ovHead').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.target.click(); } });
  $('#ovBody').addEventListener('click', async event => {
    const adj = event.target.closest('[data-adj]');
    if (adj) { bumpAdj(adj.dataset.adj, +adj.dataset.dir); renderOverview(); renderPeople(); return; }
    if (await handleIssueClick(event)) return;
    if (await handleExcludeClick(event)) return;
    const pairOpen = event.target.closest('[data-pairopen]');
    if (pairOpen) { openDetail(pairOpen.dataset.pairopen); return; }
    const pairSet = event.target.closest('[data-pairset]');
    if (pairSet) {
      const select = pairSet.parentElement.querySelector('[data-pairfor]');
      if (!select || !select.value) { toast('Vyber jméno z evidence práce.', true); return; }
      const rec = prodPeriod() && prodPeriod().names[select.value];
      pairProd(rec ? rec.name : select.value, pairSet.dataset.pairset);
      save(); renderAll(); toast('Spárováno s evidencí práce.');
      return;
    }
    const edit = event.target.closest('[data-edit]');
    if (edit) { ui.selPerson = edit.dataset.edit; ui.personOpen = true; renderPeople(); showView('lide'); return; }
    const prof = event.target.closest('[data-profile]');
    if (prof) { openProfile(prof.dataset.profile); return; }
    if (event.target.closest('button, select, input, a, label')) return;
    const tr = event.target.closest('tr[data-key]');
    if (!tr) return;
    if (ui.openDetail === tr.dataset.key) { ui.openDetail = null; $$('#ovBody tr.detail').forEach(row => row.remove()); tr.classList.remove('open'); return; }
    openDetail(tr.dataset.key);
  });
  $('#setSecurity').addEventListener('click', handleSecurityClick);
  $('#btnCopy').onclick = copyTable;
  $('#btnXlsx').onclick = exportXlsx;
  $('#btnPrint').onclick = () => window.print();

  $('#lSearch').addEventListener('input', renderPeople);
  $('#lList').addEventListener('click', event => {
    const button = event.target.closest('[data-key]');
    if (!button) return;
    ui.selPerson = button.dataset.key;
    ui.personOpen = true;
    renderPeople();
    if (window.matchMedia('(max-width: 900px)').matches) window.scrollTo({ top: 0, behavior: 'instant' });
  });
  $('#lDetail').addEventListener('click', async event => {
    if (await handleIssueClick(event)) return;
    if (await handleExcludeClick(event)) return;
    const prof = event.target.closest('[data-profile]');
    if (prof) { openProfile(prof.dataset.profile); return; }
    const skill = event.target.closest('[data-skill]');
    if (skill) { setSkill(skill.dataset.key, skill.dataset.skill, +skill.dataset.lvl); renderPersonDetail(); return; }
    const adj = event.target.closest('[data-adj]');
    if (!adj) return;
    bumpAdj(adj.dataset.adj, +adj.dataset.dir);
    renderPersonDetail(); renderPeople(); renderOverview();
  });
  $('#btnAddPerson').onclick = async () => {
    const value = await promptBox('Přidat člověka', 'Jméno a příjmení', '', 'Přidat', 'Jan Novák');
    if (!value) return;
    const parts = value.trim().split(/\s+/);
    const first = parts.shift() || '';
    const last = parts.join(' ') || first;
    const key = `${norm(last)}|${norm(first)}`;
    if (S.employees[key]) { toast('Takový už v seznamu je.'); ui.selPerson = key; ui.personOpen = true; renderPeople(); return; }
    S.employees[key] = { key, first: first.slice(0, 80), last: last.slice(0, 80), positionId: null, level: null, note: '' };
    ui.selPerson = key; ui.personOpen = true;
    save(); renderPeople(); renderOverview(); renderPeriodBits();
  };
  $('#btnExpRoster').onclick = exportRoster;
  $('#btnImpRoster').onclick = () => $('#rosterFile').click();
  $('#rosterFile').onchange = event => { readRoster(event.target.files[0]); event.target.value = ''; };

  $('#sanSearch').addEventListener('input', renderSanctions);
  $('#sanFilter').addEventListener('change', event => { setPref({ sanFilter: event.target.value }); renderSanctions(); });

  $('#posList').addEventListener('click', event => {
    const button = event.target.closest('[data-selpos]');
    if (!button) return;
    ui.selPos = button.dataset.selpos;
    ui.posOpen = true;
    renderPositions();
  });
  $('#btnAddPos').onclick = async () => {
    const value = await promptBox('Nová pozice', 'Název pozice', '', 'Přidat', 'třeba Frézař');
    if (!value) return;
    const position = mkPos(uid('p'), value.slice(0, 80), []);
    S.positions.push(position);
    ui.selPos = position.id; ui.posOpen = true;
    save(); renderPositions(); renderOverview(); renderPeople();
  };

  $('#btnDelPeriod').onclick = async () => {
    const p = curPeriod();
    if (!p) return;
    if (!(await confirmBox('Smazat období?', `Smaže se docházka za ${periodName(p)} i ruční úpravy a výdeje toho měsíce. Lidé, pozice a sankce zůstanou.`, 'Smazat', true))) return;
    delete S.periods[S.current];
    delete S.adjust[S.current];
    if (S.issued) delete S.issued[S.current];
    setPeriod(Object.keys(S.periods).sort().reverse()[0] || null);
    save(); renderAll(); toast('Období smazáno.');
  };
  const wireDrop = (zone, button, input, fn) => {
    $(`#${button}`).onclick = () => $(`#${input}`).click();
    $(`#${input}`).onchange = event => { fn(event.target.files[0]); event.target.value = ''; };
    const dz = $(`#${zone}`);
    ['dragenter', 'dragover'].forEach(type => dz.addEventListener(type, event => { event.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(type => dz.addEventListener(type, event => { event.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', event => { if (event.dataTransfer.files && event.dataTransfer.files[0]) fn(event.dataTransfer.files[0]); });
  };
  wireDrop('drop', 'btnPick', 'file', readFile);
  wireDrop('pdrop', 'pbtnPick', 'pfile', readProdFile);

  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(type => document.addEventListener(type, () => { lastActivity = Date.now(); }, { passive: true }));
  setInterval(checkIdle, 15000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { flushSave(); flushPrefs(); }
    else checkIdle();
  });
  bindExtraEvents();
  window.addEventListener('beforeunload', event => {
    if (store.dirty || store.saving) { event.preventDefault(); event.returnValue = ''; }
  });
}

window.OdmApp = {
  async start(loaded) {
    const [me, prefs] = await Promise.all([Vault.me().catch(() => null), Vault.loadPrefs().catch(() => null)]);
    ui.me = {
      cardId: me?.card_id || Vault.session.cardId || '', label: me?.card_label || Vault.session.label || '',
      created: Date.parse(me?.card_created || '') || 0,
      device: me?.device_label || '', version: me?.version || '',
    };
    store.rev = loaded.rev || 0;
    store.savedAt = loaded.savedAt || null;
    if (loaded.state) {
      S = sanitizeState(loaded.state);
      store.base = sharedState(S);
    } else {
      // Čistá instalace: ukázkový měsíc, ať je hned vidět, jak aplikace funguje.
      S = demoData();
      const issue = S._demoIssue || [];
      delete S._demoIssue;
      const t = Date.now() - 2 * 864e5;
      issue.forEach(([key, extra]) => {
        const e = S.employees[key];
        if (!e) return;
        const r = evaluate(e, curPeriod());
        const box = S.issued[adjKey()] || (S.issued[adjKey()] = {});
        box[key] = { at: t, tabaky: r.total + extra, kafe: r.kafe, pos: e.positionId, lvl: e.level };
      });
      S = sanitizeState(S);
      save();
    }
    if (prefs) {
      P = cleanPrefs(prefs);
    } else {
      // První otevření této verze s touto kartičkou: převezme se dosavadní společné nastavení pohledu.
      // Jako nové se ukážou změny od vydání kartičky (starší historie nové kartičky nezahltí).
      const seen = ui.me.created ? Math.min(ui.me.created, Date.now()) : Date.now();
      P = cleanPrefs({ period: S.current, hiddenCols: S.settings.hiddenCols, lockMinutes: S.settings.lockMinutes, logSeen: seen });
      setPref({});
    }
    applyPeriodPref();
    bindEvents();
    renderAll();
    showView('prehled');
  },
};
