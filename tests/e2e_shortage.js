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
    ['Chybějící díly', 'Stav k 10:00', 'Stav k 13:00', 'Poznámky', 'Urgentní', 'Číslo objednávky', 'Probíhající', 'QR kód', 'TOP SHORTAGE', '4 TOP SHORTAGE', '0012345678905', 'Těsnění víka převodovky', 'Šroub M8×25 DIN 912', 'OBJ-2026-04124', '1 200', 'CNC frézování', ITEMS[0].code, 'bez odkazu', 'odkaz bez activeBarcode', 'Strana 4 / 4']
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
  check(JSON.stringify(pl.items[0]) === JSON.stringify({ order: 'OBJ-2026-09001', name: 'Víko skříně velké', ean: '8591111111111', index: 'B', qty: '3', top: true, op: 'Lakování',
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

  // Další seznam, přepnutí na starší a smazání.
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
  check(/Nahráno 1 položka ze souboru odpoledne\.xlsx\./.test(await page.textContent('#shMsg')), `druhý import: ${await page.textContent('#shMsg')}`);
  check(await page.locator('#shView .sh-lists .chip').count() === 2 && await page.locator('#shView tbody tr').count() === 1, 'dva seznamy, ukázaný je nejnovější');
  await page.click('#shView .sh-lists .chip:nth-child(2)');
  await page.waitForFunction(() => document.querySelectorAll('#shView tbody tr').length === 25);
  check(true, 'přepnutí na starší seznam');
  await page.screenshot({ path: path.join(shots, '03-dva-seznamy.png'), fullPage: true });
  await saved(page);
  await page.click('#shView [data-shdel]');
  await confirm(page);
  await page.waitForFunction(() => S.shortage.lists.length === 1 && document.querySelectorAll('#shView tbody tr').length === 1);
  check(true, 'smazání seznamu');
  await saved(page);
  const log = await page.evaluate(() => S.log.filter(x => x.kind === 'shortage').map(x => x.text));
  check(log.some(t => /^Shortage: nahrán seznam .*\(25 položek, z toho 4 TOP, shortage-22-10\.xlsx\)$/.test(t)) && log.some(t => /^Shortage: nahrán seznam .*\(1 položka, odpoledne\.xlsx\)$/.test(t))
    && log.some(t => /^Shortage: nahrán seznam .*\(2 položky, z toho 1 TOP, vloženo ze schránky\)$/.test(t)) && log.some(t => /^Shortage: smazán seznam .*25 položek/.test(t)), `historie změn: ${JSON.stringify(log)}`);

  // CSV nemá odkazy.
  await page.setInputFiles('#shFile', { name: 'seznam.csv', mimeType: 'text/csv', buffer: Buffer.from('EAN;Název\n123;Díl\n') });
  await page.waitForFunction(() => /CSV neobsahuje hypertextové odkazy/.test(document.querySelector('#shMsg').textContent));
  check(await page.evaluate(() => S.shortage.lists.length) === 1, 'CSV se nenahraje');

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
