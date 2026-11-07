/* ==========================================================================
   RYCHLÁ KONTROLA (2.39): na telefonu zadat, kolik lidí zkontrolovat, a dostat seznam jmen
   ========================================================================== */
const QK_QUICK = [3, 5, 10, 15];
const QK_MAX = 50;
function qkOpt() {
  const q = ui.qk, today = todayIso();
  return { n: q.n, dept: audDepts().includes(q.dept) ? q.dept : '', slot: q.slot === 'am' || q.slot === 'pm' ? q.slot : '', present: !!audPresent(today) && q.present, today };
}
const qkSlotText = s => (s === 'am' ? 'ranní' : s === 'pm' ? 'odpolední' : s === 'rot' ? 'směnnost' : 'bez směny');
const qkLastText = d => (d ? `naposledy ${dayText(d, false)}` : 'zatím bez kontroly');
/* Dnešní položka plánu kontrol pro člověka (2.42.1), bez zrušených. */
function qkItemOf(key) {
  const today = todayIso();
  const p = audPlan(isoWeek(today).id);
  return p ? p.items.find(i => i.key === key && i.day === today && i.state !== 'skip') || null : null;
}
function qkWho(x, i, cls = '') {
  const e = S.employees[x.key];
  const it = qkItemOf(x.key);
  const sc = it && it.state === 'done' ? checkScore(it) : null;
  const tasks = audTasks(x.dept).length;
  // klepnutí na člověka otevře body kontroly (2.42.1); hotová kontrola ukáže výsledek, vyměnit už nejde
  const right = sc ? `<span class="t5-state ${sc.ok === sc.n ? 's-ok' : 's-fail'}">${sc.ok}/${sc.n}</span>`
    : `<button type="button" class="icon-btn qk-swap" data-qkswap="${esc(x.key)}" title="Vyměnit za jiného" aria-label="Vyměnit: ${esc(x.name)}"${it ? ' hidden' : ''}>${I.swap}</button>`;
  return `<li class="qk-row${cls}${sc ? ' qk-done' : ''}" data-qkkey="${esc(x.key)}">
    <span class="qk-i num">${i + 1}</span><span class="ps-av">${sc ? I.check : esc(initials(e || { last: x.name }))}</span>
    <button type="button" class="nm qk-open" data-qkopen="${esc(x.key)}" aria-label="${esc(`${tasks ? (sc ? 'Upravit kontrolu' : 'Zkontrolovat') : 'Bez nutných úkonů'}: ${x.name}`)}"><b>${esc(x.name)}</b><span>${esc([x.dept, qkSlotText(x.slot), x.wid ? `ID ${x.wid}` : ''].filter(Boolean).join(' · '))}</span><small class="${x.last ? '' : 'qk-new'}">${esc(tasks ? (sc ? 'zkontrolováno, klepni pro úpravu' : `${qkLastText(x.last)} · klepni a zkontroluj ${tasks} ${tasks === 1 ? 'bod' : tasks <= 4 ? 'body' : 'bodů'}`) : 'oddělení nemá nutné úkony')}</small></button>
    ${right}
  </li>`;
}
/* Otevře body kontroly člověka z vylosovaného seznamu: kdo ještě není v dnešním plánu, přidá se. */
async function qkOpen(key) {
  const x = (ui.qk.list || []).find(y => y.key === key);
  const e = S.employees[key];
  if (!e) return;
  const dept = x ? x.dept : empDept(e);
  if (!audTasks(dept).length) { toast(`Oddělení ${dept} nemá nutné úkony. Doplníš je v Kontrolách, záložka Nutné úkony.`, true); return; }
  const week = isoWeek(todayIso()).id;
  let it = qkItemOf(key);
  if (!it) {
    try { quickSave([key], ktMeta()); } catch (error) { toast(error.message, true); return; }
    it = qkItemOf(key);
    if (!it) { toast('Člověka se nepodařilo přidat do dnešních kontrol.', true); return; }
    save(); renderKtBadge();
  }
  await ktCheckForm(week, it);
  renderQuick();
}
function qkTodayRow(it, today) {
  const tasks = audTasks(it.dept).length;
  const sc = it.state === 'done' ? checkScore(it) : null;
  const right = it.state === 'done' ? `<span class="t5-state ${sc.ok === sc.n ? 's-ok' : 's-fail'}">${sc.ok}/${sc.n}</span>`
    : it.state === 'skip' ? '<span class="t5-state s-zrus">neproběhlo</span>'
    : tasks ? `<button class="btn small" type="button" data-qkcheck="${esc(it.id)}">Zkontrolovat</button>` : '<span class="tiny warn-t">bez úkonů</span>';
  const e = S.employees[it.key];
  const nm = `<b>${esc(it.name)}</b><span>${esc(it.dept)}${ktAway(it) ? ' · podle příchodů nepřišel' : ''}</span>`;
  return `<li class="qk-row qk-${it.state}"><span class="ps-av">${it.state === 'done' ? I.check : esc(initials(e || { last: it.name }))}</span>
    ${tasks && it.state !== 'skip' ? `<button type="button" class="nm qk-open" data-qkcheck="${esc(it.id)}" aria-label="${esc(`${it.state === 'done' ? 'Upravit kontrolu' : 'Zkontrolovat'}: ${it.name}`)}">${nm}</button>` : `<span class="nm">${nm}</span>`}${right}</li>`;
}

