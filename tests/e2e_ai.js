// Prohlížečový průchod přeformulováním v Top 5 (verze 2.5 a 2.6, tlačítko ✦ pod krokem 4):
// bez klíče se tlačítko neukáže; s klíčem vedoucí vybere vše, nebo jen některé části
// (příčina, co s tím jde dělat, opatření hned a s procesním časem). Odejde jen text vybraných
// částí s jmény nahrazenými značkami (bez odpovědných osob, termínů a údajů o dílu), návrh se
// ukáže po částech vedle původního textu, použijí se jen zaškrtnuté části a zapíšou se do
// historie případu. Co se během čekání změnilo, se nepřepíše. Chyba služby se ukáže hláškou.
// Na konci mobil a tmavý režim.
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

/* Náhradní API: zaznamená požadavek a vrátí „profesionální“ znění každé části se zachovanými značkami. */
const mock = { requests: [], mode: 'ok' };
const polish = t => t.replace(/^dil/i, 'Díl').replace(/rucne/g, 'ručně').replace(/blbe/g, 'nepřesně')
  .replace(/^kontrola/, 'Kontrola').replace(/^zadost/, 'Žádost').replace(/^doraz/, 'Doraz');
const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', chunk => { raw += chunk; });
  req.on('end', () => {
    const body = JSON.parse(raw || '{}');
    mock.requests.push({ path: req.url, headers: req.headers, body });
    const send = (status, payload) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)); };
    if (mock.mode === 'overloaded') return send(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
    const parts = JSON.parse(body.messages[0].content).parts.map(p => ({ id: p.id, text: polish(p.text) }));
    const reply = () => send(200, { id: 'msg_e2e', type: 'message', role: 'assistant', model: body.model,
      content: [{ type: 'text', text: JSON.stringify({ parts }) }], stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 } });
    return mock.mode === 'slow' ? setTimeout(reply, 1500) : reply();
  });
});
const lastParts = () => JSON.parse(mock.requests[mock.requests.length - 1].body.messages[0].content).parts;

