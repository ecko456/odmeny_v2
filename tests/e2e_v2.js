// Prohlížečový průchod novinkami verze 2.0: osobní nastavení pro každou kartičku,
// historie změn (kdo, co, kdy, odznak nových), matice dovedností a profil člověka
// přes více měsíců. Spuštění stejně jako e2e_browser.js (čistá data):
//   ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t . dev-router.php &
//   curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state
//   NO_PROXY=127.0.0.1 PW=$(npm root -g)/playwright S=$S node tests/e2e_v2.js
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-v2');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

/** Docházka za měsíc ve formátu exportu (středníky, Windows konce řádků). */
function attendanceCsv(year, month) {
  const count = new Date(year, month, 0).getDate();
  const days = Array.from({ length: count }, (_, i) => `${i + 1}.${month}.${year}`);
  const head = ['Jméno', 'Příjmení', 'Os. č.', 'Středisko', 'Pozn.', ...days].join(';');
  const people = [['Jiří', 'Šťastný'], ['Eva', 'Nováková'], ['Petr', 'Dvořák'], ['Lucie', 'Černá']];
  const rows = people.map(([first, last], p) => {
    const cells = days.map((_, i) => {
      const dow = new Date(year, month - 1, i + 1).getDay();
      if (dow === 0 || dow === 6) return '';
      if (p === 3 && month === 8 && i > 18) return '';
      if (p === 1 && i === 9) return 'OČR';
      return '7,5';
    });
    return [first, last, 100 + p, 'D1', '', ...cells].join(';');
  });
  return [head, ...rows].join('\r\n');
}

async function watch(page, label) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  page.on('response', r => { if (r.status() >= 400 && !(r.status() === 403 && /action=unlock/.test(r.url()))) problems.push(`${label} HTTP ${r.status()} ${r.url()}`); });
  page.on('pageerror', err => problems.push(`${label} pageerror: ${err.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`));
  });
}

const saved = page => page.waitForFunction(() => document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 10000 });

