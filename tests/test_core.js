'use strict';

/*
 * Výpočty v private/core.js proti původní aplikaci (hodnoceni-operatoru.html):
 * na datech, kde se opravy neprojeví, musí vyjít totéž. Pak testy samotných oprav.
 * node odmeny_v2/tests/test_core.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ORIGINAL = path.join(ROOT, '..', 'hodnoceni-operatoru.html');

/** Objekt, který snese jakékoli volání a čtení – zastoupí DOM původní aplikace. */
function stub() {
  const fn = function () { return proxy; };
  const proxy = new Proxy(fn, {
    get(target, key) {
      if (key === Symbol.toPrimitive) return () => '';
      if (key === 'length') return 0;
      return proxy;
    },
    set() { return true; },
    apply() { return proxy; },
    construct() { return proxy; },
  });
  return proxy;
}

function context(extra = {}) {
  return vm.createContext({
    console, crypto: globalThis.crypto, TextDecoder, TextEncoder, Intl, Date, Math, JSON,
    setTimeout, clearTimeout, ...extra,
  });
}

function loadCore() {
  const ctx = context();
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'private', 'core.js'), 'utf8'), ctx, { filename: 'core.js' });
  return ctx;
}

function loadOriginal() {
  const html = fs.readFileSync(ORIGINAL, 'utf8');
  const code = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  const dom = stub();
  const ctx = context({
    document: dom, window: dom, navigator: dom, location: dom, alert() {}, confirm: () => true, prompt: () => null,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  });
  vm.runInContext(code, ctx, { filename: 'hodnoceni-operatoru.html' });
  return ctx;
}

const run = (ctx, code) => vm.runInContext(code, ctx);

