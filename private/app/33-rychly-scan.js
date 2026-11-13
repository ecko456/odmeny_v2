/* ==========================================================================
   RYCHLÝ SCAN (2.77): na telefonu doplnit interní evidenci Shortage čtením QR kódů.
   Zvolí se pozice (stav záznamu), kamera čte kódy, po každém se zadá jen množství. Hromadně se
   kódy sbírají do dávky a potvrdí se najednou, jinak se každý zapíše hned. Kamera se při přechodu
   jinam a při skrytí karty vypne. Obsah se kreslí po částech (#scHead, #scSet, #scBatch, #scLog),
   kamera (#scCam) se nepřekresluje, ať při průběžné aktualizaci dat nezhasne.
   ========================================================================== */
const SC_SAME_MS = 2500;   // stejný kód z kamery se znovu načte až po 2,5 s mimo záběr
const SC_LOG_SHOW = 40;
const SC_RANGES = [['today', 'Dnes'], ['week', '7 dní'], ['all', 'Vše']];
function scTargets() { return shc().lists.filter(l => !l.packed); }
function scTarget() { const t = scTargets(); return t.find(l => l.id === ui.sc.list) || t[0] || null; }
function scPosNow() { return scPos(P.scanPos || ''); }
const scKs = q => `${nf(q, 3)} ks`;
const scCodesN = n => `${n} ${n === 1 ? 'kód' : n <= 4 && n ? 'kódy' : 'kódů'}`;
function scFoundHtml(f, code) {
  if (!f) return `<div class="sc-found miss"><b>${esc(code)}</b><span>V seznamu tenhle kód není. Záznam se uloží k seznamu a přiřadí se, až kód dostane položka (třeba po výrobním plánu).</span></div>`;
  const it = f.item;
  const tag = it.st === 'done' ? '<span class="tag ok">HOTOVO</span>' : it.top ? '<span class="tag crit">TOP SHORTAGE</span>' : it.top2 ? '<span class="tag sh-top2tag">TOP 2</span>' : '';
  const what = f.kind === 'sub' ? `poddíl ${f.ean || f.sub.code} · sestava ${it.name || it.ean}` : f.kind === 'qr' ? `varianta QR · ${it.name || it.ean}` : it.name || it.ean || '—';
  return `<div class="sc-found"><span class="sc-fname">${tag}<b>${esc(what)}</b></span><span>${esc([f.ean ? `EAN ${f.ean}` : '', f.order ? `obj. ${f.order}` : '', f.index ? `index ${f.index}` : '', it.qty ? `urgentně ${it.qty}` : ''].filter(Boolean).join(' · '))}</span><small class="mono">${esc(code)}</small></div>`;
}
function scHeadHtml() {
  const l = scTarget(), b = ui.sc.batch, today = scRange(shc().scans, 'today').length;
  const qty = b.reduce((a, r) => a + r.qty, 0);
  return `<section class="qk-hero sc-hero">
      <div class="hh-top"><span class="hh-brand">HALA <i>2</i></span><span class="hh-week">${esc(dayLong(todayIso()))}</span></div>
      <p class="qk-eyebrow">Interní evidence · Shortage</p>
      <h1 id="scTitle">Rychlý scan</h1>
      <p class="hh-sub">${l ? `Zapíše se do seznamu z ${esc(shWhen(l))} · ${l.items.length} ${shItemsN(l.items.length)}` : 'Není kam zapisovat: chybí nezabalený seznam urgentů'}</p>
      <div class="qk-kpi">
        <div><b class="num">${b.length}</b><small>${b.length === 1 ? 'kód' : b.length >= 2 && b.length <= 4 ? 'kódy' : 'kódů'} v dávce</small></div>
        <div><b class="num">${nf(qty, 1)}</b><small>ks v dávce</small></div>
        <div><b class="num">${today}</b><small>dnes zapsáno</small></div>
      </div>
    </section>`;
}
function scSetHtml() {
  const l = scTarget(), lists = scTargets(), pos = scPosNow(), sugg = scPositions(shc());
  if (!l) return `<section class="card qk-card"><div class="note w">${shc().lists.length ? 'Všechny seznamy urgentů jsou zabalené.' : 'Zatím tu není žádný seznam urgentů.'} Nejdřív nahraj nebo vlož dnešní urgenty v Shortage, záznamy se zapisují k nim.</div><button class="btn" type="button" data-go="shortage">Otevřít Shortage</button></section>`;
  return `<section class="card qk-card sc-set">
      <h2 class="qk-h"><span class="qk-no">1</span>Pozice</h2>
      <label class="field"><span>Kde díl je / stav záznamu</span><input type="text" id="scPos" list="scPosList" maxlength="${SC_MAX_POS}" autocomplete="off" placeholder="třeba Odesláno na WPA" value="${esc(pos)}"></label>
      <datalist id="scPosList">${sugg.map(p => `<option value="${esc(p)}"></option>`).join('')}</datalist>
      ${sugg.length ? `<div class="qk-depts sc-poss" role="group" aria-label="Rychlá volba pozice">${sugg.slice(0, 6).map(p => `<button type="button" class="chip${shOpNorm(p) === shOpNorm(pos) ? ' on' : ''}" data-scpos="${esc(p)}" aria-pressed="${shOpNorm(p) === shOpNorm(pos)}">${esc(p)}</button>`).join('')}</div>` : ''}
      <label class="switch sc-mode"><input type="checkbox" id="scBatchOn"${P.scanBatch !== false ? ' checked' : ''}><span>Hromadné načítání <small>kódy se sbírají do dávky a potvrdíš je najednou; vypnuté = každý kód se zapíše hned po zadání množství</small></span></label>
      ${lists.length > 1 ? `<label class="field"><span>Seznam urgentů</span><select id="scList">${lists.map(x => `<option value="${esc(x.id)}"${x.id === l.id ? ' selected' : ''}>${esc(shWhen(x))} · ${x.items.length} ${shItemsN(x.items.length)}${x.file ? ` · ${esc(x.file)}` : ''}</option>`).join('')}</select></label>` : ''}
    </section>`;
}
function scBatchHtml() {
  const b = ui.sc.batch, l = scTarget(), pos = scPosNow();
  const done = ui.sc.done ? `<div class="note i sc-done">${ui.sc.done}</div>` : '';
  if (P.scanBatch === false && !b.length) return done;
  if (!b.length) return `${done}<section class="card qk-card sc-batch"><h2 class="qk-h"><span class="qk-no">3</span>Dávka</h2><p class="small muted">Zatím nic. Načti kódy kamerou nebo čtečkou, po každém zadáš množství.</p></section>`;
  const qty = b.reduce((a, r) => a + r.qty, 0);
  return `${done}<section class="card qk-card sc-batch" id="scBatchCard">
      <div class="qk-rhead"><h2 class="qk-h"><span class="qk-no">3</span>Dávka <span class="qk-cnt num">${b.length}</span></h2><span class="tiny muted">${esc(pos || 'bez pozice')} · ${esc(scKs(qty))}</span></div>
      <ol class="qk-list sc-list">${b.slice().reverse().map(r => {
        const f = l ? scFind(l, r.code) : null;
        return `<li class="qk-row sc-row${f ? '' : ' sc-miss'}" data-scrow="${esc(r.code)}"><span class="ps-av">${f ? I.check : '?'}</span>
          <span class="nm"><b>${esc(f ? (f.kind === 'sub' ? `poddíl ${f.ean || r.code}` : f.name || f.ean || r.code) : r.code)}</b><span>${esc(f ? [f.kind === 'sub' ? `sestava ${f.name || f.item.ean}` : f.ean ? `EAN ${f.ean}` : '', f.order ? `obj. ${f.order}` : ''].filter(Boolean).join(' · ') : 'není v seznamu, uloží se pro později')}</span><small class="mono">${esc(r.code)}${r.n > 1 ? ` · ${r.n}× načteno` : ''}</small></span>
          <button type="button" class="btn sec small sc-qtybtn" data-scqty="${esc(r.code)}" aria-label="Upravit množství ${esc(r.code)}">${esc(scKs(r.qty))}</button>
          <button type="button" class="icon-btn small" data-scdel="${esc(r.code)}" title="Odebrat z dávky" aria-label="Odebrat z dávky ${esc(r.code)}">${I.x}</button></li>`;
      }).join('')}</ol>
      <div class="qk-actions">
        <button type="button" class="btn" data-scok${l && pos ? '' : ' disabled'}>${I.check}Potvrdit a doplnit do Shortage</button>
        <button type="button" class="btn ghost" data-scclear>Zahodit dávku</button>
      </div>
      ${pos ? '' : '<p class="qk-note warn">' + I.warn + '<span>Bez pozice nejde potvrdit. Zadej ji nahoře.</span></p>'}
    </section>`;
}
function scLogHtml() {
  const all = shc().scans || [], range = SC_RANGES.some(r => r[0] === ui.sc.range) ? ui.sc.range : 'today';
  const list = scRange(all, range);
  const cnt = Object.fromEntries(SC_RANGES.map(([k]) => [k, scRange(all, k).length]));
  const qty = list.reduce((a, s) => a + s.qty, 0);
  return `<section class="card qk-card sc-log">
      <div class="qk-rhead"><h2 class="qk-h">Mobilní záznamy</h2><button type="button" class="btn sec small" data-scxlsx${list.length ? '' : ' disabled'}>Excel</button></div>
      <div class="qk-depts" role="group" aria-label="Období">${SC_RANGES.map(([k, t]) => `<button type="button" class="chip${range === k ? ' on' : ''}" data-scrange="${k}" aria-pressed="${range === k}">${t} <em>${cnt[k]}</em></button>`).join('')}</div>
      ${list.length ? `<p class="tiny muted">${list.length} ${list.length === 1 ? 'záznam' : list.length <= 4 ? 'záznamy' : 'záznamů'} · ${esc(scKs(qty))}${list.length > SC_LOG_SHOW ? ` · ukázáno posledních ${SC_LOG_SHOW}, Excel má všechny` : ''}</p>
        <ul class="qk-list sc-loglist">${list.slice(0, SC_LOG_SHOW).map(s => `<li class="qk-row sc-logrow"><span class="sc-when num">${esc(range === 'today' ? shWhenText(s.ts).split(' ').pop() : shWhenText(s.ts))}</span>
          <span class="nm"><b>${esc(s.kind === 'sub' ? `poddíl ${s.ean || s.code}` : s.name || s.ean || s.code)}</b><span>${esc(s.pos)}${s.kind === 'sub' && s.name ? ` · sestava ${esc(s.name)}` : ''}${s.hit ? '' : ' · mimo seznam'}</span><small class="mono">${esc(s.code)}${s.by ? ` · ${esc(s.by)}` : ''}</small></span>
          <b class="sc-q num">${esc(scKs(s.qty))}</b></li>`).join('')}</ul>`
        : `<p class="small muted">${range === 'today' ? 'Dnes zatím nic.' : 'Žádné záznamy.'} Každé potvrzené načtení se sem zapíše (kdy, pozice, kód, množství, díl, kdo) a jde stáhnout do Excelu.</p>`}
    </section>`;
}
function scCamHtml() {
  return `<section class="card qk-card sc-camcard">
      <h2 class="qk-h"><span class="qk-no">2</span>Načíst kódy</h2>
      <div class="scanner wide-scan sc-cam" id="scCam" hidden><video muted playsinline aria-label="Náhled kamery"></video><div class="frame"></div><div class="scanner-hint" id="scHint">QR kód do rámečku</div></div>
      <button type="button" class="qk-go sc-go" data-sccam>${I.camera}<span>Zapnout kameru</span></button>
      <p class="small muted" id="scCamState" aria-live="polite"></p>
      <label class="field"><span>Kód čtečkou nebo ručně</span><span class="scan-row"><input type="text" id="scCode" autocomplete="off" spellcheck="false" enterkeyhint="go" maxlength="2000" placeholder="naskenuj, nebo napiš kód"><button class="btn sec" type="button" id="scCodeAdd">Přidat</button></span></label>
    </section>`;
}
function renderScan() {
  const box = $('#scView');
  if (!box || !S) return;
  if (!$('#scCam', box)) box.innerHTML = `<div class="qk sc"><div id="scHead"></div><div id="scSet"></div><div id="scCamBox">${scCamHtml()}</div><div id="scBatch"></div><div id="scLog"></div></div>`;
  scDrawHead();
  // pozici nepřekreslovat, když se do ní zrovna píše
  if (!(document.activeElement && document.activeElement.id === 'scPos')) $('#scSet', box).innerHTML = scSetHtml();
  $('#scCamBox', box).hidden = !scTarget();
  scDrawBatch();
  scDrawCam();
}
function scDrawHead() { const h = $('#scHead'); if (h) h.innerHTML = scHeadHtml(); }
function scDrawBatch() { const b = $('#scBatch'), g = $('#scLog'); if (b) b.innerHTML = scBatchHtml(); if (g) g.innerHTML = scLogHtml(); }
function scDrawCam() {
  const cam = $('#scCam'), btn = $('[data-sccam]');
  if (!cam || !btn) return;
  cam.hidden = !ui.sc.cam;
  btn.classList.toggle('on', ui.sc.cam);
  $('span', btn).textContent = ui.sc.cam ? 'Vypnout kameru' : 'Zapnout kameru';
}
function scStop() {
  if (!ui.sc.cam) return;
  ui.sc.cam = false;
  stopCodeScan();
  scDrawCam();
  const st = $('#scCamState'); if (st) st.textContent = '';
}
async function scStart() {
  if (!scPosNow()) { toast('Nejdřív zadej pozici: kde díl je, nebo jaký je to záznam.', true); $('#scPos')?.focus(); return; }
  const video = $('#scCam video'), st = $('#scCamState');
  if (!video) return;
  ui.sc.cam = true;
  ui.sc.last = '';   // po zapnutí se načte i kód, který byl naposledy (nový kus)
  scDrawCam();
  if (st) st.textContent = 'Zapínám kameru…';
  try {
    await startCodeScan(video, text => { scSeen(text); return !ui.sc.cam; });
    if (st) st.textContent = 'Kamera běží. Drž QR kód v rámečku, po načtení zadáš množství.';
  } catch (error) {
    ui.sc.cam = false;
    scDrawCam();
    if (st) st.textContent = 'Kamera není k dispozici (nebo k ní prohlížeč nemá povolení). Kódy jde načíst čtečkou nebo napsat do pole níž.';
  }
}
/* Kód z kamery: během zadávání množství a hned po něm (stejný štítek) se nic nedělá. */
function scSeen(text) {
  if (ui.sc.busy || !ui.sc.cam) return;
  const code = scCode(text), now = Date.now();
  // stejný štítek pořád v záběru: čas se obnoví, znovu se načte až po 2,5 s mimo záběr (další kus téhož dílu)
  if (code && code === ui.sc.last && now - ui.sc.lastAt < SC_SAME_MS) { ui.sc.lastAt = now; return; }
  if (!code) {
    if (text !== ui.sc.badText) { ui.sc.badText = text; const h = $('#scHint'); if (h) h.textContent = 'Tenhle kód nemá activeBarcode'; setTimeout(() => { const x = $('#scHint'); if (x) x.textContent = 'QR kód do rámečku'; }, 2000); }
    return;
  }
  scTake(code);
}
async function scTake(code) {
  const l = scTarget();
  if (!l) { toast('Není nezabalený seznam urgentů, kam záznam zapsat.', true); return; }
  if (!scPosNow()) { toast('Nejdřív zadej pozici.', true); $('#scPos')?.focus(); return; }
  ui.sc.busy = true;
  if (navigator.vibrate) try { navigator.vibrate(40); } catch (error) { /* bez vibrace */ }
  let qty = null;
  try { qty = await scQtyDialog(code, l); } finally { ui.sc.busy = false; ui.sc.last = code; ui.sc.lastAt = Date.now(); }
  if (qty == null) return;
  if (P.scanBatch === false) { scConfirm([{ code, qty, n: 1, at: Date.now() }]); return; }
  const r = scAdd(ui.sc.batch, code, qty, Date.now());
  if (!r) { toast(`Dávka je plná (${SC_MAX_BATCH} kódů). Potvrď ji a pokračuj další.`, true); return; }
  ui.sc.done = '';
  scDrawHead(); scDrawBatch();
  const f = scFind(l, code);
  toast(`${f ? f.name || f.ean || code : code}: +${scKs(qty)}${r.merged ? ` (celkem ${scKs(r.row.qty)})` : ''} · v dávce ${scCodesN(ui.sc.batch.length)}`);
}
/* Okno množství po načtení: co kód je, kolik už je v dávce, číslo s rychlými volbami. edit = přepsat množství v dávce. */
async function scQtyDialog(code, l, edit = null) {
  const f = scFind(l, code), inBatch = ui.sc.batch.find(r => r.code === code);
  const urgent = f && scQty(f.item.qty);
  const quick = [...new Set([urgent, ui.sc.lastQty, 1, 5, 10].filter(v => v != null && v > 0))].slice(0, 4);
  const batch = P.scanBatch !== false;
  const res = await dialog({
    title: edit != null ? 'Upravit množství' : 'Množství',
    ok: edit != null ? 'Uložit' : batch ? 'Přidat do dávky' : 'Zapsat', cancel: edit != null ? 'Zrušit' : 'Přeskočit',
    html: `${scFoundHtml(f, code)}
      <p class="small muted">Pozice: <b>${esc(scPosNow())}</b>${inBatch && edit == null ? ` · v dávce už ${esc(scKs(inBatch.qty))}${inBatch.n > 1 ? ` (${inBatch.n}×)` : ''}, přičte se` : ''}</p>
      <div class="sc-qty"><button type="button" class="qk-pm" data-scstep="-1" aria-label="O jeden kus méně">−</button>
        <input type="text" name="qty" class="sc-qin num" inputmode="decimal" enterkeyhint="done" autocomplete="off" aria-label="Množství v kusech" value="${edit != null ? esc(scQtyText(edit)) : ''}" placeholder="ks" autofocus>
        <button type="button" class="qk-pm" data-scstep="1" aria-label="O jeden kus více">+</button></div>
      ${quick.length ? `<div class="qk-quick sc-quick">${quick.map(v => `<button type="button" class="chip" data-scset="${esc(scQtyText(v))}">${esc(nf(v, 3))}${v === urgent ? '<em>urgentně</em>' : ''}</button>`).join('')}</div>` : ''}`,
    validate: form => (scQty(form.elements.namedItem('qty').value) == null ? 'Zadej množství: kladné číslo kusů.' : ''),
    onOpen: dlg => {
      const inp = $('[name="qty"]', dlg);
      dlg.querySelectorAll('[data-scstep]').forEach(b => b.addEventListener('click', () => { const v = scQty(inp.value) || 0; inp.value = scQtyText(Math.max(0, Math.round((v + +b.dataset.scstep) * 1000) / 1000) || 1); inp.focus(); }));
      dlg.querySelectorAll('[data-scset]').forEach(b => b.addEventListener('click', () => { inp.value = b.dataset.scset; $('#dlgForm').requestSubmit($('#dlgOk')); }));
      setTimeout(() => { inp.focus(); inp.select(); }, 30);
    },
  });
  if (res.value !== 'ok') return null;
  const q = scQty(res.form.elements.namedItem('qty').value);
  if (q != null) ui.sc.lastQty = q;
  return q;
}
/* Zápis do Shortage: dávka nebo jeden kód (bez hromadného načítání). */
function scConfirm(rows) {
  const l = scTarget(), pos = scPosNow();
  const batch = rows || ui.sc.batch;
  if (!l || !pos || !batch.length) return;
  const qty = batch.reduce((a, r) => a + r.qty, 0);
  const res = scApply(shc(), l, batch, pos, { at: Date.now(), by: ui.me.label || '' });
  if (!res) { toast('Zapsat nejde: seznam je zabalený, nebo chybí pozice.', true); return; }
  S.shortage = cleanShortage(S.shortage);
  save();
  if (!rows) { ui.sc.batch = []; scStop(); }
  const miss = res.missing.length;
  ui.sc.done = `Zapsáno do Shortage (seznam z <b>${esc(shWhen(l))}</b>), pozice <b>${esc(pos)}</b>: <b>${scCodesN(batch.length)}</b>, ${esc(scKs(qty))}${res.updated ? ` · aktualizováno ${res.updated} ${shPl(res.updated, 'záznam', 'záznamy', 'záznamů')} u položek` : ''}${miss ? ` · ${miss} ${shPl(miss, 'kód není', 'kódy nejsou', 'kódů není')} v seznamu (uloženo pro později)` : ''}${res.sent ? ` · odesláno na WPA ${res.sent}` : ''}.`;
  renderScan();
  if (ui.view === 'shortage') renderShortage();
  if (rows) { const f = scFind(l, batch[0].code); toast(`Zapsáno: ${f ? f.name || f.ean || batch[0].code : batch[0].code} · ${scKs(qty)} · ${pos}`); }
  else toast(`Dávka zapsaná do Shortage: ${scCodesN(batch.length)}, ${scKs(qty)}.`);
}
async function exportScXlsx() {
  const range = SC_RANGES.some(r => r[0] === ui.sc.range) ? ui.sc.range : 'today';
  const list = scRange(shc().scans || [], range);
  if (!list.length) return;
  try {
    const X = await xlsx();
    const wb = X.utils.book_new();
    scSheets(list).forEach(sh => { const ws = X.utils.aoa_to_sheet(sh.rows.map(row => row.map(safeCell))); ws['!cols'] = sh.cols.map(wch => ({ wch })); X.utils.book_append_sheet(wb, ws, sh.name); });
    const name = range === 'all' ? 'vse' : range === 'week' ? `7-dni-${todayIso()}` : todayIso();
    downloadFile(`rychly-scan-${name}.xlsx`, new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch (error) { toast(`Export se nepovedl: ${error.message}`, true); }
}
function bindScan() {
  const view = $('#scView');
  view.addEventListener('click', async event => {
    const t = event.target;
    let b;
    if (t.closest('[data-sccam]')) { if (ui.sc.cam) scStop(); else scStart(); return; }
    if ((b = t.closest('[data-scpos]'))) { setPref({ scanPos: scPos(b.dataset.scpos) }); $('#scSet').innerHTML = scSetHtml(); scDrawBatch(); return; }
    if (t.closest('#scCodeAdd')) { scTyped(); return; }
    if ((b = t.closest('[data-scdel]'))) { ui.sc.batch = ui.sc.batch.filter(r => r.code !== b.dataset.scdel); scDrawHead(); scDrawBatch(); return; }
    if ((b = t.closest('[data-scqty]'))) {
      const r = ui.sc.batch.find(x => x.code === b.dataset.scqty), l = scTarget();
      if (!r || !l) return;
      ui.sc.busy = true;
      let q = null;
      try { q = await scQtyDialog(r.code, l, r.qty); } finally { ui.sc.busy = false; ui.sc.lastAt = Date.now(); }
      if (q != null) { r.qty = q; scDrawHead(); scDrawBatch(); }
      return;
    }
    if (t.closest('[data-scok]')) { scConfirm(null); return; }
    if (t.closest('[data-scclear]')) {
      if (!ui.sc.batch.length || !(await confirmBox('Zahodit dávku?', `V dávce je ${scCodesN(ui.sc.batch.length)}. Do Shortage se nic nezapíše.`, 'Zahodit', true))) return;
      ui.sc.batch = []; scDrawHead(); scDrawBatch(); return;
    }
    if ((b = t.closest('[data-scrange]'))) { ui.sc.range = b.dataset.scrange; scDrawBatch(); return; }
    if (t.closest('[data-scxlsx]')) { exportScXlsx(); return; }
  });
  view.addEventListener('input', event => {
    if (event.target.id === 'scPos') { setPref({ scanPos: scPos(event.target.value) }); $$('#scSet [data-scpos]').forEach(c => { const on = shOpNorm(c.dataset.scpos) === shOpNorm(event.target.value); c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on)); }); }
  });
  view.addEventListener('change', event => {
    const t = event.target;
    if (t.id === 'scPos') { setPref({ scanPos: scPos(t.value) }); scDrawBatch(); return; }
    if (t.id === 'scBatchOn') { setPref({ scanBatch: t.checked }); scDrawBatch(); return; }
    if (t.id === 'scList') { ui.sc.list = t.value; renderScan(); }
  });
  view.addEventListener('keydown', event => {
    if (event.target.id !== 'scCode' || event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    scTyped();
  });
  // skrytá karta (zamčený telefon, jiná aplikace): kamera se vypne
  document.addEventListener('visibilitychange', () => { if (document.hidden) scStop(); });
}
function scTyped() {
  const inp = $('#scCode');
  if (!inp) return;
  const code = scCode(inp.value);
  if (!code) { if (inp.value.trim()) toast('Tohle není kód: odkaz bez activeBarcode, nebo mezery v textu.', true); inp.select(); return; }
  inp.value = '';
  scTake(code).then(() => { const x = $('#scCode'); if (x && !ui.sc.cam) x.focus(); });
}