async function watch(page, label) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  page.on('response', r => { if (r.status() >= 400 && !/action=ai_rewrite/.test(r.url())) problems.push(`${label} HTTP ${r.status()} ${r.url()}`); });
  page.on('pageerror', err => problems.push(`${label} pageerror: ${err.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`));
  });
}
const saved = page => page.waitForFunction(() => !store.dirty && !store.saving && document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 15000 });
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
async function addAction(page, kind, text, owner, due) {
  const before = await page.$$eval('.t5-act[data-act]', x => x.length);
  await page.click(`[data-actadd="${kind}"]`);
  await page.waitForFunction(n => document.querySelectorAll('.t5-act[data-act]').length > n, before);
  const row = () => page.locator('.t5-act[data-act]').last();
  await row().locator('[data-actf="text"]').fill(text);
  await row().locator('[data-actf="text"]').press('Tab');
  await row().locator('[data-actf="owner"]').fill(owner);
  await row().locator('[data-actf="owner"]').press('Tab');
  if (due) await row().locator('[data-actf="due"]').fill(due);
  return row().getAttribute('data-act');
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
const round = page => page.evaluate(() => { const c = effCase(ui.t5.caseId); const r = curRound(c); return { cause: r.cause, options: r.options, actions: r.actions.map(a => [a.kind, a.text, a.owner]), log: c.log.map(e => e.t) }; });
async function pickParts(page, keys) {
  await page.click('[data-t5ai]');
  await page.waitForSelector('#dlg[open] .ai-picks');
  for (const k of ['cause', 'options', 'now', 'process']) {
    const box = page.locator(`#dlg [name="${k}"]`);
    if (!(await box.isDisabled())) await box.setChecked(keys.includes(k));
  }
  await page.click('#dlgOk');
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

  // Klíč uložený na serveru, nové přihlášení: jedno tlačítko mezi krokem 4 a 5.
  fs.writeFileSync(keyFile, 'sk-ant-e2e-0123456789\n', { mode: 0o600 });
  await saved(page);
  await relogin(page, cardKey);
  await page.click('#nav [data-view="top5"]');
  await page.click('#t5Tabs [data-t5tab="cases"]');
  await page.click('#t5View tbody tr >> nth=0');
  await page.waitForSelector('[data-t5ai]');
  check((await page.$$('[data-t5ai]')).length === 1, 'tlačítko ✦ je jen jedno');
  check(await page.evaluate(() => {
    const bar = document.querySelector('.t5-ai-bar');
    const steps = [...document.querySelectorAll('.t5-step')];
    return !!(bar.compareDocumentPosition(steps[3]) & Node.DOCUMENT_POSITION_PRECEDING) && !!(bar.compareDocumentPosition(steps[4]) & Node.DOCUMENT_POSITION_FOLLOWING);
  }), 'tlačítko je mezi krokem 4 a 5');
  // Nic nevyplněno: jen hláška, nic se neodešle.
  await page.click('[data-t5ai]');
  await page.waitForSelector('#toast.on');
  check(/Nejdřív vyplň aspoň jednu část/.test(await page.textContent('#toast')), 'hláška u prázdného případu');
  check(mock.requests.length === 0, 'prázdné kroky se neodeslaly');

  // Vyplnění kroků 1–4. Jméno člověka z evidence (ukázková data: Dvořák Petr) v textech i jako odpovědná osoba.
  const draft = 'dil se upina rucne a blbe, Dvořák to musi dorovnat a Dvořákovi chybi pripravek';
  const options = 'doraz na upinani by usetril cas, mozna i pripravek';
  await page.fill('[data-rf="cause"]', draft);
  await page.press('[data-rf="cause"]', 'Tab');
  await page.fill('[data-rf="options"]', options);
  await page.press('[data-rf="options"]', 'Tab');
  const now1 = await addAction(page, 'now', 'kontrola prvniho kusu', 'Dvořák Petr');
  await addAction(page, 'now', 'Dvořák uklidi pracoviste', 'Mistr');
  await page.click('[data-actadd="now"]');   // prázdné opatření se neposílá
  await page.waitForTimeout(200);
  const proc1 = await addAction(page, 'process', 'zadost o zmenu normy', 'Technolog', '2026-11-30');
  await saved(page);
  await page.locator('.t5-ai-bar').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/01-bar.png` });

  // Výběr: vše zaškrtnuté, „Vše“ přepíná všechny, bez výběru nejde pokračovat.
  await page.click('[data-t5ai]');
  await page.waitForSelector('#dlg[open] .ai-picks');
  const states = await page.$$eval('#dlg .ai-picks input', x => x.map(i => [i.name, i.checked, i.disabled]));
  check(JSON.stringify(states) === JSON.stringify([['cause', true, false], ['options', true, false], ['now', true, false], ['process', true, false]]), `výběr částí: ${JSON.stringify(states)}`);
  check(/2 opatření/.test(await page.textContent('#dlg .ai-picks')), 'u opatření je počet');
  await page.screenshot({ path: `${shots}/02-pick.png` });
  await page.uncheck('#dlg [data-aiall]');
  check((await page.$$eval('#dlg .ai-picks input', x => x.filter(i => i.checked).length)) === 0, 'Vše odškrtne všechny části');
  await page.click('#dlgOk');
  await page.waitForSelector('#dlg .dlg-error');
  check(/aspoň jednu část/.test(await page.textContent('#dlg .dlg-error')), 'bez výběru nejde pokračovat');
  await page.check('#dlg [name="now"]');
  check(!(await page.isChecked('#dlg [data-aiall]')), 'Vše je zaškrtnuté, jen když jsou všechny části');
  await page.check('#dlg [data-aiall]');
  await page.click('#dlgOk');
  await page.waitForSelector('#dlg[open] .ai-parts');

  // Odeslalo se jen id a text částí, jména nahrazená značkami (stejné jméno = stejná značka).
  check(mock.requests.length === 1, `jeden požadavek na API (${mock.requests.length})`);
  const sent = mock.requests[0].body;
  check(sent.model === 'claude-sonnet-5-5', `model ${sent.model}`);
  const parts = lastParts();
  check(JSON.stringify(parts.map(p => p.id)) === JSON.stringify(['cause', 'options', 'now-1', 'now-2', 'process-1']), `odeslané části: ${parts.map(p => p.id)}`);
  check(parts[0].text === 'dil se upina rucne a blbe, [osoba 1] to musi dorovnat a [osoba 2] chybi pripravek', `příčina: ${parts[0].text}`);
  check(parts[3].text === '[osoba 1] uklidi pracoviste', `opatření se jménem: ${parts[3].text}`);
  const wire = JSON.stringify(sent);
  for (const secret of ['Dvořák', 'Petr', 'Mistr', 'Technolog', '2026-11-30', '8590001000011', 'Držák']) check(!wire.includes(secret), `neodeslat: ${secret}`);
  const fields = await page.$$eval('#dlg .ai-row :is(input, textarea)', x => x.map(i => i.value));
  check(fields[0] === 'Díl se upina ručně a nepřesně, Dvořák to musi dorovnat a Dvořákovi chybi pripravek' && fields[3] === 'Dvořák uklidi pracoviste', `návrhy: ${JSON.stringify(fields)}`);
  check((await page.$$eval('#dlg .ai-orig', x => x.map(i => i.textContent)))[0] === draft, 'v dialogu je původní text');
  check(/jména lidí byla nahrazena značkami \(2×\)/.test(await page.textContent('#dlg')), 'dialog říká, co se odeslalo');
  await page.screenshot({ path: `${shots}/03-proposal.png` });

  // „Co s tím jde dělat“ nechat, příčinu ještě upravit, zbytek použít.
  const finalText = 'Díl se upíná ručně bez dorazu; Dvořák musí každý kus dorovnat, Dvořákovi chybí přípravek.';
  await page.uncheck('#dlg [name="use-options"]');
  await page.fill('#dlg [name="v-cause"]', finalText);
  await page.click('#dlgOk');
  await page.waitForFunction(t => document.querySelector('[data-rf="cause"]').value === t, finalText);
  await saved(page);
  let r = await round(page);
  check(r.cause === finalText, `uložená příčina: ${r.cause}`);
  check(r.options === options && !r.log.some(t => t.startsWith('Co s tím jde dělat: Doraz')), 'nezaškrtnutá část zůstala beze změny');
  check(JSON.stringify(r.actions) === JSON.stringify([['now', 'Kontrola prvniho kusu', 'Dvořák Petr'], ['now', 'Dvořák uklidi pracoviste', 'Mistr'], ['now', '', ''], ['process', 'Žádost o zmenu normy', 'Technolog']]), `opatření: ${JSON.stringify(r.actions)}`);
  check(r.log.includes(`Příčina: ${finalText}`) && r.log.includes('Okamžité opatření „Kontrola prvniho kusu“, odpovídá Dvořák Petr')
    && r.log.includes('Opatření s procesním časem „Žádost o zmenu normy“, odpovídá Technolog'), `historie případu: ${r.log.join(' | ')}`);
  check(/Přeformulováno: Proč se to stalo, Co jde udělat hned, Co si vyžádá procesní čas\./.test(await page.textContent('#toast')), `hláška: ${await page.textContent('#toast')}`);
  check(await page.inputValue(`[data-act="${now1}"] [data-actf="text"]`) === 'Kontrola prvniho kusu', 'opatření v detailu přepsané');
  check(await page.inputValue(`[data-act="${proc1}"] [data-actf="due"]`) === '2026-11-30', 'termín zůstal');
  await page.screenshot({ path: `${shots}/04-applied.png`, fullPage: true });

  // Jen jedna část: odejde jen ona. Zahodit nic nezmění.
  await pickParts(page, ['process']);
  await page.waitForSelector('#dlg[open] .ai-parts');
  check(JSON.stringify(lastParts().map(p => [p.id, p.text])) === JSON.stringify([['process-1', 'Žádost o zmenu normy']]), `jen procesní opatření: ${JSON.stringify(lastParts())}`);
  check((await page.$$('#dlg .ai-part')).length === 1, 'v návrhu je jen vybraná část');
  await page.click('#dlgCancel');
  r = await round(page);
  check(r.actions[3][1] === 'Žádost o zmenu normy', 'Zahodit nic nezměnil');

  // Během čekání vedoucí příčinu přepsal: návrh ji nepřepíše, nezměněnou část použije.
  mock.mode = 'slow';
  await pickParts(page, ['cause', 'options']);
  await page.waitForSelector('[data-t5ai].busy');
  check(await page.isDisabled('[data-t5ai]'), 'během čekání tlačítko nejde znovu použít');
  await page.fill('[data-rf="cause"]', 'Ručně dopsaná příčina.');
  await page.press('[data-rf="cause"]', 'Tab');
  await page.waitForSelector('#dlg[open] .ai-parts', { timeout: 15000 });
  await page.click('#dlgOk');
  await page.waitForFunction(() => /mezitím změnila/.test(document.querySelector('#toast').textContent));
  check(/Přeformulováno: Co s tím jde dělat\./.test(await page.textContent('#toast')), `hláška po souběhu: ${await page.textContent('#toast')}`);
  r = await round(page);
  check(r.cause === 'Ručně dopsaná příčina.', `příčina změněná během čekání zůstala: ${r.cause}`);
  check(r.options === 'Doraz na upinani by usetril cas, mozna i pripravek', `možnosti přeformulované: ${r.options}`);
  mock.mode = 'ok';
  await saved(page);

  // Příliš dlouhá část se nedá vybrat.
  await page.fill('[data-rf="options"]', 'x'.repeat(2100));
  await page.press('[data-rf="options"]', 'Tab');
  await page.click('[data-t5ai]');
  await page.waitForSelector('#dlg[open] .ai-picks');
  check(await page.isDisabled('#dlg [name="options"]') && /delší než 2000 znaků/.test(await page.textContent('#dlg .ai-picks')), 'dlouhá část nejde vybrat');
  await page.click('#dlgCancel');
  await page.fill('[data-rf="options"]', options);
  await page.press('[data-rf="options"]', 'Tab');
  await saved(page);

  // Chyba služby: hláška, text zůstane.
  mock.mode = 'overloaded';
  await pickParts(page, ['cause']);
  await page.waitForFunction(() => /nedostupná/.test(document.querySelector('#toast').textContent), null, { timeout: 15000 });
  check(await page.inputValue('[data-rf="cause"]') === 'Ručně dopsaná příčina.', 'po chybě text zůstal');
  check(!(await page.isDisabled('[data-t5ai]')), 'tlačítko po chybě zase jde použít');
  mock.mode = 'ok';

  // Mobil a tmavý režim: lišta, výběr i návrh.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await page.locator('.t5-ai-bar').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/05-mobile.png` });
  check(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, 'mobil: vodorovné přetečení');
  await page.click('[data-t5ai]');
  await page.waitForSelector('#dlg[open] .ai-picks');
  await page.waitForTimeout(400);   // dialog se zobrazuje s animací
  await page.screenshot({ path: `${shots}/06-mobile-pick.png` });
  await page.click('#dlgOk');
  await page.waitForSelector('#dlg[open] .ai-parts');
  check(await page.evaluate(() => { const d = document.querySelector('#dlg'); return d.scrollWidth - d.clientWidth; }) <= 1, 'mobil: návrh bez vodorovného přetečení');
  await page.waitForTimeout(400);   // dialog se zobrazuje s animací
  await page.screenshot({ path: `${shots}/07-mobile-proposal.png` });
  await page.click('#dlgCancel');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.click('[data-t5ai]');
  await page.waitForSelector('#dlg[open] .ai-picks');
  await page.waitForTimeout(400);   // dialog se zobrazuje s animací
  await page.screenshot({ path: `${shots}/08-dark-pick.png` });
  await page.click('#dlgOk');
  await page.waitForSelector('#dlg[open] .ai-parts');
  await page.waitForTimeout(400);   // dialog se zobrazuje s animací
  await page.screenshot({ path: `${shots}/09-dark-proposal.png` });
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
