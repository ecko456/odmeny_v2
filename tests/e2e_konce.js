// Prohlížečový průchod 2.43: import konců trestů a směnnosti v Docházce (A příjmení, B jméno,
// C konec trestu, D směnnost), kontrola řádků (prohozené jméno, chybné datum, neznámá směnnost,
// duplicita, nový člověk), zápis do Lidí, modul Konce trestů (dlaždice, oddělení × měsíce,
// měsíce s lidmi, po termínu, Excel), konec trestu u člověka, telefon a tmavý režim.
// Hodiny stránky stojí na úterý 3. 11. 2026. Všechna data jsou vymyšlená.
// Spuštění stejně jako e2e_dochazka.js; snímky v $S/oshots-konce.
const { chromium } = require(process.env.PW);
const fs = require('fs');
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
    emp('Adámek', 'Aleš', 'g_brus', '101'); emp('Bednář', 'Boris', 'g_brus', '102', { sick: '2026-10-20' }); emp('Cibulka', 'Cyril', 'g_brus', '103');
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
  check(/Neznámé texty ve směnnosti/.test(d1) && /Havel Hugo/.test(d1), `neznámý text a chybějící lidé: ${d1.slice(0, 600)}`);
  await page.screenshot({ path: path.join(shots, '01-dialog.png') });
  // ruční převod neznámého textu: noční → Stálá odpolední
  await page.selectOption('#dlg [data-endl="nocni"]', 'O');
  await page.waitForFunction(() => /Chyby1/.test(document.querySelector('#endBody').textContent.replace(/\s+/g, '')));
  check(!/„noční“ neznám/.test(await text(page, '#endBody')), 'po převodu už neznámý text není chyba');
  await page.click('#dlgOk');
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
  await page.screenshot({ path: path.join(shots, '02-konce.png'), fullPage: true });
  await page.click('[data-endn="24"]');
  check(await page.locator('.end-grid thead th').count() === 2 + 1 + 24 + 2, 'období 24 měsíců');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-endxlsx]')]);
  const xp = path.join(shots, dl.suggestedFilename());
  await dl.saveAs(xp);
  const xl = await page.evaluate(async b64 => { const X = await xlsx(); const wb = X.read(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), { type: 'array' }); return wb.SheetNames.map(n => [n, X.utils.sheet_to_json(wb.Sheets[n], { header: 1 }).length]); }, fs.readFileSync(xp).toString('base64'));
  check(dl.suggestedFilename() === 'konce-trestu-2026-11-03.xlsx' && JSON.stringify(xl) === '[["Po měsících",7],["Lidé",8]]', `Excel: ${dl.suggestedFilename()} ${JSON.stringify(xl)}`);
  // přechod na člověka a konec trestu v detailu
  await page.click('[data-endperson="adamek|ales"]');
  await page.waitForSelector('#view-lide.on #pEnd');
  check(await page.inputValue('#pEnd') === '2026-11-25', 'konec trestu v detailu');
  await page.fill('#pEnd', '2026-12-31');
  await page.click('#pNote');
  await saved(page);
  check(await page.evaluate(() => S.employees["adamek|ales"].end) === '2026-12-31', 'úprava data u člověka');

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
