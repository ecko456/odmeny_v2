// Prohlížečový průchod 2.62: dva lidé pracují současně (dvě okna se stejnými daty).
// Ověří: změny v různých místech se sloučí samy (bez okna), obě nové sankce zůstanou, historie
// má jen vlastní změny, druhé okno si novou verzi samo načte (průběžná kontrola) a ukáže, kdo
// ji uložil; stejný údaj změněný oběma = okno střetu (moje / jejich, Všude), rozepsané pole se
// při načtení nepřekreslí a psaní se neztratí (obsluha drží platný objekt), otevřené okno se
// nepřekreslí, telefon. Spuštění jako e2e_undo.js; snímky v $S/oshots-soubeh.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-soubeh');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

async function watch(page, label) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  page.on('pageerror', err => problems.push(`${label} pageerror: ${err.message}`));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`)));
}
const saved = page => page.waitForFunction(() => S && !store.dirty && !store.saving && !store.conflict && document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 20000 });
const keys = page => page.evaluate(() => Object.keys(S.employees).filter(k => !S.employees[k].lead).sort().slice(0, 3));
const note = (page, k) => page.evaluate(x => S.employees[x].note, k);

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
  // A kontroluje novou verzi každé 1,5 s, B skoro vůbec (ať jeho uložení narazí na novější verzi)
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctxA.addInitScript(() => { window.ODM_SYNC_EVERY = 1500; });
  const A = await ctxA.newPage();
  await watch(A, 'A');
  await A.goto(BASE);
  await A.waitForSelector('#setupForm');
  await A.fill('[name="token"]', fs.readFileSync(process.env.TOKEN_FILE || path.join(S, 'odme2e', 'setup-token.txt'), 'utf8').trim());
  await A.fill('[name="label"]', 'Mistr ranní');
  await A.click('#setupForm button[type="submit"]');
  await A.waitForSelector('.odm-card');
  const key = (await A.textContent('.odm-card .card-key')).trim();
  await A.check('#saved');
  await A.click('#finish');
  await A.waitForSelector('#skip');
  await A.click('#skip');
  await A.waitForSelector('#view-prehled.on');
  await saved(A);

  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctxB.addInitScript(() => { window.ODM_SYNC_EVERY = 600000; });
  const B = await ctxB.newPage();
  await watch(B, 'B');
  await B.goto(BASE);
  await B.waitForSelector('#manual');
  await B.click('#manual');
  await B.fill('[name="key"]', key);
  await B.click('#keyForm button[type="submit"]');
  await B.waitForSelector('#skip');
  await B.click('#skip');
  await B.waitForSelector('#view-prehled.on');
  const [k1, k2, k3] = await keys(A);
  check(JSON.stringify(await keys(B)) === JSON.stringify([k1, k2, k3]), 'obě okna mají stejná data');

  // ---------- 1. různá místa: sloučí se samo ----------
  await A.evaluate(k => { S.employees[k].note = 'poznámka od A'; save(); }, k1);
  await saved(A);
  const revA = await A.evaluate(() => store.rev);
  await B.evaluate(k => { S.employees[k].note = 'poznámka od B'; save(); }, k2);
  await saved(B);
  const b1 = await B.evaluate(([x, y]) => ({ x: S.employees[x].note, y: S.employees[y].note, rev: store.rev, dlg: !!document.querySelector('#dlg[open]') }), [k1, k2]);
  check(b1.x === 'poznámka od A' && b1.y === 'poznámka od B' && b1.rev > revA && !b1.dlg, `B sloučil bez okna: ${JSON.stringify(b1)}`);
  check(/Sloučeno se změnami, které mezitím uložil Mistr ranní/.test(await B.textContent('body')), 'B: hláška o sloučení s tím, kdo uložil');
  // A si novou verzi načte sám
  await A.waitForFunction(k => S.employees[k].note === 'poznámka od B', k2, { timeout: 10000 });
  check(await note(A, k1) === 'poznámka od A', 'A: vlastní změna zůstala');
  // historie: změna od B jen jednou, změna od A se neopakuje jako změna od B
  const logs = await A.evaluate(([x, y]) => S.log.filter(e => e.m === 'note:' + x || e.m === 'note:' + y).map(e => [e.by, e.key]), [k1, k2]);
  check(logs.length === 2 && logs.some(e => e[0] === 'Mistr ranní' && e[1] === k1) && logs.filter(e => e[1] === k2).length === 1, `historie bez duplicit (každá změna jednou): ${JSON.stringify(logs)}`);
  await A.screenshot({ path: path.join(shots, '01-a-nacteno.png') });

  // ---------- 2. obě okna přidají sankci zároveň: zůstanou obě ----------
  const san = (page, k, who) => page.evaluate(([x, w]) => {
    S.sanctions.push({ id: 's' + Math.random().toString(36).slice(2, 9), key: x, period: S.current, name: 'Pozdní příchod', pct: 10, note: w, at: Date.now() });
    save();
  }, [k, who]);
  const n0 = await A.evaluate(() => S.sanctions.length);
  await Promise.all([san(A, k1, 'sankce A'), san(B, k3, 'sankce B')]);
  await Promise.all([saved(A), saved(B)]);
  await A.waitForFunction(n => S.sanctions.length === n + 2, n0, { timeout: 10000 }).catch(() => {});
  await B.evaluate(() => syncCheck(true));
  await B.waitForFunction(n => S.sanctions.length === n + 2, n0, { timeout: 10000 }).catch(() => {});
  const sa = await A.evaluate(() => S.sanctions.map(x => x.note).filter(t => /sankce/.test(t)).sort());
  const sb = await B.evaluate(() => S.sanctions.map(x => x.note).filter(t => /sankce/.test(t)).sort());
  check(JSON.stringify(sa) === '["sankce A","sankce B"]' && JSON.stringify(sb) === '["sankce A","sankce B"]', `obě sankce v obou oknech: ${JSON.stringify([sa, sb])}`);

  // ---------- 3. stejný údaj: okno střetu ----------
  await saved(B);
  await A.evaluate(k => { S.employees[k].note = 'A2'; save(); }, k1);
  await saved(A);
  await B.evaluate(k => { S.employees[k].note = 'B2'; save(); }, k1);
  await B.waitForSelector('#dlg[open] .merge-tab', { timeout: 15000 });
  const row = (await B.textContent('#dlg .merge-tab tbody')).replace(/\s+/g, ' ');
  check(/Lidé › .+ › poznámka/.test(row) && /B2/.test(row) && /A2/.test(row), `řádek střetu: ${row}`);
  check(await B.$eval('#dlg .merge-tab input[value="mine"]', x => x.checked), 'výchozí je moje hodnota');
  await B.screenshot({ path: path.join(shots, '02-stret.png') });
  await B.click('#dlg [data-mpick="theirs"]');
  await B.click('#dlgOk');
  await saved(B);
  check(await note(B, k1) === 'A2', 'zvolená jejich hodnota');
  // znovu, tentokrát moje
  await A.evaluate(k => { S.employees[k].note = 'A3'; save(); }, k1);
  await saved(A);
  await B.evaluate(k => { S.employees[k].note = 'B3'; save(); }, k1);
  await B.waitForSelector('#dlg[open] .merge-tab', { timeout: 15000 });
  await B.click('#dlgOk');
  await saved(B);
  await A.waitForFunction(k => S.employees[k].note === 'B3', k1, { timeout: 10000 }).catch(() => {});
  check(await note(B, k1) === 'B3' && await note(A, k1) === 'B3', `moje hodnota platí v obou oknech: ${await note(A, k1)}`);

  // ---------- 4. rozepsané pole se nepřekreslí, psaní se neztratí ----------
  await A.click('#nav [data-view="lide"]');
  await A.click(`#lList .list-item[data-key="${k2}"]`);
  await A.waitForFunction(k => ui.selPerson === k && document.querySelector('#pNote'), k2);
  await A.click('#pNote');
  await A.fill('#pNote', '');
  await A.keyboard.type('rozepsáno');
  await A.evaluate(() => { window._noteEl = document.querySelector('#pNote'); });
  await saved(A);
  // B mezitím změní jiného člověka
  await B.evaluate(k => { S.employees[k].note = 'jiný od B'; save(); }, k3);
  await saved(B);
  await A.waitForFunction(k => S.employees[k].note === 'jiný od B', k3, { timeout: 10000 });
  await A.keyboard.type(' dál');
  const ed = await A.evaluate(() => ({ same: document.querySelector('#pNote') === window._noteEl, focus: document.activeElement === window._noteEl, val: window._noteEl.value }));
  check(ed.same && ed.focus && ed.val === 'rozepsáno dál', `rozepsané pole zůstalo: ${JSON.stringify(ed)}`);
  await saved(A);
  const typed = await A.evaluate(() => Object.values(S.employees).some(e => e.note === 'rozepsáno dál'));
  check(typed, 'psaní po načtení se uložilo do platných dat');
  await A.click('#nav [data-view="prehled"]');   // pole ztratí fokus, překreslí se
  await B.evaluate(() => syncCheck(true));
  await B.waitForFunction(() => Object.values(S.employees).some(e => e.note === 'rozepsáno dál'), null, { timeout: 10000 }).catch(() => {});
  check(await B.evaluate(() => Object.values(S.employees).some(e => e.note === 'rozepsáno dál')), 'B má i rozepsanou poznámku od A');

  // ---------- 5. otevřené okno počká ----------
  await A.evaluate(() => { confirmBox('Test', 'Okno otevřené'); });
  await B.evaluate(k => { S.employees[k].note = 'při okně'; save(); }, k3);
  await saved(B);
  await A.waitForTimeout(3500);
  check(await A.evaluate(k => S.employees[k].note, k3) !== 'při okně' && await A.$('#dlg[open]') !== null, 'otevřené okno: načtení počká');
  await A.click('#dlgCancel');
  await A.waitForFunction(k => S.employees[k].note === 'při okně', k3, { timeout: 10000 }).catch(() => {});
  check(await note(A, k3) === 'při okně', 'po zavření okna se novější verze načte');

  // ---------- telefon: okno střetu ----------
  await B.setViewportSize({ width: 390, height: 844 });
  await A.evaluate(k => { S.employees[k].note = 'tel A'; save(); }, k2);
  await saved(A);
  await B.evaluate(k => { S.employees[k].note = 'tel B'; save(); }, k2);
  await B.waitForSelector('#dlg[open] .merge-tab', { timeout: 15000 });
  const over = await B.evaluate(() => { const d = document.querySelector('#dlg'); return d.scrollWidth - d.clientWidth; });
  check(over <= 1, `okno střetu na telefonu bez přetečení: ${over}`);
  await B.screenshot({ path: path.join(shots, '03-telefon.png') });
  await B.click('#dlgOk');
  await saved(B);

  await browser.close();
  if (problems.length) {
    console.log('PROBLÉMY:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
  console.log('souběžná práce ok');
})().catch(err => { console.error(err); process.exit(1); });
