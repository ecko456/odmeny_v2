/* ==========================================================================
   PLÁN KAPACIT (verze 2.38): potřeba lidí a zkušeností po skupinách a odděleních,
   jak jsme na tom, koho doškolit a kolik doplnit. Výpočty jsou v core.js (capPlanAll).
   ========================================================================== */
const CP_COLS = [['n', 'celkem', 'Celkem lidí ve skupině'], ['l2', '2+', 'Aspoň úroveň 2 – Střední (50 % dovedností skupiny)'],
  ['l3', '3+', 'Aspoň úroveň 3 – Pokročilá (75 %)'], ['l4', '4', 'Úroveň 4 – Odborná (100 %)']];
const CP_STATE = { ok: ['V pořádku', 'good'], train: ['Doškolit', 'warn'], hire: ['Doplnit lidi', 'crit'], none: ['Bez plánu', 'none'] };
/* Plán kapacit ukazuje lidi jen podle ID zaměstnance (2.39.1), jméno je až v profilu. */
const cpWho = c => (c.e && c.e.wid ? `ID ${c.e.wid}` : 'bez ID');
const cpLvName = k => STD_SCALE[k].name.replace(' úroveň', '').toLowerCase();
const lidiAcc = n => (n === 1 ? 'člověka' : n >= 2 && n <= 4 ? 'lidi' : 'lidí');
function cpStateChip(st) {
  const [t, c] = CP_STATE[st];
  return `<span class="cp-state ${c}">${t}</span>`;
}
/* Doporučení skupiny jednou větou: kolik doplnit a koho doškolit (ID vede do profilu). */
function cpRecHtml(g) {
  const out = [];
  if (g.hire) {
    const lv = [4, 3, 2].find(k => g.hireLv[k] > 0);
    out.push(`<b class="crit-t">doplnit ${g.hire} ${lidiAcc(g.hire)}</b>${lv ? ` (z toho ${g.hireLv[lv]} aspoň na úrovni ${lv}, jinak je po náboru zaučit)` : ''}`);
  }
  if (g.cand.length) {
    const by = [4, 3, 2].map(k => [k, g.cand.filter(c => c.to === k)]).filter(x => x[1].length);
    out.push(`<b class="warn-t">doškolit ${g.cand.length} ${lidiAcc(g.cand.length)}</b>: ${by.map(([k, list]) => `na úroveň ${k} ${list.map(c => `<button class="linkish" type="button" data-cpperson="${esc(c.key)}">${esc(cpWho(c))}</button> <small class="muted num">${nf(c.pct || 0, 0)} %</small>`).join(', ')}`).join('; ')}`);
  }
  if (g.extra && g.state === 'ok') out.push(`o ${g.extra} ${lidiN(g.extra)} víc, než je potřeba`);
  return out.join('; ');
}
function renderCapPlan() {
  const box = $('#cpView');
  if (!box || !S) return;
  const gs = S.positions.filter(isGroup);
  if (!gs.length) {
    box.innerHTML = `<div class="card">${emptyState('Žádné skupiny', 'Plán kapacit počítá se skupinami z Matice dovedností a s hodnocením dovedností lidí. Nejdřív skupiny založ.', '<button class="btn" type="button" data-cpgo="groups">Skupiny a pravidla</button>')}</div>`;
    return;
  }
  const all = capPlanAll();
  const t = all.tot;
  const pres = all.pres;
  const tiles = `<div class="stats">${[
    statTile('Potřeba', String(t.need.n), `${all.setN} z ${gs.length} ${gs.length === 1 ? 'skupiny' : 'skupin'} s plánem`),
    statTile('Máme', String(t.have.n), t.sick ? `ve skupinách s plánem, z toho nemocní ${t.sick}` : 'lidí ve skupinách s plánem', '', { bar: t.need.n ? t.have.n / t.need.n : null }),
    ...(pres ? [statTile('Ø v práci', nf(t.pres || 0, 1), `podle docházky, ${pres.days} ${pres.days === 1 ? 'pracovní den' : pres.days <= 4 ? 'pracovní dny' : 'pracovních dní'}`)] : []),
    statTile('Doplnit', String(t.hire), t.hire ? `${lidiAcc(t.hire)} náborem` : 'nábor není potřeba', t.hire ? 'crit' : all.setN ? 'good' : ''),
    statTile('Doškolit', String(t.trainN), t.trainN ? `${lidiAcc(t.trainN)} na vyšší úroveň` : 'zkušenosti stačí', t.trainN ? 'warn' : all.setN ? 'good' : ''),
    statTile('Skupiny v pořádku', `${all.okN}<em>/ ${all.setN}</em>`, all.setN ? 'potřeba pokrytá lidmi i zkušenostmi' : 'zatím bez plánu', all.setN && all.okN === all.setN ? 'good' : '', { bar: all.setN ? all.okN / all.setN : null }),
  ].join('')}</div>`;
  const head = `<thead><tr><th rowspan="2">Skupina</th><th colspan="4" class="c cp-need-h">Potřeba</th><th colspan="4" class="c">Máme</th>${pres ? '<th rowspan="2" class="r" title="Průměrný počet lidí skupiny v práci podle docházky z KPI">Ø v práci</th>' : ''}<th rowspan="2" class="r">Doplnit</th><th rowspan="2" class="r">Doškolit</th><th rowspan="2">Stav</th></tr>
    <tr>${CP_COLS.map(c => `<th class="r cp-need-h" title="${esc(c[2])}">${c[1]}</th>`).join('')}${CP_COLS.map(c => `<th class="r" title="${esc(c[2])}">${c[1]}</th>`).join('')}</tr></thead>`;
  const row = g => {
    const id = g.p.id;
    return `<tr class="cp-row cp-${g.state}" data-cpg="${esc(id)}">
      <td class="name" data-label="Skupina"><b>${esc(g.p.name || '(bez názvu)')}</b><small class="muted">${g.have.n} ${lidiN(g.have.n)}${g.sick ? `, nemocní ${g.sick}` : ''}${groupSkills(g.p).length ? '' : ', bez dovedností'}</small></td>
      ${CP_COLS.map(([k, l, tt]) => `<td class="r cp-need" data-label="Potřeba ${l}"><input type="number" inputmode="numeric" min="0" max="500" step="1" id="cp-${esc(id)}-${k}" data-cpn="${k}" value="${g.need[k] || ''}" placeholder="0" aria-label="${esc(`${g.p.name}: potřeba ${tt.toLowerCase()}`)}"></td>`).join('')}
      ${CP_COLS.map(([k, l]) => `<td class="r num${g.set && g.have[k] < g.need[k] ? ' cp-short' : ''}" data-label="Máme ${l}">${g.have[k]}</td>`).join('')}
      ${pres ? `<td class="r num" data-label="Ø v práci">${g.pres == null ? '—' : nf(g.pres, 1)}</td>` : ''}
      <td class="r num" data-label="Doplnit">${g.hire ? `<b class="crit-t">+${g.hire}</b>` : '<span class="muted">—</span>'}</td>
      <td class="r num" data-label="Doškolit">${g.trainN ? `<b class="warn-t">${g.trainN}</b>` : '<span class="muted">—</span>'}</td>
      <td data-label="Stav">${cpStateChip(g.state)}</td></tr>`;
  };
  const depts = all.depts.map(d => {
    const many = d.groups.length > 1;
    const recs = d.groups.filter(g => g.state === 'hire' || g.state === 'train');
    const dt = d.tot;
    return `<div class="card cp-dept"><div class="card-head"><div><h3>${esc(d.dept || 'Bez oddělení')}</h3>
      <p class="small muted">Potřeba ${dt.need.n} · máme ${dt.have.n}${dt.hire ? ` · <b class="crit-t">doplnit ${dt.hire}</b>` : ''}${dt.trainN ? ` · <b class="warn-t">doškolit ${dt.trainN}</b>` : ''}</p></div></div>
      <div class="table-card flat"><table class="stack cp-table">${head}<tbody>${d.groups.map(row).join('')}
      ${many ? `<tr class="cp-sum"><td class="name" data-label="Skupina"><b>Celkem ${esc(d.dept || '')}</b></td>${CP_COLS.map(([k, l]) => `<td class="r num" data-label="Potřeba ${l}">${dt.need[k]}</td>`).join('')}${CP_COLS.map(([k, l]) => `<td class="r num" data-label="Máme ${l}">${dt.have[k]}</td>`).join('')}${pres ? `<td class="r num" data-label="Ø v práci">${dt.pres == null ? '—' : nf(dt.pres, 1)}</td>` : ''}<td class="r num" data-label="Doplnit">${dt.hire || '—'}</td><td class="r num" data-label="Doškolit">${dt.trainN || '—'}</td><td></td></tr>` : ''}</tbody></table></div>
      ${recs.length ? `<ul class="cp-recs">${recs.map(g => `<li><b>${esc(g.p.name)}</b>: ${cpRecHtml(g)}</li>`).join('')}</ul>` : ''}</div>`;
  }).join('');
  box.innerHTML = `${tiles}
    ${all.setN ? '' : '<div class="note i"><b>Začni potřebou:</b> u skupiny vyplň, kolik lidí potřebuješ celkem a kolik z nich aspoň na úrovni 2, 3 a 4. Hned uvidíš, kolik lidí doplnit a koho doškolit.</div>'}
    <p class="hint cp-legend">Úroveň člověka je procento dovedností jeho skupiny v Matici: <b>2</b> ${esc(cpLvName(2))} = aspoň 50 %, <b>3</b> ${esc(cpLvName(3))} = aspoň 75 %, <b>4</b> ${esc(cpLvName(4))} = 100 %. Počty se sčítají shora (kdo má 4, je i ve 3+ a 2+). Doškolit jde jen lidi skupiny pod úrovní; navrženi jsou ti, kdo mají k cíli nejblíž.${pres ? ` Ø v práci je průměr z docházky v KPI za ${pres.days} ${pres.days === 1 ? 'pracovní den' : pres.days <= 4 ? 'pracovní dny' : 'pracovních dní'} (${esc(dayText(pres.from))} – ${esc(dayText(pres.to))}).` : ''}</p>
    ${depts}
    <div class="card"><h3>Poznámka k plánu</h3><p class="small muted">Uloží se a vytiskne s plánem (např. termíny náboru a zaškolení).</p>
      <textarea id="cpNote" rows="3" maxlength="4000" placeholder="např. Nábor 2 brusičů do konce listopadu, zaučit Nováka na Seřízení.">${esc(S.capPlan.note)}</textarea></div>`;
  setWidths(box);
}
/* ---------- PDF plánu kapacit (2.44.2): jedno oddělení = jeden list A4 na výšku ----------
   Bez jmen i ID, skoro bez textu: záhlaví se stavem, dlaždice (potřeba, máme, doplnit,
   doškolit), skupiny jako pruhy podle zkušenosti proti potřebě, odchody po měsících (tečka =
   člověk v barvě úrovně) a kolik lidí zůstane proti potřebě. Kreslí stejné ctrPdf jako KPI. */
