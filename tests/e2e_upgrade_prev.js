// Test aktualizace z předchozí verze na aktuální bez ztráty dat na Apachi (od 2.37 v repu,
// při každé další verzi stačí upravit ADDED, SAME_DATA, krok 5 a archiv; teď 2.41 → 2.42):
//   1. v předchozí verzi vytvoří data jejími vlastními funkcemi (skupiny s dovednostmi, lidé s ID
//      a historií, Kontroly s plánem, Audit s kusy a hranicí zaškolení) a uloží je;
//   2. nechá otevřenou starou stránku a spustí instalaci nové verze (UPGRADE_CMD);
//   3. stará stránka už nesmí nic uložit (426, výzva k obnovení); s SAME_DATA (verze dat beze změny)
//      se krok vynechá, stará stránka smí dál ukládat;
//   4. nová verze načte stejná data položku po položce, přibude jen to, co je v ADDED;
//   5. v nové verzi vylosuje Rychlou kontrolu (2.39), uloží ji do dnešních kontrol a založí skupinu
//      vybere skupinu Matice u skupiny Auditu a sloupec normy (2.42); po novém přihlášení je vše
//      uložené a ostatní data stejná.
// Spuštění v kontejneru (lokální Apache, nikdy ne na ostrém serveru):
//   git archive 48ad143 | tar -x -C $S/v241 && sudo bash $S/v241/deploy/install.sh
//   NO_PROXY=127.0.0.1 PW=… S=$S UPGRADE_CMD='sudo bash deploy/install.sh' node tests/e2e_upgrade_prev.js
const { chromium } = require(process.env.PW);
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1/odmeny_v2/';
const PREV = new RegExp(process.env.PREV_VERSION || '^2\\.41$');
const NEXT = new RegExp(process.env.EXPECT_VERSION || '^2\\.42$');
const shots = path.join(S, 'ushots-prev');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };
/* Co nová verze k uloženým datům přidá (cesta → očekávaná hodnota ve výchozím stavu). */
const ADDED = { 'workAudit.dv.cols.work.norm': '""', ...Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(i => [`workAudit.groups.${i}.mg`, '[]'])) };
/* Verze dat se mění (2.42: skupiny Matice u skupin Auditu, sloupec normy): stará stránka dostane 426. */
const SAME_DATA = false;

