/* ==========================================================================
   VÝROBNÍ PLÁN (2.18): vzor dvou listů, import velkých souborů, kapacita brusičů
   Položky leží zašifrované v souborech na serveru (JSON po sloupcích, gzip, díly do 1,2 MB),
   ve stavu jsou jen součty po týdnech termínu. Klíč položky = objednávka + index + EAN, platí
   verze s nejpozdějším termínem (waPlanMerge v core.js).
   ========================================================================== */
const WA_PLAN_RANGES = [['b13', '13 týdnů zpět'], ['f13', '13 týdnů dopředu'], ['f26', '26 týdnů dopředu'], ['all', 'Vše']];
const WA_PLAN_CHUNK = 1200 * 1024;
const polozkaN = n => (n === 1 ? 'položka' : n >= 2 && n <= 4 ? 'položky' : 'položek');
const radekN = n => (n === 1 ? 'řádek' : n >= 2 && n <= 4 ? 'řádky' : 'řádků');
const waCellV = c => (c == null ? null : typeof c === 'object' && !(c instanceof Date) ? (c.v === undefined ? null : c.v) : c);

async function waGzip(text) {
  return new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
}
async function waGunzip(bytes) {
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
/* Počká, až se stav uloží (true), nebo až uložení selže či narazí na konflikt (false). */
async function waWaitSaved(ms = 60000) {
  const end = Date.now() + ms;
  while ((store.dirty || store.saving) && !store.conflict && !store.error && Date.now() < end) await new Promise(r => setTimeout(r, 120));
  return !store.dirty && !store.saving && !store.conflict && !store.error;
}

/* ---------- čtení souborů plánu (2.18.2) ----------
   Soubor xlsx (zip) se čte sám po kouscích: rozbalí se jen workbook, sdílené texty a listy
   (DecompressionStream), z řádků se berou jen sloupce ze vzoru. I soubor se statisíci řádků
   tak nezabere stovky MB paměti. Jiné soubory (xls, neobvyklý zip, starý prohlížeč) přečte SheetJS,
   CSV parseCSV. Každý list: {name, read({top, pick, onRow})} → {head, total}:
   - head = prvních `top` řádků celých (hodnoty), total = počet řádků listu;
   - bez `pick` se čtení po prvních řádcích zastaví (vzor);
   - s `pick(head)` → indexy sloupců; onRow(index řádku, hodnoty těch sloupců) pro všechny řádky. */
const WA_XML_ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const waXml = t => (t.indexOf('&') < 0 ? t : t.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : WA_XML_ENT[e])));
const waAttr = (a, name) => { const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(a); return m ? waXml(m[1]) : ''; };
function waZip(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let e = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i -= 1) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('zip bez adresáře');
  const n = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  if (p === 0xffffffff || n === 0xffff) throw new Error('zip64');
  const dec = new TextDecoder();
  const map = new Map();
  for (let i = 0; i < n; i += 1) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('poškozený zip');
    const nl = dv.getUint16(p + 28, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nl)).replace(/^\/+/, '').toLowerCase();
    map.set(name, { method: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) });
    p += 46 + nl + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return map;
}
/* Čtečka textu jednoho souboru ze zipu (po kouscích). */
function waZipReader(b, ent) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (!ent || dv.getUint32(ent.off, true) !== 0x04034b50) throw new Error('poškozený zip');
  const start = ent.off + 30 + dv.getUint16(ent.off + 26, true) + dv.getUint16(ent.off + 28, true);
  let s = new Blob([b.subarray(start, start + ent.csize)]).stream();
  if (ent.method === 8) s = s.pipeThrough(new DecompressionStream('deflate-raw'));
  else if (ent.method !== 0) throw new Error('nepodporovaná komprese');
  return s.pipeThrough(new TextDecoderStream()).getReader();
}
async function waZipText(b, ent) {
  const r = waZipReader(b, ent);
  let t = '';
  for (;;) { const { done, value } = await r.read(); if (done) return t; t += value; }
}
/* Konec posledního celého prvku `tag` (např. row, si) v textu, nebo -1. */
function waTagEnd(t, tag) {
  let k = t.length;
  while ((k = t.lastIndexOf(`${tag}>`, k - 1)) > 0) {
    const s = t.lastIndexOf('<', k);
    if (t[s + 1] === '/') return k + tag.length + 1;
  }
  return -1;
}
const WA_SI = /<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g;
const WA_T = /<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g;
const waRichText = x => { let out = ''; let m; const s = x.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, ''); WA_T.lastIndex = 0; while ((m = WA_T.exec(s))) out += m[1]; return waXml(out); };
async function waXlsxSst(b, ent) {
  const out = [];
  if (!ent) return out;
  const r = waZipReader(b, ent);
  let buf = '';
  const take = block => { let m; WA_SI.lastIndex = 0; while ((m = WA_SI.exec(block))) out.push(waRichText(m[1])); };
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    buf += value;
    const cut = waTagEnd(buf, 'si');
    if (cut > 0) { take(buf.slice(0, cut)); buf = buf.slice(cut); }
  }
  take(buf);
  return out;
}
const WA_ROW = /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
const WA_C = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
const WA_V = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/;
const WA_REF = /(?:^|\s)r="([A-Z]{1,3})\d*"/;
const WA_TYPE = /(?:^|\s)t="(\w+)"/;
function waXlsxCells(inner, sst, want) {
  const out = [];
  if (!inner) return out;
  let col = -1;
  let m;
  WA_C.lastIndex = 0;
  while ((m = WA_C.exec(inner))) {
    const a = m[1];
    const ref = WA_REF.exec(a);
    col = ref ? waIndex(ref[1]) : col + 1;
    if (want && !want.has(col)) continue;
    const x = m[2] || '';
    const t = (WA_TYPE.exec(a) || [])[1] || 'n';
    if (t === 'inlineStr') { out[col] = waRichText(x); continue; }
    const v = WA_V.exec(x);
    if (!v) continue;
    if (t === 's') out[col] = sst[+v[1]] ?? null;
    else if (t === 'str' || t === 'd') out[col] = waXml(v[1]);
    else if (t === 'b') out[col] = v[1] === '1';
    else if (t !== 'e') { const n = Number(v[1]); out[col] = v[1] !== '' && Number.isFinite(n) ? n : waXml(v[1]); }
  }
  return out;
}
const waDense = r => Array.from(r || [], v => (v === undefined ? null : v));
async function waXlsxRead(b, ent, sst, { top = 60, pick = null, onRow = null, progress = null } = {}) {
  const r = waZipReader(b, ent);
  const head = [];
  let cols = null;
  let want = null;
  let total = 0;
  let last = -1;
  let stop = false;
  let n = 0;
  const emit = (i, cells) => onRow(i, cols.map(c => (c < 0 ? null : cells[c] ?? null)));
  const start = () => { cols = pick(head.map(waDense)); want = new Set(cols.filter(c => c >= 0)); head.forEach((cells, i) => { if (cells) emit(i, cells); }); };
  const take = block => {
    let m;
    WA_ROW.lastIndex = 0;
    while ((m = WA_ROW.exec(block))) {
      const rr = +waAttr(m[1], 'r');
      const i = rr > 0 ? rr - 1 : last + 1;
      last = i;
      if (!cols) {
        if (i < top) { head[i] = waXlsxCells(m[2], sst, null); continue; }
        if (!pick) { stop = true; return; }
        start();
      }
      emit(i, waXlsxCells(m[2], sst, want));
      n += 1;
    }
  };
  let buf = '';
  let ended = false;
  try {
    for (;;) {
      const { done, value } = await r.read();
      if (done) { ended = true; break; }
      buf += value;
      if (!total) { const d = /<(?:\w+:)?dimension\b[^>]*?ref="[A-Z]+\d+(?::[A-Z]+(\d+))?"/.exec(buf); if (d) total = +(d[1] || 1); }
      const cut = waTagEnd(buf, 'row');
      if (cut > 0) { take(buf.slice(0, cut)); buf = buf.slice(cut); }
      if (stop) break;
      if (progress) await progress(n);   // může vyhodit chybu (zrušeno) a čtení skončí
    }
  } finally { if (!ended) r.cancel().catch(() => {}); }
  if (!stop) take(buf);
  if (pick && !cols) start();
  for (let i = 0; i < Math.min(top, last + 1); i += 1) if (!head[i]) head[i] = [];
  return { head: head.map(waDense), total: Math.max(total, last + 1) };
}
async function waXlsxOpen(b) {
  const zip = waZip(b);
  const rels = {};
  const relXml = await waZipText(b, zip.get('xl/_rels/workbook.xml.rels'));
  for (const m of relXml.matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?>/g)) rels[waAttr(m[1], 'Id')] = waAttr(m[1], 'Target');
  const wb = await waZipText(b, zip.get('xl/workbook.xml'));
  const sheets = [...wb.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?>/g)].map(m => {
    const id = (/\s\w+:id="([^"]+)"/.exec(m[1]) || [])[1];
    const target = String(rels[id] || '');
    const path = (target.startsWith('/') ? target.slice(1) : `xl/${target}`).replace(/\/\.\//g, '/').toLowerCase();
    return { name: waAttr(m[1], 'name'), ent: zip.get(path) };
  });
  if (!sheets.length || sheets.some(s => !s.ent)) throw new Error('listy nenalezeny');
  const sst = await waXlsxSst(b, zip.get('xl/sharedstrings.xml'));
  return sheets.map(s => ({ name: s.name, read: o => waXlsxRead(b, s.ent, sst, o) }));
}
/* List v paměti (CSV, SheetJS): stejné rozhraní jako waXlsxRead. */
function waMemSheet(name, data, cell = v => v) {
  return {
    name,
    async read({ top = 60, pick = null, onRow = null } = {}) {
      const row = i => Array.from(data[i] || [], v => { const x = cell(v); return x === undefined ? null : x; });
      const head = [];
      for (let i = 0; i < Math.min(top, data.length); i += 1) head.push(row(i));
      if (pick) {
        const cols = pick(head);
        for (let i = 0; i < data.length; i += 1) {
          const r = data[i];
          if (!r) continue;
          onRow(i, cols.map(c => { if (c < 0) return null; const x = cell(r[c]); return x === undefined ? null : x; }));
          if (i % 20000 === 19999) await new Promise(res => setTimeout(res, 0));
        }
      }
      return { head, total: data.length };
    },
  };
}
const waDeflateRaw = (() => { try { new DecompressionStream('deflate-raw'); return typeof TextDecoderStream === 'function'; } catch (error) { return false; } })();
async function waPlanOpen(file, { quick = false, buffer = null } = {}) {
  buffer = buffer || await file.arrayBuffer();
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return [waMemSheet(file.name, parseCSV(decodeText(buffer)))];
  const b = new Uint8Array(buffer);
  if (b[0] === 0x50 && b[1] === 0x4b && waDeflateRaw) {
    try { return await waXlsxOpen(b); } catch (error) { console.warn('Plán: rychlé čtení nevyšlo, čte SheetJS', error); }
  }
  const X = await xlsx();
  const wb = X.read(b, { type: 'array', dense: true, cellHTML: false, cellText: false, cellNF: false, cellStyles: false, ...(quick ? { sheetRows: 80 } : {}) });
  return wb.SheetNames.map(name => {
    const ws = wb.Sheets[name] || [];
    const sheet = waMemSheet(name, Array.isArray(ws) ? ws : ws['!data'] || [], waCellV);
    let total = 0;
    try { total = X.utils.decode_range(ws['!fullref'] || ws['!ref'] || 'A1').e.r + 1; } catch (error) { /* necháme délku dat */ }
    const read = sheet.read;
    sheet.read = async o => { const r = await read(o); return { ...r, total: Math.max(total, r.total) }; };
    return sheet;
  });
}

