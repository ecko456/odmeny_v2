// Prohlížečový průchod modulem Top 5 nejméně efektivně (verze 2.2): ruční zápis týdne (EAN,
// název dílu, strávený čas, norma), případ s příčinou, opatřeními a ověřením účinnosti s ručně
// zapsanými hodnotami, nové kolo po neúčinném ověření, vydaný týdenní report, souhrn a PDF
// případu, termíny, jednotka času, předvyplnění z evidence práce, mobil a tmavý režim,
// definitivní smazání zrušeného případu (2.6).
// Spuštění stejně jako e2e_browser.js (data se generují k dnešnímu dni):
//   ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t . dev-router.php &
//   curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state
//   NO_PROXY=127.0.0.1 PW=$(npm root -g)/playwright S=$S node tests/e2e_top5.js
// PDF se uloží do $S (top5-*.pdf), snímky do $S/oshots-top5.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-top5');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const TODAY = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
const MON0 = addDays(TODAY, -((TODAY.getDay() + 6) % 7)); // pondělí tohoto týdne
const mon = k => addDays(MON0, -7 * k);                   // pondělí před k týdny
const DONE_A = iso(mon(2));                                // opatření u držáku hotová před dvěma týdny
const DONE_B = iso(mon(4));                                // u krytu před čtyřmi týdny
const dayText = d => `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;

/* Ruční zápis týdne před čtyřmi týdny (hodiny), schválně ne podle pořadí. */
const WEEK4 = [
  ['8590001000042', 'Pouzdro', '10', '8'],          // 80 %
  ['8590001000011', 'Držák levý', '22,5', '9,9'],   // 44 %
  ['8590001000059', 'Podložka', '7:30', '6,45'],    // 86 %
  ['8590001000035', 'Hřídel 40', '12', '8,4'],      // 70 %
  ['8590001000028', 'Kryt motoru', '18', '9,9'],    // 55 %
];

/* Evidence práce s EAN za týden před šesti týdny (jen pro předvyplnění). */
function productionCsv() {
  const items = [['8590001000080', 'Rám', 0.62], ['8590001000097', 'Lišta', 0.48], ['8590001000103', 'Konzola', 1.1], ['8590001000110', 'Úhelník', 0.75]];
  const rows = [['Zakázka', 'Pracovník', 'Datum', 'EAN', 'Název položky', 'Kusy', 'Strávený čas (min)', 'Norma (min)'].join(';')];
  let n = 0;
  for (let d = mon(6); d < mon(5); d = addDays(d, 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    items.forEach(([ean, name, eff], i) => {
      const spent = 120 + i * 15;
      rows.push([`Z${(n += 1)}`, ['Petr Dvořák', 'Jana Svobodová'][i % 2], `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`, ean, name, 4, spent, Math.round(spent * eff)].join(';'));
    });
  }
  return rows.join('\r\n');
}

async function watch(page, label) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  page.on('response', r => { if (r.status() >= 400) problems.push(`${label} HTTP ${r.status()} ${r.url()}`); });
  page.on('pageerror', err => problems.push(`${label} pageerror: ${err.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`));
  });
}
const saved = page => page.waitForFunction(() => !store.dirty && !store.saving && document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 15000 });
async function download(page, selector, name) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  const target = path.join(S, name || file.suggestedFilename());
  await file.saveAs(target);
  return { name: file.suggestedFilename(), path: target };
}
/* Souhrn a PDF případu se ptají na verzi: kompletní, nebo osekaná (bez historie případu). */
async function downloadVariant(page, selector, variant, name) {
  await page.click(selector);
  await page.waitForSelector('#dlg[open] .variant-pick');
  await page.check(`#dlg [name="variant"][value="${variant}"]`);
  const [file] = await Promise.all([page.waitForEvent('download'), page.click('#dlgOk')]);
  const target = path.join(S, name);
  await file.saveAs(target);
  return { name: file.suggestedFilename(), path: target };
}
/* Text PDF přes pypdf (PyMuPDF jako záloha); bez nich se kontrola textu přeskočí. */
function pdfText(file) {
  const py = `import sys
try:
    import pypdf
    r = pypdf.PdfReader(sys.argv[1])
    print('Název PDF: ' + str((r.metadata or {}).get('/Title', '')))
    print('\\n'.join(p.extract_text() or '' for p in r.pages))
except ImportError:
    import pymupdf
    print('\\n'.join(p.get_text() for p in pymupdf.open(sys.argv[1])))`;
  const r = require('child_process').spawnSync('python3', ['-c', py, file], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout : null;
}
function checkT5Pdf(file, label, { history }) {
  const text = pdfText(file);
  if (text == null) return;
  const flat = text.replace(/\s+/g, ' ');
  check(/Top 5 nejméně efektivně/.test(flat), `${label}: nahoře Top 5 nejméně efektivně`);
  check(!/Odměny|ODMĚNY|PRŮTOK|P R Ů T O K/i.test(flat), `${label}: bez slova Odměny a Průtok dílů`);
  check(!/Zpracovatel/.test(flat) && !/Podpis/.test(flat), `${label}: bez řádku Zpracovatel, datum a podpis`);
  // jde auditorovi: v PDF ani v jeho vlastnostech nesmí být, že je osekané
  check(!/osekan|bez historie/i.test(flat), `${label}: bez zmínky o osekané verzi`);
  if (history != null) check(/Historie případu/.test(flat) === history, `${label}: historie případu ${history ? 'je' : 'není'} vidět`);
  if (history != null) check(/Stav k \d{1,2}\. \d{1,2}\. \d{4}(?! \d)/.test(flat) && !/Stav k [^·]*\d{1,2}:\d{2}/.test(flat), `${label}: stav jen s datem`);
}
async function goWeek(page, k) {
  await page.click('#t5Tabs [data-t5tab="week"]');
  await page.selectOption('#t5WeekSel', await page.evaluate(d => isoWeek(d).id, iso(mon(k))));
  await page.waitForTimeout(150);
}
/* Nový řádek zápisu: pole se vyplňují jako uživatel (Tab mezi poli). */
async function addEntry(page, [ean, name, spent, norm]) {
  await page.click('[data-entadd]');
  const id = await page.evaluate(() => document.activeElement.closest('[data-ent]').dataset.ent);
  const field = async (ef, value) => {
    const sel = `[data-ent="${id}"] [data-ef="${ef}"]`;
    await page.fill(sel, value);
    await page.press(sel, 'Tab');
    await page.waitForTimeout(60);
  };
  await field('ean', ean);
  if (name != null) await field('name', name);
  await field('spent', spent);
  await field('norm', norm);
  return id;
}
const tableEans = page => page.$$eval('.t5-entry tbody tr', rows => rows.map(r => r.querySelector('[data-ef="ean"]').value));
async function caseFromWeek(page, k, ean) {
  await goWeek(page, k);
  await page.click(`[data-t5new="${ean}"]`);
  await page.waitForSelector('.t5-case-head');
}
async function addAction(page, kind, text, owner, due) {
  const before = await page.$$eval('.t5-act[data-act]', x => x.length);
  await page.click(`[data-actadd="${kind}"]`);
  await page.waitForFunction(n => document.querySelectorAll('.t5-act[data-act]').length > n, before);
  const row = () => page.locator('.t5-act[data-act]').last();
  await row().locator('[data-actf="text"]').fill(text);
  await row().locator('[data-actf="text"]').press('Tab');
  await row().locator('[data-actf="owner"]').fill(owner);
  await row().locator('[data-actf="owner"]').press('Tab');
  if (due) await row().locator('[data-actf="due"]').fill(due);
  return row().getAttribute('data-act');
}
async function markDone(page, id, date) {
  await page.check(`[data-act="${id}"] [data-actdone]`);
  await page.waitForSelector(`[data-act="${id}"] [data-actf="done"]:not([disabled])`);
  await page.fill(`[data-act="${id}"] [data-actf="done"]`, date);
  await page.dispatchEvent(`[data-act="${id}"] [data-actf="done"]`, 'change');
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  global.lastPage = page;
  await watch(page, 'top5');
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

  // Výchozí je minulý týden, zatím bez zápisu. Šipkou o tři týdny zpět.
  await page.click('#nav [data-view="top5"]');
  const lastWeek = await page.evaluate(d => isoWeek(d).id, iso(mon(1)));
  check(await page.inputValue('#t5WeekSel') === lastWeek, 'výchozí týden má být minulý');
  check(/zatím bez zápisu/.test(await page.textContent('#t5View')), 'prázdný stav týdne');
  check(await page.isDisabled('[data-t5pdf="week"]'), 'report prázdného týdne nejde vydat');
  await page.screenshot({ path: `${shots}/00-empty.png` });
  for (let i = 0; i < 3; i += 1) { await page.click('[data-t5wk="older"]'); await page.waitForTimeout(80); }
  check(await page.inputValue('#t5WeekSel') === await page.evaluate(d => isoWeek(d).id, iso(mon(4))), 'šipka zpět posouvá po týdnech');

  // Ruční zápis pěti dílů: řadí se od nejhoršího plnění, plnění a neplnění se dopočítá.
  const ids = [];
  for (const row of WEEK4) ids.push(await addEntry(page, row));
  await page.waitForTimeout(200);
  const order = await tableEans(page);
  check(JSON.stringify(order) === JSON.stringify(['8590001000011', '8590001000028', '8590001000035', '8590001000042', '8590001000059']), `pořadí zápisu: ${order}`);
  const firstRow = (await page.textContent('.t5-entry tbody tr')).replace(/\s+/g, ' ');
  check(/44 %/.test(firstRow) && /56 %/.test(firstRow) && /12,6 h/.test(firstRow), `řádek držáku: ${firstRow}`);
  check(!(await page.$('[data-entadd]')), 'po pěti dílech už nejde přidat další');
  check(await page.inputValue(`[data-ent="${ids[2]}"] [data-ef="spent"]`) === '7,5', 'čas 7:30 se uloží jako 7,5 h');
  const tiles = (await page.textContent('#t5View .stats')).replace(/\s+/g, ' ');
  check(/Plnění Top 5/.test(tiles) && /60,9 %/.test(tiles), `dlaždice týdne: ${tiles}`);
  await page.screenshot({ path: `${shots}/01-week-entry.png`, fullPage: true });

  // Chybný čas se nepřijme, smazání vyplněného řádku se potvrzuje.
  await page.fill(`[data-ent="${ids[0]}"] [data-ef="norm"]`, 'osm');
  await page.press(`[data-ent="${ids[0]}"] [data-ef="norm"]`, 'Tab');
  await page.waitForSelector('#toast.on');
  check(/Čas zapiš jako číslo/.test(await page.textContent('#toast')), 'hláška u chybného času');
  check(await page.inputValue(`[data-ent="${ids[0]}"] [data-ef="norm"]`) === '8', 'chybný čas vrátí původní hodnotu');
  await page.click(`[data-ent="${ids[2]}"] [data-entdel]`);
  await page.waitForSelector('#dlg[open]');
  await page.click('#dlgOk');
  await page.waitForFunction(() => document.querySelectorAll('.t5-entry tbody tr').length === 4);
  ids[2] = await addEntry(page, WEEK4[2]);
  await saved(page);

  // Případ A: příčina, okamžité a procesní opatření, splněno před dvěma týdny, 1. ověření dnes
  // s ručně zapsaným časem a normou za období.
  await caseFromWeek(page, 4, '8590001000011');
  check(/P-\d{4}-001/.test(await page.textContent('.t5-case-head')), 'číslo prvního případu');
  check(/44 %/.test(await page.textContent('.t5-kpis')), 'plnění při zjištění z ručního zápisu');
  check(!/Kdo na dílu pracoval/.test(await page.textContent('#t5View')), 'bez evidence práce není karta lidí');
  await page.selectOption('[data-rf="cat"]', 'stroj');
  await page.fill('[data-rf="cause"]', 'Díl se upíná ručně bez dorazu, každý kus se dorovnává. Chybí přípravek.');
  await page.press('[data-rf="cause"]', 'Tab');
  await page.fill('[data-rf="options"]', 'Doraz na svěrák hned, přípravek s technologií, pak ověřit normu.');
  await page.press('[data-rf="options"]', 'Tab');
  const a1 = await addAction(page, 'now', 'Doraz na svěrák a kontrola prvního kusu', 'Mistr dílny');
  const a2 = await addAction(page, 'process', 'Přípravek ve spolupráci s technologií (žádost o pohledovost podána)', 'Technologie', iso(mon(3)));
  check(/Opatření běží/.test(await page.textContent('.t5-case-head')), 'stav po přidání opatření');
  await markDone(page, a1, DONE_A);
  await markDone(page, a2, DONE_A);
  await page.waitForSelector('[data-ver="0"]');
  check((await page.textContent('.t5-verify')).includes(`Termín ${dayText(MON0)}`), '1. ověření 14 dní po dokončení');
  await page.fill('[data-verspent="0"]', '10');
  await page.fill('[data-vernorm="0"]', '9,6');
  check(/Plnění za období 96 %/.test(await page.textContent('[data-verlive="0"]')), `živé plnění: ${await page.textContent('[data-verlive="0"]')}`);
  await page.fill('[data-vernote="0"]', 'Plnění drží nad cílem, přípravek se používá.');
  await page.screenshot({ path: `${shots}/02-case-verify-form.png`, fullPage: true });
  await page.click('[data-ver="0"][data-res="ok"]');
  await page.waitForSelector('.t5-vcard.done.ok');
  const v1 = (await page.textContent('.t5-vcard.done.ok')).replace(/\s+/g, ' ');
  check(/Plnění 96 %/.test(v1) && /zapsáno ručně/.test(v1), `zapsané 1. ověření: ${v1}`);
  check(/Čeká na 2\. ověření/.test(await page.textContent('.t5-case-head')), 'stav po 1. ověření');
  await page.screenshot({ path: `${shots}/03-case-verified.png`, fullPage: true });

  // Případ B: 1. ověření neúčinné (55 %), nové kolo v témž případu.
  await page.click('[data-t5back]');
  await caseFromWeek(page, 4, '8590001000028');
  await page.selectOption('[data-rf="cat"]', 'metoda');
  await page.fill('[data-rf="cause"]', 'Dvě upnutí místo jednoho, postup neodpovídá normě.');
  await page.press('[data-rf="cause"]', 'Tab');
  const b1 = await addAction(page, 'now', 'Zaučení na upínání podle postupu', 'Mistr dílny');
  await markDone(page, b1, DONE_B);
  await page.waitForSelector('[data-verdate="0"]');
  await page.fill('[data-verdate="0"]', iso(mon(2)));
  await page.fill('[data-verspent="0"]', '10');
  await page.click('[data-ver="0"][data-res="fail"]');
  await page.waitForSelector('#toast.on');
  check(/strávený čas i normu/.test(await page.textContent('#toast')), 'jen jedno ze dvou polí ověření nejde zapsat');
  await page.fill('[data-vernorm="0"]', '5,5');
  await page.click('[data-ver="0"][data-res="fail"]');
  await page.waitForSelector('#dlg[open]');
  await page.click('#dlgOk');
  await page.waitForSelector('.note.e [data-t5reopen]');
  check(/Neúčinné/.test(await page.textContent('.t5-case-head')), 'stav po neúčinném ověření');
  check(/55 %/.test(await page.textContent('.t5-kpis')), 'po opatřeních 55 %');
  await page.click('.note.e [data-t5reopen]');
  await page.waitForSelector('#dlg[open] textarea');
  await page.fill('#dlg textarea', 'Zaučení nestačilo, plnění zůstalo kolem 55 %. Je potřeba změnit postup a ověřit normu.');
  await page.click('#dlgOk');
  await page.waitForFunction(() => /kolo 2/.test(document.querySelector('.t5-case-head').textContent));
  check(await page.isVisible('.t5-prev'), 'předchozí kolo je vidět');
  await page.selectOption('[data-rf="cat"]', 'norma');
  await page.fill('[data-rf="cause"]', 'Norma nepočítá s druhým upnutím; technologie prověří postup.');
  await page.press('[data-rf="cause"]', 'Tab');
  await addAction(page, 'process', 'Revize normy a postupu s technologií', 'Technologie', iso(addDays(TODAY, 10)));
  await page.screenshot({ path: `${shots}/04-case-round2.png`, fullPage: true });
  await saved(page);

  // Minulý týden: kryt se vrátil do Top 5. Název dílu se doplní podle EAN, řešení ukáže původní případ.
  await goWeek(page, 1);
  await addEntry(page, ['8590001000028', null, '16', '9']);
  await addEntry(page, ['8590001000127', 'Příruba DN50', '6', '5,1']);
  await page.waitForTimeout(150);
  check(await page.inputValue('.t5-entry tbody tr [data-ef="name"]') === 'Kryt motoru', 'název dílu se doplní podle EAN');
  check(/P-\d{4}-002/.test(await page.textContent('.t5-entry tbody tr')), 'u krytu je vidět původní případ');
  check(/2×/.test(await page.textContent('.t5-entry tbody tr')), 'kryt je v Top 5 podruhé');
  await page.screenshot({ path: `${shots}/05-week-repeat.png`, fullPage: true });

  // Seznam případů, termíny.
  await page.click('#t5Tabs [data-t5tab="cases"]');
  const cases = await page.$$eval('#t5View tbody tr', rows => rows.map(r => r.textContent.replace(/\s+/g, ' ')));
  check(cases.length === 2, `rozpracované případy: ${cases.length}`);
  await page.screenshot({ path: `${shots}/06-cases.png`, fullPage: true });
  await page.click('#t5Tabs [data-t5tab="deadlines"]');
  const dl = await page.textContent('#t5View');
  check(/2\. ověření účinnosti/.test(dl) && /Revize normy/.test(dl), `termíny: ${dl.slice(0, 200)}`);
  await page.screenshot({ path: `${shots}/07-deadlines.png`, fullPage: true });

  // Týdenní report: vydání, opakované stažení bez změny, seznam vydaných.
  await goWeek(page, 4);
  const rep1 = await download(page, '[data-t5pdf="week"]', 'top5-tyden.pdf');
  check(/^top5-tyden-\d+-\d{4}-revize-1\.pdf$/.test(rep1.name), `název reportu: ${rep1.name}`);
  checkT5Pdf(rep1.path, 'týdenní report', { history: null });
  await page.waitForSelector('.t5-weekbar .tag.acc');
  const rep2 = await download(page, '[data-t5pdf="week"]', 'top5-tyden-znovu.pdf');
  check(/revize-1\.pdf$/.test(rep2.name), 'beze změny zůstane revize 1');
  await page.click('#t5Tabs [data-t5tab="reports"]');
  check((await page.$$('#t5View tbody tr')).length === 1, 'jeden vydaný report');
  await download(page, '#t5View [data-t5pdf="rep"]', 'top5-tyden-z-archivu.pdf');
  await page.screenshot({ path: `${shots}/08-reports.png`, fullPage: true });
  const sumFull = await downloadVariant(page, '#t5SummaryPdf', 'full', 'top5-souhrn.pdf');
  check(/^top5-souhrn-\d{4}-\d{2}-\d{2}\.pdf$/.test(sumFull.name), `název souhrnu: ${sumFull.name}`);
  checkT5Pdf(sumFull.path, 'souhrn kompletní', { history: true });
  await page.click('#t5SummaryPdf');
  await page.waitForSelector('#dlg[open] .variant-pick');
  await page.screenshot({ path: `${shots}/08b-pdf-variant.png` });
  await page.click('#dlgCancel');
  const sumShort = await downloadVariant(page, '#t5SummaryPdf', 'short', 'top5-souhrn-osekana.pdf');
  check(/^top5-souhrn-\d{4}-\d{2}-\d{2}\.pdf$/.test(sumShort.name), `název osekaného souhrnu neprozradí verzi: ${sumShort.name}`);
  checkT5Pdf(sumShort.path, 'souhrn osekaný', { history: false });
  await page.click('#t5Tabs [data-t5tab="cases"]');
  await page.click('#t5View tbody tr >> nth=0');
  // poslední volba se pamatuje: dialog nabídne osekanou verzi
  await page.click('[data-t5pdf="case"]');
  await page.waitForSelector('#dlg[open] .variant-pick');
  check(await page.isChecked('#dlg [name="variant"][value="short"]'), 'pamatuje si poslední verzi PDF');
  await page.click('#dlgCancel');
  const caseFull = await downloadVariant(page, '[data-t5pdf="case"]', 'full', 'top5-pripad.pdf');
  checkT5Pdf(caseFull.path, 'případ kompletní', { history: true });
  const caseShort = await downloadVariant(page, '[data-t5pdf="case"]', 'short', 'top5-pripad-osekana.pdf');
  check(/^top5-pripad-P-\d{4}-\d{3}\.pdf$/.test(caseShort.name), `název osekaného případu neprozradí verzi: ${caseShort.name}`);
  checkT5Pdf(caseShort.path, 'případ osekaný', { history: false });
  await page.click('[data-t5back]');

  // Nastavení: čas v minutách. Uložené hodnoty se nemění, jen zobrazení a zadávání.
  await page.click('#t5Settings');
  await page.selectOption('#dlg [name="unit"]', 'min');
  await page.click('#dlgOk');
  await goWeek(page, 4);
  check(/Strávený čas \(min\)/.test(await page.textContent('.t5-entry thead')), 'záhlaví v minutách');
  check(await page.inputValue(`[data-ent="${ids[1]}"] [data-ef="spent"]`) === '1350', 'držák 22,5 h = 1350 min');
  await saved(page);

  // Předvyplnění z evidence práce: týden bez zápisu ukáže výpočet a jde převzít.
  const csv = path.join(S, 'top5-evidence.csv');
  fs.writeFileSync(csv, productionCsv());
  await page.click('#nav [data-view="vyroba"]');
  await page.setInputFiles('#pfile', csv);
  await page.waitForSelector('#dlg[open] #prodColsPreview');
  const picked = await page.evaluate(() => ['name', 'date', 'item', 'iname', 'ks', 'spent', 'norm'].map(n => document.querySelector(`#dlg [name="${n}"]`).value));
  check(JSON.stringify(picked) === JSON.stringify(['1', '2', '3', '4', '5', '6', '7']), `odhad sloupců: ${picked}`);
  const prev = await page.textContent('#prodColsPreview');
  check(/Položek \(EAN\): 4\./.test(prev), `náhled počtu položek: ${prev}`);
  await page.click('#dlgOk');
  await page.waitForSelector('#prodMsg .note.i');
  await saved(page);
  await page.click('#nav [data-view="top5"]');
  await goWeek(page, 6);
  check(/Spočítáno z evidence práce/.test(await page.textContent('#t5View')), 'týden bez zápisu ukáže výpočet z evidence');
  await page.screenshot({ path: `${shots}/09-import-week.png`, fullPage: true });
  await page.click('[data-entimport]');
  await page.waitForSelector('.t5-entry');
  const imported = await tableEans(page);
  check(JSON.stringify(imported) === JSON.stringify(['8590001000097', '8590001000080', '8590001000110']), `převzato z evidence: ${imported}`);
  await saved(page);

  // Historie změn a uložená data.
  const stored = await page.evaluate(async () => {
    const st = (await Vault.loadData()).state;
    return { weeks: Object.keys(st.eff.weeks).length,
      drzak: Object.values(st.eff.weeks).flatMap(w => w.items).find(e => e.ean === '8590001000011'),
      cases: st.eff.cases.length, rounds: st.eff.cases.map(c => c.rounds.length), reports: st.eff.reports.length, unit: st.eff.settings.unit,
      v: st.eff.cases[0].rounds[0].v[0], log: st.log.filter(e => e.kind === 'eff').map(e => e.text) };
  });
  check(stored.weeks === 3 && stored.cases === 2 && JSON.stringify(stored.rounds) === '[1,2]' && stored.reports === 1 && stored.unit === 'min', `uložená data: ${JSON.stringify({ ...stored, log: null })}`);
  check(stored.drzak && stored.drzak.spent === 1350 && stored.drzak.norm === 594, `uložený zápis držáku: ${JSON.stringify(stored.drzak)}`);
  check(stored.v && stored.v.src === 'manual' && stored.v.nspent === 600 && stored.v.norm === 576 && stored.v.eff === 96, `uložené ověření: ${JSON.stringify(stored.v)}`);
  check(stored.log.some(t => /P-\d{4}-002 .*Znovu otevřeno, kolo 2/.test(t)) && stored.log.some(t => /vydán týdenní report/.test(t))
    && stored.log.some(t => /^Top 5 T\d+\/\d{4}: 8590001000028 Kryt motoru: 16 h, norma 9 h \(plnění 56,3 %\)$/.test(t)), `historie změn: ${stored.log.join(' | ')}`);

  // Mobil: týden a detail případu bez vodorovného přetečení.
  await page.setViewportSize({ width: 390, height: 844 });
  await goWeek(page, 4);
  let overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `mobil týden: vodorovné přetečení ${overflow} px`);
  await page.screenshot({ path: `${shots}/10-mobile-week.png`, fullPage: true });
  await page.click('#t5Tabs [data-t5tab="cases"]');
  await page.click('#t5View tbody tr >> nth=1');
  await page.waitForTimeout(300);
  overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `mobil případ: vodorovné přetečení ${overflow} px`);
  await page.screenshot({ path: `${shots}/11-mobile-case.png`, fullPage: true });
  // Zpět (gesto telefonu) zavře případ a zůstane se v Top 5 (2.14).
  const caseOpen = await page.evaluate(() => ui.t5.caseId);
  check(caseOpen && await page.evaluate(() => history.state.sub === 'case'), 'případ je záznam v historii');
  await page.goBack();
  await page.waitForFunction(() => !ui.t5.caseId && ui.view === 'top5', null, { timeout: 5000 }).catch(() => {});
  check(await page.evaluate(() => !ui.t5.caseId && ui.view === 'top5'), 'Zpět zavřel případ');
  await page.click('#t5View tbody tr >> nth=1');
  await page.waitForFunction(() => !!ui.t5.caseId);
  await page.click('[data-t5back]');

  // Tmavý režim.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await goWeek(page, 4);
  await page.screenshot({ path: `${shots}/12-dark-week.png`, fullPage: true });
  await page.click('#t5Tabs [data-t5tab="cases"]');
  await page.click('#t5View tbody tr >> nth=0');
  await page.screenshot({ path: `${shots}/13-dark-case.png`, fullPage: true });
  await page.click('[data-t5back]');

  // Definitivní smazání zrušeného případu (2.6): z detailu i ze seznamu Zrušené.
  await page.emulateMedia({ colorScheme: 'light' });
  const cancelIt = async (ean, reason) => {
    await caseFromWeek(page, 6, ean);
    check(!(await page.$('[data-t5delete]')), 'rozpracovaný případ nejde smazat natrvalo');
    await page.click('[data-t5cancel]');
    await page.waitForSelector('#dlg[open] [name="value"]');
    await page.fill('#dlg [name="value"]', reason);
    await page.click('#dlgOk');
    await page.waitForSelector('.note [data-t5delete]');
    await saved(page);   // zrušený případ je uložený, smazání pak zapíše historie změn
  };
  await cancelIt('8590001000097', 'Založeno omylem.');
  const delA = await page.evaluate(() => ui.t5.caseId);
  await page.click('.note [data-t5delete]');
  await page.waitForSelector('#dlg[open]');
  check(/zmizí ze seznamu případů, souhrnů, termínů, PDF i z vydaných týdenních reportů/.test(await page.textContent('#dlg')), 'potvrzení vysvětlí, co smazání udělá');
  await page.screenshot({ path: `${shots}/14-delete-confirm.png` });
  await page.click('#dlgCancel');
  check(await page.evaluate(id => !!effCase(id), delA), 'Zrušit v potvrzení nic nesmaže');
  await page.click('.note [data-t5delete]');
  await page.click('#dlgOk');
  await page.waitForFunction(id => !effCase(id) && !ui.t5.caseId, delA);
  check(/je smazaný natrvalo/.test(await page.textContent('#toast')), 'hláška po smazání');
  await cancelIt('8590001000080', 'Duplicitní případ.');
  const delB = await page.evaluate(() => ui.t5.caseId);
  check(await page.evaluate(id => effCase(id).no, delB) === `${new Date().getFullYear()}-004`, 'číslo smazaného případu se znovu nepoužije');
  await page.click('[data-t5back]');
  await page.click('#t5Tabs [data-t5tab="cases"]');
  await page.click('[data-t5filter="zrus"]');
  check((await page.$$('#t5View tbody tr')).length === 1 && (await page.$$('#t5View tbody [data-t5delete]')).length === 1, 'v Zrušených je jeden případ s tlačítkem Smazat natrvalo');
  await page.screenshot({ path: `${shots}/15-cancelled-list.png`, fullPage: true });
  await page.click('#t5View tbody [data-t5delete]');
  await page.waitForSelector('#dlg[open]');
  check(await page.evaluate(() => !ui.t5.caseId), 'tlačítko v řádku případ neotevře');
  await page.click('#dlgOk');
  await page.waitForFunction(id => !effCase(id), delB);
  check(/Zatím žádný|Nic neodpovídá/.test(await page.textContent('#t5View')), 'Zrušené jsou prázdné');
  check(await page.textContent('[data-t5filter="zrus"] .t5-count') === '0', 'počet zrušených je 0');
  await saved(page);
  const afterDel = await page.evaluate(async ids => {
    const st = (await Vault.loadData()).state;
    return { cases: st.eff.cases.length, gone: ids.every(id => !st.eff.cases.some(c => c.id === id) && !JSON.stringify(st.eff).includes(id)),
      reasons: JSON.stringify(st.eff).includes('Založeno omylem') || JSON.stringify(st.eff).includes('Duplicitní případ'),
      sum: effSummary().total, log: st.log.filter(e => e.kind === 'eff').map(e => e.text).filter(t => /smazán natrvalo/.test(t)) };
  }, [delA, delB]);
  check(afterDel.cases === 2 && afterDel.gone && !afterDel.reasons && afterDel.sum === 2, `po smazání: ${JSON.stringify(afterDel)}`);
  check(afterDel.log.length === 2 && afterDel.log.every(t => /^P-\d{4}-00[34] \(85900010000(97|80), .*\): zrušený případ smazán natrvalo$/.test(t)), `historie změn po smazání: ${afterDel.log.join(' | ')}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-t5filter="zrus"]');
  check(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, 'mobil Zrušené: bez přetečení');

  await browser.close();
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
  console.log('e2e Top 5 ok');
})().catch(async error => {
  console.error(error);
  if (problems.length) console.log(problems.join('\n'));
  if (global.lastPage) await global.lastPage.screenshot({ path: `${shots}/zz-error.png`, fullPage: true }).catch(() => {});
  process.exit(1);
});
