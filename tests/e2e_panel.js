// Prohlížečový průchod 2.59: prvky z návrhu dashboardu.
// Ověří: pravý panel na širokém monitoru (přihlášený, rychlé akce, náhled úkolů po termínu,
// blížících se a s vysokou závažností, otevření úkolu, Nový úkol, poslední změny s Vrátit zpět),
// na menším monitoru a telefonu panel není; sbalitelné menu (úzké, popisky v title, volba
// v localStorage, zpět); souhrn v kapsli s pruhem pokroku; hladké křivky v profilu s linkou při
// najetí; barevné pruhy po odděleních v KPI; skleněná plocha obsahu; bez přetečení a bez chyb CSP.
// Spuštění stejně jako e2e_undo.js; snímky v $S/oshots-panel.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-panel');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
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
  const saved = () => page.waitForFunction(() => !store.dirty && !store.saving, null, { timeout: 15000 });
  const over = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  // ---------- 2.64: výběr měsíce jen v Přehledu a Docházce ----------
  const curMon = await page.evaluate(() => monthLabel(todayIso().slice(0, 7)));
  check(await page.textContent('#periodNow') === curMon && !(await page.$('.side select')), `v menu jen dnešní měsíc: ${await page.textContent('#periodNow')}`);
  await page.evaluate(() => { const id = S.current, [y, m] = id.split('-').map(Number); const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; S.periods[prev] = { ...JSON.parse(JSON.stringify(S.periods[id])), id: prev, y: +prev.slice(0, 4), m: +prev.slice(5) }; renderAll(); });
  const perOpts = async () => page.$$eval('[data-perwrap].open .per-opt', els => els.map(e => e.dataset.perset));
  await page.click('#ovTitle [data-perpick]');
  await page.waitForSelector('#ovTitle [data-perwrap].open .per-menu:not([hidden])');
  const opts = await perOpts();
  check(opts.length === 2 && opts[0] > opts[1], `nabídka měsíců nejnovější nahoře: ${opts}`);
  await page.screenshot({ path: path.join(shots, '00-mesic.png') });
  await page.keyboard.press('Escape');
  check(await page.$eval('#ovTitle .per-menu', el => el.hidden), 'Escape nabídku zavře');
  await page.click('#ovTitle [data-perpick]');
  await page.click(`#ovTitle [data-perset="${opts[1]}"]`);
  await page.waitForFunction(id => S.current === id, opts[1]);
  check((await page.textContent('#ovTitle')).includes(await page.evaluate(() => periodName(curPeriod()))), 'nadpis Přehledu ukazuje vybraný měsíc');
  await page.click('#nav [data-view="dochazka"]');
  await page.waitForSelector('#view-dochazka.on #attPick [data-perpick]');
  await page.click('#attPick [data-perpick]');
  await page.click(`#attPick [data-perset="${opts[0]}"]`);
  await page.waitForFunction(id => S.current === id, opts[0]);
  await page.screenshot({ path: path.join(shots, '00b-dochazka-mesic.png') });
  await page.click('body', { position: { x: 900, y: 900 } });
  await page.evaluate(id => { delete S.periods[id]; renderAll(); }, opts[1]);
  await page.click('#nav [data-view="prehled"]');
  await page.waitForSelector('#view-prehled.on');

  // ---------- pravý panel ----------
  await page.waitForSelector('#rail .rail-me');
  const rail = await page.evaluate(() => {
    const r = document.querySelector('#rail').getBoundingClientRect(), m = document.querySelector('#main').getBoundingClientRect();
    return { w: r.width, right: r.right, left: r.left, mainRight: m.right, me: document.querySelector('#rail .rail-me').textContent, acts: document.querySelectorAll('#rail .rail-acts > *').length };
  });
  check(rail.w > 250 && rail.left >= rail.mainRight - 1 && rail.right <= 1920, `pravý panel vpravo vedle obsahu: ${JSON.stringify(rail)}`);
  check(/Mistr haly/.test(rail.me), `přihlášená kartička v panelu: ${rail.me}`);
  check(rail.acts === 4, `4 rychlé akce: ${rail.acts}`);
  check(await over() <= 1, 'monitor 1920 bez přetečení');

  // úkoly: po termínu, blíží se, požadavek s vysokou závažností, běžný bez termínu
  await saved();
  const ids = await page.evaluate(() => {
    const meta = { at: Date.now(), by: 'Mistr haly' };
    const iso = n => todayIso(Date.now() + n * 864e5);
    const person = Object.values(S.employees).find(e => !isLead(e) && !e.excluded);
    const a = tkAdd(S, { title: 'Vyměnit filtr odsávání', due: iso(-2), owner: 'Novák' }, meta);
    const b = tkAdd(S, { title: 'Objednat brusné kotouče', due: iso(1), owner: 'Dvořák' }, meta);
    const c = tkAdd(S, { title: 'Přeřazení na ranní směnu', person: person.key, pname: `${person.first} ${person.last}`, sev: 'high' }, meta);
    const d = tkAdd(S, { title: 'Uklidit sklad', owner: '' }, meta);
    save(); renderAll();
    return { a: a.id, b: b.id, c: c.id, d: d.id };
  });
  await saved();
  await page.waitForFunction(id => document.querySelector(`#rail [data-railtask="${id}"]`), ids.a);
  const tasks = await page.$$eval('#rail [data-railtask]', els => els.map(e => ({ id: e.dataset.railtask, cls: e.className, text: e.textContent.replace(/\s+/g, ' ') })));
  check(tasks[0] && tasks[0].id === ids.a && /late/.test(tasks[0].cls), `po termínu první a červeně: ${JSON.stringify(tasks[0])}`);
  check(tasks[1] && tasks[1].id === ids.b && /soon/.test(tasks[1].cls), 'blížící se termín druhý');
  check(tasks[2] && tasks[2].id === ids.c && /high/.test(tasks[2].cls), 'požadavek s vysokou závažností třetí');
  check(tasks.some(t => t.id === ids.d), 'další otevřený úkol taky');
  check(/1 po termínu/.test(await page.textContent('#rail .rail-tasks')) && /1 blíží se/.test(await page.textContent('#rail .rail-tasks')), 'souhrn po termínu a blíží se');
  check(/Vyměnit filtr/.test(await page.textContent('#rail .rail-logs')), 'zadání úkolu v posledních změnách');
  // horní pruh připomínek úkolů se na širokém monitoru neukazuje, totéž je v panelu
  check(await page.$eval('#taskAlert', el => el.innerHTML === ''), 'na širokém monitoru bez horního pruhu úkolů');
  await page.screenshot({ path: path.join(shots, '01-panel-1920.png') });
  // klik na úkol otevře detail v Úkolech
  await page.click(`#rail [data-railtask="${ids.b}"]`);
  await page.waitForFunction(id => ui.view === 'ukoly' && ui.tk.sel === id, ids.b);
  check(await page.evaluate(() => document.querySelector('#tkView').innerHTML.includes('Objednat brusné kotouče')), 'detail úkolu z panelu');
  check(await page.$eval('#rail [data-railact="task"]', el => !!el), 'panel zůstal i v Úkolech');
  await page.screenshot({ path: path.join(shots, '02-ukol.png') });
  // Nový úkol z panelu
  await page.click('#rail [data-railact="task"]');
  await page.waitForSelector('#dlg[open] [name="title"]');
  await page.fill('#dlg[open] [name="title"]', 'Zkontrolovat hasicí přístroje');
  await page.click('#dlgOk');
  await saved();
  await page.waitForFunction(() => tkList().some(t => t.title === 'Zkontrolovat hasicí přístroje'));
  await page.waitForFunction(() => /Zkontrolovat hasicí/.test(document.querySelector('#rail').textContent));
  // Vrátit zpět z panelu: potvrzovací okno, Nechat být nic nezmění
  const undoBtn = await page.$('#rail [data-logundo]');
  check(!!undoBtn, 'Vrátit zpět u poslední změny');
  if (undoBtn) {
    await undoBtn.click();
    await page.waitForSelector('#dlg[open] .log-undolist');
    await page.click('#dlgCancel');
    check(await page.evaluate(() => tkList().some(t => t.title === 'Zkontrolovat hasicí přístroje')), 'Nechat být nic nevrátí');
    await page.click('#rail [data-logundo]');
    await page.waitForSelector('#dlg[open] .log-undolist');
    await page.click('#dlgOk');
    await page.waitForFunction(() => !tkList().some(t => t.title === 'Zkontrolovat hasicí přístroje'));
    await saved();
    await page.waitForFunction(() => /Vráceno zpět/.test(document.querySelector('#rail .rail-logs').textContent));
  }
  // 2.64: Nový úkol má po najetí podnabídku Nový úkol / Požadavek pracovníka
  check(await page.$eval('#rail .rail-sub', el => getComputedStyle(el).visibility === 'hidden'), 'podnabídka bez najetí schovaná');
  await page.hover('#rail .rail-split > .rail-act');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#rail .rail-sub')).visibility === 'visible');
  const sub = await page.$$eval('#rail .rail-sub button', els => els.map(e => e.textContent.trim()));
  check(sub.join('|') === 'Nový úkol|Požadavek pracovníka', `dvojtlačítko: ${sub}`);
  await page.screenshot({ path: path.join(shots, '02b-podnabidka.png') });
  await page.click('#rail [data-railact="taskreq"]');
  await page.waitForSelector('#dlg[open] [name="who"]');
  await page.screenshot({ path: path.join(shots, '02c-pozadavek.png') });
  await page.fill('#dlg[open] [name="title"]', 'Nové pracovní boty');
  await page.click('#dlgOk');
  check(/Vyber pracovníka/.test(await page.textContent('#dlg[open] .dlg-error')), 'bez pracovníka chyba');
  await page.fill('#dlg[open] [name="who"]', 'xyz neexistuje');
  await page.click('#dlgOk');
  check(/nenašel/.test(await page.textContent('#dlg[open] .dlg-error')), 'neznámý pracovník chyba');
  const reqWho = await page.evaluate(() => { const e = Object.values(S.employees).find(x => !x.excluded && !x.lead); return { key: e.key, text: tkReqWhoText(e) }; });
  await page.fill('#dlg[open] [name="who"]', reqWho.text);
  await page.selectOption('#dlg[open] [name="sev"]', 'high');
  await page.click('#dlgOk');
  await page.waitForFunction(() => tkList().some(t => t.title === 'Nové pracovní boty'));
  await saved();
  const req = await page.evaluate(() => tkList().find(t => t.title === 'Nové pracovní boty'));
  check(req && req.person === reqWho.key && req.sev === 'high', `požadavek uložený u pracovníka: ${JSON.stringify(req)}`);
  await page.waitForFunction(() => /Nové pracovní boty/.test(document.querySelector('#rail .rail-tasks').textContent));
  // 2.65: kalendář v panelu – svátky, víkendy, úkol s termínem, poznámka přes bublinu
  const calInfo = await page.evaluate(() => ({ today: todayIso(), n: document.querySelectorAll('#rail .rail-cd').length, todayCell: !!document.querySelector(`#rail .rail-cd.today[data-calday="${todayIso()}"]`) }));
  check(calInfo.n >= 28 && calInfo.todayCell, `kalendář s dneškem: ${JSON.stringify(calInfo)}`);
  const taskDue = await page.evaluate(() => (tkList().find(t => t.due && TK_OPEN.has(t.state)) || {}).due);
  if (taskDue && taskDue.slice(0, 7) === calInfo.today.slice(0, 7)) {
    check(await page.$(`#rail [data-calday="${taskDue}"] .k-task`), 'den s termínem úkolu má tečku');
  }
  await page.hover(`#rail [data-calday="${calInfo.today}"]`);
  await page.waitForSelector('#railCalPop:not([hidden]) [data-calnote]');
  await page.screenshot({ path: path.join(shots, '02d-kalendar.png') });
  await page.hover('#railCalPop [data-calnote]');
  check(await page.$eval('#railCalPop', el => !el.hidden), 'bublina zůstane při přejetí na ni');
  await page.click('#railCalPop [data-calnote]');
  await page.waitForSelector('#dlg[open] [name="text"]');
  await page.fill('#dlg[open] [name="text"]', 'Návštěva auditora');
  await page.click('#dlgOk');
  await page.waitForFunction(() => (S.calNotes || []).some(n => n.text === 'Návštěva auditora'));
  await saved();
  await page.waitForSelector(`#rail [data-calday="${calInfo.today}"] .k-note`);
  check(/Návštěva auditora/.test(await page.textContent('#railCalPop')), 'poznámka v bublině po přidání');
  await page.screenshot({ path: path.join(shots, '02e-kalendar-poznamka.png') });
  check(/Poznámka v kalendáři/.test(await page.evaluate(() => S.log.slice(-3).map(x => x.text).join(' | '))), 'poznámka v historii změn');
  await page.click('#railCalPop [data-calnotedel]');
  await page.click('#dlgOk');
  await page.waitForFunction(() => !(S.calNotes || []).length);
  await saved();
  await page.keyboard.press('Escape');
  await page.click('#rail [data-calmove="1"]');
  check(await page.evaluate(() => ui.railCal) > calInfo.today.slice(0, 7), 'další měsíc');
  await page.click('#rail [data-calmove="0"]');
  check(await page.evaluate(() => ui.railCal) === calInfo.today.slice(0, 7), 'zpět na dnešek');
  // svátek: 1. 1. má červený den
  await page.evaluate(() => { ui.railCal = `${+todayIso().slice(0, 4) + 1}-01`; renderRail(); });
  check(await page.$eval(`#rail [data-calday="${+calInfo.today.slice(0, 4) + 1}-01-01"]`, el => el.classList.contains('hol')), 'Nový rok je svátek');
  await page.evaluate(() => { ui.railCal = ''; renderRail(); });
  // 2.66: časová osa pod kalendářem – okno 2 h zpět a 3 h dopředu, opakování, splněno, úprava, smazání
  await page.waitForSelector('#rail .rail-agenda .ag-now');
  const agT = await page.evaluate(() => { const d = new Date(Date.now() + 60 * 60e3); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; });
  await page.click('#rail [data-agadd]');
  await page.waitForSelector('#dlg[open] [name="title"]');
  await page.fill('#dlg[open] [name="title"]', 'Kontrola tlaku vzduchu');
  await page.fill('#dlg[open] [name="time"]', agT);
  await page.selectOption('#dlg[open] [name="rep"]', 'day');
  check(await page.$eval('#dlg[open] [name="work"]', el => el.checked), 'jen pracovní dny zaškrtnuté předem');
  await page.uncheck('#dlg[open] [name="work"]');   // test může běžet o víkendu
  await page.click('#dlgOk');
  await page.waitForFunction(() => (S.agenda || []).length === 1 && S.agenda[0].work === false);
  await saved();
  await page.waitForSelector('#rail .ag-item');
  const agOrder = await page.$$eval('#rail .ag-axis > *', els => els.map(e => e.className.split(' ')[0]));
  check(agOrder.indexOf('ag-now') >= 0 && agOrder.indexOf('ag-item') > agOrder.indexOf('ag-now'), `úkol za hodinu je pod čarou teď: ${agOrder}`);
  check(agOrder.filter(c => c === 'ag-hour').length >= 5, `hodinové značky v okně: ${agOrder}`);
  check(/každý den/.test(await page.textContent('#rail .ag-item')), 'opakování u úkolu');
  await page.screenshot({ path: path.join(shots, '02f-casova-osa.png') });
  await page.click('#rail .ag-item [data-agdone]');
  await page.waitForFunction(() => Object.keys(S.agenda[0].done).length === 1);
  await saved();
  check(await page.$eval('#rail .ag-item', el => el.classList.contains('done')), 'splněno v panelu');
  await page.click('#rail .ag-item [data-agedit]');
  await page.waitForSelector('#dlg[open] [name="del"]');
  await page.fill('#dlg[open] [name="title"]', 'Kontrola tlaku a oleje');
  const parity = await page.evaluate(() => (isoWeek(todayIso()).w % 2 === 0 ? 'even' : 'odd'));   // tento týden, ať úkol zůstane vidět
  await page.selectOption('#dlg[open] [name="rep"]', parity);
  await page.click('#dlgOk');
  await page.waitForFunction(p => S.agenda[0].title === 'Kontrola tlaku a oleje' && S.agenda[0].rep === p, parity);
  await saved();
  const agLog = await page.evaluate(() => S.log.slice(-4).map(x => x.text).join(' | '));
  check(/Časová osa: nový úkol/.test(agLog) && /Časová osa: splněno/.test(agLog) && /upraven úkol/.test(agLog), `časová osa v historii: ${agLog}`);
  await page.click('#rail .ag-item [data-agedit]');
  await page.waitForSelector('#dlg[open] [name="del"]');
  await page.check('#dlg[open] [name="del"]');
  await page.click('#dlgOk');
  await page.waitForFunction(() => !(S.agenda || []).length);
  await saved();
  check(await page.$('#rail .rail-agenda .ag-empty'), 'po smazání prázdná osa');
  // 2.67: přehled úkolů na časové ose v modulu Úkoly (zvlášť od běžných úkolů)
  await page.evaluate(() => { agAdd(S, { title: 'Porada směny', time: '06:15', rep: 'day', date: todayIso(), work: true }, { at: Date.now(), by: 'test' }); agAdd(S, { title: 'Měsíční inventura', time: '13:30', rep: 'month', date: todayIso() }, { at: Date.now(), by: 'test' }); save(); });
  await saved();
  await page.evaluate(() => { ui.tk.sel = null; });   // dřív se otevřel detail úkolu z panelu
  await page.click('#nav [data-view="ukoly"]');
  await page.waitForSelector('#view-ukoly.on [data-tkpart="agenda"]');
  const normalRows = await page.$$eval('#tkView [data-tkopen]', els => els.length);
  await page.click('#tkView [data-tkpart="agenda"]');
  await page.waitForSelector('#tkAgBody [data-agrow]');
  const agRows = await page.$$eval('#tkAgBody [data-agrow]', els => els.map(e => e.textContent.replace(/\s+/g, ' ')));
  check(agRows.length === 2 && /06:15.*Porada směny.*Každý den.*jen pracovní dny/.test(agRows[0]) && /13:30.*Měsíční inventura.*Každý měsíc/.test(agRows[1]), `přehled na časové ose: ${agRows}`);
  check(normalRows > 0 && !(await page.$('#tkView [data-tkopen]')), 'běžné úkoly v části časové osy nejsou');
  await page.screenshot({ path: path.join(shots, '02g-ukoly-casova-osa.png') });
  await page.fill('#tkAgQ', 'invent');
  await page.waitForFunction(() => document.querySelectorAll('#tkAgBody [data-agrow]').length === 1);
  await page.fill('#tkAgQ', '');
  await page.waitForFunction(() => document.querySelectorAll('#tkAgBody [data-agrow]').length === 2);
  await page.click('#tkAgBody [data-agrow]:first-child [data-agtedit]');
  await page.waitForSelector('#dlg[open] [name="title"]');
  await page.fill('#dlg[open] [name="title"]', 'Porada ranní směny');
  await page.fill('#dlg[open] [name="time"]', '06:05');
  await page.click('#dlgOk');
  await page.waitForFunction(() => S.agenda.some(x => x.title === 'Porada ranní směny' && x.time === '06:05'));
  await page.waitForFunction(() => /Porada ranní směny/.test(document.querySelector('#tkAgBody').textContent));
  await saved();
  await page.click('#tkAgBody [data-agrow]:last-child [data-agtdel]');
  await page.click('#dlgOk');
  await page.waitForFunction(() => S.agenda.length === 1);
  await saved();
  check((await page.$$('#tkAgBody [data-agrow]')).length === 1, 'smazání z přehledu');
  await page.click('#tkNew');
  await page.waitForSelector('#dlg[open] [name="work"]');
  await page.keyboard.press('Escape');
  await page.click('#tkView [data-tkpart="list"]');
  await page.waitForSelector('#tkView [data-tkopen]');
  await page.evaluate(() => { S.agenda = []; save(); });
  await saved();
  // rychlá akce přepne část
  await page.click('#rail [data-railact="sankce"]');
  await page.waitForSelector('#view-sankce.on');
  check(await page.$eval('#rail [data-railact="sankce"]', el => el.classList.contains('on')), 'akce aktuální části zvýrazněná');
  // Vše v posledních změnách otevře historii
  await page.click('#rail [data-raillog]');
  await page.waitForSelector('#dlg[open] #logList');
  await page.keyboard.press('Escape');

  // ---------- souhrn v kapsli s pruhem pokroku, skleněná plocha ----------
  await page.click('#nav [data-view="prehled"]');
  await page.waitForSelector('#view-prehled.on');
  const cap = await page.evaluate(() => {
    const st = document.querySelector('#ovStats'), cs = getComputedStyle(st), tile = getComputedStyle(st.querySelector('.stat'));
    const bars = [...st.querySelectorAll('.stat-bar i')].map(i => parseFloat(i.style.width));
    const view = getComputedStyle(document.querySelector('#view-prehled'));
    return { radius: parseFloat(cs.borderTopLeftRadius), gap: cs.columnGap, tileBg: tile.backgroundColor, bars, viewRadius: parseFloat(view.borderTopLeftRadius), viewBg: view.backgroundImage.slice(0, 15) };
  });
  check(cap.radius >= 20 && (cap.gap === '0px' || cap.gap === 'normal') && /rgba\(0, 0, 0, 0\)|transparent/.test(cap.tileBg), `souhrn v kapsli: ${JSON.stringify(cap)}`);
  check(cap.bars.length >= 2 && cap.bars.every(w => w >= 0 && w <= 100) && cap.bars.some(w => w > 0), `pruhy pokroku: ${cap.bars}`);
  check(cap.viewRadius >= 24 && /gradient/.test(cap.viewBg), `skleněná plocha obsahu: ${JSON.stringify(cap)}`);
  const trend = await page.$$eval('#ovStats .trend', els => els.map(e => e.textContent));
  const prevOk = await page.evaluate(() => { const ids = Object.keys(S.periods).sort(); return ids.indexOf(S.current) > 0; });
  check(!prevOk || trend.length >= 1, `štítek trendu proti minulému měsíci: ${trend}`);
  await page.screenshot({ path: path.join(shots, '03-prehled-1920.png') });

  // ---------- hladké křivky v profilu ----------
  const key = await page.evaluate(() => activeRows()[0].e.key);
  await page.evaluate(k => openProfile(k), key);
  await page.waitForSelector('#view-profil.on .chart.ch-smooth');
  const curve = await page.evaluate(() => {
    const ch = document.querySelector('#view-profil .chart.ch-smooth');
    return { d: ch.querySelector('.wa-line').getAttribute('d'), area: !!ch.querySelector('.ch-area'), hp: ch.querySelectorAll('.hp').length, dots: ch.querySelectorAll('.wa-dot').length };
  });
  check((curve.dots < 2 || /C/.test(curve.d)) && curve.area && curve.hp > 0, `hladká křivka s plochou: ${JSON.stringify(curve).slice(0, 160)}`);
  const hp = await page.$('#view-profil .chart.ch-smooth .hp:last-of-type .hit');
  await hp.hover();
  await page.waitForTimeout(250);
  const hov = await page.evaluate(() => {
    const g = [...document.querySelector('#view-profil .chart.ch-smooth').querySelectorAll('.hp')].pop();
    return { xh: getComputedStyle(g.querySelector('.xh')).opacity, tip: (document.querySelector('#view-profil .chart-tip, .chart-tip.on') || {}).textContent || '' };
  });
  check(hov.xh === '1', `čárkovaná linka při najetí: ${JSON.stringify(hov)}`);
  await page.screenshot({ path: path.join(shots, '04-profil.png') });

  // ---------- KPI: oddělení barevně ----------
  await page.evaluate(() => { ui.wa.tab = 'vykon'; showView('audit'); });
  await page.waitForSelector('#view-audit.on');
  const kpi = await page.evaluate(() => ({ months: kpiMonths().length, depts: kpiMonths().length ? kpiPerf(kpiMonths()[0]).depts.length : 0, card: !!document.querySelector('#view-audit .cat-card'), rows: document.querySelectorAll('#view-audit .cat-row').length, sw: [...document.querySelectorAll('#view-audit .cat-sw')].map(e => getComputedStyle(e).backgroundColor) }));
  if (kpi.depts > 1) {
    check(kpi.card && kpi.rows === kpi.depts, `KPI oddělení vedle sebe: ${JSON.stringify(kpi)}`);
    check(new Set(kpi.sw).size === Math.min(kpi.sw.length, 6), `každé oddělení jinou barvou: ${kpi.sw}`);
    await page.screenshot({ path: path.join(shots, '05-kpi.png') });
  }

  // ---------- sbalitelné menu ----------
  await page.click('#nav [data-view="prehled"]');
  await page.click('#sideMini');
  await page.waitForTimeout(250);
  const mini = await page.evaluate(() => ({
    on: document.documentElement.classList.contains('side-mini'), w: document.querySelector('.side').getBoundingClientRect().width,
    title: document.querySelector('#nav [data-view="lide"]').title, span: getComputedStyle(document.querySelector('#nav [data-view="lide"] span')).display,
    pressed: document.querySelector('#sideMini').getAttribute('aria-pressed'), stored: localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('odmeny.side.v1')) || ''),
  }));
  check(mini.on && mini.w < 100 && mini.title === 'Lidé' && mini.span === 'none' && mini.pressed === 'true' && mini.stored === 'mini', `úzké menu: ${JSON.stringify(mini)}`);
  check(await over() <= 1, 'úzké menu bez přetečení');
  await page.screenshot({ path: path.join(shots, '06-uzke-menu.png') });
  await page.click('#nav [data-view="lide"]');
  await page.waitForSelector('#view-lide.on');
  await page.click('#sideMini');
  await page.waitForFunction(() => document.querySelector('.side').getBoundingClientRect().width > 200, null, { timeout: 5000 }).catch(() => {});
  const back = await page.evaluate(() => ({ on: document.documentElement.classList.contains('side-mini'), title: document.querySelector('#nav [data-view="lide"]').title, w: document.querySelector('.side').getBoundingClientRect().width, stored: Object.keys(localStorage).filter(k => k.startsWith('odmeny.side.v1')).length }));
  check(!back.on && back.title === '' && back.w > 200 && back.stored === 0, `menu zase rozbalené: ${JSON.stringify(back)}`);

  // ---------- 2560 a 1440: panel jen na širokém ----------
  await page.click('#nav [data-view="prehled"]');
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.waitForTimeout(300);
  check(await page.$eval('#rail', el => el.getBoundingClientRect().width > 250), 'panel na 2560');
  // 2.64: Přehled má střed nejvýš 2400 px, panel vyplní zbytek a je hned vedle středu
  const fit = () => page.evaluate(() => { const r = document.querySelector('#rail').getBoundingClientRect(), m = document.querySelector('#main').getBoundingClientRect(); return { rail: Math.round(r.width), gap: Math.round(r.left - m.right), right: Math.round(innerWidth - r.right), main: Math.round(m.width) }; });
  let f = await fit();
  check(f.rail >= 296 && f.gap >= 0 && f.gap <= 2 && f.right <= 16, `2560 Přehled bez mezery: ${JSON.stringify(f)}`);
  await page.setViewportSize({ width: 3840, height: 1600 });
  await page.waitForTimeout(300);
  f = await fit();
  check(f.main <= 2400 && f.rail > 1000 && f.gap <= 2 && f.right <= 16, `3840 Přehled: panel se roztáhl: ${JSON.stringify(f)}`);
  check(await page.$eval('#rail .rail-in', el => getComputedStyle(el).gridTemplateColumns.split(' ').length >= 2), 'široký panel ve více sloupcích');
  check(await over() <= 1, '3840 bez přetečení');
  await page.screenshot({ path: path.join(shots, '07b-3840.png') });
  await page.click('#nav [data-view="nastaveni"]');
  await page.waitForSelector('#view-nastaveni.on');
  await page.waitForFunction(() => document.querySelector('#main').getBoundingClientRect().width <= 1920, null, { timeout: 5000 }).catch(() => {});
  f = await fit();
  if (f.main > 1920) console.log('debug', await page.evaluate(() => ({ view: ui.view, mw: getComputedStyle(document.querySelector('#main')).maxWidth, cols: getComputedStyle(document.querySelector('.shell')).gridTemplateColumns, on: [...document.querySelectorAll('.view.on')].map(v => v.id) })));
  check(f.main <= 1920 && f.gap <= 2 && f.right <= 16, `3840 Nastavení (střed do 1920): ${JSON.stringify(f)}`);
  await page.screenshot({ path: path.join(shots, '07c-3840-nastaveni.png') });
  // 2.64: Shortage v panelu jen se zbývajícím místem
  await page.evaluate(() => {
    S.shortage = cleanShortage({ ...S.shortage, lists: [{ id: 'shtest', at: Date.now(), by: 'test', file: 'urgenty.xlsx', items: [
      { order: '4500001', name: 'Lopatka turbíny', ean: '0001', index: 'A', qty: '12', top: true, op: 'Broušení' },
      { order: '4500002', name: 'Kryt ložiska', ean: '0002', index: 'B', qty: '4', top2: true, op: 'Frézování' },
      { order: '4500003', name: 'Hřídel', ean: '0003', index: 'C', qty: '2' }] }] });
    save(); renderTaskAlert();
  });
  await page.waitForSelector('#rail .rail-short');
  const shCard = await page.$eval('#rail .rail-short', el => ({ vis: getComputedStyle(el).display !== 'none', text: el.textContent.replace(/\s+/g, ' ') }));
  check(shCard.vis && /1 TOP/.test(shCard.text) && /1 TOP 2/.test(shCard.text) && /Lopatka turbíny/.test(shCard.text), `Shortage v širokém panelu: ${JSON.stringify(shCard)}`);
  await page.screenshot({ path: path.join(shots, '07d-3840-shortage.png') });
  await page.click('#rail .rail-short .rail-shname');
  await page.waitForSelector('#view-shortage.on');
  await page.click('#nav [data-view="prehled"]');
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.waitForTimeout(300);
  check(await over() <= 1, '2560 bez přetečení');
  await page.screenshot({ path: path.join(shots, '07-2560.png') });
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.waitForTimeout(300);
  check(await page.$eval('#rail .rail-short', el => getComputedStyle(el).display === 'none'), 'v úzkém panelu Shortage není');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  check(await page.$eval('#rail', el => getComputedStyle(el).display === 'none' && el.innerHTML === ''), 'na 1440 panel není');
  check(await page.$eval('#taskAlert', el => /po termínu/.test(el.textContent)), 'na 1440 je horní pruh úkolů zpátky');
  check(await over() <= 1, '1440 bez přetečení');
  await page.screenshot({ path: path.join(shots, '08-1440.png') });

  // ---------- telefon ----------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  check(await page.$eval('#rail', el => getComputedStyle(el).display === 'none'), 'na telefonu panel není');
  check(await page.$eval('#sideMini', el => getComputedStyle(el).display === 'none'), 'na telefonu tlačítko sbalení není');
  check(await over() <= 1, 'telefon bez přetečení');
  await page.screenshot({ path: path.join(shots, '09-telefon.png') });
  await ctx.close();

  await browser.close();
  if (problems.length) {
    console.log('PROBLÉMY:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
  console.log('panel a vzhled 2.59 ok');
})().catch(err => { console.error(err); process.exit(1); });
