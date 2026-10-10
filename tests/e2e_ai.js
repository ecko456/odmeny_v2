// Prohlížečový průchod přeformulováním příčiny v Top 5 (verze 2.5, tlačítko ✦): bez klíče se
// tlačítko neukáže; s klíčem odešle jen text pole s jmény nahrazenými značkami, návrh ukáže
// vedle původního textu, „Zahodit“ nic nezmění, „Použít“ text uloží a zapíše do historie
// případu, chyba služby se ukáže hláškou. Na konci mobil a tmavý režim.
// Test si sám spustí náhradní API Anthropicu na 127.0.0.1:8598 a uloží zkušební klíč do
// datového adresáře. Server musí běžet s adresou náhradního API:
//   ODMENY_DATA_DIR=$S/odme2e ODMENY_AI_BASE_URL=http://127.0.0.1:8598 php -S 127.0.0.1:8490 -t . dev-router.php &
//   curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state
//   NO_PROXY=127.0.0.1 PW=$(npm root -g)/playwright S=$S node tests/e2e_ai.js
// Snímky do $S/oshots-ai.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const http = require('http');
const path = require('path');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const DATA = process.env.DATA_DIR || path.join(S, 'odme2e');
const MOCK_PORT = +(process.env.AI_MOCK_PORT || 8598);
const shots = path.join(S, 'oshots-ai');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

/* Náhradní API: zaznamená požadavek a vrátí „profesionální“ znění se zachovanými značkami. */
const mock = { requests: [], mode: 'ok' };
const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', chunk => { raw += chunk; });
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    mock.requests.push({ path: req.url, headers: req.headers, body });
    const send = (status, payload) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)); };
    if (mock.mode === 'overloaded') return send(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
    const text = body.messages[0].content;
    const out = `Příčina: ${text.replace(/^dil/i, 'Díl').replace(/rucne/g, 'ručně').replace(/blbe/g, 'nepřesně')}`;
    return send(200, { id: 'msg_e2e', type: 'message', role: 'assistant', model: body.model,
      content: [{ type: 'text', text: JSON.stringify({ text: out }) }], stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 } });
  });
});

