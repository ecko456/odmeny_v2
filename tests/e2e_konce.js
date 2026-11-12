// Prohlížečový průchod 2.43: import konců trestů a směnnosti v Docházce (A příjmení, B jméno,
// C konec trestu, D směnnost), kontrola řádků (prohozené jméno, chybné datum, neznámá směnnost,
// duplicita, nový člověk), zápis do Lidí, modul Konce trestů (dlaždice, oddělení × měsíce,
// měsíce s lidmi, po termínu, Excel), konec trestu u člověka, telefon a tmavý režim.
// Hodiny stránky stojí na úterý 3. 11. 2026. Všechna data jsou vymyšlená.
// Spuštění stejně jako e2e_dochazka.js; snímky v $S/oshots-konce.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-konce');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };
const NOW = new Date(2026, 10, 3, 10, 0);

async function watch(page, label) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  page.on('response', r => { if (r.status() >= 400) problems.push(`${label} HTTP ${r.status()} ${r.url()}`); });
  page.on('pageerror', err => problems.push(`${label} pageerror: ${err.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`));
  });
}
const saved = page => page.waitForFunction(() => !store.dirty && !store.saving && document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 15000 });
async function confirm(page) {
  await page.waitForSelector('#dlg[open]');
  await page.click('#dlgOk');
  await page.waitForFunction(() => !document.querySelector('#dlg[open]'));
}
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const text = async (page, sel) => (await page.textContent(sel)).replace(/\s+/g, ' ').trim();

