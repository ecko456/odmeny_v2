// Prohlížečový průchod modulem Audit (verze 2.17 až 2.18): nahrání obsazenosti a výkazu práce
// (Excel vyrobený v prohlížeči z vymyšlených čísel, žádná skutečná data), přehled po týdnech
// s grafy, obsazeností proti požadavku a výpadky lidí, dny s víkendy a svátky, úprava hodnoty
// s důvodem, nastavení skupin a operací (kusy jen u operací se skupinou), úpravy, nové nahrání se
// zachováním úprav, osekaný Excel a PDF pro auditora, výrobní plán (vzor dvou listů, filtr G2/G,
// duplicity, velký soubor, kapacita brusičů), historie změn, telefon a tmavý režim.
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
let expectGone = false;   // kontrola smazaných dílů plánu: 404 je správně

async function watch(page, label) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  page.on('response', r => { if (r.status() >= 400 && !(expectGone && r.status() === 404 && /action=file/.test(r.url()))) problems.push(`${label} HTTP ${r.status()} ${r.url()}`); });
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
/* Vymyšlený výrobní plán se dvěma listy (Zakázky: nadpisy na 3. řádku, Díly: jiné pořadí sloupců
   na 1. řádku). A: vzor a první plán, B: posunuté nadpisy o řádek a sloupec a posunuté termíny,
   BIG: 2 × 60 000 řádků s polovinou duplicit ve druhém listu (očekávané počty spočítané zvlášť). */
