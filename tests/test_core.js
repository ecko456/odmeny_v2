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
  assert.strictEqual(out.v, 12);
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
  assert.strictEqual(o.v, 12);
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
  assert.strictEqual(out.v, 12);
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
  assert.strictEqual(out.v, 12);
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
  assert.strictEqual(out.v, 12);
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
    const strip = st => { const c = JSON.parse(JSON.stringify(st)); delete c.eff; delete c.audit; delete c.v; delete c.settings.prodCols.item; delete c.settings.prodCols.iname; return c; };
    const o2 = JSON.parse(JSON.stringify(old)); delete o2.v;
    JSON.stringify({ same: JSON.stringify(canon(strip(neu))) === JSON.stringify(canon(o2)), eff: neu.eff, cols: [neu.settings.prodCols.item, neu.settings.prodCols.iname], v: neu.v,
      items: Object.values(neu.production).some(pp => 'items' in pp), weeks: (S = neu, effWeeks()) })`));
  assert.ok(out.same, 'všechna data z verze 2.1 zůstanou beze změny');
  assert.deepStrictEqual(out.eff.cases, []);
  assert.deepStrictEqual(out.cols, [null, null], 'uložené sloupce importu bez EAN');
  assert.strictEqual(out.v, 12);
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
  assert.strictEqual(out.v, 12);
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
  assert.deepStrictEqual([out.nos, out.v, out.cases], [{}, 12, ['2026-001']]);
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
  assert.deepStrictEqual([out.leads, out.v], [0, 12]);
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
  assert.deepStrictEqual([out.ls, out.v], [[], 12]);
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
  assert.strictEqual(out.v, 12);
  assert.ok(out.same, 'ostatní data z verze 2.10 zůstanou beze změny');
  assert.deepStrictEqual(out.tiers, [[true, null, [], ['Úklid pracoviště']], [true, null, [], []]], 'morálka je podmínka, vlastní bod zůstal, nové podmínky vypnuté');
  assert.deepStrictEqual(out.marks, { 'dvorak|petr': { moral: 'hádka s mistrem', m2: 'nepořádek' }, 'novak|martin': { moral: '' } }, 'označení morálky se převedlo i s důvodem');
  assert.ok(out.again, 'opakované načtení nic nemění');
  assert.deepStrictEqual(out.custom, ['Úklid pracoviště', 'Pracovní morálka'], 'v nových datech zůstane bod s textem morálky bodem');
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
