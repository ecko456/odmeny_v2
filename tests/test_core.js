'use strict';

/*
 * Výpočty v private/core/*.js (spojené jako core.js) proti původní aplikaci (hodnoceni-operatoru.html):
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

/** core.js je od 2.63 rozdělený po modulech (private/core/NN-*.js); server je vydává spojené v pořadí čísel. */
function coreSource() {
  const dir = path.join(ROOT, 'private', 'core');
  return fs.readdirSync(dir).filter(f => /^\d\d-.*\.js$/.test(f)).sort().map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
}
function loadCore() {
  const ctx = context();
  vm.runInContext(coreSource(), ctx, { filename: 'core.js' });
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
  // Oprava (2.53): zkrácený pátek se pozná sám (odpolední v pátek), ruční zaškrtnutí se nepoužívá.
  Object.values(state.employees).forEach(e => { delete e.rate; delete e.shift; delete e.shortFri; });
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
  assert.strictEqual(out.v, 59);
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
  assert.strictEqual(o.v, 59);
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
  assert.strictEqual(out.v, 59);
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
  assert.strictEqual(out.v, 59);
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
  assert.strictEqual(out.v, 59);
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
  assert.strictEqual(out.v, 59);
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
  assert.strictEqual(out.v, 59);
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
  assert.deepStrictEqual([out.nos, out.v, out.cases], [{}, 59, ['2026-001']]);
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
  assert.deepStrictEqual([out.leads, out.v], [0, 59]);
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
  assert.deepStrictEqual([out.ls, out.v], [[], 59]);
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
  assert.strictEqual(out.v, 59);
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
    JSON.stringify({ ...res, log1, log2, log3, mon: monthLabel(id) })`));
  assert.deepStrictEqual(out.rule, { from: out.rule.from, rows: [{ max: 50, pct: 50 }, { max: 60, pct: 25 }, { max: 300, pct: 100 }] }, 'vzestupně, bez dvojic a neplatných řádků, omezené hodnoty');
  assert.strictEqual(out.empty, false, 'bez pásem srážky nejsou');
  assert.deepStrictEqual(out.bands, [50, 50, 50, 25, 25, 100, 0], 'do 50 % včetně = 50 %, nad 50 do 60 % = 25 %, bez údaje nic');
  // plnění Nováka vychází z ukázkových dat měsíce (84,9 % v říjnu, 85,1 % v listopadu), pásmo do 90 % = 10 %
  assert.ok(out.novak[0] > 80 && out.novak[0] <= 90, `Novák v pásmu do 90 %: ${out.novak[0]}`);
  assert.deepStrictEqual(out.novak.slice(1), [10, 0, null], 'Novák → 10 %, Dvořák nad 90 % nic, jiná skupina bez pravidla');
  assert.strictEqual(out.early, 0, 'upozornění až týden před koncem měsíce');
  assert.deepStrictEqual(out.all, [['norm', 'novak|martin', 10], ['san', 'svobodova|jana', 10]], 'ruční i automatické srážky ze mzdy podle jména');
  assert.deepStrictEqual(out.later, [0, null], 'pravidlo platí až od nastaveného měsíce');
  assert.strictEqual(out.excluded, null);
  assert.deepStrictEqual(out.done, [10, 0, { pct: 10, norm: 84.9, at: 5, by: 'Vedoucí' }], 'zpracovaná srážka drží snímek a zmizí z upozornění');
  assert.deepStrictEqual(out.undone, [30, '{}'], 'po zrušení se zase počítá podle pásem');
  assert.deepStrictEqual(out.log1, [`Srážka ze mzdy za neproduktivitu zpracována: Novák Martin – plnění normy 84,9 %, srážka 10 % ze mzdy (${out.mon})`]);
  assert.deepStrictEqual(out.log2, [`Zrušeno zpracování srážky ze mzdy za neproduktivitu: Novák Martin – plnění normy 84,9 %, srážka 10 % ze mzdy (${out.mon})`]);
  assert.ok(out.log3.length === 1 && out.log3[0] === `Skupina CNC, srážky ze mzdy za neproduktivitu: do 50 % → 50 %, nad 50 do 60 % → 25 %, nad 60 do 90 % → 30 % (od ${out.mon}) → vypnuto`, out.log3.join(' | '));
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
  assert.deepStrictEqual([out.done, out.rules, out.v, out.pending], [{}, 0, 59, 0]);
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
  assert.ok(out.blankHas && out.v === 59, 'nová data mají prázdné Protokoly, verze dat 59');
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
  assert.deepStrictEqual(out, { same: true, books: [], v: 59 });
  return null;
});

test('KPI (2.17): čtení obsazenosti a výkazu podle písmen sloupců, víkendy a svátky, úpravy, souhrny a historie', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    S = sanitizeState(demoData());
    S.periods = {};   // jen soubor obsazenosti (lidé z docházky 2.69.1 má vlastní test)
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
  assert.deepStrictEqual(out.log, ['KPI 1. 10. 2026 – Ranní, Brusiči: 6 → 7 (Chyběl záznam brigádníka)', 'KPI 2. 10. 2026 – Kusy – Broušení ručně: 450 → 470 (Oprava ze směnového hlášení)']);
  assert.deepStrictEqual(out.log2, ['KPI – Kontrola / balení / brigadýr / školitelé, neproduktivní pozice: ano → ne', 'KPI – operace „Kontrola výstupní“, skupina: Kontrola / balení / brigadýr / školitelé → bez skupiny']);
  assert.deepStrictEqual(out.dirty, [[['ok', 'ZZ', '']], [['o1', '']], { am: { plan: 0, total: null, abs: null }, pm: { plan: null, total: null }, g: { ok: [100000, 2] } }, ['2026-10-01'], ['am.total']]);
  assert.ok(out.blank && out.v === 59);
  return null;
});

test('aktualizace 2.16 → 2.18: data zůstanou beze změny, KPI začne prázdný', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `
    const old = sanitizeState(demoData()); delete old.workAudit; old.v = 14;
    const before = JSON.stringify(Object.assign({}, old, { v: 0 }));
    const now = sanitizeState(JSON.parse(JSON.stringify(old)));
    const keep = JSON.parse(JSON.stringify(now)); delete keep.workAudit;
    JSON.stringify({ same: JSON.stringify(Object.assign({}, keep, { v: 0 })) === before, days: Object.keys(now.workAudit.days).length, groups: now.workAudit.groups.length, v: now.v })`));
  assert.deepStrictEqual(out, { same: true, days: 0, groups: 7, v: 59 });
  return null;
});

test('aktualizace 2.17 → 2.18.1: KPI beze změny, přibude prázdný výrobní plán a pevný požadavek 100 lidí', () => {
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
  assert.ok(out.same, 'stávající KPI beze změny');
  assert.deepStrictEqual(out.plan, { tpl: null, tech: { words: ['G2', 'G'], mode: 'token' }, cap: { group: 'brus', perShift: 25 }, chunks: [], weeks: {}, items: 0, files: [], at: 0, by: '' });
  assert.deepStrictEqual([out.target, out.v], [100, 59], 'požadavek pevně 100 lidí na pracovní den');
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
  assert.deepStrictEqual([out.up, out.v], [[[]], 59], 'aktualizace 2.18 → 2.19: případy bez komentářů dostanou prázdný seznam');
  return null;
});

test('KPI (2.19.1): vlastní období od–do, oříznuté na dny s daty', () => {
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
  assert.deepStrictEqual(out.up, [{ devices: [], shipments: [], templates: [] }, 59], 'aktualizace 2.20 → 2.21: Servis začne prázdný');
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
  assert.strictEqual(out.v, 59, 'verze dat 59: starší stránka podpis nesmaže');
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
      old: old.lists[0].items.map(({ id, ...x }) => ({ ...x, idOk: /^si[a-z0-9]{5}$/.test(id) })), junk: junk.lists.map(l => ({ id: l.id, items: l.items.map(({ id, since, ...x }) => x) })), keptB: [b.shortage.lists[0].items.length, b.shortage.lists[0].items.map(i => i.top)], log1: log(a, b), log2: log(b, d), blank: blank().shortage, up: sanitizeState({ v: 22 }).shortage,
      unxml: ['https://x.cz/?a=1&amp;b=2&#38;c=&#x3C;3&gt;', 'bez entit', '&amp;amp;', '&#0;&#99999999;'].map(shUnxml),
      links: ['https://x.cz/a b', 'HTTP://X.CZ', 'www.x.cz', 'mailto:a@b.cz', '#List1!A1', 'https://x.cz/' + 'a'.repeat(2000)].map(shLink),
      codes: [L(1, '12345.678901.23456'), 'http://x/?ACTIVEBARCODE=12.3', 'http://x/?activeBarcode=', 'http://x/?activeBarcode=a%20b', 'http://x/?activeBarcode=%E0%A4%A', 'http://x/?activeBarcode=12#frag', 'http://x/?barcode=1', '', null, 'http://x/?activeBarcode=' + '1'.repeat(121)].map(shCode),
      tsv: shTsv('A\\tB\\r\\n"víc\\nřádků"\\t"s ""uvozovkami"""\\n\\tC\\n'), v: DATA_VERSION });
  })()`));
  assert.strictEqual(out.r.header, 1, 'hlavička pod titulkem');
  assert.deepStrictEqual(out.r.items.map(i => i.ean), ['0012345678905', '8590000000001', '8590000000004', '8594001234567', '8590000000002', '8590000000003', ''], 'TOP SHORTAGE první (v pořadí ze souboru), pak ostatní; řádek jen s názvem zůstane');
  assert.deepStrictEqual(out.r.items[3], { order: 'OBJ-2026-0101', name: 'Hřídel A', ean: '8594001234567', index: 'B', qty: '12', top: false, top2: false, op: 'Broušení',
    link: 'http://is.example/commission.production.detail/default/68001?activeBarcode=11111.222222.33333&componentProductionId=1', code: '11111.222222.33333', note: '', planningNote: '' });
  assert.deepStrictEqual(out.r.items.map(i => i.top), [true, true, true, false, false, false, false], 'TOP, „ top “ i „TOP SHORTAGE“; „ne“ ne');
  assert.deepStrictEqual(out.r.items.map(i => i.code), ['11111.222222.44444', '', '12/34', '11111.222222.33333', '', '55555.666666.77777', ''], 'kód za activeBarcode do & (i na konci odkazu, i odkaz v jiné buňce, %XX dekódované)');
  assert.deepStrictEqual(out.r.items.map(i => i.link), [out.r.items[0].link, '', '', out.r.items[3].link, 'https://erp.example/dil/2', out.r.items[5].link, ''], 'klikací odkaz jen webová adresa');
  assert.deepStrictEqual([out.r.items[0].order, out.r.items[0].qty, out.r.items[1].qty, out.r.items[0].op], ['0045123', '1 200', '5 ks', 'Montáž'], 'objednávka s nulami a množství jak je v Excelu, operace');
  assert.deepStrictEqual([out.r.top, out.r.warn], [3, { noLink: 2, noCode: 1, noEan: 1, skipped: 1 }]);
  assert.deepStrictEqual(out.noHeader, [-1, 1, '9.9.9'], 'bez hlavičky se čte od prvního řádku');
  assert.deepStrictEqual(out.cl, [30, 'sh31', 'sh2', 1000, '', true], 'nejnovější první, 30 seznamů, 1000 položek (TOP z konce se dostane dopředu), ftp odkaz pryč');
  assert.deepStrictEqual(out.old, [{ order: 'O', name: 'A', ean: '1', index: 'I', qty: '3', top: false, top2: false, op: '', link: 'http://is.example/commission.production.detail/default/7?activeBarcode=70.71.72&componentProductionId=1', code: '70.71.72', qrKey: '', qrChoices: [], qrConflict: false, planMismatch: false, planAlts: [], planningNote: '', note: '', rec: null, pdfHide: false, full: false, dept: '', since: '1970-01-01', days: 1, again: '', subs: [], cands: [], idOk: true },
    { order: '', name: 'B', ean: '2', index: '', qty: '', top: false, top2: false, op: '', link: 'https://erp.example/2', code: '', qrKey: '', qrChoices: [], qrConflict: false, planMismatch: false, planAlts: [], planningNote: '', note: '', rec: null, pdfHide: false, full: false, dept: '', since: '1970-01-01', days: 1, again: '', subs: [], cands: [], idOk: true }], 'seznam ze 2.27: kód se dopočítá z odkazu, TOP ne, operace prázdná; 2.28: id, bez poznámky a záznamu');
  assert.deepStrictEqual(out.junk.length, 1);
  assert.match(out.junk[0].id, /^sh[a-z0-9]{5}$/, 'neplatné id se nahradí');
  assert.deepStrictEqual(out.junk[0].items, [{ order: '', name: 'X Y', ean: '123', index: '', qty: '', top: false, top2: false, op: 'Brus', link: 'https://ok.example/a', code: '', qrKey: '', qrChoices: [], qrConflict: false, planMismatch: false, planAlts: [], planningNote: '', note: '', rec: null, pdfHide: false, full: false, dept: '', days: 1, again: '', subs: [], cands: [] }], 'TOP jen true, kód s mezerou pryč');
  assert.deepStrictEqual(out.keptB, [7, [true, true, true, false, false, false, false]], 'seznam přežije uložení a načtení i s TOP');
  assert.deepStrictEqual(out.log1, ['Shortage: nahrán seznam 22. 10. 2026 8:05 (7 položek, z toho 3 TOP, shortage.xlsx)']);
  assert.deepStrictEqual(out.log2, ['Shortage: smazán seznam 22. 10. 2026 8:05 (7 položek, z toho 3 TOP, shortage.xlsx)']);
  assert.deepStrictEqual([out.blank, out.up], [{ lists: [], depts: [], cols: {}, colors: {}, hist: [], scans: [] }, { lists: [], depts: [], cols: {}, colors: {}, hist: [], scans: [] }], 'nová i starší data začnou s prázdným Shortage (2.32 i bez oddělení)');
  assert.deepStrictEqual(out.links, ['', 'HTTP://X.CZ', 'https://www.x.cz', '', '', ''], 'odkaz v aplikaci jen webová adresa bez mezer, nejvýš 2000 znaků');
  assert.deepStrictEqual(out.codes, ['12345.678901.23456', '12.3', '', '', '%E0%A4%A', '12', '', '', '', ''], 'activeBarcode: do &, bez # části, s mezerou nebo delší než 120 znaků ne');
  assert.deepStrictEqual(out.unxml, ['https://x.cz/?a=1&b=2&c=<3>', 'bez entit', '&amp;', '&#0;&#99999999;'], 'XML zápis v cíli odkazu ze souboru (SheetJS) se převede zpět');
  assert.deepStrictEqual(out.tsv, [['A', 'B'], ['víc\nřádků', 's "uvozovkami"'], ['', 'C']], 'text ze schránky: tabulátory, řádky, buňky v uvozovkách');
  assert.strictEqual(out.v, 59, 'verze dat 59: starší stránka TOP, operaci, kód, poznámky, záznamy, delší stav, poddíly ani čekající poddíly nesmaže');
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
  assert.deepStrictEqual(out.r1, { matched: 4, updated: 5, same: 0, older: 0, added: 0, wpa: 0, missing: ['X9'], cached: 5, truncated: 0, sent: 0, sentCodes: 0 }, 'stejný kód u dvou položek dostane záznam u obou');
  assert.deepStrictEqual(out.again, { matched: 4, updated: 0, same: 5, older: 0, added: 0, wpa: 0, missing: ['X9'], cached: 5, truncated: 0, sent: 0, sentCodes: 0 }, 'stejné záznamy podruhé nic nemění');
  assert.deepStrictEqual(out.older, { matched: 1, updated: 0, same: 0, older: 1, added: 0, wpa: 0, missing: [], cached: 1, truncated: 0, sent: 0, sentCodes: 0, hist: 1 }, 'starší záznam nepřepíše novější, od 2.78 se doplní do historie dílu');
  assert.deepStrictEqual(out.recsOn, [['40', 'Broušení hotovo', '22. 10. 2026 9:15', 'Vedoucí'], ['3', 'Čeká', 'není datum', 'Vedoucí'], ['12', 'Elox', '22. 10. 2026 10:30', 'Vedoucí'], ['5 ks', 'Montáž', '22. 10. 2026 7:00', 'Vedoucí'], null, ['12', 'Elox', '22. 10. 2026 10:30', 'Vedoucí']]);
  assert.deepStrictEqual(out.moves, [true, 't1,t2,c,a,b,d', true, 't1,t2,a,c,b,d', true, 't2,t1,a,c,b,d', true, 't1,t2,a,c,b,d', false, false],
    'přesun ve skupině; běžná položka nevyskočí mezi TOP, TOP nespadne pod ostatní; neznámá položka a stejné místo nic nedělají');
  assert.deepStrictEqual(out.cl.map(i => [i.note, i.rec]), [['víc řádků', { ts: 5, when: 'w', qty: '3', state: 'S', op: '', n: 0, at: 0, by: 'B' }], ['', null], ['', null]], 'poznámka na jeden řádek, záznam jen známá pole');
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
  // 2.70 (samostatná aplikace Shortage 1.3): poddíly všech operací, ne jen Hala 2; operace sestavy z jejího vlastního řádku
  assert.deepStrictEqual(out.r1, { items: 3, subs: 5, noCode: 1, other: 0, cands: 0, changed: 3, linked: 0, ambiguous: 0, truncated: 0, operations: 1, unmatchedFirst: 0, conflicts: 0, qty: 0 }, 'sestava a se třemi poddíly (jeden bez odkazu, jeden s jinou operací), sestava b s jedním, c s poddílem jiné operace');
  assert.deepStrictEqual(out.subsA, [['8594000009001', '9.0.1', 'Broušení – hala 2 · Leštění - hala 2'], ['8594000009002', '', 'LEPENÍ 3M – HALA 2'], ['8594000009003', '9.0.3', 'Montáž']], 'operace téhož poddílu se spojí, i jiná operace (2.70), jiný index ne, sestava sama sebe ne');
  assert.deepStrictEqual(out.subsB, [['8594000009005', '9.0.5', 'řez kotoučovou pilou 2']], 'EAN s nulami a objednávka jako číslo se shodují');
  assert.deepStrictEqual(out.r2.changed, 0, 'druhé prohledání stejného plánu nic nemění');
  assert.deepStrictEqual(out.kept, ['sp1', 'Brusič ví', 'S'], 'poddíl, který v plánu zůstal, si nechá id, poznámku i záznam');
  assert.deepStrictEqual([out.ra.updated, out.ra.cached, out.recSub], [1, 1, 'Řez hotový'], 'poslední záznam podle kódu poddílu');
  assert.deepStrictEqual(out.cl.plan, { file: 'p.xlsx', at: 7, by: 'V' });
  assert.deepStrictEqual(out.cl.subs, [[['9', '7.7.7', 'Brush Hala 2', true]], []], 'poddíl se vyčistí a dostane jiné id než položka; prázdný a neplatný zmizí');
  assert.deepStrictEqual(out.cl.ids, ['x1', 'x2']);
  assert.deepStrictEqual(out.log1, ['Shortage: poddíly z výrobního plánu plan.xlsx u seznamu 22. 10. 2026 6:00: 5 poddílů u 3 sestav']);
  assert.deepStrictEqual(out.log2, ['Shortage: odebrán poddíl 8594000009002 u položky 8594000000101 Díl a (seznam 22. 10. 2026 6:00)', 'Shortage: poznámka k poddílu 8594000009001 u položky 8594000000101 Díl a (seznam 22. 10. 2026 6:00): Volat']);
  assert.deepStrictEqual(out.ops, [true, true, true, true, true, true, true, true, true, true, true, false, false, false], 'operace Hala 2 bez ohledu na pomlčky, mezery, velikost písmen a diakritiku');
  assert.deepStrictEqual(out.keys, ['12345678905|A|4500001', '12345678905|A|4500001', '8594000000101|IX-1|OBJ-1']);
});

test('Shortage (2.29.1, od 2.70): poddíly všech operací hned, „Odesláno na WPA“ je neskryje, staré čekající poddíly se převedou', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const L = c => 'http://is.example/c?activeBarcode=' + c + '&x=1';
    const plan = shPlanBlank('plan.xlsx');
    shPlanRow(plan, '8594000000101', '8594000009001', 'A', 'OBJ-1', 'Broušení – hala 2', L('9.0.1'));
    shPlanRow(plan, '8594000000101', '8594000009003', 'A', 'OBJ-1', 'Montáž', L('9.0.3'));
    shPlanRow(plan, '8594000000101', '8594000009003', 'A', 'OBJ-1', 'Kontrola', L('9.0.3'));        // stejný poddíl, další operace
    shPlanRow(plan, '8594000000101', '8594000009004', 'A', 'OBJ-1', 'Lakování', L('9.0.4'));
    shPlanRow(plan, '8594000000101', '8594000009005', 'A', 'OBJ-1', 'Lakování', '');                // bez kódu
    shPlanRow(plan, '8590000000002', '8590000009009', 'C', 'OBJ-2', 'Svařování', L('9.0.9'));
    const it = (id, ean, index, order) => ({ id, order, name: 'Díl ' + id, ean, index, qty: '1', top: false, op: '', link: '', code: 'K' + id, note: '', rec: null, subs: [], cands: [] });
    const list = { id: 'shL', at: new Date(2026, 9, 22, 6, 0).getTime(), by: 'V', file: 'f.xlsx', sheet: '', plan: null, items: [it('a', '8594000000101', 'A', 'OBJ-1'), it('c', '8590000000002', 'C', 'OBJ-2')] };
    const p1 = shApplyPlan(list, plan);
    const before = [list.items[0].subs.map(s => [s.code, s.op]), list.items[0].cands.length, list.items[1].subs.map(s => s.code)];
    const rows = [
      [{ text: '9.0.3' }, { text: '22.10.2026 9:00' }, { text: '4' }, { text: 'Montáž hotová' }],
      [{ text: '9.0.4' }, { text: '22.10.2026 9:30' }, { text: '2' }, { text: 'Odesláno na WPA' }],
      [{ text: '9.0.9' }, { text: '22.10.2026 10:00' }, { text: '1' }, { text: 'odesláno  na  WPA – kamion 2' }],
      [{ text: '9.0.1' }, { text: '22.10.2026 10:00' }, { text: '6' }, { text: 'Brus' }],
      [{ text: '7.7.7' }, { text: '22.10.2026 10:00' }, { text: '1' }, { text: 'Jinde' }],
    ];
    const r = shApplyRecs(list, shRecBuild(rows).recs, { at: 5, by: 'V' });
    const after = [list.items[0].subs.map(s => [s.code, s.rec && s.rec.state]), list.items[1].subs.map(s => s.rec && s.rec.state), list.records.map(x => x.code).sort()];
    // stará data (2.29.1–2.69): čekající poddíly se převedou mezi poddíly, bez duplicit
    const old = cleanShortage({ lists: [{ id: 'shJ', at: 1, items: [{ ean: '1', name: 'A', subs: [{ ean: '5', code: '5.5.5', byRec: 'ano' }],
      cands: [{ ean: '2', code: '3.3.3', op: 'X', link: 'javascript:x' }, { ean: '4', code: '' }, { ean: '5', code: '5.5.5' }, 'x'] }] }] }).lists[0].items[0];
    // nový plán bez poddílu: poddíl zmizí, ručně upravený zůstane; záznam evidence se doplní i k poddílu z pozdějšího plánu
    const l2 = JSON.parse(JSON.stringify(list));
    l2.items[0].subs.find(s => s.code === '9.0.4').manual = true;
    const plan2 = shPlanBlank('plan2.xlsx');
    shPlanRow(plan2, '8594000000101', '8594000009001', 'A', 'OBJ-1', 'Broušení – hala 2', L('9.0.1'));
    shPlanRow(plan2, '8594000000101', '8594000009007', 'A', 'OBJ-1', 'Jinde', L('7.7.7'));
    shApplyPlan(l2, plan2);
    const gone = l2.items[0].subs.map(s => [s.code, s.rec && s.rec.state]);
    return JSON.stringify({ p1: [p1.subs, p1.items, p1.cands], before, r: [r.matched, r.updated, r.missing, r.cached], after, old: [old.subs.map(s => [s.ean, s.code, s.link, s.byRec]), old.cands], gone,
      wpa: ['Odesláno na WPA', 'ODESLANO NA WPA', 'odesláno-na-WPA', 'Odesláno na WPA2', 'Odesláno', 'Na WPA', ''].map(shWpa) });
  })()`));
  assert.deepStrictEqual(out.p1, [5, 2, 0], 'poddíly všech operací se ukážou hned, žádné čekající');
  assert.deepStrictEqual(out.before, [[['9.0.1', 'Broušení – hala 2'], ['9.0.3', 'Montáž · Kontrola'], ['9.0.4', 'Lakování'], ['', 'Lakování']], 0, ['9.0.9']]);
  assert.deepStrictEqual(out.r, [4, 4, ['7.7.7'], 5], 'záznam ke všem poddílům, kód mimo seznam se uloží pro později');
  assert.deepStrictEqual(out.after, [[['9.0.1', 'Brus'], ['9.0.3', 'Montáž hotová'], ['9.0.4', 'Odesláno na WPA'], ['', null]], ['odesláno na WPA – kamion 2'], ['7.7.7', '9.0.1', '9.0.3', '9.0.4', '9.0.9']],
    '„Odesláno na WPA“ poddíl neskryje');
  assert.deepStrictEqual(out.old, [[['5', '5.5.5', '', false], ['2', '3.3.3', '', false], ['4', '', '', false]], []], 'čekající poddíly ze starších dat jsou běžné poddíly');
  assert.deepStrictEqual(out.gone, [['9.0.1', 'Brus'], ['7.7.7', 'Jinde'], ['9.0.4', 'Odesláno na WPA']], 'poddíl, který plán už nemá, zmizí (ruční úprava zůstane); uložený záznam se doplní k novému poddílu');
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
  assert.deepStrictEqual(out.old, [10, 20, null, null], 'bez prahu jako dřív (úvod a KPI)');
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
  const A = 4 * 7.5 + out.fri;   // od 2.53 zkrácený pátek jen u odpolední směny (c, g)
  assert.deepStrictEqual(out.rows, [
    ['a', 'g1', 'am', 37.5, 36.5, 5, 0, 0, 0, 0, true, ''],
    ['c', 'g1', 'pm', A, 22.5, 3, 0, 2, 0, 0, false, ''],
    ['e', 'g1', 'am', 37.5, 4, 1, 0, 4, 0, 0, false, 'dnes vyřazen'],
    ['b', 'g2', 'am', 37.5, 22.5, 3, 2, 0, 0, 0, false, ''],
    ['g', 'g2', 'pm', A, 0, 0, 0, 5, 0, 0, false, 'v docházce není (jiné jméno?)'],
    ['cizi|petr', '', 'none', 0, 0, 0, 0, 0, 1, 7.5, false, 'v Lidech není'],
    ['d', '', 'none', 0, 0, 0, 0, 0, 1, 8, false, 'bez skupiny, mimo plán']],
    'lidé: plán ze zařazení (skupina z historie, zkrácený pátek, střídání), dnes vyřazený s docházkou v plánu, mimo plán zvlášť; sobota se nepočítá; vedoucí bez hodin ve výstupu není; den s kódem nepřítomnosti a hodinami (7,5 D, 8 NEM) není odpracovaný');
  assert.deepStrictEqual(out.groups, [
    ['g1', 15, 10, 5, 9, 0, 6, A + 75, 63, 0, 0, 0, [5, 5, 37.5, 36.5], [10, 4, 37.5 + A, 26.5]],
    ['g2', 10, 5, 5, 3, 2, 5, 37.5 + A, 22.5, 15, 0, 0, [0, 0, 0, 0], [10, 3, 37.5 + A, 22.5]],
    ['', 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 15.5, [0, 0, 0, 0], [0, 0, 0, 0]]], 'skupiny za týden: lidodny, hodiny, omluveno, schopní a v zaškolování zvlášť, mimo plán zvlášť');
  assert.deepStrictEqual(out.total, [25, 12, 2 * A + 112.5, 85.5, 15.5], 'celkem: odpracováno jen v plánu, mimo plán zvlášť');
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
          const h=row?(+row.h[i]||0):0;if(row&&row.c[i])abs+=h;else raw+=h;if(r.planned)plan+=dayShift(d,friShort(r.e,d));});
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
    const pr = (name, norm, total) => ({ name, total, count: 1, days: {}, spent: norm, norm, nspent: norm });
    S.production['2026-09'] = { id: '2026-09', time: true, names: { 'prod a': pr('Prod A', 7200, 26), 'prod b': pr('Prod B', 4500, 13), 'prod c': pr('Prod C', 3000, 13) }, records: 3, total: 52, file: 'e.xlsx', at: 1 };
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
      perfRaw: x.months[0].perf && [x.months[0].perf.tot.ks, x.months[0].perf.tot.days, x.months[0].perf.tot.nh.all, x.months[0].perf.src],
      perfDv: (() => { S.workAudit.dv.perf['2026-09'] = { '011': { p: { Hridel: [30, 40, 100, 2], Kryt: [9, 10, 20, 1] }, o: {} }, '999': { p: { Kryt: [5, 5, 5, 1] }, o: {} } };
        const y = capTimeline('2026-09-14', '2026-10-02', { now }).months[0].perf; delete S.workAudit.dv.perf['2026-09'];
        return y && [y.tot.ks, y.tot.days, y.tot.ok, y.tot.tr, y.src]; })(),
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
  // výkon září (2.45.1): kusy ÷ odpracované dny; a 26 ks / 13 dní (18. 9. bez hodin), b 13 / 13 (15. 9. dovolená),
  // zkušení a+b 39 ÷ 26 = 1,5, v zácviku c 13 ÷ 13 (14. 9. A) = 1; celkem 52 ÷ 39 = index 100
  assert.ok(Math.abs(out.perf[0] - 1.5) < 1e-9 && Math.abs(out.perf[1] - 1) < 1e-9 && Math.abs(out.perf[2] - 52 / 39) < 1e-9, `výkon ${out.perf}`);
  assert.deepStrictEqual(out.perf.slice(3), [100, 112.5, 75]);
  assert.ok(out.perfRaw[0] === 52 && out.perfRaw[1] === 39 && Math.abs(out.perfRaw[2] - 245 / 292.5) < 1e-9 && out.perfRaw[3] === 'prod', `kusy, dny, normohodiny doplňkově ${out.perfRaw}`);
  // s výkony ze souboru Docházka a výkony platí ty (ID 011 = a, 999 nikdo); b a c tam nejsou
  assert.deepStrictEqual(out.perfDv, [39, 13, 3, null, 'dv'], 'výkony ze souboru Docházka a výkony mají přednost');
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
          eq(c.planH,live.reduce((s,e)=>s+dayShift(d.day,friShort(e,d.day)),0),d.iso+' g'+j+' plán h');
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

test('Kapacity a zaškolení (2.31): záhlaví reportů v KPI (pracoviště, firma), čištění a historie změn', () => {
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
  assert.strictEqual(out.v, 59, 'verze dat 59: starší stránka záhlaví nesmaže');
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

test('Kapacity a zaškolení (2.31): týdenní souhrn bez požadavku z KPI porovná den s plánem skupin', () => {
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

test('Kapacity a zaškolení (2.69): plán skupin z Plánu kapacit, v přesčas na polovinu', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const st = blank();
    const p = mkPos('g1', 'Brus', []); p.skillset = [{ id: 'k1', name: 'Broušení', desc: '', scale: null }]; p.maxTab = 8; p.tiers = [];
    const q = mkPos('g2', 'CNC', []); q.skillset = [{ id: 'k2', name: 'Obrábění', desc: '', scale: null }]; q.maxTab = 8; q.tiers = [];
    st.positions = [p, q];
    ['a', 'b', 'c'].forEach(k => { st.employees[k] = { key: k, last: 'L' + k, first: 'F', positionId: 'g1', shift: 'R', note: '', rate: { k1: 4 } }; });
    st.employees.d = { key: 'd', last: 'Ld', first: 'F', positionId: 'g2', shift: 'R', note: '', rate: { k2: 4 } };
    st.workAudit.target = null;
    st.capPlan.groups.g1 = { n: 5, l2: 0, l3: 0, l4: 0 };
    S = sanitizeState(st);
    S.workAudit.target = null;
    S.workAudit.drep.marks['2026-09-16'] = 'ot';
    const days = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];
    const row = k => ({ first: 'F', last: 'L' + k, h: days.map(() => 7.5), c: days.map(() => null) });
    S.periods['2026-09'] = { id: '2026-09', y: 2026, m: 9, days, rows: { a: row('a'), b: row('b'), c: row('c'), d: row('d') }, codes: {}, file: 'x', at: 1, headerRow: 1 };
    const r = capWeekReport('2026-W38', { now: new Date(2026, 9, 1).getTime() });
    S.workAudit.target = 10;
    const r2 = capWeekReport('2026-W38', { now: new Date(2026, 9, 1).getTime() });
    return JSON.stringify({ req: r2.days.map(d => d.req), days: r.days.map(d => [d.plan, d.req, d.met, !!d.half]), g: r.groups.map(x => [x.g.id, x.plan, x.met, x.cap]), cap: r.cap, half: r.half,
      need: [capNeed('g1', '2026-09-15'), capNeed('g1', '2026-09-16'), capNeed('g2', '2026-09-15')] });
  })()`));
  // Brus: potřeba 5 (v přesčas 3), CNC bez plánu = kdo měl přijít (1); bez pevného požadavku platí plán skupin
  assert.deepStrictEqual(out.need, [5, 3, null]);
  assert.deepStrictEqual(out.days, [[6, null, false, false], [6, null, false, false], [4, null, true, true], [6, null, false, false], [6, null, false, false]], 'plán dne z Plánu kapacit, přesčas poloviční');
  assert.deepStrictEqual(out.g, [['g1', 4.6, 1, true], ['g2', 1, 5, false]]);
  assert.deepStrictEqual([out.cap, out.half], [true, ['2026-09-16']]);
  assert.deepStrictEqual(out.req, [10, 10, 5, 10, 10], 'pevný požadavek v přesčas na polovinu');
  return null;
});

test('KPI (2.69.1): lidé v práci z docházky, kusy na osobu i bez přiřazených skupin Matice', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const st = blank();
    const p = mkPos('g1', 'Brus A', []); p.skillset = [{ id: 'k1', name: 'X', desc: '', scale: null }]; p.maxTab = 8; p.tiers = [];
    st.positions = [p];
    ['a', 'b', 'c', 'l'].forEach(k => { st.employees[k] = { key: k, last: 'L' + k, first: 'F', positionId: k === 'l' ? null : 'g1', lead: k === 'l' ? ['X'] : undefined, shift: 'R', note: '' }; });
    const days = ['2026-10-05', '2026-10-06'];
    const row = (h, c) => ({ first: 'F', last: 'L', h, c });
    st.periods['2026-10'] = { id: '2026-10', y: 2026, m: 10, days, rows: { a: row([7.5, 7.5], [null, null]), b: row([7.5, 0], [null, 'D']), c: row([0, 8], ['D', 'D']), l: row([7.5, 7.5], [null, null]) }, codes: {}, file: 'x', at: 1, headerRow: 1 };
    S = sanitizeState(st);
    const wa = S.workAudit;
    wa.ops = [{ id: 'o1', name: 'Broušení', group: 'brus', on: true }];
    wa.pcs = { '2026-10-05': { o1: 60 }, '2026-10-06': { o1: 30 } };
    const d0 = waDay(wa, '2026-10-05');   // bez přiřazení skupiny Matice: na všechny v práci
    wa.groups.find(g => g.id === 'brus').mg = ['g1'];
    const d1 = waDay(wa, '2026-10-05'), d2 = waDay(wa, '2026-10-06');
    wa.days['2026-10-06'] = { am: { plan: null, total: 9, abs: null }, pm: { plan: null, total: null }, g: {} };
    const d3 = waDay(wa, '2026-10-06');
    return JSON.stringify({ d0: [d0.people, d0.prodPeople, d0.perProd, d0.perAll, d0.attFb], d1: [d1.people, d1.g.brus.sum, d1.perProd, d1.perAll], d2: [d2.people, d2.perProd], d3: [d3.people, d3.attFb] });
  })()`));
  assert.deepStrictEqual(out.d0, [2, 2, 30, true, true], 'v práci a a b (vedoucí ne), kusy na všechny v práci');
  assert.deepStrictEqual(out.d1, [2, 2, 30, false], 'se skupinou Matice lidé skupiny');
  assert.deepStrictEqual(out.d2, [1, 30], 'den s kódem (i s hodinami) se nepočítá');
  assert.deepStrictEqual(out.d3, [9, false], 'soubor obsazenosti má přednost');
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

test('KPI (2.33): hranice zaškolení v % platí pro celé Kapacity a zaškolení, čištění a historie změn', () => {
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
    S.workAudit.trainPct = 60; const r2 = calc();        // vlastní hranice KPI má přednost
    S.workAudit.trainPct = 100; const r3 = calc();
    return JSON.stringify({ blank: blankWorkAudit().trainPct, a: a.trainPct, vals: [60, 60.4, '70', 0, 150, -5, 'x', null, '', 1, 100].map(clean), log,
      r0, r1, r2, r3, keep: sanitizeState(S).workAudit.trainPct, v: DATA_VERSION });
  })()`));
  assert.strictEqual(out.blank, null, 'nový KPI: hranice podle Matice');
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
  assert.ok(out.r2.hdr.includes('aspoň 60 % (hranice zaškolení z nastavení KPI') && out.r2.hdr.includes('cíl (60 %)'), out.r2.hdr);
  assert.strictEqual(out.keep, 100, 'hranice přežije uložení');
  assert.strictEqual(out.v, 59, 'verze dat 59: starší stránka hranici zaškolení nesmaže');
  return null;
});

test('Výroba a KPI (2.35): jeden výkaz práce, sloupec Operace ve Výrobě dává kusy KPI', () => {
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
  assert.ok(out.same, 'kusy z Výroby = import výkazu v KPI (A, H, J)');
  assert.deepStrictEqual(out.byDay, { '2026-10-01': { 'Broušení ruční': 75, 'Frézování CNC': 12 }, '2026-10-02': { 'Frézování CNC': 25 } }, 'i řádek bez pracovníka, bez souhrnu Celkem');
  assert.deepStrictEqual(out.range, ['2026-10-01', '2026-10-02']);
  assert.deepStrictEqual([out.noOp, out.noKs], [null, null], 'bez operace nebo kusů nic do KPI');
  assert.deepStrictEqual(out.pcs, [2, ['Broušení ruční', 'Frézování CNC'], [75, 12]], 'nové operace bez skupiny, kusy po dnech');
  assert.deepStrictEqual(out.prod, [4, ['2026-10'], ['101', '102', '103']], 'Výroba ze stejných řádků (bez řádku bez pracovníka a souhrnu)');
  assert.strictEqual(out.v, 59, 'verze dat 59: starší stránka sloupec Operace ve Výrobě nesmaže');
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
  assert.strictEqual(out.v, 59, 'verze dat 59: starší stránka odebrané položky nesmaže');
  return null;
});

