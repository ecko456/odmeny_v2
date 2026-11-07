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
    <p class="small muted">${pen ? 'Absence = celý pracovní den bez docházky; den s kódem nepřítomnosti je absence i s hodinami (např. 8 D). Počítá se to, co zbyde po vyplnění víkendovými směnami: kdo absenci nadělá o víkendu, srážku nemá, ale nedostane ani bonus za víkend.' : 'Jen když nic nechybí. Počítají se víkendové směny, které nebylo potřeba na vyplnění absence.'}</p>
    <div class="rules">${rules.length ? rules.map((r, i) => `<div class="rulerow" data-ri="${i}">
        <span class="rule-part"><span>${pen ? 'Dny absence' : 'Víkendové směny'} ≥</span><input type="number" data-rat value="${+r.at || 0}" min="1" max="31" step="1" aria-label="${pen ? 'Počet chybějících dnů' : 'Počet víkendových směn'}"></span>
        <span class="rule-part"><span>→ ${pen ? '−' : '+'}</span><input type="number" data-rt value="${+r.t || 0}" min="0" max="100" step="1" aria-label="Počet tabáků"><span>tab.</span></span>
        <button class="icon-btn" type="button" data-rdel aria-label="Smazat řádek">${I.x}</button>
      </div>`).join('') : `<p class="small muted">Žádný řádek, ${pen ? 'za chybějící dny se nestrhává nic.' : 'bonus se nedává.'}</p>`}</div>
    <button class="btn sec small" type="button" data-radd>Přidat řádek</button>
  </div>`;
}

/* Předvyplněné varianty prémie podle zadání (dají se upravit). */
const TIER_TEMPLATES = [
  { name: 'Prémie', minSkill: 3, skills: [], raise: 20, reward: '', maxAbs: 3, minWknd: 2, minAtt: null, minNorm: 80, minUse: null, maxKt: null, moral: true, manual: [], streak: null },
  { name: 'Extra bonus', minSkill: 4, skills: [], raise: 30, reward: '', maxAbs: 1, minWknd: 3, minAtt: null, minNorm: 90, minUse: null, maxKt: 0, moral: true, manual: [], streak: { months: 4, label: 'možnost získat 2. platovou třídu' } },
];
function newTier(p) {
  const tpl = TIER_TEMPLATES[Math.min((p.tiers || []).length, TIER_TEMPLATES.length - 1)];
  return { ...tpl, id: uid('t'), name: (p.tiers || []).length < TIER_TEMPLATES.length ? tpl.name : `Varianta ${(p.tiers || []).length + 1}`,
    skills: [], manual: [], streak: tpl.streak ? { ...tpl.streak } : null };
}
/* Podmínky varianty, které se zapínají zaškrtnutím: pole a hodnota po zapnutí. */
const TIER_CONDS = {
  norm: ['minNorm', 80], kt: ['maxKt', 0], att: ['minAtt', 95], abs: ['maxAbs', 3],
  wknd: ['minWknd', 2], use: ['minUse', 90], moral: ['moral', true], all: ['minSkill', 3],
};
function tierCondOn(t, key) { const f = TIER_CONDS[key][0]; return f === 'moral' ? !!t.moral : f === 'minSkill' ? +t.minSkill > 0 : t[f] != null; }

function peopleCount(n) {
  return `${n} ${lidiN(n)}`;
}

function groupSummary(x, count) {
  const sk = groupSkills(x).length;
  return `${peopleCount(count || 0)} · ${sk} ${sk === 1 ? 'dovednost' : sk >= 2 && sk <= 4 ? 'dovednosti' : 'dovedností'}${x.onlyKafe ? ' · jen Kafe' : ` · max ${+x.maxTab || 0} tab.`}${(x.tiers || []).length ? ` · prémie ${x.tiers.map(t => esc(t.name)).join(', ')}` : ''}`;
}

/* Štítek nepovinné dovednosti (2.25): v procentu skupiny má čtvrtinovou váhu. */
function optTag(x, short) { return x && x.opt ? ` <span class="tag sk-opt-tag" title="Není nutností: v procentu skupiny se počítá čtvrtinovou vahou">${short ? 'nepovinná' : 'není nutností · váha ¼'}</span>` : ''; }
function skillRowHtml(x, i, n) {
  const sc = skillScale(x);
  return `<div class="sk-row${x.opt ? ' is-opt' : ''}" data-skrow="${esc(x.id)}">
    <div class="sk-main"><b>${esc(x.name)}</b>${optTag(x)}${x.desc ? `<p class="small muted">${esc(x.desc)}</p>` : ''}
      <p class="tiny muted">${x.scale ? 'vlastní hodnoticí schéma' : 'standardní hodnoticí schéma'}: ${sc.map((l, j) => `${j} ${esc(l.name)}`).join(' · ')}</p></div>
    <div class="sk-tools">
      <label class="sk-opt" title="Nepovinná dovednost se do procenta skupiny (a tabáků) počítá čtvrtinovou vahou, u prémie se nevyžaduje a v reportu kapacit je jen v celkovém skóre"><input type="checkbox" data-skopt${x.opt ? ' checked' : ''}> <span>Není nutností</span></label>
      <button class="icon-btn" type="button" data-skup aria-label="Posunout nahoru"${i ? '' : ' disabled'}>${I.back}</button>
      <button class="icon-btn sk-down" type="button" data-skdown aria-label="Posunout dolů"${i < n - 1 ? '' : ' disabled'}>${I.back}</button>
      <button class="btn sec small" type="button" data-skedit>Upravit</button>
      <button class="icon-btn" type="button" data-skdel aria-label="Smazat dovednost">${I.x}</button>
    </div>
  </div>`;
}

/* Varianta prémie (2.11): co musí člověk za měsíc splnit (zaškrtnuté podmínky), vybrané
   dovednosti s úrovní, další body vedoucího, odměna a nárok po několika měsících v řadě. */
function tierCardHtml(p, t, i) {
  const on = key => tierCondOn(t, key);
  const num = (f, hi, step = 1, unit = '', label = '') => `<span class="pctbox tc-num"><input type="number" data-tf="${f}" value="${t[f] ?? ''}" min="0" max="${hi}" step="${step}" aria-label="${esc(label)}">${unit ? `<i>${unit}</i>` : ''}</span>`;
  const lvlSel = (attr, cur, label) => `<select ${attr} aria-label="${esc(label)}">${[1, 2, 3, 4].map(l => `<option value="${l}"${l === cur ? ' selected' : ''}>${l} – ${esc(STD_SCALE[l].name)}</option>`).join('')}</select>`;
  const cond = (key, title, hint, value) => `<div class="tc${on(key) ? ' on' : ''}">
      <label class="tc-check"><input type="checkbox" data-tc="${key}"${on(key) ? ' checked' : ''}><span><b>${title}</b>${hint ? `<small>${hint}</small>` : ''}</span></label>
      ${on(key) && value ? `<div class="tc-val">${value}</div>` : ''}</div>`;
  const req = new Map((t.skills || []).map(r => [r.id, r.lvl]));
  const skRow = (x, g) => `<div class="tsk${req.has(x.id) ? ' on' : ''}"><label class="tc-check"><input type="checkbox" data-tsk="${esc(x.id)}"${req.has(x.id) ? ' checked' : ''}><span><b>${esc(x.name)}</b>${g ? `<small>${esc(g.name || '(bez názvu)')}</small>` : ''}</span></label>
      ${req.has(x.id) ? `<div class="tc-val"><span class="tc-pre">aspoň</span>${lvlSel(`data-tsklvl="${esc(x.id)}"`, req.get(x.id), `Úroveň: ${x.name}`)}</div>` : ''}</div>`;
  const own = groupSkills(p);
  const others = S.positions.filter(g => g !== p && isGroup(g) && groupSkills(g).length);
  const otherOn = others.some(g => groupSkills(g).some(x => req.has(x.id)));
  const nOn = Object.keys(TIER_CONDS).filter(on).length + req.size + (t.manual || []).length;
  return `<div class="tier-card" data-tier="${esc(t.id)}">
    <div class="tier-head"><span class="tier-n">${i + 1}</span>
      <label class="field tier-name"><span>Název varianty</span><input type="text" data-tf="name" value="${esc(t.name)}" maxlength="60"></label>
      <div class="tier-tools">
        <button class="icon-btn" type="button" data-tierup aria-label="Posunout výš"${i ? '' : ' disabled'}>${I.back}</button>
        <button class="icon-btn sk-down" type="button" data-tierdown aria-label="Posunout níž"${i < p.tiers.length - 1 ? '' : ' disabled'}>${I.back}</button>
        <button class="icon-btn" type="button" data-tierdel aria-label="Smazat variantu">${I.x}</button>
      </div></div>
    <p class="eyebrow">Co musí za měsíc splnit <span class="tc-count">${nOn ? `${nOn} ${nOn === 1 ? 'podmínka' : nOn <= 4 ? 'podmínky' : 'podmínek'}` : 'bez podmínek'}</span></p>
    <div class="tc-grid">
      ${cond('norm', 'Plnění normy', 'z evidence práce', `<span class="tc-pre">aspoň</span>${num('minNorm', 300, 0.5, '%', 'Plnění normy aspoň')}`)}
      ${cond('kt', 'Bezproblémové kontroly', 'namátkové kontroly v měsíci (bez kontroly = splněno)', `<span class="tc-pre">nálezů nejvýš</span>${num('maxKt', 31, 1, '', 'Kontrol s nálezem nejvýš')}`)}
      ${cond('att', 'Docházka', 'odpracované hodiny z fondu', `<span class="tc-pre">aspoň</span>${num('minAtt', 100, 0.5, '%', 'Docházka aspoň')}`)}
      ${cond('abs', 'Absence', 'celé pracovní dny bez docházky', `<span class="tc-pre">nejvýš</span>${num('maxAbs', 31, 1, 'dní', 'Absence nejvýš')}`)}
      ${cond('wknd', 'Víkendové směny', 'odpracované víkendy a svátky', `<span class="tc-pre">aspoň</span>${num('minWknd', 31, 1, '', 'Víkendové směny aspoň')}`)}
      ${cond('use', 'Využití fondu', 'čas na zakázkách z fondu', `<span class="tc-pre">aspoň</span>${num('minUse', 100, 0.5, '%', 'Využití fondu aspoň')}`)}
      ${cond('moral', 'Pracovní morálka', 'posoudí vedoucí: platí, dokud u člověka a měsíce neoznačí nesplněno', '')}
      ${cond('all', 'Všechny dovednosti skupiny', 'nejnižší hodnocení ve skupině', `<span class="tc-pre">aspoň</span>${lvlSel('data-tf="minSkill"', +t.minSkill || 3, 'Všechny dovednosti aspoň na úrovni')}`)}
    </div>
    <div class="tier-skills"><p class="small"><b>Vybrané dovednosti</b> <span class="muted">(zaškrtni, které musí mít, a na jaké úrovni)</span></p>
      ${own.length ? `<div class="tc-grid">${own.map(x => skRow(x, null)).join('')}</div>` : '<p class="small muted">Skupina zatím nemá dovednosti.</p>'}
      ${others.length ? `<details class="tsk-other"${otherOn ? ' open' : ''}><summary>Dovednosti z jiných skupin (zaučení)${otherOn ? ` · vybráno ${[...req.keys()].filter(id => !own.some(x => x.id === id)).length}` : ''}</summary>
        ${others.map(g => `<p class="tsk-group">${esc(g.name || '(bez názvu)')}</p><div class="tc-grid">${groupSkills(g).map(x => skRow(x, null)).join('')}</div>`).join('')}</details>` : ''}
    </div>
    <div class="tier-manual"><p class="small"><b>Další body, které posuzuje vedoucí</b> <span class="muted">(platí jako splněné, dokud je u člověka a měsíce neoznačíš jako nesplněné)</span></p>
      ${(t.manual || []).map(m => `<div class="tier-point" data-tpoint="${esc(m.id)}"><input type="text" data-tptext value="${esc(m.text)}" maxlength="200" aria-label="Bod vedoucího"><button class="icon-btn" type="button" data-tpdel aria-label="Smazat bod">${I.x}</button></div>`).join('')}
      <button class="btn sec small" type="button" data-tpadd>Přidat bod</button></div>
    <p class="eyebrow">Odměna</p>
    <div class="form-grid tier-grid">
      <label class="field"><span>Navýšení mzdy</span><span class="pctbox"><input type="number" data-tf="raise" value="${t.raise ?? ''}" min="0" max="100" step="0.5" placeholder="bez navýšení"><i>%</i></span></label>
      <label class="field"><span>Jiná odměna (nepovinné)</span><input type="text" data-tf="reward" value="${esc(t.reward || '')}" maxlength="200" placeholder="např. jednorázový bonus"></label>
    </div>
    <label class="check tier-streak"><input type="checkbox" data-tstreak${t.streak ? ' checked' : ''}><span><b>Nárok po několika měsících v řadě</b><small>Kdo tuto variantu (nebo vyšší) splní tolik měsíců za sebou, uvidí u sebe nárok.</small></span></label>
    ${t.streak ? `<div class="form-grid tier-grid"><label class="field"><span>Měsíců v řadě</span><input type="number" data-tsmonths value="${t.streak.months}" min="2" max="24" step="1"></label>
      <label class="field"><span>Na co vzniká nárok</span><input type="text" data-tslabel value="${esc(t.streak.label)}" maxlength="80"></label></div>` : ''}
  </div>`;
}

function renderPositions() {
  const counts = {};
  Object.values(S.employees).forEach(e => { if (e.positionId && !isLead(e)) counts[e.positionId] = (counts[e.positionId] || 0) + 1; });
  if (!ui.selPos || !S.positions.some(x => x.id === ui.selPos)) ui.selPos = S.positions[0] ? S.positions[0].id : null;
  const p = S.positions.find(x => x.id === ui.selPos);
  $('#posList').innerHTML = S.positions.length ? S.positions.map(x => `<button class="list-item wrap" type="button" data-selpos="${esc(x.id)}" aria-current="${x.id === ui.selPos}">
      <span class="nm"><b>${esc(x.name || '(bez názvu)')}</b><span>${groupSummary(x, counts[x.id])}</span></span>
    </button>`).join('') : emptyState('Žádné skupiny', 'Přidej první skupinu tlačítkem Nová skupina.');
  $('#posSplit').classList.toggle('show-detail', ui.posOpen);
  syncHistory();
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
      <label class="check opt-check plan-check"><input type="checkbox" id="posPlan"${p.plan ? ' checked' : ''}><span><b>Plánovaná kapacita</b><small>Kolik zvládne jeden člověk za směnu, v kusech nebo v hodinách. Ukáže se, kolik skupina zvládne na ranní, na odpolední, za den a za týden.</small></span></label>
      ${p.plan ? `<div class="plan-box"><div class="row gap wrap"><label class="field plan-v"><span>Na osobu za směnu</span><input type="text" inputmode="decimal" id="posPlanV" value="${esc(String(p.plan.v).replace('.', ','))}" maxlength="8" autocomplete="off"></label>
        <label class="field plan-u"><span>Jednotka</span><select id="posPlanUnit"><option value="ks"${p.plan.unit === 'h' ? '' : ' selected'}>kusy</option><option value="h"${p.plan.unit === 'h' ? ' selected' : ''}>hodiny</option></select></label></div>${planHtml(p)}</div>` : ''}
      ${p.onlyKafe ? '' : `<div class="tab-steps" aria-label="Tabáky podle úrovně dovedností">${[0, 1, 2, 3, 4].map(l => `<div><span>${l * 25} %</span><b>${Math.round(mt * l / 4 + 1e-9)}</b><small>${l === 4 ? 'vše na 4' : `průměr ${l}`}</small></div>`).join('')}</div>
      <p class="small muted">Každá úroveň dovednosti je 25 %. Procento skupiny je průměr všech jejích dovedností (dvě dovednosti, jedna na 4 a druhá na 0 = 50 %); dovednost, která není nutností, se počítá čtvrtinovou vahou (nutná na 4 a nepovinná na 0 = 80 %). Tabáky = maximum × procento, zaokrouhleno. ${p.max != null && p.max !== '' ? `Strop ${p.max}: dovednosti a bonus za víkendy dohromady víc nedají.` : 'Bez stropu: bonus za víkendy se přičte navíc k dovednostem.'}</p>`}
      <p class="small muted">Ve skupině: ${peopleCount(counts[p.id] || 0)}. Oddělení seskupuje skupiny v kontrolách; když ho nevyplníš, skupina je oddělením sama pro sebe.</p>
      <div class="row end"><button class="btn danger small" type="button" id="posDel">Smazat skupinu</button></div>
    </div>
    <div class="card" id="skillCard">
      <div class="card-head"><div><h3>Dovednosti</h3><p class="small muted">Každá dovednost se u člověka hodnotí 0–4 podle hodnoticího schématu. Pořadí platí i v matici. Zaškrtni <b>Není nutností</b> u dovednosti, kterou člověk ve skupině mít nemusí: v procentu skupiny (a tím v tabácích) bude mít čtvrtinovou váhu, u prémie „všechny dovednosti aspoň…“ se nevyžaduje a v reportu kapacit se ukáže jen v celkovém skóre.</p></div>
        <button class="btn small" type="button" data-skadd>Přidat dovednost</button></div>
      ${skills.length ? `<div class="sk-list">${skills.map((x, i) => skillRowHtml(x, i, skills.length)).join('')}</div>` : '<p class="small muted">Skupina zatím nemá žádnou dovednost, takže nikdo v ní nemá tabáky za dovednosti. Přidej první.</p>'}
    </div>
    ${p.onlyKafe ? `<div class="note i">Kafe dostane, kdo odpracuje aspoň měsíční fond hodin (nebo práh nastavený u období v přehledu).${cutoffDays() ? ` Od ${cutoffDays()} dní absence po vyplnění víkendem nárok zaniká (Nastavení).` : ''}</div>` : `<div class="rule-grid">${ruleCard(p, 'penalty')}${ruleCard(p, 'bonus')}</div>
    <div class="note i">Platí vždy nejvyšší splněný řádek. Absence je celý pracovní den bez docházky; den s kódem nepřítomnosti (dovolená, nemoc…) je absence i s hodinami u kódu (např. 8 D) a ty hodiny se nepočítají ani do Kafe. Kratší směna absence není (projeví se jen v hodinách u Kafe). Každá odpracovaná víkendová nebo sváteční směna vyplní jeden den absence a víkend použitý na vyplnění se do bonusu nepočítá.${cutoffDays() ? ` Od ${cutoffDays()} dní absence neplatí nic, bez nároku na tabák i kafe (Nastavení).` : ' Hranici, od které člověk ztrácí nárok úplně, nastavíš v Nastavení.'}
      <div class="mt-s"><button class="btn sec small" type="button" id="posCopyRules">Použít srážky a bonusy u všech skupin</button></div></div>`}
    ${normCutEditorHtml(p)}
    <div class="card" id="tierCard">
      <div class="card-head"><div><h3>Varianty prémie</h3><p class="small muted">U každé varianty zaškrtni, co musí člověk za měsíc splnit, a vyber dovednosti s úrovní. Varianty jsou seřazené od nejnižší po nejvyšší; za měsíc platí nejvyšší varianta, kterou člověk splnil.</p></div>
        <button class="btn small" type="button" data-tieradd>Přidat variantu</button></div>
      ${(p.tiers || []).length ? p.tiers.map((t, i) => tierCardHtml(p, t, i)).join('') : '<p class="small muted">Zatím bez prémie. První varianta se předvyplní podle zadání (všechny dovednosti aspoň 3, absence nejvýš 3 dny, aspoň 2 víkendy, plnění normy 80 %, pracovní morálka, navýšení mzdy 20 %), druhá jako extra bonus.</p>'}
      ${(p.tiers || []).length ? '<div class="mt-s"><button class="btn sec small" type="button" id="posCopyTiers">Použít prémie u všech skupin</button></div>' : ''}
    </div>
  </div>`;
}

