// Prohlížečový průchod 2.75: Shortage – Připnout a Odepnout (připnutá položka přejde do dalších
// nahraných seznamů, dokud se neodepne), Duplikovat do vybraného oddělení (kopie, bez falešného
// odbourání), PDF, historie, Vrátit zpět a rychlost velkého seznamu (dřív výška poznámek zasekla
// stránku na desítky sekund). Hodiny stránky jdou po dnech (10., 11. a 12. 11. 2026).
// Spuštění: tests/run_e2e.sh e2e_shpin; snímky v $S/oshots-shpin.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-shpin');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };
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
const HEAD = 'Číslo objednávky\tNázev dílu\tEAN\tIndex\tUrgentní množství\t\tTOP\tProbíhající operace';
const ROW = { A: ['OBJ-A', 'Lopatka A', '8590000000101', 'A', '4', 'TOP', 'Broušení'], B: ['OBJ-B', 'Kryt B', '8590000000102', 'B', '2', 'TOP 2', 'Montáž'],
  C: ['OBJ-C', 'Hřídel C', '8590000000103', 'C', '6', '', 'Broušení'], D: ['OBJ-D', 'Víko D', '8590000000104', 'D', '1', '', 'Elox'] };
const tsv = keys => [HEAD, ...keys.map(k => { const r = ROW[k]; return [r[0], r[1], r[2], r[3], r[4], '', r[5], r[6]].join('\t'); })].join('\r\n') + '\r\n';

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
  await ctx.clock.setFixedTime(new Date(2026, 10, 10, 7, 0));
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
  await saved();
  const paste = async keys => {
    const before = await page.evaluate(() => S.shortage.lists.length);
    await page.evaluate(t => {
      const dt = new DataTransfer();
      dt.setData('text/plain', t);
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, tsv(keys));
    await page.waitForFunction(() => { const d = document.querySelector('#dlg[open]'); return d && /Jak se načte soubor urgentních dílů/.test(d.textContent); }, null, { timeout: 15000 });
    await page.click('#dlgOk');
    await page.waitForFunction(n => S.shortage.lists.length === n + 1, before);
    await saved();
  };
  const rowOf = (name, dup = false) => page.evaluateHandle(([n, dup]) => [...document.querySelectorAll('#shView tbody tr[data-shid]')].find(r => r.textContent.includes(n) && !!r.querySelector('.sh-duptag') === dup), [name, dup]);
  const idOf = async (name, dup = false) => (await rowOf(name, dup)).evaluate(r => r && r.dataset.shid);
  const visible = () => page.$$eval('#shView tbody tr[data-shid]', rs => rs.filter(r => !r.hidden).map(r => r.querySelector('td.name').textContent.replace(/\s+/g, ' ').trim()));
  const download = async (sel, name) => {
    const [d] = await Promise.all([page.waitForEvent('download'), page.click(sel)]);
    const p = path.join(shots, name);
    await d.saveAs(p);
    return p;
  };
  const cur = () => page.evaluate(() => { const l = S.shortage.lists[0]; return l.items.map(i => ({ ean: i.ean, name: i.name, pin: !!i.pin, dup: !!i.dup, dept: i.dept, note: i.note, st: i.st || '', days: i.days })); });

  // ---------- 1. den: seznam, oddělení, poznámka a stav u C ----------
  await page.evaluate(() => showView('shortage'));
  await page.waitForSelector('#view-shortage.on');
  await paste(['A', 'B', 'C', 'D']);
  await page.evaluate(() => {
    S.shortage.depts = [{ id: 'sdbrus', name: 'Brus', ops: [{ key: shOpKey('Broušení'), label: 'Broušení' }] }, { id: 'sdmont', name: 'Montáž', ops: [{ key: shOpKey('Montáž'), label: 'Montáž' }] }];
    save(); renderShortage();
  });
  await saved();
  const cId = await idOf('Hřídel C');
  await page.fill(`#shView textarea[data-shnote="${cId}"]`, 'hlídat díl');
  await page.evaluate(() => document.activeElement.blur());
  await page.selectOption(`#shView select[data-shst="${cId}"]`, 'run');
  await saved();
  check(await page.locator('#shView [data-shpin]').count() === 4 && await page.locator('#shView [data-shdup]').count() === 4, 'každá položka má Připnout a Duplikovat');
  check(await page.locator('#shView tbody svg').count() === 0 && await page.locator('#shView tbody .sh-ic').count() > 0, 'ikony v řádcích jsou CSS masky, ne inline SVG');

  // Připnout C
  await page.click(`#shView [data-shpin="${cId}"]`);
  await page.waitForFunction(id => { const b = document.querySelector(`#shView [data-shpin="${id}"]`); return b && b.getAttribute('aria-pressed') === 'true'; }, cId);
  await saved();
  const rowC = await rowOf('Hřídel C');
  check(await rowC.evaluate(r => r.classList.contains('sh-pinned') && /PŘIPNUTO/.test(r.querySelector('td.name').textContent)), 'připnutá položka má štítek PŘIPNUTO');
  check(await page.evaluate(id => { const i = S.shortage.lists[0].items.find(x => x.id === id); return i.pin && i.pin.by === 'Mistr haly' && i.pin.at === new Date(2026, 10, 10, 7, 0).getTime(); }, cId), 'připnutí zná kdo a kdy');
  check(/přejde i do dalších nahraných seznamů/.test(await page.textContent('.toast')), 'hláška po připnutí');
  check(/Připnuté\s*1/.test(await page.textContent('#shView [data-shagef="pin"]')), 'filtr Připnuté s počtem');
  await page.click('#shView [data-shagef="pin"]');
  await page.waitForFunction(() => document.querySelector('#shView [data-shagef="pin"]').getAttribute('aria-pressed') === 'true');
  check((await visible()).length === 1 && /^PŘIPNUTO Hřídel C/.test((await visible())[0]), `filtr Připnuté: ${JSON.stringify(await visible())}`);
  await page.click('#shView [data-shagef="all"]');
  await page.waitForFunction(() => document.querySelector('#shView [data-shagef="all"]').getAttribute('aria-pressed') === 'true');
  check((await visible()).length === 4, 'Všechny vrátí celý seznam');
  // Vrátit zpět jde i u připnutí (záznam po položkách, ne celé seznamy)
  check(await page.evaluate(() => { const x = S.log.slice().reverse().find(e => /připnuta/.test(e.text)); return !!x && undoable(x) && S.undo.find(u => x.u.includes(u.id)).ch.every(c => c.p.some(k => k[0] === '@')); }), 'připnutí jde vrátit zpět, uložená změna je po položkách');

  // Duplikovat A: okno s oddělením, výchozí jiné než teď
  const aId = await idOf('Lopatka A');
  await page.click(`#shView [data-shdup="${aId}"]`);
  await page.waitForSelector('#dlg[open] .sh-dupdepts');
  const dlg = (await page.textContent('#dlg[open]')).replace(/\s+/g, ' ');
  check(/Duplikovat položku/.test(dlg) && /Do jakého oddělení vložit kopii\?/.test(dlg) && /Originál zůstane v oddělení Brus/.test(dlg), `okno Duplikovat: ${dlg.slice(0, 300)}`);
  check(JSON.stringify(await page.$$eval('#dlg[open] .sh-dupopt', ls => ls.map(l => l.textContent.replace(/\s+/g, ' ').trim()))) === JSON.stringify(['Brusteď tady', 'Montáž', 'Nezařazeno']), `volby oddělení: ${JSON.stringify(await page.$$eval('#dlg[open] .sh-dupopt', ls => ls.map(l => l.textContent)))}`);
  check(await page.$eval('#dlg[open] input[name="dept"]:checked', i => i.value) === 'sdmont', 'předvybrané je jiné oddělení než teď');
  await page.screenshot({ path: path.join(shots, '01-duplikovat.png') });
  await page.click('#dlgOk');
  await page.waitForFunction(() => S.shortage.lists[0].items.some(i => i.dup));
  await saved();
  let items = await cur();
  check(JSON.stringify(items.map(i => [i.name, i.dup, i.dept])) === JSON.stringify([['Lopatka A', false, ''], ['Lopatka A', true, 'sdmont'], ['Kryt B', false, ''], ['Hřídel C', false, ''], ['Víko D', false, '']]), `kopie pod originálem v Montáži: ${JSON.stringify(items)}`);
  check(/Kopie položky 8590000000101 je v oddělení Montáž/.test(await page.textContent('.toast')), 'hláška po duplikování');
  const montRows = await page.evaluate(() => { const out = []; let r = document.querySelector('#shView tr.sh-depthead[data-shdepthead="sdmont"]'); r = r && r.nextElementSibling; while (r && !r.classList.contains('sh-depthead')) { if (r.dataset.shid) out.push(r.querySelector('td.name').textContent.replace(/\s+/g, ' ').trim()); r = r.nextElementSibling; } return out; });
  check(montRows.length === 2 && montRows.some(t => /KOPIE/.test(t) && /Lopatka A/.test(t)) && montRows.some(t => /Kryt B/.test(t)), `blok Montáž: ${JSON.stringify(montRows)}`);
  await page.screenshot({ path: path.join(shots, '02-kopie.png'), fullPage: true });
  // druhá kopie do Nezařazeno a její odebrání: neodbourá se
  await page.click(`#shView [data-shdup="${aId}"]`);
  await page.waitForSelector('#dlg[open] .sh-dupdepts');
  await page.check('#dlg[open] input[name="dept"][value="-"]');
  await page.click('#dlgOk');
  await page.waitForFunction(() => S.shortage.lists[0].items.filter(i => i.dup).length === 2);
  await saved();
  const dupNz = await page.evaluate(() => S.shortage.lists[0].items.find(i => i.dup && i.dept === '-').id);
  await page.click(`#shView [data-shdelitem="${dupNz}"]`);
  await page.waitForSelector('#dlg[open]');
  check(/Odebrat kopii\?/.test(await page.textContent('#dlg[open]')) && /Originál zůstane/.test(await page.textContent('#dlg[open]')), 'potvrzení odebrání kopie');
  await page.click('#dlgOk');
  await page.waitForFunction(() => S.shortage.lists[0].items.filter(i => i.dup).length === 1);
  await saved();
  check(await page.evaluate(() => { const l = S.shortage.lists[0]; return l.out.length === 0 && !(l.gone || []).length; }), 'odebraná kopie není odbouraná ani mezi odebranými');
  // historie
  const log1 = await page.evaluate(() => S.log.map(x => x.text).join(' | '));
  check(/Shortage: položka 8590000000103 Hřídel C připnuta \(přejde i do dalších seznamů\)/.test(log1) && /Shortage: položka 8590000000101 Lopatka A zduplikována, kopie v oddělení Montáž/.test(log1), `historie: ${log1.slice(-600)}`);
  // PDF: připnuto a kopie
  const pdf = await download('#shView [data-shpdf]', 'den1.pdf');
  const text = pdfText(pdf);
  if (text) check(/Připnuto/.test(text) && /Kopie/.test(text), `PDF: ${text.slice(0, 400)}`);
  else console.log('pypdf ani pymupdf není, text PDF se nekontroluje');

  // ---------- 2. den: urgenty bez C → C přejde i s poznámkou a stavem; kopie A se neodbourá ----------
  await ctx.clock.setFixedTime(new Date(2026, 10, 11, 7, 5));
  await paste(['A', 'B', 'D']);
  const msg2 = (await page.textContent('#shMsg')).replace(/\s+/g, ' ');
  check(/Připnuté ze seznamu z 10\. 11\. 2026 7:00: 1 položka přidána \(v urgentech nebyly\)/.test(msg2), `zpráva o připnutých: ${msg2.slice(0, 300)}`);
  check(/Nahráno|Vloženo/.test(msg2) && /3 položky/.test(msg2), `zpráva počítá jen vložené urgenty: ${msg2.slice(0, 300)}`);
  items = await cur();
  const c2 = items.find(i => i.name === 'Hřídel C');
  check(c2 && c2.pin && c2.note === 'hlídat díl' && c2.st === 'run' && c2.days === 2, `C ve druhém dni: ${JSON.stringify(c2)}`);
  check(items.length === 4 && !items.some(i => i.dup), `druhý den: A, B, D a připnuté C (kopie se nepřenáší): ${JSON.stringify(items.map(i => i.name))}`);
  check(await page.$('#shOut') === null && await page.locator('#shView .sh-outnone').count() === 1, 'kopie A ani C se jako odbourané nepočítají');
  check(/2\. den na shortage/.test(await (await rowOf('Hřídel C')).evaluate(r => r.textContent)), 'C je 2. den na shortage');
  await page.screenshot({ path: path.join(shots, '03-druhy-den.png'), fullPage: true });
  // odepnout C
  const cId2 = await idOf('Hřídel C');
  await page.click(`#shView [data-shpin="${cId2}"]`);
  await page.waitForFunction(id => document.querySelector(`#shView [data-shpin="${id}"]`).getAttribute('aria-pressed') === 'false', cId2);
  await saved();
  check(!/PŘIPNUTO/.test(await (await rowOf('Hřídel C')).evaluate(r => r.textContent)) && /odepnutá/.test(await page.textContent('.toast')), 'odepnutí: štítek pryč, hláška');
  check(await page.locator('#shView [data-shagef="pin"]').count() === 0, 'bez připnutých není filtr Připnuté');
  check(/položka 8590000000103 Hřídel C odepnuta/.test(await page.evaluate(() => S.log.map(x => x.text).join(' | '))), 'odepnutí v historii');

  // ---------- 3. den: bez C → C se nepřenese, je odbouraná ----------
  await ctx.clock.setFixedTime(new Date(2026, 10, 12, 7, 5));
  await paste(['A']);
  items = await cur();
  check(JSON.stringify(items.map(i => i.name)) === JSON.stringify(['Lopatka A']), `třetí den jen A: ${JSON.stringify(items.map(i => i.name))}`);
  check(!/Připnuté ze seznamu/.test(await page.textContent('#shMsg')), 'bez připnutých žádná zpráva o nich');
  const out3 = await page.$$eval('#shOut .sh-outrow[data-shout]', rs => rs.map(r => r.querySelector('.sh-outname').textContent.replace(/\s+/g, ' ').trim()));
  check(out3.length === 3 && out3.some(t => /Hřídel C/.test(t)), `odepnuté C je odbouraná: ${JSON.stringify(out3)}`);

  // ---------- rychlost: velký seznam (400 položek, třetina s poddíly, poznámky) ----------
  const perf = await page.evaluate(() => {
    const ops = ['Broušení', 'Montáž', 'Elox', 'Frézování'];
    const items = Array.from({ length: 400 }, (_, i) => ({ id: 'pf' + i, order: 'OBJ-' + i, name: 'Díl ' + i, ean: String(8592000000000 + i), index: 'A', qty: '3', top: i < 10, op: ops[i % 4], link: `https://is.example/x?activeBarcode=P${i}&y=1`, code: 'P' + i,
      note: i % 3 ? '' : 'Delší poznámka k položce, která se zalomí na několik řádků, aby bylo co přizpůsobovat', subs: i % 3 ? [] : [0, 1, 2].map(s => ({ id: `pf${i}s${s}`, ean: String(8593000000000 + i * 10 + s), code: `P${i}S${s}`, op: ops[s], note: s ? '' : 'Poznámka k poddílu' })) }));
    S.shortage = cleanShortage({ ...S.shortage, lists: [{ id: 'shperf', at: Date.now(), by: 'X', file: 'velky.xlsx', items }, ...S.shortage.lists] });
    ui.sh.open = 'shperf';
    let a = performance.now(); renderShortage(); document.body.offsetHeight; const render = performance.now() - a;
    a = performance.now(); ui.sh.q = 'díl 1'; shFilter(); document.body.offsetHeight; ui.sh.q = ''; shFilter(); document.body.offsetHeight; const filter = performance.now() - a;
    a = performance.now(); window.dispatchEvent(new Event('resize')); document.body.offsetHeight; const resize = performance.now() - a;
    const tall = [...document.querySelectorAll('#shView textarea.sh-note')].filter(t => t.value).every(t => t.scrollHeight <= t.clientHeight + 2);
    return { render, filter, resize, rows: document.querySelectorAll('#shView tbody tr[data-shrow]').length, tall };
  });
  console.log(`velký seznam: ${perf.rows} řádků, vykreslení ${Math.round(perf.render)} ms, hledání tam a zpět ${Math.round(perf.filter)} ms, změna velikosti okna ${Math.round(perf.resize)} ms`);
  check(perf.rows === 400 + 134 * 3 && perf.render < 5000 && perf.filter < 4000 && perf.resize < 1000, `velký seznam je pomalý: ${JSON.stringify(perf)}`);
  check(perf.tall, 'poznámky jsou celé vidět (výška podle textu)');
  // hledání u velkého seznamu s prodlevou: po dopsání se vyfiltruje
  await page.fill('#shQ', 'díl 399');
  await page.waitForFunction(() => [...document.querySelectorAll('#shView tbody tr[data-shid]')].filter(r => !r.hidden).length === 1, null, { timeout: 5000 });
  await page.fill('#shQ', '');
  await page.waitForFunction(() => [...document.querySelectorAll('#shView tbody tr[data-shid]')].filter(r => !r.hidden).length === 400, null, { timeout: 5000 });
  await page.evaluate(() => { S.shortage.lists = S.shortage.lists.filter(l => l.id !== 'shperf'); S.shortage = cleanShortage(S.shortage); ui.sh.open = null; renderShortage(); });

  // ---------- telefon ----------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const aId3 = await idOf('Lopatka A');
  check(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, 'telefon: bez vodorovného posouvání');
  await page.click(`#shView [data-shdup="${aId3}"]`);
  await page.waitForSelector('#dlg[open] .sh-dupdepts');
  await page.screenshot({ path: path.join(shots, '04-telefon-duplikovat.png') });
  await page.click('#dlgCancel');
  await page.waitForSelector('#dlg', { state: 'hidden' });
  await page.screenshot({ path: path.join(shots, '05-telefon.png'), fullPage: false });

  await browser.close();
  if (problems.length) { console.log('PROBLÉMY:\n' + problems.map(p => ' - ' + p).join('\n')); process.exit(1); }
  console.log('e2e_shpin ok');
})().catch(error => { console.error(error); process.exit(1); });