async function watch(page, label, allow426 = false) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  page.on('pageerror', err => problems.push(`${label} pageerror: ${err.message}`));
  page.on('response', r => {
    if (r.status() < 400) return;
    if (r.status() === 403 && /action=unlock/.test(r.url())) return;
    if (allow426 && r.status() === 426) return;
    problems.push(`${label} HTTP ${r.status()} ${r.url()}`);
  });
}
const saved = page => page.waitForFunction(() => !store.dirty && !store.saving && document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 15000 });
async function login(page, key) {
  await page.goto(BASE);
  await page.waitForSelector('#manual');
  await page.click('#manual');
  await page.fill('[name="key"]', key);
  await page.click('#keyForm button[type="submit"]');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');
  await page.waitForTimeout(500);
}
/* Sdílený stav s klíči v pevném pořadí; cesty z ADDED se vyjmou a vrátí zvlášť. */
const STATE = added => `(() => {
  const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
  const st = JSON.parse(JSON.stringify(sharedState(S)));
  delete st.v;
  const out = {};
  ${JSON.stringify(Object.keys(added))}.forEach(p => {
    const keys = p.split('.'), last = keys.pop();
    const box = keys.reduce((o, k) => (o ? o[k] : undefined), st);
    if (box && last in box) { out[p] = canon(box[last]); delete box[last]; }
  });
  return JSON.stringify({ st: canon(st), added: out });
})()`;

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const old = await ctx.newPage();
  await watch(old, 'stará', true);

  // ---- 1. data v předchozí verzi ----
  await old.goto(BASE);
  await old.waitForSelector('#setupForm');
  await old.fill('[name="token"]', fs.readFileSync(process.env.TOKEN_FILE || '/var/lib/odmeny_v2/setup-token.txt', 'utf8').trim());
  await old.fill('[name="label"]', 'Vedoucí dílny');
  await old.click('#setupForm button[type="submit"]');
  await old.waitForSelector('.odm-card');
  const key = (await old.textContent('.odm-card .card-key')).trim();
  await old.check('#saved');
  await old.click('#finish');
  await old.waitForSelector('#skip');
  await old.click('#skip');
  await old.waitForSelector('#view-prehled.on');
  const oldVer = await old.evaluate(() => ui.me.version);
  check(PREV.test(oldVer), `výchozí verze není předchozí: ${oldVer}`);
  await old.evaluate(() => {
    const st = blank();
    const grp = (id, name, dept, skills) => { const p = mkPos(id, name, []); p.dept = dept; p.skillset = skills.map((n, i) => ({ id: `${id}s${i}`, name: n, desc: '', scale: null })); p.maxTab = 8; p.tiers = []; return p; };
    st.positions = [grp('g_brus', 'Brus', 'Brus', ['Rovinné broušení', 'Měření']), grp('g_cnc', 'CNC', 'Obrobna', ['Seřízení'])];
    const people = [['Adámek', 'Aleš', 'g_brus', '101'], ['Bednář', 'Boris', 'g_brus', '102'], ['Fiala', 'Filip', 'g_cnc', '201'], ['Gregor', 'Gustav', 'g_cnc', '']];
    people.forEach(([last, first, g, wid], i) => {
      const k = `${last}|${first}`.toLowerCase();
      st.employees[k] = { key: k, last, first, positionId: g, shift: 'R', note: i ? '' : 'Poznámka k člověku', wid, rate: { [`${g}s0`]: 1 + i % 4 },
        hist: [{ at: Date.UTC(2026, 6, 1), pos: g, lvl: null, pct: 25 }] };
    });
    st.audit.tasks.Brus = [{ id: 't1', text: 'Kontrola prvního kusu' }];
    st.audit.tasks.Obrobna = [{ id: 't1', text: 'Úklid pracoviště' }];
    S = sanitizeState(st);
    const meta = { at: Date.now(), by: 'Vedoucí dílny' };
    generatePlan(shiftWeek(isoWeek(todayIso()).id, 1), meta);
    waApplyWork(S.workAudit, { byDay: { '2026-10-20': { Broušení: 40, 'Frézování CNC': 12 }, '2026-10-21': { Broušení: 35 } }, ops: { Broušení: 75, 'Frézování CNC': 12 }, rows: 3, skipped: 0, from: '2026-10-20', to: '2026-10-21' }, { name: 'vykaz.xlsx', by: 'Vedoucí dílny', at: Date.now() });
    S.workAudit.trainPct = 60;
    S.workAudit.target = 9;
    // docházka a výkony (od 2.37), když je předchozí verze má
    if (S.workAudit.dv) { S.workAudit.dv.pres['2026-10-26'] = { 101: [360, 870], 201: [365, null] }; S.workAudit.dv.perf['2026-10'] = { 101: { p: { Hřídel: [20, 50, 200, 2] }, o: { Broušení: [20, 200, 2] } } }; S.audit.settings.mode = 'day'; }
    save();
    renderAll();
  });
  await saved(old);
  await old.waitForTimeout(1200);
  // stav, jak ho předchozí verze uložila a znovu načte
  const ctx0 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const reread = await ctx0.newPage();
  await watch(reread, 'předchozí znovu');
  await login(reread, key);
  const before = JSON.parse(await reread.evaluate(STATE(ADDED)));
  const beforeRev = await reread.evaluate(() => store.rev);
  const beforeLog = await reread.evaluate(() => S.log.length);
  await ctx0.close();
  check(Object.keys(before.added).length === 0, `předchozí verze už má nová data: ${Object.keys(before.added)}`);
  check(Object.keys(before.st.audit.plans).length === 1 && Object.keys(before.st.workAudit.pcs).length === 2 && before.st.workAudit.trainPct === 60, 'předchozí verze neuložila plán kontrol nebo Audit');

  // ---- 2. aktualizace, stará stránka zůstává otevřená ----
  execSync(process.env.UPGRADE_CMD || 'sudo bash deploy/install.sh', { stdio: 'inherit' });

  // ---- 3. stará stránka nesmí uložit ----
  if (!SAME_DATA) {
    await old.evaluate(() => { S.workAudit.target = 11; save(); });
    await old.waitForSelector('#dlg[open]', { timeout: 15000 });
    const oldDialog = await old.textContent('#dlg');
    check(/Aplikace byla aktualizována/.test(oldDialog), `stará stránka: ${oldDialog.slice(0, 120)}`);
    await old.screenshot({ path: path.join(shots, '01-stara-po-aktualizaci.png') });
  }

  // ---- 4. nová verze: stejná data ----
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx2.newPage();
  await watch(page, 'nová');
  await login(page, key);
  const newVer = await page.evaluate(() => ui.me.version);
  check(NEXT.test(newVer), `po aktualizaci neběží nová verze: ${newVer}`);
  const after = JSON.parse(await page.evaluate(STATE(ADDED)));
  check(JSON.stringify(after.st) === JSON.stringify(before.st), 'data se po aktualizaci změnila');
  if (JSON.stringify(after.st) !== JSON.stringify(before.st)) {
    fs.writeFileSync(path.join(S, 'uprev-before.json'), JSON.stringify(before.st, null, 1));
    fs.writeFileSync(path.join(S, 'uprev-after.json'), JSON.stringify(after.st, null, 1));
  }
  for (const [p, expr] of Object.entries(ADDED)) {
    const want = await page.evaluate(`(() => { const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v; return JSON.stringify(canon(${expr})); })()`);
    check(JSON.stringify(after.added[p]) === want, `${p}: ${JSON.stringify(after.added[p])} ≠ ${want}`);
  }
  check(await page.evaluate(() => store.rev) === beforeRev, 'stará stránka po aktualizaci něco uložila');
  check(await page.evaluate(() => S.log.length) === beforeLog, 'historie změn se po aktualizaci liší');

  // ---- 5. nové funkce nad převzatými daty a jejich uložení ----
  await page.evaluate(() => showView('rychla'));
  await page.waitForSelector('#view-rychla.on .qk-go');
  const pool = await page.evaluate(() => quickPool(qkOpt()).list.map(x => x.key));
  check(pool.length >= 1, `rychlá kontrola nad převzatými daty nemá koho losovat: ${pool}`);
  await page.click('[data-qkset="3"]');
  await page.click('.qk-go');
  await page.waitForSelector('#qkResult .qk-row');
  const drawn = await page.evaluate(() => [...document.querySelectorAll('#qkResult .qk-row')].map(r => r.dataset.qkkey));
  check(drawn.length === Math.min(3, pool.length) && drawn.every(k => pool.includes(k)), `vylosováno: ${drawn}`);
  const work = await page.evaluate(() => audDays(isoWeek(todayIso()).id).includes(todayIso()));
  if (work) { await page.click('[data-qksave]'); await saved(page); }
  // Audit (2.42): skupina Matice u skupiny Auditu a sloupec normy
  await page.evaluate(() => { S.workAudit.groups[0].mg = ['g_brus']; S.workAudit.dv.cols.work.norm = 'K'; save(); });
  await saved(page);
  await page.screenshot({ path: path.join(shots, '02-nova-rychla.png'), fullPage: true });
  const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const again = await ctx3.newPage();
  await watch(again, 'nová znovu');
  await login(again, key);
  const final = JSON.parse(await again.evaluate(STATE(ADDED)));
  const today = await again.evaluate(() => todayIso());
  const week = await again.evaluate(() => isoWeek(todayIso()).id);
  if (work) {
    const its = ((final.st.audit.plans[week] || {}).items || []).filter(i => i.day === today && i.extra);
    check(its.length === drawn.length && its.every(i => drawn.includes(i.key)), `rychlá kontrola po novém přihlášení: ${JSON.stringify(its)}`);
  }
  check(JSON.stringify(final.added['workAudit.groups.0.mg']) === '["g_brus"]' && final.added['workAudit.dv.cols.work.norm'] === 'K', `Audit 2.42 po novém přihlášení: ${JSON.stringify(final.added)}`);
  const keep = JSON.parse(JSON.stringify(before.st));
  // přibyl jen plán tohoto týdne (rychlá kontrola) a záznam v historii; ostatní beze změny
  const logNow = new Set(final.st.log.map(x => JSON.stringify(x)));
  check(keep.log.every(x => logNow.has(JSON.stringify(x))), 'historie změn: chybí původní záznamy');
  delete keep.log;
  delete final.st.log;
  if (work && !keep.audit.plans[week]) delete final.st.audit.plans[week];
  else if (work) { keep.audit.plans[week] = final.st.audit.plans[week]; }
  check(JSON.stringify(final.st) === JSON.stringify(keep), 'původní data se po použití nové verze změnila');
  if (JSON.stringify(final.st) !== JSON.stringify(keep)) {
    fs.writeFileSync(path.join(S, 'uprev-keep.json'), JSON.stringify(keep, null, 1));
    fs.writeFileSync(path.join(S, 'uprev-final.json'), JSON.stringify(final.st, null, 1));
  }
  await ctx3.close();

  await browser.close();
  if (problems.length) { console.log(`PROBLÉMY (${problems.length}):\n${problems.join('\n')}`); process.exit(1); }
  console.log(`aktualizace ${oldVer} → ${newVer} ok`);
})().catch(error => { console.error(error); process.exit(1); });
