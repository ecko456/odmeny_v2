/* ==========================================================================
   KONCE TRESTŮ A SMĚNNOST (2.43): import v Docházce a přehled odchodů po měsících
   ========================================================================== */
const END_SHIFT_OPTS = [['', '— neznám, nechat —'], ['R', 'Stálá ranní'], ['O', 'Stálá odpolední'], ['S1', 'Skupina 1'], ['S2', 'Skupina 2'], ['SICK', 'NEMOC']];
function endBestSheet(sheets) {
  let best = null;
  let score = -1;
  (sheets || []).forEach(sh => { const r = endParse(sh.aoa); const sc = r.rows.filter(x => x.last && x.first && (x.end || x.shift)).length; if (sc > score) { score = sc; best = sh; } });
  return best;
}
function endTableHtml(r, all) {
  const rank = x => (x.issues.some(i => i.l === 'e') ? 0 : x.issues.some(i => i.l === 'w') ? 1 : x.issues.some(i => i.l === 'i') ? 2 : 3);
  const list = r.rows.slice().sort((a, b) => rank(a) - rank(b) || a.n - b.n).filter(x => all || rank(x) < 2);
  const shown = list.slice(0, all ? 400 : 60);
  const tag = l => ({ e: 'end-err', w: 'end-warn', i: 'end-info' }[l]);
  return list.length ? `<div class="table-card flat end-tabwrap"><table class="stack end-tab"><thead><tr><th class="r">Řádek</th><th>Příjmení a jméno</th><th>Konec trestu</th><th>Směnnost</th><th>Kontrola</th></tr></thead><tbody>${shown.map(x => `<tr class="${['end-row-e', 'end-row-w', '', ''][rank(x)]}">
      <td class="r num" data-label="Řádek">${x.n}</td><td data-label="Jméno"><b>${esc(x.last)}</b> ${esc(x.first)}</td>
      <td class="num" data-label="Konec trestu">${x.end ? esc(endDateText(x.end)) : `<span class="muted">${esc(x.endRaw || '—')}</span>`}</td>
      <td data-label="Směnnost">${x.shift ? esc(END_SHIFT_T[x.shift]) : `<span class="muted">${esc(x.shiftRaw || '—')}</span>`}</td>
      <td class="wrap" data-label="Kontrola">${x.issues.length ? x.issues.map(i => `<span class="${tag(i.l)}">${esc(i.t)}</span>`).join('') : '<span class="end-ok">v pořádku</span>'}</td></tr>`).join('')}</tbody></table></div>
      ${list.length > shown.length ? `<p class="tiny muted">… a ${list.length - shown.length} dalších řádků</p>` : ''}`
    : '<p class="small end-ok">Žádný řádek nemá chybu ani upozornění.</p>';
}
async function endImport(file) {
  if (!file) return;
  let sheets;
  try { sheets = await readTable(file); } catch (error) { toast(`Soubor se nepodařilo otevřít: ${error.message}`, true); return; }
  const sheet = endBestSheet(sheets);
  if (!sheet) { toast('V souboru není žádný list.', true); return; }
  const cols = { ...END_COLS };
  const labels = {};
  let ai = null;
  if (ui.me && ui.me.ai) {
    const sample = endAiSample(sheet, cols, Object.values(S.employees));
    toast('AI kontroluje rozložení souboru…');
    try { ai = await Vault.api('ai_ends', { method: 'POST', body: { sheet: sample.sheet, labels: sample.labels } }); } catch (error) { toast(`AI: ${error.message} Kontroluje se jen v aplikaci.`, true); }
    if (ai) {
      Object.assign(cols, ai.cols || {});
      (ai.labels || []).forEach(l => { const k = endKey(l.text); if (endShiftOf(l.text) === null) labels[k] = l.shift; });
    }
  }
  let all = false;
  const parse = () => endParse(sheet.aoa, cols, { labels });
  const body = r => `<div class="stats end-sum">
      ${statTile('Řádků', String(r.sum.rows), r.header ? 'bez řádku s nadpisy' : 'bez nadpisů')}
      ${statTile('Konec trestu', String(r.sum.ends), 'řádků s datem')}
      ${statTile('Směnnost', String(r.sum.shifts), r.sum.sick ? `+ ${r.sum.sick} NEMOC` : 'řádků se směnou')}
      ${statTile('Noví', String(r.sum.fresh), 'v Lidech nejsou')}
      ${statTile('Chyby', String(r.sum.err), r.sum.err ? 'tyhle údaje se nezapíšou' : 'žádné', r.sum.err ? 'crit' : 'good')}
      ${statTile('Upozornění', String(r.sum.warn), 'zkontroluj', r.sum.warn ? 'warn' : '')}</div>
    ${r.unknown.length ? `<div class="note w"><b>Neznámé texty ve směnnosti</b>, přiřaď je, nebo se směna u těch řádků nezmění:<div class="end-labels">${r.unknown.map(u => `<label class="field"><span>„${esc(u.text)}“ (${u.n}×)</span><select data-endl="${esc(endKey(u.text))}">${END_SHIFT_OPTS.map(([k, l]) => `<option value="${k}"${(labels[endKey(u.text)] || '') === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`).join('')}</div></div>` : ''}
    ${endTableHtml(r, all)}
    <label class="check"><input type="checkbox" data-endall${all ? ' checked' : ''}><span>Ukázat všechny řádky (i bez upozornění)</span></label>
    ${r.missing.length ? `<div class="note w end-miss"><b>${r.missing.length} ${lidiN(r.missing.length)} z Lidí v souboru není.</b> Po zapsání se ukážou v tabulce a u každého rozhodneš, jestli ho vyřadit ze seznamu.</div>` : ''}
    ${r.sum.fresh ? `<label class="check"><input type="checkbox" name="add" checked><span>Přidat ${r.sum.fresh} ${r.sum.fresh === 1 ? 'nového člověka' : 'nových lidí'} do Lidí (bez skupiny, zařadíš je potom)</span></label>` : ''}`;
  const first = parse();
  const res = await dialog({
    title: 'Konce trestů a směnnost', ok: 'Zapsat', wide: true,
    html: `<p><b>${esc(file.name)}</b> ${sheets.length > 1 ? `<small class="muted">list ${esc(dvSheetName(sheet))}</small>` : ''} ${ai ? `<span class="tag acc">${I.sparkle} zkontrolováno AI</span>` : ''}</p>
      ${ai ? `<div class="note ${ai.ok ? 'i' : 'w'}">${ai.ok ? '<b>AI: rozložení souboru sedí.</b> ' : '<b>AI: v rozložení něco nesedí.</b> '}${esc(ai.note || '')}</div>` : ''}
      <div class="end-cols">${[['last', 'Příjmení'], ['first', 'Jméno'], ['end', 'Konec trestu'], ['shift', 'Směnnost']].map(([k, l]) => `<label class="field wa-letter${cols[k] !== END_COLS[k] ? ' dv-aichg' : ''}"><span>${l}</span><input data-endc="${k}" value="${esc(cols[k])}" maxlength="3" autocapitalize="characters"></label>`).join('')}</div>
      <div id="endBody">${body(first)}</div>
      <p class="tiny muted">Chybné údaje se nezapíšou, ostatní z řádku ano. Prázdný konec trestu nebo směnnost nic nemaže. NEMOC zapne u člověka nemoc od dneška (směna zůstane), jiná směnnost nemoc vypne.${ai ? ' AI dostala jen nadpisy, typy buněk a texty směnnosti, žádná jména ani data.' : ''}</p>`,
    onOpen: dlg => {
      let tm = 0;
      const redraw = () => { $('#endBody', dlg).innerHTML = body(parse()); };
      dlg.querySelector('.end-cols').addEventListener('input', event => {
        const k = event.target.dataset.endc;
        if (!k) return;
        clearTimeout(tm);
        tm = setTimeout(() => { const v = waLetter(event.target.value); if (v) { cols[k] = v; redraw(); } }, 250);
      });
      $('#endBody', dlg).addEventListener('change', event => {
        const t = event.target;
        if (t.dataset.endl != null) { if (t.value) labels[t.dataset.endl] = t.value; else delete labels[t.dataset.endl]; redraw(); }
        else if (t.matches('[data-endall]')) { all = t.checked; redraw(); }
      });
    },
  });
  if (res.value !== 'ok') return;
  const r = parse();
  const addEl = res.form.elements.namedItem('add');
  const exclude = r.missingP.length ? await endExcludeDialog(r.missingP, file.name) : [];
  const out = endApply(r, { add: !!(addEl && addEl.checked), exclude });
  store.note = { kind: 'person', keep: true, text: `Nahrány konce trestů a směnnost (${file.name}): konec trestu ${out.ends}, směna ${out.shifts}, nemoc ${out.sick}, zpět po nemoci ${out.back}${out.added ? `, nově přidáno ${out.added}` : ''}${out.excluded ? `, vyřazeno ze seznamu ${out.excluded}` : ''}` };
  save();
  renderAll();
  toast(`Zapsáno: konec trestu ${out.ends}, směna ${out.shifts}, nemoc ${out.sick}${out.back ? `, zpět po nemoci ${out.back}` : ''}${out.added ? `, nově ${out.added}` : ''}${out.excluded ? `, vyřazeno ${out.excluded}` : ''}.`);
  showView('konce');
}

/* Lidé z Lidí, kteří v nahraném souboru chybí (2.44.1): tabulka, u každého zaškrtnutí Vyřadit.
   Výchozí nikdo; Zrušit = nikoho nevyřadit (zbytek importu se zapíše tak jako tak).
   Vyřazený zůstane v evidenci a jde vrátit v Lidech. */
async function endExcludeDialog(list, fileName) {
  const rows = list.map(x => `<tr><td class="c" data-label="Vyřadit"><input type="checkbox" name="ex" value="${esc(x.key)}" aria-label="Vyřadit ${esc(x.name)}"></td>
    <td class="name" data-label="Zaměstnanec"><b>${esc(x.name)}</b>${x.wid ? ` <small class="muted num">ID ${esc(x.wid)}</small>` : ''}</td>
    <td data-label="Oddělení">${esc(x.dept)}</td><td class="num" data-label="Konec trestu">${x.end ? esc(endDateText(x.end)) : '<span class="muted">—</span>'}${x.sick ? ' <span class="tag warn">nemoc</span>' : ''}</td></tr>`).join('');
  const res = await dialog({
    title: 'Lidé, kteří v souboru nejsou', ok: 'Vyřadit vybrané', cancel: 'Nikoho nevyřazovat', wide: true,
    html: `<p>V souboru <b>${esc(fileName)}</b> chybí ${list.length} ${lidiN(list.length)} z Lidí. Zaškrtni, koho vyřadit ze seznamu (třeba už odešli). Vyřazený zůstane v evidenci a vrátit ho jde v Lidech.</p>
      <div class="end-exbar"><button class="btn sec small" type="button" data-endex="all">Vybrat všechny</button><button class="btn sec small" type="button" data-endex="none">Zrušit výběr</button><span class="small muted" id="endExN">vybráno 0</span></div>
      <div class="table-card flat end-extab"><table class="stack"><thead><tr><th class="c">Vyřadit</th><th>Zaměstnanec</th><th>Oddělení</th><th>Konec trestu</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    onOpen: dlg => {
      const boxes = () => [...dlg.querySelectorAll('input[name="ex"]')];
      const count = () => { const n = boxes().filter(b => b.checked).length; $('#endExN', dlg).textContent = `vybráno ${n}`; $('#dlgOk').disabled = !n; };
      dlg.querySelector('.end-exbar').addEventListener('click', event => { const b = event.target.closest('[data-endex]'); if (!b) return; boxes().forEach(x => { x.checked = b.dataset.endex === 'all'; }); count(); });
      dlg.querySelector('.end-extab').addEventListener('change', count);
      count();
    },
  });
  $('#dlgOk').disabled = false;
  if (res.value !== 'ok') return [];
  return [...res.form.querySelectorAll('input[name="ex"]:checked')].map(x => x.value);
}

