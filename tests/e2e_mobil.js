// Telefon jako aplikace (verze 2.14): horní lišta s obdobím, spodní lišta se čtyřmi částmi
// a nabídkou Více, tlačítko Zpět (gesto) v aplikaci, dialogy zespodu, schované filtry
// přehledu, záložky s posunem, manifest a ikony pro plochu. Na konci desktop a tmavý režim.
// Spuštění stejně jako e2e_browser.js:
//   ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t . dev-router.php &
//   curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state
//   NO_PROXY=127.0.0.1 PW=$(npm root -g)/playwright S=$S node tests/e2e_mobil.js
// Snímky do $S/oshots-mobil.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-mobil');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };
const PRIMARY = ['prehled', 'lide', 'sankce', 'kontroly'];
const MORE = ['matice', 'dochazka', 'vyroba', 'top5', 'nastaveni'];

async function watch(page, label) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  page.on('response', r => { if (r.status() >= 400) problems.push(`${label} HTTP ${r.status()} ${r.url()}`); });
  page.on('pageerror', err => problems.push(`${label} pageerror: ${err.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`));
  });
}
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const view = page => page.evaluate(() => ui.view);
async function nav(page, name) {
  if (await page.isVisible(`#nav [data-view="${name}"]`)) await page.click(`#nav [data-view="${name}"]`);
  else { await page.click('#navMore'); await page.click(`#moreSheet [data-view="${name}"]`); }
  await page.waitForFunction(v => ui.view === v, name);
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  global.lastPage = page;
  await watch(page, 'mobil');
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
  await page.waitForTimeout(300);

  // Manifest a ikony pro přidání na plochu (index.php, CSP manifest-src).
  const man = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const res = await fetch(link.href);
    const json = await res.json();
    const icons = await Promise.all(json.icons.map(async i => { const r = await fetch(new URL(i.src, link.href)); return `${i.sizes} ${i.purpose} ${r.status} ${r.headers.get('content-type')}`; }));
    const apple = document.querySelector('link[rel="apple-touch-icon"]');
    const ar = apple ? await fetch(apple.href) : null;
    return { type: res.headers.get('content-type'), json, icons, start: new URL(json.start_url, link.href).pathname, apple: ar ? `${ar.status} ${ar.headers.get('content-type')}` : '' };
  });
  check(/application\/manifest\+json/.test(man.type), `manifest: typ ${man.type}`);
  check(man.json.display === 'standalone' && man.json.short_name === 'Odměny' && man.start === '/', `manifest: ${JSON.stringify(man.json)} start ${man.start}`);
  check(man.icons.filter(i => / 200 image\/png$/.test(i)).length === 3 && man.icons.some(i => /^512x512 maskable 200/.test(i)), `ikony: ${man.icons.join(' | ')}`);
  check(man.apple === '200 image/png', `ikona pro iPhone: ${man.apple}`);
  const cdp = await ctx.newCDPSession(page);
  const parsed = await cdp.send('Page.getAppManifest');
  check(!parsed.errors.length, `manifest podle prohlížeče: ${JSON.stringify(parsed.errors)}`);

  // Horní a spodní lišta.
  const bars = await page.evaluate(() => {
    const nav = document.querySelector('#nav').getBoundingClientRect();
    const top = document.querySelector('.side-top');
    return {
      visible: [...document.querySelectorAll('#nav > button')].filter(b => getComputedStyle(b).display !== 'none').map(b => b.dataset.view || b.id),
      navBottom: nav.bottom, navH: nav.height, vh: innerHeight,
      topPos: getComputedStyle(top).position, period: !!top.querySelector('#periodSel'),
      pad: parseFloat(getComputedStyle(document.querySelector('#main')).paddingBottom),
      current: document.querySelector('#nav [aria-current="true"]')?.dataset.view,
    };
  });
  check(JSON.stringify(bars.visible) === JSON.stringify([...PRIMARY, 'navMore']), `spodní lišta: ${bars.visible.join(', ')}`);
  check(Math.abs(bars.navBottom - bars.vh) <= 1 && bars.navH >= 56, `spodní lišta není dole: ${JSON.stringify(bars)}`);
  check(bars.topPos === 'sticky' && bars.period, 'horní lišta s obdobím');
  check(bars.pad >= bars.navH, 'obsah zajede pod spodní lištu');
  check(bars.current === 'prehled', 'vybraná část v liště');
  await page.screenshot({ path: `${shots}/01-prehled.png` });
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(100);
  check(await page.evaluate(() => Math.abs(document.querySelector('.side-top').getBoundingClientRect().top) < 1), 'horní lišta při posunu zůstane nahoře');
  await page.screenshot({ path: `${shots}/02-prehled-posun.png` });

  // Přehled: filtry schované za tlačítkem, tečka při nastaveném filtru.
  await page.evaluate(() => window.scrollTo(0, 0));
  check(await page.isHidden('#ovPos') && await page.isHidden('#kafeCtl') && await page.isVisible('#ovSearch') && await page.isVisible('#ovFilterBtn'), 'filtry přehledu mají být schované');
  check(await page.isHidden('#ovFilterDot'), 'tečka u Filtrů bez filtru');
  await page.click('#ovFilterBtn');
  check(await page.isVisible('#ovPos') && await page.isVisible('#ovOnlyOpen') && await page.isVisible('#kafeCtl'), 'filtry po rozbalení');
  check(await page.getAttribute('#ovFilterBtn', 'aria-expanded') === 'true', 'aria-expanded u Filtrů');
  await page.selectOption('#ovPos', { index: 1 });
  check(await page.isVisible('#ovFilterDot'), 'tečka u Filtrů s filtrem skupiny');
  await page.locator('#ovTools').screenshot({ path: `${shots}/03-filtry.png` });
  await page.selectOption('#ovPos', '');
  check(await page.isHidden('#ovFilterDot'), 'tečka po zrušení filtru');
  await page.click('#ovFilterBtn');
  check(await page.isHidden('#ovPos'), 'filtry se zase schovají');

  // Úvodní text na dva řádky, klepnutím celý.
  const lede = await page.evaluate(() => { const l = document.querySelector('#ovLede'); return { h: l.clientHeight, lh: parseFloat(getComputedStyle(l).lineHeight), full: l.scrollHeight }; });
  check(lede.h <= lede.lh * 2 + 2 && lede.full > lede.h, `úvodní text: ${JSON.stringify(lede)}`);
  await page.click('#ovLede');
  check(await page.evaluate(() => { const l = document.querySelector('#ovLede'); return l.classList.contains('open') && l.clientHeight >= l.scrollHeight - 1; }), 'úvodní text se rozbalí');
  await page.click('#ovLede');
  check(await page.evaluate(() => !document.querySelector('#ovLede').classList.contains('open')), 'úvodní text se sbalí');

  // Nabídka Více.
  await page.click('#navMore');
  await page.waitForFunction(() => document.querySelector('#moreSheet').open);
  await page.waitForTimeout(350);
  const sheet = await page.evaluate(() => {
    const r = document.querySelector('#moreSheet').getBoundingClientRect();
    return { items: [...document.querySelectorAll('#moreGrid [data-view]')].map(b => b.dataset.view), bottom: r.bottom, width: r.width, vh: innerHeight, vw: innerWidth, exp: document.querySelector('#navMore').getAttribute('aria-expanded') };
  });
  check(JSON.stringify(sheet.items) === JSON.stringify(MORE), `nabídka Více: ${sheet.items.join(', ')}`);
  check(Math.abs(sheet.bottom - sheet.vh) <= 1 && Math.abs(sheet.width - sheet.vw) <= 1 && sheet.exp === 'true', `nabídka Více není dole přes celou šířku: ${JSON.stringify(sheet)}`);
  await page.screenshot({ path: `${shots}/04-vice.png` });
  await page.click('#moreSheet [data-view="matice"]');
  await page.waitForFunction(() => ui.view === 'matice' && !document.querySelector('#moreSheet').open);
  check(await page.getAttribute('#navMore', 'aria-current') === 'true', 'Více je vybrané u schované části');
  check(await page.getAttribute('#navMore', 'aria-expanded') === 'false', 'aria-expanded po zavření');
  check(await page.isHidden('#demoBanner .banner'), 'pruh s ukázkou jen v Přehledu');
  await page.screenshot({ path: `${shots}/05-matice.png` });

  // Záložky v jednom řádku s posunem, vybraná je vidět.
  const tabs = await page.evaluate(() => { const b = document.querySelector('#mxTabs'); return { wrap: getComputedStyle(b).flexWrap, scroll: b.scrollWidth > b.clientWidth }; });
  check(tabs.wrap === 'nowrap' && tabs.scroll, `záložky: ${JSON.stringify(tabs)}`);
  await page.click('#mxTabs [data-mxtab="leads"]');
  await page.waitForSelector('#leadView .lead-matrix, #leadView .empty, #leadView', { state: 'attached' });
  check(await page.evaluate(() => { const b = document.querySelector('#mxTabs').getBoundingClientRect(); const c = document.querySelector('#mxTabs .chip.on').getBoundingClientRect(); return c.left >= b.left - 1 && c.right <= b.right + 1; }), 'vybraná záložka je vidět');
  await page.click('#mxTabs [data-mxtab="matrix"]');

  // Zpět a Vpřed: mezi částmi aplikace, ne pryč z ní.
  await page.goBack();
  await page.waitForFunction(() => ui.view === 'prehled');
  check(await page.getAttribute('#navMore', 'aria-current') === 'false', 'Více po návratu do Přehledu');
  await page.goForward();
  await page.waitForFunction(() => ui.view === 'matice');

  // Lidé: detail zakryje seznam, Zpět ho zavře a vrátí seznam na stejné místo.
  await nav(page, 'lide');
  await page.evaluate(() => window.scrollTo(0, 260));
  const y0 = await page.evaluate(() => window.scrollY);
  await page.click('#lList [data-key="dvorak|petr"]');
  await page.waitForFunction(() => ui.personOpen && history.state.sub === 'person');
  check(await page.isHidden('#lList') && await page.isVisible('#lDetail #pBack'), 'detail člověka zakryje seznam');
  check(await page.isHidden('#view-lide > .page-head'), 'v detailu není záhlaví seznamu');
  await page.screenshot({ path: `${shots}/06-detail.png` });
  await page.goBack();
  await page.waitForFunction(() => ui.view === 'lide' && !ui.personOpen);
  check(await page.isVisible('#lList'), 'po Zpět je vidět seznam');
  check(Math.abs(await page.evaluate(() => window.scrollY) - y0) <= 2, 'seznam je na stejném místě');
  // Tlačítko „Seznam lidí“ jde stejnou cestou: další Zpět pak nevrací do Lidí znovu.
  await page.click('#lList [data-key="novak|martin"]');
  await page.waitForFunction(() => ui.personOpen);
  await page.click('#lDetail #pBack');
  await page.waitForFunction(() => !ui.personOpen && history.state.sub === '');
  await page.goBack();
  await page.waitForFunction(() => ui.view === 'matice');
  await page.goForward();
  await page.waitForFunction(() => ui.view === 'lide' && !ui.personOpen);

  // Dialog vysunutý zespodu; Zpět ho zavře a v aplikaci se zůstane.
  await page.click('#btnAddPerson');
  await page.waitForFunction(() => document.querySelector('#dlg').open);
  await page.waitForTimeout(350);
  const dlg = await page.evaluate(() => { const r = document.querySelector('#dlg').getBoundingClientRect(); const ok = document.querySelector('#dlgOk').getBoundingClientRect(); return { bottom: r.bottom, width: r.width, vh: innerHeight, vw: innerWidth, okW: ok.width, okH: ok.height }; });
  check(Math.abs(dlg.bottom - dlg.vh) <= 1 && Math.abs(dlg.width - dlg.vw) <= 1, `dialog není dole přes celou šířku: ${JSON.stringify(dlg)}`);
  check(dlg.okW > dlg.vw * 0.35 && dlg.okH >= 44, `tlačítka dialogu: ${JSON.stringify(dlg)}`);
  await page.screenshot({ path: `${shots}/07-dialog.png` });
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector('#dlg').open);
  check(await view(page) === 'lide' && await page.evaluate(() => history.state.odmView === 'lide'), 'Zpět zavřel dialog a zůstalo se v Lidech');
  // Nabídka Více se zavře gestem Zpět i klepnutím vedle.
  await page.click('#navMore');
  await page.waitForFunction(() => document.querySelector('#moreSheet').open);
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector('#moreSheet').open);
  check(await view(page) === 'lide', 'Zpět zavřel nabídku Více');
  await page.click('#navMore');
  await page.waitForFunction(() => document.querySelector('#moreSheet').open);
  await page.mouse.click(195, 120);
  await page.waitForFunction(() => !document.querySelector('#moreSheet').open);

  // Tečka u Více, když má schovaná část odznak.
  await page.evaluate(() => { const b = document.querySelector('#navTop5'); b.hidden = false; b.textContent = '2'; renderMoreDot(); });
  check(await page.isVisible('#navMoreDot'), 'tečka u Více');
  await page.click('#navMore');
  check(await page.textContent('#moreGrid [data-view="top5"] .nav-badge') === '2', 'odznak v nabídce Více');
  await page.click('#moreClose');
  await page.evaluate(() => renderTop5Badge());
  check(await page.evaluate(() => document.querySelector('#navMoreDot').hidden === document.querySelector('#navTop5').hidden), 'tečka odpovídá odznaku');

  // Všechny části bez vodorovného přetečení na 390 a 360 px.
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 780 });
    for (const name of [...PRIMARY, ...MORE]) {
      await nav(page, name);
      await page.waitForTimeout(120);
      const o = await overflow(page);
      check(o <= 1, `${width} px ${name}: přetečení ${o} px`);
      if (width === 360) await page.screenshot({ path: `${shots}/08-${name}-360.png` });
    }
  }
  check(await page.evaluate(() => history.state && history.state.odmView === 'nastaveni'), 'historie zná poslední část');

  // Tmavý režim.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await nav(page, 'prehled');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${shots}/09-dark.png` });
  await page.click('#navMore');
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${shots}/10-dark-vice.png` });
  await page.click('#moreClose');
  await page.emulateMedia({ colorScheme: 'light' });

  // Desktop: postranní menu jako dřív, období pod logem, filtry vidět, Zpět funguje taky.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(200);
  const desk = await page.evaluate(() => {
    const brand = document.querySelector('.side-brand').getBoundingClientRect();
    const quick = document.querySelector('.side-quick').getBoundingClientRect();
    const period = document.querySelector('.period-box').getBoundingClientRect();
    return {
      row: quick.top < brand.bottom && quick.left > brand.left,
      visible: [...document.querySelectorAll('#nav > button')].filter(b => getComputedStyle(b).display !== 'none').length,
      more: getComputedStyle(document.querySelector('#navMore')).display,
      navPos: getComputedStyle(document.querySelector('#nav')).position,
      below: period.top >= brand.bottom, periodW: period.width,
    };
  });
  check(desk.visible === 9 && desk.more === 'none' && desk.navPos === 'static', `desktop menu: ${JSON.stringify(desk)}`);
  check(desk.row && desk.below && desk.periodW > 150, `desktop logo, historie a období: ${JSON.stringify(desk)}`);
  check(await page.isHidden('#ovFilterBtn') && await page.isVisible('#ovPos') && await page.isVisible('#ovOnlyOpen'), 'desktop: filtry vidět bez tlačítka');
  await page.click('#nav [data-view="vyroba"]');
  await page.goBack();
  await page.waitForFunction(() => ui.view === 'prehled');
  await page.screenshot({ path: `${shots}/11-desktop.png` });

  // Zamknutí z nabídky Více.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#navMore');
  await page.click('#moreLock');
  await page.waitForSelector('#lockCard');
  await page.waitForFunction(() => document.querySelector('#app').hidden);
  await page.screenshot({ path: `${shots}/12-zamceno.png` });

  await browser.close();
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
  console.log('e2e Mobil ok');
})().catch(async error => {
  console.error(error);
  if (problems.length) console.log(problems.join('\n'));
  if (global.lastPage) await global.lastPage.screenshot({ path: `${shots}/zz-error.png`, fullPage: true }).catch(() => {});
  process.exit(1);
});
