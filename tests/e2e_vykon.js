// Prohlížečový průchod 2.44: modul KPI (dřív Audit), Výroba pryč z menu, záložka Výkonnost na
// osobu (oddělení, průměr na den, řazení od nejlepších i nejhorších, filtr, Excel, profil),
// telefon a tmavý režim. Všechna data jsou vymyšlená. Spuštění stejně jako e2e_konce.js;
// snímky v $S/oshots-vykon.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-vykon');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };
const NOW = new Date(2026, 9, 31, 10, 0);

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
  await watch(page, 'vykon');
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

  // 1) Menu: KPI místo Auditu, Výroba pryč
  const nav = await page.evaluate(() => [...document.querySelectorAll('#nav [data-view]')].map(b => [b.dataset.view, b.textContent.replace(/\s+/g, ' ').trim()]));
  check(nav.some(([v, t]) => v === 'audit' && /^KPI/.test(t)), `menu KPI: ${JSON.stringify(nav)}`);
  check(!nav.some(([v]) => v === 'vyroba'), 'Výroba v menu není');
  check(!/Audit/.test(nav.map(x => x[1]).join(' ')), 'slovo Audit v menu není');

  // 2) Vymyšlená data: dvě oddělení (Obrobna = CNC + Frézka), vedoucí, vyřazený, člověk bez ID
  await page.evaluate(() => {
    const st = blank();
    const grp = (id, name, dept) => { const p = mkPos(id, name, []); p.dept = dept; p.skillset = [{ id: `k${id}`, name: 'Obsluha', desc: '', scale: null }]; p.maxTab = 8; p.tiers = []; return p; };
    st.positions = [grp('g_brus', 'Brus', 'Broušení'), grp('g_cnc', 'CNC', 'Obrobna'), grp('g_fr', 'Frézka', 'Obrobna')];
    const emp = (last, first, g, wid, x) => { const key = `${norm(last)}|${norm(first)}`; st.employees[key] = { key, last, first, positionId: g, shift: 'R', note: '', wid, ...(x || {}) }; return key; };
    const people = [['Adámek', 'Aleš', 'g_brus', '101', 20, 2400, 9000, 8500], ['Bednář', 'Boris', 'g_brus', '102', 18, 1500, 8000, 8800], ['Cibulka', 'Cyril', 'g_brus', '103', 10, 1300, 4000, 3000],
      ['Dvořák', 'David', 'g_cnc', '201', 20, 600, 9000, 9500], ['Erben', 'Emil', 'g_fr', '202', 20, 900, 9300, 8000], ['Fiala', 'Filip', 'g_cnc', '203', 0, 150, 1200, 0],
      ['Vedoucí', 'Viktor', 'g_brus', '301', 20, 5000, 100, 100, { lead: ['Broušení'] }], ['Vyřazený', 'Václav', 'g_brus', '302', 20, 5000, 100, 100, { excluded: true }]];
    const days = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`).filter(iso => { const d = new Date(`${iso}T12:00`).getDay(); return d && d < 6; });
    const rows = {}, names = {};
    people.forEach(([last, first, g, wid, n, ks, spent, normMin, x]) => {
      const key = emp(last, first, g, wid, x);
      rows[key] = { first, last, h: days.map((_, i) => (i < n ? 7.5 : 0)), c: days.map(() => null) };
      names[wid] = { name: wid, total: ks, count: 10, days: { '2026-10-05': ks }, spent, norm: normMin, nspent: normMin ? spent : 0 };
    });
    names.x = { name: 'Někdo Neznámý', total: 50, count: 1, days: { '2026-10-05': 50 }, spent: 60, norm: 0, nspent: 0 };
    st.periods['2026-10'] = { id: '2026-10', y: 2026, m: 10, days, rows, codes: {}, file: 'dochazka-rijen.xlsx', at: 1, headerRow: 1 };
    st.production['2026-10'] = { time: true, file: 'vykaz-rijen.xlsx', at: 1, records: 90, total: 0, names };
    st.current = '2026-10'; st.demo = false;
    S = sanitizeState(st);
    save(); renderAll();
  });
  await saved(page);
  await page.evaluate(() => showView('audit'));
  await page.waitForSelector('#view-audit.on');
  check((await text(page, '#waTitle')) === 'KPI', 'nadpis KPI');
  const tabs = await page.$$eval('#waTabs [data-watab]', b => b.map(x => [x.dataset.watab, x.textContent]));
  check(JSON.stringify(tabs.map(t => t[0])) === JSON.stringify(['prehled', 'lide', 'report', 'kapacity', 'vykon', 'dny', 'nastaveni']), `záložky: ${JSON.stringify(tabs)}`);
  check(tabs.some(t => t[1] === 'Výkonnost na osobu'), 'záložka Výkonnost na osobu');

  // 3) Výkonnost na osobu: oddělení, pořadí od nejlepších podle Ø ks na den
  await page.click('#waTabs [data-watab="vykon"]');
  await page.waitForSelector('.kp-dept');
  const read = () => page.$$eval('.kp-dept', cards => cards.map(c => [c.dataset.kpdept, [...c.querySelectorAll('tbody tr')].map(r => r.querySelector('.name b').textContent + ' ' + r.querySelector('.kp-rank').textContent.trim() + ' ' + r.querySelector('td.kp-on .kp-val').textContent.replace(/\s+/g, ' ').trim())]));
  let got = await read();
  check(JSON.stringify(got) === JSON.stringify([
    ['Broušení', ['Cibulka Cyril 1. 130 ks', 'Adámek Aleš 2. 120 ks', 'Bednář Boris 3. 83,3 ks']],
    ['Obrobna', ['Erben Emil 1. 45 ks', 'Dvořák David 2. 30 ks', 'Fiala Filip – —']]]), `od nejlepších: ${JSON.stringify(got)}`);
  const all = await text(page, '#waView');
  check(/Průměr oddělení/.test(all) && /průměr oddělení 108,3 ks/.test(all), `průměr oddělení: ${all.slice(0, 600)}`);
  check(/1 záznam z evidence práce nejde přiřadit/.test(all), 'nespárovaný záznam');
  check(!/Vedoucí Viktor|Vyřazený/.test(all), 'vedoucí a vyřazený ne');
  const widths = await page.$$eval('.kp-dept[data-kpdept="Broušení"] .kp-fill', f => f.map(x => [x.style.width, x.className]));
  check(widths[0][0] === '100%' && /up/.test(widths[0][1]) && /down/.test(widths[2][1]), `pruhy: ${JSON.stringify(widths)}`);
  await page.screenshot({ path: path.join(shots, '01-nejlepsi.png'), fullPage: true });

  // od nejhorších
  await page.click('[data-kpdir="worst"]');
  got = await read();
  check(JSON.stringify(got[0][1].map(x => x.split(' ')[0])) === JSON.stringify(['Bednář', 'Adámek', 'Cibulka']), `od nejhorších: ${JSON.stringify(got)}`);
  check(got[1][1][2].startsWith('Fiala'), 'bez hodnoty na konci i od nejhorších');
  // podle plnění normy
  await page.selectOption('#kpSort', 'norm');
  got = await read();
  check(JSON.stringify(got[0][1]) === JSON.stringify(['Cibulka Cyril 1. 75 %', 'Adámek Aleš 2. 94,4 %', 'Bednář Boris 3. 110 %']), `norma od nejhorších: ${JSON.stringify(got)}`);
  await page.click('[data-kpdir="best"]');
  await page.selectOption('#kpDept', 'Obrobna');
  got = await read();
  check(got.length === 1 && got[0][0] === 'Obrobna', `filtr oddělení: ${JSON.stringify(got)}`);
  await page.selectOption('#kpDept', '');
  await page.selectOption('#kpSort', 'ks');

  // proti výpočtu v core
  const calc = await page.evaluate(() => { const x = kpiPerf('2026-10', {}); return x.depts.map(d => [d.name, d.people.map(q => q.key)]); });
  check(calc[0][1][0] === 'cibulka|cyril', `core: ${JSON.stringify(calc)}`);

  // 4) Excel
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-kpxlsx]')]);
  const file = path.join(shots, dl.suggestedFilename());
  await dl.saveAs(file);
  check(dl.suggestedFilename() === 'vykonnost-na-osobu-2026-10.xlsx', `soubor: ${dl.suggestedFilename()}`);
  const book = await page.evaluate(async b64 => { const X = await xlsx(); const wb = X.read(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), { type: 'array' }); return X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }); }, fs.readFileSync(file).toString('base64'));
  check(book[3][7] === 'Ø ks na den' && book[4][2] === 'Cibulka Cyril' && book[4][7] === 130 && book.at(-1)[0] === 'Celkem', `Excel: ${JSON.stringify(book.slice(3, 6))}`);

  // 5) klik na člověka otevře profil
  await page.click('.kp-dept tbody tr:first-child .name');
  await page.waitForSelector('#view-profil.on');
  await page.evaluate(() => showView('audit'));

  // 6) Výroba jde otevřít jen z KPI (starší soubory), v menu svítí KPI
  await page.evaluate(() => showView('vyroba'));
  check(await page.evaluate(() => document.querySelector('#nav [data-view="audit"]').getAttribute('aria-current')) === 'true', 'u Výroby svítí KPI');
  await page.evaluate(() => showView('audit'));

  // 7) telefon a tmavý režim
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => renderWorkAudit());
  await page.waitForTimeout(300);
  check(await overflow(page) <= 0, `telefon přetéká o ${await overflow(page)} px`);
  await page.screenshot({ path: path.join(shots, '02-telefon.png'), fullPage: true });
  const tiles = await page.evaluate(() => HOME_TILES.map(t => t[0]));
  check(!tiles.includes('vyroba') && tiles.includes('audit'), `dlaždice: ${tiles}`);

  await browser.close();
  if (problems.length) { console.log('PROBLÉMY:\n' + problems.join('\n')); process.exit(1); }
  console.log('e2e výkonnost ok');
})().catch(e => { console.error(e); process.exit(1); });
