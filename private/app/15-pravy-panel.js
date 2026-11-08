/* ==========================================================================
   Pravý panel na širokém monitoru (2.59): kdo je přihlášený, rychlé akce, náhled úkolů
   (po termínu, blíží se, požadavky s vysokou závažností, další otevřené) a poslední změny
   s Vrátit zpět. Jen od 1600 px šířky okna, na menších monitorech a v telefonu se nekreslí.
   ========================================================================== */
const RAIL_MIN = 1600;
const railOn = () => window.matchMedia(`(min-width: ${RAIL_MIN}px)`).matches;
const RAIL_ACTS = [
  ['task', 'Nový úkol', '<path d="M12 5v14M5 12h14"/>'],
  ['rychla', 'Rychlá kontrola', '<path d="m5 12.5 4.5 4.5L19 7.5"/>'],
  ['sankce', 'Sankce', '<path d="M12 3.5 21 19.5H3z"/><path d="M12 10v4.5M12 17.2v.1"/>'],
  ['dochazka', 'Docházka', '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>'],
];
const railSvg = d => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
// Nový úkol má podnabídku (2.64): po najetí nebo fokusu se rozbalí dvojtlačítko Nový úkol / Požadavek pracovníka.
function railActHtml([k, l, d]) {
  const btn = `<button type="button" class="rail-act${ui.view === k ? ' on' : ''}" data-railact="${k}"${k === 'task' ? ' aria-haspopup="true"' : ''}><span class="rail-ic" aria-hidden="true">${railSvg(d)}</span><span>${l}</span></button>`;
  if (k !== 'task') return btn;
  return `<div class="rail-split">${btn}<div class="rail-sub" role="group" aria-label="Nový úkol">
    <button type="button" class="rail-subb" data-railact="task">${railSvg(d)}<span>Nový úkol</span></button>
    <button type="button" class="rail-subb" data-railact="taskreq">${railSvg('<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c.6-3.6 3.2-5.5 6.5-5.5 1.4 0 2.6.3 3.6.9M18 14v6M15 17h6"/>')}<span>Požadavek pracovníka</span></button></div></div>`;
}
// Karta Shortage (2.64): nejnovější seznam, počty a první TOP položky. Kreslí se vždy, CSS ji ukáže,
// jen když je panel širší než minimum (v panelu zbývá místo).
function railShortage() {
  const l = ((S.shortage && S.shortage.lists) || [])[0];
  if (!l) return { sig: null, html: '' };
  const items = l.items || [];
  const top = items.filter(i => i.top), top2 = items.filter(i => !i.top && i.top2);
  const rec = items.filter(i => i.rec).length;
  const shown = [...top, ...top2, ...items.filter(i => !i.top && !i.top2)].slice(0, 5);
  // položka (2.65): název otevře Shortage, EAN je odkaz, po najetí se rozbalí volba stavu
  const row = i => `<div class="rail-sh ${i.top ? 'top' : i.top2 ? 'top2' : ''}${i.st ? ` st-${i.st}` : ''}" data-railshid="${esc(i.id)}"><span class="rail-shtag">${i.top ? 'TOP' : i.top2 ? 'TOP 2' : '·'}</span><span class="rail-tmain"><button type="button" class="rail-shname" data-railgo="shortage">${esc(i.name || i.ean || '—')}</button>
      <small>${i.ean ? (i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener noreferrer" title="Otevřít odkaz">EAN ${esc(i.ean)} ↗</a>` : `EAN ${esc(i.ean)}`) : ''}${[i.qty ? `${i.qty} ks` : '', i.op || ''].filter(Boolean).map(x => ` · ${esc(x)}`).join('')}</small>
      ${i.st ? `<span class="rail-shst st-${i.st}">${esc(shStName(i.st))}</span>` : ''}
      <span class="rail-shstset" role="group" aria-label="Stav položky ${esc(i.ean || i.name)}">${SH_ST.map(([k, n]) => `<button type="button" class="${i.st === k ? 'on' : ''}" data-railshst="${k}" aria-pressed="${i.st === k}">${n}</button>`).join('')}</span></span></div>`;
  const html = `<section class="rail-card rail-short"><div class="rail-hrow"><h2 class="rail-h">Shortage</h2><button class="link small" type="button" data-railgo="shortage">Otevřít</button></div>
    <p class="rail-sum"><span class="tag">${items.length} ${items.length === 1 ? 'položka' : items.length <= 4 && items.length ? 'položky' : 'položek'}</span>${top.length ? `<span class="tag crit">${top.length} TOP</span>` : ''}${top2.length ? `<span class="tag warn">${top2.length} TOP 2</span>` : ''}${rec ? `<span class="tag">se záznamem ${rec}</span>` : ''}</p>
    ${shown.length ? `<div class="rail-tlist">${shown.map(row).join('')}</div>` : '<p class="small muted">Seznam je prázdný.</p>'}
    <p class="tiny muted rail-shfile">${esc(l.file || '')}${l.at ? ` · ${esc(tsText(l.at))}` : ''}</p></section>`;
  return { sig: [l.id, l.at, items.length, top.length, top2.length, rec, shown.map(i => [i.id, i.name, i.qty, i.op, i.link, i.st, i.rec && i.rec.state])], html };
}
// Kalendář (2.65): měsíc po dnech, svátky, víkendy a tečky událostí (úkoly s termínem, konce trestů,
// poznámky). Po najetí (nebo klepnutí) na den bublina se soupisem a tlačítkem Přidat poznámku.
const CAL_DOW = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const CAL_KIND = { hol: 'Svátek', task: 'Úkol', end: 'Konec trestu', note: 'Poznámka' };
let _railCalEv = {};
function railCalMonth() {
  if (!ui.railCal || !/^\d{4}-\d{2}$/.test(ui.railCal)) ui.railCal = todayIso().slice(0, 7);
  return ui.railCal;
}
function railCalendar(today) {
  const month = railCalMonth();
  const grid = calGrid(month);
  const ev = calEvents(grid[0].iso, grid[grid.length - 1].iso, S, today);
  _railCalEv = ev;
  const cell = d => {
    const list = ev[d.iso] || [];
    const kinds = ['task', 'end', 'note'].filter(k => list.some(e => e.k === k));
    const late = list.some(e => e.k === 'task' && e.late);
    const cls = ['rail-cd', d.out ? 'out' : '', d.we ? 'we' : '', d.hol ? 'hol' : '', d.iso === today ? 'today' : '', list.length ? 'has' : ''].filter(Boolean).join(' ');
    const label = `${dayText(d.iso)}${d.hol ? `, ${d.hol}` : ''}${list.filter(e => e.k !== 'hol').length ? `, událostí ${list.filter(e => e.k !== 'hol').length}` : ''}`;
    return `<button type="button" class="${cls}" data-calday="${d.iso}" aria-label="${esc(label)}"><span>${d.d}</span>${kinds.length ? `<i class="rail-cdots">${kinds.map(k => `<b class="k-${k}${k === 'task' && late ? ' late' : ''}"></b>`).join('')}</i>` : ''}</button>`;
  };
  const html = `<section class="rail-card rail-cal"><div class="rail-hrow"><h2 class="rail-h">Kalendář</h2>
      <span class="rail-calnav"><button type="button" class="icon-btn" data-calmove="-1" aria-label="Předchozí měsíc" title="Předchozí měsíc"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg></button><button type="button" class="link small rail-calm" data-calmove="0" title="Zpět na dnešek">${esc(ctrCap(monthLabel(month)))}</button><button type="button" class="icon-btn" data-calmove="1" aria-label="Další měsíc" title="Další měsíc"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button></span></div>
    <div class="rail-calgrid" role="grid" aria-label="${esc(monthLabel(month))}">${CAL_DOW.map((d, i) => `<span class="rail-cdow${i >= 5 ? ' we' : ''}">${d}</span>`).join('')}${grid.map(cell).join('')}</div>
    <p class="rail-calleg"><span><b class="k-task"></b>úkol</span><span><b class="k-end"></b>konec trestu</span><span><b class="k-note"></b>poznámka</span><span><i class="hol"></i>svátek</span></p>
    <div class="rail-calpop" id="railCalPop" role="dialog" aria-label="Události dne" hidden></div></section>`;
  return { sig: [month, ev], html };
}
function railCalPopHtml(iso) {
  const list = _railCalEv[iso] || [];
  const d = new Date(`${iso}T12:00:00`);
  const head = d.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
  const we = d.getDay() === 0 || d.getDay() === 6;
  const row = e => {
    const tag = `<span class="rail-cpk k-${e.k}">${CAL_KIND[e.k]}</span>`;
    if (e.k === 'task') return `<button type="button" class="rail-cpi" data-caltask="${esc(e.id)}">${tag}<span>${esc(e.text)}${e.late ? ' <em class="late">po termínu</em>' : ''}</span></button>`;
    if (e.k === 'end') return `<button type="button" class="rail-cpi" data-calperson="${esc(e.key)}">${tag}<span>${esc(e.text)}</span></button>`;
    if (e.k === 'note') return `<div class="rail-cpi">${tag}<span>${esc(e.text)}<small>${esc(e.by || '')}${e.at ? ` · ${esc(tsText(e.at))}` : ''}</small></span><button type="button" class="icon-btn rail-cpdel" data-calnotedel="${esc(e.id)}" aria-label="Smazat poznámku" title="Smazat poznámku">×</button></div>`;
    return `<div class="rail-cpi">${tag}<span>${esc(e.text)}</span></div>`;
  };
  return `<p class="rail-cph"><b>${esc(ctrCap(head))}</b>${we ? '<span class="tag">víkend</span>' : ''}</p>
    ${list.length ? `<div class="rail-cplist">${list.map(row).join('')}</div>` : '<p class="small muted">Žádné události.</p>'}
    <button type="button" class="btn sec small rail-cpadd" data-calnote="${iso}">+ Přidat poznámku</button>`;
}
let _calHide = 0;
function railCalShow(iso, pin) {
  const pop = $('#railCalPop'), btn = $(`#rail [data-calday="${iso}"]`);
  if (!pop || !btn) return;
  clearTimeout(_calHide);
  if (pop.dataset.iso !== iso || pop.hidden) pop.innerHTML = railCalPopHtml(iso);
  pop.dataset.iso = iso;
  if (pin) pop.dataset.pin = '1';
  pop.hidden = false;
  $$('#rail .rail-cd.sel').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  const card = pop.parentElement.getBoundingClientRect(), r = btn.getBoundingClientRect();
  const w = pop.offsetWidth;
  pop.style.left = `${Math.max(8, Math.min(card.width - w - 8, r.left - card.left + r.width / 2 - w / 2))}px`;
  pop.style.top = `${r.bottom - card.top + 6}px`;
}
function railCalHide(now) {
  const pop = $('#railCalPop');
  if (!pop) return;
  clearTimeout(_calHide);
  const go = () => { pop.hidden = true; delete pop.dataset.pin; delete pop.dataset.iso; $$('#rail .rail-cd.sel').forEach(b => b.classList.remove('sel')); };
  if (now) go(); else _calHide = setTimeout(() => { if (!pop.dataset.pin) go(); }, 280);
}
async function railCalNote(iso) {
  const res = await dialog({
    title: `Poznámka na ${dayText(iso)}`, ok: 'Přidat poznámku',
    html: `<label class="field"><span>Poznámka</span><textarea name="text" rows="4" maxlength="${CAL_NOTE_LEN}" autofocus placeholder="třeba návštěva auditora, inventura, porada"></textarea></label>`,
    validate: form => (form.elements.text.value.trim() ? '' : 'Napiš text poznámky.'),
  });
  if (res.value !== 'ok') return;
  const n = calNoteAdd(S, iso, res.form.elements.text.value, { at: Date.now(), by: ui.me.label || '' });
  if (n.err) { toast(n.err, true); return; }
  save();
  _railSig = '';
  renderRail();
  railCalShow(iso, true);
  toast('Poznámka přidána do kalendáře.');
}
// Časová osa (2.66): pod kalendářem, 2 hodiny zpět a 3 dopředu od teď. Hodiny jako značky na ose,
// úkoly v pořadí času, čára „teď“ mezi minulými a budoucími. Klepnutí na kroužek = splněno v ten den.
const AG_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
function railAgenda(now) {
  const w = agWindow(S.agenda || [], now);
  const hm = ts => new Date(ts).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  // hodinové značky v okně
  const marks = [];
  const h0 = new Date(w.from); h0.setMinutes(0, 0, 0);
  for (let t = h0.getTime() + (h0.getTime() < w.from ? 3600e3 : 0); t <= w.to; t += 3600e3) marks.push({ ts: t, k: 'h' });
  const rows = [...marks, { ts: now, k: 'now' }, ...w.items.map(o => ({ ts: o.ts, k: 'i', o }))]
    .sort((a, b) => a.ts - b.ts || (a.k === 'h' ? -1 : b.k === 'h' ? 1 : a.k === 'now' ? (b.o && b.o.past ? 1 : -1) : 0));
  const row = r => {
    if (r.k === 'h') return `<div class="ag-hour${r.ts < now ? ' past' : ''}"><span>${esc(hm(r.ts))}</span></div>`;
    if (r.k === 'now') return `<div class="ag-now" aria-label="Teď"><span>teď ${esc(hm(now))}</span></div>`;
    const { x, iso, done, past, other } = r.o;
    return `<div class="ag-item${past ? ' past' : ''}${done ? ' done' : ''}${past && !done ? ' miss' : ''}" data-agid="${esc(x.id)}" data-agday="${iso}">
      <button type="button" class="ag-dot" data-agdone aria-pressed="${done}" title="${done ? 'Splněno: klepnutím zrušíš' : 'Označit jako splněné'}" aria-label="${done ? 'Zrušit splnění' : 'Splněno'}: ${esc(x.title)}">${done ? AG_ICON : ''}</button>
      <button type="button" class="ag-body" data-agedit title="Upravit"><b>${esc(x.time)}${other ? ` <small>${esc(dayText(iso, false))}</small>` : ''}</b><span>${esc(x.title)}</span>${x.rep !== 'once' ? `<em>${esc(agRepName(x.rep).toLowerCase())}${x.work ? ' · pracovní dny' : ''}</em>` : ''}</button></div>`;
  };
  const html = `<section class="rail-card rail-agenda"><div class="rail-hrow"><h2 class="rail-h">Časová osa</h2><button class="link small" type="button" data-agadd>+ Přidat</button></div>
    <div class="ag-axis">${rows.map(row).join('')}</div>
    ${w.items.length ? '' : '<p class="small muted ag-empty">V tomto čase nic naplánovaného.</p>'}</section>`;
  return { sig: [Math.floor(now / 60e3), w.items.map(o => [o.x.id, o.iso, o.x.time, o.x.title, o.x.rep, o.done])], html };
}
async function agDialog(x) {
  const now = new Date();
  const def = x || { title: '', time: `${String(now.getHours() + 1 > 23 ? 23 : now.getHours() + 1).padStart(2, '0')}:00`, rep: 'once', date: todayIso(), note: '', work: true };
  const res = await dialog({
    title: x ? 'Upravit úkol na časové ose' : 'Nový úkol na časové ose', ok: x ? 'Uložit' : 'Přidat', wide: true,
    html: `<label class="field"><span>Co je třeba udělat</span><input name="title" maxlength="200" autofocus autocomplete="off" value="${esc(def.title)}" placeholder="třeba kontrola tlaku vzduchu, porada směny"></label>
      <div class="form-grid tk-grid">
        <label class="field"><span>Čas</span><input type="time" name="time" value="${esc(def.time)}"></label>
        <label class="field"><span>Opakování</span><select name="rep">${AG_REP.map(([k, l]) => `<option value="${k}"${def.rep === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Den (u opakování od kdy; den v týdnu a v měsíci se bere z něj)</span><input type="date" name="date" value="${esc(def.date)}"></label>
      </div>
      <label class="check ag-workchk"><input type="checkbox" name="work"${def.work ? ' checked' : ''}> Jen pracovní dny (bez víkendů a státních svátků, u opakování)</label>
      <label class="field"><span>Poznámka</span><input name="note" maxlength="500" autocomplete="off" value="${esc(def.note || '')}"></label>
      ${x ? '<label class="check ag-delchk"><input type="checkbox" name="del"> Smazat tento úkol</label>' : ''}`,
    validate: form => {
      const f = form.elements;
      if (f.del && f.del.checked) return '';
      if (!f.title.value.trim()) return 'Napiš, co je třeba udělat.';
      if (!agTimeOk(f.time.value)) return 'Zadej čas.';
      if (!f.date.value) return 'Zadej den.';
      return '';
    },
  });
  if (res.value !== 'ok') return;
  const f = res.form.elements;
  if (x && f.del && f.del.checked) {
    agDel(S, x.id);
    save(); _railSig = ''; renderRail();
    toast('Úkol z časové osy smazán.');
    return;
  }
  const v = { title: f.title.value, time: f.time.value, rep: f.rep.value, date: f.date.value, note: f.note.value, work: f.work.checked };
  const r = x ? agSet(S, x.id, v) : agAdd(S, v, { at: Date.now(), by: ui.me.label || '' });
  if (r.err) { toast(r.err, true); return; }
  save(); _railSig = ''; renderRail();
  toast(x ? 'Úkol upraven.' : `Přidáno na ${r.time}${r.rep !== 'once' ? `, ${agRepName(r.rep).toLowerCase()}` : ''}.`);
}
let _railSig = '';
function renderRail() {
  const box = $('#rail');
  if (!box || !S) return;
  const on = railOn();
  document.body.classList.toggle('has-rail', on);
  if (!on) { if (box.innerHTML) { box.innerHTML = ''; _railSig = ''; } return; }
  const today = todayIso();
  const o = tkOverview(S, today);
  const open = tkSort(tkList().filter(t => TK_OPEN.has(t.state)));
  const seen = new Set();
  const pick = [];
  const add = (t, why) => { if (!seen.has(t.id)) { seen.add(t.id); pick.push([t, why]); } };
  o.late.forEach(t => add(t, 'late'));
  o.soon.forEach(t => add(t, 'soon'));
  open.filter(t => tkIsReq(t) && t.sev === 'high').forEach(t => add(t, 'high'));
  open.forEach(t => add(t, ''));
  const shown = pick.slice(0, 6);
  const from = Date.now() - UNDO_DAYS * 864e5;
  const logs = (S.log || []).filter(x => x.at >= from).slice(-4).reverse();
  const h = new Date().getHours();
  const sh = railShortage();
  const cal = railCalendar(today);
  const ag = railAgenda(Date.now());
  const sig = JSON.stringify([sh.sig, cal.sig, ag.sig, today, h < 10 ? 0 : h < 18 ? 1 : 2, ui.view, shown.map(([t, w]) => [t.id, t.state, t.due, t.title, t.owner, t.sev, w]), logs.map(x => [x.at, x.text, !!x.un, undoable(x)]), o.open, o.late.length, o.soon.length, ui.me && ui.me.label]);
  if (sig === _railSig && box.innerHTML) return;
  _railSig = sig;
  const popWas = $('#railCalPop');
  const keepIso = popWas && !popWas.hidden && popWas.dataset.pin ? popWas.dataset.iso : '';
  const name = (ui.me && ui.me.label) || 'Přihlášený';
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const dayText = new Date().toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
  const taskRow = ([t, why]) => {
    const d = tkDue(t, today);
    const when = t.due ? tkDueText(t, today) : tkIsReq(t) && t.sev ? `${tkSevName(t.sev).toLowerCase()} závažnost` : 'bez termínu';
    const who = tkIsReq(t) ? tkPersonName(t) : t.owner;
    return `<button type="button" class="rail-task ${why || (d.late ? 'late' : d.soon ? 'soon' : '')}" data-railtask="${esc(t.id)}">
      <span class="rail-tdot" aria-hidden="true"></span><span class="rail-tmain"><b>${esc(t.title)}</b><small>${esc(when)}${who ? ` · ${esc(who)}` : ''}</small></span></button>`;
  };
  const logRow = x => `<div class="rail-log"><span class="log-ico">${LOG_ICON[x.kind] || LOG_ICON.data}</span><div><p>${esc(x.text.length > 110 ? `${x.text.slice(0, 110)}…` : x.text)}</p>
      <small>${esc(new Date(x.at).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }))} · ${esc(x.by || '')}${x.un ? ' · vráceno' : ''}</small></div>${undoable(x) ? `<button class="icon-btn" type="button" data-logundo="${esc(`${x.at}|${x.u.join(',')}`)}" title="Vrátit zpět" aria-label="Vrátit zpět">${I.undo}</button>` : ''}</div>`;
  // Pevné skupiny karet (2.65): a = kdo, akce, kalendář; b = úkoly, Shortage; c = poslední změny.
  // V úzkém panelu pod sebou v tomto pořadí, v širším ve sloupcích (CSS), nic se nepřeskupuje podle výšky.
  box.innerHTML = `<div class="rail-in"><div class="rail-col rail-ca">
    <section class="rail-card rail-me"><span class="rail-av" aria-hidden="true">${esc(ini)}</span><div><p class="rail-hi">${esc(greeting(h))}</p><b>${esc(name)}</b><small>${esc(dayText)}</small></div></section>
    <section class="rail-card"><h2 class="rail-h">Rychlé akce</h2><div class="rail-acts">${RAIL_ACTS.map(railActHtml).join('')}</div></section>
    ${cal.html}${ag.html}</div><div class="rail-col rail-cb">
    <section class="rail-card rail-tasks"><div class="rail-hrow"><h2 class="rail-h">Úkoly</h2><button class="link small" type="button" data-railgo="ukoly">Vše (${o.open})</button></div>
      ${o.late.length || o.soon.length ? `<p class="rail-sum">${o.late.length ? `<span class="tag crit">${o.late.length} po termínu</span>` : ''}${o.soon.length ? `<span class="tag warn">${o.soon.length} blíží se</span>` : ''}</p>` : ''}
      ${shown.length ? `<div class="rail-tlist">${shown.map(taskRow).join('')}</div>${pick.length > shown.length ? `<p class="tiny muted">a další otevřené (${pick.length - shown.length})</p>` : ''}` : `<p class="small muted">${tkList().length ? 'Žádný otevřený úkol.' : 'Zatím žádné úkoly.'}</p>`}</section>
    ${sh.html}</div><div class="rail-col rail-cc">
    <section class="rail-card rail-logs"><div class="rail-hrow"><h2 class="rail-h">Poslední změny</h2><button class="link small" type="button" data-raillog>Vše</button></div>
      ${logs.length ? logs.map(logRow).join('') : '<p class="small muted">Za poslední 3 dny žádné změny.</p>'}</section>
  </div></div>`;
  if (keepIso && $(`#rail [data-calday="${keepIso}"]`)) railCalShow(keepIso, true);
}
function bindRail() {
  const box = $('#rail');
  if (!box) return;
  box.addEventListener('mouseover', event => {
    const d = event.target.closest('[data-calday]');
    const pop = $('#railCalPop');
    if (d) { if (!pop || !pop.dataset.pin || pop.dataset.iso === d.dataset.calday) railCalShow(d.dataset.calday); return; }
    if (event.target.closest('#railCalPop')) clearTimeout(_calHide);
  });
  box.addEventListener('mouseout', event => {
    const from = event.target.closest('[data-calday], #railCalPop');
    const to = event.relatedTarget && event.relatedTarget.closest && event.relatedTarget.closest('[data-calday], #railCalPop');
    if (from && !to) railCalHide();
  });
  document.addEventListener('click', event => {
    const pop = $('#railCalPop');
    if (pop && !pop.hidden && !event.target.closest('#railCalPop, [data-calday]') && !event.target.closest('#dlg')) railCalHide(true);
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('#railCalPop') && !$('#railCalPop').hidden && !$('#dlg[open]')) railCalHide(true); });
  box.addEventListener('click', event => {
    const t = event.target;
    const day = t.closest('[data-calday]');
    if (day) {
      const pop = $('#railCalPop');
      if (pop && !pop.hidden && pop.dataset.pin && pop.dataset.iso === day.dataset.calday) railCalHide(true); else railCalShow(day.dataset.calday, true);
      return;
    }
    if (t.closest('[data-agadd]')) { agDialog(null); return; }
    const agRow = t.closest('[data-agid]');
    if (agRow) {
      const x = (S.agenda || []).find(a => a.id === agRow.dataset.agid);
      if (!x) return;
      if (t.closest('[data-agdone]')) {
        const on = !(x.done && x.done[agRow.dataset.agday]);
        if (agDone(S, x.id, agRow.dataset.agday, on, { at: Date.now(), by: ui.me.label || '' })) { save(); _railSig = ''; renderRail(); }
      } else if (t.closest('[data-agedit]')) agDialog(x);
      return;
    }
    const sst = t.closest('[data-railshst]');
    if (sst) {
      const l = ((S.shortage && S.shortage.lists) || [])[0], row = sst.closest('[data-railshid]');
      const it = l && row && l.items.find(x => x.id === row.dataset.railshid);
      if (!it) return;
      const st = it.st === sst.dataset.railshst ? '' : sst.dataset.railshst;   // znovu klepnutí stav zruší
      if (shSetStatus(l, it.id, st, { at: Date.now(), by: ui.me.label || '' })) {
        save(); _railSig = ''; renderRail();
        if (ui.view === 'shortage') renderShortage();
        toast(st ? `${it.ean || it.name}: ${shStName(st)}` : `${it.ean || it.name}: stav zrušen`);
      }
      return;
    }
    const mv = t.closest('[data-calmove]');
    if (mv) {
      const n = +mv.dataset.calmove, m = railCalMonth();
      if (!n) ui.railCal = todayIso().slice(0, 7);
      else { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1)); ui.railCal = d.toISOString().slice(0, 7); }
      renderRail();
      return;
    }
    const cn = t.closest('[data-calnote]');
    if (cn) { railCalNote(cn.dataset.calnote); return; }
    const cdel = t.closest('[data-calnotedel]');
    if (cdel) {
      const iso = $('#railCalPop').dataset.iso;
      confirmBox('Smazat poznámku?', 'Poznámka zmizí z kalendáře (v historii změn zůstane záznam).', 'Smazat', true).then(ok => {
        if (!ok || !calNoteDel(S, cdel.dataset.calnotedel)) return;
        save(); _railSig = ''; renderRail();
        if (iso) railCalShow(iso, true);
      });
      return;
    }
    const ct = t.closest('[data-caltask]');
    if (ct) { railCalHide(true); openTaskFromPerson(ct.dataset.caltask); return; }
    const cp = t.closest('[data-calperson]');
    if (cp) { railCalHide(true); openPersonKey(cp.dataset.calperson); return; }
    const task = t.closest('[data-railtask]');
    if (task) { openTaskFromPerson(task.dataset.railtask); return; }
    const act = t.closest('[data-railact]');
    if (act) {
      const k = act.dataset.railact;
      if (k === 'task' || k === 'taskreq') { act.blur(); (k === 'task' ? tkNewDialog() : tkReqDialog(null)); } else showView(k);
      return;
    }
    const go = t.closest('[data-railgo]');
    if (go) { ui.tk.sel = null; showView(go.dataset.railgo); return; }
    if (t.closest('[data-raillog]')) { openLog(); return; }
    const undo = t.closest('[data-logundo]');
    if (undo) undoChange(undo.dataset.logundo);
  });
  window.matchMedia(`(min-width: ${RAIL_MIN}px)`).addEventListener('change', () => { _railSig = ''; renderTaskAlert(); });
  // pozdrav a „dnes“ se mění s časem
  // pozdrav, „dnes“ a okno časové osy se mění s časem (podpis se mění po minutách, jinak nic nepřekreslí)
  setInterval(() => { if (railOn()) renderRail(); }, 60 * 1000);
}