async function loginWithKey(page, key) {
  await page.waitForSelector('#manual');
  await page.click('#manual');
  await page.fill('[name="key"]', key);
  await page.click('#keyForm button[type="submit"]');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');
  await page.waitForTimeout(400);
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await watch(page, 'v2');
  await page.goto(BASE);
  await page.waitForSelector('#setupForm');
  const token = fs.readFileSync(process.env.TOKEN_FILE || path.join(S, 'odme2e', 'setup-token.txt'), 'utf8').trim();
  await page.fill('[name="token"]', token);
  await page.fill('[name="label"]', 'Vedoucí dílny');
  await page.click('#setupForm button[type="submit"]');
  await page.waitForSelector('.odm-card');
  const keyA = (await page.textContent('.odm-card .card-key')).trim();
  await page.check('#saved');
  await page.click('#finish');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');

  // Dva měsíce docházky, zařazení a úrovně.
  await page.click('#nav [data-view="dochazka"]');
  for (const [year, month] of [[2026, 7], [2026, 8]]) {
    const csv = path.join(S, `dochazka-${month}.csv`);
    fs.writeFileSync(csv, attendanceCsv(year, month));
    await page.setInputFiles('#file', csv);
    await page.waitForSelector('#importMsg .note');
    if (await page.isVisible('#dlg[open]')) await page.click('#dlgOk');
    await page.waitForTimeout(400);
  }
  await page.click('#nav [data-view="lide"]');
  const count = await page.locator('#lList .list-item').count();
  for (let i = 0; i < count; i += 1) {
    await page.locator('#lList .list-item').nth(i).click();
    await page.selectOption('#pPos', { index: 1 });
    await page.locator('#lDetail .lvlopt').nth(i % 4).click();
  }
  await saved(page);

  // Druhá kartička.
  await page.click('#nav [data-view="nastaveni"]');
  await page.click('#secNewCard');
  await page.fill('#dlg [name="value"]', 'Mistr noční');
  await page.click('#dlgOk');
  await page.waitForSelector('#dlg .odm-card');
  const keyB = (await page.textContent('#dlg .odm-card .card-key')).trim();
  await page.click('#dlgOk');
  await page.waitForTimeout(400);

  // Osobní nastavení kartičky A: jen nevydané, skrytý sloupec, profil 3 měsíce.
  await page.click('#nav [data-view="prehled"]');
  await page.check('#ovOnlyOpen');
  await page.click('#colPick summary');
  const column = page.locator('#colPanel [data-col]').first();
  const hiddenKey = await column.getAttribute('data-col');
  await column.uncheck();
  await page.keyboard.press('Escape');
  // Změna dat: ruční úprava tabáků u prvního člověka.
  await page.locator('#ovBody [data-adj][data-dir="1"]').first().click();
  await saved(page);
  await page.waitForTimeout(1200); // osobní nastavení se ukládá se zpožděním

  // Kartička B: vlastní výchozí nastavení, vidí změny od A v historii (odznak).
  await page.click('#lockBtn');
  await loginWithKey(page, keyB);
  check(!(await page.isChecked('#ovOnlyOpen')), 'kartička B převzala filtr kartičky A');
  const badge = await page.textContent('#logBadge');
  check(!(await page.isHidden('#logBadge')) && Number(badge) > 0, `odznak nových změn pro B: „${badge}“`);
  await page.screenshot({ path: `${shots}/01-b-overview.png` });
  await page.click('#logBtn');
  await page.waitForSelector('#logList .log-item');
  const logText = await page.textContent('#logList');
  check(/Vedoucí dílny/.test(logText), 'historie neukazuje, kdo změnu udělal');
  check(/nové/.test(logText), 'historie neoznačuje nové změny');
  await page.screenshot({ path: `${shots}/02-log.png` });
  await page.click('#dlgCancel');
  check(await page.isHidden('#logBadge'), 'odznak nezmizel po otevření historie');
  // Kartička B změní vlastní nastavení (nesmí přepsat A) a upraví data.
  await page.check('#ovOnlyImported').catch(() => {});
  await page.locator('#ovBody [data-adj][data-dir="-1"]').first().click();
  await saved(page);
  await page.waitForTimeout(1200);

  // Zpět kartička A: její nastavení zůstalo.
  await page.click('#lockBtn');
  await loginWithKey(page, keyA);
  check(await page.isChecked('#ovOnlyOpen'), 'kartička A ztratila vlastní filtr');
  await page.click('#colPick summary');
  check(!(await page.isChecked(`#colPanel [data-col="${hiddenKey}"]`)), 'kartička A ztratila skrytý sloupec');
  await page.keyboard.press('Escape');
  check(!(await page.isHidden('#logBadge')), 'A nevidí změnu od B');

  // Matice a profil.
  await page.click('#nav [data-view="matice"]');
  await page.waitForSelector('#matrixView .matrix');
  await page.locator('#matrixView .mx-btn').first().click();
  await saved(page);
  await page.screenshot({ path: `${shots}/03-matrix.png`, fullPage: true });
  await page.locator('#matrixView [data-profile]').first().click();
  await page.waitForSelector('#view-profil.on');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/04-profile.png`, fullPage: true });
  const profileText = await page.textContent('#profileView');
  check(/2026/.test(profileText), 'profil bez měsíců');
  await page.click('#profileView [data-range="custom"]');
  await page.fill('#pfFrom', '2026-07');
  await page.fill('#pfTo', '2026-07');
  await page.dispatchEvent('#pfTo', 'change');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/05-profile-july.png`, fullPage: true });
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.click('#profileView [data-profile-xlsx], #profileView .btn:has-text("Excel")').catch(() => null)]);
  check(download !== null, 'export profilu do Excelu se nestáhl');

  // Mobil a tmavý režim: profil a historie.
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const m = await mctx.newPage();
  await watch(m, 'mobil');
  await m.goto(BASE);
  await loginWithKey(m, keyB);
  await m.click('#nav [data-view="matice"]');
  await m.waitForSelector('#matrixView .matrix');
  await m.locator('#matrixView [data-profile]').first().click();
  await m.waitForSelector('#view-profil.on');
  await m.waitForTimeout(400);
  await m.screenshot({ path: `${shots}/06-m-dark-profile.png`, fullPage: true });
  await m.click('#logBtn');
  await m.waitForSelector('#logList .log-item');
  await m.screenshot({ path: `${shots}/07-m-dark-log.png` });

  await browser.close();
  if (problems.length) {
    console.error('PROBLÉMY:\n' + problems.join('\n'));
    process.exit(1);
  }
  console.log('e2e v2 ok');
})().catch(error => { console.error('FAIL', error); process.exit(1); });