/* Srážky ze mzdy za neproduktivitu u skupiny (2.12): pásma plnění normy a od kterého měsíce platí. */
const NORM_CUT_DEFAULT = [{ max: 50, pct: 50 }, { max: 60, pct: 25 }];
function ncutMonths(cur) {
  const now = todayIso().slice(0, 7);
  const out = new Set([cur, ...Object.keys(S.periods), ...Object.keys(S.production || {})].filter(m => MONTH_RE.test(String(m))));
  let y = +now.slice(0, 4), m = +now.slice(5, 7) + 1;
  for (let i = 0; i < 14; i++) { if (m > 12) { m = 1; y++; } if (m < 1) { m = 12; y--; } out.add(`${y}-${String(m).padStart(2, '0')}`); m--; }
  return [...out].sort().reverse();
}
function normCutEditorHtml(p) {
  const nc = normCutRule(p);
  const rows = nc ? nc.rows : [];
  return `<div class="card" id="normCutCard">
    <div class="card-head"><div><h3>Srážky ze mzdy za neproduktivitu</h3><p class="small muted">Podle plnění normy za měsíc z evidence práce. Benefity (tabáky, Kafe, prémie) se nekrátí, srážka se zpracuje ve mzdách. Týden před koncem měsíce vyskočí upozornění stejně jako u ruční srážky ze mzdy.</p></div></div>
    <label class="check opt-check"><input type="checkbox" id="posNormCut"${nc ? ' checked' : ''}><span><b>Srážky za neproduktivitu u této skupiny</b><small>Pásma plnění normy a srážka ze mzdy v %. Platí nejnižší pásmo, do kterého plnění spadá; bez údaje o normě srážka není.</small></span></label>
    ${nc ? `<div class="ncut-rows">${rows.map((r, i) => `<div class="ncut-row" data-ncrow="${i}">
        <span class="ncut-range">${i ? `nad ${nf(rows[i - 1].max, 1)} %` : 'od 0 %'}</span>
        <span class="ncut-f"><span>do</span><span class="pctbox"><input type="number" data-ncmax value="${r.max}" min="0" max="300" step="0.5" aria-label="Plnění normy do (%)"><i>%</i></span></span>
        <span class="ncut-f"><span>→ srážka</span><span class="pctbox"><input type="number" data-ncpct value="${r.pct}" min="1" max="100" step="1" aria-label="Srážka ze mzdy (%)"><i>% ze mzdy</i></span></span>
        <button class="icon-btn" type="button" data-ncdel aria-label="Smazat pásmo">${I.x}</button></div>`).join('')}
      <p class="small muted ncut-rest">Nad ${nf(rows[rows.length - 1].max, 1)} %: bez srážky.</p>
      <div class="row gap wrap ncut-foot"><button class="btn sec small" type="button" data-ncadd>Přidat pásmo</button><span class="spacer"></span>
        <label class="field ncut-from"><span>Platí od měsíce</span><select id="posNormCutFrom">${ncutMonths(nc.from).map(m => `<option value="${m}"${m === nc.from ? ' selected' : ''}>${esc(monthLabel(m))}</option>`).join('')}</select></label></div></div>` : ''}
  </div>`;
}

