// Test aktualizace 2.3 → 2.4 (Matice dovedností, srážka ze mzdy) bez ztráty dat na Apachi:
//   1. ve verzi 2.3 vytvoří data (docházka, evidence práce, pozice s úrovněmi a navýšením platu,
//      vlastní strop, pozice jen s Kafe, zaučení, sankce, úprava, výdej, osobní nastavení,
//      druhá kartička, Top 5 s případem, nutné úkony a plán kontrol) a uloží si stav;
//   2. nechá otevřenou starou stránku a spustí instalaci nové verze (UPGRADE_CMD);
//   3. stará stránka už nesmí nic uložit (426, výzva k obnovení);
//   4. ve 2.4 porovná data položku po položce (původní pole beze změny, přibyly jen skupiny,
//      hodnocení, okno s původním zařazením a procenta), výpočty tabáků, Kafe a navýšení,
//      pak smaže okno s původním zařazením u jednoho člověka, ohodnotí dovednost a přidá
//      srážku ze mzdy; po novém přihlášení zkontroluje, že se nic dalšího nezměnilo.
// Spuštění v kontejneru (lokální Apache, nikdy ne na ostrém serveru):
//   git archive b7a6f7d | tar -x -C $S/v23 && sudo bash $S/v23/deploy/install.sh
//   NO_PROXY=127.0.0.1 PW=… S=$S UPGRADE_CMD='bash deploy/install.sh' node tests/e2e_upgrade24.js
const { chromium } = require(process.env.PW);
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const XLSX = require('../private/vendor/xlsx.full.min.js');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1/odmeny_v2/';
const shots = path.join(S, 'ushots24');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };
const PEOPLE = [['Jiří', 'Šťastný'], ['Eva', 'Nováková'], ['Petr', 'Dvořák'], ['Lucie', 'Černá']];

