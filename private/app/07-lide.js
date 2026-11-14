/* ==========================================================================
   LIDÉ
   ========================================================================== */
/* Filtr seznamu (2.23): stav člověka. Bez skupiny / směny / hodnocení a v nemoci jen u lidí,
   kteří se hodnotí (ne vedoucí, ne vyřazení). */
const LIDE_STATES = [['', 'Všichni'], ['nogroup', 'Bez skupiny'], ['noshift', 'Bez směny'], ['norate', 'Bez hodnocení'], ['sick', 'V nemoci'], ['lead', 'Vedoucí'], ['out', 'Vyřazení']];
function lideState(e, st) {
  const active = !isLead(e) && !e.excluded;
  if (st === 'nogroup') return active && !e.positionId;
  if (st === 'noshift') return active && !shiftOf(e);
  if (st === 'norate') { const sk = groupSkills(posOf(e)); return active && !!e.positionId && sk.length > 0 && sk.every(x => !rateOf(e, x.id)); }
  if (st === 'sick') return active && !!e.sick;
  if (st === 'lead') return isLead(e);
  if (st === 'out') return !isLead(e) && !!e.excluded;
  return true;
}
/* Oddělení nebo skupina: „d:“ + oddělení (u vedoucích oddělení, která vedou), jinak id skupiny. */
function lideScope(e, g) {
  if (!g) return true;
  if (g.startsWith('d:')) { const d = g.slice(2); return isLead(e) ? e.lead.includes(d) : empDept(e) === d; }
  return !isLead(e) && e.positionId === g;
}
function lideScopeOptions(g) {
  const opt = (v, t) => `<option value="${esc(v)}"${v === g ? ' selected' : ''}>${esc(t)}</option>`;
  const known = new Set(['']);
  const html = departments().map(d => {
    const groups = S.positions.filter(p => deptOf(p) === d);
    known.add(`d:${d}`); groups.forEach(p => known.add(p.id));
    if (groups.length === 1 && (groups[0].name || '') === d) return opt(`d:${d}`, d);
    return `<optgroup label="${esc(d)}">${opt(`d:${d}`, `Celé oddělení ${d}`)}${groups.map(p => opt(p.id, p.name || '(bez názvu)')).join('')}</optgroup>`;
  }).join('');
  return `${opt('', 'Všechna oddělení a skupiny')}${html}${known.has(g) ? '' : opt(g, '(skupina už neexistuje)')}`;
}
function lideFilter() { return P.lideF || { g: '', st: '' }; }
function setLideFilter(patch) {
  setPref({ lideF: { ...lideFilter(), ...patch } });
  renderPeople({ refilter: true });
}
function renderPeople(opts = {}) {
  const q = norm($('#lSearch').value);
  const F = lideFilter();
  // pořadí: hodnocení lidé, vedoucí pracovníci (2.7), vyřazení ze seznamu
  const rank = e => (isLead(e) ? 1 : e.excluded ? 2 : 0);
  const all = Object.values(S.employees).sort((a, b) => (rank(a) - rank(b)) || norm(a.last).localeCompare(norm(b.last), 'cs'));
  const scoped = all.filter(e => lideScope(e, F.g));
  // hledá podle jména i podle ID v evidenci práce (2.45.1); ID bez úvodních nul a mezer jako při párování
  const qw = widKey(q);
  const match = e => lideState(e, F.st) && (!q || norm(`${e.last} ${e.first}`).includes(q) || norm(`${e.first} ${e.last}`).includes(q)
    || (e.wid != null && e.wid !== '' && (norm(String(e.wid)).includes(q) || (!!qw && widKey(e.wid).includes(qw)))));
  let list = scoped.filter(match);
  // po změně filtru se vybere první, kdo mu odpovídá; po úpravě člověka (třeba zařazení do
  // skupiny ve filtru Bez skupiny) zůstane v seznamu označený, dokud se nevybere někdo jiný
  const sel = ui.selPerson && S.employees[ui.selPerson];
  const held = sel && !list.includes(sel) && !opts.refilter ? sel : null;
  if (held) list = all.filter(e => list.includes(e) || e === held);
  else if (list.length && (!sel || !list.includes(sel))) ui.selPerson = list[0].key;
  const p = curPeriod();
  const filtered = !!(F.g || F.st || q);
  $('#lFilters').innerHTML = `<select id="lScope" aria-label="Oddělení nebo skupina">${lideScopeOptions(F.g)}</select>
    <div class="chips lchips" role="group" aria-label="Stav">${LIDE_STATES.map(([k, t]) => { const n = k ? scoped.filter(e => lideState(e, k)).length : scoped.length; return `<button type="button" class="chip${k === F.st ? ' on' : ''}${n ? '' : ' none'}" data-lst="${k}" aria-pressed="${k === F.st}">${esc(t)} <span class="num">${n}</span></button>`; }).join('')}</div>
    ${filtered ? `<p class="lcount small muted">Zobrazeno ${list.length - (held ? 1 : 0)} z ${all.length}${F.g || F.st ? ' · <button type="button" class="linkish" data-lclear>zrušit filtr</button>' : ''}</p>` : ''}`;
  let section = 0;
  $('#lList').innerHTML = list.length ? list.map(e => {
    const r = rank(e);
    const sep = r > section ? (section = r, `<div class="listsep">${r === 1 ? 'Vedoucí pracovníci' : 'Vyřazení ze seznamu'}</div>`) : '';
    const out = e === held ? ' <span class="tag">mimo filtr</span>' : '';
    if (r === 1) {
      return `${sep}<button class="list-item lead-item${e === held ? ' held' : ''}" type="button" data-key="${esc(e.key)}" aria-current="${e.key === ui.selPerson}">
      <span class="lvl lead" title="Vedoucí pracovník" aria-hidden="true">V</span>
      <span class="nm"><b>${esc(e.last)} ${esc(e.first)}${probIcon(e)}${out}</b><span title="${esc(e.lead.join(', '))}">${e.lead.length ? esc(e.lead.join(', ')) : '<span class="warn-t">bez oddělení</span>'}</span></span>
      <span class="tag">vedoucí</span></button>`;
    }
    const ev = evaluate(e, p);
    const L = ev.L;
    return `${sep}<button class="list-item${e.excluded ? ' out' : ''}${e === held ? ' held' : ''}" type="button" data-key="${esc(e.key)}" aria-current="${e.key === ui.selPerson}">
      ${L.pct != null || L.n ? `<span class="lvl l${L.n}" title="Průměrná úroveň dovedností">${L.n}</span>` : '<span class="lvl l0">?</span>'}
      <span class="nm"><b>${esc(e.last)} ${esc(e.first)}${probIcon(e)}${out}</b><span>${L.pos ? esc(L.pos.name) + (L.pct != null ? ` · ${nf(L.pct, 0)} %` : L.legacy ? (L.n ? ` · ${esc(L.lv.name)}` : ' · <span class="warn-t">bez úrovně</span>') : ' · <span class="warn-t">bez dovedností</span>') : '<span class="crit">bez skupiny</span>'}${shiftOf(e) ? ` · ${esc(shiftName(shiftOf(e)).replace('Směnnost – s', 'S'))}` : ''}${e.sick ? ' · <span class="warn-t">nemoc</span>' : ''}${e.legacy ? ' · <span class="tag warn">převést</span>' : ''}${q && e.wid ? ` · ID ${esc(String(e.wid))}` : ''}</span></span>
      ${e.excluded ? '<span class="tag">vyřazen</span>' : `<span class="num small list-val" title="Tabáky za vybraný měsíc">${nf(ev.total, 0)}</span>`}
    </button>`;
  }).join('') : filtered && all.length ? emptyState('Nikdo neodpovídá filtru', 'Zkus jiné oddělení nebo stav, nebo filtr zruš.') : emptyState('Nikdo tu není', 'Nahraj docházku, nebo přidej člověka ručně.');
  $('#peopleSplit').classList.toggle('show-detail', ui.personOpen);
  renderPersonDetail();
  syncHistory();
}

