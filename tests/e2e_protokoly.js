// Prohlížečový průchod modulem Protokoly (verze 2.16): provozní deník stroje, karta stroje,
// vzorové úkony, sbalování úkonů, šifrované fotky (zmenšení, limit, smazání, náhled), intervaly,
// doporučení na 14 dní, víkendy, PDF na rok i vlastní období (dvě směny, počitadlo), kopie
// a smazání deníku, historie změn, záloha s fotkami, mobil s tlačítkem Zpět a tmavý režim.
// Spuštění stejně jako e2e_browser.js:
//   ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t . dev-router.php &
//   curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state
//   NO_PROXY=127.0.0.1 PW=$(npm root -g)/playwright S=$S node tests/e2e_protokoly.js
// PDF se uloží do $S (protokoly-*.pdf), snímky do $S/oshots-lb.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-lb');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

async function watch(page, label) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  // 404 u smazané fotky je záměr (kontrola, že je ze serveru pryč)
  page.on('response', r => { if (r.status() >= 400 && !(r.status() === 404 && /action=file/.test(r.url()))) problems.push(`${label} HTTP ${r.status()} ${r.url()}`); });
  page.on('pageerror', err => problems.push(`${label} pageerror: ${err.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`));
  });
}
const saved = page => page.waitForFunction(() => !store.dirty && !store.saving && document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 15000 });
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const book = page => page.evaluate(() => JSON.parse(JSON.stringify(lbBook())));
const toastText = page => page.textContent('#toast');
async function download(page, selector, name) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  const target = path.join(S, name);
  await file.saveAs(target);
  return { name: file.suggestedFilename(), path: target, pdf: fs.readFileSync(target).slice(0, 5).toString() === '%PDF-' };
}
/* Text a počet stran PDF přes pypdf (PyMuPDF jako záloha); bez nich se kontrola textu přeskočí. */
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
/* Testovací fotka nakreslená v prohlížeči (žádné soubory v repozitáři). */
async function photo(page, w, h, label, type = 'image/jpeg') {
  const b64 = await page.evaluate(async ([w, h, label, type]) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#1f6f5c'); g.addColorStop(1, '#d9a441');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff'; x.font = `bold ${Math.round(h / 6)}px sans-serif`; x.fillText(label, w * 0.08, h * 0.55);
    const blob = await new Promise(r => c.toBlob(r, type, 0.9));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, [w, h, label, type]);
  return { name: `${label}.${type === 'image/png' ? 'png' : 'jpg'}`, mimeType: type, buffer: Buffer.from(b64, 'base64') };
}
/* Rozměry fotky, jak ji vrátí server po dešifrování (null = na serveru není). */
const stored = (page, id) => page.evaluate(async id => {
  try {
    const bmp = await createImageBitmap(new Blob([await Vault.loadFile(id)]));
    return { w: bmp.width, h: bmp.height };
  } catch (error) { return null; }
}, id);
async function confirm(page) {
  await page.waitForSelector('#dlg[open]');
  await page.click('#dlgOk');
  await page.waitForSelector('#dlg[open]', { state: 'detached' }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('#dlg[open]'));
}
const stepId = (page, i) => page.evaluate(i => lbBook().steps[i].id, i);

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  global.lastPage = page;
  await watch(page, 'protokoly');
  await page.goto(BASE);
  await page.waitForSelector('#setupForm');
  await page.fill('[name="token"]', fs.readFileSync(process.env.TOKEN_FILE || path.join(S, 'odme2e', 'setup-token.txt'), 'utf8').trim());
  await page.fill('[name="label"]', 'Vedoucí dílny');
  await page.click('#setupForm button[type="submit"]');
  await page.waitForSelector('.odm-card');
  await page.check('#saved');
  await page.click('#finish');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');

  // Prázdný modul a založení deníku.
  await page.click('#nav [data-view="protokoly"]');
  await page.waitForSelector('#view-protokoly.on');
  check(/Zatím žádný deník/.test(await page.textContent('#lbList')), 'prázdný seznam strojů');
  await page.click('#lbAdd');
  await page.fill('#dlg [name="value"]', 'Lis LP 160');
  await page.click('#dlgOk');
  await page.waitForSelector('#lbDetail [data-lbf="inv"]');
  const y = new Date().getFullYear();
  let b = await book(page);
  check(b.name === 'Lis LP 160' && b.from === `${y}-01-01` && b.shifts === 1 && !b.weekend && b.steps.length === 0, `nový deník: ${JSON.stringify(b)}`);
  check(await page.isDisabled('#lbPdf'), 'bez úkonů nejde tisknout');

  // Karta stroje; název a číslo se hned propíšou do seznamu.
  const fill = (k, v) => page.fill(`#lbDetail [data-lbf="${k}"]`, v);
  await fill('inv', 'L-016'); await fill('maker', 'Šmeral Brno'); await fill('model', 'LP 160 C'); await fill('serial', '1987-0042');
  await fill('year', '1987'); await fill('place', 'Hala 2, linka B'); await fill('owner', 'Vedoucí lisovny'); await fill('service', 'Údržba, linka 245');
  await fill('manual', 'Skříň u stroje, šanon „Lisy“');
  await page.fill('#lbDetail [data-lbf="safety"]', 'Ochranné brýle a rukavice. Při čištění stroj vypnout a zajistit hlavní vypínač.');
  await fill('name', 'Lis LP 160 C');
  check((await page.textContent('#lbList')).includes('Lis LP 160 C') && (await page.textContent('#lbDetail h2')) === 'Lis LP 160 C', 'nový název v seznamu i v nadpisu');
  await saved(page);

  // Vzorové úkony: osm úkonů, všechny sbalené.
  await page.click('#lbTpl');
  await page.waitForSelector('.lb-step');
  b = await book(page);
  check(b.steps.length === 8 && await page.locator('.lb-step.closed').count() === 8, `vzorové úkony: ${b.steps.length}, sbalené ${await page.locator('.lb-step.closed').count()}`);
  check(JSON.stringify(b.steps.map(x => x.every.k)) === JSON.stringify(['shift', 'shift', 'day', 'week', 'month', 'month', 'months', 'year']), `intervaly vzoru: ${b.steps.map(x => x.every.k)}`);
  check(await page.isHidden('#lbTpl'), 'vzor jde vložit jen do prázdného deníku');
  await page.screenshot({ path: `${shots}/01-steps.png`, fullPage: true });
  await saved(page);

  // Fotky úkonu: velká fotka se zmenší, nejvýš tři, neznámý formát se odmítne.
  const s1 = await stepId(page, 1);
  await page.click(`[data-lsopen="${s1}"]`);
  await page.waitForSelector(`[data-stepcard="${s1}"]:not(.closed) [data-phin]`, { state: "attached" });
  await page.setInputFiles(`[data-phin="${s1}"]`, [await photo(page, 3000, 2000, 'KRYT'), await photo(page, 800, 600, 'ZAVORA', 'image/png')]);
  await page.waitForFunction(id => lbBook().steps.find(x => x.id === id).photos.length === 2, s1, { timeout: 30000 });
  b = await book(page);
  const [big, small] = b.steps[1].photos;
  const dims = [await stored(page, big), await stored(page, small)];
  check(dims[0] && dims[0].w === 1600 && dims[0].h === 1067 && dims[1] && dims[1].w === 800, `zmenšení fotek: ${JSON.stringify(dims)}`);
  await page.setInputFiles(`[data-phin="${s1}"]`, [await photo(page, 640, 480, 'TRETI'), await photo(page, 640, 480, 'CTVRTA')]);
  await page.waitForFunction(id => lbBook().steps.find(x => x.id === id).photos.length === 3, s1, { timeout: 30000 });
  await page.waitForTimeout(300);
  b = await book(page);
  check(b.steps[1].photos.length === 3 && await page.locator(`[data-phin="${s1}"]`).count() === 0, 'u úkonu nejvýš tři fotky');
  await page.waitForFunction(id => [...document.querySelectorAll(`[data-stepcard="${id}"] img[data-photo]`)].every(i => i.naturalWidth > 0), s1, { timeout: 15000 });
  const blobs = await page.$$eval(`[data-stepcard="${s1}"] img[data-photo]`, imgs => imgs.map(i => i.src.slice(0, 5)));
  check(blobs.length === 3 && blobs.every(s => s === 'blob:'), `fotky se dešifrují do blob: ${blobs}`);
  // Smazání fotky: zmizí z úkonu i ze serveru.
  const gone = b.steps[1].photos[2];
  await page.click(`[data-stepcard="${s1}"] [data-phdel="${gone}"]`);
  await confirm(page);
  await page.waitForFunction(id => lbBook().steps.find(x => x.id === id).photos.length === 2, s1);
  await page.waitForTimeout(300);
  check(await stored(page, gone) === null, 'smazaná fotka je pryč i ze serveru');
  // Neznámý formát.
  const s3 = await stepId(page, 3);
  await page.click(`[data-lsopen="${s3}"]`);
  await page.setInputFiles(`[data-phin="${s3}"]`, { name: 'navod.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('tohle není obrázek') });
  await page.waitForFunction(() => /formát fotky/.test(document.querySelector('#toast').textContent));
  check((await book(page)).steps[3].photos.length === 0, 'poškozený soubor se neuloží');
  await page.setInputFiles(`[data-phin="${s3}"]`, await photo(page, 1200, 900, 'OLEJ'));
  await page.waitForFunction(id => lbBook().steps.find(x => x.id === id).photos.length === 1, s3, { timeout: 20000 });
  // Fotka stroje a náhled fotky ve velkém.
  await page.setInputFiles('#lbDetail [data-phin="book"]', await photo(page, 1600, 1200, 'LIS'));
  await page.waitForFunction(() => lbBook().photo, null, { timeout: 20000 });
  await page.click('.lb-photo [data-phview]');
  await page.waitForSelector('#dlg[open] img.ph-big');
  await page.waitForFunction(() => document.querySelector('#dlg img.ph-big').naturalWidth === 1600);
  await page.screenshot({ path: `${shots}/02-photo.png` });
  await page.click('#dlgCancel');
  // Sbalený úkon ukazuje počet fotek a náhledy.
  await page.click(`[data-stepcard="${s1}"] .lb-step-close`);
  await page.waitForSelector(`[data-stepcard="${s1}"].closed .lb-thumbs img`);
  check(/2 fotky/.test(await page.textContent(`[data-stepcard="${s1}"]`)), 'souhrn sbaleného úkonu s počtem fotek');
  await saved(page);

  // Intervaly: týdně → každé 2 týdny ve středu; vlastní úkon každých 10 dní; pořadí; odebrání.
  await page.selectOption(`[data-lbe="k"][data-step="${s3}"]`, 'weeks');
  await page.waitForSelector(`[data-lbe="n"][data-step="${s3}"]`);
  check(await page.inputValue(`[data-lbe="n"][data-step="${s3}"]`) === '2', 'každých N týdnů začíná na 2');
  await page.selectOption(`[data-lbe="dow"][data-step="${s3}"]`, '3');
  b = await book(page);
  check(b.steps[3].every.k === 'weeks' && b.steps[3].every.n === 2 && b.steps[3].every.dow === 3, `interval úkonu 4: ${JSON.stringify(b.steps[3].every)}`);
  await page.click('#lbAddStep');
  await page.waitForFunction(() => lbBook().steps.length === 9);
  const s8 = await stepId(page, 8);
  check(await page.evaluate(id => document.activeElement === document.querySelector(`[data-stepcard="${id}"] .lb-step-name`), s8), 'nový úkon je rozbalený a s kurzorem v názvu');
  await page.fill(`[data-lsf="name"][data-step="${s8}"]`, 'Kontrola hladiny chladiva');
  await page.fill(`[data-lsf="how"][data-step="${s8}"]`, 'Odečíst hladinu na průhledítku nádrže.');
  await page.selectOption(`[data-lbe="k"][data-step="${s8}"]`, 'ndays');
  await page.fill(`[data-lbe="n"][data-step="${s8}"]`, '10');
  await page.dispatchEvent(`[data-lbe="n"][data-step="${s8}"]`, 'change');
  await page.selectOption(`[data-lsf="who"][data-step="${s8}"]`, 'serizovac');
  await saved(page);
  await page.click(`[data-lsmove="-1"][data-step="${s8}"]`);
  b = await book(page);
  check(b.steps[7].id === s8 && b.steps[7].every.k === 'ndays' && b.steps[7].every.n === 10 && b.steps[7].who === 'serizovac', `vlastní úkon: ${JSON.stringify(b.steps[7])}`);
  await saved(page);
  const last = b.steps[8].id;
  await page.click(`[data-lsdel="${last}"]`);
  await confirm(page);
  await page.waitForFunction(() => lbBook().steps.length === 8);
  check(!(await book(page)).steps.some(x => x.id === last), 'úkon odebraný');
  await saved(page);

  // Doporučení na 14 dní: víkendy šedé, se zapnutým víkendovým provozem se v nich plánuje.
  const plan = () => page.$$eval('.lb-plan tbody tr', rows => rows.map(r => ({ off: r.classList.contains('off'), text: r.textContent.replace(/\s+/g, ' ').trim() })));
  let rows = await plan();
  const weekend = rows.filter(r => /^(So|Ne) /.test(r.text));
  check(rows.length === 14 && weekend.length === 4 && weekend.every(r => r.off && /víkend/.test(r.text)), `náhled 14 dní: ${JSON.stringify(rows)}`);
  check(rows.filter(r => !r.off).every(r => / 1, 2, 3/.test(r.text)), `pracovní dny mají 1, 2, 3: ${JSON.stringify(rows.filter(r => !r.off))}`);
  await page.check('#lbDetail [data-lbf="weekend"]');
  await page.waitForFunction(() => lbBook().weekend);
  rows = await plan();
  check(rows.filter(r => /^(So|Ne) /.test(r.text)).every(r => r.off && !/víkend/.test(r.text) && /1, 2, 3/.test(r.text)), `víkendový provoz: ${JSON.stringify(rows)}`);
  await page.uncheck('#lbDetail [data-lbf="weekend"]');
  await page.waitForFunction(() => !lbBook().weekend);
  check(/dnes \d/.test(await page.textContent('#lbList')) || !(await page.evaluate(() => lbToday(lbBook()).length)), 'štítek „dnes N“ v seznamu');
  await page.screenshot({ path: `${shots}/03-detail.png`, fullPage: true });

  // PDF na celý rok: karta stroje, úkony s fotkami, 12 měsíčních archů, opravy a obsluha.
  await page.selectOption('#lbYear', String(y));
  const yearPdf = await download(page, '#lbPdf', 'protokoly-rok.pdf');
  check(yearPdf.pdf && yearPdf.name === `provozni-denik-l-016-lis-lp-160-c-${y}-01-01-${y}-12-31.pdf`, `PDF roku: ${yearPdf.name}`);
  const yi = pdfInfo(yearPdf.path);
  if (yi) {
    const months = (yi.text.match(/Měsíční kontrola vedoucím/g) || []).length;
    check(yi.pages >= 16 && months >= 12, `PDF roku: ${yi.pages} stran, ${months} archů`);
    for (const t of ['Lis LP 160 C', 'L-016', 'Šmeral Brno', 'Jak deník vyplňovat', 'Kontrola hladiny chladiva', 'Každých 10 dní', 'Postup', 'V pořádku, když',
      'Dle doporučení', 'Provedené úkony:', `Leden ${y}`, `Prosinec ${y}`, 'víkend', 'Nový rok', 'Opravy a mimořádné události', 'Zaškolená obsluha']) {
      check(yi.text.includes(t), `PDF roku obsahuje „${t}“`);
    }
  }

  // Vlastní období přes přelom roku: dvě směny, počitadlo, bez úvodu a závěru.
  await page.selectOption('#lbDetail [data-lbf="shifts"]', '2');
  await page.check('#lbDetail [data-lbf="counter"]');
  await page.click('[data-lbmode="custom"]');
  await page.fill('#lbFrom', '2027-01-20'); await page.dispatchEvent('#lbFrom', 'change');
  await page.fill('#lbTo', '2026-12-14'); await page.dispatchEvent('#lbTo', 'change');
  await page.click('#lbPdf');
  await page.waitForFunction(() => /Zadej období/.test(document.querySelector('#toast').textContent));
  await page.fill('#lbFrom', '2026-12-14'); await page.dispatchEvent('#lbFrom', 'change');
  await page.fill('#lbTo', '2027-01-20'); await page.dispatchEvent('#lbTo', 'change');
  await page.uncheck('#lbIntro');
  await page.uncheck('#lbExtra');
  const customPdf = await download(page, '#lbPdf', 'protokoly-obdobi.pdf');
  check(customPdf.pdf && customPdf.name === 'provozni-denik-l-016-lis-lp-160-c-2026-12-14-2027-01-20.pdf', `PDF období: ${customPdf.name}`);
  const ci = pdfInfo(customPdf.path);
  if (ci) {
    check(ci.pages >= 3 && ci.pages <= 6, `PDF období: ${ci.pages} stran`);
    for (const t of ['Prosinec 2026', 'Leden 2027', 'Směna', 'Počitadlo', 'Štědrý den', '14. 12. 2026 – 20. 1. 2027']) check(ci.text.includes(t), `PDF období obsahuje „${t}“`);
    for (const t of ['Jak deník vyplňovat', 'Zaškolená obsluha', 'Listopad']) check(!ci.text.includes(t), `PDF období bez „${t}“`);
  }
  await page.screenshot({ path: `${shots}/04-print.png`, fullPage: true });

  // Kopie pro další stroj (bez fotek a čísel) a její smazání.
  await page.click('#lbCopy');
  await page.waitForFunction(() => S.logbooks.length === 2);
  const copy = await book(page);
  check(copy.name === 'Lis LP 160 C (kopie)' && !copy.inv && !copy.serial && !copy.photo && copy.steps.length === 8 && copy.steps.every(x => !x.photos.length) && copy.shifts === 2,
    `kopie deníku: ${JSON.stringify({ ...copy, steps: copy.steps.length })}`);
  check(await page.locator('#lbList .list-item').count() === 2, 'v seznamu dva stroje');
  await saved(page);
  check(await page.evaluate(() => S.log.some(e => e.text === 'Protokoly: nový deník Lis LP 160 C (kopie)')), 'historie: nový deník (kopie)');
  await page.fill('#lbSearch', 'kopie');
  check(await page.locator('#lbList .list-item').count() === 1, 'hledání stroje');
  await page.fill('#lbSearch', '');
  await page.click('#lbDel');
  await confirm(page);
  await page.waitForFunction(() => S.logbooks.length === 1);
  const original = await page.evaluate(() => lbFileIds(S));
  check(original.length === 4, `fotky originálu: ${original.length}`);
  for (const id of original) check(await stored(page, id) !== null, `smazání kopie nesmazalo fotku originálu ${id}`);
  await saved(page);

  // Uložená data a historie změn.
  const st = await page.evaluate(async () => {
    const s = (await Vault.loadData()).state;
    return { books: s.logbooks.length, steps: s.logbooks[0].steps.length, files: lbFileIds(s).length, log: s.log.filter(e => e.kind === 'logbook').map(e => e.text) };
  });
  check(st.books === 1 && st.steps === 8 && st.files === 4, `uložená data: ${JSON.stringify({ ...st, log: null })}`);
  const log = st.log.join(' | ');
  // Čistá instalace začíná ukázkovými daty, první uložení se do historie nezapisuje; „nový deník“
  // se proto kontroluje u kopie (založení a smazání téhož deníku do 10 minut se sloučí do jednoho záznamu).
  check(st.log.some(t => /^Protokoly – Lis LP 160 C \(L-016\): přidán úkon \d „.*“/.test(t))
    && st.log.some(t => /úkon „Kontrola maziva a provozních kapalin“: Týdně \(pondělí\) → Každý 2\. týden \(středa\)$/.test(t))
    && st.log.some(t => /: fotky úkonu „Kontrola bezpečnostních prvků“ \(2\)$/.test(t))
    && st.log.some(t => /: fotky úkonu „Kontrola maziva a provozních kapalin“ \(1\)$/.test(t))
    && st.log.some(t => /: upravené údaje – fotka stroje$/.test(t))
    && st.log.some(t => /: upravené údaje – záznamů za den, počitadlo$/.test(t))
    && st.log.some(t => /: odebrán úkon „Preventivní údržba podle návodu výrobce“$/.test(t))
    && st.log.some(t => /: změněno pořadí úkonů$/.test(t))
    && st.log.some(t => /^Protokoly: smazán deník Lis LP 160 C \(kopie\)$/.test(t))
    && !st.log.some(t => /nový deník Lis LP 160 C \(kopie\)/.test(t)), `historie změn: ${log}`);

  // Záloha obsahuje šifrované fotky; po ztrátě fotky na serveru ji obnova vrátí.
  await page.click('#nav [data-view="nastaveni"]');
  await saved(page);
  const bk = await download(page, '#dBackup', 'protokoly-zaloha.odmeny');
  const raw = fs.readFileSync(bk.path, 'utf8');
  const backup = JSON.parse(raw);
  check(backup.files && original.every(id => typeof backup.files[id] === 'string') && Object.keys(backup.files).length === 4, `fotky v záloze: ${Object.keys(backup.files || {}).length}`);
  check(!raw.includes('Šmeral') && !raw.includes('Lis LP'), 'záloha neobsahuje čitelná data');
  await page.evaluate(id => Vault.deleteFile(id), original[0]);
  check(await stored(page, original[0]) === null, 'fotka ze serveru zmizela');
  await page.setInputFiles('#dRestoreFile', bk.path);
  await confirm(page);
  await page.waitForFunction(() => /fotky \(4\)/.test(document.querySelector('#toast').textContent), null, { timeout: 20000 });
  const back = await stored(page, original[0]);
  check(back && back.w > 0, 'obnova ze zálohy vrátila fotku');

  // Mobil: Protokoly z úvodní obrazovky, seznam → detail → Zpět (tlačítko i systémové).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#brandHome');
  await page.waitForSelector('#view-domu.on');
  if (await page.isHidden('#homeView .home-open')) await page.click('[data-hshift="both"]');
  const tile = await page.textContent('#homeView .home-menu [data-go="protokoly"]');
  check(/Protokoly/.test(tile) && /(dnes \d+ úkon|1 stroj)/.test(tile), `dlaždice Protokoly: ${tile}`);
  await page.click('#homeView .home-menu [data-go="protokoly"]');
  await page.waitForFunction(() => ui.view === 'protokoly');
  await page.waitForTimeout(200);
  check(await page.isHidden('#lbDetail') || !(await page.evaluate(() => document.querySelector('#lbSplit').classList.contains('show-detail'))), 'na telefonu nejdřív seznam');
  check(await overflow(page) <= 1, `mobil seznam: přetečení ${await overflow(page)} px`);
  await page.screenshot({ path: `${shots}/05-mobile-list.png` });
  await page.click('#lbList [data-lbsel]');
  await page.waitForFunction(() => document.querySelector('#lbSplit').classList.contains('show-detail'));
  check(await page.isHidden('#view-protokoly > .page-head'), 'v detailu bez hlavičky modulu');
  check(await overflow(page) <= 1, `mobil detail: přetečení ${await overflow(page)} px`);
  await page.screenshot({ path: `${shots}/06-mobile-detail.png` });
  const s0 = await stepId(page, 0);
  await page.click(`[data-lsopen="${s0}"]`);
  await page.waitForTimeout(150);
  check(await overflow(page) <= 1, `mobil rozbalený úkon: přetečení ${await overflow(page)} px`);
  await page.click('#lbBack');
  await page.waitForFunction(() => !document.querySelector('#lbSplit').classList.contains('show-detail'));
  await page.click('#lbList [data-lbsel]');
  await page.waitForFunction(() => document.querySelector('#lbSplit').classList.contains('show-detail'));
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector('#lbSplit').classList.contains('show-detail') && ui.view === 'protokoly');
  check(true, 'systémové Zpět zavře detail');

  // Tmavý režim.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.click('#lbList [data-lbsel]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${shots}/07-dark-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${shots}/08-dark.png`, fullPage: true });

  await browser.close();
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
  console.log('e2e Protokoly ok');
})().catch(async error => {
  console.error(error);
  if (problems.length) console.log(problems.join('\n'));
  if (global.lastPage) await global.lastPage.screenshot({ path: `${shots}/zz-error.png`, fullPage: true }).catch(() => {});
  process.exit(1);
});