test('Docházka a výkony jediný zdroj od listopadu 2026 (2.42): docházka pro odměny, evidence práce, obsazenost v KPI', () => {
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
      hours: [dvHours(360, 720), dvHours(360, 1000), dvHours(360, null), dvHours(null, null), dvHours(1320, 360), dvHours(360, 380)],
      changes, clean: cleanWorkAudit({ groups: [{ id: 'q', name: 'Q', mg: ['g1', 'g1', 'bad id', 5] }] }).groups[0].mg,
    });
  })()`));
  assert.ok(out.oct, 'říjen (docházka i evidence práce) zůstane ze starých souborů');
  assert.deepStrictEqual(out.r, [[{ m: '2026-11', days: 2, people: 4, lockedDays: 0, edits: 0 }], [{ m: '2026-11', people: 2, records: 3 }], ['2026-11-02', '2026-11-03'], 2], 'listopad do odměn, evidence a KPI, kusy jen od listopadu');
  assert.deepStrictEqual(out.days, ['2026-11-01', '2026-11-02', '2026-11-03']);
  assert.deepStrictEqual(out.a, [[0, 7.5, 4.5], [null, null, null]], 'pobyt vždy bez 30 min přestávky');
  assert.deepStrictEqual(out.b, [[0, 7.5, 0], [null, null, 'D']], 'buňka bez času = kód nepřítomnosti');
  assert.ok(out.c, 'vedoucí s ID má docházku (do odměn se nepočítá jinde)');
  assert.deepStrictEqual(out.d, [[0, 0, 0], [null, null, null]], 'člověk v listu bez příchodů má prázdný řádek');
  assert.deepStrictEqual(out.codes, { D: 1 });
  assert.strictEqual(out.file, 'Docházka a výkony: dav.xlsx');
  assert.deepStrictEqual(out.att, [12, 2, 1, 7.5, 2], 'hodiny, omluvená D, absence bez příchodu');
  assert.deepStrictEqual(out.prod, ['a|a', 50, 180, 100, 120, 83.3, ['2026-10', '2026-11'], true], 'evidence práce podle ID, norma jen u řádků s normou');
  assert.deepStrictEqual(out.first, [[2, 1, 0, [1, 0], [0, 1]], [1, 0, 1, [1, 0], [0, 0]]], 'ranní před 12:00, vedoucí ne, neznámé ID jen v celku, skupina podle skupin Matice (Frézování podle názvu)');
  assert.deepStrictEqual(out.after, [2, 1, 0, [1, 1], [null, null]], 'po změně skupin Matice se dny přepočítají, absence zůstane');
  assert.deepStrictEqual(out.ref, ['2026-11-02', '2026-11-03']);
  assert.deepStrictEqual(out.pcs, ['2026-11-02', '2026-11-03'], 'kusy do KPI od listopadu vždy, 31. 10. bez zaškrtnutí ne');
  assert.deepStrictEqual(out.second, [[{ m: '2026-11', days: 1, people: 2, lockedDays: 0, edits: 0 }], [0, 7.5, 7.5], [0, 7.5, 7.5], [null, null, null]], 'další nahrání nahradí jen svoje dny');
  assert.deepStrictEqual(out.owns, [false, true, true, false]);
  assert.deepStrictEqual(out.hours, [5.5, 7.5, 7.5, 0, 7.5, 0], 'zaokrouhlení na směnu a nejvýš 7,5 h (2.46)');
  assert.strictEqual(out.changes.length, 1);
  assert.deepStrictEqual(out.changes[0].slice(1), ['podle názvu', 'Brus A'], 'historie: skupiny Matice u skupiny KPI');
  assert.deepStrictEqual(out.clean, ['g1']);
  return null;
});
test('Report docházky (2.42.1): párování ID podle číslic, skupina bez historie, přehled párování', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const st = blank();
    const grp = (id, name) => { const g = mkPos(id, name, []); g.skillset = [{ id: 'k' + id, name: 'X', desc: '', scale: null }]; g.maxTab = 8; g.tiers = []; return g; };
    st.positions = [grp('g1', 'Brus')];
    st.employees['a|a'] = { key: 'a|a', last: 'Adamec', first: 'Adam', positionId: 'g1', shift: 'R', note: '', wid: '0123' };
    st.employees['b|b'] = { key: 'b|b', last: 'Bartoš', first: 'Bořek', positionId: 'g1', shift: 'R', note: '', wid: '77',
      hist: [{ at: 0, pos: null, lvl: null }, { at: Date.UTC(2026, 10, 20), pos: 'g1', lvl: null }] };
    st.employees['c|c'] = { key: 'c|c', last: 'Cibulka', first: 'Cyril', positionId: null, note: '', wid: '88' };
    st.employees['d|d'] = { key: 'd|d', last: 'Dvořák', first: 'Dan', positionId: 'g1', note: '', wid: 'x-5' };
    st.employees['e|e'] = { key: 'e|e', last: 'Eliáš', first: 'Emil', positionId: 'g1', note: '', wid: 'y-5' };
    S = sanitizeState(st);
    S.workAudit.dv.pres['2026-11-02'] = { 'h-0123': [360, 870], 77: [360, 870], 88: [360, 870], 5: [360, 870], 999: [360, null] };
    const m = dvWidMap();
    const ctx = drCtx({ now: Date.UTC(2026, 10, 25, 9) });
    const d = drDay('2026-11-02', ctx);
    const pr = drPairing(['2026-11-01', '2026-11-02'], ctx);
    return JSON.stringify({ map: [m.get('h-0123') && m.get('h-0123').key, m.get('123') && m.get('123').key, m.has('77'), m.get('5') || null, m.get('1') || null],
      rows: d.rows.map(r => [r.name, r.plan, r.done]), pr });
  })()`));
  assert.deepStrictEqual(out.map, ['a|a', 'a|a', true, null, null], 'číslice ID jen když vedou na jednoho člověka (5 je dvakrát), jedna číslice nestačí');
  assert.deepStrictEqual(out.rows, [['Brus', 4, 2], ['Neznámé ID', 0, 2], ['Bez skupiny', 0, 1]], 'Bartoš bez skupiny v historii jde do dnešní skupiny');
  assert.deepStrictEqual(out.pr, { days: 1, came: 2, unknown: ['5', '999'], noGroup: [{ key: 'c|c', name: 'Cibulka Cyril', wid: '88' }] });
  return null;
});
test('Nastavení sloupců přes AI (2.42.2): ukázka souboru bez jmen a hodnot', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const ser = (m, d) => (Date.UTC(2026, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5;
    const att = [['Docházka – listopad Novák'], ['ID', ser(11, 2), null, ser(11, 3), null], [null, 'Příchod', 'Odchod', 'Příchod', 'Odchod'],
      [101, 0.25, 0.6, '6:00', '14:30'], ['0102', 'NEM', null, 0.25, null], [103, 0.25, 0.6, null, null], [104, 0.25, 0.6, null, null], [105, 0.25, 0.6, null, null]];
    const work = [['ID zaměstnance', 'Datum', 'Zakázka', 'Název dílu', 'Operace', 'V zakázce', 'Hotovo', '', '', 'Čas (min)'],
      [101, ser(11, 2), 45100, 'Hřídel H-20', 'Broušení', 100, 40, '', '', 120], ['A-77', ser(11, 2), 45101, 'Jan Novák', 'Frézování', 50, 10.5, '', '', 0.04]];
    const wide = [Array.from({ length: 90 }, (_, i) => 'S' + i)];
    return JSON.stringify(dvAiSample([{ name: 'f.xlsx › Docházka', aoa: att, dateCols: new Set() }, { name: 'f.xlsx › práce', aoa: work, dateCols: new Set([1]) }, { name: 'w', aoa: wide }, { name: 'x', aoa: [['a']] }, { name: 'y', aoa: [['b']] }], [{ first: 'Jan', last: 'Novák' }]));
  })()`));
  assert.strictEqual(out.length, 4, 'nejvýš 4 listy');
  assert.deepStrictEqual(out[0].rows.length, 6, 'nejvýš 6 řádků');
  assert.deepStrictEqual(out[0].rows.slice(0, 5), [{ A: 'Docházka – listopad [osoba 1]' }, { A: 'ID', B: '<datum 2026-11-02>', D: '<datum 2026-11-03>' },
    { B: 'Příchod', C: 'Odchod', D: 'Příchod', E: 'Odchod' }, { A: '<celé číslo>', B: '<čas>', C: '<čas>', D: '<čas>', E: '<čas>' }, { A: '<text s číslicemi>', B: '<text>', D: '<čas>' }]);
  assert.deepStrictEqual(out[1].rows, [{ A: 'ID zaměstnance', B: 'Datum', C: 'Zakázka', D: 'Název dílu', E: 'Operace', F: 'V zakázce', G: 'Hotovo', J: 'Čas (min)' },
    { A: '<celé číslo>', B: '<datum 2026-11-02>', C: '<celé číslo>', D: '<text s číslicemi>', E: '<text>', F: '<celé číslo>', G: '<celé číslo>', J: '<celé číslo>' },
    { A: '<text s číslicemi>', B: '<datum 2026-11-02>', C: '<celé číslo>', D: '<text>', E: '<text>', F: '<celé číslo>', G: '<číslo>', J: '<čas>' }], 'datové řádky jen jako typ, jméno ani díl neodejdou');
  assert.strictEqual(Object.keys(out[2].rows[0]).length, 70, 'nejvýš 70 sloupců');
  assert.deepStrictEqual(out.map(x => x.name), ['Docházka', 'práce', 'w', 'x']);
  const all = JSON.stringify(out);
  ['Novák', 'Hřídel', '101', '0102', 'A-77', 'NEM', '45100'].forEach(x => assert.ok(!all.includes(x), 'neodešle ' + x));
  return null;
});
test('Jak se soubor načte (2.42.3): docházka na 2. listu, zapamatovaný list, vzor prvního člověka', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const ser = (m, d) => (Date.UTC(2026, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5;
    const att = [['ID', ser(11, 2), null, ser(11, 3), null, ser(11, 4), null], [null, 'P', 'O', 'P', 'O', 'P', 'O'],
      ['', null, null, null, null, null, null], [101, '6:00', '14:30', 'D', null, '6:00', null], [102, '6:00', '14:00', null, null, null, null]];
    const work = [['ID', 'Datum', 'Zakázka', 'Díl', 'Operace', 'V zakázce', 'Hotovo', '', '', 'Čas'],
      [102, ser(11, 2), 1, 'Kryt', 'Frézování', 5, 2, '', '', 30], [101, ser(11, 2), 1, 'Hřídel', 'Broušení', 10, 4, '', '', 60]];
    const A = { name: 'f.xlsx › List2', aoa: att }, W = { name: 'f.xlsx › List1', aoa: work, dateCols: new Set([1]) }, X = { name: 'f.xlsx › Pozn', aoa: [['x']] };
    const nm = r => [r.att && dvSheetName(r.att), r.work && dvSheetName(r.work)];
    const st = blank(); st.employees['a|a'] = { key: 'a|a', last: 'Adamec', first: 'Adam', positionId: null, note: '', wid: '101' };
    S = sanitizeState(st);
    const dv = blankDv(); dv.cols.work.date = 'B';
    const p = dvParse([W, A], dv, 'min');
    const v = dvPreview(p, 3);
    const dv2 = cleanDv({ ...dv, sheets: { att: 'Pozn', work: 'List2' } });
    return JSON.stringify({
      def: nm(dvSheets([W, A])), one: nm(dvSheets([A])), named: nm(dvSheets([{ name: 'Docházka', aoa: [] }, W])),
      pick: nm(dvSheets([W, A, X], { att: 'Pozn', work: 'List1' })), same: nm(dvSheets([W, A], { att: 'List2', work: 'List2' })), gone: nm(dvSheets([W, A], { att: 'Neni', work: '' })),
      clean: [blankDv().sheets, dv2.sheets, cleanDv({}).sheets],
      v: [v.wid, v.name, v.known, v.days.map(d => [d.iso, d.in, d.out, d.code, d.h]), v.recs.map(x => [x.wid, x.part, x.t]), v.own, v.att.name, v.work.name],
    });
  })()`));
  assert.deepStrictEqual(out.def, ['List2', 'List1'], 'bez názvu: docházka na 2. listu, práce na 1.');
  assert.deepStrictEqual(out.one, ['List2', null]);
  assert.deepStrictEqual(out.named, ['Docházka', 'List1'], 'název Docházka má přednost před pořadím');
  assert.deepStrictEqual(out.pick, ['Pozn', 'List1'], 'zapamatovaný list');
  assert.deepStrictEqual(out.same, ['List2', 'List1'], 'práce nesmí být stejný list jako docházka');
  assert.deepStrictEqual(out.gone, ['List2', 'List1'], 'list, který v souboru není, se nepoužije');
  assert.deepStrictEqual(out.clean, [{ att: '', work: '' }, { att: 'Pozn', work: 'List2' }, { att: '', work: '' }]);
  assert.deepStrictEqual(out.v, ['101', 'Adamec Adam', true, [['2026-11-02', 360, 870, '', 7.5], ['2026-11-03', null, null, 'D', 0], ['2026-11-04', 360, null, '', 7.5]],
    [['101', 'Hřídel', 60]], true, 'List2', 'List1'], 'první člověk s příchodem, jeho dny a záznamy práce');
  return null;
});
test('Docházka podle vzoru docházkového systému (2.42.4): „WPA kód“, datum „01.10. Čt“ bez roku, součty na konci', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const DOW = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
    const head = ['WPA kód'], sub = [null];
    for (let d = 1; d <= 31; d++) { head.push(String(d).padStart(2, '0') + '.10. ' + DOW[new Date(Date.UTC(2026, 9, d)).getUTCDay()], null); sub.push('Příchod', 'Odchod'); }
    head.push('Všední dny (h)', 'Víkend (h)', 'Celkem (h)'); sub.push(null, null, null);
    const row = (wid, fill) => { const r = [wid]; for (let d = 1; d <= 31; d++) r.push(...fill(d)); r.push(160, 8, 168); return r; };
    const aoa = [head, sub,
      row(101, d => (d === 2 ? ['D', null] : d <= 3 ? [6 / 24, 14.5 / 24] : [null, null])),
      row('0102', d => (d === 1 ? ['6:05', '14:35'] : [null, null])),
      [null], row(999, d => (d === 31 ? [7 / 24, null] : [null, null]))];
    const sheets = [{ name: 'f.xlsx › Docházka', aoa }];
    const dv = blankDv();
    const p = dvParse(sheets, dv, 'auto', '2026-11-03');
    const a = p.att;
    return JSON.stringify({ ok: a.ok, from: a.from, to: a.to, days: a.dates.length, people: a.people, rows: a.rows, ids: a.ids,
      p1: a.pres['2026-10-01'], p31: a.pres['2026-10-31'], abs: a.abs['2026-10-02'], work: p.work,
      jan: dvParse(sheets, dv, 'auto', '2027-01-05').att.from });
  })()`));
  assert.ok(out.ok);
  assert.deepStrictEqual([out.from, out.to, out.days], ['2026-10-01', '2026-10-31', 31], 'datum bez roku, rok podle dneška, součty Všední dny / Víkend / Celkem nejsou den');
  assert.deepStrictEqual([out.people, out.rows, out.ids], [3, 3, ['101', '102', '999']]);
  assert.deepStrictEqual(out.p1, { 101: [360, 870], 102: [365, 875] });
  assert.deepStrictEqual(out.p31, { 999: [420, null] });
  assert.deepStrictEqual(out.abs, { 101: 'D' });
  assert.strictEqual(out.work, null, 'soubor jen s listem docházky');
  assert.strictEqual(out.jan, '2026-10-01', 'říjen nahraný v lednu je loňský');
  return null;
});
test('Konce trestů a směnnost (2.43): import, kontrola řádků, zápis do Lidí, přehled po měsících', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const ser = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5;
    const st = blank();
    const grp = (id, name, dept) => { const g = mkPos(id, name, []); g.dept = dept; g.skillset = [{ id: 'k' + id, name: 'X', desc: '', scale: null }]; g.maxTab = 8; g.tiers = []; return g; };
    st.positions = [grp('g1', 'Brus A', 'Broušení'), grp('g2', 'CNC', 'Obrobna')];
    const emp = (k, last, first, pos, extra) => { st.employees[k] = { key: k, last, first, positionId: pos, shift: 'R', note: '', ...extra }; };
    emp('adamec|adam', 'Adamec', 'Adam', 'g1');
    emp('bartos|borek', 'Bartoš', 'Bořek', 'g1', { sick: '2026-10-01' });
    emp('cibulka|cyril', 'Cibulka', 'Cyril', 'g2');
    emp('dvorak|dan', 'Dvořák', 'Dan', 'g2', { end: '2026-10-15' });
    emp('exner|emil', 'Exner', 'Emil', null, { excluded: true });
    S = sanitizeState(st);
    const aoa = [['Příjmení', 'Jméno', 'Konec trestu', 'Směnnost'],
      ['Adamec', 'Adam', ser(2026, 12, 15), 'Skupina 1'],
      ['Bartoš', 'Bořek', '31.1.2027', 'Stálá odpolední'],
      ['Cyril', 'Cibulka', ser(2027, 1, 10), 'NEMOC'],
      ['Nový', 'Ondra', ser(2026, 11, 20), 'stálá ranní'],
      ['Dvořák', 'Dan', 'brzy', 'směna X'],
      ['', 'Bez', ser(2027, 1, 1), 'Skupina 2'],
      ['Adamec', 'Adam', ser(2026, 11, 30), 'Skupina 2']];
    const p = endParse(aoa, null, { today: '2026-11-03' });
    const iss = n => p.rows.find(r => r.n === n).issues.map(i => i.l + ':' + i.t);
    const p2 = endParse(aoa, null, { today: '2026-11-03', labels: { 'smena x': 'O' } });
    const shifts = ['Stálá ranní', 'ranní', 'STÁLÁ ODPOLEDNÍ', 'Skupina 1', 'skup. 2', 'S1', 'Nemoc', 'PN', '', 'cokoli'].map(t => endShiftOf(t));
    const r = endApply(p2, { add: true, today: '2026-11-03' });
    const E = k => { const e = S.employees[k]; return [e.end || '', e.shift || '', e.sick || '']; };
    const ov = endsOverview('2026-11-03', 3);
    const sh = endsSheets(ov);
    const ch = []; const A = JSON.parse(JSON.stringify(S)); A.employees['adamec|adam'].end = '2026-01-01';
    describeChanges(A, S, { at: 1, by: 'V', card: '' }).entries.forEach(x => ch.push(x.text));
    const ai = endAiSample({ name: 'f › List1', aoa }, null, Object.values(S.employees));
    return JSON.stringify({ header: p.header, sum: p.sum, unknown: p.unknown, missing: p.missing,
      i3: iss(4), i5: iss(5), i6: iss(6), i8: iss(8), i2: iss(2), shifts, r,
      a: E('adamec|adam'), b: E('bartos|borek'), c: E('cibulka|cyril'), d: E('dvorak|dan'), n: E('novy|ondra'), nPos: S.employees['novy|ondra'].positionId,
      ov: { head: ov.head, months: ov.months.map(x => [x.m, x.total]), depts: ov.depts.map(d => [d.name, d.head, d.overdue, d.leave, d.remain, d.later]), overdue: ov.overdue.map(x => x.name), later: ov.later.map(x => x.name), noEnd: ov.noEnd.map(x => x.name), next3: ov.next3, thisMonth: ov.thisMonth },
      sheet: sh[0].rows[2].length, list: sh[1].rows.length, ch: ch.filter(t => /konec trestu/.test(t)),
      ai: JSON.stringify(ai), clean: [sanitizeState({ ...blank(), employees: { 'a|a': { key: 'a|a', last: 'A', first: 'a', end: 'x' }, 'b|b': { key: 'b|b', last: 'B', first: 'b', end: '2027-01-01' } } }).employees] });
  })()`));
  assert.strictEqual(out.header, true);
  assert.deepStrictEqual(out.sum, { rows: 7, err: 3, warn: 2, fresh: 1, ends: 6, shifts: 5, sick: 1 });
  assert.deepStrictEqual(out.i3, ['w:jméno a příjmení jsou prohozené, spáruje se s Cibulka Cyril', 'i:nemoc od dneška']);
  assert.deepStrictEqual(out.i5, ['w:v Lidech není, přidá se jako nový (bez skupiny)']);
  assert.deepStrictEqual(out.i6, ['e:konec trestu „brzy“ není datum, nezmění se', 'e:směnnost „směna X“ neznám, nezmění se']);
  assert.deepStrictEqual(out.i8, ['e:stejný člověk už je na řádku 2, použije se poslední', 'i:směna Stálá ranní → Směnnost – skupina 2']);
  assert.ok(out.i2.includes('i:směna Stálá ranní → Směnnost – skupina 1'));
  assert.deepStrictEqual(out.unknown, [{ text: 'směna X', n: 1 }]);
  assert.deepStrictEqual(out.missing, [], 'všichni nevyřazení jsou v souboru (vyřazený se nehlásí)');
  assert.deepStrictEqual(out.shifts, ['R', 'R', 'O', 'S1', 'S2', 'S1', 'SICK', 'SICK', '', null]);
  assert.deepStrictEqual(out.r, { ends: 4, shifts: 4, sick: 1, back: 1, added: 1, skipped: 1, excluded: 0 });
  assert.deepStrictEqual(out.a, ['2026-11-30', 'S2', ''], 'poslední řádek člověka vyhrává');
  assert.deepStrictEqual(out.b, ['2027-01-31', 'O', ''], 'jiná směnnost vypne nemoc');
  assert.deepStrictEqual(out.c, ['2027-01-10', 'R', '2026-11-03'], 'prohozené jméno spárováno, NEMOC nechá směnu');
  assert.deepStrictEqual(out.d, ['2026-10-15', 'O', ''], 'chybné datum nic nezmění, směnnost podle ručního převodu');
  assert.deepStrictEqual([out.n, out.nPos], [['2026-11-20', 'R', ''], null]);
  assert.deepStrictEqual(out.ov.months, [['2026-11', 2], ['2026-12', 0], ['2027-01', 2]]);
  assert.deepStrictEqual(out.ov.depts, [['Broušení', 2, 0, [1, 0, 1], [1, 1, 0], 0], ['Obrobna', 2, 1, [0, 0, 1], [1, 1, 0], 0], ['Bez skupiny', 1, 0, [1, 0, 0], [0, 0, 0], 0]]);
  assert.deepStrictEqual([out.ov.head, out.ov.overdue, out.ov.later, out.ov.noEnd, out.ov.next3, out.ov.thisMonth], [5, ['Dvořák Dan'], [], [], 4, 2]);
  assert.deepStrictEqual([out.sheet, out.list], [9, 6]);
  assert.strictEqual(out.ch.length, 1);
  const ai = out.ai;
  ['Adamec', 'Bartoš', 'Cyril', 'Ondra', '2026-12-15', '2027'].forEach(x => assert.ok(!ai.includes(x), 'AI nedostane ' + x));
  assert.ok(/Stálá odpolední/.test(ai) && /Příjmení/.test(ai), 'AI dostane nadpisy a texty směnnosti');
  assert.deepStrictEqual([out.clean[0]['a|a'].end, out.clean[0]['b|b'].end], [undefined, '2027-01-01']);
  return null;
});
test('Teď v práci po odděleních (2.43): plán směny proti příchodům, nedorazili, mimo plán, odpolední čeká', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const st = blank();
    const grp = (id, name, dept) => { const g = mkPos(id, name, []); g.dept = dept; g.skillset = [{ id: 'k' + id, name: 'X', desc: '', scale: null }]; g.maxTab = 8; g.tiers = []; return g; };
    st.positions = [grp('g1', 'Brus', 'Broušení'), grp('g2', 'CNC', 'Obrobna')];
    const emp = (k, pos, shift, wid, x) => { st.employees[k] = { key: k, last: k.split('|')[0], first: 'X', positionId: pos, shift, note: '', wid, ...(x || {}) }; };
    emp('a|x', 'g1', 'R', '1'); emp('b|x', 'g1', 'R', '2'); emp('c|x', 'g1', 'O', '3'); emp('d|x', 'g2', 'R', '4'); emp('e|x', 'g2', 'O', '5', { sick: '2026-11-01' });
    emp('f|x', null, 'R', '6'); emp('v|x', 'g1', 'R', '7', { lead: ['Broušení'] }); emp('h|x', 'g2', 'O', '8');
    S = sanitizeState(st);
    S.workAudit.dv.pres['2026-11-03'] = { 1: [360, null], 3: [370, 600], 4: [360, null], 6: [365, null], 7: [360, null], 99: [800, null] };
    const now = new Date(2026, 10, 3, 10, 0).getTime();
    const sd = staffDay('2026-11-03');
    const g = x => x.depts.map(d => [d.dept, d.plan, d.came, d.now, d.sick, d.missing.map(p => p.wid), d.wait.map(p => p.wid), d.extra.map(p => p.wid)]);
    const both = staffNow(sd, '', { now }), am = staffNow(sd, 'am', { now }), pm = staffNow(sd, 'pm', { now }), late = staffNow(sd, '', { now: new Date(2026, 10, 3, 15, 0).getTime() });
    return JSON.stringify({ both: g(both), bt: both.total, am: g(am), pm: g(pm), late: late.total, none: staffNow(staffDay('2026-11-04', true), '', { now }) });
  })()`));
  assert.deepStrictEqual(out.both, [['Broušení', 3, 2, 1, 0, ['2'], [], []], ['Obrobna', 2, 1, 1, 1, [], ['8'], []], ['Bez skupiny', 1, 1, 1, 0, [], [], []], ['Neznámé ID', 0, 1, 0, 0, [], [], ['99']]],
    'plán obou směn, nemocný mimo plán, vedoucí ne, neznámé ID mimo plán, odpolední před 14:00 čeká');
  assert.deepStrictEqual(out.bt, { plan: 6, came: 5, now: 3, missing: 1, wait: 1, extra: 1 });
  assert.deepStrictEqual(out.am, [['Broušení', 2, 2, 1, 0, ['2'], [], ['3']], ['Obrobna', 1, 1, 1, 1, [], [], []], ['Bez skupiny', 1, 1, 1, 0, [], [], []]], 'stálá odpolední, která přišla ráno, je na ranní mimo plán');
  assert.deepStrictEqual(out.pm, [['Broušení', 1, 1, 0, 0, [], [], []], ['Obrobna', 1, 0, 0, 1, [], ['8'], []], ['Neznámé ID', 0, 1, 0, 0, [], [], ['99']]]);
  assert.deepStrictEqual(out.late, { plan: 6, came: 5, now: 4, missing: 2, wait: 0, extra: 1 }, 'po 14:00 odpolední, kdo nepřišel, nedorazil');
  assert.strictEqual(out.none, null);
  return null;
});
test('KPI (2.37): docházka a výkony z jednoho souboru – čtení, uložení, obsazenost po projektech, produktivita', () => {
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
  assert.deepStrictEqual(out.perf, { p: { Hřídel: [60, 200, 210, 2], Kryt: [10, 50, 60, 1] }, o: { Broušení: [60, 210, 2], Frézování: [10, 60, 1] }, n: { Hřídel: { Broušení: [60, 210, 2] }, Kryt: { Frézování: [10, 60, 1] } } }, '2.74: i data pro normy (díl → operace)');
  assert.deepStrictEqual(out.pcs, { '2026-10-01': { Broušení: 40, Frézování: 10 }, '2026-10-02': { Broušení: 50 } }, 'kusy podle operací i do KPI');
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
  assert.deepStrictEqual(out.log, [['workaudit', 'KPI: změněny sloupce souboru docházky a výkonů', 'wadvcols']]);
  assert.strictEqual(out.v, 59, 'verze dat 59: starší stránka docházku a výkony nesmaže');
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
  assert.strictEqual(out.v, 59);
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
  assert.deepStrictEqual(out.d, ['real', 7, 5, false, [['Brus', 5, 2, 'nepřišlo 1 · neschopenka 1'], ['CNC', 2, 2, ''], ['Neznámé ID', 0, 1, '']]]);
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
  assert.deepStrictEqual(out.rows, [['Výroba', 2, 1], ['Dvojí', 0, 0], ['Brus', 1, 1]], 'skupina reportu sečte CNC, Frézku a Lepení; Brus bez skupiny zůstane; v přesčas plán na polovinu (2.69)');
  assert.deepStrictEqual(out.mark, ['ot', false]);
  assert.deepStrictEqual(out.w.slice(0, 3), [2, 2, 100], 'přesčas 27. a práce ve svátek 29. se do normy nepočítají');
  assert.deepStrictEqual(out.w[3], [{ iso: '2026-10-27', mark: 'ot', done: 2 }, { iso: '2026-10-29', mark: 'hol', done: 5 }]);
  assert.deepStrictEqual(out.w[4], ['2026-10-26', '2026-10-30']);
  assert.ok(out.log.includes('Report docházky: nová skupina „Výroba“ (Obrobna, Lepení)') && out.log.includes('Report docházky 27. 10. 2026: počítá se do normy → přesčas'), out.log.join(' | '));
  assert.deepStrictEqual(out.kinds, ['skutečnost', 'přesčas (mimo normu)', 'víkend / svátek', 'práce ve svátek (mimo normu)']);
  return null;
});

test('KPI (2.44): výkonnost na osobu po odděleních, průměr na den, řazení od nejlepších i nejhorších, Excel', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const st = blank();
    st.positions = [mkPos('g1', 'Brus', []), mkPos('g2', 'CNC', []), mkPos('g3', 'Frézka', [])];
    st.positions[0].dept = 'Brus'; st.positions[1].dept = 'Obrobna'; st.positions[2].dept = 'Obrobna';
    const add = (k, pos, wid, extra) => { st.employees[k] = { key: k, last: 'P' + k, first: 'Jan', positionId: pos, shift: 'R', note: '', wid, ...(extra || {}) }; };
    add('a', 'g1', '1'); add('b', 'g1', '2'); add('c', 'g2', '3'); add('d', 'g3', '4'); add('e', 'g1', '5', { lead: ['Brus'] }); add('f', 'g1', '6', { excluded: true }); add('n', '', '7');
    S = sanitizeState(st);
    const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'];
    const row = (k, n) => ({ first: 'Jan', last: 'P' + k, h: days.map((d, i) => (i < n ? 7.5 : 0)), c: days.map(() => null) });
    S.periods['2026-10'] = { id: '2026-10', y: 2026, m: 10, days, rows: { a: row('a', 4), b: row('b', 2), c: row('c', 4), d: row('d', 4), e: row('e', 4), f: row('f', 4), n: row('n', 1) }, codes: {}, file: 'x', at: 1, headerRow: 1 };
    const rec = (name, total, spent, norm) => ({ name, total, count: 1, days: { '2026-10-05': total }, spent, norm, nspent: norm ? spent : 0 });
    S.production['2026-10'] = { time: true, file: 'v.xlsx', at: 1, records: 9, total: 0, names: {
      '1': rec('1', 400, 1200, 1080), '2': rec('2', 300, 480, 600), '3': rec('3', 100, 900, 0), '4': rec('4', 200, 1200, 1200),
      '5': rec('5', 999, 60, 60), '6': rec('6', 999, 60, 60), '7': rec('7', 10, 60, 0), 'neznamy': rec('Někdo Cizí', 5, 10, 0) } };
    const now = new Date(2026, 9, 31).getTime();
    const best = kpiPerf('2026-10', { now });
    const worst = kpiPerf('2026-10', { now, dir: 'worst' });
    const norm = kpiPerf('2026-10', { now, sort: 'norm' });
    const sh = kpiSheets(best);
    const r1 = v => v == null ? null : Math.round(v * 10) / 10;
    const pick = x => x.depts.map(d => [d.name, d.people.map(q => [q.key, q.rank, r1(q.v[x.sort])]), r1(d.avg.ks1), r1(d.avg.norm)]);
    return JSON.stringify({ months: kpiMonths(), best: pick(best), worst: pick(worst), norm: pick(norm), un: best.unmatched,
      tot: [best.tot.people, best.tot.days, best.tot.ks, r1(best.tot.ks1), r1(best.tot.ph), r1(best.tot.use)],
      a: [r1(best.people.find(q => q.key === 'a').v.h), r1(best.people.find(q => q.key === 'a').v.use)],
      sheet: [sh[0].rows[3].length, sh[0].rows[4].slice(0, 8), sh[0].rows.at(-1).slice(0, 8)], none: kpiPerf('2026-09', { now }).none });
  })()`));
  assert.deepStrictEqual(out.months, ['2026-10']);
  assert.deepStrictEqual(out.best, [
    ['Brus', [['b', 1, 150], ['a', 2, 100]], 116.7, 100],
    ['Obrobna', [['d', 1, 50], ['c', 2, 25]], 37.5, 100],
    ['Bez skupiny', [['n', 1, 10]], 10, null]], 'průměr na den = kusy ÷ odpracované dny, vedoucí a vyřazený ne, oddělení = součet skupin, vážený průměr oddělení');
  assert.deepStrictEqual(out.worst.map(d => d[1].map(q => q[0])), [['a', 'b'], ['c', 'd'], ['n']], 'od nejhorších');
  assert.deepStrictEqual(out.norm[1][1], [['d', 1, 100], ['c', null, null]], 'bez normy na konci, bez pořadí');
  assert.deepStrictEqual(out.norm[0][1], [['b', 1, 125], ['a', 2, 90]]);
  assert.strictEqual(out.un, 1, 'nespárované jméno z evidence');
  assert.deepStrictEqual(out.tot, [5, 15, 1010, 67.3, 15.8, 56.9]);
  assert.deepStrictEqual(out.a, [5, 66.7], 'Ø vykázané h na den a využití fondu');
  assert.deepStrictEqual(out.sheet[0], 14);
  assert.deepStrictEqual(out.sheet[1], ['Brus', 1, 'Pb Jan', '2', 'Brus', 2, 15, 2]);
  assert.deepStrictEqual(out.sheet[2], ['Celkem', '', '', '', '', 15, 112.5, 15]);
  assert.strictEqual(out.none, true, 'měsíc bez evidence');
  return null;
});

test('Konce trestů (2.44.1): lidé, kteří v souboru nejsou, jdou vyřadit', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const st = blank();
    st.positions = [mkPos('g1', 'Brus', [])]; st.positions[0].dept = 'Broušení';
    const add = (k, last, x) => { st.employees[k] = { key: k, last, first: 'Jan', positionId: 'g1', shift: 'R', note: '', ...(x || {}) }; };
    add('a|jan', 'A', { wid: '1' }); add('b|jan', 'B', { end: '2026-12-01' }); add('c|jan', 'C'); add('v|jan', 'V', { lead: ['Broušení'] }); add('x|jan', 'X', { excluded: true });
    S = sanitizeState(st);
    const p = endParse([['A', 'Jan', '', 'Skupina 1']], null, { today: '2026-11-03' });
    const o = endApply(p, { today: '2026-11-03', exclude: ['b|jan', 'v|jan', 'a|jan', 'nikdo|x'] });
    return JSON.stringify({ miss: p.missingP, names: p.missing, o: o.excluded, ex: Object.values(S.employees).filter(e => e.excluded).map(e => e.key).sort() });
  })()`));
  assert.deepStrictEqual(out.miss, [{ key: 'b|jan', name: 'B Jan', wid: '', dept: 'Broušení', end: '2026-12-01', sick: false }, { key: 'c|jan', name: 'C Jan', wid: '', dept: 'Broušení', end: '', sick: false }], 'bez vedoucích a už vyřazených');
  assert.deepStrictEqual(out.names, ['B Jan', 'C Jan']);
  assert.strictEqual(out.o, 1, 'vyřadí jen vybrané chybějící (ne vedoucího, ne člověka ze souboru)');
  assert.deepStrictEqual(out.ex, ['b|jan', 'x|jan']);
  return null;
});

test('Konce trestů (2.45.2): bez vedoucích, zkušenost podle hranice zaškolení, odchází a zůstane', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const st = blank();
    st.positions = [mkPos('g1', 'Brus', [])]; st.positions[0].dept = 'Broušení';
    st.positions[0].skillset = [{ id: 'k1', name: 'Obsluha', desc: '', scale: null }, { id: 'k2', name: 'Kontrola', desc: '', scale: null }]; st.positions[0].maxTab = 8;
    const add = (k, x) => { st.employees[k] = { key: k, last: k, first: 'Jan', positionId: 'g1', shift: 'R', note: '', ...(x || {}) }; };
    add('a', { rate: { k1: 4, k2: 4 }, end: '2026-11-20' });       // 100 % zaškolený, odchází
    add('b', { rate: { k1: 2, k2: 2 }, end: '2026-12-10' });       // 50 % v zácviku, odchází
    add('c', { rate: { k1: 4, k2: 2 }, end: '2026-10-01' });       // 75 % zaškolený, po termínu
    add('d', { rate: { k1: 4, k2: 4 } });                          // zůstane
    add('v', { lead: ['Broušení'], end: '2026-11-15' });             // vedoucí: nikde
    st.employees['n'] = { key: 'n', last: 'n', first: 'Jan', positionId: null, shift: 'R', note: '', end: '2026-11-30' };
    S = sanitizeState(st);
    const o = endsOverview('2026-11-03', 6);
    S.workAudit.trainPct = 80;
    const o2 = endsOverview('2026-11-03', 6);
    const sh = endsSheets(o)[1].rows;
    return JSON.stringify({ head: o.head, depts: o.depts.map(d => [d.name, d.head, d.goneSt]), st: o.st, m0: o.months[0].st, lim: [o.lim, o2.lim], c2: o2.st.overdue,
      lead: [...o.months.flatMap(m => m.people), ...o.overdue].some(x => x.key === 'v'), xl: [sh[0][4], sh.find(r => r[0] === 'a Jan')[4], sh.find(r => r[0] === 'b Jan')[5]] });
  })()`));
  assert.strictEqual(out.head, 5, 'vedoucí se nepočítá');
  assert.strictEqual(out.lead, false);
  assert.deepStrictEqual(out.depts, [['Broušení', 4, { ok: 2, tr: 1, none: 0 }], ['Bez skupiny', 1, { ok: 0, tr: 0, none: 1 }]], 'bez řádku Vedoucí');
  assert.deepStrictEqual(out.st, { head: { ok: 3, tr: 1, none: 1 }, gone: { ok: 2, tr: 1, none: 1 }, stay: { ok: 1, tr: 0, none: 0 }, overdue: { ok: 1, tr: 0, none: 0 } });
  assert.deepStrictEqual(out.m0, { ok: 1, tr: 0, none: 1 }, 'listopad: a zaškolený, n bez skupiny');
  assert.deepStrictEqual(out.lim, [75, 80], 'hranice zaškolení z KPI');
  assert.deepStrictEqual(out.c2, { ok: 0, tr: 1, none: 0 }, 's hranicí 80 % je 75 % v zácviku');
  assert.deepStrictEqual(out.xl, ['Zkušenost', 'Zaškolený', 50], 'Excel: zkušenost a procento');
  return null;
});

