// Test aktualizace bez ztráty dat na skutečném Apachi: node e2e_upgrade.js old|new
//   old = na nainstalované staré verzi (1.0): nastavení, import, zařazení, sankce, skrytý sloupec.
//   new = po `sudo bash odmeny/deploy/install.sh` s novou verzí: stejná data, převedené osobní
//         nastavení, historie změn, matice dovedností, profil, druhá kartička s vlastním nastavením.
// Postup je popsaný v odmeny/README.md (Vývoj a testy). Proměnné: PW (cesta k playwright), S (pracovní
// adresář), BASE (výchozí http://127.0.0.1/odmeny/).
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1/odmeny/';
const MODE = process.argv[2];
const shots = path.join(S, 'ushots');
const keyFile = path.join(S, 'upgrade-key.txt');
const problems = [];

function csv() {
  const days = Array.from({ length: 31 }, (_, i) => `${i + 1}.8.2026`);
  const head = ['Jméno', 'Příjmení', 'Os. č.', 'Středisko', 'Pozn.', ...days].join(';');
  const people = [['Jiří', 'Šťastný'], ['Eva', 'Nováková'], ['Petr', 'Dvořák'], ['Lucie', 'Černá']];
  return [head, ...people.map(([first, last], p) => [first, last, 1, 'D', '', ...days.map((_, i) => {
    const dow = new Date(2026, 7, i + 1).getDay();
    if (dow === 0 || dow === 6) return p === 2 && i === 1 ? '7,5' : '';
    if (p === 1 && i === 12) return 'OČR';
    if (p === 3 && i > 20) return '';
    return '7,5';
  })].join(';'))].join('\r\n');
}

