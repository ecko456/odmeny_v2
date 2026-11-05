// Prohlížečový průchod 2.55: úvodní animace zámku (ohnivá koule, náraz, složení panelu).
// Ověří: plná animace při prvním otevření karty (plátno, panel skrytý do nárazu, pak vidět
// a plátno pryč), po znovu načtení jen krátké složení, s „omezit pohyb“ žádná animace,
// přeskočení klepnutím i psaním, přihlášení během animace, telefon, CSP bez chyb.
// Spuštění stejně jako e2e_undo.js; snímky po snímcích v $S/oshots-intro.
const { chromium, devices } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-intro');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
  const watch = page => {
    page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`console: ${msg.text()}`); });
    page.on('pageerror', err => problems.push(`pageerror: ${err.message}`));
    return page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`)));
  };
  const state = page => page.evaluate(() => ({
    mode: window.OdmIntro && window.OdmIntro.mode,
    cls: document.documentElement.className,
    canvas: !!document.querySelector('.intro-canvas'),
    op: Number(getComputedStyle(document.querySelector('.lock-card')).opacity),
  }));

  // 1) plná animace po snímcích
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await watch(page);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const t0 = Date.now();
  const early = await state(page);
  check(early.mode === 'full' && /intro-on/.test(early.cls) && early.canvas, `plná animace běží: ${JSON.stringify(early)}`);
  check(early.op < 0.05, `panel před nárazem skrytý: ${early.op}`);
  const frames = [250, 600, 950, 1200, 1380, 1550, 1800, 2200];
  for (const at of frames) {
    const wait = at - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
    await page.screenshot({ path: path.join(shots, `full-${String(at).padStart(4, '0')}.png`) });
  }
  await page.waitForFunction(() => !document.querySelector('.intro-canvas') && !document.documentElement.classList.contains('intro-on'), null, { timeout: 5000 });
  const elapsed = Date.now() - t0;
  check(elapsed < 4300, `animace skončí do 4 s: ${elapsed} ms`);
  await sleep(900);
  const after = await state(page);
  check(after.op > 0.99 && !after.canvas, `panel po animaci vidět: ${JSON.stringify(after)}`);
  await page.waitForSelector('#setupForm');
  check(await page.isVisible('#setupForm [name="token"]'), 'pole kódu je vidět');
  await page.screenshot({ path: path.join(shots, 'full-konec.png') });
  // stav panelu se po animaci nemění (běžná animace „rise“ se znovu nespustí)
  const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.lock-card')).animationName);
  check(anim === 'introCard', `panel zůstane složený: ${anim}`);

  // 2) znovu načtení v téže kartě = krátké složení, bez koule
  await page.reload({ waitUntil: 'domcontentloaded' });
  const short = await state(page);
  check(short.mode === 'short' && !short.canvas, `po načtení jen složení: ${JSON.stringify(short)}`);
  await sleep(1000);
  const shortEnd = await state(page);
  check(shortEnd.op > 0.99 && !/intro-on/.test(shortEnd.cls), `krátké složení skončí: ${JSON.stringify(shortEnd)}`);
  await ctx.close();

  // 3) omezit pohyb = žádná animace
  const rctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const rpage = await rctx.newPage();
  await watch(rpage);
  await rpage.goto(BASE, { waitUntil: 'domcontentloaded' });
  const red = await state(rpage);
  check(red.mode === 'none' && !red.canvas && !/intro-on/.test(red.cls), `omezit pohyb bez animace: ${JSON.stringify(red)}`);
  await rctx.close();

  // 4) klepnutí přeskočí
  const sctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const spage = await sctx.newPage();
  await watch(spage);
  await spage.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(400);
  await spage.mouse.click(40, 40);
  await sleep(350);
  const skipped = await state(spage);
  check(!skipped.canvas && !/intro-on/.test(skipped.cls), `klepnutí animaci přeskočí: ${JSON.stringify(skipped)}`);
  await sctx.close();

  // 5) psaní během animace: přihlášení prvního spuštění projde (psaní animaci ukončí)
  const tctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const tpage = await tctx.newPage();
  await watch(tpage);
  await tpage.goto(BASE, { waitUntil: 'domcontentloaded' });
  await tpage.waitForSelector('#setupForm [name="token"]', { state: 'attached' });
  await tpage.click('#setupForm [name="token"]');
  await tpage.keyboard.type(fs.readFileSync(process.env.TOKEN_FILE || path.join(S, 'odme2e', 'setup-token.txt'), 'utf8').trim());
  check(!/intro-on/.test((await state(tpage)).cls), 'psaní animaci ukončí');
  await tpage.fill('[name="label"]', 'Mistr haly');
  await tpage.click('#setupForm button[type="submit"]');
  await tpage.waitForSelector('.odm-card');
  await tctx.close();

  // 6) telefon
  const mctx = await browser.newContext({ ...devices['iPhone 13'] });
  const mpage = await mctx.newPage();
  await watch(mpage);
  await mpage.goto(BASE, { waitUntil: 'domcontentloaded' });
  const m0 = Date.now();
  for (const at of [700, 1300, 1600, 2400]) {
    const wait = at - (Date.now() - m0);
    if (wait > 0) await sleep(wait);
    await mpage.screenshot({ path: path.join(shots, `mobil-${String(at).padStart(4, '0')}.png`) });
  }
  await mpage.waitForFunction(() => !document.querySelector('.intro-canvas'), null, { timeout: 5000 });
  const over = await mpage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(over <= 0, `telefon bez přetečení: ${over}`);
  await mctx.close();

  await browser.close();
  if (problems.length) {
    console.log('PROBLÉMY:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
  console.log('Úvodní animace v pořádku.');
})().catch(err => { console.error(err); process.exit(1); });