test('Plán kapacit (2.45.3): manažerský přehled – ohrožené měsíce, potřeba a vývoj po měsících', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const st = blank();
    const grp = (id, dept) => { const p = mkPos(id, id, []); p.dept = dept; p.skillset = [{ id: 'k' + id, name: 'Obsluha', desc: '', scale: null }]; p.maxTab = 8; p.tiers = []; return p; };
    st.positions = [grp('g1', 'Brus'), grp('g2', 'Obrobna'), grp('g3', 'Lepení')];
    const add = (k, g, end) => { st.employees[k] = { key: k, last: k, first: 'Jan', positionId: g, shift: 'R', note: '', rate: { ['k' + g]: 4 }, ...(end ? { end } : {}) }; };
    add('a', 'g1'); add('b', 'g1', '2026-12-10'); add('c', 'g1', '2027-02-01'); add('d', 'g2'); add('e', 'g2', '2026-10-01'); add('f', 'g3');
    S = sanitizeState(st);
    S.capPlan = cleanCapPlan({ groups: { g1: { n: 3, l2: 0, l3: 0, l4: 0 }, g2: { n: 1, l2: 0, l3: 0, l4: 0 } } }, new Set(S.positions.map(p => p.id)));
    const o = capPlanOutlook(capPlanAll(), '2026-11-04', 6);
    S.capPlan = cleanCapPlan({ groups: { g1: { n: 4, l2: 0, l3: 0, l4: 0 }, g2: { n: 1, l2: 0, l3: 0, l4: 0 } } }, new Set(S.positions.map(p => p.id)));
    const o2 = capPlanOutlook(capPlanAll(), '2026-11-04', 6);
    return JSON.stringify({ ids: o.ids, planned: o.planned, depts: o.depts.map(d => [d.name, d.set, d.need, d.now, d.months, d.short]), tot: o.tot, riskN: o.riskN, first: o.first, min: o.min, nowShort: o.nowShort,
      o2: [o2.tot.need, o2.tot.now, o2.tot.nowGap, o2.nowShort, o2.tot.gap, o2.tot.short] });
  })()`));
  assert.deepStrictEqual(out.ids, ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']);
  assert.deepStrictEqual(out.depts, [
    ['Brus', true, 3, 3, [3, 2, 2, 1, 1, 1], [0, 1, 1, 2, 2, 2]],
    ['Obrobna', true, 1, 2, [1, 1, 1, 1, 1, 1], [0, 0, 0, 0, 0, 0]],
    ['Lepení', false, null, 1, [1, 1, 1, 1, 1, 1], [0, 0, 0, 0, 0, 0]]], 'po termínu (e) se nepočítá do zbytku, bez plánu jen počty');
  assert.deepStrictEqual([out.tot.now, out.tot.need, out.tot.months, out.tot.short, out.tot.risk], [5, 4, [4, 3, 3, 2, 2, 2], [0, 1, 1, 2, 2, 2], [0, 1, 1, 1, 1, 1]], 'křivka jen z oddělení s plánem');
  assert.deepStrictEqual([out.riskN, out.first, out.min, out.nowShort, out.planned], [5, '2026-12', { v: 2, m: '2027-02' }, 0, true]);
  // 2.45.4: chybí celkem (potřeba celku − lidé celkem) proti součtu po odděleních
  assert.deepStrictEqual([out.tot.gap, out.tot.nowGap], [[0, 1, 1, 2, 2, 2], 0]);
  assert.deepStrictEqual(out.o2, [5, 5, 0, 1, [1, 2, 2, 3, 3, 3], [1, 2, 2, 3, 3, 3]], 'teď: Obrobna navíc vyrovná Brus v celku, po odděleních chybí 1');
  return null;
});

test('Docházka (2.46): zaokrouhlení příchodu a odchodu na směnu a čtvrthodiny, nejvýš 7,5 h, přepočet dřív nahraných dnů', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    S = sanitizeState(blank());
    const t = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
    const f = m => m == null ? null : Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
    const R = (a, b) => { const r = dvRound(t(a), t(b)); return [f(r[0]), f(r[1]), dvHours(t(a), t(b))]; };
    const cases = [['5:40', '14:00'], ['6:15', '13:45'], ['6:16', '14:15'], ['7:31', '14:20'], ['6:00', '13:44'], ['6:02', '13:20'],
      ['14:10', '22:05'], ['14:16', '21:50'], ['15:01', '21:44'], ['21:55', '6:10'], ['6:00', '18:30'], ['6:00', '6:20']];
    // přepočet: listopad nahraný postaru (pobyt − 30 min bez zaokrouhlení), říjen se nemění
    S.employees['a|a'] = { key: 'a|a', last: 'A', first: 'A', wid: '101', positionId: '', note: '' };
    S.workAudit.dv.pres = { '2026-11-02': { '101': [t('6:10'), t('14:10')] }, '2026-11-03': { '101': [t('7:31'), t('14:00')] }, '2026-10-30': { '101': [t('6:10'), t('14:10')] } };
    S.periods['2026-11'] = { id: '2026-11', y: 2026, m: 11, days: ['2026-11-01', '2026-11-02', '2026-11-03'], rows: { 'a|a': { first: 'A', last: 'A', h: [0, 7.5, 6], c: [null, null, null] } }, codes: {}, file: 'x', at: 1, headerRow: 1 };
    S.periods['2026-10'] = { id: '2026-10', y: 2026, m: 10, days: ['2026-10-30'], rows: { 'a|a': { first: 'A', last: 'A', h: [7.5], c: [null] } }, codes: {}, file: 'x', at: 1, headerRow: 1 };
    const before = dvRehours(false), applied = dvRehours(true), after = dvRehours(false);
    return JSON.stringify({ cases: cases.map(([a, b]) => [a, b, ...R(a, b)]), before, applied, after, h: S.periods['2026-11'].rows['a|a'].h, oct: S.periods['2026-10'].rows['a|a'].h });
  })()`));
  assert.deepStrictEqual(out.cases, [
    ['5:40', '14:00', '6:00', '14:00', 7.5],
    ['6:15', '13:45', '6:00', '14:00', 7.5],
    ['6:16', '14:15', '6:30', '14:00', 7],
    ['7:31', '14:20', '7:45', '14:00', 5.75],
    ['6:00', '13:44', '6:00', '13:30', 7],
    ['6:02', '13:20', '6:00', '13:15', 6.75],
    ['14:10', '22:05', '14:00', '22:00', 7.5],
    ['14:16', '21:50', '14:30', '22:00', 7],
    ['15:01', '21:44', '15:15', '21:30', 5.75],
    ['21:55', '6:10', '22:00', '6:00', 7.5],
    ['6:00', '18:30', '6:00', '14:00', 7.5],
    ['6:00', '6:20', '6:00', '6:15', 0],
  ], 'příchod do 15 min = začátek směny, pozdější nahoru na čtvrthodinu (7:31 → 7:45); odchod od 15 min před koncem = konec, dřívější dolů');
  assert.deepStrictEqual([out.before.cells, out.before.people, out.before.months], [1, 1, ['2026-11']], 'jen listopad (ze souboru), jen den, který nesedí');
  assert.deepStrictEqual([out.applied.cells, out.after.cells, out.h, out.oct], [1, 0, [0, 7.5, 5.75], [7.5]]);
  return null;
});

test('Úkoly (2.46): zadání, stavy, časová osa, opakování, připomínky, historie a čištění', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    S = sanitizeState(blank());
    const m = { at: Date.parse('2026-11-04T08:00:00'), by: 'Mistr', today: '2026-11-04' };
    const bad = tkAdd(S, { title: '  ' }, m);
    const a = tkAdd(S, { title: 'Kontrola hasicích přístrojů', due: '2026-11-05', owner: 'Novák', remind: 2, repeat: 'month' }, m);
    const b = tkAdd(S, { title: 'Objednat brusné kotouče', due: '2026-11-01', owner: 'Dvořák' }, m);
    const c = tkAdd(S, { title: 'Školení BOZP', due: '2026-11-20', remind: 7 }, m);
    const d = tkAdd(S, { title: 'Bez termínu' }, m);
    const ov1 = tkOverview(S, '2026-11-04');
    const base = JSON.parse(JSON.stringify(S));
    tkSet(S, a.id, { state: 'run' }, m);
    tkComment(S, a.id, 'Chybí revizní štítek u dvou přístrojů', m);
    const r = tkSet(S, a.id, { state: 'done' }, { ...m, at: m.at + 1000 });
    const again = tkSet(S, a.id, { state: 'done' }, m);
    tkSet(S, b.id, { due: '2026-11-10', owner: 'Svoboda' }, m);
    const ch = describeChanges(base, S, { by: 'Mistr' }).entries.map(e => e.text || (e.p + e.v0 + ' → ' + e.v1));
    // opakování: pozdní dokončení týdenního úkolu → termín aspoň dnes; konec měsíce
    const steps = [tkNextDue('2026-01-31', 'month', '2026-01-01'), tkNextDue('2026-08-31', 'half', '2026-01-01'), tkNextDue('2024-02-29', 'year', '2024-01-01'),
      tkNextDue('2026-10-01', 'week', '2026-11-04'), tkNextDue('', 'week', '2026-11-04')];
    const clean = cleanTasks({ list: [{ id: 'x', title: 'A', state: 'zzz', repeat: 'daily', remind: 9, due: '4.11.', next: 'nikdo', tl: [{ k: 'c', text: 'ok' }, { k: '??' }] }, { title: '' }, null] });
    const san = sanitizeState(JSON.parse(JSON.stringify(S))).tasks.list.length;
    return JSON.stringify({ bad, ov1: { open: ov1.open, late: ov1.late.map(t => t.title), soon: ov1.soon.map(t => t.title), remind: ov1.remind, owners: ov1.owners },
      tl: tkFind(S, a.id).tl.map(e => [e.k, tkTlText(e)]), next: r.next && { title: r.next.title, due: r.next.due, owner: r.next.owner, state: r.next.state, series: r.next.series === a.series, repeat: r.next.repeat },
      again: !!again.next, aNext: tkFind(S, a.id).next === (r.next && r.next.id), count: S.tasks.list.length, done: tkFind(S, a.id).doneBy,
      dueText: [tkDueText(b, '2026-11-04'), tkDueText(c, '2026-11-04'), tkDueText(tkFind(S, a.id), '2026-11-04'), tkDueText(d, '2026-11-04')],
      ch, steps, clean, san, sort: tkSort(S.tasks.list).map(t => t.title), sheets: tkSheets(S, '2026-11-04').map(x => [x.name, x.rows.length]), del: tkDelete(S, r.next.id), dangling: tkFind(S, a.id).next });
  })()`));
  assert.strictEqual(out.bad.err, 'Zadej název úkolu.');
  assert.deepStrictEqual(out.ov1, { open: 4, late: ['Objednat brusné kotouče'], soon: ['Kontrola hasicích přístrojů'], remind: 2, owners: ['Dvořák', 'Novák'] }, 'C (za 16 dní, připomenout 7 dní předem) se ještě nepřipomíná');
  assert.deepStrictEqual(out.tl, [['new', 'Úkol zadán'], ['s', 'Stav: Nový → Rozpracovaný'], ['c', 'Chybí revizní štítek u dvou přístrojů'], ['s', 'Stav: Rozpracovaný → Hotovo'], ['r', 'Další opakování založeno s termínem 5. 12. 2026']]);
  assert.deepStrictEqual(out.next, { title: 'Kontrola hasicích přístrojů', due: '2026-12-05', owner: 'Novák', state: 'new', series: true, repeat: 'month' });
  assert.deepStrictEqual([out.again, out.aNext, out.count, out.done], [false, true, 5, 'Mistr'], 'další opakování jen jednou');
  assert.deepStrictEqual(out.dueText, ['za 6 dní', 'za 16 dní', '5. 11. 2026', 'bez termínu']);
  assert.ok(out.ch.includes('Úkol „Kontrola hasicích přístrojů“ – stav: Nový → Hotovo'), JSON.stringify(out.ch));
  assert.ok(out.ch.some(t => /Úkol „Kontrola hasicích přístrojů“ zadán, termín 5\. 12\. 2026, zodpovídá Novák, každý měsíc/.test(t)), 'další opakování v historii');
  assert.ok(out.ch.includes('Úkol „Kontrola hasicích přístrojů“: komentář „Chybí revizní štítek u dvou přístrojů“'));
  assert.ok(out.ch.includes('Úkol „Objednat brusné kotouče“ – termín: 1. 11. 2026 → 10. 11. 2026') && out.ch.includes('Úkol „Objednat brusné kotouče“ – zodpovídá: Dvořák → Svoboda'));
  assert.deepStrictEqual(out.steps, ['2026-02-28', '2027-02-28', '2025-02-28', '2026-11-05', '2026-11-11']);
  assert.deepStrictEqual(out.clean.list.map(t => [t.id, t.state, t.repeat, t.remind, t.due, t.next, t.tl.length]), [['x', 'new', '', 2, '', '', 1]], 'neznámé hodnoty na výchozí, prázdný název pryč');
  assert.strictEqual(out.san, 5, 'sanitizeState úkoly drží');
  assert.deepStrictEqual(out.sort, ['Objednat brusné kotouče', 'Školení BOZP', 'Kontrola hasicích přístrojů', 'Bez termínu', 'Kontrola hasicích přístrojů'], 'otevřené podle termínu, bez termínu a hotové na konci');
  assert.deepStrictEqual(out.sheets, [['Úkoly', 6], ['Časová osa', 12]]);
  assert.deepStrictEqual([out.del, out.dangling], [true, ''], 'smazané další opakování neodkazuje');
  return null;
});

test('Vrátit zpět (2.45): jen změněné hodnoty, pozdější změny zůstanou, smazání a přidání, 3 dny, čištění', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    S = sanitizeState(blank());
    S.employees['a|jan'] = { key: 'a|jan', last: 'A', first: 'Jan', positionId: null, note: 'stará', wid: '1' };
    S.employees['b|jan'] = { key: 'b|jan', last: 'B', first: 'Jan', positionId: null, note: '', wid: '2' };
    S = sanitizeState(S);
    const t0 = Date.UTC(2026, 10, 3, 8);
    const base = sharedState(S);
    // jedno uložení: poznámka A, nové ID B, nový člověk C, smazaný ... nic
    S.employees['a|jan'].note = 'nová'; S.employees['b|jan'].wid = '22';
    S.employees['c|jan'] = { key: 'c|jan', last: 'C', first: 'Jan', positionId: null, note: '' };
    const after = sharedState(S);
    const rec = undoRecord(base, after, { at: t0, by: 'Mistr', card: '' });
    S.undo = undoPrune([rec], t0);
    S.log.push({ at: t0, by: 'Mistr', card: '', kind: 'person', text: 'změna', u: [rec.id] });
    // pozdější změna stejné hodnoty u B (nesmí se přepsat)
    S.employees['b|jan'].wid = '33';
    const can = undoable(S.log[0]);
    const r = undoApply(S, [rec.id], { at: t0 + 1000, by: 'Mistr' });
    const st = { a: S.employees['a|jan'].note, b: S.employees['b|jan'].wid, c: !!S.employees['c|jan'], un: !!S.log[0].un, left: S.undo.length, again: undoable(S.log[0]) };
    // 3 dny a velikost
    const old = { ...rec, id: 'uold0001', at: t0 - 4 * 864e5 };
    const pr = undoPrune([old, { ...rec, id: 'unew0001' }], t0).map(u => u.id);
    const big = undoRecord({ x: 'b'.repeat(UNDO_PATCH_MAX + 10) }, { x: 'a' }, { at: t0 });
    // čištění: neplatné pryč, log s odkazem přežije sanitize
    const cl = sanitizeState({ ...sharedState(S), undo: [rec, { id: 'bad', ch: [] }, { id: 'uxxxx1', ch: [{ p: ['log'], b: 1, h: 'x' }] }], log: [{ at: 1, text: 't', kind: 'person', u: [rec.id, 'zz'], un: { at: 5, by: 'X' } }] });
    // pořadí klíčů nevadí
    const h = [undoHash({ a: 1, b: [1, { c: 2, d: 3 }] }), undoHash({ b: [1, { d: 3, c: 2 }], a: 1 }), undoHash({ a: 2 }), undoHash(undefined)];
    return JSON.stringify({ ch: rec.ch.map(c => [c.p.join('.'), !!c.d, c.h === '-']).sort(), can, r: [r.done, r.skip, r.entries.length], st, pr, big: !!big.big,
      cl: [cl.undo.map(u => u.id), cl.undo[1] ? cl.undo[1].ch.length : null, cl.log[0].u, cl.log[0].un], h: [h[0] === h[1], h[0] === h[2], h[3]] });
  })()`));
  assert.deepStrictEqual(out.ch, [['employees.a|jan.note', false, false], ['employees.b|jan.wid', false, false], ['employees.c|jan', true, false]], 'změny po cestách, nový člověk = přidání');
  assert.strictEqual(out.can, true);
  assert.deepStrictEqual(out.r, [2, 1, 1], 'poznámka a nový člověk vráceny, ID B se mezitím změnilo');
  assert.deepStrictEqual(out.st, { a: 'stará', b: '33', c: false, un: true, left: 1, again: false }, 'přeskočená změna ID zůstane uložená');
  assert.deepStrictEqual(out.pr, ['unew0001'], 'jen poslední 3 dny');
  assert.strictEqual(out.big, true, 'moc velká změna se neukládá');
  assert.deepStrictEqual(out.cl[0].length, 2, 'neplatný záznam pryč');
  assert.strictEqual(out.cl[1], 0, 'cesta do historie změn se nevrací');
  assert.deepStrictEqual(out.cl[2].length, 1, 'neplatné id odkazu pryč');
  assert.deepStrictEqual(out.cl[3], { at: 5, by: 'X' });
  assert.deepStrictEqual(out.h, [true, false, '-']);
  return null;
});

test('Docházka postaru (2.48): kontrola jmen, prohozené jméno a příjmení, překlep, nikdo nový', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    S = sanitizeState(blank());
    const add = (last, first, extra) => { const key = norm(last) + '|' + norm(first); S.employees[key] = { key, last, first, positionId: null, note: '', ...extra }; };
    add('Novák', 'Jan'); add('Dvořák', 'Petr'); add('Svoboda', 'Karel'); add('Černý', 'Tomáš'); add('Malý', 'Ivan', { excluded: true }); add('Vedoucí', 'Josef', { lead: ['Brus'] });
    add('Kopecký', 'Aleš'); add('Kopecký', 'Aleš Jiří'); add('Horák', 'Milan');
    S = sanitizeState(S);
    // A jméno, B příjmení (jako soubor docházky)
    const aoa = [['Jméno', 'Příjmení', '', '', '', '1.10.2026', '2.10.2026', '5.10.2026', '6.10.2026', '7.10.2026'],
      ['Jan', 'Novák', '', '', '', 8, 8, 8, 8, 8],
      ['Dvořák', 'Petr', '', '', '', 7.5, 'D', 7.5, 7.5, 7.5],
      ['Karel', 'Svobodda', '', '', '', 6, 6, 6, 6, 6],
      ['Tomas', 'Cerny', '', '', '', 8, 8, 0, 8, 8],
      ['Neznámý', 'Člověk', '', '', '', 8, 8, 8, 8, 8],
      ['Novák', 'Jan', '', '', '', 4, 4, 4, 4, 4],
      ['Aleš', 'Kopecky', '', '', '', 1, 1, 1, 1, 1]];
    const res = buildPeriod(aoa, 'rijen.xlsx');
    const m = attMatch(res.period);
    const by = Object.fromEntries(m.rows.map(x => [x.first + ' ' + x.last, [x.how, x.emp, x.cand.length]]));
    const assign = new Map(m.rows.filter(x => x.emp).map(x => [x.k, x.emp]));
    const r = attRemap(res.period, assign);
    const keys = Object.keys(r.period.rows).sort();
    return JSON.stringify({ by, n: m.n, missing: m.missing.sort(), keys, names: keys.map(k => r.period.rows[k].last + ' ' + r.period.rows[k].first), skipped: r.skipped,
      hrs: r.period.rows['dvorak|petr'].h, emps: Object.keys(S.employees).length });
  })()`));
  assert.deepStrictEqual(out.by['Jan Novák'], ['exact', 'novak|jan', 0]);
  assert.deepStrictEqual(out.by['Dvořák Petr'], ['swap', 'dvorak|petr', 0], 'prohozené jméno a příjmení');
  assert.deepStrictEqual(out.by['Karel Svobodda'], ['fuzzy', 'svoboda|karel', 0], 'překlep');
  assert.deepStrictEqual(out.by['Tomas Cerny'], ['exact', 'cerny|tomas', 0], 'bez diakritiky je stejný klíč');
  assert.deepStrictEqual(out.by['Neznámý Člověk'], ['none', null, 0]);
  assert.deepStrictEqual(out.by['Novák Jan'], ['dup', null, 1], 'prohozený řádek člověka, který už v souboru je, se nepřiřadí');
  assert.strictEqual(out.by['Aleš Kopecky'][0], 'exact');
  assert.deepStrictEqual(out.missing, ['horak|milan', 'kopecky|ales jiri'], 'chybí v souboru: bez vyřazených a vedoucích');
  assert.deepStrictEqual(out.keys, ['cerny|tomas', 'dvorak|petr', 'kopecky|ales', 'novak|jan', 'svoboda|karel']);
  assert.deepStrictEqual(out.names, ['Černý Tomáš', 'Dvořák Petr', 'Kopecký Aleš', 'Novák Jan', 'Svoboda Karel'], 'jména ze systému, ne ze souboru');
  assert.strictEqual(out.skipped, 2, 'neznámý a zdvojený řádek');
  assert.deepStrictEqual(out.hrs, [7.5, 0, 7.5, 7.5, 7.5]);
  assert.strictEqual(out.emps, 9, 'nikdo nový');
  return null;
});

test('KPI (2.49): odpracované dny přepočtené na směnu 7,5 h (kratší den = část dne)', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const st = blank();
    st.positions = [mkPos('g1', 'Brus', [])]; st.positions[0].dept = 'Brus';
    st.employees.a = { key: 'a', last: 'A', first: 'Jan', positionId: 'g1', shift: 'R', note: '', wid: '1' };
    st.employees.b = { key: 'b', last: 'B', first: 'Jan', positionId: 'g1', shift: 'O', note: '', wid: '2' };
    S = sanitizeState(st);
    const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'];
    S.periods['2026-10'] = { id: '2026-10', y: 2026, m: 10, days, codes: {}, file: 'x', at: 1, headerRow: 1, rows: {
      a: { first: 'Jan', last: 'A', h: [7.5, 3.75, 9, 7.5, 0, 0], c: [null, null, null, 'D', null, null] },
      b: { first: 'Jan', last: 'B', h: [7.5, 7.5, 7.5, 7.5, 6.5, 3.75], c: [null, null, null, null, null, null] } } };
    const rec = (name, total) => ({ name, total, count: 1, days: { '2026-10-05': total }, spent: 600, norm: 0, nspent: 0 });
    S.production['2026-10'] = { time: true, file: 'v.xlsx', at: 1, records: 2, total: 0, names: { '1': rec('1', 250), '2': rec('2', 550) } };
    const x = kpiPerf('2026-10', { now: new Date(2026, 9, 31).getTime() });
    const q = k => x.people.find(p => p.key === k);
    return JSON.stringify({ a: [q('a').wd, q('a').days, q('a').v.ks], b: [q('b').wd, q('b').days, q('b').v.ks], tot: [x.tot.days, x.tot.ks1] });
  })()`));
  // a: 7,5 h = 1, 3,75 h = 0,5, 9 h = 1 (víc než směna), den s kódem D se nepočítá → 2,5 dne, 250 ks = 100 ks/den
  assert.deepStrictEqual(out.a, [3, 2.5, 100]);
  // b: stálá odpolední, pátek 6,5 h = celá zkrácená směna (1, od 2.53 sám od sebe), sobota 3,75 h = 0,5 → 5,5 dne, 550 ks = 100 ks/den
  assert.deepStrictEqual(out.b, [6, 5.5, 100]);
  assert.deepStrictEqual(out.tot, [8, 100]);
  return null;
});

test('Docházka (2.51): ruční úprava s důvodem, zámek dne a měsíce, nové nahrání úpravy nepřepíše; požadavky pracovníka v Úkolech', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const st = blank();
    st.positions = [mkPos('g1', 'Brus', [])]; st.positions[0].dept = 'Brus';
    st.employees.a = { key: 'a', last: 'A', first: 'Jan', positionId: 'g1', shift: 'R', note: '', wid: '1' };
    st.employees.b = { key: 'b', last: 'B', first: 'Eva', positionId: 'g1', shift: 'R', note: '', wid: '2' };
    S = sanitizeState(st);
    const days = ['2026-10-05', '2026-10-06', '2026-10-07'];
    const per = (ha, hb) => ({ id: '2026-10', y: 2026, m: 10, days: days.slice(), codes: {}, file: 'x', at: 1, headerRow: 1, rows: {
      a: { first: 'Jan', last: 'A', h: ha.slice(), c: [null, null, null] }, b: { first: 'Eva', last: 'B', h: hb.slice(), c: [null, null, null] } } });
    S.periods['2026-10'] = per([7.5, 7.5, 7.5], [7.5, 7.5, 7.5]);
    const base = JSON.parse(JSON.stringify(sharedState(S)));
    const meta = { by: 'Vedoucí', at: 1000 };
    const noNote = attEditSet(S, '2026-10', 'a', '2026-10-05', { h: '6', note: '' }, meta).err;
    const e1 = attEditSet(S, '2026-10', 'a', '2026-10-05', { h: '6,5', note: 'odešel k lékaři' }, meta);
    const e2x = attEditSet(S, '2026-10', 'b', '2026-10-07', { h: '', c: 'dov', note: 'dovolená schválená' }, meta), e2 = [e2x.edit.c, e2x.edit.wh, e2x.edit.wc];
    const afterEdit = [S.periods['2026-10'].rows.a.h[0], S.periods['2026-10'].rows.b.c[2], attendance(S.periods['2026-10'], 'a').workHours, attendance(S.periods['2026-10'], 'b').workDays];
    const stored = JSON.parse(JSON.stringify(S.attEdits['2026-10'].a['2026-10-05']));
    attLockSet(S, '2026-10', '2026-10-06', true, meta);
    const log = describeChanges(base, sharedState(S)).entries.map(x => x.text);
    // nové nahrání: jiné hodnoty ve všech dnech
    const old = S.periods['2026-10'];
    S.periods['2026-10'] = per([8, 4, 5], [3, 2, 1]);
    const prot = attProtect('2026-10', old);
    const P = S.periods['2026-10'];
    const reup = JSON.parse(JSON.stringify([P.rows.a.h, P.rows.b.h, P.rows.b.c, S.attEdits['2026-10'].a['2026-10-05'].wh, S.attEdits['2026-10'].b['2026-10-07'].wh, P.codes]));
    // zrušení úpravy vrátí hodnotu z (nového) souboru
    const del = attEditDel(S, '2026-10', 'a', '2026-10-05');
    const back = P.rows.a.h[0];
    // stejná hodnota jako soubor úpravu zruší
    const same = attEditSet(S, '2026-10', 'b', '2026-10-07', { h: '1', c: '', note: 'vráceno na soubor' }, meta);
    // listopad z Docházky a výkonů: uzamčený měsíc se nenahraje, úprava zůstane
    S.periods['2026-11'] = { id: '2026-11', y: 2026, m: 11, days: ['2026-11-02'], codes: {}, file: 'x', at: 1, headerRow: 1, rows: { a: { first: 'Jan', last: 'A', h: [7.5], c: [null] } } };
    attEditSet(S, '2026-11', 'a', '2026-11-02', { h: '5', note: 'ruční oprava' }, meta);
    const a = { dates: ['2026-11-02'], ids: ['1'], pres: { '2026-11-02': { '1': [360, 840] } }, abs: {} };
    attLockSet(S, '2026-11', '', true, meta);
    const lockedRes = dvToPeriods(a, { name: 'f.xlsx', at: 2 });
    const lockedH = S.periods['2026-11'].rows.a.h[0];
    attLockSet(S, '2026-11', '', false, meta);
    const openRes = dvToPeriods(a, { name: 'f.xlsx', at: 3 });
    const nov = [S.periods['2026-11'].rows.a.h[S.periods['2026-11'].days.indexOf('2026-11-02')], S.attEdits['2026-11'].a['2026-11-02'].wh];
    const clean = sanitizeState(JSON.parse(JSON.stringify({ ...sharedState(S), attEdits: { ...S.attEdits, '2026-12': { a: { '2026-12-01': { h: 3, note: '' }, 'bad': { h: 1, note: 'xx x' } } }, 'zz': {} }, attLocks: { ...S.attLocks, '2026-10': { days: ['2026-10-06', '2026-11-01', 'x'] }, '2026-09': { days: [] } } })));
    // požadavek pracovníka
    const t0 = tkAdd(S, { title: 'Obyčejný úkol', due: '2026-11-20' }, meta);
    const r1 = tkAdd(S, { title: 'Přeřazení na ranní', due: '2026-11-20', sev: 'high', person: 'a', pname: 'Jan A' }, meta);
    const r2 = tkAdd(S, { title: 'Boty', sev: 'low', person: 'b', pname: 'Eva B' }, meta);
    const b2 = JSON.parse(JSON.stringify(sharedState(S)));
    tkSet(S, r2.id, { sev: 'mid' }, meta);
    const tlog = describeChanges(b2, sharedState(S)).entries.map(x => x.text);
    const ov = tkOverview(S, '2026-11-05');
    const ct = cleanTasks(JSON.parse(JSON.stringify(S.tasks))).list.find(t => t.id === r1.id);
    const order = tkSort(S.tasks.list).map(t => t.title);
    const sheet = tkSheets(S, '2026-11-05')[0].rows;
    const newLog = describeChanges({ ...b2, tasks: { list: [] } }, b2).entries.map(x => x.text);
    return JSON.stringify({ noNote, e1: !!e1.ok, e2, afterEdit, stored: [stored.h, stored.note, stored.wh, stored.wc, stored.by], log, prot, reup, del, back, same: same.back, sameGone: !(S.attEdits['2026-10'] && S.attEdits['2026-10'].b),
      lockedRes, lockedH, openRes, nov, cleanE: Object.keys(clean.attEdits), cleanL: clean.attLocks['2026-10'].days, cleanL9: !!clean.attLocks['2026-09'],
      req: [ct.person, ct.pname, ct.sev, tkIsReq(ct), tkIsReq(t0)], ov: [ov.req, ov.reqHigh], order, head: sheet[0].slice(0, 4), row: sheet.find(r => r[0] === 'Přeřazení na ranní').slice(0, 4), tlog, newLog });
  })()`));
  assert.strictEqual(out.noNote, 'Napiš důvod úpravy (aspoň 3 znaky).');
  assert.ok(out.e1);
  assert.deepStrictEqual(out.e2, ['DOV', 7.5, null], 'kód se uloží velkými písmeny, zapamatuje se hodnota ze souboru');
  assert.deepStrictEqual(out.afterEdit, [6.5, 'DOV', 21.5, 2], 'úprava je hned v docházce (hodiny i den s kódem)');
  assert.deepStrictEqual(out.stored, [6.5, 'odešel k lékaři', 7.5, null, 'Vedoucí']);
  assert.ok(out.log.some(t => t === 'Docházka – A Jan, 5. 10. 2026: 7,5 h → 6,5 h (důvod: odešel k lékaři)'), out.log.join(' | '));
  assert.ok(out.log.some(t => t === 'Docházka – B Eva, 7. 10. 2026: 7,5 h → DOV (důvod: dovolená schválená)'), out.log.join(' | '));
  assert.ok(out.log.includes('Docházka: den 6. 10. 2026 uzamčen'));
  assert.deepStrictEqual(out.prot, { locked: 1, edits: 2 });
  // a: 5. 10. ručně 6,5, 6. 10. uzamčený = staré 7,5, 7. 10. nový soubor 5; b: 5. 10. nový 3, 6. 10. staré 7,5, 7. 10. ručně DOV
  assert.deepStrictEqual(out.reup.slice(0, 3), [[6.5, 7.5, 5], [3, 7.5, 0], [null, null, 'DOV']]);
  assert.deepStrictEqual(out.reup.slice(3), [8, 1, { DOV: 1 }], 'úprava si zapamatuje novou hodnotu ze souboru');
  assert.deepStrictEqual([out.del, out.back], [true, 8], 'zrušení vrátí hodnotu z posledního souboru');
  assert.deepStrictEqual([out.same, out.sameGone], [true, true]);
  assert.deepStrictEqual(out.lockedRes, [{ m: '2026-11', days: 0, people: 0, locked: true }]);
  assert.strictEqual(out.lockedH, 5, 'uzamčený měsíc se nenahraje');
  assert.deepStrictEqual(out.openRes, [{ m: '2026-11', days: 1, people: 1, lockedDays: 0, edits: 1 }]);
  assert.deepStrictEqual(out.nov, [5, 7.5], 'po odemčení soubor nahraje hodiny, ruční úprava zůstane a zná hodnotu ze souboru');
  assert.deepStrictEqual(out.cleanE, ['2026-11'], 'říjnové úpravy jsou zrušené, úprava bez důvodu a se špatným dnem se zahodí');
  assert.deepStrictEqual([out.cleanL, out.cleanL9], [['2026-10-06'], false]);
  assert.deepStrictEqual(out.req, ['a', 'Jan A', 'high', true, false]);
  assert.deepStrictEqual(out.ov, [2, 1]);
  assert.deepStrictEqual(out.order, ['Přeřazení na ranní', 'Obyčejný úkol', 'Boty'], 'stejný termín: vyšší závažnost první');
  assert.deepStrictEqual(out.head, ['Úkol', 'Druh', 'Pracovník', 'Závažnost']);
  assert.deepStrictEqual(out.row, ['Přeřazení na ranní', 'požadavek pracovníka', 'Jan A', 'Vysoká']);
  assert.ok(out.tlog.some(t => /Požadavek pracovníka Eva B „Boty“ – závažnost: Nízká → Střední/.test(t)), out.tlog.join(' | '));
  assert.ok(out.newLog.some(t => t === 'Požadavek pracovníka Jan A „Přeřazení na ranní“ zadán, závažnost vysoká, termín 20. 11. 2026'), out.newLog.join(' | '));
  return null;
});

test('Zkušební doba (2.52): první den práce z docházky a příchodů, 3 měsíce, začátek evidence se neukazuje', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const st = blank();
    st.positions = [mkPos('g1', 'Brus', [])];
    const emp = (k, wid) => { st.employees[k] = { key: k, last: k.toUpperCase(), first: 'X', positionId: 'g1', shift: 'R', note: '', wid }; };
    emp('a', '1'); emp('b', '2'); emp('c', '3'); emp('d', '4'); emp('e', '5');
    S = sanitizeState(st);
    // říjen postaru: a od 1. 10. (začátek evidence), b od 15. 10., c jen s kódem 15. 10. a hodinami 20. 10.
    const days = ['2026-10-01', '2026-10-15', '2026-10-20'];
    S.periods['2026-10'] = { id: '2026-10', y: 2026, m: 10, days, codes: {}, file: 'x', at: 1, headerRow: 1, rows: {
      a: { first: 'X', last: 'A', h: [7.5, 7.5, 7.5], c: [null, null, null] },
      b: { first: 'X', last: 'B', h: [0, 7.5, 7.5], c: [null, null, null] },
      c: { first: 'X', last: 'C', h: [0, 8, 6], c: [null, 'D', null] } } };
    // listopad jen z příchodů: d od 3. 11.
    S.workAudit.dv.pres = { '2026-11-03': { '4': [360, 840], '9': [360, 840] } };
    const t = '2026-11-05';
    const ends = ['2026-10-01', '2026-10-15', '2026-11-30', '2026-01-31', '2026-12-31'].map(probEnd);
    const p = k => { const x = probationOf(S.employees[k], t); return x && [x.start, x.end, x.left]; };
    return JSON.stringify({ ends, a: p('a'), b: p('b'), c: p('c'), d: p('d'), e: p('e'), late: probationOf(S.employees.b, '2027-01-15'), last: !!probationOf(S.employees.b, '2027-01-14'),
      text: probText(probationOf(S.employees.b, '2027-01-13')) });
  })()`));
  assert.deepStrictEqual(out.ends, ['2026-12-31', '2027-01-14', '2027-02-28', '2026-04-30', '2027-03-30']);
  assert.strictEqual(out.a, null, 'první den evidence vůbec: začátek neznáme');
  assert.deepStrictEqual(out.b, ['2026-10-15', '2027-01-14', 70]);
  assert.deepStrictEqual(out.c, ['2026-10-20', '2027-01-19', 75], 'den s kódem nepřítomnosti není práce');
  assert.deepStrictEqual(out.d, ['2026-11-03', '2027-02-02', 89], 'příchod ze souboru Docházka a výkony');
  assert.strictEqual(out.e, null, 'bez záznamu');
  assert.deepStrictEqual([out.late, out.last], [null, true], 'po konci zkušební doby ikona zmizí');
  assert.strictEqual(out.text, 'Ve zkušební době · u nás pracuje od 15. 10. 2026 · zkušební doba končí 14. 1. 2027 (zítra)');
  return null;
});

