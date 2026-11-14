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
const http = require('http');
// tisková stránka: Chrome zaokrouhlí 100 × 35 mm na celé body (99,75 × 34,92 mm)
const isLabel = p => Math.abs(p.w - 100) <= 0.3 && Math.abs(p.h - 35) <= 0.2;
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
    total = sum(1 for i in range(pw * ph) if px[i] < 128)
    frame = sum(1 for y in range(int(5 * mm), int(30 * mm)) for x in range(int(0.7 * mm), int(1.6 * mm) + 1) if ink(x, y))
    out.append({'w': round(W / 72 * 25.4, 1), 'h': round(H / 72 * 25.4, 1), 'text': ' | '.join(t for _, t, _ in spans), 'flat': ''.join(t for _, t, _ in spans).replace(' ', ''), 'border': border, 'right': right, 'ink': total, 'frame': frame,
                'maxX': round(max([b[2] for b, _, _ in spans] or [0]) / 72 * 25.4, 1), 'minX': round(min([b[0] for b, _, _ in spans] or [0]) / 72 * 25.4, 1),
                'maxY': round(max([b[3] for b, _, _ in spans] or [0]) / 72 * 25.4, 1), 'big': round(max([z for _, _, z in spans] or [0]))})
    if len(out) <= 2: p.get_pixmap(dpi=200).save(sys.argv[2] + f'-{len(out)}.png')
