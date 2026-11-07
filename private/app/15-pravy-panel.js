/* ==========================================================================
   Pravý panel na širokém monitoru (2.59): kdo je přihlášený, rychlé akce, náhled úkolů
   (po termínu, blíží se, požadavky s vysokou závažností, další otevřené) a poslední změny
   s Vrátit zpět. Jen od 1600 px šířky okna, na menších monitorech a v telefonu se nekreslí.
   ========================================================================== */
const RAIL_MIN = 1600;
const railOn = () => window.matchMedia(`(min-width: ${RAIL_MIN}px)`).matches;
const RAIL_ACTS = [
  ['task', 'Nový úkol', '<path d="M12 5v14M5 12h14"/>'],
  ['rychla', 'Rychlá kontrola', '<path d="m5 12.5 4.5 4.5L19 7.5"/>'],
  ['sankce', 'Sankce', '<path d="M12 3.5 21 19.5H3z"/><path d="M12 10v4.5M12 17.2v.1"/>'],
  ['dochazka', 'Docházka', '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>'],
];
let _railSig = '';
function renderRail() {
  const box = $('#rail');
  if (!box || !S) return;
  const on = railOn();
  document.body.classList.toggle('has-rail', on);
  if (!on) { if (box.innerHTML) { box.innerHTML = ''; _railSig = ''; } return; }
  const today = todayIso();
  const o = tkOverview(S, today);
  const open = tkSort(tkList().filter(t => TK_OPEN.has(t.state)));
  const seen = new Set();
  const pick = [];
  const add = (t, why) => { if (!seen.has(t.id)) { seen.add(t.id); pick.push([t, why]); } };
  o.late.forEach(t => add(t, 'late'));
  o.soon.forEach(t => add(t, 'soon'));
  open.filter(t => tkIsReq(t) && t.sev === 'high').forEach(t => add(t, 'high'));
  open.forEach(t => add(t, ''));
  const shown = pick.slice(0, 6);
  const from = Date.now() - UNDO_DAYS * 864e5;
  const logs = (S.log || []).filter(x => x.at >= from).slice(-4).reverse();
  const h = new Date().getHours();
  const sig = JSON.stringify([today, h < 10 ? 0 : h < 18 ? 1 : 2, ui.view, shown.map(([t, w]) => [t.id, t.state, t.due, t.title, t.owner, t.sev, w]), logs.map(x => [x.at, x.text, !!x.un, undoable(x)]), o.open, o.late.length, o.soon.length, ui.me && ui.me.label]);
  if (sig === _railSig && box.innerHTML) return;
  _railSig = sig;
  const name = (ui.me && ui.me.label) || 'Přihlášený';
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const dayText = new Date().toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
  const taskRow = ([t, why]) => {
    const d = tkDue(t, today);
    const when = t.due ? tkDueText(t, today) : tkIsReq(t) && t.sev ? `${tkSevName(t.sev).toLowerCase()} závažnost` : 'bez termínu';
    const who = tkIsReq(t) ? tkPersonName(t) : t.owner;
    return `<button type="button" class="rail-task ${why || (d.late ? 'late' : d.soon ? 'soon' : '')}" data-railtask="${esc(t.id)}">
      <span class="rail-tdot" aria-hidden="true"></span><span class="rail-tmain"><b>${esc(t.title)}</b><small>${esc(when)}${who ? ` · ${esc(who)}` : ''}</small></span></button>`;
  };
  const logRow = x => `<div class="rail-log"><span class="log-ico">${LOG_ICON[x.kind] || LOG_ICON.data}</span><div><p>${esc(x.text.length > 110 ? `${x.text.slice(0, 110)}…` : x.text)}</p>
      <small>${esc(new Date(x.at).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }))} · ${esc(x.by || '')}${x.un ? ' · vráceno' : ''}</small></div>${undoable(x) ? `<button class="icon-btn" type="button" data-logundo="${esc(`${x.at}|${x.u.join(',')}`)}" title="Vrátit zpět" aria-label="Vrátit zpět">${I.undo}</button>` : ''}</div>`;
  box.innerHTML = `<div class="rail-in">
    <section class="rail-card rail-me"><span class="rail-av" aria-hidden="true">${esc(ini)}</span><div><p class="rail-hi">${esc(greeting(h))}</p><b>${esc(name)}</b><small>${esc(dayText)}</small></div></section>
    <section class="rail-card"><h2 class="rail-h">Rychlé akce</h2><div class="rail-acts">${RAIL_ACTS.map(([k, l, d]) => `<button type="button" class="rail-act${ui.view === k ? ' on' : ''}" data-railact="${k}"><span class="rail-ic" aria-hidden="true"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg></span><span>${l}</span></button>`).join('')}</div></section>
    <section class="rail-card rail-tasks"><div class="rail-hrow"><h2 class="rail-h">Úkoly</h2><button class="link small" type="button" data-railgo="ukoly">Vše (${o.open})</button></div>
      ${o.late.length || o.soon.length ? `<p class="rail-sum">${o.late.length ? `<span class="tag crit">${o.late.length} po termínu</span>` : ''}${o.soon.length ? `<span class="tag warn">${o.soon.length} blíží se</span>` : ''}</p>` : ''}
      ${shown.length ? `<div class="rail-tlist">${shown.map(taskRow).join('')}</div>${pick.length > shown.length ? `<p class="tiny muted">a další otevřené (${pick.length - shown.length})</p>` : ''}` : `<p class="small muted">${tkList().length ? 'Žádný otevřený úkol.' : 'Zatím žádné úkoly.'}</p>`}</section>
    <section class="rail-card rail-logs"><div class="rail-hrow"><h2 class="rail-h">Poslední změny</h2><button class="link small" type="button" data-raillog>Vše</button></div>
      ${logs.length ? logs.map(logRow).join('') : '<p class="small muted">Za poslední 3 dny žádné změny.</p>'}</section>
  </div>`;
}
function bindRail() {
  const box = $('#rail');
  if (!box) return;
  box.addEventListener('click', event => {
    const t = event.target;
    const task = t.closest('[data-railtask]');
    if (task) { openTaskFromPerson(task.dataset.railtask); return; }
    const act = t.closest('[data-railact]');
    if (act) { if (act.dataset.railact === 'task') tkNewDialog(); else showView(act.dataset.railact); return; }
    const go = t.closest('[data-railgo]');
    if (go) { ui.tk.sel = null; showView(go.dataset.railgo); return; }
    if (t.closest('[data-raillog]')) { openLog(); return; }
    const undo = t.closest('[data-logundo]');
    if (undo) undoChange(undo.dataset.logundo);
  });
  window.matchMedia(`(min-width: ${RAIL_MIN}px)`).addEventListener('change', () => { _railSig = ''; renderTaskAlert(); });
  // pozdrav a „dnes“ se mění s časem
  setInterval(() => { if (railOn()) renderRail(); }, 5 * 60 * 1000);
}

