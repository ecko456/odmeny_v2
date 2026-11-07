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

const MX_TABS = [['matrix', 'Matice'], ['groups', 'Skupiny a pravidla'], ['cap', 'Směny a kapacita'], ['leads', 'Vedoucí']];
const SHIFT_ORDER = ['R', 'O', 'S1', 'S2', ''];

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
  showActiveChip($('#mxTabs'));
  $('#mxPanelMatrix').hidden = tab !== 'matrix';
  $('#mxPanelGroups').hidden = tab !== 'groups';
  $('#mxPanelCap').hidden = tab !== 'cap';
  $('#mxPanelLeads').hidden = tab !== 'leads';
  if (tab === 'groups') renderPositions();
  else if (tab === 'cap') renderCapacity();
  else if (tab === 'leads') renderLeadMatrix();
  else renderMatrixGrid();
}

/* Filtr matice: všechna oddělení, celé oddělení („d:“ + název), nebo jedna skupina (id). */
function mxFilter(groups) {
  const v = String(P.matrixDept || '');
  const group = groups.find(p => p.id === v);
  if (group) return { group };
  const gs = v.startsWith('d:') ? groups.filter(p => deptOf(p) === v.slice(2)) : [];
  // oddělení, kterému zbyla jedna skupina, je v nabídce jako ta skupina
  if (gs.length === 1) return { group: gs[0] };
  return gs.length ? { dept: v.slice(2) } : {};
}
function mxFilterOptions(groups, f) {
  const opt = (v, label, on) => `<option value="${esc(v)}"${on ? ' selected' : ''}>${esc(label)}</option>`;
  return opt('', 'Všechna oddělení', !f.group && !f.dept) + [...new Set(groups.map(deptOf))].map(d => {
    const gs = groups.filter(p => deptOf(p) === d);
    if (gs.length === 1) return opt(gs[0].id, gs[0].name === d ? d : `${d} – ${gs[0].name || '(bez názvu)'}`, f.group === gs[0]);
    return `<optgroup label="${esc(d)}">${opt(`d:${d}`, `${d} – celé oddělení`, f.dept === d)}${gs.map(p => opt(p.id, p.name || '(bez názvu)', f.group === p)).join('')}</optgroup>`;
  }).join('');
}

/* Člověk v matici: jméno, nebo jen ID z evidence práce (2.20, přepínač Jen ID zaměstnanců). */
function mxWho(e, ids = P.matrixIds) { return ids ? (e.wid ? `ID ${e.wid}` : 'bez ID') : `${e.last} ${e.first}`; }
function mxWhoHtml(e) { return (P.matrixIds && !e.wid ? '<span class="muted">bez ID</span>' : esc(mxWho(e))) + probIcon(e); }

/* Jedno oddělení v matici (2.10.1): hlavička s vedoucími a souhrnem, tabulka jen s dovednostmi
   oddělení (lidé jeho skupin a zaučení odjinud) a dole pokrytí úrovní 3–4 po směnách. */
function mxSectionHtml(dept, m, shift) {
  const home = m.rows.filter(r => r.home);
  const pcts = home.map(r => r.pct).filter(v => v != null);
  const avg = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
  const guests = m.rows.length - home.length;
  const weak = m.rows.length ? m.coverage.filter(c => c.ready < 2 && !c.opt).length : 0;
  const leads = leadPeople().length ? leadsOf(dept) : null;
  const names = m.groups.map(p => p.name || '(bez názvu)');
  const kpi = (v, label, cls = '') => `<div class="mx-kpi${cls}"><b>${v}</b><span>${label}</span></div>`;
  const head = `<div class="mx-sec-head">
    <div class="mx-sec-title"><p class="eyebrow">Oddělení</p><h3>${esc(dept)}</h3>
      ${m.groups.length > 1 || names[0] !== dept ? `<p class="small muted">${m.groups.length > 1 ? 'Skupiny' : 'Skupina'} ${names.map(esc).join(', ')}</p>` : ''}
      ${leads ? `<p class="mx-sec-lead">Vedoucí: ${leads.length ? leads.map(e => `<button class="linkish" type="button" data-mxperson="${esc(e.key)}">${mxWhoHtml(e)}</button>`).join(', ') : '<span class="muted">bez vedoucího</span>'}</p>` : ''}</div>
    <div class="mx-kpis">
      ${kpi(home.length, home.length === 1 ? 'člověk' : home.length >= 2 && home.length <= 4 ? 'lidé' : 'lidí')}
      ${guests ? kpi(`+${guests}`, 'zaučení odjinud') : ''}
      ${m.sick ? kpi(m.sick, 'v nemoci, do počtů úrovní se nepočítá', ' warn') : ''}
      ${kpi(avg != null ? `${nf(avg, 0)} %` : '—', 'průměr dovedností')}
      ${m.rows.length ? kpi(`${weak}<small> z ${m.cols.length}</small>`, weak ? `${m.cols.length === 1 ? 'dovednosti' : 'dovedností'} má na úrovni 3–4 méně než 2 lidi` : 'každou dovednost umí na úrovni 3–4 aspoň 2 lidé', weak ? ' warn' : ' ok')
        : kpi(m.cols.length, m.cols.length === 1 ? 'dovednost' : m.cols.length >= 2 && m.cols.length <= 4 ? 'dovednosti' : 'dovedností')}
    </div></div>`;
  if (!m.rows.length) return `<section class="card mx-sec" data-mxdept="${esc(dept)}">${head}<p class="small muted mx-sec-empty">${shift !== '*' ? 'Na vybrané směně tu nikdo není.' : 'Zatím tu nikdo není. Lidi zařadíš do skupin v části Lidé.'}</p></section>`;
  const spans = [];
  m.cols.forEach(c => { const last = spans[spans.length - 1]; if (last && last.p === c.p) last.n += 1; else spans.push({ p: c.p, n: 1 }); });
  const cell = (r, v, j) => {
    const c = m.cols[j];
    const own = r.e.positionId === c.p.id;
    const next = (v + 1) % 5;
    return `<td class="mx-cell${own ? ' is-main' : ''}"><button type="button" class="mx-btn" data-mxr="${esc(r.e.key)}" data-skill="${esc(c.s.id)}" data-lvl="${v}" title="${esc(`${c.s.name}: ${rateTitle(c.s, v)}. Kliknutím ${next ? `na ${next}` : 'na 0'}.`)}" aria-label="${esc(`${mxWho(r.e)}, ${c.s.name}: ${v}`)}">${iluo(v, own)}<b>${v || ''}</b></button></td>`;
  };
  const n = m.cols.length + 4;   // + prázdný sloupec do plné šířky (sloupce oddělení jsou pod sebou zarovnané)
  const fill = '<td class="mx-fill"></td>';
  let body = '';
  const blocks = SHIFT_ORDER.filter(k => m.rows.some(r => r.shift === k));
  blocks.forEach(k => {
    const rows = m.rows.filter(r => r.shift === k);
    body += `<tr class="mx-sep"><td colspan="${n}">${esc(shiftName(k))} · ${peopleCount(rows.length)}</td></tr>`;
    body += rows.map(r => `<tr${r.home ? '' : ' class="mx-guest"'}>
      <th class="mx-name" scope="row"><button class="linkish" type="button" data-mxperson="${esc(r.e.key)}">${mxWhoHtml(r.e)}</button>${r.e.sick ? ' <span class="tag warn" title="Dočasně se nepočítá do kapacit směn ani do počtů úrovní">nemoc</span>' : ''}</th>
      <td class="mx-main">${r.pos ? esc(r.pos.name) : '<span class="muted">—</span>'}${r.home ? '' : ' <span class="tag" title="Patří do jiné skupiny, tady je zaučený">zaučení</span>'}</td>
      <td class="mx-pct num">${r.pct != null ? `${nf(r.pct, 0)} %` : '<span class="muted">—</span>'}</td>
      ${r.cells.map((v, j) => cell(r, v, j)).join('')}${fill}</tr>`).join('');
    // jen jedna směna: součet za směnu = celkem dole, neopakuje se
    if (blocks.length > 1) body += `<tr class="mx-sub"><th colspan="3">Úroveň 3–4 · ${esc(shiftName(k))}</th>${m.coverage.map(c => `<td class="${c.by[k].ready || c.opt ? '' : 'mx-risk'}">${c.by[k].ready}</td>`).join('')}${fill}</tr>`;
  });
  return `<section class="card mx-sec" data-mxdept="${esc(dept)}">${head}
    <div class="table-card flat matrix-card mx-sec-table"><table class="matrix skills">
      <thead>${m.groups.length > 1 ? `<tr class="mx-depts"><th colspan="3"></th>${spans.map(g => `<th colspan="${g.n}" class="mx-dept">${esc(g.p.name || '')}</th>`).join('')}<th class="mx-fill"></th></tr>` : ''}
        <tr><th class="mx-name">${P.matrixIds ? 'ID zaměstnance' : 'Zaměstnanec'}</th><th class="mx-main">Skupina</th><th class="mx-pct">%</th>${m.cols.map(c => `<th class="mx-col${c.s.opt ? ' is-opt' : ''}" title="${esc(`${c.p.name}: ${c.s.name}${c.s.opt ? ' (není nutností, v procentu váha ¼)' : ''}${c.s.desc ? ` – ${c.s.desc}` : ''}`)}"><span>${esc(c.s.name)}</span>${c.s.opt ? '<small>nepovinná</small>' : ''}</th>`).join('')}<th class="mx-fill"></th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><th colspan="3">Úroveň 3–4 celkem${m.sick ? '<small> bez nemocných</small>' : ''}</th>${m.coverage.map(c => `<td class="${c.ready < 2 && !c.opt ? 'mx-risk' : ''}">${c.ready}</td>`).join('')}${fill}</tr>
        <tr><th colspan="3">Hodnoceno 1–4 celkem${m.sick ? '<small> bez nemocných</small>' : ''}</th>${m.coverage.map(c => `<td>${c.trained}</td>`).join('')}${fill}</tr></tfoot>
    </table></div></section>`;
}

