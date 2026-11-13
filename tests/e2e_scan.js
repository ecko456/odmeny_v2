// Prohlížečový průchod 2.77: Rychlý scan na telefonu. Falešná kamera Chromia ukazuje QR kód
// s odkazem (activeBarcode 7.0.1), ZXing ho přečte; další kódy jdou čtečkou (pole + Enter).
// Ověří: plovoucí menu, pozice (bez ní kamera nejde), hromadné načítání (množství po každém kódu,
// stejný kód se sečte, kód ze štítku v záběru se hned znovu nenačte, úprava množství, neznámý kód,
// odkaz bez activeBarcode), potvrzení do Shortage (poslední záznam, poddíl, záznam pro později,
// evidence pohybu), deník a Excel (openpyxl), bez hromadného načítání zápis hned (Odesláno na WPA
// → díl u nás), Shortage ukáže záznam, historie, vypnutí kamery mimo modul, zabalený seznam,
// monitor a menu. Spuštění: bash tests/run_e2e.sh e2e_scan; snímky v $S/oshots-scanqr.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-scanqr');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };
const L = c => `http://is.example/commission.production.detail/default/1?activeBarcode=${c}&componentProductionId=2`;

/* Falešná kamera: Y4M (šedé snímky) s QR kódem uprostřed, kreslí qrcode-generator z aplikace. */
function qrY4m(text, file) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'static', 'vendor', 'qrcode.js'), 'utf8'), ctx);
  const qr = ctx.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount(), W = 640, H = 480, m = Math.floor(300 / (n + 8)), size = m * n, x0 = (W - size) >> 1, y0 = (H - size) >> 1;
  const Y = Buffer.alloc(W * H, 235);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) for (let dy = 0; dy < m; dy++) Y.fill(16, (y0 + r * m + dy) * W + x0 + c * m, (y0 + r * m + dy) * W + x0 + c * m + m);
  const UV = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), Y, UV]);
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), ...Array(10).fill(frame)]));
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const cam = path.join(shots, 'kamera.y4m');
  qrY4m(L('7.0.1'), cam);
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || '/opt/pw-browsers/chromium',
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${cam}`],
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce', acceptDownloads: true });
  await ctx.grantPermissions(['camera'], { origin: new URL(BASE).origin });
  const page = await ctx.newPage();
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`console: ${msg.text()}`); });
  page.on('pageerror', err => problems.push(`pageerror: ${err.message}`));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`)));
  await page.goto(BASE);
  await page.waitForSelector('#setupForm');
  await page.fill('[name="token"]', fs.readFileSync(path.join(S, 'odme2e', 'setup-token.txt'), 'utf8').trim());
  await page.fill('[name="label"]', 'Skladník');
  await page.click('#setupForm button[type="submit"]');
  await page.waitForSelector('.odm-card');
  await page.check('#saved');
  await page.click('#finish');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on, #view-domu.on');
  const saved = () => page.waitForFunction(() => !store.dirty && !store.saving, null, { timeout: 15000 });
  const dlgOpen = re => page.waitForFunction(r => { const d = document.querySelector('#dlg[open]'); return d && new RegExp(r).test(d.textContent); }, re.source, { timeout: 20000 });
  const dlgClosed = () => page.waitForFunction(() => !document.querySelector('#dlg[open]'));
  const toastHas = re => page.waitForFunction(r => [...document.querySelectorAll('.toast, #toast')].some(t => new RegExp(r).test(t.textContent)), re.source, { timeout: 8000 });
  const over = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await saved();
  // seznam urgentů: Hřídel (7.0.1, zakázka 10 ks), sestava Kryt (7.0.2) s poddílem 9.0.1, TOP Pouzdro (7.0.3)
  await page.evaluate(([a, b, c, s]) => {
    S.shortage = cleanShortage({ ...S.shortage, lists: [{ id: 'shscan1', at: Date.now() - 3600e3, by: 'Plánování', file: 'urgenty.xlsx', items: [
      { order: 'OBJ-1', name: 'Hřídel', ean: '8590000000011', index: 'A', qty: '4', op: 'Broušení', link: a, code: '7.0.1', oqty: 10 },
      { order: 'OBJ-2', name: 'Kryt', ean: '8590000000028', index: 'B', qty: '2', op: 'Montáž', link: b, code: '7.0.2', subs: [{ ean: '8590000000901', link: s, code: '9.0.1', op: 'Leštění' }] },
      { order: 'OBJ-3', name: 'Pouzdro', ean: '8590000000035', index: 'C', qty: '6', op: 'Elox', link: c, code: '7.0.3', top: true }] }] });
    save();
  }, [L('7.0.1'), L('7.0.2'), L('7.0.3'), L('9.0.1')]);
  await saved();

  // ---------- plovoucí menu → Rychlý scan ----------
  await page.click('#fab');
  await page.waitForSelector('#fabMenu [data-fab="scan"]');
  const fabOrder = await page.$$eval('#fabMenu .fab-quick [data-fab]', x => x.map(b => b.dataset.fab));
  check(fabOrder[1] === 'scan', `Rychlý scan v rychlých volbách hned pod hledáním: ${fabOrder}`);
  await page.click('#fabMenu [data-fab="scan"]');
  await page.waitForSelector('#view-scan.on #scHead .sc-hero');
  check(/Zapíše se do seznamu z .* · 3 položky/.test(await page.textContent('#scHead')), `cíl zápisu: ${(await page.textContent('#scHead')).replace(/\s+/g, ' ').slice(0, 200)}`);
  check(await page.isChecked('#scBatchOn'), 'hromadné načítání je zapnuté');
  check((await over()) <= 0, `telefon přetéká o ${await over()} px`);
  await page.screenshot({ path: path.join(shots, '01-start.png'), fullPage: true });
  // bez pozice kamera nejde
  await page.click('[data-sccam]');
  await toastHas(/Nejdřív zadej pozici/);
  check(!(await page.evaluate(() => ui.sc.cam)), 'bez pozice se kamera nezapne');
  await page.fill('#scPos', 'Brus – hala 2');
  await page.waitForFunction(() => P.scanPos === 'Brus – hala 2');

  // ---------- kamera: QR s odkazem → množství ----------
  await page.click('[data-sccam]');
  await dlgOpen(/Množství/);
  const d1 = (await page.textContent('#dlgBody')).replace(/\s+/g, ' ');
  check(/Hřídel/.test(d1) && /EAN 8590000000011/.test(d1) && /obj\. OBJ-1/.test(d1) && /urgentně 4/.test(d1) && /Pozice: Brus – hala 2/.test(d1), `okno množství po načtení z kamery: ${d1.slice(0, 300)}`);
  await page.screenshot({ path: path.join(shots, '02-mnozstvi.png') });
  await page.fill('#dlg [name="qty"]', '5');
  await page.press('#dlg [name="qty"]', 'Enter');
  await dlgClosed();
  await page.waitForFunction(() => ui.sc.batch.length === 1);
  check(JSON.stringify(await page.evaluate(() => ui.sc.batch.map(r => [r.code, r.qty, r.n]))) === JSON.stringify([['7.0.1', 5, 1]]), 'kód z kamery v dávce');
  // štítek je pořád v záběru: znovu se nenačte
  await page.waitForTimeout(4000);
  check(!(await page.locator('#dlg[open]').count()) && (await page.evaluate(() => ui.sc.batch[0].qty)) === 5, 'stejný kód v záběru se hned znovu nenačte');
  await page.screenshot({ path: path.join(shots, '03-kamera.png'), fullPage: true });
  await page.click('[data-sccam]');
  check(!(await page.evaluate(() => ui.sc.cam || !!codeScan)), 'kamera se vypne');

  // ---------- čtečka (pole + Enter): stejný kód se sečte, poddíl, neznámý kód, odkaz bez kódu ----------
  const typed = async (text, qty, re) => {
    await page.fill('#scCode', text);
    await page.press('#scCode', 'Enter');
    await dlgOpen(/Množství/);
    const t = (await page.textContent('#dlgBody')).replace(/\s+/g, ' ');
    if (re) check(re.test(t), `okno množství pro ${text}: ${t.slice(0, 260)}`);
    await page.fill('#dlg [name="qty"]', qty);
    await page.click('#dlgOk');
    await dlgClosed();
  };
  await typed('7.0.1', '3', /v dávce už 5 ks, přičte se/);
  await typed(L('9.0.1'), '2', /poddíl 8590000000901 · sestava Kryt/);
  await typed('X-99', '4', /V seznamu tenhle kód není/);
  // nula nejde
  await page.fill('#scCode', '7.0.3');
  await page.press('#scCode', 'Enter');
  await dlgOpen(/Množství/);
  await page.fill('#dlg [name="qty"]', '0');
  await page.click('#dlgOk');
  check(/Zadej množství/.test(await page.textContent('#dlg')), 'nulové množství okno nepustí');
  await page.click('#dlgCancel');
  await dlgClosed();
  await page.fill('#scCode', 'https://is.example/bez-kodu');
  await page.press('#scCode', 'Enter');
  await toastHas(/Tohle není kód/);
  check(JSON.stringify(await page.evaluate(() => ui.sc.batch.map(r => [r.code, r.qty, r.n]))) === JSON.stringify([['7.0.1', 8, 2], ['9.0.1', 2, 1], ['X-99', 4, 1]]), `dávka: ${JSON.stringify(await page.evaluate(() => ui.sc.batch))}`);
  // úprava množství v dávce
  await page.click('[data-scqty="X-99"]');
  await dlgOpen(/Upravit množství/);
  check(await page.inputValue('#dlg [name="qty"]') === '4', 'úprava množství předvyplní dávku');
  await page.fill('#dlg [name="qty"]', '6');
  await page.click('#dlgOk');
  await dlgClosed();
  // dávka se překreslí až po zavření okna (při zatíženém stroji o chvilku později)
  await page.waitForFunction(() => /6\s*ks/.test((document.querySelector('#scBatch [data-scrow="X-99"]') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
  const rows = await page.$$eval('#scBatch .sc-row', x => x.map(r => r.textContent.replace(/\s+/g, ' ').trim()));
  check(rows.length === 3 && /^\? ?X-99 ?není v seznamu/.test(rows[0]) && /sestava Kryt/.test(rows[1]) && /6 ks/.test(rows[0]) && /Hřídel/.test(rows[2]) && /2× načteno/.test(rows[2]) && /8 ks/.test(rows[2]), `řádky dávky (nejnovější nahoře): ${JSON.stringify(rows)}`);
  check(/3\s*kódy v dávce/.test((await page.textContent('#scHead')).replace(/\s+/g, ' ')) && /16\s*ks v dávce/.test((await page.textContent('#scHead')).replace(/\s+/g, ' ')), `souhrn dávky: ${(await page.textContent('#scHead')).replace(/\s+/g, ' ').slice(0, 260)}`);
  check((await over()) <= 0, `telefon s dávkou přetéká o ${await over()} px`);
  await page.screenshot({ path: path.join(shots, '04-davka.png'), fullPage: true });

  // ---------- potvrzení do Shortage ----------
  await page.click('[data-scok]');
  await page.waitForFunction(() => !ui.sc.batch.length && (S.shortage.scans || []).length === 3);
  await saved();
  const st = await page.evaluate(() => { const l = S.shortage.lists[0], it = c => l.items.find(i => i.code === c); return { a: it('7.0.1').rec, s: it('7.0.2').subs[0].rec, records: l.records.map(r => r.code).sort(), moves: l.moves, scans: S.shortage.scans.map(s => [s.code, s.qty, s.n, s.pos, s.hit, s.by]) }; });
  check(st.a && st.a.state === 'Brus – hala 2' && st.a.qty === '8' && st.a.n === 2 && st.a.by === 'Skladník', `poslední záznam Hřídele: ${JSON.stringify(st.a)}`);
  check(st.s && st.s.state === 'Brus – hala 2' && st.s.qty === '2', `poslední záznam poddílu: ${JSON.stringify(st.s)}`);
  check(JSON.stringify(st.records) === JSON.stringify(['7.0.1', '9.0.1', 'X-99']) && st.moves.file === 'Rychlý scan · Brus – hala 2' && st.moves.rows === 3, `záznamy a evidence pohybu: ${JSON.stringify([st.records, st.moves])}`);
  check(JSON.stringify(st.scans.map(s => s[0]).sort()) === JSON.stringify(['7.0.1', '9.0.1', 'X-99']) && st.scans.every(s => s[3] === 'Brus – hala 2' && s[5] === 'Skladník') && st.scans.find(s => s[0] === 'X-99')[4] === false, `deník skenů: ${JSON.stringify(st.scans)}`);
  const done = (await page.textContent('#scBatch')).replace(/\s+/g, ' ');
  check(/Zapsáno do Shortage .* pozice Brus – hala 2: 3 kódy, 16 ks .* 1 kód není v seznamu/.test(done), `hláška po potvrzení: ${done.slice(0, 300)}`);
  const log = await page.$$eval('#scLog .sc-logrow', x => x.map(r => r.textContent.replace(/\s+/g, ' ').trim()));
  check(log.length === 3 && log.some(t => /Hřídel.*8 ks/.test(t)) && log.some(t => /X-99.*mimo seznam.*6 ks/.test(t)), `mobilní záznamy: ${JSON.stringify(log)}`);
  await page.screenshot({ path: path.join(shots, '05-zapsano.png'), fullPage: true });

  // ---------- Excel ----------
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-scxlsx]')]);
  const xf = path.join(shots, dl.suggestedFilename());
  await dl.saveAs(xf);
  check(/^rychly-scan-\d{4}-\d{2}-\d{2}\.xlsx$/.test(dl.suggestedFilename()), `název souboru: ${dl.suggestedFilename()}`);
  const xr = spawnSync('python3', ['-c', 'import sys,json\nfrom openpyxl import load_workbook\nwb=load_workbook(sys.argv[1])\nprint(json.dumps({n:[[c.value for c in r] for r in wb[n].iter_rows()] for n in wb.sheetnames}))', xf], { encoding: 'utf8' });
  if (xr.status === 0) {
    const wb = JSON.parse(xr.stdout);
    const z = wb['Záznamy'] || [], su = wb['Souhrn'] || [];
    check(JSON.stringify(Object.keys(wb)) === JSON.stringify(['Záznamy', 'Souhrn']) && z[0][2] === 'Pozice' && z[0][3] === 'QR kód' && z.length === 4, `Excel listy a hlavička: ${JSON.stringify(Object.keys(wb))} ${JSON.stringify(z[0])}`);
    const h = z.find(r => r[3] === '7.0.1');
    check(h && h[4] === 8 && h[5] === 2 && h[6] === 'Hřídel' && h[10] === 'položka' && h[11] === 'Skladník', `řádek Hřídele v Excelu: ${JSON.stringify(h)}`);
    check(su.length === 4 && su.some(r => r[1] === 'X-99' && r[2] === 6), `souhrn v Excelu: ${JSON.stringify(su)}`);
  } else console.log('openpyxl chybí, Excel se nekontroluje');

  // ---------- bez hromadného načítání: zapíše se hned (Odesláno na WPA) ----------
  await page.uncheck('#scBatchOn');
  await page.waitForFunction(() => P.scanBatch === false);
  await page.click('#scSet [data-scpos="Odesláno na WPA"]');
  await page.waitForFunction(() => P.scanPos === 'Odesláno na WPA');
  await page.fill('#scCode', '7.0.1');
  await page.press('#scCode', 'Enter');
  await dlgOpen(/Množství/);
  check(await page.textContent('#dlgOk') === 'Zapsat', 'bez dávky tlačítko Zapsat');
  // rychlá volba „urgentně 4“ rovnou zapíše
  await page.click('#dlg [data-scset="4"]');
  await dlgClosed();
  await page.waitForFunction(() => (S.shortage.scans || []).length === 4);
  await saved();
  const wpa = await page.evaluate(() => { const l = S.shortage.lists[0], h = l.items.find(i => i.code === '7.0.1'), x = shSentOf(l, h); return { sent: l.sent['7.0.1'], st: x && [x.st, x.sent, x.left], rec: h.rec.state }; });
  check(wpa.sent && wpa.sent.length === 1 && wpa.sent[0][1] === 4 && JSON.stringify(wpa.st) === JSON.stringify(['here', 4, 6]) && wpa.rec === 'Odesláno na WPA', `Odesláno na WPA hned: ${JSON.stringify(wpa)}`);
  check(!(await page.locator('#scBatch .sc-row').count()), 'bez hromadného načítání se nic nesbírá');

  // ---------- Shortage ukáže záznam, historie ----------
  await page.evaluate(() => showView('shortage'));
  await page.waitForSelector('#view-shortage.on #shView tr[data-shid]');
  const shRow = (await page.textContent('#shView tr[data-shid]:has-text("Hřídel")')).replace(/\s+/g, ' ');
  check(/Odesláno na WPA/.test(shRow) && /U nás 6 ks/.test(shRow), `řádek v Shortage: ${shRow.slice(0, 300)}`);
  const hist = await page.evaluate(() => S.log.filter(x => x.kind === 'shortage').map(x => x.text || ''));
  check(hist.some(t => /rychlý scan Brus – hala 2 3 kódy \(16 ks\)/.test(t)) && hist.some(t => /rychlý scan Odesláno na WPA 1 kód \(4 ks\)/.test(t)), `historie změn: ${hist.slice(0, 6).join(' | ')}`);

  // ---------- kamera se mimo modul vypne ----------
  await page.evaluate(() => showView('scan'));
  await page.waitForSelector('#view-scan.on');
  await page.click('[data-sccam]');
  await page.waitForFunction(() => ui.sc.cam && codeScan && codeScan.stream);
  await dlgOpen(/Množství/);   // QR v záběru
  await page.click('#dlgCancel');
  await dlgClosed();
  await page.evaluate(() => showView('shortage'));
  check(!(await page.evaluate(() => ui.sc.cam || !!codeScan)), 'kamera se mimo Rychlý scan vypne');

  // ---------- zabalený seznam: není kam zapisovat ----------
  await page.evaluate(() => { S.shortage.lists[0].packed = { at: Date.now(), by: 'test' }; showView('scan'); });
  await page.waitForSelector('#view-scan.on #scSet .note.w');
  check(/zabalené/.test(await page.textContent('#scSet')) && await page.isHidden('#scCamBox'), 'zabalený seznam: hláška a bez kamery');
  await page.evaluate(() => { S.shortage.lists[0].packed = null; renderScan(); });

  // ---------- monitor: menu a vzhled ----------
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => showView('scan'));
  await page.waitForTimeout(200);
  check(await page.isVisible('#nav [data-view="scan"]') && /Rychlý scan/.test(await page.textContent('#nav [data-view="scan"]')), 'položka v menu na monitoru');
  check((await over()) <= 0, `monitor přetéká o ${await over()} px`);
  await page.screenshot({ path: path.join(shots, '06-monitor.png'), fullPage: true });

  await browser.close();
  if (problems.length) { console.log('PROBLÉMY:\n - ' + problems.join('\n - ')); process.exit(1); }
  console.log('e2e Rychlý scan: vše v pořádku');
})().catch(e => { console.log('PROBLÉMY:\n - ' + (e.stack || e)); process.exit(1); });
