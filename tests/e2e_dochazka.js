// Prohlížečový průchod: docházka a výkony z jednoho souboru (verze 2.37). První list Docházka
// (ID zaměstnance, pod datem dne příchod a odchod), druhý vykázaná práce (ID, díl, operace,
// množství v zakázce, dokončené množství, strávený čas). Kontroly podle dnešních příchodů
// (nahrání v Kontrolách, los jen z lidí v práci), import v KPI, záložka Lidé v práci (den
// i měsíc, PDF, Excel), produktivita s koláčem dílů v profilu, telefon a tmavý režim.
// Hodiny stránky stojí na pátku 30. 10. 2026 v 10:00 (týden se svátkem 28. 10.).
// Všechna data jsou vymyšlená.
// Spuštění stejně jako e2e_browser.js:
//   ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t . dev-router.php &
//   curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state
//   NO_PROXY=127.0.0.1 PW=$(npm root -g)/playwright S=$S node tests/e2e_dochazka.js
// Snímky jsou v $S/oshots-dochazka.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-dochazka');
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
async function confirm(page) {
  await page.waitForSelector('#dlg[open]');
  await page.click('#dlgOk');
  await page.waitForFunction(() => !document.querySelector('#dlg[open]'));
}
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const text = async (page, sel) => (await page.textContent(sel)).replace(/\s+/g, ' ').trim();

// Vymyšlení lidé: skupina, ID, příjmení, jméno; ve skupině vždy poslední dnes nepřišel.
const PEOPLE = [
  ['g_brus', '101', 'Adámek', 'Aleš'], ['g_brus', '102', 'Bednář', 'Boris'], ['g_brus', '103', 'Cibulka', 'Cyril'], ['g_brus', '104', 'Dvořák', 'Daniel'], ['g_brus', '105', 'Exner', 'Emil'],
  ['g_cnc', '201', 'Fiala', 'Filip'], ['g_cnc', '202', 'Gregor', 'Gustav'], ['g_cnc', '203', 'Havel', 'Hugo'], ['g_cnc', '204', 'Ihnát', 'Igor'],
  ['g_mon', '301', 'Janků', 'Jana'], ['g_mon', '302', 'Kubík', 'Karla'], ['g_mon', '303', 'Lukeš', 'Lada'],
];
const AWAY = new Set(['105', '204', '303']);
const DAYS = [26, 27, 28, 29, 30];
const ser = d => (Date.UTC(2026, 9, d) - Date.UTC(1899, 11, 30)) / 864e5;
const PARTS = ['Hřídel H-20', 'Kryt K-7', 'Příruba P-3', 'Pouzdro U-1', 'Čep C-12', 'Víko V-9', 'Matice M-5', 'Podložka D-2'];

/* List Docházka: nadpis, řádek s daty nad dvojicemi sloupců, podnadpis, lidé a neznámé ID 999.
   28. 10. (svátek) nikdo, 27. 10. má Exner kód D, dnes jen příchody. */
function attendance() {
  const head = ['ID'];
  const sub = [null];
  DAYS.forEach(d => { head.push(ser(d), null); sub.push('Příchod', 'Odchod'); });
  const rows = [['Docházka – říjen 2026'], head, sub];
  const exp = {};
  [...PEOPLE.map(p => p[1]), '999'].forEach((wid, i) => {
    const row = [Number(wid)];
    DAYS.forEach(d => {
      const iso = `2026-10-${d}`;
      if (d === 28 || (d === 30 && AWAY.has(wid)) || (wid === '999' && d !== 30)) { row.push(null, null); return; }
      if (d === 27 && wid === '105') { row.push('D', null); return; }
      const inMin = 345 + (i % 4) * 5;
      const outMin = d === 30 ? null : 870 + (i % 3) * 10;
      row.push(inMin / 1440, outMin == null ? null : outMin / 1440);
      (exp[iso] = exp[iso] || {})[wid] = [inMin, outMin];
    });
    rows.push(row);
  });
  rows.push(['Celkem', null, null]);
  return { rows, exp };
}
/* List vykázaná práce: A ID, B datum (formát data), C zakázka (číslo jako datum z Excelu, ale bez
   formátu data), D díl, E operace, F množství v zakázce, G dokončené, J strávený čas v minutách.
   Aleš Adámek (101) dělá na osmi dílech, koláč ukáže šest a Ostatní. */
