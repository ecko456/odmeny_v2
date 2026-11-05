// Prohlížečový průchod 2.51: ruční úpravy docházky s důvodem, zámek dne a měsíce, nové nahrání
// úpravy a uzamčené dny nepřepíše, zrušení úpravy, uzamčený měsíc nejde nahrát ani smazat, širší
// rozložení na velkém monitoru, požadavek pracovníka v detailu člověka a v Úkolech (filtr, závažnost,
// připomínka), historie, telefon. Data jsou vymyšlená.
// Spuštění stejně jako e2e_jmena.js; snímky v $S/oshots-rucni.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-rucni');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };
const NOW = new Date(2026, 10, 5, 10, 0);

async function watch(page, label) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  page.on('response', r => { if (r.status() >= 400) problems.push(`${label} HTTP ${r.status()} ${r.url()}`); });
  page.on('pageerror', err => problems.push(`${label} pageerror: ${err.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`));
  });
}
const saved = page => page.waitForFunction(() => !store.dirty && !store.saving && document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 15000 });
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const text = async (page, sel) => (await page.textContent(sel)).replace(/\s+/g, ' ').trim();
const closed = page => page.waitForFunction(() => !document.querySelector('#dlg[open]'));
const until = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 8000 }).catch(() => problems.push(`nečekaný stav: ${fn}`));

