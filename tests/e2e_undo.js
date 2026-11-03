// Prohlížečový průchod 2.45: Poslední změny jen za 3 dny a Vrátit zpět (jen tahle změna, hodnota
// změněná mezitím zůstane, potvrzení se všemi změnami stejného uložení, štítek vráceno,
// vrácení vrácení, sloučený záznam), telefon a tmavý režim. Data jsou vymyšlená.
// Spuštění stejně jako e2e_konce.js; snímky v $S/oshots-undo.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-undo');
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
async function confirm(page) {
  await page.waitForSelector('#dlg[open]');
  await page.click('#dlgOk');
  await page.waitForFunction(() => !document.querySelector('#dlg[open]'));
}
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const text = async (page, sel) => (await page.textContent(sel)).replace(/\s+/g, ' ').trim();

async function makeXlsx(page, sheets) {
  const b64 = await page.evaluate(async sheets => {
    const X = await xlsx();
    const wb = X.utils.book_new();
    sheets.forEach(({ name, rows, dateRow, dateCol }) => {
      const aoa = rows.map(r => r.map(c => (c && c.d ? new Date(Date.UTC(2026, c.m || 10, c.d, 12)) : c)));
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

/* vrácení proběhne až po zavření potvrzení: počkat na záznam „Vráceno zpět“ a uložení */
const undone = async (page, n) => { await page.waitForFunction(n => S.log.filter(x => /^Vráceno zpět/.test(x.text)).length >= n, n); await saved(page); };
/* klikne na Vrátit zpět u řádku, jehož text sedí na vzor (ve stejném kroku, bez indexů) */
const undoBy = (page, src) => page.evaluate(src => {
  const re = new RegExp(src);
  const row = [...document.querySelectorAll('#dlg .log-item')].find(e => re.test(e.querySelector('.log-body p').textContent) && e.querySelector('[data-logundo]'));
  if (!row) return false;
  row.querySelector('[data-logundo]').click();
  return true;
}, src);

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await watch(page, 'undo');
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

  // vymyšlení lidé, první uložení (z ukázky se do historie nezapisuje)
  await page.evaluate(() => {
    const st = blank();
    const emp = (last, first, wid) => { const key = `${norm(last)}|${norm(first)}`; st.employees[key] = { key, last, first, positionId: null, note: '', wid }; };
    emp('Adámek', 'Aleš', '101'); emp('Bednář', 'Boris', '102'); emp('Cibulka', 'Cyril', '103');
    st.demo = false;
    S = sanitizeState(st); save(); renderAll();
  });
  await saved(page);
  const change = async fn => { await page.evaluate(fn); await saved(page); };
  // 1) jedno uložení: poznámka Adámka a ID Bednáře
  await change(() => { S.employees['adamek|ales'].note = 'Zaučuje se na CNC'; S.employees['bednar|boris'].wid = '202'; save(); });
  // 2) další uložení: ID Bednáře znovu (sloučí se se změnou ID), poznámka Cibulky
  await change(() => { S.employees['bednar|boris'].wid = '302'; S.employees['cibulka|cyril'].note = 'Noční'; save(); });
  // 3) záznam starší než 3 dny se v Posledních změnách neukáže
  await change(() => { S.log.unshift({ at: Date.now() - 4 * 864e5, by: 'Starý', card: '', kind: 'person', text: 'Stará změna před čtyřmi dny' }); save(); });
  const st0 = await page.evaluate(() => ({ undo: S.undo.length, withU: S.log.filter(x => x.u).length }));
  check(st0.undo >= 2 && st0.withU >= 3, `uložené změny pro vrácení: ${JSON.stringify(st0)}`);

  await page.click('#logBtn');
  await page.waitForSelector('#dlg[open] .log-item');
  const list = await page.$$eval('#dlg .log-item', els => els.map(e => [e.querySelector('.log-body p').textContent, !!e.querySelector('[data-logundo]')]));
  check(!list.some(x => /Stará změna/.test(x[0])), `starší než 3 dny se neukazuje: ${JSON.stringify(list)}`);
  check(list.length >= 3 && list.every(x => x[1]), `u každé změny Vrátit zpět: ${JSON.stringify(list)}`);
  check(/poslední 3 dny/.test(await text(page, '#dlgBody')), 'popis 3 dny');
  await page.screenshot({ path: path.join(shots, '01-zmeny.png') });

  // vrátit poznámku Adámka: stejné uložení změnilo i ID Bednáře, to se mezitím změnilo znovu → zůstane
  check(await undoBy(page, '^Adámek Aleš: upravena poznámka$'), 'záznam poznámky Adámka');
  await page.waitForSelector('#dlg[open] .log-undolist');
  const conf = await text(page, '#dlgBody');
  check(/Adámek/.test(conf) && /Bednář/.test(conf), `potvrzení ukáže všechny změny stejného uložení: ${conf}`);
  await page.screenshot({ path: path.join(shots, '02-potvrzeni.png') });
  await page.click('#dlgOk');
  await page.waitForFunction(() => !document.querySelector('#dlg[open]'));
  await undone(page, 1);
  const t1 = await text(page, '#toast');
  const s1 = await page.evaluate(() => ({ a: S.employees['adamek|ales'].note, b: S.employees['bednar|boris'].wid, c: S.employees['cibulka|cyril'].note }));
  check(JSON.stringify(s1) === JSON.stringify({ a: '', b: '302', c: 'Noční' }), `po vrácení: ${JSON.stringify(s1)}`);
  check(/Vráceno zpět\. 1 hodnota se mezitím znovu změnila/.test(t1), `hláška o přeskočené hodnotě: ${t1}`);
  const log1 = await page.evaluate(() => S.log.map(x => x.text + (x.un ? ' [vráceno]' : '')));
  check(log1.some(t => /^Vráceno zpět: /.test(t)), `historie: vráceno zpět: ${log1.slice(-6).join(' | ')}`);
  check(log1.some(t => /Adámek/.test(t) && /\[vráceno\]/.test(t)), 'původní záznam označený');

  // v Posledních změnách: vrácený záznam bez tlačítka a se štítkem, vrácení jde vrátit
  await page.click('#logBtn');
  await page.waitForSelector('#dlg[open] .log-item');
  const l2 = await page.$$eval('#dlg .log-item', els => els.map(e => [e.querySelector('.log-body p').textContent, !!e.querySelector('[data-logundo]'), /vráceno/.test(e.querySelector('.log-acts').textContent)]));
  check(l2.some(x => /Adámek/.test(x[0]) && !/Vráceno zpět/.test(x[0]) && !x[1] && x[2]), `vrácená změna: ${JSON.stringify(l2)}`);
  await page.screenshot({ path: path.join(shots, '03-vraceno.png') });
  check(await undoBy(page, '^Vráceno zpět: Adámek'), `vrácení jde vrátit: ${JSON.stringify(l2)}`);
  await page.waitForSelector('#dlg[open] .log-undolist');
  await page.click('#dlgOk');
  await page.waitForFunction(() => !document.querySelector('#dlg[open]'));
  await undone(page, 2);
  check(await page.evaluate(() => S.employees['adamek|ales'].note) === 'Zaučuje se na CNC', 'vrácení vrácení vrátí poznámku');

  // sloučený záznam ID Bednáře (dvě uložení) se vrátí na původní hodnotu
  await page.click('#logBtn');
  await page.waitForSelector('#dlg[open] .log-item');
  check(await undoBy(page, '^Bednář Boris: ID'), 'sloučený záznam ID Bednáře jde vrátit i po částečném vrácení');
  await page.waitForSelector('#dlg[open] .log-undolist');
  check(/Cibulka/.test(await text(page, '#dlgBody')), 'potvrzení ukáže i poznámku Cibulky ze stejného uložení');
  await page.click('#dlgOk');
  await page.waitForFunction(() => !document.querySelector('#dlg[open]'));
  await undone(page, 3);
  const s3 = await page.evaluate(() => ({ b: S.employees['bednar|boris'].wid, c: S.employees['cibulka|cyril'].note, a: S.employees['adamek|ales'].note }));
  // obě uložení ID: vrátí se i poznámka Cibulky (byla ve 2. uložení, potvrzení ji ukázalo), Adámek zůstane
  check(JSON.stringify(s3) === JSON.stringify({ b: '102', c: '', a: 'Zaučuje se na CNC' }), `sloučené ID zpátky na 102: ${JSON.stringify(s3)} · ${await text(page, '#toast')} · ${JSON.stringify(await page.evaluate(() => ({ log: S.log.slice(-6).map(x => [x.text, x.u, !!x.un]), undo: S.undo.map(u => [u.id, u.ch.map(c => c.p.join('.'))]) })))}`);

  // telefon
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.click('#logBtn');
  await page.waitForSelector('#dlg[open] .log-item');
  await page.waitForTimeout(400);
  check(await overflow(page) <= 0, `telefon přetéká o ${await overflow(page)} px`);
  await page.screenshot({ path: path.join(shots, '04-telefon.png') });

  await browser.close();
  if (problems.length) { console.log('PROBLÉMY:\n' + problems.join('\n')); process.exit(1); }
  console.log('e2e vrátit zpět ok');
})().catch(e => { console.error(e); process.exit(1); });
