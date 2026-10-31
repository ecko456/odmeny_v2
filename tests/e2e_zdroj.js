// Prohlížečový průchod 2.42: od listopadu 2026 je soubor Docházka a výkony jediný zdroj
// (docházka pro odměny, evidence práce místo Výroby, obsazenost a kusy v KPI), říjen zůstává.
// Hodiny stránky stojí na úterý 3. 11. 2026. Všechna data jsou vymyšlená.
// Spuštění stejně jako e2e_dochazka.js; snímky v $S/oshots-zdroj.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-zdroj');
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
const ser = (m, d) => (Date.UTC(2026, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5;
const PEOPLE = [['g_brus', '101', 'Adámek', 'Aleš'], ['g_brus', '102', 'Bednář', 'Boris'], ['g_cnc', '201', 'Fiala', 'Filip'], ['g_cnc', '202', 'Gregor', 'Gustav']];

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.clock.setFixedTime(NOW);
  const page = await ctx.newPage();
  await watch(page, 'zdroj');
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
  await page.evaluate(people => {
    const st = blank();
    const grp = (id, name, dept) => { const p = mkPos(id, name, []); p.dept = dept; p.skillset = [{ id: `k${id}`, name: 'Obsluha', desc: '', scale: null }]; p.maxTab = 8; p.tiers = []; return p; };
    st.positions = [grp('g_brus', 'Brus', 'Brus'), grp('g_cnc', 'Frézování', 'Obrobna')];
    people.forEach(([g, wid, last, first]) => { const key = `${last}|${first}`.toLowerCase(); st.employees[key] = { key, last, first, positionId: g, shift: 'R', note: '', wid, rate: { [`k${g}`]: 3 } }; });
    st.periods['2026-10'] = { id: '2026-10', y: 2026, m: 10, days: ['2026-10-30'], rows: { 'adámek|aleš': { first: 'Aleš', last: 'Adámek', h: [7.5], c: [null] } }, codes: {}, file: 'rijen.xlsx', at: 1, headerRow: 1 };
    S = sanitizeState(st);
    S.workAudit.groups.find(g => g.id === 'brus').mg = ['g_brus'];
    S.workAudit.dv.cols.work.norm = 'K';
    save();
    renderAll();
  }, PEOPLE);
  await saved(page);
  const octBefore = await page.evaluate(() => JSON.stringify(S.periods['2026-10']));

  // soubor: 31. 10. (říjen zůstane po staru), 2. a 3. 11.; 202 má 3. 11. kód D
  // rozložení jako vzor docházkového systému (2.42.4): „WPA kód“, datum textem bez roku, součty na konci, docházka na 2. listu
  const att = [['WPA kód', '31.10. So', null, '02.11. Po', null, '03.11. Út', null, 'Všední dny (h)', 'Víkend (h)', 'Celkem (h)'], [null, 'Příchod', 'Odchod', 'Příchod', 'Odchod', 'Příchod', 'Odchod'],
    [101, 0.25, 14 / 24, 0.25, 14.5 / 24, 0.25, null, 8, 7.5, 15.5],
    [102, null, null, 14 / 24, 22.5 / 24, 14 / 24, null, 8, 0, 8],
    [201, null, null, 0.25, 14.5 / 24, 0.25, null, 8, 0, 8],
    [202, null, null, 0.25, 14.5 / 24, 'D', null, 8, 0, 8]];
  const work = [['ID', 'Datum', 'Zakázka', 'Díl', 'Operace', 'V zakázce', 'Hotovo', '', '', 'Čas (min)', 'Norma (min)'],
    [101, { m: 10, d: 2 }, 45100, 'Hřídel', 'Broušení', 100, 40, '', '', 120, 100],
    [201, { m: 10, d: 2 }, 45101, 'Kryt', 'Frézování', 50, 10, '', '', 60, 66],
    [101, { m: 10, d: 3 }, 45102, 'Hřídel', 'Broušení', 100, 30, '', '', 200, 240],
    [101, { m: 9, d: 31 }, 45100, 'Hřídel', 'Broušení', 100, 5, '', '', 30, 30]];
  const file = { name: 'dochazka-vykony-listopad.xlsx', mimeType: XLSX_TYPE,
    buffer: await makeXlsx(page, [{ name: 'vykázaná práce', rows: work, dateCol: 1 }, { name: 'Docházka', rows: att }]) };

  // 1) KPI: v hlavičce jen Nahrát docházku a výkony
  await page.click('#nav [data-view="audit"]');
  check(await page.locator('#waAtt, #waWork').count() === 0 && await page.isVisible('#waDv'), 'v hlavičce KPI jen jedno nahrání');
  await page.setInputFiles('#waDvFile', file);
  // 2.42.3: nejdřív Jak se soubor načte (vzor prvního člověka), pak souhrn
  await page.waitForSelector('#dlg[open] .dv-map');
  { const mp = await text(page, '#dlgBody');
    check(/Vzor: co se z toho načte/.test(mp) && /První člověk: ID 101/.test(mp), `vzor prvního člověka: ${mp.slice(0, 300)}`); }
  // ruční úprava: špatný sloupec ID → vzor ukáže chybu, oprava → zase první člověk
  await page.fill('#dlg [data-dvm="att.id"]', 'Z');
  await page.waitForFunction(() => /není žádný řádek s ID/.test(document.querySelector('#dvmPrev').textContent));
  await page.fill('#dlg [data-dvm="att.id"]', 'A');
  await page.waitForFunction(() => /První člověk: ID 101/.test(document.querySelector('#dvmPrev').textContent));
  check(/2\. 11\./.test(await text(page, '#dvmPrev')) && /8,00|8,5|7,5/.test(await text(page, '#dvmPrev')), `vzor dnů: ${await text(page, '#dvmPrev')}`);
  await page.screenshot({ path: path.join(shots, '00-nacteni.png') });
  await page.click('#dlgOk');
  await page.waitForSelector('#dlg[open] .dv-imp');
  const d1 = await text(page, '#dlgBody');
  check(/jediný zdroj/.test(d1) && /docházka pro odměny za listopad 2026/.test(d1) && /evidence práce místo Výroby za listopad 2026 \(kusy, strávený čas, norma\)/.test(d1), `dialog: ${d1}`);
  check(/kusy podle operací do KPI \(2 dny\)/.test(d1) && /Říjen 2026 a dřív zůstává ze starých souborů/.test(d1), `dialog kusy: ${d1}`);
  await page.screenshot({ path: path.join(shots, '01-dialog.png') });
  await confirm(page);
  await saved(page);
  // záznam v historii vzniká při uložení; počkat, až tam je (jinak občas čteme dřív)
  await page.waitForFunction(() => S.log.some(x => /dochazka-vykony/.test(x.text)), null, { timeout: 15000 }).catch(() => {});
  const r = await page.evaluate(() => {
    const P = S.periods['2026-11'];
    const keep = S.current; S.current = '2026-11'; _prodIdx = null;
    const a = attendance(P, 'adámek|aleš'), g = attendance(P, 'gregor|gustav');
    const pr = productionOf('adámek|aleš'), pf = perfOf(a, pr);
    S.current = keep; _prodIdx = null;
    const d = iso => { const x = S.workAudit.days[iso]; return x ? [x.am.total, x.pm.total, x.am.abs, x.g.brus, x.g.frez] : null; };
    return { days: P.days, hA: P.rows['adámek|aleš'].h, cG: P.rows['gregor|gustav'].c, a: [a.totalHours, g.excusedDays], pr: [pr.total, pr.spent, pf.norm],
      prodMonths: Object.keys(S.production).sort(), oct: JSON.stringify(S.periods['2026-10']), n2: d('2026-11-02'), n3: d('2026-11-03'), o31: d('2026-10-31'),
      pcs: Object.keys(S.workAudit.pcs).sort(), log: S.log.map(x => x.text).filter(t => /dochazka-vykony/.test(t)).join(' | ') };
  });
  check(JSON.stringify(r.days) === JSON.stringify(['2026-11-01', '2026-11-02', '2026-11-03']), `dny listopadu: ${r.days}`);
  check(JSON.stringify(r.hA) === JSON.stringify([0, 8, 7.5]) && JSON.stringify(r.cG) === JSON.stringify([null, null, 'D']), `hodiny a kódy: ${JSON.stringify([r.hA, r.cG])}`);
  check(JSON.stringify(r.a) === '[15.5,1]' && JSON.stringify(r.pr) === '[70,320,106.3]', `odměny: ${JSON.stringify([r.a, r.pr])}`);
  check(JSON.stringify(r.prodMonths) === '["2026-11"]' && r.oct === octBefore, `říjen beze změny, evidence jen listopad: ${JSON.stringify(r.prodMonths)}`);
  check(JSON.stringify(r.n2) === '[3,1,0,[1,1],[2,0]]' && JSON.stringify(r.n3) === '[2,1,1,[1,1],[1,0]]' && r.o31 === null, `obsazenost v KPI: ${JSON.stringify([r.n2, r.n3, r.o31])}`);
  check(JSON.stringify(r.pcs) === '["2026-11-02","2026-11-03"]', `kusy: ${r.pcs}`);
  check(/docházka pro odměny za listopad 2026/.test(r.log) && /evidence práce za listopad 2026/.test(r.log), `historie: ${r.log}`);

  // Report docházky (2.42.1): ukáže nahraný den, všichni spárovaní; den bez příchodů nabídne poslední den
  await page.click('#waTabs [data-watab="report"]');
  await page.waitForSelector('#waView .dr-bar');
  check(await page.evaluate(() => ui.wa.dr.ref) === '2026-11-03' && await page.locator('#waView .dr-check').count() === 0, 'report na nahraném dni bez upozornění');
  await page.evaluate(() => { ui.wa.dr.ref = '2026-10-29'; renderWorkAudit(); });
  check(/nejsou nahrané žádné příchody/.test(await text(page, '#waView .dr-check')), 'den bez příchodů: upozornění');
  await page.click('#waView [data-drgo]');
  const lastRef = await page.evaluate(() => ui.wa.dr.ref);
  check(lastRef === '2026-11-03', `tlačítko na poslední den s příchody: ${lastRef}`);
  await page.evaluate(() => { S.workAudit.dv.pres['2026-11-03']['555'] = [360, null]; S.employees['fiala|filip'].positionId = null; ui.wa.dr.ref = '2026-11-03'; renderWorkAudit(); });
  const chk = await text(page, '#waView');
  check(/1 ID ze souboru není u nikoho v Lidech.*555/.test(chk) && /1 člověk s příchodem nemá skupinu v Matici.*Fiala Filip/.test(chk), `upozornění na párování: ${chk.slice(0, 200)}`);
  await page.screenshot({ path: path.join(shots, '01b-report.png') });
  await page.evaluate(() => { delete S.workAudit.dv.pres['2026-11-03']['555']; S.employees['fiala|filip'].positionId = 'g_cnc'; renderWorkAudit(); });

  // 2) Nastavení: skupiny Matice u skupin KPI, starší soubory schované
  await page.click('#waTabs [data-watab="nastaveni"]');
  await page.waitForSelector('#waView .wa-mg');
  check(/Skupiny Matice: Brus/.test(await text(page, '[data-wag="brus"] .wa-mg summary')) && /podle názvu/.test(await text(page, '[data-wag="frez"] .wa-mg summary')), 'výběr skupin Matice a podle názvu');
  check(!(await page.isVisible('[data-wapick="att"]')), 'starší soubory sbalené');
  await page.click('[data-wag="frez"] .wa-mg summary');
  await page.check('[data-wag="frez"] [data-wagmg="g_cnc"]');
  await saved(page);
  check(await page.evaluate(() => JSON.stringify(S.workAudit.groups.find(g => g.id === 'frez').mg)) === '["g_cnc"]' && await page.isVisible('[data-wag="frez"] .wa-mg[open]'), 'výběr uložen a zůstane otevřený');
  await page.click('.wa-old summary');
  check(await page.isVisible('[data-wapick="att"]'), 'starší soubory po rozbalení');
  await page.screenshot({ path: path.join(shots, '02-nastaveni.png'), fullPage: true });
  // starší výkaz práce za listopad se nenahraje
  const old = { name: 'vykaz-listopad.xlsx', mimeType: XLSX_TYPE, buffer: await makeXlsx(page, [{ name: 'L', rows: [['x', 'x', 'x', 'x', 'x', 'x', 'x', 'Operace', 'x', 'Ks'], [{ m: 10, d: 4 }, 0, 0, 0, 0, 0, 0, 'Broušení', 0, 5]], dateCol: 0 }]) };
  await page.setInputFiles('#waWorkFile', old);
  await page.waitForFunction(() => /jen ze souboru docházky a výkonů/.test(document.querySelector('#toast').textContent));
  check(!(await page.evaluate(() => S.workAudit.pcs['2026-11-04'])), 'starý výkaz práce listopad nepřepíše');

  // 3) Docházka a Výroba: pruh se zdrojem, starý import listopadu odmítnut
  await page.click('#nav [data-view="dochazka"]');
  check(/Od listopadu 2026 se docházka pro odměny plní ze souboru Docházka a výkony/.test(await text(page, '#view-dochazka .dv-src')), 'pruh v Docházce');
  await page.evaluate(() => showView('vyroba'));   // Výroba je od 2.44 mimo menu (odkaz z KPI)
  check(/Od listopadu 2026 se evidence práce plní/.test(await text(page, '#view-vyroba .dv-src')), 'pruh ve Výrobě');
  await page.screenshot({ path: path.join(shots, '03-vyroba.png') });
  await page.click('#nav [data-view="prehled"]');
  await page.screenshot({ path: path.join(shots, '04-prehled.png') });

  // 4) telefon a tmavý režim
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark', storageState: await ctx.storageState() });
  await m.clock.setFixedTime(NOW);
  const mp = await m.newPage();
  await watch(mp, 'telefon');
  await mp.goto(BASE);
  await mp.waitForFunction(() => typeof S !== 'undefined' && S && S.workAudit, null, { timeout: 20000 }).catch(() => {});
  if (await mp.evaluate(() => typeof showView === 'function')) {
    await mp.evaluate(() => { const sp = document.querySelector('#splash'); if (sp) sp.remove(); Object.assign(ui.wa, { tab: 'nastaveni', oldOpen: true, mgOpen: 'brus' }); showView('audit'); });
    await mp.waitForSelector('#waView .wa-mg[open]');
    check(await overflow(mp) <= 0, `telefon bez přetečení: ${await overflow(mp)}`);
    await mp.screenshot({ path: path.join(shots, '05-telefon.png'), fullPage: true });
  }
  await browser.close();
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
  console.log('zdroj ok');
})().catch(e => { console.error(e); process.exit(1); });
