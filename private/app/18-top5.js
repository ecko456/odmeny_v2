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
  renderFabDot();
}

function renderTop5() {
  const view = $('#t5View');
  if (!view || !S) return;
  renderTop5Badge();
  if (ui.t5.caseId && !effCase(ui.t5.caseId)) ui.t5.caseId = null;
  syncHistory();
  const late = effDeadlines().filter(x => x.late).length;
  const counts = { cases: S.eff.cases.filter(c => T5_FILTERS[0][2](caseState(c))).length, deadlines: effDeadlines(null, 14).length, reports: S.eff.reports.length };
  $('#t5Tabs').innerHTML = T5_TABS.map(([k, t]) => {
    const on = k === ui.t5.tab && !ui.t5.caseId;
    const n = counts[k];
    return `<button type="button" class="chip${on ? ' on' : ''}" data-t5tab="${k}" aria-pressed="${on}">${t}${n ? ` <em class="t5-count${k === 'deadlines' && late ? ' late' : ''}">${n}</em>` : ''}</button>`;
  }).join('');
  showActiveChip($('#t5Tabs'));
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
  const list = all.filter(x => filter[2](x.s) && (!q || norm(`${caseLabel(x.c)} ${x.c.ean} ${x.c.name} ${(lastComment(x.c) || {}).text || ''}`).includes(q)))
    .sort((a, b) => (a.s.late === b.s.late ? 0 : a.s.late ? -1 : 1) || (a.s.due || '9999') .localeCompare(b.s.due || '9999') || b.c.at - a.c.at);
  const del = filter[0] === 'zrus';   // zrušené jde smazat natrvalo přímo ze seznamu
  const chips = T5_FILTERS.map(([k, t, fn]) => `<button type="button" class="chip${k === filter[0] ? ' on' : ''}" data-t5filter="${k}" aria-pressed="${k === filter[0]}">${t} <em class="t5-count">${all.filter(x => fn(x.s)).length}</em></button>`).join('');
  return `<div class="toolbar t5-casebar"><div class="chips">${chips}</div><span class="spacer"></span>
      <input type="search" id="t5Q" value="${esc(ui.t5.q)}" placeholder="Hledat díl, případ nebo komentář…" aria-label="Hledat případ">
      <button class="btn sec" type="button" data-t5manual>Nový případ</button></div>
    ${list.length ? `<div class="table-card"><table class="stack t5-table"><thead><tr><th>Případ</th><th>Položka</th><th>Stav</th><th class="r">Kolo</th><th>Zjištěno</th><th>Další termín</th><th class="r" title="Plnění při zjištění → poslední ověření">Plnění před → po</th><th class="t5-lastc">Vývoj</th>${del ? '<th class="r" aria-label="Smazat"></th>' : ''}</tr></thead><tbody>${list.map(({ c, s, ba }) => `<tr class="t5-row" data-t5open="${esc(c.id)}" tabindex="0">
        <td class="name" data-label="Případ"><b>${esc(caseLabel(c))}</b></td>
        <td data-label="Položka"><div class="who"><b class="t5-ean">${esc(c.ean)}</b><span class="pos">${esc(c.name || 'bez názvu')}</span></div></td>
        <td data-label="Stav">${stateChip(s)}</td>
        <td class="r num" data-label="Kolo">${s.round}</td>
        <td class="num" data-label="Zjištěno">${c.week ? esc(weekName(c.week)) : esc(dayText(todayIso(c.at)))}</td>
        <td class="num" data-label="Další termín">${s.due ? esc(dayText(s.due)) : s.closed ? `<span class="muted">${esc(dayText(s.closed))}</span>` : '<span class="muted">—</span>'}</td>
        <td class="r num" data-label="Plnění před → po">${effPct(ba.before)} → ${ba.after == null ? '<span class="muted">—</span>' : `<b>${effPct(ba.after)}</b>`}</td>
        <td class="t5-lastc" data-label="Vývoj">${(k => (k ? `<span class="t5-lc"><small class="num">${esc(dayText(todayIso(k.at), false))}${c.comments.length > 1 ? ` · ${c.comments.length}×` : ''}</small>${esc(commentShort(k.text))}</span>` : '<span class="muted">—</span>'))(lastComment(c))}</td>${del ? `<td class="r t5-del" data-label=""><button class="btn ghost small t5-delbtn" type="button" data-t5delete="${esc(c.id)}">Smazat natrvalo</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`
      : `<div class="card">${emptyState(S.eff.cases.length ? 'Nic neodpovídá' : 'Zatím žádný případ', S.eff.cases.length ? 'Zkus jiný filtr nebo hledání.' : 'Případ se zakládá z týdenního žebříčku (tlačítko Založit případ), nebo ručně tlačítkem Nový případ.')}</div>`}
    <p class="hint">Jedna položka = jeden případ. Když se problém vrátí, otevře se v témž případu nové kolo a předchozí řešení zůstane v historii, ať se neopakuje.${del ? ' Zrušený případ jde smazat natrvalo: zmizí ze všech přehledů, termínů, PDF i vydaných reportů a nikde se už nepočítá.' : ''}</p>`;
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
  /* ✦ pod krokem 4: přeformulování kroků 1–4 (vše, nebo vybrané části), jen když je na serveru zapnuté */
  const ai = editable && ui.me && ui.me.ai
    ? `<div class="t5-ai-bar"><div><b>Profesionální znění</b><span class="tiny muted">Zkontroluje pravopis a přeformuluje kroky 1–4: vše, nebo jen vybrané části. Odejde jen jejich text, jména lidí se nahradí značkami.</span></div>
      <button class="btn sec small t5-ai" type="button" data-t5ai title="Přeformulovat do profesionálního znění (Claude Sonnet 5.5)">${I.sparkle}<span>Přeformulovat…</span></button></div>` : '';
  return `<div class="t5-steps">
    ${r.reason ? `<div class="note w"><b>Proč se otevřelo znovu:</b> ${esc(r.reason)}${r.base && r.base.eff != null ? ` <span class="muted">(${esc(weekName(r.week))}: plnění ${nf(r.base.eff, 1)} %)</span>` : ''}</div>` : ''}
    <section class="t5-step"><h4><i>1</i>Proč se to stalo</h4>${cat}${text('cause', 'Příčina nízkého plnění: co se na položce děje, proč je strávený čas vyšší než norma.')}</section>
    <section class="t5-step"><h4><i>2</i>Co s tím jde dělat</h4>${text('options', 'Možná řešení a jejich přínos pro průtok dílů.')}</section>
    <section class="t5-step"><h4><i>3</i>Co jde udělat hned</h4><p class="tiny muted">Okamžitá opatření bez dalších schvalování.</p>${t5ActionsHtml(r, 'now', editable)}</section>
    <section class="t5-step"><h4><i>4</i>Co si vyžádá procesní čas</h4><p class="tiny muted">Opatření, která potřebují čas na zpracování: žádost o změnu pohledovosti, přípravek s technologií, úprava normy…</p>${t5ActionsHtml(r, 'process', editable)}</section>
    ${ai}
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
      : s.k === 'zrus' ? `<div class="note w"><b>Případ je zrušený</b> (${esc(dayText(todayIso(c.cancelled.at)))}, ${esc(c.cancelled.by || '—')}): ${esc(c.cancelled.reason)} <button class="btn sec small" type="button" data-t5restore>Vrátit zrušení</button> <button class="btn btn-danger small" type="button" data-t5delete="${esc(c.id)}">Smazat natrvalo</button></div>` : '';
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
      ${t5CommentsHtml(c)}
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

/* Vývoj případu (2.19): průběžné komentáře, nejnovější nahoře. Rozepsaný text přežije překreslení. */
const T5_EDIT_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>';
function t5CommentsHtml(c) {
  const draft = ui.t5.cdraft && ui.t5.cdraft.id === c.id ? ui.t5.cdraft.text : '';
  const list = c.comments.slice().reverse();
  return `<div class="card t5-comments"><div class="card-head"><div><h3>Vývoj případu</h3><p class="small muted">Průběžné komentáře: co se děje, co se domluvilo, na co se čeká. Nejnovější nahoře.</p></div>
      ${list.length ? `<span class="t5-ccount">${list.length} ${list.length === 1 ? 'komentář' : list.length <= 4 ? 'komentáře' : 'komentářů'}</span>` : ''}</div>
    <div class="t5-cnew"><textarea id="t5Comment" rows="2" maxlength="${CASE_COMMENT_MAX}" placeholder="Co je v případu nového…" aria-label="Nový komentář k vývoji případu">${esc(draft)}</textarea>
      <div class="t5-cbar"><span class="tiny muted">Ctrl+Enter přidá komentář</span><button class="btn small" type="button" data-t5cadd>Přidat komentář</button></div></div>
    ${list.length ? `<ol class="t5-clist">${list.map(k => `<li data-t5c="${esc(k.id)}">
      <div class="t5-chead"><b>${esc(k.by || 'neznámá kartička')}</b><span class="num">${esc(tsText(k.at))}</span>${c.rounds.length > 1 ? `<span class="tag">kolo ${k.round}</span>` : ''}${k.ed ? `<span class="tiny muted" title="${esc(`Upravil ${k.ed.by || '—'} ${tsText(k.ed.at)}`)}">upraveno</span>` : ''}
        <span class="t5-cact"><button class="icon-btn" type="button" data-t5cedit aria-label="Upravit komentář" title="Upravit">${T5_EDIT_ICON}</button><button class="icon-btn" type="button" data-t5cdel aria-label="Smazat komentář" title="Smazat">${I.x}</button></span></div>
      <p>${esc(k.text)}</p></li>`).join('')}</ol>` : ''}</div>`;
}
function t5AddComment(c) {
  const box = $('#t5Comment');
  const text = box ? box.value.trim() : '';
  if (!text) { toast('Napiš, co je v případu nového.', true); if (box) box.focus(); return; }
  addCaseComment(c, text, effMeta());
  ui.t5.cdraft = null;
  save();
  renderTop5();
  toast('Komentář přidán.');
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

/* ✦ Přeformulování kroků 1–4 (verze 2.6). Vedoucí vybere části (vše, nebo jen některé),
   na server jde jen jejich text se jmény nahrazenými značkami – bez odpovědných osob,
   termínů a údajů o dílu. Návrh se ukáže po částech vedle původního textu; použije se
   jen to, co vedoucí potvrdí, a stejnou cestou jako ruční úprava (uložení, historie případu). */
const T5_AI_PARTS = [
  ['cause', '1 · Proč se to stalo'],
  ['options', '2 · Co s tím jde dělat'],
  ['now', '3 · Co jde udělat hned'],
  ['process', '4 · Co si vyžádá procesní čas'],
];
const T5_AI_MAX = 2000;
const T5_AI_TOTAL = 6000;

/** Texty kroků 1–4 aktuálního kola: příčina a možnosti jako jeden text, opatření každé zvlášť. */
function t5AiSources(r) {
  const out = {};
  for (const [key] of T5_AI_PARTS) {
    const items = key === 'cause' || key === 'options'
      ? (String(r[key] || '').trim().length >= 2 ? [{ id: key, ref: key, text: String(r[key]).trim() }] : [])
      : r.actions.filter(a => a.kind === key && liveText(a).length >= 2).map((a, i) => ({ id: `${key}-${i + 1}`, ref: a.id, text: liveText(a) }));
    const chars = items.reduce((sum, x) => sum + x.text.length, 0);
    out[key] = { items, chars, long: items.some(x => x.text.length > T5_AI_MAX) };
  }
  return out;
}

async function t5Rewrite(button) {
  const caseId = ui.t5.caseId;
  const c0 = caseId && effCase(caseId);
  if (!c0) return;
  const round = curRound(c0).n;
  const src = t5AiSources(curRound(c0));
  const usable = T5_AI_PARTS.filter(([k]) => src[k].items.length && !src[k].long).map(([k]) => k);
  if (!T5_AI_PARTS.some(([k]) => src[k].items.length)) { toast('Nejdřív vyplň aspoň jednu část (kroky 1–4), pak ji jde přeformulovat.', true); return; }

  // 1) Co přeformulovat: vše, nebo vybrané části.
  const preview = t => (t.length > 90 ? `${t.slice(0, 90)}…` : t);
  const pick = await dialog({
    title: 'Co přeformulovat', ok: 'Přeformulovat', cancel: 'Zrušit',
    html: `<p class="small">Vyber vše, nebo jen části, které chceš přeformulovat.</p>
      <label class="check ai-pick ai-all"><input type="checkbox" data-aiall${usable.length ? ' checked' : ''}><span><b>Vše</b><small>${usable.length} z 4 částí</small></span></label>
      <div class="ai-picks">${T5_AI_PARTS.map(([k, label]) => {
        const p = src[k];
        const note = !p.items.length ? 'nevyplněno'
          : p.long ? `text je delší než ${T5_AI_MAX} znaků, zkrať ho`
            : k === 'now' || k === 'process' ? `${p.items.length} opatření: ${preview(p.items.map(x => x.text).join('; '))}` : preview(p.items[0].text);
        const on = usable.includes(k);
        return `<label class="check ai-pick${on ? '' : ' off'}"><input type="checkbox" name="${k}"${on ? ' checked' : ' disabled'}><span><b>${esc(label)}</b><small>${esc(note)}</small></span></label>`;
      }).join('')}</div>
      <p class="tiny muted">Odejde jen text vybraných částí. Odpovědné osoby, termíny ani údaje o dílu se neposílají a jména lidí z evidence se nahradí značkami. Upraví ho Claude Sonnet 5.5 (Anthropic).</p>`,
    onOpen: dlg => {
      const all = $('[data-aiall]', dlg);
      const boxes = $$('.ai-picks input:not([disabled])', dlg);
      all.disabled = !boxes.length;
      all.addEventListener('change', () => boxes.forEach(b => { b.checked = all.checked; }));
      boxes.forEach(b => b.addEventListener('change', () => { all.checked = boxes.every(x => x.checked); }));
    },
    validate: form => {
      const keys = usable.filter(k => form.elements.namedItem(k).checked);
      if (!keys.length) return 'Vyber aspoň jednu část.';
      const total = keys.reduce((sum, k) => sum + src[k].chars, 0);
      return total > T5_AI_TOTAL ? `Vybrané části mají dohromady ${nf(total)} znaků, najednou jde nejvýš ${nf(T5_AI_TOTAL)}. Vyber jich méně.` : null;
    },
  });
  if (pick.value !== 'ok') return;
  const keys = usable.filter(k => pick.form.elements.namedItem(k).checked);
  const items = keys.flatMap(k => src[k].items.map(x => ({ ...x, part: k })));

  // 2) Odeslání: jen id a text částí, jména nahrazená značkami.
  const masked = maskNamesMany(items.map(x => x.text), S.employees);
  const busy = $('#t5View [data-t5ai]') || button;
  const label = busy.innerHTML;
  busy.disabled = true;
  busy.classList.add('busy');
  busy.innerHTML = `${I.sparkle}<span>Přeformulovávám…</span>`;
  let result = null;
  try {
    result = await Vault.api('ai_rewrite', { method: 'POST', body: { parts: items.map((x, i) => ({ id: x.id, text: masked.texts[i] })) } });
  } catch (error) {
    toast(error.message, true);
  } finally {
    const again = $('#t5View [data-t5ai]') || busy;
    again.disabled = false;
    again.classList.remove('busy');
    again.innerHTML = label;
  }
  const got = new Map((result && Array.isArray(result.parts) ? result.parts : []).filter(p => p && typeof p.text === 'string').map(p => [p.id, p.text]));
  if (!result) return;
  if (items.some(x => !got.has(x.id))) { toast('Odpověď nešla přečíst. Zkus to znovu.', true); return; }
  items.forEach(x => {
    const text = unmaskNames(got.get(x.id), masked.map).trim();
    // opatření je jeden řádek v poli o 1000 znacích, příčina a možnosti mají 4000
    x.proposal = x.part === 'now' || x.part === 'process' ? text.replace(/\s*\n+\s*/g, ' ').slice(0, 1000) : text.slice(0, 4000);
  });

  // 3) Návrh po částech: každá část jde použít, nebo nechat.
  const field = (x, k) => (k === 'now' || k === 'process'
    ? `<input type="text" name="v-${esc(x.id)}" value="${esc(x.proposal)}" maxlength="1000" aria-label="Návrh">`
    : `<textarea name="v-${esc(x.id)}" rows="5" maxlength="4000" aria-label="Návrh">${esc(x.proposal)}</textarea>`);
  const res = await dialog({
    title: 'Návrh profesionálního znění', ok: 'Použít vybrané', cancel: 'Zahodit', wide: true,
    html: `<div class="ai-parts">${keys.map(k => `<section class="ai-part">
        <label class="check ai-use"><input type="checkbox" name="use-${k}" checked><span><b>${esc(T5_AI_PARTS.find(p => p[0] === k)[1])}</b><small>použít návrh</small></span></label>
        ${items.filter(x => x.part === k).map(x => `<div class="ai-row"><div class="ai-orig">${esc(x.text)}</div>${field(x, k)}</div>`).join('')}
      </section>`).join('')}</div>
      <p class="tiny muted">Vlevo nahoře je původní text, pod ním návrh, který můžeš ještě upravit. Odeslán byl jen text vybraných částí${masked.map.length ? ` a jména lidí byla nahrazena značkami (${masked.map.length}×)` : ''}. Zkontroluj, že návrh sedí.</p>`,
    validate: form => {
      const used = keys.filter(k => form.elements.namedItem(`use-${k}`).checked);
      if (!used.length) return 'Zaškrtni aspoň jednu část, nebo dej Zahodit.';
      return items.some(x => used.includes(x.part) && !form.elements.namedItem(`v-${x.id}`).value.trim()) ? 'Návrh nesmí být prázdný.' : null;
    },
  });
  if (res.value !== 'ok') return;

  // 4) Použití: stejné zápisy jako při ručním psaní; co se mezitím změnilo, se nepřepíše.
  const c = effCase(caseId);
  const r = c && curRound(c);
  if (!r || r.n !== round) { toast('Případ se mezitím změnil, návrh se nepoužil.', true); return; }
  const meta = effMeta();
  const done = [];
  let skipped = 0;
  for (const k of keys) {
    if (!res.form.elements.namedItem(`use-${k}`).checked) continue;
    let used = 0;
    for (const x of items.filter(i => i.part === k)) {
      const value = res.form.elements.namedItem(`v-${x.id}`).value.trim();
      if (k === 'cause' || k === 'options') {
        if (String(r[k] || '').trim() !== x.text) { skipped++; continue; }
        if (value === String(r[k] || '').trim()) continue;
        r[k] = value.slice(0, 4000);
        effNote(c, meta, `${k === 'cause' ? 'Příčina' : 'Co s tím jde dělat'}: ${r[k]}`.slice(0, 500), true);
        used++;
      } else {
        const a = r.actions.find(i => i.id === x.ref);
        if (!a || liveText(a) !== x.text) { skipped++; continue; }
        const text = value.replace(/\s*\n+\s*/g, ' ').slice(0, 1000);
        if (text === liveText(a)) continue;
        a.text = text;
        effNote(c, meta, `${k === 'now' ? 'Okamžité opatření' : 'Opatření s procesním časem'} „${liveText(a)}“${a.owner ? `, odpovídá ${a.owner}` : ''}`, true);
        used++;
      }
    }
    if (used) done.push(T5_AI_PARTS.find(p => p[0] === k)[1].replace(/^\d · /, ''));
  }
  if (done.length) { save(); renderTop5(); }
  const changed = skipped === 1 ? 'Jedna část se mezitím změnila' : `${skipped} ${skipped < 5 ? 'části se mezitím změnily' : 'částí se mezitím změnilo'}`;
  if (skipped) toast(`${changed}, tam se návrh nepoužil.${done.length ? ` Přeformulováno: ${done.join(', ')}.` : ''}`, true);
  else toast(done.length ? `Přeformulováno: ${done.join(', ')}.` : 'Návrh je stejný jako původní text, nic se nezměnilo.');
}

/* Definitivní smazání zrušeného případu (z detailu i ze seznamu Zrušené). */
async function t5DeleteCase(id) {
  const c = effCase(id);
  if (!c || !c.cancelled) { toast('Smazat natrvalo jde jen zrušený případ.', true); return; }
  const ok = await confirmBox('Smazat případ natrvalo?',
    `Případ ${caseLabel(c)} (${c.ean}${c.name ? `, ${c.name}` : ''}) zmizí ze seznamu případů, souhrnů, termínů, PDF i z vydaných týdenních reportů a už se nikde nebude počítat. V historii změn zůstane jen záznam, kdo ho kdy smazal. Vrátit ho půjde jen obnovením starší verze dat (Nastavení → Historie verzí).`,
    'Smazat natrvalo', true);
  if (!ok) return;
  if (!deleteCase(id)) { toast('Smazat natrvalo jde jen zrušený případ.', true); return; }
  if (ui.t5.caseId === id) ui.t5.caseId = null;
  save(); renderTop5();
  toast(`Případ ${caseLabel(c)} je smazaný natrvalo.`);
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
  if (t.closest('[data-t5back]')) { navBack(prev => prev.odmView === 'top5' && !prev.sub, () => { ui.t5.caseId = null; renderTop5(); }); return true; }
  if (t.closest('[data-t5cadd]')) { t5AddComment(c); return true; }
  const ce = t.closest('[data-t5cedit]');
  if (ce) {
    const k = c.comments.find(x => x.id === ce.closest('[data-t5c]').dataset.t5c);
    if (!k) return true;
    const res = await dialog({ title: 'Upravit komentář', ok: 'Uložit', wide: true,
      html: `<p class="small muted">${esc(k.by || 'neznámá kartička')}, ${esc(tsText(k.at))}. Úprava se zapíše do historie případu.</p><label class="field"><span>Komentář</span><textarea name="text" rows="5" maxlength="${CASE_COMMENT_MAX}" autofocus>${esc(k.text)}</textarea></label>`,
      validate: form => (form.elements.namedItem('text').value.trim() ? null : 'Komentář nemůže být prázdný. Když už neplatí, smaž ho.') });
    if (res.value !== 'ok') return true;
    if (editCaseComment(c, k.id, res.form.elements.namedItem('text').value, effMeta())) { save(); renderTop5(); }
    return true;
  }
  const cd = t.closest('[data-t5cdel]');
  if (cd) {
    const k = c.comments.find(x => x.id === cd.closest('[data-t5c]').dataset.t5c);
    if (!k || !(await confirmBox('Smazat komentář?', `„${commentShort(k.text)}“ (${k.by || '—'}, ${tsText(k.at)}) zmizí z vývoje případu. V historii případu zůstane záznam.`, 'Smazat', true))) return true;
    deleteCaseComment(c, k.id, effMeta());
    save();
    renderTop5();
    return true;
  }
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
    const aiBtn = t.closest('[data-t5ai]');
    if (aiBtn) { if (!aiBtn.disabled) t5Rewrite(aiBtn); return; }
    const delBtn = t.closest('[data-t5delete]');
    if (delBtn) { t5DeleteCase(delBtn.dataset.t5delete); return; }
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
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && event.target.id === 't5Comment') {
      event.preventDefault();
      const c = ui.t5.caseId && effCase(ui.t5.caseId);
      if (c) t5AddComment(c);
      return;
    }
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
    if (event.target.id === 't5Comment') { ui.t5.cdraft = { id: ui.t5.caseId, text: event.target.value }; return; }
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