function renderMatrixGrid() {
  const box = $('#matrixView');
  const groups = S.positions.filter(p => isGroup(p) && groupSkills(p).length);
  const f = mxFilter(groups);
  const shift = ['*', ...SHIFT_ORDER].includes(P.matrixShift) ? P.matrixShift : '*';
  $('#matrixGroup').innerHTML = mxFilterOptions(groups, f);
  $('#matrixShift').innerHTML = `<option value="*">Všechny směny</option>${SHIFT_ORDER.map(k => `<option value="${k}"${k === shift ? ' selected' : ''}>${esc(shiftName(k))}</option>`).join('')}`;
  $('#matrixIds').checked = !!P.matrixIds;
  $('#matrixLegend').innerHTML = `${STD_SCALE.map((l, i) => `<span>${iluo(i)} ${i} ${esc(l.name.replace(' úroveň', ''))}</span>`).join('')}<span>${iluo(3, true)} dovednost vlastní skupiny</span><span><i class="mx-risk-dot"></i> na směně nikdo na úrovni 3–4</span><span><span class="tag warn">nemoc</span> je vidět, do počtů úrovní se dočasně nepočítá</span>`;
  if (!groups.length) {
    box.innerHTML = `<div class="card">${emptyState('Žádné dovednosti', 'Nejdřív založ skupiny a jejich dovednosti v záložce Skupiny a pravidla.', '<button class="btn" type="button" data-mxtab="groups">Skupiny a pravidla</button>')}</div>`;
    return;
  }
  const deps = f.group ? [deptOf(f.group)] : f.dept ? [f.dept] : [...new Set(groups.map(deptOf))];
  const secs = deps.map(d => ({ d, m: f.group ? skillGrid(f.group.id, shift, null, P.matrixIds) : skillGrid(null, shift, d, P.matrixIds) }));
  // s filtrem směny jen oddělení, kde na směně někdo je
  const shown = shift === '*' || deps.length === 1 ? secs : secs.filter(x => x.m.rows.length);
  box.innerHTML = shown.length ? shown.map(x => mxSectionHtml(x.d, x.m, shift)).join('')
    : `<div class="card">${emptyState('Zatím nikdo', 'Na vybrané směně nikdo není. Změň filtr směny, nebo doplň směny lidem v části Lidé.')}</div>`;
  $$('.matrix', box).forEach(table => {
    const deptRow = table.querySelector('tr.mx-depts');
    if (deptRow) $$('thead tr:not(.mx-depts) th', table).forEach(th => { th.style.top = `${deptRow.offsetHeight}px`; });
  });
}

/* Dovednosti vedoucích (2.10): jeden seznam pro všechny vedoucí pracovníky, každý se hodnotí
   0–4 standardním schématem. Do tabáků, prémií ani kapacity směn se nepočítají. */
