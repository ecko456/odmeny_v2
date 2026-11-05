// Prohlížečový průchod 2.48: nahrání docházky postaru (říjen 2026) s kontrolou jmen. Prohozené jméno
// a příjmení, překlep, neznámý člověk, člověk chybí v souboru, dvojí přiřazení, nikdo nový se nepřidá,
// jména v systému zůstanou, hodiny se přiřadí, historie, telefon. Data jsou vymyšlená.
// Spuštění stejně jako e2e_konce.js; snímky v $S/oshots-jmena.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-jmena');
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
  await watch(page, 'jmena');
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
    const p = mkPos('g_brus', 'Brus', []); p.dept = 'Broušení'; p.skillset = [{ id: 'kb', name: 'Obsluha', desc: '', scale: null }]; p.maxTab = 8; p.tiers = [];
    st.positions = [p];
    const emp = (last, first, x) => { const key = `${norm(last)}|${norm(first)}`; st.employees[key] = { key, last, first, positionId: 'g_brus', shift: 'R', note: 'poznámka', wid: '', ...(x || {}) }; };
    emp('Adámek', 'Aleš'); emp('Bednář', 'Boris'); emp('Cibulka', 'Cyril'); emp('Dvořák', 'Daniel'); emp('Fiala', 'Filip'); emp('Gregor', 'Gustav');
    S = sanitizeState(st);
    save(); renderAll();
  });
  await saved(page);
  const before = await page.evaluate(() => JSON.stringify(Object.values(S.employees).map(e => [e.key, e.first, e.last, e.note]).sort()));
  // A jméno, B příjmení, dny od F; Bednář prohozený, Cibulka s překlepem, Gregor prohozený bez diakritiky, Nový neznámý
  const head = ['Jméno', 'Příjmení', '', '', ''];
  for (let d = 1; d <= 31; d += 1) head.push(`${d}.10.2026`);
  const hrs = h => Array.from({ length: 31 }, (_, i) => ([0, 6].includes(new Date(2026, 9, i + 1).getDay()) ? null : h));
  const rows = [head,
    ['Aleš', 'Adámek', '', '', '', ...hrs(7.5)],
    ['Bednář', 'Boris', '', '', '', ...hrs(8)],
    ['Cyril', 'Cibulkaa', '', '', '', ...hrs(6)],
    ['Filip', 'Fiala', '', '', '', ...hrs(7)],
    ['Gregor', 'Gustav', '', '', '', ...hrs(5)],
    ['Ondřej', 'Nový', '', '', '', ...hrs(7.5)]];
  const file = { name: 'dochazka-rijen.xlsx', mimeType: XLSX_TYPE, buffer: await makeXlsx(page, [{ name: 'Docházka', rows }]) };

  await page.click('#nav [data-view="dochazka"]');
  await page.setInputFiles('#file', file);
  await page.waitForSelector('#dlg[open] .att-matchtab');
  const dlgText = await text(page, '#dlgBody');
  check(/Přesně sedí 2/.test(dlgText) && /prohozené jméno a příjmení 2/.test(dlgText) && /podobné jméno 1/.test(dlgText) && /nepřiřazeno 1/.test(dlgText), `souhrn: ${dlgText.slice(0, 300)}`);
  check(/1 člověk ze systému v souboru není/.test(dlgText) && /Dvořák Daniel/.test(dlgText), 'chybí v souboru');
  const sel = await page.evaluate(() => [...document.querySelectorAll('.att-matchtab tr[data-amrow]')].map(tr => [tr.querySelector('.name b').textContent, tr.querySelector('.tag').textContent, tr.querySelector('select').value]));
  check(JSON.stringify(sel) === JSON.stringify([['Ondřej Nový', 'v systému nenalezen', ''], ['Cyril Cibulkaa', 'podobné jméno (překlep)', 'cibulka|cyril'], ['Bednář Boris', 'prohozené jméno a příjmení', 'bednar|boris'], ['Gregor Gustav', 'prohozené jméno a příjmení', 'gregor|gustav']]), `řádky: ${JSON.stringify(sel)}`);
  await page.screenshot({ path: path.join(shots, '01-kontrola.png') });
  // stejný člověk dvakrát nejde
  await page.selectOption('select[name="am-0"]', 'adamek|ales');
  await page.click('#dlgOk');
  check(/přiřazený dvakrát/.test(await text(page, '#dlgBody')), 'hláška o dvojím přiřazení');
  // Nového nechat bez přiřazení
  await page.selectOption('select[name="am-0"]', '');
  await page.click('#dlgOk');
  await page.waitForFunction(() => !document.querySelector('#dlg[open]'));
  await page.waitForSelector('#importMsg .att-matchmsg', { timeout: 8000 });
  await saved(page);
  const after = await page.evaluate(() => {
    const p = S.periods['2026-10'];
    return { keys: Object.keys(p.rows).sort(), names: Object.values(p.rows).map(r => `${r.last} ${r.first}`).sort(), emps: JSON.stringify(Object.values(S.employees).map(e => [e.key, e.first, e.last, e.note]).sort()),
      bed: attendance(p, 'bednar|boris').workHours, cib: attendance(p, 'cibulka|cyril').workHours, log: (S.log.find(l => /Nahrána docházka/.test(l.text)) || {}).text };
  });
  check(JSON.stringify(after.keys) === JSON.stringify(['adamek|ales', 'bednar|boris', 'cibulka|cyril', 'fiala|filip', 'gregor|gustav']), `přiřazení: ${after.keys}`);
  check(after.emps === before, 'nikdo nový, jména ani poznámky v systému se nezměnily');
  check(after.bed === 21 * 8 && after.cib === 21 * 6, `hodiny: ${after.bed}, ${after.cib}`);
  check(/Nahrána docházka za říjen 2026/i.test(after.log || '') && /po kontrole jména 3/.test(after.log || '') && /nenahrané řádky: 1/.test(after.log || ''), `historie: ${after.log}`);
  check(/Kontrola jmen:/.test(await text(page, '#importMsg')) && /Nikdo nový se nepřidal/.test(await text(page, '#importMsg')), 'zpráva po nahrání');
  check(!/Nový/.test(await text(page, '#attView')), 'neznámý člověk není v docházce');
  await page.screenshot({ path: path.join(shots, '02-nahrano.png'), fullPage: true });

  // telefon: dialog bez přetečení
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setInputFiles('#file', file);
  await confirm(page).catch(() => {});      // přepsat docházku
  await page.waitForSelector('#dlg[open] .att-matchtab');
  check(await overflow(page) <= 0, 'telefon: dialog bez přetečení');
  await page.screenshot({ path: path.join(shots, '03-telefon.png') });
  await page.click('#dlgCancel');
  await browser.close();
  if (problems.length) { console.log('PROBLÉMY:\n' + problems.join('\n')); process.exit(1); }
  console.log('kontrola jmen ok');
})().catch(e => { console.error(e); process.exit(1); });
