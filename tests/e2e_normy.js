// Prohlížečový průchod 2.74: KPI si samo tvoří normy (čas na kus) z vykázané práce souboru Docházka
// a výkony. Název dílu je v souboru ve sloupci B a nastaví se v okně Jak se soubor načte; normy
// primárně ze zkušených (hodnocení nad 45 %), díl bez zkušených z průměru všech, záznamy do 2 minut ne.
// Ověří záložku Normy (tabulka proti výpočtu, zdroj, hledání, období, Excel), hranici v Nastavení,
// plnění normy ve Výkonnosti na osobu, historii změn a telefon. Hodiny stránky stojí na 20. 11. 2026.
// Spuštění: tests/run_e2e.sh e2e_normy; snímky v $S/oshots-normy. Všechna data jsou vymyšlená.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-normy');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };
const NOW = new Date(2026, 10, 20, 10, 0);
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const text = async (page, sel) => (await page.textContent(sel)).replace(/\s+/g, ' ').trim();

async function makeXlsx(page, sheets) {
  const b64 = await page.evaluate(async sheets => {
    const X = await xlsx();
    const wb = X.utils.book_new();
    sheets.forEach(({ name, rows, dateCol }) => {
      const aoa = rows.map(r => r.map(c => (c && c.d ? new Date(Date.UTC(2026, c.m, c.d, 12)) : c)));
      const ws = X.utils.aoa_to_sheet(aoa);
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

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, reducedMotion: 'reduce' });
  await ctx.clock.setFixedTime(NOW);
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
  const saved = () => page.waitForFunction(() => !store.dirty && !store.saving, null, { timeout: 15000 });
  await saved();
  // skupina Brus s jednou dovedností: 101 = 75 % (zkušený), 102 = 25 %, 103 = 50 % (zkušený, nad 45 %)
  await page.evaluate(() => {
    const st = blank();
    const p = mkPos('g_brus', 'Brus', []); p.dept = 'Brus'; p.skillset = [{ id: 'kb', name: 'Broušení', desc: '', scale: null }]; p.maxTab = 8; p.tiers = [];
    st.positions = [p];
    [['101', 'Adámek', 'Aleš', 3], ['102', 'Bednář', 'Boris', 1], ['103', 'Cibulka', 'Cyril', 2]].forEach(([wid, last, first, lv]) => {
      const key = `${last}|${first}`.toLowerCase();
      st.employees[key] = { key, last, first, positionId: 'g_brus', shift: 'R', note: '', wid, rate: { kb: lv } };
    });
    S = sanitizeState(st);
    save();
    renderAll();
  });
  await saved();

  // soubor: díl ve sloupci B, operace D, hotovo F, čas G (min); 2,5 a 2 minuty se nepočítají, řádek bez kusů taky ne
  const att = [['WPA kód', '17.11. Út', null, '18.11. St', null], [null, 'Příchod', 'Odchod', 'Příchod', 'Odchod'],
    [101, 0.25, 14.5 / 24, 0.25, 14.5 / 24], [102, 0.25, 14.5 / 24, 0.25, 14.5 / 24], [103, 0.25, 14.5 / 24, null, null]];
  const work = [['ID', 'Název dílu', 'Datum', 'Operace', 'V zakázce', 'Hotovo', 'Čas (min)'],
    [101, 'Hřídel H-12', { m: 10, d: 17 }, 'Broušení', 100, 20, 80],
    [101, 'Hřídel H-12', { m: 10, d: 17 }, 'Broušení', 100, 5, 2],
    [103, 'Hřídel H-12', { m: 10, d: 18 }, 'Broušení', 100, 10, 60],
    [102, 'Hřídel H-12', { m: 10, d: 17 }, 'Broušení', 100, 10, 120],
    [101, 'Hřídel H-12', { m: 10, d: 18 }, 'Leštění', 100, 10, 30],
    [102, 'Kryt K-7', { m: 10, d: 17 }, 'Frézování', 40, 8, 96],
    [102, 'Kryt K-7', { m: 10, d: 18 }, 'Frézování', 40, 0, 45],
    [102, 'Kryt K-7', { m: 10, d: 18 }, 'Frézování', 40, 3, 1.5]];
  const file = { name: 'dochazka-vykony-17-18.xlsx', mimeType: XLSX_TYPE, buffer: await makeXlsx(page, [{ name: 'vykázaná práce', rows: work, dateCol: 2 }, { name: 'Docházka', rows: att }]) };

  // ---------- nahrání: sloupce vykázané práce v okně Jak se soubor načte ----------
  await page.evaluate(() => showView('audit'));
  await page.waitForSelector('#view-audit.on #waTabs');
  await page.setInputFiles('#waDvFile', file);
  await page.waitForSelector('#dlg[open] .dv-map');
  for (const [k, v] of [['part', 'B'], ['date', 'C'], ['op', 'D'], ['order', 'E'], ['done', 'F'], ['time', 'G']]) await page.fill(`#dlg [data-dvm="work.${k}"]`, v);
  await page.waitForFunction(() => /Hřídel H-12/.test(document.querySelector('#dvmPrev').textContent), null, { timeout: 10000 })
    .catch(async () => problems.push(`vzor po změně sloupců: ${await text(page, '#dvmPrev')}`));
  await page.screenshot({ path: path.join(shots, '00-nacteni.png') });
  await page.click('#dlgOk');
  await page.waitForSelector('#dlg[open] .dv-imp');
  await page.click('#dlgOk');
  await page.waitForFunction(() => !document.querySelector('#dlg[open]'));
  await saved();
  check(await page.evaluate(() => S.workAudit.dv.cols.work.part === 'B' && !!S.workAudit.dv.perf['2026-11']), 'sloupec dílu B se zapamatoval, výkony uložené');

  // ---------- záložka Normy ----------
  await page.click('#waTabs [data-watab="normy"]');
  await page.waitForSelector('#waView .nm-tab');
  const ref = await page.evaluate(() => { const x = kpiNorms(); return x.parts.map(p => [p.part, p.norm, p.ops.map(o => [o.op, o.norm, o.src, o.exp.people, o.all.people, o.allNorm])]); });
  // Broušení: zkušení 101 (80 min / 20 ks) a 103 (60 / 10) = 140 / 30 = 4,667; Ø všech i s 102 = 260 / 40 = 6,5
  check(JSON.stringify(ref) === JSON.stringify([['Hřídel H-12', 7.667, [['Broušení', 4.667, 'exp', 2, 3, 6.5], ['Leštění', 3, 'exp', 1, 1, 3]]], ['Kryt K-7', 12, [['Frézování', 12, 'all', 0, 1, 12]]]]), `normy: ${JSON.stringify(ref)}`);
  const ui = await page.evaluate(() => [...document.querySelectorAll('#waView tr.nm-op')].map(r => [r.dataset.nmpart, [...r.cells].map(c => c.textContent.replace(/\s+/g, ' ').trim())]));
  check(ui.length === 3 && ui[0][1][0] === 'Broušení' && /^4,67 min$/.test(ui[0][1][1]) && ui[0][1][2] === '12,9' && /zkušení · 2/.test(ui[0][1][3]) && ui[0][1][4] === '6,5 min' && ui[2][1][1] === '12 min' && /všichni · 1/.test(ui[2][1][3]), `tabulka norem: ${JSON.stringify(ui)}`);
  check(/7,67 min/.test(await text(page, '#waView tr.nm-part[data-nmhead="hřídel h-12"]')), 'díl se dvěma operacemi: součet za díl');
  const tiles = await text(page, '#waView .stats');
  check(/Dílů s normou\s*2/.test(tiles) && /Ze zkušených\s*67 %/.test(tiles) && /Vyřazeno do 2 min\s*2/.test(tiles), `dlaždice: ${tiles}`);
  check(/sloupce B/.test(await text(page, '#waView .nm-lede')) && /nad 45 %/.test(await text(page, '#waView .nm-lede')), 'popis: sloupec dílu a hranice');
  await page.screenshot({ path: path.join(shots, '01-normy.png'), fullPage: true });
  // hledání bez překreslení
  await page.fill('#nmQ', 'leště');
  await page.waitForFunction(() => [...document.querySelectorAll('#waView tr.nm-op')].filter(r => !r.hidden).length === 1);
  check(await page.evaluate(() => document.activeElement && document.activeElement.id === 'nmQ' && document.querySelector('#waView tr.nm-part[data-nmhead="kryt k-7"]').hidden), 'hledání: zůstane fokus, Kryt schovaný');
  await page.fill('#nmQ', 'kryt');
  await page.waitForFunction(() => [...document.querySelectorAll('#waView tr.nm-op')].filter(r => !r.hidden).length === 1 && !document.querySelector('#waView tr.nm-part[data-nmhead="kryt k-7"]').hidden);
  await page.fill('#nmQ', 'nic-takoveho');
  await page.waitForFunction(() => !document.querySelector('#waView .nm-none').hidden);
  await page.fill('#nmQ', '');
  // Excel
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#waView [data-nmxlsx]')]);
  const xp = path.join(shots, 'normy.xlsx');
  await dl.saveAs(xp);
  const book = await page.evaluate(async b64 => { const X = await xlsx(); const wb = X.read(b64, { type: 'base64' }); const r = X.utils.sheet_to_json(wb.Sheets.Normy, { header: 1 }); return [wb.SheetNames, r.length, r[3], r[4]]; }, fs.readFileSync(xp).toString('base64'));
  check(dl.suggestedFilename() === 'normy-vse.xlsx' && JSON.stringify(book[0]) === '["Normy"]' && book[2][2] === 'Norma (min/ks)' && book[3][0] === 'Hřídel H-12' && book[3][1] === 'Broušení' && Math.abs(book[3][2] - 4.67) < 0.01 && book[3][4] === 'zkušení',
    `Excel: ${dl.suggestedFilename()} ${JSON.stringify(book)}`);

  // ---------- Výkonnost na osobu: plnění podle norem systému ----------
  await page.click('#waTabs [data-watab="vykon"]');
  await page.waitForSelector('#waView .kp-tab');
  const kp = await page.evaluate(() => { const x = kpiPerf('2026-11', { sort: 'norm' }); return [x.autoN, x.people.map(p => [p.wid, Math.round(p.v.norm * 10) / 10]).sort()]; });
  // 101: (20 × 4,667 + 10 × 3) / (80 + 30) = 112,1 %; 102: (10 × 4,667 + 8 × 12) / (120 + 96) = 66,1 %; 103: 10 × 4,667 / 60 = 77,8 %
  check(JSON.stringify(kp) === JSON.stringify([3, [['101', 112.1], ['102', 66.1], ['103', 77.8]]]), `plnění podle norem: ${JSON.stringify(kp)}`);
  check(/podle norem, které si systém spočítal sám/.test(await text(page, '#waView .note.i')) && /podle norem systému/.test(await text(page, '#waView .stats')), 'Výkonnost: poznámka a dlaždice o normách systému');

  // ---------- Nastavení: hranice zkušených ----------
  await page.click('#waTabs [data-watab="nastaveni"]');
  await page.waitForSelector('#waNormPct');
  await page.fill('#waNormPct', '100');
  await page.dispatchEvent('#waNormPct', 'change');
  await page.waitForSelector('.toast');
  check(await page.evaluate(() => S.workAudit.normPct) === null, 'neplatná hranice se neuloží');
  await page.fill('#waNormPct', '60');
  await page.dispatchEvent('#waNormPct', 'change');
  await page.waitForFunction(() => S.workAudit.normPct === 60);
  await saved();
  await page.click('#waTabs [data-watab="normy"]');
  await page.waitForSelector('#waView .nm-tab');
  check(await page.evaluate(() => { const o = kpiNorms().parts[0].ops[0]; return o.src === 'exp' && o.exp.people === 1 && o.norm === 4; }) && /nad 60 %/.test(await text(page, '#waView .nm-lede')), 'nad 60 %: Broušení jen ze 101 (80 / 20 = 4)');
  const log = await page.evaluate(() => S.log.filter(x => x.kind === 'workaudit').map(x => x.text));
  check(log.some(t => /KPI – normy ze zkušených: hodnocení nad 45 % → hodnocení nad 60 %/.test(t)), `historie změn: ${JSON.stringify(log)}`);
  // odkaz z popisu do Nastavení na pole
  await page.click('#waView .nm-lede [data-wafocus="waNormPct"]');
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'waNormPct');

  // ---------- telefon ----------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { ui.wa.tab = 'normy'; renderWorkAudit(); });
  await page.waitForSelector('#waView .nm-tab');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(over <= 1, `telefon: stránka nepřetéká (${over} px)`);
  await page.screenshot({ path: path.join(shots, '02-telefon.png'), fullPage: true });

  await browser.close();
  if (problems.length) { console.log('PROBLÉMY:\n' + problems.join('\n')); process.exit(1); }
  console.log('e2e_normy ok');
})().catch(error => { console.error(error); process.exit(1); });