function endWhoHtml(x) {
  return `<li class="end-person"><span class="end-d num">${esc(endDateText(x.end))}</span><span class="nm"><b>${esc(x.name)}</b><small>${esc([x.wid ? `ID ${x.wid}` : '', x.group, x.st !== 'none' ? `${END_ST[x.st].toLowerCase()}${x.pct != null ? ` ${nf(x.pct, 0)} %` : ''}` : '', x.sick ? 'NEMOC' : shiftName(x.shift)].filter(Boolean).join(' · '))}</small></span>
    <span class="end-in ${x.days != null && x.days < 0 ? 'neg' : x.days != null && x.days <= 30 ? 'soon' : ''}">${x.days == null ? '' : x.days < 0 ? `před ${-x.days} d` : x.days === 0 ? 'dnes' : `za ${x.days} d`}</span>
    <button class="icon-btn" type="button" data-endperson="${esc(x.key)}" title="Otevřít v Lidech" aria-label="Otevřít ${esc(x.name)} v Lidech">${I.back}</button></li>`;
}
function renderEnds() {
  const box = $('#endView');
  if (!box || !S) return;
  if (!ui.end) ui.end = { n: 12 };
  const ov = endsOverview(todayIso(), ui.end.n);
  const cell = n => (n ? `<b>${n}</b>` : '<span class="muted">·</span>');
  const anyEnd = ov.head - ov.noEnd.length;
  box.innerHTML = `<div class="t5-weekbar end-bar"><div class="chips" role="group" aria-label="Období">${[[6, '6 měsíců'], [12, '12 měsíců'], [24, '24 měsíců']].map(([k, l]) => `<button type="button" class="chip${ui.end.n === k ? ' on' : ''}" data-endn="${k}" aria-pressed="${ui.end.n === k}">${l}</button>`).join('')}</div>
      <span class="spacer"></span><button class="btn sec" type="button" data-endxlsx>Excel</button><button class="btn" type="button" data-endpdf${anyEnd ? '' : ' disabled'}>PDF</button></div>
    <div class="stats">${statTile('Teď lidí', String(ov.head), `${anyEnd} s datem konce`)}
      ${statTile('Odchází tento měsíc', String(ov.thisMonth), monthLabel(ov.months[0].m), ov.thisMonth ? 'warn' : '')}
      ${statTile('Do 3 měsíců', String(ov.next3), ov.months.slice(0, 3).map(x => `${monthLabel(x.m).split(' ')[0]} ${x.total}`).join(' · '))}
      ${statTile(`Za ${ov.months.length} měsíců`, String(ov.leaving), `zůstane ${ov.head - ov.overdue.length - ov.leaving}`)}
      ${statTile('Po termínu', String(ov.overdue.length), ov.overdue.length ? 'konec trestu už minul' : 'nikdo', ov.overdue.length ? 'crit' : 'good')}
      ${statTile('Bez data', String(ov.noEnd.length), ov.noEnd.length ? 'nahraj tabulku v Docházce' : 'všichni mají datum', ov.noEnd.length ? 'warn' : '')}</div>
    ${anyEnd ? catBars(ov.depts.map(d => { const gone = d.overdue + d.leave.reduce((a, b) => a + b, 0); return { name: d.name, share: gone, v: d.head ? gone / d.head : 0, text: `${gone} z ${d.head}`, sub: `zůstane ${d.remain[d.remain.length - 1]}` }; }),
      { title: 'Kdo odchází po odděleních', sub: `Odchody za ${ov.months.length} měsíců včetně lidí po termínu; délka pruhu = podíl z dnešního počtu lidí oddělení.`, shareText: 'Podíl odchodů po odděleních' }) : ''}
    ${!anyEnd ? `<div class="note w">Zatím nikdo nemá konec trestu. Nahraj tabulku (A příjmení, B jméno, C konec trestu, D směnnost) tlačítkem nahoře nebo v Docházce.</div>` : ''}
    <div class="card"><h3>Odchody po měsících a odděleních</h3><p class="small muted">Počet lidí, kterým v daném měsíci končí trest. Zůstane = dnešní počet bez lidí po termínu a bez odchodů do konce vybraného období.</p>
      <div class="table-card flat end-gridwrap"><table class="end-grid"><thead><tr><th>Oddělení</th><th class="r">Teď</th><th class="r">Zůstane</th>${ov.overdue.length ? '<th class="r">Po termínu</th>' : ''}${ov.months.map(x => `<th class="r">${esc(monthLabel(x.m).replace(/ (\d{4})$/, ' ’$1').replace(/’(\d\d)(\d\d)$/, '’$2'))}</th>`).join('')}<th class="r">Později</th></tr></thead><tbody>
        ${ov.depts.map(d => `<tr><th scope="row">${esc(d.name)}</th><td class="r num">${d.head}</td><td class="r num end-rem"><b>${d.remain[d.remain.length - 1]}</b></td>${ov.overdue.length ? `<td class="r num end-od">${cell(d.overdue)}</td>` : ''}${d.leave.map(n => `<td class="r num${n ? ' end-hit' : ''}">${cell(n)}</td>`).join('')}<td class="r num">${cell(d.later)}</td></tr>`).join('')}
        <tr class="end-tot"><th scope="row">Celkem</th><td class="r num">${ov.head}</td><td class="r num end-rem"><b>${ov.head - ov.overdue.length - ov.leaving}</b></td>${ov.overdue.length ? `<td class="r num">${ov.overdue.length}</td>` : ''}${ov.months.map(x => `<td class="r num">${x.total || '·'}</td>`).join('')}<td class="r num">${ov.later.length || '·'}</td></tr>
      </tbody></table></div></div>
    ${ov.overdue.length ? `<div class="card end-month"><h3>Po termínu <span class="tag warn">${ov.overdue.length}</span></h3><p class="small muted">Konec trestu už minul, ale v Lidech jsou pořád aktivní. Vyřaď je, nebo oprav datum.</p><ul class="end-list">${ov.overdue.map(endWhoHtml).join('')}</ul></div>` : ''}
    ${ov.months.filter(x => x.total).map(x => `<div class="card end-month"><h3>${esc(monthLabel(x.m))} <span class="tag">${x.total} ${lidiN(x.total)}</span></h3>
      ${ov.depts.filter(d => x.byDept[d.name].length).map(d => `<h4>${esc(d.name)} <small class="muted">${x.byDept[d.name].length} z ${d.head}</small></h4><ul class="end-list">${x.byDept[d.name].map(endWhoHtml).join('')}</ul>`).join('')}</div>`).join('')}
    ${ov.noEnd.length ? `<details class="card end-month"><summary><b>Bez data konce trestu</b> <span class="tag">${ov.noEnd.length}</span></summary><p class="small">${ov.noEnd.map(x => esc(x.name)).join(', ')}</p></details>` : ''}`;
  setWidths(box);
}
async function exportEndsXlsx() {
  const ov = endsOverview(todayIso(), (ui.end && ui.end.n) || 12);
  try {
    const X = await xlsx();
    const wb = X.utils.book_new();
    endsSheets(ov).forEach(sheet => { const ws = X.utils.aoa_to_sheet(sheet.rows.map(row => row.map(safeCell))); X.utils.book_append_sheet(wb, ws, sheet.name); });
    downloadFile(`konce-trestu-${ov.today}.xlsx`, new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch (error) { toast(`Export se nepovedl: ${error.message}`, true); }
}
/* ---------- PDF Konců trestů (2.45.2): A4 na výšku, graficky; bez jmen, jen ID ----------
   1. strana: dlaždice, kdo odchází a kdo zůstane podle zkušenosti (zaškolení / v zácviku /
   bez skupiny), odchody po měsících, oddělení. Další strany: seznam odchodů s ID. */
const END_ST_C = [['ok', 'blue', 'Zaškolení'], ['tr', 'amberF', 'V zácviku'], ['none', '#C3CAD4', 'Bez skupiny']];
const END_ST_INK = { ok: '#FFFFFF', tr: '#1A2330', none: '#1A2330' };
function endPdfBar(P, st, x, y, w, h, unit) {
  let cx = x;
  END_ST_C.forEach(([k, c]) => {
    const n = st[k] || 0;
    if (!n) return;
    const bw = n * unit;
    P.box(cx, y, bw, h, { fill: c });
    if (bw >= 30 && h >= 22) P.text(String(n), cx + bw / 2, y + h / 2 + 6, Math.min(17, h - 6), { b: true, mono: true, c: END_ST_INK[k], a: 'middle' });
    cx += bw;
  });
}
function endsPdf(P, ov) {
  const X = 64, W = 1152, R = X + W;
  const sum = o => o.ok + o.tr + o.none;
  P.text(`${EXPORT_NAME} · KONCE TRESTŮ`, X, 78, 13, { b: true, c: 'faint', ls: 0.12 });
  P.text(dayText(ov.today), R, 78, 13, { c: 'faint', a: 'end', mono: true });
  P.text('Konce trestů', X, 136, 44, { b: true });
  P.text(`odchody na ${ov.months.length} měsíců podle zkušenosti · zaškolený = aspoň ${ov.lim} % dovedností skupiny`, X, 170, 15, { c: 'muted' });
  P.line(X, 194, R, 194, 'line', 1.5);
  // dlaždice
  const stay = ov.head - ov.overdue.length - ov.leaving;
  const tiles = [
    ['TEĎ LIDÍ', String(ov.head), 'ink'], ['TENTO MĚSÍC', String(ov.thisMonth), ov.thisMonth ? 'amber' : 'ink'],
    ['DO 3 MĚSÍCŮ', String(ov.next3), 'ink'], [`ZA ${ov.months.length} MĚSÍCŮ`, String(ov.leaving), 'ink'],
    ['PO TERMÍNU', String(ov.overdue.length), ov.overdue.length ? 'red' : 'green'],
  ];
  const TW = (W - 4 * 16) / 5, top = 218;
  tiles.forEach(([l, v, c], i) => {
    const x = X + i * (TW + 16);
    P.box(x, top, TW, 116, { fill: '#F7F9FC', stroke: 'line', r: 14 });
    P.text(l, x + 20, top + 32, 12, { b: true, c: 'muted', ls: 0.1 });
    P.text(v, x + 20, top + 90, 46, { b: true, mono: true, c });
  });
  // kdo odchází a kdo zůstane: 100% pruhy
  let y = 392;
  P.text('Kdo odchází a kdo zůstane', X, y, 20, { b: true });
  y += 22;
  const rows = [['Odchází', ov.st.gone, `${sum(ov.st.gone)} ${lidiN(sum(ov.st.gone))} (i po termínu)`], ['Zůstane', ov.st.stay, `${stay} ${lidiN(stay)}`]];
  const BX = X + 150, BW = W - 150 - 250;
  rows.forEach(([l, st, sub]) => {
    const n = sum(st);
    P.text(l, X, y + 38, 18, { b: true });
    P.box(BX, y + 12, BW, 40, { fill: 'track', r: 4 });
    if (n) endPdfBar(P, st, BX, y + 12, BW, 40, BW / n);
    const okShare = n ? Math.round((st.ok / n) * 100) : 0;
    P.text(n ? `${okShare} % zaškolených` : '—', R, y + 32, 16, { b: true, a: 'end', c: n ? 'blue' : 'faint' });
    P.text(sub, R, y + 52, 13, { a: 'end', c: 'muted' });
    y += 68;
  });
  // legenda
  let lx = X;
  END_ST_C.forEach(([, c, l]) => { P.box(lx, y + 4, 18, 18, { fill: c, r: 4 }); P.text(l, lx + 26, y + 19, 14, { c: 'muted' }); lx += 26 + P.width(l, 14) + 30; });
  y += 70;
  // po měsících
  P.text('Odchody po měsících', X, y, 20, { b: true });
  const cols = [...(ov.overdue.length ? [{ t: 'po', y: 'termínu', st: ov.st.overdue, n: ov.overdue.length, od: true }] : []),
    ...ov.months.map((m, i) => { const t = cpMonthShort(m.m, i === 0); return { t: t.t, y: t.y, st: m.st, n: m.total }; })];
  const CH = 300, base = y + 50 + CH, cw = W / cols.length;
  const maxN = Math.max(1, ...cols.map(c => c.n));
  const unit = (CH - 34) / maxN, bw = Math.min(54, cw * 0.62);
  for (let v = 0; v <= maxN; v += Math.max(1, Math.ceil(maxN / 4))) {
    const gy = base - v * unit;
    if (v) P.line(X, gy, R, gy, 'grid', 1);
  }
  P.line(X, base, R, base, 'axis', 1.5);
  cols.forEach((c, i) => {
    const cx = X + cw * (i + 0.5);
    let yy = base;
    END_ST_C.forEach(([k, col]) => { const n = c.st[k] || 0; if (!n) return; P.box(cx - bw / 2, yy - n * unit, bw, n * unit, { fill: col }); yy -= n * unit; });
    if (c.n) P.text(String(c.n), cx, yy - 10, 16, { b: true, mono: true, c: c.od ? 'red' : 'ink', a: 'middle' });
    P.text(c.t, cx, base + 26, 14, { b: !!c.n, c: c.od ? 'red' : c.n ? 'ink' : 'faint', a: 'middle' });
    if (c.y) P.text(c.y, cx, base + 44, 11, { c: c.od ? 'red' : 'faint', a: 'middle' });
  });
  y = base + 100;
  // oddělení: celý pruh = lidé teď, barevně odcházející, šedě kdo zůstane
  P.text('Oddělení', X, y, 20, { b: true });
  P.text('pruh = lidé teď · barevně odcházející podle zkušenosti', R, y, 13, { c: 'muted', a: 'end' });
  y += 24;
  const depts = ov.depts.filter(d => d.head);
  const maxH = Math.max(1, ...depts.map(d => d.head));
  const rh = Math.max(34, Math.min(56, (P.PH - 120 - y) / Math.max(1, depts.length)));
  const bh = Math.min(28, rh - 12), DX = X + 250, DW = W - 250 - 200;
  depts.forEach(d => {
    const cy = y + rh / 2;
    P.text(P.split(d.name, 17, 236, { b: true })[0], X, cy + 6, 17, { b: true });
    P.box(DX, cy - bh / 2, d.head * (DW / maxH), bh, { fill: '#E6EAF0', r: 3 });
    endPdfBar(P, d.goneSt, DX, cy - bh / 2, DW / maxH, bh, DW / maxH);
    const g = sum(d.goneSt);
    P.text(g ? `−${g} z ${d.head}` : `0 z ${d.head}`, R, cy, 17, { b: true, mono: true, a: 'end', c: g ? 'ink' : 'green' });
    P.text(`zůstane ${d.remain[d.remain.length - 1]}`, R, cy + 18, 12, { a: 'end', c: 'muted' });
    y += rh;
  });
  // seznam odchodů na dalších stranách: jen ID
  const list = [...ov.overdue, ...ov.months.flatMap(m => m.people)];
  if (!list.length) return;
  const head = [['KONEC', 0], ['ID', 170], ['ODDĚLENÍ', 330], ['SKUPINA', 610], ['ZKUŠENOST', 870], ['ZA DNÍ', W]];
  let yy = 0;
  const page = first => {
    P.doc.addPage('a4', 'portrait');
    P.text(`${EXPORT_NAME} · KONCE TRESTŮ`, X, 78, 13, { b: true, c: 'faint', ls: 0.12 });
    P.text(first ? 'Kdo odchází' : 'Kdo odchází — pokračování', X, 130, 30, { b: true });
    yy = 180;
    head.forEach(([h, dx], i) => P.text(h, X + dx, yy, 12, { b: true, c: 'muted', ls: 0.08, a: i === head.length - 1 ? 'end' : undefined }));
    P.line(X, yy + 12, R, yy + 12, 'ink', 1.5);
    yy += 44;
  };
  page(true);
  let lastM = '';
  list.forEach(x => {
    const m = x.end < ov.today ? 'po termínu' : ctrCap(monthLabel(x.end.slice(0, 7)));
    if (yy + (m !== lastM ? 70 : 36) > P.PH - 90) { page(false); lastM = ''; }
    if (m !== lastM) { P.text(m, X, yy + 4, 16, { b: true, c: x.end < ov.today ? 'red' : 'ink' }); yy += 34; lastM = m; }
    const [, c] = END_ST_C.find(([k]) => k === x.st);
    P.text(endDateText(x.end), X, yy, 15, { mono: true });
    P.text(x.wid ? `ID ${x.wid}` : 'bez ID', X + 170, yy, 15, { mono: true, c: x.wid ? 'ink' : 'faint' });
    P.text(P.split(x.dept, 15, 260)[0], X + 330, yy, 15);
    P.text(P.split(x.group || '—', 15, 240)[0], X + 610, yy, 15, { c: x.group ? 'ink' : 'faint' });
    P.box(X + 870, yy - 13, 14, 14, { fill: c, r: 3 });
    P.text(`${END_ST[x.st]}${x.pct != null ? ` · ${nf(x.pct, 0)} %` : ''}`, X + 894, yy, 15);
    P.text(x.days < 0 ? `před ${-x.days}` : String(x.days), R, yy, 15, { mono: true, a: 'end', c: x.days < 0 ? 'red' : 'ink' });
    P.line(X, yy + 12, R, yy + 12, 'grid', 1);
    yy += 36;
  });
}
async function exportEndsPdf(button) {
  const ov = endsOverview(todayIso(), (ui.end && ui.end.n) || 12);
  if (ov.head === ov.noEnd.length) { toast('Zatím nikdo nemá konec trestu.', true); return; }
  await withPdf(button, doc => {
    doc.setProperties({ title: 'Konce trestů', creator: EXPORT_NAME });
    const P = ctrPdf(doc);
    endsPdf(P, ov);
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i += 1) {
      doc.setPage(i);
      P.text(`${EXPORT_NAME} · Konce trestů · stav k ${dayText(ov.today)}`, 64, P.PH - 30, 11, { c: 'faint' });
      P.text(`${i} / ${n}`, 1216, P.PH - 30, 11, { c: 'faint', a: 'end' });
    }
    downloadFile(`konce-trestu-${ov.today}.pdf`, doc.output('blob'), 'application/pdf');
  }, 'portrait', { mono: true });
}
function bindEnds() {
  const pick = () => $('#endFile').click();
  $('#btnEnds').onclick = pick;
  $('#btnEnds2').onclick = pick;
  $('#endFile').onchange = event => { const f = event.target.files[0]; event.target.value = ''; endImport(f); };
  $('#endView').addEventListener('click', event => {
    const t = event.target;
    let b;
    if ((b = t.closest('[data-endn]'))) { ui.end.n = +b.dataset.endn; renderEnds(); return; }
    if (t.closest('[data-endxlsx]')) { exportEndsXlsx(); return; }
    if ((b = t.closest('[data-endpdf]'))) { exportEndsPdf(b); return; }
    if ((b = t.closest('[data-endperson]'))) { ui.selPerson = b.dataset.endperson; ui.personOpen = true; ui.listY = 0; showView('lide'); renderPeople(); }
  });
}