/** Stav bez rozdílů, které opravy záměrně mění: kódy jen ASCII a nejvýš jedna procentní sankce na člověka a měsíc. */
function comparableState(core) {
  const state = JSON.parse(run(core, 'JSON.stringify(demoData())'));
  delete state._demoIssue;
  const ascii = value => (typeof value === 'string' ? value.normalize('NFD').replace(/[̀-ͯ]/g, '') : value);
  Object.values(state.periods).forEach(p => {
    Object.values(p.rows).forEach(r => { r.c = r.c.map(ascii); });
    p.codes = Object.fromEntries(Object.entries(p.codes || {}).map(([c, n]) => [ascii(c), n]));
  });
  state.settings.excused = ascii(state.settings.excused);
  const seen = new Set();
  state.sanctions = state.sanctions.filter(s => {
    if (s.pct == null) return true;
    const id = `${s.key}|${s.period}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return state;
}

function summary(ctx, state) {
  ctx.__state = JSON.stringify(state);
  return JSON.parse(run(ctx, `
    S = JSON.parse(__state); migrate(S); _prodIdx = null;
    JSON.stringify(allRows().map(r => ({
      key: r.e.key, total: r.total, narok: r.narok, max: r.max, base: r.L.base, level: r.L.n,
      att: r.attEff, pen: r.pen, pct: r.pctSum, legacy: r.legacy, adj: r.adj, kafe: !!r.kafe, lost: !!r.lost, capped: !!r.capped,
      days: r.att && r.att.found ? r.att.workDays : null, hours: r.att && r.att.found ? r.att.totalHours : null,
      wk: r.att && r.att.found ? r.att.wkDays : null, prod: r.prod ? r.prod.total : null,
    })))`));
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('výpočty sedí s původní aplikací', () => {
  if (!fs.existsSync(ORIGINAL)) return 'přeskočeno (chybí hodnoceni-operatoru.html)';
  const core = loadCore();
  const original = loadOriginal();
  const state = comparableState(core);
  assert.ok(Object.keys(state.employees).length >= 5, 'ukázková data mají lidi');
  const expected = summary(original, state);
  const actual = summary(core, state);
  assert.ok(expected.some(r => r.pen > 0) && expected.some(r => r.att !== 0) && expected.some(r => r.kafe), 'data pokrývají sankce, docházku i Kafe');
  assert.deepStrictEqual(actual, expected);
  // Jiný měsíc a ruční úpravy: pořád totéž.
  state.adjust[state.current] = { [Object.keys(state.employees)[0]]: 2, [Object.keys(state.employees)[1]]: -1 };
  state.settings.absenceCutoff = 3;
  assert.deepStrictEqual(summary(core, state), summary(original, state));
  return null;
});

test('import docházky dává stejné období jako původní aplikace', () => {
  if (!fs.existsSync(ORIGINAL)) return 'přeskočeno (chybí hodnoceni-operatoru.html)';
  const core = loadCore();
  const original = loadOriginal();
  const head = ['Jméno', 'Příjmení', '', '', '', ...Array.from({ length: 30 }, (_, i) => `${i + 1}.9.2026`)];
  const rows = [['Jan', 'Novák', 1, 'A', '', ...Array.from({ length: 30 }, (_, i) => (i % 7 === 5 || i % 7 === 6 ? '' : i === 9 ? 'D' : '7,5'))],
    ['Eva', 'Malá', 2, 'A', '', ...Array.from({ length: 30 }, (_, i) => (i % 7 === 5 ? '8' : i % 7 === 6 ? '' : '6'))],
    ['Celkem', '', '', '', '', ...Array(30).fill(100)]];
  const aoa = JSON.stringify([head, ...rows]);
  const build = ctx => { ctx.__aoa = aoa; return JSON.parse(run(ctx, 'JSON.stringify((({ok,err,period,warn}) => ({ok,err,warn,period: period && {...period, at: 0}}))(buildPeriod(JSON.parse(__aoa), "t.csv")))')); };
  const expected = build(original);
  assert.ok(expected.ok, expected.err);
  assert.deepStrictEqual(build(core), expected);
  return null;
});

test('OČR i OCR znamená totéž (oprava diakritiky)', () => {
  const core = loadCore();
  run(core, 'S = blank(); S.settings.excused = "OČR, D";');
  const aoa = [['Jméno', 'Příjmení', '', '', '', ...Array.from({ length: 30 }, (_, i) => `${i + 1}.9.2026`)],
    ['Jan', 'Novák', '', '', '', ...Array.from({ length: 30 }, (_, i) => (i === 0 ? 'OCR' : i === 1 ? 'očr' : i === 2 ? 'X' : '7,5'))]];
  core.__aoa = JSON.stringify(aoa);
  const cells = JSON.parse(run(core, `
    const res = buildPeriod(JSON.parse(__aoa), "t.csv");
    S.periods[res.period.id] = res.period; S.current = res.period.id;
    JSON.stringify(attendance(res.period, Object.keys(res.period.rows)[0]).cells.slice(0, 3).map(c => c.isEx))`));
  assert.deepStrictEqual(cells, [true, true, false]);
  return null;
});

test('každá sankce strhne aspoň jeden tabák', () => {
  const core = loadCore();
  assert.strictEqual(run(core, 'sanDeduct(10, 20, 2)'), 2, 'dvě sankce po 10 % z 10 = aspoň 2');
  assert.strictEqual(run(core, 'sanDeduct(10, 10, 1)'), 1);
  assert.strictEqual(run(core, 'sanDeduct(10, 100, 2)'), 10, 'nikdy víc než nárok');
  assert.strictEqual(run(core, 'sanDeduct(0, 30, 1)'), 0, 'z nuly není co strhnout');
  assert.strictEqual(run(core, 'sanDeduct(8, 30, 1)'), 2, '30 % z 8 = 2,4 → 2');
  return null;
});

test('sanitizeState zahodí podvržená data', () => {
  const core = loadCore();
  core.__evil = JSON.stringify({
    positions: [{ id: '"><img src=x onerror=alert(1)>', name: 'Zlá', levels: [] }, { id: 'p_ok', name: 'x'.repeat(500), max: '9999', levels: [{ name: 'A', tabaky: '1e9' }, {}, {}, {}], penalty: [{ at: -5, t: 'abc' }] }],
    employees: { '__proto__': { first: 'X', last: 'Y' }, 'novak|jan': { first: 'Jan', last: 'Novák', positionId: '"><img', level: 99 }, 'bad': 'text' },
    periods: { '2026-09': { days: ['2026-09-01', '<b>', '2025-01-01'], rows: { 'novak|jan': { first: 'Jan', last: 'Novák', h: ['99', 'x'], c: [null, '<script>'] } } }, 'zlé': {} },
    sanctions: [{ key: 'novak|jan', period: '2026-09', pct: 70, name: 'x' }, { key: 'novak|jan', period: '"><', pct: 10 }, 'x'],
    adjust: { '2026-09': { 'novak|jan': 1e9, '__proto__': 5 }, '<x>': { a: 1 } },
    issued: { '2026-09': { 'novak|jan': { at: 'x', tabaky: -5, kafe: 'ano' } } },
    settings: { shift: 1e9, hiddenCols: ['name', 'days', '<x>'], lockMinutes: 0 },
    current: '"><script>',
  });
  const out = JSON.parse(run(core, 'JSON.stringify(sanitizeState(JSON.parse(__evil)))'));
  assert.deepStrictEqual(out.positions.map(p => p.id), ['p_ok']);
  assert.strictEqual(out.positions[0].name.length, 80);
  assert.strictEqual(out.positions[0].max, 200);
  assert.strictEqual(out.positions[0].levels[0].tabaky, 100);
  assert.deepStrictEqual(out.positions[0].penalty, [{ at: 1, t: 0 }]);
  assert.deepStrictEqual(Object.keys(out.employees), ['novak|jan']);
  assert.strictEqual(out.employees['novak|jan'].positionId, null);
  assert.strictEqual(out.employees['novak|jan'].level, null);
  assert.deepStrictEqual(Object.keys(out.periods), ['2026-09']);
  assert.deepStrictEqual(out.periods['2026-09'].days, ['2026-09-01']);
  assert.deepStrictEqual(out.periods['2026-09'].rows['novak|jan'].h, [24]);
  assert.strictEqual(out.sanctions.length, 1);
  assert.strictEqual(out.adjust['2026-09']['novak|jan'], 100);
  assert.ok(!Object.prototype.hasOwnProperty.call(out.adjust['2026-09'], '__proto__'));
  assert.ok(!('<x>' in out.adjust));
  assert.deepStrictEqual(out.issued['2026-09']['novak|jan'], { at: 0, tabaky: 0, kafe: true });
  assert.strictEqual(out.settings.shift, 24);
  assert.deepStrictEqual(out.settings.hiddenCols, ['days']);
  assert.strictEqual(out.settings.lockMinutes, 1);
  assert.strictEqual(out.current, '2026-09');
  assert.strictEqual(run(core, '({}).first'), undefined, 'prototyp zůstal čistý');
  return null;
});

test('CSV v UTF-8 i Windows-1250', () => {
  const core = loadCore();
  core.__utf = new TextEncoder().encode('Jméno;Šťastný;OČR');
  core.__bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Žluťoučký')]);
  core.__cp = new Uint8Array([0x8a, 0x9d, 0x61, 0x73, 0x74, 0x6e, 0xfd]); // "Šťastný" ve Windows-1250
  assert.strictEqual(run(core, 'decodeText(__utf.buffer)'), 'Jméno;Šťastný;OČR');
  assert.strictEqual(run(core, 'decodeText(__bom.buffer)'), 'Žluťoučký');
  assert.strictEqual(run(core, 'decodeText(__cp.buffer)'), 'Šťastný');
  return null;
});

test('export nespustí vzorec v Excelu', () => {
  const core = loadCore();
  assert.strictEqual(run(core, 'safeCell("=HYPERLINK(\\"http://x\\")")'), '\'=HYPERLINK("http://x")');
  assert.strictEqual(run(core, 'safeCell("+420")'), '\'+420');
  assert.strictEqual(run(core, 'safeCell("-5")'), '\'-5');
  assert.strictEqual(run(core, 'safeCell("@SUM(A1)")'), '\'@SUM(A1)');
  assert.strictEqual(run(core, 'safeCell("Novák")'), 'Novák');
  assert.strictEqual(run(core, 'safeCell(-5)'), -5);
  return null;
});

/* ------------------------------------------------------------ verze 2 */

test('historie změn: kdo co změnil, slučování a návrat hodnoty', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const id = S.current;
    const me = { by: 'Vedoucí', card: 'aaaaaaaaaaaaaaaa' };
    const a = sharedState(S);
    S.employees['novak|martin'].level = 3;
    S.employees['novak|martin'].skills = { p_bru: 2 };
    S.sanctions.push({ id: 'xtest1', key: 'cerny|jiri', period: id, name: 'Zničení dílů', pct: 10, note: 'test', at: 1 });
    (S.adjust[id] = S.adjust[id] || {})['novak|martin'] = 2;
    S.settings.shift = 8;
    S.positions[0].dept = 'Obrobna';
    const b = sharedState(S);
    const r1 = describeChanges(a, b, { ...me, at: 1000 });
    let log = appendLog([], r1.entries);
    S.adjust[id]['novak|martin'] = 3;
    const c = sharedState(S);
    log = appendLog(log, describeChanges(b, c, { ...me, at: 2000 }).entries);
    delete S.adjust[id]['novak|martin'];
    const d = sharedState(S);
    const log2 = appendLog(log, describeChanges(c, d, { ...me, at: 3000 }).entries);
    const other = appendLog(log, describeChanges(c, d, { by: 'Kolega', card: 'bbbbbbbbbbbbbbbb', at: 3000 }).entries);
    const late = appendLog(log, describeChanges(c, d, { ...me, at: 2000 + 11 * 60000 }).entries);
    JSON.stringify({ month: monthLabel(id), entries: r1.entries.map(e => e.kind + ': ' + e.text), by: r1.entries.map(e => e.by + '|' + e.card),
      hist: r1.hist, log: log.map(e => e.text), log2: log2.map(e => e.text), other: other.map(e => e.text), late: late.map(e => e.text),
      hasCurrent: 'current' in b, settings: Object.keys(b.settings), v: b.v })`));
  const m = out.month;
  assert.deepStrictEqual(out.entries.sort(), [
    'adjust: Ruční úprava Novák Martin (' + m + '): 0 → +2',
    'level: Novák Martin: CNC 2 (Pokročilý) → CNC 3 (Samostatný)',
    'level: Novák Martin: zaučení na pozici Brusič 0 → 2',
    'position: Pozice CNC, oddělení: — → Obrobna',
    'sanction: Sankce: Černý Jiří – Zničení dílů 10 % (' + m + '): test',
    'settings: Nastavení – délka směny: 7,5 h → 8 h',
  ].sort());
  assert.ok(out.by.every(x => x === 'Vedoucí|aaaaaaaaaaaaaaaa'));
  assert.deepStrictEqual(out.hist, [['novak|martin', { at: 1000, pos: 'p_cnc', lvl: 3 }]]);
  assert.ok(out.log.includes('Ruční úprava Novák Martin (' + m + '): 0 → +3'), 'opakovaná úprava se sloučí');
  assert.ok(!out.log.some(t => t.includes('0 → +2')));
  assert.ok(!out.log2.some(t => t.startsWith('Ruční úprava')), 'vrácení na původní hodnotu záznam odstraní');
  assert.ok(out.other.some(t => t === 'Ruční úprava Novák Martin (' + m + '): +3 → 0'), 'jiná kartička se neslučuje');
  assert.ok(out.late.some(t => t === 'Ruční úprava Novák Martin (' + m + '): +3 → 0'), 'po 10 minutách se neslučuje');
  assert.strictEqual(out.hasCurrent, false, 'vybrané období je osobní');
  assert.ok(!out.settings.includes('hiddenCols') && !out.settings.includes('lockMinutes'));
  assert.strictEqual(out.v, 3);
  return null;
});

