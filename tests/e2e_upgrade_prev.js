// Test aktualizace z předchozí verze na aktuální bez ztráty dat na Apachi (od 2.37 v repu,
// při každé další verzi stačí upravit ADDED, SAME_DATA, krok 5 a archiv; teď 2.73 → 2.74):
//   1. v předchozí verzi vytvoří data jejími vlastními funkcemi (skupiny s dovednostmi, lidé s ID
//      a historií, Kontroly s plánem, KPI s kusy a hranicí zaškolení, rozpracovaný seznam Shortage
//      s poznámkami, záznamem, stavem, poddílem a čekajícím poddílem s jinou operací) a uloží je;
//   2. nechá otevřenou starou stránku a spustí instalaci nové verze (UPGRADE_CMD);
//   3. stará stránka už nesmí nic uložit (426, výzva k obnovení); s SAME_DATA (verze dat beze změny)
//      se krok vynechá, stará stránka smí dál ukládat;
//   4. nová verze načte stejná data položku po položce, přibude jen to, co je v ADDED;
//   5. v nové verzi vylosuje Rychlou kontrolu (2.39), uloží ji do dnešních kontrol, založí úkol,
//      v Shortage (2.70) vybere sloupec poznámek od plánování a dopíše dlouhou poznámku a (2.71) zadá
//      množství zakázky a nahraje záznam „Odesláno na WPA“, (2.72) u položky s neshodou objednávky
//      vybere alternativní objednávku z plánu, (2.73) zabalí předchozí den a (2.74) nastaví hranici
//      zkušených pro normy; po novém přihlášení je vše uložené a ostatní data stejná.
//   Shortage se kontroluje zvlášť: nic původního nesmí chybět ani se změnit. Výkony nahrané ve staré
//   verzi data pro normy nemají, záložka Normy je ohlásí (2.74).
// Spuštění v kontejneru (lokální Apache, nikdy ne na ostrém serveru):
//   git archive b190c78 | tar -x -C $S/v273 && sudo bash $S/v273/deploy/install.sh
//   NO_PROXY=127.0.0.1 PW=… S=$S UPGRADE_CMD='sudo bash deploy/install.sh' node tests/e2e_upgrade_prev.js
const { chromium } = require(process.env.PW);
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1/odmeny_v2/';
const PREV = new RegExp(process.env.PREV_VERSION || '^2\\.73$');
const NEXT = new RegExp(process.env.EXPECT_VERSION || '^2\\.74$');
const shots = path.join(S, 'ushots-prev');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };
/* Co nová verze k uloženým datům přidá (cesta → očekávaná hodnota ve výchozím stavu). Hodnota null = část,
   která se při převodu mění schválně a kontroluje se zvlášť (Shortage 2.70); úkoly a Vrátit zpět mění krok 5. */
