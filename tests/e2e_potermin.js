// Prohlížečový průchod 2.79: modul Po termínu (druhý modul se stejným seznamem jako Shortage). Tabulka položek
// po termínu se skluzem ve sloupci F, návrh sloupců přes AI (náhradní odpověď) ke kontrole, seřazení od největšího
// skluzu, štítky a barvy skluzu, bez TOP, výrobní plán a interní evidence, společná oddělení se Shortage (jen ke
// čtení), Hotovo na konci, PDF (Položky po termínu, SKLUZ), oddělení od Shortage (data i stav obrazovky), historie,
// nové přihlášení, telefon. Soubory vyrobí openpyxl (vymyšlená data, odkazy is.example).
// Spuštění jako ostatní e2e (tests/run_e2e.sh e2e_potermin); snímky v $S/oshots-potermin.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-potermin');
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

const PY = String.raw`
import sys
from openpyxl import Workbook
out = sys.argv[1]; L = lambda c: 'http://is.example/commission.production.detail/default/1?activeBarcode=' + c + '&x=1'
# položky po termínu: A zakázka, B popis, C EAN (odkaz), D index, E množství, F skluz, G probíhající operace
wb = Workbook(); ws = wb.active; ws.title = 'Po termínu'
ws.append(['Zakázka', 'Popis', 'EAN', 'Index', 'Množství', 'Skluz', 'Probíhající operace'])
rows = [('OBJ-901', 'Hřídel', '8590000009001', 'A', 4, 3, 'Broušení', '9.1.1'), ('OBJ-902', 'Kryt', '8590000009002', 'B', 2, 21, 'Lakování', '9.1.2'),
        ('OBJ-903', 'Pouzdro', '8590000009003', 'C', 7, 9, 'Broušení', '9.1.3'), ('OBJ-904', 'Šroub', '8590000009004', 'D', 12, 1, 'Montáž', '9.1.4'),
        ('OBJ-905', 'Příruba', '8590000009005', 'E', 1, 14, 'Leštění', '9.1.5')]
for i, (o, n, e, x, q, d, op, code) in enumerate(rows):
    ws.append([o, n, e, x, q, d, op]); ws.cell(row=i + 2, column=3).hyperlink = L(code)
wb.save(out + '/po-terminu.xlsx')
# výrobní plán: 1. list díly bez sestav, 2. list sestava OBJ-905 s poddíly
wb = Workbook(); ws = wb.active; ws.title = 'Díly'
ws.append(['EAN dílu', 'Objednávka', 'Line', 'Probíhající operace', 'Množství zakázky'])
for i, (o, n, e, x, q, d, op, code) in enumerate(rows[:4]):
    ws.append([e, o, x, op, q * 3]); ws.cell(row=i + 2, column=1).hyperlink = L(code)
p = wb.create_sheet('Poddíly'); p.append(['Objednávka', 'EAN sestavy', 'Line', 'EAN poddílu', 'Probíhající operace', 'Množství zakázky'])
for i, (s, op, code) in enumerate([('8590000009051', 'Broušení', '9.5.1'), ('8590000009052', 'Lakování', '9.5.2')]):
    p.append(['OBJ-905', '8590000009005', 'E', s, op, 2]); p.cell(row=i + 2, column=4).hyperlink = L(code)
wb.save(out + '/plan.xlsx')
print('ok')`;

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const dir = path.join(S, 'potermin-files');
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
  const token = fs.readFileSync(process.env.TOKEN_FILE || path.join(S, 'odme2e', 'setup-token.txt'), 'utf8').trim();
  await page.fill('[name="token"]', token);
  await page.fill('[name="label"]', 'Mistr haly');
  await page.click('#setupForm button[type="submit"]');
  await page.waitForSelector('.odm-card');
  const key = (await page.textContent('.odm-card .card-key')).trim();
  await page.check('#saved');
  await page.click('#finish');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');
  await saved(page);
  // Shortage: oddělení a jeden seznam urgentů (Po termínu ho nesmí ovlivnit)
  await page.evaluate(() => {
    S.shortage = cleanShortage({ ...S.shortage, depts: [{ id: 'dbrus', name: 'Brus', ops: [{ key: shOpKey('Broušení'), label: 'Broušení' }] }, { id: 'dlak', name: 'Lakovna', ops: [{ key: shOpKey('Lakování'), label: 'Lakování' }] }],
      lists: [{ id: 'shx1', at: Date.now() - 3600e3, by: 'Mistr haly', file: 'urgenty.xlsx', items: [{ ean: '8590000001111', name: 'Urgentní díl', order: 'OBJ-1', index: 'A', qty: '2', op: 'Broušení', top: true }] }] });
    save();
  });
  await saved(page);
  const aiCalls = [];
  await page.route('**/api.php?action=ai_shcols*', route => {
    const b = route.request().postDataJSON(); aiCalls.push(b.kind);
    const cols = { late: { order: 'A', name: 'B', ean: 'C', index: 'D', qty: 'E', delay: 'F', op: 'G', note: '' }, planItem: { ean: 'A', order: 'B', index: 'C', op: 'D', qty: 'E' }, plan: { asm: 'B', sub: 'D', index: 'C', order: 'A', op: 'E', qty: 'F' }, move: { code: 'A', when: 'B', qty: 'C', state: 'D', op: '' } }[b.kind] || {};
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cols, header: 1, sheet: '', note: b.kind === 'late' ? 'Skluz je ve dnech.' : '' }) });
  });
  await page.evaluate(() => { ui.me.ai = true; });

  // ---------- menu: Po termínu na stejné obrazovce jako Shortage ----------
  await page.click('#nav [data-view="potermin"]');
  await page.waitForSelector('#view-shortage.on #shView .sh-wizintro');
  await page.waitForTimeout(500);
  const head = await page.evaluate(() => ({ h1: document.querySelector('#shTitle').textContent, eyebrow: document.querySelector('#view-shortage .eyebrow').textContent, nav: document.querySelector('#nav [data-view="potermin"]').getAttribute('aria-current'), late: document.querySelector('#view-shortage').classList.contains('sh-late'), go: document.querySelector('[data-shwiz="start"]').textContent.trim() }));
  check(head.h1 === 'Po termínu' && head.eyebrow === 'Položky po termínu' && head.nav === 'true' && head.late && /Spustit nahrávání po termínu/.test(head.go), `záhlaví Po termínu: ${JSON.stringify(head)}`);
  check(/Zatím žádný seznam/.test(await page.textContent('#shView')) && /ve sloupci F skluz/.test(await page.textContent('#shView')), 'prázdný modul (Shortage má vlastní seznam)');
  await page.screenshot({ path: path.join(shots, '01-uvod.png') });

  // ---------- 1. tabulka po termínu: AI návrh sloupců ke kontrole ----------
  await page.click('[data-shwiz="start"]');
  await page.waitForSelector('#shView .sh-wizbody');
  check(/1 · Položky po termínu/.test(await page.textContent('#shView .sh-wizbody')) && /skluz bývá ve sloupci F/.test(await page.textContent('#shView .sh-wizbody')), 'průvodce: krok 1 Položky po termínu');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-shwzfile="list"]')]);
  await fc.setFiles(file('po-terminu.xlsx'));
  await dlgOpen(page, /Jak se načte soubor položek po termínu/);
  const dlg = (await page.textContent('#dlg')).replace(/\s+/g, ' ');
  const cols = await page.$$eval('#dlg [data-shcol]', x => Object.fromEntries(x.map(s => [s.dataset.shcol, s.value])));
  check(/návrh AI/.test(dlg) && /Skluz je ve dnech/.test(dlg) && /Skluz = o kolik je položka po termínu/.test(dlg) && cols.delay === 'F' && cols.ean === 'C' && !('top' in cols), `okno sloupců: ${JSON.stringify(cols)} ${dlg.slice(0, 300)}`);
  check(/21/.test(await page.textContent('#shColPrev')), 'vzor s hodnotami skluzu');
  await page.screenshot({ path: path.join(shots, '02-sloupce.png') });
  await page.click('#dlgOk');
  await dlgClosed(page);
  await page.waitForFunction(() => S.late.lists.length === 1 && ui.sh.wiz && ui.sh.wiz.step === 2);
  check(aiCalls.includes('late'), `AI dostane druh late: ${JSON.stringify(aiCalls)}`);
  const l1 = await page.evaluate(() => ({ late: S.late.lists[0].items.map(i => [i.ean.slice(-1), i.delay, !!i.top, i.code]), sh: S.shortage.lists.map(l => [l.id, l.items.length]), cols: S.shortage.cols.late }));
  check(JSON.stringify(l1.late) === JSON.stringify([['2', 21, false, '9.1.2'], ['5', 14, false, '9.1.5'], ['3', 9, false, '9.1.3'], ['1', 3, false, '9.1.1'], ['4', 1, false, '9.1.4']]), `seřazeno od největšího skluzu: ${JSON.stringify(l1.late)}`);
  check(JSON.stringify(l1.sh) === JSON.stringify([['shx1', 1]]) && l1.cols && l1.cols.delay === 'F', `Shortage beze změny, sloupce po termínu uložené: ${JSON.stringify(l1)}`);
  check(/seřazeno od největšího skluzu \(21\)/.test((await page.textContent('#shMsg')).replace(/\s+/g, ' ')), 'zpráva po nahrání: seřazení a největší skluz');

  // ---------- 2. výrobní plán, 3. evidence ----------
  await saved(page);
  await page.setInputFiles('#shPlanFile', file('plan.xlsx'));
  await dlgOpen(page, /výrobního plánu · 1\. list/);
  await page.click('#dlgOk');
  await dlgOpen(page, /výrobního plánu · 2\. list/);
  await page.click('#dlgOk');
  await page.waitForFunction(() => ui.sh.wiz && ui.sh.wiz.step === 3, null, { timeout: 20000 });
  await page.evaluate(t => navigator.clipboard.writeText(t), 'QR kód\tDatum a čas\tKs\tStav\n9.1.2\t12.11.2026 08:00\t2\tKontrola\n9.1.2\t13.11.2026 06:00\t2\tČeká na lak\n9.1.4\t12.11.2026 09:00\t12\tExpedováno na WPA\n9.5.1\t12.11.2026 10:00\t2\tBroušení hotovo');
  await page.click('[data-shwzclip]');
  await page.waitForFunction(() => ui.sh.wiz && ui.sh.wiz.step === 4, null, { timeout: 20000 });
  await saved(page);
  const fin = (await page.textContent('#shView .sh-wizfin')).replace(/\s+/g, ' ');
  check(/Položky po termínu jsou nahrané/.test(fin) && /21\s*největší skluz/.test(fin) && /2\s*poddíly z plánu/.test(fin), `shrnutí: ${fin}`);
  await page.click('[data-shwiz="end"]');
  await page.waitForSelector('#shView table.sh-tab');

  // ---------- seznam: bloky oddělení, pořadí podle skluzu, štítky, bez TOP ----------
  const tab = await page.evaluate(() => { const out = []; let cur = ''; document.querySelectorAll('#shView tbody tr').forEach(r => { if (r.classList.contains('sh-depthead')) cur = r.dataset.shdepthead; else if (r.dataset.shid) out.push([cur, r.querySelector('td.name .sh-ean').textContent.replace(/\D/g, '').slice(-1), (r.querySelector('.sh-delaytag') || {}).textContent || '', r.className.includes('sh-latecrit') ? 'crit' : r.className.includes('sh-latewarn') ? 'warn' : '']); });
    return { rows: out, top: document.querySelectorAll('#shView [data-shtop]').length, tile: [...document.querySelectorAll('#shView .stat')].map(x => x.textContent.replace(/\s+/g, ' ')).find(t => /skluz/.test(t)) || '', th: [...document.querySelectorAll('#shView table.sh-tab th')].map(x => x.textContent).join('|'), ro: !!document.querySelector('#shView .sh-deptsro'), panel: !!document.querySelector('#shDepts') }; });
  check(JSON.stringify(tab.rows) === JSON.stringify([['dbrus', '5', 'SKLUZ 14', 'crit'], ['dbrus', '3', 'SKLUZ 9', 'warn'], ['dbrus', '1', 'SKLUZ 3', ''], ['dlak', '2', 'SKLUZ 21', 'crit'], ['dlak', '5', 'SKLUZ 14', 'crit'], ['-', '4', 'SKLUZ 1', '']]),
    `bloky a pořadí podle skluzu (sestava rozdělená podle poddílů): ${JSON.stringify(tab.rows)}`);
  check(tab.top === 0 && /Největší skluz\s*21/.test(tab.tile) && /\|Množství\|/.test(tab.th) && tab.ro && !tab.panel, `bez TOP, dlaždice, sloupec, oddělení jen ke čtení: ${JSON.stringify(tab)}`);
  const rec2 = await page.evaluate(() => { const i = S.late.lists[0].items.find(x => x.code === '9.1.2'); return shRecList(i.rec).map(x => x.state); });
  check(JSON.stringify(rec2) === JSON.stringify(['Čeká na lak', 'Kontrola']), `poslední záznamy u položky po termínu: ${JSON.stringify(rec2)}`);
  await page.screenshot({ path: path.join(shots, '03-seznam.png'), fullPage: true });
  // Hotovo jde na konec, pořadí ostatních zůstane podle skluzu
  const id2 = await page.evaluate(() => S.late.lists[0].items.find(i => i.code === '9.1.2').id);
  await page.selectOption(`#shView select[data-shst="${id2}"]`, 'done');
  await page.waitForFunction(() => S.late.lists[0].items.at(-1).code === '9.1.2');
  check(await page.evaluate(() => S.late.lists[0].items.map(i => i.code).join(',')) === '9.1.5,9.1.3,9.1.1,9.1.4,9.1.2', 'Hotovo na konci, ostatní podle skluzu');
  await page.selectOption(`#shView select[data-shst="${id2}"]`, '');
  await page.waitForFunction(() => S.late.lists[0].items[0].code === '9.1.2');
  check(true, 'bez Hotovo zpátky podle skluzu na začátek');
  await saved(page);
  // šipky na úchytu pořadí nemění
  await page.focus(`#shView [data-shgrip="${id2}"]`);
  await page.keyboard.press('ArrowDown');
  check(await page.evaluate(() => S.late.lists[0].items[0].code === '9.1.2') && /podle skluzu/.test(await page.textContent('.toast')), 'šipky: pořadí zůstane podle skluzu');
  // PDF
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-shpdf]')]);
  check(/^po-terminu-\d{4}-\d\d-\d\d-\d{4}\.pdf$/.test(dl.suggestedFilename()), `název PDF: ${dl.suggestedFilename()}`);
  const pdf = path.join(S, 'po-terminu.pdf');
  await dl.saveAs(pdf);
  const pt = spawnSync('python3', ['-c', 'import sys\nfrom pypdf import PdfReader\nprint("\\n".join(p.extract_text() for p in PdfReader(sys.argv[1]).pages))', pdf], { encoding: 'utf8' });
  if (pt.status === 0) {
    const txt = pt.stdout.replace(/\s+/g, ' ');
    check(/HALA 2 · PO TERMÍNU/.test(txt) && /Položky po termínu/.test(txt) && /SKLUZ 21/.test(txt) && /seřazeno podle skluzu, největší 21/.test(txt) && !/TOP SHORTAGE/.test(txt) && /Po termínu · seznam z/.test(txt), `PDF: ${txt.slice(0, 500)}`);
  } else console.log('pypdf není, text PDF se nekontroluje');
  // historie změn
  const log = await page.evaluate(() => S.log.filter(e => e.kind === 'late').map(e => e.text).join(' | '));
  check(/Po termínu: nahrán seznam/.test(log) && /Po termínu: poddíly z výrobního plánu/.test(log), `historie Po termínu: ${log.slice(0, 500)}`);

  // ---------- Shortage a Po termínu jsou oddělené (data i stav obrazovky) ----------
  await page.fill('#shQ', 'hřídel');
  await page.click('#nav [data-view="shortage"]');
  await page.waitForFunction(() => document.querySelector('#shTitle').textContent === 'Shortage' && document.querySelector('#shView table.sh-tab'));
  const sh = await page.evaluate(() => ({ rows: [...document.querySelectorAll('#shView tbody tr[data-shid]')].length, q: document.querySelector('#shQ').value, panel: !!document.querySelector('#shDepts'), late: document.querySelector('#view-shortage').classList.contains('sh-late'), top: document.querySelectorAll('#shView [data-shtop]').length }));
  check(sh.rows === 1 && sh.q === '' && sh.panel && !sh.late && sh.top === 1, `Shortage beze změny, vlastní hledání, panel oddělení: ${JSON.stringify(sh)}`);
  await page.click('#nav [data-view="potermin"]');
  await page.waitForFunction(() => document.querySelector('#shTitle').textContent === 'Po termínu');
  check(await page.inputValue('#shQ') === 'hřídel', 'Po termínu si pamatuje své hledání');
  await page.fill('#shQ', '');
  await page.click('#shView [data-shtoshortage]');
  await page.waitForFunction(() => ui.view === 'shortage');
  check(true, 'odkaz na oddělení v Shortage');
  await saved(page);

  // ---------- nové přihlášení: uložené, seřazené, oddělení se neukládají dvakrát ----------
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await ctx2.newPage();
  await watch(p2, 'znovu');
  await p2.goto(BASE);
  await p2.waitForSelector('#manual');
  await p2.click('#manual');
  await p2.fill('[name="key"]', key);
  await p2.click('#keyForm button[type="submit"]');
  await p2.waitForSelector('#skip');
  await p2.click('#skip');
  await p2.waitForSelector('#view-prehled.on');
  const again = await p2.evaluate(() => ({ items: S.late.lists[0].items.map(i => i.code).join(','), keys: Object.keys(sharedState(S).late).sort().join(','), depts: S.late.depts === S.shortage.depts, dn: S.late.depts.length }));
  check(again.items === '9.1.2,9.1.5,9.1.3,9.1.1,9.1.4' && again.keys === 'hist,lists,scans' && again.depts && again.dn === 2, `po novém přihlášení: ${JSON.stringify(again)}`);
  await ctx2.close();

  // ---------- telefon ----------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => showView('potermin'));
  await page.waitForSelector('#shView table.sh-tab');
  await page.waitForTimeout(300);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(over <= 1, `telefon: přetečení ${over} px`);
  await page.screenshot({ path: path.join(shots, '04-telefon.png'), fullPage: true });
  await ctx.close();
  await browser.close();
  if (problems.length) {
    console.log('PROBLÉMY:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
  console.log('e2e Po termínu: vše v pořádku');
})().catch(err => { console.error(err); process.exit(1); });