test('hromadné změny se shrnou do jednoho záznamu', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const a = sharedState(S);
    for (let i = 0; i < 12; i++) S.employees['x' + i + '|y'] = { key: 'x' + i + '|y', first: 'Y', last: 'X' + i, positionId: 'p_cnc', level: 1, note: '' };
    const b = sharedState(S);
    const r = describeChanges(a, b, { at: 5, by: 'V', card: '' });
    JSON.stringify({ texts: r.entries.map(e => e.text), hist: r.hist.length })`));
  assert.strictEqual(out.texts.length, 1);
  assert.match(out.texts[0], /^Přidáno 12 lidí: X0 Y, X1 Y, X2 Y, X3 Y a další \(8\)$/);
  assert.strictEqual(out.hist, 12, 'každý nový člověk dostane výchozí zařazení do historie');
  return null;
});

test('sanitizeState: oddělení, zaučení, historie zařazení a změn', () => {
  const core = loadCore();
  core.__in = JSON.stringify({
    positions: [{ id: 'p1', name: 'A', dept: '  Obrobna  ', levels: [{}, {}, {}, {}] }, { id: 'p2', name: 'B', levels: [{}, {}, {}, {}] }],
    employees: {
      'a|b': { first: 'B', last: 'A', positionId: 'p1', level: 2, skills: { p1: 3, p2: 9, p3: 2 } },
      'c|d': { first: 'D', last: 'C', positionId: 'p2', level: 1, skills: { p1: '4' }, hist: [{ at: 5, pos: 'p2', lvl: 1 }, { at: 'x', pos: '<b>', lvl: 7 }] },
    },
    issued: { '2026-09': { 'a|b': { at: 1, tabaky: 2, kafe: 1, pos: 'p1', lvl: 2 }, 'c|d': { at: 1, tabaky: 2, pos: '"><x', lvl: 9 } } },
    log: [{ at: 1, by: 'x'.repeat(100), card: 'zz', kind: 'evil', text: '<img src=x>', key: 'a|b', period: 'bad', m: 'adj:1', p: 'P', v0: '1', v1: '2' }, { text: 5 }, 'x'],
  });
  const o = JSON.parse(run(core, 'JSON.stringify(sanitizeState(JSON.parse(__in)))'));
  assert.strictEqual(o.positions[0].dept, 'Obrobna');
  assert.strictEqual(o.positions[1].dept, '');
  assert.ok(!('skills' in o.employees['a|b']), 'zaučení na vlastní, neplatné nebo neexistující pozici zmizí');
  assert.deepStrictEqual(o.employees['c|d'].skills, { p1: 4 });
  assert.deepStrictEqual(o.employees['a|b'].hist, [{ at: 0, pos: 'p1', lvl: 2 }], 'výchozí stav pro starší data');
  assert.deepStrictEqual(o.employees['c|d'].hist, [{ at: 0, pos: null, lvl: null }, { at: 5, pos: 'p2', lvl: 1 }]);
  assert.deepStrictEqual(o.issued['2026-09']['a|b'], { at: 1, tabaky: 2, kafe: true, pos: 'p1', lvl: 2 });
  assert.deepStrictEqual(o.issued['2026-09']['c|d'], { at: 1, tabaky: 2, kafe: false });
  assert.strictEqual(o.log.length, 1);
  assert.deepStrictEqual(o.log[0], { at: 1, by: 'x'.repeat(60), card: '', kind: 'data', text: '<img src=x>', key: 'a|b', m: 'adj:1', p: 'P', v0: '1', v1: '2' });
  assert.strictEqual(o.v, 3);
  return null;
});

test('profil: období od–do, úroveň z výdeje a z historie zařazení', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const id = S.current;
    const keep = S.current;
    S.issued[id] = S.issued[id] || {};
    S.issued[id]['dvorak|petr'] = { at: 5, tabaky: 3, kafe: false, pos: 'p_cnc', lvl: 2 };
    S.employees['novak|martin'].hist = [{ at: 0, pos: 'p_cnc', lvl: 1 }, { at: Date.now() + 1e10, pos: 'p_cnc', lvl: 2 }];
    const pd = profileData('dvorak|petr');
    const pn = profileData('novak|martin');
    const none = profileData('dvorak|petr', '2001-01', '2001-12');
    JSON.stringify({ id, same: S.current === keep, months: pd.months.map(m => [m.id, m.lvl, m.base, m.from, m.hasAtt, m.issued && m.issued.tabaky, m.sanctions.length]),
      totals: pd.totals, pn: pn.months.map(m => [m.lvl, m.from]), none: none.months.length, range: monthsBetween('2025-11', '2026-02'),
      changes: pd.changes.map(c => c.text) })`));
  assert.ok(out.same, 'vybrané období se po výpočtu vrátí');
  assert.deepStrictEqual(out.months, [[out.id, 2, 4, 'issued', true, 3, 1]]);
  assert.strictEqual(out.totals.issuedTab, 3);
  assert.strictEqual(out.totals.sanctions, 1);
  assert.ok(out.totals.hours > 100 && out.totals.attendance > 0.5 && out.totals.attendance <= 1);
  assert.ok(out.totals.prodTotal > 0 && out.totals.perDay > 0);
  assert.deepStrictEqual(out.pn, [[1, 'hist']], 'pozdější povýšení se do starého měsíce nepromítne');
  assert.strictEqual(out.none, 0);
  assert.deepStrictEqual(out.range, ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.deepStrictEqual(out.changes, ['CNC 4 (Profík)']);
  return null;
});

