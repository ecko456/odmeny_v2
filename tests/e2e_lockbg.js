// Prohlížečový průchod 2.60: pozadí přihlašovací stránky (static/lockbg.js).
// Ověří: plátno za panelem přes celou plochu, kreslí barevná pole (tmavá, oranžová, světlá),
// hýbe se (dva snímky se liší), panel je nad ním a jde kliknout, ve skryté kartě se zastaví,
// s „omezit pohyb“ jen stojící snímek, bez WebGL zůstane CSS pozadí, po odemčení plátno zmizí
// a nekreslí, telefon bez přetečení, CSP bez chyb. Spuštění jako e2e_undo.js; snímky v $S/oshots-lockbg.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-lockbg');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

async function watch(page) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`console: ${msg.text()}`); });
  page.on('pageerror', err => problems.push(`pageerror: ${err.message}`));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`)));
}
// pixely plátna přes snímek stránky (plátno nemá preserveDrawingBuffer)
async function pixels(page) {
  const buf = await page.screenshot();
  return page.evaluate(async b64 => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const pts = [];
    for (let i = 0; i < 9; i += 1) for (let j = 0; j < 9; j += 1) {
      const px = Math.round((i + 0.5) / 9 * img.width), py = Math.round((j + 0.5) / 9 * img.height);
      if (px > img.width * 0.3 && px < img.width * 0.7) continue;   // mimo panel uprostřed
      const d = x.getImageData(px, py, 1, 1).data;
      pts.push([d[0], d[1], d[2]]);
    }
    return pts;
  }, buf.toString('base64'));
}
const dist = (a, b) => a.reduce((s, p, i) => s + Math.abs(p[0] - b[i][0]) + Math.abs(p[1] - b[i][1]) + Math.abs(p[2] - b[i][2]), 0);

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });

  // ---------- monitor ----------
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await watch(page);
  await page.goto(BASE);
  await page.waitForSelector('#setupForm');
  await page.waitForFunction(() => window.OdmLockBg && window.OdmLockBg.frames > 5, null, { timeout: 15000 });
  const box = await page.evaluate(() => {
    const c = document.querySelector('#lock .lock-bg').getBoundingClientRect(), card = document.querySelector('.lock-card');
    const mid = card.getBoundingClientRect();
    const top = document.elementFromPoint(mid.left + mid.width / 2, mid.top + 20);
    return { w: c.width, h: c.height, on: document.documentElement.classList.contains('lock-bg-on'), cardTop: card.contains(top), running: window.OdmLockBg.running };
  });
  check(box.w >= 1440 - 1 && box.h >= 899 && box.on && box.cardTop && box.running, `plátno za panelem přes celou plochu: ${JSON.stringify(box)}`);
  const a = await pixels(page);
  await page.screenshot({ path: path.join(shots, '01-zamek.png') });
  const lum = a.map(p => (p[0] + p[1] + p[2]) / 3);
  const orange = a.some(p => p[0] > 170 && p[0] - p[2] > 90);
  check(Math.max(...lum) - Math.min(...lum) > 60 && orange, `barevná pole (tmavá, oranžová, světlá): ${JSON.stringify(a.slice(0, 6))}`);
  await page.waitForTimeout(1500);
  const b = await pixels(page);
  check(dist(a, b) > 200, `pozadí se hýbe: rozdíl ${dist(a, b)}`);
  await page.screenshot({ path: path.join(shots, '02-zamek-pozdeji.png') });
  // panel jde používat
  await page.fill('[name="token"]', fs.readFileSync(process.env.TOKEN_FILE || path.join(S, 'odme2e', 'setup-token.txt'), 'utf8').trim());
  await page.fill('[name="label"]', 'Mistr haly');
  await page.click('#setupForm button[type="submit"]');
  await page.waitForSelector('.odm-card');
  await page.screenshot({ path: path.join(shots, '03-karticka.png') });
  // skrytá karta: pauza
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const f0 = await page.evaluate(() => window.OdmLockBg.frames);
  await page.waitForTimeout(600);
  const f1 = await page.evaluate(() => ({ frames: window.OdmLockBg.frames, running: window.OdmLockBg.running }));
  check(f1.frames - f0 <= 1 && !f1.running, `skrytá karta nekreslí: ${JSON.stringify({ f0, f1 })}`);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(n => window.OdmLockBg.frames > n + 3, f1.frames);
  // po odemčení plátno zmizí a nekreslí
  await page.check('#saved');
  await page.click('#finish');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({ canvas: !!document.querySelector('.lock-bg'), cls: document.documentElement.classList.contains('lock-bg-on'), frames: window.OdmLockBg.frames, running: window.OdmLockBg.running }));
  await page.waitForTimeout(500);
  const after2 = await page.evaluate(() => window.OdmLockBg.frames);
  check(!after.canvas && !after.cls && !after.running && after2 === after.frames, `po odemčení bez plátna a bez kreslení: ${JSON.stringify(after)} ${after2}`);
  await ctx.close();

  // ---------- omezit pohyb: jeden stojící snímek ----------
  const rctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const rp = await rctx.newPage();
  await watch(rp);
  await rp.goto(BASE);
  await rp.waitForSelector('#lockBody .lock-stack, #lockBody form, #lockBody button');
  await rp.waitForTimeout(800);
  const r = await rp.evaluate(() => ({ frames: window.OdmLockBg && window.OdmLockBg.frames, running: window.OdmLockBg && window.OdmLockBg.running, canvas: !!document.querySelector('.lock-bg') }));
  check(r.canvas && r.frames >= 1 && r.frames <= 2 && !r.running, `omezit pohyb = stojící snímek: ${JSON.stringify(r)}`);
  await rctx.close();

  // ---------- bez WebGL: CSS pozadí ----------
  const nctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await nctx.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, o) { return /webgl/.test(t) ? null : g.call(this, t, o); }; });
  const np = await nctx.newPage();
  await watch(np);
  await np.goto(BASE);
  await np.waitForSelector('#lockBody form, #lockBody button');
  const n = await np.evaluate(() => ({ canvas: !!document.querySelector('.lock-bg'), cls: document.documentElement.classList.contains('lock-bg-on'), bg: getComputedStyle(document.body, '::before').backgroundImage }));
  check(!n.canvas && !n.cls && /gradient/.test(n.bg), `bez WebGL původní pozadí: ${JSON.stringify(n)}`);
  await np.screenshot({ path: path.join(shots, '04-bez-webgl.png') });
  await nctx.close();

  // ---------- telefon ----------
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pp = await pctx.newPage();
  await watch(pp);
  await pp.goto(BASE);
  await pp.waitForFunction(() => window.OdmLockBg && window.OdmLockBg.frames > 3, null, { timeout: 15000 });
  const over = await pp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(over <= 1, `telefon bez přetečení: ${over}`);
  await pp.waitForTimeout(500);
  await pp.screenshot({ path: path.join(shots, '05-telefon.png') });
  await pctx.close();

  await browser.close();
  if (problems.length) {
    console.log('PROBLÉMY:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
  console.log('pozadí zámku ok');
})().catch(err => { console.error(err); process.exit(1); });
