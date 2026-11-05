// Prohlížečový průchod 2.45.2: export docházky za měsíc do Excelu a PDF, telefon. Od 2.50 Excel
// jeden list po skupinách směn s barvami dnů (ranní, odpolední, přesčas), barvy v kalendáři.
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

  // Excel (2.50): jeden list, lidé po skupinách směn, ve skupině podle příjmení a jména, dny barevně
  const [dx] = await Promise.all([page.waitForEvent('download'), page.click('[data-attxlsx]')]);
  const xp = path.join(shots, dx.suggestedFilename());
  await dx.saveAs(xp);
  const ref = await page.evaluate(() => {
    const p = curPeriod(), x = attShiftSheet(p);
    const k = Object.keys(p.rows).find(y => S.employees[y] && S.employees[y].wid === '4711'), e = S.employees[k], a = attendance(p, k);
    return { n: p.days.length, groups: x.groups.map(g => [g.name, g.people.map(q => q.last + ' ' + q.first)]), total: x.total,
      me: { first: e.first, last: e.last, total: Math.round(a.totalHours * 100) / 100, h: a.cells.map(c => c.h), c: a.cells.map(c => c.c || ''), kind: a.cells.map(c => attDayKind(e, c)) } };
  });
  const xl = await page.evaluate(async b64 => {
    const X = await xlsx();
    const wb = X.read(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), { type: 'array' });
    return { names: wb.SheetNames, rows: X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) };
  }, fs.readFileSync(xp).toString('base64'));
  check(dx.suggestedFilename() === `dochazka-${exp.id}.xlsx` && JSON.stringify(xl.names) === '["Docházka"]', `Excel: ${dx.suggestedFilename()} ${xl.names}`);
  const hdr = xl.rows[3];
  check(hdr[0] === 'Jméno' && hdr[1] === 'Příjmení' && hdr[2] === 'ID' && /Odpracováno/.test(hdr[3]) && hdr.length === 4 + ref.n && /^1\. (Po|Út|St|Čt|Pá|So|Ne)/.test(hdr[4]), `Excel hlavička: ${JSON.stringify(hdr.slice(0, 7))}`);
  const me = xl.rows.find(r => r[2] === '4711');
  check(me && me[0] === ref.me.first && me[1] === ref.me.last && Math.abs(me[3] - ref.me.total) < 0.01
    && ref.me.h.every((h, i) => (ref.me.c[i] ? String(me[4 + i]).startsWith(ref.me.c[i]) : h ? me[4 + i] === h : (me[4 + i] == null || me[4 + i] === ''))), `Excel člověk: ${JSON.stringify(me && me.slice(0, 12))}`);
  const heads = xl.rows.slice(4).filter(r => / · \d+ (člověk|lidé|lidí)$/.test(String(r[0] || ''))).map(r => String(r[0]).split(' · ')[0]);
  check(JSON.stringify(heads) === JSON.stringify(ref.groups.map(g => g[0])) && ref.groups.every(g => g[1].every((nm, i, a) => !i || nm.localeCompare(a[i - 1], 'cs') >= 0)), `skupiny směn: ${JSON.stringify(heads)} / ${JSON.stringify(ref.groups.map(g => g[0]))}`);
  const tot = xl.rows.find(r => r[0] === 'CELKEM') || [];
  check(tot[0] === 'CELKEM' && Math.abs(tot[3] - exp.total) < 0.01 && Math.abs(tot.slice(4).reduce((t, v) => t + (+v || 0), 0) - exp.total) < 0.01, `Excel CELKEM: ${JSON.stringify(tot.slice(0, 6))}`);
  // barvy: openpyxl čte soubor jako Excel (výplň buněk člověka podle druhu dne)
  try {
    const fills = JSON.parse(execFileSync('python3', ['-c', `import sys,json,openpyxl
ws=openpyxl.load_workbook(sys.argv[1]).active
row=next(r for r in ws.iter_rows() if r[2].value=='4711')
print(json.dumps([c.fill.fgColor.rgb if c.fill and c.fill.fill_type=='solid' else None for c in row[4:]]))`, xp]).toString());
    const want = { am: 'FFCFE2F8', pm: 'FFD3F0E0', ot: 'FFE4DAF7', abs: 'FFFBEBC8', miss: 'FFF9D9D9', off: 'FFF4F4F4', work: 'FFE6ECEA' };
    check(fills.length === ref.n && ref.me.kind.every((k, i) => fills[i] === want[k]), `barvy dnů: ${JSON.stringify(fills.slice(0, 10))} / ${JSON.stringify(ref.me.kind.slice(0, 10))}`);
    check(ref.me.kind.some(k => k === 'am' || k === 'pm'), `ukázka má ranní nebo odpolední: ${ref.me.kind}`);
  } catch (error) { if (/openpyxl/.test(String(error.stderr || error))) console.log('openpyxl není, barvy se nekontrolují'); else problems.push(`barvy: ${String(error.stderr || error.message).slice(-300)}`); }
  // aplikace: kalendář s barvami směn
  const cal = await page.evaluate(() => ({ am: document.querySelectorAll('#attView .cell.sh-am').length, pm: document.querySelectorAll('#attView .cell.sh-pm').length, drop: !!document.querySelector('#drop'), help: /XLSX, XLSM/.test(document.querySelector('#view-dochazka').textContent) }));
  check(cal.am + cal.pm > 0 && !cal.drop && !cal.help, `kalendář: ${JSON.stringify(cal)}`);

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