test('matice dovedností podle oddělení', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    S.positions.find(p => p.id === 'p_bru').dept = 'Obrobna';
    S.positions.find(p => p.id === 'p_cnc').dept = 'Obrobna';
    S.employees['novak|martin'].skills = { p_bru: 3 };
    S.employees['cerny|jiri'].skills = { p_cnc: 1 };
    const m = skillMatrix('Obrobna');
    const sheets = matrixSheets();
    JSON.stringify({ depts: departments(), cols: m.cols.map(p => p.id), rows: m.rows.map(r => [r.e.key, r.home, r.cells.map(c => c.lvl)]),
      ready: m.coverage.map(c => c.ready), trained: m.coverage.map(c => c.trained), sheets: sheets.map(s => s.name),
      obrobna: sheets[1].rows.slice(2, 4) })`));
  assert.deepStrictEqual(out.depts, ['Obrobna', 'Kontrola', 'Pískování', 'Lepení / Značení', 'Daiho']);
  assert.deepStrictEqual(out.cols, ['p_cnc', 'p_bru']);
  assert.deepStrictEqual(out.rows, [
    ['dvorak|petr', true, [4, 0]], ['novak|martin', true, [2, 3]], ['prochazka|lukas', true, [0, 3]], ['cerny|jiri', false, [1, 0]],
  ]);
  assert.deepStrictEqual(out.ready, [1, 2]);
  assert.deepStrictEqual(out.trained, [3, 2]);
  assert.deepStrictEqual(out.sheets, ['Všechna oddělení', 'Obrobna', 'Kontrola', 'Pískování', 'Lepení - Značení', 'Daiho', 'Popis úrovní']);
  assert.deepStrictEqual(out.obrobna[0], ['Příjmení', 'Jméno', 'Hlavní pozice', 'Úroveň', 'CNC', 'Brusič']);
  assert.deepStrictEqual(out.obrobna[1], ['Dvořák', 'Petr', 'CNC', '4 · Profík', '● 4 *', '']);
  return null;
});

test('aktualizace 2.0 → 2.1: data zůstanou beze změny', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    /* stav, jak ho uložila verze 2.0: bez navýšení platu, „jen Kafe“, času a normy */
    const old = JSON.parse(JSON.stringify(sanitizeState(demoData())));
    old.positions.forEach(p => { delete p.onlyKafe; p.levels.forEach(l => { delete l.raise; delete l.minAtt; delete l.minNorm; delete l.minUse; }); });
    Object.values(old.production).forEach(pp => { delete pp.time; Object.values(pp.names).forEach(r => { delete r.spent; delete r.norm; delete r.nspent; }); });
    delete old.settings.prodCols;
    old.v = 2;
    old.employees['novak|martin'].skills = { p_bru: 3 };
    old.employees['novak|martin'].hist.push({ at: 5, pos: 'p_cnc', lvl: 2 });
    old.adjust[old.current] = { 'novak|martin': 2 };
    old.issued[old.current] = { 'dvorak|petr': { at: 7, tabaky: 6, kafe: true, pos: 'p_cnc', lvl: 4 } };
    old.kafe[old.current] = 150;
    old.prodMap = { 'tomas veseli': 'vesely|tomas' };
    old.sanReasons = ['Vlastní důvod'];
    old.log = [{ at: 9, by: 'Vedoucí', card: 'a'.repeat(16), kind: 'adjust', text: 'Ruční úprava', key: 'novak|martin', period: old.current }];
    const neu = sanitizeState(JSON.parse(JSON.stringify(old)));
    const strip = st => { const c = JSON.parse(JSON.stringify(st));
      c.positions.forEach(p => { delete p.onlyKafe; p.levels.forEach(l => { delete l.raise; delete l.minAtt; delete l.minNorm; delete l.minUse; }); });
      delete c.settings.prodCols; delete c.v; return c; };
    const o2 = JSON.parse(JSON.stringify(old)); delete o2.v;
    /* porovnání bez ohledu na pořadí klíčů */
    const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
    S = neu;
    const rows = allRows().map(r => [r.e.key, r.total, r.kafe, r.pen, r.adj, r.raise.pct]);
    JSON.stringify({ same: JSON.stringify(canon(strip(neu))) === JSON.stringify(canon(o2)), again: JSON.stringify(canon(sanitizeState(JSON.parse(JSON.stringify(neu))))) === JSON.stringify(canon(neu)),
      defaults: neu.positions.every(p => p.onlyKafe === false && p.levels.every(l => l.raise === 0 && l.minAtt === null && l.minNorm === null && l.minUse === null)),
      time: Object.values(neu.production).some(pp => pp.time), v: neu.v, rows })`));
  assert.ok(out.same, 'všechna data z verze 2.0 zůstanou beze změny');
  assert.ok(out.again, 'opakované načtení nic nemění');
  assert.ok(out.defaults, 'nové volby mají výchozí hodnoty: s tabáky, bez navýšení a podmínek');
  assert.strictEqual(out.time, false, 'stará evidence práce nemá strávený čas');
  assert.strictEqual(out.v, 3);
  assert.ok(out.rows.every(r => r[5] === 0), 'bez nastavení nikdo nedostane navýšení');
  return null;
});

