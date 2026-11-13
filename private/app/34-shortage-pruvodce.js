/* ==========================================================================
   SHORTAGE: PRŮVODCE NAHRÁNÍM (2.78)
   Když není aktivní (nezabalený) seznam, ukáže se místo prázdné stránky karta s tlačítkem Spustit
   nahrávání shortage. Průvodce vede třemi kroky: 1. urgenty (vložit tabulku, nahrát soubor, ze schránky),
   2. výrobní plán (7 měsíců zpět a 8 dopředu, sloupce podle přednastavení), 3. interní evidence (vložit,
   ze schránky, soubor). Kroky používají stejné importy jako tři kroky nahoře; průvodce jen hlídá, co
   je od jeho spuštění hotové, a po dokončení kroku sám přejde na další.
   Stav ui.sh.wiz = {at, step 1–4, adv {krok: true}} je jen v paměti okna.
   ========================================================================== */
const SH_WIZ_STEPS = [
  [1, 'Urgentní díly', 'tabulka shortage'],
  [2, 'Výrobní plán', 'poddíly a operace'],
  [3, 'Interní evidence', 'poslední záznamy'],
];
/** Co je od spuštění průvodce hotové: {1, 2, 3} (true / false) a seznam, ke kterému se nahrává. */
function shWizDone(w) {
  const l = shWork(), at = (w && w.at) || 0;
  const plan = ui.sh.plan && ui.sh.plan.at >= at;
  return {
    l,
    1: !!(l && l.at >= at - 1000),
    2: !!(l && ((l.plan && l.plan.at >= at) || plan)) || (!l && plan),
    3: !!(l && l.moves && l.moves.at >= at),
  };
}
/** Po dokončení kroku přejde průvodce sám na další (jen poprvé; vrátit se jde klepnutím na krok). */
function shWizSync() {
  const w = ui.sh.wiz;
  if (!w) return null;
  const d = shWizDone(w);
  w.adv = w.adv || {};
  for (const n of [1, 2, 3]) { if (w.step === n && d[n] && !w.adv[n]) { w.adv[n] = true; w.step = n + 1; } }
  if (w.step > 1 && !d[1]) w.step = 1;   // bez seznamu dál nejde (třeba po smazání)
  return d;
}
/** Doporučené období výrobního plánu: 7 měsíců zpět a 8 měsíců dopředu od dneška. */
function shWizPlanRange(today = todayIso()) {
  const [y, m, d] = today.split('-').map(Number);
  const at = k => { const last = new Date(y, m - 1 + k + 1, 0).getDate(); const x = new Date(y, m - 1 + k, Math.min(d, last)); return todayIso(x.getTime()); };
  return { from: at(-7), to: at(8) };
}
/** Karta, když není aktivní seznam: den zabalený, nebo zatím nic. */
function shWizIntroHtml(c) {
  const last = c.lists[0];
  const lede = last
    ? `Den je zabalený. Seznam z <b>${esc(shWhen(last))}</b> (${last.items.length} ${shItemsN(last.items.length)}) je v historii; dnešní urgenty se s ním porovnají a u položky uvidíš, kolikátý den je na shortage.`
    : `Zatím žádný seznam. ${esc(SH_NONE)} Tabulku vlož přes Ctrl+V, ze schránky nebo nahraj soubor.`;
  return `<section class="card sh-wiz sh-wizintro${last ? ' sh-newday' : ''}">
      <div class="sh-wizhero">
        <p class="eyebrow">Průvodce · ${last ? 'nový den' : 'první seznam'}</p>
        <h2>Nahrání shortage ve třech krocích</h2>
        <p class="sh-wizlede">${lede}</p>
        <ol class="sh-wizpre" aria-label="Co tě čeká">${SH_WIZ_STEPS.map(([n, t, sub]) => `<li><span class="sh-wizn" aria-hidden="true">${n}</span><b>${t}</b><small>${sub}</small></li>`).join('')}</ol>
        <button class="btn sh-wizgo" type="button" data-shwiz="start">${I.upload || ''}<span>Spustit nahrávání shortage</span></button>
      </div>
      <div class="sh-wizalt">
        <button class="btn ghost small" type="button" data-shmanual>Přidat položku ručně</button>
        ${last ? `<button class="btn ghost small" type="button" data-shopen="${esc(last.id)}">Otevřít zabalený seznam</button><button class="btn ghost small" type="button" data-shmode="historie">Historie</button>` : ''}
      </div>
    </section>`;
}
/** Plocha pro vložení a přetažení souboru (Ctrl+V na ní jde do stejného vložení jako na stránce). */
function shWizDrop(kind, title, text) {
  return `<div class="sh-wzdrop" tabindex="0" role="group" data-shwzdrop="${kind}" aria-label="${esc(title)}">
      <span class="sh-wzico" aria-hidden="true">${kind === 'plan' ? I.upload || '' : I.clipboard || I.upload || ''}</span>
      <b>${title}</b><span class="small muted">${text}</span>
    </div>`;
}
function shWizStepHtml(w, d) {
  const l = d.l;
  if (w.step === 1) {
    return `<div class="sh-wizbody">
        <h3>1 · Urgentní díly</h3>
        <p class="small">Zkopíruj v Excelu celé sloupce shortage (urgenty A–S, i s nadpisy) a vlož je sem. Odkazy u EANů zůstanou, takže v PDF budou QR kódy; barvy v buňkách EANu (TOP, TOP 2, Hotovo) se převezmou.</p>
        ${shWizDrop('list', 'Klepni sem a stiskni Ctrl+V', 'nebo sem přetáhni soubor Excelu se seznamem')}
        <div class="sh-wizacts"><button class="btn" type="button" data-shwzfile="list">Nahrát tabulku</button><button class="btn sec" type="button" data-shwzclip>Vložit ze schránky</button></div>
        ${l ? `<div class="note i">Hotovo: seznam z <b>${esc(shWhen(l))}</b>, ${l.items.length} ${shItemsN(l.items.length)}. <button class="link" type="button" data-shwiz="2">Pokračovat na výrobní plán</button></div>` : ''}
      </div>`;
  }
  if (w.step === 2) {
    const r = shWizPlanRange(), pi = (shc().cols || {}).planItem;
    const pre = pi && pi.heads ? `Sloupce plánu jsou v přednastavení${pi.set ? ` (uložil ${esc(pi.set.by || 'někdo')} ${esc(dayText(todayIso(pi.set.at)))})` : ''}: soubor se stejnými nadpisy se načte sám, bez nastavování. Když bude jiný, navrhne sloupce AI a ukáže je ke kontrole.` : 'Při prvním nahrání navrhne sloupce AI (vidí jen nadpisy), zkontroluješ je a uloží se jako přednastavení: příště, i u kolegů, se soubor se stejnými nadpisy načte rovnou.';
    const subsN = l ? l.items.reduce((a, i) => a + (i.subs || []).length, 0) : 0;
    return `<div class="sh-wizbody">
        <h3>2 · Výrobní plán</h3>
        <div class="sh-wiztip"><b>Stáhni aktuální výrobní plán ideálně 7 měsíců zpět a 8 měsíců dopředu</b><span>od ${esc(dayText(r.from))} do ${esc(dayText(r.to))}</span></div>
        <p class="small">Z plánu se doplní poddíly sestav, probíhající operace, množství zakázky a QR kódy. ${pre}</p>
        ${shWizDrop('plan', 'Přetáhni sem soubor výrobního plánu', 'xlsx se dvěma listy: díly bez sestav a sestavy s poddíly')}
        <div class="sh-wizacts"><button class="btn" type="button" data-shwzfile="plan">Nahrát výrobní plán</button><button class="btn ghost" type="button" data-shwiz="3">Přeskočit</button></div>
        ${d[2] ? `<div class="note i">Hotovo: ${l && l.plan ? `plán <b>${esc(l.plan.file)}</b>, ${subsN} ${shSubsN(subsN)}` : `plán <b>${esc((ui.sh.plan || {}).file || '')}</b> je načtený`}. <button class="link" type="button" data-shwiz="3">Pokračovat na evidenci</button></div>` : ''}
      </div>`;
  }
  if (w.step === 3) {
    const recs = l ? l.items.filter(i => i.rec).length : 0;
    return `<div class="sh-wizbody">
        <h3>3 · Interní evidence</h3>
        <p class="small">Zkopíruj evidenci pohybu (QR kód, datum a čas, počet kusů, stav; klidně celé sloupce, desítky tisíc řádků) a vlož ji sem. Načtou se všechny řádky, u dílu se ukážou poslední 3 záznamy a díly se záznamem mimo naše oddělení půjdou do K prověření.</p>
        ${shWizDrop('move', 'Klepni sem a stiskni Ctrl+V', 'nebo sem přetáhni soubor evidence (xlsx, csv)')}
        <div class="sh-wizacts"><button class="btn" type="button" data-shwzclip>Vložit ze schránky</button><button class="btn sec" type="button" data-shwzfile="move">Nahrát soubor</button><button class="btn ghost" type="button" data-shwiz="4">Přeskočit a dokončit</button></div>
        ${d[3] ? `<div class="note i">Hotovo: záznam u ${recs} z ${l.items.length} ${shItemsN(l.items.length)}. <button class="link" type="button" data-shwiz="4">Dokončit</button></div>` : ''}
      </div>`;
  }
  // hotovo: shrnutí
  const subsN = l ? l.items.reduce((a, i) => a + (i.subs || []).length, 0) : 0;
  const recs = l ? l.items.filter(i => i.rec).length : 0;
  const chk = l && (shc().depts || []).length ? l.items.filter(i => shDeptOf(shc(), i) === SH_CHECK_DEPT).length : 0;
  const top = l ? l.items.filter(i => i.top && i.st !== 'done').length : 0;
  return `<div class="sh-wizbody sh-wizfin">
      <h3>Shortage je nahraná</h3>
      <div class="sh-wizsum">
        <div><b class="num">${l ? l.items.length : 0}</b><small>${shItemsN(l ? l.items.length : 0)}</small></div>
        <div><b class="num">${top}</b><small>TOP shortage</small></div>
        <div><b class="num">${subsN}</b><small>${shSubsN(subsN)} z plánu</small></div>
        <div><b class="num">${recs}</b><small>se záznamem</small></div>
        ${chk ? `<div class="warn"><b class="num">${chk}</b><small>${esc(SH_CHECK_NAME)}</small></div>` : ''}
      </div>
      <div class="sh-wizacts"><button class="btn" type="button" data-shwiz="end">Otevřít seznam</button>${l ? `<button class="btn sec" type="button" data-shpdf="${esc(l.id)}">Vytvořit PDF</button>` : ''}</div>
    </div>`;
}
/** Průvodce: kroky nahoře (hotové se zatržením), obsah aktuálního kroku. */
function shWizHtml() {
  const w = ui.sh.wiz, d = shWizSync();
  const cur = Math.min(4, w.step);
  return `<section class="card sh-wiz" aria-labelledby="shWizTitle">
      <div class="sh-wizhead"><div><p class="eyebrow">Průvodce nahráním</p><h2 id="shWizTitle">Nahrání shortage</h2></div>
        <button class="btn ghost small" type="button" data-shwiz="end">${d.l ? 'Zavřít průvodce' : 'Zrušit'}</button></div>
      <ol class="sh-wizsteps">${SH_WIZ_STEPS.map(([n, t, sub]) => {
        const st = d[n] ? 'done' : n === cur ? 'on' : '';
        const can = n === 1 || d[1];
        return `<li class="sh-wizstep ${st}${n === cur ? ' cur' : ''}"><button type="button" data-shwiz="${n}"${can ? '' : ' disabled'} aria-current="${n === cur ? 'step' : 'false'}"><span class="sh-wizn" aria-hidden="true">${d[n] ? I.check : n}</span><span><b>${t}</b><small>${d[n] ? 'hotovo' : n === 3 || n === 2 ? `${sub} · volitelné` : sub}</small></span></button></li>`;
      }).join('')}</ol>
      ${shWizStepHtml({ ...w, step: cur }, d)}
    </section>`;
}
/** Klik v průvodci; vrací true, když ho obsloužil. */
async function shWizClick(t) {
  let b;
  if ((b = t.closest('[data-shwiz]'))) {
    const v = b.dataset.shwiz;
    if (v === 'start') { ui.sh.wiz = { at: Date.now(), step: 1, adv: {} }; ui.sh.open = ''; ui.sh.mode = 'list'; $('#shMsg').innerHTML = ''; }
    else if (v === 'end') ui.sh.wiz = null;
    else if (ui.sh.wiz) ui.sh.wiz.step = Math.max(1, Math.min(4, +v || 1));
    renderShortage();
    if (ui.sh.wiz) { const z = $('#shView .sh-wzdrop'); if (z && v !== 'end') z.focus({ preventScroll: true }); $('#shView .sh-wiz')?.scrollIntoView({ block: 'nearest' }); }
    return true;
  }
  if ((b = t.closest('[data-shwzfile]'))) { const k = b.dataset.shwzfile; $(k === 'plan' ? '#shPlanFile' : k === 'move' ? '#shMoveFile' : '#shFile').click(); return true; }
  if (t.closest('[data-shwzclip]')) { $('#shClipboard').click(); return true; }
  if ((b = t.closest('[data-shwzdrop]'))) { b.focus({ preventScroll: true }); return true; }
  return false;
}
/** Přetažení souboru na plochu průvodce. */
function bindShWizDrop(view) {
  view.addEventListener('dragover', event => { const z = event.target.closest && event.target.closest('[data-shwzdrop]'); if (!z) return; event.preventDefault(); z.classList.add('over'); });
  view.addEventListener('dragleave', event => { const z = event.target.closest && event.target.closest('[data-shwzdrop]'); if (z && !z.contains(event.relatedTarget)) z.classList.remove('over'); });
  view.addEventListener('drop', event => {
    const z = event.target.closest && event.target.closest('[data-shwzdrop]');
    if (!z) return;
    event.preventDefault();
    z.classList.remove('over');
    const f = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (!f) return;
    const k = z.dataset.shwzdrop;
    if (k === 'plan') shPlanImport(f); else if (k === 'move') shMoveImport(f); else shImportFile(f);
  });
}
