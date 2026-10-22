// Prohlížečový průchod modulem Shortage (verze 2.27, sloupce 2.27.1): import Excelu (A číslo
// objednávky, B název dílu, C EAN s vloženým odkazem, D index, E urgentní množství, G TOP,
// H probíhající operace), titulek a hlavička nad daty, EAN s nulami na začátku, vzorec HYPERLINK,
// řádky bez odkazu, s odkazem bez activeBarcode a s odkazem v jiné buňce, TOP SHORTAGE nahoře,
// druhý list v sešitu, hledání, PDF na šířku (text, žádné odkazy, QR kódy s activeBarcode přečtené
// zpátky z vykresleného PDF), vložení tabulky ze schránky (HTML jako z Excelu i jen text), další
// seznam, přepnutí, smazání, historie změn, CSV, telefon a tmavý režim.
// Spuštění stejně jako e2e_browser.js:
//   ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t . dev-router.php &
//   curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state
//   NO_PROXY=127.0.0.1 PW=$(npm root -g)/playwright S=$S node tests/e2e_shortage.js
// QR kódy čte PyMuPDF (vykreslení stránky) a jsQR se zálohou ZXing (static/vendor, private/vendor); bez PyMuPDF
// se kontrola QR přeskočí. Snímky jsou v $S/oshots-sh. Všechna data jsou vymyšlená.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-sh');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

async function watch(page, label) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  page.on('response', r => { if (r.status() >= 400) problems.push(`${label} HTTP ${r.status()} ${r.url()}`); });
  page.on('pageerror', err => problems.push(`${label} pageerror: ${err.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`));
  });
}
const saved = page => page.waitForFunction(() => !store.dirty && !store.saving && document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 15000 });
async function download(page, selector, name) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  const target = path.join(S, name || file.suggestedFilename());
  await file.saveAs(target);
  return { name: file.suggestedFilename(), path: target, pdf: fs.readFileSync(target).slice(0, 5).toString() === '%PDF-' };
}
/* Text, rozměr stránek a odkazy z PDF (pypdf, jinak PyMuPDF). */
function pdfInfo(file) {
  const py = `import sys, json
try:
    import pypdf
    r = pypdf.PdfReader(sys.argv[1])
    pages = [{'text': p.extract_text() or '', 'w': float(p.mediabox.width), 'h': float(p.mediabox.height),
              'links': [a.get_object().get('/A', {}).get('/URI') for a in (p.get('/Annots') or []) if a.get_object().get('/Subtype') == '/Link']} for p in r.pages]
except ImportError:
    import pymupdf
    d = pymupdf.open(sys.argv[1])
    pages = [{'text': p.get_text(), 'w': p.rect.width, 'h': p.rect.height, 'links': [l.get('uri') for l in p.get_links()]} for p in d]
print(json.dumps(pages))`;
  const r = spawnSync('python3', ['-c', py, file], { encoding: 'utf8' });
  return r.status === 0 ? JSON.parse(r.stdout) : null;
}
/* Výřezy buněk s QR kódy (A4 na šířku, souřadnice z drawShortage) jako šedotónové obrázky. */
function qrCrops(file, dir) {
  const py = `import sys, json, os
try:
    import pymupdf
except ImportError:
    print('null'); sys.exit(0)
d = pymupdf.open(sys.argv[1]); out = []; Z = 6; mm = 72 / 25.4
for pi, p in enumerate(d):
    pix = p.get_pixmap(matrix=pymupdf.Matrix(Z, Z), colorspace=pymupdf.csGRAY)
    first = 16 + 5.5 + 9 + 4 + 9.5 if pi == 0 else 16 + 9.5
    for row in range(8):
        top = first + row * 20
        if top + 20 > 190: break
        x0, y0 = int((16 + 7) * mm * Z), int(top * mm * Z)
        w, h = int(21 * mm * Z), int(20 * mm * Z)
        if y0 + h > pix.height: break
        buf = bytearray()
        for y in range(y0, y0 + h):
            s = (y * pix.width + x0) * pix.n
            buf += pix.samples[s:s + w * pix.n]
        name = os.path.join(sys.argv[2], f'qr-{pi}-{row}.raw')
        open(name, 'wb').write(bytes(buf)); out.append({'page': pi, 'row': row, 'file': name, 'w': w, 'h': h})
print(json.dumps(out))`;
  fs.mkdirSync(dir, { recursive: true });
  const r = spawnSync('python3', ['-c', py, file, dir], { encoding: 'utf8', maxBuffer: 1 << 26 });
  return r.status === 0 ? JSON.parse(r.stdout) : null;
}
/* QR z vykresleného PDF čte jsQR (static/vendor/jsQR.js), záloha ZXing. ZXing JS některé platné
   symboly nepřečte (ověřeno: jsQR je přečte) a hybridní binarizace selhává na dokonale čistém obrázku. */
function readQr(Z, crop) {
  const lum = new Uint8ClampedArray(fs.readFileSync(crop.file));
  const jsQR = require(path.resolve(__dirname, '../static/vendor/jsQR.js'));
  const rgba = new Uint8ClampedArray(lum.length * 4);
  lum.forEach((v, i) => { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255; });
  const hit = (jsQR.default || jsQR)(rgba, crop.w, crop.h);
  if (hit) return hit.data;
  for (const Bin of [Z.HybridBinarizer, Z.GlobalHistogramBinarizer]) {
    try { return new Z.QRCodeReader().decode(new Z.BinaryBitmap(new Bin(new Z.RGBLuminanceSource(lum, crop.w, crop.h))), new Map([[Z.DecodeHintType.TRY_HARDER, true]])).getText(); } catch (error) { /* další binarizace */ }
  }
  return null;
}
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
async function confirm(page) {
  await page.waitForSelector('#dlg[open]');
  await page.click('#dlgOk');
  await page.waitForSelector('#dlg', { state: 'hidden' });
}