test('Zkrácený pátek (2.53): jen odpolední směna v pátek, sám od sebe (příchod, směna, střídání)', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const st = blank();
    st.positions = [mkPos('g1', 'Brus', [])];
    const emp = (k, shift, wid, x) => { st.employees[k] = { key: k, last: k.toUpperCase(), first: 'X', positionId: 'g1', shift, note: '', wid, ...(x || {}) }; };
    emp('r', 'R', '1', { shortFri: true }); emp('o', 'O', '2'); emp('s1', 'S1', '3'); emp('s2', 'S2', '4'); emp('p', 'R', '5');
    S = sanitizeState(st);
    S.capReport.s1am = '2026-W45';   // týden 2. 11.: skupina 1 ranní, skupina 2 odpolední
    // pátek 6. 11. 2026 a pátek 13. 11. (další týden se střídá)
    const days = ['2026-11-06', '2026-11-13'];
    const row = () => ({ first: 'X', last: 'Y', h: [6.5, 6.5], c: [null, null] });
    S.periods['2026-11'] = { id: '2026-11', y: 2026, m: 11, days, codes: {}, file: 'x', at: 1, headerRow: 1, rows: { r: row(), o: row(), s1: row(), s2: row(), p: row() } };
    // p má stálou ranní, ale 6. 11. přišel na odpolední (příchod 14:00)
    S.workAudit.dv.pres = { '2026-11-06': { '5': [840, 1320] } };
    const a = k => { const x = attendance(S.periods['2026-11'], k); return [x.fridays, x.shortDays, x.cells.map(c => c.ds)]; };
    return JSON.stringify({ r: a('r'), o: a('o'), s1: a('s1'), s2: a('s2'), p: a('p'), diff: attendance(S.periods['2026-11'], 'o').friDiff });
  })()`));
  assert.deepStrictEqual(out.r, [0, 2, [7.5, 7.5]], 'stálá ranní: pátek plná směna (ruční zaškrtnutí se už nepoužívá)');
  assert.deepStrictEqual(out.o, [2, 0, [6.5, 6.5]], 'stálá odpolední: oba pátky zkrácené');
  assert.deepStrictEqual(out.s1, [1, 1, [7.5, 6.5]], 'skupina 1: ranní, pak odpolední');
  assert.deepStrictEqual(out.s2, [1, 1, [6.5, 7.5]], 'skupina 2: odpolední, pak ranní');
  assert.deepStrictEqual(out.p, [1, 1, [6.5, 7.5]], 'příchod na odpolední má přednost před směnou');
  assert.strictEqual(out.diff, 2, 'práh Kafe se sníží o rozdíl za zkrácené pátky');
  return null;
});

test('Servis (2.53): uzamčení vyřízeného protokolu – jen když je vše vráceno, čištění a historie', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const it = (back, purpose) => ({ kind: 'Bruska', brand: 'M', model: 'X', iid: 'B-' + Math.random().toString(36).slice(2, 6), sn: '', purpose: purpose || 'repair', faults: [], back: back || '' });
    const svc = cleanService({ shipments: [
      { id: 'sv1', no: 1, year: 2026, date: '2026-10-01', items: [it('2026-10-10'), it('', 'scrap')], lock: { at: 5, by: 'Mistr' } },
      { id: 'sv2', no: 2, year: 2026, date: '2026-10-02', items: [it('2026-10-10'), it('')], lock: { at: 5, by: 'Mistr' } } ] });
    const a = { ...blank(), service: cleanService({ shipments: [{ id: 'sv1', no: 1, year: 2026, date: '2026-10-01', items: svc.shipments[0].items }] }) };
    const b = { ...blank(), service: svc };
    return JSON.stringify({ l1: svc.shipments[0].lock, l2: svc.shipments[1].lock || null, done: [svShipDone(svc.shipments[0]), svShipDone(svc.shipments[1])],
      log: describeChanges(a, b).entries.map(x => x.text).filter(t => /uzamčen/.test(t)) });
  })()`));
  assert.deepStrictEqual(out.l1, { at: 5, by: 'Mistr' }, 'vrácené + k vyřazení = vyřízené, zámek zůstane');
  assert.strictEqual(out.l2, null, 'se zařízením na servisu se zámek zahodí');
  assert.deepStrictEqual(out.done, [true, false]);
  assert.deepStrictEqual(out.log, ['Servis 2026/001: protokol uzamčen (vše vráceno)']);
  return null;
});

test('Servis (2.56): vyřazeno servisem – příloha povinná, čištění, vyřízení, historie zařízení a změn, soubory do zálohy', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const F1 = 'a'.repeat(32), F2 = 'b'.repeat(32), F3 = 'c'.repeat(32);
    const rej = { date: '2026-10-20', note: 'oprava se nevyplatí', files: [F1, F2], name: 'vyrazeni.pdf', type: 'application/pdf', size: 1500000, at: 9, by: 'Mistr' };
    const base = (r, back) => ({ dev: '', kind: 'Bruska', brand: 'M', model: 'X', iid: 'B-1', sn: '', purpose: 'repair', faults: [], back: back || '', rej: r });
    const mk = items => cleanService({ devices: [{ id: 'dv1', kind: 'Bruska', brand: 'M', model: 'X', iid: 'B-1' }], shipments: [{ id: 'sv1', no: 1, year: 2026, date: '2026-10-01', items }] });
    const ok = mk([{ ...base(rej, '2026-10-25'), dev: 'dv1' }]);
    const bad = [
      mk([base({ ...rej, files: [] })]), mk([base({ ...rej, files: ['nic'] })]), mk([base({ ...rej, date: '2026-09-01' })]),
      mk([base({ ...rej, date: 'x' })]), mk([base(null)]) ].map(s => s.shipments[0].items[0].rej || null);
    const weird = mk([base({ ...rej, type: 'text/html', name: '', files: [F1, F1, F3, ...Array(20).fill(F2)] })]).shipments[0].items[0].rej;
    const it = ok.shipments[0].items[0];
    const h = svHistory(ok, 'dv1', '2026-11-01');
    const open = mk([{ ...base(null), dev: 'dv1' }]);
    const hOpen = svHistory(open, 'dv1', '2026-11-01');
    const st = { ...blank(), service: ok };
    st.service.shipments[0].sign = { file: F3, name: 'X', at: 1, by: '' };
    const a = { ...blank(), service: open }, b = { ...blank(), service: mk([{ ...base(rej), dev: 'dv1' }]) };
    const log = describeChanges(a, b).entries.map(x => x.text).filter(t => /vyřazen/.test(t));
    const logBack = describeChanges(b, a).entries.map(x => x.text).filter(t => /vyřazen|vrácení/.test(t));
    return JSON.stringify({ rej: it.rej, back: it.back, done: svShipDone(ok.shipments[0]), openDone: svShipDone(open.shipments[0]), bad, weird,
      h: { retired: h.retired, rejBy: h.rejBy, out: h.out, avg: h.avgDays }, hOpen: { out: hOpen.out, retired: hOpen.retired },
      files: svFileIds(st).sort(), log, logBack });
  })()`));
  assert.deepStrictEqual(out.rej, { date: '2026-10-20', note: 'oprava se nevyplatí', files: ['a'.repeat(32), 'b'.repeat(32)], name: 'vyrazeni.pdf', type: 'application/pdf', size: 1500000, at: 9, by: 'Mistr' });
  assert.strictEqual(out.back, '', 'vyřazené servisem nemá zároveň vrácení');
  assert.deepStrictEqual([out.done, out.openDone], [true, false], 'vyřazené servisem = vyřízené (jde uzamknout)');
  assert.deepStrictEqual(out.bad, [null, null, null, null, null], 'bez přílohy, s neplatným souborem nebo datem před odesláním neplatí');
  assert.strictEqual(out.weird.type, 'application/pdf');
  assert.strictEqual(out.weird.name, 'protokol');
  assert.strictEqual(out.weird.files.length, 12, 'nejvýš 12 dílů přílohy');
  assert.deepStrictEqual(out.h, { retired: '2026-10-20', rejBy: true, out: false, avg: null }, 'zařízení je vyřazené ke dni protokolu servisu, ne na servisu');
  assert.deepStrictEqual(out.hOpen, { out: true, retired: '' });
  assert.deepStrictEqual(out.files, ['a'.repeat(32), 'b'.repeat(32), 'c'.repeat(32)], 'podpis i díly přílohy jdou do zálohy');
  assert.deepStrictEqual(out.log, ['Servis 2026/001: vyřazeno servisem 20. 10. 2026 – Bruska · M X (ID B-1) (protokol k vyřazení: vyrazeni.pdf) · oprava se nevyplatí']);
  assert.deepStrictEqual(out.logBack, ['Servis 2026/001: zrušeno vyřazení servisem – Bruska · M X (ID B-1)']);
  return null;
});

test('Shortage (2.61): sloupce importů, barvy EANu, evidence pohybu a rozbor položek', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const T = v => ({ text: v, link: '' });
    // 1. krok: sloupce jinde než výchozí, odhad podle nadpisů, barvy EANu
    const head = ['Zakázka', 'EAN', 'Popis', 'Množství urgentní', 'Probíhající operace', 'Index'];
    const g = shColsGuess('list', [['Seznam urgentů'], head], SH_COLS.list);
    const rows = [[T('Seznam urgentů')], head.map(T),
      [T('OBJ-1'), { text: '8590000000001', link: 'http://is.example/x?activeBarcode=1.2.3&y', fill: 'FFFF0000' }, T('Hřídel'), T('4'), T('Brus'), T('A')],
      [T('OBJ-2'), { text: '8590000000002', link: '', fill: 'FFC000' }, T('Kryt'), T('2'), T('Fréza'), T('B')],
      [T('OBJ-3'), { text: '8590000000003', link: '', fill: '' }, T('Šroub'), T('9'), T('Brus'), T('')]];
    const r = shBuild(rows, g.cols, { FF0000: 'top' });
    const r2 = shBuild(rows, g.cols, { FF0000: 'none', FFC000: 'top2' });
    // AI návrh: malé písmeno, nesmysl, prázdné nepovinné pole, povinné pole se nevyprázdní
    const ai = shColsFromAi('list', { cols: { order: 'a', ean: '', top: '', op: 'Ž' } }, g.cols);
    const plan = shColsFromAi('plan', { cols: { asm: 'b', sub: 'C' }, sheet: 'Plán' }, SH_COLS.plan);
    const pg = shColsGuess('plan', [['Objednávka', 'EAN sestavy', 'X', 'EAN poddílu', 'Index', 'Probíhající operace']], SH_COLS.plan);
    const pg2 = shColsGuess('plan', [['Objednávka', 'EAN', 'EAN', 'Index']], SH_COLS.plan);
    // 3. krok: evidence pohybu s jinými sloupci, počet záznamů a operace
    const mg = shColsGuess('move', [['Pracoviště', 'QR kód', 'Datum a čas', 'Ks', 'Stav']], SH_COLS.move);
    const mrows = [['Pracoviště', 'QR kód', 'Datum a čas', 'Ks', 'Stav'], ['Brus 2', '1.2.3', '22.10.2026 8:00', '3', 'Hotovo'], ['Lakovna', '1.2.3', '22.10.2026 10:00', '4', 'Předáno'], ['Fréza', '9.9.9', '21.10.2026 7:00', '1', 'Čeká']].map(x => x.map(T));
    const rb = shRecBuild(mrows, mg.cols);
    const rec = rb.recs.get('1.2.3');
    // rozbor: sestava s poddílem Hala 2 a čekajícím poddílem bez kódu, operace z plánu
    const it = { ...r.items[0], rec, pop: 'Broušení – hala 2', op: '', subs: [{ id: 's1', ean: '77', code: '7.7.7', op: 'Leštění – hala 2', rec: null }], cands: [{ ean: '88', code: '', op: 'Lakování', link: '' }] };
    const a = shAnalysis(it);
    const sheet = shAnalysisSheet({ items: [it, r.items[2]] });
    // čištění a historie
    const st = sanitizeState({ ...blank(), shortage: { lists: [], depts: [], cols: { list: { ...g.cols, ean: '1x' }, plan: { sheet: 'Plán\\u0001', asm: 'b' }, nic: {} }, colors: { ff0000: 'top', '#ffc000': 'top2', FFFFFF: 'top', ABCDEF: 'xx' } } });
    const A = sanitizeState(blank());
    const B = JSON.parse(JSON.stringify(A));
    B.shortage = st.shortage;
    const log = describeChanges(A, B, { at: 9, by: 'V', card: '' }).entries.filter(e => e.kind === 'shortage').map(e => e.text);
    return JSON.stringify({ g, r: { tops: r.items.map(i => [i.ean, i.top, i.top2, i.fill || '']), fills: [...r.fills], first: r.items[0].name, code: r.items[0].code, op: r.items[0].op },
      r2: r2.items.map(i => [i.ean, i.top, i.top2]), ai, plan, pg: pg.cols, pg2: [pg2.cols.asm, pg2.cols.sub],
      mg: mg.cols, rec: { state: rec.state, op: rec.op, n: rec.n, qty: rec.qty }, rbRows: rb.rows,
      a: { cur: a.cur, internal: a.internal, subs: a.subs.map(s => [s.ean, s.hall]), noRec: a.noRec, note: a.note }, sheet: sheet.rows.map(x => [x[0], x[1], x[15]]),
      cols: st.shortage.cols, colors: st.shortage.colors, log,
      sample: shAiSample([{ name: 'P', rows: [['Pracoviště', 'QR kód', 'Datum a čas'], ['Brus 2', '5.0.1', '06.11.2026 07:10'], ['Lakovna', 'Předáno', 4]] },
        { name: 'U', rows: [['Urgentní díly HALA 2'], ['Zakázka', 'Popis', 'EAN'], ['Šroub', 'Hřídel', 'X'], ['Matice', 'Kryt', 'Y'], ['OBJ-501', 'Hřídel', '8590000005001', 4.5]] }]),
      guess: ['FF0000', 'C00000', 'FFC000', 'FFFF00', '00B050', '', 'FFFFFF'].map(shColorGuess), hex: ['ff0000', 'FF00FF00', '#abc', 'FFFFFF', null].map(shHex), idx: [10, 64, 'x'].map(shIndexed) });
  })()`));
  assert.deepStrictEqual(out.g.cols, { order: 'A', name: 'C', ean: 'B', index: 'F', qty: 'D', top: 'G', op: 'E', note: '', noteChosen: false }, 'sloupce podle nadpisů, TOP bez nadpisu zůstane výchozí');
  assert.strictEqual(out.g.header, 1, 'nadpisy na 2. řádku');
  assert.deepStrictEqual(out.r.tops, [['8590000000001', true, false, 'FF0000'], ['8590000000002', false, false, 'FFC000'], ['8590000000003', false, false, '']], 'červená = TOP nahoře, neznámá barva nic');
  assert.deepStrictEqual(out.r.fills, [['FF0000', 1], ['FFC000', 1]], 'barvy výplně EANu s počty (ARGB → RGB)');
  assert.deepStrictEqual([out.r.first, out.r.code, out.r.op], ['Hřídel', '1.2.3', 'Brus']);
  assert.deepStrictEqual(out.r2, [['8590000000002', false, true], ['8590000000001', false, false], ['8590000000003', false, false]], 'oranžová = TOP 2 nad ostatními');
  assert.deepStrictEqual(out.ai, { ...out.g.cols, order: 'A', ean: 'B', top: '', op: '' }, 'AI: písmeno se převede, prázdné nepovinné = v souboru není, povinný EAN zůstane');
  assert.deepStrictEqual(out.plan, { asm: 'B', sub: 'C', index: 'H', order: 'M', op: 'AM', qty: '', sheet: 'Plán' });
  assert.deepStrictEqual(out.pg, { asm: 'B', sub: 'D', index: 'E', order: 'A', op: 'F', qty: '', sheet: '' }, 'plán: EAN sestavy a EAN poddílu');
  assert.deepStrictEqual(out.pg2, ['B', 'C'], 'plán: dva sloupce EAN = sestava a poddíl');
  assert.deepStrictEqual(out.mg, { code: 'B', when: 'C', qty: 'D', state: 'E', op: 'A' });
  assert.deepStrictEqual(out.rec, { state: 'Předáno', op: 'Lakovna', n: 2, qty: '4' }, 'nejnovější záznam, počet záznamů kódu, operace');
  assert.strictEqual(out.rbRows, 3);
  assert.deepStrictEqual(out.a.cur, 'Broušení – hala 2', 'bez operace v seznamu se vezme operace sestavy z plánu');
  assert.deepStrictEqual([out.a.internal, out.a.subs, out.a.noRec], [true, [['77', true], ['88', false]], 2], 'všechny poddíly, i s jinou operací a bez kódu');
  assert.strictEqual(out.a.note, 'Probíhá: Broušení – hala 2 · poslední záznam: Předáno, Lakovna, 4 ks, 22. 10. 2026 10:00 (2 záznamy) · poddíly 2 (2 bez záznamu)');
  assert.deepStrictEqual(out.sheet, [['#', 'Typ', 'Interní záznam'], [1, 'sestava', 'ano'], ['1.1', 'poddíl', 'ne'], ['1.2', 'poddíl (jiná operace)', 'ne'], [2, 'díl', 'ne']]);
  assert.deepStrictEqual(out.cols.list.ean, 'C', 'neplatný povinný sloupec = výchozí');
  assert.deepStrictEqual([out.cols.plan.asm, out.cols.plan.sheet, out.cols.nic], ['B', 'Plán', undefined], 'list bez řídicích znaků, neznámý druh pryč');
  assert.deepStrictEqual(out.colors, { FF0000: 'top', FFC000: 'top2' }, 'barvy HEX velkými, bílá a neznámá úroveň pryč');
  assert.ok(out.log.some(t => /sloupce urgentních dílů: Číslo objednávky A/.test(t)) && out.log.includes('Shortage: barva EANu #FF0000 = TOP SHORTAGE'), out.log.join(' | '));
  assert.deepStrictEqual(out.sample[0].rows, [{ A: 'Pracoviště', B: 'QR kód', C: 'Datum a čas' }, { A: '<text s číslicemi>', B: '<text s číslicemi>', C: '<datum 2026-11-06>' }, { A: '<text>', B: '<text>', C: '<celé číslo>' }], 'AI: hodnoty pod nadpisy jen jako typ');
  assert.deepStrictEqual(out.sample[1].rows[3], { A: '<text>', B: '<text>', C: '<text>' }, 'nadpisy nejvýš první 3 řádky, dál jen typy');
  assert.deepStrictEqual(out.sample[1].rows[4], { A: '<text s číslicemi>', B: '<text>', C: '<text s číslicemi>', D: '<číslo>' });
  assert.deepStrictEqual(out.guess, ['top', 'top', 'top2', 'top2', 'done', 'none', 'none'], 'zelená 00B050 je od 2.76 Hotovo');
  assert.deepStrictEqual(out.hex, ['FF0000', '00FF00', '', '', '']);
  assert.deepStrictEqual(out.idx, ['FF0000', '', '']);
});

test('Shortage (2.70): převzato ze samostatné aplikace Shortage 1.1–1.6 (A–S, poznámka od plánování, dva listy plánu, QR varianty, evidence předem)', () => {
  const core = loadCore();
  const q = code => JSON.parse(run(core, `JSON.stringify((() => { const c = (text, link = '', fill = '') => ({ text, link, fill }); const L = code => 'https://erp.example/?activeBarcode=' + code; ${code} })())`));
  // urgenty A–S bez hlavičky: G je index, ne priorita; S je oddělení i poznámka od plánování
  let out = q(`const r = Array.from({ length: 19 }, () => c('')); r[0] = c('000123', L('U.1')); r[1] = c('22.10.2026 8:00'); r[2] = c('Držák'); r[5] = c('OBJ77'); r[6] = c('TOP'); r[7] = c('12,5'); r[18] = c('Brus Hala 2'); return shBuild([r]).items[0];`);
  assert.deepStrictEqual([out.ean, out.name, out.order, out.index, out.qty, out.op, out.code, out.top, out.note], ['000123', 'Držák', 'OBJ77', 'TOP', '12,5', 'Brus Hala 2', 'U.1', false, 'Poznámka od plánování: Brus Hala 2']);
  // mapování se přepne podle šířky tabulky, vlastní ruční mapování zůstane
  out = q(`const custom = { ...SH_COLS.list, ean: 'B', qty: 'F' }; return [shColsGuess('list', [Array(19).fill('')], SH_COLS.list).cols, shColsGuess('list', [Array(8).fill('')], SH_URGENT_COLS).cols, shColsGuess('list', [Array(19).fill('')], custom).cols];`);
  assert.deepStrictEqual([out[0].ean, out[0].name, out[0].order, out[0].qty, out[0].op, out[0].top, out[0].note], ['A', 'C', 'F', 'H', 'S', '', 'S']);
  assert.deepStrictEqual([out[1].ean, out[1].order, out[1].qty, out[1].op], ['C', 'A', 'E', 'H']);
  assert.deepStrictEqual([out[2].ean, out[2].qty], ['B', 'F']);
  out = q(`const h = Array(19).fill(''); h[0] = 'EAN'; h[2] = 'Název dílu'; h[5] = 'Číslo objednávky'; h[6] = 'Index'; h[7] = 'Urgentní množství'; h[18] = 'Oddělení kde v procesu';
    const r = Array(19).fill(''); r[0] = '0000555'; r[2] = 'Držák urgent'; r[5] = 'OBJ77'; r[6] = 'TOP'; r[7] = '12,5'; r[18] = 'Brus';
    const saved = { ...SH_URGENT_COLS, note: 'R', noteChosen: true }, h2 = Array(19).fill(''); h2[0] = 'EAN'; h2[2] = 'Název dílu'; h2[18] = 'Poznámka';
    return { head: shColsGuess('list', [h], SH_COLS.list), data: shColsGuess('list', [r], SH_COLS.list), chosen: shColsGuess('list', [h2], saved).cols.note, none: shColsGuess('list', [h2], { ...saved, note: '' }).cols.note };`);
  assert.deepStrictEqual([out.head.cols.op, out.head.cols.qty, out.head.header], ['S', 'H', 0], 'nadpis oddělení v procesu');
  assert.deepStrictEqual([out.data.header, out.data.found, out.data.cols.top], [-1, [], ''], 'název s „urgent“ a index TOP nejsou hlavička');
  assert.deepStrictEqual([out.chosen, out.none], ['R', ''], 'ruční volba sloupce poznámek se pamatuje, i „v souboru není“');
  // doplnění poznámek do rozpracovaného seznamu: ruční text zůstane, nejednoznačný EAN se nevybere
  out = q(`const l = { items: [{ ean: '1', note: 'Ručně' }, { ean: '2', index: 'A' }, { ean: '2', index: 'B' }] }; const inc = [{ ean: '1', note: shPlanningNote('Termín') }, { ean: '2', note: shPlanningNote('Neurčeno') }];
    const first = shApplyNotes(l, inc); const again = shApplyNotes(l, inc); return { first, again, note: l.items[0].note, blank: shPlanningNote('  ') };`);
  assert.deepStrictEqual([out.first.updated, out.first.ambiguous, out.again.updated, out.note, out.blank], [1, 1, 0, 'Ručně · Poznámka od plánování: Termín', '']);
  // první list plánu: přesná shoda EAN + objednávka + line, bez návratu k samotnému EANu
  out = q(`const p = shPlanBlank('p'); shPlanDirectRow(p, '001', L('O1-L10'), 'Brus', '0010', 'OBJ1'); shPlanDirectRow(p, '1', L('O1-L20'), 'Lakovna', '20', 'OBJ1'); shPlanDirectRow(p, '1', L('O2-L10'), 'Montáž', '10', 'OBJ2');
    const l = { items: [{ ean: '1', index: '10', order: 'OBJ1' }, { ean: '1', index: '20', order: 'OBJ1' }, { ean: '1', index: '10', order: 'OBJ2' }, { ean: '1', index: '99', order: 'OBJ1', op: 'Zachovat' }, { ean: '1', index: '', order: 'OBJ1' }] };
    const r = shApplyPlan(l, p); return { r, items: l.items };`);
  assert.deepStrictEqual(out.items.slice(0, 3).map(x => [x.code, x.op]), [['O1-L10', 'Brus'], ['O1-L20', 'Lakovna'], ['O2-L10', 'Montáž']]);
  assert.deepStrictEqual([out.items[3].code, out.items[3].op, out.items[3].qrChoices, out.items[3].planMismatch, out.r.unmatchedFirst], [undefined, 'Zachovat', [], true, 2]);
  // víc QR u téže kombinace: nabídka s operací a záznamem (i evidence nahraná před plánem), cizí kód nejde vybrat
  out = q(`let l = { items: [{ id: 'i', ean: '1', note: 'Zachovat', st: 'wait' }] };
    shApplyRecs(l, shRecBuild([['Q.1', '22.10.2026 9:00', '5', 'Broušení'].map(x => c(x))]).recs, { at: 1 });
    const p = shPlanBlank('p'); shPlanDirectRow(p, '1', L('Q.1'), 'Brus'); shPlanDirectRow(p, '1', L('Q.2'), 'Lakovna'); shPlanDirectRow(p, '1', L('X'), 'Cizí', '9', 'JINÁ');
    const r = shApplyPlan(l, p); l = cleanShortage({ lists: [l] }).lists[0];
    const before = JSON.parse(JSON.stringify(l.items[0].qrChoices)); const first = shSelectQr(l, 'i', 'Q.1'); const it1 = JSON.parse(JSON.stringify(l.items[0]));
    const bad = shSelectQr(l, 'i', 'X'); shSelectQr(l, 'i', 'Q.2');
    return { r: [r.linked, r.ambiguous], before: before.map(x => [x.code, x.op, x.rec && x.rec.state]), first, it1: [it1.code, it1.op, it1.rec.qty, it1.note, it1.st], bad, second: [l.items[0].code, l.items[0].op, l.items[0].rec] };`);
  assert.deepStrictEqual(out.r, [0, 1], 'dva kódy = nejednoznačné, nic se nepřidělí samo');
  assert.deepStrictEqual(out.before, [['Q.1', 'Brus', 'Broušení'], ['Q.2', 'Lakovna', null]]);
  assert.deepStrictEqual([out.first, out.it1, out.bad, out.second], [true, ['Q.1', 'Brus', '5', 'Zachovat', 'wait'], false, ['Q.2', 'Lakovna', null]]);
  // dříve vybraný cizí QR = ke kontrole; jediný přesný odkaz se doplní; nebezpečný odkaz v nabídce zmizí
  out = q(`const p = shPlanBlank('p'); shPlanDirectRow(p, '1', L('RIGHT'), 'Brus', '10', 'O1'); const l = { items: [{ id: 'i', ean: '1', index: '10', order: 'O1', code: 'WRONG' }, { id: 'j', ean: '1', index: '10', order: 'O1' }] };
    const r = shApplyPlan(l, p); const conflict = [l.items[0].qrConflict, l.items[0].code, l.items[1].code]; shSelectQr(l, 'i', 'RIGHT');
    const p2 = shPlanBlank('p'); shPlanDirectRow(p2, '2', L('A')); shPlanDirectRow(p2, '2', L('B')); const l2 = { items: [{ ean: '2' }] }; shApplyPlan(l2, p2); l2.items[0].qrChoices.push({ link: 'javascript:x', code: 'BAD' });
    return { r: [r.conflicts, r.linked], conflict, fixed: [l.items[0].code, l.items[0].qrConflict], choices: cleanShortage({ lists: [l2] }).lists[0].items[0].qrChoices.map(x => x.code) };`);
  assert.deepStrictEqual([out.r, out.conflict, out.fixed, out.choices], [[1, 1], [true, 'WRONG', 'RIGHT'], ['RIGHT', false], ['A', 'B']]);
  // aktuální operace z nového plánu, ručně upravený poddíl zůstane, poddílů až 500
  out = q(`const l = { items: [{ ean: '1', index: 'A', order: 'O', op: 'Stará', subs: [{ id: 's', ean: '9', code: 'MAN', manual: true, sourceKey: '2|B.2', note: 'Ručně', op: 'x' }] }] };
    const p = shPlanBlank('p'); shPlanRow(p, '1', '1', 'A', 'O', 'Montáž', L('A.1')); shPlanRow(p, '1', '2', 'A', 'O', 'Balení', L('B.2')); shApplyPlan(l, p);
    const big = shPlanBlank('b'); for (let n = 0; n < 520; n++) shPlanRow(big, '7', 'X' + n, 'A', 'O', 'Lakovna', L('B.' + n)); const lb = { items: [{ ean: '7', index: 'A', order: 'O' }] }; const rb = shApplyPlan(lb, big);
    return { it: [l.items[0].op, l.items[0].subs[0].op, l.items[0].subs[0].code, l.items[0].subs[0].note], big: [cleanShortage({ lists: [lb] }).lists[0].items[0].subs.length, rb.truncated] };`);
  assert.deepStrictEqual(out, { it: ['Montáž', 'Balení', 'MAN', 'Ručně'], big: [500, 20] });
  // záznamy evidence: starší nepřepíše novější, limit uložených kódů na seznam (ve V2 menší kvůli šifrovanému stavu)
  out = q(`const l = { items: [{ id: 'i', ean: '1' }] }; const rec = (code, when) => shRecBuild([[code, '22.10.2026 ' + when, '9', 'Hotovo'].map(x => c(x))]).recs;
    shApplyRecs(l, rec('Q.2', '10:00'), {}); shApplyRecs(l, rec('Q.2', '8:00'), {});
    const many = new Map(); for (let n = 0; n < SH_MAX_RECORDS + 5; n++) many.set('K' + n, { ts: n + 1, when: 'w', qty: '1', state: 's' }); const lm = { items: [] }; const rm = shApplyRecs(lm, many, {});
    return { when: l.records[0].when, n: l.records.length, max: SH_MAX_RECORDS, trunc: rm.truncated, kept: cleanShortage({ lists: [lm] }).lists[0].records.length, newest: lm.records[0].code };`);
  assert.deepStrictEqual([/10:00/.test(out.when), out.n, out.max, out.trunc, out.kept, out.newest], [true, 1, 3000, 5, 3000, 'K3004']);
  // sloupce prvního listu a uložení nastavení obou listů
  out = q(`return { fields: Object.keys(SH_COL_NAMES.planItem), guess: shColsGuess('planItem', [['Popis', 'EAN dílu']], SH_COLS.planItem), saved: cleanShortage({ cols: { planItem: { ean: 'B', sheet: 'Díly', matchVersion: 1 }, plan: { asm: 'A', sub: 'E', sheet: 'Sestavy' } } }).cols };`);
  assert.deepStrictEqual([out.fields, out.guess.cols.ean, out.guess.header, out.saved.planItem.ean, out.saved.planItem.matchVersion, out.saved.plan.sheet], [['ean', 'order', 'index', 'op', 'qty'], 'B', 0, 'B', 1, 'Sestavy']);
  return null;
});

test('Shortage (2.71): množství zakázky z plánu, odesláno na WPA z evidence pohybu, díl u nás', () => {
  const core = loadCore();
  const q = code => JSON.parse(run(core, `JSON.stringify((() => { const c = (text, link = '', fill = '') => ({ text, link, fill }); const L = code => 'https://erp.example/?activeBarcode=' + code; ${code} })())`));
  // počty kusů z textu Excelu
  assert.deepStrictEqual(q(`return ['1 200', '1 500 ks', '12 ks', '2,5', 7, '0', 'abc', '-3', '', null, '12/2'].map(shQtyNum);`), [1200, 1500, 12, 2.5, 7, 0, null, null, null, null, null]);
  // plán: množství zakázky z 1. listu (QR varianta podle kódu, jinak největší), poddíly ze 2. listu, sestava z vlastního řádku
  let out = q(`const p = shPlanBlank('p');
    shPlanDirectRow(p, '1', L('A.1'), 'Brus', '10', 'O1', '20'); shPlanDirectRow(p, '1', L('A.1'), 'Brus', '10', 'O1', '20');
    shPlanDirectRow(p, '2', L('B.1'), 'Brus', '', 'O2', '8'); shPlanDirectRow(p, '2', L('B.2'), 'Lakovna', '', 'O2', '12');
    shPlanRow(p, '3', '3', 'A', 'O3', 'Montáž', '', '40'); shPlanRow(p, '3', '9', 'A', 'O3', 'Lakovna', L('S.1'), '80'); shPlanRow(p, '3', '8', 'A', 'O3', 'Lakovna', L('S.2'), 'x');
    const l = { items: [{ ean: '1', index: '10', order: 'O1' }, { ean: '2', order: 'O2', code: 'B.2' }, { ean: '2', order: 'O2' }, { ean: '3', index: 'A', order: 'O3' }, { ean: '4', order: 'O4', oqty: 5 }] };
    const r = shApplyPlan(l, p); return { r: r.qty, o: l.items.map(i => i.oqty), subs: l.items[3].subs.map(s => [s.ean, s.oqty]) };`);
  assert.deepStrictEqual(out, { r: 5, o: [20, 12, 12, 40, 5], subs: [['9', 80], ['8', null]] }, 'stejný řádek dvakrát se nesčítá, ručně zadané množství bez plánu zůstane');
  // evidence pohybu: každé „Odesláno na WPA“ s kusy se sečte, stejné záznamy z dalšího nahrání ne
  out = q(`const rows = t => t.split('\\n').map(r => r.split('|').map(x => c(x)));
    const l = { items: [{ id: 'a', ean: '1', code: 'A.1', oqty: 20 }, { id: 'b', ean: '2', code: 'B.1', oqty: 10 }, { id: 'c', ean: '3', code: 'C.1', oqty: 6 }, { id: 'd', ean: '4', code: 'D.1', oqty: 5 }, { id: 'e', ean: '5', code: 'E.1' }, { id: 'f', ean: '6', code: 'F.1', oqty: 3 }] };
    const ev = rows('A.1|01.11.2026 8:00|5|Odesláno na WPA\\nA.1|02.11.2026 8:00|3|Odeslano na wpa\\nA.1|03.11.2026 9:00|12|Broušení\\nB.1|01.11.2026 8:00|4|Odesláno na WPA\\nB.1|02.11.2026 10:00|2|Odesláno na WPA\\nC.1|02.11.2026 8:00|6|Odesláno na WPA\\nE.1|02.11.2026 8:00|7|Odesláno na WPA\\nX.9|02.11.2026 8:00|1|Odesláno na WPA\\nA.1|31.10.2026 8:00|neuvedeno|Odesláno na WPA');
    const b = shRecBuild(ev, SH_COLS.move);
    const r1 = shApplyRecs(l, b.recs, { at: 1 }, b.sent);
    const again = shRecBuild(ev, SH_COLS.move); const r2 = shApplyRecs(l, again.recs, { at: 2 }, again.sent);
    const st = l.items.map(i => { const s = shSentOf(l, i); return s && [s.st, s.order, s.sent, s.left, s.n]; });
    return { r1: [r1.sent, r1.sentCodes], r2: [r2.sent, r2.sentCodes], keys: Object.keys(l.sent).sort(), a: l.sent['A.1'], st, txt: l.items.map(i => shSentText(shSentOf(l, i))) };`);
  assert.deepStrictEqual(out.r1, [7, 5], 'nové záznamy odeslání (kusy bez čísla se nepočítají)');
  assert.deepStrictEqual(out.r2, [0, 0], 'stejná evidence podruhé nic nepřičte');
  assert.deepStrictEqual(out.keys, ['A.1', 'B.1', 'C.1', 'E.1', 'X.9'], 'odeslání se pamatuje i pro kód, který zatím žádná položka nemá');
  assert.deepStrictEqual(out.a.map(x => x[1]), [5, 3], 'u kódu čas a kusy, od nejstaršího');
  assert.deepStrictEqual(out.st, [['here', 20, 8, 12, 2], ['here', 10, 6, 4, 2], ['done', 6, 6, 0, 1], ['open', 5, 0, 5, 0], ['info', null, 7, null, 1], ['open', 3, 0, 3, 0]]);
  assert.deepStrictEqual(out.txt, ['U nás 12 ks · odesláno na WPA 8 z 20 ks', 'U nás 4 ks · odesláno na WPA 6 z 10 ks', 'Odesláno na WPA vše (6 z 6 ks)', 'Zakázka 5 ks · na WPA zatím nic', 'Odesláno na WPA 7 ks', 'Zakázka 3 ks · na WPA zatím nic']);
  // díl s jiným posledním záznamem a nic neodesláno = celý u nás; bez množství a bez odeslání nic; víc než zakázka
  out = q(`const l = { items: [], sent: { 'Z.1': [[5, 30]] } };
    return [shSentOf(l, { code: 'Y.1', oqty: 4, rec: { state: 'Broušení', ts: 1 } }), shSentOf(l, { code: 'Y.2', rec: { state: 'Broušení' } }), shSentOf(l, { code: 'Z.1', oqty: 25 }), shSentOf(l, { oqty: 4 }),
      shSentText(shSentOf(l, { code: 'Z.1', oqty: 25 }))];`);
  assert.deepStrictEqual(out, [{ st: 'here', order: 4, sent: 0, left: 4, n: 0, last: 'other' }, null, { st: 'done', order: 25, sent: 30, left: 0, n: 1, last: 'none' }, { st: 'open', order: 4, sent: 0, left: 4, n: 0, last: 'none' }, 'Odesláno na WPA vše (30 ks, zakázka 25 ks)']);
  // 2.71.1: poslední záznam „Odesláno na WPA“, ale do zakázky kusy chybí = zbytek je u nás; odesláno bez záznamu taky
  out = q(`const l = { items: [], sent: { 'W.1': [[5, 3]] } };
    return [shSentOf(l, { code: 'W.1', oqty: 10, rec: { state: 'Odesláno na WPA', ts: 5, qty: '3' } }), shSentOf(l, { code: 'W.1', oqty: 10 }), shSentOf(l, { code: 'W.2', oqty: 2, rec: { state: 'Odesláno na WPA', ts: 1, qty: 'neuvedeno' } }), Object.keys(SH_SENT_ST)];`);
  assert.deepStrictEqual(out, [{ st: 'here', order: 10, sent: 3, left: 7, n: 1, last: 'wpa' }, { st: 'here', order: 10, sent: 3, left: 7, n: 1, last: 'none' },
    { st: 'here', order: 2, sent: 0, left: 2, n: 0, last: 'wpa' }, ['done', 'here', 'open', 'info']]);
  // data ze 2.70: odeslání zná jen poslední záznam; po nahrání evidence se stejný záznam nezapočte dvakrát
  out = q(`const l = { items: [{ id: 'a', ean: '1', code: 'A.1', oqty: 10, rec: { ts: 100, qty: '4', state: 'Odesláno na WPA' } }] };
    const before = shSentOf(l, l.items[0]);
    shApplyRecs(l, new Map(), {}, new Map([['A.1', new Map([['100|4', [100, 4]], ['50|3', [50, 3]]])]]));
    return [before.sent, shSentOf(l, l.items[0]).sent, shSentOf(l, l.items[0]).st];`);
  assert.deepStrictEqual(out, [4, 7, 'here']);
  // čištění: množství zakázky u položky i poddílu, odeslání bez duplicit, nejnovější do limitu, dvakrát = jednou
  out = q(`const raw = { lists: [{ id: 'shx', items: [{ id: 'si1', ean: '1', code: 'A.1', oqty: '1 200', subs: [{ id: 'sp1', ean: '9', code: 'S.1', oqty: 8 }, { id: 'sp2', ean: '8', code: 'S.2', oqty: 'x' }] }, { id: 'si2', ean: '2', oqty: -1 }],
      sent: { 'A.1': [[10, 5], [10, 5], [11, '2,5'], ['x', 1], [12, 'nic'], 'zlé'], 'bad code!': [[1, 1]], 'B.1': 'x' } }] };
    const a = cleanShortage(raw), b = cleanShortage(JSON.parse(JSON.stringify(a)));
    const many = {}; for (let i = 0; i < SH_MAX_SENT + 10; i++) many['K' + i] = [[i + 1, 1]];
    const big = cleanShortage({ lists: [{ items: [{ ean: '1' }], sent: many }] }).lists[0].sent;
    return { it: a.lists[0].items.map(i => [i.oqty, (i.subs || []).map(s => s.oqty)]), sent: a.lists[0].sent, same: JSON.stringify(a) === JSON.stringify(b), n: Object.keys(big).length, oldest: 'K0' in big, newest: ('K' + (SH_MAX_SENT + 9)) in big, max: SH_MAX_SENT };`);
  assert.deepStrictEqual(out.it, [[1200, [8, null]], [null, []]]);
  assert.deepStrictEqual(out.sent, { 'A.1': [[0, 1], [10, 5], [11, 2.5]] }, 'zlý čas = 0, kusy bez čísla pryč, zlý kód pryč');
  assert.deepStrictEqual([out.same, out.n, out.oldest, out.newest, out.max], [true, 3000, false, true, 3000]);
  // sloupce: množství zakázky není číslo objednávky
  out = q(`return [shColsGuess('planItem', [['EAN dílu', 'Množství zakázky', 'Objednávka', 'Index']], SH_COLS.planItem).cols, shColsGuess('plan', [['Množství zakázky', 'Objednávka', 'EAN sestavy', 'EAN poddílu', 'Index']], SH_COLS.plan).cols];`);
  assert.deepStrictEqual([out[0].ean, out[0].qty, out[0].order, out[0].index], ['A', 'B', 'C', 'D']);
  assert.deepStrictEqual([out[1].qty, out[1].order, out[1].asm, out[1].sub, out[1].index], ['A', 'B', 'C', 'D', 'E']);
  // rozbor: věta a sloupce v Excelu
  out = q(`const l = { items: [{ id: 'a', ean: '1', code: 'A.1', oqty: 20, rec: { ts: 3, qty: '12', state: 'Broušení' }, subs: [{ id: 's', ean: '9', code: 'S.1', oqty: 4, rec: { ts: 2, qty: '4', state: 'Lakování' }, op: 'Lakování' }] }], sent: { 'A.1': [[1, 8]] } };
    const sh = shAnalysisSheet(l); return { note: shAnalysis(l.items[0], l).note, head: sh.rows[0].slice(-5, -1), r1: sh.rows[1].slice(-5, -1), r2: sh.rows[2].slice(-5, -1), w: sh.cols.length === sh.rows[0].length };`);
  assert.ok(/U nás 12 ks · odesláno na WPA 8 z 20 ks/.test(out.note) && /u nás 1 poddíl/.test(out.note), out.note);
  assert.deepStrictEqual([out.head, out.r1, out.r2, out.w], [['Množství zakázky', 'Odesláno na WPA (ks)', 'Zbývá (ks)', 'Díl u nás'], [20, 8, 12, 'ano'], [4, 0, 4, 'ano'], true]);
  // historie změn: jedno množství s hodnotou, víc najednou souhrnně, nové záznamy odeslání
  out = q(`const A = cleanShortage({ lists: [{ id: 'shA', at: 1, items: [{ id: 'si1', ean: '1', name: 'Hřídel', code: 'A.1', subs: [{ id: 'sp1', ean: '9', code: 'S.1' }] }, { id: 'si2', ean: '2' }] }] });
    const B = JSON.parse(JSON.stringify(A)); B.lists[0].items[0].oqty = 10; B.lists[0].sent = { 'A.1': [[1, 4], [2, 3]] };
    const one = [], many = []; shChanges(A, B, (k, t, o) => one.push(t)); B.lists[0].items[0].subs[0].oqty = 2; B.lists[0].items[1].oqty = 3; shChanges(A, B, (k, t, o) => many.push(t)); return { one, many };`);
  assert.ok(/^Shortage: množství zakázky u položky 1 Hřídel \(seznam .*\): 10 ks$/.test(out.one[0]) && /^Shortage: odesláno na WPA, 2 nové záznamy u seznamu /.test(out.one[1]) && out.one.length === 2, JSON.stringify(out.one));
  assert.ok(/^Shortage: množství zakázky u 3 položek a poddílů seznamu /.test(out.many[0]), JSON.stringify(out.many));
  return null;
});