test('pozice jen s Kafe: žádné tabáky ani ruční úpravou', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const before = allRows().find(r => r.e.key === 'svobodova|jana');
    S.positions.find(p => p.id === 'p_kon').onlyKafe = true;
    S.adjust[S.current] = { 'svobodova|jana': 3 };
    const r = allRows().find(x => x.e.key === 'svobodova|jana');
    const others = allRows().filter(x => x.pos && x.pos.id !== 'p_kon').map(x => x.total);
    S.positions.find(p => p.id === 'p_kon').onlyKafe = false;
    const back = allRows().filter(x => x.pos && x.pos.id !== 'p_kon').map(x => x.total);
    JSON.stringify({ kafeBefore: before.kafe, kafe: r.kafe, total: r.total, max: r.max, base: r.L.base, adj: r.adj, adjMax: r.adjMax, kafeOnly: r.kafeOnly,
      maxAuto: posMaxAuto(S.positions.find(p => p.id === 'p_kon')), others, back })`));
  assert.strictEqual(out.kafeOnly, true);
  assert.deepStrictEqual([out.total, out.max, out.base, out.adj, out.adjMax], [0, 0, 0, 0, 0]);
  assert.strictEqual(out.kafe, out.kafeBefore, 'Kafe se počítá stejně');
  assert.deepStrictEqual(out.others, out.back, 'ostatní pozice se nezmění');
  return null;
});

test('navýšení platu podle úrovně a splněných podmínek', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const p = S.positions.find(x => x.id === 'p_cnc');
    const L = n => ({ pos: p, n, lv: p.levels[n - 1] });
    const perf = (att, norm, use) => ({ att, norm, use });
    JSON.stringify({
      own: raiseOf(L(4), perf(95, 110, 85)),
      fallback: raiseOf(L(4), perf(95, 100, 85)),
      lower: raiseOf(L(4), perf(95, 90, 72)),
      none: raiseOf(L(4), perf(80, 120, 90)),
      missing: raiseOf(L(3), perf(95, null, 90)),
      level1: raiseOf(L(1), perf(100, 200, 100)),
      nopos: raiseOf({ pos: null, n: 0 }, perf(100, 100, 100)),
      edge: raiseOf(L(2), perf(90, 85, 70)),
      demo: allRows().filter(r => r.raise.pct > 0).length,
      perfs: allRows().filter(r => r.perf.norm != null).length })`));
  assert.deepStrictEqual([out.own.pct, out.own.lvl], [15, 4], 'splní vše na své úrovni');
  assert.deepStrictEqual([out.fallback.pct, out.fallback.lvl, out.fallback.own.lvl], [10, 3, 4], 'norma 100 % nestačí na úroveň 4 (105 %), platí úroveň 3');
  assert.deepStrictEqual([out.lower.pct, out.lower.lvl], [5, 2]);
  assert.deepStrictEqual([out.none.pct, out.none.lvl], [0, 0], 'docházka pod 90 % = nic');
  assert.strictEqual(out.none.own.checks.find(c => c.k === 'att').ok, false);
  assert.deepStrictEqual([out.missing.pct, out.missing.lvl], [0, 0], 'chybějící údaj podmínku nesplní');
  assert.strictEqual(out.level1.pct, 0, 'úroveň 1 bez navýšení');
  assert.strictEqual(out.nopos.pct, 0);
  assert.deepStrictEqual([out.edge.pct, out.edge.lvl], [5, 2], 'přesně na hranici = splněno');
  assert.ok(out.demo > 0 && out.perfs > 0, 'ukázková data navýšení ukážou');
  const kept = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    S.positions[0].levels[2].raise = 12;
    dropDemoRaise(S.positions);
    JSON.stringify(S.positions.slice(0, 2).map(p => p.levels.map(l => [l.raise, l.minAtt, l.minNorm, l.minUse])))`));
  assert.deepStrictEqual(kept[1], [[0, null, null, null], [0, null, null, null], [0, null, null, null], [0, null, null, null]], 'ukázkové navýšení po ukázce zmizí');
  assert.deepStrictEqual(kept[0][2], [12, 90, 95, 75], 'vlastní úprava během ukázky zůstane');
  return null;
});

test('evidence práce se stráveným časem a normou', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const head = ['Zakázka', 'Pracovník', 'Datum', 'Operace', 'Kusy', 'Strávený čas (min)', 'Norma (min)'];
    const aoa = [['Export evidence práce'], [], head,
      ['Z1', 'Petr Dvořák', '3.8.2026', 'frézování', 10, 120, 132],
      ['Z2', 'Petr Dvořák', '4.8.2026', 'seřízení', 0, 60, null],
      ['Z3', 'Petr Dvořák', '5.8.2026', 'frézování', 5, '1:30', 90],
      ['Z4', 'Jana Svobodová', '5.8.2026', 'měření', 20, 200, 180],
      ['Z5', 'Nikdo', '', '', 1, 1, 1]];
    const info = prodColumns(aoa);
    const res = buildProduction(aoa, 'evidence.xlsx', info.guess);
    const rec = res.buckets['2026-08'].names['petr dvorak'];
    /* časový formát Excelu (zlomek dne) a norma za kus */
    const frac = buildProduction([['Jméno', 'Datum', 'Ks', 'Čas', 'Norma'], ['Petr Dvořák', '3.8.2026', 4, 0.0625, 20]], 'x.xlsx',
      { header: 0, name: 0, date: 1, ks: 2, spent: 3, norm: 4, unit: 'min', normPer: 'piece' });
    const fr = frac.buckets['2026-08'].names['petr dvorak'];
    const hours = buildProduction([['Jméno', 'Datum', 'Ks', 'Čas'], ['Petr Dvořák', '3.8.2026', 4, '1,5']], 'x.xlsx', { header: 0, name: 0, date: 1, ks: 2, spent: 3, norm: null, unit: 'h' });
    const saved = cleanProdCols({ ...info.guess, heads: info.heads });
    const legacy = buildProduction([[null, null, 'Petr Dvořák', '3.8.2026', 7]], 'stary.xlsx');
    S.production['2026-08'] = res.buckets['2026-08'];
    S.current = S.current;
    const perf = withPeriod('2026-08', () => perfOf(null, productionOf('dvorak|petr')));
    JSON.stringify({ header: info.header, guess: info.guess, used: res.used, skipped: res.skipped, rec, time: res.buckets['2026-08'].time,
      fr, hr: hours.buckets['2026-08'].names['petr dvorak'].spent, fits: prodMapFits(saved, info), other: prodMapFits(saved, prodColumns([['Jméno', 'Datum', 'Kusy'], ['a b', '1.1.2026', 1]])),
      legacy: legacy.ok && legacy.buckets['2026-08'].names['petr dvorak'].total, legacyTime: !!legacy.buckets['2026-08'].time, perf,
      clean: cleanProdCols({ name: 'x', date: 1 }), clean2: cleanProdCols({ header: 2, name: 1, date: 2, ks: '', spent: 99, unit: 'h', heads: ['<b>'] }) })`));
  assert.strictEqual(out.header, 2, 'hlavička na třetím řádku');
  assert.deepStrictEqual([out.guess.name, out.guess.date, out.guess.ks, out.guess.spent, out.guess.norm], [1, 2, 4, 5, 6]);
  assert.strictEqual(out.used, 4, 'řádek bez kusů, ale s časem se počítá');
  assert.deepStrictEqual([out.rec.total, out.rec.count, out.rec.spent, out.rec.norm, out.rec.nspent], [15, 3, 270, 222, 210]);
  assert.strictEqual(out.time, true);
  assert.deepStrictEqual([out.fr.spent, out.fr.norm], [90, 80], '1:30 z Excelu = 90 min, norma 20 × 4 kusy');
  assert.strictEqual(out.hr, 90, '1,5 h = 90 min');
  assert.strictEqual(out.fits, true);
  assert.strictEqual(out.other, false, 'jiná hlavička = zeptat se znovu');
  assert.strictEqual(out.legacy, 7, 'starý formát (C, D, E) funguje beze změny');
  assert.strictEqual(out.legacyTime, false);
  assert.strictEqual(out.perf.norm, 105.7, 'plnění normy = 222 / 210');
  assert.strictEqual(out.perf.use, null, 'bez docházky není využití fondu');
  assert.strictEqual(out.clean, null, 'neplatné mapování se zahodí');
  assert.deepStrictEqual([out.clean2.ks, out.clean2.spent, out.clean2.unit, out.clean2.heads], [null, null, 'h', ['<b>']]);
  return null;
});