async function makeXlsx(page, rows) {
  const b64 = await page.evaluate(async rows => {
    const X = await xlsx();
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows), 'Docházka');
    const bytes = new Uint8Array(X.write(wb, { bookType: 'xlsx', type: 'array' }));
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, rows);
  return Buffer.from(b64, 'base64');
}
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const KEY = 'adamek|ales';

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.clock.setFixedTime(NOW);
  const page = await ctx.newPage();
  await watch(page, 'rucni');
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
    const emp = (last, first) => { const key = `${norm(last)}|${norm(first)}`; st.employees[key] = { key, last, first, positionId: 'g_brus', shift: 'R', note: '', wid: '' }; };
    emp('Adámek', 'Aleš'); emp('Bednář', 'Boris'); emp('Cibulka', 'Cyril');
    S = sanitizeState(st);
    save(); renderAll();
  });
  await saved(page);
  const head = ['Jméno', 'Příjmení', '', '', ''];
  for (let d = 1; d <= 31; d += 1) head.push(`${d}.10.2026`);
  const hrs = h => Array.from({ length: 31 }, (_, i) => ([0, 6].includes(new Date(2026, 9, i + 1).getDay()) ? null : h));
  const file = async h => ({ name: `dochazka-rijen-${h}.xlsx`, mimeType: XLSX_TYPE, buffer: await makeXlsx(page, [head, ['Aleš', 'Adámek', '', '', '', ...hrs(h)], ['Boris', 'Bednář', '', '', '', ...hrs(h)], ['Cyril', 'Cibulka', '', '', '', ...hrs(h)]]) });
  await page.click('#nav [data-view="dochazka"]');
  await page.setInputFiles('#file', await file(7.5));
  await page.waitForFunction(() => S.periods['2026-10'] && Object.keys(S.periods['2026-10'].rows).length === 3, null, { timeout: 8000 });
  await saved(page);
  const H = (k, iso) => page.evaluate(([k, iso]) => { const p = S.periods['2026-10']; return attendance(p, k).cells.find(c => c.d.iso === iso).h; }, [k, iso]);

  await page.evaluate(() => { const o = window.odmToast; window.__t = []; window.odmToast = (m, e) => { window.__t.push(m); o(m, e); }; });
  // 1) ruční úprava: bez důvodu nejde, s důvodem se uloží a označí
  const cell = `td[data-attkey="${KEY}"] [data-attcell="2026-10-05"]`;
  await page.click(cell);
  await page.waitForSelector('#dlg[open] [name="note"]');
  check(/teď 7,5 h/.test(await text(page, '#dlgBody')), 'dialog ukazuje dnešní hodnotu');
  await page.fill('[name="h"]', '4,5');
  await page.click('#dlgOk');
  check(/důvod úpravy/.test(await text(page, '#dlgBody')), 'bez důvodu hláška');
  await page.screenshot({ path: path.join(shots, '00-bez-duvodu.png') });
  await page.fill('[name="note"]', 'odešel k lékaři');
  await page.click('#dlgOk');
  await closed(page);
  await until(page, () => S.attEdits['2026-10'] && S.attEdits['2026-10']['adamek|ales']);
  await saved(page);
  check(await H(KEY, '2026-10-05') === 4.5, `úprava je v docházce: ${await H(KEY, '2026-10-05')} ${await page.evaluate(() => JSON.stringify(S.attEdits))} ${await page.evaluate(() => JSON.stringify(window.__t))}`);
  check(await page.$eval(cell, b => b.classList.contains('ed')), 'den má značku ruční úpravy');
  // kód nepřítomnosti u druhého člověka
  await page.click('td[data-attkey="bednar|boris"] [data-attcell="2026-10-07"]');
  await page.waitForSelector('#dlg[open] [name="note"]');
  await page.fill('[name="h"]', '');
  await page.fill('[name="c"]', 'dov');
  await page.fill('[name="note"]', 'dovolená dodatečně schválená');
  await page.click('#dlgOk');
  await closed(page);
  await until(page, () => S.attEdits['2026-10']['bednar|boris']);
  await saved(page);
  // 2) zámek dne 6. 10.
  await page.click('[data-attlock="2026-10-06"]');
  await until(page, () => attLocked('2026-10', '2026-10-06'));
  await saved(page);
  check(await page.$eval('[data-attlock="2026-10-06"]', b => b.classList.contains('on') && b.getAttribute('aria-pressed') === 'true'), 'zámek dne je zapnutý');
  check(await page.$eval(`td[data-attkey="${KEY}"] [data-attcell="2026-10-06"]`, b => b.classList.contains('lk')), 'uzamčený den je vidět i v buňce');
  await page.screenshot({ path: path.join(shots, '01-upravy.png'), fullPage: true });
  const log1 = await page.evaluate(() => S.log.map(l => l.text));
  check(log1.some(t => t === 'Docházka – Adámek Aleš, 5. 10. 2026: 7,5 h → 4,5 h (důvod: odešel k lékaři)'), `historie úpravy: ${log1.slice(0, 5).join(' | ')}`);
  check(log1.some(t => /Bednář Boris, 7\. 10\. 2026: 7,5 h → DOV/.test(t)), 'historie kódu');
  check(log1.some(t => t === 'Docházka: den 6. 10. 2026 uzamčen'), 'historie zámku');

  // 3) nové nahrání: jiné hodiny, úpravy a uzamčený den zůstanou
  await page.setInputFiles('#file', await file(8));
  await page.waitForSelector('#dlg[open]');
  check(/ruční úpravy docházky \(2\), uzamčené dny \(1\)/.test(await text(page, '#dlgBody')), `potvrzení přepisu: ${await text(page, '#dlgBody')}`);
  await page.click('#dlgOk');
  await closed(page);
  await page.waitForFunction(() => S.periods['2026-10'].file && /-8\.xlsx/.test(S.periods['2026-10'].file), null, { timeout: 8000 });
  await saved(page);
  const re = [await H(KEY, '2026-10-05'), await H(KEY, '2026-10-06'), await H(KEY, '2026-10-08'), await H('bednar|boris', '2026-10-06'), await page.evaluate(() => attendance(S.periods['2026-10'], 'bednar|boris').cells.find(c => c.d.iso === '2026-10-07').c)];
  check(JSON.stringify(re) === JSON.stringify([4.5, 7.5, 8, 7.5, 'DOV']), `po novém nahrání: ${JSON.stringify(re)}`);
  // 4) zrušení úpravy vrátí hodnotu z nového souboru
  await page.click(cell);
  await page.waitForSelector('#dlg[open] button[value="undo"]');
  check(/ze souboru 8 h/.test(await text(page, '#dlgBody')), 'dialog zná hodnotu ze souboru');
  await page.click('#dlg[open] button[value="undo"]');
  await closed(page);
  await until(page, () => !S.attEdits['2026-10']['adamek|ales']);
  await saved(page);
  check(await H(KEY, '2026-10-05') === 8, 'zrušená úprava = hodnota ze souboru');
  check(!(await page.$eval(cell, b => b.classList.contains('ed'))), 'značka zmizela');

  // 5) uzamčený měsíc nejde nahrát ani smazat
  await page.click('[data-attlock=""]');
  await page.waitForSelector('#dlg[open]');
  await page.click('#dlgOk');
  await closed(page);
  await until(page, () => attLocked('2026-10'));
  await saved(page);
  check(await page.evaluate(() => attLocked('2026-10')), 'měsíc uzamčen');
  check(await page.$$eval('[data-attlock^="2026-"]', bs => bs.every(b => b.disabled)), 'zámky dnů jsou při uzamčeném měsíci vypnuté');
  await page.setInputFiles('#file', await file(6));
  await page.waitForSelector('#importMsg .note.e');
  check(/je uzamčená/.test(await text(page, '#importMsg')), 'nahrání uzamčeného měsíce odmítnuto');
  check(await H(KEY, '2026-10-08') === 8, 'uzamčený měsíc beze změny');
  await page.click('#btnDelPeriod');
  await page.waitForTimeout(300);
  check(!(await page.$('#dlg[open]')) && await page.evaluate(() => !!S.periods['2026-10']), 'uzamčený měsíc nejde smazat');
  await page.screenshot({ path: path.join(shots, '02-mesic-uzamcen.png') });

  // 6) širší monitor: docházka využije šířku
  await page.setViewportSize({ width: 2560, height: 1300 });
  await page.waitForTimeout(200);
  const w = await page.$eval('#view-dochazka', el => el.getBoundingClientRect().width);
  check(w > 2000, `docházka na monitoru 2560 px má jen ${Math.round(w)} px`);
  await page.screenshot({ path: path.join(shots, '03-siroky.png') });
  await page.setViewportSize({ width: 1440, height: 900 });

  // 7) požadavek pracovníka
  await page.click('#nav [data-view="lide"]');
  await page.click(`#lList [data-key="${KEY}"], .list [data-key="${KEY}"]`);
  await page.waitForSelector('[data-tkreqadd]');
  await page.click('[data-tkreqadd]');
  await page.waitForSelector('#dlg[open] [name="title"]');
  await page.fill('[name="title"]', 'Přeřazení na ranní směnu');
  await page.fill('[name="due"]', '2026-11-30');
  await page.selectOption('[name="sev"]', 'high');
  await page.click('#dlgOk');
  await closed(page);
  await until(page, () => S.tasks.list.length === 1);
  await saved(page);
  await page.waitForSelector('.tk-reqcard [data-tkreqopen]');
  check(/Přeřazení na ranní směnu/.test(await text(page, '.tk-reqcard')) && /Vysoká závažnost/.test(await text(page, '.tk-reqcard')), 'požadavek v detailu člověka');
  check(/požadavek pracovníka s vysokou závažností/.test(await text(page, '#taskAlert')), `připomínka nahoře: ${await text(page, '#taskAlert')}`);
  await page.screenshot({ path: path.join(shots, '04-pozadavek-clovek.png'), fullPage: true });
  await page.click('.tk-reqcard [data-tkreqopen]');
  await page.waitForSelector('#view-ukoly.on #tkSev');
  check(/Požadavek pracovníka Aleš Adámek/.test(await text(page, '.tk-reqline')), 'detail úkolu ukazuje pracovníka');
  await page.selectOption('#tkSev', 'mid');
  await until(page, () => S.tasks.list[0].sev === 'mid');
  await saved(page);
  await page.click('[data-tkback]');
  await page.waitForSelector('[data-tkf="req"]');
  check(/1/.test(await text(page, '[data-tkf="req"]')), 'počet požadavků ve filtru');
  await page.click('[data-tkf="req"]');
  check(/Požadavek pracovníka · Aleš Adámek/.test(await text(page, '#tkList')) && /Střední závažnost/.test(await text(page, '#tkList')), 'řádek požadavku v Úkolech');
  await page.screenshot({ path: path.join(shots, '05-ukoly.png'), fullPage: true });
  const log2 = await page.evaluate(() => S.log.map(l => l.text));
  check(log2.some(t => /^Požadavek pracovníka Aleš Adámek „Přeřazení na ranní směnu“ zadán, závažnost vysoká, termín 30\. 11\. 2026/.test(t)), `historie požadavku: ${log2.slice(0, 4).join(' | ')}`);
  // odkaz na člověka
  await page.click('[data-tkopen]');
  await page.click('[data-tkperson]');
  await page.waitForSelector('#view-lide.on .tk-reqcard');

  // 8) telefon
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => showView('dochazka'));
  await page.waitForTimeout(300);
  check(await overflow(page) <= 0, 'telefon: docházka bez přetečení');
  await page.screenshot({ path: path.join(shots, '06-telefon.png'), fullPage: true });
  await browser.close();
  if (problems.length) { console.log('PROBLÉMY:\n' + problems.join('\n')); process.exit(1); }
  console.log('ruční úpravy docházky a požadavky ok');
})().catch(e => { console.error(e); process.exit(1); });
