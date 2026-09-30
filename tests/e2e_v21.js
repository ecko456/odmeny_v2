// Prohlížečový průchod novinkami verze 2.1: navýšení platu podle úrovně a splněných podmínek
// (docházka, plnění normy, využití fondu), import evidence práce se stráveným časem a normou
// (výběr sloupců), pozice jen s Kafe a pravidla do PDF. Spuštění stejně jako e2e_browser.js:
//   ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t odmeny_v2 odmeny_v2/dev-router.php &
//   curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state
//   NO_PROXY=127.0.0.1 PW=$(npm root -g)/playwright S=$S node odmeny_v2/tests/e2e_v21.js
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const XLSX = require('../private/vendor/xlsx.full.min.js');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-v21');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };
const PEOPLE = [['Jiří', 'Šťastný'], ['Eva', 'Nováková'], ['Petr', 'Dvořák'], ['Lucie', 'Černá']];

function attendanceCsv(year, month) {
  const count = new Date(year, month, 0).getDate();
  const days = Array.from({ length: count }, (_, i) => `${i + 1}.${month}.${year}`);
  const head = ['Jméno', 'Příjmení', 'Os. č.', 'Středisko', 'Pozn.', ...days].join(';');
  const rows = PEOPLE.map(([first, last], p) => [first, last, 100 + p, 'D1', '', ...days.map((_, i) => {
    const dow = new Date(year, month - 1, i + 1).getDay();
    if (dow === 0 || dow === 6) return '';
    if (p === 3 && i > 18) return '';
    return '7,5';
  })].join(';'));
  return [head, ...rows].join('\r\n');
}

/** Evidence práce: hlavička na 2. řádku, norma v minutách. První soubor má jen ID zaměstnance
 *  a čas jako čas Excelu (h:mm), druhý jména, čas v minutách a sloupec navíc na začátku. */
