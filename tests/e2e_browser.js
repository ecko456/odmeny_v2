// Prohlížečový průchod Odměnami (Playwright + Chromium): nastavení, kartička, PIN, import,
// přehled, zálohy, historie verzí, mobil, tmavý režim, export do Excelu.
//
// Spuštění proti lokálnímu serveru s čistými daty:
//   ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t odmeny odmeny/dev-router.php &
//   curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state   # vytvoří setup-token.txt
//   NO_PROXY=127.0.0.1 PW=$(npm root -g)/playwright S=$S node odmeny/tests/e2e_browser.js
// Proti Apachi: BASE=http://127.0.0.1/odmeny/ TOKEN_FILE=/var/lib/odmeny/setup-token.txt
// S = pracovní adresář pro snímky a stažené soubory.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots');
const problems = [];

function attendanceCsv() {
  const days = Array.from({ length: 31 }, (_, i) => `${i + 1}.8.2026`);
  const head = ['Jméno', 'Příjmení', 'Os. č.', 'Středisko', 'Pozn.', ...days].join(';');
  const people = [['Jiří', 'Šťastný'], ['Eva', 'Nováková'], ['Petr', 'Dvořák'], ['Lucie', 'Černá']];
  const rows = people.map(([first, last], p) => {
    const cells = days.map((_, i) => {
      const dow = new Date(2026, 7, i + 1).getDay();
      if (dow === 0 || dow === 6) return p === 2 && i === 1 ? '7,5' : '';
      if (p === 1 && i === 12) return 'OČR';
      if (p === 3 && i > 20) return '';
      return p === 0 && i === 3 ? '6' : '7,5';
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
    document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`));
  });
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await watch(page, 'desk');
  await page.goto(BASE);
  await page.waitForSelector('#setupForm');
  await page.screenshot({ path: `${shots}/01-setup.png` });
  const token = fs.readFileSync(process.env.TOKEN_FILE || path.join(S, 'odme2e', 'setup-token.txt'), 'utf8').trim();
  await page.fill('[name="token"]', token);
  await page.fill('[name="label"]', 'Vedoucí dílny');
  await page.click('#setupForm button[type="submit"]');
  await page.waitForSelector('.odm-card');
  const key = (await page.textContent('.odm-card .card-key')).trim();
  await page.screenshot({ path: `${shots}/02-card.png` });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
  const png = path.join(S, 'odm-card.png');
  await download.saveAs(png);
  await page.check('#saved');
  await page.click('#finish');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/03-overview-demo.png`, fullPage: true });
  await page.click('#ovBody tr[data-key] td.col-name');
  await page.waitForSelector('#ovBody tr.detail');
  await page.screenshot({ path: `${shots}/04-overview-detail.png`, fullPage: true });
  for (const view of ['lide', 'matice', 'sankce', 'dochazka', 'vyroba', 'pozice', 'nastaveni']) {
    await page.click(`#nav [data-view="${view}"]`);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${shots}/05-${view}.png`, fullPage: true });
  }
  await page.click('#secNewCard');
  await page.fill('#dlg [name="value"]', 'Mistr noční');
  await page.click('#dlgOk');
  await page.waitForSelector('#dlg .odm-card');
  await page.screenshot({ path: `${shots}/06-newcard.png` });
  await page.click('#dlgOk');
  await page.waitForTimeout(500);
  const cardCount = await page.locator('#secCards .sec-item').count();
  if (cardCount !== 2) problems.push(`čekal jsem 2 kartičky, je ${cardCount}`);
  // Enter v dialogu potvrdí (ne zruší)
  await page.click('#nav [data-view="lide"]');
  await page.click('#btnAddPerson');
  await page.fill('#dlg [name="value"]', 'Karel Zkušební');
  await page.press('#dlg [name="value"]', 'Enter');
  await page.waitForTimeout(300);
  if (!(await page.textContent('#lList')).includes('Zkušební Karel')) problems.push('Enter v dialogu nepřidal člověka');
  // Záloha: stáhnout a hned obnovit
  await page.click('#nav [data-view="nastaveni"]');
  await page.waitForFunction(() => document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 10000 });
  const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#dBackup')]);
  const bkPath = path.join(S, 'zaloha.odmeny');
  await bk.saveAs(bkPath);
  if (fs.readFileSync(bkPath, 'utf8').includes('Zkušební')) problems.push('záloha obsahuje čitelná jména');
  await page.setInputFiles('#dRestoreFile', bkPath);
  await page.waitForSelector('#dlg[open]');
  await page.click('#dlgOk');
  await page.waitForTimeout(400);
  if (!(await page.textContent('#toast')).includes('obnovená')) problems.push('obnova ze zálohy nehlásí úspěch');
  await page.click('#dVersions');
  await page.waitForSelector('#dlg .version');
  const versions = await page.locator('#dlg .version').count();
  if (versions < 2) problems.push(`historie má ${versions} verzí`);
  await page.screenshot({ path: `${shots}/06b-versions.png` });
  await page.click('#dlgCancel');

  // Import docházky (CSV UTF-8 s diakritikou a OČR)
  await page.click('#nav [data-view="dochazka"]');
  const csv = path.join(S, 'dochazka.csv');
  fs.writeFileSync(csv, attendanceCsv());
  await page.setInputFiles('#file', csv);
  await page.waitForSelector('#importMsg .note');
  const importText = await page.textContent('#importMsg');
  if (!/Načteno/.test(importText)) problems.push(`import: ${importText}`);
  if (!(await page.textContent('#attView')).includes('Šťastný')) problems.push('diakritika v CSV se nenačetla');
  await page.screenshot({ path: `${shots}/07-import.png`, fullPage: true });
  await page.click('#nav [data-view="lide"]');
  const names = await page.locator('#lList .list-item').count();
  for (let i = 0; i < names; i += 1) {
    await page.locator('#lList .list-item').nth(i).click();
    await page.selectOption('#pPos', { index: 1 });
    await page.locator('#lDetail .lvlopt').nth(i % 4).click();
  }
  await page.click('#nav [data-view="sankce"]');
  await page.selectOption('#sanWho', { index: 1 });
  await page.selectOption('#sanWhy', { index: 1 });
  await page.click('.pctpick label:nth-child(2)');
  await page.click('#sanAdd');
  await page.waitForSelector('#sanList table');
  await page.click('#nav [data-view="prehled"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${shots}/08-overview-real.png`, fullPage: true });
  await page.locator('#ovBody [data-issue]').first().click();
  await page.locator('#ovBody [data-adj][data-dir="1"]').first().click();
  await page.waitForFunction(() => document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 10000 });
  const occ = await page.evaluate(() => { const a = allRows().find(r => r.e.last === 'Nováková'); return a && a.att.codes; });
  if (!occ || !occ['OČR']) problems.push(`OČR kód: ${JSON.stringify(occ)}`);

  // Zamknout, přihlásit se opsaným klíčem, nastavit PIN, obnovit stránku a odemknout PINem
  await page.click('#lockBtn');
  await page.waitForSelector('#manual');
  await page.click('#manual');
  await page.fill('[name="key"]', key.toLowerCase().replace(/-/g, ' '));
  await page.click('#keyForm button[type="submit"]');
  await page.waitForSelector('#setPin');
  await page.click('#setPin');
  const pin = '739154';
  for (let round = 0; round < 2; round += 1) {
    await page.waitForSelector('.pin-pad');
    await page.waitForTimeout(150);
    for (const digit of pin) await page.click(`.pin-pad [data-digit="${digit}"]`);
  }
  await page.waitForSelector('#view-prehled.on');
  if (!(await page.textContent('#ovBody')).includes('Šťastný')) problems.push('po přihlášení chybí data');
  await page.reload();
  await page.waitForSelector('.pin-pad');
  await page.screenshot({ path: `${shots}/09-unlock.png` });
  for (const digit of '111222') await page.click(`.pin-pad [data-digit="${digit}"]`);
  await page.waitForSelector('#lockMsg .note, #lockMsg:not(:empty)');
  for (const digit of pin) await page.click(`.pin-pad [data-digit="${digit}"]`);
  await page.waitForSelector('#view-prehled.on');
  const issued = await page.locator('#ovBody .issued').count();
  if (issued !== 1) problems.push(`výdej se neuložil (${issued})`);

  // Mobil: přihlášení fotkou kartičky
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const m = await mctx.newPage();
  await watch(m, 'mobil');
  await m.goto(BASE);
  await m.waitForSelector('#photo', { state: 'attached' });
  await m.screenshot({ path: `${shots}/10-m-login.png` });
  await m.setInputFiles('#photo', png);
  await m.waitForSelector('#skip');
  await m.click('#skip');
  await m.waitForSelector('#view-prehled.on');
  await m.waitForTimeout(400);
  await m.screenshot({ path: `${shots}/11-m-overview.png`, fullPage: true });
  await m.locator('#ovBody tr[data-key]').first().click({ position: { x: 20, y: 12 } });
  await m.waitForSelector('#ovBody tr.detail');
  await m.screenshot({ path: `${shots}/12-m-detail.png`, fullPage: true });
  for (const view of ['lide', 'matice', 'sankce', 'dochazka', 'pozice', 'nastaveni']) {
    await m.click(`#nav [data-view="${view}"]`);
    await m.waitForTimeout(350);
    await m.screenshot({ path: `${shots}/13-m-${view}.png`, fullPage: true });
  }
  await m.click('#nav [data-view="lide"]');
  await m.locator('#lList .list-item').first().click();
  await m.waitForTimeout(250);
  await m.screenshot({ path: `${shots}/14-m-person.png`, fullPage: true });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) problems.push(`mobil: vodorovné přetečení ${overflow}px`);

  // Tmavý režim a export do Excelu pod CSP (SheetJS)
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'dark' });
  const d = await dctx.newPage();
  await watch(d, 'tmavy');
  await d.goto(BASE);
  await d.waitForSelector('#manual');
  await d.click('#manual');
  await d.fill('[name="key"]', key);
  await d.click('#keyForm button[type="submit"]');
  await d.waitForSelector('#skip');
  await d.click('#skip');
  await d.waitForSelector('#view-prehled.on');
  await d.waitForTimeout(400);
  await d.screenshot({ path: `${shots}/15-dark.png`, fullPage: true });
  const [xl] = await Promise.all([d.waitForEvent('download'), d.click('#btnXlsx')]);
  const xlPath = path.join(S, 'odm-export.xlsx');
  await xl.saveAs(xlPath);
  if (fs.statSync(xlPath).size < 2000) problems.push('xlsx export je podezřele malý');

  await browser.close();
  console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'e2e ok');
})().catch(error => { console.error(error); console.log(problems.join('\n')); process.exit(1); });