/* Sbalitelné boční menu (2.59): úzká kapsle jen s ikonami, popisky po najetí. Volba je jen pro
   toto zařízení (localStorage podle adresy aplikace), ne v datech ani v osobním nastavení. */
const SIDE_KEY = `odmeny.side.v1:${location.pathname.replace(/[^/]*$/, '')}`;
function sideMiniGet() { try { return localStorage.getItem(SIDE_KEY) === 'mini'; } catch (error) { return false; } }
function sideMiniSet(on) {
  try { if (on) localStorage.setItem(SIDE_KEY, 'mini'); else localStorage.removeItem(SIDE_KEY); } catch (error) { /* soukromé okno: volba platí jen do zavření */ }
  applySideMini(on);
}
function applySideMini(on) {
  document.documentElement.classList.toggle('side-mini', on);
  const b = $('#sideMini');
  if (b) { b.setAttribute('aria-pressed', String(on)); b.title = on ? 'Rozbalit menu' : 'Sbalit menu'; b.setAttribute('aria-label', b.title); const t = b.querySelector('span'); if (t) t.textContent = b.title; }
  // v úzkém menu je popisek jen v title (najetí myší) a aria-label
  $$('#nav button').forEach(button => {
    const label = (button.querySelector('span') || button).textContent.trim();
    if (on) { button.title = label; button.setAttribute('aria-label', label); } else { button.removeAttribute('title'); button.removeAttribute('aria-label'); }
  });
}
function bindSideMini() {
  const b = $('#sideMini');
  if (!b) return;
  b.onclick = () => sideMiniSet(!document.documentElement.classList.contains('side-mini'));
  applySideMini(sideMiniGet());
}