cat = d.xref_object(d.pdf_catalog(), compressed=True)
for o in out: o['vp'] = ('/PrintScaling/None' in cat.replace(' ', '')) and ('/PickTrayByPDFSize' in cat) and ('/NumCopies1' in cat.replace(' ', ''))
print(json.dumps(out))`;
const XL = String.raw`
import sys, json
from openpyxl import load_workbook
wb = load_workbook(sys.argv[1]); print(json.dumps({ws.title: [[c if c is not None else '' for c in r] for r in ws.iter_rows(values_only=True)] for ws in wb.worksheets}))`;
/** Počká na n-tý tisk a uloží tiskovou stránku jako PDF (page.pdf zpracuje stránku stejně jako tisk:
    @page 100 × 35 mm bez okrajů, jen obrázky štítků), pak pošle afterprint a zkontroluje úklid. */
async function printedPdf(page, n, file) {
  await page.waitForFunction(n => (window.__printed || 0) >= n && document.body.classList.contains('lk-printing'), n, { timeout: 60000 });
  const info = await page.evaluate(() => ({ imgs: [...document.querySelectorAll('#lkPrintArea img')].map(i => `${i.naturalWidth}x${i.naturalHeight}`),
    page: document.adoptedStyleSheets.some(sh => [...sh.cssRules].some(r => /size: 100mm 35mm/.test(r.cssText) && /margin: 0/.test(r.cssText))), frames: document.querySelectorAll('iframe').length }));
  fs.writeFileSync(file, await page.pdf({ preferCSSPageSize: true, printBackground: true }));
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.waitForFunction(() => !document.querySelector('#lkPrintArea') && !document.body.classList.contains('lk-printing') && !document.adoptedStyleSheets.length);
  if (!info.page || !info.imgs.length || info.imgs.some(x => x !== '800x280') || info.frames) problems.push(`tisk ${n}: ${JSON.stringify(info)}`);
  return info;
}
/** Dekódování ^GFA s kompresí ZPL (stejné jako v test_core). */
function zplDecode(gfa) {
  const m = /^\^GFA,(\d+),(\d+),(\d+),(.*)$/s.exec(gfa);
  const total = +m[1], bpr = +m[3], h = total / bpr, src = m[4], hexW = bpr * 2, rows = [];
  let i = 0, prev = null;
  while (rows.length < h && i <= src.length) {
    if (src[i] === ':') { rows.push(prev); i += 1; continue; }
    let row = '';
    while (row.length < hexW && i < src.length) {
      const c = src[i];
      if (c === ',') { row = row.padEnd(hexW, '0'); i += 1; break; }
      if (c === '!') { row = row.padEnd(hexW, 'F'); i += 1; break; }
      if (c === ':') break;
      let n = 0;
      while (/[G-Yg-z]/.test(src[i])) { const k = src[i]; n += k >= 'g' ? (k.charCodeAt(0) - 102) * 20 : k.charCodeAt(0) - 70; i += 1; }
      row += src[i].repeat(n || 1); i += 1;
    }
    rows.push(row); prev = row;
  }
  return { bpr, h, rows };
}
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
  // tisk štítků (2.81) jde rovnou do okna tisku přes skrytý rámec: v testu se print v rámci nahradí počítadlem
  // a uschová se poslední PDF (bezhlavý prohlížeč skutečné okno tisku nemá)
  await page.addInitScript(() => {
    window.print = () => { try { window.top.__printed = (window.top.__printed || 0) + 1; window.top.__printUrl = location.href; } catch (e) { /* jiný původ */ } };
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = b => { const u = orig(b); if (b && b.type === 'application/pdf') { window.__pdfs = window.__pdfs || {}; window.__pdfs[u] = b; } return u; };
  });
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
  // 2.81: po vyřazení nabídne štítek s výzvou k vyklizení (lhůta 7 pracovních dnů)
  await dlgOpen(page, /Je třeba vyprázdnit skříňku A 4/);
  const dl0 = await page.evaluate(() => ({ until: dayText(lkWorkDaysAdd(todayIso(), 7)), today: dayText(todayIso()) }));
  check(new RegExp(`do ${dl0.until}`).test(await page.textContent('#dlg')) && /komisionálně otevřena a vyklizena/.test(await page.textContent('#dlg')), `nabídka výzvy: ${await page.textContent('#dlg')}`);
  await page.screenshot({ path: path.join(shots, '04a-nabidka-vyzvy.png') });
  await page.click('#dlgOk');
  const fn = path.join(shots, 'vyzva-a4.pdf');
  const ia = await printedPdf(page, 1, fn);
  check(await page.evaluate(() => /^Tisk: 1 štítek 100 × 35 mm/.test(document.querySelector('#toast').textContent)) && ia.imgs.length === 1, 'výzva jde rovnou do okna tisku (obrázek štítku)');
  const pa = readPdf(fn, 'vyzva-tisk');
  check(pa.length === 1 && isLabel(pa[0]) && pa[0].border === 0 && pa[0].ink > 2000, `výzva v tisku: jedna stránka 100 × 35 mm, nic na okraji ${JSON.stringify(pa)}`);
  // text výzvy ve staženém PDF (stejné kreslení)
  const [dn] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.evaluate(() => lkNoticePrint([S.lockers.list.find(l => lkLabel(l) === 'A 4').id], 'download'))]);
  const fnd = path.join(shots, 'vyzva-a4-stazena.pdf');
  await dn.saveAs(fnd);
  const pn = readPdf(fnd, 'vyzva');
  check(dn.suggestedFilename() === 'vyzva-skrinka-A4.pdf' && pn.length && pn[0].vp, 'stažené PDF výzvy: skutečná velikost, papír podle stránky, 1 kopie');
  const flat = t => t.replace(/ /g, '');
  check(pn.length === 1 && pn[0].w === 100 && pn[0].h === 35 && pn[0].border === 0 && pn[0].maxX <= 98, `výzva: rozměr a okraje ${JSON.stringify(pn[0])}`);
  if (pn.length) check(pn[0].flat === flat(`VÝZVA K VYKLIZENÍSKŘÍŇKA A 4Používáte tuto skříňku? Nahlaste se u vedoucího nejpozdějido ${dl0.until} (7 pracovních dnů).Poté bude skříňka komisionálně otevřena a vyklizena.Vyvěšeno ${dl0.today}`) && !/Svoboda/.test(pn[0].text),
    `výzva: text ${pn[0].flat}`);
  await until(page, () => !!(S.lockers.list.find(l => lkLabel(l) === 'A 4') || {}).notice);
  await page.waitForSelector('#view-lide .note.lk-person');
  await page.screenshot({ path: path.join(shots, '04-lide-vyrazen.png') });
  await saved(page);
  check((await page.textContent('#navLockers')).trim() === '2', 'odznak po vyřazení 2');
  await page.click('#view-lide .note.lk-person [data-golk]');
  await page.waitForSelector('#view-skrinky.on');
  check(await page.evaluate(() => [...document.querySelectorAll('#lkView tr[data-lkrow] td.lk-lab')].map(x => x.textContent.trim()).join(',')) === 'A 4,A 7', 'K vyklizení A 4 a A 7');
  check(await rowOf(page, 'A 4').locator('.lk-notice').count() === 1 && new RegExp(`lhůta do ${dl0.until}`).test(await rowOf(page, 'A 4').textContent()) && /výzva vyvěšena/.test(await rowOf(page, 'A 4').locator('.lk-tags').textContent()), 'řádek A 4: výzva a lhůta');
  check(await rowOf(page, 'A 7').locator('.lk-notice').count() === 0, 'A 7 bez výzvy');
  await page.screenshot({ path: path.join(shots, '04b-vyzva-v-radku.png') });

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
  await rowOf(page, 'A 1').locator('[data-lklbl]').click();
  const f1 = path.join(shots, 'stitky-a1.pdf');
  await printedPdf(page, 2, f1);
  const t1 = readPdf(f1, 'stitek-tisk');
  check(t1.length === 2 && t1.every(p => isLabel(p) && p.border === 0 && p.ink > 2000) && t1[1].right === 0, `štítky A 1 v tisku: ${JSON.stringify(t1.map(p => [p.w, p.h, p.border, p.right]))}`);
  const [dd1] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.evaluate(() => lkLabelsPdf([S.lockers.list.find(l => lkLabel(l) === 'A 1')], {}, 'A1', 'download'))]);
  const f1d = path.join(shots, 'stitky-a1-stazene.pdf');
  await dd1.saveAs(f1d);
  const p1 = readPdf(f1d, 'stitek');
  check(dd1.suggestedFilename() === 'stitky-skrinky-A1.pdf' && p1.length === 2 && p1.every(p => p.w === 100 && p.h === 35 && p.vp), `štítky A 1 (PDF): ${JSON.stringify(p1.map(p => [p.w, p.h, p.vp]))}`);
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
  await page.selectOption('#dlg select[name="out"]', 'download');
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#dlgOk')]);
  const f2 = path.join(shots, 'stitky-c.pdf');
  await dl2.saveAs(f2);
  check(dl2.suggestedFilename() === 'stitky-skrinky-rada-C.pdf' && await page.evaluate(() => window.__printed) === 2, `Jen stáhnout PDF: ${dl2.suggestedFilename()}`);
  const p2 = readPdf(f2, 'stitky-c');
  check(p2.length === 5 && p2.map(p => p.flat).join(',') === [1, 2, 3, 4, 5].map(n => `SKŘÍŇKAC${n}ZÁLOŽNÍKLÍČ`).join(','), `řada C jen klíče: ${JSON.stringify(p2.map(p => p.flat))}`);
  await page.click('#lkLabelsBtn');
  await dlgOpen(page, /Tisk štítků skříněk/);
  await page.waitForFunction(() => !/Hledám/.test(document.querySelector('#lkZbState').textContent));
  check(/Otevře se okno tisku se štítky 100 × 35 mm bez okrajů/.test(await page.textContent('#dlg .lk-printhint')), 'nápověda k tisku (bez Zebra Browser Print)');
  await page.click('#dlgOk');
  const f3 = path.join(shots, 'stitky-vse.pdf');
  const i3 = await printedPdf(page, 3, f3);
  const p3 = readPdf(f3, 'stitky-vse');
  check(i3.imgs.length === 34 && p3.length === 34 && p3.every(p => isLabel(p) && p.border === 0 && p.ink > 2000) && p3.filter((p, i) => i % 2).every(p => p.right === 0), `všechny štítky po dvojicích, každý na své stránce: ${p3.length}`);
  // zkušební štítek: rámeček 1 mm od okraje
  await page.click('#lkLabelsBtn');
  await dlgOpen(page, /Tisk štítků skříněk/);
  await page.check('#dlg input[name="which"][value="test"]');
  await page.uncheck('#dlg input[name="locker"]');
  await page.uncheck('#dlg input[name="key"]');
  await page.click('#dlgOk');
  const ft = path.join(shots, 'zkusebni.pdf');
  await printedPdf(page, 4, ft);
  const pt = readPdf(ft, 'zkusebni');
  check(pt.length === 1 && isLabel(pt[0]) && pt[0].frame > 50 && pt[0].border === 0, `zkušební štítek: ${JSON.stringify(pt)}`);
  await page.click('#lkLabelsBtn');
  await dlgOpen(page, /Tisk štítků skříněk/);
  await page.uncheck('#dlg input[name="locker"]');
  await page.uncheck('#dlg input[name="key"]');
  await page.click('#dlgOk');
  await page.waitForSelector('#dlg .dlg-error');
  check(/aspoň jeden druh/.test(await page.textContent('#dlg .dlg-error')), 'bez druhu štítku: chyba');
  await page.click('#dlgCancel');
  await dlgClosed(page);

  // ---------- ZPL pro Zebru 203 dpi a přímý tisk přes Zebra Browser Print (náhradní služba na 127.0.0.1:9100) ----------
  const zbWrites = [];
  const zb = http.createServer((req, res) => {
    const head = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (req.method === 'GET' && req.url.startsWith('/default')) { res.writeHead(200, head); res.end(JSON.stringify({ name: 'ZD421-test', uid: 'zd421-test', connection: 'usb', deviceType: 'printer', provider: 'com.zebra.ds.webdriver.desktop.provider.DefaultDeviceProvider', manufacturer: 'Zebra Technologies' })); return; }
    if (req.method === 'POST' && req.url === '/write') { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { zbWrites.push({ type: req.headers['content-type'], body: b }); res.writeHead(200, head); res.end(''); }); return; }
    res.writeHead(404, head); res.end('');
  });
  await new Promise(r => zb.listen(9100, '127.0.0.1', r));
  await page.evaluate(() => { ui.zebra = null; });
  const printedBefore = await page.evaluate(() => window.__printed);
  await rowOf(page, 'A 1').locator('[data-lklbl]').click();
  await page.waitForFunction(() => /^Odesláno na Zebru ZD421-test: 2 štítky 100 × 35 mm/.test(document.querySelector('#toast').textContent), null, { timeout: 30000 });
  check(zbWrites.length === 1 && /^text\/plain/.test(zbWrites[0].type) && await page.evaluate(() => window.__printed) === printedBefore, `Browser Print: jeden zápis bez okna tisku (${zbWrites.length})`);
  if (zbWrites.length) {
    const w = JSON.parse(zbWrites[0].body);
    const labels = w.data.split('\n');
    check(w.device && w.device.uid === 'zd421-test' && labels.length === 2 && labels.every(z => /^\^XA\^PW800\^LL280\^LH0,0\^FO0,0\^GFA,28000,28000,100,/.test(z) && z.endsWith('^FS^PQ1^XZ')), `ZPL: hlavička ${labels.map(z => z.slice(0, 50))}`);
    const bitsOf = z => { const d = zplDecode(/\^GFA[^^]*/.exec(z)[0]); return d.rows.map(r => r.match(/../g).map(b => parseInt(b, 16).toString(2).padStart(8, '0')).join('')); };
    const ink = (rows, f) => rows.reduce((n, r, y) => n + [...r].filter((c, x) => c === '1' && f(x, y)).length, 0);
    const [b1, b2] = labels.map(bitsOf);
    const edge = (x, y) => x < 8 || x >= 792 || y < 8 || y >= 272;
    check(ink(b1, (x, y) => x > 200 && x < 600 && y > 80 && y < 250) > 3000 && ink(b1, edge) === 0, `ZPL štítek na skříňku: ${ink(b1, () => true)} bodů, okraj ${ink(b1, edge)}`);
    check(ink(b2, (x, y) => x < 390) > 3000 && ink(b2, x => x > 412) === 0 && ink(b2, (x, y) => edge(x, y) && (x < 392 || x > 408)) === 0, `ZPL štítek na klíč: pravá polovina ${ink(b2, x => x > 412)}, okraj ${ink(b2, (x, y) => edge(x, y) && (x < 392 || x > 408))}`);
    [b1, b2].forEach((rows, i) => fs.writeFileSync(path.join(shots, `zpl-${i + 1}.pbm`), `P1\n800 280\n${rows.join('\n')}\n`));
    spawnSync('python3', ['-c', 'import sys\nfrom PIL import Image\nfor f in sys.argv[1:]: Image.open(f).convert("L").save(f[:-4] + ".png")', ...[1, 2].map(i => path.join(shots, `zpl-${i}.pbm`))]);
  }
  // hromadně: stav Zebry v okně a stažení ZPL
  await page.click('#lkLabelsBtn');
  await dlgOpen(page, /Tisk štítků skříněk/);
  await page.waitForFunction(() => /Tiskne se rovnou na Zebru ZD421-test/.test(document.querySelector('#lkZbState').textContent));
  await page.selectOption('#dlg select[name="row"]', 'C');
  await page.selectOption('#dlg select[name="out"]', 'zpl');
  const [dz] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#dlgOk')]);
  const fz = path.join(shots, 'stitky-c.zpl');
  await dz.saveAs(fz);
  const zt = fs.readFileSync(fz, 'utf8');
  check(dz.suggestedFilename() === 'stitky-skrinky-rada-C.zpl' && (zt.match(/\^XA\^PW800\^LL280\^LH0,0/g) || []).length === 10 && (zt.match(/\^PQ1\^XZ/g) || []).length === 10 && zbWrites.length === 1, `ZPL soubor řady C: ${dz.suggestedFilename()} ${(zt.match(/\^XA/g) || []).length}`);
  await new Promise(r => zb.close(r));
  await page.evaluate(() => { ui.zebra = null; });

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
    check(a7[3] === 'Kovaříková Zdeňka' && a7[6] === 'K vyklizení' && a7[7] === 'Je třeba vyprázdnit (vyřazený ze seznamu)' && a7[8] === 'ano' && a7[9] === 'Kovarikova', `Excel A 7: ${JSON.stringify(a7)}`);
    check((x['Bez skříňky'] || []).map(r => r[0]).join(',') === 'Příjmení a jméno,Dvořák Pavel', `Excel bez skříňky: ${JSON.stringify(x['Bez skříňky'])}`);
  }

  // ---------- historie ----------
  const log = await page.evaluate(() => S.log.filter(x => x.kind === 'locker').map(x => x.text));
  check(log.some(x => /^Vložen soupis skříněk \(12\): nově 12/.test(x)) && log.some(x => /^Skříňka A 8 uvolněna/.test(x)) && log.some(x => /^Skříňka B 1 přidělena: Beneš Cyril/.test(x))
    && log.some(x => /^Přidána řada skříněk C 1–5: 5 skříněk/.test(x)) && log.some(x => /^Skříňka A 1: poznámka „klíč u vrátného“/.test(x)) && log.some(x => /^Skříňka A 6 uvolněna \(Wagner Karel\)/.test(x)) && log.some(x => /^Skříňka A 4: vyvěšena výzva k vyklizení, lhůta do /.test(x)), `historie: ${JSON.stringify(log)}`);
  check(!log.some(x => /^Skříňka C \d přidána/.test(x)), 'řada je v historii jedním záznamem');
  await page.click('#logBtn');
  await dlgOpen(page, /Poslední změny/);
  const lf = page.locator('#dlg [data-lf="locker"]');
  check(await lf.count() === 1, 'filtr historie Skříňky');
  if (await lf.count()) { await lf.click(); await page.waitForTimeout(200); }
  await page.screenshot({ path: path.join(shots, '06-historie.png') });
  await page.keyboard.press('Escape');
  await dlgClosed(page);

  // ---------- 2.82: sdílená skříňka (víc lidí), odchod jednoho = odebrat ----------
  await page.evaluate(() => { lkUi().f = 'all'; lkUi().q = ''; showView('skrinky'); });
  await rowOf(page, 'A 1').locator('[data-lkaddp]').click();
  await dlgOpen(page, /Další člověk do skříňky A 1/);
  check(await page.locator('#dlg select[name="who"] option[value="novak|jan"]').count() === 0, 'kdo už ve skříňce je, v nabídce není');
  await page.selectOption('#dlg select[name="who"]', 'dvorak|pavel');
  await page.click('#dlgOk');
  await dlgClosed(page);
  await until(page, () => lkKeys(S.lockers.list.find(l => lkLabel(l) === 'A 1')).join('+') === 'novak|jan+dvorak|pavel');
  await saved(page);
  check(await rowOf(page, 'A 1').locator('.lk-pp').count() === 2 && await rowOf(page, 'A 1').locator('[data-lkrm]').count() === 2 && /sdílená · 2/.test(await rowOf(page, 'A 1').locator('.lk-tags').textContent()), 'A 1: dva lidé, každý jde odebrat, štítek sdílená');
  check(!(await page.evaluate(() => lkOverview(S.lockers, S.employees, todayIso()).without.length)), 'Dvořák Pavel už není bez skříňky');
  await page.screenshot({ path: path.join(shots, '07a-sdilena.png') });
  await page.evaluate(() => openPersonKey('dvorak|pavel'));
  await page.waitForSelector('#view-lide.on .lk-person');
  check(/Skříňka A 1\s+sdílí s Novák Jan/.test(await page.textContent('#view-lide .lk-person')), `detail: sdílí ${await page.textContent('#view-lide .lk-person')}`);
  // vyřazení jednoho ze dvou: potvrzení a okno Odebrat; Později = skříňka zůstane obsazená s „odebrat“
  await page.evaluate(() => openPersonKey('novak|jan'));
  await page.waitForSelector('#view-lide.on [data-exclude="novak|jan"]');
  await page.click('#view-lide [data-exclude="novak|jan"]');
  await dlgOpen(page, /Vyřadit ze seznamu/);
  check(/Sdílí skříňku A 1: jeho věci je třeba vyklidit a odebrat ho ze skříňky/.test(await page.textContent('#dlg')), `potvrzení: sdílená ${await page.textContent('#dlg')}`);
  await page.click('#dlgOk');
  await dlgOpen(page, /Odebrat ze sdílené skříňky A 1/);
  check(/sdílí skříňku A 1 \(Dvořák Pavel\)/.test(await page.textContent('#dlg')), 'okno: s kým sdílí');
  await page.click('#dlgCancel');
  await dlgClosed(page);
  await page.waitForFunction(() => /Odeber Novák Jan ze skříňky A 1/.test(document.querySelector('#toast').textContent));
  await saved(page);
  await page.evaluate(() => showView('skrinky'));
  check(await page.evaluate(() => { const x = lkOverview(S.lockers, S.employees, todayIso()).rows.find(r => lkLabel(r.l) === 'A 1'); return x.st === 'used' && x.leaving.map(p => p.key).join() === 'novak|jan'; }), 'A 1 zůstane obsazená, Novák odebrat');
  check((await page.textContent('#navLockers')).trim() === '3' && /Odebrat ze sdílené skříňky:\s*A 1 \(Novák Jan, vyřazený ze seznamu\)/.test(await page.textContent('#lkView')), 'odznak 2 K vyklizení + 1 odebrat, pruh Odebrat');
  await page.click('#lkView .chip[data-lkf="leave"]');
  check(await page.evaluate(() => [...document.querySelectorAll('#lkView tr[data-lkrow] td.lk-lab')].map(x => x.textContent.trim()).join(',')) === 'A 1' && /odebrat Novák Jan/.test(await rowOf(page, 'A 1').locator('.lk-tags').textContent()), 'filtr Odebrat: A 1');
  await page.screenshot({ path: path.join(shots, '07b-odebrat.png') });
  await rowOf(page, 'A 1').locator('[data-lkrm][data-lkkey="novak|jan"]').click();
  await dlgOpen(page, /Odebrat ze skříňky A 1/);
  await page.click('#dlgOk');
  await dlgClosed(page);
  await until(page, () => lkKeys(S.lockers.list.find(l => lkLabel(l) === 'A 1')).join() === 'dvorak|pavel');
  await saved(page);
  check((await page.textContent('#navLockers')).trim() === '2', 'po odebrání odznak 2');
  // Přidělit skříňku člověku bez skříňky: sdílet obsazenou A 2
  await page.evaluate(() => { const k = 'novy|karel'; S.employees[k] = { key: k, first: 'Karel', last: 'Nový', positionId: '' }; save(); lkUi().f = 'without'; renderAll(); });
  await saved(page);
  await page.click('#lkView [data-lkgive="novy|karel"]');
  await dlgOpen(page, /Skříňka pro Nový Karel/);
  check(await page.locator('#dlg optgroup[label="Sdílet obsazenou"] option').count() > 0, 'nabídka: sdílet obsazenou');
  const a2 = await page.evaluate(() => S.lockers.list.find(l => lkLabel(l) === 'A 2').id);
  await page.selectOption('#dlg select[name="lk"]', a2);
  await page.click('#dlgOk');
  await dlgClosed(page);
  await until(page, () => lkKeys(S.lockers.list.find(l => lkLabel(l) === 'A 2')).join() === 'novakova|jana,novy|karel');
  await saved(page);
  // Není záložní klíč: A 2
  await page.evaluate(() => { lkUi().f = 'all'; renderLockers(); });
  await rowOf(page, 'A 2').locator('[data-lknokey]').click();
  await until(page, () => !!S.lockers.list.find(l => lkLabel(l) === 'A 2').nokey);
  await saved(page);
  check(await rowOf(page, 'A 2').locator('[data-lknokey][aria-pressed="true"]').count() === 1 && /bez záložního klíče/.test(await rowOf(page, 'A 2').locator('.lk-tags').textContent()), 'A 2: není záložní klíč');
  check(/Bez záložního klíče\s*1/.test(await page.textContent('#lkView .lk-chips')), 'filtr Bez záložního klíče');
  const [dk] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.evaluate(() => lkLabelsPdf([S.lockers.list.find(l => lkLabel(l) === 'A 2')], {}, 'A2', 'download'))]);
  const fk = path.join(shots, 'stitky-a2-bez-klice.pdf');
  await dk.saveAs(fk);
  const pk = readPdf(fk, 'stitky-a2');
  check(pk.length === 1 && pk[0].flat === 'SKŘÍŇKAA2', `A 2 bez záložního klíče: jen štítek na skříňku ${JSON.stringify(pk.map(p => p.flat))}`);
  await page.screenshot({ path: path.join(shots, '07c-bez-klice.png') });
  const log82 = await page.evaluate(() => S.log.filter(x => x.kind === 'locker').map(x => x.text));
  check(['Skříňka A 1: přidán další člověk Dvořák Pavel', 'Skříňka A 1: odebrán Novák Jan', 'Skříňka A 2: přidán další člověk Nový Karel', 'Skříňka A 2: není záložní klíč'].every(t => log82.includes(t)), `historie 2.82: ${JSON.stringify(log82.slice(-6))}`);

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
  await dlgOpen(page, /Je třeba vyprázdnit skříňku A 5/);
  await page.click('#dlgCancel');
  await page.waitForFunction(() => /Je třeba vyprázdnit skříňku A 5\. Výzvu vytiskneš ve Skříňkách/.test(document.querySelector('#toast').textContent));
  await until(page, () => !S.employees['simek|ondrej']);
  await saved(page);
  check(!(await page.evaluate(() => !!(S.lockers.list.find(l => lkLabel(l) === 'A 5') || {}).notice)), 'Později: výzva se nevyvěsí');
  await page.evaluate(() => showView('skrinky'));
  t = await tiles(page);
  check(t['K vyklizení'] === '3', `po smazání člověka K vyklizení 3: ${JSON.stringify(t)}`);
  check(await page.evaluate(() => /Šimek Ondřej/.test(document.querySelector('#lkView .lk-alert').textContent) && /už není v Lidech/.test(document.querySelector('#lkView .lk-alert').textContent)), 'smazaný: jméno zůstane, už není v Lidech');
  // výzvy hromadně z pruhu: A 4 drží svou (uplynulou) lhůtu, A 5 a A 7 dostanou novou
  await page.evaluate(() => { const l = S.lockers.list.find(x => lkLabel(x) === 'A 4'); l.notice = { at: '2026-01-02', until: '2026-01-13', by: 'Mistr haly' }; save(); renderLockers(); });
  await saved(page);
  check(/lhůta uplynula/.test(await rowOf(page, 'A 4').locator('.lk-tags').textContent()) && /lhůta výzvy uplynula 13\. 1\. 2026, lze vyklidit/.test(await rowOf(page, 'A 4').locator('.lk-notice.late').textContent()), 'A 4: lhůta uplynula');
  check(/Vytisknout výzvy \(3\)/.test(await page.textContent('#lkView [data-lknoticeall]')), 'tlačítko Vytisknout výzvy (3)');
  await page.click('#lkView [data-lknoticeall]');
  const fv = path.join(shots, 'vyzvy.pdf');
  await printedPdf(page, 5, fv);
  const pvt = readPdf(fv, 'vyzvy-tisk');
  check(pvt.length === 3 && pvt.every(p => isLabel(p) && p.border === 0 && p.ink > 2000), `výzvy v tisku: ${pvt.length}`);
  const [dv] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.evaluate(() => lkNoticePrint(lkOverview(S.lockers, S.employees, todayIso()).rows.filter(x => x.st === 'clear').map(x => x.l.id), 'download'))]);
  const fvd = path.join(shots, 'vyzvy-stazene.pdf');
  await dv.saveAs(fvd);
  const pv = readPdf(fvd, 'vyzvy');
  check(pv.length === 3 && /SKŘÍŇKAA4.*do13\.1\.2026/.test(pv[0].flat) && pv.slice(1).every(p => new RegExp(`do${flat(dl0.until).replace(/\./g, '\\.')}`).test(p.flat)) && /SKŘÍŇKAA5/.test(pv[1].flat) && /SKŘÍŇKAA7/.test(pv[2].flat) && pv.every(p => p.border === 0),
    `výzvy hromadně: ${JSON.stringify(pv.map(p => p.flat))}`);
  await until(page, () => S.lockers.list.filter(l => l.notice).length === 3);
  await saved(page);
  await page.screenshot({ path: path.join(shots, '06b-vyzvy.png') });

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
  check(await page.evaluate(() => lkOf('dvorak|pavel').map(lkLabel).join(',')) === 'A 1,D 1' && await page.evaluate(() => S.lockers.list.length) === 18, 'telefon: D 1 a D 2 přidány, ostatní zůstaly');
  // i na telefonu se tiskne přes okno tisku (obrázky štítků, Browser Print se tam nehledá)
  await page.evaluate(() => { lkUi().f = 'all'; renderLockers(); });
  await rowOf(page, 'D 1').locator('[data-lklbl]').click();
  const fp = path.join(shots, 'stitky-telefon.pdf');
  await printedPdf(page, 6, fp);
  const pp = readPdf(fp, 'stitky-telefon');
  check(pp.length === 2 && pp.every(p => isLabel(p) && p.border === 0), `telefon: tisk štítků ${JSON.stringify(pp.map(p => [p.w, p.h]))}`);
  await ctx.close();
  await browser.close();
  if (problems.length) {
    console.log('PROBLÉMY:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
  console.log('e2e Skříňky: vše v pořádku');
})().catch(err => { console.error(err); if (problems.length) console.log('PROBLÉMY do pádu:\n - ' + problems.join('\n - ')); process.exit(1); });