test('Shortage (2.72): alternativní objednávky z plánu při neshodě objednávky / line, výběr, návrat, čištění, historie', () => {
  const core = loadCore();
  const q = code => JSON.parse(run(core, `JSON.stringify((() => { const L = code => 'https://erp.example/?activeBarcode=' + code; ${code} })())`));
  // plán: EAN 5 má tři objednávky (OBJ-9 ve dvou variantách QR, OBJ-2 bez odkazu), urgent OBJ-1 / line 10 v plánu není
  const plan = `const p = shPlanBlank('p');
    shPlanDirectRow(p, '0005', L('A.1'), 'Brus', '20', 'OBJ-1', '12');
    shPlanDirectRow(p, '5', L('B.1'), 'Leštění', '10', 'OBJ-9', '1 500');
    shPlanDirectRow(p, '5', L('B.2'), 'Lakovna', '10', 'OBJ-9', '30');
    shPlanDirectRow(p, '5', '', 'Montáž', '30', 'OBJ-2', '');
    shPlanDirectRow(p, '5', L('A.1'), 'Brus', '20', 'OBJ-1', '12');
    shPlanDirectRow(p, '6', L('C.1'), 'Brus', '1', 'OBJ-6', '1');
    shPlanRow(p, '5', '77', '20', 'OBJ-1', 'Balení', L('S.1'), '4');`;
  let out = q(`${plan}
    const l = { items: [{ id: 'a', ean: '5', name: 'Příruba', index: '10', order: 'OBJ-1', link: L('U.1'), code: 'U.1', op: 'Z urgentu', note: 'Moje' }, { id: 'b', ean: '6', index: '1', order: 'OBJ-6' }, { id: 'c', ean: '8', order: 'X' }],
      records: [{ code: 'B.1', ts: 5, when: '06.11.2026 9:40', qty: '4', state: 'Hotovo' }] };
    const r = shApplyPlan(l, p); const a = l.items[0];
    return { r: r.unmatchedFirst, mis: l.items.map(i => i.planMismatch), alts: a.planAlts.map(x => [x.order, x.index, x.code, x.qty, x.op, x.rec && x.rec.state]), others: [l.items[1].planAlts, l.items[2].planAlts], code: a.code };`);
  assert.deepStrictEqual(out.mis, [true, false, false]);
  assert.deepStrictEqual(out.alts, [['OBJ-1', '20', 'A.1', 12, 'Brus', null], ['OBJ-9', '10', 'B.1', 1500, 'Leštění', 'Hotovo'], ['OBJ-9', '10', 'B.2', 30, 'Lakovna', null], ['OBJ-2', '30', '', null, 'Montáž', null]],
    'nejdřív stejná objednávka, pak stejný index, pak ostatní; každá varianta QR zvlášť, stejný řádek jednou, bez odkazu taky');
  assert.deepStrictEqual([out.r, out.others, out.code], [1, [[], []], 'U.1'], 'bez neshody nabídka není, kód z urgentu zůstane');
  // výběr: objednávka, index, QR, operace, množství a poslední záznam z plánu; urgent se zapamatuje jen poprvé; návrat
  out = q(`${plan}
    const l = { items: [{ id: 'a', ean: '5', name: 'Příruba', index: '10', order: 'OBJ-1', link: L('U.1'), code: 'U.1', op: 'Z urgentu', note: 'Moje', oqty: 7, rec: { ts: 1, when: 'w', qty: '1', state: 'Urgent' } }],
      records: [{ code: 'B.1', ts: 5, when: '06.11.2026 9:40', qty: '4', state: 'Hotovo' }, { code: 'U.1', ts: 1, when: 'w', qty: '1', state: 'Urgent' }] };
    shApplyPlan(l, p); const a = l.items[0], f = x => [x.order, x.index, x.code, x.op, x.oqty ?? null, x.rec && x.rec.state, x.planMismatch];
    const bad = [shPickAlt(l, 'a', 9), shPickAlt(l, 'nic', 0)];
    shPickAlt(l, 'a', 1); const one = f(a), was = JSON.parse(JSON.stringify(a.was)), key = shItemKey(a);
    shPickAlt(l, 'a', 3); const two = f(a), was2 = a.was.order;
    const back = shAltBack(l, 'a'); const three = f(a);
    shPickAlt(l, 'a', 1);
    shApplyPlan(l, p); const again = [f(a), a.planAlts.length, a.was && a.was.order, a.note];
    return { bad, one, was, key, two, was2, back, three, again, noBack: shAltBack(l, 'b') };`);
  assert.deepStrictEqual(out.bad, [false, false]);
  assert.deepStrictEqual(out.one, ['OBJ-9', '10', 'B.1', 'Leštění', 1500, 'Hotovo', false]);
  assert.deepStrictEqual(out.was, { order: 'OBJ-1', index: '10', link: 'https://erp.example/?activeBarcode=U.1', code: 'U.1', op: 'Z urgentu', oqty: 7 });
  assert.strictEqual(out.key, '5|10|OBJ-1', 'doplnění chybějících a poznámky z urgentů poznají položku podle objednávky z urgentů');
  assert.deepStrictEqual([out.two, out.was2], [['OBJ-2', '30', 'U.1', 'Montáž', 7, 'Urgent', false], 'OBJ-1'], 'objednávka bez QR v plánu: kód z urgentu, druhý výběr urgent nepřepíše');
  assert.deepStrictEqual([out.back, out.three], [true, ['OBJ-1', '10', 'U.1', 'Z urgentu', 7, 'Urgent', true]]);
  assert.deepStrictEqual(out.again, [['OBJ-9', '10', 'B.1', 'Leštění', 1500, 'Hotovo', false], 4, 'OBJ-1', 'Moje'], 'další nahrání plánu: vybraná objednávka sedí přesně, nabídka zůstane kvůli změně');
  assert.strictEqual(out.noBack, false);
  // doplnění chybějících: položka s vybranou alternativou se znovu nepřidá
  out = q(`${plan}
    const l = { items: [{ id: 'a', ean: '5', index: '10', order: 'OBJ-1' }] }; shApplyPlan(l, p); shPickAlt(l, 'a', 0);
    return shMergePlan(l, [{ ean: '5', index: '10', order: 'OBJ-1' }, { ean: '5', index: '20', order: 'OBJ-1' }]).add.map(i => i.index);`);
  assert.deepStrictEqual(out, ['20']);
  // čištění: nabídka jen u neshody nebo po výběru, nejvýš SH_MAX_ALTS, bez duplicit a zlých odkazů; dvakrát = jednou
  out = q(`const alts = []; for (let n = 0; n < 40; n++) alts.push({ order: 'O' + n, index: '1', link: n === 1 ? 'javascript:x' : L('K.' + n), qty: n === 2 ? 'x' : n, op: 'Op', rec: n === 0 ? { ts: 1, state: 'S' } : null });
    alts.push({ order: 'O0', index: '1', link: L('K.0') }, {}, null);
    const raw = { lists: [{ id: 'shx', items: [{ id: 'si1', ean: '5', planMismatch: true, planAlts: alts }, { id: 'si2', ean: '6', planAlts: alts }, { id: 'si3', ean: '7', order: 'B', was: { order: 'A', index: 'I', link: L('W.1'), oqty: '3', op: 'x' }, planAlts: alts.slice(0, 2) }] }] };
    const a = cleanShortage(raw), b = cleanShortage(JSON.parse(JSON.stringify(a))), it = a.lists[0].items;
    return { n: it.map(i => i.planAlts.length), first: it[0].planAlts.slice(0, 3).map(x => [x.order, x.code, x.qty, x.rec && x.rec.state]), was: [it[1].was || null, it[2].was], same: JSON.stringify(a) === JSON.stringify(b), max: SH_MAX_ALTS };`);
  assert.deepStrictEqual(out.n, [30, 0, 2]);
  assert.deepStrictEqual(out.first, [['O0', 'K.0', 0, 'S'], ['O1', '', 1, null], ['O2', 'K.2', null, null]], 'zlý odkaz = bez QR, množství jen číslo');
  assert.deepStrictEqual(out.was, [null, { order: 'A', index: 'I', link: 'https://erp.example/?activeBarcode=W.1', code: 'W.1', op: 'x', oqty: 3 }]);
  assert.deepStrictEqual([out.same, out.max], [true, 30]);
  // historie: výběr z nabídky a návrat (ruční úprava objednávky tužkou se jako výběr nepíše)
  out = q(`${plan}
    const sh = cleanShortage({ lists: [{ id: 'shx', at: Date.UTC(2026, 10, 11, 8), items: [{ id: 'sia', ean: '5', name: 'Příruba', index: '10', order: 'OBJ-1' }] }] });
    shApplyPlan(sh.lists[0], p); const A = cleanShortage(JSON.parse(JSON.stringify(sh)));
    shPickAlt(sh.lists[0], 'sia', 1); const B = cleanShortage(JSON.parse(JSON.stringify(sh)));
    shAltBack(sh.lists[0], 'sia'); const C = cleanShortage(JSON.parse(JSON.stringify(sh)));
    const D = cleanShortage(JSON.parse(JSON.stringify(B))); D.lists[0].items[0].order = 'RUČNĚ';
    const log = (x, y) => { const o = []; shChanges(x, y, (k, t, e) => o.push([t, e.m])); return o; };
    return [log(A, B), log(B, C), log(B, D)];`);
  assert.deepStrictEqual(out[0].map(x => x[1]), ['shalt:shx:sia', 'shq:shx:sia'], 'výběr a s ním nové množství zakázky');
  assert.ok(/u položky 5 Příruba vybrána objednávka z plánu OBJ-9 · index 10 \(v urgentech OBJ-1 · index 10, seznam /.test(out[0][0][0]), out[0][0][0]);
  assert.ok(out[1].some(x => x[1] === 'shalt:shx:sia' && /u položky 5 Příruba vrácena objednávka z urgentů OBJ-1 · index 10/.test(x[0])), JSON.stringify(out[1]));
  assert.deepStrictEqual(out[2], []);
  return null;
});
test('Shortage (2.73): zabalení dne, dny na shortage, odbourané položky, archiv, historie a změny', () => {
  const core = loadCore();
  const q = code => JSON.parse(run(core, `JSON.stringify((() => { const T = (d, h = 7) => new Date(2026, 10, d, h, 0).getTime(); const it = (ean, x = {}) => ({ ean, name: 'Díl ' + ean, order: 'OBJ-' + ean, index: 'A', qty: '5', ...x });
    const mk = (id, d, items, x = {}) => ({ id, at: T(d, x.h || 7), by: 'V', file: id + '.xlsx', items, ...x }); ${code} })())`));
  // tři dny: A (TOP) zůstává, B zmizí třetí den, C a D zmizí druhý den, C se třetí den vrátí, F třetí den odebrána ručně
  const three = `const L1 = mk('d1', 10, [it('A', { top: true }), it('B'), it('C'), it('D', { top2: true })], { packed: { at: T(11, 6), by: 'V' } });
    const L2 = mk('d2', 11, [it('A', { top: true }), it('B'), it('E')], { packed: { at: T(12, 6), by: 'V' } });
    const L3 = mk('d3', 12, [it('A', { top: true }), it('C'), it('F')], { out: [{ key: '', ean: 'x' }] });
    let sh = cleanShortage({ lists: [L1, L2, L3] });`;
  const view = `const v = l => ({ items: l.items.map(i => [i.ean, i.days, i.since, i.again]).sort(), out: l.out.map(o => [o.ean, o.days, o.since, o.day, o.manual, o.top, o.top2]).sort(), packed: !!l.packed });`;
  let out = q(`${three} ${view} return { l: sh.lists.map(v), ids: sh.lists.map(l => l.id) };`);
  assert.deepStrictEqual(out.ids, ['d3', 'd2', 'd1'], 'nejnovější první');
  assert.deepStrictEqual(out.l[2], { items: [['A', 1, '2026-11-10', ''], ['B', 1, '2026-11-10', ''], ['C', 1, '2026-11-10', ''], ['D', 1, '2026-11-10', '']], out: [], packed: true }, 'první den: všechno 1. den, nic odbouraného');
  assert.deepStrictEqual(out.l[1], { items: [['A', 2, '2026-11-10', ''], ['B', 2, '2026-11-10', ''], ['E', 1, '2026-11-11', '']], out: [['C', 1, '2026-11-10', '2026-11-11', false, false, false], ['D', 1, '2026-11-10', '2026-11-11', false, false, true]], packed: true },
    'druhý den: A a B 2. den, E nová, C a D odbourané (TOP 2 zůstane poznamenaná)');
  assert.deepStrictEqual(out.l[0], { items: [['A', 3, '2026-11-10', ''], ['C', 1, '2026-11-12', '2026-11-11'], ['F', 1, '2026-11-12', '']], out: [['B', 2, '2026-11-10', '2026-11-12', false, false, false], ['E', 1, '2026-11-11', '2026-11-12', false, false, false]], packed: false },
    'třetí den: A 3. den, C znovu (odbourána 11. 11.), B po 2 dnech a E po 1 dni odbourané; poškozený záznam pryč');
  // ruční odebrání (×), stejný den víckrát, stejná položka dvakrát, alternativní objednávka podle urgentu
  out = q(`${three} ${view}
    const l3 = sh.lists[0], f = l3.items.find(i => i.ean === 'F');
    l3.items = l3.items.filter(i => i !== f); l3.out.push(shOutOf(f, '2026-11-12', { at: T(12, 9), by: 'Vedoucí' }));
    sh = cleanShortage(sh);
    const again = cleanShortage(JSON.parse(JSON.stringify(sh)));
    const same = mk('d3b', 12, [it('A', { top: true }), it('C'), it('C'), it('F')], { h: 13 });
    const s2 = cleanShortage({ ...sh, lists: [same, ...sh.lists] });
    const alt = cleanShortage({ lists: [mk('a1', 10, [it('G', { order: 'OBJ-1', index: '10' })]), mk('a2', 11, [it('G', { order: 'OBJ-9', index: '20', was: { order: 'OBJ-1', index: '10', link: '', code: '', op: '' }, planMismatch: true })])] });
    return { l3: v(sh.lists[0]), idem: JSON.stringify(again) === JSON.stringify(sh), same: v(s2.lists[0]), manual: sh.lists[0].out.filter(o => o.manual).map(o => [o.ean, o.by, o.at === T(12, 9)]), alt: alt.lists[0].items.map(i => [i.days, i.since]) };`);
  assert.deepStrictEqual(out.l3.out.find(o => o[0] === 'F'), ['F', 1, '2026-11-12', '2026-11-12', true, false, false], 'ručně odebraná je odbouraná ten den');
  assert.deepStrictEqual(out.manual, [['F', 'Vedoucí', true]]);
  assert.ok(out.idem, 'čištění podruhé nic nezmění');
  assert.deepStrictEqual(out.same, { items: [['A', 3, '2026-11-10', ''], ['C', 1, '2026-11-12', '2026-11-11'], ['C', 1, '2026-11-12', '2026-11-11'], ['F', 1, '2026-11-12', '2026-11-12']], out: [], packed: false },
    'druhý seznam téhož dne den nepřičte; druhé C je taky nové; F se vrátila po ručním odebrání');
  assert.deepStrictEqual(out.alt, [[2, '2026-11-10']], 'položka s vybranou alternativní objednávkou se pozná podle urgentu');
  // ručně odebraná položka, která byla i v předchozím seznamu, se nepočítá podruhé jako zmizelá z urgentů
  out = q(`${three} const l2 = sh.lists[1], b = l2.items.find(i => i.ean === 'B');
    l2.items = l2.items.filter(i => i !== b); l2.out.push(shOutOf(b, '2026-11-11', { at: T(11, 9), by: 'V' })); sh = cleanShortage(sh);
    return [sh.lists[1].out.map(o => [o.ean, o.manual, o.days]).sort(), sh.lists[0].out.map(o => o.ean).sort(), shHistory(sh).n];`);
  assert.deepStrictEqual(out, [[['B', true, 2], ['C', false, 1], ['D', false, 1]], ['E'], 4], 'B jen jednou (ručně), třetí den už B v předchozím seznamu není');
  // smazání prostředního seznamu: třetí den se porovná s prvním
  out = q(`${three} ${view} sh.lists = sh.lists.filter(l => l.id !== 'd2'); sh = cleanShortage(sh); return v(sh.lists[0]);`);
  assert.deepStrictEqual(out, { items: [['A', 2, '2026-11-10', ''], ['C', 2, '2026-11-10', ''], ['F', 1, '2026-11-12', '']], out: [['B', 1, '2026-11-10', '2026-11-12', false, false, false], ['D', 1, '2026-11-10', '2026-11-12', false, false, true]], packed: false });
  // data ze 2.72 (bez dnů): dopočítají se při načtení; starší stránka nic nesmaže (verze dat 51)
  out = q(`const st = sanitizeState({ v: 50, shortage: { lists: [mk('o1', 3, [it('A'), it('B')]), mk('o2', 4, [it('A')])] } });
    return { a: st.shortage.lists[0].items.map(i => [i.ean, i.days, i.since]), out: st.shortage.lists[0].out.map(o => o.ean), hist: st.shortage.hist, v: DATA_VERSION, blank: blankShortage().hist };`);
  assert.deepStrictEqual(out, { a: [['A', 2, '2026-11-03']], out: ['B'], hist: [], v: 59, blank: [] });
  // nad 30 seznamů: nejstarší jdou do historie jako souhrn dne s odbouranými položkami, nejstarší ponechaný seznam si dny drží
  out = q(`const lists = []; for (let d = 1; d <= 32; d++) lists.push(mk('z' + d, d, d === 1 ? [it('A'), it('X')] : [it('A')]));
    const sh = cleanShortage({ lists });
    const next = cleanShortage({ ...sh, lists: [mk('z33', 33, [it('A')]), ...sh.lists] });
    const h = shHistory(next);
    return { n: sh.lists.length, oldest: sh.lists[29].items.map(i => [i.days, i.since]), hist: sh.hist.map(d => [d.id, d.day, d.n, d.out.map(o => o.ean)]), next: next.hist.map(d => d.id), last: next.lists[0].items[0].days,
      h: [h.days.length, h.days.filter(d => !d.live).map(d => d.id), h.n, h.out.map(o => [o.ean, o.days, o.day]), h.avg, h.quick, h.bins.map(b => b.n)] };`);
  assert.deepStrictEqual([out.n, out.oldest, out.hist, out.next, out.last], [30, [[3, '2026-11-01']], [['z2', '2026-11-02', 1, ['X']], ['z1', '2026-11-01', 2, []]], ['z3', 'z2', 'z1'], 33],
    '30 seznamů, dva nejstarší jako souhrn (z2 s odbouranou X), další nahrání posune dál, dny pokračují');
  assert.deepStrictEqual(out.h, [33, ['z3', 'z2', 'z1'], 1, [['X', 1, '2026-11-02']], 1, 1, [1, 0, 0, 0]], 'historie spojí seznamy a souhrny');
  // historie: souhrny, Excel, popisy dnů
  out = q(`${three} const h = shHistory(sh); const xs = shHistorySheets(h);
    return { days: h.days.map(d => [d.id, d.n, d.top, d.top2, d.fresh, d.again, d.carried, d.maxDays, d.out.length, d.live, d.packed]), n: h.n, avg: h.avg, quick: h.quick, top: [h.top, h.top2, h.avgTop, h.avgTop2], bins: h.bins, from: h.from, to: h.to,
      sheets: xs.map(s => [s.name, s.rows.length, s.rows[0].length]), row: xs[1].rows[1], text: [shDaysText({ days: 3, since: '2026-11-10' }), shDaysText({ days: 1 })] };`);
  assert.deepStrictEqual(out.days, [['d3', 3, 1, 0, 1, 1, 1, 3, 2, true, false], ['d2', 3, 1, 0, 1, 0, 2, 2, 2, true, true], ['d1', 4, 1, 1, 4, 0, 0, 1, 0, true, true]]);
  assert.deepStrictEqual([out.n, out.avg, out.quick, out.top, out.from, out.to], [4, 1.3, 3, [0, 1, null, 1], '2026-11-10', '2026-11-12']);
  assert.deepStrictEqual(out.bins, [{ name: '1 den', n: 3 }, { name: '2 dny', n: 1 }, { name: '3 až 5 dní', n: 0 }, { name: '6 a více dní', n: 0 }]);
  assert.deepStrictEqual(out.sheets, [['Dny', 4, 13], ['Odbourané položky', 5, 12]]);
  assert.deepStrictEqual(out.row.slice(0, 10), ['2026-11-12', 'OBJ-B', 'Díl B', 'B', 'A', '5', '', '2026-11-10', 2, 'v urgentech už není'], 'nejnovější odbourané první, nejdéle první');
  assert.deepStrictEqual(out.text, ['3. den na shortage (od 10. 11.)', '1. den na shortage']);
  // historie změn: zabalení a rozbalení
  out = q(`${three} const st = sanitizeState(demoData()); st.shortage = sh; const a = JSON.parse(JSON.stringify(st));
    const b = JSON.parse(JSON.stringify(st)); b.shortage.lists[0].packed = { at: T(13), by: 'V' }; b.shortage.lists[1].packed = null;
    return describeChanges(a, b, { at: 9, by: 'V', card: '' }).entries.filter(e => e.kind === 'shortage').map(e => [e.text, e.m]);`);
  assert.deepStrictEqual(out, [['Shortage: zabalen seznam 12. 11. 2026 7:00 (3 položky)', 'shpk:d3'], ['Shortage: rozbalen seznam 11. 11. 2026 7:00', 'shpk:d2']]);
});
test('KPI normy (2.74): normy z vykázaných časů – zkušení nad 45 %, bez zkušených průměr všech, záznamy do 2 minut ne, plnění, čištění, historie', () => {
  const core = loadCore();
  const q = code => JSON.parse(run(core, `JSON.stringify((() => {
    const ser = (y, m, d) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5;
    const N1 = ser(2026, 11, 2), N2 = ser(2026, 11, 3), O1 = ser(2026, 10, 15);
    const work = [['ID zaměstnance', 'Datum', 'Zakázka', 'Název dílu', 'Operace', 'Množství v zakázce', 'Dokončené množství', 'Pozn.', '', 'Strávený čas (min)'],
      [101, N1, 1, 'Hřídel', 'Broušení', 100, 10, '', '', 50],
      [101, N1, 1, 'Hřídel', 'Broušení', 100, 10, '', '', 1.5],
      [101, N1, 1, 'Hřídel', 'Leštění', 100, 5, '', '', 10],
      [102, N2, 1, 'Hřídel', 'Broušení', 100, 10, '', '', 100],
      [102, N2, 1, 'Kryt', 'Frézování', 50, 4, '', '', 40],
      [102, N2, 1, 'Kryt', 'Frézování', 50, 0, '', '', 30],
      [102, N2, 1, 'Kryt', 'Frézování', 50, 2, '', '', 2],
      [999, N2, 1, 'Kryt', 'Frézování', 50, 6, '', '', 30],
      [101, O1, 1, 'Hřídel', 'Broušení', 100, 10, '', '', 80]];
    const st = blank();
    const g = mkPos('g1', 'Brus', []); g.skillset = [{ id: 'k1', name: 'Broušení', desc: '', scale: null }]; g.maxTab = 8; g.tiers = []; st.positions = [g];
    // A: dnes 75 %, v říjnu podle historie 25 %; B: 25 %; vedoucí bez práce
    st.employees['a|a'] = { key: 'a|a', last: 'Adamec', first: 'Adam', positionId: 'g1', shift: 'R', note: '', wid: '101', rate: { k1: 3 }, hist: [{ at: Date.UTC(2026, 9, 1), pos: 'g1', lvl: null, pct: 25 }, { at: Date.UTC(2026, 10, 1), pos: 'g1', lvl: null, pct: 75 }] };
    st.employees['b|b'] = { key: 'b|b', last: 'Bartoš', first: 'Bořek', positionId: 'g1', shift: 'R', note: '', wid: '102', rate: { k1: 1 } };
    S = sanitizeState(st);
    const w = dvParseWork({ name: 'vykázaná práce', aoa: work }, S.workAudit.dv.cols.work, 'auto');
    const r = dvApply(S.workAudit, { work: w }, { name: 'dav.xlsx', by: 'T', at: Date.UTC(2026, 10, 4) });
    S = sanitizeState(S);
    const now = Date.UTC(2026, 10, 20, 12);
    const view = x => ({ n: x.n, fromAll: x.fromAll, rows: x.rows, short: x.short, exp: x.exp, people: x.people, months: x.months, parts: x.parts.map(p => [p.part, p.norm, p.ops.map(o => [o.op, o.norm, o.src, o.exp.people, o.all.people, o.allNorm, o.all.ks, o.all.rows])]) });
    ${code} })())`));
  let out = q(`const x = kpiNorms({ now });
    const again = sanitizeState(JSON.parse(JSON.stringify(S))).workAudit.dv;
    return { x: view(x), short: r.short, file: S.workAudit.dv.files[0].short, s: [S.workAudit.dv.perf['2026-11']['101'].s, S.workAudit.dv.perf['2026-11']['102'].s, S.workAudit.dv.perf['2026-11']['999'].s ?? null],
      nA: S.workAudit.dv.perf['2026-11']['101'].n, idem: JSON.stringify(again) === JSON.stringify(S.workAudit.dv), of: [kpiNormOf(x, 'Hřídel', 'Leštění'), kpiNormOf(x, 'Hřídel', 'Montáž')], pct: [kpiNormPct(), S.workAudit.normPct] };`);
  assert.deepStrictEqual(out.x.parts, [
    ['Hřídel', 7, [['Broušení', 5, 'exp', 1, 2, 7.667, 30, 3], ['Leštění', 2, 'exp', 1, 1, 2, 5, 1]]],
    ['Kryt', 7, [['Frézování', 7, 'all', 0, 2, 7, 10, 2]]]],
    'Broušení jen ze zkušeného A v listopadu (v říjnu měl 25 %), Ø všech i s B a říjnem; Frézování bez zkušených = všichni (i neznámé ID); díl = součet operací');
  assert.deepStrictEqual([out.x.n, out.x.fromAll, out.x.rows, out.x.short, out.x.exp, out.x.people, out.x.months], [3, 1, 6, 2, 1, 3, ['2026-11', '2026-10']], 'záznamy do 2 minut (1,5 i 2 min) vyřazené, bez kusů se nepočítá');
  assert.deepStrictEqual([out.short, out.file, out.s], [2, 2, [1, 1, null]]);
  assert.deepStrictEqual(out.nA, { Hřídel: { Broušení: [10, 50, 1], Leštění: [5, 10, 1] } });
  assert.ok(out.idem, 'čištění podruhé nic nezmění');
  assert.deepStrictEqual([out.of, out.pct], [[2, null], [45, null]]);
  // jen říjen: A tehdy nebyl zkušený → průměr všech; hranice 80 % → A (75 %) není zkušený
  out = q(`const oct = kpiNorms({ month: '2026-10', now }); S.workAudit.normPct = 80; const hi = kpiNorms({ now });
    const log = []; waChanges(blankWorkAudit(), { ...blankWorkAudit(), normPct: 80 }, (k, t, x) => log.push([k, t, x && x.m, x && x.v0, x && x.v1]));
    const cl = [cleanWorkAudit({ normPct: 0 }).normPct, cleanWorkAudit({ normPct: '60' }).normPct, cleanWorkAudit({ normPct: 100 }).normPct, blankWorkAudit().normPct];
    return { oct: view(oct), hi: view(hi).parts, log, cl };`);
  assert.deepStrictEqual(out.oct.parts, [['Hřídel', 8, [['Broušení', 8, 'all', 0, 1, 8, 10, 1]]]]);
  assert.deepStrictEqual(out.hi, [['Hřídel', 9.667, [['Broušení', 7.667, 'all', 0, 2, 7.667, 30, 3], ['Leštění', 2, 'all', 0, 1, 2, 5, 1]]], ['Kryt', 7, [['Frézování', 7, 'all', 0, 2, 7, 10, 2]]]]);
  assert.deepStrictEqual(out.log, [['workaudit', '', 'wanormpct', 'hodnocení nad 45 %', 'hodnocení nad 80 %']]);
  assert.deepStrictEqual(out.cl, [null, 60, null, null]);
  // plnění podle norem systému: Výkonnost na osobu bez normy v evidenci
  out = q(`const an = kpiAutoNorm('2026-11', kpiNorms({ now }));
    const kp = kpiPerf('2026-11', { sort: 'norm' });
    const sh = kpiSheets(kp), ns = kpiNormSheets(kpiNorms({ now }));
    return { an: [...an.entries()].map(([k, v]) => [k, Math.round(v.nm * 100) / 100, v.ns]), kp: [kp.autoN, kp.people.map(p => [p.key, Math.round(p.v.norm * 10) / 10, !!p.autoN]).sort(), Math.round(kp.tot.norm * 10) / 10],
      note: sh[0].rows[sh[0].rows.length - 1][0], ns: [ns[0].name, ns[0].rows.length, ns[0].rows[3].length, ns[0].rows[4], ns[0].rows[6]], off: kpiPerf('2026-11', { auto: false }).autoN };`);
  assert.deepStrictEqual(out.an, [['a|a', 60, 60], ['b|b', 78, 140]], 'A: 10 × 5 + 5 × 2 za 60 min; B: 10 × 5 + 4 × 7 za 140 min (bez krátkých a bez kusů)');
  assert.deepStrictEqual(out.kp, [2, [['a|a', 100, true], ['b|b', 55.7, true]], 69], 'celkem (60 + 78) ÷ (60 + 140)');
  assert.match(out.note, /^Plnění normy u 2 lidí bez normy v evidenci podle norem systému/);
  assert.deepStrictEqual(out.ns, ['Normy', 8, 14, ['Hřídel', 'Broušení', 5, 12, 'zkušení', 1, 1, 10, 50, 7.67, 2, 3, 30, 230], ['Hřídel', 'celkem za díl', 7, 8.57, '', '', '', '', '', '', '', 4, 35, '']]);
  assert.strictEqual(out.off, 0);
  // data nahraná před 2.74 (bez n): normy z nich nejsou, měsíc se ohlásí
  out = q(`const old = sanitizeState({ v: 51, workAudit: { dv: { perf: { '2026-10': { 101: { p: { Hřídel: [10, 0, 80, 1] }, o: { Broušení: [10, 80, 1] } } } } } } });
    S = old; const m = kpiNormMonths(), x = kpiNorms();
    return { m, n: x.n, perf: old.workAudit.dv.perf['2026-10']['101'], v: DATA_VERSION };`);
  assert.deepStrictEqual(out, { m: { all: ['2026-10'], with: [], without: ['2026-10'] }, n: 0, perf: { p: { Hřídel: [10, 0, 80, 1] }, o: { Broušení: [10, 80, 1] } }, v: 59 });
});

test('Sloučení změn dvou lidí (2.62): různá místa samo, seznamy s id po položkách, střet jen u stejného údaje, zápis na místě', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const base = sharedState(sanitizeState(demoData()));
    const keys = Object.keys(base.employees).sort();
    const [a, b, c] = keys;
    const mine = JSON.parse(JSON.stringify(base)), theirs = JSON.parse(JSON.stringify(base));
    mine.employees[a].note = 'moje';
    theirs.employees[b].note = 'jejich';
    mine.sanctions.push({ id: 'sM', key: a, period: base.current || '2026-10', name: 'X', pct: 10, note: 'm', at: 1 });
    theirs.sanctions.push({ id: 'sT', key: b, period: base.current || '2026-10', name: 'Y', pct: 10, note: 't', at: 2 });
    theirs.log = [...(theirs.log || []), { at: 5, by: 'T', card: '', kind: 'person', text: 'jejich záznam' }];
    const r = mergeStates(base, mine, theirs);
    // smazání: já smažu nezměněnou položku = pryč; oni změní, já smažu = střet
    const b2 = { list: [{ id: 'x', v: 1 }, { id: 'y', v: 1 }, { id: 'z', v: 1 }], n: 1 };
    const m2 = { list: [{ id: 'y', v: 1 }, { id: 'x', v: 1 }, { id: 'z', v: 2 }, { id: 'q', v: 1 }], n: 2 };
    const t2 = { list: [{ id: 'x', v: 3 }, { id: 'y', v: 1 }], n: 3 };
    const r2 = mergeStates(b2, m2, t2);
    const r3 = mergeStates(b2, m2, t2, Object.fromEntries(r2.conflicts.map(x => [x.key, 'theirs'])));
    const r4 = mergeStates(base, (() => { const x = JSON.parse(JSON.stringify(base)); x.employees[c].note = 'A'; return x; })(), (() => { const x = JSON.parse(JSON.stringify(base)); x.employees[c].note = 'B'; return x; })());
    // zápis na místě
    const tgt = { e: { k: { note: 'a', rate: { s: 1 } } }, list: [{ id: 'x', v: 1 }, { id: 'y', v: 1 }], gone: 1 };
    const refE = tgt.e.k, refX = tgt.list[0], refL = tgt.list;
    mergeInto(tgt, { e: { k: { note: 'b', rate: { s: 2 } } }, list: [{ id: 'y', v: 2 }, { id: 'x', v: 5 }, { id: 'n', v: 1 }] });
    return JSON.stringify({ notes: [r.state.employees[a].note, r.state.employees[b].note], san: r.state.sanctions.slice(-2).map(x => x.id), log: r.state.log.slice(-1)[0].text, conf: r.conflicts.length, v: r.state.v,
      r2: { list: r2.state.list, n: r2.state.n, conf: r2.conflicts.map(x => [x.path, x.mine === undefined ? 'smazáno' : x.mine.v !== undefined ? x.mine.v : x.mine, x.theirs && x.theirs.v !== undefined ? x.theirs.v : x.theirs]) },
      r3: r3.state, r4: r4.conflicts.map(x => [x.path.split(' › ')[0], x.path.split(' › ').pop(), x.mine, x.theirs]), r4label: r4.conflicts[0].path.includes(base.employees[c].last),
      into: { same: tgt.e.k === refE && tgt.list[1] === refX && tgt.list === refL, tgt, gone: 'gone' in tgt },
      show: [undefined, '', 'x', true, [1, 2], { name: 'Kryt' }, {}].map(mergeShow) });
  })()`));
  assert.deepStrictEqual(out.notes, ['moje', 'jejich'], 'změny u různých lidí se sloučí');
  assert.deepStrictEqual(out.san.slice().sort(), ['sM', 'sT'], 'obě nové sankce zůstanou');
  assert.strictEqual(out.log, 'jejich záznam', 'historie ze serveru, moje změny se zapíšou až při uložení');
  assert.deepStrictEqual([out.conf, out.v], [0, 59]);
  assert.deepStrictEqual(out.r2.list, [{ id: 'y', v: 1 }, { id: 'x', v: 3 }, { id: 'z', v: 2 }, { id: 'q', v: 1 }], 'moje pořadí (jen já přeřadil), jejich změna x, moje přidaná q; z: smazali, já změnil → střet, výchozí moje');
  assert.deepStrictEqual(out.r2.conf, [['list › z', 2, null], ['n', 2, 3]], 'střety: změněná položka, kterou druhý smazal, a stejné číslo');
  assert.deepStrictEqual(out.r3.list.map(x => x.id), ['y', 'x', 'q'], 'jejich volba: smazaná zůstane smazaná');
  assert.strictEqual(out.r3.n, 3);
  assert.deepStrictEqual(out.r4.map(x => [x[0], x[1], x[2], x[3]]), [['Lidé', 'poznámka', 'A', 'B']], 'stejný údaj = jeden střet s čitelnou cestou');
  assert.ok(out.r4label, 'cesta se jménem člověka');
  assert.ok(out.into.same, 'zápis na místě: stejné objekty a pole');
  assert.deepStrictEqual(out.into.tgt, { e: { k: { note: 'b', rate: { s: 2 } } }, list: [{ id: 'y', v: 2 }, { id: 'x', v: 5 }, { id: 'n', v: 1 }] });
  assert.deepStrictEqual(out.show, ['(smazáno)', '(prázdné)', 'x', 'ano', '2 položky', 'Kryt', 'změněno']);
});

test('Audit (2.62): čištění dat je stálé (dvakrát = jednou) a nespadne na poškozených datech', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const canon = x => undoCanon(x);
    const a = sharedState(sanitizeState(demoData()));
    const b = sharedState(sanitizeState(JSON.parse(JSON.stringify(a))));
    // náhodně poškozená data: hodnoty nahrazené jiným typem, nesmí to spadnout
    let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const junk = [null, 0, -1, 1e308, '', 'x'.repeat(5000), [], {}, [null], { id: 1 }, true, '<b>', NaN];
    const errors = [];
    const mutate = (o, depth) => {
      if (!o || typeof o !== 'object' || depth > 6) return;
      Object.keys(o).forEach(k => {
        if (rnd() < 0.08) o[k] = junk[Math.floor(rnd() * junk.length)];
        else mutate(o[k], depth + 1);
      });
    };
    let stable = 0;
    for (let i = 0; i < 40; i++) {
      const x = JSON.parse(JSON.stringify(a));
      mutate(x, 0);
      try {
        const s1 = sharedState(sanitizeState(x));
        const s2 = sharedState(sanitizeState(JSON.parse(JSON.stringify(s1))));
        if (canon(s1) === canon(s2)) stable++; else errors.push('nestálé ' + i + ': ' + undoDiff(s1, s2).slice(0, 3).map(c => c.p.join('.')).join(', '));
      } catch (e) { errors.push(i + ': ' + e.message); }
    }
    return JSON.stringify({ same: canon(a) === canon(b), diff: undoDiff(a, b).slice(0, 5).map(c => c.p.join('.')), stable, errors: errors.slice(0, 8) });
  })()`));
  assert.ok(out.same, 'ukázková data: čištění podruhé nic nemění, rozdíl: ' + out.diff.join(', '));
  assert.deepStrictEqual(out.errors, [], 'poškozená data');
  assert.strictEqual(out.stable, 40);
});