function work() {
  const rows = [['ID zaměstnance', 'Datum', 'Zakázka', 'Název dílu', 'Operace', 'Množství v zakázce', 'Dokončené množství', 'Středisko', 'Pozn.', 'Strávený čas (min)']];
  const per = {};
  const dates = [];
  [26, 27, 29].forEach(d => PEOPLE.forEach(([g, wid], i) => {
    if (wid === '105' && d === 27) return;
    const n = wid === '101' ? 8 : 1 + (i % 3);
    for (let k = 0; k < n; k += 1) {
      const part = PARTS[(i + k) % PARTS.length];
      const op = g === 'g_brus' ? 'Broušení' : g === 'g_cnc' ? 'Frézování CNC' : 'Montáž sestavy';
      const t = wid === '101' ? 70 - k * 6 : Math.round((330 + ((i * 7 + d) % 6) * 25) / n) + k * 5;
      const done = 5 + ((i * 3 + k + d) % 9);
      rows.push([Number(wid), { d }, 45100 + i * 10 + k, part, op, done * 4, done, 'H2', '', t]);
      dates.push([rows.length - 1, 1]);
      const p = (per[wid] = per[wid] || { t: 0, g: 0, f: 0, parts: {} });
      p.t += t; p.g += done; p.f += done * 4;
      const q = (p.parts[part] = p.parts[part] || { t: 0, g: 0 });
      q.t += t; q.g += done;
    }
  }));
  rows.push([null, null, null, null, 'Celkem', null, 999, null, null, 9999]);
  return { rows, per };
}

