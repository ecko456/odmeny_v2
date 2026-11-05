// Prohlížečový průchod 2.46: Úkoly (zadání, termín, zodpovědná osoba, stavy, komentáře na časové
// ose, opakování po dokončení, připomínky v menu a nahoře, smazání, historie změn, Excel, telefon,
// tmavý režim). Hodiny stránky stojí na středě 4. 11. 2026. Data jsou vymyšlená.
// Spuštění stejně jako e2e_undo.js; snímky v $S/oshots-ukoly.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-ukoly');
const NOW = new Date('2026-11-04T09:00:00');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

async function watch(page, label) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  page.on('response', r => { if (r.status() >= 400) problems.push(`${label} HTTP ${r.status()} ${r.url()}`); });
  page.on('pageerror', err => problems.push(`${label} pageerror: ${err.message}`));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`)));
}
const saved = page => page.waitForFunction(() => !store.dirty && !store.saving && document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 15000 });
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const text = async (page, sel) => (await page.textContent(sel)).replace(/\s+/g, ' ').trim();
const task = (page, title) => page.evaluate(title => JSON.parse(JSON.stringify(S.tasks.list.filter(t => t.title === title))), title);

async function newTask(page, x) {
  await page.click('#tkNew');
  await page.waitForSelector('#dlg[open] [name="title"]');
  await page.fill('#dlg [name="title"]', x.title);
  if (x.desc) await page.fill('#dlg [name="desc"]', x.desc);
  if (x.due) await page.fill('#dlg [name="due"]', x.due);
  if (x.owner != null) await page.fill('#dlg [name="owner"]', x.owner);
  if (x.repeat) await page.selectOption('#dlg [name="repeat"]', x.repeat);
  if (x.remind != null) await page.selectOption('#dlg [name="remind"]', String(x.remind));
  await page.click('#dlgOk');
  await page.waitForFunction(() => !document.querySelector('#dlg[open]'));
  await saved(page);
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.clock.setFixedTime(NOW);
  const page = await ctx.newPage();
  await watch(page, 'úkoly');
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
  await saved(page);

  // prázdný modul
  check(await page.isHidden('#navTasks'), 'bez úkolů bez odznaku');
  await page.click('#nav [data-view="ukoly"]');
  await page.waitForSelector('#view-ukoly.on #tkView');
  check((await text(page, '#tkView')).includes('Zatím žádné úkoly'), 'prázdný stav');
  check(await page.isHidden('#view-ukoly [data-tkback]'), 'bez detailu bez tlačítka zpět');

  // zadání: zítra (připomenutí 2 dny předem), po termínu, za 3 týdny, bez termínu
  await newTask(page, { title: 'Revize hasicích přístrojů', desc: 'Hala 2, všechny přístroje u vrat.', due: '2026-11-05', owner: 'Petr Novák', repeat: 'month' });
  await newTask(page, { title: 'Objednat brusné kotouče', due: '2026-11-02', owner: 'Jana Dvořáková' });
  await newTask(page, { title: 'Školení BOZP nových lidí', due: '2026-11-25', owner: 'Petr Novák', remind: 7 });
  await newTask(page, { title: 'Úklid skladu nářadí' });
  // prázdný název: dialog nejde potvrdit
  await page.click('#tkNew');
  await page.waitForSelector('#dlg[open]');
  await page.click('#dlgOk');
  check(await page.isVisible('#dlg[open]'), 'bez názvu dialog zůstane');
  await page.click('#dlgCancel');
  await page.waitForFunction(() => !document.querySelector('#dlg[open]'));

  const list = await page.$$eval('#tkList .tk-row b', els => els.map(e => e.textContent));
  check(JSON.stringify(list) === JSON.stringify(['Objednat brusné kotouče', 'Revize hasicích přístrojů', 'Školení BOZP nových lidí', 'Úklid skladu nářadí']), `pořadí podle termínu: ${list}`);
  const dues = await page.$$eval('#tkList .tk-due', els => els.map(e => e.textContent.trim()));
  check(JSON.stringify(dues) === JSON.stringify(['2 dny po termínu', 'zítra', 'za 21 dní', 'bez termínu']), `termíny: ${dues}`);
  const stats = await text(page, '#tkView .stats');
  check(/Otevřené\s*4/.test(stats) && /Po termínu\s*1/.test(stats) && /Blíží se termín\s*1/.test(stats), `dlaždice: ${stats}`);
  check((await text(page, '#navTasks')) === '2' && await page.evaluate(() => document.querySelector('#navTasks').classList.contains('late')), 'odznak 2 (po termínu červeně)');
  check(await page.isHidden('#taskAlert .tk-alert'), 'v Úkolech bez pruhu připomínky');
  await page.screenshot({ path: path.join(shots, '01-seznam.png'), fullPage: true });

  // filtry a hledání
  await page.click('[data-tkf="late"]');
  check(JSON.stringify(await page.$$eval('#tkList .tk-row b', els => els.map(e => e.textContent))) === '["Objednat brusné kotouče"]', 'filtr po termínu');
  await page.click('[data-tkf="open"]');
  await page.selectOption('#tkOwnerF', 'Petr Novák');
  check((await page.$$('#tkList .tk-row')).length === 2, 'filtr zodpovědné osoby');
  await page.selectOption('#tkOwnerF', '');
  await page.fill('#tkQ', 'vrat');
  check(JSON.stringify(await page.$$eval('#tkList .tk-row b', els => els.map(e => e.textContent))) === '["Revize hasicích přístrojů"]', 'hledání v popisu');
  check(await page.evaluate(() => document.activeElement.id === 'tkQ'), 'hledání nepřijde o fokus');
  await page.fill('#tkQ', '');

  // připomínka mimo Úkoly
  await page.click('#nav [data-view="prehled"]');
  const alert = await text(page, '#taskAlert');
  check(/1 po termínu/.test(alert) && /Objednat brusné kotouče/.test(alert) && /Revize hasicích přístrojů/.test(alert), `pruh připomínky: ${alert}`);
  await page.screenshot({ path: path.join(shots, '02-pripominka.png') });
  await page.click('#tkAlertOff');
  check(await page.isHidden('#taskAlert .tk-alert'), 'pruh jde skrýt');
  await page.click('#nav [data-view="matice"]');
  check(await page.isHidden('#taskAlert .tk-alert'), 'skrytý pruh zůstane skrytý');
  await page.click('#nav [data-view="ukoly"]');

  // detail: stav, komentář, osoba, termín z klávesnice
  await page.click('#tkList .tk-row:has-text("Revize hasicích přístrojů")');
  await page.waitForSelector('#tkTitle');
  check(await page.isVisible('[data-tkback]'), 'tlačítko zpět');
  await page.click('[data-tkstate="run"]');
  await saved(page);
  await page.fill('#tkNewC', 'U vrat chybí revizní štítek na dvou přístrojích.');
  await page.press('#tkNewC', 'Control+Enter');
  await saved(page);
  await page.fill('#tkNewC', 'Objednán revizní technik na čtvrtek.');
  await page.click('[data-tkcomment]');
  await saved(page);
  await page.fill('#tkOwner', 'Karel Svoboda');
  await page.press('#tkOwner', 'Enter');
  await saved(page);
  await page.click('#tkDue');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('11062026');
  await page.waitForTimeout(1900);
  await saved(page);
  check(await page.evaluate(() => document.activeElement.id === 'tkDue'), 'pole termínu nepřišlo o fokus');
  let [rev] = await task(page, 'Revize hasicích přístrojů');
  const tl = rev.tl.map(e => e.k + (e.f ? ':' + e.f : ''));
  check(rev.due === '2026-11-06' && rev.owner === 'Karel Svoboda' && rev.state === 'run', `uložené pole: ${JSON.stringify([rev.due, rev.owner, rev.state])}`);
  check(JSON.stringify(tl) === JSON.stringify(['new', 's:state', 'c', 'c', 'f:owner', 'f:due']), `časová osa (termín jedním záznamem): ${tl}`);
  const tlText = await page.$$eval('#tkTl .tk-e', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  check(/Termín: 5\. 11\. 2026 → 6\. 11\. 2026/.test(tlText[0]) && /Zodpovídá: Petr Novák → Karel Svoboda/.test(tlText[1]) && /Objednán revizní technik/.test(tlText[2]) && /Stav: Nový → Rozpracovaný/.test(tlText[4]), `časová osa od nejnovějšího: ${tlText.join(' | ')}`);
  check(tlText.every(t => t.includes('Mistr haly')), 'kdo u záznamů');
  check((await text(page, '#tkHead')).includes('za 2 dny'), 'hlavička po změně termínu');
  await page.screenshot({ path: path.join(shots, '03-detail.png'), fullPage: true });

  // hotovo: opakování založí další úkol (měsíc po termínu)
  await page.click('[data-tkstate="done"]');
  await saved(page);
  const revs = await task(page, 'Revize hasicích přístrojů');
  const nx = revs.find(t => t.state === 'new');
  rev = revs.find(t => t.state === 'done');
  check(revs.length === 2 && nx && nx.due === '2026-12-06' && nx.owner === 'Karel Svoboda' && nx.repeat === 'month' && rev.next === nx.id && rev.doneBy === 'Mistr haly', `opakování: ${JSON.stringify(revs.map(t => [t.state, t.due, t.next]))}`);
  check((await text(page, '#tkView')).includes('další opakování (6. 12. 2026)'), 'odkaz na další opakování');
  await page.click('[data-tkstate="run"]');
  await page.click('[data-tkstate="done"]');
  await saved(page);
  check((await task(page, 'Revize hasicích přístrojů')).length === 2, 'další opakování jen jednou');
  await page.click('text=další opakování (6. 12. 2026)');
  check(await page.inputValue('#tkDue') === '2026-12-06' && (await text(page, '#tkView')).includes('předchozí opakování'), 'otevřené další opakování');

  // smazání komentáře
  await page.click('#tkList .tk-row, [data-tkback]');
  await page.waitForSelector('#tkList');
  await page.click('[data-tkf="all"]');
  await page.click('#tkList .tk-row.closed');
  await page.waitForSelector('[data-tkcdel]');
  const nc = (await page.$$('[data-tkcdel]')).length;
  await page.click('[data-tkcdel] >> nth=0');
  await page.waitForSelector('#dlg[open]');
  await page.click('#dlgOk');
  await page.waitForFunction(n => document.querySelectorAll('[data-tkcdel]').length === n, nc - 1, { timeout: 5000 }).catch(() => problems.push('komentář smazán'));
  await saved(page);

  // smazání úkolu
  await page.click('[data-tkback]');
  await page.click('#tkList .tk-row:has-text("Úklid skladu nářadí")');
  await page.click('[data-tkdel]');
  await page.waitForSelector('#dlg[open]');
  await page.click('#dlgOk');
  await page.waitForFunction(() => !S.tasks.list.some(t => t.title === 'Úklid skladu nářadí') && document.querySelector('#tkList'), null, { timeout: 5000 }).catch(() => {});
  await saved(page);
  check(!(await task(page, 'Úklid skladu nářadí')).length && await page.isVisible('#tkList'), 'úkol smazán, zpět v seznamu');

  // historie změn
  await page.click('#logBtn');
  await page.waitForSelector('#dlg[open] .log-item');
  const log = (await page.$$eval('#dlg .log-item .log-body p', els => els.map(e => e.textContent.replace(/\s+/g, ' ')))).join(' | ');
  for (const t of ['Úkol „Objednat brusné kotouče“ zadán, termín 2. 11. 2026, zodpovídá Jana Dvořáková', 'Úkol „Revize hasicích přístrojů“ – stav:', 'komentář „U vrat chybí revizní štítek', 'Úkol „Úklid skladu nářadí“ smazán', 'Úkol „Revize hasicích přístrojů“ zadán, termín 6. 12. 2026'])
    check(log.includes(t), `historie: ${t}`);
  await page.click('[data-lf="task"]');
  check((await page.$$('#dlg .log-item')).length > 3, 'filtr Úkoly v historii');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#dlg[open]'));

  // Excel
  const [dx] = await Promise.all([page.waitForEvent('download'), page.click('#tkXlsx')]);
  const xp = path.join(shots, dx.suggestedFilename());
  await dx.saveAs(xp);
  const xl = await page.evaluate(async b64 => {
    const X = await xlsx();
    const wb = X.read(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), { type: 'array' });
    return { names: wb.SheetNames, a: X.utils.sheet_to_json(wb.Sheets['Úkoly'], { header: 1 }), b: X.utils.sheet_to_json(wb.Sheets['Časová osa'], { header: 1 }) };
  }, fs.readFileSync(xp).toString('base64'));
  check(dx.suggestedFilename() === 'ukoly-2026-11-04.xlsx' && JSON.stringify(xl.names) === '["Úkoly","Časová osa"]', `Excel: ${dx.suggestedFilename()} ${xl.names}`);
  check(xl.a.length === 5 && xl.a[1][0] === 'Objednat brusné kotouče' && xl.a[1][8] === 'po termínu' && xl.a[1][1] === 'úkol' && xl.b.some(r => r[3] === 'komentář' && /U vrat chybí revizní štítek/.test(r[4])) && !xl.b.some(r => /Objednán revizní technik/.test(r[4])), `Excel řádky: ${JSON.stringify(xl.a.slice(0, 2))}`);

  // úvod na telefonu, plovoucí menu, detail a Zpět
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { ui.homeShift = 'both'; showView('domu'); });
  await page.waitForSelector('#view-domu.on');
  const tile = await page.evaluate(() => { const t = document.querySelector('#homeView [data-go="ukoly"], #homeView [data-tile="ukoly"], #homeView [data-view="ukoly"]'); return t ? t.textContent.replace(/\s+/g, ' ') : ''; });
  check(/Úkoly/.test(tile) && /po termínu/.test(tile), `dlaždice úvodu: ${tile}`);
  await page.evaluate(() => showView('ukoly'));
  check(await overflow(page) <= 0, `telefon seznam bez přetečení: ${await overflow(page)}`);
  await page.screenshot({ path: path.join(shots, '04-telefon.png'), fullPage: true });
  await page.click('#tkList .tk-row >> nth=0');
  await page.waitForSelector('#tkTitle');
  check(await page.isHidden('#view-ukoly .page-head'), 'telefon: detail bez záhlaví');
  check(await overflow(page) <= 0, `telefon detail bez přetečení: ${await overflow(page)}`);
  await page.screenshot({ path: path.join(shots, '05-telefon-detail.png'), fullPage: true });
  await page.goBack();
  await page.waitForSelector('#tkList');
  check(await page.isVisible('#view-ukoly.on'), 'Zpět zavře detail a zůstane v Úkolech');

  // tmavý režim
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.click('#tkList .tk-row >> nth=0');
  await page.screenshot({ path: path.join(shots, '06-tmavy.png'), fullPage: true });

  await browser.close();
  if (problems.length) { console.log('PROBLÉMY:\n' + problems.join('\n')); process.exit(1); }
  console.log('úkoly ok');
})().catch(e => { console.error(e); process.exit(1); });