function renderQuick() {
  const box = $('#qkView');
  if (!box || !S) return;
  const q = ui.qk;
  if (q.slot == null) q.slot = ui.homeShift === 'am' || ui.homeShift === 'pm' ? ui.homeShift : '';
  const opt = qkOpt();
  const today = opt.today;
  const pool = quickPool(opt);
  const n = pool.list.length;
  const depts = audDepts();
  const byDept = quickPool({ ...opt, dept: '' }).list.reduce((m, x) => { m[x.dept] = (m[x.dept] || 0) + 1; return m; }, {});
  const here = audPresent(today);
  const work = audDays(pool.week).includes(today);
  const todays = ((audPlan(pool.week) || {}).items || []).filter(i => i.day === today);
  const live = todays.filter(i => i.state !== 'skip'), done = live.filter(i => i.state === 'done').length;
  const take = Math.min(q.n, n);
  const list = q.list || null;
  const noTasks = depts.filter(d => !audTasks(d).length);
  const rot = opt.slot ? quickPool({ ...opt, slot: '' }).list.filter(x => x.slot === 'rot').length : 0;
  const slotSeg = `<div class="qk-seg" role="radiogroup" aria-label="Směna" data-on="${opt.slot || 'all'}"><span class="qk-pill" aria-hidden="true"></span>${[['', 'Obě směny'], ['am', 'Ranní'], ['pm', 'Odpolední']].map(([k, t]) => `<button type="button" role="radio" aria-checked="${opt.slot === k}" data-qkslot="${k}">${k === 'am' ? I.sun : k === 'pm' ? I.moon : ''}${t}</button>`).join('')}</div>`;
  box.innerHTML = `<div class="qk">
    <section class="qk-hero">
      <div class="hh-top"><span class="hh-brand">HALA <i>2</i></span><span class="hh-week">${esc(weekName(pool.week))}</span></div>
      <p class="qk-eyebrow">Namátková kontrola</p>
      <h1 id="qkTitle">Rychlá kontrola</h1>
      <p class="hh-sub">${esc(dayLong(today))}${work ? '' : ' · dnes se nepracuje'}</p>
      <div class="qk-kpi">
        <div><b class="num">${n}</b><small>${n === 1 ? 'člověk' : 'lidí'} v nabídce</small></div>
        <div><b class="num">${live.length}</b><small>dnes ke kontrole</small></div>
        <div><b class="num">${done}</b><small>zapsáno</small></div>
      </div>
    </section>
    ${depts.length ? '' : `<div class="note w">Zatím nikdo nemá skupinu, není koho kontrolovat. Skupinu nastavíš v Lidech.</div>`}
    <section class="card qk-card">
      <h2 class="qk-h"><span class="qk-no">1</span>Kolik lidí zkontrolovat</h2>
      <div class="qk-count">
        <button type="button" class="qk-pm" data-qkn="-1" aria-label="O jednoho méně"${q.n <= 1 ? ' disabled' : ''}>−</button>
        <output class="qk-n" id="qkN" aria-live="polite">${q.n}</output>
        <button type="button" class="qk-pm" data-qkn="1" aria-label="O jednoho více"${q.n >= QK_MAX ? ' disabled' : ''}>+</button>
      </div>
      <div class="qk-quick">${QK_QUICK.map(k => `<button type="button" class="chip${q.n === k ? ' on' : ''}" data-qkset="${k}" aria-pressed="${q.n === k}">${k}</button>`).join('')}</div>
      <p class="qk-of">${q.n > n ? `<span class="warn-t">V nabídce ${n === 1 ? 'je jen 1 člověk' : `je jen ${n} lidí`}, vylosuje se ${n}.</span>` : `${q.n} z ${n} ${n === 1 ? 'člověka' : 'lidí'} v nabídce`}</p>
    </section>
    <section class="card qk-card">
      <h2 class="qk-h"><span class="qk-no">2</span>Koho</h2>
      ${slotSeg}
      ${depts.length > 1 ? `<div class="qk-depts" role="group" aria-label="Oddělení">${[['', 'Všechna', Object.values(byDept).reduce((a, b) => a + b, 0)], ...depts.map(d => [d, d, byDept[d] || 0])].map(([k, t, c]) => `<button type="button" class="chip${opt.dept === k ? ' on' : ''}" data-qkdept="${esc(k)}" aria-pressed="${opt.dept === k}">${esc(t)} <em>${c}</em></button>`).join('')}</div>` : ''}
      ${here ? `<label class="switch qk-pres"><input type="checkbox" data-qkpres${opt.present ? ' checked' : ''}><span>Jen lidé dnes v práci <small>podle nahraných příchodů je tu ${here.n} ${lidiN(here.n)}</small></span></label>`
        : `<p class="qk-note">${I.info}<span>Dnešní příchody nejsou nahrané, losuje se podle zařazení a směn. Příchody nahraješ v Kontrolách.</span></p>`}
      ${rot ? `<p class="qk-note warn">${I.warn}<span>${rot} ${lidiN(rot)} se směnností: střídání skupin není nastavené, do ranní ani odpolední se nepočítají. Nastavíš ho v Matici, Směny a kapacita.</span></p>` : ''}
      <p class="qk-note">${I.info}<span>Přednost mají lidé, kteří nejdéle nebyli kontrolovaní. Kdo už má v tomto týdnu kontrolu${pool.busy ? ` (teď ${pool.busy} ${lidiN(pool.busy)})` : ''}, se nelosuje, stejně jako nemocní.</span></p>
    </section>
    <button type="button" class="qk-go" data-qkgo${take ? '' : ' disabled'}>${I.dice}<span>${take ? `Vylosovat ${take} ${lidiAcc(take)}` : 'Není koho vylosovat'}</span></button>
    ${list ? `<section class="card qk-card qk-result" id="qkResult">
      <div class="qk-rhead"><h2 class="qk-h"><span class="qk-no">3</span>Seznam ke kontrole <span class="qk-cnt num">${list.length}</span></h2><span class="tiny muted">${esc(tsText(q.at))}</span></div>
      ${q.short ? `<p class="qk-note warn">${I.warn}<span>${list.length ? `Požadováno ${q.want}, v nabídce ${list.length === 1 ? 'byl jen 1 člověk' : `bylo jen ${list.length} lidí`}.` : 'V nabídce nikdo není. Zkus jinou směnu nebo oddělení.'}</span></p>` : ''}
      ${list.length ? `<ol class="qk-list${q.anim ? ' anim' : ''}">${list.map((x, i) => qkWho(x, i, q.swapped === x.key ? ' swapped' : '')).join('')}</ol>` : ''}
      <div class="qk-actions">
        ${list.length ? `<button type="button" class="btn" data-qksave${work ? '' : ' disabled'}>${I.check}Uložit do dnešních kontrol</button>` : ''}
        <button type="button" class="btn sec" data-qkgo>Vylosovat znovu</button>
        ${list.length ? `<button type="button" class="btn ghost" data-qkshare>${I.share}Sdílet seznam</button>` : ''}
      </div>
      ${work ? `<p class="tiny muted">Klepnutím na člověka otevřeš body kontroly a u každého označíš splněno, nebo nesplněno (člověk se tím přidá do dnešních kontrol). Uložit do dnešních kontrol přidá celý seznam najednou.${noTasks.length ? ` Oddělení bez nutných úkonů (${esc(noTasks.join(', '))}) zapsat nejde.` : ''}</p>` : '<p class="tiny muted">Dnes není pracovní den, seznam jde jen sdílet. Do plánu kontrol se uloží v pracovní den.</p>'}
    </section>` : ''}
    ${todays.length ? `<section class="card qk-card qk-today">
      <div class="qk-rhead"><h2 class="qk-h">Dnes ke kontrole</h2><span class="qk-prog num">${done} / ${live.length}</span></div>
      <div class="qk-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${live.length}" aria-valuenow="${done}" aria-label="Zapsané kontroly"><i data-w="${live.length ? (done / live.length * 100).toFixed(1) : 0}"></i></div>
      <ul class="qk-list">${todays.map(it => qkTodayRow(it, today)).join('')}</ul>
      <button type="button" class="btn ghost small" data-go="kontroly">Celý plán v Kontrolách</button>
    </section>` : ''}
  </div>`;
  setWidths(box);
  q.anim = false;
  q.swapped = '';
}

