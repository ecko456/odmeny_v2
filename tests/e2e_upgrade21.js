// Test aktualizace 2.0 → 2.1 bez ztráty dat na skutečném Apachi, v jednom běhu:
//   1. ve verzi 2.0 vytvoří data (docházka, výroba, zařazení, zaučení, sankce, úprava, výdej,
//      osobní nastavení, druhá kartička, historie změn) a uloží si celý sdílený stav;
//   2. nechá otevřenou starou stránku a spustí instalaci nové verze (UPGRADE_CMD);
//   3. stará stránka už nesmí nic uložit (426, výzva k obnovení);
//   4. ve 2.1 porovná sdílený stav položku po položce, osobní nastavení a výpočty,
//      pak vyzkouší novinky nad převzatými daty.
// Postup je v odmeny/README.md (Vývoj a testy). Proměnné: PW, S, BASE, UPGRADE_CMD.
const { chromium } = require(process.env.PW);
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const XLSX = require('../private/vendor/xlsx.full.min.js');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1/odmeny/';
const shots = path.join(S, 'ushots21');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };
const PEOPLE = [['Jiří', 'Šťastný'], ['Eva', 'Nováková'], ['Petr', 'Dvořák'], ['Lucie', 'Černá']];

function weekdays(fn) {
  for (let d = 1; d <= 31; d += 1) { const dow = new Date(2026, 7, d).getDay(); if (dow !== 0 && dow !== 6) fn(d); }
}
function attendanceCsv() {
  const days = Array.from({ length: 31 }, (_, i) => `${i + 1}.8.2026`);
  const head = ['Jméno', 'Příjmení', 'Os. č.', 'Středisko', 'Pozn.', ...days].join(';');
  return [head, ...PEOPLE.map(([first, last], p) => [first, last, 100 + p, 'D1', '', ...days.map((_, i) => {
    const dow = new Date(2026, 7, i + 1).getDay();
    if (dow === 0 || dow === 6) return p === 2 && i === 1 ? '7,5' : '';
    if (p === 1 && i === 12) return 'OČR';
    if (p === 3 && i > 20) return '';
    return '7,5';
  })].join(';'))].join('\r\n');
}
/** Evidence práce ve formátu verze 2.0: jméno C, datum D, kusy E, bez hlavičky. */
function productionCsvOld() {
  const rows = [];
  weekdays(d => PEOPLE.forEach(([first, last], p) => rows.push(['', '', `${first} ${last}`, `${d}.8.2026`, String(10 + p)].join(';'))));
  return rows.join('\r\n');
}
/** Evidence práce pro 2.1: hlavička, strávený čas a norma v minutách. */
function productionXlsxNew(file) {
  const rows = [['Zakázka', 'Pracovník', 'Datum', 'Kusy', 'Strávený čas (min)', 'Norma (min)']];
  weekdays(d => PEOPLE.forEach(([first, last], p) => rows.push([`Z${d}`, `${first} ${last}`, `${d}.8.2026`, 10 + p, 400 - p * 30, 420 - p * 40])));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Evidence');
  fs.writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

async function watch(page, label, allow426 = false) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  page.on('pageerror', err => problems.push(`${label} pageerror: ${err.message}`));
  page.on('response', r => {
    if (r.status() < 400) return;
    if (r.status() === 403 && /action=unlock/.test(r.url())) return;
    if (allow426 && r.status() === 426) return;
    problems.push(`${label} HTTP ${r.status()} ${r.url()}`);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`));
  });
}
const saved = page => page.waitForFunction(() => document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 15000 });
async function login(page, key) {
  await page.goto(BASE);
  await page.waitForSelector('#manual');
  await page.click('#manual');
  await page.fill('[name="key"]', key);
  await page.click('#keyForm button[type="submit"]');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');
  await page.waitForTimeout(500);
}
/** Sdílený stav bez polí, která přidala 2.1, s klíči v pevném pořadí. */
const SNAPSHOT = `(() => {
  const c = JSON.parse(JSON.stringify(sharedState(S)));
  c.positions.forEach(p => { delete p.onlyKafe; p.levels.forEach(l => { delete l.raise; delete l.minAtt; delete l.minNorm; delete l.minUse; }); });
  if (c.settings) delete c.settings.prodCols;
  Object.values(c.production || {}).forEach(pp => { delete pp.time; });
  delete c.v;
  const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
  return JSON.stringify(canon(c));
})()`;
const SUMMARY = `JSON.stringify(allRows().map(r => [r.e.key, r.total, r.kafe, r.pen, r.adj, !!r.issued, r.L.n, r.pos && r.pos.id]).sort())`;

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const old = await ctx.newPage();
  await watch(old, 'stará', true);

  // ---- 1. data ve verzi 2.0 ----
  await old.goto(BASE);
  await old.waitForSelector('#setupForm');
  await old.fill('[name="token"]', fs.readFileSync(process.env.TOKEN_FILE || '/var/lib/odmeny/setup-token.txt', 'utf8').trim());
  await old.fill('[name="label"]', 'Vedoucí dílny');
  await old.click('#setupForm button[type="submit"]');
  await old.waitForSelector('.odm-card');
  const keyA = (await old.textContent('.odm-card .card-key')).trim();
  await old.check('#saved');
  await old.click('#finish');
  await old.waitForSelector('#skip');
  await old.click('#skip');
  await old.waitForSelector('#view-prehled.on');
  check(/2\.0/.test(await old.evaluate(() => ui.me.version)), 'výchozí verze není 2.0');
  await old.click('#nav [data-view="dochazka"]');
  fs.writeFileSync(path.join(S, 'u21-dochazka.csv'), attendanceCsv());
  await old.setInputFiles('#file', path.join(S, 'u21-dochazka.csv'));
  await old.waitForSelector('#importMsg .note');
  if (await old.isVisible('#dlg[open]')) await old.click('#dlgOk');
  await old.waitForTimeout(300);
  await old.click('#nav [data-view="vyroba"]');
  fs.writeFileSync(path.join(S, 'u21-vyroba.csv'), productionCsvOld());
  await old.setInputFiles('#pfile', path.join(S, 'u21-vyroba.csv'));
  await old.waitForSelector('#prodMsg .note');
  await old.click('#nav [data-view="lide"]');
  for (let i = 0; i < 4; i += 1) {
    await old.locator('#lList .list-item').nth(i).click();
    await old.selectOption('#pPos', { index: 1 + (i % 2) });
    await old.locator('#lDetail .lvlopt').nth(3 - i).click();
  }
  await old.locator('#lDetail [data-skill][data-lvl="2"]').first().click();
  await old.click('#nav [data-view="sankce"]');
  await old.selectOption('#sanWho', { index: 1 });
  await old.selectOption('#sanWhy', { index: 1 });
  await old.click('#sanAdd');
  await old.click('#nav [data-view="prehled"]');
  await old.waitForTimeout(300);
  await old.locator('#ovBody [data-issue]').first().click();
  await old.locator('#ovBody [data-adj][data-dir="1"]').nth(1).click();
  await old.click('#colPick summary');
  await old.locator('#colPanel [data-col="wk"]').uncheck();
  await old.keyboard.press('Escape');
  await old.selectOption('#ovPos', { index: 1 });
  await saved(old);
  await old.click('#nav [data-view="nastaveni"]');
  await old.click('#secNewCard');
  await old.fill('#dlg [name="value"]', 'Mistr noční');
  await old.click('#dlgOk');
  await old.waitForSelector('#dlg .odm-card');
  const keyB = (await old.textContent('#dlg .odm-card .card-key')).trim();
  await old.click('#dlgOk');
  await old.click('#nav [data-view="prehled"]');
  await saved(old);
  await old.waitForTimeout(1500); // osobní nastavení se ukládá se zpožděním
  // Stav, jak ho verze 2.0 uložila a znovu načte (čerstvé přihlášení ve 2.0).
  const ctx0 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const reread = await ctx0.newPage();
  await watch(reread, '2.0 znovu');
  await login(reread, keyA);
  const before = await reread.evaluate(SNAPSHOT);
  const beforeRows = await reread.evaluate(SUMMARY);
  const beforeLog = await reread.evaluate(() => S.log.length);
  const beforeRev = await reread.evaluate(() => store.rev);
  await ctx0.close();
  check(beforeLog >= 1, `ve 2.0 chybí historie změn: ${beforeLog}`);
  await old.screenshot({ path: `${shots}/01-old.png`, fullPage: true });

  // ---- 2. aktualizace, stará stránka zůstává otevřená ----
  execSync(process.env.UPGRADE_CMD || 'bash odmeny/deploy/install.sh', { stdio: 'inherit' });

  // ---- 3. stará stránka nesmí uložit ----
  await old.locator('#ovBody [data-adj][data-dir="1"]').first().click();
  await old.waitForSelector('#dlg[open]', { timeout: 15000 });
  const oldDialog = await old.textContent('#dlg');
  check(/Aplikace byla aktualizována/.test(oldDialog), `stará stránka: ${oldDialog.slice(0, 120)}`);
  await old.screenshot({ path: `${shots}/02-old-after-upgrade.png` });

  // ---- 4. nová verze: stejná data ----
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx2.newPage();
  await watch(page, 'nová');
  await login(page, keyA);
  check(/2\.1/.test(await page.evaluate(() => ui.me.version)), 'po aktualizaci neběží 2.1');
  const after = await page.evaluate(SNAPSHOT);
  fs.writeFileSync(path.join(S, 'u21-before.json'), before);
  fs.writeFileSync(path.join(S, 'u21-after.json'), after);
  if (after !== before) {
    const a = JSON.parse(before), b = JSON.parse(after);
    const diff = Object.keys({ ...a, ...b }).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    problems.push(`sdílená data se po aktualizaci liší v: ${diff.join(', ')}`);
  }
  check(await page.evaluate(SUMMARY) === beforeRows, 'výpočty tabáků, Kafe nebo výdeje se po aktualizaci liší');
  check(await page.evaluate(() => store.rev) === beforeRev, 'stará stránka po aktualizaci něco uložila');
  check(await page.evaluate(() => S.log.length) === beforeLog, 'historie změn se po aktualizaci liší');
  check(await page.inputValue('#ovPos') !== '', 'osobní filtr pozice se ztratil');
  check((await page.locator('#ovHead .col-wk').count()) === 0, 'osobně skrytý sloupec se ztratil');
  check((await page.locator('#ovHead .col-raise').count()) === 0, 'sloupec Plat bez nastaveného navýšení');
  await page.screenshot({ path: `${shots}/03-new.png`, fullPage: true });

  // ---- novinky nad převzatými daty ----
  await page.click('#nav [data-view="pozice"]');
  await page.locator('#posList .list-item').first().click();
  for (const [i, raise] of [[1, 5], [2, 10], [3, 15]]) {
    await page.locator(`#posEditor [data-li="${i}"] [data-lraise]`).fill(String(raise));
    await page.locator(`#posEditor [data-li="${i}"] [data-lraise]`).dispatchEvent('change');
    const norm = page.locator(`#posEditor [data-li="${i}"] [data-lmin="minNorm"]`);
    await norm.fill('90');
    await norm.dispatchEvent('change');
  }
  await page.locator('#posList .list-item').nth(1).click();
  await page.check('#posOnlyKafe');
  await saved(page);
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#btnRulesPdf')]);
  await pdf.saveAs(path.join(S, 'u21-pravidla.pdf'));
  check(fs.readFileSync(path.join(S, 'u21-pravidla.pdf')).slice(0, 5).toString() === '%PDF-', 'PDF s pravidly se nestáhlo');
  await page.click('#nav [data-view="vyroba"]');
  productionXlsxNew(path.join(S, 'u21-vyroba.xlsx'));
  await page.setInputFiles('#pfile', path.join(S, 'u21-vyroba.xlsx'));
  await page.waitForSelector('#dlg[open] #prodColsPreview');
  await page.click('#dlgOk');
  await page.waitForSelector('#prodMsg .note.i');
  await saved(page);
  await page.click('#nav [data-view="prehled"]');
  await page.waitForTimeout(300);
  check((await page.locator('#ovHead .col-raise').count()) === 1, 'po nastavení chybí sloupec Plat');
  const kept = await page.evaluate(() => {
    const r = allRows();
    return { sanctions: S.sanctions.length, issued: Object.keys(S.issued[S.current] || {}).length, adjust: Object.keys(S.adjust[S.current] || {}).length,
      skills: Object.values(S.employees).filter(e => e.skills).length, onlyKafe: r.filter(x => x.kafeOnly).length, raised: r.filter(x => x.raise.pct > 0).length };
  });
  check(kept.sanctions === 1 && kept.issued === 1 && kept.adjust === 1 && kept.skills === 1, `převzatá data po novinkách: ${JSON.stringify(kept)}`);
  check(kept.onlyKafe === 2 && kept.raised > 0, `novinky: ${JSON.stringify(kept)}`);
  await page.screenshot({ path: `${shots}/04-new-features.png`, fullPage: true });

  // druhá kartička: vlastní výchozí nastavení a vidí změny jako nové
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'dark' });
  const p2 = await ctx3.newPage();
  await watch(p2, 'kolega');
  await login(p2, keyB);
  check(await p2.inputValue('#ovPos') === '', 'druhá kartička převzala filtr první');
  check(Number(await p2.textContent('#logBadge')) > 0, 'druhá kartička nevidí nové změny');
  await p2.screenshot({ path: `${shots}/05-m-kolega.png`, fullPage: true });

  await browser.close();
  console.log(problems.length ? `PROBLÉMY:\n${problems.join('\n')}` : 'upgrade 2.0 → 2.1 ok');
  if (problems.length) process.exit(1);
})().catch(error => { console.error(error); console.log(problems.join('\n')); process.exit(1); });