/* Hodnocení dovedností u člověka: řádek za dovednost s volbou úrovně 0–4. */
function rateRows(e, skills) {
  return skills.map(x => {
    const v = rateOf(e, x.id);
    const sc = skillScale(x);
    return `<div class="rate-row"><div class="rate-name"><b>${esc(x.name)}</b>${optTag(x, true)}<small>${v} – ${esc(sc[v].name)}${sc[v].desc ? `: ${esc(sc[v].desc)}` : ''}</small></div>
      <div class="seg rate-seg" role="group" aria-label="${esc(`Úroveň: ${x.name}`)}">${[0, 1, 2, 3, 4].map(n => `<button type="button" class="${n === v ? 'on' : ''}" data-rate="${esc(x.id)}" data-key="${esc(e.key)}" data-lvl="${n}" aria-pressed="${n === v}" title="${esc(rateTitle(x, n))}">${n}</button>`).join('')}</div></div>`;
  }).join('');
}

/* Prémie za vybraný měsíc: splněné a nesplněné podmínky, body vedoucího a série. */
function tierHtml(r, withMarks) {
  const x = r.tier;
  if (!r.pos || !(r.pos.tiers || []).length) return '<p class="small muted">Skupina nemá prémie. Nastavíš je v Matici dovedností → Skupiny a pravidla.</p>';
  const pid = S.current;
  const check = c => `<li class="${c.ok ? 'ok' : 'no'}"><span class="tick" aria-hidden="true">${c.ok ? '✓' : '✗'}</span><span>${esc(c.label)}</span><small>${esc(c.txt)}</small>${withMarks && c.k === 'manual' && pid ? `<button class="linkbtn" type="button" data-mark="${esc(c.id)}" data-key="${esc(r.e.key)}" data-on="${c.ok ? 1 : 0}">${c.ok ? 'označit nesplněno' : 'zase splněno'}</button>` : ''}</li>`;
  return `<div class="tier-result">${x.lvl ? `<p class="tier-got"><span class="raise-ok">${esc(x.name)}</span>${x.pct ? ` · navýšení mzdy <b>+${nf(x.pct, 1)} %</b>` : ''}${x.reward ? ` · ${esc(x.reward)}` : ''}</p>` : '<p class="small muted">Žádná varianta prémie za tento měsíc.</p>'}
    ${x.list.map(it => `<details class="tier-detail"${it === x.next || (!x.next && it.lvl === x.lvl) ? ' open' : ''}><summary><b>${esc(it.t.name)}</b> ${it.ok ? '<span class="t5-state s-ok">splněno</span>' : '<span class="t5-state">nesplněno</span>'}</summary><ul class="tier-checks">${it.checks.map(check).join('') || '<li class="ok"><span>bez podmínek</span></li>'}</ul></details>`).join('')}
    ${(x.streaks || []).map(s => `<p class="small ${s.ok ? 'tier-streak-ok' : 'muted'}">${esc(s.name)}: ${s.have} z ${s.months} měsíců v řadě${s.ok ? ` · <b>${esc(s.label)}</b>` : ` (pro ${esc(s.label)})`}</p>`).join('')}
    ${pid ? '' : '<p class="small muted">Prémie se vyhodnocuje za vybrané období s docházkou.</p>'}</div>`;
}

