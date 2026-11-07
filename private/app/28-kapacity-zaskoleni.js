/* ==========================================================================
   KAPACITY A ZAŠKOLENÍ (2.30, vzhled 2.31): export od–do podle vzoru uživatele
   Dny s docházkou jsou vykázané (kdo přišel, kolik odpracoval), ostatní plánované (dnešní
   zařazení a směny). Zaškolení a v zácviku podle historie hodnocení, výpočet capTimeline v core.
   Stránky jsou jako ve vzoru „Report docházky“: měsíční souhrn zaškolenosti a výkonu, týdenní
   souhrn s požadavkem a na konci vývoj zaškolení. Obsah stránky skládá ctrMonth / ctrWeek / ctrDev
   jednou a kreslí ho pohled v aplikaci (ctrHtml) i PDF (pdfCtrPage). Grafy jsou společné značky
   v souřadnicích vzoru (ctrSvg, pdfCtrChart). Rozměry v px vzoru (šířka 1280), PDF A4 na výšku
   v měřítku 210/1280 mm. Barvy v modelu jsou klíče CTR, v HTML třídy c-<klíč>.
   ========================================================================== */
const WA_CT_PRE = [['m', 'Tento měsíc'], ['b3', '3 měsíce zpět a 1 dopředu'], ['n2', 'Od dneška 2 měsíce']];
function waMonthAdd(m, n) {
  let [y, mm] = m.split('-').map(Number);
  mm += n;
  while (mm > 12) { mm -= 12; y += 1; }
  while (mm < 1) { mm += 12; y -= 1; }
  return `${y}-${String(mm).padStart(2, '0')}`;
}
function waCtRange() {
  const t = todayIso();
  const m0 = t.slice(0, 7);
  if (ui.wa.ctPre === 'custom' && WA_ISO.test(ui.wa.ctFrom) && WA_ISO.test(ui.wa.ctTo)) return { from: ui.wa.ctFrom, to: ui.wa.ctTo };
  if (ui.wa.ctPre === 'm') return { from: `${m0}-01`, to: waLastDay(m0) };
  if (ui.wa.ctPre === 'n2') return { from: t, to: waLastDay(waMonthAdd(m0, 2)) };
  return { from: `${waMonthAdd(m0, -3)}-01`, to: waLastDay(waMonthAdd(m0, 1)) };
}
const CTR = { ink: '#1A2330', muted: '#4A5565', faint: '#6B7686', line: '#D5DBE3', grid: '#E6EAF0', axis: '#A9B3C0',
  blue: '#1F4E8C', blueL: '#B9CBE6', amberF: '#F2C77E', amber: '#9A5B00', amberL: '#C07A10', green: '#1E6B3A', red: '#B42318', track: '#E6EDF7', white: '#FFFFFF' };
/* rámečky v záhlaví: pozadí, okraj, popisek, hodnota */
const CTR_BOX = { plain: ['#FFFFFF', '#D5DBE3', '#4A5565', '#1F4E8C'], blue: ['#F0F4FA', '#B9C9E2', '#1F4E8C', '#1F4E8C'],
  ok: ['#EEF8F1', '#A8D5B5', '#1E6B3A', '#1E6B3A'], warn: ['#FFF4E0', '#E8C27A', '#9A5B00', '#9A5B00'], crit: ['#FDF0EE', '#EBB8B0', '#B42318', '#B42318'] };
