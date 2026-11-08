// Prohlížečový průchod 2.65: stav položek v Shortage a ruční přidání položky.
// Ověří: stav v řádku modulu (položka i poddíl), historie změn, PDF ukazuje jen zvolený stav,
// ruční přidání položky (validace, odkaz do QR, TOP, stav, nový seznam bez seznamu),
// pravý panel na širokém monitoru (odkaz u EANu, stav po najetí, znovu klepnutí stav zruší).
// Spuštění stejně jako ostatní e2e (tests/run_e2e.sh e2e_shstav); snímky v $S/oshots-shstav.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-shstav');
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
  return r.status === 0 ? r.stdout : null;
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`console: ${msg.text()}`); });
  page.on('pageerror', err => problems.push(`pageerror: ${err.message}`));
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

  // ---------- bez seznamu: ruční přidání založí nový seznam ----------
  await page.evaluate(() => showView('shortage'));
  await page.waitForSelector('#view-shortage.on [data-shmanual]');
  await page.click('#view-shortage [data-shmanual]');
  await page.waitForSelector('#dlg[open] [name="ean"]');
  await page.click('#dlgOk');
  check(/aspoň EAN nebo název/.test(await page.textContent('#dlg[open] .dlg-error')), 'prázdná položka se nepřidá');
  await page.fill('#dlg[open] [name="ean"]', '8590001');
  await page.fill('#dlg[open] [name="link"]', 'ftp://spatne');
  await page.click('#dlgOk');
  check(/Odkaz musí/.test(await page.textContent('#dlg[open] .dlg-error')), 'špatný odkaz se nepřijme');
  await page.fill('#dlg[open] [name="link"]', 'https://is.example/dil?activeBarcode=QR8590001&x=1');
  await page.fill('#dlg[open] [name="order"]', '4500100');
  await page.fill('#dlg[open] [name="name"]', 'Lopatka turbíny');
  await page.fill('#dlg[open] [name="qty"]', '12');
  await page.fill('#dlg[open] [name="op"]', 'Broušení');
  await page.selectOption('#dlg[open] [name="tier"]', 'top');
  await page.screenshot({ path: path.join(shots, '01-rucne.png') });
  await page.click('#dlgOk');
  await page.waitForFunction(() => S.shortage.lists.length === 1);
  await saved();
  const first = await page.evaluate(() => { const l = S.shortage.lists[0]; return { file: l.file, it: l.items[0] }; });
  check(first.file === 'zadáno ručně' && first.it.top && first.it.code === 'QR8590001' && first.it.order === '4500100', `nový seznam s ruční položkou: ${JSON.stringify(first)}`);

  // ---------- do existujícího seznamu ----------
  await page.click('#view-shortage [data-shmanual]');
  await page.waitForSelector('#dlg[open] [name="ean"]');
  await page.fill('#dlg[open] [name="ean"]', '8590002');
  await page.fill('#dlg[open] [name="name"]', 'Kryt ložiska');
  await page.selectOption('#dlg[open] [name="st"]', 'wait');
  await page.click('#dlgOk');
  await page.waitForFunction(() => S.shortage.lists[0].items.length === 2);
  await saved();
  const second = await page.evaluate(() => S.shortage.lists[0].items.find(i => i.ean === '8590002'));
  check(second && second.st === 'wait' && second.stBy === 'Mistr haly', `druhá položka se stavem: ${JSON.stringify(second)}`);
  // poddíl k první položce (jako z výrobního plánu)
  await page.evaluate(() => { const l = S.shortage.lists[0]; l.items[0].subs = [{ ean: '8590009', op: 'Broušení', link: 'https://is.example/p?activeBarcode=QR9' }]; S.shortage = cleanShortage(S.shortage); save(); renderShortage(); });
  await saved();

  // ---------- stav v modulu ----------
  const firstId = first.it.id;
  await page.selectOption(`#view-shortage [data-shst="${firstId}"]`, 'run');
  await page.waitForFunction(id => S.shortage.lists[0].items.find(i => i.id === id).st === 'run', firstId);
  await saved();
  check(await page.$eval(`#view-shortage [data-shst="${firstId}"]`, el => el.classList.contains('st-run')), 'výběr má barvu stavu');
  const subId = await page.evaluate(() => S.shortage.lists[0].items[0].subs[0].id);
  await page.selectOption(`#view-shortage [data-shst="${subId}"]`, 'done');
  await page.waitForFunction(id => S.shortage.lists[0].items[0].subs[0].st === 'done', subId);
  await saved();
  const log = await page.evaluate(() => S.log.slice(-6).map(x => x.text).join(' | '));
  check(/stav: .*Rozpracováno/.test(log) && /poddíl 8590009.*Hotovo/.test(log), `stav v historii změn: ${log}`);
  await page.screenshot({ path: path.join(shots, '02-modul.png') });

  // ---------- PDF: jen zvolený stav ----------
  const [file] = await Promise.all([page.waitForEvent('download'), page.click('#view-shortage [data-shpdf]')]);
  const target = path.join(S, 'shortage-stav.pdf');
  await file.saveAs(target);
  const text = pdfText(target);
  if (text != null) {
    check(/Stav: Rozpracováno/.test(text) && /Stav: Čekáme na díl/.test(text) && /Stav: Hotovo/.test(text), `PDF ukazuje zvolené stavy: ${text.slice(0, 400)}`);
    check(!/Bude rozpracováno/.test(text) && !/Bez stavu/.test(text), 'PDF neukazuje nabídku stavů');
  } else console.log('pypdf ani PyMuPDF nejsou, text PDF se nekontroluje');

  // ---------- pravý panel na širokém monitoru (Shortage jen se zbývajícím místem) ----------
  await page.setViewportSize({ width: 3840, height: 1600 });
  await page.evaluate(() => showView('prehled'));
  await page.waitForSelector('#rail .rail-short [data-railshid]');
  const href = await page.$eval(`#rail [data-railshid="${firstId}"] a`, a => [a.href, a.target]);
  check(href[0] === 'https://is.example/dil?activeBarcode=QR8590001&x=1' && href[1] === '_blank', `odkaz u EANu v panelu: ${href}`);
  check(await page.$eval(`#rail [data-railshid="${firstId}"] .rail-shstset`, el => getComputedStyle(el).display === 'none'), 'volba stavu bez najetí schovaná');
  await page.hover(`#rail [data-railshid="${firstId}"]`);
  check(await page.$eval(`#rail [data-railshid="${firstId}"] .rail-shstset`, el => getComputedStyle(el).display !== 'none'), 'volba stavu po najetí');
  await page.screenshot({ path: path.join(shots, '03-panel.png') });
  await page.click(`#rail [data-railshid="${firstId}"] [data-railshst="plan"]`);
  await page.waitForFunction(id => S.shortage.lists[0].items.find(i => i.id === id).st === 'plan', firstId);
  await saved();
  await page.waitForSelector(`#rail [data-railshid="${firstId}"] .rail-shst.st-plan`);
  await page.hover(`#rail [data-railshid="${firstId}"]`);
  await page.click(`#rail [data-railshid="${firstId}"] [data-railshst="plan"]`);
  await page.waitForFunction(id => !S.shortage.lists[0].items.find(i => i.id === id).st, firstId);
  await saved();
  await page.click(`#rail [data-railshid="${firstId}"] .rail-shname`);
  await page.waitForSelector('#view-shortage.on');
  check(await page.$eval(`#view-shortage [data-shst="${firstId}"]`, el => el.value === ''), 'modul ukazuje stav změněný v panelu');

  // ---------- telefon ----------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  check(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, 'telefon bez přetečení');
  await page.screenshot({ path: path.join(shots, '04-telefon.png') });

  await browser.close();
  if (problems.length) {
    console.log('PROBLÉMY:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
  console.log('stav položek Shortage ok');
})().catch(err => { console.error(err); process.exit(1); });
