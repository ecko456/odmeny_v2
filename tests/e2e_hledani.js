// Prohlížečový průchod 2.56: kolonka Hledat člověka v menu na PC (pod Hodnoceným obdobím).
// Ověří: hledání podle jména, příjmení, části jména, ID (i s nulami na začátku), pořadí
// (shoda ID první), šipky a Enter, klik myší, Escape, zkratku „/“, otevření v Lidech,
// vyřazené na konci, na telefonu kolonka není (tam je Vyhledat člověka v plovoucím menu),
// CSP bez chyb. Spuštění stejně jako e2e_undo.js; snímky v $S/oshots-hledani.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-hledani');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`console: ${msg.text()}`); });
  page.on('pageerror', err => problems.push(`pageerror: ${err.message}`));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`)));
  await page.goto(BASE);
  await page.waitForSelector('#setupForm');
  await page.fill('[name="token"]', fs.readFileSync(process.env.TOKEN_FILE || path.join(S, 'odme2e', 'setup-token.txt'), 'utf8').trim());
  await page.fill('[name="label"]', 'Mistr haly');
  await page.click('#setupForm button[type="submit"]');
  await page.waitForSelector('.odm-card');
  await page.check('#saved');
  await page.click('#finish');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');

  // kolonka je pod Hodnoceným obdobím
  const pos = await page.evaluate(() => {
    const a = document.querySelector('.period-box').getBoundingClientRect(), b = document.querySelector('#sideQ').getBoundingClientRect();
    return { below: b.top >= a.bottom - 1, left: Math.abs(b.left - a.left) < 40, visible: b.width > 120 };
  });
  check(pos.below && pos.left && pos.visible, `kolonka pod Hodnoceným obdobím: ${JSON.stringify(pos)}`);

  // vymyšlení lidé z ukázky: dva s ID, jeden vyřazený
  const people = await page.evaluate(() => {
    const list = Object.values(S.employees).filter(e => !isLead(e)).sort((a, b) => a.key.localeCompare(b.key));
    const [a, b, c] = list;
    a.wid = '00471'; b.wid = '4712'; c.excluded = true;
    save();
    return { a: { key: a.key, first: a.first, last: a.last }, b: { key: b.key, last: b.last }, c: { key: c.key, first: c.first, last: c.last } };
  });
  await page.waitForFunction(() => !store.dirty && !store.saving, null, { timeout: 15000 });

  const rows = () => page.$$eval('#sideQList .side-qrow', els => els.map(e => ({ key: e.dataset.sideq, on: e.classList.contains('on'), text: e.textContent })));
  // příjmení
  await page.click('#sideQ');
  await page.keyboard.type(people.a.last.slice(0, 4));
  await page.waitForSelector('#sideQList:not([hidden]) .side-qrow');
  let r = await rows();
  check(r.some(x => x.key === people.a.key) && r[0].on, `hledání podle příjmení: ${r.map(x => x.text).join(' | ')}`);
  await page.screenshot({ path: path.join(shots, '01-hledani.png') });
  // jméno a příjmení obráceně
  await page.fill('#sideQ', `${people.a.first} ${people.a.last}`);
  r = await rows();
  check(r.length >= 1 && r[0].key === people.a.key, 'jméno a příjmení');
  // ID s nulami na začátku i bez nich, přesná shoda první
  await page.fill('#sideQ', '471');
  r = await rows();
  check(r[0] && r[0].key === people.a.key && /ID 00471/.test(r[0].text), `ID bez nul: ${r.map(x => x.text).join(' | ')}`);
  check(r.some(x => x.key === people.b.key), 'ID, které číslo obsahuje, je také v seznamu (až za přesnou shodou)');
  await page.fill('#sideQ', '4712');
  r = await rows();
  check(r[0] && r[0].key === people.b.key, 'přesné ID 4712');
  // šipka dolů + Enter otevře člověka v Lidech
  await page.fill('#sideQ', '471');
  await page.keyboard.press('ArrowDown');
  r = await rows();
  check(r[1] && r[1].on, 'šipka dolů posune výběr');
  const target = r[1].key;
  await page.keyboard.press('Enter');
  await page.waitForSelector('#view-lide.on');
  await page.waitForFunction(k => ui.selPerson === k, target);
  check(await page.inputValue('#sideQ') === '' && await page.isHidden('#sideQList'), 'po výběru se kolonka vyčistí');
  check(await page.evaluate(k => document.querySelector('#peopleSplit, #view-lide').textContent.includes(S.employees[k].last), target), 'detail vybraného člověka v Lidech');
  // vyřazený je na konci
  await page.fill('#sideQ', people.c.last.slice(0, 3));
  r = await rows();
  const cIx = r.findIndex(x => x.key === people.c.key);
  check(cIx === -1 || r.slice(cIx + 1).every(x => /vyřazen/.test(x.text)), 'vyřazený až na konci');
  // Escape vyčistí
  await page.keyboard.press('Escape');
  check(await page.inputValue('#sideQ') === '' && await page.isHidden('#sideQList'), 'Escape vyčistí hledání');
  // nikdo takový
  await page.click('#sideQ');
  await page.keyboard.type('zzzqqq');
  check(/Nikdo takový/.test(await page.textContent('#sideQList')), 'prázdný výsledek');
  await page.keyboard.press('Escape');
  // „/“ skočí do hledání, klik myší vybere
  await page.click('main h1, #main', { position: { x: 5, y: 5 } }).catch(() => {});
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('/');
  check(await page.evaluate(() => document.activeElement && document.activeElement.id === 'sideQ'), 'zkratka / skočí do hledání');
  await page.keyboard.type(people.b.last);
  await page.click(`#sideQList [data-sideq="${people.b.key}"]`);
  await page.waitForFunction(k => ui.selPerson === k && ui.view === 'lide', people.b.key);
  // „/“ v poli se píše normálně
  await page.click('#sideQ');
  await page.keyboard.type('a/b');
  check(await page.inputValue('#sideQ') === 'a/b', 'lomítko v poli se zapíše');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: path.join(shots, '02-lide.png') });
  // tmavý i světlý režim: kolonka čitelná
  const st = await page.$eval('#sideQ', el => getComputedStyle(el).color);
  check(st && st !== 'rgba(0, 0, 0, 0)', 'barva textu kolonky');
  // telefon: kolonka v menu není (tam je Vyhledat člověka v plovoucím menu), stránka nepřetéká
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  check(await page.$eval('#sideSearch', el => getComputedStyle(el).display === 'none'), 'na telefonu kolonka v menu není');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(over <= 1, `telefon bez přetečení: ${over}`);
  await page.keyboard.press('/');
  check(await page.evaluate(() => document.activeElement && document.activeElement.id !== 'sideQ'), 'na telefonu zkratka / nic nedělá');
  await ctx.close();

  await browser.close();
  if (problems.length) {
    console.log('PROBLÉMY:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
  console.log('hledání v menu ok');
})().catch(err => { console.error(err); process.exit(1); });
