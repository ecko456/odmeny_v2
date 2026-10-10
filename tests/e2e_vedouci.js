// Prohlížečový průchod vedoucími pracovníky (verze 2.7): přidání vedoucího s odděleními,
// oddíl „Vedoucí pracovníci“ v Lidech, zaškrtávání oddělení, z běžného člověka vedoucí
// a zpátky. Vedoucí se nepočítá do přehledu (tabáky, Kafe, prémie), sankcí, kontrol ani
// kapacity; v Matici dovedností je v pásu „Vedoucí oddělení“ (i při filtru skupiny).
// Na konci uložená data, historie změn, mobil a tmavý režim.
// Spuštění stejně jako e2e_browser.js:
//   ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t . dev-router.php &
//   curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state
//   NO_PROXY=127.0.0.1 PW=$(npm root -g)/playwright S=$S node tests/e2e_vedouci.js
// Snímky do $S/oshots-ved.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-ved');
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
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  global.lastPage = page;
  await watch(page, 'vedoucí');
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

  // Ukázková data: oddělení a člověk z prvního z nich.
  const info = await page.evaluate(() => {
    const deps = departments();
    const w = Object.values(S.employees).find(e => empDept(e) === deps[0] && !e.excluded && activeRows().some(r => r.e.key === e.key));
    return { deps, worker: w.key, workerName: `${w.last} ${w.first}` };
  });
  check(info.deps.length >= 2, `ukázková data mají aspoň dvě oddělení: ${info.deps}`);
  const [d1, d2] = info.deps;

  // Přidat vedoucího: dialog s volbou vedoucího a oddělení.
  await page.click('#nav [data-view="lide"]');
  await page.click('#btnAddPerson');
  await page.waitForSelector('#dlg[open] [name="lead"]');
  check(await page.isHidden('#dlg .lead-pick'), 'oddělení se ukážou až po zaškrtnutí vedoucího');
  await page.fill('#dlg [name="value"]', 'Karel Šéf');
  await page.check('#dlg [name="lead"]');
  await page.waitForSelector('#dlg .lead-pick:not([hidden])');
  await page.check(`#dlg [data-newdept="${d1}"]`);
  await page.screenshot({ path: `${shots}/01-add-dialog.png` });
  await page.click('#dlgOk');
  await page.waitForSelector('#lDetail [data-leaddept]');
  check(/Vedoucí pracovník/.test(await page.textContent('#lDetail .eyebrow')), 'detail vedoucího');
  check(await page.isChecked(`#lDetail [data-leaddept="${d1}"]`) && !(await page.isChecked(`#lDetail [data-leaddept="${d2}"]`)), 'zaškrtnuté oddělení z dialogu');
  check(!(await page.$('#lDetail #pPos')) && !(await page.$('#lDetail .rate-card')), 'vedoucí nemá skupinu ani hodnocení dovedností');
  await page.check(`#lDetail [data-leaddept="${d2}"]`);
  await page.waitForFunction(([d1, d2]) => JSON.stringify(S.employees['sef|karel'].lead) === JSON.stringify([d1, d2]), [d1, d2]);
  const list = (await page.textContent('#lList')).replace(/\s+/g, ' ');
  check(/Vedoucí pracovníci/.test(list) && list.includes(`Šéf Karel${d1}, ${d2} vedoucí`), `seznam: oddíl vedoucích (${list.slice(-160)})`);
  await saved(page);
  await page.screenshot({ path: `${shots}/02-lead-detail.png`, fullPage: true });

  // Z běžného člověka vedoucí: zmizí z přehledu, sankcí, kontrol a kapacity.
  await page.click(`#lList [data-key="${info.worker}"]`);
  await page.waitForSelector('#lDetail #pLead');
  check(!(await page.isChecked('#lDetail #pLead')), 'běžný člověk není vedoucí');
  await page.check('#lDetail #pLead');
  await page.waitForSelector('#lDetail [data-leaddept]');
  check(await page.isChecked(`#lDetail [data-leaddept="${d1}"]`), 'předvyplněné oddělení podle skupiny');
  await page.click('#nav [data-view="prehled"]');
  check(!(await page.$(`#ovBody tr[data-key="${info.worker}"]`)), 'vedoucí není v přehledu tabáků');
  await page.click('#nav [data-view="sankce"]');
  check(!(await page.$(`#sanWho option[value="${info.worker}"]`)) && !(await page.$('#sanWho option[value="sef|karel"]')), 'vedoucí není v nabídce sankcí');
  const outside = await page.evaluate(([key, d]) => ({ kt: audPeople(d).some(e => e.key === key),
    grid: skillGrid(null, '*').rows.some(r => r.e.key === key), rows: activeRows().some(r => r.e.key === key) }), [info.worker, d1]);
  check(!outside.kt && !outside.grid && !outside.rows, `vedoucí mimo kontroly, matici lidí a hodnocení: ${JSON.stringify(outside)}`);

  // Matice dovedností: pás „Vedoucí oddělení“.
  await page.click('#nav [data-view="matice"]');
  await page.waitForSelector('#matrixView .mx-leads');
  const band = (await page.textContent('#matrixView .mx-leads')).replace(/\s+/g, ' ');
  check(band.includes(d1) && band.includes(info.workerName) && band.includes('Šéf Karel'), `pás vedoucích: ${band}`);
  check(!(await page.$(`#matrixView tbody [data-mxperson="${info.worker}"]`)), 'vedoucí není mezi řádky matice');
  await page.screenshot({ path: `${shots}/03-matrix.png`, fullPage: true });
  const g2 = await page.evaluate(d => S.positions.find(p => isGroup(p) && groupSkills(p).length && deptOf(p) === d).id, d2);
  await page.selectOption('#matrixGroup', g2);
  await page.waitForTimeout(150);
  const band2 = (await page.textContent('#matrixView .mx-leads')).replace(/\s+/g, ' ');
  check(band2.includes(d2) && !band2.includes(info.workerName) && band2.includes('Šéf Karel'), `pás při filtru skupiny: ${band2}`);
  await page.selectOption('#matrixGroup', '');
  await page.click('#matrixView .mx-leads [data-mxperson="sef|karel"]');
  await page.waitForSelector('#view-lide.on #lDetail [data-leaddept]');
  check(/Šéf Karel/.test(await page.textContent('#lDetail h2')), 'klik na vedoucího v matici otevře jeho detail');

  // Zpátky běžný člověk.
  await page.click(`#lList [data-key="${info.worker}"]`);
  await page.waitForSelector('#lDetail #pLead');
  await page.uncheck('#lDetail #pLead');
  await page.waitForSelector('#lDetail #pPos');
  await page.click('#nav [data-view="prehled"]');
  check(!!(await page.$(`#ovBody tr[data-key="${info.worker}"]`)), 'po zrušení je zase v přehledu');
  await saved(page);

  // Uložená data a historie změn.
  const stored = await page.evaluate(async key => {
    const st = (await Vault.loadData()).state;
    return { karel: st.employees['sef|karel'].lead, worker: 'lead' in st.employees[key], log: st.log.filter(e => e.kind === 'person').map(e => e.text) };
  }, info.worker);
  check(JSON.stringify(stored.karel) === JSON.stringify([d1, d2]) && stored.worker === false, `uložená data: ${JSON.stringify(stored.karel)} ${stored.worker}`);
  check(stored.log.some(t => t === `${info.workerName} je vedoucí pracovník (${d1})`) && stored.log.some(t => t === `${info.workerName} už není vedoucí pracovník`), `historie změn: ${stored.log.slice(-6).join(' | ')}`);

  // Mobil a tmavý režim (na mobilu je menu schované: pohled se přepne předem).
  await page.click('#nav [data-view="lide"]');
  await page.click('#lList [data-key="sef|karel"]');
  await page.waitForSelector('#lDetail [data-leaddept]');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  check(await overflow(page) <= 1, 'mobil: detail vedoucího bez přetečení');
  await page.screenshot({ path: `${shots}/04-mobile-lead.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.click('#nav [data-view="matice"]');
  await page.waitForSelector('#matrixView .mx-leads');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  check(await overflow(page) <= 1, 'mobil: matice bez přetečení stránky');
  await page.screenshot({ path: `${shots}/05-mobile-matrix.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${shots}/06-dark-matrix.png` });
  await page.click('#nav [data-view="lide"]');
  await page.click('#lList [data-key="sef|karel"]');
  await page.screenshot({ path: `${shots}/07-dark-lead.png`, fullPage: true });

  await browser.close();
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
  console.log('e2e Vedoucí ok');
})().catch(async error => {
  console.error(error);
  if (problems.length) console.log(problems.join('\n'));
  if (global.lastPage) await global.lastPage.screenshot({ path: `${shots}/zz-error.png`, fullPage: true }).catch(() => {});
  process.exit(1);
});