async function makePlan(page, variant) {
  const out = await page.evaluate(async variant => {
    const X = await xlsx();
    const D = (m, d) => new Date(Date.UTC(2026, m - 1, d, 12));
    const head1 = ['Číslo objednávky', 'Zákazník', 'EAN', 'Počet ks', 'Index', 'Termín dokončení', 'Technologie', 'Poznámka'];
    const head2 = ['Index', 'Číslo objednávky', 'EAN', 'Technologie', 'Termín dokončení', 'Počet ks'];
    let s1, s2, name, meta = null;
    if (variant === 'A') {
      name = 'plan-tyden-45.xlsx';
      s1 = [['Výrobní plán – hala 2'], ['stav k 2. 11. 2026'], head1,
        [4500100, 'Z1', 8590000000001, 120, 'IX-100', D(11, 4), 'G2', ''],
        [4500101, 'Z1', 8590000000002, 80, 'IX-101', D(11, 5), 'B1/G', ''],
        [4500102, 'Z2', 8590000000003, 60, 'IX-102', D(11, 11), 'GR', ''],
        [4500103, 'Z2', 8590000000004, 40, 'IX-103', D(11, 12), 'B1', ''],
        [4500100, 'Z1', 8590000000001, 120, 'IX-100', D(11, 2), 'G2', 'starší verze'],
        [4500104, 'Z3', 8590000000005, 0, 'IX-104', D(11, 12), 'G2', 'bez kusů'],
        [4500105, 'Z3', 8590000000006, 200, 'IX-105', D(11, 18), 'G + K', '']];
      s2 = [head2,
        ['IX-200', 4500200, 8590000000100, 'G2', D(11, 25), 300],
        ['IX-201', 4500201, 8590000000101, 'G', D(12, 2), 150],
        ['ix-100', '4500100', '8590000000001', 'G2', D(11, 9), 130]];
    } else if (variant === 'B') {
      name = 'plan-tyden-46.xlsx';
      s1 = [['Výrobní plán – hala 2'], ['stav k 9. 11. 2026'], [], ['Poř.', ...head1],
        [1, 4500101, 'Z1', 8590000000002, 80, 'IX-101', D(11, 12), 'B1/G', 'posunuto'],
        [2, 4500105, 'Z3', 8590000000006, 200, 'IX-105', D(11, 16), 'G + K', 'starší než dřív'],
        [3, 4500300, 'Z4', 8590000000200, 90, 'IX-300', D(11, 26), 'G2', '']];
      s2 = [head2, ['IX-200', 4500200, 8590000000100, 'G2', D(11, 25), 300]];
    } else {
      name = 'plan-velky.xlsx';
      const N = 60000;
      const TECH = ['G2', 'G', 'B1', 'GR', 'G2/B'];
      const ok = t => t.toUpperCase().split(/[^A-Z0-9]+/).some(x => x === 'G2' || x === 'G');
      const iso = dt => dt.toISOString().slice(0, 10);
      const exp = new Map();
      const seen = new Set();
      let rows = 0, matched = 0, dupes = 0;
      const add = (key, dt, ks, tech) => {
        rows += 1;
        if (!ok(tech)) return;
        matched += 1;
        if (seen.has(key)) dupes += 1; else seen.add(key);
        const o = exp.get(key);
        if (!o || iso(dt) >= o[0]) exp.set(key, [iso(dt), ks]);
      };
      s1 = [['Výrobní plán – velký'], [''], head1];
      s2 = [head2];
      const due1 = [];
      for (let i = 0; i < N; i += 1) {
        const dt = new Date(Date.UTC(2026, 9, 12 + (i % 70), 12));
        due1.push(dt);
        s1.push([5000000 + i, `Z${i % 50}`, 8600000000000 + i, 1 + (i % 7), `L-${i % 5000}`, dt, TECH[i % 5], '']);
        add(`${5000000 + i}|L-${i % 5000}|${8600000000000 + i}`, dt, 1 + (i % 7), TECH[i % 5]);
      }
      for (let j = 0; j < N; j += 1) {
        if (j < N / 2) {
          const dt = new Date(due1[j].getTime() + (j % 3 === 0 ? 7 : j % 3 === 1 ? -3 : 0) * 864e5);
          s2.push([`L-${j % 5000}`, 5000000 + j, 8600000000000 + j, TECH[j % 5], dt, 2 + (j % 5)]);
          add(`${5000000 + j}|L-${j % 5000}|${8600000000000 + j}`, dt, 2 + (j % 5), TECH[j % 5]);
        } else {
          const dt = new Date(Date.UTC(2026, 9, 12 + (j % 63), 12));
          s2.push([`M-${j % 3000}`, 5100000 + j, 8610000000000 + j, TECH[(j + 1) % 5], dt, 1 + (j % 4)]);
          add(`${5100000 + j}|M-${j % 3000}|${8610000000000 + j}`, dt, 1 + (j % 4), TECH[(j + 1) % 5]);
        }
      }
      const weeks = {};
      exp.forEach(([d, ks]) => { const w = isoWeek(d).id; weeks[w] = (weeks[w] || 0) + ks; });
      meta = { rows, matched, dupes, items: exp.size, weeks };
    }
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(s1), 'Zakázky');
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(s2), 'Díly');
    const bytes = new Uint8Array(X.write(wb, { bookType: 'xlsx', type: 'array', compression: true }));
    let b = '';
    for (let i = 0; i < bytes.length; i += 0x8000) b += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { name, b64: btoa(b), meta };
  }, variant);
  const file = { name: out.name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(out.b64, 'base64') };
  return out.meta ? { file, ...out.meta } : file;
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

  // Výchozí požadavek (2.18.1): pevných 100 lidí na pracovní den.
  check(await page.evaluate(() => S.workAudit.target) === 100, 'výchozí požadavek 100 lidí');
  await page.click('#waTabs [data-watab="prehled"]');
  await page.waitForSelector('#waView .wa-stats');
  const t100 = await tiles(page);
  const avg100 = await page.evaluate(() => { const r = waHistRange(S.workAudit, ui.wa.hist); const t = waTotals(S.workAudit, waDays(S.workAudit, r.from, r.to)); return waP(t.avgPeople / 100).replace(/\s+/g, ' '); });
  check(/^Obsazenost proti plánu: 0 %$/.test(t100[1]) && (await page.textContent('#waView .wa-stats')).replace(/\s+/g, ' ').includes(`Ø ${avg100} požadavku`) && /požadavek Ø 100 \(pevný\)/.test((await page.textContent('#waView .wa-stats')).replace(/\s+/g, ' '))
    && /pevně 100 lidí/.test(await page.textContent('#waCharts2')) && /Požadavek = pevně 100 lidí na pracovní den/.test((await page.textContent('#waView .hint')).replace(/\s+/g, ' ')), `přehled s požadavkem 100: ${t100}`);
  await page.screenshot({ path: path.join(shots, '04a-pozadavek-100.png'), fullPage: true });
  // Dál test počítá s požadavkem ze souboru: pole v Nastavení vyprázdnit.
  await page.click('#waTabs [data-watab="nastaveni"]');
  check(await page.inputValue('#waTarget') === '100', 'Nastavení ukazuje požadavek 100');
  await page.fill('#waTarget', '');
  await page.press('#waTarget', 'Tab');
  await page.waitForFunction(() => S.workAudit.target === null);
  await saved(page);

  // Přehled: historie po týdnech, požadavek ze souboru.
  await page.click('#waTabs [data-watab="prehled"]');
  await page.waitForSelector('#waView .wa-stats');
  const t1 = await tiles(page);
  check(t1.length === 4 && /Lidé v práci: .*Ø na den/.test(t1[0]) && /^Obsazenost proti plánu: [\d,]+ %$/.test(t1[1]), `dlaždice: ${t1}`);
  const met = await page.evaluate(() => { const r = waHistRange(S.workAudit, ui.wa.hist); const t = waTotals(S.workAudit, waDays(S.workAudit, r.from, r.to)); return [t.metDays, t.reqDays]; });
  check(new RegExp(`${met[0]} z ${met[1]} pracovních dní s požadavkem splněným \\(≥ 100 %\\)`).test((await page.textContent('#waView .wa-stats')).replace(/\s+/g, ' ')), `podíl dní se splněným požadavkem: ${met}`);
  check(/1 operace z výkazu práce nemá skupinu/.test(await page.textContent('#waView .note.w')), 'upozornění na operaci bez skupiny');
  const marks = await page.$$eval('#waCharts .chart', els => els.map(e => [e.querySelectorAll('path.bar').length, e.querySelectorAll('.wa-plan').length, e.querySelectorAll('.wa-dot').length, (e.querySelector('.cap') || { textContent: '' }).textContent]));
  check(JSON.stringify(marks.map(m => m.slice(0, 3))) === JSON.stringify([[5, 5, 0], [5, 0, 0], [0, 0, 5]]), `grafy po týdnech (sloupce, plán, body): ${JSON.stringify(marks)}`);
  check(marks.every(m => m[3]), 'popsaná poslední hodnota');
  await page.hover('#waCharts .chart:first-child .hit >> nth=0');
  check(/T40\/2026 \(28\. 9\.–4\. 10\.\): Ø 44 lidí na pracovní den z požadavku 46 · splněno 0 z 2 dní/.test(await page.textContent('#waTip')), `tooltip: ${await page.textContent('#waTip')}`);
  await page.mouse.move(5, 5);
  check(JSON.stringify(await page.$$eval('table.wa-hist tbody tr', els => els.map(e => e.dataset.waweek))) === JSON.stringify(['2026-W44', '2026-W43', '2026-W42', '2026-W41', '2026-W40']), 'tabulka týdnů od nejnovějšího');
  // Výpadek lidí a dorovnání (2.18): bilance proti požadavku, výpadky a návrh dorovnání.
  const st = await page.evaluate(() => { const r = waHistRange(S.workAudit, ui.wa.hist); const x = waStaffing(S.workAudit, waDays(S.workAudit, r.from, r.to)); return { ...x, bal: waSigned(x.balance, 1).replace(/\s+/g, ' ') }; });
  const staffText = (await page.textContent('#waView .wa-staff')).replace(/\s+/g, ' ');
  check(st.n === 20 && st.open && st.balance < 0, `výpadek lidí (říjen má požadavek nad stavem): ${JSON.stringify({ n: st.n, bal: st.balance, open: st.open })}`);
  check(staffText.includes(`Na dorovnání: +${st.open.extra} `) && staffText.includes(`po ${st.open.needDays} `) && staffText.includes(st.bal), `karta výpadku: ${staffText.slice(0, 400)}`);
  check(await page.$$eval('#waCharts2 .wa-dot.neg', els => els.length) >= 1 && await page.$('#waCharts2 line.ref'), 'graf bilance s nulovou osou a body pod nulou');
  await page.hover('#waCharts2 .hit >> nth=0');
  check(/T40\/2026 \(28\. 9\.–4\. 10\.\): týden −\d/.test(await page.textContent('#waTip2')) && await page.$eval('#waTip', e => e.hidden), `tooltip bilance: ${await page.textContent('#waTip2')}`);
  await page.mouse.move(5, 5);
  check(!(await page.$('[data-wagrain]')) && !/Po měsících|osobosměny/i.test(await page.textContent('#waView .wa-hist-bar')), 'jen týdny, bez přepínače měsíců');
  check(!/Osobosměny/.test(await page.textContent('table.wa-hist thead')) && /Splněno dní/.test(await page.textContent('table.wa-hist thead')), 'tabulka týdnů bez osobosměn, se splněnými dny');
  await page.screenshot({ path: path.join(shots, '04-prehled.png'), fullPage: true });

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

  // Další měsíc (listopad) do historie: přehled po týdnech.
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
  check((await page.$$('table.wa-hist tbody tr[data-waweek]')).length === 10, 'deset týdnů');
  await page.screenshot({ path: path.join(shots, '08-tydny.png'), fullPage: true });
  const range = await page.evaluate(() => waHistRange(S.workAudit, ui.wa.hist));
  check(range.from === '2026-10-01' && range.to === '2026-11-30' && range.wFrom === '2026-09-28', `rozsah přehledu: ${JSON.stringify(range)}`);
  // Pevný požadavek z Nastavení (doslovně „100 lidí a více“): přepočte splněné dny i bilanci.
  await page.click('#waTabs [data-watab="nastaveni"]');
  await page.fill('#waTarget', '40');
  await page.press('#waTarget', 'Tab');
  await page.waitForFunction(() => S.workAudit.target === 40);
  await saved(page);
  await page.click('#waTabs [data-watab="prehled"]');
  const fixed = await page.evaluate(() => { const r = waHistRange(S.workAudit, ui.wa.hist); const t = waTotals(S.workAudit, waDays(S.workAudit, r.from, r.to)); return [t.metDays, t.reqDays, t.avgReq]; });
  check(fixed[2] === 40 && fixed[0] > 0 && /požadavek Ø 40 \(pevný\)/.test((await page.textContent('#waView .wa-stats')).replace(/\s+/g, ' ')), `pevný požadavek: ${fixed}`);
  await page.click('#waTabs [data-watab="nastaveni"]');
  await page.fill('#waTarget', 'sto');
  await page.press('#waTarget', 'Tab');
  check(/celý počet lidí/.test(await page.textContent('#toast')) && await page.evaluate(() => S.workAudit.target === 40), 'neplatný požadavek');
  await page.fill('#waTarget', '');
  await page.press('#waTarget', 'Tab');
  await page.waitForFunction(() => S.workAudit.target === null);
  await saved(page);
  await page.click('#waTabs [data-watab="prehled"]');

  // Rozpad po skupinách: tabulka všech skupin, klepnutí přepne grafy a tabulku na skupinu.
  const gRows = await page.$$eval('table.wa-gtab tbody tr', els => els.map(e => [e.dataset.wagrp, e.textContent.replace(/\s+/g, ' ').trim()]));
  check(gRows.length === 7 && /neproduktivní/.test(gRows[4][1]) && /mimo IS/.test(gRows[6][1]), `skupiny v přehledu: ${JSON.stringify(gRows)}`);
  const gExp = await page.evaluate(() => { const r = waHistRange(S.workAudit, ui.wa.hist); const v = waFx(waTotals(S.workAudit, waDays(S.workAudit, r.from, r.to)), 'brus'); return [nf(v.avg, 1), `${nf(v.share * 100, 1)} %`, nf(v.pcs, 0)].map(x => x.replace(/\s+/g, ' ')); });
  check(gExp.every(x => gRows[0][1].includes(x)), `Brusiči v rozpadu: ${gRows[0][1]} ${gExp}`);
  check(await page.$$eval('table.wa-gtab .wa-gbar i', els => els.filter(e => parseFloat(e.style.width) > 0).length) === 13, 'pruhy lidí a kusů (Daiho bez kusů)');
  check(await page.$$eval('table.wa-gtab .wa-gbar', els => els.length) === 13, 'Daiho mimo IS bez pruhu kusů');
  await page.screenshot({ path: path.join(shots, '08b-skupiny.png'), fullPage: true });
  await page.click('tr[data-wagrp="brus"]');
  await page.waitForFunction(() => ui.wa.group === 'brus');
  check(await page.inputValue('#waGroup') === 'brus' && /Podíl na lidech v práci/.test(await page.textContent('#waView .wa-stats')), 'skupina vybraná, dlaždice skupiny');
  check((await page.$$('#waCharts .wa-plan')).length === 0 && /Brusiči/.test(await page.textContent('#waCharts')), 'grafy skupiny bez plánu');
  check(/Podíl/.test(await page.textContent('table.wa-hist thead')) && await page.$eval('tr[data-wagrp="brus"]', e => e.classList.contains('on')), 'tabulka období pro skupinu');
  await page.screenshot({ path: path.join(shots, '08c-brusici.png'), fullPage: true });
  const gpdf = await download(page, '[data-wapdf]', 'report-brus.pdf');
  check(gpdf.name === 'report-2026-10-01-2026-11-30-brus.pdf' && gpdf.head === '%PDF-', `PDF skupiny: ${gpdf.name}`);
  const ginfo = pdfInfo(gpdf.path);
  if (ginfo) check(ginfo.text.includes('Lidé v práci a zpracované kusy – Brusiči') && !ginfo.text.includes('Po skupinách') && !ginfo.text.includes('Výpadek lidí') && ginfo.text.includes('Podíl'), `PDF skupiny: ${ginfo.text.slice(0, 300)}`);
  const gxl = await download(page, '[data-waxlsx]', 'report-brus.xlsx');
  const gbook = await page.evaluate(async b64 => { const X = await xlsx(); const wb = X.read(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), { type: 'array' }); return [wb.SheetNames, X.utils.sheet_to_json(wb.Sheets.Souhrn, { header: 1 })[0][0]]; }, fs.readFileSync(gxl.path).toString('base64'));
  check(gxl.name === 'report-2026-10-01-2026-11-30-brus.xlsx' && gbook[0].join(',') === 'Souhrn,Týdny' && /– Brusiči$/.test(gbook[1]), `Excel skupiny: ${gxl.name} ${JSON.stringify(gbook)}`);
  await page.selectOption('#waGroup', '');
  await page.waitForFunction(() => ui.wa.group === '');

  // Excel pro auditora: souhrn, skupiny, výpadky a týdny (2.18 bez měsíců a osobosměn).
  const xl = await download(page, '[data-waxlsx]', 'report-test.xlsx');
  check(xl.name === 'report-2026-10-01-2026-11-30.xlsx' && xl.head.startsWith('PK'), `Excel: ${xl.name}`);
  const book = await page.evaluate(async b64 => {
    const X = await xlsx();
    const wb = X.read(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), { type: 'array' });
    const rows = n => X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null });
    const t40 = waTotals(S.workAudit, waDays(S.workAudit, '2026-10-01', '2026-10-04'));
    return { names: wb.SheetNames, weeks: rows('Týdny'), eps: rows('Výpadky'), groups: rows('Skupiny'), all: wb.SheetNames.map(rows), t40: [t40.workDays, Math.round(t40.avgPeople * 10) / 10, t40.pcs] };
  }, fs.readFileSync(xl.path).toString('base64'));
  check(book.names.join(',') === 'Souhrn,Skupiny,Výpadky,Týdny', `listy: ${book.names}`);
  check(!JSON.stringify(book.all).includes('Osobosměny') && book.eps.length >= 2 && book.eps[0][0] === 'Od', `bez osobosměn, výpadky: ${JSON.stringify(book.eps)}`);
  check(book.groups.length === 8 && book.groups[1][0] === 'Brusiči' && book.groups[5][1] === 'neproduktivní', `skupiny v Excelu: ${JSON.stringify(book.groups.slice(0, 2))}`);
  check(book.weeks.length === 1 + 10 && book.weeks[1][0] === 'T40/2026' && book.weeks[1][1] === '2026-10-01', `týdny v Excelu: ${JSON.stringify(book.weeks.slice(0, 2))}`);
  check(book.weeks[1][3] === book.t40[0] && book.weeks[1][4] === book.t40[1] && book.weeks[1][9] === book.t40[2], `T40 v Excelu sedí s výpočtem: ${JSON.stringify(book.weeks[1])} ${JSON.stringify(book.t40)}`);
  check(book.weeks[0][6] === 'Dny se splněným požadavkem' && book.weeks[0][11] === 'Kumulovaná bilance (člověkodny)', `sloupce týdnů: ${JSON.stringify(book.weeks[0])}`);

  // PDF pro auditora (A4 na šířku): fakta a grafy, nic interního.
  const pdf = await download(page, '[data-wapdf]', 'report-test.pdf');
  check(pdf.name === 'report-2026-10-01-2026-11-30.pdf' && pdf.head === '%PDF-', `PDF: ${pdf.name}`);
  const info = pdfInfo(pdf.path);
  if (info) {
    check(info.pages >= 1 && info.pages <= 3, `stran PDF: ${info.pages}`);
    ['Lidé v práci a zpracované kusy', 'Obsazenost proti plánu', 'Výpadek lidí a dorovnání', 'Kumulovaná bilance lidí', 'Na dorovnání: +', 'Po skupinách', 'Brusiči', 'Obsluha tryskací kabiny', 'Po týdnech', 'Kusy na osobosměnu', 'Splněno', 'Bilance', 'T40', 'T49', 'Strana 1 /'].forEach(x => check(info.text.includes(x), `PDF bez „${x}“`));
    ['Po měsících', 'Osobosměny', 'říjen 2026'].forEach(x => check(!info.text.includes(x), `PDF má „${x}“ (2.18 jen týdny, bez osobosměn)`));
    check(info.text.replace(/\s/g, '').includes('HALA2·REPORT') && !/audit/i.test(info.text.replace(/\s/g, '')), 'PDF: HALA 2 · REPORT, nikde „audit“');
    ['Ke kontrole', 'Ruční úpravy', 'Brigádník', 'Návštěva', 'obsazenost-rijen', 'Údržba', 'Po dnech', 'Odměny'].forEach(x => check(!info.text.includes(x), `PDF obsahuje interní „${x}“`));
  } else console.log('(pypdf ani pymupdf nejsou, text PDF se nekontroluje)');
  const orient = await page.evaluate(async () => {
    const doc = await newPdf('landscape');
    return [Math.round(doc.internal.pageSize.getWidth()), Math.round(doc.internal.pageSize.getHeight()), pdfKit(doc).CW];
  });
  check(orient[0] === 297 && orient[1] === 210 && orient[2] === 265, `A4 na šířku: ${orient}`);
  const portrait = await page.evaluate(async () => pdfKit(await newPdf()).CW);
  check(portrait === 178, 'ostatní PDF dál na výšku');

  // Výrobní plán (2.18): vzor ze souboru se dvěma listy, filtr technologie G2/G, duplicity podle
  // objednávky, indexu a EAN s nejpozdějším termínem, velký soubor a kapacita brusičů.
  await page.click('#waTabs [data-watab="plan"]');
  await page.waitForSelector('#waView .wa-start [data-waplantpl]');
  check(await page.$eval('[data-waplanpick]', e => e.disabled), 'bez vzoru nejde plán nahrát');
  check(/G2 nebo G/.test(await page.textContent('#waView')) && await page.inputValue('#waPlanWords') === 'G2, G', 'výchozí filtr G2 a G');
  await page.screenshot({ path: path.join(shots, '14-plan-start.png'), fullPage: true });
  const planA = await makePlan(page, 'A');
  await page.setInputFiles('#waPlanTplFile', planA);
  await page.waitForSelector('#dlg[open] .wa-tpl-sheet');
  const tplSel = await page.$$eval('#dlg .wa-tpl-sheet', els => els.map(e => [e.querySelector('[data-tplhead]').value, ...[...e.querySelectorAll('[data-tplf]')].map(x => `${x.dataset.tplf}:${x.value}`)]));
  check(JSON.stringify(tplSel) === JSON.stringify([['3', 'order:0', 'ean:2', 'ks:3', 'index:4', 'due:5', 'tech:6'], ['1', 'order:1', 'ean:2', 'ks:5', 'index:0', 'due:4', 'tech:3']]), `vzor: nadpisy a sloupce podle názvů: ${JSON.stringify(tplSel)}`);
  check((await page.$$('#dlg .wa-tpl-sheet table.wa-prev tbody tr')).length === 7 && /4\. 11\. 2026/.test(await page.textContent('#dlg .wa-tpl-sheet')), 'náhled prvních řádků s termínem jako datem');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(shots, '15-plan-vzor.png') });
  await page.uncheck('#dlg [data-tplsh="0"] [data-tpluse]');
  await page.uncheck('#dlg [data-tplsh="1"] [data-tpluse]');
  await page.click('#dlgOk');
  check(/Vyber aspoň jeden list/.test(await page.textContent('#dlgBody')), 'vzor bez listu neprojde');
  await page.check('#dlg [data-tplsh="0"] [data-tpluse]');
  await page.check('#dlg [data-tplsh="1"] [data-tpluse]');
  await page.selectOption('#dlg [data-tplsh="1"] [data-tplf="due"]', '');
  await page.click('#dlgOk');
  check(/List Díly: chybí sloupec počtu kusů nebo termínu/.test(await page.textContent('#dlgBody')), 'vzor bez termínu neprojde');
  await page.selectOption('#dlg [data-tplsh="1"] [data-tplf="due"]', '4');
  await page.click('#dlgOk');
  await page.waitForSelector('#dlg[open] #dlgOk:has-text("Nahrát do plánu")');
  w = await wa(page);
  check(JSON.stringify(w.plan.tpl.sheets.map(x => [x.name, x.header, Object.values(x.cols).join('')])) === JSON.stringify([['Zakázky', 2, 'ACDEFG'], ['Díly', 0, 'BCFAED']]) && w.plan.tpl.sheets[0].heads.due === 'Termín dokončení', `uložený vzor: ${JSON.stringify(w.plan.tpl)}`);
  await page.click('#dlgOk');
  await page.waitForSelector('#dlg[open] .wa-impfile', { timeout: 60000 });
  const impA = (await page.textContent('#dlgBody')).replace(/\s+/g, ' ');
  const impRows = () => page.$$eval('#dlg .wa-impfile', els => els.map(e => [e.querySelector('b').textContent, ...[...e.querySelectorAll('dd')].map(d => d.textContent.replace(/\s+/g, ''))].join(' ')));
  const rowA = (await impRows())[0];
  check(rowA === 'plan-tyden-45.xlsx 10 7 2 1 2 5 1 1', `souhrn plánu A (řádků, G2/G, jiná, neplatné, duplicity, nové, posunuté, starší): ${rowA}`);
  check(/Položek v plánu: 5/.test(impA) && /T45\/2026 až T49\/2026/.test(impA), `položky a týdny: ${impA.slice(0, 700)}`);
  const chips = await page.$$eval('#dlg .wa-tech', els => els.map(e => `${e.classList.contains('ok') ? '+' : '-'}${e.textContent.replace(/\s+/g, '')}`).join(' '));
  check(chips === '+G25 +B1/G1 -✕GR1 -✕B11 +G+K1 +G1', `technologie v souborech s označením, co se bere: ${chips}`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(shots, '16-plan-souhrn.png') });
  await confirm(page);
  await page.waitForFunction(() => S.workAudit.plan.items === 5 && !ui.wa.planBusy, null, { timeout: 30000 });
  await saved(page);
  w = await wa(page);
  const sortedWeeks = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k].ks, o[k].n]));
  check(w.plan.chunks.length === 1 && sortedWeeks(w.plan.weeks) === JSON.stringify([['2026-W45', 80, 1], ['2026-W46', 130, 1], ['2026-W47', 200, 1], ['2026-W48', 300, 1], ['2026-W49', 150, 1]])
    && w.plan.files.length === 1 && w.plan.files[0].matched === 7, `plán po prvním souboru: ${JSON.stringify([w.plan.weeks, w.plan.files])}`);
  const chunks1 = w.plan.chunks.slice();
  // Druhý soubor (posunuté nadpisy a sloupce, posunuté termíny) a velký soubor najednou.
  const planB = await makePlan(page, 'B');
  const big = await makePlan(page, 'BIG');
  const t0 = Date.now();
  await page.setInputFiles('#waPlanFile', [planB, big.file]);
  await page.waitForSelector('#dlg[open] .wa-impfile', { timeout: 180000 });
  const tRead = Date.now() - t0;
  const impB = await impRows();
  check(impB[0] === 'plan-tyden-46.xlsx 4 4 0 0 0 1 1 1', `souhrn plánu B: ${impB[0]}`);
  const bigRow = impB[1].split(' ');
  check(bigRow[0] === 'plan-velky.xlsx' && +bigRow[1] === big.rows && +bigRow[2] === big.matched && +bigRow[5] === big.dupes && +bigRow[6] === big.items, `velký soubor: ${impB[1]} (čekáno ${JSON.stringify({ ...big, weeks: 0, file: 0 })})`);
  check(/nadpisy ze vzoru se nenašly/.test(await page.textContent('#dlgBody')) === false, 'posunuté nadpisy se našly podle názvu');
  await page.click('#dlgOk');
  await page.waitForFunction(() => !ui.wa.planBusy && S.workAudit.plan.files.length === 3 && !document.querySelector('#dlg[open]'), null, { timeout: 180000 });
  await saved(page);
  const tAll = Date.now() - t0;
  w = await wa(page);
  const expItems = 6 + big.items;
  check(w.plan.items === expItems && w.plan.chunks.length >= 2, `položky po velkém souboru: ${w.plan.items} (čekáno ${expItems}), dílů ${w.plan.chunks.length}`);
  check(w.plan.weeks['2026-W46'].ks === 130 + 80 + (big.weeks['2026-W46'] || 0) && w.plan.weeks['2026-W48'].ks === 300 + 90 + (big.weeks['2026-W48'] || 0), `posunuté termíny a kusy po týdnech: ${JSON.stringify(w.plan.weeks)}`);
  console.log(`výrobní plán: ${big.rows} řádků velkého souboru načteno za ${(tRead / 1000).toFixed(1)} s, uloženo za ${(tAll / 1000).toFixed(1)} s, ${w.plan.chunks.length} dílů`);
  check(tAll < 120000, `velký plán trval ${tAll} ms`);
  // Staré díly se po uložení smažou, nové jdou načíst a obsahují všechny položky.
  await page.waitForTimeout(800);
  expectGone = true;
  const store1 = await page.evaluate(async old => {
    const gone = await Promise.all(old.map(id => Vault.loadFile(id).then(() => false, e => e.status === 404)));
    const { map, lost } = await waPlanLoad(S.workAudit.plan, async () => {});
    const it = map.get('4500100|IX-100|8590000000001');
    const sizes = await Promise.all(S.workAudit.plan.chunks.map(async id => (await Vault.api('file', { query: { id } })).blob.length));
    return { gone, size: map.size, lost: lost.length, it, maxBlob: Math.max(...sizes) };
  }, chunks1);
  expectGone = false;
  check(store1.gone.every(Boolean) && store1.size === expItems && !store1.lost && JSON.stringify(store1.it) === JSON.stringify(['2026-11-09', 130]) && store1.maxBlob < 2304 * 1024, `díly plánu na serveru: ${JSON.stringify(store1)}`);
  // Přehled plánu: kapacita brusičů = směny skupiny × 25 ks (skutečná v týdnech s obsazeností).
  await page.click('[data-waplanrange="all"]');
  await page.waitForSelector('#waPlanCharts .chart svg');
  const planTiles = await tiles(page);
  check(planTiles.length === 4 && /^Kusy k dodání: /.test(planTiles[0]) && /^Kapacita brusičů: /.test(planTiles[1]), `dlaždice plánu: ${planTiles}`);
  const w45 = await page.evaluate(() => {
    const wa = S.workAudit;
    let shifts = 0;
    ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'].forEach(iso => { shifts += (waVal(wa, iso, 'g.brus.am') || 0) + (waVal(wa, iso, 'g.brus.pm') || 0); });
    const row = [...document.querySelectorAll('table.wa-plantab tbody tr')].find(tr => tr.textContent.includes('T45/2026'));
    const n = v => nf(v, 0).replace(/\s+/g, ' ');
    return { cap: shifts * 25, text: row ? row.textContent.replace(/\s+/g, ' ') : '', plan: wa.plan.weeks['2026-W45'].ks, capT: n(shifts * 25), planT: n(wa.plan.weeks['2026-W45'].ks) };
  });
  check(w45.cap > 0 && w45.text.includes(w45.capT) && w45.text.includes(w45.planT), `T45: kapacita ${w45.cap}, plán ${w45.plan}: ${w45.text}`);
  check((await page.$$('#waPlanCharts .chart')).length === 2 && await page.$$eval('#waPlanCharts .wa-capline', els => els.length) === 1 && await page.$$eval('#waPlanCharts figure.chart:last-of-type .wa-plan', els => els.length) > 0, 'grafy plánu s kapacitou a stavem brusičů');
  await page.hover('#waPlanCharts .chart:first-child .hit >> nth=1');
  check(/ks k dodání .* kapacita/.test(await page.textContent('#waTip3')), `tooltip plánu: ${await page.textContent('#waTip3')}`);
  await page.mouse.move(5, 5);
  await page.screenshot({ path: path.join(shots, '17-plan.png'), fullPage: true });
  // Nastavení kapacity: kusy za směnu a skupina.
  await page.fill('#waPlanPer', '30');
  await page.press('#waPlanPer', 'Tab');
  await page.waitForFunction(() => S.workAudit.plan.cap.perShift === 30);
  await saved(page);
  const cap30 = await page.evaluate(() => waPlanCapacity(S.workAudit, ['2026-W45'])[0].cap);
  check(cap30 === w45.cap / 25 * 30, `kapacita s 30 ks na směnu: ${cap30}`);
  await page.fill('#waPlanPer', '-1');
  await page.press('#waPlanPer', 'Tab');
  check(/kladné číslo/.test(await page.textContent('#toast')), 'neplatné kusy za směnu');
  await page.fill('#waPlanPer', '25');
  await page.press('#waPlanPer', 'Tab');
  await page.waitForFunction(() => S.workAudit.plan.cap.perShift === 25);
  await saved(page);
  await page.fill('#waPlanWords', 'g2; g, gx');
  await page.press('#waPlanWords', 'Tab');
  await page.waitForFunction(() => S.workAudit.plan.tech.words.join() === 'G2,G,GX');
  await page.fill('#waPlanWords', 'G2, G');
  await page.press('#waPlanWords', 'Tab');
  await page.waitForFunction(() => S.workAudit.plan.tech.words.join() === 'G2,G');
  await saved(page);
  // Záloha obsahuje díly plánu.
  const bk = await page.evaluate(async () => { const f = await Vault.backup(S, [...lbFileIds(S), ...waPlanFileIds(S)]); return S.workAudit.plan.chunks.every(id => typeof (f.files || {})[id] === 'string'); });
  check(bk, 'záloha obsahuje šifrované díly plánu');

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
  check(/Audit: vzor výrobního plánu podle souboru plan-tyden-45\.xlsx/.test(log) && /Audit: nahrán výrobní plán plan-tyden-45\.xlsx \(7 řádků G2 nebo G/.test(log.replace(/\s+/g, ' '))
    && /Audit: nahrán výrobní plán plan-tyden-46\.xlsx, plan-velky\.xlsx/.test(log), `výrobní plán v historii: ${log.slice(0, 900)}`);
  await page.screenshot({ path: path.join(shots, '11-historie.png') });
  await page.click('#dlgCancel');

  // Telefon (šířka 390 px): bez přetečení na všech záložkách a v detailu dne.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { showView('audit'); });
  for (const tab of ['prehled', 'plan', 'dny', 'upravy', 'nastaveni']) {
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
  await page.evaluate(() => { ui.wa.tab = 'plan'; renderWorkAudit(); });
  await page.screenshot({ path: path.join(shots, '18-tmavy-plan.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });

  // Smazání plánu: položky i díly na serveru pryč, vzor a nastavení zůstanou.
  const chunks2 = (await wa(page)).plan.chunks;
  await page.click('[data-waplanclear]');
  await confirm(page);
  await page.waitForFunction(() => S.workAudit.plan.items === 0);
  await saved(page);
  await page.waitForTimeout(800);
  expectGone = true;
  const cleared = await page.evaluate(async old => ({ gone: (await Promise.all(old.map(id => Vault.loadFile(id).then(() => false, e => e.status === 404)))).every(Boolean), tpl: !!S.workAudit.plan.tpl, weeks: Object.keys(S.workAudit.plan.weeks).length }), chunks2);
  expectGone = false;
  check(cleared.gone && cleared.tpl && !cleared.weeks && /Plán je prázdný/.test(await page.textContent('#waView')), `smazaný plán: ${JSON.stringify(cleared)}`);

  await browser.close();
  if (problems.length) {
    console.log(`PROBLÉMY (${problems.length}):\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log('e2e audit ok');
})().catch(error => { console.error(error); process.exit(1); });
