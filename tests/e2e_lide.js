// Prohlížečový průchod Lidmi (verze 2.23): filtry seznamu (oddělení a skupina, bez skupiny, bez
// směny, bez hodnocení, nemoc, vedoucí, vyřazení) s počty, člověk, který po úpravě z filtru
// vypadne, zůstane označený, dokud se nevybere jiný, hledání ve filtru, osobní nastavení.
// Na velkém monitoru Lidé využijí celou šířku a hodnocení 0–4 je v jednom řádku. Nakonec report
// kapacit s lidmi v zaškolování, telefon a tmavý režim.
// Spuštění stejně jako e2e_browser.js:
//   ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t . dev-router.php &
//   curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state
//   NO_PROXY=127.0.0.1 PW=$(npm root -g)/playwright S=$S node tests/e2e_lide.js
// Snímky se uloží do $S/oshots-lide. Všechna data jsou vymyšlená.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-lide');
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
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const names = page => page.$$eval('#lList .list-item .nm > b', els => els.map(e => e.childNodes[0].textContent.trim()));
const chips = page => page.$$eval('#lFilters [data-lst]', els => Object.fromEntries(els.map(e => [e.dataset.lst || 'all', +e.querySelector('.num').textContent])));

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 2560, height: 1300 } });
  const page = await ctx.newPage();
  global.lastPage = page;
  await watch(page, 'lide');
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

  // Ukázková data (8 lidí) + lidé, kteří čekají na zařazení, a druhá skupina v oddělení CNC.
  await page.evaluate(() => {
    const add = (key, o) => { S.employees[key] = { key, ...o }; };
    const cnc = S.positions.find(p => p.name === 'CNC');
    S.positions.push({ ...cnc, id: 'gCNC2', name: 'CNC – seřizovači', dept: 'CNC', skillset: cnc.skillset.map(x => ({ ...x, id: `${x.id}2` })), plan: undefined });
    add('x1', { first: 'Adam', last: 'Bez Skupiny' });
    add('x2', { first: 'Bára', last: 'Bez Směny', positionId: cnc.id });
    add('x3', { first: 'Cyril', last: 'Nový', positionId: 'gCNC2', shift: 'S2' });
    Object.values(S.employees).find(e => e.last === 'Novák').sick = todayIso();
    S.positions = sanitizeState(S).positions;
    save(); renderAll();
  });

  // Velký monitor: Lidé přes celou šířku, širší seznam, hodnocení 0–4 v jednom řádku.
  await page.click('#nav [data-view="lide"]');
  await page.waitForSelector('#lList .list-item');
  const lay = await page.evaluate(() => {
    const w = s => document.querySelector(s).getBoundingClientRect().width;
    const tops = [...document.querySelectorAll('#lDetail .rate-seg')].slice(0, 2).map(g => new Set([...g.querySelectorAll('button')].map(b => Math.round(b.getBoundingClientRect().top))).size);
    return { main: w('#main'), list: w('#peopleSplit .split-list'), detail: w('#peopleSplit .split-detail'), rows: tops };
  });
  check(lay.main > 2000 && lay.list >= 450 && lay.list <= 520 && lay.detail > 1300 && lay.rows.length && lay.rows.every(n => n === 1), `Lidé na velkém monitoru: ${JSON.stringify(lay)}`);
  await page.screenshot({ path: path.join(shots, '10-lide-2560.png') });

  // Počty u filtrů.
  check(JSON.stringify(await chips(page)) === JSON.stringify({ all: 11, nogroup: 1, noshift: 2, norate: 2, sick: 1, lead: 0, out: 0 }), `počty filtrů: ${JSON.stringify(await chips(page))}`);

  // Bez skupiny → vybere se první, kdo filtru odpovídá.
  await page.click('#lFilters [data-lst="nogroup"]');
  check(JSON.stringify(await names(page)) === '["Bez Skupiny Adam"]' && await page.evaluate(() => ui.selPerson === 'x1' && P.lideF.st === 'nogroup'), `bez skupiny: ${await names(page)}`);
  check(/Zobrazeno 1 z 11/.test(await page.textContent('#lFilters .lcount')), 'počet zobrazených');

  // Bez směny: Adam po zařazení na směnu zůstane v seznamu označený, dokud se nevybere jiný.
  await page.click('#lFilters [data-lst="noshift"]');
  check(JSON.stringify(await names(page)) === '["Bez Skupiny Adam","Bez Směny Bára"]', `bez směny: ${await names(page)}`);
  await page.selectOption('#lDetail #pShift', 'S1');
  await page.waitForFunction(() => S.employees.x1.shift === 'S1');
  await page.waitForSelector('#lList .list-item.held');
  check(/mimo filtr/.test(await page.textContent('#lList [data-key="x1"]')) && /Zobrazeno 1 z 11/.test(await page.textContent('#lFilters .lcount')) && await page.evaluate(() => ui.selPerson === 'x1'), 'zařazený člověk zůstane vybraný a označený');
  await page.click('#lList [data-key="x2"]');
  await page.waitForFunction(() => ui.selPerson === 'x2');
  check(JSON.stringify(await names(page)) === '["Bez Směny Bára"]', `po výběru jiného zmizí: ${await names(page)}`);

  // Opětovný klik filtr vypne; oddělení CNC (celé) a jedna jeho skupina.
  await page.click('#lFilters [data-lst="noshift"]');
  await page.waitForFunction(() => document.querySelectorAll('#lList .list-item').length === 11);
  const opts = await page.$$eval('#lScope optgroup', els => els.map(g => [g.label, [...g.querySelectorAll('option')].map(o => o.textContent)]));
  check(JSON.stringify(opts) === JSON.stringify([['CNC', ['Celé oddělení CNC', 'CNC', 'CNC – seřizovači']]]), `oddělení se dvěma skupinami: ${JSON.stringify(opts)}`);
  await page.selectOption('#lScope', 'd:CNC');
  check(JSON.stringify(await names(page)) === '["Bez Směny Bára","Dvořák Petr","Novák Martin","Nový Cyril"]', `oddělení CNC: ${await names(page)}`);
  check(JSON.stringify(await chips(page)) === JSON.stringify({ all: 4, nogroup: 0, noshift: 1, norate: 2, sick: 1, lead: 0, out: 0 }), `počty v oddělení: ${JSON.stringify(await chips(page))}`);
  await page.selectOption('#lScope', 'gCNC2');
  check(JSON.stringify(await names(page)) === '["Nový Cyril"]' && await page.evaluate(() => ui.selPerson === 'x3'), `skupina: ${await names(page)}`);
  await page.selectOption('#lScope', 'd:CNC');
  await page.click('#lFilters [data-lst="norate"]');
  check(JSON.stringify(await names(page)) === '["Bez Směny Bára","Nový Cyril"]', `bez hodnocení: ${await names(page)}`);
  await page.click('#lFilters [data-lst="sick"]');
  check(JSON.stringify(await names(page)) === '["Novák Martin"]', `v nemoci: ${await names(page)}`);

  // Hledání uvnitř filtru, prázdný výsledek, zrušení filtru.
  await page.click('#lFilters [data-lst="sick"]');
  await page.fill('#lSearch', 'dvo');
  check(JSON.stringify(await names(page)) === '["Dvořák Petr"]' && await page.evaluate(() => ui.selPerson === Object.values(S.employees).find(e => e.last === 'Dvořák').key), 'hledání vybere, koho najde');
  await page.fill('#lSearch', '');
  await page.click('#lFilters [data-lst="lead"]');
  check(/Nikdo neodpovídá filtru/.test(await page.textContent('#lList')), 'prázdný filtr');
  await page.click('#lFilters [data-lclear]');
  await page.waitForFunction(() => document.querySelectorAll('#lList .list-item').length === 11 && !P.lideF.g && !P.lideF.st);
  check(!(await page.$('#lFilters .lcount')), 'bez filtru se počet neukazuje');

  // Osobní nastavení: filtr se uloží (a čištění ho nezahodí).
  await page.selectOption('#lScope', 'd:Daiho');
  await page.waitForFunction(() => !prefStore.dirty && !prefStore.saving, null, { timeout: 10000 });
  check(await page.evaluate(() => JSON.stringify(cleanPrefs(JSON.parse(JSON.stringify(P))).lideF) === '{"g":"d:Daiho","st":""}' && cleanPrefs({ lideF: { g: 'x', st: 'nesmysl' } }).lideF.st === ''), 'filtr v osobním nastavení');
  await page.selectOption('#lScope', '');

  // Report kapacit: lidé v zaškolování zvlášť.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.click('#nav [data-view="matice"]');
  await page.click('[data-mxtab="cap"]');
  await page.waitForSelector('#capView .cap-table');
  const tr = await page.evaluate(() => ({ cells: document.querySelectorAll('#capView .cap-tr').length, note: /v zaškolování/.test(document.querySelector('#capView .note.i').textContent),
    group: /schopní \d+, v zaškolování \d+/.test(document.querySelector('#capView .cap-group p').textContent) }));
  check(tr.cells > 0 && tr.note && tr.group, `v zaškolování v reportu: ${JSON.stringify(tr)}`);
  await page.screenshot({ path: path.join(shots, '11-kapacita.png'), fullPage: true });

  // Telefon: filtry nad seznamem, nic nepřetéká.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#nav [data-view="lide"]').catch(() => page.evaluate(() => showView('lide')));
  await page.evaluate(() => { ui.personOpen = false; showView('lide'); renderPeople(); });
  await page.waitForSelector('#lFilters [data-lst="noshift"]');
  await page.click('#lFilters [data-lst="noshift"]');
  check(await overflow(page) <= 1 && await page.isVisible('#lScope'), `telefon: přetečení ${await overflow(page)} px`);
  await page.screenshot({ path: path.join(shots, '12-telefon.png') });
  await page.evaluate(() => { showView('matice'); });
  await page.click('[data-mxtab="cap"]').catch(() => {});
  await page.waitForTimeout(300);
  check(await overflow(page) <= 1, `telefon kapacita: přetečení ${await overflow(page)} px`);
  await page.screenshot({ path: path.join(shots, '13-telefon-kapacita.png'), fullPage: true });

  // Tmavý režim.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => { showView('lide'); renderPeople(); });
  await page.screenshot({ path: path.join(shots, '20-tmavy.png') });

  await browser.close();
  if (problems.length) { console.log(`PROBLÉMY (${problems.length}):\n- ${problems.join('\n- ')}`); process.exit(1); }
  console.log('e2e Lidé ok');
})().catch(async error => {
  console.error(error);
  if (problems.length) console.log(problems.join('\n'));
  if (global.lastPage) await global.lastPage.screenshot({ path: `${shots}/zz-error.png`, fullPage: true }).catch(() => {});
  process.exit(1);
});