function qkDraw() {
  const r = quickPick(qkOpt());
  ui.qk.list = r.list;
  ui.qk.want = r.want;
  ui.qk.short = r.short;
  ui.qk.at = Date.now();
  ui.qk.anim = true;
  renderQuick();
  const res = $('#qkResult');
  if (res) res.scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth', block: 'start' });
  if (navigator.vibrate) try { navigator.vibrate(12); } catch (error) { /* telefon bez vibrace */ }
}

async function qkShare() {
  const list = ui.qk.list || [];
  if (!list.length) return;
  const title = `Kontrola · ${dayLong(todayIso())}`;
  const text = `${title}\n${list.map((x, i) => `${i + 1}. ${x.name} (${x.dept}${x.wid ? `, ID ${x.wid}` : ''})`).join('\n')}`;
  if (navigator.share) {
    try { await navigator.share({ title, text }); return; } catch (error) { if (error && error.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); toast('Seznam je zkopírovaný, vlož ho do zprávy.'); } catch (error) { toast('Seznam nejde zkopírovat.', true); }
}

function qkSave() {
  const list = ui.qk.list || [];
  if (!list.length) return;
  let r;
  try { r = quickSave(list.map(x => x.key), ktMeta()); } catch (error) { toast(error.message, true); return; }
  ui.qk.list = null;
  ui.kt.week = r.week;
  save(); renderQuick(); renderKtBadge();
  const k = r.added.length;
  toast(k ? `Do dnešních kontrol ${k === 1 ? 'přibyl 1 člověk' : k <= 4 ? `přibyli ${k} lidé` : `přibylo ${k} lidí`}.` : 'Všichni už v dnešních kontrolách jsou.');
  const box = $('#qkView .qk-today');
  if (box) box.scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth', block: 'start' });
}

function bindQuick() {
  const view = $('#qkView');
  view.addEventListener('click', async event => {
    const t = event.target;
    const q = ui.qk;
    let b;
    if ((b = t.closest('[data-qkn]'))) { q.n = clamp(q.n + +b.dataset.qkn, 1, QK_MAX); renderQuick(); return; }
    if ((b = t.closest('[data-qkset]'))) { q.n = +b.dataset.qkset; renderQuick(); return; }
    if ((b = t.closest('[data-qkslot]'))) { q.slot = b.dataset.qkslot; renderQuick(); return; }
    if ((b = t.closest('[data-qkdept]'))) { q.dept = b.dataset.qkdept; renderQuick(); return; }
    if (t.closest('[data-qkgo]')) { qkDraw(); return; }
    if (t.closest('[data-qksave]')) { qkSave(); return; }
    if (t.closest('[data-qkshare]')) { qkShare(); return; }
    if ((b = t.closest('[data-qkopen]'))) { qkOpen(b.dataset.qkopen); return; }
    if ((b = t.closest('[data-qkswap]'))) {
      const keys = (q.list || []).map(x => x.key);
      const x = quickSwap(qkOpt(), keys, b.dataset.qkswap);
      if (!x) { toast('V nabídce už nikdo další není.', true); return; }
      q.list = q.list.map(y => (y.key === b.dataset.qkswap ? x : y));
      q.swapped = x.key;
      renderQuick();
      return;
    }
    if ((b = t.closest('[data-qkcheck]'))) {
      const week = isoWeek(todayIso()).id, it = audItem(week, b.dataset.qkcheck);
      if (it) { await ktCheckForm(week, it); renderQuick(); }
    }
  });
  view.addEventListener('change', event => {
    if (event.target.matches('[data-qkpres]')) { ui.qk.present = event.target.checked; renderQuick(); }
  });
}