async function makeXlsx(page, sheets) {
  const b64 = await page.evaluate(async sheets => {
    const X = await xlsx();
    const wb = X.utils.book_new();
    sheets.forEach(({ name, rows, dateRow, dateCol }) => {
      const aoa = rows.map(r => r.map(c => (c && c.d ? new Date(Date.UTC(2026, 9, c.d, 12)) : c)));
      const ws = X.utils.aoa_to_sheet(aoa);
      // datum v hlavičce docházky: celé číslo dne s formátem data (jako v Excelu)
      if (dateRow != null) rows[dateRow].forEach((c, k) => { if (typeof c === 'number' && k) ws[X.utils.encode_cell({ r: dateRow, c: k })].z = 'd.m.yyyy'; });
      if (dateCol != null) rows.forEach((r, i) => { const a = X.utils.encode_cell({ r: i, c: dateCol }); if (r[dateCol] && r[dateCol].d) ws[a].z = 'd.m.yyyy'; });
      X.utils.book_append_sheet(wb, ws, name);
    });
    const bytes = new Uint8Array(X.write(wb, { bookType: 'xlsx', type: 'array' }));
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, sheets);
  return Buffer.from(b64, 'base64');
}
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.clock.setFixedTime(NOW);
  const page = await ctx.newPage();
  await watch(page, 'docházka');
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
  await saved(page);
  check(await page.evaluate(() => todayIso()) === '2026-10-30', 'hodiny stránky na 30. 10. 2026');
  await page.evaluate(people => {
    const st = blank();
    const grp = (id, name, dept) => { const p = mkPos(id, name, []); p.dept = dept; p.skillset = [{ id: `k${id}`, name: 'Obsluha', desc: '', scale: null }]; p.maxTab = 8; p.tiers = []; return p; };
    st.positions = [grp('g_brus', 'Brus', 'Brus'), grp('g_cnc', 'CNC', 'Obrobna'), grp('g_mon', 'Montáž', 'Montáž')];
    people.forEach(([g, wid, last, first]) => { const key = `${last}|${first}`.toLowerCase(); st.employees[key] = { key, last, first, positionId: g, shift: 'R', note: '', wid, rate: { [`k${g}`]: 3 } }; });
    st.employees['novák|nikola'] = { key: 'novák|nikola', last: 'Novák', first: 'Nikola', positionId: 'g_mon', shift: 'R', note: '', wid: '', rate: {} };
    ['Brus', 'Obrobna', 'Montáž'].forEach(d => { st.audit.tasks[d] = [{ id: 't1', text: 'Kontrola prvního kusu' }, { id: 't2', text: 'Úklid pracoviště' }]; });
    S = sanitizeState(st);
    save();
    renderAll();
  }, PEOPLE);
  await saved(page);

  const att = attendance();
  const wk = work();
  const file = { name: 'dochazka-vykony-rijen.xlsx', mimeType: XLSX_TYPE,
    buffer: await makeXlsx(page, [{ name: 'Docházka', rows: att.rows, dateRow: 1 }, { name: 'vykázaná práce', rows: wk.rows, dateCol: 1 }]) };
  fs.writeFileSync(path.join(shots, file.name), file.buffer);

  // 1) Kontroly: režim podle příchodů si vyžádá dnešní soubor.
  await page.click('#nav [data-view="kontroly"]');
  await page.click('#ktSettings');
  await page.waitForSelector('#dlg[open] .kt-mode');
  await page.screenshot({ path: path.join(shots, '01-kontroly-nastaveni.png') });
  await page.check('#dlg input[name="mode"][value="day"]');
  await confirm(page);
  await saved(page);
  await page.waitForSelector('#ktView .kt-pres.w');
  check(/Dnešní kontroly čekají na příchody/.test(await text(page, '#ktView .kt-pres')), 'pruh: kontroly čekají na příchody');
  check(await page.evaluate(() => S.audit.settings.mode === 'day' && !document.querySelector('#navKt').hidden && /nahraj dnešní příchody/.test(document.querySelector('#navKt').title)), 'nastavení a odznak Kontrol');
  check(await page.locator('#ktView [data-ktgen]').count() === 0 && await page.locator('#ktView [data-ktday]').count() === 1, 'místo plánu na týden tlačítko Vylosovat dnešní kontroly');
  await page.screenshot({ path: path.join(shots, '02-kontroly-ceka.png') });

  await page.setInputFiles('#ktPresFile', file);
  // 2.42.3: nejdřív Jak se soubor načte (vzor prvního člověka), pak souhrn
  await page.waitForSelector('#dlg[open] .dv-map');
  { const mp = await text(page, '#dlgBody');
    check(/Vzor: co se z toho načte/.test(mp) && /První člověk: ID 101/.test(mp), `vzor prvního člověka: ${mp.slice(0, 300)}`); }
  await page.screenshot({ path: path.join(shots, '03a-kontroly-nacteni.png') });
  await page.click('#dlgOk');
  await page.waitForSelector('#dlg[open] .dv-imp');
  const k1 = await text(page, '#dlgBody');
  check(/^Nahrát příchody$/.test(await text(page, '#dlgTitle')), 'titulek dialogu v Kontrolách');
  check(/5 dní \(26\. 10\. 2026 – 30\. 10\. 2026\), 13 lidí s příchodem nebo odchodem, dnes 10\./.test(k1), `souhrn docházky: ${k1}`);
  check(/1 buňka bez času/.test(k1) && /Výkony z listu vykázané práce se tady nenahrávají/.test(k1) && /1 ID není u nikoho v Lidech: 999/.test(k1), `upozornění v dialogu: ${k1}`);
  await page.screenshot({ path: path.join(shots, '03-kontroly-dialog.png') });
  await confirm(page);
  await page.waitForFunction(() => S.audit.plans['2026-W44']);
  await saved(page);
  const t1 = await text(page, '#toast');
  check(/^Dnes v práci 10 lidí, vylosovány 4 kontroly\.$/.test(t1), `hláška po nahrání: ${t1}`);
  const k2 = await page.evaluate(away => {
    const p = S.audit.plans['2026-W44'];
    const today = p.items.filter(i => i.day === '2026-10-30');
    const wid = k => S.employees[k].wid;
    return { n: today.length, away: today.filter(i => away.includes(wid(i.key))).length, depts: today.map(i => i.dept).sort(), perf: Object.keys(S.workAudit.dv.perf).length, pres: Object.keys(S.workAudit.dv.pres).sort() };
  }, [...AWAY]);
  check(k2.n === 4 && k2.away === 0 && JSON.stringify(k2.depts) === JSON.stringify(['Brus', 'Brus', 'Montáž', 'Obrobna']), `dnešní los jen z lidí v práci: ${JSON.stringify(k2)}`);
  check(k2.perf === 0 && JSON.stringify(k2.pres) === JSON.stringify(['2026-10-26', '2026-10-27', '2026-10-29', '2026-10-30']), `v Kontrolách jen docházka: ${JSON.stringify(k2)}`);
  check(/Podle příchodů je dnes v práci 10 lidí \(1 ID není v Lidech\)\. Na dnešek jsou 4 kontroly\./.test(await text(page, '#ktView .kt-pres')), `pruh po nahrání: ${await text(page, '#ktView .kt-pres')}`);
  await page.screenshot({ path: path.join(shots, '04-kontroly-dnes.png'), fullPage: true });
  // znovu vylosovat: zase jen z lidí v práci, zapsané zůstanou
  await page.evaluate(() => { const it = S.audit.plans['2026-W44'].items.find(i => i.day === '2026-10-30'); recordCheck('2026-W44', it.id, { date: '2026-10-30', answers: { t1: true, t2: true } }, ktMeta()); save(); renderKontroly(); });
  await saved(page);
  await page.click('#ktView .kt-pres [data-ktday]');
  await confirm(page);
  await saved(page);
  const k3 = await page.evaluate(away => { const t = S.audit.plans['2026-W44'].items.filter(i => i.day === '2026-10-30'); return [t.length, t.filter(i => i.state === 'done').length, t.filter(i => away.includes(S.employees[i.key].wid)).length]; }, [...AWAY]);
  check(JSON.stringify(k3) === '[4,1,0]', `nový los: ${JSON.stringify(k3)}`);
  // náhradník: jen z lidí, kteří dnes přišli
  const k4 = await page.evaluate(away => {
    const it = S.audit.plans['2026-W44'].items.find(i => i.day === '2026-10-30' && i.state === 'plan');
    const sub = substituteCheck('2026-W44', it.id, 'odešel', ktMeta());
    return sub ? away.includes(S.employees[sub.key].wid) : 'nikdo';
  }, [...AWAY]);
  check(k4 === false || k4 === 'nikdo', `náhradník z lidí v práci: ${k4}`);
  await page.evaluate(() => { save(); renderKontroly(); });
  await saved(page);

  // 2) KPI: stejný soubor i s výkony.
  await page.click('#nav [data-view="audit"]');
  await page.setInputFiles('#waDvFile', file);
  // 2.42.3: nejdřív Jak se soubor načte (vzor prvního člověka), pak souhrn
  await page.waitForSelector('#dlg[open] .dv-map');
  { const mp = await text(page, '#dlgBody');
    check(/Vzor: co se z toho načte/.test(mp) && /První člověk: ID 101/.test(mp), `vzor prvního člověka: ${mp.slice(0, 300)}`); }
  await page.screenshot({ path: path.join(shots, '05a-audit-nacteni.png') });
  await page.click('#dlgOk');
  await page.waitForSelector('#dlg[open] .dv-imp');
  const d1 = await text(page, '#dlgBody');
  check(/^Nahrát docházku a výkony$/.test(await text(page, '#dlgTitle')), 'titulek dialogu v KPI');
  const recs = wk.rows.length - 2;
  check(new RegExp(`${recs} záznamů, 12 lidí: \\d`).test(d1), `souhrn výkonů: ${d1}`);
  check(/Datum ze sloupce B \(26\. 10\. 2026 – 29\. 10\. 2026\)\./.test(d1), `sloupec s datem B, ne čísla zakázek: ${d1}`);
  check(/4 dny už jsou nahrané/.test(d1), `upozornění na nahrané dny: ${d1}`);
  check(await page.isChecked('#dlg [name="toAudit"]'), 'kusy do KPI zaškrtnuté (dny ještě nemají výkaz)');
  check(await page.evaluate(() => document.querySelector('#dlg [name="unit"] option[value="auto"]').textContent) === 'najít sám (teď minuty)', 'jednotka času podle hlavičky (min)');
  await page.screenshot({ path: path.join(shots, '05-audit-dialog.png') });
  await confirm(page);
  await page.waitForSelector('#waView .dv-bars');
  await saved(page);
  const t2 = await text(page, '#toast');
  check(/^Nahráno: docházka za 5 dní, výkony za říjen 2026, kusy do KPI za 3 dny\. 3 nové operace čekají na skupinu v Nastavení\.$/.test(t2), `hláška KPI: ${t2}`);
  const a1 = await page.evaluate(() => ({ tab: ui.wa.tab, mode: ui.wa.dvMode, day: ui.wa.dvDay, files: S.workAudit.dv.files.length, perf: Object.keys(S.workAudit.dv.perf['2026-10'] || {}).length, pcs: Object.keys(S.workAudit.pcs).sort() }));
  check(a1.tab === 'lide' && a1.mode === 'day' && a1.day === '2026-10-30' && a1.files === 2 && a1.perf === 12 && JSON.stringify(a1.pcs) === '["2026-10-26","2026-10-27","2026-10-29"]', `po nahrání: ${JSON.stringify(a1)}`);
  const per101 = await page.evaluate(() => S.workAudit.dv.perf['2026-10']['101'].p);
  const exp101 = Object.fromEntries(Object.entries(wk.per['101'].parts).map(([k, v]) => [k, [v.g, v.g * 4, v.t, 3]]));
  check(JSON.stringify(Object.keys(per101).sort()) === JSON.stringify(Object.keys(exp101).sort()) && Object.keys(exp101).every(k => JSON.stringify(per101[k]) === JSON.stringify(exp101[k])), `díly Aleše: ${JSON.stringify(per101)} ≠ ${JSON.stringify(exp101)}`);

  // Dnešek: kdo je v práci a na jakém projektu.
  const tiles = await page.$$eval('#waView .stats .stat', els => els.map(e => [e.querySelector('.k').textContent.trim(), e.querySelector('.v').textContent.trim()]));
  check(JSON.stringify(tiles.map(t => t[1])) === JSON.stringify(['10', '10', '0 h', '3', '1']), `dlaždice dne: ${JSON.stringify(tiles)}`);
  const bars = await page.$$eval('#waView .dv-bars li', els => els.map(e => [e.querySelector('.dv-bl').textContent, e.querySelector('b').textContent]));
  check(JSON.stringify(bars) === JSON.stringify([['Brus', '4'], ['CNC', '3'], ['Montáž', '2'], ['Neznámé ID', '1']]), `pruhy po projektech: ${JSON.stringify(bars)}`);
  await page.hover('#waView .dv-bars li >> nth=1');
  check(/^CNC: 3 lidé, teď v práci 3, 0 h v práci$/.test(await text(page, '#waView .dv-bars-wrap .chart-tip')), `popisek pruhu: ${await text(page, '#waView .dv-bars-wrap .chart-tip')}`);
  const brus = await page.$$eval('#waView .dv-proj', els => els.map(e => [e.querySelector('h4').textContent, e.querySelectorAll('tbody tr').length]));
  check(JSON.stringify(brus) === JSON.stringify([['Brus', 4], ['CNC', 3], ['Montáž', 2], ['Neznámé ID', 1]]), `seznamy lidí: ${JSON.stringify(brus)}`);
  await page.screenshot({ path: path.join(shots, '06-lide-dnes.png'), fullPage: true });
  // Předchozí den: odchody, hodiny, bez „teď v práci“.
  await page.click('#waView [data-dvday]:not([disabled]) >> nth=0');
  await page.waitForFunction(() => ui.wa.dvDay === '2026-10-29');
  const exp29 = Object.values(att.exp['2026-10-29']).reduce((s, [a, b]) => s + (b - a), 0);
  const tiles29 = await page.$$eval('#waView .stats .stat .v', els => els.map(e => e.textContent.trim()));
  check(JSON.stringify(tiles29) === JSON.stringify(['12', `${(exp29 / 60).toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} h`, '3', '0']), `dlaždice 29. 10.: ${JSON.stringify(tiles29)}`);
  // denní report do PDF
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#waView [data-dvpdf]')]);
  const pdfPath = path.join(shots, dl.suggestedFilename());
  await dl.saveAs(pdfPath);
  const pdf = fs.readFileSync(pdfPath);
  check(dl.suggestedFilename() === 'lide-v-praci-2026-10-29.pdf' && pdf.slice(0, 5).toString() === '%PDF-' && pdf.length > 20000, `PDF dne: ${dl.suggestedFilename()} ${pdf.length}`);

  // Měsíc: obsazenost po dnech, produktivita lidí, Excel.
  await page.click('#waView [data-dvmode="month"]');
  await page.waitForSelector('#waView .dv-people');
  const m1 = await page.evaluate(() => ({ days: [...document.querySelectorAll('#waView .dv-occ tbody tr')].map(r => r.dataset.dvgo), people: document.querySelectorAll('#waView .dv-people tbody tr').length,
    head: [...document.querySelectorAll('#waView .dv-occ thead th')].map(t => t.textContent) }));
  check(JSON.stringify(m1.days) === JSON.stringify(['2026-10-26', '2026-10-27', '2026-10-29', '2026-10-30']) && m1.people === 13, `měsíc: ${JSON.stringify(m1)}`);
  check(JSON.stringify(m1.head) === JSON.stringify(['Den', 'Brus', 'CNC', 'Montáž', 'Neznámé ID', 'Celkem', 'Hodiny']), `sloupce obsazenosti: ${m1.head}`);
  await page.click('#waView [data-dvsort="util"]');
  const utils = await page.$$eval('#waView .dv-people tbody tr td[data-label="Využití"]', els => els.map(e => e.textContent.trim()));
  const nums = utils.filter(u => u !== '—').map(u => parseFloat(u));
  check(nums.length === 12 && nums.every((v, i) => !i || v <= nums[i - 1]), `řazení podle využití: ${utils}`);
  await page.screenshot({ path: path.join(shots, '07-lide-mesic.png'), fullPage: true });
  const [dx] = await Promise.all([page.waitForEvent('download'), page.click('#waView [data-dvxlsx]')]);
  const xPath = path.join(shots, dx.suggestedFilename());
  await dx.saveAs(xPath);
  const xl = await page.evaluate(async b64 => {
    const X = await xlsx();
    const wb = X.read(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), { type: 'array' });
    return { names: wb.SheetNames, rows: wb.SheetNames.map(n => X.utils.sheet_to_json(wb.Sheets[n], { header: 1 }).length), lide: X.utils.sheet_to_json(wb.Sheets['Lidé'], { header: 1 })[1] };
  }, fs.readFileSync(xPath).toString('base64'));
  check(dx.suggestedFilename() === 'lide-v-praci-2026-10.xlsx' && JSON.stringify(xl.names) === JSON.stringify(['Obsazenost', 'Lidé', 'Docházka', 'Díly']), `Excel: ${JSON.stringify(xl)}`);
  check(xl.rows[0] === 5 && xl.rows[1] === 14 && xl.rows[2] === 1 + Object.values(att.exp).reduce((n, d) => n + Object.keys(d).length, 0) && xl.rows[3] > 20, `řádky Excelu: ${xl.rows}`);

  // 3) Profil: produktivita a koláč dílů.
  await page.click('#waView .dv-people tr[data-dvperson="adámek|aleš"]');
  await page.waitForSelector('#view-profil.on .pf-dv .dv-pie');
  const p101 = wk.per['101'];
  const pf = await page.evaluate(() => ({ legend: [...document.querySelectorAll('.pf-dv .dv-legend tbody tr')].map(r => [...r.children].map(c => c.textContent.trim())),
    slices: document.querySelectorAll('.pf-dv .dv-pie path').length, center: document.querySelector('.pf-dv .dv-pie-v').textContent,
    tiles: [...document.querySelectorAll('.pf-dv .stat .v')].map(e => e.textContent.trim()) }));
  const sorted = Object.entries(p101.parts).sort((a, b) => b[1].t - a[1].t || b[1].g - a[1].g);
  const fmt = n => n.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });
  check(pf.slices === 7 && pf.legend.length === 7 && pf.legend[6][0] === 'Ostatní díly (2)', `koláč 6 + Ostatní: ${JSON.stringify(pf.legend)}`);
  check(pf.legend.slice(0, 6).every((r, i) => r[0] === sorted[i][0] && r[1] === `${fmt(sorted[i][1].t / 60)} h` && r[2] === String(sorted[i][1].g)), `legenda podle času: ${JSON.stringify(pf.legend)} ≠ ${JSON.stringify(sorted)}`);
  check(pf.center === fmt(p101.t / 60), `střed koláče ${pf.center} ≠ ${p101.t / 60}`);
  check(pf.tiles[0] === '4' && pf.tiles[2] === `${(p101.t / 60).toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} h` && pf.tiles[4] === `${p101.g} ks`, `dlaždice profilu: ${JSON.stringify(pf.tiles)}`);
  await page.locator('.pf-dv').scrollIntoViewIfNeeded();
  await page.hover('.pf-dv .dv-pie path >> nth=0');
  const tip = await text(page, '.pf-dv .chart-tip');
  check(new RegExp(`^${sorted[0][0]}: ${fmt(sorted[0][1].t / 60)} h, ${sorted[0][1].g} ks z ${sorted[0][1].g * 4} \\(\\d+ %\\)$`).test(tip), `popisek výseče: ${tip}`);
  await page.locator('.pf-dv').screenshot({ path: path.join(shots, '08-profil-kolac.png') });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(150);
  await page.locator('.pf-dv').screenshot({ path: path.join(shots, '09-profil-kolac-tmavy.png') });
  const darkFill = await page.evaluate(() => getComputedStyle(document.querySelector('.pf-dv .dv-pie path.s1')).fill);
  check(darkFill === 'rgb(57, 135, 229)', `tmavá barva první výseče: ${darkFill}`);
  await page.emulateMedia({ colorScheme: 'light' });
  // člověk bez ID
  await page.evaluate(() => openProfile('novák|nikola'));
  await page.waitForSelector('#view-profil.on .pf-dv');
  check(/nemá vyplněné ID zaměstnance/.test(await text(page, '.pf-dv')), 'profil bez ID');

  // 4) Nastavení: sloupce a jednotka; historie změn.
  await page.evaluate(() => { ui.wa.tab = 'nastaveni'; showView('audit'); });
  await page.waitForSelector('#dvColsCard');
  await page.selectOption('#dvUnit', 'h');
  await saved(page);
  await page.fill('#dvColsCard [data-dvcol="work.done"]', 'H');
  await page.press('#dvColsCard [data-dvcol="work.done"]', 'Tab');
  await saved(page);
  const st = await page.evaluate(() => [S.workAudit.dv.unit, S.workAudit.dv.cols.work.done]);
  check(JSON.stringify(st) === '["h","H"]', `nastavení: ${st}`);
  await page.locator('#dvColsCard').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, '10-nastaveni.png') });
  await page.click('#dvColsCard [data-dvcolreset]');
  await saved(page);
  const log = await page.evaluate(() => S.log.map(x => x.text));
  check(log.some(t => /^KPI: nahrán soubor dochazka-vykony-rijen\.xlsx: docházka 26\. 10\. 2026 – 30\. 10\. 2026 \(13 lidí\)$/.test(t)), `historie: nahrání v Kontrolách (${log.slice(0, 6).join(' | ')})`);
  check(log.some(t => /^KPI: nahrán soubor dochazka-vykony-rijen\.xlsx: docházka .*, výkony za říjen 2026, kusy do KPI za 3 dny$/.test(t)), 'historie: nahrání v KPI');
  check(log.some(t => t === 'KPI: změněny sloupce souboru docházky a výkonů'), 'historie: sloupce');

  // 5) Telefon a tmavý režim: Lidé v práci a profil bez vodorovného posunu.
  const mp = page;
  await mp.setViewportSize({ width: 390, height: 844 });
  await mp.evaluate(() => { Object.assign(ui.wa, { tab: 'lide', dvMode: 'day', dvDay: '2026-10-30' }); showView('audit'); });
  await mp.waitForSelector('#waView .dv-bars');
  check(await overflow(mp) <= 0, `telefon: Lidé v práci se posouvají do strany (${await overflow(mp)} px)`);
  await mp.screenshot({ path: path.join(shots, '11-telefon-lide.png'), fullPage: true });
  await mp.evaluate(() => openProfile('adámek|aleš'));
  await mp.waitForSelector('#view-profil.on .pf-dv .dv-pie');
  check(await overflow(mp) <= 0, `telefon: profil se posouvá do strany (${await overflow(mp)} px)`);
  await mp.locator('.pf-dv').scrollIntoViewIfNeeded();
  await mp.locator('.pf-dv').screenshot({ path: path.join(shots, '12-telefon-kolac.png') });
  await mp.emulateMedia({ colorScheme: 'dark' });
  await mp.evaluate(() => { showView('kontroly'); });
  await mp.waitForSelector('#ktView .kt-pres');
  check(await overflow(mp) <= 0, `telefon: Kontroly se posouvají do strany (${await overflow(mp)} px)`);
  await mp.screenshot({ path: path.join(shots, '13-telefon-kontroly-tmavy.png'), fullPage: true });

  await browser.close();
  if (problems.length) { console.log(`PROBLÉMY (${problems.length}):\n${problems.join('\n')}`); process.exit(1); }
  console.log('docházka a výkony ok');
})().catch(error => { console.error(error); process.exit(1); });