const CP_LV = [[4, '#0F2F5A', 'Úroveň 4'], [3, '#1F4E8C', '3'], [2, '#7C9CC8', '2'], [0, '#F2C77E', 'pod 2']];
const CP_LV_INK = { 4: '#FFFFFF', 3: '#FFFFFF', 2: '#1A2330', 0: '#1A2330' };
/* přesné počty podle úrovně z kumulativních „aspoň“ (n, l2, l3, l4) */
const cpExact = x => ({ 4: x.l4, 3: x.l3 - x.l4, 2: x.l2 - x.l3, 0: x.n - x.l2 });
/* oddělení do PDF: s lidmi nebo s plánem */
function cpPdfDepts(all) { return all.depts.filter(d => d.groups.some(g => g.members.length || g.set)); }
const CP_MON = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
function cpMonthShort(id, first) {
  const t = CP_MON[+id.slice(5, 7) - 1];
  return { t, y: first || id.slice(5) === '01' ? id.slice(0, 4) : '' };
}
/* barva roku (2.45.3): sudý rok modře, lichý zeleně (2026 modře, 2027 zeleně) */
const cpYearC = id => (+String(id).slice(0, 4) % 2 ? 'green' : 'blue');
/* osa let pod popisky měsíců: barevná linka přes měsíce roku a rok uprostřed */
function cpYearAxis(P, cols, x0, cw, y) {
  let i = 0;
  while (i < cols.length) {
    const m = cols[i].m;
    if (!m) { i += 1; continue; }
    let j = i;
    while (j + 1 < cols.length && cols[j + 1].m && cols[j + 1].m.slice(0, 4) === m.slice(0, 4)) j += 1;
    const c = cpYearC(m);
    const a = x0 + cw * i + 6;
    const b = x0 + cw * (j + 1) - 6;
    P.box(a, y, b - a, 4, { fill: c, r: 2 });
    P.text(m.slice(0, 4), (a + b) / 2, y + 22, 12, { b: true, c, a: 'middle', mono: true });
    i = j + 1;
  }
}
/* 1. strana PDF (2.45.3): manažerský přehled – ohrožené měsíce, potřeba lidí po měsících
   a křivka vývoje počtu lidí proti potřebě, pod ní oddělení × měsíce. */