const ADDED = { 'shortage.lists': null, 'shortage.cols': null, 'workAudit.normPct': 'null', tasks: null, undo: null };
/* Verze dat se mění (2.74: normy z vykázaných časů, hranice zkušených, verze dat 52): stará stránka dostane 426. */
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
    // Shortage tak, jak ho ukládá 2.69.1: poznámky, záznam, stav, poddíl a čekající poddíl s jinou operací (cands)
    const L = c => 'http://is.example/commission.production.detail/default/1?activeBarcode=' + c + '&componentProductionId=2';
    const at = Date.UTC(2026, 10, 9, 7, 30), by = 'Vedoucí dílny';
    st.shortage.lists = [{ id: 'shupg01', at, by, file: 'urgenty.xlsx', sheet: '', plan: { file: 'plan.xlsx', at, by }, gone: [], items: [
      { id: 'siupg01', order: 'OBJ-2026-1', name: 'Hřídel velká', ean: '8590000000011', index: 'A', qty: '4', top: true, op: 'Broušení – hala 2', link: L('1.1.1'), code: '1.1.1',
        note: 'Volat dodavatele', rec: { ts: at, when: '9. 11. 2026 08:00', qty: '4', state: 'Hotovo', at, by }, st: 'run', stAt: at, stBy: by,
        subs: [{ id: 'spupg01', ean: '8590000000901', link: L('9.0.1'), code: '9.0.1', op: 'Leštění – hala 2', note: 'Poddíl s poznámkou', rec: null }],
        cands: [{ ean: '8590000000902', link: L('9.0.2'), code: '9.0.2', op: 'Lakování' }] },
      { id: 'siupg02', order: 'OBJ-2026-2', name: 'Kryt motoru', ean: '8590000000028', index: 'B', qty: '2', top: false, top2: true, op: 'Frézování Hala 2', link: '', code: '', note: '', rec: null, pdfHide: true, planMismatch: true },
    ] }, { id: 'shupg00', at: Date.UTC(2026, 10, 8, 7, 30), by, file: 'urgenty-vcera.xlsx', sheet: '', plan: null, gone: [], items: [
      { id: 'siupg11', order: 'OBJ-2026-1', name: 'Hřídel velká', ean: '8590000000011', index: 'A', qty: '6', top: true, op: 'Broušení – hala 2', link: L('1.1.1'), code: '1.1.1', note: 'Včerejší poznámka', rec: null },
      { id: 'siupg12', order: 'OBJ-2026-7', name: 'Víko skříně', ean: '8590000000073', index: 'C', qty: '1', top: false, op: 'Elox', link: '', code: '', note: '', rec: null },
    ] }];   // 2.73: předchozí den, nová verze dopočítá dny na shortage a odbourané
    st.shortage.depts = [{ id: 'sdupg01', name: 'Brus', ops: [{ key: 'brouseni hala 2', label: 'Broušení – hala 2' }] }];
    st.shortage.colors = { FF0000: 'top' };
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
  const fresh = Object.keys(before.added).filter(p => ADDED[p] !== null);
  check(fresh.length === 0, `předchozí verze už má nová data: ${fresh}`);
  const oldSh = before.added['shortage.lists'] || [];
  check(oldSh.length === 2 && oldSh[0].id === 'shupg01' && oldSh[1].items.length === 2 && oldSh[0].items[0].days === 2 && oldSh[0].items.length === 2 && oldSh[0].items[0].subs.length === 2 && oldSh[0].items[0].note === 'Volat dodavatele' && Array.isArray(oldSh[0].items[1].planAlts) && oldSh[0].items[1].planMismatch === true, `předchozí verze neuložila seznam Shortage: ${JSON.stringify(oldSh).slice(0, 200)}`);
  check(Object.keys(before.st.audit.plans).length === 1 && Object.keys(before.st.workAudit.pcs).length === 2 && before.st.workAudit.trainPct === 60, 'předchozí verze neuložila plán kontrol nebo KPI');

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
    if (expr === null) continue;
    const want = await page.evaluate(`(() => { const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v; return JSON.stringify(canon(${expr})); })()`);
    check(JSON.stringify(after.added[p]) === want, `${p}: ${JSON.stringify(after.added[p])} ≠ ${want}`);
  }
  // Shortage: seznamy beze změny (dny na shortage a odbourané položky spočítala už 2.73)
  {
    const was = before.added['shortage.lists'], now = after.added['shortage.lists'] || [];
    check(JSON.stringify(now) === JSON.stringify(was) && now.every(l => l.packed === null) && now[0].items[1].planMismatch === true, `seznamy Shortage po aktualizaci: ${JSON.stringify(now).slice(0, 300)}`);
    const days = now.map(l => l.items.map(i => [i.ean, i.days, i.since]));
    check(JSON.stringify(days) === JSON.stringify([[['8590000000011', 2, '2026-11-08'], ['8590000000028', 1, '2026-11-09']], [['8590000000011', 1, '2026-11-08'], ['8590000000073', 1, '2026-11-08']]]), `dny na shortage po aktualizaci: ${JSON.stringify(days)}`);
    check(JSON.stringify(now[0].out.map(o => [o.ean, o.days, o.day, o.manual])) === JSON.stringify([['8590000000073', 1, '2026-11-09', false]]) && JSON.stringify(now[1].out) === '[]', `odbouráno po aktualizaci: ${JSON.stringify(now.map(l => l.out))}`);
    check(JSON.stringify(after.added['shortage.cols']) === JSON.stringify(before.added['shortage.cols']), `sloupce Shortage po aktualizaci: ${JSON.stringify(after.added['shortage.cols'])}`);
    check(JSON.stringify(after.added.tasks) === JSON.stringify(before.added.tasks) && JSON.stringify(after.added.undo) === JSON.stringify(before.added.undo), 'úkoly a Vrátit zpět po aktualizaci');
  }
  await page.evaluate(() => showView('shortage'));
  await page.waitForSelector('#view-shortage.on #shView table.sh-tab');
  check(await page.locator('#shView tr.sh-sub').count() === 2 && await page.inputValue('#shView [data-shnote="siupg01"]') === 'Volat dodavatele' && !(await page.locator('#shView [data-shsent]').count()), 'Shortage v nové verzi: oba poddíly, poznámka, bez množství zakázky žádný stav');
  check(/2\. den na shortage/.test(await page.textContent('#shView tr[data-shid="siupg01"]')) && /Víko skříně/.test(await page.textContent('#shOut')), 'Shortage v nové verzi: 2. den a odbouraná položka z předchozího dne');
  await page.screenshot({ path: path.join(shots, '02-nova-shortage.png'), fullPage: true });
  // 2.74: výkony za říjen jsou ze staré verze, normy z nich nejsou a záložka Normy to ohlásí
  await page.evaluate(() => { showView('audit'); ui.wa.tab = 'normy'; renderWorkAudit(); });
  await page.waitForSelector('#waView .nm-lede');
  check(/Měsíc říjen 2026 je nahraný před verzí 2\.74/.test((await page.textContent('#waView .nm-old')).replace(/\s+/g, ' ')) && /Zatím žádné normy/.test(await page.textContent('#waView')), `Normy nad daty ze starší verze: ${(await page.textContent('#waView')).replace(/\s+/g, ' ').slice(0, 300)}`);
  await page.screenshot({ path: path.join(shots, '02-nova-normy.png'), fullPage: true });
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
  // Shortage (2.70): sloupec poznámek od plánování (tabulka A–S) a poznámka delší než dřívějších 300 znaků; úkol
  const LONG = 'Poznámka od plánování: ' + 'termín se posouvá, díl čeká na kontrolu rozměrů. '.repeat(30);
  await page.evaluate(long => { S.shortage.cols = { ...S.shortage.cols, list: { ...SH_URGENT_COLS, noteChosen: true } }; S.shortage.lists[0].items[1].note = long.trim(); S.employees['adámek|aleš'].end = '2027-02-28'; tkAdd(S, { title: 'Kontrola po aktualizaci', due: todayIso(), owner: 'Mistr' }, tkMeta()); save(); }, LONG);
  await saved(page);
  // 2.71: množství zakázky a starší záznam „Odesláno na WPA“ (poslední záznam Hotovo zůstane) = zbytek u nás
  await page.evaluate(() => { const l = S.shortage.lists[0]; l.items[0].oqty = 10; const b = shRecBuild([['1.1.1', '08.11.2026 10:00', '4', 'Odesláno na WPA'].map(text => ({ text, link: '', fill: '' }))], SH_COLS.move); shApplyRecs(l, b.recs, { at: Date.now(), by: 'test' }, b.sent); save(); renderShortage(); });
  await page.waitForSelector('#shView [data-shsent="here"]', { state: 'attached' });
  await saved(page);
  // 2.72: neshoda objednávky z dřívějška, nový plán nabídne objednávku téhož dílu, výběr v nabídce u položky
  await page.evaluate(() => { const l = S.shortage.lists[0], p = shPlanBlank('plan-alt.xlsx'); shPlanDirectRow(p, '8590000000028', 'http://is.example/commission.production.detail/default/1?activeBarcode=2.2.2&x=1', 'Leštění – hala 2', 'C', 'OBJ-2026-9', '8'); shApplyPlan({ items: [l.items[1]], records: [] }, p); save(); renderShortage(); });   // jen ta položka (zbytek beze změny)
  await page.waitForSelector('#shView select[data-shalt="siupg02"]', { state: 'attached' });
  await saved(page);
  await page.evaluate(() => { const s = document.querySelector('#shView select[data-shalt="siupg02"]'); s.value = '0'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForFunction(() => S.shortage.lists[0].items[1].order === 'OBJ-2026-9');
  await saved(page);
  // 2.73: předchozí den zabalit (otevřít ho v Seznamech a Zabalit den)
  await page.evaluate(() => showView('shortage'));
  await page.waitForSelector('#view-shortage.on #shView [data-shopen="shupg00"]');
  await page.click('#shView [data-shopen="shupg00"]');
  await page.click('#shView [data-shpack="shupg00"]');
  await page.waitForSelector('#dlg[open]');
  await page.click('#dlgOk');
  await page.waitForFunction(() => S.shortage.lists[1].packed && document.querySelector('#shView .sh-card h2').textContent.includes(shWhen(S.shortage.lists[0])));
  await saved(page);
  // 2.74: hranice zkušených pro normy v Nastavení KPI
  await page.evaluate(() => { showView('audit'); ui.wa.tab = 'nastaveni'; renderWorkAudit(); });
  await page.waitForSelector('#waNormPct');
  await page.fill('#waNormPct', '50');
  await page.dispatchEvent('#waNormPct', 'change');
  await page.waitForFunction(() => S.workAudit.normPct === 50);
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
  const fsh = final.added['shortage.lists'][0];
  check(final.added['shortage.cols'].list && final.added['shortage.cols'].list.note === 'S' && final.added['shortage.cols'].list.noteChosen === true && fsh.items[1].note === LONG.trim() && fsh.items[1].note.length > 1000, `Shortage 2.70 po novém přihlášení: ${JSON.stringify(final.added['shortage.cols'])} ${fsh.items[1].note.length}`);
  const fit0 = fsh.items[0], ait0 = after.added['shortage.lists'][0].items[0];
  check(fit0.oqty === 10 && JSON.stringify({ ...fit0, oqty: undefined }) === JSON.stringify({ ...ait0, oqty: undefined }) && JSON.stringify(fsh.sent) === JSON.stringify({ '1.1.1': [[fsh.sent['1.1.1'][0][0], 4]] }), `Shortage 2.71 po novém přihlášení (množství zakázky, odesláno na WPA, poslední záznam beze změny): ${JSON.stringify([fit0.oqty, fsh.sent, fit0.rec])}`);
  check(await again.evaluate(() => { const l = S.shortage.lists[0]; const x = shSentOf(l, l.items[0]); return x && x.st === 'here' && x.left === 6 && x.sent === 4; }), 'po novém přihlášení: zbytek 6 ks u nás');
  const f1 = fsh.items[1];
  check(f1.order === 'OBJ-2026-9' && f1.index === 'C' && f1.code === '2.2.2' && f1.oqty === 8 && f1.op === 'Leštění – hala 2' && !f1.planMismatch && f1.planAlts.length === 1 && f1.was && f1.was.order === 'OBJ-2026-2' && f1.was.index === 'B' && f1.note === LONG.trim(),
    `Shortage 2.72 po novém přihlášení (vybraná objednávka z plánu, objednávka z urgentů): ${JSON.stringify({ ...f1, note: f1.note.length })}`);
  const fsh0 = final.added['shortage.lists'][1];
  check(fsh0.packed && fsh0.packed.by === 'Vedoucí dílny' && !fsh.packed && fsh.items[0].days === 2 && fsh.items[1].days === 1 && fsh.out.length === 1, `Shortage 2.73 po novém přihlášení (zabalený předchozí den, dny): ${JSON.stringify([fsh0.packed, fsh.items.map(i => i.days), fsh.out.length])}`);
  check(final.added['workAudit.normPct'] === 50, `hranice zkušených pro normy (2.74) po novém přihlášení: ${final.added['workAudit.normPct']}`);
  check(final.st.employees['adámek|aleš'] && final.st.employees['adámek|aleš'].end === '2027-02-28', 'konec trestu (2.43) po novém přihlášení');
  check(final.added.tasks && final.added.tasks.list.length === 1 && final.added.tasks.list[0].title === 'Kontrola po aktualizaci', `úkol (2.46) po novém přihlášení: ${JSON.stringify(final.added.tasks)}`);
  // Vrátit zpět (2.45): změna z kroku 5 má uložené hodnoty před změnou a odkaz z historie
  check(Array.isArray(final.added.undo) && final.added.undo.length >= 1 && final.st.log.some(x => x.u && final.added.undo.some(u => x.u.includes(u.id))), `vrátit zpět po novém přihlášení: ${JSON.stringify((final.added.undo || []).map(u => u.ch.length))}`);
  if (final.st.employees['adámek|aleš']) delete final.st.employees['adámek|aleš'].end;
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
