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

  // ---------- pravý panel ----------
  await page.waitForSelector('#rail .rail-me');
  const rail = await page.evaluate(() => {
    const r = document.querySelector('#rail').getBoundingClientRect(), m = document.querySelector('#main').getBoundingClientRect();
    return { w: r.width, right: r.right, left: r.left, mainRight: m.right, me: document.querySelector('#rail .rail-me').textContent, acts: document.querySelectorAll('#rail [data-railact]').length };
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
  await page.waitForTimeout(250);
  const back = await page.evaluate(() => ({ on: document.documentElement.classList.contains('side-mini'), title: document.querySelector('#nav [data-view="lide"]').title, w: document.querySelector('.side').getBoundingClientRect().width, stored: Object.keys(localStorage).filter(k => k.startsWith('odmeny.side.v1')).length }));
  check(!back.on && back.title === '' && back.w > 200 && back.stored === 0, `menu zase rozbalené: ${JSON.stringify(back)}`);

  // ---------- 2560 a 1440: panel jen na širokém ----------
  await page.click('#nav [data-view="prehled"]');
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.waitForTimeout(300);
  check(await page.$eval('#rail', el => el.getBoundingClientRect().width > 250), 'panel na 2560');
  check(await over() <= 1, '2560 bez přetečení');
  await page.screenshot({ path: path.join(shots, '07-2560.png') });
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