async function makeXlsx(page, sheets) {
  const b64 = await page.evaluate(async sheets => {
    const X = await xlsx();
    const wb = X.utils.book_new();
    sheets.forEach(({ name, rows, dateRow, dateCol }) => {
      const aoa = rows.map(r => r.map(c => (c && c.d ? new Date(Date.UTC(2026, c.m || 10, c.d, 12)) : c)));
      const ws = X.utils.aoa_to_sheet(aoa);
      // datum v hlavičce docházky: celé číslo dne s formátem data (jako v Excelu)
      if (dateRow != null) rows[dateRow].forEach((c, k) => { if (typeof c === 'number' && k) ws[X.utils.encode_cell({ r: dateRow, c: k })].z = 'd.m.yyyy'; });
      if (dateCol != null) rows.forEach((r, i) => { const a = X.utils.encode_cell({ r: i, c: dateCol }); if (r[dateCol] && r[dateCol].d) ws[a].z = 'd.m.yyyy'; });
      X.utils.book_append_sheet(wb, ws, name);
    });
    const bytes = new Uint8Array(X.write(wb, { bookType: 'xlsx', type: 'array' }));
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, sheets);
  return Buffer.from(b64, 'base64');
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.clock.setFixedTime(NOW);
  const page = await ctx.newPage();
  await watch(page, 'konce');
  await page.goto(BASE);
  await page.waitForSelector('#setupForm');
  await page.fill('[name="token"]', fs.readFileSync(process.env.TOKEN_FILE || path.join(S, 'odme2e', 'setup-token.txt'), 'utf8').trim());
  await page.fill('[name="label"]', 'Mistr haly');
  await page.click('#setupForm button[type="submit"]');
  await page.waitForSelector('.odm-card');
  await page.check('#saved');
  await page.click('#finish');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');
  await saved(page);
  await page.evaluate(() => {
    const st = blank();
    const grp = (id, name, dept) => { const p = mkPos(id, name, []); p.dept = dept; p.skillset = [{ id: `k${id}`, name: 'Obsluha', desc: '', scale: null }]; p.maxTab = 8; p.tiers = []; return p; };
    st.positions = [grp('g_brus', 'Brus', 'Broušení'), grp('g_cnc', 'CNC', 'Obrobna')];
    const emp = (last, first, g, wid, x) => { const key = `${norm(last)}|${norm(first)}`; st.employees[key] = { key, last, first, positionId: g, shift: 'R', note: '', wid, ...(x || {}) }; };
    emp('Adámek', 'Aleš', 'g_brus', '101', { rate: { kg_brus: 4 } }); emp('Ředitel', 'Radek', 'g_brus', '901', { lead: ['Broušení'], end: '2026-11-20' }); emp('Bednář', 'Boris', 'g_brus', '102', { sick: '2026-10-20' }); emp('Cibulka', 'Cyril', 'g_brus', '103');
    emp('Fiala', 'Filip', 'g_cnc', '201'); emp('Gregor', 'Gustav', 'g_cnc', '202'); emp('Havel', 'Hugo', 'g_cnc', '203', { end: '2026-10-20' });
    S = sanitizeState(st);
    save(); renderAll();
  });
  await saved(page);
  const ser = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5;
  const rows = [['Příjmení', 'Jméno', 'Konec trestu', 'Směnnost'],
    ['Adámek', 'Aleš', ser(2026, 11, 25), 'Skupina 1'],
    ['Bednář', 'Boris', '15.01.2027', 'Stálá odpolední'],
    ['Cyril', 'Cibulka', ser(2027, 1, 31), 'NEMOC'],
    ['Fiala', 'Filip', ser(2026, 12, 4), 'Skupina 2'],
    ['Gregor', 'Gustav', 'neznámo', 'noční'],
    ['Nový', 'Ondřej', ser(2027, 3, 1), 'Stálá ranní']];
  const file = { name: 'konce-trestu.xlsx', mimeType: XLSX_TYPE, buffer: await makeXlsx(page, [{ name: 'List1', rows }]) };

  // 1) Docházka: tlačítko, dialog s kontrolou
  await page.click('#nav [data-view="dochazka"]');
  check(await page.isVisible('#btnEnds'), 'tlačítko v Docházce');
  await page.setInputFiles('#endFile', file);
  await page.waitForSelector('#dlg[open] .end-sum');
  const d1 = await text(page, '#dlgBody');
  check(/Řádků\s*6/.test(d1) && /Noví\s*1/.test(d1) && /Chyby\s*1/.test(d1), `souhrn: ${d1.slice(0, 300)}`);
  for (const re of [/jméno a příjmení jsou prohozené/, /„neznámo“ není datum/, /„noční“ neznám/, /v Lidech není, přidá se/]) check(re.test(d1), `kontrola řádků ${re}: ${d1.slice(0, 900)}`);
  check(/Neznámé texty ve směnnosti/.test(d1) && /1 člověk z Lidí v souboru není/.test(d1), `neznámý text a chybějící lidé: ${d1.slice(0, 600)}`);
  await page.screenshot({ path: path.join(shots, '01-dialog.png') });
  // ruční převod neznámého textu: noční → Stálá odpolední
  await page.selectOption('#dlg [data-endl="nocni"]', 'O');
  await page.waitForFunction(() => /Chyby1/.test(document.querySelector('#endBody').textContent.replace(/\s+/g, '')));
  check(!/„noční“ neznám/.test(await text(page, '#endBody')), 'po převodu už neznámý text není chyba');
  check(/1 člověk z Lidí v souboru není/.test(await text(page, '#endBody')), 'upozornění na chybějící');
  await page.click('#dlgOk');
  // 2.44.1: tabulka lidí, kteří v souboru nejsou; poprvé nikoho nevyřadit
  await page.waitForFunction(() => document.querySelector('#dlg[open] .end-extab'));
  const ex1 = await page.evaluate(() => ({ rows: [...document.querySelectorAll('#dlg .end-extab tbody tr')].map(r => r.textContent.replace(/\s+/g, ' ').trim()), ok: document.querySelector('#dlgOk').disabled, title: document.querySelector('#dlgTitle').textContent }));
  check(ex1.rows.length === 1 && /Havel Hugo/.test(ex1.rows[0]) && /ID 203/.test(ex1.rows[0]) && /Obrobna/.test(ex1.rows[0]) && /20\. 10\. 2026/.test(ex1.rows[0]) && ex1.ok === true, `tabulka chybějících: ${JSON.stringify(ex1)}`);
  await page.click('#dlg [data-endex="all"]');
  check(await page.isChecked('#dlg input[name="ex"]') && !(await page.isDisabled('#dlgOk')), 'Vybrat všechny');
  await page.click('#dlg [data-endex="none"]');
  check(!(await page.isChecked('#dlg input[name="ex"]')) && await page.isDisabled('#dlgOk'), 'Zrušit výběr');
  await page.screenshot({ path: path.join(shots, '01b-chybejici.png') });
  await page.click('#dlgCancel');
  await page.waitForSelector('#view-konce.on');
  await saved(page);
  const st = await page.evaluate(() => Object.fromEntries(Object.values(S.employees).map(e => [e.last, [e.end || '', e.shift || '', e.sick || '', e.positionId || '']])));
  check(JSON.stringify(st['Adámek']) === '["2026-11-25","S1","","g_brus"]', `Adámek: ${st['Adámek']}`);
  check(JSON.stringify(st['Bednář']) === '["2027-01-15","O","","g_brus"]', `Bednář zpět po nemoci: ${st['Bednář']}`);
  check(JSON.stringify(st['Cibulka']) === '["2027-01-31","R","2026-11-03","g_brus"]', `Cibulka prohozené jméno a nemoc: ${st['Cibulka']}`);
  check(JSON.stringify(st['Gregor']) === '["","O","","g_cnc"]', `Gregor: chybné datum nic, směna z ručního převodu: ${st['Gregor']}`);
  check(JSON.stringify(st['Nový']) === '["2027-03-01","R","",""]', `nový člověk: ${st['Nový']}`);
  const log = await page.evaluate(() => S.log.map(x => x.text).join(' | '));
  check(/Nahrány konce trestů a směnnost \(konce-trestu\.xlsx\)/.test(log), `historie: ${log.slice(-300)}`);

  // 2) Konce trestů
  const v = await text(page, '#endView');
  check(/Teď lidí\s*7/.test(v) && /Odchází tento měsíc\s*1/.test(v) && /Do 3 měsíců\s*4/.test(v) && /Po termínu\s*1/.test(v) && /Bez data\s*1/.test(v), `dlaždice: ${v.slice(0, 400)}`);
  const grid = await page.evaluate(() => [...document.querySelectorAll('.end-grid tbody tr')].map(r => [...r.children].map(c => c.textContent.trim())));
  check(JSON.stringify(grid[0].slice(0, 7)) === '["Broušení","3","0","·","1","·","2"]', `Broušení: ${grid[0]}`);
  check(grid[1][0] === 'Obrobna' && grid[1][3] === '1' && grid[1][5] === '1', `Obrobna: ${grid[1]}`);
  check(/listopad 2026/i.test(v) && /Adámek Aleš/.test(v) && /za 22 d/.test(v) && /Havel Hugo/.test(v) && /před 14 d/.test(v), `měsíce a lidé: ${v.slice(0, 900)}`);
  // 2.45.2: vedoucí se v Koncích trestů neukazuje, u lidí je vidět zkušenost
  check(!/Ředitel|Vedoucí/.test(v) && !grid.some(r => r[0] === 'Vedoucí'), `bez vedoucích: ${grid.map(r => r[0])}`);
  check(/ID 101 · Brus · zaškolený 100 %/.test(v), `zkušenost u člověka: ${v.slice(0, 900)}`);
  await page.screenshot({ path: path.join(shots, '02-konce.png'), fullPage: true });
  await page.click('[data-endn="24"]');
  check(await page.locator('.end-grid thead th').count() === 2 + 1 + 24 + 2, 'období 24 měsíců');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-endxlsx]')]);
  const xp = path.join(shots, dl.suggestedFilename());
  await dl.saveAs(xp);
  const xl = await page.evaluate(async b64 => { const X = await xlsx(); const wb = X.read(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), { type: 'array' }); return wb.SheetNames.map(n => [n, X.utils.sheet_to_json(wb.Sheets[n], { header: 1 }).length]); }, fs.readFileSync(xp).toString('base64'));
  check(dl.suggestedFilename() === 'konce-trestu-2026-11-03.xlsx' && JSON.stringify(xl) === '[["Po měsících",7],["Lidé",8]]', `Excel: ${dl.suggestedFilename()} ${JSON.stringify(xl)}`);
  // 2.45.2: PDF graficky, bez jmen (jen ID), bez vedoucích
  const [dp] = await Promise.all([page.waitForEvent('download'), page.click('[data-endpdf]')]);
  const pp = path.join(shots, dp.suggestedFilename());
  await dp.saveAs(pp);
  check(dp.suggestedFilename() === 'konce-trestu-2026-11-03.pdf' && fs.readFileSync(pp).slice(0, 5).toString() === '%PDF-', `PDF: ${dp.suggestedFilename()}`);
  try {
    const txt = execFileSync('python3', ['-c', 'import sys,pypdf;print("\\n".join(p.extract_text() for p in pypdf.PdfReader(sys.argv[1]).pages))', pp]).toString().replace(/\s+/g, ' ');
    for (const t of ['KONCE TRESTŮ', 'Kdo odchází a kdo zůstane', 'Odchody po měsících', 'Oddělení', 'Zaškolení', 'V zácviku', 'Kdo odchází', 'ID 101', 'Zaškolený · 100 %', 'po termínu', 'Broušení', 'Obrobna', '1 / 2', '2 / 2'])
      check(txt.includes(t), `PDF obsahuje „${t}“: ${txt.slice(0, 300)}`);
    check(!/Adámek|Bednář|Havel|Fiala|Ředitel|Vedoucí|ID 901/.test(txt), `PDF bez jmen a vedoucích: ${txt.slice(0, 600)}`);
  } catch (error) { if (/pypdf/.test(String(error))) console.log('pypdf není, text PDF se nekontroluje'); else problems.push(`PDF: ${error.message}`); }
  try {
    execFileSync('python3', ['-c', `import sys
try:
    import pymupdf
except ImportError:
    sys.exit(0)
d=pymupdf.open(sys.argv[1])
for i,p in enumerate(d): p.get_pixmap(matrix=pymupdf.Matrix(1.5,1.5)).save(sys.argv[2]+'/pdf-%d.png'%(i+1))`, pp, shots]);
  } catch (error) { problems.push(`PDF stránky: ${String(error.stderr || error.message).slice(-300)}`); }
  // přechod na člověka a konec trestu v detailu
  await page.click('[data-endperson="adamek|ales"]');
  await page.waitForSelector('#view-lide.on #pEnd');
  check(await page.inputValue('#pEnd') === '2026-11-25', 'konec trestu v detailu');
  await page.fill('#pEnd', '2026-12-31');
  await page.click('#pNote');
  await saved(page);
  check(await page.evaluate(() => S.employees["adamek|ales"].end) === '2026-12-31', 'úprava data u člověka');
  check(await page.evaluate(() => !S.employees['havel|hugo'].excluded), 'Nikoho nevyřazovat: Havel zůstal');

  // 2.44.1: znovu stejný soubor, Havla vyřadit
  await page.click('#nav [data-view="dochazka"]');
  await page.setInputFiles('#endFile', file);
  await page.waitForSelector('#dlg[open] .end-sum');
  await page.click('#dlgOk');
  await page.waitForFunction(() => document.querySelector('#dlg[open] .end-extab'));
  await page.check('#dlg input[name="ex"][value="havel|hugo"]');
  check(/vybráno k vyřazení 1/.test(await text(page, '#endExN')), 'počet vybraných');
  await page.click('#dlgOk');
  await page.waitForSelector('#view-konce.on');
  await saved(page);
  check(await page.evaluate(() => S.employees['havel|hugo'].excluded === true && !S.employees['fiala|filip'].excluded), 'Havel vyřazen, ostatní ne');
  const log2 = await page.evaluate(() => S.log.map(x => x.text).join(' | '));
  check(/vyřazeno ze seznamu 1/.test(log2) && /Havel Hugo vyřazen ze seznamu/.test(log2), `historie vyřazení: ${log2.slice(-400)}`);
  check(/Teď lidí\s*6/.test(await text(page, '#endView')) && !/Havel Hugo/.test(await text(page, '#endView')), 'vyřazený v Koncích trestů není');
  // třetí nahrání: vyřazený už v tabulce není, okno se neukáže
  await page.click('#nav [data-view="dochazka"]');
  await page.setInputFiles('#endFile', file);
  await page.waitForSelector('#dlg[open] .end-sum');
  check(!/z Lidí v souboru není/.test(await text(page, '#endBody')), 'vyřazený se znovu nenabízí');
  await page.click('#dlgOk');
  await page.waitForSelector('#view-konce.on');
  check(!(await page.isVisible('#dlg[open]')), 'bez chybějících se tabulka neukáže');

  // 2.75.1: párování jmen – velká písmena, bez diakritiky, celé jméno v jednom sloupci, druhé jméno, překlep, ručně
  const rows3 = [['Příjmení', 'Jméno', 'Konec trestu', 'Směnnost'],
    ['ADÁMEK', 'Aleš ', ser(2027, 2, 1), 'Skupina 1'],
    ['Bednar', 'Boris', ser(2027, 2, 2), 'Stálá odpolední'],
    ['Cibulka Cyril', '', ser(2027, 2, 3), 'Skupina 2'],
    ['Fiala', 'Filip Josef', ser(2027, 2, 4), 'Skupina 1'],
    ['Gregr', 'Gustav', ser(2027, 2, 5), 'Skupina 1'],
    ['Xaver', 'Zikmund', ser(2027, 2, 6), 'Stálá ranní']];
  const before3 = await page.evaluate(() => Object.keys(S.employees).length);
  await page.click('#nav [data-view="dochazka"]');
  await page.setInputFiles('#endFile', { name: 'konce-jmena.xlsx', mimeType: XLSX_TYPE, buffer: await makeXlsx(page, [{ name: 'List1', rows: rows3 }]) });
  await page.waitForSelector('#dlg[open] .end-sum');
  const d3 = await text(page, '#endBody');
  check(/Spárováno s Lidmi: přesně 2 · jinak zapsané jméno 1 · část jména 1 · podobné jméno 1 · bez páru 1/.test(d3), `souhrn párování: ${d3.slice(0, 500)}`);
  check(/podobné jméno \(překlep\?\), spáruje se s Gregor Gustav/.test(d3) && /spáruje se s Cibulka Cyril/.test(d3) && /spáruje se s Fiala Filip/.test(d3) && !/chybí jméno/.test(d3), `kontrola párování: ${d3.slice(0, 900)}`);
  check(await page.locator('#dlg select[data-enda]').count() === 4, `výběr Přiřadit k u řádků, které nesedí přesně: ${await page.locator('#dlg select[data-enda]').count()}`);
  check(await page.$eval('#dlg select[data-enda="6"]', s => s.value) === 'gregor|gustav', 'překlep předvybraný v nabídce');
  await page.screenshot({ path: path.join(shots, '02-parovani.png') });
  await page.selectOption('#dlg select[data-enda="7"]', 'novy|ondrej');
  await page.waitForFunction(() => /ručně 1/.test(document.querySelector('#endBody').textContent) && !/bez páru/.test(document.querySelector('#endBody').textContent));
  check(/Noví\s*0/.test(await text(page, '#endBody')) && /ručně přiřazeno, spáruje se s Nový Ondřej/.test(await text(page, '#endBody')), `ruční přiřazení: ${(await text(page, '#endBody')).slice(0, 400)}`);
  await page.click('#dlgOk');
  await page.waitForSelector('#view-konce.on');
  await saved(page);
  const e3 = await page.evaluate(() => ['adamek|ales', 'bednar|boris', 'cibulka|cyril', 'fiala|filip', 'gregor|gustav', 'novy|ondrej'].map(k => [S.employees[k].end, S.employees[k].shift || '']));
  check(JSON.stringify(e3) === JSON.stringify([['2027-02-01', 'S1'], ['2027-02-02', 'O'], ['2027-02-03', 'S2'], ['2027-02-04', 'S1'], ['2027-02-05', 'S1'], ['2027-02-06', 'R']]), `zápis po párování: ${JSON.stringify(e3)}`);
  check(await page.evaluate(() => Object.keys(S.employees).length) === before3, 'nikdo nový nepřibyl');

  // 2.75.2: chybějícím lidem přidělit řádek souboru (jsou tam pod jiným jménem), nadpis uprostřed souboru
  const rows4 = [['Příjmení', 'Jméno', 'Konec trestu', 'Směnnost'],
    ['Adámek', 'Aleš', ser(2027, 3, 1), 'Skupina 1'],
    ['Bednář', 'Boris', ser(2027, 3, 2), 'Stálá odpolední'],
    ['Cibulka', 'Cyril', ser(2027, 3, 3), 'Skupina 2'],
    ['Zaměstnanec', '', '', ''],
    ['Fiala F.', '', ser(2027, 3, 6), 'Skupina 2'],
    ['Gregorová', 'Gustava', ser(2027, 3, 7), 'Stálá ranní'],
    ['Nový', 'Ondřej', ser(2027, 3, 8), 'Stálá ranní'],
    ['Kovář', 'Pavel', ser(2027, 3, 9), 'Skupina 1']];
  // člověk, kterého dřívější import založil z buňky s datem („Invalid Date“)
  await page.evaluate(() => { S.employees['sasak|invalid date'] = { key: 'sasak|invalid date', last: 'SASÁK', first: 'Invalid Date', positionId: null, level: null, note: '' }; save(); });
  await saved(page);
  const before4 = await page.evaluate(() => Object.keys(S.employees).length);
  await page.click('#nav [data-view="dochazka"]');
  await page.setInputFiles('#endFile', { name: 'konce-chybi.xlsx', mimeType: XLSX_TYPE, buffer: await makeXlsx(page, [{ name: 'List1', rows: rows4 }]) });
  await page.waitForSelector('#dlg[open] .end-sum');
  const d4 = await text(page, '#endBody');
  check(/Řádků\s*7/.test(d4) && !/Zaměstnanec\s/.test(d4.replace(/Příjmení a jméno · přiřadit k/, '')) && /Přidat 2 nových lidí do Lidí \(bez skupiny, zařadíš je potom\): Gregorová Gustava, Kovář Pavel/.test(d4), `nadpis uprostřed se přeskočí, noví vyjmenovaní: ${d4.slice(0, 700)}`);
  await page.click('#dlgOk');
  await page.waitForFunction(() => document.querySelector('#dlg[open] .end-extab td.end-asg'));
  const ex4 = await page.evaluate(() => [...document.querySelectorAll('#dlg .end-extab tbody tr')].map(r => ({ name: r.querySelector('td.name b').textContent, sel: r.querySelector('select[name="ea"]').value, opts: [...r.querySelectorAll('select[name="ea"] optgroup[label="Návrh"] option')].map(o => o.textContent), hint: !!r.querySelector('.end-hint'), ex: r.querySelector('input[name="ex"]').disabled })));
  const fia = ex4.find(x => x.name === 'Fiala Filip'), gre = ex4.find(x => x.name === 'Gregor Gustav');
  const bad4 = ex4.find(x => x.name === 'SASÁK Invalid Date');
  check(bad4 && await page.isChecked('#dlg input[name="ex"][value="sasak|invalid date"]') && /chybné jméno z dřívějšího importu/.test(await text(page, '#dlg .end-badname')), `chybné jméno předvybrané k vyřazení: ${JSON.stringify(bad4)}`);
  check(ex4.length === 3 && fia && fia.sel === '6' && fia.hint && fia.ex && /Řádek 6: Fiala F\. · 6\. 3\. 2027 · Skupina 2/.test(fia.opts[0] || ''), `Fiala: jistý návrh předvybraný: ${JSON.stringify(ex4)}`);
  check(gre && gre.sel === '' && !gre.hint && !gre.ex && gre.opts.some(o => /Řádek 7: Gregorová Gustava/.test(o)), `Gregor: jen návrh, nic předvybrané: ${JSON.stringify(gre)}`);
  check(await page.textContent('#dlgOk') === 'Přidělit a vyřadit' && !(await page.isDisabled('#dlgOk')), `tlačítko: ${await page.textContent('#dlgOk')}`);
  // dvakrát stejný řádek: okno to nedovolí
  await page.selectOption('#dlg select[data-eakey="gregor|gustav"]', '6');
  await page.click('#dlgOk');
  await page.waitForSelector('#dlg[open] .dlg-error');
  check(/Řádek 6 je přidělený dvěma lidem/.test(await text(page, '#dlg .dlg-error')), `kontrola dvojího přidělení: ${await text(page, '#dlg .dlg-error')}`);
  await page.selectOption('#dlg select[data-eakey="gregor|gustav"]', '7');
  check(/vybráno k vyřazení 1 · přiděleno 2/.test(await text(page, '#endExN')) && !(await page.$('#dlg .dlg-error')), `počet přidělených, chyba pryč: ${await text(page, '#endExN')}`);
  await page.screenshot({ path: path.join(shots, '02b-chybejici-prideleni.png') });
  await page.click('#dlgOk');
  await page.waitForSelector('#view-konce.on');
  await saved(page);
  check(await page.evaluate(() => S.employees['sasak|invalid date'].excluded === true), 'chybné jméno vyřazené');
  const e4 = await page.evaluate(() => ({ fiala: [S.employees['fiala|filip'].end, S.employees['fiala|filip'].shift], gregor: [S.employees['gregor|gustav'].end, S.employees['gregor|gustav'].shift], names: Object.values(S.employees).map(e => `${e.last} ${e.first}`) }));
  check(JSON.stringify(e4.fiala) === JSON.stringify(['2027-03-06', 'S2']) && JSON.stringify(e4.gregor) === JSON.stringify(['2027-03-07', 'R']), `přidělené řádky zapsané: ${JSON.stringify(e4)}`);
  check(await page.evaluate(() => Object.keys(S.employees).length) === before4 + 1 && e4.names.includes('Kovář Pavel') && !e4.names.some(n => /Gregorová|Zaměstnanec/.test(n)), `nově jen Kovář Pavel: ${JSON.stringify(e4.names)}`);

  // 3) telefon a tmavý režim
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => showView('konce'));
  await page.waitForSelector('#view-konce.on .end-grid');
  check(await overflow(page) <= 0, `telefon bez přetečení: ${await overflow(page)}`);
  await page.screenshot({ path: path.join(shots, '03-telefon.png'), fullPage: true });
  await browser.close();
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
  console.log('konce ok');
})().catch(e => { console.error(e); process.exit(1); });
