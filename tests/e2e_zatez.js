// Prohlížečový průchod 2.79.2: zátěž obrazovek nejhoršími realistickými daty (postup „break-ui“). Do Shortage,
// Po termínu, Docházky a Lidí vloží extrémní hodnoty: dlouhý název dílu, nezalomitelné číslo objednávky, dlouhý
// activeBarcode, index, množství 1 000 000, operace a oddělení s dlouhým názvem, poznámka od plánování o 2000
// znacích, sestavu s 50 poddíly, skluz záporný, desetinný i obří, jména s diakritikou a pomlčkami. Na monitoru
// 1280 / 1440 / 1920 a telefonu 390 / 320 hlídá: stránka se neposouvá do strany, tabulka Shortage a Docházky se
// na monitoru vejde, čip filtru nepřeteče, poznámka nenatáhne řádek, v textu není NaN / undefined. V PDF Shortage
// a Po termínu: žádný text mimo stranu ani přes sebe, objednávka, množství a kód pod QR jsou celé.
// Vymyšlená data, odkazy is.example. Spuštění jako ostatní e2e (tests/run_e2e.sh e2e_zatez); snímky v $S/oshots-zatez.
const { chromium } = require(process.env.PW);
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const S = process.env.S;
const BASE = process.env.BASE || 'http://127.0.0.1:8490/';
const shots = path.join(S, 'oshots-zatez');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

