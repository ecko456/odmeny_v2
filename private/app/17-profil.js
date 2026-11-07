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
function columnChart({ title, sub, months, value, tip, tone, yMax = null, fmt = v => nf(v, 1), ref = null, integer = false, line = false }) {
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
  if (line) {
    // hladká křivka (2.59): úseky bez mezery v datech, plocha pod křivkou, při najetí linka a bod
    const base = T + plotH;
    const cx = i => L + i * band + band / 2;
    const runs = [];
    let cur = null;
    vals.forEach((v, i) => { if (v == null) { cur = null; return; } if (!cur) { cur = []; runs.push(cur); } cur.push([cx(i), y(v)]); });
    const dots = vals.map((v, i) => (v == null ? '' : `<circle class="wa-dot" cx="${cx(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${months.length > 18 ? 2.5 : 3.5}"/>`)).join('');
    const marks = vals.map((v, i) => {
      const label = i % every === 0 || i === months.length - 1
        ? `<text class="xl" x="${cx(i).toFixed(1)}" y="${H - 8}">${esc(MON[+months[i].id.slice(5, 7) - 1])}${i === 0 || months[i].id.slice(5, 7) === '01' ? ` ${months[i].id.slice(2, 4)}` : ''}</text>` : '';
      const cap = i === lastIdx && v != null ? `<text class="cap" x="${cx(i).toFixed(1)}" y="${(y(v) - 8).toFixed(1)}">${esc(fmt(v))}</text>` : '';
      return label + cap;
    }).join('');
    const hits = vals.map((v, i) => chartHover(L + i * band, band, T, base, cx(i), v == null ? null : y(v), tip(months[i], v))).join('');
    return `<figure class="chart ${tone} ch-smooth"><figcaption><b>${esc(title)}</b><span>${esc(sub)}</span></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${grid}${refLine}<path class="ch-area" d="${runs.map(r => smoothArea(r, base)).join('')}"/><path class="wa-line" d="${runs.map(smoothPath).join('')}"/>${dots}${marks}${hits}</svg></figure>`;
  }
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
    return `<div class="${cls}" title="${esc(`${DOW[c.dow]} ${c.d}. ${c.h > 0 ? `${nf(c.h)} h` : c.c ? `${c.c}${c.ah ? ` (${nf(c.ah, 2)} h u kódu, nepočítají se)` : ''}` : 'nic'}${c.hol ? ` — ${c.hol}` : ''}`)}">${c.d}</div>`;
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
        <h1>${esc(name)}${probIcon(e)}</h1>
        ${probationOf(e) ? `<p class="small muted prob-line">${esc(probText(probationOf(e)))}</p>` : ''}
        <p class="pf-meta">${L.pos ? `<span class="lvl l${L.n || 0}">${L.n || '?'}</span> <b>${esc(L.pos.name)}</b>${L.pct != null ? ` · dovednosti ${nf(L.pct, 0)} % (${L.base} ${tabW(L.base)})` : L.legacy && L.n ? ` · ${esc(L.lv.name)} (${L.base} ${tabW(L.base)})` : ' · bez dovedností'} · oddělení ${esc(deptOf(L.pos))}` : '<span class="crit">bez skupiny</span>'}${pfShift ? ` · ${esc(shiftName(pfShift))}` : ''}${e.excluded ? ' · <span class="tag">vyřazen ze seznamu</span>' : ''}</p>
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
      ${columnChart({ title: 'Docházka', sub: 'odpracováno z fondu hodin (%)', tone: 'c-acc', months: chartMonths, yMax: 100, ref: 100, line: true,
        value: m => (m.hasAtt && m.fund ? Math.round(Math.min(1, m.capped / m.fund) * 100) : null), fmt: v => `${nf(v, 0)} %`,
        tip: (m, v) => (m.hasAtt ? `${m.label}: ${v} % (${nf(m.hours)} h z fondu ${nf(m.fund)} h), absence ${m.absence} ${dnW(m.absence)}, víkend ${m.wkDays}×` : `${m.label}: bez docházky`) })}
      ${columnChart({ title: 'Výroba', sub: 'Ø kusů na odpracovaný den', tone: 'c-prod', months: chartMonths, line: true,
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
    ${dvPersonCard(e.key, from, to)}
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
    if (target.closest('[data-pfback]')) { const to = ui.prevView && ui.prevView !== 'profil' ? ui.prevView : 'lide'; navBack(prev => prev.odmView === to, () => showView(to)); return; }
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
    const wrap = hit.closest('.pf-charts, .dv-pie-wrap');
    const tip = wrap && $('.chart-tip', wrap);
    if (!tip || !wrap) return;
    hideTip();
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
  function hideTip() {
    $$('.pf-charts .chart-tip, .dv-pie-wrap .chart-tip', view).forEach(x => { x.hidden = true; });
    $$('.chart .hit.on', view).forEach(x => x.classList.remove('on'));
  }
  view.addEventListener('pointerover', event => { const hit = event.target.closest('.chart .hit'); if (hit) showTip(hit); });
  view.addEventListener('pointerout', event => { if (event.target.closest('.chart .hit')) hideTip(); });
  view.addEventListener('focusin', event => { const hit = event.target.closest('.chart .hit'); if (hit) showTip(hit); });
  view.addEventListener('focusout', event => { if (event.target.closest('.chart .hit')) hideTip(); });
}

