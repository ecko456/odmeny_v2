/* ==========================================================================
   ÚKOLY (2.46)
   Seznam úkolů s filtry a detail: název, popis, termín, zodpovědná osoba, opakování,
   připomínka, stav a časová osa (komentáře a změny). Výpočty jsou v core.js (tk*).
   ========================================================================== */
const TK_FILTERS = [['open', 'Otevřené'], ['late', 'Po termínu'], ['soon', 'Blíží se termín'], ['req', 'Požadavky pracovníků'], ['done', 'Hotové'], ['cancel', 'Zrušené'], ['all', 'Vše']];
const TK_SEV_TONE = { high: 'crit', mid: 'warn', low: '' };
function tkSevPill(sev) { return sev ? `<span class="tag tk-sev tk-sev-${sev} ${TK_SEV_TONE[sev] || ''}">${esc(tkSevName(sev))} závažnost</span>` : ''; }
const TK_STATE_TONE = { new: 'acc', run: 'warn', wait: 'wait', done: 'good', cancel: '' };
function tkList() { return (S.tasks && S.tasks.list) || []; }
function tkMeta() { return { at: Date.now(), by: ui.me.label || '', today: todayIso() }; }
function tkPill(state) { return `<span class="tag tk-st tk-st-${state} ${TK_STATE_TONE[state] || ''}">${esc(tkStateName(state))}</span>`; }
function tkDueHtml(t, today) {
  const d = tkDue(t, today);
  const cls = d.late ? 'late' : d.today ? 'today' : d.soon ? 'soon' : '';
  return `<span class="tk-due ${cls}"${t.due ? ` title="Termín ${esc(dayText(t.due))}"` : ''}>${I.clock || ''}${esc(tkDueText(t, today))}</span>`;
}
/* Jména pro výběr zodpovědné osoby: dřívější osoby z úkolů, vedoucí, lidé a přihlášená kartička. */
function tkPeopleOptions() {
  const names = new Set(tkOverview(S, todayIso()).owners);
  if (ui.me.label) names.add(ui.me.label);
  leadPeople().forEach(e => names.add(`${e.first} ${e.last}`.trim()));
  Object.values(S.employees).filter(e => !e.excluded && !isLead(e)).forEach(e => names.add(`${e.first} ${e.last}`.trim()));
  return [...names].filter(Boolean).map(n => `<option value="${esc(n)}"></option>`).join('');
}
function tkFiltered(today) {
  const F = ui.tk, q = norm(F.q || '');
  return tkSort(tkList()).filter(t => {
    const d = tkDue(t, today);
    if (F.filter === 'open' && !d.open) return false;
    if (F.filter === 'late' && !d.late) return false;
    if (F.filter === 'soon' && !(d.soon && !d.late)) return false;
    if (F.filter === 'req' && !(tkIsReq(t) && d.open)) return false;
    if ((F.filter === 'done' || F.filter === 'cancel') && t.state !== F.filter) return false;
    if (F.owner && t.owner !== F.owner) return false;
    if (q && !norm(`${t.title} ${t.desc} ${t.owner} ${tkPersonName(t)} ${t.tl.filter(e => e.k === 'c').map(e => e.text).join(' ')}`).includes(q)) return false;
    return true;
  });
}
function tkCount(k, today) {
  return tkList().filter(t => { const d = tkDue(t, today); return k === 'open' ? d.open : k === 'late' ? d.late : k === 'soon' ? d.soon && !d.late : k === 'req' ? tkIsReq(t) && d.open : k === 'all' ? true : t.state === k; }).length;
}
function tkRowHtml(t, today) {
  const nc = t.tl.filter(e => e.k === 'c').length;
  const d = tkDue(t, today);
  const meta = [tkIsReq(t) ? `<span class="tk-req">Požadavek pracovníka · <b>${esc(tkPersonName(t))}</b></span>` : '', t.owner ? `${I.user || ''}${esc(t.owner)}` : (tkIsReq(t) ? '' : '<span class="muted">bez zodpovědné osoby</span>'), t.repeat ? `<span class="tk-rep" title="${esc(tkRepeatName(t.repeat))}">${I.repeat}${esc(tkRepeatName(t.repeat).replace('Každý ', '').replace('Každou ', ''))}</span>` : '', nc ? `<span title="Komentáře">${I.chat}${nc}</span>` : ''].filter(Boolean).join('');
  return `<button type="button" class="tk-row${d.late ? ' late' : d.soon ? ' soon' : ''}${d.open ? '' : ' closed'}" data-tkopen="${esc(t.id)}">
    <span class="tk-dot tk-st-${t.state}" aria-hidden="true"></span>
    <span class="tk-main"><b>${esc(t.title)}</b><span class="tk-meta">${meta}</span></span>
    <span class="tk-side">${d.open ? tkSevPill(t.sev) : ''}${tkPill(t.state)}${tkDueHtml(t, today)}</span></button>`;
}
function tkListHtml(today) {
  const list = tkFiltered(today);
  if (!tkList().length) return `<div class="card">${emptyState('Zatím žádné úkoly', 'Zadej úkol s termínem a zodpovědnou osobou. Úkol může mít komentáře, stavy a opakování každý týden, měsíc, půlrok nebo rok.', '<button class="btn" type="button" data-tknew>Nový úkol</button>')}</div>`;
  if (!list.length) return `<div class="card"><p class="muted">Žádný úkol neodpovídá filtru.</p></div>`;
  return `<div class="tk-list">${list.map(t => tkRowHtml(t, today)).join('')}</div>`;
}
function renderTaskBadge() {
  const badge = $('#navTasks');
  if (!badge || !S) return;
  const o = tkOverview(S, todayIso());
  badge.hidden = !o.remind;
  badge.textContent = String(o.remind);
  badge.classList.toggle('late', !!o.late.length);
  badge.title = o.remind ? [o.late.length ? `${o.late.length} po termínu` : '', o.soon.length ? `${o.soon.length} s blížícím se termínem` : ''].filter(Boolean).join(', ') : '';
  renderFabDot();
}
/* Připomínka nahoře v aplikaci (mimo Úkoly): po termínu a blížící se termíny. Zavřít jde do
   další změny (nový úkol po termínu ji ukáže znovu). */