/* ---------- vzor: které sloupce v každém listu nás zajímají ---------- */
async function waPlanTemplate(file) {
  if (!file) return;
  let sheets;
  try {
    const book = await waPlanOpen(file, { quick: true });
    sheets = [];
    for (const sh of book) { const { head, total } = await sh.read({ top: 80 }); sheets.push({ name: sh.name, total, rows: head }); }
  } catch (error) { toast(`Soubor se nepodařilo otevřít: ${error.message}`, true); return; }
  const prev = S.workAudit.plan.tpl;
  sheets = sheets.filter(sh => sh.rows.some(r => r.some(v => v != null && v !== '')));
  if (!sheets.length) { toast('V souboru není žádný list s daty.', true); return; }
  sheets.forEach((sh, i) => {
    const old = prev && prev.sheets.find(x => x.name === sh.name);
    if (old) { const c = waPlanCols(sh.rows, old); sh.header = c.header; sh.cols = { ...c.idx }; }
    else {
      // Názvy sloupců jsou v plánu na 2. řádku; jinak řádek s nejvíc texty.
      const texts = r => (r || []).filter(v => typeof v === 'string' && v.trim()).length;
      sh.header = texts(sh.rows[1]) >= 2 ? 1 : waPlanHeaderRow(sh.rows);
      sh.cols = waPlanGuess((sh.rows[sh.header] || []).map(v => (v == null ? '' : String(v))));
    }
    sh.use = prev ? !!old || (!prev.sheets.some(x => sheets.some(s => s.name === x.name)) && i < 2) : i < 2;
    sh.width = Math.min(200, Math.max(1, ...sh.rows.map(r => r.length)));
  });
  const head = sh => sh.rows[sh.header] || [];
  const opt = (sh, f) => `<option value="">— nepoužít —</option>${Array.from({ length: sh.width }, (_, c) => {
    const h = head(sh)[c];
    return `<option value="${c}"${sh.cols[f] === c ? ' selected' : ''}>${colLetter(c)}${h != null && h !== '' ? ` · ${esc(String(h).slice(0, 40))}` : ''}</option>`;
  }).join('')}`;
  const cell = (f, v) => {
    if (v == null || v === '') return '<span class="muted">—</span>';
    if (f === 'due') { const d = cellToDateTime(v); return d ? esc(`${d.d}. ${d.m}. ${d.y}`) : `<span class="crit">${esc(String(v))}</span>`; }
    return esc(String(v).slice(0, 30));
  };
  const prevHtml = sh => {
    const fs = WA_PLAN_FIELDS.filter(f => sh.cols[f] != null);
    if (!fs.length) return '<p class="tiny muted">Vyber sloupce, ukážou se první řádky.</p>';
    const rows = sh.rows.slice(sh.header + 1).filter(r => r.some(v => v != null && v !== '')).slice(0, 4);
    return `<table class="wa-prev"><thead><tr>${fs.map(f => `<th>${esc(WA_PLAN_LABEL[f])}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${fs.map(f => `<td>${cell(f, r[sh.cols[f]])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${fs.length}" class="muted">Pod nadpisy nejsou data.</td></tr>`}</tbody></table>`;
  };
  const secHtml = (sh, i) => `<label class="check wa-tpl-use"><input type="checkbox" data-tpluse${sh.use ? ' checked' : ''}><span>List <b>${esc(sh.name)}</b> <small class="muted">(${sh.total} ${radekN(sh.total)})</small></span></label>
    <div class="wa-tpl-body"${sh.use ? '' : ' hidden'}>
      <label class="field wa-tpl-head"><span>Řádek s nadpisy</span><input type="number" min="1" max="80" value="${sh.header + 1}" data-tplhead></label>
      <div class="wa-tpl-grid">${WA_PLAN_FIELDS.map(f => `<label class="field"><span>${esc(WA_PLAN_LABEL[f])}</span><select data-tplf="${f}" aria-label="${esc(`${WA_PLAN_LABEL[f]}, list ${sh.name}`)}">${opt(sh, f)}</select></label>`).join('')}</div>
      <div class="wa-tpl-prev" data-tplprev>${prevHtml(sh)}</div>
    </div>`;
  const res = await dialog({
    title: 'Vzor výrobního plánu', ok: 'Uložit vzor', wide: true, tall: true,
    html: `<p>Ze souboru <b>${esc(file.name)}</b> se nastaví, které sloupce se čtou v každém listu. Další soubory plánu se pak čtou stejně; když se nadpisy posunou o řádek nebo sloupec, najdou se podle názvu.</p>
      <p class="small muted">Potřeba je <b>počet kusů</b>, <b>termín dokončení</b> a aspoň jedno z čísla objednávky, indexu a EAN (podle nich se hledají duplicity). Podle <b>technologie</b> se berou jen položky ${esc(S.workAudit.plan.tech.words.join(' nebo ') || 'všech technologií')}.</p>
      ${sheets.map((sh, i) => `<section class="wa-tpl-sheet" data-tplsh="${i}">${secHtml(sh, i)}</section>`).join('')}`,
    onOpen: dlg => {
      const body = $('#dlgBody', dlg);
      body.addEventListener('change', event => {
        const t = event.target;
        const sec = t.closest('[data-tplsh]');
        if (!sec) return;
        const sh = sheets[+sec.dataset.tplsh];
        if (t.matches('[data-tpluse]')) { sh.use = t.checked; $('.wa-tpl-body', sec).hidden = !sh.use; return; }
        if (t.matches('[data-tplhead]')) {
          sh.header = clamp(Math.round(+t.value || 1), 1, sh.rows.length || 1) - 1;
          if (!WA_PLAN_FIELDS.some(f => sh.cols[f] != null)) sh.cols = waPlanGuess(head(sh).map(v => (v == null ? '' : String(v))));
          sec.innerHTML = secHtml(sh, +sec.dataset.tplsh);
          return;
        }
        if (t.matches('[data-tplf]')) {
          if (t.value === '') delete sh.cols[t.dataset.tplf]; else sh.cols[t.dataset.tplf] = +t.value;
          $('[data-tplprev]', sec).innerHTML = prevHtml(sh);
        }
      });
    },
    validate: () => {
      const used = sheets.filter(sh => sh.use);
      if (!used.length) return 'Vyber aspoň jeden list.';
      if (used.length > 2) return 'Plán má dva listy: vyber nejvýš dva.';
      for (const sh of used) {
        if (sh.cols.ks == null || sh.cols.due == null) return `List ${sh.name}: chybí sloupec počtu kusů nebo termínu dokončení.`;
        if (sh.cols.order == null && sh.cols.index == null && sh.cols.ean == null) return `List ${sh.name}: vyber aspoň číslo objednávky, index nebo EAN.`;
        const dup = WA_PLAN_FIELDS.filter(f => sh.cols[f] != null).map(f => sh.cols[f]);
        if (new Set(dup).size !== dup.length) return `List ${sh.name}: jeden sloupec je vybraný dvakrát.`;
      }
      return null;
    },
  });
  if (res.value !== 'ok') return;
  const p = S.workAudit.plan;
  p.tpl = { file: file.name.slice(0, 160), at: Date.now(), by: ui.me.label || '', sheets: sheets.filter(sh => sh.use).map(sh => ({
    name: sh.name, header: sh.header,
    cols: Object.fromEntries(WA_PLAN_FIELDS.map(f => [f, sh.cols[f] != null ? colLetter(sh.cols[f]) : ''])),
    heads: Object.fromEntries(WA_PLAN_FIELDS.map(f => [f, sh.cols[f] != null ? String(head(sh)[sh.cols[f]] ?? '').trim().slice(0, 80) : ''])),
  })) };
  save();
  flushSave();   // vzor jde do historie samostatně, ne až s nahráním plánu
  ui.wa.tab = 'plan';
  renderWorkAudit();
  const go = await dialog({ title: 'Vzor uložen', ok: 'Přidat do fronty', cancel: 'Teď ne',
    html: `<p>Přidat <b>${esc(file.name)}</b> do fronty souborů plánu? Další soubory přidáš tlačítkem <b>Přidat soubory</b> (po jednom nebo víc najednou) a nakonec je zpracuješ tlačítkem <b>Zpracovat soubory</b>.</p>` });
  if (go.value === 'ok') waPlanQueueAdd([file]);
}

/* ---------- uložený plán: načtení a uložení po dílech ---------- */
async function waPlanLoad(p, step) {
  const map = new Map();
  const lost = [];
  for (const [i, id] of p.chunks.entries()) {
    await step(`Načítám uložený plán (${i + 1} z ${p.chunks.length})…`, i / Math.max(1, p.chunks.length));
    try {
      waPlanDecode(JSON.parse(await waGunzip(await Vault.loadFile(id)))).forEach((v, k) => map.set(k, v));
    } catch (error) {
      if (error.status === 404) lost.push(id); else throw error;
    }
  }
  return { map, lost };
}
async function waPlanStore(map, step) {
  const entries = [...map.entries()];
  const ids = [];
  let i = 0;
  let per = 40000;
  try {
    while (i < entries.length) {
      const bytes = await waGzip(JSON.stringify(waPlanEncode(new Map(entries.slice(i, i + per)))));
      if (bytes.length > WA_PLAN_CHUNK && per > 500) { per = Math.floor(per / 2); continue; }
      if (ids.length >= 60) throw new Error('Plán je příliš velký (víc než 60 dílů).');
      ids.push(await Vault.saveFile(bytes));
      i += per;
      await step(`Šifruji a ukládám plán: ${nf(Math.min(i, entries.length))} z ${nf(entries.length)} položek…`, Math.min(1, i / entries.length));
    }
  } catch (error) {
    ids.forEach(id => Vault.deleteFile(id).catch(() => {}));
    throw error;
  }
  return ids;
}

/* ---------- fronta souborů plánu (2.18.2) ----------
   Soubory se přidávají po jednom nebo po několika. Každý se hned přečte (jen sloupce ze vzoru,
   jen technologie podle filtru) a jeho položky se sloučí do fronty v paměti tohoto okna.
   Zpracování pak frontu jednou sloučí s uloženým plánem (pozdější termín vyhrává) a uloží. */
const waMb = n => (n < 1048576 ? `${nf(Math.max(1, Math.round(n / 1024)))} kB` : `${nf(n / 1048576, 1)} MB`);
function waPlanQueue() { return ui.wa.planQ || (ui.wa.planQ = { files: [], map: new Map(), techs: new Map() }); }
/* Okno s průběhem. S tlačítkem Zrušit: další step() po zrušení vyhodí chybu {aborted}. */
function waProgress(title, text, cancel = '') {
  let dlg = null;
  let closing = false;
  let aborted = false;
  let last = 0;
  const shown = dialog({ title, ok: '', cancel, html: `<p id="waProg">${esc(text)}</p><div class="wa-progbar"><i id="waProgBar"></i></div>`, onOpen: d => { dlg = d; if (closing) d.close(); } });
  shown.then(() => { if (!closing) aborted = true; });
  return {
    get aborted() { return aborted; },
    async step(t, frac = null, force = false) {
      if (aborted) throw Object.assign(new Error('Zrušeno.'), { aborted: true });
      if (!force && Date.now() - last < 120) return;
      last = Date.now();
      const el = $('#waProg');
      if (el && t) el.textContent = t;
      const bar = $('#waProgBar');
      if (bar && frac != null) bar.style.width = `${Math.round(clamp(frac, 0, 1) * 100)}%`;
      await new Promise(r => setTimeout(r, 0));
    },
    async close() { closing = true; if (dlg && dlg.open) dlg.close(); if (dlg) await shown; },
  };
}
/* Jeden soubor plánu podle vzoru: řádky [objednávka, EAN, ks, index, termín, technologie(, 1)]. */
async function waPlanReadFile(file, tpl, progress, buffer = null) {
  const book = await waPlanOpen(file, { buffer });
  const rows = [];
  const warns = [];
  for (const [si, sh] of tpl.sheets.entries()) {
    const sheet = book.find(b => b.name === sh.name) || (book.length === tpl.sheets.length || book.length === 1 ? book[si] : null);
    if (!sheet) { warns.push(`chybí list ${sh.name}`); continue; }
    const noTech = !sh.cols.tech;
    let info = null;
    await sheet.read({
      top: 60,
      pick: head => { info = waPlanCols(head, sh); return WA_PLAN_FIELDS.map(f => (f in info.idx ? info.idx[f] : -1)); },
      onRow: (r, v) => {
        if (r <= info.header || v.every(x => x == null || x === '')) return;
        if (noTech) v.push(1);
        rows.push(v);
      },
      progress: () => progress(rows.length, si / tpl.sheets.length),
    });
    if (!info.found) warns.push(`list ${sheet.name}: nadpisy ze vzoru se nenašly, čte se podle písmen sloupců`);
    else if (info.missing.length) warns.push(`list ${sheet.name}: ${info.missing.map(f => WA_PLAN_LABEL[f]).join(', ')} se podle názvu nenašlo, čte se podle písmene ze vzoru`);
    if (sheet.name !== sh.name) warns.push(`list ${sh.name} se jmenuje ${sheet.name}`);
    if (noTech) warns.push(`list ${sheet.name} nemá ve vzoru sloupec technologie, berou se všechny řádky`);
  }
  return { rows, warns };
}
async function waPlanQueueAdd(files) {
  files = [...(files || [])].filter(Boolean);
  const p = S.workAudit.plan;
  if (!files.length) return;
  if (!p.tpl) { toast('Nejdřív nastav vzor ze souboru plánu.', true); return; }
  if (ui.wa.planBusy) { toast('Plán se právě zpracovává.', true); return; }
  ui.wa.planBusy = true;
  const q = waPlanQueue();
  const prog = waProgress('Přidávám soubory do fronty', 'Připravuji…', 'Zrušit');
  let added = 0;
  let same = 0;
  let failed = 0;
  try {
    for (const [i, file] of files.entries()) {
      await prog.step(`Čtu ${file.name} (${i + 1} z ${files.length}, ${waMb(file.size)})…`, i / files.length, true);
      // Stejný soubor se pozná podle obsahu (otisk SHA-256), ne podle názvu nebo data.
      const buffer = await file.arrayBuffer();
      const key = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), x => x.toString(16).padStart(2, '0')).join('');
      if (q.files.some(f => f.key === key)) { same += 1; continue; }
      let res;
      try { res = await waPlanReadFile(file, p.tpl, (n, f) => prog.step(`Čtu ${file.name} (${i + 1} z ${files.length}): ${nf(n)} řádků…`, (i + f) / files.length), buffer); }
      catch (error) {
        if (error.aborted) throw error;
        q.files.push({ key, name: file.name, size: file.size, error: error.message });
        failed += 1;
        continue;
      }
      await prog.step(`Hledám duplicity v ${nf(res.rows.length)} řádcích (${file.name})…`, (i + 0.9) / files.length, true);
      const st = waPlanMerge(q.map, res.rows, p.tech);
      st.techs.forEach(x => { const t = q.techs.get(x.tech) || { n: 0, ok: x.ok }; t.n += x.n; q.techs.set(x.tech, t); });
      q.files.push({ key, name: file.name, size: file.size, rows: st.rows, matched: st.matched, notTech: st.notTech, bad: st.bad, dupes: st.dupes, warns: res.warns });
      added += 1;
    }
  } catch (error) {
    if (!error.aborted) toast(`Soubor se nepodařilo přečíst: ${error.message}`, true);
  } finally {
    await prog.close();
    ui.wa.planBusy = false;
  }
  ui.wa.tab = 'plan';
  renderWorkAudit();
  if (prog.aborted) toast('Čtení zrušeno. Soubory přečtené předtím ve frontě zůstaly.', true);
  else if (added || same || failed) toast(`${added ? `Do fronty ${added === 1 ? 'přidán 1 soubor' : `přidáno ${added} ${added <= 4 ? 'soubory' : 'souborů'}`}. ` : ''}${same ? `${same} už ve frontě ${same === 1 ? 'byl' : 'byly'}. ` : ''}${failed ? `${failed} se nepodařilo přečíst. ` : ''}Ve frontě ${nf(q.map.size)} ${polozkaN(q.map.size)}.`, !!failed);
}
function waPlanQueueClear() {
  ui.wa.planQ = null;
  renderWorkAudit();
}
/* Zpracování fronty: sloučit s uloženým plánem, ukázat souhrn, uložit díly a stav. */
async function waPlanProcess() {
  const q = ui.wa.planQ;
  const wa = S.workAudit;
  const p = wa.plan;
  if (!q || !q.map.size) { toast('Ve frontě nejsou žádné položky k uložení.', true); return; }
  if (ui.wa.planBusy) { toast('Plán se právě zpracovává.', true); return; }
  ui.wa.planBusy = true;
  let prog = waProgress('Výrobní plán', 'Načítám uložený plán…');
  try {
    const { map, lost } = await waPlanLoad(p, prog.step);
    const before = map.size;
    await prog.step('Slučuji frontu s uloženým plánem…', 1, true);
    const st = waPlanMergeMap(map, q.map);
    await prog.close();
    const ok = q.files.filter(f => !f.error);
    const sum = k => ok.reduce((a, f) => a + (f[k] || 0), 0);
    const words = p.tech.words.length ? p.tech.words.join(' nebo ') : '';
    const weeks = waPlanWeeks(map);
    const wk = Object.keys(weeks).sort();
    const warns = [];
    if (lost.length) warns.push(`Na serveru chybí ${lost.length} z ${p.chunks.length} dílů dřív uloženého plánu (třeba po obnovení starší verze dat). Položky z nich v plánu nebudou, dokud ty soubory nezpracuješ znovu.`);
    q.files.forEach(f => { if (f.error) warns.push(`${f.name}: soubor se nepodařilo přečíst (${f.error}).`); (f.warns || []).forEach(w => warns.push(`${f.name}: ${w}.`)); });
    const tiles = [['Souborů', ok.length], ['Řádků', sum('rows')], [words || 'Bráno', sum('matched'), 'on'], ['Jiná technologie', sum('notTech')], ['Neplatné', sum('bad')], ['Sloučené duplicity', sum('matched') - q.map.size],
      ['Nové položky', st.added, 'on'], ['Posunutý termín', st.moved], ['Starší verze', st.older], ['Termín beze změny', st.same]];
    const res = await dialog({
      title: 'Zpracovat výrobní plán', ok: 'Uložit plán', wide: true,
      html: `<p>Fronta: ${nf(q.map.size)} ${polozkaN(q.map.size)} z ${ok.length} ${ok.length === 1 ? 'souboru' : 'souborů'}. Proti uloženému plánu:</p>
        <dl class="wa-impstats wa-imptotal">${tiles.map(([l, v, on]) => `<div${on ? ' class="on"' : ''}><dt>${esc(l)}</dt><dd class="num">${nf(v)}</dd></div>`).join('')}</dl>
        <ul class="wa-imp">
          <li>Položek v plánu: <b>${nf(map.size)}</b>${before ? ` (předtím ${nf(before)})` : ''}, termíny ${wk.length ? `${esc(weekName(wk[0]))} až ${esc(weekName(wk[wk.length - 1]))}` : '—'}, celkem ${nf(Object.values(weeks).reduce((a, x) => a + x.ks, 0))} ks.</li>
          <li>Duplicita = stejné číslo objednávky, index a EAN (ve frontě i proti uloženému plánu). Platí verze s <b>nejpozdějším termínem</b>; posunutý termín přepíše i počet kusů, starší verze se nebere.</li>
          ${warns.slice(0, 12).map(w => `<li class="w">${esc(w)}</li>`).join('')}${warns.length > 12 ? `<li class="w">… a ${warns.length - 12} dalších upozornění</li>` : ''}
        </ul>${waPlanTechHtml(q.techs)}`,
    });
    if (res.value !== 'ok') return;
    prog = waProgress('Výrobní plán', 'Šifruji a ukládám plán…');
    let ids;
    try { ids = await waPlanStore(map, prog.step); }
    catch (error) { await prog.close(); toast(`Plán se nepodařilo uložit: ${error.message}`, true); return; }
    const old = p.chunks.slice();
    const at = Date.now();
    const by = ui.me.label || '';
    Object.assign(p, { chunks: ids, weeks, items: map.size, at, by });
    ok.forEach(f => p.files.push({ name: f.name.slice(0, 160), at, by, rows: f.rows, matched: f.matched, dupes: f.dupes, added: 0, moved: 0, items: map.size }));
    p.files = p.files.slice(-40);
    const names = ok.slice(0, 3).map(f => f.name).join(', ') + (ok.length > 3 ? ` a ${ok.length - 3} dalších` : '');
    store.note = { kind: 'workaudit', text: `KPI: zpracován výrobní plán ${names} (${nf(sum('matched'))} ${radekN(sum('matched'))}${words ? ` ${words}` : ''}, ${nf(st.added)} nových ${polozkaN(st.added)}, ${nf(st.moved)} s posunutým termínem; v plánu ${nf(map.size)} ${polozkaN(map.size)})` };
    save();
    await prog.step('Ukládám…', 1, true);
    const saved = await waWaitSaved();
    await prog.close();
    // Staré díly se smažou až po uložení stavu, který na ně už neodkazuje.
    if (saved && (store.base?.workAudit?.plan?.chunks || []).join() === ids.join()) old.filter(id => !ids.includes(id)).forEach(id => Vault.deleteFile(id).catch(() => {}));
    ui.wa.planQ = null;
    ui.wa.tab = 'plan';
    renderWorkAudit();
    toast(`Výrobní plán uložen: ${nf(map.size)} ${polozkaN(map.size)}.`);
  } catch (error) {
    await prog.close();
    toast(`Plán se nepodařilo zpracovat: ${error.message}`, true);
  } finally {
    ui.wa.planBusy = false;
  }
}
/* Nejčastější hodnoty technologie, ať je vidět, co filtr bere a co ne. */
function waPlanTechHtml(techs) {
  const list = [...techs.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 14);
  if (!list.length) return '';
  return `<p class="small"><b>Technologie v souborech</b> (nejčastější):</p><div class="wa-techs">${list.map(([t, x]) => `<span class="wa-tech${x.ok ? ' ok' : ''}">${x.ok ? I.check : '<b aria-hidden="true">✕</b>'}${esc(t || '(prázdné)')}<small>${nf(x.n)}</small></span>`).join('')}</div>`;
}

async function waPlanClear() {
  const p = S.workAudit.plan;
  if (!p.items && !p.chunks.length) return;
  if (!await confirmBox('Smazat výrobní plán?', `Smaže se ${nf(p.items)} ${polozkaN(p.items)} a seznam nahraných souborů. Vzor, filtr technologie a kapacita zůstanou, plán pak můžeš nahrát znovu (třeba s jiným filtrem).`, 'Smazat plán', true)) return;
  const old = p.chunks.slice();
  const n = p.items;
  Object.assign(p, { chunks: [], weeks: {}, items: 0, files: [], at: Date.now(), by: ui.me.label || '' });
  store.note = { kind: 'workaudit', text: `KPI: smazán výrobní plán (${nf(n)} ${polozkaN(n)})` };
  save();
  renderWorkAudit();
  if (await waWaitSaved()) old.forEach(id => Vault.deleteFile(id).catch(() => {}));
}

/* ---------- záložka Výrobní plán ---------- */
function waPlanWeekIds() {
  const p = S.workAudit.plan;
  const now = isoWeek(todayIso()).id;
  const ids = Object.keys(p.weeks).sort();
  const mode = ui.wa.planRange === 'custom' || WA_PLAN_RANGES.some(x => x[0] === ui.wa.planRange) ? ui.wa.planRange : 'f13';
  let from = now;
  let to = shiftWeek(now, 12);
  if (mode === 'b13') { from = shiftWeek(now, -12); to = now; }
  else if (mode === 'f26') to = shiftWeek(now, 25);
  else if (mode === 'all') { from = ids[0] && ids[0] < now ? ids[0] : now; to = ids.length && ids[ids.length - 1] > now ? ids[ids.length - 1] : now; }
  else if (mode === 'custom' && WA_ISO.test(ui.wa.pFrom) && WA_ISO.test(ui.wa.pTo)) {
    // vlastní od–do: týdny, do kterých data spadají (plán se sčítá po týdnech termínu)
    from = isoWeek(ui.wa.pFrom < ui.wa.pTo ? ui.wa.pFrom : ui.wa.pTo).id;
    to = isoWeek(ui.wa.pFrom < ui.wa.pTo ? ui.wa.pTo : ui.wa.pFrom).id;
  }
  const out = [];
  for (let w = from, i = 0; w && w <= to && i < 260; w = shiftWeek(w, 1), i += 1) out.push(w);
  return out;
}
/* Čára kusů k dodání a čárkovaná kapacita na jedné ose. Týden nad kapacitou má bod červeně. */
function waPlanChart({ title, sub, points, tip }) {
  const W = 420, H = 200, L = 40, R = 8, T = 18, B = 24;
  const plan = points.map(p => p.plan);
  const cap = points.map(p => p.cap);
  const present = [...plan, ...cap].filter(v => v != null);
  const leg = '<span class="wa-legend"><i class="sw"></i>kusy k dodání<i class="dash"></i>kapacita</span>';
  if (!present.length || !Math.max(...present)) return `<figure class="chart c-tab"><figcaption><b>${esc(title)}</b><span>${esc(sub)}</span>${leg}</figcaption><div class="chart-empty">V tomto období bez plánu.</div></figure>`;
  const top = niceMax(Math.max(...present) * 1.1);
  const plotH = H - T - B;
  const band = (W - L - R) / points.length;
  const y = v => T + plotH - (Math.min(v, top) / top) * plotH;
  const cx = i => L + i * band + band / 2;
  const every = Math.ceil(points.length / 10);
  const path = vals => { let d = ''; let pen = false; vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${cx(i).toFixed(1)} ${y(v).toFixed(1)}`; pen = true; }); return d; };
  // kapacita jako schody: týden = vodorovná čárka přes celé pásmo
  let capD = '';
  cap.forEach((v, i) => { if (v == null) return; const x0 = L + i * band, x1 = x0 + band; capD += `${i && cap[i - 1] != null ? 'L' : 'M'}${x0.toFixed(1)} ${y(v).toFixed(1)}H${x1.toFixed(1)}`; });
  const r = points.length > 30 ? 2.5 : 4;
  const dots = plan.map((v, i) => (v == null ? '' : `<circle class="wa-dot${cap[i] != null && v > cap[i] ? ' neg' : ''}" cx="${cx(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${r}"/>`)).join('');
  const labels = points.map((p, i) => ((points.length - 1 - i) % every === 0 ? `<text class="xl" x="${cx(i).toFixed(1)}" y="${H - 8}">${esc(p.label)}</text>` : '')).join('');
  const hits = points.map((p, i) => `<rect class="hit" x="${(L + i * band).toFixed(1)}" y="${T}" width="${band.toFixed(1)}" height="${plotH}" tabindex="0" data-tip="${esc(tip(p))}"/>`).join('');
  const grid = [0, top / 2, top].map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="yl" x="${L - 6}" y="${(y(v) + 3.5).toFixed(1)}">${esc(nf(v, 0))}</text>`).join('');
  const mx = plan.reduce((b, v, i) => (v != null && (b < 0 || v > plan[b]) ? i : b), -1);
  const capT = mx >= 0 && plan[mx] ? `<text class="cap" x="${cx(mx).toFixed(1)}" y="${(y(plan[mx]) - 9).toFixed(1)}">${esc(nf(plan[mx], 0))}</text>` : '';
  return `<figure class="chart c-tab"><figcaption><b>${esc(title)}</b><span>${esc(sub)}</span>${leg}</figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${grid}<path class="wa-capline" d="${capD}"/><path class="wa-line" d="${path(plan)}"/>${dots}${labels}${capT}${hits}</svg></figure>`;
}

function waPlanHtml() {
  const wa = S.workAudit;
  const p = wa.plan;
  const words = p.tech.words.length ? p.tech.words.join(' nebo ') : 'všechny technologie';
  const G = wa.groups.find(g => g.id === p.cap.group) || null;
  const tplBtn = `<button class="btn sec" type="button" data-waplantpl>${p.tpl ? 'Nastavit vzor znovu' : 'Nahrát vzor plánu'}</button>`;
  const q = ui.wa.planQ && ui.wa.planQ.files.length ? ui.wa.planQ : null;
  const impBtn = `<button class="btn${q ? ' sec' : ''}" type="button" data-waplanpick${p.tpl ? '' : ' disabled'}>Přidat soubory</button>`;
  // Fronta: přečtené soubory čekají na zpracování (jen v tomto okně, do uložení).
  const queue = q ? `<div class="card wa-queue"><div class="card-head"><div><h3>Fronta ke zpracování</h3><p class="small muted">Soubory jsou přečtené jen v tomto okně. Do plánu se uloží až tlačítkem Zpracovat soubory; zavřením nebo obnovením stránky se fronta ztratí.</p></div>
      <button class="btn ghost small" type="button" data-waplanqclear>Vyprázdnit frontu</button></div>
    <div class="table-card flat"><table class="stack wa-qfiles"><thead><tr><th>Soubor</th><th class="r">Velikost</th><th class="r">Řádků</th><th class="r">${esc(p.tech.words.join('/') || 'Bráno')}</th><th class="r">Jiná technologie</th><th class="r">Neplatné</th><th class="r">Duplicity</th></tr></thead><tbody>${q.files.map(f => `<tr${f.error ? ' class="wa-qerr"' : ''}>
      <td class="wrap name" data-label="Soubor"><b>${esc(f.name)}</b>${f.error ? `<small class="crit">nejde přečíst: ${esc(f.error)}</small>` : (f.warns || []).map(w => `<small class="wa-qwarn">${esc(w)}</small>`).join('')}</td>
      <td class="r num" data-label="Velikost">${waMb(f.size)}</td>
      ${f.error ? '<td colspan="5" class="muted">—</td>' : `<td class="r num" data-label="Řádků">${nf(f.rows)}</td><td class="r num" data-label="Bráno"><b>${nf(f.matched)}</b></td><td class="r num" data-label="Jiná technologie">${nf(f.notTech)}</td><td class="r num" data-label="Neplatné">${nf(f.bad)}</td><td class="r num" data-label="Duplicity">${nf(f.dupes)}</td>`}</tr>`).join('')}</tbody></table></div>
    <div class="wa-queue-foot"><span>Ve frontě <b>${nf(q.map.size)}</b> ${polozkaN(q.map.size)} z ${q.files.filter(f => !f.error).length} ${q.files.filter(f => !f.error).length === 1 ? 'souboru' : 'souborů'} (duplicity už sloučené).</span>
      <span class="spacer"></span><button class="btn sec" type="button" data-waplanpick>Přidat další</button><button class="btn" type="button" data-waplanrun${q.map.size ? '' : ' disabled'}>Zpracovat soubory</button></div></div>` : '';
  const settings = `<div class="card wa-plan-set"><h3>Filtr a kapacita</h3>
      <div class="wa-plan-setgrid">
        <label class="field"><span>Technologie (klíčová písmena)</span><input id="waPlanWords" value="${esc(p.tech.words.join(', '))}" placeholder="prázdné = všechny" autocapitalize="characters" autocomplete="off"></label>
        <fieldset class="field wa-plan-mode"><legend>Hledat</legend>
          <label class="check"><input type="radio" name="waPlanMode" value="token"${p.tech.mode !== 'contains' ? ' checked' : ''}><span>jako samostatné označení (G2/B, G + K; ne GR)</span></label>
          <label class="check"><input type="radio" name="waPlanMode" value="contains"${p.tech.mode === 'contains' ? ' checked' : ''}><span>kdekoli v textu</span></label></fieldset>
        <label class="field"><span>Skupina brusičů</span><select id="waPlanGroup"><option value="">— žádná —</option>${wa.groups.map(g => `<option value="${esc(g.id)}"${g.id === p.cap.group ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
        <label class="field wa-plan-per"><span>Kusů na brusiče za směnu</span><input id="waPlanPer" inputmode="decimal" value="${esc(String(p.cap.perShift).replace('.', ','))}" autocomplete="off"></label>
      </div>
      <p class="small muted">Filtr technologie platí pro další přidané soubory; soubory ve frontě ani uložený plán se nepřepočítají (smaž je a přidej soubory znovu). Kapacita = brusiči na ranní a odpolední směně podle obsazenosti × kusy za směnu; pro týdny bez obsazenosti odhad z průměru posledních 20 pracovních dnů.</p></div>`;
  const tplCard = p.tpl ? `<div class="card wa-plan-tpl"><div class="card-head"><div><h3>Vzor plánu</h3><p class="small muted">Ze souboru ${esc(p.tpl.file || '—')}${p.tpl.by ? `, nastavil ${esc(p.tpl.by)}` : ''} ${esc(tsText(p.tpl.at))}.</p></div>${tplBtn}</div>
      <ul class="wa-tpl-list">${p.tpl.sheets.map(sh => `<li><b>List ${esc(sh.name)}</b><span>nadpisy na ${sh.header + 1}. řádku</span><span>${WA_PLAN_FIELDS.filter(f => sh.cols[f]).map(f => `${esc(WA_PLAN_LABEL[f])} <b class="num">${esc(sh.cols[f])}</b>`).join(' · ')}</span></li>`).join('')}</ul></div>` : '';
  const files = p.files.slice().reverse();
  const filesCard = `<div class="card"><h3>Zpracované soubory plánu</h3>${files.length ? `<div class="table-card flat"><table class="stack wa-files"><thead><tr><th>Soubor</th><th class="r">Řádků</th><th class="r">${esc(p.tech.words.join('/') || 'Bráno')}</th><th class="r">Duplicity</th><th>Zpracoval</th></tr></thead><tbody>${files.map(x => `<tr>
      <td class="wrap name" data-label="Soubor"><b>${esc(x.name || '—')}</b></td><td class="r num" data-label="Řádků">${nf(x.rows)}</td><td class="r num" data-label="Bráno">${nf(x.matched)}</td>
      <td class="r num" data-label="Duplicity">${nf(x.dupes)}</td>
      <td data-label="Zpracoval">${esc(x.by || '—')}<small class="muted"> ${esc(tsText(x.at))}</small></td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted">Zatím nic.</p>'}
    ${p.items || p.chunks.length ? `<hr class="sep"><div class="row gap"><button class="btn ghost small wa-danger" type="button" data-waplanclear>Smazat výrobní plán…</button><span class="tiny muted">Položky a seznam souborů; vzor a nastavení zůstanou.</span></div>` : ''}</div>`;
  if (!p.tpl) {
    return `<div class="wa-start">
      <div class="card wa-src"><div class="wa-src-head"><span class="wa-step">1</span><div><h3>Vzor plánu</h3><p class="small muted">Nahraj jeden soubor výrobního plánu jako vzor. U obou listů vybereš sloupce podle názvů na 2. řádku: číslo objednávky, EAN, index, počet kusů, termín dokončení a technologie. Další soubory se čtou podle stejných názvů.</p></div></div>${tplBtn}</div>
      <div class="card wa-src"><div class="wa-src-head"><span class="wa-step">2</span><div><h3>Fronta a zpracování</h3><p class="small muted">Soubory přidáváš do fronty po jednom nebo víc najednou (i se statisíci řádků) a nakonec je zpracuješ. Vezmou se jen položky s technologií ${esc(words)}, duplicity podle objednávky, indexu a EAN se sloučí a platí nejpozdější termín.</p></div></div>${impBtn}</div>
    </div>${settings}`;
  }
  const ids0 = waPlanWeekIds();
  const bar = `<div class="t5-weekbar wa-hist-bar">
      <div class="chips" role="group" aria-label="Období plánu">${WA_PLAN_RANGES.map(([k, l]) => `<button type="button" class="chip${k === (ui.wa.planRange || 'f13') ? ' on' : ''}" data-waplanrange="${k}" aria-pressed="${k === (ui.wa.planRange || 'f13')}">${l}</button>`).join('')}</div>
      ${p.items ? waDatesHtml('waPlan', ui.wa.planRange === 'custom' ? { from: ui.wa.pFrom, to: ui.wa.pTo } : { from: weekById(ids0[0]).from, to: weekById(ids0[ids0.length - 1]).to }) : ''}
      <span class="spacer"></span>${impBtn}</div>`;
  if (!p.items) return `${bar}${queue}${q ? '' : `<div class="card">${emptyState('Plán je prázdný', `Přidej soubory výrobního plánu do fronty a zpracuj je. Vezmou se položky s technologií ${esc(words)}.`)}</div>`}${tplCard}${settings}${filesCard}`;
  const ids = ids0;
  const cap = waPlanCapacity(wa, ids);
  const now = isoWeek(todayIso()).id;
  const done = cap.map(w => {
    if (!G) return null;
    const x = weekById(w.id);
    const t = waTotals(wa, waDays(wa, x.from, x.to));
    return waFx(t, G.id).pcs;
  });
  const sumPlan = cap.reduce((a, w) => a + w.plan, 0);
  const sumItems = cap.reduce((a, w) => a + w.n, 0);
  const withCap = cap.filter(w => w.cap != null);
  const sumCap = withCap.reduce((a, w) => a + w.cap, 0);
  const wd = cap.reduce((a, w) => a + w.workDays, 0);
  const grW = withCap.filter(w => w.grinders != null);
  const grAvg = grW.length ? grW.reduce((a, w) => a + w.grinders * w.workDays, 0) / Math.max(1, grW.reduce((a, w) => a + w.workDays, 0)) : null;
  const needAvg = wd ? sumPlan / p.cap.perShift / wd : null;
  const short = cap.filter(w => w.cap != null && w.plan > w.cap);
  const worst = short.reduce((b, w) => (!b || w.plan - w.cap > b.plan - b.cap ? w : b), null);
  const last = cap.length ? cap[cap.length - 1] : null;
  const capNote = !G ? 'vyber skupinu brusičů níž' : grAvg == null ? `chybí obsazenost skupiny ${esc(G.name)}` : `Ø ${nf(grAvg, 1)} brusičů na den × ${nf(p.cap.perShift, 1)} ks`;
  const tiles = `<div class="stats wa-stats">${[
    statTile('Kusy k dodání', `${waN(sumPlan)}<em>ks</em>`, `${nf(sumItems)} ${polozkaN(sumItems)} · ${words}`, 'tab'),
    statTile('Kapacita brusičů', withCap.length ? `${waN(sumCap)}<em>ks</em>` : '—', capNote),
    statTile('Týdny nad kapacitou', withCap.length ? `${short.length}<em>z ${cap.filter(w => w.plan).length}</em>` : '—', worst ? `nejvíc chybí ${waN(worst.plan - worst.cap)} ks v ${weekName(worst.id)}` : withCap.length ? 'kapacita stačí na každý týden' : '', short.length ? 'crit' : withCap.length ? 'good' : ''),
    statTile('Brusiči na den', `${waN(needAvg, 1)}<em>potřeba</em>`, `${grAvg != null ? `stav Ø ${nf(grAvg, 1)}` : 'stav neznámý'}${last && last.cum ? ` · skluz na konci ${waN(last.cum)} ks` : ''}`, needAvg != null && grAvg != null && needAvg > grAvg ? 'crit' : ''),
  ].join('')}</div>`;
  const pts = cap.map((w, i) => ({ label: `T${weekById(w.id).w}`, w, plan: w.plan, cap: w.cap, done: done[i] }));
  const tipName = w => `${w.label} (${w.range})`;
  const charts = `<div class="wa-charts" id="waPlanCharts">
      ${waPlanChart({ title: 'Kusy k dodání a kapacita brusičů', sub: `po týdnech termínu dokončení · ${words}`, points: pts,
        tip: x => `${tipName(x.w)}: ${waN(x.plan)} ks k dodání (${nf(x.w.n)} ${polozkaN(x.w.n)}) · kapacita ${x.cap == null ? '—' : `${waN(x.cap)} ks${x.w.actual ? '' : ' (odhad)'}`}${x.cap != null ? ` · ${x.plan > x.cap ? `chybí ${waN(x.plan - x.cap)} ks` : `rezerva ${waN(x.cap - x.plan)} ks`}` : ''}` })}
      ${waChart({ title: 'Brusiči na pracovní den', sub: `potřeba podle plánu (${nf(p.cap.perShift, 1)} ks za směnu) a stav, ranní + odpolední`, points: pts, value: x => x.w.need, ref: x => x.w.grinders, tone: 'c-acc', cap: v => nf(v, 1), legend: ['potřeba', 'stav'],
        tip: x => `${tipName(x.w)}: potřeba ${waN(x.w.need, 1)} brusičů na den · stav ${x.w.grinders == null ? '—' : `${waN(x.w.grinders, 1)}${x.w.actual ? '' : ' (odhad)'}`} · ${x.w.workDays} ${pracDnyN(x.w.workDays)}` })}
      <div class="chart-tip" id="waTip3" hidden></div>
    </div>`;
  const rows = cap.map((w, i) => `<tr class="${w.id === now ? 'wa-now' : ''}">
      <td class="name" data-label="Týden"><b>${esc(weekName(w.id))}</b><small> ${esc(w.range)}</small></td>
      <td class="r num" data-label="Kusy k dodání"><b>${waN(w.plan)}</b></td>
      <td class="r num" data-label="Položek">${nf(w.n)}</td>
      <td class="r num" data-label="Pracovní dny">${w.workDays}</td>
      <td class="r num" data-label="Brusičů Ø na den">${waN(w.grinders, 1)}</td>
      <td class="r num" data-label="Kapacita">${waN(w.cap)}${w.cap != null && !w.actual ? '<small class="muted"> odhad</small>' : ''}</td>
      <td class="r num${w.diff != null && w.diff < 0 ? ' wa-neg' : ''}" data-label="Rezerva / chybí">${w.diff == null ? '—' : waSigned(w.diff)}</td>
      <td class="r num${w.cum ? ' wa-neg' : ''}" data-label="Skluz">${w.cum == null ? '—' : waN(w.cum)}</td>
      <td class="r num${w.need != null && w.grinders != null && w.need > w.grinders ? ' wa-neg' : ''}" data-label="Potřeba brusičů na den">${waN(w.need, 1)}</td>
      <td class="r num" data-label="Zpracováno">${waN(done[i])}</td></tr>`).join('');
  const table = `<div class="table-card"><table class="stack wa-hist wa-plantab"><thead><tr><th>Týden termínu</th><th class="r">K dodání ks</th><th class="r">Položek</th><th class="r">Prac. dny</th><th class="r">Brusičů Ø</th><th class="r">Kapacita ks</th><th class="r">Rezerva / chybí</th><th class="r">Skluz</th><th class="r">Potřeba brusičů</th><th class="r">Zpracováno${G ? ` · ${esc(G.name)}` : ''}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  return `${bar}${queue}<p class="wa-range-line small muted">${esc(weekName(ids[0]))} – ${esc(weekName(ids[ids.length - 1]))}${ui.wa.planRange === 'custom' ? ` (${esc(dayText(weekById(ids[0]).from))} – ${esc(dayText(weekById(ids[ids.length - 1]).to))}, celé týdny)` : ''} · v plánu celkem ${nf(p.items)} ${polozkaN(p.items)}, nahráno ${esc(tsText(p.at))}</p>${tiles}${charts}${table}
    <p class="hint">Kusy k dodání = součet položek s termínem dokončení v týdnu (${esc(words)}). Rezerva / chybí = kapacita minus kusy k dodání. Skluz = kusy, které se nestihnou a přejdou do dalšího týdne (nevyužitá kapacita se nepřenáší). Potřeba brusičů = kusy k dodání ÷ ${nf(p.cap.perShift, 1)} ks za směnu ÷ pracovní dny. Zpracováno = kusy z výkazu práce u operací skupiny ${esc(G ? G.name : '—')}.</p>
    ${tplCard}${settings}${filesCard}`;
}

/* ---------- Excel ---------- */
async function exportWaXlsx() {
  if (!waSpan(S.workAudit)) return;
  try {
    const r = waOverviewRange();
    if (!r || r.empty) { toast('Ve zvoleném období nejsou data.', true); return; }
    const X = await xlsx();
    const gid = S.workAudit.groups.some(g => g.id === ui.wa.group) ? ui.wa.group : '';
    const wb = X.utils.book_new();
    waSheets(S.workAudit, r, gid).forEach(sheet => {
      const ws = X.utils.aoa_to_sheet(sheet.rows.map(row => row.map(safeCell)));
      ws['!cols'] = sheet.cols.map(wch => ({ wch }));
      X.utils.book_append_sheet(wb, ws, sheet.name);
    });
    downloadFile(`report-${r.from}-${r.to}${gid ? `-${gid}` : ''}.xlsx`, new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch (error) { toast(`Export se nepovedl: ${error.message}`, true); }
}

/* ---------- PDF pro auditora (A4 na šířku, „HALA 2 · REPORT“): jen fakta a grafy ---------- */
async function exportWaPdf(button) {
  const r = waOverviewRange();
  if (!r || r.empty) { toast('Ve zvoleném období nejsou data.', true); return; }
  const g = S.workAudit.groups.find(x => x.id === ui.wa.group) || null;   // vybraná skupina = report jen za ni
  await withPdf(button, doc => {
    doc.setProperties({ title: `Lidé v práci a zpracované kusy${g ? ` – ${g.name}` : ''} · ${dayText(r.from)} – ${dayText(r.to)}`, creator: EXPORT_NAME });
    drawWorkAudit(doc, r, g ? g.id : '');
    downloadFile(`report-${r.from}-${r.to}${g ? `-${g.id}` : ''}.pdf`, doc.output('blob'), 'application/pdf');
  }, 'landscape');
}

/* Graf do PDF: sloupce (volitelně s čárkou plánu), nebo čára s body. Osa od nuly, hodnota
   popsaná jen u posledního období. */
function pdfWaChart(k, x, y, w, h, { title, sub, items, color, line = false, cap = v => nf(v, 0) }) {
  const C = k.C;
  const doc = k.doc;
  k.text(title, x, y, 9.2, { bold: true });
  k.text(sub, x, y + 4.6, 6.8, { color: C.ink2 });
  const L = 9;
  const top0 = y + 13;
  const base = y + h - 5;
  const vals = items.map(i => i.v);
  const refs = items.map(i => (i.ref == null ? null : i.ref));
  const present = [...vals, ...refs].filter(v => v != null);
  if (!present.length) { k.text('bez údajů', x + w / 2, (top0 + base) / 2, 7, { align: 'center', color: C.ink3 }); return; }
  const top = niceMax(Math.max(...present) * (line ? 1.15 : 1.1));
  const yy = v => base - (Math.min(v, top) / top) * (base - top0);
  [0, top / 2, top].forEach(v => {
    k.hline(yy(v), C.line, 0.15, x + L, x + w);
    k.text(nf(v, top < 10 ? 1 : 0), x + L - 1.4, yy(v) - 1.1, 5.8, { align: 'right', color: C.ink3 });
  });
  const n = items.length;
  const band = (w - L) / n;
  const cx = i => x + L + band * i + band / 2;
  const every = Math.ceil(n / 10);
  let last = -1;
  vals.forEach((v, i) => { if (v != null) last = i; });
  let capY = last >= 0 ? yy(vals[last]) : 0;
  if (line) {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.5);
    for (let i = 1; i < n; i += 1) if (vals[i] != null && vals[i - 1] != null) doc.line(cx(i - 1), yy(vals[i - 1]), cx(i), yy(vals[i]));
    vals.forEach((v, i) => { if (v != null) k.dot(cx(i), yy(v), n > 30 ? 0.6 : 0.95, color, C.white); });
  } else {
    const bw = Math.min(7, band * 0.62);
    vals.forEach((v, i) => {
      if (v == null || v <= 0) return;
      const hh = base - yy(v);
      const rr = Math.min(0.9, bw / 2, hh);
      k.box(color, cx(i) - bw / 2, yy(v), bw, hh, rr);
      if (hh > rr) k.box(color, cx(i) - bw / 2, yy(v) + rr, bw, hh - rr);
    });
    doc.setDrawColor(...C.ink);
    doc.setLineWidth(0.45);
    refs.forEach((v, i) => { if (v != null && v > 0) doc.line(cx(i) - bw / 2 - 0.5, yy(v), cx(i) + bw / 2 + 0.5, yy(v)); });
    if (last >= 0 && refs[last] != null) capY = Math.min(capY, yy(refs[last]));
  }
  items.forEach((it, i) => { if ((n - 1 - i) % every === 0) k.text(it.label, cx(i), base + 1.3, 5.8, { align: 'center', color: C.ink3 }); });
  if (last >= 0) k.text(cap(vals[last]), cx(last), capY - 4.2, 6.8, { bold: true, align: 'center' });
}

/* Kumulovaná bilance lidí do PDF: čára s nulovou osou, body pod nulou červeně. */
function pdfWaBalance(k, x, y, w, h, { title, sub, items, color }) {
  const C = k.C;
  const doc = k.doc;
  k.text(title, x, y, 9.2, { bold: true });
  k.text(sub, x, y + 4.6, 6.8, { color: C.ink2 });
  const L = 11;
  const top0 = y + 13;
  const base = y + h - 5;
  const vals = items.map(i => i.v);
  const present = vals.filter(v => v != null);
  if (!present.length) { k.text('bez údajů', x + w / 2, (top0 + base) / 2, 7, { align: 'center', color: C.ink3 }); return; }
  const hi = Math.max(0, ...present), lo = Math.min(0, ...present);
  const step = niceMax(Math.max(hi, -lo, 1) / 2);
  let top = Math.max(step, Math.ceil(hi / step) * step), bot = Math.min(-step, Math.floor(lo / step) * step);
  if (top - hi < step * 0.2) top += step;   // místo na popisek u krajní hodnoty
  if (lo - bot < step * 0.2) bot -= step;
  const yy = v => top0 + (top - v) / (top - bot) * (base - top0);
  for (let v = bot; v <= top + 1e-9; v += step) {
    k.hline(yy(v), v === 0 ? C.ink3 : C.line, v === 0 ? 0.3 : 0.15, x + L, x + w);
    k.text(waSigned(v), x + L - 1.4, yy(v) - 1.1, 5.8, { align: 'right', color: C.ink3 });
  }
  const n = items.length;
  const band = (w - L) / n;
  const cx = i => x + L + band * i + band / 2;
  const every = Math.ceil(n / 12);
  doc.setDrawColor(...color);
  doc.setLineWidth(0.5);
  for (let i = 1; i < n; i += 1) if (vals[i] != null && vals[i - 1] != null) doc.line(cx(i - 1), yy(vals[i - 1]), cx(i), yy(vals[i]));
  vals.forEach((v, i) => { if (v != null) k.dot(cx(i), yy(v), n > 30 ? 0.6 : 0.95, v < 0 ? C.crit : color, C.white); });
  items.forEach((it, i) => { if ((n - 1 - i) % every === 0) k.text(it.label, cx(i), base + 1.3, 5.8, { align: 'center', color: C.ink3 }); });
  let last = -1;
  vals.forEach((v, i) => { if (v != null) last = i; });
  // poslední hodnota vlevo od bodu, pod čarou při poklesu a nad ní při růstu (jako v aplikaci)
  if (last >= 0) k.text(waSigned(vals[last], 1), cx(last) - 2.2, yy(vals[last]) + (last && vals[last] < vals[last - 1] ? 1 : -4.2), 6.8, { bold: true, align: 'right', color: vals[last] < 0 ? C.crit : C.ink });
}

function drawWorkAudit(doc, r, gid = '') {
  const k = pdfKit(doc);
  const C = k.C;
  const wa = S.workAudit;
  const G = wa.groups.find(g => g.id === gid) || null;
  gid = G ? G.id : '';
  const days = waDays(wa, r.from, r.to);
  const t = waTotals(wa, days);
  const f = waFx(t, gid);
  const weeks = waWeeks(wa, days);
  const label = `${dayText(r.from)} – ${dayText(r.to)}`;
  const COL = { people: [0, 136, 118], pcs: [176, 111, 18], per: [106, 87, 166] };   // --ch-acc, --ch-tab, --ch-prod
  k.header({ eyebrow: `${EXPORT_NAME} · REPORT`, right: `Stav k ${dayText(todayIso())}`, title: G ? `Lidé v práci a zpracované kusy – ${G.name}` : 'Lidé v práci a zpracované kusy', sub: label,
    meta: 'Obsazenost směn podle záznamů vedoucích, zpracované kusy podle výkazu práce v IS.' });
  const metTone = f.metShare == null ? '' : f.metShare >= 0.9 ? 'good' : f.metShare < 0.6 ? 'crit' : '';
  k.tiles([
    ['Lidé v práci, Ø na pracovní den', waN(f.avg, 1), G ? G.name : f.req != null ? `požadavek Ø ${waN(f.req, 1)}${wa.target ? ' (pevný)' : ''}` : 'požadavek v souboru chybí'],
    G ? ['Podíl na lidech v práci', waP(f.share), `z Ø ${waN(t.avgPeople, 1)} lidí na pracovní den`]
      : ['Obsazenost proti plánu', waP(f.metShare), f.reqDays ? `${f.metDays} z ${f.reqDays} dní splněno (≥ 100 % požadavku)` : 'požadavek v souboru chybí', metTone],
    ['Zpracované kusy', `${waN(f.pcs)} ks`, G && G.noIs ? 'projekt není evidován v IS' : `${f.workDays} ${pracDnyN(f.workDays)}`],
    ['Kusy na osobosměnu', waN(f.per, 1), G ? (G.noIs ? 'mimo IS' : G.unprod ? 'neproduktivní pozice' : G.name) : 'produktivní skupiny'],
  ]);
  const head = (cols, x0, w, size = 6.4) => {
    const lines = cols.map(c => k.split(c[1], c[0] - 2, size, true));
    const hh = Math.max(...lines.map(l => l.length)) * k.LH(size, 1.18) + 2.6;
    k.box(C.soft, x0, k.y, w, hh, 1.2);
    let x = x0;
    cols.forEach((c, i) => {
      lines[i].forEach((ln, j) => k.text(ln, c[2] === 'r' ? x + c[0] - 1.4 : x + 1.4, k.y + 1.3 + j * k.LH(size, 1.18), size, { bold: true, color: C.ink2, align: c[2] === 'r' ? 'right' : 'left' }));
      x += c[0];
    });
    return hh;
  };
  const row = (cols, cells, x0, size, bold, colors = []) => {
    let x = x0;
    cells.forEach((v, j) => {
      const c = cols[j];
      k.text(v, c[2] === 'r' ? x + c[0] - 1.4 : x + 1.4, k.y + 0.5, size, { bold: bold || j === 0, align: c[2] === 'r' ? 'right' : 'left', color: colors[j] || C.ink });
      x += c[0];
    });
  };
  // Výpadek lidí a dorovnání (2.18): fakta vlevo, kumulovaná bilance po týdnech vpravo.
  if (!G) {
    const st = waStaffing(wa, days);
    k.need(80);
    k.heading('Výpadek lidí a dorovnání', 11);
    const y0 = k.y;
    const lw = 96;
    const lx = k.M;
    if (!st.n) k.para('V období chybí požadavek lidí (mělo dorazit a požadavek v souboru obsazenosti).', lx, lw, 8, { color: C.ink2 });
    else {
      const big = waSigned(st.balance, 1);
      k.text(big, lx, k.y, 17, { bold: true, color: st.open ? C.crit : C.good });
      k.text(`${clovekodenN(Math.round(st.balance))} proti požadavku`, lx + k.width(big, 17, true) + 2.5, k.y + 2.6, 8, { color: C.ink2 });
      k.y += 9.5;
      const lines = [[`Dny se splněným požadavkem: ${st.met} z ${st.n} (${waP(st.share)}).`, false, C.ink]];
      if (st.open) {
        lines.push([`Výpadek trvá od ${dayText(st.open.from)} (${st.open.days} ${pracDnyN(st.open.days)}), průměrně chybělo ${nf(st.open.avgShort, 1)} lidí denně.`, false, C.ink]);
        lines.push([`Na dorovnání: +${st.open.extra} ${lidiN(st.open.extra)} denně po ${st.open.needDays} ${pracDnyN(st.open.needDays)}.`, true, C.acc]);
      } else lines.push(['Bilance je vyrovnaná, žádný výpadek k dorovnání.', false, C.ink]);
      lines.forEach(([s, b, c]) => k.para(s, lx, lw, 8, { bold: b, color: c }));
      const eps = st.episodes.slice(-5).reverse();
      if (eps.length) {
        k.y += 2;
        k.text('Výpadky', lx, k.y, 7.4, { bold: true, color: C.ink2 });
        k.y += 4.4;
        eps.forEach(e => {
          k.text(`${dayText(e.from)} – ${e.to ? dayText(e.to) : 'dosud'}`, lx, k.y, 7.2, { bold: true });
          k.text(`nejvíc ${waSigned(e.worst, 1)} · ${e.to ? `dorovnáno za ${e.days} ${pracDnyN(e.days)}` : `trvá ${e.days} ${pracDnyN(e.days)}`}`, lx + lw, k.y, 7.2, { align: 'right', color: e.to ? C.ink2 : C.crit });
          k.y += k.LH(7.2, 1.3) + 1;
          k.hline(k.y - 0.6, C.line, 0.15, lx, lx + lw);
        });
      }
    }
    let cum = 0;
    const items = weeks.map(x => { if (x.t.reqDays) cum = Math.round((cum + (x.t.balance || 0)) * 100) / 100; return { label: waAxisLabel(x), v: x.t.reqDays ? cum : null }; });
    const cw = k.CW - lw - 12;
    pdfWaBalance(k, k.M + lw + 12, y0, cw, 56, { title: 'Kumulovaná bilance lidí', sub: `člověkodny proti požadavku${wa.target ? ` (pevně ${wa.target} lidí)` : ''}, na konci týdne · pod nulou chybí lidé`, items, color: COL.people });
    k.y = Math.max(k.y, y0 + 56) + 8;
  }
  // Rozpad po skupinách (jen v reportu za všechny skupiny): čísla a pruhy.
  if (!G) {
    // tabulka skupin se nedělí, když se vejde na jednu stránku
    const gh = k.LH(11) * 1.25 + 2.4 + 8 + wa.groups.length * (k.LH(7.4, 1.25) + 2.2);
    if (k.y + gh > k.BOTTOM && gh <= k.PAGE) k.newPage();
    k.heading('Po skupinách', 11);
    const gx = wa.groups.map(g => ({ g, v: waFx(t, g.id) }));
    const maxAvg = Math.max(1e-9, ...gx.map(x => x.v.avg || 0));
    const maxPcs = Math.max(1e-9, ...gx.map(x => x.v.pcs || 0));
    const cols = [[76, 'Skupina'], [28, 'Zařazení'], [62, 'Ø lidí v práci na pracovní den'], [24, 'Podíl', 'r'], [50, 'Zpracované kusy'], [25, 'Ks / os.', 'r']];
    const rh = k.LH(7.4, 1.25) + 2.2;
    k.y += head(cols, k.M, k.CW) + 0.6;
    gx.forEach(({ g, v }) => {
      if (k.need(rh)) k.y += head(cols, k.M, k.CW) + 0.6;
      let x = k.M;
      k.text(g.name, x + 1.4, k.y + 0.6, 7.4, { bold: true }); x += cols[0][0];
      k.text(waGroupKind(g), x + 1.4, k.y + 0.6, 7, { color: g.unprod || g.noIs ? C.ink3 : C.ink2 }); x += cols[1][0];
      const bar = (val, max, color, w) => {
        const bw = w - 18;
        k.box(C.soft3, x + 1.4, k.y + 1.4, bw, 2.4, 1.2);
        if (val) k.box(color, x + 1.4, k.y + 1.4, Math.max(1.2, bw * val / max), 2.4, 1.2);
      };
      bar(v.avg || 0, maxAvg, COL.people, cols[2][0]);
      k.text(waN(v.avg, 1), x + cols[2][0] - 1.4, k.y + 0.6, 7.4, { bold: true, align: 'right' }); x += cols[2][0];
      k.text(waP(v.share), x + cols[3][0] - 1.4, k.y + 0.6, 7.4, { align: 'right' }); x += cols[3][0];
      if (g.noIs && v.pcs == null) k.text('mimo IS', x + 1.4, k.y + 0.6, 7, { color: C.ink3 });
      else { bar(v.pcs || 0, maxPcs, COL.pcs, cols[4][0]); k.text(waN(v.pcs), x + cols[4][0] - 1.4, k.y + 0.6, 7.4, { bold: true, align: 'right' }); }
      x += cols[4][0];
      k.text(waN(v.per, 1), x + cols[5][0] - 1.4, k.y + 0.6, 7.4, { align: 'right' });
      k.y += rh;
      k.hline(k.y - 0.4, C.line, 0.15);
    });
    k.y += 7;
  }
  // Týdny: tři grafy a tabulka ve dvou sloupcích.
  k.need(100);
  k.heading('Po týdnech', 11);
  {
    const items = weeks.map(x => ({ label: waAxisLabel(x), v: waFx(x.t, gid) }));
    const gap = 9;
    const w = (k.CW - 2 * gap) / 3;
    const h = 52;
    const y0 = k.y;
    pdfWaChart(k, k.M, y0, w, h, { title: 'Lidé v práci', sub: `Ø na pracovní den${G ? '' : ' · čárka = požadavek'}`, color: COL.people, cap: v => nf(v, 1),
      items: items.map(i => ({ label: i.label, v: i.v.avg, ref: G ? null : i.v.req })) });
    pdfWaChart(k, k.M + w + gap, y0, w, h, { title: 'Zpracované kusy', sub: 'součet za týden', color: COL.pcs,
      items: items.map(i => ({ label: i.label, v: i.v.pcs })) });
    pdfWaChart(k, k.M + 2 * (w + gap), y0, w, h, { title: 'Kusy na osobosměnu', sub: G ? 'za týden' : 'produktivní skupiny, za týden', color: COL.per, line: true, cap: v => nf(v, 1),
      items: items.map(i => ({ label: i.label, v: i.v.per })) });
    k.y = y0 + h + 7;
  }
  const wc = G
    ? [[16, 'Týden'], [26, 'Datum'], [11, 'Dny', 'r'], [16, 'Ø lidí', 'r'], [16, 'Podíl', 'r'], [21, 'Kusy', 'r'], [16, 'Ks / os.', 'r']]
    : [[13, 'Týden'], [23, 'Datum'], [8, 'Dny', 'r'], [13, 'Ø lidí', 'r'], [13, 'Ø pož.', 'r'], [14, 'Splněno', 'r'], [15, 'Bilance', 'r'], [16, 'Kusy', 'r'], [13, 'Ks / os.', 'r']];
  const cw = wc.reduce((a, c) => a + c[0], 0);
  const gap = k.CW - 2 * cw;
  const rh = k.LH(6.9, 1.25) + 1.6;
  const wrows = weeks.map(w => {
    const v = waFx(w.t, gid);
    const cells = [w.label.replace(/\/\d+$/, ''), waShortRange(w, r), String(v.workDays), waN(v.avg, 1),
      ...(G ? [waP(v.share)] : [waN(v.req, 1), v.reqDays ? `${v.metDays} / ${v.reqDays}` : '—', waSigned(v.balance, 1)]), waN(v.pcs), waN(v.per, 1)];
    const colors = G ? [] : Object.assign([], { 6: (v.balance || 0) < 0 ? C.crit : null });
    return [cells, colors];
  });
  let i = 0;
  while (i < wrows.length) {
    k.need(rh * 4 + 8);
    const fit = Math.max(1, Math.floor((k.BOTTOM - k.y - 8) / rh));
    const cnt = Math.min(wrows.length - i, fit * 2);
    const per = Math.ceil(cnt / 2);
    const y0 = k.y;
    let end = y0;
    [0, 1].forEach(c => {
      const part = wrows.slice(i + c * per, i + Math.min(cnt, (c + 1) * per));
      if (!part.length) return;
      const x0 = k.M + c * (cw + gap);
      k.y = y0;
      k.y += head(wc, x0, cw) + 0.6;
      part.forEach(([cells, colors]) => { row(wc, cells, x0, 6.9, false, colors); k.y += rh; k.hline(k.y - 0.4, C.line, 0.15, x0, x0 + cw); });
      end = Math.max(end, k.y);
    });
    k.y = end;
    i += cnt;
    if (i < wrows.length) k.newPage();
  }
  k.y += 4;
  const foot = `Ø na pracovní den = průměr pracovních dnů s obsazeností; víkendy a státní svátky se do průměru nepočítají, do součtů ano.${G ? '' : ` Požadavek = ${wa.target ? `pevně ${wa.target} lidí na pracovní den` : 'mělo dorazit + požadavek ze souboru obsazenosti'}; den se splněným požadavkem má v práci aspoň 100 % požadavku. Bilance = lidé v práci minus požadavek v člověkodnech (člověk × pracovní den); výpadek se dorovná, až kumulovaná bilance vystoupá zpět na nulu.`} Kusy jen z operací přiřazených ke skupinám; kusy na osobosměnu jen u produktivních skupin.${G ? '' : ' Podíl = podíl skupiny na lidech v práci.'}`;
  // vysvětlivky zůstanou pohromadě; na novou stránku jen když se opravdu nevejdou
  if (k.y + k.split(foot, k.CW, 7).length * k.LH(7, 1.38) > k.BOTTOM) k.newPage();
  k.para(foot, k.M, k.CW, 7, { color: C.ink3 });
  k.footer(`${EXPORT_NAME} · report · ${label}${G ? ` · ${G.name}` : ''}`);
}

window.OdmApp = {
  async start(loaded) {
    const [me, prefs] = await Promise.all([Vault.me().catch(() => null), Vault.loadPrefs().catch(() => null)]);
    ui.me = {
      cardId: me?.card_id || Vault.session.cardId || '', label: me?.card_label || Vault.session.label || '',
      created: Date.parse(me?.card_created || '') || 0,
      device: me?.device_label || '', version: me?.version || '',
      ai: me?.ai === true,   // přeformulování textu (✦) je na serveru zapnuté
    };
    store.rev = loaded.rev || 0;
    store.savedAt = loaded.savedAt || null;
    if (loaded.state) {
      S = sanitizeState(loaded.state);
      store.base = sharedState(S);
    } else {
      // Čistá instalace: ukázkový měsíc, ať je hned vidět, jak aplikace funguje.
      S = demoData();
      const issue = S._demoIssue || [];
      delete S._demoIssue;
      const t = Date.now() - 2 * 864e5;
      issue.forEach(([key, extra]) => {
        const e = S.employees[key];
        if (!e) return;
        const r = evaluate(e, curPeriod());
        const box = S.issued[adjKey()] || (S.issued[adjKey()] = {});
        box[key] = { at: t, tabaky: r.total + extra, kafe: r.kafe, pos: e.positionId, lvl: e.level };
      });
      S = sanitizeState(S);
      save();
    }
    if (prefs) {
      P = cleanPrefs(prefs);
    } else {
      // První otevření této verze s touto kartičkou: převezme se dosavadní společné nastavení pohledu.
      // Jako nové se ukážou změny od vydání kartičky (starší historie nové kartičky nezahltí).
      const seen = ui.me.created ? Math.min(ui.me.created, Date.now()) : Date.now();
      P = cleanPrefs({ period: S.current, hiddenCols: S.settings.hiddenCols, lockMinutes: S.settings.lockMinutes, logSeen: seen });
      setPref({});
    }
    applyPeriodPref();
    bindEvents();
    // Telefon (2.15): po přihlášení hlavní menu s obsazeností dne a úvodní animací HALA 2.
    const phone = isPhone();
    if (phone) ui.view = 'domu';
    renderAll();
    showView(phone ? 'domu' : 'prehled');
    if (phone) playSplash();
  },
};
