/* ==========================================================================
   Telefon: tlačítko Zpět (2.14), hlavní menu a plovoucí menu (2.15)
   ========================================================================== */
const isPhone = () => window.matchMedia('(max-width: 900px)').matches;

/* Podstránka uvnitř části, kterou Zpět zavře: detail člověka a skupiny (na telefonu
   zakrývají seznam) a případ v Top 5. */
function navSub() {
  if (ui.view === 'lide' && ui.personOpen && isPhone()) return 'person';
  if (ui.view === 'matice' && ui.mxTab === 'groups' && ui.posOpen && isPhone()) return 'pos';
  if (ui.view === 'top5' && ui.t5.caseId) return 'case';
  if (ui.view === 'protokoly' && ui.lb.open && isPhone() && lbBook()) return 'book';
  if (ui.view === 'ukoly' && ui.tk.sel) return 'task';
  return '';
}

/* Každá část a podstránka je záznam v historii prohlížeče, takže Zpět (gesto nebo tlačítko
   telefonu) vrací v aplikaci, místo aby ji zavřelo. ui.hist zrcadlí záznamy z téhle stránky. */
function syncHistory(replace = false) {
  if (!S || ui.popping || ui.locking) return;
  const cur = history.state && history.state.odmView ? history.state : null;
  const want = { odmView: ui.view, sub: navSub(), i: cur ? +cur.i || 0 : 0 };
  if (cur && cur.odmView === want.odmView && (cur.sub || '') === want.sub && ui.hist[want.i]) return;
  // podstránka zavřená jinak než přes Zpět (smazaný člověk, otočený telefon): záznam se jen přepíše
  if (!cur || replace || !ui.hist[want.i] || (cur.odmView === want.odmView && cur.sub && !want.sub)) {
    history.replaceState(want, '');
  } else {
    want.i += 1;
    ui.hist.length = want.i;
    history.pushState(want, '');
  }
  ui.hist[want.i] = want;
}

/* Tlačítko „zpět“ v aplikaci jde po historii, jen když předchozí záznam je to, kam vede
   (jinak by Zpět potom vrátil na stejné místo ještě jednou). */
function navBack(isTarget, fallback) {
  const cur = history.state;
  const prev = cur && cur.odmView ? ui.hist[(+cur.i || 0) - 1] : null;
  if (prev && isTarget(prev)) history.back(); else fallback();
}

function closePersonDetail() {
  ui.personOpen = false;
  renderPeople();
  if (isPhone()) window.scrollTo({ top: ui.listY || 0, behavior: 'instant' });
}

function onPopState(event) {
  const st = event.state;
  if (!S || ui.locking || !st || !st.odmView) return;
  // Zpět při otevřeném dialogu nebo plovoucím menu je zavře (jako Esc) a v aplikaci se zůstane.
  const open = $('#dlg').open ? $('#dlg') : null;
  if (open || ui.fabOpen) {
    if (ui.fabOpen) closeFab();
    else if (open.dispatchEvent(new Event('cancel', { cancelable: true }))) open.close();
    const stay = { odmView: ui.view, sub: navSub(), i: (+st.i || 0) + 1 };
    ui.hist.length = stay.i;
    ui.hist[stay.i] = stay;
    history.pushState(stay, '');
    return;
  }
  ui.popping = true;
  try {
    if (st.odmView !== ui.view) showView(st.odmView);
    const sub = navSub();
    if (sub && sub !== (st.sub || '')) {
      if (sub === 'person') closePersonDetail();
      else if (sub === 'pos') { ui.posOpen = false; renderPositions(); }
      else if (sub === 'case') { ui.t5.caseId = null; renderTop5(); }
      else if (sub === 'book') closeLbDetail();
      else if (sub === 'task') { ui.tk.sel = null; renderTasks(); }
    } else if (!sub && st.sub === 'person' && ui.view === 'lide' && isPhone() && S.employees[ui.selPerson]) {
      ui.personOpen = true;
      renderPeople();
    }
  } finally {
    ui.popping = false;
  }
  syncHistory(true);   // stav po návratu se může od záznamu lišit (smazaný člověk), záznam se srovná
}

/* Na telefonu jsou záložky v jednom řádku s vodorovným posunem: vybraná má být vidět
   (jen vodorovně, stránka se neposune). */
function showActiveChip(box) {
  const chip = box && $('.chip.on', box);
  if (!chip || box.scrollWidth <= box.clientWidth) return;
  const r = chip.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (r.left < b.left || r.right > b.right) box.scrollLeft += r.left - b.left - (b.width - r.width) / 2;
}

function bindPhoneUi() {
  history.scrollRestoration = 'manual';
  window.addEventListener('popstate', onPopState);
  $('#brandHome').onclick = () => showView(isPhone() ? 'domu' : 'prehled');
  $('#fab').onclick = () => (ui.fabOpen ? closeFab() : openFab());
  $('#fabScrim').onclick = closeFab;
  $('#fabMenu').addEventListener('click', event => {
    if (event.target.closest('[data-fabmore]')) { fabMore(!document.body.classList.contains('fab-more-on')); return; }
    const item = event.target.closest('[data-fab]');
    if (!item) return;
    closeFab();
    if (item.dataset.fab === 'search') openPersonSearch(); else showView(item.dataset.fab);
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && ui.fabOpen) { closeFab(); $('#fab').focus(); } });
  $('#homeView').addEventListener('click', homeClick);
  $('#homeView').addEventListener('toggle', event => { if (event.target.matches && event.target.matches('.hh-nowbox')) ui.homeNowOpen = event.target.open; }, true);
  // Úvodní text pod nadpisem je na telefonu na dva řádky, klepnutím se rozbalí celý.
  $('#main').addEventListener('click', event => {
    const lede = event.target.closest('.page-head .lede');
    if (!lede || !isPhone() || event.target.closest('a, button')) return;
    if (lede.classList.contains('open') || lede.scrollHeight > lede.clientHeight + 1) lede.classList.toggle('open');
  });
  $('#ovFilterBtn').onclick = () => {
    const open = $('#ovTools').classList.toggle('open');
    $('#ovFilterBtn').setAttribute('aria-expanded', String(open));
  };
}

