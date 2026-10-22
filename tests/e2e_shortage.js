// Prohlížečový průchod modulem Shortage (verze 2.27): import Excelu (A EAN s vloženým odkazem,
// B název dílu, C číslo objednávky, D index, E urgentní množství), titulek a hlavička nad daty,
// EAN s nulami na začátku, vzorec HYPERLINK, řádky bez odkazu a s odkazem, který není webová
// adresa, druhý list v sešitu, hledání, PDF na šířku (text, odkazy, QR kódy přečtené zpátky
// z vykresleného PDF), další seznam, přepnutí, smazání, historie změn, CSV, telefon a tmavý režim.
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

// 25 vymyšlených dílů: odkaz vložený v buňce EAN, u 3. položky vzorec HYPERLINK, 5. a 12. bez
// odkazu, 9. s odkazem na síťový disk (file:), 2. EAN jako číslo s nulami na začátku.
const NAMES = ['Hřídel předlohová', 'Ložisko 6204-2RS', 'Těsnění víka převodovky', 'Šroub M8×25 DIN 912', 'Pružina tlačná', 'Kryt řemene', 'Čep páky', 'Matice samojistná M10', 'Příruba čerpadla', 'Ozubené kolo z = 32'];
const ITEMS = Array.from({ length: 25 }, (_, i) => {
  const ean = i === 1 ? '0012345678905' : String(8594000000000 + 101 * (i + 1));
  const link = i === 4 || i === 11 ? '' : i === 8 ? 'file:///\\\\server\\vykresy\\dil-9.pdf' : `https://erp.example.cz/dil/${ean}?sklad=H2&poradi=${i + 1}`;
  return { ean, link, name: `${NAMES[i % NAMES.length]}${i >= 10 ? ` ${Math.floor(i / 10) + 1}` : ''}`, order: `OBJ-2026-${String(4100 + i).padStart(5, '0')}`, index: 'ABCD'[i % 4], qty: i === 2 ? 1200 : (i * 7) % 50 + 1 };
});

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
  check(/Zatím žádný seznam/.test(await page.textContent('#shView')) && /sloupci A EAN/.test(await page.textContent('#shView')), 'prázdný stav s popisem sloupců');
  await page.screenshot({ path: path.join(shots, '01-prazdny.png') });

  // Sešit Excelu vyrobí SheetJS v prohlížeči: titulek, hlavička, 25 položek a druhý list.
  const xlsxB64 = await page.evaluate(async items => {
    const X = await xlsx();
    const ws = X.utils.aoa_to_sheet([['Shortage HALA 2 – 22. 10. 2026'], [], ['EAN', 'Název dílu', 'Číslo objednávky', 'Index', 'Urgentní množství']]);
    items.forEach((it, i) => {
      const r = i + 3;
      const a = X.utils.encode_cell({ r, c: 0 });
      ws[a] = i === 1 ? { t: 'n', v: Number(it.ean), z: '0000000000000' } : { t: 's', v: it.ean };
      if (i === 2) ws[a].f = `HYPERLINK("${it.link}","${it.ean}")`;
      else if (it.link) ws[a].l = { Target: it.link, Tooltip: 'Detail dílu' };
      ws[X.utils.encode_cell({ r, c: 1 })] = { t: 's', v: it.name };
      ws[X.utils.encode_cell({ r, c: 2 })] = { t: 's', v: it.order };
      ws[X.utils.encode_cell({ r, c: 3 })] = { t: 's', v: it.index };
      ws[X.utils.encode_cell({ r, c: 4 })] = { t: 'n', v: it.qty };
    });
    ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: items.length + 2, c: 4 } });
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
  check(/Nahráno 25 položek ze souboru shortage-22-10\.xlsx \(list Shortage\)/.test(msg), `zpráva o importu: ${msg}`);
  check(/2 položky nemají v EAN odkaz/.test(msg) && /1 položka má odkaz, který není webová adresa/.test(msg), `upozornění na odkazy: ${msg}`);
  const st = await page.evaluate(() => S.shortage.lists.map(l => ({ n: l.items.length, file: l.file, sheet: l.sheet, by: l.by, items: l.items })));
  check(st.length === 1 && st[0].n === 25 && st[0].sheet === 'Shortage' && st[0].by === 'Vedoucí skladu', `uložený seznam: ${JSON.stringify(st.map(x => [x.n, x.sheet, x.by]))}`);
  const it = st[0].items;
  check(it[1].ean === '0012345678905', `EAN s nulami na začátku: ${it[1].ean}`);
  check(it[0].link === ITEMS[0].link && it[2].link === ITEMS[2].link, 'odkaz vložený v buňce i vzorec HYPERLINK');
  check(!it[4].link && !it[8].link && !it[11].link, 'bez odkazu a s odkazem file: → bez QR');
  check(it[2].qty === '1 200' && it[0].qty === '1' && it[0].order === 'OBJ-2026-04100' && it[0].index === 'A', `množství a objednávka: ${JSON.stringify(it[2])}`);
  check(await page.locator('#shView tbody tr').count() === 25, 'tabulka má 25 řádků');
  const a0 = page.locator('#shView tbody tr').first().locator('a');
  check(await a0.getAttribute('href') === ITEMS[0].link && await a0.getAttribute('target') === '_blank' && /noopener/.test(await a0.getAttribute('rel')), 'EAN v tabulce otevře odkaz v nové kartě');
  check(/Bez odkazu\s*3/.test(await page.textContent('#shView .stats')), 'dlaždice: 3 bez odkazu');
  await page.screenshot({ path: path.join(shots, '02-seznam.png'), fullPage: true });

  // Hledání v seznamu.
  await page.fill('#shQ', 'ložisko');
  check(await page.locator('#shView tbody tr:not([hidden])').count() === 3, 'hledání najde tři ložiska');
  await page.fill('#shQ', '04117');
  check(await page.locator('#shView tbody tr:not([hidden])').count() === 1, 'hledání podle čísla objednávky');
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
    ['Chybějící díly', 'Stav k 10:00', 'Stav k 13:00', 'Poznámky', 'Urgentní', 'Číslo objednávky', 'QR kód', '0012345678905', 'Těsnění víka převodovky', 'Šroub M8×25 DIN 912', 'OBJ-2026-04124', '1 200', 'bez odkazu', 'Strana 4 / 4']
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
      const bad = got.filter(g => (ITEMS[g.i].link && g.i !== 8 ? g.text !== ITEMS[g.i].link : g.text !== null));
      check(!bad.length, `QR kódy v PDF nesou odkaz z EANu (špatně: ${JSON.stringify(bad.slice(0, 3))})`);
      check(got.filter(g => g.text).length === 22, `přečteno ${got.filter(g => g.text).length} QR kódů z 22`);
    } else console.log('PyMuPDF chybí, QR v PDF se nekontroluje');
    spawnSync('python3', ['-c', `import pymupdf,sys
d=pymupdf.open(sys.argv[1])
for i in (0, 3): d[i].get_pixmap(matrix=pymupdf.Matrix(2,2)).save(sys.argv[2]+f'/pdf-strana-{i+1}.png')`, pdf.path, shots]);
  } else console.log('pypdf ani PyMuPDF nejsou, text PDF se nekontroluje');

  // Další seznam, přepnutí na starší a smazání.
  await page.evaluate(() => { const l = S.shortage.lists[0]; l.at -= 3 * 3600 * 1000; });   // první seznam je „ráno“
  await saved(page).catch(() => {});
  const small = await page.evaluate(async () => {
    const X = await xlsx();
    const ws = X.utils.aoa_to_sheet([['EAN', 'Název dílu', 'Číslo objednávky', 'Index', 'Urgentní množství'], ['8591111111111', 'Víko skříně', 'OBJ-77', 'B', 3]]);
    ws.A2.l = { Target: 'https://erp.example.cz/dil/8591111111111' };
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
  check(log.some(t => /^Shortage: nahrán seznam .*\(25 položek, shortage-22-10\.xlsx\)$/.test(t)) && log.some(t => /^Shortage: nahrán seznam .*\(1 položka, odpoledne\.xlsx\)$/.test(t)) && log.some(t => /^Shortage: smazán seznam .*25 položek/.test(t)), `historie změn: ${JSON.stringify(log)}`);

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
