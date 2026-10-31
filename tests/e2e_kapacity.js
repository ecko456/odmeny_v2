// Prohlížečový průchod záložkou Kapacity a zaškolení v Auditu (verze 2.30, stránky podle vzoru 2.31):
// vymyšlení lidé ve třech skupinách, docházka za poslední čtyři měsíce do včerejška, historie hodnocení
// (zaškolování), nemoc, vyřazený, vedoucí a lidé bez skupiny, evidence práce s normou. Kontroluje
// měsíční souhrn, týdenní souhrn a vývoj zaškolení (texty, tabulky proti výpočtu, grafy s tooltipem),
// záhlaví reportu, vlastní období, PDF na výšku (text, jen ID, žádná jména, Plex Mono) a Excel
// (listy a součty proti výpočtu), hranici zaškolení z Nastavení Auditu (2.33), telefon a tmavý režim.
// Všechna data jsou vymyšlená.
// Spuštění stejně jako e2e_browser.js:
//   ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t . dev-router.php &
//   curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state
//   NO_PROXY=127.0.0.1 PW=$(npm root -g)/playwright S=$S node tests/e2e_kapacity.js
// Text PDF čte pypdf (bez něj PyMuPDF, bez obou se kontrola textu přeskočí). Snímky jsou v $S/oshots-ct.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-ct');
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
  return { name: file.suggestedFilename(), path: target, head: fs.readFileSync(target).slice(0, 5).toString() };
}
function pdfText(file) {
  const py = `import sys, json
try:
    import pypdf
    print(json.dumps([p.extract_text() or '' for p in pypdf.PdfReader(sys.argv[1]).pages]))
except ImportError:
    try:
        import pymupdf
        print(json.dumps([p.get_text() for p in pymupdf.open(sys.argv[1])]))
    except ImportError:
        print('null')`;
  const r = spawnSync('python3', ['-c', py, file], { encoding: 'utf8' });
  return r.status === 0 ? JSON.parse(r.stdout) : null;
}
function pdfPng(file, out) {
  spawnSync('python3', ['-c', `import pymupdf,sys
d=pymupdf.open(sys.argv[1])
for i,p in enumerate(d): p.get_pixmap(matrix=pymupdf.Matrix(1.6,1.6)).save(sys.argv[2]+'-'+str(i+1)+'.png')`, file, out]);
}
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// Vymyšlení lidé: příjmení × jména, tři skupiny, střídání směn.
const LAST = ['Brusič', 'Fréza', 'Pískař', 'Kotouč', 'Vrták', 'Pilník', 'Soustruh', 'Hoblík', 'Svěrák', 'Kladivo', 'Šroubek', 'Matička'];
const FIRST = ['Adam', 'Bára', 'Cyril'];

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await watch(page, 'kapacity');
  await page.goto(BASE);
  await page.waitForSelector('#setupForm');
  await page.fill('[name="token"]', fs.readFileSync(process.env.TOKEN_FILE || path.join(S, 'odme2e', 'setup-token.txt'), 'utf8').trim());
  await page.fill('[name="label"]', 'Vedoucí haly');
  await page.click('#setupForm button[type="submit"]');
  await page.waitForSelector('.odm-card');
  await page.check('#saved');
  await page.click('#finish');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');
  await saved(page);

  // Data: docházka od prvního dne měsíce před třemi měsíci do včerejška, historie hodnocení.
  const seed = await page.evaluate(({ LAST, FIRST }) => {
    let s = 5;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const st = blank();
    const sk = (id, names, opt = -1) => names.map((n, i) => ({ id: `${id}${i}`, name: n, desc: '', scale: null, ...(i === opt ? { opt: true } : {}) }));
    const grp = (id, name, dept, skills) => { const p = mkPos(id, name, []); p.dept = dept; p.skillset = skills; p.maxTab = 8; p.tiers = []; return p; };
    st.positions = [grp('g_brus', 'Brus', 'Brus', sk('kb', ['Rovinné broušení', 'Kulaté broušení', 'Měření'])),
      grp('g_cnc', 'CNC', 'Obrobna', sk('kc', ['Seřízení', 'Programování'])), grp('g_pis', 'Písek', 'Tryskání', sk('kp', ['Tryskání', 'Balení'], 1)),
      grp('g_lep', 'Lepení', 'Lepení', sk('kl', ['Lepení']))];   // skupina zatím bez lidí
    const today = todayIso();
    const m0 = today.slice(0, 7);
    const mAdd = (m, n) => { let [y, mm] = m.split('-').map(Number); mm += n; while (mm < 1) { mm += 12; y -= 1; } while (mm > 12) { mm -= 12; y += 1; } return `${y}-${String(mm).padStart(2, '0')}`; };
    const from = `${mAdd(m0, -3)}-01`;
    const startTs = new Date(+from.slice(0, 4), +from.slice(5, 7) - 1, 1, 8).getTime();
    const nowTs = Date.now();
    const shifts = ['R', 'S1', 'S2', 'O', 'S1', 'S2'];
    const keys = [];
    for (let n = 0; n < 36; n += 1) {
      const g = st.positions[n % 3];
      const key = `k${n}`;
      keys.push(key);
      const ids = g.skillset.map(x => x.id);
      // dnešní hodnocení a cesta k němu: začátek o 1–2 úrovně níž, zvýšení v náhodné dny za poslední tři měsíce
      const now = ids.map((_, i) => Math.min(4, 1 + ((n * 7 + i * 3) % 4)));
      const rate = {};
      ids.forEach((id, i) => { if (now[i]) rate[id] = now[i]; });
      const e = { key, last: LAST[n % LAST.length], first: FIRST[Math.floor(n / LAST.length)], positionId: g.id, shift: shifts[n % 6], note: '', rate, wid: String(1000 + n) };
      if (n === 30) e.lead = ['Brus'];
      if (n === 31 || n === 32) { e.positionId = null; e.rate = {}; }
      if (n === 33) e.excluded = true;
      if (n === 34) e.sick = addDays(today, -4);
      st.employees[key] = e;
    }
    st.workAudit.target = 22;
    st.capReport = { ...blankCapReport(), thr: 3, s1am: isoWeek(today).id };
    S = sanitizeState(st);
    // historie: první zápis na začátku období s nižším procentem, pak zvýšení po krocích k dnešnímu
    Object.values(S.employees).forEach((e, n) => {
      const p = S.positions.find(x => x.id === e.positionId);
      if (!p || isLead(e)) return;
      const cur = skillPct(e, p);
      const steps = n % 4;
      const hist = [{ at: startTs, pos: p.id, lvl: null, pct: Math.max(0, cur - steps * 12.5) }];
      for (let j = 1; j <= steps; j += 1) hist.push({ at: startTs + Math.floor((nowTs - startTs) * (j / (steps + 1)) * (0.8 + rnd() * 0.3)), pos: p.id, lvl: null, pct: cur - (steps - j) * 12.5 });
      e.hist = hist;
    });
    // docházka po měsících do včerejška
    for (let m = mAdd(m0, -3); m <= m0; m = mAdd(m, 1)) {
      const [y, mm] = m.split('-').map(Number);
      const len = new Date(y, mm, 0).getDate();
      const days = Array.from({ length: len }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`);
      const rows = {};
      Object.values(S.employees).forEach(e => {
        const h = []; const c = [];
        days.forEach(iso => {
          const d = mkDay(y, mm, +iso.slice(8));
          if (iso >= today || !d.work) { h.push(0); c.push(null); return; }
          const r = rnd();
          if (r < 0.03) { h.push(0); c.push('D'); } else if (r < 0.06) { h.push(0); c.push('NEM'); } else if (r < 0.07) { h.push(0); c.push('A'); } else { h.push(r < 0.5 ? 7.5 : 8); c.push(null); }
        });
        rows[e.key] = { first: e.first, last: e.last, h, c };
      });
      S.periods[m] = { id: m, y, m: mm, days, rows, codes: {}, file: `dochazka-${m}.xlsx`, at: Date.now(), headerRow: 1 };
    }
    // evidence práce s normou za dva minulé měsíce: zkušení zhruba 1,1 h normy na hodinu, ostatní 0,7 (o měsíc dřív o 5 % méně)
    const pm = mAdd(m0, -1);
    [[mAdd(m0, -2), 0.95], [pm, 1]].forEach(([mm, f]) => {
      const names = {};
      Object.values(S.employees).forEach(e => {
        const p = S.positions.find(x => x.id === e.positionId);
        const row = S.periods[mm].rows[e.key];
        if (!p || !row) return;
        const hours = row.h.reduce((a, v, i) => a + (row.c[i] ? 0 : v), 0);
        const norm = Math.round(hours * 60 * f * (skillPct(e, p) >= 75 ? 1.1 : 0.7));
        const nm = `${e.first} ${e.last}`;
        names[nm.toLowerCase()] = { name: nm, total: 10, count: 5, days: {}, spent: norm, norm, nspent: norm };
        S.prodMap[nm.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')] = e.key;   // spárování jména z evidence práce
      });
      S.production[mm] = { id: mm, names, records: 100, total: 100, file: 'evidence.xlsx', at: Date.now(), time: true };
    });
    S = sanitizeState(S);
    save();
    renderAll();
    return { today, from, m0, pm };
  }, { LAST, FIRST });
  await saved(page);

  // Záložka v Auditu (nepotřebuje obsazenost ani výkaz práce): stránky reportu jako vzor (2.31).
  await page.click('#nav [data-view="audit"]');
  await page.click('#waTabs [data-watab="kapacity"]');
  await page.waitForSelector('#waView .ctr-paper');
  const x = await page.evaluate(() => { const r = waCtRange(); const t = capTimeline(r.from, r.to);
    return { r, real: t.real.n, plan: t.plan.n, lastReal: t.lastReal, firstPlan: t.firstPlan, start: t.start.tot, end: t.end.tot, dev: t.dev.length, newOk: t.newOk,
      req: t.total.req, met: t.total.met, perf: !!t.perf, weeks: t.weeks.length, pastPlan: t.pastPlan.length, noGroup: t.noGroup,
      pages: capReportPages(r.from, r.to).map(p => `${p.kind}:${p.id}`), week: isoWeek(todayIso()).id }; });
  check(x.r.from === seed.from && x.real > 40 && x.plan > 15, `výchozí období a dny: ${JSON.stringify(x)}`);
  check(x.lastReal < seed.today && x.firstPlan >= seed.today && x.pastPlan === 0, `vykázáno do včerejška, plán od dneška: ${x.lastReal} / ${x.firstPlan}`);
  check(x.dev >= 10 && x.newOk >= 1 && x.end.ok > x.start.ok, `vývoj zaškolení: ${JSON.stringify([x.dev, x.newOk, x.start, x.end])}`);
  check(x.perf && x.noGroup === 2, `výkon z evidence práce a lidé bez skupiny: ${x.perf} ${x.noGroup}`);
  check(x.pages.filter(p => p.startsWith('month:')).length === 5 && x.pages.filter(p => p.startsWith('week:')).length >= 17, `stránky: ${x.pages.join(' ')}`);
  const navN = await page.locator('#waView .ctr-nav [data-wactpage]').count();
  check(navN === x.pages.length + 1, `výběr stránek: ${navN} ≠ ${x.pages.length + 1}`);
  // měsíční souhrn aktuálního měsíce (výchozí stránka)
  const MON = await page.evaluate(() => { const m = monthLabel(todayIso().slice(0, 7)); return m.charAt(0).toUpperCase() + m.slice(1); });
  check(await page.getAttribute('#waView .ctr-paper', 'data-ctrpage') === 'month', 'výchozí stránka je měsíční souhrn');
  let text = (await page.textContent('#waView .ctr-paper')).replace(/\s+/g, ' ');
  ['Report docházky', `Měsíční souhrn — ${MON}`, 'HALA 2 · měsíční souhrn zaškolenosti a výkonu', 'PODÍL ZAŠKOLENÝCH', 'Lidí ve skupinách', 'Zaškolení', 'V zácviku',
    'Výkon na hodinu (index)', 'Zaškolený proti zácviku', 'Lidé ve skupinách: zaškolení a v zácviku', 'Výkon na odpracovanou hodinu (index, Ø', `Po skupinách — ${MON}`,
    'ZAŠK. PROTI', 'VÝKON CELKEM', 'zatím bez lidí v matici dovedností — doplnit', 'Bez skupiny', '2 lidé se směnou bez skupiny', 'CELKEM', 'Zaškolený —', 'Výkon —', 'Vygenerováno']
    .forEach(t => check(text.includes(t), `měsíc: chybí „${t}“`));
  // pruh jen když měsíc má plánované dny (poslední den měsíce o víkendu už žádný nemá)
  const mPlan = await page.evaluate(() => !!capMonthReport(todayIso().slice(0, 7)).plan);
  if (mPlan) check(/VYKÁZÁNO A PLÁN · docházka je nahraná do|PLÁN · docházka za/.test(text), 'měsíc: pruh vykázáno a plán');
  else check(!/VYKÁZÁNO A PLÁN/.test(text), 'měsíc bez plánovaných dnů: bez pruhu');
  const mRows = await page.$$eval('#waView .ctr-tab tbody tr', rows => rows.map(r => r.cells[0].textContent.trim()));
  check(JSON.stringify(mRows) === JSON.stringify(['Brus', 'CNC', 'Písek', 'Lepení', 'Bez skupiny', 'CELKEM']), `měsíc: řádky ${mRows}`);
  const mTot = await page.evaluate(() => { const r = capMonthReport(todayIso().slice(0, 7)); return [r.tot.n, r.tot.ok, r.tot.tr]; });
  const sumRow = await page.$$eval('#waView .ctr-tab tr.sum td', tds => tds.slice(1, 4).map(td => +td.textContent.trim()));
  check(JSON.stringify(sumRow) === JSON.stringify(mTot), `měsíc CELKEM ${sumRow} ≠ ${mTot}`);
  check(await page.locator('#waView .ctr-chart svg').count() === 2 && await page.locator('#waView .ctr-chart polyline').count() >= 3, 'měsíc: dva grafy, tři čáry výkonu');
  await page.hover('#waView .ctr-chart .ctr-hit >> nth=2');
  await page.waitForSelector('#waView .ctr-chart .chart-tip:not([hidden])');
  const tip = await page.textContent('#waView .ctr-chart .chart-tip:not([hidden])');
  check(/\d+ (lidí|lidé) ve skupinách, \d+ zaškolených \(\d+ %\), \d+ v zácviku/.test(tip), `tooltip: ${tip}`);
  check(await page.evaluate(() => getComputedStyle(document.querySelector('.ctr-paper')).fontFamily.includes('Plex')) &&
    await page.evaluate(() => getComputedStyle(document.querySelector('.ctr-tile .v')).fontFamily.includes('Plex Mono')), 'písma Plex a Plex Mono');
  check(await overflow(page) <= 1, `monitor: přetečení ${await overflow(page)} px`);
  // záhlaví reportu (uloží se)
  await page.fill('#waRepPlace', 'Provoz Sever');
  await page.press('#waRepPlace', 'Tab');
  await page.waitForFunction(() => S.workAudit.rep.place === 'Provoz Sever');
  check(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'waRepFirm', 'Tab po změně názvu skončí ve Firmě');
  await page.fill('#waRepFirm', '  Ukázková   firma s.r.o. ');
  await page.press('#waRepFirm', 'Enter');
  await page.locator('#waRepFirm').blur();
  await page.waitForFunction(() => S.workAudit.rep.firm === 'Ukázková firma s.r.o.');
  await saved(page);
  text = (await page.textContent('#waView .ctr-paper')).replace(/\s+/g, ' ');
  check(text.includes('Report docházky — Provoz Sever') && text.includes('HALA 2 · Ukázková firma s.r.o. · měsíční souhrn'), `záhlaví: ${text.slice(0, 160)}`);
  await page.screenshot({ path: path.join(shots, '01-mesic.png'), fullPage: true });
  // týdenní souhrn: aktuální týden (vykázáno a plán) a celý minulý týden (jen vykázáno)
  await page.click(`#waView [data-wactpage="week:${x.week}"]`);
  await page.waitForSelector('#waView .ctr-paper[data-ctrpage="week"]');
  text = (await page.textContent('#waView .ctr-paper')).replace(/\s+/g, ' ');
  const W = x.week.slice(-2).replace(/^0/, '');
  ['Report docházky — Provoz Sever', 'denní požadavek (norma) 22 · víkendy mimo', `Týdenní souhrn — Týden ${W}`, 'NORMA SPLNĚNA', 'ZAŠKOLENÍ NA SMĚNĚ', 'Plnění normy', 'Denní požadavek',
    'Dní v normě', 'Dní pod normou', 'Jednotlivé dny vs. požadavek — z toho zaškolení', 'V zaškolování', 'Požadavek 22', 'Průměr po skupinách', 'Ø PLÁN', 'STAV / ZAŠKOLENÍ', 'zaškolení', 'zaškolených', 'CELKEM']
    .forEach(t => check(text.includes(t), `týden: chybí „${t}“`));
  check(/OK|MÍRNĚ POD|POD PLÁNEM/.test(text), 'týden: stav skupin');
  check(await page.locator('#waView .ctr-chart .ctr-hit').count() === 5 && await page.locator('#waView .ctr-track i').count() === 4, 'týden: pět dní a pruhy zaškolení (3 skupiny + celkem)');
  const wk = await page.evaluate(id => { const r = capWeekReport(id); return { kinds: r.days.map(d => d.kind), tot: r.tot, n: r.n }; }, x.week);
  if (wk.kinds.includes('real') && wk.kinds.includes('plan')) check(text.includes('VYKÁZÁNO A PLÁN'), 'týden: pruh vykázáno a plán');
  check(text.includes(`${wk.tot.met}/${wk.n}`), `týden: dní v normě ${wk.tot.met}/${wk.n}`);
  await page.screenshot({ path: path.join(shots, '02-tyden.png'), fullPage: true });
  const prevWeek = await page.evaluate(id => shiftWeek(id, -1), x.week);
  await page.click(`#waView [data-wactpage="week:${prevWeek}"]`);
  await page.waitForSelector('#waView .ctr-paper[data-ctrpage="week"]');
  check(await page.locator('#waView .ctr-banner').count() === 0, 'minulý týden bez pruhu (celý vykázaný)');
  check(await page.locator('#waView .ctr-chart svg text').filter({ hasText: /·\s\d+ %/ }).count() >= 1, 'popisek zaškolených ve sloupci');
  // vývoj zaškolení
  await page.click('#waView [data-wactpage="dev"]');
  await page.waitForSelector('#waView .ctr-paper[data-ctrpage="dev"]');
  text = (await page.textContent('#waView .ctr-paper')).replace(/\s+/g, ' ');
  check(text.includes('Vývoj zaškolení —') && text.includes('Nově zaškolení') && text.includes('Změny hodnocení po lidech'), 'vývoj: nadpisy');
  const devRows = await page.$$eval('#waView .ctr-tab tbody tr', rows => rows.length);
  check(devRows === x.dev, `vývoj: řádků ${devRows} ≠ ${x.dev}`);
  check(LAST.some(n => text.includes(n)) && /ID 10\d\d/.test(text), 'vývoj v aplikaci se jmény a ID');
  await page.screenshot({ path: path.join(shots, '03-vyvoj.png'), fullPage: true });

  // PDF: stránky podle vzoru (A4 na výšku), jen ID (bez jmen), písmo Plex Mono.
  const pdf = await download(page, '[data-wactpdf]', 'kapacity.pdf');
  check(pdf.head === '%PDF-' && /^kapacity-zaskoleni-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.pdf$/.test(pdf.name), `PDF ${pdf.name}`);
  const raw = fs.readFileSync(pdf.path).toString('latin1');
  check(/PlexMono/.test(raw) || /IBMPlexMono/.test(raw), 'PDF má písmo Plex Mono');
  check(/\/MediaBox \[0 0 595\.2\d* 841\.8\d*\]/.test(raw), 'PDF A4 na výšku');
  const pages = pdfText(pdf.path);
  if (pages) {
    const t = pages.join(' ').replace(/\s+/g, ' ');
    ['Report docházky — Provoz Sever', 'HALA 2 · Ukázková firma s.r.o.', 'Měsíční souhrn —', 'PODÍL ZAŠKOLENÝCH', 'Lidí ve skupinách', 'Zaškolený proti zácviku', 'Po skupinách —',
      'Týdenní souhrn — Týden', 'NORMA SPLNĚNA', 'ZAŠKOLENÍ NA SMĚNĚ', 'Průměr po skupinách', 'Vývoj zaškolení —', 'ID 10', 'CELKEM', 'Vygenerováno', 'Strana 1 /']
      .forEach(s => check(t.includes(s), `PDF obsahuje „${s}“`));
    check(!LAST.some(n => t.includes(n)), 'PDF bez příjmení (jen ID)');
    check(pages.length >= x.pages.length + 1, `PDF má ${pages.length} stran, stránek reportu ${x.pages.length + 1}`);
    const firstMonth = pages.findIndex(p => /Měsíční souhrn —/.test(p));
    check(firstMonth === 0 && /Týdenní souhrn/.test(pages[1]), 'PDF: měsíc a za ním jeho týdny');
  }
  pdfPng(pdf.path, path.join(shots, 'pdf'));

  // Excel: listy a součty proti výpočtu.
  const xl = await download(page, '[data-wactxlsx]', 'kapacity.xlsx');
  check(xl.head.startsWith('PK') && /^kapacity-zaskoleni-.*\.xlsx$/.test(xl.name), `Excel ${xl.name}`);
  const book = await page.evaluate(async b64 => {
    const X = await xlsx();
    const wb = X.read(Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)), { type: 'array' });
    const sum = X.utils.sheet_to_json(wb.Sheets['Souhrn'], { header: 1 });
    const hdr = sum.findIndex(r => r[0] === 'Oddělení');
    const tot = sum.find(r => r[1] === 'Všechny skupiny');
    const r = waCtRange(); const t = capTimeline(r.from, r.to);
    const dev = X.utils.sheet_to_json(wb.Sheets['Vývoj zaškolení'], { header: 1 });
    return { names: wb.SheetNames, lidi: tot[sum[hdr].indexOf('Lidí na konci')], ok: tot[sum[hdr].indexOf('Zkušení')], realH: tot[sum[hdr].indexOf('Odpracováno h')],
      exp: [t.end.tot.n, t.end.tot.ok, Math.round(t.real.tot.realH * 100) / 100], devRows: dev.filter(r => r[2] && /^\d+$/.test(String(r[2]))).length, devExp: t.dev.length };
  }, fs.readFileSync(xl.path).toString('base64'));
  check(JSON.stringify(book.names) === JSON.stringify(['Souhrn', 'Po dnech', 'Po týdnech', 'Po měsících', 'Vývoj zaškolení']), `listy ${book.names}`);
  check(JSON.stringify([book.lidi, book.ok, book.realH]) === JSON.stringify(book.exp), `Excel Souhrn ${[book.lidi, book.ok, book.realH]} ≠ ${book.exp}`);
  check(book.devRows === book.devExp, `Excel Vývoj zaškolení: ${book.devRows} ≠ ${book.devExp}`);

  // Hranice zaškolení (2.33): vlastní procento v Nastavení Auditu platí pro celý report (aplikace, PDF, Excel).
  const M0 = await page.evaluate(() => todayIso().slice(0, 7));
  await page.click(`#waView .ctr-nav [data-wactpage="month:${M0}"]`);
  await page.waitForSelector('#waView .ctr-paper[data-ctrpage="month"]');
  const before = await page.evaluate(m => { const r = capMonthReport(m); return { tr: waTrain(), ok: r.tot.ok, tr2: r.tot.tr }; }, M0);
  check(before.tr.pct === before.tr.thr * 25 && !before.tr.own, `výchozí hranice podle Matice: ${JSON.stringify(before.tr)}`);
  check((await page.textContent('#waView .ctr-train')).includes(`Zaškolený od ${before.tr.pct} % dovedností skupiny, pod ${before.tr.pct} % v zaškolení (podle Matice dovedností, úroveň ${before.tr.thr})`), 'Kapacity: hranice podle Matice');
  await page.click('#waView .ctr-train [data-watabgo="nastaveni"]');
  await page.waitForSelector('#waTrainPct');
  check(await page.evaluate(() => ui.wa.tab === 'nastaveni' && document.activeElement && document.activeElement.id === 'waTrainPct'), 'odkaz Změnit v Nastavení skočí na pole hranice');
  check(await page.getAttribute('#waTrainPct', 'placeholder') === String(before.tr.pct) && await page.inputValue('#waTrainPct') === '', 'prázdné pole s výchozí hodnotou z Matice');
  await page.fill('#waTrainPct', '150');
  await page.press('#waTrainPct', 'Tab');
  await page.waitForFunction(() => /Hranice zaškolení je celé procento/.test(document.querySelector('#toast').textContent));
  check(await page.evaluate(() => S.workAudit.trainPct === null) && await page.inputValue('#waTrainPct') === '', 'neplatná hranice se neuloží');
  await page.fill('#waTrainPct', '50 %');
  await page.press('#waTrainPct', 'Tab');
  await page.waitForFunction(() => S.workAudit.trainPct === 50);
  await saved(page);
  check(/Hranice zaškolení: od 50 % dovedností skupiny\./.test(await page.textContent('#toast')), 'hláška po uložení hranice');
  check((await page.textContent('#waTrainCard')).includes('Zaškolený od 50 % dovedností skupiny, pod 50 % v zaškolení (nastaveno v Auditu)'), 'Nastavení: hranice slovy');
  await page.locator('#waTrainCard').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shots, '06-hranice-nastaveni.png'), fullPage: false });
  await page.click('#waTabs [data-watab="kapacity"]');
  await page.waitForSelector('#waView .ctr-paper[data-ctrpage="month"]');
  const after = await page.evaluate(m => { const r = capMonthReport(m); return { ok: r.tot.ok, tr: r.tot.tr, n: r.tot.n }; }, M0);
  check(after.ok >= before.ok && after.ok + after.tr === before.ok + before.tr2 && after.ok > before.ok, `nižší hranice = víc zaškolených: ${JSON.stringify([before, after])}`);
  text = (await page.textContent('#waView .ctr-paper')).replace(/\s+/g, ' ');
  check(text.includes('procento dovedností skupiny v matici dovedností aspoň 50 % (hranice zaškolení z nastavení Auditu)') && text.includes('V zácviku = zařazen ve skupině, pod 50 %'), `měsíc: poznámka s hranicí ${text.slice(-700)}`);
  const sumRow2 = await page.$$eval('#waView .ctr-tab tr.sum td', tds => tds.slice(1, 4).map(td => +td.textContent.trim()));
  check(JSON.stringify(sumRow2) === JSON.stringify([after.n, after.ok, after.tr]), `měsíc CELKEM s hranicí ${sumRow2}`);
  await page.screenshot({ path: path.join(shots, '07-hranice-mesic.png'), fullPage: true });
  await page.click(`#waView [data-wactpage="week:${x.week}"]`);
  await page.waitForSelector('#waView .ctr-paper[data-ctrpage="week"]');
  check((await page.textContent('#waView .ctr-paper')).replace(/\s+/g, ' ').includes('aspoň 50 % dovedností skupiny (hranice zaškolení z nastavení Auditu)'), 'týden: poznámka s hranicí');
  await page.click('#waView [data-wactpage="dev"]');
  await page.waitForSelector('#waView .ctr-paper[data-ctrpage="dev"]');
  check((await page.textContent('#waView .ctr-paper')).replace(/\s+/g, ' ').includes('aspoň 50 % (hranice zaškolení z nastavení Auditu)'), 'vývoj: poznámka s hranicí');
  const pdf2 = await download(page, '[data-wactpdf]', 'kapacity-hranice.pdf');
  const pages2 = pdfText(pdf2.path);
  if (pages2) check(pages2.join(' ').replace(/\s+/g, ' ').includes('aspoň 50 %'), 'PDF: poznámky s hranicí 50 %');
  const xl2 = await download(page, '[data-wactxlsx]', 'kapacity-hranice.xlsx');
  const book2 = await page.evaluate(async b64 => {
    const X = await xlsx();
    const wb = X.read(Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)), { type: 'array' });
    const sum = X.utils.sheet_to_json(wb.Sheets['Souhrn'], { header: 1 });
    const hdr = sum.findIndex(r => r[0] === 'Oddělení'), tot = sum.find(r => r[1] === 'Všechny skupiny');
    const r = waCtRange(), t = capTimeline(r.from, r.to);
    return { note: sum.slice(0, 4).map(r => r[0]).join(' '), ok: tot[sum[hdr].indexOf('Zkušení')], exp: t.end.tot.ok };
  }, fs.readFileSync(xl2.path).toString('base64'));
  check(book2.note.includes('aspoň 50 % (hranice zaškolení z nastavení Auditu') && book2.ok === book2.exp, `Excel s hranicí: ${JSON.stringify(book2)}`);
  // prázdné pole = zpátky podle Matice
  await page.click('#waTabs [data-watab="nastaveni"]');
  await page.fill('#waTrainPct', '');
  await page.press('#waTrainPct', 'Tab');
  await page.waitForFunction(() => S.workAudit.trainPct === null);
  await saved(page);
  check((await page.textContent('#waTrainCard')).includes('(podle Matice dovedností, úroveň'), 'prázdná hranice = podle Matice');
  await page.click('#waTabs [data-watab="kapacity"]');
  await page.waitForSelector('#waView .ctr-paper');
  check(await page.evaluate(m => capMonthReport(m).tot.ok, M0) === before.ok, 'po vrácení stejný počet zaškolených jako na začátku');

  // Vlastní období: jen budoucnost = jen plán.
  const fut = { from: await page.evaluate(() => addDays(todayIso(), 40)), to: await page.evaluate(() => addDays(todayIso(), 70)) };
  await page.fill('#waCtFrom', fut.from);
  await page.fill('#waCtTo', fut.to);
  await page.click('[data-waapply="waCt"]');
  await page.waitForSelector('#waView .ctr-paper');
  check(await page.evaluate(() => ui.wa.ctPre) === 'custom', 'vlastní období');
  await page.click('#waView .ctr-nav [data-wactpage^="month:"] >> nth=0');
  await page.waitForSelector('#waView .ctr-paper[data-ctrpage="month"]');
  const ft = (await page.textContent('#waView .ctr-paper')).replace(/\s+/g, ' ');
  check(/PLÁN · \S+ ještě nezačal/.test(ft) && /· plán/.test(ft), `budoucí měsíc jako plán: ${ft.slice(0, 400)}`);
  await page.click('[data-wactpre="m"]');
  await page.waitForSelector('#waView .ctr-paper');
  check(await page.evaluate(() => { const r = waCtRange(); return r.from.endsWith('-01') && r.from.slice(0, 7) === todayIso().slice(0, 7); }), 'předvolba Tento měsíc');
  await page.click('[data-wactpre="b3"]');
  await page.waitForSelector('#waView .ctr-paper');
  await page.click(`#waView [data-wactpage="week:${x.week}"]`);
  await page.waitForSelector('#waView .ctr-paper[data-ctrpage="week"]');

  // Telefon a tmavý režim.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  check(await overflow(page) <= 1, `telefon: přetečení ${await overflow(page)} px`);
  await page.screenshot({ path: path.join(shots, '04-telefon.png'), fullPage: true });
  await page.click('#waTabs [data-watab="nastaveni"]');
  await page.waitForSelector('#waTrainPct');
  await page.locator('#waTrainCard').scrollIntoViewIfNeeded();
  check(await overflow(page) <= 1 && await page.evaluate(() => document.querySelector('#waTrainCard').getBoundingClientRect().width) > 300, 'telefon: hranice zaškolení přes celou šířku');
  await page.screenshot({ path: path.join(shots, '08-hranice-telefon.png'), fullPage: false });
  await page.click('#waTabs [data-watab="kapacity"]');
  await page.waitForSelector('#waView .ctr-paper');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(200);
  check(await page.evaluate(() => getComputedStyle(document.querySelector('.ctr-paper')).backgroundColor) === 'rgb(255, 255, 255)', 'tmavý režim: papír zůstává bílý jako PDF');
  await page.screenshot({ path: path.join(shots, '05-tmavy.png'), fullPage: false });

  await browser.close();
  if (problems.length) { console.log(`PROBLÉMY (${problems.length}):\n- ${problems.join('\n- ')}`); process.exit(1); }
  console.log('e2e Kapacity ok');
})().catch(error => { console.error(error); process.exit(1); });