/* Srážka ze mzdy za neproduktivitu u člověka za vybraný měsíc (2.12). */
function normCutCardHtml(e, prod) {
  const x = S.current ? normCutOf(e, S.current, prod) : null;
  const rule = normCutRule(posOf(e));
  if (!x && !rule) return '';
  const head = `<h3>Srážka ze mzdy za neproduktivitu · ${esc(periodName2(curPeriod()))}</h3>`;
  if (!x) return `<div class="card ncut-card">${head}<p class="small muted">${S.current && rule.from && S.current < rule.from ? `Srážky za neproduktivitu platí od ${esc(monthLabel(rule.from))}.` : 'Vyber měsíc s evidencí práce.'}</p></div>`;
  const bands = x.rule ? `<p class="tiny muted">Pásma skupiny: ${esc(normCutText(x.rule))}.</p>` : '';
  let body;
  if (x.done) body = `<p class="ncut-res"><span class="pen">−${x.pct} % ze mzdy</span> · plnění normy ${x.done.norm == null ? '—' : `${nf(x.done.norm, 1)} %`}</p>
    <div class="wage-cell"><span class="ok-mark" title="${esc(x.done.by ? `Zpracoval(a) ${x.done.by}` : '')}">${I.check}zpracováno ${esc(dayText(todayIso(x.done.at), false))}</span> <button class="linkbtn" type="button" data-ncundo="${esc(e.key)}">zrušit</button></div>`;
  else if (x.norm == null) body = '<p class="small muted">Plnění normy za měsíc zatím není. Spočítá se z evidence práce (řádky s časem i normou).</p>';
  else if (!x.pct) body = `<p class="ncut-res"><span class="raise-ok">Bez srážky</span> · plnění normy <b>${nf(x.norm, 1)} %</b></p>`;
  else body = `<p class="ncut-res"><span class="pen">−${x.pct} % ze mzdy</span> · plnění normy <b>${nf(x.norm, 1)} %</b> (pásmo do ${nf(x.band.max, 1)} %)</p>
    <p class="small muted">Benefity se nekrátí. Srážku zpracuj ve mzdách; týden před koncem měsíce vyskočí upozornění.</p>
    <div class="row gap"><button class="btn small" type="button" data-ncdone="${esc(e.key)}">Srážka zpracována</button></div>`;
  return `<div class="card ncut-card">${head}${body}${bands}</div>`;
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

/* Smazání člověka (běžného i vedoucího). */
function bindPersonDelete(e) {
  $('#pDel').onclick = async () => {
    const count = S.sanctions.filter(s => s.key === e.key).length;
    if (!(await confirmBox('Smazat člověka?', `${e.last} ${e.first} zmizí ze seznamu i se zařazením a úrovní.${count ? ` Smaže se i ${count} sankcí.` : ''} Docházka v nahraných souborech zůstane.${lkWarnText(e.key)}`, 'Smazat', true))) return;
    delete S.employees[e.key];
    lkAfterLeave(e.key, `${e.last} ${e.first}`);
    S.sanctions = S.sanctions.filter(s => s.key !== e.key);
    Object.values(S.adjust).forEach(b => { delete b[e.key]; });
    Object.values(S.issued || {}).forEach(b => { delete b[e.key]; });
    ui.selPerson = null; ui.personOpen = false;
    save(); renderAll(); toast('Smazáno.');
  };
}

/* Zaškrtávání oddělení vedoucího: existující oddělení, k tomu ta, která už žádná skupina nemá. */
function leadDeptsHtml(chosen, attr) {
  const deps = departments();
  const stale = (chosen || []).filter(d => !deps.includes(d));
  if (!deps.length && !stale.length) return '<p class="small muted">Zatím žádné oddělení. Oddělení se nastavuje u skupin v Matici dovedností → Skupiny a pravidla.</p>';
  return `<div class="lead-depts">${[...deps, ...stale].map(d => `<label class="lead-dept"><input type="checkbox" ${attr}="${esc(d)}"${(chosen || []).includes(d) ? ' checked' : ''}><span>${esc(d)}${stale.includes(d) ? ' <small class="muted">(oddělení už žádná skupina nemá)</small>' : ''}</span></label>`).join('')}</div>`;
}

function setLead(e, on) {
  if (on) { e.lead = empDept(e) ? [empDept(e)] : []; delete e.excluded; } else delete e.lead;
  save(); renderAll();
  toast(on ? `${e.last} ${e.first} je vedoucí pracovník: nepočítá se do benefitů, v matici je jako vedoucí oddělení.` : `${e.last} ${e.first} už není vedoucí pracovník.`);
}

function renderLeadDetail(box, e) {
  const sk = S.leadSkills || [];
  box.innerHTML = `<button class="btn ghost small back-btn" type="button" id="pBack">${I.back}Seznam lidí</button>
    <div class="stack"><div class="card">
      <div class="card-head">
        <div><p class="eyebrow">Vedoucí pracovník</p><h2>${esc(e.last)} ${esc(e.first)}</h2></div>
        <div class="row gap"><button class="btn ghost small" type="button" id="pDel" title="Smaže člověka ze seznamu">Smazat</button></div>
      </div>
      <div class="note i">Nepočítá se do tabáků, Kafe, prémií ani sankcí a není v přehledu, výrobě, kontrolách ani v kapacitě směn. V Matici dovedností je uvedený jako vedoucí zaškrtnutých oddělení.</div>
      <h3 class="lead-title">Oddělení, která má na starosti</h3>
      ${leadDeptsHtml(e.lead, 'data-leaddept')}
      <div class="form-grid"><label class="field"><span>Poznámka</span><input type="text" id="pNote" value="${esc(e.note || '')}" placeholder="volitelné" maxlength="500"></label></div>
      <label class="switch"><input type="checkbox" id="pLead" checked><span>Vedoucí pracovník (vypnutím se z něj stane běžně hodnocený člověk)</span></label>
    </div>
    <div class="card lead-rate">
      <div class="card-head"><div><h3>Dovednosti vedoucího</h3>${sk.length ? `<p class="small muted">Průměr <b>${nf(leadPct(e), 1)} %</b> · stejné dovednosti pro všechny vedoucí, standardní schéma 0–4</p>` : ''}</div>
        <button class="btn ghost small" type="button" data-goleads>Upravit seznam</button></div>
      ${sk.length ? `<div class="rate-list">${rateRows(e, sk)}</div>` : '<p class="small muted">Zatím žádné dovednosti vedoucích. Seznam, stejný pro všechny vedoucí, založíš v Matici dovedností → Vedoucí.</p>'}
    </div></div>`;
  $('#pBack').onclick = () => navBack(prev => prev.odmView === 'lide' && !prev.sub, closePersonDetail);
  $('#pNote').oninput = event => { e.note = event.target.value; save(); };
  $('#pLead').onchange = event => setLead(e, event.target.checked);
  box.querySelectorAll('[data-leaddept]').forEach(input => {
    input.onchange = () => {
      e.lead = $$('[data-leaddept]', box).filter(x => x.checked).map(x => x.dataset.leaddept);
      save(); renderPeople(); renderMatrix();
    };
  });
  bindPersonDelete(e);
}

function renderPersonDetail() {
  const box = $('#lDetail');
  const e = ui.selPerson ? S.employees[ui.selPerson] : null;
  if (!e) { box.innerHTML = '<div class="card">' + emptyState('Vyber člověka', 'Klikni na jméno v seznamu.') + '</div>'; return; }
  if (isLead(e)) { renderLeadDetail(box, e); return; }
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
        <div><p class="eyebrow">Zaměstnanec</p><h2>${esc(e.last)} ${esc(e.first)}${probIcon(e)}</h2>${probationOf(e) ? `<p class="small muted prob-line">${esc(probText(probationOf(e)))}</p>` : ''}</div>
        <div class="row gap">
          <button class="btn small" type="button" data-profile="${esc(e.key)}">Profil a historie</button>
          ${e.excluded ? `<button class="btn small" type="button" data-include="${esc(e.key)}">Vrátit do seznamu</button>` : `<button class="btn sec small" type="button" data-exclude="${esc(e.key)}" title="Přestane se hodnotit, data zůstanou">Vyřadit</button>`}
          <button class="btn ghost small" type="button" id="pDel" title="Smaže člověka i jeho zařazení a sankce">Smazat</button>
        </div>
      </div>
      ${e.excluded ? '<div class="note w"><b>Vyřazen ze seznamu.</b> Nehodnotí se a není v přehledu, výrobě ani v nabídce sankcí. Zařazení a historie zůstávají.</div>' : ''}
      ${lkPersonHtml(e)}
      <div class="form-grid">
        <label class="field"><span>Skupina</span><select id="pPos">${posOptions(e.positionId, '— bez skupiny —')}</select></label>
        <label class="field"><span>Směna</span><select id="pShift"><option value="">— bez směny —</option>${SHIFTS.map(([k, label]) => `<option value="${k}"${shiftOf(e) === k ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
        <label class="field"><span>Poznámka</span><input type="text" id="pNote" value="${esc(e.note || '')}" placeholder="volitelné" maxlength="500"></label>
        <label class="field"><span>ID v evidenci práce</span><input type="text" id="pWid" value="${esc(e.wid || '')}" placeholder="volitelné" maxlength="40" autocomplete="off"></label>
        <label class="field"><span>Konec trestu${e.end ? ` <small class="muted">za ${Math.max(0, daysBetween(todayIso(), e.end))} dní</small>` : ''}</span><input type="date" id="pEnd" value="${esc(e.end || '')}"></label>
      </div>
      <p class="small muted fri-auto">Zkrácený pátek se pozná sám: odpolední směna v pátek má ${nf(friShift())} h jako celou směnu (podle příchodu, jinak podle směny a střídání skupin).</p>
      <label class="switch"><input type="checkbox" id="pSick"${e.sick ? ' checked' : ''}><span>Nemoc: dočasně se nepočítá do kapacit směn${e.sick ? ` (od ${esc(dayText(e.sick))})` : ''}</span></label>
      <label class="switch"><input type="checkbox" id="pLead"><span>Vedoucí pracovník: nepočítá se do benefitů, v Matici dovedností jen jako vedoucí oddělení</span></label>
    </div>
    ${tkReqCard(e)}
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
    ${normCutCardHtml(e, pr)}
    ${pr ? `<div class="card"><h3>Výroba · ${esc(periodName2(p))}</h3>${prodKv({ prod: pr, att: a, e })}<p class="explain">Údaj z evidence práce. Do tabáků se nezapočítává.</p></div>`
      : (prodPeriod() ? '<div class="card"><h3>Výroba</h3><p class="small muted">Pro tenhle měsíc nemá žádný záznam v evidenci práce. Pokud je tam pod jiným tvarem jména, spáruj ho v části <b>Výroba</b>.</p></div>' : '')}
    ${ktPersonCard(e.key)}
  </div>`;
  setWidths(box);
  $('#pBack').onclick = () => navBack(prev => prev.odmView === 'lide' && !prev.sub, closePersonDetail);
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
  $('#pLead').onchange = event => setLead(e, event.target.checked);
  bindTkReqCard(box, e);
  // konec trestu (2.43): ukládá se při opuštění pole (datum se píše po číslicích, nepřekreslovat na change)
  $('#pEnd').addEventListener('focusout', event => {
    const v = event.target.value;
    if (v && !ISO_DAY.test(v)) return;
    if ((e.end || '') === v) return;
    if (v) e.end = v; else delete e.end;
    save();
    if (ui.view === 'konce') renderEnds();
    toast(v ? `${e.last} ${e.first}: konec trestu ${endDateText(v)}.` : `${e.last} ${e.first}: konec trestu smazán.`);
  });
  $('#pSick').onchange = event => {
    if (event.target.checked) e.sick = todayIso(); else delete e.sick;
    save(); renderPeople(); renderMatrix();
    toast(e.sick ? `${e.last} ${e.first}: nemoc, dočasně se nepočítá do kapacit směn.` : `${e.last} ${e.first} je zpátky v kapacitách.`);
  };
  bindPersonDelete(e);
}

