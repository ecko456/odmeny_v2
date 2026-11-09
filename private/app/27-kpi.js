/* ==========================================================================
   AUDIT: lidé v práci a zpracované kusy (verze 2.17)
   Výpočty jsou v core.js (S.workAudit, waDay, waTotals, waSheets…). Tady je výběr období,
   záložky, nahrání obou souborů, úpravy hodnot s důvodem, nastavení skupin a operací,
   PDF a Excel pro auditora.
   ========================================================================== */
const WA_TABS = [['prehled', 'Přehled'], ['lide', 'Lidé v práci'], ['report', 'Report docházky'], ['kapacity', 'Kapacity a zaškolení'], ['vykon', 'Výkonnost na osobu'], ['dny', 'Dny'], ['nastaveni', 'Nastavení']];
/* Výrobní plán a Úpravy jsou od 2.44 pryč z KPI (přání uživatele). Uložená data i kód zůstávají,
   záložky už nejdou otevřít z rozhraní. */
const WA_OLD_TABS = ['plan', 'upravy'];
const WA_MODES = [['month', 'Měsíc'], ['week', 'Týden'], ['custom', 'Vlastní']];
const WA_HIST = [[13, '13 týdnů'], [26, '26 týdnů'], [52, '52 týdnů'], [0, 'Vše']];
const waN = (v, d = 0) => (v == null ? '—' : nf(v, d));
const waP = v => (v == null ? '—' : `${nf(v * 100, 1)} %`);
const osobN = n => (n === 1 ? 'osobosměna' : n >= 2 && n <= 4 ? 'osobosměny' : 'osobosměn');
const WA_NOTE_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-7L7.5 20v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5z"/><path d="M8 9h8M8 12h5"/></svg>';
const WA_UNDO_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';
const denN = n => (n === 1 ? 'den' : n >= 2 && n <= 4 ? 'dny' : 'dní');
const operaceN = n => (n >= 1 && n <= 4 ? 'operace' : 'operací');
function waLastDay(month) {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}
function waGroupName(id) { const g = S.workAudit.groups.find(x => x.id === id); return g ? g.name : 'bez skupiny'; }
/* Typ dne jako štítek: víkend fialově (jako v docházce), svátek s názvem. */
function waDayTag(day) {
  if (day.hol) return `<span class="tag wk wa-hol" title="Státní svátek">${esc(day.hol)}</span>`;
  return day.weekend ? `<span class="tag wk">${day.sat ? 'sobota' : 'neděle'}</span>` : '';
}

/* Období záložek Dny a Úpravy: měsíc, týden, nebo vlastní rozsah. Výchozí je měsíc posledních dat. */
function waRange() {
  const span = waSpan(S.workAudit);
  const last = span ? span.to : todayIso();
  const mode = ui.wa.mode;
  if (mode === 'week') {
    const w = weekById(ui.wa.week) || isoWeek(last);
    ui.wa.week = w.id;
    return { from: w.from, to: w.to, label: `${weekName(w.id)} · ${weekRange(w)}` };
  }
  if (mode === 'custom') {
    let from = WA_ISO.test(ui.wa.from) ? ui.wa.from : span ? span.from : `${last.slice(0, 7)}-01`;
    let to = WA_ISO.test(ui.wa.to) ? ui.wa.to : last;
    if (from > to) [from, to] = [to, from];
    Object.assign(ui.wa, { from, to });
    return { from, to, label: `${dayText(from)} – ${dayText(to)}` };
  }
  const month = MONTH_RE.test(ui.wa.month) ? ui.wa.month : last.slice(0, 7);
  ui.wa.month = month;
  return { from: `${month}-01`, to: waLastDay(month), label: monthLabel(month) };
}

function renderWaBadge() {
  const badge = $('#navWa');
  if (!badge || !S) return;
  const n = S.workAudit.ops.filter(op => !(op.on && op.group)).length;
  badge.hidden = !n;
  badge.textContent = String(n);
  badge.title = n ? `${n} ${operaceN(n)} z výkazu práce bez skupiny (kusy se nepočítají)` : '';
}

function renderWorkAudit() {
  const view = $('#waView');
  if (!view || !S) return;
  renderWaBadge();
  const tab = WA_TABS.some(t => t[0] === ui.wa.tab) || WA_OLD_TABS.includes(ui.wa.tab) ? ui.wa.tab : 'prehled';
  $('#waTabs').innerHTML = WA_TABS.map(([k, t]) => `<button type="button" class="chip${k === tab ? ' on' : ''}" data-watab="${k}" aria-pressed="${k === tab}">${t}</button>`).join('');
  showActiveChip($('#waTabs'));
  const has = !!waSpan(S.workAudit);
  if (tab === 'nastaveni') { view.innerHTML = waSettingsHtml(); return; }
  if (tab === 'plan') { view.innerHTML = waPlanHtml(); setWidths(view); return; }
  if (tab === 'kapacity') { view.innerHTML = waCtHtml(); setWidths(view); return; }   // nepotřebuje data KPI
  if (tab === 'lide') { view.innerHTML = dvHtml(); setWidths(view); return; }   // docházka a výkony z jednoho souboru (2.37)
  if (tab === 'report') { view.innerHTML = drHtml(); drPaint(view); return; }   // report docházky po vzoru (2.40)
  if (tab === 'vykon') { view.innerHTML = kpHtml(); setWidths(view); return; }   // výkonnost na osobu (2.44)
  if (!has) { view.innerHTML = waStartHtml(); return; }
  if (tab === 'prehled') { view.innerHTML = waHistHtml(); setWidths(view); return; }
  const r = waRange();
  const days = waDays(S.workAudit, r.from, r.to);
  view.innerHTML = waPeriodHtml(r) + (tab === 'upravy' ? waEditsHtml(r) : waCheckHtml(days) + waDaysHtml(days));
  setWidths(view);
}

