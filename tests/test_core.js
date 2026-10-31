'use strict';

/*
 * Výpočty v private/core.js proti původní aplikaci (hodnoceni-operatoru.html):
 * na datech, kde se opravy neprojeví, musí vyjít totéž. Pak testy samotných oprav.
 * node tests/test_core.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
// Původní aplikace uživatele, jen pro porovnání výpočtů (na server se nekopíruje).
const ORIGINAL = path.join(__dirname, 'hodnoceni-operatoru.html');

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
  // Původní aplikace zná jen pozice s úrovněmi: bez seznamu dovedností počítá core.js stejně (cesta pro stará data).
  state.positions.forEach(p => { delete p.skillset; delete p.tiers; delete p.maxTab; });
  Object.values(state.employees).forEach(e => { delete e.rate; delete e.shift; });
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

test('srážka ze mzdy: benefity nekrátí, upozornění týden před koncem měsíce, zpracování', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const id = S.current;
    const key = 'prochazka|lukas';
    const base = allRows().find(r => r.e.key === key);
    S.sanctions.push({ id: 'w1', key, period: id, name: 'Zničení dílů', pct: 25, wage: true, note: 'x', at: 1 });
    const withWage = allRows().find(r => r.e.key === key);
    S.sanctions.push({ id: 'b1', key, period: id, name: 'Zničení dílů', pct: 15, note: '', at: 2 });
    const both = allRows().find(r => r.e.key === key);
    const y = +id.slice(0, 4), m = +id.slice(5, 7);
    const last = isoOf(Date.UTC(y, m, 0));
    const before = wagePending(addDays(last, -8)).map(s => s.id), from = wagePending(addDays(last, -7)).map(s => s.id), after = wagePending(addDays(last, 40)).map(s => s.id);
    const a = sharedState(S);
    setWageDone('w1', true, { at: 77, by: 'Vedoucí' });
    const done = { pending: wagePending(addDays(last, 1)).length, rec: S.sanctions.find(s => s.id === 'w1').done, notWage: setWageDone('b1', true, {}) };
    const log1 = describeChanges(a, sharedState(S), { at: 1, by: 'V', card: '' }).entries.map(e => e.text);
    const b = sharedState(S);
    setWageDone('w1', false);
    const log2 = describeChanges(b, sharedState(S), { at: 2, by: 'V', card: '' }).entries.map(e => e.text);
    const clean = sanitizeState({ sanctions: [{ key: 'a|b', period: '2026-09', name: 'x', pct: 25, wage: 'ano', done: { at: 1 } },
      { key: 'a|b', period: '2026-09', name: 'x', pct: 35, wage: true, done: { at: 'x', by: 'y'.repeat(99) } }] }).sanctions.map(s => [s.pct, s.wage, s.done]);
    JSON.stringify({ base: [base.narok, base.pen, base.total, base.kafe], withWage: [withWage.pen, withWage.total, withWage.kafe, withWage.pctSum, withWage.wage.length],
      both: [both.pctSum, both.pctCount], before, from, after, from7: wageFrom(id) === addDays(last, -7), done, log1, log2, clean,
      label: sanLabel(S.sanctions.find(s => s.id === 'w1')), pcts: SAN_PCTS })`));
  assert.deepStrictEqual(out.withWage, [out.base[1], out.base[2], out.base[3], 0, 1], 'srážka ze mzdy nesníží tabáky ani Kafe');
  assert.deepStrictEqual(out.both, [15, 1], 'běžná sankce dál strhává z nároku');
  assert.deepStrictEqual(out.before, [], 'osm dní před koncem měsíce ještě ne');
  assert.deepStrictEqual(out.from, ['w1'], 'týden před koncem měsíce upozornění');
  assert.deepStrictEqual(out.after, ['w1'], 'po termínu pořád, dokud není zpracovaná');
  assert.ok(out.from7);
  assert.deepStrictEqual(out.done, { pending: 0, rec: { at: 77, by: 'Vedoucí' }, notWage: false });
  assert.ok(out.log1.some(t => t.startsWith('Srážka ze mzdy zpracována: Procházka Lukáš – Zničení dílů 25 % ze mzdy')), out.log1.join(' | '));
  assert.ok(out.log2.some(t => t.startsWith('Zrušeno zpracování srážky ze mzdy: Procházka Lukáš')), out.log2.join(' | '));
  assert.deepStrictEqual(out.clean, [[25, null, null], [35, true, { at: 0, by: 'y'.repeat(60) }]], 'jen wage: true; zpracování jen u srážky ze mzdy');
  assert.strictEqual(out.label, 'Zničení dílů 25 % ze mzdy – x');
  assert.deepStrictEqual(out.pcts, [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
  return null;
});

test('přeformulování: jména lidí se před odesláním nahradí značkami a pak vrátí (i ve více částech)', () => {
  const core = loadCore();
  core.__emp = JSON.stringify({ a: { first: 'Petr', last: 'Dvořák' }, b: { first: 'Eva', last: 'Nováková' }, c: { first: 'Jana', last: 'Černá' }, d: { first: 'Al', last: 'Kos' } });
  const run1 = text => { core.__t = text; return JSON.parse(run(core, 'JSON.stringify((() => { const m = maskNames(__t, JSON.parse(__emp)); return { text: m.text, map: m.map, back: unmaskNames(m.text, m.map) }; })())')); };
  const a = run1('Petr Dvořák upíná díl ručně, Dvořákovi chybí přípravek; Janě to řekla Nováková.');
  assert.strictEqual(a.text, '[osoba 1] [osoba 2] upíná díl ručně, [osoba 3] chybí přípravek; [osoba 4] to řekla [osoba 5].');
  assert.deepStrictEqual(a.map.map(x => x[1]), ['Petr', 'Dvořák', 'Dvořákovi', 'Janě', 'Nováková']);
  assert.strictEqual(a.back, 'Petr Dvořák upíná díl ručně, Dvořákovi chybí přípravek; Janě to řekla Nováková.');
  const b = run1('černý povrch, Černá a Černé; díl EAN 8590001000011 a Al.');
  assert.strictEqual(b.text, 'černý povrch, [osoba 1] a [osoba 2]; díl EAN 8590001000011 a Al.', 'malá písmena a krátká jména (pod 3 znaky) zůstanou');
  const c = run1('[osoba 1] už v textu je, Petr ne.');
  assert.strictEqual(c.text, '[osoba 1] už v textu je, [osoba 2] ne.', 'čísla značek za těmi, které už v textu jsou');
  assert.strictEqual(c.back, '[osoba 1] už v textu je, Petr ne.');
  const d = run1('Bez jmen.');
  assert.deepStrictEqual([d.text, d.map], ['Bez jmen.', []]);
  // Model mohl větu přestavět: značky se vrátí, kde jsou, i vícekrát.
  core.__m = JSON.stringify([['[osoba 1]', 'Dvořákovi'], ['[osoba 10]', 'Kos']]);
  assert.strictEqual(run(core, 'unmaskNames("Pracovníkovi [osoba 1] chybí přípravek, [osoba 1] i [osoba 10].", JSON.parse(__m))'), 'Pracovníkovi Dvořákovi chybí přípravek, Dvořákovi i Kos.');
  // Víc částí najednou (2.6): stejné jméno má ve všech částech stejnou značku, čísla navazují.
  core.__ts = JSON.stringify(['Dvořák upíná ručně.', 'Doraz zajistí Nováková.', 'Dvořák zkontroluje [osoba 3] kus.', 'Bez jmen.']);
  const e = JSON.parse(run(core, 'JSON.stringify((() => { const m = maskNamesMany(JSON.parse(__ts), JSON.parse(__emp)); return { texts: m.texts, map: m.map, back: m.texts.map(t => unmaskNames(t, m.map)) }; })())'));
  assert.deepStrictEqual(e.texts, ['[osoba 4] upíná ručně.', 'Doraz zajistí [osoba 5].', '[osoba 4] zkontroluje [osoba 3] kus.', 'Bez jmen.']);
  assert.deepStrictEqual(e.back, ['Dvořák upíná ručně.', 'Doraz zajistí Nováková.', 'Dvořák zkontroluje [osoba 3] kus.', 'Bez jmen.']);
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
  assert.strictEqual(out.positions[0].max, 500);
  assert.strictEqual(out.positions[0].levels[0].tabaky, 100);
  // pozice bez dovedností (do verze 2.3) se převede na skupinu s jednou dovedností
  assert.strictEqual(out.positions[0].skillset.length, 1);
  assert.strictEqual(out.positions[0].maxTab, 100);
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

  // Verze 2.4: skupiny, dovednosti, stupně prémie, hodnocení, směny, body vedoucího a report kapacit.
  core.__evil2 = JSON.stringify({
    positions: [{ id: 'g1', name: 'G', maxTab: '1e9', max: '', skillset: [
      { id: 's1', name: '<b>A</b>', desc: 'x'.repeat(2000), scale: [{ name: 'z' }, {}, {}, {}, {}] },
      { id: 's1', name: 'duplicitní id' }, { id: '"><x', name: 'B', scale: [{}, {}] }, 'text'],
      tiers: [{ id: 't1', name: '', minSkill: 9, raise: 500, maxAbs: -3, minWknd: '', minNorm: 999, streak: { months: 1 },
        manual: [{ id: 'm1', text: 'Morálka' }, { id: 'm1', text: 'duplicita' }, { id: 'm2', text: '' }] },
      { name: 'Druhý', streak: { months: 99, label: '' } }] }],
    employees: { 'a|b': { first: 'A', last: 'B', positionId: 'g1', rate: { s1: 9, nic: 3, __proto__: 2 }, shift: 'X', legacy: { at: 'x', pos: 'P'.repeat(200), level: 9, skills: [{ pos: 'Q', level: 0 }, 'x'] } },
      'c|d': { first: 'C', last: 'D', positionId: 'g1', rate: { s1: '3' }, shift: 'S2' } },
    marks: { '2026-09': { 'a|b': { m1: 'pozdní příchody', jiny: 'x' }, '__proto__': { m1: 'x' } }, 'zlé': { 'a|b': { m1: 'x' } } },
    capReport: { groups: ['g1', 'neni'], thr: 9, hidden: ['s1', 'neni'], note: 'n'.repeat(5000) },
  });
  const o2 = JSON.parse(run(core, 'JSON.stringify(sanitizeState(JSON.parse(__evil2)))'));
  const g = o2.positions[0];
  assert.strictEqual(g.maxTab, 500);
  assert.strictEqual(g.max, null);
  assert.strictEqual(g.skillset.length, 2, 'duplicitní id a text zmizí');
  assert.strictEqual(g.skillset[0].name, '<b>A</b>', 'název zůstane jako text (escapuje až zobrazení)');
  assert.strictEqual(g.skillset[0].desc.length, 1000);
  assert.strictEqual(g.skillset[0].scale[0].name, 'z');
  assert.strictEqual(g.skillset[0].scale[1].name, 'Základní úroveň', 'prázdný název úrovně = standardní');
  assert.ok(/^[A-Za-z0-9_-]+$/.test(g.skillset[1].id) && g.skillset[1].id !== 's1', 'nebezpečné id dostane nové');
  assert.strictEqual(g.skillset[1].scale, null, 'neúplné schéma = standardní');
  const [t1, t2] = g.tiers;
  assert.deepStrictEqual([t1.name, t1.minSkill, t1.raise, t1.maxAbs, t1.minWknd, t1.minNorm, t1.streak], ['Varianta 1', 4, 100, 0, null, 300, null]);
  assert.deepStrictEqual(t1.manual, [{ id: 'm1', text: 'Morálka' }]);
  assert.deepStrictEqual(t2.streak, { months: 24, label: 'nárok' });
  const ab = o2.employees['a|b'];
  assert.deepStrictEqual(ab.rate, undefined, 'hodnocení mimo 1–4 a neznámé dovednosti zmizí');
  assert.strictEqual(ab.shift, undefined);
  assert.deepStrictEqual([ab.legacy.at, ab.legacy.pos.length, ab.legacy.level, ab.legacy.skills], [0, 80, 4, [{ pos: 'Q', level: 1, levelName: '' }]]);
  assert.deepStrictEqual(o2.employees['c|d'].rate, { s1: 3 });
  assert.strictEqual(o2.employees['c|d'].shift, 'S2');
  assert.deepStrictEqual(o2.marks, { '2026-09': { 'a|b': { m1: 'pozdní příchody' } } });
  assert.deepStrictEqual([o2.capReport.groups, o2.capReport.thr, o2.capReport.hidden, o2.capReport.note.length], [['g1'], 4, ['s1'], 4000]);
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
    const cncSkill = groupSkills(S.positions.find(p => p.id === 'p_cnc'))[0];
    S.employees['novak|martin'].rate[cncSkill.id] = 4;
    S.employees['cerny|jiri'].level = 4;               // ve skupině úroveň nic neznamená, nezapíše se
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
    'level: Novák Martin: CNC – Obsluha stroje 1 → 4',
    'level: Novák Martin: zaučení ve skupině Brusič 0 → 2',
    'position: Skupina CNC, oddělení: — → Obrobna',
    'sanction: Sankce: Černý Jiří – Zničení dílů 10 % (' + m + '): test',
    'settings: Nastavení – délka směny: 7,5 h → 8 h',
  ].sort());
  assert.ok(out.by.every(x => x === 'Vedoucí|aaaaaaaaaaaaaaaa'));
  // hodnocení 1, 3, 2, 1 → 4, 3, 2, 1: z 43,8 % na 62,5 %
  assert.deepStrictEqual(out.hist, [['novak|martin', { at: 1000, pos: 'p_cnc', lvl: 2, pct: 62.5 }]]);
  assert.ok(out.log.includes('Ruční úprava Novák Martin (' + m + '): 0 → +3'), 'opakovaná úprava se sloučí');
  assert.ok(!out.log.some(t => t.includes('0 → +2')));
  assert.ok(!out.log2.some(t => t.startsWith('Ruční úprava')), 'vrácení na původní hodnotu záznam odstraní');
  assert.ok(out.other.some(t => t === 'Ruční úprava Novák Martin (' + m + '): +3 → 0'), 'jiná kartička se neslučuje');
  assert.ok(out.late.some(t => t === 'Ruční úprava Novák Martin (' + m + '): +3 → 0'), 'po 10 minutách se neslučuje');
  assert.strictEqual(out.hasCurrent, false, 'vybrané období je osobní');
  assert.ok(!out.settings.includes('hiddenCols') && !out.settings.includes('lockMinutes'));
  assert.strictEqual(out.v, 37);
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
  // převedené pozice: úroveň 1–4 = 25 % za úroveň v historii i ve výdeji
  assert.deepStrictEqual(o.employees['a|b'].hist, [{ at: 0, pos: 'p1', lvl: 2, pct: 50 }], 'výchozí stav pro starší data');
  assert.deepStrictEqual(o.employees['c|d'].hist, [{ at: 0, pos: null, lvl: null }, { at: 5, pos: 'p2', lvl: 1, pct: 25 }]);
  assert.deepStrictEqual(o.issued['2026-09']['a|b'], { at: 1, tabaky: 2, kafe: true, pos: 'p1', lvl: 2, pct: 50 });
  assert.deepStrictEqual(o.issued['2026-09']['c|d'], { at: 1, tabaky: 2, kafe: false });
  assert.strictEqual(o.log.length, 1);
  assert.deepStrictEqual(o.log[0], { at: 1, by: 'x'.repeat(60), card: '', kind: 'data', text: '<img src=x>', key: 'a|b', m: 'adj:1', p: 'P', v0: '1', v1: '2' });
  assert.strictEqual(o.v, 37);
  return null;
});

test('profil: období od–do, procento dovedností z výdeje a z historie zařazení', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const id = S.current;
    const keep = S.current;
    S.issued[id] = S.issued[id] || {};
    // výdej si pamatuje procento dovedností; profil počítá z něj, ne z dnešního hodnocení (Dvořák má dnes 94 %)
    S.issued[id]['dvorak|petr'] = { at: 5, tabaky: 3, kafe: false, pos: 'p_cnc', pct: 50 };
    S.employees['novak|martin'].hist = [{ at: 0, pos: 'p_cnc', lvl: 2, pct: 25 }, { at: Date.now() + 1e10, pos: 'p_cnc', lvl: 2, pct: 100 }];
    S.employees['vesely|tomas'].hist = [];
    const pd = profileData('dvorak|petr');
    const pn = profileData('novak|martin');
    const pv = profileData('vesely|tomas');
    const none = profileData('dvorak|petr', '2001-01', '2001-12');
    JSON.stringify({ id, same: S.current === keep, months: pd.months.map(m => [m.id, m.skillPct, m.lvl, m.base, m.from, m.hasAtt, m.issued && m.issued.tabaky, m.sanctions.length]),
      totals: pd.totals, pn: pn.months.map(m => [m.skillPct, m.base, m.from]), pv: pv.months.map(m => [m.skillPct, m.base]), cur: levelOf(S.employees['vesely|tomas']).pct,
      none: none.months.length, range: monthsBetween('2025-11', '2026-02'), changes: pd.changes.map(c => c.text), sheets: profileSheets(pd).map(x => x.rows[1].slice(0, 3)) })`));
  assert.ok(out.same, 'vybrané období se po výpočtu vrátí');
  assert.deepStrictEqual(out.months, [[out.id, 50, 2, 4, 'issued', true, 3, 1]], '50 % z 8 tabáků = 4');
  assert.strictEqual(out.totals.issuedTab, 3);
  assert.strictEqual(out.totals.sanctions, 1);
  assert.ok(out.totals.hours > 100 && out.totals.attendance > 0.5 && out.totals.attendance <= 1);
  assert.ok(out.totals.prodTotal > 0 && out.totals.perDay > 0);
  assert.deepStrictEqual(out.pn, [[25, 2, 'hist']], 'pozdější zlepšení se do starého měsíce nepromítne');
  assert.deepStrictEqual(out.pv, [[out.cur, Math.round(8 * out.cur / 100)]], 'bez záznamu platí dnešní hodnocení');
  assert.strictEqual(out.none, 0);
  assert.deepStrictEqual(out.range, ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.deepStrictEqual(out.changes, ['CNC']);
  assert.deepStrictEqual(out.sheets[0], ['Měsíc', 'Skupina', 'Dovednosti %']);
  return null;
});

test('matice dovedností: skupiny, dovednosti, směny a pokrytí', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const sk = groupSkills(S.positions.find(p => p.id === 'p_cnc'));
    S.employees['cerny|jiri'].rate[sk[0].id] = 3;        // Daiho, zaučený na CNC
    const all = skillGrid(null, '*');
    const g = skillGrid('p_cnc', '*');
    const r = skillGrid('p_cnc', 'R');
    const sheets = matrixSheets();
    const cnc = sheets.find(x => x.name === 'CNC');
    JSON.stringify({ cols: all.cols.length, shifts: [...new Set(all.rows.map(x => x.shift))],
      rows: g.rows.map(x => [x.e.key, x.shift, x.home, x.cells]), ready: g.coverage.map(c => c.ready), trained: g.coverage.map(c => c.trained),
      byShift: ['R', 'S1', 'S2'].map(k => g.coverage[0].by[k].ready), onlyR: r.rows.map(x => x.e.key),
      sheets: sheets.map(x => x.name), head: cnc.rows[2], first: cnc.rows[3], legend: sheets[sheets.length - 1].rows[1].slice(0, 4) })`));
  assert.strictEqual(out.cols, 20, 'všechny dovednosti všech skupin');
  assert.deepStrictEqual(out.shifts, ['R', 'S1', 'S2'], 'řazení podle směny');
  assert.deepStrictEqual(out.rows, [
    ['dvorak|petr', 'R', true, [4, 4, 3, 4]], ['cerny|jiri', 'S1', false, [3, 0, 0, 0]], ['novak|martin', 'S2', true, [1, 3, 2, 1]],
  ], 've skupině jsou její lidé i zaučení odjinud');
  assert.deepStrictEqual(out.ready, [2, 2, 1, 1], 'úroveň 3–4');
  assert.deepStrictEqual(out.trained, [3, 2, 2, 2], 'úroveň 1–4');
  assert.deepStrictEqual(out.byShift, [1, 1, 0], 'úroveň 3–4 podle směn');
  assert.deepStrictEqual(out.onlyR, ['dvorak|petr']);
  assert.deepStrictEqual(out.sheets, ['Všechny skupiny', 'CNC', 'Kontrola', 'Brusič', 'Pískování', 'Lepení - Značení', 'Daiho', 'Popis dovedností']);
  assert.deepStrictEqual(out.head, ['Příjmení', 'Jméno', 'Směna', 'Skupina', 'Dovednosti %', 'Obsluha stroje', 'Seřízení a výměna nástrojů', 'Úprava programu', 'Měření a kontrola dílů']);
  assert.deepStrictEqual(out.first, ['Dvořák', 'Petr', 'Stálá ranní', 'CNC', 94, 4, 4, 3, 4]);
  assert.deepStrictEqual(out.legend, ['CNC', 'Obsluha stroje', '', 'Žádná úroveň: Osoba nemá žádné relevantní znalosti ani zkušenosti v této dovednosti.']);
  return null;
});

test('tabáky za dovednosti: 25 % za úroveň, průměr skupiny, zaokrouhlení a strop', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const g = S.positions.find(p => p.id === 'p_cnc');
    g.skillset = g.skillset.slice(0, 2);
    const [a, b] = g.skillset.map(x => x.id);
    const e = { key: 't|t', positionId: 'p_cnc', rate: {} };
    const at = (mt, ra, rb) => { g.maxTab = mt; e.rate = { [a]: ra, [b]: rb }; const L = levelOf(e); return [L.pct, L.base, L.n, L.min]; };
    const res = { none: at(8, 0, 0), half: at(8, 4, 0), full: at(8, 4, 4), r1: at(8, 1, 0), r12: at(8, 1, 2), r32: at(8, 3, 2),
      t10: [at(10, 1, 0)[1], at(10, 2, 1)[1], at(10, 3, 0)[1]], t6: at(6, 1, 0)[1] };
    g.maxTab = 8;
    res.auto = posMaxAuto(g); res.cap = posMax(g); g.max = 9; res.own = posMax(g);
    g.onlyKafe = true; e.rate = { [a]: 4, [b]: 4 }; res.kafe = levelOf(e).base; g.onlyKafe = false;
    g.skillset = []; res.empty = [levelOf(e).pct, levelOf(e).base];
    JSON.stringify(res)`));
  assert.deepStrictEqual(out.none, [0, 0, 0, 0]);
  assert.deepStrictEqual(out.half, [50, 4, 2, 0], 'dvě dovednosti, jedna na 4 = 50 %');
  assert.deepStrictEqual(out.full, [100, 8, 4, 4]);
  assert.deepStrictEqual(out.r1, [12.5, 1, 1, 0], '12,5 % z 8 = 1');
  assert.deepStrictEqual(out.r12, [37.5, 3, 2, 1], '37,5 % z 8 = 3');
  assert.deepStrictEqual(out.r32, [62.5, 5, 3, 2]);
  assert.deepStrictEqual(out.t10, [1, 4, 4], 'zaokrouhlení: 1,25 → 1; 3,75 → 4');
  assert.strictEqual(out.t6, 1, '0,75 → 1');
  assert.strictEqual(out.auto, 10, 'bez stropu: maximum + nejvyšší bonus za víkendy');
  assert.strictEqual(out.cap, 10);
  assert.strictEqual(out.own, 9, 'vlastní strop');
  assert.strictEqual(out.kafe, 0, 'jen Kafe: žádné tabáky');
  assert.deepStrictEqual(out.empty, [null, 0], 'skupina bez dovedností');
  return null;
});

test('aktualizace 2.0 → 2.1: data zůstanou beze změny', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    /* stav, jak ho uložila verze 2.0: bez navýšení platu, „jen Kafe“, času a normy */
    const old = JSON.parse(JSON.stringify(sanitizeState(demoData())));
    delete old.eff;
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
      delete c.settings.prodCols; delete c.v; delete c.eff; return c; };
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
  assert.strictEqual(out.v, 37);
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

test('prémie: stupně, podmínky, body vedoucího a měsíce v řadě', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const id = S.current;
    const p = S.positions.find(x => x.id === 'p_cnc');
    const sk = groupSkills(p).map(x => x.id);
    p.tiers = sanitizeState({ positions: [{ id: 'x', name: 'x', skillset: [], tiers: [
      { id: 'tA', name: 'Prémie', minSkill: 3, raise: 20, maxAbs: 3, minWknd: 2, minNorm: 80, manual: [{ id: 'mA', text: 'Morálka' }] },
      { id: 'tB', name: 'Extra bonus', minSkill: 4, raise: 30, maxAbs: 1, minWknd: 3, minNorm: 95, manual: [{ id: 'mB', text: 'Morálka' }], streak: { months: 4, label: '2. platová třída' } }] }] }).positions[0].tiers;
    const e = { key: 'x|y', positionId: 'p_cnc', rate: Object.fromEntries(sk.map(x => [x, 4])) };
    const ev = (absDays, wkDays, extra) => ({ pos: p, att: { found: true, absDays, wkDays }, lost: false, ...(extra || {}) });
    const pf = norm => ({ att: 98, norm, use: 80 });
    const t = (evx, perf) => { const r = tierOf(e, evx, perf, id, false); return [r.lvl, r.pct, r.name, r.next ? r.next.lvl : null]; };
    const res = {
      top: t(ev(1, 3), pf(96)), abs2: t(ev(2, 3), pf(96)), wk1: t(ev(0, 1), pf(96)), norm: t(ev(0, 3), pf(79)), edge: t(ev(3, 2), pf(80)),
      noNorm: t(ev(0, 3), pf(null)), noAtt: t({ pos: p, att: null, lost: false }, pf(96)), lost: t(ev(0, 3, { lost: true }), pf(96)),
    };
    e.rate[sk[3]] = 2;
    const low = tierOf(e, ev(0, 3), pf(96), id, false);
    res.low = [low.lvl, low.list[0].checks.find(c => c.k === 'skill').txt];
    e.rate[sk[3]] = 4;
    setMark(id, 'x|y', 'mA', 'pozdní příchody');
    const marked = tierOf(e, ev(2, 3), pf(96), id, false);
    res.marked = [marked.lvl, marked.list[0].checks.find(c => c.k === 'manual').txt, JSON.stringify(S.marks)];
    setMark(id, 'x|y', 'mA', null);
    res.unmarked = [tierOf(e, ev(2, 3), pf(96), id, false).lvl, JSON.stringify(S.marks)];
    /* série: tři předchozí měsíce vydané se stupněm 2, aktuální měsíc spočítaný z docházky */
    const d = S.employees['dvorak|petr'];
    sk.forEach(x => { d.rate[x] = 4; });
    p.tiers[1] = { ...p.tiers[1], maxAbs: null, minWknd: null, minNorm: null };
    let m = id;
    for (let i = 0; i < 3; i++) { m = prevMonth(m); (S.issued[m] = S.issued[m] || {})['dvorak|petr'] = { at: 1, tabaky: 0, kafe: false, pos: 'p_cnc', tier: 2 }; }
    const ev2 = evaluate(d, S.periods[id]);
    const st = tierOf(d, ev2, perfOf(ev2.att, productionOf('dvorak|petr')), id, true);
    res.streak = [st.lvl, st.streaks.map(x => [x.lvl, x.have, x.ok, x.label])];
    S.issued[prevMonth(prevMonth(id))]['dvorak|petr'].tier = 1;
    const st2 = tierOf(d, ev2, perfOf(ev2.att, productionOf('dvorak|petr')), id, true);
    res.broken = st2.streaks.map(x => [x.have, x.ok]);
    res.row = allRows().find(r => r.e.key === 'dvorak|petr').raise.pct;
    JSON.stringify(res)`));
  assert.deepStrictEqual(out.top, [2, 30, 'Extra bonus', null], 'splní vše na nejvyšším stupni');
  assert.deepStrictEqual(out.abs2, [1, 20, 'Prémie', 2], 'dvě absence: Extra bonus ne, Prémie ano');
  assert.deepStrictEqual(out.wk1, [0, 0, '', 1], 'jen jeden víkend');
  assert.deepStrictEqual(out.norm, [0, 0, '', 1], 'norma pod 80 %');
  assert.deepStrictEqual(out.edge, [1, 20, 'Prémie', 2], 'přesně na hranici = splněno');
  assert.deepStrictEqual(out.noNorm, [0, 0, '', 1], 'chybějící údaj podmínku nesplní');
  assert.deepStrictEqual(out.noAtt, [0, 0, '', 1], 'bez docházky se absence nedá ověřit');
  assert.deepStrictEqual(out.lost, [0, 0, '', 1], 'ztráta nároku = bez prémie');
  assert.deepStrictEqual(out.low, [0, 'nejnižší úroveň 2'], 'všechny dovednosti aspoň na úrovni 3');
  assert.strictEqual(out.marked[0], 0, 'bod vedoucího označený jako nesplněný');
  assert.strictEqual(out.marked[1], 'nesplněno – pozdní příchody');
  assert.deepStrictEqual(out.unmarked, [1, '{}'], 'zrušení označení vrátí splněno a nic nezůstane');
  assert.deepStrictEqual(out.streak, [2, [[2, 4, true, '2. platová třída']]], 'čtyři měsíce v řadě na Extra bonus');
  assert.deepStrictEqual(out.broken, [[2, false]], 'přerušená série');
  assert.strictEqual(out.row, 30, 'přehled ukazuje navýšení z nejvyššího splněného stupně');
  const kept = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    S.positions[0].tiers[0].raise = 25;
    dropDemoRaise(S.positions);
    JSON.stringify(S.positions.slice(0, 2).map(p => p.tiers.map(t => [t.name, t.raise])))`));
  assert.deepStrictEqual(kept, [[['Prémie', 25]], []], 'ukázkové stupně po ukázce zmizí, upravené zůstanou');
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

test('pravidla do PDF a historie změn skupin', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const a = sharedState(S);
    S.positions.find(x => x.id === 'p_kon').onlyKafe = true;
    const c = S.positions.find(x => x.id === 'p_cnc');
    c.tiers[0].raise = 25; c.maxTab = 10;
    c.skillset[0].name = 'Obsluha CNC';
    c.skillset.push({ id: 'snew', name: 'Programování', desc: 'G-kód', scale: null });
    S.employees['novak|martin'].shift = 'R';
    S.employees['novak|martin'].rate.snew = 2;
    const b = sharedState(S);
    const log = describeChanges(a, b, { by: 'Vedoucí', card: 'a'.repeat(16), at: 1 }).entries.map(e => e.text);
    const d = rulesDoc();
    const kon = d.groups.find(x => x.name === 'Kontrola');
    const cnc = d.groups.find(x => x.name === 'CNC');
    JSON.stringify({ log, general: d.general.map(g => g[0]), kon: { onlyKafe: kon.onlyKafe, rules: kon.rules, steps: kon.steps.map(s => s.tab) },
      cnc: { steps: cnc.steps.map(s => s.tab), skills: cnc.skills.map(s => s.name), tier: cnc.tiers[0], rules: cnc.rules.length }, std: d.std.map(x => x.name) })`));
  const has = t => assert.ok(out.log.includes(t), `${t} | ${out.log.join(' | ')}`);
  has('Skupina Kontrola: jen Kafe, bez tabáků');
  has('Skupina CNC, maximum tabáků za dovednosti: 8 → 10');
  has('Skupina CNC, dovednost: „Obsluha stroje“ → „Obsluha CNC“');
  has('Skupina CNC: nová dovednost „Programování“');
  has('Novák Martin: směna Směnnost – skupina 2 → Stálá ranní');
  has('Novák Martin: CNC – Programování 0 → 2');
  assert.ok(out.log.some(t => t.startsWith('Skupina CNC: varianta prémie „Prémie“') && t.includes('+25 % mzdy')), out.log.join(' | '));
  assert.ok(!out.log.some(t => t.startsWith('Pozice')), 'u skupin se nepíše Pozice');
  assert.deepStrictEqual(out.general, ['Dovednosti', 'Tabáky', 'Absence', 'Kafe', 'Prémie', 'Ukazatele']);
  assert.deepStrictEqual(out.kon, { onlyKafe: true, rules: ['Jen Kafe, bez tabáků.'], steps: ['—', '—', '—', '—', '—'] });
  assert.deepStrictEqual(out.cnc.steps, ['0', '3', '5', '8', '10'], 'tabáky po 25 % z maxima 10');
  assert.deepStrictEqual(out.cnc.skills, ['Obsluha CNC', 'Seřízení a výměna nástrojů', 'Úprava programu', 'Měření a kontrola dílů', 'Programování']);
  assert.strictEqual(out.cnc.tier.reward, 'navýšení mzdy o 25 %');
  assert.ok(out.cnc.tier.conds.includes('všechny dovednosti aspoň 3') && out.cnc.tier.conds.includes('Dodržování řádné pracovní morálky'));
  assert.strictEqual(out.cnc.rules, 3);
  assert.deepStrictEqual(out.std, ['Žádná úroveň', 'Základní úroveň', 'Střední úroveň', 'Pokročilá úroveň', 'Odborná úroveň']);
  return null;
});

test('aktualizace 2.3 → 2.4: pozice se převedou na skupiny, výpočty i data zůstanou', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    /* stav, jak ho uložila verze 2.3: pozice s úrovněmi 1–4, úroveň a zaučení u lidí, navýšení platu u úrovní */
    const old = JSON.parse(JSON.stringify(sanitizeState(demoData())));
    old.positions.forEach(p => { delete p.skillset; delete p.maxTab; delete p.tiers; });
    Object.values(old.employees).forEach(e => { delete e.rate; delete e.shift; delete e.legacy; e.hist = e.hist.map(h => ({ at: h.at, pos: h.pos, lvl: h.lvl })); });
    delete old.marks; delete old.capReport;
    const cnc = old.positions.find(p => p.id === 'p_cnc');
    Object.assign(cnc.levels[2], { raise: 10, minNorm: 90 });
    Object.assign(cnc.levels[3], { raise: 15, minAtt: 90 });
    old.positions.find(p => p.id === 'p_bru').max = 9;
    old.positions.find(p => p.id === 'p_pis').onlyKafe = true;
    old.employees['novak|martin'].skills = { p_bru: 3 };
    old.employees['novak|martin'].hist.push({ at: 5, pos: 'p_cnc', lvl: 2 });
    old.issued[old.current] = { 'dvorak|petr': { at: 7, tabaky: 6, kafe: true, pos: 'p_cnc', lvl: 4 } };
    old.adjust[old.current] = { 'novak|martin': 2 };
    old.v = 5;
    const snap = JSON.stringify(old);
    const rowsOf = st => { S = st; return allRows().map(r => [r.e.key, r.total, r.narok, r.max, !!r.kafe, r.L.base, r.raise.pct]); };
    const S0 = JSON.parse(snap); migrate(S0);
    const before = rowsOf(S0);
    const neu = sanitizeState(JSON.parse(snap));
    const after = rowsOf(neu);
    const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
    const g = neu.positions.find(p => p.id === 'p_cnc'), bru = neu.positions.find(p => p.id === 'p_bru'), pis = neu.positions.find(p => p.id === 'p_pis');
    const nm = neu.employees['novak|martin'];
    const legacy = Object.values(neu.employees).filter(e => e.legacy).length;
    /* „Převedeno do nové verze, smazat“ */
    const a = sharedState(neu);
    delete neu.employees['novak|martin'].legacy;
    const log = describeChanges(a, sharedState(neu), { at: 1, by: 'V', card: '' }).entries.map(e => e.text);
    JSON.stringify({ before, after, again: JSON.stringify(canon(sanitizeState(JSON.parse(JSON.stringify(neu))))) === JSON.stringify(canon(neu)),
      oldUntouched: JSON.stringify(JSON.parse(snap)) === snap,
      g: { skillId: g.skillset[0].id, tierIds: g.tiers.map(t => t.id), skills: g.skillset.map(x => [x.name, x.scale.map(l => l.name)]), maxTab: g.maxTab, max: g.max, tiers: g.tiers.map(t => [t.name, t.minSkill, t.raise, t.minAtt, t.minNorm, t.maxAbs]), levels: g.levels.map(l => l.tabaky) },
      bru: [bru.maxTab, bru.max], pis: [pis.onlyKafe, pis.max],
      nm: { rate: Object.entries(nm.rate).map(([id, v]) => [neu.positions.find(p => p.skillset.some(s => s.id === id)).id, v]), level: nm.level, skills: nm.skills, legacy: nm.legacy && null, hist: nm.hist },
      legacy, legacyText: legacyText(JSON.parse(JSON.stringify(a.employees['novak|martin'].legacy))), issued: neu.issued[neu.current]['dvorak|petr'],
      adjust: neu.adjust[neu.current], v: neu.v, log, pending: (S = neu, legacyPending()) })`));
  assert.deepStrictEqual(out.after, out.before, 'tabáky, nárok, strop, Kafe, základ i navýšení vyjdou stejně');
  assert.ok(out.before.some(r => r[6] > 0), 'test pokrývá i navýšení platu');
  assert.ok(out.again, 'opakované načtení nic nemění');
  assert.ok(out.oldUntouched);
  assert.deepStrictEqual(out.g.skills, [['CNC', ['Žádná úroveň', 'Nováček', 'Pokročilý', 'Samostatný', 'Profík']]], 'jedna dovednost se schématem z úrovní pozice');
  assert.deepStrictEqual([out.g.maxTab, out.g.max], [8, 8], 'maximum = nejvyšší úroveň, strop jako dřív');
  assert.deepStrictEqual(out.g.tiers, [['Úroveň 3 – Samostatný', 3, 10, null, 90, null], ['Úroveň 4 – Profík', 4, 15, 90, null, null]], 'navýšení u úrovní = stupně prémie');
  assert.deepStrictEqual(out.g.levels, [2, 4, 6, 8], 'původní úrovně zůstanou uložené');
  assert.deepStrictEqual([out.g.skillId, out.g.tierIds], ['sp_cnc', ['t3p_cnc', 't4p_cnc']], 'id z převodu jsou odvozená (stejná na každém zařízení)');
  assert.deepStrictEqual(out.bru, [8, 9], 'vlastní strop zůstane');
  assert.deepStrictEqual(out.pis, [true, null]);
  assert.deepStrictEqual(out.nm.rate.sort(), [['p_bru', 3], ['p_cnc', 2]], 'úroveň i zaučení = hodnocení dovednosti');
  assert.strictEqual(out.nm.level, 2, 'původní úroveň zůstane');
  assert.deepStrictEqual(out.nm.skills, { p_bru: 3 }, 'původní zaučení zůstane');
  assert.deepStrictEqual(out.nm.hist.map(h => h.pct), [50, 50]);
  assert.strictEqual(out.legacy, 8, 'každý dostane okno s původním zařazením');
  assert.strictEqual(out.legacyText, 'CNC, úroveň 2 (Pokročilý); zaučení: Brusič 3 (Samostatný)');
  assert.deepStrictEqual(out.issued, { at: 7, tabaky: 6, kafe: true, pos: 'p_cnc', lvl: 4, pct: 100 });
  assert.deepStrictEqual(out.adjust, { 'novak|martin': 2 });
  assert.strictEqual(out.v, 37);
  assert.ok(out.log.some(t => t.startsWith('Novák Martin: původní zařazení z verze 2.3 převedeno do nové verze a smazáno (CNC, úroveň 2')), out.log.join(' | '));
  assert.strictEqual(out.pending, 7);
  return null;
});

test('směny a kapacita: ranní + skupina 1 proti skupině 2 a naopak', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState({ positions: [{ id: 'G', name: 'G', maxTab: 8, skillset: [{ id: 's1', name: 'A' }, { id: 's2', name: 'B' }], tiers: [] }],
      employees: {
        'a|a': { first: 'A', last: 'A', positionId: 'G', shift: 'R', rate: { s1: 4, s2: 1 } },
        'b|b': { first: 'B', last: 'B', positionId: 'G', shift: 'S1', rate: { s1: 3 } },
        'c|c': { first: 'C', last: 'C', positionId: 'G', shift: 'S2', rate: { s2: 4 } },
        'd|d': { first: 'D', last: 'D', positionId: 'G', shift: 'S2', rate: { s1: 2, s2: 3 } },
        'e|e': { first: 'E', last: 'E', positionId: 'G', rate: { s1: 4 } },
        'f|f': { first: 'F', last: 'F', positionId: 'G', shift: 'R', excluded: true, rate: { s1: 4 } } } });
    const c3 = capacity(['G'], 3, []);
    const c2 = capacity(['G'], 2, []);
    const hid = capacity(['G'], 3, ['s2']);
    const sk = (c, i) => { const r = c.groups[0].skills[i]; return { by: ['R', 'S1', 'S2', ''].map(k => r.by[k].n), A: [r.A.am, r.A.pm], B: [r.B.am, r.B.pm], weakest: r.weakest, total: r.total }; };
    const g = c3.groups[0];
    JSON.stringify({ head: c3.head, s1: sk(c3, 0), s2: sk(c3, 1), s1t2: sk(c2, 0), hid: hid.groups[0].skills.map(r => r.s.id), members: g.members,
      bySh: ['R', 'S1', 'S2', ''].map(k => [g.bySh[k].n, g.bySh[k].pct]), thr: capacity(['G'], 9).thr })`));
  assert.deepStrictEqual(out.head, { R: 1, O: 0, S1: 1, S2: 2, '': 1 }, 'vyřazení se nepočítají');
  assert.deepStrictEqual(out.s1, { by: [1, 1, 0, 1], A: [2, 0], B: [1, 1], weakest: 0, total: 3 }, 'A: ráno R + S1, odpoledne S2; B: ráno R + S2, odpoledne S1');
  assert.deepStrictEqual(out.s2, { by: [0, 0, 2, 0], A: [0, 2], B: [2, 0], weakest: 0, total: 2 });
  assert.deepStrictEqual(out.s1t2.A, [2, 1], 'práh 2: úroveň 2 se počítá');
  assert.deepStrictEqual(out.hid, ['s1'], 'skrytá dovednost z reportu zmizí');
  assert.strictEqual(out.members, 5);
  assert.deepStrictEqual(out.bySh, [[1, 62.5], [1, 37.5], [2, 56.25], [1, 50]]);
  assert.strictEqual(out.thr, 4);
  return null;
});

test('zařazení do Excelu a zpět: skupina, směna a hodnocení dovedností', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const sh = rosterSheets();
    const head = sh.main[0], rh = sh.rates[0];
    const nr = sh.main.findIndex(r => r[0] === 'Novák'), rr = sh.rates.findIndex(r => r[0] === 'Novák');
    sh.main[nr][head.indexOf('Směna')] = 'stálá ranní';
    sh.rates[rr][rh.indexOf('CNC · Obsluha stroje')] = 4;
    sh.rates[rr][rh.indexOf('Brusič · Seřízení brusky')] = 2;
    sh.rates[rr][rh.indexOf('CNC · Měření a kontrola dílů')] = 0;
    const pick = e => JSON.stringify([e.positionId, e.level, e.rate, e.shift, e.note, !!e.shortFri, !!e.excluded]);
    const before = pick(S.employees['dvorak|petr']);
    delete S.employees['novak|martin'].shift;
    S.employees['novak|martin'].rate = {};
    const res = applyRoster(sh.main, sh.rates);
    const nm = S.employees['novak|martin'];
    const name = id => { for (const p of S.positions) for (const x of groupSkills(p)) if (x.id === id) return p.name + ' · ' + x.name; };
    /* starší soubor se sloupci Pozice a Úroveň */
    const oldRes = applyRoster([['Příjmení', 'Jméno', 'Pozice', 'Úroveň'], ['Nový', 'Karel', 'Lakovna', '3'], ['Novák', 'Martin', 'CNC', '1']]);
    JSON.stringify({ head, rh: rh.slice(0, 3), res, shift: nm.shift, rate: Object.entries(nm.rate).map(([id, v]) => [name(id), v]).sort(),
      same: pick(S.employees['dvorak|petr']) === before, oldRes, karel: [S.positions.find(p => p.id === S.employees['novy|karel'].positionId).name, isGroup(S.positions.find(p => p.name === 'Lakovna'))],
      nmLevel: S.employees['novak|martin'].level, posSheet: sh.posSheet[1].slice(0, 3), tierRule: sh.rules.find(r => String(r[1]).startsWith('prémie')) })`));
  assert.deepStrictEqual(out.head, ['Příjmení', 'Jméno', 'Skupina', 'Směna', 'Dovednosti %', 'Tabáky za dovednosti', 'Zkrácený pátek', 'Vyřazen ze seznamu', 'Poznámka', 'Oddělení', 'ID v evidenci práce', 'Vedoucí oddělení']);
  assert.deepStrictEqual(out.rh, ['Příjmení', 'Jméno', 'CNC · Obsluha stroje']);
  assert.strictEqual(out.res.touched, 8);
  assert.strictEqual(out.shift, 'R', 'směna podle názvu');
  assert.deepStrictEqual(out.rate, [['Brusič · Seřízení brusky', 2], ['CNC · Obsluha stroje', 4], ['CNC · Seřízení a výměna nástrojů', 3], ['CNC · Úprava programu', 2]], '0 hodnocení smaže');
  assert.ok(out.same, 'ostatní beze změny');
  assert.deepStrictEqual([out.oldRes.created, out.oldRes.newPos], [1, 1]);
  assert.deepStrictEqual(out.karel, ['Lakovna', true], 'nová skupina z importu');
  assert.strictEqual(out.nmLevel, 2, 'úroveň ze starého souboru se u skupiny nepoužije');
  assert.deepStrictEqual(out.posSheet, ['CNC', 'CNC', 'Obsluha stroje']);
  assert.strictEqual(out.tierRule[0], 'CNC');
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
      rosterHead: roster[0][roster[0].indexOf('ID v evidenci práce')], rosterRow: roster.find(r => r[0] === 'Dvořák')[roster[0].indexOf('ID v evidenci práce')], log, clean, keys: [widKey(' 0123 '), widKey('AB-1'), widKey(12.0)] })`));
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

/* ================= verze 2.2: Top 5 nejméně efektivních položek ================= */

/** Evidence práce se sloupci pro Top 5: zakázka, pracovník, datum, EAN, název, kusy, čas, norma. */
const EFF_HEAD = ['Zakázka', 'Pracovník', 'Datum', 'EAN', 'Název položky', 'Kusy', 'Strávený čas (min)', 'Norma (min)'];
function effRows() {
  const rows = [];
  const add = (who, day, ean, name, ks, spent, normMin) => rows.push(['Z' + rows.length, who, day, ean, name, ks, spent, normMin]);
  /* T40/2026 (28. 9. – 4. 10.) přes dva měsíce a T41/2026 (5.–11. 10.) */
  add('Petr Dvořák', '30.9.2026', 8591234567890, 'Držák levý', 10, 120, 60);
  add('Jana Svobodová', '2.10.2026', 8591234567890, 'Držák levý', 6, 100, 40);
  add('Petr Dvořák', '1.10.2026', 'A-77', 'Kryt', 20, 200, 190);
  add('Petr Dvořák', '6.10.2026', 8591234567890, 'Držák levý', 8, 150, 60);
  add('Jana Svobodová', '7.10.2026', '859 1234 567 890', 'Držák levý', 4, 90, 30);
  add('Petr Dvořák', '6.10.2026', 'B-1', 'Hřídel', 5, 300, 240);
  add('Martin Novák', '8.10.2026', 'C-9', 'Podložka', 50, 30, 10);
  add('Martin Novák', '8.10.2026', 'D-4', 'Víko', 12, 240, 250);
  add('Martin Novák', '9.10.2026', 'E-2', 'Pouzdro', 7, 200, 150);
  add('Petr Dvořák', '9.10.2026', '', '', 3, 60, 60);
  /* po opatřeních (dokončena 13. 10.) se držák zlepší */
  add('Petr Dvořák', '19.10.2026', 8591234567890, 'Držák levý', 12, 100, 90);
  add('Jana Svobodová', '22.10.2026', 8591234567890, 'Držák levý', 10, 80, 75);
  add('Petr Dvořák', '10.11.2026', 8591234567890, 'Držák levý', 9, 120, 60);
  return [['Export evidence práce'], EFF_HEAD, ...rows];
}

test('Top 5: EAN v evidenci práce, souhrny po dnech a pracovnících', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const aoa = ${JSON.stringify(effRows())};
    const info = prodColumns(aoa);
    const res = buildProduction(aoa, 'evidence.xlsx', info.guess);
    const oct = res.buckets['2026-10'], sep = res.buckets['2026-09'];
    const clean = cleanProdCols({ ...info.guess, heads: info.heads });
    /* bez sloupce EAN se nic nezmění (soubory jako ve verzi 2.1) */
    const old = buildProduction([['Pracovník', 'Datum', 'Kusy', 'Čas'], ['Petr Dvořák', '3.8.2026', 4, 30]], 'x.xlsx', { header: 0, name: 0, date: 1, ks: 2, spent: 3 });
    /* podvržená data: položka s datem jiného měsíce, prototyp, nesmysly */
    const bad = JSON.parse(JSON.stringify(oct));
    bad.items['__proto__'] = { d: { '2026-10-05': [1, 1, 1, 1, 1] } };
    bad.items['X'] = { name: 'x'.repeat(300), d: { '2026-09-05': [1, 1, 1, 1, 1], 'nesmysl': [1] }, w: {} };
    bad.items['Y'] = { name: 'Y', d: { '2026-10-05': ['a', -5, 1e20, null] }, w: { 'petr dvorak': { '2026-10-05': [1, 2] } } };
    S.production = { '2026-09': sep, '2026-10': bad };
    const st = sanitizeState(JSON.parse(JSON.stringify(S)));
    JSON.stringify({ guess: info.guess, used: res.used, oct: oct.items, sepKeys: Object.keys(sep.items), names: oct.names['petr dvorak'],
      clean: [clean.item, clean.iname], oldItems: 'items' in old.buckets['2026-08'],
      st: st.production['2026-10'].items, eff: st.eff, v: st.v })`));
  assert.deepStrictEqual([out.guess.name, out.guess.date, out.guess.item, out.guess.iname, out.guess.ks, out.guess.spent, out.guess.norm], [1, 2, 3, 4, 5, 6, 7], 'EAN a název položky se poznají z hlavičky, „Zakázka“ ne');
  assert.strictEqual(out.used, 13);
  const d = out.oct['8591234567890'];
  assert.strictEqual(d.name, 'Držák levý');
  assert.deepStrictEqual(d.d['2026-10-06'], [8, 150, 60, 150, 1]);
  assert.deepStrictEqual(d.d['2026-10-07'], [4, 90, 30, 90, 1], 'EAN s mezerami je stejná položka');
  assert.deepStrictEqual(d.w['jana svobodova']['2026-10-07'], [90, 30, 90, 4]);
  assert.deepStrictEqual(out.sepKeys.sort(), ['8591234567890'], 'řádky se rozdělí do měsíců podle data');
  assert.ok(!('' in out.oct), 'řádek bez EAN do položek nepatří');
  assert.strictEqual(out.names.count, 5, 'řádek bez EAN se v evidenci lidí počítá dál');
  assert.deepStrictEqual(out.clean, [3, 4]);
  assert.strictEqual(out.oldItems, false, 'soubor bez EAN nemá položky');
  assert.deepStrictEqual(Object.keys(out.st).sort(), ['8591234567890', 'A-77', 'B-1', 'C-9', 'D-4', 'E-2', 'Y'].sort(), 'jiný měsíc a prototyp pryč');
  assert.deepStrictEqual(out.st.Y.d['2026-10-05'], [0, 0, 1e9, 0, 0]);
  assert.deepStrictEqual(out.st.Y.w['petr dvorak']['2026-10-05'], [1, 2, 0, 0]);
  assert.deepStrictEqual(out.eff, { weeks: {}, cases: [], reports: [], settings: { min: 60, target: 85, d1: 14, d2: 30, unit: 'h' }, nos: {} });
  assert.strictEqual(out.v, 37);
  return null;
});

test('Top 5: týdny ISO a žebříček týdne', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const res = buildProduction(${JSON.stringify(effRows())}, 'evidence.xlsx', prodColumns(${JSON.stringify(effRows())}).guess);
    Object.assign(S.production, res.buckets);
    const w41 = weekRanking('2026-W41'), w40 = weekRanking('2026-W40'), hist = topHistory();
    S.eff.settings.min = 210; _effCache = null;
    const strict = weekRanking('2026-W41');
    JSON.stringify({
      w1: isoWeek('2026-10-07'), w53: isoWeek('2027-01-01').id, w1y: isoWeek('2026-12-31').id, bad: weekById('2025-W53'), ok53: weekById('2026-W53'),
      ranges: [weekRange(weekById('2026-W41')), weekRange(weekById('2026-W40')), weekRange(weekById('2026-W53'))], names: [weekName('2026-W41'), weekLong('2026-W41')],
      shift: [shiftWeek('2026-W53', 1), shiftWeek('2026-W01', -1)],
      top41: w41.top.map(r => [r.ean, Math.round(r.eff * 10) / 10, Math.round(r.lost)]), tot41: Math.round(w41.tot.eff * 10) / 10, items41: w41.items, under41: w41.under, small41: w41.small,
      top40: w40.top.map(r => [r.ean, Math.round(r.eff * 10) / 10]), weeks: effWeeks(), strict: strict.top.map(r => r.ean), hist,
      trend: itemTrend('8591234567890', '2026-W43', 4), workers: itemWorkers('8591234567890', '2026-10-05', '2026-10-11').map(w => [w.name, Math.round(w.eff)]) })`));
  assert.deepStrictEqual(out.w1, { id: '2026-W41', y: 2026, w: 41, from: '2026-10-05', to: '2026-10-11' });
  assert.strictEqual(out.w53, '2026-W53', '1. 1. 2027 patří do 53. týdne roku 2026');
  assert.strictEqual(out.w1y, '2026-W53');
  assert.strictEqual(out.bad, null, '2025 má jen 52 týdnů');
  assert.strictEqual(out.ok53.from, '2026-12-28');
  assert.deepStrictEqual(out.ranges, ['5.–11. 10. 2026', '28. 9. – 4. 10. 2026', '28. 12. 2026 – 3. 1. 2027']);
  assert.deepStrictEqual(out.names, ['T41/2026', 'Týden 41/2026 (5.–11. 10. 2026)']);
  assert.deepStrictEqual(out.shift, ['2027-W01', '2025-W52']);
  /* T41: držák 90/240 = 37,5 %, podložka 33 % ale jen 30 min (pod limitem 60 min), hřídel 80 %, pouzdro 75 %, víko nad normou */
  assert.deepStrictEqual(out.top41, [['8591234567890', 37.5, 150], ['E-2', 75, 50], ['B-1', 80, 60]]);
  assert.strictEqual(out.items41, 5);
  assert.strictEqual(out.under41, 4);
  assert.strictEqual(out.small41, 1, 'podložka je pod 60 min');
  assert.strictEqual(out.tot41, 73.3, 'plnění týdne ze všech položek: 740 / 1010 min (řádek bez EAN se nepočítá)');
  assert.deepStrictEqual(out.top40, [['8591234567890', 45.5], ['A-77', 95]], 'týden přes dva měsíce');
  assert.deepStrictEqual(out.weeks, ['2026-W46', '2026-W43', '2026-W41', '2026-W40']);
  assert.deepStrictEqual(out.strict, ['8591234567890', 'B-1'], 'vyšší limit: položky s méně než 210 min vypadnou');
  assert.deepStrictEqual(out.hist['8591234567890'], ['2026-W40', '2026-W41', '2026-W43', '2026-W46'], 'v T43 je pod normou (91,7 %) taky');
  assert.deepStrictEqual(out.trend.map(t => t.eff), [45.5, 37.5, null, 91.7]);
  assert.deepStrictEqual(out.workers, [['Dvořák Petr', 40], ['Svobodová Jana', 33]]);
  return null;
});

test('Top 5: případ, opatření, ověření po 14 a 30 dnech, nové kolo a historie', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const aoa = ${JSON.stringify(effRows())};
    Object.assign(S.production, buildProduction(aoa, 'evidence.xlsx', prodColumns(aoa).guess).buckets);
    const meta = (d, by = 'Vedoucí dílny') => ({ at: Date.UTC(2026, +d.slice(5, 7) - 1, +d.slice(8, 10), 9), by });
    const before = sharedState(S);
    const c = createCase('8591234567890', '2026-W41', meta('2026-10-12'));
    const s0 = caseState(c, '2026-10-12');
    const r = curRound(c);
    r.cat = 'stroj'; r.cause = 'Chybí přípravek, díl se upíná ručně.'; r.options = 'Přípravek, úprava postupu.';
    effNote(c, meta('2026-10-12'), 'Doplněna příčina', true);
    r.actions.push({ id: 'a1', kind: 'now', text: 'Upínání ve svěráku s dorazem', owner: 'Mistr', due: '', done: '', note: '' });
    r.actions.push({ id: 'a2', kind: 'process', text: 'Přípravek ve spolupráci s technologií', owner: 'Technologie', due: '2026-10-20', done: '', note: '' });
    const s1 = caseState(c, '2026-10-21');
    r.actions[0].done = '2026-10-12'; r.actions[1].done = '2026-10-13';
    const s2 = caseState(c, '2026-10-14');
    const live = measureItem(c.ean, verifyWindow(r, 0).from, '2026-10-27');
    recordVerify(c, 0, '2026-10-27', 'ok', '', meta('2026-10-27'));
    const s3 = caseState(c, '2026-10-28');
    const dl = effDeadlines('2026-11-30');
    recordVerify(c, 1, '2026-11-26', 'fail', 'Plnění zase spadlo.', meta('2026-11-26'));
    const s4 = caseState(c, '2026-11-26');
    reopenCase(c, 'Přípravek nestačí na druhou stranu dílu.', '2026-W46', meta('2026-11-27'));
    const s5 = caseState(c, '2026-11-27');
    const c2 = createCase('B-1', '2026-W41', meta('2026-10-12', 'Mistr noční'));
    cancelCase(c2, 'Chyba v evidenci, norma opravena.', meta('2026-10-13'));
    const after = sharedState(S);
    const changes = describeChanges(before, after, { at: Date.now(), by: 'Vedoucí dílny', card: 'a'.repeat(16) }).entries.map(e => e.text);
    const rep1 = issueWeekReport('2026-W41', meta('2026-10-12'));
    const rep1b = issueWeekReport('2026-W41', meta('2026-10-12'));
    curRound(c).cause = 'Nová příčina';
    const rep2 = issueWeekReport('2026-W41', meta('2026-10-13'));
    const again = sanitizeState(JSON.parse(JSON.stringify(sharedState(S))));
    const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
    const evil = cleanEff({ cases: [{ id: 'x', no: '<b>', ean: 'E', rounds: [{}] }, { id: 'y', no: '2026-001', ean: '', rounds: [{}] },
      { id: 'z', no: '2026-002', ean: 'E', rounds: [{ v: [{ done: '2026-10-01', result: 'fail' }, { done: '2026-10-30', result: 'ok' }], cat: 'hack', actions: [{ kind: 'x', done: 'zítra' }] }] }],
      settings: { min: -5, target: 1e9, d1: 0, d2: 'x' } });
    JSON.stringify({ no: c.no, no2: c2.no, base: c.base, states: [s0, s1, s2, s3, s4, s5].map(s => [s.k, s.due, s.late]),
      v: curRound(c).v, round1: c.rounds[0].v.map(v => [v.result, v.eff, v.from, v.to, v.plan]), rounds: c.rounds.length, live,
      reopenBase: c.rounds[1].base, of: caseOfItem('8591234567890').id === c.id, ofCancelled: caseOfItem('B-1'),
      dl: dl.map(x => [x.date, x.kind, x.late]), log: c.log.map(e => e.t), changes, sum: effSummary('2026-11-27'), ba: caseBeforeAfter(c),
      reps: [rep1.rev, rep1b === rep1, rep2.rev, S.eff.reports.length], repTop: rep2.data.top.map(t => [t.ean, t.case === c.id, t.times]),
      repCase: rep2.data.cases.map(x => [x.no, 'log' in x]), same: JSON.stringify(canon(again.eff)) === JSON.stringify(canon(sharedState(S).eff)), evil })`));
  assert.strictEqual(out.no, '2026-001');
  assert.strictEqual(out.no2, '2026-002');
  assert.deepStrictEqual([out.base.eff, out.base.nspent, out.base.norm, out.base.workers], [37.5, 240, 90, 2]);
  assert.deepStrictEqual(out.states, [
    ['new', '', false],
    ['act', '2026-10-20', true],
    ['v1', '2026-10-27', false],
    ['v2', '2026-11-26', false],
    ['fail', '', false],
    ['new', '', false],
  ], 'analýza → opatření (po termínu) → 1. ověření 14 dní po dokončení → 2. ověření 30 dní po prvním → neúčinné → nové kolo');
  assert.deepStrictEqual(out.live, { eff: 91.7, nspent: 180, norm: 165, spent: 180, ks: 22, rows: 2, workers: 2 }, 'plnění po opatřeních 14.–27. 10.');
  assert.deepStrictEqual(out.round1, [['ok', 91.7, '2026-10-14', '2026-10-27', '2026-10-27'], ['fail', 50, '2026-10-28', '2026-11-26', '2026-11-26']]);
  assert.strictEqual(out.rounds, 2, 'původní kolo zůstává, problém se znovu otevře v témž případu');
  assert.deepStrictEqual(out.v, []);
  assert.strictEqual(out.reopenBase.eff, 50);
  assert.ok(out.of, 'položka má pořád jeden případ');
  assert.strictEqual(out.ofCancelled, null, 'zrušený případ položku neblokuje');
  assert.deepStrictEqual(out.dl, [['2026-11-26', 'v2', true]]);
  assert.deepStrictEqual(out.log, [
    'Případ založen z Top 5 T41/2026, plnění 37,5 %',
    'Doplněna příčina',
    '1. ověření 27. 10. 2026: účinné (plnění 91,7 % za 14. 10.–27. 10. 2026)',
    '2. ověření 26. 11. 2026: neúčinné (plnění 50 % za 28. 10.–26. 11. 2026). Plnění zase spadlo.',
    'Znovu otevřeno, kolo 2 (T46/2026, plnění 50 %): Přípravek nestačí na druhou stranu dílu.',
  ]);
  assert.ok(out.changes.includes('P-2026-001 (8591234567890, Držák levý): Znovu otevřeno, kolo 2 (T46/2026, plnění 50 %): Přípravek nestačí na druhou stranu dílu.'), out.changes.join(' | '));
  assert.ok(out.changes.includes('P-2026-002 (B-1, Hřídel): Případ zrušen: Chyba v evidenci, norma opravena.'), out.changes.join(' | '));
  assert.strictEqual(out.changes.length, 7, 'každý záznam z historie případů jednou');
  assert.deepStrictEqual([out.sum.total, out.sum.open, out.sum.verify, out.sum.fail, out.sum.ok, out.sum.zrus, out.sum.reopened, out.sum.verifs, out.sum.verifOk],
    [2, 1, 0, 0, 0, 1, 1, 2, 1]);
  assert.deepStrictEqual(out.ba, { before: 37.5, after: 50, afterDate: '2026-11-26' });
  assert.deepStrictEqual(out.reps, [1, true, 2, 1], 'stejný obsah = stejná revize, změna = nová revize, report za týden je jeden');
  assert.deepStrictEqual(out.repTop, [['8591234567890', true, 2], ['E-2', false, 1], ['B-1', false, 1]]);
  assert.deepStrictEqual(out.repCase, [['2026-001', false]], 'report nese kopii případu bez historie');
  assert.ok(out.same, 'případy a reporty přežijí uložení a načtení beze změny');
  assert.deepStrictEqual(out.evil.cases.map(x => x.no), ['2026-002'], 'neplatné číslo nebo EAN pryč');
  assert.deepStrictEqual(out.evil.cases[0].rounds[0].v.map(v => v.result), ['fail'], 'po neúčinném ověření další ověření nedává smysl');
  assert.deepStrictEqual([out.evil.cases[0].rounds[0].cat, out.evil.cases[0].rounds[0].actions[0].kind, out.evil.cases[0].rounds[0].actions[0].done], ['', 'now', '']);
  assert.deepStrictEqual(out.evil.settings, { min: 0, target: 200, d1: 1, d2: 30, unit: 'h' });
  return null;
});

test('Top 5: zrušený případ jde smazat natrvalo a nikde se už nepočítá (2.6)', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const aoa = ${JSON.stringify(effRows())};
    Object.assign(S.production, buildProduction(aoa, 'evidence.xlsx', prodColumns(aoa).guess).buckets);
    const meta = (d, by = 'Vedoucí dílny') => ({ at: Date.UTC(2026, +d.slice(5, 7) - 1, +d.slice(8, 10), 9), by });
    const c = createCase('8591234567890', '2026-W41', meta('2026-10-12'));
    const c2 = createCase('B-1', '2026-W41', meta('2026-10-12'));
    curRound(c2).cause = 'Tajná příčina';
    curRound(c2).actions.push({ id: 'a9', kind: 'process', text: 'Úprava normy', owner: 'Technolog', due: '2026-10-20', done: '', note: '' });
    const rep = issueWeekReport('2026-W41', meta('2026-10-12'));
    const inReport = [rep.data.top.some(t => t.case === c2.id), rep.data.cases.some(x => x.id === c2.id), rep.data.deadlines.some(x => x.case === c2.id)];
    const activeDel = deleteCase(c.id);
    cancelCase(c2, 'Duplicitní případ.', meta('2026-10-13'));
    const before = sharedState(S);
    const sumBefore = effSummary('2026-10-14');
    const deleted = deleteCase(c2.id);
    const sumAfter = effSummary('2026-10-14');
    const after = sharedState(S);
    const changes = describeChanges(before, after, { at: Date.now(), by: 'Vedoucí dílny', card: 'a'.repeat(16) }).entries.map(e => e.text);
    const r = S.eff.reports[0].data;
    const again = sanitizeState(JSON.parse(JSON.stringify(after)));
    const fresh = createCase('B-1', '2026-W41', meta('2026-10-14'));
    JSON.stringify({ inReport, activeDel, deleted, again: deleteCase(c2.id), ids: S.eff.cases.map(x => x.no), sumBefore: [sumBefore.total, sumBefore.zrus, sumBefore.lost],
      sum: [sumAfter.total, sumAfter.zrus], lostOnly: sumAfter.lost,
      dl: effDeadlines('2026-10-14').map(x => x.case === c2.id), rep: [r.top.map(t => [t.ean, t.case === c.id, t.case === '']), r.cases.map(x => x.no), r.deadlines.map(x => x.case === c2.id)],
      left: JSON.stringify(after).includes('Tajná příčina'), changes, saved: again.eff.cases.map(x => x.no), nos: again.eff.nos, freshNo: fresh.no, of: caseOfItem('B-1').id === fresh.id })`));
  assert.deepStrictEqual(out.inReport, [true, true, true], 'případ byl ve vydaném reportu');
  assert.strictEqual(out.activeDel, false, 'rozpracovaný případ smazat nejde');
  assert.strictEqual(out.deleted, true);
  assert.strictEqual(out.again, false, 'podruhé už není co mazat');
  assert.deepStrictEqual(out.ids, ['2026-001', '2026-003'], 'zůstal původní případ a nově založený');
  assert.deepStrictEqual(out.sumBefore.slice(0, 2), [2, 1]);
  assert.deepStrictEqual(out.sum, [1, 0], 'souhrn smazaný případ nepočítá');
  assert.ok(out.lostOnly < out.sumBefore[2], 'ztráta smazaného případu se nepočítá');
  assert.deepStrictEqual(out.dl, [], 'ani jeho termíny');
  assert.deepStrictEqual(out.rep, [[['8591234567890', true, false], ['E-2', false, true], ['B-1', false, true]], ['2026-001'], []], 'z reportu zmizel případ, položka v žebříčku zůstala');
  assert.strictEqual(out.left, false, 'text smazaného případu v datech nezůstal');
  assert.deepStrictEqual(out.changes, ['P-2026-002 (B-1, Hřídel): zrušený případ smazán natrvalo']);
  assert.deepStrictEqual(out.saved, ['2026-001'], 'smazání přežije uložení a načtení');
  assert.strictEqual(out.freshNo, '2026-003', 'položka může dostat nový případ, číslo smazaného se znovu nepoužije');
  assert.deepStrictEqual(out.nos, { 2026: 2 }, 'nejvyšší smazané číslo přežije uložení a načtení');
  assert.ok(out.of);
  return null;
});

test('Top 5: ruční zápis týdne (EAN, díl, strávený čas, norma) má přednost před importem', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const aoa = ${JSON.stringify(effRows())};
    Object.assign(S.production, buildProduction(aoa, 'evidence.xlsx', prodColumns(aoa).guess).buckets);
    const before = sharedState(S);
    S.eff.weeks['2026-W41'] = { at: 1, by: 'Vedoucí dílny', items: [
      { id: 'e1', ean: '111', name: 'Držák', spent: 600, norm: 240 },
      { id: 'e2', ean: '222', name: 'Kryt', spent: 300, norm: 270 },
      { id: 'e3', ean: '', name: 'rozepsaný řádek', spent: 0, norm: 0 } ] };
    _effCache = null;
    const top = weekTop('2026-W41'), imp = weekTop('2026-W40');
    const meta = { at: Date.UTC(2026, 9, 12, 9), by: 'Vedoucí dílny' };
    const c = createCase('111', '2026-W41', meta);
    curRound(c).actions.push({ id: 'a1', kind: 'now', text: 'Doraz', owner: '', due: '', done: '2026-10-13', note: '' });
    recordVerify(c, 0, '2026-10-27', 'ok', '', meta, { spent: 300, norm: 285 });
    const rep = weekReportData('2026-W41', '2026-10-12');
    const changes = describeChanges(before, sharedState(S), meta).entries.map(e => e.text);
    const evil = cleanEff({ weeks: { '2026-W41': { items: [1, 2, 3, 4, 5, 6, 7].map(i => ({ id: '<x>', ean: ' 12 34 ', name: 'n', spent: -5, norm: 'x' })) }, 'nesmysl': { items: [{ ean: 'A' }] } } });
    S.eff.weeks = {}; _effCache = null;
    const copied = importWeekToManual('2026-W41', meta);
    JSON.stringify({ top: top.items.map(e => [e.ean, e.eff, e.lost]), src: [top.src, imp.src], weeks: (_effCache = null, effWeeks()).slice(0, 2),
      base: c.base, name: c.name, v: curRound(c).v[0], rep: [rep.src, rep.items, rep.tot, rep.top.map(t => [t.ean, t.eff, t.case === c.id])],
      changes, evil: [Object.keys(evil.weeks), evil.weeks['2026-W41'].items.length, evil.weeks['2026-W41'].items[0]],
      copied, manual: S.eff.weeks['2026-W41'].items.map(e => [e.ean, e.spent, e.norm]) })`));
  assert.deepStrictEqual(out.top, [['111', 40, 360], ['222', 90, 30]], 'od nejnižšího plnění, rozepsaný řádek se nepočítá');
  assert.deepStrictEqual(out.src, ['manual', 'import'], 'ruční zápis vyhrává, týden bez něj se spočítá z evidence práce');
  assert.deepStrictEqual(out.base, { eff: 40, nspent: 600, norm: 240, spent: 600, ks: 0, rows: 0, workers: 0 });
  assert.strictEqual(out.name, 'Držák');
  assert.deepStrictEqual([out.v.eff, out.v.nspent, out.v.norm, out.v.src], [95, 300, 285, 'manual'], 'ověření z ručně zapsaných hodnot');
  assert.deepStrictEqual(out.rep, ['manual', null, { eff: 56.7, norm: 510, nspent: 900, lost: 390, ks: 0 }, [['111', 40, true], ['222', 90, false]]]);
  assert.ok(out.changes.includes('Top 5 T41/2026: 111 Držák: 10 h, norma 4 h (plnění 40 %)'), out.changes.join(' | '));
  assert.ok(!out.changes.some(t => t.includes('rozepsaný')), 'rozepsaný řádek bez EAN se do historie nepíše');
  assert.deepStrictEqual(out.evil, [['2026-W41'], 5, { id: out.evil[2].id, ean: '1234', name: 'n', spent: 0, norm: 0 }], 'nejvýš 5 řádků, čísla a EAN vyčištěné');
  assert.ok(/^e/.test(out.evil[2].id));
  assert.strictEqual(out.copied, 3, 'převzetí výpočtu z evidence práce do ručního zápisu');
  assert.deepStrictEqual(out.manual, [['8591234567890', 240, 90], ['E-2', 200, 150], ['B-1', 300, 240]]);
  return null;
});

test('aktualizace 2.1 → 2.2: data zůstanou beze změny, Top 5 začne prázdný', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    const old = JSON.parse(JSON.stringify(sanitizeState(demoData())));
    delete old.eff; delete old.audit; old.v = 3;
    old.settings.prodCols = { header: 0, name: 0, date: 1, ks: 2, spent: 3, norm: 4, unit: 'min', normPer: 'row', heads: ['Jméno', 'Datum', 'Ks', 'Čas', 'Norma'] };
    const neu = sanitizeState(JSON.parse(JSON.stringify(old)));
    const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
    const strip = st => { const c = JSON.parse(JSON.stringify(st)); delete c.eff; delete c.audit; delete c.v; delete c.settings.prodCols.item; delete c.settings.prodCols.iname; delete c.settings.prodCols.op; return c; };
    const o2 = JSON.parse(JSON.stringify(old)); delete o2.v;
    JSON.stringify({ same: JSON.stringify(canon(strip(neu))) === JSON.stringify(canon(o2)), eff: neu.eff, cols: [neu.settings.prodCols.item, neu.settings.prodCols.iname, neu.settings.prodCols.op], v: neu.v,
      items: Object.values(neu.production).some(pp => 'items' in pp), weeks: (S = neu, effWeeks()) })`));
  assert.ok(out.same, 'všechna data z verze 2.1 zůstanou beze změny');
  assert.deepStrictEqual(out.eff.cases, []);
  assert.deepStrictEqual(out.cols, [null, null, null], 'uložené sloupce importu bez EAN a bez operace (2.35)');
  assert.strictEqual(out.v, 37);
  assert.strictEqual(out.items, false, 'stará evidence práce položky nemá, Top 5 čeká na nový import s EAN');
  assert.deepStrictEqual(out.weeks, []);
  return null;
});

test('Kontroly: 25 % lidí z oddělení, rozložení do dnů bez svátku, střídání za čtyři týdny', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = blank();
    const lvl = () => [1, 2, 3, 4].map(n => ({ name: 'L' + n, tabaky: n * 2, desc: '' }));
    S.positions = [
      { id: 'p_cnc', name: 'CNC', dept: 'Obrobna', max: null, levels: lvl(), penalty: [], bonus: [] },
      { id: 'p_fre', name: 'Frézka', dept: 'Obrobna', max: null, levels: lvl(), penalty: [], bonus: [] },
      { id: 'p_kon', name: 'Kontrola', dept: 'Kontrola kvality', max: null, levels: lvl(), penalty: [], bonus: [] },
      { id: 'p_mon', name: 'Montáž', dept: '', max: null, levels: lvl(), penalty: [], bonus: [] },
    ];
    const add = (k, pos, extra) => { S.employees[k] = { key: k, last: 'Příjmení' + k, first: 'Jan', positionId: pos, level: 1, note: '', ...(extra || {}) }; };
    for (let i = 0; i < 7; i++) add('c' + i, 'p_cnc');
    for (let i = 0; i < 3; i++) add('f' + i, 'p_fre');
    for (let i = 0; i < 4; i++) add('k' + i, 'p_kon');
    for (let i = 0; i < 9; i++) add('m' + i, 'p_mon');
    add('x', 'p_cnc', { excluded: true });
    add('n', null);
    S = sanitizeState(S);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const meta = d => ({ at: Date.UTC(2026, 9, d, 9), by: 'Vedoucí dílny' });
    const before = sharedState(S);
    S.audit.tasks['Obrobna'] = [{ id: 't1', text: 'Kontrola prvního kusu' }, { id: 't2', text: 'Úklid pracoviště' }, { id: 't3', text: 'Záznam do průvodky' }];
    const days = audDays('2026-W44');
    const plan = generatePlan('2026-W44', meta(23), rnd);
    const per = {}; plan.items.forEach(i => { per[i.dept] = (per[i.dept] || 0) + 1; });
    const load = {}; plan.items.forEach(i => { load[i.day] = (load[i.day] || 0) + 1; });
    const obDays = plan.items.filter(i => i.dept === 'Obrobna').map(i => i.day);
    const total = plan.items.length;
    const ob = plan.items.find(i => i.dept === 'Obrobna');
    let noAnswer = '', noTasks = '';
    try { recordCheck('2026-W44', ob.id, { date: ob.day, answers: { t1: true, t2: false } }, meta(26)); } catch (e) { noAnswer = e.message; }
    const mon = plan.items.find(i => i.dept === 'Montáž');
    try { recordCheck('2026-W44', mon.id, { date: mon.day, answers: {} }, meta(26)); } catch (e) { noTasks = e.message; }
    recordCheck('2026-W44', ob.id, { date: ob.day, checker: 'Mistr', answers: { t1: true, t2: false, t3: true }, notes: { t2: 'Pod strojem třísky' }, note: 'Jinak v pořádku.' }, meta(26));
    S.audit.tasks['Obrobna'][0].text = 'Kontrola prvního kusu podle výkresu';
    const sub = substituteCheck('2026-W44', mon.id, 'nemocný', meta(26), rnd);
    const afterRecord = sharedState(S);
    const changes = describeChanges(before, afterRecord, { at: Date.UTC(2026, 9, 26, 10), by: 'Vedoucí dílny' }).entries.map(e => e.text);
    const sum = planSummary('2026-W44', '2026-10-29');
    const stats = personAuditStats(ob.key);
    const checks = personChecks(ob.key);
    const regen = generatePlan('2026-W44', meta(27), rnd);
    const live = d => regen.items.filter(i => i.dept === d && i.state !== 'skip').length;
    const regenChanges = describeChanges(afterRecord, sharedState(S), { at: Date.UTC(2026, 9, 27, 10), by: 'Vedoucí dílny' }).entries.map(e => e.text);
    // čtyři další týdny, vše provedeno: vystřídají se všichni
    const seen = {};
    ['2026-W45', '2026-W46', '2026-W47', '2026-W48'].forEach(w => {
      generatePlan(w, meta(28), rnd).items.forEach(i => { i.state = 'done'; i.done = i.day; (seen[i.dept] || (seen[i.dept] = new Set())).add(i.key); });
    });
    const again = sanitizeState(JSON.parse(JSON.stringify(sharedState(S))));
    const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
    const evil = cleanAudit({ tasks: { __proto__x: [], 'Obrobna': [{ id: 'a', text: '' }, { id: 'b', text: 'x'.repeat(400) }, { id: 'b', text: 'dup' }], '': [{ text: 'bez oddělení' }] },
      plans: { 'zitra': { items: [] }, '2026-W50': { pct: 900, days: ['2026-12-07', 'pondělí'], items: [
        { id: 'i1', key: 'c1', dept: 'Obrobna', day: '2026-12-07', state: 'done', done: '', results: [] },
        { id: 'i2', key: 'c2', dept: 'Obrobna', day: '2026-12-08', state: 'hack', results: [{ ok: 'ano' }] },
        { id: 'i3', key: '', dept: 'Obrobna', day: '2026-12-08' },
        { id: 'i4', key: 'c3', dept: 'Obrobna', day: '2026-12-09', state: 'done', done: '2026-12-09', results: [{ t: 't1', text: 'A', ok: 'true' }, { t: 't2', text: 'B', ok: true }] } ] } },
      settings: { pct: 0 } });
    JSON.stringify({ days, per, load, obDays, total, excluded: plan.items.some(i => i.key === 'x' || i.key === 'n'),
      noAnswer, noTasks, ob: [ob.state, ob.checker, ob.results.map(r => [r.text, r.ok, r.note])], sub: sub && [sub.dept, sub.day === mon.day, sub.key !== mon.key, mon.state, mon.reason],
      changes, sum, stats: [stats.checks, stats.points, stats.ok, Math.round(stats.pct * 10) / 10], checks: checks.map(c => [c.done, c.score.ok, c.score.n]),
      regen: [live('Obrobna'), live('Kontrola kvality'), live('Montáž'), regen.items.filter(i => i.state === 'done').length, regen.items.filter(i => i.state === 'skip').length,
        regen.items.some(i => i.state === 'plan' && i.key === mon.key)], regenChanges,
      seen: Object.fromEntries(Object.entries(seen).map(([d, s]) => [d, s.size])), same: JSON.stringify(canon(again.audit)) === JSON.stringify(canon(sharedState(S).audit)), evil })`));
  assert.deepStrictEqual(out.days, ['2026-10-26', '2026-10-27', '2026-10-29', '2026-10-30'], '28. 10. je státní svátek');
  assert.deepStrictEqual(out.per, { Obrobna: 3, 'Kontrola kvality': 1, 'Montáž': 3 }, '25 % zaokrouhleno nahoru: 10 → 3, 4 → 1, 9 → 3');
  assert.strictEqual(out.total, 7);
  assert.strictEqual(out.excluded, false, 'vyřazení a lidé bez pozice se nekontrolují');
  assert.strictEqual(new Set(out.obDays).size, 3, 'lidé z jednoho oddělení jsou na různých dnech');
  assert.deepStrictEqual(Object.values(out.load).sort(), [1, 2, 2, 2], 'dny jsou vytížené rovnoměrně');
  assert.match(out.noAnswer, /U každého bodu vyber/);
  assert.match(out.noTasks, /Montáž nemá nutné úkony/);
  assert.deepStrictEqual(out.ob, ['done', 'Mistr', [['Kontrola prvního kusu', true, ''], ['Úklid pracoviště', false, 'Pod strojem třísky'], ['Záznam do průvodky', true, '']]],
    'zápis drží text bodu z doby kontroly');
  assert.deepStrictEqual(out.sub, ['Montáž', true, true, 'skip', 'nemocný'], 'náhradník z téhož oddělení na stejný den');
  assert.ok(out.changes.includes('Nutné úkony – Obrobna: přidán bod „Kontrola prvního kusu podle výkresu“'), out.changes.join(' | '));
  assert.ok(out.changes.includes('Kontroly T44/2026: vygenerován plán, naplánováno 6 lidí (25 % z každého oddělení)'), out.changes.join(' | '));
  assert.ok(out.changes.some(t => /^Kontrola Příjmení[cf]\d Jan \(Obrobna\) 2[67]\. 10\. 2026, kontroloval Mistr: splněno 2 z 3 \(nesplněno: Úklid pracoviště\)$/.test(t)), out.changes.join(' | '));
  assert.ok(out.changes.some(t => /^Kontrola Příjmením\d Jan \(Montáž\) .*: neproběhla – nemocný$/.test(t)), out.changes.join(' | '));
  assert.ok(out.changes.some(t => /^Kontroly T44\/2026: náhradník Příjmením\d Jan \(Montáž\) na /.test(t)), out.changes.join(' | '));
  assert.deepStrictEqual([out.sum.planned, out.sum.done, out.sum.skip, out.sum.points, out.sum.ok], [7, 1, 1, 3, 2]);
  assert.deepStrictEqual(out.stats, [1, 3, 2, 66.7]);
  assert.strictEqual(out.checks.length, 1);
  assert.deepStrictEqual(out.regen, [3, 1, 3, 1, 1, false], 'přegenerování nechá provedené a neproběhlé, nemocného znovu nevybere');
  assert.deepStrictEqual(out.regenChanges, ['Kontroly T44/2026: plán přegenerován, naplánováno 6 lidí (25 % z každého oddělení)'], 'provedené kontroly se znovu nezapíšou');
  assert.deepStrictEqual(out.seen, { Obrobna: 10, 'Kontrola kvality': 4, 'Montáž': 9 }, 'za čtyři týdny se vystřídají všichni');
  assert.ok(out.same, 'kontroly přežijí uložení a načtení beze změny');
  assert.deepStrictEqual(Object.keys(out.evil.tasks), ['Obrobna'], 'prázdné oddělení pryč');
  assert.deepStrictEqual(out.evil.tasks.Obrobna.map(t => [t.id, t.text.length]), [['b', 300]], 'prázdný bod a duplicitní id pryč, text zkrácen');
  assert.deepStrictEqual(Object.keys(out.evil.plans), ['2026-W50']);
  assert.deepStrictEqual(out.evil.plans['2026-W50'].items.map(i => [i.id, i.state, i.results.map(r => r.ok)]), [['i2', 'plan', []], ['i4', 'done', [false, true]]],
    'provedená kontrola bez data a bez člověka pryč, neznámý stav = naplánováno, ok jen true');
  assert.deepStrictEqual([out.evil.plans['2026-W50'].pct, out.evil.plans['2026-W50'].days, out.evil.settings.pct], [100, ['2026-12-07'], 5]);
  return null;
});

test('aktualizace 2.2 → 2.3: data zůstanou beze změny, Kontroly začnou prázdné', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    const old = JSON.parse(JSON.stringify(sanitizeState(demoData())));
    delete old.audit; old.v = 4;
    old.eff.weeks['2026-W41'] = { items: [{ id: 'e1', ean: 'A-1', name: 'Díl', spent: 600, norm: 300 }], at: 1, by: 'x' };
    const neu = sanitizeState(JSON.parse(JSON.stringify(old)));
    const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
    const strip = st => { const c = JSON.parse(JSON.stringify(st)); delete c.audit; delete c.v; return c; };
    const o2 = JSON.parse(JSON.stringify(old)); delete o2.v;
    JSON.stringify({ same: JSON.stringify(canon(strip(neu))) === JSON.stringify(canon(o2)), audit: neu.audit, v: neu.v })`));
  assert.ok(out.same, 'všechna data z verze 2.2 zůstanou beze změny');
  assert.deepStrictEqual(out.audit, { tasks: {}, plans: {}, settings: { pct: 25 } });
  assert.strictEqual(out.v, 37);
  return null;
});

test('aktualizace 2.5 → 2.6: data zůstanou beze změny, přibude jen evidence smazaných čísel případů', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const c = createCase('A-1', '', { at: Date.UTC(2026, 9, 12, 9), by: 'x' });
    const old = JSON.parse(JSON.stringify(S));
    delete old.eff.nos; old.v = 6;
    const neu = sanitizeState(JSON.parse(JSON.stringify(old)));
    const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
    const strip = st => { const x = JSON.parse(JSON.stringify(st)); delete x.eff.nos; delete x.v; return x; };
    const o2 = JSON.parse(JSON.stringify(old)); delete o2.v;
    JSON.stringify({ same: JSON.stringify(canon(strip(neu))) === JSON.stringify(canon(o2)), nos: neu.eff.nos, v: neu.v, cases: neu.eff.cases.map(x => x.no) })`));
  assert.ok(out.same, 'všechna data z verze 2.5 zůstanou beze změny');
  assert.deepStrictEqual([out.nos, out.v, out.cases], [{}, 37, ['2026-001']]);
  return null;
});

test('vedoucí pracovníci (2.7): mimo tabáky, kontroly a kapacitu, v matici jako vedoucí oddělení', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const dept = departments()[0];
    const e = Object.values(S.employees).find(x => empDept(x) === dept && !x.excluded);
    const name = e.last + ' ' + e.first;
    const before = sharedState(S);
    const counts = () => ({ rows: activeRows().some(r => r.e.key === e.key), matrix: matrixPeople().some(x => x.key === e.key),
      grid: skillGrid(null, '*').rows.some(r => r.e.key === e.key), kt: audPeople(dept).some(x => x.key === e.key),
      cap: capacity(null, 3).head, excluded: excludedPeople().some(x => x.key === e.key) });
    const was = counts();
    e.lead = [dept];
    const now = counts();
    const mid = sharedState(S);
    const log1 = describeChanges(before, mid, { at: 1, by: 'x', card: 'a'.repeat(16) }).entries.map(x => x.text);
    e.lead = [dept, 'Montáž'];
    const log2 = describeChanges(mid, sharedState(S), { at: 2, by: 'x', card: 'a'.repeat(16) }).entries.map(x => x.text);
    const lead = { of: leadsOf(dept).map(x => x.key), line: leadLine(S.positions.filter(p => deptOf(p) === dept)) };
    const sh = rosterSheets();
    const col = sh.main[0].indexOf('Vedoucí oddělení');
    const cell = sh.main.find(r => r[0] === e.last && r[1] === e.first)[col];
    /* přejmenované oddělení: vedoucí ho má dál */
    const g = S.positions.find(p => deptOf(p) === dept);
    const old = deptOf(g); S.positions.filter(p => deptOf(p) === old).forEach(p => { p.dept = 'Obrobna nová'; }); leadsFollowDept(old, 'Obrobna nová');
    const renamed = e.lead.slice();
    /* import zařazení se sloupcem Vedoucí oddělení */
    const imp = applyRoster([['Příjmení', 'Jméno', 'Skupina', 'Vedoucí oddělení'], ['Šéf', 'Karel', '', 'obrobna nová, Neexistuje'], ['Mistr', 'Jan', '', 'ano'], [e.last, e.first, '', '']]);
    const sanitized = sanitizeState({ ...JSON.parse(JSON.stringify(sharedState(S))), employees: { 'a|b': { first: 'B', last: 'A', lead: ['  X ', '', 'X', 5] }, 'c|d': { first: 'D', last: 'C', lead: 'Obrobna' } } }).employees;
    const off = sharedState(S); delete S.employees['sef|karel'].lead;
    const log3 = describeChanges(off, sharedState(S), { at: 3, by: 'x', card: 'a'.repeat(16) }).entries.map(x => x.text);
    JSON.stringify({ dept, name, was, now, log1, log2, log3, lead, cell, renamed, imp: imp.err || null,
      karel: S.employees['sef|karel'] ? 'ok' : null, mistr: S.employees['mistr|jan'].lead, back: isLead(e),
      clean: [sanitized['a|b'].lead, 'lead' in sanitized['c|d']] })`));
  assert.deepStrictEqual([out.was.rows, out.was.matrix, out.was.grid, out.was.kt], [true, true, true, true], 'před: běžně hodnocený');
  assert.deepStrictEqual([out.now.rows, out.now.matrix, out.now.grid, out.now.kt, out.now.excluded], [false, false, false, false, false], 'vedoucí: mimo tabáky, matici lidí, kontroly; není vyřazený');
  const heads = c => c.R + c.O + c.S1 + c.S2 + c[''];
  assert.strictEqual(heads(out.now.cap), heads(out.was.cap) - 1, 'ani v kapacitě směn');
  assert.deepStrictEqual(out.log1, [`${out.name} je vedoucí pracovník (${out.dept})`]);
  assert.deepStrictEqual(out.log2, [`${out.name}: vedoucí oddělení ${out.dept} → ${out.dept}, Montáž`]);
  assert.ok(out.lead.of.length === 1 && out.lead.line === `Vedoucí oddělení: ${out.dept} – ${out.name}`, out.lead.line);
  assert.strictEqual(out.cell, `${out.dept}, Montáž`, 'export zařazení: sloupec Vedoucí oddělení');
  assert.deepStrictEqual(out.renamed, ['Obrobna nová', 'Montáž'], 'přejmenované oddělení vedoucí neztratí');
  assert.strictEqual(out.imp, null);
  assert.deepStrictEqual(out.mistr, [], '„ano“ = vedoucí bez oddělení');
  assert.strictEqual(out.back, false, 'prázdná buňka = už není vedoucí');
  assert.deepStrictEqual(out.log3, ['Šéf Karel už není vedoucí pracovník']);
  assert.deepStrictEqual(out.clean, [['X', '5'], false], 'čištění: jen seznam textů, duplicity a prázdné pryč');
  return null;
});

test('aktualizace 2.6 → 2.7: data zůstanou beze změny, nikdo není vedoucí', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const old = JSON.parse(JSON.stringify(S)); old.v = 7;
    const neu = sanitizeState(JSON.parse(JSON.stringify(old)));
    const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
    const strip = st => { const x = JSON.parse(JSON.stringify(st)); delete x.v; return x; };
    JSON.stringify({ same: JSON.stringify(canon(strip(neu))) === JSON.stringify(canon(strip(old))), leads: Object.values(neu.employees).filter(isLead).length, v: neu.v })`));
  assert.ok(out.same, 'všechna data z verze 2.6 zůstanou beze změny');
  assert.deepStrictEqual([out.leads, out.v], [0, 37]);
  return null;
});

test('matice (2.20): nemocní jsou v řádcích, do pokrytí se nepočítají; vyřazení chybí; řazení podle ID', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState({ positions: [{ id: 'G', name: 'G', maxTab: 8, skillset: [{ id: 's1', name: 'A' }], tiers: [] }],
      employees: {
        'a|a': { first: 'A', last: 'A', positionId: 'G', shift: 'R', rate: { s1: 4 }, wid: '20' },
        'b|b': { first: 'B', last: 'B', positionId: 'G', shift: 'R', rate: { s1: 3 }, wid: '3', sick: '2026-10-10' },
        'c|c': { first: 'C', last: 'C', positionId: 'G', shift: 'R', rate: { s1: 3 } },
        'd|d': { first: 'D', last: 'D', positionId: 'G', shift: 'R', rate: { s1: 4 }, wid: '100', excluded: true } } });
    const byName = skillGrid('G', '*'), byId = skillGrid('G', '*', null, true);
    const sheet = matrixSheets()[0].rows.map(x => x[0]).filter(t => /V nemoci/.test(t));
    JSON.stringify({ name: byName.rows.map(r => r.e.key), id: byId.rows.map(r => r.e.key), cov: byId.coverage[0], sick: byId.sick, sheet,
      cap: capacity(['G'], 3, []).groups[0].skills[0].total })`));
  assert.deepStrictEqual(out.name, ['a|a', 'b|b', 'c|c'], 'vyřazený v matici není');
  assert.deepStrictEqual(out.id, ['b|b', 'a|a', 'c|c'], 'podle ID číselně (3 < 20), bez ID na konci');
  assert.deepStrictEqual([out.cov.ready, out.cov.trained, out.cov.by.R.ready], [2, 2, 2], 'nemocný se do pokrytí nepočítá');
  assert.strictEqual(out.sick, 1);
  assert.strictEqual(out.cap, 2, 'stejně jako kapacita směn');
  assert.deepStrictEqual(out.sheet, ['V nemoci: 1 (do počtů úrovní se dočasně nepočítají)']);
  return null;
});

test('stálá odpolední směna (2.8): odpoledne v obou variantách, matice, import a Excel', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState({ positions: [{ id: 'G', name: 'G', maxTab: 8, skillset: [{ id: 's1', name: 'A' }], tiers: [] }],
      employees: {
        'a|a': { first: 'A', last: 'A', positionId: 'G', shift: 'R', rate: { s1: 4 } },
        'b|b': { first: 'B', last: 'B', positionId: 'G', shift: 'S1', rate: { s1: 3 } },
        'o|o': { first: 'O', last: 'O', positionId: 'G', shift: 'O', rate: { s1: 3 } },
        'x|x': { first: 'X', last: 'X', positionId: 'G', shift: 'X', rate: { s1: 3 } } } });
    const c = capacity(['G'], 3, []), r = c.groups[0].skills[0];
    const grid = skillGrid(null, '*');
    const onlyO = skillGrid(null, 'O').rows.map(x => x.e.key);
    const sheet = matrixSheets()[0].rows.map(x => x[0]).filter(t => /^Úroveň 3–4: /.test(t));
    const imp = applyRoster([['Příjmení', 'Jméno', 'Skupina', 'Směna'], ['B', 'B', 'G', 'stálá odpolední'], ['A', 'A', 'G', 'Odpolední']]);
    JSON.stringify({ head: c.head, A: [r.A.am, r.A.pm], B: [r.B.am, r.B.pm], total: r.total, bySh: c.groups[0].bySh.O.n,
      order: grid.rows.map(x => x.shift), cov: grid.coverage[0].by.O, onlyO, sheet, name: shiftName('O'),
      imp: [S.employees['b|b'].shift, S.employees['a|a'].shift, imp.err || null], unknown: shiftOf(S.employees['x|x']),
      kept: sanitizeState(JSON.parse(JSON.stringify(S))).employees['b|b'].shift })`));
  assert.deepStrictEqual(out.head, { R: 1, O: 1, S1: 1, S2: 0, '': 1 }, 'neznámá směna = bez směny');
  assert.deepStrictEqual([out.A, out.B, out.total], [[2, 1], [1, 2], 4], 'A: ráno R + S1, odpoledne O + S2; B: ráno R + S2, odpoledne O + S1');
  assert.strictEqual(out.bySh, 1);
  assert.deepStrictEqual(out.order, ['R', 'O', 'S1', ''], 'v matici za stálou ranní');
  assert.deepStrictEqual(out.cov, { ready: 1, trained: 1 });
  assert.deepStrictEqual(out.onlyO, ['o|o']);
  assert.ok(out.sheet.includes('Úroveň 3–4: Stálá odpolední'), out.sheet.join(' | '));
  assert.strictEqual(out.name, 'Stálá odpolední');
  assert.deepStrictEqual(out.imp, ['O', 'O', null], 'import zařazení pozná stálou odpolední');
  assert.strictEqual(out.unknown, '');
  assert.strictEqual(out.kept, 'O', 'směna přežije uložení a načtení');
  return null;
});

test('střídání skupin po týdnu (2.8): kdo má ranní v kterém týdnu, i přes přelom roku', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    const ref = '2026-W42';
    S = sanitizeState({ capReport: { s1am: ref, thr: 3 } });
    const bad = sanitizeState({ capReport: { s1am: '2026-W99' } }).capReport.s1am;
    JSON.stringify({ g: ['2026-W41', '2026-W42', '2026-W43', '2026-W44', '2026-W53', '2027-W01'].map(w => morningGroup(w, ref)),
      v: [capWeekVar('2026-W42', ref), capWeekVar('2026-W43', ref), capWeekVar('2026-W43', '')], kept: S.capReport.s1am, bad,
      blank: blankCapReport().s1am })`));
  assert.deepStrictEqual(out.g, ['S2', 'S1', 'S2', 'S1', 'S2', 'S1'], 'T42 skupina 1 ranní, pak se střídá; 2026 má 53 týdnů');
  assert.deepStrictEqual(out.v, ['A', 'B', ''], 'A = skupina 1 ranní, B = skupina 2 ranní, bez nastavení nic');
  assert.deepStrictEqual([out.kept, out.bad, out.blank], ['2026-W42', '', '']);
  return null;
});

test('plánovaná kapacita skupiny (2.9): ks nebo hodiny na osobu, ranní, odpolední, den, týden; nemoc se nepočítá', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState({ positions: [{ id: 'G', name: 'Lis', skillset: [{ id: 's1', name: 'A' }], plan: { v: 25, unit: 'ks' } },
        { id: 'H', name: 'Lak', skillset: [], plan: { v: '7,5'.replace(',', '.'), unit: 'h' } }, { id: 'X', name: 'X', skillset: [], plan: { v: -3 } }],
      employees: {
        'a|a': { first: 'A', last: 'A', positionId: 'G', shift: 'R', rate: { s1: 4 } },
        'b|b': { first: 'B', last: 'B', positionId: 'G', shift: 'S1', rate: { s1: 4 } },
        'c|c': { first: 'C', last: 'C', positionId: 'G', shift: 'S1', rate: { s1: 4 } },
        'd|d': { first: 'D', last: 'D', positionId: 'G', shift: 'S2', rate: { s1: 4 }, sick: '2026-10-09' },
        'e|e': { first: 'E', last: 'E', positionId: 'G', shift: 'O', rate: { s1: 4 } },
        'f|f': { first: 'F', last: 'F', positionId: 'G', rate: { s1: 4 } },
        'g|g': { first: 'G', last: 'G', positionId: 'G', shift: 'S2', excluded: true },
        'h|h': { first: 'H', last: 'H', positionId: 'H', shift: 'R' }, 'i|i': { first: 'I', last: 'I', positionId: 'H', shift: 'S2' } } });
    const g = S.positions[0], h = S.positions[1];
    const plans = JSON.parse(JSON.stringify(S.positions.map(p => p.plan || null)));
    const A = groupPlan(g, 'A', 5), B = groupPlan(g, 'B', workDays('2026-W44')), hb = groupPlan(h, 'B', 5);
    const cap = capacity(['G'], 3, []);
    const before = sharedState(S);
    g.plan.v = 30; delete S.employees['d|d'].sick; S.employees['c|c'].sick = '2026-10-10';
    const log = describeChanges(before, sharedState(S), { at: 1, by: 'x', card: 'a'.repeat(16) }).entries.map(e => e.text);
    JSON.stringify({ plans, A, B, hb, days: [workDays('2026-W44'), workDays('2026-W41'), workDays('2026-W52')],
      none: groupPlan(S.positions[2], 'A', 5), capHead: cap.head, capSick: cap.sick, s1: cap.groups[0].skills[0].by.S2.n, log })`));
  assert.deepStrictEqual(out.plans, [{ v: 25, unit: 'ks' }, { v: 7.5, unit: 'h' }, null], 'záporná hodnota = vypnuto');
  assert.deepStrictEqual(out.A, { per: 25, unit: 'ks', amN: 3, pmN: 1, am: 75, pm: 25, day: 100, days: 5, week: 500, none: 1, sick: 1 },
    'A: ranní stálá ranní + skupina 1 (3), odpolední stálá odpolední + skupina 2 (nemocný se nepočítá); bez směny a vyřazený mimo');
  assert.deepStrictEqual([out.B.amN, out.B.pmN, out.B.am, out.B.pm, out.B.day, out.B.days, out.B.week], [1, 3, 25, 75, 100, 4, 400], 'B naopak; T44/2026 má svátek 28. 10.');
  assert.deepStrictEqual([out.hb.am, out.hb.pm, out.hb.day, out.hb.week, out.hb.unit], [15, 0, 15, 75, 'h'], 'hodiny: 2 lidé ranní × 7,5 h');
  assert.deepStrictEqual(out.days, [4, 5, 3], 'pracovní dny bez svátků (T52: 24.–26. 12.)');
  assert.strictEqual(out.none, null);
  assert.deepStrictEqual([out.capHead.S2, out.capSick, out.s1], [1, 1, 0], 'nemocný není ani v kapacitě dovedností (ve skupině 2 zbyl jen člověk ze skupiny Lak)');
  assert.ok(out.log.includes('Skupina Lis, plánovaná kapacita: 25 ks na osobu za směnu → 30 ks na osobu za směnu'), out.log.join(' | '));
  assert.ok(out.log.includes('D D: zpět po nemoci, zase v kapacitách') && out.log.includes('C C: nemoc, dočasně se nepočítá do kapacit'), out.log.join(' | '));
  return null;
});

test('dovednosti vedoucích (2.10): jeden seznam pro všechny, úroveň 0–4, mimo tabáky a kapacitu, historie a Excel', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const dept = departments()[0];
    const e = Object.values(S.employees).find(x => empDept(x) === dept && !x.excluded);
    e.lead = [dept];
    S.employees['sef|karel'] = { first: 'Karel', last: 'Šéf', lead: [] };
    const pctBefore = Object.values(S.employees).filter(x => !isLead(x)).map(x => { const L = levelOf(x); return [x.key, L.pct, L.base]; });
    const capBefore = JSON.stringify(capacity(null, 3));
    const before = sharedState(S);
    S.leadSkills = [{ id: 'lvede', name: 'Vedení lidí', desc: 'Porady, zpětná vazba' }, { id: 'lplan', name: 'Plánování směn', desc: '' }];
    const mid = sharedState(S);
    const log1 = describeChanges(before, mid, { at: 1, by: 'x', card: 'a'.repeat(16) }).entries.map(x => x.text);
    e.rate = { ...(e.rate || {}), lvede: 4, lplan: 2 };
    S.employees['sef|karel'].rate = { lvede: 1 };
    const lps = [leadPct(e), leadPct(S.employees["sef|karel"])];
    const mid2 = sharedState(S);
    const log2 = describeChanges(mid, mid2, { at: 2, by: 'x', card: 'a'.repeat(16) }).entries.map(x => x.text);
    S.leadSkills[1].name = 'Plánování výroby'; S.leadSkills[0].desc = 'Porady';
    const log3 = describeChanges(mid2, sharedState(S), { at: 3, by: 'x', card: 'a'.repeat(16) }).entries.map(x => x.text);
    const pctAfter = Object.values(S.employees).filter(x => !isLead(x)).map(x => { const L = levelOf(x); return [x.key, L.pct, L.base]; });
    const sheet = matrixSheets().find(s => s.name === 'Vedoucí');
    /* čištění: kolize id se skupinou, prázdný název, ne-objekty, hodnocení vedoucího přežije */
    const skId = S.positions.find(p => isGroup(p) && groupSkills(p).length).skillset[0].id;
    const dirty = { ...JSON.parse(JSON.stringify(sharedState(S))), leadSkills: [{ id: skId, name: 'Kolize' }, { id: 'lx', name: '  ', desc: 5 }, 'x', null, { id: 'lx', name: 'Dvojí' }] };
    const clean = sanitizeState(dirty);
    const kept = sanitizeState(JSON.parse(JSON.stringify(S)));
    const empty = { none: leadPct(S.employees['sef|karel']) };
    const del = sharedState(S); S.leadSkills.splice(1, 1);
    const log4 = describeChanges(del, sharedState(S), { at: 4, by: 'x', card: 'a'.repeat(16) }).entries.map(x => x.text);
    S.leadSkills = []; empty.after = leadPct(e);
    JSON.stringify({ name: e.last + " " + e.first, key: e.key, pct: lps, log1, log2, log3, log4, empty, same: JSON.stringify(pctBefore) === JSON.stringify(pctAfter),
      cap: JSON.stringify(capacity(null, 3)) === capBefore, sheet: sheet ? sheet.rows.slice(1, 4) : null,
      clean: clean.leadSkills, kept: [kept.leadSkills.length, kept.employees[e.key].rate.lvede, kept.employees['sef|karel'].rate.lvede] })`));
  assert.deepStrictEqual(out.pct, [75, 12.5], 'průměr úrovní × 25 %: (4 + 2) / 2 a (1 + 0) / 2');
  assert.deepStrictEqual(out.log1, ['Dovednosti vedoucích: nová dovednost „Vedení lidí“', 'Dovednosti vedoucích: nová dovednost „Plánování směn“']);
  assert.ok(out.log2.includes(`${out.name}: vedoucí – Vedení lidí 0 → 4`) && out.log2.includes('Šéf Karel: vedoucí – Vedení lidí 0 → 1'), out.log2.join(' | '));
  assert.ok(out.log3.includes('Dovednosti vedoucích: „Plánování směn“ → „Plánování výroby“') && out.log3.includes('Dovednosti vedoucích: upraven popis „Vedení lidí“'), out.log3.join(' | '));
  assert.deepStrictEqual(out.log4, ['Dovednosti vedoucích: smazána dovednost „Plánování výroby“']);
  assert.ok(out.same, 'procenta a tabáky běžných lidí se nezmění');
  assert.ok(out.cap, 'kapacita směn se nezmění');
  assert.deepStrictEqual(out.sheet[0], ['Příjmení', 'Jméno', 'Oddělení', 'Dovednosti %', 'Vedení lidí', 'Plánování výroby']);
  assert.ok(out.sheet.slice(1).some(r => r[0] === 'Šéf' && r[3] === 13 && r[4] === 1 && r[5] === 0), JSON.stringify(out.sheet));
  assert.deepStrictEqual(out.clean, [{ id: 'lx', name: 'Dovednost', desc: '5' }], 'kolize s dovedností skupiny, duplicity a ne-objekty pryč, popis jako text');
  assert.deepStrictEqual(out.kept, [2, 4, 1], 'hodnocení vedoucích přežije uložení');
  assert.deepStrictEqual(out.empty, { none: 12.5, after: null }, 'bez dovedností vedoucích není průměr');
  return null;
});

test('aktualizace 2.9 → 2.10: data zůstanou beze změny, dovednosti vedoucích začnou prázdné', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    Object.values(S.employees)[0].lead = ['Lis'];
    const old = JSON.parse(JSON.stringify(S)); old.v = 10; delete old.leadSkills;
    const neu = sanitizeState(JSON.parse(JSON.stringify(old)));
    const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
    const strip = st => { const x = JSON.parse(JSON.stringify(st)); delete x.v; delete x.leadSkills; return x; };
    JSON.stringify({ same: JSON.stringify(canon(strip(neu))) === JSON.stringify(canon(strip(old))), ls: neu.leadSkills, v: neu.v })`));
  assert.ok(out.same, 'všechna data z verze 2.9 zůstanou beze změny');
  assert.deepStrictEqual([out.ls, out.v], [[], 37]);
  return null;
});

test('varianty prémie (2.11): zaškrtnuté podmínky, vybrané dovednosti s úrovní, kontroly a pracovní morálka', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const id = S.current;
    const p = S.positions.find(x => x.id === 'p_cnc');
    const sk = groupSkills(p).map(x => x.id);
    const other = S.positions.find(x => isGroup(x) && x.id !== 'p_cnc' && groupSkills(x).length);
    const osk = groupSkills(other)[0].id;
    /* čištění: dovednosti jen existující (ne dovednosti vedoucích), úroveň 1–4, bez dvojic */
    S.leadSkills = [{ id: 'lvede', name: 'Vedení lidí', desc: '' }];
    const raw = JSON.parse(JSON.stringify(sharedState(S)));
    raw.positions.find(x => x.id === 'p_cnc').tiers = [
      { id: 'tA', name: 'Základ', minSkill: 0, raise: 10, maxKt: 0, moral: true, skills: [{ id: sk[1], lvl: 3 }, { id: osk, lvl: 9 }, { id: 'nic', lvl: 2 }, { id: 'lvede', lvl: 2 }, { id: sk[1], lvl: 1 }, 'x'] },
      { id: 'tB', name: 'Extra', minSkill: 0, raise: 30, maxKt: 1, moral: true, skills: [{ id: sk[0], lvl: 4 }], streak: null }];
    const clean = sanitizeState(raw);
    const T = clean.positions.find(x => x.id === 'p_cnc').tiers;
    p.tiers = T;
    const e = { key: 'x|y', positionId: 'p_cnc', rate: { [sk[1]]: 3, [osk]: 4, [sk[0]]: 4 } };
    S.employees['x|y'] = e;
    const ev = { pos: p, att: { found: true, absDays: 0, wkDays: 0 }, lost: false };
    const pf = { att: 99, norm: 99, use: 99 };
    const lvl = () => tierOf(e, ev, pf, id, false);
    const res = { skills: T[0].skills, kt: [T[0].maxKt, T[1].maxKt], moral: T.map(t => t.moral) };
    res.all = lvl().lvl;
    const c0 = lvl().list[0].checks;
    res.labels = c0.map(c => c.label);
    /* vybraná dovednost pod úrovní */
    e.rate[sk[1]] = 2; res.lowSkill = [lvl().lvl, lvl().list[0].checks.find(c => c.k === 'skill1').txt]; e.rate[sk[1]] = 3;
    /* kontroly: jedna s nálezem → Extra (nejvýš 1) ano, Základ (0) ne; dvě s nálezem → nic */
    const res1 = (ok) => [{ t: 'a', text: 'Bod', ok, note: '' }];
    const day = id + '-10';
    S.audit.plans['2026-W01'] = { at: 1, by: '', pct: 25, days: [], items: [
      { id: 'k1', key: 'x|y', name: 'Y X', dept: 'CNC', day, state: 'done', done: day, checker: '', results: res1(false), note: '', reason: '', extra: false, at: 1, by: '' },
      { id: 'k2', key: 'x|y', name: 'Y X', dept: 'CNC', day, state: 'done', done: day, checker: '', results: res1(true), note: '', reason: '', extra: false, at: 1, by: '' },
      { id: 'k3', key: 'x|y', name: 'Y X', dept: 'CNC', day: '2000-01-03', state: 'done', done: '2000-01-03', checker: '', results: res1(false), note: '', reason: '', extra: false, at: 1, by: '' }] };
    res.kt1 = [lvl().lvl, lvl().list[0].checks.find(c => c.k === 'kt').txt, JSON.stringify(ktOf('x|y', id))];
    S.audit.plans['2026-W01'].items[1].results = res1(false);
    res.kt2 = lvl().lvl;
    S.audit.plans['2026-W01'].items.forEach(it => { it.results = res1(true); });
    /* pracovní morálka: jedno označení platí pro obě varianty */
    setMark(id, 'x|y', MORAL_ID, 'pozdní příchody');
    const m = lvl();
    res.moral1 = [m.lvl, m.list.map(x => x.checks.find(c => c.id === MORAL_ID).txt)];
    const kept = sanitizeState(JSON.parse(JSON.stringify(S))).marks[id]['x|y'];
    setMark(id, 'x|y', MORAL_ID, null);
    res.moral0 = lvl().lvl;
    res.kept = kept;
    res.conds = tierConds(T[0]);
    /* smazaná dovednost zmizí z variant */
    dropTierSkills(new Set([osk]));
    res.dropped = T[0].skills.map(r => r.id === sk[1]);
    /* historie změn */
    const before = sharedState(S);
    T[1].skills.push({ id: sk[2], lvl: 2 }); T[1].maxKt = null; T[1].moral = false;
    res.log = describeChanges(before, sharedState(S), { at: 1, by: 'x', card: 'a'.repeat(16) }).entries.map(x => x.text);
    JSON.stringify({ ...res, sk, osk, oname: other.name, names: groupSkills(p).map(x => x.name), oskName: groupSkills(other)[0].name })`));
  assert.deepStrictEqual(out.skills, [{ id: out.sk[1], lvl: 3 }, { id: out.osk, lvl: 4 }], 'neexistující, dovednost vedoucích, dvojice a ne-objekty pryč; úroveň nejvýš 4');
  assert.deepStrictEqual([out.kt, out.moral], [[0, 1], [true, true]]);
  assert.strictEqual(out.all, 2, 'splní vše → nejvyšší varianta');
  assert.deepStrictEqual(out.labels, [`${out.names[1]} aspoň na úrovni 3`, `${out.oskName} (${out.oname}) aspoň na úrovni 4`, 'bezproblémové kontroly (žádný nález)', 'Dodržování řádné pracovní morálky']);
  assert.deepStrictEqual(out.lowSkill, [2, 'úroveň 2'], 'Základ nesplněn (dovednost na 2), Extra nevyžaduje');
  assert.deepStrictEqual(out.kt1, [2, '2 kontroly, s nálezem 1', '{"n":2,"bad":1}'], 'kontrola z jiného měsíce se nepočítá');
  assert.strictEqual(out.kt2, 0, 'dvě kontroly s nálezem: ani Extra (nejvýš 1)');
  assert.deepStrictEqual(out.moral1, [0, ['nesplněno – pozdní příchody', 'nesplněno – pozdní příchody']], 'morálka označená jednou platí pro obě varianty');
  assert.deepStrictEqual(out.kept, { moral: 'pozdní příchody' }, 'označení morálky přežije uložení');
  assert.strictEqual(out.moral0, 2);
  assert.ok(out.conds.includes('bezproblémové kontroly (žádný nález)') && out.conds.includes('Dodržování řádné pracovní morálky') && out.conds.includes(`${out.names[1]} aspoň 3`), out.conds.join(', '));
  assert.deepStrictEqual(out.dropped, [true], 'smazaná dovednost zmizí z variant');
  assert.strictEqual(out.log.length, 1);
  assert.ok(/^Skupina CNC: varianta prémie „Extra“ \(.*≥ 2.*\)/.test(out.log[0]) && !/kontroly/.test(out.log[0]) && !/morálka/.test(out.log[0]), out.log[0]);
  return null;
});

test('aktualizace 2.10 → 2.11: pracovní morálka jako podmínka, označení se převede, ostatní data beze změny', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const p = S.positions.find(x => x.id === 'p_cnc');
    const id = S.current;
    /* tvar dat 2.10: morálka jako bod vedoucího v každé variantě, vlastní bod zůstane */
    const old = JSON.parse(JSON.stringify(S)); old.v = 11;
    old.positions.forEach(g => (g.tiers || []).forEach(t => { delete t.moral; delete t.maxKt; delete t.skills; }));
    const op = old.positions.find(x => x.id === 'p_cnc');
    op.tiers[0].manual = [{ id: 'm1', text: 'Dodržování řádné pracovní morálky' }, { id: 'm2', text: 'Úklid pracoviště' }];
    op.tiers[1].manual = [{ id: 'm3', text: 'Dodržování řádné pracovní morálky' }];
    old.marks = { [id]: { 'dvorak|petr': { m3: 'hádka s mistrem', m2: 'nepořádek' }, 'novak|martin': { m1: '' } } };
    const neu = sanitizeState(JSON.parse(JSON.stringify(old)));
    const np = neu.positions.find(x => x.id === 'p_cnc');
    const strip = st => { const x = JSON.parse(JSON.stringify(st)); delete x.v; delete x.marks;
      x.positions.forEach(g => (g.tiers || []).forEach(t => { delete t.moral; delete t.maxKt; delete t.skills; t.manual = (t.manual || []).filter(m => !/morálky/.test(m.text)); })); return x; };
    const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
    /* znovu uložená data (verze 12) se už nepřevádějí */
    const again = sanitizeState(JSON.parse(JSON.stringify(neu)));
    const fresh = JSON.parse(JSON.stringify(neu)); fresh.positions.find(x => x.id === 'p_cnc').tiers[0].manual.push({ id: 'm9', text: 'Pracovní morálka' });
    const custom = sanitizeState(fresh).positions.find(x => x.id === 'p_cnc').tiers[0].manual.map(m => m.text);
    JSON.stringify({ v: neu.v, same: JSON.stringify(canon(strip(neu))) === JSON.stringify(canon(strip(old))),
      tiers: np.tiers.map(t => [t.moral, t.maxKt, t.skills, t.manual.map(m => m.text)]), marks: neu.marks[id],
      again: JSON.stringify(again.marks) === JSON.stringify(neu.marks) && JSON.stringify(again.positions) === JSON.stringify(neu.positions), custom })`));
  assert.strictEqual(out.v, 37);
  assert.ok(out.same, 'ostatní data z verze 2.10 zůstanou beze změny');
  assert.deepStrictEqual(out.tiers, [[true, null, [], ['Úklid pracoviště']], [true, null, [], []]], 'morálka je podmínka, vlastní bod zůstal, nové podmínky vypnuté');
  assert.deepStrictEqual(out.marks, { 'dvorak|petr': { moral: 'hádka s mistrem', m2: 'nepořádek' }, 'novak|martin': { moral: '' } }, 'označení morálky se převedlo i s důvodem');
  assert.ok(out.again, 'opakované načtení nic nemění');
  assert.deepStrictEqual(out.custom, ['Úklid pracoviště', 'Pracovní morálka'], 'v nových datech zůstane bod s textem morálky bodem');
  return null;
});

test('srážky ze mzdy za neproduktivitu (2.12): pásma plnění normy, upozornění, zpracování a historie', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const id = S.current;
    const raw = JSON.parse(JSON.stringify(sharedState(S)));
    raw.positions.find(x => x.id === 'p_cnc').normCut = { from: id, rows: [{ max: 60, pct: 25 }, { max: 50, pct: 50 }, { max: 50, pct: 10 }, { max: 'x', pct: 5 }, { max: 400, pct: 300 }, { max: 70, pct: 0 }, 7] };
    raw.positions.find(x => x.id !== 'p_cnc').normCut = { from: 'zítra', rows: [] };
    const clean = sanitizeState(raw);
    const p = clean.positions.find(x => x.id === 'p_cnc');
    const res = { rule: p.normCut, empty: 'normCut' in clean.positions.find(x => x.id !== 'p_cnc') };
    /* pásma: do X % včetně, platí nejnižší */
    res.bands = [0, 49.9, 50, 50.1, 60, 60.1, null].map(v => { const b = normCutBand(p.normCut, v); return b ? b.pct : 0; });
    S.positions.find(x => x.id === 'p_cnc').normCut = { from: id, rows: [{ max: 50, pct: 50 }, { max: 60, pct: 25 }, { max: 90, pct: 10 }] };
    const novak = S.employees['novak|martin'], dvorak = S.employees['dvorak|petr'];
    const rowOf = k => allRows().find(r => r.e.key === k).ncut;
    res.novak = [rowOf('novak|martin').norm, rowOf('novak|martin').pct, rowOf('dvorak|petr').pct, rowOf('svobodova|jana')];
    /* upozornění: až od týdne před koncem měsíce, spolu s ruční srážkou ze mzdy */
    const end = isoOf(Date.UTC(+id.slice(0, 4), +id.slice(5, 7), 0));
    res.early = normCutPending(addDays(end, -8)).length;
    S.sanctions.push({ id: 'xw', key: 'svobodova|jana', period: id, name: 'Zmetky', pct: 10, wage: true, note: '', at: 1 });
    res.all = wageAllPending(addDays(end, -7)).map(x => [x.kind, x.key, x.pct]);
    /* platí od pozdějšího měsíce: nic */
    S.positions.find(x => x.id === 'p_cnc').normCut.from = '2099-01';
    res.later = [normCutPending(addDays(end, 1)).length, rowOf('novak|martin')];
    S.positions.find(x => x.id === 'p_cnc').normCut.from = id;
    /* vyřazený a vedoucí bez srážky */
    novak.excluded = true; res.excluded = normCutOf(novak, id); delete novak.excluded;
    /* zpracování: snímek přežije uložení a nepřepočítá se */
    const before = sharedState(S);
    setNormCutDone(id, 'novak|martin', { pct: 10, norm: 84.9 }, { at: 5, by: 'Vedoucí' });
    const log1 = describeChanges(before, sharedState(S), { at: 1, by: 'x', card: 'a'.repeat(16) }).entries.map(x => x.text);
    S.positions.find(x => x.id === 'p_cnc').normCut.rows[2].pct = 30;
    const kept = sanitizeState(JSON.parse(JSON.stringify(sharedState(S))));
    res.done = [rowOf('novak|martin').pct, normCutPending(addDays(end, 1)).length, kept.normCutDone[id]['novak|martin']];
    const mid = sharedState(S);
    setNormCutDone(id, 'novak|martin', null);
    res.undone = [rowOf('novak|martin').pct, JSON.stringify(S.normCutDone)];
    const log2 = describeChanges(mid, sharedState(S), { at: 2, by: 'x', card: 'a'.repeat(16) }).entries.map(x => x.text);
    /* historie: změna pásem skupiny */
    const b2 = sharedState(S); delete S.positions.find(x => x.id === 'p_cnc').normCut;
    const log3 = describeChanges(b2, sharedState(S), { at: 3, by: 'x', card: 'a'.repeat(16) }).entries.map(x => x.text);
    /* jiný měsíc: srážka se počítá z evidence práce toho měsíce */
    S.positions.find(x => x.id === 'p_cnc').normCut = { from: '', rows: [{ max: 90, pct: 10 }] };
    res.other = normCutOf(novak, '2000-01');
    res.rules = rosterSheets().rules.filter(r => /neproduktivitu/.test(r[1])).map(r => r.join(' | '));
    res.pdf = rulesDoc().groups.find(g => g.name === 'CNC').rules.filter(t => /neproduktivitu/.test(t));
    JSON.stringify({ ...res, log1, log2, log3 })`));
  assert.deepStrictEqual(out.rule, { from: out.rule.from, rows: [{ max: 50, pct: 50 }, { max: 60, pct: 25 }, { max: 300, pct: 100 }] }, 'vzestupně, bez dvojic a neplatných řádků, omezené hodnoty');
  assert.strictEqual(out.empty, false, 'bez pásem srážky nejsou');
  assert.deepStrictEqual(out.bands, [50, 50, 50, 25, 25, 100, 0], 'do 50 % včetně = 50 %, nad 50 do 60 % = 25 %, bez údaje nic');
  assert.deepStrictEqual(out.novak, [84.9, 10, 0, null], 'Novák 84,9 % → 10 %, Dvořák nad 90 % nic, jiná skupina bez pravidla');
  assert.strictEqual(out.early, 0, 'upozornění až týden před koncem měsíce');
  assert.deepStrictEqual(out.all, [['norm', 'novak|martin', 10], ['san', 'svobodova|jana', 10]], 'ruční i automatické srážky ze mzdy podle jména');
  assert.deepStrictEqual(out.later, [0, null], 'pravidlo platí až od nastaveného měsíce');
  assert.strictEqual(out.excluded, null);
  assert.deepStrictEqual(out.done, [10, 0, { pct: 10, norm: 84.9, at: 5, by: 'Vedoucí' }], 'zpracovaná srážka drží snímek a zmizí z upozornění');
  assert.deepStrictEqual(out.undone, [30, '{}'], 'po zrušení se zase počítá podle pásem');
  assert.deepStrictEqual(out.log1, ['Srážka ze mzdy za neproduktivitu zpracována: Novák Martin – plnění normy 84,9 %, srážka 10 % ze mzdy (září 2026)']);
  assert.deepStrictEqual(out.log2, ['Zrušeno zpracování srážky ze mzdy za neproduktivitu: Novák Martin – plnění normy 84,9 %, srážka 10 % ze mzdy (září 2026)']);
  assert.ok(out.log3.length === 1 && /^Skupina CNC, srážky ze mzdy za neproduktivitu: do 50 % → 50 %, nad 50 do 60 % → 25 %, nad 60 do 90 % → 30 % \(od září 2026\) → vypnuto$/.test(out.log3[0]), out.log3.join(' | '));
  assert.deepStrictEqual(out.other, { rule: { from: '', rows: [{ max: 90, pct: 10 }] }, norm: null, band: null, pct: 0, done: null }, 'měsíc bez evidence práce: bez srážky');
  assert.deepStrictEqual(out.rules, ['CNC | srážka ze mzdy za neproduktivitu | 90 | −10 % mzdy | plnění normy do 90 %']);
  assert.deepStrictEqual(out.pdf, ['Srážka ze mzdy za neproduktivitu (plnění normy): do 90 % → 10 %. Benefity nekrátí.']);
  return null;
});

test('aktualizace 2.11 → 2.12: data zůstanou beze změny, srážky za neproduktivitu vypnuté', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const old = JSON.parse(JSON.stringify(S)); old.v = 12; delete old.normCutDone;
    const neu = sanitizeState(JSON.parse(JSON.stringify(old)));
    const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
    const strip = st => { const x = JSON.parse(JSON.stringify(st)); delete x.v; delete x.normCutDone; return x; };
    JSON.stringify({ same: JSON.stringify(canon(strip(neu))) === JSON.stringify(canon(strip(old))), done: neu.normCutDone, rules: neu.positions.filter(p => p.normCut).length, v: neu.v,
      pending: (S = neu, wageAllPending('2099-01-01').filter(x => x.kind === 'norm').length) })`));
  assert.ok(out.same, 'všechna data z verze 2.11 zůstanou beze změny');
  assert.deepStrictEqual([out.done, out.rules, out.v, out.pending], [{}, 0, 37, 0]);
  return null;
});

test('skener kartičky (2.13): kód z čárového nebo QR kódu → člověk podle ID v evidenci práce', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    S.employees['novak|martin'].wid = '4711';
    S.employees['dvorak|petr'].wid = 'A-17';
    JSON.stringify(['4711', ' 004711 ', 'ID:4711;Novák Martin', 'a-17', 'A17', 'ZAM A-17', '5555', '', null].map(x => keyByScan(x)))`));
  assert.deepStrictEqual(out, ['novak|martin', 'novak|martin', 'novak|martin', 'dvorak|petr', null, 'dvorak|petr', null, null, null],
    'celý kód, nuly na začátku, část QR textu, velikost písmen; jiné ID ani prázdný kód nikoho nenajde');
  return null;
});

test('plánovaná obsazenost dne (2.15): střídání skupin, víkend a svátek, nemoc, kapacita, rizika a kontroly', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const g = S.positions.find(p => isGroup(p) && groupSkills(p).length >= 2);
    const [s0, s1] = groupSkills(g);
    g.plan = { v: 100, unit: 'ks' };
    const base = S.employees[Object.keys(S.employees)[0]];
    const mk = (key, shift, extra) => Object.assign(JSON.parse(JSON.stringify(base)), { key, last: key, first: '', positionId: g.id, shift, rate: {}, excluded: false }, extra || {});
    for (const k of Object.keys(S.employees)) delete S.employees[k];
    [mk('A', 'R', { rate: { [s0.id]: 4 } }), mk('B', 'O', { rate: { [s0.id]: 3 } }), mk('C', 'S1', { rate: { [s0.id]: 3 } }), mk('D', 'S2'),
     mk('E', 'S1', { sick: '2026-10-01' }), mk('F', ''), mk('G', 'R', { lead: [deptOf(g)] }), mk('H', 'R', { excluded: true })]
      .forEach(e => { if (!e.sick) delete e.sick; if (!e.lead) delete e.lead; S.employees[e.key] = e; });
    S.capReport = Object.assign(blankCapReport(), { s1am: '2026-W41', thr: 3 });
    S.audit = blankAudit();
    S.audit.plans['2026-W42'] = { items: [
      { id: 'i1', key: 'A', dept: deptOf(g), day: '2026-10-12', state: 'plan', results: [] },
      { id: 'i2', key: 'B', dept: deptOf(g), day: '2026-10-12', state: 'done', done: '2026-10-12', results: [] },
      { id: 'i3', key: 'C', dept: deptOf(g), day: '2026-10-13', state: 'plan', results: [] }] };
    const names = list => list.map(e => e.key).sort().join('');
    const pick = d => { const r = d.depts.find(x => x.dept === deptOf(g)); return { day: d.day, today: d.today, mg: d.mg, total: d.total,
      am: names(r.am), pm: names(r.pm), rot: names(r.rot), none: names(r.none), sick: names(r.sick), plan: r.plan,
      risks: r.risks.filter(x => x.skill === s0.name || x.skill === s1.name).map(x => x.slot + ':' + (x.skill === s0.name ? 's0' : 's1') + ':' + x.n).sort(),
      checks: [d.checks.open, d.checks.done, d.checks.list.map(c => c.slot).join(',')] }; };
    const mon = pick(staffDay('2026-10-12'));
    const sun = pick(staffDay('2026-10-11'));
    const hol = staffDay('2026-10-28');
    S.capReport.s1am = '';
    const norot = pick(staffDay('2026-10-12'));
    JSON.stringify({ mon, sun: [sun.day, sun.today], hol: [hol.day, hol.today], norot: [norot.total, norot.rot, norot.plan] })`));
  assert.deepStrictEqual(out.mon.total, { am: 2, pm: 2, rot: 0, none: 1, sick: 1 }, 'v T42 má ranní skupina 2 (T41 skupina 1); nemocný, vedoucí a vyřazený se nepočítají');
  assert.deepStrictEqual([out.mon.am, out.mon.pm, out.mon.none, out.mon.sick, out.mon.mg, out.mon.day, out.mon.today], ['AD', 'BC', 'F', 'E', 'S2', '2026-10-12', true]);
  assert.deepStrictEqual(out.mon.plan, { am: { ks: 200, h: 0 }, pm: { ks: 200, h: 0 } }, 'kapacita 100 ks na osobu × lidé skupiny na směně');
  assert.deepStrictEqual(out.mon.risks, ['am:s0:1', 'am:s1:0', 'pm:s1:0'], 'dovednost na ranní umí jen jeden; druhou nikdo');
  assert.deepStrictEqual(out.mon.checks, [1, 1, 'am,pm'], 'kontroly na ten den: jedna naplánovaná, jedna hotová');
  assert.deepStrictEqual(out.sun, ['2026-10-12', false], 'v neděli se ukáže pondělí');
  assert.deepStrictEqual(out.hol, ['2026-10-29', false], 've svátek (28. 10.) další pracovní den');
  assert.deepStrictEqual(out.norot, [{ am: 1, pm: 1, rot: 2, none: 1, sick: 1 }, 'CD', { am: { ks: 100, h: 0 }, pm: { ks: 100, h: 0 } }],
    'bez nastaveného střídání jsou skupiny 1 a 2 zvlášť a do kapacity směny se nepočítají');
  return null;
});

test('Protokoly (2.16): intervaly úkonů, víkend a svátek, posun termínu, řádky směn, rozsah tisku', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const ev = (k, x) => Object.assign({ k, n: 1, dow: 1, day: 1, month: 1 }, x || {});
    const book = cleanLogbooks([{ name: 'Lis', inv: 'L-01', shifts: 2, from: '2026-01-05', steps: [
      { name: 'Vizuální kontrola', every: ev('shift') }, { name: 'Mazání vedení', every: ev('day') }, { name: 'Filtr', every: ev('week', { dow: 1 }) },
      { name: 'Hladina oleje', every: ev('weeks', { n: 2, dow: 3 }) }, { name: 'Řemeny', every: ev('month', { day: 0 }) },
      { name: 'Hydraulika', every: ev('months', { n: 3, day: 15 }) }, { name: 'Revize', every: ev('year', { month: 10, day: 28 }) },
      { name: 'Chlazení', every: ev('ndays', { n: 10 }) }, { name: 'Výměna oleje', every: ev('hours', { n: 250 }) }, { name: 'Čištění', every: ev('need') }] }])[0];
    const due = book.steps.map(s => [...lbDue(book, s, '2026-10-01', '2026-10-31')].sort().map(d => +d.slice(8)));
    const plan = lbPlan(book, '2026-10-28', '2026-10-29');
    const oct12 = lbPlan(book, '2026-10-12', '2026-10-12')[0];
    const sat = lbPlan(book, '2026-10-03', '2026-10-03')[0];
    const wk = Object.assign({}, book, { weekend: true });
    const satW = lbPlan(wk, '2026-10-03', '2026-10-03')[0];
    const nov = [...lbDue(wk, book.steps[7], '2026-11-01', '2026-11-01')];
    const dirty = cleanLogbooks([{ shifts: 9, photo: 'x', steps: [{ every: { k: 'nesmysl' }, photos: ['a'.repeat(32), 'b'.repeat(32), 'c'.repeat(32), 'd'.repeat(32), '../x'] }] }])[0];
    const log = [];
    const add = (kind, text, x) => log.push(text || (x.p + x.v0 + ' → ' + x.v1));
    lbChanges([], [book], add);
    const b2 = JSON.parse(JSON.stringify(book)); b2.steps[2].every.dow = 5; b2.steps.splice(9, 1);
    lbChanges([book], [b2], add);
    lbChanges([b2], [], add);
    const log2 = [];
    const b3 = JSON.parse(JSON.stringify(book)); b3.shifts = 3; b3.photo = 'a'.repeat(32); b3.steps[0].photos = ['b'.repeat(32)];
    [b3.steps[1], b3.steps[2]] = [b3.steps[2], b3.steps[1]];
    lbChanges([book], [b3], (kind, text, x) => log2.push([text, x.m.split(':')[0]]));
    JSON.stringify({ due, plan: plan.map(d => [d.iso, d.work, d.hol, lbRowSteps(d, 0).join(), lbRowSteps(d, 1).join()]),
      oct12: [lbRowSteps(oct12, 0).join(), lbRowSteps(oct12, 1).join()], sat: [sat.work, sat.weekend, sat.day.length], satW: [satW.work, lbRowSteps(satW, 0).join()], nov,
      range: [lbRange('year', 2027), lbRange('custom', 0, '2026-10-12', '2029-10-12'), lbRange('custom', 0, '2026-10-12', '2026-10-01'), lbRange('year', 'x')],
      dirty: [dirty.shifts, dirty.photo, dirty.steps[0].every.k, dirty.steps[0].photos.length], files: lbFileIds({ logbooks: [dirty] }).length,
      every: book.steps.map(s => lbEveryText(s.every)), log, log2, blankHas: Array.isArray(blank().logbooks), v: DATA_VERSION })`));
  assert.deepStrictEqual(out.due[2], [5, 12, 19, 26], 'týdně v pondělí');
  assert.deepStrictEqual(out.due[3], [14, 29], 'každý 2. týden ve středu od týdne „platí od“; 28. 10. je svátek → čtvrtek 29.');
  assert.deepStrictEqual([out.due[4], out.due[5], out.due[6]], [[1], [15], [29]], 'první pracovní den měsíce, čtvrtletně 15., ročně 28. 10. posunuto na 29. 10.');
  assert.deepStrictEqual(out.due[7], [2, 12, 22], 'každých 10 dní od 5. 1. 2026');
  assert.deepStrictEqual([out.due[0].length, out.due[1].length, out.due[8].length, out.due[9].length], [21, 21, 0, 0], '21 pracovních dní v říjnu 2026; motohodiny a podle potřeby bez termínu');
  assert.deepStrictEqual(out.plan, [['2026-10-28', false, 'Vznik ČSR', '', ''], ['2026-10-29', true, '', '1,2,4,7', '1']], 've svátek nic, druhý řádek dne jen úkony každou směnu');
  assert.deepStrictEqual(out.oct12, ['1,2,3,8', '1']);
  assert.deepStrictEqual([out.sat, out.satW, out.nov], [[false, true, 0], [true, '1,2'], ['2026-11-01']], 'víkend jen s provozem o víkendu');
  assert.deepStrictEqual(out.range, [{ from: '2027-01-01', to: '2027-12-31' }, { from: '2026-10-12', to: '2028-10-11', cut: true }, null, null], 'rok, vlastní nejvýš 731 dní, chybný rozsah');
  assert.deepStrictEqual([out.dirty, out.files], [[3, '', 'day', 3], 3], 'čištění: max. 3 záznamy za den a 3 fotky, neplatné id fotky pryč');
  assert.deepStrictEqual(out.every.slice(2, 8), ['Týdně (pondělí)', 'Každý 2. týden (středa)', 'Měsíčně (1. pracovní den)', 'Čtvrtletně (15. den v měsíci)', 'Ročně (říjen, 28. den v měsíci)', 'Každých 10 dní']);
  assert.deepStrictEqual(out.log, ['Protokoly: nový deník Lis (L-01)', 'Protokoly – Lis (L-01), úkon „Filtr“: Týdně (pondělí) → Týdně (pátek)',
    'Protokoly – Lis (L-01): odebrán úkon „Čištění“', 'Protokoly: smazán deník Lis (L-01)']);
  assert.deepStrictEqual(out.log2, [['Protokoly – Lis (L-01): upravené údaje – záznamů za den, fotka stroje', 'lbf'],
    ['Protokoly – Lis (L-01): fotky úkonu „Vizuální kontrola“ (1)', 'lbp'], ['Protokoly – Lis (L-01): změněno pořadí úkonů', 'lbo']], 'údaje stroje, fotky a pořadí úkonů');
  assert.ok(out.blankHas && out.v === 37, 'nová data mají prázdné Protokoly, verze dat 37');
  return null;
});

test('aktualizace 2.15 → 2.16: data zůstanou beze změny, Protokoly začnou prázdné', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    const old = sanitizeState(demoData()); delete old.logbooks; old.v = 13;
    const before = JSON.stringify(Object.assign({}, old, { v: 0 }));
    const now = sanitizeState(JSON.parse(JSON.stringify(old)));
    const keep = JSON.parse(JSON.stringify(now)); delete keep.logbooks;
    JSON.stringify({ same: JSON.stringify(Object.assign({}, keep, { v: 0 })) === before, books: now.logbooks, v: now.v })`));
  assert.deepStrictEqual(out, { same: true, books: [], v: 37 });
  return null;
});

test('Audit (2.17): čtení obsazenosti a výkazu podle písmen sloupců, víkendy a svátky, úpravy, souhrny a historie', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const wa = S.workAudit;
    wa.target = null;   // požadavek podle plánu ze souboru (výchozí od 2.18.1 je pevných 100)
    const L = letter => waIndex(letter);
    // Obsazenost: řádek na den, D datum, ranní I K L M N O P R S T, odpolední U V W X Y Z AA.
    const row = (date, v) => { const r = []; Object.entries(v).forEach(([k, x]) => { r[L(k)] = x; }); r[L('D')] = date; return r; };
    const att = [{ name: 'Obsazenost', aoa: [
      ['', '', '', 'Datum', '', '', '', '', 'Plán', '', 'Brus'],
      row('1.10.2026', { I: 30, K: 6, L: 4, M: 5, N: 3, O: 4, P: 2, R: 3, S: 2, T: 26, U: 20, V: 18, W: 4, X: 5, Y: 3, Z: 2, AA: 4 }),
      row('2.10.2026', { I: 30, K: 6, L: 4, M: 5, N: 3, O: 4, P: 2, R: 2, S: 2, T: 27, U: 20, V: 19, W: 4, X: 5, Y: 4, Z: 2, AA: 4 }),
      row('3.10.2026', { I: 0, T: 4, K: 4 }),
      row('4.10.2026', {}),
      row(46303, { I: 30, T: 25, K: 6 }),
      ['součet', null, null, null]
    ] }];
    const pa = waParseAttendance(att, wa.cols.att, wa.groups);
    // Výkaz práce: A datum, H operace, J kusy.
    const w = (date, op, ks) => { const r = []; r[0] = date; r[7] = op; r[9] = ks; return r; };
    const work = [{ name: 'Výkaz', aoa: [
      ['Datum', '', '', '', '', '', '', 'Operace', '', 'Kusy'],
      w('2026-10-01', 'Pískování - hala 2', 300), w('2026-10-01', 'Pískování - hala 2', 20), w('2026-10-01', 'Broušení ručně', 500),
      w('2026-10-01', 'Kontrola výstupní', 100), w('2026-10-01', 'Údržba', 7), w('2026-10-02', 'Broušení ručně', 450),
      w('2026-10-03', 'Broušení ručně', 80), w('nesmysl', 'Broušení ručně', 5), w('2026-10-02', '', 9)
    ] }];
    const pw = waParseWork(work, wa.cols.work);
    waApplyAttendance(wa, pa, { name: 'obsazenost.xlsx', by: 'Vedoucí' });
    const ap = waApplyWork(wa, pw, { name: 'vykaz.xlsx', by: 'Vedoucí' });
    const op = name => wa.ops.find(x => x.name === name);
    // Nová operace přijde bez skupiny a nezapočítá se (2.17.1); skupiny přiřadí uživatel (tady podle návrhu z názvu).
    const fresh = { groups: wa.ops.map(x => x.group), pcs: waDay(wa, '2026-10-01').pcsTotal, noGroup: waDay(wa, '2026-10-01').noGroup };
    wa.ops.forEach(x => { x.group = waGuessGroup(x.name, wa.groups); });
    op('Údržba').on = false;                       // operace se nezapočítává
    const d1 = waDay(wa, '2026-10-01');
    // Úprava s důvodem a návrat zpět.
    const before = JSON.parse(JSON.stringify(wa));
    waSetEdit(wa, '2026-10-01', 'g.brus.am', 7, 'Chyběl záznam brigádníka', 'Vedoucí', 1);
    waSetEdit(wa, '2026-10-02', 'pcs.' + op('Broušení ručně').id, 470, 'Oprava ze směnového hlášení', 'Vedoucí', 2);
    const after = JSON.parse(JSON.stringify(wa));
    const log = [];
    waChanges(before, after, (kind, text, x) => log.push(text || (x.p + x.v0 + ' → ' + x.v1)));
    const e1 = waDay(wa, '2026-10-01');
    waSetEdit(wa, '2026-10-01', 'g.brus.am', undefined);
    const reverted = waDay(wa, '2026-10-01').g.brus.am;
    waSetEdit(wa, '2026-10-01', 'g.brus.am', 7, 'Chyběl záznam brigádníka', 'Vedoucí', 1);
    const days = waDays(wa, '2026-10-01', '2026-10-31');
    const t = waTotals(wa, days);
    const weeks = waWeeks(wa, days);
    const issues = waIssues(wa, days);
    const hr = waHistRange(wa, 0);
    const sheets = waSheets(wa, hr);
    const gsheets = waSheets(wa, hr, 'brus');
    const sheet = name => sheets.find(x => x.name === name).rows;
    // Nastavení skupin a operací do historie.
    const b2 = JSON.parse(JSON.stringify(wa));
    b2.groups.find(g => g.id === 'kont').unprod = false;
    b2.ops.find(x => x.name === 'Kontrola výstupní').group = '';
    const log2 = [];
    waChanges(wa, b2, (kind, text, x) => log2.push(text || (x.p + x.v0 + ' → ' + x.v1)));
    // Čištění a zpětná kompatibilita.
    const dirty = cleanWorkAudit({ groups: [{ id: 'x y' }, { id: 'ok', name: 'OK', am: 'zz', pm: '1' }], ops: [{ id: 'o1', name: 'A', group: 'nic' }, { id: 'bad' }],
      days: { '2026-10-01': { am: { plan: -5, total: 'x' }, g: { ok: [1e9, 2] } }, nesmysl: {} }, edits: { '2026-10-01': { 'am.total': { v: 3 }, '<script>': { v: 1 } } } });
    JSON.stringify({
      pa: { rows: pa.rows, skipped: pa.skipped, from: pa.from, to: pa.to, d1: pa.days['2026-10-01'], sun: pa.days['2026-10-04'] || null, serial: Object.keys(pa.days).includes('2026-10-08') },
      pw: { rows: pw.rows, skipped: pw.skipped, ops: pw.ops },
      ops: wa.ops.map(x => [x.name, x.group, x.on]), added: ap.added.length,
      d1: { people: d1.people, plan: d1.plan, fill: Math.round(d1.fill * 1000) / 1000, pcs: d1.pcsTotal, groupPcs: d1.groupPcs, noGroup: d1.noGroup,
        prodPeople: d1.prodPeople, unprod: d1.unprodPeople, noIs: d1.noIsPeople, perProd: Math.round(d1.perProd * 100) / 100, check: d1.check, work: d1.day.work },
      e1: [e1.g.brus.am, e1.edited, wa.edits['2026-10-01']['g.brus.am'].was], reverted,
      days: days.map(d => [d.iso, d.day.work, d.day.hol || '', d.hasAtt]).filter(d => d[0] <= '2026-10-07' || d[0] === '2026-10-28'),
      t: { workDays: t.workDays, offDays: t.offDays, offWorked: t.offWorked, missingAtt: t.missingAtt, shifts: t.shifts, pcs: t.pcs, edits: t.edits,
        perShift: Math.round(t.perShift * 100) / 100, brus: t.group.brus, kont: t.group.kont.per },
      weeks: weeks.slice(0, 2).map(w => [w.label, w.t.shifts, w.t.pcs]),
      issues: { att: issues.missingAtt.length, work: issues.missingWork.length, mismatch: issues.mismatch, off: issues.offWorked, noGroup: issues.noGroup.map(x => x.name), skip: issues.off.map(x => [x.name, x.ks]) },
      fresh, hr, hr3: waHistRange(wa, 3), sheets: sheets.map(x => [x.name, x.rows.length]), weeksRows: sheet('Týdny'), vypadky: sheet('Výpadky'), souhrn: sheet('Souhrn').slice(4, 12),
      staff: waStaffing(wa, waDays(wa, '2026-10-01', '2026-10-31')), tReq: [t.reqDays, t.metDays, t.balance, Math.round(t.avgReq * 100) / 100],
      avg: [t.avgPeople, t.avgPlan],
      skupiny: sheets.find(x => x.name === 'Skupiny').rows.slice(0, 2), gsheets: gsheets.map(x => [x.name, x.rows.length]), gweeks: gsheets.find(x => x.name === 'Týdny').rows,
      gsouhrn: gsheets[0].rows.slice(0, 3), fx: waFx(t, 'brus'), fxAll: waFx(t, ''),
      log, log2, dirty: [dirty.groups.map(g => [g.id, g.am, g.pm]), dirty.ops.map(x => [x.id, x.group]), dirty.days['2026-10-01'], Object.keys(dirty.days), Object.keys(dirty.edits['2026-10-01'])],
      v: DATA_VERSION, blank: !!blank().workAudit.groups.length })`));
  assert.deepStrictEqual([out.pa.rows, out.pa.skipped, out.pa.from, out.pa.to], [4, 1, '2026-10-01', '2026-10-08'], 'prázdný den a řádek bez data se přeskočí, sériové číslo Excelu je datum');
  assert.deepStrictEqual(out.pa.d1, { am: { plan: 30, total: 26, abs: 3 }, pm: { plan: 20, total: 18 },
    g: { brus: [6, 5], brush: [4, 3], frez: [5, 4], lep: [3, null], kont: [4, 4], tryska: [2, 2], daiho: [2, null] } });
  assert.ok(out.pa.serial);
  assert.deepStrictEqual([out.pw.rows, out.pw.skipped], [7, 2]);
  assert.deepStrictEqual(out.pw.ops, { 'Pískování - hala 2': 320, 'Broušení ručně': 1030, 'Kontrola výstupní': 100, 'Údržba': 7 });
  assert.deepStrictEqual(out.ops, [['Broušení ručně', 'brus', true], ['Kontrola výstupní', 'kont', true], ['Pískování - hala 2', 'tryska', true], ['Údržba', '', false]], 'odhad skupiny podle názvu operace');
  assert.deepStrictEqual(out.d1, { people: 44, plan: 50, fill: 0.88, pcs: 920, groupPcs: { brus: 500, kont: 100, tryska: 320 }, noGroup: null,
    prodPeople: 34, unprod: 8, noIs: 2, perProd: 24.12, check: { am: 0, pm: 0 }, work: true });
  assert.deepStrictEqual(out.e1, [7, ['g.brus.am'], 6], 'úprava platí, původní hodnota zůstane');
  assert.strictEqual(out.reverted, 6, 'zrušená úprava vrátí hodnotu ze souboru');
  assert.deepStrictEqual(out.days, [['2026-10-01', true, '', true], ['2026-10-02', true, '', true], ['2026-10-03', false, '', true], ['2026-10-05', true, '', false],
    ['2026-10-06', true, '', false], ['2026-10-07', true, '', false], ['2026-10-28', false, 'Vznik ČSR', false]], 'víkend bez dat chybí, svátek a pracovní dny bez dat jsou vidět');
  assert.deepStrictEqual([out.t.workDays, out.t.offDays, out.t.offWorked, out.t.missingAtt, out.t.shifts, out.t.pcs, out.t.edits], [21, 2, 1, 18, 119, 1470, 2]);
  assert.deepStrictEqual(out.t.brus, { shifts: 33, am: 23, pm: 10, pcs: 1050, work: 29, per: 1050 / 33, avg: 29 / 3, share: 29 / 115 }, 'průměr a podíl skupiny jen z pracovních dnů s obsazeností');
  assert.strictEqual(out.t.kont, null, 'neproduktivní skupina nemá kusy na osobosměnu');
  assert.deepStrictEqual(out.weeks, [['T40/2026', 94, 1470], ['T41/2026', 25, null]]);
  assert.deepStrictEqual(out.issues, { att: 18, work: 19, mismatch: [{ iso: '2026-10-01', shift: 'am', diff: 1 }, { iso: '2026-10-02', shift: 'am', diff: -1 }, { iso: '2026-10-08', shift: 'am', diff: -19 }], off: [{ iso: '2026-10-03', people: 4, pcs: 80, hol: null, weekend: true }],
    noGroup: [], skip: [['Údržba', 7]] }, 'po úpravě skupiny nesedí součet ranní směny; práce v sobotu je vidět');
  assert.deepStrictEqual(out.fresh, { groups: ['', '', '', ''], pcs: null, noGroup: 927 }, 'bez skupiny se kusy nepočítají');
  assert.deepStrictEqual(out.hr, { from: '2026-10-01', to: '2026-10-08', wFrom: '2026-09-28' }, 'od prvního dne s daty, týdny od pondělí');
  assert.deepStrictEqual(out.hr3, out.hr, 'posledních 3 týdnů, ale ne před týdnem prvních dat');
  assert.deepStrictEqual(out.sheets, [['Souhrn', 14], ['Skupiny', 8], ['Výpadky', 2], ['Týdny', 3]], 'pro auditora souhrn, skupiny, výpadky a týdny (bez měsíců)');
  assert.deepStrictEqual(out.skupiny, [['Skupina', 'Zařazení', 'Ø lidí v práci na pracovní den', 'Podíl na lidech v práci %', 'Zpracované kusy', 'Kusy na osobosměnu'],
    ['Brusiči', 'produktivní', 9.7, 25.2, 1050, 31.8]], 'bez osobosměn');
  assert.deepStrictEqual(out.gsheets, [['Souhrn', 11], ['Týdny', 3]], 'za skupinu bez listu Skupiny a Výpadky');
  assert.deepStrictEqual(out.gweeks, [['Týden', 'Od', 'Do', 'Pracovní dny', 'Ø lidí v práci na pracovní den', 'Podíl na lidech v práci %', 'Zpracované kusy', 'Kusy na osobosměnu'],
    ['T40/2026', '2026-10-01', '2026-10-04', 2, 11.5, 25.6, 1050, 38.9], ['T41/2026', '2026-10-05', '2026-10-08', 4, 6, 24, null, null]]);
  assert.deepStrictEqual(out.gsouhrn, [['Lidé v práci a zpracované kusy – Brusiči'], ['Období', '1. 10. 2026 – 8. 10. 2026'], ['Skupina', 'Brusiči (produktivní)']]);
  assert.deepStrictEqual(out.tReq, [3, 0, -15, 43.33], 'požadavek = plán ze souboru; sobota se nepočítá');
  assert.deepStrictEqual([out.staff.n, out.staff.met, out.staff.balance, out.staff.episodes, out.staff.open],
    [3, 0, -15, [{ from: '2026-10-01', to: null, days: 3, worst: -15 }], { from: '2026-10-01', days: 3, worst: -15, deficit: 15, avgShort: 5, extra: 5, needDays: 3 }]);
  assert.deepStrictEqual(out.vypadky, [['Od', 'Dorovnáno', 'Pracovních dní do dorovnání', 'Největší ztráta (člověkodny)'], ['2026-10-01', 'zatím ne', 3, -15]]);
  assert.deepStrictEqual([out.fx.avg, out.fx.plan, out.fx.fill, out.fx.share, out.fxAll.share, out.fxAll.avg], [29 / 3, null, null, 29 / 115, null, 115 / 3]);
  assert.deepStrictEqual(out.weeksRows[0], ['Týden', 'Od', 'Do', 'Pracovní dny', 'Ø lidí v práci na pracovní den', 'Ø požadavek na pracovní den', 'Dny se splněným požadavkem', 'Podíl dní se splněným požadavkem %',
    'Bilance proti požadavku (člověkodny)', 'Zpracované kusy', 'Kusy na osobosměnu', 'Kumulovaná bilance (člověkodny)']);
  assert.deepStrictEqual(out.weeksRows.slice(1), [['T40/2026', '2026-10-01', '2026-10-04', 2, 45, 50, 0, 0, -10, 1470, 18.5, -10], ['T41/2026', '2026-10-05', '2026-10-08', 4, 25, 30, 0, 0, -5, null, null, -15]],
    '28. 9. je svátek, sobota 3. 10. se do průměru ani požadavku nepočítá');
  assert.deepStrictEqual(out.souhrn.map(r => r[1]), [6, 38.3, 43.3, 0, 0, -15, 1470, 17.1]);
  assert.deepStrictEqual(out.log, ['Audit 1. 10. 2026 – Ranní, Brusiči: 6 → 7 (Chyběl záznam brigádníka)', 'Audit 2. 10. 2026 – Kusy – Broušení ručně: 450 → 470 (Oprava ze směnového hlášení)']);
  assert.deepStrictEqual(out.log2, ['Audit – Kontrola / balení / brigadýr / školitelé, neproduktivní pozice: ano → ne', 'Audit – operace „Kontrola výstupní“, skupina: Kontrola / balení / brigadýr / školitelé → bez skupiny']);
  assert.deepStrictEqual(out.dirty, [[['ok', 'ZZ', '']], [['o1', '']], { am: { plan: 0, total: null, abs: null }, pm: { plan: null, total: null }, g: { ok: [100000, 2] } }, ['2026-10-01'], ['am.total']]);
  assert.ok(out.blank && out.v === 37);
  return null;
});

test('aktualizace 2.16 → 2.18: data zůstanou beze změny, Audit začne prázdný', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    const old = sanitizeState(demoData()); delete old.workAudit; old.v = 14;
    const before = JSON.stringify(Object.assign({}, old, { v: 0 }));
    const now = sanitizeState(JSON.parse(JSON.stringify(old)));
    const keep = JSON.parse(JSON.stringify(now)); delete keep.workAudit;
    JSON.stringify({ same: JSON.stringify(Object.assign({}, keep, { v: 0 })) === before, days: Object.keys(now.workAudit.days).length, groups: now.workAudit.groups.length, v: now.v })`));
  assert.deepStrictEqual(out, { same: true, days: 0, groups: 7, v: 37 });
  return null;
});

test('aktualizace 2.17 → 2.18.1: Audit beze změny, přibude prázdný výrobní plán a pevný požadavek 100 lidí', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    const old = sanitizeState(demoData());
    old.workAudit.days['2026-10-01'] = { am: { plan: 30, total: 28, abs: 2 }, pm: { plan: 20, total: 20 }, g: { brus: [6, 5] } };
    delete old.workAudit.plan; delete old.workAudit.target; old.v = 15;
    const before = JSON.stringify(old.workAudit);
    const now = sanitizeState(JSON.parse(JSON.stringify(old)));
    const wa = JSON.parse(JSON.stringify(now.workAudit)); delete wa.plan; delete wa.target;
    // 2.18 uložila požadavek „podle souboru“ (null); 2.18.1 ho převede na pevných 100 lidí
    const v16 = JSON.parse(JSON.stringify(now)); v16.workAudit.target = null; v16.v = 16;
    const v16Own = JSON.parse(JSON.stringify(now)); v16Own.workAudit.target = 90; v16Own.v = 16;
    // od 2.18.1 je „podle souboru“ (null) volba uživatele a zůstane
    const v17 = JSON.parse(JSON.stringify(now)); v17.workAudit.target = null;
    JSON.stringify({ same: JSON.stringify(wa) === before, plan: now.workAudit.plan, target: now.workAudit.target, v: now.v,
      fresh: sanitizeState(demoData()).workAudit.target, t16: sanitizeState(v16).workAudit.target, own: sanitizeState(v16Own).workAudit.target, t17: sanitizeState(v17).workAudit.target })`));
  assert.ok(out.same, 'stávající Audit beze změny');
  assert.deepStrictEqual(out.plan, { tpl: null, tech: { words: ['G2', 'G'], mode: 'token' }, cap: { group: 'brus', perShift: 25 }, chunks: [], weeks: {}, items: 0, files: [], at: 0, by: '' });
  assert.deepStrictEqual([out.target, out.v], [100, 37], 'požadavek pevně 100 lidí na pracovní den');
  assert.deepStrictEqual([out.fresh, out.t16, out.own, out.t17], [100, 100, 90, null], 'nová data 100, z 2.18 100, vlastní číslo zůstane, „podle souboru“ od 2.18.1 zůstane');
  return null;
});

test('obsazenost (2.18): výpadek dvou týdnů o 3 lidi dorovnají dva týdny s 3 lidmi navíc; pevný požadavek', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const wa = S.workAudit;
    wa.target = null;   // požadavek podle plánu ze souboru
    // 20 pracovních dnů od 2. 11. 2026 (17. 11. je svátek a vynechá se): prvních 10 chybí 3 lidé, dalších 10 jsou 3 navíc.
    let iso = '2026-11-02', n = 0;
    while (n < 20) {
      const [y, m, d] = iso.split('-').map(Number);
      if (mkDay(y, m, d).work) { wa.days[iso] = { am: { plan: 30, total: 30 + (n < 10 ? -3 : 3), abs: null }, pm: { plan: 20, total: 20 }, g: {} }; n++; }
      iso = addDays(iso, 1);
    }
    const days = waDays(wa, '2026-11-02', iso);
    const st = waStaffing(wa, days);
    const t = waTotals(wa, days);
    wa.target = 52;                      // pevný požadavek: 52 lidí na den
    const st2 = waStaffing(wa, days);
    const t2 = waTotals(wa, days);
    const wk = waWeeks(wa, days).map(w => [w.label, w.t.metDays, w.t.reqDays, w.t.balance]);
    const dirty = cleanWorkAudit({ target: -5 }).target;
    JSON.stringify({ st: [st.n, st.met, st.balance, st.episodes, st.open], t: [t.metDays, t.reqDays, t.metShare], st2: [st2.met, st2.balance, st2.open], t2: [t2.avgReq, t2.metDays], wk, dirty })`));
  assert.deepStrictEqual(out.st, [20, 10, 0, [{ from: '2026-11-02', to: '2026-11-30', days: 20, worst: -30 }], null],
    '3 lidé × 10 dní = −30 člověkodní, dorovnáno posledním dnem dalších dvou týdnů');
  assert.deepStrictEqual(out.t, [10, 20, 0.5], 'polovina dní se splněným požadavkem');
  assert.deepStrictEqual(out.st2, [10, -40, { from: '2026-11-02', days: 20, worst: -50, deficit: 40, avgShort: 5, extra: 5, needDays: 8 }],
    'pevný požadavek 52: chybí 40 člověkodní, při +5 lidech denně dorovnání za 8 pracovních dní');
  assert.deepStrictEqual(out.t2, [52, 10]);
  assert.deepStrictEqual(out.wk.slice(0, 2), [['T45/2026', 0, 5, -25], ['T46/2026', 0, 5, -25]]);
  assert.strictEqual(out.dirty, null);
  return null;
});

test('výrobní plán (2.18): sloupce podle vzoru, filtr G2/G, duplicity s nejpozdějším termínem, týdny a kapacita brusičů', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const wa = S.workAudit;
    const guess = waPlanGuess(['Číslo objednávky', 'EAN', 'Počet ks', 'Index', 'Termín dokončení', 'Technologie', 'Poznámka']);
    // Vzor listu: nadpisy na 3. řádku; v novém souboru se posunuly o řádek a sloupec Index je jinde.
    const sh = { name: 'Plan', header: 2, cols: { order: 'A', ean: 'B', ks: 'C', index: 'D', due: 'E', tech: 'F' },
      heads: { order: 'Číslo objednávky', ean: 'EAN', ks: 'Počet ks', index: 'Index', due: 'Termín dokončení', tech: 'Technologie' } };
    const moved = waPlanCols([[], [], ['Plán'], ['Index', 'Číslo objednávky', 'EAN', 'Počet ks', 'Termín dokončení', 'Technologie']], sh);
    const fallback = waPlanCols([['nic']], sh);
    // 2.18.2: nadpisy na 2. řádku, stejný název dvakrát (platí sloupec se stejným písmenem), chybějící technologie
    const sh2 = { name: 'Plan', header: 1, cols: { order: 'A', ean: 'B', ks: 'C', index: 'D', due: 'F', tech: 'G' },
      heads: { order: 'Objednávka', ean: 'EAN', ks: 'Ks', index: 'Index', due: 'Termín', tech: 'Technologie' } };
    const row2 = waPlanCols([['Plán'], ['Objednávka', 'EAN', 'Ks', 'Index', 'Termín', 'Termín', 'Bez technologie'], ['Objednávka', 'EAN', 'Ks', 'Index', 'Termín']], sh2);
    const shifted = waPlanCols([['Plán'], ['Poř.', 'Objednávka', 'EAN', 'Ks', 'Index', 'Termín', 'Technologie']], sh2);
    const match = [waPlanMatch('B1/G2', wa.plan.tech), waPlanMatch('G + K', wa.plan.tech), waPlanMatch('GR', wa.plan.tech), waPlanMatch('BG2X', wa.plan.tech),
      waPlanMatch('BG2X', { words: ['G2'], mode: 'contains' }), waPlanMatch('cokoli', { words: [], mode: 'token' })];
    const map = new Map();
    // [objednávka, EAN, ks, index, termín, technologie]
    const a = waPlanMerge(map, [
      [4500001, 8591234567890, 100, 'IDX-1', '2026-11-10', 'G2'],
      [4500001, 8591234567890, 100, 'IDX-1', '2026-11-03', 'G2'],      // duplicita s dřívějším termínem
      [4500002, '8591234567891', 50, 'IDX-2', 46331, 'B1/G'],          // datum jako číslo Excelu (5. 11. 2026)
      [4500003, 8591234567892, 30, 'IDX-3', '2026-11-12', 'B1'],       // jiná technologie
      [4500004, 8591234567893, 0, 'IDX-4', '2026-11-12', 'G2'],        // nula kusů
      ['', '', 10, '', '2026-11-12', 'G2'],                            // bez klíče
    ], wa.plan.tech);
    const noTech = waPlanMerge(new Map(), [[1, 2, 5, 'X', '2026-11-12', null, 1], [3, 4, 5, 'Y', '2026-11-12', null]], wa.plan.tech);
    const b = waPlanMerge(map, [
      ['4500001', '8591234567890', 120, 'idx-1', '2026-11-17', 'G2'],  // posunutý termín (text a malá písmena = stejná položka)
      [4500002, 8591234567891, 50, 'IDX-2', '2026-11-02', 'G'],        // starší verze, nechá se pozdější
      [4500005, 8591234567894, 75, 'IDX-5', '2026-11-18', 'G2 B'],
    ], wa.plan.tech);
    const enc = waPlanEncode(map), dec = waPlanDecode(JSON.parse(JSON.stringify(enc)));
    wa.plan.weeks = waPlanWeeks(map);
    // obsazenost brusičů: T45 skutečná (2 dny po 6 + 5), T46 a T47 odhad z průměru
    wa.days['2026-11-02'] = { am: { plan: 30, total: 28, abs: 2 }, pm: { plan: 20, total: 20 }, g: { brus: [6, 5] } };
    wa.days['2026-11-03'] = { am: { plan: 30, total: 28, abs: 2 }, pm: { plan: 20, total: 20 }, g: { brus: [6, 5] } };
    const cap = waPlanCapacity(wa, ['2026-W45', '2026-W46', '2026-W47']);
    wa.plan.cap.perShift = 1;
    const slow = waPlanCapacity(wa, ['2026-W45', '2026-W46', '2026-W47']);
    wa.plan.cap.perShift = 25;
    ['2026-11-04', '2026-11-05', '2026-11-06'].forEach(iso => { wa.days[iso] = { am: { plan: 30, total: 28 }, pm: { plan: 20, total: 20 }, g: { brus: [0, 0] } }; });
    const full = waPlanCapacity(wa, ['2026-W45']);
    const clean = cleanWaPlan({ tpl: { sheets: [{ name: 'x', header: 9999, cols: { order: 'zz', ks: '1' }, heads: { order: 'Obj' } }, {}, {}] }, tech: { words: ['g2', ' g ', 'g', '<b>'], mode: 'x' },
      cap: { group: 'nic', perShift: -3 }, chunks: ['abc', 'a'.repeat(32)], weeks: { '2026-W45': { ks: 10, n: 2 }, 'x': {}, '2026-W46': { ks: -1 } }, items: 'x' }, new Set(['brus']));
    // fronta do uloženého plánu: pozdější termín vyhrává, stejný termín přepíše kusy
    const saved = new Map([['K1', ['2026-11-10', 5]], ['K2', ['2026-11-10', 5]], ['K3', ['2026-11-10', 5]]]);
    const queue = new Map([['K1', ['2026-11-17', 6]], ['K2', ['2026-11-03', 7]], ['K3', ['2026-11-10', 8]], ['K4', ['2026-11-11', 9]]]);
    const mm = waPlanMergeMap(saved, queue);
    JSON.stringify({ guess, moved, fallback, row2, shifted, noTech, mm, mmItems: [...saved.entries()], match, a, b, items: [...map.entries()], dec: [...dec.entries()], weeks: wa.plan.weeks, cap, slow, full, clean })`));
  assert.deepStrictEqual(out.guess, { order: 0, ean: 1, ks: 2, index: 3, due: 4, tech: 5 });
  assert.deepStrictEqual(out.moved, { header: 3, idx: { index: 0, order: 1, ean: 2, ks: 3, due: 4, tech: 5 }, found: true, missing: [] }, 'sloupce podle nadpisů, i když se posunuly');
  assert.deepStrictEqual(out.fallback, { header: 2, idx: { order: 0, ean: 1, ks: 2, index: 3, due: 4, tech: 5 }, found: false, missing: [] });
  assert.deepStrictEqual(out.row2, { header: 1, idx: { order: 0, ean: 1, ks: 2, index: 3, due: 5, tech: 6 }, found: true, missing: ['tech'] },
    'nadpisy na 2. řádku; Termín dvakrát → sloupec F jako ve vzoru; technologie chybí a čte se podle písmene');
  assert.deepStrictEqual(out.shifted.idx, { order: 1, ean: 2, ks: 3, index: 4, due: 5, tech: 6 }, 'vložený sloupec: názvy se najdou o sloupec dál');
  assert.deepStrictEqual(out.match, [true, true, false, false, true, true], 'G2 i G jako samostatné označení, ne GR ani BG2X');
  assert.deepStrictEqual([out.a.rows, out.a.notTech, out.a.bad, out.a.matched, out.a.dupes, out.a.added, out.a.moved, out.a.older, out.a.items], [6, 1, 2, 3, 1, 2, 0, 1, 2]);
  assert.deepStrictEqual(out.a.techs, [{ tech: 'G2', n: 4, ok: true }, { tech: 'B1/G', n: 1, ok: true }, { tech: 'B1', n: 1, ok: false }]);
  assert.deepStrictEqual([out.b.matched, out.b.dupes, out.b.added, out.b.moved, out.b.older, out.b.same, out.b.items], [3, 0, 1, 1, 1, 0, 3]);
  assert.deepStrictEqual([out.noTech.matched, out.noTech.notTech], [1, 1], 'list bez sloupce technologie se bere bez filtru');
  assert.deepStrictEqual(out.mm, { added: 1, moved: 1, older: 1, same: 1, items: 4 });
  assert.deepStrictEqual(out.mmItems, [['K1', ['2026-11-17', 6]], ['K2', ['2026-11-10', 5]], ['K3', ['2026-11-10', 8]], ['K4', ['2026-11-11', 9]]]);
  assert.deepStrictEqual(out.items, [['4500001|IDX-1|8591234567890', ['2026-11-17', 120]], ['4500002|IDX-2|8591234567891', ['2026-11-05', 50]], ['4500005|IDX-5|8591234567894', ['2026-11-18', 75]]],
    'nejpozdější termín vyhrává, posun termínu přepíše kusy');
  assert.deepStrictEqual(out.dec, out.items, 'uložení a načtení položek beze ztráty');
  assert.deepStrictEqual(out.weeks, { '2026-W45': { ks: 50, n: 1 }, '2026-W47': { ks: 195, n: 2 } });
  assert.deepStrictEqual(out.cap.map(w => [w.id, w.plan, w.workDays, w.cap, w.actual, w.est, w.diff, w.cum]),
    [['2026-W45', 50, 5, 1375, false, 3, 1325, 0], ['2026-W46', 0, 5, 1375, false, 5, 1375, 0], ['2026-W47', 195, 4, 1100, false, 4, 905, 0]],
    'T45: 22 směn podle obsazenosti + 3 dny odhadem po 11 brusičích, × 25 ks; T46 a T47 celé odhadem; 17. 11. je svátek');
  assert.deepStrictEqual(out.slow.map(w => [w.cap, w.diff, w.cum]), [[55, 5, 0], [55, 55, 0], [44, -151, 151]],
    'skluz přechází do dalšího týdne, nevyužitá kapacita se nepřenáší');
  assert.deepStrictEqual(out.full.map(w => [w.cap, w.actual, w.est]), [[550, true, 0]], 'týden celý podle obsazenosti je skutečná kapacita');
  assert.deepStrictEqual(out.cap.map(w => [w.grinders, Math.round(w.need * 100) / 100]), [[11, 0.4], [11, 0], [11, 1.95]], 'brusičů Ø na den a potřeba směn na den');
  assert.deepStrictEqual(out.clean.tpl.sheets.length, 2);
  assert.deepStrictEqual(out.clean.tpl.sheets[0], { name: 'x', header: 500, cols: { order: 'ZZ', ean: '', ks: '', index: '', due: '', tech: '' }, heads: { order: 'Obj', ean: '', ks: '', index: '', due: '', tech: '' } });
  assert.deepStrictEqual([out.clean.tech, out.clean.cap, out.clean.chunks, out.clean.weeks, out.clean.items], [{ words: ['G2', 'G', 'B'], mode: 'token' }, { group: '', perShift: 25 }, ['a'.repeat(32)], { '2026-W45': { ks: 10, n: 2 } }, 0]);
  return null;
});

test('Top 5 (2.19): komentáře o vývoji případu – přidání, úprava, smazání, historie, čištění a aktualizace', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const m = (d, by = 'Mistr') => ({ at: Date.UTC(2026, 9, d, 9), by });
    const c = createCase('A-1', '', m(12));
    const before = sharedState(S);
    const k1 = addCaseComment(c, '  Čekáme na nový přípravek od nástrojárny.\\nDodání příští týden.  ', m(13));
    const k1s = JSON.parse(JSON.stringify(k1));   // stav hned po přidání (úprava níž ho změní)
    const empty = addCaseComment(c, '   ', m(13));
    const long = addCaseComment(c, 'x'.repeat(3000), m(14, 'Vedoucí'));
    const log = describeChanges(before, sharedState(S), { at: 1, by: 'Mistr', card: '' }).entries.map(e => e.text);
    const ed = editCaseComment(c, k1.id, 'Přípravek dorazil, zkouška ve středu.', m(15, 'Vedoucí'));
    const same = editCaseComment(c, k1.id, 'Přípravek dorazil, zkouška ve středu.', m(15));
    const del = deleteCaseComment(c, long.id, m(16));
    reopenCase(c, 'Vrátilo se', '', m(20));
    const k3 = addCaseComment(c, 'Nové kolo: zkusíme jinou normu.', m(21));
    const clean = cleanEff({ cases: [{ ...JSON.parse(JSON.stringify(c)), comments: [
      { id: 'bad id!', at: 5, by: 'X', text: 'ok', round: 99 }, { text: '' }, null, { text: 7 }, { id: 'k1', text: 'y'.repeat(2500), ed: { at: 1, by: 'Z' } }] }] });
    const copy = caseCopy(c);
    const old = JSON.parse(JSON.stringify(sharedState(S))); old.eff.cases.forEach(x => delete x.comments); old.v = 17;
    const up = sanitizeState(old);
    JSON.stringify({ k1: k1s, empty, longLen: long.text.length, log, ed, same, del, list: c.comments.map(k => [k.text, k.round, k.by, k.ed && k.ed.by]),
      last: lastComment(c).text, hist: c.log.map(e => e.t), clean: clean.cases[0].comments, copy: 'comments' in copy,
      up: up.eff.cases.map(x => x.comments), v: up.v })`));
  assert.deepStrictEqual([out.k1.text, out.k1.round, out.k1.by, out.empty, out.longLen], ['Čekáme na nový přípravek od nástrojárny.\nDodání příští týden.', 1, 'Mistr', null, 2000]);
  assert.ok(out.log.some(t => /^P-2026-001 \(A-1\): Komentář: „Čekáme na nový přípravek od nástrojárny\. Dodání příští týden\.“$/.test(t)), `komentář v historii změn: ${out.log}`);
  assert.deepStrictEqual([out.ed, out.same, out.del], [true, false, true]);
  assert.deepStrictEqual(out.list, [['Přípravek dorazil, zkouška ve středu.', 1, 'Mistr', 'Vedoucí'], ['Nové kolo: zkusíme jinou normu.', 2, 'Mistr', null]], 'komentář patří ke kolu, úprava si pamatuje kdo');
  assert.strictEqual(out.last, 'Nové kolo: zkusíme jinou normu.');
  assert.ok(out.hist.includes('Upraven komentář z 13. 10. 2026: „Přípravek dorazil, zkouška ve středu.“') && out.hist.some(t => /^Smazán komentář z 14\. 10\. 2026: „x{117}…“$/.test(t)), `historie případu: ${out.hist}`);
  assert.deepStrictEqual(out.clean.map(k => [k.id.length > 1, k.text.length, k.round, !!k.ed]), [[true, 2, 50, false], [true, 2000, 1, true]], 'čištění: prázdné a nesmyslné pryč, délka a kolo omezené');
  assert.strictEqual(out.clean[1].id, 'k1');
  assert.strictEqual(out.copy, false, 'vydaný report komentáře nekopíruje');
  assert.deepStrictEqual([out.up, out.v], [[[]], 37], 'aktualizace 2.18 → 2.19: případy bez komentářů dostanou prázdný seznam');
  return null;
});

test('Audit (2.19.1): vlastní období od–do, oříznuté na dny s daty', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const wa = S.workAudit;
    ['2026-10-05', '2026-10-20', '2026-11-04'].forEach(iso => { wa.days[iso] = { am: { plan: 30, total: 28 }, pm: { plan: 20, total: 20 }, g: {} }; });
    JSON.stringify({
      inside: waCustomRange(wa, '2026-10-12', '2026-10-25'),
      swap: waCustomRange(wa, '2026-10-25', '2026-10-12'),
      clip: waCustomRange(wa, '2026-09-01', '2026-12-31'),
      empty: waCustomRange(wa, '2026-12-01', '2026-12-31'),
      bad: waCustomRange(wa, 'x', ''),
      none: waCustomRange(blankWorkAudit(), '2026-10-01', '2026-10-31') })`));
  assert.deepStrictEqual(out.inside, { from: '2026-10-12', to: '2026-10-25', wFrom: '2026-10-12', want: { from: '2026-10-12', to: '2026-10-25' }, clipped: false });
  assert.deepStrictEqual([out.swap.from, out.swap.to], ['2026-10-12', '2026-10-25'], 'prohozené od a do');
  assert.deepStrictEqual([out.clip.from, out.clip.to, out.clip.wFrom, out.clip.clipped], ['2026-10-05', '2026-11-04', '2026-10-05', true], 'oříznuto na dny s daty');
  assert.ok(out.empty.empty && out.empty.want.from === '2026-12-01', 'období bez dat');
  assert.deepStrictEqual([out.bad.from, out.bad.to, out.bad.clipped], ['2026-10-05', '2026-11-04', false], 'neplatné datum = celé období dat');
  assert.strictEqual(out.none, null);
  return null;
});

test('Servis (2.21): odeslání, zařízení z položek, párování, číslo protokolu, vrácení, historie a čištění', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const a = sharedState(S);
    const svc = S.service;
    const it = x => ({ ...blankSvItem(), ...x });
    const r1 = svSaveShipment(svc, { date: '2026-10-19', to: 'Servis Brno', note: '', items: [
      it({ kind: 'Bruska', brand: 'Makita', model: 'GA5030', iid: 'B-12', sn: 'SN 001', fault: 'nejde zapnout' }),
      it({ kind: 'Vrtačka', brand: 'Bosch', model: 'GSB 18', iidBad: true, iid: 'xx', sn: 'X-9' }),
      it({ kind: 'Pila', brand: 'Festool', model: 'TS 55', iidBad: true, snBad: true, mark: 'S-01', faults: ['damage', 'start'], fault: 'prasklý kryt' })] }, { by: 'Vedoucí', at: 1 });
    const b = sharedState(S);
    const r2 = svSaveShipment(svc, { date: '2026-11-02', to: 'Servis Brno', items: [
      it({ kind: 'Bruska', iid: 'b 12' }), it({ sn: 'x9' }), it({ iidBad: true, snBad: true, mark: 's-01', purpose: 'scrap' }), it({ kind: 'Lešticí stroj', iid: 'L-7' })] }, { by: 'Vedoucí', at: 2 });
    r1.ship.items[0].back = '2026-10-25'; r1.ship.items[0].backNote = 'vyměněn vypínač';
    const c = sharedState(S);
    const dev = svFindDevice(svc, { iid: 'B12' });
    const h = svHistory(svc, dev.id, '2026-11-10');
    const hC = svHistory(svc, svFindDevice(svc, { mark: 'S01', iidBad: true, snBad: true }).id, '2026-11-10');
    const log1 = describeChanges(a, b, { at: 1, by: 'V', card: '' }).entries.map(e => e.text);
    const log2 = describeChanges(b, c, { at: 2, by: 'V', card: '' }).entries.map(e => e.text);
    const dirty = cleanService({ devices: [{ id: 'dv1', iid: 'A', iidBad: true, sn: 'S' }], shipments: [
      { id: 'x', date: '2026-10-10', items: [{ dev: 'dv1', back: '2026-10-01' }, { dev: 'neni', back: '2026-10-12' }] }, { id: 'y', date: 'vcera' }] });
    const next = svSaveShipment(svc, { date: '2027-01-05', items: [it({ iid: 'B-12' })] }, {});
    const old = sanitizeState(demoData()); delete old.service; old.v = 18;
    const up = sanitizeState(JSON.parse(JSON.stringify(old)));
    JSON.stringify({ no: [svNo(r1.ship), svNo(r2.ship), svNo(next.ship)], created: [r1.created.length, r2.created.length, next.created.length],
      devs: svc.devices.map(d => [d.kind, d.brand, d.iid, d.sn, d.iidBad, d.snBad, d.mark]),
      snap: r1.ship.items.map(i => [i.iid, i.iidBad, i.fault]), snap2: r2.ship.items[0].brand,
      h: [h.count, h.first, h.last, h.out, h.outDays, h.avgDays, h.avgGap, h.totalDays], hC: [hC.count, hC.out, hC.retired],
      faults: [svFaultText(r1.ship.items[2]), svFaultText(r1.ship.items[0]), svFaultText(it({ faults: ['heat', 'nic'] })), svPurposeText(r2.ship.items[2]), cleanService({ shipments: [{ date: '2026-01-01', items: [{ purpose: 'x', faults: ['vibr', 'x', 'vibr'] }] }] }).shipments[0].items[0]],
      problems: [svItemProblem(it({})), svItemProblem(it({ kind: 'X' })), svItemProblem(it({ iidBad: true, snBad: true })), svItemProblem(it({ iidBad: true, snBad: true, mark: 'M' })), svItemProblem(it({ sn: '1' }))],
      ident: [svDevIdent(svc.devices[1]), svDevIdent(svc.devices[2]), svDevName(svc.devices[0])],
      log1, log2, dirty: [dirty.devices[0].iid, dirty.devices[0].iidBad, dirty.shipments.length, dirty.shipments[0].items.map(i => [i.dev, i.back])],
      blank: blank().service, up: [up.service, up.v], v: DATA_VERSION })`));
  assert.deepStrictEqual(out.no, ['2026/001', '2026/002', '2027/001'], 'číslo protokolu po letech');
  assert.deepStrictEqual(out.created, [3, 1, 0], 'zařízení vzniknou při prvním odeslání, další odeslání je najde podle ID, v. č. i označení (bez mezer a pomlček)');
  assert.deepStrictEqual(out.devs, [['Bruska', 'Makita', 'B-12', 'SN 001', false, false, ''], ['Vrtačka', 'Bosch', '', 'X-9', true, false, ''],
    ['Pila', 'Festool', '', '', true, true, 'S-01'], ['Lešticí stroj', '', 'L-7', '', false, false, '']], 'evidence: nečitelné ID se neuloží, prázdné pole nic nesmaže');
  assert.deepStrictEqual(out.snap, [['B-12', false, 'nejde zapnout'], ['', true, ''], ['', true, 'prasklý kryt']], 'položka je snímek údajů v době odeslání');
  assert.strictEqual(out.snap2, '', 'druhé odeslání bez značky: protokol ji neukáže, evidence ji má dál');
  assert.deepStrictEqual(out.h, [2, '2026-10-19', '2026-11-02', true, 8, 6, 14, 6], 'dvakrát na servisu, teď 8 dní, minule 6 dní, odstup 14 dní');
  assert.deepStrictEqual(out.hC, [2, false, '2026-11-02'], 'odesláno k vyřazení: zařízení je vyřazené, na servisu se nepočítá');
  assert.deepStrictEqual(out.faults.slice(0, 4), ['Nelze spustit, Poškozené zařízení, jiná: prasklý kryt', 'nejde zapnout', 'Přehřívá se', 'k vyřazení'], 'závady v pořadí seznamu a jiná závada');
  assert.deepStrictEqual([out.faults[4].purpose, out.faults[4].faults], ['repair', ['vibr']], 'čištění účelu a závad');
  assert.deepStrictEqual(out.problems, ['prázdná položka', 'chybí interní ID nebo výrobní číslo', 'obě čísla jsou nečitelná: doplň dodatečné označení', '', '']);
  assert.deepStrictEqual(out.ident, ['ID nečitelné · v. č. X-9', 'ID nečitelné · v. č. nečitelné · označení S-01', 'Bruska · Makita GA5030']);
  assert.deepStrictEqual(out.log1, ['Servis: odeslání 2026/001 (19. 10. 2026, Servis Brno): 3 zařízení – Bruska · Makita GA5030 (ID B-12 · v. č. SN 001); Vrtačka · Bosch GSB 18 (ID nečitelné · v. č. X-9); Pila · Festool TS 55 (ID nečitelné · v. č. nečitelné · označení S-01)'], 'záznam o odeslání v historii změn');
  assert.ok(out.log2.some(t => t === 'Servis 2026/001: vráceno ze servisu 25. 10. 2026 – Bruska · Makita GA5030 (ID B-12 · v. č. SN 001) (vyměněn vypínač)'), `vrácení v historii: ${out.log2}`);
  assert.deepStrictEqual(out.dirty, ['', true, 1, [['dv1', ''], ['', '2026-10-12']]], 'čištění: nečitelné ID bez textu, vrácení před odesláním pryč, neznámé zařízení bez odkazu, odeslání bez data pryč');
  assert.deepStrictEqual(out.blank, { devices: [], shipments: [], templates: [] });
  assert.deepStrictEqual(out.up, [{ devices: [], shipments: [], templates: [] }, 37], 'aktualizace 2.20 → 2.21: Servis začne prázdný');
  return null;
});

test('Servis (2.26): digitální podpis předávajícího – čištění, úprava protokolu, soubory do zálohy, historie', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    S = sanitizeState(demoData());
    const svc = S.service, it = x => ({ ...blankSvItem(), ...x });
    const F = 'a'.repeat(32), G = 'b'.repeat(32);
    const { ship } = svSaveShipment(svc, { date: '2026-10-19', to: 'Servis Brno', note: '', items: [it({ kind: 'Bruska', iid: 'B-12' }), it({ kind: 'Pila', iid: 'P-1', purpose: 'scrap' })] }, { by: 'V', at: 1 });
    const a = sharedState(S);
    ship.sign = { file: F, name: '  Jan\\u0007 Novák  ', at: 5, by: 'Vedoucí' };
    const b = sanitizeState(JSON.parse(JSON.stringify(sharedState(S))));   // jméno čistí rozhraní i čištění dat
    const kept = sanitizeState(JSON.parse(JSON.stringify(S))).service.shipments[0].sign;
    const bad = [{ file: 'neni-hex', name: 'X' }, { file: F, name: '  ' }, { file: F.toUpperCase(), name: 'X' }, 'text', null].map(x => svSignClean(x));
    const files = [svFileIds(S), svFileIds({ service: { shipments: [{ sign: { file: F } }, { sign: { file: F } }, {}] } })];
    // úprava protokolu (svSaveShipment) podpis neodebere sama, to dělá rozhraní podle obsahu
    svSaveShipment(svc, { id: ship.id, date: '2026-10-19', to: 'Servis Brno', note: 'doplněno', items: ship.items.map(x => ({ ...x })) }, { by: 'V', at: 2 });
    const afterEdit = !!ship.sign;
    ship.sign = { file: G, name: 'Eva Malá', at: 6 };
    const c = sharedState(S);
    delete ship.sign;
    const d = sharedState(S);
    const log = (x, y) => describeChanges(x, y, { at: 9, by: 'V', card: '' }).entries.map(e => e.text).filter(t => /podeps|podpis/.test(t));
    return JSON.stringify({ kept, bad, files, afterEdit, log1: log(a, b), log2: log(b, c), log3: log(c, d), v: DATA_VERSION });
  })()`));
  assert.deepStrictEqual(out.kept, { file: 'a'.repeat(32), name: 'Jan  Novák', at: 5, by: 'Vedoucí' }, 'podpis zůstane, jméno bez řídicích znaků');
  assert.deepStrictEqual(out.bad, [null, null, null, null, null], 'neplatné id souboru nebo prázdné jméno se zahodí');
  assert.deepStrictEqual(out.files, [['a'.repeat(32)], ['a'.repeat(32)]], 'soubory podpisů do zálohy bez opakování');
  assert.strictEqual(out.afterEdit, true);
  assert.deepStrictEqual(out.log1, ['Servis 2026/001: podepsal předávající Jan  Novák']);
  assert.deepStrictEqual(out.log2, ['Servis 2026/001: podepsal předávající Eva Malá (nový podpis)']);
  assert.deepStrictEqual(out.log3, ['Servis 2026/001: odebrán podpis předávajícího (Eva Malá)']);
  assert.strictEqual(out.v, 37, 'verze dat 37: starší stránka podpis nesmaže');
  return null;
});

test('Shortage (2.27, sloupce 2.27.1): import řádků, TOP nahoře, kód z odkazu, čištění, limity, historie změn', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const c = (text, link) => ({ text, link: link || '' });
    const L = (id, code, rest) => 'http://is.example/commission.production.detail/default/' + id + '?activeBarcode=' + code + (rest == null ? '&componentProductionId=1' : rest);
    // A objednávka, B název, C EAN (odkaz), D index, E množství, F (nic), G TOP, H probíhající operace
    const rows = [
      [c('Shortage 22. 10.'), c(''), c(''), c(''), c(''), c(''), c(''), c('')],                      // titulek nad hlavičkou
      [c('Číslo objednávky'), c('Název dílu'), c('EAN'), c('Index'), c('Urgentní množství'), c(''), c('TOP'), c('Probíhající operace')],
      [c('OBJ-2026-0101'), c('Hřídel  A\\n'), c('8594001234567', L(68001, '11111.222222.33333')), c('B'), c('12'), c('x'), c(''), c('Broušení')],
      [c('0045123'), c('Ložisko 6204'), c('0012345678905', L(68002, '11111.222222.44444', '')), c('A'), c('1 200'), c(''), c('TOP'), c('Montáž')],
      [c('OBJ-3'), c('Bez odkazu'), c('8590000000001'), c('C'), c('5 ks'), c(''), c(' top '), c('')],
      [c('OBJ-4'), c('Odkaz bez kódu'), c('8590000000002', 'https://erp.example/dil/2'), c(''), c('1'), c(''), c('ne'), c('')],
      [c('OBJ-5', L(68005, '55555.666666.77777')), c('Odkaz v objednávce'), c('8590000000003'), c(''), c('2'), c(''), c(''), c('Elox')],
      [c('OBJ-6'), c('Kód s %2F'), c('8590000000004', 'is.example/x?a=1&activeBarcode=12%2F34&b=2'), c(''), c('3'), c(''), c('TOP SHORTAGE'), c('')],
      [c(''), c(''), c(''), c(''), c(''), c(''), c('TOP'), c('')],                                     // jen TOP: prázdný řádek
      [c('OBJ-9'), c(''), c(''), c(''), c('3'), c(''), c(''), c('')],                                  // bez EAN i názvu
      [c(''), c('Jen název'), c(''), c(''), c('2'), c(''), c(''), c('')],
    ];
    const r = shBuild(rows);
    const noHeader = shBuild([[c('OBJ-1'), c('Díl'), c('8594001234567', L(1, '9.9.9')), c('A'), c('4')]]);
    // čištění: nejnovější první, nejvýš 30 seznamů a 1000 položek; seznam ze 2.27 (bez top, op, code)
    const many = Array.from({ length: 32 }, (_, i) => ({ id: 'sh' + i, at: 1000 + i, file: 'f' + i + '.xlsx', items: [{ ean: 'E' + i, link: 'ftp://x', name: 'N' }] }));
    many[31].items = Array.from({ length: 1003 }, (_, i) => ({ ean: String(i), name: 'D', top: i === 1002 }));
    const cl = cleanShortage({ lists: many });
    const old = cleanShortage({ lists: [{ id: 'shOld', at: 5, items: [{ ean: '1', link: L(7, '70.71.72'), name: 'A', order: 'O', index: 'I', qty: '3' }, { ean: '2', link: 'https://erp.example/2', name: 'B' }] }] });
    const junk = cleanShortage({ lists: [{ id: 'bad id!', at: 'x', items: [{ ean: '', name: '' }, { ean: ' 123 ', link: ' https://ok.example/a ', name: 'X\\u0007Y', top: 'ano', op: ' Brus\\u0007 ', code: 'a b' }, null] }, 'text', null] });
    // stav a historie změn
    S = sanitizeState(demoData());
    const a = sharedState(S);
    S.shortage.lists.unshift({ id: 'shA1', at: new Date(2026, 9, 22, 8, 5).getTime(), by: 'Vedoucí', file: 'shortage.xlsx', sheet: '', items: r.items });
    const b = sanitizeState(JSON.parse(JSON.stringify(sharedState(S))));
    S.shortage.lists = [];
    const d = sharedState(S);
    const log = (x, y) => describeChanges(x, y, { at: 9, by: 'V', card: '' }).entries.filter(e => e.kind === 'shortage').map(e => e.text);
    return JSON.stringify({ r, noHeader: [noHeader.header, noHeader.items.length, noHeader.items[0].code], cl: [cl.lists.length, cl.lists[0].id, cl.lists[cl.lists.length - 1].id, cl.lists.map(l => l.items.length).sort((x, y) => y - x)[0], cl.lists[0].items[0].link, cl.lists[0].items[0].top],
      old: old.lists[0].items.map(({ id, ...x }) => ({ ...x, idOk: /^si[a-z0-9]{5}$/.test(id) })), junk: junk.lists.map(l => ({ id: l.id, items: l.items.map(({ id, ...x }) => x) })), keptB: [b.shortage.lists[0].items.length, b.shortage.lists[0].items.map(i => i.top)], log1: log(a, b), log2: log(b, d), blank: blank().shortage, up: sanitizeState({ v: 22 }).shortage,
      unxml: ['https://x.cz/?a=1&amp;b=2&#38;c=&#x3C;3&gt;', 'bez entit', '&amp;amp;', '&#0;&#99999999;'].map(shUnxml),
      links: ['https://x.cz/a b', 'HTTP://X.CZ', 'www.x.cz', 'mailto:a@b.cz', '#List1!A1', 'https://x.cz/' + 'a'.repeat(2000)].map(shLink),
      codes: [L(1, '12345.678901.23456'), 'http://x/?ACTIVEBARCODE=12.3', 'http://x/?activeBarcode=', 'http://x/?activeBarcode=a%20b', 'http://x/?activeBarcode=%E0%A4%A', 'http://x/?activeBarcode=12#frag', 'http://x/?barcode=1', '', null, 'http://x/?activeBarcode=' + '1'.repeat(121)].map(shCode),
      tsv: shTsv('A\\tB\\r\\n"víc\\nřádků"\\t"s ""uvozovkami"""\\n\\tC\\n'), v: DATA_VERSION });
  })()`));
  assert.strictEqual(out.r.header, 1, 'hlavička pod titulkem');
  assert.deepStrictEqual(out.r.items.map(i => i.ean), ['0012345678905', '8590000000001', '8590000000004', '8594001234567', '8590000000002', '8590000000003', ''], 'TOP SHORTAGE první (v pořadí ze souboru), pak ostatní; řádek jen s názvem zůstane');
  assert.deepStrictEqual(out.r.items[3], { order: 'OBJ-2026-0101', name: 'Hřídel A', ean: '8594001234567', index: 'B', qty: '12', top: false, top2: false, op: 'Broušení',
    link: 'http://is.example/commission.production.detail/default/68001?activeBarcode=11111.222222.33333&componentProductionId=1', code: '11111.222222.33333' });
  assert.deepStrictEqual(out.r.items.map(i => i.top), [true, true, true, false, false, false, false], 'TOP, „ top “ i „TOP SHORTAGE“; „ne“ ne');
  assert.deepStrictEqual(out.r.items.map(i => i.code), ['11111.222222.44444', '', '12/34', '11111.222222.33333', '', '55555.666666.77777', ''], 'kód za activeBarcode do & (i na konci odkazu, i odkaz v jiné buňce, %XX dekódované)');
  assert.deepStrictEqual(out.r.items.map(i => i.link), [out.r.items[0].link, '', '', out.r.items[3].link, 'https://erp.example/dil/2', out.r.items[5].link, ''], 'klikací odkaz jen webová adresa');
  assert.deepStrictEqual([out.r.items[0].order, out.r.items[0].qty, out.r.items[1].qty, out.r.items[0].op], ['0045123', '1 200', '5 ks', 'Montáž'], 'objednávka s nulami a množství jak je v Excelu, operace');
  assert.deepStrictEqual([out.r.top, out.r.warn], [3, { noLink: 2, noCode: 1, noEan: 1, skipped: 1 }]);
  assert.deepStrictEqual(out.noHeader, [-1, 1, '9.9.9'], 'bez hlavičky se čte od prvního řádku');
  assert.deepStrictEqual(out.cl, [30, 'sh31', 'sh2', 1000, '', true], 'nejnovější první, 30 seznamů, 1000 položek (TOP z konce se dostane dopředu), ftp odkaz pryč');
  assert.deepStrictEqual(out.old, [{ order: 'O', name: 'A', ean: '1', index: 'I', qty: '3', top: false, top2: false, op: '', link: 'http://is.example/commission.production.detail/default/7?activeBarcode=70.71.72&componentProductionId=1', code: '70.71.72', note: '', rec: null, pdfHide: false, full: false, dept: '', subs: [], cands: [], idOk: true },
    { order: '', name: 'B', ean: '2', index: '', qty: '', top: false, top2: false, op: '', link: 'https://erp.example/2', code: '', note: '', rec: null, pdfHide: false, full: false, dept: '', subs: [], cands: [], idOk: true }], 'seznam ze 2.27: kód se dopočítá z odkazu, TOP ne, operace prázdná; 2.28: id, bez poznámky a záznamu');
  assert.deepStrictEqual(out.junk.length, 1);
  assert.match(out.junk[0].id, /^sh[a-z0-9]{5}$/, 'neplatné id se nahradí');
  assert.deepStrictEqual(out.junk[0].items, [{ order: '', name: 'X Y', ean: '123', index: '', qty: '', top: false, top2: false, op: 'Brus', link: 'https://ok.example/a', code: '', note: '', rec: null, pdfHide: false, full: false, dept: '', subs: [], cands: [] }], 'TOP jen true, kód s mezerou pryč');
  assert.deepStrictEqual(out.keptB, [7, [true, true, true, false, false, false, false]], 'seznam přežije uložení a načtení i s TOP');
  assert.deepStrictEqual(out.log1, ['Shortage: nahrán seznam 22. 10. 2026 8:05 (7 položek, z toho 3 TOP, shortage.xlsx)']);
  assert.deepStrictEqual(out.log2, ['Shortage: smazán seznam 22. 10. 2026 8:05 (7 položek, z toho 3 TOP, shortage.xlsx)']);
  assert.deepStrictEqual([out.blank, out.up], [{ lists: [], depts: [] }, { lists: [], depts: [] }], 'nová i starší data začnou s prázdným Shortage (2.32 i bez oddělení)');
  assert.deepStrictEqual(out.links, ['', 'HTTP://X.CZ', 'https://www.x.cz', '', '', ''], 'odkaz v aplikaci jen webová adresa bez mezer, nejvýš 2000 znaků');
  assert.deepStrictEqual(out.codes, ['12345.678901.23456', '12.3', '', '', '%E0%A4%A', '12', '', '', '', ''], 'activeBarcode: do &, bez # části, s mezerou nebo delší než 120 znaků ne');
  assert.deepStrictEqual(out.unxml, ['https://x.cz/?a=1&b=2&c=<3>', 'bez entit', '&amp;', '&#0;&#99999999;'], 'XML zápis v cíli odkazu ze souboru (SheetJS) se převede zpět');
  assert.deepStrictEqual(out.tsv, [['A', 'B'], ['víc\nřádků', 's "uvozovkami"'], ['', 'C']], 'text ze schránky: tabulátory, řádky, buňky v uvozovkách');
  assert.strictEqual(out.v, 37, 'verze dat 37: starší stránka TOP, operaci, kód, poznámky, záznamy, delší stav, poddíly ani čekající poddíly nesmaže');
});

test('Shortage (2.28): poslední záznamy ze schránky, přesun, odebrání, poznámka, čištění a historie změn', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const c = text => ({ text, link: '' });
    const it = (id, code, top, extra) => ({ id, order: 'O-' + id, name: 'Díl ' + id, ean: '859' + id, index: 'A', qty: '1', top: !!top, op: '', link: '', code, note: '', rec: null, ...(extra || {}) });
    const list = () => ({ id: 'shL', at: new Date(2026, 9, 22, 6, 0).getTime(), by: 'V', file: 'f.xlsx', sheet: '', items: [it('t1', 'K1', true), it('t2', 'K2', true), it('a', 'K3'), it('b', 'K4'), it('c', ''), it('d', 'K3')] });
    // data ze schránky: nadpisy, dva záznamy téhož kódu (platí novější), formáty data, kód mimo seznam, řádek bez kódu
    const rows = [
      [c('QR kód'), c('Datum a čas'), c('Počet ks'), c('Stav')],
      [c('K1'), c('22.10.2026 9:15'), c('40'), c('Broušení hotovo')],
      [c('K1'), c('22.10.2026 08:05:10'), c('10'), c('Starší')],
      [c('K3'), c('2026-10-22 10:30'), c('12'), c('Elox')],
      [c('K4'), c('22. 10. 26 7:00'), c('5 ks'), c('Montáž')],
      [c('X9'), c('22.10.2026 9:00'), c('1'), c('?')],
      [c(''), c('22.10.2026 9:00'), c('1'), c('bez kódu')],
      [c('K2'), c('není datum'), c('3'), c('Čeká')],
      [c('K5'), c('22.10.2026 12:00'), c('2'), c('Dlouhý stav ' + 'x'.repeat(380) + ' konec' + 'y'.repeat(50))],
    ];
    const recs = shRecBuild(rows);
    const longState = recs.recs.get('K5').state;
    recs.recs.delete('K5');
    const L = list();
    const r1 = shApplyRecs(L, recs.recs, { at: 5, by: 'Vedoucí' });
    const again = shApplyRecs(L, recs.recs, { at: 6, by: 'Vedoucí' });
    const older = shApplyRecs(L, shRecBuild([[c('K1'), c('21.10.2026 9:15'), c('1'), c('Staré')]]).recs, { at: 7, by: 'V' });
    // přesun: v rámci skupiny, TOP zůstanou nahoře
    const M = list();
    const ord = () => M.items.map(i => i.id).join();
    const moves = [shMoveItem(M, 'c', 2), ord(), shMoveItem(M, 'a', 0), ord(), shMoveItem(M, 't2', 0), ord(), shMoveItem(M, 't2', 5), ord(), shMoveItem(M, 'zz', 1), shMoveItem(M, 'd', 5)];
    // čištění: id unikátní v seznamu, poznámka a záznam
    const cl = cleanShortage({ lists: [{ id: 'shC', at: 1, items: [{ id: 'x1', ean: '1', name: 'A', note: ' víc\\n  řádků ', rec: { ts: '5', when: 'w', qty: 3, state: 'S', at: 'x', by: 'B', extra: 1 } }, { id: 'x1', ean: '2', name: 'B', rec: 'text' }, { id: 'bad id', ean: '3', name: 'C' }] }] }).lists[0].items;
    // historie změn: odebrání, poznámka, záznamy, pořadí
    S = sanitizeState(demoData());
    S.shortage.lists = [list()];
    const a = sanitizeState(JSON.parse(JSON.stringify(sharedState(S))));
    S = JSON.parse(JSON.stringify(a));
    const l = S.shortage.lists[0];
    l.items = l.items.filter(i => i.id !== 'b');
    l.items.find(i => i.id === 'a').note = 'Volat dodavatele';
    shApplyRecs(l, recs.recs, { at: 9, by: 'V' });
    shMoveItem(l, 'd', 2);
    const b = sharedState(S);
    const log = (x, y) => describeChanges(x, y, { at: 9, by: 'V', card: '' }).entries.filter(e => e.kind === 'shortage').map(e => e.text);
    const log1 = log(a, b);
    const b2 = JSON.parse(JSON.stringify(b));
    b2.shortage.lists[0].items.find(i => i.id === 'a').note = '';
    const longClean = cleanShortage({ lists: [{ id: 'shX', at: 1, items: [{ ean: '1', name: 'A', op: 'o'.repeat(500), rec: { ts: 1, when: 'w', qty: '1', state: 's'.repeat(500) } }] }] }).lists[0].items[0];
    return JSON.stringify({ longState, longClean: longClean.rec.state, opClean: longClean.op, rows: recs.rows, bad: recs.bad, recs: [...recs.recs.entries()], r1, again, older, recsOn: L.items.map(i => i.rec && [i.rec.qty, i.rec.state, i.rec.when, i.rec.by]), moves, cl, log1, log2: log(b, b2),
      looks: [shLooksLikeRecs(rows), shLooksLikeRecs([[c('Objednávka'), c('Název'), c('EAN')], [c('OBJ-1'), c('Hřídel'), c('859')]]), shLooksLikeRecs([[c('K1'), c('22.10.2026 9:15')]]), shLooksLikeRecs([])],
      when: ['22.10.2026 9:15', '22. 10. 2026', '31.2.2026 9:00', '22.10.2026 25:00', '2026-10-22T08:30:15', '45952.5', '12345', 'x'].map(v => { const t = shParseWhen(v); return t ? new Date(t).toISOString().slice(0, 16) + '|' + new Date(t).getHours() + ':' + new Date(t).getMinutes() : 0; }) });
  })()`));
  assert.deepStrictEqual([out.rows, out.bad], [7, 1], 'nadpisy se přeskočí, řádek bez kódu je chybný');
  assert.deepStrictEqual([out.longState.length, out.longState.endsWith('y'), out.longClean.length, out.opClean.length], [400, true, 400, 300], 'stav do 400 znaků (dřív 80), operace do 300');
  assert.deepStrictEqual(out.recs.map(([k, v]) => [k, v.qty, v.state, v.when]), [['K1', '40', 'Broušení hotovo', '22. 10. 2026 9:15'], ['K3', '12', 'Elox', '22. 10. 2026 10:30'], ['K4', '5 ks', 'Montáž', '22. 10. 2026 7:00'], ['X9', '1', '?', '22. 10. 2026 9:00'], ['K2', '3', 'Čeká', 'není datum']], 'na kód nejnovější řádek, datum jednotně, nečitelné datum jak je');
  assert.deepStrictEqual(out.r1, { matched: 4, updated: 5, same: 0, older: 0, added: 0, wpa: 0, missing: ['X9'] }, 'stejný kód u dvou položek dostane záznam u obou');
  assert.deepStrictEqual(out.again, { matched: 4, updated: 0, same: 5, older: 0, added: 0, wpa: 0, missing: ['X9'] }, 'stejné záznamy podruhé nic nemění');
  assert.deepStrictEqual(out.older, { matched: 1, updated: 0, same: 0, older: 1, added: 0, wpa: 0, missing: [] }, 'starší záznam nepřepíše novější');
  assert.deepStrictEqual(out.recsOn, [['40', 'Broušení hotovo', '22. 10. 2026 9:15', 'Vedoucí'], ['3', 'Čeká', 'není datum', 'Vedoucí'], ['12', 'Elox', '22. 10. 2026 10:30', 'Vedoucí'], ['5 ks', 'Montáž', '22. 10. 2026 7:00', 'Vedoucí'], null, ['12', 'Elox', '22. 10. 2026 10:30', 'Vedoucí']]);
  assert.deepStrictEqual(out.moves, [true, 't1,t2,c,a,b,d', true, 't1,t2,a,c,b,d', true, 't2,t1,a,c,b,d', true, 't1,t2,a,c,b,d', false, false],
    'přesun ve skupině; běžná položka nevyskočí mezi TOP, TOP nespadne pod ostatní; neznámá položka a stejné místo nic nedělají');
  assert.deepStrictEqual(out.cl.map(i => [i.note, i.rec]), [['víc řádků', { ts: 5, when: 'w', qty: '3', state: 'S', at: 0, by: 'B' }], ['', null], ['', null]], 'poznámka na jeden řádek, záznam jen známá pole');
  assert.strictEqual(out.cl[0].id, 'x1');
  assert.ok(out.cl[1].id !== 'x1' && /^si[a-z0-9]{5}$/.test(out.cl[1].id) && /^si[a-z0-9]{5}$/.test(out.cl[2].id), 'duplicitní a neplatné id položky se nahradí');
  assert.deepStrictEqual(out.log1, ['Shortage: ze seznamu 22. 10. 2026 6:00 odebrána položka 859b Díl b', 'Shortage: poznámka k položce 859a Díl a (seznam 22. 10. 2026 6:00): Volat dodavatele',
    'Shortage: poslední záznamy u 4 položek seznamu 22. 10. 2026 6:00', 'Shortage: změněno pořadí položek v seznamu 22. 10. 2026 6:00']);
  assert.deepStrictEqual(out.log2, ['Shortage: smazána poznámka k položce 859a Díl a (seznam 22. 10. 2026 6:00)']);
  assert.deepStrictEqual(out.looks, [true, false, true, false], 'poslední záznamy se poznají podle data ve sloupci B');
  assert.deepStrictEqual(out.when.map(w => w && w.split('|')[1]), ['9:15', '0:0', 0, 0, '8:30', '12:0', 0, 0], 'formáty data a času, neplatné datum 0');
});

test('Shortage (2.29): poddíly z výrobního plánu – shoda sestavy, operace Hala 2, zachování poznámek, záznamy a historie', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const L = c => 'http://is.example/commission.production.detail/default/1?activeBarcode=' + c + '&componentProductionId=2';
    const plan = shPlanBlank('plan.xlsx');
    // a EAN sestavy, e EAN poddílu, h index, m objednávka, operace, odkaz u E
    shPlanRow(plan, 8594000000101, 8594000009001, 'A', 'OBJ-1', 'Broušení – hala 2', L('9.0.1'));
    shPlanRow(plan, '8594000000101', '8594000009001', 'a', 'OBJ-1', 'Leštění - hala 2', L('9.0.1'));      // stejný poddíl, další operace
    shPlanRow(plan, '8594000000101', '8594000009002', 'A', 'OBJ-1', 'LEPENÍ 3M – HALA 2', '');             // bez odkazu
    shPlanRow(plan, '8594000000101', '8594000009003', 'A', 'OBJ-1', 'Montáž', L('9.0.3'));                // jiná operace
    shPlanRow(plan, '8594000000101', '8594000009004', 'B', 'OBJ-1', 'Brush Hala 2', L('9.0.4'));          // jiný index
    shPlanRow(plan, '8594000000101', '8594000000101', 'A', 'OBJ-1', 'Brush Hala 2', L('1.1.1'));          // sestava sama sebe
    shPlanRow(plan, '12345678905', '8594000009005', 'A', 4500001, 'řez kotoučovou pilou 2', L('9.0.5')); // EAN bez nul, objednávka číslem
    shPlanRow(plan, '8590000000002', '8590000009009', 'C', 'OBJ-2', 'Lakování', L('9.0.9'));              // jen jiná operace
    shPlanRow(plan, '', '8590000009010', 'C', 'OBJ-2', 'Brush Hala 2', L('9.1.0'));                       // bez sestavy
    const it = (id, ean, index, order, extra) => ({ id, order, name: 'Díl ' + id, ean, index, qty: '1', top: false, op: '', link: '', code: 'K' + id, note: '', rec: null, subs: [], ...(extra || {}) });
    const list = { id: 'shL', at: new Date(2026, 9, 22, 6, 0).getTime(), by: 'V', file: 'f.xlsx', sheet: '', plan: null,
      items: [it('a', '8594000000101', 'A', 'OBJ-1'), it('b', '0012345678905', 'A', '4500001'), it('c', '8590000000002', 'C', 'OBJ-2'), it('d', '8590000000003', 'D', 'OBJ-3')] };
    const r1 = shApplyPlan(list, plan);
    const subsA = list.items[0].subs.map(s => [s.ean, s.code, s.op]);
    // poznámka a záznam u poddílu přežijí další prohledání plánu
    list.items[0].subs[0].id = 'sp1'; list.items[0].subs[0].note = 'Brusič ví'; list.items[0].subs[0].rec = { ts: 1, when: 'w', qty: '2', state: 'S', at: 1, by: 'V' };
    const r2 = shApplyPlan(list, plan);
    const kept = [list.items[0].subs[0].id, list.items[0].subs[0].note, list.items[0].subs[0].rec.state];
    // poslední záznamy patří i poddílům
    const recs = shRecBuild([[{ text: '9.0.5' }, { text: '22.10.2026 9:00' }, { text: '4' }, { text: 'Řez hotový' }]]).recs;
    const ra = shApplyRecs(list, recs, { at: 5, by: 'V' });
    // čištění: poddíly s id, bez prázdných, unikátní id v celém seznamu
    const cl = cleanShortage({ lists: [{ id: 'shC', at: 1, plan: { file: 'p.xlsx', at: 7, by: 'V', x: 1 }, items: [
      { id: 'x1', ean: '1', name: 'A', subs: [{ id: 'x1', ean: '9', link: L('7.7.7'), op: ' Brush\\u0007 Hala 2 ' }, { ean: '', code: '' }, 'text'] },
      { id: 'x2', ean: '2', name: 'B', subs: 'nic' }] }] }).lists[0];
    // historie: plán, poznámka u poddílu, odebrání poddílu
    S = sanitizeState(demoData());
    S.shortage.lists = [JSON.parse(JSON.stringify({ ...list, plan: null, items: list.items.map(i => ({ ...i, subs: [] })) }))];
    const a = sanitizeState(JSON.parse(JSON.stringify(sharedState(S))));
    S = JSON.parse(JSON.stringify(a));
    const l = S.shortage.lists[0];
    shApplyPlan(l, plan); l.plan = { file: 'plan.xlsx', at: 9, by: 'V' };
    const b = sanitizeState(JSON.parse(JSON.stringify(sharedState(S))));
    const log = (x, y) => describeChanges(x, y, { at: 9, by: 'V', card: '' }).entries.filter(e => e.kind === 'shortage').map(e => e.text);
    const c = JSON.parse(JSON.stringify(b));
    c.shortage.lists[0].items[0].subs[0].note = 'Volat';
    c.shortage.lists[0].items[0].subs.splice(1, 1);
    return JSON.stringify({ r1, r2, subsA, subsB: list.items[1].subs.map(s => [s.ean, s.code, s.op]), kept, ra, recSub: list.items[1].subs[0].rec && list.items[1].subs[0].rec.state,
      cl: { plan: cl.plan, subs: cl.items.map(i => i.subs.map(s => [s.ean, s.code, s.op, /^sp[a-z0-9]{5}$/.test(s.id) || s.id])), ids: cl.items.map(i => i.id) },
      log1: log(a, b), log2: log(b, c),
      ops: ['Broušení – hala 2', 'brouseni-HALA 2', 'Frézování VF-11', 'Frézování VF 11', 'gravírování  Hala 2', 'Pískování — hala 2', 'Leštění – hala 2', 'Label Hala 2', 'Odjehlení hala 2', 'Frézování Hala 2', 'řez kotoučovou pilou 2', 'Broušení – hala 3', 'Broušení', ''].map(shSubOp),
      keys: [shPlanKey('0012345678905', ' a ', 4500001), shPlanKey(12345678905, 'A', '4500001'), shPlanKey('8594 0000 00101', 'IX-1', 'obj-1')] });
  })()`));
  assert.deepStrictEqual(out.r1, { items: 2, subs: 3, noCode: 1, other: 1, cands: 2, changed: 2 }, 'sestava a se dvěma poddíly (jeden bez odkazu), sestava b s jedním, c jen s jinou operací');
  assert.deepStrictEqual(out.subsA, [['8594000009001', '9.0.1', 'Broušení – hala 2 · Leštění - hala 2'], ['8594000009002', '', 'LEPENÍ 3M – HALA 2']], 'operace téhož poddílu se spojí, jiný index a jiná operace ne, sestava sama sebe ne');
  assert.deepStrictEqual(out.subsB, [['8594000009005', '9.0.5', 'řez kotoučovou pilou 2']], 'EAN s nulami a objednávka jako číslo se shodují');
  assert.deepStrictEqual(out.r2.changed, 0, 'druhé prohledání stejného plánu nic nemění');
  assert.deepStrictEqual(out.kept, ['sp1', 'Brusič ví', 'S'], 'poddíl, který v plánu zůstal, si nechá id, poznámku i záznam');
  assert.deepStrictEqual([out.ra.updated, out.recSub], [1, 'Řez hotový'], 'poslední záznam podle kódu poddílu');
  assert.deepStrictEqual(out.cl.plan, { file: 'p.xlsx', at: 7, by: 'V' });
  assert.deepStrictEqual(out.cl.subs, [[['9', '7.7.7', 'Brush Hala 2', true]], []], 'poddíl se vyčistí a dostane jiné id než položka; prázdný a neplatný zmizí');
  assert.deepStrictEqual(out.cl.ids, ['x1', 'x2']);
  assert.deepStrictEqual(out.log1, ['Shortage: poddíly z výrobního plánu plan.xlsx u seznamu 22. 10. 2026 6:00: 3 poddíly u 2 sestav']);
  assert.deepStrictEqual(out.log2, ['Shortage: odebrán poddíl 8594000009002 u položky 8594000000101 Díl a (seznam 22. 10. 2026 6:00)', 'Shortage: poznámka k poddílu 8594000009001 u položky 8594000000101 Díl a (seznam 22. 10. 2026 6:00): Volat']);
  assert.deepStrictEqual(out.ops, [true, true, true, true, true, true, true, true, true, true, true, false, false, false], 'operace Hala 2 bez ohledu na pomlčky, mezery, velikost písmen a diakritiku');
  assert.deepStrictEqual(out.keys, ['12345678905|A|4500001', '12345678905|A|4500001', '8594000000101|IX-1|OBJ-1']);
});

test('Shortage (2.29.1): poddíl s jinou operací přidá poslední záznam, kromě „Odesláno na WPA“', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const L = c => 'http://is.example/c?activeBarcode=' + c + '&x=1';
    const plan = shPlanBlank('plan.xlsx');
    shPlanRow(plan, '8594000000101', '8594000009001', 'A', 'OBJ-1', 'Broušení – hala 2', L('9.0.1'));
    shPlanRow(plan, '8594000000101', '8594000009003', 'A', 'OBJ-1', 'Montáž', L('9.0.3'));
    shPlanRow(plan, '8594000000101', '8594000009003', 'A', 'OBJ-1', 'Kontrola', L('9.0.3'));        // stejný poddíl, další jiná operace
    shPlanRow(plan, '8594000000101', '8594000009004', 'A', 'OBJ-1', 'Lakování', L('9.0.4'));
    shPlanRow(plan, '8594000000101', '8594000009005', 'A', 'OBJ-1', 'Lakování', '');                // bez kódu: záznam ho nenajde
    shPlanRow(plan, '8590000000002', '8590000009009', 'C', 'OBJ-2', 'Svařování', L('9.0.9'));
    const it = (id, ean, index, order) => ({ id, order, name: 'Díl ' + id, ean, index, qty: '1', top: false, op: '', link: '', code: 'K' + id, note: '', rec: null, subs: [], cands: [] });
    const list = { id: 'shL', at: new Date(2026, 9, 22, 6, 0).getTime(), by: 'V', file: 'f.xlsx', sheet: '', plan: null, items: [it('a', '8594000000101', 'A', 'OBJ-1'), it('c', '8590000000002', 'C', 'OBJ-2')] };
    const p1 = shApplyPlan(list, plan);
    const before = [list.items[0].subs.map(s => s.code), list.items[0].cands.map(c => [c.code, c.op]), list.items[1].cands.map(c => c.code)];
    const rows = [
      [{ text: '9.0.3' }, { text: '22.10.2026 9:00' }, { text: '4' }, { text: 'Montáž hotová' }],
      [{ text: '9.0.4' }, { text: '22.10.2026 9:30' }, { text: '2' }, { text: 'Odesláno na WPA' }],
      [{ text: '9.0.9' }, { text: '22.10.2026 10:00' }, { text: '1' }, { text: 'odesláno  na  WPA – kamion 2' }],
      [{ text: '9.0.1' }, { text: '22.10.2026 10:00' }, { text: '6' }, { text: 'Brus' }],
      [{ text: '7.7.7' }, { text: '22.10.2026 10:00' }, { text: '1' }, { text: 'Jinde' }],
    ];
    const r = shApplyRecs(list, shRecBuild(rows).recs, { at: 5, by: 'V' });
    const after = [list.items[0].subs.map(s => [s.code, s.op, s.byRec, s.rec && s.rec.state]), list.items[0].cands.map(c => c.code), list.items[1].subs.length, list.items[1].cands.map(c => c.code)];
    // id a čištění
    S = sanitizeState(demoData());
    S.shortage.lists = [JSON.parse(JSON.stringify(list))];
    const a = sanitizeState(JSON.parse(JSON.stringify(sharedState(S))));
    const cl = a.shortage.lists[0].items[0];
    // další prohledání plánu: poddíl přidaný podle záznamu zůstane (s poznámkou), dokud je v plánu
    const l2 = JSON.parse(JSON.stringify(a.shortage.lists[0]));
    l2.items[0].subs.find(s => s.byRec).note = 'Hotovo';
    shApplyPlan(l2, plan);
    const keep = l2.items[0].subs.map(s => [s.code, s.byRec, s.note]);
    const plan2 = shPlanBlank('plan2.xlsx');
    shPlanRow(plan2, '8594000000101', '8594000009001', 'A', 'OBJ-1', 'Broušení – hala 2', L('9.0.1'));
    shApplyPlan(l2, plan2);
    const gone = l2.items[0].subs.map(s => s.code);
    // historie: přidání podle záznamu
    const b = JSON.parse(JSON.stringify(a));
    shApplyRecs(b.shortage.lists[0], shRecBuild([[{ text: '9.0.4' }, { text: '22.10.2026 11:00' }, { text: '2' }, { text: 'Lakovna' }]]).recs, { at: 6, by: 'V' });
    const b2 = sanitizeState(b);
    const log = describeChanges(a, b2, { at: 9, by: 'V', card: '' }).entries.filter(e => e.kind === 'shortage').map(e => e.text);
    const junk = cleanShortage({ lists: [{ id: 'shJ', at: 1, items: [{ ean: '1', name: 'A', cands: [{ ean: '2', code: '3.3.3', op: 'X', link: 'javascript:x' }, { ean: '4', code: '' }, 'x'], subs: [{ ean: '5', code: '5.5.5', byRec: 'ano' }] }] }] }).lists[0].items[0];
    return JSON.stringify({ p1, before, r, after, ids: cl.subs.every(s => /^sp[a-z0-9]{5}$/.test(s.id)), byRecKept: cl.subs.map(s => s.byRec), keep, gone, log, junk: [junk.cands, junk.subs.map(s => s.byRec)],
      wpa: ['Odesláno na WPA', 'ODESLANO NA WPA', 'odesláno-na-WPA', 'Odesláno na WPA2', 'Odesláno', 'Na WPA', ''].map(shWpa) });
  })()`));
  assert.deepStrictEqual(out.p1.cands, 3, 'tři čekající poddíly s kódem (bez kódu se neuloží)');
  assert.deepStrictEqual(out.before, [['9.0.1'], [['9.0.3', 'Montáž · Kontrola'], ['9.0.4', 'Lakování']], ['9.0.9']], 'čekající poddíly se nezobrazují');
  assert.deepStrictEqual([out.r.added, out.r.wpa, out.r.updated, out.r.missing], [1, 2, 1, ['7.7.7']], 'záznam přidá poddíl, „Odesláno na WPA“ ne, kód mimo plán chybí');
  assert.deepStrictEqual(out.after, [[['9.0.1', 'Broušení – hala 2', false, 'Brus'], ['9.0.3', 'Montáž · Kontrola', true, 'Montáž hotová']], ['9.0.4'], 0, ['9.0.9']], 'přidaný poddíl má záznam a operaci z plánu; „Odesláno na WPA“ dál čeká');
  assert.deepStrictEqual([out.ids, out.byRecKept], [true, [false, true]]);
  assert.deepStrictEqual(out.keep, [['9.0.1', false, ''], ['9.0.3', true, 'Hotovo']], 'po dalším prohledání plánu poddíl z záznamu zůstane i s poznámkou');
  assert.deepStrictEqual(out.gone, ['9.0.1'], 'když ho nový plán nemá, zmizí');
  assert.deepStrictEqual(out.log, ['Shortage: podle posledního záznamu přidán poddíl 8594000009004 u položky 8594000000101 Díl a (seznam 22. 10. 2026 6:00)'], 'přidání podle záznamu (záznam je jeho součástí)');
  assert.deepStrictEqual(out.junk, [[{ ean: '2', link: '', code: '3.3.3', op: 'X' }], [false]], 'čištění čekajících poddílů');
  assert.deepStrictEqual(out.wpa, [true, true, true, true, false, false, false], 'stav obsahuje „Odesláno na WPA“ bez ohledu na velikost písmen, diakritiku a pomlčky');
});

test('Shortage (2.29.1): skrýt v PDF – čištění, zachování při dalším prohledání plánu, historie', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const L = c => 'http://is.example/c?activeBarcode=' + c + '&x=1';
    const cl = cleanShortage({ lists: [{ id: 'shH', at: new Date(2026, 9, 22, 6, 0).getTime(), items: [
      { id: 'a', ean: '8594000000101', name: 'A', index: 'A', order: 'OBJ-1', pdfHide: true, subs: [{ id: 'sx', ean: '9', code: '9.9.9', pdfHide: 'ano' }] },
      { id: 'b', ean: '2', name: 'B', pdfHide: 1 }] }] }).lists[0];
    const plan = shPlanBlank('p.xlsx');
    shPlanRow(plan, '8594000000101', '8594000009001', 'A', 'OBJ-1', 'Brush Hala 2', L('9.0.1'));
    const l = JSON.parse(JSON.stringify(cl));
    shApplyPlan(l, plan);
    l.items[0].subs[0].pdfHide = true;
    shApplyPlan(l, plan);
    const kept = l.items[0].subs[0].pdfHide;
    S = sanitizeState(demoData());
    S.shortage.lists = [JSON.parse(JSON.stringify(l))];
    const a = sanitizeState(JSON.parse(JSON.stringify(sharedState(S))));
    const b = JSON.parse(JSON.stringify(a));
    b.shortage.lists[0].items[0].pdfHide = false;
    b.shortage.lists[0].items[1].pdfHide = true;
    b.shortage.lists[0].items[0].subs[0].pdfHide = false;
    const log = describeChanges(a, b, { at: 9, by: 'V', card: '' }).entries.filter(e => e.kind === 'shortage').map(e => e.text);
    return JSON.stringify({ items: cl.items.map(i => i.pdfHide), subs: cl.items[0].subs.map(s => s.pdfHide), kept, log });
  })()`));
  assert.deepStrictEqual([out.items, out.subs], [[true, false], [false]], 'skryto jen při true');
  assert.strictEqual(out.kept, true, 'skrytý poddíl zůstane skrytý po dalším prohledání plánu');
  assert.deepStrictEqual(out.log, ['Shortage: položka 8594000000101 A znovu v PDF (seznam 22. 10. 2026 6:00)', 'Shortage: položka 2 B skryta v PDF (seznam 22. 10. 2026 6:00)', 'Shortage: poddíl 8594000009001 u položky 8594000000101 A znovu v PDF (seznam 22. 10. 2026 6:00)']);
});

test('Servis (2.22): rok výroby a vzory zařízení (druh, značka, model)', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    const svc = S.service;
    const a = sharedState(S);
    const r = svSaveShipment(svc, { date: '2026-10-20', items: [{ ...blankSvItem(), kind: 'Bruska', brand: 'Makita', model: 'GA5030', made: '2019', iid: 'B-1' }] }, {});
    const r2 = svSaveShipment(svc, { date: '2026-11-20', items: [{ ...blankSvItem(), iid: 'B 1' }] }, {});
    const t1 = svAddTemplate(svc, { kind: ' Bruska ', brand: 'Makita', model: 'GA5030' });
    const t2 = svAddTemplate(svc, { kind: 'bruska', brand: 'MAKITA', model: 'ga5030' });
    const t3 = svAddTemplate(svc, { kind: '', brand: '', model: '' });
    svAddTemplate(svc, { kind: 'Vrtačka', brand: 'Bosch', model: '' });
    const b = sharedState(S);
    const log = describeChanges(a, b, { at: 1, by: 'V', card: '' }).entries.map(e => e.text).filter(t => /vzor/.test(t));
    svc.templates = svc.templates.filter(t => t.brand !== 'Bosch');
    const log2 = describeChanges(b, sharedState(S), { at: 2, by: 'V', card: '' }).entries.map(e => e.text);
    const dirty = cleanService({ templates: [{ kind: 'A' }, { kind: 'a ' }, { kind: '', brand: '' }, { id: '<x>', model: 'M', extra: 1 }], devices: [{ made: '1999-01-01-x' }] });
    JSON.stringify({ made: [r.ship.items[0].made, svc.devices[0].made, r2.ship.items[0].made], t: [t1.existed, t2.existed, t3, svc.templates.length], log, log2,
      dirty: [dirty.templates.map(t => [t.kind, t.model, Object.keys(t).length, /^[A-Za-z0-9_-]+$/.test(t.id)]), dirty.devices[0].made] })`));
  assert.deepStrictEqual(out.made, ['2019', '2019', ''], 'rok výroby v položce a evidenci, prázdný v další položce evidenci nesmaže');
  assert.deepStrictEqual(out.t, [false, true, null, 1], 'vzor se stejným druhem, značkou a modelem (bez ohledu na velikost písmen) se nepřidá podruhé, prázdný vůbec (po smazání vzoru Bosch zbyl jeden)');
  assert.deepStrictEqual(out.log, ['Servis: nový vzor zařízení Bruska · Makita GA5030', 'Servis: nový vzor zařízení Vrtačka · Bosch']);
  assert.deepStrictEqual(out.log2, ['Servis: smazán vzor zařízení Vrtačka · Bosch']);
  assert.deepStrictEqual(out.dirty, [[['A', '', 4, true], ['', 'M', 4, true]], '1999-01-01'], 'čištění vzorů: bez duplicit, prázdných a cizích polí; rok výroby nejvýš 10 znaků');
  return null;
});

test('Servis (2.22.1): duplicity v protokolu a v evidenci', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    const dev = (id, o) => ({ id, kind: 'Bruska', brand: 'Makita', model: 'GA', iid: '', sn: '', iidBad: false, snBad: false, mark: '', ...o });
    const svc = { devices: [dev('dv1', { iid: 'B-12', sn: 'SN-1' }), dev('dv2', { kind: 'Pila', iidBad: true, snBad: true, mark: 'S-01' }), dev('dv3', { kind: 'Vrtačka', iid: 'B-13', sn: 'SN-2' })], shipments: [], templates: [] };
    const it = o => ({ ...blankSvItem(), ...o });
    const items = [
      it({ iid: 'A-1' }),                                 // 0: nové zařízení
      it({ iid: 'b 12' }),                                // 1: dv1 podle ID (jinak zapsané)
      it({}),                                             // 2: prázdná položka se nepočítá
      it({ sn: 'sn1' }),                                  // 3: dv1 podle výrobního čísla
      it({ iid: 'a1', sn: 'X' }),                         // 4: stejné ID jako 0
      it({ iidBad: true, snBad: true, mark: 's01' }),     // 5: dv2 podle označení
      it({ dev: 'dv2', kind: 'Pila', iidBad: true, snBad: true, mark: 'S-01' }), // 6: dv2 vybraná z evidence
      it({ sn: 'A-1' }),                                  // 7: výrobní číslo A-1 není interní ID A-1
      it({ iid: 'B-13', sn: 'SN-2', iidBad: true }),      // 8: ID nečitelné, text se nepočítá; dv3 podle v. č.
      it({ iid: 'B-13', sn: 'SN-1' })                     // 9: dv3 podle ID (jako 8), v. č. jako 3 (ta ID nemá)
    ];
    const c = svDupCheck(svc, items);
    const order = svDupOrder(items.length, c.groups, c.clash);
    const one = svDupCheck(svc, [it({ dev: 'dv1', iid: 'B-12', sn: 'SN-1' }), it({ iid: 'Z-9' })]);
    // ID brusky, výrobní číslo zařízení bez čitelného ID: uložení by obě zařízení spojilo
    const cl = svDupCheck({ devices: [...svc.devices, dev('dv7', { kind: 'Pila', iidBad: true, sn: 'SN-7' })] }, [it({ iid: 'B-12', sn: 'SN-7' })]).clash;
    // duplicita, která už v evidenci je, protokol neblokuje
    const reg = { devices: [...svc.devices, dev('dv4', { iid: 'b12' }), dev('dv5', { sn: 'sn-2' }), dev('dv6', { iid: 'Q' }), dev('dv7', { iid: 'Z-1', sn: 'SN-1' })] };
    const keep = svDupCheck(reg, [it({ dev: 'dv1', iid: 'B-12', sn: 'SN-1' })]);
    JSON.stringify({ groups: c.groups, clash: c.clash.map(x => [x.i, x.dev.id, x.what]), cl: cl.map(x => [x.i, x.dev.id, x.what]), order, one: [one.groups.length, one.clash.length],
      regDups: svDevDups(reg).groups, keep: [keep.groups.length, keep.clash.length], nums: [svDupOrder(3, [], [])] })`));
  assert.deepStrictEqual(out.groups.map(g => g.idx), [[0, 4], [1, 3, 8, 9], [5, 6]], 'skupiny: stejné ID (i jinak zapsané), stejné zařízení z evidence podle ID a v. č. (9 spojí dv1 a dv3), označení; prázdná, v. č. proti ID a nečitelné ID se nepočítají');
  assert.strictEqual(out.groups[0].why, 'stejné interní ID A-1');
  assert.match(out.groups[1].why, /^stejné (výrobní číslo SN-1|zařízení z evidence: Bruska · Makita GA \(ID B-12 · v\. č\. SN-1\))$/);
  assert.strictEqual(out.groups[2].why, 'stejné dodatečné označení s01');
  assert.deepStrictEqual(out.clash, [], 'ID dv3 a výrobní číslo dv1 (ta má jiné ID): jiná zařízení, žádná duplicita (2.22.2)');
  assert.deepStrictEqual(out.cl, [[0, 'dv7', 'výrobní číslo SN-7']], 'ID brusky a výrobní číslo zařízení bez čitelného ID: uložení by je v evidenci spojilo');
  assert.deepStrictEqual(out.order, [0, 4, 1, 3, 8, 9, 5, 6, 2, 7], 'duplicity nahoru pod sebe, ostatní v původním pořadí');
  assert.deepStrictEqual(out.one, [0, 0], 'bez duplicit nic');
  assert.deepStrictEqual(out.regDups, [{ ids: ['dv1', 'dv4'], why: 'stejné interní ID B-12' }, { ids: ['dv3', 'dv5'], why: 'stejné výrobní číslo SN-2' }], 'duplicity v evidenci (dv7 má stejné v. č. jako dv1, ale jiné ID)');
  assert.deepStrictEqual(out.keep, [0, 0], 'duplicita, která už v evidenci je, odeslání nezablokuje');
  assert.deepStrictEqual(out.nums, [[0, 1, 2]]);
  return null;
});

test('Servis (2.22.2): interní ID rozhoduje, úprava protokolu bez falešných duplicit', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    const it = o => ({ ...blankSvItem(), ...o });
    const draftOf = x => ({ id: x.id, date: x.date, to: x.to, note: x.note, items: x.items.map(i => ({ ...i })) });   // jako svDraftOf v app.js
    const svc = blankService();
    // nový protokol: různá interní ID, stejné výrobní číslo → dvě zařízení, žádná duplicita
    const fresh = [it({ kind: 'Bruska', iid: 'B-1', sn: '?' }), it({ kind: 'Bruska', iid: 'B-2', sn: '?' }), it({ kind: 'Bruska', iid: 'B-3', sn: 'SN-3' })];
    const c0 = svDupCheck(svc, fresh);
    const r1 = svSaveShipment(svc, { date: '2026-10-19', items: fresh }, {});
    const d = n => svc.devices.find(x => x.iid === n);
    // úprava: prohození výrobních čísel mezi B-1 a B-3, cestou je SN-3 dvakrát
    const ed = draftOf(r1.ship);
    ed.items[0].sn = 'SN-3';
    const mid = svDupCheck(svc, ed.items);
    ed.items[2].sn = '?';
    svSaveShipment(svc, ed, {});
    const swapped = [d('B-1').sn, d('B-2').sn, d('B-3').sn, svc.devices.length];
    // ID opravené v evidenci: úprava starého protokolu (jen servis) ho nepřepíše zpátky
    d('B-2').iid = 'B-20';
    const ed2 = draftOf(r1.ship); ed2.to = 'Servis Ostrava';
    const c2 = svDupCheck(svc, ed2.items);
    svSaveShipment(svc, ed2, {});
    const kept = [svc.devices.map(x => x.iid).join(), r1.ship.items[1].iid, r1.ship.to];
    // oprava ID v protokolu (jediná položka u zařízení): evidence se opraví
    const ed3 = draftOf(r1.ship); ed3.items[2].iid = 'B-30';
    svSaveShipment(svc, ed3, {});
    const fixed = [svc.devices.map(x => x.iid).join(), svc.devices.length];
    // verze 2.21/2.22 spojila dvě položky se stejným v. č. do jednoho zařízení (druhá přepsala ID)
    const leg = blankService();
    leg.devices.push({ id: 'dvL', kind: 'Bruska', brand: '', model: '', made: '', iid: 'A-2', sn: 'S', iidBad: false, snBad: false, mark: '', note: '', at: 0, by: '' });
    leg.shipments.push({ id: 'svL', no: 1, year: 2026, date: '2026-10-01', to: '', note: '', by: '', at: 0, items: [it({ dev: 'dvL', kind: 'Bruska', iid: 'A-1', sn: 'S' }), it({ dev: 'dvL', kind: 'Bruska', iid: 'A-2', sn: 'S' })] });
    const ld = draftOf(leg.shipments[0]);
    const lc = svDupCheck(leg, ld.items);
    const lr = svSaveShipment(leg, ld, {});
    const legOut = [lc.groups.length, lc.clash.length, lr.created.length, leg.devices.map(x => x.iid).join(), leg.shipments[0].items.map(i => leg.devices.find(x => x.id === i.dev).iid).join(),
      svHistory(leg, 'dvL').count];
    // hledání v evidenci: podle v. č. jen zařízení bez jiného čitelného ID
    const f = [svFindDevice(svc, { iid: 'Z-9', sn: 'SN-3' }), (svFindDevice(svc, { iidBad: true, sn: 'sn3' }) || {}).iid, svSameKey({ iid: 'A' , sn: 'S' }, { iid: 'B', sn: 'S' }), svSameKey({ iidBad: true, sn: 'S' }, { iid: 'B', sn: 's' })];
    JSON.stringify({ c0: [c0.groups.length, c0.clash.length], r1: r1.created.length, mid: [mid.groups.length, mid.clash.length], swapped, c2: [c2.groups.length, c2.clash.length], kept, fixed, legOut, f })`));
  assert.deepStrictEqual(out.c0, [0, 0], 'různá interní ID se stejným výrobním číslem nejsou duplicita');
  assert.strictEqual(out.r1, 3, 'tři zařízení v evidenci');
  assert.deepStrictEqual(out.mid, [0, 0], 'prohazování výrobních čísel při úpravě nehlásí duplicitu');
  assert.deepStrictEqual(out.swapped, ['SN-3', '?', '?', 3], 'čísla prohozená v evidenci, žádné zařízení navíc');
  assert.deepStrictEqual(out.c2, [0, 0]);
  assert.deepStrictEqual(out.kept, ['B-1,B-20,B-3', 'B-2', 'Servis Ostrava'], 'starý protokol nepřepíše ID opravené v evidenci, sám zůstane snímkem');
  assert.deepStrictEqual(out.fixed, ['B-1,B-20,B-30', 3], 'oprava ID v protokolu opraví evidenci');
  assert.deepStrictEqual(out.legOut, [0, 0, 1, 'A-2,A-1', 'A-1,A-2', 1], 'spojená zařízení ze starší verze: bez duplicity, po uložení má A-1 vlastní zařízení');
  assert.deepStrictEqual(out.f, [null, 'B-1', '', 's:S'], 'hledání a shoda podle pravidla „interní ID rozhoduje“ (SN-3 má po prohození B-1)');
  return null;
});

test('Kapacita (2.23): v zaškolování zvlášť od schopných', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(blank());
    const sk = [{ id: 'k1', name: 'Obsluha' }, { id: 'k2', name: 'Seřízení' }];
    S.positions = [{ id: 'g1', name: 'CNC', dept: 'CNC', skillset: sk, maxTab: 8, tiers: [], penalty: [], bonus: [], plan: { v: 10, unit: 'ks' } },
      { id: 'g2', name: 'Brusič', dept: 'Brusič', skillset: [{ id: 'b1', name: 'Broušení' }], maxTab: 8, tiers: [], penalty: [], bonus: [] }];
    S = sanitizeState(S);
    const add = (key, o) => { S.employees[key] = { key, first: key, last: key, ...o }; };
    add('a', { positionId: 'g1', shift: 'S1', rate: { k1: 4, k2: 3 } });   // schopný
    add('b', { positionId: 'g1', shift: 'S2', rate: { k1: 3, k2: 1 } });   // průměr 2 → v zaškolování, k1 schopný
    add('c', { positionId: 'g1', shift: 'S2' });                           // nový, všude 0 → v zaškolování
    add('d', { positionId: 'g2', shift: 'S1', rate: { k1: 2 } });           // odjinud, zaučuje se na k1
    add('e', { positionId: 'g2', shift: 'S2', rate: { k1: 0, b1: 4 } });    // odjinud, k1 neumí → nepočítá se
    add('f', { positionId: 'g1', shift: 'S1', rate: { k1: 1 }, sick: true }); // nemoc → nikam
    const cap = capacity([], 3, []);
    const g = cap.groups.find(x => x.p.id === 'g1');
    const k1 = g.skills.find(x => x.s.id === 'k1'), k2 = g.skills.find(x => x.s.id === 'k2');
    const plan = groupPlan(S.positions[0], 'A', 5, 3), old = groupPlan(S.positions[0], 'A', 5);
    JSON.stringify({ k1: [k1.by.S1.n, k1.by.S1.tr, k1.by.S2.n, k1.by.S2.tr, k1.A.am, k1.A.amT, k1.A.pm, k1.A.pmT, k1.training],
      k2: [k2.by.S1.n, k2.by.S2.tr, k2.B.amT, k2.B.pmT], g: [g.members, g.ok, g.training, g.bySh.S2.ok],
      plan: [plan.am, plan.pm, plan.ok.am, plan.ok.pm, plan.tr.am, plan.tr.pm, plan.tr.amN, plan.tr.pmN, plan.ok.week, plan.tr.week], old: [old.am, old.pm, old.ok, old.tr] })`));
  // k1 (práh 3): S1 schopný a, zaučuje se d (2); S2 schopný b, v zaškolování c (člen s 0); e (0, odjinud) se nepočítá
  assert.deepStrictEqual(out.k1, [1, 1, 1, 1, 1, 1, 1, 1, 2], 'k1: schopní a v zaškolování zvlášť po směnách');
  assert.deepStrictEqual(out.k2, [1, 2, 2, 0], 'k2: b (1) a c (0) jsou ve skupině 2 v zaškolování (ve variantě B ráno)');
  assert.deepStrictEqual(out.g, [3, 1, 2, 0], 'skupina: schopný jen a (průměr aspoň 3), nemocný f se nepočítá');
  assert.deepStrictEqual(out.plan, [10, 20, 10, 0, 0, 20, 0, 2, 50, 100], 'plánovaná kapacita: schopní a v zaškolování zvlášť, celkem beze změny');
  assert.deepStrictEqual(out.old, [10, 20, null, null], 'bez prahu jako dřív (úvod a Audit)');
  return null;
});

test('Není nutností (2.25): čtvrtinová váha v procentu, tabáky, prémie, kapacity, rizika, čištění a historie', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    // beze změny pro data bez nepovinných dovedností: stejné číslo jako prostý průměr do verze 2.24
    let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    S = sanitizeState(blank());
    let same = 0, diff = [];
    for (let n = 1; n <= 7; n++) for (let t = 0; t < 60; t++) {
      const p = { skillset: Array.from({ length: n }, (_, i) => ({ id: 'q' + i, name: 'q' })) }, e = { rate: {} };
      p.skillset.forEach(x => { const v = Math.floor(rnd() * 5); if (v) e.rate[x.id] = v; });
      const old = p.skillset.reduce((a, x) => a + rateOf(e, x.id), 0) / (n * 4) * 100;
      if (skillPct(e, p) === old) same++; else diff.push([n, skillPct(e, p), old]);
    }
    S.positions = [{ id: 'g1', name: 'CNC', dept: 'CNC', skillset: [{ id: 'k1', name: 'Obsluha' }, { id: 'k2', name: 'Programování', opt: true }, { id: 'k3', name: 'Seřízení', opt: 'ano' }],
      maxTab: 8, tiers: [{ id: 't1', name: 'Prémie', minSkill: 3, raise: 10 }], penalty: [], bonus: [] },
      { id: 'g2', name: 'Vše nepovinné', dept: 'X', skillset: [{ id: 'm1', name: 'a', opt: true }, { id: 'm2', name: 'b', opt: true }], maxTab: 8, tiers: [], penalty: [], bonus: [] }];
    S = sanitizeState(S);
    const [g1, g2] = S.positions;
    const add = (key, o) => { S.employees[key] = { key, first: key, last: key, ...o }; };
    add('a', { positionId: 'g1', shift: 'S1', rate: { k1: 4, k3: 4 } });          // nepovinná na 0
    add('b', { positionId: 'g1', shift: 'S2', rate: { k1: 3, k2: 4, k3: 3 } });
    add('c', { positionId: 'g1', shift: 'R', rate: { k1: 4, k3: 3 } });
    add('d', { positionId: 'g2', shift: 'O', rate: { m1: 4 } });                  // všechny nepovinné = prostý průměr
    add('e', { positionId: 'g1', shift: 'S2', rate: { k1: 4, k2: 4 } });          // nutná k3 na 0 → v zaškolování
    const E = S.employees, pct = k => Math.round(skillPct(E[k], posOf(E[k])) * 1000) / 1000;
    const chk = k => { const c = tierChecks(g1.tiers[0], E[k], { pos: g1 }, null, '2026-10')[0]; return [c.label, c.ok]; };
    const cap = capacity([], 3, []), g = cap.groups.find(x => x.p.id === 'g1');
    S.capReport = { ...blankCapReport(), s1am: '2026-W42', thr: 3 };
    const day = staffDay('2026-10-12'), risks = day.depts.find(r => r.dept === 'CNC').risks.map(r => r.slot + ':' + r.skill).sort();
    const calc = { pct: ['a', 'b', 'c', 'd', 'e'].map(pct), base: ['a', 'b', 'c', 'e'].map(k => levelOf(E[k]).base), min: ['a', 'c', 'd'].map(k => minRate(E[k], posOf(E[k]))),
      need: [needSkills(g1).map(x => x.id), needSkills(g2).map(x => x.id)], prem: [chk('a'), chk('c'), chk('e')] };
    // historie změn a čištění
    const before = sharedState(S);
    g1.skillset[0].opt = true;
    const log1 = describeChanges(before, sharedState(S), { at: 1, by: 'V', card: '' }).entries.map(x => x.text).filter(t => /Obsluha/.test(t));
    const mid = sharedState(S);
    delete g1.skillset[0].opt; g1.skillset.push({ id: 'k4', name: 'Údržba', opt: true });
    const log2 = describeChanges(mid, sharedState(S), { at: 2, by: 'V', card: '' }).entries.map(x => x.text).filter(t => /Obsluha|Údržba/.test(t));
    const legend = matrixSheets().find(x => x.name === 'Popis dovedností').rows, roster = rosterSheets().posSheet;
    return JSON.stringify({ same, diff: diff.slice(0, 3), opts: g1.skillset.slice(0, 3).map(x => x.opt === true), stored: Object.keys(sanitizeState(S).positions[0].skillset[2]),
      ...calc,
      cap: { rows: g.skills.map(r => r.opt), opt: g.opt, ok: g.ok, tr: g.training, A: g.score.A, B: g.score.B, none: g.score.none, weaker: g.score.weaker },
      risks, log1, log2,
      detail: ['all', 'none', 'need', 'xx', undefined].map(d => sanitizeState({ capReport: { detail: d } }).capReport.detail || '-').concat('detail' in blankCapReport() ? 'v prázdném' : '-'),
      legend: [legend[0][legend[0].length - 1], legend.find(r => r[1] === 'Programování').slice(-1)[0], legend.find(r => r[1] === 'Obsluha').slice(-1)[0]],
      roster: [roster[0].slice(-1)[0], roster.find(r => r[2] === 'Údržba').slice(-1)[0]],
      conds: [tierConds(g1.tiers[0], g1)[0], tierConds(g1.tiers[0], S.positions[1])[0] || ''] });
  })()`));
  assert.strictEqual(out.same, 420, `bez nepovinných dovedností se procento nezmění: ${JSON.stringify(out.diff)}`);
  assert.deepStrictEqual(out.opts, [false, true, false], 'jen opt: true je nepovinná (text „ano“ ne)');
  assert.deepStrictEqual(out.stored, ['id', 'name', 'desc', 'scale'], 'nutná dovednost se ukládá beze změny tvaru');
  // a: (4 + ¼·0 + 4) / (2,25 · 4) = 88,9 %; bez váhy by měl 66,7 %
  assert.deepStrictEqual(out.pct, [88.889, 77.778, 77.778, 50, 55.556], 'vážený průměr: nepovinná dovednost má čtvrtinovou váhu; všechny nepovinné = prostý průměr');
  assert.deepStrictEqual(out.base, [7, 6, 6, 4], 'tabáky = maximum × vážené procento (a: 8 × 88,9 % = 7, bez váhy by bylo 5)');
  assert.deepStrictEqual(out.min, [4, 3, 0], 'nejnižší úroveň jen z nutných dovedností; když jsou všechny nepovinné, ze všech');
  assert.deepStrictEqual(out.need, [['k1', 'k3'], ['m1', 'm2']]);
  assert.deepStrictEqual(out.prem, [['všechny nutné dovednosti aspoň na úrovni 3', true], ['všechny nutné dovednosti aspoň na úrovni 3', true], ['všechny nutné dovednosti aspoň na úrovni 3', false]],
    'prémie „všechny dovednosti aspoň 3“ nepovinnou dovednost nevyžaduje (c má Programování na 0), nutnou ano (e má Seřízení na 0)');
  assert.deepStrictEqual(out.cap, { rows: [false, true, false], opt: 1, ok: 3, tr: 1,
    A: { am: 2, pm: 1, amT: 0, pmT: 1, amTs: 0, pmTs: 5 / 9 * 100 / 75 }, B: { am: 2, pm: 1, amT: 1, pmT: 0, amTs: 5 / 9 * 100 / 75, pmTs: 0 }, none: { n: 0, tr: 0, trS: 0 }, weaker: 'S2' },
    'celkové skóre: schopní podle váženého procenta na ranní a odpolední v obou variantách, v zaškolování zvlášť; slabší skupina 2 (stejně schopných, nižší průměr)');
  assert.ok(!out.risks.some(r => /Programování/.test(r)), `nepovinná dovednost není riziko směny: ${out.risks}`);
  assert.ok(out.risks.includes('pm:Seřízení'), `nutná dovednost riziko zůstává: ${out.risks}`);
  assert.deepStrictEqual(out.log1, ['Skupina CNC: dovednost „Obsluha“ není nutností (v procentu skupiny čtvrtinová váha)']);
  assert.deepStrictEqual(out.log2.sort(), ['Skupina CNC: dovednost „Obsluha“ je zase nutná', 'Skupina CNC: nová dovednost „Údržba“ (není nutností)'].sort());
  assert.deepStrictEqual(out.detail, ['all', 'none', '-', '-', '-', '-'], 'report kapacit: rozpis dovedností se ukládá, jen když není výchozí (nutné)');
  assert.deepStrictEqual(out.legend, ['Nutnost', 'není nutností (váha ¼)', 'nutná'], 'Excel matice: sloupec Nutnost');
  assert.deepStrictEqual(out.roster, ['Nutnost', 'není nutností (váha ¼)'], 'Excel zařazení: sloupec Nutnost');
  assert.deepStrictEqual(out.conds, ['všechny nutné dovednosti aspoň 3', 'všechny dovednosti aspoň 3'], 'pravidla prémie (Excel, PDF): u skupiny s nepovinnými dovednostmi „nutné“, když jsou nepovinné všechny, platí všechny');
  return null;
});

test('Kapacita (2.25.2): průměr zaškolení pracovníků v zácviku, 100 % = úroveň zkušeného pracovníka', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    S = sanitizeState(blank());
    S.positions = [{ id: 'g1', name: 'CNC', dept: 'Obrobna', skillset: [{ id: 'k1', name: 'a' }, { id: 'k2', name: 'b' }], maxTab: 8, tiers: [], penalty: [], bonus: [] },
      { id: 'g2', name: 'Fréza', dept: 'Obrobna', skillset: [{ id: 'f1', name: 'c' }], maxTab: 8, tiers: [], penalty: [], bonus: [] }];
    S = sanitizeState(S);
    const add = (key, o) => { S.employees[key] = { key, first: key, last: key, note: '', ...o }; };
    add('a', { positionId: 'g1', shift: 'S1', rate: { k1: 4, k2: 4 } });   // zkušený
    add('b', { positionId: 'g1', shift: 'S1', rate: { k1: 2, k2: 2 } });   // 50 % ÷ 75 % = 66,7 %
    add('c', { positionId: 'g1', shift: 'S2', rate: { k1: 1, k2: 1 } });   // 25 % ÷ 75 % = 33,3 %
    add('d', { positionId: 'g1', shift: 'S2' });                           // 0 %
    add('e', { positionId: 'g2', shift: 'R', rate: { f1: 2 } });           // 50 % ÷ 75 % = 66,7 %
    const at = thr => { const cap = capacity([], thr, []), g = cap.groups.find(x => x.p.id === 'g1'), d = capScoreByDept(cap)[0];
      return { g: [g.training, trainAvg(g.trS, g.training)], A: [trainAvg(g.score.A.amTs, g.score.A.amT), trainAvg(g.score.A.pmTs, g.score.A.pmT)],
        dept: [d.total.training, trainAvg(d.total.trS, d.total.training), trainAvg(d.total.A.amTs, d.total.A.amT)] }; };
    return JSON.stringify({ t3: at(3), t2: at(2), none: trainAvg(0, 0) });
  })()`));
  assert.deepStrictEqual(out.t3.g, [3, 33.3], 'CNC: v zácviku b, c, d; průměr (66,7 + 33,3 + 0) ÷ 3 = 33,3 %');
  assert.deepStrictEqual(out.t3.A, [66.7, 16.7], 'varianta A: ráno skupina 1 (b 66,7 %), odpoledne skupina 2 (c a d: 16,7 %)');
  assert.deepStrictEqual(out.t3.dept, [4, 41.7, 66.7], 'oddělení Obrobna: CNC i Fréza dohromady (e 66,7 % ráno se stálou ranní)');
  assert.deepStrictEqual(out.t2.g, [2, 25], 'při úrovni 2 (cíl 50 %) je b zkušený; c 50 %, d 0 % → 25 %');
  assert.strictEqual(out.none, null, 'bez lidí v zácviku není průměr');
  return null;
});

test('Plán a skutečnost podle docházky (2.24)', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(blank());
    const sk = [{ id: 'k1', name: 'Obsluha' }];
    S.positions = [{ id: 'g1', name: 'CNC', dept: 'CNC', skillset: sk, maxTab: 8, tiers: [], penalty: [], bonus: [] },
      { id: 'g2', name: 'Brusič', dept: 'Brusič', skillset: [{ id: 'b1', name: 'Broušení' }], maxTab: 8, tiers: [], penalty: [], bonus: [] }];
    S = sanitizeState(S);
    const days = Array.from({ length: 30 }, (_, i) => '2026-09-' + String(i + 1).padStart(2, '0'));
    const rows = {};
    const att = (key, first, last, cells) => { const h = days.map(() => 0), c = days.map(() => null);
      Object.entries(cells).forEach(([d, v]) => { const i = +d - 1; if (typeof v === 'number') h[i] = v; else { const x = parseHours(v); h[i] = x.h; c[i] = x.code; } }); rows[key] = { first, last, h, c }; };
    const add = (key, o) => { S.employees[key] = { key, first: key, last: key, note: '', ...o }; };
    add('a', { positionId: 'g1', shift: 'R', shortFri: true, rate: { k1: 4 } });
    add('b', { positionId: 'g1', shift: 'S1', hist: [{ at: 0, pos: 'g2', lvl: null }, { at: new Date(2026, 9, 1).getTime(), pos: 'g1', lvl: null }] });
    add('c', { positionId: 'g1', shift: 'S2' });
    add('d', { shift: 'R' });
    add('e', { positionId: 'g1', shift: 'R', excluded: true });
    add('f', { lead: [] });
    add('g', { positionId: 'g2', shift: 'O' });
    att('a', 'a', 'a', { 21: 7.5, 22: 7.5, 23: 7.5, 24: 7.5, 25: 6.5 });
    att('b', 'b', 'b', { 21: 'D', 22: '7,5 D', 23: 7.5, 24: 7.5, 25: 7.5 });
    att('c', 'c', 'c', { 22: 'X', 23: 7.5, 24: 7.5, 25: 7.5, 26: 6 });
    att('d', 'd', 'd', { 23: 8, 24: '8 NEM' });
    att('e', 'e', 'e', { 24: 4 });
    att('cizi|petr', 'Petr', 'Cizí', { 22: 7.5 });
    S.periods['2026-09'] = { days, rows, codes: {}, file: 't.xlsx', at: 1 };
    S.capReport = { ...blankCapReport(), s1am: '2026-W39' };
    const x = planReality('2026-W39');
    const p40 = planReality('2026-W40');
    const sh = planRealitySheets('2026-W39');
    const lide = sh.find(t => t.name === 'Lidé').rows, hdr = lide.findIndex(r => r[0] === 'Příjmení'), cRow = lide.find(r => r[0] === 'c'), bRow = lide.find(r => r[0] === 'b');
    const col = t => lide[hdr].indexOf(t);
    JSON.stringify({ weeks: attWeeks(), mg: x.mg, rows: x.rows.map(r => [r.key, r.pos ? r.pos.id : '', r.slot, r.planH, r.realH, r.workDays, r.excused, r.miss, r.extraDays, r.extraH, r.capable, r.note]),
      groups: x.groups.map(g => [g.pos ? g.pos.id : '', g.week.planN, g.week.am, g.week.pm, g.week.present, g.week.excused, g.week.miss, g.week.planH, g.week.realH, g.week.excusedH, g.week.extraN, g.week.extraH,
        [g.week.ok.planN, g.week.ok.present, g.week.ok.planH, g.week.ok.realH], [g.week.tr.planN, g.week.tr.present, g.week.tr.planH, g.week.tr.realH]]),
      total: [x.total.planN, x.total.present, x.total.planH, x.total.realH, x.total.extraH], unpaired: x.unpaired, missing: x.missing,
      p40: [p40.missing, p40.groups.find(g => g.pos && g.pos.id === 'g1').week.planN],
      bCells: [bRow[col('Út 22. 9. plán')], bRow[col('Út 22. 9. skutečnost')], bRow[col('Odpracováno h')], bRow[col('Hodiny u nepřítomnosti (nepočítají se)')], bRow[col('Přišel')], bRow[col('Omluveno')], bRow[col('Kódy')]],
      absH: x.rows.map(r => [r.key, r.absH]).filter(r => r[1]),
      sheets: sh.map(s => s.name), cCells: [cRow[col('Po 21. 9. plán')], cRow[col('Po 21. 9. skutečnost')], cRow[col('Út 22. 9. skutečnost')], cRow[col('Pá 25. 9. skutečnost')], cRow[cRow.length - 1]],
      weekendCols: lide[hdr].filter(t => /^(So|Ne) /.test(String(t))).length, days: x.days.map(d => d.iso), hol40: p40.holidays, days40: p40.days.map(d => d.iso),
      fri: friShift() })`));
  assert.deepStrictEqual(out.weeks, ['2026-W40', '2026-W39', '2026-W38', '2026-W37', '2026-W36'], 'týdny s docházkou od nejnovějšího');
  assert.strictEqual(out.mg, 'S1');
  const A = 4 * 7.5 + out.fri;
  assert.deepStrictEqual(out.rows, [
    ['a', 'g1', 'am', A, 36.5, 5, 0, 0, 0, 0, true, ''],
    ['c', 'g1', 'pm', 37.5, 22.5, 3, 0, 2, 0, 0, false, ''],
    ['e', 'g1', 'am', 37.5, 4, 1, 0, 4, 0, 0, false, 'dnes vyřazen'],
    ['b', 'g2', 'am', 37.5, 22.5, 3, 2, 0, 0, 0, false, ''],
    ['g', 'g2', 'pm', 37.5, 0, 0, 0, 5, 0, 0, false, 'v docházce není (jiné jméno?)'],
    ['cizi|petr', '', 'none', 0, 0, 0, 0, 0, 1, 7.5, false, 'v Lidech není'],
    ['d', '', 'none', 0, 0, 0, 0, 0, 1, 8, false, 'bez skupiny, mimo plán']],
    'lidé: plán ze zařazení (skupina z historie, zkrácený pátek, střídání), dnes vyřazený s docházkou v plánu, mimo plán zvlášť; sobota se nepočítá; vedoucí bez hodin ve výstupu není; den s kódem nepřítomnosti a hodinami (7,5 D, 8 NEM) není odpracovaný');
  assert.deepStrictEqual(out.groups, [
    ['g1', 15, 10, 5, 9, 0, 6, A + 75, 63, 0, 0, 0, [5, 5, A, 36.5], [10, 4, 75, 26.5]],
    ['g2', 10, 5, 5, 3, 2, 5, 75, 22.5, 15, 0, 0, [0, 0, 0, 0], [10, 3, 75, 22.5]],
    ['', 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 15.5, [0, 0, 0, 0], [0, 0, 0, 0]]], 'skupiny za týden: lidodny, hodiny, omluveno, schopní a v zaškolování zvlášť, mimo plán zvlášť');
  assert.deepStrictEqual(out.total, [25, 12, A + 150, 85.5, 15.5], 'celkem: odpracováno jen v plánu, mimo plán zvlášť');
  assert.deepStrictEqual(out.absH, [['b', 7.5], ['d', 8]], 'hodiny u nepřítomnosti jen pro informaci');
  assert.deepStrictEqual(out.bCells, [7.5, 'D (7,5 h)', 22.5, 7.5, 3, 2, 'D ×2'], 'Excel: dovolená s hodinami je nepřítomnost, hodiny jsou jen v závorce a ve zvláštním sloupci');
  assert.strictEqual(out.unpaired, 2, 'nespárovaná jména: plánovaný bez docházky a jméno z docházky, které v Lidech není');
  assert.deepStrictEqual(out.missing, []);
  assert.deepStrictEqual(out.p40, [['2026-10-01', '2026-10-02'], 6], 'částečný týden: dny bez docházky se neporovnávají (28. 9. je svátek); b je od 1. 10. v CNC, e bez docházky v plánu není');
  assert.deepStrictEqual(out.sheets, ['Souhrn', 'Po dnech', 'Lidé']);
  assert.deepStrictEqual(out.cCells, [7.5, 'chybí', 'X', 7.5, ''], 'Excel po dnech: plán a skutečnost, kód');
  assert.strictEqual(out.weekendCols, 0, 'v Excelu nejsou víkendové sloupce');
  assert.deepStrictEqual(out.days, ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'], 'jen pracovní dny');
  assert.deepStrictEqual([out.days40, out.hol40.map(h => h.iso)], [['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'], ['2026-09-28']], 'svátek 28. 9. se nepočítá, jen se uvede');
  return null;
});

test('Plán a skutečnost (2.24.2): nezávislá kontrola hodin proti docházce (jen dny v práci), součty, Excel a Docházka', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `JSON.stringify((()=>{
  const errs=[];const eq=(a,b,m)=>{if(Math.abs(a-b)>1e-6)errs.push(m+': '+a+' ≠ '+b);};
  const check=()=>{
    const months=Object.keys(S.periods);
    attWeeks().forEach(wid=>{
      const x=planReality(wid);
      // 1) člověk: hodiny ze surové docházky jen za pracovní dny s docházkou a jen dny v práci (bez kódu)
      x.rows.forEach(r=>{
        let raw=0,abs=0,plan=0;
        x.days.forEach(d=>{if(!d.has)return;const p=S.periods[d.iso.slice(0,7)],i=p.days.indexOf(d.iso),row=p.rows[r.key];
          const h=row?(+row.h[i]||0):0;if(row&&row.c[i])abs+=h;else raw+=h;if(r.planned)plan+=dayShift(d,!!(r.e&&r.e.shortFri));});
        eq(r.planned?r.realH:r.extraH,raw,wid+' '+r.key+' hodiny');eq(r.absH,abs,wid+' '+r.key+' hodiny u nepřítomnosti');eq(r.planH,plan,wid+' '+r.key+' plán');
        if(r.planned){eq(r.extraH,0,wid+' '+r.key+' navíc u plánovaného');eq(r.planDays,r.workDays+r.excused+r.miss,wid+' '+r.key+' dny = přišel + omluveno + chybí');}
      });
      // 2) skupina = součet lidí, schopní + zaškolování = celkem
      x.groups.forEach(g=>{
        const mine=x.rows.filter(r=>g.pos?(r.planned&&r.pos===g.pos):!r.planned);
        eq(g.week.planH,mine.reduce((s,r)=>s+r.planH,0),wid+' '+g.name+' plán h');
        eq(g.week.realH,mine.reduce((s,r)=>s+r.realH,0),wid+' '+g.name+' odpracováno');
        eq(g.week.extraH,mine.reduce((s,r)=>s+r.extraH,0),wid+' '+g.name+' navíc');
        ['planN','present','planH','realH'].forEach(k=>eq(g.week.ok[k]+g.week.tr[k],k==='planN'||k==='present'?g.week[k]:g.week[k],wid+' '+g.name+' ok+tr '+k));
        eq(g.week.ok.realH,mine.filter(r=>r.capable).reduce((s,r)=>s+r.realH,0),wid+' '+g.name+' schopní h');
        eq(g.week.planN,g.week.present+g.week.excused+g.week.miss,wid+' '+g.name+' lidodny = přišlo + omluveno + chybí');
        eq(g.week.planN,g.week.am+g.week.pm+g.week.rot+g.week.noshift,wid+' '+g.name+' lidodny = směny');
        g.days.forEach((t,i)=>eq(t.planH,mine.reduce((s,r)=>s+r.cells[i].plan,0),wid+' '+g.name+' den '+i));
      });
      ['planN','present','planH','realH','extraH'].forEach(k=>eq(x.total[k],x.groups.reduce((s,g)=>s+g.week[k],0),wid+' celkem '+k));
      x.totalDays.forEach((t,i)=>eq(t.realH,x.groups.reduce((s,g)=>s+g.days[i].realH,0),wid+' celkem den '+i));
      // 3) Excel Souhrn = výpočet
      const sh=planRealitySheets(wid)[0].rows,hdr=sh.findIndex(r=>r[0]==='Oddělení'),col=t=>sh[hdr].indexOf(t);
      const tot=sh.find(r=>r[1]==='Celkem');
      eq(tot[col('Plán h')],x.total.planH,wid+' Excel plán');eq(tot[col('Odpracováno h')],x.total.realH,wid+' Excel odpracováno');
      eq(tot[col('Zkušení pracovníci: odpracováno h')],x.total.ok.realH,wid+' Excel zkušení');eq(tot[col('Pracovníci v zácviku: odpracováno h')],x.total.tr.realH,wid+' Excel v zácviku');
      eq(tot[col('Mimo plán: h')],x.total.extraH,wid+' Excel mimo plán');
    });
    // 4) Docházka: hodiny za pracovní dny měsíce (attendance().workHours, od 2.25.1 také bez hodin
    //    u kódu nepřítomnosti) = součet odpracovaného po týdnech; hodiny u kódu zvlášť (codedHours)
    months.forEach(m=>{const p=S.periods[m];
      Object.keys(p.rows).forEach(key=>{
        if(!S.employees[key])return;
        let sum=0;attWeeks().forEach(wid=>{const x=planReality(wid),r=x.rows.find(y=>y.key===key);if(!r)return;
          x.days.forEach((d,i)=>{if(d.iso.slice(0,7)===m&&d.has)sum+=r.cells[i].w;});});
        const a=attendance(p,key),row=p.rows[key],coded=row.h.reduce((s,h,i)=>s+(row.c[i]?(+h||0):0),0);
        eq(sum,a.workHours,m+' '+key+' Docházka: hodiny v pracovní dny bez nepřítomnosti');
        eq(a.codedHours,coded,m+' '+key+' Docházka: hodiny u kódu nepřítomnosti');
      });});
  };
  // ukázková data
  S=sanitizeState(demoData());check();
  const demoErr=errs.length;
  // náhodná data: 40 lidí, 3 skupiny, 2 měsíce, nemoc, dovolené, víkendy, svátky, vyřazení, bez směny
  let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  S=sanitizeState(blank());
  S.positions=[0,1,2].map(i=>({id:'g'+i,name:'S'+i,dept:'D'+(i%2),skillset:[{id:'k'+i+'a',name:'a'},{id:'k'+i+'b',name:'b'}],maxTab:8,tiers:[],penalty:[],bonus:[]}));
  S=sanitizeState(S);
  const shifts=['R','O','S1','S2',''];
  for(let n=0;n<40;n++){const k='p'+n;const g='g'+(n%3);
    S.employees[k]={key:k,first:'J'+n,last:'P'+n,note:'',positionId:n%11===0?null:g,shift:shifts[n%5],shortFri:n%4===0,excluded:n%13===0,
      rate:{['k'+(n%3)+'a']:n%5,['k'+(n%3)+'b']:(n*3)%5}};
    if(n%7===0)S.employees[k].lead=[];}
  ['2026-09','2026-10'].forEach(m=>{const [y,mm]=m.split('-').map(Number);const len=new Date(y,mm,0).getDate();
    const days=Array.from({length:len},(_,i)=>m+'-'+String(i+1).padStart(2,'0'));const rows={};
    for(let n=0;n<42;n++){const k=n<40?'p'+n:'x'+n;const h=[],c=[];
      days.forEach(iso=>{const r=rnd();if(r<0.08){h.push(0);c.push(['D','NEM','A','PN'][Math.floor(rnd()*4)]);}
        else if(r<0.11){h.push([8,7.5,4][Math.floor(rnd()*3)]);c.push(['D','NEM','A'][Math.floor(rnd()*3)]);}   // nepřítomnost s hodinami („8 D“)
        else if(r<0.14){h.push(0);c.push(null);}else{h.push([7.5,6.5,8,9.25,4][Math.floor(rnd()*5)]);c.push(null);}});
      rows[k]={first:'J'+n,last:'P'+n,h,c};}
    S.periods[m]={days,rows,codes:{},file:'r.xlsx',at:1};});
  S.capReport={...blankCapReport(),s1am:'2026-W40'};
  S=sanitizeState(S);check();
  const coded=Object.values(S.periods).reduce((s,p)=>s+Object.values(p.rows).reduce((t,r)=>t+r.h.filter((h,i)=>h>0&&r.c[i]).length,0),0);
  return {weeks:attWeeks().length,demoErr,coded,errs:errs.slice(0,15),n:errs.length};
})())`));
  assert.ok(out.weeks >= 9, `týdnů ke kontrole: ${out.weeks}`);
  assert.ok(out.coded > 50, `dnů s kódem i hodinami v náhodných datech: ${out.coded}`);
  assert.deepStrictEqual(out.errs, [], `rozdíly (${out.n}): ${out.errs.join('; ')}`);
  return null;
});

test('Docházka (2.25.1): den s kódem nepřítomnosti a hodinami („8 D“) je nepřítomnost, ne docházka', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    S = sanitizeState(blank());
    const pos = S.positions[0];
    S.employees.a = { key: 'a', first: 'a', last: 'a', positionId: pos.id, note: '' };
    const days = Array.from({ length: 30 }, (_, i) => '2026-09-' + String(i + 1).padStart(2, '0'));
    const h = days.map(iso => { const [y, m, d] = iso.split('-').map(Number); return mkDay(y, m, d).work ? 7.5 : 0; }), c = days.map(() => null);
    const set = (d, v) => { const x = parseHours(v); h[d - 1] = x.h; c[d - 1] = x.code; };
    set(1, '8 D');      // út: dovolená s hodinami → omluveno
    set(2, '7,5 A');    // st: neomluvený kód s hodinami → absence
    set(5, '8 D');      // so: kód o víkendu → není víkendová směna
    set(12, 8);         // so: skutečná víkendová směna
    const p = { id: '2026-09', days, rows: { a: { first: 'a', last: 'a', h, c } }, codes: {}, file: 't.xlsx', at: 1 };
    S.periods['2026-09'] = p; S.current = '2026-09';
    const a = attendance(p, 'a'), ev = evaluate(S.employees.a, p);
    return JSON.stringify({ work: [a.workDays, a.workHours, a.cappedHours], abs: [a.excusedDays, a.missed, a.absDays], wk: [a.wkDays, a.wkHours],
      total: [a.totalDays, a.totalHours], coded: [a.codedDays, a.codedHours], codes: a.codes, cell: [a.cells[0].h, a.cells[0].ah, a.cells[0].c, a.cells[0].isEx],
      fund: periodMeta(p).fund, kafe: [ev.kafe, ev.kafeTh], att: [ev.at.gross, ev.at.filled, ev.at.missing] });
  })()`));
  // září 2026: 21 pracovních dnů (28. 9. svátek), fond 21 × 7,5 = 157,5 h
  assert.deepStrictEqual(out.work, [19, 142.5, 142.5], 'pracovní dny s kódem nejsou odpracované, ani když mají hodiny');
  assert.deepStrictEqual(out.abs, [1, 1, 2], '8 D = omluvená absence (D je v seznamu), 7,5 A = neomluvená; obě jsou absence');
  assert.deepStrictEqual(out.wk, [1, 8], 'kód o víkendu není víkendová směna, skutečná směna ano');
  assert.deepStrictEqual(out.total, [20, 150.5], 'odpracováno celkem bez hodin u kódu');
  assert.deepStrictEqual(out.coded, [3, 23.5], 'hodiny u kódu zvlášť jen pro informaci');
  assert.deepStrictEqual(out.codes, { D: 2, A: 1 });
  assert.deepStrictEqual(out.cell, [0, 8, 'D', true], 'buňka kalendáře: 0 h odpracováno, 8 h u kódu');
  assert.strictEqual(out.fund, 157.5);
  assert.deepStrictEqual(out.kafe, [false, 157.5], 'Kafe: 150,5 h < fond 157,5 h (s hodinami u kódu by to bylo 174 h a Kafe by bylo)');
  assert.deepStrictEqual(out.att, [2, 1, 1], 'absence 2, víkendová směna 1 vyplní, chybí 1');
  return null;
});

test('Kapacity a zaškolení (2.30): vykázáno z docházky, plán ze zařazení, zkušení podle historie, vývoj zaškolení, výkon a Excel', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    S = sanitizeState(blank());
    const sk = i => [{ id: 'k' + i + 'a', name: 'a' }, { id: 'k' + i + 'b', name: 'b' }];
    S.positions = [{ id: 'g0', name: 'Brus', dept: 'Brus', skillset: sk(0), maxTab: 8, tiers: [], penalty: [], bonus: [] },
      { id: 'g1', name: 'CNC', dept: 'CNC', skillset: sk(1), maxTab: 8, tiers: [], penalty: [], bonus: [] }];
    S = sanitizeState(S);
    const T = (d, h = 8) => new Date(2026, 8, d, h, 0).getTime();
    const P = (key, pos, shift, r, extra = {}) => { S.employees[key] = { key, first: key.toUpperCase(), last: 'P' + key, note: '', positionId: pos, shift,
      rate: pos ? { ['k' + pos.slice(1) + 'a']: r[0], ['k' + pos.slice(1) + 'b']: r[1] } : {}, ...extra }; };
    P('a', 'g0', 'R', [4, 4], { wid: '11', hist: [{ at: T(1), pos: 'g0', lvl: null, pct: 100 }] });
    P('b', 'g0', 'S1', [3, 3], { wid: '12', hist: [{ at: T(1), pos: 'g0', lvl: null, pct: 50 }, { at: T(16, 10), pos: 'g0', lvl: null, pct: 75 }] });
    P('c', 'g1', 'S2', [2, 2], { wid: '13', hist: [{ at: T(2), pos: 'g1', lvl: null, pct: 25 }, { at: T(17, 9), pos: 'g1', lvl: null, pct: 50 }] });
    P('d', 'g1', 'O', [4, 4], { sick: '2026-09-10' });
    P('e', 'g0', 'R', [4, 4], { lead: [] });
    P('f', null, 'R', [0, 0]);
    P('g', 'g0', '', [1, 1], { excluded: true });
    P('h', 'g1', 'R', [4, 3]);
    S.capReport = { ...blankCapReport(), thr: 3, s1am: '2026-W38' };
    // docházka září: 7,5 h v pracovní dny 1.–18. 9., od 21. 9. prázdno (zatím nenahráno)
    const days = Array.from({ length: 30 }, (_, i) => '2026-09-' + String(i + 1).padStart(2, '0'));
    const work = iso => { const [y, m, d] = iso.split('-').map(Number); return mkDay(y, m, d).work && d <= 18; };
    const row = (key, fn) => { const h = [], c = []; days.forEach((iso, i) => { const v = fn(i + 1, work(iso)); h.push(v[0]); c.push(v[1]); }); return { first: key.toUpperCase(), last: 'P' + key, h, c }; };
    const std = (d, w) => [w ? 7.5 : 0, null];
    const rows = {
      a: row('a', (d, w) => (d === 18 ? [0, null] : std(d, w))),
      b: row('b', (d, w) => (d === 15 ? [0, 'D'] : std(d, w))),
      c: row('c', (d, w) => (d === 14 ? [0, 'A'] : std(d, w))),
      d: row('d', (d, w) => (w ? [0, 'NEM'] : [0, null])),
      e: row('e', std), f: row('f', std), g: row('g', std),
      x: row('x', (d, w) => (d === 14 ? [4, null] : [0, null])),
    };
    S.periods['2026-09'] = { days, rows, codes: {}, file: 'dochazka.xlsx', at: 1 };
    S.prodMap = { 'prod a': 'a', 'prod b': 'b', 'prod c': 'c' };
    const pr = (name, norm) => ({ name, total: 1, count: 1, days: {}, spent: norm, norm, nspent: norm });
    S.production['2026-09'] = { id: '2026-09', time: true, names: { 'prod a': pr('Prod A', 7200), 'prod b': pr('Prod B', 4500), 'prod c': pr('Prod C', 3000) }, records: 3, total: 3, file: 'e.xlsx', at: 1 };
    S = sanitizeState(S);
    const now = new Date(2026, 8, 20, 12, 0).getTime();
    const x = capTimeline('2026-09-14', '2026-10-02', { now });
    const day = iso => x.days.find(d => d.iso === iso);
    const pick = (c, ks) => ks.map(k => c[k]);
    const K = ['planN', 'planOk', 'planTr', 'present', 'presOk', 'presTr', 'realH', 'okH', 'trH', 'excused', 'miss', 'sick', 'on', 'onOk', 'onTr'];
    // nezávislé součty: celkem = skupiny, týden = dny, období = týdny
    const errs = [];
    const eq = (a, b, m) => { if (Math.abs(a - b) > 1e-6) errs.push(m + ': ' + a + ' ≠ ' + b); };
    x.days.forEach(d => { CT_KEYS.forEach(k => eq(d.tot[k], d.cells.reduce((s, c) => s + c[k], 0), d.iso + ' ' + k));
      d.cells.forEach((c, i) => { eq(c.planN, c.planOk + c.planTr, d.iso + ' g' + i + ' ok+tr');
        if (d.kind === 'real') eq(c.planN, c.present + c.excused + c.miss, d.iso + ' g' + i + ' přišlo+omluveno+chybí'); }); });
    x.weeks.forEach(w => CT_KEYS.forEach(k => eq(w.tot[k], x.days.filter(d => d.week === w.id).reduce((s, d) => s + d.tot[k], 0), w.id + ' ' + k)));
    CT_KEYS.forEach(k => eq(x.total.tot[k], x.weeks.reduce((s, w) => s + w.tot[k], 0), 'období ' + k));
    eq(x.total.tot.realH, x.real.tot.realH, 'odpracováno jen ve vykázaných dnech');
    const sh = capTimelineSheets(x), sum = sh[0].rows, hdr = sum.findIndex(r => r[0] === 'Oddělení'), col = t => sum[hdr].indexOf(t), tot = sum.find(r => r[1] === 'Všechny skupiny');
    return JSON.stringify({ errs, n: x.days.length, kinds: [x.real.n, x.plan.n, x.lastReal, x.firstPlan, x.pastPlan.length],
      d14: [pick(day('2026-09-14').cells[0], K), pick(day('2026-09-14').cells[1], K), day('2026-09-14').cells[0].trSPres, day('2026-09-14').extraN, day('2026-09-14').extraH, day('2026-09-14').req, day('2026-09-14').met],
      d15: pick(day('2026-09-15').cells[0], K), d16: pick(day('2026-09-16').cells[0], K), d17: [pick(day('2026-09-17').cells[1], K), day('2026-09-17').cells[1].trSPres],
      d18: pick(day('2026-09-18').cells[0], K),
      d21: [pick(day('2026-09-21').cells[0], K), pick(day('2026-09-21').cells[1], K), pick(day('2026-09-21').tot, ['am', 'pm', 'rot', 'noshift', 'planH'])],
      hol: !!day('2026-09-28'), start: [x.start.groups.map(g => [g.n, g.ok, g.tr]), x.start.tot.n], end: [x.end.groups.map(g => [g.n, g.ok, g.tr, g.sick]), x.end.tot.ok],
      dev: x.dev.map(r => [r.key, r.start.pct, r.end.pct, r.gain, r.became ? todayIso(r.became) : '', r.steps.length]), newOk: x.newOk,
      missing: x.missing.map(m => [m.month, m.keys]), noGroup: x.noGroup, est: x.est, noHist: x.noHist,
      months: x.months.map(m => [m.id, m.kind, m.n, m.roster.iso]),
      perf: x.months[0].perf && [x.months[0].perf.tot.ok, x.months[0].perf.tot.tr, x.months[0].perf.tot.all, x.months[0].perf.idx.tot.all, x.months[0].perf.idx.tot.ok, x.months[0].perf.idx.tot.tr],
      sheets: sh.map(s => s.name), excel: [tot[col('Lidí na konci')], tot[col('Zkušení')], tot[col('Odpracováno h')], tot[col('Výkon celkem (index)')]],
      wk: x.weeks.map(w => [w.id, w.kind, w.n, w.req, w.met]),
      week: (() => { const r = capWeekReport('2026-W38', { now }); return { g: r.groups.map(q => [q.g.id, q.plan, q.on, q.ok, q.met, q.state]), tot: [r.tot.met, r.tot.state, r.reqDays, r.n], days: r.days.map(d => [d.kind, d.on, d.ok]) }; })(),
      month: (() => { const r = capMonthReport('2026-09', { now }); return { ids: r.ids, g: r.groups.map(q => [q.g.id, q.n, q.ok, q.tr, q.dOk]), tot: [r.tot.n, r.tot.ok, r.tot.tr, r.tot.dOk, r.tot.perf && r.tot.perf.all], snap: r.snap, base: r.baseMonth, real: r.real, plan: r.plan, last: r.lastReal, first: r.firstPlan }; })(),
      pages: capReportPages('2026-09-14', '2026-10-02').map(p => p.kind + ' ' + p.id) });
  })()`));
  assert.deepStrictEqual(out.errs, [], `součty: ${out.errs.slice(0, 10).join('; ')}`);
  assert.deepStrictEqual(out.kinds, [5, 9, '2026-09-18', '2026-09-21', 0], 'vykázáno 14.–18. 9. (docházka), plán od 21. 9. (28. 9. svátek se nepočítá)');
  assert.strictEqual(out.n, 14);
  assert.strictEqual(out.hol, false, 'svátek 28. 9. v dnech není');
  // 14. 9.: Brus a (zkušený), b (50 % podle historie, v zácviku), g (dnes vyřazený, v září v docházce); vedoucí e se nepočítá
  assert.deepStrictEqual(out.d14[0], [3, 1, 2, 3, 1, 2, 22.5, 7.5, 15, 0, 0, 0, 3, 1, 2]);
  // CNC: c s kódem A (neomluveno), d v nemoci (omluveno, dnes 100 % bez historie = zkušený), h v docházce chybí
  assert.deepStrictEqual(out.d14[1], [2, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0]);
  assert.ok(Math.abs(out.d14[2] - 1) < 1e-9, 'Ø zaškolení: b 50/75 + g 25/75 = 1');
  assert.deepStrictEqual(out.d14.slice(3), [2, 11.5, 100, false], 'mimo skupiny f a x (11,5 h), požadavek 100 nesplněn');
  assert.deepStrictEqual(out.d15, [3, 1, 2, 2, 1, 1, 15, 7.5, 7.5, 1, 0, 0, 2, 1, 1], '15. 9.: b dovolená (D) = omluveno');
  assert.deepStrictEqual(out.d16, [3, 2, 1, 3, 2, 1, 22.5, 15, 7.5, 0, 0, 0, 3, 2, 1], '16. 9. 10:00 b na 75 % = zkušený');
  assert.deepStrictEqual(out.d17[0], [2, 1, 1, 1, 0, 1, 7.5, 0, 7.5, 1, 0, 0, 1, 0, 1], '17. 9.: c v práci (50 % podle historie)');
  assert.ok(Math.abs(out.d17[1] - 50 / 75) < 1e-6);
  assert.deepStrictEqual(out.d18, [3, 2, 1, 2, 1, 1, 15, 7.5, 7.5, 0, 1, 0, 2, 1, 1], '18. 9.: a bez hodin a bez kódu = chybí');
  // 21. 9. plán: dnešní zařazení, nemocný d mimo plán, vyřazený g ne, h ano; střídání W39 = skupina 2 ráno
  assert.deepStrictEqual(out.d21[0], [2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 0]);
  assert.deepStrictEqual(out.d21[1], [2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 1]);
  assert.deepStrictEqual(out.d21[2], [3, 1, 0, 0, 30], 'a, c, h ráno, b (skupina 1) odpoledne; 4 × 7,5 h');
  assert.deepStrictEqual(out.start, [[[3, 1, 2], [2, 1, 1]], 5], 'stav 13. 9. z historie: h v docházce není, g ještě pracoval');
  assert.deepStrictEqual(out.end, [[[2, 2, 0, 0], [3, 2, 1, 1]], 4], 'stav 2. 10. = dnešní zařazení');
  assert.deepStrictEqual(out.dev, [['b', 50, 75, 25, '2026-09-16', 1], ['c', 25, 50, 25, '', 1]]);
  assert.strictEqual(out.newOk, 1);
  assert.deepStrictEqual(out.missing, [['2026-09', ['h']]]);
  assert.deepStrictEqual([out.noGroup, out.est, out.noHist], [1, 0, 2], 'f bez skupiny; d a g bez historie (dnešní hodnocení)');
  assert.deepStrictEqual(out.months, [['2026-09', 'mix', 12, '2026-09-30'], ['2026-10', 'plan', 2, '2026-10-02']]);
  // výkon září: zkušení a+b 195 h normy ÷ 195 h, v zácviku c 50 ÷ 97,5; celkem 245 ÷ 292,5 = index 100
  assert.ok(Math.abs(out.perf[0] - 1) < 1e-9 && Math.abs(out.perf[1] - 50 / 97.5) < 1e-9 && Math.abs(out.perf[2] - 245 / 292.5) < 1e-9, `výkon ${out.perf}`);
  assert.deepStrictEqual(out.perf.slice(3), [100, 119.4, 61.2]);
  assert.deepStrictEqual(out.sheets, ['Souhrn', 'Po dnech', 'Po týdnech', 'Po měsících', 'Vývoj zaškolení']);
  assert.deepStrictEqual(out.excel, [5, 4, 127.5, 100], 'Excel Souhrn: lidé a zkušení na konci, odpracováno 14.–18. 9. (Brus 97,5 + CNC 30), výkon');
  assert.deepStrictEqual(out.wk, [['2026-W38', 'real', 5, 5, 0], ['2026-W39', 'plan', 5, 5, 0], ['2026-W40', 'plan', 4, 4, 0]]);
  // týdenní souhrn 14.–18. 9.: Brus měl přijít 3, 2 (b dovolená), 3, 3, 3 a přišlo 3, 2, 3, 3, 2 (a chybí 18. 9.)
  assert.deepStrictEqual(out.week.g, [['g0', 2.8, 2.6, 1.4, 4, 'warn'], ['g1', 1, 0.8, 0, 4, 'warn']], 'průměr po skupinách, dní v normě, stav');
  assert.deepStrictEqual(out.week.tot, [0, 'crit', 5, 5], 'požadavek 100 nesplněn ani jeden den');
  assert.deepStrictEqual(out.week.days.map(d => d[0]), ['real', 'real', 'real', 'real', 'real']);
  // měsíční souhrn září: červenec a srpen v grafu, stav k 30. 9. = dnešní zařazení (po 20. 9. plán)
  assert.deepStrictEqual(out.month.ids, ['2026-07', '2026-08', '2026-09']);
  assert.deepStrictEqual(out.month.g, [['g0', 2, 2, 0, 1], ['g1', 3, 2, 1, 0]], 'skupiny: lidé, zaškolení, v zácviku, zaškolení proti srpnu');
  assert.deepStrictEqual(out.month.tot, [5, 4, 1, 1, 100], 'celkem a výkon (září = 100)');
  assert.deepStrictEqual([out.month.snap, out.month.base, out.month.real, out.month.plan, out.month.last, out.month.first], ['2026-09-30', '2026-09', 14, 7, '2026-09-18', '2026-09-21']);
  assert.deepStrictEqual(out.pages, ['month 2026-09', 'week 2026-W38', 'week 2026-W39', 'month 2026-10', 'week 2026-W40'], 'stránky PDF: měsíc a jeho týdny');
  return null;
});

test('Kapacity a zaškolení (2.30): nezávislá kontrola na náhodných datech (hodiny, počty, historie, plán)', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `JSON.stringify((()=>{
    let seed=11;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
    S=sanitizeState(blank());
    S.positions=[0,1,2].map(i=>({id:'g'+i,name:'S'+i,dept:'D'+(i%2),skillset:[{id:'k'+i+'a',name:'a'},{id:'k'+i+'b',name:'b',opt:i===2}],maxTab:8,tiers:[],penalty:[],bonus:[]}));
    S=sanitizeState(S);
    const shifts=['R','O','S1','S2',''];
    for(let n=0;n<40;n++){const k='p'+n,g='g'+(n%3);
      const hist=[];let t=new Date(2026,7,20).getTime();
      for(let j=0;j<(n%4);j++){t+=Math.floor(rnd()*20+3)*864e5;hist.push({at:t,pos:j===2&&n%5===0?'g'+((n+1)%3):g,lvl:null,pct:Math.round(rnd()*4)*25});}
      S.employees[k]={key:k,first:'J'+n,last:'P'+n,note:'',positionId:n%11===0?null:g,shift:shifts[n%5],shortFri:n%4===0,excluded:n%13===0,
        rate:{['k'+(n%3)+'a']:n%5,['k'+(n%3)+'b']:(n*3)%5},hist,...(n%9===0?{sick:'2026-10-05'}:{})};
      if(n%7===0)S.employees[k].lead=[];}
    ['2026-09','2026-10'].forEach(m=>{const [y,mm]=m.split('-').map(Number);const len=new Date(y,mm,0).getDate();
      const days=Array.from({length:len},(_,i)=>m+'-'+String(i+1).padStart(2,'0'));const rows={};
      for(let n=0;n<42;n++){if(n===5&&m==='2026-10')continue;const k=n<40?'p'+n:'x'+n;const h=[],c=[];
        days.forEach(iso=>{const d=+iso.slice(8);if(m==='2026-10'&&d>16){h.push(0);c.push(null);return;}
          const r=rnd();if(r<0.08){h.push(0);c.push(['D','NEM','A','PN'][Math.floor(rnd()*4)]);}
          else if(r<0.11){h.push(8);c.push('D');}else if(r<0.14){h.push(0);c.push(null);}else{h.push([7.5,6.5,8,4][Math.floor(rnd()*4)]);c.push(null);}});
        rows[k]={first:'J'+n,last:'P'+n,h,c};}
      S.periods[m]={days,rows,codes:{},file:'r.xlsx',at:1};});
    S.capReport={...blankCapReport(),thr:3,s1am:'2026-W40'};
    S=sanitizeState(S);
    const now=new Date(2026,9,20,12).getTime(),x=capTimeline('2026-09-01','2026-11-30',{now});
    const errs=[],eq=(a,b,m)=>{if(Math.abs(a-b)>1e-6)errs.push(m+': '+a+' ≠ '+b);},ex=excusedSet();
    const gi=new Map(S.positions.map((p,i)=>[p.id,i]));
    x.days.forEach(d=>{
      if(d.kind==='real'){
        const p=S.periods[d.month],i=p.days.indexOf(d.iso),ts=new Date(+d.iso.slice(0,4),+d.iso.slice(5,7)-1,+d.iso.slice(8),23,59,59,999).getTime();
        const exp=S.positions.map(()=>({n:0,ok:0,pres:0,h:0}));
        Object.entries(p.rows).forEach(([k,row])=>{const e=S.employees[k];if(!e||Array.isArray(e.lead))return;
          let cur=null;(e.hist||[]).forEach(hh=>{if(hh.at<=ts)cur=hh;});const pos=cur?cur.pos:(e.hist&&e.hist.length?e.hist[0].pos:e.positionId);
          if(!pos||!gi.has(pos))return;const g=exp[gi.get(pos)];
          // procento: poslední zápis pro skupinu do konce dne, jinak nejbližší pozdější, jinak dnešní
          const hs=(e.hist||[]).filter(hh=>hh.pos===pos&&hh.pct!=null);let pct=null;hs.forEach(hh=>{if(hh.at<=ts)pct=hh.pct;});
          if(pct==null){const nx=hs.find(hh=>hh.at>ts);pct=nx?nx.pct:skillPct(e,S.positions[gi.get(pos)]);}
          g.n++;if(pct>=75-1e-9)g.ok++;const w=!row.c[i]&&row.h[i]>0;if(w){g.pres++;g.h+=row.h[i];}});
        exp.forEach((g,j)=>{const c=d.cells[j];eq(c.planN,g.n,d.iso+' g'+j+' v plánu');eq(c.planOk,g.ok,d.iso+' g'+j+' zkušení');eq(c.present,g.pres,d.iso+' g'+j+' přišlo');eq(c.realH,g.h,d.iso+' g'+j+' hodiny');});
      }else{
        S.positions.forEach((p,j)=>{const m=Object.values(S.employees).filter(e=>!e.excluded&&!Array.isArray(e.lead)&&e.positionId===p.id);
          const live=m.filter(e=>!(e.sick&&e.sick<=d.iso));const c=d.cells[j];
          eq(c.planN,live.length,d.iso+' g'+j+' plán');eq(c.sick,m.length-live.length,d.iso+' g'+j+' nemoc');
          eq(c.planOk,live.filter(e=>skillPct(e,p)>=75-1e-9).length,d.iso+' g'+j+' plán zkušení');
          eq(c.planH,live.reduce((s,e)=>s+dayShift(d.day,!!e.shortFri),0),d.iso+' g'+j+' plán h');
          eq(c.realH,0,d.iso+' g'+j+' plán bez hodin');});
      }
    });
    CT_KEYS.forEach(k=>eq(x.total.tot[k],x.months.reduce((s,m)=>s+m.tot[k],0),'měsíce '+k));
    eq(x.total.n,x.real.n+x.plan.n,'dny');
    const sh=capTimelineSheets(x);
    return {errs:errs.slice(0,12),n:errs.length,real:x.real.n,plan:x.plan.n,dev:x.dev.length,est:x.est,months:x.months.length,rows:sh.map(s=>s.rows.length)};
  })())`));
  assert.deepStrictEqual(out.errs, [], `rozdíly (${out.n}): ${out.errs.join('; ')}`);
  assert.ok(out.real >= 30 && out.plan >= 25, `vykázáno ${out.real}, plán ${out.plan}`);
  assert.ok(out.dev >= 10, `lidí se změnou: ${out.dev}`);
  assert.strictEqual(out.months, 3);
  return `${out.real} vykázaných a ${out.plan} plánovaných dnů, ${out.dev} lidí se změnou`;
});

test('Kapacity a zaškolení (2.31): záhlaví reportů v Auditu (pracoviště, firma), čištění a historie změn', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const a = cleanWorkAudit({});
    const b = cleanWorkAudit({ rep: { place: '  Pracoviště\\n A ', firm: 'Firma s.r.o.', x: 1 } });
    const log = []; waChanges(a, b, (kind, text, extra) => log.push([kind, extra && extra.m, extra && extra.v1]));
    return JSON.stringify({ blank: blankWorkAudit().rep, a: a.rep, b: b.rep, old: cleanWorkAudit({ rep: 'x' }).rep, log, v: DATA_VERSION });
  })()`));
  assert.deepStrictEqual(out.blank, { place: '', firm: '' });
  assert.deepStrictEqual(out.a, { place: '', firm: '' }, 'starší data dostanou prázdné záhlaví');
  assert.deepStrictEqual(out.b, { place: 'Pracoviště A', firm: 'Firma s.r.o.' }, 'jeden řádek, bez cizích polí');
  assert.deepStrictEqual(out.old, { place: '', firm: '' });
  assert.deepStrictEqual(out.log, [['workaudit', 'warep', 'Pracoviště A · Firma s.r.o.']]);
  assert.strictEqual(out.v, 37, 'verze dat 37: starší stránka záhlaví nesmaže');
  return null;
});

test('Shortage (2.31): ruční TOP SHORTAGE, sestava zobrazená plně, filtr podle probíhající operace, historie změn', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const it = (id, ean, op, top, subs) => ({ id, order: 'O' + id, name: 'Díl ' + id, ean, index: '', qty: '1', top: !!top, op, link: '', code: 'c' + id, note: '', rec: null, subs: subs || [] });
    const sub = (id, ean, op) => ({ id, ean, link: '', code: 's' + id, op, note: '', rec: null });
    const A = cleanShortage({ lists: [{ id: 'shA', at: 1, items: [it('si1', '1', 'Lakování', true), it('si2', '2', 'Broušení – hala 2'), it('si3', '3', 'broušení - Hala 2', false, [sub('sp1', '31', 'Frézování VF-11'), sub('sp2', '32', 'Lakování')]), it('si4', '4', '')] }] });
    const B = JSON.parse(JSON.stringify(A));
    const l = B.lists[0];
    const set1 = shSetTop(l, 'si3', true), again = shSetTop(l, 'si3', true), order1 = l.items.map(i => i.id);
    const set2 = shSetTop(l, 'si1', false), order2 = l.items.map(i => i.id);
    l.items.find(i => i.id === 'si3').full = true;
    const log = []; shChanges(A, B, (kind, text, extra) => log.push([extra.m.split(':')[0], text.replace(/ \\(seznam .*\\)$/, '')]));
    const C = cleanShortage(B), c3 = C.lists[0].items.find(i => i.id === 'si3');
    const ops = shOpList(l).map(o => [o.key, o.label, o.n]);
    const pick = keys => shOpPick(l.items, new Set(keys)).map(i => [i.id, i.subs.map(x => x.id)]);
    return JSON.stringify({ set1, again, order1, set2, order2, log, full: [c3.full, C.lists[0].items.find(i => i.id === 'si2').full, cleanShortage({ lists: [{ items: [{ ean: '9', full: 'ano' }] }] }).lists[0].items[0].full],
      ops, br: pick([shOpKey('BROUŠENÍ — HALA 2')]), lak: pick([shOpKey('Lakování')]), fr: pick([shOpKey('Frézování VF-11')]), none: pick([shOpKey('')]), all: pick([]).length, miss: shSetTop(l, 'nic', true) });
  })()`));
  assert.deepStrictEqual([out.set1, out.again, out.miss], [true, false, false]);
  assert.deepStrictEqual(out.order1, ['si1', 'si3', 'si2', 'si4'], 'ručně TOP jde na konec TOP');
  assert.deepStrictEqual([out.set2, out.order2], [true, ['si3', 'si1', 'si2', 'si4']], 'zrušené TOP jde na začátek ostatních');
  assert.deepStrictEqual(out.log, [['sht', 'Shortage: položka 3 Díl si3 ručně označena jako TOP SHORTAGE'], ['sht', 'Shortage: položka 1 Díl si1 už není TOP SHORTAGE'],
    ['shf', 'Shortage: sestava 3 Díl si3 zobrazena plně (QR kód, záznam, kolonky)']], 'přesun kvůli TOP se nepíše jako změna pořadí');
  assert.deepStrictEqual(out.full, [true, false, false], 'plné zobrazení jen true');
  assert.deepStrictEqual(out.ops, [['brouseni hala 2', 'broušení - Hala 2', 2], ['lakovani', 'Lakování', 2], ['frezovani vf 11', 'Frézování VF-11', 1], ['-', 'bez operace', 1]],
    'operace bez ohledu na diakritiku, pomlčky a velikost písmen, nejčastější první, bez operace na konci');
  assert.deepStrictEqual(out.br, [['si3', []], ['si2', []]], 'sestava se shodnou operací bez poddílů jiné operace');
  assert.deepStrictEqual(out.lak, [['si3', ['sp2']], ['si1', []]], 'sestava kvůli poddílu, jen jeho poddíl');
  assert.deepStrictEqual(out.fr, [['si3', ['sp1']]]);
  assert.deepStrictEqual(out.none, [['si4', []]], 'filtr položek bez operace');
  assert.strictEqual(out.all, 4, 'bez výběru všechno');
  return null;
});

test('Kapacity a zaškolení (2.31): týdenní souhrn bez požadavku z Auditu porovná den s plánem skupin', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const st = blank();
    const p = mkPos('g1', 'Brus', []); p.skillset = [{ id: 'k1', name: 'Broušení', desc: '', scale: null }]; p.maxTab = 8; p.tiers = [];
    st.positions = [p];
    ['a', 'b', 'c'].forEach((k, n) => { st.employees[k] = { key: k, last: 'L' + k, first: 'F', positionId: 'g1', shift: 'R', note: '', rate: { k1: n ? 4 : 2 } }; });
    st.workAudit.target = null;
    S = sanitizeState(st);
    S.workAudit.target = null;
    const days = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];
    // a v pondělí chybí (bez kódu), b v úterý dovolená (omluveno = plán se sníží), jinak všichni
    const row = k => ({ first: 'F', last: 'L' + k, h: days.map(d => (k === 'a' && d === '2026-09-14') || (k === 'b' && d === '2026-09-15') ? 0 : 7.5), c: days.map(d => (k === 'b' && d === '2026-09-15' ? 'D' : null)) });
    S.periods['2026-09'] = { id: '2026-09', y: 2026, m: 9, days, rows: { a: row('a'), b: row('b'), c: row('c') }, codes: {}, file: 'x', at: 1, headerRow: 1 };
    const r = capWeekReport('2026-W38', { now: new Date(2026, 9, 1).getTime() });
    return JSON.stringify({ days: r.days.map(d => [d.kind, d.on, d.plan, d.met]), tot: [r.tot.met, r.n, r.tot.state, r.req, r.reqDays], g: r.groups.map(q => [q.plan, q.on, q.met, q.state]) });
  })()`));
  assert.deepStrictEqual(out.days, [['real', 2, 3, false], ['real', 2, 2, true], ['real', 3, 3, true], ['real', 3, 3, true], ['real', 3, 3, true]], 'den v normě = přišli všichni, kdo měli (dovolená se z plánu odečte)');
  assert.deepStrictEqual(out.tot, [4, 5, 'warn', null, 0], '4 z 5 dní = mírně pod');
  assert.deepStrictEqual(out.g, [[2.8, 2.6, 4, 'warn']]);
  return null;
});

test('Shortage (2.32): TOP 2 pod TOP SHORTAGE, oddělení podle probíhající operace, ruční přesun, historie změn', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const row = (g, op) => ['O', 'Díl', 'E' + g + op, '', '1', '', g, op].map(text => ({ text, link: '' }));
    const imp = shBuild([row('TOP2', 'A'), row('top 2', 'B'), row('TOP', 'C'), row('', 'D'), row('Top-2 hned', 'E'), row('TOP SHORTAGE', 'F')]);
    const it = (id, op, extra) => ({ id, order: 'O' + id, name: 'Díl ' + id, ean: id, index: '', qty: '1', op, link: '', code: '', note: '', rec: null, subs: [], ...extra });
    const sh = cleanShortage({ depts: [
        { id: 'sdBrus', name: 'Brus', ops: [{ key: 'Broušení – hala 2', label: 'Broušení – hala 2' }, { key: 'brouseni hala 2', label: 'dvakrát' }] },
        { id: 'sdCnc', name: ' CNC ', ops: [{ key: 'brouseni hala 2', label: 'jinde' }, { key: 'Frézování VF-11', label: 'Frézování VF-11' }] },
        { id: 'sdCnc', name: 'Stejné id', ops: [] }],
      lists: [{ id: 'shA', at: 1, items: [it('a', 'Lakování'), it('b', 'Broušení - Hala 2', { top: true }), it('c', 'Montáž', { subs: [{ id: 'sp1', ean: 's1', op: 'Frézování VF-11' }] }),
        it('d', 'frézování vf-11', { top2: true }), it('e', 'Broušení – hala 2', { dept: 'sdZmizelo' }), it('f', 'Lakování', { top: true, top2: true })] }] });
    const l = sh.lists[0];
    const rank = () => l.items.map(i => i.id + ':' + shRank(i));
    const sec = () => shSections(sh, l.items).map(x => x.name + '=' + x.items.map(i => i.id).join(''));
    const r0 = { rank: rank(), depts: sh.depts.map(d => [/^sd(Brus|Cnc|[a-z0-9]{5})$/.test(d.id), d.name, d.ops.map(o => o.key)]), ids: new Set(sh.depts.map(d => d.id)).size, dept: l.items.map(i => i.dept), of: l.items.map(i => shDeptOf(sh, i)), sec: sec() };
    const A = JSON.parse(JSON.stringify(sh));
    const t1 = shSetTier(l, 'a', 'top2'), r1 = rank();
    const t2 = shSetTier(l, 'b', 'top2'), r2 = rank();
    const t3 = shSetTier(l, 'a', ''), r3 = rank(), same = shSetTier(l, 'a', '');
    const mv = shMoveItem(l, 'd', 0), r4 = rank();
    // ruční přesun: e (Brus podle operace) do CNC před c; pak c do Brus na konec; pak e zpět do Brus = podle operace
    const d1 = shDrop(sh, l, 'e', 'sdCnc', 'c'), s1 = sec(), e1 = l.items.find(i => i.id === 'e').dept;
    const d2 = shDrop(sh, l, 'c', '', null), s2 = sec(), c2 = l.items.find(i => i.id === 'c').dept;
    const d3 = shDrop(sh, l, 'e', 'sdBrus', null), e3 = l.items.find(i => i.id === 'e').dept, s3 = sec();
    const bad = shDrop(sh, l, 'e', 'sdNic', null);
    // nastavení oddělení: přiřazení operace jinému oddělení, smazání oddělení vrátí ruční přesun
    const as1 = shAssignOp(sh, 'lakovani', 'Lakování', 'sdBrus'), as2 = shAssignOp(sh, 'lakovani', 'Lakování', 'sdBrus'), s4 = sec();
    sh.depts.find(d => d.id === 'sdCnc').name = 'Obrobna';
    const all = shOpsAll(sh).map(o => [o.key, o.n]);
    const log = []; shChanges(A, sh, (kind, text) => log.push(text.replace(/ \\(seznam .*\\)$/, '')));
    const C = cleanShortage({ ...JSON.parse(JSON.stringify(sh)), depts: sh.depts.filter(d => d.id !== 'sdCnc') });
    const log2 = []; shChanges(sh, C, (kind, text) => log2.push(text.replace(/ \\(seznam .*\\)$/, '')));
    return JSON.stringify({ imp: imp.items.map(i => [i.ean, i.top, i.top2]), top2: imp.top2, r0, t: [t1, t2, t3, same, mv, d1, d2, d3, bad, as1, as2], r1, r2, r3, r4, s1, e1, s2, c2, e3, s3, s4, all, log,
      cDept: C.lists[0].items.map(i => i.id + ':' + i.dept), cSec: shSections(C, C.lists[0].items).map(x => x.name + '=' + x.items.map(i => i.id).join('')), log2, none: shSections(blankShortage(), l.items).map(x => [x.id, x.name, x.items.length]) });
  })()`));
  assert.deepStrictEqual(out.imp, [['ETOPC', true, false], ['ETOP SHORTAGEF', true, false], ['ETOP2A', false, true], ['Etop 2B', false, true], ['ETop-2 hnedE', false, true], ['ED', false, false]], 'G: TOP2 / top 2 / Top-2 = TOP 2, TOP = TOP SHORTAGE; pořadí TOP, TOP 2, ostatní');
  assert.strictEqual(out.top2, 3);
  assert.deepStrictEqual(out.r0.rank, ['b:0', 'f:0', 'd:1', 'a:2', 'c:2', 'e:2'], 'čištění: TOP, TOP 2, ostatní; TOP i TOP 2 zároveň = TOP');
  assert.deepStrictEqual(out.r0.depts, [[true, 'Brus', ['brouseni hala 2']], [true, 'CNC', ['frezovani vf 11']], [true, 'Stejné id', []]], 'operace jen v jednom oddělení, jedinečná id');
  assert.deepStrictEqual(out.r0.dept, ['', '', '', '', '', ''], 'ruční přesun do smazaného oddělení se zahodí');
  assert.deepStrictEqual(out.r0.of, ['sdBrus', '', 'sdCnc', '', 'sdCnc', 'sdBrus'], 'oddělení podle operace (bez diakritiky), sestava podle poddílu, bez zařazené operace nic');
  assert.strictEqual(out.r0.ids, 3);
  assert.deepStrictEqual(out.r0.sec, ['Brus=be', 'CNC=dc', 'Nezařazeno=fa'], 'bloky v pořadí oddělení, sestava podle poddílu, nezařazené na konci');
  assert.deepStrictEqual(out.t, [true, true, true, false, true, true, true, true, false, true, false]);
  assert.deepStrictEqual(out.r1, ['b:0', 'f:0', 'd:1', 'a:1', 'c:2', 'e:2'], 'nové TOP 2 na konec TOP 2');
  assert.deepStrictEqual(out.r2, ['f:0', 'b:1', 'd:1', 'a:1', 'c:2', 'e:2'], 'TOP snížené na TOP 2 jde na začátek TOP 2');
  assert.deepStrictEqual(out.r3, ['f:0', 'b:1', 'd:1', 'a:2', 'c:2', 'e:2'], 'zrušené TOP 2 na začátek ostatních');
  assert.deepStrictEqual(out.r4, ['f:0', 'd:1', 'b:1', 'a:2', 'c:2', 'e:2'], 'přesun jen uvnitř TOP 2');
  assert.deepStrictEqual([out.s1, out.e1], [['Brus=b', 'CNC=dec', 'Nezařazeno=fa'], 'sdCnc'], 'ručně do CNC před c (TOP 2 d zůstane první)');
  assert.deepStrictEqual([out.s2, out.c2], [['Brus=b', 'CNC=de', 'Nezařazeno=fac'], '-'], 'sestava ručně mezi nezařazené na konec');
  assert.deepStrictEqual([out.e3, out.s3], ['', ['Brus=be', 'CNC=d', 'Nezařazeno=fac']], 'zpátky do oddělení podle operace = bez ručního přesunu');
  assert.deepStrictEqual(out.s4, ['Brus=fbea', 'CNC=d', 'Nezařazeno=c'], 'operace Lakování přiřazená Brusu: položky se přeřadí samy (TOP první)');
  assert.deepStrictEqual(out.all, [['brouseni hala 2', 2], ['frezovani vf 11', 2], ['lakovani', 2], ['montaz', 1]], 'operace ze seznamů i nastavení');
  assert.deepStrictEqual(out.log.map(t => t.replace(/ v seznamu .*$/, '')), ['Shortage: oddělení CNC přejmenováno na Obrobna', 'Shortage: operace Lakování patří do oddělení Brus',
    'Shortage: položka b Díl b označena jako TOP 2 (zpracovat hned po TOP shortage)', 'Shortage: položka c Díl c ručně přesunuta: nezařazeno', 'Shortage: změněno pořadí položek'],
    'a tam a zpátky nic, e zpátky podle operace nic, přesun d uvnitř TOP 2 = pořadí');
  assert.deepStrictEqual(out.cDept, ['f:', 'd:', 'b:', 'e:', 'a:', 'c:-'], 'smazané oddělení: ruční „nezařazeno“ zůstane, ostatní podle operace');
  assert.deepStrictEqual(out.cSec, ['Brus=fbea', 'Nezařazeno=dc']);
  assert.deepStrictEqual(out.log2, ['Shortage: smazáno oddělení Obrobna']);
  assert.deepStrictEqual(out.none, [['', '', 6]], 'bez oddělení jeden blok bez nadpisu');
  return null;
});

test('Audit (2.33): hranice zaškolení v % platí pro celé Kapacity a zaškolení, čištění a historie změn', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const clean = v => cleanWorkAudit({ trainPct: v }).trainPct;
    const a = cleanWorkAudit({}), b = cleanWorkAudit({ trainPct: 60 });
    const log = []; waChanges(a, b, (kind, text, extra) => log.push([kind, extra && extra.m, extra && extra.v0, extra && extra.v1]));
    waChanges(b, a, (kind, text, extra) => log.push([kind, extra && extra.m, extra && extra.v0, extra && extra.v1]));
    const st = blank();
    const p = mkPos('g1', 'Brus', []); p.skillset = [{ id: 'k1', name: 'Broušení', desc: '', scale: null }, { id: 'k2', name: 'Kontrola', desc: '', scale: null }]; p.maxTab = 8; p.tiers = [];
    st.positions = [p];
    // a 50 %, b 62,5 %, c 100 %
    const rates = { a: { k1: 2, k2: 2 }, b: { k1: 3, k2: 2 }, c: { k1: 4, k2: 4 } };
    Object.keys(rates).forEach(k => { st.employees[k] = { key: k, last: 'L' + k, first: 'F', positionId: 'g1', shift: 'R', note: '', rate: rates[k] }; });
    S = sanitizeState(st);
    const days = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];
    const row = k => ({ first: 'F', last: 'L' + k, h: days.map(() => 7.5), c: days.map(() => null) });
    S.periods['2026-09'] = { id: '2026-09', y: 2026, m: 9, days, rows: { a: row('a'), b: row('b'), c: row('c') }, codes: {}, file: 'x', at: 1, headerRow: 1 };
    const now = new Date(2026, 9, 1).getTime();
    const calc = () => { const x = capTimeline('2026-09-14', '2026-09-18', { now }), d = x.days[0].cells[0], w = capWeekReport('2026-W38', { now }), m = capMonthReport('2026-09', { now });
      const hdr = capTimelineSheets(x)[0].rows.slice(0, 4).map(r => r[0]).join(' | ');
      return { tr: waTrain(), x: [x.okPct, x.okOwn, d.presOk, d.presTr, Math.round(d.trSPres * 1000) / 1000, x.end.tot.ok, x.end.tot.tr],
        w: [w.okPct, w.okOwn, w.days[0].ok, w.days[0].tr], m: [m.okPct, m.okOwn, m.tot.ok, m.tot.tr], hdr }; };
    const r0 = calc();                                    // bez vlastní hranice: úroveň 3 z Matice = 75 %
    S.capReport = { ...blankCapReport(), thr: 2 }; const r1 = calc();   // úroveň 2 = 50 %
    S.workAudit.trainPct = 60; const r2 = calc();        // vlastní hranice Auditu má přednost
    S.workAudit.trainPct = 100; const r3 = calc();
    return JSON.stringify({ blank: blankWorkAudit().trainPct, a: a.trainPct, vals: [60, 60.4, '70', 0, 150, -5, 'x', null, '', 1, 100].map(clean), log,
      r0, r1, r2, r3, keep: sanitizeState(S).workAudit.trainPct, v: DATA_VERSION });
  })()`));
  assert.strictEqual(out.blank, null, 'nový Audit: hranice podle Matice');
  assert.strictEqual(out.a, null, 'starší data bez hranice zůstanou podle Matice');
  assert.deepStrictEqual(out.vals, [60, 60, 70, null, null, null, null, null, null, 1, 100], 'celé procento 1–100, jinak podle Matice');
  assert.deepStrictEqual(out.log, [['workaudit', 'watrain', 'podle Matice dovedností', 'od 60 %'], ['workaudit', 'watrain', 'od 60 %', 'podle Matice dovedností']]);
  assert.deepStrictEqual(out.r0.tr, { pct: 75, own: false, thr: 3 });
  assert.deepStrictEqual(out.r0.x, [75, false, 1, 2, 0.667 + 0.833, 1, 2], 'od 75 %: zaškolený jen c, Ø zaškolení a 50/75 + b 62,5/75');
  assert.deepStrictEqual(out.r1.x, [50, false, 3, 0, 0, 3, 0], 'úroveň 2 z Matice = 50 %: všichni zaškolení');
  assert.deepStrictEqual(out.r2.tr, { pct: 60, own: true, thr: 2 });
  assert.deepStrictEqual(out.r2.x, [60, true, 2, 1, 0.833, 2, 1], 'od 60 %: b a c zaškolení, a v zaškolení (50/60)');
  assert.deepStrictEqual([out.r2.w, out.r2.m], [[60, true, 2, 1], [60, true, 2, 1]], 'týdenní i měsíční souhrn počítají se stejnou hranicí');
  assert.deepStrictEqual(out.r3.x, [100, true, 1, 2, 1.125, 1, 2], 'od 100 %: zaškolený jen c');
  assert.ok(out.r0.hdr.includes('aspoň 75 % (úroveň 3 z Matice dovedností'), out.r0.hdr);
  assert.ok(out.r2.hdr.includes('aspoň 60 % (hranice zaškolení z nastavení Auditu') && out.r2.hdr.includes('cíl (60 %)'), out.r2.hdr);
  assert.strictEqual(out.keep, 100, 'hranice přežije uložení');
  assert.strictEqual(out.v, 37, 'verze dat 37: starší stránka hranici zaškolení nesmaže');
  return null;
});

test('Výroba a Audit (2.35): jeden výkaz práce, sloupec Operace ve Výrobě dává kusy Auditu', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const head = ['Datum', 'Středisko', 'Zakázka', 'Díl', 'Pracovník', 'Od', 'Do', 'Operace', 'Norma', 'Kusy'];
    const d = n => new Date(Date.UTC(2026, 9, n, 12));
    const aoa = [['Export výkazu práce'], head,
      [d(1), 'H2', 'Z1', 'D-1', '101', '06:00', '14:00', 'Broušení ruční', 1.2, 40],
      [d(1), 'H2', 'Z1', 'D-1', '102', '14:00', '22:00', 'Broušení ruční', 1.2, 35],
      [d(1), 'H2', 'Z2', 'D-2', '101', '06:00', '14:00', 'Frézování CNC', 2, 12],
      [d(2), 'H2', 'Z3', 'D-3', '103', '06:00', '14:00', 'Frézování CNC', 2, 20],
      [d(2), 'H2', 'Z3', 'D-3', '', '', '', 'Frézování CNC', 2, 5],
      [null, null, null, null, 'Celkem', null, null, null, null, 112]];
    const info = prodColumns(aoa), g = info.guess;
    const other = prodColumns([['Číslo operace', 'Název operace', 'Norma operace', 'Datum', 'ID zaměstnance', 'Kusy'], ['10', 'Leštění', 5, d(3), '101', 4]]).guess;
    const none = prodColumns([['Zakázka', 'ID zaměstnance', 'Datum', 'Kusy', 'Strávený čas (min)', 'Norma (min)'], ['Z1', 101, d(3), 10, 400, 420]]).guess;
    const map = { ...g, heads: info.heads };
    const fromProd = waParseProd(aoa, map);
    const fromAudit = waParseWork([{ aoa }], WA_COLS.work);
    const wa = blankWorkAudit();
    const r = waApplyWork(wa, fromProd, { name: 'vykaz.xlsx', by: 'T', at: 1 });
    const prod = buildProduction(aoa, 'vykaz.xlsx', map);
    return JSON.stringify({ g: [g.name, g.date, g.ks, g.norm, g.op, g.item], other: [other.op, other.norm, other.name, other.ks], none: none.op,
      clean: [cleanProdCols({ ...map, op: 7 }).op, cleanProdCols({ ...map, op: 'x' }).op, cleanProdCols({ ...map, op: 99 }).op, cleanProdCols({ ...map, op: null }).op, cleanProdCols({ ...map, op: undefined }).op],
      same: JSON.stringify([fromProd.byDay, fromProd.ops, fromProd.rows]) === JSON.stringify([fromAudit.byDay, fromAudit.ops, fromAudit.rows]),
      byDay: fromProd.byDay, range: [fromProd.from, fromProd.to],
      noOp: waParseProd(aoa, { ...map, op: null }), noKs: waParseProd(aoa, { ...map, ks: null }),
      pcs: [r.days, r.added.map(o => o.name), Object.values(wa.pcs['2026-10-01'])],
      prod: prod.ok && [prod.used, Object.keys(prod.buckets), Object.keys(prod.buckets['2026-10'].names).sort()], v: DATA_VERSION });
  })()`));
  assert.deepStrictEqual(out.g, [4, 0, 9, 8, 7, 3], 'Pracovník, Datum, Kusy, Norma a Operace z hlavičky (Díl = položka jako dřív)');
  assert.deepStrictEqual(out.other, [1, 2, 4, 5], 'Název operace, ne Číslo ani Norma operace');
  assert.strictEqual(out.none, null, 'soubor bez operace: sloupec Operace zůstane prázdný');
  assert.deepStrictEqual(out.clean, [7, null, null, null, null]);
  assert.ok(out.same, 'kusy z Výroby = import výkazu v Auditu (A, H, J)');
  assert.deepStrictEqual(out.byDay, { '2026-10-01': { 'Broušení ruční': 75, 'Frézování CNC': 12 }, '2026-10-02': { 'Frézování CNC': 25 } }, 'i řádek bez pracovníka, bez souhrnu Celkem');
  assert.deepStrictEqual(out.range, ['2026-10-01', '2026-10-02']);
  assert.deepStrictEqual([out.noOp, out.noKs], [null, null], 'bez operace nebo kusů nic do Auditu');
  assert.deepStrictEqual(out.pcs, [2, ['Broušení ruční', 'Frézování CNC'], [75, 12]], 'nové operace bez skupiny, kusy po dnech');
  assert.deepStrictEqual(out.prod, [4, ['2026-10'], ['101', '102', '103']], 'Výroba ze stejných řádků (bez řádku bez pracovníka a souhrnu)');
  assert.strictEqual(out.v, 37, 'verze dat 37: starší stránka sloupec Operace ve Výrobě nesmaže');
  return null;
});

test('Shortage (2.36): doplnit chybějící – klíč položky, duplicity, odebrané, čištění a historie', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const it = (ean, order, extra) => ({ order, name: 'Díl ' + ean, ean, index: 'A', qty: '5', op: 'Broušení', link: '', code: '', ...extra });
    const keys = [shItemKey({ ean: ' 0085 940 ', index: 'a', order: 'o-1' }), shItemKey({ ean: '85940', index: 'A', order: 'O-1' }), shItemKey({ ean: '', name: 'Hřídel  Předlohová', index: '', order: '7' }), shItemKey({ name: 'hridel predlohova', order: '7' })];
    const list = { items: [it('111', 'O1'), it('222', 'O2'), it('222', 'O2'), it('333', 'O3', { top: true })], gone: [shItemKey(it('444', 'O4'))] };
    const incoming = [it('111', 'O1'), it('222', 'O2'), it('222', 'O2'), it('222', 'O2'), it('333', 'O3'), it('444', 'O4'), it('555', 'O5'), it('111', 'O9')];
    const p = shMergePlan(list, incoming, false), pb = shMergePlan(list, incoming, true);
    const sh = cleanShortage({ lists: [{ id: 'shA', at: Date.UTC(2026, 9, 26, 6), items: [it('111', 'O1')], gone: ['k1', 'k1', 7, '', 'x'.repeat(300)] }, { id: 'shB', at: 1, items: [it('9', 'O')] }] });
    const A = cleanShortage({ lists: [{ id: 'shA', at: Date.UTC(2026, 9, 26, 6), items: [{ ...it('111', 'O1'), id: 'si1' }] }] });
    const B = cleanShortage({ lists: [{ id: 'shA', at: Date.UTC(2026, 9, 26, 6), items: [{ ...it('111', 'O1'), id: 'si1' }, { ...it('555', 'O5'), id: 'si2' }, { ...it('666', 'O6'), id: 'si3', top: true }] }] });
    const log = []; shChanges(A, B, (kind, text, extra) => log.push([kind, text, extra && extra.m]));
    return JSON.stringify({ keys, add: p.add.map(i => i.ean + '/' + i.order), have: p.have, gone: p.gone.map(i => i.ean), back: pb.add.map(i => i.ean + '/' + i.order),
      clean: [sh.lists[0].gone.length, sh.lists[0].gone[0], sh.lists[0].gone[1].length, sh.lists[1].gone], order: B.lists[0].items.map(i => i.ean), log, v: DATA_VERSION });
  })()`));
  assert.strictEqual(out.keys[0], out.keys[1], 'EAN bez mezer a nul na začátku, index a objednávka bez ohledu na velikost písmen');
  assert.strictEqual(out.keys[2], out.keys[3], 'bez EANu podle názvu bez diakritiky');
  assert.notStrictEqual(out.keys[0], out.keys[2]);
  assert.deepStrictEqual(out.add, ['222/O2', '555/O5', '111/O9'], 'chybí třetí 222, nová 555 a 111 s jinou objednávkou');
  assert.strictEqual(out.have, 4, '111, dvakrát 222 a 333 už v seznamu jsou');
  assert.deepStrictEqual(out.gone, ['444'], 'ručně odebraná se sama nevrátí');
  assert.deepStrictEqual(out.back, ['222/O2', '444/O4', '555/O5', '111/O9'], 'na přání i odebraná');
  assert.deepStrictEqual(out.clean, [2, 'k1', 240, []], 'odebrané bez duplicit, jen text, nejvýš 240 znaků; starší seznam prázdné');
  assert.deepStrictEqual(out.order, ['666', '111', '555'], 'doplněná TOP jde nahoru, ostatní na konec');
  assert.ok(out.log.length === 1 && out.log[0][2] === 'shm:shA:si3' && /^Shortage: do seznamu 26\. 10\. 2026 \d+:00 doplněny 2 položky: 666 Díl 666, 555 Díl 555$/.test(out.log[0][1]), JSON.stringify(out.log));
  assert.strictEqual(out.v, 37, 'verze dat 37: starší stránka odebrané položky nesmaže');
  return null;
});

test('Docházka a výkony jediný zdroj od listopadu 2026 (2.42): docházka pro odměny, evidence práce, obsazenost v Auditu', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const ser = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5;
    const O31 = ser(2026, 10, 31), N2 = ser(2026, 11, 2), N3 = ser(2026, 11, 3);
    const att = [['ID', O31, null, N2, null, N3, null], [null, 'Příchod', 'Odchod', 'Příchod', 'Odchod', 'Příchod', 'Odchod'],
      [101, '6:00', '14:00', '6:00', '14:30', '6:00', '11:00'],
      [102, null, null, '14:00', '22:30', 'd', ''],
      [103, null, null, '6:00', '14:00', null, null],
      [999, null, null, '7:00', null, null, null],
      [104, null, null, null, null, null, null]];
    const work = [['ID', 'Datum', 'Zakázka', 'Díl', 'Operace', 'V zakázce', 'Hotovo', '', '', 'Čas (min)', 'Norma (min)'],
      [101, N2, 45100, 'Hřídel', 'Broušení', 100, 40, '', '', 120, 100],
      [101, N2, 45101, 'Kryt', 'Frézování', 50, 10, '', '', 60, null],
      [102, N3, 45102, 'Hřídel', 'Broušení', 100, 30, '', '', 200, 240],
      [101, O31, 45100, 'Hřídel', 'Broušení', 100, 5, '', '', 30, 30]];
    const st = blank();
    const grp = (id, name, dept) => { const g = mkPos(id, name, []); g.dept = dept; g.skillset = [{ id: 'k' + id, name: 'X', desc: '', scale: null }]; g.maxTab = 8; g.tiers = []; return g; };
    st.positions = [grp('g1', 'Brus A', 'Broušení'), grp('g2', 'Frézování', 'CNC')];
    st.employees['a|a'] = { key: 'a|a', last: 'Adamec', first: 'Adam', positionId: 'g1', shift: 'R', note: '', wid: '101' };
    st.employees['b|b'] = { key: 'b|b', last: 'Bartoš', first: 'Bořek', positionId: 'g2', shift: 'R', note: '', wid: '102' };
    st.employees['c|c'] = { key: 'c|c', last: 'Cibulka', first: 'Cyril', positionId: null, lead: ['Broušení'], note: '', wid: '103' };
    st.employees['d|d'] = { key: 'd|d', last: 'Dvořák', first: 'Dan', positionId: 'g1', shift: 'R', note: '', wid: '104' };
    st.periods['2026-10'] = { id: '2026-10', y: 2026, m: 10, days: ['2026-10-30', '2026-10-31'], rows: { 'a|a': { first: 'Adam', last: 'Adamec', h: [7.5, 0], c: [null, null] } }, codes: {}, file: 'stara.xlsx', at: 1, headerRow: 1 };
    st.production['2026-10'] = { id: '2026-10', names: { 'adam adamec': { name: 'Adam Adamec', total: 9, count: 1, days: {} } }, records: 1, total: 9, file: 'stara.xlsx', at: 1 };
    S = sanitizeState(st);
    const oct = JSON.stringify([S.periods['2026-10'], S.production['2026-10']]);
    const wa = S.workAudit;
    wa.groups.find(g => g.id === 'brus').mg = ['g1'];
    const dv = blankDv(); dv.cols.work.date = 'B'; dv.cols.work.norm = 'K';
    wa.dv.cols = dv.cols;
    const p = dvParse([{ name: 'Docházka', aoa: att }, { name: 'vykázaná práce', aoa: work }], wa.dv, 'min');
    const r = dvApply(wa, p, { name: 'dav.xlsx', by: 'T', at: Date.UTC(2026, 10, 3) }, {});
    S = sanitizeState(S);
    const P = S.periods['2026-11'];
    const row = k => P.rows[k] ? [P.rows[k].h, P.rows[k].c] : null;
    const prev = S.current; S.current = '2026-11';
    const attA = attendance(P, 'a|a'), attB = attendance(P, 'b|b'), attD = attendance(P, 'd|d');
    const pk = prodKeyFor('101'), prA = productionOf('a|a'), perfA = perfOf(attA, prA);
    S.current = prev;
    const day = iso => { const d = S.workAudit.days[iso]; return d ? [d.am.total, d.pm.total, d.am.abs, d.g.brus, d.g.frez] : null; };
    const pcs = Object.keys(S.workAudit.pcs).sort();
    const first = [day('2026-11-02'), day('2026-11-03')];
    // skupina Matice podle názvu: Frézování (bez výběru) = g2; změna výběru přepočítá dny
    S.workAudit.groups.find(g => g.id === 'brus').mg = ['g1', 'g2'];
    S.workAudit.groups.find(g => g.id === 'frez').mg = [];
    const ref = dvAuditRefresh(S.workAudit);
    const after = day('2026-11-02');
    // druhé nahrání jen 3. 11.: 2. 11. v docházce zůstane
    const att2 = [['ID', N3, null], [null, 'P', 'O'], [101, '6:00', '15:00'], [102, '6:00', '14:00']];
    const p2 = dvParse([{ name: 'Docházka', aoa: att2 }], S.workAudit.dv, 'min');
    const r2 = dvApply(S.workAudit, p2, { name: 'dav2.xlsx', at: Date.UTC(2026, 10, 3) }, {});
    const P2 = S.periods['2026-11'];
    const changes = []; waChanges(cleanWorkAudit({ groups: [{ id: 'x', name: 'X' }] }), cleanWorkAudit({ groups: [{ id: 'x', name: 'X', mg: ['g1'] }] }), (k, t, o) => changes.push([t, o && o.v0, o && o.v1]));
    return JSON.stringify({
      oct: oct === JSON.stringify([S.periods['2026-10'], S.production['2026-10']]),
      r: [r.periods, r.prod, r.occ, r.audit && r.audit.days],
      days: P.days, a: row('a|a'), b: row('b|b'), c: !!P.rows['c|c'], d: row('d|d'), codes: P.codes, file: P.file,
      att: [attA.totalHours, attA.workDays, attB.excusedDays, attB.totalHours, attD.absDays],
      prod: [pk, prA && prA.total, prA && prA.spent, prA && prA.norm, prA && prA.nspent, perfA.norm, Object.keys(S.production).sort(), S.production['2026-11'].time],
      first, after, ref, pcs,
      second: [r2.periods, P2.rows['a|a'].h, P2.rows['b|b'].h, P2.rows['b|b'].c],
      owns: [dvOwns('2026-10-31'), dvOwns('2026-11'), dvOwns('2027-01-05'), dvOwns('')],
      hours: [dvHours(360, 720), dvHours(360, 1000), dvHours(360, null), dvHours(null, null), dvHours(1320, 360)],
      changes, clean: cleanWorkAudit({ groups: [{ id: 'q', name: 'Q', mg: ['g1', 'g1', 'bad id', 5] }] }).groups[0].mg,
    });
  })()`));
  assert.ok(out.oct, 'říjen (docházka i evidence práce) zůstane ze starých souborů');
  assert.deepStrictEqual(out.r, [[{ m: '2026-11', days: 2, people: 4 }], [{ m: '2026-11', people: 2, records: 3 }], ['2026-11-02', '2026-11-03'], 2], 'listopad do odměn, evidence a Auditu, kusy jen od listopadu');
  assert.deepStrictEqual(out.days, ['2026-11-01', '2026-11-02', '2026-11-03']);
  assert.deepStrictEqual(out.a, [[0, 8, 5], [null, null, null]], 'pobyt bez 30 min přestávky nad 6 h');
  assert.deepStrictEqual(out.b, [[0, 8, 0], [null, null, 'D']], 'buňka bez času = kód nepřítomnosti');
  assert.ok(out.c, 'vedoucí s ID má docházku (do odměn se nepočítá jinde)');
  assert.deepStrictEqual(out.d, [[0, 0, 0], [null, null, null]], 'člověk v listu bez příchodů má prázdný řádek');
  assert.deepStrictEqual(out.codes, { D: 1 });
  assert.strictEqual(out.file, 'Docházka a výkony: dav.xlsx');
  assert.deepStrictEqual(out.att, [13, 2, 1, 8, 2], 'hodiny, omluvená D, absence bez příchodu');
  assert.deepStrictEqual(out.prod, ['a|a', 50, 180, 100, 120, 83.3, ['2026-10', '2026-11'], true], 'evidence práce podle ID, norma jen u řádků s normou');
  assert.deepStrictEqual(out.first, [[2, 1, 0, [1, 0], [0, 1]], [1, 0, 1, [1, 0], [0, 0]]], 'ranní před 12:00, vedoucí ne, neznámé ID jen v celku, skupina podle skupin Matice (Frézování podle názvu)');
  assert.deepStrictEqual(out.after, [2, 1, 0, [1, 1], [null, null]], 'po změně skupin Matice se dny přepočítají, absence zůstane');
  assert.deepStrictEqual(out.ref, ['2026-11-02', '2026-11-03']);
  assert.deepStrictEqual(out.pcs, ['2026-11-02', '2026-11-03'], 'kusy do Auditu od listopadu vždy, 31. 10. bez zaškrtnutí ne');
  assert.deepStrictEqual(out.second, [[{ m: '2026-11', days: 1, people: 2 }], [0, 8, 8.5], [0, 8, 7.5], [null, null, null]], 'další nahrání nahradí jen svoje dny');
  assert.deepStrictEqual(out.owns, [false, true, true, false]);
  assert.deepStrictEqual(out.hours, [6, 10.17, 7.5, 0, 7.5]);
  assert.strictEqual(out.changes.length, 1);
  assert.deepStrictEqual(out.changes[0].slice(1), ['podle názvu', 'Brus A'], 'historie: skupiny Matice u skupiny Auditu');
  assert.deepStrictEqual(out.clean, ['g1']);
  return null;
});
test('Audit (2.37): docházka a výkony z jednoho souboru – čtení, uložení, obsazenost po projektech, produktivita', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const ser = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5;
    const D1 = ser(2026, 10, 1), D2 = ser(2026, 10, 2), D3 = ser(2026, 10, 3);
    const att = [['Docházka – říjen 2026'], ['ID', D1, null, '2.10.2026', '2.10.2026', D3, null], [null, 'Příchod', 'Odchod', 'Příchod', 'Odchod', 'Příchod', 'Odchod'],
      [101, 0.25, 14.5 / 24, '6:05', '14:35', null, null],
      ['0102', D1 + 5 / 24, D1 + 13.5 / 24, 'D', '', 22 / 24, 6 / 24],
      ['999', '7:00', null, null, null, null, null],
      ['Celkem', 3, 3, 1, 1, 1, 1]];
    const work = [['ID zaměstnance', 'Datum', 'Zakázka', 'Název dílu', 'Operace', 'Množství v zakázce', 'Dokončené množství', 'Pozn.', '', 'Strávený čas (min)'],
      [101, D1, 45100, 'Hřídel', 'Broušení', 100, 40, '', '', 120],
      [101, D1, 45101, 'Kryt', 'Frézování', 50, 10, '', '', 60],
      ['102', D2, 45102, 'Hřídel', 'Broušení', 100, 30, '', '', 200],
      [101, D2 + 0.3, 45100, 'Hřídel', 'Broušení', 100, 20, '', '', '1:30'],
      [null, null, null, null, null, null, 112, null, null, 470]];
    const sheets = [{ name: 'dav.xlsx › Docházka', aoa: att }, { name: 'dav.xlsx › vykázaná práce', aoa: work }];
    const p = dvParse(sheets, blankDv(), 'auto');
    const st = blank();
    const grp = (id, name) => { const g = mkPos(id, name, []); g.skillset = [{ id: 'k' + id, name: 'X', desc: '', scale: null }]; g.maxTab = 8; g.tiers = []; return g; };
    st.positions = [grp('g1', 'Brus'), grp('g2', 'CNC')];
    st.employees['a|a'] = { key: 'a|a', last: 'Adamec', first: 'Adam', positionId: 'g1', shift: 'R', note: '', wid: '101' };
    st.employees['b|b'] = { key: 'b|b', last: 'Bartoš', first: 'Bořek', positionId: 'g2', shift: 'R', note: '', wid: '102' };
    S = sanitizeState(st);
    const r = dvApply(S.workAudit, p, { name: 'dav.xlsx', by: 'T', at: Date.UTC(2026, 9, 3) }, { audit: true });
    S = sanitizeState(S);
    const now = new Date(2026, 9, 1, 10, 0).getTime();
    const d1 = dvDay('2026-10-01', { now });
    const m = dvMonth('2026-10', { now });
    const pa = dvPerson('a|a', '2026-10', '2026-10');
    const opsA = S.workAudit.ops.map(o => [o.name, o.group]);
    const pcs = Object.fromEntries(Object.entries(S.workAudit.pcs).map(([iso, d]) => [iso, Object.fromEntries(Object.entries(d).map(([id, ks]) => [S.workAudit.ops.find(o => o.id === id).name, ks]))]));
    const again = sanitizeState(JSON.parse(JSON.stringify(S))).workAudit.dv;
    const log = []; waChanges(blankWorkAudit(), { ...blankWorkAudit(), dv: { ...blankDv(), unit: 'h' } }, (k, t, x) => log.push([k, t, x && x.m]));
    return JSON.stringify({
      att: [p.att.ok, p.att.from, p.att.to, p.att.days, p.att.people, p.att.rows, p.att.codes, p.att.pres['2026-10-01'], p.att.pres['2026-10-02'], p.att.pres['2026-10-03']],
      work: [p.work.ok, p.work.rows, p.work.unit, p.work.dateCol, p.work.dated, p.work.from, p.work.to, p.work.t, p.work.g, p.work.f, p.work.people],
      clock: [dvClock(0.5), dvClock('06:30:00'), dvClock('1.10.2026 7:15'), dvClock(6.5), dvClock(D1 + 0.75), dvClock('D'), dvClock(30), dvStay(1320, 360), dvStay(360, null)],
      dur: [dvDur(90, 'min'), dvDur(1.5, 'h'), dvDur(1 / 16, 'frac'), dvDur('2:15', 'min'), dvDur('x', 'min')],
      apply: [r.days, r.months, r.audit && r.audit.days], perf: S.workAudit.dv.perf['2026-10']['101'], pcs, opsA,
      d1: [d1.n, d1.now, d1.min, d1.open, d1.unknown, d1.groups.map(g => [g.name, g.n, g.now, g.people.map(x => x.wid)])],
      month: [m.days.map(d => [d.iso, d.n, d.by]), m.groups.map(g => [g.name, g.people, g.t, g.g]), m.people.map(q => [q.wid, q.days, q.min, q.t, q.g, q.top]), m.tot.avg],
      person: [pa.days, pa.min, pa.t, pa.g, pa.f, Math.round(pa.util * 1000) / 1000, Math.round(pa.perHour * 100) / 100, pa.parts.map(x => [x.name, x.t, x.g]), pa.ops.map(x => x.name)],
      noId: dvPerson('zz', '2026-10', '2026-10'),
      same: JSON.stringify(again) === JSON.stringify(S.workAudit.dv), files: S.workAudit.dv.files.map(f => [f.name, f.from, f.to, f.people, f.days, f.rows, f.months]),
      dirty: cleanDv({ cols: { att: { id: '1x', first: 'C' }, work: { date: 'b' } }, unit: 'x', pres: { '2026-10-01': { '101': [-5, 2000], 'X Y': [1, 2], '7': ['60', null] }, 'bad': {} }, perf: { '2026-1': {}, '2026-10': { '101': { p: { '': [1], 'Díl': ['3', -2, 5, 1.6] } } } } }),
      noDate: (() => { const w2 = work.map(r => r.filter((_, i) => i !== 1)).map(r => [r[0], null, ...r.slice(1)]); w2[0][9] = 'Čas'; w2.forEach((r, i) => { if (i && typeof r[9] === 'number') r[9] = r[9] / 60; }); const q = dvParseWork({ name: 'x', aoa: w2 }, DV_COLS.work, 'auto'); const w3 = work.map((r, i) => (i ? r : ['ID', 'Den výkazu', ...r.slice(2)])); w3[0][1] = 'Kdy'; const q3 = dvParseWork({ name: 'x', aoa: w3, dateCols: new Set([1]) }, DV_COLS.work, 'auto'); const q4 = dvParseWork({ name: 'x', aoa: w3 }, DV_COLS.work, 'auto'); return [q.dated, q.dateCol, q.unit, q.t, q3.dateCol, q4.dateCol]; })(),
      log, v: DATA_VERSION });
  })()`));
  assert.deepStrictEqual(out.att.slice(0, 7), [true, '2026-10-01', '2026-10-03', 3, 3, 3, 1], 'tři dny, tři lidé, řádek Celkem a podnadpis přeskočené, kód D');
  assert.deepStrictEqual(out.att.slice(7), [{ 101: [360, 870], 102: [300, 810], 999: [420, null] }, { 101: [365, 875] }, { 102: [1320, 360] }], 'zlomek dne, datum s časem, text, bez odchodu, přes půlnoc; ID 0102 = 102');
  assert.deepStrictEqual(out.work, [true, 4, 'min', 'B', true, '2026-10-01', '2026-10-02', 470, 100, 350, 2], 'sloupec s datem B (ne čísla zakázek), čas v minutách podle hlavičky, 1:30 = 90 min');
  assert.deepStrictEqual(out.clock, [720, 390, 435, 390, 1080, null, null, 480, null]);
  assert.deepStrictEqual(out.dur, [90, 90, 90, 135, null]);
  assert.deepStrictEqual(out.apply, [3, ['2026-10'], 2]);
  assert.deepStrictEqual(out.perf, { p: { Hřídel: [60, 200, 210, 2], Kryt: [10, 50, 60, 1] }, o: { Broušení: [60, 210, 2], Frézování: [10, 60, 1] } });
  assert.deepStrictEqual(out.pcs, { '2026-10-01': { Broušení: 40, Frézování: 10 }, '2026-10-02': { Broušení: 50 } }, 'kusy podle operací i do Auditu');
  assert.deepStrictEqual(out.opsA, [['Broušení', ''], ['Frézování', '']], 'nové operace bez skupiny');
  assert.deepStrictEqual(out.d1, [3, 3, 1020, 1, ['999'], [['Brus', 1, 1, ['101']], ['CNC', 1, 1, ['102']], ['Neznámé ID', 1, 1, ['999']]]], 'projekty podle Matice, v 10:00 v práci všichni tři');
  assert.deepStrictEqual(out.month[0], [['2026-10-01', 3, { g1: 1, g2: 1, '?': 1 }], ['2026-10-02', 1, { g1: 1 }], ['2026-10-03', 1, { g2: 1 }]]);
  assert.deepStrictEqual(out.month[1], [['Brus', 1, 270, 70], ['CNC', 1, 200, 30], ['Neznámé ID', 1, 0, 0]]);
  assert.deepStrictEqual(out.month[2], [['101', 2, 1020, 270, 70, 'Hřídel'], ['102', 2, 990, 200, 30, 'Hřídel'], ['999', 1, 0, 0, 0, '']]);
  assert.strictEqual(out.month[3], 5 / 3);
  assert.deepStrictEqual(out.person, [2, 1020, 270, 70, 250, 0.265, 15.56, [['Hřídel', 210, 60], ['Kryt', 60, 10]], ['Broušení', 'Frézování']], 'využití = vykázaný čas ÷ čas v práci, ks/h z vykázaného času');
  assert.deepStrictEqual(out.noId, { noId: true });
  assert.ok(out.same, 'čištění nic nezmění');
  assert.deepStrictEqual(out.files, [['dav.xlsx', '2026-10-01', '2026-10-03', 3, 3, 4, ['2026-10']]]);
  assert.deepStrictEqual(out.dirty.cols, { att: { id: 'A', first: 'C' }, work: { id: 'A', part: 'D', op: 'E', order: 'F', done: 'G', time: 'J', date: 'B', norm: '' } });
  assert.deepStrictEqual([out.dirty.unit, out.dirty.pres, out.dirty.perf], ['auto', { '2026-10-01': { 7: [60, null] } }, { '2026-10': { 101: { p: { Díl: [3, 0, 5, 2] }, o: {} } } }], 'jen platné ID, časy a čísla');
  assert.deepStrictEqual(out.noDate, [false, '', 'h', 470, 'B', ''], 'čísla zakázek nejsou datum; čas v hodinách podle hodnot; sloupec bez hlavičky Datum jen s formátem data');
  assert.deepStrictEqual(out.log, [['workaudit', 'Audit: změněny sloupce souboru docházky a výkonů', 'wadvcols']]);
  assert.strictEqual(out.v, 37, 'verze dat 37: starší stránka docházku a výkony nesmaže');
  return null;
});

test('Kontroly (2.37): každý den podle nahraných příchodů – losuje se jen z lidí v práci, týdenní podíl se dorovná', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    S = blank();
    const lvl = () => [1, 2, 3, 4].map(n => ({ name: 'L' + n, tabaky: n * 2, desc: '' }));
    S.positions = [
      { id: 'p_cnc', name: 'CNC', dept: 'Obrobna', max: null, levels: lvl(), penalty: [], bonus: [] },
      { id: 'p_kon', name: 'Kontrola', dept: 'Kontrola kvality', max: null, levels: lvl(), penalty: [], bonus: [] },
    ];
    const add = (k, pos, wid) => { S.employees[k] = { key: k, last: 'Příjmení' + k, first: 'Jan', positionId: pos, level: 1, note: '', wid }; };
    for (let i = 0; i < 8; i++) add('c' + i, 'p_cnc', String(i + 1));
    for (let i = 0; i < 4; i++) add('k' + i, 'p_kon', String(11 + i));
    S.audit.settings = { pct: 25, mode: 'day' };
    S.audit.tasks['Obrobna'] = [{ id: 't1', text: 'Úklid' }];
    S = sanitizeState(S);
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const meta = d => ({ at: Date.UTC(2026, 9, d, 6), by: 'Mistr' });
    const pres = (iso, wids) => { S.workAudit.dv.pres[iso] = Object.fromEntries(wids.map(w => [w, [360, null]])); };
    const err = f => { try { f(); return ''; } catch (e) { return e.message; } };
    pres('2026-10-26', ['1', '2', '3', '99']);
    const g1 = generateDayChecks('2026-W44', '2026-10-26', meta(26), rnd);
    const d26 = audPlan('2026-W44').items.filter(i => i.day === '2026-10-26').map(i => [i.key, i.dept]);
    const again = generateDayChecks('2026-W44', '2026-10-26', meta(26), rnd);
    const d26b = audPlan('2026-W44').items.filter(i => i.day === '2026-10-26').length;
    const first = audPlan('2026-W44').items.find(i => i.day === '2026-10-26');
    const sub = substituteCheck('2026-W44', first.id, 'odešel k lékaři', meta(26), rnd);
    recordCheck('2026-W44', sub.id, { date: '2026-10-26', answers: { t1: true } }, meta(26));
    pres('2026-10-27', ['1', '2', '3', '4', '5', '6', '7', '8', '12']);
    const g2 = generateDayChecks('2026-W44', '2026-10-27', meta(27), rnd);
    const d27 = audPlan('2026-W44').items.filter(i => i.day === '2026-10-27').map(i => [i.dept, ['1','2','3','4','5','6','7','8','12'].includes(S.employees[i.key].wid)]);
    pres('2026-10-29', ['1', '2', '3', '4', '5', '6', '7', '8', '11', '12', '13', '14']);
    const g3 = generateDayChecks('2026-W44', '2026-10-29', meta(29), rnd);
    const keys = audPlan('2026-W44').items.filter(i => i.state !== 'skip').map(i => i.key);
    return JSON.stringify({
      g1: [g1.added, g1.present, g1.unknown, g1.short], d26: d26.map(x => [['c0', 'c1', 'c2'].includes(x[0]), x[1]]), d26b,
      sub: [first.state, ['c0', 'c1', 'c2'].includes(sub.key), sub.key !== first.key],
      g2: [g2.added, g2.short], d27, g3: [g3.added, g3.short], uniq: new Set(keys).size === keys.length,
      holiday: err(() => generateDayChecks('2026-W44', '2026-10-28', meta(28), rnd)),
      noPres: err(() => generateDayChecks('2026-W44', '2026-10-30', meta(30), rnd)),
      mode: [audSet().mode, sanitizeState({ ...S, audit: { ...S.audit, settings: { pct: 30, mode: 'x' } } }).audit.settings],
      present: (() => { const h = audPresent('2026-10-26'); return [[...h.keys].sort(), h.unknown, h.n, audPresent('2026-10-30')]; })(),
      log: (() => { const a = sanitizeState(S), b = JSON.parse(JSON.stringify(a)); a.audit.settings = { pct: 25 }; return describeChanges(a, b, { at: 1 }).entries.filter(e => /výběr lidí/.test(e.text)).map(e => e.text); })(),
    });
  })()`));
  // týden 44: 28. 10. je svátek, pracovní dny 26., 27., 29., 30. → Obrobna 2 z 8, Kontrola 1 ze 4
  assert.deepStrictEqual(out.g1, [1, 4, 1, [{ dept: 'Kontrola kvality', need: 1, got: 0 }]], 'Obrobna 1 (2 za týden ÷ 4 dny), z Kontroly nikdo nepřišel');
  assert.deepStrictEqual(out.d26, [[true, 'Obrobna']], 'vylosován jen někdo, kdo přišel');
  assert.strictEqual(out.d26b, 1, 'nové losování dne nahradí nezapsané kontroly toho dne');
  assert.deepStrictEqual(out.sub, ['skip', true, true], 'náhradník jen z lidí, kteří ten den přišli');
  assert.deepStrictEqual(out.g2, [2, []]);
  assert.deepStrictEqual(out.d27.map(x => x[1]), [true, true], 'oba vylosovaní 27. 10. přišli');
  assert.deepStrictEqual(out.d27.map(x => x[0]).sort(), ['Kontrola kvality', 'Obrobna'], 'Kontrola kvality se dorovná, Obrobna dostane zbytek týdne');
  assert.deepStrictEqual(out.g3, [0, []], 'týdenní podíl splněný, další den už nikoho');
  assert.ok(out.uniq, 'nikdo dvakrát v týdnu');
  assert.match(out.holiday, /není pracovní den/);
  assert.match(out.noPres, /nejsou nahrané příchody/);
  assert.deepStrictEqual(out.mode, ['day', { pct: 30 }], 'režim týden se neukládá (starší data beze změny)');
  assert.deepStrictEqual(out.present, [['c0', 'c1', 'c2'], ['99'], 4, null]);
  assert.deepStrictEqual(out.log, ['Kontroly – výběr lidí: Na týden dopředu → Každý den podle příchodů']);
  return null;
});

test('Plán kapacit (2.38): potřeba po úrovních, máme, doplnit, doškolit s kandidáty, čištění a historie', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const st = blank();
    const grp = (id, name, dept, n) => { const p = mkPos(id, name, []); p.dept = dept; p.skillset = Array.from({ length: n }, (_, i) => ({ id: id + 's' + i, name: 'D' + i, desc: '', scale: null })); p.maxTab = 8; p.tiers = []; return p; };
    st.positions = [grp('g1', 'Brus', 'Brus', 4), grp('g2', 'CNC', 'Obrobna', 2), grp('g3', 'Frézka', 'Obrobna', 2), grp('g4', 'Lepení', 'Lepení', 1)];
    // Brus: hodnocení 4 dovedností → procenta 100, 75, 62.5 (úroveň 2), 50, 25, 0
    const rate = (g, vals) => Object.fromEntries(vals.map((v, i) => [g + 's' + i, v]).filter(x => x[1]));
    const add = (k, g, vals, extra) => { st.employees[k] = { key: k, last: 'P' + k, first: 'J', positionId: g, shift: 'R', note: '', wid: k.slice(1), rate: rate(g, vals), ...(extra || {}) }; };
    add('b1', 'g1', [4, 4, 4, 4]); add('b2', 'g1', [3, 3, 3, 3]); add('b3', 'g1', [3, 3, 2, 2]); add('b4', 'g1', [2, 2, 2, 2]);
    add('b5', 'g1', [1, 1, 1, 1], { sick: '2026-10-28' }); add('b6', 'g1', []); add('b7', 'g1', [4, 4, 4, 4], { excluded: true });
    add('c1', 'g2', [4, 4]); add('c2', 'g2', [2, 2]);
    add('f1', 'g3', [3, 3]);
    S = sanitizeState(st);
    // Brus: potřeba 8 lidí, 2+ 5, 3+ 3, 4 2 → máme 6 / 4 / 2 / 1
    setCapNeed('g1', { n: 8 }); setCapNeed('g1', { l2: 5 }); setCapNeed('g1', { l3: 3 }); setCapNeed('g1', { l4: 2 });
    setCapNeed('g2', { l3: 2 });          // zvedne celkem a 2+ na 2
    setCapNeed('g3', { n: 1, l2: 1 });    // v pořádku
    const up = setCapNeed('g3', { l4: 3 }), down = setCapNeed('g3', { n: 2 });
    setCapNeed('g3', { n: 1, l2: 1, l3: 0, l4: 0 });
    const all = capPlanAll({ now: Date.UTC(2026, 9, 30, 9) });
    const g = id => all.groups.find(x => x.p.id === id);
    const b = g('g1'), c = g('g2'), f = g('g3'), l = g('g4');
    const before = sharedState(S);
    S.capPlan.note = 'Nábor do konce roku';
    const log = []; const ad = (k, t, x) => log.push([k, t, x && x.m, x && x.v0, x && x.v1]);
    cpChanges(blankCapPlan(), S.capPlan, ad, S);
    const dirty = cleanCapPlan({ groups: { g1: { n: '5', l2: 9, l3: -1, l4: 2 }, zz: { n: 3 }, 'x y': { n: 1 }, g4: { n: 0 } }, note: 7, at: 'x' }, new Set(['g1', 'g4']));
    const again = sanitizeState(JSON.parse(JSON.stringify(S)));
    const old = sanitizeState((() => { const o = JSON.parse(JSON.stringify(S)); delete o.capPlan; return o; })());
    return JSON.stringify({
      b: [b.have, b.need, b.hire, b.hireLv, b.gap, b.train, b.trainN, b.cand.map(x => [x.key, x.to, x.pct]), b.sick, b.state, b.members.map(m => [m.key, m.lvl])],
      c: [c.need, c.have, c.hire, c.trainN, c.cand.map(x => [x.key, x.to]), c.state],
      f: [f.state, f.extra], l: [l.state, l.set], up, down,
      depts: all.depts.map(d => [d.dept, d.groups.map(x => x.p.id), d.tot.need.n, d.tot.have.n, d.tot.hire, d.tot.trainN]),
      tot: [all.tot.need.n, all.tot.have.n, all.tot.hire, all.tot.trainN, all.setN, all.okN, all.pres],
      log, dirty, same: JSON.stringify(again.capPlan) === JSON.stringify(S.capPlan), old: old.capPlan, v: DATA_VERSION,
    });
  })()`));
  assert.deepStrictEqual(out.b[10], [['b1', 4], ['b2', 3], ['b3', 2], ['b4', 2], ['b5', 1], ['b6', 0]], 'úroveň dolů z procenta (62,5 % = 2), vyřazený se nepočítá');
  assert.deepStrictEqual(out.b[0], { n: 6, l2: 4, l3: 2, l4: 1 });
  assert.deepStrictEqual(out.b[1], { n: 8, l2: 5, l3: 3, l4: 2 });
  assert.deepStrictEqual([out.b[2], out.b[3]], [2, { 2: 0, 3: 0, 4: 0 }], 'doplnit 2 (8 − 6); s úrovní ne, doškolit jde ze skupiny');
  assert.deepStrictEqual([out.b[4], out.b[5]], [{ 2: 1, 3: 1, 4: 1 }, { 2: 1, 3: 1, 4: 1 }]);
  assert.deepStrictEqual(out.b[7], [['b2', 4, 75], ['b3', 3, 62.5], ['b5', 2, 25]], 'na 4 nejbližší (75 %), na 3 další (62,5 %), na 2 další pod 50 %');
  assert.deepStrictEqual([out.b[6], out.b[8], out.b[9]], [3, 1, 'hire']);
  assert.deepStrictEqual(out.c, [{ n: 2, l2: 2, l3: 2, l4: 0 }, { n: 2, l2: 2, l3: 1, l4: 1 }, 0, 1, [['c2', 3]], 'train'], 'vyšší úroveň zvedne nižší; doškolit c2 na 3');
  assert.deepStrictEqual([out.f, out.l], [['ok', 0], ['none', false]]);
  assert.deepStrictEqual([out.up, out.down], [{ n: 3, l2: 3, l3: 3, l4: 3 }, { n: 2, l2: 2, l3: 2, l4: 2 }], 'úpravy drží l4 ≤ l3 ≤ l2 ≤ n');
  assert.deepStrictEqual(out.depts, [['Brus', ['g1'], 8, 6, 2, 3], ['Obrobna', ['g2', 'g3'], 3, 3, 0, 1], ['Lepení', ['g4'], 0, 0, 0, 0]]);
  assert.deepStrictEqual(out.tot, [11, 9, 2, 4, 3, 1, null], 'souhrn jen ze skupin s plánem, bez docházky null');
  assert.deepStrictEqual(out.log.map(x => x[2]), ['cp:g1', 'cp:g2', 'cp:g3', 'cpnote']);
  assert.deepStrictEqual(out.log[0].slice(3), ['bez plánu', '8 lidí (2+ 5, 3+ 3, 4 2)']);
  assert.deepStrictEqual(out.dirty, { groups: { g1: { n: 5, l2: 5, l3: 0, l4: 0 } }, note: '7', by: '', at: 0 }, 'jen známé skupiny, srovnané počty');
  assert.ok(out.same, 'čištění nic nezmění');
  assert.deepStrictEqual(out.old, { groups: {}, note: '', by: '', at: 0 }, 'starší data začnou s prázdným plánem');
  assert.strictEqual(out.v, 37);
  return null;
});

test('Rychlá kontrola (2.39): počet lidí, rozdělení mezi oddělení, směna, příchody, přednost, výměna a uložení', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    S = blank();
    const lvl = () => [1, 2, 3, 4].map(n => ({ name: 'L' + n, tabaky: n * 2, desc: '' }));
    S.positions = [
      { id: 'p_cnc', name: 'CNC', dept: 'Obrobna', max: null, levels: lvl(), penalty: [], bonus: [] },
      { id: 'p_kon', name: 'Kontrola', dept: 'Kontrola kvality', max: null, levels: lvl(), penalty: [], bonus: [] },
    ];
    const add = (k, pos, wid, shift) => { S.employees[k] = { key: k, last: 'P' + k, first: 'Jan', positionId: pos, level: 1, note: '', wid, shift }; };
    for (let i = 0; i < 8; i++) add('c' + i, 'p_cnc', String(i + 1), i < 4 ? 'R' : 'O');
    for (let i = 0; i < 4; i++) add('k' + i, 'p_kon', String(11 + i), i < 2 ? 'R' : 'O');
    add('v1', 'p_cnc', '50', 'R'); S.employees.v1.lead = ['Obrobna'];
    add('x1', 'p_cnc', '51', 'R'); S.employees.x1.excluded = true;
    S.employees.c7.sick = '2026-10-01';
    S.audit.tasks['Obrobna'] = [{ id: 't1', text: 'Úklid' }];
    S = sanitizeState(S);
    const meta = { at: Date.UTC(2026, 9, 30, 7), by: 'Mistr' };
    // c0 zkontrolovaný minulý týden, k0 má kontrolu v tomto týdnu
    addToPlan('2026-W43', 'c0', '2026-10-20', meta);
    recordCheck('2026-W43', audPlan('2026-W43').items[0].id, { date: '2026-10-20', answers: { t1: true } }, meta);
    addToPlan('2026-W44', 'k0', '2026-10-27', meta);
    const T = '2026-10-30';
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const dep = l => l.reduce((m, x) => { m[x.dept] = (m[x.dept] || 0) + 1; return m; }, {});
    const pool = quickPool({ today: T });
    const all = [];
    for (let i = 0; i < 40; i++) all.push(quickPick({ n: 5, today: T }, rnd));
    const a = all[0];
    const c0 = all.filter(r => r.list.some(x => x.key === 'c0')).length;
    const ob = quickPick({ n: 10, dept: 'Obrobna', slot: 'am', today: T }, rnd);
    const big = quickPick({ n: 9, today: T }, rnd);
    S.workAudit.dv.pres[T] = { '2': [360, null], '6': [840, null], '12': [360, 900], '13': [null, null], '99': [360, null] };
    const pr = quickPick({ n: 10, present: true, today: T }, rnd);
    const noPres = quickPick({ n: 10, present: true, today: '2026-10-29' }, rnd);
    const keys = a.list.map(x => x.key);
    const oKey = a.list.find(x => x.dept === 'Obrobna').key;
    const sw = quickSwap({ today: T }, keys, oKey, rnd);
    const swOnly = quickSwap({ today: T, dept: 'Kontrola kvality' }, ['k1', 'k2', 'k3'], 'k1', rnd);
    const err = f => { try { f(); return ''; } catch (e) { return e.message; } };
    const sv = quickSave(keys, meta, T);
    const sv2 = quickSave(keys, meta, T);
    const after = quickPool({ today: T }).list.map(x => x.key);
    return JSON.stringify({
      pool: [pool.list.length, pool.busy, pool.list.map(x => x.key).sort()],
      sizes: all.map(r => [r.list.length, r.pool, r.short, new Set(r.list.map(x => x.key)).size]).every(x => x.join() === '5,10,0,5'),
      split: all.every(r => { const d = dep(r.list); return (d['Obrobna'] === 3 || d['Obrobna'] === 4) && d['Obrobna'] + (d['Kontrola kvality'] || 0) === 5; }),
      c0, last: a.list.find(x => x.key === 'c0') ? 'c0' : '',
      ob: [ob.list.map(x => x.key).sort(), ob.want, ob.short, ob.list.every(x => x.slot === 'am')],
      obLast: ob.list[ob.list.length - 1].key, obLastDay: ob.list.find(x => x.key === 'c0').last,
      big: [big.list.length, big.short, dep(big.list)],
      pr: [pr.list.map(x => x.key).sort(), pr.present], noPres: noPres.list.length,
      sw: [sw.dept, keys.includes(sw.key), sw.key !== oKey], swOnly: swOnly ? swOnly.key : null,
      sv: [sv.week, sv.day, sv.added.length, sv.added.every(i => i.extra && i.state === 'plan' && i.day === T)],
      sv2: sv2.added.length, after: after.some(k => keys.includes(k)),
      weekend: err(() => quickSave(['c1'], meta, '2026-10-31')),
      holiday: err(() => quickSave(['c1'], meta, '2026-10-28')),
    });
  })()`));
  assert.deepStrictEqual(out.pool, [10, 1, ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'k1', 'k2', 'k3']], 'bez nemocného, vedoucího, vyřazeného a k0 s kontrolou v týdnu');
  assert.ok(out.sizes, 'vždy 5 různých lidí z 10');
  assert.ok(out.split, 'Obrobna 7 a Kontrola 3 z 10 → 3,5 : 1,5');
  assert.strictEqual(out.c0, 0, 'c0 (kontrola minulý týden) má nejnižší přednost, v Obrobně se vybírají 3–4 ze 7');
  assert.deepStrictEqual(out.ob, [['c0', 'c1', 'c2', 'c3'], 10, 6, true], 'jen ranní z Obrobny, chybí 6');
  assert.deepStrictEqual([out.obLast, out.obLastDay], ['c0', '2026-10-20'], 'nejdéle nekontrolovaní první, c0 poslední');
  assert.deepStrictEqual(out.big, [9, 0, { Obrobna: 6, 'Kontrola kvality': 3 }], '9 × 0,7 = 6,3 → 6; 9 × 0,3 = 2,7 → 3');
  assert.deepStrictEqual(out.pr, [['c1', 'c5', 'k1'], 4], 'jen lidé s dnešním příchodem (bez prázdného řádku, neznámé ID se počítá do přítomných)');
  assert.strictEqual(out.noPres, 0, 'bez příchodů na ten den nikdo');
  assert.deepStrictEqual(out.sw, ['Obrobna', false, true], 'náhradník ze stejného oddělení, který v seznamu není');
  assert.strictEqual(out.swOnly, null, 'v oddělení nikdo nezbyl');
  assert.deepStrictEqual(out.sv, ['2026-W44', '2026-10-30', 5, true]);
  assert.strictEqual(out.sv2, 0, 'podruhé se nepřidá nikdo');
  assert.strictEqual(out.after, false, 'uložení už se nelosují');
  assert.match(out.weekend, /není pracovní den/);
  assert.match(out.holiday, /není pracovní den/);
  return null;
});

test('Úvod HALA 2 (2.39.3): skutečná obsazenost podle dnešních příchodů – směna podle příchodu, oddělení, teď v práci', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    S = blank();
    const lvl = () => [1, 2, 3, 4].map(n => ({ name: 'L' + n, tabaky: n * 2, desc: '' }));
    S.positions = [
      { id: 'p_cnc', name: 'CNC', dept: 'Obrobna', max: null, levels: lvl(), penalty: [], bonus: [] },
      { id: 'p_kon', name: 'Kontrola', dept: 'Kontrola kvality', max: null, levels: lvl(), penalty: [], bonus: [] },
    ];
    const add = (k, pos, wid, shift) => { S.employees[k] = { key: k, last: 'P' + k, first: 'Jan', positionId: pos, level: 1, note: '', wid, shift }; };
    add('c1', 'p_cnc', '1', 'R'); add('c2', 'p_cnc', '2', 'R'); add('c3', 'p_cnc', '3', 'O'); add('c4', 'p_cnc', '4', 'S1');
    add('k1', 'p_kon', '11', 'R'); add('k2', 'p_kon', '12', 'O'); add('x1', '', '21', 'R');
    add('v1', 'p_cnc', '50', 'R'); S.employees.v1.lead = ['Obrobna'];
    S = sanitizeState(S);
    const T = '2026-10-30', now = new Date(2026, 9, 30, 15, 0).getTime();
    S.workAudit.dv.pres[T] = { '1': [360, 840], '2': [365, null], '3': [840, null], '4': [null, 1320], '11': [355, 830], '12': [860, null], '21': [400, null], '50': [350, null], '99': [370, null] };
    S.workAudit.dv.files = [{ name: 'a.xlsx', at: 111, by: 'M', from: '2026-10-01', to: T }, { name: 'b.xlsx', at: 222, by: 'Mistr', from: T, to: T }, { name: 'c.xlsx', at: 333, by: 'X', from: '2026-09-01', to: '2026-09-30' }];
    const r = staffReal(T, 'S2', { now });
    const none = staffReal('2026-10-29', 'S2', { now });
    return JSON.stringify({ t: [r.n, r.am, r.pm, r.now, r.lead, r.unknown, r.at, r.by], d: [...r.depts.entries()], none });
  })()`));
  // c1, c2, k1, x1 a 99 ráno; c3, k2 odpoledne; c4 bez příchodu → S1 v týdnu, kdy má ranní S2 = odpolední
  assert.deepStrictEqual(out.t, [9 - 1, 5, 3, 5, 1, 1, 222, 'Mistr'], 'vedoucí zvlášť, teď v práci = přišel a neodešel (15:00)');
  assert.deepStrictEqual(out.d, [
    ['Obrobna', { am: 2, pm: 2, now: 2 }],
    ['Kontrola kvality', { am: 1, pm: 1, now: 1 }],
    ['Bez skupiny', { am: 1, pm: 0, now: 1 }],
    ['Neznámé ID', { am: 1, pm: 0, now: 1 }],
  ]);
  assert.strictEqual(out.none, null, 'bez příchodů na den null');
  return null;
});

test('Report docházky (2.40): plnění denního požadavku z příchodů – den, týden, rok, plán, svátek, Excel', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    S = blank();
    const lvl = () => [1, 2, 3, 4].map(n => ({ name: 'L' + n, tabaky: n * 2, desc: '' }));
    S.positions = [{ id: 'g1', name: 'Brus', dept: 'Brus', max: null, levels: lvl(), penalty: [], bonus: [] }, { id: 'g2', name: 'CNC', dept: 'Obrobna', max: null, levels: lvl(), penalty: [], bonus: [] }];
    const add = (k, pos, wid) => { S.employees[k] = { key: k, last: 'P' + k, first: 'Jan', positionId: pos, level: 1, note: '', wid }; };
    ['1', '2', '3', '4'].forEach(w => add('b' + w, 'g1', w)); ['11', '12'].forEach(w => add('c' + w, 'g2', w));
    add('v', 'g1', '50'); S.employees.v.lead = ['Brus'];
    S = sanitizeState(S);
    S.capPlan.groups.g1 = { n: 5, l2: 0, l3: 0, l4: 0 };
    S.workAudit.target = 6;
    S.employees.b4.sick = '2026-10-27';
    const p = (iso, w) => { S.workAudit.dv.pres[iso] = Object.fromEntries(w.map(x => [x, [360, null]])); };
    p('2026-10-26', ['1', '2', '3', '4', '11', '12', '50']);
    p('2026-10-27', ['1', '2', '11', '12', '77']);
    p('2026-10-28', ['1', '2']);
    const now = Date.UTC(2026, 9, 27, 9);
    const d = drReport('day', '2026-10-27', { now });
    const w = drReport('week', '2026-10-27', { now });
    const y = drReport('year', '2026-10-27', { now });
    const none = S.workAudit.target; S.workAudit.target = null;
    const own = drReport('day', '2026-10-26', { now }).req;
    S.workAudit.target = none;
    const sh = drSheets(w);
    return JSON.stringify({
      d: [d.d.kind, d.d.plan, d.d.done, d.d.met, d.d.rows.map(r => [r.name, r.plan, r.done, r.note])],
      w: [w.n, w.met, w.pct, w.nf, w.futMet, w.weekend, w.noData, w.trend.map(t => [t.iso, t.kind, t.value, t.met]), w.groupsReal.map(g => [g.name, g.sumDone, g.daysMet, g.cnt])],
      y: [y.trend[9], y.trend[10].kind, y.trend[8].kind], own, sh: [sh.map(x => x.name), sh[0].rows[0].slice(0, 9), sh[0].rows[3].slice(0, 8)],
    });
  })()`));
  // 27. 10.: Brus plán 5 (Plán kapacit), přišli 2, b3 chybí, b4 nemocný; CNC 2/2; ID 77 neznámé
  assert.deepStrictEqual(out.d, ['real', 7, 5, false, [['Brus', 5, 2, 'nemoc 1 · nepřišli ID 3'], ['CNC', 2, 2, ''], ['Neznámé ID', 0, 1, '']]]);
  // týden: 26. splněno (6, vedoucí ne), 27. ne, 28. svátek (přesčas), 29.–30. plán (Brus 5 − nemocný = 4, CNC 2, celkem 6 = splněno)
  assert.deepStrictEqual(out.w.slice(0, 7), [2, 1, 50, 2, 2, 1, 0]);
  assert.deepStrictEqual(out.w[7].map(t => t[0] + t[1]), ['2026-10-26real', '2026-10-27real', '2026-10-29plan', '2026-10-30plan']);
  assert.deepStrictEqual(out.w[8], [['Brus', 6, 0, 2], ['CNC', 4, 2, 2], ['Neznámé ID', 1, 1, 1]]);
  assert.deepStrictEqual([out.y[0].kind, out.y[0].value, out.y[0].n, out.y[1], out.y[2]], ['real', 50, 2, 'plan', 'empty']);
  assert.strictEqual(out.own, 7, 'bez vlastního požadavku = součet plánů skupin');
  assert.deepStrictEqual(out.sh[0], ['Přehled dní', 'Skupiny']);
  assert.deepStrictEqual(out.sh[1], ['Datum', 'Den', 'Druh', 'Požadavek', 'Plán', 'Dodáno', 'Rozdíl', 'V normě', 'Brus']);
  assert.deepStrictEqual(out.sh[2], ['2026-10-28', 'St', 'víkend / svátek (mimo normu)', 6, 7, 2, -4, '']);
  return null;
});

test('Úvod HALA 2 (2.40.1): přesně dnešní den i o víkendu, poslední den s příchody', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    S = sanitizeState(blank());
    S.workAudit.dv.pres['2026-10-29'] = { '1': [360, null] };
    S.workAudit.dv.pres['2026-10-30'] = { '1': [null, null] };
    S.workAudit.dv.pres['2026-11-02'] = { '1': [360, null] };
    const a = staffDay('2026-10-31'), b = staffDay('2026-10-31', true);
    return JSON.stringify([a.day, a.today, b.day, b.today, dvLastPres('2026-10-31'), dvLastPres('2026-10-28')]);
  })()`));
  assert.deepStrictEqual(out, ['2026-11-02', false, '2026-10-31', true, '2026-10-29', ''], 'prázdný řádek bez časů se nepočítá, budoucnost ne');
  return null;
});

test('Report docházky (2.41): skupiny reportu z oddělení, přesčas a práce ve svátek mimo normu, čištění a historie', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    S = blank();
    const lvl = () => [1, 2, 3, 4].map(n => ({ name: 'L' + n, tabaky: n * 2, desc: '' }));
    S.positions = [{ id: 'g1', name: 'Brus', dept: 'Brus', max: null, levels: lvl(), penalty: [], bonus: [] },
      { id: 'g2', name: 'CNC', dept: 'Obrobna', max: null, levels: lvl(), penalty: [], bonus: [] },
      { id: 'g3', name: 'Frézka', dept: 'Obrobna', max: null, levels: lvl(), penalty: [], bonus: [] },
      { id: 'g4', name: 'Lepení', dept: 'Lepení', max: null, levels: lvl(), penalty: [], bonus: [] }];
    const add = (k, pos, wid) => { S.employees[k] = { key: k, last: 'P' + k, first: 'Jan', positionId: pos, level: 1, note: '', wid }; };
    add('b1', 'g1', '1'); add('b2', 'g1', '2'); add('c1', 'g2', '11'); add('f1', 'g3', '21'); add('l1', 'g4', '31'); add('l2', 'g4', '32');
    S = sanitizeState(S);
    S.workAudit.target = 5;
    const before = JSON.parse(JSON.stringify(S));
    S.workAudit.drep = { groups: [{ id: 'rgA', name: 'Výroba', depts: ['Obrobna', 'Lepení'] }, { id: 'rgB', name: 'Dvojí', depts: ['Lepení', 'Neexistuje'] }, { id: 'bad id', name: 'x', depts: [] }],
      marks: { '2026-10-27': 'ot', '2026-10-26': 'nesmysl', '2026-10-29': 'hol' } };
    S = sanitizeState(S);
    const p = (iso, w) => { S.workAudit.dv.pres[iso] = Object.fromEntries(w.map(x => [x, [360, null]])); };
    ['2026-10-26', '2026-10-27', '2026-10-29', '2026-10-30'].forEach(iso => p(iso, ['1', '2', '11', '21', '31']));
    p('2026-10-27', ['1', '11']);
    const now = Date.UTC(2026, 10, 2, 9);
    const d = drReport('day', '2026-10-27', { now });
    const w = drReport('week', '2026-10-27', { now });
    const log = [];
    waChanges(before.workAudit, S.workAudit, (k, text, x) => log.push(text || (x.p + x.v0 + ' → ' + x.v1)));
    const sh = drSheets(w);
    return JSON.stringify({ drep: S.workAudit.drep, rows: d.d.rows.map(r => [r.name, r.plan, r.done]), mark: [d.d.mark, d.d.norm],
      w: [w.n, w.met, w.pct, w.marked, w.trend.map(t => t.iso)], log, kinds: sh[0].rows.slice(1, 5).map(r => r[2]) });
  })()`));
  assert.deepStrictEqual(out.drep, { groups: [{ id: 'rgA', name: 'Výroba', depts: ['Obrobna', 'Lepení'] }, { id: 'rgB', name: 'Dvojí', depts: ['Neexistuje'] }], marks: { '2026-10-27': 'ot', '2026-10-29': 'hol' } },
    'oddělení jen v jedné skupině, špatné id a značka pryč');
  assert.deepStrictEqual(out.rows, [['Výroba', 4, 1], ['Dvojí', 0, 0], ['Brus', 2, 1]], 'skupina reportu sečte CNC, Frézku a Lepení; Brus bez skupiny zůstane');
  assert.deepStrictEqual(out.mark, ['ot', false]);
  assert.deepStrictEqual(out.w.slice(0, 3), [2, 2, 100], 'přesčas 27. a práce ve svátek 29. se do normy nepočítají');
  assert.deepStrictEqual(out.w[3], [{ iso: '2026-10-27', mark: 'ot', done: 2 }, { iso: '2026-10-29', mark: 'hol', done: 5 }]);
  assert.deepStrictEqual(out.w[4], ['2026-10-26', '2026-10-30']);
  assert.ok(out.log.includes('Report docházky: nová skupina „Výroba“ (Obrobna, Lepení)') && out.log.includes('Report docházky 27. 10. 2026: počítá se do normy → přesčas'), out.log.join(' | '));
  assert.deepStrictEqual(out.kinds, ['skutečnost', 'přesčas (mimo normu)', 'víkend / svátek', 'práce ve svátek (mimo normu)']);
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