test('Kalendář (2.65): poznámky, události po dnech, mřížka měsíce, historie', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const st = sanitizeState(demoData());
    const empty = sanitizeState({ ...JSON.parse(JSON.stringify(st)), calNotes: undefined });
    const n1 = calNoteAdd(st, '2026-11-17', '  Návštěva auditora  ', { at: 1, by: 'A' });
    const bad = [calNoteAdd(st, '2026-13', 'x').err, calNoteAdd(st, '2026-11-18', '   ').err];
    const k = Object.keys(st.employees)[0];
    st.employees[k].end = '2026-11-20';
    st.tasks = cleanTasks({ list: [{ id: 'tk1', title: 'Revize', due: '2026-11-10', state: 'new', tl: [] }, { id: 'tk2', title: 'Hotový', due: '2026-11-10', state: 'done', tl: [] }] });
    const ev = calEvents('2026-11-01', '2026-11-30', st, '2026-11-12');
    const grid = calGrid('2026-11');
    const before = sharedState(sanitizeState(JSON.parse(JSON.stringify(st))));
    const clean = cleanCalNotes([...before.calNotes, { id: 'cnx', date: '2026-11-01', text: '' }, { id: n1.id, date: '2026-11-02', text: 'dup' }, { id: 'bad id', date: '2026-11-01', text: 'x' }]);
    const after = JSON.parse(JSON.stringify(before));
    calNoteDel(after, n1.id);
    const log = [];
    calChanges(before.calNotes, after.calNotes, (kind, text) => log.push(text));
    const log2 = [];
    calChanges([], before.calNotes, (kind, text) => log2.push(text));
    return JSON.stringify({ emptyNotes: empty.calNotes, n1, bad, ev17: ev['2026-11-17'], ev10: ev['2026-11-10'], ev20: ev['2026-11-20'], gridLen: grid.length, g0: grid[0], gLast: grid[grid.length - 1], clean: clean.map(x => x.id), log, log2, ver: before.v });
  })()`));
  assert.deepStrictEqual(out.emptyNotes, []);
  assert.strictEqual(out.n1.text, 'Návštěva auditora');
  assert.ok(out.bad[0] && out.bad[1]);
  assert.deepStrictEqual(out.ev17.map(e => e.k).sort(), ['hol', 'note']);
  assert.strictEqual(out.ev10.length, 1, 'hotový úkol se neukazuje');
  assert.strictEqual(out.ev10[0].k, 'task');
  assert.strictEqual(out.ev10[0].late, true);
  assert.strictEqual(out.ev20[0].k, 'end');
  assert.strictEqual(out.gridLen, 42);
  assert.strictEqual(out.g0.iso, '2026-10-26');
  assert.strictEqual(out.g0.out, true);
  assert.strictEqual(out.gLast.iso, '2026-12-06');
  assert.deepStrictEqual(out.clean, [out.n1.id]);
  assert.ok(/smazána/.test(out.log[0]), out.log[0]);
  assert.ok(/Poznámka v kalendáři na .*Návštěva auditora/.test(out.log2[0]), out.log2[0]);
  assert.strictEqual(out.ver, 59);
});

test('Shortage (2.65): stav položky a poddílu, čištění, historie', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const sh = cleanShortage({ lists: [{ id: 'shA', at: 1, items: [{ ean: '1', name: 'A', subs: [{ ean: '2', op: 'x' }] }, { ean: '3', name: 'B', st: 'nesmysl' }] }] });
    const l = sh.lists[0], a = l.items[0], sub = a.subs[0];
    const before = JSON.parse(JSON.stringify(sh));
    const r = [shSetStatus(l, a.id, 'run', { at: 5, by: 'X' }), shSetStatus(l, a.id, 'run'), shSetStatus(l, sub.id, 'done', { at: 6, by: 'Y' }), shSetStatus(l, 'neni', 'run')];
    const again = cleanShortage(JSON.parse(JSON.stringify(sh)));
    const log = [];
    shChanges(before, sh, (kind, text, o) => log.push((o && o.p ? o.p + o.v0 + ' → ' + o.v1 : text)));
    shSetStatus(l, a.id, '');
    return JSON.stringify({ r, a: again.lists[0].items[0], sub: again.lists[0].items[0].subs[0], b: again.lists[0].items[1], log, cleared: a });
  })()`));
  assert.deepStrictEqual(out.r, [true, false, true, false]);
  assert.deepStrictEqual([out.a.st, out.a.stAt, out.a.stBy], ['run', 5, 'X']);
  assert.deepStrictEqual([out.sub.st, out.sub.stBy], ['done', 'Y']);
  assert.ok(!('st' in out.b), 'neznámý stav se zahodí');
  assert.ok(out.log.some(x => /položka 1 A – stav: bez stavu → Rozpracováno/.test(x)), out.log.join(' | '));
  assert.ok(out.log.some(x => /poddíl 2 .* – stav: bez stavu → Hotovo/.test(x)), out.log.join(' | '));
  assert.ok(!('st' in out.cleared) && !('stAt' in out.cleared), 'zrušený stav nic nenechá');
});

test('Časová osa (2.66): opakování, sudý a lichý týden, měsíc, okno 2 h zpět a 3 h dopředu, historie', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const st = sanitizeState(demoData());
    const mk = (title, time, rep, date) => agAdd(st, { title, time, rep, date }, { at: 1, by: 'A' });
    const once = mk('Porada', '09:00', 'once', '2026-11-09');
    const day = mk('Tlak vzduchu', '10:30', 'day', '2026-11-02');
    const wk = mk('Úklid', '13:00', 'week', '2026-11-02');            // pondělí
    const ev = mk('Revize', '08:00', 'even', '2026-11-02');           // pondělí, T45 lichý
    const od = mk('Inventura', '08:00', 'odd', '2026-11-02');
    const mo = mk('Měsíční report', '07:00', 'month', '2026-01-31');
    const wd = agAdd(st, { title: 'Jen pracovní', time: '06:00', rep: 'day', date: '2026-11-01', work: true }, { at: 1, by: 'A' });
    const bad = [agAdd(st, { title: '', time: '09:00', date: '2026-11-09' }).err, agAdd(st, { title: 'x', time: '25:00', date: '2026-11-09' }).err];
    const on = (x, d) => agOn(x, d);
    const days = { once: [on(once, '2026-11-09'), on(once, '2026-11-10')], day: [on(day, '2026-11-01'), on(day, '2026-11-08')],
      wk: [on(wk, '2026-11-09'), on(wk, '2026-11-10')], ev: [on(ev, '2026-11-02'), on(ev, '2026-11-09')], od: [on(od, '2026-11-02'), on(od, '2026-11-09')],
      mo: [on(mo, '2026-02-28'), on(mo, '2026-03-31'), on(mo, '2026-04-30'), on(mo, '2026-04-29')],
      wd: [on(wd, '2026-11-13'), on(wd, '2026-11-14'), on(wd, '2026-11-17'), on(wd, '2026-11-18')] };
    const now = new Date(2026, 10, 9, 9, 40).getTime();
    const w = agWindow(st.agenda, now).items.map(o => [o.x.title, o.iso, o.past]);
    const late = agWindow(st.agenda, new Date(2026, 10, 9, 23, 30).getTime()).items.map(o => [o.x.title, o.iso]);
    const before = JSON.parse(JSON.stringify(st.agenda));
    agDone(st, day.id, '2026-11-09', true, { at: 2, by: 'B' });
    agSet(st, wk.id, { title: 'Úklid haly', time: '13:00', rep: 'week', date: '2026-11-02' });
    agDel(st, once.id);
    const log = []; agChanges(before, st.agenda, (k, t) => log.push(t));
    const again = cleanAgenda(JSON.parse(JSON.stringify(st.agenda)));
    return JSON.stringify({ bad, days, w, late, log, same: JSON.stringify(again) === JSON.stringify(st.agenda), v: sanitizeState(st).agenda.length });
  })()`));
  assert.ok(out.bad[0] && out.bad[1]);
  assert.deepStrictEqual(out.days, { once: [true, false], day: [false, true], wk: [true, false], ev: [false, true], od: [true, false], mo: [true, true, true, false], wd: [true, false, false, true] });
  assert.deepStrictEqual(out.w, [['Revize', '2026-11-09', true], ['Porada', '2026-11-09', true], ['Tlak vzduchu', '2026-11-09', false]], JSON.stringify(out.w));
  assert.deepStrictEqual(out.late, [], 've 23:30 do 2:30 nic');
  assert.ok(out.log.some(x => /splněno 10:30 Tlak vzduchu \(9\. 11\. 2026\)/.test(x)), out.log.join(' | '));
  assert.ok(out.log.some(x => /upraven úkol 13:00 Úklid haly/.test(x)) && out.log.some(x => /smazán úkol 09:00 Porada/.test(x)), out.log.join(' | '));
  assert.ok(out.same);
  assert.strictEqual(out.v, 6);
});

test('Shortage (2.75): připnutí přejde do dalších seznamů, odepnutí, duplikát do oddělení, dny a odbourané, čištění, historie', () => {
  const core = loadCore();
  const q = code => JSON.parse(run(core, `JSON.stringify((() => { const T = (d, h = 7) => new Date(2026, 10, d, h, 0).getTime(); const it = (ean, x = {}) => ({ ean, name: 'Díl ' + ean, order: 'OBJ-' + ean, index: 'A', qty: '5', ...x });
    const mk = (id, d, items, x = {}) => ({ id, at: T(d, x.h || 7), by: 'V', file: id + '.xlsx', items, ...x }); ${code} })())`));
  // den 1: C připnuté (s poznámkou a stavem); den 2: urgenty bez C → C přejde i s poznámkou; A připnuté a v urgentech je → připnutí se převezme
  let out = q(`let sh = cleanShortage({ lists: [mk('d1', 10, [it('A', { top: true }), it('B'), it('C', { note: 'hlídat', st: 'run', subs: [{ id: 'spx', ean: 'C1', code: 'K1', op: 'Montáž' }] })])] });
    const l1 = sh.lists[0], C = l1.items.find(i => i.ean === 'C'), A = l1.items.find(i => i.ean === 'A');
    const p1 = shSetPin(l1, C.id, true, { at: T(10, 9), by: 'Mistr' }), p2 = shSetPin(l1, C.id, true, {}), p3 = shSetPin(l1, A.id, true, { at: T(10, 9), by: 'Mistr' });
    const fresh = [it('A', { top: true }), it('D')].map(x => ({ ...x, code: '', link: '', op: '' }));
    const c = shCarryPins(sh.lists[0], fresh);
    sh = cleanShortage({ ...sh, lists: [mk('d2', 11, c.items), ...sh.lists] });
    const l2 = sh.lists[0];
    const v = l => l.items.map(i => [i.ean, !!i.pin, i.days, i.note || '', i.st || '', (i.subs || []).length, i.top]);
    // odepnutí C v den 2 → den 3 bez C: C se nepřenese a je odbourané
    const l2v = v(l2), pinBy = l2.items.find(i => i.ean === 'A').pin;
    const C2 = l2.items.find(i => i.ean === 'C');
    const u1 = shSetPin(l2, C2.id, false, {}), u2 = shSetPin(l2, C2.id, false, {});
    const c3 = shCarryPins(sh.lists[0], [it('A', { top: true })]);
    const sh3 = cleanShortage({ ...sh, lists: [mk('d3', 12, c3.items), ...sh.lists] });
    const ids = new Set(); let uniq = true; sh.lists.forEach(l => l.items.forEach(i => { [i, ...(i.subs || [])].forEach(x => { if (ids.has(l.id + x.id)) uniq = false; ids.add(l.id + x.id); }); }));
    return { set: [p1, p2, p3], carried: [c.carried, c.kept], l2: l2v, pinBy, keepOld: v(sh.lists[1]), unpin: [u1, u2], c3: [c3.carried, c3.kept], l3: v(sh3.lists[0]), out3: sh3.lists[0].out.map(o => o.ean).sort(), uniq,
      none: shCarryPins(null, [it('X')]).carried, nopin: shCarryPins(sh3.lists[0], [it('X')]).carried };`);
  assert.deepStrictEqual(out.set, [true, false, true], 'připnutí podruhé nic nemění');
  assert.deepStrictEqual(out.carried, [1, 1], 'C přidáno, A převzato z urgentů');
  assert.deepStrictEqual(out.l2, [['A', true, 2, '', '', 0, true], ['D', false, 1, '', '', 0, false], ['C', true, 2, 'hlídat', 'run', 1, false]], 'C přejde na konec i s poznámkou, stavem a poddílem a je 2. den na shortage');
  assert.deepStrictEqual(out.pinBy, { at: new Date(2026, 10, 10, 9, 0).getTime(), by: 'Mistr' });
  assert.deepStrictEqual(out.keepOld.map(r => [r[0], r[1]]), [['A', true], ['B', false], ['C', true]], 'předchozí seznam zůstane, jak byl');
  assert.deepStrictEqual(out.unpin, [true, false]);
  assert.deepStrictEqual(out.c3, [0, 1], 'odepnuté C se nepřenese, A dál připnuté');
  assert.deepStrictEqual(out.l3, [['A', true, 3, '', '', 0, true]]);
  assert.deepStrictEqual(out.out3, ['C', 'D'], 'odepnuté C je třetí den odbourané');
  assert.ok(out.uniq, 'id položek a poddílů jsou v seznamu jedinečná');
  assert.deepStrictEqual([out.none, out.nopin], [0, 1], 'bez předchozího seznamu nic; A připnutá dál přejde i bez urgentů');

  // duplikát: do jiného oddělení, hned pod originálem, dny jako originál, jako odbouraný se nepočítá
  out = q(`const depts = [{ id: 'sd1', name: 'Brus', ops: [{ key: shOpKey('Broušení'), label: 'Broušení' }] }, { id: 'sd2', name: 'Montáž', ops: [{ key: shOpKey('Montáž'), label: 'Montáž' }] }];
    let sh = cleanShortage({ depts, lists: [mk('d1', 10, [it('A', { op: 'Broušení', note: 'n' }), it('B', { op: 'Broušení' })])] });
    const l1 = sh.lists[0], A = l1.items[0];
    shSetPin(l1, A.id, true, { at: 1, by: 'X' });
    const d1 = shDuplicate(sh, l1, A.id, 'sd2'), d2 = shDuplicate(sh, l1, A.id, 'sd1'), d3 = shDuplicate(sh, l1, A.id, '-'), bad = shDuplicate(sh, l1, 'nic', 'sd2');
    sh = cleanShortage(sh);
    const l = sh.lists[0], map = shDeptMap(sh);
    const rows = l.items.map(i => [i.ean, !!i.dup, !!i.pin, i.dept, shDeptOf(sh, i, map), i.note]);
    const secs = shSections(sh, l.items).map(x => [x.name, x.items.map(i => i.ean + (i.dup ? '*' : ''))]);
    // den 2: A v urgentech je → zbylé kopie se jako odbourané nepočítají; den 3 bez A → A odbouraná jen jednou
    const c2 = shCarryPins(sh.lists[0], [it('A', { op: 'Broušení' })]);
    let s2 = cleanShortage({ ...sh, lists: [mk('d2', 11, c2.items), ...sh.lists] });
    const out2 = s2.lists[0].out.map(o => o.ean).sort();
    const l2 = s2.lists[0];
    // kopie v den 2 (ruční), den 3 bez A: odbouraná A jednou
    shSetPin(l2, l2.items[0].id, false, {});
    shDuplicate(s2, l2, l2.items[0].id, 'sd2'); s2 = cleanShortage(s2);
    const days2 = s2.lists[0].items.map(i => [i.ean, !!i.dup, i.days]);
    const s3 = cleanShortage({ ...s2, lists: [mk('d3', 12, [it('Z')]), ...s2.lists] });
    // jen kopie zbyla (originál odebraný ručně) a další den chybí → odbouraná jednou
    const onlyDup = cleanShortage({ depts, lists: [mk('e1', 10, [it('Q', { dup: true })]), mk('e0', 9, [it('Q')])] });
    const onlyNext = cleanShortage({ ...onlyDup, lists: [mk('e2', 11, [it('Z')]), ...onlyDup.lists] });
    const again = cleanShortage(JSON.parse(JSON.stringify(s3)));
    return { ret: [!!d1, !!d2, !!d3, bad], rows, secs, out2, days2, out3: s3.lists[0].out.map(o => o.ean).sort(), only: onlyNext.lists[0].out.map(o => o.ean), qDays: onlyDup.lists[0].items.map(i => [i.dup, i.days]), idem: JSON.stringify(again) === JSON.stringify(s3),
      junk: cleanShortage({ lists: [mk('j', 10, [it('J', { pin: 'ano', dup: 'ano' }), it('K', { pin: { at: 'x', by: 5 }, dup: true })])] }).lists[0].items.map(i => [i.pin || null, i.dup || null]) };`);
  assert.deepStrictEqual(out.ret, [true, true, true, null]);
  assert.deepStrictEqual(out.rows, [['A', false, true, '', 'sd1', 'n'], ['A', true, false, '-', '', 'n'], ['A', true, false, '', 'sd1', 'n'], ['A', true, false, 'sd2', 'sd2', 'n'], ['B', false, false, '', 'sd1', '']],
    'kopie pod originálem (poslední nahoře), oddělení ručně, podle operace = "", bez připnutí, s poznámkou');
  assert.deepStrictEqual(out.secs, [['Brus', ['A', 'A*', 'B']], ['Montáž', ['A*']], ['Nezařazeno', ['A*']]]);
  assert.deepStrictEqual(out.out2, ['B'], 'kopie A se druhý den jako odbourané nepočítají');
  assert.deepStrictEqual(out.days2, [['A', false, 2], ['A', true, 2]], 'kopie má dny jako originál');
  assert.deepStrictEqual(out.out3, ['A'], 'A odbouraná jen jednou, i když měla kopii');
  assert.deepStrictEqual(out.only, ['Q'], 'zbyla jen kopie: odbouraná jednou');
  assert.deepStrictEqual(out.qDays, [[true, 2]], 'kopie bez originálu se páruje s předchozím dnem');
  assert.ok(out.idem, 'čištění podruhé nic nezmění');
  assert.deepStrictEqual(out.junk, [[null, null], [{ at: 0, by: '5' }, true]], 'neplatné připnutí a kopie pryč');

  // historie změn
  out = q(`const depts = [{ id: 'sd1', name: 'Brus', ops: [] }, { id: 'sd2', name: 'Montáž', ops: [] }];
    const A = cleanShortage({ depts, lists: [mk('d1', 10, [it('A'), it('B')])] });
    const B = JSON.parse(JSON.stringify(A)), l = B.lists[0];
    shSetPin(l, l.items[1].id, true, { at: 1, by: 'X' });
    shDuplicate(B, l, l.items[0].id, 'sd2');
    const B2 = cleanShortage(B);
    const log = []; shChanges(A, B2, (k, t, x) => log.push(t));
    const C = JSON.parse(JSON.stringify(B2)); shSetPin(C.lists[0], C.lists[0].items.find(i => i.pin).id, false, {});
    const log2 = []; shChanges(B2, C, (k, t) => log2.push(t));
    const nl = cleanShortage({ ...B2, lists: [mk('d2', 11, shCarryPins(B2.lists[0], [it('Z')]).items), ...B2.lists] });
    const log3 = []; shChanges(B2, nl, (k, t) => log3.push(t));
    return { log, log2, log3 };`);
  assert.ok(out.log.some(t => /položka A Díl A zduplikována, kopie v oddělení Montáž \(seznam/.test(t)), out.log.join(' | '));
  assert.ok(out.log.some(t => /položka B Díl B připnuta \(přejde i do dalších seznamů\)/.test(t)), out.log.join(' | '));
  assert.ok(!out.log.some(t => /doplněn/.test(t)), 'kopie není doplněná položka');
  assert.ok(out.log2.some(t => /položka B Díl B odepnuta/.test(t)), out.log2.join(' | '));
  assert.ok(out.log3.some(t => /nahrán seznam .*\(2 položky, připnuté 1, d2\.xlsx\)/.test(t)), out.log3.join(' | '));
  return null;
});

test('Vrátit zpět (2.75): pole položek s id po položkách, jiné pořadí celé pole, formát čísel stejný', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const base = { shortage: { lists: [{ id: 'sh1', items: [{ id: 'a', note: '' }, { id: 'b', note: 'x' }] }, { id: 'sh2', items: [{ id: 'c', note: '' }] }] }, tasks: { list: [{ id: 't1', title: 'T' }] }, plain: [1, 2] };
    const after = JSON.parse(JSON.stringify(base));
    after.shortage.lists[0].items[0].note = 'nová'; after.shortage.lists[0].items[1].pin = { at: 1, by: 'X' }; after.plain = [1, 3];
    const ch = undoDiff(base, after).map(c => [c.p.join('/'), c.d ? 'd' : 'b']);
    // jiné pořadí: celé pole
    const moved = JSON.parse(JSON.stringify(base)); moved.shortage.lists[0].items.reverse();
    const ch2 = undoDiff(base, moved).map(c => c.p.join('/'));
    // vrácení po položkách; pozdější změna jiné položky zůstane
    const st = JSON.parse(JSON.stringify(after));
    const rec = undoRecord(base, after, { at: 5, by: 'M' });
    st.undo = [rec]; st.shortage.lists[1].items[0].note = 'později';
    const r = undoApply(st, [rec.id], { at: 6 });
    // smazaná položka mezitím: přeskočí se
    const st2 = JSON.parse(JSON.stringify(after)); st2.undo = [rec]; st2.shortage.lists[0].items = st2.shortage.lists[0].items.filter(i => i.id !== 'a');
    const r2 = undoApply(st2, [rec.id], { at: 6 });
    const nums = [[0, 1], [1234.5, 1], [1234.56, 2], [0.333333, 3], [-5, 0], [NaN, 1], [null, 1], ['12', 1], [1e6, 0]];
    const same = nums.every(([n, d]) => nf(n, d) === Number(n || 0).toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: d })) && nf(2.25) === Number(2.25).toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
    return JSON.stringify({ ch: ch.sort(), ch2, r: [r.done, r.skip], st: [st.shortage.lists[0].items[0].note, 'pin' in st.shortage.lists[0].items[1], st.shortage.lists[1].items[0].note, st.plain], r2: [r2.done, r2.skip, st2.shortage.lists[0].items.map(i => i.id)], size: rec.size < 400, same,
      get: [undoGet(after, ['shortage', 'lists', '@sh1', 'items', '@b', 'note']), undoGet(after, ['shortage', 'lists', '@nic', 'items']), undoGet({ x: { '@a': 1 } }, ['x', '@a'])] });
  })()`));
  assert.deepStrictEqual(out.ch, [['plain', 'b'], ['shortage/lists/@sh1/items/@a/note', 'b'], ['shortage/lists/@sh1/items/@b/pin', 'd']], 'poznámka a připnutí po položkách, pole bez id celé');
  assert.deepStrictEqual(out.ch2, ['shortage/lists/@sh1/items'], 'jiné pořadí položek: celé pole');
  assert.deepStrictEqual(out.r, [3, 0]);
  assert.deepStrictEqual(out.st, ['', false, 'později', [1, 2]], 'vráceno jen uložené, pozdější změna jiné položky zůstala');
  assert.deepStrictEqual(out.r2, [2, 1, ['b']], 'smazaná položka se přeskočí, nic se nevloží');
  assert.ok(out.size, 'záznam je malý (dřív celé pole seznamů)');
  assert.ok(out.same, 'nf dává stejné texty jako toLocaleString');
  assert.deepStrictEqual(out.get, ['x', null, 1], 'segment @id jen v poli, u objektu je to klíč');
  return null;
});

test('Konce trestů (2.75.1): párování jmen – ID, přejmenovaný, prohozené, celé jméno v jednom sloupci, titul, část jména, překlep, nejednoznačné, ručně', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const st = blank();
    st.positions = [mkPos('g1', 'Brus', [])]; st.positions[0].dept = 'Broušení';
    const emp = (k, last, first, x) => { st.employees[k] = { key: k, last, first, positionId: 'g1', shift: 'R', note: '', ...(x || {}) }; };
    emp('novak|jan', 'Novák', 'Jan');
    emp('svoboda|petr', 'Svoboda', 'Petr');
    emp('dvorak|karel', 'Dvořák-Novotný', 'Karel');          // přejmenovaný v Lidech, klíč zůstal
    emp('kral|tomas', 'Král', 'Tomáš');
    emp('cerna novakova|jana', 'Černá Nováková', 'Jana');
    emp('horak|milan', 'Horák', 'Milan');
    emp('benes|ales', 'Beneš', 'Aleš');
    emp('maly|ivan', 'Malý', 'Ivan'); emp('maly|ivan2', 'Malý', 'Ivan');
    emp('zeman|ota', 'Zeman', 'Ota', { wid: '0042' });
    emp('prazak|eva', 'Pražák', 'Eva');
    emp('vedouci|jiri', 'Vedoucí', 'Jiří', { lead: ['Broušení'] });
    S = sanitizeState(st);
    const D = '31.12.2026';
    const aoa = [['Příjmení', 'Jméno', 'Konec trestu', 'Směnnost', 'ID'],
      ['NOVÁK', ' Jan ', D, 'Skupina 1', ''],               // 2 přesně (velká písmena, mezery)
      ['Svobda', 'Petr', D, 'Skupina 1', ''],               // 3 překlep
      ['Dvořák Novotný', 'Karel', D, 'Skupina 1', ''],      // 4 přejmenovaný, mezera místo pomlčky
      ['Tomáš', 'Král', D, 'Skupina 1', ''],                // 5 prohozené
      ['Černá', 'Jana', D, 'Skupina 1', ''],                // 6 část příjmení
      ['Horák Milan', '', D, 'Skupina 2', ''],              // 7 celé jméno v jednom sloupci
      ['Beneš', 'Bc. Aleš', D, 'Skupina 1', ''],            // 8 titul
      ['Ivan', 'Malý', D, 'Skupina 1', ''],                 // 9 dva stejní lidé: nejednoznačné
      ['Zemanová', 'Otakar', D, 'Skupina 1', '42'],         // 10 podle ID
      ['Nový', 'Člověk', D, 'Skupina 1', ''],               // 11 nový
      ['Nováková', 'Jana', D, 'Skupina 1', '']];            // 12 Novák Jan je už spárovaný: nová
    const p = endParse(aoa, { wid: 'E' }, { today: '2026-11-12' });
    const how = p.rows.map(r => [r.n, r.how, r.e ? r.e.key : null]);
    const iss = n => p.rows.find(r => r.n === n).issues.map(i => i.l + ':' + i.t);
    const cand9 = p.rows.find(r => r.n === 9).cand.slice().sort();
    // bez sloupce ID se Zemanová Otakar nespáruje
    const noId = endParse(aoa, null, { today: '2026-11-12' }).rows.find(r => r.n === 10).how;
    // ručně: nový řádek k Pražákovi, překlep jako nový člověk
    const p2 = endParse(aoa, { wid: 'E' }, { today: '2026-11-12', assign: new Map([[11, 'prazak|eva'], [3, ''], [9, 'maly|ivan2']]) });
    const how2 = p2.rows.filter(r => [3, 9, 11].includes(r.n)).map(r => [r.n, r.how, r.e ? r.e.key : null, r.issues[0] && r.issues[0].t]);
    const o = endApply(p2, { add: true, today: '2026-11-12' });
    const E = k => S.employees[k] ? [S.employees[k].end || '', S.employees[k].shift || ''] : null;
    return JSON.stringify({ how, i3: iss(3), i6: iss(6), i7: iss(7), i9: iss(9), i10: iss(10), i12: iss(12), cand9, noId, missing: p.missing, sum: p.sum, how2, missing2: p2.missing, o,
      e: { horak: E('horak|milan'), dvorak: E('dvorak|karel'), prazak: E('prazak|eva'), svobda: E('svobda|petr'), svoboda: E('svoboda|petr'), maly2: E('maly|ivan2'), zeman: E('zeman|ota') },
      tok: [endTok('Ing. Jan  Novák-Svoboda, Ph.D.'), endTok('O’Neil')], m0: endMatch([], S.employees).length });
  })()`));
  assert.deepStrictEqual(out.how, [[2, 'exact', 'novak|jan'], [3, 'fuzzy', 'svoboda|petr'], [4, 'exact', 'dvorak|karel'], [5, 'swap', 'kral|tomas'], [6, 'part', 'cerna novakova|jana'], [7, 'words', 'horak|milan'],
    [8, 'exact', 'benes|ales'], [9, 'none', null], [10, 'id', 'zeman|ota'], [11, 'none', null], [12, 'none', null]], JSON.stringify(out.how));
  assert.deepStrictEqual(out.i3[0], 'w:podobné jméno (překlep?), spáruje se s Svoboda Petr');
  assert.deepStrictEqual(out.i6[0], 'w:liší se část jména, spáruje se s Černá Nováková Jana');
  assert.ok(out.i7[0] === 'w:jinak zapsané jméno, spáruje se s Horák Milan' && !out.i7.some(t => /chybí/.test(t)), `celé jméno v jednom sloupci: ${out.i7}`);
  assert.deepStrictEqual(out.cand9, ['maly|ivan', 'maly|ivan2']);
  assert.ok(/^w:v Lidech není přesně, podobní: Malý Ivan, Malý Ivan\. Vyber v tabulce/.test(out.i9[0]), out.i9[0]);
  assert.deepStrictEqual(out.i10[0], 'i:podle ID, spáruje se s Zeman Ota');
  assert.ok(/přidá se jako nový/.test(out.i12.join(' ')), `Nováková Jana se k už spárovanému Novákovi nepřiřadí: ${out.i12}`);
  assert.strictEqual(out.noId, 'none');
  assert.deepStrictEqual(out.missing, ['Malý Ivan', 'Malý Ivan', 'Pražák Eva'], 'chybí jen nespárovaní (bez vedoucího)');
  assert.deepStrictEqual([out.sum.fresh, out.sum.err], [3, 0]);
  assert.deepStrictEqual(out.how2, [[3, 'new', null, 'ručně: nový člověk, přidá se (bez skupiny)'], [9, 'manual', 'maly|ivan2', 'ručně přiřazeno, spáruje se s Malý Ivan'], [11, 'manual', 'prazak|eva', 'ručně přiřazeno, spáruje se s Pražák Eva']]);
  assert.deepStrictEqual(out.missing2, ['Malý Ivan', 'Svoboda Petr']);
  assert.deepStrictEqual(out.e, { horak: ['2026-12-31', 'S2'], dvorak: ['2026-12-31', 'S1'], prazak: ['2026-12-31', 'S1'], svobda: ['2026-12-31', 'S1'], svoboda: ['', 'R'], maly2: ['2026-12-31', 'S1'], zeman: ['2026-12-31', 'S1'] },
    'zápis: celé jméno v jednom sloupci, přejmenovaný, ručně přiřazený, překlep ručně jako nový');
  assert.strictEqual(out.o.added, 2, 'nově Svobda Petr a Nováková Jana');
  assert.deepStrictEqual(out.tok, [['jan', 'novak', 'svoboda'], ['o', 'neil']]);
  assert.strictEqual(out.m0, 0);
  return null;
});

test('Konce trestů (2.75.2): chybějícím lidem návrhy řádků bez páru, jistá shoda předvybraná, přidělení řádku', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const st = blank();
    st.positions = [mkPos('g1', 'Brus', [])]; st.positions[0].dept = 'Broušení';
    const emp = (k, last, first) => { st.employees[k] = { key: k, last, first, positionId: 'g1', shift: 'R', note: '' }; };
    emp('novak|jan', 'Novák', 'Jan'); emp('svoboda|petr', 'Svoboda', 'Petr'); emp('kral|tomas', 'Král', 'Tomáš'); emp('mala|eva', 'Malá', 'Eva'); emp('adam|ota', 'Adam', 'Ota');
    S = sanitizeState(st);
    const aoa = [['Příjmení', 'Jméno', 'Konec trestu', 'Směnnost'],
      ['Adam', 'Ota', '1.2.2027', 'Skupina 1'],          // 2 přesně
      ['Novák J.', '', '2.2.2027', 'Skupina 2'],         // 3 příjmení a iniciála: jistý návrh pro Nováka
      ['Svobodová', 'Petra', '3.2.2027', 'Skupina 1'],   // 4 podobné, ale ne jisté (může to být někdo jiný)
      ['Malá', 'E.', '4.2.2027', 'Skupina 1'],           // 5 a 6: dva možné řádky pro Malou Evu, nic se nepředvybere
      ['Malá', 'Eliška', '5.2.2027', 'Skupina 1'],
      ['Xyz', 'Abc', '6.2.2027', 'Skupina 1']];          // 7 nic podobného
    const p = endParse(aoa, null, { today: '2026-11-12' });
    const h = endMissingHints(p);
    const H = k => h.get(k) ? { cand: h.get(k).cand, pick: h.get(k).pick } : null;
    const p2 = endParse(aoa, null, { today: '2026-11-12', assign: new Map([[3, 'novak|jan'], [5, 'mala|eva']]) });
    const o = endApply(p2, { add: false, today: '2026-11-12' });
    return JSON.stringify({ how: p.rows.map(r => [r.n, r.how]), missing: p.missing, novak: H('novak|jan'), svoboda: H('svoboda|petr'), mala: H('mala|eva'), kral: H('kral|tomas'), adam: H('adam|ota'),
      missing2: p2.missing, o, e: ['novak|jan', 'mala|eva'].map(k => [S.employees[k].end, S.employees[k].shift]), none: endMissingHints({ rows: [], missingP: [] }).size });
  })()`));
  assert.deepStrictEqual(out.how, [[2, 'exact'], [3, 'none'], [4, 'none'], [5, 'none'], [6, 'none'], [7, 'none']], 'žádný z nich se sám nespáruje');
  assert.deepStrictEqual(out.missing, ['Král Tomáš', 'Malá Eva', 'Novák Jan', 'Svoboda Petr']);
  assert.deepStrictEqual(out.novak, { cand: [3], pick: 3 }, 'Novák J. = jistý návrh');
  assert.deepStrictEqual(out.svoboda, { cand: [4], pick: null }, 'Svobodová Petra jen návrh');
  assert.deepStrictEqual([out.mala.cand.slice().sort(), out.mala.pick], [[5, 6], null], 'dva možné řádky: nic předvybrané');
  assert.deepStrictEqual(out.kral, { cand: [], pick: null });
  assert.strictEqual(out.adam, null, 'spárovaný člověk návrhy nemá');
  assert.deepStrictEqual(out.missing2, ['Král Tomáš', 'Svoboda Petr'], 'přidělení ubere chybějící');
  assert.deepStrictEqual(out.e, [['2027-02-02', 'S2'], ['2027-02-04', 'S1']], 'přidělený řádek se zapíše člověku');
  assert.strictEqual(out.o.added, 0);
  assert.strictEqual(out.none, 0);
  return null;
});

