// Prohlížečový průchod 2.80: modul Skříňky. Vložení soupisu z Excelu (Ctrl+V, A písmeno, B číslo, C jméno psané
// ručně: bez háčků, prohozené pořadí, jen příjmení, iniciála, překlep, dva stejná příjmení, člověk podruhé, neznámé
// jméno), okno K rozhodnutí (návrh, Už u nás nepracuje, Volná), dlaždice Volné / Obsazené / K vyklizení / Bez skříňky,
// odznak v menu, Vyprázdněno, vyřazení člověka (potvrzení, hláška, detail v Lidech), přiřazení nespárované, Přidělit
// volnou, poznámka, řada skříněk, štítky Zebra 100 × 35 mm (jedna skříňka i hromadně, PyMuPDF), Excel (openpyxl),
// historie, nové přihlášení, telefon a vložení přes okno (pole pro vložení). Jména jsou vymyšlená.
// Spuštění jako ostatní e2e (tests/run_e2e.sh e2e_skrinky); snímky v $S/oshots-skrinky.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-skrinky');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

async function watch(page, label) {
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`${label} console: ${msg.text()}`); });
  page.on('pageerror', err => problems.push(`${label} pageerror: ${err.message}`));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`)));
}
const saved = page => page.waitForFunction(() => !store.dirty && !store.saving && document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 20000 });
const dlgOpen = (page, re) => page.waitForFunction(r => { const d = document.querySelector('#dlg[open]'); return d && new RegExp(r).test(d.textContent); }, re.source, { timeout: 20000 });
const dlgClosed = page => page.waitForFunction(() => !document.querySelector('#dlg[open]'));
// okno se zavře o chvíli dřív, než doběhne kód po něm (událost close přijde až v další úloze)
const until = (page, fn) => page.waitForFunction(fn, null, { timeout: 20000 });
const tiles = page => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#lkView .lk-stats .stat')].map(s => [s.querySelector('.k').textContent.trim(), s.querySelector('.v').textContent.trim()])));
const rowOf = (page, label) => page.locator(`#lkView tr[data-lkrow]`).filter({ has: page.locator('td.lk-lab', { hasText: new RegExp(`^${label}$`) }) });

