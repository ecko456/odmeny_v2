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
  t5: { tab: 'week', week: null, caseId: null, filter: 'active', q: '' },
  kt: { tab: 'plan', week: null, range: '12', dept: '' },
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
  t5PdfShort: false,
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
    matrixShift: ['*', 'R', 'S1', 'S2', ''].includes(x.matrixShift) ? x.matrixShift : '*',
    mxTab: ['matrix', 'groups', 'cap'].includes(x.mxTab) ? x.mxTab : 'matrix',
    profileRange: ['month', '3', '6', '12', 'year', 'all', 'custom'].includes(x.profileRange) ? x.profileRange : '12',
    profileFrom: MONTH_RE.test(String(x.profileFrom)) ? x.profileFrom : '',
    profileTo: MONTH_RE.test(String(x.profileTo)) ? x.profileTo : '',
    t5PdfShort: x.t5PdfShort === true,
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
  return `<option value="">${esc(blankLabel || '— bez skupiny —')}</option>${S.positions.map(p => `<option value="${esc(p.id)}"${p.id === sel ? ' selected' : ''}>${esc(p.name || '(bez názvu)')}</option>`).join('')}`;
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
  renderWageAlert();
  renderOverview();
  renderPeople();
  renderSanctions();
  renderAttendance();
  renderProduction();
  renderSettings();
  renderMatrix();
  if (ui.view === 'profil') renderProfile();
  if (ui.view === 'top5') renderTop5(); else renderTop5Badge();
  if (ui.view === 'kontroly') renderKontroly(); else renderKtBadge();
  renderSaveState();
  renderLogBadge();
}

function showView(name) {
  if (name === 'pozice') { name = 'matice'; ui.mxTab = 'groups'; }   // dřívější část Pozice je v Matici dovedností
  if (name === 'matice' && !ui.mxTab) ui.mxTab = P.mxTab || 'matrix';
  if (name !== 'profil' && ui.view !== 'profil') ui.prevView = name;
  else if (name === 'profil' && ui.view !== 'profil') ui.prevView = ui.view;
  ui.view = name;
  if (name === 'profil') renderProfile();
  if (name === 'matice') renderMatrix();
  if (name === 'top5') renderTop5();
  if (name === 'kontroly') renderKontroly();
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
    if (!(await confirmBox('Vymazat ukázku?', 'Smažou se ukázkoví lidé, docházka, výroba a sankce. Skupiny, dovednosti a nastavení zůstanou (bez ukázkových prémií).', 'Vymazat'))) return;
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
  const unassigned = Object.values(S.employees).filter(e => !e.excluded && (!e.positionId || (posOf(e) && !isGroup(posOf(e)) && !e.level))).length;
  const badge = $('#navPeople');
  badge.hidden = !unassigned;
  badge.textContent = String(unassigned);
  badge.title = `${unassigned} bez skupiny`;
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
    { k: 'lvl', t: 'Dovednosti', sort: true, hint: 'Průměr dovedností ve skupině (každá úroveň 25 %) a tabáky za ně',
      cell: r => (r.L.pct != null || r.L.n ? `<span class="lvlcell" title="${esc(r.L.pct != null ? `Průměr dovedností ${nf(r.L.pct, 1)} % z maxima ${+r.pos.maxTab || 0}` : r.L.lv.name)}"><span class="lvl l${r.L.n}">${r.L.n}</span><span class="lvlname">${esc(r.L.pct != null ? `${nf(r.L.pct, 0)} %` : r.L.lv.name)}</span>${r.kafeOnly ? '' : `<b class="num">${r.L.base}</b>`}</span>` : `<span class="muted small">${r.pos ? (r.L.legacy ? 'bez úrovně' : 'bez dovedností') : '—'}</span>`),
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
    { k: 'att', t: 'Docházka', sort: true, cls: 'r', hint: 'Automatická srážka nebo bonus podle pravidel skupiny, nejvýš do stropu',
      cell: r => (r.lost ? `<span class="losttag" title="${esc(attExplain(r))}">bez nároku</span>` : deltaCell(r.attEff, attExplain(r)) + (r.capped ? `<span class="captag" title="${esc(`Zastropováno na strop ${r.max}`)}">max</span>` : '')),
      foot: rows => { const v = SUMF(rows, r => r.attEff); return v ? deltaCell(v, '') : ''; } },
    { k: 'pen', t: 'Sankce', sort: true, cls: 'r', hint: 'Srážky z nároku za vybraný měsíc (10 / 30 / 50 %)',
      cell: r => ((r.pctSum || r.legacy) ? `<span class="pen" title="${esc(`${reasonsOf(r.e.key)} → −${r.pen} ${tabW(r.pen)}`)}">${r.pctSum ? `−${r.pctSum} %` : ''}</span> <span class="muted small num">(−${r.pen})</span>` : '<span class="muted num">0</span>'),
      foot: rows => { const v = SUMF(rows, r => r.pen); return v ? `<span class="pen">−${v}</span>` : ''; } },
    { k: 'adj', t: 'Ruční úprava', cls: 'c', hint: 'Přidat nebo ubrat tabáky nad rámec výpočtu',
      cell: r => (r.kafeOnly ? '<span class="muted">—</span>' : adjCtrl(r)),
      foot: rows => { const v = SUMF(rows, r => r.adj); return v ? `<span class="num">${sgn(v)}</span>` : ''; } },
    { k: 'score', t: 'Tabáky', sort: true, cls: 'score', hint: 'Dovednosti ± docházka (nejvýš do stropu) − sankce ± ruční úprava',
      cell: r => (r.kafeOnly ? `<span class="onlykafe" title="${esc(`Skupina ${r.pos.name} nemá tabáky, hodnotí se jen Kafe`)}">jen Kafe</span>` : meter(r.max ? r.total / r.max : 0, `<b>${nf(r.total, 0)}</b> <small>/ ${nf(r.max, 0)}</small>`)),
      foot: rows => `<b class="num">${nf(SUMF(rows, r => r.total), 0)} ${tabW(SUMF(rows, r => r.total))}</b>` },
    ...(S.positions.some(hasRaise) ? [{ k: 'raise', t: 'Prémie', sort: true, cls: 'r', hint: 'Nejvyšší splněný stupeň prémie skupiny za měsíc a navýšení mzdy',
      cell: r => raiseCell(r),
      foot: rows => { const n = rows.filter(r => r.tier.lvl > 0).length; return n ? `<span class="num" title="Lidí s prémií">${n}×</span>` : ''; } }] : []),
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
    setIssued(r.e.key, { at: Date.now(), tabaky: r.total, kafe: r.kafe, pos: r.e.positionId || undefined, lvl: r.e.level || undefined,
      pct: r.L.pct != null ? r.L.pct : undefined, tier: isGroup(r.pos) ? r.tier.lvl : undefined, raise: isGroup(r.pos) && r.tier.lvl ? r.tier.pct : undefined });
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
    wk: r.att ? r.att.wkDays : -1, kafe: r.kafe ? 1 : 0, lvl: (r.L.pct != null ? r.L.pct : r.L.n * 25) * 1000 + r.L.base, att: r.attEff,
    prod: r.prod ? (avgPerDay(r.prod, r.att) ?? -0.5) : -1, pen: r.pctSum * 1000 + r.pen, score: r.total, adj: r.adj,
    iss: r.issued ? (r.issuedChanged ? 1 : 2) : (r.toIssue ? 0 : -1),
    raise: r.tier.lvl * 1000 + r.tier.pct,
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
  const noSkills = [...new Set(all.filter(r => r.pos && isGroup(r.pos) && !groupSkills(r.pos).length).map(r => r.pos.name))];
  const legacy = legacyPending();
  if (noPos) items.push([`Zařaď ${noPos} ${noPos === 1 ? 'člověka' : 'lidí'} do skupiny`, 'Bez skupiny nemají tabáky za dovednosti.', 'lide']);
  if (noSkills.length) items.push([`Doplň dovednosti ${noSkills.length === 1 ? `ve skupině ${noSkills[0]}` : `v ${noSkills.length} skupinách`}`, 'Skupina bez dovedností nedává tabáky.', 'pozice']);
  if (legacy) items.push([`Zkontroluj převod ${legacy} ${legacy === 1 ? 'člověka' : 'lidí'} z verze 2.3`, 'U člověka je okno s původní pozicí a úrovní; po kontrole ho smaž.', 'lide']);
  const unmatched = prodPeriod() ? prodUnmatched().length : 0;
  if (unmatched) items.push([`Spáruj ${unmatched} ${jmenW(unmatched)} z výroby`, 'Jména z evidence práce, která nesedí na nikoho v hodnocení.', 'vyroba']);
  $('#todo').innerHTML = items.length && !S.demo ? `<div class="todo"><p class="eyebrow">Co zbývá udělat</p><div class="todo-list">${items.map(([title, text, view]) => `<button type="button" class="todo-item" data-go="${view}"><span><b>${esc(title)}</b><small>${esc(text)}</small></span>${I.arrow}</button>`).join('')}</div></div>` : '';
}

function renderOverview() {
  const p = curPeriod();
  const sort = visibleColumns().some(c => c.k === P.sort.k) ? P.sort : { k: 'score', dir: -1 };
  if (sort !== P.sort) P.sort = sort;
  const select = $('#ovPos');
  select.innerHTML = posOptions(P.pos, 'Všechny skupiny');
  select.value = S.positions.some(p => p.id === P.pos) ? P.pos : '';
  $('#ovOnlyImported').checked = P.onlyImported;
  $('#ovOnlyOpen').checked = P.onlyOpen;
  $('#ovTitle').textContent = p ? periodName(p) : 'Zatím bez docházky';
  const meta = p ? periodMeta(p) : null;
  $('#ovLede').innerHTML = p
    ? `Pracovních dnů ${meta.work}, fond ${nf(meta.fund)} h (směna ${nf(S.settings.shift)} h), sobot ${meta.sats}${meta.hols ? `, svátků ve všední den ${meta.hols}` : ''}. Tabáky = dovednosti ± docházka − sankce ± ruční úprava.${cutoffDays() ? ` Od ${cutoffDays()} dní absence bez nároku na tabák i kafe.` : ''}`
    : 'Nahraj docházku v části <b>Docházka</b>. Zařazení do skupin a hodnocení dovedností zůstává uložené napříč měsíci.';

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
  const noLvl = all.filter(r => r.pos && isGroup(r.pos) && !groupSkills(r.pos).length).length;
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
    statTile(`${I.tab}Tabáky celkem`, `${nf(sum, 0)}<em>/ ${nf(SUMF(rows, r => r.max), 0)}</em>`, `${filtered ? `za ${rows.length} vybraných lidí` : `za ${rows.length} lidí, z maxim skupin`}${noPos ? `, ${noPos}× bez skupiny` : ''}${noLvl ? `, ${noLvl}× skupina bez dovedností` : ''}`, 'tab'),
    statTile(`${I.kafe}Kafe`, p ? `${kafeN}<em>/ ${kafeOf}</em>` : '—', p ? `splnili ${nf(kafeThreshold(p))} h` : 'bez docházky', 'kafe'),
    statTile('Bonus za víkendy', p ? `+${SUMF(bon, r => r.attEff)}` : '—', p ? `${bon.length} lidí, po stropu skupiny` : 'bez docházky', 'good'),
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
  if (!r.pos) return '<p class="muted small">Nemá skupinu. Zařaď ho v části <b>Lidé</b>.</p>';
  if (r.L.legacy) {
    if (!r.L.n) return `<p class="muted small">Skupina ${esc(r.pos.name)}, ale bez úrovně.</p>`;
    return `<div class="lvlcell big"><span class="lvl l${r.L.n}">${r.L.n}</span><b>${esc(r.L.lv.name)}</b><span class="muted">· ${esc(r.pos.name)}</span></div><dl class="kv"><dt class="tot">Základ za úroveň</dt><dd class="tot">${r.L.base}</dd></dl>`;
  }
  const skills = groupSkills(r.pos);
  if (!skills.length) return `<p class="muted small">Skupina ${esc(r.pos.name)} nemá dovednosti. Doplň je v Matici dovedností.</p>`;
  return `<dl class="kv">${skills.map(x => { const v = rateOf(r.e, x.id); return `<dt>${esc(x.name)}</dt><dd title="${esc(rateTitle(x, v))}">${iluo(v)} ${v}</dd>`; }).join('')}
    <dt>Průměr (každá úroveň 25 %)</dt><dd>${nf(r.L.pct, 1)} %</dd>
    <dt class="tot">Tabáky za dovednosti</dt><dd class="tot">${r.kafeOnly ? 'jen Kafe' : `${r.L.base} <small class="muted">z ${+r.pos.maxTab || 0}</small>`}</dd></dl>`;
}

/* ==========================================================================
   PRÉMIE (stupně skupiny podle dovedností, docházky, normy a bodů vedoucího)
   ========================================================================== */
function raiseTip(r) {
  const x = r.tier;
  const lines = [x.lvl ? `${x.name}${x.pct ? `: +${nf(x.pct, 1)} % mzdy` : ''}${x.reward ? `, ${x.reward}` : ''}` : 'Bez prémie'];
  if (x.next) lines.push(`Do stupně ${x.next.t.name} chybí: ${x.next.checks.filter(c => !c.ok).map(c => `${c.label} (${c.txt})`).join(', ')}`);
  (x.streaks || []).forEach(s => lines.push(`${s.name}: ${s.have} z ${s.months} měsíců v řadě${s.ok ? ` – ${s.label}` : ''}`));
  return lines.join('\n');
}

function raiseCell(r) {
  if (!r.pos || !hasRaise(r.pos)) return '<span class="muted">—</span>';
  const x = r.tier;
  const tip = esc(raiseTip(r));
  const streak = (x.streaks || []).find(s => s.ok);
  if (!x.lvl) return `<span class="raise-no" title="${tip}">—</span>`;
  return `<span class="raise-cell" title="${tip}"><span class="raise-ok">${esc(x.name)}</span>${x.pct ? `<small class="raise-lvl">+${nf(x.pct, 1)} %</small>` : ''}${streak ? `<small class="tag acc">${esc(streak.label)}</small>` : ''}</span>`;
}

function raiseKv(r) {
  const pf = r.perf;
  const notes = [];
  if (!pf.time) notes.push(prodPeriod() ? 'Evidence práce za tento měsíc nemá sloupec se stráveným časem, plnění normy a využití fondu se nespočítá.' : 'Pro tento měsíc není nahraná evidence práce, plnění normy se nespočítá.');
  else if (pf.norm == null) notes.push('V evidenci práce nejsou řádky se stráveným časem i normou, plnění normy se nespočítá.');
  const perf = `<dl class="kv">${PERF_KEYS.map(([k, label]) => `<dt>${esc(label[0].toUpperCase() + label.slice(1))}</dt><dd>${pf[k] == null ? '<span class="muted">—</span>' : `${nf(pf[k], 1)} %`}</dd>`).join('')}</dl>`;
  return `${tierHtml(r, false)}${perf}${notes.map(n => `<p class="small muted">${esc(n)}</p>`).join('')}`;
}

function sumKv(r) {
  if (r.kafeOnly) {
    return `<p class="small">Skupina <b>${esc(r.pos.name)}</b> nemá tabáky, hodnotí se jen Kafe.</p>
    <dl class="kv"><dt class="tot">Kafe</dt><dd class="tot">${r.kafe ? `<span class="kafe-ok">${I.kafe}</span>` : r.lost ? '<span class="pen">bez nároku</span>' : '<span class="muted">nesplněno</span>'}</dd></dl>
    ${r.issued ? `<div class="note ${r.issuedChanged ? 'w' : 'i'}"><b>Vydáno ${new Date(r.issued.at).toLocaleDateString('cs-CZ')}:</b> ${issueWhat(r.issued.tabaky, r.issued.kafe)}.</div>` : ''}`;
  }
  return `<div class="total-big"><span class="num">${nf(r.total, 0)}</span> <span class="muted">${tabW(r.total)}</span></div>
    ${meter(r.max ? r.total / r.max : 0, `z ${r.max} max.`)}
    <dl class="kv">
      <dt>Dovednosti</dt><dd>${r.L.base}</dd>
      <dt>Docházka</dt><dd>${r.at.delta ? sgn(r.at.delta) : '0'}</dd>
      ${r.lost ? `<dt>Absence ${r.at.missing} ${dnW(r.at.missing)} (hranice ${r.cut})</dt><dd><span class="pen">bez nároku</span></dd>` : ''}
      ${r.capped ? `<dt>Strop skupiny</dt><dd>${r.max}</dd>` : ''}
      <dt class="tot">Nárok</dt><dd class="tot">${r.narok}</dd>
      ${r.pctSum ? `<dt>Sankce −${r.pctSum} %</dt><dd><span class="pen">${r.sanT ? `−${r.sanT}` : '0'}</span></dd>` : ''}
      ${r.legacy ? `<dt>Sankce (starý záznam)</dt><dd><span class="pen">−${r.legacy}</span></dd>` : ''}
      <dt>Ruční úprava</dt><dd>${r.adj ? sgn(r.adj) : '0'}</dd>
      <dt class="tot">Tabáky</dt><dd class="tot">${r.total}</dd>
    </dl>
    ${r.total > r.max ? `<p class="explain">O ${r.total - r.max} nad maximum díky ruční úpravě (povoleno nejvýš +${+S.settings.adjOver || 0}).</p>` : ''}
    ${r.sans.length ? `<ul class="sanlist">${r.sans.map(s => `<li>${esc(sanLabel(s))}</li>`).join('')}</ul>` : ''}
    ${r.pctSum && r.pctSum < 100 && r.narok ? `<p class="explain">${r.pctSum} % z ${r.narok} = ${nf(r.narok * r.pctSum / 100, 1)} → strženo ${r.sanT} (zaokrouhleno, aspoň 1 za každou sankci)</p>` : ''}
    ${r.issued ? `<div class="note ${r.issuedChanged ? 'w' : 'i'}"><b>Vydáno ${new Date(r.issued.at).toLocaleDateString('cs-CZ')}:</b> ${issueWhat(r.issued.tabaky, r.issued.kafe)}.${r.issuedChanged ? ` Hodnocení se od té doby změnilo, teď vychází ${issueWhat(r.total, r.kafe)}.` : ''}</div>` : ''}`;
}

function ovDetailRow(r) {
  const a = r.att;
  const p = curPeriod();
  return `<tr class="detail"><td colspan="${visibleColumns().length}"><div class="detail-grid">
    <div><p class="eyebrow">Docházka</p>${attKv(r)}</div>
    <div><p class="eyebrow">Dovednosti${r.pos ? ` · ${esc(r.pos.name)}` : ''}</p>${lvlKv(r)}</div>
    <div><p class="eyebrow">${r.kafeOnly ? 'Kafe' : 'Tabáky'}</p>${sumKv(r)}
      <div class="row gap">${r.kafeOnly ? '' : adjCtrl(r)}<button class="btn sec small" type="button" data-edit="${esc(r.e.key)}">Upravit zařazení</button><button class="btn sec small" type="button" data-profile="${esc(r.e.key)}">Profil a historie</button>${issueCell(r)}</div>
      <button class="btn ghost small" type="button" data-exclude="${esc(r.e.key)}" title="Přestane se hodnotit, data zůstanou; vrátit jde v části Lidé">Vyřadit ze seznamu</button>
    </div>
    ${(r.pos && hasRaise(r.pos)) || r.perf.time ? `<div><p class="eyebrow">Prémie</p>${raiseKv(r)}</div>` : ''}
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
      ${L.pct != null || L.n ? `<span class="lvl l${L.n}" title="Průměrná úroveň dovedností">${L.n}</span>` : '<span class="lvl l0">?</span>'}
      <span class="nm"><b>${esc(e.last)} ${esc(e.first)}</b><span>${L.pos ? esc(L.pos.name) + (L.pct != null ? ` · ${nf(L.pct, 0)} %` : L.legacy ? (L.n ? ` · ${esc(L.lv.name)}` : ' · <span class="warn-t">bez úrovně</span>') : ' · <span class="warn-t">bez dovedností</span>') : '<span class="crit">bez skupiny</span>'}${shiftOf(e) ? ` · ${esc(shiftName(shiftOf(e)).replace('Směnnost – s', 'S'))}` : ''}${e.shortFri ? ` · pá ${nf(friShift())} h` : ''}${e.legacy ? ' · <span class="tag warn">převést</span>' : ''}</span></span>
      ${e.excluded ? '<span class="tag">vyřazen</span>' : `<span class="num small list-val" title="Tabáky za vybraný měsíc">${nf(ev.total, 0)}</span>`}
    </button>`;
  }).join('') : emptyState('Nikdo tu není', 'Nahraj docházku, nebo přidej člověka ručně.');
  $('#peopleSplit').classList.toggle('show-detail', ui.personOpen);
  renderPersonDetail();
}

/* Hodnocení dovedností u člověka: řádek za dovednost s volbou úrovně 0–4. */
function rateRows(e, skills) {
  return skills.map(x => {
    const v = rateOf(e, x.id);
    const sc = skillScale(x);
    return `<div class="rate-row"><div class="rate-name"><b>${esc(x.name)}</b><small>${v} – ${esc(sc[v].name)}${sc[v].desc ? `: ${esc(sc[v].desc)}` : ''}</small></div>
      <div class="seg rate-seg" role="group" aria-label="${esc(`Úroveň: ${x.name}`)}">${[0, 1, 2, 3, 4].map(n => `<button type="button" class="${n === v ? 'on' : ''}" data-rate="${esc(x.id)}" data-key="${esc(e.key)}" data-lvl="${n}" aria-pressed="${n === v}" title="${esc(rateTitle(x, n))}">${n}</button>`).join('')}</div></div>`;
  }).join('');
}

/* Prémie za vybraný měsíc: splněné a nesplněné podmínky, body vedoucího a série. */
function tierHtml(r, withMarks) {
  const x = r.tier;
  if (!r.pos || !(r.pos.tiers || []).length) return '<p class="small muted">Skupina nemá prémie. Nastavíš je v Matici dovedností → Skupiny a pravidla.</p>';
  const pid = S.current;
  const check = c => `<li class="${c.ok ? 'ok' : 'no'}"><span class="tick" aria-hidden="true">${c.ok ? '✓' : '✗'}</span><span>${esc(c.label)}</span><small>${esc(c.txt)}</small>${withMarks && c.k === 'manual' && pid ? `<button class="linkbtn" type="button" data-mark="${esc(c.id)}" data-key="${esc(r.e.key)}" data-on="${c.ok ? 1 : 0}">${c.ok ? 'označit nesplněno' : 'zase splněno'}</button>` : ''}</li>`;
  return `<div class="tier-result">${x.lvl ? `<p class="tier-got"><span class="raise-ok">${esc(x.name)}</span>${x.pct ? ` · navýšení mzdy <b>+${nf(x.pct, 1)} %</b>` : ''}${x.reward ? ` · ${esc(x.reward)}` : ''}</p>` : '<p class="small muted">Žádný stupeň prémie za tento měsíc.</p>'}
    ${x.list.map(it => `<details class="tier-detail"${it === x.next || (!x.next && it.lvl === x.lvl) ? ' open' : ''}><summary><b>${esc(it.t.name)}</b> ${it.ok ? '<span class="t5-state s-ok">splněno</span>' : '<span class="t5-state">nesplněno</span>'}</summary><ul class="tier-checks">${it.checks.map(check).join('') || '<li class="ok"><span>bez podmínek</span></li>'}</ul></details>`).join('')}
    ${(x.streaks || []).map(s => `<p class="small ${s.ok ? 'tier-streak-ok' : 'muted'}">${esc(s.name)}: ${s.have} z ${s.months} měsíců v řadě${s.ok ? ` · <b>${esc(s.label)}</b>` : ` (pro ${esc(s.label)})`}</p>`).join('')}
    ${pid ? '' : '<p class="small muted">Prémie se vyhodnocuje za vybrané období s docházkou.</p>'}</div>`;
}

/* Okno s původním zařazením z verze 2.3 (zůstane, dokud ho vedoucí nesmaže). */
/* Tabáky za dovednosti teď proti tabákům za původní úroveň (stejné, když úrovně šly po 25 %). */
function legacyCompare(e) {
  const l = e.legacy, L = levelOf(e);
  if (!l || l.onlyKafe || !L.pos || L.pos.onlyKafe || !l.level) return '';
  if (L.base === l.tabaky) return `<p class="small">Tabáky za dovednosti vycházejí stejně jako dřív: <b>${L.base}</b>.</p>`;
  return `<div class="note w">Teď vychází <b>${L.base}</b> ${tabW(L.base)} za dovednosti, dřív <b>${l.tabaky}</b>. Buď se od převodu změnilo hodnocení, nebo úrovně pozice nešly po 25 % maxima. Zkontroluj maximum skupiny a hodnocení.</div>`;
}