const W = {
  name: 'Hřídel předlohová s ozubením pro převodovku typ KX-2000 — revize C (náhradní díl pro sériovou výrobu)',
  order: 'ZAKÁZKA-2026-000000123456789-REV-C-NÁHRADNÍ-DÍL-PRO-SÉRIOVOU-VÝROBU',
  op: 'Broušení – hala 2 (dokončovací operace po tepelném zpracování a kontrole tvrdosti)',
  dept: 'Oddělení-dokončovacích-operací-po-tepelném-zpracování-hala2',
  index: 'LINE-A-12-REV-C-2026-NÁHRADNÍ',
  code: 'ABC00007-' + 'X'.repeat(90),
  note: ('Poznámka od plánování: díl čeká na materiál, dodavatel slíbil dodání do pátku, pak hned na brus a lakovnu.\nDruhý řádek poznámky. ').repeat(14).slice(0, 1990),
  state: 'Přesunuto na mezisklad hala 2 – čeká na výstupní kontrolu, ' + 'dlouhý stav záznamu evidence '.repeat(10),
  people: [['Aleksandra', 'Wiśniewska-Kowalczyk'], ['Konstantin Maximilian', 'Oberhauser-Wettstein von Hohenberg'], ['J', 'O'], ['Đặng Thị', 'Ngọc Hân'], ['Seán', "O'Brien-Ó Súilleabháin"]],
};

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) problems.push(`console: ${msg.text()}`); });
  page.on('pageerror', err => problems.push(`pageerror: ${err.message}`));
  await page.goto(BASE);
  await page.waitForSelector('#setupForm');
  const token = fs.readFileSync(process.env.TOKEN_FILE || path.join(S, 'odme2e', 'setup-token.txt'), 'utf8').trim();
  await page.fill('[name="token"]', token);
  await page.fill('[name="label"]', 'Konstantin Oberhauser-Wettstein');
  await page.click('#setupForm button[type="submit"]');
  await page.waitForSelector('.odm-card');
  await page.check('#saved');
  await page.click('#finish');
  await page.waitForSelector('#skip');
  await page.click('#skip');
  await page.waitForSelector('#view-prehled.on');

  await page.evaluate(W => {
    const link = c => `http://is.example/commission.production.detail/default/1?activeBarcode=${encodeURIComponent(c)}&x=1`;
    const ops = ['Broušení', 'Lakování', 'Montáž', W.op, 'Leštění', ''];
    const items = [];
    for (let i = 0; i < 90; i++) {
      const c = i === 7 ? W.code : `ABC${String(i).padStart(5, '0')}`;
      const it = { ean: `859${1000000000 + i}`, name: i % 5 === 0 ? W.name : i % 11 === 0 ? 'J' : i === 2 ? '🦊 Díl s emoji 👩🏽‍💻' : `Díl ${i}`,
        order: i % 9 === 0 ? W.order : `OBJ-${i}`, index: i % 13 === 0 ? W.index : 'A', qty: i % 17 === 0 ? '1 000 000' : String(i % 40 + 1), op: ops[i % ops.length],
        link: link(c), top: i < 4, top2: i >= 4 && i < 8, note: i % 4 === 0 ? W.note : '' };
      if (i % 3 === 0) it.subs = Array.from({ length: i === 0 ? 50 : 3 }, (_, k) => ({ ean: `86${String(i).padStart(4, '0')}${k}`, link: link(`${c}-${k}`), code: `${c}-${k}`, op: k % 2 ? 'Lakování' : 'Broušení', note: k === 0 ? W.note.slice(0, 300) : '' }));
      if (i % 2 === 0) it.rec = { ts: Date.now() - i * 60000, when: '13.11.2026 9:15', qty: '12', state: i % 6 === 0 ? W.state : 'Broušení hotovo' };
      if (i % 10 === 0) it.oqty = 1000000;
      items.push(it);
    }
    S.shortage = cleanShortage({ ...S.shortage, depts: [
      { id: 'dbrus', name: 'Brus', ops: [{ key: shOpKey('Broušení'), label: 'Broušení' }, { key: shOpKey(W.op), label: W.op }] },
      { id: 'dlak', name: W.dept, ops: [{ key: shOpKey('Lakování'), label: 'Lakování' }] },
      { id: 'dmont', name: 'Montáž', ops: [{ key: shOpKey('Montáž'), label: 'Montáž' }] }],
      lists: [{ id: 'shz1', at: Date.now() - 600e3, by: 'Konstantin Oberhauser-Wettstein', file: 'urgenty-' + 'velmi-dlouhy-nazev-souboru-'.repeat(4) + '.xlsx', items }] });
    const delays = [9999, 21, 14.5, 9, 3, 1, 0, -3, null];
    S.late = cleanLate({ lists: [{ id: 'ptz1', at: Date.now() - 300e3, by: 'Mistr', file: 'po-terminu.xlsx', items: items.slice(0, 45).map((x, i) => ({ ...x, delay: delays[i % delays.length], top: false, top2: false })) }] }, S.shortage);
    shLateLink(S);
    const keys = Object.keys(S.employees).slice(0, W.people.length);
    keys.forEach((k, i) => { S.employees[k].first = W.people[i][0]; S.employees[k].last = W.people[i][1]; S.employees[k].wid = 'ID-0000000001234567' + i; });
    Object.values(S.periods || {}).forEach(p => keys.forEach((k, i) => { if (p.rows && p.rows[k]) { p.rows[k].first = W.people[i][0]; p.rows[k].last = W.people[i][1]; } }));
    save();
    renderAll();
  }, W);

  const go = async v => { await page.evaluate(v => showView(v), v); await page.waitForTimeout(350); };
  const measure = () => page.evaluate(() => {
    const view = document.querySelector('.main > .view.on');
    const card = sel => { const t = view.querySelector(sel); return t ? t.scrollWidth - t.clientWidth : 0; };
    const cw = [...view.querySelectorAll('.chips')].flatMap(c => [...c.querySelectorAll('.chip')].filter(x => x.getBoundingClientRect().width).map(x => Math.round(x.getBoundingClientRect().right - c.getBoundingClientRect().right)));
    const notes = [...view.querySelectorAll('textarea.sh-note')].map(t => t.getBoundingClientRect().height);
    const bad = (view.innerText.match(/\b(NaN|undefined|Infinity)\b|\[object Object\]/g) || []);
    return { over: document.documentElement.scrollWidth - document.documentElement.clientWidth, sh: card('.sh-card .table-card.flat, #shView .table-card.flat'),
      attCard: (t => (t ? t.scrollWidth - t.clientWidth : 0))(view.querySelector('.table-card:has(.att-table)')), chip: Math.max(0, ...cw), note: Math.round(Math.max(0, ...notes)), bad };
  });

  const SIZES = [['monitor-1440', 1440, 900], ['notebook-1280', 1280, 800], ['monitor-1920', 1920, 1080], ['telefon-390', 390, 844], ['telefon-320', 320, 640]];
  for (const [tag, w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h });
    const phone = w < 900;
    for (const v of ['shortage', 'potermin', 'dochazka', 'lide']) {
      await go(v);
      const m = await measure();
      check(m.over <= 1, `${v} @ ${tag}: stránka se posouvá do strany o ${m.over} px`);
      check(m.chip <= 1, `${v} @ ${tag}: čip filtru přetéká o ${m.chip} px`);
      check(!m.bad.length, `${v} @ ${tag}: v textu ${m.bad.join(', ')}`);
      if ((v === 'shortage' || v === 'potermin') && !phone && w >= 1440) check(m.sh <= 2, `${v} @ ${tag}: tabulka se nevejde (posun ${m.sh} px)`);
      if (v === 'shortage' || v === 'potermin') check(m.note <= 240, `${v} @ ${tag}: poznámka natáhne řádek na ${m.note} px`);
      if (v === 'dochazka' && !phone && w >= 1280) check(m.attCard <= 2, `dochazka @ ${tag}: tabulka Docházky se nevejde (posun ${m.attCard} px)`);
      await page.screenshot({ path: path.join(shots, `${v}-${tag}.png`) });
    }
  }

  // řádek sestavy s nejdelšími hodnotami a dlouhé jméno v Docházce (snímky k prohlédnutí)
  await page.setViewportSize({ width: 1440, height: 900 });
  await go('shortage');
  await page.evaluate(() => document.querySelector('#shView table.sh-tab tbody tr.sh-hassub').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(shots, 'shortage-sestava-1440.png') });
  const cells = await page.evaluate(() => { const tr = document.querySelector('#shView table.sh-tab tbody tr.sh-hassub'); const t = tr.closest('table'); return { table: t.getBoundingClientRect().width, ord: tr.querySelector('td.sh-ord').getBoundingClientRect().width }; });
  check(cells.ord < 260, `objednávka bez mezer roztáhla sloupec na ${Math.round(cells.ord)} px`);
  await page.setViewportSize({ width: 1280, height: 800 });
  await go('dochazka');
  await page.locator('#view-dochazka .att-table td.name:has-text("Oberhauser")').first().evaluate(e => e.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(shots, 'dochazka-jmena-1280.png') });

  // PDF Shortage a Po termínu
  await page.setViewportSize({ width: 1440, height: 900 });
  const pdf = async (view, name) => {
    await go(view);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click('#shView [data-shpdf]')]);
    const f = path.join(S, name); await dl.saveAs(f); return f;
  };
  const files = [await pdf('shortage', 'zatez-shortage.pdf'), await pdf('potermin', 'zatez-potermin.pdf')];
  const PY = String.raw`
import sys, json, fitz
res = []
for f in sys.argv[2:]:
    d = fitz.open(f); outside = []; overlap = []; text = ''
    for i, p in enumerate(d):
        Wp, Hp = p.rect.width, p.rect.height
        text += p.get_text()
        spans = [(s['bbox'], s['text']) for b in p.get_text('dict')['blocks'] for l in b.get('lines', []) for s in l['spans'] if s['text'].strip()]
        for (x0, y0, x1, y1), t in spans:
            if x1 > Wp - 4 or x0 < 4 or y1 > Hp - 2: outside.append(f'{i+1}: {t[:30]}')
        for a in range(len(spans)):
            for b in range(a + 1, min(len(spans), a + 40)):
                A, B = spans[a][0], spans[b][0]
                if min(A[2], B[2]) - max(A[0], B[0]) > 2 and min(A[3], B[3]) - max(A[1], B[1]) > 2: overlap.append(f'{i+1}: {spans[a][1][:20]} × {spans[b][1][:20]}')
        if i < 3: p.get_pixmap(dpi=80).save(sys.argv[1] + '/' + f.split('/')[-1][:-4] + f'-{i+1}.png')
    flat = ''.join(text.split())
    res.append({'file': f.split('/')[-1], 'pages': len(d), 'outside': outside[:8], 'overlap': overlap[:8], 'flat': flat})
print(json.dumps(res))`;
  const py = spawnSync('python3', ['-c', PY, shots, ...files], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (py.status !== 0) problems.push('PyMuPDF: ' + py.stderr.slice(0, 300));
  else {
    const flatOf = s => s.replace(/\s+/g, '');
    for (const r of JSON.parse(py.stdout)) {
      check(!r.outside.length, `${r.file}: text mimo stranu ${r.outside.join(' | ')}`);
      check(!r.overlap.length, `${r.file}: texty přes sebe ${r.overlap.join(' | ')}`);
      check(r.flat.includes(flatOf(W.order)), `${r.file}: číslo objednávky není celé`);
      check(r.flat.includes('1000000'), `${r.file}: množství 1 000 000 není celé`);
      check(r.file !== 'zatez-shortage.pdf' || r.flat.includes(flatOf(W.code)), `${r.file}: kód pod QR není celý`);
      check(r.flat.includes(flatOf(W.index)), `${r.file}: index není celý`);
      console.log(`${r.file}: ${r.pages} stran`);
    }
  }

  await browser.close();
  if (problems.length) { console.log('PROBLÉMY:\n - ' + problems.join('\n - ')); process.exit(1); }
  console.log('e2e zátěž nejhoršími daty: vše v pořádku');
})().catch(e => { console.log('PROBLÉMY:\n - ' + (e.stack || e)); process.exit(1); });
