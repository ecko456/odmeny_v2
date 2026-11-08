/* ==========================================================================
   SHORTAGE: chybějící díly z Excelu (verze 2.27, sloupce 2.27.1)
   Data a převod řádků jsou v core.js (S.shortage, shBuild, cleanShortage). Tady je import
   souboru (text buňky a cíl jejího hypertextového odkazu), seznam a PDF na šířku: QR kód
   s activeBarcode z odkazu u EANu, TOP SHORTAGE nahoře, urgentní množství, probíhající
   operace, Stav k 10:00, Stav k 13:00 a místo na poznámky.
   ========================================================================== */
function shc() { if (!S.shortage) S.shortage = blankShortage(); return S.shortage; }
function shList() { const c = shc(); return c.lists.find(l => l.id === ui.sh.open) || c.lists[0] || null; }

/** Text buňky, jak ho ukazuje Excel. EAN a čísla objednávek zůstanou celá (i s nulami na začátku). */
function shCellText(cell, qty) {
  if (!cell || cell.v == null || cell.v === '') return '';
  if (cell.t === 'n') {
    if (qty) return nf(cell.v, 3);
    const w = String(cell.w || '').trim();
    if (/^\d+$/.test(w)) return w;
    return Number.isInteger(cell.v) ? String(cell.v) : (w || String(cell.v));
  }
  return String(cell.t === 's' || cell.w == null ? cell.v : cell.w);
}
/** Cíl hypertextového odkazu buňky: vložený odkaz (Vložit → Odkaz), nebo vzorec HYPERLINK("…"). */
function shCellLink(cell) {
  if (!cell) return '';
  if (cell.l && cell.l.Target) return shUnxml(cell.l.Target);
  const m = String(cell.f || '').match(/HYPERLINK\(\s*"([^"]+)"/i);
  return m ? shUnxml(m[1]) : '';
}
/** Barva výplně buňky (2.61): RGB, z motivu (SheetJS převede) nebo z palety Excelu, jinak "". */
function shCellFill(cell) {
  const st = cell && cell.s;
  if (!st || !st.patternType || st.patternType === 'none') return '';
  const c = st.fgColor || {};
  return shHex(c.rgb) || (c.indexed != null && c.indexed !== 64 ? shHex(shIndexed(c.indexed)) : '');
}
/**
 * Výplně z palety Excelu (indexed): SheetJS je u buněk zahodí (fgColor je prázdný), proto je
 * dočteme ze styles.xml a XML listů. Vrací {list: Map(adresa → HEX)}; když se nic nepovede, prázdné.
 */
async function shIndexedFills(b) {
  const out = {};
  try {
    if (!(b[0] === 0x50 && b[1] === 0x4b) || !waDeflateRaw) return out;
    const zip = waZip(b);
    const st = zip.get('xl/styles.xml');
    if (!st) return out;
    const xml = await waZipText(b, st);
    const pal = [...((/<(?:\w+:)?indexedColors>([\s\S]*?)<\/(?:\w+:)?indexedColors>/.exec(xml) || [])[1] || '').matchAll(/rgb="([0-9A-Fa-f]{6,8})"/g)].map(m => shHex(m[1]));
    const fillsXml = (/<(?:\w+:)?fills\b[^>]*>([\s\S]*?)<\/(?:\w+:)?fills>/.exec(xml) || [])[1] || '';
    const fills = [...fillsXml.matchAll(/<(?:\w+:)?fill\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?fill>)/g)].map(m => {
      const f = /<(?:\w+:)?fgColor\b([^>]*)\/?>/.exec(m[1] || '');
      const ix = f && /\bindexed="(\d+)"/.exec(f[1]);
      if (!ix || /\b(rgb|theme)="/.test(f[1]) || +ix[1] === 64) return '';
      return pal[+ix[1]] || shHex(shIndexed(+ix[1]));
    });
    if (!fills.some(Boolean)) return out;
    const xfsXml = (/<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/.exec(xml) || [])[1] || '';
    const xfFill = [...xfsXml.matchAll(/<(?:\w+:)?xf\b([^>]*?)\/?>/g)].map(m => fills[+((/\bfillId="(\d+)"/.exec(m[1]) || [])[1] || 0)] || '');
    const rels = {};
    const relXml = await waZipText(b, zip.get('xl/_rels/workbook.xml.rels'));
    for (const m of relXml.matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?>/g)) rels[waAttr(m[1], 'Id')] = waAttr(m[1], 'Target');
    const wb = await waZipText(b, zip.get('xl/workbook.xml'));
    for (const m of wb.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?>/g)) {
      const id = (/\s\w+:id="([^"]+)"/.exec(m[1]) || [])[1];
      const target = String(rels[id] || '');
      const ent = zip.get((target.startsWith('/') ? target.slice(1) : `xl/${target}`).replace(/\/\.\//g, '/').toLowerCase());
      if (!ent || ent.csize > 30e6) continue;
      const sx = await waZipText(b, ent);
      const map = new Map();
      for (const c of sx.matchAll(/<(?:\w+:)?c\b([^>]*?)\/?>/g)) {
        const sIx = /\bs="(\d+)"/.exec(c[1]);
        const hex = sIx && xfFill[+sIx[1]];
        if (hex) map.set(waAttr(c[1], 'r'), hex);
      }
      if (map.size) out[waAttr(m[1], 'name')] = map;
    }
  } catch (error) { console.warn('Shortage: barvy z palety se nepodařilo přečíst', error); }
  return out;
}
/** List sešitu → řádky pro shBuild: sloupce A až `width` (text, cíl odkazu a barva výplně buňky). */
function shSheetRows(X, ws, width = 40, qtyCol = 4) {
  const ref = ws && ws['!ref'];
  if (!ref) return [];
  const range = X.utils.decode_range(ref);
  const rows = [];
  const last = Math.min(range.e.c, width - 1);
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 20000); r += 1) {
    const row = [];
    for (let c = 0; c <= Math.max(7, last); c += 1) {
      const cell = ws[X.utils.encode_cell({ r, c })];
      row.push({ text: shCellText(cell, c === qtyCol), link: shCellLink(cell), fill: shCellFill(cell) });
    }
    rows.push(row);
  }
  return rows;
}
const shPl = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);

/* ---------- Tři kroky (2.61): sloupce každého importu navrhne AI z nadpisů ----------
   AI dostane jen první řádky souboru, kde jsou hodnoty nahrazené typem (dvAiSample), a vrátí
   písmena sloupců. Bez AI se sloupce odhadnou podle nadpisů (shColsGuess). Okno se sloupci se
   ukáže, když se návrh liší od uloženého nastavení nebo AI něco nejistého napsala; jinak se
   soubor načte rovnou a ve zprávě je tlačítko Upravit sloupce. */
const SH_KIND_NAME = { list: 'urgentních dílů', plan: 'výrobního plánu', move: 'evidence pohybu' };
const shTextRows = rows => (rows || []).slice(0, 8).map(r => (r || []).map(c => (c && typeof c === 'object' ? c.text : c)));
async function shAiCols(kind, sheets) {
  if (!(ui.me && ui.me.ai) || window.SH_NO_AI) return null;
  const sample = shAiSample(sheets).filter(x => x.rows.length);
  if (!sample.length) return null;
  try { return await Vault.api('ai_shcols', { method: 'POST', body: { kind, sheets: sample } }); } catch (error) { toast(`AI: ${error.message} Sloupce se odhadnou podle nadpisů.`, true); return null; }
}
const shColsText = (kind, cols) => Object.keys(SH_COL_NAMES[kind]).filter(f => cols[f]).map(f => `${SH_COL_NAMES[kind][f].split(' (')[0]} ${cols[f]}`).join(', ');
/**
 * Sloupce pro import: AI (když je zapnutá), jinak odhad podle nadpisů. sheets = [{name, rows}]
 * (rows = první řádky jako pole hodnot), pick = index listu, který se čte. Vrací {cols, sheet,
 * how, note} nebo null (zrušeno).
 */
