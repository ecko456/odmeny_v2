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
# 2. výrobní plán (od 2.70 dva listy): list 1 díly bez sestav (A EAN s odkazem, B objednávka, C index, D operace,
#    E množství zakázky 2.71), list 2 A objednávka, B EAN sestavy, C index, D EAN poddílu, E operace, F množství zakázky
wb = Workbook(); ws = wb.active; ws.title = 'Díly'; ws.append(['EAN dílu', 'Objednávka', 'Index', 'Probíhající operace', 'Množství zakázky'])
for i, (e, o, x, op, code, q) in enumerate([('8590000005002', 'OBJ-502', 'B', 'Frézování Hala 2', '5.2.2', 10), ('8590000005003', 'OBJ-503', 'C', 'Frézování Hala 2', '5.0.3', 6), ('8590000005004', 'OBJ-777', '', 'Brush Hala 2', '5.4.4', 12),
                                          # 2.72: další objednávky téhož dílu (alternativy k urgentu OBJ-504 bez indexu)
                                          ('8590000005004', 'OBJ-778', 'B', 'Leštění – hala 2', '5.4.5', 30), ('8590000005004', 'OBJ-504', 'C', 'Brush Hala 2', '5.4.6', 12)]):
    ws.append([e, o, x, op, q]); ws.cell(row=i + 2, column=1).hyperlink = L(code)
p = wb.create_sheet('Poddíly'); p.append(['Objednávka', 'EAN sestavy', 'Index', 'EAN poddílu', 'Probíhající operace', 'Množství zakázky'])
plan = [('OBJ-501', '8590000005001', 'A', '8590000005001', 'Broušení – hala 2', None, 4),
        ('OBJ-501', '8590000005001', 'A', '8590000006001', 'Leštění – hala 2', '6.0.1', 4),
        ('OBJ-501', '8590000005001', 'A', '8590000006002', 'Lakování', None, 8),
        ('OBJ-503', '8590000005003', 'C', '8590000005003', 'Frézování Hala 2', None, 6),
        ('OBJ-503', '8590000005003', 'C', '8590000006003', 'Montáž', '6.0.3', 2),
        ('OBJ-999', '8590000009999', 'Z', '8590000009998', 'Broušení – hala 2', '9.9.8', 1)]
for i, (o, a, x, s, op, code, q) in enumerate(plan):
    p.append([o, a, x, s, op, q])
    if code: p.cell(row=i + 2, column=4).hyperlink = L(code)
wb.save(out + '/plan.xlsx')
# 2.70: druhý plán, v 1. listu dva QR kódy pro stejný díl (EAN + objednávka + index), 2. list stejný
wb2 = Workbook(); ws = wb2.active; ws.title = 'Díly'; ws.append(['EAN dílu', 'Objednávka', 'Index', 'Probíhající operace', 'Množství zakázky'])
for i, (code, op) in enumerate([('5.5.1', 'Leštění – hala 2'), ('5.5.2', 'Lakování')]):
    ws.append(['8590000005005', 'OBJ-505', 'D', op, 1]); ws.cell(row=i + 2, column=1).hyperlink = L(code)
p2 = wb2.create_sheet('Poddíly')
for row in p.iter_rows(values_only=True): p2.append(list(row))
for i, (o, a, x, s, op, code, q) in enumerate(plan):
    if code: p2.cell(row=i + 2, column=4).hyperlink = L(code)
wb2.save(out + '/plan2.xlsx')
# 3. evidence pohybu: A pracoviště, B QR kód, C datum a čas, D ks, E stav
wb = Workbook(); ws = wb.active; ws.title = 'Pohyb'
ws.append(['Pracoviště', 'QR kód', 'Datum a čas', 'Ks', 'Stav'])
for r in [('Brus 2', '5.0.1', '06.11.2026 07:10', 4, 'Hotovo'), ('Lakovna', '5.0.1', '06.11.2026 09:40', 4, 'Předáno'),
          ('Fréza', '5.0.2', '05.11.2026 13:00', 2, 'Čeká na nástroj'), ('Montáž', '6.0.3', '06.11.2026 08:00', 1, 'Hotovo'), ('Sklad', '7.7.7', '06.11.2026 08:00', 1, 'Nic'),
          # 2.71: odesláno na WPA (5.0.2 část zakázky, poslední záznam jiný = zbytek u nás; 6.0.3 celá zakázka)
          ('Expedice', '5.0.2', '04.11.2026 10:00', 3, 'Odesláno na WPA'), ('Expedice', '6.0.3', '06.11.2026 07:30', 2, 'Odesláno na WPA')]:
    ws.append(list(r))
