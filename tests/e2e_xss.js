// Prohlížečový průchod (audit 2.62): podvržené HTML v datech se nesmí vykreslit jako HTML.
// Do ukázkových dat vloží do textů (jména, názvy skupin a dovedností, poznámky, sankce, úkoly,
// Shortage, Servis, Protokoly, historie) značky <img id="xssN"> a <b class="xssb">, projde všechny
// části menu a několik detailů a ověří, že žádná značka v DOM nevznikla a CSP nic nehlásí.
// Spuštění jako e2e_undo.js; snímky v $S/oshots-xss.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-xss');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', err => problems.push(`pageerror: ${err.message}`));
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`console: ${msg.text()}`); });
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`)));
  await page.goto(BASE);
  await page.waitForSelector('#setupForm');
  await page.fill('[name="token"]', fs.readFileSync(process.env.TOKEN_FILE || path.join(S, 'odme2e', 'setup-token.txt'), 'utf8').trim());
  await page.fill('[name="label"]', 'Audit <b class="xssb">x</b>');
  await page.click('#setupForm button[type="submit"]');
  await page.waitForSelector('.odm-card');
  await page.check('#saved');
  await page.click('#finish');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');

  // podvržené texty do dat
  const n = await page.evaluate(() => {
    let i = 0;
    const P = () => `<img src="x" id="xss${++i}"><b class="xssb">${i}</b>"'&`;
    Object.values(S.employees).slice(0, 6).forEach(e => { e.last = P() + e.last; e.first = P(); e.note = P(); e.wid = P().slice(0, 30); });
    S.positions.forEach(p => { p.name = P(); p.dept = P(); (p.skillset || []).forEach(x => { x.name = P(); x.desc = P(); }); (p.tiers || []).forEach(t => { t.name = P(); t.reward = P(); }); });
    S.sanReasons = [P(), P()];
    const k = Object.keys(S.employees)[0];
    S.sanctions.push({ id: 'sxss1', key: k, period: S.current, name: P(), pct: 10, note: P(), at: Date.now() });
    S.tasks.list.push({ id: 'tkxss1', title: P(), desc: P(), due: '', owner: P(), state: 'new', repeat: '', remind: 2, at: Date.now(), by: P(), tl: [{ id: 'tex1', at: Date.now(), by: P(), k: 'c', text: P() }] });
    const L = c => 'http://is.example/x?activeBarcode=' + c + '&y';
    S.shortage.lists.unshift({ id: 'shxss', at: Date.now(), by: P(), file: P(), sheet: P(), items: [{ id: 'si1', order: P(), name: P(), ean: P(), index: P(), qty: P(), top: true, op: P(), link: L('1.2'), code: '1.2', note: P(), rec: { ts: 1, when: P(), qty: P(), state: P(), op: P(), n: 2, at: 1, by: P() }, subs: [{ id: 'sp1', ean: P(), code: '3.4', op: P(), note: P() }], cands: [{ ean: P(), code: '', op: P(), link: '' }] }] });
    S.shortage.depts = [{ id: 'sdx', name: P(), ops: [] }];
    S.service.devices.push({ id: 'dvxss', kind: P(), brand: P(), model: P(), made: '2020', iid: P().slice(0, 40), sn: P().slice(0, 40), note: P(), at: 1, by: P() });
    S.logbooks.push({ ...blankLogbook(), id: 'lbxss', name: P(), maker: P(), place: P(), note: P(), steps: [{ ...blankStep(), id: 'st1', name: P(), how: P() }] });
    S.log.push({ at: Date.now(), by: P(), card: '', kind: 'person', text: P() });
    S.capReport.note = P();
    S = sanitizeState(sharedState(S));
    save();
    return i;
  });
  check(n > 50, `podvržených textů: ${n}`);
  await page.waitForFunction(() => !store.dirty && !store.saving, null, { timeout: 15000 });
  const bad = () => page.evaluate(() => ({ img: [...document.querySelectorAll('img[id^="xss"]')].map(x => x.id), b: document.querySelectorAll('b.xssb').length }));
  const views = await page.$$eval('#nav [data-view]', x => x.map(b => b.dataset.view));
  for (const v of [...new Set([...views, 'vyroba', 'profil'])]) {
    await page.evaluate(view => { if (view === 'profil') { ui.profileKey = Object.keys(S.employees)[0]; } showView(view); }, v);
    await page.waitForTimeout(250);
    const r = await bad();
    check(!r.img.length && !r.b, `${v}: vykreslené podvržené HTML ${JSON.stringify(r)}`);
  }
  // detaily a záložky
  const extra = [
    ['lide', () => { ui.selPerson = Object.keys(S.employees)[0]; showView('lide'); renderPeople(); }],
    ['matice: skupiny', () => { ui.mxTab = 'groups'; showView('matice'); }],
    ['matice: kapacita', () => { ui.mxTab = 'cap'; showView('matice'); }],
    ['matice: vedoucí', () => { ui.mxTab = 'leads'; showView('matice'); }],
    ['shortage: rozbor', () => { ui.sh.mode = 'rozbor'; showView('shortage'); }],
    ['ukoly: detail', () => { ui.tk.sel = 'tkxss1'; showView('ukoly'); }],
    ['servis: zařízení', () => { ui.sv.tab = 'dev'; showView('servis'); }],
    ['protokoly: detail', () => { ui.lb.sel = 'lbxss'; showView('protokoly'); }],
    ['historie', () => { openLog(); }],
  ];
  for (const [name, fn] of extra) {
    await page.evaluate(`(${fn.toString()})()`).catch(e => problems.push(`${name}: ${e.message}`));
    await page.waitForTimeout(350);
    const r = await bad();
    check(!r.img.length && !r.b, `${name}: vykreslené podvržené HTML ${JSON.stringify(r)}`);
    await page.evaluate(() => { const d = document.querySelector('#dlg[open]'); if (d) d.close(); });
  }
  // test opravdu testuje: podvržený text je na stránce vidět jako text
  await page.evaluate(() => { ui.sh.mode = 'list'; showView('shortage'); });
  await page.waitForTimeout(300);
  check(/<img src="x" id="xss\d+"><b class="xssb">/.test(await page.textContent('#shView')), 'podvržený text je vidět jako text');
  await page.screenshot({ path: path.join(shots, '01-shortage.png') });
  await browser.close();
  if (problems.length) {
    console.log('PROBLÉMY:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
  console.log('podvržené HTML se nevykreslí ok');
})().catch(err => { console.error(err); process.exit(1); });
