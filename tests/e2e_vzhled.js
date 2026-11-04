// Prohlížečový průchod 2.47: vzhled Sklo (výchozí) a přepnutí zpět na původní vzhled v Nastavení.
// Ověří: výchozí vzhled na zámku i v aplikaci, písmo Jakarta, přepínač, zapamatování po obnovení
// stránky, původní vzhled bez stop skla, CSP bez chyb a že PDF export (Plán kapacit) vyjde v obou
// vzhledech stejně (text i vykreslené strany, když je PyMuPDF). Hodiny stránky stojí, ať se PDF dá
// porovnat. Spuštění stejně jako e2e_undo.js; snímky v $S/oshots-vzhled.
const { chromium } = require(process.env.PW);
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-vzhled');
const NOW = new Date('2026-11-04T09:00:00');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.clock.setFixedTime(NOW);
  const page = await ctx.newPage();
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`console: ${msg.text()}`); });
  page.on('pageerror', err => problems.push(`pageerror: ${err.message}`));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`)));
  await page.goto(BASE);
  await page.waitForSelector('#setupForm');
  const lock = await page.evaluate(() => ({ look: document.documentElement.dataset.look, card: getComputedStyle(document.querySelector('.lock-card')).backdropFilter, meta: document.querySelector('meta[name="theme-color"]').content }));
  check(lock.look === 'glass' && /blur/.test(lock.card) && lock.meta === '#0b0c10', `zámek ve skle: ${JSON.stringify(lock)}`);
  await page.screenshot({ path: path.join(shots, '01-zamek.png') });
  await page.fill('[name="token"]', fs.readFileSync(process.env.TOKEN_FILE || path.join(S, 'odme2e', 'setup-token.txt'), 'utf8').trim());
  await page.fill('[name="label"]', 'Mistr haly');
  await page.click('#setupForm button[type="submit"]');
  await page.waitForSelector('.odm-card');
  await page.check('#saved');
  await page.click('#finish');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');
  await page.evaluate(() => document.fonts.ready);
  const app = await page.evaluate(() => ({
    font: getComputedStyle(document.body).fontFamily, jakarta: document.fonts.check('600 16px Jakarta'),
    side: getComputedStyle(document.querySelector('.side')).borderRadius, card: getComputedStyle(document.querySelector('.side')).backdropFilter,
    active: getComputedStyle(document.querySelector('#nav [aria-current="true"]')).backgroundImage,
  }));
  check(/Jakarta/.test(app.font) && app.jakarta && app.side === '30px' && /blur/.test(app.card) && /gradient/.test(app.active), `aplikace ve skle: ${JSON.stringify(app)}`);
  const lastNav = await page.evaluate(() => { const b = [...document.querySelectorAll('#nav > button')].pop().getBoundingClientRect(); const s = document.querySelector('.side').getBoundingClientRect(); return [b.bottom, s.bottom]; });
  check(lastNav[0] <= lastNav[1], `boční panel: poslední položka menu je vidět (${lastNav})`);
  await page.screenshot({ path: path.join(shots, '02-sklo.png') });

  const pdfOf = async name => {
    await page.evaluate(() => showView('plankap'));
    const [d] = await Promise.all([page.waitForEvent('download'), page.click('#cpPdf')]);
    const p = path.join(shots, name);
    await d.saveAs(p);
    return p;
  };
  const pdfGlass = await pdfOf('plan-sklo.pdf');

  // přepnutí na původní vzhled
  await page.evaluate(() => showView('nastaveni'));
  await page.waitForSelector('#secLook');
  check(await page.inputValue('#secLook') === 'glass', 'v Nastavení vybrané Sklo');
  await page.selectOption('#secLook', 'classic');
  const cls = await page.evaluate(() => ({
    look: document.documentElement.dataset.look, font: getComputedStyle(document.body).fontFamily, bg: getComputedStyle(document.body).backgroundColor,
    side: getComputedStyle(document.querySelector('.side')).borderRadius, card: getComputedStyle(document.querySelector('.card')).backdropFilter,
  }));
  check(cls.look === 'classic' && /^Plex/.test(cls.font) && cls.side === '0px' && (cls.card === 'none' || !cls.card), `původní vzhled: ${JSON.stringify(cls)}`);
  await page.evaluate(() => showView('prehled'));
  await page.screenshot({ path: path.join(shots, '03-puvodni.png') });
  const pdfClassic = await pdfOf('plan-puvodni.pdf');

  // PDF beze změny
  try {
    const txt = f => execFileSync('python3', ['-c', 'import sys,pypdf;print("\\n".join(p.extract_text() for p in pypdf.PdfReader(sys.argv[1]).pages))', f]).toString();
    check(txt(pdfGlass) === txt(pdfClassic), 'PDF: text v obou vzhledech stejný');
  } catch (error) { if (/pypdf/.test(String(error))) console.log('pypdf není, text PDF se neporovná'); else problems.push(`PDF: ${error.message}`); }
  try {
    const same = execFileSync('python3', ['-c', `import sys
try:
    import pymupdf
except ImportError:
    print('skip'); sys.exit(0)
a, b = pymupdf.open(sys.argv[1]), pymupdf.open(sys.argv[2])
ok = len(a) == len(b) and all(a[i].get_pixmap().samples == b[i].get_pixmap().samples for i in range(len(a)))
print('same' if ok else 'diff')`, pdfGlass, pdfClassic]).toString().trim();
    check(same === 'same' || same === 'skip', `PDF: vykreslené strany v obou vzhledech stejné (${same})`);
  } catch (error) { problems.push(`PDF strany: ${String(error.stderr || error.message).slice(-300)}`); }

  // volba vzhledu vydrží obnovení stránky (zámek i aplikace) a jde vrátit
  await page.reload();
  await page.waitForSelector('#lock');
  check(await page.evaluate(() => document.documentElement.dataset.look) === 'classic', 'po obnovení původní vzhled');
  await page.evaluate(() => window.OdmLook.set('glass'));
  check(await page.evaluate(() => document.documentElement.dataset.look === 'glass' && localStorage.getItem('odmeny.look.v1:' + location.pathname.replace(/[^/]*$/, '')) === 'glass'), 'zpět na sklo');

  // telefon
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 0, 'telefon bez přetečení');
  await page.screenshot({ path: path.join(shots, '04-telefon-zamek.png') });
  await browser.close();
  if (problems.length) { console.log('PROBLÉMY:\n' + problems.join('\n')); process.exit(1); }
  console.log('vzhled ok');
})().catch(e => { console.error(e); process.exit(1); });
