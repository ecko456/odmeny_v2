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
  const pres = ktWaitsPres() ? 1 : 0;
  const n = late + now + pres;
  badge.hidden = !n;
  badge.textContent = String(n);
  badge.title = [pres ? 'nahraj dnešní příchody' : '', now ? `dnes ${now} ${kontrolN(now)}` : '', late ? `${late} nezapsaných po termínu` : ''].filter(Boolean).join(', ');
  renderFabDot();
}

/* Režim podle příchodů (2.37): dnešní kontroly čekají na soubor s dnešními příchody. */
function ktWaitsPres() {
  const today = todayIso();
  return audSet().mode === 'day' && audDays(isoWeek(today).id).includes(today) && !audPresent(today) && audDepts().length > 0;
}
const ktDayText = r => `Dnes v práci ${r.present} ${lidiN(r.present)}, ${r.added === 1 ? 'vylosována' : r.added >= 2 && r.added <= 4 ? 'vylosovány' : 'vylosováno'} ${r.added} ${kontrolN(r.added)}.${r.short.length ? ` Málo lidí v práci: ${r.short.map(x => `${x.dept} ${x.got} z ${x.need}`).join(', ')} (dorovná se v dalších dnech).` : ''}`;
/* Vylosuje dnešní kontroly z lidí, kteří podle příchodů přišli; bez příchodů nabídne nahrání. */
async function ktDayChecks() {
  const today = todayIso();
  const id = isoWeek(today).id;
  if (!audDepts().length) { toast('Zatím nikdo nemá skupinu, není koho kontrolovat.', true); return; }
  if (!audDays(id).includes(today)) { toast('Dnes není pracovní den.', true); return; }
  if (!audPresent(today)) { $('#ktPresFile').click(); return; }
  const old = ((audPlan(id) || {}).items || []).filter(i => i.day === today && i.state === 'plan' && !i.extra && !i.sub).length;
  if (old && !(await confirmBox('Vylosovat znovu?', `Dnešní nezapsané kontroly (${old}) se nahradí novým losem z lidí, kteří jsou podle příchodů v práci. Zapsané kontroly zůstanou.`, 'Vylosovat'))) return;
  let r;
  try { r = generateDayChecks(id, today, ktMeta()); } catch (error) { toast(error.message, true); return; }
  ui.kt.week = id;
  save(); renderKontroly();
  toast(ktDayText(r));
}
/* Soubor s příchody v Kontrolách: uloží jen docházku (stejná jako v KPI) a v režimu podle
   příchodů rovnou vylosuje dnešní kontroly, když ještě nejsou. */
async function ktPresImport(file) {
  const out = await dvImport(file, { attOnly: true });
  if (!out) return;
  const today = todayIso();
  const id = isoWeek(today).id;
  const here = audPresent(today);
  let msg = here ? `Příchody nahrány, dnes v práci ${here.n} ${lidiN(here.n)}.` : `Příchody nahrány (${dayText(out.a.from)} – ${dayText(out.a.to)}), dnešní den ale v souboru není.`;
  if (here && audSet().mode === 'day' && audDays(id).includes(today) && audDepts().length) {
    const had = ((audPlan(id) || {}).items || []).some(i => i.day === today && !i.extra && !i.sub);
    if (!had) {
      try { msg = ktDayText(generateDayChecks(id, today, ktMeta())); save(); } catch (error) { msg += ` ${error.message}`; }
    } else msg += ' Dnešní kontroly už jsou vylosované, nový los spustíš tlačítkem Vylosovat znovu.';
  }
  ui.kt.week = id;
  renderKontroly();
  if (ui.view === 'domu') renderHome();
  toast(msg);
}

