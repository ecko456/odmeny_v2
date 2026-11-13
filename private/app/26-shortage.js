/* ==========================================================================
   SHORTAGE: chybějící díly z Excelu (verze 2.27, sloupce 2.27.1)
   Data a převod řádků jsou v core.js (S.shortage, shBuild, cleanShortage). Tady je import
   souboru (text buňky a cíl jejího hypertextového odkazu), seznam a PDF na šířku: QR kód
   s activeBarcode z odkazu u EANu, TOP SHORTAGE nahoře, urgentní množství, probíhající
   operace, Stav k 10:00, Stav k 13:00 a místo na poznámky.
   ========================================================================== */
function shc() { if (!S.shortage) S.shortage = blankShortage(); return S.shortage; }
/* Otevřený seznam: vybraný, jinak nejnovější nezabalený (2.73), jinak žádný. Zabalený seznam je jen
   ke čtení: importy, vložení a úpravy jdou do shWork() (otevřený nezabalený seznam). */
function shList() { const c = shc(); return c.lists.find(l => l.id === ui.sh.open) || c.lists.find(l => !l.packed) || null; }
function shWork() { const l = shList(); return l && !l.packed ? l : null; }

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
function shSheetRows(X, ws, width = 40, qtyCol = 4, maxRows = 20001) {
  const ref = ws && ws['!ref'];
  if (!ref) return [];
  const range = X.utils.decode_range(ref);
  const rows = [];
  const last = Math.min(range.e.c, width - 1);
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + maxRows - 1); r += 1) {
    const row = [];
    for (let c = 0; c <= Math.max(7, last); c += 1) {
      const cell = ws[X.utils.encode_cell({ r, c })];
      row.push({ text: shCellText(cell, c === qtyCol), link: shCellLink(cell), fill: shCellFill(cell) });
    }
    rows.push(row);
  }
  return rows;
}
/** Velký list (evidence, 2.78): jen vybrané sloupce (indexy), nejvýš max řádků. Vrací {rows, cut}. */
function shSheetCols(X, ws, cols, max) {
  const ref = ws && ws['!ref'];
  if (!ref) return { rows: [], cut: 0 };
  const range = X.utils.decode_range(ref), rows = [];
  const end = Math.min(range.e.r, range.s.r + max - 1);
  const dense = Array.isArray(ws['!data']) ? ws['!data'] : null;
  for (let r = range.s.r; r <= end; r += 1) {
    const row = [];
    cols.forEach(c => { const cell = dense ? (dense[r] || [])[c] : ws[X.utils.encode_cell({ r, c })]; row[c] = { text: shCellText(cell, false), link: '' }; });
    rows.push(row);
  }
  return { rows, cut: Math.max(0, range.e.r - end) };
}
const shPl = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);

/* ---------- Tři kroky (2.61): sloupce každého importu navrhne AI z nadpisů ----------
   AI dostane jen první řádky souboru, kde jsou hodnoty nahrazené typem (dvAiSample), a vrátí
   písmena sloupců. Bez AI se sloupce odhadnou podle nadpisů (shColsGuess). Okno se sloupci se
   ukáže, když se návrh liší od uloženého nastavení nebo AI něco nejistého napsala; jinak se
   soubor načte rovnou a ve zprávě je tlačítko Upravit sloupce. */
const SH_KIND_NAME = { list: 'urgentních dílů', planItem: 'výrobního plánu · 1. list: díly bez sestav', plan: 'výrobního plánu · 2. list: sestavy a poddíly', move: 'evidence pohybu' };
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
async function shColsFor(kind, sheets, { file = '', pick = 0, force = false, remember = true } = {}) {
  const c = shc();
  const saved = c.cols && c.cols[kind];
  let sheetI = Math.min(Math.max(0, pick), Math.max(0, sheets.length - 1));
  const sample = (sheets[sheetI] || {}).rows || [];
  const sheetName = (sheets[sheetI] || {}).name || '';
  // 2.78: přednastavení. Soubor se stejnými nadpisy se načte rovnou (bez AI a bez okna), posunuté sloupce se
  // najdou podle nadpisů. Urgenty mají okno vždy (poznámky od plánování, 2.70).
  const pre = !force && kind !== 'list' ? shColsPreset(kind, saved, sample) : null;
  if (pre) {
    const cols = shColsClean(kind, { ...pre.cols, ...(kind === 'plan' || kind === 'planItem' ? { sheet: sheetName } : {}) });
    const moved = pre.moved.map(f => `${SH_COL_NAMES[kind][f].split(' (')[0]} ${cols[f]}`).join(', ');
    return { cols, sheetI, sheet: sheetName, how: pre.how === 'same' ? 'přednastavení' : 'přednastavení, sloupce posunuté', note: moved ? `Sloupce jsou v souboru jinde, podle nadpisů: ${moved}.` : '', preset: pre.how };
  }
  const presetWarn0 = !force && kind !== 'list' && saved && saved.heads ? `Soubor neodpovídá přednastavení${saved.set ? ` (uložil ${saved.set.by || 'někdo'} ${shWhenText(saved.set.at)})` : ''}: nadpisy ${Object.keys(saved.heads).map(f => `„${saved.heads[f]}“`).join(', ')} tu nejsou. Zkontroluj návrh a potvrď; nové sloupce se uloží jako přednastavení.` : '';
  const base = kind === 'list' ? shListBase(sample, saved) : saved || SH_COLS[kind];
  const guess = shColsGuess(kind, sample, base);
  // bez nadpisů v souboru (třeba vložené řádky evidence bez hlavičky) se přednastavení nedá ověřit: platí jako dřív
  const presetWarn = guess.found.length ? presetWarn0 : '';
  let cols = guess.cols;
  let how = guess.found.length ? 'odhad podle nadpisů' : kind === 'list' && base === SH_URGENT_COLS ? 'tabulka urgentů A–S' : saved ? 'uložené nastavení' : 'výchozí sloupce';
  let note = '';
  let header = guess.header;
  const ai = await shAiCols(kind, sheets.map(sh => ({ name: sh.name, rows: sh.rows })));
  if (ai) {
    cols = shColsFromAi(kind, ai, cols);
    how = 'návrh AI';
    note = ai.note || '';
    if (ai.header > 0) header = ai.header - 1;
    // ruční volba sloupce poznámek od plánování má přednost i před návrhem AI
    if (kind === 'list' && base.noteChosen) { cols.note = base.note; cols.noteChosen = true; }
    if (kind === 'plan' && sheets.length > 1 && cols.sheet) { const k = sheets.findIndex(sh => sh.name === cols.sheet); if (k >= 0) sheetI = k; }
  }
  if (kind === 'plan' || kind === 'planItem') cols.sheet = (sheets[sheetI] || {}).name || '';
  const same = shColsLetters(kind, cols) === shColsLetters(kind, base);   // list plánu se vybírá sám
  let confirmed = false;
  if (force || kind === 'list' || !same || note || presetWarn) {
    const res = await shColsDialog(kind, sheets, { cols, sheetI, header, how, note, file, warn: presetWarn });
    if (!res) return null;
    ({ cols, sheetI, header } = res);
    how = res.changed ? 'upraveno ručně' : how;
    confirmed = true;
  }
  // přednastavení (2.78): nadpisy potvrzených sloupců; bez okna jen když nadpisy v souboru opravdu jsou
  if (kind !== 'list' && (confirmed || (!(saved && saved.heads) && (ai ? ai.header > 0 : guess.found.length >= 2)))) {
    const heads = shColsHeads(kind, cols, (sheets[sheetI] || {}).rows || [], header);
    if (Object.keys(heads).length >= 2) { cols.heads = heads; cols.set = { at: Date.now(), by: ui.me.label || '' }; }
    else { delete cols.heads; delete cols.set; }
  } else if (kind !== 'list' && saved && saved.heads && same) { cols.heads = saved.heads; cols.set = saved.set; }
  cols = shColsClean(kind, cols);
  if (remember && JSON.stringify(saved || null) !== JSON.stringify(cols)) { c.cols = { ...(c.cols || {}), [kind]: cols }; }
  return { cols, sheetI, sheet: (sheets[sheetI] || {}).name || '', how, note };
}
/** Okno se sloupci: výběr písmen, u plánu i listu, a vzor prvních řádků podle výběru. */
async function shColsDialog(kind, sheets, { cols, sheetI, header, how, note, file, warn = '' }) {
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
    html: `<div class="sh-coldlg">${warn ? `<div class="note w sh-prewarn">${esc(warn)}</div>` : ''}<p class="small">${file ? `<b>${esc(file)}</b> · ` : ''}sloupce: <b>${esc(how)}</b>${note ? ` · <span class="sh-ainote">${esc(note)}</span>` : ''}. Zkontroluj vzor dole a případně oprav písmeno sloupce. ${kind === 'list' ? 'Nastavení se zapamatuje pro další import.' : 'Uloží se jako přednastavení i s nadpisy: soubor se stejnými nadpisy se příště načte rovnou, bez tohoto okna.'}</p>
      ${(kind === 'plan' || kind === 'list') && sheets.length > 1 ? `<label class="field"><span>List v souboru</span><select name="sheet">${sheets.map((sh, i) => `<option value="${i}"${i === sheetI ? ' selected' : ''}>${esc(sh.name)}</option>`).join('')}</select></label>` : ''}
      <div class="sh-colgrid">${fields.map(f => `<label class="field"><span>${esc(SH_COL_NAMES[kind][f])}${SH_COL_NEED[kind].includes(f) ? ' *' : ''}</span><select name="c-${f}" data-shcol="${f}">${opts(sheets[sheetI], cols[f], f)}</select></label>`).join('')}</div>
      ${kind === 'list' ? '<p class="note i">Do poznámek se vloží obsah vybraného sloupce s předponou <b>Poznámka od plánování:</b>. Pro tabulku urgentů A–S zvol S; můžeš vybrat i jiný sloupec, nebo poznámky vynechat.</p>' : ''}
      ${kind === 'planItem' ? '<p class="note i">Párování používá EAN + číslo objednávky + line/index. Vyber všechny tři sloupce, pokud jsou ve zdroji. Chybějící údaj se neshoduje s vyplněným údajem urgentu; aplikace nepřejde na odhad pouze podle EANu.</p>' : ''}
      ${kind === 'planItem' || kind === 'plan' ? '<p class="note i">Množství zakázky: dokud evidence pohybu nemá záznamy „Odesláno na WPA“ za celé množství a poslední záznam dílu je jiný, zbytek kusů je pořád u nás.</p>' : ''}
      <h4>Vzor prvních řádků</h4><div id="shColPrev">${prev(sheets[sheetI], cols)}</div>
      <p class="tiny muted">AI vidí jen nadpisy a druh hodnot (číslo, text, datum), žádné EANy ani názvy dílů. * = povinné.</p></div>`,
    validate: form => {
      const val = f => (form.elements.namedItem(`c-${f}`) || {}).value || '';
      if (kind === 'planItem') {
        const identity=['ean','order','index'].map(val).filter(Boolean);
        if (new Set(identity).size!==identity.length) return 'EAN, číslo objednávky a line/index musí mít různé sloupce.';
      }
      // množství zakázky (2.71) ve vlastním sloupci
      if ((kind === 'planItem' || kind === 'plan') && val('qty') && fields.some(f => f !== 'qty' && f !== 'op' && val(f) === val('qty'))) return 'Množství zakázky musí mít vlastní sloupec (ne EAN, objednávku ani index).';
      return '';
    },
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
  return { cols: { ...cols, ...out, ...(kind === 'list' ? {noteChosen:true} : {}),...(kind === 'planItem' ? {matchVersion:1} : {}) }, sheetI, changed, header };
}
/** Vzorník barev (2.61): barvy výplně buněk EANu z importu a jejich přiřazení TOP / TOP 2 / běžná shortage. */
async function shColorDialog(r) {
  const c = shc();
  const list = [...r.fills.entries()].sort((a, b) => b[1] - a[1]);
  if (!list.length) return true;
  const ex = hex => r.items.find(i => i.fill === hex);
  const TIERS = [['top', 'TOP SHORTAGE'], ['top2', 'TOP 2 (hned po TOP)'], ['none', 'Běžná shortage'], ['done', 'Hotovo (na konec seznamu)']];
  const res = await dialog({
    title: 'Barvy v buňkách EANu', ok: 'Použít barvy', cancel: 'Bez barev', wide: true,
    html: `<p class="small">V buňkách s EANem jsou tyhle barvy výplně. Přiřaď každé, co znamená; aplikace si to zapamatuje i pro další import. Text TOP ve sloupci TOP má přednost. Položky s barvou Hotovo (výchozí pro zelenou) dostanou stav Hotovo a budou vždy na konci seznamu.</p>
      <div class="sh-colors">${list.map(([hex, n]) => { const i = ex(hex) || {}; const t = (c.colors || {})[hex] || shColorGuess(hex); return `<div class="sh-colorrow"><span class="sh-swatch" data-swatch="${hex}" aria-hidden="true"></span><div><b>#${hex}</b> <span class="small muted">${n} ${shItemsN(n)}${i.ean ? ` · např. ${esc(i.ean)}${i.name ? ` ${esc(i.name)}` : ''}` : ''}</span></div>
        <select name="k-${hex}" aria-label="Barva #${hex}">${TIERS.map(([k, l]) => `<option value="${k}"${k === t ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`; }).join('')}</div>`,
    onOpen: dlg => { dlg.querySelectorAll('[data-swatch]').forEach(x => { x.style.background = `#${x.dataset.swatch}`; }); },
  });
  if (res.value !== 'ok') return false;
  const map = { ...(c.colors || {}) };
  list.forEach(([hex]) => { map[hex] = res.form.elements.namedItem(`k-${hex}`).value; });
  c.colors = map;
  shApplyColors(r.items, map, { at: Date.now(), by: ui.me.label || '' });
  const all = shTopFirst(r.items), open = all.filter(i => i.st !== 'done');
  r.items = all;
  r.top = open.filter(i => i.top).length;
  r.top2 = open.filter(i => i.top2).length;
  r.done = all.length - open.length;
  return true;
}
/** Řádek do zprávy: jak se sloupce načetly, s tlačítkem Upravit sloupce. */
function shColsNote(kind, x) {
  return x ? `<div class="note i sh-colsnote">Sloupce ${SH_KIND_NAME[kind]} (${esc(x.how)}${x.preset && x.cols.set ? `, uložil ${esc(x.cols.set.by || 'někdo')} ${esc(dayText(todayIso(x.cols.set.at)))}` : ''}): ${esc(shColsText(kind, x.cols))}${x.sheet && (kind === 'plan' || kind === 'planItem') ? `, list ${esc(x.sheet)}` : ''}.${x.preset === 'moved' && x.note ? ` ${esc(x.note)}` : ''} <button class="link" type="button" data-shrecols="${kind === 'planItem' ? 'plan' : kind}">Upravit sloupce</button></div>` : '';
}

