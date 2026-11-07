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
  logbook: svg('<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 7.5h6M9 11h6"/>'),
  workaudit: svg('<path d="M3.5 20.5h11M6 16.5v-5M10 16.5V8"/><circle cx="16.5" cy="10.5" r="4"/><path d="m19.4 13.4 2.6 2.6"/>'),
  service: svg('<path d="M15 4.5a4.5 4.5 0 0 0-4.3 5.8L4 17a2.1 2.1 0 0 0 3 3l6.7-6.7A4.5 4.5 0 0 0 19.5 9l-2.7 2.7-3-.6-.6-3z"/>'),
  shortage: svg('<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="M12 9v4.5M12 16.5v.1"/>'),
  capplan: svg('<circle cx="9" cy="7.5" r="3"/><path d="M3.5 20v-1a5 5 0 0 1 5-5h1M15 20v-4M18.5 20v-7M22 20V10"/>'),
  task: svg('<path d="M9 5h11M9 12h11M9 19h11"/><path d="m3.5 5 1.2 1.2L7 4M3.5 12l1.2 1.2L7 11"/><circle cx="5" cy="19" r="1.4"/>'),
  data: svg('<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>'),
};
const LOG_FILTERS = [
  ['all', 'Vše', null],
  ['manual', 'Ruční úpravy', ['person', 'level', 'sanction', 'adjust', 'issue', 'position', 'settings', 'eff', 'audit', 'logbook', 'workaudit', 'service', 'shortage', 'capplan', 'task']],
  ['people', 'Lidé a úrovně', ['person', 'level']],
  ['sanction', 'Sankce', ['sanction']],
  ['tab', 'Tabáky a výdej', ['adjust', 'issue']],
  ['import', 'Importy a data', ['import', 'data']],
  ['settings', 'Skupiny a nastavení', ['position', 'settings']],
  ['eff', 'Top 5', ['eff']],
  ['audit', 'Kontroly', ['audit']],
  ['logbook', 'Protokoly', ['logbook']],
  ['workaudit', 'KPI', ['workaudit']],
  ['service', 'Servis', ['service']],
  ['shortage', 'Shortage', ['shortage']],
  ['capplan', 'Plán kapacit', ['capplan']],
  ['task', 'Úkoly', ['task']],
];

function unseenLog() {
  return (S?.log || []).filter(x => x.at > P.logSeen && x.card !== ui.me.cardId).length;
}

