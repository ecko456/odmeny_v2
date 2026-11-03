// Prohlížečový průchod 2.45.2: export docházky za měsíc do Excelu a PDF (lidé po odděleních,
// ID, hodiny v pracovní dny, o víkendu a celkem, součty oddělení a CELKEM), telefon.
// Běží nad ukázkovými daty čisté instalace. Spuštění stejně jako e2e_dochazka.js; snímky v $S/oshots-attexp.
const { chromium } = require(process.env.PW);
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-attexp');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
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
  // ID u jednoho člověka, ať je vidět v exportu
  const who = await page.evaluate(() => { const k = Object.keys(curPeriod().rows).find(x => S.employees[x]); S.employees[k].wid = '4711'; return S.employees[k].last; });
  await page.click('#nav [data-view="dochazka"]');
  await page.waitForSelector('#attView [data-attxlsx]');
  const exp = await page.evaluate(() => { const x = attExport(curPeriod()); return { id: x.id, n: x.tot.n, total: x.tot.total, depts: x.depts.map(d => [d.name, d.tot.n, d.tot.total]),
    sum: Math.round(x.people.reduce((t, q) => t + q.total, 0) * 100) / 100, att: Math.round(Object.keys(curPeriod().rows).reduce((t, k) => t + attendance(curPeriod(), k).totalHours, 0) * 100) / 100 }; });
  check(exp.n > 3 && exp.depts.length >= 2 && Math.abs(exp.total - exp.sum) < 0.01 && Math.abs(exp.total - exp.att) < 0.01, `výpočet: ${JSON.stringify(exp)}`);
  check(Math.abs(exp.depts.reduce((t, d) => t + d[2], 0) - exp.total) < 0.01, 'součet oddělení = celkem');
  const bar = (await page.textContent('#attView .att-bar')).replace(/\s+/g, ' ');
  check(bar.includes('odpracováno celkem'), `lišta: ${bar}`);
  await page.screenshot({ path: path.join(shots, '01-dochazka.png') });

  // Excel
  const [dx] = await Promise.all([page.waitForEvent('download'), page.click('[data-attxlsx]')]);
  const xp = path.join(shots, dx.suggestedFilename());
  await dx.saveAs(xp);
  const xl = await page.evaluate(async b64 => {
    const X = await xlsx();
    const wb = X.read(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), { type: 'array' });
    return { names: wb.SheetNames, rows: X.utils.sheet_to_json(wb.Sheets['Docházka'], { header: 1 }), dep: X.utils.sheet_to_json(wb.Sheets['Oddělení'], { header: 1 }), days: X.utils.sheet_to_json(wb.Sheets['Po dnech'], { header: 1 }) };
  }, fs.readFileSync(xp).toString('base64'));
  check(dx.suggestedFilename() === `dochazka-${exp.id}.xlsx` && JSON.stringify(xl.names) === '["Docházka","Po dnech","Oddělení"]', `Excel: ${dx.suggestedFilename()} ${xl.names}`);
  const hdr = xl.rows[2];
  const last = xl.rows[xl.rows.length - 1];
  check(hdr[0] === 'Oddělení' && hdr.includes('ID') && hdr.includes('Hodiny celkem') && last[0] === 'CELKEM' && Math.abs(last[hdr.indexOf('Hodiny celkem')] - exp.total) < 0.01, `Excel řádky: ${JSON.stringify([hdr, last])}`);
  check(xl.rows.some(r => r[2] === '4711' && String(r[1]).startsWith(who) && r[0]), 'Excel: člověk s ID a oddělením');
  check(xl.rows.filter(r => String(r[0]).startsWith('Celkem ')).length === exp.depts.length, 'Excel: součet za každé oddělení');
  check(xl.dep.length === exp.depts.length + 2, `Excel list Oddělení: ${xl.dep.length}`);
  // list Po dnech: den = sloupec, hodnoty proti uložené docházce
  const ref = await page.evaluate(() => { const p = curPeriod(); const k = Object.keys(p.rows).find(x => S.employees[x] && S.employees[x].wid === '4711'); const r = p.rows[k];
    return { n: p.days.length, h: r.h.map(v => +v || 0), c: r.c.map(v => v || ''), d0: p.days[0] }; });
  const dh = xl.days[2];
  const me = xl.days.find(r => r[2] === '4711');
  const dlast = xl.days[xl.days.length - 1];
  check(dh.length === ref.n + 4 && /^1\.\d+\. (Po|Út|St|Čt|Pá|So|Ne)/.test(dh[3]) && dh[dh.length - 1] === 'Hodiny celkem', `Po dnech hlavička: ${dh.slice(0, 6)}`);
  check(me && ref.h.every((h, i) => (ref.c[i] ? String(me[3 + i]).startsWith(ref.c[i]) : h ? me[3 + i] === h : (me[3 + i] == null || me[3 + i] === ''))), `Po dnech člověk: ${JSON.stringify(me && me.slice(0, 12))}`);
  check(dlast[0] === 'CELKEM' && Math.abs(dlast[dlast.length - 1] - exp.total) < 0.01 && Math.abs(dlast.slice(3, -1).reduce((t, v) => t + (+v || 0), 0) - exp.total) < 0.01, `Po dnech CELKEM: ${JSON.stringify(dlast.slice(-4))}`);

  // PDF
  const [dp] = await Promise.all([page.waitForEvent('download'), page.click('[data-attpdf]')]);
  const pp = path.join(shots, dp.suggestedFilename());
  await dp.saveAs(pp);
  check(dp.suggestedFilename() === `dochazka-${exp.id}.pdf` && fs.readFileSync(pp).slice(0, 5).toString() === '%PDF-', `PDF: ${dp.suggestedFilename()}`);
  try {
    const txt = execFileSync('python3', ['-c', 'import sys,pypdf;print("\\n".join(p.extract_text() for p in pypdf.PdfReader(sys.argv[1]).pages))', pp]).toString().replace(/\s+/g, ' ');
    for (const t of ['DOCHÁZKA', 'Docházka —', 'HODINY CELKEM', 'Hodiny po odděleních', 'ZAMĚSTNANEC', 'CELKEM H', 'ID 4711', who, ...exp.depts.map(d => `Celkem ${d[0]}`), 'CELKEM ('])
      check(txt.includes(t), `PDF obsahuje „${t}“`);
  } catch (error) { if (/pypdf/.test(String(error))) console.log('pypdf není, text PDF se nekontroluje'); else problems.push(`PDF: ${error.message}`); }
  try {
    execFileSync('python3', ['-c', `import sys
try:
    import pymupdf
except ImportError:
    sys.exit(0)
d=pymupdf.open(sys.argv[1])
for i,p in enumerate(d): p.get_pixmap(matrix=pymupdf.Matrix(1.5,1.5)).save(sys.argv[2]+'/pdf-%d.png'%(i+1))`, pp, shots]);
  } catch (error) { problems.push(`PDF stránky: ${String(error.stderr || error.message).slice(-300)}`); }

  // telefon
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => showView('dochazka'));
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(ov <= 0, `telefon bez přetečení: ${ov}`);
  await page.screenshot({ path: path.join(shots, '02-telefon.png') });
  await browser.close();
  if (problems.length) { console.log('PROBLÉMY:\n' + problems.join('\n')); process.exit(1); }
  console.log('export docházky ok');
})().catch(e => { console.error(e); process.exit(1); });