/** Nový seznam z výsledku shBuild: uloží, ukáže a napíše, co se načetlo. */
function shAddList(r, src) {
  const msg = $('#shMsg');
  const c = shc();
  const prevL = shNewest(c);
  const pins = shCarryPins(prevL, r.items);   // připnuté položky přejdou z předchozího seznamu (2.75)
  const list = { id: uid('sh'), at: Date.now(), by: ui.me.label || '', file: src.file, sheet: src.sheet || '', items: pins.items };
  const dropped = Math.max(0, c.lists.length + 1 - SH_MAX_LISTS);
  S.shortage = cleanShortage({ ...c, lists: [list, ...c.lists] });   // oddělení (2.32) zůstanou, dny na shortage se dopočítají (2.73)
  ui.sh.open = list.id;
  ui.sh.q = '';
  // výrobní plán nahraný v tomto okně se prohledá i u nového seznamu (2.29)
  const fresh = ui.sh.plan && shc().lists.find(x => x.id === list.id);
  const planRes = fresh ? shUsePlan(fresh, ui.sh.plan) : null;
  save();
  renderShortage();
  const n = r.items.length, w = r.warn, top = r.top;
  const from = src.paste ? 'ze schránky' : `ze souboru <b>${esc(src.file)}</b>${list.sheet ? ` (list ${esc(list.sheet)})` : ''}`;
  const pinNote = pins.carried || pins.kept ? `<div class="note i sh-pinnote">Připnuté ze seznamu z ${esc(shWhen(prevL))}: ${pins.carried ? `<b>${pins.carried} ${shPl(pins.carried, 'položka přidána', 'položky přidány', 'položek přidáno')}</b> (v urgentech nebyly)` : ''}${pins.carried && pins.kept ? ', ' : ''}${pins.kept ? `${pins.kept} ${shPl(pins.kept, 'je i v urgentech a zůstává připnutá', 'jsou i v urgentech a zůstávají připnuté', 'je i v urgentech a zůstává připnuto')}` : ''}. Odepneš je špendlíkem v řádku.</div>` : '';
  msg.innerHTML = `${pinNote}<div class="note i">${src.paste ? 'Vloženo' : 'Nahráno'} <b>${n} ${shItemsN(n)}</b> ${from}${top ? `, z toho <b>${top} TOP SHORTAGE</b> (v seznamu nahoře)` : ''}${r.top2 ? `${top ? ' a' : ', z toho'} <b>${r.top2} TOP 2</b> (hned pod TOP)` : ''}${r.done ? `, <b>${r.done} Hotovo</b> (podle barvy EANu, na konci seznamu)` : ''}.</div>${shVsNote(shc().lists.find(x => x.id === list.id))}${[
    src.plain ? 'Ve schránce byl jen text bez odkazů, QR kódy proto chybí. Zkopíruj buňky přímo z Excelu (Ctrl+C) a vlož je sem znovu, nebo nahraj soubor.' : '',
    !src.plain && w.noLink ? `${w.noLink} ${shPl(w.noLink, 'položka nemá', 'položky nemají', 'položek nemá')} hypertextový odkaz, v PDF ${w.noLink === 1 ? 'bude' : 'budou'} bez QR kódu.` : '',
    w.noCode ? `${w.noCode} ${shPl(w.noCode, 'položka má', 'položky mají', 'položek má')} odkaz bez activeBarcode, v PDF ${w.noCode === 1 ? 'bude' : 'budou'} bez QR kódu.` : '',
    w.noEan ? `${w.noEan} ${shPl(w.noEan, 'položka nemá', 'položky nemají', 'položek nemá')} EAN (je jen název dílu).` : '',
    r.more ? `Načetlo se prvních ${SH_MAX_ITEMS} položek, ${r.more} dalších se nevešlo.` : '',
    dropped ? `Drží se posledních ${SH_MAX_LISTS} seznamů, nejstarší se smazal.` : '',
  ].filter(Boolean).map(t => `<div class="note w">${esc(t)}</div>`).join('')}${shColsNote('list', src.cols)}${planRes ? shPlanNote(planRes, ui.sh.plan, true) : ''}`;
}
/** Zpráva po nahrání (2.73): jak je seznam proti předchozímu dni; předchozí nezabalený jde rovnou zabalit. */
function shVsNote(l) {
  const prev = shPrevList(l);
  if (!l || !prev) return '';
  const old = l.items.filter(i => (i.days || 1) >= 2).length, again = l.items.filter(i => (i.days || 1) <= 1 && i.again).length, out = (l.out || []).filter(o => !o.manual).length;
  const fresh = l.items.length - old - again;
  return `<div class="note i sh-vsnote">Proti seznamu z ${esc(shWhen(prev))}: <b>na shortage 2 a více dní ${old}</b>, nových ${fresh}${again ? `, znovu na shortage ${again}` : ''}, <b>odbouráno ${out}</b>${out ? ' (v těchto urgentech nejsou, jsou dole v Odstraněno ze shortage)' : ''}.${prev.packed ? '' : ` <button class="btn sec small" type="button" data-shpack="${esc(prev.id)}">Zabalit seznam z ${esc(shWhen(prev))}</button>`}</div>`;
}
/** Předchozí seznam (podle času nahrání), s nímž se seznam porovnává (2.73). */
function shPrevList(l) {
  if (!l) return null;
  return shc().lists.filter(x => x.id !== l.id && (x.at || 0) < (l.at || 0)).sort((a, b) => b.at - a.at)[0] || null;
}
/** Nový seznam, nebo v režimu Doplnit chybějící (2.36) jen chybějící položky do vybraného seznamu. */
function shTake(r, src) {
  if(src.notesTarget){
    const list=shc().lists.find(x=>x.id===src.notesTarget);
    if(!list)return;
    const result=shApplyNotes(list,r.items);
    save();renderShortage();
    $('#shMsg').innerHTML=`<div class="note i">Poznámky doplněny u ${result.updated} položek. Nenalezeno: ${result.missing}, nejednoznačné přiřazení: ${result.ambiguous}.</div>${shColsNote('list',src.cols)}`;
    return;
  }
  const l = ui.sh.merge && shc().lists.find(x => x.id === ui.sh.merge && !x.packed);
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
  // 2.76: položky, které v seznamu už jsou a v novém souboru mají barvu Hotovo, dostanou Hotovo
  const doneN = shMergeDone(l, r.items, null, true).length;
  const doneNow = () => { const n = shMergeDone(l, r.items, { at: Date.now(), by: ui.me.label || '' }).length; if (n) save(); return n; };
  const doneTxt = n => (n ? ` <b>${n} ${shPl(n, 'položka označena', 'položky označeny', 'položek označeno')} Hotovo</b> (v souboru barva Hotovo), ${n === 1 ? 'je' : 'jsou'} na konci seznamu.` : '');
  if (!plan.add.length && !plan.gone.length) {
    const h = plan.have, dn = doneNow();
    stop(`<div class="note i">Nic nechybí: ${h === 1 ? `vložená položka ${from} už v seznamu z ${esc(shWhen(l))} je` : `${h <= 4 ? 'všechny' : 'všech'} ${h} ${shItemsN(h)} ${from} už v seznamu z ${esc(shWhen(l))} ${h <= 4 ? 'jsou' : 'je'}`}.${doneTxt(dn)}</div>`);
    return;
  }
  const tag = i => (i.top ? ' <span class="tag sh-toptag">TOP</span>' : i.top2 ? ' <span class="tag sh-top2tag">TOP 2</span>' : '');
  const rows = plan.add.slice(0, 8).map(i => `<tr><td class="num">${esc(i.order || '—')}</td><td>${esc(i.name || '—')}${tag(i)}</td><td class="num">${esc(i.ean || '—')}</td><td class="r num">${esc(i.qty || '—')}</td></tr>`).join('');
  const goneN = plan.gone.length;
  const res = await dialog({
    title: 'Doplnit chybějící', ok: plan.add.length ? `Doplnit ${plan.add.length}` : 'Doplnit', wide: true,
    html: `<p>Do seznamu z <b>${esc(shWhen(l))}</b> ${from}: ${plan.add.length ? `<b>${plan.add.length} ${shPl(plan.add.length, 'položka chybí', 'položky chybí', 'položek chybí')}</b>` : `kromě ${goneN === 1 ? 'položky, kterou' : 'položek, které'} jsi ze seznamu odebral, nic nechybí`}${plan.have ? `, ${plan.have} ${shPl(plan.have, 'už v seznamu je', 'už v seznamu jsou', 'už v seznamu je')}` : ''}.</p>
      <p class="small muted">Položky, které v seznamu už jsou, zůstanou, jak jsou: pořadí, množství, TOP, oddělení, poznámky i poslední záznamy${doneN ? '; jen barva Hotovo z nového souboru jim dá stav Hotovo' : ''}. Doplněné půjdou na konec své skupiny (TOP SHORTAGE, TOP 2, ostatní, hotové na konci).</p>
      ${doneN ? `<p class="sh-mdone"><b>${doneN} ${shPl(doneN, 'položka', 'položky', 'položek')}</b> ze seznamu ${doneN === 1 ? 'má' : 'mají'} v novém souboru barvu Hotovo: ${doneN === 1 ? 'dostane' : 'dostanou'} stav Hotovo a ${doneN === 1 ? 'přesune se' : 'přesunou se'} na konec seznamu.</p>` : ''}
      ${rows ? `<table class="wa-prev sh-mprev"><thead><tr><th>Objednávka</th><th>Název dílu</th><th>EAN</th><th class="r">Množství</th></tr></thead><tbody>${rows}</tbody></table>${plan.add.length > 8 ? `<p class="tiny muted">… a ${plan.add.length - 8} dalších</p>` : ''}` : ''}
      ${goneN ? `<label class="check sh-mgone"><input type="checkbox" name="back"><span>Vrátit i ${goneN} ${shPl(goneN, 'položku', 'položky', 'položek')}, ${goneN === 1 ? 'kterou' : 'které'} jsi ze seznamu odebral (${esc(plan.gone.slice(0, 3).map(i => i.ean || i.name).join(', '))}${goneN > 3 ? ' …' : ''}).</span></label>` : ''}`,
  });
  if (res.value !== 'ok') return;
  const back = !!(res.form && res.form.elements.namedItem('back') && res.form.elements.namedItem('back').checked);
  const fin = back ? shMergePlan(l, r.items, true) : plan;
  if (!fin.add.length) { const dn = doneNow(); stop(`<div class="note i">Nic se nedoplnilo: ${goneN} ${shPl(goneN, 'chybějící položku', 'chybějící položky', 'chybějících položek')} jsi ze seznamu dřív odebral.${doneTxt(dn)}</div>`); return; }
  const dn = shMergeDone(l, r.items, { at: Date.now(), by: ui.me.label || '' }).length;
  let add = fin.add.map(i => ({ ...i }));
  let planRes = null;
  if (ui.sh.plan) { const tmp = { items: add }; planRes = shApplyPlan(tmp, ui.sh.plan); add = tmp.items; }
  if (back) { const keys = new Set(fin.add.map(shItemKey)); l.gone = (l.gone || []).filter(k => !keys.has(k)); l.out = (l.out || []).filter(o => !(o.manual && keys.has(o.key))); }   // vrácená už není odbouraná (2.73)
  l.items = shTopFirst([...l.items, ...add]);
  S.shortage = cleanShortage(S.shortage);   // id doplněných položek a poddílů
  ui.sh.merge = null;
  ui.sh.q = '';
  save();
  renderShortage();
  const n = fin.add.length, skipped = back ? 0 : goneN;
  const noLink = add.filter(i => !i.link).length, noCode = add.filter(i => i.link && !i.code).length;
  msg.innerHTML = `<div class="note i">${src.paste ? 'Vloženo' : 'Nahráno'} ${from}: do seznamu z <b>${esc(shWhen(l))}</b> ${n === 1 ? 'doplněna' : n <= 4 ? 'doplněny' : 'doplněno'} <b>${n} ${shItemsN(n)}</b>${fin.have ? `, ${fin.have} ${shPl(fin.have, 'už v seznamu byla', 'už v seznamu byly', 'už v seznamu bylo')} (beze změny)` : ''}${skipped ? `, ${skipped} ${shPl(skipped, 'odebraná se nevrátila', 'odebrané se nevrátily', 'odebraných se nevrátilo')}` : ''}.${doneTxt(dn)}</div>${[
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
  $('#shClipboard').classList.toggle('on', !!l);
  bar.innerHTML = l ? `<div><b>Doplnit chybějící do seznamu z ${esc(shWhen(l))}</b> · použij nahoře Vložit ze schránky, Ctrl+V nebo Nahrát Excel. Přidají se jen položky, které v seznamu chybí; nový seznam nevznikne.</div>
    <button class="btn ghost small" type="button" data-shmergeoff>Zrušit</button>` : '';
}
const SH_NONE = 'Vlož celou tabulku urgentů A–S: A EAN, C název, F objednávka, G index, H množství, S oddělení v procesu. Podporovaný je i výstup Shortage z Kooperace (A–H).';

async function shImportFile(file, force = false, notesTarget = null) {
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
    // Kooperace přidává i list Kontrola URGENTY: ten není seznamem dílů k importu.
    // Pojmenovaný Shortage má přednost i tehdy, když je kontrolní report delší.
    let pick = sheets.findIndex(sh => sh.name.trim().toLowerCase() === 'shortage');
    if (pick < 0) {
      pick = 0;
      let most = -1;
      sheets.forEach((sh, i) => { const n = shBuild(sh.all, shColsGuess('list', sh.rows, shColsOf('list')).cols).items.length; if (n > most) { most = n; pick = i; } });
    }
    const how = await shColsFor('list', sheets, { file: file.name, pick, force });
    if (!how) return;
    const best = sheets[how.sheetI];
    const r = shBuild(best.all, how.cols);   // barvy přiřadí až vzorník
    if (!r.items.length) {
      msg.innerHTML = `<div class="note w">V souboru <b>${esc(file.name)}</b> není žádná položka. ${esc(SH_NONE)}</div>${shColsNote('list', how)}`;
      return;
    }
    if (!notesTarget && r.fills.size) await shColorDialog(r);   // Bez barev = TOP jen podle textu ve sloupci TOP
    shTake(r, { file: file.name, sheet: wb.SheetNames.length > 1 ? best.name : '', cols: how, notesTarget });
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
        [...tr.cells].slice(0, SH_MAX_CLIP_COLS).forEach(td => {
          td.querySelectorAll('br').forEach(br => br.replaceWith(' '));
          const a = td.querySelector('a[href]');
          const st = /background(?:-color)?\s*:\s*([^;"']+)/i.exec(td.getAttribute('data-st') || '');
          const bg = st ? st[1].trim() : cls[String(td.className || '').toLowerCase().split(/\s+/).find(k => cls[k]) || ''] || '';
          row.push({ text: td.textContent, link: a ? a.getAttribute('href').trim() : '', fill: shCssHex(bg) });
          for (let i = 1; i < Math.min(td.colSpan || 1, SH_MAX_CLIP_COLS); i += 1) row.push({ text: '', link: '' });
        });
        return row.slice(0, SH_MAX_CLIP_COLS);
      }) };
    }
  }
  return { plain: true, rows: shTsv(text).slice(0, 20001).map(r => r.slice(0, SH_MAX_CLIP_COLS).map(t => ({ text: t, link: '' }))) };
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
/* Velká evidence (2.78): poslední záznamy se ze schránky berou z textu (TSV), ne z HTML. Je to rychlejší,
   nemá limit 20 000 řádků jako tabulka urgentů a odkazy ani barvy evidence nepotřebuje. */
const SH_MAX_REC_ROWS = 300000;
function shClipRecs(text) {
  if (!text || text.length < 3) return null;
  const rows = shTsv(text);
  const head = rows.slice(0, 2000).map(r => r.slice(0, SH_MAX_CLIP_COLS).map(t => ({ text: t, link: '' })));
  if (!(Math.max(0, ...head.slice(0, 50).map(r => r.length)) < 19 && shLooksLikeRecs(head))) return null;
  return { plain: true, rows: rows.slice(0, SH_MAX_REC_ROWS).map(r => r.slice(0, SH_MAX_CLIP_COLS).map(t => ({ text: t, link: '' }))), cut: Math.max(0, rows.length - SH_MAX_REC_ROWS) };
}
async function shPaste(html, text, force = false) {
  const msg = $('#shMsg');
  const recClip = shClipRecs(text);
  const clip = recClip || shClipRows(html, text);
  const movement = !!recClip || (Math.max(0, ...clip.rows.slice(0,50).map(r => r.length)) < 19 && shLooksLikeRecs(clip.rows));
  ui.sh.last = { ...(ui.sh.last || {}), [movement ? 'move' : 'list']: { html, text } };
  // poslední záznamy (A QR kód, B datum a čas, C ks, D stav) se poznají podle data ve sloupci B
  if (movement) {
    const how = await shColsFor('move', [{ name: 'schránka', rows: shTextRows(clip.rows) }], { file: 'vloženo ze schránky', force });
    if (how) shPasteRecs(clip.rows, { file: 'vloženo ze schránky', paste: true, cols: how, cut: clip.cut || 0 });
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
    // 2.78: na výběr listu a sloupců stačí prvních 2 000 řádků, pak se přečtou všechny řádky (jen potřebné sloupce)
    const sheets = wb.SheetNames.map(name => ({ name, all: shSheetRows(X, wb.Sheets[name], 40, -1, 2000) })).map(sh => ({ ...sh, rows: shTextRows(sh.all) }));
    let pick = 0, most = -1;
    sheets.forEach((sh, i) => { const n = shRecBuild(sh.all, shColsGuess('move', sh.rows, shColsOf('move')).cols).recs.size; if (n > most) { most = n; pick = i; } });
    const how = await shColsFor('move', sheets, { file: file.name, pick, force });
    if (!how) return;
    const need = Object.values(shColIdx('move', how.cols)).filter(i => i >= 0);
    const ws = wb.Sheets[sheets[how.sheetI].name], all = shSheetCols(X, ws, need, SH_MAX_REC_ROWS);
    shPasteRecs(all.rows, { file: file.name, cols: how, cut: all.cut });
  } catch (error) {
    msg.innerHTML = `<div class="note w">Evidenci pohybu se nepodařilo otevřít: ${esc(error.message)}</div>`;
  }
}
/** Poslední záznamy (schránka nebo soubor evidence pohybu) k položkám otevřeného seznamu (podle QR kódu). */
/** Kolik položek a poddílů je u nás a kolik odeslaných celých (2.71); total = s množstvím zakázky. */
function shSentSum(l) {
  const out = { here: 0, done: 0, open: 0, total: 0 };
  ((l && l.items) || []).forEach(i => [i, ...(i.subs || [])].forEach(x => { const s = shSentOf(l, x); if (s && s.order != null) { out.total += 1; if (s.st in out) out[s.st] += 1; } }));
  return out;
}
function shPasteRecs(rows, src = {}) {
  const msg = $('#shMsg');
  const l = shWork();
  const r = shRecBuild(rows, src.cols ? src.cols.cols : shColsOf('move'));
  if (!l) {
    msg.innerHTML = `<div class="note w">Vložené řádky vypadají jako poslední záznamy (A QR kód, B datum a čas, C počet ks, D stav), ale ${shc().lists.length ? 'otevřený seznam je zabalený (jen ke čtení). Nejdřív nahraj nebo vlož dnešní urgenty, nebo zabalený seznam rozbal' : 'zatím tu není žádný seznam. Nejdřív nahraj nebo vlož seznam dílů'}.</div>`;
    return;
  }
  if (!r.recs.size) {
    msg.innerHTML = '<div class="note w">Ve vložených řádcích není žádný QR kód. Čeká se A QR kód, B datum a čas, C počet ks a D stav.</div>';
    return;
  }
  const res = shApplyRecs(l, r.recs, { at: Date.now(), by: ui.me.label || '' }, r.sent);
  // 3. krok (2.61): odkud jsou záznamy
  if (res.matched || res.cached) l.moves = { file: (src.file || 'vloženo ze schránky').slice(0, 160), at: Date.now(), by: ui.me.label || '', rows: r.rows };
  S.shortage = cleanShortage(S.shortage);   // id nově přidaných poddílů, sloupce
  if (res.updated || res.added || res.matched || res.cached || res.sent) save();
  renderShortage();
  const other = !res.matched ? shc().lists.find(x => x !== l && x.items.some(i => i.code && r.recs.has(i.code))) : null;
  const miss = res.missing.slice(0, 5).join(', ') + (res.missing.length > 5 ? ` a ${res.missing.length - 5} dalších` : '');
  const rec = n => `${n} ${shPl(n, 'záznam', 'záznamy', 'záznamů')}`;
  const what = [res.cached ? `${shPl(res.cached, 'uložen', 'uloženy', 'uloženo')} <b>${rec(res.cached)}</b> (pamatují se i pro QR varianty a pozdější plán)` : '', res.updated ? `${shPl(res.updated, 'aktualizován', 'aktualizovány', 'aktualizováno')} <b>${rec(res.updated)}</b> u položek a QR variant` : '', res.added ? `podle záznamu přidán${res.added === 1 ? '' : 'o'} <b>${res.added} ${shSubsN(res.added)}</b> s jinou operací` : ''].filter(Boolean).join(', ');
  // 2.71: odeslané kusy na WPA proti množství zakázky z plánu
  const sum = shSentSum(l);
  const sentNote = res.sent ? `<div class="note i">Odesláno na WPA: <b>${res.sent}</b> ${shPl(res.sent, 'nový záznam', 'nové záznamy', 'nových záznamů')} s počtem kusů${sum.total ? ` · díl u nás ${sum.here} · odesláno vše ${sum.done}` : ' · množství zakázky zatím chybí (výrobní plán se sloupcem Množství zakázky)'}.</div>` : '';
  msg.innerHTML = `<div class="note ${res.updated || res.added || res.cached || res.sent ? 'i' : 'w'}">Poslední záznamy k seznamu z <b>${esc(shWhen(l))}</b> (přečteno ${nf(r.rows)} ${shPl(r.rows, 'řádek', 'řádky', 'řádků')} evidence, ${nf(r.recs.size)} ${shPl(r.recs.size, 'kód', 'kódy', 'kódů')}): ${what || 'žádná položka se nezměnila'}.</div>${sentNote}${[
    res.truncated ? `${nf(res.truncated)} ${shPl(res.truncated, 'kód', 'kódy', 'kódů')} mimo tento seznam s nejstaršími záznamy se neuložilo (pro pozdější přiřazení se drží nejnovějších ${nf(SH_MAX_RECORDS)} kódů mimo seznam; kódy položek, poddílů a variant QR se ukládají vždy).` : '',
    res.wpa ? `${res.wpa} ${res.wpa === 1 ? 'poddíl má' : res.wpa <= 4 ? 'poddíly mají' : 'poddílů má'} záznam „Odesláno na WPA“, ${res.wpa === 1 ? 'nepřidal se' : 'nepřidaly se'}.` : '',
    res.same ? `${res.same} ${shPl(res.same, 'položka má', 'položky mají', 'položek má')} stejný záznam, beze změny.` : '',
    res.older ? `${res.older} ${shPl(res.older, 'vložený záznam je starší', 'vložené záznamy jsou starší', 'vložených záznamů je starších')} než uložený: poslední záznam zůstal, ${res.older === 1 ? 'starší se doplnil' : 'starší se doplnily'} do předchozích záznamů dílu.` : '',
    res.missing.length ? `${res.missing.length} ${shPl(res.missing.length, 'kód zatím není přiřazený položce', 'kódy zatím nejsou přiřazené položkám', 'kódů zatím není přiřazených položkám')}: ${miss}.` : '',
    other ? `Kódy patří k seznamu z ${shWhen(other)}. Otevři ho dole v Seznamech a vlož záznamy znovu.` : '',
    r.bad ? `${r.bad} ${shPl(r.bad, 'řádek nemá', 'řádky nemají', 'řádků nemá')} platný QR kód ve sloupci ${esc((src.cols && src.cols.cols.code) || 'A')}.` : '',
    src.cut ? `${nf(src.cut)} dalších řádků je nad limit ${nf(SH_MAX_REC_ROWS)} řádků najednou a nenačetly se. Vlož evidenci po částech, nebo jen novější řádky.` : '',
  ].filter(Boolean).map(t => `<div class="note w">${esc(t)}</div>`).join('')}${shColsNote('move', src.cols)}`;
}

/* ---------- Poddíly z výrobního plánu (2.29) ----------
   Čte se 2. list plánu proudem jako výrobní plán v KPI (waZip, waXlsxSst, waXlsxCells), jen
   sloupce A, E, H, M a AM. Odkaz u EANu poddílu (E) je v <hyperlinks> na konci listu a cíl
   v rels listu (2.29.1 i pro řádky s jinou operací: čekající poddíly přidá poslední záznam
   podle kódu). Jiné soubory (xls, ods) přečte SheetJS.
   Nahraný plán zůstane v paměti okna (ui.sh.plan) a prohledá se i u dalších seznamů. */
const SH_PC = { a: 0, e: 4, h: 7, m: 12, am: 38 };
async function shPlanFast(b, plan, progress, SH_PC = shPcOf(), sheetName = '', mode = 'subs') {
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
  const sh = (sheetName && sheets.find(x => x.name === sheetName)) || (mode === 'items' ? sheets[0] : sheets[1]);
  const L = colLetter(SH_PC.e);   // sloupec EANu poddílu (odkazy)
  if (!sh || !zip.get(sh.path)) throw new Error('list nenalezen');
  if (mode === 'items') plan.itemSheet = sh.name; else plan.sheet = sh.name;
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
      const x = { a, e, h: v[SH_PC.h], m: v[SH_PC.m], op, q: SH_PC.q >= 0 ? v[SH_PC.q] : undefined, rid: '', link: '' };
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
  keep.forEach(x => { if (mode === 'items') shPlanDirectRow(plan,x.e,x.link,SH_PC.am>=0?(x.op??''):undefined,x.h,x.m,x.q); else shPlanRow(plan,x.a,x.e,x.h,x.m,x.op,x.link,x.q); });
}
/** Sloupce plánu jako indexy {a, e, h, m, am} (2.61: podle nastavení). */
function shPcOf(cols) {
  const x = shColIdx('plan', cols || shColsOf('plan'));
  return { a: x.asm, e: x.sub, h: x.index, m: x.order, am: x.op, q: x.qty };
}
async function shPlanRead(file, progress, cols = null, itemCols = null) {
  const b = new Uint8Array(await file.arrayBuffer());
  const pairCols = cols === false ? null : cols || shColsOf('plan');
  const first = itemCols || shColsOf('planItem');
  const itemColumns = shColIdx('planItem', first);
  const ean = itemColumns.ean;
  const itemPc = { a: ean, e: ean, h: itemColumns.index, m: itemColumns.order, am: itemColumns.op, q: itemColumns.qty };
  const plan = shPlanBlank(file.name);
  if (b[0] === 0x50 && b[1] === 0x4b && waDeflateRaw && !window.SH_PLAN_SHEETJS) {
    try {
      await shPlanFast(b, plan, progress, itemPc, first.sheet || '', 'items');
      if (pairCols) await shPlanFast(b, plan, progress, shPcOf(pairCols), pairCols.sheet || '');
      return plan;
    } catch (error) { console.warn('Výrobní plán: rychlé čtení nevyšlo, čte SheetJS', error); }
  }
  const fresh = shPlanBlank(file.name);
  const X = await xlsx();
  const wb = X.read(b, { type: 'array', cellHTML: false, cellStyles: false });
  const read = async (name, pc, mode) => {
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) return;
    if (mode === 'items') fresh.itemSheet = name; else fresh.sheet = name;
    const range = X.utils.decode_range(ws['!ref']);
    const at = (r,c) => c < 0 ? null : ws[X.utils.encode_cell({r,c})];
    for (let r=range.s.r;r<=range.e.r;r++) {
      const cell = at(r,pc.e);
      fresh.total++;
      const qv = pc.q >= 0 ? at(r, pc.q) : null, qty = qv && typeof qv.v === 'number' ? qv.v : shCellText(qv);   // množství zakázky (2.71)
      if (mode === 'items') shPlanDirectRow(fresh,shCellText(cell),shCellLink(cell),pc.am>=0?shCellText(at(r,pc.am)):undefined,shCellText(at(r,pc.h)),shCellText(at(r,pc.m)),pc.q>=0?qty:undefined);
      else shPlanRow(fresh,shCellText(at(r,pc.a)),shCellText(cell),shCellText(at(r,pc.h)),shCellText(at(r,pc.m)),shCellText(at(r,pc.am)),shCellLink(cell),pc.q>=0?qty:undefined);
      if (progress && r % 5000 === 4999) await progress(fresh.total);
    }
  };
  await read(wb.SheetNames[0],itemPc,'items');
  if (pairCols && wb.SheetNames[1]) await read(wb.SheetNames[1],shPcOf(pairCols),'subs');
  return fresh;
}
/** Po výběru alternativní objednávky (2.72): plán v paměti okna doplní poddíly a varianty QR nové objednávky. */
function shAltPlan(l, it) {
  if (!ui.sh.plan || !it) return false;
  shApplyPlan({ items: [it], records: [...shRecordMap(l)].map(([code, r]) => ({ ...r, code })) }, ui.sh.plan);
  return true;
}
/** Poddíly z plánu k seznamu. Když plán k seznamu nic nenajde a seznam poddíly má, nechá je být. */
function shUsePlan(l, plan) {
  const copy = JSON.parse(JSON.stringify(l));
  const res = shApplyPlan(copy, plan);
  if (!res.items && l.items.some(i => (i.subs || []).length)) {
    l.items.forEach((it,i) => { it.link=copy.items[i].link; it.code=copy.items[i].code; it.qrChoices=copy.items[i].qrChoices; it.qrKey=copy.items[i].qrKey; it.qrConflict=copy.items[i].qrConflict; it.planMismatch=copy.items[i].planMismatch; it.planAlts=copy.items[i].planAlts; if(copy.items[i].oqty!=null)it.oqty=copy.items[i].oqty; it.op=copy.items[i].op; it.pop=copy.items[i].pop; it.rec=copy.items[i].rec; });
    return { ...res, kept: true };
  }
  l.items = copy.items;
  l.plan = { file: plan.file, at: plan.at, by: ui.me.label || '' };
  S.shortage = cleanShortage(S.shortage);   // id nových poddílů
  return res;
}
const shSubsN = n => (n === 1 ? 'poddíl' : n >= 2 && n <= 4 ? 'poddíly' : 'poddílů');
function shPlanNote(res, plan, auto) {
  const head = `${auto ? 'Poddíly podle výrobního plánu' : 'Výrobní plán'} <b>${esc(plan.file)}</b> (${plan.itemSheet ? `1. list ${esc(plan.itemSheet)}, ` : ''}${plan.sheet ? `2. list ${esc(plan.sheet)}, ` : ''}${nf(plan.total)} řádků${auto ? `, nahraný v ${esc(shWhenText(plan.at).split(' ').pop())}` : ''})`;
  const updated = (res.operations ? `<div class="note i">Probíhající operace aktualizovány u ${res.operations} položek podle tohoto plánu.</div>` : '')
    + (res.qty ? `<div class="note i">Množství zakázky z plánu doplněno nebo změněno u ${res.qty} ${shPl(res.qty, 'položky', 'položek', 'položek')} a poddílů.</div>` : '');
  const linked = res.linked ? `<div class="note i">Z prvního listu doplněn QR kód u ${res.linked} ${res.linked === 1 ? 'položky' : 'položek'}.</div>` : '';
  if (res.kept) return `<div class="note w">${head}: k položkám seznamu nenašel žádný poddíl, poddíly zůstaly beze změny.</div>${updated}${linked}`;
  return `<div class="note ${res.subs || !plan.sheet ? 'i' : 'w'}">${head}: ${res.subs ? `<b>${res.subs} ${shSubsN(res.subs)}</b> u ${res.items} ${res.items === 1 ? 'sestavy' : 'sestav'}` : plan.sheet ? 'k položkám seznamu nebyly nalezeny poddíly' : 'samostatné díly bez sestav'}.</div>${[
    res.unmatchedFirst ? `U ${res.unmatchedFirst} položek první list obsahuje EAN, ale nesouhlasí objednávka nebo line/index. Odkaz ani operace z těchto řádků se nepřiřadily. Jsou nahoře v sekci „Nelze přidělit odkaz“: v nabídce u položky vyber alternativní objednávku z plánu, nebo zkontroluj sloupce prvního listu.` : '',
    res.conflicts ? `U ${res.conflicts} položek se uložený QR kód liší od variant pro přesnou objednávku a line. Jsou nahoře k ručnímu ověření.` : '',
    res.truncated ? `${res.truncated} dalších poddílů přesahuje limit ${SH_MAX_SUBS} na jednu sestavu.` : '',
    res.noCode ? `${res.noCode} ${res.noCode === 1 ? 'poddíl nemá' : res.noCode <= 4 ? 'poddíly nemají' : 'poddílů nemá'} u EANu odkaz s activeBarcode, v PDF ${res.noCode === 1 ? 'bude' : 'budou'} bez QR kódu.` : '',
    plan.sheet && !plan.rows.size && !plan.other.size ? `Ve druhém listu ${plan.sheet} nejsou řádky sestav a poddílů podle zvolených sloupců.` : '',
    res.ambiguous ? `U ${res.ambiguous} položek má stejný EAN, objednávka a line v prvním listu více QR kódů, najdeš je nahoře v sekci „Nelze přidělit odkaz“. V nabídce u položky vyber variantu podle operace a interního záznamu, nebo zadej vlastní QR kód propiskou.` : '',
  ].filter(Boolean).map(t => `<div class="note w">${esc(t)}</div>`).join('')}${updated}${linked}`;
}
async function shPlanImport(file, force = false) {
  if (!file) return;
  const msg = $('#shMsg');
  if (/\.(csv|txt)$/i.test(file.name)) { msg.innerHTML = '<div class="note w">Výrobní plán nahraj jako soubor Excelu (xlsx): CSV nemá odkazy u EANů poddílů.</div>'; return; }
  ui.sh.last = { ...(ui.sh.last || {}), plan: { file } };
  // První list: EAN, objednávka, line/index a probíhající operace. Druhý list: vazby sestava → poddíl.
  msg.innerHTML = `<div class="note i">Čtu nadpisy výrobního plánu <b>${esc(file.name)}</b>…</div>`;
  let sheets = [];
  try {
    const book = await waPlanOpen(file, { quick: true });
    for (const sh of book) { const { head } = await sh.read({ top: 8 }); sheets.push({ name: sh.name, rows: head }); }
  } catch (error) { msg.innerHTML = `<div class="note w">Výrobní plán se nepodařilo otevřít: ${esc(error.message)}</div>`; return; }
  if (!sheets.length) { msg.innerHTML='<div class="note w">Výrobní plán nemá žádný list.</div>'; return; }
  const firstTime = shc().cols.planItem?.matchVersion!==1;
  const itemHow = await shColsFor('planItem', [sheets[0]], { file: file.name, force: force || firstTime, remember: false });
  if (!itemHow) { msg.innerHTML=''; return; }
  const how = sheets.length > 1 ? await shColsFor('plan', [sheets[1]], { file: file.name, force: force || firstTime, remember: false }) : null;
  if (sheets.length > 1 && !how) { msg.innerHTML=''; return; }
  let tick = 0;
  msg.innerHTML = `<div class="note i">Čtu výrobní plán <b>${esc(file.name)}</b>…</div>`;
  const progress = async n => { if (Date.now() - tick > 250) { tick = Date.now(); msg.innerHTML = `<div class="note i">Čtu výrobní plán <b>${esc(file.name)}</b>: ${nf(n)} řádků…</div>`; await new Promise(res => setTimeout(res, 0)); } };
  let plan;
  try { plan = await shPlanRead(file, progress, how ? how.cols : false, itemHow.cols); } catch (error) { msg.innerHTML = `<div class="note w">Výrobní plán se nepodařilo přečíst: ${esc(error.message)}</div>`; return; }
  shc().cols = { ...shc().cols, planItem: itemHow.cols, ...(how ? { plan: how.cols } : {}) };
  const colNotes = shColsNote('planItem',itemHow) + shColsNote('plan',how);
  ui.sh.plan = plan;
  const l = shWork();
  if (!l) { S.shortage = cleanShortage(S.shortage); save(); renderShortage(); msg.innerHTML = `<div class="note i">Výrobní plán <b>${esc(plan.file)}</b> je načtený (${nf(plan.total)} řádků). Poddíly se doplní k seznamu, který nahraješ nebo vložíš.</div>${colNotes}`; return; }
  const res = shUsePlan(l, plan);
  save();
  renderShortage();
  msg.innerHTML = shPlanNote(res, plan, false) + colNotes;
}

/** Stav tří kroků nad seznamem (2.61). */
function shStepsDraw(l) {
  const st = (n, done, text) => { const el = $(`#shSt${n}`); if (!el) return; el.textContent = text; el.closest('.sh-step').classList.toggle('done', !!done); };
  const pl = ui.sh.plan;
  st(1, l, l ? `${l.items.length} ${shItemsN(l.items.length)} · ${shWhen(l)}${l.file ? ` · ${l.file}` : ''}` : 'Tabulka z Excelu (soubor nebo Ctrl+V)');
  const subsN = l ? l.items.reduce((a, i) => a + (i.subs || []).length + (i.cands || []).length, 0) : 0;
  st(2, l && l.plan, l && l.plan ? `${l.plan.file} · ${subsN} ${shSubsN(subsN)}` : pl ? `${pl.file} načtený, čeká na seznam` : 'Poddíly sestav a probíhající operace');
  const recs = l ? l.items.filter(i => i.rec).length : 0;
  st(3, l && l.moves, l && l.moves ? `${l.moves.file} · záznam u ${recs} z ${l.items.length}` : 'Volitelné – lze přeskočit a rovnou vytvořit PDF urgentů');
  $('#shSkipMove').disabled = !l || !l.items.length;
  $('#shSkipMove').textContent = l && l.moves ? 'Vytvořit PDF urgentů' : 'Přeskočit a vytvořit PDF';
}
/* ---------- Zabalení dne, dny na shortage a historie (2.73) ----------
   Každý nahraný seznam se porovná s předchozím (core shLinkDays): položka ví, kolikátý den je
   na shortage, co z předchozího seznamu v urgentech chybí, je v Odstraněno ze shortage. Zabalený
   seznam je jen ke čtení. Filtr TOP / TOP 2 / nové / 2 a více dní platí i pro PDF. */
