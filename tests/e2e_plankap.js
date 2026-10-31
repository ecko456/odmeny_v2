// Prohlížečový průchod: Plán kapacit (verze 2.38). U skupin z Matice dovedností se zadá
// potřeba lidí celkem a aspoň na úrovni 2, 3 a 4; plán ukáže, jak jsme na tom (lidé ve skupině,
// nemocní, průměr v práci z docházky v KPI), kolik doplnit a koho doškolit. Kontroluje
// srovnání počtů (vyšší úroveň zvedne nižší), výpočet proti očekávání, kandidáty s odkazem do
// profilu, poznámku, historii změn, PDF (2.44.2: list na oddělení, bez jmen i ID, konce trestů
// po měsících; text přes pypdf, stránky přes PyMuPDF, když jsou), Excel jen s ID, telefon a tmavý režim.
// Všechna data jsou vymyšlená. Hodiny stránky stojí na pátku 30. 10. 2026 v 10:00.
// Spuštění stejně jako e2e_browser.js:
//   ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t . dev-router.php &
//   curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state
//   NO_PROXY=127.0.0.1 PW=$(npm root -g)/playwright S=$S node tests/e2e_plankap.js
// Snímky jsou v $S/oshots-plankap.
const { chromium } = require(process.env.PW);
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-plankap');
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
async function setNeed(page, group, key, value) {
  const sel = `#cp-${group}-${key}`;
  await page.fill(sel, String(value));
  await page.press(sel, 'Enter');
  await saved(page);
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.clock.setFixedTime(NOW);
  const page = await ctx.newPage();
  await watch(page, 'plán');
  await page.goto(BASE);
  await page.waitForSelector('#setupForm');
  await page.fill('[name="token"]', fs.readFileSync(process.env.TOKEN_FILE || path.join(S, 'odme2e', 'setup-token.txt'), 'utf8').trim());
  await page.fill('[name="label"]', 'Vedoucí výroby');
  await page.click('#setupForm button[type="submit"]');
  await page.waitForSelector('.odm-card');
  await page.check('#saved');
  await page.click('#finish');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');
  await saved(page);

  // Tři oddělení, čtyři skupiny; procenta dovedností z hodnocení (4 dovednosti v Brusu).
  await page.evaluate(() => {
    const st = blank();
    const grp = (id, name, dept, n) => { const p = mkPos(id, name, []); p.dept = dept; p.skillset = Array.from({ length: n }, (_, i) => ({ id: `${id}s${i}`, name: `Dovednost ${i + 1}`, desc: '', scale: null })); p.maxTab = 8; p.tiers = []; return p; };
    st.positions = [grp('g_brus', 'Brus', 'Brus', 4), grp('g_cnc', 'CNC', 'Obrobna', 2), grp('g_fre', 'Frézka', 'Obrobna', 2), grp('g_lep', 'Lepení', 'Lepení', 1)];
    const NAMES = ['Adámek', 'Bednář', 'Cibulka', 'Dvořák', 'Exner', 'Fiala', 'Gregor', 'Havel', 'Ihnát', 'Janků'];
    const add = (i, g, vals, extra) => {
      const key = `${NAMES[i].toLowerCase()}|jan`;
      st.employees[key] = { key, last: NAMES[i], first: 'Jan', positionId: g, shift: 'R', note: '', wid: String(100 + i), rate: Object.fromEntries(vals.map((v, j) => [`${g}s${j}`, v]).filter(x => x[1])), ...(extra || {}) };
    };
    add(0, 'g_brus', [4, 4, 4, 4]); add(1, 'g_brus', [3, 3, 3, 3]); add(2, 'g_brus', [3, 3, 2, 2]); add(3, 'g_brus', [2, 2, 2, 2]);
    add(4, 'g_brus', [1, 1, 1, 1], { sick: '2026-10-28' }); add(5, 'g_brus', []);
    add(6, 'g_cnc', [4, 4]); add(7, 'g_cnc', [2, 2]); add(8, 'g_fre', [3, 3]); add(9, 'g_brus', [4, 4, 4, 4], { excluded: true });
    // konce trestů pro PDF (2.44.2): listopad, leden, po termínu, únor
    st.employees['adámek|jan'].end = '2026-11-20'; st.employees['cibulka|jan'].end = '2027-01-15';
    st.employees['dvořák|jan'].end = '2026-09-01'; st.employees['gregor|jan'].end = '2027-02-10';
    S = sanitizeState(st);
    // docházka z KPI: 26., 27. a 29. 10. v práci 5 z Brusu (bez nemocného Exnera), oba z CNC, Frézka jen 29.
    ['2026-10-26', '2026-10-27', '2026-10-29'].forEach(iso => {
      const day = {};
      ['100', '101', '102', '103', '105', '106', '107'].forEach(w => { day[w] = [360, 870]; });
      if (iso === '2026-10-29') day['108'] = [360, 870];
      S.workAudit.dv.pres[iso] = day;
    });
    save();
    renderAll();
  });
  await saved(page);

  await page.click('#nav [data-view="plankap"]');
  await page.waitForSelector('#cpView .cp-table');
  check(/Začni potřebou/.test(await text(page, '#cpView')), 'úvodní nápověda bez plánu');
  const t0 = await page.$$eval('#cpView .stats .stat .v', els => els.map(e => e.textContent.trim()));
  check(JSON.stringify(t0) === JSON.stringify(['0', '0', '0', '0', '0', '0/ 0']), `dlaždice bez plánu: ${JSON.stringify(t0)}`);
  await page.screenshot({ path: path.join(shots, '01-prazdny.png'), fullPage: true });

  // Brus: potřeba 8, 2+ 5, 3+ 3, 4 2 (zadáno odspodu i shora); CNC jen 3+ 2 (zvedne celkem a 2+).
  await setNeed(page, 'g_brus', 'n', 8);
  await setNeed(page, 'g_brus', 'l2', 5);
  await setNeed(page, 'g_brus', 'l4', 2);
  await setNeed(page, 'g_brus', 'l3', 3);
  await setNeed(page, 'g_cnc', 'l3', 2);
  await setNeed(page, 'g_fre', 'n', 1);
  const need = await page.evaluate(() => JSON.parse(JSON.stringify(S.capPlan.groups)));
  check(JSON.stringify(need) === JSON.stringify({ g_brus: { n: 8, l2: 5, l3: 3, l4: 2 }, g_cnc: { n: 2, l2: 2, l3: 2, l4: 0 }, g_fre: { n: 1, l2: 0, l3: 0, l4: 0 } }), `uložená potřeba: ${JSON.stringify(need)}`);
  const vals = await page.$$eval('#cpView tr[data-cpg="g_cnc"] input', els => els.map(e => e.value));
  check(JSON.stringify(vals) === JSON.stringify(['2', '2', '2', '']), `pole CNC po zvednutí: ${vals}`);
  const rows = await page.$$eval('#cpView tr.cp-row', els => els.map(r => [r.dataset.cpg, ...['Máme celkem', 'Máme 2+', 'Máme 3+', 'Máme 4', 'Ø v práci', 'Doplnit', 'Doškolit', 'Stav'].map(l => (r.querySelector(`td[data-label="${l}"]`) || {}).textContent.trim())]));
  check(JSON.stringify(rows) === JSON.stringify([
    ['g_brus', '6', '4', '2', '1', '5', '+2', '3', 'Doplnit lidi'],
    ['g_cnc', '2', '2', '1', '1', '2', '—', '1', 'Doškolit'],
    ['g_fre', '1', '1', '1', '0', '0,3', '—', '—', 'V pořádku'],
    ['g_lep', '0', '0', '0', '0', '0', '—', '—', 'Bez plánu'],
  ]), `řádky plánu: ${JSON.stringify(rows)}`);
  const short = await page.$$eval('#cpView tr[data-cpg="g_brus"] td.cp-short', els => els.map(e => e.dataset.label));
  check(JSON.stringify(short) === JSON.stringify(['Máme celkem', 'Máme 2+', 'Máme 3+', 'Máme 4']), `chybějící počty zvýrazněné: ${short}`);
  const recs = await page.$$eval('#cpView .cp-recs li', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  check(recs[0] === 'Brus: doplnit 2 lidi; doškolit 3 lidi: na úroveň 4 ID 101 75 %; na úroveň 3 ID 102 63 %; na úroveň 2 ID 104 25 %', `doporučení Brus: ${recs[0]}`);
  check(!/Bednář|Cibulka|Exner|Havel/.test(await page.textContent('#cpView')), 'v plánu nejsou jména');
  check(recs[1] === 'CNC: doškolit 1 člověka: na úroveň 3 ID 107 50 %', `doporučení CNC: ${recs[1]}`);
  const tiles = await page.$$eval('#cpView .stats .stat .v', els => els.map(e => e.textContent.trim()));
  check(JSON.stringify(tiles) === JSON.stringify(['11', '9', '7,3', '2', '4', '1/ 3']), `dlaždice: ${JSON.stringify(tiles)}`);
  await page.fill('#cpNote', 'Nábor 2 brusičů do konce listopadu.');
  await page.press('#cpNote', 'Tab');
  await saved(page);
  await page.screenshot({ path: path.join(shots, '02-plan.png'), fullPage: true });

  // kandidát vede do profilu
  await page.click('#cpView .cp-recs [data-cpperson="bednář|jan"]');
  await page.waitForFunction(() => ui.view === 'profil' && ui.profileKey === 'bednář|jan');
  await page.goBack();
  await page.waitForFunction(() => ui.view === 'plankap');

  // historie změn: potřeba Brusu jedním záznamem „bez plánu → 8 lidí …“, poznámka
  const log = await page.evaluate(() => S.log.map(x => x.text));
  check(log.includes('Plán kapacit – Brus: bez plánu → 8 lidí (2+ 5, 3+ 3, 4 2)'), `historie Brus: ${log.slice(0, 6).join(' | ')}`);
  check(log.includes('Plán kapacit: poznámka „Nábor 2 brusičů do konce listopadu.“'), 'historie poznámky');

  // PDF a Excel
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#cpPdf')]);
  const pdfPath = path.join(shots, dl.suggestedFilename());
  await dl.saveAs(pdfPath);
  check(dl.suggestedFilename() === 'plan-kapacit-2026-10-30.pdf' && fs.readFileSync(pdfPath).slice(0, 5).toString() === '%PDF-', `PDF: ${dl.suggestedFilename()}`);
  try {
    const txt = execFileSync('python3', ['-c', 'import sys,pypdf;print("\\n".join(p.extract_text() for p in pypdf.PdfReader(sys.argv[1]).pages))', pdfPath]).toString();
    // 2.44.2: jedno oddělení = jedna strana, bez jmen a bez ID
    const pages = txt.split('\f');
    check(/PLÁN KAPACIT/.test(txt) && /Skupiny podle zkušenosti/.test(txt) && /Kdy lidé končí/.test(txt) && /Kolik lidí zůstane/.test(txt) && !/Bednář|Cibulka|Exner|Havel|ID 10/.test(txt), `text PDF: ${txt.slice(0, 400)}`);
    check(/DOPLNIT 2/.test(txt) && /1 \/ 2/.test(txt) && /2 \/ 2/.test(txt), `stav oddělení a strany: ${txt.slice(0, 600)}`);
  } catch (error) { if (/pypdf/.test(String(error))) console.log('pypdf není, text PDF se nekontroluje'); else problems.push(`PDF: ${error.message}`); }
  try {
    execFileSync('python3', ['-c', `import sys
try:
    import pymupdf
except ImportError:
    print('pymupdf není, stránky PDF se nevykreslí'); sys.exit(0)
d=pymupdf.open(sys.argv[1])
assert d.page_count==2, d.page_count
for i,p in enumerate(d): p.get_pixmap(matrix=pymupdf.Matrix(1.5,1.5)).save(sys.argv[2]+'/pdf-%d.png'%(i+1))`, pdfPath, shots]);
  } catch (error) { problems.push(`PDF stránky: ${String(error.stderr || error.message).slice(-300)}`); }
  const [dx] = await Promise.all([page.waitForEvent('download'), page.click('#cpXlsx')]);
  const xPath = path.join(shots, dx.suggestedFilename());
  await dx.saveAs(xPath);
  const xl = await page.evaluate(async b64 => {
    const X = await xlsx();
    const wb = X.read(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), { type: 'array' });
    return { names: wb.SheetNames, plan: X.utils.sheet_to_json(wb.Sheets['Plán'], { header: 1 }), cand: X.utils.sheet_to_json(wb.Sheets['Doškolit'], { header: 1 }) };
  }, fs.readFileSync(xPath).toString('base64'));
  check(JSON.stringify(xl.names) === '["Plán","Doškolit"]' && xl.plan.length === 5 && xl.cand.length === 5, `Excel: ${JSON.stringify([xl.names, xl.plan.length, xl.cand.length])}`);
  check(JSON.stringify(xl.cand[0]) === JSON.stringify(['Oddělení', 'Skupina', 'ID zaměstnance', 'Dovednosti (%)', 'Cílová úroveň', 'Chybí (%)']) && JSON.stringify(xl.cand[1].slice(0, 3)) === JSON.stringify(['Brus', 'Brus', '101']), `Excel Doškolit jen s ID: ${JSON.stringify(xl.cand.slice(0, 2))}`);
  check(!JSON.stringify(xl).includes('Bednář'), 'Excel bez jmen');
  check(JSON.stringify(xl.plan[1].slice(0, 11)) === JSON.stringify(['Brus', 'Brus', 8, 5, 3, 2, 6, 4, 2, 1, 1]), `Excel řádek Brus: ${JSON.stringify(xl.plan[1])}`);

  // konce trestů po měsících v oddělení (2.44.2) a PDF bez plánu (jen výpočet, nic se neukládá)
  const edge = await page.evaluate(() => {
    const all = capPlanAll();
    const brus = all.depts.find(d => d.dept === 'Brus');
    const e = capPlanEnds(brus, '2026-10-30', 12);
    const keep = S.capPlan;
    S.capPlan = { ...keep, groups: {} };
    const st = cpPdfDepts(capPlanAll()).map(d => cpDeptState(d)[0]);
    S.capPlan = keep;
    return { now: [e.nowN, e.now[4], e.now[3], e.now[2], e.now[0]], od: e.overdueN, m: e.months.slice(0, 4).map(x => [x.m, x.leaveN, x.remainN]), noEnd: e.noEnd, st };
  });
  check(JSON.stringify(edge.now) === '[6,1,1,2,2]' && edge.od === 1 && JSON.stringify(edge.m) === JSON.stringify([['2026-10', 0, 5], ['2026-11', 1, 4], ['2026-12', 0, 4], ['2027-01', 1, 3]]) && edge.noEnd === 3 && edge.st.every(x => x === 'BEZ PLÁNU'), `konce v Brusu: ${JSON.stringify(edge)}`);

  // vynulování potřeby skupinu z plánu odebere
  await setNeed(page, 'g_fre', 'n', 0);
  check(await page.evaluate(() => !S.capPlan.groups.g_fre), 'nulová potřeba = bez plánu');

  // tmavý režim a telefon
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(150);
  await page.locator('#cpView .cp-dept').first().screenshot({ path: path.join(shots, '03-tmavy.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  check(await overflow(page) <= 0, `telefon: plán se posouvá do strany (${await overflow(page)} px)`);
  await page.screenshot({ path: path.join(shots, '04-telefon.png'), fullPage: true });
  await setNeed(page, 'g_lep', 'n', 1);
  check(await page.evaluate(() => S.capPlan.groups.g_lep && S.capPlan.groups.g_lep.n === 1), 'telefon: potřeba jde zadat');

  await browser.close();
  if (problems.length) { console.log(`PROBLÉMY (${problems.length}):\n${problems.join('\n')}`); process.exit(1); }
  console.log('plán kapacit ok');
})().catch(error => { console.error(error); process.exit(1); });
