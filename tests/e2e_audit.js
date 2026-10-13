// Prohlížečový průchod modulem Audit (verze 2.17): nahrání obsazenosti a výkazu práce (Excel
// vyrobený v prohlížeči z vymyšlených čísel, žádná skutečná data), přehled s grafy a body ke
// kontrole, dny s víkendy a svátky, úprava hodnoty s důvodem, nastavení skupin a operací
// (kusy jen u operací se skupinou), historie po týdnech a měsících, úpravy, nové nahrání se
// zachováním úprav, osekaný Excel a PDF pro auditora, historie změn, telefon a tmavý režim.
// Spuštění stejně jako e2e_browser.js:
//   ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t . dev-router.php &
//   curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state
//   NO_PROXY=127.0.0.1 PW=$(npm root -g)/playwright S=$S node tests/e2e_audit.js
// PDF a Excel se uloží do $S (audit-*.pdf, audit-*.xlsx), snímky do $S/oshots-wa.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-wa');
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
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const wa = page => page.evaluate(() => JSON.parse(JSON.stringify(S.workAudit)));
async function download(page, selector, name) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  const target = path.join(S, name);
  await file.saveAs(target);
  return { name: file.suggestedFilename(), path: target, head: fs.readFileSync(target).slice(0, 5).toString() };
}
function pdfInfo(file) {
  const py = `import sys
try:
    import pypdf
    r = pypdf.PdfReader(sys.argv[1])
    print(len(r.pages))
    print('\\n'.join(p.extract_text() or '' for p in r.pages))
except ImportError:
    import pymupdf
    d = pymupdf.open(sys.argv[1])
    print(len(d))
    print('\\n'.join(p.get_text() for p in d))`;
  const r = require('child_process').spawnSync('python3', ['-c', py, file], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const [pages, ...rest] = r.stdout.split('\n');
  return { pages: +pages, text: rest.join('\n').replace(/\s+/g, ' ') };
}

/* Vymyšlený soubor obsazenosti a výkaz práce za měsíc roku 2026, vyrobený v prohlížeči přes SheetJS.
   Obsazenost: řádek na každý den (víkend a svátek jen s datem), datum jako text „d.m.rrrr“.
   V říjnu: 10. 10. (sobota) se pracovalo, 22. 10. chybí, 14. 10. jeden člověk bez skupiny.
   Výkaz: datum jako datum Excelu, každá operace ve dvou řádcích, 23. 10. chybí. */
async function makeFiles(page, variant = 1, month = 10) {
  const out = await page.evaluate(async ([variant, month]) => {
    const oct = month === 10;
    const X = await xlsx();
    const L = l => waIndex(l);
    const att = [['Obsazenost hala 2 – říjen 2026'], [], ['', '', '', 'Datum', '', '', '', '', 'Mělo dorazit', '', 'Brusiči', 'Brush', 'Frézování', 'Lepení', 'Kontrola', 'Tryska', '', 'Absence', 'Daiho', 'Celkem', 'Požadavek', 'Skutečnost']];
    const work = [['Datum', 'Středisko', 'Zakázka', 'Díl', 'Pracovník', 'Od', 'Do', 'Operace', 'Norma', 'Kusy']];
    const ops = [['Pískování - hala 2', 300], ['Broušení ruční', 500], ['Brush kartáčování', 260], ['Frézování CNC', 410], ['Lepení štítků', 180], ['Kontrola výstupní', 120], ['Balení do krabic', 90], ['Údržba stroje', 6]];
    const last = new Date(Date.UTC(2026, month, 0)).getUTCDate();
    for (let day = 1; day <= last; day += 1) {
      const d = mkDay(2026, month, day);
      const row = [];
      row[L('D')] = `${day}.${month}.2026`;
      const sat = oct && day === 10;
      const worked = d.work || sat;
      if (worked && !(oct && day === 22)) {
        const am = sat ? { K: 3, M: 1 } : { K: 6 + (day % 3), L: 4, M: 5 - (day % 2), N: 3, O: 4, P: 2, S: day % 7 === 5 ? 3 : 2 };
        const pm = sat ? {} : { X: 5, Y: 3, W: 4, Z: 2, AA: 3 };
        Object.entries({ ...am, ...pm }).forEach(([k, v]) => { row[L(k)] = v; });
        const amSum = Object.values(am).reduce((a, b) => a + b, 0) + (oct && day === 14 ? 1 : 0);
        const pmSum = Object.values(pm).reduce((a, b) => a + b, 0);
        row[L('T')] = amSum;
        row[L('I')] = sat ? amSum : amSum + (day % 4 === 0 ? 3 : 1);
        row[L('R')] = row[L('I')] - amSum;
        if (pmSum) { row[L('U')] = 18; row[L('V')] = pmSum; }
        if (variant === 2 && oct && day === 1) row[L('K')] = 9;   // opravený soubor: jiný počet brusičů 1. 10.
      }
      att.push(row);
      if (worked && !(oct && day === 23)) {
        ops.forEach(([name, base], i) => {
          if (sat && i > 1) return;
          const ks = Math.round(base * (sat ? 0.3 : oct ? 1 : 1.1) + ((day * (i + 3)) % 23));
          const half = Math.floor(ks / 2);
          work.push([new Date(Date.UTC(2026, month - 1, day, 12)), 'H2', `Z${100 + day}`, `D-${i}`, `P${i}`, '06:00', '14:00', name, 1.2, half]);
          work.push([new Date(Date.UTC(2026, month - 1, day, 12)), 'H2', `Z${100 + day}`, `D-${i}`, `P${i + 10}`, '14:00', '22:00', name, 1.2, ks - half]);
        });
      }
    }
    att.push([null, null, null, 'Celkem']);
    const pack = rows => {
      const wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows), 'List1');
      const bytes = new Uint8Array(X.write(wb, { bookType: 'xlsx', type: 'array' }));
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    };
    return { att: pack(att), work: pack(work) };
  }, [variant, month]);
  const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const m = month === 10 ? 'rijen' : 'listopad';
  return {
    att: { name: variant === 2 ? `obsazenost-${m}-oprava.xlsx` : `obsazenost-${m}.xlsx`, mimeType: type, buffer: Buffer.from(out.att, 'base64') },
    work: { name: `vykaz-prace-${m}.xlsx`, mimeType: type, buffer: Buffer.from(out.work, 'base64') },
  };
}
async function confirm(page) {
  await page.waitForSelector('#dlg[open]');
  await page.click('#dlgOk');
  await page.waitForFunction(() => !document.querySelector('#dlg[open]'));
}
const tiles = page => page.$$eval('#waView .stat', els => els.map(e => `${e.querySelector('.k').textContent.trim()}: ${e.querySelector('.v').textContent.trim()}`));

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await watch(page, 'audit');
  await page.goto(BASE);
  await page.waitForSelector('#setupForm');
  await page.fill('[name="token"]', fs.readFileSync(process.env.TOKEN_FILE || path.join(S, 'odme2e', 'setup-token.txt'), 'utf8').trim());
  await page.fill('[name="label"]', 'Vedoucí haly');
  await page.click('#setupForm button[type="submit"]');
  await page.waitForSelector('.odm-card');
  await page.check('#saved');
  await page.click('#finish');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');

  // Prázdný modul: co nahrát a z jakých sloupců.
  await page.click('#nav [data-view="audit"]');
  await page.waitForSelector('#view-audit.on .wa-start');
  const start = await page.textContent('#waView');
  check(/Obsazenost směn/.test(start) && /Výkaz práce z IS/.test(start), 'úvod s oběma soubory');
  const letters = await page.$$eval('.wa-src:first-child table.wa-cols th', els => els.map(e => e.textContent));
  check(letters.join(',') === 'D,I,K,L,M,N,O,P,R,S,T,U,V,W,X,Y,Z,AA', `sloupce obsazenosti podle zadání: ${letters}`);
  check(!(await page.$('[data-wapdf], [data-waxlsx]')), 'bez dat žádný export');
  await page.screenshot({ path: path.join(shots, '01-start.png'), fullPage: true });

  // Špatný soubor (výkaz místo obsazenosti) nic nenahraje a nabídne nastavení sloupců.
  const files = await makeFiles(page);
  await page.setInputFiles('#waAttFile', { ...files.work, name: 'spatny.xlsx' });
  await page.waitForSelector('#dlg[open]');
  check(/není žádný řádek s datem ve sloupci D/.test(await page.textContent('#dlgBody')), 'chybný soubor obsazenosti');
  await page.click('#dlgCancel');

  // Nahrání obsazenosti: souhrn před uložením.
  await page.setInputFiles('#waAttFile', files.att);
  await page.waitForSelector('#dlg[open] .wa-prev');
  const sum = await page.textContent('#dlgBody');
  check(/21 dní \(1\. 10\. 2026 – 30\. 10\. 2026\)/.test(sum), `souhrn obsazenosti: ${sum.slice(0, 160)}`);
  check(/1 den je víkend nebo svátek/.test(sum), 'sobota s prací v souhrnu');
  check(/Přeskočeno 10 řádků/.test(sum), `prázdné dny přeskočeny: ${sum}`);
  await page.screenshot({ path: path.join(shots, '02-import-att.png') });
  await confirm(page);
  await page.waitForFunction(n => S.workAudit.files.length === n, 1);   // soubor se uloží až po zavření dialogu
  await saved(page);
  let w = await wa(page);
  check(Object.keys(w.days).length === 21 && !w.days['2026-10-22'] && w.days['2026-10-10'], 'dny obsazenosti');
  check(JSON.stringify(w.days['2026-10-01']) === JSON.stringify({ am: { plan: 27, total: 26, abs: 1 }, pm: { plan: 18, total: 17 }, g: { brus: [7, 5], brush: [4, 3], frez: [4, 4], lep: [3, null], kont: [4, 3], tryska: [2, 2], daiho: [2, null] } }), `1. 10.: ${JSON.stringify(w.days['2026-10-01'])}`);

  // Výkaz práce: kusy po dnech a operacích. Nové operace přijdou bez skupiny a nepočítají se (2.17.1).
  await page.setInputFiles('#waWorkFile', files.work);
  await page.waitForSelector('#dlg[open] .wa-prev');
  const sw = await page.textContent('#dlgBody');
  check(/8 nových operací bez skupiny: kusy se nepočítají/.test(sw), `souhrn výkazu: ${sw.slice(0, 300)}`);
  await page.screenshot({ path: path.join(shots, '03-import-work.png') });
  await confirm(page);
  await page.waitForFunction(n => S.workAudit.files.length === n, 2);   // soubor se uloží až po zavření dialogu
  await saved(page);
  w = await wa(page);
  check(w.ops.length === 8 && w.ops.every(o => o.group === '' && o.on), `nové operace bez skupiny: ${JSON.stringify(w.ops)}`);
  check(await page.evaluate(() => waTotals(S.workAudit, waDays(S.workAudit, '2026-10-01', '2026-10-31')).pcs) === null, 'bez skupiny se žádné kusy nepočítají');
  const brus1 = w.pcs['2026-10-01'][w.ops.find(o => o.name === 'Broušení ruční').id];
  check(brus1 === 500 + (1 * 4) % 23, `kusy se sečtou z obou řádků: ${brus1}`);
  check(!w.pcs['2026-10-23'] && w.pcs['2026-10-10'], 'dny výkazu');
  check(await page.textContent('#navWa') === '8', 'odznak: osm operací bez skupiny');
  // Po nahrání rovnou Nastavení s operacemi bez skupiny; návrh podle názvu jen po klepnutí.
  await page.waitForSelector('table.wa-opset');
  check(await page.evaluate(() => ui.wa.tab === 'nastaveni' && ui.wa.opFilter === 'nogroup'), 'po nahrání Nastavení s filtrem bez skupiny');
  check((await page.$$('table.wa-opset tbody tr[data-wao]')).length === 8, 'osm operací čeká na skupinu');
  const pis = await page.evaluate(() => S.workAudit.ops.find(o => o.name === 'Pískování - hala 2').id);
  check(/návrh: Obsluha tryskací kabiny/.test(await page.textContent(`tr[data-wao="${pis}"]`)), 'návrh skupiny podle názvu');
  await page.screenshot({ path: path.join(shots, '03b-operace.png'), fullPage: true });
  await page.click(`tr[data-wao="${pis}"] [data-waogs]`);
  await page.waitForFunction(id => S.workAudit.ops.find(o => o.id === id).group === 'tryska', pis);
  await saved(page);
  check(/Přiřadit navržené skupiny \(6\)/.test(await page.textContent('[data-waguess]')), 'hromadný návrh pro zbylé');
  await page.click('[data-waguess]');
  await page.waitForFunction(() => S.workAudit.ops.filter(o => o.group).length === 7);
  await saved(page);
  w = await wa(page);
  const og = Object.fromEntries(w.ops.map(o => [o.name, o.group]));
  check(og['Pískování - hala 2'] === 'tryska' && og['Broušení ruční'] === 'brus' && og['Brush kartáčování'] === 'brush' && og['Frézování CNC'] === 'frez'
    && og['Lepení štítků'] === 'lep' && og['Kontrola výstupní'] === 'kont' && og['Balení do krabic'] === 'kont' && og['Údržba stroje'] === '', `skupiny operací: ${JSON.stringify(og)}`);
  check(await page.textContent('#navWa') === '1', 'odznak: jedna operace bez skupiny');
  const udr = await page.evaluate(() => S.workAudit.ops.find(o => o.name === 'Údržba stroje').id);
  const pcsOf = () => page.evaluate(() => waTotals(S.workAudit, waDays(S.workAudit, '2026-10-01', '2026-10-31')).pcs);
  const before = await pcsOf();
  await page.selectOption(`tr[data-wao="${udr}"] [data-waof="group"]`, 'kont');
  await page.waitForFunction(id => S.workAudit.ops.find(o => o.id === id).group === 'kont', udr);
  check(await pcsOf() > before && await page.evaluate(() => document.querySelector('#navWa').hidden), 'se skupinou se kusy počítají');
  await saved(page);
  await page.click('[data-waopf="all"]');
  await page.selectOption(`tr[data-wao="${udr}"] [data-waof="group"]`, '');
  await page.waitForFunction(id => S.workAudit.ops.find(o => o.id === id).group === '', udr);
  check(await pcsOf() === before && await page.textContent('#navWa') === '1', '„nepočítat“ kusy zase vyřadí');
  await saved(page);

  // Přehled: historie po týdnech a měsících.
  await page.click('#waTabs [data-watab="prehled"]');
  await page.waitForSelector('#waView .wa-stats');
  const t1 = await tiles(page);
  check(t1.length === 4 && /Lidé v práci: .*Ø na den/.test(t1[0]), `dlaždice: ${t1}`);
  check(/1 operace z výkazu práce nemá skupinu/.test(await page.textContent('#waView .note.w')), 'upozornění na operaci bez skupiny');
  const marks = await page.$$eval('#waCharts .chart', els => els.map(e => [e.querySelectorAll('path.bar').length, e.querySelectorAll('.wa-plan').length, e.querySelectorAll('.wa-dot').length, (e.querySelector('.cap') || { textContent: '' }).textContent]));
  check(JSON.stringify(marks.map(m => m.slice(0, 3))) === JSON.stringify([[5, 5, 0], [5, 0, 0], [0, 0, 5]]), `grafy po týdnech (sloupce, plán, body): ${JSON.stringify(marks)}`);
  check(marks.every(m => m[3]), 'popsaná poslední hodnota');
  await page.hover('#waCharts .chart:first-child .hit >> nth=0');
  check(/T40\/2026 \(28\. 9\.–4\. 10\.\): Ø 44 lidí na pracovní den z plánu 46 \(95,7 %\)/.test(await page.textContent('#waTip')), `tooltip: ${await page.textContent('#waTip')}`);
  await page.mouse.move(5, 5);
  check(JSON.stringify(await page.$$eval('table.wa-hist tbody tr', els => els.map(e => e.dataset.waweek))) === JSON.stringify(['2026-W44', '2026-W43', '2026-W42', '2026-W41', '2026-W40']), 'tabulka týdnů od nejnovějšího');
  await page.screenshot({ path: path.join(shots, '04-prehled.png'), fullPage: true });
  await page.click('[data-wagrain="month"]');
  check((await page.$$('table.wa-hist tbody tr[data-wamonth]')).length === 1 && (await page.$$('#waCharts .chart:first-child path.bar')).length === 1, 'po měsících');
  await page.click('[data-wagrain="week"]');

  // Dny: víkend a svátek, chybějící data, rozpad po skupinách.
  await page.click('#waTabs [data-watab="dny"]');
  await page.waitForSelector('table.wa-days');
  const issues = await page.$$eval('.wa-issues li', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  check(issues.some(x => /1 pracovní den bez obsazenosti: Čt 22\. 10\./.test(x)), `chybí obsazenost 22. 10.: ${issues}`);
  check(issues.some(x => /1 pracovní den bez výkazu práce: Pá 23\. 10\./.test(x)), 'chybí výkaz 23. 10.');
  check(issues.some(x => /Součet skupin nesedí.*St 14\. 10\. ranní -1/.test(x)), `nesedí součet 14. 10.: ${issues}`);
  check(issues.some(x => /Nepočítá se 1 operace bez skupiny.*Údržba stroje/.test(x)), `operace bez skupiny: ${issues}`);
  check(issues.some(x => /víkendu nebo ve svátek: So 10\. 10\./.test(x)), 'sobota s prací');
  const rows = await page.$$eval('table.wa-days tbody tr', els => els.map(e => [e.dataset.waday, e.classList.contains('wa-off'), (e.querySelector('.wa-tags') || { textContent: '' }).textContent.trim()]));
  check(rows.length === 23, `dny v tabulce: ${rows.length}`);
  check(rows.find(r => r[0] === '2026-10-10')[1] && rows.find(r => r[0] === '2026-10-28')[1], 'sobota a svátek podbarvené');
  check(/bez obsazenosti/.test(rows.find(r => r[0] === '2026-10-22')[2]) && /R -1/.test(rows.find(r => r[0] === '2026-10-14')[2]), 'značky dnů');
  check(/Vznik ČSR/.test(await page.textContent('tr[data-waday="2026-10-28"]')), 'název svátku');
  check(!rows.some(r => r[0] === '2026-10-11'), 'neděle bez dat se nevypisuje');
  await page.check('#waGroups');
  check((await page.$$('table.wa-days thead th.wa-g')).length === 7, 'sloupce skupin');
  await page.screenshot({ path: path.join(shots, '05-dny.png'), fullPage: true });

  // Úprava hodnoty: bez důvodu nejde, s důvodem se uloží i s původní hodnotou.
  await page.click('tr[data-waday="2026-10-01"] td.name');
  await page.waitForSelector('#dlg[open] [data-wakey="g.brus.am"]');
  check(/Součet skupin 26 = celkem v práci/.test(await page.textContent('[data-wasum="am"]')), 'kontrola součtu v detailu dne');
  await page.fill('[data-wakey="g.brus.am"] input', '8');
  check(/rozdíl \+1/.test(await page.textContent('[data-wasum="am"]')), 'živý rozdíl součtu');
  await page.fill('[data-wakey="am.total"] input', '27');
  await page.click('#dlgOk');
  check(/Napiš důvod úpravy/.test(await page.textContent('#dlgBody')), 'důvod je povinný');
  await page.fill('#dlg [name="reason"]', 'Brigádník z jiné haly, doplněno podle směnového hlášení');
  await page.fill('#dlg [name="note"]', 'Návštěva zákazníka');
  await page.screenshot({ path: path.join(shots, '06-den.png') });
  await page.click('#dlgOk');
  await page.waitForFunction(() => !document.querySelector('#dlg[open]') && S.workAudit.edits['2026-10-01']);
  await saved(page);
  w = await wa(page);
  const e1 = w.edits['2026-10-01'];
  check(e1 && e1['g.brus.am'].v === 8 && e1['g.brus.am'].was === 7 && e1['am.total'].v === 27 && e1['am.total'].was === 26 && /Brigádník/.test(e1['am.total'].note) && e1['am.total'].by === 'Vedoucí haly', `úpravy: ${JSON.stringify(e1)}`);
  check(w.notes['2026-10-01'] === 'Návštěva zákazníka', 'poznámka ke dni');
  check(/\*/.test(await page.textContent('tr[data-waday="2026-10-01"]')), 'hvězdička u upravené hodnoty');
  // Kusy jiné operace přidané ručně.
  await page.click('tr[data-waday="2026-10-23"] td.name');
  await page.waitForSelector('#dlg[open] #waAddOp');
  const opId = await page.evaluate(() => S.workAudit.ops.find(o => o.name === 'Broušení ruční').id);
  await page.selectOption('#waAddOp', opId);
  await page.fill(`[data-wakey="pcs.${opId}"] input`, '512');
  await page.fill('#dlg [name="reason"]', 'Výkaz za pátek v IS chybí, kusy ze směnového hlášení');
  await page.click('#dlgOk');
  await page.waitForFunction(() => !document.querySelector('#dlg[open]') && S.workAudit.edits['2026-10-23']);
  await saved(page);
  w = await wa(page);
  check(w.edits['2026-10-23'][`pcs.${opId}`].v === 512 && w.edits['2026-10-23'][`pcs.${opId}`].was === null, 'ručně doplněné kusy');
  check(/512/.test(await page.textContent('tr[data-waday="2026-10-23"]')), 'kusy v tabulce dnů');
  // Neplatné číslo neprojde.
  await page.click('tr[data-waday="2026-10-02"] td.name');
  await page.waitForSelector('#dlg[open]');
  await page.fill('[data-wakey="am.plan"] input', 'abc');
  await page.click('#dlgOk');
  check(/není číslo/.test(await page.textContent('#dlgBody')), 'neplatné číslo');
  await page.click('#dlgCancel');

  // Nastavení: skupina pro operaci, nezapočítaná operace, příznaky skupiny, sloupce.
  await page.click('#waTabs [data-watab="nastaveni"]');
  await page.waitForSelector('.wa-grp-row');
  const flags = await page.$$eval('.wa-grp-row', els => els.map(e => [e.querySelector('[data-wagf="name"]').value, e.querySelector('[data-wagf="am"]').value, e.querySelector('[data-wagf="pm"]').value, e.querySelector('[data-wagf="unprod"]').checked, e.querySelector('[data-wagf="noIs"]').checked]));
  check(JSON.stringify(flags) === JSON.stringify([['Brusiči', 'K', 'X', false, false], ['Brush', 'L', 'Y', false, false], ['Frézování', 'M', 'W', false, false], ['Lepení a značení dílů', 'N', '', false, false],
    ['Kontrola / balení / brigadýr / školitelé', 'O', 'AA', true, false], ['Obsluha tryskací kabiny', 'P', 'Z', false, false], ['Projekt Daiho', 'S', '', false, true]]), `výchozí skupiny: ${JSON.stringify(flags)}`);
  await page.screenshot({ path: path.join(shots, '07-nastaveni.png'), fullPage: true });
  await page.click('[data-waopf="nogroup"]');
  check((await page.$$('table.wa-opset tbody tr[data-wao]')).length === 1, 'filtr bez skupiny');
  await page.click('[data-waopf="all"]');
  await page.selectOption(`tr[data-wao="${pis}"] [data-waof="group"]`, 'brus');
  await saved(page);
  await page.selectOption(`tr[data-wao="${pis}"] [data-waof="group"]`, 'tryska');
  await saved(page);
  await page.check('.wa-grp-row[data-wag="lep"] [data-wagf="unprod"]');
  await saved(page);
  w = await wa(page);
  check(w.groups.find(g => g.id === 'lep').unprod && w.ops.find(o => o.id === pis).group === 'tryska', 'nastavení uloženo');
  await page.fill('.wa-grp-row[data-wag="lep"] [data-wagf="pm"]', '1x');
  await page.press('.wa-grp-row[data-wag="lep"] [data-wagf="pm"]', 'Tab');
  check(/písmeno/.test(await page.textContent('#toast')), 'neplatné písmeno sloupce');
  await page.uncheck('.wa-grp-row[data-wag="lep"] [data-wagf="unprod"]');
  await saved(page);
  // Nová skupina a její smazání.
  await page.click('[data-wagadd]');
  await page.fill('#dlg [name="value"]', 'Expedice');
  await page.click('#dlgOk');
  await page.waitForSelector('.wa-grp-row[data-wag="g1"]');
  await page.fill('.wa-grp-row[data-wag="g1"] [data-wagf="am"]', 'ab');
  await page.press('.wa-grp-row[data-wag="g1"] [data-wagf="am"]', 'Tab');
  await saved(page);
  check((await wa(page)).groups.find(g => g.id === 'g1').am === 'AB', 'písmeno sloupce velkými');
  await page.click('[data-wagdel="g1"]');
  await confirm(page);
  await page.waitForFunction(() => !S.workAudit.groups.some(g => g.id === 'g1'));   // změna přijde až po zavření dialogu
  await saved(page);
  check(!(await wa(page)).groups.some(g => g.id === 'g1'), 'skupina smazána');

  // Dny po změnách: počet úprav.
  await page.click('#waTabs [data-watab="dny"]');
  const issues2 = await page.$$eval('.wa-issues li', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  check(issues2.some(x => /3 ručně upravené hodnoty/.test(x)), `počet úprav: ${issues2}`);

  // Proklik z přehledu na týden, další týden, vlastní období.
  await page.click('#waTabs [data-watab="prehled"]');
  await page.click('tr[data-waweek="2026-W42"]');
  await page.waitForSelector('table.wa-days');
  check(await page.evaluate(() => ui.wa.tab === 'dny' && ui.wa.mode === 'week' && ui.wa.week === '2026-W42'), 'týdenní režim');
  check((await page.$$('table.wa-days tbody tr')).length === 5, 'pět dnů týdne');
  await page.click('[data-wastep="1"]');
  check(await page.evaluate(() => ui.wa.week === '2026-W43'), 'další týden');
  await page.click('[data-wamode="custom"]');
  await page.fill('#waFrom', '2026-10-05');
  await page.dispatchEvent('#waFrom', 'change');
  await page.fill('#waTo', '2026-10-09');
  await page.dispatchEvent('#waTo', 'change');
  check((await page.$$('table.wa-days tbody tr')).length === 5, 'vlastní období 5.–9. 10.');
  await page.click('[data-wamode="month"]');

  // Úpravy: seznam a zrušení jedné.
  await page.click('#waTabs [data-watab="upravy"]');
  const ed = await page.$$eval('table.wa-edits tbody tr', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  check(ed.length === 3 && ed.some(x => /Ranní, Brusiči\s*7\s*8\s*Brigádník/.test(x)), `seznam úprav: ${ed}`);
  check(/Návštěva zákazníka/.test(await page.textContent('.wa-notes')), 'poznámky ke dnům');
  await page.screenshot({ path: path.join(shots, '10-upravy.png'), fullPage: true });
  await page.click('[data-waundo="2026-10-01|am.total"]');
  await confirm(page);
  await page.waitForFunction(() => !S.workAudit.edits['2026-10-01']['am.total']);
  await saved(page);
  w = await wa(page);
  check(!w.edits['2026-10-01']['am.total'] && w.edits['2026-10-01']['g.brus.am'], 'zrušena jedna úprava');

  // Nové nahrání opraveného souboru: dny se nahradí, úpravy zůstanou.
  const files2 = await makeFiles(page, 2);
  await page.setInputFiles('#waAttFile', files2.att);
  await page.waitForSelector('#dlg[open] .wa-prev');
  const sum2 = await page.textContent('#dlgBody');
  check(/21 dní už je nahraných/.test(sum2) && /Ruční úpravy \(1\) zůstanou/.test(sum2), `opakované nahrání: ${sum2.slice(0, 400)}`);
  await confirm(page);
  await page.waitForFunction(n => S.workAudit.files.length === n, 3);   // soubor se uloží až po zavření dialogu
  await saved(page);
  w = await wa(page);
  check(w.days['2026-10-01'].g.brus[0] === 9 && w.edits['2026-10-01']['g.brus.am'].v === 8 && w.edits['2026-10-01']['g.brus.am'].was === 7, 'úprava platí dál, původní hodnota ze zápisu zůstala');
  await page.click('#waTabs [data-watab="upravy"]');
  check(/teď 9/.test(await page.textContent('table.wa-edits')), 'upozornění, že soubor má teď jinou hodnotu');

  // Další měsíc (listopad) do historie: přehled po měsících.
  const nov = await makeFiles(page, 1, 11);
  await page.setInputFiles('#waAttFile', nov.att);
  await page.waitForSelector('#dlg[open] .wa-prev');
  check(/20 dní \(2\. 11\. 2026 – 30\. 11\. 2026\)/.test(await page.textContent('#dlgBody')), 'listopad: 20 pracovních dní (17. 11. je svátek)');
  await confirm(page);
  await page.waitForFunction(n => S.workAudit.files.length === n, 4);
  await saved(page);
  await page.setInputFiles('#waWorkFile', nov.work);
  await page.waitForSelector('#dlg[open] .wa-prev');
  check(!/nových operací/.test(await page.textContent('#dlgBody')), 'známé operace nejsou nové');
  await confirm(page);
  await page.waitForFunction(n => S.workAudit.files.length === n, 5);
  await saved(page);
  await page.click('#waTabs [data-watab="prehled"]');
  await page.click('[data-wagrain="month"]');
  check(JSON.stringify(await page.$$eval('table.wa-hist tbody tr', els => els.map(e => e.dataset.wamonth))) === JSON.stringify(['2026-11', '2026-10']), 'dva měsíce');
  await page.screenshot({ path: path.join(shots, '08-mesice.png'), fullPage: true });
  await page.click('[data-wagrain="week"]');
  const range = await page.evaluate(() => waHistRange(S.workAudit, ui.wa.hist));
  check(range.from === '2026-10-01' && range.to === '2026-11-30' && range.wFrom === '2026-09-28', `rozsah přehledu: ${JSON.stringify(range)}`);

  // Excel pro auditora: jen souhrn, týdny a měsíce.
  const xl = await download(page, '[data-waxlsx]', 'audit-test.xlsx');
  check(xl.name === 'audit-2026-10-01-2026-11-30.xlsx' && xl.head.startsWith('PK'), `Excel: ${xl.name}`);
  const book = await page.evaluate(async b64 => {
    const X = await xlsx();
    const wb = X.read(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), { type: 'array' });
    const rows = n => X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null });
    const t40 = waTotals(S.workAudit, waDays(S.workAudit, '2026-09-28', '2026-10-04'));
    return { names: wb.SheetNames, weeks: rows('Týdny'), months: rows('Měsíce'), t40: [t40.workDays, Math.round(t40.avgPeople * 10) / 10, t40.pcs] };
  }, fs.readFileSync(xl.path).toString('base64'));
  check(book.names.join(',') === 'Souhrn,Týdny,Měsíce', `listy: ${book.names}`);
  check(book.weeks.length === 1 + 10 && book.weeks[1][0] === 'T40/2026' && book.weeks[1][1] === '2026-09-28', `týdny v Excelu: ${JSON.stringify(book.weeks.slice(0, 2))}`);
  check(book.weeks[1][3] === book.t40[0] && book.weeks[1][4] === book.t40[1] && book.weeks[1][8] === book.t40[2], `T40 v Excelu sedí s výpočtem: ${JSON.stringify(book.weeks[1])} ${JSON.stringify(book.t40)}`);
  check(book.months.length === 3 && book.months[1][0] === 'říjen 2026' && book.months[2][0] === 'listopad 2026', `měsíce v Excelu: ${JSON.stringify(book.months)}`);

  // PDF pro auditora (A4 na šířku): fakta a grafy, nic interního.
  const pdf = await download(page, '[data-wapdf]', 'audit-test.pdf');
  check(pdf.name === 'audit-2026-10-01-2026-11-30.pdf' && pdf.head === '%PDF-', `PDF: ${pdf.name}`);
  const info = pdfInfo(pdf.path);
  if (info) {
    check(info.pages >= 1 && info.pages <= 3, `stran PDF: ${info.pages}`);
    ['Lidé v práci a zpracované kusy', 'Po měsících', 'Po týdnech', 'Kusy na osobosměnu', 'říjen 2026', 'listopad 2026', 'T40', 'T49', 'Strana 1 /'].forEach(x => check(info.text.includes(x), `PDF bez „${x}“`));
    ['Ke kontrole', 'Ruční úpravy', 'Brigádník', 'Návštěva', 'obsazenost-rijen', 'Údržba', 'Po dnech', 'Odměny'].forEach(x => check(!info.text.includes(x), `PDF obsahuje interní „${x}“`));
  } else console.log('(pypdf ani pymupdf nejsou, text PDF se nekontroluje)');
  const orient = await page.evaluate(async () => {
    const doc = await newPdf('landscape');
    return [Math.round(doc.internal.pageSize.getWidth()), Math.round(doc.internal.pageSize.getHeight()), pdfKit(doc).CW];
  });
  check(orient[0] === 297 && orient[1] === 210 && orient[2] === 265, `A4 na šířku: ${orient}`);
  const portrait = await page.evaluate(async () => pdfKit(await newPdf()).CW);
  check(portrait === 178, 'ostatní PDF dál na výšku');

  // Uložený šifrovaný stav na serveru má po načtení a vyčištění totéž co stránka.
  const server = await page.evaluate(async () => {
    const canon = v => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v);
    const st = sanitizeState((await Vault.loadData()).state);
    return { same: JSON.stringify(canon(st.workAudit)) === JSON.stringify(canon(S.workAudit)), days: Object.keys(st.workAudit.days).length, edits: Object.keys(st.workAudit.edits).length };
  });
  check(server.same && server.days === 41 && server.edits === 2, `stav na serveru: ${JSON.stringify(server)}`);

  // Historie změn: filtr Audit.
  await page.click('#logBtn');
  await page.waitForSelector('#dlg[open] [data-lf="workaudit"]');
  await page.click('[data-lf="workaudit"]');
  const log = await page.textContent('#logList');
  check(/Audit: nahrána obsazenost obsazenost-rijen\.xlsx/.test(log) && /Audit: nahrán výkaz práce/.test(log), 'importy v historii');
  check(/Audit 1\. 10\. 2026 – Ranní, Brusiči: 7 → 8 \(Brigádník/.test(log), `úprava v historii: ${log.slice(0, 500)}`);
  check(/operace „Pískování - hala 2“, skupina: bez skupiny → Obsluha tryskací kabiny/.test(log), 'přiřazení skupiny v historii');
  check(!/operace „Údržba stroje“/.test(log) && !/Lepení a značení dílů, neproduktivní pozice/.test(log), 'změna a návrat zpět se v historii vyruší');
  check(/Audit: smazána skupina „Expedice“/.test(log), 'smazaná skupina v historii');
  await page.screenshot({ path: path.join(shots, '11-historie.png') });
  await page.click('#dlgCancel');

  // Telefon (šířka 390 px): bez přetečení na všech záložkách a v detailu dne.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { showView('audit'); });
  for (const tab of ['prehled', 'dny', 'upravy', 'nastaveni']) {
    await page.evaluate(t => { ui.wa.tab = t; ui.wa.mode = 'month'; ui.wa.month = '2026-10'; renderWorkAudit(); }, tab);
    await page.waitForTimeout(150);
    check(await overflow(page) <= 0, `telefon ${tab}: přetečení ${await overflow(page)} px`);
    await page.screenshot({ path: path.join(shots, `m-${tab}.png`), fullPage: true });
  }
  await page.evaluate(() => { ui.wa.tab = 'dny'; renderWorkAudit(); });
  await page.click('tr[data-waday="2026-10-01"]');
  await page.waitForSelector('#dlg[open] .wa-fgrid');
  check(await page.evaluate(() => { const d = document.querySelector('#dlg'); return d.scrollWidth <= d.clientWidth + 1; }), 'detail dne na telefonu bez přetečení');
  await page.screenshot({ path: path.join(shots, 'm-den.png') });
  await page.click('#dlgCancel');
  await page.setViewportSize({ width: 1440, height: 900 });

  // Tmavý režim.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => { ui.wa.tab = 'prehled'; renderWorkAudit(); });
  await page.screenshot({ path: path.join(shots, '12-tmavy.png'), fullPage: true });
  await page.evaluate(() => { ui.wa.tab = 'dny'; renderWorkAudit(); });
  await page.screenshot({ path: path.join(shots, '13-tmavy-dny.png'), fullPage: true });

  await browser.close();
  if (problems.length) {
    console.log(`PROBLÉMY (${problems.length}):\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log('e2e audit ok');
})().catch(error => { console.error(error); process.exit(1); });
