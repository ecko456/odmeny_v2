// Prohlížečový průchod 2.73: Shortage po dnech. Zabalení dne, porovnání s předchozím dnem
// (kolikátý den je položka na shortage, odbourané položky), filtr TOP / TOP 2 / nové / 2 a více
// dní (i v PDF), ruční odebrání, rozbalení, pohled Historie s Excelem, pravý panel a telefon.
// Hodiny stránky jdou po dnech (10., 11. a 12. 11. 2026). Spuštění: tests/run_e2e.sh e2e_shdny;
// snímky v $S/oshots-shdny.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-shdny');
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
  C: ['OBJ-C', 'Hřídel C', '8590000000103', 'C', '6', '', 'Broušení'], D: ['OBJ-D', 'Víko D', '8590000000104', 'D', '1', '', 'Elox'],
  E: ['OBJ-E', 'Pouzdro E', '8590000000105', 'E', '3', '', 'Montáž'], F: ['OBJ-F', 'Příruba F', '8590000000106', 'F', '8', '', 'Broušení'] };
const tsv = keys => [HEAD, ...keys.map(k => { const r = ROW[k]; return [r[0], r[1], r[2], r[3], r[4], '', r[5], r[6]].join('\t'); })].join('\r\n') + '\r\n';

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1700, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
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
  const colsOk = async () => {
    await page.waitForFunction(() => { const d = document.querySelector('#dlg[open]'); return d && /Jak se načte soubor urgentních dílů/.test(d.textContent); }, null, { timeout: 15000 });
    await page.click('#dlgOk');
    await page.waitForFunction(() => { const d = document.querySelector('#dlg[open]'); return !d || !/Jak se načte soubor urgentních dílů/.test(d.textContent); });
  };
  const paste = async keys => {
    const before = await page.evaluate(() => S.shortage.lists.length);
    await page.evaluate(t => {
      const dt = new DataTransfer();
      dt.setData('text/plain', t);
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, tsv(keys));
    await colsOk();
    await page.waitForFunction(n => S.shortage.lists.length === n + 1, before);
    await saved();
  };
  const confirm = async () => { await page.waitForSelector('#dlg[open]'); await page.click('#dlgOk'); await page.waitForSelector('#dlg', { state: 'hidden' }); };
  const download = async (sel, name) => {
    const [d] = await Promise.all([page.waitForEvent('download'), page.click(sel)]);
    const p = path.join(shots, name);
    await d.saveAs(p);
    return p;
  };
  const visible = () => page.$$eval('#shView tbody tr[data-shid]', rs => rs.filter(r => !r.hidden).map(r => S.shortage.lists.find(l => l.items.some(i => i.id === r.dataset.shid)).items.find(i => i.id === r.dataset.shid).name));
  const ageOf = name => page.evaluate(n => { const tr = [...document.querySelectorAll('#shView tbody tr[data-shid]')].find(r => r.textContent.includes(n)); const a = tr && tr.querySelector('.sh-age'); return a ? [...a.children].map(c => c.textContent.trim()).join(' ').replace(/\s+/g, ' ') : ''; }, name);

  // ---------- 1. den: první seznam, nic k porovnání ----------
  await page.evaluate(() => showView('shortage'));
  await page.waitForSelector('#view-shortage.on');
  await paste(['A', 'B', 'C', 'D', 'E']);
  check(await page.locator('#shView .sh-age').count() === 0, 'první seznam: bez štítků dnů');
  check(!/Na shortage 2\+ dní/.test(await page.textContent('#shView .stats')) && !(await page.$('#shOut')), 'první seznam: bez dlaždice proti předchozímu dni a bez Odstraněno');
  check(await page.locator('#shView [data-shtierf]').count() === 2 && await page.locator('#shView [data-shagef="old"]').count() === 0, 'první seznam: filtr TOP a TOP 2, bez filtru dnů');
  // zabalit den
  await page.click('#shView [data-shpack]');
  await page.waitForSelector('#dlg[open]');
  check(/půjde do historie jen ke čtení/.test(await page.textContent('#dlg[open]')), 'potvrzení zabalení vysvětluje, co se stane');
  await page.click('#dlgOk');
  await page.waitForSelector('#shView .sh-newday');
  await saved();
  check(await page.evaluate(() => !!S.shortage.lists[0].packed && S.shortage.lists[0].packed.by === 'Mistr haly'), 'seznam je zabalený (kdo a kdy)');
  check(/Den je zabalený/.test(await page.textContent('#shView .sh-newday')) && /je zabalený v historii/.test(await page.textContent('#shMsg')), 'po zabalení výzva nahrát dnešní urgenty');
  await page.screenshot({ path: path.join(shots, '01-zabaleno.png'), fullPage: true });
  // zabalený seznam jen ke čtení
  await page.click('#shView .sh-newday [data-shopen]');
  await page.waitForSelector('#shView .sh-packed');
  check(await page.locator('#shView .sh-packed textarea, #shView .sh-packed select, #shView [data-shgrip]').count() === 0 && await page.locator('#shView .sh-packed tbody tr').count() === 5, 'zabalený seznam: jen ke čtení, 5 položek');
  await page.click('#shView .sh-packed [data-shopen=""]');
  await page.waitForSelector('#shView .sh-newday');

  // ---------- 2. den: A, B, C zůstávají, F nová, D a E se odbouraly ----------
  await ctx.clock.setFixedTime(new Date(2026, 10, 11, 7, 5));
  await paste(['A', 'B', 'C', 'F']);
  const msg2 = (await page.textContent('#shMsg')).replace(/\s+/g, ' ');
  check(/Proti seznamu z 10\. 11\. 2026 7:00: na shortage 2 a více dní 3, nových 1, odbouráno 2/.test(msg2), `zpráva proti předchozímu dni: ${msg2}`);
  check((await ageOf('Lopatka A')) === '2. den na shortage od 10. 11.' && (await ageOf('Kryt B')).startsWith('2. den') && (await ageOf('Příruba F')) === 'nová', `štítky dnů: ${await ageOf('Lopatka A')} | ${await ageOf('Příruba F')}`);
  check(/Na shortage 2\+ dní\s*3\s*nových 1 · odbouráno 2/.test((await page.textContent('#shView .stats')).replace(/\s+/g, ' ').replace(/(\d) (nových)/, '$1 $2')), `dlaždice: ${(await page.textContent('#shView .stats')).replace(/\s+/g, ' ')}`);
  const out2 = await page.$$eval('#shOut .sh-outrow[data-shout]', rs => rs.map(r => r.textContent.replace(/\s+/g, ' ').trim()));
  check(out2.length === 2 && out2.some(t => /Víko D/.test(t) && /1 den/.test(t) && /v urgentech už není/.test(t)) && out2.some(t => /Pouzdro E/.test(t)), `Odstraněno ze shortage: ${JSON.stringify(out2)}`);
  check(/2 položky v těchto urgentech už nejsou \(proti seznamu z 10\. 11\. 2026 7:00\)/.test(await page.textContent('#shOut summary')), `souhrn Odstraněno: ${await page.textContent('#shOut summary')}`);
  check(await page.locator('#shView tbody tr[data-shid]').count() === 4, 'Odstraněno není v tabulce položek');
  await page.screenshot({ path: path.join(shots, '02-druhy-den.png'), fullPage: true });

  // filtry: TOP, TOP 2, nové, 2 a více dní (a kombinace)
  const pick = async sel => { await page.click(`#shView ${sel}`); await page.waitForFunction(s => document.querySelector(`#shView ${s}`) && document.querySelector(`#shView ${s}`).getAttribute('aria-pressed') === 'true', sel); };
  await pick('[data-shtierf="top"]');
  check(JSON.stringify(await visible()) === JSON.stringify(['Lopatka A']), `filtr TOP: ${JSON.stringify(await visible())}`);
  await pick('[data-shtierf="top2"]');
  check(JSON.stringify((await visible()).sort()) === JSON.stringify(['Kryt B', 'Lopatka A']), `filtr TOP + TOP 2: ${JSON.stringify(await visible())}`);
  check(await page.evaluate(() => document.querySelector('#shView table.sh-tab').classList.contains('sh-nodrag')) && /PDF k tisku · vybrané položky/.test(await page.textContent('#shView [data-shpdf]')), 'při filtru se nepřesouvá, PDF tiskne vybrané');
  await page.click('#shView [data-shagef="all"]');
  await page.waitForFunction(() => document.querySelector('#shView [data-shagef="all"]').getAttribute('aria-pressed') === 'true');
  await pick('[data-shagef="new"]');
  check(JSON.stringify(await visible()) === JSON.stringify(['Příruba F']), `filtr Nové dnes: ${JSON.stringify(await visible())}`);
  await pick('[data-shagef="old"]');
  check(JSON.stringify((await visible()).sort()) === JSON.stringify(['Hřídel C', 'Kryt B', 'Lopatka A']), `filtr 2 a více dní: ${JSON.stringify(await visible())}`);
  await page.screenshot({ path: path.join(shots, '03-filtr.png'), fullPage: true });
  const pdf = await download('#shView [data-shpdf]', 'dva-a-vice-dni.pdf');
  const text = pdfText(pdf);
  if (text) {
    check(/na shortage 2 a více dní/.test(text) && /2\. den na shortage \(od 10\. 11\.\)/.test(text) && text.includes(ROW.A[2]) && text.includes(ROW.C[2]) && !text.includes(ROW.F[2]), `PDF jen 2 a více dní: ${text.slice(0, 300)}`);
  } else console.log('pypdf ani pymupdf není, text PDF se nekontroluje');
  await pick('[data-shtierf="top"]');
  check(JSON.stringify(await visible()) === JSON.stringify(['Lopatka A']), 'TOP a zároveň 2 a více dní');
  await page.click('#shView [data-shagef="all"]');
  await page.waitForFunction(() => document.querySelectorAll('#shView tbody tr[data-shid]:not([hidden])').length === 4);

  // ruční odebrání: v historii jako odbouraná (odebráno ručně)
  await page.click('#shView tr[data-shid]:has-text("Hřídel C") [data-shdelitem]');
  await page.waitForSelector('#dlg[open]');
  check(/v historii bude jako odbouraná/.test(await page.textContent('#dlg[open]')), 'potvrzení odebrání zmiňuje historii');
  await page.click('#dlgOk');
  await page.waitForFunction(() => S.shortage.lists[0].items.length === 3);
  await saved();
  const man = await page.$$eval('#shOut .sh-outrow[data-shout]', rs => rs.map(r => r.textContent.replace(/\s+/g, ' ').trim()).filter(t => /Hřídel C/.test(t)));
  check(man.length === 1 && /odebráno ručně/.test(man[0]) && /Mistr haly/.test(man[0]) && /2 dny/.test(man[0]), `ručně odebraná: ${JSON.stringify(man)}`);

  // ---------- 3. den: A 3. den, D se vrátila ----------
  await ctx.clock.setFixedTime(new Date(2026, 10, 12, 6, 50));
  await paste(['A', 'D']);
  check((await ageOf('Lopatka A')) === '3. den na shortage od 10. 11.' && await page.locator('#shView tr[data-shid]:has-text("Lopatka A") .sh-agetag.sh-long').count() === 1, `A 3. den: ${await ageOf('Lopatka A')}`);
  check(/znovu · odbouráno 11\. 11\./.test(await ageOf('Víko D')), `D znovu: ${await ageOf('Víko D')}`);
  check(/Zabalit seznam z 11\. 11\. 2026 7:05/.test(await page.textContent('#shMsg')), 'předchozí nezabalený seznam jde zabalit ze zprávy');
  await page.click('#shMsg [data-shpack]');
  await confirm();
  await saved();
  check(await page.evaluate(() => S.shortage.lists.map(l => !!l.packed).join()) === 'false,true,true', `zabalený je i druhý den, dnešní zůstal otevřený: ${await page.evaluate(() => JSON.stringify(S.shortage.lists.map(l => [l.id, shWhen(l), !!l.packed])))}`);
  check(await page.evaluate(() => ui.sh.open === S.shortage.lists[0].id || shList().id === S.shortage.lists[0].id), 'otevřený zůstal dnešní seznam');
  // pravý panel: dnešní seznam a počet 2 a více dní
  check(/2 a více dní 1/.test(await page.textContent('#rail .rail-short')), `pravý panel: ${(await page.textContent('#rail .rail-short')).replace(/\s+/g, ' ').slice(0, 160)}`);

  // ---------- Historie ----------
  await page.click('#shView [data-shmode="historie"]');
  await page.waitForSelector('#shView .sh-hdays');
  const hTiles = (await page.textContent('#shView .stats')).replace(/\s+/g, ' ');
  // odbouráno: 2. den D, E (po 1 dni); C ručně (2 dny); 3. den B, F (2 dny a 1 den)
  check(/Odbouráno\s*5/.test(hTiles) && /Ø dní na shortage\s*1,4/.test(hTiles) && /Odbouráno do 1 dne\s*60 %/.test(hTiles), `dlaždice historie: ${hTiles}`);
  check(await page.locator('#shView .sh-htab tbody tr').count() === 3, 'tři dny v historii');
  check(await page.locator('#shView .sh-hout .sh-outrow[role="row"]:not(.sh-outhead)').count() === 5, 'pět odbouraných položek');
  check(await page.locator('#shView .sh-hbar').count() === 4, 'rozložení podle dní');
  await page.click('#shView [data-shtierf="top2"]');
  await page.waitForFunction(() => document.querySelectorAll('#shView .sh-hout .sh-outrow[role="row"]:not(.sh-outhead)').length === 1);
  check(/Kryt B/.test(await page.textContent('#shView .sh-hout')), 'historie: filtr TOP 2');
  await page.click('#shView [data-shagef="all"]');
  await page.screenshot({ path: path.join(shots, '04-historie.png'), fullPage: true });
  const xl = await download('#shView [data-shhxlsx]', 'historie.xlsx');
  const book = await page.evaluate(async b64 => { const X = await xlsx(); const wb = X.read(b64, { type: 'base64' }); return wb.SheetNames.map(n => [n, X.utils.sheet_to_json(wb.Sheets[n], { header: 1 }).length]); }, fs.readFileSync(xl).toString('base64'));
  check(JSON.stringify(book) === JSON.stringify([['Dny', 4], ['Odbourané položky', 6]]), `Excel historie: ${JSON.stringify(book)}`);
  // otevřít den z historie a rozbalit ho
  await page.click('#shView .sh-htab tbody tr:last-child [data-shopen]');
  await page.waitForSelector('#shView .sh-packed');
  check(/Zabalený seznam z 10\. 11\. 2026 7:00/.test(await page.textContent('#shView .sh-packed h2')), 'z historie se otevře zabalený den');
  await page.click('#shView [data-shunpack]');
  await page.waitForSelector('#shView .sh-card:not(.sh-packed) textarea.sh-note');
  await saved();
  check(await page.evaluate(() => !S.shortage.lists[2].packed), 'rozbalený seznam jde upravovat');
  const log = await page.evaluate(() => S.log.filter(x => x.kind === 'shortage').map(x => x.text));
  check(log.some(t => /^Shortage: zabalen seznam 10\. 11\. 2026 7:00 \(5 položek\)$/.test(t)) && log.some(t => /^Shortage: rozbalen seznam 10\. 11\. 2026 7:00$/.test(t)) && log.some(t => /^Shortage: zabalen seznam 11\. 11\. 2026 7:05/.test(t)), `historie změn: ${JSON.stringify(log)}`);

  // ---------- telefon ----------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#shView [data-shopen]:not([data-shopen=""])').catch(() => {});
  await page.evaluate(() => { ui.sh.open = S.shortage.lists[1].id; ui.sh.mode = 'list'; renderShortage(); });
  await page.waitForSelector('#shOut');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(over <= 1, `telefon: stránka nepřetéká (${over} px)`);
  check(await page.evaluate(() => getComputedStyle(document.querySelector('#shOut .sh-outk')).display) === 'block', 'telefon: popisky v Odstraněno');
  await page.screenshot({ path: path.join(shots, '05-telefon.png'), fullPage: true });
  await page.evaluate(() => { ui.sh.mode = 'historie'; renderShortage(); });
  await page.waitForSelector('#shView .sh-hdays');
  const over2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(over2 <= 1, `telefon: historie nepřetéká (${over2} px)`);
  await page.screenshot({ path: path.join(shots, '06-telefon-historie.png'), fullPage: true });

  await browser.close();
  if (problems.length) { console.log('PROBLÉMY:\n' + problems.join('\n')); process.exit(1); }
  console.log('e2e_shdny ok');
})().catch(error => { console.error(error); process.exit(1); });
