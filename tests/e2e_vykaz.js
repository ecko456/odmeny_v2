// Prohlížečový průchod: jeden výkaz práce pro Výrobu i Audit (verze 2.35). Stejný soubor z IS
// (datum, pracovník = ID zaměstnance, operace, kusy, norma, strávený čas) se nahraje jednou:
// ve Výrobě se sloupcem Operace se kusy podle operací zapíšou i do Auditu, v Auditu se výkaz
// nabídne nahrát i do Výroby (když sedí na sloupce uložené ve Výrobě). Kontroluje odhad sloupce
// Operace, kusy proti samostatnému výpočtu, evidenci po lidech, odškrtnutou volbu, soubor
// s jinou hlavičkou, historii změn a vzhled dialogů. Všechna data jsou vymyšlená.
// Spuštění stejně jako e2e_browser.js:
//   ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t . dev-router.php &
//   curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state
//   NO_PROXY=127.0.0.1 PW=$(npm root -g)/playwright S=$S node tests/e2e_vykaz.js
// Snímky jsou v $S/oshots-vykaz.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-vykaz');
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
async function confirm(page) {
  await page.waitForSelector('#dlg[open]');
  await page.click('#dlgOk');
  await page.waitForFunction(() => !document.querySelector('#dlg[open]'));
}
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// Vymyšlení lidé s ID z evidence; ID 109 nikomu nepatří (čeká na spárování).
const PEOPLE = [['101', 'Brusič', 'Adam'], ['102', 'Fréza', 'Bára'], ['103', 'Pískař', 'Cyril']];
const OPS = [['Broušení ruční', 40], ['Frézování CNC', 12], ['Pískování - hala 2', 30]];
const HEAD = ['Datum', 'Středisko', 'Zakázka', 'Díl', 'Pracovník', 'Od', 'Do', 'Operace', 'Norma', 'Kusy', 'Strávený čas'];

/* Řádky výkazu za měsíc: pracovní dny, každá operace dvakrát (dva lidé), řádek bez pracovníka
   (kusy se do Auditu počítají, do Výroby ne) a souhrn na konci. Očekávané kusy po dnech zvlášť. */
function monthRows(month, days) {
  const rows = [], byDay = {}, people = {};
  days.forEach(day => {
    OPS.forEach(([op, base], i) => {
      [0, 1].forEach(h => {
        const who = h === 1 && i === 2 && day % 2 ? '109' : PEOPLE[(i + h) % 3][0];
        const ks = base + ((day + i * 3 + h) % 7);
        rows.push([{ d: [2026, month, day] }, 'H2', `Z${day}${i}`, `D-${i}`, who, '06:00', '14:00', op, ks * 2, ks, ks * 2 + 15]);
        const iso = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        (byDay[iso] = byDay[iso] || {})[op] = (byDay[iso][op] || 0) + ks;
        people[who] = (people[who] || 0) + ks;
      });
    });
    rows.push([{ d: [2026, month, day] }, 'H2', 'Z0', 'D-9', '', '', '', OPS[0][0], 0, 3, 0]);
    byDay[`2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`][OPS[0][0]] += 3;
  });
  rows.push([null, null, null, null, 'Celkem', null, null, null, null, 999, null]);
  return { rows, byDay, people, records: days.length * OPS.length * 2 };
}