/* ---------- Hlavní menu na telefonu (2.15) ----------
   Po přihlášení krátká animace HALA 2, pak plánovaná obsazenost dne (kdo má ranní a odpolední
   podle zařazení a střídání skupin, kapacita, nemoc, dovednosti bez zástupu, kontroly a termíny).
   Volba směny (Ranní / Odpolední / Obě) zvýrazní její čísla, ukáže rizika a rozevře menu částí. */
const SLOT_NAME = { am: 'Ranní', pm: 'Odpolední', both: 'Obě směny' };
const DOW_NAME = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
const MONTH_GEN = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function dayLong(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${DOW_NAME[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}. ${MONTH_GEN[m - 1]}`;
}
function greeting(h) { return h < 10 ? 'Dobré ráno' : h < 18 ? 'Dobrý den' : 'Dobrý večer'; }
/* Která směna právě běží (ranní 6–14, odpolední 14–22); jen nápověda u přepínače. */
function liveSlot(h) { return h >= 6 && h < 14 ? 'am' : h >= 14 && h < 22 ? 'pm' : ''; }
function planText(pl) { return [pl.ks ? `${nf(pl.ks, 0)} ks` : '', pl.h ? `${nf(pl.h, 1)} h` : ''].filter(Boolean).join(' · '); }
function navIcon(view) { const b = $(`#nav [data-view="${view}"]`); return b ? $('svg', b).outerHTML : ''; }
function navBadge(view) { const b = $(`#nav [data-view="${view}"] .nav-badge`); return b && !b.hidden ? b.textContent : ''; }
const HOME_TILES = [['prehled', 'Přehled'], ['lide', 'Lidé'], ['sankce', 'Sankce'], ['kontroly', 'Kontroly'], ['rychla', 'Rychlá kontrola'], ['ukoly', 'Úkoly'], ['protokoly', 'Protokoly'], ['servis', 'Servis'], ['shortage', 'Shortage'], ['top5', 'Top 5'], ['matice', 'Matice'], ['plankap', 'Plán kapacit'], ['dochazka', 'Docházka'], ['konce', 'Konce trestů'], ['audit', 'KPI'], ['nastaveni', 'Nastavení']];

function homeTileMeta(view, sd) {
  const p = curPeriod();
  switch (view) {
    case 'prehled': return p ? periodName(p) : 'bez docházky';
    case 'lide': { const n = Object.values(S.employees).filter(e => !e.excluded && !isLead(e)).length; return `${n} ${lidiN(n)}`; }
    case 'sankce': { const n = S.current ? S.sanctions.filter(x => x.period === S.current).length : 0; return n ? `${n} za ${p ? periodName(p) : 'měsíc'}` : 'zadat sankci'; }
    case 'kontroly': return sd.today && sd.checks.list.length ? `dnes ${sd.checks.open + sd.checks.done} · hotovo ${sd.checks.done}` : 'plán týdne';
    case 'rychla': { const t = ((audPlan(isoWeek(todayIso()).id) || {}).items || []).filter(i => i.day === todayIso() && i.state !== 'skip'); return t.length ? `dnes ${t.filter(i => i.state === 'done').length} / ${t.length} zapsáno` : 'vylosovat jména'; }
    case 'top5': return sd.deadlines.late ? `${sd.deadlines.late} po termínu` : sd.deadlines.due ? `${sd.deadlines.due} termín dnes` : 'případy a termíny';
    case 'matice': { const n = departments().length; return `${n} ${n === 1 ? 'oddělení' : 'oddělení'}`; }
    case 'plankap': { const a = capPlanAll(); return !a.setN ? 'potřeba lidí' : a.tot.hire ? `doplnit ${a.tot.hire}` : a.tot.trainN ? `doškolit ${a.tot.trainN}` : 'v pořádku'; }
    case 'dochazka': return p ? 'nahráno' : 'nahrát export';
    case 'konce': { const o = endsOverview(todayIso(), 3); return o.thisMonth ? `tento měsíc ${o.thisMonth}` : o.next3 ? `do 3 měsíců ${o.next3}` : 'odchody po měsících'; }
    case 'vyroba': return prodPeriod() ? 'evidence práce' : 'nahrát evidenci';
    case 'protokoly': {
      const books = S.logbooks || [];
      if (!books.length) return 'provozní deníky';
      const day = sd.day, n = books.reduce((x, b) => { const d = lbPlan(b, day, day)[0]; return x + (d ? lbRowSteps(d, 0).length : 0); }, 0);
      return n ? `${sd.today ? 'dnes' : 'v den plánu'} ${n} ${n === 1 ? 'úkon' : n <= 4 ? 'úkony' : 'úkonů'}` : `${books.length} ${books.length === 1 ? 'stroj' : books.length <= 4 ? 'stroje' : 'strojů'}`;
    }
    case 'audit': { const sp = waSpan(S.workAudit); return sp ? `data do ${dayText(sp.to, false)}` : 'lidé v práci a kusy'; }
    case 'servis': { const c = svc(), n = c.devices.filter(d => svHistory(c, d.id).out).length; return n ? `na servisu ${n}` : c.shipments.length ? 'vše je zpátky' : 'předávací protokoly'; }
    case 'ukoly': { const o = tkOverview(S, todayIso()); return o.late.length ? `${o.late.length} po termínu` : o.soon.length ? `${o.soon.length} blíží se termín` : o.open ? `otevřené ${o.open}` : 'zadat úkol'; }
    case 'shortage': { const l = shc().lists[0]; return l ? `${l.items.length} ${shItemsN(l.items.length)} · ${dayText(todayIso(l.at), false)}` : 'nahrát seznam'; }
    default: return 'pravidla a zálohy';
  }
}

function homeRisks(sd, sel) {
  const slots = sel === 'both' ? ['am', 'pm'] : [sel];
  const list = sd.depts.flatMap(r => r.risks.filter(x => slots.includes(x.slot)).map(x => ({ ...x, dept: r.dept })))
    .sort((a, b) => a.n - b.n);
  if (!list.length) return `<div class="home-ok">${I.check}<span>Na ${sel === 'both' ? 'obou směnách' : sel === 'am' ? 'ranní' : 'odpolední'} má každá dovednost aspoň dva lidi s úrovní ${sd.thr}+.</span></div>`;
  const shown = list.slice(0, 5);
  return `<section class="home-risks card"><h2>${I.warn}Na co si dát pozor</h2><ul>${shown.map(x => `<li class="${x.n ? 'thin' : 'none'}"><b>${esc(x.skill)}</b><span>${esc(x.group || x.dept)}${sel === 'both' ? ` · ${x.slot === 'am' ? 'ranní' : 'odpolední'}` : ''}</span><em>${x.n ? 'jen 1 člověk' : 'nikdo'} s úrovní ${sd.thr}+</em></li>`).join('')}</ul>${list.length > shown.length ? `<p class="tiny muted">a ${list.length - shown.length} dalších v Matici dovedností → Směny a kapacita</p>` : ''}</section>`;
}

function renderHome(unfold = false) {
  const box = $('#homeView');
  if (!box || !S) return;
  const today = todayIso();
  let sd = staffDay();
  // dnešní příchody i o víkendu a svátku (2.40.1): pak úvod ukáže dnešek, ne plán dalšího pracovního dne
  const off = !sd.today && !!dvLastPres(today) && dvLastPres(today) === today;
  if (off) sd = staffDay(today, true);
  const offT = off && mkDay(...today.split('-').map(Number)).hol ? 'svátek' : 'víkend';
  const sel = ui.homeShift || '';
  const h = new Date().getHours();
  const live = sd.today && !off ? liveSlot(h) : '';
  // skutečnost podle dnes nahraných příchodů (2.39.3), jinak plán ze zařazení
  const real = sd.today ? staffReal(sd.day, sd.mg) : null;
  const last = real ? '' : dvLastPres(today);
  const lastN = last ? staffReal(last, staffDay(last, true).mg) : null;
  const rows = homeRows(sd, real);
  const max = Math.max(1, ...rows.map(r => Math.max(r.v.am, r.v.pm)));
  const wage = wageAllPending().length;
  const flags = [
    !real && audDepts().length ? '<button type="button" class="hf warn" data-hgo="pres">Nahrát dnešní příchody</button>' : '',
    lastN ? `<button type="button" class="hf" data-hgo="lastpres" data-iso="${last}">Poslední příchody: ${esc(DOW[mkDay(...last.split('-').map(Number)).dow])} ${esc(dayText(last, false))} · ${lastN.n} ${lidiN(lastN.n)}</button>` : '',
    real && real.unknown ? `<button type="button" class="hf warn" data-go="audit">${real.unknown} ID není v Lidech</button>` : '',
    sd.total.sick ? `<button type="button" class="hf" data-go="lide">${sd.total.sick} v nemoci</button>` : '',
    sd.total.none ? `<button type="button" class="hf warn" data-go="lide">${sd.total.none} bez směny</button>` : '',
    sd.total.rot ? `<button type="button" class="hf warn" data-hgo="cap">Směnnost: nastav střídání skupin</button>` : '',
    sd.checks.list.length ? `<button type="button" class="hf" data-go="kontroly">Kontroly ${sd.checks.open + sd.checks.done}${sd.checks.done ? ` · ${sd.checks.done} hotovo` : ''}</button>` : '',
    sd.deadlines.late ? `<button type="button" class="hf crit" data-go="top5">Top 5: ${sd.deadlines.late} po termínu</button>` : sd.deadlines.due ? `<button type="button" class="hf" data-go="top5">Top 5: ${sd.deadlines.due} termín</button>` : '',
    wage ? `<button type="button" class="hf crit" data-hgo="wage">Srážky ke zpracování: ${wage}</button>` : '',
  ].filter(Boolean).join('');
  const big = k => {
    const v = real ? real[k] : sd.total[k];
    const p = sd.total[k];
    // odpolední se před 14:00 nehodnotí (ještě nezačala)
    const wait = real && !off && k === 'pm' && h < 14 && !v;
    const diff = real && !wait && !off ? v - p : 0;
    const sub = off ? `${lidiN(v)} · mimo plán` : wait ? `plán ${p} · směna ještě nezačala` : real ? `${lidiN(v)} · plán ${p}${diff ? ` <em class="${diff < 0 ? 'neg' : 'pos'}">${diff > 0 ? '+' : '−'}${Math.abs(diff)}</em>` : ''}`
      : `${lidiN(v)}${planText(sumPlan(sd, k)) ? ` · ${planText(sumPlan(sd, k))}` : ''}`;
    return `<div class="hb ${k}${live === k ? ' live' : ''}"><span class="hb-k">${k === 'am' ? I.sun : I.moon}${k === 'am' ? 'Ranní' : 'Odpolední'}${live === k ? '<i>teď</i>' : ''}</span>
      <b class="num" data-count="${v}">${v}</b><small>${sub}</small></div>`;
  };
  box.innerHTML = `<div class="home" data-sel="${sel}">
    <section class="home-hero">
      <div class="hh-top"><span class="hh-brand">HALA <i>2</i></span><span class="hh-week">${esc(weekName(sd.week))}</span></div>
      <h1 id="homeTitle">${greeting(h)}</h1>
      <p class="hh-sub">${off ? `Dnes je ${esc(dayLong(sd.day))} · ${offT}, směna mimo plán` : sd.today ? `Dnes je ${esc(dayLong(sd.day))}` : `Dnes se nepracuje · plán na ${esc(dayLong(sd.day))}`}</p>
      <p class="hh-cap">${real ? `V práci podle příchodů${real.at ? ` · nahráno ${new Date(real.at).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}` : ''}` : 'Plánovaná obsazenost'}</p>
      <div class="hh-big${real ? ' real' : ''}">${big('am')}${big('pm')}</div>
      ${real ? `<details class="hh-nowbox"${ui.homeNowOpen ? ' open' : ''}><summary class="hh-now"><span class="hh-dot" aria-hidden="true"></span><span>Teď v práci <b class="num">${real.now}</b> z ${real.n} ${real.n === 1 ? 'příchodu' : 'příchodů'}${real.lead ? ` · vedoucí ${real.lead}` : ''}</span><span class="hh-more">po odděleních${I.back}</span></summary>
        <div class="hn-panel" id="homeNow">${homeNowHtml(sd, sel)}</div></details>` : ''}
      ${flags ? `<div class="hh-flags">${flags}</div>` : ''}
    </section>
    <div class="seg" role="radiogroup" aria-label="Směna, kterou dnes řídíš" data-on="${sel}">
      <span class="seg-pill" aria-hidden="true"></span>
      ${['am', 'pm', 'both'].map(k => `<button type="button" role="radio" aria-checked="${sel === k}" data-hshift="${k}"${live === k && !sel ? ' class="hint"' : ''}>${SLOT_NAME[k]}</button>`).join('')}
    </div>
    ${sel ? '' : '<p class="home-hint">Vyber směnu, kterou dnes řídíš. Části aplikace najdeš v menu vpravo dole.</p>'}
    <div class="home-open${unfold ? ' unfold' : ''}"${sel ? '' : ' hidden'}>${sel ? homeOpenHtml(sd, sel) : ''}</div>
    <section class="home-staff card">
      <div class="hs-head"><h2>${real ? 'V práci podle oddělení' : 'Obsazenost podle oddělení'}</h2><span class="tiny muted">${sd.mg ? `ranní má ${sd.mg === 'S1' ? 'skupina 1' : 'skupina 2'}` : 'střídání skupin nenastavené'}</span></div>
      ${rows.length ? `<div class="hs-table">
        <div class="hs-row hs-th"><span></span><span class="am">${I.sun}Ranní</span><span class="pm">${I.moon}Odpolední</span></div>
        ${rows.map(r => `<div class="hs-row">
          <div class="hs-dept"><b>${esc(r.dept)}</b>${r.notes.map(t => `<small>${esc(t)}</small>`).join('')}</div>
          ${['am', 'pm'].map(k => `<div class="hs-cell ${k}${r.risk[k] ? ' risk' : ''}${real && !off && r.v[k] < r.p[k] && !(k === 'pm' && h < 14 && !real.pm) ? ' short' : ''}"><b class="num">${r.v[k]}</b><span class="hs-bar"><i data-w="${(r.v[k] / max * 100).toFixed(1)}"></i></span><small>${esc(real ? (off ? '' : r.p[k] || r.v[k] ? `plán ${r.p[k]}` : '') : planText(r.plan[k]))}</small></div>`).join('')}
        </div>`).join('')}</div>` : '<p class="small muted">Zatím nikdo nemá skupinu a směnu. Nastavíš je v Lidech.</p>'}
    </section>
    <button class="btn ghost home-lock" type="button" id="homeLock">${I.lock}Zamknout</button>
  </div>`;
  setWidths(box);
  $('#homeLock').onclick = () => lockApp();
}
/* Rozbalovací rozpad „Teď v práci“ (2.43): oddělení s pruhem přišlo / plán, kdo nedorazil
   a kdo přišel mimo plán. Směna podle volby na úvodu (bez volby obě). */
function homeNowHtml(sd, sel) {
  const x = staffNow(sd, sel === 'am' || sel === 'pm' ? sel : '');
  if (!x) return '';
  const t = x.total;
  const clock = m => (m == null ? '' : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`);
  const chip = (p, cls) => `<span class="hn-chip ${cls}"><b>${esc(p.name || `ID ${p.wid}`)}</b>${p.name && p.wid ? `<small>ID ${esc(p.wid)}</small>` : ''}${p.in != null ? `<small>${clock(p.in)}</small>` : ''}</span>`;
  const slotT = x.slots.length === 2 ? 'obě směny' : x.slots[0] === 'am' ? 'ranní' : 'odpolední';
  return `<div class="hn-sum"><span><b class="num">${t.came}</b> přišlo z plánu <b class="num">${t.plan}</b> · ${slotT}</span>${t.missing ? `<span class="hn-bad">${t.missing} nedorazilo</span>` : '<span class="hn-good">všichni z plánu jsou tu</span>'}${t.wait ? `<span class="muted">${t.wait} odpolední čeká</span>` : ''}</div>
    ${x.depts.map(g => {
      const pct = g.plan ? Math.min(100, g.came / g.plan * 100) : 100;
      const st = !g.plan ? 'extra' : g.missing.length ? 'short' : 'ok';
      return `<div class="hn-dept ${st}">
        <div class="hn-head"><b>${esc(g.dept)}</b><span class="num">${g.came}<small> / ${g.plan}</small></span>${g.plan && g.diff ? `<em class="${g.diff < 0 ? 'neg' : 'pos'}">${g.diff > 0 ? '+' : '−'}${Math.abs(g.diff)}</em>` : ''}</div>
        <div class="hn-bar" role="img" aria-label="${esc(`${g.dept}: přišlo ${g.came} z plánu ${g.plan}`)}"><i data-w="${pct.toFixed(1)}"></i></div>
        <p class="hn-meta">${[`teď ${g.now}`, g.sick ? `${g.sick} v nemoci` : '', g.wait.length ? `${g.wait.length} odpolední čeká` : ''].filter(Boolean).join(' · ')}</p>
        ${g.missing.length ? `<div class="hn-who"><span class="hn-lab">Nedorazili</span>${g.missing.map(p => chip(p, 'miss')).join('')}</div>` : ''}
        ${g.extra.length ? `<div class="hn-who"><span class="hn-lab">Mimo plán</span>${g.extra.map(p => chip(p, 'extra')).join('')}</div>` : ''}
      </div>`;
    }).join('')}`;
}
/* Řádky oddělení na úvodu: plán ze zařazení, se skutečností podle příchodů navíc oddělení,
   která v plánu nejsou (Bez skupiny, Neznámé ID). */
function homeRows(sd, real) {
  const rows = sd.depts.map(r => {
    const x = real && real.depts.get(r.dept);
    return { dept: r.dept, plan: r.plan, p: { am: r.am.length, pm: r.pm.length }, v: real ? { am: x ? x.am : 0, pm: x ? x.pm : 0 } : { am: r.am.length, pm: r.pm.length },
      risk: real ? {} : { am: r.risks.some(q => q.slot === 'am' && !q.n), pm: r.risks.some(q => q.slot === 'pm' && !q.n) },
      notes: [real && x && x.now !== x.am + x.pm ? `teď ${x.now}` : '', r.sick.length ? `${r.sick.length} v nemoci` : '', r.rot.length ? `${r.rot.length} směnnost` : '', r.none.length ? `${r.none.length} bez směny` : ''].filter(Boolean) };
  });
  if (real) real.depts.forEach((x, dept) => {
    if (!sd.depts.some(r => r.dept === dept)) rows.push({ dept, plan: null, p: { am: 0, pm: 0 }, v: { am: x.am, pm: x.pm }, risk: {}, notes: x.now !== x.am + x.pm ? [`teď ${x.now}`] : [] });
  });
  return rows;
}
/* 2.53: dlaždice částí jsou jen v plovoucím menu (Ostatní); pod volbou směny zůstala rizika směny. */
function homeOpenHtml(sd, sel) {
  return homeRisks(sd, sel);
}
function sumPlan(sd, k) {
  return sd.depts.reduce((x, r) => ({ ks: x.ks + r.plan[k].ks, h: x.h + r.plan[k].h }), { ks: 0, h: 0 });
}

function homeClick(event) {
  const shift = event.target.closest('[data-hshift]');
  if (shift) { chooseShift(shift.dataset.hshift); return; }
  const go = event.target.closest('[data-hgo]');
  if (go && go.dataset.hgo === 'cap') { ui.mxTab = 'cap'; showView('matice'); return; }
  if (go && go.dataset.hgo === 'wage') openWageList();
  if (go && go.dataset.hgo === 'pres') $('#ktPresFile').click();
  if (go && go.dataset.hgo === 'lastpres') { Object.assign(ui.wa, { tab: 'lide', dvMode: 'day', dvDay: go.dataset.iso }); showView('audit'); }
}

/* Volba směny mění jen dotčené části (přepínač tak plynule přejede); poprvé se menu rozevře. */
function chooseShift(k) {
  const first = !ui.homeShift;
  ui.homeShift = k;
  const home = $('#homeView .home');
  if (!home) { renderHome(); return; }
  home.dataset.sel = k;
  const seg = $('.seg', home);
  seg.dataset.on = k;
  $$('[data-hshift]', seg).forEach(b => { b.setAttribute('aria-checked', String(b.dataset.hshift === k)); b.classList.remove('hint'); });
  const hint = $('.home-hint', home);
  if (hint) hint.remove();
  const open = $('.home-open', home);
  open.innerHTML = homeOpenHtml(staffDay(), k);
  const now = $('#homeNow', home);   // rozpad Teď v práci podle zvolené směny (2.43)
  if (now) {
    let sd = staffDay();
    const today = todayIso();
    if (!sd.today && dvLastPres(today) === today) sd = staffDay(today, true);
    now.innerHTML = homeNowHtml(sd, k);
    setWidths(now);
  }
  open.hidden = false;
  if (first && !reducedMotion()) {
    open.classList.add('unfold');
  } else {
    open.classList.remove('unfold');
  }
}

/* Čísla obsazenosti „naběhnou“ od nuly. */
function countUp(root) {
  if (reducedMotion()) return;
  $$('[data-count]', root).forEach(el => {
    const to = +el.dataset.count || 0;
    if (!to) return;
    const t0 = performance.now(), dur = 900;
    const step = now => {
      const t = Math.min(1, (now - t0) / dur);
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(step);
    };
    el.textContent = '0';
    requestAnimationFrame(step);
  });
}

/* Úvodní animace HALA 2 po přihlášení na telefonu; klepnutím se přeskočí. */
function playSplash() {
  const sp = $('#splash');
  const intro = () => {
    const box = $('#homeView');
    box.classList.add('intro');
    countUp(box);
    setTimeout(() => box.classList.remove('intro'), 1600);
  };
  if (!sp || reducedMotion()) { intro(); return; }
  $('#splashSub').textContent = ui.me.label ? `${greeting(new Date().getHours())}, ${ui.me.label}` : greeting(new Date().getHours());
  sp.hidden = false;
  document.body.classList.add('splashing');
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(ui.splashTimer);
    sp.classList.add('out');
    intro();
    setTimeout(() => { sp.hidden = true; sp.classList.remove('out'); document.body.classList.remove('splashing'); }, 560);
  };
  ui.splashTimer = setTimeout(finish, 2000);
  sp.addEventListener('click', finish, { once: true });
}

/* ---------- plovoucí menu vpravo dole (2.15) ---------- */
const FAB_ITEMS = [['search', 'Vyhledat člověka'], ['rychla', 'Rychlá kontrola'], ['ukoly', 'Úkoly'], ['sankce', 'Sankce'], ['top5', 'Top 5'], ['kontroly', 'Kontroly']];
/* 2.53: Hlavní stránka nahoře, rychlé volby, dole Ostatní: rozbalí v menu posuvný seznam ostatních
   částí (bez přechodu na jinou stránku, dokud se nevybere). */
function fabOthers() { const q = new Set(FAB_ITEMS.map(x => x[0])); return HOME_TILES.filter(([v]) => !q.has(v)); }
function fabMoreHtml() {
  const sd = staffDay();
  return fabOthers().map(([v, label]) => {
    const badge = navBadge(v);
    let meta = '';
    try { meta = homeTileMeta(v, sd); } catch (e) { meta = ''; }
    return `<button type="button" role="menuitem" class="fab-mi" data-fab="${v}"><span class="fab-mii">${navIcon(v)}</span><span class="fab-mil"><b>${label}</b>${meta ? `<small>${esc(meta)}</small>` : ''}</span>${badge ? `<em class="nav-badge">${esc(badge)}</em>` : ''}</button>`;
  }).join('');
}
function openFab() {
  const otherBadge = fabOthers().some(([v]) => navBadge(v));
  $('#fabMenu').innerHTML = `<button type="button" role="menuitem" class="fab-item fab-home" data-fab="domu"><span class="fab-l">Hlavní stránka</span><span class="fab-i">${I.home}</span></button>
    <div class="fab-quick">${FAB_ITEMS.map(([k, label]) => {
    const badge = k === 'search' ? '' : navBadge(k);
    return `<button type="button" role="menuitem" class="fab-item" data-fab="${k}"><span class="fab-l">${label}</span><span class="fab-i">${k === 'search' ? I.search : navIcon(k)}${badge ? `<em class="nav-badge">${esc(badge)}</em>` : ''}</span></button>`;
  }).join('')}</div>
    <div class="fab-more" id="fabMore" role="group" aria-label="Ostatní části" hidden><div class="fab-more-list">${fabMoreHtml()}</div></div>
    <button type="button" class="fab-item fab-other" data-fabmore aria-expanded="false"><span class="fab-l">Ostatní</span><span class="fab-i">${I.grid}${otherBadge ? '<em class="nav-dot"></em>' : ''}</span></button>`;
  document.body.classList.remove('fab-more-on');
  ui.fabOpen = true;
  $('#fabMenu').hidden = false;
  $('#fabScrim').hidden = false;
  $('#fab').setAttribute('aria-expanded', 'true');
  $('#fab').setAttribute('aria-label', 'Zavřít rychlé volby');
  requestAnimationFrame(() => requestAnimationFrame(() => { if (ui.fabOpen) document.body.classList.add('fab-open'); }));
}
function fabMore(on) {
  const box = $('#fabMore'), btn = $('[data-fabmore]');
  if (!box) return;
  box.hidden = false;
  if (btn) { btn.setAttribute('aria-expanded', String(on)); $('.fab-l', btn).textContent = on ? 'Zpět na rychlé volby' : 'Ostatní'; }
  requestAnimationFrame(() => document.body.classList.toggle('fab-more-on', on));
  if (on) { const l = $('.fab-more-list', box); if (l) l.scrollTop = 0; }
  else setTimeout(() => { if (!document.body.classList.contains('fab-more-on') && $('#fabMore')) $('#fabMore').hidden = true; }, 220);
}
function closeFab() {
  if (!ui.fabOpen) return;
  ui.fabOpen = false;
  document.body.classList.remove('fab-open', 'fab-more-on');
  $('#fab').setAttribute('aria-expanded', 'false');
  $('#fab').setAttribute('aria-label', 'Rychlé volby');
  setTimeout(() => { if (!ui.fabOpen) { $('#fabMenu').hidden = true; $('#fabScrim').hidden = true; } }, 240);
}
/* Tečka na plovoucím tlačítku: Top 5, Kontroly nebo Úkoly mají odznak. */
function renderFabDot() {
  const dot = $('#fabDot');
  if (dot) dot.hidden = !HOME_TILES.some(([v]) => navBadge(v));
}

/* ---------- vyhledání člověka (jméno, ID v evidenci práce, kartička) ---------- */
function initials(e) { return `${(e.last || '?')[0]}${(e.first || '')[0] || ''}`.toUpperCase(); }
/* Hledání lidí podle jména nebo ID (2.56): sdílí ho vyhledání na telefonu a kolonka v menu na PC.
   Pořadí: přesná shoda ID, jméno nebo příjmení začíná dotazem, pak zbytek; vyřazení na konci. */
function personFind(raw, list = Object.values(S.employees)) {
  const byName = (a, b) => norm(`${a.last} ${a.first}`).localeCompare(norm(`${b.last} ${b.first}`), 'cs');
  const q = norm(String(raw || '').trim());
  if (!q) return list.slice().sort((a, b) => (a.excluded - b.excluded) || byName(a, b));
  const digits = String(raw).replace(/\D/g, '').replace(/^0+/, '');
  const wid = e => String(e.wid || '').replace(/^0+/, '');
  const score = e => {
    if (digits && wid(e) === digits) return 0;
    const a = norm(`${e.last} ${e.first}`), b = norm(`${e.first} ${e.last}`);
    if (a.startsWith(q) || b.startsWith(q)) return 1;
    if (a.includes(q) || b.includes(q)) return 2;
    if (e.wid && (norm(e.wid).includes(q) || (digits.length >= 2 && wid(e).includes(digits)))) return 3;
    return -1;
  };
  return list.map(e => ({ e, s: score(e) })).filter(x => x.s >= 0)
    .sort((a, b) => (a.e.excluded - b.e.excluded) || (a.s - b.s) || byName(a.e, b.e))
    .map(x => x.e);
}
function openPersonKey(key) {
  if (!S.employees[key]) return;
  ui.selPerson = key;
  ui.personOpen = true;
  ui.listY = 0;
  showView('lide');
  renderPeople();
}
/* kolonka „Hledat člověka“ v menu na PC (pod Hodnoceným obdobím) */
function sideSearchDraw() {
  const input = $('#sideQ'), box = $('#sideQList');
  if (!input || !box) return;
  const q = input.value.trim();
  if (!q || !S) { box.hidden = true; box.innerHTML = ''; input.setAttribute('aria-expanded', 'false'); return; }
  const all = personFind(q);
  const list = all.slice(0, 8);
  ui.sideQi = Math.min(ui.sideQi || 0, Math.max(0, list.length - 1));
  box.innerHTML = list.length ? list.map((e, n) => {
    const lead = isLead(e), pos = posOf(e);
    const sub = [lead ? 'vedoucí' : pos ? pos.name : 'bez skupiny', e.wid ? `ID ${e.wid}` : '', e.excluded ? 'vyřazen' : '', e.sick ? 'nemoc' : ''].filter(Boolean).join(' · ');
    return `<button type="button" class="side-qrow${n === ui.sideQi ? ' on' : ''}${e.excluded ? ' out' : ''}" role="option" aria-selected="${n === ui.sideQi}" data-sideq="${esc(e.key)}"><span class="ps-av">${esc(initials(e))}</span><span class="nm"><b>${esc(`${e.last} ${e.first}`)}</b><span>${esc(sub)}</span></span></button>`;
  }).join('') + (all.length > list.length ? `<p class="side-qmore">a ${all.length - list.length} dalších, upřesni hledání</p>` : '')
    : '<p class="side-qmore">Nikdo takový. Zkus jinou část jména nebo ID.</p>';
  box.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}
function sideSearchGo(key) {
  const input = $('#sideQ');
  if (input) { input.value = ''; input.blur(); }
  ui.sideQi = 0;
  sideSearchDraw();
  openPersonKey(key);
}
function bindSideSearch() {
  const input = $('#sideQ'), box = $('#sideQList');
  if (!input || !box) return;
  input.addEventListener('input', () => { ui.sideQi = 0; sideSearchDraw(); });
  input.addEventListener('focus', sideSearchDraw);
  input.addEventListener('keydown', event => {
    const rows = [...box.querySelectorAll('.side-qrow')];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!rows.length) return;
      event.preventDefault();
      ui.sideQi = ((ui.sideQi || 0) + (event.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
      sideSearchDraw();
    } else if (event.key === 'Enter') {
      const r = rows[ui.sideQi || 0];
      if (r) { event.preventDefault(); sideSearchGo(r.dataset.sideq); }
    } else if (event.key === 'Escape') {
      input.value = ''; sideSearchDraw(); input.blur();
    }
  });
  // výběr už na mousedown, než pole ztratí fokus a seznam zmizí
  box.addEventListener('mousedown', event => {
    const r = event.target.closest('[data-sideq]');
    if (!r) return;
    event.preventDefault();
    sideSearchGo(r.dataset.sideq);
  });
  input.addEventListener('blur', () => setTimeout(() => {
    if (document.activeElement !== input) { box.hidden = true; input.setAttribute('aria-expanded', 'false'); }
  }, 150));
  // „/“ mimo pole skočí do hledání (jen když je kolonka vidět, tedy na PC)
  document.addEventListener('keydown', event => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const t = event.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (document.querySelector('dialog[open]') || !input.offsetParent) return;
    event.preventDefault();
    input.focus();
  });
}

async function openPersonSearch() {
  const mg = staffDay().mg;
  let filter = ui.homeShift === 'am' || ui.homeShift === 'pm' ? ui.homeShift : '';
  let pick = null;
  const slotLabel = e => { const sl = slotOn(e, mg); return sl === 'am' ? 'ranní' : sl === 'pm' ? 'odpolední' : sl === 'rot' ? shiftName(shiftOf(e)).replace('Směnnost – s', 'S') : 'bez směny'; };
  const row = e => {
    const lead = isLead(e), pos = posOf(e), noSan = e.excluded || lead;
    const sub = [lead ? 'vedoucí' : pos ? pos.name : 'bez skupiny', lead ? '' : slotLabel(e), e.wid ? `ID ${e.wid}` : ''].filter(Boolean).join(' · ');
    const name = `${e.last} ${e.first}`;
    return `<div class="ps-row${e.excluded ? ' out' : ''}">
      <button type="button" class="ps-main" data-psgo="detail" data-pskey="${esc(e.key)}"><span class="ps-av">${esc(initials(e))}</span><span class="nm"><b>${esc(name)}</b><span>${esc(sub)}</span></span>${e.sick ? '<span class="tag warn">nemoc</span>' : ''}${e.excluded ? '<span class="tag">vyřazen</span>' : ''}</button>
      <button type="button" class="icon-btn" data-psgo="sankce" data-pskey="${esc(e.key)}" title="Zadat sankci" aria-label="Sankce: ${esc(name)}"${noSan ? ' disabled' : ''}>${I.warn}</button>
      <button type="button" class="icon-btn" data-psgo="profil" data-pskey="${esc(e.key)}" title="Profil a historie" aria-label="Profil: ${esc(name)}">${I.chart}</button>
    </div>`;
  };
  const result = await dialog({
    title: 'Vyhledat člověka', ok: '', cancel: 'Zavřít', tall: true,
    html: `<div class="ps">
      <div class="ps-bar"><input type="search" id="psQ" placeholder="Jméno nebo ID v evidenci práce" aria-label="Jméno nebo ID v evidenci práce" autocomplete="off" spellcheck="false" maxlength="80" autofocus>
        <button type="button" class="scan-btn" id="psScan" title="Naskenovat kartičku" aria-label="Naskenovat kartičku">${I.scan}</button></div>
      <div class="chips ps-f" id="psF">${[['', 'Všichni'], ['am', 'Ranní'], ['pm', 'Odpolední']].map(([k, t]) => `<button type="button" class="chip${filter === k ? ' on' : ''}" data-psf="${k}" aria-pressed="${filter === k}">${t}</button>`).join('')}</div>
      <p class="tiny muted" id="psCount"></p>
      <div class="ps-list" id="psList"></div></div>`,
    onOpen: dlg => {
      const input = $('#psQ', dlg);
      const draw = () => {
        const q = norm(input.value.trim());
        let list = personFind(input.value);
        if (filter) list = list.filter(e => !isLead(e) && slotOn(e, mg) === filter);
        $('#psCount', dlg).textContent = list.length ? `${list.length} ${lidiN(list.length)}${filter ? ` · ${filter === 'am' ? 'ranní' : 'odpolední'}` : ''}` : '';
        $('#psList', dlg).innerHTML = list.length ? list.slice(0, 80).map(row).join('') : emptyState('Nikdo takový', q ? 'Zkus jinou část jména nebo ID.' : 'Na této směně nikdo není.');
      };
      input.addEventListener('input', draw);
      input.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        const first = $('#psList [data-psgo="detail"]', dlg);
        if (first) { event.preventDefault(); pick = { key: first.dataset.pskey, act: 'detail' }; dlg.close('ok'); }
      });
      $('#psF', dlg).addEventListener('click', event => {
        const chip = event.target.closest('[data-psf]');
        if (!chip) return;
        filter = chip.dataset.psf;
        $$('#psF .chip', dlg).forEach(c => { c.classList.toggle('on', c === chip); c.setAttribute('aria-pressed', String(c === chip)); });
        draw();
      });
      $('#psList', dlg).addEventListener('click', event => {
        const b = event.target.closest('[data-psgo]');
        if (!b || b.disabled) return;
        pick = { key: b.dataset.pskey, act: b.dataset.psgo };
        dlg.close('ok');
      });
      $('#psScan', dlg).onclick = () => { pick = { act: 'scan' }; dlg.close('ok'); };
      draw();
    },
  });
  if (result.value !== 'ok' || !pick) return;
  let key = pick.key;
  if (pick.act === 'scan') { key = await scanEmployee(); if (!key) return; pick.act = 'detail'; }
  if (!S.employees[key]) return;
  if (pick.act === 'profil') { openProfile(key); return; }
  if (pick.act === 'sankce') { ui.sanDraft.key = key; showView('sankce'); renderSanctions(); return; }
  openPersonKey(key);
}

function renderDemoBanner() {
  const box = $('#demoBanner');
  if (!S.demo) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="banner"><div><b>Ukázková data.</b> Vidíš vymyšlený měsíc, ať je poznat, jak aplikace funguje. Než začneš s vlastními daty, ukázku vymaž; docházka se nahrává v KPI (Docházka a výkony).</div>
    <div class="banner-actions"><button class="btn small" type="button" data-go="audit">Otevřít KPI</button><button class="btn sec small" type="button" id="btnClearDemo">Vymazat ukázku</button></div></div>`;
  $('#btnClearDemo').onclick = async () => {
    if (!(await confirmBox('Vymazat ukázku?', 'Smažou se ukázkoví lidé, docházka, výroba a sankce. Skupiny, dovednosti a nastavení zůstanou (bez ukázkových prémií).', 'Vymazat'))) return;
    // Pozice, nastavení a důvody sankcí zůstávají (jak slibuje dialog), mizí jen ukázkoví lidé a jejich data.
    const keep = { positions: S.positions, settings: S.settings, sanReasons: S.sanReasons };
    dropDemoRaise(keep.positions);
    S = Object.assign(blank(), keep); setPeriod(null);
    store.note = { kind: 'data', text: 'Ukázková data vymazána' };
    save(); ui.selPerson = null; renderAll(); toast('Ukázka smazána. Nahraj docházku.');
  };
}

/* Výběr hodnoceného měsíce (2.64): jen v Přehledu (nadpis) a v Docházce, skleněná buňka se šipkou,
   klepnutím se rozbalí nabídka měsíců s docházkou (nejnovější nahoře). Levé menu ukazuje jen dnešní měsíc. */
const PER_CHEV = '<svg class="icon per-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const PER_TICK = '<svg class="icon per-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
function perPickHtml(key) {
  const p = curPeriod();
  if (!p) return '';
  const ids = Object.keys(S.periods).sort().reverse();
  return `<span class="per-pick" data-perwrap="${key}"><button type="button" class="per-btn" data-perpick="${key}" aria-haspopup="listbox" aria-expanded="false" title="Změnit měsíc"><span>${esc(periodName(p))}</span>${PER_CHEV}</button>
    <span class="per-menu" role="listbox" aria-label="Hodnocený měsíc" hidden>${ids.map(id => `<button type="button" role="option" class="per-opt${id === S.current ? ' on' : ''}" data-perset="${esc(id)}" aria-selected="${id === S.current}"><span>${esc(periodName(S.periods[id]))}</span>${id === S.current ? PER_TICK : ''}</button>`).join('')}</span></span>`;
}
function perClose(except) {
  document.querySelectorAll('[data-perwrap].open').forEach(w => {
    if (w === except) return;
    w.classList.remove('open');
    w.querySelector('.per-menu').hidden = true;
    w.querySelector('[data-perpick]').setAttribute('aria-expanded', 'false');
  });
}
function bindPerPick() {
  document.addEventListener('click', event => {
    const set = event.target.closest('[data-perset]');
    if (set) {
      perClose();
      if (set.dataset.perset !== S.current) { setPeriod(set.dataset.perset); renderAll(); }
      return;
    }
    const btn = event.target.closest('[data-perpick]');
    const wrap = btn ? btn.closest('[data-perwrap]') : null;
    perClose(wrap);
    if (!wrap) return;
    const menu = wrap.querySelector('.per-menu');
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
    wrap.classList.toggle('open', !menu.hidden);
    if (!menu.hidden) (menu.querySelector('.per-opt.on') || menu.querySelector('.per-opt')).focus();
  });
  document.addEventListener('keydown', event => {
    const open = document.querySelector('[data-perwrap].open');
    if (!open) return;
    if (event.key === 'Escape') { perClose(); open.querySelector('[data-perpick]').focus(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const opts = [...open.querySelectorAll('.per-opt')];
    const i = opts.indexOf(document.activeElement);
    if (i < 0) return;
    event.preventDefault();
    opts[Math.max(0, Math.min(opts.length - 1, i + (event.key === 'ArrowDown' ? 1 : -1)))].focus();
  });
}

function renderPeriodBits() {
  const p = curPeriod();
  $('#periodNow').textContent = monthLabel(todayIso().slice(0, 7));
  $('#btnDelPeriod').disabled = !p;
  const unassigned = Object.values(S.employees).filter(e => !e.excluded && !isLead(e) && (!e.positionId || (posOf(e) && !isGroup(posOf(e)) && !e.level))).length;
  const badge = $('#navPeople');
  badge.hidden = !unassigned;
  badge.textContent = String(unassigned);
  badge.title = `${unassigned} bez skupiny`;
}