/* ---------- začátek: co nahrát a z jakých sloupců ---------- */
function waColList(kind) {
  const wa = S.workAudit;
  const list = kind === 'work'
    ? Object.entries(wa.cols.work).map(([k, l]) => [l, WA_COL_LABEL[k]])
    : [...Object.entries(wa.cols.att).map(([k, l]) => [l, WA_COL_LABEL[k]]),
      ...wa.groups.flatMap(g => [[g.am, `Ranní: ${g.name}`], [g.pm, `Odpolední: ${g.name}`]])];
  return list.filter(([l]) => l).sort((a, b) => waIndex(a[0]) - waIndex(b[0]));
}
function waColsTable(kind) {
  return `<table class="wa-cols"><tbody>${waColList(kind).map(([l, t]) => `<tr><th scope="row">${esc(l)}</th><td>${esc(t)}</td></tr>`).join('')}</tbody></table>`;
}
function waStartHtml() {
  return `<div class="wa-start">
    <div class="card wa-src"><div class="wa-src-head"><span class="wa-step">1</span><div><h3>Obsazenost směn</h3><p class="small muted">Excel vedoucích: jeden řádek = jeden den. Řádky bez data (nadpisy, součty) se přeskočí, všechny listy se projdou.</p></div></div>
      ${waColsTable('att')}<button class="btn" type="button" data-wapick="att">Nahrát obsazenost</button></div>
    <div class="card wa-src"><div class="wa-src-head"><span class="wa-step">2</span><div><h3>Výkaz práce z IS</h3><p class="small muted">Každý řádek je záznam práce. Kusy se sečtou po dnech a operacích, nové operace se přiřadí skupině podle názvu (jde změnit).</p></div></div>
      ${waColsTable('work')}<button class="btn" type="button" data-wapick="work">Nahrát výkaz práce</button></div>
  </div>
  <p class="hint">Písmena sloupců jsou podle zadání. Kdyby soubor vypadal jinak, změníš je v záložce <button class="link" type="button" data-watabgo="nastaveni">Nastavení</button>. Soubory se čtou jen v prohlížeči a ukládají zašifrovaně jako ostatní data.</p>
  <p class="hint">Docházku po lidech (příchody a odchody) a vykázanou práci z jednoho souboru nahraješ tlačítkem <b>Nahrát docházku a výkony</b>; výsledek je v záložce <button class="link" type="button" data-watabgo="lide">Lidé v práci</button>.</p>`;
}

