// Prohlížečový průchod: Rychlá kontrola na telefonu (verze 2.39). Vedoucí zadá, kolik lidí chce
// zkontrolovat, vybere směnu, oddělení a případně jen lidi dnes v práci, a dostane seznam jmen.
// Kontroluje: vstup z hlavního menu i z plovoucího menu, počítadlo a rychlé volby, filtry proti
// výpočtu (quickPool), přednost nejdéle nekontrolovaných, výměnu jednoho člověka, sdílení (schránka),
// uložení do dnešních kontrol, zápis kontroly a postup, odkaz z Kontrol, šířku, tmavý režim a monitor.
// Všechna data jsou vymyšlená. Hodiny stránky stojí na pátku 30. 10. 2026 v 10:00.
// Spuštění stejně jako e2e_browser.js:
//   ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t . dev-router.php &
//   curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state
//   NO_PROXY=127.0.0.1 PW=$(npm root -g)/playwright S=$S node tests/e2e_rychla.js
// Snímky jsou v $S/oshots-rychla.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-rychla');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };
const NOW = new Date(2026, 9, 30, 10, 0);

async function watch(page, label) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  page.on('response', r => { if (r.status() >= 400) problems.push(`${label} HTTP ${r.status()} ${r.url()}`); });
  page.on('pageerror', err => problems.push(`${label} pageerror: ${err.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`));
  });
}
const saved = page => page.waitForFunction(() => !store.dirty && !store.saving && document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 15000 });
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const text = async (page, sel) => (await page.textContent(sel)).replace(/\s+/g, ' ').trim();
const rows = page => page.evaluate(() => [...document.querySelectorAll('#qkResult .qk-row')].map(r => r.dataset.qkkey));

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.clock.setFixedTime(NOW);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });
  const page = await ctx.newPage();
  await watch(page, 'rychlá');
  await page.goto(BASE);
  await page.waitForSelector('#setupForm');
  await page.fill('[name="token"]', fs.readFileSync(process.env.TOKEN_FILE || path.join(S, 'odme2e', 'setup-token.txt'), 'utf8').trim());
  await page.fill('[name="label"]', 'Mistr');
  await page.click('#setupForm button[type="submit"]');
  await page.waitForSelector('.odm-card');
  await page.check('#saved');
  await page.click('#finish');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForFunction(() => { const sp = document.querySelector('#splash'); return sp && sp.hidden && typeof ui !== 'undefined' && ui.view === 'domu'; }, null, { timeout: 10000 });
  await saved(page);

  // Dvě oddělení: Brus 12 lidí (6 stálá ranní, 6 odpolední, jeden nemocný), Lepení 4 (směnnost
  // skupina 1 a 2, střídání nastavené: tento týden má ranní skupina 1). Jeden vedoucí.
  await page.evaluate(() => {
    const st = blank();
    const grp = (id, name, dept) => { const p = mkPos(id, name, []); p.dept = dept; p.skillset = [{ id: `${id}s0`, name: 'Práce', desc: '', scale: null }]; p.maxTab = 8; p.tiers = []; return p; };
    st.positions = [grp('g_brus', 'Brus', 'Brus'), grp('g_lep', 'Lepení', 'Lepení')];
    const NAMES = ['Adámek', 'Bednář', 'Cibulka', 'Dvořák', 'Exner', 'Fiala', 'Gregor', 'Havel', 'Ihnát', 'Janků', 'Kolář', 'Liška', 'Malý', 'Novák', 'Oliva', 'Pokorný', 'Rys'];
    NAMES.forEach((n, i) => {
      const key = `${n.toLowerCase()}|jan`;
      const g = i < 12 ? 'g_brus' : i < 16 ? 'g_lep' : 'g_brus';
      const shift = i < 6 ? 'R' : i < 12 ? 'O' : i < 14 ? 'S1' : i < 16 ? 'S2' : 'R';
      st.employees[key] = { key, last: n, first: 'Jan', positionId: g, shift, note: '', wid: String(200 + i), rate: { [`${g}s0`]: 2 } };
    });
    st.employees['exner|jan'].sick = '2026-10-29';
    st.employees['rys|jan'].lead = ['Brus'];
    st.capReport = { ...st.capReport, s1am: '2026-W44' };
    st.audit.tasks = { Brus: [{ id: 't1', text: 'Úklid pracoviště' }, { id: 't2', text: 'Ochranné brýle' }], Lepení: [{ id: 't3', text: 'Štítky na dílech' }] };
    S = sanitizeState(st);
    // Adámek a Bednář byli kontrolovaní minulý týden, mají nejnižší přednost.
    ['adámek|jan', 'bednář|jan'].forEach((k, i) => {
      const it = addToPlan('2026-W43', k, '2026-10-2' + (i + 1), { at: Date.now(), by: 'Mistr' });
      recordCheck('2026-W43', it.id, { date: it.day, answers: { t1: true, t2: true } }, { at: Date.now(), by: 'Mistr' });
    });
    save(); renderAll();
  });
  await saved(page);
  await page.evaluate(() => showView('domu'));
  // úvod bez dnešních příchodů: plán a výzva k nahrání (otevře výběr souboru)
  check(/Plánovaná obsazenost/.test(await text(page, '.home-hero')), 'úvod bez příchodů ukazuje plán');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), page.click('[data-hgo="pres"]')]);
  check(!!chooser, 'Nahrát dnešní příchody otevře výběr souboru');

  // Vstup z hlavního menu: dlaždice Rychlá kontrola.
  if (await page.isHidden('#homeView .home-open')) await page.click('[data-hshift="am"]');
  check(/vylosovat jména/.test(await text(page, '#homeView .tile[data-go="rychla"]')), 'dlaždice Rychlá kontrola v hlavním menu');
  await page.click('#homeView .tile[data-go="rychla"]');
  await page.waitForSelector('#view-rychla.on .qk-hero');
  check(await page.evaluate(() => history.state && history.state.odmView === 'rychla'), 'rychlá kontrola je záznam v historii (Zpět)');
  // směna se převezme z hlavního menu (ranní)
  check(await page.getAttribute('.qk-seg', 'data-on') === 'am', 'směna z hlavního menu');
  const poolAm = await page.evaluate(() => quickPool(qkOpt()).list.map(x => x.key));
  // ranní: Brus R 6 bez nemocného Exnera = 5, Lepení S1 (Malý, Novák) = 2; vedoucí Rys ne
  check(poolAm.length === 7 && !poolAm.includes('exner|jan') && !poolAm.includes('rys|jan') && poolAm.includes('malý|jan') && poolAm.includes('novák|jan'), `nabídka ranní: ${poolAm}`);
  check(/^7\s*lidí v nabídce/.test(await text(page, '.qk-kpi')), `KPI: ${await text(page, '.qk-kpi')}`);
  check(await overflow(page) <= 0, `telefon: stránka se posouvá do strany (${await overflow(page)} px)`);
  await page.screenshot({ path: path.join(shots, '01-uvod.png'), fullPage: true });

  // Počítadlo a rychlé volby.
  check(await page.textContent('#qkN') === '5', 'výchozí počet 5');
  await page.click('[data-qkn="1"]');
  await page.click('[data-qkn="1"]');
  check(await page.textContent('#qkN') === '7', 'plus dvakrát = 7');
  await page.click('[data-qkn="-1"]');
  check(await page.textContent('#qkN') === '6', 'mínus = 6');
  await page.click('[data-qkset="10"]');
  check(/V nabídce je jen 7 lidí/.test(await text(page, '.qk-of')), `víc, než je v nabídce: ${await text(page, '.qk-of')}`);
  check(/Vylosovat 7 lidí/.test(await text(page, '.qk-go')), 'tlačítko vylosuje jen 7');
  await page.click('[data-qkset="3"]');
  check(/Vylosovat 3 lidi/.test(await text(page, '.qk-go')), `tlačítko: ${await text(page, '.qk-go')}`);

  // Obě směny, všechna oddělení: Brus 11 (bez Exnera), Lepení 4 → 3 lidé = 2 + 1 (2,2 : 0,8).
  await page.click('[data-qkslot=""]');
  check(await page.getAttribute('.qk-seg', 'data-on') === 'all', 'obě směny');
  check(/Všechna 15/.test(await text(page, '.qk-depts')) && /Brus 11/.test(await text(page, '.qk-depts')) && /Lepení 4/.test(await text(page, '.qk-depts')), `oddělení s počty: ${await text(page, '.qk-depts')}`);
  check(await page.isHidden('.qk-pres'), 'bez dnešních příchodů přepínač není');
  check(/příchody nejsou nahrané/.test(await text(page, '#qkView')), 'věta, že příchody nejsou nahrané');
  await page.click('.qk-go');
  await page.waitForSelector('#qkResult .qk-row');
  let keys = await rows(page);
  const depts = await page.evaluate(k => k.map(x => empDept(S.employees[x])), keys);
  check(keys.length === 3 && new Set(keys).size === 3, `vylosováni 3 různí: ${keys}`);
  check(depts.filter(d => d === 'Brus').length === 2 && depts.filter(d => d === 'Lepení').length === 1, `rozdělení mezi oddělení: ${depts}`);
  check(!keys.includes('adámek|jan') && !keys.includes('bednář|jan'), 'zkontrolovaní minulý týden mají nejnižší přednost');
  check(/zatím bez kontroly/.test(await text(page, '#qkResult')), 'u člověka bez kontroly „zatím bez kontroly“');
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(shots, '02-seznam.png'), fullPage: true });

  // Výměna jednoho člověka: ze stejného oddělení, nikdo dvakrát.
  const swapKey = keys[0];
  const swapDept = depts[0];
  await page.click(`[data-qkswap="${swapKey}"]`);
  const keys2 = await rows(page);
  const newKey = keys2.find(k => !keys.includes(k));
  check(keys2.length === 3 && new Set(keys2).size === 3 && !keys2.includes(swapKey) && newKey, `výměna: ${keys} → ${keys2}`);
  check(newKey && await page.evaluate(k => empDept(S.employees[k]), newKey) === swapDept, 'náhradník ze stejného oddělení');
  check(await page.isVisible(`.qk-row.swapped[data-qkkey="${newKey}"]`), 'vyměněný řádek je zvýrazněný');
  keys = keys2;

  // Sdílení: telefon bez navigator.share zkopíruje seznam do schránky.
  await page.evaluate(() => { try { delete navigator.share; } catch (e) { /* nic */ } Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); });
  await page.click('[data-qkshare]');
  await page.waitForTimeout(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  const names = await page.evaluate(k => k.map(x => audName(S.employees[x])), keys);
  check(/^Kontrola · pátek 30\. října/.test(clip) && names.every((n, i) => clip.includes(`${i + 1}. ${n} (`)), `schránka: ${clip}`);

  // Klepnutí na člověka v seznamu (2.42.1): body kontroly, splněno / nesplněno, rovnou do dnešních kontrol.
  const k0 = keys[0];
  await page.click(`#qkResult [data-qkopen="${k0}"]`);
  await page.waitForSelector('#dlg[open] .kt-points');
  const pts = await page.locator('#dlg .kt-point').count();
  check(pts >= 1 && /Kontrola · /.test(await text(page, '#dlgTitle')), `body kontroly v dialogu: ${pts}`);
  await page.screenshot({ path: path.join(shots, '02b-body.png') });
  await page.click('#ktAllOk');
  await page.locator('#dlg .kt-point').first().locator('label.no').click();
  await page.click('#dlgOk');
  await page.waitForSelector(`#qkResult .qk-row.qk-done[data-qkkey="${k0}"]`);
  await saved(page);
  const one = await page.evaluate(k => audPlan('2026-W44').items.filter(i => i.key === k).map(i => [i.state, i.extra, i.results.filter(r => !r.ok).length]), k0);
  check(JSON.stringify(one) === '[["done",true,1]]', `zapsáno z vylosovaného seznamu: ${JSON.stringify(one)}`);
  check(new RegExp(`^${pts - 1}/${pts}$`).test(await text(page, `#qkResult .qk-row[data-qkkey="${k0}"] .t5-state`)) && await page.isHidden(`#qkResult [data-qkswap="${k0}"]`), 'výsledek v řádku, vyměnit už nejde');
  await page.screenshot({ path: path.join(shots, '02c-zapsano.png'), fullPage: true });

  // Uložení do dnešních kontrol.
  await page.click('[data-qksave]');
  await saved(page);
  const plan = await page.evaluate(() => audPlan('2026-W44').items.filter(i => i.day === '2026-10-30').map(i => [i.key, i.state, i.extra]));
  check(plan.length === 3 && plan.every(p => keys.includes(p[0]) && p[1] === (p[0] === k0 ? 'done' : 'plan') && p[2]), `plán dne: ${JSON.stringify(plan)}`);
  check(await page.isHidden('#qkResult'), 'po uložení se vylosovaný seznam zavře');
  check(/Dnes ke kontrole\s*1 \/ 3/.test(await text(page, '.qk-today')), `dnešní kontroly: ${await text(page, '.qk-today')}`);
  const pool2 = await page.evaluate(() => quickPool(qkOpt()).list.map(x => x.key));
  check(pool2.length === 12 && !pool2.some(k => keys.includes(k)), 'uložení už se znovu nelosují');

  // Zápis kontroly z rychlé kontroly.
  await page.click('.qk-today .qk-plan [data-qkcheck]');
  await page.waitForSelector('#dlg[open] .kt-points');
  await page.click('#ktAllOk');
  await page.click('#dlgOk');
  await page.waitForFunction(() => document.querySelectorAll('.qk-today .qk-done').length === 2);
  await saved(page);
  check(/2 \/ 3/.test(await text(page, '.qk-prog')), `postup po zápisu: ${await text(page, '.qk-prog')}`);
  check(/2\s*zapsáno$/.test(await text(page, '.qk-kpi')), `KPI po zápisu: ${await text(page, '.qk-kpi')}`);
  check(await page.evaluate(() => audPlan('2026-W44').items.filter(i => i.state === 'done').length) === 2, 'kontrola zapsaná v plánu');
  await page.screenshot({ path: path.join(shots, '03-dnes.png'), fullPage: true });

  // Jen lidé v práci podle příchodů: v práci 3 z Brusu a 1 z Lepení, jeden z nich už v plánu.
  await page.evaluate(k => {
    const wid = x => S.employees[x].wid;
    // pátý příchozí: vylosovaný, který mezi čtyřmi není (jinak nemocný Exner, do nabídky nejde)
    const inn = ['cibulka|jan', 'dvořák|jan', 'havel|jan', 'malý|jan'];
    S.workAudit.dv.pres['2026-10-30'] = Object.fromEntries([...inn, k.find(x => !inn.includes(x)) || 'exner|jan'].map(x => [wid(x), [360, null]]));
    save(); renderQuick();
  }, keys);
  await saved(page);
  check(await page.isVisible('.qk-pres') && await page.isChecked('[data-qkpres]'), 'přepínač Jen lidé dnes v práci, zapnutý');
  const presPool = await page.evaluate(() => quickPool(qkOpt()).list.map(x => x.key).sort());
  const expPres = ['cibulka|jan', 'dvořák|jan', 'havel|jan', 'malý|jan'].filter(k => !keys.includes(k)).sort();
  check(JSON.stringify(presPool) === JSON.stringify(expPres), `nabídka jen z lidí v práci: ${presPool} / ${expPres}`);
  await page.click('[data-qkset="10"]');
  await page.click('.qk-go');
  await page.waitForSelector('#qkResult .qk-row');
  check(/Požadováno 10, v nabídce bylo jen/.test(await text(page, '#qkResult')), 'upozornění, že v nabídce je méně lidí');
  check(JSON.stringify((await rows(page)).sort()) === JSON.stringify(expPres), 'vylosováni všichni v práci');
  await page.click('.qk-pres');
  check(!(await page.isChecked('[data-qkpres]')) && await page.evaluate(() => quickPool(qkOpt()).list.length) === 12, 'vypnutím se losuje ze všech');

  // Oddělení a odpolední směna; Lepení bez střídání upozorní na směnnost.
  await page.click('[data-qkdept="Lepení"]');
  await page.click('[data-qkslot="pm"]');
  const lepPm = await page.evaluate(() => quickPool(qkOpt()).list.map(x => x.key).sort());
  check(lepPm.every(k => ['oliva|jan', 'pokorný|jan'].includes(k)) && lepPm.length >= 1, `Lepení odpolední (skupina 2): ${lepPm}`);
  await page.evaluate(() => { S.capReport.s1am = ''; renderQuick(); });
  check(/směnností: střídání skupin není nastavené/.test(await text(page, '#qkView')), 'upozornění na nenastavené střídání');
  check(/Není koho vylosovat/.test(await text(page, '.qk-go')) && await page.isDisabled('.qk-go'), 'bez nabídky tlačítko nejde');
  await page.evaluate(() => { S.capReport.s1am = '2026-W44'; renderQuick(); });

  // Úvod HALA 2 se skutečností podle dnešních příchodů (2.39.3): 5 lidí ráno, nikdo odpoledne.
  await page.evaluate(() => { S.workAudit.dv.files = [{ name: 'prichody.xlsx', at: new Date(2026, 9, 30, 6, 40).getTime(), by: 'Mistr', from: '2026-10-30', to: '2026-10-30', people: 5, days: 1, rows: 5, months: [] }]; showView('domu'); });
  const hero = await text(page, '.home-hero');
  check(/V práci podle příchodů · nahráno 06:40/.test(hero), `úvod se skutečností: ${hero}`);
  const big = await page.$$eval('.hh-big .hb b', els => els.map(e => e.dataset.count));
  const planBig = await page.evaluate(() => [staffDay().total.am, staffDay().total.pm]);
  check(JSON.stringify(big) === JSON.stringify(['5', '0']), `v práci ranní / odpolední: ${big}`);
  check(new RegExp(`plán ${planBig[0]}`).test(await text(page, '.hb.am small')), `u čísla plán: ${await text(page, '.hb.am small')}`);
  check(/Teď v práci 5 z 5 příchodů/.test(hero), 'teď v práci');
  check(/směna ještě nezačala/.test(await text(page, '.hb.pm small')) && await page.$$eval('.hs-cell.pm.short', e => e.length) === 0, 'odpolední v 10:00 bez rozdílu');
  const hsum = await page.$$eval('.hs-row:not(.hs-th) .hs-cell.am b', els => els.reduce((a, e) => a + +e.textContent, 0));
  check(hsum === 5 && /V práci podle oddělení/.test(await text(page, '.home-staff')), `oddělení: součet ranní ${hsum}`);
  check(await page.isHidden('[data-hgo="pres"]'), 'po nahrání výzva zmizí');
  check(await overflow(page) <= 0, `úvod se skutečností: posun do strany ${await overflow(page)} px`);
  await page.waitForTimeout(1700);
  await page.screenshot({ path: path.join(shots, '07-uvod-prichody.png'), fullPage: true });
  // Rozbalovací Teď v práci (2.43): oddělení s pruhem, kdo z plánu nedorazil
  check(await page.isHidden('#homeNow'), 'rozpad je sbalený');
  await page.click('.hh-nowbox > summary');
  await page.waitForSelector('#homeNow .hn-dept');
  const hn = await page.evaluate(() => {
    const x = staffNow(staffDay(), ui.homeShift);
    return { ui: [...document.querySelectorAll('#homeNow .hn-dept')].map(d => [d.querySelector('.hn-head b').textContent, d.querySelector('.hn-head .num').textContent.replace(/\s+/g, ''), d.querySelectorAll('.hn-chip.miss').length]),
      core: x.depts.map(d => [d.dept, `${d.came}/${d.plan}`, d.missing.length]), open: ui.homeNowOpen, miss: x.total.missing };
  });
  check(JSON.stringify(hn.ui) === JSON.stringify(hn.core) && hn.open === true && hn.miss > 0, `rozpad po odděleních: ${JSON.stringify(hn)}`);
  check(/nedorazilo/.test(await text(page, '#homeNow .hn-sum')) && /Nedorazili/.test(await text(page, '#homeNow')), 'souhrn a nedorazili');
  check(await overflow(page) <= 0, `rozpad: posun do strany ${await overflow(page)} px`);
  await page.screenshot({ path: path.join(shots, '07b-ted-v-praci.png'), fullPage: true });
  await page.click('.hh-nowbox > summary');

  // Sobota 31. 10. (2.40.1): s dnešními příchody úvod ukáže dnešek (mimo plán), bez nich plán
  // na pondělí, poslední nahrané příchody a výzvu k nahrání.
  await ctx.clock.setFixedTime(new Date(2026, 9, 31, 9, 0));
  await page.evaluate(() => { const w = S.employees['cibulka|jan'].wid, v = S.employees['dvořák|jan'].wid; S.workAudit.dv.pres['2026-10-31'] = { [w]: [420, null], [v]: [425, null] }; showView('domu'); });
  const sat = await text(page, '.home-hero');
  check(/sobota 31\. října · víkend, směna mimo plán/.test(sat) && /V práci podle příchodů/.test(sat), `sobota s příchody: ${sat}`);
  check(JSON.stringify(await page.$$eval('.hh-big .hb b', els => els.map(e => e.dataset.count))) === JSON.stringify(['2', '0']), 'sobota: 2 lidé ráno');
  check(/lidé · mimo plán/.test(await text(page, '.hb.am small')) && !(await page.$('.hb em.neg')), 'sobota: bez rozdílu proti plánu');
  await page.screenshot({ path: path.join(shots, '08-sobota.png') });
  await page.evaluate(() => { delete S.workAudit.dv.pres['2026-10-31']; renderHome(); });
  const satNo = await text(page, '.home-hero');
  check(/Dnes se nepracuje · plán na pondělí 2\. listopadu/.test(satNo) && /Plánovaná obsazenost/.test(satNo), `sobota bez příchodů: ${satNo}`);
  check(/Poslední příchody: Pá 30\. 10\. · 5 lidí/.test(satNo) && await page.isVisible('[data-hgo="pres"]'), 'sobota: poslední příchody a výzva k nahrání');
  await page.click('[data-hgo="lastpres"]');
  await page.waitForFunction(() => ui.view === 'audit' && ui.wa.tab === 'lide' && ui.wa.dvDay === '2026-10-30');
  await ctx.clock.setFixedTime(NOW);
  await page.evaluate(() => showView('domu'));

  // Plovoucí menu a odkaz z Kontrol.
  await page.evaluate(() => showView('kontroly'));
  await page.click('#fab');
  await page.waitForFunction(() => document.body.classList.contains('fab-open'));
  check(await page.isVisible('#fabMenu [data-fab="rychla"]'), 'Rychlá kontrola v plovoucím menu');
  await page.click('#fabMenu [data-fab="rychla"]');
  await page.waitForSelector('#view-rychla.on');
  await page.evaluate(() => showView('kontroly'));
  await page.click('#view-kontroly [data-go="rychla"]');
  await page.waitForSelector('#view-rychla.on');
  check(await overflow(page) <= 0, `telefon po všem: posun do strany ${await overflow(page)} px`);

  // Tmavý režim a malý telefon.
  await page.click('[data-qkdept=""]');
  await page.click('[data-qkslot=""]');
  await page.click('[data-qkset="5"]');
  await page.click('.qk-go');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(shots, '04-tmavy.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 320, height: 640 });
  await page.waitForTimeout(200);
  check(await overflow(page) <= 0, `telefon 320 px: posun do strany ${await overflow(page)} px`);
  await page.screenshot({ path: path.join(shots, '05-maly.png'), fullPage: true });

  // Monitor: stejná stránka uprostřed.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  check(await overflow(page) <= 0, `monitor: posun do strany ${await overflow(page)} px`);
  check(await page.isVisible('#nav [data-view="rychla"]'), 'na monitoru je Rychlá kontrola v menu');
  await page.screenshot({ path: path.join(shots, '06-monitor.png') });

  await browser.close();
  if (problems.length) { console.log(`PROBLÉMY (${problems.length}):\n${problems.join('\n')}`); process.exit(1); }
  console.log('rychlá kontrola ok');
})().catch(error => { console.error(problems.join("\n")); console.error(error); process.exit(1); });
