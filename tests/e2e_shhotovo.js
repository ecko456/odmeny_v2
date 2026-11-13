// Prohlížečový průchod 2.76: Shortage – zelená výplň buňky EANu = Hotovo. Excel vyrobí openpyxl
// (zelená, světle zelená, červená, TOP z textu u zelené), vzorník barev nabídne Hotovo (zelené
// předvybrané), hotové položky jsou vždy na konci seznamu se štítkem HOTOVO a mimo počty TOP,
// ruční stav Hotovo položku přesune na konec a bez něj zpátky, PDF (štítek, pořadí, záhlaví),
// Doplnit chybějící ze schránky (zelená u položky, která v seznamu už je, jí dá Hotovo), filtr TOP,
// pravý panel, historie, telefon. S odděleními jsou hotové v posledním bloku Hotovo (i v PDF po odděleních). Spuštění: bash tests/run_e2e.sh e2e_shhotovo; snímky v $S/oshots-shhotovo.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-shhotovo');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };
const L = c => `http://is.example/commission.production.detail/default/1?activeBarcode=${c}&x=1`;
function pdfText(file) {
  const py = `import sys
try:
    import pypdf
    print('\\n'.join((p.extract_text() or '') for p in pypdf.PdfReader(sys.argv[1]).pages))
except ImportError:
    import pymupdf
    print('\\n'.join(p.get_text() for p in pymupdf.open(sys.argv[1])))`;
  const r = spawnSync('python3', ['-c', py, file], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.replace(/\s+/g, ' ') : null;
}
// vymyšlená data: A objednávka, B název, C EAN s odkazem (barva výplně), D index, E množství, G TOP, H operace
const PY = String.raw`
import sys
from openpyxl import Workbook
from openpyxl.styles import PatternFill
out = sys.argv[1]; L = lambda c: 'http://is.example/commission.production.detail/default/1?activeBarcode=' + c + '&x=1'
wb = Workbook(); ws = wb.active; ws.title = 'Urgenty'
ws.append(['Číslo objednávky', 'Název dílu', 'EAN', 'Index', 'Urgentní množství', '', 'TOP', 'Probíhající operace'])
rows = [('OBJ-701', 'Hřídel zelená', '8590000007001', 'A', 4, 'TOP', 'Broušení', '00B050'),
        ('OBJ-702', 'Kryt červený', '8590000007002', 'B', 2, '', 'Frézování', 'FF0000'),
        ('OBJ-703', 'Pouzdro', '8590000007003', 'C', 7, '', 'Broušení', ''),
        ('OBJ-704', 'Příruba světlá', '8590000007004', 'D', 1, '', 'Leštění', 'C6EFCE'),
        ('OBJ-705', 'Šroub M8', '8590000007005', 'E', 12, 'TOP 2', 'Brush', '')]
for i, (o, n, e, x, q, t, op, f) in enumerate(rows):
    ws.append([o, n, e, x, q, None, t, op]); c = ws.cell(row=i + 2, column=3); c.hyperlink = L('7.0.%d' % (i + 1))
    if f: c.fill = PatternFill('solid', fgColor='FF' + f)
wb.save(out + '/urgenty.xlsx')
`;

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const dir = path.join(S, 'shhotovo-files');
  fs.mkdirSync(dir, { recursive: true });
  const gen = spawnSync('python3', ['-c', PY, dir], { encoding: 'utf8' });
  if (gen.status !== 0) { console.log('PROBLÉMY:\n - openpyxl: ' + gen.stderr); process.exit(1); }
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
  await ctx.clock.setFixedTime(new Date(2026, 10, 13, 7, 30));
  const page = await ctx.newPage();
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`console: ${msg.text()}`); });
  page.on('pageerror', err => problems.push(`pageerror: ${err.message}`));
  page.on('dialog', d => d.dismiss());
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`)));
  await page.goto(BASE);
  await page.waitForSelector('#setupForm');
  await page.fill('[name="token"]', fs.readFileSync(path.join(S, 'odme2e', 'setup-token.txt'), 'utf8').trim());
  await page.fill('[name="label"]', 'Mistr haly');
  await page.click('#setupForm button[type="submit"]');
  await page.waitForSelector('.odm-card');
  await page.check('#saved');
  await page.click('#finish');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');
  const saved = () => page.waitForFunction(() => !store.dirty && !store.saving, null, { timeout: 15000 });
  const dlgOpen = re => page.waitForFunction(r => { const d = document.querySelector('#dlg[open]'); return d && new RegExp(r).test(d.textContent); }, re.source, { timeout: 15000 });
  const dlgClosed = () => page.waitForFunction(() => !document.querySelector('#dlg[open]'));
  const order = () => page.evaluate(() => S.shortage.lists[0].items.map(i => [i.name, i.st || '', !!i.top]));
  const rows = () => page.$$eval('#shView tbody tr[data-shid]', rs => rs.filter(r => !r.hidden).map(r => [r.querySelector('td.name').textContent.replace(/\s+/g, ' ').trim(), r.classList.contains('sh-done'), r.querySelector('select[data-shst]').value]));
  await saved();
  // oddělení Brusírna (Broušení): hotové půjdou až za Nezařazeno do bloku Hotovo
  await page.evaluate(() => { S.shortage = cleanShortage({ ...S.shortage, depts: [{ id: 'sdbrus', name: 'Brusírna', ops: [{ key: shOpKey('Broušení'), label: 'Broušení' }] }] }); save(); showView('shortage'); });
  await page.waitForSelector('#view-shortage.on');
  const heads = () => page.$$eval('#shView tr.sh-depthead', x => x.filter(h => !h.hidden).map(h => h.querySelector('b').textContent));

  // ---------- import: vzorník barev s Hotovo ----------
  await page.setInputFiles('#shFile', path.join(dir, 'urgenty.xlsx'));
  await dlgOpen(/Jak se načte soubor urgentních dílů/);
  await page.click('#dlgOk');
  await dlgOpen(/Barvy v buňkách EANu/);
  const sw = await page.$$eval('#dlg .sh-colorrow', x => x.map(r => [r.querySelector('b').textContent, r.querySelector('select').value, [...r.querySelectorAll('option')].map(o => o.value).join(',')]));
  const swm = Object.fromEntries(sw.map(x => [x[0], x[1]]));
  check(sw.length === 3 && swm['#00B050'] === 'done' && swm['#C6EFCE'] === 'done' && swm['#FF0000'] === 'top', `vzorník: zelené předvybrané jako Hotovo: ${JSON.stringify(sw)}`);
  check(sw.every(x => x[2] === 'top,top2,none,done'), `volby vzorníku: ${JSON.stringify(sw.map(x => x[2]))}`);
  check(/Hotovo \(výchozí pro zelenou\) dostanou stav Hotovo a budou vždy na konci seznamu/.test(await page.textContent('#dlg')), 'vysvětlení ve vzorníku');
  // pozn.: s pevnými hodinami stránky (clock.setFixedTime) přechody CSS stojí, čtverečky barev jsou na snímku prázdné; barvy hlídá e2e_shkroky
  await page.screenshot({ path: path.join(shots, '01-vzornik.png') });
  await page.click('#dlgOk');
  await dlgClosed();
  await page.waitForFunction(() => S.shortage.lists.length === 1);
  await saved();
  const o1 = await order();
  check(JSON.stringify(o1) === JSON.stringify([['Kryt červený', '', true], ['Šroub M8', '', false], ['Pouzdro', '', false], ['Hřídel zelená', 'done', true], ['Příruba světlá', 'done', false]]), `pořadí po importu, hotové na konci (i TOP z textu): ${JSON.stringify(o1)}`);
  const st1 = await page.evaluate(() => S.shortage.lists[0].items.filter(i => i.st).map(i => [i.stBy, i.stAt > 0]));
  check(JSON.stringify(st1) === JSON.stringify([['Mistr haly', true], ['Mistr haly', true]]), `kdo a kdy Hotovo: ${JSON.stringify(st1)}`);
  check(JSON.stringify(await page.evaluate(() => S.shortage.colors)) === JSON.stringify({ '00B050': 'done', 'FF0000': 'top', 'C6EFCE': 'done' }), 'barvy se zapamatují');
  const msg1 = (await page.textContent('#shMsg')).replace(/\s+/g, ' ');
  check(/Nahráno 5 položek .* z toho 1 TOP SHORTAGE .* a 1 TOP 2 .*, 2 Hotovo \(podle barvy EANu, na konci seznamu\)/.test(msg1), `hláška po importu: ${msg1.slice(0, 260)}`);
  const r1 = await rows();
  check(JSON.stringify(r1.map(r => [r[1], r[2]])) === JSON.stringify([[false, ''], [false, ''], [false, ''], [true, 'done'], [true, 'done']]), `řádky: ${JSON.stringify(r1)}`);
  check(/^HOTOVO Hřídel zelená/.test(r1[3][0]) && !/TOP SHORTAGE/.test(r1[3][0]) && /^HOTOVO Příruba světlá/.test(r1[4][0]), `štítek HOTOVO místo TOP: ${JSON.stringify(r1)}`);
  check(JSON.stringify(await heads()) === JSON.stringify(['Brusírna', 'Nezařazeno', 'Hotovo']) && /^Pouzdro/.test(r1[0][0]), `bloky: Hotovo až za odděleními: ${JSON.stringify(await heads())} ${JSON.stringify(r1.map(r => r[0].slice(0, 12)))}`);
  // filtr oddělení Brusírna: i hotová Hřídel (oddělení zůstává), blok Hotovo vidět
  await page.click('#shView [data-shdf="sdbrus"]');
  const fb = await rows();
  check(JSON.stringify(fb.map(r => r[0].replace(/ ?EAN.*/, ''))) === JSON.stringify(['Pouzdro', 'HOTOVO Hřídel zelená']) && JSON.stringify(await heads()) === JSON.stringify(['Brusírna', 'Hotovo']), `filtr oddělení s hotovými: ${JSON.stringify(fb)} ${JSON.stringify(await heads())}`);
  await page.click('#shView [data-shdf="sdbrus"]');
  const tiles = (await page.$$eval('#shView .stats .stat', x => x.map(s => s.textContent.replace(/\s+/g, ' ').trim()))).join(' | ');
  check(/TOP shortage ?1 ?v seznamu/.test(tiles) && /Položek ?5 ?hotovo 2/.test(tiles), `dlaždice: ${tiles}`);
  const doneLook = await page.evaluate(() => { const r = document.querySelector('#shView tr.sh-done'); return [getComputedStyle(r.querySelector('td')).boxShadow, getComputedStyle(r.querySelector('.sh-donetag')).backgroundColor]; });
  check(/inset/.test(doneLook[0]) && doneLook[1] !== 'rgba(0, 0, 0, 0)', `vzhled hotového řádku: ${JSON.stringify(doneLook)}`);
  await page.screenshot({ path: path.join(shots, '02-seznam.png'), fullPage: true });

  // ---------- filtr TOP: hotová TOP v něm není ----------
  await page.click('#shView [data-shtierf="top"]');
  const fr = await rows();
  check(JSON.stringify(fr.map(r => r[0].replace(/ ?EAN.*/, ''))) === JSON.stringify(['TOP SHORTAGE Kryt červený']), `filtr TOP bez hotových: ${JSON.stringify(fr)}`);
  await page.click('#shView [data-shagef="all"]');

  // ---------- ruční stav: Hotovo na konec, bez něj zpátky ----------
  const idOf = name => page.evaluate(n => S.shortage.lists[0].items.find(i => i.name === n).id, name);
  const pouzdro = await idOf('Pouzdro');
  await page.selectOption(`#shView select[data-shst="${pouzdro}"]`, 'done');
  await page.waitForFunction(() => /Pouzdro|8590000007003/.test(document.querySelector('.toast, #toast')?.textContent || '') || S.shortage.lists[0].items.at(-1).name === 'Pouzdro');
  await saved();
  check(JSON.stringify((await order()).map(x => x[0])) === JSON.stringify(['Kryt červený', 'Šroub M8', 'Hřídel zelená', 'Příruba světlá', 'Pouzdro']), `ruční Hotovo na úplný konec: ${JSON.stringify(await order())}`);
  check((await rows()).at(-1)[1] === true, 'řádek je hned vidět na konci jako hotový');
  const hridel = await idOf('Hřídel zelená');
  await page.selectOption(`#shView select[data-shst="${hridel}"]`, 'run');
  await page.waitForFunction(() => S.shortage.lists[0].items[1].name === 'Hřídel zelená');
  await saved();
  check(JSON.stringify((await order()).map(x => x[0] + ':' + x[1])) === JSON.stringify(['Kryt červený:', 'Hřídel zelená:run', 'Šroub M8:', 'Příruba světlá:done', 'Pouzdro:done']), `Rozpracováno: zpátky na konec TOP: ${JSON.stringify(await order())}`);
  // poddíl ani jiný stav pořadí nemění
  const sroub = await idOf('Šroub M8');
  await page.selectOption(`#shView select[data-shst="${sroub}"]`, 'wait');
  await saved();
  check((await order())[2][0] === 'Šroub M8', 'Čekáme na díl pořadí nemění');
  await page.screenshot({ path: path.join(shots, '03-rucne.png'), fullPage: true });

  // ---------- PDF ----------
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#shView [data-shpdf]')]);
  const pf = path.join(shots, 'shortage.pdf');
  await dl.saveAs(pf);
  const t = pdfText(pf);
  if (t) {
    check(/hotovo 2 \(na konci\)/.test(t), `záhlaví PDF s hotovými: ${t.slice(0, 300)}`);
    const pos = ['Brusírna', 'Hřídel zelená', 'Nezařazeno', 'Kryt červený', 'Šroub M8', 'Hotovo · 2 položky', 'Příruba světlá', 'Pouzdro'].map(n => t.indexOf(n));
    check(pos.every(p => p >= 0) && pos.every((p, k) => !k || p > pos[k - 1]), `pořadí v PDF: ${JSON.stringify(pos)}`);
    check((t.match(/HOTOVO/g) || []).length === 2 && /Stav: Hotovo/.test(t), `štítek HOTOVO v PDF: ${(t.match(/HOTOVO/g) || []).length}`);
    check((t.match(/TOP SHORTAGE/g) || []).length === 3 && /2 TOP SHORTAGE/.test(t), `TOP SHORTAGE jen u nehotových (štítky Kryt a Hřídel, záhlaví „2 TOP SHORTAGE“): ${(t.match(/TOP SHORTAGE/g) || []).length}`);
  } else console.log('bez pypdf/pymupdf: text PDF se nekontroluje');
  spawnSync('python3', ['-c', 'import pymupdf,sys\nd=pymupdf.open(sys.argv[1]); d[0].get_pixmap(matrix=pymupdf.Matrix(2,2)).save(sys.argv[2])', pf, path.join(shots, '04-pdf.png')]);
  // PDF po odděleních: Hotovo na vlastní (poslední) straně
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#shView [data-shpdfdept]')]);
  const pf2 = path.join(shots, 'shortage-oddeleni.pdf');
  await dl2.saveAs(pf2);
  const pages = spawnSync('python3', ['-c', 'import sys,json\ntry:\n import pypdf\n print(json.dumps([(p.extract_text() or "") for p in pypdf.PdfReader(sys.argv[1]).pages]))\nexcept ImportError:\n import pymupdf\n print(json.dumps([p.get_text() for p in pymupdf.open(sys.argv[1])]))', pf2], { encoding: 'utf8' });
  if (pages.status === 0) {
    const pg = JSON.parse(pages.stdout).map(x => x.replace(/\s+/g, ' '));
    check(pg.length === 3 && /Chybějící díly · Brusírna/.test(pg[0]) && /Chybějící díly · Nezařazeno/.test(pg[1]) && /Chybějící díly · Hotovo/.test(pg[2]) && /Příruba světlá/.test(pg[2]) && /Pouzdro/.test(pg[2]) && !/Pouzdro/.test(pg[0]),
      `PDF po odděleních, Hotovo na konci: ${JSON.stringify(pg.map(x => x.slice(0, 90)))}`);
  }

  // ---------- Doplnit chybějící ze schránky: zelená u položky v seznamu = Hotovo ----------
  const tr = (o, n, e, x, q, top, op, bg) => `<tr><td>${o}</td><td>${n}</td><td${bg ? ` style="background:#${bg}"` : ''}><a href="${L(e).replace(/&/g, '&amp;')}">${e}</a></td><td>${x}</td><td>${q}</td><td></td><td>${top}</td><td>${op}</td></tr>`;
  const html = `<html><body><table><!--StartFragment-->
<tr><td>Číslo objednávky</td><td>Název dílu</td><td>EAN</td><td>Index</td><td>Urgentní množství</td><td></td><td>TOP</td><td>Probíhající operace</td></tr>
${tr('OBJ-702', 'Kryt červený', '8590000007002', 'B', 2, '', 'Frézování', '00B050')}
${tr('OBJ-705', 'Šroub M8', '8590000007005', 'E', 12, 'TOP 2', 'Brush', '')}
${tr('OBJ-706', 'Víko nové', '8590000007006', 'F', 3, '', 'Broušení', '00B050')}
${tr('OBJ-707', 'Matice nová', '8590000007007', 'G', 9, '', 'Broušení', '')}
<!--EndFragment--></table></body></html>`;
  await page.click('#shView [data-shmerge]');
  await page.evaluate(h => {
    const dt = new DataTransfer();
    dt.setData('text/html', h);
    dt.setData('text/plain', 'x');
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, html);
  await dlgOpen(/Jak se načte soubor urgentních dílů/);
  await page.click('#dlgOk');
  await dlgOpen(/Barvy v buňkách EANu/);
  check(await page.$eval('#dlg [name="k-00B050"]', s => s.value) === 'done', 'zapamatovaná zelená = Hotovo');
  await page.click('#dlgOk');
  await dlgOpen(/Doplnit chybějící/);
  const md = (await page.textContent('#dlgBody')).replace(/\s+/g, ' ');
  check(/2 položky chybí/.test(md) && /1 položka ze seznamu má v novém souboru barvu Hotovo: dostane stav Hotovo a přesune se na konec seznamu/.test(md), `dialog doplnění: ${md.slice(0, 400)}`);
  await page.screenshot({ path: path.join(shots, '05-doplnit.png') });
  await page.click('#dlgOk');
  await page.waitForFunction(() => S.shortage.lists[0].items.length === 7);
  await saved();
  const o2 = await order();
  check(JSON.stringify(o2.map(x => x[0] + ':' + x[1])) === JSON.stringify(['Hřídel zelená:run', 'Šroub M8:wait', 'Matice nová:', 'Příruba světlá:done', 'Pouzdro:done', 'Kryt červený:done', 'Víko nové:done']), `po doplnění: ${JSON.stringify(o2)}`);
  const msg2 = (await page.textContent('#shMsg')).replace(/\s+/g, ' ');
  check(/doplněny 2 položky/.test(msg2) && /1 položka označena Hotovo/.test(msg2), `hláška doplnění: ${msg2.slice(0, 300)}`);
  // znovu stejné: nic nechybí, nic dalšího se neoznačí
  await page.click('#shView [data-shmerge]');
  await page.evaluate(h => {
    const dt = new DataTransfer(); dt.setData('text/html', h); dt.setData('text/plain', 'x');
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, html);
  await dlgOpen(/Jak se načte soubor urgentních dílů/);
  await page.click('#dlgOk');
  await dlgOpen(/Barvy v buňkách EANu/);
  await page.click('#dlgOk');
  await page.waitForFunction(() => /Nic nechybí/.test(document.querySelector('#shMsg').textContent));
  check(!/označen/.test(await page.textContent('#shMsg')), 'podruhé se nic neoznačí');

  // ---------- historie ----------
  await saved();
  const log = await page.evaluate(() => S.log.filter(x => x.kind === 'shortage').map(x => x.text || ''));
  check(log.some(x => /barva EANu #00B050 = Hotovo/.test(x)), `historie barvy: ${log.slice(0, 6).join(' | ')}`);
  check(log.some(x => /nahrán seznam .*hotovo 2/.test(x)), `historie nahrání: ${log.slice(0, 6).join(' | ')}`);
  check(log.some(x => /Pouzdro.* – stav: bez stavu → Hotovo/.test(x)), `historie ručního Hotovo: ${log.slice(0, 8).join(' | ')}`);
  check(!log.some(x => /pořadí/.test(x)), `přesun kvůli Hotovo není změna pořadí: ${log.filter(x => /pořadí/.test(x)).join(' | ')}`);

  // ---------- pravý panel (široký monitor): hotové na konci a v počtech ----------
  await page.setViewportSize({ width: 3840, height: 1400 });   // karta Shortage jen v širokém panelu (2.64)
  await page.waitForFunction(() => { const c = document.querySelector('#rail .rail-short'); return c && getComputedStyle(c).display !== 'none'; });
  const rail = await page.$$eval('.rail-short .rail-sh', x => x.map(r => [r.querySelector('.rail-shname').textContent.trim(), r.querySelector('.rail-shtag').textContent.trim()]));
  const railSum = (await page.textContent('.rail-short .rail-sum')).replace(/\s+/g, ' ');
  check(JSON.stringify(rail) === JSON.stringify([['Hřídel zelená', 'TOP'], ['Šroub M8', 'TOP 2'], ['Matice nová', '·'], ['Příruba světlá', '✓'], ['Pouzdro', '✓']]) && /hotovo 4/.test(railSum) && /1 TOP/.test(railSum), `pravý panel: ${JSON.stringify(rail)} ${railSum}`);
  await page.screenshot({ path: path.join(shots, '06-panel.png') });
  // stav z panelu: Hotovo u Matice ji přesune na konec i v modulu
  await page.hover('.rail-short .rail-sh:nth-child(3)');
  await page.click('.rail-short .rail-sh:nth-child(3) [data-railshst="done"]');
  await page.waitForFunction(() => S.shortage.lists[0].items.at(-1).name === 'Matice nová');
  check((await rows()).at(-1)[0].includes('Matice nová'), 'Hotovo z pravého panelu přesune položku na konec i v modulu');
  await saved();

  // ---------- monitor 1440 bez přetečení, telefon ----------
  await page.setViewportSize({ width: 1440, height: 1000 });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(over <= 0, `monitor 1440 přetéká o ${over} px`);
  // telefonní rozložení stejné stránky (bez nového přihlášení)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { showView('shortage'); renderShortage(); });
  await page.waitForTimeout(300);
  const pOver = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(pOver <= 0, `telefon přetéká o ${pOver} px`);
  const lastRow = await page.evaluate(() => { const r = [...document.querySelectorAll('#shView tbody tr[data-shid]')].at(-1); r.scrollIntoView(); return r.querySelector('.sh-donetag') ? r.querySelector('td.name').textContent.replace(/\s+/g, ' ').trim() : ''; });
  check(/^HOTOVO Matice nová/.test(lastRow), `telefon: poslední řádek hotový: ${lastRow}`);
  await page.screenshot({ path: path.join(shots, '07-telefon.png') });

  await browser.close();
  if (problems.length) { console.log('PROBLÉMY:\n - ' + problems.join('\n - ')); process.exit(1); }
  console.log('e2e Shortage Hotovo: vše v pořádku');
})().catch(e => { console.log('PROBLÉMY:\n - ' + (e.stack || e)); process.exit(1); });