test('Konce trestů (2.75.2): datum, číslo ani „Invalid Date“ ve sloupci jména nejsou jméno, nadpisy uprostřed, popisek Zaměstnanec:', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `(() => {
    const st = blank();
    st.positions = [mkPos('g1', 'Brus', [])]; st.positions[0].dept = 'Broušení';
    st.employees['sasak|jan'] = { key: 'sasak|jan', last: 'Sasák', first: 'Jan', positionId: 'g1', shift: 'R', note: '' };
    st.employees['sasak|invalid date'] = { key: 'sasak|invalid date', last: 'SASÁK', first: 'Invalid Date', positionId: null, note: '' };   // z dřívějšího importu
    S = sanitizeState(st);
    const before = Object.keys(S.employees).length;
    const aoa = [['Zaměstnanec', '', 'Konec trestu', 'Směnnost'],
      ['SASÁK', new Date(NaN), '1.2.2027', 'Skupina 1'],                // 2 jméno je neplatné datum: jen příjmení → chyba
      ['Zaměstnanec', '', '', ''],                                      // 3 nadpis uprostřed: přeskočí se
      ['Zaměstnanec: Sasák', 'Jan', '2.2.2027', 'Skupina 2'],          // 4 popisek před jménem: Sasák Jan
      ['Kovář', 'Invalid Date', '3.2.2027', 'Skupina 1'],              // 5 text „Invalid Date“ není jméno
      ['Novák2', 'Petr', '4.2.2027', 'Skupina 1'],                     // 6 číslice: nový se nezaloží
      [45000, 'Eva', '5.2.2027', 'Skupina 1'],                         // 7 číslo jako příjmení
      ['', '', '', 'poznámka'],                                         // 8 jen poznámka bez jména a data
      ['Bílá', 'Iva', '6.2.2027', 'Skupina 1']];                       // 9 nový člověk v pořádku
    const p = endParse(aoa, null, { today: '2026-11-12' });
    const o = endApply(p, { add: true, today: '2026-11-12' });
    const names = Object.values(S.employees).map(e => (e.last + ' ' + e.first).trim()).sort();
    return JSON.stringify({ bad: p.missingP.map(m => [m.name, !!m.bad]), rows: p.rows.map(r => [r.n, r.last, r.first, r.how, r.issues.filter(i => i.l === 'e').map(i => i.t)]), header: p.header, fresh: p.sum.fresh, o, names, sasak: [S.employees['sasak|jan'].end, S.employees['sasak|jan'].shift], grew: Object.keys(S.employees).length - before });
  })()`));
  assert.strictEqual(out.header, true);
  assert.deepStrictEqual(out.rows.map(r => r[0]), [2, 4, 5, 6, 7, 9], 'nadpis uprostřed a řádek bez jména i data se přeskočí');
  const R = n => out.rows.find(r => r[0] === n);
  assert.deepStrictEqual(R(2).slice(1, 3), ['SASÁK', ''], 'neplatné datum ve sloupci jména = prázdné');
  assert.deepStrictEqual(R(2)[4], ['chybí jméno, řádek se přeskočí']);
  assert.deepStrictEqual(R(4).slice(1, 4), ['Sasák', 'Jan', 'exact'], 'popisek Zaměstnanec: pryč');
  assert.deepStrictEqual(R(5).slice(1, 3), ['Kovář', ''], '„Invalid Date“ jako text = prázdné');
  assert.deepStrictEqual(R(6)[4], ['„Novák2 Petr“ nevypadá jako jméno (jsou v něm číslice), řádek se přeskočí']);
  assert.deepStrictEqual(R(7).slice(1, 3), ['', 'Eva'], 'číslo ve sloupci příjmení = prázdné');
  assert.strictEqual(out.fresh, 1, 'nový jen Bílá Iva');
  assert.deepStrictEqual(out.names, ['Bílá Iva', 'SASÁK Invalid Date', 'Sasák Jan'], 'žádný nový „… Invalid Date“ (ten z dřívějška zůstal)');
  assert.deepStrictEqual(out.bad, [['SASÁK Invalid Date', true]], 'chybné jméno z dřívějšího importu je označené');
  assert.deepStrictEqual([out.o.added, out.grew], [1, 1]);
  assert.deepStrictEqual(out.sasak, ['2027-02-02', 'S2']);
  return null;
});

test('Shortage (2.76): zelená = Hotovo, hotové vždy na konci (i TOP), ruční Hotovo přesune na konec a zpátky, doplnění chybějících, čištění, historie', () => {
  const core = loadCore();
  const q = code => JSON.parse(run(core, `JSON.stringify((() => { const T = (d, h = 7) => new Date(2026, 10, d, h, 0).getTime();
    const cell = (text, x = {}) => ({ text, link: '', ...x });
    const row = (ean, x = {}) => [cell('OBJ-' + ean), cell('Díl ' + ean), cell(ean, { fill: x.fill || '', link: 'https://is.example/q?activeBarcode=K' + ean + '&x=1' }), cell('A'), cell('5'), cell(''), cell(x.g || ''), cell(x.op || 'Brus')];
    ${code} })())`));
  // odhad barev: zelené odstíny Hotovo, tyrkysová, šedá, žlutá a světle modrá ne
  let out = q(`return { g: ['00B050', '92D050', 'C6EFCE', 'E2EFDA', '70AD47', 'CCFFCC', '008000', '33CCCC', '00B0F0', 'D9D9D9', 'FFFF00', 'DDEBF7', 'FF0000', 'FFC000'].map(shColorGuess) };`);
  assert.deepStrictEqual(out.g, ['done', 'done', 'done', 'done', 'done', 'done', 'done', 'none', 'none', 'none', 'top2', 'none', 'top', 'top2']);
  // import: zelený EAN = Hotovo (i u TOP z textu), hotové na konci v pořadí ze souboru, do TOP se nepočítají
  out = q(`const rows = [[cell('Číslo objednávky'), cell('Název dílu'), cell('EAN'), cell('Index'), cell('Množství'), cell(''), cell('TOP'), cell('Operace')],
      row('A', { fill: '00B050' }), row('B'), row('C', { fill: 'FF0000' }), row('D', { g: 'TOP', fill: 'C6EFCE' }), row('E', { g: 'TOP2' }), row('F', { fill: '92D050' })];
    const r0 = shBuild(rows, SH_COLS.list);
    const fills = [...r0.fills.keys()].sort();
    const colors = { '00B050': 'done', 'FF0000': 'top', 'C6EFCE': 'done', '92D050': 'none' };
    shApplyColors(r0.items, colors, { at: T(13, 8), by: 'Mistr' });
    const items = shTopFirst(r0.items);
    const r1 = shBuild(rows, SH_COLS.list, colors);
    const sh = cleanShortage({ lists: [{ id: 'd1', at: T(13), by: 'V', file: 'u.xlsx', items: r1.items.map(i => ({ ...i })) }], colors: { ...colors, 'ABCDEF': 'bad' } });
    return { fills, order: items.map(i => [i.ean, i.st || '', !!i.top]), meta: items.filter(i => i.st).map(i => [i.ean, i.stAt, i.stBy]),
      r1: [r1.items.map(i => i.ean), r1.top, r1.top2, r1.done], clean: sh.lists[0].items.map(i => [i.ean, i.st || '']), colors: sh.colors,
      ranks: items.map(shRank) };`);
  assert.deepStrictEqual(out.fills, ['00B050', '92D050', 'C6EFCE', 'FF0000']);
  assert.deepStrictEqual(out.order, [['C', '', true], ['E', '', false], ['B', '', false], ['F', '', false], ['D', 'done', true], ['A', 'done', false]], 'TOP, TOP 2, ostatní, hotové na konci (i TOP z textu; vzorník barev dostane seznam už seřazený)');
  assert.deepStrictEqual(out.meta, [['D', new Date(2026, 10, 13, 8, 0).getTime(), 'Mistr'], ['A', new Date(2026, 10, 13, 8, 0).getTime(), 'Mistr']]);
  assert.deepStrictEqual(out.r1, [['C', 'E', 'B', 'F', 'A', 'D'], 1, 1, 2], 'hotový TOP se do TOP nepočítá');
  assert.deepStrictEqual(out.clean, [['C', ''], ['E', ''], ['B', ''], ['F', ''], ['A', 'done'], ['D', 'done']], 'čištění pořadí drží');
  assert.deepStrictEqual(out.colors, { '00B050': 'done', 'FF0000': 'top', 'C6EFCE': 'done', '92D050': 'none' }, 'barva Hotovo se uloží, neznámé přiřazení ne');
  assert.deepStrictEqual(out.ranks, [0, 1, 2, 2, 3, 3]);
  // ruční stav: Hotovo přesune na úplný konec, zrušení zpátky na konec své skupiny; poddíl pořadí nemění; posun jen mezi hotovými
  out = q(`const it = (ean, x = {}) => ({ ean, name: 'Díl ' + ean, order: 'O' + ean, index: 'A', qty: '1', ...x });
    const sh = cleanShortage({ lists: [{ id: 'l', at: T(13), items: [it('T', { top: true }), it('U', { top: true }), it('B'), it('C', { subs: [{ ean: 'C1', code: 'k1', op: 'Brus' }] }), it('H', { st: 'done' })] }] });
    const l = sh.lists[0], id = e => l.items.find(i => i.ean === e).id, o = () => l.items.map(i => i.ean);
    const s1 = shSetStatus(l, id('T'), 'done', { at: 1, by: 'X' }), a1 = o();
    const s2 = shSetStatus(l, id('B'), 'run', { at: 2, by: 'X' }), a2 = o();
    const s3 = shSetStatus(l, id('T'), '', {}), a3 = o();
    const s4 = shSetStatus(l, id('B'), 'done', {}), a4 = o();
    const s5 = shSetStatus(l, id('B'), 'wait', {}), a5 = o();
    const sub = l.items.find(i => i.ean === 'C').subs[0], s6 = shSetStatus(l, sub.id, 'done', {}), a6 = o();
    const m1 = shMoveItem(l, id('H'), 0), a7 = o();
    shSetStatus(l, id('U'), 'done', {});
    const m2 = shMoveItem(l, id('U'), 3), a8 = o();
    return { s: [s1, s2, s3, s4, s5, s6, m1, m2], a: [a1, a2, a3, a4, a5, a6, a7, a8], tierDone: shSetTier(l, id('U'), ''), a9: o() };`);
  assert.deepStrictEqual(out.s, [true, true, true, true, true, true, false, true]);
  assert.deepStrictEqual(out.a[0], ['U', 'B', 'C', 'H', 'T'], 'hotový TOP jde na úplný konec');
  assert.deepStrictEqual(out.a[1], ['U', 'B', 'C', 'H', 'T'], 'jiný stav pořadí nemění');
  assert.deepStrictEqual(out.a[2], ['U', 'T', 'B', 'C', 'H'], 'bez Hotovo zpátky na konec TOP');
  assert.deepStrictEqual(out.a[3], ['U', 'T', 'C', 'H', 'B']);
  assert.deepStrictEqual(out.a[4], ['U', 'T', 'C', 'B', 'H'], 'Čekáme na díl: zpátky na konec ostatních');
  assert.deepStrictEqual(out.a[5], ['U', 'T', 'C', 'B', 'H'], 'poddíl s Hotovo sestavu nepřesune');
  assert.deepStrictEqual(out.a[6], ['U', 'T', 'C', 'B', 'H'], 'hotová položka nejde nad nehotové');
  assert.deepStrictEqual(out.a[7], ['T', 'C', 'B', 'U', 'H'], 'mezi hotovými jde posouvat');
  assert.deepStrictEqual([out.tierDone, out.a9], [true, ['T', 'C', 'B', 'U', 'H']], 'zrušení TOP u hotové položky pořadí nemění');
  // doplnění chybějících: položka v seznamu, která je v novém souboru zelená, dostane Hotovo; dvakrát po kusech
  out = q(`const it = (ean, x = {}) => ({ ean, name: 'Díl ' + ean, order: 'O' + ean, index: 'A', qty: '1', ...x });
    const sh = cleanShortage({ lists: [{ id: 'l', at: T(13), items: [it('A', { top: true }), it('B'), it('B'), it('C', { st: 'done' }), it('D')] }] });
    const l = sh.lists[0];
    const file = [it('A', { st: 'done' }), it('B', { st: 'done' }), it('C', { st: 'done' }), it('D'), it('N', { st: 'done' })];
    const dry = shMergeDone(l, file, null, true).map(i => i.ean), before = l.items.map(i => [i.ean, i.st || '']);
    const hit = shMergeDone(l, file, { at: 5, by: 'M' }).map(i => i.ean);
    const plan = shMergePlan(l, file, false);
    return { dry, before, hit, after: l.items.map(i => [i.ean, i.st || '', i.stBy || '']), add: plan.add.map(i => i.ean), again: shMergeDone(l, file, {}).length };`);
  assert.deepStrictEqual(out.dry, ['A', 'B']);
  assert.deepStrictEqual(out.before, [['A', ''], ['B', ''], ['B', ''], ['D', ''], ['C', 'done']], 'jen spočítat nic nemění');
  assert.deepStrictEqual(out.hit, ['A', 'B']);
  assert.deepStrictEqual(out.after, [['B', '', ''], ['D', '', ''], ['C', 'done', ''], ['A', 'done', 'M'], ['B', 'done', 'M']], 'jedno B zelené v souboru = jedno B Hotovo, hotové na konci');
  assert.deepStrictEqual(out.add, ['N'], 'nová zelená položka se doplní (s Hotovo)');
  assert.strictEqual(out.again, 0);
  // bloky: s odděleními jsou hotové v posledním bloku Hotovo (za Nezařazeno), filtr oddělení dál podle skutečného oddělení
  out = q(`const it = (ean, x = {}) => ({ ean, name: 'Díl ' + ean, order: 'O' + ean, index: 'A', qty: '1', ...x });
    const sh = cleanShortage({ depts: [{ id: 'sdb', name: 'Brus', ops: [{ key: 'brus', label: 'Brus' }] }], lists: [{ id: 'l', at: T(13), items: [it('A', { op: 'Brus', st: 'done' }), it('B', { op: 'Brus' }), it('C', { op: 'Elox' }), it('D', { op: 'Elox', st: 'done', top: true })] }] });
    const l = sh.lists[0];
    return { order: l.items.map(i => i.ean), b: shBlocks(sh, l.items).map(x => [x.id, x.name, x.items.map(i => i.ean)]), s: shSections(sh, l.items).map(x => [x.name, x.items.map(i => i.ean)]),
      none: shBlocks(blankShortage(), l.items).map(x => x.items.map(i => i.ean)) };`);
  assert.deepStrictEqual(out.order, ['B', 'C', 'A', 'D']);
  assert.deepStrictEqual(out.b, [['sdb', 'Brus', ['B']], ['', 'Nezařazeno', ['C']], ['=done', 'Hotovo', ['A', 'D']]], 'Hotovo jako poslední blok');
  assert.deepStrictEqual(out.s, [['Brus', ['B', 'A']], ['Nezařazeno', ['C', 'D']]], 'oddělení (filtr, počty) i s hotovými');
  assert.deepStrictEqual(out.none, [['B', 'C', 'A', 'D']], 'bez oddělení jeden blok, hotové na konci');
  // převod dat ze starší verze: zelená uložená jako běžná (Hotovo nebylo) = Hotovo; od verze 54 volba zůstane
  out = q(`const st = blank(); st.v = 53; st.shortage = { lists: [], colors: { '92D050': 'none', 'C6EFCE': 'top2', '4F81BD': 'none', 'FF0000': 'top' } };
    const a = sanitizeState(JSON.parse(JSON.stringify(st))).shortage.colors;
    st.v = 54; const b = sanitizeState(JSON.parse(JSON.stringify(st))).shortage.colors;
    return { a, b, again: sanitizeState(sanitizeState(JSON.parse(JSON.stringify({ ...st, v: 53 })))).shortage.colors };`);
  assert.deepStrictEqual(out.a, { '92D050': 'done', 'C6EFCE': 'top2', '4F81BD': 'none', 'FF0000': 'top' }, 'jen zelená uložená jako běžná');
  assert.deepStrictEqual(out.b, { '92D050': 'none', 'C6EFCE': 'top2', '4F81BD': 'none', 'FF0000': 'top' }, 'od verze dat 54 volba „běžná“ u zelené zůstane');
  assert.deepStrictEqual(out.again, out.a);
  // historie: nahraný seznam s hotovými, barva Hotovo, ruční stav
  out = q(`const it = (ean, x = {}) => ({ id: 'i' + ean, ean, name: 'Díl ' + ean, order: 'O' + ean, index: 'A', qty: '1', ...x });
    const A = cleanShortage({ lists: [], colors: {} });
    const B = cleanShortage({ lists: [{ id: 'l1', at: T(13), by: 'V', file: 'u.xlsx', items: [it('A', { top: true, st: 'done' }), it('B', { top: true }), it('C')] }], colors: { '00B050': 'done' } });
    const C = cleanShortage(JSON.parse(JSON.stringify(B)));
    shSetStatus(C.lists[0], 'iC', 'done', { at: 1, by: 'M' });
    const log = [], add = (k, t, x) => log.push(t || (x.p + x.v0 + ' → ' + x.v1));
    shChanges(A, B, add); shChanges(B, C, add);
    return { log };`);
  assert.ok(out.log.some(t => /nahrán seznam .*\(3 položky, z toho 1 TOP, hotovo 1, u\.xlsx\)/.test(t)), out.log.join(' | '));
  assert.ok(out.log.includes('Shortage: barva EANu #00B050 = Hotovo'), out.log.join(' | '));
  assert.ok(out.log.some(t => /položka .*C.* – stav: bez stavu → Hotovo/.test(t)), out.log.join(' | '));
  assert.ok(!out.log.some(t => /pořadí/.test(t)), 'přesun kvůli Hotovo se jako změna pořadí nepíše: ' + out.log.join(' | '));
  return null;
});

test('Rychlý scan (2.77): kód z odkazu, množství, dávka se sečte, zápis do Shortage, odesláno na WPA, deník, historie, Excel', () => {
  const core = loadCore();
  const q = code => JSON.parse(run(core, `JSON.stringify((() => { const T = (d, h = 7, m = 0) => new Date(2026, 10, d, h, m).getTime();
    const it = (ean, code, x = {}) => ({ id: 'i' + ean, ean, name: 'Díl ' + ean, order: 'O' + ean, index: 'A', qty: '5', code, link: '', ...x });
    ${code} })())`));
  let out = q(`return { c: ['http://is.example/x?activeBarcode=7.0.1&y=2', '7.0.2', ' 7.0.3 ', 'https://is.example/bez', 'kód s mezerou', ''].map(scCode),
    qty: ['5', '2,5', '1 200', '12 ks', '0', 'abc', ''].map(scQty) };`);
  assert.deepStrictEqual(out.c, ['7.0.1', '7.0.2', '7.0.3', '', '', '']);
  assert.deepStrictEqual(out.qty, [5, 2.5, 1200, 12, null, null, null]);
  // dávka: stejný kód sečte, zápis do seznamu (položka, poddíl, varianta QR, neznámý kód)
  out = q(`const sh = cleanShortage({ lists: [{ id: 'l1', at: T(13), by: 'V', items: [it('A', 'K1'), it('B', 'K2', { subs: [{ id: 'sp1', ean: 'B1', code: 'S1', op: 'Brus' }], qrKey: shPlanKey('B', 'A', 'OB'), qrChoices: [{ link: 'https://is.example/q?activeBarcode=Q9', op: 'Elox' }] })] }] });
    const l = sh.lists[0], b = [];
    const a1 = scAdd(b, 'K1', '5', T(13, 8)), a2 = scAdd(b, 'K1', '3', T(13, 8, 5)), a3 = scAdd(b, 'S1', 2, T(13, 8, 6)), a4 = scAdd(b, 'X9', '4', T(13, 8, 7)), bad = scAdd(b, 'K1', '0', 1);
    const before = JSON.parse(JSON.stringify(sh));
    const res = scApply(sh, l, b, '  Brus – hala 2 ', { at: T(13, 9), by: 'Mistr' });
    const A = l.items[0], B = l.items[1];
    const after = cleanShortage(JSON.parse(JSON.stringify(sh)));
    const log = []; shChanges(before, after, (k, t, x) => log.push(t || (x.p + x.v0 + ' → ' + x.v1)));
    return { add: [a1.merged, a2.merged, a3.merged, a4.merged, bad], batch: b.map(r => [r.code, r.qty, r.n]), res: [res.matched, res.updated, res.missing, res.rows, res.logged],
      recA: [A.rec.state, A.rec.qty, A.rec.n, A.rec.when, A.rec.by], recS: [B.subs[0].rec.state, B.subs[0].rec.qty], records: l.records.map(r => r.code).sort(), moves: [l.moves.file, l.moves.rows, l.moves.by],
      scans: sh.scans.map(s => [s.code, s.qty, s.n, s.pos, s.hit, s.kind, s.name, s.by]), kept: after.scans.length, sent: l.sent, log,
      pos: scPositions(sh).slice(0, 2), find: [scFind(l, 'Q9') && scFind(l, 'Q9').kind, scFind(l, 'nic')] };`);
  assert.deepStrictEqual(out.add, [false, true, false, false, null], 'stejný kód se sečte, nulové množství nejde');
  assert.deepStrictEqual(out.batch, [['K1', 8, 2], ['S1', 2, 1], ['X9', 4, 1]]);
  assert.deepStrictEqual(out.res, [2, 2, ['X9'], 3, 3]);
  assert.deepStrictEqual(out.recA, ['Brus – hala 2', '8', 2, '13. 11. 2026 8:05', 'Mistr'], 'poslední záznam položky: pozice, množství, počet načtení, čas posledního');
  assert.deepStrictEqual(out.recS, ['Brus – hala 2', '2'], 'poddíl podle svého kódu');
  assert.deepStrictEqual(out.records, ['K1', 'S1', 'X9'], 'neznámý kód se uloží k seznamu pro později');
  assert.deepStrictEqual(out.moves, ['Rychlý scan · Brus – hala 2', 3, 'Mistr']);
  assert.deepStrictEqual(out.scans, [['X9', 4, 1, 'Brus – hala 2', false, '', '', 'Mistr'], ['S1', 2, 1, 'Brus – hala 2', true, 'sub', 'Díl B', 'Mistr'], ['K1', 8, 2, 'Brus – hala 2', true, 'item', 'Díl A', 'Mistr']], 'deník: nejnovější první');
  assert.strictEqual(out.kept, 3, 'čištění deník drží');
  assert.deepStrictEqual(out.sent, {}, 'jiná pozice než Odesláno na WPA nic neodesílá');
  assert.ok(out.log.includes('Shortage: rychlý scan Brus – hala 2 3 kódy (14 ks)'), out.log.join(' | '));
  assert.ok(out.log.some(t => /evidence pohybu Rychlý scan · Brus – hala 2 u seznamu .*\(3 záznamů\)/.test(t)), out.log.join(' | '));
  assert.deepStrictEqual(out.pos, ['Brus – hala 2', 'Odesláno na WPA']);
  assert.deepStrictEqual(out.find, ['qr', null]);
  // Odesláno na WPA: kusy se počítají proti množství zakázky; zabalený seznam ani prázdná pozice nejdou
  out = q(`const sh = cleanShortage({ lists: [{ id: 'l1', at: T(13), items: [it('A', 'K1', { oqty: 10 })] }, { id: 'l0', at: T(12), packed: { at: 1, by: 'x' }, items: [it('C', 'K3')] }] });
    const l = sh.lists[0], b = []; scAdd(b, 'K1', 4, T(13, 10));
    const res = scApply(sh, l, b, 'Odesláno na WPA', { at: T(13, 10, 1), by: 'M' });
    const st = shSentOf(l, l.items[0]);
    return { sent: l.sent, st: [st.st, st.sent, st.left], packed: scApply(sh, sh.lists[1], [{ code: 'K3', qty: 1, n: 1, at: 1 }], 'X', {}), empty: scApply(sh, l, b, '  ', {}), none: scApply(sh, l, [], 'X', {}) };`);
  assert.deepStrictEqual(out.sent, { K1: [[new Date(2026, 10, 13, 10, 0).getTime(), 4]] });
  assert.deepStrictEqual(out.st, ['here', 4, 6], 'odesláno 4 z 10 ks, zbytek u nás');
  assert.deepStrictEqual([out.packed, out.empty, out.none], [null, null, null]);
  // deník: čištění, limit, období, Excel, starší data bez deníku
  out = q(`const today = '2026-11-13';
    const raw = [{ ts: T(13, 9), code: 'K1', qty: '8', n: 2, pos: 'Brus', name: 'Díl A', hit: true, kind: 'item' }, { ts: T(10, 9), code: 'K2', qty: 1, pos: 'Brus' }, { ts: T(1, 9), code: 'K3', qty: 2, pos: 'Odesláno na WPA' },
      { code: 'bez qty', qty: 0, pos: 'X' }, { code: '', qty: 1, pos: 'X' }, { code: 'K4', qty: 1, pos: '' }, null];
    const c = scClean(raw);
    const many = scClean(Array.from({ length: SC_MAX_LOG + 20 }, (_, i) => ({ ts: i, code: 'C' + i, qty: 1, pos: 'P' })));
    const sh = scSheets(c);
    const st = blank(); st.shortage = { lists: [] }; st.v = 54;
    return { codes: c.map(s => s.code), qty: c[0].qty, ids: new Set(c.map(s => s.id)).size, many: [many.length, many[0].code], today: scRange(c, 'today', today).length, week: scRange(c, 'week', today).length, all: scRange(c, 'all', today).length,
      head: sh[0].rows[0], row: sh[0].rows[1], sum: sh[1].rows.slice(1).map(r => [r[0], r[1], r[2], r[3]]), old: sanitizeState(st).shortage.scans };`);
  assert.deepStrictEqual(out.codes, ['K1', 'K2', 'K3'], 'bez množství, kódu nebo pozice se zahodí');
  assert.deepStrictEqual([out.qty, out.ids], [8, 3]);
  assert.deepStrictEqual(out.many, [3000, 'C3019'], 'nejvýš 3000, nejnovější první');
  assert.deepStrictEqual([out.today, out.week, out.all], [1, 2, 3]);
  assert.deepStrictEqual(out.head, ['Datum', 'Čas', 'Pozice', 'QR kód', 'Množství', 'Počet načtení', 'Název dílu', 'EAN', 'Číslo objednávky', 'Index', 'V seznamu Shortage', 'Načetl']);
  assert.deepStrictEqual(out.row.slice(0, 7).concat(out.row[10]), ['13. 11. 2026', '9:00', 'Brus', 'K1', 8, 2, 'Díl A', 'položka']);
  assert.deepStrictEqual(out.sum, [['Brus', 'K1', 8, 2], ['Brus', 'K2', 1, 1], ['Odesláno na WPA', 'K3', 2, 1]]);
  assert.deepStrictEqual(out.old, [], 'starší data bez deníku: prázdný');
  return null;
});

test('Shortage (2.78): poslední 3 záznamy u dílu, záznamy kódů seznamu vždy, K prověření, Expedováno na WPA, přednastavení sloupců, poznámka připnuté položky', () => {
  const core = loadCore();
  const q = code => JSON.parse(run(core, `JSON.stringify((() => { const T = (d, h = 7, m = 0) => new Date(2026, 10, d, h, m).getTime();
    const c = t => ({ text: t, link: '' });
    const it = (ean, code, x = {}) => ({ id: 'i' + ean, ean, name: 'Díl ' + ean, order: 'O' + ean, index: 'A', qty: '5', code, link: '', ...x });
    ${code} })())`));
  // tři nejnovější záznamy ke kódu, další vložení se sloučí, starší doplní historii
  let out = q(`const rows = [[c('QR'), c('Datum'), c('Ks'), c('Stav')],
      [c('K1'), c('10.11.2026 8:00'), c('1'), c('Řezání')], [c('K1'), c('12.11.2026 9:00'), c('2'), c('Broušení')], [c('K1'), c('11.11.2026 7:00'), c('3'), c('Frézování')], [c('K1'), c('13.11.2026 6:30'), c('4'), c('Kontrola')],
      [c('K2'), c('13.11.2026 6:00'), c('5'), c('Odesláno na WPA')]];
    const r = shRecBuild(rows, SH_COLS.move), k1 = r.recs.get('K1');
    const sh = cleanShortage({ lists: [{ id: 'l1', at: T(13), items: [it('A', 'K1'), it('B', 'K2')] }] }), l = sh.lists[0];
    const a1 = shApplyRecs(l, r.recs, { at: T(13, 10), by: 'V' });
    const r2 = shRecBuild([[c('K1'), c('13.11.2026 11:00'), c('6'), c('Expedice')], [c('K2'), c('9.11.2026 6:00'), c('7'), c('Řezání')]], SH_COLS.move);
    const a2 = shApplyRecs(l, r2.recs, { at: T(13, 12), by: 'M' });
    const a3 = shApplyRecs(l, r2.recs, { at: T(13, 13), by: 'V' });
    const A = l.items[0], B = l.items[1];
    const cl = cleanShortage(JSON.parse(JSON.stringify(sh))).lists[0];
    const m = shRecMerge({ ts: 5, when: 'a', state: 'X', qty: '1', prev: [{ ts: 4, when: 'b', state: 'Y', qty: '1' }] }, { ts: 5, when: 'a', state: 'X', qty: '1', at: 9, by: 'N', n: 2 });
    return { n: k1.n, head: [k1.state, k1.qty], prev: k1.prev.map(x => x.state), a1: [a1.updated, a1.hist || 0], a2: [a2.updated, a2.older, a2.hist], a3: [a3.same, a3.updated],
      A: shRecList(A.rec).map(x => x.state), Ab: A.rec.by, B: shRecList(B.rec).map(x => x.state), Bb: B.rec.by, clean: shRecList(cl.items[0].rec).map(x => x.state), clB: cl.items[1].rec.prev.length,
      m: [m.at, m.n, m.by, m.prev.map(x => x.state)], noPrev: 'prev' in cleanShortage({ lists: [{ id: 'x', at: 1, items: [it('Z', 'Z1', { rec: { ts: 1, state: 'S' } })] }] }).lists[0].items[0].rec };`);
  assert.deepStrictEqual([out.n, out.head, out.prev], [4, ['Kontrola', '4'], ['Broušení', 'Frézování']], 'ke kódu nejnovější záznam a dva předchozí');
  assert.deepStrictEqual([out.a1, out.a2, out.a3], [[2, 0], [1, 1, 1], [2, 0]], 'novější záznam je poslední, starší jde do historie, stejné vložení nic nemění');
  assert.deepStrictEqual([out.A, out.Ab, out.B, out.Bb], [['Expedice', 'Kontrola', 'Broušení'], 'M', ['Odesláno na WPA', 'Řezání'], 'V'], 'nejvýš 3 záznamy; starší vložení nezmění, kdo poslední záznam vložil');
  assert.deepStrictEqual([out.clean, out.clB], [['Expedice', 'Kontrola', 'Broušení'], 1], 'čištění historii drží');
  assert.deepStrictEqual(out.m, [9, 2, 'N', ['Y']], 'stejný záznam se nezdvojí');
  assert.strictEqual(out.noPrev, false, 'záznam bez historie nemá pole prev (starší tvar)');
  // uložené záznamy: kódy seznamu vždy, cizí nejnovější do 3000, zabalený den jen vlastní
  out = q(`const recs = new Map(); for (let i = 0; i < 3500; i++) recs.set('F' + i, { ts: T(13, 8) + i, when: 'x', qty: '1', state: 'S' });
    recs.set('K1', { ts: T(1), when: 'old', qty: '1', state: 'Řezání' });
    recs.set('S1', { ts: T(1), when: 'old', qty: '1', state: 'Řezání' });
    const sh = cleanShortage({ lists: [{ id: 'l1', at: T(13), items: [it('A', 'K1', { subs: [{ ean: 'S', code: 'S1' }] })] }] }), l = sh.lists[0];
    const res = shApplyRecs(l, recs, { at: 1, by: 'V' });
    const has = (list, k) => list.records.some(r => r.code === k);
    const c2 = cleanShortage(JSON.parse(JSON.stringify(sh)));
    const p = JSON.parse(JSON.stringify(sh)); p.lists[0].packed = { at: 1, by: 'V' };
    const c3 = cleanShortage(p);
    return { trunc: res.truncated, n: l.records.length, own: has(l, 'K1') && has(l, 'S1'), newest: has(l, 'F3499'), oldest: has(l, 'F0'), n2: c2.lists[0].records.length, own2: has(c2.lists[0], 'K1'), packed: c3.lists[0].records.map(r => r.code).sort() };`);
  assert.deepStrictEqual(out, { trunc: 500, n: 3002, own: true, newest: true, oldest: false, n2: 3002, own2: true, packed: ['K1', 'S1'] }, 'nejstarší záznam kódu položky a poddílu se neztratí');
  // K prověření
  out = q(`const sh = cleanShortage({ depts: [{ id: 'd1', name: 'Brus', ops: [{ key: shOpKey('Broušení'), label: 'Broušení' }] }],
      lists: [{ id: 'l1', at: T(13), items: [
        it('A', 'K1', { op: 'Broušení', rec: { ts: 1, state: 'Kontrola' } }),
        it('B', 'K2', { op: 'Lakování', rec: { ts: 1, state: 'Kontrola' } }),
        it('C', 'K3', { op: 'Lakování', rec: { ts: 1, state: 'Expedováno na WPA' } }),
        it('D', 'K4', { op: 'Lakování' }),
        it('E', 'K5', { op: 'Lakování', subs: [{ ean: 'E1', code: 'S5', op: 'Lakování', rec: { ts: 1, state: 'Leštění' } }] }),
        it('F', 'K6', { op: 'Lakování', rec: { ts: 1, state: 'Kontrola' }, dept: '-' }),
        it('G', 'K7', { op: 'Broušení', dept: '?' })] }] }), l = sh.lists[0];
    const secs = shSections(sh, l.items).map(x => [x.id, x.name, x.items.map(i => i.ean).join('')]);
    const blocks = shBlocks(sh, l.items).map(x => x.id);
    const before = JSON.parse(JSON.stringify(sh));
    const d = [shDrop(sh, l, 'iB', '', null)]; d.push(l.items.find(i => i.id === 'iB').dept);
    d.push(shDrop(sh, l, 'iB', '?', null)); d.push(l.items.find(i => i.id === 'iB').dept);
    d.push(shDrop(sh, l, 'iA', '?', null)); d.push(l.items.find(i => i.id === 'iA').dept);
    const dup = shDuplicate(sh, l, 'iB', '?');
    const after = cleanShortage(JSON.parse(JSON.stringify(sh)));
    const log = []; shChanges(before, after, (k, t) => log.push(t));
    const none = cleanShortage({ lists: [{ id: 'l2', at: 1, items: [it('B', 'K2', { op: 'Lakování', rec: { ts: 1, state: 'Kontrola' }, dept: '?' })] }] });
    return { secs, blocks, d, dup: dup.dept, dupIn: shDeptOf(sh, dup), kept: after.lists[0].items.find(i => i.id === 'iA').dept, log: log.filter(t => /ručně přesunuta: K prověření/.test(t)).length,
      wpa: ['Odesláno na WPA', 'Expedováno na WPA', 'EXPEDOVÁNO NA WPA 3 ks', 'Na WPA', 'Expedice'].map(shWpa), noDept: shSections(none, none.lists[0].items).map(x => x.id), noDeptOf: shDeptOf(none, none.lists[0].items[0]), keepQ: none.lists[0].items[0].dept,
      name: [shDeptName(sh, '?'), shDeptName(sh, '-'), shDeptName(sh, ''), shDeptName(sh, 'd1')] };`);
  assert.deepStrictEqual(out.secs, [['d1', 'Brus', 'A'], ['?', 'K prověření', 'BEG'], ['', 'Nezařazeno', 'CDF']], 'záznam u nás + cizí operace = K prověření (i podle poddílu); expedováno, bez záznamu a ručně nezařazená ne');
  assert.deepStrictEqual(out.blocks, ['d1', '?', '']);
  assert.deepStrictEqual(out.d, [true, '-', true, '', true, '?'], 'ručně do Nezařazeno a zpátky; naše operace ručně do K prověření');
  assert.deepStrictEqual([out.dup, out.dupIn, out.kept, out.log], ['', '?', '?', 1], 'kopie do K prověření podle záznamu, ruční K prověření přežije čištění a je v historii');
  assert.deepStrictEqual(out.wpa, [true, true, true, false, false], 'Odesláno i Expedováno na WPA');
  assert.deepStrictEqual([out.noDept, out.noDeptOf, out.keepQ], [[''], '', '?'], 'bez oddělení jeden blok, ruční volba zůstane uložená');
  assert.deepStrictEqual(out.name, ['K prověření', 'Nezařazeno', 'Nezařazeno', 'Brus']);
  // přednastavení sloupců: stejné nadpisy, posunuté, jiný soubor
  out = q(`const head = [['Plán výroby'], ['EAN dílu', 'Objednávka', 'Line', 'Operace', 'Množství zakázky']], data = ['859', 'OBJ', '1', 'Brus', '5'];
    const base = shColsGuess('planItem', [...head, data], SH_COLS.planItem);
    const heads = shColsHeads('planItem', base.cols, [...head, data], base.header);
    const preset = shColsClean('planItem', { ...base.cols, heads, set: { at: 5, by: 'Vedoucí' }, matchVersion: 1 });
    const same = shColsPreset('planItem', preset, [...head, data]);
    const moved = shColsPreset('planItem', preset, [['Plán výroby'], ['Objednávka', 'EAN dílu', 'Line', 'Poznámka', 'Operace', 'Množství zakázky'], ['OBJ', '859', '1', 'x', 'Brus', '5']]);
    const other = shColsPreset('planItem', preset, [['Kód', 'Zakázka', 'Řádek']]);
    const dupHead = shColsPreset('planItem', preset, [['EAN dílu', 'EAN dílu', 'Objednávka', 'Line', 'Operace', 'Množství zakázky']]);
    const accents = shColsPreset('planItem', preset, [['ean dilu', 'OBJEDNAVKA', ' Line ', 'operace', 'mnozstvi  zakazky']]);
    return { header: base.header, heads, keep: [preset.set, Object.keys(preset.heads).length], same: same && [same.how, same.header, same.cols.ean, same.cols.order, same.moved.length],
      moved: moved && [moved.how, moved.cols.ean, moved.cols.order, moved.cols.index, moved.cols.op, moved.cols.qty, moved.moved.sort()], other, dupHead, accents: accents && accents.how,
      letters: shColsLetters('planItem', preset) === shColsLetters('planItem', { ...base.cols, matchVersion: 1, sheet: 'X' }), none: shColsPreset('planItem', shColsClean('planItem', base.cols), head), clean: 'heads' in shColsClean('planItem', SH_COLS.planItem) };`);
  assert.deepStrictEqual([out.header, out.heads], [1, { ean: 'EAN dílu', order: 'Objednávka', index: 'Line', op: 'Operace', qty: 'Množství zakázky' }]);
  assert.deepStrictEqual(out.keep, [{ at: 5, by: 'Vedoucí' }, 5]);
  assert.deepStrictEqual(out.same, ['same', 1, 'A', 'B', 0], 'stejné nadpisy na stejných místech = rovnou podle přednastavení');
  assert.deepStrictEqual(out.moved, ['moved', 'B', 'A', 'C', 'E', 'F', ['ean', 'op', 'order', 'qty']], 'stejné nadpisy jinde = sloupce podle nadpisů');
  assert.deepStrictEqual([out.other, out.dupHead, out.accents], [null, null, 'same'], 'jiný soubor a nejednoznačný nadpis = bez přednastavení; diakritika a velikost písmen nevadí');
  assert.deepStrictEqual([out.letters, out.none, out.clean], [true, null, false], 'porovnání jen písmen; bez nadpisů žádné přednastavení; výchozí sloupce bez nadpisů');
  // sestava s poddíly z víc oddělení je v každém z nich, poddíl jiného oddělení „jinde“ (2.78)
  out = q(`const sh = cleanShortage({ depts: [{ id: 'd1', name: 'Brus', ops: [{ key: shOpKey('Broušení'), label: 'Broušení' }] }, { id: 'd2', name: 'Lakovna', ops: [{ key: shOpKey('Lakování'), label: 'Lakování' }] }],
      lists: [{ id: 'l1', at: T(13), items: [
        it('A', 'K1', { op: 'Montáž', subs: [{ id: 'a1', ean: 'A1', code: 'P1', op: 'Broušení' }, { id: 'a2', ean: 'A2', code: 'P2', op: 'Lakování', full: true }, { id: 'a3', ean: 'A3', code: 'P3', op: 'Balení' }] }),
        it('B', 'K2', { op: 'Lakování', subs: [{ id: 'b1', ean: 'B1', code: 'Q1', op: 'Broušení' }] }),
        it('C', 'K3', { op: 'Montáž', dept: 'd2', subs: [{ id: 'c1', ean: 'C1', code: 'R1', op: 'Broušení' }, { id: 'c2', ean: 'C2', code: 'R2', op: 'Lakování' }] }),
        it('D', 'K4', { op: 'Broušení', subs: [{ id: 'e1', ean: 'D1', code: 'S1', op: 'Broušení' }] })] }] }), l = sh.lists[0], f = e => l.items.find(i => i.ean === e);
    const secs = shSections(sh, l.items).map(x => [x.id, x.items.map(i => i.ean + (i.splitOf ? '*' : '')).join(',')]);
    const A = f('A'), here = d => A.subs.map(x => shSubHere(sh, A, x, d) ? 1 : 0).join('');
    const before = JSON.parse(JSON.stringify(sh)); f('A').subs[1].full = false; delete f('A').subs[1].full;
    const after = cleanShortage(JSON.parse(JSON.stringify(sh))); const log = []; shChanges(before, after, (k, t) => log.push(t));
    return { split: ['A', 'B', 'C', 'D'].map(e => shSplitDepts(sh, f(e))), secs, here: [here('d1'), here('d2')], full: [before.lists[0].items[0].subs[1].full, 'full' in after.lists[0].items[0].subs[0]],
      view: (() => { const v = shSections(sh, l.items).find(x => x.id === 'd2').items.find(i => i.ean === 'A'); return [v.splitDept, v.splitOf === A.id, 'splitDept' in A]; })(),
      noDepts: shSplitDepts(cleanShortage({ lists: [{ id: 'x', at: 1, items: [A] }] }), A), log: log.filter(t => /zase bez QR/.test(t)).length };`);
  assert.deepStrictEqual(out.split, [['d1', 'd2'], ['d2', 'd1'], ['d2'], ['d1']], 'domovské oddělení první; ručně zařazená a jednooddělenová sestava se nerozdělí');
  assert.deepStrictEqual(out.secs, [['d1', 'A,B*,D'], ['d2', 'A*,B,C']], 'sestava v každém oddělení svých poddílů (pohled označený *)');
  assert.deepStrictEqual(out.here, ['101', '010'], 'v Brusu poddíl Broušení a poddíl bez oddělení (domovské), v Lakovně jen Lakování');
  assert.deepStrictEqual([out.full, out.view, out.noDepts, out.log], [[true, false], ['d2', true, false], [''], 1], 'Zobrazit plně u poddílu se uloží jen když je; pohled nemění data; bez oddělení nic; historie');
  // připnutá položka, která je i v nových urgentech, si nechá ruční poznámku a poddíly (2.78)
  out = q(`const prev = { items: [
      it('A', 'K1', { pin: { at: 1, by: 'V' }, note: 'Poznámka od plánování: Volat · Dodavatel slíbil pátek', planningNote: 'Poznámka od plánování: Volat', subs: [{ id: 's1', ean: 'S1', code: 'P1', note: 'Brusič ví' }] }),
      it('B', 'K2', { pin: { at: 1, by: 'V' }, note: 'Jen ruční' }),
      it('C', 'K3', { pin: { at: 1, by: 'V' }, note: 'Stejná', planningNote: '' }),
      it('D', 'K4', { note: 'Nepřipnutá' })] };
    const items = [it('A', 'K1', { note: 'Poznámka od plánování: Nově', planningNote: 'Poznámka od plánování: Nově' }), it('B', 'K2', { note: '' }), it('C', 'K3', { note: 'Stejná' }), it('D', 'K4', { note: '' })];
    const r = shCarryPins(prev, items);
    const f = e => r.items.find(i => i.ean === e);
    return { kept: r.kept, carried: r.carried, A: f('A').note, As: f('A').subs.map(x => [x.ean, x.note, x.id]), B: f('B').note, C: f('C').note, D: f('D').note, pin: !!f('A').pin };`);
  assert.deepStrictEqual(out, { kept: 3, carried: 0, A: 'Dodavatel slíbil pátek · Poznámka od plánování: Nově', As: [['S1', 'Brusič ví', '']], B: 'Jen ruční', C: 'Stejná', D: '', pin: true },
    'ruční poznámka zůstane, stará poznámka od plánování se nahradí novou, poddíly s poznámkami; nepřipnutá ne');
  // historie a rozbor
  out = q(`const a = blankShortage(), b = { ...blankShortage(), cols: { plan: shColsClean('plan', { ...SH_COLS.plan, heads: { asm: 'Sestava', sub: 'Poddíl' }, set: { at: 5, by: 'V' } }) } };
    const log = []; shChanges(a, b, (k, t) => log.push(t));
    const l = { items: [{ id: 'a', ean: '1', code: 'A', rec: { ts: 3, when: '13. 11. 2026 8:00', qty: '2', state: 'Brus', prev: [{ ts: 2, when: '12. 11. 2026 8:00', qty: '1', state: 'Řez' }, { ts: 1, when: '11. 11. 2026 8:00', qty: '', state: 'Sklad' }] } }] };
    const sh = shAnalysisSheet(l);
    return { log, head: sh.rows[0].slice(-1)[0], prev: sh.rows[1].slice(-1)[0], w: sh.cols.length === sh.rows[0].length };`);
  assert.ok(/^Shortage: sloupce druhého listu výrobního plánu: .* · uloženo jako přednastavení/.test(out.log[0]), out.log[0]);
  assert.deepStrictEqual([out.head, out.prev, out.w], ['Předchozí záznamy', '12. 11. 2026 8:00, Řez, 1 ks | 11. 11. 2026 8:00, Sklad', true]);
  return null;
});