function leadSkillRowHtml(x, i, n) {
  return `<div class="sk-row" data-lsrow="${esc(x.id)}">
    <div class="sk-main"><b>${esc(x.name)}</b>${x.desc ? `<p class="small muted">${esc(x.desc)}</p>` : ''}</div>
    <div class="sk-tools">
      <button class="icon-btn" type="button" data-lsup aria-label="Posunout nahoru"${i ? '' : ' disabled'}>${I.back}</button>
      <button class="icon-btn sk-down" type="button" data-lsdown aria-label="Posunout dolů"${i < n - 1 ? '' : ' disabled'}>${I.back}</button>
      <button class="btn sec small" type="button" data-lsedit>Upravit</button>
      <button class="icon-btn" type="button" data-lsdel aria-label="Smazat dovednost">${I.x}</button>
    </div>
  </div>`;
}
function renderLeadMatrix() {
  const box = $('#leadView');
  const sk = S.leadSkills || [];
  const people = leadPeople();
  const cell = (e, x) => {
    const v = rateOf(e, x.id);
    const next = (v + 1) % 5;
    return `<td class="mx-cell"><button type="button" class="mx-btn" data-mxr="${esc(e.key)}" data-skill="${esc(x.id)}" data-lvl="${v}" title="${esc(`${x.name}: ${rateTitle(x, v)}. Kliknutím na ${next}.`)}" aria-label="${esc(`${e.last} ${e.first}, ${x.name}: ${v}`)}">${iluo(v)}<b>${v || ''}</b></button></td>`;
  };
  const count = (x, lo) => people.filter(e => rateOf(e, x.id) >= lo).length;
  let grid = '';
  if (!people.length) grid = `<div class="card">${emptyState('Zatím žádný vedoucí', 'Vedoucího přidáš v části Lidé: Přidat člověka → Vedoucí pracovník, nebo zapneš Vedoucí pracovník u člověka v seznamu.')}</div>`;
  else if (sk.length) {
    grid = `<div class="table-card matrix-card lead-wrap"><table class="matrix skills lead-matrix">
      <thead><tr><th class="mx-name">Vedoucí</th><th class="mx-main">Oddělení</th><th class="mx-pct">%</th>${sk.map(x => `<th class="mx-col" title="${esc(`${x.name}${x.desc ? ` – ${x.desc}` : ''}`)}"><span>${esc(x.name)}</span></th>`).join('')}</tr></thead>
      <tbody>${people.map(e => `<tr><th class="mx-name" scope="row"><button class="linkish" type="button" data-mxperson="${esc(e.key)}">${esc(e.last)} ${esc(e.first)}</button></th>
        <td class="mx-main">${e.lead.length ? esc(e.lead.join(', ')) : '<span class="muted">bez oddělení</span>'}</td>
        <td class="mx-pct num">${nf(leadPct(e), 0)} %</td>${sk.map(x => cell(e, x)).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr><th colspan="3">Úroveň 3–4 celkem</th>${sk.map(x => `<td>${count(x, 3)}</td>`).join('')}</tr>
        <tr><th colspan="3">Hodnoceno 1–4 celkem</th>${sk.map(x => `<td>${count(x, 1)}</td>`).join('')}</tr></tfoot>
    </table></div>
    <div class="mx-legend">${STD_SCALE.map((l, i) => `<span>${iluo(i)} ${i} ${esc(l.name.replace(' úroveň', ''))}</span>`).join('')}</div>`;
  }
  box.innerHTML = `${grid}<div class="card lead-skills">
    <div class="card-head"><div><h3>Dovednosti vedoucích</h3><p class="small muted">Stejné pro všechny vedoucí pracovníky, každý má svou úroveň 0–4 podle standardního schématu. Hodnotíš kliknutím do matice nebo v detailu vedoucího v části Lidé. Do tabáků, prémií ani kapacity směn se nepočítají.</p></div>
      <button class="btn small" type="button" id="leadSkillAdd">Přidat dovednost</button></div>
    ${sk.length ? `<div class="sk-list">${sk.map((x, i) => leadSkillRowHtml(x, i, sk.length)).join('')}</div>` : '<p class="small muted">Zatím žádná dovednost. Přidej první, třeba Vedení lidí, Plánování směn nebo Řešení problémů.</p>'}
    <p class="tiny muted">Standardní schéma: ${STD_SCALE.map((l, i) => `${i} ${esc(l.name)}`).join(' · ')}</p>
  </div>`;
}
/* Dialog dovednosti vedoucích: jen název a popis, hodnotí se vždy standardním schématem. */
async function leadSkillDialog(x) {
  const result = await dialog({
    title: x ? 'Upravit dovednost vedoucích' : 'Přidat dovednost vedoucích', ok: x ? 'Uložit' : 'Přidat',
    html: `<label class="field"><span>Název dovednosti</span><input name="name" value="${esc(x ? x.name : '')}" maxlength="80" required autofocus placeholder="např. Vedení lidí"></label>
      <label class="field"><span>Popis (nepovinné)</span><textarea name="desc" rows="3" maxlength="1000" placeholder="Co dovednost zahrnuje">${esc(x ? x.desc : '')}</textarea></label>
      <p class="small muted">Platí pro všechny vedoucí. Hodnotí se standardním schématem: ${STD_SCALE.map((l, i) => `${i} ${esc(l.name)}`).join(' · ')}.</p>`,
    validate: form => (form.elements.namedItem('name').value.trim() ? null : 'Napiš název dovednosti.'),
  });
  if (result.value !== 'ok') return null;
  const f = result.form.elements;
  return { name: f.namedItem('name').value.trim().slice(0, 80), desc: f.namedItem('desc').value.trim().slice(0, 1000) };
}
async function leadSkillClick(t) {
  S.leadSkills = S.leadSkills || [];
  const list = S.leadSkills;
  if (t.closest('#leadSkillAdd')) {
    const v = await leadSkillDialog(null);
    if (!v) return;
    list.push({ id: uid('l'), ...v });
    save(); renderMatrix(); toast(`Dovednost ${v.name} přidána ke všem vedoucím.`);
    return;
  }
  const row = t.closest('[data-lsrow]');
  const i = row ? list.findIndex(x => x.id === row.dataset.lsrow) : -1;
  if (i < 0) return;
  if (t.closest('[data-lsup]') && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
  else if (t.closest('[data-lsdown]') && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
  else if (t.closest('[data-lsedit]')) { const v = await leadSkillDialog(list[i]); if (!v) return; Object.assign(list[i], v); }
  else if (t.closest('[data-lsdel]')) {
    const x = list[i];
    const rated = leadPeople().filter(e => rateOf(e, x.id) > 0).length;
    if (!(await confirmBox('Smazat dovednost vedoucích?', `Dovednost ${x.name} zmizí u všech vedoucích${rated ? ` a ${rated} z nich přijde o její hodnocení` : ''}.`, 'Smazat', true))) return;
    list.splice(i, 1);
    Object.values(S.employees).forEach(e => { if (e.rate) { delete e.rate[x.id]; if (!Object.keys(e.rate).length) delete e.rate; } });
  } else return;
  save(); renderMatrix(); renderPeople();
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
/* Týdny reportu kapacit (2.8): skupiny 1 a 2 se střídají po týdnu. S nastaveným střídáním
   (S.capReport.s1am) tento a příští týden, jinak obě varianty. Ranní = stálá ranní + skupina,
   která má ranní; odpolední = stálá odpolední + ta druhá. */
function capWeeks(rep) {
  if (!rep.s1am) return [{ v: 'A', label: 'Varianta A', short: 'Var. A' }, { v: 'B', label: 'Varianta B', short: 'Var. B' }];
  const cw = isoWeek(todayIso()).id;
  return [[cw, 'Tento týden'], [shiftWeek(cw, 1), 'Příští týden']].map(([id, label]) => ({ id, v: capWeekVar(id, rep.s1am), label: `${label} ${weekName(id)}`, short: weekName(id).replace(/\/\d{4}$/, '') }));
}
/* Plánovaná kapacita skupiny (2.9): tento a příští týden (nebo varianty A/B). */
function planUnit(x, v) { return x.unit === 'h' ? `${nf(v, 1)} h` : `${nf(v, 0)} ks`; }
function planRows(p) { const rep = S.capReport || blankCapReport(); return capWeeks(rep).map(w => ({ w, x: groupPlan(p, w.v, w.id ? workDays(w.id) : 5, rep.thr) })).filter(r => r.x); }
/* Buňka plánované kapacity (2.23): zkušení pracovníci tučně, pracovníci v zácviku zvlášť pod nimi. */
function planCell(x, k, n) {
  const ok = x.ok || x, tr = x.tr;
  const trN = !tr ? 0 : n ? tr[n] : tr.amN + tr.pmN;
  return `<b>${planUnit(x, ok[k])}</b>${n ? `<small>${peopleCount(ok[n])}</small>` : ''}${trN ? `<small class="cap-tr">v zácviku ${planUnit(x, tr[k])}${n ? ` (${peopleCount(tr[n])})` : ''}</small>` : ''}`;
}
function workDaysW(n) { return n === 1 ? 'pracovní den' : n >= 2 && n <= 4 ? 'pracovní dny' : 'pracovních dní'; }
function planHtml(p) {
  const rows = planRows(p);
  if (!rows.length) return '';
  const x0 = rows[0].x;
  const out = [x0.none ? `${peopleCount(x0.none)} bez směny` : '', x0.sick ? `${peopleCount(x0.sick)} v nemoci` : ''].filter(Boolean).join(', ');
  return `<div class="table-card flat plan-wrap"><table class="plan-table"><thead><tr><th>${rows[0].w.id ? 'Týden' : 'Varianta'}</th><th class="r">Ranní</th><th class="r">Odpolední</th><th class="r">Za den</th><th class="r">Za týden</th></tr></thead><tbody>${rows.map(({ w, x }) => `<tr><th scope="row">${esc(w.label)}<small>ranní skupina ${w.v === 'A' ? 1 : 2}</small></th>
      <td class="r num">${planCell(x, 'am', 'amN')}</td>
      <td class="r num">${planCell(x, 'pm', 'pmN')}</td>
      <td class="r num">${planCell(x, 'day')}</td>
      <td class="r num">${planCell(x, 'week')}<small>${x.days} ${workDaysW(x.days)}</small></td></tr>`).join('')}</tbody></table></div>
    <p class="tiny muted">${planUnit(x0, x0.per)} na osobu za směnu × zkušení pracovníci skupiny na směně (průměr dovedností aspoň úroveň ${capThr()}); pracovníci v zácviku jsou zvlášť a do kapacity zkušených se nepočítají. Ranní = stálá ranní + skupina, která má ranní; odpolední = stálá odpolední + druhá skupina; týden = den × pracovní dny bez svátků.${out ? ` Nepočítá se: ${esc(out)}.` : ''}${rows[0].w.id ? '' : ' Kdo má tento týden ranní, nastavíš v Matici dovedností → Směny a kapacita.'}</p>`;
}
function capCompo(v) { return v === 'A' ? 'ranní = stálá ranní + skupina 1, odpolední = stálá odpolední + skupina 2' : 'ranní = stálá ranní + skupina 2, odpolední = stálá odpolední + skupina 1'; }
function capThr() { return clamp(Math.round(+(S.capReport || blankCapReport()).thr || 3), 1, 4); }
/* Počet zkušených pracovníků a pod ním zvlášť pracovníci v zácviku (2.23); barva rizika jen podle
   zkušených. Pojmy v reportech od 2.25 podle přání uživatele: zkušení pracovníci a pracovníci v zácviku. */
const CAP_PRO = 'Zkušení pracovníci', CAP_TR = 'Pracovníci v zácviku';
function capCell(n, risk, tr) { return `<td class="r num${risk && !n ? ' cap-zero' : risk && n === 1 ? ' cap-one' : ''}"><span class="cap-n">${n}</span>${tr ? `<small class="cap-tr">${tr} v zácviku</small>` : ''}</td>`; }
/* Dva řádky celkového skóre skupiny (2.25): zkušení pracovníci (barva rizika) a pracovníci v zácviku,
   u nich pod počtem průměr zaškolení (2.25.2; 100 % = úroveň zkušeného pracovníka). */
function trainNote(sum, n) { const v = trainAvg(sum, n); return v == null ? '' : `Ø ${nf(v, 0)} %`; }
function trainCell(n, sum) { return `<td class="r num"><span class="cap-n">${n}</span>${n ? `<small class="cap-tr" title="průměr zaškolení, 100 % = úroveň zkušeného pracovníka">${trainNote(sum, n)}</small>` : ''}</td>`; }
function capScoreCells(sc, weeks, noShift, tr) {
  if (tr) return weeks.map(w => trainCell(sc[w.v].amT, sc[w.v].amTs) + trainCell(sc[w.v].pmT, sc[w.v].pmTs)).join('') + (noShift ? trainCell(sc.none.tr, sc.none.trS) : '');
  return weeks.map(w => capCell(sc[w.v].am, true) + capCell(sc[w.v].pm, true)).join('') + (noShift ? capCell(sc.none.n, false) : '');
}
/* Průměr zaškolení skupiny do textu: „, Ø zaškolení 58 %“, bez lidí v zácviku nic. */
function trainText(x, prefix = ', Ø zaškolení ') { const v = trainAvg(x.trS, x.training); return v == null ? '' : `${prefix}${nf(v, 0)} %`; }
/* Rozpis dovedností v reportu kapacit (2.25): need = nutné (nepovinné sbalené do jednoho řádku),
   all = všechny, none = jen celkové skóre. */
const CAP_DETAILS = [['need', 'Celkové skóre a nutné dovednosti'], ['all', 'Celkové skóre a všechny dovednosti'], ['none', 'Jen celkové skóre']];
function capDetail(rep) { return CAP_DETAIL.includes(rep && rep.detail) ? rep.detail : 'need'; }
/* Které dovednosti skupiny mají v reportu vlastní řádek (list) a které jsou jen vyjmenované (folded). */
function capSkillRows(p, detail) {
  const all = groupSkills(p);
  if (detail === 'none') return { list: [], folded: all };
  if (detail === 'all') return { list: all, folded: [] };
  return { list: all.filter(x => !x.opt), folded: all.filter(x => x.opt) };
}
/* Nadpis oddělení v tabulce skóre: jen když nese informaci navíc (víc skupin, nebo jiný název než skupina). */
function capDeptHead(d, many) { return !!d.total || (many && d.groups.some(g => (g.p.name || '') !== d.dept)); }
/* Jen celkové skóre (2.25): jedna tabulka, skupiny pod sebou po odděleních, u oddělení s víc
   skupinami součet. Plánovaná kapacita skupin zůstává pod tabulkou (jen v aplikaci). */
function capScoreHtml(cap, weeks, noShift) {
  const depts = capScoreByDept(cap);
  const weakerTag = w => (w ? `<span class="tag warn">skupina ${w === 'S1' ? 1 : 2}</span>` : '<span class="muted">vyrovnané</span>');
  const span = 2 + 2 * weeks.length + noShift + 1;
  const many = depts.length > 1;
  // dva řádky za skupinu: zkušení pracovníci a pracovníci v zácviku; název skupiny přes oba
  const pair = (name, sub, x, weaker, cls) => `<tr class="cap-pro${cls}"><td rowspan="2"><b>${name}</b><small>${sub}</small></td><td class="cap-who">${CAP_PRO}</td>${capScoreCells(x.score || x, weeks, noShift)}<td rowspan="2" class="r">${weaker == null ? '' : weakerTag(weaker)}</td></tr>
    <tr class="cap-train${cls}"><td class="cap-who">${CAP_TR}</td>${capScoreCells(x.score || x, weeks, noShift, true)}</tr>`;
  const people = x => `${peopleCount(x.members)} · zkušení ${x.ok} · v zácviku ${x.training}${trainText(x, ' (Ø ')}${x.training ? ')' : ''}`;
  const body = depts.map(d => [
    capDeptHead(d, many) ? `<tr class="cap-dept"><td colspan="${span}">${esc(d.dept || 'Bez oddělení')}</td></tr>` : '',
    ...d.groups.map(g => pair(esc(g.p.name || '(bez názvu)'), `${people(g)}${g.opt ? ` · ${g.opt} ${g.opt === 1 ? 'nepovinná dovednost' : g.opt <= 4 ? 'nepovinné dovednosti' : 'nepovinných dovedností'} (váha ¼)` : ''}`, g, g.score.weaker, '')),
    d.total ? pair(`Celkem ${esc(d.dept)}`, people(d.total), d.total, null, ' cap-sum') : '',
  ].join('')).join('');
  const plans = cap.groups.filter(g => g.p.plan);
  return `<div class="card cap-group cap-score-card"><div class="card-head"><div><h3>Celkové skóre po skupinách</h3><p class="small muted">${CAP_PRO} = členové skupiny s procentem skupiny aspoň ${cap.thr * 25} % (průměr dovedností aspoň úroveň ${cap.thr}); ${CAP_TR.toLowerCase()} = ostatní členové skupiny. Ø = průměrné zaškolení: procento skupiny ÷ ${cap.thr * 25} %, 100 % = zkušený pracovník. Rozpis po dovednostech zapneš nahoře v Rozpisu dovedností.</p></div></div>
    <div class="table-card flat cap-wrap"><table class="cap-table"><thead><tr class="cap-weeks"><th rowspan="2">Skupina</th><th rowspan="2">Pracovníci</th>${weeks.map(w => `<th colspan="2" class="cap-wk" title="${esc(capCompo(w.v))}">${esc(w.label)}<small>ranní skupina ${w.v === 'A' ? 1 : 2}, odpolední skupina ${w.v === 'A' ? 2 : 1}</small></th>`).join('')}${noShift ? '<th rowspan="2" class="r">Bez směny</th>' : ''}<th rowspan="2" class="r">Slabší skupina</th></tr>
      <tr>${weeks.map(() => '<th class="r">Ranní</th><th class="r">Odpolední</th>').join('')}</tr></thead>
    <tbody>${body}</tbody></table></div></div>
    ${plans.length ? `<div class="card"><h3>Plánovaná kapacita</h3>${plans.map(g => `<div class="plan-in-cap"><p class="eyebrow">${esc(g.p.name)} · ${planUnit(g.p.plan, g.p.plan.v)} na osobu za směnu</p>${planHtml(g.p)}</div>`).join('')}</div>` : ''}`;
}
/* Rizika podle celkového skóre (jen celkové skóre): odpoledne bez zkušeného pracovníka skupiny. */
function capScoreRisks(cap, weeks) {
  return cap.groups.map(g => {
    if (!g.members) return null;
    const o = cap.head.O ? 'stálá odpolední + ' : '';
    const parts = weeks.filter(w => !g.score[w.v].pm).map(w => `${w.label} (odpoledne ${o}skupina ${w.v === 'A' ? 2 : 1}): žádný zkušený pracovník${g.score[w.v].pmT ? `, v zácviku ${peopleCount(g.score[w.v].pmT)}` : ''}`);
    return parts.length ? { name: g.p.name || 'Skupina', parts } : null;
  }).filter(Boolean);
}
function renderCapacity() {
  const box = $('#capView');
  const rep = S.capReport || blankCapReport();
  const all = S.positions.filter(p => isGroup(p) && groupSkills(p).length);
  const sel = rep.groups.filter(id => all.some(p => p.id === id));
  const detail = capDetail(rep);
  const cap = capacity(sel, rep.thr, detail === 'none' ? [] : rep.hidden);   // jen skóre: vyřazené dovednosti skupinu neschovají
  const hiddenSet = new Set(rep.hidden);
  const head = cap.head;
  const cw = isoWeek(todayIso()).id;
  const mg = morningGroup(cw, rep.s1am);   // kdo má tento týden ranní (střídání po týdnu)
  const controls = `<div class="card cap-controls noprint">
    <div class="row gap wrap"><b>Skupiny v reportu</b><div class="chips">${all.map(p => `<button type="button" class="chip${!sel.length || sel.includes(p.id) ? ' on' : ''}" data-capgroup="${esc(p.id)}" aria-pressed="${!sel.length || sel.includes(p.id)}">${esc(p.name || '(bez názvu)')}</button>`).join('')}</div></div>
    <div class="row gap wrap mt-s"><label class="field cap-thr"><span>Kdo se počítá jako zkušený pracovník</span><select id="capThr">${[1, 2, 3, 4].map(l => `<option value="${l}"${l === cap.thr ? ' selected' : ''}>úroveň aspoň ${l} – ${esc(STD_SCALE[l].name)}</option>`).join('')}</select></label>
      <label class="field cap-thr"><span>Rozpis dovedností</span><select id="capDetail">${CAP_DETAILS.map(([v, t]) => `<option value="${v}"${v === detail ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <label class="field cap-thr"><span>Ranní tento týden (${esc(weekName(cw))}) má</span><select id="capS1"><option value=""${mg ? '' : ' selected'}>— nenastaveno —</option><option value="S1"${mg === 'S1' ? ' selected' : ''}>Skupina 1</option><option value="S2"${mg === 'S2' ? ' selected' : ''}>Skupina 2</option></select></label>
      <span class="spacer"></span><button class="btn" type="button" id="capPdf"${cap.groups.length ? '' : ' disabled'}>Report do PDF</button><button class="btn sec" type="button" id="capPrint">Tisk</button></div>
    <p class="tiny muted">U každé skupiny je nahoře <b>celkové skóre</b>: kolik je ve skupině zkušených pracovníků a pracovníků v zácviku podle procenta skupiny (dovednosti, které nejsou nutností, mají v procentu čtvrtinovou váhu). Pod ním rozpis po dovednostech podle volby výš. Dovednost odškrtnutím v tabulce z reportu vyřadíš. Výběr, práh i závěr se ukládají, report tak jde kdykoli upravit a znovu vytisknout.</p>
  </div>`;
  const tiles = `<div class="stats">${[
    statTile('Stálá ranní', String(head.R), 'vždy ranní směna'),
    statTile('Stálá odpolední', String(head.O), 'vždy odpolední směna'),
    statTile('Směnnost – skupina 1', String(head.S1), 'střídá ranní a odpolední'),
    statTile('Směnnost – skupina 2', String(head.S2), 'střídá ranní a odpolední'),
    statTile('Bez směny', String(head['']), head[''] ? 'doplň směnu v části Lidé' : 'všichni mají směnu', head[''] ? 'warn' : ''),
    ...(cap.sick ? [statTile('Nemoc', String(cap.sick), 'dočasně se nepočítají', 'warn')] : []),
  ].join('')}</div>`;
  if (!cap.groups.length) return void (box.innerHTML = `${controls}${tiles}<div class="card">${emptyState('Žádné dovednosti', 'Report kapacit potřebuje skupiny s dovednostmi a hodnocení lidí.')}</div>${capHistHtml()}`);
  const weeks = capWeeks(rep);
  const risks = detail === 'none' ? capScoreRisks(cap, weeks) : capRisks(cap, weeks);
  const noShift = head[''] > 0;
  const span = 2 * weeks.length + 1 + noShift;
  const weakerTag = w => (w ? `<span class="tag warn">skupina ${w === 'S1' ? 1 : 2}</span>` : '<span class="muted">vyrovnané</span>');
  const groupsHtml = detail === 'none' ? capScoreHtml(cap, weeks, noShift) : cap.groups.map(g => {
    const sc = g.score;
    const scoreRow = `<tr class="cap-score"><td><b>${CAP_PRO}</b><small>celkové skóre: procento skupiny aspoň ${cap.thr * 25} %</small></td>${capScoreCells(sc, weeks, noShift)}<td class="r">${weakerTag(sc.weaker)}</td></tr>
      <tr class="cap-train cap-train-end"><td><b>${CAP_TR}</b><small>ostatní členové skupiny${trainText(g, ' · Ø zaškolení ')}</small></td>${capScoreCells(sc, weeks, noShift, true)}<td></td></tr>`;
    const { list, folded } = capSkillRows(g.p, detail);
    const rows = list.map(x => {
      const off = hiddenSet.has(x.id);
      const r = g.skills.find(y => y.s.id === x.id);
      if (off || !r) return `<tr class="cap-off"><td><label class="cap-tog"><input type="checkbox" data-capskill="${esc(x.id)}"> <span>${esc(x.name)}</span></label>${optTag(x, true)}</td><td colspan="${span}" class="muted small">vyřazeno z reportu</td></tr>`;
      const weaker = r.by.S1.n === r.by.S2.n ? (r.by.S1.sum === r.by.S2.sum ? '' : r.by.S1.sum < r.by.S2.sum ? 'S1' : 'S2') : r.by.S1.n < r.by.S2.n ? 'S1' : 'S2';
      return `<tr${r.opt ? ' class="cap-opt"' : ''}><td><label class="cap-tog"><input type="checkbox" data-capskill="${esc(x.id)}" checked> <span>${esc(x.name)}</span></label>${optTag(x, true)}</td>
        ${weeks.map(w => capCell(r[w.v].am, !r.opt, r[w.v].amT) + capCell(r[w.v].pm, !r.opt, r[w.v].pmT)).join('')}${noShift ? capCell(r.by[''].n, false, r.by[''].tr) : ''}
        <td class="r">${weakerTag(weaker)}</td></tr>`;
    }).join('');
    const foldRow = folded.length ? `<tr class="cap-fold"><td colspan="${span + 1}"><b>${detail === 'none' ? 'Dovednosti' : 'Nepovinné dovednosti'} (${folded.length}):</b> ${folded.map(x => esc(x.name)).join(', ')} · ${detail === 'none' ? 'rozpis je vypnutý, počítají se v celkovém skóre' : 'nejsou nutností, počítají se jen v celkovém skóre (váha ¼)'}</td></tr>` : '';
    const pct = k => (g.bySh[k].n ? `${nf(g.bySh[k].pct, 0)} % (${g.bySh[k].n})` : '—');
    return `<div class="card cap-group"><div class="card-head"><div><h3>${esc(g.p.name)}</h3><p class="small muted">Ve skupině: ${peopleCount(g.members)}${g.members ? ` (zkušení ${g.ok}, v zácviku ${g.training}${trainText(g)})` : ''} · průměr dovedností podle směn: stálá ranní ${pct('R')}${g.bySh.O.n ? `, stálá odpolední ${pct('O')}` : ''}, skupina 1 ${pct('S1')}, skupina 2 ${pct('S2')}${g.bySh[''].n ? `, bez směny ${pct('')}` : ''}</p></div></div>
      ${g.p.plan ? `<div class="plan-in-cap"><p class="eyebrow">Plánovaná kapacita · ${planUnit(g.p.plan, g.p.plan.v)} na osobu za směnu</p>${planHtml(g.p)}</div>` : ''}
      <div class="table-card flat cap-wrap"><table class="cap-table"><thead><tr class="cap-weeks"><th rowspan="2">Dovednost</th>${weeks.map(w => `<th colspan="2" class="cap-wk" title="${esc(capCompo(w.v))}">${esc(w.label)}<small>ranní skupina ${w.v === 'A' ? 1 : 2}, odpolední skupina ${w.v === 'A' ? 2 : 1}</small></th>`).join('')}${noShift ? '<th rowspan="2" class="r">Bez směny</th>' : ''}<th rowspan="2" class="r">Slabší skupina</th></tr>
        <tr>${weeks.map(() => '<th class="r">Ranní</th><th class="r">Odpolední</th>').join('')}</tr></thead>
      <tbody>${scoreRow}${rows}${foldRow}</tbody></table></div></div>`;
  }).join('');
  box.innerHTML = `${controls}${tiles}
    <div class="note i"><b>Jak číst report:</b> celkové skóre skupiny jsou dva řádky. <b>${CAP_PRO}</b> jsou členové skupiny, kteří mají procento skupiny aspoň ${cap.thr * 25} % (průměr dovedností aspoň úroveň ${cap.thr}; dovednosti, které nejsou nutností, mají v procentu čtvrtinovou váhu). <b>${CAP_TR}</b> jsou ostatní členové skupiny; <b>Ø</b> u nich je průměrné zaškolení: procento skupiny ÷ ${cap.thr * 25} %, takže 100 % znamená úroveň zkušeného pracovníka. Pod nimi jsou počty lidí, kteří jednotlivou dovednost zvládají aspoň na úrovni ${cap.thr} (${esc(STD_SCALE[cap.thr].name.toLowerCase())}); pod čísly zvlášť <b>v zácviku</b>: členové skupiny, kteří úrovně ještě nedosáhli, a lidé z jiných skupin, kteří dovednost mají ohodnocenou, ale pod touto úrovní. Do zkušených se nepočítají. V plánované kapacitě se počítají zkušení pracovníci skupiny. Stálá ranní je vždy ráno, stálá odpolední vždy odpoledne, skupiny 1 a 2 se střídají po týdnu. ${weeks.map(w => `<b>${esc(w.label)}</b>: ${esc(capCompo(w.v))}.`).join(' ')}${rep.s1am ? '' : ' Nastav nahoře, která skupina má tento týden ranní, a report ukáže konkrétní týdny.'}</div>
    ${risks.length ? `<div class="note e"><b>Odpoledne bez zkušeného pracovníka:</b><ul class="cap-risks">${risks.map(r => `<li><b>${esc(r.name)}</b> · ${r.parts.map(esc).join(' · ')}</li>`).join('')}</ul></div>` : `<div class="note i">${detail === 'none' ? 'Na každé odpolední směně je v každé skupině aspoň jeden zkušený pracovník.' : 'Na každé odpolední směně je u každé dovednosti aspoň jeden zkušený pracovník.'}</div>`}
    ${groupsHtml}
    <div class="card"><h3>Závěr a opatření</h3><p class="small muted">Text se uloží a vytiskne s reportem (např. koho zaučit a do kdy).</p>
      <textarea id="capNote" rows="4" maxlength="4000" placeholder="např. Zaučit 2 lidi ze skupiny 2 na Seřízení stroje do konce měsíce.">${esc(rep.note)}</textarea></div>
    ${capHistHtml()}`;
}
/* Plán a skutečnost podle docházky (2.24, přepočet 2.24.2): týden zpětně, souhrn po skupinách, rozpis v Excelu.
   Do PDF ani tisku reportu kapacit nepatří (noprint). */
function capHistHtml() {
  const weeks = attWeeks();
  const title = '<p class="eyebrow">Historie obsazenosti</p><h3>Plán a skutečnost podle docházky</h3>';
  if (!weeks.length) return `<div class="card cap-hist noprint">${title}${emptyState('Zatím bez docházky', 'Nahraj docházku v části Docházka a tady porovnáš plán ze zařazení se skutečností.')}</div>`;
  if (!weeks.includes(ui.capHist)) ui.capHist = weeks[0];
  const x = planReality(ui.capHist);
  const dl = iso => { const d = x.days.find(y => y.iso === iso); return `${DOW[d.dow]} ${d.d}. ${d.m}.`; };
  const pct = (a, b) => (b > 0 ? `${nf(a / b * 100, 0)} %` : '—');
  const h = v => nf(v, 1);
  const out = x.total.extraH > 0;   // sloupec Mimo plán jen, když někdo mimo plán pracoval
  const hrs = (p, cls = '') => `<td class="r num${cls}">${p.planN ? h(p.planH) : '—'}</td><td class="r num">${p.planN ? h(p.realH) : '—'}</td><td class="r num">${pct(p.realH, p.planH)}</td>`;
  const row = (name, dept, t, cls = '') => `<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${esc(name)}${dept && dept !== name ? `<small>${esc(dept)}</small>` : ''}</th>
    <td class="r num">${t.planN}</td><td class="r num">${t.present}</td><td class="r num">${t.excused}</td><td class="r num${t.miss ? ' cap-miss' : ''}">${t.miss}</td>
    ${hrs(t, ' cap-grp')}${hrs(t.ok, ' cap-grp')}${hrs(t.tr, ' cap-grp')}${out ? `<td class="r num cap-grp">${t.extraH ? h(t.extraH) : '—'}</td>` : ''}</tr>`;
  return `<div class="card cap-hist noprint">
    <div class="card-head"><div>${title}
      <p class="small muted">Vyber týden zpětně. V plánu je každý, kdo byl v tom týdnu zařazený do skupiny (směna určuje ranní a odpolední${x.mg ? `; ranní měla skupina ${x.mg === 'S1' ? 1 : 2}` : '; střídání skupin 1 a 2 není nastavené'}), skutečnost je z nahrané docházky. Lidé se párují podle jména.</p></div></div>
    <div class="row gap wrap"><label class="field cap-thr"><span>Týden</span><select id="capHistWeek">${weeks.map(id => `<option value="${id}"${id === x.id ? ' selected' : ''}>${esc(weekLong(id))}</option>`).join('')}</select></label>
      <span class="spacer"></span><button class="btn" type="button" id="capHistXlsx">Export do Excelu</button></div>
    ${x.holidays.length ? `<p class="small muted">Svátek v tomto týdnu: ${x.holidays.map(d => `${esc(dayText(d.iso, false))} (${esc(d.name)})`).join(', ')}; nepočítá se.</p>` : ''}
    ${x.missing.length ? `<p class="small warn-t">Docházka chybí pro ${x.missing.map(dl).join(', ')}; tyto dny se neporovnávají.</p>` : ''}
    <div class="table-card flat cap-wrap"><table class="cap-table cap-hist-tab"><thead>
      <tr class="cap-weeks"><th rowspan="2">Skupina</th><th colspan="4" class="cap-wk">Lidé v plánu</th><th colspan="3" class="cap-wk">Hodiny celkem</th><th colspan="3" class="cap-wk">${CAP_PRO}</th><th colspan="3" class="cap-wk">${CAP_TR}</th>${out ? '<th rowspan="2" class="r cap-grp">Mimo plán h</th>' : ''}</tr>
      <tr><th class="r">Lidodny</th><th class="r">Přišlo</th><th class="r">Omluveno</th><th class="r">Chybí</th>${['', '', ''].map(() => '<th class="r cap-grp">Plán h</th><th class="r">Odprac. h</th><th class="r">Plnění</th>').join('')}</tr></thead>
    <tbody>${x.groups.map(g => row(g.name, g.dept, g.week, g.pos ? '' : 'cap-out')).join('')}${row('Celkem', '', x.total, 'cap-sum')}</tbody></table></div>
    <p class="tiny muted">Počítají se jen pracovní dny, víkendy a svátky ani s odpracovanými hodinami ne. Lidodny = lidé × pracovní dny v plánu. Odpracované jsou jen hodiny ze dnů v práci: den s kódem nepřítomnosti (dovolená, nemoc, neomluveno…) se nepočítá, ani když má u kódu hodiny. Odpracováno a plnění jsou jen za lidi v plánu; hodiny lidí mimo plán (bez skupiny, vedoucí, jména, která v Lidech nejsou) jsou zvlášť. Plnění = odpracováno ÷ plán (dovolená a nemoc ho snižují); omluvené hodiny a plnění bez nich jsou v Excelu. Zkušený pracovník = průměr dovedností skupiny aspoň úroveň ${x.thr} (podle dnešního hodnocení), ostatní jsou pracovníci v zácviku. V Excelu je souhrn, rozpis po dnech a po lidech, kolik kdo odpracoval${x.unpaired ? `; ${x.unpaired === 1 ? '1 jméno se nepodařilo spárovat' : `${x.unpaired} jmen se nepodařilo spárovat`} (sloupec Poznámka)` : ''}.</p>
  </div>`;
}
async function exportPlanReality(button) {
  const id = ui.capHist || attWeeks()[0];
  if (!id) return;
  if (button) button.disabled = true;
  try {
    const X = await xlsx();
    const wb = X.utils.book_new();
    planRealitySheets(id).forEach(sheet => {
      const ws = X.utils.aoa_to_sheet(sheet.rows.map(row => row.map(safeCell)));
      ws['!cols'] = sheet.cols.map(wch => ({ wch }));
      X.utils.book_append_sheet(wb, ws, sheet.name);
    });
    downloadFile(`plan-a-skutecnost-${id}.xlsx`, new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch (error) { toast(`Export se nepovedl: ${error.message}`, true); }
  finally { if (button) button.disabled = false; }
}
/* Rizika po skupinách: dovednosti, na které odpoledne v daném týdnu (variantě) nikdo nestačí. */
function capRisks(cap, weeks) {
  return cap.groups.map(g => {
    const o = cap.head.O ? 'stálá odpolední + ' : '';
    const parts = weeks.map(w => {
      const gaps = g.skills.filter(r => !r[w.v].pm && !r.opt);   // nepovinná dovednost riziko není (2.25)
      if (!gaps.length) return '';
      // různí pracovníci v zácviku na odpolední směně (jeden člověk se učí víc dovedností)
      const pmShifts = ['O', w.v === 'A' ? 'S2' : 'S1'];
      const tr = new Set(gaps.flatMap(r => pmShifts.flatMap(k => r.by[k].trK))).size;
      const all = gaps.length > 1 && gaps.length === g.skills.length;
      return `${w.label} (odpoledne ${o}skupina ${w.v === 'A' ? 2 : 1}): ${all ? `všechny dovednosti (${gaps.length})${tr ? `, v zácviku ${peopleCount(tr)}` : ''}` : gaps.map(r => `${r.s.name}${r[w.v].pmT ? ` (v zácviku ${r[w.v].pmT})` : ''}`).join(', ')}`;
    }).filter(Boolean);
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
  const detail = capDetail(rep);
  const cap = capacity(rep.groups, rep.thr, detail === 'none' ? [] : rep.hidden);   // jen skóre: vyřazené dovednosti skupinu neschovají
  const weeks = capWeeks(rep);
  k.header({ eyebrow: `${EXPORT_NAME} · MATICE DOVEDNOSTÍ`, right: `Stav k ${dayText(todayIso())}`, title: 'Kapacita dovedností podle směn',
    sub: `Zkušený pracovník = úroveň aspoň ${cap.thr} (${STD_SCALE[cap.thr].name.toLowerCase()}); pracovníci v zácviku zvlášť`,
    meta: `Celkové skóre skupiny: ${CAP_PRO.toLowerCase()} = členové skupiny s průměrem dovedností aspoň na této úrovni (dovednosti, které nejsou nutností, mají v průměru čtvrtinovou váhu), ${CAP_TR.toLowerCase()} = ostatní členové skupiny; Ø u nich je průměrné zaškolení (procento skupiny ÷ ${cap.thr * 25} %, 100 % = zkušený pracovník).${detail === 'none' ? '' : ' Pod nimi počty lidí, kteří jednotlivou dovednost zvládají; pod čísly zvlášť lidé v zácviku (pod touto úrovní), do zkušených se nepočítají.'} Stálá ranní je vždy ráno, stálá odpolední vždy odpoledne, skupiny 1 a 2 se střídají po týdnu. ${weeks.map(w => `${w.label}: ${capCompo(w.v)}.`).join(' ')}` });
  const noShift = cap.head[''] > 0;
  const hasO = cap.head.O > 0;
  k.tiles([['Stálá ranní', String(cap.head.R), 'lidí'], ...(hasO ? [['Stálá odpolední', String(cap.head.O), 'lidí']] : []), ['Skupina 1', String(cap.head.S1), 'lidí'], ['Skupina 2', String(cap.head.S2), 'lidí'], ['Bez směny', String(cap.head['']), 'lidí', cap.head[''] ? 'crit' : ''], ...(cap.sick ? [['Nemoc', String(cap.sick), 'nepočítají se', 'crit']] : [])]);
  const cols = [[70 - (noShift ? 14 : 0), detail === 'none' ? 'Skupina' : 'Dovednost'], ...weeks.flatMap(w => [[22, `${w.short} ranní`, 'r'], [24, `${w.short} odpolední`, 'r']]), ...(noShift ? [[14, 'Bez směny', 'r']] : []), [17, 'Slabší', 'r']];
  const head = () => { let x = k.M; cols.forEach(([w, t, al]) => { k.text(t, al === 'r' ? x + w - 1.5 : x, k.y, 7, { bold: true, color: k.C.ink2, align: al === 'r' ? 'right' : 'left' }); x += w; }); k.y += 4.4; k.hline(k.y, k.C.line2, 0.3); k.y += 1; };
  // řádek tabulky: název (a pod ním drobně), buňky [počet, riziko, v zácviku], slabší skupina;
  // reHead = na nové stránce znovu záhlaví (dlouhá tabulka jen se skóre)
  const line = (name, sub, cells, weaker, strong, reHead) => {
    const nm = k.split(name, cols[0][0] - 2, 8.6, strong);
    const subL = sub ? k.split(sub, cols[0][0] - 2, 6.6) : [];
    const anyTr = cells.some(c => c[2]);
    const h = Math.max(nm.length * k.LH(8.6, 1.25) + subL.length * k.LH(6.6, 1.2), anyTr ? k.LH(8.6, 1.25) + k.LH(6.6, 1.2) : 0) + 2.2;
    if (k.need(h) && reHead) head();
    if (strong) k.box(k.C.soft, k.M, k.y - 0.6, k.CW, h - 0.2);
    let x = k.M;
    nm.forEach((t, i) => k.text(t, x, k.y + 0.4 + i * k.LH(8.6, 1.25), 8.6, { bold: !!strong }));
    subL.forEach((t, i) => k.text(t, x, k.y + 0.4 + nm.length * k.LH(8.6, 1.25) + i * k.LH(6.6, 1.2), 6.6, { color: k.C.ink2 }));
    x += cols[0][0];
    [...cells, [weaker == null ? '' : weaker ? `sk. ${weaker === 'S1' ? 1 : 2}` : '—']].forEach(([v, bad, tr], i) => {
      const w = cols[i + 1][0];
      k.text(v, x + w - 1.5, k.y + 0.4, 8.6, { align: 'right', bold: !!bad || !!strong, color: bad ? k.C.crit : k.C.ink });
      if (tr) k.text(typeof tr === 'string' ? tr : `v zácviku ${tr}`, x + w - 1.5, k.y + 0.4 + k.LH(8.6, 1.25), 6.6, { align: 'right', color: k.C.ink2 });
      x += w;
    });
    k.y += h;
    k.hline(k.y - 0.8);
  };
  // celkové skóre: zkušení pracovníci (červeně, když nikdo) a zvlášť pracovníci v zácviku
  const scoreCells = sc => [...weeks.flatMap(w => [[String(sc[w.v].am), !sc[w.v].am], [String(sc[w.v].pm), !sc[w.v].pm]]), ...(noShift ? [[String(sc.none.n), false]] : [])];
  // pracovníci v zácviku: pod počtem průměr zaškolení (2.25.2, 100 % = úroveň zkušeného pracovníka)
  const trainCells = sc => [...weeks.flatMap(w => [[String(sc[w.v].amT), false, trainNote(sc[w.v].amTs, sc[w.v].amT)], [String(sc[w.v].pmT), false, trainNote(sc[w.v].pmTs, sc[w.v].pmT)]]), ...(noShift ? [[String(sc.none.tr), false, trainNote(sc.none.trS, sc.none.tr)]] : [])];
  const whoText = x => `${peopleCount(x.members)} · zkušení ${x.ok} · v zácviku ${x.training}${trainText(x, ' (Ø zaškolení ')}${x.training ? ')' : ''}`;
  // upozornění „Odpoledne bez zkušeného pracovníka“ (dřív „bez schopného člověka“) do PDF nepatří (2.23, přání uživatele), jen do aplikace;
  // stejně tak plánovaná kapacita skupiny
  if (detail === 'none') {
    // jen celkové skóre (2.25): jedna tabulka, skupiny po odděleních, u oddělení s víc skupinami součet
    const depts = capScoreByDept(cap), many = depts.length > 1;
    k.keep(() => {
      k.heading('Celkové skóre po skupinách', 11.5);
      k.text(`${CAP_PRO}: procento skupiny aspoň ${cap.thr * 25} %; ${CAP_TR.toLowerCase()}: ostatní členové skupiny, Ø = průměrné zaškolení (100 % = zkušený pracovník).`, k.M, k.y - 1, 8, { color: k.C.ink2 });
      k.y += 5;
      head();
      depts.forEach(d => {
        if (capDeptHead(d, many)) {
          if (k.need(6 + 9)) head();
          k.text((d.dept || 'Bez oddělení').toUpperCase(), k.M, k.y + 2.6, 7, { bold: true, color: k.C.ink2 });
          k.y += 5.4;
        }
        d.groups.forEach(g => {
          if (k.need(14)) head();   // oba řádky skupiny na stejné straně
          line(`${g.p.name || 'Skupina'} – ${CAP_PRO.toLowerCase()}`, `${whoText(g)}${g.opt ? ` · nepovinné dovednosti ${g.opt} (váha ¼)` : ''}`, scoreCells(g.score), g.score.weaker, true, true);
          line(CAP_TR, '', trainCells(g.score), null, false, true);
        });
        if (d.total) {
          if (k.need(14)) head();
          line(`Celkem ${d.dept} – ${CAP_PRO.toLowerCase()}`, whoText(d.total), scoreCells(d.total), null, true, true);
          line(CAP_TR, '', trainCells(d.total), null, false, true);
        }
      });
      k.y += 5;
    }, 40);
  } else cap.groups.forEach(g => {
    k.keep(() => {
      k.heading(g.p.name || 'Skupina', 11.5);
      const pr = s => (g.bySh[s].n ? `${nf(g.bySh[s].pct, 0)} %` : '—');
      k.text(`Ve skupině: ${peopleCount(g.members)}${g.members ? ` (zkušení ${g.ok}, v zácviku ${g.training}${trainText(g)})` : ''} · průměr dovedností: stálá ranní ${pr('R')}${g.bySh.O.n ? `, stálá odpolední ${pr('O')}` : ''}, skupina 1 ${pr('S1')}, skupina 2 ${pr('S2')}`, k.M, k.y - 1, 8, { color: k.C.ink2 });
      k.y += 5;
      head();
      line(CAP_PRO, `celkové skóre: procento skupiny aspoň ${cap.thr * 25} %`, scoreCells(g.score), g.score.weaker, true);
      line(CAP_TR, `ostatní členové skupiny${trainText(g, ' · Ø zaškolení ')}`, trainCells(g.score), null, false);
      const { list, folded } = capSkillRows(g.p, detail);
      list.forEach(x => {
        const r = g.skills.find(y => y.s.id === x.id);
        if (!r) return;   // vyřazená z reportu
        const weaker = r.by.S1.n === r.by.S2.n ? (r.by.S1.sum === r.by.S2.sum ? '' : r.by.S1.sum < r.by.S2.sum ? 'S1' : 'S2') : r.by.S1.n < r.by.S2.n ? 'S1' : 'S2';
        line(r.s.name, r.opt ? 'není nutností' : '', [...weeks.flatMap(w => [[String(r[w.v].am), !r.opt && !r[w.v].am, r[w.v].amT], [String(r[w.v].pm), !r.opt && !r[w.v].pm, r[w.v].pmT]]), ...(noShift ? [[String(r.by[''].n), false, r.by[''].tr]] : [])], weaker);
      });
      if (folded.length) {
        const txt = `Nepovinné dovednosti (${folded.length}): ${folded.map(x => x.name).join(', ')} · nejsou nutností, počítají se jen v celkovém skóre (váha ¼)`;
        const ls = k.split(txt, k.CW, 7.6);
        k.need(ls.length * k.LH(7.6, 1.25) + 2);
        ls.forEach((t, i) => k.text(t, k.M, k.y + 0.6 + i * k.LH(7.6, 1.25), 7.6, { color: k.C.ink2 }));
        k.y += ls.length * k.LH(7.6, 1.25) + 2;
      }
      k.y += 5;
    }, 40);
  });
  if (rep.note) { k.keep(() => { k.heading('Závěr a opatření', 11.5); k.para(rep.note, k.M, k.CW, 9.4); k.y += 4; }, 25); }
  k.need(26);
  k.signoff();
  k.footer(`${EXPORT_NAME} · kapacita dovedností podle směn · ${dayText(todayIso())}`);
}
async function exportCapacityPdf(button) {
  await withPdf(button, doc => {
    doc.setProperties({ title: 'Kapacita dovedností podle směn', creator: EXPORT_NAME });
    drawCapacity(doc);
    downloadFile(`kapacita-smen-${todayIso()}.pdf`, doc.output('blob'), 'application/pdf');
  });
}

/* ---------- PDF matice (2.20): lidé jen jako ID z evidence práce, bez jmen ---------- */
/** Symbol úrovně 0–4 do PDF (čtvrtinový kruh jako v matici). */
function pdfIluo(k, cx, cy, r, n, color) {
  if (k.dry) return;
  const doc = k.doc;
  doc.setLineWidth(0.25);
  doc.setDrawColor(...(n ? color : k.C.line2));
  if (n >= 4) { doc.setFillColor(...color); doc.circle(cx, cy, r, 'FD'); return; }
  if (n > 0) {
    const pts = [[cx, cy]];
    const steps = n * 8;
    for (let i = 0; i <= steps; i += 1) { const a = (i / steps) * n * Math.PI / 2; pts.push([cx + r * Math.sin(a), cy - r * Math.cos(a)]); }
    doc.setFillColor(...color);
    doc.lines(pts.slice(1).map((pt, i) => [pt[0] - pts[i][0], pt[1] - pts[i][1]]), cx, cy, [1, 1], 'F', true);
  }
  doc.circle(cx, cy, r, 'S');
}
/** Matice podle filtru v záložce Matice (oddělení nebo skupina, směna). Vrací počet lidí bez ID.
    withBen (2.25.2): navíc benefity za hodnocené období (tabáky za dovednosti, tabáky celkem, Kafe,
    prémie) u lidí ve vlastní skupině; bez něj čistě hodnoticí matice dovedností. */
function drawMatrix(doc, withBen) {
  const k = pdfKit(doc);
  const C = k.C;
  const groups = S.positions.filter(p => isGroup(p) && groupSkills(p).length);
  const f = mxFilter(groups);
  const shift = ['*', ...SHIFT_ORDER].includes(P.matrixShift) ? P.matrixShift : '*';
  const deps = f.group ? [deptOf(f.group)] : f.dept ? [f.dept] : [...new Set(groups.map(deptOf))];
  const secs = deps.map(d => ({ d, m: f.group ? skillGrid(f.group.id, shift, null, true) : skillGrid(null, shift, d, true) })).filter(x => x.m.rows.length);
  const people = new Map();
  secs.forEach(x => x.m.rows.forEach(r => people.set(r.e.key, r.e)));
  const home = secs.flatMap(x => x.m.rows.filter(r => r.home).map(r => r.e));
  const sick = home.filter(e => e.sick).length;
  const noId = [...people.values()].filter(e => !e.wid).length;
  const nSkills = secs.reduce((a, x) => a + x.m.cols.length, 0);
  const weak = secs.reduce((a, x) => a + x.m.coverage.filter(c => c.ready < 2 && !c.opt).length, 0);
  const scope = f.group ? `Skupina ${f.group.name || '(bez názvu)'}${deptOf(f.group) !== f.group.name ? ` (${deptOf(f.group)})` : ''}` : f.dept ? `Oddělení ${f.dept}` : 'Všechna oddělení';
  // benefity za hodnocené období (jen varianta s benefity)
  const ben = withBen ? new Map(allRows().map(r => [r.e.key, r])) : null;
  const per = withBen ? periodName(curPeriod()) : '';
  const homeBen = withBen ? [...new Map(home.map(e => [e.key, ben.get(e.key)])).values()].filter(Boolean) : [];
  k.header({ eyebrow: `${EXPORT_NAME} · MATICE DOVEDNOSTÍ`, right: `Stav k ${dayText(todayIso())}`, title: withBen ? 'Matice dovedností a benefity' : 'Matice dovedností',
    sub: `${scope} · ${shift === '*' ? 'všechny směny' : shiftName(shift).toLowerCase()}${withBen ? ` · benefity za ${per}` : ''}`,
    meta: `Zaměstnanci jsou uvedení jen číslem z evidence práce (ID), bez jmen. Vyřazení lidé a vedoucí pracovníci v reportu nejsou. Lidé v nemoci jsou označení, do počtů úrovní a kapacity se dočasně nepočítají. Úroveň 0–4, každá úroveň je 25 % dovednosti.${withBen ? ` Benefity za ${per} jen u lidí ve vlastní skupině: Tab. dov. = tabáky za dovednosti (maximum skupiny × procento), Tab. celk. = tabáky po docházce, sankcích a ručních úpravách, Kafe, Prémie = splněná varianta prémie (navýšení mzdy).` : ''}` });
  k.tiles([['Lidé v matici', String(home.length), 'bez zaučených odjinud'], ['Nemoc', String(sick), sick ? 'jen pro přehled, nepočítají se' : 'nikdo', sick ? 'crit' : ''],
    ['Dovednosti', String(nSkills), `${secs.length} oddělení`],
    ['Slabé dovednosti', String(weak), 'úroveň 3–4 má méně než 2 lidi', weak ? 'crit' : 'good'],
    ...(noId ? [['Bez ID', String(noId), 'doplň ID v části Lidé', 'crit']] : []),
    ...(withBen ? [[`Tabáky celkem · ${per}`, String(homeBen.reduce((a, r) => a + (r.kafeOnly ? 0 : r.total), 0)), `Kafe ${homeBen.filter(r => r.kafe).length} · prémie ${homeBen.filter(r => r.tier && r.tier.name).length} lidí`]] : [])]);
  if (!secs.length) { k.para('Ve vybraném oddělení a směně nikdo není.', k.M, k.CW, 10, { color: C.ink2 }); }
  const ID_W = 34, GRP_W = 40, PCT_W = 12, FIX = ID_W + GRP_W + PCT_W, RH = 5.6, HEAD = 36, GH = 5;
  // sloupce benefitů mezi % a dovednostmi: [nadpis, šířka, zarovnání]
  const BEN = withBen ? [['Tab. dov.', 13, 'r'], ['Tab. celk.', 14, 'r'], ['Kafe', 10, 'c'], ['Prémie', 28, 'l']] : [];
  const SK0 = FIX + BEN.reduce((a, c) => a + c[1], 0) + (withBen ? 2 : 0);   // začátek sloupců dovedností
  const benX = i => k.M + FIX + 2 + BEN.slice(0, i).reduce((a, c) => a + c[1], 0);
  const maxCols = Math.max(1, Math.floor((k.CW - SK0) / 7));
  secs.forEach(({ d, m }) => {
    const leads = leadPeople().length ? leadsOf(d) : null;
    const homeRows = m.rows.filter(r => r.home);
    const pcts = homeRows.map(r => r.pct).filter(v => v != null);
    const avg = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
    const secWeak = m.coverage.filter(c => c.ready < 2 && !c.opt).length;
    const info = [`${peopleCount(homeRows.length)}${m.sick ? ` (v nemoci ${m.sick})` : ''}`, m.rows.length - homeRows.length ? `+${m.rows.length - homeRows.length} zaučení odjinud` : '',
      `průměr dovedností ${avg != null ? `${nf(avg, 0)} %` : '—'}`, `${secWeak} z ${m.cols.length} ${m.cols.length === 1 ? 'dovednosti' : 'dovedností'} má na úrovni 3–4 méně než 2 lidi`,
      ...(withBen ? (() => { const b = homeRows.map(r => ben.get(r.e.key)).filter(Boolean);
        return [`tabáky celkem ${b.reduce((a, r) => a + (r.kafeOnly ? 0 : r.total), 0)}, Kafe ${b.filter(r => r.kafe).length}, prémie ${b.filter(r => r.tier && r.tier.name).length}`]; })() : [])].filter(Boolean).join(' · ');
    const chunks = [];
    for (let i = 0; i < m.cols.length; i += maxCols) chunks.push(i);
    chunks.forEach((start, ci) => {
      const cols = m.cols.slice(start, start + maxCols);
      const idx = cols.map((_, j) => start + j);
      const cw = Math.min(12, (k.CW - SK0) / cols.length);
      const multi = new Set(cols.map(c => c.p.id)).size > 1 || m.groups.length > 1;
      // výška hlavičky podle nejdelšího názvu dovednosti (svisle), nejvýš HEAD; delší název do dvou řádků
      const colName = c => (c.s.opt ? `${c.s.name} *` : c.s.name);   // * = není nutností (2.25)
      const hh = clamp(Math.max(...cols.map(c => k.width(colName(c), 7))) + 3, 14, HEAD);
      const label = name => {
        if (k.width(name, 7) <= hh - 3) return { size: 7, lines: [name] };
        const all = k.split(name, hh - 3, 6.4);
        const lines = all.slice(0, 2);
        if (all.length > 2) { let t = lines[1]; while (t.length > 1 && k.width(`${t}…`, 6.4) > hh - 3) t = t.slice(0, -1); lines[1] = `${t.trimEnd()}…`; }
        return { size: 6.4, lines };
      };
      const headH = hh + (multi ? GH : 0);
      const drawHead = () => {
        const top = k.y;
        if (multi) {
          let x = k.M + SK0;
          const spans = [];
          cols.forEach(c => { const last = spans[spans.length - 1]; if (last && last.p === c.p) last.n += 1; else spans.push({ p: c.p, n: 1 }); });
          spans.forEach(g => {
            const w = g.n * cw;
            k.box(C.soft, x + 0.3, top, w - 0.6, GH - 0.8, 1);
            k.mid(k.split(g.p.name || '', w - 2, 6.8, true)[0], x + w / 2, top + (GH - 0.8) / 2, 6.8, { bold: true, color: C.ink2, align: 'center' });
            x += w;
          });
        }
        const base = top + headH - 1.2;
        k.text('ID zaměstnance', k.M, base - k.mm(7.4) * 1.1, 7.4, { bold: true, color: C.ink2 });
        k.text('Skupina', k.M + ID_W, base - k.mm(7.4) * 1.1, 7.4, { bold: true, color: C.ink2 });
        k.text('%', k.M + FIX - 1.5, base - k.mm(7.4) * 1.1, 7.4, { bold: true, color: C.ink2, align: 'right' });
        BEN.forEach(([t, w, al], i) => k.text(t, al === 'r' ? benX(i) + w - 1.5 : al === 'c' ? benX(i) + w / 2 : benX(i) + 1, base - k.mm(7.4) * 1.1, 7.4, { bold: true, color: C.ink2, align: al === 'r' ? 'right' : al === 'c' ? 'center' : 'left' }));
        if (!k.dry) {
          cols.forEach((c, j) => {
            const { size, lines } = label(colName(c));
            const cx = k.M + SK0 + j * cw + cw / 2 + k.mm(size) * 0.35;
            const lh = k.mm(size) * 1.15;
            k.font(size, false, C.ink);
            // svislý text: první řádek vlevo, druhý vpravo
            lines.forEach((t, li) => doc.text(t, cx + (li - (lines.length - 1) / 2) * lh, base, { angle: 90 }));
          });
        }
        k.y = top + headH;
        k.hline(k.y, C.line2, 0.3);
        k.y += 0.6;
      };
      const row = (label, vals, o = {}) => {
        if (k.need(RH)) drawHead();
        if (o.bg) k.box(o.bg, k.M, k.y, k.CW, RH);
        k.mid(label, k.M + 1, k.y + RH / 2, 7.4, { bold: true, color: C.ink2 });
        vals.forEach((v, j) => { const bad = !!o.risk && o.risk(v, j); k.mid(String(v), k.M + SK0 + j * cw + cw / 2, k.y + RH / 2, 7.6, { align: 'center', bold: bad, color: bad ? C.crit : C.ink }); });
        k.y += RH;
        k.hline(k.y, C.line, 0.15);
      };
      // nadpis oddělení s hlavičkou tabulky a aspoň třemi řádky na stejné straně
      const need = k.mm(12.5) * 1.25 + 2.4 + (ci ? 0 : 2 * k.LH(8.4, 1.3) + 2) + headH + 3 * RH;
      if (k.y + need > k.BOTTOM) k.newPage();
      k.heading(`${d}${chunks.length > 1 ? ` · dovednosti ${start + 1}–${start + cols.length} z ${m.cols.length}` : ''}`, 12.5);
      if (!ci) {
        const sub = [`${m.groups.length > 1 ? 'Skupiny' : 'Skupina'} ${m.groups.map(p => p.name || '(bez názvu)').join(', ')}`,
          leads ? `vedoucí: ${leads.length ? leads.map(e => (e.wid ? `ID ${e.wid}` : 'bez ID')).join(', ') : 'bez vedoucího'}` : ''].filter(Boolean).join(' · ');
        k.split(sub, k.CW, 8.4).forEach(line => { k.text(line, k.M, k.y - 1, 8.4, { color: C.ink2 }); k.y += k.LH(8.4, 1.3); });
        k.split(info, k.CW, 8.4).forEach(line => { k.text(line, k.M, k.y - 1, 8.4, { color: secWeak ? C.crit : C.ink2 }); k.y += k.LH(8.4, 1.3); });
        k.y += 2;
      }
      drawHead();
      const blocks = SHIFT_ORDER.filter(sh => m.rows.some(r => r.shift === sh));
      blocks.forEach(sh => {
        const rows = m.rows.filter(r => r.shift === sh);
        // poslední řádek tabulky drží se součty, řádek směny s prvním člověkem (nezůstanou samotné na nové stránce)
        const tailOf = ri => (ri === rows.length - 1 ? (blocks.length > 1 ? 1 : 0) + (sh === blocks[blocks.length - 1] ? 2 : 0) : 0);
        if (blocks.length > 1 || shift === '*') {
          if (k.need(RH * (2 + tailOf(0)))) drawHead();
          k.box(C.soft3, k.M, k.y, k.CW, RH - 0.6, 1);
          k.mid(`${shiftName(sh)} · ${peopleCount(rows.length)}`, k.M + 1.5, k.y + (RH - 0.6) / 2, 7.4, { bold: true, color: C.ink2 });
          k.y += RH;
        }
        rows.forEach((r, ri) => {
          if (k.need(RH * (1 + tailOf(ri)))) drawHead();
          const cy = k.y + RH / 2;
          const sickRow = !!r.e.sick;
          if (sickRow) k.box(C.warnSoft, k.M, k.y, k.CW, RH);
          const id = r.e.wid ? String(r.e.wid) : 'bez ID';
          k.mid(k.split(id, ID_W - 14, 8, true)[0], k.M + 1, cy, 8, { bold: !!r.e.wid, color: r.e.wid ? C.ink : C.crit });
          if (sickRow) k.pill('nemoc', k.M + ID_W - 1.5, cy, 'none', 6.4, 'right');
          const grp = `${r.pos ? r.pos.name || '(bez názvu)' : '—'}${r.home ? '' : ' · zaučení'}`;
          k.mid(k.split(grp, GRP_W - 2, 7.6)[0], k.M + ID_W, cy, 7.6, { color: r.home ? C.ink : C.ink2 });
          k.mid(r.pct != null ? `${nf(r.pct, 0)} %` : '—', k.M + FIX - 1.5, cy, 7.6, { align: 'right', color: C.ink2 });
          if (withBen) {
            // benefity jen ve vlastní skupině (zaučení odjinud je mají u své skupiny)
            const b = r.home ? ben.get(r.e.key) : null;
            const t = b && b.tier && b.tier.name ? `${b.tier.name}${+b.tier.pct ? ` +${nf(+b.tier.pct, 1)} %` : ''}` : '—';
            const vals = !b ? ['', '', '', ''] : [b.kafeOnly ? 'jen Kafe' : String(b.L.base), b.kafeOnly ? '—' : String(b.total), b.att && b.att.found ? (b.kafe ? 'ano' : 'ne') : '—', t];
            BEN.forEach(([, w, al], i) => {
              const v = k.split(vals[i], w - 2, 7.6, i === 1)[0];
              k.mid(v, al === 'r' ? benX(i) + w - 1.5 : al === 'c' ? benX(i) + w / 2 : benX(i) + 1, cy, 7.6, { align: al === 'r' ? 'right' : al === 'c' ? 'center' : 'left', bold: i === 1 && !!b, color: b && b.lost && i === 1 ? C.crit : i === 0 ? C.ink2 : C.ink });
            });
          }
          idx.forEach((jj, j) => {
            const c = m.cols[jj];
            const v = r.cells[jj];
            const x = k.M + SK0 + j * cw;
            const own = r.e.positionId === c.p.id;
            if (own && !sickRow) k.box(C.accSoft, x + 0.25, k.y + 0.25, cw - 0.5, RH - 0.5);
            const color = sickRow ? C.ink3 : own ? C.acc : C.ink2;
            const gx = v ? x + cw / 2 - 1.2 : x + cw / 2;
            pdfIluo(k, gx, cy, 1.45, v, color);
            if (v) k.mid(String(v), gx + 2.1, cy, 6.6, { bold: true, color });
          });
          k.y += RH;
          k.hline(k.y, C.line, 0.15);
        });
        if (blocks.length > 1) row(`Úroveň 3–4 · ${shiftName(sh)}`, idx.map(j => m.coverage[j].by[sh].ready), { risk: (v, j) => !v && !m.coverage[idx[j]].opt });
      });
      k.hline(k.y, C.line2, 0.3);
      row(`Úroveň 3–4 celkem${m.sick ? ' (bez nemocných)' : ''}`, idx.map(j => m.coverage[j].ready), { bg: C.soft, risk: (v, j) => v < 2 && !m.coverage[idx[j]].opt });
      row(`Hodnoceno 1–4 celkem${m.sick ? ' (bez nemocných)' : ''}`, idx.map(j => m.coverage[j].trained), { bg: C.soft });
      k.y += 7;
    });
  });
  // legenda
  k.keep(() => {
    k.heading('Jak číst matici', 11);
    let x = k.M;
    STD_SCALE.forEach((l, i) => {
      const t = `${i} ${l.name}`;
      if (x + 6 + k.width(t, 8) > k.M + k.CW) { x = k.M; k.y += 6; }
      pdfIluo(k, x + 1.6, k.y + 2, 1.6, i, C.acc);
      k.text(t, x + 4.6, k.y + 0.2, 8, { color: C.ink2 });
      x += 9 + k.width(t, 8);
    });
    k.y += 7;
    k.box(C.accSoft, k.M, k.y, 7, 4.6, 0.6);
    k.text('dovednost vlastní skupiny člověka', k.M + 9, k.y + 0.5, 8, { color: C.ink2 });
    const w1 = 9 + k.width('dovednost vlastní skupiny člověka', 8) + 8;
    k.pill('nemoc', k.M + w1, k.y + 2.3, 'none', 6.6);
    k.text('v nemoci: jen pro přehled, do počtů úrovní a kapacity se dočasně nepočítá', k.M + w1 + 13, k.y + 0.5, 8, { color: C.ink2 });
    k.y += 7;
    k.para(`Úroveň 3–4 celkem = kolik lidí dovednost zvládá samostatně (červeně, když méně než 2). Zaučení = člověk z jiné skupiny, který dovednost umí.${secs.some(x => x.m.cols.some(c => c.s.opt)) ? ' * = dovednost není nutností: v procentu skupiny má čtvrtinovou váhu a slabé pokrytí se u ní nehlásí.' : ''}`, k.M, k.CW, 8, { color: C.ink3 });
    k.y += 4;
  }, 30);
  k.need(26);
  k.signoff();
  k.footer(`${EXPORT_NAME} · matice dovedností${withBen ? ` a benefity za ${per}` : ''} · jen ID zaměstnanců · ${dayText(todayIso())}`);
  return noId;
}
async function exportMatrixPdf(button, withBen) {
  const noId = await withPdf(button, doc => {
    doc.setProperties({ title: withBen ? 'Matice dovedností a benefity' : 'Matice dovedností', creator: EXPORT_NAME });
    const n = drawMatrix(doc, withBen);
    downloadFile(`matice-dovednosti${withBen ? '-benefity' : ''}-${todayIso()}.pdf`, doc.output('blob'), 'application/pdf');
    return n;
  }, 'landscape');
  if (noId) toast(`${noId === 1 ? '1 člověk nemá' : `${noId} ${noId <= 4 ? 'lidé nemají' : 'lidí nemá'}`} ID v evidenci práce, v PDF ${noId === 1 ? 'je' : 'jsou'} jako „bez ID“. ID doplníš v části Lidé.`, true);
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
      renderMatrix(); renderOverview(); renderPeople();
      const again = $(`[data-mxr="${CSS.escape(btn.dataset.mxr)}"][data-skill="${CSS.escape(btn.dataset.skill)}"]`);
      if (again) again.focus();
      return;
    }
    const person = t.closest('[data-mxperson]');
    if (person) { ui.selPerson = person.dataset.mxperson; ui.personOpen = true; showView('lide'); renderPeople(); return; }
    if (t.closest('#leadView #leadSkillAdd, #leadView [data-lsrow] button')) { await leadSkillClick(t); return; }
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
    if (t.closest('#capHistXlsx')) { exportPlanReality(t.closest('#capHistXlsx')); return; }
    if (t.closest('#capPrint')) window.print();
  });
  $('#view-matice').addEventListener('change', event => {
    const t = event.target;
    if (t.id === 'matrixGroup') { setPref({ matrixDept: t.value }); renderMatrixGrid(); return; }
    if (t.id === 'matrixShift') { setPref({ matrixShift: t.value }); renderMatrixGrid(); return; }
    if (t.id === 'matrixIds') { setPref({ matrixIds: t.checked }); renderMatrixGrid(); return; }
    if (t.id === 'capThr') { capSave({ thr: clamp(+t.value || 3, 1, 4) }); renderCapacity(); return; }
    if (t.id === 'capDetail') {
      // výchozí rozpis (nutné dovednosti) se neukládá
      const v = t.value === 'all' || t.value === 'none' ? t.value : null;
      capSave({ detail: v });
      if (!v) delete S.capReport.detail;
      renderCapacity(); return;
    }
    if (t.id === 'capS1') {
      // uloží se týden, kdy má skupina 1 ranní; dál se střídá po týdnu
      const cw = isoWeek(todayIso()).id;
      capSave({ s1am: t.value === 'S1' ? cw : t.value === 'S2' ? shiftWeek(cw, 1) : '' });
      renderCapacity(); return;
    }
    if (t.id === 'capNote') { capSave({ note: t.value.slice(0, 4000) }); return; }
    if (t.id === 'capHistWeek') { ui.capHist = t.value; renderCapacity(); $('#capHistWeek')?.focus(); return; }
    if (t.dataset.capskill) {
      const hidden = new Set(S.capReport.hidden || []);
      if (t.checked) hidden.delete(t.dataset.capskill); else hidden.add(t.dataset.capskill);
      capSave({ hidden: [...hidden] }); renderCapacity();
    }
  });
  $('#btnMatrixXlsx').onclick = exportMatrix;
  $('#btnMatrixPrint').onclick = () => window.print();
  $('#btnMatrixPdf').onclick = () => exportMatrixPdf($('#btnMatrixPdf'), false);
  $('#btnMatrixPdfBen').onclick = () => exportMatrixPdf($('#btnMatrixPdfBen'), true);
  $('#btnRulesPdf').onclick = exportRulesPdf;
}