/* ---------- výběr období ---------- */
function waMonthsList() {
  const span = waSpan(S.workAudit);
  const out = [];
  let m = span.from.slice(0, 7);
  const end = span.to.slice(0, 7);
  for (let i = 0; m <= end && i < 240; i += 1) { out.push(m); const [y, mm] = m.split('-').map(Number); m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`; }
  if (!out.includes(ui.wa.month)) out.push(ui.wa.month);
  return out.sort().reverse();
}
function waWeeksList() {
  const span = waSpan(S.workAudit);
  const out = [];
  for (let w = isoWeek(span.from).id, i = 0; w && w <= isoWeek(span.to).id && i < 600; w = shiftWeek(w, 1), i += 1) out.push(w);
  if (!out.includes(ui.wa.week)) out.push(ui.wa.week);
  return out.sort().reverse();
}
function waPeriodHtml(r) {
  const mode = ui.wa.mode;
  let pick = '';
  if (mode === 'month') {
    pick = `<button class="icon-btn" type="button" data-wastep="-1" aria-label="Předchozí měsíc">${I.back}</button>
      <select id="waMonth" aria-label="Měsíc">${waMonthsList().map(m => `<option value="${m}"${m === ui.wa.month ? ' selected' : ''}>${esc(monthLabel(m))}</option>`).join('')}</select>
      <button class="icon-btn t5-next" type="button" data-wastep="1" aria-label="Další měsíc">${I.back}</button>`;
  } else if (mode === 'week') {
    pick = `<button class="icon-btn" type="button" data-wastep="-1" aria-label="Předchozí týden">${I.back}</button>
      <select id="waWeek" aria-label="Týden">${waWeeksList().map(w => `<option value="${w}"${w === ui.wa.week ? ' selected' : ''}>${esc(`${weekName(w)} · ${weekRange(weekById(w))}`)}</option>`).join('')}</select>
      <button class="icon-btn t5-next" type="button" data-wastep="1" aria-label="Další týden">${I.back}</button>`;
  } else if (mode === 'custom') {
    pick = waDatesHtml('wa', r);
  }
  return `<div class="t5-weekbar wa-period"><div class="chips" role="group" aria-label="Období">${WA_MODES.map(([k, t]) => `<button type="button" class="chip${k === mode ? ' on' : ''}" data-wamode="${k}" aria-pressed="${k === mode}">${t}</button>`).join('')}</div>
    ${pick}</div>`;
}

/* ---------- přehled: historie po týdnech a měsících (2.17.1) ---------- */
/* Období přehledu, PDF a Excelu: posledních N týdnů, nebo vlastní od–do (2.19.1). */
function waOverviewRange() {
  const wa = S.workAudit;
  if (ui.wa.hist !== 'custom') return waHistRange(wa, ui.wa.hist);
  const r = waCustomRange(wa, ui.wa.hFrom, ui.wa.hTo);
  if (r) Object.assign(ui.wa, { hFrom: r.want.from, hTo: r.want.to });
  return r;
}
function waHistData() {
  const wa = S.workAudit;
  const r = waOverviewRange();
  const days = r.empty ? [] : waDays(wa, r.from, r.to);
  const t = waTotals(wa, days);
  const list = waWeeks(wa, days);
  return { r, t, list, days, grain: 'week' };
}
/* Pole Od a Do vlastního období s tlačítkem Zobrazit (2.19.2). Chrome posílá change už při psaní
   každé číslice, překreslení by pole zničilo uprostřed psaní: období se proto použije až tlačítkem
   nebo Enterem. id: 'waH' přehled, 'waPlan' výrobní plán, 'wa' záložka Dny. */
function waDatesHtml(id, v) {
  return `<span class="wa-custom" role="group" aria-label="Období od–do" data-wadates="${id}" data-from="${esc(v.from)}" data-to="${esc(v.to)}">
    <label class="wa-date"><span>Od</span><input type="date" id="${id}From" value="${esc(v.from)}" data-wadate></label>
    <label class="wa-date"><span>Do</span><input type="date" id="${id}To" value="${esc(v.to)}" data-wadate></label>
    <button class="btn sec small" type="button" data-waapply="${id}">Zobrazit</button></span>`;
}
/* Data od–do se jen vyplňují; změněné období zvýrazní tlačítko Zobrazit. */
function waDatesMark(input) {
  const g = input.closest('[data-wadates]');
  const id = g.dataset.wadates;
  const changed = $(`#${id}From`).value !== g.dataset.from || $(`#${id}To`).value !== g.dataset.to;
  g.querySelector('[data-waapply]').classList.toggle('sec', !changed);
}
/* Použije vyplněné období (obrácené meze prohodí). */
function waApplyDates(id) {
  let from = ($(`#${id}From`) || {}).value || '';
  let to = ($(`#${id}To`) || {}).value || '';
  if (!WA_ISO.test(from) || !WA_ISO.test(to)) { toast('Vyplň obě data, od i do.', true); return; }
  if (from > to) [from, to] = [to, from];
  if (id === 'waH') Object.assign(ui.wa, { hist: 'custom', hFrom: from, hTo: to });
  else if (id === 'waPlan') Object.assign(ui.wa, { planRange: 'custom', pFrom: from, pTo: to });
  else if (id === 'waCt') Object.assign(ui.wa, { ctPre: 'custom', ctFrom: from, ctTo: to });
  else Object.assign(ui.wa, { mode: 'custom', from, to });
  renderWorkAudit();
}
/* Popisek osy: týden T40. */
function waAxisLabel(x) { return `T${weekById(x.id).w}`; }
/* Dny týdne; u vlastního období (r.want) jen dny v něm, první a poslední týden mohou být jen zčásti. */
function waShortRange(x, r = null) {
  const w = weekById(x.id);
  if (!w) return '';
  const c = r && r.want ? r : null;
  const from = c && c.from > w.from ? c.from : w.from;
  const to = c && c.to < w.to ? c.to : w.to;
  return from === to ? dayText(from, false) : `${dayText(from, false)}–${dayText(to, false)}`;
}
const waSigned = (v, d = 0) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${nf(Math.abs(v), d)}`);
const clovekodenN = n => (Math.abs(n) === 1 ? 'člověkoden' : Math.abs(n) >= 2 && Math.abs(n) <= 4 ? 'člověkodny' : 'člověkodní');
const pracDnyN = n => (n === 1 ? 'pracovní den' : n >= 2 && n <= 4 ? 'pracovní dny' : 'pracovních dní');

/* Výpadek lidí a dorovnání (2.18): kumulovaná bilance lidí proti požadavku po týdnech a výpadky
   (kdy začal, kdy se dorovnal, za kolik pracovních dní, nejvyšší ztráta). */
function waStaffHtml(st, list, r = null) {
  const wa = S.workAudit;
  if (!st.n) return `<div class="card wa-staff"><h3>Výpadek lidí a dorovnání</h3><p class="small muted">V období chybí požadavek lidí (sloupce „mělo dorazit“ a „požadavek“), nebo ho nastav pevně v Nastavení.</p></div>`;
  const bal = st.balance;
  const closed = st.episodes.filter(e => e.to);
  const avgRec = closed.length ? closed.reduce((a, e) => a + e.days, 0) / closed.length : null;
  const head = st.open
    ? `<p class="wa-staff-big crit"><b class="num">${esc(waSigned(bal, 1))}</b> ${clovekodenN(Math.round(bal))}</p>
       <p>Výpadek trvá od <b>${esc(ktDay(st.open.from))}</b> (${st.open.days} ${pracDnyN(st.open.days)}). Průměrně chybělo <b>${esc(nf(st.open.avgShort, 1))} lidí</b> denně.</p>
       <p class="wa-staff-fix">Na dorovnání: <b>+${st.open.extra} ${lidiN(st.open.extra)} denně po ${st.open.needDays} ${pracDnyN(st.open.needDays)}</b>${st.open.needDays > 5 ? ` (asi ${nf(st.open.needDays / 5, 1)} týdne)` : ''}.</p>`
    : `<p class="wa-staff-big good"><b class="num">${esc(waSigned(bal, 1))}</b> ${clovekodenN(Math.round(bal))}</p><p>Bilance proti požadavku je vyrovnaná, žádný výpadek k dorovnání.</p>`;
  const eps = st.episodes.slice(-6).reverse().map(e => `<li><b>${esc(ktDay(e.from))} – ${e.to ? esc(ktDay(e.to)) : 'dosud'}</b><span>nejvíc ${esc(waSigned(e.worst, 1))} ${clovekodenN(Math.round(e.worst))}</span><em class="${e.to ? '' : 'open'}">${e.to ? `dorovnáno za ${e.days} ${pracDnyN(e.days)}` : `trvá ${e.days} ${pracDnyN(e.days)}`}</em></li>`).join('');
  let cum = 0;
  const pts = list.map(x => { if (x.t.reqDays) cum = Math.round((cum + (x.t.balance || 0)) * 100) / 100; return { label: waAxisLabel(x), x, v: x.t.reqDays ? cum : null, wk: x.t.balance }; });
  const chart = waBalanceChart({ title: 'Kumulovaná bilance lidí', sub: `proti požadavku${wa.target ? ` (pevně ${wa.target} lidí)` : ''}, na konci týdne`, points: pts,
    tip: p => `${p.x.label} (${waShortRange(p.x, r)}): týden ${waSigned(p.wk, 1)}, celkem ${waSigned(p.v, 1)} ${clovekodenN(Math.round(p.v || 0))} · splněno ${p.x.t.metDays} z ${p.x.t.reqDays} dní` });
  return `<div class="card wa-staff"><div class="card-head"><div><h3>Výpadek lidí a dorovnání</h3><p class="small muted">Bilance = lidé v práci minus požadavek, sčítaná den po dni. Když dva týdny chybí 3 lidé, je potřeba 3 lidi navíc po stejnou dobu, než se ztráta dorovná.</p></div></div>
    <div class="wa-staff-grid"><div class="wa-staff-now">${head}
      ${eps ? `<h4>Výpadky</h4><ul class="wa-eps">${eps}</ul>` : ''}
      ${avgRec != null ? `<p class="small muted">Průměrně se výpadek dorovnal za ${nf(avgRec, 1)} ${pracDnyN(Math.round(avgRec))}.</p>` : ''}</div>
      <div class="wa-charts" id="waCharts2">${chart}<div class="chart-tip" id="waTip2" hidden></div></div></div></div>`;
}
/* Čára kumulované bilance s nulovou osou (hodnoty i pod nulou). */
function waBalanceChart({ title, sub, points, tip }) {
  const W = 560, H = 210, L = 44, R = 10, T = 18, B = 24;
  const vals = points.map(p => p.v);
  const present = vals.filter(v => v != null);
  if (!present.length) return `<figure class="chart c-acc"><figcaption><b>${esc(title)}</b><span>${esc(sub)}</span></figcaption><div class="chart-empty">V tomto období bez údajů.</div></figure>`;
  const hi = Math.max(0, ...present), lo = Math.min(0, ...present);
  const step = niceMax(Math.max(hi, -lo, 1) / 2);
  let top = Math.max(step, Math.ceil(hi / step) * step), bot = Math.min(-step, Math.floor(lo / step) * step);
  if (top - hi < step * 0.2) top += step;   // místo na popisek u krajní hodnoty
  if (lo - bot < step * 0.2) bot -= step;
  const plotH = H - T - B;
  const y = v => T + (top - v) / (top - bot) * plotH;
  const band = (W - L - R) / points.length;
  const cx = i => L + i * band + band / 2;
  const every = Math.ceil(points.length / 12);
  let d = '';
  let pen = false;
  let last = -1;
  vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${cx(i).toFixed(1)} ${y(v).toFixed(1)}`; pen = true; last = i; });
  const ticks = [];
  for (let v = bot; v <= top + 1e-9; v += step) ticks.push(v);
  const grid = ticks.map(v => `<line class="${v === 0 ? 'ref' : 'grid'}" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="yl" x="${L - 6}" y="${(y(v) + 3.5).toFixed(1)}">${esc(waSigned(v))}</text>`).join('');
  const r = points.length > 30 ? 2.5 : 4;
  const dots = vals.map((v, i) => (v == null ? '' : `<circle class="wa-dot${v < 0 ? ' neg' : ''}" cx="${cx(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${r}"/>`)).join('');
  const labels = points.map((p, i) => ((points.length - 1 - i) % every === 0 ? `<text class="xl" x="${cx(i).toFixed(1)}" y="${H - 8}">${esc(p.label)}</text>` : '')).join('');
  const hits = points.map((p, i) => `<rect class="hit" x="${(L + i * band).toFixed(1)}" y="${T}" width="${band.toFixed(1)}" height="${plotH}" tabindex="0" data-tip="${esc(tip(p))}"/>`).join('');
  // Poslední hodnota vlevo od bodu: čára k němu přichází zleva shora (pokles) nebo zdola (růst), popisek ji tak nepřekryje.
  const cap = last >= 0 ? `<text class="cap wa-capl" x="${(cx(last) - 9).toFixed(1)}" y="${(y(vals[last]) + (last ? (vals[last] < vals[last - 1] ? 14 : -7) : -9)).toFixed(1)}">${esc(waSigned(vals[last], 1))}</text>` : '';
  return `<figure class="chart c-acc"><figcaption><b>${esc(title)}</b><span>${esc(sub)} · nad nulou přebytek, pod nulou chybějící lidé</span></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${grid}<path class="wa-line" d="${d}"/>${dots}${labels}${cap}${hits}</svg></figure>`;
}

