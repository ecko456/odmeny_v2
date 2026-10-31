// Prohlížečový průchod: Report docházky v Auditu (verze 2.40), plnění denního požadavku z nahraných
// příchodů po vzoru reportu uživatele: Den, Týden, Měsíc, Rok, výrok, ukazatel, dlaždice, graf,
// tabulka po skupinách, PDF (A4 na výšku, text přes pypdf, když je), Excel, telefon a tmavý režim.
// Všechna data jsou vymyšlená (bez názvu organizace). Hodiny stránky stojí na pátku 30. 10. 2026 v 10:00.
// Spuštění stejně jako e2e_browser.js:
//   ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t . dev-router.php &
//   curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state
//   NO_PROXY=127.0.0.1 PW=$(npm root -g)/playwright S=$S node tests/e2e_report.js
// Snímky jsou v $S/oshots-report.
const { chromium } = require(process.env.PW);
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-report');
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
const pdfText = file => {
  try { return execFileSync('python3', ['-c', 'import sys,pypdf;print("\\n".join(p.extract_text() for p in pypdf.PdfReader(sys.argv[1]).pages))', file]).toString(); } catch (error) { return null; }
};

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.clock.setFixedTime(NOW);
  const page = await ctx.newPage();
  await watch(page, 'report');
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
  await page.waitForSelector('#view-prehled.on');
  await saved(page);

  // Tři skupiny: Brus 8 lidí (plán z Plánu kapacit 10), Lepení 4, CNC 3; jeden vedoucí, jeden nemocný.
  // Požadavek 14 lidí na den. Příchody 26.–30. 10. (28. 10. je svátek, příchody = přesčas mimo normu),
  // 31. 10. (sobota) dva lidé, 2.–6. 11. bez dat (budoucnost = plán).
  await page.evaluate(() => {
    const st = blank();
    const grp = (id, name, dept) => { const p = mkPos(id, name, []); p.dept = dept; p.skillset = [{ id: `${id}s0`, name: 'Práce', desc: '', scale: null }]; p.maxTab = 8; p.tiers = []; return p; };
    st.positions = [grp('g_brus', 'Brus', 'Brus'), grp('g_lep', 'Lepení', 'Lepení'), grp('g_cnc', 'CNC', 'Obrobna')];
    let w = 300;
    const add = (g, n) => { for (let i = 0; i < n; i += 1) { w += 1; const key = `p${w}|jan`; st.employees[key] = { key, last: `P${w}`, first: 'Jan', positionId: g, shift: 'R', note: '', wid: String(w), rate: { [`${g}s0`]: 2 } }; } };
    add('g_brus', 8); add('g_lep', 4); add('g_cnc', 3);
    st.employees['p301|jan'].lead = ['Brus'];
    st.employees['p302|jan'].sick = '2026-10-29';
    S = sanitizeState(st);
    S.capPlan.groups.g_brus = { n: 10, l2: 0, l3: 0, l4: 0 };
    S.workAudit.target = 14;
    const pres = (iso, wids) => { S.workAudit.dv.pres[iso] = Object.fromEntries(wids.map(x => [String(x), [360, 870]])); };
    const all = Array.from({ length: 15 }, (_, i) => 301 + i);
    pres('2026-10-26', all);                                        // 14 bez vedoucího = splněno
    pres('2026-10-27', all.filter(x => ![303, 304].includes(x)));   // 12 = nesplněno
    pres('2026-10-28', [303, 304, 305]);                            // svátek, mimo normu
    pres('2026-10-29', all.filter(x => x !== 302));                 // 13 = nesplněno (302 nemocný)
    pres('2026-10-30', [...all.filter(x => x !== 302), 999]);       // 13 + neznámé ID = 14 splněno
    pres('2026-10-31', [303, 304]);                                 // sobota
    save(); renderAll();
  });
  await saved(page);
  const exp = await page.evaluate(() => {
    const d = drReport('day', '2026-10-30');
    const w = drReport('week', '2026-10-30');
    const m = drReport('month', '2026-10-15');
    const nw = drReport('week', '2026-11-03');
    const y = drReport('year', '2026-05-01');
    return {
      day: [d.d.kind, d.d.done, d.d.plan, d.req, d.d.met, d.d.rows.map(r => [r.name, r.plan, r.done, r.note])],
      week: [w.n, w.met, Math.round(w.pct), w.weekend, w.nf, w.trend.map(p => [p.iso, p.value, p.kind, p.met])],
      month: [m.n, m.met, m.noData], next: [nw.onlyPlan, nw.nf, nw.futMet, nw.groupsPlan.map(g => [g.name, g.avgDone])],
      year: [y.n, y.trend[9].value, y.trend[9].kind, y.trend[10].kind, y.trend[0].kind],
    };
  });
  // den 30. 10.: Brus plán 10 (Plán kapacit), přišlo 6 (301 vedoucí, 302 nemocný), Lepení 4/4, CNC 3/3, neznámé ID 1
  check(JSON.stringify(exp.day) === JSON.stringify(['real', 14, 17, 14, true, [['Brus', 10, 6, 'nemoc 1'], ['Lepení', 4, 4, ''], ['CNC', 3, 3, ''], ['Neznámé ID', 0, 1, '']]]), `den: ${JSON.stringify(exp.day)}`);
  check(JSON.stringify(exp.week.slice(0, 5)) === JSON.stringify([4, 2, 50, 2, 0]), `týden: ${JSON.stringify(exp.week)}`);
  check(JSON.stringify(exp.week[5].map(p => p[0])) === JSON.stringify(['2026-10-26', '2026-10-27', '2026-10-29', '2026-10-30']), 'v týdnu jen pracovní dny');
  check(JSON.stringify(exp.month) === JSON.stringify([4, 2, 17]), `měsíc: ${JSON.stringify(exp.month)}`);
  check(exp.next[0] && exp.next[1] === 5 && exp.next[2] === 5 && JSON.stringify(exp.next[3]) === JSON.stringify([['Brus', 9], ['Lepení', 4], ['CNC', 3]]), `příští týden = plán bez nemocného: ${JSON.stringify(exp.next)}`);
  check(exp.year[2] === 'real' && Math.round(exp.year[1]) === 50 && exp.year[3] === 'plan' && exp.year[4] === 'empty', `rok: ${JSON.stringify(exp.year)}`);

  // Audit → Report docházky, den
  await page.click('#nav [data-view="audit"]');
  await page.click('[data-watab="report"]');
  await page.waitForSelector('.dr-paper');
  check(/SPLNĚNO/.test(await text(page, '.dr-verdict')) && /14\s*reálně dodáno/.test(await text(page, '.dr-verdict')), `výrok dne: ${await text(page, '.dr-verdict')}`);
  check(/nemoc 1/.test(await text(page, '.dr-tab')) && /Neznámé ID/.test(await text(page, '.dr-tab')), 'tabulka dne s poznámkou a neznámým ID');
  check(!/P30\d/.test(await text(page, '.dr-paper')), 'v reportu nejsou jména');
  await page.screenshot({ path: path.join(shots, '01-den.png'), fullPage: true });
  // předchozí den = 29. 10. nesplněno, poznámka s ID
  await page.click('[data-drshift="-1"]');
  check(/NESPLNĚNO/.test(await text(page, '.dr-verdict')) && /Chybí 1 člověka/.test(await text(page, '.dr-verdict')), `29. 10.: ${await text(page, '.dr-verdict')}`);
  // týden
  await page.click('[data-drmode="week"]');
  check(/NORMA NESPLNĚNA/.test(await text(page, '.dr-verdict')) && /50\s*%/.test(await text(page, '.dr-verdict')), `týden: ${await text(page, '.dr-verdict')}`);
  check(/Docházka o víkendu nebo ve svátek: 2 dny/.test(await text(page, '.dr-paper')), 'týden: přesčas o svátku a víkendu');
  await page.screenshot({ path: path.join(shots, '02-tyden.png'), fullPage: true });
  // příští týden = plán
  await page.click('[data-drshift="1"]');
  check(/PLÁNOVANÁ KAPACITA/.test(await text(page, '.dr-verdict')) && /100\s*%/.test(await text(page, '.dr-verdict')), `příští týden: ${await text(page, '.dr-verdict')}`);
  // měsíc a rok, datum z klávesnice
  await page.click('[data-drmode="month"]');
  await page.fill('#drDate', '2026-10-15');
  await page.press('#drDate', 'Enter');
  await page.waitForFunction(() => ui.wa.dr.ref === '2026-10-15');
  check(/Říjen 2026/.test(await text(page, '.dr-per')) && /Bez nahraných příchodů: 17 pracovních dní/.test(await text(page, '.dr-paper')), `měsíc: ${await text(page, '.dr-per')}`);
  await page.screenshot({ path: path.join(shots, '03-mesic.png'), fullPage: true });
  await page.click('[data-drmode="year"]');
  check(/Rok 2026/.test(await text(page, '.dr-per')) && /Plnění normy v roce 2026/.test(await text(page, '.dr-card')), 'rok');
  await page.screenshot({ path: path.join(shots, '04-rok.png'), fullPage: true });

  // PDF a Excel (den 30. 10.)
  await page.click('[data-drmode="day"]');
  await page.click('[data-drtoday]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-drpdf]')]);
  const pdfPath = path.join(shots, dl.suggestedFilename());
  await dl.saveAs(pdfPath);
  check(dl.suggestedFilename() === 'report-dochazky-2026-10-30.pdf' && fs.readFileSync(pdfPath).slice(0, 5).toString() === '%PDF-', `PDF: ${dl.suggestedFilename()}`);
  const txt = pdfText(pdfPath);
  if (txt == null) console.log('pypdf není, text PDF se nekontroluje');
  else check(/Report docházky/.test(txt) && /Denní report/.test(txt) && /SPLNĚNO/.test(txt) && /Rozpad po skupinách/.test(txt) && /nemoc 1/.test(txt) && !/P30\d/.test(txt), `text PDF: ${txt.slice(0, 400)}`);
  await page.click('[data-drmode="week"]');
  const [dw] = await Promise.all([page.waitForEvent('download'), page.click('[data-drpdf]')]);
  const pdfW = path.join(shots, dw.suggestedFilename());
  await dw.saveAs(pdfW);
  check(dw.suggestedFilename() === 'report-dochazky-2026-10-26-2026-11-01.pdf', `PDF týdne: ${dw.suggestedFilename()}`);
  const txtW = pdfText(pdfW);
  if (txtW != null) check(/Týdenní souhrn/.test(txtW) && /NORMA NESPLNĚNA/.test(txtW) && /Průměr po skupinách/.test(txtW), `text PDF týdne: ${txtW.slice(0, 300)}`);
  const [dx] = await Promise.all([page.waitForEvent('download'), page.click('[data-drxlsx]')]);
  const xPath = path.join(shots, dx.suggestedFilename());
  await dx.saveAs(xPath);
  const xl = await page.evaluate(async b64 => {
    const X = await xlsx();
    const wb = X.read(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), { type: 'array' });
    return { names: wb.SheetNames, days: X.utils.sheet_to_json(wb.Sheets['Přehled dní'], { header: 1 }), groups: X.utils.sheet_to_json(wb.Sheets.Skupiny, { header: 1 }) };
  }, fs.readFileSync(xPath).toString('base64'));
  check(JSON.stringify(xl.names) === '["Přehled dní","Skupiny"]' && xl.days.length === 8, `Excel: ${JSON.stringify([xl.names, xl.days.length])}`);
  check(JSON.stringify(xl.days[1].slice(0, 8)) === JSON.stringify(['2026-10-26', 'Po', 'skutečnost', 14, 17, 14, 0, 'ano']), `Excel pondělí: ${JSON.stringify(xl.days[1])}`);
  check(xl.days[3][2] === 'víkend / svátek (mimo normu)', `Excel svátek: ${xl.days[3]}`);

  // tmavý režim: papír zůstane bílý
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(150);
  check(await page.$eval('.dr-paper', el => getComputedStyle(el).backgroundColor) === 'rgb(255, 255, 255)', 'papír v tmavém režimu bílý');
  await page.locator('.dr-paper').screenshot({ path: path.join(shots, '05-tmavy.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  // telefon
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  check(await overflow(page) <= 0, `telefon: posun do strany ${await overflow(page)} px`);
  check(await page.$eval('.dr-chart svg', el => el.getBoundingClientRect().width) >= 559, 'telefon: graf má čitelnou šířku (posouvá se v kartě)');
  await page.screenshot({ path: path.join(shots, '06-telefon.png'), fullPage: true });

  await browser.close();
  if (problems.length) { console.log(`PROBLÉMY (${problems.length}):\n${problems.join('\n')}`); process.exit(1); }
  console.log('report docházky ok');
})().catch(error => { console.error(problems.join('\n')); console.error(error); process.exit(1); });