/* Dialog dovednosti: název, popis a hodnoticí schéma 0–4 (předvyplněné standardním). */
async function skillDialog(x) {
  const sc = skillScale(x);
  const result = await dialog({
    title: x ? 'Upravit dovednost' : 'Přidat dovednost', ok: x ? 'Uložit' : 'Přidat', wide: true,
    html: `<label class="field"><span>Název dovednosti</span><input name="name" value="${esc(x ? x.name : '')}" maxlength="80" required autofocus placeholder="např. Seřízení stroje"></label>
      <label class="field"><span>Popis (nepovinné)</span><textarea name="desc" rows="2" maxlength="1000" placeholder="Co dovednost zahrnuje">${esc(x ? x.desc : '')}</textarea></label>
      <label class="check opt-check"><input type="checkbox" name="opt"${x && x.opt ? ' checked' : ''}><span><b>Není nutností</b><small>Do procenta skupiny a tabáků se počítá čtvrtinovou vahou, u prémie „všechny dovednosti aspoň…“ se nevyžaduje a v reportu kapacit je jen v celkovém skóre.</small></span></label>
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
  return { name: f.namedItem('name').value.trim().slice(0, 80), desc: f.namedItem('desc').value.trim().slice(0, 1000), scale: std ? null : scale, opt: f.namedItem('opt').checked };
}
/* Hodnoty z dialogu do dovednosti; opt se ukládá jen jako true (nutná dovednost ho nemá). */
function applySkill(x, v) { const { opt, ...rest } = v; Object.assign(x, rest); if (opt) x.opt = true; else delete x.opt; return x; }

function bindGroupEditor() {
  const editor = $('#posEditor');
  const cur = () => S.positions.find(x => x.id === ui.selPos);
  const refresh = (list = true) => { save(); renderWageAlert(); renderOverview(); renderPeople(); if (list) renderPositions(); };
  /* procenta na desetiny; prázdná hodnota = podmínka se nehlídá */
  const pctVal = (v, hi) => { const t = String(v).trim().replace(',', '.'); return t === '' || !Number.isFinite(+t) ? null : Math.round(clamp(+t, 0, hi) * 10) / 10; };
  const intVal = (v, hi) => { const t = String(v).trim(); return t === '' || !Number.isFinite(+t) ? null : Math.round(clamp(+t, 0, hi)); };
  editor.addEventListener('input', event => {
    const p = cur();
    const t = event.target;
    if (!p) return;
    if (t.id === 'posName') {
      const before = deptOf(p);
      p.name = t.value;
      leadsFollowDept(before, deptOf(p));   // oddělení bez názvu = název skupiny
      const label = $(`#posList [data-selpos="${CSS.escape(p.id)}"] b`);
      if (label) label.textContent = p.name || '(bez názvu)';
      save(); renderOverview(); renderPeople();
    }
  });
  editor.addEventListener('change', event => {
    const p = cur();
    const t = event.target;
    if (!p) return;
    if (t.id === 'posDept') { const before = deptOf(p); p.dept = String(t.value).trim().slice(0, 60); leadsFollowDept(before, deptOf(p)); refresh(); return; }
    if (t.id === 'posOnlyKafe') { p.onlyKafe = t.checked; refresh(); return; }
    if (t.matches('[data-skopt]')) {
      const x = p.skillset.find(y => y.id === t.closest('[data-skrow]').dataset.skrow);
      if (!x) return;
      if (t.checked) x.opt = true; else delete x.opt;
      refresh();
      toast(t.checked ? `${x.name}: není nutností, v procentu skupiny má čtvrtinovou váhu.` : `${x.name}: zase nutná dovednost.`);
      return;
    }
    if (t.id === 'posNormCut') {
      // platí od vybraného měsíce, pokud se teprve uzavírá (tento nebo minulý), jinak od tohoto měsíce
      const now = todayIso().slice(0, 7), from = S.current && S.current >= prevMonth(now) && S.current <= now ? S.current : now;
      if (t.checked) p.normCut = { from, rows: NORM_CUT_DEFAULT.map(r => ({ ...r })) }; else delete p.normCut;
      refresh(); return;
    }
    if (t.id === 'posNormCutFrom' && p.normCut) { p.normCut.from = MONTH_RE.test(t.value) ? t.value : ''; refresh(); return; }
    const ncRow = t.closest('[data-ncrow]');
    if (ncRow && p.normCut) {
      const r = p.normCut.rows[+ncRow.dataset.ncrow];
      if (!r) return;
      if ('ncmax' in t.dataset) {
        const v = pctVal(t.value, 300);
        if (v == null) { toast('Zadej hranici plnění normy v %.', true); refresh(); return; }
        if (p.normCut.rows.some(x => x !== r && x.max === v)) { toast(`Pásmo do ${nf(v, 1)} % už je.`, true); refresh(); return; }
        r.max = v;
        p.normCut.rows.sort((a, b) => a.max - b.max);   // pásma vždy vzestupně
      }
      if ('ncpct' in t.dataset) r.pct = clamp(Math.round(+t.value || 0), 1, 100);
      refresh(); return;
    }
    if (t.id === 'posPlan') { if (t.checked) p.plan = p.plan || { v: 25, unit: 'ks' }; else delete p.plan; refresh(); renderMatrix(); return; }
    if (t.id === 'posPlanUnit' && p.plan) { p.plan.unit = t.value === 'h' ? 'h' : 'ks'; if (p.plan.unit === 'ks') p.plan.v = Math.max(1, Math.round(p.plan.v)); refresh(); return; }
    if (t.id === 'posPlanV' && p.plan) {
      const n = +String(t.value).trim().replace(',', '.');
      if (n > 0) p.plan.v = p.plan.unit === 'h' ? Math.round(clamp(n, 0.1, 1000) * 10) / 10 : clamp(Math.round(n), 1, 100000);
      else toast('Zadej kladné číslo, např. 25 nebo 7,5.', true);
      refresh(); return;
    }
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
      // zapnutá podmínka zůstane zapnutá i s prázdným polem (vrátí se výchozí hodnota); vypíná se zaškrtnutím
      const dflt = k => TIER_CONDS[Object.keys(TIER_CONDS).find(c => TIER_CONDS[c][0] === k)][1];
      if (f === 'name') tier.name = t.value.trim().slice(0, 60) || tier.name;
      else if (f === 'reward') tier.reward = t.value.trim().slice(0, 200);
      else if (f === 'minSkill') tier.minSkill = clamp(Math.round(+t.value || 0), 0, 4);
      else if (f === 'raise') tier.raise = pctVal(t.value, 100) || 0;
      else if (f === 'minNorm') tier.minNorm = pctVal(t.value, 300) ?? dflt(f);
      else if (f === 'minAtt' || f === 'minUse') tier[f] = pctVal(t.value, 100) ?? dflt(f);
      else if (f === 'maxAbs' || f === 'minWknd' || f === 'maxKt') tier[f] = intVal(t.value, 31) ?? dflt(f);
      else if ('tc' in t.dataset) {
        const [k, v] = TIER_CONDS[t.dataset.tc];
        if (k === 'moral') tier.moral = t.checked;
        else if (k === 'minSkill') tier.minSkill = t.checked ? v : 0;
        else tier[k] = t.checked ? v : null;
      } else if ('tsk' in t.dataset) {
        tier.skills = (tier.skills || []).filter(r => r.id !== t.dataset.tsk);
        if (t.checked) tier.skills.push({ id: t.dataset.tsk, lvl: 3 });
      } else if ('tsklvl' in t.dataset) {
        const r = (tier.skills || []).find(x => x.id === t.dataset.tsklvl);
        if (r) r.lvl = clamp(Math.round(+t.value || 1), 1, 4);
      } else if ('tptext' in t.dataset) {
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
    if (t.closest('#posBack')) { navBack(prev => prev.odmView === 'matice' && !prev.sub, () => { ui.posOpen = false; renderPositions(); }); return; }
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
      dropTierSkills(ids);
      ui.selPos = null; ui.posOpen = false;
      save(); renderAll(); toast('Skupina smazána.');
      return;
    }
    if (t.closest('[data-skadd]')) {
      const v = await skillDialog(null);
      if (!v) return;
      p.skillset.push(applySkill({ id: uid('s') }, v));
      refresh(); toast(`Dovednost ${v.name} přidána.`);
      return;
    }
    const sk = t.closest('[data-skrow]');
    if (sk) {
      const i = p.skillset.findIndex(x => x.id === sk.dataset.skrow);
      if (i < 0) return;
      if (t.closest('[data-skup]') && i > 0) { [p.skillset[i - 1], p.skillset[i]] = [p.skillset[i], p.skillset[i - 1]]; refresh(); return; }
      if (t.closest('[data-skdown]') && i < p.skillset.length - 1) { [p.skillset[i + 1], p.skillset[i]] = [p.skillset[i], p.skillset[i + 1]]; refresh(); return; }
      if (t.closest('[data-skedit]')) { const v = await skillDialog(p.skillset[i]); if (v) { applySkill(p.skillset[i], v); refresh(); } return; }
      if (t.closest('[data-skdel]')) {
        const x = p.skillset[i];
        const rated = Object.values(S.employees).filter(e => rateOf(e, x.id) > 0).length;
        if (!(await confirmBox('Smazat dovednost?', `Dovednost ${x.name} zmizí ze skupiny ${p.name}${rated ? ` a ${rated} lidí přijde o její hodnocení` : ''}. Procento a tabáky se přepočítají.`, 'Smazat', true))) return;
        p.skillset.splice(i, 1);
        Object.values(S.employees).forEach(e => { if (e.rate) { delete e.rate[x.id]; if (!Object.keys(e.rate).length) delete e.rate; } });
        dropTierSkills(new Set([x.id]));
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
      if (!(await confirmBox('Použít prémie u všech skupin?', `Varianty prémie všech ostatních skupin se nahradí kopií variant ze skupiny ${p.name}. Vybrané dovednosti skupiny ${p.name} se nekopírují (každá skupina má svoje), dovednosti z jiných skupin ano. Označení dalších bodů vedoucího u lidí v ostatních skupinách přestanou platit (pracovní morálka zůstane).`, 'Přepsat'))) return;
      const ownIds = new Set(groupSkills(p).map(x => x.id));
      S.positions.forEach(q => { if (q !== p && isGroup(q)) q.tiers = p.tiers.map(x => ({ ...JSON.parse(JSON.stringify(x)), id: uid('t'),
        skills: (x.skills || []).filter(r => !ownIds.has(r.id)).map(r => ({ ...r })), manual: x.manual.map(m => ({ id: uid('m'), text: m.text })) })); });
      refresh(); toast('Prémie zkopírovány do všech skupin.'); return;
    }
    if (t.closest('[data-tieradd]')) { p.tiers = p.tiers || []; p.tiers.push(newTier(p)); refresh(); return; }
    if (t.closest('[data-ncadd]') && p.normCut) {
      const last = p.normCut.rows[p.normCut.rows.length - 1];
      if (last.max >= 300) { toast('Nad 300 % už další pásmo nejde.', true); return; }
      p.normCut.rows.push({ max: Math.min(300, last.max + 10), pct: Math.max(1, Math.min(last.pct, 10)) });
      refresh(); return;
    }
    if (t.closest('[data-ncdel]') && p.normCut) {
      p.normCut.rows.splice(+t.closest('[data-ncrow]').dataset.ncrow, 1);
      if (!p.normCut.rows.length) delete p.normCut;
      refresh(); return;
    }
    const card = t.closest('[data-tier]');
    if (card) {
      const i = p.tiers.findIndex(x => x.id === card.dataset.tier);
      if (i < 0) return;
      const tier = p.tiers[i];
      if (t.closest('[data-tierup]') && i > 0) { [p.tiers[i - 1], p.tiers[i]] = [p.tiers[i], p.tiers[i - 1]]; refresh(); return; }
      if (t.closest('[data-tierdown]') && i < p.tiers.length - 1) { [p.tiers[i + 1], p.tiers[i]] = [p.tiers[i], p.tiers[i + 1]]; refresh(); return; }
      if (t.closest('[data-tierdel]')) {
        if (!(await confirmBox('Smazat variantu prémie?', `Varianta ${tier.name} zmizí ze skupiny ${p.name}.`, 'Smazat', true))) return;
        p.tiers.splice(i, 1); refresh(); return;
      }
      if (t.closest('[data-tpadd]')) { tier.manual.push({ id: uid('m'), text: 'Nový bod' }); refresh(); const inp = $(`[data-tier="${CSS.escape(tier.id)}"] [data-tpoint]:last-of-type [data-tptext]`); if (inp) { inp.focus(); inp.select(); } return; }
      const pt = t.closest('[data-tpoint]');
      if (pt && t.closest('[data-tpdel]')) { tier.manual = tier.manual.filter(m => m.id !== pt.dataset.tpoint); refresh(); }
    }
  });
}