function renderKontroly() {
  const view = $('#ktView');
  if (!view || !S) return;
  renderKtBadge();
  $('#ktTabs').innerHTML = KT_TABS.map(([k, t]) => `<button type="button" class="chip${k === ui.kt.tab ? ' on' : ''}" data-kttab="${k}" aria-pressed="${k === ui.kt.tab}">${t}</button>`).join('');
  showActiveChip($('#ktTabs'));
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
    <p class="tiny muted">${esc(it.dept)}${it.extra ? ' · přidán ručně' : it.sub ? ' · náhradník' : ''}${ktAway(it) ? ' <span class="tag warn">podle příchodů nepřišel</span>' : ''}</p>
    ${it.state === 'done' ? `<p class="small">${esc(dayText(it.done))}${it.checker ? ` · ${esc(it.checker)}` : ''}</p>${sc.fail.length ? `<ul class="kt-fails">${sc.fail.map(r => `<li>${esc(r.text)}${r.note ? ` <span class="muted">– ${esc(r.note)}</span>` : ''}</li>`).join('')}</ul>` : ''}` : ''}
    ${it.state === 'skip' ? `<p class="small muted">${esc(it.reason || 'bez důvodu')}</p>` : ''}
    <div class="kt-card-actions">
      ${it.state === 'plan' ? (tasks ? `<button class="btn small" type="button" data-ktcheck="${esc(it.id)}">Zapsat kontrolu</button>` : '<span class="tiny warn-t">oddělení nemá nutné úkony</span>')
        : it.state === 'done' ? `<button class="btn sec small" type="button" data-ktcheck="${esc(it.id)}">Upravit</button>` : ''}
      <details class="kt-more"><summary aria-label="Další volby">···</summary><div class="kt-menu">${menu.join('')}</div></details>
    </div>
  </div>`;
}

/* Naplánovaný člověk, který podle nahraných příchodů ten den nepřišel (2.37). */
function ktAway(it) {
  if (it.state !== 'plan') return false;
  const here = audPresent(it.day);
  return !!here && !here.keys.has(it.key);
}
/* Pruh nad plánem v režimu podle příchodů: čeká se na soubor, nebo kolik lidí je v práci. */
function ktPresHtml(id, plan) {
  const today = todayIso();
  if (id !== isoWeek(today).id || !audDays(id).includes(today)) return '';
  const here = audPresent(today);
  if (!here) return `<div class="note w kt-pres"><b>Dnešní kontroly čekají na příchody.</b> Nahraj soubor s docházkou, kde je už dnešní den (stačí příchody). Kontroly se vylosují jen z lidí, kteří dnes přišli. <button class="btn small" type="button" data-ktpres>Nahrát dnešní příchody</button></div>`;
  const n = ((plan && plan.items) || []).filter(i => i.day === today && i.state !== 'skip').length;
  return `<div class="note i kt-pres">Podle příchodů je dnes v práci <b>${here.n} ${lidiN(here.n)}</b>${here.unknown.length ? ` (${here.unknown.length} ID není v Lidech)` : ''}. Na dnešek ${n === 1 ? 'je' : n >= 2 && n <= 4 ? 'jsou' : 'je'} ${n} ${kontrolN(n)}.
    <button class="btn sec small" type="button" data-ktday>Vylosovat znovu</button> <button class="btn ghost small" type="button" data-ktpres>Nahrát znovu</button></div>`;
}

function ktPlanHtml() {
  const id = ktWeekId();
  const cur = isoWeek(todayIso()).id;
  const today = todayIso();
  const plan = audPlan(id);
  const weeks = [...new Set([...Object.keys(S.audit.plans), cur, shiftWeek(cur, 1), shiftWeek(cur, 2), id])].sort().reverse();
  const depts = audDepts();
  const pct = audSet().pct;
  const byDay = audSet().mode === 'day';
  const canToday = id === cur && audDays(id).includes(today);
  const missing = depts.filter(d => !audTasks(d).length);
  const bar = `<div class="t5-weekbar">
      <button class="icon-btn" type="button" data-ktwk="-1" aria-label="Předchozí týden">${I.back}</button>
      <select id="ktWeekSel" aria-label="Týden">${weeks.map(w => `<option value="${w}"${w === id ? ' selected' : ''}>${esc(`${weekName(w)} · ${weekRange(weekById(w))}${w === cur ? ' · tento týden' : w === shiftWeek(cur, 1) ? ' · příští týden' : ''}`)}</option>`).join('')}</select>
      <button class="icon-btn t5-next" type="button" data-ktwk="1" aria-label="Další týden">${I.back}</button>
      <span class="spacer"></span>
      ${plan ? `<button class="btn sec" type="button" data-ktadd>Přidat člověka</button><button class="btn sec" type="button" data-ktpdf>Plán do PDF</button>` : ''}
      ${byDay ? `<button class="btn sec" type="button" data-ktpres>Nahrát příchody</button>${id === cur ? `<button class="btn" type="button" data-ktday${canToday ? '' : ' disabled'}>Vylosovat dnešní kontroly</button>` : ''}`
        : `<button class="btn${plan ? ' sec' : ''}" type="button" data-ktgen${id < cur ? ' disabled' : ''}>${plan ? 'Přegenerovat neprovedené' : 'Vygenerovat plán'}</button>`}
    </div>${byDay ? ktPresHtml(id, plan) : ''}`;
  const warn = missing.length ? `<div class="note w"><b>Bez nutných úkonů:</b> ${missing.map(esc).join(', ')}. U lidí z těchto oddělení kontrolu nepůjde zapsat. <button class="btn small" type="button" data-kttabgo="tasks">Doplnit nutné úkony</button></div>` : '';
  if (!plan) {
    const rows = depts.map(d => { const n = audPeople(d).length; return `<tr><td class="name" data-label="Oddělení"><b>${esc(d)}</b></td><td class="r num" data-label="Lidí">${n}</td><td class="r num" data-label="Vybere se">${audCount(n, pct)}</td><td class="r num" data-label="Nutné úkony">${audTasks(d).length || '<span class="warn-t">žádné</span>'}</td></tr>`; }).join('');
    const intro = byDay
      ? emptyState(`Kontroly na ${esc(weekName(id))} se losují každý den`, `Každý pracovní den se po nahrání příchodů vylosují kontroly jen z lidí, kteří přišli do práce. Za týden se z každého oddělení zkontroluje ${pct} % lidí (zaokrouhleno nahoru); na den připadne zbytek rozdělený do zbývajících pracovních dnů. Přednost mají ti, kdo nejdéle nebyli kontrolovaní.`)
      : emptyState(`Plán na ${esc(weekName(id))} zatím není`, `Z každého oddělení se vybere ${pct} % lidí (zaokrouhleno nahoru) a rozloží se do pracovních dnů ${esc(weekRange(weekById(id)))}. Přednost mají ti, kdo nejdéle nebyli kontrolovaní, takže se během ${Math.ceil(100 / pct)} týdnů vystřídají všichni.`);
    return `${bar}${warn}<div class="card">${intro}
      ${depts.length ? `<div class="table-card flat"><table class="stack"><thead><tr><th>Oddělení</th><th class="r">Lidí</th><th class="r">${byDay ? 'Za týden' : 'Vybere se'}</th><th class="r">Nutné úkony</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="small muted">Zatím nikdo nemá skupinu. Kontroluje se jen zaměstnanec se skupinou (oddělení je podle skupiny).</p>'}</div>`;
  }
  const sum = planSummary(id, today);
  const tiles = `<div class="stats">${[
    statTile('Naplánováno', String(sum.planned), byDay ? `${plan.pct} % za týden, losuje se denně` : `${plan.pct} % z každého oddělení`),
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
    <p class="hint">${byDay ? `Naposledy losoval(a) ${esc(plan.by || '—')} ${esc(tsText(plan.at))}. Kontroly se losují každý den jen z lidí, kteří podle nahraných příchodů přišli; kdo už v týdnu kontrolu má, znovu se nelosuje. Když člověk odejde dřív, zapiš „Neproběhlo“, nebo vyber náhradníka z lidí v práci.` : `Plán vygenerovala kartička ${esc(plan.by || '—')} ${esc(tsText(plan.at))}. Přegenerování nahradí jen neprovedené kontroly; provedené a neproběhlé zůstanou. Když člověk chybí, zapiš „Neproběhlo“, nebo vyber náhradníka z téhož oddělení.`}</p>`;
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
  const people = Object.values(S.employees).filter(e => !e.excluded && !isLead(e) && empDept(e)).sort((a, b) => norm(audName(a)).localeCompare(norm(audName(b)), 'cs'));
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
  $('#ktPresFile').onchange = event => { const f = event.target.files[0]; event.target.value = ''; ktPresImport(f); };
  const view = $('#ktView');
  view.addEventListener('click', async event => {
    const t = event.target;
    const wk = t.closest('[data-ktwk]');
    if (wk) { ui.kt.week = shiftWeek(ktWeekId(), +wk.dataset.ktwk); renderKontroly(); return; }
    if (t.closest('[data-ktgen]')) { ktGenerate(); return; }
    if (t.closest('[data-ktpres]')) { $('#ktPresFile').click(); return; }
    if (t.closest('[data-ktday]')) { ktDayChecks(); return; }
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
      <p class="tiny muted">Počet se zaokrouhlí nahoru, z každého oddělení aspoň jeden. Při 25 % se všichni vystřídají za 4 týdny. Změna platí pro nově generované plány.</p>
      <fieldset class="field kt-mode"><legend>Výběr lidí</legend>${Object.entries(AUD_MODES).map(([k, l]) => `<label class="check"><input type="radio" name="mode" value="${k}"${st.mode === k ? ' checked' : ''}><span><b>${esc(l)}</b><br><small class="muted">${k === 'day' ? 'Každý pracovní den si kontroly vyžádají soubor s dnešními příchody (stejný jako docházka v KPI) a vylosují se jen z lidí, kteří přišli.' : 'Plán se vygeneruje na celý týden dopředu ze všech lidí oddělení.'}</small></span></label>`).join('')}</fieldset>`,
  });
  if (result.value !== 'ok') return;
  const n = Number(result.form.elements.namedItem('pct').value);
  const mode = (result.form.querySelector('input[name="mode"]:checked') || {}).value === 'day' ? 'day' : 'week';
  S.audit.settings = { pct: Number.isFinite(n) ? Math.round(clamp(n, 5, 100)) : st.pct, ...(mode === 'day' ? { mode } : {}) };
  if (mode !== st.mode) ui.kt.week = isoWeek(todayIso()).id;
  save(); renderKontroly(); toast('Nastavení kontrol uloženo.');
}

/* ---------- PDF: plán s kontrolními listy a výsledky ---------- */
function drawAuditPlan(doc, weekId) {
  const k = pdfKit(doc);
  const plan = audPlan(weekId);
  const today = todayIso();
  const sum = planSummary(weekId, today);
  k.header({ eyebrow: `${EXPORT_NAME} · NAMÁTKOVÉ KONTROLY`, right: `Stav k ${tsText(Date.now())}`, title: 'Plán namátkových kontrol', sub: weekLong(weekId),
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
  k.footer(`${EXPORT_NAME} · namátkové kontroly · ${weekName(weekId)} (${weekRange(weekById(weekId))})`);
}

function drawAuditResults(doc) {
  const k = pdfKit(doc);
  const range = KT_RANGES.find(r => r[0] === ui.kt.range) ? ui.kt.range : '12';
  const today = todayIso();
  const from = range === 'all' ? '' : addDays(today, -7 * +range);
  const r = auditResults(from, today, ui.kt.dept || '');
  const pts = r.rows.reduce((x, c) => x + c.score.n, 0), ok = r.rows.reduce((x, c) => x + c.score.ok, 0);
  const first = r.rows.length ? r.rows[r.rows.length - 1].done : today;
  k.header({ eyebrow: `${EXPORT_NAME} · NAMÁTKOVÉ KONTROLY`, right: `Stav k ${tsText(Date.now())}`, title: 'Výsledky namátkových kontrol',
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
  k.footer(`${EXPORT_NAME} · výsledky namátkových kontrol · stav k ${dayText(today)}`);
}

async function exportAuditPlanPdf(weekId, button) {
  if (!audPlan(weekId)) return;
  await withPdf(button, doc => {
    doc.setProperties({ title: `Plán namátkových kontrol · ${weekName(weekId)}`, subject: weekLong(weekId), creator: EXPORT_NAME });
    drawAuditPlan(doc, weekId);
    const w = weekById(weekId);
    downloadFile(`kontroly-tyden-${w.w}-${w.y}.pdf`, doc.output('blob'), 'application/pdf');
  });
}
async function exportAuditResultsPdf(button) {
  await withPdf(button, doc => {
    doc.setProperties({ title: 'Výsledky namátkových kontrol', creator: EXPORT_NAME });
    drawAuditResults(doc);
    downloadFile(`kontroly-vysledky-${todayIso()}.pdf`, doc.output('blob'), 'application/pdf');
  });
}

