/* ==========================================================================
   AUDIT: docházka a výkony z jednoho souboru (2.37)
   Záložka Lidé v práci: obsazenost dne po projektech (skupinách Matice), měsíc po dnech
   a produktivita lidí. Výpočty jsou v core.js (dvParse, dvApply, dvDay, dvMonth, dvPerson).
   ========================================================================== */
const DV_UNIT_TEXT = { min: 'minuty', h: 'hodiny', frac: 'čas z Excelu (h:mm)' };
const DV_SORTS = [['group', 'Podle projektu'], ['util', 'Využití'], ['perHour', 'Ks za hodinu'], ['t', 'Vykázaný čas']];
const DV_SET_COLS = [['att', 'id', 'Docházka: ID zaměstnance'], ['att', 'first', 'Docházka: první den (příchod)'], ['work', 'id', 'Práce: ID zaměstnance'],
  ['work', 'part', 'Práce: název dílu'], ['work', 'op', 'Práce: operace'], ['work', 'order', 'Práce: množství v zakázce'], ['work', 'done', 'Práce: dokončené množství'],
  ['work', 'time', 'Práce: strávený čas'], ['work', 'date', 'Práce: datum (prázdné = najde se samo)'], ['work', 'norm', 'Práce: norma (prázdné = není)']];