// 25 vymyšlených dílů: odkaz vložený v buňce EAN (jako z IS, activeBarcode uprostřed), u 3. položky
// vzorec HYPERLINK, 5. a 12. bez odkazu, 9. s odkazem bez activeBarcode, 7. s activeBarcode na konci
// odkazu, 10. s odkazem v buňce objednávky, 2. EAN jako číslo s nulami na začátku. TOP: 4., 11., 18.
// a 21. („top“ malými písmeny).
const NAMES = ['Hřídel předlohová', 'Ložisko 6204-2RS', 'Těsnění víka převodovky', 'Šroub M8×25 DIN 912', 'Pružina tlačná', 'Kryt řemene', 'Čep páky', 'Matice samojistná M10', 'Příruba čerpadla', 'Ozubené kolo z = 32'];
const OPS = ['Broušení', 'Montáž', 'Elox', 'CNC frézování', ''];
const ITEMS = Array.from({ length: 25 }, (_, i) => {
  const ean = i === 1 ? '0012345678905' : String(8594000000000 + 101 * (i + 1));
  const code = i === 4 || i === 11 || i === 8 ? '' : `${61000 + i}.${962000 + i * 7}.${73800 + i * 3}`;
  const link = i === 4 || i === 11 ? '' : i === 8 ? `https://erp.example.cz/dil/${ean}?sklad=H2`
    : `http://is.example/commission.production.detail/default/${68700 + i}?activeBarcode=${code}${i === 6 ? '' : `&componentProductionId=${962000 + i * 7}`}`;
  return { ean, link, code, top: [3, 10, 17, 20].includes(i), topText: i === 20 ? 'top' : 'TOP', op: OPS[i % OPS.length], linkInOrder: i === 9,
    name: `${NAMES[i % NAMES.length]}${i >= 10 ? ` ${Math.floor(i / 10) + 1}` : ''}`, order: `OBJ-2026-${String(4100 + i).padStart(5, '0')}`, index: 'ABCD'[i % 4], qty: i === 2 ? 1200 : (i * 7) % 50 + 1 };
});
// pořadí v seznamu a v PDF: TOP SHORTAGE první
const ORDERED = [...ITEMS.filter(x => x.top), ...ITEMS.filter(x => !x.top)];

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  global.lastPage = page;
  await watch(page, 'shortage');
  await page.goto(BASE);
  await page.waitForSelector('#setupForm');
  await page.fill('[name="token"]', fs.readFileSync(process.env.TOKEN_FILE || path.join(S, 'odme2e', 'setup-token.txt'), 'utf8').trim());
  await page.fill('[name="label"]', 'Vedoucí skladu');
  await page.click('#setupForm button[type="submit"]');
  await page.waitForSelector('.odm-card');
  await page.check('#saved');
  await page.click('#finish');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');
  await saved(page);

  // Prázdný modul.
  await page.click('#nav [data-view="shortage"]');
  await page.waitForSelector('#view-shortage.on #shView .empty');
  check(/Zatím žádný seznam/.test(await page.textContent('#shView')) && /ve sloupci A číslo objednávky/.test(await page.textContent('#shView')) && /Ctrl\+V/.test(await page.textContent('#shView')), 'prázdný stav s popisem sloupců a vložení');
  await page.screenshot({ path: path.join(shots, '01-prazdny.png') });

  // Sešit Excelu vyrobí SheetJS v prohlížeči: titulek, hlavička, 25 položek a druhý list.
  const xlsxB64 = await page.evaluate(async items => {
    const X = await xlsx();
    const ws = X.utils.aoa_to_sheet([['Shortage HALA 2 – 22. 10. 2026'], [], ['Číslo objednávky', 'Název dílu', 'EAN', 'Index', 'Urgentní množství', 'Sklad', 'TOP', 'Probíhající operace']]);
    items.forEach((it, i) => {
      const r = i + 3;
      const a = X.utils.encode_cell({ r, c: 2 });
      ws[a] = i === 1 ? { t: 'n', v: Number(it.ean), z: '0000000000000' } : { t: 's', v: it.ean };
      ws[X.utils.encode_cell({ r, c: 0 })] = { t: 's', v: it.order };
      if (i === 2) ws[a].f = `HYPERLINK("${it.link}","${it.ean}")`;
      else if (it.linkInOrder) ws[X.utils.encode_cell({ r, c: 0 })].l = { Target: it.link };
      else if (it.link) ws[a].l = { Target: it.link, Tooltip: 'Detail dílu' };
      ws[X.utils.encode_cell({ r, c: 1 })] = { t: 's', v: it.name };
      ws[X.utils.encode_cell({ r, c: 3 })] = { t: 's', v: it.index };
      ws[X.utils.encode_cell({ r, c: 4 })] = { t: 'n', v: it.qty };
      ws[X.utils.encode_cell({ r, c: 5 })] = { t: 's', v: 'H2' };
      if (it.top) ws[X.utils.encode_cell({ r, c: 6 })] = { t: 's', v: it.topText };
      if (it.op) ws[X.utils.encode_cell({ r, c: 7 })] = { t: 's', v: it.op };
    });
    ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: items.length + 2, c: 7 } });
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Poznámka'], ['Seznam je na prvním listu.']]), 'Info');
    X.utils.book_append_sheet(wb, ws, 'Shortage');
    const bytes = new Uint8Array(X.write(wb, { bookType: 'xlsx', type: 'array' }));
    let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }, ITEMS);
  await page.setInputFiles('#shFile', { name: 'shortage-22-10.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(xlsxB64, 'base64') });
  await page.waitForSelector('#shView table.sh-tab');
  const msg = await page.textContent('#shMsg');
  check(/Nahráno 25 položek ze souboru shortage-22-10\.xlsx \(list Shortage\), z toho 4 TOP SHORTAGE/.test(msg), `zpráva o importu: ${msg}`);
  check(/2 položky nemají hypertextový odkaz/.test(msg) && /1 položka má odkaz bez activeBarcode/.test(msg), `upozornění na odkazy: ${msg}`);
  const st = await page.evaluate(() => S.shortage.lists.map(l => ({ n: l.items.length, file: l.file, sheet: l.sheet, by: l.by, items: l.items })));
  check(st.length === 1 && st[0].n === 25 && st[0].sheet === 'Shortage' && st[0].by === 'Vedoucí skladu', `uložený seznam: ${JSON.stringify(st.map(x => [x.n, x.sheet, x.by]))}`);
  const it = st[0].items;
  check(JSON.stringify(it.map(x => x.ean)) === JSON.stringify(ORDERED.map(x => x.ean)), `TOP SHORTAGE nahoře, jinak pořadí ze souboru: ${it.map(x => x.ean.slice(-4)).join(' ')}`);
  check(JSON.stringify(it.map(x => x.top)) === JSON.stringify(ORDERED.map(x => x.top)), 'TOP i malými písmeny');
  check(JSON.stringify(it.map(x => x.code)) === JSON.stringify(ORDERED.map(x => x.code)), `kód z activeBarcode: ${JSON.stringify(it.map(x => x.code).slice(0, 6))}`);
  check(JSON.stringify(it.map(x => x.op)) === JSON.stringify(ORDERED.map(x => x.op)), 'probíhající operace ze sloupce H');
  const byEan = e => it.find(x => x.ean === e);
  check(byEan('0012345678905'), 'EAN s nulami na začátku');
  check(byEan(ITEMS[0].ean).link === ITEMS[0].link && byEan(ITEMS[2].ean).link === ITEMS[2].link && byEan(ITEMS[9].ean).link === ITEMS[9].link, 'odkaz vložený v buňce, vzorec HYPERLINK i odkaz v buňce objednávky');
  check(byEan(ITEMS[6].ean).code === ITEMS[6].code && !byEan(ITEMS[8].ean).code && byEan(ITEMS[8].ean).link === ITEMS[8].link, 'activeBarcode na konci odkazu; odkaz bez activeBarcode nemá kód, ale zůstane klikací');
  const q2 = byEan(ITEMS[2].ean);
  check(q2.qty === '1 200' && byEan(ITEMS[0].ean).qty === '1' && byEan(ITEMS[0].ean).order === 'OBJ-2026-04100' && byEan(ITEMS[0].ean).index === 'A', `množství a objednávka: ${JSON.stringify(q2)}`);
  check(await page.locator('#shView tbody tr').count() === 25 && await page.locator('#shView tbody tr.sh-top').count() === 4, 'tabulka má 25 řádků, 4 TOP');
  check(await page.locator('#shView tbody tr').nth(3).evaluate(tr => tr.classList.contains('sh-top')) && !(await page.locator('#shView tbody tr').nth(4).evaluate(tr => tr.classList.contains('sh-top'))), 'TOP řádky jsou první');
  check(/TOP SHORTAGE/.test(await page.textContent('#shView tbody tr:first-child')), 'štítek TOP SHORTAGE');
  const a0 = page.locator('#shView tbody tr').nth(4).locator('a');
  check(await a0.getAttribute('href') === ITEMS[0].link && await a0.getAttribute('target') === '_blank' && /noopener/.test(await a0.getAttribute('rel')), 'EAN v tabulce otevře odkaz v nové kartě');
  check((await page.textContent('#shView tbody tr:nth-child(5)')).includes(ITEMS[0].code), 'kód pro QR v tabulce');
  const tilesText = (await page.textContent('#shView .stats')).replace(/\s+/g, ' ');
  check(/TOP shortage\s*4/.test(tilesText) && /S QR kódem\s*22\s*bez kódu 3/.test(tilesText), `dlaždice: ${tilesText}`);
  await page.screenshot({ path: path.join(shots, '02-seznam.png'), fullPage: true });

  // Hledání v seznamu.
  await page.fill('#shQ', 'ložisko');
  check(await page.locator('#shView tbody tr:not([hidden])').count() === 3, 'hledání najde tři ložiska');
  await page.fill('#shQ', '04117');
  check(await page.locator('#shView tbody tr:not([hidden])').count() === 1, 'hledání podle čísla objednávky');
  await page.fill('#shQ', 'elox');
  check(await page.locator('#shView tbody tr:not([hidden])').count() === 5, 'hledání podle operace');
  await page.fill('#shQ', ITEMS[7].code);
  check(await page.locator('#shView tbody tr:not([hidden])').count() === 1, 'hledání podle kódu');
  await page.fill('#shQ', 'nic takového');
  check(await page.isVisible('#shView .sh-none'), 'nic nenalezeno');
  await page.fill('#shQ', '');
  await saved(page);

  // PDF na šířku.
  const pdf = await download(page, '[data-shpdf]');
  check(pdf.pdf && /^shortage-\d{4}-\d{2}-\d{2}-\d{4}\.pdf$/.test(pdf.name), `PDF ${pdf.name}`);
  const info = pdfInfo(pdf.path);
  if (info) {
    const text = info.map(p => p.text).join(' ').replace(/\s+/g, ' ');
    check(info.every(p => p.w > p.h), 'všechny stránky A4 na šířku');
    check(info.length === 4, `25 položek na ${info.length} stránkách (7 + 8 + 8 + 2)`);
    ['Chybějící díly', 'Stav k 10:00', 'Stav k 13:00', 'Poznámky', 'Urgentní', 'Číslo objednávky', 'Operace · poslední', 'QR kód', 'TOP SHORTAGE', '4 TOP SHORTAGE', '0012345678905', 'Těsnění víka převodovky', 'Šroub M8×25 DIN 912', 'OBJ-2026-04124', '1 200', 'CNC frézování', ITEMS[0].code, 'bez odkazu', 'odkaz bez activeBarcode', 'Strana 4 / 4']
      .forEach(t => check(text.includes(t), `PDF obsahuje „${t}“`));
    check(info.slice(1).every(p => /Stav k 10:00/.test(p.text)), 'hlavička tabulky na každé stránce');
    // klikací odkazy ne: jsPDF 4.2 by v adrese přepsal & na &amp; (adresa by se otevřela špatně)
    check(!info.some(p => p.links.length), `PDF bez klikacích odkazů: ${JSON.stringify(info.map(p => p.links.length))}`);
    const crops = qrCrops(pdf.path, path.join(S, 'sh-qr'));
    if (crops) {
      const Z = require(path.resolve(__dirname, '../private/vendor/zxing.min.js'));
      const read = crops.map(c => ({ ...c, text: readQr(Z, c) }));
      // pořadí položek po stránkách: 7, 8, 8, 2
      let idx = 0; const got = [];
      [7, 8, 8, 2].forEach((n, pi) => { for (let r = 0; r < n; r += 1) { got.push({ i: idx, text: (read.find(c => c.page === pi && c.row === r) || {}).text || null }); idx += 1; } });
      const bad = got.filter(g => g.text !== (ORDERED[g.i].code || null));
      check(!bad.length, `QR kódy v PDF nesou activeBarcode z odkazu (špatně: ${JSON.stringify(bad.slice(0, 3))})`);
      check(got.filter(g => g.text).length === 22, `přečteno ${got.filter(g => g.text).length} QR kódů z 22`);
    } else console.log('PyMuPDF chybí, QR v PDF se nekontroluje');
    spawnSync('python3', ['-c', `import pymupdf,sys
d=pymupdf.open(sys.argv[1])
for i in (0, 3): d[i].get_pixmap(matrix=pymupdf.Matrix(2,2)).save(sys.argv[2]+f'/pdf-strana-{i+1}.png')`, pdf.path, shots]);
  } else console.log('pypdf ani PyMuPDF nejsou, text PDF se nekontroluje');

  // Vložení ze schránky (Ctrl+V): HTML jako z Excelu (hlavička CF_HTML, StartFragment, odkaz v <a>
  // s &amp;, nezlomitelné mezery, zalomení v buňce, sloučené buňky) a pak jen text bez odkazů.
  await page.evaluate(() => { const l = S.shortage.lists[0]; l.at -= 3 * 3600 * 1000; });   // první seznam je „ráno“
  await saved(page).catch(() => {});
  const clipHtml = `Version:0.9\r\nStartHTML:0000000105\r\n<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta http-equiv=Content-Type content="text/html; charset=utf-8"><style>.xl65 {mso-number-format:"\\@";}</style></head>
<body link="#0563C1" vlink="#954F72"><table border=0 cellpadding=0 cellspacing=0 width=900 style='border-collapse:collapse'>
<col width=120><col width=200><!--StartFragment-->
 <tr height=20><td height=20>Číslo objednávky</td><td>Název dílu</td><td>EAN</td><td>Index</td><td>Urgentní množství</td><td></td><td>TOP</td><td>Probíhající operace</td></tr>
 <tr height=20><td height=20 class=xl65>OBJ-2026-09001</td><td>Víko&nbsp;skříně<br style='mso-data-placement:same-cell'>velké</td><td class=xl66><a href="http://is.example/commission.production.detail/default/69001?activeBarcode=70001.980001.12345&amp;componentProductionId=980001"><span style='font-size:11pt'>8591111111111</span></a></td><td>B</td><td align=right>3</td><td></td><td>TOP</td><td>Lakování</td></tr>
 <tr height=20><td height=20>OBJ-2026-09002</td><td>Kryt ventilu</td><td><a href="http://is.example/commission.production.detail/default/69002?activeBarcode=70002.980002.12346&amp;componentProductionId=980002">8591111111128</a></td><td>A</td><td align=right>1&nbsp;500</td><td colspan=2></td><td>Broušení</td></tr>
<!--EndFragment--></table></body></html>`;
  const paste = (html, text) => page.evaluate(([h, t]) => {
    const dt = new DataTransfer();
    if (h) dt.setData('text/html', h);
    dt.setData('text/plain', t);
    document.querySelector('#shPaste').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [html, text]);
  await page.click('#shPaste');
  await paste(clipHtml, 'Číslo objednávky\tNázev dílu\tEAN\nOBJ-2026-09001\tVíko skříně\t8591111111111\n');
  await page.waitForFunction(() => S.shortage.lists.length === 2);
  const pmsg = await page.textContent('#shMsg');
  check(/Vloženo 2 položky ze schránky, z toho 1 TOP SHORTAGE/.test(pmsg) && !/bez odkazů/.test(pmsg), `vložení ze schránky: ${pmsg}`);
  const pl = await page.evaluate(() => S.shortage.lists[0]);
  check(pl.file === 'vloženo ze schránky' && pl.items.length === 2, `vložený seznam: ${pl.file} ${pl.items.length}`);
  check(JSON.stringify((({ id, note, rec, subs, ...x }) => x)(pl.items[0])) === JSON.stringify({ order: 'OBJ-2026-09001', name: 'Víko skříně velké', ean: '8591111111111', index: 'B', qty: '3', top: true, op: 'Lakování',
    link: 'http://is.example/commission.production.detail/default/69001?activeBarcode=70001.980001.12345&componentProductionId=980001', code: '70001.980001.12345' }), `vložená položka: ${JSON.stringify(pl.items[0])}`);
  check(pl.items[1].qty === '1 500' && pl.items[1].op === 'Broušení' && !pl.items[1].top && pl.items[1].code === '70002.980002.12346', `sloučené buňky a mezery: ${JSON.stringify(pl.items[1])}`);
  check(await page.inputValue('#shPaste') === '', 'pole pro vložení zůstane prázdné');
  await page.screenshot({ path: path.join(shots, '03a-vlozeno.png'), fullPage: true });
  await saved(page);
  // jen text (bez HTML): seznam se vloží, ale upozorní, že odkazy a QR chybí
  await page.click('#shView [data-shdel]');
  await confirm(page);
  await page.waitForFunction(() => S.shortage.lists.length === 1);
  await paste('', 'Číslo objednávky\tNázev dílu\tEAN\tIndex\tUrgentní množství\t\tTOP\tProbíhající operace\r\nOBJ-1\t"Díl\ts tabulátorem"\t8590000000011\tA\t2\t\tTOP\tMontáž\r\n');
  await page.waitForFunction(() => S.shortage.lists.length === 2);
  check(/Vloženo 1 položka ze schránky/.test(await page.textContent('#shMsg')) && /jen text bez odkazů/.test(await page.textContent('#shMsg')), `vložený text: ${await page.textContent('#shMsg')}`);
  check(await page.evaluate(() => { const i = S.shortage.lists[0].items[0]; return i.top && i.op === 'Montáž' && !i.code && i.ean === '8590000000011' && i.name === 'Díl s tabulátorem'; }), 'text ze schránky: sloupce sedí (i buňka v uvozovkách), kód chybí');
  // Ctrl+V v hledání nic nevloží
  await page.focus('#shQ');
  await page.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', 'a\tb\tc'); document.querySelector('#shQ').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
  check(await page.evaluate(() => S.shortage.lists.length) === 2, 'vložení do hledání seznam nepřidá');
  await saved(page);
  await page.click('#shView [data-shdel]');
  await confirm(page);
  await page.waitForFunction(() => S.shortage.lists.length === 1);
  await saved(page);

  // Úpravy položek (2.28): poslední záznamy ze schránky, poznámka, odebrání, přesouvání a PDF.
  // Záznamy jsou text oddělený tabulátory (A QR kód, B datum a čas, C ks, D stav); kód ITEMS[5] dvakrát (platí novější), jeden kód mimo seznam.
  // dlouhý stav (2.28.1): v PDF se řádek zvětší a vypíše celý
  const LONG_STATE = 'Čeká na materiál od dodavatele, náhradní díl je objednaný, dodávka na sklad haly 2 ve čtvrtek ráno, potom hned na broušení a kontrolu rozměrů';
  const recText = ['QR kód\tDatum a čas\tPočet ks\tStav',
    `${ITEMS[0].code}\t22.10.2026 9:15\t40\tBroušení hotovo`,
    `${ITEMS[3].code}\t22.10.2026 10:05\t12\t${LONG_STATE}`,
    `${ITEMS[5].code}\t22.10.2026 07:30\t3\tStarší záznam`,
    `${ITEMS[5].code}\t22.10.2026 11:40\t8\tMontáž`,
    '99999.111111.22222\t22.10.2026 9:00\t1\tNení v seznamu'].join('\r\n') + '\r\n';
  await paste('', recText);
  await page.waitForFunction(() => S.shortage.lists[0].items.filter(i => i.rec).length === 3);
  const rmsg = await page.textContent('#shMsg');
  check(/nový záznam u 3 položek/.test(rmsg) && /1 kód v seznamu není: 99999\.111111\.22222/.test(rmsg) && await page.evaluate(() => S.shortage.lists.length) === 1, `vložení posledních záznamů (nový seznam nevznikne): ${rmsg}`);
  const recOf = code => page.evaluate(c => { const i = S.shortage.lists[0].items.find(x => x.code === c); return i && i.rec && [i.rec.qty, i.rec.state, i.rec.when]; }, code);
  check(JSON.stringify(await recOf(ITEMS[5].code)) === JSON.stringify(['8', 'Montáž', '22. 10. 2026 11:40']), `novější záznam téhož kódu: ${JSON.stringify(await recOf(ITEMS[5].code))}`);
  check(/Broušení hotovo/.test(await page.textContent(`#shView tbody tr:nth-child(5)`)) && /40 ks/.test(await page.textContent(`#shView tbody tr:nth-child(5)`)), 'poslední záznam v tabulce');
  check(/Poslední záznam\s*3/.test(await page.textContent('#shView .stats')), 'dlaždice Poslední záznam');
  await saved(page);
  // poznámka k položce (Enter uloží)
  const noteSel = `#shView [data-shnote="${await page.evaluate(c => S.shortage.lists[0].items.find(x => x.code === c).id, ITEMS[0].code)}"]`;
  await page.fill(noteSel, '  Volat   dodavatele  ');
  await page.press(noteSel, 'Enter');
  await page.waitForFunction(c => S.shortage.lists[0].items.find(x => x.code === c).note === 'Volat dodavatele', ITEMS[0].code);
  check(await page.inputValue(noteSel) === 'Volat dodavatele', 'poznámka bez zbytečných mezer');
  await saved(page);
  // odebrání položky (EAN s nulami)
  await page.click(`#shView tr:has-text("0012345678905") [data-shdelitem]`);
  await page.waitForSelector('#dlg[open]');
  check(/0012345678905/.test(await page.textContent('#dlg')), 'potvrzení odebrání jmenuje položku');
  await page.click('#dlgOk');
  await page.waitForFunction(() => S.shortage.lists[0].items.length === 24 && document.querySelectorAll('#shView tbody tr').length === 24);
  check(!(await page.evaluate(() => S.shortage.lists[0].items.some(i => i.ean === '0012345678905'))), 'položka odebraná');
  await saved(page);
  // přetažení myší: ITEMS[2] (6. řádek) nad ITEMS[0] (5. řádek, první mimo TOP)
  const ids = () => page.evaluate(() => S.shortage.lists[0].items.map(i => i.ean));
  const rowBox = async idx => { const r = page.locator('#shView tbody tr').nth(idx); await r.scrollIntoViewIfNeeded(); return r.boundingBox(); };
  const drag = async (from, toY) => {
    const b = await rowBox(from);
    const x = b.x + b.width * 0.42, y = b.y + b.height / 2;   // sloupec Index: žádné pole ani odkaz
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 8, { steps: 2 });
    await page.mouse.move(x, toY, { steps: 12 });
    await page.waitForTimeout(60);
    const marked = await page.locator('#shView tr.sh-drop-before, #shView tr.sh-drop-after').count();
    await page.mouse.up();
    return marked;
  };
  check((await ids())[5] === ITEMS[2].ean && (await ids())[4] === ITEMS[0].ean, `výchozí pořadí: ${(await ids()).slice(3, 7)}`);
  const t4 = await rowBox(4);
  const marked = await drag(5, t4.y + 6);
  await page.waitForFunction(e => S.shortage.lists[0].items[4].ean === e, ITEMS[2].ean);
  check(marked === 1, 'při tažení je vidět, kam položka padne');
  check((await ids())[5] === ITEMS[0].ean && await page.locator('#shView tbody tr').nth(4).getAttribute('data-shid') === await page.evaluate(() => S.shortage.lists[0].items[4].id), 'přetažení myší změní pořadí v datech i v tabulce');
  await saved(page);
  // běžná položka nejde nad TOP SHORTAGE
  const seventh = (await ids())[6];
  const t0 = await rowBox(0);
  await drag(6, t0.y + 4);
  await page.waitForFunction(e => S.shortage.lists[0].items[4].ean === e, seventh);
  check((await ids()).slice(0, 4).join() === ORDERED.slice(0, 4).map(x => x.ean).join(), `TOP zůstanou nahoře, běžná položka skončí hned pod nimi: ${(await ids()).slice(0, 6)}`);
  const afterTop = await ids();
  // šipkou na úchytu o jedno nahoru
  const gripId = await page.evaluate(() => S.shortage.lists[0].items[7].id);
  await page.focus(`#shView [data-shgrip="${gripId}"]`);
  await page.keyboard.press('ArrowUp');
  await page.waitForFunction(id => S.shortage.lists[0].items[6].id === id, gripId);
  check(await page.evaluate(id => document.activeElement && document.activeElement.dataset.shgrip === id, gripId), 'po přesunu šipkou zůstane fokus na úchytu');
  check((await ids())[7] === afterTop[6], 'šipka nahoru prohodí se sousedem');
  // při hledání se nepřesouvá
  await page.fill('#shQ', 'hřídel');
  check(await page.evaluate(() => document.querySelector('#shView table.sh-tab').classList.contains('sh-nodrag')), 'při hledání je přesouvání vypnuté');
  await page.fill('#shQ', '');
  await saved(page);
  await page.screenshot({ path: path.join(shots, '03b-upravy.png'), fullPage: true });
  // PDF s poznámkou, záznamy a novým pořadím; jen odstíny šedé (černobílý tisk)
  const pdf2 = await download(page, '[data-shpdf]', 'shortage-upravy.pdf');
  const info2 = pdfInfo(pdf2.path);
  if (info2) {
    const text2 = info2.map(p => p.text).join(' ').replace(/\s+/g, ' ');
    ['Volat dodavatele', 'Broušení hotovo · 40 ks', 'Montáž · 8 ks', '22. 10. 2026 11:40', 'Operace · poslední', '24 položek', `${LONG_STATE} · 12 ks`, '22. 10. 2026 10:05'].forEach(t => check(text2.includes(t), `PDF úprav obsahuje „${t}“`));
    check(!text2.includes('0012345678905'), 'odebraná položka v PDF není');
    check(text2.indexOf(ITEMS[2].order) < text2.indexOf(ITEMS[0].order), 'PDF má pořadí podle přesunu');
    const gray = spawnSync('python3', ['-c', `import sys, pymupdf
d = pymupdf.open(sys.argv[1]); worst = 0
for p in d:
    pix = p.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5), colorspace=pymupdf.csRGB); s = pix.samples
    for i in range(0, len(s), 3):
        r, g, b = s[i], s[i + 1], s[i + 2]
        worst = max(worst, abs(r - g), abs(g - b), abs(r - b))
print(worst)`, pdf2.path], { encoding: 'utf8', maxBuffer: 1 << 26 });
    if (gray.status === 0) check(+gray.stdout.trim() <= 3, `PDF jen v odstínech šedé (největší rozdíl barevných složek ${gray.stdout.trim()})`);
    spawnSync('python3', ['-c', `import pymupdf,sys
d=pymupdf.open(sys.argv[1]); d[0].get_pixmap(matrix=pymupdf.Matrix(2,2)).save(sys.argv[2]+'/pdf-upravy-1.png')`, pdf2.path, shots]);
  }

  // Poddíly z výrobního plánu (2.29): 2. list, A EAN sestavy, E EAN poddílu s odkazem, H index, M objednávka, AM operace.
  // Plán vyrobí SheetJS v prohlížeči: 2 000 řádků výplně, odkazy u E (vložené i vzorec HYPERLINK), EAN sestavy i jako číslo.
  const PL = c => `http://is.example/commission.production.detail/default/1?activeBarcode=${c}&componentProductionId=2`;
  const planB64 = await page.evaluate(async ([items, links]) => {
    const X = await xlsx();
    const row = (a, e, h, m, op) => { const r = Array(39).fill(''); r[0] = a; r[1] = 'Sestava'; r[4] = e; r[5] = 'Poddíl'; r[7] = h; r[12] = m; r[38] = op; return r; };
    const aoa = [row('EAN sestavy', 'EAN poddílu', 'Index', 'Objednávka', 'Probíhající operace')];
    for (let i = 0; i < 2000; i += 1) aoa.push(row(String(8597000000000 + i), String(8598000000000 + i), 'Z', `OBJ-9-${i}`, i % 3 ? 'Broušení – hala 2' : 'Montáž'));
    const add = (a, e, h, m, op) => { aoa.push(row(a, e, h, m, op)); return aoa.length - 1; };
    const r1 = add(items[0].ean, '8594000009001', items[0].index, items[0].order, 'Broušení – hala 2');
    const r2 = add(items[0].ean, '8594000009001', items[0].index, items[0].order, 'Leštění - hala 2');
    const r3 = add(items[0].ean, '8594000009002', items[0].index, items[0].order, 'Frézování VF-11');
    add(items[0].ean, '8594000009003', items[0].index, items[0].order, 'Montáž');
    const r5 = add(Number(items[3].ean), '8594000009004', items[3].index, items[3].order, 'Brush Hala 2');
    add(items[3].ean, '8594000009005', items[3].index, items[3].order, 'Label Hala 2');            // bez odkazu
    add(items[5].ean, '8594000009006', items[5].index, items[5].order, 'Lakování');                 // jen jiná operace
    add(items[2].ean, '8594000009007', 'X', items[2].order, 'Brush Hala 2');                        // jiný index
    const r9 = add('8591111111111', '8591111119999', 'B', 'OBJ-77', 'Odjehlení hala 2');           // pro odpolední seznam
    const ws = X.utils.aoa_to_sheet(aoa);
    const E = r => ws[X.utils.encode_cell({ r, c: 4 })];
    E(r1).l = { Target: links.a }; E(r2).l = { Target: links.a }; E(r5).l = { Target: links.b }; E(r9).l = { Target: links.c };
    E(r3).f = `HYPERLINK("${links.f}","8594000009002")`;
    ws[X.utils.encode_cell({ r: r5, c: 0 })] = { t: 'n', v: Number(items[3].ean) };
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Výrobní plán – hlavní list'], ['nic', 'tu', 'není']]), 'Plán');
    X.utils.book_append_sheet(wb, ws, 'Poddíly');
    const bytes = new Uint8Array(X.write(wb, { bookType: 'xlsx', type: 'array' }));
    let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); }); return btoa(bin);
  }, [[ITEMS[0], ITEMS[1], ITEMS[2], ITEMS[3], ITEMS[4], ITEMS[5]], { a: PL('70001.900001.10001'), b: PL('70004.900004.10004'), c: PL('1.2.4'), f: PL('70002.900002.10002') }]);
  const planFile = { name: 'vyrobni-plan.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(planB64, 'base64') };
  const parentOf = ean => page.evaluate(e => { const i = S.shortage.lists[0].items.find(x => x.ean === e); return i && { id: i.id, subs: i.subs.map(s => [s.ean, s.code, s.op, s.note, s.rec && s.rec.state]) }; }, ean);
  await page.setInputFiles('#shPlanFile', planFile);
  await page.waitForFunction(() => S.shortage.lists[0].plan && /Výrobní plán/.test(document.querySelector('#shMsg').textContent) && !/Čtu výrobní plán/.test(document.querySelector('#shMsg').textContent), null, { timeout: 30000 });
  const pmsg2 = (await page.textContent('#shMsg')).replace(/\s+/g, ' ');
  check(/list Poddíly, 2[\s ]?010 řádků/.test(pmsg2) && /4 poddíly u 2 sestav/.test(pmsg2) && /1 poddíl nemá u EANu odkaz/.test(pmsg2) && /U 1 sestavy jsou v plánu poddíly jen s jinou operací/.test(pmsg2), `poddíly z plánu: ${pmsg2}`);
  const p0 = await parentOf(ITEMS[0].ean), p3 = await parentOf(ITEMS[3].ean);
  check(JSON.stringify(p0.subs) === JSON.stringify([['8594000009001', '70001.900001.10001', 'Broušení – hala 2 · Leštění - hala 2', '', null], ['8594000009002', '70002.900002.10002', 'Frézování VF-11', '', null]]), `poddíly sestavy (vložený odkaz, víc operací, vzorec HYPERLINK): ${JSON.stringify(p0.subs)}`);
  check(JSON.stringify(p3.subs) === JSON.stringify([['8594000009004', '70004.900004.10004', 'Brush Hala 2', '', null], ['8594000009005', '', 'Label Hala 2', '', null]]), `poddíly TOP sestavy (EAN v plánu číslem, jeden bez odkazu): ${JSON.stringify(p3.subs)}`);
  check(!(await parentOf(ITEMS[5].ean)).subs.length && !(await parentOf(ITEMS[2].ean)).subs.length, 'jiná operace ani jiný index poddíl nevloží');
  const after0 = await page.evaluate(id => { const tr = document.querySelector(`#shView tr[data-shid="${id}"]`); return [tr.nextElementSibling.dataset.shparent, tr.nextElementSibling.nextElementSibling.dataset.shparent, tr.nextElementSibling.textContent.includes('PODDÍL')]; }, p0.id);
  check(after0[0] === p0.id && after0[1] === p0.id && after0[2], 'poddíly jsou v tabulce hned pod sestavou');
  check(await page.locator('#shView tr.sh-sub').count() === 4 && /Poddíly podle výrobního plánu vyrobni-plan\.xlsx/.test(await page.textContent('#shView .sh-planinfo')), 'čtyři řádky poddílů a údaj o plánu');
  await saved(page);
  await page.screenshot({ path: path.join(shots, '03c-poddily.png'), fullPage: true });
  // poznámka a poslední záznam u poddílu
  const subId = await page.evaluate(e => S.shortage.lists[0].items.find(x => x.ean === e).subs[0].id, ITEMS[0].ean);
  await page.fill(`#shView [data-shnote="${subId}"]`, 'Brusič ví');
  await page.press(`#shView [data-shnote="${subId}"]`, 'Enter');
  await page.waitForFunction(id => shEntry(S.shortage.lists[0], id).entry.note === 'Brusič ví', subId);
  await saved(page);
  await paste('', '70001.900001.10001\t22.10.2026 12:30\t5\tBrus hotový\r\n');
  await page.waitForFunction(id => (shEntry(S.shortage.lists[0], id).entry.rec || {}).state === 'Brus hotový', subId);
  check(/nový záznam u 1 položky/.test(await page.textContent('#shMsg')), `záznam u poddílu: ${await page.textContent('#shMsg')}`);
  await saved(page);
  // stejný plán podruhé přes SheetJS (záloha pro xls a ods): stejné poddíly, poznámka i záznam zůstanou
  await page.evaluate(() => { window.SH_PLAN_SHEETJS = true; });
  await page.setInputFiles('#shPlanFile', planFile);
  await page.waitForFunction(() => /4 poddíly u 2 sestav/.test(document.querySelector('#shMsg').textContent), null, { timeout: 30000 });
  await page.evaluate(() => { window.SH_PLAN_SHEETJS = false; });
  const p0b = await parentOf(ITEMS[0].ean);
  check(JSON.stringify(p0b.subs) === JSON.stringify([['8594000009001', '70001.900001.10001', 'Broušení – hala 2 · Leštění - hala 2', 'Brusič ví', 'Brus hotový'], ['8594000009002', '70002.900002.10002', 'Frézování VF-11', '', null]]), `SheetJS dá stejné poddíly, poznámka a záznam zůstanou: ${JSON.stringify(p0b.subs)}`);
  await saved(page);
  // sestava se přesune i s poddíly (šipka na úchytu)
  await page.focus(`#shView [data-shgrip="${p0.id}"]`);
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(id => { const tr = document.querySelector(`#shView tr[data-shid="${id}"]`); return tr && tr.previousElementSibling && !tr.previousElementSibling.dataset.shparent; }, p0.id).catch(() => {});
  check(await page.evaluate(id => { const tr = document.querySelector(`#shView tr[data-shid="${id}"]`); return tr.nextElementSibling.dataset.shparent === id && tr.nextElementSibling.nextElementSibling.dataset.shparent === id; }, p0.id), 'poddíly zůstanou pod přesunutou sestavou');
  await saved(page);
  // odebrání poddílu
  const sub2 = await page.evaluate(e => S.shortage.lists[0].items.find(x => x.ean === e).subs[1].id, ITEMS[3].ean);
  await page.click(`#shView [data-shdelsub="${sub2}"]`);
  await confirm(page);
  await page.waitForFunction(e => S.shortage.lists[0].items.find(x => x.ean === e).subs.length === 1, ITEMS[3].ean);
  await saved(page);
  // PDF s poddíly
  const pdf3 = await download(page, '[data-shpdf]', 'shortage-poddily.pdf');
  const info3 = pdfInfo(pdf3.path);
  if (info3) {
    const text3 = info3.map(p => p.text).join(' ').replace(/\s+/g, ' ');
    ['PODDÍL', 'EAN 8594000009001', '70001.900001.10001', 'Broušení – hala 2 · Leštění - hala 2', 'Frézování VF-11', 'Brus hotový · 5 ks', 'Brusič ví', '3 poddíly', 'EAN 8594000009004'].forEach(t => check(text3.includes(t), `PDF s poddíly obsahuje „${t}“`));
    check(!text3.includes('8594000009005'), 'odebraný poddíl v PDF není');
    check(text3.indexOf('EAN 8594000009001') > text3.indexOf(ITEMS[0].order) && text3.indexOf('EAN 8594000009001') < text3.indexOf(ITEMS[0].ean) + 400, 'poddíl je v PDF u své sestavy');
    spawnSync('python3', ['-c', `import pymupdf,sys
d=pymupdf.open(sys.argv[1]); d[0].get_pixmap(matrix=pymupdf.Matrix(2,2)).save(sys.argv[2]+'/pdf-poddily-1.png')`, pdf3.path, shots]);
  }

  // Další seznam (poddíly z plánu v paměti okna se doplní samy), přepnutí na starší a smazání.
  const small = await page.evaluate(async () => {
    const X = await xlsx();
    const ws = X.utils.aoa_to_sheet([['Číslo objednávky', 'Název dílu', 'EAN', 'Index', 'Urgentní množství'], ['OBJ-77', 'Víko skříně', '8591111111111', 'B', 3]]);
    ws.C2.l = { Target: 'http://is.example/commission.production.detail/default/1?activeBarcode=1.2.3&componentProductionId=2' };
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'List1');
    const bytes = new Uint8Array(X.write(wb, { bookType: 'xlsx', type: 'array' }));
    let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); }); return btoa(bin);
  });
  await page.setInputFiles('#shFile', { name: 'odpoledne.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(small, 'base64') });
  await page.waitForFunction(() => S.shortage.lists.length === 2 && document.querySelector('#shView .sh-card h2').textContent.includes(shWhen(S.shortage.lists[0])));
  check(/Nahráno 1 položka ze souboru odpoledne\.xlsx\./.test(await page.textContent('#shMsg')) && /Poddíly podle výrobního plánu vyrobni-plan\.xlsx.*1 poddíl u 1 sestavy/.test((await page.textContent('#shMsg')).replace(/\s+/g, ' ')), `druhý import s poddíly z plánu v paměti: ${await page.textContent('#shMsg')}`);
  check(await page.evaluate(() => JSON.stringify(S.shortage.lists[0].items[0].subs.map(s => [s.ean, s.code]))) === JSON.stringify([['8591111119999', '1.2.4']]), 'poddíl nového seznamu');
  check(await page.locator('#shView .sh-lists .chip').count() === 2 && await page.locator('#shView tbody tr[data-shid]').count() === 1, 'dva seznamy, ukázaný je nejnovější');
  await page.click('#shView .sh-lists .chip:nth-child(2)');
  await page.waitForFunction(() => document.querySelectorAll('#shView tbody tr[data-shid]').length === 24 && document.querySelectorAll('#shView tbody tr.sh-sub').length === 3);
  check(true, 'přepnutí na starší seznam');
  await page.screenshot({ path: path.join(shots, '03-dva-seznamy.png'), fullPage: true });
  await saved(page);
  await page.click('#shView [data-shdel]');
  await confirm(page);
  await page.waitForFunction(() => S.shortage.lists.length === 1 && document.querySelectorAll('#shView tbody tr[data-shid]').length === 1);
  check(true, 'smazání seznamu');
  await saved(page);
  const log = await page.evaluate(() => S.log.filter(x => x.kind === 'shortage').map(x => x.text));
  check(log.some(t => /^Shortage: nahrán seznam .*\(25 položek, z toho 4 TOP, shortage-22-10\.xlsx\)$/.test(t)) && log.some(t => /^Shortage: nahrán seznam .*\(1 položka, odpoledne\.xlsx\)$/.test(t))
    && log.some(t => /^Shortage: nahrán seznam .*\(2 položky, z toho 1 TOP, vloženo ze schránky\)$/.test(t)) && log.some(t => /^Shortage: smazán seznam .*24 položek/.test(t))
    && log.some(t => /^Shortage: ze seznamu .* odebrána položka 0012345678905 Ložisko 6204-2RS$/.test(t)) && log.some(t => /^Shortage: poznámka k položce 8594000000101 Hřídel předlohová \(seznam .*\): Volat dodavatele$/.test(t))
    // záznamy k témuž seznamu se v historii sloučí do posledního vložení (u 1 položky = poddílu)
    && log.some(t => /^Shortage: poslední záznamy u 1 položky seznamu /.test(t)) && log.some(t => /^Shortage: změněno pořadí položek v seznamu /.test(t))
    && log.some(t => /^Shortage: poddíly z výrobního plánu vyrobni-plan\.xlsx u seznamu .*: 4 poddíly u 2 sestav$/.test(t)) && log.some(t => /^Shortage: poznámka k poddílu 8594000009001 u položky .*: Brusič ví$/.test(t))
    && log.some(t => /^Shortage: odebrán poddíl 8594000009005 u položky /.test(t)), `historie změn: ${JSON.stringify(log)}`);

  // CSV nemá odkazy.
  await page.setInputFiles('#shFile', { name: 'seznam.csv', mimeType: 'text/csv', buffer: Buffer.from('EAN;Název\n123;Díl\n') });
  await page.waitForFunction(() => /CSV neobsahuje hypertextové odkazy/.test(document.querySelector('#shMsg').textContent));
  check(await page.evaluate(() => S.shortage.lists.length) === 1, 'CSV se nenahraje');

  // Užší monitor: stránka nepřeteče, širokou tabulku jde posunout v kartě.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(200);
  check(await overflow(page) <= 1, `monitor 1280 px: přetečení stránky ${await overflow(page)} px`);
  // Telefon.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => showView('shortage'));
  await page.waitForSelector('#view-shortage.on table.sh-tab');
  await page.waitForTimeout(200);
  check(await overflow(page) <= 1, `telefon: přetečení ${await overflow(page)} px`);
  await page.screenshot({ path: path.join(shots, '04-telefon.png'), fullPage: true });
  await page.click('#brandHome');
  await page.waitForSelector('#view-domu.on');
  if (await page.isHidden('#homeView .home-open')) await page.click('[data-hshift="both"]');
  check(/1 položka/.test(await page.textContent('#homeView .home-menu [data-go="shortage"]')), 'Shortage v hlavním menu telefonu');
  await page.click('#homeView .home-menu [data-go="shortage"]');
  await page.waitForFunction(() => ui.view === 'shortage');
  await page.setViewportSize({ width: 1440, height: 900 });

  // Tmavý režim.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => { ui.sh.open = S.shortage.lists[0].id; renderShortage(); });
  await page.waitForTimeout(600);   // doběhne náběh karet po vykreslení
  await page.screenshot({ path: path.join(shots, '05-tmavy.png'), fullPage: true });

  await browser.close();
  if (problems.length) { console.log(`PROBLÉMY (${problems.length}):\n- ${problems.join('\n- ')}`); process.exit(1); }
  console.log('e2e Shortage ok');
})().catch(async error => {
  console.error(error);
  if (problems.length) console.log(problems.join('\n'));
  if (global.lastPage) await global.lastPage.screenshot({ path: `${shots}/zz-error.png`, fullPage: true }).catch(() => {});
  process.exit(1);
});