/* Sbalitelné boční menu (2.59): úzká kapsle jen s ikonami, popisky po najetí. Volba je jen pro
   toto zařízení (localStorage podle adresy aplikace), ne v datech ani v osobním nastavení. */
const SIDE_KEY = `odmeny.side.v1:${location.pathname.replace(/[^/]*$/, '')}`;
function sideMiniGet() { try { return localStorage.getItem(SIDE_KEY) === 'mini'; } catch (error) { return false; } }
function sideMiniSet(on) {
  try { if (on) localStorage.setItem(SIDE_KEY, 'mini'); else localStorage.removeItem(SIDE_KEY); } catch (error) { /* soukromé okno: volba platí jen do zavření */ }
  applySideMini(on);
}
function applySideMini(on) {
  document.documentElement.classList.toggle('side-mini', on);
  const b = $('#sideMini');
  if (b) { b.setAttribute('aria-pressed', String(on)); b.title = on ? 'Rozbalit menu' : 'Sbalit menu'; b.setAttribute('aria-label', b.title); const t = b.querySelector('span'); if (t) t.textContent = b.title; }
  // v úzkém menu je popisek jen v title (najetí myší) a aria-label
  $$('#nav button').forEach(button => {
    const label = (button.querySelector('span') || button).textContent.trim();
    if (on) { button.title = label; button.setAttribute('aria-label', label); } else { button.removeAttribute('title'); button.removeAttribute('aria-label'); }
  });
}
function bindSideMini() {
  const b = $('#sideMini');
  if (!b) return;
  b.onclick = () => sideMiniSet(!document.documentElement.classList.contains('side-mini'));
  applySideMini(sideMiniGet());
}

