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

function openDialog({ title, html = '', ok = 'OK', cancel = 'Zrušit', danger = false, wide = false, tall = false, onOpen = null, validate = null }) {
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
    dlg.classList.toggle('tall', tall);
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
  const note = store.note;
  // note.keep (2.35): poznámka a k ní i spočítané změny (třeba evidence práce nahraná spolu s výkazem)
  if (note && note.keep) { changes = describeChanges(store.base, shared, meta); changes.entries = [{ ...meta, kind: note.kind || 'data', text: note.text }, ...changes.entries]; }
  else if (note) changes.entries = [{ ...meta, kind: note.kind || 'data', text: note.text }];
  else changes = describeChanges(store.base, shared, meta);
  applyHist(shared, changes.hist);
  // Vrátit zpět (2.45): co přesně se změnilo, s hodnotami před změnou; záznamy historie na to odkazují
  const urec = changes.entries.length && store.base ? undoRecord(store.base, shared, meta) : null;
  if (urec && !urec.big) { shared.undo = undoPrune([...(shared.undo || []), urec], meta.at); changes.entries.forEach(x => { x.u = [urec.id]; }); }
  else shared.undo = undoPrune(shared.undo, meta.at);
  shared.log = appendLog(shared.log, changes.entries);
  try {
    const result = await Vault.saveData(shared, store.rev);
    store.rev = result.rev;
    store.savedAt = result.saved_at;
    store.error = null;
    store.base = shared;
    // Poznámka nastavená během ukládání (další import) patří do dalšího uložení, nesmí se ztratit (2.32).
    if (store.note === note) store.note = null;
    if (S) { applyHist(S, changes.hist); S.log = shared.log; S.undo = shared.undo; }
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

/* ---------- Souběžná práce víc lidí (2.62) ----------
   Když mezitím uložil někdo jiný, aplikace stáhne jeho verzi a sloučí ji s mými změnami
   (mergeStates). Okno se ukáže, jen když oba změnili stejný údaj. Navíc se každých 20 s
   (a při návratu do okna) podívá, jestli není novější verze, a sama ji načte. Překreslí se
   až po opuštění rozepsaného pole, otevřené okno počká. */
const SYNC_EVERY = 20000;
const sync = { busy: false, last: 0, waitBlur: false };
const dlgOpenNow = () => !!document.querySelector('dialog[open]');
function editingNow() {
  const a = document.activeElement;
  return !!a && a !== document.body && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !a.closest('dialog') && !['button', 'checkbox', 'radio', 'file'].includes(a.type);
}
function refreshView() {
  if (!S) return;
  if (editingNow()) {
    if (!sync.waitBlur) { sync.waitBlur = true; document.activeElement.addEventListener('blur', () => { sync.waitBlur = false; setTimeout(refreshView, 0); }, { once: true }); }
    return;
  }
  const y = window.scrollY;
  renderAll();
  window.scrollTo(0, y);
}
async function waitNoDialog(ms = 120000) {
  const end = Date.now() + ms;
  while (dlgOpenNow() && Date.now() < end) await new Promise(r => setTimeout(r, 400));
}
/** Okno střetu: u každého údaje, který změnili oba, vybrat moje, nebo jejich hodnotu. */
async function mergeDialog(conflicts, by) {
  const who = by || 'Druhý uživatel';
  const list = conflicts.slice(0, 60);
  const rows = list.map((c, i) => `<tr><td>${esc(c.path)}</td>
      <td><label class="check"><input type="radio" name="m${i}" value="mine" checked><span>${esc(mergeShow(c.mine))}</span></label></td>
      <td><label class="check"><input type="radio" name="m${i}" value="theirs"><span>${esc(mergeShow(c.theirs))}</span></label></td></tr>`).join('');
  const res = await dialog({
    title: 'Stejný údaj změnili dva lidé', ok: 'Uložit vybrané', cancel: '', wide: true,
    html: `<div class="merge-box"><p><b>${esc(who)}</b> mezitím uložil změny. Všechno ostatní se sloučilo samo. ${conflicts.length === 1 ? 'Jen u tohoto údaje' : `Jen u ${conflicts.length} údajů`} vyber, která hodnota platí.</p>
      <div class="row gap wrap"><button type="button" class="btn sec small" data-mpick="mine">Všude moje</button><button type="button" class="btn sec small" data-mpick="theirs">Všude ${esc(who)}</button></div>
      <div class="table-card flat"><table class="merge-tab"><thead><tr><th>Údaj</th><th>Moje</th><th>${esc(who)}</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${conflicts.length > list.length ? `<p class="small muted">U dalších ${conflicts.length - list.length} údajů platí moje hodnota.</p>` : ''}</div>`,
    onOpen: dlg => dlg.querySelector('.merge-box').addEventListener('click', event => {
      const b = event.target.closest('[data-mpick]');
      if (b) dlg.querySelectorAll(`.merge-tab input[value="${b.dataset.mpick}"]`).forEach(x => { x.checked = true; });
    }),
  });
  const picks = {};
  list.forEach((c, i) => { const el = res.form.querySelector(`input[name="m${i}"]:checked`); picks[c.key] = el ? el.value : 'mine'; });
  return picks;
}
/** Načtená verze ze serveru sloučená s mými změnami; S, základ a číslo verze se přepnou na ni. */
async function mergeTheirs(loaded, by) {
  const theirs = sharedState(sanitizeState(loaded.state || {}));
  const base = store.base || theirs;
  let r = mergeStates(base, sharedState(S), theirs);
  if (r.conflicts.length) {
    const picks = await mergeDialog(r.conflicts, by);
    r = mergeStates(base, sharedState(S), theirs, picks);
  }
  // na místě: obsluha rozepsaných polí drží odkazy na objekty v S a musí psát dál do platných dat
  const keep = { current: S.current, demoIssue: S._demoIssue, hidden: S.settings && S.settings.hiddenCols, lock: S.settings && S.settings.lockMinutes };
  mergeInto(S, sanitizeState(r.state));
  if (keep.current !== undefined) S.current = keep.current;
  if (keep.demoIssue !== undefined) S._demoIssue = keep.demoIssue;
  if (S.settings && keep.hidden !== undefined) S.settings.hiddenCols = keep.hidden;
  if (S.settings && keep.lock !== undefined) S.settings.lockMinutes = keep.lock;
  if (!S.periods[S.current]) applyPeriodPref();
  Object.assign(store, { rev: loaded.rev, savedAt: loaded.savedAt, base: theirs, error: null });
  store.dirty = !undoEq(sharedState(S), theirs);
  if (store.dirty && !store.firstDirty) store.firstDirty = Date.now();
  return r;
}
async function resolveConflict() {
  try {
    await waitNoDialog(60000);
    const loaded = await Vault.loadData();
    const info = await Vault.dataRev().catch(() => ({}));
    const by = info.rev === loaded.rev ? info.by : '';
    const r = await mergeTheirs(loaded, by);
    store.conflict = false;
    refreshView();
    if (r.theirs) toast(`Sloučeno se změnami, které mezitím uložil ${by || 'někdo jiný'}.`);
    if (store.dirty) flushSave();
    return;
  } catch (error) {
    console.warn('Sloučení se nepovedlo', error);
  }
  await resolveConflictOld();
}
/** Průběžná kontrola: je na serveru novější verze? Bez mých změn ji rovnou načte. */
async function syncCheck(force = false) {
  if (!S || sync.busy || sync.dead || ui.locking || document.hidden || store.saving || store.conflict) return;
  if (!force && Date.now() - sync.last < 3000) return;
  sync.last = Date.now();
  sync.busy = true;
  try {
    const info = await Vault.dataRev();
    if (!S || !info || info.rev === store.rev) return;
    if (store.dirty) { flushSave(); return; }   // uložení narazí na novou verzi a sloučí se
    if (dlgOpenNow()) return;                    // otevřené okno: příště
    const loaded = await Vault.loadData();
    if (!S || store.dirty || store.saving || store.conflict || loaded.rev === store.rev) return;
    await mergeTheirs(loaded, info.by);
    refreshView();
    renderSaveState();
    if (!info.mine) toast(`Data aktualizoval ${info.by || 'jiný uživatel'}.`);
    if (store.dirty) onStateChange();
  } catch (error) {
    // relace skončila: přestat se ptát, uložení ukáže okno Aplikace se zamkla; síť: zkusí se příště
    if (error && error.status === 401) sync.dead = true;
  } finally {
    sync.busy = false;
  }
}

async function resolveConflictOld() {
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

