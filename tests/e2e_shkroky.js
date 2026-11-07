// Prohlížečový průchod 2.61: Shortage ve třech krocích. Soubory vyrobí openpyxl (výplně buněk
// RGB, z motivu a z palety Excelu, hypertextové odkazy), sloupce jsou jinde než výchozí.
// Ověří: panel tří kroků, okno se sloupci (odhad podle nadpisů, vzor, list plánu), vzorník barev
// EANu (TOP / TOP 2 / běžná, zapamatování), výrobní plán podle sloupců, evidence pohybu (soubor,
// operace a počet záznamů), návrh AI (jen nadpisy a typy buněk, poznámka AI otevře okno),
// Upravit sloupce, Rozbor položek (všechny poddíly, zápis do prázdných poznámek, Excel), historie,
// monitor bez přetečení, telefon. Spuštění jako e2e_shortage.js; snímky v $S/oshots-shkroky.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-shkroky');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

async function watch(page, label) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  page.on('pageerror', err => problems.push(`${label} pageerror: ${err.message}`));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`)));
}
const saved = page => page.waitForFunction(() => !store.dirty && !store.saving && document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 15000 });
const dlgOpen = (page, re) => page.waitForFunction(r => { const d = document.querySelector('#dlg[open]'); return d && new RegExp(r).test(d.textContent); }, re.source, { timeout: 15000 });
const dlgClosed = page => page.waitForFunction(() => !document.querySelector('#dlg[open]'));
const L = c => `http://is.example/commission.production.detail/default/1?activeBarcode=${c}&x=1`;