const dvClockText = m => (m == null ? '—' : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`);
const dvH = (min, d = 1) => `${nf((+min || 0) / 60, d)} h`;
const dvPct = v => (v == null ? '—' : `${nf(v * 100, 0)} %`);
const zaznamN = n => (n === 1 ? 'záznam' : n >= 2 && n <= 4 ? 'záznamy' : 'záznamů');
/* ==========================================================================
   REPORT DOCHÁZKY (2.40): plnění denního požadavku z nahraných příchodů, Den / Týden / Měsíc /
   Rok. Obsah stránky skládá drView (výrok, ukazatel, dlaždice, graf, tabulka), kreslí ho
   drPaperHtml v aplikaci i pdfDrPage do PDF (A4 na výšku, stejné značky grafu).
   ========================================================================== */
const DR_MODE_T = [['day', 'Den'], ['week', 'Týden'], ['month', 'Měsíc'], ['year', 'Rok']];
const DRC = { good: '#0CA30C', goodT: '#0A7D0A', goodS: '#E7F6E7', warn: '#E79A00', warnT: '#9A6A00', warnS: '#FDF1D8', crit: '#D03B3B', critT: '#B62D2D', critS: '#FBE4E4',
  plan: '#9FB3C8', acc: '#2A78D6', planBox: '#4F7AA8', planS: '#E8EDF2', grid: '#E6E5DF', muted: '#898781', txt2: '#52514E', ink: '#0B0B0B', line: '#DDDDDA', soft: '#F6F6F3' };
const DR_VC = { ok: DRC.good, warn: DRC.warn, no: DRC.crit, plan: DRC.planBox };
const DR_ST = { good: [DRC.goodS, DRC.goodT], warning: [DRC.warnS, DRC.warnT], critical: [DRC.critS, DRC.critT], plan: [DRC.planS, DRC.planBox] };
const DR_MON = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
const DR_MONF = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
const dniN = n => (n === 1 ? 'den' : n >= 2 && n <= 4 ? 'dny' : 'dní');
const drSign = n => `${n < 0 ? '−' : n > 0 ? '+' : ''}${nf(Math.abs(n), 1)}`;
const drSt = (plan, done) => (plan <= 0 ? 'good' : done / plan >= 1 ? 'good' : done / plan >= 0.9 ? 'warning' : 'critical');
function drRef() {
  if (!ui.wa.dr) ui.wa.dr = { mode: 'day', ref: '' };
  if (!WA_ISO.test(ui.wa.dr.ref || '')) ui.wa.dr.ref = todayIso();
  return ui.wa.dr;
}
function drShift(dir) {
  const st = drRef();
  const [y, m, d] = st.ref.split('-').map(Number);
  if (st.mode === 'day') st.ref = addDays(st.ref, dir);
  else if (st.mode === 'week') st.ref = addDays(st.ref, 7 * dir);
  else if (st.mode === 'month') { const t = new Date(Date.UTC(y, m - 1 + dir, 1)); st.ref = isoOf(t.getTime()); }
  else st.ref = `${y + dir}-${String(m).padStart(2, '0')}-${String(Math.min(d, 28)).padStart(2, '0')}`;
}
function drPeriodLabel(r) {
  const [y, m] = r.ref.split('-').map(Number);
  if (r.mode === 'day') return { main: dayText(r.ref), sub: DOW_NAME[r.d.day.dow] };
  if (r.mode === 'week') { const w = isoWeek(r.ref); return { main: `Týden ${w.w}`, sub: ctrRange(w.from, w.to) }; }
  if (r.mode === 'month') return { main: `${DR_MONF[m - 1]} ${y}`, sub: 'měsíční souhrn' };
  return { main: `Rok ${y}`, sub: 'roční souhrn' };
}

/* ---------- grafy (značky jako u Kapacit a zaškolení: ctrSvg i pdfCtrChart) ---------- */
function drAxis(maxV) { const D = Math.ceil(Math.max(1, maxV) / 10) * 10 || 10; return { D, ticks: [0, 1, 2, 3, 4, 5].map(t => (D * t) / 5) }; }
function drFit(t, w, px) { const n = Math.max(3, Math.floor(w / (px * 0.56))); return t.length > n ? `${t.slice(0, n - 1)}…` : t; }
function drColChart(rows, req, planned) {
  const W = 720, H = 270, L = 40, R = 16, T = 16, B = 42, PH = H - T - B;
  const ax = drAxis(Math.max(req, ...rows.map(r => Math.max(r.plan, r.done))));
  const y = v => T + PH - (v / ax.D) * PH;
  const marks = [];
  ax.ticks.forEach(v => { marks.push({ t: 'line', x1: L, y1: y(v), x2: W - R, y2: y(v), c: DRC.grid }); marks.push({ t: 'text', x: L - 8, y: y(v) + 4, s: 11, c: DRC.muted, a: 'end', v: nf(v, 0) }); });
  const band = (W - L - R) / Math.max(1, rows.length), bw = Math.min(30, band * 0.3);
  rows.forEach((r, i) => {
    const cx = L + band * i + band / 2;
    const dc = drSt(r.plan, r.done) === 'good' ? (planned ? DRC.acc : DRC.good) : DRC.crit;
    if (r.plan) marks.push({ t: 'rect', x: cx - bw - 3, y: y(r.plan), w: bw, h: y(0) - y(r.plan), c: DRC.plan });
    if (r.done) marks.push({ t: 'rect', x: cx + 3, y: y(r.done), w: bw, h: y(0) - y(r.done), c: dc });
    marks.push({ t: 'text', x: cx + 3 + bw / 2, y: y(r.done) - 6, s: 11, b: true, c: dc, a: 'middle', v: String(r.done) });
    marks.push({ t: 'text', x: cx, y: H - B + 20, s: 12, c: DRC.txt2, a: 'middle', v: drFit(r.name, band - 4, 12) });
  });
  marks.push({ t: 'line', x1: L, y1: y(req), x2: W - R, y2: y(req), c: DRC.crit, w: 1.5, dash: [5, 4] });
  marks.push({ t: 'text', x: W - R, y: y(req) - 5, s: 10.5, b: true, c: DRC.crit, a: 'end', v: `požadavek ${req}` });
  return { vb: [W, H], marks, aria: rows.map(r => `${r.name}: ${r.done} z plánu ${r.plan}`).join(', ') };
}
function drTrendChart(r) {
  const W = 720, H = 270, L = 40, R = 16, T = 18, B = 44, PH = H - T - B;
  const year = r.mode === 'year';
  const pts = r.trend.map(p => ({ ...p, label: year ? DR_MON[p.label] : r.mode === 'week' ? `${DOW[p.day.dow]} ${p.day.d}.` : String(p.day.d) }));
  const ref = year ? 100 : r.req;
  const ax = drAxis(Math.max(ref, ...pts.map(p => p.value)));
  const y = v => T + PH - (v / ax.D) * PH;
  const U = year ? ' %' : '';
  const marks = [];
  ax.ticks.forEach(v => { marks.push({ t: 'line', x1: L, y1: y(v), x2: W - R, y2: y(v), c: DRC.grid }); marks.push({ t: 'text', x: L - 8, y: y(v) + 4, s: 11, c: DRC.muted, a: 'end', v: nf(v, 0) + (year ? '%' : '') }); });
  const n = Math.max(1, pts.length), band = (W - L - R) / n, bw = Math.max(4, Math.min(34, band * 0.6)), every = n > 16 ? Math.ceil(n / 16) : 1;
  pts.forEach((p, i) => {
    const cx = L + band * i + band / 2;
    if (p.kind !== 'empty') {
      const c = p.kind === 'plan' ? DRC.acc : (year ? p.value >= 80 : p.met) ? DRC.good : DRC.crit;
      if (p.value > 0) marks.push({ t: 'rect', x: cx - bw / 2, y: y(p.value), w: bw, h: y(0) - y(p.value), c });
      if (n <= 14) marks.push({ t: 'text', x: cx, y: y(p.value) - 5, s: 10.5, b: true, c, a: 'middle', v: nf(p.value, 0) + U });
    }
    if (i % every === 0) marks.push({ t: 'text', x: cx, y: H - B + 18, s: n > 16 ? 9.5 : 11, c: DRC.txt2, a: 'middle', v: p.label });
  });
  marks.push({ t: 'line', x1: L, y1: y(ref), x2: W - R, y2: y(ref), c: DRC.crit, w: 1.5, dash: [5, 4] });
  marks.push({ t: 'text', x: W - R, y: y(ref) - 5, s: 10.5, b: true, c: DRC.crit, a: 'end', v: year ? 'cíl 100 %' : `požadavek ${ref}` });
  return { vb: [W, H], marks, aria: pts.map(p => `${p.label}: ${p.kind === 'empty' ? 'bez dat' : nf(p.value, 0) + U}`).join(', ') };
}

/* ---------- obsah stránky ---------- */
function drView(r) {
  const place = ctrRep().place;
  const per = drPeriodLabel(r);
  const req = r.req;
  const v = { title: `Report docházky${place ? ` — ${place}` : ''}`, org: ctrSub(`plnění denního požadavku (norma) ${req}`, 'víkendy mimo', 'budoucí dny = plánovaná kapacita'), per };
  if (r.mode === 'day') {
    const d = r.d;
    const planned = d.kind === 'plan';
    const exists = d.kind === 'real';
    const wknd = !d.norm;
    const offT = d.mark ? DR_MARK[d.mark] : 'víkend / svátek';
    const rows = d.rows;
    const ok = d.done >= req;
    const shown = planned || exists;
    const diffPlan = d.done - d.plan;
    const diffMin = d.done - req;
    const pct = req ? (d.done / req) * 100 : 0;
    const under = rows.filter(x => !x.extra && x.done < x.plan);
    v.modeName = planned ? 'Plánovaná kapacita – den' : 'Denní report';
    v.banner = planned ? 'Budoucí den — místo skutečné docházky je plánovaná kapacita: plán skupin bez lidí, kteří jsou dnes nemocní.' : '';
    v.verdict = {
      cls: planned ? (ok ? 'plan' : 'warn') : !exists ? 'warn' : wknd ? 'warn' : ok ? 'ok' : 'no',
      lbl: `${planned ? 'Plánovaná kapacita · ' : ''}Denní požadavek (norma) ${req} ${lidiN(req)}${wknd ? ` · ${offT} — mimo normu` : ''}`,
      head: planned ? (ok ? 'KAPACITA POKRYJE POŽADAVEK' : 'KAPACITA NESTAČÍ') : !exists ? 'BEZ DAT' : wknd ? `${d.mark === 'hol' ? 'PRÁCE VE SVÁTEK' : 'PŘESČAS'}${ok ? ' – SPLNĚNO' : ''}` : ok ? 'SPLNĚNO' : 'NESPLNĚNO',
      sub: planned ? (ok ? `Rezerva ${diffMin} ${lidiN(diffMin)} nad požadavek` : `Chybí ${-diffMin} ${lidiAcc(-diffMin)} do denního požadavku`)
        : !exists ? 'Pro tento den nejsou nahrané příchody'
        : wknd ? (d.mark ? `Den je označený jako ${offT}, do plnění normy se nezapočítává` : 'Víkend a svátek se do plnění normy nezapočítávají')
        : ok ? (diffMin > 0 ? `Rezerva ${diffMin} ${lidiN(diffMin)} nad požadavek` : 'Přesně na denním požadavku') : `Chybí ${-diffMin} ${lidiAcc(-diffMin)} do denního požadavku`,
      big: shown ? String(d.done) : '–', bigL: planned ? 'plánovaná kapacita' : 'reálně dodáno',
    };
    v.gauge = { pct: shown ? pct : 0, color: planned ? (ok ? DRC.acc : DRC.warn) : ok ? DRC.good : pct >= 90 ? DRC.warn : DRC.crit,
      kl: planned ? 'Pokrytí požadavku' : 'Plnění', foot: planned ? 'kapacita / požadavek' : 'dodáno / denní požadavek' };
    v.tiles = [
      { lab: 'Plán na den', dot: DRC.plan, val: String(d.plan), foot: 'součet plánu všech skupin' },
      { lab: planned ? 'Kapacita vs. plán' : 'Rozdíl vs. plán', dot: DRC.crit, val: shown ? drSign(diffPlan) : '–', color: shown && diffPlan < 0 ? DRC.crit : shown && diffPlan > 0 ? DRC.goodT : null,
        foot: !shown ? 'bez dat' : diffPlan < 0 ? (planned ? 'omezení oproti plánu' : 'manko oproti plánu') : diffPlan > 0 ? 'nad plánem' : 'přesně podle plánu' },
      { lab: planned ? 'Skupiny s omezením' : 'Skupiny pod plánem', dot: DRC.warn, val: shown ? String(under.length) : '–', small: `/ ${rows.filter(x => !x.extra).length}`,
        foot: !shown ? 'bez dat' : under.length ? under.map(x => x.name).join(', ') : planned ? 'všechny skupiny v plné kapacitě' : 'všechny skupiny v pořádku' },
    ];
    v.chart = { title: planned ? 'Plán vs. plánovaná kapacita po skupinách' : 'Plán vs. dodáno po skupinách',
      legend: [['Plán', DRC.plan], [planned ? 'Kapacita v plné výši' : 'Dodáno (splněno)', planned ? DRC.acc : DRC.good], [planned ? 'Kapacita pod plánem' : 'Dodáno (pod plánem)', DRC.crit], ['Požadavek', DRC.crit, 'dash']],
      ...drColChart(rows, req, planned) };
    const st = x => (drSt(x.plan, x.done) === 'good' ? ['good', planned ? 'PLNÁ KAPACITA' : 'OK'] : ['critical', planned ? 'OMEZENÍ' : 'POD PLÁNEM']);
    v.table = {
      title: planned ? 'Rozpad plánované kapacity po skupinách' : 'Rozpad po skupinách',
      cols: [{ h: 'Skupina' }, { h: 'Plán', r: true }, { h: planned ? 'Plán. kapacita' : 'Dodáno', r: true }, { h: 'Rozdíl', r: true }, { h: 'Pokrytí', r: true }, { h: 'Stav' }, { h: 'Poznámka', wide: true }],
      rows: rows.map(x => ({ cells: [x.name, String(x.plan), shown ? String(x.done) : '–', shown ? drSign(x.done - x.plan) : '–', shown && x.plan ? `${Math.round((x.done / x.plan) * 100)} %` : '–', shown ? st(x) : null, x.note] })),
      total: { cells: ['CELKEM', String(d.plan), shown ? String(d.done) : '–', shown ? drSign(diffPlan) : '–', shown ? `${Math.round(pct)} %` : '–',
        shown ? [ok ? 'good' : 'critical', planned ? (ok ? 'POKRYTO' : 'NEDOSTATEK') : ok ? 'SPLNĚNO' : 'NESPLNĚNO'] : null, ''] },
    };
  } else {
    const periodName = { week: 'Týdenní', month: 'Měsíční', year: 'Roční' }[r.mode];
    const { n, met, nf: nfu, futMet, onlyPlan } = r;
    const cls = onlyPlan ? (r.planPct >= 100 ? 'plan' : r.planPct >= 80 ? 'warn' : 'no') : !n ? 'warn' : met === n ? 'ok' : r.pct >= 80 ? 'warn' : 'no';
    const planNote = nfu ? ` · výhled: kapacita pokryje požadavek ${futMet} z ${nfu} plánovaných ${dniN(nfu)}` : '';
    v.modeName = `${periodName}${onlyPlan ? ' výhled kapacity' : ' souhrn'}`;
    v.banner = '';
    if (onlyPlan) {
      v.verdict = { cls, lbl: `${periodName} výhled kapacity · požadavek ${req}/den · víkendy mimo`, head: 'PLÁNOVANÁ KAPACITA',
        sub: `Období je v budoucnu, zobrazen plán. Kapacita pokryje požadavek ${futMet} z ${nfu} pracovních ${dniN(nfu) === 'den' ? 'dne' : 'dní'}`, big: `${Math.round(r.planPct)} %`, bigL: 'pokrytí plánem' };
      v.gauge = { pct: r.planPct, color: cls === 'plan' ? DRC.plan : cls === 'warn' ? DRC.warn : DRC.crit, kl: 'Pokrytí plánem', foot: 'dní pokrytých plánem / prac. dní' };
      v.tiles = [
        { lab: 'Denní požadavek', dot: DRC.plan, val: String(req), foot: 'norma na každý pracovní den' },
        { lab: 'Dní pokrytých plánem', dot: DRC.plan, val: String(futMet), small: `/ ${nfu}`, foot: 'plánovaná kapacita ≥ požadavek' },
        { lab: 'Dní s nedostatkem', dot: DRC.crit, val: String(nfu - futMet), color: nfu - futMet ? DRC.crit : DRC.goodT, foot: nfu - futMet ? 'plán nedosáhne požadavku' : 'plán pokrývá každý den' },
      ];
    } else {
      v.verdict = { cls, lbl: `${periodName} plnění normy · požadavek ${req}/den · víkendy mimo`, head: !n ? 'BEZ DAT' : met === n ? 'NORMA SPLNĚNA' : 'NORMA NESPLNĚNA',
        sub: !n ? 'V období nejsou nahrané příchody (bez víkendů)' : `Celý požadavek ${req} splněn ${met} z ${n} pracovních ${n === 1 ? 'dne' : 'dní'} · ${n - met} ${dniN(n - met)} pod normou${planNote}`,
        big: n ? `${Math.round(r.pct)} %` : '–', bigL: 'plnění normy' };
      v.gauge = { pct: n ? r.pct : 0, color: cls === 'ok' ? DRC.good : cls === 'warn' ? DRC.warn : DRC.crit, kl: 'Plnění normy', foot: 'dní v normě / prac. dní' };
      v.tiles = [
        { lab: 'Denní požadavek', dot: DRC.plan, val: String(req), foot: 'norma na každý pracovní den' },
        { lab: 'Dní v normě', dot: DRC.good, val: String(met), small: `/ ${n}`, color: n && met === n ? DRC.goodT : null, foot: 'celý požadavek splněn (bez víkendů)' },
        { lab: 'Dní pod normou', dot: DRC.crit, val: String(n - met), color: n - met ? DRC.crit : DRC.goodT,
          foot: r.worst && n - met ? `nejníže ${dayText(r.worst.iso)} — dodáno ${r.worst.done}` : n ? 'požadavek splněn každý den' : 'bez dat' },
      ];
    }
    const hasPlan = r.trend.some(p => p.kind === 'plan');
    v.chart = { title: r.mode === 'year' ? `Plnění normy v roce ${r.ref.slice(0, 4)}` : r.mode === 'week' ? 'Jednotlivé dny vs. požadavek (týden)' : 'Jednotlivé dny vs. požadavek (měsíc)',
      sub: r.mode === 'year' ? 'Podíl pracovních dní se splněným celým požadavkem po měsících · cíl 100 %' : `Zeleně = požadavek ${req} splněn · červeně = pod požadavkem · víkendy mimo`,
      legend: [['Požadavek splněn', DRC.good], ['Pod požadavkem', DRC.crit], ...(hasPlan ? [['Plánovaná kapacita', DRC.acc]] : []), [r.mode === 'year' ? 'Cíl' : 'Požadavek', DRC.crit, 'dash']],
      ...drTrendChart(r) };
    const src = onlyPlan ? r.groupsPlan : r.groupsReal;
    const st = g => { const q = g.daysMet / g.cnt; return q >= 1 ? ['good', onlyPlan ? 'PLNÁ KAPACITA' : 'OK'] : q >= 0.8 ? ['warning', 'MÍRNĚ POD'] : ['critical', onlyPlan ? 'OMEZENÍ' : 'POD PLÁNEM']; };
    v.table = {
      title: onlyPlan ? 'Průměrná plánovaná kapacita po skupinách' : 'Průměr po skupinách',
      cols: [{ h: 'Skupina' }, { h: 'Ø plán', r: true }, { h: onlyPlan ? 'Ø kapacita' : 'Ø dodáno', r: true }, { h: onlyPlan ? 'Dní v plné kapacitě' : 'Dní v plánu', r: true }, { h: 'Stav' }],
      rows: src.map(g => ({ cells: [g.name, nf(g.avgPlan, 1), nf(g.avgDone, 1), `${g.daysMet}/${g.cnt}`, st(g)] })),
      empty: !n && !nfu ? 'V období nejsou nahrané příchody ani plánované dny (bez víkendů).' : '',
      total: n ? { cells: ['CELKEM', nf(r.groupsReal.filter(g => !g.extra).reduce((x, g) => x + g.avgPlan, 0), 1), nf(r.avg, 1), `${met}/${n}`, [met === n ? 'good' : r.pct >= 80 ? 'warning' : 'critical', met === n ? 'SPLNĚNO' : 'NESPLNĚNO']] } : null,
    };
    const mk = k => r.marked.filter(x => x.mark === k);
    const mkT = list => list.map(x => `${DOW[mkDay(...x.iso.split('-').map(Number)).dow]} ${dayText(x.iso, false)}${x.done != null ? ` (${x.done})` : ''}`).join(', ');
    v.notes = [r.noData ? `Bez nahraných příchodů: ${r.noData} ${pracDnyN(r.noData)} (do plnění se nepočítají).` : '',
      mk('ot').length ? `Přesčas (mimo normu): ${mkT(mk('ot'))}.` : '', mk('hol').length ? `Práce ve svátek (mimo normu): ${mkT(mk('hol'))}.` : '',
      r.weekend ? `Docházka o víkendu nebo ve svátek: ${r.weekend} ${dniN(r.weekend)} (přesčas, mimo normu).` : ''].filter(Boolean);
  }
  v.foot = `Plnění normy = podíl pracovních dní, kdy celkový počet lidí v práci dosáhl denního požadavku ${req}${r.reqOwn ? ' (KPI, Nastavení)' : ' (součet plánů skupin)'}. Dodáno = lidé ze skupin Matice dovedností s příchodem v nahrané docházce (vedoucí ne). Plán skupiny = potřeba z Plánu kapacit, jinak počet lidí ve skupině. Víkendy, svátky a dny označené jako přesčas nebo práce ve svátek jsou mimo normu, budoucí dny jsou plánovaná kapacita a do plnění se nepočítají. Lidé jen s ID. Vygenerováno ${dayText(todayIso())}.`;
  return v;
}

/* ---------- v aplikaci ---------- */
function drGaugeSvg(g) {
  const C = 2 * Math.PI * 52;
  const frac = Math.max(0, Math.min(1, g.pct / 100));
  return `<svg viewBox="0 0 120 120" class="dr-gauge" aria-hidden="true"><circle cx="60" cy="60" r="52" fill="none" stroke="${DRC.grid}" stroke-width="12"/><circle cx="60" cy="60" r="52" fill="none" stroke="${g.color}" stroke-width="12" stroke-linecap="round" transform="rotate(-90 60 60)" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - frac)).toFixed(1)}"/><text x="60" y="64" text-anchor="middle" font-size="24" font-weight="800" fill="${DRC.ink}">${Math.round(g.pct)}%</text><text x="60" y="82" text-anchor="middle" font-size="11" fill="${DRC.muted}">plnění</text></svg>`;
}
function drPill(st) { return st ? `<span class="dr-st ${st[0]}">${esc(st[1])}</span>` : ''; }
function drPaperHtml(v) {
  const tiles = `<div class="dr-kpi dr-kpi-g">${drGaugeSvg(v.gauge)}<div><b class="kl">${esc(v.gauge.kl)}</b><span class="kf">${esc(v.gauge.foot)}</span></div></div>${v.tiles.map(t => `<div class="dr-kpi"><b class="kl"><i class="dot" data-c="${t.dot}"></i>${esc(t.lab)}</b><span class="kv" data-c="${t.color || ''}">${esc(t.val)}${t.small ? ` <small>${esc(t.small)}</small>` : ''}</span><span class="kf">${esc(t.foot)}</span></div>`).join('')}`;
  const legend = `<div class="dr-legend">${v.chart.legend.map(([t, c, k]) => `<span><i class="${k || 'sq'}" data-c="${c}"></i>${esc(t)}</span>`).join('')}</div>`;
  const tb = v.table;
  const cell = (c, i) => (i === 5 && tb.cols.length === 7) || (i === 4 && tb.cols.length === 5) ? `<td>${drPill(c)}</td>` : `<td class="${tb.cols[i].r ? 'r' : ''}${tb.cols[i].wide ? ' wide' : ''}">${esc(c)}</td>`;
  const body = tb.empty ? `<tr><td colspan="${tb.cols.length}" class="dr-empty">${esc(tb.empty)}</td></tr>`
    : tb.rows.map(row => `<tr>${row.cells.map(cell).join('')}</tr>`).join('') + (tb.total ? `<tr class="tot">${tb.total.cells.map(cell).join('')}</tr>` : '');
  return `<div class="dr-paper">
    <div class="dr-head"><div class="dr-brand"><div class="dr-t1">${esc(v.title)}</div><div class="dr-org">${esc(v.org)}</div>
      <div class="dr-per"><b>${esc(v.modeName)} — ${esc(v.per.main)}</b><span>${esc(v.per.sub)}</span></div></div>
      <div class="dr-verdict ${v.verdict.cls}"><span class="lbl">${esc(v.verdict.lbl)}</span><b class="hd">${esc(v.verdict.head)}</b><span class="big">${esc(v.verdict.big)}<small>${esc(v.verdict.bigL)}</small></span><span class="sub">${esc(v.verdict.sub)}</span></div></div>
    ${v.banner ? `<div class="dr-banner"><b>PLÁN</b>${esc(v.banner)}</div>` : ''}
    <div class="dr-kpis">${tiles}</div>
    <div class="dr-card"><div class="dr-h">${esc(v.chart.title)}</div>${v.chart.sub ? `<div class="dr-sub">${esc(v.chart.sub)}</div>` : ''}${legend}<div class="dr-chart">${ctrSvg(v.chart)}</div></div>
    <div class="dr-h">${esc(tb.title)}</div>
    <div class="dr-scroll"><table class="dr-tab"><thead><tr>${tb.cols.map(c => `<th class="${c.r ? 'r' : ''}">${esc(c.h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>
    ${(v.notes || []).map(t => `<div class="dr-note">${esc(t)}</div>`).join('')}
    <div class="dr-foot">${esc(v.foot)}</div>
  </div>`;
}
function drHtml() {
  const st = drRef();
  const r = drReport(st.mode, st.ref);
  const per = drPeriodLabel(r);
  const bar = `<div class="t5-weekbar dr-bar">
      <div class="chips" role="group" aria-label="Období">${DR_MODE_T.map(([k, l]) => `<button type="button" class="chip${k === st.mode ? ' on' : ''}" data-drmode="${k}" aria-pressed="${k === st.mode}">${l}</button>`).join('')}</div>
      <div class="dr-nav"><button class="icon-btn" type="button" data-drshift="-1" aria-label="Předchozí">${I.back}</button><span class="dr-lab"><b>${esc(per.main)}</b><small>${esc(per.sub)}</small></span><button class="icon-btn t5-next" type="button" data-drshift="1" aria-label="Následující">${I.back}</button></div>
      <label class="dr-date"><span class="sr-only">Den v období</span><input type="date" id="drDate" value="${esc(st.ref)}"></label><button class="btn ghost small" type="button" data-drapply>Zobrazit</button><button class="btn ghost small" type="button" data-drtoday>Dnes</button>
      <span class="spacer"></span>
      <button class="btn sec" type="button" data-drxlsx>Excel</button>
      <button class="btn" type="button" data-drpdf>PDF</button>
    </div>`;
  const dm = st.mode === 'day' ? (S.workAudit.drep.marks[st.ref] || '') : '';
  const markBar = st.mode === 'day' ? `<div class="dr-mark"><span>Den v plnění normy:</span><div class="chips" role="group" aria-label="Den v plnění normy">${[['', r.d.work ? 'Počítá se' : 'Víkend / svátek'], ['ot', 'Přesčas'], ['hol', 'Práce ve svátek']].map(([k, l]) => `<button type="button" class="chip${dm === k ? ' on' : ''}" data-drmark="${k}" aria-pressed="${dm === k}">${l}</button>`).join('')}</div>
      <small class="muted">${dm ? `Den se do týdenního, měsíčního a ročního plnění normy nepočítá (${DR_MARK[dm]}).` : r.d.work ? 'Pracovní den, počítá se do plnění normy.' : 'Víkend a svátek jsou mimo normu vždy.'}</small></div>` : '';
  const hint = dvHas() ? '' : `<div class="note w">Zatím nejsou nahrané příchody. Report ukáže skutečnost po nahrání souboru s docházkou (záložka Lidé v práci). <button class="btn small" type="button" data-dvpick>Nahrát docházku</button></div>`;
  return `${bar}${markBar}${drSetHtml()}${hint || drCheckHtml(st)}${drPaperHtml(drView(r))}`;
}
/* Proč report nemusí ukazovat lidi (2.42.1): den bez příchodů, ID mimo Lidi, lidé bez skupiny. */
function drCheckHtml(st) {
  const today = todayIso();
  const dates = drDates(st.mode, st.ref).filter(iso => iso <= today);
  const p = drPairing(dates);
  const out = [];
  if (!p.days) {
    const last = dvLastPres(dates.length ? dates[dates.length - 1] : today) || dvLastPres('9999-12-31');
    out.push(`<div class="note w dr-check"><b>${st.mode === 'day' ? 'Na tento den' : 'V tomto období'} nejsou nahrané žádné příchody</b>, report ukazuje jen plán.${last ? ` Poslední den s příchody je ${esc(dayText(last))}. <button class="btn small" type="button" data-drgo="${esc(last)}">Zobrazit ${esc(dayText(last))}</button>` : ''}</div>`);
  }
  if (p.unknown.length) out.push(`<div class="note e dr-check"><b>${p.unknown.length} ${p.unknown.length === 1 ? 'ID ze souboru není' : 'ID ze souboru nejsou'} u nikoho v Lidech</b>, ${p.unknown.length === 1 ? 'tenhle člověk se' : 'tihle lidé se'} do skupin nepočítají: ${p.unknown.slice(0, 15).map(esc).join(', ')}${p.unknown.length > 15 ? '…' : ''}. Doplň ID v kartě člověka (Lidé), nebo hromadně v Nastavení (ID zaměstnanců). <button class="link" type="button" data-go="lide">Otevřít Lidi</button></div>`);
  if (p.noGroup.length) out.push(`<div class="note w dr-check"><b>${p.noGroup.length} ${p.noGroup.length === 1 ? 'člověk s příchodem nemá' : 'lidí s příchodem nemá'} skupinu v Matici</b>, v reportu ${p.noGroup.length === 1 ? 'je' : 'jsou'} jen v řádku Bez skupiny: ${p.noGroup.slice(0, 10).map(x => esc(x.name)).join(', ')}${p.noGroup.length > 10 ? '…' : ''}. <button class="link" type="button" data-go="lide">Zařadit v Lidech</button></div>`);
  return out.join('');
}
/* Skupiny reportu (2.41): název a oddělení z Matice; oddělení patří nejvýš jedné skupině. */
function drSetHtml() {
  const dr = S.workAudit.drep;
  const depts = departments();
  const owner = new Map();
  dr.groups.forEach(g => g.depts.forEach(d => owner.set(d, g)));
  const free = depts.filter(d => !owner.has(d));
  const rows = dr.groups.map(g => `<div class="dr-rg" data-drrg="${esc(g.id)}">
      <div class="dr-rg-head"><input type="text" maxlength="60" value="${esc(g.name)}" data-drrgname="${esc(g.id)}" aria-label="Název skupiny"><button type="button" class="icon-btn" data-drrgdel="${esc(g.id)}" title="Smazat skupinu" aria-label="Smazat skupinu ${esc(g.name)}">×</button></div>
      <div class="chips">${[...new Set([...depts, ...g.depts])].map(d => {
        const on = g.depts.includes(d), other = !on && owner.get(d);
        return `<button type="button" class="chip${on ? ' on' : ''}${other ? ' other' : ''}" data-drrgdept="${esc(g.id)}" data-dept="${esc(d)}" aria-pressed="${on}"${other ? ` title="Teď ve skupině ${esc(other.name)}, klepnutím přesunete"` : ''}>${esc(d)}${depts.includes(d) ? '' : ' (už není)'}${other ? ` <small>· ${esc(other.name)}</small>` : ''}</button>`;
      }).join('')}</div></div>`).join('');
  return `<details class="card dr-set"${ui.wa.drSet ? ' open' : ''}><summary><b>Skupiny reportu</b><span class="muted small">${dr.groups.length ? `${dr.groups.length} ${dr.groups.length === 1 ? 'skupina' : dr.groups.length <= 4 ? 'skupiny' : 'skupin'}${free.length ? ` · bez skupiny: ${free.map(esc).join(', ')}` : ''}` : 'report je po skupinách Matice dovedností'}</span></summary>
    <p class="small muted">Skupina reportu sečte skupiny Matice z vybraných oddělení (plán i lidi v práci). Oddělení může být jen v jedné skupině; oddělení bez skupiny zůstanou v reportu po skupinách Matice.</p>
    ${rows || '<p class="small muted">Zatím žádná skupina.</p>'}
    <button type="button" class="btn sec small" data-drrgadd>+ Přidat skupinu</button></details>`;
}
function drPaint(root) { $$('[data-c]', root).forEach(el => { const c = el.dataset.c; if (!c) return; if (el.classList.contains('kv')) el.style.color = c; else el.style.setProperty('--c', c); }); }

/* ---------- PDF (A4 na výšku, souřadnice v px jako Kapacity a zaškolení: 1280 px = 210 mm) ---------- */
function pdfDrPage(P, v) {
  const { doc } = P;
  const X = 56, CW = 1168, TOP = 48, BOT = P.PH - 60;
  let y = TOP;
  // záhlaví vlevo, výrok vpravo
  const VW = 360, LW = CW - VW - 28;
  let ly = y;
  const put = (t, px, o, gap) => { P.split(t, px, LW, o).forEach(ln => { P.text(ln, X, ly + px, px, o); ly += px * 1.3; }); ly += gap; };
  put(v.title, 32, { b: true }, 4);
  put(v.org, 13, { c: DRC.txt2 }, 18);
  put(`${v.modeName} — ${v.per.main}`, 24, { b: true }, 2);
  put(v.per.sub, 14, { c: DRC.muted }, 0);
  const vx = X + CW - VW, vr = vx + VW - 22;
  const subL = P.split(v.verdict.sub, 13, VW - 44);
  const lblL = P.split(v.verdict.lbl.toUpperCase(), 11, VW - 44, { b: true });
  const vh = Math.max(ly - y, 22 + lblL.length * 15 + 36 + 54 + subL.length * 17 + 16);
  P.box(vx, y, VW, vh, { fill: DR_VC[v.verdict.cls], r: 14 });
  let vy = y + 22;
  lblL.forEach(ln => { P.text(ln, vr, vy + 11, 11, { b: true, c: '#FFFFFF', a: 'end' }); vy += 15; });
  P.text(v.verdict.head, vr, vy + 30, 28, { b: true, c: '#FFFFFF', a: 'end' }); vy += 36;
  const bigW = P.width(v.verdict.bigL, 14);
  P.text(v.verdict.bigL, vr, vy + 44, 14, { c: '#FFFFFF', a: 'end' });
  P.text(v.verdict.big, vr - bigW - 10, vy + 44, 44, { b: true, c: '#FFFFFF', a: 'end' }); vy += 54;
  subL.forEach(ln => { P.text(ln, vr, vy + 13, 13, { c: '#FFFFFF', a: 'end' }); vy += 17; });
  y += vh + 22;
  if (v.banner) {
    const bl = P.split(v.banner, 13, CW - 120);
    const bh = 18 + bl.length * 17;
    P.box(X, y, CW, bh, { fill: DRC.planS, r: 10 });
    P.box(X + 14, y + bh / 2 - 11, 56, 22, { fill: DRC.planBox, r: 11 });
    P.text('PLÁN', X + 42, y + bh / 2 + 5, 12, { b: true, c: '#FFFFFF', a: 'middle' });
    bl.forEach((ln, i) => P.text(ln, X + 84, y + 9 + 13 + i * 17, 13, { c: DRC.planBox }));
    y += bh + 18;
  }
  // dlaždice: ukazatel plnění a tři čísla
  const TW = (CW - 3 * 16) / 4;
  const footL = v.tiles.map(t => P.split(t.foot, 12, TW - 36));
  const gFoot = P.split(v.gauge.foot, 12, TW - 150);
  const TH = Math.max(132, 20 + 18 + 46 + Math.max(...footL.map(f => f.length)) * 15.6 + 16);
  v.tiles.concat([null]).forEach((t, k) => {
    const i = k === 3 ? 0 : k + 1;
    const tx = X + i * (TW + 16);
    P.box(tx, y, TW, TH, { stroke: DRC.line, r: 12 });
    if (i === 0) {
      const cx = tx + 20 + 50, cy = y + TH / 2, rr = 42;
      const ring = (a0, a1, c) => {
        const pts = [];
        const steps = Math.max(2, Math.ceil(((a1 - a0) / (2 * Math.PI)) * 90));
        for (let s2 = 0; s2 <= steps; s2 += 1) { const a = a0 + ((a1 - a0) * s2) / steps; pts.push([cx + rr * Math.sin(a), cy - rr * Math.cos(a)]); }
        P.poly(pts, c, 12);
      };
      ring(0, 2 * Math.PI, DRC.grid);
      const frac = Math.max(0, Math.min(1, v.gauge.pct / 100));
      if (frac > 0) ring(0, 2 * Math.PI * frac, v.gauge.color);
      P.text(`${Math.round(v.gauge.pct)}%`, cx, cy + 8, 22, { b: true, c: DRC.ink, a: 'middle' });
      P.text(v.gauge.kl, tx + 134, y + 36, 13, { b: true, c: DRC.txt2 });
      gFoot.forEach((ln, j) => P.text(ln, tx + 134, y + 58 + j * 15.6, 12, { c: DRC.muted }));
      return;
    }
    let ty = y + 18;
    P.dot(tx + 24, ty + 8, 5, t.dot);
    P.text(t.lab, tx + 36, ty + 13, 13, { b: true, c: DRC.txt2 });
    ty += 24;
    P.text(t.val, tx + 18, ty + 36, 36, { b: true, c: t.color || DRC.ink });
    if (t.small) P.text(t.small, tx + 18 + P.width(t.val, 36, { b: true }) + 8, ty + 36, 18, { c: DRC.muted });
    ty += 48;
    footL[i - 1].forEach(ln => { P.text(ln, tx + 18, ty + 12, 12, { c: DRC.muted }); ty += 15.6; });
  });
  y += TH + 24;
  // graf v rámečku
  const inner = CW - 40;
  const chH = (v.chart.vb[1] * inner) / v.chart.vb[0];
  const legH = 22;
  const subH = v.chart.sub ? 20 : 0;
  const boxH = 20 + 22 + subH + legH + 8 + chH + 12;
  if (y + boxH > BOT) { doc.addPage('a4', 'portrait'); y = TOP; }
  P.box(X, y, CW, boxH, { stroke: DRC.line, r: 12 });
  let cy2 = y + 20;
  P.text(v.chart.title, X + 20, cy2 + 17, 18, { b: true, c: DRC.ink }); cy2 += 26;
  if (v.chart.sub) { P.text(v.chart.sub, X + 20, cy2 + 12, 12, { c: DRC.muted }); cy2 += subH; }
  let lx = X + 20;
  v.chart.legend.forEach(([t, c, k]) => {
    if (k === 'dash') P.line(lx, cy2 + 8, lx + 18, cy2 + 8, c, 2, [4, 3]); else P.box(lx, cy2 + 2, 12, 12, { fill: c, r: 3 });
    const w0 = k === 'dash' ? 18 : 12;
    P.text(t, lx + w0 + 6, cy2 + 12, 12, { c: DRC.txt2 });
    lx += w0 + 6 + P.width(t, 12) + 20;
  });
  cy2 += legH + 8;
  pdfCtrChart(P, v.chart, X + 20, cy2, inner);
  y += boxH + 24;
  // tabulka
  const tb = v.table;
  const nc = tb.cols.length;
  const wide = tb.cols.findIndex(c => c.wide);
  const stCol = nc === 7 ? 5 : 4;
  const txt = (c, i) => (i === stCol ? (c ? c[1] : '') : String(c == null ? '' : c));
  const want = tb.cols.map((c, i) => Math.max(P.width(c.h.toUpperCase(), 11, { b: true }), ...[...tb.rows, ...(tb.total ? [tb.total] : [])].map(rw => P.width(txt(rw.cells[i], i), 14, { b: i === 0 }) + (i === stCol ? 24 : 0))) + 24);
  let ws = want.slice();
  ws[0] = Math.max(ws[0], 190);
  const sum = ws.reduce((a, b) => a + b, 0);
  if (wide >= 0) { const rest = sum - ws[wide]; ws[wide] = Math.max(160, CW - rest); }
  const tot = ws.reduce((a, b) => a + b, 0);
  ws = ws.map(w => (w * CW) / tot);
  const xs = ws.map((_, i) => X + ws.slice(0, i).reduce((a, b) => a + b, 0));
  const head = () => {
    P.text(tb.title, X, y + 17, 18, { b: true, c: DRC.ink }); y += 30;
    tb.cols.forEach((c, i) => P.text(c.h.toUpperCase(), c.r ? xs[i] + ws[i] - 12 : xs[i] + 12, y + 12, 11, { b: true, c: DRC.muted, a: c.r ? 'end' : undefined }));
    y += 20;
    P.line(X, y, X + CW, y, '#CCCCCC', 2);
  };
  if (y + 30 + 20 + 40 > BOT) { doc.addPage('a4', 'portrait'); y = TOP; }
  head();
  const row = (rw, total) => {
    const lines = rw.cells.map((c, i) => (i === stCol ? [txt(c, i)] : P.split(txt(c, i), 14, ws[i] - 24, { b: i === 0 || total })));
    const h = 16 + Math.max(...lines.map(l => l.length)) * 18.2;
    if (y + h > BOT) { doc.addPage('a4', 'portrait'); y = TOP; head(); }
    if (total) P.box(X, y, CW, h, { fill: DRC.soft });
    rw.cells.forEach((c, i) => {
      if (i === stCol) {
        if (!c) return;
        const [bg, fg] = DR_ST[c[0]] || DR_ST.good;
        const w = P.width(c[1], 11, { b: true }) + 20;
        P.box(xs[i] + 10, y + h / 2 - 11, w, 22, { fill: bg, r: 11 });
        P.text(c[1], xs[i] + 20, y + h / 2 + 4, 11, { b: true, c: fg });
        return;
      }
      const col = tb.cols[i];
      lines[i].forEach((ln, j) => P.text(ln, col.r ? xs[i] + ws[i] - 12 : xs[i] + 12, y + 8 + 14 + j * 18.2, 14, { b: i === 0 || total, c: i === nc - 1 && wide >= 0 ? DRC.txt2 : DRC.ink, a: col.r ? 'end' : undefined }));
    });
    y += h;
    P.line(X, y, X + CW, y, '#EEEEEE', 1);
  };
  if (tb.empty) { P.text(tb.empty, X + CW / 2, y + 26, 14, { c: DRC.muted, a: 'middle' }); y += 40; }
  else { tb.rows.forEach(rw => row(rw, false)); if (tb.total) row(tb.total, true); }
  y += 18;
  const notes = [...(v.notes || []), v.foot];
  const nl = notes.flatMap(t => P.split(t, 12, CW));
  if (y + 12 + nl.length * 16 > BOT) { doc.addPage('a4', 'portrait'); y = TOP; }
  P.line(X, y, X + CW, y, '#EEEEEE', 1);
  y += 10;
  nl.forEach(ln => { P.text(ln, X, y + 12, 12, { c: DRC.muted }); y += 16; });
}
async function exportDrPdf(button) {
  const st = drRef();
  const r = drReport(st.mode, st.ref);
  const v = drView(r);
  await withPdf(button, doc => {
    doc.setProperties({ title: `Report docházky · ${v.per.main}`, creator: EXPORT_NAME });
    const P = ctrPdf(doc);
    pdfDrPage(P, v);
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i += 1) {
      doc.setPage(i);
      P.text(`${EXPORT_NAME} · Report docházky · ${v.modeName} — ${v.per.main}`, 56, P.PH - 22, 11, { c: DRC.muted });
      P.text(`Strana ${i} / ${n}`, 1224, P.PH - 22, 11, { c: DRC.muted, a: 'end' });
    }
    downloadFile(`report-dochazky-${st.mode === 'day' ? r.from : `${r.from}-${r.to}`}.pdf`, doc.output('blob'), 'application/pdf');
  }, 'portrait');
}
async function exportDrXlsx() {
  const st = drRef();
  const r = drReport(st.mode, st.ref);
  try {
    const X = await xlsx();
    const wb = X.utils.book_new();
    drSheets(r).forEach(sheet => {
      const ws = X.utils.aoa_to_sheet(sheet.rows.map(row => row.map(safeCell)));
      ws['!cols'] = sheet.cols.map(wch => ({ wch }));
      X.utils.book_append_sheet(wb, ws, sheet.name);
    });
    downloadFile(`report-dochazky-${st.mode === 'day' ? r.from : `${r.from}-${r.to}`}.xlsx`, new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch (error) { toast(`Export se nepovedl: ${error.message}`, true); }
}

function dvHas() { const dv = S.workAudit.dv; return !!(Object.keys(dv.pres).length || Object.keys(dv.perf).length); }
function dvMonths() { const dv = S.workAudit.dv; return [...new Set([...Object.keys(dv.pres).map(i => i.slice(0, 7)), ...Object.keys(dv.perf)])].sort().reverse(); }
/* Výchozí den: dnes, když je nahraný (nebo není nic), jinak poslední den s docházkou. */
function dvPickDay() {
  const days = dvDays();
  const today = todayIso();
  if (!WA_ISO.test(ui.wa.dvDay || '')) ui.wa.dvDay = days.includes(today) || !days.length ? today : days[days.length - 1];
  return ui.wa.dvDay;
}
function dvPickMonth() {
  const months = dvMonths();
  if (!months.includes(ui.wa.dvMonth)) ui.wa.dvMonth = months.includes(todayIso().slice(0, 7)) ? todayIso().slice(0, 7) : months[0] || todayIso().slice(0, 7);
  return ui.wa.dvMonth;
}
/* Speciální „projekty“ (vedoucí, bez skupiny, neznámé ID) jdou v pořadí na konec. */
const dvSpecial = g => g.id === 'lead' || g.id === '-' || g.id === '?';

function dvHtml() {
  if (!dvHas()) return dvStartHtml();
  const mode = ui.wa.dvMode === 'month' ? 'month' : 'day';
  const chips = `<div class="chips" role="group" aria-label="Zobrazení">${[['day', 'Den'], ['month', 'Měsíc']].map(([k, t]) => `<button type="button" class="chip${k === mode ? ' on' : ''}" data-dvmode="${k}" aria-pressed="${k === mode}">${t}</button>`).join('')}</div>`;
  return (mode === 'month' ? dvMonthHtml(chips) : dvDayHtml(chips)) + dvFilesHtml();
}

function dvStartHtml() {
  const c = S.workAudit.dv.cols;
  const li = (l, t) => `<tr><th scope="row">${esc(l)}</th><td>${esc(t)}</td></tr>`;
  return `<div class="wa-start">
    <div class="card wa-src"><div class="wa-src-head"><span class="wa-step">1</span><div><h3>List „Docházka“</h3><p class="small muted">Jeden řádek = jeden zaměstnanec. Nad každou dvojicí sloupců je datum dne, pod ním příchod a odchod.</p></div></div>
      <table class="wa-cols"><tbody>${li(c.att.id, 'ID zaměstnance')}${li(c.att.first, 'první den: příchod (např. 1. 10. 2026)')}${li(colLetter(waIndex(c.att.first) + 1), 'první den: odchod')}${li('…', 'další dny vždy o dva sloupce dál')}</tbody></table></div>
    <div class="card wa-src"><div class="wa-src-head"><span class="wa-step">2</span><div><h3>List „vykázaná práce“</h3><p class="small muted">Každý řádek je záznam práce. Sloupec s datem, když v listu je, se najde sám.</p></div></div>
      <table class="wa-cols"><tbody>${['id', 'part', 'op', 'order', 'done', 'time'].map(k => li(c.work[k], DV_COL_LABEL[k])).join('')}</tbody></table></div>
  </div>
  <div class="row gap"><button class="btn" type="button" data-dvpick>Nahrát docházku a výkony</button></div>
  <p class="hint">Z docházky vznikne denní report obsazenosti, i pro dnešek: kolik lidí je v práci a na jakých projektech. Projekt je skupina v Matici dovedností, ID se páruje s ID zaměstnance v Lidech. Z vykázané práce je produktivita v profilu každého člověka (koláč dílů, využití času, kusy za hodinu). Docházka pro odměny se tím nemění. Písmena sloupců změníš v <button class="link" type="button" data-watabgo="nastaveni" data-wafocus="dvColsCard">Nastavení</button>.</p>`;
}

/* ---------- den: kdo je v práci a na jakém projektu ---------- */
function dvDayHtml(chips) {
  const iso = dvPickDay();
  const today = todayIso();
  const d = dvDay(iso);
  const days = dvDays();
  const list = [...new Set([...days, today, iso])].sort().reverse();
  const prev = days.filter(x => x < iso).pop();
  const next = days.find(x => x > iso);
  const bar = `<div class="t5-weekbar dv-bar">${chips}
    <button class="icon-btn" type="button" data-dvday="${prev || ''}" aria-label="Předchozí den s docházkou"${prev ? '' : ' disabled'}>${I.back}</button>
    <select id="dvDaySel" aria-label="Den">${list.map(x => `<option value="${x}"${x === iso ? ' selected' : ''}>${esc(`${ktDay(x)} ${x.slice(0, 4)}${x === today ? ' · dnes' : ''}${days.includes(x) ? '' : ' · nenahráno'}`)}</option>`).join('')}</select>
    <button class="icon-btn t5-next" type="button" data-dvday="${next || ''}" aria-label="Další den s docházkou"${next ? '' : ' disabled'}>${I.back}</button>
    ${iso !== today ? `<button class="btn sec small" type="button" data-dvday="${today}">Dnes</button>` : ''}
    <span class="spacer"></span>
    ${d.n ? '<button class="btn sec" type="button" data-dvpdf>Denní report do PDF</button>' : ''}
  </div>`;
  if (!d.n) {
    return `${bar}<div class="card">${emptyState(iso === today ? 'Dnešní příchody zatím nejsou nahrané' : `Na ${esc(dayText(iso))} není docházka`,
      iso === today ? 'Nahraj soubor s docházkou, kde je už dnešní den (stačí příchody). Hned uvidíš, kolik lidí je v práci a na jakých projektech.' : 'V nahraných souborech tenhle den chybí, nebo ten den nikdo nepřišel.',
      '<button class="btn" type="button" data-dvpick>Nahrát docházku a výkony</button>')}</div>`;
  }
  const isToday = iso === today;
  const groups = d.groups.slice().sort((a, b) => dvSpecial(a) - dvSpecial(b) || b.n - a.n);
  const max = Math.max(1, ...groups.map(g => g.n));
  const projects = d.groups.filter(g => !dvSpecial(g)).length;
  const tiles = `<div class="stats">${[
    statTile('Přišlo do práce', String(d.n), `${ktDay(iso, true)} ${iso.slice(0, 4)}`),
    ...(isToday ? [statTile('Teď v práci', String(d.now), 'přišli a ještě neodešli', 'good')] : []),
    statTile('Hodiny v práci', dvH(d.min, 0), d.open ? `${d.open} ${isToday ? 'zatím bez odchodu' : 'bez odchodu (nepočítá se)'}` : 'všichni s odchodem'),
    statTile('Projekty', String(projects), projects ? 'skupiny v Matici s lidmi v práci' : 'nikdo nemá skupinu'),
    statTile('Neznámé ID', String(d.unknown.length), d.unknown.length ? 'ID není u nikoho v Lidech' : 'všichni spárovaní', d.unknown.length ? 'crit' : ''),
  ].join('')}</div>`;
  const bars = `<div class="card"><div class="card-head"><div><h3>Lidé v práci po projektech</h3><p class="small muted">Projekt je skupina v Matici dovedností${iso < today ? ', kam člověk ten den patřil' : ''}. ${isToday ? 'Číslo je počet lidí, kteří dnes přišli; v popisku je i kolik jich je v práci teď.' : 'Číslo je počet lidí, kteří ten den přišli.'}</p></div></div>
    <div class="wa-charts dv-bars-wrap"><ul class="chart dv-bars">${groups.map(g => `<li class="hit${dvSpecial(g) ? ' dv-spec' : ''}" tabindex="0" data-tip="${esc(`${g.name}: ${g.n} ${lidiN(g.n)}${isToday ? `, teď v práci ${g.now}` : ''}, ${dvH(g.min)} v práci`)}">
      <span class="dv-bl">${esc(g.name)}</span><span class="dv-track"><i data-w="${(g.n / max * 100).toFixed(1)}"></i></span><b class="num">${g.n}${isToday && g.now !== g.n ? `<small> · teď ${g.now}</small>` : ''}</b></li>`).join('')}</ul>
      <div class="chart-tip" hidden></div></div></div>`;
  const people = groups.map(g => `<div class="card dv-proj"><div class="dv-proj-head"><h4>${esc(g.name)}</h4><span class="num">${g.n} ${lidiN(g.n)}</span></div>
    <div class="table-card flat"><table class="dv-ppl"><thead><tr><th>Zaměstnanec</th><th class="r">Příchod</th><th class="r">Odchod</th><th class="r">Hodiny</th></tr></thead><tbody>${g.people.map(x => `<tr>
      <td class="name" data-label="Zaměstnanec">${x.e ? `<button class="linkish" type="button" data-dvperson="${esc(x.key)}">${esc(x.name)}</button>` : '<span class="crit">není v Lidech</span>'}<span class="dv-wid"><small class="muted num">ID ${esc(x.wid)}</small>${x.now ? ' <span class="tag good">v práci</span>' : ''}</span></td>
      <td class="r num" data-label="Příchod">${dvClockText(x.in)}</td>
      <td class="r num" data-label="Odchod">${x.out == null ? (isToday ? '<span class="muted">—</span>' : '<span class="tag wa-miss">chybí</span>') : dvClockText(x.out)}</td>
      <td class="r num" data-label="Hodiny">${x.min == null ? '<span class="muted">—</span>' : dvH(x.min)}</td></tr>`).join('')}</tbody></table></div></div>`).join('');
  return `${bar}${tiles}${bars}<h3 class="dv-sub">Kdo je kde</h3><div class="dv-projs">${people}</div>
    ${d.unknown.length ? `<p class="hint">ID ${d.unknown.slice(0, 10).map(esc).join(', ')}${d.unknown.length > 10 ? '…' : ''} nemá nikdo v Lidech. Doplň ID zaměstnance v kartě člověka (Upravit zařazení) a docházka se mu přiřadí i zpětně.</p>` : ''}`;
}

/* ---------- měsíc: obsazenost po dnech a produktivita ---------- */
function dvMonthHtml(chips) {
  const month = dvPickMonth();
  const m = dvMonth(month);
  const months = dvMonths();
  const bar = `<div class="t5-weekbar dv-bar">${chips}
    <select id="dvMonthSel" aria-label="Měsíc">${(months.includes(month) ? months : [month, ...months]).map(x => `<option value="${x}"${x === month ? ' selected' : ''}>${esc(monthLabel(x))}</option>`).join('')}</select>
    <span class="spacer"></span><button class="btn sec" type="button" data-dvxlsx>Excel za měsíc</button></div>`;
  const t = m.tot;
  const tiles = `<div class="stats">${[
    statTile('Dny s docházkou', String(t.days), t.avg != null ? `Ø ${nf(t.avg, 1)} lidí na den` : 'bez docházky'),
    statTile('Hodiny v práci', dvH(t.min, 0), 'z příchodů a odchodů'),
    statTile('Vykázaný čas', dvH(t.t, 0), m.perf ? 'z vykázané práce' : 'výkony za měsíc nejsou nahrané'),
    statTile('Využití', dvPct(t.util), 'vykázaný čas ÷ čas v práci', t.util != null && t.util < 0.7 ? 'crit' : t.util != null ? 'good' : ''),
    statTile('Dokončeno', `${nf(t.g, 0)} ks`, t.perHour != null ? `${nf(t.perHour, 1)} ks za vykázanou hodinu` : '—'),
  ].join('')}</div>`;
  const cols = m.groups.filter(g => m.days.some(d => d.by[g.id]));
  const dayRows = m.days.map(d => `<tr class="wa-row${d.day.work ? '' : ' wa-off'}" data-dvgo="${d.iso}" tabindex="0">
    <td class="name nowrap" data-label="Den"><b class="num">${esc(ktDay(d.iso))}</b>${waDayTag(d.day)}</td>
    ${cols.map(g => `<td class="r num" data-label="${esc(g.name)}">${d.by[g.id] || '<span class="muted">·</span>'}</td>`).join('')}
    <td class="r num" data-label="Celkem"><b>${d.n}</b></td><td class="r num" data-label="Hodiny">${dvH(d.min, 0)}</td></tr>`).join('');
  const occ = m.days.length ? `<div class="card"><div class="card-head"><div><h3>Obsazenost po dnech</h3><p class="small muted">Počet lidí, kteří přišli, po projektech. Klik na den ukáže, kdo byl kde.</p></div></div>
    <div class="table-card flat dv-occ"><table class="stack"><thead><tr><th>Den</th>${cols.map(g => `<th class="r">${esc(g.name)}</th>`).join('')}<th class="r">Celkem</th><th class="r">Hodiny</th></tr></thead><tbody>${dayRows}</tbody></table></div></div>` : '';
  const gRows = m.groups.filter(g => g.people).map(g => `<tr><td class="name" data-label="Projekt"><b>${esc(g.name)}</b></td><td class="r num" data-label="Lidí">${g.people}</td>
    <td class="r num" data-label="V práci">${dvH(g.min, 0)}</td><td class="r num" data-label="Vykázáno">${dvH(g.t, 0)}</td><td class="r num" data-label="Využití">${dvPct(g.util)}</td>
    <td class="r num" data-label="Dokončeno">${nf(g.g, 0)}</td><td class="r num" data-label="Ks/h">${g.perHour != null ? nf(g.perHour, 1) : '—'}</td></tr>`).join('');
  const sort = DV_SORTS.some(s => s[0] === ui.wa.dvSort) ? ui.wa.dvSort : 'group';
  const ppl = sort === 'group' ? m.people : m.people.slice().sort((a, b) => (b[sort] == null ? -1 : b[sort]) - (a[sort] == null ? -1 : a[sort]));
  const pRows = ppl.map(q => `<tr${q.key ? ` data-dvperson="${esc(q.key)}" tabindex="0" class="dv-click"` : ''}>
    <td class="name" data-label="Zaměstnanec">${q.e ? `<b>${esc(q.name)}</b>` : '<span class="crit">není v Lidech</span>'} <small class="muted num">ID ${esc(q.wid)}</small></td>
    <td data-label="Projekt">${esc(q.gr.name)}</td><td class="r num" data-label="Dny">${q.days}</td><td class="r num" data-label="V práci">${dvH(q.min, 0)}</td>
    <td class="r num" data-label="Vykázáno">${dvH(q.t)}</td><td class="r num" data-label="Využití">${dvPct(q.util)}</td><td class="r num" data-label="Dokončeno">${nf(q.g, 0)}</td>
    <td class="r num" data-label="Ks/h">${q.perHour != null ? nf(q.perHour, 1) : '—'}</td><td class="wrap" data-label="Hlavní díl">${q.top ? esc(q.top) : '<span class="muted">—</span>'}</td></tr>`).join('');
  return `${bar}${tiles}${occ}
    ${gRows ? `<div class="card"><h3>Po projektech</h3><div class="table-card flat"><table class="stack"><thead><tr><th>Projekt</th><th class="r">Lidí</th><th class="r">V práci</th><th class="r">Vykázáno</th><th class="r">Využití</th><th class="r">Dokončeno ks</th><th class="r">Ks/h</th></tr></thead><tbody>${gRows}</tbody></table></div></div>` : ''}
    <div class="card"><div class="card-head"><div><h3>Produktivita lidí</h3><p class="small muted">Využití = vykázaný čas ÷ čas v práci. Ks/h = dokončené množství za hodinu vykázaného času. Klik na člověka otevře profil s koláčem dílů.</p></div>
      <div class="chips" role="group" aria-label="Řazení">${DV_SORTS.map(([k, l]) => `<button type="button" class="chip${k === sort ? ' on' : ''}" data-dvsort="${k}" aria-pressed="${k === sort}">${l}</button>`).join('')}</div></div>
      ${pRows ? `<div class="table-card flat"><table class="stack dv-people"><thead><tr><th>Zaměstnanec</th><th>Projekt</th><th class="r">Dny</th><th class="r">V práci</th><th class="r">Vykázáno</th><th class="r">Využití</th><th class="r">Dokončeno ks</th><th class="r">Ks/h</th><th>Hlavní díl</th></tr></thead><tbody>${pRows}</tbody></table></div>` : '<p class="small muted">Za měsíc nic.</p>'}</div>`;
}

function dvFilesHtml() {
  const files = S.workAudit.dv.files.slice(-8).reverse();
  if (!files.length) return '';
  return `<details class="card dv-files"><summary><b>Nahrané soubory docházky a výkonů</b> <span class="muted small">(${S.workAudit.dv.files.length})</span></summary>
    <div class="table-card flat"><table class="stack"><thead><tr><th>Soubor</th><th>Docházka</th><th class="r">Lidí</th><th>Výkony</th><th>Nahrál</th></tr></thead><tbody>${files.map(f => `<tr>
      <td class="wrap name" data-label="Soubor"><b>${esc(f.name || '—')}</b></td>
      <td class="num" data-label="Docházka">${f.days ? `${esc(dayText(f.from))} – ${esc(dayText(f.to))}` : '—'}</td><td class="r num" data-label="Lidí">${f.people || '—'}</td>
      <td data-label="Výkony">${f.rows ? `${f.rows} ${zaznamN(f.rows)} · ${esc(f.months.map(monthLabel).join(', '))}` : '—'}</td>
      <td data-label="Nahrál">${esc(f.by || '—')}<small class="muted"> ${esc(tsText(f.at))}</small></td></tr>`).join('')}</tbody></table></div></details>`;
}

/* Karta nastavení: sloupce obou listů a jednotka času. */
function dvSettingsHtml() {
  const dv = S.workAudit.dv;
  return `<div class="card" id="dvColsCard"><h3>Docházka a výkony z jednoho souboru</h3>
    <p class="small muted">Docházka (výchozí 2. list, ${esc(dv.sheets.att || 'podle názvu nebo pořadí')}): ID zaměstnance a první den (příchod, vedle odchod; každý další den o dva sloupce dál, datum v hlavičce). Vykázaná práce (${esc(dv.sheets.work || 'druhý list')}). Písmena jako v Excelu. Při každém nahrání se ukáže, jak se soubor načte, a jde to upravit.</p>
    <div class="wa-colgrid">${DV_SET_COLS.map(([kind, key, label]) => `<label class="field wa-letter"><span>${esc(label)}</span><input value="${esc(dv.cols[kind][key])}" maxlength="3" data-dvcol="${kind}.${key}" placeholder="—" autocapitalize="characters"></label>`).join('')}</div>
    <label class="field dv-unit"><span>Strávený čas je v</span><select id="dvUnit">${[['auto', 'najít podle hodnot a hlavičky'], ['min', 'minutách'], ['h', 'hodinách']].map(([k, l]) => `<option value="${k}"${dv.unit === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="row gap"><button class="btn ghost small" type="button" data-dvcolreset>Vrátit výchozí sloupce</button>${ui.me && ui.me.ai ? '<button class="btn sec small" type="button" data-dvaipick>' + I.sparkle + '<span>Nastavit načtení podle souboru…</span></button><span class="tiny muted">AI dostane jen nadpisy prvních řádků, ne jména ani hodnoty.</span>' : '<button class="btn sec small" type="button" data-dvaipick>Nastavit načtení podle souboru…</button>'}</div></div>`;
}

/* ---------- jak se soubor načte: AI návrh, ruční úprava a vzor prvního člověka (2.42.3) ---------- */
/* AI dostane jen nadpisy prvních řádků a typy buněk (dvAiSample). Bez AI se začne od uloženého
   nastavení. Vrací {cfg} po potvrzení (uloží se do dv), nebo null. */
const DV_UNIT_T = { auto: 'najít sám', min: 'v minutách', h: 'v hodinách' };
async function dvAiPropose(sheets) {
  if (!(ui.me && ui.me.ai)) return null;
  const sample = dvAiSample(sheets, Object.values(S.employees));
  if (!sample.length) return null;
  toast('AI čte nadpisy souboru…');
  try { return await Vault.api('ai_columns', { method: 'POST', body: { sheets: sample } }); } catch (error) { toast(`AI: ${error.message} Použije se uložené nastavení.`, true); return null; }
}
function dvPrevHtml(sheets, cfg) {
  const dvx = { cols: cfg.cols, unit: cfg.unit, sheets: cfg.sheets };
  const p = dvParse(sheets, dvx, cfg.unit);
  const v = dvPreview(p, 3);
  const t = m => (m == null ? '—' : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`);
  // zaokrouhlený čas (2.46) vedle času ze souboru, když se liší
  const tr = (m, r) => (r == null || r === m ? t(m) : `${t(m)} <span class="muted">→</span> <b>${t(r)}</b>`);
  const who = v.wid ? `<b>ID ${esc(v.wid)}</b> ${v.known ? `· ${esc(v.name)}` : '<span class="tag warn">v Lidech není</span>'}` : '<span class="muted">nikdo</span>';
  const att = v.att ? `<h4>Docházka <small class="muted">list ${esc(v.att.name)} · ${v.att.days} ${denN(v.att.days)}, ${v.att.people} ${lidiN(v.att.people)}</small></h4>
      <p class="small">První člověk: ${who}</p>
      <div class="dv-prevwrap"><table class="dv-prevtab"><thead><tr><th>Den</th><th>Příchod</th><th>Odchod</th><th>Hodiny</th></tr></thead><tbody>${v.days.map(d => `<tr><td class="num">${esc(ktDay(d.iso))}</td><td class="num">${d.code ? `<span class="tag">${esc(d.code)}</span>` : tr(d.in, d.rin)}</td><td class="num">${d.code ? '' : tr(d.out, d.rout)}</td><td class="num">${d.code ? 'nepřítomnost' : nf(d.h, 2)}</td></tr>`).join('')}</tbody></table></div>
      <p class="tiny muted">Příchod do 6:15 (14:15) = 6:00 (14:00), později nahoru na čtvrthodinu; odchod od 13:45 (21:45) = 14:00 (22:00), dříve dolů na čtvrthodinu. Hodiny = odchod − příchod − 30 min přestávky, nejvýš 7,5 h; bez odchodu délka směny.</p>`
    : `<h4>Docházka</h4><div class="note e">${esc(v.errAtt || 'List s docházkou nenalezen.')}</div>`;
  const work = v.work ? `<h4>Vykázaná práce <small class="muted">list ${esc(v.work.name)} · ${v.work.rows} ${zaznamN(v.work.rows)}, čas ${esc(DV_UNIT_TEXT[v.work.unit] || v.work.unit)}</small></h4>
      ${v.own ? '' : '<p class="small muted">Tenhle člověk ve vykázané práci není, ukázka prvních záznamů:</p>'}
      <div class="dv-prevwrap"><table class="dv-prevtab"><thead><tr><th>ID</th><th>Datum</th><th>Díl</th><th>Operace</th><th class="r">Zakázka</th><th class="r">Hotovo</th><th class="r">Čas</th></tr></thead><tbody>${v.recs.map(x => `<tr><td class="num">${esc(x.wid)}</td><td class="num">${x.iso ? esc(dayText(x.iso)) : '—'}</td><td>${esc(x.part)}</td><td>${esc(x.op || '—')}</td><td class="r num">${nf(x.f, 0)}</td><td class="r num">${nf(x.g, 0)}</td><td class="r num">${esc(dvH(x.t))}</td></tr>`).join('')}</tbody></table></div>`
    : `<h4>Vykázaná práce</h4><div class="note w">${esc(v.errWork || 'List s vykázanou prací nenalezen, nahraje se jen docházka.')}</div>`;
  return { html: `<div class="dv-prev">${att}${work}</div>`, ok: !!(v.att || v.work) };
}
async function dvMapDialog(sheets, fileName, opts = {}) {
  const dv = S.workAudit.dv;
  const names = (sheets || []).filter(sh => sh && Array.isArray(sh.aoa)).map(dvSheetName);
  const ai = opts.noAi ? null : await dvAiPropose(sheets);
  const cur = dvSheets(sheets, dv.sheets);
  const cfg = { cols: JSON.parse(JSON.stringify(dv.cols)), unit: dv.unit,
    sheets: { att: cur.att ? dvSheetName(cur.att) : '', work: cur.work ? dvSheetName(cur.work) : '' } };
  const changedByAi = [];
  if (ai) {
    DV_SET_COLS.forEach(([kind, key]) => {
      const v = (ai[kind] || {})[key] || '';
      const req = !(key === 'date' || key === 'norm');
      if ((v || !req) && v !== (cfg.cols[kind][key] || '')) { cfg.cols[kind][key] = v; changedByAi.push(`${kind}.${key}`); }
    });
    if (DV_UNITS.includes(ai.unit) && ai.unit !== cfg.unit) { cfg.unit = ai.unit; changedByAi.push('unit'); }
    if (names.includes(ai.att_sheet) && ai.att_sheet !== cfg.sheets.att) { cfg.sheets.att = ai.att_sheet; changedByAi.push('s.att'); }
    if (names.includes(ai.work_sheet) && ai.work_sheet !== cfg.sheets.work) { cfg.sheets.work = ai.work_sheet; changedByAi.push('s.work'); }
  }
  const sel = (id, v, list) => `<select data-dvm="${id}">${list.map(([k, l]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const mark = k => (changedByAi.includes(k) ? ' dv-aichg' : '');
  const sheetList = [['', '—'], ...names.map(n => [n, n])];
  const first = dvPrevHtml(sheets, cfg);
  const res = await dialog({
    title: 'Jak se soubor načte', ok: 'Pokračovat', wide: true,
    html: `<p><b>${esc(fileName || '')}</b> ${ai ? `<span class="tag acc">${I.sparkle} návrh AI</span>` : (ui.me && ui.me.ai && !opts.noAi ? '' : '<span class="small muted">podle uloženého nastavení</span>')}</p>
      ${ai && ai.note ? `<div class="note i">${esc(ai.note)}</div>` : ''}
      <div class="dv-map">
        <div class="dv-mapgrp"><h4>Docházka</h4>
          <label class="field${mark('s.att')}"><span>List</span>${sel('s.att', cfg.sheets.att, sheetList)}</label>
          ${DV_SET_COLS.filter(([k]) => k === 'att').map(([kind, key, label]) => `<label class="field wa-letter${mark(`${kind}.${key}`)}"><span>${esc(label.replace(/^Docházka: /, ''))}</span><input data-dvm="${kind}.${key}" value="${esc(cfg.cols[kind][key] || '')}" maxlength="3" autocapitalize="characters"></label>`).join('')}
          <p class="tiny muted">Každý den má dva sloupce: příchod a vedle něj odchod. Datum je v řádku nad nimi.</p></div>
        <div class="dv-mapgrp"><h4>Vykázaná práce</h4>
          <label class="field${mark('s.work')}"><span>List</span>${sel('s.work', cfg.sheets.work, sheetList)}</label>
          <div class="wa-colgrid">${DV_SET_COLS.filter(([k]) => k === 'work').map(([kind, key, label]) => `<label class="field wa-letter${mark(`${kind}.${key}`)}"><span>${esc(label.replace(/^Práce: /, ''))}</span><input data-dvm="${kind}.${key}" value="${esc(cfg.cols[kind][key] || '')}" maxlength="3" placeholder="—" autocapitalize="characters"></label>`).join('')}</div>
          <label class="field${mark('unit')}"><span>Strávený čas</span>${sel('unit', cfg.unit, Object.entries(DV_UNIT_T))}</label></div>
      </div>
      <h3 class="dv-prevh">Vzor: co se z toho načte</h3>
      <div id="dvmPrev">${first.html}</div>
      <p class="tiny muted">Písmena sloupců jako v Excelu. Když něco nesedí, oprav písmeno nebo list, vzor se hned přepočítá.${ai ? ' AI dostala jen nadpisy prvních řádků a typ buněk, žádná jména ani hodnoty.' : ''}</p>`,
    onOpen: dlg => {
      let tm = 0;
      const read = () => {
        $$('[data-dvm]', dlg).forEach(el => {
          const k = el.dataset.dvm;
          if (k === 'unit') cfg.unit = el.value;
          else if (k.startsWith('s.')) cfg.sheets[k.slice(2)] = el.value;
          else { const [kind, key] = k.split('.'); cfg.cols[kind][key] = waLetter(el.value) || ''; }
        });
        $('#dvmPrev', dlg).innerHTML = dvPrevHtml(sheets, cfg).html;
      };
      $('.dv-map', dlg).addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(read, 250); });
      $('.dv-map', dlg).addEventListener('change', read);
    },
    validate: form => {
      const miss = DV_SET_COLS.filter(([kind, key]) => key !== 'date' && key !== 'norm' && !waLetter(form.querySelector(`[data-dvm="${kind}.${key}"]`).value));
      const bad = [...form.querySelectorAll('input[data-dvm]')].filter(el => el.value.trim() && !waLetter(el.value));
      return bad.length ? 'Sloupec je písmeno jako v Excelu (A až ZZZ).' : miss.length ? `Vyplň sloupec: ${miss.map(x => x[2]).join(', ')}.` : null;
    },
  });
  if (res.value !== 'ok') return null;
  // poslední stav polí (i bez čekání na přepočet)
  $$('#dlgForm [data-dvm]').forEach(el => {
    const k = el.dataset.dvm;
    if (k === 'unit') cfg.unit = DV_UNITS.includes(el.value) ? el.value : 'auto';
    else if (k.startsWith('s.')) cfg.sheets[k.slice(2)] = names.includes(el.value) ? el.value : '';
    else { const [kind, key] = k.split('.'); cfg.cols[kind][key] = waLetter(el.value) || ''; }
  });
  const before = JSON.stringify([dv.cols, dv.unit, dv.sheets]);
  dv.cols = cfg.cols;
  dv.unit = cfg.unit;
  dv.sheets = { att: cfg.sheets.att, work: cfg.sheets.work };
  if (before !== JSON.stringify([dv.cols, dv.unit, dv.sheets])) save();
  return { cfg, ai: !!ai };
}

/* ---------- nahrání souboru ---------- */
/* Přečte soubor, ukáže souhrn obou listů a po potvrzení uloží. attOnly: jen docházka (Kontroly). */
async function dvImport(file, opts = {}) {
  if (!file) return null;
  const wa = S.workAudit;
  const dv = wa.dv;
  let sheets;
  try { sheets = await readTable(file); } catch (error) { toast(`Soubor se nepodařilo otevřít: ${error.message}`, true); return null; }
  // 2.42.3: vždy nejdřív ukázat, jak se soubor načte (návrh AI, vzor prvního člověka, úprava)
  if (!(await dvMapDialog(sheets, file.name, opts))) return null;
  const p = dvParse(sheets, dv, dv.unit);
  if (opts.attOnly) p.work = null;
  const a = p.att && p.att.ok ? p.att : null;
  let w = p.work && p.work.ok ? p.work : null;
  const c = dv.cols;
  if (!a && !w) {
    const errs = [p.att && p.att.err, p.work && p.work.err].filter(Boolean);
    const go = await dialog({ title: 'V souboru nejsou žádná data', ok: 'Nastavit sloupce', cancel: 'Zavřít',
      html: `<p><b>${esc(file.name)}</b>: ${opts.attOnly ? 'nenašla se docházka' : 'nenašla se docházka ani vykázaná práce'}.</p>${errs.length ? `<ul class="wa-imp">${errs.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
        <p class="small muted">Docházka (obvykle 2. list): ve sloupci ${esc(c.att.id)} ID zaměstnance, od sloupce ${esc(c.att.first)} příchod a vedle odchod, nad nimi datum dne. Zkus upravit načtení.</p>
        <div class="row gap"><button class="btn sec" type="submit" value="map" formnovalidate>Upravit načtení</button></div>` });
    if (go.value === 'map') return dvImport(file, { ...opts, noAi: true });
    if (go.value === 'ok') { Object.assign(ui.wa, { tab: 'nastaveni' }); showView('audit'); renderWorkAudit(); $('#dvColsCard')?.scrollIntoView({ block: 'center' }); }
    return null;
  }
  const map = dvWidMap();
  const ids = new Set([...(a ? Object.values(a.pres).flatMap(d => Object.keys(d)) : []), ...(w ? w.recs.map(x => x.wid) : [])]);
  const unknown = [...ids].filter(x => !map.has(x)).sort(widCmp);
  const today = todayIso();
  const repDays = a ? a.dates.filter(iso => dv.pres[iso]).length : 0;
  const fallback = ((a && a.to) || (w && w.to) || today).slice(0, 7);
  const wMonths = w ? [...new Set(w.recs.map(x => (x.iso && w.dated ? x.iso.slice(0, 7) : fallback)))].sort() : [];
  const repMonths = wMonths.filter(m => dv.perf[m]);
  const pcsAll = w && w.dated ? [...new Set(w.recs.filter(x => x.iso && x.op).map(x => x.iso))] : [];
  const pcsDays = pcsAll.filter(iso => !dvOwns(iso));   // starší dny jen na přání, od listopadu vždy
  const pcsNew = pcsAll.length - pcsDays.length;
  const attNew = a ? [...new Set(a.dates.filter(dvOwns).map(iso => iso.slice(0, 7)))] : [];
  const prodNew = w ? wMonths.filter(dvOwns) : [];
  const owns = attNew.length || prodNew.length || pcsNew;
  const noWid = a ? a.ids.filter(x => !map.has(x)).length : 0;
  const pcsOld = pcsDays.filter(iso => wa.pcs[iso]).length;
  const attHtml = a ? `<p>${a.dates.length} ${denN(a.dates.length)} (${esc(dayText(a.from))} – ${esc(dayText(a.to))}), ${a.people} ${lidiN(a.people)} s příchodem nebo odchodem${a.dates.includes(today) ? `, <b>dnes ${Object.keys(a.pres[today] || {}).length}</b>` : ''}.</p>
      <ul class="wa-imp">${repDays ? `<li><b>${repDays} ${repDays === 1 ? 'den už je nahraný' : repDays <= 4 ? 'dny už jsou nahrané' : 'dní už je nahraných'}</b>, nahradí se daty ze souboru.</li>` : ''}
        ${a.codes ? `<li>${a.codes} ${a.codes === 1 ? 'buňka' : a.codes <= 4 ? 'buňky' : 'buněk'} bez času (kódy jako D, N) ${attNew.length ? 'jde do docházky pro odměny jako nepřítomnost' : 'se přeskočí'}.</li>` : ''}</ul>`
    : `<p class="small muted">${esc(p.att ? p.att.err : 'List s docházkou v souboru není.')}</p>`;
  const workHtml = opts.attOnly ? '<p class="small muted">Výkony z listu vykázané práce se tady nenahrávají, nahraješ je v KPI (Lidé v práci).</p>'
    : w ? `<p>${w.rows} ${zaznamN(w.rows)}, ${w.people} ${lidiN(w.people)}: <b>${dvH(w.t)}</b> vykázaného času, ${nf(w.g, 0)} ks dokončeno z ${nf(w.f, 0)} v zakázkách.</p>
      <ul class="wa-imp"><li>${w.dated ? `Datum ze sloupce ${esc(w.dateCol)} (${esc(dayText(w.from))} – ${esc(dayText(w.to))}).` : `Řádky nemají datum, výkony se uloží za ${esc(monthLabel(fallback))}.`}</li>
        ${repMonths.length ? `<li><b>Výkony za ${esc(repMonths.map(monthLabel).join(', '))} už jsou nahrané</b>, nahradí se celým měsícem ze souboru.</li>` : ''}
        ${w.skipped ? `<li>${w.skipped} ${radekN(w.skipped)} bez dílu, operace, kusů i času se přeskočí.</li>` : ''}</ul>
      <label class="field"><span>Strávený čas (sloupec ${esc(c.work.time)}) je v</span><select name="unit">${[['auto', `najít sám (teď ${DV_UNIT_TEXT[w.unit]})`], ['min', 'minutách'], ['h', 'hodinách']].map(([k, l]) => `<option value="${k}"${dv.unit === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      ${pcsDays.length ? `<label class="check"><input type="checkbox" name="toAudit"${pcsOld || owns ? '' : ' checked'}><span><b>${owns ? 'Kusy za dny do 31. 10. 2026 zapsat i do KPI' : 'Kusy podle operací zapsat i do KPI'}</b> (${pcsDays.length} ${denN(pcsDays.length)}, dokončené množství ze sloupce ${esc(c.work.done)}).${pcsOld ? ` ${pcsOld} ${denN(pcsOld)} už ${pcsOld === 1 ? 'má' : 'mají'} kusy z výkazu práce, nahradily by se.` : ''}</span></label>` : ''}`
      : `<p class="small muted">${esc(p.work ? p.work.err : 'Druhý list s vykázanou prací v souboru není, nahraje se jen docházka.')}</p>`;
  const res = await dialog({
    title: opts.attOnly ? 'Nahrát příchody' : 'Nahrát docházku a výkony', ok: 'Nahrát', wide: true,
    html: `<p><b>${esc(file.name)}</b></p>
      <div class="dv-imp"><div><h4>Docházka${a ? ` <small class="muted">list ${esc(a.name)}</small>` : ''}</h4>${attHtml}</div>
        <div><h4>Vykázaná práce${w && !opts.attOnly ? ` <small class="muted">list ${esc(w.name)}</small>` : ''}</h4>${workHtml}</div></div>
      ${unknown.length ? `<div class="note w"><b>${unknown.length} ID není u nikoho v Lidech:</b> ${unknown.slice(0, 12).map(esc).join(', ')}${unknown.length > 12 ? '…' : ''}. Uloží se a přiřadí, jakmile ID doplníš v kartě člověka.</div>` : ''}
      ${owns ? `<div class="note i dv-owns"><b>Od listopadu 2026 je tenhle soubor jediný zdroj:</b><ul class="wa-imp">
        ${attNew.length ? `<li>docházka pro odměny za ${esc(attNew.map(monthLabel).join(', '))}: hodiny z příchodu a odchodu (bez 30 min přestávky), buňka s kódem = nepřítomnost${noWid ? `; ${noWid} ${noWid === 1 ? 'člověk bez ID v Lidech se nezapíše' : 'lidí bez ID v Lidech se nezapíše'}` : ''},</li>` : ''}
        ${attNew.length ? '<li>obsazenost v KPI (ranní = příchod před 12:00, skupiny podle skupin Matice v Nastavení),</li>' : ''}
        ${prodNew.length ? `<li>evidence práce místo Výroby za ${esc(prodNew.map(monthLabel).join(', '))} (kusy, strávený čas${w && w.norm ? ', norma' : ', bez normy'}),</li>` : ''}
        ${pcsNew ? `<li>kusy podle operací do KPI (${pcsNew} ${denN(pcsNew)}).</li>` : ''}</ul></div>` : ''}
      <p class="tiny muted">${owns ? 'Říjen 2026 a dřív zůstává ze starých souborů. ' : 'Docházka pro odměny a Výroba za říjen 2026 a dřív se nemění. '}Sloupce změníš v Nastavení KPI.</p>
      <div class="row gap dv-aibar"><span class="small muted">Nesedí čísla nebo lidé?</span><button class="btn sec small" type="submit" value="map" formnovalidate>Zpět k načtení sloupců</button></div>`,
  });
  if (res.value === 'map') return dvImport(file, { ...opts, noAi: true });
  if (res.value !== 'ok') return null;
  const f = res.form.elements;
  const unit = f.namedItem('unit') ? f.namedItem('unit').value : dv.unit;
  if (w && unit !== dv.unit) {
    dv.unit = DV_UNITS.includes(unit) ? unit : 'auto';
    const sheet = dvSheets(sheets, dv.sheets).work;
    const again = sheet ? dvParseWork(sheet, c.work, dv.unit) : null;
    if (again && again.ok) { p.work = again; w = again; }
  }
  const toAudit = !!(f.namedItem('toAudit') && f.namedItem('toAudit').checked);
  const meta = { name: file.name, by: ui.me.label || '', at: Date.now() };
  const r = dvApply(wa, p, meta, { audit: toAudit });
  const parts = [a ? `docházka ${dayText(a.from)} – ${dayText(a.to)} (${a.people} ${lidiN(a.people)})` : '', w ? `výkony za ${r.months.map(monthLabel).join(', ')}` : '', r.audit ? `kusy do KPI za ${r.audit.days} ${denN(r.audit.days)}` : '',
    r.periods.length ? `docházka pro odměny za ${dvPeriodsText(r.periods)}` : '', r.prod.length ? `evidence práce za ${r.prod.map(x => monthLabel(x.m)).join(', ')}` : ''].filter(Boolean);
  store.note = { kind: 'workaudit', text: `KPI: nahrán soubor ${file.name}: ${parts.join(', ')}`, keep: true };
  save();
  if (r.periods.length || r.prod.length) renderAll();   // docházka a evidence práce pro odměny
  return { a, w, r, unknown };
}
/* Nahrání v KPI: po uložení záložka Lidé v práci na dnešku (nebo posledním dni souboru). */
async function dvImportAudit(file) {
  const out = await dvImport(file);
  if (!out) return;
  const { a, w, r } = out;
  const today = todayIso();
  // Report docházky ukáže nahraný den (2.42.1); kdo nahrával z Reportu, v Reportu zůstane.
  if (a) Object.assign(drRef(), { mode: 'day', ref: a.dates.includes(today) ? today : a.to });
  const stay = ui.wa.tab === 'report' && a;
  Object.assign(ui.wa, { tab: stay ? 'report' : 'lide', dvMode: a ? 'day' : 'month', dvDay: a ? (a.dates.includes(today) ? today : a.to) : ui.wa.dvDay, dvMonth: r.months.length ? r.months[r.months.length - 1] : (a ? a.to.slice(0, 7) : ui.wa.dvMonth) });
  if (r.audit && r.audit.added.length) Object.assign(ui.wa, { opFilter: 'nogroup', opQ: '' });
  renderWorkAudit();
  const ng = r.audit ? r.audit.added.length : 0;
  toast(`Nahráno: ${a ? `docházka za ${r.days} ${denN(r.days)}` : 'bez docházky'}${w ? `, výkony za ${r.months.map(monthLabel).join(', ')}` : ''}${r.audit ? `, kusy do KPI za ${r.audit.days} ${denN(r.audit.days)}` : ''}${r.periods.length ? `, docházka pro odměny za ${dvPeriodsText(r.periods)}` : ''}.${ng ? ` ${ng} ${ng === 1 ? 'nová operace čeká' : ng <= 4 ? 'nové operace čekají' : 'nových operací čeká'} na skupinu v Nastavení.` : ''}`);
}

/* ---------- denní report (PDF) a měsíc do Excelu ---------- */
async function exportDvPdf(button) {
  const iso = dvPickDay();
  const d = dvDay(iso);
  if (!d.n) { toast('Na tento den není docházka.', true); return; }
  const isToday = iso === todayIso();
  await withPdf(button, doc => {
    doc.setProperties({ title: `Lidé v práci · ${dayText(iso)}`, creator: EXPORT_NAME });
    const k = pdfKit(doc);
    const C = k.C;
    k.header({ eyebrow: `${EXPORT_NAME} · KPI · LIDÉ V PRÁCI`, right: `Stav k ${tsText(Date.now())}`, title: 'Obsazenost po projektech', sub: `${ktDay(iso, true)} ${iso.slice(0, 4)}`,
      meta: 'Podle příchodů a odchodů ze souboru docházky. Projekt je skupina v Matici dovedností, kam člověk patří.' });
    k.tiles([
      ['Přišlo do práce', String(d.n), `${d.groups.filter(g => !dvSpecial(g)).length} projektů`],
      ...(isToday ? [['Teď v práci', String(d.now), 'přišli a neodešli', 'good']] : []),
      ['Hodiny v práci', dvH(d.min, 0), d.open ? `${d.open} bez odchodu` : 'všichni s odchodem'],
      ['Neznámé ID', String(d.unknown.length), d.unknown.length ? 'ID není v evidenci' : 'všichni spárovaní', d.unknown.length ? 'crit' : ''],
    ]);
    const groups = d.groups.slice().sort((a, b) => dvSpecial(a) - dvSpecial(b) || b.n - a.n);
    const max = Math.max(1, ...groups.map(g => g.n));
    k.heading('Po projektech', 11);
    const LW = 62, BW = k.CW - LW - 26;
    groups.forEach(g => {
      k.need(7);
      k.text(k.split(g.name, LW - 3, 9)[0], k.M, k.y + 0.6, 9, { bold: !dvSpecial(g), color: dvSpecial(g) ? C.ink2 : C.ink });
      k.box(C.soft3, k.M + LW, k.y + 1, BW, 3.6, 1.2);
      k.box(dvSpecial(g) ? C.ink3 : C.acc, k.M + LW, k.y + 1, Math.max(1.2, BW * g.n / max), 3.6, 1.2);
      k.text(`${g.n}${isToday && g.now !== g.n ? ` (teď ${g.now})` : ''}`, k.M + k.CW, k.y + 0.6, 9, { bold: true, align: 'right' });
      k.y += 6.4;
    });
    k.y += 4;
    const X = [k.M, k.M + k.CW - 58, k.M + k.CW - 38, k.M + k.CW - 18];
    groups.forEach(g => {
      k.keep(() => {
        k.need(14);
        k.text(`${g.name} · ${g.n} ${lidiN(g.n)}`, k.M, k.y, 10.5, { bold: true });
        k.y += 5.6;
        ['Zaměstnanec', 'Příchod', 'Odchod', 'Hodiny'].forEach((h, i) => k.text(h, i ? X[i] + 18 : X[0], k.y, 7.6, { color: C.ink3, align: i ? 'right' : 'left' }));
        k.y += 4;
        k.hline(k.y, C.line2, 0.3);
        k.y += 1.4;
        g.people.forEach(x => {
          k.need(5.4);
          k.text(k.split(`${x.e ? x.name : 'není v evidenci'} · ID ${x.wid}`, X[1] - k.M - 4, 8.6)[0], X[0], k.y, 8.6, { color: x.e ? C.ink : C.crit });
          k.text(dvClockText(x.in), X[1] + 18, k.y, 8.6, { align: 'right' });
          k.text(x.out == null ? '—' : dvClockText(x.out), X[2] + 18, k.y, 8.6, { align: 'right' });
          k.text(x.min == null ? '—' : dvH(x.min), X[3] + 18, k.y, 8.6, { align: 'right' });
          k.y += 4.6;
          k.hline(k.y - 0.6, C.line, 0.15);
        });
        k.y += 4;
      }, 30);
    });
    k.footer(`${EXPORT_NAME} · Lidé v práci · ${dayText(iso)}`);
    downloadFile(`lide-v-praci-${iso}.pdf`, doc.output('blob'), 'application/pdf');
  });
}
async function exportDvXlsx() {
  const month = dvPickMonth();
  const m = dvMonth(month);
  const dv = S.workAudit.dv;
  try {
    const X = await xlsx();
    const wb = X.utils.book_new();
    const cols = m.groups.filter(g => m.days.some(d => d.by[g.id]));
    const r1 = (v, d = 1) => (v == null ? '' : Math.round(v * 10 ** d) / 10 ** d);
    const map = dvWidMap();
    const sheets = [
      { name: 'Obsazenost', cols: [14, ...cols.map(() => 14), 10, 10], rows: [['Den', ...cols.map(g => g.name), 'Celkem', 'Hodiny'], ...m.days.map(d => [dayText(d.iso), ...cols.map(g => d.by[g.id] || 0), d.n, r1(d.min / 60)])] },
      { name: 'Lidé', cols: [26, 10, 18, 6, 10, 10, 10, 12, 12, 8, 30], rows: [['Zaměstnanec', 'ID', 'Projekt', 'Dny', 'V práci (h)', 'Vykázáno (h)', 'Využití (%)', 'Dokončeno (ks)', 'V zakázkách (ks)', 'Ks/h', 'Hlavní díl'],
        ...m.people.map(q => [q.name || 'není v evidenci', q.wid, q.gr.name, q.days, r1(q.min / 60), r1(q.t / 60), q.util == null ? '' : r1(q.util * 100, 0), r1(q.g, 2), r1(q.f, 2), r1(q.perHour, 2), q.top])] },
      { name: 'Docházka', cols: [26, 10, 12, 9, 9, 9], rows: [['Zaměstnanec', 'ID', 'Den', 'Příchod', 'Odchod', 'Hodiny'],
        ...Object.keys(dv.pres).filter(iso => iso.slice(0, 7) === month).sort().flatMap(iso => Object.entries(dv.pres[iso]).sort((a, b) => widCmp(a[0], b[0])).map(([wid, v]) => {
          const e = map.get(wid);
          const min = dvStay(v[0], v[1]);
          return [e ? `${e.last} ${e.first}`.trim() : 'není v evidenci', wid, dayText(iso), v[0] == null ? '' : dvClockText(v[0]), v[1] == null ? '' : dvClockText(v[1]), min == null ? '' : r1(min / 60, 2)];
        }))] },
      { name: 'Díly', cols: [26, 10, 30, 12, 12, 12, 8], rows: [['Zaměstnanec', 'ID', 'Díl', 'Vykázáno (h)', 'Dokončeno (ks)', 'V zakázkách (ks)', 'Řádků'],
        ...m.people.flatMap(q => Object.entries(q.parts).sort((a, b) => b[1][2] - a[1][2]).map(([nm, v]) => [q.name || 'není v evidenci', q.wid, nm, r1(v[2] / 60, 2), v[0], v[1], v[3]]))] },
    ];
    sheets.forEach(sheet => {
      const ws = X.utils.aoa_to_sheet(sheet.rows.map(row => row.map(safeCell)));
      ws['!cols'] = sheet.cols.map(wch => ({ wch }));
      X.utils.book_append_sheet(wb, ws, sheet.name);
    });
    downloadFile(`lide-v-praci-${month}.xlsx`, new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch (error) { toast(`Export se nepovedl: ${error.message}`, true); }
}

/* ---------- výkonnost na osobu (2.44) ----------
   Lidé po odděleních, průměr na den z evidence práce a docházky (kpiPerf v core.js), řazení
   podle zvoleného ukazatele od nejlepších nebo od nejhorších. Pruh = hodnota proti nejlepšímu
   v oddělení, barva podle průměru oddělení. */
const KP_FMT = { ks: v => `${nf(v, 1)} ks`, norm: v => `${nf(v, 1)} %`, ph: v => `${nf(v, 1)} ks/h`, h: v => `${nf(v, 1)} h`, use: v => `${nf(v, 1)} %` };
const KP_COLS = [['ks', 'Ø ks/den'], ['h', 'Ø h/den'], ['ph', 'Ks/h'], ['norm', 'Plnění normy'], ['use', 'Využití fondu']];
function kpPick() {
  const months = kpiMonths();
  const kp = ui.wa.kp;
  if (!months.includes(kp.month)) kp.month = months[0] || '';
  return months;
}
function kpVal(k, v) { return v == null ? '<span class="muted">—</span>' : KP_FMT[k](v); }
function kpHtml() {
  const months = kpPick();
  const kp = ui.wa.kp;
  if (!kp.month) {
    return emptyState('Zatím žádná evidence práce', 'Výkonnost na osobu se počítá z vykázané práce a docházky. Nahraj soubor tlačítkem <b>Nahrát docházku a výkony</b> nahoře.');
  }
  const x = kpiPerf(kp.month, { sort: kp.sort, dir: kp.dir });
  const lab = Object.fromEntries(KPI_SORT);
  const depts = x.depts.filter(d => !kp.dept || d.name === kp.dept);
  if (kp.dept && !depts.length) kp.dept = '';
  const shown = kp.dept ? depts : x.depts;
  const bar = `<div class="t5-weekbar kp-bar">
    <label class="kp-f"><span>Měsíc</span><select id="kpMonth">${months.map(m => `<option value="${m}"${m === kp.month ? ' selected' : ''}>${esc(monthLabel(m))}</option>`).join('')}</select></label>
    <label class="kp-f"><span>Oddělení</span><select id="kpDept"><option value="">Všechna</option>${x.depts.map(d => `<option value="${esc(d.name)}"${d.name === kp.dept ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
    <label class="kp-f"><span>Řadit podle</span><select id="kpSort">${KPI_SORT.map(([k, l]) => `<option value="${k}"${k === x.sort ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="seg kp-dir" role="group" aria-label="Pořadí">${[['best', 'Od nejlepších'], ['worst', 'Od nejhorších']].map(([k, l]) => `<button type="button" data-kpdir="${k}" aria-pressed="${k === x.dir}" class="${k === x.dir ? 'on' : ''}">${l}</button>`).join('')}</div>
    <span class="spacer"></span><button class="btn sec" type="button" data-kpxlsx>Excel</button></div>`;
  const t = x.tot;
  const tiles = `<div class="stats">${[
    statTile('Lidí', String(t.people), `${shown.length === 1 ? '1 oddělení' : `${x.depts.length} oddělení`}`),
    statTile('Ø ks na den', t.ks1 != null ? nf(t.ks1, 1) : '—', `${nf(t.ks, 0)} ks ÷ ${nf(t.days, 1)} odpracovaných dnů (${nf(t.hrs, 1)} h)`),
    statTile('Kusy za hodinu', t.ph != null ? nf(t.ph, 1) : '—', x.time ? 'kusy ÷ vykázaný čas' : 'evidence bez času'),
    statTile('Plnění normy', t.norm != null ? `${nf(t.norm, 1)} %` : '—', t.norm != null ? 'norma ÷ čas u řádků s normou' : 'norma v evidenci není'),
  ].join('')}</div>`;
  const notes = [];
  if (x.noAtt) notes.push('Za měsíc chybí docházka: průměr na den nejde spočítat (jen kusy za hodinu a plnění normy).');
  if (x.unmatched) notes.push(`${x.unmatched} ${x.unmatched === 1 ? 'záznam' : x.unmatched <= 4 ? 'záznamy' : 'záznamů'} z evidence práce nejde přiřadit nikomu z Lidí (chybí ID), ve výsledcích nejsou.`);
  const head = `<th class="r kp-rank">#</th><th>Zaměstnanec</th><th>Skupina</th><th class="r">Dny</th>${KP_COLS.map(([k, l]) => `<th class="r${k === x.sort ? ' kp-on' : ''}">${l}</th>`).join('')}`;
  const cards = depts.map(d => {
    const avg = d.avg[x.sort === 'ks' ? 'ks1' : x.sort];
    const rows = d.people.map(q => {
      const v = q.v[x.sort];
      const w = v != null && d.max > 0 ? Math.max(2, Math.round(v / d.max * 100)) : 0;
      const tone = v == null || avg == null ? '' : v >= avg ? ' up' : ' down';
      return `<tr data-dvperson="${esc(q.key)}" tabindex="0" class="dv-click">
        <td class="r num kp-rank" data-label="Pořadí">${q.rank == null ? '<span class="muted">–</span>' : `<b>${q.rank}.</b>`}</td>
        <td class="name" data-label="Zaměstnanec">${q.rank != null ? `<span class="kp-mrank">${q.rank}.</span> ` : ''}<b>${esc(q.name)}</b>${q.wid ? ` <small class="muted num">ID ${esc(q.wid)}</small>` : ''}</td>
        <td data-label="Skupina">${esc(q.group)}</td><td class="r num" data-label="Dny" title="${q.wd} ${denN(q.wd)} v práci, ${nf(q.hrs, 1)} h">${q.days ? nf(q.days, 1) : '<span class="muted">0</span>'}${q.days && q.days !== q.wd ? `<small class="muted kp-wd">z ${q.wd}</small>` : ''}</td>
        ${KP_COLS.map(([k, l]) => k === x.sort
          ? `<td class="r num kp-on" data-label="${l}"><span class="kp-val">${kpVal(k, q.v[k])}</span>${v != null ? `<span class="kp-track"><i class="kp-fill${tone}" data-w="${w}"></i></span>` : ''}</td>`
          : `<td class="r num" data-label="${l}">${kpVal(k, q.v[k])}</td>`).join('')}</tr>`;
    }).join('');
    return `<div class="card kp-dept" data-kpdept="${esc(d.name)}"><div class="card-head"><div><h3>${esc(d.name)}</h3>
      <p class="small muted">${d.people.length} ${d.people.length === 1 ? 'člověk' : d.people.length <= 4 ? 'lidé' : 'lidí'} · průměr oddělení ${avg != null ? `<b>${KP_FMT[x.sort](avg)}</b>` : '—'} · ${lab[x.sort]}</p></div></div>
      <div class="table-card flat"><table class="stack kp-tab"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody>
      <tfoot><tr class="kp-avg"><td></td><td class="name" data-label="">Průměr oddělení</td><td></td><td class="r num" data-label="Dny">${nf(d.avg.days, 1)}</td>${KP_COLS.map(([k, l]) => `<td class="r num${k === x.sort ? ' kp-on' : ''}" data-label="${l}">${kpVal(k, d.avg[k === 'ks' ? 'ks1' : k])}</td>`).join('')}</tr></tfoot></table></div></div>`;
  }).join('');
  // oddělení vedle sebe barevně (2.59): podíl lidí a průměr oddělení podle zvoleného řazení
  const sk = x.sort === 'ks' ? 'ks1' : x.sort;
  const cats = kp.dept ? '' : catBars(x.depts.map(d => ({ name: d.name, share: d.people.length, v: d.avg[sk], text: d.avg[sk] != null ? KP_FMT[x.sort](d.avg[sk]) : '—', sub: `${d.people.length} ${d.people.length === 1 ? 'člověk' : d.people.length <= 4 ? 'lidé' : 'lidí'}` })),
    { title: 'Oddělení vedle sebe', sub: `Průměr oddělení · ${esc(lab[x.sort])}`, shareText: 'Podíl lidí po odděleních' });
  return `${bar}${tiles}${notes.length ? `<div class="note i">${notes.map(esc).join(' ')}</div>` : ''}
    ${cats}
    ${cards || '<p class="small muted">Za měsíc nikdo s vykázanou prací.</p>'}
    <p class="hint">Odpracované dny = hodiny z docházky přepočtené na směnu: celá směna (${nf(S.settings.shift, 1)} h) = 1 den, kratší den = hodiny ÷ ${nf(S.settings.shift, 1)} (např. 3,75 h = 0,5 dne), víc než směna = 1 den, den s kódem nepřítomnosti se nepočítá. Ø ks na den = dokončené kusy ÷ odpracované dny. Ø h na den = vykázaný čas ÷ odpracované dny. Kusy za hodinu = kusy ÷ vykázaný čas. Plnění normy = norma ÷ čas u řádků s normou. Využití fondu = vykázaný čas ÷ hodiny v práci. Průměr oddělení je vážený (součty, ne průměr průměrů). Vedoucí a vyřazení se nepočítají, oddělení podle skupiny v Matici ke konci měsíce. Klik na člověka otevře profil.</p>`;
}
async function exportKpXlsx() {
  kpPick();
  const kp = ui.wa.kp;
  if (!kp.month) return;
  const x = kpiPerf(kp.month, { sort: kp.sort, dir: kp.dir });
  try {
    const X = await xlsx();
    const wb = X.utils.book_new();
    kpiSheets(x).forEach(sheet => {
      const ws = X.utils.aoa_to_sheet(sheet.rows.map(row => row.map(safeCell)));
      ws['!cols'] = [18, 7, 26, 10, 16, 10, 10, 10, 12, 10, 12, 12].map(wch => ({ wch }));
      X.utils.book_append_sheet(wb, ws, sheet.name);
    });
    downloadFile(`vykonnost-na-osobu-${kp.month}.xlsx`, new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch (error) { toast(`Export se nepovedl: ${error.message}`, true); }
}

/* ---------- profil: produktivita a koláč dílů ---------- */
/* Koláč: nejvýš 6 dílů v barvách ověřených validátorem palet, zbytek šedě jako Ostatní.
   Mezi výsečemi 2 px barvy plochy, u každé výseče popisek při najetí; legenda s čísly
   (hodiny, kusy, podíl) slouží i jako tabulka. */
function dvPieHtml(parts, total, byTime) {
  const val = p => (byTime ? p.t : p.g);
  const top = parts.slice(0, 6);
  const rest = parts.slice(6);
  const sl = top.map((p, i) => ({ name: p.name, v: val(p), t: p.t, g: p.g, f: p.f, cls: `s${i + 1}` }));
  if (rest.length) sl.push({ name: `Ostatní díly (${rest.length})`, v: rest.reduce((s, p) => s + val(p), 0), t: rest.reduce((s, p) => s + p.t, 0), g: rest.reduce((s, p) => s + p.g, 0), f: rest.reduce((s, p) => s + p.f, 0), cls: 'so' });
  const R = 56;
  const r0 = 35;
  const pt = (a, r) => `${(60 + r * Math.sin(a)).toFixed(2)} ${(60 - r * Math.cos(a)).toFixed(2)}`;
  let a = 0;
  const share = s => (total > 0 ? s.v / total : 0);
  const tip = s => `${s.name}: ${dvH(s.t)}, ${nf(s.g, 0)} ks${s.f ? ` z ${nf(s.f, 0)}` : ''} (${nf(share(s) * 100, 0)} %)`;
  const paths = sl.filter(s => s.v > 0).map(s => {
    const f = share(s);
    if (f >= 0.9999) return `<path class="hit ${s.cls}" tabindex="0" data-tip="${esc(tip(s))}" aria-label="${esc(tip(s))}" d="M 60 ${60 - R} A ${R} ${R} 0 1 1 59.99 ${60 - R} L 59.99 ${60 - r0} A ${r0} ${r0} 0 1 0 60 ${60 - r0} Z"/>`;
    const b = a + f * Math.PI * 2;
    const big = f > 0.5 ? 1 : 0;
    const d = `M ${pt(a, R)} A ${R} ${R} 0 ${big} 1 ${pt(b, R)} L ${pt(b, r0)} A ${r0} ${r0} 0 ${big} 0 ${pt(a, r0)} Z`;
    a = b;
    return `<path class="hit ${s.cls}" tabindex="0" data-tip="${esc(tip(s))}" aria-label="${esc(tip(s))}" d="${d}"/>`;
  }).join('');
  const center = byTime ? [nf(total / 60, total >= 6000 ? 0 : 1), 'h vykázáno'] : [nf(total, 0), 'ks dokončeno'];
  return `<div class="dv-pie-wrap"><div class="dv-pie-fig"><svg class="chart dv-pie" viewBox="0 0 120 120" role="group" aria-label="Podíl dílů ${byTime ? 'na vykázaném čase' : 'na dokončených kusech'}">${paths}
      <text x="60" y="58" class="dv-pie-v">${esc(center[0])}</text><text x="60" y="71" class="dv-pie-k">${esc(center[1])}</text></svg></div>
    <table class="dv-legend"><caption class="visually-hidden">Díly</caption><thead><tr><th>Díl</th><th class="r">Čas</th><th class="r">Ks</th><th class="r">Podíl</th></tr></thead><tbody>${sl.map(s => `<tr><td><i class="dv-sw ${s.cls}" aria-hidden="true"></i>${esc(s.name)}</td><td class="r num">${dvH(s.t)}</td><td class="r num">${nf(s.g, 0)}</td><td class="r num">${nf(share(s) * 100, 0)} %</td></tr>`).join('')}</tbody></table>
    <div class="chart-tip" hidden></div></div>`;
}
function dvPersonCard(key, from, to) {
  if (!dvHas()) return '';
  const p = dvPerson(key, from, to);
  const head = `<div class="card-head"><div><h3>Produktivita z vykázané práce</h3><p class="small muted">Z docházky a výkonů nahraných v KPI${p.wid ? ` · ID ${esc(p.wid)}` : ''}. Využití = vykázaný čas ÷ čas v práci podle příchodů a odchodů.</p></div></div>`;
  if (p.noId) return `<div class="card pf-dv">${head}<p class="small muted">Člověk nemá vyplněné ID zaměstnance, proto se k němu docházka a výkony nepřiřadí. Doplň ho v Upravit zařazení.</p></div>`;
  if (!p.has) return `<div class="card pf-dv">${head}<p class="small muted">V tomto období bez docházky i vykázané práce.</p></div>`;
  const byTime = p.t > 0;
  const total = byTime ? p.t : p.g;
  const tiles = `<div class="stats dv-pstats">${[
    statTile('Dny v práci', String(p.days), p.days ? `Ø ${dvH(p.min / p.days)} denně` : 'bez docházky'),
    statTile('Hodiny v práci', dvH(p.min, 0), 'z příchodů a odchodů'),
    statTile('Vykázaný čas', dvH(p.t, 0), `${p.parts.length} ${p.parts.length === 1 ? 'díl' : p.parts.length <= 4 ? 'díly' : 'dílů'}, ${p.ops.length} ${operaceN(p.ops.length)}`),
    statTile('Využití', dvPct(p.util), 'vykázaný čas ÷ čas v práci', p.util != null && p.util < 0.7 ? 'crit' : p.util != null ? 'good' : ''),
    statTile('Dokončeno', `${nf(p.g, 0)} ks`, p.f ? `z ${nf(p.f, 0)} ks v zakázkách` : '—'),
    statTile('Ks za hodinu', p.perHour != null ? nf(p.perHour, 1) : '—', 'za hodinu vykázaného času'),
  ].join('')}</div>`;
  const ops = p.ops.slice(0, 8);
  return `<div class="card pf-dv">${head}${tiles}
    ${p.parts.length && total > 0 ? `<h4 class="dv-sub">Na jakých dílech pracuje <small class="muted">podle ${byTime ? 'vykázaného času' : 'dokončených kusů'}</small></h4>${dvPieHtml(p.parts, total, byTime)}` : '<p class="small muted">V období bez vykázané práce.</p>'}
    ${ops.length ? `<h4 class="dv-sub">Operace</h4><div class="table-card flat"><table class="stack"><thead><tr><th>Operace</th><th class="r">Čas</th><th class="r">Dokončeno ks</th><th class="r">Záznamů</th></tr></thead><tbody>${ops.map(o => `<tr><td class="wrap" data-label="Operace">${esc(o.name)}</td><td class="r num" data-label="Čas">${dvH(o.t)}</td><td class="r num" data-label="Dokončeno">${nf(o.g, 0)}</td><td class="r num" data-label="Záznamů">${o.n}</td></tr>`).join('')}</tbody></table></div>${p.ops.length > 8 ? `<p class="tiny muted">… a ${p.ops.length - 8} dalších</p>` : ''}` : ''}
  </div>`;
}

/* ---------- nahrání souborů ---------- */
async function waImport(kind, file) {
  if (!file) return;
  const wa = S.workAudit;
  let sheets;
  try { sheets = await readTable(file); } catch (error) { toast(`Soubor se nepodařilo otevřít: ${error.message}`, true); return; }
  const att = kind === 'att';
  const parsed = att ? waParseAttendance(sheets, wa.cols.att, wa.groups) : waParseWork(sheets, wa.cols.work);
  const owned = Object.keys(att ? parsed.days : parsed.byDay).filter(dvOwns).length;
  if (owned && !waDropOwned(parsed, att ? 'days' : 'byDay')) {
    toast(`Dny od 1. 11. 2026 se nahrávají jen ze souboru docházky a výkonů (Nahrát docházku a výkony). V souboru jiné dny nejsou.`, true);
    return;
  }
  const isos = Object.keys(att ? parsed.days : parsed.byDay).sort();
  const c = att ? wa.cols.att : wa.cols.work;
  if (!isos.length) {
    const go = await dialog({ title: 'V souboru nejsou žádná data', ok: 'Nastavit sloupce', cancel: 'Zavřít',
      html: `<p>V souboru <b>${esc(file.name)}</b> není žádný řádek s datem ve sloupci <b>${esc(c.date)}</b>${att ? ' a s čísly obsazenosti' : `, operací ve sloupci <b>${esc(c.op)}</b> a kusy ve sloupci <b>${esc(c.ks)}</b>`}.</p>
        <p class="small muted">Je to ${att ? 'soubor obsazenosti' : 'výkaz práce'}? Když má sloupce jinde, nastav je v Nastavení auditu.</p>` });
    if (go.value === 'ok') { ui.wa.tab = 'nastaveni'; renderWorkAudit(); }
    return;
  }
  const replace = isos.filter(iso => (att ? wa.days : wa.pcs)[iso]);
  const keepEdits = isos.reduce((n, iso) => n + Object.keys(wa.edits[iso] || {}).filter(k => att !== k.startsWith('pcs.')).length, 0);
  const off = isos.filter(iso => { const [y, m, dd] = iso.split('-').map(Number); return !mkDay(y, m, dd).work; });
  let preview;
  let fresh = [];
  if (att) {
    preview = `<table class="wa-prev"><thead><tr><th>Den</th><th class="r">Ranní</th><th class="r">Odpolední</th><th class="r">Součet skupin</th></tr></thead><tbody>${isos.slice(0, 8).map(iso => {
      const x = parsed.days[iso];
      const gs = Object.values(x.g).reduce((s, v) => s + (v[0] || 0) + (v[1] || 0), 0);
      const [y, m, dd] = iso.split('-').map(Number);
      return `<tr><td class="num">${esc(ktDay(iso))} ${waDayTag(mkDay(y, m, dd))}</td><td class="r num">${waN(x.am.total, 2)} / ${waN(x.am.plan, 2)}</td><td class="r num">${waN(x.pm.total, 2)} / ${waN(x.pm.plan, 2)}</td><td class="r num">${nf(gs, 2)}</td></tr>`;
    }).join('')}</tbody></table>${isos.length > 8 ? `<p class="tiny muted">… a ${isos.length - 8} dalších dní</p>` : ''}`;
  } else {
    const known = new Set(wa.ops.map(o => norm(o.name)));
    fresh = Object.keys(parsed.ops).filter(n => !known.has(norm(n)));
    const top = Object.entries(parsed.ops).sort((a, b) => b[1] - a[1]).slice(0, 8);
    preview = `<table class="wa-prev"><thead><tr><th>Operace</th><th>Skupina</th><th class="r">Kusy</th></tr></thead><tbody>${top.map(([n, ks]) => {
      const op = wa.ops.find(o => norm(o.name) === norm(n));
      const g = op && op.on ? op.group : '';
      return `<tr><td>${esc(n)}${op ? '' : ' <span class="tag acc">nová</span>'}</td><td>${g ? esc(waGroupName(g)) : '<span class="tag wa-miss">bez skupiny, nepočítá se</span>'}</td><td class="r num">${waN(ks)}</td></tr>`;
    }).join('')}</tbody></table>${Object.keys(parsed.ops).length > 8 ? `<p class="tiny muted">… a ${Object.keys(parsed.ops).length - 8} dalších operací</p>` : ''}`;
  }
  const total = att ? null : Object.values(parsed.ops).reduce((a, b) => a + b, 0);
  // stejný soubor i do Výroby (2.35), když sedí na uložené sloupce evidence práce
  let prod = att ? null : waProdFrom(sheets, file.name);
  if (prod) { prod.ids = prod.ids.filter(id => !dvOwns(id)); prod.old = prod.old.filter(id => !dvOwns(id)); if (!prod.ids.length) prod = null; }
  const prodHtml = att ? '' : prod ? `<label class="check wa-toprod"><input type="checkbox" name="toProd" checked><span><b>Nahrát i do Výroby</b> (evidence práce): ${prod.res.used} ${prod.res.used === 1 ? 'řádek' : prod.res.used <= 4 ? 'řádky' : 'řádků'} za ${esc(prod.ids.map(monthLabel).join(', '))}, zaměstnanec ze sloupce ${esc(colLetter(prod.map.name))}${prod.old.length ? `. Evidence za ${esc(prod.old.map(monthLabel).join(', '))} se nahradí` : ''}.</span></label>`
    : `<p class="tiny muted wa-noprod">Do Výroby se soubor nenahraje: ${S.settings.prodCols ? 'nesedí na sloupce evidence práce nastavené ve Výrobě' : 've Výrobě ještě nejsou nastavené sloupce evidence práce'}. Nahraj ho jednou ve Výrobě a vyber sloupce (zaměstnanec nebo ID, kusy, čas, norma i Operace), pak stačí nahrávat jen na jednom místě.</p>`;
  const res = await dialog({
    title: att ? 'Nahrát obsazenost' : 'Nahrát výkaz práce', ok: 'Nahrát', wide: true,
    html: `<p><b>${esc(file.name)}</b>: ${isos.length} ${denN(isos.length)} (${esc(dayText(parsed.from))} – ${esc(dayText(parsed.to))}), ${parsed.rows} ${parsed.rows === 1 ? 'řádek' : parsed.rows <= 4 ? 'řádky' : 'řádků'}${total != null ? `, ${waN(total)} ks, ${Object.keys(parsed.ops).length} ${operaceN(Object.keys(parsed.ops).length)}` : ''}.</p>
      <ul class="wa-imp">
        ${owned ? `<li><b>${owned} ${denN(owned)} od 1. 11. 2026 se přeskočí</b>: ty se nahrávají ze souboru docházky a výkonů.</li>` : ''}
        ${off.length ? `<li>${off.length} ${denN(off.length)} ${off.length >= 2 && off.length <= 4 ? 'jsou' : 'je'} víkend nebo svátek (${off.slice(0, 4).map(i => esc(ktDay(i))).join(', ')}${off.length > 4 ? '…' : ''}).</li>` : ''}
        ${replace.length ? `<li><b>${replace.length} ${replace.length === 1 ? 'den už je nahraný' : replace.length <= 4 ? 'dny už jsou nahrané' : 'dní už je nahraných'}</b>, nahradí se daty ze souboru.${keepEdits ? ` Ruční úpravy (${keepEdits}) zůstanou a dál platí.` : ''}</li>` : ''}
        ${parsed.skipped ? `<li>Přeskočeno ${parsed.skipped} ${parsed.skipped === 1 ? 'řádek' : parsed.skipped <= 4 ? 'řádky' : 'řádků'} bez data${att ? ' nebo bez čísel' : ', operace nebo kusů'}.</li>` : ''}
        ${fresh.length ? `<li><b>${fresh.length} ${fresh.length === 1 ? 'nová operace' : fresh.length <= 4 ? 'nové operace' : 'nových operací'}</b> bez skupiny: kusy se nepočítají, dokud ${fresh.length === 1 ? 'ji' : 'je'} v Nastavení nepřiřadíš ke skupině.</li>` : ''}
      </ul>${preview}${prodHtml}
      <p class="tiny muted">Sloupce: ${att ? `datum ${esc(c.date)}, ranní ${esc(c.amTotal || '—')} v práci / ${esc(c.amPlan || '—')} plán, odpolední ${esc(c.pmTotal || '—')} / ${esc(c.pmPlan || '—')}` : `datum ${esc(c.date)}, operace ${esc(c.op)}, kusy ${esc(c.ks)}`}. Změníš je v Nastavení.</p>`,
  });
  if (res.value !== 'ok') return;
  const meta = { name: file.name, by: ui.me.label || '', at: Date.now() };
  const r = att ? waApplyAttendance(wa, parsed, meta) : waApplyWork(wa, parsed, meta);
  const toProd = !!(prod && res.form && res.form.elements.namedItem('toProd') && res.form.elements.namedItem('toProd').checked);
  if (toProd) prod.ids.forEach(id => { S.production[id] = prod.res.buckets[id]; });
  store.note = { kind: 'workaudit', text: `KPI: nahrán${att ? 'a obsazenost' : ' výkaz práce'} ${file.name} (${r.days} ${denN(r.days)}, ${dayText(parsed.from)} – ${dayText(parsed.to)}${!att && r.added.length ? `, ${r.added.length} ${r.added.length === 1 ? 'nová operace' : r.added.length <= 4 ? 'nové operace' : 'nových operací'}` : ''})${toProd ? `; i do Výroby (evidence práce za ${prod.ids.map(monthLabel).join(', ')})` : ''}`, keep: toProd };
  save();
  Object.assign(ui.wa, { mode: 'month', month: parsed.to.slice(0, 7) });
  // Nové operace čekají na skupinu: rovnou Nastavení s filtrem bez skupiny.
  if (!att && r.added.length) Object.assign(ui.wa, { tab: 'nastaveni', opFilter: 'nogroup', opQ: '' });
  else if (ui.wa.tab === 'nastaveni') ui.wa.tab = 'prehled';
  renderWorkAudit();
  const ng = !att ? r.added.length : 0;
  // nespárovaná jména v nahraných měsících (prodUnmatched bere jen vybrané období)
  const un = toProd ? new Set(prod.ids.flatMap(id => Object.values(S.production[id].names).filter(rec => !prodKeyFor(rec.name)).map(rec => norm(rec.name)))).size : 0;
  toast(att ? `Obsazenost nahrána: ${r.days} ${denN(r.days)}.` : `Výkaz práce nahrán: ${r.days} ${denN(r.days)}.${ng ? ` ${ng} ${ng === 1 ? 'nová operace čeká' : ng <= 4 ? 'nové operace čekají' : 'nových operací čeká'} na skupinu.` : ''}${toProd ? ` Výroba doplněna (${prod.ids.map(monthLabel).join(', ')})${un ? `, ${un} ${jmenW(un)} ve Výrobě ${un >= 2 && un <= 4 ? 'čekají' : 'čeká'} na spárování` : ''}.` : ''}`);
}
/* Starší soubory (2.42): dny od listopadu 2026 se vyřadí (plní je soubor docházky a výkonů).
   Upraví od–do a počet operací; vrací, jestli něco zbylo. */
function waDropOwned(parsed, field) {
  const all = Object.keys(parsed[field]);
  const keep = all.filter(iso => !dvOwns(iso)).sort();
  if (keep.length === all.length) return !!keep.length;
  all.filter(dvOwns).forEach(iso => { delete parsed[field][iso]; });
  if (!keep.length) return false;
  parsed.from = keep[0];
  parsed.to = keep[keep.length - 1];
  if (field === 'byDay') {
    const ops = {};
    keep.forEach(iso => Object.entries(parsed.byDay[iso]).forEach(([n, ks]) => { ops[n] = (ops[n] || 0) + ks; }));
    parsed.ops = ops;
  }
  return true;
}
/* Evidence práce pro Výrobu ze souboru výkazu práce (2.35): jen když list sedí na sloupce
   uložené ve Výrobě (stejná hlavička), jinak null a KPI nabídne nastavit je tam. */
function waProdFrom(sheets, name) {
  const saved = S.settings.prodCols;
  if (!saved) return null;
  for (const sheet of sheets || []) {
    const info = prodColumns(sheet.aoa);
    if (!prodMapFits(saved, info)) continue;
    const res = buildProduction(sheet.aoa, name, saved);
    if (!res.ok) continue;
    const ids = Object.keys(res.buckets).sort();
    return { res, ids, map: saved, old: ids.filter(id => S.production[id]) };
  }
  return null;
}

/* ---------- ovládání ---------- */
function waSetGroup(id, field, value) {
  const g = S.workAudit.groups.find(x => x.id === id);
  if (!g) return;
  if (field === 'name') { const v = String(value).trim().slice(0, 80); if (!v) { renderWorkAudit(); return; } g.name = v; }
  else if (field === 'am' || field === 'pm') {
    const v = waLetter(value);
    if (String(value).trim() && !v) { toast('Sloupec je písmeno jako v Excelu (A až ZZZ).', true); renderWorkAudit(); return; }
    g[field] = v;
  } else g[field] = !!value;
  save();
  renderWorkAudit();
}
async function waAddGroup() {
  const name = await promptBox('Nová skupina', 'Název skupiny (oddělení)', '', 'Přidat');
  if (!name) return;
  const wa = S.workAudit;
  if (wa.groups.length >= 20) { toast('Skupin může být nejvýš 20.', true); return; }
  let i = 1;
  while (wa.groups.some(g => g.id === `g${i}`)) i += 1;
  wa.groups.push({ id: `g${i}`, name: name.slice(0, 80), am: '', pm: '', unprod: false, noIs: false });
  save();
  renderWorkAudit();
}
async function waDelGroup(id) {
  const wa = S.workAudit;
  const g = wa.groups.find(x => x.id === id);
  if (!g) return;
  const n = wa.ops.filter(o => o.group === id).length;
  if (!await confirmBox('Smazat skupinu?', `Skupina „${g.name}“ zmizí z přehledů${n ? ` a ${n} ${operaceN(n)} zůstane bez skupiny` : ''}. Čísla, která už jsou nahraná, se při dalším nahrání obsazenosti pro ni nenačtou.`, 'Smazat', true)) return;
  wa.groups = wa.groups.filter(x => x.id !== id);
  wa.ops.forEach(o => { if (o.group === id) o.group = ''; });
  Object.values(wa.days).forEach(d => { delete d.g[id]; });
  Object.values(wa.edits).forEach(day => Object.keys(day).forEach(k => { if (k.startsWith(`g.${id}.`)) delete day[k]; }));
  save();
  renderWorkAudit();
}
async function waClearRange() {
  const r = waRange();
  const wa = S.workAudit;
  const isos = [...new Set([...Object.keys(wa.days), ...Object.keys(wa.pcs), ...Object.keys(wa.edits), ...Object.keys(wa.notes)])].filter(i => i >= r.from && i <= r.to);
  if (!isos.length) { toast('Ve vybraném období nejsou žádná data.'); return; }
  if (!await confirmBox('Smazat data auditu?', `Za ${r.label} se smaže obsazenost, kusy, ruční úpravy a poznámky (${isos.length} ${denN(isos.length)}). Skupiny a operace zůstanou. Předchozí stav najdeš v historii verzí v Nastavení.`, 'Smazat', true)) return;
  isos.forEach(i => { delete wa.days[i]; delete wa.pcs[i]; delete wa.edits[i]; delete wa.notes[i]; });
  store.note = { kind: 'workaudit', text: `KPI: smazána data za ${r.label} (${isos.length} ${denN(isos.length)})` };
  save();
  renderWorkAudit();
}
function waStep(dir) {
  if (ui.wa.mode === 'week') ui.wa.week = shiftWeek(ui.wa.week, dir) || ui.wa.week;
  else {
    const [y, m] = ui.wa.month.split('-').map(Number);
    const t = (y * 12 + m - 1) + dir;
    ui.wa.month = `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`;
  }
  renderWorkAudit();
}

function bindWorkAudit() {
  const view = $('#view-audit');
  $('#waTabs').addEventListener('click', event => {
    const b = event.target.closest('[data-watab]');
    if (!b) return;
    ui.wa.tab = b.dataset.watab;
    renderWorkAudit();
  });
  $('#waDv').onclick = () => $('#waDvFile').click();
  $('#waDvFile').onchange = event => { const f = event.target.files[0]; event.target.value = ''; dvImportAudit(f); };
  $('#waAttFile').onchange = event => { const f = event.target.files[0]; event.target.value = ''; waImport('att', f); };
  $('#waWorkFile').onchange = event => { const f = event.target.files[0]; event.target.value = ''; waImport('work', f); };
  $('#waPlanFile').onchange = event => { const f = [...event.target.files]; event.target.value = ''; waPlanQueueAdd(f); };
  $('#waPlanTplFile').onchange = event => { const f = event.target.files[0]; event.target.value = ''; waPlanTemplate(f); };
  const wv = $('#waView');
  wv.addEventListener('click', async event => {
    const t = event.target;
    const pick = t.closest('[data-wapick]');
    if (pick) { $(pick.dataset.wapick === 'att' ? '#waAttFile' : '#waWorkFile').click(); return; }
    // Lidé v práci (2.37)
    if (t.closest('[data-dvpick]')) { $('#waDvFile').click(); return; }
    if (t.closest('[data-dvaipick]')) {
      const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.xlsx,.xls,.xlsm,.csv' });
      inp.onchange = async () => {
        const f = inp.files[0];
        if (!f) return;
        let sh;
        try { sh = await readTable(f); } catch (error) { toast(`Soubor se nepodařilo otevřít: ${error.message}`, true); return; }
        if (await dvMapDialog(sh, f.name)) { renderWorkAudit(); toast('Načtení nastavené. Teď soubor nahraj tlačítkem Nahrát docházku a výkony.'); }
      };
      inp.click();
      return;
    }
    // Report docházky (2.40)
    const drm = t.closest('[data-drmode]');
    if (drm) { drRef().mode = drm.dataset.drmode; renderWorkAudit(); return; }
    const drs = t.closest('[data-drshift]');
    if (drs) { drShift(+drs.dataset.drshift); renderWorkAudit(); return; }
    const drgo = t.closest('[data-drgo]');
    if (drgo) { drRef().ref = drgo.dataset.drgo; drRef().mode = 'day'; renderWorkAudit(); return; }
    if (t.closest('[data-drtoday]')) { drRef().ref = todayIso(); renderWorkAudit(); return; }
    if (t.closest('[data-drapply]')) { const v = $('#drDate').value; if (WA_ISO.test(v)) { drRef().ref = v; renderWorkAudit(); } return; }
    const drmk = t.closest('[data-drmark]');
    if (drmk) { const iso = drRef().ref, m = S.workAudit.drep.marks; if (drmk.dataset.drmark) m[iso] = drmk.dataset.drmark; else delete m[iso]; save(); renderWorkAudit(); return; }
    if (t.closest('[data-drrgadd]')) { const g = S.workAudit.drep; if (g.groups.length >= 20) { toast('Nejvýš 20 skupin.', true); return; } g.groups.push({ id: `rg${uid('').replace(/[^A-Za-z0-9]/g, '').slice(0, 20)}`, name: `Skupina ${g.groups.length + 1}`, depts: [] }); ui.wa.drSet = true; save(); renderWorkAudit(); return; }
    const drd = t.closest('[data-drrgdel]');
    if (drd) { const g = S.workAudit.drep.groups.find(x => x.id === drd.dataset.drrgdel); if (g && await confirmBox('Smazat skupinu?', `Skupina „${g.name}“ zmizí z reportu, její oddělení budou zase po skupinách Matice.`, 'Smazat', true)) { S.workAudit.drep.groups = S.workAudit.drep.groups.filter(x => x !== g); save(); renderWorkAudit(); } return; }
    const drg = t.closest('[data-drrgdept]');
    if (drg) {
      const gs = S.workAudit.drep.groups, g = gs.find(x => x.id === drg.dataset.drrgdept), d = drg.dataset.dept;
      if (!g) return;
      if (g.depts.includes(d)) g.depts = g.depts.filter(x => x !== d);
      else { gs.forEach(x => { x.depts = x.depts.filter(y => y !== d); }); g.depts.push(d); }
      save(); renderWorkAudit(); return;
    }
    const drp = t.closest('[data-drpdf]');
    if (drp) { exportDrPdf(drp); return; }
    if (t.closest('[data-drxlsx]')) { exportDrXlsx(); return; }
    const dvm = t.closest('[data-dvmode]');
    if (dvm) { ui.wa.dvMode = dvm.dataset.dvmode; renderWorkAudit(); return; }
    const dvd = t.closest('[data-dvday]');
    if (dvd) { if (dvd.dataset.dvday) { ui.wa.dvDay = dvd.dataset.dvday; renderWorkAudit(); } return; }
    const dvgo = t.closest('[data-dvgo]');
    if (dvgo) { Object.assign(ui.wa, { dvMode: 'day', dvDay: dvgo.dataset.dvgo }); renderWorkAudit(); window.scrollTo({ top: 0, behavior: 'instant' }); return; }
    const dvp = t.closest('[data-dvperson]');
    if (dvp) { openProfile(dvp.dataset.dvperson); return; }
    const kpd = t.closest('[data-kpdir]');
    if (kpd) { ui.wa.kp.dir = kpd.dataset.kpdir; renderWorkAudit(); return; }
    if (t.closest('[data-kpxlsx]')) { exportKpXlsx(); return; }
    const dvs = t.closest('[data-dvsort]');
    if (dvs) { ui.wa.dvSort = dvs.dataset.dvsort; renderWorkAudit(); return; }
    const dvpdf = t.closest('[data-dvpdf]');
    if (dvpdf) { exportDvPdf(dvpdf); return; }
    if (t.closest('[data-dvxlsx]')) { exportDvXlsx(); return; }
    if (t.closest('[data-dvcolreset]')) { S.workAudit.dv.cols = JSON.parse(JSON.stringify(DV_COLS)); save(); renderWorkAudit(); return; }
    const mode = t.closest('[data-wamode]');
    if (mode) { ui.wa.mode = mode.dataset.wamode; renderWorkAudit(); return; }
    const step = t.closest('[data-wastep]');
    if (step) { waStep(+step.dataset.wastep); return; }
    const go = t.closest('[data-watabgo]');
    if (go) {
      const focus = go.dataset.wafocus;
      ui.wa.tab = go.dataset.watabgo; renderWorkAudit();
      const f = focus && document.getElementById(focus);
      if (f) { f.scrollIntoView({ block: 'center', behavior: 'instant' }); f.focus({ preventScroll: true }); } else window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    const wk = t.closest('[data-waweek]');
    if (wk) { Object.assign(ui.wa, { mode: 'week', week: wk.dataset.waweek, tab: 'dny' }); renderWorkAudit(); return; }
    const undo = t.closest('[data-waundo]');
    if (undo) {
      const [iso, key] = undo.dataset.waundo.split('|');
      const e = (S.workAudit.edits[iso] || {})[key];
      if (!e || !await confirmBox('Zrušit úpravu?', `${dayText(iso)}, ${waKeyLabel(S.workAudit, key)}: znovu bude platit hodnota ze souboru (${waRaw(S.workAudit, iso, key) == null ? 'prázdné' : nf(waRaw(S.workAudit, iso, key), 2)}).`, 'Zrušit úpravu')) return;
      waSetEdit(S.workAudit, iso, key, undefined);
      save();
      renderWorkAudit();
      return;
    }
    if (t.closest('[data-wagadd]')) { waAddGroup(); return; }
    const gd = t.closest('[data-wagdel]');
    if (gd) { waDelGroup(gd.dataset.wagdel); return; }
    const opf = t.closest('[data-waopf]');
    if (opf) { ui.wa.opFilter = opf.dataset.waopf; renderWorkAudit(); return; }
    const grp = t.closest('[data-wagrp]');
    if (grp) { ui.wa.group = grp.dataset.wagrp === ui.wa.group ? '' : grp.dataset.wagrp; renderWorkAudit(); if (ui.wa.group) $('#waCharts')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const hist = t.closest('[data-wahist]');
    if (hist) { ui.wa.hist = +hist.dataset.wahist; renderWorkAudit(); return; }
    const apply = t.closest('[data-waapply]');
    if (apply) { waApplyDates(apply.dataset.waapply); return; }
    if (t.closest('[data-waxlsx]')) { exportWaXlsx(); return; }
    if (t.closest('[data-waplanpick]')) { $('#waPlanFile').click(); return; }
    if (t.closest('[data-waplantpl]')) { $('#waPlanTplFile').click(); return; }
    if (t.closest('[data-waplanclear]')) { waPlanClear(); return; }
    if (t.closest('[data-waplanrun]')) { waPlanProcess(); return; }
    if (t.closest('[data-waplanqclear]')) {
      if (await confirmBox('Vyprázdnit frontu?', 'Přečtené soubory z fronty zmizí, uložený plán zůstane beze změny.', 'Vyprázdnit')) waPlanQueueClear();
      return;
    }
    const pr = t.closest('[data-waplanrange]');
    if (pr) { ui.wa.planRange = pr.dataset.waplanrange; renderWorkAudit(); return; }
    const pdfBtn = t.closest('[data-wapdf]');
    if (pdfBtn) { exportWaPdf(pdfBtn); return; }
    const ctPre = t.closest('[data-wactpre]');
    if (ctPre) { ui.wa.ctPre = ctPre.dataset.wactpre; renderWorkAudit(); return; }
    const ctPage = t.closest('[data-wactpage]');
    if (ctPage) { ui.wa.ctPage = ctPage.dataset.wactpage; renderWorkAudit(); return; }
    if (t.closest('[data-wactxlsx]')) { exportCtXlsx(); return; }
    const ctPdf = t.closest('[data-wactpdf]');
    if (ctPdf) { exportCtPdf(ctPdf, ctPdf.dataset.wactpdf === 'noperf'); return; }
    const ogs = t.closest('[data-waogs]');
    if (ogs) {
      const o = S.workAudit.ops.find(x => x.id === ogs.closest('[data-wao]').dataset.wao);
      if (o) { o.group = ogs.dataset.waogs; o.on = true; save(); renderWorkAudit(); }
      return;
    }
    if (t.closest('[data-waguess]')) {
      const wa = S.workAudit;
      let n = 0;
      wa.ops.forEach(o => { if (!(o.on && o.group)) { const g = waGuessGroup(o.name, wa.groups); if (g) { o.group = g; o.on = true; n += 1; } } });
      if (n) { save(); renderWorkAudit(); }
      toast(n ? `Skupina přiřazena u ${n} ${operaceN(n)}.` : 'Podle názvu se žádná skupina odhadnout nedala.', !n);
      return;
    }
    if (t.closest('[data-wacolreset]')) {
      S.workAudit.cols.work = { ...WA_COLS.work };
      S.workAudit.cols.att = { ...WA_COLS.att };
      save();
      renderWorkAudit();
      return;
    }
    if (t.closest('[data-waclear]')) { waClearRange(); return; }
    const day = t.closest('[data-waday]');
    if (day && !t.closest('a, input, select')) { waDayDialog(day.dataset.waday); }
  });
  wv.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.id === 'drDate') { event.preventDefault(); $('[data-drapply]').click(); return; }
    if (event.key === 'Enter' && event.target.matches('[data-wadate]')) { event.preventDefault(); waApplyDates(event.target.closest('[data-wadates]').dataset.wadates); return; }
    if (event.key !== 'Enter' || !event.target.matches('tr[data-waday], tr[data-waweek], tr[data-wagrp], tr[data-dvgo], tr[data-dvperson]')) return;
    event.preventDefault();
    event.target.click();
  });
  wv.addEventListener('toggle', event => {
    const el = event.target;
    if (!el.matches) return;
    if (el.matches('.dr-set')) ui.wa.drSet = el.open;
    else if (el.matches('.wa-old')) ui.wa.oldOpen = el.open;
    else if (el.matches('.wa-mg')) { if (el.open) ui.wa.mgOpen = el.dataset.wamg; else if (ui.wa.mgOpen === el.dataset.wamg) ui.wa.mgOpen = ''; }
  }, true);
  wv.addEventListener('change', event => {
    const rgn = event.target.closest('[data-drrgname]');
    if (rgn) { const g = S.workAudit.drep.groups.find(x => x.id === rgn.dataset.drrgname); if (g) { g.name = rgn.value.replace(/\s+/g, ' ').trim().slice(0, 60) || g.name; save(); renderWorkAudit(); } return; }
    const t = event.target;
    if (t.id === 'waMonth') { ui.wa.month = t.value; renderWorkAudit(); return; }
    if (t.id === 'waWeek') { ui.wa.week = t.value; renderWorkAudit(); return; }
    if (t.id === 'waGroups') { ui.wa.groups = t.checked; renderWorkAudit(); return; }
    if (t.id === 'waGroup') { ui.wa.group = t.value; renderWorkAudit(); return; }
    if (t.matches('[data-wadate]')) { waDatesMark(t); return; }
    if (t.id === 'waAllEdits') { ui.wa.allEdits = t.checked; renderWorkAudit(); return; }
    if (t.id === 'waRepPlace' || t.id === 'waRepFirm') {
      const rep = S.workAudit.rep || (S.workAudit.rep = { place: '', firm: '' });
      const k = t.id === 'waRepPlace' ? 'place' : 'firm';
      const v = String(t.value || '').replace(/\s+/g, ' ').trim().slice(0, k === 'place' ? 60 : 80);
      if (rep[k] !== v) { rep[k] = v; save(); }
      t.value = v;
      const box = $('#ctrPage');   // jen stránka reportu, ať Tab do dalšího pole nezahodí fokus
      if (box && ui.wa.ctShown) { box.innerHTML = waCtPageHtml(waCtRange(), ui.wa.ctShown); setWidths(box); } else renderWorkAudit();
      return;
    }
    if (t.id === 'waPlanWords') {
      const words = [...new Set(t.value.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean).map(w => w.slice(0, 12)))].slice(0, 12);
      S.workAudit.plan.tech.words = words;
      save();
      toast(words.length ? `Do plánu se vezmou technologie ${words.join(', ')}. Platí pro další nahrání.` : 'Do plánu se vezmou všechny technologie. Platí pro další nahrání.');
      renderWorkAudit();
      return;
    }
    if (t.name === 'waPlanMode') { S.workAudit.plan.tech.mode = t.value === 'contains' ? 'contains' : 'token'; save(); renderWorkAudit(); return; }
    if (t.id === 'waPlanGroup') { S.workAudit.plan.cap.group = t.value; save(); renderWorkAudit(); return; }
    if (t.id === 'waPlanPer') {
      const n = toNum(t.value);
      if (n == null || !(n > 0) || n > 10000) { toast('Kusy za směnu jsou kladné číslo (třeba 25).', true); renderWorkAudit(); return; }
      S.workAudit.plan.cap.perShift = Math.round(n * 10) / 10;
      save();
      renderWorkAudit();
      return;
    }
    if (t.id === 'waTrainPct') {
      const v = t.value.trim().replace(/\s|%/g, '');
      const n = v ? Number(v.replace(',', '.')) : null;
      if (v && !(Number.isInteger(n) && n >= 1 && n <= 100)) { toast('Hranice zaškolení je celé procento (1 až 100), nebo nech pole prázdné.', true); renderWorkAudit(); return; }
      S.workAudit.trainPct = n;
      save();
      toast(n ? `Hranice zaškolení: od ${n} % dovedností skupiny.` : 'Hranice zaškolení se bere z Matice dovedností.');
      renderWorkAudit();
      return;
    }
    if (t.id === 'waTarget') {
      const v = t.value.trim();
      const n = v ? Number(v.replace(/\s/g, '')) : null;
      if (v && !(Number.isInteger(n) && n >= 1 && n <= 10000)) { toast('Požadavek je celý počet lidí (1 až 10 000), nebo nech pole prázdné.', true); renderWorkAudit(); return; }
      S.workAudit.target = n;
      save();
      toast(n ? `Požadavek: ${n} lidí na pracovní den.` : 'Požadavek se bere ze souboru obsazenosti.');
      renderWorkAudit();
      return;
    }
    const gRow = t.closest('[data-wag]');
    if (gRow && t.dataset.wagf) { waSetGroup(gRow.dataset.wag, t.dataset.wagf, t.type === 'checkbox' ? t.checked : t.value); return; }
    if (gRow && t.dataset.wagmg) {
      const wa = S.workAudit;
      const g = wa.groups.find(x => x.id === gRow.dataset.wag);
      if (!g) return;
      const set = new Set(g.mg || []);
      if (t.checked) set.add(t.dataset.wagmg); else set.delete(t.dataset.wagmg);
      g.mg = S.positions.filter(p => set.has(p.id)).map(p => p.id);
      dvAuditRefresh(wa);   // dny od listopadu se přepočítají z příchodů
      ui.wa.mgOpen = g.id;
      save();
      renderWorkAudit();
      return;
    }
    const oRow = t.closest('[data-wao]');
    if (oRow && t.dataset.waof) {
      const o = S.workAudit.ops.find(x => x.id === oRow.dataset.wao);
      if (!o) return;
      o.group = t.value;   // skupina = počítá se, „nepočítat“ = bez skupiny
      o.on = true;
      save();
      renderWorkAudit();
      return;
    }
    if (t.id === 'dvDaySel') { ui.wa.dvDay = t.value; renderWorkAudit(); return; }
    if (t.id === 'dvMonthSel') { ui.wa.dvMonth = t.value; renderWorkAudit(); return; }
    if (t.id === 'kpMonth') { ui.wa.kp.month = t.value; renderWorkAudit(); return; }
    if (t.id === 'kpSort') { ui.wa.kp.sort = t.value; renderWorkAudit(); return; }
    if (t.id === 'kpDept') { ui.wa.kp.dept = t.value; renderWorkAudit(); return; }
    if (t.id === 'dvUnit') { S.workAudit.dv.unit = DV_UNITS.includes(t.value) ? t.value : 'auto'; save(); renderWorkAudit(); return; }
    if (t.dataset.dvcol) {
      const [kind, key] = t.dataset.dvcol.split('.');
      const v = waLetter(t.value);
      if (t.value.trim() && !v) { toast('Sloupec je písmeno jako v Excelu (A až ZZZ).', true); renderWorkAudit(); return; }
      if (!v && key !== 'date' && key !== 'norm') { toast('Tenhle sloupec musí být vyplněný.', true); renderWorkAudit(); return; }
      S.workAudit.dv.cols[kind][key] = v;
      save();
      renderWorkAudit();
      return;
    }
    if (t.dataset.wacol) {
      const [kind, key] = t.dataset.wacol.split('.');
      const v = waLetter(t.value);
      if (t.value.trim() && !v) { toast('Sloupec je písmeno jako v Excelu (A až ZZZ).', true); renderWorkAudit(); return; }
      if (!v && (key === 'date' || kind === 'work')) { toast('Tenhle sloupec musí být vyplněný.', true); renderWorkAudit(); return; }
      S.workAudit.cols[kind][key] = v;
      save();
      renderWorkAudit();
    }
  });
  wv.addEventListener('input', event => {
    if (event.target.matches('[data-wadate]')) { waDatesMark(event.target); return; }
    if (event.target.id !== 'waOpQ') return;
    ui.wa.opQ = event.target.value;
    const pos = event.target.selectionStart;
    renderWorkAudit();
    const q = $('#waOpQ');
    if (q) { q.focus(); q.setSelectionRange(pos, pos); }
  });
  // Tooltip grafů (myš i klávesnice), stejně jako v profilu.
  const showTip = hit => {
    const wrap = hit.closest('.wa-charts, .ctr-chart');
    const tip = wrap && $('.chart-tip', wrap);
    if (!tip || !wrap) return;
    hideTip();
    tip.textContent = hit.dataset.tip;
    tip.hidden = false;
    const a = hit.getBoundingClientRect();
    const b = wrap.getBoundingClientRect();
    const sl = wrap.scrollLeft || 0;   // graf reportu na telefonu se posouvá do strany
    tip.style.left = `${clamp(a.left - b.left + sl + a.width / 2 - tip.offsetWidth / 2, sl, sl + Math.max(0, b.width - tip.offsetWidth))}px`;
    tip.style.top = `${Math.max(0, a.top - b.top - tip.offsetHeight - 6)}px`;
    $$('.chart .hit.on, .ctr-hit.on', wrap).forEach(x => x.classList.remove('on'));
    hit.classList.add('on');
  };
  const hideTip = () => {
    $$('.wa-charts .chart-tip, .ctr-chart .chart-tip', view).forEach(x => { x.hidden = true; });
    $$('.wa-charts .hit.on, .ctr-hit.on', view).forEach(x => x.classList.remove('on'));
  };
  const HIT = '.chart .hit, .ctr-hit';
  view.addEventListener('pointerover', event => { const hit = event.target.closest(HIT); if (hit) showTip(hit); });
  view.addEventListener('pointerout', event => { if (event.target.closest(HIT)) hideTip(); });
  view.addEventListener('focusin', event => { const hit = event.target.closest(HIT); if (hit) showTip(hit); });
  view.addEventListener('focusout', event => { if (event.target.closest(HIT)) hideTip(); });
}

