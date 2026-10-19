// Prohlížečový průchod Servisem (verze 2.21): nové odeslání se třemi zařízeními (nečitelné ID,
// obě čísla nečitelná s dodatečným označením), PDF předávacího protokolu, druhé odeslání
// s výběrem z evidence a párováním podle výrobního čísla, stejné zařízení dvakrát, vrácení ze
// servisu (jedno i vše), evidence s historií a úpravou údajů, úprava a smazání protokolu,
// historie změn. Na konci telefon a tmavý režim.
// Spuštění stejně jako e2e_browser.js:
//   ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t . dev-router.php &
//   curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state
//   NO_PROXY=127.0.0.1 PW=$(npm root -g)/playwright S=$S node tests/e2e_servis.js
// PDF se uloží do $S (servis-*.pdf), snímky do $S/oshots-sv. Všechna data jsou vymyšlená.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-sv');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

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
  return { name: file.suggestedFilename(), path: target, pdf: fs.readFileSync(target).slice(0, 5).toString() === '%PDF-' };
}
/* Text PDF přes pypdf (PyMuPDF jako záloha); bez nich se kontrola textu přeskočí. */
function pdfText(file) {
  const py = `import sys
try:
    import pypdf
    print('\\n'.join(p.extract_text() or '' for p in pypdf.PdfReader(sys.argv[1]).pages))
except ImportError:
    import pymupdf
    print('\\n'.join(p.get_text() for p in pymupdf.open(sys.argv[1])))`;
  const r = require('child_process').spawnSync('python3', ['-c', py, file], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.replace(/\s+/g, ' ') : null;
}
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const item = i => `[data-svitem="${i}"]`;
async function fillItem(page, i, v) {
  for (const [f, val] of Object.entries(v)) {
    if (f === 'iidBad' || f === 'snBad') { await page.check(`${item(i)} [data-svf="${f}"]`); await page.waitForSelector(`${item(i)} [data-svf="${f.replace('Bad', '')}"]:disabled`); continue; }
    await page.fill(`${item(i)} [data-svf="${f}"]`, val);
  }
}
async function confirm(page) {
  await page.waitForSelector('#dlg[open]');
  await page.click('#dlgOk');
  await page.waitForSelector('#dlg', { state: 'hidden' });
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  global.lastPage = page;
  await watch(page, 'servis');
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

  // Prázdný modul.
  await page.click('#nav [data-view="servis"]');
  await page.waitForSelector('#view-servis.on #svView .empty');
  check(/Zatím žádné odeslání/.test(await page.textContent('#svView')), 'prázdný stav');
  await page.screenshot({ path: path.join(shots, '01-prazdny.png') });

  // Nové odeslání: tři zařízení.
  await page.click('#svNew');
  await page.waitForSelector('.sv-editor');
  check(await page.inputValue('[data-svd="date"]') === await page.evaluate(() => todayIso()), 'datum odeslání = dnes');
  await page.fill('[data-svd="date"]', '2026-10-19');
  await page.fill('[data-svd="to"]', 'Servis Brno');
  // psaní z klávesnice: pole se nesmí překreslit pod rukama (Tab do dalšího pole)
  await page.click(`${item(0)} [data-svf="kind"]`);
  await page.keyboard.type('Bruska');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Makita');
  await page.keyboard.press('Tab');
  await page.keyboard.type('GA5030');
  await page.keyboard.press('Tab');
  await page.keyboard.type('B-12');
  await page.keyboard.press('Tab');   // zaškrtávátko nečitelné
  await page.keyboard.press('Tab');
  await page.keyboard.type('SN-001');
  check(await page.evaluate(() => JSON.stringify(ui.sv.draft.items[0])) === JSON.stringify({ dev: '', kind: 'Bruska', brand: 'Makita', model: 'GA5030', made: '', iid: 'B-12', sn: 'SN-001', iidBad: false, snBad: false, mark: '', purpose: 'repair', faults: [], fault: '', back: '', backNote: '' }),
    `psaní z klávesnice do položky: ${await page.evaluate(() => JSON.stringify(ui.sv.draft.items[0]))}`);
  await page.fill(`${item(0)} [data-svf="made"]`, '2019');
  // vzor zařízení (2.22): uloží druh, značku a model, rozepsaný protokol zůstane
  await page.click(`${item(0)} [data-svtplsave="0"]`);
  await page.waitForFunction(() => (S.service.templates || []).length === 1 && /Vzor uložen: Bruska · Makita GA5030/.test(document.querySelector('#toast').textContent));
  check(await page.inputValue(`${item(0)} [data-svf="sn"]`) === 'SN-001' && await page.inputValue(`${item(0)} [data-svf="made"]`) === '2019' && await page.$(`${item(0)} [data-svtpl="0"]`), 'po uložení vzoru zůstane rozepsaná položka a objeví se výběr vzoru');
  await page.click(`${item(0)} [data-svtplsave="0"]`);
  await page.waitForFunction(() => /už je uložený/.test(document.querySelector('#toast').textContent));
  check(await page.evaluate(() => S.service.templates.length === 1), 'stejný vzor podruhé nepřibude');
  check(await page.isChecked(`${item(0)} [data-svp="repair"]`), 'výchozí účel: k opravě');
  await page.check(`${item(0)} [data-svfault="start"]`);
  await page.check(`${item(0)} [data-svfault="heat"]`);
  await page.fill(`${item(0)} [data-svf="fault"]`, 'jiskří motor');
  await page.click('[data-svadd]');
  await page.waitForSelector(item(1));
  check(await page.evaluate(() => document.activeElement.matches('[data-svitem="1"] [data-svf="kind"]')), 'přidané zařízení dostane fokus');
  await fillItem(page, 1, { kind: 'Vrtačka', brand: 'Bosch', model: 'GSB 18', iidBad: true, sn: 'X-9' });
  check(await page.inputValue(`${item(0)} [data-svf="sn"]`) === 'SN-001', 'zaškrtnutí nečitelné nesmaže jiné položky');
  await page.click('[data-svadd]');
  await page.waitForSelector(item(2));
  await fillItem(page, 2, { kind: 'Pila', brand: 'Festool', model: 'TS 55', iidBad: true, snBad: true });
  await page.waitForSelector(`${item(2)} .sv-markbox`);
  check(/spodní stěně horního krytu, kde je řídicí jednotka/.test(await page.textContent(`${item(2)} .sv-markbox`)), 'obě čísla nečitelná: text o dodatečném označení');
  await page.click('[data-svsave="plain"]');
  await page.waitForFunction(() => /Zařízení 3: obě čísla jsou nečitelná/.test(document.querySelector('#toast').textContent));
  check(await page.evaluate(() => !!ui.sv.draft && !S.service.shipments.length), 'bez dodatečného označení se neuloží');
  await page.fill(`${item(2)} [data-svf="mark"]`, 'S-01');
  await page.check(`${item(2)} [data-svp="scrap"]`);
  await page.check(`${item(2)} [data-svfault="damage"]`);
  await page.check(`${item(2)} [data-svfault="vibr"]`);
  check(await page.inputValue(`${item(0)} [data-svf="fault"]`) === 'jiskří motor' && await page.isChecked(`${item(0)} [data-svfault="heat"]`), 'zaškrtnutí u jiné položky nic nesmaže');
  await page.screenshot({ path: path.join(shots, '02-editor.png'), fullPage: true });
  const pdf1 = await download(page, '[data-svsave="pdf"]', 'servis-protokol-1.pdf');
  await saved(page);
  const st1 = await page.evaluate(() => ({ dev: S.service.devices.map(d => [d.kind, d.iid, d.sn, d.iidBad, d.snBad, d.mark]), ship: S.service.shipments.map(x => [svNo(x), x.date, x.to, x.items.length, x.by]),
    items: S.service.shipments[0].items.map(i => [i.purpose, i.faults.join(), i.fault]) }));
  check(await page.evaluate(() => S.service.devices[0].made === '2019' && S.service.shipments[0].items[0].made === '2019'), 'rok výroby v protokolu i evidenci');
  check(JSON.stringify(st1) === JSON.stringify({ dev: [['Bruska', 'B-12', 'SN-001', false, false, ''], ['Vrtačka', '', 'X-9', true, false, ''], ['Pila', '', '', true, true, 'S-01']], ship: [['2026/001', '2026-10-19', 'Servis Brno', 3, 'Vedoucí dílny']],
    items: [['repair', 'start,heat', 'jiskří motor'], ['repair', '', ''], ['scrap', 'vibr,damage', '']] }), `po uložení: ${JSON.stringify(st1)}`);
  check(pdf1.pdf && pdf1.name === 'servis-protokol-2026-001.pdf', `PDF protokolu: ${pdf1.name}`);
  const t1 = pdfText(pdf1.path);
  if (t1 != null) {
    check(/Rok výroby/.test(t1) && /GA5030 2019 B-12/.test(t1), `PDF rok výroby: ${t1.slice(0, 700)}`);
    check(/Předávací protokol/i.test(t1) && /2026\/001/.test(t1) && /19\. 10\. 2026/.test(t1) && /Servis Brno/.test(t1) && /Makita/.test(t1) && /B-12/.test(t1) && /SN-001/.test(t1) && /X-9/.test(t1), `PDF údaje: ${t1.slice(0, 500)}`);
    check(/nečitelné/.test(t1) && /spodní stěně horního krytu/.test(t1) && /S-01/.test(t1) && /Převzal za servis/.test(t1) && /HALA 2/.test(t1) && !/Odměny/.test(t1), `PDF nečitelné, označení, podpisy: ${t1.slice(0, 900)}`);
    check(/K opravě · Závada: Nelze spustit, Přehřívá se, jiná: jiskří motor/.test(t1) && /K VYŘAZENÍ · Závada: Nadměrné rezonance – nejde dlouho držet v ruce, Poškozené zařízení/.test(t1) && /k opravě 2, k vyřazení 1/.test(t1), `PDF účel a závady: ${t1.slice(0, 1200)}`);
  }
  check(/na servisu 2/.test(await page.textContent('#svView .sv-ship')) && /k vyřazení 1/.test(await page.textContent('#svView .sv-ship')) && /Protokol 2026\/001/.test(await page.textContent('#svView'))
    && /Nelze spustit, Přehřívá se, jiná: jiskří motor/.test(await page.textContent('#svView .sv-ship')), 'karta protokolu: na servisu 2, k vyřazení 1, závady');
  check(await page.$$eval('#svView .sv-ship [data-svback]', els => els.length) === 2, 'k vyřazení se nevrací');
  await page.screenshot({ path: path.join(shots, '03-protokol.png'), fullPage: true });

  // Druhé odeslání: výběr z evidence, párování podle v. č. a označení, stejné zařízení dvakrát.
  await page.click('#svNew');
  await page.waitForSelector('[data-svpick="0"]');
  await page.fill('[data-svd="date"]', '2026-11-02');
  const label = await page.evaluate(() => svLabel(S.service.devices[0]));
  await page.fill('[data-svpick="0"]', label);
  await page.dispatchEvent('[data-svpick="0"]', 'change');
  await page.waitForFunction(() => ui.sv.draft.items[0].dev === S.service.devices[0].id);
  check(await page.inputValue(`${item(0)} [data-svf="iid"]`) === 'B-12' && /Z evidence: Bruska · Makita GA5030/.test(await page.textContent(`${item(0)} .sv-hint`)) && /na servisu 1×/.test(await page.textContent(`${item(0)} .sv-hint`)), 'výběr z evidence vyplní položku');
  await page.click('[data-svadd]');
  await page.fill(`${item(1)} [data-svf="sn"]`, 'x9');
  await page.press(`${item(1)} [data-svf="sn"]`, 'Tab');
  await page.waitForFunction(() => /V evidenci už je: Vrtačka/.test(document.querySelector('[data-svhint="1"]').textContent));
  check(/podle evidence je teď na servisu/.test(await page.textContent(`${item(1)} .sv-hint`)), 'upozornění, že zařízení je podle evidence na servisu');
  await page.click('[data-svadd]');
  await fillItem(page, 2, { iidBad: true, snBad: true });
  await page.fill(`${item(2)} [data-svf="mark"]`, 's01');
  await page.press(`${item(2)} [data-svf="mark"]`, 'Tab');
  await page.waitForFunction(() => /odesláno k vyřazení 19\. 10\. 2026/.test(document.querySelector('[data-svhint="2"]').textContent));
  await page.click('[data-svdel="2"]');
  await page.waitForFunction(() => ui.sv.draft.items.length === 2);
  await page.click('[data-svadd]');
  await fillItem(page, 2, { iid: 'b 12' });
  await page.click('[data-svsave="plain"]');
  await page.waitForFunction(() => /Zařízení 1 a 3 je stejné zařízení/.test(document.querySelector('#toast').textContent));
  await page.click('[data-svdel="2"]');
  await page.waitForFunction(() => ui.sv.draft.items.length === 2);
  await page.click('[data-svsave="plain"]');
  await page.waitForFunction(() => !ui.sv.draft && S.service.shipments.length === 2);
  await saved(page);
  const st2 = await page.evaluate(() => ({ devs: S.service.devices.length, no: svNo(S.service.shipments[1]), sn: S.service.devices[1].sn, links: S.service.shipments[1].items.map(i => S.service.devices.findIndex(d => d.id === i.dev)) }));
  check(JSON.stringify(st2) === JSON.stringify({ devs: 3, no: '2026/002', sn: 'X-9', links: [0, 1] }), `druhé odeslání bez nových zařízení: ${JSON.stringify(st2)}`);

  // Vrácení ze servisu: jedno a pak vše.
  const ship1 = '[data-svship]:has-text("Protokol 2026/001")';
  await page.click(`${ship1} [data-svback][data-j="0"]`);
  await page.waitForSelector('#dlg[open] [name="back"]');
  await page.fill('#dlg [name="back"]', '2026-10-15');
  await page.click('#dlgOk');
  await page.waitForTimeout(150);
  check(await page.isVisible('#dlg[open]') && await page.evaluate(() => !S.service.shipments[0].items[0].back), 'vrácení před odesláním se nezapíše');
  await page.fill('#dlg [name="back"]', '2026-10-25');
  await page.fill('#dlg [name="note"]', 'vyměněn vypínač');
  await page.click('#dlgOk');
  await page.waitForSelector('#dlg', { state: 'hidden' });
  await page.waitForFunction(() => S.service.shipments[0].items[0].back === '2026-10-25');
  check(/vráceno 25\. 10\. 2026/.test(await page.textContent(ship1)) && /6 dní na servisu · vyměněn vypínač/.test(await page.textContent(ship1)), 'vrácení na kartě protokolu');
  check(!(await page.$(`${ship1} [data-svbackall]`)) && /na servisu 1/.test(await page.textContent(ship1)) && /k vyřazení 1/.test(await page.textContent(ship1)) && await page.evaluate(() => !S.service.shipments[0].items[2].back), 'zařízení k vyřazení se nevrací, hromadně až od dvou');
  const ship2 = '[data-svship]:has-text("Protokol 2026/002")';
  await page.click(`${ship2} [data-svbackall]`);
  await page.waitForSelector('#dlg[open] [name="back"]');
  await page.fill('#dlg [name="back"]', '2026-11-09');
  await page.click('#dlgOk');
  await page.waitForFunction(() => S.service.shipments[1].items.every(i => i.back === '2026-11-09'));
  check(/vše vráceno/.test(await page.textContent(ship2)), 'vráceno vše');
  await saved(page);

  // Evidence zařízení a historie.
  await page.click('[data-svtab="dev"]');
  await page.waitForSelector('#svDevTable tr[data-svdev]');
  const devRows = await page.$$eval('#svDevTable tbody tr', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  check(devRows.length === 3 && /^Bruska · Makita GA5030rok výroby 2019 ID B-12 · v\. č\. SN-001 2× 2× 2\. 11\. 2026 7 dní 14 dní v provozu$/.test(devRows[0]) && /vyřazeno 19\. 10\. 2026$/.test(devRows[2]), `evidence: ${JSON.stringify(devRows)}`);
  check(/z toho 1 vyřazených/.test(await page.textContent('#svView .stats')), 'dlaždice: vyřazená zařízení');
  await page.fill('#svQ', 'festool');
  await page.waitForFunction(() => document.querySelectorAll('#svDevTable tbody tr').length === 1);
  check(await page.evaluate(() => document.activeElement.id === 'svQ'), 'hledání nepřijde o fokus');
  await page.fill('#svQ', '');
  await page.waitForFunction(() => document.querySelectorAll('#svDevTable tbody tr').length === 3);
  await page.screenshot({ path: path.join(shots, '04-evidence.png'), fullPage: true });
  await page.click('#svDevTable tr[data-svdev]:has-text("Makita")');
  await page.waitForSelector('#dlg[open] .sv-hist-tab');
  check(await page.$$eval('#dlg .sv-hist-tab tbody tr', els => els.length) === 2 && /na servisu 2× \(za 12 měsíců 2×\)/.test(await page.textContent('#dlg')) && /vyměněn vypínač/.test(await page.textContent('#dlg')), 'historie zařízení v dialogu');
  check(!(await page.$('#dlg #svDevDel')) && await page.inputValue('#dlg [name="made"]') === '2019', 'zařízení s historií nejde smazat, rok výroby v údajích');
  await page.screenshot({ path: path.join(shots, '05-historie.png') });
  await page.fill('#dlg [name="note"]', 'patří lakovně');
  await page.click('#dlgOk');
  await page.waitForSelector('#dlg', { state: 'hidden' });
  await page.waitForFunction(() => S.service.devices[0].note === 'patří lakovně');
  check(await page.evaluate(() => S.service.shipments[0].items[0].kind === 'Bruska'), 'úprava evidence protokol nemění');

  // Úprava protokolu, zrušení rozepsaného, smazání.
  await page.click('[data-svtab="ship"]');
  await page.click('[data-svship]:has-text("Protokol 2026/002") [data-svedit]');
  await page.waitForSelector('.sv-editor h2:has-text("Upravit protokol 2026/002")');
  await page.fill('[data-svd="to"]', 'Servis Ostrava');
  await page.click('[data-svsave="plain"]');
  await page.waitForFunction(() => !ui.sv.draft && S.service.shipments[1].to === 'Servis Ostrava' && svNo(S.service.shipments[1]) === '2026/002');
  await page.click('#svNew');
  await page.selectOption(`${item(0)} [data-svtpl="0"]`, await page.evaluate(() => S.service.templates[0].id));
  await page.waitForFunction(() => ui.sv.draft.items[0].kind === 'Bruska');
  check(await page.inputValue(`${item(0)} [data-svf="brand"]`) === 'Makita' && await page.inputValue(`${item(0)} [data-svf="model"]`) === 'GA5030' && await page.inputValue(`${item(0)} [data-svf="iid"]`) === ''
    && await page.evaluate(() => document.activeElement.matches('[data-svitem="0"] [data-svf="iid"]')), 'vzor vyplní druh, značku a model, kurzor skočí na interní ID');
  await page.fill(`${item(0)} [data-svf="kind"]`, 'Zkouška');
  await page.click('[data-svcancel]');
  await confirm(page);
  await page.waitForFunction(() => !ui.sv.draft);
  check(await page.evaluate(() => S.service.shipments.length === 2), 'zahozený rozepsaný protokol se neuloží');
  await page.click('[data-svship]:has-text("Protokol 2026/002") [data-svshipdel]');
  await confirm(page);
  await page.waitForFunction(() => S.service.shipments.length === 1);
  check(await page.evaluate(() => S.service.devices.length === 3 && svHistory(S.service, S.service.devices[1].id).count === 1), 'smazaný protokol zmizí z historie, zařízení zůstanou');
  await saved(page);

  // Vzory v záložce Zařízení: seznam a smazání.
  await page.click('[data-svtab="dev"]');
  await page.waitForSelector('.sv-tpls');
  check(/Bruska · Makita GA5030/.test(await page.textContent('.sv-tpl-list')), 'seznam vzorů');
  await page.click('.sv-tpl-list [data-svtpldel]');
  await confirm(page);
  await page.waitForFunction(() => !S.service.templates.length);
  check(/Zatím žádný vzor/.test(await page.textContent('.sv-tpls')), 'vzor smazán');
  await saved(page);
  await page.click('[data-svtab="ship"]');

  // Historie změn.
  const log = await page.evaluate(() => S.log.filter(x => x.kind === 'service').map(x => x.text));
  check(log.some(t => /^Servis: odeslání 2026\/001 \(19\. 10\. 2026, Servis Brno\): 3 zařízení/.test(t)) && log.some(t => /vráceno ze servisu 25\. 10\. 2026/.test(t))
    && log.some(t => /smazán protokol 2026\/002/.test(t)) && log.some(t => /upravené údaje – poznámka/.test(t))
    // nový vzor tu v historii není: bylo to první uložení po čisté instalaci (to se nezapisuje), text hlídá test jádra
    && log.some(t => t === 'Servis: smazán vzor zařízení Bruska · Makita GA5030'), `historie změn: ${JSON.stringify(log)}`);
  await page.click('#logBtn');
  await page.waitForSelector('#dlg[open] [data-lf="service"]');
  await page.click('#dlg [data-lf="service"]');
  await page.waitForTimeout(200);
  check(/Servis: odeslání 2026\/001/.test(await page.textContent('#dlg')), 'filtr Servis v historii změn');
  await page.click('#dlgCancel');

  // Telefon: seznam, evidence, editor a hlavní menu bez přetečení.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { ui.sv.tab = 'ship'; showView('servis'); });
  await page.waitForTimeout(200);
  check(await overflow(page) <= 1, `telefon odeslání: přetečení ${await overflow(page)} px`);
  await page.screenshot({ path: path.join(shots, '10-telefon-odeslani.png'), fullPage: true });
  await page.click('[data-svtab="dev"]');
  await page.waitForTimeout(200);
  check(await overflow(page) <= 1, `telefon evidence: přetečení ${await overflow(page)} px`);
  await page.screenshot({ path: path.join(shots, '11-telefon-evidence.png'), fullPage: true });
  await page.click('#svNew');
  await page.waitForSelector('.sv-editor');
  await fillItem(page, 0, { iidBad: true, snBad: true });
  await page.waitForTimeout(200);
  check(await overflow(page) <= 1, `telefon editor: přetečení ${await overflow(page)} px`);
  await page.screenshot({ path: path.join(shots, '12-telefon-editor.png'), fullPage: true });
  await page.click('[data-svcancel]');
  await confirm(page);
  await page.waitForFunction(() => !ui.sv.draft);
  await page.click('#brandHome');
  await page.waitForSelector('#view-domu.on');
  if (await page.isHidden('#homeView .home-open')) await page.click('[data-hshift="both"]');
  check(/Servis/.test(await page.textContent('#homeView .home-menu')) && /na servisu 1/.test(await page.textContent('#homeView .home-menu [data-go="servis"]')), 'Servis v hlavním menu telefonu');
  await page.click('#homeView .home-menu [data-go="servis"]');
  await page.waitForFunction(() => ui.view === 'servis');
  await page.setViewportSize({ width: 1440, height: 900 });

  // Tmavý režim.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => { ui.sv.tab = 'ship'; renderService(); });
  await page.screenshot({ path: path.join(shots, '20-tmavy.png'), fullPage: true });

  await browser.close();
  if (problems.length) { console.log(`PROBLÉMY (${problems.length}):\n- ${problems.join('\n- ')}`); process.exit(1); }
  console.log('e2e Servis ok');
})().catch(async error => {
  console.error(error);
  if (problems.length) console.log(problems.join('\n'));
  if (global.lastPage) await global.lastPage.screenshot({ path: `${shots}/zz-error.png`, fullPage: true }).catch(() => {});
  process.exit(1);
});
