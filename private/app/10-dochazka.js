/* ==========================================================================
   DOCHÁZKA
   ========================================================================== */
/* Export docházky za měsíc (2.45.2): Excel a PDF, lidé po odděleních se součty hodin. */
/* Excel s barvami buněk (2.50). SheetJS v aplikaci styly nezapisuje, proto vlastní malý zápis
   xlsx: jeden nebo víc listů, buňka = hodnota nebo {v, s} (klíč stylu z XS_STYLES), šířky
   sloupců, ukotvené řádky a sloupce. ZIP bez komprese (metoda stored) s CRC32. */
const XS_STYLES = {
  h: { b: 1, fill: 'FFE8EAEE' }, hwk: { b: 1, fill: 'FFD6D9E0' }, g: { b: 1, fill: 'FFF3F4F6' }, t: { b: 1 }, title: { b: 1, sz: 14 },
  am: { fill: 'FFCFE2F8' }, pm: { fill: 'FFD3F0E0' }, ot: { fill: 'FFE4DAF7' }, work: { fill: 'FFE6ECEA' },
  abs: { fill: 'FFFBEBC8' }, miss: { fill: 'FFF9D9D9' }, off: { fill: 'FFF4F4F4' },
};
const XS_KEYS = Object.keys(XS_STYLES);
function xsCrcTable() { const t = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; }
let XS_CRC = null;
function xsCrc(b) { XS_CRC = XS_CRC || xsCrcTable(); let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i += 1) c = XS_CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function xsZip(files) {
  const enc = new TextEncoder(), parts = [], dir = [];
  let off = 0;
  const u16 = n => [n & 0xFF, (n >>> 8) & 0xFF], u32 = n => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
  files.forEach(([name, text]) => {
    const nb = enc.encode(name), data = enc.encode(text), crc = xsCrc(data);
    const head = [0x50, 0x4B, 0x03, 0x04, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0)];
    parts.push(new Uint8Array(head), nb, data);
    dir.push([0x50, 0x4B, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)], nb);
    off += head.length + nb.length + data.length;
  });
  let size = 0;
  const cd = [];
  for (let i = 0; i < dir.length; i += 2) { const h = new Uint8Array(dir[i]); cd.push(h, dir[i + 1]); size += h.length + dir[i + 1].length; }
  const end = new Uint8Array([0x50, 0x4B, 0x05, 0x06, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(size), ...u32(off), 0, 0]);
  return new Blob([...parts, ...cd, end], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function xsEsc(v) { return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function xsCol(i) { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function xsSheetXml(sh) {
  const rows = sh.rows.map((row, r) => `<row r="${r + 1}">${(row || []).map((cell, c) => {
    if (cell == null || cell === '') return '';
    const o = cell && typeof cell === 'object' ? cell : { v: cell };
    const si = o.s ? XS_KEYS.indexOf(o.s) + 1 : 0, ref = `${xsCol(c)}${r + 1}`, st = si > 0 ? ` s="${si}"` : '';
    if (o.v == null || o.v === '') return si > 0 ? `<c r="${ref}"${st}/>` : '';
    if (typeof o.v === 'number' && Number.isFinite(o.v)) return `<c r="${ref}"${st}><v>${o.v}</v></c>`;
    return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${xsEsc(o.v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const fr = sh.freeze, pane = fr ? `<sheetViews><sheetView workbookViewId="0"><pane xSplit="${fr.c}" ySplit="${fr.r}" topLeftCell="${xsCol(fr.c)}${fr.r + 1}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>` : '';
  const cols = sh.cols && sh.cols.length ? `<cols>${sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${cols}<sheetData>${rows}</sheetData></worksheet>`;
}
function xlsxStyled(sheets) {
  const fills = [...new Set(XS_KEYS.map(k => XS_STYLES[k].fill).filter(Boolean))];
  const fonts = ['<font><sz val="11"/><name val="Calibri"/></font>', '<font><b/><sz val="11"/><name val="Calibri"/></font>', '<font><b/><sz val="14"/><name val="Calibri"/></font>'];
  const xf = k => { const st = XS_STYLES[k], fi = st.fill ? fills.indexOf(st.fill) + 2 : 0, fo = st.sz ? 2 : st.b ? 1 : 0;
    return `<xf numFmtId="0" fontId="${fo}" fillId="${fi}" borderId="0" xfId="0"${fi ? ' applyFill="1"' : ''}${fo ? ' applyFont="1"' : ''}/>`; };
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length + 2}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fills.map(c => `<fill><patternFill patternType="solid"><fgColor rgb="${c}"/><bgColor indexed="64"/></patternFill></fill>`).join('')}</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${XS_KEYS.length + 1}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>${XS_KEYS.map(xf).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const names = sheets.map(sh => xsEsc(String(sh.name).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)));
  return xsZip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', styles],
    ...sheets.map((sh, i) => [`xl/worksheets/sheet${i + 1}.xml`, xsSheetXml(sh)]),
  ]);
}
/* Docházka do Excelu (2.50): jeden list, lidé po skupinách směn, každý den barevně podle druhu dne. */
function attXlsxSheet(x) {
  const lab = d => `${d.d}. ${DOW[d.dow]}${d.hol && !d.weekend ? ' sv.' : ''}`;
  const rows = [[{ v: `Docházka – ${monthLabel(x.id)} · fond ${nf(x.meta.fund)} h (${x.meta.work} pracovních dnů) · ${x.n} ${lidiN(x.n)}`, s: 'title' }],
    ['Barvy dnů jsou vysvětlené pod tabulkou.'], [],
    [{ v: 'Jméno', s: 'h' }, { v: 'Příjmení', s: 'h' }, { v: 'ID', s: 'h' }, { v: 'Odpracováno (h)', s: 'h' }, ...x.meta.days.map(d => ({ v: lab(d), s: d.weekend || d.hol ? 'hwk' : 'h' }))]];
  x.groups.forEach(g => {
    rows.push([{ v: `${g.name} · ${g.people.length} ${lidiN(g.people.length)}`, s: 'g' }, { v: '', s: 'g' }, { v: '', s: 'g' }, { v: Math.round(g.people.reduce((t, q) => t + q.total, 0) * 100) / 100, s: 'g' }, ...x.meta.days.map(() => ({ v: '', s: 'g' }))]);
    g.people.forEach(q => rows.push([q.first, q.last, q.wid, { v: q.total, s: 't' }, ...q.days.map(c => ({ v: c.v, s: c.kind === 'off' ? 'off' : c.kind }))]));
  });
  rows.push([], [{ v: 'CELKEM', s: 't' }, '', '', { v: x.total, s: 't' }, ...x.dayTot.map(v => ({ v: v || '', s: 't' }))]);
  rows.push([], [{ v: 'Barvy dnů', s: 't' }], ...['am', 'pm', 'ot', 'work', 'abs', 'miss', 'off'].map(k => [{ v: '', s: k }, ATT_KIND[k]]));
  return { name: 'Docházka', rows, cols: [14, 18, 10, 15, ...x.meta.days.map(() => 7.5)], freeze: { r: 4, c: 4 } };
}
async function exportAttXlsx() {
  const x = attShiftSheet(curPeriod());
  if (!x) { toast('Docházka za tento měsíc není nahraná.', true); return; }
  try {
    downloadFile(`dochazka-${x.id}.xlsx`, xlsxStyled([attXlsxSheet(x)]));
  } catch (error) { toast(`Export se nepovedl: ${error.message}`, true); }
}
function attPdf(P, x) {
  const X = 64, W = 1152, R = X + W, BOT = P.PH - 90;
  const C = [['ZAMĚSTNANEC', 0, 'l'], ['ID', 400, 'l'], ['DNY', 640, 'r'], ['HODINY', 780, 'r'], ['VÍKEND DNY', 900, 'r'], ['VÍKEND H', 1020, 'r'], ['CELKEM H', W, 'r']];
  const month = ctrCap(monthLabel(x.id));
  let y = 0;
  const head = cont => {
    P.text(`${EXPORT_NAME} · DOCHÁZKA`, X, 78, 13, { b: true, c: 'faint', ls: 0.12 });
    P.text(cont ? `Docházka — ${month} (pokračování)` : `Docházka — ${month}`, X, 136, cont ? 30 : 44, { b: true });
    y = cont ? 180 : 170;
    if (!cont) {
      P.text(`fond ${nf(x.meta.fund)} h · ${x.meta.work} pracovních dnů · jen odpracované hodiny (bez hodin u kódu nepřítomnosti)`, X, y, 15, { c: 'muted' });
      const tiles = [['LIDÍ', String(x.tot.n)], ['HODINY CELKEM', nf(x.tot.total)], ['V PRACOVNÍ DNY', nf(x.tot.hours)], ['O VÍKENDU', nf(x.tot.wkHours)]];
      const TW = (W - 3 * 16) / 4;
      tiles.forEach(([l, v], i) => { const tx = X + i * (TW + 16); P.box(tx, 200, TW, 110, { fill: '#F7F9FC', stroke: 'line', r: 14 }); P.text(l, tx + 20, 232, 12, { b: true, c: 'muted', ls: 0.1 }); P.text(v, tx + 20, 288, 42, { b: true, mono: true, c: i === 1 ? 'blue' : 'ink' }); });
      // hodiny po odděleních: pruhy
      let by = 362;
      P.text('Hodiny po odděleních', X, by, 20, { b: true });
      by += 20;
      const max = Math.max(1, ...x.depts.map(d => d.tot.total));
      x.depts.forEach(d => {
        P.text(P.split(d.name, 15, 230, { b: true })[0], X, by + 22, 15, { b: true });
        const w = (d.tot.total / max) * (W - 250 - 230);
        P.box(X + 250, by + 8, Math.max(2, w), 20, { fill: 'blue', r: 3 });
        P.text(`${nf(d.tot.total)} h · ${d.tot.n} ${lidiN(d.tot.n)}`, R, by + 23, 15, { mono: true, a: 'end' });
        by += 34;
      });
      y = by + 30;
    }
    C.forEach(([h, dx, a]) => P.text(h, X + dx, y, 12, { b: true, c: 'muted', ls: 0.08, a: a === 'r' ? 'end' : undefined }));
    P.line(X, y + 12, R, y + 12, 'ink', 1.5);
    y += 42;
  };
  const cells = (q, o = {}) => {
    const v = [q.name, q.wid ? `ID ${q.wid}` : '', String(q.days), nf(q.hours), String(q.wkDays), nf(q.wkHours), nf(q.total)];
    C.forEach(([, dx, a], i) => P.text(i === 0 ? P.split(v[0], 15, 390, o)[0] : v[i], X + dx, y, 15, { ...o, mono: i > 0, a: a === 'r' ? 'end' : undefined, c: i === 1 && !q.wid ? 'faint' : o.c }));
  };
  head(false);
  x.depts.forEach(d => {
    if (y + 34 + 32 * Math.min(2, d.people.length) > BOT) { P.doc.addPage('a4', 'portrait'); head(true); }
    P.text(d.name, X, y, 17, { b: true, c: 'blue' });
    y += 30;
    d.people.forEach(q => {
      if (y > BOT) { P.doc.addPage('a4', 'portrait'); head(true); P.text(`${d.name} — pokračování`, X, y, 17, { b: true, c: 'blue' }); y += 30; }
      cells(q);
      P.line(X, y + 11, R, y + 11, 'grid', 1);
      y += 30;
    });
    if (y > BOT) { P.doc.addPage('a4', 'portrait'); head(true); }
    P.box(X, y - 20, W, 30, { fill: '#F2F4F8' });
    cells({ name: `Celkem ${d.name} (${d.tot.n})`, wid: '', ...d.tot }, { b: true });
    y += 46;
  });
  if (y + 40 > BOT) { P.doc.addPage('a4', 'portrait'); head(true); }
  P.line(X, y - 26, R, y - 26, 'ink', 1.5);
  cells({ name: `CELKEM (${x.tot.n} ${lidiN(x.tot.n)})`, wid: '', ...x.tot }, { b: true });
}
async function exportAttPdf(button) {
  const x = attExport(curPeriod());
  if (!x) { toast('Docházka za tento měsíc není nahraná.', true); return; }
  await withPdf(button, doc => {
    doc.setProperties({ title: `Docházka · ${monthLabel(x.id)}`, creator: EXPORT_NAME });
    const P = ctrPdf(doc);
    attPdf(P, x);
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i += 1) {
      doc.setPage(i);
      P.text(`${EXPORT_NAME} · Docházka · ${monthLabel(x.id)}${x.file ? ` · ${x.file}` : ''}`.slice(0, 120), 64, P.PH - 30, 11, { c: 'faint' });
      P.text(`${i} / ${n}`, 1216, P.PH - 30, 11, { c: 'faint', a: 'end' });
    }
    downloadFile(`dochazka-${x.id}.pdf`, doc.output('blob'), 'application/pdf');
  }, 'portrait', { mono: true });
}
/* Docházka pro odměny po nahrání (2.51): uzamčený měsíc se nenahrál, uzamčené dny a ruční
   úpravy zůstaly. */
