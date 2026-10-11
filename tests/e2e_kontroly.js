// Prohlížečový průchod modulem Kontroly (verze 2.3): nutné úkony oddělení, plán namátkových
// kontrol na příští týden (25 % lidí z oddělení, rozložení do dnů), zápis kontroly bod po bodu,
// neproběhlo, náhradník, přesun, ruční přidání, přegenerování, PDF plánu a výsledků, karta
// člověka (Lidé, Profil), výsledky, historie změn, nastavení, mobil a tmavý režim.
// Spuštění stejně jako e2e_browser.js:
//   ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t . dev-router.php &
//   curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state
//   NO_PROXY=127.0.0.1 PW=$(npm root -g)/playwright S=$S node tests/e2e_kontroly.js
// PDF se uloží do $S (kontroly-*.pdf), snímky do $S/oshots-kt.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-kt');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

const PEOPLE = [
  ['Novák', 'Jan', 'p_cnc'], ['Čermák', 'Petr', 'p_cnc'], ['Cibulka', 'Adam', 'p_cnc'], ['Chalupa', 'Josef', 'p_cnc'], ['Hrubý', 'Martin', 'p_cnc'],
  ['Šimek', 'Ondřej', 'p_cnc'], ['Sýkora', 'Tomáš', 'p_cnc'], ['Řezníček', 'Lukáš', 'p_fre'], ['Růžička', 'David', 'p_fre'], ['Zeman', 'Filip', 'p_fre'],
  ['Dvořáková', 'Eva', 'p_kon'], ['Procházková', 'Lucie', 'p_kon'], ['Kučerová', 'Tereza', 'p_kon'], ['Veselá', 'Hana', 'p_kon'],
  ['Marek', 'Pavel', 'p_mon'], ['Pokorný', 'Jiří', 'p_mon'], ['Král', 'Karel', 'p_mon'], ['Beneš', 'Michal', 'p_mon'], ['Fiala', 'Vojtěch', 'p_mon'],
  ['Kolář', 'Jakub', 'p_mon'], ['Navrátil', 'Milan', 'p_mon'], ['Urban', 'Matěj', 'p_mon'], ['Blažek', 'Daniel', 'p_mon'],
];