function legacyCard(e) {
  const l = e.legacy;
  if (!l) return '';
  return `<div class="card legacy-card">
    <div class="card-head"><div><p class="eyebrow">Původní zařazení z verze 2.3</p><h3>${l.pos ? esc(l.pos) : 'Bez pozice'}${l.level ? ` · úroveň ${l.level}${l.levelName ? ` (${esc(l.levelName)})` : ''}` : ''}</h3></div></div>
    <dl class="kv">
      ${l.dept ? `<dt>Oddělení</dt><dd>${esc(l.dept)}</dd>` : ''}
      ${l.levelDesc ? `<dt>Co úroveň obnášela</dt><dd>${esc(l.levelDesc)}</dd>` : ''}
      <dt>Tabáky za úroveň</dt><dd>${l.onlyKafe ? 'jen Kafe' : l.tabaky}</dd>
      ${l.raise ? `<dt>Navýšení platu úrovně</dt><dd>+${nf(l.raise, 1)} %</dd>` : ''}
      ${l.skills.length ? `<dt>Zaučení na dalších pozicích</dt><dd>${l.skills.map(x => esc(`${x.pos} ${x.level}${x.levelName ? ` (${x.levelName})` : ''}`)).join(', ')}</dd>` : ''}
    </dl>
    ${legacyCompare(e)}
    <p class="small muted">Při převodu se úroveň přenesla do dovednosti stejného jména ve skupině. Až člověka v nové verzi zařadíš a ohodnotíš jeho dovednosti, okno smaž.${l.at ? ` Převedeno ${esc(new Date(l.at).toLocaleDateString('cs-CZ'))}.` : ''}</p>
    <div class="row end"><button class="btn sec small" type="button" data-legacydone="${esc(e.key)}">Převedeno do nové verze, smazat</button></div>
  </div>`;
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
  const perf = perfOf(ev.att, pr);
  const r = { e, ...ev, prod: pr, perf, tier: isGroup(pos) ? tierOf(e, ev, perf, S.current, true) : legacyTier(raiseOf(ev.L, perf)) };
  const skills = groupSkills(pos);
  const others = S.positions.filter(g => g !== pos && isGroup(g) && groupSkills(g).length);
  const ratedOthers = others.reduce((x, g) => x + groupSkills(g).filter(k => rateOf(e, k.id) > 0).length, 0);
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
        <label class="field"><span>Skupina</span><select id="pPos">${posOptions(e.positionId, '— bez skupiny —')}</select></label>
        <label class="field"><span>Směna</span><select id="pShift"><option value="">— bez směny —</option>${SHIFTS.map(([k, label]) => `<option value="${k}"${shiftOf(e) === k ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
        <label class="field"><span>Poznámka</span><input type="text" id="pNote" value="${esc(e.note || '')}" placeholder="volitelné" maxlength="500"></label>
        <label class="field"><span>ID v evidenci práce</span><input type="text" id="pWid" value="${esc(e.wid || '')}" placeholder="volitelné" maxlength="40" autocomplete="off"></label>
      </div>
      <label class="switch"><input type="checkbox" id="pFri"${e.shortFri ? ' checked' : ''}><span>Zkrácený pátek: ${nf(friShift())} h se počítá jako celá směna</span></label>
    </div>
    ${legacyCard(e)}
    <div class="card rate-card">
      <div class="card-head"><div><h3>Dovednosti${pos ? ` · ${esc(pos.name)}` : ''}</h3>${pos && skills.length ? `<p class="small muted">Průměr <b>${nf(r.L.pct, 1)} %</b>${pos.onlyKafe ? ' (skupina jen s Kafe)' : ` → <b>${r.L.base}</b> z ${+pos.maxTab || 0} tabáků za dovednosti`}</p>` : ''}</div>
        ${pos ? `<button class="btn ghost small" type="button" data-gogroup="${esc(pos.id)}">Upravit skupinu</button>` : ''}</div>
      ${!pos ? '<p class="muted small">Nejdřív vyber skupinu.</p>' : skills.length ? `<div class="rate-list">${rateRows(e, skills)}</div>` : '<p class="small muted">Skupina zatím nemá dovednosti. Přidej je v Matici dovedností → Skupiny a pravidla.</p>'}
    </div>
    ${others.length ? `<details class="card rate-others"${ratedOthers ? '' : ''}><summary><b>Zaučení v dalších skupinách</b> <span class="muted small">${ratedOthers} ${ratedOthers === 1 ? 'hodnocená dovednost' : ratedOthers >= 2 && ratedOthers <= 4 ? 'hodnocené dovednosti' : 'hodnocených dovedností'} · pro matici a kapacitu směn, tabáky neovlivní</span></summary>
      ${others.map(g => `<div class="rate-group"><p class="eyebrow">${esc(g.name || '(bez názvu)')}</p>${rateRows(e, groupSkills(g))}</div>`).join('')}</details>` : ''}
    <div class="card">
      <h3>Tabáky · ${esc(periodName2(p))}</h3>
      ${sumKv(r)}
      <div class="row gap">${adjCtrl(r)}<span class="small muted">tabáky navíc / méně</span><span class="spacer"></span>${p ? issueCell({ ...r, p }) : ''}</div>
      <hr class="sep"><p class="eyebrow">Docházka</p>${attKv(r)}
      ${a && a.found ? `<hr class="sep">${calStrip(a)}` : ''}
    </div>
    ${pos && (pos.tiers || []).length ? `<div class="card"><h3>Prémie · ${esc(periodName2(p))}</h3>${tierHtml(r, true)}</div>` : ''}
    ${pr ? `<div class="card"><h3>Výroba · ${esc(periodName2(p))}</h3>${prodKv({ prod: pr, att: a, e })}<p class="explain">Údaj z evidence práce. Do tabáků se nezapočítává.</p></div>`
      : (prodPeriod() ? '<div class="card"><h3>Výroba</h3><p class="small muted">Pro tenhle měsíc nemá žádný záznam v evidenci práce. Pokud je tam pod jiným tvarem jména, spáruj ho v části <b>Výroba</b>.</p></div>' : '')}
    ${ktPersonCard(e.key)}
  </div>`;
  setWidths(box);
  $('#pBack').onclick = () => { ui.personOpen = false; renderPeople(); };
  $('#pPos').onchange = event => {
    e.positionId = event.target.value || null;
    const g = posOf(e);
    if (g && !isGroup(g) && !e.level) e.level = 1;
    save(); renderPeople(); renderOverview(); renderPeriodBits(); renderMatrix();
  };
  $('#pShift').onchange = event => {
    if (SHIFT_KEYS.includes(event.target.value)) e.shift = event.target.value; else delete e.shift;
    save(); renderPeople(); renderMatrix();
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
}

/* ==========================================================================
   SANKCE
   ========================================================================== */
function sanPreview() {
  const d = ui.sanDraft;
  const e = d.key ? S.employees[d.key] : null;
  if (!e) return '';
  if (d.wage) return `<div class="note w">Srážka ze mzdy: tabáky ani Kafe se nekrátí. Od ${esc(dayText(wageFrom(d.period)))} se objeví upozornění, že je potřeba srážku zpracovat ve mzdách.</div>`;
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
    <div class="field san-range"><span><span id="sanPctLabel">${d.wage ? 'Srážka ze mzdy' : 'Srážka z nároku'}</span><b id="sanPctOut">${+d.pct} %</b></span>
      <input type="range" id="sanPct" min="${SAN_PCTS[0]}" max="${SAN_PCTS[SAN_PCTS.length - 1]}" step="5" value="${+d.pct}" list="sanTicks" aria-label="Srážka v procentech">
      <datalist id="sanTicks">${SAN_PCTS.map(v => `<option value="${v}"></option>`).join('')}</datalist>
      <div class="range-scale" aria-hidden="true">${SAN_PCTS.map(v => `<i>${v % 10 ? '' : v}</i>`).join('')}</div></div>
    <label class="check wage-check"><input type="checkbox" id="sanWage"${d.wage ? ' checked' : ''}><span><b>Srážka ze mzdy</b><small>Benefity (tabáky a Kafe) se nekrátí. Týden před koncem měsíce vyskočí upozornění, že je potřeba srážku zpracovat ve mzdách.</small></span></label>
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
  /* srážka ze mzdy: stav zpracování ve mzdách přímo pod částkou */
  const wageCell = s => {
    if (!s.wage) return '';
    if (s.done) return `<div class="wage-cell"><span class="ok-mark" title="${esc(s.done.by ? `Zpracoval(a) ${s.done.by}` : '')}">${I.check}zpracováno ${esc(dayText(todayIso(s.done.at), false))}</span> <button class="linkbtn" type="button" data-wageundo="${esc(s.id)}">zrušit</button></div>`;
    const from = wageFrom(s.period), due = todayIso() >= from;
    return `<div class="wage-cell"><button class="btn ${due ? '' : 'sec '}small" type="button" data-wagedone="${esc(s.id)}">Srážka zpracována</button>${due ? '' : `<small class="muted d-block">upozornění od ${esc(dayText(from, false))}</small>`}</div>`;
  };
  $('#sanList').innerHTML = list.length ? `<div class="table-card"><table class="stack"><thead><tr><th>Měsíc</th><th>Zaměstnanec</th><th>Důvod</th><th class="r">Srážka</th><th>Poznámka</th><th></th></tr></thead><tbody>${list.map(s => `<tr${s.wage && !s.done ? ' class="wage-row"' : ''}>
      <td data-label="Měsíc" class="small nowrap">${esc(monthLabel(s.period))}<small class="muted d-block" title="Zadáno">zadáno ${esc(dayText(todayIso(s.at), false))}</small></td>
      <td data-label="Zaměstnanec" class="name"><b>${esc(nameOf(s.key))}</b>${S.employees[s.key] ? '' : ' <span class="tag">není v evidenci</span>'}</td>
      <td data-label="Důvod" class="wrap">${esc(s.pct != null ? s.name : (s.reason || 'Sankce'))}</td>
      <td data-label="Srážka" class="r"><span class="pen nowrap">${s.pct != null ? `−${s.pct} %` : `−${+s.points || 0} tab.`}</span>${s.wage ? ' <span class="tag warn nowrap">ze mzdy</span>' : ''}${wageCell(s)}</td>
      <td data-label="Poznámka" class="wrap small">${esc(s.pct != null ? (s.note || '') : 'starý záznam, pevná srážka')}</td>
      <td class="c actions"><button class="icon-btn" type="button" data-del="${esc(s.id)}" aria-label="Smazat sankci">${I.x}</button></td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="6"><b>${list.length} ${list.length === 1 ? 'sankce' : list.length < 5 ? 'sankce' : 'sankcí'}</b></td></tr></tfoot></table></div>`
    : `<div class="card">${emptyState(S.sanctions.length ? 'Filtru nic neodpovídá' : 'Zatím žádné sankce', S.sanctions.length ? 'Zkus jiný měsíc nebo hledání.' : 'Sankci přidáš formulářem vlevo.')}</div>`;

  const preview = () => { const el = $('#sanPrev'); if (el) el.innerHTML = sanPreview(); };
  if (people.length) {
    $('#sanWho').onchange = event => { d.key = event.target.value; preview(); };
    $('#sanMonth').onchange = event => { d.period = event.target.value; preview(); };
    $('#sanWhy').onchange = event => { const was = d.reason === '__other'; d.reason = event.target.value; if (was !== (d.reason === '__other')) renderSanctions(); };
    if ($('#sanOther')) $('#sanOther').oninput = event => { d.other = event.target.value; };
    $('#sanPct').oninput = event => { d.pct = +event.target.value; $('#sanPctOut').textContent = `${d.pct} %`; preview(); };
    $('#sanWage').onchange = event => { d.wage = event.target.checked; $('#sanPctLabel').textContent = d.wage ? 'Srážka ze mzdy' : 'Srážka z nároku'; preview(); };
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
  $$('#sanList [data-wagedone]').forEach(button => { button.onclick = () => markWage(button.dataset.wagedone, true); });
  $$('#sanList [data-wageundo]').forEach(button => {
    button.onclick = async () => {
      const s = S.sanctions.find(x => x.id === button.dataset.wageundo);
      if (!s || !(await confirmBox('Zrušit zpracování?', `${nameOf(s.key)}: ${sanLabel(s)}. Srážka se znovu objeví v upozornění.`, 'Zrušit zpracování'))) return;
      markWage(s.id, false);
    };
  });
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
  if (!SAN_PCTS.includes(pctValue)) { toast('Zvol srážku 5–50 % (po 5 %).', true); return; }
  S.sanctions.push({ id: uid('x'), key: d.key, period: d.period, name, pct: pctValue, ...(d.wage ? { wage: true } : {}), note: String(d.note || '').trim().slice(0, 300), at: Date.now() });
  const wage = d.wage;
  d.note = ''; d.other = ''; d.wage = false;
  save(); renderAll();
  toast(`${nameOf(d.key)}: ${name} −${pctValue} %${wage ? ' ze mzdy' : ''} za ${monthLabel(d.period)}.`);
}

/* ---------- srážky ze mzdy: upozornění a „Srážka zpracována“ ---------- */
function markWage(id, done) {
  if (!setWageDone(id, done, effMeta())) return;
  save(); renderAll();
  const left = wagePending().length;
  toast(done ? (left ? `Srážka zpracována. Zbývá ${left}.` : 'Srážka zpracována. Všechny srážky ze mzdy jsou hotové.') : 'Zpracování zrušeno, srážka je zase v upozornění.');
}
function wageListHtml() {
  const list = wagePending();
  if (!list.length) return `<div class="note i">Všechny srážky ze mzdy jsou zpracované.</div>`;
  return `<p class="small muted">Srážky ze mzdy, které je potřeba zpracovat ve mzdách. Po zpracování klikni na „Srážka zpracována“; když budou hotové všechny, upozornění zmizí.</p>
    <div class="wage-list">${list.map(s => `<div class="wage-item" data-wageitem="${esc(s.id)}">
      <div><b>${esc(nameOf(s.key))}</b><small>${esc(monthLabel(s.period))} · ${esc(s.name)} · <span class="pen">−${s.pct} % ze mzdy</span>${s.note ? ` · ${esc(s.note)}` : ''}</small></div>
      <button class="btn small" type="button" data-wageok="${esc(s.id)}">Srážka zpracována</button></div>`).join('')}</div>`;
}
async function openWageList() {
  await dialog({
    title: 'Srážky ze mzdy ke zpracování', html: `<div id="wageDlg">${wageListHtml()}</div>`, ok: '', cancel: 'Zavřít', wide: true,
    onOpen: dlg => {
      $('#wageDlg', dlg).addEventListener('click', event => {
        const b = event.target.closest('[data-wageok]');
        if (!b) return;
        markWage(b.dataset.wageok, true);
        $('#wageDlg', dlg).innerHTML = wageListHtml();
        const next = $('[data-wageok]', dlg);
        if (next) next.focus();
      });
    },
  });
}
function renderWageAlert() {
  const box = $('#wageAlert');
  if (!box) return;
  const list = wagePending();
  if (!list.length) { box.innerHTML = ''; return; }
  const people = [...new Set(list.map(s => s.key))].map(nameOf);
  const last = list.reduce((x, s) => (s.period > x ? s.period : x), list[0].period);
  const end = isoOf(Date.UTC(+last.slice(0, 4), +last.slice(5, 7), 0));
  box.innerHTML = `<div class="banner wage-alert" role="alert"><div><b>Zpracuj srážky ze mzdy</b> (${list.length}): ${esc(people.slice(0, 4).join(', '))}${people.length > 4 ? ` a další (${people.length - 4})` : ''}. ${todayIso() <= end ? `Měsíc končí ${esc(dayText(end))}.` : 'Termín už uplynul.'}</div>
    <div class="banner-actions"><button class="btn small" type="button" id="wageOpen">Zobrazit seznam</button></div></div>`;
  $('#wageOpen').onclick = openWageList;
}

/* ==========================================================================
   SKUPINY A PRAVIDLA (matice dovedností, verze 2.4)
   Skupina má dovednosti hodnocené 0–4, maximum tabáků za dovednosti, pravidla docházky
   a stupně prémie. Editor je v záložce „Skupiny a pravidla“ modulu Matice dovedností.
   ========================================================================== */
function ruleCard(p, kind) {
  const pen = kind === 'penalty';
  p[kind] = (p[kind] || []).slice().sort((a, b) => (+a.at || 0) - (+b.at || 0));
  const rules = p[kind];
  return `<div class="card" data-rules="${kind}">
    <h3>${pen ? 'Srážka za absenci' : 'Bonus za víkendy'}</h3>
    <p class="small muted">${pen ? 'Absence = celý pracovní den bez docházky. Počítá se to, co zbyde po vyplnění víkendovými směnami: kdo absenci nadělá o víkendu, srážku nemá, ale nedostane ani bonus za víkend.' : 'Jen když nic nechybí. Počítají se víkendové směny, které nebylo potřeba na vyplnění absence.'}</p>
    <div class="rules">${rules.length ? rules.map((r, i) => `<div class="rulerow" data-ri="${i}">
        <span class="rule-part"><span>${pen ? 'Dny absence' : 'Víkendové směny'} ≥</span><input type="number" data-rat value="${+r.at || 0}" min="1" max="31" step="1" aria-label="${pen ? 'Počet chybějících dnů' : 'Počet víkendových směn'}"></span>
        <span class="rule-part"><span>→ ${pen ? '−' : '+'}</span><input type="number" data-rt value="${+r.t || 0}" min="0" max="100" step="1" aria-label="Počet tabáků"><span>tab.</span></span>
        <button class="icon-btn" type="button" data-rdel aria-label="Smazat řádek">${I.x}</button>
      </div>`).join('') : `<p class="small muted">Žádný řádek, ${pen ? 'za chybějící dny se nestrhává nic.' : 'bonus se nedává.'}</p>`}</div>
    <button class="btn sec small" type="button" data-radd>Přidat řádek</button>
  </div>`;
}

/* Předvyplněné stupně prémie podle zadání (dají se upravit). */
const TIER_TEMPLATES = [
  { name: 'Prémie', minSkill: 3, raise: 20, reward: '', maxAbs: 3, minWknd: 2, minAtt: null, minNorm: 80, minUse: null, manual: ['Dodržování řádné pracovní morálky'], streak: null },
  { name: 'Extra bonus', minSkill: 4, raise: 30, reward: '', maxAbs: 1, minWknd: 3, minAtt: null, minNorm: 90, minUse: null, manual: ['Dodržování řádné pracovní morálky'], streak: { months: 4, label: 'možnost získat 2. platovou třídu' } },
];
function newTier(p) {
  const tpl = TIER_TEMPLATES[Math.min((p.tiers || []).length, TIER_TEMPLATES.length - 1)];
  return { ...tpl, id: uid('t'), name: (p.tiers || []).length < TIER_TEMPLATES.length ? tpl.name : `Stupeň ${(p.tiers || []).length + 1}`,
    manual: tpl.manual.map(text => ({ id: uid('m'), text })), streak: tpl.streak ? { ...tpl.streak } : null };
}

function peopleCount(n) {
  return `${n} ${lidiN(n)}`;
}

function groupSummary(x, count) {
  const sk = groupSkills(x).length;
  return `${peopleCount(count || 0)} · ${sk} ${sk === 1 ? 'dovednost' : sk >= 2 && sk <= 4 ? 'dovednosti' : 'dovedností'}${x.onlyKafe ? ' · jen Kafe' : ` · max ${+x.maxTab || 0} tab.`}${(x.tiers || []).length ? ` · prémie ${x.tiers.map(t => esc(t.name)).join(', ')}` : ''}`;
}

function skillRowHtml(x, i, n) {
  const sc = skillScale(x);
  return `<div class="sk-row" data-skrow="${esc(x.id)}">
    <div class="sk-main"><b>${esc(x.name)}</b>${x.desc ? `<p class="small muted">${esc(x.desc)}</p>` : ''}
      <p class="tiny muted">${x.scale ? 'vlastní hodnoticí schéma' : 'standardní hodnoticí schéma'}: ${sc.map((l, j) => `${j} ${esc(l.name)}`).join(' · ')}</p></div>
    <div class="sk-tools">
      <button class="icon-btn" type="button" data-skup aria-label="Posunout nahoru"${i ? '' : ' disabled'}>${I.back}</button>
      <button class="icon-btn sk-down" type="button" data-skdown aria-label="Posunout dolů"${i < n - 1 ? '' : ' disabled'}>${I.back}</button>
      <button class="btn sec small" type="button" data-skedit>Upravit</button>
      <button class="icon-btn" type="button" data-skdel aria-label="Smazat dovednost">${I.x}</button>
    </div>
  </div>`;
}

function tierCardHtml(p, t, i) {
  const opt = (v, cur) => (v === cur ? ' selected' : '');
  const num = (f, label, hi, step = 1, unit = '') => `<label class="field"><span>${label}</span><span class="pctbox"><input type="number" data-tf="${f}" value="${t[f] ?? ''}" min="0" max="${hi}" step="${step}" placeholder="nehlídá se">${unit ? `<i>${unit}</i>` : ''}</span></label>`;
  return `<div class="tier-card" data-tier="${esc(t.id)}">
    <div class="tier-head"><span class="tier-n">${i + 1}</span>
      <label class="field tier-name"><span>Název stupně</span><input type="text" data-tf="name" value="${esc(t.name)}" maxlength="60"></label>
      <div class="tier-tools">
        <button class="icon-btn" type="button" data-tierup aria-label="Posunout výš"${i ? '' : ' disabled'}>${I.back}</button>
        <button class="icon-btn sk-down" type="button" data-tierdown aria-label="Posunout níž"${i < p.tiers.length - 1 ? '' : ' disabled'}>${I.back}</button>
        <button class="icon-btn" type="button" data-tierdel aria-label="Smazat stupeň">${I.x}</button>
      </div></div>
    <p class="eyebrow">Podmínky za měsíc</p>
    <div class="form-grid tier-grid">
      <label class="field"><span>Všechny dovednosti skupiny aspoň na úrovni</span><select data-tf="minSkill">${[0, 1, 2, 3, 4].map(l => `<option value="${l}"${opt(l, +t.minSkill || 0)}>${l ? `${l} – ${esc(STD_SCALE[l].name)}` : 'nehlídá se'}</option>`).join('')}</select></label>
      ${num('maxAbs', 'Absence v pracovní dny nejvýš (dní)', 31)}
      ${num('minWknd', 'Víkendové směny aspoň', 31)}
      ${num('minNorm', 'Plnění normy aspoň', 300, 0.5, '%')}
      ${num('minAtt', 'Docházka aspoň', 100, 0.5, '%')}
      ${num('minUse', 'Využití fondu aspoň', 100, 0.5, '%')}
    </div>
    <div class="tier-manual"><p class="small"><b>Body, které posuzuje vedoucí</b> <span class="muted">(platí jako splněné, dokud je u člověka a měsíce neoznačíš jako nesplněné)</span></p>
      ${(t.manual || []).map(m => `<div class="tier-point" data-tpoint="${esc(m.id)}"><input type="text" data-tptext value="${esc(m.text)}" maxlength="200" aria-label="Bod vedoucího"><button class="icon-btn" type="button" data-tpdel aria-label="Smazat bod">${I.x}</button></div>`).join('')}
      <button class="btn sec small" type="button" data-tpadd>Přidat bod</button></div>
    <p class="eyebrow">Odměna</p>
    <div class="form-grid tier-grid">
      ${num('raise', 'Navýšení mzdy', 100, 0.5, '%')}
      <label class="field"><span>Jiná odměna (nepovinné)</span><input type="text" data-tf="reward" value="${esc(t.reward || '')}" maxlength="200" placeholder="např. jednorázový bonus"></label>
    </div>
    <label class="check tier-streak"><input type="checkbox" data-tstreak${t.streak ? ' checked' : ''}><span><b>Nárok po několika měsících v řadě</b><small>Kdo tento stupeň (nebo vyšší) splní tolik měsíců za sebou, uvidí u sebe nárok.</small></span></label>
    ${t.streak ? `<div class="form-grid tier-grid"><label class="field"><span>Měsíců v řadě</span><input type="number" data-tsmonths value="${t.streak.months}" min="2" max="24" step="1"></label>
      <label class="field"><span>Na co vzniká nárok</span><input type="text" data-tslabel value="${esc(t.streak.label)}" maxlength="80"></label></div>` : ''}
  </div>`;
}

function renderPositions() {
  const counts = {};
  Object.values(S.employees).forEach(e => { if (e.positionId) counts[e.positionId] = (counts[e.positionId] || 0) + 1; });
  if (!ui.selPos || !S.positions.some(x => x.id === ui.selPos)) ui.selPos = S.positions[0] ? S.positions[0].id : null;
  const p = S.positions.find(x => x.id === ui.selPos);
  $('#posList').innerHTML = S.positions.length ? S.positions.map(x => `<button class="list-item wrap" type="button" data-selpos="${esc(x.id)}" aria-current="${x.id === ui.selPos}">
      <span class="nm"><b>${esc(x.name || '(bez názvu)')}</b><span>${groupSummary(x, counts[x.id])}</span></span>
    </button>`).join('') : emptyState('Žádné skupiny', 'Přidej první skupinu tlačítkem Nová skupina.');
  $('#posSplit').classList.toggle('show-detail', ui.posOpen);
  const editor = $('#posEditor');
  if (!p) { editor.innerHTML = ''; return; }
  const skills = groupSkills(p);
  const mt = +p.maxTab || 0;
  editor.innerHTML = `<button class="btn ghost small back-btn" type="button" id="posBack">${I.back}Seznam skupin</button>
    <div class="stack">
    <div class="card">
      <div class="form-grid pos-head">
        <label class="field"><span>Název skupiny</span><input type="text" id="posName" value="${esc(p.name)}" maxlength="80"></label>
        <label class="field"><span>Oddělení</span><input type="text" id="posDept" value="${esc(p.dept || '')}" maxlength="60" placeholder="${esc(p.name || 'stejné jako skupina')}" list="deptList"><datalist id="deptList">${[...new Set(S.positions.map(x => (x.dept || '').trim()).filter(Boolean))].map(d => `<option value="${esc(d)}"></option>`).join('')}</datalist></label>
        <label class="field"><span>Max. tabáků za dovednosti</span><input type="number" id="posMaxTab" value="${mt}" min="0" max="500" step="1"${p.onlyKafe ? ' disabled' : ''}></label>
        <label class="field"><span>Strop celkem</span><input type="number" id="posMax" value="${p.max != null && p.max !== '' ? p.max : ''}" placeholder="bez stropu" min="0" max="500" step="1"${p.onlyKafe ? ' disabled' : ''}></label>
      </div>
      <label class="check onlykafe-check"><input type="checkbox" id="posOnlyKafe"${p.onlyKafe ? ' checked' : ''}><span><b>Jen Kafe, bez tabáků</b><small>Lidé ve skupině dostávají jen Kafe (a případně prémii). Tabáky, pravidla docházky a ruční úpravy se nepočítají.</small></span></label>
      ${p.onlyKafe ? '' : `<div class="tab-steps" aria-label="Tabáky podle úrovně dovedností">${[0, 1, 2, 3, 4].map(l => `<div><span>${l * 25} %</span><b>${Math.round(mt * l / 4 + 1e-9)}</b><small>${l === 4 ? 'vše na 4' : `průměr ${l}`}</small></div>`).join('')}</div>
      <p class="small muted">Každá úroveň dovednosti je 25 %. Procento skupiny je průměr všech jejích dovedností (dvě dovednosti, jedna na 4 a druhá na 0 = 50 %); tabáky = maximum × procento, zaokrouhleno. ${p.max != null && p.max !== '' ? `Strop ${p.max}: dovednosti a bonus za víkendy dohromady víc nedají.` : 'Bez stropu: bonus za víkendy se přičte navíc k dovednostem.'}</p>`}
      <p class="small muted">Ve skupině: ${peopleCount(counts[p.id] || 0)}. Oddělení seskupuje skupiny v kontrolách; když ho nevyplníš, skupina je oddělením sama pro sebe.</p>
      <div class="row end"><button class="btn danger small" type="button" id="posDel">Smazat skupinu</button></div>
    </div>
    <div class="card" id="skillCard">
      <div class="card-head"><div><h3>Dovednosti</h3><p class="small muted">Každá dovednost se u člověka hodnotí 0–4 podle hodnoticího schématu. Pořadí platí i v matici.</p></div>
        <button class="btn small" type="button" data-skadd>Přidat dovednost</button></div>
      ${skills.length ? `<div class="sk-list">${skills.map((x, i) => skillRowHtml(x, i, skills.length)).join('')}</div>` : '<p class="small muted">Skupina zatím nemá žádnou dovednost, takže nikdo v ní nemá tabáky za dovednosti. Přidej první.</p>'}
    </div>
    ${p.onlyKafe ? `<div class="note i">Kafe dostane, kdo odpracuje aspoň měsíční fond hodin (nebo práh nastavený u období v přehledu).${cutoffDays() ? ` Od ${cutoffDays()} dní absence po vyplnění víkendem nárok zaniká (Nastavení).` : ''}</div>` : `<div class="rule-grid">${ruleCard(p, 'penalty')}${ruleCard(p, 'bonus')}</div>
    <div class="note i">Platí vždy nejvyšší splněný řádek. Absence je celý pracovní den bez docházky; kratší směna absence není (projeví se jen v hodinách u Kafe). Každá odpracovaná víkendová nebo sváteční směna vyplní jeden den absence a víkend použitý na vyplnění se do bonusu nepočítá.${cutoffDays() ? ` Od ${cutoffDays()} dní absence neplatí nic, bez nároku na tabák i kafe (Nastavení).` : ' Hranici, od které člověk ztrácí nárok úplně, nastavíš v Nastavení.'}
      <div class="mt-s"><button class="btn sec small" type="button" id="posCopyRules">Použít srážky a bonusy u všech skupin</button></div></div>`}
    <div class="card" id="tierCard">
      <div class="card-head"><div><h3>Prémie</h3><p class="small muted">Stupně od nejnižšího po nejvyšší. Za měsíc platí nejvyšší stupeň, jehož podmínky člověk splnil. Prázdná podmínka se nehlídá.</p></div>
        <button class="btn small" type="button" data-tieradd>Přidat stupeň</button></div>
      ${(p.tiers || []).length ? p.tiers.map((t, i) => tierCardHtml(p, t, i)).join('') : '<p class="small muted">Zatím bez prémie. První stupeň se předvyplní podle zadání (všechny dovednosti aspoň 3, absence nejvýš 3 dny, aspoň 2 víkendy, plnění normy 80 %, pracovní morálka, navýšení mzdy 20 %), druhý jako extra bonus.</p>'}
      ${(p.tiers || []).length ? '<div class="mt-s"><button class="btn sec small" type="button" id="posCopyTiers">Použít prémie u všech skupin</button></div>' : ''}
    </div>
  </div>`;
}

/* Dialog dovednosti: název, popis a hodnoticí schéma 0–4 (předvyplněné standardním). */
async function skillDialog(x) {
  const sc = skillScale(x);
  const result = await dialog({
    title: x ? 'Upravit dovednost' : 'Přidat dovednost', ok: x ? 'Uložit' : 'Přidat', wide: true,
    html: `<label class="field"><span>Název dovednosti</span><input name="name" value="${esc(x ? x.name : '')}" maxlength="80" required autofocus placeholder="např. Seřízení stroje"></label>
      <label class="field"><span>Popis (nepovinné)</span><textarea name="desc" rows="2" maxlength="1000" placeholder="Co dovednost zahrnuje">${esc(x ? x.desc : '')}</textarea></label>
      <div class="sk-scale"><div class="row gap"><b>Hodnoticí schéma</b><span class="spacer"></span><button class="btn ghost small" type="button" id="skStd">Standardní schéma</button></div>
        ${sc.map((l, i) => `<div class="sk-level"><span class="lvl l${i}">${i}</span><input name="ln${i}" value="${esc(l.name)}" maxlength="60" aria-label="Název úrovně ${i}"><textarea name="ld${i}" rows="2" maxlength="500" aria-label="Popis úrovně ${i}">${esc(l.desc)}</textarea></div>`).join('')}</div>`,
    onOpen: dlg => {
      $('#skStd', dlg).onclick = () => STD_SCALE.forEach((l, i) => { dlg.querySelector(`[name="ln${i}"]`).value = l.name; dlg.querySelector(`[name="ld${i}"]`).value = l.desc; });
    },
    validate: form => (form.elements.namedItem('name').value.trim() ? null : 'Napiš název dovednosti.'),
  });
  if (result.value !== 'ok') return null;
  const f = result.form.elements;
  const scale = STD_SCALE.map((l, i) => ({ name: f.namedItem(`ln${i}`).value.trim().slice(0, 60) || l.name, desc: f.namedItem(`ld${i}`).value.trim().slice(0, 500) }));
  const std = scale.every((l, i) => l.name === STD_SCALE[i].name && l.desc === STD_SCALE[i].desc);
  return { name: f.namedItem('name').value.trim().slice(0, 80), desc: f.namedItem('desc').value.trim().slice(0, 1000), scale: std ? null : scale };
}

function bindGroupEditor() {
  const editor = $('#posEditor');
  const cur = () => S.positions.find(x => x.id === ui.selPos);
  const refresh = (list = true) => { save(); renderOverview(); renderPeople(); if (list) renderPositions(); };
  /* procenta na desetiny; prázdná hodnota = podmínka se nehlídá */
  const pctVal = (v, hi) => { const t = String(v).trim().replace(',', '.'); return t === '' || !Number.isFinite(+t) ? null : Math.round(clamp(+t, 0, hi) * 10) / 10; };
  const intVal = (v, hi) => { const t = String(v).trim(); return t === '' || !Number.isFinite(+t) ? null : Math.round(clamp(+t, 0, hi)); };
  editor.addEventListener('input', event => {
    const p = cur();
    const t = event.target;
    if (!p) return;
    if (t.id === 'posName') {
      p.name = t.value;
      const label = $(`#posList [data-selpos="${CSS.escape(p.id)}"] b`);
      if (label) label.textContent = p.name || '(bez názvu)';
      save(); renderOverview(); renderPeople();
    }
  });
  editor.addEventListener('change', event => {
    const p = cur();
    const t = event.target;
    if (!p) return;
    if (t.id === 'posDept') { p.dept = String(t.value).trim().slice(0, 60); refresh(); return; }
    if (t.id === 'posOnlyKafe') { p.onlyKafe = t.checked; refresh(); return; }
    if (t.id === 'posMaxTab') { p.maxTab = clamp(Math.round(+t.value || 0), 0, 500); refresh(); return; }
    if (t.id === 'posMax') { const v = String(t.value).trim(); p.max = v === '' ? null : clamp(Math.round(+v || 0), 0, 500); refresh(); return; }
    const rule = t.closest('[data-ri]');
    if (rule) {
      const rules = p[t.closest('[data-rules]').dataset.rules];
      const r = rules[+rule.dataset.ri];
      if ('rat' in t.dataset) r.at = clamp(Math.round(+t.value || 1), 1, 31);
      if ('rt' in t.dataset) r.t = clamp(Math.round(+t.value || 0), 0, 100);
      refresh(); return;
    }
    const card = t.closest('[data-tier]');
    if (card) {
      const tier = p.tiers.find(x => x.id === card.dataset.tier);
      if (!tier) return;
      const f = t.dataset.tf;
      if (f === 'name') tier.name = t.value.trim().slice(0, 60) || tier.name;
      else if (f === 'reward') tier.reward = t.value.trim().slice(0, 200);
      else if (f === 'minSkill') tier.minSkill = clamp(Math.round(+t.value || 0), 0, 4);
      else if (f === 'raise') tier.raise = pctVal(t.value, 100) || 0;
      else if (f === 'minNorm') tier.minNorm = pctVal(t.value, 300);
      else if (f === 'minAtt' || f === 'minUse') tier[f] = pctVal(t.value, 100);
      else if (f === 'maxAbs' || f === 'minWknd') tier[f] = intVal(t.value, 31);
      else if ('tptext' in t.dataset) {
        const pt = tier.manual.find(m => m.id === t.closest('[data-tpoint]').dataset.tpoint);
        if (pt) { const v = t.value.trim().slice(0, 200); if (v) pt.text = v; else tier.manual = tier.manual.filter(m => m !== pt); }
      } else if ('tstreak' in t.dataset) tier.streak = t.checked ? { months: 4, label: 'možnost získat 2. platovou třídu' } : null;
      else if ('tsmonths' in t.dataset && tier.streak) tier.streak.months = clamp(Math.round(+t.value || 4), 2, 24);
      else if ('tslabel' in t.dataset && tier.streak) tier.streak.label = t.value.trim().slice(0, 80) || tier.streak.label;
      refresh(); return;
    }
  });
  editor.addEventListener('click', async event => {
    const p = cur();
    const t = event.target;
    if (!p) return;
    if (t.closest('#posBack')) { ui.posOpen = false; renderPositions(); return; }
    if (t.closest('#posDel')) {
      const n = Object.values(S.employees).filter(e => e.positionId === p.id).length;
      if (!(await confirmBox('Smazat skupinu?', `Skupina ${p.name}${n ? ` zmizí a ${n} lidí zůstane bez skupiny.` : ' zmizí.'} Hodnocení jejích dovedností u lidí se smaže.`, 'Smazat', true))) return;
      const ids = new Set(groupSkills(p).map(x => x.id));
      Object.values(S.employees).forEach(e => {
        if (e.positionId === p.id) e.positionId = null;
        if (e.skills) { delete e.skills[p.id]; if (!Object.keys(e.skills).length) delete e.skills; }
        if (e.rate) { ids.forEach(id => delete e.rate[id]); if (!Object.keys(e.rate).length) delete e.rate; }
      });
      S.positions = S.positions.filter(x => x.id !== p.id);
      ui.selPos = null; ui.posOpen = false;
      save(); renderAll(); toast('Skupina smazána.');
      return;
    }
    if (t.closest('[data-skadd]')) {
      const v = await skillDialog(null);
      if (!v) return;
      p.skillset.push({ id: uid('s'), ...v });
      refresh(); toast(`Dovednost ${v.name} přidána.`);
      return;
    }
    const sk = t.closest('[data-skrow]');
    if (sk) {
      const i = p.skillset.findIndex(x => x.id === sk.dataset.skrow);
      if (i < 0) return;
      if (t.closest('[data-skup]') && i > 0) { [p.skillset[i - 1], p.skillset[i]] = [p.skillset[i], p.skillset[i - 1]]; refresh(); return; }
      if (t.closest('[data-skdown]') && i < p.skillset.length - 1) { [p.skillset[i + 1], p.skillset[i]] = [p.skillset[i], p.skillset[i + 1]]; refresh(); return; }
      if (t.closest('[data-skedit]')) { const v = await skillDialog(p.skillset[i]); if (v) { Object.assign(p.skillset[i], v); refresh(); } return; }
      if (t.closest('[data-skdel]')) {
        const x = p.skillset[i];
        const rated = Object.values(S.employees).filter(e => rateOf(e, x.id) > 0).length;
        if (!(await confirmBox('Smazat dovednost?', `Dovednost ${x.name} zmizí ze skupiny ${p.name}${rated ? ` a ${rated} lidí přijde o její hodnocení` : ''}. Procento a tabáky se přepočítají.`, 'Smazat', true))) return;
        p.skillset.splice(i, 1);
        Object.values(S.employees).forEach(e => { if (e.rate) { delete e.rate[x.id]; if (!Object.keys(e.rate).length) delete e.rate; } });
        refresh(); return;
      }
      return;
    }
    const rc = t.closest('[data-rules]');
    if (rc) {
      const rules = p[rc.dataset.rules];
      const row = t.closest('[data-ri]');
      if (row && t.closest('[data-rdel]')) { rules.splice(+row.dataset.ri, 1); refresh(); return; }
      if (t.closest('[data-radd]')) {
        const last = rules[rules.length - 1];
        rules.push({ at: last ? Math.min(31, (+last.at || 0) + 1) : 1, t: last ? Math.min(100, (+last.t || 0) + 1) : 1 });
        refresh(); return;
      }
    }
    if (t.closest('#posCopyRules')) {
      if (!(await confirmBox('Použít pravidla u všech skupin?', `Srážky a bonusy všech ostatních skupin se přepíšou pravidly ze skupiny ${p.name}.`, 'Přepsat'))) return;
      S.positions.forEach(q => { if (q !== p) { q.penalty = JSON.parse(JSON.stringify(p.penalty)); q.bonus = JSON.parse(JSON.stringify(p.bonus)); } });
      refresh(); toast('Pravidla zkopírována do všech skupin.'); return;
    }
    if (t.closest('#posCopyTiers')) {
      if (!(await confirmBox('Použít prémie u všech skupin?', `Stupně prémie všech ostatních skupin se nahradí kopií stupňů ze skupiny ${p.name}. Označení bodů vedoucího u lidí v ostatních skupinách přestanou platit.`, 'Přepsat'))) return;
      S.positions.forEach(q => { if (q !== p && isGroup(q)) q.tiers = p.tiers.map(x => ({ ...JSON.parse(JSON.stringify(x)), id: uid('t'), manual: x.manual.map(m => ({ id: uid('m'), text: m.text })) })); });
      refresh(); toast('Prémie zkopírovány do všech skupin.'); return;
    }
    if (t.closest('[data-tieradd]')) { p.tiers = p.tiers || []; p.tiers.push(newTier(p)); refresh(); return; }
    const card = t.closest('[data-tier]');
    if (card) {
      const i = p.tiers.findIndex(x => x.id === card.dataset.tier);
      if (i < 0) return;
      const tier = p.tiers[i];
      if (t.closest('[data-tierup]') && i > 0) { [p.tiers[i - 1], p.tiers[i]] = [p.tiers[i], p.tiers[i - 1]]; refresh(); return; }
      if (t.closest('[data-tierdown]') && i < p.tiers.length - 1) { [p.tiers[i + 1], p.tiers[i]] = [p.tiers[i], p.tiers[i + 1]]; refresh(); return; }
      if (t.closest('[data-tierdel]')) {
        if (!(await confirmBox('Smazat stupeň prémie?', `Stupeň ${tier.name} zmizí ze skupiny ${p.name}.`, 'Smazat', true))) return;
        p.tiers.splice(i, 1); refresh(); return;
      }
      if (t.closest('[data-tpadd]')) { tier.manual.push({ id: uid('m'), text: 'Nový bod' }); refresh(); const inp = $(`[data-tier="${CSS.escape(tier.id)}"] [data-tpoint]:last-of-type [data-tptext]`); if (inp) { inp.focus(); inp.select(); } return; }
      const pt = t.closest('[data-tpoint]');
      if (pt && t.closest('[data-tpdel]')) { tier.manual = tier.manual.filter(m => m.id !== pt.dataset.tpoint); refresh(); }
    }
  });
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
    S.demo = false; S.periods = {}; S.employees = {}; S.production = {}; S.prodMap = {}; S.sanctions = []; S.adjust = {}; S.kafe = {}; S.issued = {}; S.log = []; S.eff = blankEff(); S.marks = {}; S.audit = blankAudit();
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
  if (added) $('#importMsg').insertAdjacentHTML('beforeend', `<div class="note w"><b>${added} nových lidí</b> čeká na zařazení do skupiny. <button class="link" type="button" data-go="lide">Zařadit teď</button></div>`);
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
    const own = r.raise.own ? r.pos.levels[r.raise.own.lvl - 1] : (r.tier && (r.tier.next ? r.tier.next.t : r.tier.tier)) || null;
    const days = workedDays(r.att);
    const hours = r.att ? r.att.totalHours : 0;
    const avg = avgPerDay(pr, r.att);
    return `<tr>${who}<td data-label="Kusy" class="r num">${nf(pr.total, 0)}</td><td data-label="Odprac. dny" class="r num">${days || '<span class="muted">—</span>'}</td><td data-label="Ø ks/den" class="r num"><b>${avg == null ? '—' : nf(avg, 1)}</b></td><td data-label="Ø ks/h" class="r num">${hours ? nf(pr.total / hours, 2) : '—'}</td>${time ? `<td data-label="Čas nad zak." class="r num">${nf(pr.spent / 60, 1)} h</td>${pctTd('Plnění normy', r.perf.norm, own ? own.minNorm : null)}${pctTd('Využití fondu', r.perf.use, own ? own.minUse : null)}` : ''}<td data-label="Zápisů" class="r num muted">${pr.entries}</td><td data-label="Ø v den zápisu" class="r num muted">${nf(pr.avgEntryDay, 1)}</td></tr>`;
  }).join('')}</tbody><tfoot><tr><td><b>Celkem</b></td><td class="r num" data-label="Kusy"><b>${nf(totalKs, 0)}</b></td><td class="r num" data-label="Odprac. dny">${rows.reduce((x, r) => x + (r.prod ? workedDays(r.att) : 0), 0)}</td><td colspan="${time ? 7 : 4}"></td></tr></tfoot></table></div>
  <p class="hint">Ø ks/den = vyrobené kusy dělené odpracovanými dny z docházky (všední i víkendové směny), takže díl rozdělaný přes několik dnů průměr nezkreslí. Poslední dva sloupce jsou kontrola evidence. Výroba se do tabáků nezapočítává.${time ? ' Plnění normy a využití fondu můžou být podmínkou prémie; červeně je hodnota pod podmínkou nejbližšího stupně prémie.' : ''}</p>`;
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
  const items = new Set(ids.flatMap(i => Object.keys(res.buckets[i].items || {}))).size;
  showProdMsg(`<div class="note i"><b>Načteno:</b> ${esc(name)}: ${res.used} řádků, měsíce: ${ids.map(i => `${esc(monthLabel(i))} (${res.buckets[i].records})`).join(', ')}.${res.skipped ? ` Přeskočeno ${res.skipped} řádků bez data, kusů nebo času.` : ''} ${time ? `Strávený čas${map.norm != null ? ' a norma' : ''} načteny.` : 'Bez stráveného času, plnění normy a využití fondu se nespočítá.'} ${map && map.item != null ? `Položky (EAN): ${items}, vyhodnocení je v části <button class="link" type="button" data-go="top5">Top 5</button>.` : ''} <button class="link" type="button" data-prodcols>Změnit sloupce</button></div>`
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
    // namedItem: form.elements.item je vestavěná metoda kolekce, ne pole se jménem „item“.
    const v = n => { const el = form.elements.namedItem(n); return !el || el.value === '' ? null : +el.value; };
    return { header: info.header, name: v('name'), date: v('date'), ks: v('ks'), spent: v('spent'), norm: v('norm'),
      unit: form.elements.unit.value === 'h' ? 'h' : 'min', normPer: form.elements.normPer.value === 'piece' ? 'piece' : 'row',
      item: v('item'), iname: v('iname') };
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
    const items = new Set(Object.values(res.buckets).flatMap(b => Object.keys(b.items || {})));
    box.className = 'note i';
    box.textContent = `Použitelných řádků ${res.used} (${recs.length} jmen, ${Object.keys(res.buckets).map(monthLabel).join(', ')}).`
      + (map.spent != null ? ` Strávený čas celkem ${nf(spent / 60, 1)} h.` : '')
      + (map.norm != null ? (nspent ? ` Plnění normy ${nf(normMin / nspent * 100, 1)} %.` : ' Norma: žádný řádek s časem i normou.') : '')
      + (map.item != null ? ` Položek (EAN): ${items.size}.` : ' Bez sloupce EAN se Top 5 z evidence nepředvyplní.');
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
        ${field('item', 'EAN / položka', true, 'pro Top 5')}${field('iname', 'Název položky', true)}
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

  // Standardní hodnoticí schéma
  heading('Hodnoticí schéma dovedností', 12.5);
  d.std.forEach(l => {
    const body = lines(`${l.n} · ${l.name}: ${l.desc}`, 9.2, CW - 4);
    need(body.length * lh(9.2) + 1);
    write(body, 9.2, M, y, INK);
    y += body.length * lh(9.2) + 1;
  });
  y += 5;
  // Skupiny: dovednosti, tabáky podle procenta, pravidla docházky a prémie
  d.groups.forEach(g => {
    need(lh(13) + 30);
    font(13, true); doc.text(g.name, M, y + mm(13) * 0.92);
    const tag = [g.dept && g.dept !== g.name ? `oddělení ${g.dept}` : '', g.onlyKafe ? 'jen Kafe, bez tabáků' : ''].filter(Boolean).join(' · ');
    if (tag) { const nameW = doc.getTextWidth(g.name); font(9.5, false, MUTED); doc.text(tag, M + nameW + 3, y + mm(13) * 0.92); }
    y += lh(13) + 1.5;
    if (!g.onlyKafe) {
      const cw = CW / 5;
      doc.setFillColor(...SOFT); doc.rect(M, y, CW, 11, 'F');
      g.steps.forEach((st, i) => {
        font(7.8, false, MUTED); doc.text(`průměr ${st.l} · ${st.pct} %`, M + i * cw + cw / 2, y + 4, { align: 'center' });
        font(10, true); doc.text(`${st.tab} ${tabW(+st.tab || 0)}`, M + i * cw + cw / 2, y + 8.6, { align: 'center' });
      });
      y += 13;
    }
    if (!g.skills.length) { const b2 = lines('Skupina zatím nemá dovednosti.', 9, CW); write(b2, 9, M, y, MUTED); y += lh(9) + 2; }
    g.skills.forEach(x => {
      const head = lines(x.name + (x.desc ? ` – ${x.desc}` : ''), 9.4, CW, true);
      need(head.length * lh(9.4) + 2);
      write(head, 9.4, M, y, INK, true);
      y += head.length * lh(9.4) + 0.6;
      if (!x.std) x.scale.forEach(l => {
        const body = lines(`${l.n} · ${l.name}${l.desc ? `: ${l.desc}` : ''}`, 8.4, CW - 6);
        need(body.length * lh(8.4));
        write(body, 8.4, M + 6, y, MUTED);
        y += body.length * lh(8.4) + 0.3;
      });
      y += 1;
    });
    y += 1.5;
    g.rules.forEach(rule => {
      const body = lines(rule, 8.8, CW);
      need(body.length * lh(8.8));
      write(body, 8.8, M, y, INK);
      y += body.length * lh(8.8) + 0.4;
    });
    g.tiers.forEach(t => {
      const body = lines(`Prémie ${t.name}: ${t.conds.join(', ')} → ${t.reward}.${t.streak ? ` ${t.streak}` : ''}`, 8.8, CW);
      need(body.length * lh(8.8));
      write(body, 8.8, M, y, ACC);
      y += body.length * lh(8.8) + 0.4;
    });
    y += 7;
  });

  if (d.reasons.length) {
    heading('Důvody sankcí', 12.5);
    const body = lines(`${d.reasons.join(' · ')}. Srážka ${SAN_PCTS[0]}–${SAN_PCTS[SAN_PCTS.length - 1]} % (po 5 %) z nároku za vybraný měsíc. Srážka ze mzdy benefity nekrátí, zpracuje se ve mzdách.`, 9.5, CW);
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
    <p class="small muted">Stejné pro všechny skupiny. Kafe dostane, kdo odpracuje (včetně víkendů) aspoň práh hodin. Výchozí práh je fond: pracovní dny × délka směny.</p>
    ${p ? `<label class="field"><span>Práh pro ${esc(periodName(p))} (hodin)</span><input type="number" id="sKafe" value="${n2(kafeThreshold(p))}" min="0" step="0.5"></label>
      <p class="small muted">Fond je ${nf(periodMeta(p).fund)} h. ${kafeIsCustom(p) ? '<button class="link" type="button" id="sKafeReset">Vrátit na fond</button>' : 'Teď se používá fond.'}</p>` : '<p class="small muted">Práh jde nastavit, až bude nahraná docházka.</p>'}
    <hr class="sep"><p class="eyebrow">Ztráta nároku</p>
    <label class="field"><span>Bez nároku od dní absence</span><input type="number" id="sCut" value="${cutoffDays() || ''}" min="1" max="31" step="1" placeholder="vypnuto"></label>
    <p class="small muted">Kdo má po vyplnění víkendy tolik a víc dní absence, nedostane nic: ani tabák, ani kafe, nepomůže ani ruční úprava. Prázdné = vypnuto. Dovolená a nemoc se počítají jako chybějící dny, pokud není zapnuté „Omluvená absence snižuje fond“.</p>
    <hr class="sep"><p class="eyebrow">Tabáky</p>
    <p class="small muted">Dovednosti ± docházka, nejvýš do stropu skupiny = nárok. Z nároku se strhnou sankce v % (zaokrouhleno na celé tabáky, aspoň 1 za každou sankci). Nakonec ruční úprava.</p>
    <div class="form-grid">
      <label class="field"><span>Krok ruční úpravy</span><input type="number" id="sStep" value="${s.adjStep}" min="1" max="5" step="1"></label>
      <label class="field"><span>Ruční úprava smí přes maximum o</span><input type="number" id="sOver" value="${+s.adjOver || 0}" min="0" max="10" step="1"></label>
    </div>
    <p class="small muted">Tlačítkem + v přehledu jde jít nad maximum skupiny nejvýš o tolik tabáků. Bonus za víkendy strop nikdy nepřekročí a výsledek neklesne pod nulu.</p>`;

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
      <button class="action" type="button" id="dRoster"><b>Export zařazení (Excel)</b><small>Skupiny, směny, hodnocení dovedností a pravidla všech lidí.</small></button>
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
      html: '<p>Smažou se skupiny, lidé, docházka, výroba, sankce i výdeje. Dosavadní stav zůstane v historii verzí, odkud ho jde vrátit.</p><label class="field"><span>Pro potvrzení napiš SMAZAT</span><input name="confirm" autocomplete="off" required autofocus></label>',
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
    const { main, rates, posSheet, rules } = rosterSheets();
    const stamp = new Date().toISOString().slice(0, 10);
    const sheet = (rows, cols) => { const ws = X.utils.aoa_to_sheet(rows.map(row => row.map(safeCell))); ws['!cols'] = cols.map(wch => ({ wch })); return ws; };
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, sheet(main, [18, 14, 18, 20, 12, 14, 15, 18, 28, 16, 14]), 'Zařazení');
    X.utils.book_append_sheet(wb, sheet(rates, [18, 14, ...rates[0].slice(2).map(() => 18)]), 'Hodnocení dovedností');
    X.utils.book_append_sheet(wb, sheet(posSheet, [18, 16, 24, 40, 30, 30, 30, 30, 30]), 'Dovednosti');
    X.utils.book_append_sheet(wb, sheet(rules, [18, 22, 7, 16, 60]), 'Pravidla');
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
    let rateSheet = null;
    const sheets = await readTable(file, names => {
      rateSheet = names.find(n => /hodnocen/i.test(n)) || null;
      return [names.find(n => /zařazení|zarazeni/i.test(n)) || names.find(n => /matice/i.test(n)) || names[0], ...(rateSheet ? [rateSheet] : [])];
    });
    const res = applyRoster(sheets[0].aoa, rateSheet && sheets[1] ? sheets[1].aoa : null);
    $('#rosterMsg').innerHTML = res.err ? `<div class="note e"><b>Načtení selhalo.</b> ${esc(res.err)}</div>`
      : `<div class="note i"><b>Zařazení načteno.</b> ${res.touched} lidí${res.created ? `, z toho ${res.created} nových` : ''}${res.newPos ? `, nové skupiny: ${res.newPos}` : ''}${res.rated ? `, hodnocení dovedností: ${res.rated}` : ''}${res.noLvl ? `, u ${res.noLvl} nešla přečíst úroveň (nechal jsem původní)` : ''}.</div>`;
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
  eff: svg('<path d="M3.5 20.5h17"/><path d="M6.5 16.5v-9M11 16.5v-6M15.5 16.5v-3.5M20 16.5v-1.5"/>'),
  audit: svg('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M8.5 11.5l2 2 4-4M8.5 17h7"/>'),
  data: svg('<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>'),
};
const LOG_FILTERS = [
  ['all', 'Vše', null],
  ['manual', 'Ruční úpravy', ['person', 'level', 'sanction', 'adjust', 'issue', 'position', 'settings', 'eff', 'audit']],
  ['people', 'Lidé a úrovně', ['person', 'level']],
  ['sanction', 'Sankce', ['sanction']],
  ['tab', 'Tabáky a výdej', ['adjust', 'issue']],
  ['import', 'Importy a data', ['import', 'data']],
  ['settings', 'Skupiny a nastavení', ['position', 'settings']],
  ['eff', 'Top 5', ['eff']],
  ['audit', 'Kontroly', ['audit']],
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
   MATICE DOVEDNOSTÍ (verze 2.4): matice, skupiny a pravidla, směny a kapacita
   ========================================================================== */
/** Čtvrtinový kruh: 1 = čtvrtina … 4 = plný kruh (úroveň dovednosti 0–4). */
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

const MX_TABS = [['matrix', 'Matice'], ['groups', 'Skupiny a pravidla'], ['cap', 'Směny a kapacita']];
const SHIFT_ORDER = ['R', 'S1', 'S2', ''];

/* Hodnocení dovednosti u člověka (0 = žádná úroveň, neukládá se). */
function setRate(key, skillId, lvl) {
  const e = S.employees[key];
  if (!e) return;
  e.rate = e.rate || {};
  if (lvl >= 1 && lvl <= 4) e.rate[skillId] = lvl; else delete e.rate[skillId];
  if (!Object.keys(e.rate).length) delete e.rate;
  save();
}
function skillById(id) {
  for (const p of S.positions) for (const x of groupSkills(p)) if (x.id === id) return { p, x };
  return null;
}
function rateTitle(x, v) { const l = skillScale(x)[v] || STD_SCALE[v]; return `${v} – ${l.name}${l.desc ? `: ${l.desc}` : ''}`; }

function renderMatrix() {
  if (!S || !$('#mxTabs')) return;
  const want = ui.mxTab || P.mxTab;
  const tab = MX_TABS.some(t => t[0] === want) ? want : 'matrix';
  $('#mxTabs').innerHTML = MX_TABS.map(([k, t]) => `<button type="button" class="chip${k === tab ? ' on' : ''}" data-mxtab="${k}" aria-pressed="${k === tab}">${t}</button>`).join('');
  $('#mxPanelMatrix').hidden = tab !== 'matrix';
  $('#mxPanelGroups').hidden = tab !== 'groups';
  $('#mxPanelCap').hidden = tab !== 'cap';
  if (tab === 'groups') renderPositions();
  else if (tab === 'cap') renderCapacity();
  else renderMatrixGrid();
}

function renderMatrixGrid() {
  const box = $('#matrixView');
  const groups = S.positions.filter(p => isGroup(p) && groupSkills(p).length);
  const gid = groups.some(p => p.id === P.matrixDept) ? P.matrixDept : '';
  const shift = ['*', ...SHIFT_ORDER].includes(P.matrixShift) ? P.matrixShift : '*';
  $('#matrixGroup').innerHTML = `<option value="">Všechny skupiny</option>${groups.map(p => `<option value="${esc(p.id)}"${p.id === gid ? ' selected' : ''}>${esc(p.name || '(bez názvu)')}</option>`).join('')}`;
  $('#matrixShift').innerHTML = `<option value="*">Všechny směny</option>${SHIFT_ORDER.map(k => `<option value="${k}"${k === shift ? ' selected' : ''}>${esc(shiftName(k))}</option>`).join('')}`;
  $('#matrixLegend').innerHTML = `${STD_SCALE.map((l, i) => `<span>${iluo(i)} ${i} ${esc(l.name.replace(' úroveň', ''))}</span>`).join('')}<span>${iluo(3, true)} dovednost vlastní skupiny</span><span><i class="mx-risk-dot"></i> na směně nikdo na úrovni 3–4</span>`;
  const m = skillGrid(gid || null, shift);
  if (!m.cols.length || !m.rows.length) {
    box.innerHTML = `<div class="card">${emptyState(m.cols.length ? 'Zatím nikdo' : 'Žádné dovednosti', m.cols.length ? 'Zařaď lidi do skupin v části Lidé (nebo změň filtr směny).' : 'Nejdřív založ skupiny a jejich dovednosti v záložce Skupiny a pravidla.', m.cols.length ? '' : '<button class="btn" type="button" data-mxtab="groups">Skupiny a pravidla</button>')}</div>`;
    return;
  }
  const spans = [];
  m.cols.forEach(c => { const last = spans[spans.length - 1]; if (last && last.p === c.p) last.n += 1; else spans.push({ p: c.p, n: 1 }); });
  const cell = (r, v, j) => {
    const c = m.cols[j];
    const home = r.e.positionId === c.p.id;
    const next = (v + 1) % 5;
    return `<td class="mx-cell${home ? ' is-main' : ''}"><button type="button" class="mx-btn" data-mxr="${esc(r.e.key)}" data-skill="${esc(c.s.id)}" data-lvl="${v}" title="${esc(`${c.s.name}: ${rateTitle(c.s, v)}. Kliknutím ${next ? `na ${next}` : 'na 0'}.`)}" aria-label="${esc(`${r.e.last} ${r.e.first}, ${c.s.name}: ${v}`)}">${iluo(v, home)}<b>${v || ''}</b></button></td>`;
  };
  const n = m.cols.length + 3;
  let body = '';
  SHIFT_ORDER.forEach(k => {
    const rows = m.rows.filter(r => r.shift === k);
    if (!rows.length) return;
    body += `<tr class="mx-sep"><td colspan="${n}">${esc(shiftName(k))} · ${peopleCount(rows.length)}</td></tr>`;
    body += rows.map(r => `<tr>
      <th class="mx-name" scope="row"><button class="linkish" type="button" data-mxperson="${esc(r.e.key)}">${esc(r.e.last)} ${esc(r.e.first)}</button></th>
      <td class="mx-main">${r.pos ? esc(r.pos.name) : '<span class="muted">—</span>'}</td>
      <td class="mx-pct num">${r.pct != null ? `${nf(r.pct, 0)} %` : '<span class="muted">—</span>'}</td>
      ${r.cells.map((v, j) => cell(r, v, j)).join('')}</tr>`).join('');
    body += `<tr class="mx-sub"><th colspan="3">Úroveň 3–4 · ${esc(shiftName(k))}</th>${m.coverage.map(c => `<td class="${c.by[k].ready ? '' : 'mx-risk'}">${c.by[k].ready}</td>`).join('')}</tr>`;
  });
  box.innerHTML = `<div class="table-card matrix-card"><table class="matrix skills">
    <thead><tr class="mx-depts"><th colspan="3"></th>${spans.map(g => `<th colspan="${g.n}" class="mx-dept">${esc(g.p.name || '')}</th>`).join('')}</tr>
      <tr><th class="mx-name">Zaměstnanec</th><th class="mx-main">Skupina</th><th class="mx-pct">%</th>${m.cols.map(c => `<th class="mx-col" title="${esc(`${c.p.name}: ${c.s.name}${c.s.desc ? ` – ${c.s.desc}` : ''}`)}"><span>${esc(c.s.name)}</span></th>`).join('')}</tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><th colspan="3">Úroveň 3–4 celkem</th>${m.coverage.map(c => `<td class="${c.ready < 2 ? 'mx-risk' : ''}">${c.ready}</td>`).join('')}</tr>
      <tr><th colspan="3">Hodnoceno 1–4 celkem</th>${m.coverage.map(c => `<td>${c.trained}</td>`).join('')}</tr></tfoot>
  </table></div>`;
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

/* ---------- směny a kapacita ---------- */
function capCell(n, risk) { return `<td class="r num${risk && !n ? ' cap-zero' : risk && n === 1 ? ' cap-one' : ''}">${n}</td>`; }
function renderCapacity() {
  const box = $('#capView');
  const rep = S.capReport || blankCapReport();
  const all = S.positions.filter(p => isGroup(p) && groupSkills(p).length);
  const sel = rep.groups.filter(id => all.some(p => p.id === id));
  const cap = capacity(sel, rep.thr, rep.hidden);
  const hiddenSet = new Set(rep.hidden);
  const head = cap.head;
  const controls = `<div class="card cap-controls noprint">
    <div class="row gap wrap"><b>Skupiny v reportu</b><div class="chips">${all.map(p => `<button type="button" class="chip${!sel.length || sel.includes(p.id) ? ' on' : ''}" data-capgroup="${esc(p.id)}" aria-pressed="${!sel.length || sel.includes(p.id)}">${esc(p.name || '(bez názvu)')}</button>`).join('')}</div></div>
    <div class="row gap wrap mt-s"><label class="field cap-thr"><span>Kdo se počítá jako schopný</span><select id="capThr">${[1, 2, 3, 4].map(l => `<option value="${l}"${l === cap.thr ? ' selected' : ''}>úroveň aspoň ${l} – ${esc(STD_SCALE[l].name)}</option>`).join('')}</select></label>
      <span class="spacer"></span><button class="btn" type="button" id="capPdf"${cap.groups.length ? '' : ' disabled'}>Report do PDF</button><button class="btn sec" type="button" id="capPrint">Tisk</button></div>
    <p class="tiny muted">Dovednost odškrtnutím v tabulce z reportu vyřadíš. Výběr, práh i závěr se ukládají, report tak jde kdykoli upravit a znovu vytisknout.</p>
  </div>`;
  const tiles = `<div class="stats">${[
    statTile('Stálá ranní', String(head.R), 'vždy ranní směna'),
    statTile('Směnnost – skupina 1', String(head.S1), 'střídá ranní a odpolední'),
    statTile('Směnnost – skupina 2', String(head.S2), 'střídá ranní a odpolední'),
    statTile('Bez směny', String(head['']), head[''] ? 'doplň směnu v části Lidé' : 'všichni mají směnu', head[''] ? 'warn' : ''),
  ].join('')}</div>`;
  if (!cap.groups.length) return void (box.innerHTML = `${controls}${tiles}<div class="card">${emptyState('Žádné dovednosti', 'Report kapacit potřebuje skupiny s dovednostmi a hodnocení lidí.')}</div>`);
  const risks = capRisks(cap);
  const noShift = head[''] > 0;
  const groupsHtml = cap.groups.map(g => {
    const rows = groupSkills(g.p).map(x => {
      const off = hiddenSet.has(x.id);
      const r = cap.groups.find(y => y.p === g.p).skills.find(y => y.s.id === x.id);
      if (off || !r) return `<tr class="cap-off"><td><label class="cap-tog"><input type="checkbox" data-capskill="${esc(x.id)}"> <span>${esc(x.name)}</span></label></td><td colspan="${noShift ? 7 : 6}" class="muted small">vyřazeno z reportu</td></tr>`;
      const weaker = r.by.S1.n === r.by.S2.n ? (r.by.S1.sum === r.by.S2.sum ? '—' : r.by.S1.sum < r.by.S2.sum ? 'skupina 1' : 'skupina 2') : r.by.S1.n < r.by.S2.n ? 'skupina 1' : 'skupina 2';
      return `<tr><td><label class="cap-tog"><input type="checkbox" data-capskill="${esc(x.id)}" checked> <span>${esc(x.name)}</span></label></td>
        ${capCell(r.by.R.n)}${capCell(r.by.S1.n, true)}${capCell(r.by.S2.n, true)}${noShift ? capCell(r.by[''].n) : ''}
        <td class="r num cap-var">${r.A.am} / <b class="${r.A.pm ? '' : 'pen'}">${r.A.pm}</b></td><td class="r num cap-var">${r.B.am} / <b class="${r.B.pm ? '' : 'pen'}">${r.B.pm}</b></td>
        <td class="r">${weaker === '—' ? '<span class="muted">vyrovnané</span>' : `<span class="tag warn">${weaker}</span>`}</td></tr>`;
    }).join('');
    const pctRow = SHIFT_ORDER.map(k => g.bySh[k].n ? `${nf(g.bySh[k].pct, 0)} % (${g.bySh[k].n})` : '—');
    return `<div class="card cap-group"><div class="card-head"><div><h3>${esc(g.p.name)}</h3><p class="small muted">Ve skupině: ${peopleCount(g.members)} · průměr dovedností podle směn: stálá ranní ${pctRow[0]}, skupina 1 ${pctRow[1]}, skupina 2 ${pctRow[2]}${g.bySh[''].n ? `, bez směny ${pctRow[3]}` : ''}</p></div></div>
      <div class="table-card flat cap-wrap"><table class="cap-table"><thead><tr><th>Dovednost</th><th class="r">Stálá ranní</th><th class="r">Skupina 1</th><th class="r">Skupina 2</th>${noShift ? '<th class="r">Bez směny</th>' : ''}
        <th class="r" title="Ranní = stálá ranní + skupina 1, odpolední = skupina 2">Var. A ráno / odp.</th><th class="r" title="Ranní = stálá ranní + skupina 2, odpolední = skupina 1">Var. B ráno / odp.</th><th class="r">Slabší směna</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
  }).join('');
  box.innerHTML = `${controls}${tiles}
    <div class="note i"><b>Jak číst report:</b> čísla jsou počty lidí, kteří dovednost zvládají aspoň na úrovni ${cap.thr} (${esc(STD_SCALE[cap.thr].name.toLowerCase())}). Stálá ranní je vždy ráno, skupiny 1 a 2 se střídají: <b>varianta A</b> = ráno stálá ranní + skupina 1, odpoledne skupina 2; <b>varianta B</b> = ráno stálá ranní + skupina 2, odpoledne skupina 1.</div>
    ${risks.length ? `<div class="note e"><b>Odpoledne bez schopného člověka:</b><ul class="cap-risks">${risks.map(r => `<li><b>${esc(r.name)}</b> · ${r.parts.map(esc).join(' · ')}</li>`).join('')}</ul></div>` : '<div class="note i">Na každé odpolední směně je u každé dovednosti aspoň jeden schopný člověk.</div>'}
    ${groupsHtml}
    <div class="card"><h3>Závěr a opatření</h3><p class="small muted">Text se uloží a vytiskne s reportem (např. koho zaučit a do kdy).</p>
      <textarea id="capNote" rows="4" maxlength="4000" placeholder="např. Zaučit 2 lidi ze skupiny 2 na Seřízení stroje do konce měsíce.">${esc(rep.note)}</textarea></div>`;
}
/* Rizika po skupinách: dovednosti, na které odpoledne v dané variantě nikdo nestačí. */
function capRisks(cap) {
  return cap.groups.map(g => {
    const part = (key, label) => {
      const miss = g.skills.filter(r => !r[key].pm).map(r => r.s.name);
      if (!miss.length) return '';
      return `${label}: ${miss.length > 1 && miss.length === g.skills.length ? `všechny dovednosti (${miss.length})` : miss.join(', ')}`;
    };
    const parts = [part('A', 'varianta A (odpoledne skupina 2)'), part('B', 'varianta B (odpoledne skupina 1)')].filter(Boolean);
    return parts.length ? { name: g.p.name || 'Skupina', parts } : null;
  }).filter(Boolean);
}
function capSave(patch) {
  S.capReport = { ...(S.capReport || blankCapReport()), ...patch };
  save();
}

function drawCapacity(doc) {
  const k = pdfKit(doc);
  const rep = S.capReport || blankCapReport();
  const cap = capacity(rep.groups, rep.thr, rep.hidden);
  k.header({ eyebrow: 'ODMĚNY · MATICE DOVEDNOSTÍ', right: `Stav k ${dayText(todayIso())}`, title: 'Kapacita dovedností podle směn',
    sub: `Schopný = úroveň aspoň ${cap.thr} (${STD_SCALE[cap.thr].name.toLowerCase()})`,
    meta: 'Počty lidí, kteří dovednost zvládají. Stálá ranní je vždy ráno, skupiny 1 a 2 se střídají: varianta A = ráno stálá ranní + skupina 1, odpoledne skupina 2; varianta B = ráno stálá ranní + skupina 2, odpoledne skupina 1.' });
  k.tiles([['Stálá ranní', String(cap.head.R), 'lidí'], ['Skupina 1', String(cap.head.S1), 'lidí'], ['Skupina 2', String(cap.head.S2), 'lidí'], ['Bez směny', String(cap.head['']), 'lidí', cap.head[''] ? 'crit' : '']]);
  const noShift = cap.head[''] > 0;
  const cols = [[noShift ? 56 : 70, 'Dovednost'], [17, 'Stálá ranní', 'r'], [16, 'Skup. 1', 'r'], [16, 'Skup. 2', 'r'], ...(noShift ? [[14, 'Bez směny', 'r']] : []), [21, 'Var. A ráno/odp.', 'r'], [21, 'Var. B ráno/odp.', 'r'], [17, 'Slabší', 'r']];
  const head = () => { let x = k.M; cols.forEach(([w, t, al]) => { k.text(t, al === 'r' ? x + w - 1.5 : x, k.y, 7, { bold: true, color: k.C.ink2, align: al === 'r' ? 'right' : 'left' }); x += w; }); k.y += 4.4; k.hline(k.y, k.C.line2, 0.3); k.y += 1; };
  const risks = capRisks(cap).map(r => `${r.name} · ${r.parts.join(' · ')}`);
  cap.groups.forEach(g => {
    k.keep(() => {
      k.heading(g.p.name || 'Skupina', 11.5);
      const pr = SHIFT_ORDER.map(s => (g.bySh[s].n ? `${nf(g.bySh[s].pct, 0)} %` : '—'));
      k.text(`Ve skupině: ${peopleCount(g.members)} · průměr dovedností: stálá ranní ${pr[0]}, skupina 1 ${pr[1]}, skupina 2 ${pr[2]}`, k.M, k.y - 1, 8, { color: k.C.ink2 });
      k.y += 5;
      head();
      g.skills.forEach(r => {
        const nm = k.split(r.s.name, cols[0][0] - 2, 8.6);
        const h = nm.length * k.LH(8.6, 1.25) + 2.2;
        k.need(h);
        let x = k.M;
        nm.forEach((line, i) => k.text(line, x, k.y + 0.4 + i * k.LH(8.6, 1.25), 8.6)); x += cols[0][0];
        const weaker = r.by.S1.n === r.by.S2.n ? (r.by.S1.sum === r.by.S2.sum ? '—' : r.by.S1.sum < r.by.S2.sum ? 'sk. 1' : 'sk. 2') : r.by.S1.n < r.by.S2.n ? 'sk. 1' : 'sk. 2';
        [[String(r.by.R.n)], [String(r.by.S1.n), !r.by.S1.n], [String(r.by.S2.n), !r.by.S2.n], ...(noShift ? [[String(r.by[''].n)]] : []), [`${r.A.am} / ${r.A.pm}`, !r.A.pm], [`${r.B.am} / ${r.B.pm}`, !r.B.pm], [weaker]].forEach(([v, bad], i) => {
          const w = cols[i + 1][0];
          k.text(v, x + w - 1.5, k.y + 0.4, 8.6, { align: 'right', bold: !!bad, color: bad ? k.C.crit : k.C.ink }); x += w;
        });
        k.y += h;
        k.hline(k.y - 0.8);
      });
      k.y += 5;
    }, 40);
  });
  k.keep(() => {
    k.heading('Odpoledne bez schopného člověka', 11.5);
    if (!risks.length) { k.text('Na každé odpolední směně je u každé dovednosti aspoň jeden schopný člověk.', k.M, k.y, 9, { color: k.C.good }); k.y += 7; }
    risks.forEach(r => { const l = k.split(`• ${r}`, k.CW, 9); k.need(l.length * k.LH(9, 1.3)); l.forEach(line => { k.text(line, k.M, k.y, 9, { color: k.C.crit }); k.y += k.LH(9, 1.3); }); });
    k.y += 4;
  }, 20);
  if (rep.note) { k.keep(() => { k.heading('Závěr a opatření', 11.5); k.para(rep.note, k.M, k.CW, 9.4); k.y += 4; }, 25); }
  k.need(26);
  k.signoff();
  k.footer(`Odměny · kapacita dovedností podle směn · ${dayText(todayIso())}`);
}
async function exportCapacityPdf(button) {
  await withPdf(button, doc => {
    doc.setProperties({ title: 'Kapacita dovedností podle směn', creator: 'Odměny' });
    drawCapacity(doc);
    downloadFile(`kapacita-smen-${todayIso()}.pdf`, doc.output('blob'), 'application/pdf');
  });
}

function bindMatrixEvents() {
  $('#view-matice').addEventListener('click', async event => {
    const t = event.target;
    const tab = t.closest('[data-mxtab]');
    if (tab) { ui.mxTab = tab.dataset.mxtab; setPref({ mxTab: ui.mxTab }); renderMatrix(); return; }
    const btn = t.closest('[data-mxr]');
    if (btn) {
      const v = (+btn.dataset.lvl + 1) % 5;
      setRate(btn.dataset.mxr, btn.dataset.skill, v);
      renderMatrixGrid(); renderOverview(); renderPeople();
      const again = $(`[data-mxr="${CSS.escape(btn.dataset.mxr)}"][data-skill="${CSS.escape(btn.dataset.skill)}"]`);
      if (again) again.focus();
      return;
    }
    const person = t.closest('[data-mxperson]');
    if (person) { ui.selPerson = person.dataset.mxperson; ui.personOpen = true; showView('lide'); renderPeople(); return; }
    const g = t.closest('[data-capgroup]');
    if (g) {
      const all = S.positions.filter(p => isGroup(p) && groupSkills(p).length).map(p => p.id);
      let sel = (S.capReport.groups || []).filter(id => all.includes(id));
      if (!sel.length) sel = all.slice();
      sel = sel.includes(g.dataset.capgroup) ? sel.filter(id => id !== g.dataset.capgroup) : [...sel, g.dataset.capgroup];
      capSave({ groups: sel.length === all.length ? [] : sel.length ? sel : [g.dataset.capgroup] });
      renderCapacity(); return;
    }
    if (t.closest('#capPdf')) { exportCapacityPdf(t.closest('#capPdf')); return; }
    if (t.closest('#capPrint')) window.print();
  });
  $('#view-matice').addEventListener('change', event => {
    const t = event.target;
    if (t.id === 'matrixGroup') { setPref({ matrixDept: t.value }); renderMatrixGrid(); return; }
    if (t.id === 'matrixShift') { setPref({ matrixShift: t.value }); renderMatrixGrid(); return; }
    if (t.id === 'capThr') { capSave({ thr: clamp(+t.value || 3, 1, 4) }); renderCapacity(); return; }
    if (t.id === 'capNote') { capSave({ note: t.value.slice(0, 4000) }); return; }
    if (t.dataset.capskill) {
      const hidden = new Set(S.capReport.hidden || []);
      if (t.checked) hidden.delete(t.dataset.capskill); else hidden.add(t.dataset.capskill);
      capSave({ hidden: [...hidden] }); renderCapacity();
    }
  });
  $('#btnMatrixXlsx').onclick = exportMatrix;
  $('#btnMatrixPrint').onclick = () => window.print();
  $('#btnRulesPdf').onclick = exportRulesPdf;
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
  /* hodnocené dovednosti: vlastní skupina a zaučení v dalších */
  const rated = S.positions.filter(isGroup).flatMap(p => groupSkills(p).filter(x => rateOf(e, x.id) > 0).map(x => ({ p, x, v: rateOf(e, x.id) })));
  const personLog = (S.log || []).filter(x => x.key === e.key).slice(-25).reverse();
  const chartMonths = monthsBetween(from, to).map(id => months.find(m => m.id === id) || { id, label: monthLabel(id), hasAtt: false, prod: null, sanctions: [] });
  /* ukazatele pro prémie: sloupce jen když jsou data (čas v evidenci) nebo skupina prémie má */
  const showPerf = months.some(m => m.perf.time);
  const showRaise = months.some(m => m.posId && hasRaise(S.positions.find(p => p.id === m.posId)));
  const pfShift = shiftOf(e);
  const lastRaise = months.slice().reverse().find(m => m.hasAtt);
  const perfTd = (label, v, min) => `<td data-label="${label}" class="r num nowrap">${v == null ? '<span class="muted">—</span>' : `<span class="${min != null && v < min - 1e-9 ? 'pen' : ''}" title="${nf(v, 1)} %${min != null ? ` (podmínka ${nf(min, 1)} %)` : ''}">${nf(v, 0)} %</span>`}</td>`;
  const ownLv = m => { const p = S.positions.find(x => x.id === m.posId); if (!p) return null; if (isGroup(p)) return (m.raise.next || m.raise.list?.[m.raise.lvl - 1])?.t || null; return m.raise.own ? p.levels[m.raise.own.lvl - 1] : null; };

  box.innerHTML = `<div class="pf-top noprint"><button class="btn ghost small" type="button" data-pfback>${I.back}Zpět</button></div>
    <header class="page-head pf-head">
      <div>
        <p class="eyebrow">Profil zaměstnance</p>
        <h1>${esc(name)}</h1>
        <p class="pf-meta">${L.pos ? `<span class="lvl l${L.n || 0}">${L.n || '?'}</span> <b>${esc(L.pos.name)}</b>${L.pct != null ? ` · dovednosti ${nf(L.pct, 0)} % (${L.base} ${tabW(L.base)})` : L.legacy && L.n ? ` · ${esc(L.lv.name)} (${L.base} ${tabW(L.base)})` : ' · bez dovedností'} · oddělení ${esc(deptOf(L.pos))}` : '<span class="crit">bez skupiny</span>'}${pfShift ? ` · ${esc(shiftName(pfShift))}` : ''}${e.shortFri ? ` · zkrácený pátek ${nf(friShift())} h` : ''}${e.excluded ? ' · <span class="tag">vyřazen ze seznamu</span>' : ''}</p>
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
      ...(showPerf || showRaise ? [statTile('Prémie', lastRaise ? (lastRaise.raise.lvl ? esc(lastRaise.raise.name) : '—') : '—',
        `${lastRaise ? `${esc(lastRaise.label)}${lastRaise.raise.pct ? ` · +${nf(lastRaise.raise.pct, 1)} % mzdy` : ''} · ` : ''}norma ${pctText(t.normPct)}`, lastRaise && lastRaise.raise.lvl ? 'good' : '')] : []),
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
      ${months.length ? `<div class="table-card flat"><table class="stack pf-table"><thead><tr><th>Měsíc</th><th>Skupina</th><th class="r">Dny</th><th class="r">Hodiny</th><th class="r">Absence</th><th class="c">Kafe</th><th class="r">Docházka</th><th class="r">Sankce</th><th class="r">Úprava</th><th class="r">Tabáky</th><th class="c">Vydáno</th><th class="r">Ø ks/den</th>${showPerf ? '<th class="r" title="Norma ÷ strávený čas">Norma</th><th class="r" title="Čas nad zakázkami ÷ hodiny v práci">Využití</th>' : ''}${showRaise ? '<th class="r">Prémie</th>' : ''}</tr></thead>
      <tbody>${months.slice().reverse().map(m => `<tr data-pfmonth="${esc(m.id)}" class="${m.lost ? 'is-lost' : ''}">
        <td data-label="Měsíc" class="name nowrap"><b>${esc(m.label)}</b></td>
        <td data-label="Skupina">${m.pos ? `${esc(m.pos)}${m.skillPct != null ? ` <small class="muted" title="Průměr dovedností${m.from === 'issued' ? ' (podle výdeje)' : ''}">${nf(m.skillPct, 0)} %</small>` : m.lvl ? ` <span class="lvl l${m.lvl}" title="${esc(m.lvlName)}${m.from === 'issued' ? ' (podle výdeje)' : ''}">${m.lvl}</span>` : ''}` : '<span class="muted">—</span>'}</td>
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
        ${showRaise ? `<td data-label="Prémie" class="r">${!m.hasAtt ? '<span class="muted">—</span>' : m.raise.lvl ? `<span class="raise-ok" title="${esc(m.raise.pct ? `+${nf(m.raise.pct, 1)} % mzdy` : '')}">${esc(m.raise.name)}</span>` : `<span class="raise-no" title="${esc(m.raise.next ? m.raise.next.checks.filter(c => !c.ok).map(c => `${c.label} (${c.txt})`).join(', ') : '')}">—</span>`}</td>` : ''}
      </tr>`).join('')}</tbody>
      <tfoot><tr><td><b>Celkem</b></td><td></td><td data-label="Dny" class="r num">${t.workDays}${t.wkDays ? ` +${t.wkDays}` : ''}</td><td data-label="Hodiny" class="r num">${nf(t.hours)}</td><td data-label="Absence" class="r num">${t.missing}</td><td data-label="Kafe" class="c num">${t.kafe}×</td><td></td><td data-label="Sankce" class="r num">${t.pen ? `−${t.pen}` : '0'}</td><td data-label="Úprava" class="r num">${t.adj ? sgn(t.adj) : '0'}</td><td data-label="Tabáky" class="r num"><b>${t.tabaky}</b></td><td data-label="Vydáno" class="c num">${t.issuedTab}${t.issuedKafe ? ` + ${t.issuedKafe}× kafe` : ''}</td><td data-label="Ø ks/den" class="r num">${t.perDay != null ? nf(t.perDay, 1) : '—'}</td>${showPerf ? perfTd('Norma', t.normPct, null) + perfTd('Využití', t.usePct, null) : ''}${showRaise ? '<td></td>' : ''}</tr></tfoot></table></div>
      <p class="hint">Klikni na měsíc a uvidíš docházku po dnech a sankce. Skupina je podle potvrzeného výdeje, jinak podle zařazení platného na konci měsíce; procento dovedností a prémie z výdeje, jinak podle dnešního hodnocení a pravidel skupiny.</p>` : emptyState('Žádné záznamy', 'Pro vybrané období nemá docházku, výrobu, sankce ani výdej.')}
    </div>
    <div class="grid-2 pf-bottom">
      <div class="card">
        <h3>Sankce v období</h3>
        ${months.some(m => m.sanctions.length) ? `<ul class="pf-sanctions">${months.slice().reverse().flatMap(m => m.sanctions.map(s => `<li><span class="pen">${s.pct != null ? `−${s.pct} %` : `−${s.points} tab.`}</span><div><b>${esc(s.name)}${s.wage ? ' <span class="tag warn">ze mzdy</span>' : ''}</b><small>${esc(m.label)}${s.note ? ` · ${esc(s.note)}` : ''}${s.at ? ` · zadáno ${esc(new Date(s.at).toLocaleDateString('cs-CZ'))}` : ''}</small></div></li>`)).join('')}</ul>` : '<p class="small muted">V tomto období žádné sankce.</p>'}
      </div>
      <div class="card">
        <h3>Zařazení a dovednosti</h3>
        <ul class="pf-timeline">${pd.changes.length ? pd.changes.slice().reverse().map(h => `<li><b>${esc(h.text)}</b><small>${h.at ? `od ${esc(new Date(h.at).toLocaleDateString('cs-CZ'))}` : 'od začátku evidence'}${h.prev ? ` · předtím ${esc(h.prev)}` : ''}</small></li>`).join('') : '<li><small>Zatím bez záznamu o zařazení.</small></li>'}</ul>
        ${rated.length ? `<p class="eyebrow mt-s">Hodnocení dovedností (dnes)</p><ul class="pf-skills">${rated.map(r => `<li>${iluo(r.v, r.p.id === e.positionId)}<span>${esc(r.x.name)} <small class="muted">${esc(r.p.name)} · ${r.v} – ${esc(skillScale(r.x)[r.v].name)}</small></span></li>`).join('')}</ul>` : ''}
        ${e.legacy ? `<p class="small muted mt-s">Původní zařazení z verze 2.3: ${esc(legacyText(e.legacy))}</p>` : ''}
      </div>
    </div>
    ${ktPersonCard(e.key, `${from}-01`, `${to}-31`)}
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
    ${m.sanctions.length ? `<ul class="sanlist">${m.sanctions.map(s => `<li>${esc(s.name)} ${s.pct != null ? `${s.pct} %${s.wage ? ' ze mzdy' : ''}` : `−${s.points} tab.`}${s.note ? ` – ${esc(s.note)}` : ''}</li>`).join('')}</ul>` : ''}
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
  $('#prodMsg').addEventListener('click', event => {
    if (!event.target.closest('[data-prodcols]')) return;
    if (ui.lastProd) chooseProdColumns(ui.lastProd.aoa, ui.lastProd.name, ui.lastProd.info);
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
   TOP 5 NEJMÉNĚ EFEKTIVNÍCH POLOŽEK (verze 2.2)
   Týdenní žebříček z evidence práce, případy s řešením a ověřením účinnosti,
   termíny a vydané reporty. Výpočty jsou v core.js (weekRanking, caseState…).
   ========================================================================== */
const T5_TABS = [['week', 'Týden'], ['cases', 'Případy'], ['deadlines', 'Termíny'], ['reports', 'Vydané reporty']];
const T5_FILTERS = [
  ['active', 'Rozpracované', s => ['new', 'act', 'v1', 'v2', 'fail'].includes(s.k)],
  ['late', 'Po termínu', s => s.late],
  ['verify', 'Ověřování', s => s.k === 'v1' || s.k === 'v2'],
  ['ok', 'Uzavřené', s => s.k === 'ok'],
  ['zrus', 'Zrušené', s => s.k === 'zrus'],
  ['all', 'Vše', () => true],
];
const T5_KIND = { now: 'okamžité', process: 's procesním časem' };

/** Dialog s víceřádkovým textem (důvody, poznámky); vrací text, nebo null při zrušení. */
async function textBox(title, label, value = '', ok = 'Uložit', placeholder = '', max = 1000) {
  const result = await dialog({
    title, ok,
    html: `<label class="field"><span>${esc(label)}</span><textarea name="value" rows="4" maxlength="${max}" placeholder="${esc(placeholder)}" required autofocus>${esc(value)}</textarea></label>`,
  });
  return result.value === 'ok' ? result.form.elements.value.value.trim() : null;
}

function effMeta() { return { at: Date.now(), by: ui.me.label || '' }; }
const hrs = (min, d = 1) => `${nf((+min || 0) / 60, d)} h`;
const effPct = v => (v == null ? '—' : `${nf(v, 1)} %`);
function tsText(ts) { return `${dayText(todayIso(ts))}, ${new Date(ts).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`; }
function stateChip(s) { return `<span class="t5-state s-${s.k}${s.late ? ' late' : ''}">${esc(s.label)}${s.late ? ' · po termínu' : ''}</span>`; }
function effTone(eff) { return eff == null ? '' : eff < 50 ? 'crit' : eff < effSet().target ? 'warn' : 'ok'; }
function effBar(eff) {
  if (eff == null) return '<span class="muted">—</span>';
  return `<div class="t5-bar ${effTone(eff)}"><span class="track"><i data-w="${clamp(eff, 2, 100).toFixed(1)}"></i></span><b class="num">${nf(eff, 1)} %</b></div>`;
}
function liveText(a) { return String(a.text || '').trim(); }

function renderTop5Badge() {
  const badge = $('#navTop5');
  if (!badge || !S) return;
  const n = effDeadlines().filter(x => x.late).length;
  badge.hidden = !n;
  badge.textContent = String(n);
  badge.title = n ? `${n} ${n === 1 ? 'termín' : n <= 4 ? 'termíny' : 'termínů'} po splatnosti` : '';
}

function renderTop5() {
  const view = $('#t5View');
  if (!view || !S) return;
  renderTop5Badge();
  const late = effDeadlines().filter(x => x.late).length;
  const counts = { cases: S.eff.cases.filter(c => T5_FILTERS[0][2](caseState(c))).length, deadlines: effDeadlines(null, 14).length, reports: S.eff.reports.length };
  $('#t5Tabs').innerHTML = T5_TABS.map(([k, t]) => {
    const on = k === ui.t5.tab && !ui.t5.caseId;
    const n = counts[k];
    return `<button type="button" class="chip${on ? ' on' : ''}" data-t5tab="${k}" aria-pressed="${on}">${t}${n ? ` <em class="t5-count${k === 'deadlines' && late ? ' late' : ''}">${n}</em>` : ''}</button>`;
  }).join('');
  const c = ui.t5.caseId ? effCase(ui.t5.caseId) : null;
  if (ui.t5.caseId && !c) ui.t5.caseId = null;
  view.innerHTML = c ? t5CaseHtml(c)
    : ui.t5.tab === 'cases' ? t5CasesHtml()
      : ui.t5.tab === 'deadlines' ? t5DeadlinesHtml()
        : ui.t5.tab === 'reports' ? t5ReportsHtml() : t5WeekHtml();
  setWidths(view);
}

/* ---------- týden ---------- */
function t5SolutionCell(r, weekId) {
  const c = caseOfItem(r.ean);
  if (!c) return `<button class="btn small" type="button" data-t5new="${esc(r.ean)}" data-week="${esc(weekId)}">Založit případ</button>`;
  const s = caseState(c);
  const open = `<button class="linkish" type="button" data-t5open="${esc(c.id)}">${esc(caseLabel(c))}</button>`;
  if (s.k === 'ok') return `<div class="t5-sol">${open}${stateChip(s)}<button class="btn sec small" type="button" data-t5reopen="${esc(c.id)}" data-week="${esc(weekId)}">Znovu otevřít</button></div>`;
  if (s.k === 'fail') return `<div class="t5-sol">${open}${stateChip(s)}<button class="btn sec small" type="button" data-t5reopen="${esc(c.id)}" data-week="${esc(weekId)}">Nové kolo</button></div>`;
  return `<div class="t5-sol">${open}${stateChip(s)}</div>`;
}

/* Čas v jednotce zadávání (hodiny nebo minuty podle Nastavení modulu). */
function effUnit() { return effSet().unit === 'min' ? 'min' : 'h'; }
/* Hodnota do pole: bez oddělovače tisíců, desetinná čárka, nejvýš dvě desetinná místa. */
function unitText(min) { const v = effUnit() === 'min' ? +min || 0 : (+min || 0) / 60; return String(Math.round(v * 100) / 100).replace('.', ','); }
function parseUnit(v) { const m = toMinutes(String(v || '').trim(), effUnit(), false); return m == null ? null : Math.round(m * 100) / 100; }
function unitLabel() { return effUnit() === 'min' ? 'min' : 'h'; }

/* Výchozí týden: poslední se zápisem, jinak minulý týden (report se dělá za uplynulý týden). */
function t5WeekId() {
  if (!ui.t5.week || !weekById(ui.t5.week)) {
    const cur = isoWeek(todayIso()).id;
    const manual = Object.keys(S.eff.weeks).filter(id => S.eff.weeks[id].items.length).sort().reverse()[0];
    ui.t5.week = manual || effWeeks()[0] || shiftWeek(cur, -1);
  }
  return ui.t5.week;
}

function t5KnownItems() {
  const known = {};
  Object.keys(S.production).sort().forEach(id => Object.entries(S.production[id].items || {}).forEach(([ean, it]) => { if (it.name || !known[ean]) known[ean] = it.name || ''; }));
  Object.keys(S.eff.weeks).sort().forEach(id => S.eff.weeks[id].items.forEach(e => { if (e.ean && (e.name || !known[e.ean])) known[e.ean] = e.name || known[e.ean] || ''; }));
  S.eff.cases.forEach(c => { if (!known[c.ean]) known[c.ean] = c.name || ''; });
  return known;
}

/* Řádky ručního zápisu: platné podle plnění, rozepsané na konci. */
function t5Rows(id) {
  const wk = S.eff.weeks[id];
  if (!wk) return [];
  const valid = weekEntries(id).map(e => e.id);
  return [...valid.map(eid => wk.items.find(e => e.id === eid)), ...wk.items.filter(e => !valid.includes(e.id))];
}

function t5WeekHtml() {
  const id = t5WeekId();
  const cur = isoWeek(todayIso()).id;
  const weekList = effWeeks();
  const options = [...new Set([...weekList, id, cur, shiftWeek(cur, -1)])].sort().reverse();
  const hist = topHistory();
  const rep = S.eff.reports.find(r => r.week === id);
  const sum = effSummary();
  const wt = weekTop(id);
  const rows = t5Rows(id);
  const manual = rows.length > 0;
  const rk = !manual ? weekRanking(id) : null;
  const top = wt.items;
  const nspent = top.reduce((x, r) => x + r.nspent, 0);
  const norm = top.reduce((x, r) => x + r.norm, 0);
  const lost = top.reduce((x, r) => x + r.lost, 0);
  const u = unitLabel();
  const bar = `<div class="t5-weekbar">
      <button class="icon-btn" type="button" data-t5wk="older" aria-label="Předchozí týden">${I.back}</button>
      <select id="t5WeekSel" aria-label="Týden">${options.map(w => `<option value="${w}"${w === id ? ' selected' : ''}>${esc(`${weekName(w)} · ${weekRange(weekById(w))}${w === cur ? ' · tento týden' : ''}`)}</option>`).join('')}</select>
      <button class="icon-btn t5-next" type="button" data-t5wk="newer" aria-label="Další týden" ${id >= cur ? 'disabled' : ''}>${I.back}</button>
      <span class="spacer"></span>
      ${rep ? `<span class="tag acc" title="Poslední vydaný report tohoto týdne">Vydáno ${esc(tsText(rep.at))} · revize ${rep.rev}</span>` : ''}
      <button class="btn" type="button" data-t5pdf="week"${top.length ? '' : ' disabled'}>Report týdne do PDF</button>
    </div>`;
  const tiles = `<div class="stats">${[
    statTile('Plnění Top 5', nspent ? effPct(norm / nspent * 100) : '—', nspent ? `norma ${hrs(norm)} z ${hrs(nspent)} práce` : 'zatím nic zapsáno'),
    statTile('Ztráta Top 5', hrs(lost), 'strávený čas nad normou', lost ? 'crit' : ''),
    statTile('Rozpracované případy', sum.open + sum.verify + sum.fail, `${sum.verify} v ověřování`),
    statTile('Po termínu', sum.late, sum.late ? 'termíny k řešení' : 'vše v termínu', sum.late ? 'crit' : ''),
  ].join('')}</div>`;
  const solution = r => (r.ean && r.eff != null ? t5SolutionCell(r, id) : '<span class="muted small">doplň EAN a čas</span>');
  let table;
  if (manual) {
    table = `<div class="table-card"><table class="stack t5-table t5-entry"><thead><tr><th class="rank">#</th><th>EAN</th><th>Název dílu</th><th class="r">Strávený čas (${u})</th><th class="r">Norma (${u})</th><th>Plnění</th><th class="r">Neplnění</th><th class="r">Ztráta</th><th class="r" title="Kolikrát byla položka v Top 5 (do tohoto týdne)">V Top 5</th><th class="r">Řešení</th><th></th></tr></thead><tbody>${rows.map(e => {
      const m = e.ean && +e.spent > 0 ? { ...entryMetrics(e), lost: Math.max(0, e.spent - e.norm) } : null;
      const rank = m ? weekEntries(id).findIndex(x => x.id === e.id) + 1 : '';
      return `<tr data-ent="${esc(e.id)}">
        <td class="rank num">${rank || ''}</td>
        <td data-label="EAN"><input type="text" class="t5-in t5-ean" data-ef="ean" value="${esc(e.ean)}" list="t5EanList" maxlength="40" placeholder="EAN" aria-label="EAN" autocomplete="off"></td>
        <td data-label="Název dílu"><input type="text" class="t5-in" data-ef="name" value="${esc(e.name)}" maxlength="120" placeholder="název dílu" aria-label="Název dílu"></td>
        <td class="r" data-label="Strávený čas (${u})"><input type="text" class="t5-in num r" data-ef="spent" value="${e.spent ? esc(unitText(e.spent)) : ''}" inputmode="decimal" placeholder="0" aria-label="Strávený čas"></td>
        <td class="r" data-label="Norma (${u})"><input type="text" class="t5-in num r" data-ef="norm" value="${e.norm ? esc(unitText(e.norm)) : ''}" inputmode="decimal" placeholder="0" aria-label="Norma"></td>
        <td data-label="Plnění">${m ? effBar(m.eff) : '<span class="muted">—</span>'}</td>
        <td class="r num" data-label="Neplnění">${m && m.eff < 100 ? `<b>${effPct(100 - m.eff)}</b>` : '<span class="muted">—</span>'}</td>
        <td class="r num" data-label="Ztráta">${m ? hrs(m.lost) : '<span class="muted">—</span>'}</td>
        <td class="r num" data-label="V Top 5">${m ? `${(hist[e.ean] || []).filter(w => w <= id).length}×` : ''}</td>
        <td class="actions" data-label="Řešení">${m ? solution({ ...e, ...m }) : '<span class="muted small">doplň EAN a čas</span>'}</td>
        <td class="actions"><button class="icon-btn" type="button" data-entdel aria-label="Smazat řádek">${I.x}</button></td></tr>`;
    }).join('')}</tbody></table></div>
    <div class="row gap t5-entry-tools">${rows.length < EFF_TOP ? '<button class="btn sec small" type="button" data-entadd>Přidat položku</button>' : ''}<span class="small muted">Nejvýš ${EFF_TOP} položek. Plnění = norma ÷ strávený čas, neplnění = 100 % − plnění, ztráta = strávený čas nad normou. Čas se zadává v ${u === 'h' ? 'hodinách (např. 13,5 nebo 13:30)' : 'minutách'}, jde přepnout v Nastavení.</span></div>`;
  } else if (rk && rk.top.length) {
    table = `<div class="note i"><b>Spočítáno z evidence práce</b> (položky pod normou s aspoň ${esc(hrs(effSet().min))} práce). Převezmi ho do zápisu a uprav, nebo zapiš týden ručně. <button class="btn small" type="button" data-entimport>Převzít do zápisu</button></div>
    <div class="table-card"><table class="stack t5-table"><thead><tr><th class="rank">#</th><th>Položka</th><th>Plnění</th><th class="r">Neplnění</th><th class="r">Strávený čas</th><th class="r">Norma</th><th class="r">Ztráta</th><th class="r">V Top 5</th><th class="r">Řešení</th></tr></thead><tbody>${rk.top.map((r, i) => `<tr>
      <td class="rank num">${i + 1}</td>
      <td class="name" data-label="Položka"><div class="who"><b class="t5-ean">${esc(r.ean)}</b><span class="pos">${esc(r.name || 'bez názvu')}</span></div></td>
      <td data-label="Plnění">${effBar(r.eff)}</td><td class="r num" data-label="Neplnění"><b>${effPct(100 - r.eff)}</b></td>
      <td class="r num" data-label="Strávený čas">${hrs(r.nspent)}</td><td class="r num" data-label="Norma">${hrs(r.norm)}</td><td class="r num" data-label="Ztráta">${hrs(r.lost)}</td>
      <td class="r num" data-label="V Top 5">${(hist[r.ean] || []).filter(w => w <= id).length}×</td><td class="actions" data-label="Řešení">${solution(r)}</td></tr>`).join('')}</tbody></table></div>`;
  } else {
    table = `<div class="card">${emptyState(`${esc(weekName(id))} zatím bez zápisu`, `Zapiš pět dílů s nejhorším plněním normy za týden ${esc(weekRange(weekById(id)))}: EAN, název dílu, strávený čas a normu. Plnění a neplnění se dopočítá.`, '<button class="btn" type="button" data-entadd>Přidat položku</button>')}</div>`;
  }
  const known = t5KnownItems();
  return `${bar}${tiles}${table}<datalist id="t5EanList">${Object.entries(known).map(([e, n]) => `<option value="${esc(e)}">${esc(n)}</option>`).join('')}</datalist>
    <p class="hint">Týden je pondělí až neděle. Ke každému dílu se zakládá případ s příčinou, opatřeními a ověřením účinnosti. Když se díl vrátí do Top 5, otevře se jeho původní případ znovu.</p>`;
}

/* Úpravy ručního zápisu týdne. Po dokončení úpravy se řádky přeřadí podle plnění a fokus zůstane
   na stejném poli téhož řádku. */
let t5PointerDown = false;
function t5Rerender() {
  if (t5PointerDown) { document.addEventListener('pointerup', () => setTimeout(t5Rerender, 0), { once: true }); return; }
  setTimeout(() => {
    const a = document.activeElement;
    const row = a && a.closest ? a.closest('[data-ent]') : null;
    const key = row && a.dataset.ef ? [row.dataset.ent, a.dataset.ef] : null;
    renderTop5();
    if (key) { const el = $(`[data-ent="${CSS.escape(key[0])}"] [data-ef="${key[1]}"]`); if (el) el.focus(); }
  }, 0);
}
async function t5EntryClick(event) {
  const t = event.target;
  const id = ui.t5.week;
  const meta = effMeta();
  if (t.closest('[data-entadd]')) {
    const wk = S.eff.weeks[id] || (S.eff.weeks[id] = { items: [], at: meta.at, by: meta.by });
    if (wk.items.length >= EFF_TOP) { toast(`Top 5 má nejvýš ${EFF_TOP} položek.`, true); return true; }
    const e = { id: uid('e'), ean: '', name: '', spent: 0, norm: 0 };
    wk.items.push(e);
    renderTop5();
    const el = $(`[data-ent="${e.id}"] [data-ef="ean"]`);
    if (el) el.focus();
    return true;
  }
  const del = t.closest('[data-entdel]');
  if (del) {
    const wk = S.eff.weeks[id];
    const e = wk && wk.items.find(x => x.id === del.closest('[data-ent]').dataset.ent);
    if (!e) return true;
    if ((e.ean || e.spent) && !(await confirmBox('Odebrat díl z Top 5?', `${e.ean || 'Řádek'}${e.name ? ` (${e.name})` : ''} zmizí ze zápisu ${weekName(id)}. Případ dílu zůstane.`, 'Odebrat', true))) return true;
    wk.items = wk.items.filter(x => x !== e);
    if (!wk.items.length) delete S.eff.weeks[id];
    else { wk.at = meta.at; wk.by = meta.by; }
    save(); renderTop5();
    return true;
  }
  if (t.closest('[data-entimport]')) {
    const n = importWeekToManual(id, meta);
    save(); renderTop5();
    toast(n ? `Převzato ${n} ${n === 1 ? 'díl' : n <= 4 ? 'díly' : 'dílů'} z evidence práce. Hodnoty jde upravit.` : 'V evidenci práce nic k převzetí.', !n);
    return true;
  }
  return false;
}

function t5EntryChange(event) {
  const t = event.target;
  const row = t.closest('[data-ent]');
  if (!row || !t.dataset.ef) return false;
  const wk = S.eff.weeks[ui.t5.week];
  const e = wk && wk.items.find(x => x.id === row.dataset.ent);
  if (!e) return true;
  const f = t.dataset.ef;
  if (f === 'ean') {
    e.ean = itemKey(t.value);
    if (e.ean && !e.name) e.name = effItemName(e.ean) || t5KnownItems()[e.ean] || '';
  } else if (f === 'name') e.name = t.value.trim().slice(0, 120);
  else {
    const v = parseUnit(t.value);
    if (t.value.trim() && v == null) { toast(`Čas zapiš jako číslo (${unitLabel()}), třeba 13,5 nebo 13:30.`, true); t.value = e[f] ? unitText(e[f]) : ''; return true; }
    e[f] = v == null ? 0 : Math.min(v, 1e7);
  }
  wk.at = Date.now();
  wk.by = ui.me.label || '';
  save();
  t5Rerender();
  return true;
}

/* ---------- případy ---------- */
function t5CasesHtml() {
  const filter = T5_FILTERS.find(f => f[0] === ui.t5.filter) || T5_FILTERS[0];
  const q = norm(ui.t5.q);
  const all = S.eff.cases.map(c => ({ c, s: caseState(c), ba: caseBeforeAfter(c) }));
  const list = all.filter(x => filter[2](x.s) && (!q || norm(`${caseLabel(x.c)} ${x.c.ean} ${x.c.name}`).includes(q)))
    .sort((a, b) => (a.s.late === b.s.late ? 0 : a.s.late ? -1 : 1) || (a.s.due || '9999') .localeCompare(b.s.due || '9999') || b.c.at - a.c.at);
  const chips = T5_FILTERS.map(([k, t, fn]) => `<button type="button" class="chip${k === filter[0] ? ' on' : ''}" data-t5filter="${k}" aria-pressed="${k === filter[0]}">${t} <em class="t5-count">${all.filter(x => fn(x.s)).length}</em></button>`).join('');
  return `<div class="toolbar t5-casebar"><div class="chips">${chips}</div><span class="spacer"></span>
      <input type="search" id="t5Q" value="${esc(ui.t5.q)}" placeholder="Hledat EAN, název nebo případ…" aria-label="Hledat případ">
      <button class="btn sec" type="button" data-t5manual>Nový případ</button></div>
    ${list.length ? `<div class="table-card"><table class="stack t5-table"><thead><tr><th>Případ</th><th>Položka</th><th>Stav</th><th class="r">Kolo</th><th>Zjištěno</th><th>Další termín</th><th class="r" title="Plnění při zjištění → poslední ověření">Plnění před → po</th></tr></thead><tbody>${list.map(({ c, s, ba }) => `<tr class="t5-row" data-t5open="${esc(c.id)}" tabindex="0">
        <td class="name" data-label="Případ"><b>${esc(caseLabel(c))}</b></td>
        <td data-label="Položka"><div class="who"><b class="t5-ean">${esc(c.ean)}</b><span class="pos">${esc(c.name || 'bez názvu')}</span></div></td>
        <td data-label="Stav">${stateChip(s)}</td>
        <td class="r num" data-label="Kolo">${s.round}</td>
        <td class="num" data-label="Zjištěno">${c.week ? esc(weekName(c.week)) : esc(dayText(todayIso(c.at)))}</td>
        <td class="num" data-label="Další termín">${s.due ? esc(dayText(s.due)) : s.closed ? `<span class="muted">${esc(dayText(s.closed))}</span>` : '<span class="muted">—</span>'}</td>
        <td class="r num" data-label="Plnění před → po">${effPct(ba.before)} → ${ba.after == null ? '<span class="muted">—</span>' : `<b>${effPct(ba.after)}</b>`}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="card">${emptyState(S.eff.cases.length ? 'Nic neodpovídá' : 'Zatím žádný případ', S.eff.cases.length ? 'Zkus jiný filtr nebo hledání.' : 'Případ se zakládá z týdenního žebříčku (tlačítko Založit případ), nebo ručně tlačítkem Nový případ.')}</div>`}
    <p class="hint">Jedna položka = jeden případ. Když se problém vrátí, otevře se v témž případu nové kolo a předchozí řešení zůstane v historii, ať se neopakuje.</p>`;
}

/* ---------- termíny ---------- */
function t5DeadlinesHtml() {
  const today = todayIso();
  const all = effDeadlines(today);
  if (!all.length) return `<div class="card">${emptyState('Žádné termíny', 'Termíny vzniknou u opatření s procesním časem a u ověření účinnosti (po dokončení opatření).')}</div>`;
  const groups = [
    ['Po termínu', x => x.late],
    ['Do 7 dní', x => !x.late && x.date <= addDays(today, 7)],
    ['Později', x => x.date > addDays(today, 7)],
  ];
  return groups.map(([title, fn]) => {
    const items = all.filter(fn);
    if (!items.length) return '';
    return `<div class="t5-dl-group"><p class="eyebrow">${title} · ${items.length}</p><div class="table-card"><table class="stack"><thead><tr><th>Termín</th><th>Případ</th><th>Co</th><th>Odpovídá</th></tr></thead><tbody>${items.map(x => {
      const c = effCase(x.case);
      return `<tr class="t5-row" data-t5open="${esc(x.case)}" tabindex="0"><td class="num${x.late ? ' pen' : ''}" data-label="Termín"><b>${esc(dayText(x.date))}</b></td>
        <td data-label="Případ"><b>${esc(caseLabel(c))}</b> <span class="muted small">${esc(c.ean)}${c.name ? ` · ${esc(c.name)}` : ''}</span></td>
        <td data-label="Co">${x.kind === 'v1' || x.kind === 'v2' ? `<span class="t5-state s-${x.kind}">${esc(x.text)}</span>` : `${esc(x.text)} <span class="muted small">(${esc(T5_KIND[x.kind] || '')})</span>`}</td>
        <td data-label="Odpovídá">${esc(x.owner || '—')}</td></tr>`;
    }).join('')}</tbody></table></div></div>`;
  }).join('');
}

/* ---------- vydané reporty ---------- */
function t5ReportsHtml() {
  const list = S.eff.reports.slice().sort((a, b) => (a.week < b.week ? 1 : -1));
  if (!list.length) return `<div class="card">${emptyState('Zatím žádný vydaný report', 'Report vznikne tlačítkem „Report týdne do PDF“ v záložce Týden. Uloží se přesně tak, jak byl vydán, a jde kdykoli znovu stáhnout.')}</div>`;
  return `<div class="table-card"><table class="stack"><thead><tr><th>Týden</th><th class="r">Revize</th><th>Vydáno</th><th>Kdo</th><th class="r">Položek</th><th class="r">PDF</th></tr></thead><tbody>${list.map(r => `<tr>
      <td class="name" data-label="Týden"><b>${esc(weekName(r.week))}</b> <span class="muted small">${esc(weekRange(weekById(r.week)))}</span></td>
      <td class="r num" data-label="Revize">${r.rev}</td><td class="num" data-label="Vydáno">${esc(tsText(r.at))}</td><td data-label="Kdo">${esc(r.by || '—')}</td>
      <td class="r num" data-label="Položek">${r.data.top.length}</td>
      <td class="actions" data-label="PDF"><button class="btn sec small" type="button" data-t5pdf="rep" data-week="${esc(r.week)}">Stáhnout PDF</button></td></tr>`).join('')}</tbody></table></div>
    <p class="hint">Vydaný report je uložený snímek: stejné PDF jde stáhnout i později, když se mezitím případy posunuly. Nové vydání téhož týdne s jiným obsahem zvýší číslo revize.</p>`;
}

/* ---------- detail případu ---------- */
function weekChart(c, weeks) {
  const W = 340, H = 168, L = 34, R = 8, T = 16, B = 24;
  const vals = weeks.map(w => w.eff);
  if (!vals.some(v => v != null)) return `<figure class="chart c-acc"><figcaption><b>Plnění normy po týdnech</b><span>bez údajů</span></figcaption><div class="chart-empty">Položka se v posledních týdnech nevyráběla.</div></figure>`;
  const target = effSet().target;
  const top = Math.max(110, niceMax(Math.max(...vals.filter(v => v != null)) * 1.08));
  const plotH = H - T - B;
  const band = (W - L - R) / weeks.length;
  const bw = Math.max(3, Math.min(22, band - 6));
  const y = v => T + plotH - (Math.min(v, top) / top) * plotH;
  const base = T + plotH;
  const bars = weeks.map((w, i) => {
    const v = w.eff;
    const x = L + i * band + (band - bw) / 2;
    let mark = '';
    if (v != null && v > 0) {
      const yy = y(v);
      const r = Math.min(4, bw / 2, base - yy);
      mark = `<path class="bar${v < target ? ' under' : ''}" d="M${x.toFixed(1)} ${base}V${(yy + r).toFixed(1)}Q${x.toFixed(1)} ${yy.toFixed(1)} ${(x + r).toFixed(1)} ${yy.toFixed(1)}H${(x + bw - r).toFixed(1)}Q${(x + bw).toFixed(1)} ${yy.toFixed(1)} ${(x + bw).toFixed(1)} ${(yy + r).toFixed(1)}V${base}Z"/>`;
    }
    const label = `<text class="xl" x="${(L + i * band + band / 2).toFixed(1)}" y="${H - 8}">${esc(`T${weekById(w.week).w}`)}</text>`;
    const tip = `${weekName(w.week)} (${weekRange(weekById(w.week))}): ${v == null ? 'bez výroby' : `plnění ${nf(v, 1)} %, ${hrs(w.nspent)} práce`}`;
    const hit = `<rect class="hit" x="${(L + i * band).toFixed(1)}" y="${T}" width="${band.toFixed(1)}" height="${plotH}" tabindex="0" data-tip="${esc(tip)}"/>`;
    return mark + label + hit;
  }).join('');
  const lines = [[0, ''], [100, '100 %'], [target, `cíl ${target} %`]].filter(([v]) => v <= top).map(([v, t], i) => `<line class="${i === 2 ? 'ref t5-target' : i === 1 ? 'ref' : 'grid'}" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>${t ? `<text class="yl" x="${L - 6}" y="${(y(v) + 3.5).toFixed(1)}">${esc(i === 2 ? `${target}` : '100')}</text>` : ''}`).join('');
  return `<figure class="chart c-acc t5-chart"><figcaption><b>Plnění normy po týdnech</b><span>čára 100 % = norma, čárkovaně cíl ${target} %</span></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Plnění normy po týdnech">${lines}${bars}</svg></figure>`;
}

function t5VerifyHtml(c, r, idx, editable) {
  const plan = roundPlan(r);
  const v = r.v[idx];
  const title = idx ? '2. ověření' : '1. ověření';
  const rule = idx ? `${r.d2} dní po 1. ověření` : `${r.d1} dní po dokončení opatření`;
  if (v) {
    const measured = v.eff == null ? `Bez hodnot za období ${esc(dayText(v.from, false))}–${esc(dayText(v.to))}.` : `Plnění <b>${nf(v.eff, 1)} %</b> (${hrs(v.nspent)} práce, norma ${hrs(v.norm)}) za ${esc(dayText(v.from, false))}–${esc(dayText(v.to))}${v.src === 'manual' ? ', zapsáno ručně' : v.src === 'import' ? ', z evidence práce' : ''}.`;
    const lastOne = editable && idx === r.v.length - 1;
    return `<div class="t5-vcard done ${v.result}"><div class="t5-vhead"><b>${title}</b><span class="t5-state s-${v.result === 'ok' ? 'ok' : 'fail'}">${v.result === 'ok' ? 'Účinné' : 'Neúčinné'}</span></div>
      <p class="small">Provedeno <b>${esc(dayText(v.done))}</b>${v.plan ? ` (plán ${esc(dayText(v.plan))})` : ''} · ${esc(v.by || 'neznámá kartička')}</p>
      <p class="small">${measured}</p>${v.note ? `<p class="small t5-quote">${esc(v.note)}</p>` : ''}
      ${lastOne ? `<button class="link small" type="button" data-verundo="${idx}">Zrušit záznam ověření</button>` : ''}</div>`;
  }
  const win = verifyWindow(r, idx);
  if (!win) {
    return `<div class="t5-vcard wait"><div class="t5-vhead"><b>${title}</b><span class="muted small">${rule}</span></div>
      <p class="small muted">${idx ? 'Naplánuje se po účinném 1. ověření.' : 'Naplánuje se, až budou splněná všechna opatření.'}</p></div>`;
  }
  const due = idx ? plan.p2 : plan.p1;
  const why = idx ? r.p2why : r.p1why;
  const today = todayIso();
  const live = measureItem(c.ean, win.from, today < due ? today : due);
  const target = effSet().target;
  const tone = live && live.eff != null ? (live.eff >= target ? 's-ok' : 's-fail') : '';
  return `<div class="t5-vcard plan${due < today ? ' late' : ''}"><div class="t5-vhead"><b>${title}</b><span class="t5-state s-v${idx + 1}${due < today ? ' late' : ''}">${due < today ? 'po termínu' : 'plánováno'}</span></div>
    <p class="small">Termín <b>${esc(dayText(due))}</b> (${(idx ? r.p2 : r.p1) ? `posunuto${why ? `: ${esc(why)}` : ''}` : rule}).</p>
    <p class="small">${live ? `Evidence práce od ${esc(dayText(win.from, false))}: plnění <b>${nf(live.eff, 1)} %</b> (${hrs(live.nspent)} práce, ${live.rows} ${live.rows === 1 ? 'záznam' : live.rows <= 4 ? 'záznamy' : 'záznamů'}) <span class="t5-state ${tone}">${live.eff >= target ? `splňuje cíl ${target} %` : `pod cílem ${target} %`}</span>` : `Období ověření začíná ${esc(dayText(win.from))}. Zapiš strávený čas a normu dílu za toto období, plnění se dopočítá.`}</p>
    ${editable ? `<div class="t5-vform">
      <label class="field"><span>Datum ověření</span><input type="date" data-verdate="${idx}" value="${esc(today)}" max="${esc(today)}"></label>
      <label class="field"><span>Strávený čas (${unitLabel()})</span><input type="text" data-verspent="${idx}" inputmode="decimal" maxlength="12" placeholder="${live ? 'z evidence' : '0'}" autocomplete="off"></label>
      <label class="field"><span>Norma (${unitLabel()})</span><input type="text" data-vernorm="${idx}" inputmode="decimal" maxlength="12" placeholder="${live ? 'z evidence' : '0'}" autocomplete="off"></label>
      <p class="small t5-vlive" data-verlive="${idx}" aria-live="polite"></p>
      <label class="field t5-vnote"><span>Poznámka</span><input type="text" data-vernote="${idx}" maxlength="1000" placeholder="co se ověřilo"></label>
      <div class="row gap"><button class="btn small" type="button" data-ver="${idx}" data-res="ok">Účinné</button><button class="btn danger small" type="button" data-ver="${idx}" data-res="fail">Neúčinné</button><button class="btn ghost small" type="button" data-vershift="${idx}">Posunout termín</button></div>
    </div>` : ''}</div>`;
}

/* Ručně zapsané hodnoty ověření v minutách: {spent, norm}, prázdné = z evidence práce. */
function t5VerifyValues(idx) {
  const a = (($(`[data-verspent="${idx}"]`) || {}).value || '').trim();
  const b = (($(`[data-vernorm="${idx}"]`) || {}).value || '').trim();
  if (!a && !b) return {};
  const spent = parseUnit(a), norm = parseUnit(b);
  if (!a || !b) return { error: 'Zapiš strávený čas i normu za období, nebo nech obě pole prázdná.' };
  if (spent == null || norm == null) return { error: `Čas zapiš jako číslo (${unitLabel()}), třeba 13,5 nebo 13:30.` };
  if (!(spent > 0)) return { error: 'Strávený čas musí být větší než nula.' };
  return { spent, norm };
}
function t5VerifyLive(idx) {
  const out = $(`[data-verlive="${idx}"]`);
  if (!out) return;
  const v = t5VerifyValues(idx);
  if (!v.spent) { out.textContent = v.error && !/obě pole/.test(v.error) ? v.error : ''; out.className = 'small t5-vlive'; return; }
  const m = entryMetrics(v);
  const target = effSet().target;
  out.innerHTML = `Plnění za období <b>${nf(m.eff, 1)} %</b> · ${m.eff >= target ? `<span class="t5-state s-ok">splňuje cíl ${target} %</span>` : `<span class="t5-state s-fail">pod cílem ${target} %</span>`}`;
}

function t5ActionsHtml(r, kind, editable) {
  const list = r.actions.filter(a => a.kind === kind);
  const head = kind === 'process'
    ? '<div class="t5-act head"><span></span><span>Opatření</span><span>Odpovídá</span><span>Termín</span><span>Splněno</span><span></span></div>'
    : '<div class="t5-act head now"><span></span><span>Opatření</span><span>Odpovídá</span><span>Splněno</span><span></span></div>';
  const rows = list.map(a => editable ? `<div class="t5-act${kind === 'now' ? ' now' : ''}${a.done ? ' is-done' : ''}" data-act="${esc(a.id)}">
      <label class="t5-check" title="Splněno"><input type="checkbox" data-actdone${a.done ? ' checked' : ''} aria-label="Splněno"><span></span></label>
      <input type="text" data-actf="text" value="${esc(a.text)}" maxlength="1000" placeholder="${kind === 'process' ? 'např. žádost o změnu pohledovosti, přípravek s technologií' : 'např. upínání s dorazem, kontrola prvního kusu'}" aria-label="Opatření">
      <input type="text" data-actf="owner" value="${esc(a.owner)}" maxlength="120" placeholder="kdo" aria-label="Odpovídá">
      ${kind === 'process' ? `<input type="date" data-actf="due" value="${esc(a.due)}" aria-label="Termín">` : ''}
      <input type="date" data-actf="done" value="${esc(a.done)}" aria-label="Splněno dne"${a.done ? '' : ' disabled'}>
      <button class="icon-btn" type="button" data-actdel aria-label="Smazat opatření">${I.x}</button></div>`
    : `<div class="t5-act ro${kind === 'now' ? ' now' : ''}${a.done ? ' is-done' : ''}"><span class="t5-tick">${a.done ? '✓' : '○'}</span><span>${esc(a.text || '—')}</span><span class="muted">${esc(a.owner || '—')}</span>${kind === 'process' ? `<span class="num">${esc(dayText(a.due) || '—')}</span>` : ''}<span class="num">${esc(dayText(a.done) || 'nesplněno')}</span><span></span></div>`).join('');
  return `<div class="t5-acts">${list.length ? head + rows : `<p class="small muted">${editable ? 'Zatím žádné.' : 'Žádné.'}</p>`}</div>
    ${editable ? `<button class="btn sec small" type="button" data-actadd="${kind}">Přidat opatření</button>` : ''}`;
}

function t5RoundHtml(c, r, editable) {
  const cat = `<select data-rf="cat" aria-label="Kategorie příčiny"${editable ? '' : ' disabled'}><option value="">— kategorie příčiny —</option>${EFF_CATS.map(([k, t]) => `<option value="${k}"${r.cat === k ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const text = (f, ph) => (editable
    ? `<textarea data-rf="${f}" rows="3" maxlength="4000" placeholder="${esc(ph)}">${esc(r[f])}</textarea>`
    : `<p class="t5-text">${r[f] ? esc(r[f]) : '<span class="muted">nevyplněno</span>'}</p>`);
  return `<div class="t5-steps">
    ${r.reason ? `<div class="note w"><b>Proč se otevřelo znovu:</b> ${esc(r.reason)}${r.base && r.base.eff != null ? ` <span class="muted">(${esc(weekName(r.week))}: plnění ${nf(r.base.eff, 1)} %)</span>` : ''}</div>` : ''}
    <section class="t5-step"><h4><i>1</i>Proč se to stalo</h4>${cat}${text('cause', 'Příčina nízkého plnění: co se na položce děje, proč je strávený čas vyšší než norma.')}</section>
    <section class="t5-step"><h4><i>2</i>Co s tím jde dělat</h4>${text('options', 'Možná řešení a jejich přínos pro průtok dílů.')}</section>
    <section class="t5-step"><h4><i>3</i>Co jde udělat hned</h4><p class="tiny muted">Okamžitá opatření bez dalších schvalování.</p>${t5ActionsHtml(r, 'now', editable)}</section>
    <section class="t5-step"><h4><i>4</i>Co si vyžádá procesní čas</h4><p class="tiny muted">Opatření, která potřebují čas na zpracování: žádost o změnu pohledovosti, přípravek s technologií, úprava normy…</p>${t5ActionsHtml(r, 'process', editable)}</section>
    <section class="t5-step"><h4><i>5</i>Ověření účinnosti</h4><p class="tiny muted">1. ověření ${r.d1} dní po dokončení všech opatření, 2. ověření ${r.d2} dní po prvním. Plnění za období ověření se počítá ze stráveného času a normy dílu (ručně, nebo z evidence práce).</p>
      <div class="t5-verify">${t5VerifyHtml(c, r, 0, editable)}${t5VerifyHtml(c, r, 1, editable)}</div></section>
  </div>`;
}

function t5CaseHtml(c) {
  const s = caseState(c);
  const r = curRound(c);
  const editable = !['ok', 'fail', 'zrus'].includes(s.k);
  const ba = caseBeforeAfter(c);
  const times = (topHistory()[c.ean] || []).length;
  const lastWeek = effWeeks()[0] || c.week || isoWeek(todayIso()).id;
  const trend = itemTrend(c.ean, lastWeek, 10);
  const wk = weekById(r.week || c.week);
  const workers = wk ? itemWorkers(c.ean, wk.from, wk.to) : [];
  const base = r.base || c.base;
  const banner = s.k === 'fail'
    ? `<div class="note e"><b>Řešení nebylo účinné.</b> Otevři nové kolo a popiš, proč původní opatření nestačila. Předchozí kolo zůstane v historii. <button class="btn small" type="button" data-t5reopen="${esc(c.id)}" data-week="${esc(lastWeek)}">Otevřít nové kolo</button></div>`
    : s.k === 'ok' ? `<div class="note i"><b>Uzavřeno jako účinné ${esc(dayText(s.closed))}.</b> Když se položka vrátí do Top 5, otevři znovu tento případ. <button class="btn sec small" type="button" data-t5reopen="${esc(c.id)}" data-week="${esc(lastWeek)}">Znovu otevřít</button></div>`
      : s.k === 'zrus' ? `<div class="note w"><b>Případ je zrušený</b> (${esc(dayText(todayIso(c.cancelled.at)))}, ${esc(c.cancelled.by || '—')}): ${esc(c.cancelled.reason)} <button class="btn sec small" type="button" data-t5restore>Vrátit zrušení</button></div>` : '';
  const prev = c.rounds.slice(0, -1).reverse();
  return `<button class="btn ghost small back-btn t5-back" type="button" data-t5back>${I.back}${esc(T5_TABS.find(t => t[0] === ui.t5.tab)[1])}</button>
  <div class="card t5-case-head"><div class="card-head">
      <div><p class="eyebrow">Případ ${esc(caseLabel(c))} · kolo ${r.n}</p><h2>${esc(c.name || c.ean)}</h2>
        <p class="small muted">EAN <b class="t5-ean">${esc(c.ean)}</b> · založeno ${esc(dayText(todayIso(c.at)))}${c.by ? ` (${esc(c.by)})` : ''} · ${c.week ? `zjištěno v ${esc(weekName(c.week))}` : 'založeno ručně'}</p></div>
      <div class="row gap">${stateChip(s)}<button class="btn sec small" type="button" data-t5pdf="case">PDF případu</button>${s.k !== 'zrus' ? '<button class="btn ghost small" type="button" data-t5cancel>Zrušit případ</button>' : ''}</div>
    </div>
    <div class="t5-kpis">
      <div><span>Plnění při zjištění</span><b class="num">${effPct(base ? base.eff : null)}</b></div>
      <div><span>Strávený čas / norma</span><b class="num">${base ? `${hrs(base.nspent)} / ${hrs(base.norm)}` : '—'}</b></div>
      <div><span>Ztráta</span><b class="num">${base ? hrs(Math.max(0, base.nspent - base.norm)) : '—'}</b></div>
      <div><span>V Top 5</span><b class="num">${times}×</b></div>
      <div><span>Po opatřeních</span><b class="num">${ba.after == null ? '—' : effPct(ba.after)}</b></div>
    </div></div>
  ${banner}
  <div class="t5-detail">
    <div class="stack">
      <div class="card"><h3>Kolo ${r.n}${c.rounds.length > 1 ? ` z ${c.rounds.length}` : ''}${editable ? '' : ' <span class="muted small">(uzavřené, jen pro čtení)</span>'}</h3>${t5RoundHtml(c, r, editable)}</div>
      ${prev.length ? `<div class="card"><h3>Předchozí kola</h3><p class="small muted">Co se už zkoušelo, ať se stejné řešení neopakuje.</p>${prev.map(p => `<details class="t5-prev"><summary><b>Kolo ${p.n}</b> · ${esc(dayText(todayIso(p.at)))} · ${p.v.some(v => v.result === 'fail') ? '<span class="t5-state s-fail">neúčinné</span>' : p.v[1] && p.v[1].result === 'ok' ? '<span class="t5-state s-ok">účinné</span>' : '<span class="t5-state">nedokončené</span>'}${p.cat ? ` · ${esc(effCatLabel(p.cat))}` : ''}</summary>${t5RoundHtml(c, p, false)}</details>`).join('')}</div>` : ''}
    </div>
    <div class="stack t5-side">
      <div class="t5-chartwrap" id="t5Charts">${weekChart(c, trend)}<div class="chart-tip" id="t5Tip" hidden></div></div>
      ${workers.length ? `<div class="card"><h3>Kdo na dílu pracoval</h3><p class="tiny muted">${esc(weekLong(wk.id))}, z evidence práce</p><table class="t5-mini"><tbody>${workers.map(w => `<tr><td>${esc(w.name)}</td><td class="r num">${hrs(w.nspent)}</td><td class="r num"><b>${effPct(w.eff)}</b></td></tr>`).join('')}</tbody></table><p class="tiny muted">Když je plnění nízké u všech, je příčina spíš v metodě, normě nebo přípravku; když jen u jednoho, spíš v zaučení.</p></div>` : ''}
      <div class="card"><h3>Historie případu</h3><div class="t5-timeline">${c.log.slice().reverse().map(e => `<div class="t5-tl"><span class="num">${esc(tsText(e.at))}</span><p>${esc(e.t)}</p><small>${esc(e.by || 'neznámá kartička')}</small></div>`).join('') || '<p class="small muted">Zatím nic.</p>'}</div></div>
    </div>
  </div>`;
}

/* ---------- akce ---------- */
function t5Open(id) {
  ui.t5.caseId = id;
  renderTop5();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

async function t5NewCase(ean, weekId) {
  const existing = caseOfItem(ean);
  if (existing) { t5Open(existing.id); return; }
  const c = createCase(ean, weekId, effMeta());
  save();
  toast(`Založen případ ${caseLabel(c)}.`);
  t5Open(c.id);
}

async function t5Reopen(c, weekId) {
  const s = caseState(c);
  const now = weekTop(weekId).items.find(x => x.ean === c.ean);
  const pre = s.k === 'ok' && now ? `Položka je v ${weekName(weekId)} znovu pod normou (plnění ${nf(now.eff, 1)} %), přestože případ byl ${dayText(s.closed)} uzavřen jako účinný.`
    : s.k === 'fail' ? 'Ověření ukázalo, že opatření nestačila: ' : '';
  const reason = await textBox(s.k === 'fail' ? 'Nové kolo případu' : 'Znovu otevřít případ', 'Proč původní řešení nestačilo', pre, 'Otevřít', 'důvod (povinný)');
  if (reason == null) return;
  if (!reason.trim()) { toast('Napiš, proč původní řešení nestačilo.', true); return; }
  reopenCase(c, reason.trim(), now ? weekId : '', effMeta());
  save();
  toast(`${caseLabel(c)}: otevřeno kolo ${c.rounds.length}.`);
  t5Open(c.id);
}

async function t5ManualCase() {
  const known = t5KnownItems();
  const result = await dialog({
    title: 'Nový případ', ok: 'Založit',
    html: `<p class="small muted">Případ se obvykle zakládá z týdenního Top 5. Ručně se hodí pro díl, který dělá problém mimo Top 5.</p>
      <label class="field"><span>EAN nebo kód položky</span><input name="value" list="t5Eans" maxlength="40" required autocomplete="off"></label>
      <datalist id="t5Eans">${Object.entries(known).map(([e, n]) => `<option value="${esc(e)}">${esc(n)}</option>`).join('')}</datalist>`,
    validate: form => (itemKey(form.elements.value.value) ? null : 'Zadej EAN nebo kód položky.'),
  });
  if (result.value !== 'ok') return;
  const ean = itemKey(result.form.elements.value.value);
  const week = effWeeks().find(w => { const m = weekMetrics(ean, w); return m && m.nspent > 0; }) || '';
  if (!(ean in known) && !(await confirmBox('Neznámý díl', `EAN ${ean} není v žádném zápisu Top 5 ani v evidenci práce. Založit případ i tak?`, 'Založit'))) return;
  await t5NewCase(ean, week);
}

async function t5Settings() {
  const st = effSet();
  const result = await dialog({
    title: 'Nastavení Top 5', ok: 'Uložit',
    html: `<div class="form-grid">
        <label class="field"><span>Čas v zápisu Top 5 a v ověření</span><select name="unit"><option value="h"${st.unit !== 'min' ? ' selected' : ''}>v hodinách</option><option value="min"${st.unit === 'min' ? ' selected' : ''}>v minutách</option></select></label>
        <label class="field"><span>Výpočet z evidence práce: min. práce dílu za týden (h)</span><input type="number" name="min" value="${n2(st.min / 60)}" min="0" max="100" step="0.25"></label>
        <label class="field"><span>Cílové plnění pro ověření (%)</span><input type="number" name="target" value="${st.target}" min="1" max="200" step="1"></label>
        <label class="field"><span>1. ověření po dokončení opatření (dní)</span><input type="number" name="d1" value="${st.d1}" min="1" max="365" step="1"></label>
        <label class="field"><span>2. ověření po prvním (dní)</span><input type="number" name="d2" value="${st.d2}" min="1" max="365" step="1"></label>
      </div>
      <p class="tiny muted">Jednotka mění jen zadávání a zobrazení v tabulce, uložené hodnoty zůstanou. Limit práce platí jen pro předvyplnění z evidence práce: vyřadí díly, na kterých se v týdnu dělalo jen chvíli. Lhůty ověření platí pro nově založené případy a kola; rozpracované si nechávají své.</p>`,
  });
  if (result.value !== 'ok') return;
  const f = result.form.elements;
  const val = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? clamp(n, lo, hi) : d; };
  S.eff.settings = { unit: f.unit.value === 'min' ? 'min' : 'h', min: Math.round(val(f.min.value, st.min / 60, 0, 100) * 60), target: Math.round(val(f.target.value, st.target, 1, 200)), d1: Math.round(val(f.d1.value, st.d1, 1, 365)), d2: Math.round(val(f.d2.value, st.d2, 1, 365)) };
  save();
  renderTop5();
  toast('Nastavení Top 5 uloženo.');
}

/* Úpravy v detailu případu: text se ukládá průběžně, do historie jde po dokončení úpravy. */
function t5CaseInput(event) {
  const c = ui.t5.caseId && effCase(ui.t5.caseId);
  if (!c) return;
  const r = curRound(c);
  const t = event.target;
  if (t.dataset.rf === 'cause' || t.dataset.rf === 'options') { r[t.dataset.rf] = t.value.slice(0, 4000); save(); return; }
  const row = t.closest('[data-act]');
  if (row && (t.dataset.actf === 'text' || t.dataset.actf === 'owner')) {
    const a = r.actions.find(x => x.id === row.dataset.act);
    if (a) { a[t.dataset.actf] = t.value.slice(0, t.dataset.actf === 'text' ? 1000 : 120); save(); }
  }
}

function t5CaseChange(event) {
  const c = ui.t5.caseId && effCase(ui.t5.caseId);
  if (!c) return;
  const r = curRound(c);
  const t = event.target;
  const meta = effMeta();
  if (t.dataset.rf === 'cat') { r.cat = t.value; effNote(c, meta, `Kategorie příčiny: ${effCatLabel(r.cat) || 'nevybráno'}`, true); save(); renderTop5(); return; }
  if (t.dataset.rf === 'cause') { effNote(c, meta, `Příčina: ${r.cause.trim() || '(smazáno)'}`.slice(0, 500), true); save(); return; }
  if (t.dataset.rf === 'options') { effNote(c, meta, `Co s tím jde dělat: ${r.options.trim() || '(smazáno)'}`.slice(0, 500), true); save(); return; }
  const row = t.closest('[data-act]');
  if (!row) return;
  const a = r.actions.find(x => x.id === row.dataset.act);
  if (!a) return;
  const label = `${a.kind === 'now' ? 'Okamžité opatření' : 'Opatření s procesním časem'} „${liveText(a) || '…'}“`;
  if (t.dataset.actf === 'text') { if (liveText(a)) effNote(c, meta, `${label}${a.owner ? `, odpovídá ${a.owner}` : ''}`, true); save(); renderTop5(); return; }
  if (t.dataset.actf === 'owner') { effNote(c, meta, `${label}: odpovídá ${a.owner || '—'}`, true); save(); return; }
  if (t.dataset.actf === 'due') { a.due = ISO_DAY.test(t.value) ? t.value : ''; effNote(c, meta, `${label}: termín ${dayText(a.due) || 'bez termínu'}`, true); save(); renderTop5(); return; }
  if (t.dataset.actf === 'done') {
    a.done = ISO_DAY.test(t.value) ? t.value : '';
    effNote(c, meta, a.done ? `${label}: splněno ${dayText(a.done)}` : `${label}: vráceno jako nesplněné`, true);
    save(); renderTop5(); return;
  }
  if ('actdone' in t.dataset) {
    if (t.checked && !liveText(a)) { t.checked = false; toast('Nejdřív napiš, co se udělalo.', true); return; }
    a.done = t.checked ? todayIso() : '';
    effNote(c, meta, a.done ? `${label}: splněno ${dayText(a.done)}` : `${label}: vráceno jako nesplněné`);
    save(); renderTop5();
  }
}

async function t5CaseClick(event) {
  const t = event.target;
  const c = ui.t5.caseId && effCase(ui.t5.caseId);
  if (!c) return false;
  const r = curRound(c);
  const meta = effMeta();
  if (t.closest('[data-t5back]')) { ui.t5.caseId = null; renderTop5(); return true; }
  const add = t.closest('[data-actadd]');
  if (add) {
    const a = { id: uid('a'), kind: add.dataset.actadd === 'process' ? 'process' : 'now', text: '', owner: '', due: '', done: '', note: '' };
    r.actions.push(a);
    save(); renderTop5();
    const input = $(`[data-act="${a.id}"] [data-actf="text"]`);
    if (input) input.focus();
    return true;
  }
  const del = t.closest('[data-actdel]');
  if (del) {
    const row = del.closest('[data-act]');
    const a = r.actions.find(x => x.id === row.dataset.act);
    if (!a) return true;
    if (liveText(a) && !(await confirmBox('Smazat opatření?', `„${liveText(a)}“ zmizí z kola ${r.n}. V historii případu zůstane záznam.`, 'Smazat', true))) return true;
    r.actions = r.actions.filter(x => x !== a);
    if (liveText(a)) effNote(c, meta, `Odebráno opatření „${liveText(a)}“`);
    save(); renderTop5();
    return true;
  }
  const ver = t.closest('[data-ver]');
  if (ver) {
    const idx = +ver.dataset.ver;
    const date = ($(`[data-verdate="${idx}"]`) || {}).value || '';
    const note = (($(`[data-vernote="${idx}"]`) || {}).value || '').trim();
    if (!ISO_DAY.test(date)) { toast('Vyber datum ověření.', true); return true; }
    if (date > todayIso()) { toast('Ověření nemůže být v budoucnosti.', true); return true; }
    const win = verifyWindow(r, idx, date);
    const man = t5VerifyValues(idx);
    if (man.error) { toast(man.error, true); return true; }
    const m = man.spent ? entryMetrics(man) : win && measureItem(c.ean, win.from, date);
    if (win && date < win.from && !man.spent && !(await confirmBox('Ověření hned po opatřeních?', `Plnění se měří až od ${dayText(win.from)}, takže k ověření ${dayText(date)} nejsou žádná data. Zapsat i tak?`, 'Zapsat'))) return true;
    if (win && date >= win.from && !m && !(await confirmBox('Ověření bez hodnot', 'Bez stráveného času a normy za období nejde účinnost doložit čísly. Zapsat ověření jen s poznámkou?', 'Zapsat'))) return true;
    const target = effSet().target;
    if (ver.dataset.res === 'ok' && m && m.eff != null && m.eff < target && !(await confirmBox('Plnění je pod cílem', `Plnění za období je ${nf(m.eff, 1)} %, cíl je ${target} %. Zapsat ověření přesto jako účinné?`, 'Zapsat účinné'))) return true;
    if (ver.dataset.res === 'fail' && !(await confirmBox('Neúčinné ověření', `Kolo ${r.n} se tím uzavře jako neúčinné. Pak otevřeš nové kolo a popíšeš, proč řešení nestačilo.`, 'Zapsat neúčinné', true))) return true;
    try { recordVerify(c, idx, date, ver.dataset.res, note, meta, man.spent ? man : null); } catch (error) { toast(error.message, true); return true; }
    save(); renderTop5();
    toast(ver.dataset.res === 'ok' ? (idx ? `${caseLabel(c)} uzavřen jako účinný.` : `1. ověření zapsáno, 2. ověření je ${dayText(roundPlan(r).p2)}.`) : `${caseLabel(c)}: neúčinné, otevři nové kolo.`);
    return true;
  }
  const undo = t.closest('[data-verundo]');
  if (undo) {
    const idx = +undo.dataset.verundo;
    if (!(await confirmBox('Zrušit záznam ověření?', 'Záznam zmizí z kola a ověření bude znovu naplánované. V historii případu zůstane, že byl zrušen.', 'Zrušit záznam', true))) return true;
    undoVerify(c, idx, meta);
    save(); renderTop5();
    return true;
  }
  const shift = t.closest('[data-vershift]');
  if (shift) {
    const idx = +shift.dataset.vershift;
    const plan = roundPlan(r);
    const result = await dialog({
      title: `Posunout ${idx ? '2.' : '1.'} ověření`, ok: 'Posunout',
      html: `<label class="field"><span>Nový termín</span><input type="date" name="date" value="${esc(idx ? plan.p2 : plan.p1)}" required></label>
        <label class="field"><span>Důvod</span><input name="value" maxlength="300" required placeholder="např. položka se ve výrobě objeví až v listopadu"></label>`,
      validate: form => (!ISO_DAY.test(form.elements.date.value) ? 'Vyber datum.' : !form.elements.value.value.trim() ? 'Napiš důvod posunu.' : null),
    });
    if (result.value !== 'ok') return true;
    const date = result.form.elements.date.value;
    const why = result.form.elements.value.value.trim();
    if (idx) { r.p2 = date; r.p2why = why; } else { r.p1 = date; r.p1why = why; }
    effNote(c, meta, `Termín ${idx ? '2.' : '1.'} ověření posunut na ${dayText(date)}: ${why}`);
    save(); renderTop5();
    return true;
  }
  if (t.closest('[data-t5cancel]')) {
    const reason = await textBox('Zrušit případ', 'Důvod zrušení', '', 'Zrušit případ', 'např. chyba v evidenci, duplicitní případ', 500);
    if (reason == null) return true;
    if (!reason.trim()) { toast('Napiš důvod zrušení.', true); return true; }
    cancelCase(c, reason.trim(), meta);
    save(); renderTop5();
    return true;
  }
  if (t.closest('[data-t5restore]')) { restoreCase(c, meta); save(); renderTop5(); return true; }
  return false;
}

function bindTop5Events() {
  $('#t5Tabs').addEventListener('click', event => {
    const b = event.target.closest('[data-t5tab]');
    if (!b) return;
    ui.t5.tab = b.dataset.t5tab;
    ui.t5.caseId = null;
    renderTop5();
  });
  $('#t5Settings').onclick = t5Settings;
  $('#t5SummaryPdf').onclick = () => exportEffSummaryPdf();
  const view = $('#t5View');
  view.addEventListener('pointerdown', () => { t5PointerDown = true; });
  document.addEventListener('pointerup', () => { t5PointerDown = false; }, true);
  view.addEventListener('click', async event => {
    const t = event.target;
    const pdf = t.closest('[data-t5pdf]');
    if (pdf) {
      if (pdf.dataset.t5pdf === 'week') exportWeekPdf(ui.t5.week, pdf);
      else if (pdf.dataset.t5pdf === 'rep') exportIssuedPdf(pdf.dataset.week, pdf);
      else if (pdf.dataset.t5pdf === 'case') exportEffSummaryPdf(ui.t5.caseId, pdf);
      return;
    }
    if (await t5CaseClick(event)) return;
    if (await t5EntryClick(event)) return;
    const wk = t.closest('[data-t5wk]');
    if (wk) {
      const next = shiftWeek(ui.t5.week, wk.dataset.t5wk === 'older' ? -1 : 1);
      if (next <= isoWeek(todayIso()).id) { ui.t5.week = next; renderTop5(); }
      return;
    }
    const nw = t.closest('[data-t5new]');
    if (nw) { t5NewCase(nw.dataset.t5new, nw.dataset.week); return; }
    const ro = t.closest('[data-t5reopen]');
    if (ro) { const c = effCase(ro.dataset.t5reopen); if (c) t5Reopen(c, ro.dataset.week); return; }
    const filter = t.closest('[data-t5filter]');
    if (filter) { ui.t5.filter = filter.dataset.t5filter; renderTop5(); return; }
    if (t.closest('[data-t5manual]')) { t5ManualCase(); return; }
    const open = t.closest('[data-t5open]');
    if (open && !t.closest('button:not([data-t5open]), a, input, select, textarea')) t5Open(open.dataset.t5open);
  });
  view.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('tr[data-t5open]')) { event.preventDefault(); t5Open(event.target.dataset.t5open); }
  });
  view.addEventListener('change', event => {
    if (event.target.id === 't5WeekSel') { ui.t5.week = event.target.value; renderTop5(); return; }
    if (t5EntryChange(event)) return;
    t5CaseChange(event);
  });
  view.addEventListener('input', event => {
    if (event.target.id === 't5Q') {
      ui.t5.q = event.target.value;
      const pos = event.target.selectionStart;
      renderTop5();
      const q = $('#t5Q');
      if (q) { q.focus(); q.setSelectionRange(pos, pos); }
      return;
    }
    const vi = event.target.dataset.verspent || event.target.dataset.vernorm;
    if (vi != null) { t5VerifyLive(vi); return; }
    t5CaseInput(event);
  });
  // Tooltip grafu (myš i klávesnice), stejně jako v profilu.
  const showTip = hit => {
    const tip = $('#t5Tip');
    const wrap = $('#t5Charts');
    if (!tip || !wrap) return;
    tip.textContent = hit.dataset.tip;
    tip.hidden = false;
    const a = hit.getBoundingClientRect();
    const b = wrap.getBoundingClientRect();
    tip.style.left = `${clamp(a.left - b.left + a.width / 2 - tip.offsetWidth / 2, 0, Math.max(0, b.width - tip.offsetWidth))}px`;
    tip.style.top = `${Math.max(0, a.top - b.top - tip.offsetHeight - 6)}px`;
    $$('.chart .hit.on', wrap).forEach(x => x.classList.remove('on'));
    hit.classList.add('on');
  };
  const hideTip = () => {
    const tip = $('#t5Tip');
    if (tip) tip.hidden = true;
    $$('#t5Charts .hit.on').forEach(x => x.classList.remove('on'));
  };
  view.addEventListener('pointerover', event => { const hit = event.target.closest('.chart .hit'); if (hit) showTip(hit); });
  view.addEventListener('pointerout', event => { if (event.target.closest('.chart .hit')) hideTip(); });
  view.addEventListener('focusin', event => { const hit = event.target.closest('.chart .hit'); if (hit) showTip(hit); });
  view.addEventListener('focusout', event => { if (event.target.closest('.chart .hit')) hideTip(); });
}

/* ==========================================================================
   TOP 5: PDF pro auditora (týdenní report, souhrn, jeden případ)
   Vzniká v prohlížeči z dešifrovaných dat, server obsah nevidí.
   ========================================================================== */
async function newPdf() {
  if (!window.jspdf) await OdmLock.loadScript(`app.php?f=jspdf.js&v=${document.body.dataset.privateVersion || '1'}`);
  const [regular, semibold] = await Promise.all([pdfAsset('pdf-regular.ttf'), pdfAsset('pdf-semibold.ttf')]);
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('Plex-Regular.ttf', regular);
  doc.addFont('Plex-Regular.ttf', 'Plex', 'normal');
  doc.addFileToVFS('Plex-SemiBold.ttf', semibold);
  doc.addFont('Plex-SemiBold.ttf', 'Plex', 'bold');
  return doc;
}

/** Sada kreslicích funkcí nad jsPDF. k.dry = jen měří výšku (bez kreslení a bez zalomení stránky). */
function pdfKit(doc) {
  const k = { doc, W: 210, H: 297, M: 16, y: 16, dry: false, onPage: null };
  k.CW = k.W - 2 * k.M;
  k.BOTTOM = k.H - 20;
  k.PAGE = k.BOTTOM - k.M;
  const C = k.C = {
    ink: [27, 31, 29], ink2: [85, 92, 88], ink3: [133, 139, 134], line: [222, 221, 212], line2: [198, 196, 184],
    soft: [243, 242, 236], soft3: [232, 230, 221], acc: [14, 107, 93], accSoft: [220, 235, 230], white: [255, 255, 255],
    good: [46, 125, 70], goodSoft: [223, 238, 227], warn: [156, 106, 18], warnSoft: [244, 234, 212],
    crit: [176, 57, 43], critSoft: [246, 225, 221], wk: [106, 87, 166], wkSoft: [232, 227, 244],
  };
  k.TONE = { new: [C.warnSoft, C.warn], act: [C.accSoft, C.acc], v1: [C.wkSoft, C.wk], v2: [C.wkSoft, C.wk], ok: [C.goodSoft, C.good],
    fail: [C.critSoft, C.crit], late: [C.critSoft, C.crit], zrus: [C.soft3, C.ink3], none: [C.warnSoft, C.warn], plain: [C.soft3, C.ink2] };
  const mm = pt => pt * 0.3528;
  k.mm = mm;
  k.LH = (size, f = 1.32) => mm(size) * f;
  k.font = (size, bold = false, color = C.ink) => { doc.setFont('Plex', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color); };
  k.text = (s, x, top, size, o = {}) => { if (k.dry) return; k.font(size, o.bold, o.color || C.ink); doc.text(String(s), x, top + mm(size) * 0.92, { align: o.align || 'left', charSpace: o.space || 0 }); };
  k.mid = (s, x, cy, size, o = {}) => { if (k.dry) return; k.font(size, o.bold, o.color || C.ink); doc.text(String(s), x, cy + mm(size) * 0.35, { align: o.align || 'left' }); };
  k.split = (s, w, size, bold = false) => { k.font(size, bold); const t = String(s == null ? '' : s).replace(/\s+\n/g, '\n'); return t ? doc.splitTextToSize(t, w) : ['']; };
  k.width = (s, size, bold = false) => { k.font(size, bold); return doc.getTextWidth(String(s)); };
  k.box = (color, x, top, w, h, r = 0) => {
    if (k.dry || w <= 0 || h <= 0) return;
    doc.setFillColor(...color);
    if (r) doc.roundedRect(x, top, w, h, Math.min(r, w / 2, h / 2), Math.min(r, w / 2, h / 2), 'F');
    else doc.rect(x, top, w, h, 'F');
  };
  k.hline = (at, color = C.line, lw = 0.2, x1 = k.M, x2 = k.M + k.CW, dash = null) => {
    if (k.dry) return;
    doc.setDrawColor(...color); doc.setLineWidth(lw);
    if (dash) doc.setLineDashPattern(dash, 0);
    doc.line(x1, at, x2, at);
    if (dash) doc.setLineDashPattern([], 0);
  };
  /** Štítek stavu; vrací šířku. */
  k.pill = (label, x, cy, tone, size = 7.4, align = 'left') => {
    const [bg, fg] = k.TONE[tone] || k.TONE.plain;
    const w = k.width(label, size, true) + 4.4;
    const x0 = align === 'right' ? x - w : x;
    k.box(bg, x0, cy - 2.3, w, 4.6, 2.3);
    k.mid(label, x0 + 2.2, cy, size, { bold: true, color: fg });
    return w;
  };
  /** Zaškrtávací políčko: splněno = zelené se značkou, po termínu = červený rámeček. */
  k.check = (x, cy, done, late) => {
    if (k.dry) return;
    const s = 3.1;
    if (done) {
      doc.setFillColor(...C.good); doc.roundedRect(x, cy - s / 2, s, s, 0.6, 0.6, 'F');
      doc.setDrawColor(...C.white); doc.setLineWidth(0.45);
      doc.line(x + 0.7, cy + 0.05, x + 1.3, cy + 0.7); doc.line(x + 1.3, cy + 0.7, x + 2.45, cy - 0.75);
    } else {
      doc.setDrawColor(...(late ? C.crit : C.line2)); doc.setLineWidth(0.35);
      doc.roundedRect(x, cy - s / 2, s, s, 0.6, 0.6, 'S');
    }
  };
  k.dot = (x, cy, r, fill, stroke) => {
    if (k.dry) return;
    if (fill) doc.setFillColor(...fill);
    if (stroke) { doc.setDrawColor(...stroke); doc.setLineWidth(0.45); }
    doc.circle(x, cy, r, fill && stroke ? 'FD' : fill ? 'F' : 'S');
  };
  k.newPage = () => { doc.addPage(); k.y = k.M; if (k.onPage) k.onPage(); };
  k.need = h => { if (k.dry) return false; if (k.y + h > k.BOTTOM) { k.newPage(); return true; } return false; };
  k.measure = fn => { const y = k.y; const was = k.dry; k.dry = true; k.y = 0; fn(); const h = k.y; k.y = y; k.dry = was; return h; };
  /** Blok se nerozdělí, když se vejde na stránku; jinak začne na nové, pokud zbývá málo místa. */
  k.keep = (fn, min = 40) => {
    const h = k.measure(fn);
    if (k.y + h > k.BOTTOM && (h <= k.PAGE || k.BOTTOM - k.y < min)) k.newPage();
    fn();
  };
  /** Odstavec s řádkovým zalomením přes stránky. */
  k.para = (s, x, w, size, o = {}) => {
    const lines = k.split(s, w, size, o.bold);
    const lh = k.LH(size, o.lh || 1.38);
    lines.forEach(line => { k.need(lh); k.text(line, x, k.y, size, o); k.y += lh; });
  };
  k.header = ({ eyebrow, plain = false, right, title, sub, meta }) => {
    // plain: nadpis nad titulkem normálním písmem, bez prostrkání (Top 5)
    k.text(eyebrow, k.M, k.y, plain ? 9 : 7.5, { bold: true, color: C.acc, space: plain ? 0 : 0.35 });
    if (right) k.text(right, k.M + k.CW, k.y, 8.5, { color: C.ink2, align: 'right' });
    k.y += 7.5;
    k.split(title, k.CW, 20, true).forEach(line => { k.text(line, k.M, k.y, 20, { bold: true }); k.y += mm(20) * 1.2; });
    k.y += 1;
    if (sub) { k.text(sub, k.M, k.y, 11.5, { bold: true, color: C.ink2 }); k.y += mm(11.5) * 1.5; }
    if (meta) { k.para(meta, k.M, k.CW * 0.85, 9, { color: C.ink2 }); }
    k.y += 2.5;
    if (!k.dry) { doc.setDrawColor(...C.acc); doc.setLineWidth(0.7); doc.line(k.M, k.y, k.M + 28, k.y); }
    k.y += 7;
  };
  k.tiles = list => {
    const gap = 4, n = list.length, tw = (k.CW - gap * (n - 1)) / n, th = 20;
    list.forEach(([label, value, note, tone], i) => {
      const x = k.M + i * (tw + gap);
      k.box(C.soft, x, k.y, tw, th, 2.4);
      if (tone) k.box(tone === 'crit' ? C.crit : tone === 'good' ? C.good : C.acc, x, k.y + 3, 0.9, th - 6);
      k.text(label, x + 4, k.y + 3.2, 7.8, { color: C.ink2 });
      k.text(value, x + 4, k.y + 7.4, 15, { bold: true, color: tone === 'crit' ? C.crit : C.ink });
      if (note) k.text(k.split(note, tw - 7, 7)[0], x + 4, k.y + 14.4, 7, { color: C.ink3 });
    });
    k.y += th + 7;
  };
  k.heading = (t, size = 12.5) => { k.text(t, k.M, k.y, size, { bold: true }); k.y += mm(size) * 1.25 + 2.4; };
  k.signoff = () => {
    const sw = (k.CW - 12) / 3;
    ['Zpracovatel', 'Datum', 'Podpis'].forEach((label, i) => {
      const x = k.M + i * (sw + 6);
      k.hline(k.y + 10, C.line2, 0.3, x, x + sw);
      k.text(label, x, k.y + 11.6, 8, { color: C.ink3 });
    });
    k.y += 22;
  };
  k.footer = left => {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i += 1) {
      doc.setPage(i);
      doc.setDrawColor(...C.line); doc.setLineWidth(0.2); doc.line(k.M, k.H - 13.5, k.M + k.CW, k.H - 13.5);
      k.font(7.5, false, C.ink3);
      doc.text(left, k.M, k.H - 11.5 + mm(7.5) * 0.92);
      doc.text(`Strana ${i} / ${pages}`, k.M + k.CW, k.H - 11.5 + mm(7.5) * 0.92, { align: 'right' });
    }
  };
  return k;
}

const pdfH = min => `${nf((+min || 0) / 60, 1)} h`;
const pdfPct = v => (v == null ? '—' : `${nf(v, 1)} %`);
function lidiW(n) { return n === 1 ? 'pracovník' : n >= 2 && n <= 4 ? 'pracovníci' : 'pracovníků'; }

/* ---------- společné části: pole, opatření, ověření, kolo ---------- */
const PDF_LX = 42; // šířka sloupce popisků

function pdfLabel(k, label) { k.text(label, k.M, k.y + 0.4, 7.8, { bold: true, color: k.C.ink2 }); }

function pdfField(k, label, text, o = {}) {
  const lines = k.split(text, k.CW - PDF_LX, 9, o.bold);
  const lh = k.LH(9, 1.36);
  k.need(lh + 1);
  pdfLabel(k, label);
  lines.forEach((line, i) => { if (i) k.need(lh); k.text(line, k.M + PDF_LX, k.y, 9, { color: o.color || k.C.ink, bold: o.bold }); k.y += lh; });
  k.y += 2.2;
}

function pdfActions(k, label, actions, kind, today) {
  const X = k.M + PDF_LX;
  const W = k.CW - PDF_LX;
  const cols = kind === 'process' ? [5, W - 5 - 30 - 21 - 25, 30, 21, 25] : [5, W - 5 - 30 - 25, 30, 25];
  const lh = k.LH(8.8, 1.32);
  if (!actions.length) { pdfField(k, label, 'žádná', { color: k.C.ink3 }); return; }
  k.need(lh * 2 + 5);
  pdfLabel(k, label);
  const heads = kind === 'process' ? ['', 'Opatření', 'Odpovídá', 'Termín', 'Stav'] : ['', 'Opatření', 'Odpovídá', 'Stav'];
  let x = X;
  heads.forEach((t, i) => { if (t) k.text(t, x, k.y, 6.8, { bold: true, color: k.C.ink3 }); x += cols[i]; });
  k.y += 3.8;
  actions.forEach(a => {
    const late = !a.done && a.due && a.due < today;
    const tl = k.split(a.text, cols[1] - 2, 8.8);
    const ol = k.split(a.owner || '—', cols[2] - 2, 8.2);
    const h = Math.max(tl.length, ol.length) * lh + 1.8;
    k.need(h);
    k.check(X + 0.4, k.y + lh / 2 - 0.15, !!a.done, late);
    tl.forEach((line, i) => k.text(line, X + cols[0], k.y + i * lh, 8.8));
    let xx = X + cols[0] + cols[1];
    ol.forEach((line, i) => k.text(line, xx, k.y + i * lh, 8.2, { color: k.C.ink2 }));
    xx += cols[2];
    if (kind === 'process') { k.text(a.due ? dayText(a.due) : '—', xx, k.y, 8.2, { color: late ? k.C.crit : k.C.ink2, bold: !!late }); xx += cols[3]; }
    k.text(a.done ? `splněno ${dayText(a.done)}` : late ? 'po termínu' : 'otevřené', xx, k.y, 8.2, { color: a.done ? k.C.good : late ? k.C.crit : k.C.ink3, bold: !a.done && !!late });
    k.y += h;
  });
  k.y += 1.4;
}

function pdfVerify(k, r, today) {
  const p = roundPlan(r);
  const lh = k.LH(8.8, 1.34);
  const rows = [0, 1].map(idx => {
    const v = r.v[idx];
    const rule = idx ? `${r.d2} dní po 1. ověření` : `${r.d1} dní po dokončení opatření`;
    if (v) {
      const measured = v.eff == null ? `bez hodnot za ${dayText(v.from, false)}–${dayText(v.to)}` : `plnění ${nf(v.eff, 1)} % (strávený čas ${pdfH(v.nspent)}, norma ${pdfH(v.norm)}) za ${dayText(v.from, false)}–${dayText(v.to)}${v.src === 'manual' ? ', zapsáno ručně' : v.src === 'import' ? ', z evidence práce' : ''}`;
      return { tone: v.result === 'ok' ? 'ok' : 'fail', tag: v.result === 'ok' ? 'účinné' : 'neúčinné', text: `${idx + 1}. ověření ${dayText(v.done)}${v.plan && v.plan !== v.done ? ` (plán ${dayText(v.plan)})` : ''}: ${measured}${v.note ? `. ${v.note}` : ''}${v.by ? ` · ${v.by}` : ''}` };
    }
    const due = idx ? p.p2 : p.p1;
    const why = idx ? r.p2why : r.p1why;
    if (due) return { tone: due < today ? 'late' : idx ? 'v2' : 'v1', tag: due < today ? 'po termínu' : 'plánováno', text: `${idx + 1}. ověření ${dayText(due)} (${(idx ? r.p2 : r.p1) ? `posunuto${why ? `: ${why}` : ''}` : rule})` };
    return { tone: 'plain', tag: 'čeká', text: `${idx + 1}. ověření se naplánuje ${idx ? 'po účinném 1. ověření' : 'po dokončení všech opatření'} (${rule})` };
  });
  k.need(lh * 2 + 4);
  pdfLabel(k, 'Ověření účinnosti');
  rows.forEach(row => {
    const tw = k.width(row.tag, 7.2, true) + 4.4;
    const lines = k.split(row.text, k.CW - PDF_LX - tw - 3, 8.8);
    k.need(lines.length * lh + 1.4);
    k.pill(row.tag, k.M + PDF_LX, k.y + lh / 2 - 0.1, row.tone, 7.2);
    lines.forEach((line, i) => k.text(line, k.M + PDF_LX + tw + 3, k.y + i * lh, 8.8));
    k.y += lines.length * lh + 1.4;
  });
  k.y += 1.6;
}

function pdfRound(k, c, r, today) {
  const acts = liveActions(r);
  if (r.reason) pdfField(k, 'Proč znovu', r.reason, { color: k.C.warn });
  pdfField(k, 'Proč se to stalo', `${r.cat ? `${effCatLabel(r.cat)}: ` : ''}${r.cause || 'nevyplněno'}`, { color: r.cause ? k.C.ink : k.C.ink3 });
  pdfField(k, 'Co s tím jde dělat', r.options || 'nevyplněno', { color: r.options ? k.C.ink : k.C.ink3 });
  pdfActions(k, 'Co jde udělat hned', acts.filter(a => a.kind === 'now'), 'now', today);
  pdfActions(k, 'Procesní čas', acts.filter(a => a.kind === 'process'), 'process', today);
  pdfVerify(k, r, today);
}

/** Stručné shrnutí uzavřeného kola (do týdenního reportu). */
function roundBrief(r) {
  const acts = liveActions(r);
  const v = r.v.map((x, i) => `${i + 1}. ověření ${dayText(x.done)} ${x.result === 'ok' ? 'účinné' : 'neúčinné'}${x.eff != null ? ` (${nf(x.eff, 1)} %)` : ''}`);
  return `Kolo ${r.n} (od ${dayText(todayIso(r.at))}): ${r.cat ? `${effCatLabel(r.cat)}: ` : ''}${(r.cause || 'příčina nevyplněna').trim().replace(/[.\s]+$/, '')}. Opatření: ${acts.length ? acts.map(a => a.text).join('; ') : 'žádná'}. ${v.length ? `${v.join(', ')}.` : 'Bez ověření.'}`;
}

function pdfBand(k, left, right, tone, h = 10.5) {
  k.box(k.C.soft, k.M, k.y, k.CW, h);
  k.box(k.C.acc, k.M, k.y, 1.3, h);
  const rw = right ? k.width(right, 7.4, true) + 4.4 : 0;
  const lines = k.split(left, k.CW - rw - 12, 11, true).slice(0, 2);
  lines.forEach((line, i) => k.mid(line, k.M + 5, k.y + h / 2 + (i - (lines.length - 1) / 2) * k.LH(11, 1.15), 11, { bold: true }));
  if (right) k.pill(right, k.M + k.CW - 3.5, k.y + h / 2, tone, 7.4, 'right');
  k.y += h + 3;
}

const T5_EYEBROW = 'Top 5 nejméně efektivně';

/* ---------- týdenní report ---------- */
function drawWeekReport(doc, rep) {
  const k = pdfKit(doc);
  const d = rep.data;
  const today = todayIso(rep.at);
  const w = weekById(rep.week);
  const cases = new Map(d.cases.map(c => [c.id, c]));
  const sum = d.summary || {};
  k.header({ eyebrow: T5_EYEBROW, plain: true, right: `Revize ${rep.rev}`,
    title: 'Týdenní report', sub: weekLong(rep.week),
    meta: `Vydáno ${tsText(rep.at)}${rep.by ? ` · ${rep.by}` : ''}. ${d.src === 'import'
      ? `Hodnoty z evidence práce (jen řádky s časem i normou), díly pod 100 % s aspoň ${nf(d.settings.min / 60, 2)} h práce v týdnu; pod normou ${d.under} z ${d.items} dílů.`
      : 'Strávený čas a norma dílu za týden podle zápisu vedoucího.'} Plnění = norma ÷ strávený čas, neplnění = 100 % − plnění, ztráta = strávený čas nad normou. Pořadí od nejnižšího plnění.` });
  const worst = d.top[0];
  k.tiles([
    ['Plnění Top 5', pdfPct(d.tot.eff), `norma ${pdfH(d.tot.norm)} z ${pdfH(d.tot.nspent)} práce`],
    ['Nejhorší plnění', worst ? pdfPct(worst.eff) : '—', worst ? `EAN ${worst.ean}` : 'nic zapsáno', worst && worst.eff < 50 ? 'crit' : ''],
    ['Ztráta Top 5', pdfH(d.tot.lost), 'strávený čas nad normou', d.tot.lost ? 'crit' : ''],
    ['Rozpracované případy', String((sum.open || 0) + (sum.verify || 0) + (sum.fail || 0)), sum.late ? `${sum.late} po termínu` : 'nic po termínu', sum.late ? 'crit' : ''],
  ]);

  // Pořadí týdne
  k.heading('Pořadí týdne');
  const cols = [[7, '#', 'r'], [47, 'Díl'], [31, 'Plnění normy'], [15, 'Neplnění', 'r'], [17, 'Strávený čas', 'r'], [14, 'Norma', 'r'], [14, 'Ztráta', 'r'], [12, 'V Top 5', 'r'], [21, 'Případ']];
  const head = () => {
    let x = k.M;
    cols.forEach(([cw, t, al]) => { k.text(t, al === 'r' ? x + cw - 1.5 : x, k.y, 7.2, { bold: true, color: k.C.ink2, align: al === 'r' ? 'right' : 'left' }); x += cw; });
    k.y += 4.6;
    k.hline(k.y, k.C.line2, 0.3);
  };
  head();
  if (!d.top.length) { k.y += 2; k.text(`V ${weekName(rep.week)} není zapsaný žádný díl pod normou.`, k.M, k.y, 9, { color: k.C.ink2 }); k.y += 8; }
  d.top.forEach(t => {
    const c = t.case ? cases.get(t.case) : null;
    const nm = k.split(t.name || 'bez názvu', cols[1][0] - 2, 7.8);
    const h = Math.max(9.6, 5.4 + nm.length * k.LH(7.8, 1.2));
    k.need(h);
    const top = k.y;
    let x = k.M;
    k.text(t.rank, x + cols[0][0] - 1.5, top + 2.2, 9, { bold: true, color: k.C.ink3, align: 'right' }); x += cols[0][0];
    k.text(t.ean, x, top + 2, 9, { bold: true });
    nm.forEach((line, i) => k.text(line, x, top + 5.6 + i * k.LH(7.8, 1.2), 7.8, { color: k.C.ink2 })); x += cols[1][0];
    const tone = effTone(t.eff);
    const bw = 15;
    k.box(k.C.soft3, x, top + 3.4, bw, 2.2, 1.1);
    k.box(tone === 'crit' ? k.C.crit : tone === 'warn' ? k.C.warn : k.C.good, x, top + 3.4, Math.max(1, bw * Math.min(100, t.eff || 0) / 100), 2.2, 1.1);
    k.text(pdfPct(t.eff), x + bw + 2, top + 2.2, 8.8, { bold: true }); x += cols[2][0];
    [[t.eff != null && t.eff < 100 ? pdfPct(100 - t.eff) : '—', 1], [pdfH(t.nspent)], [pdfH(t.norm)], [pdfH(t.lost), 2], [`${t.times}×`]].forEach(([v, b], i) => {
      const cw = cols[3 + i][0];
      k.text(v, x + cw - 1.5, top + 2.2, 8.6, { align: 'right', bold: !!b, color: b === 2 ? k.C.crit : k.C.ink }); x += cw;
    });
    if (c) {
      const s = caseState(c, today);
      k.text(caseLabel(c), x, top + 1.6, 8.4, { bold: true });
      k.pill(s.k === 'zrus' ? 'zrušeno' : s.label.split(',')[0].replace('Čeká na ', ''), x, top + 7.2, s.late ? 'late' : s.k, 6.4);
    } else k.pill('bez řešení', x, top + 4.4, 'none', 6.6);
    k.y = top + h;
    k.hline(k.y);
  });
  k.y += 4;

  // Termíny
  if (d.deadlines.length) {
    k.keep(() => {
      k.heading('Termíny v příštích třech týdnech', 11);
      d.deadlines.slice(0, 14).forEach(x => {
        const lines = k.split(`${x.text}${x.owner ? ` · ${x.owner}` : ''}`, k.CW - 62, 8.6);
        const h = lines.length * k.LH(8.6, 1.3) + 1.6;
        k.need(h);
        k.text(dayText(x.date), k.M, k.y, 8.6, { bold: true, color: x.late ? k.C.crit : k.C.ink });
        k.text(`P-${x.no}`, k.M + 24, k.y, 8.6, { bold: true, color: k.C.ink2 });
        lines.forEach((line, i) => k.text(line, k.M + 46, k.y + i * k.LH(8.6, 1.3), 8.6));
        if (x.late) k.pill('po termínu', k.M + k.CW, k.y + 1.6, 'late', 6.4, 'right');
        k.y += h;
      });
      k.y += 3;
    }, 30);
  }

  // Řešení po položkách
  d.top.forEach(t => {
    const c = t.case ? cases.get(t.case) : null;
    const draw = () => {
      const s = c ? caseState(c, today) : null;
      pdfBand(k, `${t.rank} · ${t.ean} · ${t.name || 'bez názvu'}`, c ? (s.k === 'zrus' ? 'zrušeno' : s.label) : 'bez řešení', c ? (s.late ? 'late' : s.k) : 'none');
      const metr = `Plnění ${pdfPct(t.eff)} · neplnění ${t.eff != null && t.eff < 100 ? pdfPct(100 - t.eff) : '—'} · čas ${pdfH(t.nspent)} · norma ${pdfH(t.norm)} · ztráta ${pdfH(t.lost)}${d.src === 'import' ? ` · ${nf(t.ks, 0)} ks · ${t.workers} ${lidiW(t.workers)}${t.wmin != null ? ` (plnění ${t.wmin}–${t.wmax} %)` : ''}` : ''} · v Top 5 ${t.times}×`;
      const TW = 50;
      const startY = k.y;
      k.para(metr, k.M, k.CW - TW - 6, 8.6, { color: k.C.ink2 });
      // trend posledních týdnů (malé sloupce)
      if (!k.dry) {
        const vals = t.trend;
        const bw = TW / vals.length;
        const base = startY + 9;
        vals.forEach((v, i) => {
          const x = k.M + k.CW - TW + i * bw;
          if (v != null) {
            const h = Math.max(0.6, Math.min(v, 120) / 120 * 8);
            k.box(i === vals.length - 1 ? k.C.acc : k.C.line2, x + 1, base - h, bw - 2, h, 0.5);
          } else k.box(k.C.soft3, x + 1, base - 0.4, bw - 2, 0.4);
          k.text(v == null ? '—' : `${Math.round(v)}`, x + bw / 2, base + 0.6, 6.2, { color: i === vals.length - 1 ? k.C.ink : k.C.ink3, align: 'center' });
        });
        k.hline(base - 8 * 100 / 120, k.C.ink3, 0.15, k.M + k.CW - TW, k.M + k.CW, [0.6, 0.6]);
        k.text('plnění v posledních týdnech (%)', k.M + k.CW - TW, startY - 0.4, 6.2, { color: k.C.ink3 });
      }
      k.y = Math.max(k.y, startY + 13) + 1.5;
      if (!c) {
        k.box(k.C.warnSoft, k.M, k.y, k.CW, 9, 2);
        k.mid('Řešení zatím není založené. Do příštího reportu doplnit příčinu, opatření a termíny.', k.M + 4, k.y + 4.5, 8.8, { color: k.C.warn, bold: true });
        k.y += 13;
        return;
      }
      const r = curRound(c);
      k.text(`Případ ${caseLabel(c)} · kolo ${r.n}${c.rounds.length > 1 ? ` (znovu otevřeno ${dayText(todayIso(r.at))})` : ''} · založen ${dayText(todayIso(c.at))}${c.by ? `, ${c.by}` : ''}`, k.M, k.y, 8.4, { bold: true, color: k.C.ink2 });
      k.y += 5.5;
      pdfRound(k, c, r, today);
      const prev = c.rounds.slice(0, -1);
      if (prev.length) {
        const texts = prev.map(p => roundBrief(p) + (c.rounds[p.n] && c.rounds[p.n].reason ? ` Důvod nového kola: ${c.rounds[p.n].reason}` : ''));
        const lines = texts.map(tx => k.split(tx, k.CW - 8, 8.2));
        const h = lines.reduce((a, l) => a + l.length * k.LH(8.2, 1.32) + 1.6, 0) + 9;
        k.need(Math.min(h, 60));
        const top = k.y;
        if (h < k.BOTTOM - k.y) k.box(k.C.soft, k.M, top, k.CW, h, 2);
        k.text('PŘEDCHOZÍ ŘEŠENÍ (CO SE UŽ ZKOUŠELO)', k.M + 4, k.y + 3, 6.8, { bold: true, color: k.C.ink3, space: 0.2 });
        k.y += 7.5;
        lines.forEach(ls => { ls.forEach(line => { k.need(k.LH(8.2, 1.32)); k.text(line, k.M + 4, k.y, 8.2, { color: k.C.ink2 }); k.y += k.LH(8.2, 1.32); }); k.y += 1.6; });
        k.y += 2;
      }
      k.y += 4;
    };
    // Zalomení před blokem není pokračování; popisek „pokračování“ až uvnitř bloku.
    const h = k.measure(draw);
    if (k.y + h > k.BOTTOM && (h <= k.PAGE || k.BOTTOM - k.y < 60)) k.newPage();
    k.onPage = () => { k.text(`${t.rank} · ${t.ean} · pokračování`, k.M, k.y, 8, { bold: true, color: k.C.ink3 }); k.y += 6; };
    draw();
    k.onPage = null;
  });
  k.footer(`Top 5 nejméně efektivně · ${weekName(rep.week)} (${weekRange(w)}) · revize ${rep.rev}`);
}

/* ---------- souhrn všech případů ---------- */
function pdfDumbbell(k, rows, target) {
  const X0 = k.M + 50, X1 = k.M + k.CW - 30, max = 120;
  const x = v => X0 + (Math.min(Math.max(v, 0), max) / max) * (X1 - X0);
  const RH = 6.2;
  const axis = () => {
    [0, 50, 100].forEach(v => k.text(`${v} %`, x(v), k.y, 6.8, { color: k.C.ink3, align: 'center' }));
    k.y += 3.6;
  };
  axis();
  const top = k.y;
  rows.forEach(r => {
    k.need(RH);
    const cy = k.y + RH / 2;
    k.text(k.split(r.label, X0 - k.M - 3, 7.8)[0], k.M, cy - k.mm(7.8) * 0.5, 7.8, { color: k.C.ink2 });
    k.hline(cy, k.C.line, 0.15, X0, X1);
    if (r.before != null && r.after != null) k.hline(cy, r.after >= target ? k.C.good : k.C.crit, 0.7, x(Math.min(r.before, r.after)), x(Math.max(r.before, r.after)));
    if (r.before != null) k.dot(x(r.before), cy, 1.2, k.C.white, k.C.ink3);
    if (r.after != null) k.dot(x(r.after), cy, 1.3, r.after >= target ? k.C.good : k.C.crit, null);
    k.text(`${r.before == null ? '—' : nf(r.before, 0)} → ${r.after == null ? '—' : nf(r.after, 0)} %`, k.M + k.CW, cy - k.mm(8) * 0.5, 8, { bold: true, align: 'right' });
    k.y += RH;
  });
  // referenční čáry (100 % a cíl) přes celou výšku grafu
  const bottom = k.y;
  if (!k.dry && bottom > top) {
    [[100, k.C.ink3, null], [target, k.C.ink3, [0.8, 0.8]]].forEach(([v, col, dash]) => {
      doc_line(k, x(v), top, x(v), bottom, col, dash);
    });
  }
  k.y += 2;
  // legenda
  k.dot(k.M + 1.2, k.y + 1.5, 1.2, k.C.white, k.C.ink3);
  k.text('při zjištění', k.M + 3.6, k.y, 7.4, { color: k.C.ink2 });
  k.dot(k.M + 25, k.y + 1.5, 1.3, k.C.good, null);
  k.text(`po opatřeních (poslední ověření), cíl ${target} % splněn`, k.M + 27.4, k.y, 7.4, { color: k.C.ink2 });
  k.dot(k.M + 96, k.y + 1.5, 1.3, k.C.crit, null);
  k.text('pod cílem', k.M + 98.4, k.y, 7.4, { color: k.C.ink2 });
  k.text(`svisle: 100 % (norma), čárkovaně cíl ${target} %`, k.M + k.CW, k.y, 7.4, { color: k.C.ink3, align: 'right' });
  k.y += 7;
}
function doc_line(k, x1, y1, x2, y2, color, dash) {
  if (k.dry) return;
  const doc = k.doc;
  doc.setDrawColor(...color); doc.setLineWidth(0.2);
  if (dash) doc.setLineDashPattern(dash, 0);
  doc.line(x1, y1, x2, y2);
  if (dash) doc.setLineDashPattern([], 0);
}

function pdfCaseDetail(k, c, today, short = false) {
  const s = caseState(c, today);
  const ba = caseBeforeAfter(c);
  const base = c.base;
  k.need(40);
  k.onPage = () => { k.text(`${caseLabel(c)} · ${c.ean} · pokračování`, k.M, k.y, 8, { bold: true, color: k.C.ink3 }); k.y += 6; };
  pdfBand(k, `${caseLabel(c)} · ${c.ean} · ${c.name || 'bez názvu'}`, s.k === 'zrus' ? 'zrušeno' : s.label, s.late ? 'late' : s.k);
  k.para(`Založeno ${dayText(todayIso(c.at))}${c.by ? ` (${c.by})` : ''} · ${c.week ? `zjištěno v ${weekName(c.week)}` : 'založeno ručně'} · plnění při zjištění ${pdfPct(base ? base.eff : null)}${base ? ` (strávený čas ${pdfH(base.nspent)}, norma ${pdfH(base.norm)})` : ''} · po opatřeních ${pdfPct(ba.after)} · kol ${c.rounds.length}${c.cancelled ? ` · zrušeno ${dayText(todayIso(c.cancelled.at))}: ${c.cancelled.reason}` : ''}`, k.M, k.CW, 8.6, { color: k.C.ink2 });
  k.y += 2.5;
  c.rounds.forEach(r => {
    k.need(18);
    k.text(`Kolo ${r.n} · otevřeno ${dayText(todayIso(r.at))}${r.by ? ` (${r.by})` : ''}${r.week ? ` · ${weekName(r.week)}${r.base && r.base.eff != null ? `, plnění ${nf(r.base.eff, 1)} %` : ''}` : ''}`, k.M, k.y, 9, { bold: true, color: k.C.acc });
    k.y += 5.5;
    pdfRound(k, c, r, today);
  });
  if (!short && c.log && c.log.length) {
    k.need(14);
    k.text('Historie případu', k.M, k.y, 9, { bold: true, color: k.C.acc });
    k.y += 5.5;
    c.log.forEach(e => {
      const lines = k.split(e.t, k.CW - 30 - 32, 8);
      const h = lines.length * k.LH(8, 1.3) + 1.2;
      k.need(h);
      k.text(tsText(e.at), k.M, k.y, 7.6, { color: k.C.ink3 });
      lines.forEach((line, i) => k.text(line, k.M + 30, k.y + i * k.LH(8, 1.3), 8));
      k.text(k.split(e.by || '—', 30, 7.6)[0], k.M + k.CW, k.y, 7.6, { color: k.C.ink3, align: 'right' });
      k.y += h;
    });
  }
  k.y += 6;
  k.onPage = null;
}

/* short = osekaná verze: bez historie případu (kdo a kdy co změnil). */
function drawEffSummary(doc, single, short = false) {
  const k = pdfKit(doc);
  const now = Date.now();
  const today = todayIso(now);
  const set = effSet();
  const right = `${short ? 'Osekaná verze · ' : ''}Stav k ${dayText(today)}`;
  const foot = short ? ' · osekaná verze' : '';
  if (single) {
    k.header({ eyebrow: T5_EYEBROW, plain: true, right, title: `Případ ${caseLabel(single)}`, sub: `${single.ean}${single.name ? ` · ${single.name}` : ''}`,
      meta: short ? 'Záznam případu: všechna kola řešení, opatření a ověření účinnosti. Osekaná verze, bez historie změn.'
        : 'Kompletní záznam případu: všechna kola řešení, opatření, ověření účinnosti a historie změn s tím, kdo a kdy je udělal.' });
    pdfCaseDetail(k, single, today, short);
    k.footer(`Top 5 nejméně efektivně · případ ${caseLabel(single)}${foot} · stav k ${dayText(today)}`);
    return;
  }
  const sum = effSummary(today);
  const cases = S.eff.cases.slice().sort((a, b) => (a.no < b.no ? -1 : 1));
  const first = cases.length ? todayIso(Math.min(...cases.map(c => c.at))) : today;
  k.header({ eyebrow: T5_EYEBROW, plain: true, right, title: 'Souhrn problémových dílů', sub: `${dayText(first)} – ${dayText(today)}`,
    meta: `Všechny případy z týdenních Top 5: co se řešilo, kdy, jak dopadla ověření účinnosti (1. ověření ${set.d1} dní po dokončení opatření, 2. ověření ${set.d2} dní po prvním, cíl plnění ${set.target} %).` });
  k.tiles([
    ['Případů celkem', String(sum.total), `${sum.reopened} znovu otevřených`],
    ['Rozpracované', String(sum.open + sum.verify + sum.fail), `${sum.verify} v ověřování`],
    ['Uzavřeno účinně', String(sum.ok), sum.zrus ? `${sum.zrus} zrušených` : 'bez zrušených', sum.ok ? 'good' : ''],
    ['Po termínu', String(sum.late), sum.late ? 'termíny k řešení' : 'vše v termínu', sum.late ? 'crit' : ''],
  ]);
  k.tiles([
    ['Úspěšnost ověření', sum.verifs ? `${Math.round(sum.verifOk / sum.verifs * 100)} %` : '—', `${sum.verifOk} z ${sum.verifs} ověření účinných`],
    ['Doba do uzavření', sum.leadAvg == null ? '—' : `${nf(sum.leadAvg, 0)} dní`, 'průměr u uzavřených účinně'],
    ['Ztráta při zjištění', pdfH(sum.lost), 'čas nad normou při zjištění'],
    ['Vydané reporty', String(S.eff.reports.length), S.eff.reports.length ? `poslední ${weekName(S.eff.reports[S.eff.reports.length - 1].week)}` : 'zatím žádný'],
  ]);
  // Stavy (pruh s legendou)
  const order = [['new', 'Analýza'], ['act', 'Opatření'], ['v1', '1. ověření'], ['v2', '2. ověření'], ['fail', 'Neúčinné'], ['ok', 'Účinné'], ['zrus', 'Zrušené']];
  const states = cases.map(c => caseState(c, today).k);
  if (cases.length) {
    k.heading('Stav případů', 11);
    const counts = order.map(([key, label]) => [key, label, states.filter(x => x === key).length]).filter(x => x[2]);
    let x = k.M;
    const gap = 0.8, avail = k.CW - gap * (counts.length - 1);
    counts.forEach(([key, , n]) => { const w = avail * n / cases.length; k.box(k.TONE[key][1], x, k.y, w, 5, 1); if (w > 8) k.mid(String(n), x + w / 2, k.y + 2.5, 7.4, { bold: true, color: k.C.white, align: 'center' }); x += w + gap; });
    k.y += 8;
    x = k.M;
    counts.forEach(([key, label, n]) => { k.box(k.TONE[key][1], x, k.y + 0.4, 2.6, 2.6, 0.6); k.text(`${label} ${n}`, x + 3.8, k.y, 7.8, { color: k.C.ink2 }); x += k.width(`${label} ${n}`, 7.8) + 10; });
    k.y += 8;
    const rows = cases.map(c => ({ label: `${caseLabel(c)} · ${c.ean}`, ...caseBeforeAfter(c) })).filter(r => r.before != null || r.after != null);
    if (rows.length) {
      k.keep(() => { k.heading('Plnění normy před a po opatřeních', 11); pdfDumbbell(k, rows, set.target); }, 50);
    }
  } else {
    k.text('Zatím nebyl založen žádný případ.', k.M, k.y, 9.5, { color: k.C.ink2 });
    k.y += 10;
  }

  if (cases.length) {
    // Registr
    k.newPage();
    k.heading('Registr případů');
    const cols = [[22, 'Případ'], [38, 'Díl'], [15, 'Zjištěno'], [8, 'Kol', 'r'], [31, 'Příčina'], [14, 'Opatření', 'r'], [17, '1. ověření'], [17, '2. ověření'], [16, 'Před → po', 'r']];
    const head = () => {
      let x = k.M;
      cols.forEach(([cw, t, al]) => { k.text(t, al === 'r' ? x + cw - 1.5 : x, k.y, 7, { bold: true, color: k.C.ink2, align: al === 'r' ? 'right' : 'left' }); x += cw; });
      k.y += 4.4;
      k.hline(k.y, k.C.line2, 0.3);
      k.y += 0.6;
    };
    k.onPage = head;
    head();
    cases.forEach(c => {
      const s = caseState(c, today);
      const r = curRound(c);
      const ba = caseBeforeAfter(c);
      const acts = liveActions(r);
      const vtext = i => {
        const v = r.v[i];
        if (v) return [v.result === 'ok' ? 'účinné' : 'neúčinné', dayText(v.done), v.result === 'ok' ? k.C.good : k.C.crit];
        const p = roundPlan(r);
        const due = i ? p.p2 : p.p1;
        return due ? ['plán', dayText(due), due < today ? k.C.crit : k.C.ink2] : ['—', '', k.C.ink3];
      };
      const nm = k.split(c.name || 'bez názvu', cols[1][0] - 2, 7.4).slice(0, 2);
      const cause = k.split(r.cat ? effCatLabel(r.cat) : (r.cause ? r.cause : 'nevyplněno'), cols[4][0] - 2, 7.4).slice(0, 3);
      const h = Math.max(10, 4.6 + Math.max(nm.length, cause.length) * k.LH(7.4, 1.25));
      k.need(h);
      const top = k.y;
      let x = k.M;
      k.text(caseLabel(c), x, top + 1.2, 8.2, { bold: true });
      k.pill(s.k === 'zrus' ? 'zrušeno' : s.label.split(',')[0].replace('Čeká na ', ''), x, top + 7, s.late ? 'late' : s.k, 6);
      x += cols[0][0];
      k.text(c.ean, x, top + 1.2, 8.2, { bold: true });
      nm.forEach((line, i) => k.text(line, x, top + 4.8 + i * k.LH(7.4, 1.25), 7.4, { color: k.C.ink2 }));
      x += cols[1][0];
      k.text(c.week ? weekName(c.week) : dayText(todayIso(c.at), false), x, top + 1.2, 8); x += cols[2][0];
      k.text(String(c.rounds.length), x + cols[3][0] - 1.5, top + 1.2, 8, { align: 'right', bold: c.rounds.length > 1, color: c.rounds.length > 1 ? k.C.warn : k.C.ink }); x += cols[3][0];
      cause.forEach((line, i) => k.text(line, x, top + 1.2 + i * k.LH(7.4, 1.25), 7.4, { color: r.cat || r.cause ? k.C.ink : k.C.ink3 })); x += cols[4][0];
      k.text(`${acts.filter(a => a.done).length}/${acts.length}`, x + cols[5][0] - 1.5, top + 1.2, 8, { align: 'right' }); x += cols[5][0];
      [0, 1].forEach(i => { const [a, b, col] = vtext(i); k.text(a, x, top + 1.2, 7.6, { bold: true, color: col }); if (b) k.text(b, x, top + 4.8, 7.4, { color: k.C.ink2 }); x += cols[6 + i][0]; });
      k.text(`${ba.before == null ? '—' : nf(ba.before, 0)} → ${ba.after == null ? '—' : nf(ba.after, 0)} %`, x + cols[8][0] - 1.5, top + 1.2, 7.8, { align: 'right', bold: true });
      k.y = top + h;
      k.hline(k.y);
      k.y += 0.6;
    });
    k.onPage = null;
    // Detail
    k.newPage();
    k.heading(short ? 'Detail případů' : 'Detail případů a kompletní historie');
    cases.forEach(c => pdfCaseDetail(k, c, today, short));
  }
  k.footer(`Top 5 nejméně efektivně · souhrn problémových dílů${foot} · stav k ${dayText(today)}`);
}

/* ---------- export ---------- */
async function withPdf(button, fn) {
  if (button) button.disabled = true;
  try {
    const doc = await newPdf();
    return await fn(doc);
  } catch (error) {
    toast(`PDF se nepovedlo: ${error.message}`, true);
    return null;
  } finally {
    if (button) button.disabled = false;
  }
}

async function exportWeekPdf(id, button) {
  if (!id || !weekRanking(id)) return;
  const before = S.eff.reports.find(r => r.week === id);
  const prevRev = before ? before.rev : 0;
  const rep = issueWeekReport(id, effMeta());
  if (rep.rev !== prevRev) save();
  const ok = await withPdf(button, doc => {
    doc.setProperties({ title: `Top 5 nejméně efektivně · ${weekName(id)}`, subject: weekLong(id) });
    drawWeekReport(doc, rep);
    const w = weekById(id);
    downloadFile(`top5-tyden-${w.w}-${w.y}-revize-${rep.rev}.pdf`, doc.output('blob'), 'application/pdf');
    return true;
  });
  if (ok) {
    renderTop5();
    toast(rep.rev !== prevRev ? `Report ${weekName(id)} vydán (revize ${rep.rev}) a stahuje se.` : `Report ${weekName(id)} se od revize ${rep.rev} nezměnil, stahuje se znovu.`);
  }
}

async function exportIssuedPdf(week, button) {
  const rep = S.eff.reports.find(r => r.week === week);
  if (!rep) return;
  await withPdf(button, doc => {
    doc.setProperties({ title: `Top 5 nejméně efektivně · ${weekName(week)}`, subject: weekLong(week) });
    drawWeekReport(doc, rep);
    const w = weekById(week);
    downloadFile(`top5-tyden-${w.w}-${w.y}-revize-${rep.rev}.pdf`, doc.output('blob'), 'application/pdf');
  });
}

/* Souhrn a PDF případu jsou ve dvou verzích: kompletní a osekaná (bez historie případu). */
async function pickT5Variant(single) {
  const { value, form } = await dialog({
    title: single ? `PDF případu ${caseLabel(single)}` : 'Souhrn do PDF', ok: 'Stáhnout PDF',
    html: `<div class="variant-pick" role="radiogroup" aria-label="Verze PDF">
      <label><input type="radio" name="variant" value="full"${P.t5PdfShort ? '' : ' checked'}><span><b>Kompletní verze</b><small>Všechna kola řešení, opatření, ověření účinnosti a historie případu (kdo a kdy co změnil).</small></span></label>
      <label><input type="radio" name="variant" value="short"${P.t5PdfShort ? ' checked' : ''}><span><b>Osekaná verze</b><small>Totéž bez historie případu.</small></span></label></div>`,
  });
  if (value !== 'ok') return null;
  const short = form.elements.namedItem('variant').value === 'short';
  if (short !== P.t5PdfShort) setPref({ t5PdfShort: short });
  return short ? 'short' : 'full';
}

async function exportEffSummaryPdf(caseId, button, variant) {
  const single = caseId ? effCase(caseId) : null;
  const pick = variant || await pickT5Variant(single);
  if (!pick) return;
  const short = pick === 'short';
  const tail = short ? '-osekana' : '';
  await withPdf(button || $('#t5SummaryPdf'), doc => {
    doc.setProperties({ title: `${single ? `Případ ${caseLabel(single)}` : 'Souhrn problémových dílů'}${short ? ' (osekaná verze)' : ''}`, subject: 'Top 5 nejméně efektivně' });
    drawEffSummary(doc, single, short);
    downloadFile(single ? `top5-pripad-${caseLabel(single)}${tail}.pdf` : `top5-souhrn-${todayIso()}${tail}.pdf`, doc.output('blob'), 'application/pdf');
    toast(`${single ? `PDF případu ${caseLabel(single)}` : 'Souhrn'}${short ? ' (osekaná verze)' : ''} se stahuje.`);
  });
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
    const rate = event.target.closest('[data-rate]');
    if (rate) {
      setRate(rate.dataset.key, rate.dataset.rate, +rate.dataset.lvl);
      renderPeople(); renderOverview(); renderMatrix();
      const again = $(`#lDetail [data-rate="${CSS.escape(rate.dataset.rate)}"][data-lvl="${rate.dataset.lvl}"]`);
      if (again) again.focus();
      return;
    }
    const legacy = event.target.closest('[data-legacydone]');
    if (legacy) {
      const e = S.employees[legacy.dataset.legacydone];
      if (!e || !e.legacy) return;
      if (!(await confirmBox('Smazat původní zařazení?', `Okno s původním zařazením (${legacyText(e.legacy)}) zmizí. Záznam o tom zůstane v historii změn.`, 'Převedeno, smazat'))) return;
      delete e.legacy;
      save(); renderPeople(); renderOverview(); toast('Původní zařazení smazáno.');
      return;
    }
    const mark = event.target.closest('[data-mark]');
    if (mark && S.current) {
      if (mark.dataset.on === '1') {
        const res = await dialog({ title: 'Bod prémie nesplněn', ok: 'Označit nesplněno',
          html: `<p class="small muted">Platí jen pro ${esc(nameOf(mark.dataset.key))} a ${esc(monthLabel(S.current))}. Prémie, která bod vyžaduje, se za tento měsíc nepřizná.</p><label class="field"><span>Důvod (nepovinné)</span><input name="value" maxlength="300" placeholder="např. opakované pozdní příchody" autofocus></label>` });
        if (res.value !== 'ok') return;
        setMark(S.current, mark.dataset.key, mark.dataset.mark, res.form.elements.namedItem('value').value.trim());
      } else setMark(S.current, mark.dataset.key, mark.dataset.mark, null);
      save(); renderPeople(); renderOverview();
      return;
    }
    const gg = event.target.closest('[data-gogroup]');
    if (gg) { ui.selPos = gg.dataset.gogroup; ui.posOpen = true; ui.mxTab = 'groups'; showView('matice'); return; }
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
    const value = await promptBox('Nová skupina', 'Název skupiny', '', 'Přidat', 'třeba Frézování');
    if (!value) return;
    const position = mkPos(uid('p'), value.slice(0, 80), []);
    S.positions.push(position);
    ui.selPos = position.id; ui.posOpen = true; ui.mxTab = 'groups';
    save(); renderMatrix(); renderOverview(); renderPeople();
  };
  bindMatrixEvents();
  bindGroupEditor();

  $('#btnDelPeriod').onclick = async () => {
    const p = curPeriod();
    if (!p) return;
    if (!(await confirmBox('Smazat období?', `Smaže se docházka za ${periodName(p)} i ruční úpravy a výdeje toho měsíce. Lidé, skupiny a sankce zůstanou.`, 'Smazat', true))) return;
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
  bindTop5Events();
  bindKontrolyEvents();
  window.addEventListener('beforeunload', event => {
    if (store.dirty || store.saving) { event.preventDefault(); event.returnValue = ''; }
  });
}

/* ==========================================================================
   KONTROLY: nutné úkony oddělení a namátkové kontroly (verze 2.3)
   ========================================================================== */
const KT_TABS = [['plan', 'Plán týdne'], ['tasks', 'Nutné úkony'], ['results', 'Výsledky']];
const KT_RANGES = [['4', '4 týdny'], ['12', '12 týdnů'], ['52', 'Rok'], ['all', 'Vše']];
const DOW_LONG = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
function ktDay(iso, long = false) {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${long ? DOW_LONG[dow] : DOW[dow]} ${d}. ${m}.`;
}
function ktMeta() { return { at: Date.now(), by: ui.me.label || '' }; }
const lidiN = n => (n === 1 ? 'člověk' : n >= 2 && n <= 4 ? 'lidé' : 'lidí');
const bodyN = n => (n === 1 ? 'bod' : n >= 2 && n <= 4 ? 'body' : 'bodů');
const kontrolN = n => (n === 1 ? 'kontrola' : n >= 2 && n <= 4 ? 'kontroly' : 'kontrol');
const ktPct = v => (v == null ? '—' : `${nf(v, v >= 99.95 || v < 0.05 ? 0 : 1)} %`);

/* Výchozí týden: tento, když má plán; jinak příští (plán se dělá na týden dopředu). */
function ktWeekId() {
  if (!ui.kt.week || !weekById(ui.kt.week)) {
    const cur = isoWeek(todayIso()).id;
    ui.kt.week = audPlan(cur) ? cur : shiftWeek(cur, 1);
  }
  return ui.kt.week;
}

function renderKtBadge() {
  const badge = $('#navKt');
  if (!badge || !S) return;
  const today = todayIso();
  const late = auditLate(today);
  const now = ((audPlan(isoWeek(today).id) || {}).items || []).filter(i => i.state === 'plan' && i.day === today).length;
  const n = late + now;
  badge.hidden = !n;
  badge.textContent = String(n);
  badge.title = [now ? `dnes ${now} ${kontrolN(now)}` : '', late ? `${late} nezapsaných po termínu` : ''].filter(Boolean).join(', ');
}

function renderKontroly() {
  const view = $('#ktView');
  if (!view || !S) return;
  renderKtBadge();
  $('#ktTabs').innerHTML = KT_TABS.map(([k, t]) => `<button type="button" class="chip${k === ui.kt.tab ? ' on' : ''}" data-kttab="${k}" aria-pressed="${k === ui.kt.tab}">${t}</button>`).join('');
  view.innerHTML = ui.kt.tab === 'tasks' ? ktTasksHtml() : ui.kt.tab === 'results' ? ktResultsHtml() : ktPlanHtml();
  setWidths(view);
}

/* ---------- plán týdne ---------- */
function ktStateChip(it, today) {
  if (it.state === 'done') {
    const sc = checkScore(it);
    return `<span class="t5-state ${sc.ok === sc.n ? 's-ok' : 's-fail'}">${sc.ok}/${sc.n} splněno</span>`;
  }
  if (it.state === 'skip') return '<span class="t5-state s-zrus">neproběhlo</span>';
  return it.day < today ? '<span class="t5-state late">nezapsáno</span>' : it.day === today ? '<span class="t5-state s-act">dnes</span>' : '<span class="t5-state s-v1">plán</span>';
}

function ktCard(it, plan, today) {
  const late = it.state === 'plan' && it.day < today;
  const sc = it.state === 'done' ? checkScore(it) : null;
  const tasks = audTasks(it.dept).length;
  const menu = [];
  if (it.state === 'plan') {
    menu.push(`<label class="field"><span>Přesunout na den</span><select data-ktmove="${esc(it.id)}">${plan.days.map(d => `<option value="${d}"${d === it.day ? ' selected' : ''}>${esc(ktDay(d, true))}</option>`).join('')}</select></label>`);
    menu.push(`<button class="btn ghost small" type="button" data-ktskip="${esc(it.id)}">Neproběhlo…</button>`);
    menu.push(`<button class="btn ghost small" type="button" data-ktsub="${esc(it.id)}">Náhradník…</button>`);
    menu.push(`<button class="btn ghost small" type="button" data-ktdel="${esc(it.id)}">Odebrat z plánu</button>`);
  } else menu.push(`<button class="btn ghost small" type="button" data-ktundo="${esc(it.id)}">${it.state === 'done' ? 'Zrušit zápis' : 'Vrátit do plánu'}</button>`);
  return `<div class="kt-card${late ? ' late' : ''}${it.state === 'done' ? (sc.ok === sc.n ? ' ok' : ' bad') : ''}${it.state === 'skip' ? ' skip' : ''}" data-ktitem="${esc(it.id)}">
    <div class="kt-card-head"><button class="linkish kt-name" type="button" data-ktperson="${esc(it.key)}">${esc(it.name)}</button>${ktStateChip(it, today)}</div>
    <p class="tiny muted">${esc(it.dept)}${it.extra ? ' · přidán ručně' : it.sub ? ' · náhradník' : ''}</p>
    ${it.state === 'done' ? `<p class="small">${esc(dayText(it.done))}${it.checker ? ` · ${esc(it.checker)}` : ''}</p>${sc.fail.length ? `<ul class="kt-fails">${sc.fail.map(r => `<li>${esc(r.text)}${r.note ? ` <span class="muted">– ${esc(r.note)}</span>` : ''}</li>`).join('')}</ul>` : ''}` : ''}
    ${it.state === 'skip' ? `<p class="small muted">${esc(it.reason || 'bez důvodu')}</p>` : ''}
    <div class="kt-card-actions">
      ${it.state === 'plan' ? (tasks ? `<button class="btn small" type="button" data-ktcheck="${esc(it.id)}">Zapsat kontrolu</button>` : '<span class="tiny warn-t">oddělení nemá nutné úkony</span>')
        : it.state === 'done' ? `<button class="btn sec small" type="button" data-ktcheck="${esc(it.id)}">Upravit</button>` : ''}
      <details class="kt-more"><summary aria-label="Další volby">···</summary><div class="kt-menu">${menu.join('')}</div></details>
    </div>
  </div>`;
}

function ktPlanHtml() {
  const id = ktWeekId();
  const cur = isoWeek(todayIso()).id;
  const today = todayIso();
  const plan = audPlan(id);
  const weeks = [...new Set([...Object.keys(S.audit.plans), cur, shiftWeek(cur, 1), shiftWeek(cur, 2), id])].sort().reverse();
  const depts = audDepts();
  const pct = audSet().pct;
  const missing = depts.filter(d => !audTasks(d).length);
  const bar = `<div class="t5-weekbar">
      <button class="icon-btn" type="button" data-ktwk="-1" aria-label="Předchozí týden">${I.back}</button>
      <select id="ktWeekSel" aria-label="Týden">${weeks.map(w => `<option value="${w}"${w === id ? ' selected' : ''}>${esc(`${weekName(w)} · ${weekRange(weekById(w))}${w === cur ? ' · tento týden' : w === shiftWeek(cur, 1) ? ' · příští týden' : ''}`)}</option>`).join('')}</select>
      <button class="icon-btn t5-next" type="button" data-ktwk="1" aria-label="Další týden">${I.back}</button>
      <span class="spacer"></span>
      ${plan ? `<button class="btn sec" type="button" data-ktadd>Přidat člověka</button><button class="btn sec" type="button" data-ktpdf>Plán do PDF</button>` : ''}
      <button class="btn${plan ? ' sec' : ''}" type="button" data-ktgen${id < cur ? ' disabled' : ''}>${plan ? 'Přegenerovat neprovedené' : 'Vygenerovat plán'}</button>
    </div>`;
  const warn = missing.length ? `<div class="note w"><b>Bez nutných úkonů:</b> ${missing.map(esc).join(', ')}. U lidí z těchto oddělení kontrolu nepůjde zapsat. <button class="btn small" type="button" data-kttabgo="tasks">Doplnit nutné úkony</button></div>` : '';
  if (!plan) {
    const rows = depts.map(d => { const n = audPeople(d).length; return `<tr><td class="name" data-label="Oddělení"><b>${esc(d)}</b></td><td class="r num" data-label="Lidí">${n}</td><td class="r num" data-label="Vybere se">${audCount(n, pct)}</td><td class="r num" data-label="Nutné úkony">${audTasks(d).length || '<span class="warn-t">žádné</span>'}</td></tr>`; }).join('');
    return `${bar}${warn}<div class="card">${emptyState(`Plán na ${esc(weekName(id))} zatím není`, `Z každého oddělení se vybere ${pct} % lidí (zaokrouhleno nahoru) a rozloží se do pracovních dnů ${esc(weekRange(weekById(id)))}. Přednost mají ti, kdo nejdéle nebyli kontrolovaní, takže se během ${Math.ceil(100 / pct)} týdnů vystřídají všichni.`)}
      ${depts.length ? `<div class="table-card flat"><table class="stack"><thead><tr><th>Oddělení</th><th class="r">Lidí</th><th class="r">Vybere se</th><th class="r">Nutné úkony</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="small muted">Zatím nikdo nemá skupinu. Kontroluje se jen zaměstnanec se skupinou (oddělení je podle skupiny).</p>'}</div>`;
  }
  const sum = planSummary(id, today);
  const tiles = `<div class="stats">${[
    statTile('Naplánováno', String(sum.planned), `${plan.pct} % z každého oddělení`),
    statTile('Provedeno', `${sum.done}<em>/ ${sum.planned}</em>`, sum.skip ? `${sum.skip} neproběhlo` : 'vše podle plánu', sum.done && sum.done === sum.planned ? 'good' : ''),
    statTile('Plnění bodů', ktPct(sum.pct), sum.points ? `${sum.ok} z ${sum.points} ${bodyN(sum.points)} · ${sum.clean} bez chyby` : 'zatím nic zapsáno', sum.pct != null && sum.pct < 100 ? 'crit' : sum.pct != null ? 'good' : ''),
    statTile('Nezapsáno po termínu', String(sum.late), sum.late ? 'doplň výsledek, nebo „neproběhlo“' : 'vše v termínu', sum.late ? 'crit' : ''),
  ].join('')}</div>`;
  const cols = plan.days.map(d => {
    const items = plan.items.filter(i => i.day === d);
    return `<div class="kt-day${d === today ? ' today' : ''}"><div class="kt-day-head"><b>${esc(ktDay(d, true))}</b><span class="muted small">${items.filter(i => i.state !== 'skip').length} ${lidiN(items.filter(i => i.state !== 'skip').length)}</span></div>
      ${items.map(it => ktCard(it, plan, today)).join('') || '<p class="tiny muted kt-free">nikdo</p>'}</div>`;
  }).join('');
  return `${bar}${warn}${tiles}<div class="kt-days">${cols}</div>
    <p class="hint">Plán vygenerovala kartička ${esc(plan.by || '—')} ${esc(tsText(plan.at))}. Přegenerování nahradí jen neprovedené kontroly; provedené a neproběhlé zůstanou. Když člověk chybí, zapiš „Neproběhlo“, nebo vyber náhradníka z téhož oddělení.</p>`;
}

/* Formulář kontroly: u každého bodu splněno / nesplněno, poznámka, datum a kdo kontroloval. */
async function ktCheckForm(weekId, it) {
  const tasks = audTasks(it.dept);
  if (!tasks.length) { toast(`Oddělení ${it.dept} nemá nutné úkony.`, true); return; }
  const prev = it.state === 'done' ? Object.fromEntries(it.results.map(r => [r.t, r])) : {};
  const today = todayIso();
  const date = it.state === 'done' ? it.done : it.day <= today ? it.day : today;
  const result = await dialog({
    title: `Kontrola · ${it.name}`, ok: 'Uložit kontrolu', wide: true,
    html: `<p class="small muted">${esc(it.dept)} · plán na ${esc(ktDay(it.day, true))} U každého bodu vyber, jestli ho operátor dělá.</p>
      <div class="form-grid">
        <label class="field"><span>Datum kontroly</span><input type="date" name="date" value="${esc(date)}" max="${esc(today)}" required></label>
        <label class="field"><span>Kontroloval</span><input type="text" name="checker" value="${esc(it.checker || ui.me.label || '')}" maxlength="60"></label>
      </div>
      <div class="kt-points">${tasks.map((t, i) => {
        const p = prev[t.id];
        return `<div class="kt-point"><p><b class="num">${i + 1}.</b> ${esc(t.text)}</p>
          <div class="kt-yn" role="radiogroup" aria-label="${esc(t.text)}">
            <label class="yes"><input type="radio" name="a_${t.id}" value="1"${p && p.ok ? ' checked' : ''}><span>Splněno</span></label>
            <label class="no"><input type="radio" name="a_${t.id}" value="0"${p && !p.ok ? ' checked' : ''}><span>Nesplněno</span></label>
          </div>
          <input type="text" name="n_${t.id}" value="${esc(p ? p.note : '')}" maxlength="300" placeholder="poznámka (nepovinná)" aria-label="Poznámka k bodu ${i + 1}"></div>`;
      }).join('')}</div>
      <div class="row gap"><button class="btn ghost small" type="button" id="ktAllOk">Vše splněno</button><span class="tiny muted">Body bez odpovědi nejde uložit.</span></div>
      <label class="field"><span>Poznámka ke kontrole</span><input type="text" name="note" value="${esc(it.note || '')}" maxlength="1000" placeholder="volitelné"></label>`,
    onOpen: dlg => {
      const clear = () => { const box = $('.dlg-error', dlg); if (box) box.remove(); };
      $('#ktAllOk', dlg).onclick = () => { tasks.forEach(t => { const r = $(`input[name="a_${t.id}"][value="1"]`, dlg); if (r) r.checked = true; }); clear(); };
      $('.kt-points', dlg).addEventListener('change', clear);
    },
    validate: form => {
      const d = form.elements.namedItem('date').value;
      if (!ISO_DAY.test(d)) return 'Vyber datum kontroly.';
      if (d > today) return 'Kontrola nemůže být v budoucnosti.';
      const open = tasks.filter(t => !form.elements.namedItem(`a_${t.id}`).value).length;
      return open ? `U každého bodu vyber splněno, nebo nesplněno (chybí ${open}).` : null;
    },
  });
  if (result.value !== 'ok') return;
  const f = result.form.elements;
  const answers = {}, notes = {};
  tasks.forEach(t => { answers[t.id] = f.namedItem(`a_${t.id}`).value === '1'; notes[t.id] = f.namedItem(`n_${t.id}`).value; });
  try {
    recordCheck(weekId, it.id, { date: f.namedItem('date').value, checker: f.namedItem('checker').value, note: f.namedItem('note').value, answers, notes }, ktMeta());
  } catch (error) { toast(error.message, true); return; }
  save(); renderKontroly();
  const sc = checkScore(it);
  toast(`${it.name}: splněno ${sc.ok} z ${sc.n}. Zapsáno do karty.`);
}

async function ktGenerate() {
  const id = ktWeekId();
  const plan = audPlan(id);
  if (!audDepts().length) { toast('Zatím nikdo nemá skupinu, není koho kontrolovat.', true); return; }
  if (plan && plan.items.some(i => i.state === 'plan') && !(await confirmBox('Přegenerovat plán?', `Neprovedené kontroly v ${weekName(id)} se nahradí novým výběrem. Provedené a neproběhlé zůstanou.`, 'Přegenerovat'))) return;
  try { generatePlan(id, ktMeta()); } catch (error) { toast(error.message, true); return; }
  save(); renderKontroly();
  const n = audPlan(id).items.filter(i => i.state === 'plan').length;
  toast(`${weekName(id)}: naplánováno ${n} ${lidiN(n)}.`);
}

async function ktAddPerson() {
  const id = ktWeekId();
  const plan = audPlan(id);
  const people = Object.values(S.employees).filter(e => !e.excluded && empDept(e)).sort((a, b) => norm(audName(a)).localeCompare(norm(audName(b)), 'cs'));
  const result = await dialog({
    title: 'Přidat člověka do plánu', ok: 'Přidat',
    html: `<label class="field"><span>Zaměstnanec</span><select name="key" required><option value="">— vyber —</option>${people.map(e => `<option value="${esc(e.key)}">${esc(`${audName(e)} · ${empDept(e)}`)}</option>`).join('')}</select></label>
      <label class="field"><span>Den</span><select name="day">${plan.days.map(d => `<option value="${d}">${esc(ktDay(d, true))}</option>`).join('')}</select></label>`,
    validate: form => (form.elements.namedItem('key').value ? null : 'Vyber zaměstnance.'),
  });
  if (result.value !== 'ok') return;
  try { addToPlan(id, result.form.elements.namedItem('key').value, result.form.elements.namedItem('day').value, ktMeta()); } catch (error) { toast(error.message, true); return; }
  save(); renderKontroly();
}

/* ---------- nutné úkony ---------- */
function ktTasksHtml() {
  const pct = audSet().pct;
  const depts = departments();
  const orphans = auditOrphans();
  if (!depts.length) return `<div class="card">${emptyState('Zatím žádné oddělení', 'Oddělení je podle skupiny (pole Oddělení v editoru skupiny, jinak název skupiny).')}</div>`;
  const cards = depts.map(d => {
    const tasks = audTasks(d);
    const n = audPeople(d).length;
    const pos = S.positions.filter(p => deptOf(p) === d).map(p => p.name || '(bez názvu)');
    return `<div class="card kt-dept" data-ktdept="${esc(d)}">
      <div class="card-head"><div><h3>${esc(d)}</h3><p class="small muted">${n} ${lidiN(n)} · týdně se kontroluje ${audCount(n, pct)} · skupiny: ${esc(pos.join(', '))}</p></div><span class="tag${tasks.length ? '' : ' warn'}">${tasks.length} ${bodyN(tasks.length)}</span></div>
      ${tasks.length ? `<ol class="kt-tasks">${tasks.map((t, i) => `<li data-ktask="${esc(t.id)}"><span class="num muted">${i + 1}.</span>
        <input type="text" value="${esc(t.text)}" maxlength="300" data-ktf aria-label="Bod ${i + 1}">
        <button class="icon-btn" type="button" data-ktup aria-label="Posunout nahoru"${i ? '' : ' disabled'}>${I.back}</button>
        <button class="icon-btn kt-down" type="button" data-ktdown aria-label="Posunout dolů"${i < tasks.length - 1 ? '' : ' disabled'}>${I.back}</button>
        <button class="icon-btn" type="button" data-ktrm aria-label="Smazat bod">${I.x}</button></li>`).join('')}</ol>` : '<p class="small muted">Zatím žádný bod. Napiš, co musí operátor v tomto oddělení dělat, každý úkon zvlášť.</p>'}
      <div class="kt-newtask"><input type="text" maxlength="300" data-ktnew placeholder="Nový bod, např. Kontrola prvního kusu podle výkresu" aria-label="Nový bod"><button class="btn sec small" type="button" data-ktaddtask>Přidat bod</button></div>
    </div>`;
  }).join('');
  const orph = orphans.length ? `<div class="card"><h3>Úkony oddělení, která už nemají skupinu</h3><p class="small muted">Nejspíš se oddělení přejmenovalo. Převeď body na nové oddělení, nebo je smaž. Zapsané kontroly zůstanou beze změny.</p>
    ${orphans.map(o => `<div class="kt-orphan" data-ktorphan="${esc(o)}"><b>${esc(o)}</b> <span class="muted small">${audTasks(o).length} ${bodyN(audTasks(o).length)}</span>
      <select data-ktmerge aria-label="Převést na oddělení"><option value="">Převést na…</option>${depts.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('')}</select>
      <button class="btn ghost small" type="button" data-ktdrop>Smazat</button></div>`).join('')}</div>` : '';
  return `<p class="hint kt-lede">Body se ukážou v kontrolním formuláři v tomto pořadí. Úprava bodu nezmění už zapsané kontroly (ukládají si text bodu z doby kontroly).</p><div class="kt-depts">${cards}</div>${orph}`;
}

function ktTaskList(el) {
  const card = el.closest('[data-ktdept]');
  if (!card) return null;
  const d = card.dataset.ktdept;
  return { d, list: S.audit.tasks[d] || (S.audit.tasks[d] = []) };
}

/* ---------- výsledky ---------- */
function ktResultsHtml() {
  const range = KT_RANGES.find(r => r[0] === ui.kt.range) ? ui.kt.range : '12';
  const today = todayIso();
  const from = range === 'all' ? '' : addDays(today, -7 * +range);
  const depts = [...new Set([...departments(), ...Object.values(S.audit.plans).flatMap(p => p.items.map(i => i.dept))])];
  const dept = depts.includes(ui.kt.dept) ? ui.kt.dept : '';
  const r = auditResults(from, today, dept);
  const pts = r.rows.reduce((x, c) => x + c.score.n, 0), ok = r.rows.reduce((x, c) => x + c.score.ok, 0);
  const clean = r.rows.filter(c => c.score.ok === c.score.n).length;
  const filters = `<div class="toolbar"><div class="chips">${KT_RANGES.map(([k, t]) => `<button type="button" class="chip${k === range ? ' on' : ''}" data-ktrange="${k}" aria-pressed="${k === range}">${t}</button>`).join('')}</div><span class="spacer"></span>
    <select id="ktDept" aria-label="Oddělení"><option value="">Všechna oddělení</option>${depts.map(d => `<option value="${esc(d)}"${d === dept ? ' selected' : ''}>${esc(d)}</option>`).join('')}</select>
    <button class="btn sec" type="button" data-ktpdfres${r.rows.length ? '' : ' disabled'}>Výsledky do PDF</button></div>`;
  if (!r.rows.length) return `${filters}<div class="card">${emptyState('Zatím žádná provedená kontrola', 'Výsledky se ukážou, jakmile se v plánu týdne zapíše první kontrola.')}</div>`;
  const tiles = `<div class="stats">${[
    statTile('Provedené kontroly', String(r.rows.length), `${new Set(r.rows.map(x => x.key)).size} ${lidiN(new Set(r.rows.map(x => x.key)).size)}`),
    statTile('Plnění bodů', ktPct(pts ? ok / pts * 100 : null), `${ok} z ${pts} ${bodyN(pts)}`, ok === pts ? 'good' : 'crit'),
    statTile('Bez chyby', `${clean}<em>/ ${r.rows.length}</em>`, 'kontrol se vším splněným', clean === r.rows.length ? 'good' : ''),
    statTile('Nejčastěji nesplněno', r.fails[0] ? `${r.fails[0].fail}×` : '—', r.fails[0] ? `${r.fails[0].text} (${r.fails[0].dept})` : 'nic', r.fails[0] ? 'crit' : ''),
  ].join('')}</div>`;
  const deptTable = `<div class="card"><h3>Po odděleních</h3><div class="table-card flat"><table class="stack"><thead><tr><th>Oddělení</th><th class="r">Kontrol</th><th class="r">Lidí</th><th class="r">Bez chyby</th><th>Plnění bodů</th></tr></thead><tbody>${r.depts.map(d => `<tr>
      <td class="name" data-label="Oddělení"><b>${esc(d.dept)}</b></td><td class="r num" data-label="Kontrol">${d.checks}</td><td class="r num" data-label="Lidí">${d.people}</td>
      <td class="r num" data-label="Bez chyby">${d.clean}/${d.checks}</td><td data-label="Plnění bodů">${effBar(d.pct)}</td></tr>`).join('')}</tbody></table></div></div>`;
  const failTable = r.fails.length ? `<div class="card"><h3>Nejčastěji nesplněné body</h3><div class="table-card flat"><table class="stack"><thead><tr><th>Bod</th><th>Oddělení</th><th class="r">Nesplněno</th></tr></thead><tbody>${r.fails.map(f => `<tr>
      <td data-label="Bod">${esc(f.text)}</td><td data-label="Oddělení">${esc(f.dept)}</td><td class="r num" data-label="Nesplněno"><b>${f.fail}×</b> <span class="muted">z ${f.n}</span></td></tr>`).join('')}</tbody></table></div></div>` : '';
  const list = `<div class="card"><h3>Provedené kontroly</h3><div class="table-card flat"><table class="stack kt-results"><thead><tr><th>Datum</th><th>Zaměstnanec</th><th>Oddělení</th><th>Kontroloval</th><th class="r">Výsledek</th><th>Nesplněno</th></tr></thead><tbody>${r.rows.slice(0, 300).map(c => `<tr>
      <td class="num nowrap" data-label="Datum">${esc(dayText(c.done))}</td>
      <td class="name" data-label="Zaměstnanec"><button class="linkish" type="button" data-ktperson="${esc(c.key)}">${esc(c.name)}</button></td>
      <td data-label="Oddělení">${esc(c.dept)}</td><td data-label="Kontroloval">${esc(c.checker || '—')}</td>
      <td class="r" data-label="Výsledek"><span class="t5-state ${c.score.ok === c.score.n ? 's-ok' : 's-fail'}">${c.score.ok}/${c.score.n}</span></td>
      <td data-label="Nesplněno">${c.score.fail.length ? c.score.fail.map(x => `${esc(x.text)}${x.note ? ` <span class="muted">(${esc(x.note)})</span>` : ''}`).join('; ') : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table></div></div>`;
  return `${filters}${tiles}<div class="grid-2 kt-res-grid">${deptTable}${failTable}</div>${list}`;
}

/* ---------- karta člověka (Lidé i Profil) ---------- */
function ktPersonCard(key, from, to) {
  const st = personAuditStats(key, from, to);
  const list = personChecks(key, from, to);
  const today = todayIso();
  const next = Object.entries(S.audit.plans).flatMap(([w, p]) => p.items.filter(i => i.key === key && i.state === 'plan').map(i => ({ ...i, week: w })))
    .sort((a, b) => (a.day < b.day ? -1 : 1))[0];
  if (!st.checks && !next) return '';
  return `<div class="card kt-person"><h3>Namátkové kontroly</h3>
    <p class="small">${st.checks ? `${st.checks} ${kontrolN(st.checks)} · splněno <b>${st.ok} z ${st.points}</b> ${bodyN(st.points)} (${ktPct(st.pct)}) · bez chyby ${st.clean}×` : 'Zatím bez provedené kontroly.'}
      ${next ? ` · ${next.day < today ? '<span class="pen">nezapsaná kontrola</span>' : 'další kontrola'} ${esc(ktDay(next.day, true))}` : ''}</p>
    ${list.length ? `<ul class="kt-history">${list.slice(0, 12).map(c => `<li><div class="kt-h-head"><b class="num">${esc(dayText(c.done))}</b><span class="t5-state ${c.score.ok === c.score.n ? 's-ok' : 's-fail'}">${c.score.ok}/${c.score.n}</span><span class="muted small">${esc(c.dept)}${c.checker ? ` · ${esc(c.checker)}` : ''}</span></div>
      ${c.score.fail.length ? `<ul class="kt-fails">${c.score.fail.map(r => `<li>${esc(r.text)}${r.note ? ` <span class="muted">– ${esc(r.note)}</span>` : ''}</li>`).join('')}</ul>` : '<p class="tiny muted">vše splněno</p>'}
      ${c.note ? `<p class="tiny t5-quote">${esc(c.note)}</p>` : ''}</li>`).join('')}</ul>` : ''}
  </div>`;
}

function ktOpenPerson(key) {
  if (!S.employees[key]) { toast('Člověk už v evidenci není.', true); return; }
  ui.selPerson = key;
  ui.personOpen = true;
  showView('lide');
  renderPeople();
}

function bindKontrolyEvents() {
  $('#ktTabs').addEventListener('click', event => {
    const b = event.target.closest('[data-kttab]');
    if (!b) return;
    ui.kt.tab = b.dataset.kttab;
    renderKontroly();
  });
  $('#ktSettings').onclick = ktSettings;
  const view = $('#ktView');
  view.addEventListener('click', async event => {
    const t = event.target;
    const wk = t.closest('[data-ktwk]');
    if (wk) { ui.kt.week = shiftWeek(ktWeekId(), +wk.dataset.ktwk); renderKontroly(); return; }
    if (t.closest('[data-ktgen]')) { ktGenerate(); return; }
    if (t.closest('[data-ktadd]')) { ktAddPerson(); return; }
    if (t.closest('[data-ktpdf]')) { exportAuditPlanPdf(ktWeekId(), t.closest('[data-ktpdf]')); return; }
    if (t.closest('[data-ktpdfres]')) { exportAuditResultsPdf(t.closest('[data-ktpdfres]')); return; }
    const go = t.closest('[data-kttabgo]');
    if (go) { ui.kt.tab = go.dataset.kttabgo; renderKontroly(); return; }
    const person = t.closest('[data-ktperson]');
    if (person) { ktOpenPerson(person.dataset.ktperson); return; }
    const range = t.closest('[data-ktrange]');
    if (range) { ui.kt.range = range.dataset.ktrange; renderKontroly(); return; }
    const id = ktWeekId();
    const itemId = (sel => { const b = t.closest(`[${sel}]`); return b ? b.getAttribute(sel) : null; });
    let x;
    if ((x = itemId('data-ktcheck'))) { const it = audItem(id, x); if (it) ktCheckForm(id, it); return; }
    if ((x = itemId('data-ktskip'))) {
      const it = audItem(id, x);
      const reason = await textBox('Kontrola neproběhla', `Proč neproběhla (${it.name})`, '', 'Zapsat', 'např. dovolená, nemoc, jiná práce', 300);
      if (reason == null) return;
      skipCheck(id, x, reason, ktMeta()); save(); renderKontroly(); return;
    }
    if ((x = itemId('data-ktsub'))) {
      const it = audItem(id, x);
      const reason = await textBox('Náhradník', `Proč se ${it.name} nekontroluje`, '', 'Vybrat náhradníka', 'např. dovolená', 300);
      if (reason == null) return;
      const sub = substituteCheck(id, x, reason || 'náhradník', ktMeta());
      if (!sub) { toast(`V oddělení ${it.dept} už není nikdo další, kdo by v plánu nebyl.`, true); return; }
      save(); renderKontroly(); toast(`Náhradník: ${sub.name}, ${ktDay(sub.day, true)}.`); return;
    }
    if ((x = itemId('data-ktdel'))) {
      const it = audItem(id, x);
      if (!(await confirmBox('Odebrat z plánu?', `${it.name} se v ${weekName(id)} kontrolovat nebude.`, 'Odebrat', true))) return;
      removeFromPlan(id, x); save(); renderKontroly(); return;
    }
    if ((x = itemId('data-ktundo'))) {
      const it = audItem(id, x);
      if (it.state === 'done' && !(await confirmBox('Zrušit zápis kontroly?', `Výsledek kontroly ${it.name} zmizí z jeho karty. V historii změn zůstane záznam.`, 'Zrušit zápis', true))) return;
      undoCheck(id, x); save(); renderKontroly(); return;
    }
    // nutné úkony
    const tl = ktTaskList(t);
    if (tl && t.closest('[data-ktaddtask]')) {
      const input = $('[data-ktnew]', t.closest('[data-ktdept]'));
      const text = input.value.trim();
      if (!text) { toast('Napiš text bodu.', true); input.focus(); return; }
      tl.list.push({ id: uid('t'), text: text.slice(0, 300) });
      save(); renderKontroly();
      const again = $(`[data-ktdept="${CSS.escape(tl.d)}"] [data-ktnew]`);
      if (again) again.focus();
      return;
    }
    const row = t.closest('[data-ktask]');
    if (tl && row) {
      const i = tl.list.findIndex(z => z.id === row.dataset.ktask);
      if (i < 0) return;
      if (t.closest('[data-ktup]') && i > 0) { [tl.list[i - 1], tl.list[i]] = [tl.list[i], tl.list[i - 1]]; save(); renderKontroly(); return; }
      if (t.closest('[data-ktdown]') && i < tl.list.length - 1) { [tl.list[i + 1], tl.list[i]] = [tl.list[i], tl.list[i + 1]]; save(); renderKontroly(); return; }
      if (t.closest('[data-ktrm]')) {
        if (!(await confirmBox('Smazat bod?', `„${tl.list[i].text}“ zmizí z nutných úkonů oddělení ${tl.d}. Zapsané kontroly zůstanou beze změny.`, 'Smazat', true))) return;
        tl.list.splice(i, 1);
        if (!tl.list.length) delete S.audit.tasks[tl.d];
        save(); renderKontroly(); return;
      }
    }
    const orphan = t.closest('[data-ktorphan]');
    if (orphan && t.closest('[data-ktdrop]')) {
      const o = orphan.dataset.ktorphan;
      if (!(await confirmBox('Smazat úkony?', `Nutné úkony oddělení ${o} se smažou. Zapsané kontroly zůstanou.`, 'Smazat', true))) return;
      delete S.audit.tasks[o]; save(); renderKontroly();
    }
  });
  view.addEventListener('change', event => {
    const t = event.target;
    if (t.id === 'ktWeekSel') { ui.kt.week = t.value; renderKontroly(); return; }
    if (t.id === 'ktDept') { ui.kt.dept = t.value; renderKontroly(); return; }
    if (t.dataset.ktmove) {
      const it = audItem(ktWeekId(), t.dataset.ktmove);
      if (it && it.state === 'plan') { it.day = t.value; save(); renderKontroly(); }
      return;
    }
    if ('ktf' in t.dataset) {
      const tl = ktTaskList(t);
      const task = tl && tl.list.find(z => z.id === t.closest('[data-ktask]').dataset.ktask);
      if (!task) return;
      const text = t.value.trim().slice(0, 300);
      if (!text) { toast('Prázdný bod smaž křížkem.', true); t.value = task.text; return; }
      task.text = text; save(); return;
    }
    if ('ktmerge' in t.dataset && t.value) {
      const o = t.closest('[data-ktorphan]').dataset.ktorphan;
      const target = S.audit.tasks[t.value] || (S.audit.tasks[t.value] = []);
      S.audit.tasks[o].forEach(x => { if (!target.some(y => y.text === x.text)) target.push({ id: target.some(y => y.id === x.id) ? uid('t') : x.id, text: x.text }); });
      delete S.audit.tasks[o];
      save(); renderKontroly(); toast(`Body převedeny na oddělení ${t.value}.`);
    }
  });
  view.addEventListener('keydown', event => {
    if (event.key === 'Enter' && 'ktnew' in event.target.dataset) { event.preventDefault(); $('[data-ktaddtask]', event.target.closest('[data-ktdept]')).click(); }
  });
}

async function ktSettings() {
  const st = audSet();
  const result = await dialog({
    title: 'Nastavení kontrol', ok: 'Uložit',
    html: `<label class="field"><span>Kolik lidí z každého oddělení týdně kontrolovat (%)</span><input type="number" name="pct" value="${st.pct}" min="5" max="100" step="1"></label>
      <p class="tiny muted">Počet se zaokrouhlí nahoru, z každého oddělení aspoň jeden. Při 25 % se všichni vystřídají za 4 týdny. Změna platí pro nově generované plány.</p>`,
  });
  if (result.value !== 'ok') return;
  const n = Number(result.form.elements.namedItem('pct').value);
  S.audit.settings = { pct: Number.isFinite(n) ? Math.round(clamp(n, 5, 100)) : st.pct };
  save(); renderKontroly(); toast('Nastavení kontrol uloženo.');
}

/* ---------- PDF: plán s kontrolními listy a výsledky ---------- */
function drawAuditPlan(doc, weekId) {
  const k = pdfKit(doc);
  const plan = audPlan(weekId);
  const today = todayIso();
  const sum = planSummary(weekId, today);
  k.header({ eyebrow: 'ODMĚNY · NAMÁTKOVÉ KONTROLY', right: `Stav k ${tsText(Date.now())}`, title: 'Plán namátkových kontrol', sub: weekLong(weekId),
    meta: `Z každého oddělení ${plan.pct} % lidí (zaokrouhleno nahoru), rozloženo do pracovních dnů. Přednost měli ti, kdo nejdéle nebyli kontrolovaní. Plán vygeneroval(a) ${plan.by || '—'} ${tsText(plan.at)}. U každého bodu se zaškrtne splněno, nebo nesplněno.` });
  k.tiles([
    ['Naplánováno', String(sum.planned), `${new Set(plan.items.map(i => i.dept)).size} oddělení`],
    ['Provedeno', `${sum.done} / ${sum.planned}`, sum.skip ? `${sum.skip} neproběhlo` : 'bez výpadku', sum.done && sum.done === sum.planned ? 'good' : ''],
    ['Plnění bodů', ktPct(sum.pct), sum.points ? `${sum.ok} z ${sum.points} bodů` : 'zatím nic zapsáno', sum.pct != null && sum.pct < 100 ? 'crit' : ''],
    ['Nezapsáno po termínu', String(sum.late), sum.late ? 'k doplnění' : 'vše v termínu', sum.late ? 'crit' : ''],
  ]);
  // přehled po dnech
  k.heading('Rozpis po dnech', 11);
  plan.days.forEach(d => {
    const items = plan.items.filter(i => i.day === d);
    const text = items.length ? items.map(i => `${i.name} (${i.dept})${i.state === 'skip' ? ' – neproběhlo' : ''}`).join(', ') : 'nikdo';
    const lines = k.split(text, k.CW - 30, 8.6);
    k.need(lines.length * k.LH(8.6, 1.32) + 2);
    k.text(ktDay(d, true), k.M, k.y, 8.8, { bold: true });
    lines.forEach((line, i) => k.text(line, k.M + 30, k.y + i * k.LH(8.6, 1.32), 8.6, { color: k.C.ink2 }));
    k.y += lines.length * k.LH(8.6, 1.32) + 2;
  });
  k.y += 3;
  // kontrolní listy
  const X = k.M, BW = 3.1;
  plan.days.forEach(d => {
    const items = plan.items.filter(i => i.day === d && i.state !== 'skip');
    items.forEach((it, idx) => {
      const tasks = it.state === 'done' ? it.results.map(r => ({ text: r.text, ok: r.ok, note: r.note })) : audTasks(it.dept).map(t => ({ text: t.text, ok: null, note: '' }));
      const draw = () => {
        pdfBand(k, `${ktDay(d, true)} · ${it.name}`, it.state === 'done' ? `${checkScore(it).ok}/${checkScore(it).n} splněno` : it.day < today ? 'nezapsáno' : 'plán',
          it.state === 'done' ? (checkScore(it).ok === checkScore(it).n ? 'ok' : 'fail') : it.day < today ? 'late' : 'v1', 9.5);
        k.text(`${it.dept}${it.state === 'done' ? ` · kontrola ${dayText(it.done)}${it.checker ? `, ${it.checker}` : ''}` : ''}`, X, k.y - 1.5, 8, { color: k.C.ink2 });
        k.y += 4.5;
        k.text('Bod', X + 7, k.y, 6.8, { bold: true, color: k.C.ink3 });
        k.text('Splněno', X + k.CW - 46, k.y, 6.8, { bold: true, color: k.C.ink3 });
        k.text('Nesplněno', X + k.CW - 30, k.y, 6.8, { bold: true, color: k.C.ink3 });
        k.y += 4;
        if (!tasks.length) { k.text('Oddělení nemá nutné úkony.', X + 7, k.y, 8.6, { color: k.C.warn }); k.y += 6; }
        tasks.forEach((t, i) => {
          const lines = k.split(t.text + (t.note ? ` – ${t.note}` : ''), k.CW - 60, 8.8);
          const h = lines.length * k.LH(8.8, 1.3) + 2.6;
          k.need(h);
          k.text(`${i + 1}.`, X, k.y, 8.8, { color: k.C.ink3 });
          lines.forEach((line, j) => k.text(line, X + 7, k.y + j * k.LH(8.8, 1.3), 8.8, { color: j && t.note ? k.C.ink2 : k.C.ink }));
          const cy = k.y + k.LH(8.8, 1.3) / 2;
          if (t.ok === true) k.check(X + k.CW - 42, cy, true); else k.check(X + k.CW - 42, cy, false);
          if (t.ok === false) { k.box(k.C.crit, X + k.CW - 25, cy - BW / 2, BW, BW, 0.6); if (!k.dry) { doc.setDrawColor(...k.C.white); doc.setLineWidth(0.45); doc.line(X + k.CW - 24.3, cy - 0.85, X + k.CW - 22.6, cy + 0.85); doc.line(X + k.CW - 22.6, cy - 0.85, X + k.CW - 24.3, cy + 0.85); } }
          else k.check(X + k.CW - 25, cy, false);
          k.y += h;
          k.hline(k.y - 1.2, k.C.line, 0.15);
        });
        if (it.state !== 'done') {
          k.y += 2;
          const sw = (k.CW - 12) / 3;
          ['Kontroloval', 'Datum', 'Podpis'].forEach((label, i) => { const x = X + i * (sw + 6); k.hline(k.y + 7, k.C.line2, 0.3, x, x + sw); k.text(label, x, k.y + 8.2, 7.4, { color: k.C.ink3 }); });
          k.y += 14;
        } else k.y += 5;
      };
      k.keep(draw, 50);
    });
  });
  k.footer(`Odměny · namátkové kontroly · ${weekName(weekId)} (${weekRange(weekById(weekId))})`);
}

function drawAuditResults(doc) {
  const k = pdfKit(doc);
  const range = KT_RANGES.find(r => r[0] === ui.kt.range) ? ui.kt.range : '12';
  const today = todayIso();
  const from = range === 'all' ? '' : addDays(today, -7 * +range);
  const r = auditResults(from, today, ui.kt.dept || '');
  const pts = r.rows.reduce((x, c) => x + c.score.n, 0), ok = r.rows.reduce((x, c) => x + c.score.ok, 0);
  const first = r.rows.length ? r.rows[r.rows.length - 1].done : today;
  k.header({ eyebrow: 'ODMĚNY · NAMÁTKOVÉ KONTROLY', right: `Stav k ${tsText(Date.now())}`, title: 'Výsledky namátkových kontrol',
    sub: `${ui.kt.dept ? `${ui.kt.dept} · ` : ''}${dayText(from || first)} – ${dayText(today)}`,
    meta: 'Plnění nutných úkonů podle zapsaných kontrol: po odděleních, nejčastěji nesplněné body a seznam kontrol s nesplněnými body.' });
  k.tiles([
    ['Provedené kontroly', String(r.rows.length), (n => `${n} ${lidiN(n)}`)(new Set(r.rows.map(x => x.key)).size)],
    ['Plnění bodů', ktPct(pts ? ok / pts * 100 : null), `${ok} z ${pts} bodů`, ok === pts ? 'good' : 'crit'],
    ['Bez chyby', `${r.rows.filter(c => c.score.ok === c.score.n).length} / ${r.rows.length}`, 'kontrol se vším splněným'],
    ['Oddělení', String(r.depts.length), r.depts.length ? r.depts.map(d => d.dept).join(', ') : '—'],
  ]);
  k.heading('Po odděleních', 11);
  const cols = [[60, 'Oddělení'], [22, 'Kontrol', 'r'], [20, 'Lidí', 'r'], [26, 'Bez chyby', 'r'], [50, 'Plnění bodů']];
  const head = c => { let x = k.M; c.forEach(([w, t, al]) => { k.text(t, al === 'r' ? x + w - 1.5 : x, k.y, 7.2, { bold: true, color: k.C.ink2, align: al === 'r' ? 'right' : 'left' }); x += w; }); k.y += 4.6; k.hline(k.y, k.C.line2, 0.3); k.y += 1; };
  head(cols);
  r.depts.forEach(d => {
    k.need(7);
    let x = k.M;
    k.text(d.dept, x, k.y + 1, 8.8, { bold: true }); x += cols[0][0];
    [String(d.checks), String(d.people), `${d.clean}/${d.checks}`].forEach((v, i) => { k.text(v, x + cols[1 + i][0] - 1.5, k.y + 1, 8.6, { align: 'right' }); x += cols[1 + i][0]; });
    k.box(k.C.soft3, x, k.y + 2, 26, 2.2, 1.1);
    k.box(d.pct >= 100 ? k.C.good : d.pct >= 85 ? k.C.warn : k.C.crit, x, k.y + 2, Math.max(1, 26 * (d.pct || 0) / 100), 2.2, 1.1);
    k.text(ktPct(d.pct), x + 29, k.y + 1, 8.6, { bold: true });
    k.y += 7;
    k.hline(k.y - 0.8);
  });
  k.y += 4;
  if (r.fails.length) {
    k.keep(() => {
      k.heading('Nejčastěji nesplněné body', 11);
      r.fails.forEach(f => {
        const lines = k.split(f.text, k.CW - 80, 8.6);
        const h = lines.length * k.LH(8.6, 1.3) + 1.8;
        k.need(h);
        lines.forEach((line, i) => k.text(line, k.M, k.y + i * k.LH(8.6, 1.3), 8.6));
        k.text(f.dept, k.M + k.CW - 74, k.y, 8.4, { color: k.C.ink2 });
        k.text(`${f.fail}× z ${f.n}`, k.M + k.CW, k.y, 8.6, { bold: true, color: k.C.crit, align: 'right' });
        k.y += h;
      });
      k.y += 4;
    }, 30);
  }
  k.need(26);
  k.signoff();
  k.heading('Provedené kontroly', 11);
  const lc = [[22, 'Datum'], [44, 'Zaměstnanec'], [34, 'Oddělení'], [16, 'Výsledek', 'r'], [62, 'Nesplněno']];
  k.onPage = () => head(lc);
  head(lc);
  r.rows.forEach(c => {
    const fail = c.score.fail.map(x => x.text + (x.note ? ` (${x.note})` : '')).join('; ') || '—';
    const fl = k.split(fail, lc[4][0] - 2, 7.8);
    const nm = k.split(c.name, lc[1][0] - 2, 8.2);
    const h = Math.max(fl.length * k.LH(7.8, 1.25), nm.length * k.LH(8.2, 1.25)) + 2.4;
    k.need(h);
    let x = k.M;
    k.text(dayText(c.done), x, k.y + 0.6, 8.2); x += lc[0][0];
    nm.forEach((line, i) => k.text(line, x, k.y + 0.6 + i * k.LH(8.2, 1.25), 8.2, { bold: true })); x += lc[1][0];
    k.text(k.split(c.dept, lc[2][0] - 2, 8)[0], x, k.y + 0.6, 8, { color: k.C.ink2 }); x += lc[2][0];
    k.text(`${c.score.ok}/${c.score.n}`, x + lc[3][0] - 1.5, k.y + 0.6, 8.2, { bold: true, align: 'right', color: c.score.ok === c.score.n ? k.C.good : k.C.crit }); x += lc[3][0] + 2;
    fl.forEach((line, i) => k.text(line, x, k.y + 0.6 + i * k.LH(7.8, 1.25), 7.8, { color: c.score.fail.length ? k.C.ink : k.C.ink3 }));
    k.y += h;
    k.hline(k.y - 0.8);
  });
  k.onPage = null;
  k.footer(`Odměny · výsledky namátkových kontrol · stav k ${dayText(today)}`);
}

async function exportAuditPlanPdf(weekId, button) {
  if (!audPlan(weekId)) return;
  await withPdf(button, doc => {
    doc.setProperties({ title: `Plán namátkových kontrol · ${weekName(weekId)}`, subject: weekLong(weekId), creator: 'Odměny' });
    drawAuditPlan(doc, weekId);
    const w = weekById(weekId);
    downloadFile(`kontroly-tyden-${w.w}-${w.y}.pdf`, doc.output('blob'), 'application/pdf');
  });
}
async function exportAuditResultsPdf(button) {
  await withPdf(button, doc => {
    doc.setProperties({ title: 'Výsledky namátkových kontrol', creator: 'Odměny' });
    drawAuditResults(doc);
    downloadFile(`kontroly-vysledky-${todayIso()}.pdf`, doc.output('blob'), 'application/pdf');
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
