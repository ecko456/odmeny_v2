// Prohlížečový průchod 2.78: Shortage – průvodce nahráním, přednastavení sloupců výrobního plánu (AI jen když
// soubor neodpovídá), velká interní evidence ze schránky (25 000 řádků, všechny se načtou), poslední 3 záznamy
// u dílu (tabulka, PDF), oddělení K prověření, Expedováno na WPA, zabalený den → znovu průvodce (Vložit ze
// schránky, přetažení souboru plánu), telefon. Soubory vyrobí openpyxl (vymyšlená data, odkazy is.example).
// Spuštění jako ostatní e2e (tests/run_e2e.sh e2e_shpruvodce); snímky v $S/oshots-shpruvodce.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-shpruvodce');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

async function watch(page, label) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  page.on('pageerror', err => problems.push(`${label} pageerror: ${err.message}`));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`)));
}
const saved = page => page.waitForFunction(() => !store.dirty && !store.saving && document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 20000 });
const dlgOpen = (page, re) => page.waitForFunction(r => { const d = document.querySelector('#dlg[open]'); return d && new RegExp(r).test(d.textContent); }, re.source, { timeout: 20000 });
const dlgClosed = page => page.waitForFunction(() => !document.querySelector('#dlg[open]'));
const L = c => `http://is.example/commission.production.detail/default/1?activeBarcode=${c}&x=1`;

const PY = String.raw`
import sys
from openpyxl import Workbook
out = sys.argv[1]; L = lambda c: 'http://is.example/commission.production.detail/default/1?activeBarcode=' + c + '&x=1'
parts = [('8590000008001', 'OBJ-801', 'A', 'Broušení', '8.0.1', 10), ('8590000008002', 'OBJ-802', 'B', 'Lakování', '8.0.2', 4),
         ('8590000008003', 'OBJ-803', 'C', 'Lakování', '8.0.3', 7), ('8590000008004', 'OBJ-804', 'D', 'Montáž', '8.0.4', 12)]
subs = [('OBJ-805', '8590000008005', 'E', '8590000009051', 'Broušení', '9.0.51', 2), ('OBJ-805', '8590000008005', 'E', '8590000009052', 'Lakování', '9.0.52', 3)]
def plan(name, h1, order1, h2, order2):
    wb = Workbook(); ws = wb.active; ws.title = 'Díly'
    ws.append(['Výrobní plán HALA 2 · export'])
    ws.append([h1[k] for k in order1])
    for i, (e, o, x, op, code, q) in enumerate(parts):
        row = {'ean': e, 'order': o, 'index': x, 'op': op, 'qty': q}
        ws.append([row[k] for k in order1]); ws.cell(row=i + 3, column=order1.index('ean') + 1).hyperlink = L(code)
    p = wb.create_sheet('Poddíly'); p.append(['Sestavy a poddíly']); p.append([h2[k] for k in order2])
    for i, (o, a, x, s, op, code, q) in enumerate(subs):
        row = {'order': o, 'asm': a, 'index': x, 'sub': s, 'op': op, 'qty': q}
        p.append([row[k] for k in order2]); p.cell(row=i + 3, column=order2.index('sub') + 1).hyperlink = L(code)
    wb.save(out + '/' + name)
H1 = {'ean': 'EAN dílu', 'order': 'Objednávka', 'index': 'Line', 'op': 'Probíhající operace', 'qty': 'Množství zakázky'}
H2 = {'order': 'Objednávka', 'asm': 'EAN sestavy', 'index': 'Line', 'sub': 'EAN poddílu', 'op': 'Probíhající operace', 'qty': 'Množství zakázky'}
plan('plan.xlsx', H1, ['ean', 'order', 'index', 'op', 'qty'], H2, ['order', 'asm', 'index', 'sub', 'op', 'qty'])
# kolega: stejné nadpisy, sloupce v jiném pořadí
plan('plan-posunuty.xlsx', H1, ['order', 'ean', 'qty', 'index', 'op'], H2, ['asm', 'order', 'sub', 'index', 'qty', 'op'])
# jiný export: jiné nadpisy
plan('plan-jiny.xlsx', {'ean': 'Kód zboží', 'order': 'Zakázka č.', 'index': 'Pozice', 'op': 'Pracoviště', 'qty': 'Kusů'}, ['ean', 'order', 'index', 'op', 'qty'],
     {'order': 'Zakázka č.', 'asm': 'Kód celku', 'index': 'Pozice', 'sub': 'Kód části', 'op': 'Pracoviště', 'qty': 'Kusů'}, ['order', 'asm', 'index', 'sub', 'op', 'qty'])
print('ok')`;