test('pravidla do PDF a historie změn navýšení', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const a = sharedState(S);
    const p = S.positions.find(x => x.id === 'p_kon');
    p.onlyKafe = true;
    p.levels[1].raise = 7.5;
    p.levels[1].minNorm = 90;
    const b = sharedState(S);
    const log = describeChanges(a, b, { by: 'Vedoucí', card: 'a'.repeat(16), at: 1 }).entries.map(e => e.text);
    const d = rulesDoc();
    const kon = d.positions.find(x => x.name === 'Kontrola');
    const cnc = d.positions.find(x => x.name === 'CNC');
    JSON.stringify({ log, general: d.general.map(g => g[0]), kon, cnc: { levels: cnc.levels.map(l => [l.tabaky, l.raise, l.att, l.norm, l.use]), rules: cnc.rules } })`));
  assert.ok(out.log.includes('Pozice Kontrola: jen Kafe, bez tabáků'), out.log.join(' | '));
  assert.ok(out.log.includes('Pozice Kontrola, úroveň 2 (navýšení platu): +5 % → +7,5 %'), out.log.join(' | '));
  assert.ok(out.log.some(t => t.startsWith('Pozice Kontrola, úroveň 2 (podmínky navýšení): docházka ≥ 90 %, plnění normy ≥ 85 %')), out.log.join(' | '));
  assert.deepStrictEqual(out.general, ['Tabáky', 'Absence', 'Kafe', 'Navýšení platu', 'Ukazatele']);
  assert.strictEqual(out.kon.onlyKafe, true);
  assert.deepStrictEqual(out.kon.rules, [], 'jen Kafe: bez pravidel tabáků');
  assert.deepStrictEqual(out.kon.levels.map(l => l.tabaky), ['—', '—', '—', '—']);
  assert.deepStrictEqual(out.cnc.levels[3], ['8', '+15 %', '≥ 90 %', '≥ 105 %', '≥ 80 %']);
  assert.deepStrictEqual(out.cnc.levels[0], ['2', '—', '—', '—', '—']);
  assert.strictEqual(out.cnc.rules.length, 3);
  return null;
});

test('ID zaměstnanců v evidenci práce', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const list = [['Seznam ID'], ['Příjmení', 'Jméno', 'Osobní číslo'], ['Dvořák', 'Petr', 101], ['Svobodová', 'Jana', '0102'], ['Neznámý', 'Pan', 103], ['Novák', 'Martin', 101]];
    const r1 = applyWids(list);
    const full = applyWids([['Zaměstnanec', 'ID'], ['Jana Svobodová', '201'], ['Veselý Tomáš', '202']]);
    /* prohození ID dvou lidí projde */
    S.employees['dvorak|petr'].wid = '1'; S.employees['novak|martin'].wid = '2';
    const swap = applyWids([['Příjmení', 'Jméno', 'ID'], ['Dvořák', 'Petr', '2'], ['Novák', 'Martin', '1']]);
    const ids = Object.fromEntries(Object.values(S.employees).filter(e => e.wid).map(e => [e.key, e.wid]));
    const bad = applyWids([['Něco', 'Jiného'], ['a', 'b']]);
    /* evidence práce jen s ID: sloupec se pozná a ID se spáruje i s úvodními nulami */
    const aoa = [['Zakázka', 'ID zaměstnance', 'Datum', 'Kusy', 'Čas (min)', 'Norma (min)'], ['Z1', '00002', '3.8.2026', 5, 100, 110], ['Z2', 999, '3.8.2026', 1, 10, 10]];
    const info = prodColumns(aoa);
    const res = buildProduction(aoa, 'x.xlsx', info.guess);
    S.production['2026-08'] = res.buckets['2026-08'];
    const match = withPeriod('2026-08', () => ({ dvorak: productionOf('dvorak|petr'), un: prodUnmatched().map(r => prodLabel(r.name)) }));
    const guard = setWid('vesely|tomas', '1');
    const roster = rosterSheets().main;
    const a = sharedState(S);
    S.employees['cerny|jiri'].wid = 'A7';
    const log = describeChanges(a, sharedState(S), { at: 1 }).entries.map(e => e.text);
    const clean = sanitizeState({ ...S, employees: { 'x|y': { key: 'x|y', first: 'Y', last: 'X', wid: '  ' + 'z'.repeat(60) } } }).employees['x|y'].wid;
    JSON.stringify({ r1, full, swap, ids, bad, guess: info.guess.name, dvorak: match.dvorak && match.dvorak.total, un: match.un, guard,
      rosterHead: roster[0].slice(-1)[0], rosterRow: roster.find(r => r[0] === 'Dvořák').slice(-1)[0], log, clean, keys: [widKey(' 0123 '), widKey('AB-1'), widKey(12.0)] })`));
  assert.deepStrictEqual([out.r1.set, out.r1.unknown, out.r1.dup], [2, ['Neznámý Pan (103)'], ['101']], 'stejné ID u dvou lidí se přeskočí');
  assert.strictEqual(out.full.set, 2, 'jméno a příjmení v jednom sloupci, v obou pořadích');
  assert.deepStrictEqual(out.full.clash, [], 'Svobodová dostala nové ID, nikomu nic nevzala');
  assert.strictEqual(out.swap.set, 2, 'prohození ID');
  assert.strictEqual(out.ids['dvorak|petr'], '2');
  assert.strictEqual(out.ids['novak|martin'], '1');
  assert.ok(out.bad.err, 'soubor bez jména a ID');
  assert.strictEqual(out.guess, 1, 'sloupec „ID zaměstnance“, ne „Zakázka“');
  assert.strictEqual(out.dvorak, 5, '„00002“ = ID 2');
  assert.deepStrictEqual(out.un, ['ID 999']);
  assert.strictEqual(out.guard, false, 'ID, které už má někdo jiný, nejde přiřadit');
  assert.strictEqual(out.rosterHead, 'ID v evidenci práce');
  assert.strictEqual(out.rosterRow, '2');
  assert.ok(out.log.includes('Černý Jiří: ID v evidenci práce — → A7'), out.log.join(' | '));
  assert.strictEqual(out.clean.length, 40);
  assert.deepStrictEqual(out.keys, ['123', 'ab-1', '12']);
  return null;
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    const note = fn();
    console.log(`ok   ${name}${note ? ` – ${note}` : ''}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n${error.stack}`);
  }
}
if (failed) process.exit(1);
console.log('core ok');