async function watch(page, label) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  page.on('pageerror', err => problems.push(`${label} pageerror: ${err.message}`));
  page.on('response', r => { if (r.status() >= 400 && !(r.status() === 403 && /action=unlock/.test(r.url()))) problems.push(`${label} HTTP ${r.status()} ${r.url()}`); });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`));
  });
}

async function login(page, key) {
  await page.goto(BASE);
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
  await watch(page, MODE);

  if (MODE === 'old') {
    await page.goto(BASE);
    await page.waitForSelector('#setupForm');
    await page.fill('[name="token"]', fs.readFileSync(process.env.TOKEN_FILE || '/var/lib/odmeny/setup-token.txt', 'utf8').trim());
    await page.fill('[name="label"]', 'Vedoucí dílny');
    await page.click('#setupForm button[type="submit"]');
    await page.waitForSelector('.odm-card');
    fs.writeFileSync(keyFile, (await page.textContent('.odm-card .card-key')).trim());
    await page.check('#saved');
    await page.click('#finish');
    await page.waitForSelector('#skip');
    await page.click('#skip');
    await page.waitForSelector('#view-prehled.on');
    await page.click('#nav [data-view="dochazka"]');
    const file = path.join(S, 'upgrade.csv');
    fs.writeFileSync(file, csv());
    await page.setInputFiles('#file', file);
    await page.waitForSelector('#importMsg .note');
    await page.click('#nav [data-view="lide"]');
    const n = await page.locator('#lList .list-item').count();
    for (let i = 0; i < n; i += 1) {
      await page.locator('#lList .list-item').nth(i).click();
      await page.selectOption('#pPos', { index: 1 + (i % 2) });
      await page.locator('#lDetail .lvlopt').nth(i % 4).click();
    }
    await page.click('#nav [data-view="sankce"]');
    await page.selectOption('#sanWho', { index: 1 });
    await page.selectOption('#sanWhy', { index: 1 });
    await page.click('#sanAdd');
    await page.click('#nav [data-view="prehled"]');
    await page.click('#colSum');
    await page.uncheck('#colPanel [data-col="wk"]');
    await page.waitForFunction(() => document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 15000 });
    const summary = await page.evaluate(() => ({ people: Object.keys(S.employees).length, sanctions: S.sanctions.length, total: allRows().reduce((x, r) => x + r.total, 0) }));
    fs.writeFileSync(path.join(S, 'upgrade-before.json'), JSON.stringify(summary));
    await page.screenshot({ path: `${shots}/old.png`, fullPage: true });
  } else {
    const key = fs.readFileSync(keyFile, 'utf8').trim();
    const before = JSON.parse(fs.readFileSync(path.join(S, 'upgrade-before.json'), 'utf8'));
    await login(page, key);
    const after = await page.evaluate(() => ({ people: Object.keys(S.employees).length, sanctions: S.sanctions.length, total: allRows().reduce((x, r) => x + r.total, 0) }));
    if (JSON.stringify(after) !== JSON.stringify(before)) problems.push(`data se liší: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    if (await page.locator('#ovHead .col-wk').count()) problems.push('skrytý sloupec se nepřevedl do osobního nastavení');
    if (!(await page.textContent('#setSecurity')).includes('2.0')) problems.push('verze 2.0 není vidět v nastavení');
    // druhá kartička vydaná ještě před změnami: změny první kartičky pak uvidí jako nové
    await page.click('#nav [data-view="nastaveni"]');
    await page.click('#secNewCard');
    await page.fill('#dlg [name="value"]', 'Kolega');
    await page.press('#dlg [name="value"]', 'Enter');
    await page.waitForSelector('#dlg .odm-card');
    const key2 = (await page.textContent('#dlg .card-key')).trim();
    await page.click('#dlgOk');
    await page.waitForTimeout(1200);
    await page.click('#nav [data-view="prehled"]');
    // osobní filtr: pozice a řazení se uloží jen pro tuto kartičku
    await page.selectOption('#ovPos', { index: 1 });
    await page.click('#ovHead [data-sort="name"]');
    // ruční změna → historie změn
    await page.click('#nav [data-view="lide"]');
    await page.locator('#lList .list-item').first().click();
    await page.locator('#lDetail .lvlopt').nth(3).click();
    await page.locator('#lDetail [data-skill][data-lvl="2"]').first().click();
    await page.waitForFunction(() => document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 15000 });
    await page.click('#logBtn');
    await page.waitForSelector('#dlg .log-item');
    const logText = await page.textContent('#logList');
    if (!/→ .*4 \(Profík\)/.test(logText)) problems.push(`historie nezná změnu úrovně: ${logText.slice(0, 300)}`);
    if (!/zaučení na pozici/.test(logText)) problems.push('historie nezná zaučení');
    await page.screenshot({ path: `${shots}/log.png` });
    await page.click('#dlgCancel');
    // matice a profil
    await page.click('#nav [data-view="matice"]');
    await page.waitForSelector('.matrix');
    await page.screenshot({ path: `${shots}/matrix.png`, fullPage: true });
    const [mx] = await Promise.all([page.waitForEvent('download'), page.click('#btnMatrixXlsx')]);
    await mx.saveAs(path.join(S, 'matice.xlsx'));
    await page.locator('.matrix [data-profile]').first().click();
    await page.waitForSelector('#view-profil.on .chart');
    await page.screenshot({ path: `${shots}/profile.png`, fullPage: true });
    await page.click('[data-range="all"]');
    await page.locator('tr[data-pfmonth]').first().click();
    await page.waitForSelector('tr.pf-detail');
    const [px] = await Promise.all([page.waitForEvent('download'), page.click('[data-pfxlsx]')]);
    await px.saveAs(path.join(S, 'profil.xlsx'));
    await page.locator('#pfCharts .hit').first().hover();
    if (await page.locator('#pfTip').isHidden()) problems.push('tooltip grafu se neukázal');
    await page.screenshot({ path: `${shots}/profile-detail.png`, fullPage: true });

    // druhá kartička: vlastní nastavení, změny první kartičky vidí jako nové
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p2 = await ctx2.newPage();
    await watch(p2, 'kolega');
    await login(p2, key2);
    if ((await p2.inputValue('#ovPos')) !== '') problems.push('filtr pozice první kartičky se přenesl na druhou');
    const badge = await p2.textContent('#logBadge');
    if (!(+badge > 0)) problems.push(`druhá kartička nevidí nové změny (odznak "${badge}")`);
    await p2.screenshot({ path: `${shots}/m-overview.png`, fullPage: true });
    await p2.click('#nav [data-view="matice"]');
    await p2.waitForSelector('.matrix');
    await p2.screenshot({ path: `${shots}/m-matrix.png`, fullPage: true });
    await p2.locator('.matrix [data-profile]').first().click();
    await p2.waitForSelector('#view-profil.on .chart');
    await p2.screenshot({ path: `${shots}/m-profile.png`, fullPage: true });
    const overflow = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) problems.push(`mobil: vodorovné přetečení ${overflow}px`);
    // první kartička má po novém přihlášení dál svůj filtr
    await login(page, key);
    if ((await page.inputValue('#ovPos')) === '') problems.push('filtr pozice se nezapamatoval');
    const dctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'dark' });
    const d = await dctx.newPage();
    await watch(d, 'tmavy');
    await login(d, key);
    await d.click('#nav [data-view="matice"]');
    await d.waitForSelector('.matrix');
    await d.screenshot({ path: `${shots}/dark-matrix.png`, fullPage: true });
    await d.locator('.matrix [data-profile]').first().click();
    await d.waitForSelector('#view-profil.on .chart');
    await d.screenshot({ path: `${shots}/dark-profile.png`, fullPage: true });
  }
  await browser.close();
  console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : `${MODE} ok`);
})().catch(error => { console.error(error); console.log(problems.join('\n')); process.exit(1); });