function dvPeriodsText(list) {
  return list.map(x => x.locked ? `${monthLabel(x.m)} (měsíc je uzamčený, nenahrán)` : `${monthLabel(x.m)}${x.lockedDays || x.edits ? ` (${[x.lockedDays ? `uzamčené dny ${x.lockedDays} beze změny` : '', x.edits ? `ruční úpravy ${x.edits} zůstaly` : ''].filter(Boolean).join(', ')})` : ''}`).join(', ');
}
function renderAttendance() {
  const p = curPeriod();
  const box = $('#attView');
  $('#attPick').innerHTML = p ? perPickHtml('att') : '';
  if (!p) { box.innerHTML = `<div class="card">${emptyState('Zatím nic nahráno', 'Po nahrání tu uvidíš každého člověka po dnech.')}</div>`; return; }
  const meta = periodMeta(p);
  const rows = Object.keys(p.rows).map(k => ({ k, r: p.rows[k], a: attendance(p, k) })).sort((a, b) => norm(a.r.last).localeCompare(norm(b.r.last), 'cs'));
  const totH = rows.reduce((t, x) => t + x.a.totalHours, 0);
  const all = attLocked(p.id), nEd = attEditCount(p.id), L = (S.attLocks || {})[p.id];
  const dmeta = periodMeta(p).days;
  box.innerHTML = `<div class="t5-weekbar att-bar"><span class="small muted">${esc(ctrCap(monthLabel(p.id)))} · odpracováno celkem <b class="num">${nf(totH)} h</b>${nEd ? ` · ručně upraveno <b class="num">${nEd}</b> ${nEd === 1 ? 'den' : nEd <= 4 ? 'dny' : 'dní'}` : ''}</span><span class="spacer"></span><button class="btn ${all ? '' : 'ghost'} att-mlock${all ? ' on' : ''}" type="button" data-attlock="" aria-pressed="${all}">${all ? I.lock : I.unlock}${all ? 'Měsíc uzamčen' : 'Uzamknout měsíc'}</button><button class="btn sec" type="button" data-attxlsx>Excel za měsíc</button><button class="btn" type="button" data-attpdf>PDF za měsíc</button></div>
  ${attRehoursHtml(p)}
  <p class="small muted att-edithelp">${all ? `${I.lock}Celý měsíc je uzamčený${L && L.by ? ` (${esc(L.by)}, ${esc(tsText(L.at))})` : ''}: nové nahrání docházky ho nezmění.` : 'Klepnutím na den upravíš hodiny nebo kód (vždy s důvodem). Ruční úpravy nové nahrání nepřepíše. Zámkem nad dnem uzamkneš celý den, nahrání ho pak nezmění.'} Ručně upravené dny mají v rohu tečku.</p>
  <div class="stats">${[
    statTile('Pracovních dnů', meta.work, `${nf(meta.fund)} h fondu`),
    statTile('Sobot', meta.sats, `víkendových dnů ${meta.sats + meta.suns}`),
    statTile('Lidí v souboru', rows.length, esc(p.file || '')),
    statTile('Svátků ve všední den', meta.hols, meta.hols ? 'nepočítají se do fondu' : 'žádné'),
  ].join('')}</div>
  <div class="table-card"><table class="stack att-table${all ? ' att-all' : ''}"><thead><tr><th>Zaměstnanec</th><th class="cal att-dayhead"><span class="sr-only">Měsíc</span><div class="calwrap"><div class="calrow">${dmeta.map(d => { const on = all || (L && L.days.includes(d.iso)); return `<button type="button" class="cell att-dl${on ? ' on' : ''}${d.weekend || d.hol ? ' we' : ''}" data-attlock="${esc(d.iso)}" aria-pressed="${!!on}"${all ? ' disabled' : ''} title="${esc(`${DOW[d.dow]} ${d.d}.${d.m}.: ${on ? 'uzamčeno, klepnutím odemkneš' : 'klepnutím uzamkneš den'}`)}" aria-label="${esc(`${on ? 'Odemknout' : 'Uzamknout'} den ${d.d}.${d.m}.`)}">${on ? I.lock : I.unlock}</button>`; }).join('')}</div></div></th><th class="r">Dny</th><th class="r">Hodiny</th><th class="r">Víkend</th></tr></thead><tbody>${rows.map(x => `<tr>
    <td data-label="Zaměstnanec" class="name"><div class="who"><b>${esc(x.r.last)} ${esc(x.r.first)}${probIcon(S.employees[x.k])}</b></div></td>
    <td data-label="Měsíc" class="cal" data-attkey="${esc(x.k)}">${calStrip(x.a, S.employees[x.k] || null, { m: p.id, key: x.k })}</td>
    <td data-label="Dny" class="r num">${x.a.workDays}</td>
    <td data-label="Hodiny" class="r num">${nf(x.a.workHours)}</td>
    <td data-label="Víkend" class="r num">${x.a.wkDays}</td></tr>`).join('')}</tbody></table></div>
  <div class="callegend">${[['full sh-am', 'ranní'], ['full sh-pm', 'odpolední'], ['part sh-am', 'část směny (světlejší)'], ['wk', 'přesčas o víkendu / ve svátek'], ['full', 'odpracováno, směna neznámá'], ['abs', 'nepřítomnost (kód)'], ['miss', 'chybí'], ['wk0', 'volno'], ['full ed', 'ručně upraveno'], ['full lk', 'uzamčený den']].map(([cls, label]) => `<span><i class="cell ${cls}"></i>${label}</span>`).join('')}</div>`;
}