function productionXlsx(file, extraColumn = false) {
  const excelTime = !extraColumn;
  const head = [...(extraColumn ? ['Stroj'] : []), 'Zakázka', extraColumn ? 'Pracovník' : 'ID zaměstnance', 'Datum', 'Kusy', 'Strávený čas (min)', 'Norma (min)'];
  const rows = [['Export evidence práce – srpen 2026'], head];
  const speed = [1.12, 0.97, 1.0, 0.8];
  const busy = [0.9, 0.85, 0.8, 0.6];
  for (let d = 1; d <= 31; d += 1) {
    const dow = new Date(2026, 7, d).getDay();
    if (dow === 0 || dow === 6) continue;
    PEOPLE.forEach(([first, last], p) => {
      if (p === 3 && d > 19) return;
      const spent = Math.round(450 * busy[p]);
      rows.push([...(extraColumn ? ['CNC1'] : []), `Z${d}${p}`, extraColumn ? `${first} ${last}` : 101 + p, new Date(Date.UTC(2026, 7, d, 8)), 10 + p, excelTime ? spent / 1440 : spent, Math.round(spent * speed[p])]);
    });
  }
  const ws = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
  if (excelTime) Object.keys(ws).filter(k => /^E\d+$/.test(k) && typeof ws[k].v === 'number').forEach(k => { ws[k].z = '[h]:mm'; });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Evidence');
  fs.writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

async function watch(page, label) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  page.on('response', r => { if (r.status() >= 400) problems.push(`${label} HTTP ${r.status()} ${r.url()}`); });
  page.on('pageerror', err => problems.push(`${label} pageerror: ${err.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`));
  });
}
const saved = page => page.waitForFunction(() => document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 10000 });

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await watch(page, 'v21');
  await page.goto(BASE);
  await page.waitForSelector('#setupForm');
  await page.fill('[name="token"]', fs.readFileSync(process.env.TOKEN_FILE || path.join(S, 'odme2e', 'setup-token.txt'), 'utf8').trim());
  await page.fill('[name="label"]', 'Vedoucí dílny');
  await page.click('#setupForm button[type="submit"]');
  await page.waitForSelector('.odm-card');
  const key = (await page.textContent('.odm-card .card-key')).trim();
  await page.check('#saved');
  await page.click('#finish');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');

  // Docházka, zařazení: Šťastný, Nováková a Dvořák na CNC (úroveň 4, 3, 2), Černá na Kontrolu.
  await page.click('#nav [data-view="dochazka"]');
  const csv = path.join(S, 'v21-dochazka.csv');
  fs.writeFileSync(csv, attendanceCsv(2026, 8));
  await page.setInputFiles('#file', csv);
  await page.waitForSelector('#importMsg .note');
  if (await page.isVisible('#dlg[open]')) await page.click('#dlgOk');
  await page.waitForTimeout(300);
  await page.click('#nav [data-view="lide"]');
  const levels = { 'Šťastný': [1, 4], 'Nováková': [1, 3], 'Dvořák': [1, 2], 'Černá': [2, 3] };
  for (let i = 0; i < 4; i += 1) {
    const item = page.locator('#lList .list-item').nth(i);
    const text = await item.textContent();
    const [pos, lvl] = Object.entries(levels).find(([name]) => text.includes(name))[1];
    await item.click();
    await page.selectOption('#pPos', { index: pos });
    await page.locator('#lDetail .lvlopt').nth(lvl - 1).click();
  }
  await saved(page);

  // Seznam ID v Nastavení (Černá záměrně bez ID, spáruje se ručně ve Výrobě).
  await page.click('#nav [data-view="nastaveni"]');
  const ids = path.join(S, 'v21-id.csv');
  fs.writeFileSync(ids, 'Příjmení;Jméno;ID\r\nŠťastný;Jiří;101\r\nNováková;Eva;102\r\nDvořák;Petr;103\r\nNeznámý;Pan;999\r\n');
  await page.setInputFiles('#idFile', ids);
  await page.waitForSelector('#idMsg .note');
  const idMsg = await page.textContent('#idMsg');
  check(/Nově přiřazeno 3/.test(idMsg) && /Neznámý Pan/.test(idMsg), `import ID: ${idMsg}`);
  check(/3<\/b> z 4|3 z 4/.test(await page.innerHTML('#setIds')), 'počet lidí s ID');
  await page.screenshot({ path: `${shots}/00-ids.png`, fullPage: true });

  // Evidence práce: první import se zeptá na sloupce, druhý stejného formátu už ne.
  const xlsxFile = path.join(S, 'v21-evidence.xlsx');
  productionXlsx(xlsxFile);
  await page.click('#nav [data-view="vyroba"]');
  await page.setInputFiles('#pfile', xlsxFile);
  await page.waitForSelector('#dlg[open] #prodColsPreview');
  const picked = await page.evaluate(() => ['name', 'date', 'ks', 'spent', 'norm'].map(n => document.querySelector(`#dlg [name="${n}"]`).value));
  check(JSON.stringify(picked) === JSON.stringify(['1', '2', '3', '4', '5']), `odhad sloupců: ${picked}`);
  const preview = await page.textContent('#prodColsPreview');
  check(/Použitelných řádků 76 /.test(preview) && /Plnění normy/.test(preview), `náhled importu: ${preview}`);
  await page.screenshot({ path: `${shots}/01-columns.png` });
  await page.click('#dlgOk');
  await page.waitForSelector('#prodMsg .note.i');
  check(/Strávený čas a norma načteny/.test(await page.textContent('#prodMsg')), 'import nenačetl čas a normu');
  await page.setInputFiles('#pfile', xlsxFile);
  await page.waitForTimeout(600);
  check(!(await page.isVisible('#dlg[open]')), 'stejný formát se znovu ptá na sloupce');
  await saved(page);
  // ID 104 nikomu nepatří: ruční spárování ho uloží Černé.
  const unmatched = await page.textContent('#prodPair');
  check(/ID 104/.test(unmatched), `nespárované ID: ${unmatched.slice(0, 200)}`);
  const pairRow = page.locator('#prodPair .pair-row', { hasText: 'ID 104' });
  await pairRow.locator('[data-pairsel]').selectOption({ label: 'Černá Lucie' });
  await pairRow.locator('[data-pairgo]').click();
  await saved(page);
  check(!(await page.locator('#prodPair .pair-row').count()), 'po spárování zůstalo nespárované ID');
  check(await page.evaluate(() => S.employees['cerna|lucie'].wid) === '104', 'ruční spárování neuložilo ID k člověku');
  await page.screenshot({ path: `${shots}/02-vyroba.png`, fullPage: true });
  const vyroba = await page.textContent('#prodView');
  check(/Plnění normy/.test(vyroba) && /Využití fondu/.test(vyroba), 'výroba bez plnění normy a využití');

  // Navýšení platu u CNC: úroveň 2 +5 %, 3 +10 %, 4 +15 %; podmínky docházka 90, norma 95/100/110, využití 70/75/80.
  await page.click('#nav [data-view="pozice"]');
  await page.locator('#posList .list-item').first().click();
  const conf = [[5, 90, 95, 70], [10, 90, 100, 75], [15, 90, 110, 80]];
  for (const [i, [raise, att, norm, use]] of conf.entries()) {
    const row = page.locator(`#posEditor [data-li="${i + 1}"]`);
    await row.locator('[data-lraise]').fill(String(raise));
    await row.locator('[data-lraise]').dispatchEvent('change');
    for (const [f, v] of [['minAtt', att], ['minNorm', norm], ['minUse', use]]) {
      const input = page.locator(`#posEditor [data-li="${i + 1}"] [data-lmin="${f}"]`);
      await input.fill(String(v));
      await input.dispatchEvent('change');
    }
  }
  await page.locator('#posList .list-item').nth(1).click();
  await page.check('#posOnlyKafe');
  await saved(page);
  await page.screenshot({ path: `${shots}/03-positions.png`, fullPage: true });
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#btnRulesPdf')]);
  const pdfPath = path.join(S, 'v21-pravidla.pdf');
  await pdf.saveAs(pdfPath);
  const bytes = fs.readFileSync(pdfPath);
  check(bytes.slice(0, 5).toString() === '%PDF-' && bytes.length > 20000, `PDF: ${bytes.length} B`);
  check(bytes.includes('Identity-H'), 'PDF bez vloženého písma s diakritikou');

  // Přehled: Šťastný (4, norma 112 %, využití 90 %) +15 %, Nováková (3, norma 90 %) spadne na +5 % z úrovně 2,
  // Dvořák (2, norma 100 %, využití 80 %) +5 %, Černá jen Kafe.
  await page.click('#nav [data-view="prehled"]');
  await page.waitForTimeout(300);
  const plat = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#ovBody tr[data-key]')].map(tr => [tr.dataset.key, (tr.querySelector('.col-raise') || {}).textContent || ''])));
  check(/\+15/.test(plat['stastny|jiri'] || ''), `Šťastný: ${plat['stastny|jiri']}`);
  check(/\+5/.test(plat['novakova|eva'] || '') && /ú\. 2/.test(plat['novakova|eva'] || ''), `Nováková: ${plat['novakova|eva']}`);
  check(/\+5/.test(plat['dvorak|petr'] || ''), `Dvořák: ${plat['dvorak|petr']}`);
  const kafeRow = await page.textContent('#ovBody tr[data-key="cerna|lucie"]');
  check(/jen Kafe/.test(kafeRow), 'Černá: chybí „jen Kafe“');
  await page.screenshot({ path: `${shots}/04-overview.png`, fullPage: true });
  await page.click('#ovBody tr[data-key="novakova|eva"] td.col-name');
  await page.waitForSelector('#ovBody tr.detail');
  const detail = await page.textContent('#ovBody tr.detail');
  check(/Podmínky úrovně 3/.test(detail) && /plnění normy 97/.test(detail), `detail navýšení: ${detail.slice(0, 300)}`);
  await page.screenshot({ path: `${shots}/05-detail.png`, fullPage: true });

  // Historie změn zná navýšení a jen Kafe.
  await page.click('#logBtn');
  await page.waitForSelector('#logList .log-item');
  const log = await page.textContent('#logList');
  check(/navýšení platu/.test(log) && /jen Kafe/.test(log), `historie nezná navýšení nebo jen Kafe: ${log.slice(0, 600)}`);
  await page.click('#dlgCancel');

  // Soubor s jinou hlavičkou se zeptá znovu.
  const other = path.join(S, 'v21-evidence-2.xlsx');
  productionXlsx(other, true);
  await page.click('#nav [data-view="vyroba"]');
  await page.setInputFiles('#pfile', other);
  await page.waitForSelector('#dlg[open] #prodColsPreview');
  await page.click('#dlgCancel');

  // Profil a mobil.
  await page.click('#nav [data-view="matice"]');
  await page.locator('#matrixView [data-profile]').first().click();
  await page.waitForSelector('#view-profil.on');
  const profile = await page.textContent('#profileView');
  check(/Navýšení platu/.test(profile), 'profil bez navýšení platu');
  await page.screenshot({ path: `${shots}/06-profile.png`, fullPage: true });
  const m = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' })).newPage();
  await watch(m, 'mobil');
  await m.goto(BASE);
  await m.waitForSelector('#manual');
  await m.click('#manual');
  await m.fill('[name="key"]', key);
  await m.click('#keyForm button[type="submit"]');
  await m.waitForSelector('#skip');
  await m.click('#skip');
  await m.waitForSelector('#view-prehled.on');
  await m.waitForTimeout(400);
  await m.screenshot({ path: `${shots}/07-m-overview.png`, fullPage: true });
  await m.click('#nav [data-view="pozice"]');
  await m.locator('#posList .list-item').first().click();
  await m.waitForTimeout(300);
  await m.screenshot({ path: `${shots}/08-m-position.png`, fullPage: true });
  const mOverflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(mOverflow <= 1, `mobil: vodorovné přetečení ${mOverflow}px`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 1, `vodorovné přetečení ${overflow}px`);

  await browser.close();
  if (problems.length) {
    console.error('PROBLÉMY:\n' + problems.join('\n'));
    process.exit(1);
  }
  console.log('e2e v2.1 ok');
})().catch(error => { console.error('FAIL', error); console.log(problems.join('\n')); process.exit(1); });