test('Po termínu (2.79): skluz ze sloupce F, seřazení od největšího, společná oddělení a sloupce se Shortage, čištění, historie', () => {
  const core = loadCore();
  const q = code => JSON.parse(run(core, `JSON.stringify((() => { const c = t => ({ text: t, link: '' }); ${code} })())`));
  let out = q(`return ['12', '12 dní', '-3', '−4', '2,5', '1 200', '7 d.', '', 'abc', '3 týdny', 5.555].map(shDelayNum);`);
  assert.deepStrictEqual(out, [12, 12, -3, -4, 2.5, 1200, 7, null, null, 3, 5.56]);
  // import: sloupce podle nadpisů (skluz F), seřazení, bez skluzu na konci, bez TOP
  out = q(`const rows = [[c('Zakázka'), c('Popis'), c('EAN'), c('Index'), c('Množství'), c('Skluz (dny)'), c('Probíhající operace')],
      [c('OBJ-1'), c('Hřídel'), { text: '8590000000011', link: 'http://is.example/x?activeBarcode=1.1.1&y=1' }, c('A'), c('4'), c('3'), c('Broušení')],
      [c('OBJ-2'), c('Kryt'), c('8590000000028'), c('B'), c('2'), c('15'), c('Lakování')],
      [c('OBJ-3'), c('Pouzdro'), c('8590000000035'), c('C'), c('1'), c(''), c('Montáž')],
      [c('OBJ-4'), c('Víko'), c('8590000000042'), c('D'), c('9'), c('7 dní'), c('TOP')]];
    const g = shColsGuess('late', rows.map(r => r.map(x => x.text)), SH_COLS.late);
    const r = shBuild(rows, g.cols, null, 'late');
    return { cols: [g.cols.delay, g.cols.ean, g.cols.op, g.cols.order], items: r.items.map(i => [i.ean.slice(-2), i.delay ?? null, i.top, i.code]), warn: r.warn.noDelay, top: r.top, need: SH_COL_NEED.late };`);
  assert.deepStrictEqual(out.cols, ['F', 'C', 'G', 'A'], 'sloupce podle nadpisů, skluz F');
  assert.deepStrictEqual(out.items, [['28', 15, false, ''], ['42', 7, false, ''], ['11', 3, false, '1.1.1'], ['35', null, false, '']], 'od největšího skluzu, bez skluzu na konci, žádná TOP');
  assert.deepStrictEqual([out.warn, out.top, out.need], [1, 0, ['ean', 'delay']]);
  // pořadí s Hotovo a nejhorší čtvrtina
  out = q(`const it = (e, d, st) => ({ ean: e, delay: d, ...(st ? { st } : {}) });
    const o = shLateOrder([it('a', 1), it('b', 9, 'done'), it('c', 9), it('d'), it('e', 9), it('f', 4)]).map(i => i.ean).join('');
    return { o, t: shDelayTiers([it('a', 1), it('b', 20, 'done'), it('c', 9), it('d', 8), it('e', 4), it('f', 2), it('g', 0)]) };`);
  assert.strictEqual(out.o, 'cefadb', 'stejný skluz zachová pořadí, Hotovo na konci');
  assert.deepStrictEqual(out.t, { crit: 8, warn: 4, max: 9 }, 'čtvrtina a polovina podle skluzu otevřených položek');
  // stav: S.late se společnými odděleními a sloupci, ruční oddělení položky zůstane, ukládá se jen seznam a historie
  out = q(`const st = blank();
    st.shortage = { lists: [], depts: [{ id: 'd1', name: 'Brus', ops: [{ key: shOpKey('Broušení'), label: 'Broušení' }] }], cols: { plan: { ...SH_COLS.plan, asm: 'B' } }, colors: {} };
    st.late = { lists: [{ id: 'pt1', at: 5, by: 'V', items: [{ ean: '1', name: 'A', delay: 3, dept: 'd1' }, { ean: '2', name: 'B', delay: '20' }, { ean: '3', name: 'C', delay: 'x' }] }], depts: [{ id: 'cizi', name: 'Nesmí se uložit', ops: [] }] };
    const S1 = sanitizeState(st);
    const shared = sharedState(S1);
    const S2 = sanitizeState(JSON.parse(JSON.stringify(shared)));
    S1.late.cols = { ...S1.late.cols, late: { ...SH_COLS.late, delay: 'G' } };
    const before = sharedState(S2), after = JSON.parse(JSON.stringify(sharedState(S2)));
    after.late.lists.unshift({ id: 'pt2', at: 9, by: 'V', file: 'po-terminu.xlsx', items: [{ ean: '9', name: 'Nový', delay: 2 }] });
    const log = describeChanges(before, sharedState(sanitizeState(after)), { by: 'V' }).entries.map(e => [e.kind, e.text, e.m]);
    return { keys: Object.keys(shared.late).sort(), sameDepts: S1.late.depts === S1.shortage.depts, plan: S1.late.cols.plan.asm, setCols: S1.shortage.cols.late && S1.shortage.cols.late.delay,
      items: S1.late.lists[0].items.map(i => [i.ean, i.delay ?? null, i.dept]), again: JSON.stringify(sharedState(S2)) === JSON.stringify(shared),
      dOf: shDeptOf(S1.late, S1.late.lists[0].items.find(i => i.ean === '1')), log: log.filter(x => x[0] === 'late'), shortLog: log.filter(x => x[0] === 'shortage').length,
      old: (() => { const o = blank(); delete o.late; o.v = 56; const x = sanitizeState(o); return [x.late.lists.length, Object.keys(sharedState(x).late).sort()]; })() };`);
  assert.deepStrictEqual(out.keys, ['hist', 'lists', 'scans'], 'oddělení, sloupce a barvy Po termínu se neukládají (jsou ze Shortage)');
  assert.deepStrictEqual([out.sameDepts, out.plan, out.setCols], [true, 'B', 'G'], 'oddělení a sloupce plánu společné, zápis sloupců jde do Shortage');
  assert.deepStrictEqual(out.items, [['2', 20, ''], ['1', 3, 'd1'], ['3', null, '']], 'seřazeno podle skluzu, ruční oddělení ze Shortage zůstane');
  assert.deepStrictEqual([out.again, out.dOf], [true, 'd1'], 'čištění je stálé');
  assert.ok(out.log.length === 1 && /^Po termínu: nahrán seznam/.test(out.log[0][1]) && /^pt/.test(out.log[0][2]) && out.shortLog === 0, JSON.stringify(out.log));
  assert.deepStrictEqual(out.old, [0, ['hist', 'lists', 'scans']], 'starší data bez Po termínu: prázdný modul');
  return null;
});

test('Skříňky (2.80): vložení z Excelu, párování ručně psaných jmen, stavy, K vyklizení, řada, čištění, historie', () => {
  const core = loadCore();
  const q = code => JSON.parse(run(core, `JSON.stringify((() => {
    const P = [['Novák', 'Jan'], ['Nováková', 'Jana'], ['Dvořák', 'Petr'], ['Dvořák', 'Pavel'], ['Svoboda', 'Tomáš'], ['Černá Malá', 'Lenka'],
      ['Wagner', 'Karel'], ['Kovaříková', 'Zdeňka', { excluded: true }], ['Šimek', 'Ondřej'], ['Beneš', 'Cyril'], ['Bez', 'Skříňky', { lead: [] }]];
    const mk = () => { const st = blank(); P.forEach(([last, first, x]) => { const key = norm(last) + '|' + norm(first); st.employees[key] = { key, first, last, positionId: '', ...(x || {}) }; }); return sanitizeState(st); };
    ${code} })())`));
  // vložení: nadpis, číslo jako číslo i text, buňky {text}, duplicita, chybějící číslo, prázdný řádek
  let out = q(`return lkParse([['Řada', 'Číslo', 'Jméno a příjmení'], ['A', '1', 'Jan Novák'], ['a ', '01', 'Někdo'], ['B', '', 'Petr'], ['', '', ''],
    [{ text: 'C' }, 5, ''], ['D', '12a', '  Svoboda  ']]);`);
  assert.strictEqual(out.header, true, 'první řádek je nadpis');
  assert.deepStrictEqual(out.items.map(i => [i.n, i.row, i.no, i.text]), [[2, 'A', '1', 'Jan Novák'], [6, 'C', '5', ''], [7, 'D', '12A', 'Svoboda']]);
  assert.deepStrictEqual([out.dup, out.skipped.map(x => [x.n, x.why])], [['A 1'], [[4, 'chybí číslo skříňky']]]);
  out = q(`return lkParse([['A', '1', 'Jméno'], ['A', '2', 'Novák']]);`);
  assert.deepStrictEqual([out.header, out.items.length], [false, 2], 'bez nadpisu (číslo je číslo) se nic nezahodí');
  // párování: prohozené pořadí, bez háčků, jen příjmení, iniciála, překlep, složené příjmení, vyřazený, duplicita, ruční výběr
  out = q(`const st = mk();
    const T = ['Jan Novák', 'Novakova Jana', 'Dvořák', 'Svoboda', 'Simek O.', 'Vagner Karel', 'Kovarikova', 'Cerna Lenka', 'Novák Jan',
      'Horák Milan', '', 'Dvorak P.', 'Ing. Beneš C.', 'Svobda Tomas', 'Novak'];
    const rows = T.map((text, i) => ({ n: i + 1, text }));
    const m = lkMatch(rows, st.employees);
    const m2 = lkMatch(rows, st.employees, new Map([[3, 'dvorak|petr'], [1, '']]));
    return { m: m.map(x => [x.key, x.how]), cand: m.map(x => x.cand), m2: [m2[2].key, m2[2].how, m2[0].key, m2[8].key, m2[8].how] };`);
  assert.deepStrictEqual(out.m, [
    ['novak|jan', 'exact'], ['novakova|jana', 'exact'], [null, 'none'], ['svoboda|tomas', 'surname'], ['simek|ondrej', 'initial'],
    ['wagner|karel', 'fuzzy'], ['kovarikova|zdenka', 'surname'], ['cerna mala|lenka', 'fuzzy'], [null, 'none'],
    [null, 'none'], [null, 'none'], [null, 'none'], ['benes|cyril', 'initial'], [null, 'none'], [null, 'none']], JSON.stringify(out.m));
  assert.deepStrictEqual(out.cand[2].slice().sort(), ['dvorak|pavel', 'dvorak|petr'], 'dva Dvořáci: nejisté, oba v návrhu');
  assert.deepStrictEqual(out.cand[11].slice().sort(), ['dvorak|pavel', 'dvorak|petr'], 'Dvořák P.: iniciála nestačí');
  assert.strictEqual(out.cand[8][0], 'novak|jan', 'Novák podruhé: nejisté, návrh je on');
  assert.strictEqual(out.cand[13][0], 'svoboda|tomas', 'Svoboda podruhé (překlep): návrh');
  assert.deepStrictEqual([out.cand[9], out.cand[10]], [[], []], 'neznámé a prázdné jméno bez návrhu');
  assert.deepStrictEqual(out.m2, ['dvorak|petr', 'manual', null, 'novak|jan', 'exact'], 'ruční výběr má přednost, „nikdo“ uvolní člověka pro další řádek');
  // uložení, stavy a přehled
  out = q(`const st = mk(); const today = '2026-11-14';
    st.employees['svoboda|tomas'].end = '2026-11-01';
    const a = lkApply(st, [{ row: 'A', no: '1', key: 'novak|jan', raw: 'Jan Novák' }, { row: 'A', no: '2', key: 'kovarikova|zdenka', raw: 'Kovarikova' },
      { row: 'A', no: '3', gone: 'Horák Milan', raw: 'Horák Milan' }, { row: 'A', no: '4', raw: 'Xyz' }, { row: 'A', no: '5' }, { row: 'B', no: '1', key: 'svoboda|tomas' },
      { row: 'B', no: '2', key: 'novak|jan' }, { row: 'B', no: '3', key: 'nikdo|neni' }], {}, { at: 5, by: 'V' });
    const ov = lkOverview(st.lockers, st.employees, today);
    const st2 = mk(); st2.lockers = JSON.parse(JSON.stringify(st.lockers));
    const b = lkApply(st2, [{ row: 'a', no: '01', key: 'dvorak|petr' }, { row: 'C', no: '9' }], { replace: true });
    return { a, ov: [ov.total, ov.free, ov.used, ov.unknown, ov.clear], st: ov.rows.map(r => [lkLabel(r.l), r.st, r.why || '', r.endPast || '']), multi: ov.multi,
      without: ov.without.map(e => e.key), name: st.lockers.list[0].name, b, list2: st2.lockers.list.map(l => [lkLabel(l), l.key, l.raw]),
      sh: lkSheets(st.lockers, st.employees, today).map(x => [x.name, x.rows.length, x.rows[2] && x.rows[2][7]]) };`);
  assert.deepStrictEqual(out.a, { added: 8, updated: 0, removed: 0, used: 4, gone: 1, unknown: 1, free: 2 }, 'neznámý klíč = volná');
  assert.deepStrictEqual(out.ov, [8, 2, 3, 1, 2]);
  assert.deepStrictEqual(out.st, [['A 1', 'used', '', ''], ['A 2', 'clear', 'vyřazený ze seznamu', ''], ['A 3', 'clear', 'už u nás nepracuje', ''], ['A 4', 'unknown', '', ''],
    ['A 5', 'free', '', ''], ['B 1', 'used', '', '2026-11-01'], ['B 2', 'used', '', ''], ['B 3', 'free', '', '']]);
  assert.deepStrictEqual(out.multi, ['novak|jan'], 'Novák má dvě skříňky');
  assert.deepStrictEqual(out.without, ['benes|cyril', 'bez|skrinky', 'cerna mala|lenka', 'dvorak|pavel', 'dvorak|petr', 'novakova|jana', 'simek|ondrej', 'wagner|karel'],
    'bez skříňky jen nevyřazení, seřazení podle jména');
  assert.strictEqual(out.name, 'Novák Jan', 'snímek jména');
  assert.deepStrictEqual(out.b, { added: 1, updated: 1, removed: 7, used: 1, gone: 0, unknown: 0, free: 1 }, 'nahradit celý soupis');
  assert.deepStrictEqual(out.list2, [['A 1', 'dvorak|petr', ''], ['C 9', '', '']]);
  assert.deepStrictEqual(out.sh, [['Skříňky', 9, 'Je třeba vyprázdnit (vyřazený ze seznamu)'], ['Bez skříňky', 9, null]]);
  // řada, přidělení, už nepracuje, uvolnění, poznámka, smazání; vyřazení a smazání člověka = K vyklizení
  out = q(`const st = mk();
    lkApply(st, [{ row: 'A', no: '1', key: 'novak|jan' }], {});
    const r1 = lkAddRange(st, 'a', 5, 1), r2 = lkAddRange(st, 'B', 1, 600), r3 = lkAddRange(st, 'B', 'x', 2);
    const id = n => st.lockers.list.find(l => lkLabel(l) === n).id;
    lkAssign(st, id('A 2'), 'svoboda|tomas'); lkSetGone(st, id('A 3'), 'Horák'); lkSetGone(st, id('A 1')); lkFree(st, id('A 4'));
    lkSetNote(st, id('A 2'), '  klíč   u vrátného '); const del = lkDelete(st, id('A 5'));
    const bad = [lkAssign(st, 'lkneni0', 'novak|jan').err, lkAssign(st, id('A 4'), 'nikdo|x').err];
    const view = () => st.lockers.list.map(l => [lkLabel(l), l.key, l.gone, l.note]);
    const v1 = view();
    lkAssign(st, id('A 4'), 'simek|ondrej'); st.employees['simek|ondrej'].excluded = true;
    lkAssign(st, id('A 1'), 'wagner|karel'); delete st.employees['wagner|karel'];
    const ov = lkOverview(st.lockers, st.employees, '2026-11-14');
    const st3 = sanitizeState(JSON.parse(JSON.stringify(sharedState(st))));
    return { r1, r2: r2.err, r3: r3.err, del, bad, v1, clear: ov.rows.filter(r => r.st === 'clear').map(r => [lkLabel(r.l), r.why]),
      kept: st3.lockers.list.map(l => [lkLabel(l), l.key, l.name]) };`);
  assert.deepStrictEqual([out.r1, out.r2, out.r3, out.del], [{ added: 4, skip: 1 }, 'Najednou nejvýš 500 skříněk.', 'Zadej čísla od a do.', true]);
  assert.deepStrictEqual(out.bad, ['Skříňka už v soupisu není.', 'Člověk už v Lidech není.']);
  assert.deepStrictEqual(out.v1, [['A 1', '', 'Novák Jan', ''], ['A 2', 'svoboda|tomas', '', 'klíč u vrátného'], ['A 3', '', 'Horák', ''], ['A 4', '', '', '']]);
  assert.deepStrictEqual(out.clear, [['A 1', 'už není v Lidech'], ['A 3', 'už u nás nepracuje'], ['A 4', 'vyřazený ze seznamu']]);
  assert.deepStrictEqual(out.kept, [['A 1', 'wagner|karel', 'Wagner Karel'], ['A 2', 'svoboda|tomas', 'Svoboda Tomáš'], ['A 3', '', ''], ['A 4', 'simek|ondrej', 'Šimek Ondřej']],
    'po smazání člověka zůstane klíč i jméno (K vyklizení)');
  // čištění: duplicita, špatné id, chybějící číslo, gone u přidělené, stálost; stará data; uloží se jen list
  out = q(`const st = mk();
    st.lockers = { list: [{ id: 'lkabcdef', row: 'b', no: 2, key: 'novak|jan', name: 'Starý', gone: 'x' }, { id: 'lkabcdef', row: 'A', no: '007' }, { id: 'zle', row: 'B', no: '2.0' },
      { row: 'C' }, null, 'x', { id: 'lkzzzzzz', row: 'A', no: '10', key: 'pryc|nekdo', name: 'Pryč Někdo', note: 'a\\nb' }], extra: 1 };
    const S1 = sanitizeState(st), sh = sharedState(S1), S2 = sanitizeState(JSON.parse(JSON.stringify(sh)));
    const old = (() => { const o = blank(); delete o.lockers; o.v = 57; return sanitizeState(o).lockers; })();
    return { list: S1.lockers.list.map(l => [l.id === 'lkabcdef', lkLabel(l), l.key, l.name, l.gone, l.note]), ids: new Set(S1.lockers.list.map(l => l.id)).size,
      keys: Object.keys(sh.lockers), again: JSON.stringify(sharedState(S2).lockers) === JSON.stringify(sh.lockers), old, v: S1.v };`);
  assert.deepStrictEqual(out.list, [[false, 'A 7', '', '', '', ''], [false, 'A 10', 'pryc|nekdo', 'Pryč Někdo', '', 'a b'], [true, 'B 2', 'novak|jan', 'Novák Jan', '', '']], JSON.stringify(out.list));
  assert.deepStrictEqual([out.ids, out.keys, out.again, out.old, out.v], [3, ['list'], true, { list: [] }, 59]);
  // historie změn (kind locker)
  out = q(`const st = mk();
    lkApply(st, [{ row: 'A', no: '1', key: 'novak|jan' }, { row: 'A', no: '2' }, { row: 'A', no: '3', key: 'svoboda|tomas' }], {});
    const before = JSON.parse(JSON.stringify(sharedState(st)));
    const id = n => st.lockers.list.find(l => lkLabel(l) === n).id;
    lkAssign(st, id('A 2'), 'simek|ondrej'); lkSetGone(st, id('A 1')); lkFree(st, id('A 3')); lkSetNote(st, id('A 2'), 'nový zámek'); lkAddRange(st, 'B', 1, 1);
    const after = sharedState(st);
    const log = describeChanges(before, after, { by: 'V' }).entries.filter(e => e.kind === 'locker').map(e => [e.text, e.m.replace(/lk[0-9a-z]+/, 'ID'), e.key || '']);
    lkDelete(st, id('B 1'));
    const log2 = describeChanges(after, sharedState(st), { by: 'V' }).entries.map(e => [e.kind, e.text]);
    return { log, log2, kinds: LOG_KINDS.includes('locker'), merge: MERGE_TOP.lockers };`);
  assert.deepStrictEqual(out.log, [
    ['Skříňka A 1: Novák Jan už u nás nepracuje, je třeba vyprázdnit', 'lk:ID:k:g', 'novak|jan'],
    ['Skříňka A 2 přidělena: Šimek Ondřej', 'lk:ID:k:p', 'simek|ondrej'],
    ['Skříňka A 2: poznámka „nový zámek“', 'lk:ID:t', ''],
    ['Skříňka A 3 uvolněna (Svoboda Tomáš)', 'lk:ID:k:f', 'svoboda|tomas'],
    ['Skříňka B 1 přidána', 'lk:ID:n', '']], JSON.stringify(out.log));
  assert.deepStrictEqual(out.log2, [['locker', 'Skříňka B 1 smazána']]);
  assert.deepStrictEqual([out.kinds, out.merge], [true, 'Skříňky']);
  return null;
});

test('Skříňky (2.81): výzva k vyklizení se lhůtou 7 pracovních dnů (bez víkendů a svátků), uložení, zrušení přidělením, historie', () => {
  const core = loadCore();
  const q = code => JSON.parse(run(core, `JSON.stringify((() => {
    const mk = () => { const st = blank(); [['Novák', 'Jan', true], ['Svoboda', 'Tomáš']].forEach(([last, first, ex]) => { const key = norm(last) + '|' + norm(first); st.employees[key] = { key, first, last, positionId: '', ...(ex ? { excluded: true } : {}) }; }); return sanitizeState(st); };
    ${code} })())`));
  // lhůta: sobota 14. 11. 2026 → út 17. 11. je svátek → středa 25. 11.; přes Vánoce a Nový rok
  let out = q(`return [lkWorkDaysAdd('2026-11-14', 7), lkWorkDaysAdd('2026-11-16', 1), lkWorkDaysAdd('2026-12-21', 7), lkWorkDaysAdd('2026-11-13', 0)];`);
  assert.deepStrictEqual(out, ['2026-11-25', '2026-11-18', '2027-01-04', '2026-11-13']);
  out = q(`const st = mk();
    lkApply(st, [{ row: 'A', no: '1', key: 'novak|jan' }, { row: 'A', no: '2', key: 'svoboda|tomas' }, { row: 'A', no: '3', gone: 'Horák' }, { row: 'A', no: '4' }], {});
    const id = n => st.lockers.list.find(l => lkLabel(l) === n).id;
    const before = JSON.parse(JSON.stringify(sharedState(st)));
    const a = lkSetNotice(st, id('A 1'), '2026-11-14', { by: 'Mistr' });
    const again = lkSetNotice(st, id('A 1'), '2026-11-20', { by: 'Jiný' });
    const bad = [lkSetNotice(st, id('A 2'), '2026-11-14').err, lkSetNotice(st, id('A 4'), '2026-11-14').err, lkSetNotice(st, 'lkneni0', '2026-11-14').err];
    lkSetNotice(st, id('A 3'), '2026-11-14');
    const log = describeChanges(before, sharedState(st), { by: 'V' }).entries.map(e => [e.text, e.m.replace(/lk[0-9a-z]+/, 'ID'), e.key || '']);
    const s1 = lkState(lkFind(st, id('A 1')), st.employees, '2026-11-25'), s2 = lkState(lkFind(st, id('A 1')), st.employees, '2026-11-26');
    const lines = lkNoticeLines(lkFind(st, id('A 1')), a.n);
    const xl = lkSheets(st.lockers, st.employees, '2026-11-26', []).find(x => x.name === 'Skříňky').rows.find(r => r[0] === 'A 1')[7];
    const shared = sharedState(st), back = sanitizeState(JSON.parse(JSON.stringify(shared)));
    const kept = back.lockers.list.map(l => l.notice ? l.notice.until : '-').join(',');
    lkAssign(st, id('A 1'), 'svoboda|tomas'); lkFree(st, id('A 3'));
    const gone = st.lockers.list.filter(l => l.notice).length;
    const dirty = cleanLockers({ list: [{ row: 'B', no: 1, notice: { at: '2026-11-14', until: 'x' } }, { row: 'B', no: 2, notice: { at: '2026-11-20', until: '2026-11-14' } }, { row: 'B', no: 3, notice: { at: '2026-11-14', until: '2026-11-25', by: 'M', x: 1 } }] }, {}).list.map(l => l.notice || null);
    const st2 = mk(); lkApply(st2, [{ row: 'A', no: '1', key: 'novak|jan' }], {}); lkSetNotice(st2, st2.lockers.list[0].id, '2026-11-14');
    lkApply(st2, [{ row: 'A', no: '1', key: 'novak|jan', raw: 'Jan Novák' }], {}); const same = !!st2.lockers.list[0].notice;
    lkApply(st2, [{ row: 'A', no: '1', key: 'svoboda|tomas' }], {}); const changed = !!st2.lockers.list[0].notice;
    return { a: [a.fresh, a.n], again: [again.fresh, again.n.until, again.n.by], bad, log, s1: [s1.st, s1.noticeLate], s2: s2.noticeLate, lines, xl, kept, gone, dirty, same, changed,
      noField: Object.keys(lkFind(st, id('A 4'))).includes('notice') };`);
  assert.deepStrictEqual(out.a, [true, { at: '2026-11-14', until: '2026-11-25', by: 'Mistr' }]);
  assert.deepStrictEqual(out.again, [false, '2026-11-25', 'Mistr'], 'opakovaný tisk drží stejnou lhůtu');
  assert.deepStrictEqual(out.bad, ['Skříňka A 2 není K vyklizení.', 'Skříňka A 4 není K vyklizení.', 'Skříňka už v soupisu není.']);
  assert.deepStrictEqual(out.log, [['Skříňka A 1: vyvěšena výzva k vyklizení, lhůta do 25. 11. 2026', 'lk:ID:v', 'novak|jan'], ['Skříňka A 3: vyvěšena výzva k vyklizení, lhůta do 25. 11. 2026', 'lk:ID:v', '']]);
  assert.deepStrictEqual([out.s1, out.s2], [['clear', false], true], 'lhůta uplyne den po datu');
  assert.deepStrictEqual(out.lines, { title: 'VÝZVA K VYKLIZENÍ', label: 'SKŘÍŇKA A 1', ask: 'Používáte tuto skříňku? Nahlaste se u vedoucího nejpozději',
    until: 'do 25. 11. 2026 (7 pracovních dnů).', then: 'Poté bude skříňka komisionálně otevřena a vyklizena.', at: 'Vyvěšeno 14. 11. 2026' });
  assert.strictEqual(out.xl, 'Je třeba vyprázdnit (vyřazený ze seznamu), lhůta výzvy uplynula 25. 11. 2026');
  assert.deepStrictEqual([out.kept, out.gone, out.noField], ['2026-11-25,-,2026-11-25,-', 0, false], 'výzva se uloží, přidělení a uvolnění ji zruší, bez výzvy pole není');
  assert.deepStrictEqual(out.dirty, [null, null, { at: '2026-11-14', until: '2026-11-25', by: 'M' }]);
  assert.deepStrictEqual([out.same, out.changed], [true, false], 'nový import se stejným člověkem výzvu nechá, jiný člověk ji zruší');
  return null;
});

/** Dekódování ^GFA s kompresí ZPL (pro kontrolu kódování). */
function zplDecode(gfa) {
  const m = /^\^GFA,(\d+),(\d+),(\d+),(.*)$/.exec(gfa);
  const total = +m[1], bpr = +m[3], h = total / bpr, src = m[4], hexW = bpr * 2;
  const rows = [];
  let i = 0, prev = null;
  while (rows.length < h) {
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
test('Skříňky (2.81): ZPL pro Zebru 203 dpi – obrázek ^GFA s kompresí, ^PW800^LL280^LH0,0, ^PQ1', () => {
  const core = loadCore();
  const out = JSON.parse(run(core, `JSON.stringify((() => {
    const w = 800, h = 280, bits = new Uint8Array(w * h);
    for (let y = 40; y < 60; y++) for (let x = 100; x < 700; x++) bits[y * w + x] = 1;   // pruh
    for (let y = 100; y < 102; y++) for (let x = 0; x < w; x++) bits[y * w + x] = 1;     // celý řádek
    for (let y = 150; y < 160; y++) for (let x = 3; x < 13; x += 2) bits[y * w + x] = 1; // vzor
    const z = lkZplLabel(bits);
    const gfa = /\\^GFA[^^]*/.exec(z)[0];
    return { head: z.slice(0, 31), tail: z.slice(-12), gfa, bits: Array.from(bits).join(''), cnt: [1, 19, 20, 21, 40, 399, 400, 401, 845].map(lkZplCount), small: lkZplGfa([1, 0, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0], 17, 1), len: z.length };
  })())`));
  assert.strictEqual(out.head, '^XA^PW800^LL280^LH0,0^FO0,0^GFA');
  assert.ok(out.tail.endsWith('^FS^PQ1^XZ'), out.tail);
  assert.deepStrictEqual(out.cnt, ['G', 'Y', 'g', 'gG', 'h', 'yY', 'z', 'zG', 'zzhK']);
  assert.strictEqual(out.small, '^GFA,3,3,3,B0HFH0', 'krátký řádek: opakování znaků');
  assert.deepStrictEqual(zplDecode(out.small).rows, ['B0FF00']);
  const d = zplDecode(out.gfa);
  assert.deepStrictEqual([d.bpr, d.h, d.rows.length], [100, 280, 280]);
  const back = d.rows.map(r => r.match(/../g).map(b => parseInt(b, 16).toString(2).padStart(8, '0')).join('').slice(0, 800)).join('');
  assert.strictEqual(back, out.bits, 'kódování a dekódování dá stejný obrázek');
  assert.ok(out.len < 3000, `komprese: ${out.len} znaků místo 56 000`);
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