const PDF = String.raw`
import sys, json, fitz
d = fitz.open(sys.argv[1]); out = []
for p in d:
    W, H = p.rect.width, p.rect.height
    spans = [(s['bbox'], s['text'], s['size']) for b in p.get_text('dict')['blocks'] for l in b.get('lines', []) for s in l['spans'] if s['text'].strip()]
    # potisk v pixelech (100 dpi, 1 px ≈ 0,25 mm): okraj 1 mm bez tisku (mimo značky přehybu), pravá polovina štítku klíče prázdná
    pm = p.get_pixmap(dpi=100, colorspace=fitz.csGRAY); pw, ph, px = pm.width, pm.height, pm.samples
    ink = lambda x, y: px[y * pw + x] < 128
    mm = pw / 100.0; edge = int(mm); mid = range(int(48.5 * mm), int(51.5 * mm) + 1)
    border = sum(1 for y in range(ph) for x in range(pw) if (y < edge or y >= ph - edge or x < edge or x >= pw - edge) and x not in mid and ink(x, y))
    right = sum(1 for y in range(ph) for x in range(int(51.5 * mm), pw) if ink(x, y))
    out.append({'w': round(W / 72 * 25.4, 1), 'h': round(H / 72 * 25.4, 1), 'text': ' | '.join(t for _, t, _ in spans), 'flat': ''.join(t for _, t, _ in spans).replace(' ', ''), 'border': border, 'right': right,
                'maxX': round(max([b[2] for b, _, _ in spans] or [0]) / 72 * 25.4, 1), 'minX': round(min([b[0] for b, _, _ in spans] or [0]) / 72 * 25.4, 1),
                'maxY': round(max([b[3] for b, _, _ in spans] or [0]) / 72 * 25.4, 1), 'big': round(max([z for _, _, z in spans] or [0]))})
    if len(out) <= 2: p.get_pixmap(dpi=200).save(sys.argv[2] + f'-{len(out)}.png')
print(json.dumps(out))`;
const XL = String.raw`
import sys, json
from openpyxl import load_workbook
wb = load_workbook(sys.argv[1]); print(json.dumps({ws.title: [[c if c is not None else '' for c in r] for r in ws.iter_rows(values_only=True)] for ws in wb.worksheets}))`;
function readPdf(file, name) {
  const r = spawnSync('python3', ['-c', PDF, file, path.join(shots, name)], { encoding: 'utf8' });
  if (r.status !== 0) { problems.push(`PyMuPDF: ${r.stderr.slice(0, 300)}`); return []; }
  return JSON.parse(r.stdout);
}

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await watch(page, 'monitor');
  await page.goto(BASE);
  await page.waitForSelector('#setupForm');
  const token = fs.readFileSync(process.env.TOKEN_FILE || path.join(S, 'odme2e', 'setup-token.txt'), 'utf8').trim();
  await page.fill('[name="token"]', token);
  await page.fill('[name="label"]', 'Mistr haly');
  await page.click('#setupForm button[type="submit"]');
  await page.waitForSelector('.odm-card');
  const key = (await page.textContent('.odm-card .card-key')).trim();
  await page.check('#saved');
  await page.click('#finish');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');
  await saved(page);
  // lidé: vlastní seznam (ručně psaná jména se párují jen s nimi)
  await page.evaluate(() => {
    const g = S.positions[0] ? S.positions[0].id : '';
    const P = [['Novák', 'Jan', '101'], ['Nováková', 'Jana'], ['Dvořák', 'Petr'], ['Dvořák', 'Pavel'], ['Svoboda', 'Tomáš', '105'], ['Černá Malá', 'Lenka'],
      ['Wagner', 'Karel'], ['Kovaříková', 'Zdeňka', '', true], ['Šimek', 'Ondřej'], ['Beneš', 'Cyril']];
    S.employees = {};
    P.forEach(([last, first, wid, ex]) => { const key = norm(last) + '|' + norm(first); S.employees[key] = { key, first, last, positionId: g, ...(wid ? { wid } : {}), ...(ex ? { excluded: true } : {}) }; });
    S.sanctions = []; S.issued = {}; S.adjust = {}; S.marks = {};
    S = sanitizeState(S);
    save(); renderAll();
  });
  await saved(page);

  // ---------- prázdný modul ----------
  await page.click('#nav [data-view="skrinky"]');
  await page.waitForSelector('#view-skrinky.on #lkView .lk-empty');
  check(await page.isHidden('#navLockers'), 'odznak bez skříněk skrytý');
  await page.screenshot({ path: path.join(shots, '01-prazdne.png') });

  // ---------- Ctrl+V z Excelu (HTML tabulka i text) ----------
  const ROWS = [['Řada', 'Číslo', 'Jméno a příjmení'], ['A', '1', 'Jan Novák'], ['A', '2', 'Novakova Jana'], ['A', '3', 'Dvořák'], ['A', '4', 'Svoboda'], ['A', '5', 'Simek O.'],
    ['A', '6', 'Vagner Karel'], ['A', '7', 'Kovarikova'], ['A', '8', 'Horák Milan'], ['A', '9', ''], ['A', '10', ''], ['B', '1', 'Xyz Qwerty'], ['B', '2', 'Novák Jan'], ['B', '', 'Bez čísla']];
  await page.evaluate(rows => {
    const dt = new DataTransfer();
    dt.setData('text/html', `<table>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`);
    dt.setData('text/plain', rows.map(r => r.join('\t')).join('\n'));
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, ROWS);
  await dlgOpen(page, /Vložit soupis skříněk/);
  const d1 = await page.evaluate(() => {
    const dlg = document.querySelector('#dlg');
    const tl = Object.fromEntries([...dlg.querySelectorAll('.lk-sum .stat')].map(s => [s.querySelector('.k').textContent.trim(), s.querySelector('.v').textContent.trim()]));
    const open = [...dlg.querySelectorAll('h3.lk-h + p + .lk-dlgtab tbody tr')].map(tr => tr.querySelector('.lk-lab').textContent.trim());
    const auto = [...dlg.querySelectorAll('details.lk-auto tbody tr')].map(tr => `${tr.querySelector('.lk-lab').textContent.trim()}=${tr.querySelector('select').value}`);
    const a3 = [...dlg.querySelectorAll('select[data-lka="4"] optgroup')].map(g => `${g.label}:${g.children.length}`);
    return { tl, open, auto, a3, skipped: /Bez čísla skříňky/.test(dlg.textContent), excl: /vyřazený → K vyklizení/.test(dlg.textContent) };
  });
  check(d1.tl['Skříněk'] === '12' && d1.tl['Spárováno'] === '6' && d1.tl['K rozhodnutí'] === '4' && d1.tl['Volné'] === '2', `okno: dlaždice ${JSON.stringify(d1.tl)}`);
  check(d1.open.join(',') === 'A 3,A 8,B 1,B 2', `K rozhodnutí: ${d1.open}`);
  check(d1.auto.join(',') === 'A 1=novak|jan,A 2=novakova|jana,A 4=svoboda|tomas,A 5=simek|ondrej,A 6=wagner|karel,A 7=kovarikova|zdenka', `spárováno: ${d1.auto}`);
  check(/^Návrh:2/.test(d1.a3[0] || '') && d1.a3.some(x => /^Ještě bez skříňky/.test(x)), `Dvořák: návrhy ${d1.a3}`);
  check(d1.skipped && d1.excl, 'řádek bez čísla a vyřazený v okně');
  await page.screenshot({ path: path.join(shots, '02-okno.png') });
  await page.selectOption('#dlg select[data-lka="4"]', 'dvorak|petr');
  await page.waitForFunction(() => /Krozhodnutí3/.test(document.querySelector('#dlg .lk-sum').textContent.replace(/\s+/g, '')));
  await page.selectOption('#dlg select[data-lka="9"]', '@gone');
  await page.selectOption('#dlg select[data-lka="13"]', '@free');
  const d2 = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#dlg .lk-sum .stat')].map(s => [s.querySelector('.k').textContent.trim(), s.querySelector('.v').textContent.trim()])));
  check(d2['Spárováno'] === '7' && d2['K rozhodnutí'] === '1' && d2['Volné'] === '3', `po výběru: ${JSON.stringify(d2)}`);
  await page.click('#dlgOk');
  await dlgClosed(page);
  await until(page, () => S.lockers.list.length === 12);
  await saved(page);
  let t = await tiles(page);
  check(t['Volné skříňky'] === '3' && t['Obsazené skříňky'] === '7' && t['K vyklizení'] === '2' && t['Lidé bez skříňky'] === '3', `dlaždice: ${JSON.stringify(t)}`);
  check(await page.evaluate(() => /z toho 1 nespárováno/.test(document.querySelector('#lkView .lk-stats').textContent)), 'nespárovaná v dlaždici');
  check((await page.textContent('#navLockers')).trim() === '2' && await page.isVisible('#navLockers'), 'odznak K vyklizení v menu');
  check(await page.evaluate(() => lkUi().f === 'clear' && document.querySelectorAll('#lkView tr[data-lkrow]').length === 2), 'po vložení filtr K vyklizení');
  check(await page.evaluate(() => /Je třeba vyprázdnit 2 skříňky/.test(document.querySelector('#lkView .lk-alert').textContent)), 'upozornění Je třeba vyprázdnit');
  await page.screenshot({ path: path.join(shots, '03-k-vyklizeni.png') });
  const st1 = await page.evaluate(() => S.lockers.list.map(l => `${lkLabel(l)}:${l.key || (l.gone ? '@' + l.gone : l.raw ? '?' + l.raw : '-')}`).join(','));
  check(st1 === 'A 1:novak|jan,A 2:novakova|jana,A 3:dvorak|petr,A 4:svoboda|tomas,A 5:simek|ondrej,A 6:wagner|karel,A 7:kovarikova|zdenka,A 8:@Horák Milan,A 9:-,A 10:-,B 1:?Xyz Qwerty,B 2:-', `soupis: ${st1}`);

  // ---------- Vyprázdněno ----------
  await rowOf(page, 'A 8').locator('[data-lkfree]').click();
  await page.waitForFunction(() => document.querySelectorAll('#lkView tr[data-lkrow]').length === 1);
  await saved(page);
  t = await tiles(page);
  check(t['K vyklizení'] === '1' && t['Volné skříňky'] === '4', `po vyprázdnění: ${JSON.stringify(t)}`);

  // ---------- vyřazení člověka se skříňkou ----------
  await page.evaluate(() => openPersonKey('svoboda|tomas'));
  await page.waitForSelector('#view-lide.on [data-exclude="svoboda|tomas"]');
  check(await page.isVisible('#view-lide .lk-person'), 'detail člověka: skříňka');
  check(/A 4/.test(await page.textContent('#view-lide .lk-person')), 'detail: A 4');
  await page.click('#view-lide [data-exclude="svoboda|tomas"]');
  await dlgOpen(page, /Vyřadit ze seznamu/);
  check(/Má skříňku A 4/.test(await page.textContent('#dlg')), 'potvrzení vyřazení zmíní skříňku');
  await page.click('#dlgOk');
  await page.waitForFunction(() => /Je třeba vyprázdnit skříňku A 4/.test(document.querySelector('#toast').textContent));
  await page.waitForSelector('#view-lide .note.lk-person');
  await page.screenshot({ path: path.join(shots, '04-lide-vyrazen.png') });
  await saved(page);
  check((await page.textContent('#navLockers')).trim() === '2', 'odznak po vyřazení 2');
  await page.click('#view-lide .note.lk-person [data-golk]');
  await page.waitForSelector('#view-skrinky.on');
  check(await page.evaluate(() => [...document.querySelectorAll('#lkView tr[data-lkrow] td.lk-lab')].map(x => x.textContent.trim()).join(',')) === 'A 4,A 7', 'K vyklizení A 4 a A 7');

  // ---------- přiřazení nespárované a přidělení volné ----------
  await page.click('#lkView [data-lkf="unknown"]');
  await rowOf(page, 'B 1').locator('[data-lkassign]').click();
  await dlgOpen(page, /Skříňka B 1/);
  check(/Xyz Qwerty/.test(await page.textContent('#dlg')), 'okno přiřazení ukáže napsané jméno');
  await page.selectOption('#dlg select[name="who"]', 'benes|cyril');
  await page.click('#dlgOk');
  await dlgClosed(page);
  await until(page, () => lkOf('benes|cyril').length === 1);
  await saved(page);
  await page.click('#lkView [data-lkf="without"]');
  await page.waitForSelector('#lkView [data-lkgive="cerna mala|lenka"]');
  check(await page.evaluate(() => [...document.querySelectorAll('#lkView .lk-who')].map(x => x.textContent).join(',')) === 'Černá Malá Lenka,Dvořák Pavel', 'bez skříňky: Černá Malá, Dvořák Pavel');
  await page.click('#lkView [data-lkgive="cerna mala|lenka"]');
  await dlgOpen(page, /Skříňka pro Černá Malá Lenka/);
  check(await page.inputValue('#dlg select[name="lk"]') === await page.evaluate(() => lkFind(S, document.querySelector('#dlg select[name="lk"]').value) && document.querySelector('#dlg select[name="lk"] option').value), 'první volná předvybraná');
  await page.click('#dlgOk');
  await dlgClosed(page);
  await until(page, () => lkOf('cerna mala|lenka').length === 1);
  await saved(page);
  const lenka = await page.evaluate(() => lkOf('cerna mala|lenka').map(lkLabel).join(','));
  check(lenka === 'A 8', `Lenka dostala první volnou: ${lenka}`);
  // přesun: Wagner z A 6 na A 9 (dosavadní uvolnit)
  await page.click('#lkView [data-lkf="all"]');
  await rowOf(page, 'A 9').locator('[data-lkassign]').click();
  await dlgOpen(page, /Skříňka A 9/);
  await page.selectOption('#dlg select[name="who"]', 'wagner|karel');
  await page.waitForSelector('#lkMoveBox:not([hidden])');
  check(/A 6/.test(await page.textContent('#lkMoveTxt')), 'přesun: dosavadní A 6');
  await page.click('#dlgOk');
  await dlgClosed(page);
  await until(page, () => lkOf('wagner|karel').map(lkLabel).join(',') === 'A 9');
  await saved(page);
  check(await page.evaluate(() => lkOf('wagner|karel').map(lkLabel).join(',')) === 'A 9', 'Wagner přesunut na A 9');

  // ---------- poznámka, řada ----------
  await rowOf(page, 'A 1').locator('[data-lknote]').fill('klíč u vrátného');
  await rowOf(page, 'A 1').locator('[data-lknote]').press('Enter');
  await saved(page);
  check(await page.evaluate(() => S.lockers.list.find(l => lkLabel(l) === 'A 1').note) === 'klíč u vrátného', 'poznámka uložena');
  await page.click('#lkRangeBtn');
  await dlgOpen(page, /Přidat řadu skříněk/);
  await page.fill('#dlg [name="row"]', 'c');
  await page.fill('#dlg [name="from"]', '1');
  await page.fill('#dlg [name="to"]', '5');
  await page.click('#dlgOk');
  await dlgClosed(page);
  await until(page, () => S.lockers.list.length === 17);
  await saved(page);
  t = await tiles(page);
  check(t['Volné skříňky'] === '8' && await page.evaluate(() => S.lockers.list.length) === 17, `řada C 1–5: ${JSON.stringify(t)}`);
  await page.fill('#lkQ', 'vrátn');
  await page.waitForFunction(() => document.querySelectorAll('#lkView tr[data-lkrow]').length === 1);
  check(await page.evaluate(() => document.activeElement && document.activeElement.id === 'lkQ'), 'hledání: kurzor zůstane v poli');
  await page.fill('#lkQ', '');
  await page.waitForFunction(() => document.querySelectorAll('#lkView tr[data-lkrow]').length === 17);
  await page.screenshot({ path: path.join(shots, '05-soupis.png'), fullPage: true });

  // ---------- štítky ----------
  const [dl1] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), rowOf(page, 'A 1').locator('[data-lklbl]').click()]);
  const f1 = path.join(shots, 'stitky-a1.pdf');
  await dl1.saveAs(f1);
  check(dl1.suggestedFilename() === 'stitky-skrinky-A1.pdf', `soubor štítků: ${dl1.suggestedFilename()}`);
  const p1 = readPdf(f1, 'stitek');
  check(p1.length === 2 && p1.every(p => p.w === 100 && p.h === 35), `štítky A 1: ${JSON.stringify(p1.map(p => [p.w, p.h]))}`);
  if (p1.length === 2) {
    check(p1[0].flat === 'SKŘÍŇKAA1' && p1[0].big >= 50 && p1[0].right > 0, `štítek na skříňku (jen označení, beze jména): ${JSON.stringify(p1[0])}`);
    check(p1[1].flat === 'SKŘÍŇKAA1ZÁLOŽNÍKLÍČ' && p1[1].maxX <= 50 && p1[1].right === 0, `štítek na klíč jen na levé polovině: ${JSON.stringify(p1[1])}`);
    check(p1.every(p => p.minX >= 2 && p.maxX <= 98 && p.border === 0), `štítky: potisk mimo okraj 1 mm: ${JSON.stringify(p1)}`);
  }
  await page.click('#lkLabelsBtn');
  await dlgOpen(page, /Tisk štítků skříněk/);
  await page.selectOption('#dlg select[name="row"]', 'C');
  check(await page.isChecked('#dlg input[value="row"]'), 'výběr řady zaškrtne Jen řada');
  await page.uncheck('#dlg input[name="locker"]');
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#dlgOk')]);
  const f2 = path.join(shots, 'stitky-c.pdf');
  await dl2.saveAs(f2);
  const p2 = readPdf(f2, 'stitky-c');
  check(p2.length === 5 && p2.map(p => p.flat).join(',') === [1, 2, 3, 4, 5].map(n => `SKŘÍŇKAC${n}ZÁLOŽNÍKLÍČ`).join(','), `řada C jen klíče: ${JSON.stringify(p2.map(p => p.flat))}`);
  await page.click('#lkLabelsBtn');
  await dlgOpen(page, /Tisk štítků skříněk/);
  const [dl3] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#dlgOk')]);
  const f3 = path.join(shots, 'stitky-vse.pdf');
  await dl3.saveAs(f3);
  const p3 = readPdf(f3, 'stitky-vse');
  check(p3.length === 34 && p3[0].flat === 'SKŘÍŇKAA1' && p3[1].flat === 'SKŘÍŇKAA1ZÁLOŽNÍKLÍČ' && p3[33].flat === 'SKŘÍŇKAC5ZÁLOŽNÍKLÍČ' && p3.every(p => p.border === 0), `všechny štítky po dvojicích: ${p3.length} ${p3.slice(0, 2).map(p => p.flat)}`);
  await page.click('#lkLabelsBtn');
  await dlgOpen(page, /Tisk štítků skříněk/);
  await page.uncheck('#dlg input[name="locker"]');
  await page.uncheck('#dlg input[name="key"]');
  await page.click('#dlgOk');
  await page.waitForSelector('#dlg .dlg-error');
  check(/aspoň jeden druh/.test(await page.textContent('#dlg .dlg-error')), 'bez druhu štítku: chyba');
  await page.click('#dlgCancel');
  await dlgClosed(page);

  // ---------- Excel ----------
  const [dx] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#lkXlsx')]);
  const fx = path.join(shots, 'skrinky.xlsx');
  await dx.saveAs(fx);
  const xr = spawnSync('python3', ['-c', XL, fx], { encoding: 'utf8' });
  if (xr.status !== 0) problems.push(`openpyxl: ${xr.stderr.slice(0, 300)}`);
  else {
    const x = JSON.parse(xr.stdout);
    const a7 = (x['Skříňky'] || []).find(r => r[0] === 'A 7') || [];
    check(Object.keys(x).join(',') === 'Skříňky,Bez skříňky' && x['Skříňky'].length === 18, `Excel listy: ${Object.keys(x)} ${x['Skříňky'] && x['Skříňky'].length}`);
    check(a7[3] === 'Kovaříková Zdeňka' && a7[6] === 'K vyklizení' && a7[7] === 'Je třeba vyprázdnit (vyřazený ze seznamu)' && a7[8] === 'Kovarikova', `Excel A 7: ${JSON.stringify(a7)}`);
    check((x['Bez skříňky'] || []).map(r => r[0]).join(',') === 'Příjmení a jméno,Dvořák Pavel', `Excel bez skříňky: ${JSON.stringify(x['Bez skříňky'])}`);
  }

  // ---------- historie ----------
  const log = await page.evaluate(() => S.log.filter(x => x.kind === 'locker').map(x => x.text));
  check(log.some(x => /^Vložen soupis skříněk \(12\): nově 12/.test(x)) && log.some(x => /^Skříňka A 8 uvolněna/.test(x)) && log.some(x => /^Skříňka B 1 přidělena: Beneš Cyril/.test(x))
    && log.some(x => /^Přidána řada skříněk C 1–5: 5 skříněk/.test(x)) && log.some(x => /^Skříňka A 1: poznámka „klíč u vrátného“/.test(x)) && log.some(x => /^Skříňka A 6 uvolněna \(Wagner Karel\)/.test(x)), `historie: ${JSON.stringify(log)}`);
  check(!log.some(x => /^Skříňka C \d přidána/.test(x)), 'řada je v historii jedním záznamem');
  await page.click('#logBtn');
  await dlgOpen(page, /Poslední změny/);
  const lf = page.locator('#dlg [data-lf="locker"]');
  check(await lf.count() === 1, 'filtr historie Skříňky');
  if (await lf.count()) { await lf.click(); await page.waitForTimeout(200); }
  await page.screenshot({ path: path.join(shots, '06-historie.png') });
  await page.keyboard.press('Escape');
  await dlgClosed(page);

  // ---------- smazání skříňky a smazání člověka ----------
  await rowOf(page, 'C 5').locator('[data-lkdel]').click();
  await dlgOpen(page, /Smazat skříňku C 5/);
  await page.click('#dlgOk');
  await dlgClosed(page);
  await until(page, () => S.lockers.list.length === 16);
  await saved(page);
  check(await page.evaluate(() => S.lockers.list.length) === 16, 'C 5 smazána');
  await page.evaluate(() => openPersonKey('simek|ondrej'));
  await page.waitForSelector('#view-lide.on #pDel');
  await page.click('#pDel');
  await dlgOpen(page, /Smazat člověka/);
  check(/Má skříňku A 5/.test(await page.textContent('#dlg')), 'smazání člověka zmíní skříňku');
  await page.click('#dlgOk');
  await dlgClosed(page);
  await until(page, () => !S.employees['simek|ondrej']);
  await saved(page);
  await page.evaluate(() => showView('skrinky'));
  t = await tiles(page);
  check(t['K vyklizení'] === '3', `po smazání člověka K vyklizení 3: ${JSON.stringify(t)}`);
  check(await page.evaluate(() => /Šimek Ondřej/.test(document.querySelector('#lkView .lk-alert').textContent) && /už není v Lidech/.test(document.querySelector('#lkView .lk-alert').textContent)), 'smazaný: jméno zůstane, už není v Lidech');

  // ---------- nové přihlášení ----------
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2b = await ctx2.newPage();
  await watch(p2b, 'znovu');
  await p2b.goto(BASE);
  await p2b.waitForSelector('#manual');
  await p2b.click('#manual');
  await p2b.fill('[name="key"]', key);
  await p2b.click('#keyForm button[type="submit"]');
  await p2b.waitForSelector('#skip');
  await p2b.click('#skip');
  await p2b.waitForSelector('#view-prehled.on');
  const again = await p2b.evaluate(() => ({ n: S.lockers.list.length, a5: (S.lockers.list.find(l => lkLabel(l) === 'A 5') || {}).name, badge: document.querySelector('#navLockers').textContent, keys: Object.keys(sharedState(S).lockers).join(',') }));
  check(again.n === 16 && again.a5 === 'Šimek Ondřej' && again.badge === '3' && again.keys === 'list', `po novém přihlášení: ${JSON.stringify(again)}`);
  await ctx2.close();

  // ---------- telefon: okno pro vložení ----------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { lkUi().f = 'all'; showView('skrinky'); });
  await page.waitForSelector('#lkView table.lk-tab');
  await page.waitForTimeout(300);
  let over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(over <= 1, `telefon: přetečení ${over} px`);
  await page.screenshot({ path: path.join(shots, '07-telefon.png'), fullPage: true });
  await page.click('#lkPasteBtn');
  await dlgOpen(page, /Tabulka z Excelu/);
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'D\t1\tPavel Dvorak\nD\t2\t');
    document.querySelector('#dlg textarea[name="t"]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await dlgOpen(page, /Uložit soupis/);
  check(await page.evaluate(() => document.querySelector('#dlg details.lk-auto select').value) === 'dvorak|pavel', 'telefon: Pavel Dvorak spárován');
  over = await page.evaluate(() => document.querySelector('#dlg').scrollWidth - document.querySelector('#dlg').clientWidth);
  check(over <= 1, `telefon: okno přetéká ${over} px`);
  await page.screenshot({ path: path.join(shots, '08-telefon-okno.png') });
  await page.click('#dlgOk');
  await dlgClosed(page);
  await until(page, () => S.lockers.list.length === 18);
  await saved(page);
  check(await page.evaluate(() => lkOf('dvorak|pavel').map(lkLabel).join(',')) === 'D 1' && await page.evaluate(() => S.lockers.list.length) === 18, 'telefon: D 1 a D 2 přidány, ostatní zůstaly');
  await ctx.close();
  await browser.close();
  if (problems.length) {
    console.log('PROBLÉMY:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
  console.log('e2e Skříňky: vše v pořádku');
})().catch(err => { console.error(err); if (problems.length) console.log('PROBLÉMY do pádu:\n - ' + problems.join('\n - ')); process.exit(1); });