async function makeXlsx(page, head, rows) {
  const b64 = await page.evaluate(async ([head, rows]) => {
    const X = await xlsx();
    const aoa = [['Výkaz práce – export z IS'], head, ...rows.map(r => r.map(c => (c && c.d ? new Date(Date.UTC(c.d[0], c.d[1] - 1, c.d[2], 12)) : c)))];
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), 'Výkaz');
    const bytes = new Uint8Array(X.write(wb, { bookType: 'xlsx', type: 'array' }));
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, [head, rows]);
  return Buffer.from(b64, 'base64');
}
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await watch(page, 'výkaz');
  await page.goto(BASE);
  await page.waitForSelector('#setupForm');
  await page.fill('[name="token"]', fs.readFileSync(process.env.TOKEN_FILE || path.join(S, 'odme2e', 'setup-token.txt'), 'utf8').trim());
  await page.fill('[name="label"]', 'Vedoucí haly');
  await page.click('#setupForm button[type="submit"]');
  await page.waitForSelector('.odm-card');
  await page.check('#saved');
  await page.click('#finish');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');
  await saved(page);
  await page.evaluate(people => {
    const st = blank();
    people.forEach(([wid, last, first]) => { const key = `${last}|${first}`.toLowerCase(); st.employees[key] = { key, last, first, positionId: null, shift: 'R', note: '', wid }; });
    S = sanitizeState(st);
    save();
    renderAll();
  }, PEOPLE);
  await saved(page);

  const oct = monthRows(10, [1, 2, 5, 6, 7]);
  const nov = monthRows(11, [2, 3, 4]);
  const dec = monthRows(12, [1, 2]);
  const files = {
    oct: { name: 'vykaz-rijen.xlsx', mimeType: XLSX_TYPE, buffer: await makeXlsx(page, HEAD, oct.rows) },
    nov: { name: 'vykaz-listopad.xlsx', mimeType: XLSX_TYPE, buffer: await makeXlsx(page, HEAD, nov.rows) },
    // jiná hlavička: na uložené sloupce Výroby nesedí
    dec: { name: 'vykaz-prosinec.xlsx', mimeType: XLSX_TYPE, buffer: await makeXlsx(page, HEAD.map(h => (h === 'Zakázka' ? 'Číslo zakázky' : h)), dec.rows) },
  };

  // 1) Výroba: sloupec Operace se odhadne z hlavičky, kusy podle operací jdou i do Auditu.
  await page.click('#nav [data-view="vyroba"]');
  await page.setInputFiles('#pfile', files.oct);
  await page.waitForSelector('#dlg[open] #prodColsPreview');
  const picked = await page.evaluate(() => ['name', 'date', 'ks', 'norm', 'op'].map(n => document.querySelector(`#dlg [name="${n}"]`).value));
  check(JSON.stringify(picked) === JSON.stringify(['4', '0', '9', '8', '7']), `odhad sloupců (Pracovník, Datum, Kusy, Norma, Operace): ${picked}`);
  await page.selectOption('#dlg [name="spent"]', '10');
  await page.waitForTimeout(100);
  const pv = await page.textContent('#prodColsPreview');
  check(/Audit: kusy podle operací za 5 dní \(3 operace\)/.test(pv), `náhled sloupců s Auditem: ${pv}`);
  check(/kusy i do Auditu/.test(await page.textContent('#dlgBody')), 'popis pole Operace');
  await page.locator('#dlg [name="op"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, '01-vyroba-sloupce.png') });
  await page.click('#dlgOk');
  await page.waitForSelector('#prodMsg .note.i');
  await saved(page);
  const msg = (await page.textContent('#prodMsg')).replace(/\s+/g, ' ');
  check(/Audit: kusy podle operací doplněny za 5 dní \(1\. 10\. 2026 – 7\. 10\. 2026\)\. 3 nové operace čekají na skupinu v Nastavení Auditu/.test(msg), `hláška Výroby: ${msg}`);
  const a1 = await page.evaluate(() => {
    const wa = S.workAudit, name = id => wa.ops.find(o => o.id === id).name;
    const byDay = {};
    Object.entries(wa.pcs).forEach(([iso, d]) => { byDay[iso] = {}; Object.entries(d).forEach(([id, ks]) => { byDay[iso][name(id)] = ks; }); });
    const pp = S.production['2026-10'];
    return { byDay, ops: wa.ops.map(o => [o.name, o.group]), files: wa.files.map(f => [f.kind, f.name, f.days]), op: S.settings.prodCols.op,
      prod: pp && [pp.records, pp.time, Object.fromEntries(Object.values(pp.names).map(r => [r.name, r.total]))], tab: ui.wa.tab, filter: ui.wa.opFilter, un: Object.values(pp.names).filter(r => !prodKeyFor(r.name)).map(r => r.name) };
  });
  check(JSON.stringify(a1.byDay) === JSON.stringify(oct.byDay), `kusy v Auditu po dnech a operacích: ${JSON.stringify(a1.byDay).slice(0, 300)}`);
  check(JSON.stringify(a1.ops) === JSON.stringify(OPS.map(o => [o[0], '']).sort((x, y) => x[0].localeCompare(y[0], 'cs'))), `nové operace bez skupiny: ${JSON.stringify(a1.ops)}`);
  check(JSON.stringify(a1.files) === JSON.stringify([['work', 'vykaz-rijen.xlsx', 5]]), `soubor v Auditu: ${JSON.stringify(a1.files)}`);
  check(a1.op === 7 && a1.prod && a1.prod[0] === oct.records && a1.prod[1] === true && JSON.stringify(a1.prod[2]) === JSON.stringify(oct.people), `Výroba po lidech: ${JSON.stringify(a1.prod)} ≠ ${JSON.stringify(oct.people)}`);
  check(a1.tab === 'nastaveni' && a1.filter === 'nogroup' && JSON.stringify(a1.un) === '["109"]', `Audit čeká na skupiny, ID 109 ke spárování: ${JSON.stringify([a1.tab, a1.filter, a1.un])}`);
  await page.screenshot({ path: path.join(shots, '02-vyroba-hlaska.png'), fullPage: false });

  // „Otevřít Audit“ vede rovnou na operace bez skupiny; Nastavení vysvětlí jedno nahrání.
  await page.click('#prodMsg [data-go="audit"]');
  await page.waitForSelector('#view-audit.on .wa-onefile');
  check(await page.locator('#waView [data-waopf="nogroup"][aria-pressed="true"]').count() === 1, 'Audit: filtr operací bez skupiny');
  const one = (await page.textContent('#waView .wa-onefile')).replace(/\s+/g, ' ');
  check(/Stačí nahrát jednou\. Výroba bere i operaci \(sloupec H\)/.test(one), `Nastavení Auditu: ${one}`);
  await page.locator('#waView .wa-onefile').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, '03-audit-nastaveni.png'), fullPage: false });

  // 2) Audit: výkaz za listopad se nabídne nahrát i do Výroby (sloupce Výroby sedí).
  await page.setInputFiles('#waWorkFile', files.nov);
  await page.waitForSelector('#dlg[open] .wa-prev');
  check(await page.isChecked('#dlg [name="toProd"]'), 'Nahrát i do Výroby je zaškrtnuté');
  const d2 = (await page.textContent('#dlg .wa-toprod')).replace(/\s+/g, ' ');
  check(new RegExp(`Nahrát i do Výroby \\(evidence práce\\): ${nov.records} řádků za listopad 2026, zaměstnanec ze sloupce E\\.`).test(d2), `volba Výroby v dialogu: ${d2}`);
  await page.screenshot({ path: path.join(shots, '04-audit-dialog.png') });
  await page.click('#dlgOk');
  await page.waitForFunction(() => !document.querySelector('#dlg[open]') && S.production['2026-11']);
  check(/Výkaz práce nahrán: 3 dny\. Výroba doplněna \(listopad 2026\), 1 jméno ve Výrobě čeká na spárování\./.test(await page.textContent('#toast')), `hláška Auditu: ${await page.textContent('#toast')}`);
  await saved(page);
  const a2 = await page.evaluate(() => { const pp = S.production['2026-11']; return { at: pp.at, rec: pp.records, time: pp.time, people: Object.fromEntries(Object.values(pp.names).map(r => [r.name, r.total])), days: Object.keys(S.workAudit.pcs).filter(i => i.startsWith('2026-11')).length }; });
  check(a2.rec === nov.records && a2.time && JSON.stringify(a2.people) === JSON.stringify(nov.people) && a2.days === 3, `listopad ve Výrobě i Auditu: ${JSON.stringify(a2)}`);

  // Znovu, ale bez Výroby: evidence za listopad zůstane, jak byla.
  await page.setInputFiles('#waWorkFile', files.nov);
  await page.waitForSelector('#dlg[open] .wa-prev');
  check(/Evidence za listopad 2026 se nahradí/.test(await page.textContent('#dlg .wa-toprod')), 'upozornění, že se evidence nahradí');
  await page.uncheck('#dlg [name="toProd"]');
  const nFiles = await page.evaluate(() => S.workAudit.files.length);
  await confirm(page);
  await page.waitForFunction(n => S.workAudit.files.length === n + 1, nFiles);
  await saved(page);
  check(await page.evaluate(at => S.production['2026-11'].at === at, a2.at), 'bez zaškrtnutí se Výroba nezměnila');
  check(!/Výroba doplněna/.test(await page.textContent('#toast')), 'hláška bez Výroby');

  // 3) Jiná hlavička: do Výroby se nenabídne, Audit se nahraje.
  await page.setInputFiles('#waWorkFile', files.dec);
  await page.waitForSelector('#dlg[open] .wa-prev');
  check(await page.locator('#dlg [name="toProd"]').count() === 0, 'bez volby Výroby u jiné hlavičky');
  check(/Do Výroby se soubor nenahraje: nesedí na sloupce evidence práce nastavené ve Výrobě/.test(await page.textContent('#dlg .wa-noprod')), 'vysvětlení, proč ne do Výroby');
  await page.screenshot({ path: path.join(shots, '05-audit-jina-hlavicka.png') });
  await confirm(page);
  await page.waitForFunction(n => S.workAudit.files.length === n + 2, nFiles);
  await saved(page);
  check(await page.evaluate(() => !S.production['2026-12'] && Object.keys(S.workAudit.pcs).some(i => i.startsWith('2026-12'))), 'prosinec jen v Auditu');

  // Historie změn: kusy z Výroby, evidence z Auditu.
  const log = await page.evaluate(() => S.log.map(x => x.text));
  check(log.some(t => /^Audit: kusy podle operací z evidence práce vykaz-rijen\.xlsx \(5 dní, 1\. 10\. 2026 – 7\. 10\. 2026, 3 nové operace bez skupiny\)$/.test(t)), `historie: kusy z Výroby (${log.slice(0, 8).join(' | ')})`);
  check(log.some(t => /^Nahrána evidence práce za říjen 2026/.test(t)) && log.some(t => /^Nahrána evidence práce za listopad 2026/.test(t)), 'historie: evidence práce za říjen a listopad');
  check(log.some(t => /^Audit: nahrán výkaz práce vykaz-listopad\.xlsx \(3 dny, .*\); i do Výroby \(evidence práce za listopad 2026\)$/.test(t)), 'historie: výkaz v Auditu i do Výroby');

  // Telefon: dialog s volbou Výroby se vejde.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setInputFiles('#waWorkFile', files.nov);
  await page.waitForSelector('#dlg[open] .wa-toprod');
  await page.waitForTimeout(500);
  check(await overflow(page) <= 1, `telefon: přetečení ${await overflow(page)} px`);
  await page.screenshot({ path: path.join(shots, '06-telefon-dialog.png') });
  await page.click('#dlgCancel').catch(() => page.keyboard.press('Escape'));

  await browser.close();
  if (problems.length) { console.log(`PROBLÉMY (${problems.length}):\n- ${problems.join('\n- ')}`); process.exit(1); }
  console.log('e2e Výkaz ok');
})().catch(error => { console.error(error); process.exit(1); });
