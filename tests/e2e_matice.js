// Prohlížečový průchod Maticí dovedností (verze 2.4): nová skupina, dovednosti se standardním
// i vlastním hodnoticím schématem, maximum tabáků, stupně prémie, hodnocení a směna u člověka,
// matice (klik na buňku, filtr skupiny a směny), směny a kapacita (práh, vyřazená dovednost,
// závěr, PDF), pravidla do PDF, Excel, bod vedoucího u prémie a sankce: posuvník 5–50 %
// a srážka ze mzdy (upozornění, Srážka zpracována, zrušení), od 2.8 stálá odpolední směna,
// od 2.9 plánovaná kapacita skupiny (ks/h na osobu) a nemoc.
// Na konci mobil a tmavý režim.
// Spuštění stejně jako e2e_browser.js:
//   ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t . dev-router.php &
//   curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state
//   NO_PROXY=127.0.0.1 PW=$(npm root -g)/playwright S=$S node tests/e2e_matice.js
// PDF se uloží do $S (matice-*.pdf), snímky do $S/oshots-mx.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-mx');
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
async function download(page, selector, name) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  const target = path.join(S, name || file.suggestedFilename());
  await file.saveAs(target);
  return { name: file.suggestedFilename(), path: target, pdf: fs.readFileSync(target).slice(0, 5).toString() === '%PDF-' };
}
/* Text PDF přes pypdf (PyMuPDF jako záloha); bez nich se kontrola textu přeskočí. */
function pdfText(file) {
  const py = `import sys
try:
    import pypdf
    print('\\n'.join(p.extract_text() or '' for p in pypdf.PdfReader(sys.argv[1]).pages))
except ImportError:
    import pymupdf
    print('\\n'.join(p.get_text() for p in pymupdf.open(sys.argv[1])))`;
  const r = require('child_process').spawnSync('python3', ['-c', py, file], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.replace(/\s+/g, ' ') : null;
}
async function prompt(page, value) {
  await page.waitForSelector('#dlg[open] [name="value"]');
  await page.fill('#dlg [name="value"]', value);
  await page.click('#dlgOk');
  await page.waitForSelector('#dlg', { state: 'hidden' });
}
const editor = '#posEditor';

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  global.lastPage = page;
  await watch(page, 'matice');
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

  // Nová skupina s maximem 10 tabáků a dvěma dovednostmi (druhá s vlastním schématem).
  await page.click('#nav [data-view="matice"]');
  await page.click('#btnAddPos');
  await prompt(page, 'Frézování');
  await page.waitForSelector(`${editor} #posMaxTab`);
  check(await page.isVisible('#mxPanelGroups'), 'nová skupina otevře záložku Skupiny a pravidla');
  await page.fill('#posMaxTab', '10');
  await page.press('#posMaxTab', 'Tab');
  await page.waitForFunction(() => document.querySelectorAll('.tab-steps b')[4].textContent === '10');
  check(JSON.stringify(await page.$$eval('.tab-steps b', b => b.map(x => x.textContent))) === JSON.stringify(['0', '3', '5', '8', '10']), 'tabáky po 25 % z maxima 10');
  await page.click(`${editor} [data-skadd]`);
  await page.waitForSelector('#dlg[open] [name="ln4"]');
  check(await page.inputValue('#dlg [name="ln3"]') === 'Pokročilá úroveň', 'nová dovednost má standardní schéma');
  await page.fill('#dlg [name="name"]', 'Obsluha frézy');
  await page.fill('#dlg [name="desc"]', 'Upnutí, nástroje, start programu');
  await page.click('#dlgOk');
  await page.waitForSelector(`${editor} [data-skrow]`);
  await page.click(`${editor} [data-skadd]`);
  await page.waitForSelector('#dlg[open] [name="ln4"]');
  await page.fill('#dlg [name="name"]', 'Programování');
  await page.fill('#dlg [name="ln1"]', 'Začátečník');
  await page.fill('#dlg [name="ld1"]', 'Upraví posuvy podle návodu.');
  await page.click('#dlgOk');
  await page.waitForFunction(() => document.querySelectorAll('#posEditor [data-skrow]').length === 2);
  const grp = await page.evaluate(() => { const p = S.positions.find(x => x.name === 'Frézování'); return { id: p.id, maxTab: p.maxTab, skills: p.skillset.map(s => [s.name, s.desc, s.scale ? s.scale[1].name : null]) }; });
  check(grp.maxTab === 10, `maximum skupiny: ${grp.maxTab}`);
  check(JSON.stringify(grp.skills) === JSON.stringify([['Obsluha frézy', 'Upnutí, nástroje, start programu', null], ['Programování', '', 'Začátečník']]), `dovednosti: ${JSON.stringify(grp.skills)}`);
  // Stupně prémie: předvyplněná Prémie a Extra bonus s nárokem po 4 měsících.
  await page.click(`${editor} [data-tieradd]`);
  await page.click(`${editor} [data-tieradd]`);
  await page.waitForFunction(() => document.querySelectorAll('#posEditor [data-tier]').length === 2);
  const tiers = await page.evaluate(id => S.positions.find(x => x.id === id).tiers.map(t => [t.name, t.minSkill, t.raise, t.maxAbs, t.minWknd, t.minNorm, t.manual.map(m => m.text), t.streak && t.streak.months]), grp.id);
  check(JSON.stringify(tiers) === JSON.stringify([['Prémie', 3, 20, 3, 2, 80, ['Dodržování řádné pracovní morálky'], null], ['Extra bonus', 4, 30, 1, 3, 90, ['Dodržování řádné pracovní morálky'], 4]]), `stupně: ${JSON.stringify(tiers)}`);
  const raise1 = page.locator(`${editor} [data-tier]`).first().locator('[data-tf="raise"]');
  await raise1.fill('15');
  await raise1.press('Tab');
  await page.waitForFunction(id => S.positions.find(x => x.id === id).tiers[0].raise === 15, grp.id);
  await saved(page);
  await page.screenshot({ path: `${shots}/01-group-editor.png`, fullPage: true });

  // Člověk ve skupině: směna, hodnocení dovedností a tabáky z procenta.
  await page.click('#nav [data-view="lide"]');
  await page.click('#btnAddPerson');
  await prompt(page, 'Adam Fréza');
  await page.waitForFunction(() => /Fréza Adam/.test(document.querySelector('#lDetail h2, #lDetail .card')?.textContent || ''));
  await page.selectOption('#pPos', grp.id);
  await page.selectOption('#pShift', 'S1');
  await page.waitForSelector('#lDetail .rate-card .rate-seg');
  await page.locator('#lDetail .rate-card .rate-seg').first().locator('[data-lvl="4"]').click();
  await page.waitForFunction(() => /50 %/.test(document.querySelector('#lDetail').textContent));
  const adam = await page.evaluate(() => { const e = Object.values(S.employees).find(x => x.last === 'Fréza'); const L = levelOf(e); return { key: e.key, shift: e.shift, pct: L.pct, base: L.base }; });
  check(adam.shift === 'S1' && adam.pct === 50 && adam.base === 5, `Adam: ${JSON.stringify(adam)}`);
  await page.screenshot({ path: `${shots}/02-person.png`, fullPage: true });
  await saved(page);

  // Matice: filtr skupiny, klik na buňku zvýší úroveň, filtr směny.
  await page.click('#nav [data-view="matice"]');
  await page.click('[data-mxtab="matrix"]');
  await page.selectOption('#matrixGroup', grp.id);
  await page.waitForSelector(`[data-mxr="${adam.key}"]`);
  const prog = grp.skills.length && await page.evaluate(id => S.positions.find(x => x.id === id).skillset[1].id, grp.id);
  await page.click(`[data-mxr="${adam.key}"][data-skill="${prog}"]`);
  await page.click(`[data-mxr="${adam.key}"][data-skill="${prog}"]`);
  const rated = await page.evaluate(([k, s]) => rateOf(S.employees[k], s), [adam.key, prog]);
  check(rated === 2, `klik v matici: ${rated}`);
  check(/75\s*%/.test(await page.textContent(`#matrixView tr:has([data-mxr="${adam.key}"])`)), 'procento v matici se přepočítá');
  await page.screenshot({ path: `${shots}/03-matrix.png`, fullPage: true });
  await page.selectOption('#matrixShift', 'S2');
  check(!(await page.$(`[data-mxr="${adam.key}"]`)), 'filtr směny skryje skupinu 1');
  await page.selectOption('#matrixShift', '*');
  const [xl] = await Promise.all([page.waitForEvent('download'), page.click('#btnMatrixXlsx')]);
  await xl.saveAs(path.join(S, 'matice.xlsx'));
  check(fs.statSync(path.join(S, 'matice.xlsx')).size > 4000, 'Excel matice je podezřele malý');

  // Směny a kapacita: práh, vyřazená dovednost, závěr a PDF.
  await page.click('[data-mxtab="cap"]');
  await page.waitForSelector('#capThr');
  await page.selectOption('#capThr', '2');
  await page.waitForFunction(() => S.capReport.thr === 2);
  const firstSkill = await page.getAttribute('#capView [data-capskill]', 'data-capskill');
  await page.uncheck(`#capView [data-capskill="${firstSkill}"]`);
  await page.waitForFunction(id => S.capReport.hidden.includes(id), firstSkill);
  check(/vyřazeno z reportu/.test(await page.textContent('#capView')), 'vyřazená dovednost je označená');
  await page.fill('#capNote', 'Zaučit skupinu 2 na obsluhu stroje do konce měsíce.');
  await page.press('#capNote', 'Tab');
  await page.waitForFunction(() => /Zaučit skupinu 2/.test(S.capReport.note));
  await page.screenshot({ path: `${shots}/04-capacity.png`, fullPage: true });
  const cap = await download(page, '#capPdf', 'matice-kapacita.pdf');
  check(cap.pdf, 'PDF kapacity');
  const capText = pdfText(cap.path);
  if (capText != null) {
    check(/Kapacita dovedností podle směn/.test(capText) && /Zaučit skupinu 2/.test(capText) && /Frézování/.test(capText), `PDF kapacity: ${capText.slice(0, 300)}`);
    check(/úroveň aspoň 2/i.test(capText), 'PDF kapacity ukazuje práh 2');
  }
  // Report se pamatuje i po přepnutí záložek.
  await page.click('[data-mxtab="groups"]');
  await page.click('[data-mxtab="cap"]');
  check(await page.inputValue('#capThr') === '2' && /Zaučit skupinu 2/.test(await page.inputValue('#capNote')), 'report kapacit drží nastavení');
  await page.selectOption('#capThr', '3');
  await page.check(`#capView [data-capskill="${firstSkill}"]`);

  // Stálá odpolední (2.8): u člověka, ve filtru a oddílu matice, v kapacitě vždy odpoledne.
  await page.click('#nav [data-view="lide"]');
  await page.click(`#lList [data-key="${adam.key}"]`);
  await page.waitForSelector('#lDetail #pShift');
  check(await page.$$eval('#pShift option', o => o.map(x => x.textContent).includes('Stálá odpolední')), 'v nabídce směn je Stálá odpolední');
  await page.selectOption('#pShift', 'O');
  await page.waitForFunction(k => S.employees[k].shift === 'O', adam.key);
  await page.click('#nav [data-view="matice"]');
  await page.click('[data-mxtab="matrix"]');
  await page.selectOption('#matrixShift', 'O');
  await page.waitForSelector(`[data-mxr="${adam.key}"]`);
  check(/Stálá odpolední · 1 člověk/.test(await page.textContent('#matrixView .mx-sep')), `oddíl matice: ${await page.textContent('#matrixView .mx-sep')}`);
  await page.selectOption('#matrixShift', '*');
  await page.click('[data-mxtab="cap"]');
  await page.waitForSelector('#capView .cap-table');
  check(/Varianta A/.test(await page.textContent('#capView .cap-table thead')), 'bez nastaveného střídání report ukáže varianty');
  // Skupiny se střídají po týdnu: tento týden má ranní skupina 2, příští týden skupina 1.
  await page.selectOption('#capS1', 'S2');
  await page.waitForFunction(() => S.capReport.s1am === shiftWeek(isoWeek(todayIso()).id, 1));
  await page.waitForSelector('#capView .cap-table');
  const capO = await page.evaluate(k => {
    const tile = [...document.querySelectorAll('#capView .stat')].find(t => /Stálá odpolední/.test(t.textContent));
    const r = capacity(S.capReport.groups, S.capReport.thr, S.capReport.hidden);
    const g = r.groups.find(x => x.p.id === S.employees[k].positionId), s = g.skills[0];
    const cw = isoWeek(todayIso()).id, head = document.querySelector('#capView .cap-table thead').textContent.replace(/\s+/g, ' ');
    return { tile: tile ? tile.textContent.replace(/\s+/g, ' ') : '', sel: document.querySelector('#capS1').value,
      th: head.includes(`Tento týden ${weekName(cw)}`) && head.includes(`Příští týden ${weekName(shiftWeek(cw, 1))}`) && /ranní skupina 2, odpolední skupina 1/.test(head),
      pm: [s.A.pm, s.B.pm, s.by.O.n, s.by.S2.n, s.by.S1.n], note: /stálá odpolední vždy odpoledne/.test(document.querySelector('#capView .note.i').textContent) };
  }, adam.key);
  check(/Stálá odpolední\s*1/.test(capO.tile) && capO.th && capO.note && capO.sel === 'S2', `kapacita se stálou odpolední po týdnech: ${JSON.stringify(capO)}`);
  check(capO.pm[0] === capO.pm[2] + capO.pm[3] && capO.pm[1] === capO.pm[2] + capO.pm[4], `stálá odpolední je odpoledne v obou variantách: ${capO.pm}`);
  await page.screenshot({ path: `${shots}/04b-capacity-odpoledni.png`, fullPage: true });
  const capPdfO = await download(page, '#capPdf', 'matice-kapacita-odpoledni.pdf');
  const capTextO = pdfText(capPdfO.path);
  if (capTextO != null) check(/Tento týden T\d+/.test(capTextO) && /T\d+ odpolední/.test(capTextO) && /stálá odpolední vždy odpoledne/.test(capTextO), `PDF kapacity po týdnech: ${capTextO.slice(0, 400)}`);

  // Plánovaná kapacita skupiny (2.9): kusy nebo hodiny na osobu za směnu; nemoc se nepočítá.
  await page.click('[data-mxtab="groups"]');
  await page.click(`#posList [data-selpos="${grp.id}"]`);
  await page.waitForSelector('#posEditor #posPlan');
  await page.check('#posEditor #posPlan');
  await page.waitForSelector('#posEditor #posPlanV');
  check(await page.inputValue('#posEditor #posPlanV') === '25', 'výchozí 25 ks na osobu');
  await page.fill('#posEditor #posPlanV', '30');
  await page.press('#posEditor #posPlanV', 'Tab');
  await page.waitForFunction(id => S.positions.find(p => p.id === id).plan.v === 30, grp.id);
  const planRow = await page.evaluate(() => [...document.querySelectorAll('#posEditor .plan-table tbody tr')].map(r => r.textContent.replace(/\s+/g, ' ').trim()));
  const daysNow = await page.evaluate(() => workDays(isoWeek(todayIso()).id));
  check(planRow.length === 2 && planRow[0].startsWith('Tento týden') && planRow[0].includes('0 ks') && planRow[0].includes('30 ks') && planRow[0].includes(`${30 * daysNow} ks`),
    `plánovaná kapacita v editoru: ${JSON.stringify(planRow)}`);
  await page.screenshot({ path: `${shots}/04c-plan-editor.png`, fullPage: true });
  await page.selectOption('#posEditor #posPlanUnit', 'h');
  await page.waitForFunction(id => S.positions.find(p => p.id === id).plan.unit === 'h', grp.id);
  await page.fill('#posEditor #posPlanV', '7,5');
  await page.press('#posEditor #posPlanV', 'Tab');
  await page.waitForFunction(id => S.positions.find(p => p.id === id).plan.v === 7.5, grp.id);
  check(/7,5 h/.test(await page.textContent('#posEditor .plan-table')), 'kapacita v hodinách');
  await page.click('[data-mxtab="cap"]');
  await page.waitForSelector('#capView .plan-in-cap');
  check(/Plánovaná kapacita · 7,5 h na osobu za směnu/.test(await page.textContent('#capView .plan-in-cap')), 'plánovaná kapacita v reportu kapacit');
  // Nemoc: Adam dočasně mimo kapacity.
  await page.click('#nav [data-view="lide"]');
  await page.click(`#lList [data-key="${adam.key}"]`);
  await page.check('#lDetail #pSick');
  await page.waitForFunction(k => !!S.employees[k].sick, adam.key);
  check(/nemoc/.test(await page.textContent(`#lList [data-key="${adam.key}"]`)), 'v seznamu je vidět nemoc');
  await page.click('#nav [data-view="matice"]');
  await page.click('[data-mxtab="cap"]');
  await page.waitForSelector('#capView .plan-in-cap');
  const sickCap = await page.evaluate(id => ({ tile: [...document.querySelectorAll('#capView .stat')].some(t => /Nemoc\s*1/.test(t.textContent)),
    plan: groupPlan(S.positions.find(p => p.id === id), 'A', 5) }), grp.id);
  check(sickCap.tile && sickCap.plan.pmN === 0 && sickCap.plan.sick === 1, `nemocný mimo kapacity: ${JSON.stringify(sickCap)}`);
  await page.screenshot({ path: `${shots}/04d-capacity-plan-sick.png`, fullPage: true });
  const capPdfP = await download(page, '#capPdf', 'matice-kapacita-plan.pdf');
  const capTextP = pdfText(capPdfP.path);
  if (capTextP != null) check(/Plánovaná kapacita \(7,5 h na osobu za směnu\)/.test(capTextP) && /Nemoc/.test(capTextP), `PDF s plánovanou kapacitou: ${capTextP.slice(0, 500)}`);
  await page.click('#nav [data-view="lide"]');
  await page.click(`#lList [data-key="${adam.key}"]`);
  await page.uncheck('#lDetail #pSick');
  await page.waitForFunction(k => !S.employees[k].sick, adam.key);
  await page.click('#nav [data-view="matice"]');

  // Pravidla do PDF.
  const rules = await download(page, '#btnRulesPdf', 'matice-pravidla.pdf');
  check(rules.pdf, 'PDF pravidel');
  const rulesText = pdfText(rules.path);
  if (rulesText != null) check(/Frézování/.test(rulesText) && /Obsluha frézy/.test(rulesText) && /Začátečník/.test(rulesText) && /navýšení mzdy o 15 %/.test(rulesText), `PDF pravidel: ${rulesText.slice(0, 400)}`);

  // Bod vedoucího u prémie (Dvořák z ukázky, skupina CNC).
  await page.click('#nav [data-view="lide"]');
  await page.click('#lList .list-item:has-text("Dvořák")');
  const tier0 = async () => {
    const d = page.locator('#lDetail .tier-detail').first();
    if (!(await d.evaluate(x => x.open))) await d.locator('summary').click();
    return d;
  };
  await page.waitForSelector('#lDetail .tier-detail');
  await (await tier0()).locator('[data-mark][data-on="1"]').click();
  await page.waitForSelector('#dlg[open] [name="value"]');
  await page.fill('#dlg [name="value"]', 'opakované pozdní příchody');
  await page.click('#dlgOk');
  await page.waitForFunction(() => /nesplněno – opakované pozdní příchody/.test(document.querySelector('#lDetail').textContent));
  const marks = await page.evaluate(() => JSON.stringify(S.marks));
  check(/opakované pozdní příchody/.test(marks), `body vedoucího: ${marks}`);
  await page.screenshot({ path: `${shots}/05-premie-mark.png`, fullPage: true });
  await (await tier0()).locator('[data-mark][data-on="0"]').click();
  await page.waitForFunction(() => !/nesplněno – opakované/.test(document.querySelector('#lDetail').textContent));
  check(await page.evaluate(() => JSON.stringify(S.marks)) === '{}', 'zase splněno vrátí bod');

  // Sankce: posuvník 5–50 % a srážka ze mzdy za minulý měsíc (upozornění hned).
  const key = 'prochazka|lukas';
  const before = await page.evaluate(k => { const r = allRows().find(x => x.e.key === k); return [r.total, r.kafe]; }, key);
  const month = await page.evaluate(() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  await page.click('#nav [data-view="sankce"]');
  check(await page.getAttribute('#sanPct', 'min') === '5' && await page.getAttribute('#sanPct', 'max') === '50' && await page.getAttribute('#sanPct', 'step') === '5', 'posuvník 5–50 % po 5 %');
  await page.selectOption('#sanWho', key);
  await page.fill('#sanMonth', month);
  await page.selectOption('#sanWhy', { index: 1 });
  await page.focus('#sanPct');
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowRight');
  check((await page.textContent('#sanPctOut')).trim() === '25 %', 'posuvník po třech krocích ukazuje 25 %');
  await page.keyboard.press('Home');
  check((await page.textContent('#sanPctOut')).trim() === '5 %', 'nejmenší srážka 5 %');
  await page.keyboard.press('End');
  check((await page.textContent('#sanPctOut')).trim() === '50 %', 'největší srážka 50 %');
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowLeft');
  await page.check('#sanWage');
  check((await page.textContent('#sanPctLabel')).trim() === 'Srážka ze mzdy', 'popisek posuvníku u srážky ze mzdy');
  check(/tabáky ani Kafe se nekrátí/.test(await page.textContent('#sanPrev')), 'náhled u srážky ze mzdy');
  await page.screenshot({ path: `${shots}/06-sanction-form.png`, fullPage: true });
  await page.click('#sanAdd');
  await page.waitForSelector('#wageAlert .wage-alert');
  const wage = await page.evaluate(() => S.sanctions.filter(s => s.wage).map(s => [s.key, s.period, s.pct, !!s.done]));
  check(JSON.stringify(wage) === JSON.stringify([[key, month, 25, false]]), `srážka ze mzdy: ${JSON.stringify(wage)}`);
  check(/Procházka Lukáš/.test(await page.textContent('#wageAlert')), 'upozornění jmenuje člověka');
  check(await page.isChecked('#sanWage') === false, 'po přidání se volba srážky ze mzdy vrátí');
  // srážka ze mzdy v aktuálním měsíci: upozornění až týden před koncem měsíce
  const cur = await page.evaluate(() => thisMonthId());
  await page.fill('#sanMonth', cur);
  await page.check('#sanWage');
  await page.click('#sanAdd');
  await page.waitForFunction(() => S.sanctions.filter(s => s.wage).length === 2);
  const curDue = await page.evaluate(m => todayIso() >= wageFrom(m), cur);
  const inAlert = await page.evaluate(() => wagePending().length);
  check(inAlert === (curDue ? 2 : 1), `v upozornění ${inAlert}, aktuální měsíc ${curDue ? 'už' : 'ještě ne'}`);
  if (!curDue) check(/upozornění od/.test(await page.textContent('#sanList')), 'u budoucí srážky je vidět, odkdy se připomene');
  await page.screenshot({ path: `${shots}/07-sanctions-wage.png`, fullPage: true });
  await saved(page);
  await page.click('#nav [data-view="prehled"]');
  const after = await page.evaluate(([k, m]) => withPeriod(m, () => { const r = allRows().find(x => x.e.key === k); return [r.total, r.kafe, r.pctSum, r.wage.length]; }), [key, month]);
  check(after[2] === 0, `srážka ze mzdy nekrátí tabáky: ${JSON.stringify(after)}`);
  check(await page.isVisible('#wageAlert .wage-alert'), 'upozornění je vidět i v Přehledu');
  await page.screenshot({ path: `${shots}/08-wage-alert.png` });
  // Seznam a „Srážka zpracována“
  await page.click('#wageOpen');
  await page.waitForSelector('#dlg[open] [data-wageok]');
  await page.screenshot({ path: `${shots}/09-wage-list.png` });
  while (await page.$('#dlg[open] [data-wageok]')) await page.click('#dlg[open] [data-wageok]');
  await page.waitForSelector('#dlg[open] #wageDlg .note.i');
  check(/Všechny srážky ze mzdy jsou zpracované/.test(await page.textContent('#wageDlg')), 'po zpracování všech je seznam prázdný');
  await page.click('#dlgCancel');
  check((await page.innerHTML('#wageAlert')).trim() === '', 'upozornění zmizí');
  const done = await page.evaluate(() => S.sanctions.filter(s => s.wage && s.done).map(s => s.done.by));
  check(done.length === (curDue ? 2 : 1) && done.every(b => b === 'Vedoucí dílny'), `zpracováno: ${JSON.stringify(done)}`);
  // Zrušení zpracování v seznamu sankcí vrátí upozornění.
  await page.click('#nav [data-view="sankce"]');
  await page.click('#sanList [data-wageundo]');
  await page.click('#dlgOk');
  await page.waitForSelector('#wageAlert .wage-alert');
  await page.click('#sanList [data-wagedone]');
  await page.waitForFunction(() => !wagePending().length || document.querySelector('#wageAlert').innerHTML.trim() !== '');
  await saved(page);
  const log = await page.evaluate(() => S.log.map(e => e.text));
  check(log.some(t => /^Sankce: Procházka Lukáš – .* 25 % ze mzdy/.test(t)), `historie: sankce ze mzdy (${log.join(' | ')})`);
  check(log.some(t => /^Srážka ze mzdy zpracována: Procházka Lukáš/.test(t)), 'historie: zpracováno');
  check(log.some(t => /^Fréza Adam: Frézování – Programování 0 → 2$/.test(t) || /^Fréza Adam: Frézování – Programování 1 → 2$/.test(t)), `historie: hodnocení z matice (${log.filter(t => /Fréza/.test(t)).join(' | ')})`);

  // Mobil: matice, kapacita, skupiny a sankce bez vodorovného přetečení.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#nav [data-view="matice"]');
  for (const tab of ['matrix', 'groups', 'cap']) {
    await page.click(`[data-mxtab="${tab}"]`);
    await page.waitForTimeout(200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 1, `mobil ${tab}: vodorovné přetečení ${overflow} px`);
    await page.screenshot({ path: `${shots}/10-mobile-${tab}.png`, fullPage: true });
  }
  await page.click('#nav [data-view="sankce"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${shots}/10-mobile-sankce.png`, fullPage: true });
  check(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 1, 'mobil sankce: přetečení');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.click('#nav [data-view="matice"]');
  await page.click('[data-mxtab="cap"]');
  await page.screenshot({ path: `${shots}/11-dark-capacity.png`, fullPage: true });
  await page.click('[data-mxtab="matrix"]');
  await page.screenshot({ path: `${shots}/12-dark-matrix.png`, fullPage: true });

  await browser.close();
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
  console.log('e2e Matice ok');
})().catch(async error => {
  console.error(error);
  if (problems.length) console.log(problems.join('\n'));
  if (global.lastPage) await global.lastPage.screenshot({ path: `${shots}/zz-error.png`, fullPage: true }).catch(() => {});
  process.exit(1);
});