/* Zámek dne nebo měsíce (2.51). Měsíc se zamyká s potvrzením (nahrání ho pak vynechá). */
async function attToggleLock(iso) {
  const p = curPeriod();
  if (!p) return;
  const on = !!iso && !attLocked(p.id, iso);
  if (!iso) {
    const all = attLocked(p.id);
    if (!all && !(await confirmBox('Uzamknout celý měsíc?', `Docházka za ${periodName(p)} se při dalším nahrání nezmění (soubor ji přeskočí). Ruční úpravy dnů půjdou dál. Odemknout jde stejným tlačítkem.`, 'Uzamknout'))) return;
    attLockSet(S, p.id, '', !all, { by: ui.me.label || '', at: Date.now() });
    save(); renderAttendance();
    toast(all ? `Docházka za ${periodName(p)} odemčena.` : `Docházka za ${periodName(p)} uzamčena.`);
    return;
  }
  attLockSet(S, p.id, iso, on, { by: ui.me.label || '', at: Date.now() });
  save(); renderAttendance();
  toast(on ? `Den ${dayText(iso)} uzamčen: nahrání ho nezmění.` : `Den ${dayText(iso)} odemčen.`);
}
/* Ruční úprava dne (2.51): hodiny, kód nepřítomnosti a povinný důvod. */
async function attEditDialog(key, iso) {
  const p = curPeriod();
  if (!p) return;
  const cell = attCellAt(p, key, iso), ed = attEditOf(p.id, key, iso);
  const r = p.rows[key] || S.employees[key];
  const who = r ? `${r.last} ${r.first}`.trim() : key;
  const codes = [...new Set([...Object.keys(p.codes || {}), ...String(S.settings.excused || '').split(/[\s,;]+/).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'cs'));
  const res = await dialog({
    title: `Upravit docházku · ${who}`, ok: 'Uložit úpravu', wide: false,
    html: `<p><b>${esc(DOW[new Date(`${iso}T12:00:00`).getDay()])} ${esc(dayText(iso))}</b> · teď ${esc(attValText(cell.h, cell.c))}${ed ? ` · <span class="tag acc">ručně upraveno</span> ze souboru ${esc(attValText(ed.wh, ed.wc))}` : ''}${attLocked(p.id, iso) ? ` · <span class="tag">${I.lock}uzamčeno</span>` : ''}</p>
      <div class="form-grid att-edgrid">
        <label class="field"><span>Odpracované hodiny</span><input name="h" inputmode="decimal" autocomplete="off" value="${esc(cell.c ? '' : String(cell.h || '').replace('.', ','))}" placeholder="např. 7,5" autofocus></label>
        <label class="field"><span>Kód nepřítomnosti</span><input name="c" list="attCodes" maxlength="10" autocomplete="off" value="${esc(cell.c || '')}" placeholder="prázdné = v práci"></label>
      </div><datalist id="attCodes">${codes.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist>
      <label class="field"><span>Důvod úpravy (povinný)</span><textarea name="note" rows="2" maxlength="300" aria-required="true" placeholder="proč se hodnota mění, třeba „zapomněl čipnout, potvrdil mistr“">${esc(ed ? ed.note : '')}</textarea></label>
      <p class="small muted">Den s kódem nepřítomnosti se nepočítá jako odpracovaný (hodiny u kódu jsou jen pro informaci). Ruční úpravu nové nahrání docházky nepřepíše.</p>
      ${ed ? '<button class="btn ghost small" type="submit" value="undo" formnovalidate>Vrátit hodnotu ze souboru</button>' : ''}`,
    validate: form => {
      const f = form.elements, h = String(f.h.value).trim();
      if (h && !/^\d{1,2}([.,]\d{1,2})?$/.test(h)) return 'Hodiny zadej číslem, třeba 7,5.';
      if (attHrs(h) > 24) return 'Den má nejvýš 24 hodin.';
      if (String(f.note.value).trim().length < 3) return 'Napiš důvod úpravy (aspoň 3 znaky).';
      return '';
    },
  });
  if (res.value === 'undo') {
    if (attEditDel(S, p.id, key, iso)) { save(); renderAll(); toast(`Docházka ${who}, ${dayText(iso)}: vrácena hodnota ze souboru.`); }
    return;
  }
  if (res.value !== 'ok') return;
  const f = res.form.elements;
  const out = attEditSet(S, p.id, key, iso, { h: f.h.value, c: f.c.value, note: f.note.value }, { by: ui.me.label || '', at: Date.now() });
  if (out.err) { toast(out.err, true); return; }
  save(); renderAll();
  toast(out.back ? `Hodnota je stejná jako v souboru, ruční úprava zrušena.` : `Docházka ${who}, ${dayText(iso)}: ${attValText(out.edit.h, out.edit.c)}.`);
}

/* Hodiny ze souboru Docházka a výkony nahrané před 2.46 nejsou zaokrouhlené: nabídne přepočet
   (uložené příchody a odchody se nemění, přepíšou se jen hodiny dnů s příchodem). */
function attRehoursHtml(p) {
  if (!dvOwns(p.id)) return '';
  const r = dvRehours(false);
  if (!r.cells || !r.months.includes(p.id)) return '';
  return `<div class="note w att-rehours"><span><b>Hodiny nejsou zaokrouhlené.</b> ${r.cells} ${r.cells === 1 ? 'den' : r.cells <= 4 ? 'dny' : 'dní'} u ${r.people} ${r.people === 1 ? 'člověka' : 'lidí'} se počítalo před zaokrouhlením příchodů a odchodů na směnu (6:00–14:00, 14:00–22:00, čtvrthodiny, nejvýš 7,5 h).</span> <button class="btn small" type="button" data-attrehours>Přepočítat hodiny</button></div>`;
}

function showImport(res, ask) {
  const box = $('#importMsg');
  let html = '';
  if (res && !res.ok) html += `<div class="note e"><b>Import selhal.</b> ${esc(res.err)}</div>`;
  if (res && res.ok) {
    html += `<div class="note i"><b>Načteno:</b> ${esc(ui.lastFile)}: ${esc(periodName(res.period))}, ${Object.keys(res.period.rows).length} lidí, ${res.period.days.length} dnů (hlavička na řádku ${res.period.headerRow}).</div>`;
    (res.warn || []).forEach(w => { html += `<div class="note w">${esc(w.replace(/&times;/g, '×'))}</div>`; });
  }
  if (ask) {
    html += `<div class="note w period-fix"><span>Sedí období?</span><select id="fixM">${MONL.map((m, i) => `<option value="${i + 1}"${ask.m === i + 1 ? ' selected' : ''}>${m}</option>`).join('')}</select><input type="number" id="fixY" value="${ask.y}" min="2000" max="2100"><button class="btn sec small" type="button" id="fixGo">Přepočítat</button></div>`;
  }
  box.innerHTML = html;
  if (ask) $('#fixGo').onclick = () => doImport(ui.lastAoa, ui.lastFile, +$('#fixY').value, +$('#fixM').value, true);
}

async function doImport(aoa, name, fy, fm, force = false) {
  ui.lastAoa = aoa;
  ui.lastFile = name;
  const res = buildPeriod(aoa, name, fy, fm);
  if (!res.ok) { showImport(res, null); renderAttendance(); return; }
  const per = res.period;
  if (dvOwns(per.id)) {
    showImport({ ok: false, err: `Docházka za ${periodName(per)} se nahrává v KPI tlačítkem Nahrát docházku a výkony (od listopadu 2026 je to jediný zdroj docházky). Tady jde nahrát jen říjen 2026 a dřív.` }, null);
    return;
  }
  if (!S.demo && attLocked(per.id)) {
    showImport({ ok: false, err: `Docházka za ${periodName(per)} je uzamčená. Kdo ji chce nahrát znovu, musí v Docházce měsíc odemknout.` }, null);
    return;
  }
  if (!force && !S.demo && S.periods[per.id]) {
    const ne = attEditCount(per.id), nl = ((S.attLocks || {})[per.id] || { days: [] }).days.length;
    if (!(await confirmBox('Přepsat docházku?', `Docházka za ${periodName(per)} už je nahraná. Nový soubor ji nahradí; zařazení, sankce, ruční úpravy${ne ? ` docházky (${ne})` : ''}${nl ? `, uzamčené dny (${nl})` : ''} a výdeje zůstanou.`, 'Přepsat'))) return;
  }
  // 2.48: do vlastních dat se hodiny jen přiřadí k lidem v systému (kontrola prohozeného jména
  // a překlepů), nikdo nový se nepřidá a jména v systému zůstanou.
  let pending = per;
  let matchNote = '';
  if (!S.demo) {
    const m = attMatch(per);
    const assign = await attMatchDialog(m, name);
    if (!assign) return;
    const r = attRemap(per, assign);
    pending = r.period;
    const got = Object.keys(pending.rows).length;
    const fixed = m.rows.filter(x => x.how !== 'exact' && assign.get(x.k)).length;
    matchNote = `přiřazeno lidí: ${got}${fixed ? ` (po kontrole jména ${fixed})` : ''}${r.skipped ? `, nenahrané řádky: ${r.skipped}` : ''}`;
    store.note = { kind: 'import', text: `Nahrána docházka za ${periodName(per)} (${name}): ${matchNote}` };
  }
  if (S.demo) {
    S.demo = false; S.periods = {}; S.employees = {}; S.production = {}; S.prodMap = {}; S.sanctions = []; S.adjust = {}; S.kafe = {}; S.issued = {}; S.log = []; S.eff = blankEff(); S.marks = {}; S.audit = blankAudit(); S.attEdits = {}; S.attLocks = {};
    dropDemoRaise(S.positions);
    store.note = { kind: 'import', text: `Nahrána první docházka za ${periodName(per)} (${Object.keys(per.rows).length} lidí, ${name}); ukázková data smazána` };
  }
  const fresh = !matchNote;
  const before = S.periods[per.id] || null;
  S.periods[per.id] = pending;
  attProtect(per.id, before);   // 2.51: uzamčené dny a ruční úpravy nové nahrání nepřepíše
  setPeriod(per.id);
  let added = 0;
  if (fresh) {
    Object.entries(per.rows).forEach(([k, r]) => {
      if (!S.employees[k]) { S.employees[k] = { key: k, first: r.first, last: r.last, positionId: null, level: null, note: '' }; added += 1; }
      else { S.employees[k].first = r.first; S.employees[k].last = r.last; }
    });
  }
  save();
  showImport(res, { y: per.y, m: per.m });
  renderAll();
  if (!fresh) $('#importMsg').insertAdjacentHTML('beforeend', `<div class="note i att-matchmsg"><b>Kontrola jmen:</b> ${esc(matchNote)}. Nikdo nový se nepřidal.</div>`);
  toast(fresh ? `Nahráno: ${Object.keys(per.rows).length} lidí${added ? `, ${added} nových` : ''}.` : `Docházka nahrána: ${matchNote}.`);
  if (added) $('#importMsg').insertAdjacentHTML('beforeend', `<div class="note w"><b>${added} nových lidí</b> čeká na zařazení do skupiny. <button class="link" type="button" data-go="lide">Zařadit teď</button></div>`);
}

/* Kontrola jmen před nahráním docházky postaru (2.48): ukáže řádky, které nesedí přesně
   (prohozené jméno a příjmení, překlep, nenalezeno), s výběrem člověka ze systému. Vrátí mapu
   řádek souboru → klíč člověka (bez přiřazení = nenahraje se), nebo null (zrušeno). */
async function attMatchDialog(m, fileName) {
  const assign = new Map(m.rows.filter(x => x.emp).map(x => [x.k, x.emp]));
  const odd = m.rows.filter(x => x.how !== 'exact');
  if (!odd.length && !m.missing.length) return assign;
  const nameOf = k => { const e = S.employees[k]; return e ? `${e.last} ${e.first}`.trim() : k; };
  const opts = Object.values(S.employees).filter(e => e && e.key).sort((a, b) => norm(`${a.last} ${a.first}`).localeCompare(norm(`${b.last} ${b.first}`), 'cs'));
  const optHtml = sel => `<option value="">— nepřiřazovat —</option>${opts.map(e => `<option value="${esc(e.key)}"${e.key === sel ? ' selected' : ''}>${esc(`${e.last} ${e.first}`.trim())}${e.wid ? ` · ID ${esc(e.wid)}` : ''}${e.excluded ? ' (vyřazen)' : ''}</option>`).join('')}`;
  const HOW = { swap: ['prohozené jméno a příjmení', 'acc'], fuzzy: ['podobné jméno (překlep)', 'warn'], none: ['v systému nenalezen', 'crit'], dup: ['stejný člověk je v souboru dvakrát', 'crit'] };
  const order = { none: 0, dup: 1, fuzzy: 2, swap: 3 };
  odd.sort((a, b) => order[a.how] - order[b.how] || norm(a.last).localeCompare(norm(b.last), 'cs'));
  const rowHtml = (x, i) => `<tr data-amrow="${i}"><td class="name" data-label="V souboru"><b>${esc(`${x.first} ${x.last}`.trim())}</b><small class="muted">sloupec A ${esc(x.first || '—')} · B ${esc(x.last || '—')}</small></td>
    <td data-label="Kontrola"><span class="tag ${HOW[x.how][1]}">${esc(HOW[x.how][0])}</span>${x.how === 'dup' && x.dupOf ? `<small class="muted"> (už přiřazen řádek ${esc(m.rows.find(r => r.k === x.dupOf) ? `${m.rows.find(r => r.k === x.dupOf).first} ${m.rows.find(r => r.k === x.dupOf).last}` : '')})</small>` : ''}${x.how === 'none' && x.cand.length ? `<small class="muted"> možná: ${x.cand.slice(0, 3).map(k => esc(nameOf(k))).join(', ')}</small>` : ''}</td>
    <td data-label="Přiřadit k"><select name="am-${i}" aria-label="Přiřadit řádek ${esc(`${x.first} ${x.last}`)}">${optHtml(x.emp || '')}</select></td></tr>`;
  const miss = m.missing.map(nameOf).sort((a, b) => norm(a).localeCompare(norm(b), 'cs'));
  const res = await dialog({
    title: 'Kontrola jmen v docházce', ok: 'Nahrát hodiny', wide: true,
    html: `<p>Soubor <b>${esc(fileName)}</b>: ${m.rows.length} ${m.rows.length === 1 ? 'řádek' : m.rows.length <= 4 ? 'řádky' : 'řádků'}. Přesně sedí ${m.n.exact}${m.n.swap ? `, prohozené jméno a příjmení ${m.n.swap}` : ''}${m.n.fuzzy ? `, podobné jméno ${m.n.fuzzy}` : ''}${m.n.none + m.n.dup ? `, nepřiřazeno ${m.n.none + m.n.dup}` : ''}.</p>
      <p class="small muted">Hodiny se jen přiřadí k lidem, kteří už v systému jsou. Nikdo nový se nepřidá a jména v systému zůstanou. Řádek bez přiřazení se nenahraje. Kontrola běží v prohlížeči, jména se nikam neposílají.</p>
      ${odd.length ? `<div class="table-card flat att-matchtab"><table class="stack"><thead><tr><th>V souboru</th><th>Kontrola</th><th>Přiřadit k</th></tr></thead><tbody>${odd.map(rowHtml).join('')}</tbody></table></div>` : '<div class="note i">Všechny řádky souboru sedí přesně na lidi v systému.</div>'}
      ${miss.length ? `<details class="att-miss"><summary>${miss.length} ${lidiN(miss.length)} ze systému v souboru ${miss.length >= 2 && miss.length <= 4 ? 'nejsou' : 'není'}</summary><p class="small">${miss.map(esc).join(', ')}</p></details>` : ''}`,
    validate: form => {
      const seen = new Map();
      for (const [k, key] of assign) if (!odd.some(x => x.k === k)) seen.set(key, k);
      for (let i = 0; i < odd.length; i += 1) {
        const v = form.elements.namedItem(`am-${i}`).value;
        if (!v) continue;
        if (seen.has(v)) return `${nameOf(v)} je přiřazený dvakrát. Každý člověk může mít jen jeden řádek docházky.`;
        seen.set(v, odd[i].k);
      }
      return null;
    },
  });
  if (res.value !== 'ok') return null;
  odd.forEach((x, i) => { const v = res.form.elements.namedItem(`am-${i}`).value; if (v) assign.set(x.k, v); else assign.delete(x.k); });
  return assign;
}

/** Tabulka ze souboru: CSV (UTF-8 i Windows-1250) nebo Excel; u Excelu vybere nejlepší list. */
async function readTable(file, pick) {
  const lower = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return [{ aoa: parseCSV(decodeText(buffer)), name: file.name }];
  const X = await xlsx();
  const workbook = X.read(new Uint8Array(buffer), { type: 'array', cellNF: true });
  return (pick ? pick(workbook.SheetNames) : workbook.SheetNames).map(sheet => ({
    aoa: X.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, raw: true, defval: null, blankrows: true }),
    name: file.name + (workbook.SheetNames.length > 1 ? ` › ${sheet}` : ''),
    dateCols: sheetDateCols(X, workbook.Sheets[sheet]),
  }));
}
/* Sloupce s buňkami formátovanými jako datum (2.37): číslo zakázky 45100 vypadá v Excelu
   stejně jako datum, rozliší je jen formát buňky. */
function sheetDateCols(X, ws) {
  const out = new Set();
  if (!ws) return out;
  Object.keys(ws).forEach(k => {
    if (k[0] === '!') return;
    const c = ws[k];
    if (c && (c.t === 'd' || (c.t === 'n' && c.z && X.SSF.is_date(c.z)))) out.add(X.utils.decode_cell(k).c);
  });
  return out;
}

async function readFile(file) {
  if (!file) return;
  try {
    const sheets = await readTable(file);
    let best = null;
    let bestScore = -Infinity;
    sheets.forEach(sheet => {
      const t = buildPeriod(sheet.aoa, sheet.name);
      const score = t.ok ? Object.keys(t.period.rows).length * 100 + t.period.days.length : -1;
      if (score > bestScore) { bestScore = score; best = sheet; }
    });
    // Oprava: když žádný list nešel přečíst, původní aplikace tiše neudělala nic.
    if (best) await doImport(best.aoa, best.name);
    else showImport({ ok: false, err: 'Soubor neobsahuje žádný list.' }, null);
  } catch (error) {
    showImport({ ok: false, err: `Soubor se nepodařilo otevřít: ${error.message}` }, null);
  }
}