async function watch(page, label) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  page.on('response', r => { if (r.status() >= 400) problems.push(`${label} HTTP ${r.status()} ${r.url()}`); });
  page.on('pageerror', err => problems.push(`${label} pageerror: ${err.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`));
  });
}
const saved = page => page.waitForFunction(() => !store.dirty && !store.saving && document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 15000 });
async function download(page, selector, name) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  const target = path.join(S, name || file.suggestedFilename());
  await file.saveAs(target);
  return { name: file.suggestedFilename(), path: target, pdf: fs.readFileSync(target).slice(0, 5).toString() === '%PDF-' };
}
async function addTask(page, dept, text, enter = false) {
  const card = `[data-ktdept="${dept}"]`;
  await page.fill(`${card} [data-ktnew]`, text);
  if (enter) await page.press(`${card} [data-ktnew]`, 'Enter');
  else await page.click(`${card} [data-ktaddtask]`);
  await page.waitForFunction(([d, t]) => [...document.querySelectorAll(`[data-ktdept="${d}"] [data-ktf]`)].some(i => i.value === t), [dept, text]);
}
const planItems = page => page.evaluate(() => audPlan(ktWeekId()).items.map(i => ({ id: i.id, key: i.key, name: i.name, dept: i.dept, day: i.day, state: i.state })));
async function openMenu(page, id) {
  await page.click(`[data-ktitem="${id}"] .kt-more summary`);
  await page.waitForSelector(`[data-ktitem="${id}"] .kt-menu`, { state: 'visible' });
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  global.lastPage = page;
  await watch(page, 'kontroly');
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

  // Pozice s odděleními a lidé (vyřazený a člověk bez pozice se nekontrolují).
  await page.evaluate(people => {
    const cnc = mkPos('p_cnc', 'CNC', []), fre = mkPos('p_fre', 'Frézka', []), kon = mkPos('p_kon', 'Kontrola', []), mon = mkPos('p_mon', 'Montáž', []);
    cnc.dept = 'Obrobna'; fre.dept = 'Obrobna'; kon.dept = 'Kontrola kvality';
    const state = blank();
    state.positions = [cnc, fre, kon, mon];
    people.forEach(([last, first, positionId], i) => { state.employees[`k${i}`] = { key: `k${i}`, last, first, positionId, level: 2, note: '' }; });
    state.employees.x1 = { key: 'x1', last: 'Vyřazený', first: 'Karel', positionId: 'p_cnc', level: 4, note: '', excluded: true };
    state.employees.x2 = { key: 'x2', last: 'Nezařazená', first: 'Jana', positionId: null, level: null, note: '' };
    S = sanitizeState(state);
    save();
    renderAll();
  }, PEOPLE);
  await saved(page);

  // Bez plánu: náhled, kolik lidí se z oddělení vybere, a upozornění na chybějící úkony.
  await page.click('#nav [data-view="kontroly"]');
  const nextWeek = await page.evaluate(() => shiftWeek(isoWeek(todayIso()).id, 1));
  check(await page.inputValue('#ktWeekSel') === nextWeek, 'výchozí je příští týden');
  const empty = (await page.textContent('#ktView')).replace(/\s+/g, ' ');
  const preview = await page.$$eval('#ktView tbody tr', rows => rows.map(r => [...r.cells].map(c => c.textContent.trim()).join('|')));
  check(JSON.stringify(preview) === JSON.stringify(['Obrobna|10|3|žádné', 'Kontrola kvality|4|1|žádné', 'Montáž|9|3|žádné']), `náhled výběru: ${preview}`);
  check(/Bez nutných úkonů/.test(empty), 'upozornění na oddělení bez nutných úkonů');
  await page.screenshot({ path: `${shots}/00-empty.png`, fullPage: true });

  // Nutné úkony: přidání tlačítkem i Enterem, úprava, pořadí, smazání.
  await page.click('[data-kttabgo="tasks"]');
  await addTask(page, 'Obrobna', 'Kontrola prvního kusu podle výkresu');
  await addTask(page, 'Obrobna', 'Měřidla s platnou kalibrací', true);
  await addTask(page, 'Obrobna', 'Záznam do průvodky');
  await addTask(page, 'Obrobna', 'Úklid pracoviště na konci směny');
  await addTask(page, 'Kontrola kvality', 'Měří podle kontrolního plánu');
  await addTask(page, 'Kontrola kvality', 'Neshodné díly označené a oddělené');
  await addTask(page, 'Montáž', 'Moment utažení podle návodky');
  await addTask(page, 'Montáž', 'Kontrola kompletnosti před balením');
  const ob = '[data-ktdept="Obrobna"]';
  await page.fill(`${ob} [data-ktask]:nth-child(3) [data-ktf]`, 'Záznam do průvodky a podpis');
  await page.press(`${ob} [data-ktask]:nth-child(3) [data-ktf]`, 'Tab');
  await page.click(`${ob} [data-ktask]:nth-child(4) [data-ktup]`);
  await page.click(`${ob} [data-ktask]:nth-child(2) [data-ktrm]`);
  await page.waitForSelector('#dlg[open]');
  await page.click('#dlgOk');
  await page.waitForFunction(() => document.querySelectorAll('[data-ktdept="Obrobna"] [data-ktask]').length === 3);
  const obTasks = await page.$$eval(`${ob} [data-ktf]`, x => x.map(i => i.value));
  check(JSON.stringify(obTasks) === JSON.stringify(['Kontrola prvního kusu podle výkresu', 'Úklid pracoviště na konci směny', 'Záznam do průvodky a podpis']), `body Obrobny: ${obTasks}`);
  await page.screenshot({ path: `${shots}/01-tasks.png`, fullPage: true });
  await saved(page);

  // Plán příštího týdne: 3 + 1 + 3 lidé, z oddělení na různé dny.
  await page.click('#ktTabs [data-kttab="plan"]');
  await page.click('[data-ktgen]');
  await page.waitForSelector('.kt-days');
  let items = await planItems(page);
  const per = {};
  items.forEach(i => { per[i.dept] = (per[i.dept] || 0) + 1; });
  check(per.Obrobna === 3 && per['Kontrola kvality'] === 1 && per['Montáž'] === 3 && Object.keys(per).length === 3, `výběr po odděleních: ${JSON.stringify(per)}`);
  check(!items.some(i => i.key === 'x1' || i.key === 'x2'), 'vyřazený ani nezařazený se nekontroluje');
  check(new Set(items.filter(i => i.dept === 'Obrobna').map(i => i.day)).size === 3, 'Obrobna na třech různých dnech');
  const days = await page.evaluate(() => audPlan(ktWeekId()).days.length);
  check((await page.$$('.kt-day')).length === days, 'sloupec pro každý pracovní den');
  await page.screenshot({ path: `${shots}/02-plan.png`, fullPage: true });

  // Zápis kontroly: bez odpovědí nejde, „Vše splněno“ a jeden bod nesplněný s poznámkou.
  const first = items.find(i => i.dept === 'Obrobna');
  await page.click(`[data-ktitem="${first.id}"] [data-ktcheck]`);
  await page.waitForSelector('#dlg[open] .kt-points');
  await page.click('#dlgOk');
  await page.waitForSelector('#dlg .dlg-error');
  check(/chybí 3/.test(await page.textContent('#dlg .dlg-error')), 'bez odpovědí kontrolu nejde uložit');
  await page.click('#ktAllOk');
  await page.locator('#dlg .kt-point').nth(1).locator('.no').click();
  await page.locator('#dlg .kt-point').nth(1).locator('input[type="text"]').fill('Pod strojem třísky');
  await page.screenshot({ path: `${shots}/03-check-form.png` });
  await page.click('#dlgOk');
  await page.waitForSelector(`[data-ktitem="${first.id}"].bad`);
  const card = (await page.textContent(`[data-ktitem="${first.id}"]`)).replace(/\s+/g, ' ');
  check(/2\/3 splněno/.test(card) && /Úklid pracoviště na konci směny – Pod strojem třísky/.test(card), `karta po zápisu: ${card}`);

  // Neproběhlo, náhradník, přesun a ruční přidání.
  items = await planItems(page);
  const mon = items.filter(i => i.dept === 'Montáž');
  await openMenu(page, mon[0].id);
  await page.click(`[data-ktitem="${mon[0].id}"] [data-ktskip]`);
  await page.waitForSelector('#dlg[open] textarea, #dlg[open] input[name="value"]');
  await page.fill('#dlg [name="value"]', 'dovolená');
  await page.click('#dlgOk');
  await page.waitForSelector(`[data-ktitem="${mon[0].id}"].skip`);
  await openMenu(page, mon[1].id);
  await page.click(`[data-ktitem="${mon[1].id}"] [data-ktsub]`);
  await page.waitForSelector('#dlg[open]');
  await page.fill('#dlg [name="value"]', 'nemoc');
  await page.click('#dlgOk');
  await page.waitForFunction(id => audPlan(ktWeekId()).items.some(i => i.sub === id), mon[1].id);
  check(/Náhradník:/.test(await page.textContent('#toast')), `hláška o náhradníkovi: ${await page.textContent('#toast')}`);
  items = await planItems(page);
  const sub = items.find(i => i.dept === 'Montáž' && i.state === 'plan' && i.day === mon[1].day && i.id !== mon[1].id);
  check(sub && ![mon[0].key, mon[1].key, mon[2].key].includes(sub.key), 'náhradník je jiný člověk z Montáže na stejný den');
  const kon = items.find(i => i.dept === 'Kontrola kvality');
  const days2 = await page.evaluate(() => audPlan(ktWeekId()).days);
  const target = days2.find(d => d !== kon.day);
  await openMenu(page, kon.id);
  await page.selectOption(`[data-ktmove="${kon.id}"]`, target);
  await page.waitForFunction(([id, d]) => audItem(ktWeekId(), id).day === d, [kon.id, target]);
  await page.click('[data-ktadd]');
  await page.waitForSelector('#dlg[open] [name="key"]');
  const extraKey = await page.evaluate(() => { const inPlan = new Set(audPlan(ktWeekId()).items.map(i => i.key)); return Object.keys(S.employees).find(k => /^k\d+$/.test(k) && !inPlan.has(k)); });
  await page.selectOption('#dlg [name="key"]', extraKey);
  await page.click('#dlgOk');
  await page.waitForTimeout(200);
  items = await planItems(page);
  check(items.some(i => i.key === extraKey && i.state === 'plan'), 'ručně přidaný člověk je v plánu');
  await page.screenshot({ path: `${shots}/04-plan-edited.png`, fullPage: true });
  await saved(page);

  // Přegenerování: provedená a neproběhlá kontrola zůstane, nemocný ani dovolená se nevybere.
  await page.click('[data-ktgen]');
  await page.waitForSelector('#dlg[open]');
  await page.click('#dlgOk');
  await page.waitForTimeout(300);
  const regen = await planItems(page);
  check(regen.some(i => i.id === first.id && i.state === 'done') && regen.some(i => i.id === mon[0].id && i.state === 'skip'), 'přegenerování nechá zapsané');
  check(regen.filter(i => i.dept === 'Obrobna' && i.state !== 'skip').length === 3, `Obrobna po přegenerování: ${regen.filter(i => i.dept === 'Obrobna').length}`);
  check(!regen.some(i => i.state === 'plan' && i.key === mon[0].key), 'člověk na dovolené se znovu nevybere');
  await saved(page);

  // PDF plánu s kontrolními listy.
  const pdf = await download(page, '[data-ktpdf]', 'kontroly-plan.pdf');
  check(pdf.pdf && /^kontroly-tyden-\d+-\d{4}\.pdf$/.test(pdf.name), `PDF plánu: ${pdf.name}`);

  // Karta člověka v Lidech a v profilu.
  await page.click(`[data-ktitem="${first.id}"] [data-ktperson]`);
  await page.waitForSelector('#view-lide.on .kt-person');
  const personCard = (await page.textContent('#lDetail .kt-person')).replace(/\s+/g, ' ');
  check(/1 kontrola · splněno 2 z 3 body/.test(personCard) && /Úklid pracoviště na konci směny – Pod strojem třísky/.test(personCard), `karta člověka: ${personCard}`);
  await page.screenshot({ path: `${shots}/05-person.png`, fullPage: true });
  await page.click(`#lDetail [data-profile="${first.key}"]`);
  await page.waitForSelector('#view-profil.on .kt-person');
  await page.screenshot({ path: `${shots}/06-profile.png`, fullPage: true });

  // Výsledky a jejich PDF.
  await page.click('#nav [data-view="kontroly"]');
  await page.click('#ktTabs [data-kttab="results"]');
  const res = (await page.textContent('#ktView')).replace(/\s+/g, ' ');
  check(/Úklid pracoviště na konci směny/.test(res) && /66,7 %/.test(res), `výsledky: ${res.slice(0, 300)}`);
  await page.screenshot({ path: `${shots}/07-results.png`, fullPage: true });
  const pdf2 = await download(page, '[data-ktpdfres]', 'kontroly-vysledky.pdf');
  check(pdf2.pdf, 'PDF výsledků');

  // Tento týden: nezapsané kontroly z minulých dnů svítí v menu. O víkendu už v týdnu
  // nezbývá pracovní den: plán nevznikne a aplikace to řekne.
  await page.click('#ktTabs [data-kttab="plan"]');
  const cur = await page.evaluate(() => isoWeek(todayIso()).id);
  await page.selectOption('#ktWeekSel', cur);
  const freeDays = await page.evaluate(() => audDays(isoWeek(todayIso()).id).filter(d => d >= todayIso()).length);
  await page.click('[data-ktgen]');
  if (freeDays) {
    await page.waitForSelector('.kt-days');
    const lateExpected = await page.evaluate(() => audPlan(ktWeekId()).items.filter(i => i.day < todayIso()).length + audPlan(ktWeekId()).items.filter(i => i.day === todayIso()).length);
    const badge = await page.evaluate(() => { const b = document.querySelector('#navKt'); return b.hidden ? 0 : +b.textContent; });
    check(badge === lateExpected, `odznak v menu: ${badge}, čekáno ${lateExpected}`);
  } else {
    await page.waitForSelector('#toast.on');
    check(/nemá žádný zbývající pracovní den/.test(await page.textContent('#toast')), 'o víkendu hláška, že v týdnu nezbývá pracovní den');
    check(!(await page.$('.kt-days')), 'o víkendu plán tohoto týdne nevznikne');
  }
  await page.screenshot({ path: `${shots}/08-this-week.png`, fullPage: true });

  // Nastavení: 50 %.
  await page.click('#ktSettings');
  await page.fill('#dlg [name="pct"]', '50');
  await page.click('#dlgOk');
  // Dialog se zavře až v další úloze prohlížeče: nejdřív počkat na změnu, pak na uložení.
  await page.waitForFunction(() => S.audit.settings.pct === 50);
  await saved(page);

  // Uložená data a historie změn.
  const stored = await page.evaluate(async () => {
    const st = (await Vault.loadData()).state;
    return { tasks: Object.fromEntries(Object.entries(st.audit.tasks).map(([d, l]) => [d, l.length])), plans: Object.keys(st.audit.plans).length, pct: st.audit.settings.pct,
      done: Object.values(st.audit.plans).flatMap(p => p.items).filter(i => i.state === 'done').map(i => i.results.map(r => r.ok)),
      log: st.log.filter(e => e.kind === 'audit').map(e => e.text) };
  });
  check(stored.tasks.Obrobna === 3 && stored.tasks['Kontrola kvality'] === 2 && stored.tasks['Montáž'] === 2 && stored.plans === (freeDays ? 2 : 1) && stored.pct === 50, `uložená data: ${JSON.stringify({ ...stored, log: null })}`);
  check(JSON.stringify(stored.done) === JSON.stringify([[true, false, true]]), `uložená kontrola: ${JSON.stringify(stored.done)}`);
  check(stored.log.some(t => /^Nutné úkony – Obrobna: přidán bod „Kontrola prvního kusu podle výkresu“$/.test(t))
    // Generování a přegenerování stejného týdne do 10 minut se v historii sloučí do jednoho
    // záznamu; „vygenerován“ tak zůstane jen u plánu tohoto týdne (o víkendu nevznikne).
    && stored.log.some(t => (freeDays ? /^Kontroly T\d+\/\d{4}: vygenerován plán, naplánováno 7 lidí \(25 % z každého oddělení\)$/
      : /^Kontroly T\d+\/\d{4}: plán přegenerován, naplánováno \d+ lidí \(25 % z každého oddělení\)$/).test(t))
    && stored.log.some(t => /^Kontrola .* \(Obrobna\) .*: splněno 2 z 3 \(nesplněno: Úklid pracoviště na konci směny\)$/.test(t))
    && stored.log.some(t => /neproběhla – dovolená$/.test(t)), `historie změn: ${stored.log.join(' | ')}`);

  // Mobil: plán a úkony bez vodorovného přetečení.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tab of ['plan', 'tasks', 'results']) {
    await page.click(`#ktTabs [data-kttab="${tab}"]`);
    await page.waitForTimeout(200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 1, `mobil ${tab}: vodorovné přetečení ${overflow} px`);
    await page.screenshot({ path: `${shots}/09-mobile-${tab}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.click('#ktTabs [data-kttab="plan"]');
  await page.selectOption('#ktWeekSel', nextWeek);
  await page.screenshot({ path: `${shots}/10-dark-plan.png`, fullPage: true });

  await browser.close();
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
  console.log('e2e Kontroly ok');
})().catch(async error => {
  console.error(error);
  if (problems.length) console.log(problems.join('\n'));
  if (global.lastPage) await global.lastPage.screenshot({ path: `${shots}/zz-error.png`, fullPage: true }).catch(() => {});
  process.exit(1);
});
