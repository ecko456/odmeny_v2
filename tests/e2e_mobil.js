// Telefon jako aplikace: verze 2.14 (horní lišta s obdobím, Zpět v aplikaci, dialogy zespodu,
// schované filtry přehledu, manifest a ikony) a 2.15 (po přihlášení animace HALA 2 a hlavní
// menu s plánovanou obsazeností dne, volba směny rozevře menu částí, plovoucí menu vpravo dole
// s vyhledáním člověka, Sankcemi, Top 5 a Kontrolami; seznam lidí drží šířku obrazovky).
// Na konci tmavý režim, omezené animace, desktop beze změny a zamknutí z hlavního menu.
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
const SECTIONS = ['prehled', 'lide', 'sankce', 'kontroly', 'protokoly', 'top5', 'matice', 'dochazka', 'vyroba', 'audit', 'nastaveni'];

async function watch(page, label) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  page.on('response', r => { if (r.status() >= 400) problems.push(`${label} HTTP ${r.status()} ${r.url()}`); });
  page.on('pageerror', err => problems.push(`${label} pageerror: ${err.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`));
  });
}
// V mobilním režimu se okno při přetečení samo rozšíří (innerWidth roste), měří se proti clientWidth.
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const view = page => page.evaluate(() => ui.view);
async function home(page) {
  await page.click('#brandHome');
  await page.waitForSelector('#view-domu.on');
}
async function nav(page, name) {
  if (await page.isVisible(`#nav [data-view="${name}"]`)) await page.click(`#nav [data-view="${name}"]`);
  else {
    await home(page);
    if (await page.isHidden('#homeView .home-open')) await page.click('[data-hshift="both"]');
    await page.click(`#homeView .home-menu [data-go="${name}"]`);
  }
  await page.waitForFunction(v => ui.view === v, name);
}
async function fab(page, item) {
  await page.click('#fab');
  await page.waitForFunction(() => document.body.classList.contains('fab-open'));
  if (item) await page.click(`#fabMenu [data-fab="${item}"]`);
}
const results = page => page.evaluate(() => [...document.querySelectorAll('#psList [data-psgo="detail"]')].map(b => b.dataset.pskey).join());

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

  // Úvodní animace HALA 2, pak hlavní menu (na telefonu místo Přehledu).
  await page.waitForSelector('#splash:not([hidden])', { timeout: 5000 });
  await page.waitForTimeout(900);
  check(/HALA/.test(await page.textContent('.splash-word')) && await page.textContent('.splash-word .two') === '2', 'animace HALA 2');
  check(/Vedoucí dílny/.test(await page.textContent('#splashSub')), `pozdrav s kartičkou: ${await page.textContent('#splashSub')}`);
  check(await page.isHidden('#fab'), 'plovoucí tlačítko není vidět během animace');
  await page.screenshot({ path: `${shots}/00-splash.png` });
  await page.waitForFunction(() => document.querySelector('#splash').hidden, null, { timeout: 6000 });
  check(await view(page) === 'domu' && await page.evaluate(() => history.state && history.state.odmView === 'domu'), 'po přihlášení hlavní menu');
  check(await page.isHidden('#nav') && await page.isHidden('#fab'), 'na telefonu není postranní menu, v hlavním menu ani plovoucí tlačítko');

  // Manifest a ikony pro přidání na plochu (index.php, CSP manifest-src).
  const man = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const res = await fetch(link.href);
    const json = await res.json();
    const icons = await Promise.all(json.icons.map(async i => { const r = await fetch(new URL(i.src, link.href)); return `${i.sizes} ${i.purpose} ${r.status} ${r.headers.get('content-type')}`; }));
    return { type: res.headers.get('content-type'), json, icons, start: new URL(json.start_url, link.href).pathname };
  });
  check(/application\/manifest\+json/.test(man.type) && man.json.display === 'standalone' && man.start === '/', `manifest: ${man.type} ${JSON.stringify(man.json)}`);
  check(man.icons.filter(i => / 200 image\/png$/.test(i)).length === 3, `ikony: ${man.icons.join(' | ')}`);
  const parsed = await (await ctx.newCDPSession(page)).send('Page.getAppManifest');
  check(!parsed.errors.length, `manifest podle prohlížeče: ${JSON.stringify(parsed.errors)}`);

  // Obsazenost dne: střídání skupin a kapacita jako na ostrých datech, čísla odpovídají výpočtu.
  await page.evaluate(() => {
    S.capReport.s1am = isoWeek(todayIso()).id;
    S.positions.forEach((p, i) => { if (isGroup(p)) p.plan = { v: i % 2 ? 6.5 : 120, unit: i % 2 ? 'h' : 'ks' }; });
    S.employees['dvorak|petr'].sick = todayIso();
    save(); renderAll();
  });
  await page.waitForTimeout(300);
  const sd = await page.evaluate(() => { const d = staffDay(); return { total: d.total, depts: d.depts.length, today: d.today }; });
  const hero = await page.evaluate(() => ({
    am: document.querySelector('.hb.am b').textContent, pm: document.querySelector('.hb.pm b').textContent,
    rows: document.querySelectorAll('.hs-row:not(.hs-th)').length, sub: document.querySelector('.hh-sub').textContent,
    flags: document.querySelector('.hh-flags') ? document.querySelector('.hh-flags').textContent : '',
  }));
  check(+hero.am === sd.total.am && +hero.pm === sd.total.pm && sd.total.am + sd.total.pm > 0, `obsazenost: ${JSON.stringify(hero)} × ${JSON.stringify(sd)}`);
  check(hero.rows === sd.depts, `řádky oddělení: ${hero.rows} × ${sd.depts}`);
  check(sd.today ? /Dnes je/.test(hero.sub) : /Dnes se nepracuje · plán na/.test(hero.sub), `den: ${hero.sub}`);
  check(/1 v nemoci/.test(hero.flags), `štítek nemoci: ${hero.flags}`);
  check(await page.isHidden('#homeView .home-open') && await page.isVisible('.home-hint'), 'menu je zavřené, dokud se nevybere směna');
  await page.screenshot({ path: `${shots}/01-home.png` });
  await page.screenshot({ path: `${shots}/01b-home-full.png`, fullPage: true });

  // Volba směny rozevře menu částí a ukáže rizika dovedností pro tu směnu.
  await page.click('[data-hshift="am"]');
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${shots}/02-unfold.png` });
  await page.waitForTimeout(600);
  const opened = await page.evaluate(() => ({
    on: document.querySelector('.seg').dataset.on, sel: document.querySelector('.home').dataset.sel,
    checked: [...document.querySelectorAll('[data-hshift]')].map(b => b.getAttribute('aria-checked')).join(','),
    tiles: [...document.querySelectorAll('.home-menu .tile')].map(t => t.dataset.go),
    risks: !!document.querySelector('.home-risks, .home-ok'), hint: !!document.querySelector('.home-hint'),
    pmFaded: +getComputedStyle(document.querySelector('.hb.pm')).opacity < 0.7,
  }));
  check(opened.on === 'am' && opened.sel === 'am' && opened.checked === 'true,false,false', `volba směny: ${JSON.stringify(opened)}`);
  check(JSON.stringify(opened.tiles) === JSON.stringify(SECTIONS), `dlaždice menu: ${opened.tiles.join(', ')}`);
  check(opened.risks && !opened.hint && opened.pmFaded, `po volbě rizika, bez nápovědy, odpolední potlačená: ${JSON.stringify(opened)}`);
  await page.screenshot({ path: `${shots}/03-menu.png` });
  await page.click('[data-hshift="both"]');
  await page.waitForTimeout(450);
  check(await page.evaluate(() => document.querySelector('.seg').dataset.on === 'both' && ui.homeShift === 'both'), 'obě směny');
  await page.screenshot({ path: `${shots}/04-both.png` });

  // Dlaždice otevře část; plovoucí tlačítko je vpravo dole.
  await page.click('#homeView .home-menu [data-go="lide"]');
  await page.waitForFunction(() => ui.view === 'lide');
  const fabBox = await page.locator('#fab').boundingBox();
  check(fabBox && fabBox.x + fabBox.width > 390 - 30 && fabBox.y + fabBox.height > 844 - 40, `plovoucí tlačítko vpravo dole: ${JSON.stringify(fabBox)}`);

  // Seznam lidí drží šířku i u vedoucího s mnoha odděleními (2.15).
  await page.evaluate(() => { S.employees['novak|martin'].lead = departments().concat(['Montáž s dlouhým názvem oddělení', 'Expedice a balení']); save(); renderAll(); });
  await page.waitForTimeout(200);
  const listW = await page.evaluate(() => ({ list: document.querySelector('#lList').getBoundingClientRect().right, lead: document.querySelector('#lList .lead-item').getBoundingClientRect().right, vw: document.documentElement.clientWidth }));
  check(listW.list <= listW.vw && listW.lead <= listW.vw, `seznam lidí přetéká: ${JSON.stringify(listW)}`);
  check(await overflow(page) <= 1, 'Lidé bez vodorovného přetečení');
  await page.screenshot({ path: `${shots}/05-lide-vedouci.png` });
  await page.evaluate(() => { delete S.employees['novak|martin'].lead; save(); renderAll(); });

  // Plovoucí menu: Hlavní menu, Vyhledat člověka, Sankce, Top 5, Kontroly.
  await page.evaluate(() => { const b = document.querySelector('#navTop5'); b.hidden = false; b.textContent = '2'; renderFabDot(); });
  check(await page.isVisible('#fabDot'), 'tečka na plovoucím tlačítku při odznaku Top 5');
  await fab(page);
  await page.waitForTimeout(350);
  const menu = await page.evaluate(() => ({
    items: [...document.querySelectorAll('#fabMenu [data-fab]')].map(b => b.dataset.fab),
    labels: [...document.querySelectorAll('#fabMenu .fab-l')].map(b => b.textContent),
    badge: document.querySelector('#fabMenu [data-fab="top5"] .nav-badge')?.textContent,
    exp: document.querySelector('#fab').getAttribute('aria-expanded'), scrim: !document.querySelector('#fabScrim').hidden,
  }));
  check(JSON.stringify(menu.items) === JSON.stringify(['domu', 'search', 'sankce', 'top5', 'kontroly']), `plovoucí menu: ${menu.items.join(', ')}`);
  check(menu.labels.join('|') === 'Hlavní menu|Vyhledat člověka|Sankce|Top 5|Kontroly' && menu.badge === '2' && menu.exp === 'true' && menu.scrim, `plovoucí menu: ${JSON.stringify(menu)}`);
  await page.screenshot({ path: `${shots}/06-fab.png` });
  await page.goBack();
  await page.waitForFunction(() => !ui.fabOpen);
  check(await view(page) === 'lide', 'Zpět zavřel plovoucí menu a zůstalo se v Lidech');
  await page.evaluate(() => renderTop5Badge());
  await fab(page);
  await page.click('#fabScrim', { position: { x: 40, y: 200 } });
  await page.waitForFunction(() => !ui.fabOpen);
  await fab(page, 'sankce');
  await page.waitForFunction(() => ui.view === 'sankce');
  await fab(page, 'kontroly');
  await page.waitForFunction(() => ui.view === 'kontroly');
  await fab(page, 'top5');
  await page.waitForFunction(() => ui.view === 'top5');

  // Vyhledat člověka: jméno, filtr směny, Enter, rychlé akce Sankce a Profil, kartička, ID.
  await fab(page, 'search');
  await page.waitForSelector('#dlg[open] #psQ');
  await page.waitForTimeout(350);
  const dlg = await page.evaluate(() => { const r = document.querySelector('#dlg').getBoundingClientRect(); return { tall: document.querySelector('#dlg').classList.contains('tall'), h: r.height, vh: innerHeight, n: document.querySelectorAll('#psList .ps-row').length, focus: document.activeElement.id }; });
  check(dlg.tall && dlg.h > dlg.vh * 0.9 && dlg.n >= 8 && dlg.focus === 'psQ', `vyhledávání: ${JSON.stringify(dlg)}`);
  await page.screenshot({ path: `${shots}/07-hledat.png` });
  await page.click('#psF [data-psf="am"]');
  const amOnly = await page.evaluate(() => { const mg = staffDay().mg; const keys = [...document.querySelectorAll('#psList [data-psgo="detail"]')].map(b => b.dataset.pskey); return keys.length > 0 && keys.every(k => slotOn(S.employees[k], mg) === 'am'); });
  check(amOnly, 'filtr Ranní ukáže jen lidi ranní směny');
  await page.click('#psF [data-psf=""]');
  await page.fill('#psQ', 'nov');
  await page.waitForTimeout(150);
  check(await results(page) === 'novak|martin', 'hledání podle jména');
  await page.screenshot({ path: `${shots}/08-hledat-nov.png` });
  await page.press('#psQ', 'Enter');
  await page.waitForFunction(() => ui.view === 'lide' && ui.personOpen && ui.selPerson === 'novak|martin' && !document.querySelector('#dlg').open);
  await page.screenshot({ path: `${shots}/09-hledat-detail.png` });
  await fab(page, 'search');
  await page.waitForSelector('#dlg[open] #psQ');
  await page.fill('#psQ', 'dvo');
  await page.click('#psList [data-psgo="sankce"]');
  await page.waitForFunction(() => ui.view === 'sankce' && document.querySelector('#sanWho').value === 'dvorak|petr');
  await fab(page, 'search');
  await page.waitForSelector('#dlg[open] #psQ');
  await page.fill('#psQ', 'pro');
  await page.click('#psList [data-psgo="profil"]');
  await page.waitForFunction(() => ui.view === 'profil' && ui.profileKey === 'prochazka|lukas');
  // kartička: kamera v testu není, ID se zadá jako ze čtečky
  await page.evaluate(() => { S.employees['vesely|tomas'].wid = '777'; navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('NotAllowedError')); });
  await fab(page, 'search');
  await page.waitForSelector('#dlg[open] #psScan');
  await page.click('#psScan');
  await page.waitForSelector('#dlg[open] #scanInput');
  await page.fill('#scanInput', '777');
  await page.press('#scanInput', 'Enter');
  await page.waitForFunction(() => ui.view === 'lide' && ui.selPerson === 'vesely|tomas' && !document.querySelector('#dlg').open, null, { timeout: 8000 });
  await fab(page, 'search');
  await page.waitForSelector('#dlg[open] #psQ');
  await page.fill('#psQ', '0777');
  await page.waitForTimeout(150);
  check(await results(page) === 'vesely|tomas', 'hledání podle ID v evidenci práce (nuly na začátku nevadí)');
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector('#dlg').open);
  check(await view(page) === 'lide', 'Zpět zavřel hledání a zůstalo se v Lidech');

  // Logo otevře hlavní menu; po první volbě směny už rovnou rozbalené.
  await home(page);
  check(await page.isVisible('#homeView .home-menu') && await page.evaluate(() => !document.querySelector('.home-open').classList.contains('unfold')), 'menu po návratu rovnou otevřené');
  check(await page.isHidden('#fab'), 'v hlavním menu není plovoucí tlačítko');
  await page.goBack();
  await page.waitForFunction(() => ui.view === 'lide');
  check(await page.evaluate(() => ui.personOpen && ui.selPerson === 'vesely|tomas'), 'Zpět z hlavního menu vrátil otevřený detail člověka');
  await page.click('#lDetail #pBack');
  await page.waitForFunction(() => !ui.personOpen);

  // Lidé (2.14): detail zakryje seznam, Zpět ho zavře.
  await page.click('#lList [data-key="dvorak|petr"]');
  await page.waitForFunction(() => ui.personOpen && history.state.sub === 'person');
  check(await page.isHidden('#view-lide > .page-head'), 'v detailu není záhlaví seznamu');
  await page.goBack();
  await page.waitForFunction(() => ui.view === 'lide' && !ui.personOpen);

  // Dialog zespodu (2.14); Zpět ho zavře.
  await page.click('#btnAddPerson');
  await page.waitForFunction(() => document.querySelector('#dlg').open);
  await page.waitForTimeout(350);
  const sheet = await page.evaluate(() => { const r = document.querySelector('#dlg').getBoundingClientRect(); return { bottom: r.bottom, width: r.width, vh: innerHeight, vw: document.documentElement.clientWidth }; });
  check(Math.abs(sheet.bottom - sheet.vh) <= 1 && Math.abs(sheet.width - sheet.vw) <= 1, `dialog zespodu: ${JSON.stringify(sheet)}`);
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector('#dlg').open);
  check(await view(page) === 'lide', 'Zpět zavřel dialog');

  // Přehled (2.14): filtry za tlačítkem, úvodní text na dva řádky.
  await nav(page, 'prehled');
  check(await page.isHidden('#ovPos') && await page.isVisible('#ovFilterBtn'), 'filtry přehledu schované');
  await page.click('#ovFilterBtn');
  check(await page.isVisible('#ovPos'), 'filtry po rozbalení');
  await page.click('#ovFilterBtn');
  const lede = await page.evaluate(() => { const l = document.querySelector('#ovLede'); return { h: l.clientHeight, lh: parseFloat(getComputedStyle(l).lineHeight) }; });
  check(lede.h <= lede.lh * 2 + 2, `úvodní text: ${JSON.stringify(lede)}`);

  // Všechny části bez vodorovného přetečení na 390 a 360 px.
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 780 });
    for (const name of ['domu', ...SECTIONS]) {
      if (name === 'domu') await home(page); else await nav(page, name);
      await page.waitForTimeout(150);
      const o = await overflow(page);
      check(o <= 1, `${width} px ${name}: přetečení ${o} px`);
      if (width === 360) await page.screenshot({ path: `${shots}/10-${name}-360.png` });
    }
  }

  // Tmavý režim.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await home(page);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${shots}/11-dark-home.png` });
  await nav(page, 'lide');
  await fab(page);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${shots}/12-dark-fab.png` });
  await page.click('#fabScrim', { position: { x: 40, y: 200 } });
  await page.waitForFunction(() => !ui.fabOpen);
  await page.emulateMedia({ colorScheme: 'light' });

  // Omezené animace (nastavení telefonu): úvodní animace se přeskočí.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => playSplash());
  check(await page.evaluate(() => document.querySelector('#splash').hidden), 'bez animací se úvod neukáže');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // Desktop: postranní menu jako dřív, bez plovoucího tlačítka; logo vede do Přehledu.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(200);
  const desk = await page.evaluate(() => {
    const brand = document.querySelector('.side-brand').getBoundingClientRect();
    const quick = document.querySelector('.side-quick').getBoundingClientRect();
    const period = document.querySelector('.period-box').getBoundingClientRect();
    return {
      visible: [...document.querySelectorAll('#nav > button')].filter(b => getComputedStyle(b).display !== 'none').length,
      navPos: getComputedStyle(document.querySelector('#nav')).position, fab: getComputedStyle(document.querySelector('.fab-wrap')).display,
      row: quick.top < brand.bottom && quick.left > brand.left, below: period.top >= brand.bottom,
      text: getComputedStyle(document.querySelector('.brand-text')).display,
    };
  });
  check(desk.visible === 11 && desk.navPos === 'static' && desk.fab === 'none', `desktop menu: ${JSON.stringify(desk)}`);
  check(desk.row && desk.below && desk.text !== 'none', `desktop logo, historie a období: ${JSON.stringify(desk)}`);
  await page.click('#brandHome');
  await page.waitForFunction(() => ui.view === 'prehled');
  await page.screenshot({ path: `${shots}/13-desktop.png` });

  // Zamknutí z hlavního menu.
  await page.setViewportSize({ width: 390, height: 844 });
  await home(page);
  await page.click('#homeLock');
  await page.waitForSelector('#lockCard');
  await page.waitForFunction(() => document.querySelector('#app').hidden);

  await browser.close();
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
  console.log('e2e Mobil ok');
})().catch(async error => {
  console.error(error);
  if (problems.length) console.log(problems.join('\n'));
  if (global.lastPage) await global.lastPage.screenshot({ path: `${shots}/zz-error.png`, fullPage: true }).catch(() => {});
  process.exit(1);
});