async function shColsFor(kind, sheets, { file = '', pick = 0, force = false } = {}) {
  const c = shc();
  const saved = c.cols && c.cols[kind];
  const base = saved || SH_COLS[kind];
  let sheetI = Math.min(Math.max(0, pick), Math.max(0, sheets.length - 1));
  const guess = shColsGuess(kind, (sheets[sheetI] || {}).rows || [], base);
  let cols = guess.cols;
  let how = guess.found.length ? 'odhad podle nadpisů' : saved ? 'uložené nastavení' : 'výchozí sloupce';
  let note = '';
  let header = guess.header;
  const ai = await shAiCols(kind, sheets.map(sh => ({ name: sh.name, rows: sh.rows })));
  if (ai) {
    cols = shColsFromAi(kind, ai, cols);
    how = 'návrh AI';
    note = ai.note || '';
    if (ai.header > 0) header = ai.header - 1;
    if (kind === 'plan' && cols.sheet) { const k = sheets.findIndex(sh => sh.name === cols.sheet); if (k >= 0) sheetI = k; }
  }
  if (kind === 'plan') cols.sheet = (sheets[sheetI] || {}).name || '';
  const noSheet = x => { const { sheet, ...rest } = shColsClean(kind, x); return JSON.stringify(rest); };   // list plánu se vybírá sám
  const same = noSheet(cols) === noSheet(base);
  if (force || !same || note) {
    const res = await shColsDialog(kind, sheets, { cols, sheetI, header, how, note, file });
    if (!res) return null;
    ({ cols, sheetI } = res);
    how = res.changed ? 'upraveno ručně' : how;
  }
  cols = shColsClean(kind, cols);
  if (JSON.stringify(saved || null) !== JSON.stringify(cols)) { c.cols = { ...(c.cols || {}), [kind]: cols }; }
  return { cols, sheetI, sheet: (sheets[sheetI] || {}).name || '', how, note };
}
/** Okno se sloupci: výběr písmen, u plánu i listu, a vzor prvních řádků podle výběru. */
async function shColsDialog(kind, sheets, { cols, sheetI, header, how, note, file }) {
  const fields = Object.keys(SH_COL_NAMES[kind]);
  const width = sh => Math.max(8, ...((sh && sh.rows) || []).map(r => (r || []).length));
  const letters = sh => Array.from({ length: Math.min(80, width(sh)) }, (x, i) => colLetter(i));
  const opts = (sh, v, f) => `${SH_COL_NEED[kind].includes(f) ? '' : `<option value=""${v ? '' : ' selected'}>— v souboru není —</option>`}${letters(sh).map(L => `<option value="${L}"${L === v ? ' selected' : ''}>${L}${(() => { const h = sh && sh.rows && sh.rows[Math.max(0, header)] && sh.rows[Math.max(0, header)][waIndex(L)]; return h != null && String(h).trim() ? ` · ${esc(String(h).slice(0, 30))}` : ''; })()}</option>`).join('')}`;
  const prev = (sh, cl) => {
    const rows = ((sh && sh.rows) || []).slice(Math.max(0, header + 1)).filter(r => (r || []).some(v => v != null && String(v).trim() !== '')).slice(0, 4);
    const use = fields.filter(f => cl[f]);
    if (!rows.length) return '<p class="small muted">Pod nadpisy nejsou žádné řádky.</p>';
    return `<div class="dv-prevwrap"><table class="dv-prevtab sh-colprev"><thead><tr>${use.map(f => `<th>${esc(SH_COL_NAMES[kind][f].split(' (')[0])} <small class="muted">${cl[f]}</small></th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${use.map(f => { const v = r[waIndex(cl[f])]; return `<td>${v == null || String(v).trim() === '' ? '<span class="muted">—</span>' : esc(String(v).slice(0, 40))}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
  };
  let changed = false;
  const res = await dialog({
    title: `Jak se načte soubor ${SH_KIND_NAME[kind]}`, ok: 'Načíst', wide: true,
    html: `<div class="sh-coldlg"><p class="small">${file ? `<b>${esc(file)}</b> · ` : ''}sloupce: <b>${esc(how)}</b>${note ? ` · <span class="sh-ainote">${esc(note)}</span>` : ''}. Zkontroluj vzor dole a případně oprav písmeno sloupce. Nastavení se zapamatuje pro další import.</p>
      ${kind === 'plan' && sheets.length > 1 ? `<label class="field"><span>List s plánem</span><select name="sheet">${sheets.map((sh, i) => `<option value="${i}"${i === sheetI ? ' selected' : ''}>${esc(sh.name)}</option>`).join('')}</select></label>` : ''}
      <div class="sh-colgrid">${fields.map(f => `<label class="field"><span>${esc(SH_COL_NAMES[kind][f])}${SH_COL_NEED[kind].includes(f) ? ' *' : ''}</span><select name="c-${f}" data-shcol="${f}">${opts(sheets[sheetI], cols[f], f)}</select></label>`).join('')}</div>
      <h4>Vzor prvních řádků</h4><div id="shColPrev">${prev(sheets[sheetI], cols)}</div>
      <p class="tiny muted">AI vidí jen nadpisy a druh hodnot (číslo, text, datum), žádné EANy ani názvy dílů. * = povinné.</p></div>`,
    onOpen: dlg => {
      const read = () => { const o = {}; fields.forEach(f => { o[f] = dlg.querySelector(`[name="c-${f}"]`).value; }); return o; };
      const sel = dlg.querySelector('[name="sheet"]');
      dlg.querySelector('.sh-coldlg').addEventListener('change', event => {
        changed = true;
        if (event.target === sel) {
          sheetI = +sel.value;
          const g = shColsGuess(kind, sheets[sheetI].rows || [], cols);
          header = g.header;
          fields.forEach(f => { dlg.querySelector(`[name="c-${f}"]`).innerHTML = opts(sheets[sheetI], g.cols[f], f); });
        }
        dlg.querySelector('#shColPrev').innerHTML = prev(sheets[sheetI], read());
      });
    },
  });
  if (res.value !== 'ok') return null;
  const out = {};
  fields.forEach(f => { out[f] = res.form.elements.namedItem(`c-${f}`).value; });
  return { cols: { ...cols, ...out }, sheetI, changed };
}
/** Vzorník barev (2.61): barvy výplně buněk EANu z importu a jejich přiřazení TOP / TOP 2 / běžná shortage. */
async function shColorDialog(r) {
  const c = shc();
  const list = [...r.fills.entries()].sort((a, b) => b[1] - a[1]);
  if (!list.length) return true;
  const ex = hex => r.items.find(i => i.fill === hex);
  const TIERS = [['top', 'TOP SHORTAGE'], ['top2', 'TOP 2 (hned po TOP)'], ['none', 'Běžná shortage']];
  const res = await dialog({
    title: 'Barvy v buňkách EANu', ok: 'Použít barvy', cancel: 'Bez barev', wide: true,
    html: `<p class="small">V buňkách s EANem jsou tyhle barvy výplně. Přiřaď každé, co znamená; aplikace si to zapamatuje i pro další import. Text TOP ve sloupci TOP má přednost.</p>
      <div class="sh-colors">${list.map(([hex, n]) => { const i = ex(hex) || {}; const t = (c.colors || {})[hex] || shColorGuess(hex); return `<div class="sh-colorrow"><span class="sh-swatch" data-swatch="${hex}" aria-hidden="true"></span><div><b>#${hex}</b> <span class="small muted">${n} ${shItemsN(n)}${i.ean ? ` · např. ${esc(i.ean)}${i.name ? ` ${esc(i.name)}` : ''}` : ''}</span></div>
        <select name="k-${hex}" aria-label="Barva #${hex}">${TIERS.map(([k, l]) => `<option value="${k}"${k === t ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`; }).join('')}</div>`,
    onOpen: dlg => { dlg.querySelectorAll('[data-swatch]').forEach(x => { x.style.background = `#${x.dataset.swatch}`; }); },
  });
  if (res.value !== 'ok') return false;
  const map = { ...(c.colors || {}) };
  list.forEach(([hex]) => { map[hex] = res.form.elements.namedItem(`k-${hex}`).value; });
  c.colors = map;
  shApplyColors(r.items, map);
  const all = shTopFirst(r.items);
  r.items = all;
  r.top = all.filter(i => i.top).length;
  r.top2 = all.filter(i => i.top2).length;
  return true;
}
/** Řádek do zprávy: jak se sloupce načetly, s tlačítkem Upravit sloupce. */
function shColsNote(kind, x) {
  return x ? `<div class="note i sh-colsnote">Sloupce ${SH_KIND_NAME[kind]} (${esc(x.how)}): ${esc(shColsText(kind, x.cols))}${x.sheet && kind === 'plan' ? `, list ${esc(x.sheet)}` : ''}. <button class="link" type="button" data-shrecols="${kind}">Upravit sloupce</button></div>` : '';
}

/** Nový seznam z výsledku shBuild: uloží, ukáže a napíše, co se načetlo. */
function shAddList(r, src) {
  const msg = $('#shMsg');
  const c = shc();
  const list = { id: uid('sh'), at: Date.now(), by: ui.me.label || '', file: src.file, sheet: src.sheet || '', items: r.items };
  const dropped = Math.max(0, c.lists.length + 1 - SH_MAX_LISTS);
  S.shortage = cleanShortage({ ...c, lists: [list, ...c.lists] });   // oddělení (2.32) zůstanou
  ui.sh.open = list.id;
  ui.sh.q = '';
  // výrobní plán nahraný v tomto okně se prohledá i u nového seznamu (2.29)
  const fresh = ui.sh.plan && shc().lists.find(x => x.id === list.id);
  const planRes = fresh ? shUsePlan(fresh, ui.sh.plan) : null;
  save();
  renderShortage();
  const n = list.items.length, w = r.warn, top = r.top;
  const from = src.paste ? 'ze schránky' : `ze souboru <b>${esc(src.file)}</b>${list.sheet ? ` (list ${esc(list.sheet)})` : ''}`;
  msg.innerHTML = `<div class="note i">${src.paste ? 'Vloženo' : 'Nahráno'} <b>${n} ${shItemsN(n)}</b> ${from}${top ? `, z toho <b>${top} TOP SHORTAGE</b> (v seznamu nahoře)` : ''}${r.top2 ? `${top ? ' a' : ', z toho'} <b>${r.top2} TOP 2</b> (hned pod TOP)` : ''}.</div>${[
    src.plain ? 'Ve schránce byl jen text bez odkazů, QR kódy proto chybí. Zkopíruj buňky přímo z Excelu (Ctrl+C) a vlož je sem znovu, nebo nahraj soubor.' : '',
    !src.plain && w.noLink ? `${w.noLink} ${shPl(w.noLink, 'položka nemá', 'položky nemají', 'položek nemá')} hypertextový odkaz, v PDF ${w.noLink === 1 ? 'bude' : 'budou'} bez QR kódu.` : '',
    w.noCode ? `${w.noCode} ${shPl(w.noCode, 'položka má', 'položky mají', 'položek má')} odkaz bez activeBarcode, v PDF ${w.noCode === 1 ? 'bude' : 'budou'} bez QR kódu.` : '',
    w.noEan ? `${w.noEan} ${shPl(w.noEan, 'položka nemá', 'položky nemají', 'položek nemá')} EAN (je jen název dílu).` : '',
    r.more ? `Načetlo se prvních ${SH_MAX_ITEMS} položek, ${r.more} dalších se nevešlo.` : '',
    dropped ? `Drží se posledních ${SH_MAX_LISTS} seznamů, nejstarší se smazal.` : '',
  ].filter(Boolean).map(t => `<div class="note w">${esc(t)}</div>`).join('')}${shColsNote('list', src.cols)}${planRes ? shPlanNote(planRes, ui.sh.plan, true) : ''}`;
}
/** Nový seznam, nebo v režimu Doplnit chybějící (2.36) jen chybějící položky do vybraného seznamu. */
function shTake(r, src) {
  const l = ui.sh.merge && shc().lists.find(x => x.id === ui.sh.merge);
  if (l) { shMergeInto(l, r, src); return; }
  ui.sh.merge = null;
  shAddList(r, src);
}
/** Doplnění chybějících (2.36): položky, které v seznamu nejsou, se přidají na konec své skupiny
    (TOP, TOP 2, ostatní); položky, které v seznamu už jsou, zůstanou beze změny. Ručně odebrané
    se vrátí jen na přání. Poddíly z výrobního plánu v paměti okna jen u doplněných. */
async function shMergeInto(l, r, src) {
  const msg = $('#shMsg');
  const from = src.paste ? 'ze schránky' : `ze souboru <b>${esc(src.file)}</b>`;
  const plan = shMergePlan(l, r.items, false);
  const stop = html => { ui.sh.merge = null; renderShortage(); msg.innerHTML = html; };
  if (!plan.add.length && !plan.gone.length) {
    const h = plan.have;
    stop(`<div class="note i">Nic nechybí: ${h === 1 ? `vložená položka ${from} už v seznamu z ${esc(shWhen(l))} je` : `${h <= 4 ? 'všechny' : 'všech'} ${h} ${shItemsN(h)} ${from} už v seznamu z ${esc(shWhen(l))} ${h <= 4 ? 'jsou' : 'je'}`}.</div>`);
    return;
  }
  const tag = i => (i.top ? ' <span class="tag sh-toptag">TOP</span>' : i.top2 ? ' <span class="tag sh-top2tag">TOP 2</span>' : '');
  const rows = plan.add.slice(0, 8).map(i => `<tr><td class="num">${esc(i.order || '—')}</td><td>${esc(i.name || '—')}${tag(i)}</td><td class="num">${esc(i.ean || '—')}</td><td class="r num">${esc(i.qty || '—')}</td></tr>`).join('');
  const goneN = plan.gone.length;
  const res = await dialog({
    title: 'Doplnit chybějící', ok: plan.add.length ? `Doplnit ${plan.add.length}` : 'Doplnit', wide: true,
    html: `<p>Do seznamu z <b>${esc(shWhen(l))}</b> ${from}: ${plan.add.length ? `<b>${plan.add.length} ${shPl(plan.add.length, 'položka chybí', 'položky chybí', 'položek chybí')}</b>` : `kromě ${goneN === 1 ? 'položky, kterou' : 'položek, které'} jsi ze seznamu odebral, nic nechybí`}${plan.have ? `, ${plan.have} ${shPl(plan.have, 'už v seznamu je', 'už v seznamu jsou', 'už v seznamu je')}` : ''}.</p>
      <p class="small muted">Položky, které v seznamu už jsou, zůstanou, jak jsou: pořadí, množství, TOP, oddělení, poznámky i poslední záznamy. Doplněné půjdou na konec své skupiny (TOP SHORTAGE, TOP 2, ostatní).</p>
      ${rows ? `<table class="wa-prev sh-mprev"><thead><tr><th>Objednávka</th><th>Název dílu</th><th>EAN</th><th class="r">Množství</th></tr></thead><tbody>${rows}</tbody></table>${plan.add.length > 8 ? `<p class="tiny muted">… a ${plan.add.length - 8} dalších</p>` : ''}` : ''}
      ${goneN ? `<label class="check sh-mgone"><input type="checkbox" name="back"><span>Vrátit i ${goneN} ${shPl(goneN, 'položku', 'položky', 'položek')}, ${goneN === 1 ? 'kterou' : 'které'} jsi ze seznamu odebral (${esc(plan.gone.slice(0, 3).map(i => i.ean || i.name).join(', '))}${goneN > 3 ? ' …' : ''}).</span></label>` : ''}`,
  });
  if (res.value !== 'ok') return;
  const back = !!(res.form && res.form.elements.namedItem('back') && res.form.elements.namedItem('back').checked);
  const fin = back ? shMergePlan(l, r.items, true) : plan;
  if (!fin.add.length) { stop(`<div class="note i">Nic se nedoplnilo: ${goneN} ${shPl(goneN, 'chybějící položku', 'chybějící položky', 'chybějících položek')} jsi ze seznamu dřív odebral.</div>`); return; }
  let add = fin.add.map(i => ({ ...i }));
  let planRes = null;
  if (ui.sh.plan) { const tmp = { items: add }; planRes = shApplyPlan(tmp, ui.sh.plan); add = tmp.items; }
  if (back) { const keys = new Set(fin.add.map(shItemKey)); l.gone = (l.gone || []).filter(k => !keys.has(k)); }
  l.items = shTopFirst([...l.items, ...add]);
  S.shortage = cleanShortage(S.shortage);   // id doplněných položek a poddílů
  ui.sh.merge = null;
  ui.sh.q = '';
  save();
  renderShortage();
  const n = fin.add.length, skipped = back ? 0 : goneN;
  const noLink = add.filter(i => !i.link).length, noCode = add.filter(i => i.link && !i.code).length;
  msg.innerHTML = `<div class="note i">${src.paste ? 'Vloženo' : 'Nahráno'} ${from}: do seznamu z <b>${esc(shWhen(l))}</b> ${n === 1 ? 'doplněna' : n <= 4 ? 'doplněny' : 'doplněno'} <b>${n} ${shItemsN(n)}</b>${fin.have ? `, ${fin.have} ${shPl(fin.have, 'už v seznamu byla', 'už v seznamu byly', 'už v seznamu bylo')} (beze změny)` : ''}${skipped ? `, ${skipped} ${shPl(skipped, 'odebraná se nevrátila', 'odebrané se nevrátily', 'odebraných se nevrátilo')}` : ''}.</div>${[
    src.plain && noLink ? 'Ve schránce byl jen text bez odkazů, doplněné položky proto nemají QR kód. Zkopíruj buňky přímo z Excelu (Ctrl+C), nebo nahraj soubor.' : '',
    !src.plain && noLink ? `${noLink} ${shPl(noLink, 'doplněná položka nemá', 'doplněné položky nemají', 'doplněných položek nemá')} hypertextový odkaz, v PDF ${noLink === 1 ? 'bude' : 'budou'} bez QR kódu.` : '',
    noCode ? `${noCode} ${shPl(noCode, 'doplněná položka má', 'doplněné položky mají', 'doplněných položek má')} odkaz bez activeBarcode, v PDF ${noCode === 1 ? 'bude' : 'budou'} bez QR kódu.` : '',
  ].filter(Boolean).map(t => `<div class="note w">${esc(t)}</div>`).join('')}${planRes ? shPlanNote(planRes, ui.sh.plan, true) : ''}`;
}
/** Pruh nad polem pro vložení: do kterého seznamu se doplňuje (2.36). */
function shMergeBar() {
  const bar = $('#shMergeBar');
  if (!bar) return;
  const l = ui.sh.merge && shc().lists.find(x => x.id === ui.sh.merge);
  if (!l) ui.sh.merge = null;
  bar.hidden = !l;
  $('#view-shortage .sh-paste').classList.toggle('merge', !!l);
  bar.innerHTML = l ? `<div><b>Doplnit chybějící do seznamu z ${esc(shWhen(l))}</b> · vlož tabulku z Excelu (Ctrl+V) do pole níže, nebo ji nahraj tlačítkem Nahrát Excel. Přidají se jen položky, které v seznamu chybí; nový seznam nevznikne.</div>
    <button class="btn ghost small" type="button" data-shmergeoff>Zrušit</button>` : '';
}
const SH_NONE = 'Čeká se číslo objednávky ve sloupci A, název dílu v B a EAN s odkazem v C (D index, E urgentní množství, G TOP, H probíhající operace).';

async function shImportFile(file, force = false) {
  if (!file) return;
  const msg = $('#shMsg');
  if (/\.(csv|txt)$/i.test(file.name)) {
    msg.innerHTML = '<div class="note w">CSV neobsahuje hypertextové odkazy, takže by v PDF chyběly QR kódy. Nahraj soubor Excelu (xlsx), nebo tabulku z Excelu vlož přes Ctrl+V.</div>';
    return;
  }
  ui.sh.last = { ...(ui.sh.last || {}), list: { file } };
  try {
    const X = await xlsx();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const wb = X.read(bytes, { type: 'array', cellHTML: false, cellStyles: true });
    // barvy z palety Excelu SheetJS nepřečte, doplní je shIndexedFills
    const idx = await shIndexedFills(bytes);
    Object.entries(idx).forEach(([name, map]) => { const ws = wb.Sheets[name]; if (ws) map.forEach((hex, ref) => { const c = ws[ref]; if (c && !(c.s && c.s.fgColor && c.s.fgColor.rgb)) c.s = { ...(c.s || {}), patternType: 'solid', fgColor: { rgb: hex } }; }); });
    const sheets = wb.SheetNames.map(name => ({ name, all: shSheetRows(X, wb.Sheets[name]) })).map(sh => ({ ...sh, rows: shTextRows(sh.all) }));
    // list s nejvíc položkami podle uložených (výchozích) sloupců
    let pick = 0, most = -1;
    sheets.forEach((sh, i) => { const n = shBuild(sh.all, shColsGuess('list', sh.rows, shColsOf('list')).cols).items.length; if (n > most) { most = n; pick = i; } });
    const how = await shColsFor('list', sheets, { file: file.name, pick, force });
    if (!how) return;
    const best = sheets[how.sheetI];
    const r = shBuild(best.all, how.cols);   // barvy přiřadí až vzorník
    if (!r.items.length) {
      msg.innerHTML = `<div class="note w">V souboru <b>${esc(file.name)}</b> není žádná položka. ${esc(SH_NONE)}</div>${shColsNote('list', how)}`;
      return;
    }
    if (r.fills.size) await shColorDialog(r);   // Bez barev = TOP jen podle textu ve sloupci TOP
    shTake(r, { file: file.name, sheet: wb.SheetNames.length > 1 ? best.name : '', cols: how });
  } catch (error) {
    msg.innerHTML = `<div class="note w">Soubor se nepodařilo otevřít: ${esc(error.message)}</div>`;
  }
}

/** Tabulka ze schránky → řádky pro shBuild. Excel do schránky dává i HTML, kde jsou odkazy
    buněk v <a href>; dokument z DOMParseru je netečný (nic nespouští ani nestahuje). Bez HTML
    zbude text oddělený tabulátory, ten odkazy nemá. */
function shClipRows(html, text) {
  if (html && /<t[dh][\s>]/i.test(html)) {
    // styly a skripty pryč: netečný dokument by je stejně nepoužil, jen by CSP hlásila porušení
    // barvy buněk (2.61): Excel je dává do tříd v <style> (.xl65 {background:#FF0000}) nebo do atributu style
    const cls = {};
    for (const m of html.matchAll(/\.(xl\d+)\s*\{([^}]*)\}/gi)) { const b = /background(?:-color)?\s*:\s*([^;]+)/i.exec(m[2]); if (b) cls[m[1].toLowerCase()] = b[1].trim(); }
    let src = html.replace(/<(style|script)[\s\S]*?<\/\1\s*>/gi, '').replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (m, v) => ` data-st=${v}`);
    // jen řádky bez <table> (výřez mezi StartFragment a EndFragment) by DOMParser zahodil
    if (!/<table[\s>]/i.test(src)) {
      const m = src.match(/<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/i);
      src = `<table>${m ? m[1] : src.replace(/^[\s\S]*?<body[^>]*>|<\/body>[\s\S]*$/gi, '')}</table>`;
    }
    const table = new DOMParser().parseFromString(src, 'text/html').querySelector('table');
    if (table) {
      return { plain: false, rows: [...table.rows].slice(0, 20001).map(tr => {
        const row = [];
        [...tr.cells].forEach(td => {
          td.querySelectorAll('br').forEach(br => br.replaceWith(' '));
          const a = td.querySelector('a[href]');
          const st = /background(?:-color)?\s*:\s*([^;"']+)/i.exec(td.getAttribute('data-st') || '');
          const bg = st ? st[1].trim() : cls[String(td.className || '').toLowerCase().split(/\s+/).find(k => cls[k]) || ''] || '';
          row.push({ text: td.textContent, link: a ? a.getAttribute('href').trim() : '', fill: shCssHex(bg) });
          for (let i = 1; i < Math.min(td.colSpan || 1, 8); i += 1) row.push({ text: '', link: '' });
        });
        return row.slice(0, 8);
      }) };
    }
  }
  return { plain: true, rows: shTsv(text).slice(0, 20001).map(r => r.slice(0, 8).map(t => ({ text: t, link: '' }))) };
}
/** Barva z CSS (#f00, #FF0000, red, rgb(…)) → HEX, jinak "". */
function shCssHex(v) {
  const t = String(v || '').trim();
  if (!t || /^(transparent|none|inherit|initial|white|#fff(fff)?)$/i.test(t)) return '';
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t);
  if (h) return shHex(h[1].length === 3 ? h[1].split('').map(x => x + x).join('') : h[1]);
  const probe = document.createElement('span');
  probe.style.color = t;
  if (!probe.style.color) return '';
  document.body.append(probe);
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(probe).color);
  probe.remove();
  return m ? shHex([m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('')) : '';
}
async function shPaste(html, text, force = false) {
  const msg = $('#shMsg');
  const clip = shClipRows(html, text);
  ui.sh.last = { ...(ui.sh.last || {}), [shLooksLikeRecs(clip.rows) ? 'move' : 'list']: { html, text } };
  // poslední záznamy (A QR kód, B datum a čas, C ks, D stav) se poznají podle data ve sloupci B
  if (shLooksLikeRecs(clip.rows)) {
    const how = await shColsFor('move', [{ name: 'schránka', rows: shTextRows(clip.rows) }], { file: 'vloženo ze schránky', force });
    if (how) shPasteRecs(clip.rows, { file: 'vloženo ze schránky', paste: true, cols: how });
    return;
  }
  const how = await shColsFor('list', [{ name: 'schránka', rows: shTextRows(clip.rows) }], { file: 'vloženo ze schránky', force });
  if (!how) return;
  const r = shBuild(clip.rows, how.cols);
  if (!r.items.length) {
    msg.innerHTML = `<div class="note w">Ve schránce není tabulka se seznamem. Označ v Excelu řádky seznamu (klidně i s nadpisy), zkopíruj je (Ctrl+C) a vlož sem (Ctrl+V). ${esc(SH_NONE)}</div>`;
    return;
  }
  if (r.fills.size) await shColorDialog(r);
  shTake(r, { file: 'vloženo ze schránky', paste: true, plain: clip.plain, cols: how });
}
/** Evidence pohybu ze souboru (2.61, 3. krok): xlsx i csv, sloupce navrhne AI z nadpisů. */
async function shMoveImport(file, force = false) {
  if (!file) return;
  const msg = $('#shMsg');
  ui.sh.last = { ...(ui.sh.last || {}), move: { file } };
  try {
    const X = await xlsx();
    const buf = new Uint8Array(await file.arrayBuffer());
    const wb = /\.(csv|txt)$/i.test(file.name) ? X.read(decodeText(buf.buffer), { type: 'string', raw: true }) : X.read(buf, { type: 'array', cellHTML: false, cellStyles: false });
    const sheets = wb.SheetNames.map(name => ({ name, all: shSheetRows(X, wb.Sheets[name], 40, -1) })).map(sh => ({ ...sh, rows: shTextRows(sh.all) }));
    let pick = 0, most = -1;
    sheets.forEach((sh, i) => { const n = shRecBuild(sh.all, shColsGuess('move', sh.rows, shColsOf('move')).cols).recs.size; if (n > most) { most = n; pick = i; } });
    const how = await shColsFor('move', sheets, { file: file.name, pick, force });
    if (!how) return;
    shPasteRecs(sheets[how.sheetI].all, { file: file.name, cols: how });
  } catch (error) {
    msg.innerHTML = `<div class="note w">Evidenci pohybu se nepodařilo otevřít: ${esc(error.message)}</div>`;
  }
}
/** Poslední záznamy (schránka nebo soubor evidence pohybu) k položkám otevřeného seznamu (podle QR kódu). */
function shPasteRecs(rows, src = {}) {
  const msg = $('#shMsg');
  const l = shList();
  const r = shRecBuild(rows, src.cols ? src.cols.cols : shColsOf('move'));
  if (!l) {
    msg.innerHTML = '<div class="note w">Vložené řádky vypadají jako poslední záznamy (A QR kód, B datum a čas, C počet ks, D stav), ale zatím tu není žádný seznam. Nejdřív nahraj nebo vlož seznam dílů.</div>';
    return;
  }
  if (!r.recs.size) {
    msg.innerHTML = '<div class="note w">Ve vložených řádcích není žádný QR kód. Čeká se A QR kód, B datum a čas, C počet ks a D stav.</div>';
    return;
  }
  const res = shApplyRecs(l, r.recs, { at: Date.now(), by: ui.me.label || '' });
  // 3. krok (2.61): odkud jsou záznamy
  if (res.matched) l.moves = { file: (src.file || 'vloženo ze schránky').slice(0, 160), at: Date.now(), by: ui.me.label || '', rows: r.rows };
  S.shortage = cleanShortage(S.shortage);   // id nově přidaných poddílů, sloupce
  if (res.updated || res.added || res.matched) save();
  renderShortage();
  const other = !res.matched ? shc().lists.find(x => x !== l && x.items.some(i => i.code && r.recs.has(i.code))) : null;
  const miss = res.missing.slice(0, 5).join(', ') + (res.missing.length > 5 ? ` a ${res.missing.length - 5} dalších` : '');
  const what = [res.updated ? `nový záznam u <b>${res.updated} ${res.updated === 1 ? 'položky' : 'položek'}</b>` : '', res.added ? `podle záznamu přidán${res.added === 1 ? '' : 'o'} <b>${res.added} ${shSubsN(res.added)}</b> s jinou operací` : ''].filter(Boolean).join(', ');
  msg.innerHTML = `<div class="note ${res.updated || res.added ? 'i' : 'w'}">Poslední záznamy k seznamu z <b>${esc(shWhen(l))}</b>: ${what || 'žádná položka se nezměnila'}.</div>${[
    res.wpa ? `${res.wpa} ${res.wpa === 1 ? 'poddíl má' : res.wpa <= 4 ? 'poddíly mají' : 'poddílů má'} záznam „Odesláno na WPA“, ${res.wpa === 1 ? 'nepřidal se' : 'nepřidaly se'}.` : '',
    res.same ? `${res.same} ${shPl(res.same, 'položka má', 'položky mají', 'položek má')} stejný záznam, beze změny.` : '',
    res.older ? `${res.older} ${shPl(res.older, 'vložený záznam je starší', 'vložené záznamy jsou starší', 'vložených záznamů je starších')} než uložený, ${res.older === 1 ? 'nepoužil se' : 'nepoužily se'}.` : '',
    res.missing.length ? `${res.missing.length} ${shPl(res.missing.length, 'kód v seznamu není', 'kódy v seznamu nejsou', 'kódů v seznamu není')}: ${miss}.` : '',
    other ? `Kódy patří k seznamu z ${shWhen(other)}. Otevři ho dole v Seznamech a vlož záznamy znovu.` : '',
    r.bad ? `${r.bad} ${shPl(r.bad, 'řádek nemá', 'řádky nemají', 'řádků nemá')} platný QR kód ve sloupci ${esc((src.cols && src.cols.cols.code) || 'A')}.` : '',
  ].filter(Boolean).map(t => `<div class="note w">${esc(t)}</div>`).join('')}${shColsNote('move', src.cols)}`;
}

/* ---------- Poddíly z výrobního plánu (2.29) ----------
   Čte se 2. list plánu proudem jako výrobní plán v KPI (waZip, waXlsxSst, waXlsxCells), jen
   sloupce A, E, H, M a AM. Odkaz u EANu poddílu (E) je v <hyperlinks> na konci listu a cíl
   v rels listu (2.29.1 i pro řádky s jinou operací: čekající poddíly přidá poslední záznam
   podle kódu). Jiné soubory (xls, ods) přečte SheetJS.
   Nahraný plán zůstane v paměti okna (ui.sh.plan) a prohledá se i u dalších seznamů. */
const SH_PC = { a: 0, e: 4, h: 7, m: 12, am: 38 };
async function shPlanFast(b, plan, progress, SH_PC = shPcOf(), sheetName = '') {
  const zip = waZip(b);
  const rels = {};
  const relXml = await waZipText(b, zip.get('xl/_rels/workbook.xml.rels'));
  for (const m of relXml.matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?>/g)) rels[waAttr(m[1], 'Id')] = waAttr(m[1], 'Target');
  const wbx = await waZipText(b, zip.get('xl/workbook.xml'));
  const sheets = [...wbx.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?>/g)].map(m => {
    const id = (/\s\w+:id="([^"]+)"/.exec(m[1]) || [])[1];
    const target = String(rels[id] || '');
    return { name: waAttr(m[1], 'name'), path: (target.startsWith('/') ? target.slice(1) : `xl/${target}`).replace(/\/\.\//g, '/').toLowerCase() };
  });
  const sh = (sheetName && sheets.find(x => x.name === sheetName)) || sheets[1] || sheets[0];
  const L = colLetter(SH_PC.e);   // sloupec EANu poddílu (odkazy)
  if (!sh || !zip.get(sh.path)) throw new Error('list nenalezen');
  plan.sheet = sh.name;
  const sst = await waXlsxSst(b, zip.get('xl/sharedstrings.xml'));
  const want = new Set(Object.values(SH_PC));
  const keep = [];
  const byRef = new Map();   // „E12“ → řádek, čeká na odkaz
  let last = -1;
  const rows = block => {
    let m;
    WA_ROW.lastIndex = 0;
    while ((m = WA_ROW.exec(block))) {
      const rr = +waAttr(m[1], 'r');
      const i = rr > 0 ? rr - 1 : last + 1;
      last = i;
      plan.total += 1;
      const v = waXlsxCells(m[2], sst, want);
      const a = v[SH_PC.a], e = v[SH_PC.e], op = v[SH_PC.am];
      if (a == null || e == null || e === '') continue;
      const x = { a, e, h: v[SH_PC.h], m: v[SH_PC.m], op, rid: '', link: '' };
      // vzorec HYPERLINK("…") v buňce E (hledá se jen v řádku, který nějaký vzorec má)
      const cell = (m[2] || '').includes('<f') && new RegExp(`<(?:\\w+:)?c\\b[^>]*\\br="${L}${i + 1}"[^>]*>([\\s\\S]*?)</(?:\\w+:)?c>`).exec(m[2] || '');
      const f = cell && /<(?:\w+:)?f\b[^>]*>([\s\S]*?)<\/(?:\w+:)?f>/.exec(cell[1]);
      const hl = f && /HYPERLINK\(\s*"([^"]+)"/i.exec(waXml(f[1]));
      if (hl) x.link = hl[1];
      keep.push(x);
      byRef.set(`${L}${i + 1}`, x);
    }
  };
  const links = block => {
    for (const m of block.matchAll(/<(?:\w+:)?hyperlink\b([^>]*?)\/?>/g)) {
      const ref = waAttr(m[1], 'ref').toUpperCase();
      const rid = (/\s\w+:id="([^"]+)"/.exec(m[1]) || [])[1] || '';
      if (!rid) continue;
      const [p, q] = ref.split(':');
      if (!q) { const x = byRef.get(p); if (x && !x.link) x.rid = rid; continue; }
      // oblast (E12:E20): jen sloupec EANu poddílu
      const re = new RegExp(`^${L}(\\d+)$`), r0 = re.exec(p), r1 = re.exec(q);
      if (r0 && r1) byRef.forEach((x, k) => { const n = +k.slice(L.length); if (n >= +r0[1] && n <= +r1[1] && !x.link) x.rid = rid; });
    }
  };
  const r = waZipReader(b, zip.get(sh.path));
  let buf = '';
  let tail = false;
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    buf += value;
    if (!tail) {
      const end = buf.search(/<\/(?:\w+:)?sheetData>/);
      if (end >= 0) { rows(buf.slice(0, end)); buf = buf.slice(end); tail = true; }
      else { const cut = waTagEnd(buf, 'row'); if (cut > 0) { rows(buf.slice(0, cut)); buf = buf.slice(cut); } }
      if (progress) await progress(plan.total);
    }
    if (tail) { const cut = buf.lastIndexOf('>'); if (cut >= 0) { links(buf.slice(0, cut + 1)); buf = buf.slice(cut + 1); } }
  }
  if (tail) links(buf); else rows(buf);
  // cíle odkazů z rels listu (jen potřebné)
  const need = new Set(keep.map(x => x.rid).filter(Boolean));
  if (need.size) {
    const slash = sh.path.lastIndexOf('/');
    const ent = zip.get(`${sh.path.slice(0, slash)}/_rels/${sh.path.slice(slash + 1)}.rels`);
    const target = new Map();
    if (ent) {
      const rr = waZipReader(b, ent);
      let t = '';
      const take = block => { for (const m of block.matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?>/g)) { const id = waAttr(m[1], 'Id'); if (need.has(id)) target.set(id, waAttr(m[1], 'Target')); } };
      for (;;) { const { done, value } = await rr.read(); if (done) break; t += value; const cut = t.lastIndexOf('>'); if (cut >= 0) { take(t.slice(0, cut + 1)); t = t.slice(cut + 1); } }
      take(t);
    }
    keep.forEach(x => { if (!x.link && x.rid) x.link = target.get(x.rid) || ''; });
  }
  keep.forEach(x => shPlanRow(plan, x.a, x.e, x.h, x.m, x.op, x.link));
}
/** Sloupce plánu jako indexy {a, e, h, m, am} (2.61: podle nastavení). */
function shPcOf(cols) {
  const x = shColIdx('plan', cols || shColsOf('plan'));
  return { a: x.asm, e: x.sub, h: x.index, m: x.order, am: x.op };
}
async function shPlanRead(file, progress, cols = null) {
  const b = new Uint8Array(await file.arrayBuffer());
  const plan = shPlanBlank(file.name);
  const pc = shPcOf(cols);
  const want = (cols || shColsOf('plan')).sheet || '';
  if (b[0] === 0x50 && b[1] === 0x4b && waDeflateRaw && !window.SH_PLAN_SHEETJS) {
    try { await shPlanFast(b, plan, progress, pc, want); return plan; } catch (error) { console.warn('Poddíly: rychlé čtení nevyšlo, čte SheetJS', error); }
  }
  const fresh = shPlanBlank(file.name);
  const X = await xlsx();
  const wb = X.read(b, { type: 'array', cellHTML: false, cellStyles: false });
  const name = (want && wb.SheetNames.includes(want) && want) || wb.SheetNames[1] || wb.SheetNames[0];
  const SH_PC = pc;
  const at0 = (r, c) => (c < 0 ? null : wb.Sheets[name][X.utils.encode_cell({ r, c })]);
  fresh.sheet = name || '';
  const ws = wb.Sheets[name];
  if (!ws || !ws['!ref']) return fresh;
  const range = X.utils.decode_range(ws['!ref']);
  const at = at0;
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const e = at(r, SH_PC.e);
    fresh.total += 1;
    shPlanRow(fresh, shCellText(at(r, SH_PC.a)), shCellText(e), shCellText(at(r, SH_PC.h)), shCellText(at(r, SH_PC.m)), shCellText(at(r, SH_PC.am)), shCellLink(e));
    if (progress && r % 5000 === 4999) await progress(fresh.total);
  }
  return fresh;
}
/** Poddíly z plánu k seznamu. Když plán k seznamu nic nenajde a seznam poddíly má, nechá je být. */
function shUsePlan(l, plan) {
  const copy = JSON.parse(JSON.stringify(l));
  const res = shApplyPlan(copy, plan);
  if (!res.items && l.items.some(i => (i.subs || []).length)) return { ...res, kept: true };
  l.items = copy.items;
  l.plan = { file: plan.file, at: plan.at, by: ui.me.label || '' };
  S.shortage = cleanShortage(S.shortage);   // id nových poddílů
  return res;
}
const shSubsN = n => (n === 1 ? 'poddíl' : n >= 2 && n <= 4 ? 'poddíly' : 'poddílů');
function shPlanNote(res, plan, auto) {
  const head = `${auto ? 'Poddíly podle výrobního plánu' : 'Výrobní plán'} <b>${esc(plan.file)}</b> (${plan.sheet ? `list ${esc(plan.sheet)}, ` : ''}${nf(plan.total)} řádků${auto ? `, nahraný v ${esc(shWhenText(plan.at).split(' ').pop())}` : ''})`;
  if (res.kept) return `<div class="note w">${head}: k položkám seznamu nenašel žádný poddíl, poddíly zůstaly beze změny.</div>`;
  return `<div class="note ${res.subs ? 'i' : 'w'}">${head}: ${res.subs ? `<b>${res.subs} ${shSubsN(res.subs)}</b> u ${res.items} ${res.items === 1 ? 'sestavy' : 'sestav'}` : 'k položkám seznamu žádný poddíl s operací Hala 2'}.</div>${[
    res.noCode ? `${res.noCode} ${res.noCode === 1 ? 'poddíl nemá' : res.noCode <= 4 ? 'poddíly nemají' : 'poddílů nemá'} u EANu odkaz s activeBarcode, v PDF ${res.noCode === 1 ? 'bude' : 'budou'} bez QR kódu.` : '',
    res.cands ? `${res.cands} ${res.cands === 1 ? 'poddíl' : res.cands <= 4 ? 'poddíly' : 'poddílů'} s jinou operací ${res.cands === 1 ? 'čeká' : 'čekají'} na poslední záznam: přidá ${res.cands === 1 ? 'ho' : 'je'} vložený záznam s ${res.cands === 1 ? 'jeho' : 'jejich'} QR kódem (kromě „Odesláno na WPA“).` : '',
    res.other && !res.cands ? `U ${res.other} ${res.other === 1 ? 'sestavy jsou' : 'sestav jsou'} v plánu poddíly jen s jinou operací a bez odkazu, ty se nevložily.` : '',
    !plan.rows.size && !plan.other.size ? `Ve ${plan.sheet ? `listu ${plan.sheet}` : 'souboru'} nejsou řádky plánu. Čeká se A EAN sestavy, E EAN poddílu, H index, M číslo objednávky a AM probíhající operace.` : '',
  ].filter(Boolean).map(t => `<div class="note w">${esc(t)}</div>`).join('')}`;
}
async function shPlanImport(file, force = false) {
  if (!file) return;
  const msg = $('#shMsg');
  if (/\.(csv|txt)$/i.test(file.name)) { msg.innerHTML = '<div class="note w">Výrobní plán nahraj jako soubor Excelu (xlsx): CSV nemá odkazy u EANů poddílů.</div>'; return; }
  ui.sh.last = { ...(ui.sh.last || {}), plan: { file } };
  // sloupce plánu (2.61): z prvních řádků listů navrhne AI, jinak odhad podle nadpisů
  msg.innerHTML = `<div class="note i">Čtu nadpisy výrobního plánu <b>${esc(file.name)}</b>…</div>`;
  let sheets = [];
  try {
    const book = await waPlanOpen(file, { quick: true });
    for (const sh of book) { const { head } = await sh.read({ top: 8 }); sheets.push({ name: sh.name, rows: head }); }
  } catch (error) { msg.innerHTML = `<div class="note w">Výrobní plán se nepodařilo otevřít: ${esc(error.message)}</div>`; return; }
  const saved = shColsOf('plan');
  let pick = saved.sheet ? sheets.findIndex(x => x.name === saved.sheet) : -1;
  if (pick < 0) pick = sheets.length > 1 ? 1 : 0;
  const how = await shColsFor('plan', sheets, { file: file.name, pick, force });
  if (!how) { msg.innerHTML = ''; return; }
  let tick = 0;
  msg.innerHTML = `<div class="note i">Čtu výrobní plán <b>${esc(file.name)}</b>…</div>`;
  const progress = async n => { if (Date.now() - tick > 250) { tick = Date.now(); msg.innerHTML = `<div class="note i">Čtu výrobní plán <b>${esc(file.name)}</b>: ${nf(n)} řádků…</div>`; await new Promise(res => setTimeout(res, 0)); } };
  let plan;
  try { plan = await shPlanRead(file, progress, how.cols); } catch (error) { msg.innerHTML = `<div class="note w">Výrobní plán se nepodařilo přečíst: ${esc(error.message)}</div>`; return; }
  ui.sh.plan = plan;
  const l = shList();
  if (!l) { S.shortage = cleanShortage(S.shortage); save(); renderShortage(); msg.innerHTML = `<div class="note i">Výrobní plán <b>${esc(plan.file)}</b> je načtený (${nf(plan.total)} řádků). Poddíly se doplní k seznamu, který nahraješ nebo vložíš.</div>${shColsNote('plan', how)}`; return; }
  const res = shUsePlan(l, plan);
  save();
  renderShortage();
  msg.innerHTML = shPlanNote(res, plan, false) + shColsNote('plan', how);
}

/** Stav tří kroků nad seznamem (2.61). */
function shStepsDraw(l) {
  const st = (n, done, text) => { const el = $(`#shSt${n}`); if (!el) return; el.textContent = text; el.closest('.sh-step').classList.toggle('done', !!done); };
  const pl = ui.sh.plan;
  st(1, l, l ? `${l.items.length} ${shItemsN(l.items.length)} · ${shWhen(l)}${l.file ? ` · ${l.file}` : ''}` : 'Tabulka z Excelu (soubor nebo Ctrl+V)');
  const subsN = l ? l.items.reduce((a, i) => a + (i.subs || []).length + (i.cands || []).length, 0) : 0;
  st(2, l && l.plan, l && l.plan ? `${l.plan.file} · ${subsN} ${shSubsN(subsN)}` : pl ? `${pl.file} načtený, čeká na seznam` : 'Poddíly sestav a probíhající operace');
  const recs = l ? l.items.filter(i => i.rec).length : 0;
  st(3, l && l.moves, l && l.moves ? `${l.moves.file} · záznam u ${recs} z ${l.items.length}` : 'Poslední interní záznamy (soubor nebo Ctrl+V)');
}
function renderShortage() {
  const box = $('#shView');
  if (!box || !S) return;
  shMergeBar();
  const c = shc();
  const l = shList();
  shStepsDraw(l);
  if (!l) {
    box.innerHTML = `<div class="card">${emptyState('Zatím žádný seznam', 'Tabulku z Excelu vlož přes Ctrl+V (do pole nahoře), nebo ji načti tlačítkem Nahrát Excel: ve sloupci A číslo objednávky, v B název dílu, v C EAN s vloženým odkazem, v D index, v E urgentní množství, v G „TOP“ pro TOP SHORTAGE a v H probíhající operace. Do QR kódu v PDF jde activeBarcode z odkazu.', '<button class="btn" type="button" data-shimport>Nahrát Excel</button> <button class="btn sec" type="button" data-shmanual>Přidat položku ručně</button>')}</div>`;
    return;
  }
  const n = l.items.length, coded = l.items.filter(i => i.code).length, top = l.items.filter(i => i.top).length, top2 = l.items.filter(i => i.top2).length, recs = l.items.filter(i => i.rec).length;
  const depts = c.depts || [];
  const dmap = shDeptMap(c);
  const dName = id => (depts.find(d => d.id === id) || {}).name || 'Nezařazeno';
  const subsN = l.items.reduce((a, i) => a + (i.subs || []).length, 0);
  const hidN = l.items.reduce((a, i) => a + (i.pdfHide ? 1 + (i.subs || []).length : (i.subs || []).filter(x => x.pdfHide).length), 0);
  const tiles = `<div class="stats">${[
    statTile('Seznam', esc(dayText(todayIso(l.at))), `nahráno v ${esc(shWhen(l).split(' ').pop())}${l.by ? ` · ${esc(l.by)}` : ''}`),
    statTile('Položek', String(n), subsN ? `+ ${subsN} ${shSubsN(subsN)} z plánu` : l.file ? esc(l.file) : 'chybějící díly'),
    statTile('TOP shortage', String(top), `${top ? 'v seznamu nahoře' : 'žádná'}${top2 ? ` · TOP 2: ${top2}` : ''}`, top ? 'crit' : top2 ? 'warn' : ''),
    statTile('S QR kódem', String(coded), coded === n ? 'všechny mají kód' : `bez kódu ${n - coded}`, coded === n ? '' : 'warn'),
    statTile('Poslední záznam', String(recs), recs ? `z ${n} položek` : 'vlož přes Ctrl+V'),
  ].join('')}</div>`;
  const recHtml = x => (x.rec ? `<div class="sh-rec">${x.rec.state ? `<span class="tag sh-state">${esc(x.rec.state)}</span>` : ''}${x.rec.qty ? `<b>${esc(/^[\d\s.,]+$/.test(x.rec.qty) ? `${x.rec.qty} ks` : x.rec.qty)}</b>` : ''}<span class="muted">${esc(x.rec.when)}</span></div>` : '');
  const eanHtml = x => `EAN ${x.link ? `<a href="${esc(x.link)}" target="_blank" rel="noopener noreferrer" draggable="false">${esc(x.ean || 'odkaz')}</a>` : esc(x.ean || '—')}`;
  const rowHtml = (i, j) => {
    const rec = recHtml(i);
    const dIn = shDeptOf(c, i, dmap);
    const self = [i.order, i.name, i.ean, i.index, i.op, i.code, i.note, i.rec ? i.rec.state : '', i.top ? 'top shortage' : '', i.top2 ? 'top 2' : '', depts.length ? dName(dIn) : ''].join(' ');
    // poddíly z výrobního plánu pod sestavou (2.29): při hledání se ukážou se sestavou
    const subs = (i.subs || []).map((x, k) => `<tr class="sh-sub${i.top ? ' sh-top' : i.top2 ? ' sh-top2' : ''}${x.pdfHide || i.pdfHide ? ' sh-pdfoff' : ''} data-shsub="${esc(x.id)}" data-shparent="${esc(i.id)}" data-shdeptrow="${esc(dIn || '-')}" data-shop="${esc(shOpKey(x.op))}" data-shrow="${esc([self, 'poddíl', x.ean, x.code, x.op, x.note, x.rec ? x.rec.state : ''].join(' ').toLowerCase())}">
      <td class="sh-gripc"></td>
      <td class="num muted" data-label="#">${j + 1}.${k + 1}</td>
      <td class="sh-ord sh-subord" data-label="Číslo objednávky"><span class="sh-subarrow" aria-hidden="true"></span>${esc(i.order || '—')}</td>
      <td class="name" data-label="Poddíl"><span class="tag sh-subtag">PODDÍL</span>${x.byRec ? ' <span class="tag sh-rectag" title="Operace není Hala 2, poddíl přidal poslední záznam">podle záznamu</span>' : ''}<div class="sh-ean">${eanHtml(x)}</div></td>
      <td data-label="Index">${esc(i.index || '—')}</td>
      <td class="num sh-qty" data-label="Urgentní množství"><span class="muted">—</span></td>
      <td class="sh-opc" data-label="Operace · poslední záznam">${esc(x.op || '—')}${recHtml(x)}</td>
      <td data-label="QR kód">${x.code ? `<span class="tag ok sh-code">${esc(x.code)}</span>` : '<span class="tag warn">bez kódu</span>'}</td>
      <td class="sh-notec" data-label="Poznámka">${shStSel(x, `poddílu ${x.ean || x.code}`)}<input type="text" class="sh-note" data-shnote="${esc(x.id)}" value="${esc(x.note || '')}" maxlength="300" placeholder="Dopsat poznámku" autocomplete="off" aria-label="Poznámka k poddílu ${esc(x.ean || x.code)}"></td>
      <td class="sh-actc">${shHideBtn(x)}<button class="icon-btn small" type="button" data-shdelsub="${esc(x.id)}" title="Odebrat poddíl" aria-label="Odebrat poddíl ${esc(x.ean || x.code)}">${I.x}</button></td></tr>`).join('');
    // sestava s poddíly je jen orientační: bez QR kódu a pole na poznámku (2.29.1), dokud ji uživatel nezobrazí plně (2.31)
    const asm = !!subs && !i.full;
    const fullBtn = subs ? `<button class="btn sec small sh-fullbtn${i.full ? ' on' : ''}" type="button" data-shfull="${esc(i.id)}" aria-pressed="${!!i.full}" title="${i.full ? 'Sestava se ukazuje i tiskne celá (QR kód, poslední záznam, kolonky). Klikni a bude zase jen orientační.' : 'Ukázat a tisknout sestavu celou: QR kód, poslední záznam, kolonky na psaní a poznámku'}">${i.full ? 'Jen orientačně' : 'Zobrazit plně'}</button>` : '';
    const qr = i.code ? `<span class="tag ok sh-code">${esc(i.code)}</span>` : '<span class="tag warn">bez kódu</span>';
    const topBtn = `<button class="btn sec small sh-topbtn${i.top ? ' on' : ''}" type="button" data-shtop="${esc(i.id)}" aria-pressed="${!!i.top}" title="${i.top ? 'Zrušit TOP SHORTAGE' : 'Označit jako TOP SHORTAGE (bude nahoře)'}" aria-label="${i.top ? 'Zrušit TOP SHORTAGE u' : 'Označit jako TOP SHORTAGE'} ${esc(i.ean || i.name)}">TOP</button>`
      + `<button class="btn sec small sh-topbtn sh-top2btn${i.top2 ? ' on' : ''}" type="button" data-shtop2="${esc(i.id)}" aria-pressed="${!!i.top2}" title="${i.top2 ? 'Zrušit TOP 2' : 'Označit jako TOP 2: zpracovat hned po TOP shortage'}" aria-label="${i.top2 ? 'Zrušit TOP 2 u' : 'Označit jako TOP 2'} ${esc(i.ean || i.name)}">TOP2</button>`;
    // oddělení položky (2.32): podle operace, nebo ručně jiné
    const auto = shAutoDept(c, i, dmap);
    const deptSel = depts.length ? `<label class="sh-deptpick"><span class="sr-only">Oddělení položky ${esc(i.ean || i.name)}</span><select data-shdept="${esc(i.id)}">
        <option value=""${i.dept ? '' : ' selected'}>Podle operace: ${esc(auto ? dName(auto) : 'nezařazeno')}</option>
        ${depts.map(d => `<option value="${esc(d.id)}"${i.dept === d.id ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}
        <option value="-"${i.dept === '-' ? ' selected' : ''}>Nezařazeno</option></select>${i.dept ? '<span class="tag sh-manual">ručně</span>' : ''}</label>` : '';
    return `<tr class="${i.top ? 'sh-top' : i.top2 ? 'sh-top2' : ''}${subs ? ' sh-hassub' : ''}${i.full ? ' sh-full' : ''}${i.pdfHide ? ' sh-pdfoff' : ''}" data-shid="${esc(i.id)}" data-shdeptrow="${esc(dIn || '-')}" data-shop="${esc(shOpKey(i.op))}" data-shsubops="${esc((i.subs || []).map(x => shOpKey(x.op)).join('|'))}" data-shrow="${esc([self, ...(i.subs || []).flatMap(x => [x.ean, x.code])].join(' ').toLowerCase())}">
      <td class="sh-gripc"><button type="button" class="sh-grip" data-shgrip="${esc(i.id)}" title="Přesunout: přetáhni myší, nebo šipkami nahoru a dolů" aria-label="Přesunout položku ${esc(i.ean || i.name)}">${SH_GRIP}</button></td>
      <td class="num muted" data-label="#">${j + 1}</td>
      <td class="sh-ord" data-label="Číslo objednávky">${esc(i.order || '—')}</td>
      <td class="name" data-label="Název dílu">${i.top ? '<span class="tag crit sh-toptag">TOP SHORTAGE</span> ' : i.top2 ? '<span class="tag sh-top2tag">TOP 2</span> ' : ''}${esc(i.name || '—')}${i.top2 ? '<div class="sh-top2note">Zpracovat hned po TOP shortage</div>' : ''}<div class="sh-ean">${eanHtml(i)}</div></td>
      <td data-label="Index">${esc(i.index || '—')}</td>
      <td class="num sh-qty" data-label="Urgentní množství"><b>${esc(i.qty || '—')}</b></td>
      <td class="sh-opc" data-label="Operace · poslední záznam">${esc(i.op || '—')}${rec}${deptSel}</td>
      <td data-label="QR kód">${asm ? '<span class="small muted">sestava</span>' : qr}${fullBtn ? `<div class="sh-fullc">${fullBtn}</div>` : ''}</td>
      <td class="sh-notec" data-label="Poznámka">${shStSel(i, `položky ${i.ean || i.name}`)}${asm ? (i.note ? `<span class="small">${esc(i.note)}</span>` : '') : `<input type="text" class="sh-note" data-shnote="${esc(i.id)}" value="${esc(i.note || '')}" maxlength="300" placeholder="Dopsat poznámku" autocomplete="off" aria-label="Poznámka k položce ${esc(i.ean || i.name)}">`}</td>
      <td class="sh-actc"><div class="sh-acts"><span class="sh-tiers">${topBtn}</span>${shHideBtn(i)}<button class="icon-btn small" type="button" data-shdelitem="${esc(i.id)}" title="Odebrat položku" aria-label="Odebrat položku ${esc(i.ean || i.name)}">${I.x}</button></div></td></tr>${subs}`;
  };
  // bloky podle oddělení (2.32), čísla v pořadí zobrazení
  let num = 0;
  const rows = shSections(c, l.items).map(sec => `${depts.length ? `<tr class="sh-depthead" data-shdepthead="${esc(sec.id || '-')}"><td colspan="10"><b>${esc(sec.name)}</b><span class="muted small"> · ${sec.items.length} ${shItemsN(sec.items.length)}</span></td></tr>` : ''}${sec.items.map(i => rowHtml(i, num++)).join('')}`).join('');
  // filtr podle probíhající operace (2.31): víc operací najednou, platí i pro PDF
  const ops = shOpList(l);
  const sel = shOpSel(l);
  const opChips = ops.length > 1 ? `<div class="sh-ops"><span class="small muted">Probíhající operace</span><div class="chips" role="group" aria-label="Filtr podle probíhající operace">
        <button type="button" class="chip${sel ? '' : ' on'}" data-shop="" aria-pressed="${!sel}">Všechny</button>
        ${ops.map(o => `<button type="button" class="chip${sel && sel.has(o.key) ? ' on' : ''}" data-shop="${esc(o.key)}" aria-pressed="${!!(sel && sel.has(o.key))}">${esc(o.label)} <span class="sh-opn">${o.n}</span></button>`).join('')}</div>
      ${sel ? `<p class="tiny muted">Ukázané jsou položky a poddíly s vybranou operací (sestava i kvůli poddílu). PDF k tisku vytiskne jen je.</p>` : ''}</div>` : '';
  // oddělení (2.32): nastavení si systém pamatuje pro všechny seznamy; filtr podle oddělení
  const allOps = shOpsAll(c);
  const curOps = new Map(ops.map(o => [o.key, o.n]));
  const loose = ops.filter(o => !dmap.has(o.key)).length;
  const deptPanel = `<details class="card sh-depts" id="shDepts"${ui.sh.deptOpen ? ' open' : ''}>
      <summary><b>Oddělení</b> <span class="small muted">${depts.length ? `${depts.length} ${depts.length === 1 ? 'oddělení' : 'oddělení'} · ${loose ? `${loose} ${loose === 1 ? 'operace' : loose <= 4 ? 'operace' : 'operací'} seznamu bez oddělení` : 'všechny operace seznamu mají oddělení'}` : 'zatím žádná: založ oddělení a přiřaď jim probíhající operace'}</span></summary>
      <div class="sh-deptbody">
        <div class="sh-deptlist">
          ${depts.map(d => `<div class="sh-deptrow"><input type="text" value="${esc(d.name)}" maxlength="60" data-shdeptname="${esc(d.id)}" aria-label="Název oddělení ${esc(d.name)}" autocomplete="off"><span class="small muted">${d.ops.length} ${d.ops.length === 1 ? 'operace' : d.ops.length >= 2 && d.ops.length <= 4 ? 'operace' : 'operací'}</span><button class="icon-btn small" type="button" data-shdeptdel="${esc(d.id)}" title="Smazat oddělení" aria-label="Smazat oddělení ${esc(d.name)}">${I.x}</button></div>`).join('')}
          <div class="sh-deptrow sh-deptnew"><input type="text" id="shDeptNew" maxlength="60" placeholder="Nové oddělení (třeba Brus)" aria-label="Název nového oddělení" autocomplete="off"><button class="btn sec small" type="button" data-shdeptadd>Přidat oddělení</button></div>
        </div>
        ${allOps.length ? `<div class="sh-optab" role="list" aria-label="Probíhající operace a jejich oddělení"><div class="sh-ophead" aria-hidden="true"><span>Probíhající operace</span><span class="num">V seznamu</span><span>Oddělení</span></div>${allOps.map(o => `<div class="sh-oprow${dmap.has(o.key) ? '' : ' sh-oploose'}" role="listitem"><span>${esc(o.label)}</span><span class="num">${curOps.get(o.key) || '—'}</span><select data-shopdept="${esc(o.key)}" data-shoplabel="${esc(o.label)}" aria-label="Oddělení operace ${esc(o.label)}"${depts.length ? '' : ' disabled'}><option value="">— bez oddělení —</option>${depts.map(d => `<option value="${esc(d.id)}"${dmap.get(o.key) === d.id ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>`).join('')}</div>` : '<p class="small muted">Operace se objeví po nahrání seznamu.</p>'}
        <p class="tiny muted">Nastavení platí pro všechny seznamy, i pro další nahrané. Položka jde do oddělení podle své probíhající operace (sestava bez zařazené operace podle poddílu). Jinam ji přesuneš výběrem pod operací v řádku, nebo přetažením myší do jiného oddělení.</p>
      </div></details>`;
  const secs = shSections(c, l.items);
  const dsel = shDeptSel(l);
  const deptChips = depts.length ? `<div class="sh-ops sh-deptf"><span class="small muted">Oddělení</span><div class="chips" role="group" aria-label="Filtr podle oddělení">
        <button type="button" class="chip${dsel ? '' : ' on'}" data-shdf="" aria-pressed="${!dsel}">Všechna</button>
        ${secs.map(x => { const k = x.id || '-'; return `<button type="button" class="chip${dsel && dsel.has(k) ? ' on' : ''}" data-shdf="${esc(k)}" aria-pressed="${!!(dsel && dsel.has(k))}">${esc(x.name)} <span class="sh-opn">${x.items.length}</span></button>`; }).join('')}</div></div>` : '';
  const pl = ui.sh.plan;
  const planInfo = l.plan ? `Poddíly podle výrobního plánu ${esc(l.plan.file)} (${esc(shWhenText(l.plan.at))}): ${subsN} ${shSubsN(subsN)}.` : 'Poddíly sestav doplníš tlačítkem Výrobní plán nahoře.';
  const planUse = pl && (!l.plan || l.plan.at !== pl.at) ? ` <button class="btn sec small" type="button" data-shplanuse>Najít poddíly v plánu ${esc(pl.file)}</button>` : '';
  const older = c.lists.length > 1 ? `<section class="card sh-lists"><h3>Seznamy</h3><div class="chips">${c.lists.map(x => `<button type="button" class="chip${x.id === l.id ? ' on' : ''}" data-shopen="${esc(x.id)}" aria-pressed="${x.id === l.id}">${esc(shWhen(x))} · ${x.items.length}</button>`).join('')}</div>
      <p class="tiny muted">Drží se posledních ${SH_MAX_LISTS} nahraných seznamů.</p></section>` : '';
  const mode = `<div class="chips sh-mode noprint" role="group" aria-label="Pohled"><button type="button" class="chip${ui.sh.mode === 'rozbor' ? '' : ' on'}" data-shmode="list" aria-pressed="${ui.sh.mode !== 'rozbor'}">Seznam a tisk</button><button type="button" class="chip${ui.sh.mode === 'rozbor' ? ' on' : ''}" data-shmode="rozbor" aria-pressed="${ui.sh.mode === 'rozbor'}">Rozbor položek</button></div>`;
  if (ui.sh.mode === 'rozbor') { box.innerHTML = `${tiles}${mode}${shRozborHtml(l)}${older}`; return; }
  box.innerHTML = `${tiles}${mode}${deptPanel}<article class="card sh-card">
      <div class="card-head"><div><h2>Seznam z ${esc(shWhen(l))}</h2>
        <p class="small muted">${n} ${shItemsN(n)}${subsN ? ` · ${subsN} ${shSubsN(subsN)}` : ''}${top ? ` · ${top} TOP` : ''}${l.file ? ` · ${esc(l.file)}` : ''}${l.sheet ? ` · list ${esc(l.sheet)}` : ''}${l.by ? ` · nahrál ${esc(l.by)}` : ''}${hidN ? ` · <b>${hidN} skryt${hidN === 1 ? 'á' : hidN <= 4 ? 'é' : 'ých'} v PDF</b>` : ''}</p></div>
        <div class="row gap wrap sv-actions"><label class="sh-search"><span class="sr-only">Hledat v seznamu</span><input type="search" id="shQ" value="${esc(ui.sh.q)}" placeholder="Hledat objednávku, díl, EAN, operaci" autocomplete="off"></label>
          <button class="btn sec small" type="button" data-shmanual title="Zadat položku ručně: EAN, číslo objednávky, odkaz…">Přidat položku</button>
          <button class="btn sec small${ui.sh.merge === l.id ? ' on' : ''}" type="button" data-shmerge="${esc(l.id)}" aria-pressed="${ui.sh.merge === l.id}" title="Znovu vložit urgenty: do tohoto seznamu se přidají jen položky, které v něm chybí">Doplnit chybějící</button>
          <button class="btn small" type="button" data-shpdf="${esc(l.id)}"${n ? '' : ' disabled'}>${dsel ? (sel ? 'PDF k tisku · vybraná oddělení a operace' : 'PDF k tisku · vybraná oddělení') : sel ? 'PDF k tisku · vybrané operace' : 'PDF k tisku'}</button>
          ${depts.length ? `<button class="btn sec small" type="button" data-shpdfdept="${esc(l.id)}"${n ? '' : ' disabled'} title="Každé oddělení začne na novém papíře, s vlastním záhlavím a číslováním">PDF po odděleních${dsel ? ' · vybraná' : ''}</button>` : ''}
          <button class="icon-btn" type="button" data-shdel="${esc(l.id)}" title="Smazat seznam" aria-label="Smazat seznam z ${esc(shWhen(l))}">${I.x}</button></div></div>
      <p class="tiny muted sh-hint">Pořadí změníš přetažením řádku myší (na telefonu za úchyt vlevo), poddíly jdou se sestavou. TOP SHORTAGE zůstávají nahoře, pod nimi TOP 2 (zpracovat hned po TOP shortage); tlačítka TOP a TOP2 na konci řádku je označí nebo odznačí ručně. S oddělením jde řádek přetáhnout i do jiného oddělení. Poslední záznamy vlož přes Ctrl+V: A QR kód, B datum a čas, C počet ks, D stav. Oko na konci řádku položku skryje v PDF (sestavu i s poddíly). Sestavu s poddíly ukáže celou (QR kód, záznam, kolonky) tlačítko Zobrazit plně.</p>
      <p class="small sh-planinfo">${planInfo}${planUse}</p>
      ${deptChips}${opChips}
      <div class="table-card flat"><table class="stack sh-tab"><thead><tr><th class="sh-gripc"><span class="sr-only">Přesunout</span></th><th>#</th><th>Číslo objednávky</th><th>Název dílu · EAN</th><th>Index</th><th class="num">Urgentní množství</th><th>Operace · poslední záznam</th><th>QR kód</th><th>Poznámka</th><th class="sh-actc"><span class="sr-only">Odebrat</span></th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="tiny muted sh-none"${n ? ' hidden' : ''}>${n ? 'Nic neodpovídá hledání.' : 'V seznamu nezbyla žádná položka.'}</p>
    </article>${older}`;
  shFilter();
}
/* ---------- Rozbor položek (2.61): ke každé položce probíhající operace, poslední záznam,
   interní záznam ano / ne a všechny poddíly sestavy (i s jinou operací než Hala 2). ---------- */
function shRozborHtml(l) {
  const items = l.items;
  const withRec = items.filter(i => i.rec).length;
  const asm = items.filter(i => shAnalysis(i).subs.length).length;
  const empty = items.filter(i => !i.note).length;
  const recLine = (r, a) => (r ? `<span class="tag ok">záznam</span> ${esc(a.recText(r))}${r.n > 1 ? ` <span class="muted">(${r.n} ${r.n <= 4 ? 'záznamy' : 'záznamů'})</span>` : ''}` : '<span class="tag warn">bez záznamu</span>');
  const cards = items.map((i, j) => {
    const a = shAnalysis(i);
    const subs = a.subs.length ? `<table class="sh-rzsubs"><thead><tr><th>Poddíl · EAN</th><th>Operace</th><th>Poslední záznam</th></tr></thead><tbody>${a.subs.map((x, k) => `<tr class="${x.hall ? '' : 'sh-rzother'}"><td><span class="muted">${j + 1}.${k + 1}</span> ${esc(x.ean || '—')}${x.code ? ` <span class="tag sh-code">${esc(x.code)}</span>` : ''}${x.byRec ? ' <span class="tag sh-rectag">podle záznamu</span>' : ''}</td><td>${esc(x.op || '—')}${x.hall ? '' : ' <span class="small muted">mimo Halu 2</span>'}</td><td>${recLine(x.rec, a)}</td></tr>`).join('')}</tbody></table>` : '';
    return `<article class="sh-rz${i.top ? ' sh-top' : i.top2 ? ' sh-top2' : ''}" data-shrz="${esc(i.id)}">
      <header><span class="muted">${j + 1}.</span> ${i.top ? '<span class="tag crit sh-toptag">TOP SHORTAGE</span>' : i.top2 ? '<span class="tag sh-top2tag">TOP 2</span>' : ''} <b>${esc(i.name || '—')}</b> <span class="small muted">EAN ${esc(i.ean || '—')} · obj. ${esc(i.order || '—')}${i.index ? ` · index ${esc(i.index)}` : ''} · ${esc(i.qty || '—')} ks</span></header>
      <dl class="sh-rzgrid">
        <div><dt>Probíhající operace</dt><dd>${a.cur ? esc(a.cur) : '<span class="muted">neuvedena</span>'}</dd></div>
        <div><dt>Poslední dokončená · interní záznam</dt><dd>${recLine(i.rec, a)}</dd></div>
        <div><dt>Poddíly</dt><dd>${a.subs.length ? `${a.subs.length}${a.noRec ? ` · <span class="sh-rzwarn">${a.noRec} bez záznamu</span>` : ' · všechny se záznamem'}` : '<span class="muted">díl bez poddílů</span>'}</dd></div>
      </dl>
      ${subs}
      <p class="small sh-rznote"><b>Poznámka:</b> ${i.note ? esc(i.note) : `<span class="muted">prázdná · návrh: ${esc(a.note)}</span>`}</p>
    </article>`;
  }).join('');
  return `<section class="card sh-rozbor">
    <div class="card-head"><div><h2>Rozbor položek</h2><p class="small muted">${items.length} ${shItemsN(items.length)} · interní záznam u ${withRec} · ${asm} ${asm === 1 ? 'sestava' : asm <= 4 && asm ? 'sestavy' : 'sestav'} s poddíly${l.plan ? '' : ' · výrobní plán nenahrán (krok 2)'}${l.moves ? '' : ' · evidence pohybu nenahrána (krok 3)'}</p></div>
      <div class="row gap wrap"><button class="btn sec small" type="button" data-shanote${empty ? '' : ' disabled'} title="Do prázdných poznámek zapíše rozbor (probíhá, poslední záznam, poddíly); vyplněné poznámky zůstanou">Zapsat rozbor do prázdných poznámek${empty ? ` (${empty})` : ''}</button><button class="btn small" type="button" data-shaxlsx>Rozbor do Excelu</button></div></div>
    <div class="sh-rzlist">${cards}</div></section>`;
}
function shAnalysisToNotes() {
  const l = shList();
  if (!l) return;
  let n = 0;
  l.items.forEach(i => { if (!i.note) { i.note = shAnalysis(i).note; n += 1; } });
  if (!n) { toast('Všechny položky už poznámku mají.'); return; }
  save();
  renderShortage();
  toast(`Rozbor zapsán do ${n} ${shPl(n, 'poznámky', 'poznámek', 'poznámek')}.`);
}
async function exportShAnalysisXlsx() {
  const l = shList();
  if (!l) return;
  try {
    const X = await xlsx();
    const wb = X.utils.book_new();
    const sh = shAnalysisSheet(l);
    const ws = X.utils.aoa_to_sheet(sh.rows.map(row => row.map(safeCell)));
    ws['!cols'] = sh.cols.map(wch => ({ wch }));
    X.utils.book_append_sheet(wb, ws, sh.name);
    downloadFile(`shortage-rozbor-${todayIso(l.at)}.xlsx`, new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch (error) { toast(`Export se nepovedl: ${error.message}`, true); }
}
/* Rychlé tlačítko „Skrýt v PDF“ (2.29.1): položka i poddíl zůstanou v aplikaci, jen se nevytisknou. */
const SH_EYE = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></svg>';
const SH_EYE_OFF = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a17 17 0 0 1-3.2 3.9M6.2 6.6C3.9 8.3 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1"/><path d="M9.9 9.9a2.8 2.8 0 0 0 4.2 4.2"/></svg>';
// Ruční zadání položky (2.65): do otevřeného seznamu, bez seznamu založí nový „zadáno ručně“
async function shManualDialog() {
  const l = shList();
  const res = await dialog({
    title: l ? `Přidat položku · seznam ${shWhen(l)}` : 'Přidat položku · nový seznam', ok: 'Přidat položku', wide: true,
    html: `<div class="form-grid tk-grid">
        <label class="field"><span>EAN</span><input name="ean" maxlength="60" autofocus autocomplete="off"></label>
        <label class="field"><span>Číslo objednávky</span><input name="order" maxlength="80" autocomplete="off"></label>
        <label class="field"><span>Název dílu</span><input name="name" maxlength="200" autocomplete="off"></label>
        <label class="field"><span>Index</span><input name="index" maxlength="40" autocomplete="off"></label>
        <label class="field"><span>Urgentní množství</span><input name="qty" maxlength="40" inputmode="numeric" autocomplete="off"></label>
        <label class="field"><span>Probíhající operace</span><input name="op" maxlength="300" autocomplete="off"></label>
      </div>
      <label class="field"><span>Odkaz (do QR kódu jde activeBarcode z odkazu)</span><input name="link" maxlength="2000" type="url" placeholder="https://…" autocomplete="off"></label>
      <div class="form-grid tk-grid">
        <label class="field"><span>Priorita</span><select name="tier"><option value="">Shortage</option><option value="top">TOP SHORTAGE</option><option value="top2">TOP 2</option></select></label>
        <label class="field"><span>Stav</span><select name="st"><option value="">Bez stavu</option>${SH_ST.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span>Poznámka</span><input name="note" maxlength="300" autocomplete="off"></label>`,
    validate: form => {
      const f = form.elements;
      if (!f.ean.value.trim() && !f.name.value.trim()) return 'Vyplň aspoň EAN nebo název dílu.';
      if (f.link.value.trim() && !shLink(f.link.value)) return 'Odkaz musí začínat http:// nebo https:// (nebo www.).';
      return '';
    },
  });
  if (res.value !== 'ok') return;
  const f = res.form.elements, v = n => f[n].value.trim();
  const now = Date.now(), by = ui.me.label || '';
  const it = { order: v('order'), name: v('name'), ean: v('ean'), index: v('index'), qty: v('qty'), op: v('op'), link: v('link'), note: v('note'), top: f.tier.value === 'top', top2: f.tier.value === 'top2', ...(f.st.value ? { st: f.st.value, stAt: now, stBy: by } : {}) };
  const c = shc();
  let target = l;
  if (target) target.items.push(it);
  else { c.lists.unshift({ id: '', at: now, by, file: 'zadáno ručně', sheet: '', items: [it] }); }
  S.shortage = cleanShortage(c);
  if (!target) ui.sh.open = S.shortage.lists[0].id;
  save();
  renderShortage();
  toast(`Položka ${it.ean || it.name} přidána${it.top ? ' jako TOP SHORTAGE' : it.top2 ? ' jako TOP 2' : ''}.`);
}
// Stav položky (2.65): výběr v řádku, barva podle stavu
function shStSel(x, what) {
  return `<label class="sh-stpick"><span class="sr-only">Stav ${esc(what)}</span><select class="sh-stsel${x.st ? ` st-${x.st}` : ''}" data-shst="${esc(x.id)}" title="${x.st ? esc(`${shStName(x.st)}${x.stBy ? ` · ${x.stBy}` : ''}${x.stAt ? ` · ${tsText(x.stAt)}` : ''}`) : 'Zadat stav'}">
    <option value=""${x.st ? '' : ' selected'}>Bez stavu</option>${SH_ST.map(([k, l]) => `<option value="${k}"${x.st === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
}
function shHideBtn(x) {
  const off = x.pdfHide === true;
  return `<button class="icon-btn small sh-hidebtn${off ? ' on' : ''}" type="button" data-shpdfhide="${esc(x.id)}" aria-pressed="${off}" title="${off ? 'Skryto v PDF: klikni a znovu se vytiskne' : 'Skrýt v PDF'}" aria-label="${off ? 'Zobrazit v PDF' : 'Skrýt v PDF'} ${esc(x.ean || x.name || x.code || '')}">${off ? SH_EYE_OFF : SH_EYE}</button>`;
}
const SH_GRIP = '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
/* Vybraná oddělení filtru (id, „-“ = nezařazeno), která v seznamu jsou (Set), jinak null = všechna (2.32). */
function shDeptSel(l) {
  const c = shc();
  if (!(c.depts || []).length) return null;
  const keys = new Set(shSections(c, l.items).map(x => x.id || '-'));
  const sel = (ui.sh.depts || []).filter(k => keys.has(k));
  return sel.length ? new Set(sel) : null;
}
/** Položky do PDF podle filtru oddělení. */
function shDeptPick(items, sel) {
  if (!sel) return items;
  const c = shc();
  const map = shDeptMap(c);
  return items.filter(i => sel.has(shDeptOf(c, i, map) || '-'));
}
/* Vybrané operace filtru, které v seznamu jsou (Set), jinak null = všechny. */
function shOpSel(l) {
  const keys = new Set(shOpList(l).map(o => o.key));
  const sel = (ui.sh.ops || []).filter(k => keys.has(k));
  return sel.length ? new Set(sel) : null;
}
function shFilter() {
  const q = (ui.sh.q || '').trim().toLowerCase();
  const l = shList();
  const ops = l ? shOpSel(l) : null;
  const ds = l ? shDeptSel(l) : null;
  let shown = 0;
  const rows = $$('#shView [data-shrow]');
  rows.forEach(tr => {
    let on = !q || tr.dataset.shrow.includes(q);
    if (on && ds) on = ds.has(tr.dataset.shdeptrow);
    // poddíl jen se svou operací, sestava i kvůli poddílu (jako shOpPick v PDF)
    if (on && ops) on = ops.has(tr.dataset.shop) || (!tr.dataset.shsub && (tr.dataset.shsubops || '').split('|').some(k => ops.has(k)));
    tr.hidden = !on;
    if (on) shown += 1;
  });
  const none = $('#shView .sh-none');
  if (none && rows.length) none.hidden = shown > 0;
  // nadpis oddělení jen s viditelnými řádky
  $$('#shView tr.sh-depthead').forEach(h => { let r = h.nextElementSibling, any = false; while (r && !r.classList.contains('sh-depthead')) { if (!r.hidden) any = true; r = r.nextElementSibling; } h.hidden = !any; });
  // při hledání a filtru se nepřesouvá (skryté řádky by pořadí zmátly)
  const tab = $('#shView table.sh-tab');
  if (tab) tab.classList.toggle('sh-nodrag', !!q || !!ops || !!ds);
}

/* ---------- Přesouvání položek: myší kdekoli na řádku, dotykem za úchyt, šipkami na úchytu ---------- */
let shDrag = null;
function shDragDown(event) {
  const tr = event.target.closest('#shView tbody tr[data-shid]');
  if (!tr || event.button !== 0 || (ui.sh.q || '').trim() || (shList() && (shOpSel(shList()) || shDeptSel(shList())))) return;
  const grip = event.target.closest('[data-shgrip]');
  if (!grip && (event.pointerType !== 'mouse' || event.target.closest('a, button, input, textarea, select, label'))) return;
  if (grip) event.preventDefault();
  shDrag = { id: tr.dataset.shid, tr, pid: event.pointerId, y0: event.clientY, y: event.clientY, on: false, to: null, vy: 0, timer: 0 };
  window.addEventListener('pointermove', shDragMove);
  window.addEventListener('pointerup', shDragEnd);
  window.addEventListener('pointercancel', shDragEnd);
}
function shDragMove(event) {
  const d = shDrag;
  if (!d || event.pointerId !== d.pid) return;
  d.y = event.clientY;
  if (!d.on) {
    if (Math.abs(d.y - d.y0) < 6) return;
    d.on = true;
    d.tr.classList.add('sh-dragging');
    $$(`#shView tr[data-shparent="${CSS.escape(d.id)}"]`).forEach(r => r.classList.add('sh-dragging'));
    document.body.classList.add('sh-drag');
    try { d.tr.setPointerCapture(d.pid); } catch (error) { /* bez zachycení */ }
    // u okraje okna se stránka posouvá sama, ať jde položku přetáhnout i daleko
    d.timer = setInterval(() => { if (d.vy) { window.scrollBy(0, d.vy); shDragMark(); } }, 30);
  }
  event.preventDefault();
  d.vy = d.y < 70 ? -16 : d.y > window.innerHeight - 70 ? 16 : 0;
  shDragMark();
}
/* Oddělení řádku v tabulce: nejbližší nadpis nad ním („-“ = nezařazeno), bez oddělení "". */
function shRowDept(tr) {
  let x = tr;
  while (x && !(x.classList && x.classList.contains('sh-depthead'))) x = x.previousElementSibling;
  return x ? (x.dataset.shdepthead === '-' ? '' : x.dataset.shdepthead) : null;
}
function shDragMark() {
  const d = shDrag, l = shList();
  if (!d || !l) return;
  const it = l.items.find(i => i.id === d.id);
  if (!it) return;
  // cíl: první položka nebo nadpis oddělení pod kurzorem (poddíly patří k sestavě)
  const marks = $$('#shView tbody tr[data-shid], #shView tbody tr.sh-depthead').filter(r => r !== d.tr);
  const target = marks.find(r => { const b = r.getBoundingClientRect(); return d.y < b.top + b.height / 2; }) || null;
  const own = shDeptOf(shc(), it);
  let drop;
  if (target && target.dataset.shid) drop = { dept: shRowDept(target) ?? own, before: target.dataset.shid };
  else if (target) {
    // nadpis: konec oddělení nad ním; nad prvním nadpisem začátek prvního oddělení
    const above = target.previousElementSibling ? shRowDept(target.previousElementSibling) : null;
    if (above != null) drop = { dept: above, before: null };
    else { let n = target.nextElementSibling; while (n && !n.dataset.shid) n = n.nextElementSibling; drop = { dept: shRowDept(target) ?? own, before: n && n !== d.tr ? n.dataset.shid : null }; }
  } else {
    const heads = $$('#shView tbody tr.sh-depthead');
    drop = { dept: heads.length ? shRowDept(heads[heads.length - 1]) : own, before: null };
  }
  d.drop = drop;
  const all = $$('#shView tbody tr');
  all.forEach(r => r.classList.remove('sh-drop-before', 'sh-drop-after'));
  // čára nad položkou nebo nadpisem, před který položka padne; na konci pod posledním řádkem (i poddílem)
  if (target) target.classList.add('sh-drop-before');
  else if (all.length) all[all.length - 1].classList.add('sh-drop-after');
}
function shDragEnd(event) {
  const d = shDrag;
  if (!d || (event && event.pointerId !== d.pid)) return;
  shDrag = null;
  window.removeEventListener('pointermove', shDragMove);
  window.removeEventListener('pointerup', shDragEnd);
  window.removeEventListener('pointercancel', shDragEnd);
  clearInterval(d.timer);
  document.body.classList.remove('sh-drag');
  if (!d.on) return;
  // kliknutí po puštění myši nic nespustí
  const block = e => { e.preventDefault(); e.stopPropagation(); };
  window.addEventListener('click', block, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', block, { capture: true }), 80);
  const l = shList();
  if (event.type !== 'pointercancel' && l && d.drop && shDrop(shc(), l, d.id, d.drop.dept, d.drop.before)) save();
  renderShortage();
}
function shGripKey(event) {
  const grip = event.target.closest('[data-shgrip]');
  if (!grip || !['ArrowUp', 'ArrowDown'].includes(event.key) || (ui.sh.q || '').trim()) return;
  const l = shList();
  const it = l ? l.items.find(i => i.id === grip.dataset.shgrip) : null;
  if (!it) return;
  event.preventDefault();
  // o jedno místo v oddělení, jak je vidět v tabulce
  const c = shc();
  const dIn = shDeptOf(c, it);
  const same = (shSections(c, l.items).find(x => (x.id || '') === dIn) || { items: [] }).items;
  const k = same.indexOf(it);
  const up = event.key === 'ArrowUp';
  if ((up && k <= 0) || (!up && k >= same.length - 1)) return;
  const before = up ? same[k - 1].id : (same[k + 2] ? same[k + 2].id : null);
  if (shDrop(c, l, it.id, dIn, before)) {
    save();
    renderShortage();
    const again = $(`#shView [data-shgrip="${CSS.escape(grip.dataset.shgrip)}"]`);
    if (again) again.focus();
  }
}

function bindShortage() {
  $('#shImport').onclick = () => $('#shFile').click();
  $('#shFile').onchange = event => { const f = event.target.files[0]; event.target.value = ''; shImportFile(f); };
  $('#shPlanBtn').onclick = () => $('#shPlanFile').click();
  $('#shPlanFile').onchange = event => { const f = event.target.files[0]; event.target.value = ''; shPlanImport(f); };
  $('#shMoveBtn').onclick = () => $('#shMoveFile').click();
  $('#shMoveFile').onchange = event => { const f = event.target.files[0]; event.target.value = ''; shMoveImport(f); };
  const view = $('#view-shortage');
  view.addEventListener('pointerdown', shDragDown);
  view.addEventListener('keydown', shGripKey);
  view.addEventListener('click', async event => {
    const t = event.target;
    if (t.closest('[data-shimport]')) { $('#shFile').click(); return; }
    // 2.61: znovu načíst se sloupci, přepnout Seznam / Rozbor, rozbor do poznámek a do Excelu
    const rc = t.closest('[data-shrecols]');
    if (rc) {
      const k = rc.dataset.shrecols, x = (ui.sh.last || {})[k];
      if (!x) { toast('Soubor nahraj znovu, okno se sloupci se ukáže.'); return; }
      if (x.file) { if (k === 'list') shImportFile(x.file, true); else if (k === 'plan') shPlanImport(x.file, true); else shMoveImport(x.file, true); } else shPaste(x.html, x.text, true);
      return;
    }
    const md = t.closest('[data-shmode]');
    if (md) { ui.sh.mode = md.dataset.shmode; renderShortage(); return; }
    if (t.closest('[data-shanote]')) { shAnalysisToNotes(); return; }
    if (t.closest('[data-shaxlsx]')) { exportShAnalysisXlsx(); return; }
    const pdf = t.closest('[data-shpdf]');
    if (pdf) { exportShortagePdf(pdf.dataset.shpdf, pdf); return; }
    if (t.closest('[data-shmanual]')) { shManualDialog(); return; }
    const mg = t.closest('[data-shmerge]');
    if (mg) {
      ui.sh.merge = ui.sh.merge === mg.dataset.shmerge ? null : mg.dataset.shmerge;
      $('#shMsg').innerHTML = '';
      renderShortage();
      if (ui.sh.merge) { $('#shMergeBar').scrollIntoView({ block: 'nearest' }); $('#shPaste').focus({ preventScroll: true }); }
      return;
    }
    if (t.closest('[data-shmergeoff]')) { ui.sh.merge = null; renderShortage(); return; }
    const pdfd = t.closest('[data-shpdfdept]');
    if (pdfd) { exportShortagePdf(pdfd.dataset.shpdfdept, pdfd, true); return; }
    const open = t.closest('[data-shopen]');
    if (open) { ui.sh.open = open.dataset.shopen; ui.sh.q = ''; ui.sh.merge = null; $('#shMsg').innerHTML = ''; renderShortage(); return; }
    if (t.closest('[data-shplanuse]')) {
      const l = shList();
      if (!l || !ui.sh.plan) return;
      const res = shUsePlan(l, ui.sh.plan);
      if (!res.kept) save();
      renderShortage();
      $('#shMsg').innerHTML = shPlanNote(res, ui.sh.plan, false);
      return;
    }
    const topB = t.closest('[data-shtop]');
    if (topB) {
      const l = shList();
      const it = l && l.items.find(i => i.id === topB.dataset.shtop);
      if (!it || !shSetTier(l, it.id, it.top ? '' : 'top')) return;
      save(); renderShortage();
      toast(it.top ? 'Položka je TOP SHORTAGE, v seznamu je nahoře.' : 'Položka už není TOP SHORTAGE.');
      const b = $(`#shView [data-shtop="${CSS.escape(it.id)}"]`);
      if (b) b.focus();
      return;
    }
    const top2B = t.closest('[data-shtop2]');
    if (top2B) {
      const l = shList();
      const it = l && l.items.find(i => i.id === top2B.dataset.shtop2);
      if (!it || !shSetTier(l, it.id, it.top2 ? '' : 'top2')) return;
      save(); renderShortage();
      toast(it.top2 ? 'Položka je TOP 2: zpracovat hned po TOP shortage.' : 'Položka už není TOP 2.');
      const b = $(`#shView [data-shtop2="${CSS.escape(it.id)}"]`);
      if (b) b.focus();
      return;
    }
    if (t.closest('[data-shdeptadd]')) {
      const c = shc();
      const input = $('#shDeptNew');
      const name = String((input && input.value) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!name) { toast('Napiš název oddělení.', true); if (input) input.focus(); return; }
      if ((c.depts || []).length >= SH_MAX_DEPTS) { toast(`Nejvýš ${SH_MAX_DEPTS} oddělení.`, true); return; }
      if ((c.depts || []).some(d => norm(d.name) === norm(name))) { toast(`Oddělení ${name} už je.`, true); return; }
      c.depts = [...(c.depts || []), { id: uid('sd'), name, ops: [] }];
      ui.sh.deptOpen = true;
      save(); renderShortage();
      toast(`Oddělení ${name} je založené. Přiřaď mu operace v tabulce pod ním.`);
      const again = $('#shDeptNew');
      if (again) again.focus();
      return;
    }
    const deptDel = t.closest('[data-shdeptdel]');
    if (deptDel) {
      const c = shc();
      const d = (c.depts || []).find(x => x.id === deptDel.dataset.shdeptdel);
      if (!d || !(await confirmBox('Smazat oddělení?', `Oddělení ${d.name} zmizí i s přiřazením ${d.ops.length} ${d.ops.length === 1 ? 'operace' : 'operací'}. Položky se zařadí podle operace do jiného oddělení, nebo zůstanou nezařazené.`, 'Smazat', true))) return;
      c.depts = c.depts.filter(x => x !== d);
      c.lists.forEach(x => x.items.forEach(i => { if (i.dept === d.id) i.dept = ''; }));
      ui.sh.depts = (ui.sh.depts || []).filter(k => k !== d.id);
      save(); renderShortage();
      toast(`Oddělení ${d.name} je smazané.`);
      return;
    }
    const df = t.closest('[data-shdf]');
    if (df) {
      const k = df.dataset.shdf;
      const l = shList();
      const cur = new Set(l && shDeptSel(l) ? [...shDeptSel(l)] : []);
      if (!k) cur.clear(); else if (cur.has(k)) cur.delete(k); else cur.add(k);
      ui.sh.depts = [...cur];
      renderShortage();
      return;
    }
    const fullB = t.closest('[data-shfull]');
    if (fullB) {
      const l = shList();
      const it = l && l.items.find(i => i.id === fullB.dataset.shfull);
      if (!it) return;
      it.full = !it.full;
      save(); renderShortage();
      toast(it.full ? 'Sestava se ukazuje i tiskne celá: QR kód, poslední záznam, kolonky na psaní a poznámka.' : 'Sestava je zase jen orientační řádek.');
      return;
    }
    const opB = t.closest('[data-shop]');
    if (opB && opB.closest('.sh-ops')) {
      const k = opB.dataset.shop;
      const l = shList();
      const cur = new Set(l && shOpSel(l) ? [...shOpSel(l)] : []);
      if (!k) cur.clear(); else if (cur.has(k)) cur.delete(k); else cur.add(k);
      ui.sh.ops = [...cur];
      renderShortage();
      return;
    }
    const hide = t.closest('[data-shpdfhide]');
    if (hide) {
      const l = shList();
      const hit = l && shEntry(l, hide.dataset.shpdfhide);
      if (!hit) return;
      hit.entry.pdfHide = !hit.entry.pdfHide;
      save(); renderShortage();
      toast(hit.entry.pdfHide ? (hit.sub ? 'Poddíl se nevytiskne v PDF.' : (hit.entry.subs || []).length ? 'Sestava i její poddíly se nevytisknou v PDF.' : 'Položka se nevytiskne v PDF.') : 'Znovu se vytiskne v PDF.');
      return;
    }
    const delSub = t.closest('[data-shdelsub]');
    if (delSub) {
      const l = shList();
      const hit = l && shEntry(l, delSub.dataset.shdelsub);
      if (!hit || !hit.sub || !(await confirmBox('Odebrat poddíl?', `Poddíl ${hit.entry.ean || hit.entry.code} zmizí od sestavy ${[hit.item.ean, hit.item.name].filter(Boolean).join(' · ')}. Po dalším prohledání výrobního plánu se může vrátit.`, 'Odebrat', true))) return;
      hit.item.subs = hit.item.subs.filter(x => x !== hit.entry);
      save(); renderShortage();
      toast('Poddíl je odebraný.');
      return;
    }
    const delItem = t.closest('[data-shdelitem]');
    if (delItem) {
      const l = shList();
      const it = l && l.items.find(i => i.id === delItem.dataset.shdelitem);
      if (!it || !(await confirmBox('Odebrat položku?', `${[it.ean, it.name].filter(Boolean).join(' · ') || 'Položka'} zmizí ze seznamu z ${shWhen(l)}. Už stažené PDF zůstane.`, 'Odebrat', true))) return;
      l.items = l.items.filter(i => i !== it);
      l.gone = [...new Set([...(l.gone || []), shItemKey(it)])].slice(-SH_MAX_GONE);   // Doplnit chybějící ji nevrátí (2.36)
      save(); renderShortage();
      toast('Položka je odebraná.');
      return;
    }
    const del = t.closest('[data-shdel]');
    if (del) {
      const c = shc();
      const l = c.lists.find(x => x.id === del.dataset.shdel);
      if (!l || !(await confirmBox('Smazat seznam?', `Seznam z ${shWhen(l)} (${l.items.length} ${shItemsN(l.items.length)}) zmizí z aplikace. Už stažené PDF zůstane.`, 'Smazat', true))) return;
      c.lists = c.lists.filter(x => x !== l);
      if (ui.sh.open === l.id) ui.sh.open = null;
      $('#shMsg').innerHTML = '';
      save(); renderShortage();
      toast('Seznam je smazaný.');
    }
  });
  view.addEventListener('input', event => {
    if (event.target.id === 'shQ') { ui.sh.q = event.target.value; shFilter(); }
    if (event.target.id === 'shPaste') event.target.value = '';   // pole slouží jen pro Ctrl+V
  });
  // oddělení (2.32): název, operace → oddělení, ruční přesun položky
  view.addEventListener('toggle', event => { if (event.target.id === 'shDepts') ui.sh.deptOpen = event.target.open; }, true);
  view.addEventListener('change', event => {
    const t = event.target;
    const c = shc();
    if (t.matches('[data-shdeptname]')) {
      const d = (c.depts || []).find(x => x.id === t.dataset.shdeptname);
      const name = String(t.value || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!d) return;
      if (!name || c.depts.some(x => x !== d && norm(x.name) === norm(name))) { toast(name ? `Oddělení ${name} už je.` : 'Oddělení musí mít název.', true); t.value = d.name; return; }
      if (name !== d.name) { d.name = name; save(); renderShortage(); }
      return;
    }
    if (t.matches('[data-shopdept]')) {
      if (shAssignOp(c, t.dataset.shopdept, t.dataset.shoplabel, t.value)) { save(); renderShortage(); }
      return;
    }
    if (t.matches('[data-shst]')) {
      const l = shList();
      if (l && shSetStatus(l, t.dataset.shst, t.value, { at: Date.now(), by: ui.me.label || '' })) {
        save();
        t.className = `sh-stsel${t.value ? ` st-${t.value}` : ''}`;
        renderTaskAlert();
      }
      return;
    }
    if (t.matches('[data-shdept]')) {
      const l = shList();
      const it = l && l.items.find(i => i.id === t.dataset.shdept);
      if (!it) return;
      const auto = shAutoDept(c, it);
      const v = t.value;
      it.dept = v === '' ? '' : v === '-' ? (auto ? '-' : '') : (v === auto ? '' : v);
      save(); renderShortage();
      const d = shDeptOf(c, it);
      toast(`Položka je v oddělení ${d ? (c.depts.find(x => x.id === d) || {}).name : 'Nezařazeno'}${it.dept ? ' (ručně)' : ' (podle operace)'}.`);
    }
  });
  // poznámka k položce se uloží po opuštění pole nebo Enteru
  view.addEventListener('change', event => {
    const input = event.target.closest('[data-shnote]');
    if (!input) return;
    const l = shList();
    const hit = l && shEntry(l, input.dataset.shnote);
    if (!hit) return;
    const it = hit.entry;
    const note = input.value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
    input.value = note;
    if (note === (it.note || '')) return;
    it.note = note;
    save();
    const row = input.closest('tr');
    if (row && !hit.sub) row.dataset.shrow = [it.order, it.name, it.ean, it.index, it.op, it.code, it.note, it.rec ? it.rec.state : '', it.top ? 'top shortage' : '', ...(it.subs || []).flatMap(x => [x.ean, x.code])].join(' ').toLowerCase();
  });
  view.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target.closest('[data-shnote]')) event.target.blur(); });
  // Ctrl+V kdekoli v Shortage (mimo hledání a jiná pole) vloží tabulku z Excelu: seznam, nebo poslední záznamy
  document.addEventListener('paste', event => {
    if (!S || ui.view !== 'shortage' || document.querySelector('dialog[open]')) return;
    const t = event.target;
    if (t && t.closest && t.id !== 'shPaste' && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
    const data = event.clipboardData;
    if (!data) return;
    event.preventDefault();
    shPaste(data.getData('text/html'), data.getData('text/plain'));
  });
}

/* ---------- PDF: A4 na šířku, místo na psaní ---------- */
/** QR kód jako vektor (obdélníky po úsecích řádku); vrací false, když se text do QR nevejde. */
function pdfQr(doc, text, x, y, size) {
  if (!window.qrcode) return false;
  // QR nese bajty: znaky mimo ASCII se zapíšou jako %XX
  const data = String(text).replace(/[^\x00-\x7F]/g, ch => encodeURIComponent(ch));
  let qr = null;
  for (const level of ['M', 'L']) {
    try { qr = window.qrcode(0, level); qr.addData(data, 'Byte'); qr.make(); break; } catch (error) { qr = null; }
  }
  if (!qr) return false;
  const n = qr.getModuleCount(), quiet = 2, cell = size / (n + 2 * quiet);
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, size, size, 'F');
  doc.setFillColor(0, 0, 0);
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n;) {
      if (!qr.isDark(r, c)) { c += 1; continue; }
      let e = c;
      while (e < n && qr.isDark(r, e)) e += 1;
      // o chlup vyšší, ať mezi řádky v prohlížeči PDF nesvítí tenké mezery
      doc.rect(x + (quiet + c) * cell, y + (quiet + r) * cell, (e - c) * cell, cell + 0.02, 'F');
      c = e;
    }
  }
  return true;
}
const SH_PDF_COLS = [['#', 7], ['QR kód', 21], ['Číslo objednávky', 30], ['Název dílu · EAN', 46], ['Index', 12], ['Urgentní množství', 18], ['Operace · poslední záznam', 38], ['Stav k 10:00', 24], ['Stav k 13:00', 24], ['Poznámky', 0]];
/* Černobílý tisk (2.28): jen černá a odstíny šedé, linky tmavší, TOP SHORTAGE černý štítek a pruh. */
const SH_MONO = { ink: [0, 0, 0], ink2: [45, 45, 45], ink3: [95, 95, 95], line: [150, 150, 150], line2: [95, 95, 95], head: [222, 222, 222], top: [236, 236, 236], asm: [246, 246, 246], write: [120, 120, 120] };
/* split (2.34): každé oddělení na vlastním papíře – vlastní záhlaví, číslování položek i stran */
function drawShortage(doc, l, ops = null, dsel = null, split = false) {
  const k = pdfKit(doc);
  // i zápatí a výchozí barva písma pdfKit jen v odstínech šedé
  Object.assign(k.C, { ink: SH_MONO.ink, ink2: SH_MONO.ink2, ink3: SH_MONO.ink3, line: SH_MONO.line, line2: SH_MONO.line2 });
  const C = SH_MONO;
  const widths = SH_PDF_COLS.map(x => x[1]);
  widths[widths.length - 1] = k.CW - widths.reduce((a, b) => a + b, 0);
  const xs = [];
  widths.reduce((x, w, i) => { xs[i] = x; return x + w; }, k.M);
  const ROW = 20, QR = 14, HEAD = 9.5;
  // skryté v PDF (2.29.1): položka i s poddíly, nebo jen poddíl
  const items = shDeptPick(shPdfItems(l, ops), dsel);
  const sh = shc();
  const secs = shSections(sh, items);
  const byDept = split && (sh.depts || []).length > 0;
  const clip = (text, w, size, max, bold) => {
    const lines = k.split(text, w, size, bold);
    if (lines.length <= max) return lines;
    const out = lines.slice(0, max);
    out[max - 1] = `${out[max - 1].replace(/\s*\S{0,3}$/, '')}…`;
    return out;
  };
  const vlines = (top, h) => {
    doc.setDrawColor(...C.line); doc.setLineWidth(0.25);
    xs.slice(1).forEach(x => doc.line(x, top, x, top + h));
  };
  const head = () => {
    k.box(C.head, k.M, k.y, k.CW, HEAD, 0);
    doc.setDrawColor(...C.ink); doc.setLineWidth(0.5); doc.line(k.M, k.y + HEAD, k.M + k.CW, k.y + HEAD);
    SH_PDF_COLS.forEach(([t], i) => {
      const lines = k.split(t, widths[i] - 3, 7.2, true);
      const lh = k.LH(7.2, 1.15);
      lines.forEach((line, j) => k.text(line, xs[i] + 1.6, k.y + (HEAD - lines.length * lh) / 2 + j * lh, 7.2, { bold: true, color: C.ink }));
    });
    k.y += HEAD;
  };
  // kompaktní záhlaví, ať se na stránku vejde víc položek; sec = papír jednoho oddělení (2.34)
  const HINT = 'Stav doplň k 10:00 a k 13:00. QR kód nese activeBarcode z odkazu u EANu.';
  const title = sec => {
    const its = sec ? sec.items : items;
    const n = its.length, tops = its.filter(i => i.top).length, top2s = its.filter(i => i.top2).length, subsN = its.reduce((a, i) => a + i.subs.length, 0);
    k.text(`${EXPORT_NAME} · SHORTAGE`, k.M, k.y, 7.5, { bold: true, color: C.ink, space: 0.35 });
    k.text(`Seznam z ${shWhen(l)} · ${n} ${shItemsN(n)}${subsN ? ` · ${subsN} ${shSubsN(subsN)}` : ''}${tops ? ` · ${tops} TOP SHORTAGE` : ''}${top2s ? ` · ${top2s} TOP 2` : ''}`, k.M + k.CW, k.y, 8.5, { color: C.ink2, align: 'right' });
    k.y += 5.5;
    const hintW = k.width(HINT, 8.5);
    const big = clip(sec ? `Chybějící díly · ${sec.name}` : 'Chybějící díly', k.CW - hintW - 40, 17, 1, true)[0];
    k.text(big, k.M, k.y, 17, { bold: true, color: C.ink });
    const parts = [];   // filtr operací (2.31) a oddělení (2.32): čeho se výtisk týká
    if (dsel && !sec) parts.push(`Oddělení: ${shSections(sh, l.items).filter(x => dsel.has(x.id || '-')).map(x => x.name).join(', ')}`);
    if (ops) parts.push(`Jen operace: ${shOpList(l).filter(o => ops.has(o.key)).map(o => o.label).join(', ')}`);
    if (parts.length) {
      const x = k.M + Math.max(62, k.width(big, 17, true) + 6);
      k.text(clip(parts.join(' · '), k.M + k.CW - hintW - 6 - x, 8.5, 1, true)[0], x, k.y + 2.6, 8.5, { bold: true, color: C.ink });
    }
    k.text(HINT, k.M + k.CW, k.y + 2.6, 8.5, { color: C.ink2, align: 'right' });
    k.y += 9;
    doc.setDrawColor(...C.ink); doc.setLineWidth(0.7); doc.line(k.M, k.y, k.M + 28, k.y);
    k.y += 4;
  };
  // další strana téhož oddělení: název oddělení nad záhlavím sloupců, ať se papíry nepletou
  let cur = null;
  const cont = () => {
    k.text(`Chybějící díly · ${cur.name} · pokračování`, k.M, k.y, 8.5, { bold: true, color: C.ink });
    k.y += 5;
    head();
  };
  if (!byDept) {
    title(null);
    k.onPage = head;
    head();
  }
  // výška řádku podle obsahu (nejméně ROW): dlouhý poslední záznam, operace, název nebo poznámka se vypíšou celé
  const PAD = 1.8, recQty = r => (r.qty ? (/^[\d\s.,]+$/.test(r.qty) ? `${r.qty} ks` : r.qty) : '');
  // parent = sestava, když jde o poddíl z výrobního plánu (2.29); sestava s poddíly je jen
  // orientační řádek bez QR kódu, kolonek na psaní a poznámek (2.29.1)
  const lay = (it, parent) => {
    const noteTxt = [it.st ? `Stav: ${shStName(it.st)}` : '', it.note || ''].filter(Boolean).join(' · ');
    const src = parent || it;
    const asm = !parent && (it.subs || []).length > 0 && !it.full;   // jen viditelné poddíly (shPdfItems); plně zobrazená sestava je celý řádek (2.31)
    if (asm) {
      const A = {
        asm, order: clip(it.order || '—', widths[2] - 3.6, 9, 2, true), name: clip(it.name || '—', widths[3] - 3.6, 8.8, 2),
        index: clip(it.index || '—', widths[4] - 3.6, 8.8, 2), qty: clip(it.qty || '—', widths[5] - 3.6, 11, 1, true), op: clip(it.op || '—', widths[6] - 3.6, 8.4, 2), rec: [],
        note: noteTxt ? clip(noteTxt, widths[9] - 3.6, 8, 4) : [],   // dříve dopsaná poznámka se neztratí; stav (2.65) před ní
      };
      A.h = Math.max(11, PAD + A.order.length * k.LH(9, 1.25) + PAD, 1.6 + (it.top || it.top2 ? 4.6 : 0) + (it.top2 ? 3.4 : 0) + A.name.length * k.LH(8.8, 1.22) + 0.6 + (it.ean ? k.LH(7.8, 1.2) : 0) + 1.4, PAD + A.op.length * k.LH(8.4, 1.25) + PAD, PAD + A.note.length * k.LH(8, 1.22) + PAD);
      return A;
    }
    const L = {
      order: clip(src.order || '—', widths[2] - (parent ? 7.2 : 3.6), parent ? 7.8 : 9, 6, !parent),
      name: parent ? [] : clip(it.name || '—', widths[3] - 3.6, 8.8, 6),
      index: clip(src.index || '—', widths[4] - 3.6, 8.8, 4),
      qty: parent ? [] : clip(it.qty || '—', widths[5] - 3.6, 12, 2, true),
      op: clip(it.op || '—', widths[6] - 3.6, 8.4, 8),
      rec: it.rec ? clip([it.rec.state, recQty(it.rec)].filter(Boolean).join(' · ') || '—', widths[6] - 3.6, 7.8, 16, true) : [],
      note: noteTxt ? clip(noteTxt, widths[9] - 3.6, 8, 12) : [],
    };
    L.h = Math.max(ROW,
      PAD + L.order.length * k.LH(9, 1.25) + PAD,
      1.6 + ((parent || it.top || it.top2) ? 4.6 : 0) + (!parent && it.top2 ? 3.4 : 0) + L.name.length * k.LH(8.8, 1.22) + 0.6 + (it.ean ? k.LH(7.8, 1.2) : 0) + PAD,
      PAD + L.op.length * k.LH(8.4, 1.25) + (it.rec ? 1.4 + L.rec.length * k.LH(7.8, 1.2) + 0.3 + k.LH(6.8, 1.2) : 0) + PAD,
      L.note.length ? PAD + L.note.length * k.LH(8, 1.22) + 1.5 + 4.5 : 0);
    return L;
  };
  // keep: výška řádku, který musí být na stejné stránce (sestava nezůstane dole bez poddílu)
  const row = (it, num, parent, keep = 0) => {
    const L = lay(it, parent), H = L.h, top0 = !!(parent || it).top, two = !top0 && !!(parent || it).top2;
    k.need(H + keep);
    const top = k.y;
    if (top0) {
      // TOP SHORTAGE: světle šedý řádek, černý pruh vlevo a černý štítek (i u poddílů sestavy)
      k.box(C.top, k.M, top, k.CW, H, 0);
      doc.setFillColor(...C.ink); doc.rect(k.M, top, 1.4, H, 'F');
    } else if (two) {
      // TOP 2 (2.32): bílý řádek, šedý pruh vlevo, štítek s rámečkem a poznámka pod ním
      if (L.asm) k.box(C.asm, k.M, top, k.CW, H, 0);
      doc.setFillColor(...C.ink3); doc.rect(k.M, top, 1.4, H, 'F');
    } else if (L.asm) k.box(C.asm, k.M, top, k.CW, H, 0);
    vlines(top, H);
    k.hline(top + H, parent ? C.line : C.line2, parent ? 0.25 : 0.35);
    k.text(num, xs[0] + 2, top + 2, parent ? 7 : 8, { color: top0 || two ? C.ink : C.ink3, bold: (top0 || two) && !parent });
    // QR nese jen activeBarcode; pod ním kód písmem pro opsání. Klikací odkaz v PDF ne,
    // jsPDF 4.2 by v adrese přepsal & na &amp;.
    const qx = xs[1] + (widths[1] - QR) / 2;
    if (L.asm) k.text('sestava', xs[1] + widths[1] / 2, top + PAD + 0.4, 7, { color: C.ink3, align: 'center' });
    else if (it.code && pdfQr(doc, it.code, qx, top + 1, QR)) {
      let size = 5.6;
      while (size > 4 && k.width(it.code, size) > widths[1] - 1.6) size -= 0.4;
      k.text(it.code, xs[1] + widths[1] / 2, top + 1 + QR + 0.7, size, { color: C.ink, align: 'center' });
    } else {
      k.split(it.link ? 'odkaz bez activeBarcode' : 'bez odkazu', widths[1] - 4, 6.8).forEach((line, i) => k.text(line, xs[1] + widths[1] / 2, top + ROW / 2 - 2 + i * 3, 6.8, { color: C.ink3, align: 'center' }));
    }
    if (parent) {
      // poddíl: značka „pod sestavou“ (čáry, ne znak, ten v písmu není) a číslo objednávky sestavy
      doc.setDrawColor(...C.ink2); doc.setLineWidth(0.35);
      doc.line(xs[2] + 2, top + 1.6, xs[2] + 2, top + 3.9); doc.line(xs[2] + 2, top + 3.9, xs[2] + 4.4, top + 3.9);
      L.order.forEach((line, i) => k.text(line, xs[2] + 5.4, top + PAD + i * k.LH(7.8, 1.25), 7.8, { color: C.ink2 }));
    } else L.order.forEach((line, i) => k.text(line, xs[2] + 1.8, top + PAD + i * k.LH(9, 1.25), 9, { bold: true, color: C.ink }));
    let y = top + 1.6;
    if (parent || it.top || it.top2) {
      const label = parent ? 'PODDÍL' : it.top ? 'TOP SHORTAGE' : 'TOP 2', tw = k.width(label, 6.2, true) + 3;
      if (!parent && !it.top) {
        k.box([255, 255, 255], xs[3] + 1.8, y, tw, 3.6, 0.9);
        doc.setDrawColor(...C.ink); doc.setLineWidth(0.3); doc.roundedRect(xs[3] + 1.8, y, tw, 3.6, 0.9, 0.9, 'S');
      } else k.box(parent ? C.head : C.ink, xs[3] + 1.8, y, tw, 3.6, 0.9);
      k.text(label, xs[3] + 1.8 + 1.5, y + 0.75, 6.2, { bold: true, color: parent || !it.top ? C.ink : [255, 255, 255], space: 0.1 });
      y += 4.6;
      if (!parent && it.top2) { k.text('Zpracovat hned po TOP shortage', xs[3] + 1.8, y - 0.2, 6.6, { bold: true, color: C.ink }); y += 3.4; }
    }
    L.name.forEach((line, i) => k.text(line, xs[3] + 1.8, y + i * k.LH(8.8, 1.22), 8.8, { color: C.ink }));
    y += L.name.length * k.LH(8.8, 1.22) + (L.name.length ? 0.6 : 0);
    if (it.ean) k.text(`EAN ${it.ean}`, xs[3] + 1.8, y, parent ? 8.4 : 7.8, { color: parent ? C.ink : C.ink2, bold: !!parent });
    L.index.forEach((line, i) => k.text(line, xs[4] + 1.8, top + PAD + i * k.LH(8.8, 1.25), 8.8, { color: parent ? C.ink2 : C.ink }));
    L.qty.forEach((line, i) => k.text(line, xs[6] - 1.8, top + 1.6 + i * k.LH(12, 1.15), L.asm ? 11 : 12, { bold: true, align: 'right', color: C.ink }));
    // operace nahoře, pod ní celý poslední záznam (stav · ks) a kdy
    L.op.forEach((line, i) => k.text(line, xs[6] + 1.8, top + PAD + i * k.LH(8.4, 1.25), 8.4, { color: it.op ? C.ink : C.ink3 }));
    if (it.rec && !L.asm) {
      const ry = top + PAD + L.op.length * k.LH(8.4, 1.25) + 1;
      doc.setDrawColor(...C.line); doc.setLineWidth(0.2); doc.line(xs[6] + 1.8, ry - 0.5, xs[7] - 1.8, ry - 0.5);
      L.rec.forEach((line, i) => k.text(line, xs[6] + 1.8, ry + 0.4 + i * k.LH(7.8, 1.2), 7.8, { bold: true, color: C.ink }));
      k.text(it.rec.when || '', xs[6] + 1.8, ry + 0.4 + L.rec.length * k.LH(7.8, 1.2) + 0.3, 6.8, { color: C.ink2 });
    }
    // kolonky na psaní: stav k 10:00 a k 13:00, poznámky (dopsaná poznámka nahoře, pod ní linka); sestava s poddíly je nemá
    if (L.asm) {
      L.note.forEach((line, i) => k.text(line, xs[9] + 1.8, top + PAD + i * k.LH(8, 1.22), 8, { color: C.ink }));
      k.y += H;
      return;
    }
    [7, 8].forEach(c => k.hline(top + H - 4.5, C.write, 0.25, xs[c] + 2.5, xs[c] + widths[c] - 2.5, [0.6, 0.9]));
    if (L.note.length) {
      L.note.forEach((line, i) => k.text(line, xs[9] + 1.8, top + PAD + i * k.LH(8, 1.22), 8, { color: C.ink }));
      k.hline(top + H - 4.5, C.write, 0.25, xs[9] + 2.5, xs[9] + widths[9] - 2.5, [0.6, 0.9]);
    } else [H - 11, H - 4.5].forEach(h => k.hline(top + h, C.write, 0.25, xs[9] + 2.5, xs[9] + widths[9] - 2.5, [0.6, 0.9]));
    k.y += H;
  };
  // bloky podle oddělení (2.32): nadpis s počtem, drží se s prvním řádkem;
  // po odděleních (2.34) každé oddělení od nové strany a čísla od 1
  let j = 0;
  const starts = [];
  secs.forEach((sec, si) => {
    if (byDept) {
      if (si) { k.onPage = null; doc.addPage(); k.y = k.M; }
      cur = sec; j = 0;
      starts.push(doc.getNumberOfPages());
      title(sec);
      k.onPage = cont;
      head();
    } else if ((sh.depts || []).length) {
      const first = sec.items[0];
      k.need(7.5 + lay(first, null).h + (first.subs.length ? lay(first.subs[0], first).h : 0));
      k.box(C.head, k.M, k.y, k.CW, 6.5, 0);
      doc.setFillColor(...C.ink); doc.rect(k.M, k.y, k.CW, 0.5, 'F');
      k.text(`${sec.name} · ${sec.items.length} ${shItemsN(sec.items.length)}`, k.M + 2, k.y + 1.7, 9, { bold: true, color: C.ink });
      k.y += 7.5;
    }
    sec.items.forEach(it => {
      j += 1;
      row(it, String(j), null, it.subs.length ? lay(it.subs[0], it).h : 0);
      it.subs.forEach((x, i) => row(x, `${j}.${i + 1}`, it));
    });
  });
  const left = `${EXPORT_NAME} · Shortage · seznam z ${shWhen(l)}${l.file ? ` · ${l.file}` : ''}`;
  if (!byDept) { k.footer(left); return; }
  // strany číslované po odděleních: „Brus · strana 1 / 2“
  k.footer(left, (i, pages) => {
    let s = 0;
    while (s + 1 < starts.length && starts[s + 1] <= i) s += 1;
    const end = s + 1 < starts.length ? starts[s + 1] - 1 : pages;
    return { left: `${left} · ${secs[s].name}`, right: `${secs[s].name} · strana ${i - starts[s] + 1} / ${end - starts[s] + 1}` };
  });
}
/** Položky do PDF bez skrytých; poddíly jen viditelné; s filtrem jen vybrané operace (2.31). */
function shPdfItems(l, ops = null) { return shOpPick(l.items.filter(i => !i.pdfHide).map(i => ({ ...i, subs: (i.subs || []).filter(x => !x.pdfHide) })), ops); }
async function exportShortagePdf(id, button = null, split = false) {
  const l = shc().lists.find(x => x.id === id);
  if (!l || !l.items.length) return;
  const ops = shOpSel(l);
  const dsel = shDeptSel(l);
  if (!shDeptPick(shPdfItems(l, ops), dsel).length) { toast(ops || dsel ? 'Vybraný filtr nemá žádnou položku do PDF.' : 'Všechny položky jsou skryté v PDF.', true); return; }
  await withPdf(button, doc => {
    doc.setProperties({ title: `Shortage · chybějící díly ${shWhen(l)}`, subject: l.file || 'Shortage', creator: EXPORT_NAME });
    drawShortage(doc, l, ops, dsel, split);
    const d = new Date(l.at);
    downloadFile(`shortage-${todayIso(l.at)}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${split ? '-po-oddelenich' : ''}.pdf`, doc.output('blob'), 'application/pdf');
  }, 'landscape');
}