async function watch(page, label) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  page.on('response', r => { if (r.status() >= 400 && !/action=ai_rewrite/.test(r.url())) problems.push(`${label} HTTP ${r.status()} ${r.url()}`); });
  page.on('pageerror', err => problems.push(`${label} pageerror: ${err.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`));
  });
}
const saved = page => page.waitForFunction(() => !store.dirty && !store.saving && document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 15000 });
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
async function openCase(page) {
  // Případ z ručního zápisu týdne (stejně jako v e2e_top5.js).
  await page.click('#nav [data-view="top5"]');
  await page.click('[data-entadd]');
  const id = await page.evaluate(() => document.activeElement.closest('[data-ent]').dataset.ent);
  for (const [ef, value] of [['ean', '8590001000011'], ['name', 'Držák levý'], ['spent', '22,5'], ['norm', '9,9']]) {
    await page.fill(`[data-ent="${id}"] [data-ef="${ef}"]`, value);
    await page.press(`[data-ent="${id}"] [data-ef="${ef}"]`, 'Tab');
    await page.waitForTimeout(60);
  }
  await page.click('[data-t5new="8590001000011"]');
  await page.waitForSelector('.t5-case-head');
}
async function login(page) {
  await page.goto(BASE);
  await page.waitForSelector('#setupForm');
  await page.fill('[name="token"]', fs.readFileSync(path.join(DATA, 'setup-token.txt'), 'utf8').trim());
  await page.fill('[name="label"]', 'Vedoucí dílny');
  await page.click('#setupForm button[type="submit"]');
  await page.waitForSelector('.odm-card');
  const key = (await page.textContent('.odm-card .card-key')).trim();
  await page.check('#saved');
  await page.click('#finish');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');
  return key;
}
async function relogin(page, key) {
  await page.click('#lockBtn');
  await page.waitForSelector('#manual');
  await page.click('#manual');
  await page.fill('[name="key"]', key);
  await page.click('#keyForm button[type="submit"]');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  await new Promise(resolve => server.listen(MOCK_PORT, '127.0.0.1', resolve));
  const keyFile = path.join(DATA, 'anthropic-api-key');
  fs.rmSync(keyFile, { force: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  global.lastPage = page;
  await watch(page, 'ai');
  const cardKey = await login(page);

  // Bez klíče na serveru: tlačítko není.
  await openCase(page);
  check(!(await page.$('[data-t5ai]')), 'bez klíče se tlačítko ✦ nemá ukázat');

  // Klíč uložený na serveru, nové přihlášení: tlačítko je u příčiny (ne u „Co s tím jde dělat“).
  fs.writeFileSync(keyFile, 'sk-ant-e2e-0123456789\n', { mode: 0o600 });
  await saved(page);
  await relogin(page, cardKey);
  await page.click('#nav [data-view="top5"]');
  await page.click('#t5Tabs [data-t5tab="cases"]');
  await page.click('#t5View tbody tr >> nth=0');
  await page.waitForSelector('[data-t5ai="cause"]');
  check((await page.$$('[data-t5ai]')).length === 1, 'tlačítko jen u příčiny');
  // Prázdná příčina: jen hláška, nic se neodešle.
  await page.click('[data-t5ai="cause"]');
  await page.waitForSelector('#toast.on');
  check(/Napiš nejdřív příčinu/.test(await page.textContent('#toast')), 'hláška u prázdné příčiny');
  check(mock.requests.length === 0, 'prázdný text se neodeslal');

  // Text se jménem člověka z evidence (ukázková data: Dvořák Petr).
  const draft = 'dil se upina rucne a blbe, Dvořák to musi dorovnat a Dvořákovi chybi pripravek';
  await page.fill('[data-rf="cause"]', draft);
  await page.press('[data-rf="cause"]', 'Tab');
  await saved(page);
  await page.screenshot({ path: `${shots}/01-button.png`, fullPage: true });
  await page.click('[data-t5ai="cause"]');
  await page.waitForSelector('#dlg[open] .ai-compare');
  check(mock.requests.length === 1, `jeden požadavek na API (${mock.requests.length})`);
  const sent = mock.requests[0].body;
  check(sent.model === 'claude-sonnet-5-5', `model ${sent.model}`);
  check(sent.messages.length === 1 && sent.messages[0].content === 'dil se upina rucne a blbe, [osoba 1] to musi dorovnat a [osoba 2] chybi pripravek', `odeslaný text: ${JSON.stringify(sent.messages)}`);
  check(!JSON.stringify(sent).includes('Dvořák') && !JSON.stringify(sent).includes('8590001000011') && !JSON.stringify(sent).includes('Držák'), 'jméno, EAN ani název dílu se neodeslaly');
  const proposal = await page.inputValue('#dlg [name="value"]');
  check(proposal === 'Příčina: Díl se upina ručně a nepřesně, Dvořák to musi dorovnat a Dvořákovi chybi pripravek', `návrh: ${proposal}`);
  check((await page.textContent('#dlg .ai-orig')) === draft, 'v dialogu je původní text');
  check(/jména lidí byla nahrazena značkami \(2×\)/.test(await page.textContent('#dlg')), 'dialog říká, co se odeslalo');
  await page.screenshot({ path: `${shots}/02-dialog.png` });
  // Zahodit: nic se nemění.
  await page.click('#dlgCancel');
  check(await page.inputValue('[data-rf="cause"]') === draft, 'Zahodit nechá původní text');
  // Znovu, tentokrát návrh ještě upravit a použít.
  await page.click('[data-t5ai="cause"]');
  await page.waitForSelector('#dlg[open] .ai-compare');
  const finalText = 'Díl se upíná ručně bez dorazu; Dvořák musí každý kus dorovnat, Dvořákovi chybí přípravek.';
  await page.fill('#dlg [name="value"]', finalText);
  await page.click('#dlgOk');
  await page.waitForFunction(t => document.querySelector('[data-rf="cause"]').value === t, finalText);
  await saved(page);
  const stored = await page.evaluate(() => { const c = effCase(ui.t5.caseId); return { cause: curRound(c).cause, log: c.log.map(e => e.t) }; });
  check(stored.cause === finalText, `uložená příčina: ${stored.cause}`);
  check(stored.log.some(t => t === `Příčina: ${finalText}`), `historie případu: ${stored.log.join(' | ')}`);
  await page.screenshot({ path: `${shots}/03-applied.png`, fullPage: true });

  // Chyba služby: hláška, text zůstane.
  mock.mode = 'overloaded';
  await page.click('[data-t5ai="cause"]');
  await page.waitForSelector('#toast.on');
  await page.waitForFunction(() => /nedostupná/.test(document.querySelector('#toast').textContent), null, { timeout: 15000 });
  check(await page.inputValue('[data-rf="cause"]') === finalText, 'po chybě text zůstal');
  check(!(await page.isDisabled('[data-t5ai="cause"]')), 'tlačítko po chybě zase jde použít');
  mock.mode = 'ok';

  // Mobil a tmavý režim: tlačítko i dialog.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${shots}/04-mobile.png`, fullPage: true });
  check(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 1, 'mobil: vodorovné přetečení');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.click('[data-t5ai="cause"]');
  await page.waitForSelector('#dlg[open] .ai-compare');
  await page.screenshot({ path: `${shots}/05-dark-dialog.png` });
  await page.click('#dlgCancel');

  await browser.close();
  server.close();
  fs.rmSync(keyFile, { force: true });
  if (problems.length) { console.log(problems.join('\n')); process.exit(1); }
  console.log('e2e AI ok');
})().catch(async error => {
  console.error(error);
  if (problems.length) console.log(problems.join('\n'));
  if (global.lastPage) await global.lastPage.screenshot({ path: `${shots}/zz-error.png`, fullPage: true }).catch(() => {});
  process.exit(1);
});
