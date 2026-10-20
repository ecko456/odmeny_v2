// Prohlížečový průchod Maticí dovedností (verze 2.4): nová skupina, dovednosti se standardním
// i vlastním hodnoticím schématem, maximum tabáků, stupně prémie, hodnocení a směna u člověka,
// matice (klik na buňku, filtr skupiny a směny), směny a kapacita (práh, vyřazená dovednost,
// závěr, PDF), pravidla do PDF, Excel, bod vedoucího u prémie a sankce: posuvník 5–50 %
// a srážka ze mzdy (upozornění, Srážka zpracována, zrušení), od 2.8 stálá odpolední směna,
// od 2.9 plánovaná kapacita skupiny (ks/h na osobu) a nemoc, od 2.25 dovednost „Není nutností“
// (čtvrtinová váha, celkové skóre v reportu kapacit, rozpis dovedností).
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

// Na telefonu (2.15) není postranní menu: části se otevírají z hlavního menu (logo vlevo nahoře).
async function nav(page, view) {
  if (await page.isVisible(`#nav [data-view="${view}"]`)) { await page.click(`#nav [data-view="${view}"]`); return; }
  await page.click('#brandHome');
  await page.waitForSelector('#view-domu.on');
  if (await page.isHidden('#homeView .home-open')) await page.click('[data-hshift="both"]');
  await page.click(`#homeView .home-menu [data-go="${view}"]`);
  await page.waitForFunction(v => ui.view === v, view);
}

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
  // Varianty prémie: předvyplněná Prémie a Extra bonus s nárokem po 4 měsících.
  await page.click(`${editor} [data-tieradd]`);
  await page.click(`${editor} [data-tieradd]`);
  await page.waitForFunction(() => document.querySelectorAll('#posEditor [data-tier]').length === 2);
  const tiers = await page.evaluate(id => S.positions.find(x => x.id === id).tiers.map(t => [t.name, t.minSkill, t.raise, t.maxAbs, t.minWknd, t.minNorm, t.moral, t.maxKt, t.manual.length, t.streak && t.streak.months]), grp.id);
  check(JSON.stringify(tiers) === JSON.stringify([['Prémie', 3, 20, 3, 2, 80, true, null, 0, null], ['Extra bonus', 4, 30, 1, 3, 90, true, 0, 0, 4]]), `varianty: ${JSON.stringify(tiers)}`);
  // Zaškrtávané podmínky (2.11): kontroly, vybraná dovednost s úrovní, dovednost z jiné skupiny, vypnutá absence.
  const v1 = page.locator(`${editor} [data-tier]`).first();
  check(!(await v1.locator('[data-tf="maxKt"]').count()) && await v1.locator('[data-tf="maxAbs"]').count() === 1, 'hodnota je vidět jen u zaškrtnuté podmínky');
  await v1.locator('[data-tc="kt"]').check();
  await page.waitForFunction(id => S.positions.find(x => x.id === id).tiers[0].maxKt === 0, grp.id);
  await page.locator(`${editor} [data-tier]`).first().locator('[data-tc="abs"]').uncheck();
  await page.waitForFunction(id => S.positions.find(x => x.id === id).tiers[0].maxAbs === null, grp.id);
  const progId = await page.evaluate(id => S.positions.find(x => x.id === id).skillset[1].id, grp.id);
  await page.locator(`${editor} [data-tier]`).first().locator(`[data-tsk="${progId}"]`).check();
  await page.locator(`${editor} [data-tier]`).first().locator(`[data-tsklvl="${progId}"]`).selectOption('2');
  const otherSkill = await page.evaluate(id => S.positions.find(x => isGroup(x) && x.id !== id && groupSkills(x).length).skillset[0].id, grp.id);
  await page.locator(`${editor} [data-tier]`).first().locator('.tsk-other summary').click();
  await page.locator(`${editor} [data-tier]`).first().locator(`[data-tsk="${otherSkill}"]`).check();
  await page.waitForFunction(id => S.positions.find(x => x.id === id).tiers[0].skills.length === 2, grp.id);
  const v1state = await page.evaluate(id => { const t = S.positions.find(x => x.id === id).tiers[0]; return [t.maxKt, t.maxAbs, t.skills]; }, grp.id);
  check(JSON.stringify(v1state) === JSON.stringify([0, null, [{ id: progId, lvl: 2 }, { id: otherSkill, lvl: 3 }]]), `varianta 1: ${JSON.stringify(v1state)}`);
  check(/Co musí za měsíc splnit\s*7 podmínek/i.test(await page.locator(`${editor} [data-tier]`).first().textContent()), 'počet zaškrtnutých podmínek u varianty');
  await page.locator(`${editor} [data-tier]`).first().screenshot({ path: `${shots}/01b-variant.png` });
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

  // Matice po odděleních (2.10.1): oddělení pod sebou, každé jen se svými dovednostmi.
  await page.selectOption('#matrixGroup', '');
  await page.waitForFunction(() => document.querySelectorAll('#matrixView .mx-sec').length > 1);
  const secs = await page.evaluate(() => {
    const list = [...document.querySelectorAll('#matrixView .mx-sec')];
    return { names: list.map(x => x.dataset.mxdept), want: [...new Set(S.positions.filter(p => isGroup(p) && groupSkills(p).length).map(deptOf))],
      wrong: list.flatMap(x => [...x.querySelectorAll('[data-skill]')].filter(b => deptOf(skillById(b.dataset.skill).p) !== x.dataset.mxdept).map(b => b.dataset.skill)),
      kpis: list.every(x => x.querySelectorAll('.mx-kpi').length >= 2) };
  });
  check(JSON.stringify(secs.names) === JSON.stringify(secs.want), `oddělení pod sebou: ${secs.names} / ${secs.want}`);
  check(!secs.wrong.length && secs.kpis, `v oddělení jen jeho dovednosti a souhrn: ${secs.wrong}`);
  // Oddělení se dvěma skupinami: filtr „celé oddělení“, názvy skupin nad dovednostmi.
  const dept0 = await page.evaluate(id => S.positions.find(p => p.id === id).dept || '', grp.id);
  const other = await page.evaluate(id => deptOf(S.positions.find(p => isGroup(p) && groupSkills(p).length && p.id !== id)), grp.id);
  await page.evaluate(([id, d]) => { S.positions.find(p => p.id === id).dept = d; save(); renderMatrix(); }, [grp.id, other]);
  await page.selectOption('#matrixGroup', `d:${other}`);
  await page.waitForFunction(d => { const l = document.querySelectorAll('#matrixView .mx-sec'); return l.length === 1 && l[0].dataset.mxdept === d; }, other);
  const two = await page.evaluate(() => ({ heads: [...document.querySelectorAll('#matrixView .mx-sec .mx-dept')].map(th => th.textContent.trim()), title: document.querySelector('#matrixView .mx-sec-title').textContent.replace(/\s+/g, ' ') }));
  check(two.heads.length === 2 && two.heads.includes('Frézování') && /Skupiny .*Frézování/.test(two.title), `oddělení se dvěma skupinami: ${JSON.stringify(two)}`);
  await page.screenshot({ path: `${shots}/03b-matrix-dept.png`, fullPage: true });
  await page.evaluate(([id, d]) => { S.positions.find(p => p.id === id).dept = d; save(); renderMatrix(); }, [grp.id, dept0]);
  // oddělení zbyla jedna skupina: filtr ukazuje tu skupinu (výběr odpovídá tomu, co je vidět)
  await page.waitForFunction(() => document.querySelectorAll('#matrixView .mx-sec').length === 1);
  check(await page.inputValue('#matrixGroup') !== '', 'výběr filtru odpovídá zobrazenému oddělení');
  await page.selectOption('#matrixGroup', '');
  await page.waitForFunction(() => document.querySelectorAll('#matrixView .mx-sec').length > 1);
  await saved(page);
  const [xl] = await Promise.all([page.waitForEvent('download'), page.click('#btnMatrixXlsx')]);
  await xl.saveAs(path.join(S, 'matice.xlsx'));
  check(fs.statSync(path.join(S, 'matice.xlsx')).size > 4000, 'Excel matice je podezřele malý');

  // PDF matice jen s ID (2.20): ID místo jmen, vyřazený chybí, nemocný je označený a do počtů úrovní se nepočítá.
  await page.click('[data-mxtab="matrix"]');
  const who = await page.evaluate(() => {
    const ppl = matrixPeople().filter(e => e.positionId).sort((a, b) => a.key.localeCompare(b.key));
    const [a, b, c, , x] = ppl;
    setWid(a.key, '1001'); setWid(b.key, '1002'); setWid(c.key, '77'); setWid(x.key, '9999');
    c.sick = todayIso();
    setExcluded(x.key, true);
    return { keys: [a, b, c, x].map(e => e.key), names: ppl.filter(e => e !== x).map(e => e.last), ex: x.last };
  });
  await saved(page);
  await page.check('#matrixIds');
  await page.waitForFunction(() => P.matrixIds === true && /ID 1001/.test(document.querySelector('#matrixView').textContent));
  const mxText = await page.textContent('#matrixView');
  check(!who.names.some(n => mxText.includes(n)) && /bez ID/.test(mxText) && /ID zaměstnance/.test(mxText) && !mxText.includes('9999'), `matice jen s ID, bez vyřazeného: ${who.names.filter(n => mxText.includes(n))}`);
  check(/v nemoci, do počtů úrovní se nepočítá/.test(mxText) && /bez nemocných/.test(mxText) && /nemoc/.test(await page.textContent('#matrixLegend')), 'nemocný v souhrnu oddělení, součty bez nemocných, legenda');
  const cov = await page.evaluate(() => { const m = skillGrid(null, '*', null, true); return { sick: m.rows.filter(r => r.e.sick).length, ok: m.coverage.every((c, j) => c.ready === m.rows.filter(r => !r.e.sick && r.cells[j] >= 3).length) }; });
  check(cov.sick === 1 && cov.ok, `pokrytí bez nemocných: ${JSON.stringify(cov)}`);
  const idOrder = await page.$$eval('#matrixView .mx-sec[data-mxdept] tbody th.mx-name', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  check(idOrder.some(t => /^ID 1001/.test(t)) && idOrder.some(t => /^ID 77 nemoc/.test(t)), `řádky s ID a štítkem nemoc: ${JSON.stringify(idOrder.slice(0, 6))}`);
  await page.screenshot({ path: `${shots}/03b-matrix-ids.png`, fullPage: true });
  const mxPdf = await download(page, '#btnMatrixPdf', 'matice-ids.pdf');
  check(mxPdf.pdf && /^matice-dovednosti-\d{4}-\d{2}-\d{2}\.pdf$/.test(mxPdf.name), `PDF matice: ${mxPdf.name}`);
  await page.waitForFunction(() => /bez ID/.test(document.querySelector('#toast').textContent));
  const mxPdfText = pdfText(mxPdf.path);
  if (mxPdfText != null) {
    check(/MATICE DOVEDNOSTÍ/i.test(mxPdfText) && /1001/.test(mxPdfText) && /1002/.test(mxPdfText) && /nemoc/.test(mxPdfText) && /bez ID/.test(mxPdfText) && /HALA 2/.test(mxPdfText), `PDF matice obsahuje ID a nemoc: ${mxPdfText.slice(0, 400)}`);
    check(!who.names.some(n => mxPdfText.includes(n)) && !mxPdfText.includes(who.ex) && !mxPdfText.includes('9999'), `PDF matice bez jmen a bez vyřazeného: ${who.names.filter(n => mxPdfText.includes(n))}`);
    check(!/Tab\. dov\.|benefity|Tabáky celkem/i.test(mxPdfText), 'PDF matice bez benefitů je čistě hodnoticí (2.25.2)');
  }
  // PDF s benefity (2.25.2): tabáky za dovednosti, tabáky celkem, Kafe a prémie za hodnocené období
  await page.waitForSelector('#toast', { state: 'hidden' }).catch(() => {});
  const mxBen = await download(page, '#btnMatrixPdfBen', 'matice-benefity.pdf');
  check(mxBen.pdf && /^matice-dovednosti-benefity-\d{4}-\d{2}-\d{2}\.pdf$/.test(mxBen.name), `PDF matice s benefity: ${mxBen.name}`);
  const mxBenText = pdfText(mxBen.path);
  if (mxBenText != null) {
    const want = await page.evaluate(() => { const r = allRows().find(x => x.e.wid === '1001'); return { per: periodName(curPeriod()), base: r.L.base, total: r.total }; });
    check(/Matice dovedností a benefity/i.test(mxBenText) && /Tab\. dov\./.test(mxBenText) && /Tab\. celk\./.test(mxBenText) && /Kafe/.test(mxBenText) && /Prémie/.test(mxBenText)
      && mxBenText.includes(`benefity za ${want.per}`) && /Tabáky celkem/.test(mxBenText), `PDF matice s benefity: ${mxBenText.slice(0, 500)}`);
    check(!who.names.some(n => mxBenText.includes(n)), 'PDF s benefity bez jmen');
  }
  await page.uncheck('#matrixIds');
  await page.waitForFunction(() => P.matrixIds === false && /Dvořák|Novák/.test(document.querySelector('#matrixView').textContent));
  // zpátky, ať další části testu počítají se stejnými lidmi
  await page.evaluate(keys => { keys.forEach(k => { delete S.employees[k].wid; delete S.employees[k].sick; }); setExcluded(keys[3], false); }, who.keys);
  await saved(page);

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
    check(!/bez schopného|aspoň jeden schopný|bez zkušeného|aspoň jeden zkušený/i.test(capText), 'PDF kapacity bez upozornění na odpoledne bez zkušeného pracovníka (2.23)');
    check(/Zkušení pracovníci/.test(capText) && /Pracovníci v zácviku/.test(capText) && !/schopn|zaškolování/i.test(capText), 'PDF kapacity: pojmy Zkušení pracovníci a Pracovníci v zácviku (2.25)');
    check(/HALA 2/.test(capText) && !/Odměny|ODMĚNY/.test(capText), `PDF kapacity: místo názvu aplikace HALA 2 (2.13): ${capText.slice(0, 200)}`);
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
  // V zaškolování (2.23): v každé buňce zvlášť pod počtem schopných, stejně jako capacity()
  const capTr = await page.evaluate(() => {
    const rep = S.capReport, cap = capacity(rep.groups, rep.thr, rep.hidden);
    const want = cap.groups.flatMap(g => g.skills.flatMap(r => [r.A.amT, r.A.pmT, r.B.amT, r.B.pmT, ...(cap.head[''] ? [r.by[''].tr] : [])]));
    const g = cap.groups[0], r = g.skills[0];
    // řádky dovedností (řádky celkového skóre z 2.25 mají vlastní kontrolu)
    return { want: want.filter(Boolean).length, sum: want.reduce((x, v) => x + v, 0), got: document.querySelectorAll('#capView .cap-table tr:not(.cap-score):not(.cap-train) .cap-tr').length,
      text: [...document.querySelectorAll('#capView .cap-table tr:not(.cap-score):not(.cap-train) .cap-tr')].reduce((x, el) => x + parseInt(el.textContent, 10), 0),
      group: document.querySelector('#capView .cap-group p').textContent.includes(`zkušení ${g.ok}, v zácviku ${g.training}`), ok: g.ok + g.training === g.members,
      split: r.A.amT + r.A.pmT === r.by.R.tr + r.by.O.tr + r.by.S1.tr + r.by.S2.tr };
  });
  check(capTr.want > 0 && capTr.got === capTr.want && capTr.text === capTr.sum && capTr.group && capTr.ok && capTr.split, `v zaškolování v reportu kapacit: ${JSON.stringify(capTr)}`);
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
  if (capTextP != null) check(!/Plánovaná kapacita|na osobu za směnu/.test(capTextP) && /Nemoc/.test(capTextP), `PDF kapacit bez plánované kapacity (2.23): ${capTextP.slice(0, 500)}`);
  await page.click('#nav [data-view="lide"]');
  await page.click(`#lList [data-key="${adam.key}"]`);
  await page.uncheck('#lDetail #pSick');
  await page.waitForFunction(k => !S.employees[k].sick, adam.key);
  await page.click('#nav [data-view="matice"]');

  // Není nutností (2.25): Programování ve Frézování je nepovinné → v procentu čtvrtinová váha (i tabáky),
  // v matici označené, v reportu kapacit celkové skóre a nepovinné jen vyjmenované; volba rozpisu.
  await page.click('[data-mxtab="groups"]');
  await page.click(`#posList [data-selpos="${grp.id}"]`);
  await page.waitForSelector(`${editor} [data-skrow="${prog}"] [data-skopt]`);
  check(!(await page.isChecked(`${editor} [data-skrow="${prog}"] [data-skopt]`)), 'dovednost je výchozí nutná');
  await page.check(`${editor} [data-skrow="${prog}"] [data-skopt]`);
  await page.waitForFunction(([id, s]) => S.positions.find(p => p.id === id).skillset.find(x => x.id === s).opt === true, [grp.id, prog]);
  await page.waitForSelector(`${editor} [data-skrow="${prog}"].is-opt .sk-opt-tag`);
  const optAdam = await page.evaluate(k => { const L = levelOf(S.employees[k]); return [L.pct, L.base]; }, adam.key);
  check(JSON.stringify(optAdam) === JSON.stringify([90, 9]), `Adam po označení Programování jako nepovinné: (4 + ¼ · 2) / 5 = 90 %, 9 tabáků: ${JSON.stringify(optAdam)}`);
  await (await page.$(`${editor} #skillCard`)).screenshot({ path: `${shots}/06-opt-skills.png` });
  await page.click(`${editor} [data-skrow="${prog}"] [data-skedit]`);
  await page.waitForSelector('#dlg[open] [name="opt"]');
  check(await page.isChecked('#dlg [name="opt"]'), 'dialog dovednosti ukazuje Není nutností');
  await page.click('#dlgCancel');
  await page.waitForSelector('#dlg', { state: 'hidden' });
  await saved(page);
  const optLog = await page.evaluate(async () => (await Vault.loadData()).state.log.map(e => e.text).filter(t => /Programování/.test(t)));
  check(optLog.some(t => /dovednost „Programování“ není nutností/.test(t)), `historie změn: ${JSON.stringify(optLog)}`);
  // matice: sloupec označený, procento přepočtené
  await page.click('[data-mxtab="matrix"]');
  await page.selectOption('#matrixGroup', grp.id);
  await page.waitForSelector(`[data-mxr="${adam.key}"]`);
  check(/nepovinná/.test(await page.textContent('#matrixView th.mx-col.is-opt')), 'v matici je nepovinná dovednost označená');
  check(/90\s*%/.test(await page.textContent(`#matrixView tr:has([data-mxr="${adam.key}"])`)), 'procento v matici s čtvrtinovou váhou');
  await page.selectOption('#matrixGroup', '');
  // report kapacit: výchozí rozpis = celkové skóre a nutné dovednosti
  await page.click('[data-mxtab="cap"]');
  await page.waitForSelector('#capDetail');
  const capCard = `#capView .cap-group:has(h3:text-is("Frézování"))`;
  const optCap = await page.evaluate(([id, s, sel]) => {
    const rep = S.capReport, cap = capacity(rep.groups, rep.thr, rep.hidden), g = cap.groups.find(x => x.p.id === id);
    const card = [...document.querySelectorAll('#capView .cap-group')].find(c => c.querySelector('h3').textContent === sel);
    const want = [...capWeeks(rep).flatMap(w => [g.score[w.v].am, g.score[w.v].pm]), ...(cap.head[''] ? [g.score.none.n] : [])];
    const wantT = [...capWeeks(rep).flatMap(w => [g.score[w.v].amT, g.score[w.v].pmT]), ...(cap.head[''] ? [g.score.none.tr] : [])];
    return { detail: document.querySelector('#capDetail').value, scoreRows: document.querySelectorAll('#capView tr.cap-score').length, groups: cap.groups.length,
      got: [...card.querySelectorAll('tr.cap-score .cap-n')].map(x => +x.textContent), want,
      gotT: [...card.querySelectorAll('tr.cap-train .cap-n')].map(x => +x.textContent), wantT,
      labels: [card.querySelector('tr.cap-score b').textContent, card.querySelector('tr.cap-train b').textContent],
      progRow: !!card.querySelector(`[data-capskill="${s}"]`), fold: (card.querySelector('tr.cap-fold') || {}).textContent || '' };
  }, [grp.id, prog, 'Frézování']);
  check(optCap.detail === 'need' && optCap.scoreRows === optCap.groups && JSON.stringify(optCap.got) === JSON.stringify(optCap.want) && JSON.stringify(optCap.gotT) === JSON.stringify(optCap.wantT)
    && optCap.labels.join() === 'Zkušení pracovníci,Pracovníci v zácviku' && !optCap.progRow && /Nepovinné dovednosti \(1\)/.test(optCap.fold) && /Programování/.test(optCap.fold),
    `report kapacit s celkovým skóre a sbalenou nepovinnou dovedností: ${JSON.stringify(optCap)}`);
  await (await page.$(capCard)).screenshot({ path: `${shots}/07-cap-need.png` });
  const capPdfN = await download(page, '#capPdf', 'matice-kapacita-nutne.pdf');
  const capTextN = pdfText(capPdfN.path);
  if (capTextN != null) check(/Zkušení pracovníci/.test(capTextN) && /Pracovníci v zácviku/.test(capTextN) && /Nepovinné dovednosti \(1\): Programování/.test(capTextN), `PDF kapacit s celkovým skóre: ${capTextN.slice(0, 600)}`);
  // průměr zaškolení (2.25.2): u pracovníků v zácviku Ø %, 100 % = úroveň zkušeného pracovníka
  const trainUi = await page.evaluate(() => { const rep = S.capReport, cap = capacity(rep.groups, rep.thr, rep.hidden), g = cap.groups.find(x => x.training);
    const card = [...document.querySelectorAll('#capView .cap-group')].find(c => c.querySelector('h3').textContent === g.p.name);
    return { want: `Ø zaškolení ${nf(trainAvg(g.trS, g.training), 0)} %`, head: card.querySelector('p').textContent, row: card.querySelector('tr.cap-train').textContent.replace(/\s+/g, ' '),
      notes: [...card.querySelectorAll('tr.cap-train small.cap-tr')].map(x => x.textContent) }; });
  check(trainUi.head.includes(trainUi.want) && trainUi.row.includes(trainUi.want) && trainUi.notes.length > 0 && trainUi.notes.every(t => /^Ø \d+ %$/.test(t)), `průměr zaškolení v reportu: ${JSON.stringify(trainUi)}`);
  if (capTextN != null) check(/Ø zaškolení \d+ %/.test(capTextN) && /Ø \d+ %/.test(capTextN), 'PDF kapacit: průměr zaškolení u pracovníků v zácviku');
  await page.selectOption('#capDetail', 'all');
  await page.waitForFunction(() => S.capReport.detail === 'all');
  check(await page.evaluate(s => { const r = document.querySelector(`#capView tr:has([data-capskill="${s}"])`); return !!r && r.classList.contains('cap-opt') && !r.querySelector('.cap-zero, .cap-one'); }, prog),
    'všechny dovednosti: nepovinná má vlastní řádek bez barvy rizika');
  await page.selectOption('#capDetail', 'none');
  await page.waitForFunction(() => S.capReport.detail === 'none');
  const onlyScore = await page.evaluate(() => { const rep = S.capReport, cap = capacity(rep.groups, rep.thr, []), card = document.querySelector('#capView .cap-score-card');
    return { skills: document.querySelectorAll('#capView [data-capskill]').length, cards: document.querySelectorAll('#capView .cap-group').length, groups: cap.groups.length,
      pro: card ? card.querySelectorAll('tr.cap-pro:not(.cap-sum)').length : -1, train: card ? card.querySelectorAll('tr.cap-train:not(.cap-sum)').length : -1,
      labels: card ? [...new Set([...card.querySelectorAll('.cap-who')].map(x => x.textContent))] : [] }; });
  check(onlyScore.skills === 0 && onlyScore.cards === 1 && onlyScore.pro === onlyScore.groups && onlyScore.train === onlyScore.groups && onlyScore.labels.join() === 'Zkušení pracovníci,Pracovníci v zácviku',
    `jen celkové skóre: jedna tabulka, za skupinu zkušení a v zácviku, bez rozpisu dovedností: ${JSON.stringify(onlyScore)}`);
  await page.screenshot({ path: `${shots}/08-cap-none.png`, fullPage: true });
  const capPdfS = await download(page, '#capPdf', 'matice-kapacita-skore.pdf');
  const capTextS = pdfText(capPdfS.path);
  if (capTextS != null) check(/Celkové skóre po skupinách/.test(capTextS) && /Frézování – zkušení pracovníci/.test(capTextS) && /Pracovníci v zácviku/.test(capTextS) && !/Obsluha frézy/.test(capTextS), `PDF kapacit jen se skóre: ${capTextS.slice(0, 600)}`);
  await page.selectOption('#capDetail', 'need');
  await page.waitForFunction(() => !('detail' in S.capReport));   // výchozí rozpis se neukládá
  // u člověka je nepovinná dovednost označená
  await page.click('#nav [data-view="lide"]');
  await page.click(`#lList [data-key="${adam.key}"]`);
  await page.waitForSelector('#lDetail .rate-card .rate-seg');
  check(await page.evaluate(() => [...document.querySelectorAll('#lDetail .rate-card .rate-row')].some(r => /Programování/.test(r.textContent) && r.querySelector('.sk-opt-tag'))), 'v hodnocení člověka je nepovinná dovednost označená');
  check(/90 %/.test(await page.textContent('#lDetail .rate-card')), 'u člověka vážené procento');
  await page.click('#nav [data-view="matice"]');

  // Pravidla do PDF.
  const rules = await download(page, '#btnRulesPdf', 'matice-pravidla.pdf');
  check(rules.pdf, 'PDF pravidel');
  const rulesText = pdfText(rules.path);
  if (rulesText != null) check(/Frézování/.test(rulesText) && /Obsluha frézy/.test(rulesText) && /Začátečník/.test(rulesText) && /navýšení mzdy o 15 %/.test(rulesText), `PDF pravidel: ${rulesText.slice(0, 400)}`);
  if (rulesText != null) check(/Programování \(není nutností/.test(rulesText), 'PDF pravidel: nepovinná dovednost je označená (2.25)');
  if (rulesText != null) check(/HALA 2/.test(rulesText) && !/Odměny|ODMĚNY/.test(rulesText), 'PDF pravidel: HALA 2 místo názvu aplikace');

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
  check(/"moral":"opakované pozdní příchody"/.test(marks), `body vedoucího: ${marks}`);
  // pracovní morálka označená jednou platí pro obě varianty (2.11)
  const moralTxt = await page.$$eval('#lDetail .tier-detail', ds => ds.map(d => [...d.querySelectorAll('li')].find(li => /pracovní morálky/.test(li.textContent))?.textContent || ''));
  check(moralTxt.length === 2 && moralTxt.every(t => /nesplněno – opakované pozdní příchody/.test(t)), `morálka v obou variantách: ${JSON.stringify(moralTxt)}`);
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

  // Srážky ze mzdy za neproduktivitu (2.12): pásma u skupiny CNC, přehled, upozornění, zpracování.
  await page.click('#nav [data-view="matice"]');
  await page.click('[data-mxtab="groups"]');
  await page.click('#posList [data-selpos="p_cnc"]');
  await page.check('#posNormCut');
  await page.waitForSelector('#normCutCard [data-ncrow]');
  const demoMonth = await page.evaluate(() => S.current);
  await page.selectOption('#posNormCutFrom', demoMonth);
  await page.click('#normCutCard [data-ncadd]');
  await page.waitForFunction(() => document.querySelectorAll('#normCutCard [data-ncrow]').length === 3);
  await page.fill('#normCutCard [data-ncrow="2"] [data-ncmax]', '90');
  await page.press('#normCutCard [data-ncrow="2"] [data-ncmax]', 'Tab');
  await page.waitForFunction(() => S.positions.find(p => p.id === 'p_cnc').normCut.rows[2].max === 90);
  // hranice, která už je, se nepřijme
  await page.fill('#normCutCard [data-ncrow="0"] [data-ncmax]', '60');
  await page.press('#normCutCard [data-ncrow="0"] [data-ncmax]', 'Tab');
  await page.waitForTimeout(150);
  const nc = await page.evaluate(() => S.positions.find(p => p.id === 'p_cnc').normCut);
  check(JSON.stringify(nc) === JSON.stringify({ from: demoMonth, rows: [{ max: 50, pct: 50 }, { max: 60, pct: 25 }, { max: 90, pct: 10 }] }), `pásma: ${JSON.stringify(nc)}`);
  check(/Nad 90 %: bez srážky/.test(await page.textContent('#normCutCard')), 'text nad posledním pásmem');
  await page.locator('#normCutCard').screenshot({ path: `${shots}/11b-normcut-editor.png` });
  await page.click('#nav [data-view="prehled"]');
  await page.waitForSelector('#ovBody tr[data-key="novak|martin"] .col-ncut, #ovBody tr[data-key="novak|martin"] td');
  const ovCut = await page.evaluate(() => { const r = allRows().find(x => x.e.key === 'novak|martin'); return [r.ncut.norm, r.ncut.pct]; });
  check(JSON.stringify(ovCut) === JSON.stringify([84.9, 10]), `Novák v přehledu: ${JSON.stringify(ovCut)}`);
  check(/Srážka ze mzdy/.test(await page.textContent('#view-prehled thead')) && /−10 %/.test(await page.textContent('#ovBody tr[data-key="novak|martin"]')), 'sloupec Srážka ze mzdy v přehledu');
  await page.waitForSelector('#wageAlert .wage-alert');
  check(/Novák Martin/.test(await page.textContent('#wageAlert')), 'upozornění na srážku za neproduktivitu');
  await page.click('#wageOpen');
  await page.waitForSelector('#dlg[open] [data-wageok^="n:"]');
  check(/neproduktivita, plnění normy 84,9 %/.test(await page.textContent('#wageDlg')) && /automaticky/.test(await page.textContent('#wageDlg')), 'seznam srážek ze mzdy obsahuje srážku za neproduktivitu');
  await page.screenshot({ path: `${shots}/11c-normcut-list.png` });
  await page.click('#dlg[open] [data-wageok^="n:"]');
  await page.waitForFunction(() => !document.querySelector('#dlg[open] [data-wageok^="n:"]'));   // ruční srážky můžou v seznamu zůstat
  await page.click('#dlgCancel');
  const ncDone = await page.evaluate(m => S.normCutDone[m], demoMonth);
  check(ncDone && ncDone['novak|martin'] && ncDone['novak|martin'].pct === 10 && ncDone['novak|martin'].norm === 84.9 && ncDone['novak|martin'].by === 'Vedoucí dílny', `zpracováno: ${JSON.stringify(ncDone)}`);
  check(!/Novák Martin/.test(await page.textContent('#wageAlert')), 'po zpracování Novák z upozornění zmizí');
  // v detailu člověka: zpracováno, zrušit vrátí upozornění
  await page.click('#nav [data-view="lide"]');
  await page.click('#lList [data-key="novak|martin"]');
  await page.waitForSelector('#lDetail .ncut-card [data-ncundo]');
  check(/−10 % ze mzdy/.test(await page.textContent('#lDetail .ncut-card')) && /zpracováno/.test(await page.textContent('#lDetail .ncut-card')), 'karta srážky u člověka');
  await page.locator('#lDetail .ncut-card').screenshot({ path: `${shots}/11d-normcut-card.png` });
  await page.click('#lDetail .ncut-card [data-ncundo]');
  await page.waitForSelector('#lDetail .ncut-card [data-ncdone]');
  await page.waitForFunction(() => /Novák Martin/.test(document.querySelector('#wageAlert').textContent));
  await page.click('#lDetail .ncut-card [data-ncdone]');
  await page.waitForSelector('#lDetail .ncut-card [data-ncundo]');
  await saved(page);
  const ncLog = await page.evaluate(() => S.log.map(e => e.text));
  check(ncLog.some(t => /^Skupina CNC, srážky ze mzdy za neproduktivitu: vypnuto → do 50 % → 50 %/.test(t) || /^Skupina CNC, srážky ze mzdy za neproduktivitu: .*do 90 % → 10 %/.test(t)), `historie: pásma (${ncLog.filter(t => /neproduktiv/.test(t)).join(' | ')})`);
  check(ncLog.some(t => /^Srážka ze mzdy za neproduktivitu zpracována: Novák Martin – plnění normy 84,9 %, srážka 10 % ze mzdy/.test(t)), 'historie: srážka za neproduktivitu zpracována');
  await page.click('#nav [data-view="matice"]');
  await page.click('[data-mxtab="groups"]');
  await page.click('#posList [data-selpos="p_cnc"]');

  // Mobil: matice, kapacita, skupiny a sankce bez vodorovného přetečení.
  await page.setViewportSize({ width: 390, height: 844 });
  await nav(page, 'matice');
  for (const tab of ['matrix', 'groups', 'cap']) {
    await page.click(`[data-mxtab="${tab}"]`);
    await page.waitForTimeout(200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 1, `mobil ${tab}: vodorovné přetečení ${overflow} px`);
    await page.screenshot({ path: `${shots}/10-mobile-${tab}.png`, fullPage: true });
  }
  await nav(page, 'sankce');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${shots}/10-mobile-sankce.png`, fullPage: true });
  check(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, 'mobil sankce: přetečení');
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
