// Prohlížečový průchod vedoucími pracovníky (verze 2.7): přidání vedoucího s odděleními,
// oddíl „Vedoucí pracovníci“ v Lidech, zaškrtávání oddělení, z běžného člověka vedoucí
// a zpátky. Vedoucí se nepočítá do přehledu (tabáky, Kafe, prémie), sankcí, kontrol ani
// kapacity; v Matici dovedností je v pásu „Vedoucí oddělení“ (i při filtru skupiny).
// Dovednosti vedoucích (2.10): společný seznam v záložce Vedoucí, hodnocení 0–4 v matici
// vedoucích i v detailu vedoucího, list Vedoucí v Excelu.
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
  check(!(await page.$('#lDetail #pPos')) && !(await page.$('#lDetail .rate-card')), 'vedoucí nemá skupinu ani hodnocení dovedností skupiny');
  check(/Zatím žádné dovednosti vedoucích/.test(await page.textContent('#lDetail .lead-rate')), 'detail vedoucího: zatím bez dovedností vedoucích');
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
  await saved(page);   // zapnutí se uloží zvlášť, ať ho historie změn zachytí
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

  // Dovednosti vedoucích (2.10): z detailu vedoucího do záložky Vedoucí, přidat dvě dovednosti.
  await page.click('#lDetail [data-goleads]');
  await page.waitForSelector('#view-matice.on #mxPanelLeads:not([hidden]) #leadSkillAdd');
  check(await page.isHidden('#mxPanelMatrix'), 'záložka Vedoucí skryje matici lidí');
  for (const [name, desc] of [['Vedení lidí', 'Porady, zpětná vazba, rozdělení práce'], ['Plánování směn', '']]) {
    await page.click('#leadSkillAdd');
    await page.waitForSelector('#dlg[open] [name="name"]');
    await page.fill('#dlg [name="name"]', name);
    if (desc) await page.fill('#dlg [name="desc"]', desc);
    if (name === 'Vedení lidí') await page.screenshot({ path: `${shots}/08-lead-skill-dialog.png` });
    await page.click('#dlgOk');
    await page.waitForFunction(n => S.leadSkills.some(x => x.name === n), name);
  }
  await page.waitForSelector('#leadView .lead-matrix');
  const leadRows = await page.$$eval('#leadView .lead-matrix tbody tr', rows => rows.map(r => r.querySelector('.mx-name').textContent.trim()));
  check(leadRows.length === 2 && leadRows.includes('Šéf Karel') && leadRows.includes(info.workerName), `matice vedoucích: ${leadRows}`);
  const ls = await page.evaluate(() => S.leadSkills.map(x => x.id));
  // klik do matice: Karel Vedení lidí 0 → 1 → 2
  for (let i = 0; i < 2; i += 1) {
    await page.click(`#leadView [data-mxr="sef|karel"][data-skill="${ls[0]}"]`);
  }
  await page.waitForFunction(id => (S.employees['sef|karel'].rate || {})[id] === 2, ls[0]);
  check(/^25\s*%$/.test((await page.textContent('#leadView .lead-matrix tbody tr:has([data-mxperson="sef|karel"]) .mx-pct')).trim()), 'matice vedoucích: průměr (2 + 0) / 2 = 25 %');
  // pořadí: Plánování směn nahoru
  await page.click(`#leadView [data-lsrow="${ls[1]}"] [data-lsup]`);
  await page.waitForFunction(id => S.leadSkills[0].id === id, ls[1]);
  await saved(page);
  await page.screenshot({ path: `${shots}/09-lead-matrix.png`, fullPage: true });

  // hodnocení v detailu vedoucího
  await page.click('#leadView [data-mxperson="sef|karel"]');
  await page.waitForSelector('#view-lide.on #lDetail .lead-rate .rate-row');
  await page.click(`#lDetail .lead-rate [data-rate="${ls[1]}"][data-lvl="4"]`);
  await page.waitForFunction(id => (S.employees['sef|karel'].rate || {})[id] === 4, ls[1]);
  check(/Průměr\s*75\s*%/.test(await page.textContent('#lDetail .lead-rate')), `detail vedoucího: průměr 75 % (${(await page.textContent('#lDetail .lead-rate .card-head')).replace(/\s+/g, ' ')})`);
  await saved(page);
  await page.screenshot({ path: `${shots}/10-lead-rate.png`, fullPage: true });

  // přejmenování a Excel s listem Vedoucí
  await page.click('#nav [data-view="matice"]');
  await page.waitForSelector('#leadView .lead-matrix');
  await page.click(`#leadView [data-lsrow="${ls[1]}"] [data-lsedit]`);
  await page.waitForSelector('#dlg[open] [name="name"]');
  await page.fill('#dlg [name="name"]', 'Plánování výroby');
  await page.click('#dlgOk');
  await page.waitForFunction(id => S.leadSkills.find(x => x.id === id).name === 'Plánování výroby', ls[1]);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnMatrixXlsx')]);
  const xlsxPath = path.join(shots, 'matice.xlsx');
  await download.saveAs(xlsxPath);
  const sheet = await page.evaluate(async b64 => {
    const X = await xlsx();
    const wb = X.read(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), { type: 'array' });
    return wb.SheetNames.includes('Vedoucí') ? X.utils.sheet_to_json(wb.Sheets['Vedoucí'], { header: 1 }) : null;
  }, fs.readFileSync(xlsxPath).toString('base64'));
  check(sheet && JSON.stringify(sheet[1]) === JSON.stringify(['Příjmení', 'Jméno', 'Oddělení', 'Dovednosti %', 'Plánování výroby', 'Vedení lidí'])
    && sheet.some(r => r[0] === 'Šéf' && r[3] === 75 && r[4] === 4 && r[5] === 2), `Excel, list Vedoucí: ${JSON.stringify(sheet && sheet.slice(1, 4))}`);
  await saved(page);

  // Zpátky běžný člověk.
  await page.click('#nav [data-view="lide"]');
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
    return { karel: st.employees['sef|karel'].lead, worker: 'lead' in st.employees[key], log: st.log.filter(e => e.kind === 'person').map(e => e.text),
      skills: st.leadSkills.map(x => x.name), rate: st.employees['sef|karel'].rate, all: st.log.map(e => e.text) };
  }, info.worker);
  check(JSON.stringify(stored.karel) === JSON.stringify([d1, d2]) && stored.worker === false, `uložená data: ${JSON.stringify(stored.karel)} ${stored.worker}`);
  check(stored.log.some(t => t === `${info.workerName} je vedoucí pracovník (${d1})`) && stored.log.some(t => t === `${info.workerName} už není vedoucí pracovník`), `historie změn: ${stored.log.slice(-6).join(' | ')}`);
  check(JSON.stringify(stored.skills) === JSON.stringify(['Plánování výroby', 'Vedení lidí']) && Object.values(stored.rate).sort().join() === '2,4', `uložené dovednosti vedoucích: ${JSON.stringify(stored.skills)} ${JSON.stringify(stored.rate)}`);
  check(stored.all.includes('Dovednosti vedoucích: nová dovednost „Vedení lidí“') && stored.all.includes('Dovednosti vedoucích: „Plánování směn“ → „Plánování výroby“')
    && stored.all.some(t => /^Šéf Karel: vedoucí – Vedení lidí 0 → 2$/.test(t)), `historie dovedností vedoucích: ${stored.all.slice(-8).join(' | ')}`);

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
  await page.click('#mxTabs [data-mxtab="matrix"]');   // naposledy otevřená záložka byla Vedoucí
  await page.waitForSelector('#matrixView .mx-leads');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  check(await overflow(page) <= 1, 'mobil: matice bez přetečení stránky');
  await page.screenshot({ path: `${shots}/05-mobile-matrix.png` });
  await page.click('#mxTabs [data-mxtab="leads"]');
  await page.waitForSelector('#leadView .lead-matrix');
  await page.waitForTimeout(150);
  check(await overflow(page) <= 1, 'mobil: matice vedoucích bez přetečení stránky');
  await page.screenshot({ path: `${shots}/11-mobile-leads.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${shots}/06-dark-leads.png`, fullPage: true });
  await page.click('#mxTabs [data-mxtab="matrix"]');
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