// urgenty jako HTML z Excelu (odkazy u EANů)
const URG = [['OBJ-801', 'Hřídel předlohová', '8590000008001', 'A', '4', 'Broušení', '8.0.1'], ['OBJ-802', 'Kryt motoru', '8590000008002', 'B', '2', 'Lakování', '8.0.2'],
  ['OBJ-803', 'Pouzdro', '8590000008003', 'C', '7', 'Lakování', '8.0.3'], ['OBJ-804', 'Šroub M8', '8590000008004', 'D', '12', 'Montáž', '8.0.4'],
  ['OBJ-805', 'Příruba', '8590000008005', 'E', '1', 'Leštění', '8.0.5']];
const urgHtml = () => `<html><body><!--StartFragment--><table><tr><td>Zakázka</td><td>Popis</td><td>EAN</td><td>Index</td><td>Množství</td><td>Probíhající operace</td></tr>${URG.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td><a href="${L(r[6])}">${r[2]}</a></td><td>${r[3]}</td><td>${r[4]}</td><td>${r[5]}</td></tr>`).join('')}</table><!--EndFragment--></body></html>`;
const urgText = () => ['Zakázka\tPopis\tEAN\tIndex\tMnožství\tProbíhající operace', ...URG.map(r => r.slice(0, 6).join('\t'))].join('\n');
// interní evidence: 25 000 řádků; kódy seznamu na začátku i úplně na konci (dřív by se za 20 000. řádkem ztratily)
function evidence() {
  const rows = ['QR kód\tDatum a čas\tKs\tStav'];
  const own = [['8.0.1', '09.11.2026 07:00', 4, 'Řezání dílu'], ['8.0.1', '10.11.2026 07:00', 4, 'Odjehlení'], ['8.0.1', '11.11.2026 08:00', 4, 'Měření hotovo'],
    ['8.0.1', '12.11.2026 08:00', 4, 'Čeká na kontrolu'], ['8.0.2', '12.11.2026 09:00', 2, 'Kontrola kvality'], ['8.0.3', '11.11.2026 09:00', 7, 'Řezání dílu'],
    ['9.0.51', '12.11.2026 10:00', 2, 'Broušení hotovo']];
  own.forEach(r => rows.push(r.join('\t')));
  for (let i = 0; rows.length < 25000 - 2; i++) {
    const d = 1 + (i % 12), h = 6 + (i % 10);
    rows.push(`F${String(i % 6000).padStart(5, '0')}\t${String(d).padStart(2, '0')}.11.2026 ${String(h).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}\t${1 + (i % 9)}\tSklad ${i % 7}`);
  }
  rows.push('8.0.3\t13.11.2026 06:10\t7\tExpedováno na WPA');
  rows.push('8.0.1\t13.11.2026 06:30\t4\tPředáno do skladu');
  return rows.join('\n');
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const dir = path.join(S, 'shpruvodce-files');
  fs.mkdirSync(dir, { recursive: true });
  const gen = spawnSync('python3', ['-c', PY, dir], { encoding: 'utf8' });
  if (gen.status !== 0) { console.log('PROBLÉMY:\n - openpyxl: ' + gen.stderr); process.exit(1); }
  const file = n => path.join(dir, n);

  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
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
  // oddělení Brus s operací Broušení (nastavení z dřívějška)
  await page.evaluate(() => { S.shortage = cleanShortage({ ...shc(), depts: [{ id: 'dbrus', name: 'Brus', ops: [{ key: shOpKey('Broušení'), label: 'Broušení' }] }] }); save(); });
  await saved(page);
  // AI: náhradní odpověď podle druhu souboru, počítá se, kolikrát se volala
  const aiCalls = [];
  await page.route('**/api.php?action=ai_shcols*', route => {
    const b = route.request().postDataJSON(); aiCalls.push(b.kind);
    const cols = { planItem: { ean: 'A', order: 'B', index: 'C', op: 'D', qty: 'E' }, plan: { asm: 'B', sub: 'D', index: 'C', order: 'A', op: 'E', qty: 'F' }, move: { code: 'A', when: 'B', qty: 'C', state: 'D', op: '' } }[b.kind];
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cols, header: b.kind === 'move' ? 1 : 2, sheet: '', note: '' }) });
  });
  await page.click('#nav [data-view="shortage"]');
  await page.waitForSelector('#view-shortage.on #shView .sh-wizintro');
  await page.evaluate(() => { ui.me.ai = true; });
  check(!(await page.isVisible('.sh-steps')) && /Zatím žádný seznam/.test(await page.textContent('#shView')), 'bez seznamu: karta průvodce, tři kroky nahoře schované');
  await page.waitForTimeout(600);   // dojede přechod stránky
  await page.screenshot({ path: path.join(shots, '01-uvod.png') });

  // ---------- průvodce: 1. urgenty vložené na plochu (Ctrl+V) ----------
  await page.click('[data-shwiz="start"]');
  await page.waitForSelector('#shView .sh-wizstep.cur [data-shwiz="1"]');
  check(await page.evaluate(() => document.activeElement && document.activeElement.dataset.shwzdrop === 'list'), 'plocha pro vložení má fokus');
  await page.screenshot({ path: path.join(shots, '02-krok1.png') });
  await page.evaluate(([h, t]) => { const dt = new DataTransfer(); dt.setData('text/html', h); dt.setData('text/plain', t); document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, [urgHtml(), urgText()]);
  await dlgOpen(page, /Jak se načte soubor urgentních dílů/);
  await page.click('#dlgOk');
  await dlgClosed(page);
  await page.waitForFunction(() => S.shortage.lists.length === 1 && ui.sh.wiz && ui.sh.wiz.step === 2);
  check(await page.evaluate(() => S.shortage.lists[0].items.length === 5 && S.shortage.lists[0].items.every(i => i.code)), 'urgenty s QR kódy z odkazů');
  const range = await page.evaluate(() => [shWizPlanRange('2026-11-13'), shWizPlanRange('2026-08-31'), shWizPlanRange()]);
  check(JSON.stringify(range.slice(0, 2)) === JSON.stringify([{ from: '2026-04-13', to: '2027-07-13' }, { from: '2026-01-31', to: '2027-04-30' }]), `období plánu 7 měsíců zpět a 8 dopředu: ${JSON.stringify(range)}`);
  const tip = (await page.textContent('#shView .sh-wiztip')).replace(/\s+/g, ' ');
  check(/7 měsíců zpět a 8 měsíců dopředu/.test(tip) && tip.includes(await page.evaluate(r => `od ${dayText(r.from)} do ${dayText(r.to)}`, range[2])), `tip ke stažení plánu: ${tip}`);
  check(/navrhne sloupce AI/.test(await page.textContent('#shView .sh-wizbody')), 'bez přednastavení: AI navrhne a uloží se');
  await page.screenshot({ path: path.join(shots, '03-krok2.png') });

  // ---------- 2. výrobní plán: AI navrhne, potvrdí se, uloží jako přednastavení ----------
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-shwzfile="plan"]')]);
  await fc.setFiles(file('plan.xlsx'));
  await dlgOpen(page, /výrobního plánu · 1\. list/);
  check(/návrh AI/.test(await page.textContent('#dlg')) && /Uloží se jako přednastavení/.test(await page.textContent('#dlg')), 'okno 1. listu: návrh AI, uloží se jako přednastavení');
  await page.click('#dlgOk');
  await dlgOpen(page, /výrobního plánu · 2\. list/);
  await page.click('#dlgOk');
  await page.waitForFunction(() => ui.sh.wiz && ui.sh.wiz.step === 3, null, { timeout: 20000 });
  await saved(page);
  const pre = await page.evaluate(() => ({ pi: S.shortage.cols.planItem, pc: S.shortage.cols.plan, subs: S.shortage.lists[0].items.find(i => i.ean === '8590000008005').subs.map(s => [s.ean, s.code, s.op]) }));
  check(JSON.stringify(pre.pi.heads) === JSON.stringify({ ean: 'EAN dílu', order: 'Objednávka', index: 'Line', op: 'Probíhající operace', qty: 'Množství zakázky' }) && pre.pi.set && pre.pi.set.by === 'Vedoucí skladu', `přednastavení 1. listu s nadpisy: ${JSON.stringify(pre.pi)}`);
  check(pre.pc.heads && pre.pc.heads.sub === 'EAN poddílu' && JSON.stringify(pre.subs) === JSON.stringify([['8590000009051', '9.0.51', 'Broušení'], ['8590000009052', '9.0.52', 'Lakování']]), `přednastavení 2. listu a poddíly: ${JSON.stringify(pre)}`);
  check(JSON.stringify(aiCalls.filter(k => k !== 'list')) === JSON.stringify(['planItem', 'plan']), `AI u prvního plánu: ${JSON.stringify(aiCalls)}`);

  // ---------- 3. velká evidence ze schránky: všechny řádky, poslední 3 záznamy, K prověření ----------
  check(/desítky tisíc řádků/.test(await page.textContent('#shView .sh-wizbody')), 'krok 3: popis velké evidence');
  await page.screenshot({ path: path.join(shots, '04-krok3.png') });
  const evText = evidence();
  await page.evaluate(t => navigator.clipboard.writeText(t), evText);
  const t0 = Date.now();
  await page.click('[data-shwzclip]');
  // AI navrhla stejné sloupce jako výchozí (A–D): okno se neukáže, nadpisy se rovnou uloží jako přednastavení
  await page.waitForFunction(() => ui.sh.wiz && ui.sh.wiz.step === 4, null, { timeout: 60000 });
  check(!(await page.$('#dlg[open]')) && aiCalls.includes('move') && await page.evaluate(() => !!(S.shortage.cols.move.heads && S.shortage.cols.move.heads.state === 'Stav')), `evidence: AI, bez okna, přednastavení ${JSON.stringify(await page.evaluate(() => S.shortage.cols.move))}`);
  const took = Date.now() - t0;
  await saved(page);
  const msg = (await page.textContent('#shMsg')).replace(/\s+/g, ' ');
  check(/přečteno 24\s999 řádků evidence/.test(msg), `načtou se všechny řádky (bez nadpisu): ${msg.slice(0, 400)}`);
  check(/mimo tento seznam s nejstaršími záznamy se neuložilo/.test(msg), `zpráva o kódech mimo seznam nad limit: ${msg.slice(0, 600)}`);
  const ev = await page.evaluate(() => { const l = S.shortage.lists[0], f = c => l.items.find(i => i.code === c);
    return { a: shRecList(f('8.0.1').rec).map(x => x.state), b: f('8.0.2').rec.state, c: [f('8.0.3').rec.state, shWpa(f('8.0.3').rec.state)], sub: l.items.find(i => i.ean === '8590000008005').subs[0].rec.state,
      rec: l.records.length, own: ['8.0.1', '8.0.2', '8.0.3', '9.0.51'].every(c => l.records.some(r => r.code === c)),
      secs: shSections(S.shortage, l.items).map(x => [x.id, x.items.map(i => i.ean.slice(-1)).join('')]) }; });
  check(JSON.stringify(ev.a) === JSON.stringify(['Předáno do skladu', 'Čeká na kontrolu', 'Měření hotovo']), `poslední 3 záznamy (poslední řádek schránky je nejnovější): ${JSON.stringify(ev.a)}`);
  check(ev.b === 'Kontrola kvality' && ev.c[0] === 'Expedováno na WPA' && ev.c[1] && ev.sub === 'Broušení hotovo', `záznamy položek a poddílu: ${JSON.stringify(ev)}`);
  check(ev.rec <= 3000 + 10 && ev.own, `uložené záznamy: ${ev.rec}, kódy seznamu: ${ev.own}`);
  check(JSON.stringify(ev.secs) === JSON.stringify([['dbrus', '15'], ['?', '2'], ['', '34']]), `oddělení: Brus (i sestava podle poddílu), K prověření (záznam u nás, cizí operace), Nezařazeno (Expedováno na WPA, bez záznamu): ${JSON.stringify(ev.secs)}`);
  check(took < 30000, `velká evidence trvá ${took} ms`);
  const fin = (await page.textContent('#shView .sh-wizfin')).replace(/\s+/g, ' ');
  check(/Shortage je nahraná/.test(fin) && /1\s*K prověření/.test(fin) && /5\s*položek/.test(fin) && /2\s*poddíly z plánu/.test(fin) && /3\s*se záznamem/.test(fin), `shrnutí průvodce: ${fin}`);
  await page.screenshot({ path: path.join(shots, '05-hotovo.png') });
  console.log(`velká evidence: 25 000 řádků ze schránky za ${took} ms`);

  // ---------- seznam: blok K prověření, předchozí záznamy, PDF ----------
  await page.click('[data-shwiz="end"]');
  await page.waitForSelector('#shView table.sh-tab');
  check(await page.isVisible('.sh-steps'), 'po zavření průvodce zase tři kroky nahoře');
  const heads = await page.$$eval('#shView tr.sh-depthead', r => r.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  check(heads.length === 3 && /^K prověření · 1 položka · záznam v interní evidenci u nás/.test(heads[1]) && /^Nezařazeno/.test(heads[2]), `nadpisy bloků: ${JSON.stringify(heads)}`);
  const id1 = await page.evaluate(() => S.shortage.lists[0].items.find(i => i.code === '8.0.1').id);
  const prevUi = await page.$$eval(`#shView tr[data-shid="${id1}"] .sh-recprev li`, x => x.map(li => li.textContent.replace(/\s+/g, ' ').trim()));
  check(prevUi.length === 2 && /^Čeká na kontrolu 4 ks 12\. 11\. 2026 8:00/.test(prevUi[0]) && /^Měření hotovo/.test(prevUi[1]), `předchozí záznamy v tabulce: ${JSON.stringify(prevUi)}`);
  check(/Předáno do skladu/.test(await page.textContent(`#shView tr[data-shid="${id1}"] .sh-rec`)), 'poslední záznam nahoře');
  // výběr oddělení u položky nabízí K prověření; ručně do Nezařazeno a zpátky
  const id2 = await page.evaluate(() => S.shortage.lists[0].items.find(i => i.code === '8.0.2').id);
  const opts = await page.$$eval(`#shView [data-shdept="${id2}"] option`, o => o.map(x => x.textContent.trim()));
  check(opts.includes('K prověření') && /Podle operace: K prověření/.test(opts[0]), `volby oddělení: ${JSON.stringify(opts)}`);
  await page.selectOption(`#shView [data-shdept="${id2}"]`, '-');
  await page.waitForFunction(id => S.shortage.lists[0].items.find(i => i.id === id).dept === '-', id2);
  await page.selectOption(`#shView [data-shdept="${id2}"]`, '');
  await page.waitForFunction(id => S.shortage.lists[0].items.find(i => i.id === id).dept === '' && shDeptOf(S.shortage, S.shortage.lists[0].items.find(i => i.id === id)) === '?', id2);
  await saved(page);
  await page.screenshot({ path: path.join(shots, '06-seznam.png'), fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-shpdf]')]);
  const pdf = path.join(S, 'shpruvodce.pdf');
  await dl.saveAs(pdf);
  const pt = spawnSync('python3', ['-c', 'import sys\nfrom pypdf import PdfReader\nprint("\\n".join(p.extract_text() for p in PdfReader(sys.argv[1]).pages))', pdf], { encoding: 'utf8' });
  if (pt.status === 0) {
    const txt = pt.stdout.replace(/\s+/g, ' ');
    check(/Čeká na kontrolu/.test(txt) && /Měření hotovo/.test(txt) && !/Odjehlení/.test(txt) && !/Řezání dílu · 4/.test(txt), `PDF s posledními 3 záznamy: ${txt.slice(0, 500)}`);
    check(/K prověření/.test(txt), 'PDF má blok K prověření');
  } else console.log('pypdf není, text PDF se nekontroluje');

  // ---------- kolega nahraje plán: přednastavení, posunuté sloupce, jiný soubor ----------
  aiCalls.length = 0;
  await page.setInputFiles('#shPlanFile', file('plan.xlsx'));
  await page.waitForFunction(() => /Sloupce výrobního plánu · 1\. list: díly bez sestav \(přednastavení/.test(document.querySelector('#shMsg').textContent), null, { timeout: 20000 });
  check(!(await page.$('#dlg[open]')) && !aiCalls.length, `stejný plán: bez okna a bez AI (${JSON.stringify(aiCalls)})`);
  await page.setInputFiles('#shPlanFile', file('plan-posunuty.xlsx'));
  await page.waitForFunction(() => /přednastavení, sloupce posunuté/.test(document.querySelector('#shMsg').textContent), null, { timeout: 20000 });
  const mv = await page.evaluate(() => ({ subs: S.shortage.lists[0].items.find(i => i.ean === '8590000008005').subs.map(s => s.code), qty: S.shortage.lists[0].items.find(i => i.code === '8.0.1').oqty, pi: S.shortage.cols.planItem }));
  check(!(await page.$('#dlg[open]')) && !aiCalls.length && JSON.stringify(mv.subs) === JSON.stringify(['9.0.51', '9.0.52']) && mv.qty === 10 && mv.pi.ean === 'B' && mv.pi.order === 'A', `posunuté sloupce podle nadpisů: ${JSON.stringify(mv)}`);
  check(/Sloupce jsou v souboru jinde, podle nadpisů/.test(await page.textContent('#shMsg')), 'zpráva o posunutých sloupcích');
  await saved(page);
  await page.setInputFiles('#shPlanFile', file('plan-jiny.xlsx'));
  await dlgOpen(page, /výrobního plánu · 1\. list/);
  check(await page.isVisible('#dlg .sh-prewarn') && /Soubor neodpovídá přednastavení \(uložil Vedoucí skladu/.test(await page.textContent('#dlg .sh-prewarn')) && aiCalls.includes('planItem'), `jiný soubor: AI a upozornění (${JSON.stringify(aiCalls)})`);
  await page.screenshot({ path: path.join(shots, '07-jiny-plan.png') });
  await page.click('#dlgCancel');
  await dlgClosed(page);
  await saved(page);
  const log = (await page.evaluate(() => S.log.filter(e => e.kind === 'shortage').map(e => e.text))).join(' | ');
  // změny sloupců do 10 minut se v historii sloučí (poslední stav), přednastavení evidence zůstalo samostatně
  check(/sloupce prvního listu výrobního plánu: /.test(log) && /sloupce evidence pohybu: [^|]*uloženo jako přednastavení/.test(log), `historie: ${log.slice(0, 1500)}`);

  // ---------- zabalený den → průvodce znovu: Vložit ze schránky, plán přetažením ----------
  // připnutá sestava s poznámkou a poznámkou u poddílu: v dalších urgentech je znovu, poznámky zůstanou
  const id5 = await page.evaluate(() => S.shortage.lists[0].items.find(i => i.ean === '8590000008005').id);
  const sub5 = await page.evaluate(() => S.shortage.lists[0].items.find(i => i.ean === '8590000008005').subs[0].id);
  await page.evaluate(() => { ui.sh.open = S.shortage.lists[0].id; S.shortage.lists[0].items.find(i => i.ean === '8590000008005').full = true; save(); renderShortage(); });
  await page.click(`#shView [data-shpin="${id5}"]`);
  await page.waitForFunction(id => S.shortage.lists[0].items.find(i => i.id === id).pin, id5);
  await page.fill(`#shView textarea[data-shnote="${id5}"]`, 'Volat dodavatele');
  await page.evaluate(() => document.activeElement.blur());
  await page.fill(`#shView textarea[data-shnote="${sub5}"]`, 'Brusič ví');
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForFunction(() => { const i = S.shortage.lists[0].items.find(x => x.ean === '8590000008005'); return i.pin && i.note === 'Volat dodavatele' && i.subs[0].note === 'Brusič ví'; });
  await saved(page);
  await page.click('#shView [data-shpack]');
  await dlgOpen(page, /Zabalit/);
  await page.click('#dlgOk');
  await page.waitForSelector('#shView .sh-wizintro.sh-newday');
  check(/Den je zabalený/.test(await page.textContent('#shView .sh-wizintro')), 'zabalený den: karta průvodce');
  await page.click('[data-shwiz="start"]');
  await page.evaluate(t => navigator.clipboard.writeText(t), urgText());
  await page.click('[data-shwzclip]');
  await dlgOpen(page, /Jak se načte soubor urgentních dílů/);
  await page.click('#dlgOk');
  await page.waitForFunction(() => S.shortage.lists.length === 2 && ui.sh.wiz && ui.sh.wiz.step === 2);
  const b64 = fs.readFileSync(file('plan.xlsx')).toString('base64');
  aiCalls.length = 0;
  await page.evaluate(b => { const bin = atob(b), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const f = new File([u], 'plan.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), dt = new DataTransfer(); dt.items.add(f);
    const z = document.querySelector('[data-shwzdrop="plan"]'); z.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true })); z.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }, b64);
  await page.waitForFunction(() => ui.sh.wiz && ui.sh.wiz.step === 3, null, { timeout: 20000 });
  check(!aiCalls.length && await page.evaluate(() => !!S.shortage.lists[0].plan && S.shortage.lists[0].plan.file === 'plan.xlsx'), 'plán přetažený na plochu průvodce, podle přednastavení');
  const pin5 = await page.evaluate(() => { const i = S.shortage.lists[0].items.find(x => x.ean === '8590000008005'); return { pin: !!i.pin, note: i.note, subs: i.subs.map(x => [x.code, x.note]) }; });
  check(pin5.pin && pin5.note === 'Volat dodavatele' && JSON.stringify(pin5.subs) === JSON.stringify([['9.0.51', 'Brusič ví'], ['9.0.52', '']]), `připnutá položka v dalších urgentech: poznámka i poznámka poddílu zůstaly: ${JSON.stringify(pin5)}`);
  // přeskočit evidenci
  await page.click('[data-shwiz="4"]');
  await page.waitForSelector('#shView .sh-wizfin');
  await saved(page);

  // ---------- sestava s poddíly ze dvou oddělení: v obou, poddíl jinde bez QR, Zobrazit plně, PDF po odděleních ----------
  await page.click('[data-shwiz="end"]');
  await page.evaluate(() => { S.shortage = cleanShortage({ ...shc(), depts: [...shc().depts, { id: 'dlak', name: 'Lakovna', ops: [{ key: shOpKey('Lakování'), label: 'Lakování' }] }] }); save(); renderShortage(); });
  await page.waitForSelector('#shView tr.sh-depthead[data-shdepthead="dlak"]');
  await saved(page);
  const asmId = await page.evaluate(() => S.shortage.lists[0].items.find(i => i.ean === '8590000008005').id);
  const blk = await page.evaluate(id => { const out = {}; let cur = ''; document.querySelectorAll('#shView tbody tr').forEach(r => { if (r.classList.contains('sh-depthead')) cur = r.dataset.shdepthead; else if (r.dataset.shid === id) (out[cur] = out[cur] || []).push('A'); else if (r.dataset.shparent === id) (out[cur] = out[cur] || []).push((r.classList.contains('sh-subaway') ? 'jinde:' : '') + r.querySelector('td.name .sh-ean').textContent.replace(/\D/g, '').slice(-2)); }); return out; }, asmId);
  check(JSON.stringify(blk) === JSON.stringify({ dbrus: ['A', '51', 'jinde:52'], dlak: ['A', 'jinde:51', '52'] }), `sestava v Brusu i v Lakovně, poddíl jiného oddělení bez QR: ${JSON.stringify(blk)}`);
  const awayRow = page.locator(`#shView tr.sh-subaway[data-shparent="${asmId}"][data-shdeptrow="dbrus"]`);
  check(/Tento díl se zpracovává na jiném oddělení: Lakovna/.test((await awayRow.textContent()).replace(/\s+/g, ' ')) && await awayRow.locator('.sh-code').count() === 0 && /Sestava i v oddělení: Lakovna/.test(await page.textContent(`#shView tr[data-shid="${asmId}"][data-shdeptrow="dbrus"]`)), 'poddíl na jiném oddělení: text, bez QR, poznámka u sestavy');
  await page.screenshot({ path: path.join(shots, '08a-rozdelena-sestava.png'), fullPage: true });
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('[data-shpdfdept]')]);
  const pdf2 = path.join(S, 'shpruvodce-oddeleni.pdf');
  await dl2.saveAs(pdf2);
  const pdfPages = file => {
    const pp = spawnSync('python3', ['-c', 'import sys,json\nfrom pypdf import PdfReader\nprint(json.dumps([p.extract_text() for p in PdfReader(sys.argv[1]).pages]))', file], { encoding: 'utf8' });
    if (pp.status !== 0) return null;
    const pages = JSON.parse(pp.stdout).map(t => t.replace(/\s+/g, ' '));
    return { brus: pages.find(t => /Chybějící díly · Brus/.test(t)) || '', lak: pages.find(t => /Chybějící díly · Lakovna/.test(t)) || '' };
  };
  const pg = pdfPages(pdf2);
  if (pg) {
    // 2.79.1: poddíl jiného oddělení (bez Zobrazit plně) v PDF vůbec není
    const { brus, lak } = pg;
    check(/9\.0\.51/.test(brus) && !/9\.0\.52|8590000009052|jiném oddělení/.test(brus) && /8590000008005/.test(brus) && /2 položky · 1 poddíl\b/.test(brus), `PDF Brus: sestava a jen poddíl Brusu (i v počtu): ${brus.slice(0, 600)}`);
    check(/9\.0\.52/.test(lak) && !/9\.0\.51|8590000009051|jiném oddělení/.test(lak) && /8590000008005/.test(lak), `PDF Lakovna: sestava a jen poddíl Lakovny: ${lak.slice(0, 600)}`);
  }
  // Zobrazit plně: poddíl Lakovny i v Brusu s QR kódem
  await awayRow.locator('[data-shsubfull]').click();
  await page.waitForFunction(id => S.shortage.lists[0].items.find(i => i.id === id).subs.find(x => x.code === '9.0.52').full === true, asmId);
  const fullRow = page.locator(`#shView tr.sh-subfull[data-shparent="${asmId}"][data-shdeptrow="dbrus"]`);
  check(await fullRow.count() === 1 && /9\.0\.52/.test(await fullRow.locator('.sh-code').textContent()) && /Lakovna/.test(await fullRow.locator('.sh-awaytag').textContent()), 'Zobrazit plně: poddíl jiného oddělení s QR kódem a štítkem oddělení');
  await saved(page);
  // plně zobrazený poddíl jiného oddělení se tiskne celý i tady
  const [dl3] = await Promise.all([page.waitForEvent('download'), page.click('[data-shpdfdept]')]);
  const pdf3 = path.join(S, 'shpruvodce-oddeleni-plne.pdf');
  await dl3.saveAs(pdf3);
  const pg3 = pdfPages(pdf3);
  if (pg3) check(/9\.0\.51/.test(pg3.brus) && /9\.0\.52/.test(pg3.brus) && !/9\.0\.51/.test(pg3.lak), `PDF po Zobrazit plně: poddíl Lakovny i v Brusu: ${pg3.brus.slice(0, 600)}`);
  await page.click(`#shView tr.sh-subfull[data-shparent="${asmId}"] [data-shsubfull]`);
  await page.waitForFunction(id => !('full' in S.shortage.lists[0].items.find(i => i.id === id).subs.find(x => x.code === '9.0.52')), asmId);
  await saved(page);

  // ---------- telefon ----------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { ui.sh.wiz = { at: Date.now() - 60000, step: 2, adv: { 1: true } }; renderShortage(); });
  await page.waitForSelector('#shView .sh-wizsteps');
  await page.waitForTimeout(200);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const cols = await page.evaluate(() => getComputedStyle(document.querySelector('.sh-wizsteps')).gridTemplateColumns.split(' ').length);
  check(over <= 1 && cols === 1, `telefon: přetečení ${over} px, kroky ve ${cols} sloupcích`);
  await page.screenshot({ path: path.join(shots, '08-telefon.png'), fullPage: true });
  await page.click('[data-shwiz="end"]');
  await page.evaluate(() => { const l = S.shortage.lists[0]; l.packed = { at: Date.now(), by: 'V' }; ui.sh.open = null; S.shortage = cleanShortage(S.shortage); save(); renderShortage(); });
  await page.waitForSelector('#shView .sh-wizintro');
  const over2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(over2 <= 1, `telefon, úvod průvodce: přetečení ${over2} px`);
  await page.screenshot({ path: path.join(shots, '09-telefon-uvod.png'), fullPage: true });
  await saved(page);
  await ctx.close();
  await browser.close();
  if (problems.length) {
    console.log('PROBLÉMY:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
  console.log('e2e Shortage průvodce: vše v pořádku');
})().catch(err => { console.error(err); process.exit(1); });
