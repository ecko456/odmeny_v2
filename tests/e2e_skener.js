// Prohlížečový průchod skenerem kartičky v Sankcích (verze 2.13): ikona u pole Zaměstnanec,
// falešná kamera Chromia ukazuje čárový kód Code 128 s ID 4711 (tests/fixtures), ZXing ho
// přečte a vybere člověka s tímto ID v evidenci práce. Bez kamery: čtečka jako klávesnice
// (pole + Enter), neznámý kód, vyřazený člověk, nuly na začátku. Na konci mobil a tmavý režim.
// Spuštění stejně jako e2e_browser.js:
//   ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t . dev-router.php &
//   curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state
//   NO_PROXY=127.0.0.1 PW=$(npm root -g)/playwright S=$S node tests/e2e_skener.js
// Snímky do $S/oshots-scan.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-scan');
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
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  // falešná kamera: MJPEG z jednoho snímku s čárovým kódem (Chromium ho přehrává dokola)
  const jpg = fs.readFileSync(path.join(__dirname, 'fixtures', 'code128-4711.jpg'));
  const mjpeg = path.join(shots, 'kamera.mjpeg');
  fs.writeFileSync(mjpeg, Buffer.concat(Array(10).fill(jpg)));
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${mjpeg}`],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  global.lastPage = page;
  await watch(page, 'skener');
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

  // ID v evidenci práce: Novák 4711 (v Lidech), Dvořák 42, vyřazená Horáková 99.
  await page.click('#nav [data-view="lide"]');
  await page.click('#lList [data-key="novak|martin"]');
  await page.fill('#lDetail #pWid', '4711');
  await page.press('#lDetail #pWid', 'Tab');
  await page.waitForFunction(() => S.employees['novak|martin'].wid === '4711');
  await page.evaluate(() => { S.employees['dvorak|petr'].wid = '42'; S.employees['horakova|marie'].wid = '99'; S.employees['horakova|marie'].excluded = true; save(); renderAll(); });
  await saved(page);

  // Sankce: ikona skeneru u pole Zaměstnanec.
  await page.click('#nav [data-view="sankce"]');
  await page.waitForSelector('#sanForm #sanScan');
  await page.screenshot({ path: `${shots}/01-form.png`, fullPage: true });

  // Bez kamery (prohlížeč ji nedá): čtečka jako klávesnice, ruční ID.
  await page.evaluate(() => { window._gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('NotAllowedError')); });
  await page.click('#sanScan');
  await page.waitForSelector('#dlg[open] #scanInput');
  await page.waitForFunction(() => /Kamera není k dispozici/.test(document.querySelector('#scanState').textContent));
  check(await page.isHidden('#scanCam'), 'bez kamery se náhled schová');
  check(await page.evaluate(() => document.activeElement && document.activeElement.id === 'scanInput'), 'pole pro čtečku má fokus');
  await page.keyboard.type('5555');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#dlg[open] #scanMsg .note');
  check(/5555/.test(await page.textContent('#scanMsg')) && /nemá nikdo/.test(await page.textContent('#scanMsg')), 'neznámý kód');
  check(await page.isVisible('#dlg[open]'), 'Enter dialog nezavře, když nikoho nenajde');
  await page.fill('#scanInput', '99');
  await page.click('#scanFind');
  await page.waitForFunction(() => /Horáková Marie: vyřazení ze seznamu/.test(document.querySelector('#scanMsg').textContent));
  await page.screenshot({ path: `${shots}/02-dialog-no-camera.png` });
  await page.fill('#scanInput', '0042');   // čtečka může poslat nuly na začátku
  await page.press('#scanInput', 'Enter');
  await page.waitForFunction(() => !document.querySelector('#dlg').open && document.querySelector('#sanWho')?.value === 'dvorak|petr', null, { timeout: 5000 }).catch(() => {});
  check(await page.inputValue('#sanWho') === 'dvorak|petr', `vybraný po zadání ID: ${await page.inputValue('#sanWho')}`);
  check(await page.evaluate(() => ui.sanDraft.key) === 'dvorak|petr', 'koncept sankce má vybraného člověka');

  // Kamera: čárový kód 4711 z falešné kamery → Novák Martin.
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = window._gum; });
  await page.click('#sanScan');   // kód se může přečíst hned, dialog se pak sám zavře
  await page.waitForFunction(() => document.querySelector('#sanWho')?.value === 'novak|martin' && !document.querySelector('#dlg').open, null, { timeout: 20000 });
  check(await page.inputValue('#sanWho') === 'novak|martin', `vybraný kamerou: ${await page.inputValue('#sanWho')}`);
  check(await page.evaluate(() => typeof window.ZXing === 'object'), 'kód přečetla knihovna ZXing (Chromium na Linuxu nemá BarcodeDetector)');
  check(await page.evaluate(() => !document.querySelector('#dlg').open), 'po výběru je dialog pryč');
  check(await page.waitForFunction(() => codeScan === null, null, { timeout: 3000 }).then(() => true, () => false), 'kamera je vypnutá');
  await page.screenshot({ path: `${shots}/03-selected.png`, fullPage: true });

  // Zavření dialogu kamerou vypne kameru.
  await page.evaluate(() => { S.employees['novak|martin'].wid = '1'; });   // kód 4711 teď nikomu nepatří
  await page.click('#sanScan');
  await page.waitForSelector('#dlg[open] #scanMsg .note', { timeout: 20000 });
  check(/4711/.test(await page.textContent('#scanMsg')), 'kamerou přečtený neznámý kód');
  await page.screenshot({ path: `${shots}/04-dialog-camera.png` });
  await page.click('#dlgCancel');
  check(await page.waitForFunction(() => !document.querySelector('#dlg').open && codeScan === null, null, { timeout: 3000 }).then(() => true, () => false), 'Zavřít vypne kameru');
  await page.evaluate(() => { S.employees['novak|martin'].wid = '4711'; save(); });

  // Sankce s naskenovaným člověkem se uloží.
  await page.selectOption('#sanWhy', { index: 1 });
  await page.click('#sanAdd');
  await page.waitForFunction(() => S.sanctions.some(s => s.key === 'novak|martin'));
  await saved(page);

  // Mobil a tmavý režim.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  check(await overflow(page) <= 1, 'mobil: formulář bez přetečení');
  await page.screenshot({ path: `${shots}/05-mobile.png`, fullPage: true });
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('NotAllowedError')); });
  await page.click('#sanScan');
  await page.waitForSelector('#dlg[open] #scanInput');
  await page.waitForTimeout(400);
  check(await overflow(page) <= 1, 'mobil: dialog bez přetečení');
  await page.screenshot({ path: `${shots}/06-mobile-dialog.png` });
  await page.click('#dlgCancel');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${shots}/07-dark.png`, fullPage: true });

  await browser.close();
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
  console.log('e2e Skener ok');
})().catch(async error => {
  console.error(error);
  if (problems.length) console.log(problems.join('\n'));
  if (global.lastPage) await global.lastPage.screenshot({ path: `${shots}/zz-error.png`, fullPage: true }).catch(() => {});
  process.exit(1);
});
