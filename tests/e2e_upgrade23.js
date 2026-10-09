// Test aktualizace 2.2 → 2.3 (Kontroly: nutné úkony a namátkové kontroly) bez ztráty dat na Apachi:
//   1. ve verzi 2.2 vytvoří data (docházka, evidence práce s časem a normou, zařazení, zaučení,
//      sankce, úprava, výdej, osobní nastavení, druhá kartička, Top 5 s případem) a uloží si stav;
//   2. nechá otevřenou starou stránku a spustí instalaci nové verze (UPGRADE_CMD);
//   3. stará stránka už nesmí nic uložit (426, výzva k obnovení);
//   4. ve 2.3 porovná sdílený stav položku po položce, výpočty a historii změn,
//      pak zapíše nutné úkony, vygeneruje plán kontrol a zapíše kontrolu nad převzatými daty.
// Spuštění v kontejneru (lokální Apache, nikdy ne na ostrém serveru):
//   git archive 28d6bde | tar -x -C $S/v22 && sudo bash $S/v22/deploy/install.sh
//   NO_PROXY=127.0.0.1 PW=… S=$S UPGRADE_CMD='bash deploy/install.sh' node tests/e2e_upgrade23.js
const { chromium } = require(process.env.PW);
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const XLSX = require('../private/vendor/xlsx.full.min.js');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1/odmeny_v2/';
const shots = path.join(S, 'ushots23');
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
/** Evidence práce: hlavička, strávený čas a norma v minutách. */
function productionXlsx(file) {
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
const saved = page => page.waitForFunction(() => !store.dirty && !store.saving && document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 15000 });
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
/** Sdílený stav bez polí, která přidala 2.3, s klíči v pevném pořadí. */
const SNAPSHOT = `(() => {
  const c = JSON.parse(JSON.stringify(sharedState(S)));
  delete c.audit; delete c.v;
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

  // ---- 1. data ve verzi 2.2 ----
  await old.goto(BASE);
  await old.waitForSelector('#setupForm');
  await old.fill('[name="token"]', fs.readFileSync(process.env.TOKEN_FILE || '/var/lib/odmeny_v2/setup-token.txt', 'utf8').trim());
  await old.fill('[name="label"]', 'Vedoucí dílny');
  await old.click('#setupForm button[type="submit"]');
  await old.waitForSelector('.odm-card');
  const keyA = (await old.textContent('.odm-card .card-key')).trim();
  await old.check('#saved');
  await old.click('#finish');
  await old.waitForSelector('#skip');
  await old.click('#skip');
  await old.waitForSelector('#view-prehled.on');
  check(/2\.2/.test(await old.evaluate(() => ui.me.version)), `výchozí verze není 2.2: ${await old.evaluate(() => ui.me.version)}`);
  check(!(await old.$('#nav [data-view="kontroly"]')), 've 2.2 nemají být Kontroly');
  await old.click('#nav [data-view="dochazka"]');
  fs.writeFileSync(path.join(S, 'u23-dochazka.csv'), attendanceCsv());
  await old.setInputFiles('#file', path.join(S, 'u23-dochazka.csv'));
  await old.waitForSelector('#importMsg .note');
  if (await old.isVisible('#dlg[open]')) await old.click('#dlgOk');
  await old.waitForTimeout(300);
  await old.click('#nav [data-view="vyroba"]');
  productionXlsx(path.join(S, 'u23-vyroba.xlsx'));
  await old.setInputFiles('#pfile', path.join(S, 'u23-vyroba.xlsx'));
  await old.waitForSelector('#dlg[open] #prodColsPreview');
  await old.click('#dlgOk');
  await old.waitForSelector('#prodMsg .note.i');
  await old.click('#nav [data-view="lide"]');
  for (let i = 0; i < 4; i += 1) {
    await old.locator('#lList .list-item').nth(i).click();
    await old.selectOption('#pPos', { index: 1 + (i % 2) });
    await old.locator('#lDetail .lvlopt').nth(3 - i).click();
  }
  await old.locator('#lDetail [data-skill][data-lvl="2"]').first().click();
  // Top 5 ve 2.2: řádek týdne a případ s příčinou
  await old.click('#nav [data-view="top5"]');
  await old.click('[data-entadd]');
  const ent = await old.evaluate(() => document.activeElement.closest('[data-ent]').dataset.ent);
  for (const [ef, value] of [['ean', '8590001000011'], ['name', 'Držák levý'], ['spent', '20'], ['norm', '9']]) {
    await old.fill(`[data-ent="${ent}"] [data-ef="${ef}"]`, value);
    await old.press(`[data-ent="${ent}"] [data-ef="${ef}"]`, 'Tab');
    await old.waitForTimeout(80);
  }
  await old.click('[data-t5new="8590001000011"]');
  await old.waitForSelector('.t5-case-head');
  await old.fill('[data-rf="cause"]', 'Chybí přípravek.');
  await old.press('[data-rf="cause"]', 'Tab');
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
  await old.click('#dlgOk');
  await old.click('#nav [data-view="prehled"]');
  await saved(old);
  await old.waitForTimeout(1500); // osobní nastavení se ukládá se zpožděním
  // Stav, jak ho verze 2.2 uložila a znovu načte (čerstvé přihlášení ve 2.2).
  const ctx0 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const reread = await ctx0.newPage();
  await watch(reread, '2.2 znovu');
  await login(reread, keyA);
  const before = await reread.evaluate(SNAPSHOT);
  const beforeRows = await reread.evaluate(SUMMARY);
  const beforeLog = await reread.evaluate(() => S.log.length);
  const beforeRev = await reread.evaluate(() => store.rev);
  await ctx0.close();
  check(beforeLog >= 1, `ve 2.2 chybí historie změn: ${beforeLog}`);
  check(/"eff":\{[^]*"8590001000011"/.test(before), 've 2.2 se neuložil Top 5');
  await old.screenshot({ path: `${shots}/01-old.png`, fullPage: true });

  // ---- 2. aktualizace, stará stránka zůstává otevřená ----
  execSync(process.env.UPGRADE_CMD || 'bash deploy/install.sh', { stdio: 'inherit' });

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
  check(/2\.3/.test(await page.evaluate(() => ui.me.version)), 'po aktualizaci neběží 2.3');
  const after = await page.evaluate(SNAPSHOT);
  fs.writeFileSync(path.join(S, 'u23-before.json'), before);
  fs.writeFileSync(path.join(S, 'u23-after.json'), after);
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
  await page.screenshot({ path: `${shots}/03-new.png`, fullPage: true });

  // ---- Kontroly nad převzatými daty ----
  await page.click('#nav [data-view="kontroly"]');
  check(/zatím není/.test(await page.textContent('#ktView')), 'Kontroly po aktualizaci nezačínají prázdné');
  await page.click('#ktTabs [data-kttab="tasks"]');
  const depts = await page.$$eval('[data-ktdept]', x => x.map(c => c.dataset.ktdept));
  for (const d of depts) {
    await page.fill(`[data-ktdept="${d}"] [data-ktnew]`, 'Kontrola prvního kusu');
    await page.click(`[data-ktdept="${d}"] [data-ktaddtask]`);
    await page.waitForTimeout(100);
  }
  await page.click('#ktTabs [data-kttab="plan"]');
  await page.click('[data-ktgen]');
  await page.waitForSelector('.kt-days');
  const firstItem = await page.getAttribute('.kt-card [data-ktcheck]', 'data-ktcheck');
  await page.click(`[data-ktcheck="${firstItem}"]`);
  await page.waitForSelector('#dlg[open] .kt-points');
  await page.click('#ktAllOk');
  await page.click('#dlgOk');
  await page.waitForSelector(`[data-ktitem="${firstItem}"].ok`);
  await saved(page);
  await page.screenshot({ path: `${shots}/04-kontroly.png`, fullPage: true });
  const ctx4 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const again = await ctx4.newPage();
  await watch(again, '2.3 znovu');
  await login(again, keyA);
  const audit = await again.evaluate(() => ({ tasks: Object.keys(S.audit.tasks).length, items: Object.values(S.audit.plans).flatMap(p => p.items).length,
    done: Object.values(S.audit.plans).flatMap(p => p.items).filter(i => i.state === 'done').length, cases: S.eff.cases.map(c => c.rounds[0].cause) }));
  check(audit.tasks === depts.length && audit.items === 2 && audit.done === 1 && JSON.stringify(audit.cases) === '["Chybí přípravek."]', `Kontroly po uložení: ${JSON.stringify(audit)}`);
  const kept = await again.evaluate(SNAPSHOT);
  const noLog = j => { const o = JSON.parse(j); delete o.log; return JSON.stringify(o); }; // historie změn přibývá, to je v pořádku
  check(noLog(kept) === noLog(before), 'zápis kontrol změnil převzatá data');
  await ctx4.close();

  await browser.close();
  console.log(problems.length ? `PROBLÉMY:\n${problems.join('\n')}` : 'upgrade 2.2 → 2.3 ok');
  if (problems.length) process.exit(1);
})().catch(error => { console.error(error); console.log(problems.join('\n')); process.exit(1); });