function renderTaskAlert() {
  const box = $('#taskAlert');
  if (!box || !S) return;
  renderRail();
  // na širokém monitoru připomínky ukazuje pravý panel (2.59), pruh by je opakoval
  if (railOn()) { box.innerHTML = ''; return; }
  const o = tkOverview(S, todayIso());
  const high = tkList().filter(t => tkIsReq(t) && t.sev === 'high' && TK_OPEN.has(t.state) && !o.late.includes(t) && !o.soon.includes(t));
  const sig = [...o.late, ...o.soon, ...high].map(t => t.id + t.due).join(',');
  if ((!o.remind && !high.length) || ui.view === 'ukoly' || ui.tk.alertOff === sig) { box.innerHTML = ''; return; }
  const all = [...o.late, ...o.soon, ...high];
  const names = all.slice(0, 3).map(t => `„${esc(t.title)}“ (${tkIsReq(t) ? `${esc(tkPersonName(t))}, ` : ''}${esc(t.due ? tkDueText(t, todayIso()) : `${tkSevName(t.sev).toLowerCase()} závažnost`)})`);
  box.innerHTML = `<div class="banner tk-alert${o.late.length || high.length ? ' late' : ''}" role="status"><div><b>Úkoly: ${[o.late.length ? `${o.late.length} po termínu` : '', o.soon.length ? `${o.soon.length} ${o.soon.length === 1 ? 'blíží se termín' : 's blížícím se termínem'}` : '', high.length ? `${high.length} ${high.length === 1 ? 'požadavek pracovníka' : high.length <= 4 ? 'požadavky pracovníků' : 'požadavků pracovníků'} s vysokou závažností` : ''].filter(Boolean).join(', ')}.</b> ${names.join(', ')}${all.length > 3 ? ` a další (${all.length - 3})` : ''}</div>
    <div class="banner-actions"><button class="btn small" type="button" id="tkAlertGo">Zobrazit úkoly</button><button class="btn ghost small" type="button" id="tkAlertOff">Skrýt</button></div></div>`;
  $('#tkAlertGo').onclick = () => { ui.tk.filter = o.late.length ? 'late' : o.soon.length ? 'soon' : 'req'; ui.tk.sel = null; showView('ukoly'); };
  $('#tkAlertOff').onclick = () => { ui.tk.alertOff = sig; renderTaskAlert(); };
}
function tkSevOptions(sel) { return `<option value="">— bez závažnosti —</option>${TK_SEV.map(([k, l]) => `<option value="${k}"${sel === k ? ' selected' : ''}>${l}</option>`).join('')}`; }
/* Požadavky pracovníka v detailu člověka (2.51): seznam a přidání. Zobrazují se i v Úkolech. */
function tkReqCard(e) {
  const today = todayIso();
  const list = tkSort(tkList().filter(t => t.person === e.key));
  const open = list.filter(t => TK_OPEN.has(t.state));
  return `<div class="card tk-reqcard"><div class="card-head"><div><h3>Požadavky pracovníka</h3><p class="small muted">Co člověk chce, do kdy a jak je to vážné. Požadavek se objeví v Úkolech i s připomínkou termínu.</p></div>
    <button class="btn small" type="button" data-tkreqadd>Přidat požadavek</button></div>
    ${list.length ? `<div class="tk-list">${[...open, ...list.filter(t => !TK_OPEN.has(t.state)).slice(0, 5)].map(t => tkRowHtml(t, today).replace('data-tkopen=', 'data-tkreqopen=')).join('')}</div>` : '<p class="small muted">Zatím žádný požadavek.</p>'}</div>`;
}
function openPersonFromTask(key) {
  ui.selPerson = key; ui.personOpen = true;
  renderPeople();
  showView('lide');
}
function openTaskFromPerson(id) {
  ui.tk.filter = 'all';
  ui.tk.sel = null;
  showView('ukoly');
  tkOpen(id);
}
// Výběr pracovníka v požadavku z pravého panelu (2.64): text „Příjmení Jméno · ID 123“ z nabídky,
// nebo cokoli, co jednoznačně najde personFind (jméno, ID).
const tkReqWhoText = e => `${e.last} ${e.first}`.trim() + (e.wid ? ` · ID ${e.wid}` : '');
function tkReqPerson(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  const all = Object.values(S.employees).filter(e => !e.excluded);
  const exact = all.find(e => tkReqWhoText(e) === v);
  if (exact) return exact;
  const found = personFind(v, all);
  return found.length === 1 ? found[0] : null;
}
async function tkReqDialog(e) {
  const pick = !e;
  let who = pick ? '' : `${e.first} ${e.last}`.trim();
  const people = pick ? personFind('', Object.values(S.employees).filter(x => !x.excluded)) : [];
  const res = await dialog({
    title: pick ? 'Požadavek pracovníka' : `Požadavek pracovníka · ${who}`, ok: 'Přidat požadavek', wide: true,
    html: `${pick ? `<label class="field"><span>Pracovník</span><input name="who" list="tkReqWho" autocomplete="off" autofocus placeholder="jméno nebo ID"></label>
      <datalist id="tkReqWho">${people.map(x => `<option value="${esc(tkReqWhoText(x))}"></option>`).join('')}</datalist>` : ''}
      <label class="field"><span>Co pracovník chce</span><input name="title" maxlength="200" required${pick ? '' : ' autofocus'} placeholder="třeba přeřazení na ranní směnu, nové pracovní boty"></label>
      <label class="field"><span>Podrobnosti</span><textarea name="desc" rows="3" maxlength="4000" placeholder="volitelné"></textarea></label>
      <div class="form-grid tk-grid">
        <label class="field"><span>Termín</span><input type="date" name="due"></label>
        <label class="field"><span>Závažnost</span><select name="sev">${TK_SEV.map(([k, l]) => `<option value="${k}"${k === 'mid' ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Zodpovídá</span><input name="owner" list="tkPeopleReq" maxlength="80" value="${esc(ui.me.label || '')}" placeholder="kdo to vyřeší"></label>
        <label class="field"><span>Připomenout</span><select name="remind">${TK_REMIND.map(n => `<option value="${n}"${n === TK_REMIND_DEF ? ' selected' : ''}>${tkRemindText(n)}</option>`).join('')}</select></label>
      </div><datalist id="tkPeopleReq">${tkPeopleOptions()}</datalist>`,
    validate: form => {
      if (pick) {
        const w = form.elements.who.value.trim();
        if (!w) return 'Vyber pracovníka.';
        if (!tkReqPerson(w)) return `Pracovníka „${w}“ jsem nenašel jednoznačně, vyber ho z nabídky.`;
      }
      return form.elements.title.value.trim() ? '' : 'Napiš, co pracovník chce.';
    },
  });
  if (res.value !== 'ok') return null;
  const f = res.form.elements;
  if (pick) { e = tkReqPerson(f.who.value); if (!e) return null; who = `${e.first} ${e.last}`.trim(); }
  const t = tkAdd(S, { title: f.title.value, desc: f.desc.value, due: f.due.value, owner: f.owner.value, remind: f.remind.value, sev: f.sev.value, person: e.key, pname: who }, tkMeta());
  if (t.err) { toast(t.err, true); return null; }
  save();
  renderTaskBadge(); renderTaskAlert();
  if (pick && ui.view === 'lide') renderPeople();
  toast(`Požadavek „${t.title}“ přidán, najdeš ho i v Úkolech.`);
  return t;
}
function bindTkReqCard(box, e) {
  const add = $('[data-tkreqadd]', box);
  if (add) add.onclick = async () => { if (await tkReqDialog(e)) renderPersonDetail(); };
  $$('[data-tkreqopen]', box).forEach(b => { b.onclick = () => openTaskFromPerson(b.dataset.tkreqopen); });
}
function renderTasks() {
  const box = $('#tkView');
  if (!box || !S) return;
  renderTaskBadge();
  const today = todayIso();
  const t = ui.tk.sel ? tkFind(S, ui.tk.sel) : null;
  if (ui.tk.sel && !t) ui.tk.sel = null;
  $('#view-ukoly').classList.toggle('tk-in-detail', !!t);
  if (t) { box.innerHTML = tkDetailHtml(t, today); return; }
  // 2.67: dvě části – běžné úkoly a úkoly na časové ose (pravý panel), ať se nepletou
  const partBar = `<div class="chips tk-part" role="tablist" aria-label="Druh úkolů">
      <button type="button" class="chip${ui.tk.part !== 'agenda' ? ' on' : ''}" data-tkpart="list" role="tab" aria-selected="${ui.tk.part !== 'agenda'}">Běžné úkoly <em class="t5-count">${tkList().length}</em></button>
      <button type="button" class="chip${ui.tk.part === 'agenda' ? ' on' : ''}" data-tkpart="agenda" role="tab" aria-selected="${ui.tk.part === 'agenda'}">Úkoly na časové ose <em class="t5-count">${(S.agenda || []).length}</em></button></div>`;
  if (ui.tk.part === 'agenda') { box.innerHTML = partBar + tkAgendaHtml(today); return; }
  const o = tkOverview(S, today);
  const tiles = `<div class="stats">${[
    statTile('Otevřené', String(o.open), `z ${o.all} ${o.all === 1 ? 'úkolu' : 'úkolů'}${o.open ? `, v termínu ${o.open - o.late.length}` : ''}`, '', { bar: o.open ? (o.open - o.late.length) / o.open : null }),
    statTile('Po termínu', String(o.late.length), o.late.length ? 'termín už uplynul' : 'nic nemešká', o.late.length ? 'crit' : o.open ? 'good' : ''),
    statTile('Blíží se termín', String(o.soon.length), 'podle připomenutí u úkolu', o.soon.length ? 'warn' : ''),
    statTile('Hotovo za 30 dní', String(o.done30), o.done30 + o.open ? `${nf(o.done30 / (o.done30 + o.open) * 100, 0)} % z dokončených a otevřených` : 'dokončené úkoly', o.done30 ? 'good' : '', { bar: o.done30 + o.open ? o.done30 / (o.done30 + o.open) : null }),
    ...(o.req || tkList().some(tkIsReq) ? [statTile('Požadavky pracovníků', String(o.req), o.reqHigh ? `${o.reqHigh} s vysokou závažností` : 'otevřené požadavky', o.reqHigh ? 'crit' : o.req ? 'warn' : '')] : []),
  ].join('')}</div>`;
  const owners = o.owners;
  if (ui.tk.owner && !owners.includes(ui.tk.owner)) ui.tk.owner = '';
  box.innerHTML = `${partBar}${tiles}
    <div class="toolbar tk-tools">
      <div class="chips" role="group" aria-label="Filtr úkolů">${TK_FILTERS.map(([k, l]) => { const n = tkCount(k, today); return `<button type="button" class="chip${ui.tk.filter === k ? ' on' : ''}" data-tkf="${k}" aria-pressed="${ui.tk.filter === k}">${l} <em class="t5-count${k === 'late' && n ? ' late' : ''}">${n}</em></button>`; }).join('')}</div>
      <select id="tkOwnerF" aria-label="Zodpovědná osoba"><option value="">Všichni zodpovědní</option>${owners.map(n => `<option value="${esc(n)}"${ui.tk.owner === n ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <input type="search" class="grow" id="tkQ" value="${esc(ui.tk.q)}" placeholder="Hledat v úkolech a komentářích…" aria-label="Hledat v úkolech">
    </div>
    <div id="tkList">${tkListHtml(today)}</div>`;
  setWidths(box);
  $$('.chips', box).forEach(showActiveChip);
}
function tkTlHtml(t) {
  const items = t.tl.slice().reverse();
  return `<ol class="tk-tl">${items.map(e => {
    const kind = e.k === 'c' ? 'c' : e.k === 's' ? 's' : e.k === 'r' ? 'r' : e.k === 'new' ? 'n' : 'f';
    const body = e.k === 'c' ? `<div class="tk-c">${esc(e.text).replace(/\n/g, '<br>')}</div>` : `<div class="tk-sys">${e.k === 's' ? `Stav: ${tkPill(e.v0)} → ${tkPill(e.v1)}` : esc(tkTlText(e))}</div>`;
    return `<li class="tk-e tk-e-${kind}"><span class="tk-e-dot" aria-hidden="true"></span><div class="tk-e-b"><div class="tk-e-h"><b>${esc(e.by || 'neznámý')}</b><time>${esc(tsText(e.at))}</time>${e.k === 'c' ? `<button type="button" class="icon-btn tk-cdel" data-tkcdel="${esc(e.id)}" aria-label="Smazat komentář" title="Smazat komentář">${I.x}</button>` : ''}</div>${body}</div></li>`;
  }).join('')}</ol>`;
}
function tkDetailHtml(t, today) {
  const d = tkDue(t, today);
  const prev = tkList().find(x => x.next === t.id), next = t.next ? tkFind(S, t.next) : null;
  return `<button class="btn ghost small back-btn tk-back" type="button" data-tkback>${I.back}Úkoly</button>
  <div class="tk-detail">
    <div class="card tk-card">
      <div class="tk-head" id="tkHead">${tkHeadHtml(t, today)}</div>
      ${tkIsReq(t) ? `<p class="tk-reqline">Požadavek pracovníka <button type="button" class="link" data-tkperson="${esc(t.person)}">${esc(tkPersonName(t))}</button>${S.employees[t.person] ? '' : ' <span class="muted small">(už není v Lidech)</span>'}</p>` : ''}
      <label class="field"><span>${tkIsReq(t) ? 'Co pracovník chce' : 'Úkol'}</span><input type="text" id="tkTitle" value="${esc(t.title)}" maxlength="200" required></label>
      <label class="field"><span>Popis</span><textarea id="tkDesc" rows="4" maxlength="4000" placeholder="Co je potřeba udělat, podrobnosti">${esc(t.desc)}</textarea></label>
      <div class="form-grid tk-grid">
        <label class="field"><span>Termín</span><input type="date" id="tkDue" value="${esc(t.due)}"></label>
        <label class="field"><span>Zodpovědná osoba</span><input type="text" id="tkOwner" value="${esc(t.owner)}" list="tkPeople" maxlength="80" placeholder="jméno"></label>
        <label class="field"><span>Opakovat úkol</span><select id="tkRepeat">${TK_REPEAT.map(([k, l]) => `<option value="${k}"${t.repeat === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>Připomenout</span><select id="tkRemind">${TK_REMIND.map(n => `<option value="${n}"${t.remind === n ? ' selected' : ''}>${tkRemindText(n)}</option>`).join('')}</select></label>
        ${tkIsReq(t) ? `<label class="field"><span>Závažnost</span><select id="tkSev">${tkSevOptions(t.sev)}</select></label>` : ''}
      </div>
      <datalist id="tkPeople">${tkPeopleOptions()}</datalist>
      <div class="tk-states"><span class="small muted">Stav</span><div class="seg tk-seg" role="group" aria-label="Stav úkolu">${TK_STATES.map(([k, l]) => `<button type="button" class="${t.state === k ? 'on' : ''}" data-tkstate="${k}" aria-pressed="${t.state === k}">${l}</button>`).join('')}</div></div>
      <div id="tkRep">${tkRepHtml(t, today)}</div>
      ${prev || next ? `<p class="small tk-chain">${prev ? `<button type="button" class="link" data-tkopen="${esc(prev.id)}">← předchozí opakování (${esc(prev.due ? dayText(prev.due) : 'bez termínu')})</button>` : ''}${next ? `<button type="button" class="link" data-tkopen="${esc(next.id)}">další opakování (${esc(next.due ? dayText(next.due) : 'bez termínu')}) →</button>` : ''}</p>` : ''}
      <div class="tk-foot"><span class="small muted">Zadal ${esc(t.by || 'neznámý')}, ${esc(tsText(t.at))}${t.done ? ` · hotovo ${esc(tsText(t.done))}${t.doneBy ? ` (${esc(t.doneBy)})` : ''}` : ''}</span><button class="btn ghost small tk-del" type="button" data-tkdel>Smazat úkol</button></div>
    </div>
    <div class="card tk-tlcard">
      <h3>Časová osa</h3>
      <div class="tk-cform"><label class="sr-only" for="tkNewC">Nový komentář</label><textarea id="tkNewC" rows="3" maxlength="2000" placeholder="Napiš komentář k vývoji úkolu… (Ctrl+Enter přidá)">${esc(ui.tk.draft[t.id] || '')}</textarea>
        <button class="btn small" type="button" data-tkcomment>Přidat komentář</button></div>
      <div id="tkTl">${tkTlHtml(t)}</div>
    </div>
  </div>`;
}
function tkRepHtml(t, today) {
  return t.repeat ? `<p class="small muted tk-repnote">${I.repeat}${t.next ? `Další opakování je už založené.` : `Po označení Hotovo se založí další úkol s termínem ${esc(dayText(tkNextDue(t.due, t.repeat, today)))}.`}</p>` : '';
}
function tkHeadHtml(t, today) {
  const d = tkDue(t, today);
  return `${tkPill(t.state)}${tkDueHtml(t, today)}${d.open ? tkSevPill(t.sev) : ''}${t.repeat ? `<span class="tag">${I.repeat}${esc(tkRepeatName(t.repeat))}</span>` : ''}${d.soon && !d.late && !d.today ? `<span class="tag warn">připomínka ${esc(tkRemindText(t.remind))}</span>` : ''}`;
}
/* Po změně pole se překreslí jen hlavička a časová osa (formulář zůstane, fokus se neztratí). */
function tkRefresh(t) {
  if (!t) return;
  const today = todayIso();
  const h = $('#tkHead'), tl = $('#tkTl'), rp = $('#tkRep');
  if (h) h.innerHTML = tkHeadHtml(t, today);
  if (rp) rp.innerHTML = tkRepHtml(t, today);
  if (tl) tl.innerHTML = tkTlHtml(t);
  renderTaskBadge();
}
function tkApply(patch) {
  const id = ui.tk.sel;
  const r = tkSet(S, id, patch, tkMeta());
  if (r.err) { toast(r.err, true); return null; }
  save();
  if (r.next) toast(`Další opakování založeno s termínem ${dayText(r.next.due)}.`);
  return r;
}
async function tkNewDialog() {
  const res = await dialog({
    title: 'Nový úkol', ok: 'Zadat úkol', wide: true,
    html: `<label class="field"><span>Úkol</span><input name="title" maxlength="200" required autofocus placeholder="Co je potřeba udělat"></label>
      <label class="field"><span>Popis</span><textarea name="desc" rows="3" maxlength="4000" placeholder="volitelné"></textarea></label>
      <div class="form-grid tk-grid">
        <label class="field"><span>Termín</span><input type="date" name="due" value="${esc(ui.tk.lastDue || '')}"></label>
        <label class="field"><span>Zodpovědná osoba</span><input name="owner" list="tkPeopleNew" maxlength="80" value="${esc(ui.tk.owner || '')}" placeholder="jméno"></label>
        <label class="field"><span>Opakovat úkol</span><select name="repeat">${TK_REPEAT.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <label class="field"><span>Připomenout</span><select name="remind">${TK_REMIND.map(n => `<option value="${n}"${n === TK_REMIND_DEF ? ' selected' : ''}>${tkRemindText(n)}</option>`).join('')}</select></label>
      </div><datalist id="tkPeopleNew">${tkPeopleOptions()}</datalist>`,
    validate: form => (form.elements.title.value.trim() ? '' : 'Zadej název úkolu.'),
  });
  if (res.value !== 'ok') return;
  const f = res.form.elements;
  const t = tkAdd(S, { title: f.title.value, desc: f.desc.value, due: f.due.value, owner: f.owner.value, repeat: f.repeat.value, remind: f.remind.value }, tkMeta());
  if (t.err) { toast(t.err, true); return; }
  save();
  if (ui.tk.filter !== 'all' && ui.tk.filter !== 'open') ui.tk.filter = 'open';
  renderTasks();
  toast(`Úkol „${t.title}“ zadán.`);
}
function tkAddComment() {
  const box = $('#tkNewC');
  const text = box ? box.value.trim() : '';
  if (!text) { toast('Napiš text komentáře.', true); if (box) box.focus(); return; }
  if (!tkComment(S, ui.tk.sel, text, tkMeta())) return;
  delete ui.tk.draft[ui.tk.sel];
  save();
  box.value = '';
  tkRefresh(tkFind(S, ui.tk.sel));
}
async function exportTasksXlsx() {
  try {
    const X = await xlsx();
    const wb = X.utils.book_new();
    tkSheets(S, todayIso()).forEach(sheet => {
      const ws = X.utils.aoa_to_sheet(sheet.rows.map(r => r.map(safeCell)));
      ws['!cols'] = sheet.cols.map(wch => ({ wch }));
      X.utils.book_append_sheet(wb, ws, sheet.name);
    });
    downloadFile(`ukoly-${todayIso()}.xlsx`, new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch (error) { toast(`Export se nepovedl: ${error.message}`, true); }
}
function tkOpen(id) {
  if (!ui.tk.sel) ui.tk.listY = window.scrollY;
  ui.tk.sel = id;
  renderTasks();
  window.scrollTo({ top: 0, behavior: 'instant' });
  syncHistory();
}
function tkClose() {
  ui.tk.sel = null;
  renderTasks();
  window.scrollTo({ top: ui.tk.listY || 0, behavior: 'instant' });
  syncHistory();
}
// Přehled úkolů na časové ose (2.67): stejná data jako karta v pravém panelu (S.agenda)
function tkAgendaHtml(today) {
  const q = norm(ui.tk.agQ || '');
  const all = (S.agenda || []).slice().sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title, 'cs'));
  const list = q ? all.filter(x => norm(`${x.title} ${x.note} ${x.time} ${agRepName(x.rep)}`).includes(q)) : all;
  const todayN = all.filter(x => agOn(x, today)).length, doneN = all.filter(x => agOn(x, today) && x.done && x.done[today]).length;
  const tiles = `<div class="stats">${[
    statTile('Na časové ose', String(all.length), `${all.filter(x => x.rep !== 'once').length} opakovaných`),
    statTile('Dnes', String(todayN), todayN ? `splněno ${doneN} z ${todayN}` : 'dnes nic', todayN && doneN === todayN ? 'good' : '', { bar: todayN ? doneN / todayN : null }),
    statTile('Jen pracovní dny', String(all.filter(x => x.work && x.rep !== 'once').length), 'bez víkendů a svátků'),
  ].join('')}</div>`;
  const row = x => {
    const next = agNext(x, today), on = agOn(x, today), done = on && x.done && x.done[today];
    return `<tr data-agrow="${esc(x.id)}">
      <td data-label="Čas" class="num"><b>${esc(x.time)}</b></td>
      <td data-label="Úkol" class="name"><b>${esc(x.title)}</b>${x.note ? `<div class="small muted">${esc(x.note)}</div>` : ''}</td>
      <td data-label="Opakování">${esc(agRepName(x.rep))}${x.work && x.rep !== 'once' ? '<div class="small muted">jen pracovní dny</div>' : ''}</td>
      <td data-label="Od">${esc(dayText(x.date))}</td>
      <td data-label="Příště">${next ? (next === today ? '<span class="tag">dnes</span>' : esc(dayText(next))) : '<span class="muted">už ne</span>'}</td>
      <td data-label="Dnes">${on ? (done ? '<span class="tag ok">splněno</span>' : '<span class="tag warn">čeká</span>') : '<span class="muted">—</span>'}</td>
      <td data-label="" class="r tk-agacts"><button class="btn sec small" type="button" data-agtedit="${esc(x.id)}">Upravit</button><button class="icon-btn small" type="button" data-agtdel="${esc(x.id)}" title="Smazat" aria-label="Smazat ${esc(x.title)}">${I.x}</button></td></tr>`;
  };
  return `${tiles}
    <div class="toolbar tk-tools"><input type="search" class="grow" id="tkAgQ" value="${esc(ui.tk.agQ || '')}" placeholder="Hledat v úkolech na časové ose…" aria-label="Hledat v úkolech na časové ose"><button class="btn" type="button" data-agtnew>Nový na časové ose</button></div>
    <p class="small muted tk-aghelp">Úkoly na čas s opakováním. V pravém panelu se ukazují 2 hodiny zpět a 3 hodiny dopředu od teď, tam se i odškrtávají jako splněné.</p>
    <div class="table-card"><table class="stack tk-agtab"><thead><tr><th>Čas</th><th>Úkol</th><th>Opakování</th><th>Od</th><th>Příště</th><th>Dnes</th><th class="r"><span class="sr-only">Akce</span></th></tr></thead>
    <tbody id="tkAgBody">${list.length ? list.map(row).join('') : `<tr><td colspan="7">${emptyState(all.length ? 'Nic neodpovídá hledání' : 'Zatím žádné úkoly na časové ose', all.length ? 'Zkus jiné slovo.' : 'Přidej úkol na čas, třeba denní kontrolu tlaku nebo poradu směny.', all.length ? '' : '<button class="btn" type="button" data-agtnew>Nový na časové ose</button>')}</td></tr>`}</tbody></table></div>`;
}
function bindTasks() {
  const view = $('#tkView');
  view.addEventListener('input', event => {
    if (event.target.id !== 'tkAgQ') return;
    ui.tk.agQ = event.target.value;
    const tmp = document.createElement('div');
    tmp.innerHTML = tkAgendaHtml(todayIso());
    const body = $('#tkAgBody', tmp), cur = $('#tkAgBody');
    if (body && cur) cur.replaceWith(body);
  });
  $('#tkNew').onclick = () => (ui.tk.part === 'agenda' && !ui.tk.sel ? agDialog(null) : tkNewDialog());
  $('#tkXlsx').onclick = () => exportTasksXlsx();
  view.addEventListener('click', async event => {
    const t = event.target;
    const open = t.closest('[data-tkopen]');
    if (open) { tkOpen(open.dataset.tkopen); return; }
    if (t.closest('[data-tknew]')) { tkNewDialog(); return; }
    const pp = t.closest('[data-tkperson]');
    if (pp) { if (S.employees[pp.dataset.tkperson]) openPersonFromTask(pp.dataset.tkperson); else toast('Člověk už v Lidech není.', true); return; }
    const f = t.closest('[data-tkf]');
    if (f) { ui.tk.filter = f.dataset.tkf; renderTasks(); return; }
    const part = t.closest('[data-tkpart]');
    if (part) { ui.tk.part = part.dataset.tkpart; renderTasks(); return; }
    if (t.closest('[data-agtnew]')) { agDialog(null); return; }
    const age = t.closest('[data-agtedit]');
    if (age) { const x = (S.agenda || []).find(a => a.id === age.dataset.agtedit); if (x) agDialog(x); return; }
    const agd = t.closest('[data-agtdel]');
    if (agd) {
      const x = (S.agenda || []).find(a => a.id === agd.dataset.agtdel);
      if (!x || !(await confirmBox('Smazat úkol z časové osy?', `${x.time} ${x.title} zmizí i z pravého panelu.`, 'Smazat', true))) return;
      agDel(S, x.id); save(); _railSig = ''; renderRail(); renderTasks();
      return;
    }
    if (t.closest('[data-tkback]')) { navBack(prev => prev.odmView === 'ukoly' && !prev.sub, tkClose); return; }
    const st = t.closest('[data-tkstate]');
    if (st) {
      if (tkFind(S, ui.tk.sel).state === st.dataset.tkstate) return;
      if (tkApply({ state: st.dataset.tkstate })) renderTasks();
      return;
    }
    if (t.closest('[data-tkcomment]')) { tkAddComment(); return; }
    const cd = t.closest('[data-tkcdel]');
    if (cd) {
      if (!(await confirmBox('Smazat komentář?', 'Komentář zmizí z časové osy úkolu.', 'Smazat', true))) return;
      if (tkDelComment(S, ui.tk.sel, cd.dataset.tkcdel)) { save(); tkRefresh(tkFind(S, ui.tk.sel)); }
      return;
    }
    if (t.closest('[data-tkdel]')) {
      const x = tkFind(S, ui.tk.sel);
      if (!x || !(await confirmBox('Smazat úkol?', `Úkol „${x.title}“ i s časovou osou se smaže. V Posledních změnách ho jde 3 dny vrátit zpět.`, 'Smazat', true))) return;
      tkDelete(S, x.id);
      save();
      toast('Úkol smazán.');
      tkClose();
    }
  });
  view.addEventListener('input', event => {
    const t = event.target;
    if (t.id === 'tkQ') { ui.tk.q = t.value; $('#tkList').innerHTML = tkListHtml(todayIso()); return; }
    if (t.id === 'tkNewC') ui.tk.draft[ui.tk.sel] = t.value;
  });
  // datum: Chrome posílá change po každé napsané číslici, proto se termín uloží až po chvilce
  // nebo při opuštění pole (pole se nepřekresluje)
  const dueCommit = () => {
    clearTimeout(ui.tk.dueTimer);
    const inp = $('#tkDue');
    if (!inp || !ui.tk.sel) return;
    const x = tkFind(S, ui.tk.sel);
    if (x && inp.value !== x.due && (!inp.value || TK_ISO.test(inp.value))) { if (tkApply({ due: inp.value })) tkRefresh(tkFind(S, ui.tk.sel)); }
  };
  view.addEventListener('change', event => {
    const t = event.target;
    if (t.id === 'tkOwnerF') { ui.tk.owner = t.value; renderTasks(); return; }
    if (t.id === 'tkDue') { clearTimeout(ui.tk.dueTimer); ui.tk.dueTimer = setTimeout(dueCommit, 1500); return; }
    const map = { tkTitle: 'title', tkDesc: 'desc', tkOwner: 'owner', tkRepeat: 'repeat', tkRemind: 'remind', tkSev: 'sev' };
    const f = map[t.id];
    if (!f) return;
    if (f === 'title' && !t.value.trim()) { toast('Úkol musí mít název.', true); t.value = tkFind(S, ui.tk.sel).title; return; }
    const r = tkApply({ [f]: t.value });
    if (!r) return;
    if (f === 'repeat') renderTasks(); else tkRefresh(r.t);
  });
  view.addEventListener('focusout', event => { if (event.target.id === 'tkDue') dueCommit(); });
  view.addEventListener('keydown', event => {
    const t = event.target;
    if (t.id === 'tkNewC' && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); tkAddComment(); return; }
    if (event.key === 'Enter' && (t.id === 'tkTitle' || t.id === 'tkOwner' || t.id === 'tkDue')) { event.preventDefault(); t.blur(); }
  });
}