function renderLogBadge() {
  const badge = $('#logBadge');
  if (!badge || !S) return;
  renderRail();
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

function logListHtml(items, seen, withProfile = true, withUndo = false) {
  let html = '';
  let day = '';
  items.forEach(x => {
    const d = logDay(x.at);
    if (d !== day) { html += `<p class="log-day">${esc(d)}</p>`; day = d; }
    const isNew = x.at > seen && x.card !== ui.me.cardId;
    const time = new Date(x.at).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
    html += `<div class="log-item${isNew ? ' new' : ''}" data-kind="${esc(x.kind)}"><span class="log-ico">${LOG_ICON[x.kind] || LOG_ICON.data}</span>
      <div class="log-body"><p>${esc(x.text)}</p><small>${esc(time)} · ${esc(x.by || 'neznámá kartička')}${ui.me.cardId && x.card === ui.me.cardId ? ' (ty)' : ''}${isNew ? ' · <b>nové</b>' : ''}</small></div>
      <span class="log-acts">${withUndo && x.un ? `<span class="tag" title="Vráceno ${esc(new Date(x.un.at).toLocaleString('cs-CZ'))}${x.un.by ? ` · ${esc(x.un.by)}` : ''}">vráceno</span>` : ''}${withUndo && undoable(x) ? `<button class="btn sec small" type="button" data-logundo="${esc(`${x.at}|${x.u.join(',')}`)}">${I.undo}<span>Vrátit zpět</span></button>` : ''}${withProfile && x.key && S.employees[x.key] ? `<button class="btn ghost small" type="button" data-logprofile="${esc(x.key)}">Profil</button>` : ''}</span></div>`;
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
  let undoIds = null;
  const from = Date.now() - UNDO_DAYS * 864e5;
  await dialog({
    title: 'Poslední změny', wide: true, ok: '', cancel: 'Zavřít',
    html: `<p class="small muted">Úpravy dat za poslední 3 dny s tím, kdo je udělal (podle přihlášené kartičky) a kdy. Opakované úpravy téže věci během pár minut se slučují. <b>Vrátit zpět</b> vrátí jen tu změnu; co se od té doby změnilo znovu, nepřepíše.</p>
      <div class="log-tools"><div class="chips">${LOG_FILTERS.map(([k, t]) => `<button type="button" class="chip${k === 'all' ? ' on' : ''}" data-lf="${k}" aria-pressed="${k === 'all'}">${t}</button>`).join('')}</div>
      <input type="search" id="logQ" placeholder="Hledat jméno, kartičku nebo text…" aria-label="Hledat v historii"></div>
      <div class="log-list" id="logList"></div>`,
    onOpen: dlg => {
      const draw = () => {
        const kinds = LOG_FILTERS.find(f => f[0] === filter)[2];
        const recent = (S.log || []).filter(x => x.at >= from);
        const all = recent.slice().reverse().filter(x => (!kinds || kinds.includes(x.kind)) && (!query || norm(`${x.text} ${x.by}`).includes(query)));
        const items = all.slice(0, limit);
        $('#logList', dlg).innerHTML = items.length
          ? logListHtml(items, seen, true, true) + (all.length > limit ? `<button class="btn sec small wide" type="button" id="logMore">Zobrazit starší (${all.length - limit})</button>` : '')
          : emptyState(recent.length ? 'Nic neodpovídá' : 'Za poslední 3 dny žádné změny', recent.length ? 'Zkus jiný filtr nebo hledání.' : 'Každá úprava dat se tu objeví i s tím, kdo a kdy ji udělal.');
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
        const undo = event.target.closest('[data-logundo]');
        if (undo) { undoIds = undo.dataset.logundo; dlg.close('cancel'); return; }
        const button = event.target.closest('[data-logprofile]');
        if (button) { target = button.dataset.logprofile; dlg.close('cancel'); }
      };
      draw();
    },
  });
  if (undoIds) { await undoChange(undoIds); return; }
  if (target) openProfile(target);
}

/* Vrátit zpět (2.45): potvrzení se všemi záznamy stejného uložení, pak vrácení jen těch hodnot,
   které se od té doby nezměnily. Výsledek se uloží jako nová změna (jde vrátit i vrácení). */
async function undoChange(ref) {
  // rozběhnuté uložení se nejdřív dokončí (vrácení musí stavět na uložených datech)
  for (let i = 0; i < 75 && (store.dirty || store.saving) && !store.conflict && !store.error; i += 1) {
    await flushSave();
    if (store.dirty || store.saving) await new Promise(r => setTimeout(r, 200));
  }
  if (store.dirty || store.saving || store.conflict) { toast('Nejdřív se musí dokončit uložení dat, zkus to za chvíli.', true); return; }
  const [at, list0] = String(ref).split('|');
  const entry = (S.log || []).find(x => String(x.at) === at && x.u && x.u.join(',') === list0);
  if (!entry || !undoable(entry)) { toast('Tuhle změnu už vrátit nejde (je starší než 3 dny nebo už je vrácená).', true); return; }
  const ids = entry.u.slice();
  const want = new Set(ids);
  // stejné uložení mohlo změnit víc věcí: v potvrzení jsou všechny (nevrácené) záznamy, kterých se týká
  const entries = (S.log || []).filter(x => !x.un && x.u && x.u.some(id => want.has(id)));
  const list = entries.slice().reverse().map(x => `<li>${esc(x.text)} <small class="muted">${esc(new Date(x.at).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }))} · ${esc(x.by || '')}</small></li>`).join('');
  const res = await dialog({
    title: 'Vrátit zpět?', ok: 'Vrátit zpět', cancel: 'Nechat být',
    html: `<p>Data se vrátí do stavu před ${entries.length === 1 ? 'touto změnou' : 'těmito změnami (uložily se najednou)'}:</p><ul class="log-undolist">${list}</ul>
      <p class="small muted">Co se od té doby změnilo znovu, zůstane, jak je. Vrácení se zapíše do historie a jde ho zase vrátit.</p>`,
  });
  if (res.value !== 'ok') return;
  const r = undoApply(S, ids, { at: Date.now(), by: ui.me.label || '' });
  if (!r.done) { toast('Nic se nevrátilo: všechno z této změny se mezitím znovu změnilo.', true); return; }
  const keepLog = S.log;
  const keepUndo = S.undo;
  const cur = S.current;
  S = sanitizeState(S);
  S.log = keepLog;
  S.undo = keepUndo;
  if (cur) S.current = cur;
  applyPeriodPref();
  // jeden záznam o vrácení (bez slučování s původní změnou); i ten jde zase vrátit
  const head = entry.text;
  store.note = { kind: entry.kind || 'data', text: `Vráceno zpět: ${head.length > 300 ? `${head.slice(0, 300)}…` : head}` };
  save();
  renderAll();
  toast(r.skip ? `Vráceno zpět. ${r.skip} ${r.skip === 1 ? 'hodnota se mezitím znovu změnila a zůstala' : r.skip <= 4 ? 'hodnoty se mezitím znovu změnily a zůstaly' : 'hodnot se mezitím znovu změnilo a zůstalo'}.` : 'Vráceno zpět.');
}