// ---------- soubory (vymyšlená data) ----------
const PY = String.raw`
import sys, json
from openpyxl import Workbook
from openpyxl.styles import PatternFill
from openpyxl.styles.colors import Color
out = sys.argv[1]; L = lambda c: 'http://is.example/commission.production.detail/default/1?activeBarcode=' + c + '&x=1'
# 1. urgentní díly: A zakázka, B popis, C EAN, D index, E množství, F operace (TOP ve sloupci není)
wb = Workbook(); ws = wb.active; ws.title = 'Urgenty'
ws.append(['Urgentní díly HALA 2'])
ws.append(['Zakázka', 'Popis', 'EAN', 'Index', 'Množství', 'Probíhající operace'])
rows = [('OBJ-501', 'Hřídel velká', '8590000005001', 'A', 4, 'Broušení – hala 2', 'rgb'),
        ('OBJ-502', 'Kryt motoru', '8590000005002', 'B', 2, 'Frézování Hala 2', 'idx'),
        ('OBJ-503', 'Pouzdro', '8590000005003', 'C', 7, '', 'theme'),
        ('OBJ-504', 'Šroub M8', '8590000005004', '', 12, 'Brush Hala 2', ''),
        ('OBJ-505', 'Příruba', '8590000005005', 'D', 1, 'Leštění – hala 2', 'rgb')]
fills = {'rgb': PatternFill('solid', fgColor='FFFF0000'), 'idx': PatternFill('solid', fgColor=Color(indexed=13)), 'theme': PatternFill('solid', fgColor=Color(theme=4, tint=0.0))}
for i, (o, n, e, x, q, op, f) in enumerate(rows):
    ws.append([o, n, e, x, q, op]); c = ws.cell(row=i + 3, column=3); c.hyperlink = L('5.0.%d' % (i + 1))
    if f: c.fill = fills[f]
wb.save(out + '/urgenty.xlsx')
# 2. výrobní plán: list 1 souhrn, list 2 A objednávka, B EAN sestavy, C index, D EAN poddílu, E operace
wb = Workbook(); ws = wb.active; ws.title = 'Souhrn'; ws.append(['Výrobní plán'])
p = wb.create_sheet('Poddíly'); p.append(['Objednávka', 'EAN sestavy', 'Index', 'EAN poddílu', 'Probíhající operace'])
plan = [('OBJ-501', '8590000005001', 'A', '8590000005001', 'Broušení – hala 2', None),
        ('OBJ-501', '8590000005001', 'A', '8590000006001', 'Leštění – hala 2', '6.0.1'),
        ('OBJ-501', '8590000005001', 'A', '8590000006002', 'Lakování', None),
        ('OBJ-503', '8590000005003', 'C', '8590000005003', 'Frézování Hala 2', None),
        ('OBJ-503', '8590000005003', 'C', '8590000006003', 'Montáž', '6.0.3'),
        ('OBJ-999', '8590000009999', 'Z', '8590000009998', 'Broušení – hala 2', '9.9.8')]
for i, (o, a, x, s, op, code) in enumerate(plan):
    p.append([o, a, x, s, op])
    if code: p.cell(row=i + 2, column=4).hyperlink = L(code)
wb.save(out + '/plan.xlsx')
# 3. evidence pohybu: A pracoviště, B QR kód, C datum a čas, D ks, E stav
wb = Workbook(); ws = wb.active; ws.title = 'Pohyb'
ws.append(['Pracoviště', 'QR kód', 'Datum a čas', 'Ks', 'Stav'])
for r in [('Brus 2', '5.0.1', '06.11.2026 07:10', 4, 'Hotovo'), ('Lakovna', '5.0.1', '06.11.2026 09:40', 4, 'Předáno'),
          ('Fréza', '5.0.2', '05.11.2026 13:00', 2, 'Čeká na nástroj'), ('Montáž', '6.0.3', '06.11.2026 08:00', 1, 'Hotovo'), ('Sklad', '7.7.7', '06.11.2026 08:00', 1, 'Nic')]:
    ws.append(list(r))
wb.save(out + '/pohyb.xlsx')
print('ok')`;

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const dir = path.join(S, 'shkroky-files');
  fs.mkdirSync(dir, { recursive: true });
  const gen = spawnSync('python3', ['-c', PY, dir], { encoding: 'utf8' });
  if (gen.status !== 0) { console.log('PROBLÉMY:\n - openpyxl: ' + gen.stderr); process.exit(1); }
  const file = n => path.join(dir, n);

  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await watch(page, 'monitor');
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
  await page.click('#nav [data-view="shortage"]');
  await page.waitForSelector('#view-shortage.on');
  const steps = await page.$$eval('.sh-step', x => x.map(s => [s.querySelector('b').textContent, s.classList.contains('done')]));
  check(JSON.stringify(steps) === JSON.stringify([['Urgentní díly', false], ['Výrobní plán', false], ['Evidence pohybu', false]]), `tři kroky: ${JSON.stringify(steps)}`);

  // ---------- 1. krok: sloupce a barvy ----------
  await page.setInputFiles('#shFile', file('urgenty.xlsx'));
  await dlgOpen(page, /Jak se načte soubor urgentních dílů/);
  const cols = await page.$$eval('#dlg [data-shcol]', x => Object.fromEntries(x.map(s => [s.dataset.shcol, s.value])));
  check(JSON.stringify(cols) === JSON.stringify({ order: 'A', name: 'B', ean: 'C', index: 'D', qty: 'E', top: 'G', op: 'F' }), `sloupce podle nadpisů: ${JSON.stringify(cols)}`);
  const prev = await page.textContent('#shColPrev');
  check(/8590000005001/.test(prev) && /Hřídel velká/.test(prev) && /odhad podle nadpisů/.test(await page.textContent('#dlg')), `vzor prvních řádků: ${prev.slice(0, 120)}`);
  // změna písmene překreslí vzor; vrátit zpět
  await page.selectOption('#dlg [name="c-name"]', 'D');
  check(!/Hřídel velká/.test(await page.textContent('#shColPrev')), 'vzor podle vybraného sloupce');
  await page.selectOption('#dlg [name="c-name"]', 'B');
  await page.screenshot({ path: path.join(shots, '01-sloupce.png') });
  await page.click('#dlgOk');
  await dlgOpen(page, /Barvy v buňkách EANu/);
  const sw = await page.$$eval('#dlg .sh-colorrow', x => x.map(r => [r.querySelector('b').textContent, r.querySelector('select').value, getComputedStyle(r.querySelector('.sh-swatch')).backgroundColor]));
  const swm = Object.fromEntries(sw.map(x => [x[0], x]));
  check(sw.length === 3 && swm['#FF0000'] && swm['#FF0000'][1] === 'top' && swm['#FF0000'][2] === 'rgb(255, 0, 0)' && swm['#FFFF00'] && swm['#FFFF00'][1] === 'top2' && swm['#4F81BD'] && swm['#4F81BD'][1] === 'none', `vzorník barev (RGB, paleta, motiv): ${JSON.stringify(sw)}`);
  check(/2 položky/.test(await page.textContent('#dlg .sh-colorrow')), 'počet položek u barvy');
  await page.screenshot({ path: path.join(shots, '02-barvy.png') });
  await page.selectOption('#dlg [name="k-4F81BD"]', 'top2');
  await page.click('#dlgOk');
  await dlgClosed(page);
  await page.waitForFunction(() => S.shortage.lists.length === 1);
  await saved(page);
  const l1 = await page.evaluate(() => ({ items: S.shortage.lists[0].items.map(i => [i.ean, i.top, i.top2, i.op, i.code]), colors: S.shortage.colors, cols: S.shortage.cols.list }));
  check(JSON.stringify(l1.items.map(i => [i[0], i[1], i[2]])) === JSON.stringify([['8590000005001', true, false], ['8590000005005', true, false], ['8590000005002', false, true], ['8590000005003', false, true], ['8590000005004', false, false]]), `TOP a TOP 2 podle barev: ${JSON.stringify(l1.items)}`);
  check(l1.items[0][3] === 'Broušení – hala 2' && l1.items[0][4] === '5.0.1', `operace ze sloupce F a kód z odkazu: ${JSON.stringify(l1.items[0])}`);
  check(JSON.stringify(l1.colors) === JSON.stringify({ FF0000: 'top', FFFF00: 'top2', '4F81BD': 'top2' }) && l1.cols.op === 'F', `barvy a sloupce se zapamatují: ${JSON.stringify(l1)}`);
  check(/Sloupce urgentních dílů/.test(await page.textContent('#shMsg')) && await page.locator('#shMsg [data-shrecols="list"]').count() === 1, 'zpráva se sloupci a Upravit sloupce');

  // ---------- 2. krok: výrobní plán ----------
  await page.setInputFiles('#shPlanFile', file('plan.xlsx'));
  await dlgOpen(page, /Jak se načte soubor výrobního plánu/);
  const pc = await page.$$eval('#dlg [data-shcol]', x => Object.fromEntries(x.map(s => [s.dataset.shcol, s.value])));
  const psheet = await page.$eval('#dlg [name="sheet"]', s => s.options[s.selectedIndex].text);
  check(JSON.stringify(pc) === JSON.stringify({ asm: 'B', sub: 'D', index: 'C', order: 'A', op: 'E' }) && psheet === 'Poddíly', `sloupce plánu a list: ${JSON.stringify(pc)} ${psheet}`);
  await page.click('#dlgOk');
  await page.waitForFunction(() => S.shortage.lists[0].plan && !/Čtu/.test(document.querySelector('#shMsg').textContent), null, { timeout: 20000 });
  await saved(page);
  const sub = await page.evaluate(() => { const i = S.shortage.lists[0].items; const a = i.find(x => x.ean === '8590000005001'), c = i.find(x => x.ean === '8590000005003'); return { a: a.subs.map(s => [s.ean, s.code, s.op]), ac: a.cands.map(s => [s.ean, s.op]), cpop: c.pop, cc: c.cands.map(s => [s.ean, s.code]), plan: S.shortage.cols.plan }; });
  check(JSON.stringify(sub.a) === JSON.stringify([['8590000006001', '6.0.1', 'Leštění – hala 2']]) && JSON.stringify(sub.ac) === JSON.stringify([['8590000006002', 'Lakování']]), `poddíly sestavy podle sloupců: ${JSON.stringify(sub)}`);
  check(sub.cpop === 'Frézování Hala 2' && JSON.stringify(sub.cc) === JSON.stringify([['8590000006003', '6.0.3']]) && sub.plan.sheet === 'Poddíly', `operace sestavy z plánu a list: ${JSON.stringify(sub)}`);

  // ---------- 3. krok: evidence pohybu (soubor) ----------
  await page.setInputFiles('#shMoveFile', file('pohyb.xlsx'));
  await dlgOpen(page, /Jak se načte soubor evidence pohybu/);
  const mc = await page.$$eval('#dlg [data-shcol]', x => Object.fromEntries(x.map(s => [s.dataset.shcol, s.value])));
  check(JSON.stringify(mc) === JSON.stringify({ code: 'B', when: 'C', qty: 'D', state: 'E', op: 'A' }), `sloupce evidence pohybu: ${JSON.stringify(mc)}`);
  await page.click('#dlgOk');
  await page.waitForFunction(() => S.shortage.lists[0].moves);
  await saved(page);
  const mv = await page.evaluate(() => { const l = S.shortage.lists[0]; const a = l.items.find(x => x.ean === '8590000005001'), c = l.items.find(x => x.ean === '8590000005003'); return { rec: a.rec && [a.rec.state, a.rec.op, a.rec.n], sub: (c.subs[0] || {}).ean, subRec: c.subs[0] && c.subs[0].rec && c.subs[0].rec.state, moves: [l.moves.file, l.moves.rows] }; });
  check(JSON.stringify(mv.rec) === JSON.stringify(['Předáno', 'Lakovna', 2]), `poslední záznam s operací a počtem: ${JSON.stringify(mv)}`);
  check(mv.sub === '8590000006003' && mv.subRec === 'Hotovo' && mv.moves[0] === 'pohyb.xlsx' && mv.moves[1] === 5, `poddíl s jinou operací přidaný záznamem, evidence u seznamu: ${JSON.stringify(mv)}`);
  check(/7\.7\.7/.test(await page.textContent('#shMsg')), 'kód mimo seznam se ohlásí');
  const steps2 = await page.$$eval('.sh-step', x => x.map(s => s.classList.contains('done')));
  check(steps2.every(Boolean) && /pohyb\.xlsx/.test(await page.textContent('#shSt3')), `všechny kroky hotové: ${JSON.stringify(steps2)}`);
  await page.screenshot({ path: path.join(shots, '03-kroky.png') });

  // ---------- Rozbor položek ----------
  await page.click('[data-shmode="rozbor"]');
  await page.waitForSelector('.sh-rozbor');
  const rz = await page.$$eval('.sh-rz', x => x.map(a => a.textContent.replace(/\s+/g, ' ')));
  check(rz.length === 5, `rozbor všech položek: ${rz.length}`);
  const rzA = rz.find(t => /Hřídel velká/.test(t)) || '';
  check(/Broušení – hala 2/.test(rzA) && /Předáno/.test(rzA) && /Lakovna/.test(rzA) && /2 záznamy/.test(rzA) && /8590000006001/.test(rzA) && /8590000006002/.test(rzA) && /mimo Halu 2/.test(rzA), `rozbor sestavy (operace, záznam, všechny poddíly): ${rzA}`);
  const rzC = rz.find(t => /Pouzdro/.test(t)) || '';
  check(/Frézování Hala 2/.test(rzC) && /bez záznamu/.test(rzC), `operace z plánu, bez záznamu: ${rzC}`);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(over <= 1, `rozbor bez přetečení na 1440: ${over}`);
  await page.screenshot({ path: path.join(shots, '04-rozbor.png'), fullPage: true });
  await page.click('[data-shanote]');
  await saved(page);
  const notes = await page.evaluate(() => S.shortage.lists[0].items.map(i => i.note));
  check(notes.every(Boolean) && /^Probíhá: Broušení – hala 2 · poslední záznam: Předáno/.test(notes[0]), `rozbor v poznámkách: ${JSON.stringify(notes)}`);
  check(await page.$eval('[data-shanote]', b => b.disabled), 'všechny poznámky vyplněné = tlačítko vypnuté');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-shaxlsx]')]);
  const xf = path.join(S, dl.suggestedFilename());
  await dl.saveAs(xf);
  const xr = spawnSync('python3', ['-c', 'import sys,json\nfrom openpyxl import load_workbook\nws=load_workbook(sys.argv[1]).active\nprint(json.dumps([ws.title]+[[c.value for c in r][:3]+[r[15].value] for r in ws.iter_rows()]))', xf], { encoding: 'utf8' });
  const xs = xr.status === 0 ? JSON.parse(xr.stdout) : [];
  check(xs[0] === 'Rozbor' && xs.length === 1 + 1 + 5 + 3 && xs.some(r => Array.isArray(r) && r[1] === 'poddíl (jiná operace)'), `Excel rozboru: ${xr.stderr || JSON.stringify(xs).slice(0, 300)}`);

  // ---------- znovu: sloupce zapamatované, barvy předvyplněné, Bez barev ----------
  await page.click('[data-shmode="list"]');
  await page.setInputFiles('#shFile', file('urgenty.xlsx'));
  await dlgOpen(page, /Barvy v buňkách EANu/);   // okno se sloupci se neukáže: sedí na uložené
  check(await page.$eval('#dlg [name="k-4F81BD"]', s => s.value) === 'top2', 'vzorník si barvu pamatuje');
  await page.click('#dlgCancel');
  await page.waitForFunction(() => S.shortage.lists.length === 2);
  check(await page.evaluate(() => S.shortage.lists[0].items.every(i => !i.top && !i.top2)), 'Bez barev = bez TOP podle barev');
  await saved(page);
  // Upravit sloupce: okno se otevře i když sloupce sedí
  await page.click('#shMsg [data-shrecols="list"]');
  await dlgOpen(page, /Jak se načte soubor urgentních dílů/);
  await page.click('#dlgCancel');
  await dlgClosed(page);

  // ---------- AI návrh: jen nadpisy a typy buněk ----------
  let aiBody = null;
  await page.route('**/api.php?action=ai_shcols*', route => { aiBody = route.request().postDataJSON(); route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cols: { code: 'B', when: 'C', qty: 'D', state: 'E', op: 'A' }, header: 1, sheet: '', note: 'Sloupec Ks může být i v gramech.' }) }); });
  await page.evaluate(() => { ui.me.ai = true; S.shortage.lists[0] && (ui.sh.open = S.shortage.lists[1].id); renderShortage(); });
  await page.setInputFiles('#shMoveFile', file('pohyb.xlsx'));
  await dlgOpen(page, /návrh AI/);
  const dtext = await page.textContent('#dlg');
  check(/Sloupec Ks může být i v gramech/.test(dtext), 'poznámka AI otevře okno');
  const sent = JSON.stringify(aiBody || {});
  check(aiBody && aiBody.kind === 'move' && /QR kód/.test(sent) && !/5\.0\.1|Lakovna|Předáno|Brus 2|Hotovo/.test(sent) && /<text/.test(sent), `AI dostane jen nadpisy a typy: ${sent.slice(0, 300)}`);
  await page.click('#dlgOk');
  await dlgClosed(page);
  await page.unroute('**/api.php?action=ai_shcols*');
  await page.evaluate(() => { ui.me.ai = false; });
  await saved(page);

  // historie
  const log = (await page.evaluate(() => S.log.filter(e => e.kind === 'shortage').map(e => e.text))).join(' | ');
  check(/sloupce urgentních dílů/.test(log) && /sloupce výrobního plánu/.test(log) && /barva EANu #FF0000 = TOP SHORTAGE/.test(log) && /evidence pohybu pohyb\.xlsx/.test(log), `historie změn: ${log.slice(0, 500)}`);

  // ---------- úzké okno (telefon): kroky pod sebou, rozbor bez přetečení ----------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { ui.sh.mode = 'rozbor'; ui.sh.open = S.shortage.lists[1].id; showView('shortage'); renderShortage(); });
  await page.waitForSelector('.sh-rozbor');
  const narrow = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, cols: getComputedStyle(document.querySelector('.sh-steps')).gridTemplateColumns.split(' ').length }));
  check(narrow.over <= 1 && narrow.cols === 1, `telefon: ${JSON.stringify(narrow)}`);
  await page.screenshot({ path: path.join(shots, '05-telefon.png'), fullPage: true });
  await ctx.close();

  await browser.close();
  if (problems.length) {
    console.log('PROBLÉMY:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
  console.log('Shortage ve třech krocích ok');
})().catch(err => { console.error(err); process.exit(1); });