function waHistHtml() {
  const wa = S.workAudit;
  const { r, t, list, days } = waHistData();
  const G = wa.groups.find(g => g.id === ui.wa.group) || null;
  const gid = G ? G.id : '';
  const f = waFx(t, gid);
  const fx = x => waFx(x.t, gid);
  const withPcs = list.filter(x => fx(x).pcs != null);
  const sumPcs = withPcs.reduce((a, x) => a + fx(x).pcs, 0);
  const metTone = f.metShare == null ? '' : f.metShare >= 0.9 ? 'good' : f.metShare < 0.6 ? 'crit' : 'warn';
  const bar = `<div class="t5-weekbar wa-hist-bar">
      <div class="chips" role="group" aria-label="Období">${WA_HIST.map(([n, l]) => `<button type="button" class="chip${n === ui.wa.hist ? ' on' : ''}" data-wahist="${n}" aria-pressed="${n === ui.wa.hist}">${l}</button>`).join('')}</div>
      ${waDatesHtml('waH', r.want || r)}
      <select id="waGroup" aria-label="Skupina"><option value="">Všechny skupiny</option>${wa.groups.map(g => `<option value="${esc(g.id)}"${g.id === gid ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</select>
      <span class="spacer"></span>
      <button class="btn sec" type="button" data-waxlsx${r.empty ? ' disabled' : ''}>Excel</button>
      <button class="btn" type="button" data-wapdf${r.empty ? ' disabled' : ''}>PDF pro auditora</button>
    </div>`;
  if (r.empty) {
    const span = waSpan(wa);
    return `${bar}<div class="card">${emptyState('V tomto období nejsou data', `Zvoleno ${esc(dayText(r.want.from))} – ${esc(dayText(r.want.to))}. Obsazenost a výkaz práce jsou nahrané za ${esc(dayText(span.from))} – ${esc(dayText(span.to))}.`)}</div>`;
  }
  const ng = wa.ops.filter(o => !(o.on && o.group)).length;
  const warn = ng ? `<div class="note w wa-hist-warn">${ng} ${operaceN(ng)} z výkazu práce ${ng === 1 ? 'nemá' : 'nemají'} skupinu, ${ng === 1 ? 'její kusy' : 'jejich kusy'} se nepočítají. <button class="link" type="button" data-watabgo="nastaveni">Přiřadit skupiny</button></div>` : '';
  // 2.69.1: odkud jsou lidé v práci a na koho se počítají kusy
  const info = [t.attFb ? `Lidé v práci za ${t.attFb} ${dniN(t.attFb)} bez souboru obsazenosti jsou doplněni z docházky (hodiny bez nepřítomnosti, bez vedoucích).` : '',
    t.perAll ? 'Skupiny KPI nemají přiřazené skupiny Matice dovedností, kusy na osobosměnu se proto počítají na všechny lidi v práci. <button class="link" type="button" data-watabgo="nastaveni">Přiřadit skupiny Matice</button>' : ''].filter(Boolean);
  const warnAll = warn + (info.length ? `<div class="note i wa-hist-warn">${info.join(' ')}</div>` : '');
  const perNote = G ? (G.noIs ? 'projekt není evidován v IS' : G.unprod ? 'neproduktivní pozice, nepočítá se' : 'kusy skupiny na její osobosměnu') : t.perAll ? 'na lidi v práci (skupiny KPI nemají přiřazené skupiny Matice)' : 'produktivní skupiny';
  const tiles = `<div class="stats wa-stats">${[
    statTile('Lidé v práci', `${waN(f.avg, 1)}<em>Ø na den</em>`, f.req != null ? `požadavek Ø ${waN(f.req, 1)}${wa.target ? ' (pevný)' : ''}` : G ? esc(G.name) : 'požadavek v souboru chybí'),
    G ? statTile('Podíl na lidech v práci', waP(f.share), `z Ø ${waN(t.avgPeople, 1)} lidí na pracovní den`)
      : statTile('Obsazenost proti plánu', waP(f.metShare), f.reqDays ? `${f.metDays} z ${f.reqDays} ${pracDnyN(f.reqDays)} s požadavkem splněným (≥ 100 %) · Ø ${waP(f.req ? f.avg / f.req : t.fill)} požadavku` : 'požadavek v souboru chybí', metTone),
    statTile('Zpracováno', `${waN(f.pcs)}<em>ks</em>`, G && G.noIs ? 'projekt není evidován v IS' : withPcs.length ? `Ø ${waN(sumPcs / withPcs.length)} ks za týden` : 'žádná operace se skupinou', 'tab'),
    statTile('Kusy na osobosměnu', waN(f.per, 1), perNote),
  ].join('')}</div>`;
  const name = x => `${x.label} (${waShortRange(x, r)})`;
  const pts = list.map(x => ({ label: waAxisLabel(x), x, v: fx(x) }));
  const per = `po týdnech${G ? ` · ${G.name}` : ''}`;
  const charts = `<div class="wa-charts three" id="waCharts">
      ${waChart({ title: 'Lidé v práci', sub: `Ø na pracovní den ${per}`, points: pts, value: p => p.v.avg, ref: G ? null : p => p.v.req, tone: 'c-acc', cap: v => nf(v, 1), legend: G ? null : ['v práci', 'požadavek'],
        tip: p => `${name(p.x)}: Ø ${waN(p.v.avg, 1)} lidí na pracovní den${G ? (p.v.share != null ? ` (${waP(p.v.share)} všech)` : '') : p.v.req != null ? ` z požadavku ${waN(p.v.req, 1)} · splněno ${p.v.metDays} z ${p.v.reqDays} dní` : ''}` })}
      ${waChart({ title: 'Zpracované kusy', sub: `součet ${per}`, points: pts, value: p => p.v.pcs, tone: 'c-tab', cap: v => nf(v, 0),
        tip: p => `${name(p.x)}: ${p.v.pcs == null ? 'bez kusů' : `${waN(p.v.pcs)} ks`}` })}
      ${waLine({ title: 'Kusy na osobosměnu', sub: `${G ? '' : 'produktivní skupiny '}${per}`, points: pts, value: p => p.v.per, tone: 'c-prod', cap: v => nf(v, 1),
        tip: p => `${name(p.x)}: ${p.v.per == null ? 'bez údajů' : `${waN(p.v.per, 1)} ks na osobosměnu`}` })}
      <div class="chart-tip" id="waTip" hidden></div>
    </div>`;
  const staff = G ? '' : waStaffHtml(waStaffing(wa, days), list, r);
  // Rozpad po skupinách za celé období (2.17.2); klepnutí na skupinu přepne grafy a tabulku na ni.
  const gx = wa.groups.map(g => ({ g, v: waFx(t, g.id) }));
  const maxAvg = Math.max(1e-9, ...gx.map(x => x.v.avg || 0));
  const maxPcs = Math.max(1e-9, ...gx.map(x => x.v.pcs || 0));
  const kind = g => (g.noIs ? '<span class="tag wa-nois">mimo IS</span>' : g.unprod ? '<span class="tag wa-unprod">neproduktivní</span>' : '');
  const groups = `<div class="card wa-groups"><div class="card-head"><div><h3>Po skupinách</h3><p class="small muted">${esc(dayText(r.from))} – ${esc(dayText(r.to))}. Klepnutím na skupinu se grafy a tabulka přepnou na ni.</p></div>
      ${G ? '<button class="btn sec small" type="button" data-wagrp="">Všechny skupiny</button>' : ''}</div>
    <div class="table-card flat"><table class="stack wa-gtab"><thead><tr><th>Skupina</th><th class="wa-gcol">Ø lidí v práci na den</th><th class="r">Podíl</th><th class="wa-gcol">Zpracované kusy</th><th class="r">Ks / os.</th></tr></thead><tbody>${gx.map(({ g, v }) => `<tr class="wa-row${g.id === gid ? ' on' : ''}" data-wagrp="${esc(g.id)}" tabindex="0">
      <td class="name" data-label="Skupina"><b>${esc(g.name)}</b>${kind(g)}</td>
      <td class="wa-gcol" data-label="Ø lidí v práci na den"><span class="wa-gbar acc"><i data-w="${((v.avg || 0) / maxAvg * 100).toFixed(1)}"></i></span><b class="num">${waN(v.avg, 1)}</b></td>
      <td class="r num" data-label="Podíl">${waP(v.share)}</td>
      <td class="wa-gcol" data-label="Zpracované kusy">${g.noIs && v.pcs == null ? '<span class="muted small">mimo IS, kusy se neevidují</span>' : `<span class="wa-gbar tab"><i data-w="${((v.pcs || 0) / maxPcs * 100).toFixed(1)}"></i></span><b class="num">${waN(v.pcs)}</b>`}</td>
      <td class="r num" data-label="Ks na osobosměnu">${waN(v.per, 1)}</td></tr>`).join('')}</tbody></table></div></div>`;
  let cum = 0;
  const cums = list.map(x => { if (x.t.reqDays) cum = Math.round((cum + (x.t.balance || 0)) * 100) / 100; return x.t.reqDays ? cum : null; });
  const rows = list.map((x, i) => {
    const v = fx(x);
    return `<tr class="wa-row" data-waweek="${esc(x.id)}" tabindex="0">
      <td class="name" data-label="Týden"><b>${esc(x.label)}</b><small> ${esc(waShortRange(x, r))}</small></td>
      <td class="r num" data-label="Pracovní dny">${v.workDays}</td>
      <td class="r num" data-label="Ø lidí v práci na den"><b>${waN(v.avg, 1)}</b></td>
      ${G ? `<td class="r num" data-label="Podíl na lidech">${waP(v.share)}</td>` : `<td class="r num" data-label="Ø požadavek na den">${waN(v.req, 1)}</td>
      <td class="r num" data-label="Splněno dní">${v.reqDays ? `<span class="${v.metDays === v.reqDays ? 'wa-ok' : ''}">${v.metDays} / ${v.reqDays}</span>` : '—'}</td>
      <td class="r num${(v.balance || 0) < 0 ? ' wa-neg' : ''}" data-label="Bilance týdne">${waSigned(v.balance, 1)}</td>
      <td class="r num${(cums[i] || 0) < 0 ? ' wa-neg' : ''}" data-label="Kumulovaně">${waSigned(cums[i], 1)}</td>`}
      <td class="r num" data-label="Kusy"><b>${waN(v.pcs)}</b></td>
      <td class="r num" data-label="Ks na osobosměnu">${waN(v.per, 1)}</td></tr>`;
  }).reverse().join('');
  const table = `<div class="table-card"><table class="stack wa-hist"><thead><tr><th>Týden${G ? ` · ${esc(G.name)}` : ''}</th><th class="r">Prac. dny</th><th class="r">Ø lidí / den</th>${G ? '<th class="r">Podíl</th>' : '<th class="r">Ø požadavek</th><th class="r">Splněno dní</th><th class="r">Bilance</th><th class="r">Kumulovaně</th>'}<th class="r">Kusy</th><th class="r">Ks / os.</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  return `${bar}<p class="wa-range-line small muted">${esc(dayText(r.from))} – ${esc(dayText(r.to))}${r.clipped ? ` (zvoleno ${esc(dayText(r.want.from))} – ${esc(dayText(r.want.to))}, data jsou jen za tyto dny)` : ''}${G ? ` · skupina ${esc(G.name)}` : ''}</p>${warnAll}${tiles}${charts}${staff}${groups}${table}
    <p class="hint">Ø na pracovní den = průměr pracovních dnů s obsazeností; víkendy a svátky se do průměru nepočítají, do součtů ano. Požadavek = ${wa.target ? `pevně ${wa.target} lidí na pracovní den (Nastavení)` : 'mělo dorazit + požadavek ze souboru obsazenosti'}; den se splněným požadavkem má v práci aspoň 100 % požadavku. Bilance v člověkodnech (člověk × den). Kusy jen z operací přiřazených ke skupině, kusy na osobosměnu jen u produktivních skupin. Klepnutím na týden otevřeš jeho dny.</p>`;
}

/* ---------- body ke kontrole (záložka Dny, jen v aplikaci) ---------- */
function waCheckHtml(days) {
  const wa = S.workAudit;
  const is = waIssues(wa, days);
  const t = waTotals(wa, days);
  const n = x => `${x} ${x === 1 ? 'pracovní den' : x <= 4 ? 'pracovní dny' : 'pracovních dní'}`;
  const list = (isos, max = 6) => isos.slice(0, max).map(iso => `<button class="link" type="button" data-waday="${iso}">${esc(ktDay(iso))}</button>`).join(', ') + (isos.length > max ? ` a ${isos.length - max} dalších` : '');
  const skip = [...is.noGroup, ...is.off];
  const items = [];
  if (is.missingAtt.length) items.push(['w', `<b>${n(is.missingAtt.length)} bez obsazenosti:</b> ${list(is.missingAtt)}`]);
  if (is.missingWork.length) items.push(['w', `<b>${n(is.missingWork.length)} bez výkazu práce:</b> ${list(is.missingWork)}`]);
  if (is.mismatch.length) items.push(['w', `<b>Součet skupin nesedí s počtem lidí na směně:</b> ${is.mismatch.slice(0, 6).map(x => `<button class="link" type="button" data-waday="${x.iso}">${esc(ktDay(x.iso))} ${x.shift === 'am' ? 'ranní' : 'odpolední'} ${x.diff > 0 ? '+' : ''}${nf(x.diff, 2)}</button>`).join(', ')}${is.mismatch.length > 6 ? ` a ${is.mismatch.length - 6} dalších` : ''}`]);
  if (skip.length) items.push(['i', `<b>Nepočítá se ${skip.length} ${operaceN(skip.length)} bez skupiny</b> (${waN(skip.reduce((x, o) => x + o.ks, 0))} ks): ${skip.slice(0, 4).map(o => esc(o.name)).join(', ')}${skip.length > 4 ? '…' : ''} <button class="link" type="button" data-watabgo="nastaveni">Nastavení</button>`]);
  if (is.offWorked.length) items.push(['i', `<b>Práce o víkendu nebo ve svátek:</b> ${is.offWorked.slice(0, 6).map(x => `<button class="link" type="button" data-waday="${x.iso}">${esc(ktDay(x.iso))}${x.hol ? ` (${esc(x.hol)})` : ''}</button>`).join(', ')}${is.offWorked.length > 6 ? ` a ${is.offWorked.length - 6} dalších` : ''}`]);
  if (t.edits) items.push(['i', `<b>${t.edits} ${t.edits === 1 ? 'ručně upravená hodnota' : t.edits <= 4 ? 'ručně upravené hodnoty' : 'ručně upravených hodnot'}</b> s důvodem (vidíš je v detailu dne).`]);
  return `<div class="card wa-check"><h3>${items.some(x => x[0] === 'w') ? I.warn : I.check}Ke kontrole</h3>${items.length
    ? `<ul class="wa-issues">${items.map(([k, h]) => `<li class="${k}">${h}</li>`).join('')}</ul>`
    : '<p class="small">Všechny pracovní dny mají obsazenost i výkaz a součty skupin sedí.</p>'}</div>`;
}

/* Sloupcový graf jedné řady; volitelně čárka plánu na stejné ose. Hodnotu má popsanou jen
   poslední sloupec, ostatní ukazuje tooltip a tabulka. */
function waChart({ title, sub, points, value, ref = null, tone, tip, legend = null, cap = null }) {
  const W = 420, H = 200, L = 36, R = 8, T = 18, B = 24;
  const vals = points.map(value);
  const refs = ref ? points.map(ref) : [];
  const present = [...vals, ...refs].filter(v => v != null);
  if (!present.length) return `<figure class="chart ${tone}"><figcaption><b>${esc(title)}</b><span>${esc(sub)}</span></figcaption><div class="chart-empty">V tomto období bez údajů.</div></figure>`;
  const top = niceMax(Math.max(...present) * 1.08);
  const plotH = H - T - B;
  const band = (W - L - R) / points.length;
  const bw = Math.max(2, Math.min(22, band * 0.64));
  const y = v => T + plotH - (Math.min(v, top) / top) * plotH;
  const base = T + plotH;
  const every = Math.ceil(points.length / 10);
  let last = -1;
  vals.forEach((v, i) => { if (v != null) last = i; });
  const marks = points.map((p, i) => {
    const v = vals[i];
    const x = L + i * band + (band - bw) / 2;
    let mark = '';
    if (v != null && v > 0) {
      const yy = y(v);
      const r = Math.min(3, bw / 2, base - yy);
      mark = `<path class="bar" d="M${x.toFixed(1)} ${base}V${(yy + r).toFixed(1)}Q${x.toFixed(1)} ${yy.toFixed(1)} ${(x + r).toFixed(1)} ${yy.toFixed(1)}H${(x + bw - r).toFixed(1)}Q${(x + bw).toFixed(1)} ${yy.toFixed(1)} ${(x + bw).toFixed(1)} ${(yy + r).toFixed(1)}V${base}Z"/>`;
    }
    const rv = refs[i];
    const tick = rv != null && rv > 0 ? `<line class="wa-plan" x1="${(x - 1.5).toFixed(1)}" x2="${(x + bw + 1.5).toFixed(1)}" y1="${y(rv).toFixed(1)}" y2="${y(rv).toFixed(1)}"/>` : '';
    const label = (points.length - 1 - i) % every === 0 ? `<text class="xl" x="${(L + i * band + band / 2).toFixed(1)}" y="${H - 8}">${esc(p.label)}</text>` : '';
    const capT = cap && i === last ? `<text class="cap" x="${(x + bw / 2).toFixed(1)}" y="${(Math.min(y(v), rv != null ? y(rv) : Infinity) - 6).toFixed(1)}">${esc(cap(v))}</text>` : '';
    const hit = `<rect class="hit" x="${(L + i * band).toFixed(1)}" y="${T}" width="${band.toFixed(1)}" height="${plotH}" tabindex="0" data-tip="${esc(tip(p))}"/>`;
    return mark + tick + label + capT + hit;
  }).join('');
  const grid = [0, top / 2, top].map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="yl" x="${L - 6}" y="${(y(v) + 3.5).toFixed(1)}">${esc(nf(v, top < 10 ? 1 : 0))}</text>`).join('');
  const leg = legend ? `<span class="wa-legend"><i class="sw"></i>${esc(legend[0])}<i class="tk"></i>${esc(legend[1])}</span>` : '';
  return `<figure class="chart ${tone}"><figcaption><b>${esc(title)}</b><span>${esc(sub)}</span>${leg}</figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${grid}${marks}</svg></figure>`;
}
/* Čára s body (poměr v čase); mezera v datech čáru přeruší. */
function waLine({ title, sub, points, value, tone, tip, cap = null }) {
  const W = 420, H = 200, L = 36, R = 8, T = 18, B = 24;
  const vals = points.map(value);
  const present = vals.filter(v => v != null);
  if (!present.length) return `<figure class="chart ${tone}"><figcaption><b>${esc(title)}</b><span>${esc(sub)}</span></figcaption><div class="chart-empty">V tomto období bez údajů.</div></figure>`;
  const top = niceMax(Math.max(...present) * 1.12);
  const plotH = H - T - B;
  const band = (W - L - R) / points.length;
  const y = v => T + plotH - (Math.min(v, top) / top) * plotH;
  const cx = i => L + i * band + band / 2;
  const every = Math.ceil(points.length / 10);
  // úseky bez mezery v datech, každý jako hladká křivka (2.59)
  const runs = [];
  let cur = null;
  let last = -1;
  vals.forEach((v, i) => {
    if (v == null) { cur = null; return; }
    if (!cur) { cur = []; runs.push(cur); }
    cur.push([cx(i), y(v)]);
    last = i;
  });
  const base = T + plotH;
  const d = runs.map(smoothPath).join('');
  const area = runs.map(r => smoothArea(r, base)).join('');
  const r = points.length > 30 ? 2.5 : 4;
  const dots = vals.map((v, i) => (v == null ? '' : `<circle class="wa-dot" cx="${cx(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${r}"/>`)).join('');
  const labels = points.map((p, i) => ((points.length - 1 - i) % every === 0 ? `<text class="xl" x="${cx(i).toFixed(1)}" y="${H - 8}">${esc(p.label)}</text>` : '')).join('');
  const hits = points.map((p, i) => chartHover(L + i * band, band, T, base, cx(i), vals[i] == null ? null : y(vals[i]), tip(p))).join('');
  const capT = cap && last >= 0 ? `<text class="cap" x="${cx(last).toFixed(1)}" y="${(y(vals[last]) - 9).toFixed(1)}">${esc(cap(vals[last]))}</text>` : '';
  const grid = [0, top / 2, top].map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="yl" x="${L - 6}" y="${(y(v) + 3.5).toFixed(1)}">${esc(nf(v, top < 10 ? 1 : 0))}</text>`).join('');
  return `<figure class="chart ${tone}"><figcaption><b>${esc(title)}</b><span>${esc(sub)}</span></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${grid}<path class="ch-area" d="${area}"/><path class="wa-line" d="${d}"/>${dots}${labels}${capT}${hits}</svg></figure>`;
}