function cpOverviewPdf(P, o) {
  const X = 64, W = 1152, R = X + W;
  const t = o.tot;
  P.text(`${EXPORT_NAME} · PLÁN KAPACIT`, X, 78, 13, { b: true, c: 'faint', ls: 0.12 });
  P.text(dayText(o.today), R, 78, 13, { c: 'faint', a: 'end', mono: true });
  P.text('Manažerský přehled', X, 136, 44, { b: true });
  const [st, tone] = !o.planned ? ['BEZ PLÁNU', 'plain'] : o.riskN ? [`OHROŽENO ${o.riskN} Z ${o.ids.length} MĚSÍCŮ`, 'crit'] : ['BEZ OHROŽENÍ', 'ok'];
  const [bg, bd, , fg] = CTR_BOX[tone];
  const sw = P.width(st, 16, { b: true, ls: 0.08 }) + 40;
  P.box(R - sw, 100, sw, 46, { fill: bg, stroke: bd, r: 23, lw: 1.5 });
  P.text(st, R - sw / 2, 129, 16, { b: true, c: fg, a: 'middle', ls: 0.08 });
  P.line(X, 170, R, 170, 'line', 1.5);
  // dlaždice
  const mon = id => `${CP_MON[+id.slice(5, 7) - 1]} ${id.slice(0, 4)}`;
  const tiles = [
    ['LIDÍ TEĎ', String(t.now), 'ink', o.planned ? 'oddělení s plánem' : 'všechna oddělení'],
    ['POTŘEBA', t.need == null ? '—' : String(t.need), t.need == null ? 'faint' : 'ink', t.need == null ? 'plán není zadaný' : o.nowShort ? `teď chybí ${o.nowShort}` : 'teď splněno'],
    ['OHROŽENÉ MĚSÍCE', o.planned ? String(o.riskN) : '—', !o.planned ? 'faint' : o.riskN ? 'red' : 'green', o.first ? `první ${mon(o.first)}` : o.planned ? 'žádný' : ''],
    ['NEJNIŽŠÍ STAV', o.min ? String(o.min.v) : '—', o.min && t.need != null && o.min.v < t.need ? 'red' : 'ink', o.min ? mon(o.min.m) : ''],
  ];
  const TW = (W - 3 * 18) / 4, top = 196;
  tiles.forEach(([l, v, c, sub], i) => {
    const x = X + i * (TW + 18);
    P.box(x, top, TW, 140, { fill: '#F7F9FC', stroke: 'line', r: 14 });
    P.text(l, x + 22, top + 34, 13, { b: true, c: 'muted', ls: 0.1 });
    P.text(v, x + 22, top + 94, 52, { b: true, mono: true, c });
    if (sub) P.text(sub, x + 22, top + 122, 13, { c: 'muted' });
  });
  // trendová křivka: teď + měsíce, potřeba čárkovaně, ohrožené měsíce červeně, pod osou „chybí“
  let y = 392;
  P.text('Vývoj počtu lidí proti potřebě', X, y, 20, { b: true });
  // r = celek pod potřebou (červeně v grafu), g = kolik celku chybí, s = součet chybějících po odděleních
  const pts = [{ m: '', l: 'teď', v: t.now, g: t.nowGap, s: o.nowShort, r: t.nowGap > 0 }, ...o.ids.map((m, i) => ({ m, l: CP_MON[+m.slice(5, 7) - 1], v: t.months[i], g: t.gap[i], s: t.short[i], r: t.gap[i] > 0 }))];
  const CH = 380, T0 = y + 50, base = T0 + CH;
  const vmax = Math.max(1, t.now, t.need || 0, ...t.months);
  const vmin = Math.min(...t.months, t.need == null ? Infinity : t.need, t.now);
  const lo = Math.max(0, Math.floor(vmin * 0.8 / 5) * 5);
  const hi = Math.max(lo + 5, Math.ceil(vmax * 1.08 / 5) * 5);
  const Y = v => base - ((v - lo) / (hi - lo)) * CH;
  const cw = W / pts.length;
  const cx = i => X + cw * (i + 0.5);
  const step = Math.max(1, Math.ceil((hi - lo) / 4 / 5) * 5);
  for (let v = lo; v <= hi + 1e-9; v += step) {
    P.line(X, Y(v), R, Y(v), v === lo ? 'axis' : 'grid', v === lo ? 1.5 : 1);
    P.text(String(v), X - 10, Y(v) + 5, 12, { c: 'muted', a: 'end', mono: true });
  }
  // ohrožené měsíce: světle červený sloupec na pozadí
  pts.forEach((p, i) => { if (p.r) P.box(cx(i) - cw / 2 + 3, T0, cw - 6, CH, { fill: '#FDF0EE' }); });
  if (t.need != null) {
    P.line(X, Y(t.need), R, Y(t.need), 'green', 3, [10, 6]);
    P.text(`potřeba ${t.need}`, R, Y(t.need) - 10, 14, { b: true, c: 'green', a: 'end' });
  }
  P.poly(pts.map((p, i) => [cx(i), Y(p.v)]), 'ink', 4);
  pts.forEach((p, i) => {
    P.dot(cx(i), Y(p.v), 8, p.r ? 'red' : 'ink');
    P.dot(cx(i), Y(p.v), 3.5, 'white');
    P.text(String(p.v), cx(i), Y(p.v) - 16, 16, { b: true, mono: true, c: p.r ? 'red' : 'ink', a: 'middle' });
    P.text(p.l, cx(i), base + 26, 14, { b: i === 0 || p.r, c: p.m ? cpYearC(p.m) : 'ink', a: 'middle' });
    if (o.planned) P.text(p.g ? `−${p.g}` : '0', cx(i), base + 96, 15, { b: true, mono: true, c: p.g ? 'red' : 'green', a: 'middle' });
  });
  cpYearAxis(P, pts, X, cw, base + 36);
  if (o.planned) P.text('chybí', X - 10, base + 96, 12, { c: 'muted', a: 'end' });
  // oddělení × měsíce: kolik lidí zůstane, červeně pod potřebou
  y = base + 150;
  P.text('Oddělení po měsících', X, y, 20, { b: true });
  P.text('číslo = kolik lidí zůstane · červeně pod potřebou', R, y, 13, { c: 'muted', a: 'end' });
  y += 26;
  const LW = 250, GW = W - LW, gw = GW / pts.length;
  const rows = o.depts;
  // záhlaví: teď a měsíce v barvě roku
  pts.forEach((p, i) => P.text(p.l, X + LW + gw * (i + 0.5), y + 14, 13, { b: true, c: p.m ? cpYearC(p.m) : 'ink', a: 'middle' }));
  y += 26;
  const rh = Math.max(26, Math.min(48, (P.PH - 200 - y) / Math.max(1, rows.length + 1)));
  rows.forEach(d => {
    P.text(P.split(d.name, 15, LW - 14, { b: true })[0], X, y + rh / 2 + 2, 15, { b: true });
    P.text(d.set ? `potřeba ${d.need}` : 'bez plánu', X, y + rh / 2 + 18, 11, { c: d.set ? 'muted' : 'faint' });
    [d.now, ...d.months].forEach((v, i) => {
      const short = d.set && v < d.need;
      const fill = !d.set ? '#F2F4F8' : short ? '#F6D5D0' : '#E3F1E7';
      P.box(X + LW + gw * i + 2, y + 2, gw - 4, rh - 4, { fill, r: 4 });
      P.text(String(v), X + LW + gw * (i + 0.5), y + rh / 2 + 6, 15, { b: short, mono: true, c: !d.set ? 'muted' : short ? 'red' : 'green', a: 'middle' });
    });
    y += rh;
  });
  // chybí po odděleních: součet lidí, kteří chybějí v odděleních pod potřebou
  if (o.planned) {
    P.line(X, y + 4, R, y + 4, 'line', 1);
    P.text('chybí', X, y + 30, 15, { b: true });
    P.text('součet po odděleních', X, y + 46, 11, { c: 'muted' });
    pts.forEach((p, i) => P.text(p.s ? `−${p.s}` : '0', X + LW + gw * (i + 0.5), y + 34, 15, { b: true, mono: true, c: p.s ? 'red' : 'green', a: 'middle' }));
    y += 56;
  }
  // legenda
  y += 34;
  let lx = X;
  [['#E3F1E7', 'potřeba splněna'], ['#F6D5D0', 'pod potřebou'], ['#F2F4F8', 'bez plánu']].forEach(([c, l]) => {
    P.box(lx, y - 14, 18, 18, { fill: c, r: 4 });
    P.text(l, lx + 26, y, 14, { c: 'muted' });
    lx += 26 + P.width(l, 14) + 30;
  });
  P.line(lx, y - 5, lx + 34, y - 5, 'green', 3, [8, 5]);
  P.text('potřeba', lx + 44, y, 14, { c: 'muted' });
  lx += 44 + P.width('potřeba', 14) + 30;
  ['2026', '2027'].forEach(yr => { const c = cpYearC(yr); P.box(lx, y - 7, 24, 4, { fill: c, r: 2 }); P.text(yr, lx + 32, y, 14, { b: true, c, mono: true }); lx += 32 + P.width(yr, 14, { mono: true }) + 26; });
}
/* stav oddělení do štítku v záhlaví */
function cpDeptState(d) {
  const set = d.groups.some(g => g.set);
  if (!set) return ['BEZ PLÁNU', 'plain'];
  if (d.tot.hire) return [`DOPLNIT ${d.tot.hire}`, 'crit'];
  if (d.tot.trainN) return [`DOŠKOLIT ${d.tot.trainN}`, 'warn'];
  return ['V POŘÁDKU', 'ok'];
}
/* vodorovný pruh po úrovních: x, y, šířka na člověka, výška; čísla uvnitř, když se vejdou */
function cpPdfStack(P, ex, x, y, unit, h, num) {
  let cx = x;
  CP_LV.forEach(([lv, c]) => {
    const n = ex[lv] || 0;
    if (n <= 0) return;
    const w = n * unit;
    P.box(cx, y, w, h, { fill: c });
    if (num && w >= 26) P.text(String(n), cx + w / 2, y + h / 2 + 6, 16, { b: true, mono: true, c: CP_LV_INK[lv], a: 'middle' });
    cx += w;
  });
  return cx;
}
function cpDeptPdf(P, d, today, page) {
  const { doc } = P;
  if (page > 1) doc.addPage('a4', 'portrait');
  const X = 64;
  const W = 1152;
  const R = X + W;
  const set = d.groups.some(g => g.set);
  const t = d.tot;
  // záhlaví
  P.text(`${EXPORT_NAME} · PLÁN KAPACIT`, X, 78, 13, { b: true, c: 'faint', ls: 0.12 });
  P.text(dayText(today), R, 78, 13, { c: 'faint', a: 'end', mono: true });
  P.text(d.dept || 'Bez oddělení', X, 136, 44, { b: true });
  const [st, tone] = cpDeptState(d);
  const [bg, bd, , fg] = CTR_BOX[tone];
  const sw = P.width(st, 16, { b: true, ls: 0.08 }) + 40;
  P.box(R - sw, 100, sw, 46, { fill: bg, stroke: bd, r: 23, lw: 1.5 });
  P.text(st, R - sw / 2, 129, 16, { b: true, c: fg, a: 'middle', ls: 0.08 });
  P.line(X, 170, R, 170, 'line', 1.5);
  // dlaždice
  const TW = (W - 3 * 18) / 4;
  const top = 196;
  const scale = Math.max(1, t.need.n, t.have.n);
  const tiles = [
    { l: 'POTŘEBA', v: set ? String(t.need.n) : '—', ex: set ? cpExact(t.need) : null },
    { l: 'MÁME', v: String(t.have.n), ex: cpExact(t.have), c: set && t.have.n < t.need.n ? 'red' : 'ink' },
    { l: 'DOPLNIT', v: set ? (t.hire ? `+${t.hire}` : '0') : '—', c: !set ? 'faint' : t.hire ? 'red' : 'green' },
    { l: 'DOŠKOLIT', v: set ? String(t.trainN) : '—', c: !set ? 'faint' : t.trainN ? 'amber' : 'green' },
  ];
  tiles.forEach((k, i) => {
    const x = X + i * (TW + 18);
    P.box(x, top, TW, 140, { fill: '#F7F9FC', stroke: 'line', r: 14 });
    P.text(k.l, x + 22, top + 34, 13, { b: true, c: 'muted', ls: 0.1 });
    P.text(k.v, x + 22, top + 92, 52, { b: true, mono: true, c: k.c || 'ink' });
    if (k.ex) {
      P.box(x + 22, top + 112, TW - 44, 10, { fill: 'track', r: 5 });
      cpPdfStack(P, k.ex, x + 22, top + 112, (TW - 44) / scale, 10, false);
    }
  });
  // skupiny: pruh po úrovních, potřeba čárkovaně
  let y = 392;
  P.text('Skupiny podle zkušenosti', X, y, 20, { b: true });
  const gs = d.groups;
  const gmax = Math.max(1, ...gs.map(g => Math.max(g.have.n, g.need.n)));
  const NX = X;
  const BX = X + 250;
  const BW = W - 250 - 110;
  const rh = Math.max(36, Math.min(62, 400 / Math.max(1, gs.length)));
  const bh = Math.min(30, rh - 14);
  y += 28;
  gs.forEach(g => {
    const cy = y + rh / 2;
    const name = P.split(g.p.name || '(bez názvu)', 17, 236, { b: true })[0];
    P.text(name, NX, cy + 6, 17, { b: true });
    P.box(BX, cy - bh / 2, BW, bh, { fill: '#F2F4F8', r: 4 });
    cpPdfStack(P, cpExact(g.have), BX, cy - bh / 2, BW / gmax, bh, true);
    if (g.set) {
      const nx = BX + (g.need.n / gmax) * BW;
      P.line(nx, cy - bh / 2 - 8, nx, cy + bh / 2 + 8, 'green', 4, [6, 4]);
    }
    const short = g.set && g.have.n < g.need.n;
    P.text(g.set ? `${g.have.n}/${g.need.n}` : String(g.have.n), R, cy + 7, 20, { b: true, mono: true, a: 'end', c: short ? 'red' : g.set ? 'green' : 'ink' });
    y += rh;
  });
  // odchody po měsících: tečka = člověk v barvě úrovně
  const ends = capPlanEnds(d, today, 12);
  const cols = [...(ends.overdueN ? [{ k: 'od', lbl: { t: 'po', y: 'termínu' }, ex: ends.overdue, n: ends.overdueN }] : []),
    ...ends.months.map((m, i) => ({ k: m.m, lbl: cpMonthShort(m.m, i === 0), ex: m.leave, n: m.leaveN }))];
  y += 60;
  P.text('Kdy lidé končí', X, y, 20, { b: true });
  const maxN = Math.max(1, ...cols.map(c => c.n));
  const CH = Math.max(110, Math.min(260, maxN * 26 + 50));
  const base = y + 40 + CH;
  const cw = W / cols.length;
  const pitch = Math.min(26, (CH - 40) / maxN);
  const r = Math.max(3, Math.min(10, pitch / 2 - 1.5));
  P.line(X, base, R, base, 'axis', 1.5);
  cols.forEach((c, i) => {
    const cx = X + cw * (i + 0.5);
    let k = 0;
    CP_LV.forEach(([lv, col]) => {
      for (let j = 0; j < (c.ex[lv] || 0); j += 1) { P.dot(cx, base - 4 - r - k * pitch, r, col); k += 1; }
    });
    if (c.n) P.text(String(c.n), cx, base - 14 - k * pitch, 16, { b: true, mono: true, c: c.k === 'od' ? 'red' : 'ink', a: 'middle' });
    P.text(c.lbl.t, cx, base + 26, 14, { b: !!c.n, c: c.k === 'od' ? 'red' : cpYearC(c.k), a: 'middle' });
    if (c.k === 'od') P.text(c.lbl.y, cx, base + 44, 11, { c: 'red', a: 'middle' });
  });
  cpYearAxis(P, cols.map(c => ({ m: c.k === 'od' ? '' : c.k })), X, cw, base + 36);
  // kolik zůstane: sloupec po úrovních, potřeba čárkovaně
  y = base + 96;
  P.text('Kolik lidí zůstane', X, y, 20, { b: true });
  const rcols = [{ m: '', lbl: { t: 'teď', y: '' }, ex: ends.now, n: ends.nowN }, ...ends.months.map((m, i) => ({ m: m.m, lbl: cpMonthShort(m.m, i === 0), ex: m.remain, n: m.remainN }))];
  const RH = Math.max(220, Math.min(460, P.PH - 150 - (y + 50) - 92));
  const rbase = y + 50 + RH;
  const rmax = Math.max(1, ends.nowN, set ? t.need.n : 0);
  const unit = (RH - 30) / rmax;
  const rw = W / rcols.length;
  const bw = Math.min(56, rw * 0.62);
  P.line(X, rbase, R, rbase, 'axis', 1.5);
  rcols.forEach((c, i) => {
    const cx = X + rw * (i + 0.5);
    let yy = rbase;
    CP_LV.forEach(([lv, col]) => {
      const n = c.ex[lv] || 0;
      if (!n) return;
      P.box(cx - bw / 2, yy - n * unit, bw, n * unit, { fill: col });
      yy -= n * unit;
    });
    const short = set && c.n < t.need.n;
    P.text(String(c.n), cx, yy - 10, 16, { b: true, mono: true, c: short ? 'red' : 'ink', a: 'middle' });
    P.text(c.lbl.t, cx, rbase + 26, 14, { b: i === 0, c: c.m ? cpYearC(c.m) : 'ink', a: 'middle' });
  });
  cpYearAxis(P, rcols, X, rw, rbase + 36);
  if (set) {
    const ny = rbase - t.need.n * unit;
    P.line(X, ny, R, ny, 'green', 3, [10, 6]);
  }
  // legenda
  let lx = X;
  const ly = rbase + 92;
  CP_LV.forEach(([, c, l]) => {
    P.box(lx, ly - 14, 18, 18, { fill: c, r: 4 });
    P.text(l, lx + 26, ly, 14, { c: 'muted' });
    lx += 26 + P.width(l, 14) + 30;
  });
  P.line(lx, ly - 5, lx + 34, ly - 5, 'green', 3, [8, 5]);
  P.text('potřeba', lx + 44, ly, 14, { c: 'muted' });
}
async function exportCapPlanPdf(button) {
  const all = capPlanAll();
  const depts = cpPdfDepts(all);
  if (!depts.length) { toast('Nejdřív založ skupiny v Matici dovedností a zařaď do nich lidi.', true); return; }
  const today = todayIso();
  await withPdf(button, doc => {
    doc.setProperties({ title: 'Plán kapacit', creator: EXPORT_NAME });
    const P = ctrPdf(doc);
    cpOverviewPdf(P, capPlanOutlook(all, today, 12));
    depts.forEach(d => cpDeptPdf(P, d, today, 2));
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i += 1) {
      doc.setPage(i);
      P.text(`${EXPORT_NAME} · Plán kapacit`, 64, P.PH - 30, 11, { c: 'faint' });
      P.text(`${i} / ${n}`, 1216, P.PH - 30, 11, { c: 'faint', a: 'end' });
    }
    downloadFile(`plan-kapacit-${today}.pdf`, doc.output('blob'), 'application/pdf');
  }, 'portrait', { mono: true });
}
async function exportCapPlanXlsx() {
  const all = capPlanAll();
  try {
    const X = await xlsx();
    const wb = X.utils.book_new();
    const head = ['Oddělení', 'Skupina', 'Potřeba celkem', 'Potřeba 2+', 'Potřeba 3+', 'Potřeba 4', 'Máme celkem', 'Máme 2+', 'Máme 3+', 'Máme 4', 'Nemocní', ...(all.pres ? ['Ø v práci'] : []), 'Doplnit', 'Doškolit', 'Stav'];
    const rows = all.groups.map(g => [g.p.dept || '', g.p.name || '', g.need.n, g.need.l2, g.need.l3, g.need.l4, g.have.n, g.have.l2, g.have.l3, g.have.l4, g.sick, ...(all.pres ? [g.pres == null ? '' : g.pres] : []), g.hire, g.trainN, CP_STATE[g.state][0]]);
    const cand = all.groups.flatMap(g => g.cand.map(c => [g.p.dept || '', g.p.name || '', c.e.wid || 'bez ID', Math.round((c.pct || 0) * 10) / 10, c.to, Math.round(c.miss * 10) / 10]));
    [{ name: 'Plán', cols: [18, 20, 9, 9, 9, 9, 9, 9, 9, 9, 8, ...(all.pres ? [9] : []), 8, 8, 13], rows: [head, ...rows] },
      { name: 'Doškolit', cols: [18, 20, 12, 14, 12, 12], rows: [['Oddělení', 'Skupina', 'ID zaměstnance', 'Dovednosti (%)', 'Cílová úroveň', 'Chybí (%)'], ...cand] }].forEach(sheet => {
      const ws = X.utils.aoa_to_sheet(sheet.rows.map(r => r.map(safeCell)));
      ws['!cols'] = sheet.cols.map(wch => ({ wch }));
      X.utils.book_append_sheet(wb, ws, sheet.name);
    });
    downloadFile(`plan-kapacit-${todayIso()}.xlsx`, new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch (error) { toast(`Export se nepovedl: ${error.message}`, true); }
}
function bindCapPlan() {
  const view = $('#cpView');
  $('#cpPdf').onclick = event => exportCapPlanPdf(event.currentTarget);
  $('#cpXlsx').onclick = () => exportCapPlanXlsx();
  view.addEventListener('change', event => {
    const t = event.target;
    if (t.dataset.cpn) {
      const id = t.closest('[data-cpg]').dataset.cpg;
      const v = t.value.trim() === '' ? 0 : Number(t.value);
      if (!Number.isFinite(v) || v < 0 || v > CP_MAX) { toast(`Počet lidí je 0 až ${CP_MAX}.`, true); renderCapPlan(); return; }
      setCapNeed(id, { [t.dataset.cpn]: Math.round(v) });
      Object.assign(S.capPlan, { at: Date.now(), by: ui.me.label || '' });
      // fokus zůstane v poli, kam uživatel přešel (Tab), i po překreslení
      const go = document.activeElement && document.activeElement.id;
      save();
      renderCapPlan();
      if (go) { const f = document.getElementById(go); if (f) { f.focus({ preventScroll: true }); if (f.select) f.select(); } }
      return;
    }
    if (t.id === 'cpNote') { S.capPlan.note = t.value.slice(0, 4000); save(); }
  });
  view.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.dataset.cpn) { event.preventDefault(); event.target.blur(); }
  });
  view.addEventListener('click', event => {
    const p = event.target.closest('[data-cpperson]');
    if (p) { openProfile(p.dataset.cpperson); return; }
    if (event.target.closest('[data-cpgo]')) { ui.mxTab = 'groups'; showView('matice'); }
  });
}