wb.save(out + '/pohyb.xlsx')
# 2.71.1: další evidence, poslední záznam 5.0.2 je odeslání, ale do zakázky 10 ks pořád chybí 5 ks = zbytek u nás
wb = Workbook(); ws = wb.active; ws.title = 'Pohyb'
ws.append(['Pracoviště', 'QR kód', 'Datum a čas', 'Ks', 'Stav'])
ws.append(['Expedice', '5.0.2', '07.11.2026 08:00', 2, 'Odesláno na WPA'])
ws.append(['Leštění', '5.4.5', '07.11.2026 09:00', 30, 'Leštěno hotovo'])   # 2.72: poslední záznam alternativní objednávky
wb.save(out + '/pohyb2.xlsx')
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
  check(JSON.stringify(steps) === JSON.stringify([['Urgentní díly', false], ['Výrobní plán', false], ['Evidence pohybu · volitelné', false]]), `tři kroky: ${JSON.stringify(steps)}`);

  // ---------- 1. krok: sloupce a barvy ----------
  await page.setInputFiles('#shFile', file('urgenty.xlsx'));
  await dlgOpen(page, /Jak se načte soubor urgentních dílů/);
  const cols = await page.$$eval('#dlg [data-shcol]', x => Object.fromEntries(x.map(s => [s.dataset.shcol, s.value])));
  check(JSON.stringify(cols) === JSON.stringify({ order: 'A', name: 'B', ean: 'C', index: 'D', qty: 'E', top: 'G', op: 'F', note: '' }), `sloupce podle nadpisů: ${JSON.stringify(cols)}`);
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
  // 2.70: nejdřív 1. list (díly bez sestav, přesná shoda EAN + objednávka + index), pak 2. list (sestavy a poddíly)
  await page.setInputFiles('#shPlanFile', file('plan.xlsx'));
  await dlgOpen(page, /výrobního plánu · 1\. list/);
  const pic = await page.$$eval('#dlg [data-shcol]', x => Object.fromEntries(x.map(s => [s.dataset.shcol, s.value])));
  check(JSON.stringify(pic) === JSON.stringify({ ean: 'A', order: 'B', index: 'C', op: 'D', qty: 'E' }), `sloupce 1. listu plánu: ${JSON.stringify(pic)}`);
  // stejný sloupec pro EAN a objednávku okno nepustí
  await page.selectOption('#dlg [name="c-order"]', 'A');
  await page.click('#dlgOk');
  check(await page.locator('#dlg[open]').count() === 1 && /různé sloupce/.test(await page.textContent('#dlg')), 'EAN, objednávka a index musí mít různé sloupce');
  await page.selectOption('#dlg [name="c-order"]', 'B');
  await page.screenshot({ path: path.join(shots, '02b-plan-list1.png') });
  await page.click('#dlgOk');
  await dlgOpen(page, /výrobního plánu · 2\. list/);
  const pc = await page.$$eval('#dlg [data-shcol]', x => Object.fromEntries(x.map(s => [s.dataset.shcol, s.value])));
  check(JSON.stringify(pc) === JSON.stringify({ asm: 'B', sub: 'D', index: 'C', order: 'A', op: 'E', qty: 'F' }), `sloupce 2. listu plánu: ${JSON.stringify(pc)}`);
  await page.click('#dlgOk');
  await page.waitForFunction(() => S.shortage.lists[0].plan && !/Čtu/.test(document.querySelector('#shMsg').textContent), null, { timeout: 20000 });
  await saved(page);
  const sub = await page.evaluate(() => { const i = S.shortage.lists[0].items; const f = e => i.find(x => x.ean === e); const a = f('8590000005001'), b = f('8590000005002'), c = f('8590000005003'), d = f('8590000005004'); return { a: a.subs.map(s => [s.ean, s.code, s.op]), cands: i.some(x => x.cands && x.cands.length), b: [b.op, b.code], c: [c.op, c.code, c.subs.map(s => [s.ean, s.code])], d: [d.op, d.code, d.planMismatch], cols: [S.shortage.cols.planItem.sheet, S.shortage.cols.plan.sheet] }; });
  check(JSON.stringify(sub.a) === JSON.stringify([['8590000006001', '6.0.1', 'Leštění – hala 2'], ['8590000006002', '', 'Lakování']]) && !sub.cands, `poddíly sestavy všech operací (bez čekajících): ${JSON.stringify(sub)}`);
  check(JSON.stringify(sub.b) === JSON.stringify(['Frézování Hala 2', '5.0.2']), `díl z 1. listu: operace z plánu, QR z urgentu zůstane: ${JSON.stringify(sub.b)}`);
  check(sub.c[0] === 'Frézování Hala 2' && JSON.stringify(sub.c[2]) === JSON.stringify([['8590000006003', '6.0.3']]), `operace sestavy z plánu a poddíl: ${JSON.stringify(sub.c)}`);
  check(sub.d[0] === 'Brush Hala 2' && sub.d[1] === '5.0.4', `jiná objednávka v 1. listu se nespáruje: ${JSON.stringify(sub.d)}`);
  check(JSON.stringify(sub.cols) === JSON.stringify(['Díly', 'Poddíly']), `listy plánu se zapamatují: ${JSON.stringify(sub.cols)}`);

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
  check(mv.sub === '8590000006003' && mv.subRec === 'Hotovo' && mv.moves[0] === 'pohyb.xlsx' && mv.moves[1] === 7, `poddíl s jinou operací přidaný záznamem, evidence u seznamu: ${JSON.stringify(mv)}`);
  check(/7\.7\.7/.test(await page.textContent('#shMsg')), 'kód mimo seznam se ohlásí');
  const steps2 = await page.$$eval('.sh-step', x => x.map(s => s.classList.contains('done')));
  check(steps2.every(Boolean) && /pohyb\.xlsx/.test(await page.textContent('#shSt3')), `všechny kroky hotové: ${JSON.stringify(steps2)}`);
  await page.screenshot({ path: path.join(shots, '03-kroky.png') });

  // ---------- množství zakázky a odesláno na WPA (2.71) ----------
  const sentSt = await page.evaluate(() => { const l = S.shortage.lists[0]; const f = e => l.items.find(x => x.ean === e); const g = (i, e) => i.subs.find(s => s.ean === e);
    const s = x => { const r = shSentOf(l, x); return r && [r.st, r.order, r.sent, r.left]; };
    return { i1: s(f('8590000005001')), i2: s(f('8590000005002')), i3: s(f('8590000005003')), i4: s(f('8590000005004')), s3: s(g(f('8590000005003'), '8590000006003')), s2: s(g(f('8590000005001'), '8590000006002')), oq: l.items.map(i => i.oqty ?? null), sent: l.sent }; });
  check(JSON.stringify([sentSt.i1, sentSt.i2, sentSt.i3, sentSt.i4, sentSt.s3, sentSt.s2]) === JSON.stringify([['here', 4, 0, 4], ['here', 10, 3, 7], ['open', 6, 0, 6], null, ['done', 2, 2, 0], ['open', 8, 0, 8]]), `stav proti množství zakázky: ${JSON.stringify(sentSt)}`);
  const sentUi = await page.$$eval('#shView tr', rs => rs.filter(r => r.querySelector('[data-shsent]')).map(r => [r.dataset.shid || r.dataset.shsub, r.querySelector('[data-shsent]').dataset.shsent, [...r.querySelector('[data-shsent]').children].map(c => c.textContent.trim()).join(' ')]));
  const uiOf = st => sentUi.filter(x => x[1] === st).map(x => x[2]);
  check(uiOf('here').some(t => /^U nás 7 ks odesláno na WPA 3 z 10 ks$/.test(t)) && uiOf('here').some(t => /^U nás 4 ks/.test(t)) && uiOf('done').some(t => /^Odesláno na WPA vše 2 z 2 ks$/.test(t)) && uiOf('open').length === 3, `stav v tabulce: ${JSON.stringify(sentUi)}`);
  check(/u nás 2/.test(await page.textContent('#shView .stats')), 'dlaždice Poslední záznam: díly u nás');
  check(/Odesláno na WPA: 2 nové záznamy s počtem kusů · díl u nás 2 · odesláno vše 1\./.test((await page.textContent('#shMsg')).replace(/\s+/g, ' ')), `hláška o odeslání: ${(await page.textContent('#shMsg')).replace(/\s+/g, ' ')}`);
  await page.locator('#shView [data-shsent="here"]').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, '03a-u-nas.png') });
  // PDF: stav pod posledním záznamem (2.84 v rámečku)
  const [pdl] = await Promise.all([page.waitForEvent('download'), page.click('#shView [data-shpdf]')]);
  const pf = path.join(S, 'shkroky-wpa.pdf');
  await pdl.saveAs(pf);
  const pt = spawnSync('python3', ['-c', 'import sys\ntry:\n import pypdf\n print(" ".join((p.extract_text() or "") for p in pypdf.PdfReader(sys.argv[1]).pages))\nexcept ImportError:\n print("BEZ-PYPDF")', pf], { encoding: 'utf8' });
  const ptext = (pt.stdout || '').replace(/\s+/g, ' ');
  if (!/BEZ-PYPDF/.test(ptext)) check(/U nás 7 ks odesláno na WPA 3 z 10 ks/.test(ptext) && /Odesláno na WPA vše 2 z 2 ks/.test(ptext) && /Na WPA zatím nic zakázka 4 ks/.test(ptext) && !/zakázka 6 ks/i.test(ptext),   // 2.84: v rámečku hlavní údaj a pod ním podrobnost
    `PDF se stavem odeslání (orientační řádek sestavy bez stavu): ${pt.stderr || ptext.slice(0, 400)}`);
  spawnSync('python3', ['-c', 'import pymupdf,sys\nd=pymupdf.open(sys.argv[1]); d[0].get_pixmap(matrix=pymupdf.Matrix(2,2)).save(sys.argv[2])', pf, path.join(shots, '03c-pdf-wpa.png')]);
  // 2.71.1: poslední záznam „Odesláno na WPA“, kusy do zakázky chybí = zbytek je u nás (ne „odesláno částečně“)
  await page.setInputFiles('#shMoveFile', file('pohyb2.xlsx'));
  await page.waitForFunction(() => { const i = S.shortage.lists[0].items.find(x => x.ean === '8590000005002'); return i.rec && /Odesláno na WPA/.test(i.rec.state); }, null, { timeout: 20000 });
  if (await page.locator('#dlg[open]').count()) problems.push('evidence se stejnými sloupci znovu ukázala okno se sloupci');
  await saved(page);
  const wpaLast = await page.evaluate(() => { const l = S.shortage.lists[0]; const r = shSentOf(l, l.items.find(x => x.ean === '8590000005002')); return [r.st, r.order, r.sent, r.left, r.last]; });
  check(JSON.stringify(wpaLast) === JSON.stringify(['here', 10, 5, 5, 'wpa']), `poslední záznam odeslání a chybí kusy = u nás: ${JSON.stringify(wpaLast)}`);
  const wpaUi = await page.evaluate(() => { const id = S.shortage.lists[0].items.find(x => x.ean === '8590000005002').id; const e = document.querySelector(`#shView tr[data-shid="${id}"] [data-shsent]`); return e && [e.dataset.shsent, [...e.children].map(c => c.textContent.trim()).join(' ')]; });
  check(JSON.stringify(wpaUi) === JSON.stringify(['here', 'U nás 5 ks odesláno na WPA 5 z 10 ks']), `v tabulce u nás: ${JSON.stringify(wpaUi)}`);
  check(/Odesláno na WPA: 1 nový záznam s počtem kusů · díl u nás 2 · odesláno vše 1\./.test((await page.textContent('#shMsg')).replace(/\s+/g, ' ')), `hláška po druhé evidenci: ${(await page.textContent('#shMsg')).replace(/\s+/g, ' ')}`);
  await page.locator(`#shView [data-shsent="here"]`).nth(1).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, '03d-wpa-u-nas.png') });

  // ---------- alternativní objednávky z plánu při neshodě objednávky / line (2.72) ----------
  const dId = await page.evaluate(() => S.shortage.lists[0].items.find(x => x.ean === '8590000005004').id);
  const altSel = `#shView select[data-shalt="${dId}"]`;
  const altUi = () => page.evaluate(([sel, id]) => {
    const tr = document.querySelector(`#shView tr[data-shid="${id}"]`), s = document.querySelector(sel);
    let h = tr && tr.previousElementSibling;
    while (h && !h.matches('.sh-depthead')) h = h.previousElementSibling;
    const i = S.shortage.lists[0].items.find(x => x.id === id);
    return { sec: h && h.dataset.shdepthead, groups: s ? [...s.querySelectorAll('optgroup')].map(g => g.label) : null, opts: s ? [...s.options].map(o => [o.value, o.disabled, o.textContent.trim()]) : null, val: s && s.value,
      ord: tr && tr.querySelector('.sh-ord').textContent.trim(), tag: /Neshoda objednávky \/ line/.test(tr.textContent), back: tr.querySelectorAll('[data-shaltback]').length, was: (tr.querySelector('.sh-was') || {}).textContent || '',
      it: [i.order, i.index, i.code, i.op, i.oqty ?? null, i.rec && i.rec.state, i.planMismatch], w: i.was ? [i.was.order, i.was.index, i.was.code, i.was.op] : null };
  }, [altSel, dId]);
  let au = await altUi();
  const altTxt = au.opts ? au.opts.map(o => o[2]) : [];
  check(au.sec === 'unlinked' && au.tag && JSON.stringify(au.groups) === JSON.stringify(['Stejná objednávka, jiný index', 'Stejný index, jiná objednávka', 'Jiné objednávky']) && au.val === '' && au.opts[0][1] && /^Vyber z 3 objednávek v plánu$/.test(altTxt[0])
    && altTxt[1] === 'OBJ-504 | Index C | 12 ks | Záznam: nenahrán | Operace: Brush Hala 2' && altTxt[2] === 'OBJ-777 | Index — | 12 ks | Záznam: nenahrán | Operace: Brush Hala 2'
    && /^OBJ-778 \| Index B \| 30 ks \| Záznam: Leštěno hotovo, 30 ks, 7\. ?11\. ?2026 9:00 \| Operace: Leštění – hala 2$/.test(altTxt[3]), `nabídka alternativních objednávek při neshodě: ${JSON.stringify(au)}`);
  check(/vyber v nabídce u položky alternativní objednávku z výrobního plánu \(objednávka, index, počet ks, poslední interní záznam, operace\)/.test(await page.textContent('#shView tr[data-shdepthead="unlinked"]')), 'sekce Nelze přidělit odkaz radí nabídku');
  await page.locator(altSel).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, '03e-alternativy.png') });
  const pickAlt = async (order, done) => {
    const v = (await altUi()).opts.find(o => o[2].startsWith(order + ' |'))[0];
    await page.selectOption(altSel, v);
    await page.waitForFunction(done, dId);
    await saved(page);
  };
  await pickAlt('OBJ-778', id => S.shortage.lists[0].items.find(x => x.id === id).order === 'OBJ-778');
  au = await altUi();
  check(JSON.stringify(au.it) === JSON.stringify(['OBJ-778', 'B', '5.4.5', 'Leštění – hala 2', 30, 'Leštěno hotovo', false]) && JSON.stringify(au.w) === JSON.stringify(['OBJ-504', '', '5.0.4', 'Brush Hala 2']), `výběr převezme objednávku, index, QR, operaci, množství a záznam, urgent se zapamatuje: ${JSON.stringify(au)}`);
  check(au.sec !== 'unlinked' && !au.tag && au.ord === 'OBJ-778' && au.val === au.opts.find(o => o[2].startsWith('OBJ-778 |'))[0] && au.back === 1 && /V urgentech OBJ-504 · index —/.test(au.was), `po výběru: řádek mezi ostatními, nabídka s vybranou objednávkou, návrat k urgentu: ${JSON.stringify(au)}`);
  check(/^Položka 8590000005004: objednávka OBJ-778 · index B z výrobního plánu\.$/.test(await page.textContent('#toast')), `hláška po výběru: ${await page.textContent('#toast')}`);
  const fitA = await page.evaluate(() => { const c = document.querySelector('#shView .table-card'); return c.scrollWidth - c.clientWidth; });
  check(fitA <= 1, `tabulka s nabídkou objednávek na 1440 px přetéká o ${fitA} px`);
  await page.locator(altSel).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, '03f-alternativa-vybrana.png') });
  // jiná alternativa, pak zpátky na urgent, pak znovu OBJ-778
  await pickAlt('OBJ-777', id => S.shortage.lists[0].items.find(x => x.id === id).order === 'OBJ-777');
  au = await altUi();
  check(JSON.stringify(au.it.slice(0, 5)) === JSON.stringify(['OBJ-777', '', '5.4.4', 'Brush Hala 2', 12]) && au.w && au.w[0] === 'OBJ-504', `přepnutí na jinou alternativu: ${JSON.stringify(au)}`);
  await page.click(`#shView [data-shaltback="${dId}"]`);
  await page.waitForFunction(id => !S.shortage.lists[0].items.find(x => x.id === id).was, dId);
  await saved(page);
  au = await altUi();
  check(JSON.stringify(au.it) === JSON.stringify(['OBJ-504', '', '5.0.4', 'Brush Hala 2', null, null, true]) && au.sec === 'unlinked' && au.val === '' && au.back === 0, `Vrátit z urgentů: ${JSON.stringify(au)}`);
  await pickAlt('OBJ-778', id => S.shortage.lists[0].items.find(x => x.id === id).order === 'OBJ-778');
  const altLog = (await page.evaluate(() => S.log.filter(e => e.kind === 'shortage').map(e => e.text))).join(' | ');
  check(/u položky 8590000005004 Šroub M8 vybrána objednávka z plánu OBJ-778 · index B \(v urgentech OBJ-504 · index —, seznam /.test(altLog), `historie výběru objednávky: ${altLog.slice(0, 600)}`);

  // ---------- úprava poddílu tužkou a QR varianty (2.70) ----------
  const sub3 = await page.evaluate(() => S.shortage.lists[0].items.find(x => x.ean === '8590000005003').subs[0].id);
  await page.click(`#shView [data-shedit="${sub3}"]`);
  await dlgOpen(page, /Upravit poddíl/);
  check(await page.inputValue('#dlg [name="order"]') === 'OBJ-503' && await page.inputValue('#dlg [name="code"]') === '6.0.3' && await page.inputValue('#dlg [name="oqty"]') === '2', 'úprava poddílu: objednávka ze sestavy, kód, množství zakázky');
  await page.fill('#dlg [name="oqty"]', 'deset');
  await page.click('#dlgOk');
  check(/Množství zakázky musí být počet kusů/.test(await page.textContent('#dlg')), 'množství zakázky jen číslo');
  await page.fill('#dlg [name="oqty"]', '2');
  await page.fill('#dlg [name="op"]', 'Montáž ručně');
  await page.fill('#dlg [name="note"]', 'Upraveno ručně');
  await page.click('#dlgOk');
  await dlgClosed(page);
  await page.waitForFunction(id => { const h = shEntry(S.shortage.lists[0], id); return h && h.entry.manual && h.entry.op === 'Montáž ručně'; }, sub3);
  await saved(page);
  await page.setInputFiles('#shPlanFile', file('plan2.xlsx'));
  for (let k = 0; k < 2; k++) {   // sloupce sedí na uložené: okna se neukážou (kdyby ano, potvrdit)
    await page.waitForFunction(() => document.querySelector('#dlg[open]') || /plan2\.xlsx/.test(document.querySelector('#shMsg').textContent), null, { timeout: 20000 });
    if (await page.locator('#dlg[open]').count()) { problems.push('druhý plán znovu ukázal okno se sloupci'); await page.click('#dlgOk'); }
  }
  await page.waitForFunction(() => /plan2\.xlsx/.test(document.querySelector('#shMsg').textContent) && !/Čtu/.test(document.querySelector('#shMsg').textContent), null, { timeout: 20000 });
  await saved(page);
  const qi = await page.evaluate(() => { const l = S.shortage.lists[0]; const i = l.items.find(x => x.ean === '8590000005005'); const s3 = l.items.find(x => x.ean === '8590000005003').subs[0]; return { id: i.id, code: i.code, conflict: i.qrConflict, choices: i.qrChoices.map(c => [c.code, c.op]), sub: [s3.op, s3.note, s3.manual] }; });
  check(qi.code === '5.0.5' && qi.conflict && JSON.stringify(qi.choices) === JSON.stringify([['5.5.1', 'Leštění – hala 2'], ['5.5.2', 'Lakování']]), `QR varianty a uložený kód ke kontrole: ${JSON.stringify(qi)}`);
  // ruční úprava (údaje, kód, poznámka) zůstane, probíhající operace je živý údaj z nového plánu (jako v samostatné aplikaci)
  check(JSON.stringify(qi.sub) === JSON.stringify(['Montáž', 'Upraveno ručně', true]), `ručně upravený poddíl: poznámka zůstane, operace z nového plánu: ${JSON.stringify(qi.sub)}`);
  check(/Nelze přidělit odkaz/.test(await page.textContent('#shView')) && await page.locator(`#shView select[data-shqr="${qi.id}"] option`).count() === 3, 'část Nelze přidělit odkaz s výběrem varianty');
  check(/liší od variant/.test(await page.textContent('#shMsg')), `hláška o uloženém kódu ke kontrole: ${await page.textContent('#shMsg')}`);
  au = await altUi();
  check(JSON.stringify(au.it.slice(0, 3)) === JSON.stringify(['OBJ-778', 'B', '5.4.5']) && au.w && au.w[0] === 'OBJ-504' && au.opts === null && au.back === 1, `další plán bez toho dílu: vybraná objednávka a návrat k urgentu zůstanou: ${JSON.stringify(au)}`);
  const fitQ = await page.evaluate(() => { const c = document.querySelector('#shView .table-card'); return c.scrollWidth - c.clientWidth; });
  check(fitQ <= 1, `tabulka s výběrem QR varianty na 1440 px přetéká o ${fitQ} px (akce vpravo schované)`);
  await page.locator(`#shView select[data-shqr="${qi.id}"]`).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, '03b-qr-varianty.png') });
  await page.selectOption(`#shView select[data-shqr="${qi.id}"]`, '5.5.2');
  await page.waitForFunction(id => { const i = S.shortage.lists[0].items.find(x => x.id === id); return i.code === '5.5.2' && !i.qrConflict && i.op === 'Lakování'; }, qi.id);
  check(!/Nelze přidělit odkaz/.test(await page.textContent('#shView')), 'po výběru varianty položka z části Nelze přidělit odkaz zmizí');
  const overQ = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overQ <= 1, `tabulka bez přetečení na 1440: ${overQ}`);
  await saved(page);

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
  const xr = spawnSync('python3', ['-c', 'import sys,json\nfrom openpyxl import load_workbook\nws=load_workbook(sys.argv[1]).active\nprint(json.dumps([ws.title]+[[c.value for c in r][:3]+[r[15].value, r[21].value if len(r)>21 else None] for r in ws.iter_rows()]))', xf], { encoding: 'utf8' });
  const xs = xr.status === 0 ? JSON.parse(xr.stdout) : [];
  check(xs[0] === 'Rozbor' && xs.length === 1 + 1 + 5 + 3 && xs.some(r => Array.isArray(r) && r[1] === 'poddíl (jiná operace)') && xs[1][4] === 'Díl u nás' && xs.filter(r => Array.isArray(r) && r[4] === 'ano').length === 3,   // 3.: Šroub M8 s objednávkou z plánu (2.72)
 `Excel rozboru: ${xr.stderr || JSON.stringify(xs).slice(0, 300)}`);

  // ---------- znovu: sloupce zapamatované, barvy předvyplněné, Bez barev ----------
  await page.click('[data-shmode="list"]');
  await page.setInputFiles('#shFile', file('urgenty.xlsx'));
  // od 2.70 se okno se sloupci urgentů ukáže vždy (volba sloupce poznámek od plánování), sloupce předvyplněné z minula
  await dlgOpen(page, /Jak se načte soubor urgentních dílů/);
  check(await page.$eval('#dlg [name="c-op"]', s => s.value) === 'F', 'sloupce urgentů zapamatované');
  await page.click('#dlgOk');
  await dlgOpen(page, /Barvy v buňkách EANu/);
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
  // 2.78: stejný soubor jako minule odpovídá přednastavení (nadpisy) a načte se bez AI i bez okna
  await page.evaluate(() => { ui.me.ai = true; S.shortage.lists[0] && (ui.sh.open = S.shortage.lists[1].id); renderShortage(); });
  check(await page.evaluate(() => !!(S.shortage.cols.move && S.shortage.cols.move.heads && S.shortage.cols.move.heads.code)), `přednastavení evidence s nadpisy: ${JSON.stringify(await page.evaluate(() => S.shortage.cols.move))}`);
  await page.setInputFiles('#shMoveFile', file('pohyb.xlsx'));
  await page.waitForFunction(() => /evidence pohybu \(přednastavení/.test(document.querySelector('#shMsg').textContent));
  check(!aiBody && !(await page.$('#dlg[open]')), 'soubor podle přednastavení: bez AI a bez okna');
  // soubor, který přednastavení neodpovídá (nadpisy přednastavení smazané): navrhne AI
  await page.evaluate(() => { delete S.shortage.cols.move.heads; delete S.shortage.cols.move.set; });
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
  check(/sloupce urgentních dílů/.test(log) && /sloupce prvního listu výrobního plánu: EAN dílu A, Číslo objednávky B/.test(log) && /sloupce druhého listu výrobního plánu/.test(log) && /barva EANu #FF0000 = TOP SHORTAGE/.test(log) && /evidence pohybu pohyb\.xlsx/.test(log) && /odesláno na WPA, 2 nové záznamy/.test(log) && /odesláno na WPA, 1 nový záznam/.test(log) && /množství zakázky u \d+ položek a poddílů/.test(log), `historie změn: ${log.slice(0, 1200)}`);

  // ---------- Vložit ze schránky (2.70): tlačítko čte schránku přes Clipboard API ----------
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => { ui.sh.mode = 'list'; renderShortage(); });
  await page.evaluate(() => navigator.clipboard.writeText('Zakázka\tPopis\tEAN\tIndex\tMnožství\tProbíhající operace\nOBJ-601\tVíko\t8590000006601\tA\t3\tLeštění – hala 2\n'));
  const nLists = await page.evaluate(() => S.shortage.lists.length);
  await page.click('#shClipboard');
  await dlgOpen(page, /Jak se načte soubor urgentních dílů/);
  await page.click('#dlgOk');
  await dlgClosed(page);
  await page.waitForFunction(n => S.shortage.lists.length === n + 1, nLists);
  check(await page.evaluate(() => { const l = S.shortage.lists[0]; return l.file === 'vloženo ze schránky' && l.items.length === 1 && l.items[0].ean === '8590000006601' && l.items[0].op === 'Leštění – hala 2'; }), 'Vložit ze schránky založí seznam');
  await saved(page);

  // ---------- úzké okno (telefon): kroky pod sebou, rozbor bez přetečení ----------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { ui.sh.mode = 'rozbor'; ui.sh.open = S.shortage.lists[1].id; showView('shortage'); renderShortage(); });
  await page.waitForSelector('.sh-rozbor');
  const narrow = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth, cols: getComputedStyle(document.querySelector('.sh-steps')).gridTemplateColumns.split(' ').length }));
  check(narrow.over <= 1 && narrow.cols === 1, `telefon: ${JSON.stringify(narrow)}`);
  await page.screenshot({ path: path.join(shots, '05-telefon.png'), fullPage: true });
  await page.evaluate(id => { ui.sh.mode = 'list'; ui.sh.open = S.shortage.lists.find(l => l.items.some(i => i.id === id)).id; renderShortage(); }, dId);
  const narrowL = await page.evaluate(id => { const b = document.querySelector(`#shView [data-shaltback="${id}"]`); if (b) b.scrollIntoView({ block: 'center' });
    return { b: !!b, vis: !!(b && b.getClientRects().length), over: document.documentElement.scrollWidth - document.documentElement.clientWidth, open: ui.sh.open, lists: S.shortage.lists.map(l => [l.id, l.items.some(i => i.id === id)]) }; }, dId);
  check(narrowL.b && narrowL.vis && narrowL.over <= 1, `telefon, seznam s objednávkou z plánu: ${JSON.stringify(narrowL)}`);
  await page.screenshot({ path: path.join(shots, '05b-telefon-objednavka.png') });
  await ctx.close();

  await browser.close();
  if (problems.length) {
    console.log('PROBLÉMY:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
  console.log('Shortage ve třech krocích ok');
})().catch(err => { console.error(err); process.exit(1); });