const shDayN = n => (n === 1 ? 'den' : n >= 2 && n <= 4 ? 'dny' : 'dní');
function shAgeTag(i, hasPrev) {
  const d = i.days || 1;
  const again = i.again ? `<span class="tag sh-again" title="Odbouráno ${esc(dayText(i.again))}, pak se zase objevila v urgentech">znovu · odbouráno ${esc(dayText(i.again, false))}</span>` : '';
  if (d >= 2) return `<div class="sh-age"><span class="tag warn sh-agetag${d >= 3 ? ' sh-long' : ''}" title="Na shortage od ${esc(dayText(i.since))}">${d}. den na shortage</span><span class="tiny muted">od ${esc(dayText(i.since, false))}</span>${again}</div>`;
  if (again) return `<div class="sh-age">${again}</div>`;
  return hasPrev ? '<div class="sh-age"><span class="tag sh-newtag">nová</span></div>' : '';
}
/* Výběr podle priority a dnů na shortage: {tiers: Set|null, age: ''|'new'|'old'}, jinak null = vše. */
function shAgeSel(l) {
  if (!l || l.packed) return null;
  const tiers = new Set((ui.sh.tiers || []).filter(k => (k === 'top' ? l.items.some(i => i.top && i.st !== 'done') : k === 'top2' ? l.items.some(i => i.top2 && !i.top && i.st !== 'done') : false)));
  const age = (ui.sh.age === 'new' || ui.sh.age === 'old') && shPrevList(l) ? ui.sh.age : ui.sh.age === 'pin' && l.items.some(i => i.pin) ? 'pin' : '';
  return tiers.size || age ? { tiers: tiers.size ? tiers : null, age } : null;
}
function shAgeHit(i, sel) {
  if (!sel) return true;
  if (sel.tiers && (i.st === 'done' || !sel.tiers.has(i.top ? 'top' : i.top2 ? 'top2' : ''))) return false;   // hotové (2.76) ne
  const d = i.days || 1;
  return sel.age === 'old' ? d >= 2 : sel.age === 'new' ? d <= 1 : sel.age === 'pin' ? !!i.pin : true;
}
function shAgePick(items, sel) { return sel ? items.filter(i => shAgeHit(i, sel)) : items; }
function shAgeText(sel) {
  if (!sel) return '';
  return [sel.tiers ? `Jen ${[...sel.tiers].map(k => (k === 'top' ? 'TOP SHORTAGE' : 'TOP 2')).join(' a ')}` : '', sel.age === 'old' ? 'na shortage 2 a více dní' : sel.age === 'new' ? 'nové dnes' : sel.age === 'pin' ? 'připnuté' : ''].filter(Boolean).join(' · ');
}
function shAgeChips(l, hasPrev) {
  const top = l.items.filter(i => i.top && i.st !== 'done').length, top2 = l.items.filter(i => i.top2 && !i.top && i.st !== 'done').length;
  const old = l.items.filter(i => (i.days || 1) >= 2).length, fresh = l.items.length - old, pins = l.items.filter(i => i.pin).length;
  if (!top && !top2 && !hasPrev && !pins) return '';
  const sel = shAgeSel(l), tiers = sel && sel.tiers, age = sel ? sel.age : '';
  const chip = (attr, val, on, label, n) => `<button type="button" class="chip${on ? ' on' : ''}" ${attr}="${val}" aria-pressed="${on}"${n || on ? '' : ' disabled'}>${label} <span class="sh-opn">${n}</span></button>`;
  return `<div class="sh-ops sh-agef"><span class="small muted">Priorita a dny na shortage</span><div class="chips" role="group" aria-label="Filtr podle priority a dnů na shortage">
      <button type="button" class="chip${sel ? '' : ' on'}" data-shagef="all" aria-pressed="${!sel}">Všechny</button>
      ${chip('data-shtierf', 'top', !!(tiers && tiers.has('top')), 'TOP SHORTAGE', top)}${chip('data-shtierf', 'top2', !!(tiers && tiers.has('top2')), 'TOP 2', top2)}
      ${hasPrev ? chip('data-shagef', 'new', age === 'new', 'Nové dnes', fresh) + chip('data-shagef', 'old', age === 'old', 'Na shortage 2 a více dní', old) : ''}${pins ? chip('data-shagef', 'pin', age === 'pin', 'Připnuté', pins) : ''}</div>
    ${sel ? `<p class="tiny muted">Ukázané jsou jen vybrané položky (${esc(shAgeText(sel))}), sestava i se svými poddíly. PDF k tisku vytiskne jen je.</p>` : ''}</div>`;
}
/** Odstraněno ze shortage: položky předchozího seznamu, které v těchto urgentech nejsou, a ručně odebrané. Bez tabulky: tbody tr v #shView patří položkám. */
function shOutHtml(l) {
  const prev = shPrevList(l);
  const out = (l.out || []).slice().sort((a, b) => (b.top - a.top) || (b.top2 - a.top2) || (b.days - a.days));
  if (!out.length) return prev ? `<p class="small muted sh-outnone">Proti seznamu z ${esc(shWhen(prev))} se nic neodbouralo, všechny jeho položky v urgentech zůstaly.</p>` : '';
  const auto = out.filter(o => !o.manual).length, man = out.length - auto;
  const rows = out.map(o => `<div class="sh-outrow${o.top ? ' sh-top' : o.top2 ? ' sh-top2' : ''}" role="row" data-shout="${esc(o.key)}">
      <div role="cell" class="sh-outname">${o.top ? '<span class="tag crit sh-toptag">TOP SHORTAGE</span> ' : o.top2 ? '<span class="tag sh-top2tag">TOP 2</span> ' : ''}<b>${esc(o.name || '—')}</b><span class="tiny muted">EAN ${esc(o.ean || '—')}</span></div>
      <div role="cell"><span class="sh-outk">Objednávka</span>${esc(o.order || '—')}${o.index ? `<span class="tiny muted">index ${esc(o.index)}</span>` : ''}</div>
      <div role="cell" class="num"><span class="sh-outk">Množství</span>${esc(o.qty || '—')}</div>
      <div role="cell"><span class="sh-outk">Na shortage</span><b>${o.days} ${shDayN(o.days)}</b><span class="tiny muted">${esc(dayText(o.since, false))} – ${esc(dayText(o.day, false))}</span></div>
      <div role="cell"><span class="sh-outk">Poslední záznam</span>${o.rec ? `${esc(o.rec.state || '—')}<span class="tiny muted">${esc(o.rec.when || '')}</span>` : '<span class="muted">—</span>'}${o.op ? `<span class="tiny muted">${esc(o.op)}</span>` : ''}</div>
      <div role="cell">${o.manual ? `<span class="tag">odebráno ručně</span>${o.by ? `<span class="tiny muted">${esc(o.by)}</span>` : ''}` : '<span class="tag ok">v urgentech už není</span>'}</div></div>`).join('');
  return `<details class="card sh-out" id="shOut"${ui.sh.outOpen === false ? '' : ' open'}>
    <summary><b>Odstraněno ze shortage</b> <span class="small muted">· ${out.length} ${shItemsN(out.length)}${auto ? ` · ${auto} ${auto === 1 ? 'položka v těchto urgentech už není' : auto <= 4 ? 'položky v těchto urgentech už nejsou' : 'položek v těchto urgentech už není'}${prev ? ` (proti seznamu z ${esc(shWhen(prev))})` : ''}` : ''}${man ? ` · ${man} ${man === 1 ? 'odebrána' : man <= 4 ? 'odebrány' : 'odebráno'} ručně` : ''}</span></summary>
    <div class="sh-outlist" role="table" aria-label="Odstraněno ze shortage"><div class="sh-outrow sh-outhead" role="row" aria-hidden="true"><div>Název dílu · EAN</div><div>Číslo objednávky</div><div class="num">Množství</div><div>Na shortage</div><div>Poslední záznam</div><div>Jak</div></div>${rows}</div>
  </details>`;
}
/** Seznamy a zabalené dny (přepínání). */
function shListsHtml(c, l) {
  if (!c.lists.length || (c.lists.length === 1 && l && !l.packed)) return '';
  return `<section class="card sh-lists"><h3>Seznamy a zabalené dny</h3><div class="chips">${c.lists.map(x => `<button type="button" class="chip${l && x.id === l.id ? ' on' : ''}${x.packed ? ' sh-packedchip' : ''}" data-shopen="${esc(x.id)}" aria-pressed="${!!(l && x.id === l.id)}">${esc(shWhen(x))} · ${x.items.length}${x.packed ? ' · zabaleno' : ''}</button>`).join('')}</div>
      <p class="tiny muted">Drží se posledních ${SH_MAX_LISTS} nahraných seznamů, starší zůstanou v Historii jako souhrn dne a odbourané položky.</p></section>`;
}
/** Přepínač pohledu: seznam, rozbor, historie. */
function shModeBar(c) {
  const m = ui.sh.mode || 'list';
  const b = (k, t) => `<button type="button" class="chip${m === k ? ' on' : ''}" data-shmode="${k}" aria-pressed="${m === k}">${t}</button>`;
  return `<div class="chips sh-mode noprint" role="group" aria-label="Pohled">${b('list', 'Seznam a tisk')}${b('rozbor', 'Rozbor položek')}${c.lists.length || (c.hist || []).length ? b('historie', 'Historie') : ''}</div>`;
}
/** Poddíl sestavy, který se zpracovává na jiném oddělení (2.78): bez QR kódu, poznámky a kolonek, s tlačítkem Zobrazit plně. */
function shSubAwayHtml(i, x, j, k, away, o) {
  return `<tr class="sh-sub sh-subaway${o.tierCls ? ` ${o.tierCls}` : ''}${x.pdfHide || i.pdfHide ? ' sh-pdfoff' : ''}" data-shsub="${esc(x.id)}" data-shparent="${esc(i.id)}" data-shtier="${o.tierKey}" data-shdays="${i.days || 1}"${i.pin ? ' data-shpinned="1"' : ''} data-shdeptrow="${esc(o.dIn || '-')}" data-shop="${esc(shOpKey(x.op))}" data-shaway="1" data-shrow="${esc([o.self, 'poddíl', x.ean, x.code, x.op, x.note, x.rec ? x.rec.state : '', away].join(' ').toLowerCase())}">
      <td class="sh-gripc"></td>
      <td class="num muted" data-label="#">${j + 1}.${k + 1}</td>
      <td class="sh-ord sh-subord" data-label="Číslo objednávky"><span class="sh-subarrow" aria-hidden="true"></span>${esc(x.order || i.order || '—')}</td>
      <td class="name" data-label="Poddíl"><span class="tag sh-subtag">PODDÍL</span>${x.name ? `<div>${esc(x.name)}</div>` : ''}<div class="sh-ean">${o.eanHtml(x)}</div></td>
      <td data-label="Index">${esc(x.index || i.index || '—')}</td>
      <td class="num sh-qty" data-label="Urgentní množství">${esc(x.qty || '—')}</td>
      <td class="sh-opc" data-label="Oddělení / Probíhající operace">${esc(x.op || '—')}<div class="sh-away">Tento díl se zpracovává na jiném oddělení: <b>${esc(away)}</b></div></td>
      <td data-label="QR kód"><span class="small muted">jiné oddělení</span><div class="sh-fullc"><button class="btn sec small sh-fullbtn" type="button" data-shsubfull="${esc(x.id)}" aria-pressed="false" title="Ukázat a tisknout poddíl celý i tady: QR kód, záznam, kolonky">Zobrazit plně</button></div></td>
      <td class="sh-notec" data-label="Poznámka"></td>
      <td class="sh-actc"></td></tr>`;
}
/** Předchozí záznamy dílu (2.78): dva starší pod posledním, novější první. */
function shRecPrevHtml(r) {
  const prev = (r && r.prev) || [];
  if (!prev.length) return '';
  const q = v => (v ? (/^[\d\s.,]+$/.test(v) ? `${v} ks` : v) : '');
  return `<ol class="sh-recprev" aria-label="Předchozí záznamy">${prev.map(x => `<li><span class="sh-recst">${esc(x.state || '—')}</span>${x.qty ? ` <b>${esc(q(x.qty))}</b>` : ''} <span class="muted">${esc(x.when || '')}</span></li>`).join('')}</ol>`;
}
/** Zabalený seznam jen ke čtení: položky, dny na shortage, co se ten den odbouralo. */
function shPackedHtml(l) {
  const n = l.items.length, hasPrev = !!shPrevList(l);
  const rows = l.items.map((i, j) => {
    const subs = (i.subs || []).length;
    const rec = i.rec ? `<div class="sh-rec">${i.rec.state ? `<span class="tag sh-state">${esc(i.rec.state)}</span>` : ''}<span class="muted">${esc(i.rec.when || '')}</span></div>${shRecPrevHtml(i.rec)}` : '';
    return `<tr class="${i.top ? 'sh-top' : i.top2 ? 'sh-top2' : ''}" data-shpk="${esc(i.id)}">
      <td class="num muted" data-label="#">${j + 1}</td>
      <td class="sh-ord" data-label="Číslo objednávky">${esc(i.order || '—')}</td>
      <td class="name" data-label="Název dílu">${i.top ? '<span class="tag crit sh-toptag">TOP SHORTAGE</span> ' : i.top2 ? '<span class="tag sh-top2tag">TOP 2</span> ' : ''}${shPinTags(i)}${esc(i.name || '—')}<div class="sh-ean">EAN ${esc(i.ean || '—')}</div>${shAgeTag(i, hasPrev)}</td>
      <td data-label="Index">${esc(i.index || '—')}</td>
      <td class="num sh-qty" data-label="Urgentní množství"><b>${esc(i.qty || '—')}</b></td>
      <td class="sh-opc" data-label="Probíhající operace">${esc(i.op || '—')}${rec}</td>
      <td data-label="Stav · poznámka">${i.st ? `<span class="tag">${esc(shStName(i.st))}</span>` : ''}${i.note ? `<div class="small">${esc(i.note)}</div>` : ''}${subs ? `<div class="tiny muted">${subs} ${shSubsN(subs)} z plánu</div>` : ''}${!i.st && !i.note && !subs ? '<span class="muted">—</span>' : ''}</td></tr>`;
  }).join('');
  return `<article class="card sh-card sh-packed">
      <div class="card-head"><div><h2>Zabalený seznam z ${esc(shWhen(l))}</h2>
        <p class="small muted">${n} ${shItemsN(n)}${l.file ? ` · ${esc(l.file)}` : ''} · zabaleno ${esc(shWhenText(l.packed.at))}${l.packed.by ? ` · ${esc(l.packed.by)}` : ''} · jen ke čtení</p></div>
        <div class="row gap wrap sv-actions"><button class="btn ghost small" type="button" data-shopen="" title="Zpět na otevřený seznam, nebo na nahrání dnešních urgentů">Zavřít</button><button class="btn sec small" type="button" data-shunpack="${esc(l.id)}" title="Seznam půjde zase upravovat (poznámky, záznamy, TOP…)">Rozbalit</button>
          <button class="btn small" type="button" data-shpdf="${esc(l.id)}"${n ? '' : ' disabled'}>PDF k tisku</button>
          <button class="icon-btn" type="button" data-shdel="${esc(l.id)}" title="Smazat seznam" aria-label="Smazat seznam z ${esc(shWhen(l))}">${I.x}</button></div></div>
      <div class="table-card flat"><table class="stack sh-tab sh-pktab sh-nodrag"><thead><tr><th>#</th><th>Číslo objednávky</th><th>Název dílu · EAN</th><th>Index</th><th class="num">Urgentní množství</th><th>Probíhající operace</th><th>Stav · poznámka</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${n ? '' : '<p class="tiny muted">V seznamu nezbyla žádná položka.</p>'}
    </article>${shOutHtml(l)}`;
}
/** Historie: jak rychle se položky odbourávají, po dnech, nejdéle na shortage teď a odbourané položky. */
function shHistHtml(c) {
  const h = shHistory(c);
  const cur = c.lists.find(x => !x.packed) || null;
  const sel = (ui.sh.tiers || []).length || ui.sh.age === 'old' ? { tiers: (ui.sh.tiers || []).length ? new Set(ui.sh.tiers) : null, age: ui.sh.age === 'old' ? 'old' : '' } : null;
  const outF = h.out.filter(o => shAgeHit(o, sel));
  const pct = (a, b) => (b ? `${nf(a / b * 100, 0)} %` : '—');
  const tiles = `<div class="stats">${[
    statTile('Odbouráno', String(h.n), h.days.length ? `za ${h.days.length} ${h.days.length === 1 ? 'nahraný den' : h.days.length <= 4 ? 'nahrané dny' : 'nahraných dní'}${h.from ? ` · od ${esc(dayText(h.from, false))}` : ''}` : 'zatím nic'),
    statTile('Ø dní na shortage', h.avg == null ? '—' : nf(h.avg, 1), 'u odbouraných položek'),
    statTile('Odbouráno do 1 dne', pct(h.quick, h.n), h.n ? `${h.quick} z ${h.n} položek` : 'zatím nic', h.n && h.quick / h.n >= 0.5 ? 'ok' : ''),
    statTile('TOP shortage', h.avgTop == null ? '—' : `${nf(h.avgTop, 1)} ${shDayN(Math.round(h.avgTop))}`, `Ø u ${h.top} odbouraných TOP${h.avgTop2 != null ? ` · TOP 2 Ø ${nf(h.avgTop2, 1)}` : ''}`, h.avgTop != null && h.avgTop >= 3 ? 'warn' : ''),
    statTile('Teď na shortage déle', cur ? String(cur.items.filter(i => (i.days || 1) >= 2).length) : '—', cur ? `2 a více dní v seznamu z ${esc(shWhen(cur))}` : 'žádný otevřený seznam', cur && cur.items.some(i => (i.days || 1) >= 2) ? 'warn' : ''),
  ].join('')}</div>`;
  // rozložení: za kolik dní se položka odbourá (jedna barva, délka = počet)
  const maxBin = Math.max(1, ...h.bins.map(b => b.n));
  const bins = h.n ? `<section class="card sh-hbins"><h3>Za kolik dní se položka odbourá</h3><div class="sh-hbars">${h.bins.map(b => `<div class="sh-hbar"><span>${b.name}</span><span class="sh-hbtrack"><i data-w="${(b.n / maxBin * 100).toFixed(1)}"></i></span><b class="num">${b.n}</b><span class="tiny muted num">${pct(b.n, h.n)}</span></div>`).join('')}</div></section>` : '';
  const tiers = new Set(ui.sh.tiers || []);
  const chips = `<div class="sh-ops sh-agef"><span class="small muted">Priorita a dny na shortage</span><div class="chips" role="group" aria-label="Filtr odbouraných položek">
      <button type="button" class="chip${sel ? '' : ' on'}" data-shagef="all" aria-pressed="${!sel}">Všechny</button>
      <button type="button" class="chip${tiers.has('top') ? ' on' : ''}" data-shtierf="top" aria-pressed="${tiers.has('top')}">TOP SHORTAGE <span class="sh-opn">${h.top}</span></button>
      <button type="button" class="chip${tiers.has('top2') ? ' on' : ''}" data-shtierf="top2" aria-pressed="${tiers.has('top2')}">TOP 2 <span class="sh-opn">${h.top2}</span></button>
      <button type="button" class="chip${ui.sh.age === 'old' ? ' on' : ''}" data-shagef="old" aria-pressed="${ui.sh.age === 'old'}">Na shortage 2 a více dní <span class="sh-opn">${h.out.filter(o => o.days >= 2).length}</span></button></div></div>`;
  const dayRows = h.days.map(d => {
    const a = d.out.length ? Math.round(d.out.reduce((s, o) => s + o.days, 0) / d.out.length * 10) / 10 : null;
    return `<tr data-shhday="${esc(d.id)}"><td data-label="Den"><b>${esc(dayText(d.day))}</b><div class="tiny muted">${esc(shWhenText(d.at).split(' ').pop())}${d.file ? ` · ${esc(d.file)}` : ''}</div></td>
      <td class="num" data-label="Položek">${d.n}</td><td class="num" data-label="TOP">${d.top || '—'}</td><td class="num" data-label="TOP 2">${d.top2 || '—'}</td>
      <td class="num" data-label="Nové">${d.fresh}${d.again ? `<div class="tiny muted">znovu ${d.again}</div>` : ''}</td><td class="num" data-label="2 a více dní">${d.carried ? `<b>${d.carried}</b>` : '0'}${d.maxDays >= 2 ? `<div class="tiny muted">nejdéle ${d.maxDays} ${shDayN(d.maxDays)}</div>` : ''}</td>
      <td class="num" data-label="Odbouráno"><b>${d.out.length}</b>${d.out.some(o => o.manual) ? `<div class="tiny muted">ručně ${d.out.filter(o => o.manual).length}</div>` : ''}</td><td class="num" data-label="Ø dní odbouraných">${a == null ? '—' : nf(a, 1)}</td>
      <td data-label="Stav">${d.live ? `${d.packed ? '<span class="tag">zabaleno</span>' : '<span class="tag ok">otevřený</span>'} <button class="link small" type="button" data-shopen="${esc(d.id)}" data-shmodeto="list">Otevřít</button>` : '<span class="tag">jen souhrn</span>'}</td></tr>`;
  }).join('');
  const longest = cur ? cur.items.filter(i => (i.days || 1) >= 2 && shAgeHit(i, sel)).sort((a, b) => (b.days - a.days) || (b.top - a.top) || (b.top2 - a.top2)).slice(0, 20) : [];
  const longHtml = cur ? `<section class="card sh-hlong"><h3>Nejdéle na shortage teď</h3><p class="small muted">Seznam z ${esc(shWhen(cur))}${longest.length ? '' : ': žádná položka není na shortage 2 a více dní'}</p>${longest.length ? `<div class="sh-outlist" role="table" aria-label="Nejdéle na shortage">${longest.map(i => `<div class="sh-outrow${i.top ? ' sh-top' : i.top2 ? ' sh-top2' : ''}" role="row"><div role="cell" class="sh-outname">${i.top ? '<span class="tag crit sh-toptag">TOP SHORTAGE</span> ' : i.top2 ? '<span class="tag sh-top2tag">TOP 2</span> ' : ''}<b>${esc(i.name || '—')}</b><span class="tiny muted">EAN ${esc(i.ean || '—')}</span></div><div role="cell"><span class="sh-outk">Objednávka</span>${esc(i.order || '—')}</div><div role="cell" class="num"><span class="sh-outk">Množství</span>${esc(i.qty || '—')}</div><div role="cell"><span class="sh-outk">Na shortage</span><b>${i.days}. den</b><span class="tiny muted">od ${esc(dayText(i.since, false))}</span></div><div role="cell"><span class="sh-outk">Poslední záznam</span>${i.rec ? esc(i.rec.state || '—') : '<span class="muted">—</span>'}${i.op ? `<span class="tiny muted">${esc(i.op)}</span>` : ''}</div><div role="cell">${i.st ? `<span class="tag">${esc(shStName(i.st))}</span>` : ''}</div></div>`).join('')}</div>` : ''}</section>` : '';
  const SHOW = 300;
  const outRows = outF.slice(0, SHOW).map(o => `<div class="sh-outrow${o.top ? ' sh-top' : o.top2 ? ' sh-top2' : ''}" role="row"><div role="cell" class="sh-outname">${o.top ? '<span class="tag crit sh-toptag">TOP SHORTAGE</span> ' : o.top2 ? '<span class="tag sh-top2tag">TOP 2</span> ' : ''}<b>${esc(o.name || '—')}</b><span class="tiny muted">EAN ${esc(o.ean || '—')}</span></div><div role="cell"><span class="sh-outk">Objednávka</span>${esc(o.order || '—')}${o.index ? `<span class="tiny muted">index ${esc(o.index)}</span>` : ''}</div><div role="cell"><span class="sh-outk">Odbouráno</span><b>${esc(dayText(o.day, false))}</b></div><div role="cell"><span class="sh-outk">Na shortage</span><b>${o.days} ${shDayN(o.days)}</b><span class="tiny muted">od ${esc(dayText(o.since, false))}</span></div><div role="cell"><span class="sh-outk">Poslední záznam</span>${o.rec ? `${esc(o.rec.state || '—')}<span class="tiny muted">${esc(o.rec.when || '')}</span>` : '<span class="muted">—</span>'}</div><div role="cell">${o.manual ? '<span class="tag">odebráno ručně</span>' : '<span class="tag ok">v urgentech už není</span>'}</div></div>`).join('');
  return `${tiles}${bins}
    <section class="card sh-hdays"><div class="card-head"><div><h2>Po dnech</h2><p class="small muted">Každý nahraný seznam proti předchozímu: nové položky, položky na shortage 2 a více dní a odbourané (v dalších urgentech už nebyly).</p></div>
      <div class="row gap wrap"><button class="btn small" type="button" data-shhxlsx${h.days.length ? '' : ' disabled'}>Historie do Excelu</button></div></div>
      <div class="table-card flat"><table class="stack sh-htab"><thead><tr><th>Den</th><th class="num">Položek</th><th class="num">TOP</th><th class="num">TOP 2</th><th class="num">Nové</th><th class="num">2 a více dní</th><th class="num">Odbouráno</th><th class="num">Ø dní odbouraných</th><th>Seznam</th></tr></thead><tbody>${dayRows}</tbody></table></div></section>
    ${longHtml}
    <section class="card sh-hout"><h3>Odbourané položky</h3>${chips}${outF.length ? `<div class="sh-outlist" role="table" aria-label="Odbourané položky"><div class="sh-outrow sh-outhead" role="row" aria-hidden="true"><div>Název dílu · EAN</div><div>Číslo objednávky</div><div>Odbouráno</div><div>Na shortage</div><div>Poslední záznam</div><div>Jak</div></div>${outRows}</div>${outF.length > SHOW ? `<p class="tiny muted">Ukázaných je ${SHOW} nejnovějších z ${outF.length}, všechny jsou v Excelu.</p>` : ''}` : `<p class="small muted">${h.n ? 'Výběru neodpovídá žádná odbouraná položka.' : 'Zatím se nic neodbouralo. Odbourané položky přibudou s dalším nahraným seznamem urgentů.'}</p>`}</section>`;
}
async function exportShHistXlsx() {
  try {
    const X = await xlsx();
    const wb = X.utils.book_new();
    shHistorySheets(shHistory(shc())).forEach(sh => {
      const ws = X.utils.aoa_to_sheet(sh.rows.map(row => row.map(safeCell)));
      ws['!cols'] = sh.cols.map(wch => ({ wch }));
      X.utils.book_append_sheet(wb, ws, sh.name);
    });
    downloadFile(`shortage-historie-${todayIso()}.xlsx`, new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch (error) {
    toast(`Excel se nepodařilo vytvořit: ${error.message}`, true);
  }
}
async function shPackList(id) {
  const l = shc().lists.find(x => x.id === id);
  if (!l || l.packed) return;
  if (!(await confirmBox('Zabalit seznam?', `Seznam z ${shWhen(l)} (${l.items.length} ${shItemsN(l.items.length)}) půjde do historie jen ke čtení. Až nahraješ nové urgenty, porovnají se s ním: u položky uvidíš, kolikátý den je na shortage, a co z urgentů zmizí, bude v Odstraněno ze shortage. Rozbalit ho jde kdykoli.`, 'Zabalit'))) return;
  l.packed = { at: Date.now(), by: ui.me.label || '' };
  S.shortage = cleanShortage(S.shortage);   // 2.78: zabalený den si nechá jen záznamy svých kódů
  if (ui.sh.open === l.id) ui.sh.open = null;
  if (ui.sh.merge === l.id) ui.sh.merge = null;
  save();
  renderShortage();
  const next = shList();
  $('#shMsg').innerHTML = `<div class="note i">Seznam z <b>${esc(shWhen(l))}</b> je zabalený v historii.${next ? ` Otevřený je seznam z ${esc(shWhen(next))}.` : ' Nahraj nebo vlož dnešní urgenty.'}</div>`;
}
function renderShortage() {
  const box = $('#shView');
  if (!box || !S) return;
  shMergeBar();
  const c = shc();
  const l = shList();
  shStepsDraw(shWork());
  const steps = $('#view-shortage .sh-steps');
  if (steps) steps.hidden = false;
  // historie (2.73): jak rychle se položky odbourávají
  if (ui.sh.mode === 'historie' && (c.lists.length || (c.hist || []).length)) { box.innerHTML = `${shModeBar(c)}${shHistHtml(c)}`; setWidths(box); return; }
  // průvodce nahráním (2.78): běží, nebo není aktivní seznam (den zabalený, zatím nic)
  if (ui.sh.wiz) { if (steps) steps.hidden = true; box.innerHTML = shWizHtml(); return; }
  if (!l) { if (steps) steps.hidden = true; box.innerHTML = `${c.lists.length ? shModeBar(c) : ''}${shWizIntroHtml(c)}${c.lists.length ? shListsHtml(c, null) : ''}`; return; }
  const n = l.items.length, coded = l.items.filter(i => i.code).length, recs = l.items.filter(i => i.rec).length;
  const doneN = l.items.filter(i => i.st === 'done').length, top = l.items.filter(i => i.top && i.st !== 'done').length, top2 = l.items.filter(i => i.top2 && !i.top && i.st !== 'done').length;   // hotové (2.76) mimo TOP
  const sentSum = shSentSum(l);
  const depts = c.depts || [];
  const dmap = shDeptMap(c);
  const dName = id => shDeptName(c, id);   // i K prověření (2.78)
  const subsN = l.items.reduce((a, i) => a + (i.subs || []).length, 0);
  const hidN = l.items.reduce((a, i) => a + (i.pdfHide ? 1 + (i.subs || []).length : (i.subs || []).filter(x => x.pdfHide).length), 0);
  // proti předchozímu dni (2.73)
  const hasPrev = !!shPrevList(l);
  const oldN = l.items.filter(i => (i.days || 1) >= 2).length, againN = l.items.filter(i => (i.days || 1) <= 1 && i.again).length, outN = (l.out || []).filter(o => !o.manual).length;
  const tiles = `<div class="stats${hasPrev ? ' sh-six' : ''}">${[
    statTile('Seznam', esc(dayText(todayIso(l.at))), `nahráno v ${esc(shWhen(l).split(' ').pop())}${l.by ? ` · ${esc(l.by)}` : ''}`),
    statTile('Položek', String(n), [doneN ? `hotovo ${doneN}` : '', subsN ? `+ ${subsN} ${shSubsN(subsN)} z plánu` : '', !doneN && !subsN ? (l.file ? esc(l.file) : 'chybějící díly') : ''].filter(Boolean).join(' · ')),
    statTile('TOP shortage', String(top), `${top ? 'v seznamu nahoře' : 'žádná'}${top2 ? ` · TOP 2: ${top2}` : ''}`, top ? 'crit' : top2 ? 'warn' : ''),
    statTile('S QR kódem', String(coded), coded === n ? 'všechny mají kód' : `bez kódu ${n - coded}`, coded === n ? '' : 'warn'),
    statTile('Poslední záznam', String(recs), `${recs ? `z ${n} položek` : 'vlož přes Ctrl+V'}${sentSum.here ? ` · u nás ${sentSum.here}` : ''}`, sentSum.here ? 'warn' : ''),
    hasPrev ? statTile('Na shortage 2+ dní', String(oldN), `nových ${n - oldN - againN}${againN ? ` · znovu ${againN}` : ''} · odbouráno ${outN}`, oldN ? 'warn' : '') : '',
  ].join('')}</div>`;
  if (l.packed) { box.innerHTML = `${tiles}${shModeBar(c)}${ui.sh.mode === 'rozbor' ? shRozborHtml(l) : shPackedHtml(l)}${shListsHtml(c, l)}`; return; }
  const altRecs = shRecordMap(l);   // poslední záznamy k alternativním objednávkám (2.72)
  // 2.71: odesláno na WPA proti množství zakázky z výrobního plánu
  const sentHtml = x => {
    const st = shSentOf(l, x);
    if (!st) return '';
    const t = shSentText(st);
    const cls = st.st === 'here' ? 'tag warn' : st.st === 'done' ? 'tag ok' : 'small muted';
    return `<div class="sh-sent" data-shsent="${st.st}"><span class="${cls}">${esc(st.st === 'here' ? `U nás ${nf(st.left, 3)} ks` : st.st === 'done' ? 'Odesláno na WPA vše' : t)}</span>${st.st === 'info' || st.st === 'open' ? '' : `<span class="small muted">${esc(st.st === 'here' ? `odesláno na WPA ${nf(st.sent, 3)} z ${nf(st.order, 3)} ks` : `${nf(st.sent, 3)} z ${nf(st.order, 3)} ks`)}</span>`}</div>`;
  };
  const recHtml = x => (x.rec ? `<div class="sh-rec">${x.rec.state ? `<span class="tag sh-state">${esc(x.rec.state)}</span>` : ''}${x.rec.qty ? `<b>${esc(/^[\d\s.,]+$/.test(x.rec.qty) ? `${x.rec.qty} ks` : x.rec.qty)}</b>` : ''}<span class="muted">${esc(x.rec.when)}</span></div>${shRecPrevHtml(x.rec)}` : '');
  const eanHtml = x => `EAN ${x.link ? `<a href="${esc(x.link)}" target="_blank" rel="noopener noreferrer" draggable="false">${esc(x.ean || 'odkaz')}</a>` : esc(x.ean || '—')}`;
  const rowHtml = (i, j, secId = '') => {
    const rec = recHtml(i);
    const dIn = i.splitDept || shDeptOf(c, i, dmap);
    // 2.78: sestava s poddíly z víc oddělení je v každém z nich; poddíl jiného oddělení bez QR (dokud ho nezobrazíš plně)
    const ds = secId === 'unlinked' || secId === SH_DONE_SEC ? [dIn] : shSplitDepts(c, i, dmap);
    const split = ds.length > 1;
    const awayOf = x => (split && !shSubHere(c, i, x, dIn, dmap) ? dName(shSubDept(c, x, dmap)) : '');
    // 2.76: Hotovo (zelená ve vzorníku nebo ručně) = na konci seznamu, bez barvy TOP a TOP 2
    const done = i.st === 'done', tierCls = done ? 'sh-done' : i.top ? 'sh-top' : i.top2 ? 'sh-top2' : '', tierKey = done ? 'done' : i.top ? 'top' : i.top2 ? 'top2' : '';
    const self = [i.order, i.name, i.ean, i.index, i.op, i.code, i.note, i.rec ? i.rec.state : '', i.top ? 'top shortage' : '', i.top2 ? 'top 2' : '', done ? 'hotovo' : '', i.pin ? 'připnuto' : '', i.dup ? 'kopie' : '', depts.length ? dName(dIn) : ''].join(' ');
    // poddíly z výrobního plánu pod sestavou (2.29): při hledání se ukážou se sestavou
    const subs = (i.subs || []).map((x, k) => { const away = awayOf(x); if (away && !x.full) return shSubAwayHtml(i, x, j, k, away, { tierCls, tierKey, dIn, self, eanHtml }); return `<tr class="sh-sub${tierCls ? ` ${tierCls}` : ''}${x.pdfHide || i.pdfHide ? ' sh-pdfoff' : ''}${away ? ' sh-subaway sh-subfull' : ''}" data-shsub="${esc(x.id)}" data-shparent="${esc(i.id)}" data-shtier="${tierKey}" data-shdays="${i.days || 1}"${i.pin ? ' data-shpinned="1"' : ''} data-shdeptrow="${esc(dIn || '-')}" data-shop="${esc(shOpKey(x.op))}" data-shrow="${esc([self, 'poddíl', x.ean, x.code, x.op, x.note, x.rec ? x.rec.state : ''].join(' ').toLowerCase())}">
      <td class="sh-gripc"></td>
      <td class="num muted" data-label="#">${j + 1}.${k + 1}</td>
      <td class="sh-ord sh-subord" data-label="Číslo objednávky"><span class="sh-subarrow" aria-hidden="true"></span>${esc(x.order || i.order || '—')}</td>
      <td class="name" data-label="Poddíl"><span class="tag sh-subtag">PODDÍL</span>${x.byRec ? ' <span class="tag sh-rectag" title="Operace není Hala 2, poddíl přidal poslední záznam">podle záznamu</span>' : ''}${away ? ` <span class="tag sh-awaytag" title="Poddíl se zpracovává na jiném oddělení">${esc(away)}</span>` : ''}${x.name ? `<div>${esc(x.name)}</div>` : ''}<div class="sh-ean">${eanHtml(x)}</div></td>
      <td data-label="Index">${esc(x.index || i.index || '—')}</td>
      <td class="num sh-qty" data-label="Urgentní množství">${esc(x.qty || '—')}</td>
      <td class="sh-opc" data-label="Oddělení / Probíhající operace">${esc(x.op || '—')}${recHtml(x)}${sentHtml(x)}</td>
      <td data-label="QR kód">${x.code ? `<span class="tag ok sh-code">${esc(x.code)}</span>` : '<span class="tag warn">bez kódu</span>'}${away ? `<div class="sh-fullc"><button class="btn sec small sh-fullbtn on" type="button" data-shsubfull="${esc(x.id)}" aria-pressed="true" title="Poddíl se zpracovává na jiném oddělení (${esc(away)}). Klikni a bude tady zase bez QR kódu.">Bez QR</button></div>` : ''}</td>
      <td class="sh-notec" data-label="Poznámka">${shStSel(x, `poddílu ${x.ean || x.code}`)}<textarea class="sh-note" data-shnote="${esc(x.id)}" rows="2" maxlength="${SH_MAX_NOTE}" placeholder="Dopsat poznámku" autocomplete="off" aria-label="Poznámka k poddílu ${esc(x.ean || x.code)}">${esc(x.note || '')}</textarea></td>
      <td class="sh-actc"><div class="sh-acts">${shHideBtn(x)}${shEditBtn(x)}<button class="icon-btn small" type="button" data-shdelsub="${esc(x.id)}" title="Odebrat poddíl" aria-label="Odebrat poddíl ${esc(x.ean || x.code)}">${SH_IC('x')}</button></div></td></tr>`; }).join('');
    const splitNote = split ? `<div class="sh-splitnote" title="Poddíly sestavy patří do více oddělení, sestava je v každém z nich">Sestava i v oddělení: ${esc(ds.filter(d => d !== dIn).map(dName).join(', '))}</div>` : '';
    // sestava s poddíly je jen orientační: bez QR kódu (2.29.1), dokud ji uživatel nezobrazí plně (2.31); poznámka jde dopsat vždy (2.70)
    const asm = !!subs && !i.full;
    const fullBtn = subs ? `<button class="btn sec small sh-fullbtn${i.full ? ' on' : ''}" type="button" data-shfull="${esc(i.id)}" aria-pressed="${!!i.full}" title="${i.full ? 'Sestava se ukazuje i tiskne celá (QR kód, poslední záznam, kolonky). Klikni a bude zase jen orientační.' : 'Ukázat a tisknout sestavu celou: QR kód, poslední záznam, kolonky na psaní a poznámku'}">${i.full ? 'Jen orientačně' : 'Zobrazit plně'}</button>` : '';
    // 2.72: u neshody objednávky / line (a po výběru) nabídka objednávek se stejným EANem z plánu
    const qr = (((i.qrChoices||[]).length>1||i.qrConflict) ? shQrSelect(i) : i.planMismatch ? '<span class="tag warn">Neshoda objednávky / line</span>' : asm ? '<span class="small muted">sestava</span>' : i.code ? `<span class="tag ok sh-code">${esc(i.code)}</span>` : '<span class="tag warn">bez kódu</span>') + shAltPick(i, altRecs);
    const topBtn = `<button class="btn sec small sh-topbtn${i.top ? ' on' : ''}" type="button" data-shtop="${esc(i.id)}" aria-pressed="${!!i.top}" title="${i.top ? 'Zrušit TOP SHORTAGE' : 'Označit jako TOP SHORTAGE (bude nahoře)'}" aria-label="${i.top ? 'Zrušit TOP SHORTAGE u' : 'Označit jako TOP SHORTAGE'} ${esc(i.ean || i.name)}">TOP</button>`
      + `<button class="btn sec small sh-topbtn sh-top2btn${i.top2 ? ' on' : ''}" type="button" data-shtop2="${esc(i.id)}" aria-pressed="${!!i.top2}" title="${i.top2 ? 'Zrušit TOP 2' : 'Označit jako TOP 2: zpracovat hned po TOP shortage'}" aria-label="${i.top2 ? 'Zrušit TOP 2 u' : 'Označit jako TOP 2'} ${esc(i.ean || i.name)}">TOP2</button>`;
    // oddělení položky (2.32): podle operace, nebo ručně jiné
    const auto = shAutoFull(c, i, dmap);
    const deptSel = depts.length ? `<label class="sh-deptpick"><span class="sr-only">Oddělení položky ${esc(i.ean || i.name)}</span><select data-shdept="${esc(i.id)}">
        <option value=""${i.dept ? '' : ' selected'}>${split ? `Podle poddílů: ${esc(ds.map(dName).join(' + '))}` : `Podle operace: ${esc(auto ? dName(auto) : 'nezařazeno')}`}</option>
        ${depts.map(d => `<option value="${esc(d.id)}"${i.dept === d.id ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}
        <option value="${SH_CHECK_DEPT}"${i.dept === SH_CHECK_DEPT ? ' selected' : ''}>${SH_CHECK_NAME}</option>
        <option value="-"${i.dept === '-' ? ' selected' : ''}>Nezařazeno</option></select>${i.dept ? '<span class="tag sh-manual">ručně</span>' : ''}</label>` : '';
    return `<tr class="${tierCls}${subs ? ' sh-hassub' : ''}${i.full ? ' sh-full' : ''}${i.pdfHide ? ' sh-pdfoff' : ''}${i.pin ? ' sh-pinned' : ''}" data-shid="${esc(i.id)}" data-shtier="${tierKey}" data-shdays="${i.days || 1}"${i.pin ? ' data-shpinned="1"' : ''} data-shdeptrow="${esc(dIn || '-')}" data-shop="${esc(shOpKey(i.op))}" data-shsubops="${esc((i.subs || []).map(x => shOpKey(x.op)).join('|'))}" data-shrow="${esc([self, ...(i.subs || []).flatMap(x => [x.ean, x.code])].join(' ').toLowerCase())}">
      <td class="sh-gripc"><button type="button" class="sh-grip" data-shgrip="${esc(i.id)}" title="Přesunout: přetáhni myší, nebo šipkami nahoru a dolů" aria-label="Přesunout položku ${esc(i.ean || i.name)}">${SH_GRIP}</button></td>
      <td class="num muted" data-label="#">${j + 1}</td>
      <td class="sh-ord" data-label="Číslo objednávky">${esc(i.order || '—')}</td>
      <td class="name" data-label="Název dílu">${done ? `<span class="tag ok sh-donetag" title="${esc(`Hotovo${i.stBy ? ` · ${i.stBy}` : ''}${i.stAt ? ` · ${tsText(i.stAt)}` : ''}${i.top ? ' · byla TOP SHORTAGE' : i.top2 ? ' · byla TOP 2' : ''}`)}">HOTOVO</span> ` : i.top ? '<span class="tag crit sh-toptag">TOP SHORTAGE</span> ' : i.top2 ? '<span class="tag sh-top2tag">TOP 2</span> ' : ''}${shPinTags(i)}${esc(i.name || '—')}${i.top2 && !done ? '<div class="sh-top2note">Zpracovat hned po TOP shortage</div>' : ''}<div class="sh-ean">${eanHtml(i)}</div>${shAgeTag(i, hasPrev)}${splitNote}</td>
      <td data-label="Index">${esc(i.index || '—')}</td>
      <td class="num sh-qty" data-label="Urgentní množství"><b>${esc(i.qty || '—')}</b></td>
      <td class="sh-opc" data-label="Oddělení / Probíhající operace">${esc(i.op || '—')}${rec}${sentHtml(i)}${deptSel}</td>
      <td data-label="QR kód">${qr}${fullBtn ? `<div class="sh-fullc">${fullBtn}</div>` : ''}</td>
      <td class="sh-notec" data-label="Poznámka">${shStSel(i, `položky ${i.ean || i.name}`)}<textarea class="sh-note" data-shnote="${esc(i.id)}" rows="2" maxlength="${SH_MAX_NOTE}" placeholder="Dopsat poznámku" autocomplete="off" aria-label="Poznámka k položce ${esc(i.ean || i.name)}">${esc(i.note || '')}</textarea></td>
      <td class="sh-actc"><div class="sh-acts"><span class="sh-tiers">${topBtn}</span>${shPinBtn(i)}${shDupBtn(i)}${shHideBtn(i)}${shEditBtn(i)}<button class="icon-btn small" type="button" data-shdelitem="${esc(i.id)}" title="Odebrat položku" aria-label="Odebrat položku ${esc(i.ean || i.name)}">${SH_IC('x')}</button></div></td></tr>${subs}`;
  };
  // bloky podle oddělení (2.32), čísla v pořadí zobrazení
  let num = 0;
  const unresolved=l.items.filter(i=>i.st!=='done'&&(i.qrConflict||i.planMismatch||!i.code&&(i.qrChoices||[]).length>1));   // hotová zůstane na konci (2.76)
  const ordinary=l.items.filter(i=>!unresolved.includes(i));
  const sections=[...(unresolved.length?[{id:'unlinked',name:'Nelze přidělit odkaz',items:unresolved}]:[]),...shBlocks(c,ordinary)].filter(x=>x.items.length);   // hotové v posledním bloku (2.76)
  const rows=sections.map(sec=>`${depts.length||unresolved.length?`<tr class="sh-depthead${sec.id===SH_DONE_SEC?' sh-donehead':sec.id===SH_CHECK_DEPT?' sh-chkhead':''}" data-shdepthead="${esc(sec.id||'-')}"><td colspan="10"><b>${esc(sec.name||'Ostatní položky')}</b><span class="muted small"> · ${sec.items.length} ${shItemsN(sec.items.length)}${sec.id===SH_DONE_SEC?' · stav Hotovo, vždy na konci seznamu (oddělení zůstává)':sec.id===SH_CHECK_DEPT?' · záznam v interní evidenci u nás (poslední není Odesláno / Expedováno na WPA), operace nepatří do žádného oddělení: prověř, kde díl je':''}</span>${sec.id==='unlinked'?'<p class="small">Zkontroluj objednávku a line/index. U neshody objednávky / line vyber v nabídce u položky alternativní objednávku z výrobního plánu (objednávka, index, počet ks, poslední interní záznam, operace). Pokud jsou k dispozici odpovídající QR kódy, vyber variantu podle operace a interního záznamu. Vlastní kód zadáš propiskou.</p>':''}</td></tr>`:''}${sec.items.map(i=>rowHtml(i,num++,sec.id)).join('')}`).join('');
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
        <p class="tiny muted">Nastavení platí pro všechny seznamy, i pro další nahrané. Položka jde do oddělení podle své probíhající operace (sestava bez zařazené operace podle poddílu). Jinam ji přesuneš výběrem pod operací v řádku, nebo přetažením myší do jiného oddělení. Položka se záznamem v interní evidenci u nás (poslední není Odesláno / Expedováno na WPA), jejíž operace nepatří do žádného oddělení, je v bloku <b>K prověření</b>.</p>
      </div></details>`;
  const secs = shSections(c, l.items);
  const dsel = shDeptSel(l);
  const deptChips = depts.length ? `<div class="sh-ops sh-deptf"><span class="small muted">Oddělení</span><div class="chips" role="group" aria-label="Filtr podle oddělení">
        <button type="button" class="chip${dsel ? '' : ' on'}" data-shdf="" aria-pressed="${!dsel}">Všechna</button>
        ${secs.map(x => { const k = x.id || '-'; return `<button type="button" class="chip${dsel && dsel.has(k) ? ' on' : ''}" data-shdf="${esc(k)}" aria-pressed="${!!(dsel && dsel.has(k))}">${esc(x.name)} <span class="sh-opn">${x.items.length}</span></button>`; }).join('')}</div></div>` : '';
  const pl = ui.sh.plan;
  const planInfo = l.plan ? `Poddíly podle výrobního plánu ${esc(l.plan.file)} (${esc(shWhenText(l.plan.at))}): ${subsN} ${shSubsN(subsN)}.` : 'Poddíly sestav doplníš tlačítkem Výrobní plán nahoře.';
  const planUse = pl && (!l.plan || l.plan.at !== pl.at) ? ` <button class="btn sec small" type="button" data-shplanuse>Najít poddíly v plánu ${esc(pl.file)}</button>` : '';
  const older = shListsHtml(c, l);
  const mode = shModeBar(c);
  const asel = shAgeSel(l);
  if (ui.sh.mode === 'rozbor') { box.innerHTML = `${tiles}${mode}${shRozborHtml(l)}${older}`; return; }
  box.innerHTML = `${tiles}${mode}${deptPanel}<article class="card sh-card">
      <div class="card-head"><div><h2>Seznam z ${esc(shWhen(l))}</h2>
        <p class="small muted">${n} ${shItemsN(n)}${subsN ? ` · ${subsN} ${shSubsN(subsN)}` : ''}${top ? ` · ${top} TOP` : ''}${doneN ? ` · hotovo ${doneN}` : ''}${l.file ? ` · ${esc(l.file)}` : ''}${l.sheet ? ` · list ${esc(l.sheet)}` : ''}${l.by ? ` · nahrál ${esc(l.by)}` : ''}${hidN ? ` · <b>${hidN} skryt${hidN === 1 ? 'á' : hidN <= 4 ? 'é' : 'ých'} v PDF</b>` : ''}</p></div>
        <div class="row gap wrap sv-actions"><label class="sh-search"><span class="sr-only">Hledat v seznamu</span><input type="search" id="shQ" value="${esc(ui.sh.q)}" placeholder="Hledat objednávku, díl, EAN, operaci" autocomplete="off"></label>
          <button class="btn sec small" type="button" data-shmanual title="Zadat položku ručně: EAN, číslo objednávky, odkaz…">Přidat položku</button>
          <button class="btn sec small" type="button" data-shnotes>Doplnit poznámky z Excelu</button><input type="file" id="shNotesFile" accept=".xlsx,.xls,.xlsm,.ods" hidden>
          <button class="btn sec small${ui.sh.merge === l.id ? ' on' : ''}" type="button" data-shmerge="${esc(l.id)}" aria-pressed="${ui.sh.merge === l.id}" title="Znovu vložit urgenty: do tohoto seznamu se přidají jen položky, které v něm chybí">Doplnit chybějící</button>
          <button class="btn small" type="button" data-shpdf="${esc(l.id)}"${n ? '' : ' disabled'}>${asel ? 'PDF k tisku · vybrané položky' : dsel ? (sel ? 'PDF k tisku · vybraná oddělení a operace' : 'PDF k tisku · vybraná oddělení') : sel ? 'PDF k tisku · vybrané operace' : 'PDF k tisku'}</button>
          ${depts.length ? `<button class="btn sec small" type="button" data-shpdfdept="${esc(l.id)}"${n ? '' : ' disabled'} title="Každé oddělení začne na novém papíře, s vlastním záhlavím a číslováním">PDF po odděleních${dsel ? ' · vybraná' : ''}</button>` : ''}
          <button class="btn sec small" type="button" data-shpack="${esc(l.id)}" title="Seznam půjde do historie jen ke čtení; nové urgenty se s ním porovnají">Zabalit den</button>
          <button class="icon-btn" type="button" data-shdel="${esc(l.id)}" title="Smazat seznam" aria-label="Smazat seznam z ${esc(shWhen(l))}">${I.x}</button></div></div>
      <p class="tiny muted sh-hint">Pořadí změníš přetažením řádku myší (na telefonu za úchyt vlevo), poddíly jdou se sestavou. TOP SHORTAGE zůstávají nahoře, pod nimi TOP 2 (zpracovat hned po TOP shortage); tlačítka TOP a TOP2 na konci řádku je označí nebo odznačí ručně. S oddělením jde řádek přetáhnout i do jiného oddělení. Poslední záznamy vlož přes Ctrl+V: A QR kód, B datum a čas, C počet ks, D stav. Propiska vedle oka upraví údaje libovolné položky i poddílu. Oko na konci řádku položku skryje v PDF (sestavu i s poddíly). Špendlík položku připne: přejde i do dalších nahraných seznamů, dokud ji neodepneš. Dvě kartičky položku zduplikují do oddělení, které vybereš. Sestavu s poddíly ukáže celou (QR kód, záznam, kolonky) tlačítko Zobrazit plně. Položky se stavem Hotovo (ručně, nebo podle barvy EANu, zelená = Hotovo) jsou vždy na konci seznamu.</p>
      <p class="small sh-planinfo">${planInfo}${planUse}</p>
      ${shAgeChips(l, hasPrev)}${deptChips}${opChips}
      <div class="table-card flat"><table class="stack sh-tab"><thead><tr><th class="sh-gripc"><span class="sr-only">Přesunout</span></th><th>#</th><th>Číslo objednávky</th><th>Název dílu · EAN</th><th>Index</th><th class="num">Urgentní množství</th><th>Oddělení / Probíhající operace</th><th>QR kód</th><th>Poznámka</th><th class="sh-actc"><span class="sr-only">Odebrat</span></th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="tiny muted sh-none"${n ? ' hidden' : ''}>${n ? 'Nic neodpovídá hledání.' : 'V seznamu nezbyla žádná položka.'}</p>
    </article>${shOutHtml(l)}${older}`;
  shFilter();
}
/* ---------- Rozbor položek (2.61): ke každé položce probíhající operace, poslední záznam,
   interní záznam ano / ne a všechny poddíly sestavy (i s jinou operací než Hala 2). ---------- */
function shRozborHtml(l) {
  const items = l.items;
  const withRec = items.filter(i => i.rec).length;
  const asm = items.filter(i => shAnalysis(i, l).subs.length).length;
  const empty = items.filter(i => !i.note).length;
  const recLine = (r, a) => (r ? `<span class="tag ok">záznam</span> ${esc(a.recText(r))}${r.n > 1 ? ` <span class="muted">(${r.n} ${r.n <= 4 ? 'záznamy' : 'záznamů'})</span>` : ''}` : '<span class="tag warn">bez záznamu</span>');
  const cards = items.map((i, j) => {
    const a = shAnalysis(i, l);
    const sentLine = x => (x ? `<div class="small sh-rzsent${x.st === 'here' ? ' sh-rzwarn' : ''}">${esc(shSentText(x))}</div>` : '');
    const subs = a.subs.length ? `<table class="sh-rzsubs"><thead><tr><th>Poddíl · EAN</th><th>Operace</th><th>Poslední záznam</th></tr></thead><tbody>${a.subs.map((x, k) => `<tr class="${x.hall ? '' : 'sh-rzother'}"><td><span class="muted">${j + 1}.${k + 1}</span> ${esc(x.ean || '—')}${x.code ? ` <span class="tag sh-code">${esc(x.code)}</span>` : ''}${x.byRec ? ' <span class="tag sh-rectag">podle záznamu</span>' : ''}</td><td>${esc(x.op || '—')}${x.hall ? '' : ' <span class="small muted">mimo Halu 2</span>'}</td><td>${recLine(x.rec, a)}${sentLine(x.sent)}</td></tr>`).join('')}</tbody></table>` : '';
    return `<article class="sh-rz${i.top ? ' sh-top' : i.top2 ? ' sh-top2' : ''}" data-shrz="${esc(i.id)}">
      <header><span class="muted">${j + 1}.</span> ${i.top ? '<span class="tag crit sh-toptag">TOP SHORTAGE</span>' : i.top2 ? '<span class="tag sh-top2tag">TOP 2</span>' : ''} <b>${esc(i.name || '—')}</b> <span class="small muted">EAN ${esc(i.ean || '—')} · obj. ${esc(i.order || '—')}${i.index ? ` · index ${esc(i.index)}` : ''} · ${esc(i.qty || '—')} ks</span></header>
      <dl class="sh-rzgrid">
        <div><dt>Probíhající operace</dt><dd>${a.cur ? esc(a.cur) : '<span class="muted">neuvedena</span>'}</dd></div>
        <div><dt>Poslední dokončená · interní záznam</dt><dd>${recLine(i.rec, a)}${sentLine(a.sent)}</dd></div>
        <div><dt>Poddíly</dt><dd>${a.subs.length ? `${a.subs.length}${a.noRec ? ` · <span class="sh-rzwarn">${a.noRec} bez záznamu</span>` : ' · všechny se záznamem'}` : '<span class="muted">díl bez poddílů</span>'}</dd></div>
      </dl>
      ${subs}
      <p class="small sh-rznote"><b>Poznámka:</b> ${i.note ? esc(i.note) : `<span class="muted">prázdná · návrh: ${esc(a.note)}</span>`}</p>
    </article>`;
  }).join('');
  return `<section class="card sh-rozbor">
    <div class="card-head"><div><h2>Rozbor položek</h2><p class="small muted">${items.length} ${shItemsN(items.length)} · interní záznam u ${withRec} · ${asm} ${asm === 1 ? 'sestava' : asm <= 4 && asm ? 'sestavy' : 'sestav'} s poddíly${l.plan ? '' : ' · výrobní plán nenahrán (krok 2)'}${l.moves ? '' : ' · evidence pohybu nenahrána (krok 3)'}</p></div>
      <div class="row gap wrap"><button class="btn sec small" type="button" data-shanote${empty && !l.packed ? '' : ' disabled'} title="Do prázdných poznámek zapíše rozbor (probíhá, poslední záznam, poddíly); vyplněné poznámky zůstanou">Zapsat rozbor do prázdných poznámek${empty ? ` (${empty})` : ''}</button><button class="btn small" type="button" data-shaxlsx>Rozbor do Excelu</button></div></div>
    <div class="sh-rzlist">${cards}</div></section>`;
}
function shAnalysisToNotes() {
  const l = shWork();
  if (!l) return;
  let n = 0;
  l.items.forEach(i => { if (!i.note) { i.note = shAnalysis(i, l).note; n += 1; } });
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
/* Ikony v řádcích Shortage (2.75) jsou CSS masky (app.css .sh-ic-…): inline SVG v každém řádku
   dělalo z velkého seznamu desítky tisíc prvků a stránka se zdržovala. */
const SH_IC = n => `<span class="icon sh-ic sh-ic-${n}" aria-hidden="true"></span>`;
const SH_EYE = SH_IC('eye');
const SH_EYE_OFF = SH_IC('eyeoff');
// Ruční zadání položky (2.65): do otevřeného seznamu, bez seznamu založí nový „zadáno ručně“
async function shManualDialog(id = null) {
  const l=shWork(),hit=id&&l?shEntry(l,id):null;
  if(id&&!hit)return;
  const original=hit?hit.entry:null;
  const res=await dialog({
    title:hit?(hit.sub?'Upravit poddíl':'Upravit položku'):l?`Přidat položku · seznam ${shWhen(l)}`:'Přidat položku · nový seznam',
    ok:hit?'Uložit změny':'Přidat položku',wide:true,
    html:`<div class="form-grid tk-grid">
      <label class="field"><span>EAN</span><input name="ean" maxlength="60" autofocus autocomplete="off"></label>
      <label class="field"><span>Číslo objednávky</span><input name="order" maxlength="80" autocomplete="off"></label>
      <label class="field"><span>Název dílu</span><input name="name" maxlength="200" autocomplete="off"></label>
      <label class="field"><span>Index</span><input name="index" maxlength="40" autocomplete="off"></label>
      <label class="field"><span>Urgentní množství</span><input name="qty" maxlength="40" autocomplete="off"></label>
      <label class="field"><span>Množství zakázky (ks)</span><input name="oqty" maxlength="20" inputmode="decimal" autocomplete="off" placeholder="z výrobního plánu"></label>
      <label class="field"><span>Probíhající operace</span><input name="op" maxlength="300" autocomplete="off"></label>
      </div>
      ${(original?.qrChoices||[]).length?`<label class="field"><span>Možné odkazy z výrobního plánu</span><select name="qrChoice"><option value="">Vyber odkaz, nebo uprav údaje níže</option>${original.qrChoices.map((x,i)=>`<option value="${i}">${esc(shQrLabel(x))}</option>`).join('')}</select></label>`:''}
      <label class="field"><span>Odkaz s activeBarcode</span><input name="link" maxlength="2000" placeholder="https://…" autocomplete="off"></label>
      <label class="field"><span>QR kód (activeBarcode nebo vlastní kód)</span><input name="code" maxlength="120" autocomplete="off"></label>
      <div class="form-grid tk-grid">
      ${!hit?.sub?'<label class="field"><span>Priorita</span><select name="tier"><option value="">Shortage</option><option value="top">TOP SHORTAGE</option><option value="top2">TOP 2</option></select></label>':''}
      <label class="field"><span>Stav</span><select name="st"><option value="">Bez stavu</option>${SH_ST.map(([k,n])=>`<option value="${k}">${n}</option>`).join('')}</select></label></div>
      <label class="field"><span>Poznámka</span><textarea name="note" maxlength="${SH_MAX_NOTE}" rows="4"></textarea></label>`,
    onOpen:dlg=>{
      const f=dlg.querySelector('form').elements;
      if(original){
        for(const key of ['ean','order','name','index','qty','op','link','code','note','st'])f.namedItem(key).value=original[key]||'';
        f.namedItem('oqty').value=original.oqty!=null?String(original.oqty).replace('.',','):'';
        if(hit.sub){for(const key of ['order','index'])if(!original[key])f.namedItem(key).value=hit.item[key]||'';}
        if(!hit.sub)f.tier.value=original.top?'top':original.top2?'top2':'';
      }
      f.link.addEventListener('input',()=>{f.code.value=shCode(f.link.value);});
      f.qrChoice?.addEventListener('change',()=>{const choice=original.qrChoices[f.qrChoice.value];if(choice){f.link.value=choice.link;f.code.value=choice.code;f.op.value=choice.op||'';}});
    },
    validate:form=>{
      const f=form.elements;
      if(!f.ean.value.trim()&&!f.name.value.trim())return 'Vyplň aspoň EAN nebo název dílu.';
      if(hit?.sub&&!f.ean.value.trim()&&!f.code.value.trim())return 'U poddílu vyplň EAN nebo QR kód.';
      if(f.link.value.trim()&&!shLink(f.link.value))return 'Odkaz musí začínat http:// nebo https://.';
      if(f.code.value.trim()&&!shCodeClean(f.code.value))return 'QR kód obsahuje nepovolené znaky.';
      if(f.namedItem('oqty').value.trim()&&shQtyNum(f.namedItem('oqty').value)==null)return 'Množství zakázky musí být počet kusů (třeba 120).';
      if(shCode(f.link.value)&&shCode(f.link.value)!==f.code.value.trim())return 'QR kód musí odpovídat activeBarcode v odkazu. Pro vlastní kód nejprve odkaz vymaž.';
      return '';
    },
  });
  if(res.value!=='ok')return;
  const f=res.form.elements,v=key=>f.namedItem(key).value.trim(),now=Date.now(),by=ui.me.label||'';
  const it=Object.fromEntries(['order','name','ean','index','qty','op','link','code','note'].map(key=>[key,v(key)]));
  if(!hit?.sub){it.top=f.tier.value==='top';it.top2=f.tier.value==='top2';}
  const oq=shQtyNum(v('oqty'));
  if(oq!=null)it.oqty=oq;
  it.st=f.st.value;
  if(!original||it.st!==(original.st||'')){it.stAt=now;it.stBy=by;}
  const c=shc();
  if(hit){
    if(hit.sub){it.manual=true;it.sourceKey=original.sourceKey||shPlanKeyPart(original.ean)+'|'+original.code;}
    if(it.code!==original.code){const selected=original.qrChoices?.find(x=>x.code===it.code&&x.link===shLink(it.link));it.rec=shRecordMap(l).get(it.code)||selected?.rec||null;}
    const identityChanged=shPlanKey(original.ean,original.index,original.order)!==shPlanKey(it.ean,it.index,it.order),eanBefore=original.ean;
    Object.assign(original,it);
    if(oq==null)delete original.oqty;
    if(!hit.sub){
      if(shPlanKeyPart(original.ean)!==shPlanKeyPart(eanBefore)){delete original.was;original.planAlts=[];}   // jiný díl (2.72)
      if(identityChanged){original.qrChoices=[];original.qrKey='';original.qrConflict=false;original.planMismatch=false;}
      else original.qrConflict=!!(original.qrChoices?.length&&!original.qrChoices.some(x=>x.code===it.code));
    }
  }else if(l)l.items.push(it);
  else c.lists.unshift({id:'',at:now,by,file:'zadáno ručně',sheet:'',items:shCarryPins(shNewest(c),[it]).items});   // i s připnutými (2.75)
  S.shortage=cleanShortage(c);
  if(!l)ui.sh.open=S.shortage.lists[0].id;
  save();renderShortage();
  toast(hit?'Změny položky byly uloženy.':`Položka ${it.ean||it.name} přidána.`);
}
// Stav položky (2.65): výběr v řádku, barva podle stavu
function shQrLabel(choice){
  const r=choice.rec;
  const record=r?[r.state||'stav neuveden',r.op||'',r.qty?(/^[\d\s.,]+$/.test(r.qty)?`${r.qty} ks`:r.qty):'',r.when||'datum neuvedeno'].filter(Boolean).join(', '):'nenahrán';
  return `${choice.code} | Operace: ${choice.op||'v plánu neuvedena'} | Interní záznam: ${record}`;
}
function shQrSelect(item){
  const choices=item.qrChoices||[];
  return `<label class="sh-qrpick"><span class="small">Varianta QR odkazu</span><select data-shqr="${esc(item.id)}" aria-label="Varianta QR odkazu položky ${esc(item.ean||item.name)}">
    <option value=""${choices.some(x=>x.code===item.code)?'':' selected'} disabled>Vyber podle operace a záznamu</option>
    ${choices.map(x=>`<option value="${esc(x.code)}"${x.code===item.code?' selected':''}>${esc(shQrLabel(x))}</option>`).join('')}
    </select></label>${item.code?`<span class="tag ok sh-code">${esc(item.code)}</span>`:''}`;
}
/* Alternativní objednávky z výrobního plánu (2.72): rozevírací nabídka u neshody objednávky / line. */
function shAltLabel(a, rec) {
  const r = rec || a.rec;
  const record = r ? [r.state || 'stav neuveden', r.qty ? (/^[\d\s.,]+$/.test(r.qty) ? `${r.qty} ks` : r.qty) : '', r.when || ''].filter(Boolean).join(', ') : 'nenahrán';
  return `${a.order || 'bez objednávky'} | Index ${a.index || '—'} | ${a.qty != null ? `${nf(a.qty, 3)} ks` : 'ks neuvedeno'} | Záznam: ${record} | Operace: ${a.op || 'neuvedena'}`;
}
const SH_ALT_GROUPS = ['Stejná objednávka, jiný index', 'Stejný index, jiná objednávka', 'Jiné objednávky'];
function shAltPick(item, recs) {
  const alts = item.planAlts || [];
  const cur = alts.findIndex(a => a.order === item.order && a.index === item.index && (!a.code || a.code === item.code));
  const was = item.was ? `<div class="sh-was"><span class="small">V urgentech ${esc(item.was.order || '—')} · index ${esc(item.was.index || '—')}</span><button class="btn sec small" type="button" data-shaltback="${esc(item.id)}" title="Vrátit objednávku, index a QR kód z urgentů">Vrátit z urgentů</button></div>` : '';
  if (!alts.length) return was;
  const opt = (a, n) => `<option value="${n}"${n === cur ? ' selected' : ''}>${esc(shAltLabel(a, a.code && recs.get(a.code)))}</option>`;
  const groups = SH_ALT_GROUPS.map((g, k) => ({ g, list: alts.map((a, n) => [a, n]).filter(([a]) => shAltRank(item, a) === k) })).filter(x => x.list.length);
  const body = groups.length > 1 ? groups.map(x => `<optgroup label="${esc(x.g)}">${x.list.map(([a, n]) => opt(a, n)).join('')}</optgroup>`).join('') : alts.map(opt).join('');
  return `<label class="sh-qrpick sh-altpick"><span class="small">${item.was ? 'Objednávka z výrobního plánu' : 'Alternativní objednávka z plánu'}</span><select data-shalt="${esc(item.id)}" aria-label="Alternativní objednávka z výrobního plánu pro položku ${esc(item.ean || item.name)}">
    <option value=""${cur < 0 ? ' selected' : ''} disabled>Vyber z ${alts.length} ${shPl(alts.length, 'objednávky', 'objednávek', 'objednávek')} v plánu</option>${body}</select></label>${was}`;
}
function shEditBtn(x){
  return `<button class="icon-btn small" type="button" data-shedit="${esc(x.id)}" title="Upravit položku" aria-label="Upravit položku ${esc(x.ean||x.name||x.code||'')}">${SH_IC('edit')}</button>`;
}
function shStSel(x, what) {
  return `<label class="sh-stpick"><span class="sr-only">Stav ${esc(what)}</span><select class="sh-stsel${x.st ? ` st-${x.st}` : ''}" data-shst="${esc(x.id)}" title="${x.st ? esc(`${shStName(x.st)}${x.stBy ? ` · ${x.stBy}` : ''}${x.stAt ? ` · ${tsText(x.stAt)}` : ''}`) : 'Zadat stav'}">
    <option value=""${x.st ? '' : ' selected'}>Bez stavu</option>${SH_ST.map(([k, l]) => `<option value="${k}"${x.st === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
}
function shHideBtn(x) {
  const off = x.pdfHide === true;
  return `<button class="icon-btn small sh-hidebtn${off ? ' on' : ''}" type="button" data-shpdfhide="${esc(x.id)}" aria-pressed="${off}" title="${off ? 'Skryto v PDF: klikni a znovu se vytiskne' : 'Skrýt v PDF'}" aria-label="${off ? 'Zobrazit v PDF' : 'Skrýt v PDF'} ${esc(x.ean || x.name || x.code || '')}">${off ? SH_EYE_OFF : SH_EYE}</button>`;
}
const SH_GRIP = SH_IC('grip');
/* Připnout (2.75): položka přejde do každého dalšího nahraného seznamu, dokud se neodepne. */
function shPinBtn(i) {
  const on = !!i.pin;
  return `<button class="icon-btn small sh-pinbtn${on ? ' on' : ''}" type="button" data-shpin="${esc(i.id)}" aria-pressed="${on}" title="${on ? `Připnuto${i.pin.by ? ` (${esc(i.pin.by)})` : ''}: položka přejde i do dalších nahraných seznamů. Klikni a odepne se.` : 'Připnout: položka zůstane i v dalších nahraných seznamech, dokud ji neodepneš'}" aria-label="${on ? 'Odepnout' : 'Připnout'} ${esc(i.ean || i.name)}">${SH_IC('pin')}</button>`;
}
/* Štítky v názvu dílu (2.75). */
function shPinTags(i) {
  return `${i.pin ? `<span class="tag sh-pintag" title="Připnuto ${esc(shWhenText(i.pin.at))}${i.pin.by ? ` · ${esc(i.pin.by)}` : ''}: přejde i do dalších nahraných seznamů">PŘIPNUTO</span> ` : ''}${i.dup ? '<span class="tag sh-duptag" title="Ruční kopie položky (Duplikovat)">KOPIE</span> ' : ''}`;
}
/** Nejnovější dosavadní seznam: z něj se do nového seznamu přenesou připnuté položky (2.75). */
function shNewest(c) {
  return (c.lists || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0))[0] || null;
}
/** Okno Duplikovat (2.75): do jakého oddělení vložit kopii položky. */
async function shDupDialog(id) {
  const l = shWork(), c = shc();
  const it = l && l.items.find(i => i.id === id);
  if (!it) return;
  const depts = c.depts || [], dmap = shDeptMap(c);
  const cur = shDeptOf(c, it, dmap) || '-', auto = shAutoFull(c, it, dmap);
  const name = k => shDeptName(c, k);
  const other = depts.find(d => d.id !== cur);
  const pick = other ? other.id : '-';
  const opts = [...depts.map(d => [d.id, d.name]), [SH_CHECK_DEPT, SH_CHECK_NAME], ['-', 'Nezařazeno']];
  const subs = (it.subs || []).length;
  const html = `<p>Kopie položky <b>${esc([it.ean, it.name].filter(Boolean).join(' · ') || 'bez názvu')}</b>${subs ? ` i s ${subs} ${shSubsN(subs)}` : ''} se vloží do vybraného oddělení. Originál zůstane v oddělení <b>${esc(name(cur))}</b>.</p>
    ${depts.length ? `<fieldset class="sh-dupdepts"><legend>Do jakého oddělení vložit kopii?</legend>${opts.map(([v, n]) => `<label class="sh-dupopt"><input type="radio" name="dept" value="${esc(v)}"${v === pick ? ' checked' : ''}><span>${esc(n)}</span>${v === cur ? '<span class="tiny muted">teď tady</span>' : v === auto ? '<span class="tiny muted">podle operace</span>' : ''}</label>`).join('')}</fieldset>` : '<p class="small muted">Zatím nemáš žádné oddělení, kopie bude nezařazená. Oddělení založíš v panelu Oddělení nad seznamem.</p>'}
    <p class="tiny muted">Kopie dostane štítek KOPIE a převezme poznámku, stav i poslední záznam. Při porovnání s dalším dnem se jako odbouraná zvlášť nepočítá.</p>`;
  const r = await dialog({ title: 'Duplikovat položku', html, ok: 'Duplikovat' });
  if (r.value !== 'ok') return;
  const f = r.form.elements.namedItem('dept');
  const v = depts.length && f ? f.value || '-' : '-';
  if (!shDuplicate(c, l, it.id, v)) return;
  S.shortage = cleanShortage(S.shortage);
  save(); renderShortage();
  toast(`Kopie položky ${it.ean || it.name} je v oddělení ${name(v)}.`);
}
/* Duplikovat (2.75): kopie položky do vybraného oddělení. */
function shDupBtn(i) {
  return `<button class="icon-btn small sh-dupbtn" type="button" data-shdup="${esc(i.id)}" title="Duplikovat: kopie položky do jiného oddělení" aria-label="Duplikovat ${esc(i.ean || i.name)}">${SH_IC('copy')}</button>`;
}
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
  return items.filter(i => shSplitDepts(c, i, map).some(d => sel.has(d || '-')));   // rozdělená sestava (2.78) ve všech svých odděleních
}
/* Vybrané operace filtru, které v seznamu jsou (Set), jinak null = všechny. */
function shOpSel(l) {
  const keys = new Set(shOpList(l).map(o => o.key));
  const sel = (ui.sh.ops || []).filter(k => keys.has(k));
  return sel.length ? new Set(sel) : null;
}
/* Výška poznámky podle textu. Prohlížeč s field-sizing (CSS) to umí sám; jinak se měří
   najednou (2.75): dřív každé pole vynutilo nové rozložení celé tabulky a velký seznam
   se na desítky sekund zasekl. Prázdné pole má výšku z CSS (min-height), neměří se. */
const SH_FIELD_SIZING = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('field-sizing', 'content');
function shNoteSize(input) {
  if (SH_FIELD_SIZING) return;
  input.style.height='auto';
  input.style.height=`${Math.max(54,input.scrollHeight+2)}px`;
}
function shNotesSize() {
  if (SH_FIELD_SIZING || ui.view !== 'shortage') return;
  const list = $$('#shView textarea.sh-note').filter(input => input.value || input.style.height);
  list.forEach(input => { input.style.height = 'auto'; });
  const hs = list.map(input => (input.getClientRects().length ? input.scrollHeight : -1));
  list.forEach((input, k) => { if (hs[k] >= 0) input.style.height = input.value ? `${Math.max(54, hs[k] + 2)}px` : ''; });
}
let shQTimer = 0, shRowsN = 0;
function shFilter() {
  const q = (ui.sh.q || '').trim().toLowerCase();
  const l = shList();
  const ops = l ? shOpSel(l) : null;
  const ds = l ? shDeptSel(l) : null;
  const as = l ? shAgeSel(l) : null;   // priorita a dny na shortage (2.73)
  let shown = 0;
  const rows = $$('#shView [data-shrow]');
  shRowsN = rows.length;
  rows.forEach(tr => {
    let on = !q || tr.dataset.shrow.includes(q);
    if (on && ds) on = ds.has(tr.dataset.shdeptrow);
    // poddíl jen se svou operací, sestava i kvůli poddílu (jako shOpPick v PDF)
    if (on && ops) on = ops.has(tr.dataset.shop) || (!tr.dataset.shsub && (tr.dataset.shsubops || '').split('|').some(k => ops.has(k)));
    if (on && as) on = shAgeHit({ top: tr.dataset.shtier === 'top', top2: tr.dataset.shtier === 'top2', days: +tr.dataset.shdays || 1, pin: tr.dataset.shpinned === '1' }, as);
    tr.hidden = !on;
    if (on) shown += 1;
  });
  shNotesSize();
  const none = $('#shView .sh-none');
  if (none && rows.length) none.hidden = shown > 0;
  // nadpis oddělení jen s viditelnými řádky
  $$('#shView tr.sh-depthead').forEach(h => { let r = h.nextElementSibling, any = false; while (r && !r.classList.contains('sh-depthead')) { if (!r.hidden) any = true; r = r.nextElementSibling; } h.hidden = !any; });
  // při hledání a filtru se nepřesouvá (skryté řádky by pořadí zmátly)
  const tab = $('#shView table.sh-tab');
  if (tab) tab.classList.toggle('sh-nodrag', !!q || !!ops || !!ds || !!as);
}

/* ---------- Přesouvání položek: myší kdekoli na řádku, dotykem za úchyt, šipkami na úchytu ---------- */
let shDrag = null;
function shDragDown(event) {
  const tr = event.target.closest('#shView tbody tr[data-shid]');
  if (!tr || event.button !== 0 || (ui.sh.q || '').trim() || (shList() && (shOpSel(shList()) || shDeptSel(shList()) || shAgeSel(shList())))) return;
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
  if(x&&(x.dataset.shdepthead==='unlinked'||x.dataset.shdepthead===SH_DONE_SEC))return tr.dataset.shdeptrow==='-'?'':tr.dataset.shdeptrow||null;   // blok bez oddělení: oddělení řádku
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
  // 2.76: hotová položka i položka puštěná na hotový řádek si oddělení nechá (blok Hotovo je za odděleními)
  if (it.st === 'done' || (target && target.dataset.shid && target.classList.contains('sh-done'))) drop.dept = own;
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
  const same = (shBlocks(c, l.items).find(x => x.items.includes(it)) || { items: [] }).items;   // blok, jak je vidět v tabulce (i Hotovo)
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

/* Tlačítko Vložit ze schránky (2.70): prohlížeč se zeptá na povolení; bez podpory nebo při
   odmítnutí zůstává Ctrl+V. HTML tabulka z Excelu nese odkazy u EANů, čistý text ne. */
async function shReadClipboard() {
  const cb = navigator.clipboard;
  if (!cb) throw new Error('prohlížeč nedovolí číst schránku');
  if (cb.read) {
    const out = { html: '', text: '' };
    for (const item of await cb.read()) {
      for (const [mime, key] of [['text/html', 'html'], ['text/plain', 'text']]) {
        if (!out[key] && item.types.includes(mime)) {
          const blob = await item.getType(mime);
          // 2.78: velké HTML (dlouhá evidence) se přeskočí, záznamy stačí z textu
          if (key === 'html' && blob.size > 16e6) continue;
          if (blob.size > 120e6) throw new Error('tabulka ve schránce je příliš velká, použij Nahrát soubor');
          out[key] = await blob.text();
        }
      }
    }
    return out;
  }
  return { html: '', text: await cb.readText() };
}
function bindShortage() {
  $('#shImport').onclick = () => $('#shFile').click();
  $('#shClipboard').onclick = async () => {
    const button=$('#shClipboard');button.disabled=true;
    try {
      const {html,text}=await shReadClipboard();
      if(!html&&!text.trim()){toast('Schránka je prázdná. Zkopíruj tabulku v Excelu přes Ctrl+C.');return;}
      await shPaste(html,text);
    } catch(error){toast(`Schránku se nepodařilo načíst: ${error.message}. Můžeš použít Ctrl+V.`,true);}
    finally{button.disabled=false;}
  };
  $('#shFile').onchange = event => { const f = event.target.files[0]; event.target.value = ''; shImportFile(f); };
  $('#shPlanBtn').onclick = () => $('#shPlanFile').click();
  $('#shPlanFile').onchange = event => { const f = event.target.files[0]; event.target.value = ''; shPlanImport(f); };
  $('#shMoveBtn').onclick = () => $('#shMoveFile').click();
  $('#shMoveFile').onchange = event => { const f = event.target.files[0]; event.target.value = ''; shMoveImport(f); };
  $('#shSkipMove').onclick = () => { const l = shList(); if (l) exportShortagePdf(l.id, $('#shSkipMove')); };
  const view = $('#view-shortage');
  view.addEventListener('pointerdown', shDragDown);
  view.addEventListener('keydown', shGripKey);
  bindShWizDrop(view);
  view.addEventListener('click', async event => {
    const t = event.target;
    if (t.closest('[data-shimport]')) { $('#shFile').click(); return; }
    if (await shWizClick(t)) return;   // průvodce nahráním (2.78)
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
    // 2.73: zabalit a rozbalit den, filtr priority a dnů na shortage, historie do Excelu
    const pk = t.closest('[data-shpack]');
    if (pk) { shPackList(pk.dataset.shpack); return; }
    const upk = t.closest('[data-shunpack]');
    if (upk) {
      const l = shc().lists.find(x => x.id === upk.dataset.shunpack);
      if (!l || !l.packed) return;
      l.packed = null;
      ui.sh.open = l.id;
      save(); renderShortage();
      $('#shMsg').innerHTML = `<div class="note i">Seznam z <b>${esc(shWhen(l))}</b> je rozbalený, jde zase upravovat. Zabalit ho můžeš tlačítkem Zabalit den.</div>`;
      return;
    }
    const tf = t.closest('[data-shtierf]');
    if (tf) { const k = tf.dataset.shtierf, cur = new Set(ui.sh.tiers || []); if (cur.has(k)) cur.delete(k); else cur.add(k); ui.sh.tiers = [...cur]; renderShortage(); return; }
    const af = t.closest('[data-shagef]');
    if (af) { const k = af.dataset.shagef; if (k === 'all') { ui.sh.tiers = []; ui.sh.age = ''; } else ui.sh.age = ui.sh.age === k ? '' : k; renderShortage(); return; }
    if (t.closest('[data-shhxlsx]')) { exportShHistXlsx(); return; }
    if (t.closest('[data-shanote]')) { shAnalysisToNotes(); return; }
    if (t.closest('[data-shaxlsx]')) { exportShAnalysisXlsx(); return; }
    const pdf = t.closest('[data-shpdf]');
    if (pdf) { exportShortagePdf(pdf.dataset.shpdf, pdf); return; }
    if (t.closest('[data-shnotes]')) { $('#shNotesFile').click(); return; }
    const edit=t.closest('[data-shedit]');
    if(edit){shManualDialog(edit.dataset.shedit);return;}
    if (t.closest('[data-shmanual]')) { shManualDialog(); return; }
    const mg = t.closest('[data-shmerge]');
    if (mg) {
      ui.sh.merge = ui.sh.merge === mg.dataset.shmerge ? null : mg.dataset.shmerge;
      $('#shMsg').innerHTML = '';
      renderShortage();
      if (ui.sh.merge) { $('#shMergeBar').scrollIntoView({ block: 'nearest' }); $('#shClipboard').focus({ preventScroll: true }); }
      return;
    }
    if (t.closest('[data-shmergeoff]')) { ui.sh.merge = null; renderShortage(); return; }
    const pdfd = t.closest('[data-shpdfdept]');
    if (pdfd) { exportShortagePdf(pdfd.dataset.shpdfdept, pdfd, true); return; }
    const open = t.closest('[data-shopen]');
    if (open) { ui.sh.open = open.dataset.shopen; if (open.dataset.shmodeto) ui.sh.mode = open.dataset.shmodeto; ui.sh.q = ''; ui.sh.merge = null; $('#shMsg').innerHTML = ''; renderShortage(); return; }
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
    // připnout a duplikovat (2.75)
    const pinB = t.closest('[data-shpin]');
    if (pinB) {
      const l = shWork();
      const it = l && l.items.find(i => i.id === pinB.dataset.shpin);
      if (!it || !shSetPin(l, it.id, !it.pin, { at: Date.now(), by: ui.me.label || '' })) return;
      save(); renderShortage();
      // do dalšího seznamu se přenáší připnutí z nejnovějšího seznamu (shCarryPins)
      const newest = shNewest(shc());
      toast(it.pin ? (newest && newest.id !== l.id ? `Položka je připnutá v seznamu z ${shWhen(l)}. Do dalších seznamů se přenáší připnutí z nejnovějšího seznamu (${shWhen(newest)}).` : 'Položka je připnutá: přejde i do dalších nahraných seznamů, dokud ji neodepneš.') : 'Položka je odepnutá. Do dalšího seznamu přejde jen tehdy, když bude v urgentech.');
      const b = $(`#shView [data-shpin="${CSS.escape(it.id)}"]`);
      if (b) b.focus();
      return;
    }
    const dupB = t.closest('[data-shdup]');
    if (dupB) { shDupDialog(dupB.dataset.shdup); return; }
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
    const altB = t.closest('[data-shaltback]');
    if (altB) {
      const l = shList(), id = altB.dataset.shaltback;
      if (!l || !shAltBack(l, id)) return;
      const it = shEntry(l, id).entry;
      shAltPlan(l, it);
      S.shortage = cleanShortage(S.shortage);
      save(); renderShortage();
      toast(`Položka ${it.ean || it.name}: zase objednávka z urgentů ${it.order || '—'} · index ${it.index || '—'}.`);
      return;
    }
    // poddíl na jiném oddělení (2.78): Zobrazit plně = i tady s QR kódem, záznamem a kolonkami
    const subFull = t.closest('[data-shsubfull]');
    if (subFull) {
      const hit = shEntry(shWork(), subFull.dataset.shsubfull);
      if (!hit || !hit.sub) return;
      hit.entry.full = !hit.entry.full;
      if (!hit.entry.full) delete hit.entry.full;
      save(); renderShortage();
      toast(hit.entry.full ? 'Poddíl se ukazuje i tiskne celý i v ostatních odděleních sestavy: QR kód, záznam, kolonky.' : 'Poddíl je v ostatních odděleních zase bez QR kódu (zpracovává se jinde).');
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
      if (!it || !(await confirmBox(it.dup ? 'Odebrat kopii?' : 'Odebrat položku?', it.dup ? `Kopie ${[it.ean, it.name].filter(Boolean).join(' · ') || 'položky'} zmizí ze seznamu z ${shWhen(l)}. Originál zůstane.` : `${[it.ean, it.name].filter(Boolean).join(' · ') || 'Položka'} zmizí ze seznamu z ${shWhen(l)} a v historii bude jako odbouraná (odebráno ručně). Už stažené PDF zůstane.`, 'Odebrat', true))) return;
      l.items = l.items.filter(i => i !== it);
      if (!it.dup) {   // kopie (2.75) se neodbourává
        l.gone = [...new Set([...(l.gone || []), shItemKey(it)])].slice(-SH_MAX_GONE);   // Doplnit chybějící ji nevrátí (2.36)
        l.out = [...(l.out || []), shOutOf(it, todayIso(), { at: Date.now(), by: ui.me.label || '' })];   // odbouráno ručně (2.73)
      }
      S.shortage = cleanShortage(S.shortage);   // další seznamy se porovnají znovu
      save(); renderShortage();
      toast(it.dup ? 'Kopie je odebraná.' : 'Položka je odebraná.');
      return;
    }
    const del = t.closest('[data-shdel]');
    if (del) {
      const c = shc();
      const l = c.lists.find(x => x.id === del.dataset.shdel);
      if (!l || !(await confirmBox('Smazat seznam?', `Seznam z ${shWhen(l)} (${l.items.length} ${shItemsN(l.items.length)}) zmizí z aplikace. Už stažené PDF zůstane.`, 'Smazat', true))) return;
      c.lists = c.lists.filter(x => x !== l);
      S.shortage = cleanShortage(c);   // 2.73: další seznam se porovná s tím před smazaným
      if (ui.sh.open === l.id) ui.sh.open = null;
      $('#shMsg').innerHTML = '';
      save(); renderShortage();
      toast('Seznam je smazaný.');
    }
  });
  view.addEventListener('change',event=>{if(event.target.id==='shNotesFile'){const f=event.target.files[0];event.target.value='';if(f)shImportFile(f,true,shWork()?.id);}});
  window.addEventListener('resize',shNotesSize);
  document.fonts.ready.then(shNotesSize);
  view.addEventListener('input', event => {
    if(event.target.matches('textarea.sh-note'))shNoteSize(event.target);
    if (event.target.id === 'shQ') {
      ui.sh.q = event.target.value;
      clearTimeout(shQTimer);
      // velký seznam (2.75): filtr až po krátké pauze v psaní, ať se stránka nezasekává po každém písmenu
      if (shRowsN > 300) shQTimer = setTimeout(shFilter, 160); else shFilter();
    }
  });
  // oddělení (2.32): název, operace → oddělení, ruční přesun položky
  view.addEventListener('toggle', event => { if (event.target.id === 'shDepts') ui.sh.deptOpen = event.target.open; if (event.target.id === 'shOut') ui.sh.outOpen = event.target.open; }, true);
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
    if (t.matches('[data-shalt]')) {
      const l = shList(), id = t.dataset.shalt;
      if (l && t.value !== '' && shPickAlt(l, id, +t.value)) {
        const it = shEntry(l, id).entry, mem = shAltPlan(l, it);
        S.shortage = cleanShortage(S.shortage);
        save(); renderShortage();
        $('#shView [data-shalt="' + CSS.escape(id) + '"]')?.focus();
        toast(`Položka ${it.ean || it.name}: objednávka ${it.order || '—'} · index ${it.index || '—'} z výrobního plánu.${mem ? '' : ' Poddíly a varianty QR se doplní při dalším nahrání plánu.'}`);
      }
      return;
    }
    if(t.matches('[data-shqr]')){
      const l=shList();
      if(l&&shSelectQr(l,t.dataset.shqr,t.value)){save();renderShortage();$('#shView [data-shqr="'+CSS.escape(t.dataset.shqr)+'"]')?.focus();}
      return;
    }
    if (t.matches('[data-shst]')) {
      const l = shList();
      const hit = l && shEntry(l, t.dataset.shst);
      const was = !!hit && !hit.sub && hit.entry.st === 'done';
      if (l && shSetStatus(l, t.dataset.shst, t.value, { at: Date.now(), by: ui.me.label || '' })) {
        save();
        renderTaskAlert();
        // 2.76: položka s Hotovo jde na konec seznamu (bez Hotovo zpátky do své skupiny), proto překreslit
        if (!hit.sub && was !== (t.value === 'done')) {
          const it = hit.entry;
          renderShortage();
          toast(t.value === 'done' ? `${it.ean || it.name}: Hotovo, přesunuto na konec seznamu.` : `${it.ean || it.name}: ${t.value ? shStName(t.value) : 'bez stavu'}, zpátky ${it.top ? 'mezi TOP SHORTAGE' : it.top2 ? 'mezi TOP 2' : 'mezi ostatní položky'}.`);
        } else t.className = `sh-stsel${t.value ? ` st-${t.value}` : ''}`;
      }
      return;
    }
    if (t.matches('[data-shdept]')) {
      const l = shList();
      const it = l && l.items.find(i => i.id === t.dataset.shdept);
      if (!it) return;
      const auto = shAutoFull(c, it);   // K prověření (2.78) je taky automatické zařazení
      const v = t.value;
      it.dept = v === '' ? '' : v === '-' ? (auto ? '-' : '') : (v === auto ? '' : v);
      save(); renderShortage();
      const d = shDeptOf(c, it);
      toast(`Položka je v oddělení ${shDeptName(c, d)}${it.dept ? ' (ručně)' : d === SH_CHECK_DEPT ? ' (záznam u nás, operace mimo naše oddělení)' : ' (podle operace)'}.`);
    }
  });
  // poznámka k položce se uloží po opuštění pole nebo Ctrl+Enter (Enter zalomí řádek, uloží se jako mezera)
  view.addEventListener('change', event => {
    const input = event.target.closest('[data-shnote]');
    if (!input) return;
    const l = shList();
    const hit = l && shEntry(l, input.dataset.shnote);
    if (!hit) return;
    const it = hit.entry;
    const note = input.value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, SH_MAX_NOTE);
    input.value = note;
    shNoteSize(input);
    if (note === (it.note || '')) return;
    it.note = note;
    save();
    const row = input.closest('tr');
    if (row && !hit.sub) row.dataset.shrow = [it.order, it.name, it.ean, it.index, it.op, it.code, it.note, it.rec ? it.rec.state : '', it.top ? 'top shortage' : '', ...(it.subs || []).flatMap(x => [x.ean, x.code])].join(' ').toLowerCase();
  });
  view.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey||event.metaKey) && event.target.closest('[data-shnote]')) event.target.blur(); });
  // Ctrl+V kdekoli v Shortage (mimo hledání a jiná pole) vloží tabulku z Excelu: seznam, nebo poslední záznamy
  document.addEventListener('paste', event => {
    if (!S || ui.view !== 'shortage' || document.querySelector('dialog[open]')) return;
    const t = event.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
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
const SH_PDF_COLS = [['#', 7], ['QR kód', 21], ['Číslo objednávky', 30], ['Název dílu · EAN', 46], ['Index', 12], ['Urgentní množství', 18], ['Oddělení / Probíhající operace', 38], ['Stav k 10:00', 24], ['Stav k 13:00', 24], ['Poznámky', 0]];
/* Černobílý tisk (2.28): jen černá a odstíny šedé, linky tmavší, TOP SHORTAGE černý štítek a pruh. */
const SH_MONO = { ink: [0, 0, 0], ink2: [45, 45, 45], ink3: [95, 95, 95], line: [150, 150, 150], line2: [95, 95, 95], head: [222, 222, 222], top: [236, 236, 236], asm: [246, 246, 246], write: [120, 120, 120] };
/* split (2.34): každé oddělení na vlastním papíře – vlastní záhlaví, číslování položek i stran */
function drawShortage(doc, l, ops = null, dsel = null, split = false, asel = null) {
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
  const items = shAgePick(shDeptPick(shPdfItems(l, ops), dsel), asel);   // + priorita a dny na shortage (2.73)
  const sh = shc();
  const secs = shBlocks(sh, items).filter(sec => !dsel || sec.id === SH_DONE_SEC || dsel.has(sec.id || '-'));   // hotové v posledním bloku (2.76), v PDF po odděleních na vlastní straně; rozdělená sestava (2.78) jen ve vybraných
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
    const n = its.length, open = its.filter(i => i.st !== 'done'), tops = open.filter(i => i.top).length, top2s = open.filter(i => i.top2).length, dones = n - open.length, subsN = its.reduce((a, i) => a + i.subs.length, 0);
    k.text(`${EXPORT_NAME} · SHORTAGE`, k.M, k.y, 7.5, { bold: true, color: C.ink, space: 0.35 });
    k.text(`Seznam z ${shWhen(l)} · ${n} ${shItemsN(n)}${subsN ? ` · ${subsN} ${shSubsN(subsN)}` : ''}${tops ? ` · ${tops} TOP SHORTAGE` : ''}${top2s ? ` · ${top2s} TOP 2` : ''}${dones ? ` · hotovo ${dones} (na konci)` : ''}`, k.M + k.CW, k.y, 8.5, { color: C.ink2, align: 'right' });
    k.y += 5.5;
    const hintW = k.width(HINT, 8.5);
    const big = clip(sec ? `Chybějící díly · ${sec.name}` : 'Chybějící díly', k.CW - hintW - 40, 17, 1, true)[0];
    k.text(big, k.M, k.y, 17, { bold: true, color: C.ink });
    const parts = [];   // filtr operací (2.31) a oddělení (2.32): čeho se výtisk týká
    if (dsel && !sec) parts.push(`Oddělení: ${shSections(sh, l.items).filter(x => dsel.has(x.id || '-')).map(x => x.name).join(', ')}`);
    if (ops) parts.push(`Jen operace: ${shOpList(l).filter(o => ops.has(o.key)).map(o => o.label).join(', ')}`);
    if (asel) parts.push(shAgeText(asel));
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
  // výška bloku posledního záznamu: stav · ks, kdy a předchozí záznamy (2.78)
  const recH = (it, L) => (it.rec ? 1.4 + L.rec.length * k.LH(7.8, 1.2) + 0.3 + k.LH(6.8, 1.2) + (L.prev && L.prev.length ? 0.8 + L.prev.length * k.LH(6.8, 1.2) : 0) : 0);
  const lay = (it, parent) => {
    const noteTxt = [it.st ? `Stav: ${shStName(it.st)}` : '', it.note || ''].filter(Boolean).join(' · ');
    const src = parent ? {...parent,...Object.fromEntries(['order','index'].filter(key=>it[key]).map(key=>[key,it[key]]))} : it;
    const asm = !parent && (it.subs || []).length > 0 && !it.full;   // jen viditelné poddíly (shPdfItems); plně zobrazená sestava je celý řádek (2.31)
    // kolikátý den na shortage (2.73), u poddílu ne
    const ageTxt = parent ? '' : [it.pin ? 'Připnuto' : '', it.dup ? 'Kopie' : '', (it.days || 1) >= 2 ? `${it.days}. den na shortage${it.since ? ` (od ${dayText(it.since, false)})` : ''}` : it.again ? `znovu na shortage (odbouráno ${dayText(it.again, false)})` : ''].filter(Boolean).join(' · ');   // + připnuto a kopie (2.75)
    const age = ageTxt ? clip(ageTxt, widths[3] - 3.6, 6.8, 2, true) : [];
    const ageH = age.length ? 0.5 + age.length * k.LH(6.8, 1.2) : 0;
    // poddíl na jiném oddělení (2.78): nízký šedý řádek bez QR, záznamu a kolonek
    if (parent && it.away && !it.full) {
      const A = { asm: true, away: true, order: clip(src.order || '—', widths[2] - 7.2, 7.8, 2), name: it.name ? clip(it.name, widths[3] - 3.6, 8.8, 2) : [],
        index: clip(src.index || '—', widths[4] - 3.6, 8.8, 2), qty: it.qty ? clip(it.qty, widths[5] - 3.6, 11, 1, true) : [],
        op: clip(`${it.op || '—'} · Tento díl se zpracovává na jiném oddělení: ${it.away}`, widths[6] - 3.6, 8.4, 5), rec: [], note: [], age: [] };
      A.h = Math.max(11, PAD + A.op.length * k.LH(8.4, 1.25) + PAD, 1.6 + 4.6 + A.name.length * k.LH(8.8, 1.22) + 0.6 + (it.ean ? k.LH(7.8, 1.2) : 0) + 1.4);
      return A;
    }
    if (asm) {
      const A = {
        asm, order: clip(it.order || '—', widths[2] - 3.6, 9, 2, true), name: clip(it.name || '—', widths[3] - 3.6, 8.8, 2),
        index: clip(it.index || '—', widths[4] - 3.6, 8.8, 2), qty: clip(it.qty || '—', widths[5] - 3.6, 11, 1, true), op: clip(it.op || '—', widths[6] - 3.6, 8.4, 2), rec: [],
        note: noteTxt ? clip(noteTxt, widths[9] - 3.6, 8, 32) : [], age,   // dříve dopsaná poznámka se neztratí; stav (2.65) před ní
      };
      A.h = Math.max(11, PAD + A.order.length * k.LH(9, 1.25) + PAD, 1.6 + (it.top || it.top2 || it.st === 'done' ? 4.6 : 0) + (it.top2 && it.st !== 'done' ? 3.4 : 0) + A.name.length * k.LH(8.8, 1.22) + 0.6 + (it.ean ? k.LH(7.8, 1.2) : 0) + ageH + 1.4, PAD + A.op.length * k.LH(8.4, 1.25) + PAD, PAD + A.note.length * k.LH(8, 1.22) + PAD);
      return A;
    }
    const L = {
      order: clip(src.order || '—', widths[2] - (parent ? 7.2 : 3.6), parent ? 7.8 : 9, 6, !parent),
      name: parent && !it.name ? [] : clip(it.name || '—', widths[3] - 3.6, 8.8, 6),
      index: clip(src.index || '—', widths[4] - 3.6, 8.8, 4),
      qty: parent && !it.qty ? [] : clip(it.qty || '—', widths[5] - 3.6, 12, 2, true),
      op: clip(it.op || '—', widths[6] - 3.6, 8.4, 8),
      rec: it.rec ? clip([it.rec.state, recQty(it.rec)].filter(Boolean).join(' · ') || '—', widths[6] - 3.6, 7.8, 16, true) : [],
      // 2.78: dva předchozí záznamy dílu, menším písmem pod posledním
      prev: it.rec ? (it.rec.prev || []).flatMap(r => clip([r.when, r.state, recQty(r)].filter(Boolean).join(' · ') || '—', widths[6] - 3.6, 6.8, 3)) : [],
      // 2.71: odesláno na WPA proti množství zakázky, díl u nás
      sent: (st => (st ? clip(shSentText(st), widths[6] - 3.6, 7.4, 4, st.st === 'here') : []))(shSentOf(l, it)),
      note: noteTxt ? clip(noteTxt, widths[9] - 3.6, 8, 32) : [], age,
    };
    L.h = Math.max(ROW,
      PAD + L.order.length * k.LH(9, 1.25) + PAD,
      1.6 + ((parent || it.top || it.top2 || it.st === 'done') ? 4.6 : 0) + (!parent && it.top2 && it.st !== 'done' ? 3.4 : 0) + L.name.length * k.LH(8.8, 1.22) + 0.6 + (it.ean ? k.LH(7.8, 1.2) : 0) + ageH + PAD,
      PAD + L.op.length * k.LH(8.4, 1.25) + recH(it, L) + (L.sent.length ? 1.2 + L.sent.length * k.LH(7.4, 1.2) : 0) + PAD,
      L.note.length ? PAD + L.note.length * k.LH(8, 1.22) + 1.5 + 4.5 : 0);
    return L;
  };
  // keep: výška řádku, který musí být na stejné stránce (sestava nezůstane dole bez poddílu)
  const row = (it, num, parent, keep = 0, chunked = false) => {
    const noteLines=k.split([it.st?`Stav: ${shStName(it.st)}`:'',it.note||''].filter(Boolean).join(' · '),widths[9]-3.6,8);
    if(!chunked&&noteLines.length>32){
      for(let start=0;start<noteLines.length;start+=30){
        const note=(start?'(pokračování)\n':'')+noteLines.slice(start,start+30).join('\n');
        row({...it,st:'',note},num,parent,start?0:keep,true);
      }
      return;
    }
    // 2.76: hotová položka (i její poddíly) bez pruhu TOP a TOP 2, se štítkem HOTOVO
    const done = (parent || it).st === 'done';
    const L = lay(it, parent), H = L.h, top0 = !done && !!(parent || it).top, two = !done && !top0 && !!(parent || it).top2;
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
    if (L.asm) k.text(L.away ? 'jiné oddělení' : 'sestava', xs[1] + widths[1] / 2, top + PAD + 0.4, 7, { color: C.ink3, align: 'center' });
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
    if (parent || it.top || it.top2 || done) {
      const label = parent ? 'PODDÍL' : done ? 'HOTOVO' : it.top ? 'TOP SHORTAGE' : 'TOP 2', tw = k.width(label, 6.2, true) + 3;
      if (!parent && (done || !it.top)) {
        k.box([255, 255, 255], xs[3] + 1.8, y, tw, 3.6, 0.9);
        doc.setDrawColor(...C.ink); doc.setLineWidth(0.3); doc.roundedRect(xs[3] + 1.8, y, tw, 3.6, 0.9, 0.9, 'S');
      } else k.box(parent ? C.head : C.ink, xs[3] + 1.8, y, tw, 3.6, 0.9);
      k.text(label, xs[3] + 1.8 + 1.5, y + 0.75, 6.2, { bold: true, color: parent || done || !it.top ? C.ink : [255, 255, 255], space: 0.1 });
      y += 4.6;
      if (!parent && it.top2 && !done) { k.text('Zpracovat hned po TOP shortage', xs[3] + 1.8, y - 0.2, 6.6, { bold: true, color: C.ink }); y += 3.4; }
    }
    L.name.forEach((line, i) => k.text(line, xs[3] + 1.8, y + i * k.LH(8.8, 1.22), 8.8, { color: C.ink }));
    y += L.name.length * k.LH(8.8, 1.22) + (L.name.length ? 0.6 : 0);
    if (it.ean) k.text(`EAN ${it.ean}`, xs[3] + 1.8, y, parent ? 8.4 : 7.8, { color: parent ? C.ink : C.ink2, bold: !!parent });
    if (L.age && L.age.length) { const ay = y + (it.ean ? k.LH(7.8, 1.2) : 0) + 0.5; L.age.forEach((line, i) => k.text(line, xs[3] + 1.8, ay + i * k.LH(6.8, 1.2), 6.8, { bold: true, color: C.ink })); }
    L.index.forEach((line, i) => k.text(line, xs[4] + 1.8, top + PAD + i * k.LH(8.8, 1.25), 8.8, { color: parent ? C.ink2 : C.ink }));
    L.qty.forEach((line, i) => k.text(line, xs[6] - 1.8, top + 1.6 + i * k.LH(12, 1.15), L.asm ? 11 : 12, { bold: true, align: 'right', color: C.ink }));
    // operace nahoře, pod ní celý poslední záznam (stav · ks) a kdy
    L.op.forEach((line, i) => k.text(line, xs[6] + 1.8, top + PAD + i * k.LH(8.4, 1.25), 8.4, { color: it.op ? C.ink : C.ink3 }));
    if (it.rec && !L.asm) {
      const ry = top + PAD + L.op.length * k.LH(8.4, 1.25) + 1;
      doc.setDrawColor(...C.line); doc.setLineWidth(0.2); doc.line(xs[6] + 1.8, ry - 0.5, xs[7] - 1.8, ry - 0.5);
      L.rec.forEach((line, i) => k.text(line, xs[6] + 1.8, ry + 0.4 + i * k.LH(7.8, 1.2), 7.8, { bold: true, color: C.ink }));
      k.text(it.rec.when || '', xs[6] + 1.8, ry + 0.4 + L.rec.length * k.LH(7.8, 1.2) + 0.3, 6.8, { color: C.ink2 });
      if (L.prev && L.prev.length) {
        const py = ry + 0.4 + L.rec.length * k.LH(7.8, 1.2) + 0.3 + k.LH(6.8, 1.2) + 0.8;
        doc.setDrawColor(...C.line); doc.setLineWidth(0.1); doc.line(xs[6] + 1.8, py - 0.6, xs[6] + 12, py - 0.6);
        L.prev.forEach((line, i) => k.text(line, xs[6] + 1.8, py + i * k.LH(6.8, 1.2), 6.8, { color: C.ink3 }));
      }
    }
    if (L.sent && L.sent.length && !L.asm) {
      const sy = top + PAD + L.op.length * k.LH(8.4, 1.25) + recH(it, L) + 1.2;
      const here = (shSentOf(l, it) || {}).st === 'here';
      L.sent.forEach((line, i) => k.text(line, xs[6] + 1.8, sy + i * k.LH(7.4, 1.2), 7.4, { bold: here, color: here ? C.ink : C.ink2 }));
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
      // 2.78: poddíl jiného oddělení u rozdělené sestavy bez QR kódu a kolonek (dokud není zobrazený plně)
      const ds = sec.id === SH_DONE_SEC ? [] : shSplitDepts(sh, it), here = it.splitDept || ds[0];
      const sub = x => (ds.length > 1 && !shSubHere(sh, it, x, here) ? { ...x, away: shDeptName(sh, shSubDept(sh, x)) } : x);
      row(it, String(j), null, it.subs.length ? lay(sub(it.subs[0]), it).h : 0);
      it.subs.forEach((x, i) => row(sub(x), `${j}.${i + 1}`, it));
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
  // zabalený seznam (2.73) se tiskne celý, filtry jsou jen u otevřeného
  const ops = l.packed ? null : shOpSel(l);
  const dsel = l.packed ? null : shDeptSel(l);
  const asel = shAgeSel(l);
  if (!shAgePick(shDeptPick(shPdfItems(l, ops), dsel), asel).length) { toast(ops || dsel || asel ? 'Vybraný filtr nemá žádnou položku do PDF.' : 'Všechny položky jsou skryté v PDF.', true); return; }
  await withPdf(button, doc => {
    doc.setProperties({ title: `Shortage · chybějící díly ${shWhen(l)}`, subject: l.file || 'Shortage', creator: EXPORT_NAME });
    drawShortage(doc, l, ops, dsel, split, asel);
    const d = new Date(l.at);
    downloadFile(`shortage-${todayIso(l.at)}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${split ? '-po-oddelenich' : ''}.pdf`, doc.output('blob'), 'application/pdf');
  }, 'landscape');
}