const CTR_STATE_C = { ok: 'green', warn: 'amber', crit: 'red' };
const ctrPct = v => (v == null ? '—' : `${nf(v * 100, 0)} %`);
const ctrSign = v => (v == null ? '—' : v > 0 ? `+${nf(v, 1)}` : v < 0 ? `−${nf(-v, 1)}` : '0');
const ctrCap = t => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '');
const ctrMon = id => MONL[+id.slice(5, 7) - 1];
const CTR_MON_DAT = ['lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu', 'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci'];
const ctrMonDat = id => CTR_MON_DAT[+id.slice(5, 7) - 1];   // „proti září“, „proti červnu“
function ctrMix(hex, f) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).map(v => Math.round(v * f + 255 * (1 - f)));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
function ctrRange(from, to) { return from.slice(0, 4) === to.slice(0, 4) ? `${dayText(from, false)} – ${dayText(to)}` : `${dayText(from)} – ${dayText(to)}`; }
function ctrRep() { return (S.workAudit && S.workAudit.rep) || { place: '', firm: '' }; }
function ctrTitle() { const p = ctrRep().place; return `Report docházky${p ? ` — ${p}` : ''}`; }
function ctrSub(...parts) { return [EXPORT_NAME, ctrRep().firm, ...parts].filter(Boolean).join(' · '); }
const ctrDay = d => `${DOW[d.day.dow]} ${d.day.d}.`;
/* Dny do věty: souvislá řada „Po 12. – St 14.“, jinak výčet. */
function ctrDayList(list, all) {
  if (!list.length) return '';
  const idx = list.map(d => all.indexOf(d));
  const run = idx.every((v, i) => !i || v === idx[i - 1] + 1);
  return run && list.length > 1 ? `${ctrDay(list[0])} – ${ctrDay(list[list.length - 1])}` : list.map(ctrDay).join(', ');
}
/* Osa y: pěkný krok (nejvýš čtyři dílky nad nulou) a nad nejvyšší hodnotou místo na popisek, jako vzor. */
function ctrAxis(max) {
  const v = Math.max(1, max) * 1.06;
  const u = 10 ** Math.max(0, Math.floor(Math.log10(v)) - 1);
  const D = Math.ceil(v / u) * u;
  const pow = 10 ** Math.floor(Math.log10(D / 4));
  const step = [1, 2, 5, 10].map(f => f * pow).find(st => D / st <= 4 + 1e-9);
  const ticks = [];
  for (let t = 0; t <= D + 1e-9; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return { D, ticks };
}
function ctrGrid(marks, ax, y, L, R, lx) {
  marks.push({ t: 'line', x1: L, y1: y(0), x2: R, y2: y(0), c: CTR.axis });
  ax.ticks.forEach(v => {
    if (v) marks.push({ t: 'line', x1: L, y1: y(v), x2: R, y2: y(v), c: CTR.grid });
    marks.push({ t: 'text', x: lx, y: y(v) + 4, s: 12, c: CTR.muted, a: 'end', v: nf(v, 1) });
  });
}

/* ---------- grafy (značky v souřadnicích vzoru) ---------- */
/* Lidé ve skupinách po měsících: 640 × 260, osa y = 220, zaškolení dole, v zácviku nahoře. */
/* W = šířka viewBoxu: 640 vedle grafu výkonu, 1280 sám (PDF bez výkonu) */
function ctrStackChart(r, W = 640) {
  const B = 220, T = 20, L = 40, R = W - 10;
  const thisM = todayIso().slice(0, 7);
  const ms = r.ids.map((id, i) => ({ id, m: r.months[i] }));
  const ax = ctrAxis(Math.max(0, ...ms.map(o => (o.m ? o.m.roster.tot.n : 0))));
  const y = v => B - (v / ax.D) * (B - T);
  const band = (R - L) / ms.length;
  const marks = [];
  ctrGrid(marks, ax, y, L, R, L - 8);
  const tips = [];
  ms.forEach((o, i) => {
    const cx = L + band * (i + 0.5);
    const bw = Math.min(100, band * 0.56);
    const cur = o.id === r.month;
    const plan = o.id > thisM;
    if (o.m && o.m.roster.tot.n) {
      const t = o.m.roster.tot;
      const yOk = y(t.ok);
      const yTop = y(t.n);
      if (t.tr) marks.push({ t: 'rect', x: cx - bw / 2, y: yTop, w: bw, h: yOk - yTop, c: plan ? ctrMix(CTR.amberF, 0.5) : CTR.amberF });
      if (t.ok) marks.push({ t: 'rect', x: cx - bw / 2, y: yOk, w: bw, h: B - yOk, c: plan ? ctrMix(CTR.blue, 0.5) : CTR.blue });
      marks.push({ t: 'text', x: cx, y: yTop - 8, s: 13, b: true, c: CTR.ink, a: 'middle', v: String(t.n) });
      if (t.tr && yOk - yTop >= 18) marks.push({ t: 'text', x: cx, y: yOk - 6, s: 12, b: true, c: CTR.blue, a: 'middle', v: String(t.ok) });
      const at = o.m.roster.past ? `stav k ${dayText(o.m.roster.iso)}` : `dnešní matice dovedností (${dayText(todayIso())})`;
      tips.push({ t: 'hit', x: L + band * i, y: T, w: band, h: B - T, tip: `${ctrCap(monthLabel(o.id))}: ${t.n} ${lidiN(t.n)} ve skupinách, ${t.ok} zaškolených (${ctrPct(t.ok / t.n)}), ${t.tr} v zácviku · ${at}` });
    }
    marks.push({ t: 'text', x: cx, y: 242, s: 13, b: cur, c: cur ? CTR.ink : CTR.muted, a: 'middle', v: ctrCap(ctrMon(o.id)) + (plan ? ' · plán' : '') });
  });
  const lab = ms.map(o => (o.m ? `${ctrMon(o.id)} ${o.m.roster.tot.n} (${o.m.roster.tot.ok} zaškolených)` : '')).filter(Boolean).join(', ');
  return { vb: [W, 260], marks: marks.concat(tips), aria: `Počet lidí po měsících: ${lab}` };
}
/* Výkon na odpracovaný den (index): tři čáry po měsících, popisky u posledního bodu. */
function ctrPerfChart(r) {
  const B = 220, T = 20, L = 40, R = 630;
  const SER = [['ok', CTR.blue, CTR.blue, 'zaškolení'], ['tr', CTR.amberL, CTR.amber, 'v zácviku'], ['all', CTR.ink, CTR.ink, 'celkem']];
  const val = (m, k) => (m && m.perf && m.perf.idx ? m.perf.idx.tot[k] : null);
  const vals = SER.map(([k]) => r.months.map(m => val(m, k)));
  const all = vals.flat().filter(v => v != null);
  const band = (R - L) / r.ids.length;
  const cx = i => L + band * (i + 0.5);
  const marks = [];
  const xl = () => r.ids.forEach((id, i) => marks.push({ t: 'text', x: cx(i), y: 242, s: 13, b: id === r.month, c: id === r.month ? CTR.ink : CTR.muted, a: 'middle', v: ctrCap(ctrMon(id)) }));
  if (!all.length) {
    marks.push({ t: 'line', x1: L, y1: B, x2: R, y2: B, c: CTR.axis });
    marks.push({ t: 'text', x: (L + R) / 2, y: 124, s: 13, c: CTR.faint, a: 'middle', v: 'Bez výkonů za tyto měsíce (Nahrát docházku a výkony), výkon se nepočítá.' });
    xl();
    return { vb: [640, 260], marks, aria: 'Výkon: bez výkonů' };
  }
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  const span = Math.max(hi - lo, 10);
  const pow = 10 ** Math.floor(Math.log10(span / 4));
  const step = [1, 2, 5, 10].map(f => f * pow).find(st => span / st <= 4 + 1e-9);
  lo = Math.max(0, Math.floor((lo - step * 0.25) / step) * step);
  hi = Math.ceil((hi + step * 0.25) / step) * step;
  const y = v => B - ((v - lo) / (hi - lo)) * (B - T);
  marks.push({ t: 'line', x1: L, y1: B, x2: R, y2: B, c: CTR.axis });
  for (let v = lo; v <= hi + 1e-9; v += step) {
    if (v > lo) marks.push({ t: 'line', x1: L, y1: y(v), x2: R, y2: y(v), c: CTR.grid });
    marks.push({ t: 'text', x: L - 8, y: y(v) + 4, s: 12, c: CTR.muted, a: 'end', v: nf(v, 1) });
  }
  SER.forEach(([, c], si) => {
    const pts = vals[si].map((v, i) => (v == null ? null : [cx(i), y(v)]));
    let seg = [];
    const flush = () => { if (seg.length > 1) marks.push({ t: 'poly', pts: seg, c, w: 3 }); seg = []; };
    pts.forEach(p => { if (p) seg.push(p); else flush(); });
    flush();
  });
  SER.forEach(([, c], si) => vals[si].forEach((v, i) => { if (v != null) marks.push({ t: 'dot', x: cx(i), y: y(v), r: 5, c }); }));
  // popisky u posledního bodu řady, aspoň 15 px od sebe
  const ends = SER.map(([, , tc], si) => {
    let i = vals[si].length - 1;
    while (i >= 0 && vals[si][i] == null) i -= 1;
    return i < 0 ? null : { x: cx(i) + 16, y: y(vals[si][i]) + 4, v: nf(vals[si][i], 0), c: tc };
  }).filter(Boolean).sort((a, b) => a.x - b.x || a.y - b.y);
  for (let j = 1; j < ends.length; j += 1) if (ends[j].x === ends[j - 1].x && ends[j].y - ends[j - 1].y < 15) ends[j].y = ends[j - 1].y + 15;
  ends.forEach(e => marks.push({ t: 'text', x: e.x, y: e.y, s: 13, b: true, c: e.c, v: e.v }));
  xl();
  r.ids.forEach((id, i) => {
    const parts = SER.map(([, , , n], si) => `${n} ${vals[si][i] == null ? '—' : nf(vals[si][i], 0)}`);
    marks.push({ t: 'hit', x: L + band * i, y: T, w: band, h: B - T, tip: `${ctrCap(monthLabel(id))}: ${parts.join(', ')} (index, ${r.baseMonth ? ctrMon(r.baseMonth) : ''} = 100)` });
  });
  return { vb: [640, 260], marks, aria: `Index výkonu: ${SER.map(([, , , n], si) => `${n} ${vals[si].map(v => (v == null ? '—' : nf(v, 0))).join(', ')}`).join('; ')}` };
}
/* Jednotlivé dny týdne proti požadavku: 1128 × 260, z toho zaškolení (tmavě) a v zaškolování. */
function ctrDaysChart(r) {
  const B = 220, T = 20, L = 44, R = 1120;
  const days = r.days;
  const hasReq = days.some(d => d.req);
  const refs = days.map(d => (d.kind === 'off' ? null : hasReq ? d.req || null : d.plan || null));
  const ax = ctrAxis(Math.max(0, ...days.map(d => d.on), ...refs.filter(Boolean)));
  const y = v => B - (v / ax.D) * (B - T);
  const band = (R - L) / days.length;
  const marks = [];
  ctrGrid(marks, ax, y, L, R, 36);
  const top = [];
  days.forEach((d, i) => {
    const cx = L + band * (i + 0.5);
    const bw = Math.min(120, band * 0.56);
    const plan = d.kind === 'plan';
    if (d.kind !== 'off' && d.on > 0) {
      const yOk = y(d.ok);
      const yTop = y(d.on);
      if (d.tr) marks.push({ t: 'rect', x: cx - bw / 2, y: yTop, w: bw, h: yOk - yTop, c: plan ? ctrMix(CTR.blueL, 0.55) : CTR.blueL });
      if (d.ok) marks.push({ t: 'rect', x: cx - bw / 2, y: yOk, w: bw, h: B - yOk, c: plan ? ctrMix(CTR.blue, 0.5) : CTR.blue });
      top.push({ t: 'text', x: cx, y: yTop - 8, s: 13, b: true, c: CTR.ink, a: 'middle', v: nf(d.on, 1) });
      if (B - yOk >= 32) top.push({ t: 'text', x: cx, y: yOk + 23.4, s: 13, b: true, c: CTR.white, a: 'middle', v: `${nf(d.ok, 1)} · ${ctrPct(d.ok / d.on)}` });
    }
    const tag = d.kind === 'off' ? (d.day.hol ? ' · svátek' : ' · volno') : plan ? ' · plán' : '';
    top.push({ t: 'text', x: cx, y: 242, s: 13, c: CTR.muted, a: 'middle', v: ctrDay(d) + tag });
    const ref = refs[i];
    const refT = ref ? ` · ${hasReq ? 'požadavek' : 'plán skupin'} ${nf(ref, 1)} (${d.met ? 'splněn' : 'nesplněn'})` : '';
    const tip = d.kind === 'off' ? `${DOW[d.day.dow]} ${dayText(d.iso)}: ${d.day.hol ? 'svátek' : 'volno'}`
      : `${DOW[d.day.dow]} ${dayText(d.iso)} (${plan ? 'plán' : 'vykázáno'}): ${nf(d.on, 1)} na směně, z toho ${nf(d.ok, 1)} zaškolených (${ctrPct(d.on ? d.ok / d.on : null)}), ${nf(d.tr, 1)} v zaškolování${refT}`;
    top.push({ t: 'hit', x: L + band * i, y: T, w: band, h: B - T, tip });
  });
  // požadavek čárkovaně: přes celý graf, když je každý den stejný (vzor), jinak po dnech
  const vals = refs.filter(Boolean);
  if (vals.length && vals.every(v => v === vals[0]) && days.every((d, i) => d.kind === 'off' || refs[i])) {
    marks.push({ t: 'line', x1: L, y1: y(vals[0]), x2: R, y2: y(vals[0]), c: CTR.green, w: 2, dash: [6, 5] });
  } else {
    refs.forEach((v, i) => { if (v) marks.push({ t: 'line', x1: L + band * i + 10, y1: y(v), x2: L + band * (i + 1) - 10, y2: y(v), c: CTR.green, w: 2, dash: [6, 5] }); });
  }
  const lab = days.map(d => `${ctrDay(d)} ${d.kind === 'off' ? 'volno' : nf(d.on, 1)}`).join(', ');
  return { vb: [1128, 260], marks: marks.concat(top), aria: `Lidé na směně po dnech: ${lab}; zaškolených ${ctrPct(r.tot.share)}` };
}

/* ---------- obsah stránek ---------- */
/* Měsíční souhrn — zaškolenost a výkon (vybraný měsíc, v grafech i dva předchozí). */
/* opts.noPerf (2.45.1): stránka bez výkonu (PDF bez výkonu): bez dlaždic, grafu a sloupců výkonu */
function ctrMonth(month, opts = {}) {
  const noPerf = !!opts.noPerf;
  const r = capMonthReport(month);
  if (!r) return null;
  const today = todayIso();
  const thisM = today.slice(0, 7);
  const M = ctrCap(monthLabel(month));
  const prevN = r.prev ? ctrMonDat(r.prev.id) : '';
  const T = r.tot;
  const P = r.prev ? r.prev.roster.tot : null;
  const vs = (a, b) => (b == null ? '' : `${ctrSign(a - b)} proti ${prevN}`);
  const pf = r.cur.perf;
  const pIdx = pf && pf.idx ? pf.idx.tot.all : null;
  const prevIdx = r.prev && r.prev.perf && r.prev.perf.idx ? r.prev.perf.idx.tot.all : null;
  const ratio = pf && pf.tot.ok != null && pf.tot.tr ? pf.tot.ok / pf.tot.tr : null;
  const base = r.baseMonth ? ctrMon(r.baseMonth) : '';
  const snap = r.cur.roster.past ? 'stav matice dovedností k poslednímu pracovnímu dni měsíce' : `stav matice dovedností k ${dayText(today)}`;
  const shares = [1, 0].map(i => (r.shares[i] == null ? '' : `${ctrMon(r.ids[i])} ${ctrPct(r.shares[i])}`)).filter(Boolean).join(' · ');
  let banner = '';
  if (r.plan && r.real) banner = `VYKÁZÁNO A PLÁN · docházka je nahraná do ${dayText(r.lastReal)}, od ${dayText(r.firstPlan)} jsou pracovní dny plánované podle dnešního zařazení a směn; výkon jen z nahraných dnů`;
  else if (r.plan && month > thisM) banner = `PLÁN · ${ctrCap(ctrMon(month))} ještě ${month.slice(5) === '09' ? 'nezačalo' : 'nezačal'}; počty lidí jsou z dnešní matice dovedností, výkon se spočítá z docházky a evidence práce`;
  else if (r.plan && month === thisM) banner = `PLÁN · docházka za ${ctrMon(month)} zatím není nahraná; počty lidí jsou z matice dovedností k ${dayText(today)}`;
  else if (r.plan) banner = `BEZ DOCHÁZKY · docházka za ${ctrMon(month)} není nahraná; počty lidí jsou podle historie zařazení v matici dovedností`;
  const tiles = [
    { v: String(T.n), label: 'Lidí ve skupinách', sub: vs(T.n, P && P.n) },
    { v: String(T.ok), c: 'blue', label: 'Zaškolení', sub: vs(T.ok, P && P.ok) },
    { v: String(T.tr), c: 'amber', label: 'V zácviku', sub: vs(T.tr, P && P.tr) },
    { v: pIdx == null ? '—' : nf(pIdx, 0), label: 'Výkon na den (index)',
      sub: pIdx == null ? 'bez výkonů za měsíc' : `${base} = 100${prevIdx != null ? ` · ${ctrSign(Math.round(pIdx) - Math.round(prevIdx))} b. proti ${prevN}` : ''}` },
    { v: ratio == null ? '—' : `${nf(ratio, 1)}×`, label: 'Zaškolený proti zácviku', sub: 'kusy na odpracovaný den' },
  ];
  if (noPerf) tiles.splice(3, 2);
  const charts = [
    { title: 'Lidé ve skupinách: zaškolení a v zácviku', legend: [['Zaškolení', 'blue', 'sq'], ['V zácviku', 'amberF', 'sq']], ...ctrStackChart(r, noPerf ? 1280 : 640) },
    { title: `Výkon na odpracovaný den (index, Ø ${base || ctrMon(r.ids[0])} = 100)`, legend: [['Zaškolení', 'blue', 'line'], ['V zácviku', 'amberL', 'line'], ['Celkem', 'ink', 'line']], ...ctrPerfChart(r) },
  ];
  if (noPerf) charts.pop();
  const dash = v => (v == null ? { v: '—', c: 'faint' } : { v: nf(v, 0) });
  const row = (name, q, sum) => ({ sum, cells: [{ v: name }, { v: String(q.n) }, { v: String(q.ok), c: 'blue', b: true }, { v: String(q.tr), c: 'amber' }, { v: ctrPct(q.share) },
    { v: q.dOk == null ? '—' : ctrSign(q.dOk) }, dash(q.perf && q.perf.ok), dash(q.perf && q.perf.tr), { ...dash(q.perf && q.perf.all), b: true }].slice(0, noPerf ? 6 : 9) });
  const rows = r.groups.map(q => row(q.g.name || '(bez názvu)', q, false));
  const shown = new Set(r.groups.map(q => q.i));
  const empty = r.x.groups.filter((g, i) => !shown.has(i)).map(g => g.name || '(bez názvu)');
  if (empty.length) rows.push({ span: [empty.join(', '), 'zatím bez lidí v matici dovedností — doplnit'] });
  if (r.noGroup) rows.push({ span: ['Bez skupiny', `${r.noGroup} ${lidiN(r.noGroup)} se směnou bez skupiny v matici dovedností — doplnit`] });
  rows.push(row('CELKEM', T, true));
  const cols = ['SKUPINA', 'LIDÍ', 'ZAŠKOLENÍ', 'V ZÁCVIKU', 'PODÍL ZAŠK.', `ZAŠK. PROTI ${(prevN || 'minulému').toUpperCase()}`, 'VÝKON ZAŠK.', 'VÝKON ZÁCVIK', 'VÝKON CELKEM'].slice(0, noPerf ? 6 : 9).map((h, i) => ({ h, a: i ? 'r' : 'l' }));
  const est = r.x.est + r.x.noHist;
  return {
    kind: 'month', id: month, x: r.x,
    head: { title: ctrTitle(), sub: ctrSub('měsíční souhrn zaškolenosti a výkonu'), h2: `Měsíční souhrn — ${M}`, range: `${ctrRange(r.from, r.to)} · ${snap}` },
    kpis: [{ label: 'PODÍL ZAŠKOLENÝCH', value: ctrPct(T.share), sub: shares, tone: 'plain' }],
    banner, tiles, charts,
    table: { title: `Po skupinách — ${M}`, cols, rows },
    notes: [
      ['Zaškolený', ` — procento dovedností skupiny v matici dovedností aspoň ${r.okPct} % (${ctTrainSrc(r)}), snímek k poslednímu pracovnímu dni měsíce; u minulých měsíců podle historie hodnocení${est ? ` (u ${est} ${lidiN(est)} bez starší historie nejbližší známé hodnocení)` : ''}. V zácviku = zařazen ve skupině, pod ${r.okPct} %.`],
      ...(noPerf ? [['', `Vygenerováno ${dayText(today)}.`]] : [
        ['Výkon', ` — dokončené kusy ze souboru Docházka a výkony (jinak z evidence práce) ÷ odpracované dny z docházky, jen lidé ve skupinách, kteří v měsíci něco vykázali. Index: průměr celé ${EXPORT_NAME} za ${r.baseMonth ? monthLabel(r.baseMonth) : 'první měsíc s výkonem'} = 100. Kusy na osobu se nezobrazují.`],
        ['Výkon zaškolených / v zácviku', ` — stejný výpočet, lidé rozdělení podle stavu v matici k danému měsíci. Vygenerováno ${dayText(today)}.`]]),
    ],
  };
}
/* Týdenní souhrn — jednotlivé dny proti požadavku, z toho zaškolení, a průměr po skupinách. */
function ctrWeek(weekId) {
  const r = capWeekReport(weekId);
  if (!r) return null;
  const w = r.week;
  const t = r.tot;
  const n = r.n;
  const today = todayIso();
  const hasReq = r.req != null;
  const reqTxt = hasReq ? `denní požadavek (norma) ${r.reqSame ? nf(r.req, 0) : `Ø ${nf(r.req, 1)}`}` : 'norma = plán skupin';
  const share = n ? t.met / n : null;
  const work = r.days.filter(d => d.kind !== 'off');
  const realD = work.filter(d => d.kind === 'real');
  const planD = work.filter(d => d.kind === 'plan');
  const pastPlan = planD.filter(d => d.iso < today);
  let banner = '';
  if (planD.length) {
    banner = realD.length ? `VYKÁZÁNO A PLÁN · ${ctrDayList(realD, work)} vykázáno z docházky, ${ctrDayList(planD, work)} plánováno podle dnešního zařazení a směn (bez nemocných)`
      : 'PLÁN · týden zatím nemá docházku; lidé na směně podle dnešního zařazení, směn a střídání, bez nemocných a vyřazených';
    if (pastPlan.length) banner += ` · docházka chybí za ${ctrDayList(pastPlan, work)}`;
  }
  const below = work.filter(d => !d.met);
  const tiles = [
    { v: ctrPct(share), label: 'Plnění normy', sub: 'dní v normě / prac. dní' },
    hasReq ? { v: r.reqSame ? nf(r.req, 0) : nf(r.req, 1), label: 'Denní požadavek', sub: r.reqSame ? 'norma na každý pracovní den' : 'Ø požadavek na pracovní den' }
      : { v: nf(t.plan, 1), label: 'Denní plán', sub: 'Ø lidí podle plánu skupin' },
    { v: `${t.met}/${n}`, label: 'Dní v normě', sub: hasReq ? 'celý požadavek splněn' : 'plán skupin splněn' },
    { v: String(n - t.met), label: 'Dní pod normou', sub: below.length ? below.map(ctrDay).join(', ') : `${hasReq ? 'požadavek' : 'plán'} splněn každý den` },
  ];
  const reqs = [...new Set(r.days.filter(d => d.req).map(d => d.req))];
  const reqLab = hasReq ? (reqs.length === 1 ? `Požadavek ${nf(reqs[0], 0)}` : 'Požadavek') : 'Plán skupin';
  const charts = [{ title: `Jednotlivé dny vs. ${hasReq ? 'požadavek' : 'plán'} — z toho zaškolení`, legendRight: true,
    legend: [['Zaškolení', 'blue', 'sq'], ['V zaškolování', 'blueL', 'sq'], [reqLab, 'green', 'dash']], ...ctrDaysChart(r) }];
  const rows = r.groups.map(q => ({
    cells: [{ v: q.g.name || '(bez názvu)' }, { v: nf(q.plan, 1) }, { v: nf(q.on, 1) }, { v: `${q.met}/${q.n}` }, { v: CT_STATE_TEXT[q.state] || '', c: CTR_STATE_C[q.state], b: true, sans: true }],
    sub: [{ v: 'zaškolení', c: 'blue', sm: true, ind: true }, { v: '' }, { v: `Ø ${nf(q.ok, 1)}`, c: 'blue', sm: true }, { v: '' }, { bar: q.share, v: ctrPct(q.share) }],
  }));
  rows.push({ sum: true, cells: [{ v: 'CELKEM' }, { v: nf(t.plan, 1) }, { v: nf(t.on, 1) }, { v: `${t.met}/${n}` }, { bar: t.share, v: `${ctrPct(t.share)} · Ø ${nf(t.ok, 0)} zaškolených` }] });
  return {
    kind: 'week', id: weekId, x: r.x,
    head: { title: ctrTitle(), sub: ctrSub(reqTxt, 'víkendy mimo'), h2: `Týdenní souhrn — Týden ${w.w}`, range: ctrRange(w.from, w.to) },
    kpis: [
      { label: 'NORMA SPLNĚNA', value: ctrPct(share), sub: n ? `${t.met} z ${n} ${n === 1 ? 'pracovního dne' : 'pracovních dní'}` : 'bez pracovních dní', tone: t.state || 'plain' },
      { label: 'ZAŠKOLENÍ NA SMĚNĚ', value: ctrPct(t.share), sub: `Ø ${nf(t.ok, 0)} z ${nf(t.on, 0)} lidí`, tone: 'blue' },
    ],
    banner, tiles, charts,
    table: { title: 'Průměr po skupinách', fixed: true, cols: [{ h: 'SKUPINA', a: 'l', w: 224 }, { h: 'Ø PLÁN', a: 'r', w: 134 }, { h: 'Ø DODÁNO', a: 'r', w: 144 }, { h: 'DNÍ V NORMĚ', a: 'r', w: 154 }, { h: 'STAV / ZAŠKOLENÍ', a: 'l' }], rows },
    notes: [
      ['Zaškolení', ` — podíl lidí přítomných na směně, kteří mají v matici aspoň ${r.okPct} % dovedností skupiny (${ctTrainSrc(r)}). Ø = průměr pracovních dní v týdnu. Plán = lidé ve skupině, kteří měli přijít (bez dovolené a nemoci)${planD.length ? ', plánované dny podle dnešního zařazení' : ''}.`],
      ['', `Vygenerováno ${dayText(today)} · zelená = v normě / splněný plán · oranžová = mírně pod (aspoň 80 % dní) · červená = pod plánem.`],
    ],
  };
}
/* Vývoj zaškolení za celé období od–do: komu se změnilo hodnocení dovedností. V PDF lidé jen s ID. */
function ctrDev(from, to) {
  const x = capTimeline(from, to);
  if (!x) return null;
  const today = todayIso();
  const s = x.start.tot;
  const e = x.end.tot;
  const pct = v => (v.pct == null ? '—' : `${nf(v.pct, 0)} %`);
  const rows = x.dev.map(d => ({
    cells: [{ v: `${d.last} ${d.first}`.trim() + (d.wid ? ` · ID ${d.wid}` : ''), pdf: d.wid ? `ID ${d.wid}` : 'bez ID' },
      { v: d.end.pos ? d.end.pos.name : d.start.pos ? d.start.pos.name : '' }, { v: pct(d.start) }, { v: pct(d.end), b: true },
      { v: d.gain == null ? '—' : `${ctrSign(Math.round(d.gain))} b.` },
      { v: d.end.pos ? (d.end.ok ? 'zaškolený' : 'v zácviku') : 'bez skupiny', c: d.end.pos ? (d.end.ok ? 'blue' : 'amber') : 'faint', b: true },
      { v: d.became ? dayText(todayIso(d.became)) : '' },
      { v: d.steps.map(st => `${dayText(todayIso(st.at), false)} ${st.pct == null ? '' : `${nf(st.pct, 0)} %`}`.trim()).join(' → ') }],
    wid: d.e || d, gi: x.groups.indexOf(d.end.pos),
  }));
  if (!rows.length) rows.push({ span: ['', 'V tomto období se nikomu hodnocení dovedností nezměnilo.'] });
  const cols = [{ h: 'KDO', a: 'l' }, { h: 'SKUPINA', a: 'l', sans: true }, { h: 'NA ZAČÁTKU', a: 'r' }, { h: 'NA KONCI', a: 'r' }, { h: 'ZMĚNA', a: 'r' },
    { h: 'STAV', a: 'l', sans: true }, { h: 'ZAŠKOLENÝ OD', a: 'r' }, { h: 'ZMĚNY HODNOCENÍ', a: 'l', sans: true, wrap: true }];
  return {
    kind: 'dev', id: `${x.from}:${x.to}`, x,
    head: { title: ctrTitle(), sub: ctrSub('vývoj zaškolení'), h2: `Vývoj zaškolení — ${ctrRange(x.from, x.to)}`,
      range: `komu se v období změnilo hodnocení dovedností · stav na začátku k ${dayText(x.start.iso)}, na konci k ${dayText(x.end.iso < today ? x.end.iso : today)}` },
    kpis: [{ label: 'PODÍL ZAŠKOLENÝCH', value: ctrPct(e.n ? e.ok / e.n : null), sub: `na začátku ${ctrPct(s.n ? s.ok / s.n : null)}`, tone: 'plain' }],
    banner: '',
    tiles: [
      { v: String(e.n), label: 'Lidí ve skupinách', sub: `${ctrSign(e.n - s.n)} proti začátku` },
      { v: String(e.ok), c: 'blue', label: 'Zaškolení', sub: `${ctrSign(e.ok - s.ok)} proti začátku` },
      { v: String(e.tr), c: 'amber', label: 'V zácviku', sub: `${ctrSign(e.tr - s.tr)} proti začátku` },
      { v: String(x.newOk), c: 'blue', label: 'Nově zaškolení', sub: `z ${x.dev.length} ${lidiN(x.dev.length)} se změnou hodnocení` },
    ],
    charts: [],
    table: { title: 'Změny hodnocení po lidech', cols, rows },
    notes: [
      ['Zaškolený', ` — procento dovedností skupiny v matici aspoň ${x.okPct} % (${ctTrainSrc(x)}). Na začátku a na konci podle historie hodnocení (zápis při každé změně), budoucnost podle dnešního hodnocení.`],
      ['Změny hodnocení', ` — procento dovedností skupiny po každé změně v období. V PDF jsou lidé jen s ID z evidence práce. Vygenerováno ${dayText(today)}.`],
    ],
  };
}
/* Upozornění k výpočtu (jen v aplikaci, nad stránkou). */
function ctrWarnings(x) {
  if (!x) return [];
  return [
    x.pastPlan.length ? `Docházka chybí pro ${x.pastPlan.length} ${pracDnyN(x.pastPlan.length)} v minulosti (${x.pastPlan.slice(0, 3).map(iso => dayText(iso, false)).join(', ')}${x.pastPlan.length > 3 ? ' …' : ''}), počítají se jako plán.` : '',
    ...x.missing.map(m => `V docházce za ${monthLabel(m.month)} chybí ${m.keys.length} ${lidiN(m.keys.length)} ze skupin (jiné jméno, nebo tehdy nepracovali): ${m.keys.slice(0, 4).map(k => { const p = S.employees[k]; return p ? `${p.last} ${p.first}`.trim() : k; }).join(', ')}${m.keys.length > 4 ? ' …' : ''}.`),
    x.noGroup ? `${x.noGroup} ${lidiN(x.noGroup)} se směnou ${x.noGroup === 1 ? 'nemá' : 'nemají'} skupinu v Matici dovedností, do kapacit se nepočítají.` : '',
    x.est || x.noHist ? `Historie hodnocení: u ${x.est} ${lidiN(x.est)} odhad podle nejbližšího zápisu, u ${x.noHist} bez zápisu dnešní hodnocení (zápisy přibývají při každé změně hodnocení).` : '',
  ].filter(Boolean);
}

/* ---------- pohled v aplikaci: stejný papír jako PDF ---------- */
function ctrSvg(ch) {
  const f = v => String(Math.round(v * 10) / 10);
  const body = ch.marks.map(m => {
    if (m.t === 'line') return `<line x1="${f(m.x1)}" y1="${f(m.y1)}" x2="${f(m.x2)}" y2="${f(m.y2)}" stroke="${m.c}" stroke-width="${m.w || 1}"${m.dash ? ` stroke-dasharray="${m.dash.join(' ')}"` : ''}/>`;
    if (m.t === 'rect') return `<rect x="${f(m.x)}" y="${f(m.y)}" width="${f(m.w)}" height="${f(m.h)}" fill="${m.c}"/>`;
    if (m.t === 'text') return `<text x="${f(m.x)}" y="${f(m.y)}" font-size="${m.s}"${m.b ? ' font-weight="600"' : ''} fill="${m.c}"${m.a ? ` text-anchor="${m.a}"` : ''}>${esc(m.v)}</text>`;
    if (m.t === 'poly') return `<polyline points="${m.pts.map(p => `${f(p[0])},${f(p[1])}`).join(' ')}" fill="none" stroke="${m.c}" stroke-width="${m.w}" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (m.t === 'dot') return `<circle cx="${f(m.x)}" cy="${f(m.y)}" r="${m.r}" fill="${m.c}"/>`;
    if (m.t === 'hit') return `<rect class="ctr-hit" x="${f(m.x)}" y="${f(m.y)}" width="${f(m.w)}" height="${f(m.h)}" tabindex="0" aria-label="${esc(m.tip)}" data-tip="${esc(m.tip)}"/>`;
    return '';
  }).join('');
  return `<svg viewBox="0 0 ${ch.vb[0]} ${ch.vb[1]}" role="img" aria-label="${esc(ch.aria)}">${body}</svg>`;
}
function ctrTableHtml(tb) {
  const n = tb.cols.length;
  const cls = (c, col, i) => [i === 0 || col.a === 'l' ? 'l' : 'r', col.sans || c.sans ? 'sans' : '', c.b ? 'b' : '', c.c ? `c-${c.c}` : '', c.sm ? 'sm' : '', c.ind ? 'ind' : '', col.wrap ? 'wrap' : ''].filter(Boolean).join(' ');
  const td = (c, i) => {
    const col = tb.cols[i];
    if (c.bar !== undefined) return `<td class="l bar"><div class="ctr-bar"><div class="ctr-track"><i data-w="${Math.round(Math.min(1, Math.max(0, c.bar || 0)) * 1000) / 10}"></i></div><span>${esc(c.v)}</span></div></td>`;
    return `<td class="${cls(c, col, i)}">${esc(c.v)}</td>`;
  };
  const body = tb.rows.map(row => {
    if (row.span) return `<tr class="e"><td class="l">${esc(row.span[0])}</td><td class="l wrap" colspan="${n - 1}">${esc(row.span[1])}</td></tr>`;
    const main = `<tr${row.sum ? ' class="sum"' : row.sub ? ' class="m"' : ''}>${row.cells.map(td).join('')}</tr>`;
    return row.sub ? `${main}<tr class="s">${row.sub.map(td).join('')}</tr>` : main;
  }).join('');
  return `<div class="ctr-sec"><div class="ctr-h3">${esc(tb.title)}</div><div class="ctr-scroll"><table class="ctr-tab${tb.fixed ? ' fixed' : ''}"><thead><tr>${tb.cols.map((c, i) => `<th class="${i === 0 || c.a === 'l' ? 'l' : 'r'}">${esc(c.h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></div>`;
}
function ctrHtml(pg) {
  const kpis = pg.kpis.map(k => `<div class="ctr-kpi ${k.tone || 'plain'}"><b>${esc(k.label)}</b><span class="v">${esc(k.value)}</span><span class="s">${esc(k.sub)}</span></div>`).join('');
  const head = `<div class="ctr-head"><div class="ctr-titles"><div class="ctr-t1">${esc(pg.head.title)}</div><div class="ctr-sub">${esc(pg.head.sub)}</div><div class="ctr-h2">${esc(pg.head.h2)}</div><div class="ctr-sub">${esc(pg.head.range)}</div></div><div class="ctr-kpis">${kpis}</div></div>`;
  const tiles = `<div class="ctr-tiles n${pg.tiles.length}">${pg.tiles.map(t => `<div class="ctr-tile"><span class="v${t.c ? ` c-${t.c}` : ''}">${esc(t.v)}</span><b>${esc(t.label)}</b><span class="s">${esc(t.sub)}</span></div>`).join('')}</div>`;
  const legend = l => `<div class="ctr-legend">${l.map(([t, c, k]) => `<span><i class="${k} k-${c}"></i>${esc(t)}</span>`).join('')}</div>`;
  const charts = pg.charts.length ? `<div class="ctr-charts n${pg.charts.length}">${pg.charts.map(c => `<div class="ctr-card"><div class="ctr-cardhead${c.legendRight ? ' row' : ''}"><div class="ctr-h3">${esc(c.title)}</div>${legend(c.legend)}</div><div class="ctr-chart${c.vb[0] > 800 ? ' wide' : ''}">${ctrSvg(c)}<div class="chart-tip" hidden></div></div></div>`).join('')}</div>` : '';
  const notes = `<div class="ctr-notes n${pg.notes.length}">${pg.notes.map(([b, t]) => `<div>${b ? `<b>${esc(b)}</b>` : ''}${esc(t)}</div>`).join('')}</div>`;
  return `<div class="ctr-paper ctr-${pg.kind}" data-ctrpage="${esc(pg.kind)}">${head}${pg.banner ? `<div class="ctr-banner">${esc(pg.banner)}</div>` : ''}${tiles}${charts}${pg.table ? ctrTableHtml(pg.table) : ''}${notes}</div>`;
}
function waCtHtml() {
  const r = waCtRange();
  const has = S.positions.some(isGroup);
  const pages = has ? capReportPages(r.from, r.to) : [];
  const ok = has && pages.length;
  const bar = `<div class="t5-weekbar wa-hist-bar">
      <div class="chips" role="group" aria-label="Období">${WA_CT_PRE.map(([k, l]) => `<button type="button" class="chip${k === ui.wa.ctPre ? ' on' : ''}" data-wactpre="${k}" aria-pressed="${k === ui.wa.ctPre}">${l}</button>`).join('')}</div>
      ${waDatesHtml('waCt', r)}
      <span class="spacer"></span>
      <button class="btn sec" type="button" data-wactxlsx${ok ? '' : ' disabled'}>Excel</button>
      <button class="btn sec" type="button" data-wactpdf="noperf"${ok ? '' : ' disabled'} title="Report bez dlaždic, grafu a sloupců výkonu">PDF bez výkonu</button>
      <button class="btn" type="button" data-wactpdf${ok ? '' : ' disabled'}>PDF s výkonem</button>
    </div>`;
  if (!has) return `${bar}<div class="card">${emptyState('Matice dovedností nemá skupiny', 'Kapacity a zaškolení se počítají ze skupin Matice dovedností, z docházky a z historie hodnocení. Založ skupiny v části Skupiny a pravidla.')}</div>`;
  if (!pages.length) return `${bar}<div class="card">${emptyState('V období nejsou pracovní dny', 'Zvol delší období.')}</div>`;
  const rep = ctrRep();
  const form = `<div class="ctr-rep">
      <label class="field"><span>Název v nadpisu</span><input id="waRepPlace" maxlength="60" value="${esc(rep.place)}" placeholder="Report docházky — …" autocomplete="off"></label>
      <label class="field"><span>Firma</span><input id="waRepFirm" maxlength="80" value="${esc(rep.firm)}" autocomplete="off"></label>
      <p class="small muted">Záhlaví stránek jako ve vzoru: „Report docházky — název“, pod ním ${esc(EXPORT_NAME)} · firma. PDF obsahuje jen zvolenou stránku (měsíc, týden nebo vývoj zaškolení). Excel je za celé období.</p>
      <p class="small muted ctr-train">${waTrainText()} <button class="link" type="button" data-watabgo="nastaveni" data-wafocus="waTrainPct">Změnit v Nastavení</button></p>
    </div>`;
  const keys = [...pages.map(p => `${p.kind}:${p.id}`), 'dev'];
  let cur = ui.wa.ctPage;
  if (!keys.includes(cur)) {
    const m = `month:${todayIso().slice(0, 7)}`;
    cur = keys.includes(m) ? m : keys[0];
  }
  ui.wa.ctShown = cur;
  const chip = (k, label, title, extra = '') => `<button type="button" class="chip${extra}${k === cur ? ' on' : ''}" data-wactpage="${esc(k)}" aria-pressed="${k === cur}"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</button>`;
  const nav = `<div class="chips ctr-nav" role="group" aria-label="Stránky reportu">${pages.map(p => (p.kind === 'month' ? chip(`month:${p.id}`, ctrCap(monthLabel(p.id)), 'Měsíční souhrn', ' ctr-mchip') : chip(`week:${p.id}`, `T${weekById(p.id).w}`, `Týdenní souhrn · ${weekLong(p.id)}`))).join('')}${chip('dev', 'Vývoj zaškolení', 'Vývoj zaškolení za celé období', ' ctr-mchip')}</div>`;
  return `${bar}${form}${nav}<div id="ctrPage">${waCtPageHtml(r, cur)}</div>`;
}
/* Vybraná stránka reportu s upozorněními (po změně záhlaví se překreslí jen ona). */
function waCtPageHtml(r, cur) {
  const [kind, id] = cur.split(':');
  const pg = kind === 'month' ? ctrMonth(id) : kind === 'week' ? ctrWeek(id) : ctrDev(r.from, r.to);
  const warn = pg ? ctrWarnings(pg.x).map(t => `<div class="note w">${esc(t)}</div>`).join('') : '';
  return `${warn ? `<div class="ct-notes">${warn}</div>` : ''}${pg ? ctrHtml(pg) : `<div class="card">${emptyState('Stránku nejde spočítat', 'Zvol jiné období.')}</div>`}`;
}

/* ---------- PDF: stejné stránky v měřítku vzoru (A4 na výšku, 1280 px = 210 mm) ---------- */
function ctrPdf(doc) {
  const s = 210 / 1280;            // mm na px vzoru
  const PT = (s * 72) / 25.4;      // pt na px (velikost písma)
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const col = c => (c && c[0] === '#' ? c : CTR[c] || CTR.ink);
  const font = (px, o) => { doc.setFont(o.mono ? 'PlexMono' : 'Plex', o.b ? 'bold' : 'normal'); doc.setFontSize(px * PT); };
  const width = (t, px, o = {}) => { const str = String(t); font(px, o); return doc.getTextWidth(str) / s + (o.ls ? o.ls * px * Math.max(0, str.length - 1) : 0); };
  const text = (t, x, y, px, o = {}) => {
    const str = String(t);
    if (!str) return;
    const w = o.a === 'end' || o.a === 'middle' ? width(str, px, o) : 0;
    font(px, o);
    doc.setTextColor(...rgb(col(o.c)));
    const xx = o.a === 'end' ? x - w : o.a === 'middle' ? x - w / 2 : x;
    if (o.ls) doc.text(str, xx * s, y * s, { charSpace: o.ls * px * s });
    else doc.text(str, xx * s, y * s);
  };
  const box = (x, y, w, h, o) => {
    if (o.fill) doc.setFillColor(...rgb(col(o.fill)));
    if (o.stroke) { doc.setDrawColor(...rgb(col(o.stroke))); doc.setLineWidth((o.lw || 1) * s); }
    const st = o.fill && o.stroke ? 'FD' : o.fill ? 'F' : 'S';
    if (o.r) doc.roundedRect(x * s, y * s, w * s, h * s, o.r * s, o.r * s, st);
    else doc.rect(x * s, y * s, w * s, h * s, st);
  };
  const line = (x1, y1, x2, y2, c, lw = 1, dash = null) => {
    doc.setDrawColor(...rgb(col(c)));
    doc.setLineWidth(lw * s);
    if (dash) doc.setLineDashPattern(dash.map(v => v * s), 0);
    doc.line(x1 * s, y1 * s, x2 * s, y2 * s);
    if (dash) doc.setLineDashPattern([], 0);
  };
  const poly = (pts, c, lw) => {
    doc.setDrawColor(...rgb(col(c)));
    doc.setLineWidth(lw * s);
    doc.setLineJoin('round');
    doc.setLineCap('round');
    doc.lines(pts.slice(1).map((p, i) => [(p[0] - pts[i][0]) * s, (p[1] - pts[i][1]) * s]), pts[0][0] * s, pts[0][1] * s, [1, 1], 'S', false);
    doc.setLineCap('butt');
    doc.setLineJoin('miter');
  };
  const dot = (x, y, r, c) => { doc.setFillColor(...rgb(col(c))); doc.circle(x * s, y * s, r * s, 'F'); };
  /* zalomení textu s tučným začátkem: runs [[text, tučně]] → řádky [[kus, tučně, x]] */
  const rich = (runs, px, maxW, o = {}) => {
    const lines = [[]];
    let lx = 0;
    runs.forEach(([t, b]) => String(t).split(/(\s+)/).forEach(wd => {
      if (!wd) return;
      const cur = lines[lines.length - 1];
      if (/^\s+$/.test(wd)) { if (cur.length) { lx += width(' ', px, { ...o, b }); } return; }
      const ww = width(wd, px, { ...o, b });
      if (lx + ww > maxW && cur.length) { lines.push([]); lx = 0; }
      lines[lines.length - 1].push([wd, b, lx]);
      lx += ww;
    }));
    return lines;
  };
  const split = (t, px, maxW, o = {}) => (String(t) ? rich([[t, !!o.b]], px, maxW, o).map(l => l.map(p => p[0]).join(' ')) : ['']);
  const PH = 297 / s;
  return { doc, s, PH, width, text, box, line, poly, dot, rich, split };
}
function pdfCtrChart(P, ch, x0, y0, w) {
  const k = w / ch.vb[0];
  const X = v => x0 + v * k;
  const Y = v => y0 + v * k;
  ch.marks.forEach(m => {
    if (m.t === 'line') P.line(X(m.x1), Y(m.y1), X(m.x2), Y(m.y2), m.c, (m.w || 1) * k, m.dash ? m.dash.map(d => d * k) : null);
    else if (m.t === 'rect') P.box(X(m.x), Y(m.y), m.w * k, m.h * k, { fill: m.c });
    else if (m.t === 'text') P.text(m.v, X(m.x), Y(m.y), m.s * k, { b: m.b, c: m.c, a: m.a });
    else if (m.t === 'poly') P.poly(m.pts.map(([a, b]) => [X(a), Y(b)]), m.c, m.w * k);
    else if (m.t === 'dot') P.dot(X(m.x), Y(m.y), m.r * k, m.c);
  });
  return ch.vb[1] * k;
}
/* Jedna stránka reportu (případně s pokračováním tabulky na další stránce). */
function pdfCtrPage(P, pg, first) {
  const { doc } = P;
  const X = 56;
  const CW = 1168;
  const TOP = 48;
  const BOT = P.PH - 44;
  const gap = pg.kind === 'week' ? 26 : 28;
  const A = 1.025;   // účaří od horního okraje řádku (Plex: výška řádku 1,3 em)
  if (!first) doc.addPage('a4', 'portrait');
  let y = TOP;
  const newPage = () => { doc.addPage('a4', 'portrait'); y = TOP; };
  // záhlaví: nadpisy vlevo, rámečky vpravo
  const big = pg.kind === 'month' ? 44 : 40;
  const minW = pg.kind === 'month' ? 220 : 180;
  const kp = pg.kpis.map(k => ({ ...k, w: Math.max(minW, P.width(k.label, 12, { b: true, ls: 0.08 }), P.width(k.value, big, { mono: true, b: true }), P.width(k.sub, 13)) + 42 }));
  const kw = kp.reduce((a, k) => a + k.w, 0) + Math.max(0, kp.length - 1) * 14;
  const LW = CW - kw - (kp.length ? 24 : 0);
  let ly = y;
  const put = (t, px, o, after) => { P.split(t, px, LW, o).forEach(ln => { P.text(ln, X, ly + A * px, px, o); ly += 1.3 * px; }); ly += after; };
  put(pg.head.title, 30, { b: true }, 6);
  put(pg.head.sub, 14, { c: 'muted' }, 6 + 14);
  put(pg.head.h2, 22, { b: true }, 6);
  put(pg.head.range, 14, { c: 'muted' }, 0);
  const kh = 2 + 32 + 15.6 + 4 + 1.3 * big + 4 + 16.9;
  let kx = X + CW;
  [...kp].reverse().forEach(k => {
    kx -= k.w;
    const [bg, bd, lc, vc] = CTR_BOX[k.tone] || CTR_BOX.plain;
    P.box(kx + 0.5, y + 0.5, k.w - 1, kh - 1, { fill: bg, stroke: bd, r: 10 });
    const rx = kx + k.w - 21;
    let ty = y + 17;
    P.text(k.label, rx - 0.08 * 12, ty + A * 12, 12, { b: true, ls: 0.08, c: lc, a: 'end' });
    ty += 15.6 + 4;
    P.text(k.value, rx, ty + A * big, big, { mono: true, b: true, c: vc, a: 'end' });
    ty += 1.3 * big + 4;
    P.text(k.sub, rx, ty + A * 13, 13, { c: 'muted', a: 'end' });
    kx -= 14;
  });
  y = Math.max(ly, kp.length ? y + kh : y) + gap;
  // pruh s upozorněním
  if (pg.banner) {
    const ls = P.split(pg.banner, 13, CW - 34);
    const h = 22 + ls.length * 16.9;
    P.box(X + 0.5, y + 0.5, CW - 1, h - 1, { fill: '#FFF4E0', stroke: '#E8C27A', r: 8 });
    ls.forEach((ln, i) => P.text(ln, X + 17, y + 11 + i * 16.9 + A * 13, 13, { c: '#6B4A12' }));
    y += h + gap;
  }
  // dlaždice
  const nT = pg.tiles.length;
  const tw = (CW - (nT - 1) * 16) / nT;
  const vpx = pg.kind === 'week' ? 30 : 32;
  const labs = pg.tiles.map(t => P.split(t.label, 13, tw - 38, { b: true }));
  const subs = pg.tiles.map(t => (t.sub ? P.split(t.sub, 12, tw - 38) : []));
  const th = Math.max(...pg.tiles.map((t, i) => 34 + 1.3 * vpx + 6 + labs[i].length * 16.9 + 6 + Math.max(1, subs[i].length) * 15.6));
  pg.tiles.forEach((t, i) => {
    const tx = X + i * (tw + 16);
    P.box(tx + 0.5, y + 0.5, tw - 1, th - 1, { stroke: CTR.line, r: 10 });
    let ty = y + 17;
    P.text(t.v, tx + 19, ty + A * vpx, vpx, { mono: true, b: true, c: t.c || 'ink' });
    ty += 1.3 * vpx + 6;
    labs[i].forEach(ln => { P.text(ln, tx + 19, ty + A * 13, 13, { b: true }); ty += 16.9; });
    ty += 6;
    subs[i].forEach(ln => { P.text(ln, tx + 19, ty + A * 12, 12, { c: 'muted' }); ty += 15.6; });
  });
  y += th + gap;
  // grafy v rámečcích
  if (pg.charts.length) {
    const nC = pg.charts.length;
    const cw = (CW - (nC - 1) * 24) / nC;
    const inner = cw - 42;
    const right = pg.charts.some(c => c.legendRight);
    const hh = Math.max(...pg.charts.map(c => (c.vb[1] * inner) / c.vb[0]));
    const ch = 2 + 40 + 20.8 + 10 + (right ? 0 : 15.6 + 10) + hh;
    if (y + ch > BOT) newPage();
    pg.charts.forEach((c, i) => {
      const cx = X + i * (cw + 24);
      P.box(cx + 0.5, y + 0.5, cw - 1, ch - 1, { stroke: CTR.line, r: 10 });
      let ty = y + 21;
      P.text(c.title, cx + 21, ty + A * 16, 16, { b: true });
      const items = c.legend.map(([t, cc, k]) => ({ t, cc, k, sw: k === 'sq' ? 12 : 16, tw: P.width(t, 12) }));
      const total = items.reduce((a, it) => a + it.sw + 6 + it.tw, 0) + (items.length - 1) * 18;
      let lx = right ? cx + cw - 21 - total : cx + 21;
      const mid = right ? ty + 10.4 : ty + 20.8 + 10 + 7.8;
      items.forEach(it => {
        if (it.k === 'sq') P.box(lx, mid - 6, 12, 12, { fill: it.cc, r: 2 });
        else if (it.k === 'line') P.box(lx, mid - 1.5, 16, 3, { fill: it.cc });
        else P.line(lx, mid, lx + 16, mid, it.cc, 2, [3, 2]);
        P.text(it.t, lx + it.sw + 6, mid + 4.2, 12, { c: 'muted' });
        lx += it.sw + 6 + it.tw + 18;
      });
      ty += 20.8 + 10 + (right ? 0 : 15.6 + 10);
      pdfCtrChart(P, c, cx + 21, ty, inner);
    });
    y += ch + gap;
  }
  // tabulka (hlavička se na další stránce opakuje)
  if (pg.table) {
    const tb = pg.table;
    const nc = tb.cols.length;
    const fontOf = (c, colD, i, kind) => ({ mono: !(i === 0 || colD.sans || c.sans), b: !!(c.b || kind === 'sum' || (i === 0 && kind !== 'sub')) });
    const txt = c => String(c.pdf != null ? c.pdf : c.v);
    const pxOf = c => (c.sm ? 13 : 14);
    const allCells = i => tb.rows.flatMap(row => (row.span ? [] : [[row.cells[i], row.sum ? 'sum' : 'main'], ...(row.sub ? [[row.sub[i], 'sub']] : [])]));
    let ws;
    if (tb.fixed) {
      const fixed = tb.cols.reduce((a, c) => a + (c.w || 0), 0);
      const free = tb.cols.filter(c => !c.w).length;
      ws = tb.cols.map(c => c.w || (CW - fixed) / free);
    } else {
      const want = tb.cols.map((colD, i) => Math.max(P.width(colD.h, 12, { b: true, ls: 0.04 }),
        ...allCells(i).map(([c, kind]) => (c ? P.width(txt(c), pxOf(c), fontOf(c, colD, i, kind)) + (c.ind ? 16 : 0) : 0))) + 24);
      const sum = want.reduce((a, b) => a + b, 0);
      if (sum <= CW) ws = want.map(v => v + ((CW - sum) * v) / sum);
      else {
        ws = want.slice();
        const k = Math.max(0, tb.cols.findIndex(c => c.wrap));
        ws[k] = Math.max(110, ws[k] - (sum - CW));
        const rest = ws.reduce((a, b) => a + b, 0);
        if (rest > CW) ws = ws.map(v => (v * CW) / rest);
      }
    }
    const xs = ws.map((_, i) => X + ws.slice(0, i).reduce((a, b) => a + b, 0));
    const headLines = tb.cols.map((colD, i) => P.split(colD.h, 12, ws[i] - 24, { b: true }));
    const headH = 20 + Math.max(...headLines.map(l => l.length)) * 15.6 + 2;
    const drawHead = () => {
      tb.cols.forEach((colD, i) => headLines[i].forEach((ln, j) => {
        const right = !(i === 0 || colD.a === 'l');
        P.text(ln, right ? xs[i] + ws[i] - 12 - 0.04 * 12 : xs[i] + 12, y + 10 + j * 15.6 + A * 12, 12, { b: true, ls: 0.04, c: 'muted', a: right ? 'end' : undefined });
      }));
      P.line(X, y + headH - 1, X + CW, y + headH - 1, CTR.ink, 2);
      y += headH;
    };
    // řádek: [buňky, druh] → výška a kreslení
    const layout = (cells, kind) => {
      const padT = kind === 'sum' ? 12 : kind === 'sub' ? 2 : 10;
      const padB = kind === 'sum' ? 12 : kind === 'main2' ? 2 : 10;
      const parts = cells.map((c, i) => {
        const colD = tb.cols[i];
        if (!c) return { h: 0 };
        if (c.bar !== undefined) {
          const avail = ws[i] - 24 - 332;
          const lines = P.split(txt(c), 14, Math.max(60, avail), { mono: true, b: true });
          return { bar: c, lines, h: Math.max(10, lines.length * 18.2) };
        }
        const px = pxOf(c);
        const f = fontOf(c, colD, i, kind === 'main2' ? 'main' : kind);
        const lines = P.split(txt(c), px, ws[i] - 24 - (c.ind ? 16 : 0), f);
        return { c, px, f, lines, h: lines.length * px * 1.3 };
      });
      const h = padT + Math.max(18.2, ...parts.map(p => p.h)) + padB + (kind === 'sum' ? 2 : kind === 'main2' ? 0 : 1);
      return { parts, h, padT, kind };
    };
    const drawRow = L => {
      const top = y + (L.kind === 'sum' ? 2 : 0);
      if (L.kind === 'sum') P.line(X, y + 1, X + CW, y + 1, CTR.ink, 2);
      const ch = Math.max(18.2, ...L.parts.map(p => p.h));
      L.parts.forEach((p, i) => {
        const colD = tb.cols[i];
        if (p.bar) {
          const bx = xs[i] + 12;
          const by = top + L.padT + (ch - 10) / 2;
          const fw = 320 * Math.min(1, Math.max(0, p.bar.bar || 0));
          P.box(bx, by, 320, 10, { fill: CTR.track, r: 5 });
          if (fw > 0.5) {
            if (fw >= 315) P.box(bx, by, fw, 10, { fill: CTR.blue, r: 5 });
            else { P.box(bx, by, Math.max(fw, 5), 10, { fill: CTR.blue, r: Math.min(5, fw / 2) }); if (fw > 10) P.box(bx + fw - 5, by, 5, 10, { fill: CTR.blue }); }
          }
          const ly0 = top + L.padT + (ch - p.lines.length * 18.2) / 2;
          p.lines.forEach((ln, j) => P.text(ln, bx + 332, ly0 + j * 18.2 + A * 14, 14, { mono: true, b: true, c: 'blue' }));
          return;
        }
        if (!p.c) return;
        const right = !(i === 0 || colD.a === 'l');
        const c = p.c;
        const ty = top + L.padT + (ch - p.h) / 2;   // buňky na výšku na střed jako v tabulce HTML
        p.lines.forEach((ln, j) => P.text(ln, right ? xs[i] + ws[i] - 12 : xs[i] + 12 + (c.ind ? 16 : 0), ty + j * p.px * 1.3 + A * p.px, p.px, { ...p.f, c: c.c || 'ink', a: right ? 'end' : undefined }));
      });
      if (L.kind !== 'sum' && L.kind !== 'main2') P.line(X, y + L.h - 0.5, X + CW, y + L.h - 0.5, CTR.grid, 1);
      y += L.h;
    };
    const groups = tb.rows.map(row => {
      if (row.span) {
        const a = P.split(row.span[0], 14, ws[0] - 24, { b: true });
        const restW = ws.slice(1).reduce((s2, v) => s2 + v, 0);
        const b = P.split(row.span[1], 14, restW - 24);
        return [{ span: true, a, b, h: 20 + Math.max(a.length, b.length) * 18.2 + 1 }];
      }
      if (row.sub) return [layout(row.cells, 'main2'), layout(row.sub, 'sub')];
      return [layout(row.cells, row.sum ? 'sum' : 'main')];
    });
    const firstH = groups.length ? groups[0].reduce((a, L) => a + L.h, 0) : 0;
    if (y + 32.8 + headH + firstH * Math.min(2, groups.length) > BOT) newPage();
    P.text(tb.title, X, y + A * 16, 16, { b: true });
    y += 20.8 + 12;
    drawHead();
    groups.forEach(G => {
      const gh = G.reduce((a, L) => a + L.h, 0);
      if (y + gh > BOT) {
        newPage();
        P.text(`${tb.title} — pokračování`, X, y + A * 16, 16, { b: true });
        y += 20.8 + 12;
        drawHead();
      }
      G.forEach(L => {
        if (L.span) {
          L.a.forEach((ln, j) => P.text(ln, X + 12, y + 10 + j * 18.2 + A * 14, 14, { b: true, c: 'faint' }));
          L.b.forEach((ln, j) => P.text(ln, xs[1] + 12, y + 10 + j * 18.2 + A * 14, 14, { c: 'faint' }));
          P.line(X, y + L.h - 0.5, X + CW, y + L.h - 0.5, CTR.grid, 1);
          y += L.h;
        } else drawRow(L);
      });
    });
    y += gap;
  }
  // vysvětlivky ve sloupcích
  const nN = pg.notes.length;
  const nw = (CW - (nN - 1) * 20) / nN;
  const parts = pg.notes.map(([b, t]) => P.rich(b ? [[b, true], [t, false]] : [[t, false]], 12, nw));
  const nh = 17 + Math.max(...parts.map(p => p.length)) * 18;
  if (y + nh > BOT) newPage();
  P.line(X, y + 0.5, X + CW, y + 0.5, CTR.line, 1);
  parts.forEach((lines, i) => lines.forEach((ln, j) => ln.forEach(([wd, b, px]) => P.text(wd, X + i * (nw + 20) + px, y + 17 + j * 18 + 1.125 * 12, 12, { b, c: b ? 'ink' : 'muted' }))));
  y += nh;
}
/* PDF jen zvolené stránky reportu (2.45.2): vybraný měsíc, týden, nebo vývoj zaškolení za období. */
async function exportCtPdf(button, noPerf) {
  const r = waCtRange();
  const cur = ui.wa.ctShown;
  if (!cur || !S.positions.some(isGroup)) { toast('V období nejsou pracovní dny.', true); return; }
  const [kind, id] = cur.split(':');
  const label = kind === 'month' ? ctrCap(monthLabel(id)) : kind === 'week' ? weekLong(id) : `Vývoj zaškolení · ${ctrRange(r.from, r.to)}`;
  const slug = kind === 'month' || kind === 'week' ? id : `vyvoj-${r.from}-${r.to}`;
  await withPdf(button, doc => {
    const pg = kind === 'month' ? ctrMonth(id, { noPerf }) : kind === 'week' ? ctrWeek(id) : ctrDev(r.from, r.to);
    if (!pg) throw new Error('Stránku nejde spočítat, zvol jiné období.');
    doc.setProperties({ title: `Report docházky · ${label}`, creator: EXPORT_NAME });
    const P = ctrPdf(doc);
    if (pg.kind === 'dev' && pg.table) pg.table.rows.sort((a, b) => (a.gi - b.gi) || (a.wid && b.wid ? widCmp(a.wid, b.wid) : 0));
    pdfCtrPage(P, pg, true);
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i += 1) {
      doc.setPage(i);
      P.text(`${EXPORT_NAME} · Report docházky · ${label}`, 56, P.PH - 22, 11, { c: 'faint' });
      P.text(`Strana ${i} / ${n}`, 1224, P.PH - 22, 11, { c: 'faint', a: 'end' });
    }
    downloadFile(`kapacity-zaskoleni-${slug}${noPerf && kind === 'month' ? '-bez-vykonu' : ''}.pdf`, doc.output('blob'), 'application/pdf');
  }, 'portrait', { mono: true });
}
async function exportCtXlsx() {
  const r = waCtRange();
  const x = capTimeline(r.from, r.to);
  if (!x || !x.days.length) { toast('V období nejsou pracovní dny.', true); return; }
  try {
    const X = await xlsx();
    const wb = X.utils.book_new();
    capTimelineSheets(x).forEach(sheet => {
      const ws = X.utils.aoa_to_sheet(sheet.rows.map(row => row.map(safeCell)));
      ws['!cols'] = sheet.cols.map(wch => ({ wch }));
      X.utils.book_append_sheet(wb, ws, sheet.name);
    });
    downloadFile(`kapacity-zaskoleni-${x.from}-${x.to}.xlsx`, new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch (error) { toast(`Export se nepovedl: ${error.message}`, true); }
}

/* ---------- dny ---------- */
function waCheckTags(d) {
  const out = [];
  if (d.day.work && !d.hasAtt) out.push('<span class="tag wa-miss">bez obsazenosti</span>');
  if (d.day.work && !d.hasWork) out.push('<span class="tag wa-miss">bez výkazu</span>');
  ['am', 'pm'].forEach(k => { if (d.check[k]) out.push(`<span class="tag wa-diff" title="Součet skupin minus celkem na směně">${k === 'am' ? 'R' : 'O'} ${d.check[k] > 0 ? '+' : ''}${nf(d.check[k], 2)}</span>`); });
  return out.join('');
}
function waEditedMark(d, keys) {
  return keys.some(k => d.edited.includes(k)) ? '<sup class="wa-ed" title="Ručně upraveno">*</sup>' : '';
}
function waDaysHtml(days) {
  const wa = S.workAudit;
  const groups = ui.wa.groups;
  const G = wa.groups;
  const t = waTotals(wa, days);
  const gHead = groups ? G.map(g => `<th class="r wa-g" title="${esc(g.name)} · ranní + odpolední">${esc(g.name)}</th>`).join('') : '';
  const rows = days.map(d => {
    const off = !d.day.work;
    const gCells = groups ? G.map(g => { const x = d.g[g.id]; return `<td class="r num wa-g" data-label="${esc(g.name)}">${x.sum == null ? '<span class="muted">—</span>' : `${waN(x.sum, 2)}${x.am != null && x.pm != null ? `<small>${waN(x.am, 2)} + ${waN(x.pm, 2)}</small>` : ''}`}${waEditedMark(d, [`g.${g.id}.am`, `g.${g.id}.pm`])}</td>`; }).join('') : '';
    const pcsEdited = d.edited.some(k => k.startsWith('pcs.'));
    return `<tr class="wa-row${off ? ' wa-off' : ''}${d.edited.length ? ' wa-edited' : ''}" data-waday="${d.iso}" tabindex="0">
      <td class="name" data-label="Den"><b class="num">${esc(ktDay(d.iso))}</b>${waDayTag(d.day)}${d.note ? `<span class="wa-note" title="${esc(d.note)}">${WA_NOTE_ICON}</span>` : ''}${waCheckTags(d) ? `<div class="wa-tags">${waCheckTags(d)}</div>` : ''}</td>
      <td class="r num" data-label="Ranní v práci / plán">${waN(d.am.total, 2)}${waEditedMark(d, ['am.total'])}<small> / ${waN(d.am.plan, 2)}${waEditedMark(d, ['am.plan'])}</small></td>
      <td class="r num" data-label="Absence">${waN(d.am.abs, 2)}${waEditedMark(d, ['am.abs'])}</td>
      <td class="r num" data-label="Odpolední v práci / požadavek">${waN(d.pm.total, 2)}${waEditedMark(d, ['pm.total'])}<small> / ${waN(d.pm.plan, 2)}${waEditedMark(d, ['pm.plan'])}</small></td>
      ${gCells}
      <td class="r num" data-label="Celkem v práci"><b>${waN(d.people, 2)}</b></td>
      <td class="r num" data-label="Obsazenost">${waP(d.fill)}</td>
      <td class="r num" data-label="Kusy"><b>${waN(d.pcsTotal)}</b>${pcsEdited ? '<sup class="wa-ed" title="Ručně upraveno">*</sup>' : ''}</td>
      <td class="r num" data-label="Ks na osobosměnu">${waN(d.perProd, 1)}</td>
    </tr>`;
  }).join('');
  const foot = `<tr><td><b>Celkem</b> <span class="muted small">${t.workDays} prac. ${denN(t.workDays)}</span></td>
    <td class="r num" data-label="Ranní v práci / plán">${waN(t.amShifts, 2)}</td><td class="r num" data-label="Absence">${waN(t.abs, 2)}</td><td class="r num" data-label="Odpolední v práci">${waN(t.pmShifts, 2)}</td>
    ${groups ? G.map(g => `<td class="r num wa-g" data-label="${esc(g.name)}">${waN(t.group[g.id].shifts, 2)}</td>`).join('') : ''}
    <td class="r num" data-label="Celkem v práci"><b>${waN(t.shifts, 2)}</b></td><td class="r num" data-label="Obsazenost">${waP(t.fill)}</td><td class="r num" data-label="Kusy"><b>${waN(t.pcs)}</b></td>
    <td class="r num" data-label="Ks na osobosměnu">${waN(t.perShift, 1)}</td></tr>`;
  return `<div class="toolbar wa-tools"><label class="switch"><input type="checkbox" id="waGroups"${groups ? ' checked' : ''}><span>Rozpad po skupinách</span></label>
      <span class="spacer"></span><span class="tiny muted">Klepnutím na den otevřeš detail a úpravy. <sup class="wa-ed">*</sup> = ručně upraveno.</span></div>
    <div class="table-card"><table class="stack wa-days${groups ? ' with-groups' : ''}"><thead><tr><th>Den</th><th class="r">Ranní <small>v práci / plán</small></th><th class="r">Absence</th><th class="r">Odpolední <small>v práci / pož.</small></th>${gHead}
      <th class="r">Celkem</th><th class="r">Obsazenost</th><th class="r">Kusy</th><th class="r">Ks / os.</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="8">${emptyState('V období nejsou žádné dny', 'Vyber jiné období.')}</td></tr>`}</tbody><tfoot>${days.length ? foot : ''}</tfoot></table></div>`;
}

/* ---------- úpravy ---------- */
function waEditsHtml(r) {
  const wa = S.workAudit;
  const all = ui.wa.allEdits;
  const list = waEditList(wa, all ? '' : r.from, all ? '' : r.to);
  const notes = Object.entries(wa.notes).filter(([iso]) => all || (iso >= r.from && iso <= r.to)).sort();
  const fmt = v => (v == null ? '<span class="muted">prázdné</span>' : nf(v, 2));
  const rows = list.map(e => `<tr><td class="num nowrap" data-label="Den"><button class="linkish" type="button" data-waday="${e.iso}">${esc(ktDay(e.iso))} ${esc(e.iso.slice(0, 4))}</button></td>
      <td data-label="Hodnota">${esc(e.label)}</td><td class="r num" data-label="Původně">${fmt(e.was)}${e.now !== e.was ? `<small class="warn-t" title="Soubor se mezitím nahrál znovu"> (teď ${fmt(e.now)})</small>` : ''}</td>
      <td class="r num" data-label="Nově"><b>${fmt(e.v)}</b></td><td class="wrap" data-label="Důvod">${esc(e.note || '—')}</td>
      <td data-label="Upravil">${esc(e.by || '—')}<small class="muted"> ${esc(tsText(e.at))}</small></td>
      <td class="actions"><button class="btn ghost small" type="button" data-waundo="${e.iso}|${esc(e.key)}">Zrušit úpravu</button></td></tr>`).join('');
  return `<div class="toolbar"><label class="switch"><input type="checkbox" id="waAllEdits"${all ? ' checked' : ''}><span>Všechny úpravy (ne jen za období)</span></label></div>
    <div class="card"><h3>Ručně upravené hodnoty</h3><p class="small muted">Každá úprava má důvod, kdo a kdy ji udělal a původní hodnotu ze souboru. Zrušením platí znovu hodnota ze souboru. Úpravy jsou v PDF i Excelu pro auditora.</p>
      ${list.length ? `<div class="table-card flat"><table class="stack wa-edits"><thead><tr><th>Den</th><th>Hodnota</th><th class="r">Původně</th><th class="r">Nově</th><th>Důvod</th><th>Upravil</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
        : '<p class="small">Žádná ruční úprava. Hodnotu upravíš v detailu dne (záložka Dny).</p>'}</div>
    ${notes.length ? `<div class="card"><h3>Poznámky ke dnům</h3><ul class="wa-notes">${notes.map(([iso, n]) => `<li><button class="linkish num" type="button" data-waday="${iso}">${esc(ktDay(iso))} ${esc(iso.slice(0, 4))}</button><p>${esc(n)}</p></li>`).join('')}</ul></div>` : ''}`;
}

/* ---------- nastavení ---------- */
/* Jeden soubor pro Výrobu i KPI (2.35): jak je to nastavené */
function waOneFileText() {
  const pc = S.settings.prodCols;
  if (pc && pc.op != null && pc.ks != null) return `<b>Stačí nahrát jednou.</b> Výroba bere i operaci (sloupec ${esc(colLetter(pc.op))}), takže evidence práce nahraná ve Výrobě doplní kusy i sem. A výkaz nahraný tady se nabídne nahrát i do Výroby.`;
  return `<b>Stejný soubor jako evidence práce ve Výrobě?</b> Stačí ho nahrát jednou: ve Výrobě vyber při sloupcích i Operaci a kusy se doplní sem, nebo ho nahraj tady a zaškrtni Nahrát i do Výroby (nabídne se, když ve Výrobě sloupce pro tenhle soubor už nastavené jsou).`;
}
/* hranice zaškolení slovy (Nastavení a Kapacity) */
function waTrainText() {
  const tr = waTrain();
  return `Zaškolený od ${tr.pct} % dovedností skupiny, pod ${tr.pct} % v zaškolení${tr.own ? ' (nastaveno v KPI)' : ` (podle Matice dovedností, úroveň ${tr.thr})`}.`;
}
/* Skupiny Matice ke skupině KPI (2.42): rozbalovací výběr, bez výběru podle názvu. */
function waMgHtml(g, mgOf) {
  const all = S.positions.filter(isGroup);
  if (!all.length) return '';
  const own = all.filter(p => mgOf.get(p.id) === g.id);
  const auto = !(g.mg && g.mg.length);
  const label = own.length ? own.map(p => p.name).join(', ') : 'žádná';
  return `<details class="wa-mg"${ui.wa.mgOpen === g.id ? ' open' : ''} data-wamg="${esc(g.id)}"><summary><span class="small muted">Skupiny Matice${auto ? ' (podle názvu)' : ''}:</span> <b>${esc(label)}</b></summary>
    <div class="wa-mglist">${all.map(p => { const other = mgOf.get(p.id); const busy = other && other !== g.id;
      return `<label class="check"><input type="checkbox" data-wagmg="${esc(p.id)}"${!auto && g.mg.includes(p.id) ? ' checked' : ''}${busy ? ' disabled' : ''}><span>${esc(p.name)}${p.dept ? ` <small class="muted">${esc(p.dept)}</small>` : ''}${busy ? ` <small class="muted">· ${esc(waGroupName(other))}</small>` : ''}</span></label>`; }).join('')}</div>
    ${auto ? '<p class="tiny muted">Nic není vybrané, takže se berou skupiny Matice se stejným názvem skupiny nebo oddělení.</p>' : ''}</details>`;
}
function waSettingsHtml() {
  const wa = S.workAudit;
  const tr = waTrain();
  const tot = new Map();
  Object.values(wa.pcs).forEach(day => Object.entries(day).forEach(([id, n]) => tot.set(id, (tot.get(id) || 0) + n)));
  const mgOf = dvAuditGroups(wa);
  const gOpts = sel => `<option value="">— nepočítat —</option>${wa.groups.map(g => `<option value="${esc(g.id)}"${g.id === sel ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}`;
  const groups = wa.groups.map(g => `<div class="wa-grp-row" data-wag="${esc(g.id)}">
      <label class="field wa-gname"><span>Název skupiny</span><input value="${esc(g.name)}" maxlength="80" data-wagf="name"></label>
      <label class="field wa-letter"><span>Ranní</span><input value="${esc(g.am)}" maxlength="3" data-wagf="am" placeholder="—" autocapitalize="characters"></label>
      <label class="field wa-letter"><span>Odpolední</span><input value="${esc(g.pm)}" maxlength="3" data-wagf="pm" placeholder="—" autocapitalize="characters"></label>
      <div class="wa-flags">
        <label class="check"><input type="checkbox" data-wagf="unprod"${g.unprod ? ' checked' : ''}><span>Neproduktivní pozice</span></label>
        <label class="check"><input type="checkbox" data-wagf="noIs"${g.noIs ? ' checked' : ''}><span>Tento projekt není evidován v IS</span></label>
      </div>
      <button class="icon-btn" type="button" data-wagdel="${esc(g.id)}" aria-label="Smazat skupinu ${esc(g.name)}" title="Smazat skupinu">${I.x}</button>
      ${waMgHtml(g, mgOf)}
    </div>`).join('');
  const q = norm(ui.wa.opQ || '');
  const f = ui.wa.opFilter || 'all';
  // Počítá se jen operace přiřazená ke skupině (2.17.1); dřívější vypnutá operace je jako bez skupiny.
  const counted = o => o.on && !!o.group;
  const ops = wa.ops.filter(o => (!q || norm(o.name).includes(q)) && (f === 'all' || (f === 'nogroup' ? !counted(o) : counted(o))))
    .sort((a, b) => (tot.get(b.id) || 0) - (tot.get(a.id) || 0) || a.name.localeCompare(b.name, 'cs'));
  const noGroup = wa.ops.filter(o => !counted(o)).length;
  const guessable = wa.ops.filter(o => !counted(o) && waGuessGroup(o.name, wa.groups)).length;
  const opRows = ops.map(o => {
    const guess = counted(o) ? '' : waGuessGroup(o.name, wa.groups);
    return `<tr data-wao="${esc(o.id)}"${counted(o) ? '' : ' class="wa-offop"'}>
      <td class="wrap name" data-label="Operace"><b>${esc(o.name)}</b>${guess ? `<button class="link wa-guess" type="button" data-waogs="${esc(guess)}" title="Přiřadit navrženou skupinu">návrh: ${esc(waGroupName(guess))}</button>` : ''}</td>
      <td data-label="Skupina"><select data-waof="group" aria-label="Skupina pro ${esc(o.name)}">${gOpts(counted(o) ? o.group : '')}</select></td>
      <td class="r num" data-label="Kusy celkem">${waN(tot.get(o.id) || 0)}</td></tr>`;
  }).join('');
  const cols = (kind, keys) => keys.map(k => `<label class="field wa-letter"><span>${esc(WA_COL_LABEL[k])}</span><input value="${esc(wa.cols[kind][k])}" maxlength="3" data-wacol="${kind}.${k}" placeholder="—" autocapitalize="characters"></label>`).join('');
  const files = wa.files.slice().reverse();
  return `<div class="card"><div class="card-head"><div><h3>Skupiny (oddělení)</h3><p class="small muted">Od listopadu 2026 se lidé ve skupině počítají ze souboru docházky a výkonů podle <b>skupin Matice</b>, které ke skupině vybereš (bez výběru podle stejného názvu skupiny nebo oddělení). Sloupce ranní a odpolední platí jen pro starší soubory obsazenosti (do října 2026). <b>Neproduktivní pozice</b> se počítají do lidí v práci, ale ne do kusů na osobosměnu. <b>Projekt mimo IS</b> se ve výkazu práce neobjeví, takže se jeho lidé do výkonu nepočítají a nekazí ho.</p></div>
      <button class="btn sec small" type="button" data-wagadd>Přidat skupinu</button></div>
      <div class="wa-grp-list">${groups || '<p class="small muted">Žádná skupina.</p>'}</div></div>
    <div class="card"><div class="card-head"><div><h3>Operace z výkazu práce</h3><p class="small muted"><b>Kusy se počítají jen u operací přiřazených ke skupině.</b> Skupina určuje, ke kterému oddělení kusy patří (třeba Pískování – hala 2 → Obsluha tryskací kabiny). Nová operace z dalšího výkazu přijde bez skupiny a nepočítá se, dokud ji nepřiřadíš. Návrh podle názvu se použije až po klepnutí.</p></div>
      ${guessable ? `<button class="btn sec small" type="button" data-waguess>Přiřadit navržené skupiny (${guessable})</button>` : ''}</div>
      ${wa.ops.length ? `<div class="toolbar"><input type="search" id="waOpQ" class="grow" placeholder="Hledat operaci…" aria-label="Hledat operaci" value="${esc(ui.wa.opQ || '')}">
        <div class="chips">${[['all', `Vše (${wa.ops.length})`], ['nogroup', `Bez skupiny (${noGroup})`], ['on', `Počítají se (${wa.ops.length - noGroup})`]].map(([k, t]) => `<button type="button" class="chip${k === f ? ' on' : ''}" data-waopf="${k}" aria-pressed="${k === f}">${t}</button>`).join('')}</div></div>
        <div class="table-card flat"><table class="stack wa-opset"><thead><tr><th>Operace</th><th>Skupina</th><th class="r">Kusy celkem</th></tr></thead><tbody>${opRows || `<tr><td colspan="3"><p class="small muted">Nic neodpovídá.</p></td></tr>`}</tbody></table></div>`
        : '<p class="small">Operace se objeví po nahrání prvního výkazu práce.</p>'}</div>
    <div class="grid-2 wa-target-grid"><div class="card wa-target-card"><h3>Požadavek lidí na pracovní den</h3><p class="small muted">Pevný požadavek pro všechny pracovní dny, výchozí je ${WA_TARGET} lidí. Den má požadavek splněný, když je v práci aspoň tolik lidí; z toho se počítá obsazenost proti plánu a výpadky. Prázdné pole = požadavek podle souboru obsazenosti (mělo dorazit + požadavek), den po dni.</p>
      <label class="field wa-target"><span>Pevný požadavek (lidí)</span><input id="waTarget" inputmode="numeric" maxlength="5" autocomplete="off" value="${wa.target == null ? '' : wa.target}" placeholder="podle souboru"></label></div>
    <div class="card wa-target-card" id="waTrainCard"><h3>Hranice zaškolení</h3><p class="small muted">Platí pro celé KPI (Kapacity a zaškolení v aplikaci, PDF i Excelu). Pracovník, který má v Matici dovedností <b>pod</b> tímto procentem dovedností své skupiny, je <b>v zaškolení</b>; od hranice výš je zaškolený. Prázdné pole = podle Matice dovedností (úroveň ${tr.thr} = ${tr.thr * 25} %).</p>
      <label class="field wa-target"><span>V zaškolení pod (%)</span><input id="waTrainPct" inputmode="numeric" maxlength="3" autocomplete="off" value="${wa.trainPct == null ? '' : wa.trainPct}" placeholder="${tr.thr * 25}"></label>
      <p class="small">${waTrainText()}</p></div></div>
    ${dvSettingsHtml()}
    <details class="card wa-old"${ui.wa.oldOpen ? ' open' : ''}><summary><h3>Starší soubory (do října 2026)</h3><span class="small muted">Obsazenost od vedoucích a výkaz práce zvlášť. Dny od 1. 11. 2026 se z nich nenahrají.</span></summary>
      <div class="row gap wa-oldbtns"><button class="btn sec small" type="button" data-wapick="att">Nahrát obsazenost</button><button class="btn sec small" type="button" data-wapick="work">Nahrát výkaz práce</button><button class="btn ghost small" type="button" data-go="vyroba">Výroba (evidence práce do října)</button></div>
      <div class="grid-2">
      <div><h4>Sloupce souboru obsazenosti</h4><p class="small muted">Písmena sloupců jako v Excelu. Sloupce skupin jsou nahoře u skupin.</p><div class="wa-colgrid">${cols('att', Object.keys(WA_COLS.att))}</div></div>
      <div><h4>Sloupce výkazu práce</h4><p class="small muted">Datum, název operace a počet kusů.</p><div class="wa-colgrid">${cols('work', Object.keys(WA_COLS.work))}</div>
        <p class="small wa-onefile">${waOneFileText()}</p>
        <button class="btn ghost small" type="button" data-wacolreset>Vrátit výchozí sloupce</button></div>
    </div></details>
    <div class="card"><h3>Nahrané soubory</h3>${files.length ? `<div class="table-card flat"><table class="stack wa-files"><thead><tr><th>Soubor</th><th>Obsah</th><th>Období</th><th class="r">Dní</th><th class="r">Řádků</th><th>Nahrál</th></tr></thead><tbody>${files.map(x => `<tr>
        <td class="wrap name" data-label="Soubor"><b>${esc(x.name || '—')}</b></td><td data-label="Obsah">${x.kind === 'work' ? 'výkaz práce' : 'obsazenost'}</td>
        <td data-label="Období" class="num">${x.from ? `${esc(dayText(x.from))} – ${esc(dayText(x.to))}` : '—'}</td><td class="r num" data-label="Dní">${x.days}</td><td class="r num" data-label="Řádků">${x.rows}</td>
        <td data-label="Nahrál">${esc(x.by || '—')}<small class="muted"> ${esc(tsText(x.at))}</small></td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted">Zatím nic.</p>'}
      ${waSpan(wa) ? `<hr class="sep"><div class="row gap"><button class="btn ghost small wa-danger" type="button" data-waclear>Smazat data za ${esc(waRange().label)}…</button><span class="tiny muted">Obsazenost, kusy, úpravy a poznámky. Předchozí stav zůstane v historii verzí.</span></div>` : ''}</div>`;
}

/* ---------- detail dne: hodnoty, úpravy s důvodem, poznámka ---------- */
function waField(wa, iso, key, label) {
  const raw = waRaw(wa, iso, key);
  const e = (wa.edits[iso] || {})[key];
  const val = e ? e.v : raw;
  return `<label class="field wa-f${e ? ' edited' : ''}" data-wakey="${esc(key)}"><span>${esc(label)}</span>
    <span class="wa-fin"><input name="${esc(key)}" value="${val == null ? '' : esc(String(val).replace('.', ','))}" inputmode="decimal" autocomplete="off" data-raw="${raw == null ? '' : raw}">
    <button class="icon-btn" type="button" data-warevert title="Vrátit hodnotu ze souboru" aria-label="Vrátit hodnotu ze souboru"${e ? '' : ' hidden'}>${WA_UNDO_ICON}</button></span>
    <small class="wa-src-v">${raw == null ? 'v souboru prázdné' : `v souboru ${esc(nf(raw, 2))}`}${e ? ` · upravil ${esc(e.by || '—')}: ${esc(e.note || '')}` : ''}</small></label>`;
}
function waParseInput(v) {
  const t = String(v || '').trim();
  if (!t) return null;
  const n = toNum(t);
  return n == null || n < 0 || n > 100000 ? NaN : Math.round(n * 100) / 100;
}
async function waDayDialog(iso) {
  const wa = S.workAudit;
  const d = waDay(wa, iso);
  const G = wa.groups;
  const shiftGroups = k => G.filter(g => g[k] || waVal(wa, iso, `g.${g.id}.${k}`) != null);
  const opIds = wa.ops.filter(o => waVal(wa, iso, `pcs.${o.id}`) != null || (wa.edits[iso] || {})[`pcs.${o.id}`]).map(o => o.id);
  const opField = o => waField(wa, iso, `pcs.${o.id}`, `${o.name}${o.on && o.group ? '' : ' · nepočítá se'}`);
  const others = wa.ops.filter(o => !opIds.includes(o.id));
  const html = `<div class="wa-dhead">${waDayTag(d.day) || `<span class="tag">${esc(waDayType(d.day))}</span>`}${!d.hasAtt ? '<span class="tag wa-miss">obsazenost ze souboru chybí</span>' : ''}${!d.hasWork ? '<span class="tag wa-miss">výkaz práce chybí</span>' : ''}</div>
    <fieldset class="wa-fs"><legend>${I.sun}Ranní směna</legend><div class="wa-fgrid">
      ${waField(wa, iso, 'am.plan', 'Mělo dorazit')}${waField(wa, iso, 'am.total', 'Celkem v práci')}${waField(wa, iso, 'am.abs', 'Absence')}
      ${shiftGroups('am').map(g => waField(wa, iso, `g.${g.id}.am`, g.name)).join('')}</div><p class="small wa-sum" data-wasum="am"></p></fieldset>
    <fieldset class="wa-fs"><legend>${I.moon}Odpolední směna</legend><div class="wa-fgrid">
      ${waField(wa, iso, 'pm.plan', 'Požadavek')}${waField(wa, iso, 'pm.total', 'Skutečně v práci')}
      ${shiftGroups('pm').map(g => waField(wa, iso, `g.${g.id}.pm`, g.name)).join('')}</div><p class="small wa-sum" data-wasum="pm"></p></fieldset>
    <fieldset class="wa-fs"><legend>${I.chart}Kusy podle operací</legend><div class="wa-fgrid wa-ops-f" id="waOpsF">${wa.ops.filter(o => opIds.includes(o.id)).map(opField).join('') || '<p class="small muted wa-noops">Ve výkazu práce za tento den nic není.</p>'}</div>
      ${others.length ? `<div class="row gap wa-addop"><select id="waAddOp" aria-label="Přidat operaci"><option value="">Přidat kusy jiné operace…</option>${others.map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('')}</select></div>` : ''}</fieldset>
    <label class="field"><span>Důvod úpravy <small class="muted">(povinný, když měníš hodnotu; uvidí ho auditor)</small></span><textarea name="reason" rows="2" maxlength="300" placeholder="Např. oprava podle směnového hlášení, chyběl záznam brigádníka…"></textarea></label>
    <label class="field"><span>Poznámka ke dni</span><textarea name="note" rows="2" maxlength="600" placeholder="Např. odstávka stroje, inventura, školení…">${esc(d.note)}</textarea></label>`;
  const values = form => {
    const out = {};
    $$('[data-wakey]', form).forEach(f => { out[f.dataset.wakey] = waParseInput($('input', f).value); });
    return out;
  };
  const changed = form => Object.entries(values(form)).filter(([k, v]) => !Number.isNaN(v) && v !== waVal(wa, iso, k));
  const result = await dialog({
    title: `${dayLong(iso)} ${iso.slice(0, 4)}`, ok: 'Uložit', wide: true, html,
    onOpen: dlg => {
      const sums = () => ['am', 'pm'].forEach(k => {
        const v = values(dlg);
        const parts = G.map(g => v[`g.${g.id}.${k}`]).filter(x => x != null && !Number.isNaN(x));
        const total = v[`${k}.total`];
        const box = $(`[data-wasum="${k}"]`, dlg);
        if (!parts.length || total == null || Number.isNaN(total)) { box.textContent = ''; box.className = 'small wa-sum'; return; }
        const s = Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100;
        box.textContent = s === total ? `Součet skupin ${nf(s, 2)} = celkem v práci.` : `Součet skupin ${nf(s, 2)}, celkem v práci ${nf(total, 2)} (rozdíl ${s > total ? '+' : ''}${nf(s - total, 2)}).`;
        box.className = `small wa-sum ${s === total ? 'ok' : 'bad'}`;
      });
      const mark = f => {
        const input = $('input', f);
        const raw = input.dataset.raw === '' ? null : +input.dataset.raw;
        const v = waParseInput(input.value);
        f.classList.toggle('edited', !Number.isNaN(v) && v !== raw);
        f.classList.toggle('bad', Number.isNaN(v));
        $('[data-warevert]', f).hidden = !(v !== raw);
      };
      dlg.addEventListener('input', event => { const f = event.target.closest('[data-wakey]'); if (f) { mark(f); sums(); } });
      dlg.addEventListener('click', event => {
        const b = event.target.closest('[data-warevert]');
        if (!b) return;
        const f = b.closest('[data-wakey]');
        const input = $('input', f);
        input.value = input.dataset.raw === '' ? '' : String(+input.dataset.raw).replace('.', ',');
        mark(f); sums();
      });
      const add = $('#waAddOp', dlg);
      if (add) add.onchange = () => {
        const o = wa.ops.find(x => x.id === add.value);
        if (!o) return;
        $('.wa-noops', dlg)?.remove();
        $('#waOpsF', dlg).insertAdjacentHTML('beforeend', opField(o));
        add.querySelector(`option[value="${CSS.escape(o.id)}"]`).remove();
        add.value = '';
        $(`[data-wakey="pcs.${CSS.escape(o.id)}"] input`, dlg).focus();
      };
      sums();
    },
    validate: form => {
      if (Object.values(values(form)).some(v => Number.isNaN(v))) return 'Některá hodnota není číslo od 0 do 100 000.';
      // důvod je potřeba u nové hodnoty; návrat k hodnotě ze souboru ho nepotřebuje
      if (changed(form).some(([key, v]) => v !== waRaw(wa, iso, key)) && !form.elements.reason.value.trim()) return 'Napiš důvod úpravy. Auditor ho uvidí u každé změněné hodnoty.';
      return '';
    },
  });
  if (result.value !== 'ok') return;
  const form = result.form;
  const reason = form.elements.reason.value.trim();
  const list = changed(form);
  const now = Date.now();
  list.forEach(([k, v]) => waSetEdit(wa, iso, k, v === waRaw(wa, iso, k) ? undefined : v, reason, ui.me.label, now));
  const note = form.elements.note.value.trim().slice(0, 600);
  if (note) wa.notes[iso] = note; else delete wa.notes[iso];
  if (list.length || note !== d.note) { save(); renderWorkAudit(); toast(list.length ? `Upraveno ${list.length} ${list.length === 1 ? 'hodnota' : list.length <= 4 ? 'hodnoty' : 'hodnot'}.` : 'Poznámka uložena.'); }
}