function weekdays(fn) {
  for (let d = 1; d <= 31; d += 1) { const dow = new Date(2026, 7, d).getDay(); if (dow !== 0 && dow !== 6) fn(d); }
}
function attendanceCsv() {
  const days = Array.from({ length: 31 }, (_, i) => `${i + 1}.8.2026`);
  const head = ['Jméno', 'Příjmení', 'Os. č.', 'Středisko', 'Pozn.', ...days].join(';');
  return [head, ...PEOPLE.map(([first, last], p) => [first, last, 100 + p, 'D1', '', ...days.map((_, i) => {
    const dow = new Date(2026, 7, i + 1).getDay();
    if (dow === 0 || dow === 6) return p === 2 && i === 1 ? '7,5' : '';
    if (p === 1 && i === 12) return 'OČR';
    if (p === 3 && i > 20) return '';
    return '7,5';
  })].join(';'))].join('\r\n');
}
/** Evidence práce: hlavička, strávený čas a norma v minutách. */
function productionXlsx(file) {
  const rows = [['Zakázka', 'Pracovník', 'Datum', 'Kusy', 'Strávený čas (min)', 'Norma (min)']];
  weekdays(d => PEOPLE.forEach(([first, last], p) => rows.push([`Z${d}`, `${first} ${last}`, `${d}.8.2026`, 10 + p, 400 - p * 30, 420 - p * 40])));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Evidence');
  fs.writeFileSync(file, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

async function watch(page, label, allow426 = false) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  page.on('pageerror', err => problems.push(`${label} pageerror: ${err.message}`));
  page.on('response', r => {
    if (r.status() < 400) return;
    if (r.status() === 403 && /action=unlock/.test(r.url())) return;
    if (allow426 && r.status() === 426) return;
    problems.push(`${label} HTTP ${r.status()} ${r.url()}`);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`));
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
/** Sdílený stav s klíči v pevném pořadí (porovnání po položkách). */
const STATE = `(() => {
  const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
  return JSON.stringify(canon(JSON.parse(JSON.stringify(sharedState(S)))));
})()`;
const SUMMARY = `JSON.stringify(allRows().map(r => [r.e.key, r.total, r.narok, r.max, r.kafe, r.pen, r.adj, !!r.issued, r.L.n, r.L.base, r.pos && r.pos.id, r.raise.pct]).sort())`;
/** 2.4 nad daty z 2.3: původní pole vedle nových (skupiny, hodnocení, procenta). */
function compare(beforeJson, afterJson) {
  const a = JSON.parse(beforeJson), b = JSON.parse(afterJson);
  const out = [];
  const same = (x, y, what) => { if (JSON.stringify(x) !== JSON.stringify(y)) out.push(`${what}: ${JSON.stringify(x).slice(0, 160)} → ${JSON.stringify(y).slice(0, 160)}`); };
  // 2.6 přidá do Top 5 jen prázdnou evidenci smazaných čísel případů (eff.nos),
  // 2.19 k případům prázdný seznam komentářů o vývoji
  const effOld = e => {
    if (!e) return e;
    const c = { ...e };
    if ('nos' in c) { same(c.nos, {}, 'eff.nos'); delete c.nos; }
    if (Array.isArray(c.cases)) c.cases = c.cases.map(x => { if (!('comments' in x)) return x; const y = { ...x }; same(y.comments, [], `komentáře ${y.no}`); delete y.comments; return y; });
    return c;
  };
  Object.keys({ ...a, ...b }).filter(k => !['positions', 'employees', 'issued', 'marks', 'capReport', 'v', 'leadSkills', 'normCutDone', 'logbooks', 'workAudit'].includes(k)).forEach(k => same(a[k], k === 'eff' ? effOld(b[k]) : b[k], k));
  // 2.10 přidá prázdný seznam dovedností vedoucích, 2.12 prázdné zpracované srážky za neproduktivitu,
  // 2.16 prázdné Protokoly, 2.17 prázdný Audit
  if ('leadSkills' in b) same(a.leadSkills || [], b.leadSkills, 'leadSkills');
  if ('normCutDone' in b) same(a.normCutDone || {}, b.normCutDone, 'normCutDone');
  if ('logbooks' in b) same(a.logbooks || [], b.logbooks, 'logbooks');
  // 2.17 prázdný Audit (výchozí skupiny, žádné dny ani operace)
  if ('workAudit' in b) {
    if (a.workAudit) same(a.workAudit, b.workAudit, 'workAudit');
    else if (Object.keys(b.workAudit.days).length || b.workAudit.ops.length || b.workAudit.groups.length !== 7) out.push(`workAudit není prázdný: ${JSON.stringify(b.workAudit).slice(0, 160)}`);
  }
  same(a.positions.map(p => p.id), b.positions.map(p => p.id), 'pořadí skupin');
  a.positions.forEach((p, i) => {
    const q = b.positions[i];
    ['id', 'name', 'dept', 'onlyKafe', 'levels', 'penalty', 'bonus'].forEach(f => same(p[f], q[f], `pozice ${p.name}.${f}`));
    const top = Math.max(...p.levels.map(l => l.tabaky));
    if (!(p.max === q.max || (p.max == null && !p.onlyKafe && q.max === top))) out.push(`pozice ${p.name}.max: ${p.max} → ${q.max}`);
    if (!Array.isArray(q.skillset) || q.skillset.length !== 1 || q.maxTab !== (p.onlyKafe ? top : top)) out.push(`skupina ${p.name}: ${JSON.stringify([q.skillset && q.skillset.length, q.maxTab])}`);
  });
  same(Object.keys(a.employees), Object.keys(b.employees), 'lidé');
  Object.entries(a.employees).forEach(([k, e]) => {
    const f = b.employees[k];
    Object.keys(e).filter(x => x !== 'hist').forEach(x => same(e[x], f[x], `${k}.${x}`));
    same(e.hist, f.hist.map(h => { const c = { ...h }; delete c.pct; return c; }), `${k}.hist`);
    if (!f.legacy) out.push(`${k}: chybí okno s původním zařazením`);
  });
  Object.entries(a.issued).forEach(([id, box]) => Object.entries(box).forEach(([k, r]) => {
    const n = { ...b.issued[id][k] }; delete n.pct; same(r, n, `výdej ${id} ${k}`);
  }));
  return out;
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const old = await ctx.newPage();
  await watch(old, 'stará', true);

  // ---- 1. data ve verzi 2.3 ----
  await old.goto(BASE);
  await old.waitForSelector('#setupForm');
  await old.fill('[name="token"]', fs.readFileSync(process.env.TOKEN_FILE || '/var/lib/odmeny_v2/setup-token.txt', 'utf8').trim());
  await old.fill('[name="label"]', 'Vedoucí dílny');
  await old.click('#setupForm button[type="submit"]');
  await old.waitForSelector('.odm-card');
  const keyA = (await old.textContent('.odm-card .card-key')).trim();
  await old.check('#saved');
  await old.click('#finish');
  await old.waitForSelector('#skip');
  await old.click('#skip');
  await old.waitForSelector('#view-prehled.on');
  check(/2\.3/.test(await old.evaluate(() => ui.me.version)), `výchozí verze není 2.3: ${await old.evaluate(() => ui.me.version)}`);
  check(!!(await old.$('#nav [data-view="pozice"]')), 've 2.3 mají být Pozice');
  await old.click('#nav [data-view="dochazka"]');
  fs.writeFileSync(path.join(S, 'u24-dochazka.csv'), attendanceCsv());
  await old.setInputFiles('#file', path.join(S, 'u24-dochazka.csv'));
  await old.waitForSelector('#importMsg .note');
  if (await old.isVisible('#dlg[open]')) await old.click('#dlgOk');
  await old.waitForTimeout(300);
  await old.click('#nav [data-view="vyroba"]');
  productionXlsx(path.join(S, 'u24-vyroba.xlsx'));
  await old.setInputFiles('#pfile', path.join(S, 'u24-vyroba.xlsx'));
  await old.waitForSelector('#dlg[open] #prodColsPreview');
  await old.click('#dlgOk');
  await old.waitForSelector('#prodMsg .note.i');
  // Pozice ve 2.3: CNC s navýšením platu na úrovni 3 a 4, Kontrola s vlastním stropem, Brusič jen Kafe.
  await old.click('#nav [data-view="pozice"]');
  await old.locator('#posList .list-item').first().click();
  for (const [li, raise, norm] of [[2, 10, 95], [3, 15, 100]]) {   // data-li je od 0: úroveň 3 a 4
    const row = old.locator(`#posEditor [data-li="${li}"]`);
    await row.locator('[data-lraise]').fill(String(raise));
    await row.locator('[data-lraise]').dispatchEvent('change');
    const n = old.locator(`#posEditor [data-li="${li}"] [data-lmin="minNorm"]`);
    await n.fill(String(norm));
    await n.dispatchEvent('change');
  }
  await old.locator('#posList .list-item').nth(1).click();
  await old.fill('#posMax', '7');
  await old.dispatchEvent('#posMax', 'change');
  await old.locator('#posList .list-item').nth(2).click();
  await old.check('#posOnlyKafe');
  await old.click('#nav [data-view="lide"]');
  for (let i = 0; i < 4; i += 1) {
    await old.locator('#lList .list-item').nth(i).click();
    await old.selectOption('#pPos', { index: 1 + (i % 3) });
    await old.locator('#lDetail .lvlopt').nth(3 - i).click();
  }
  await old.locator('#lDetail [data-skill][data-lvl="2"]').first().click();
  // Top 5: řádek týdne a případ s příčinou
  await old.click('#nav [data-view="top5"]');
  await old.click('[data-entadd]');
  const ent = await old.evaluate(() => document.activeElement.closest('[data-ent]').dataset.ent);
  for (const [ef, value] of [['ean', '8590001000011'], ['name', 'Držák levý'], ['spent', '20'], ['norm', '9']]) {
    await old.fill(`[data-ent="${ent}"] [data-ef="${ef}"]`, value);
    await old.press(`[data-ent="${ent}"] [data-ef="${ef}"]`, 'Tab');
    await old.waitForTimeout(80);
  }
  await old.click('[data-t5new="8590001000011"]');
  await old.waitForSelector('.t5-case-head');
  await old.fill('[data-rf="cause"]', 'Chybí přípravek.');
  await old.press('[data-rf="cause"]', 'Tab');
  // Kontroly: nutné úkony a plán
  await old.click('#nav [data-view="kontroly"]');
  await old.click('#ktTabs [data-kttab="tasks"]');
  for (const d of await old.$$eval('[data-ktdept]', x => x.map(c => c.dataset.ktdept))) {
    await old.fill(`[data-ktdept="${d}"] [data-ktnew]`, 'Kontrola prvního kusu');
    await old.click(`[data-ktdept="${d}"] [data-ktaddtask]`);
    await old.waitForTimeout(100);
  }
  await old.click('#ktTabs [data-kttab="plan"]');
  await old.click('[data-ktgen]');
  await old.waitForSelector('.kt-days');
  await old.click('#nav [data-view="sankce"]');
  await old.selectOption('#sanWho', { index: 1 });
  await old.selectOption('#sanWhy', { index: 1 });
  await old.click('.pctpick label:nth-child(2)');
  await old.click('#sanAdd');
  await old.click('#nav [data-view="prehled"]');
  await old.waitForTimeout(300);
  await old.locator('#ovBody [data-issue]').first().click();
  await old.locator('#ovBody [data-adj][data-dir="1"]').nth(1).click();
  await old.click('#colPick summary');
  await old.locator('#colPanel [data-col="wk"]').uncheck();
  await old.keyboard.press('Escape');
  await old.selectOption('#ovPos', { index: 1 });
  await saved(old);
  await old.click('#nav [data-view="nastaveni"]');
  await old.click('#secNewCard');
  await old.fill('#dlg [name="value"]', 'Mistr noční');
  await old.click('#dlgOk');
  await old.waitForSelector('#dlg .odm-card');
  await old.click('#dlgOk');
  await old.click('#nav [data-view="prehled"]');
  await saved(old);
  await old.waitForTimeout(1500); // osobní nastavení se ukládá se zpožděním
  // Stav, jak ho verze 2.3 uložila a znovu načte (čerstvé přihlášení ve 2.3).
  const ctx0 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const reread = await ctx0.newPage();
  await watch(reread, '2.3 znovu');
  await login(reread, keyA);
  const before = await reread.evaluate(STATE);
  const beforeRows = await reread.evaluate(SUMMARY);
  const beforeLog = await reread.evaluate(() => S.log.length);
  const beforeRev = await reread.evaluate(() => store.rev);
  await ctx0.close();
  check(beforeLog >= 1, `ve 2.3 chybí historie změn: ${beforeLog}`);
  check(JSON.parse(beforeRows).some(r => r[11] > 0), 've 2.3 nikdo nemá navýšení platu (test by ho neověřil)');
  check(/"audit":\{[^]*"plans"/.test(before), 've 2.3 se neuložily Kontroly');
  await old.screenshot({ path: `${shots}/01-old.png`, fullPage: true });

  // ---- 2. aktualizace, stará stránka zůstává otevřená ----
  execSync(process.env.UPGRADE_CMD || 'bash deploy/install.sh', { stdio: 'inherit' });

  // ---- 3. stará stránka nesmí uložit ----
  await old.locator('#ovBody [data-adj][data-dir="1"]').first().click();
  await old.waitForSelector('#dlg[open]', { timeout: 15000 });
  const oldDialog = await old.textContent('#dlg');
  check(/Aplikace byla aktualizována/.test(oldDialog), `stará stránka: ${oldDialog.slice(0, 120)}`);
  await old.screenshot({ path: `${shots}/02-old-after-upgrade.png` });

  // ---- 4. nová verze: stejná data a výpočty ----
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx2.newPage();
  await watch(page, 'nová');
  await login(page, keyA);
  // EXPECT_VERSION: stejný test jde pustit i na pozdější aktualizaci (2.3 → 2.6)
  check(new RegExp(process.env.EXPECT_VERSION || '2\\.4').test(await page.evaluate(() => ui.me.version)), 'po aktualizaci neběží očekávaná verze');
  const after = await page.evaluate(STATE);
  fs.writeFileSync(path.join(S, 'u24-before.json'), before);
  fs.writeFileSync(path.join(S, 'u24-after.json'), after);
  compare(before, after).forEach(p => problems.push(`po aktualizaci: ${p}`));
  // Druhé zařízení ještě před prvním uložením: převod musí vyjít stejně (stejná id dovedností a stupňů).
  const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const other = await ctx3.newPage();
  await watch(other, 'druhé zařízení');
  await login(other, keyA);
  const ids = pg => pg.evaluate(() => JSON.stringify(S.positions.map(p => [p.skillset.map(x => x.id), p.tiers.map(t => t.id)])));
  check(await ids(other) === await ids(page), 'převod na druhém zařízení dal jiná id');
  await ctx3.close();
  const afterRows = await page.evaluate(SUMMARY);
  check(afterRows === beforeRows, `výpočty se po aktualizaci liší:\n${beforeRows}\n${afterRows}`);
  check(await page.evaluate(() => store.rev) === beforeRev, 'stará stránka po aktualizaci něco uložila');
  check(await page.evaluate(() => S.log.length) === beforeLog, 'historie změn se po aktualizaci liší');
  check(await page.inputValue('#ovPos') !== '', 'osobní filtr skupiny se ztratil');
  check((await page.locator('#ovHead .col-wk').count()) === 0, 'osobně skrytý sloupec se ztratil');
  check(/Zkontroluj převod 4 lidí z verze 2\.3/.test(await page.textContent('#todo')), 'Přehled nepřipomíná kontrolu převodu');
  await page.screenshot({ path: `${shots}/03-new.png`, fullPage: true });
  const groups = await page.evaluate(() => S.positions.map(p => [p.name, p.skillset.map(s => s.name), p.maxTab, p.max, p.tiers.map(t => [t.name, t.minSkill, t.raise, t.minNorm])]));
  check(JSON.stringify(groups[0][4]) === JSON.stringify([['Úroveň 3 – Samostatný', 3, 10, 95], ['Úroveň 4 – Profík', 4, 15, 100]]), `stupně prémie z navýšení: ${JSON.stringify(groups[0])}`);
  check(groups[1][3] === 7, `vlastní strop Kontroly: ${groups[1][3]}`);

  // Matice: převedené skupiny s jednou dovedností.
  await page.click('#nav [data-view="matice"]');
  await page.click('[data-mxtab="matrix"]');
  await page.waitForSelector('#matrixView .matrix');
  await page.screenshot({ path: `${shots}/04-matrix.png`, fullPage: true });
  await page.click('[data-mxtab="groups"]');
  await page.screenshot({ path: `${shots}/05-groups.png`, fullPage: true });

  // Okno s původním zařazením: obsah a „Převedeno do nové verze, smazat“.
  await page.click('#nav [data-view="lide"]');
  await page.click('#lList .list-item:has-text("Šťastný")');
  await page.waitForSelector('#lDetail .legacy-card');
  const legacy = await page.textContent('#lDetail .legacy-card');
  check(/Původní zařazení z verze 2\.3/.test(legacy), `okno s původním zařazením: ${legacy.slice(0, 200)}`);
  check(/vycházejí stejně jako dřív: 2/.test(legacy), `okno: tabáky dřív a teď (${legacy.slice(0, 300)})`);
  await page.screenshot({ path: `${shots}/06-legacy.png`, fullPage: true });
  const stKey = await page.evaluate(() => Object.values(S.employees).find(e => e.last === 'Šťastný').key);
  const stLegacy = await page.evaluate(k => legacyText(S.employees[k].legacy), stKey);
  await page.click('#lDetail [data-legacydone]');
  await page.waitForSelector('#dlg[open]');
  check(/Převedeno, smazat/.test(await page.textContent('#dlgOk')), 'potvrzení mazání okna');
  await page.click('#dlgOk');
  await page.waitForFunction(() => !document.querySelector('#lDetail .legacy-card'));
  // Ohodnocení dovednosti a směna v nové verzi, srážka ze mzdy.
  await page.selectOption('#pShift', 'R');
  await page.click('#nav [data-view="sankce"]');
  await page.selectOption('#sanWho', stKey);
  await page.selectOption('#sanWhy', { index: 1 });
  await page.check('#sanWage');
  await page.click('#sanAdd');
  await saved(page);
  const log = await page.evaluate(() => S.log.map(e => e.text));
  check(log.some(t => t.startsWith(`Šťastný Jiří: původní zařazení z verze 2.3 převedeno do nové verze a smazáno (${stLegacy})`)), `historie: smazání okna (${log.slice(-4).join(' | ')})`);
  check(log.some(t => /^Šťastný Jiří: směna — → Stálá ranní|^Šťastný Jiří: směna Bez směny → Stálá ranní/.test(t)), `historie: směna (${log.slice(-4).join(' | ')})`);

  // ---- znovu přihlášení: převod se uložil, data z 2.3 pořád stejná ----
  const ctx4 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const again = await ctx4.newPage();
  await watch(again, '2.4 znovu');
  await login(again, keyA);
  const kept = await again.evaluate(STATE);
  const stripNew = j => { const o = JSON.parse(j); delete o.log; delete o.sanctions; o.employees[stKey].shift = undefined; o.employees[stKey].legacy = undefined; return JSON.stringify(o); };
  check(stripNew(kept) === stripNew(after), 'nové uložení změnilo převzatá data');
  const k2 = JSON.parse(kept);
  check(!k2.employees[stKey].legacy && Object.values(k2.employees).filter(e => e.legacy).length === 3, 'okno s původním zařazením: smazané jen u Šťastného');
  check(JSON.stringify(k2.positions.map(p => p.skillset.map(s => s.id))) === JSON.stringify(JSON.parse(after).positions.map(p => p.skillset.map(s => s.id))), 'id dovedností po uložení zůstala');
  const rowsAgain = JSON.parse(await again.evaluate(SUMMARY));
  check(JSON.stringify(rowsAgain) === beforeRows, 'srážka ze mzdy nebo směna změnila výpočty');
  check(await again.isVisible('#wageAlert .wage-alert') === await again.evaluate(() => wagePending().length > 0), 'upozornění na srážku ze mzdy');
  await again.screenshot({ path: `${shots}/07-again.png`, fullPage: true });
  // Od 2.16: šifrované fotky Protokolů (nová tabulka files) fungují i v aktualizované instalaci.
  if (await again.evaluate(() => typeof Vault.saveFile === 'function')) {
    const photoOk = await again.evaluate(async () => {
      const bytes = new Uint8Array(200000).map((_, i) => (i * 7) % 251);
      const id = await Vault.saveFile(bytes);
      const back = await Vault.loadFile(id);
      await Vault.deleteFile(id);
      return back.length === bytes.length && back.every((v, i) => v === bytes[i]);
    }).catch(error => String(error));
    check(photoOk === true, `fotka po aktualizaci: ${photoOk}`);
  }
  await ctx4.close();

  await browser.close();
  console.log(problems.length ? `PROBLÉMY:\n${problems.join('\n')}` : 'upgrade 2.3 → 2.4 ok');
  if (problems.length) process.exit(1);
})().catch(error => { console.error(error); console.log(problems.join('\n')); process.exit(1); });
