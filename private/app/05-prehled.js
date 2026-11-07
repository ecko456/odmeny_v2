/* ==========================================================================
   PŘEHLED
   ========================================================================== */
const SUMF = (rows, f) => rows.reduce((x, r) => x + (+f(r) || 0), 0);

function ovColumns() {
  const c = [
    { k: 'rank', t: '#', cls: 'rank', cell: (r, i) => i + 1 },
    { k: 'name', t: 'Zaměstnanec', sort: true, cls: 'name',
      cell: r => `<div class="who"><b>${esc(r.e.last)} ${esc(r.e.first)}</b><span class="pos">${r.pos ? esc(r.pos.name) : '<span class="crit">nezařazen</span>'}${r.att && r.att.fridays ? ` · <span title="Odpolední směna v pátek je zkrácená: ${nf(friShift())} h = celá směna">pá ${nf(friShift())} h ×${r.att.fridays}</span>` : ''}${r.p && r.att && !r.att.found ? ' · bez docházky' : ''}</span></div>`,
      foot: rows => `<b>Celkem ${rows.length} lidí</b>` },
    { k: 'days', t: 'Dny', sort: true, cls: 'r', hint: 'Odpracované všední dny',
      cell: r => (r.att && r.att.found ? `<span class="num">${r.att.workDays}</span>` : '<span class="muted">—</span>'),
      foot: rows => `<span class="num">${SUMF(rows, r => (r.att ? r.att.workDays : 0))}</span>` },
    { k: 'hours', t: 'Hodiny', sort: true, cls: 'r', hint: 'Odpracované hodiny celkem včetně víkendů',
      cell: r => (r.att && r.att.found ? `<span class="num">${nf(r.att.totalHours)}</span>` : '<span class="muted">—</span>'),
      foot: rows => `<span class="num">${nf(SUMF(rows, r => (r.att ? r.att.totalHours : 0)))}</span>` },
    { k: 'wk', t: 'Víkend', sort: true, cls: 'r', hint: 'Odpracované víkendové a sváteční směny',
      cell: r => (!(r.att && r.att.found) ? '<span class="muted">—</span>' : r.att.wkDays ? `<span class="tag wk">${r.att.wkDays}×</span>` : '<span class="muted num">0</span>'),
      foot: rows => `<span class="num">${SUMF(rows, r => (r.att ? r.att.wkDays : 0))}</span>` },
    { k: 'kafe', t: 'Kafe', sort: true, cls: 'c', hint: 'Splnil minimální počet hodin',
      cell: r => kafeCell(r),
      foot: rows => { const n = rows.filter(r => r.kafe).length; return n ? `<span class="num">${n}×</span>` : ''; } },
    { k: 'lvl', t: 'Dovednosti', sort: true, hint: 'Průměr dovedností ve skupině (každá úroveň 25 %) a tabáky za ně',
      cell: r => (r.L.pct != null || r.L.n ? `<span class="lvlcell" title="${esc(r.L.pct != null ? `Průměr dovedností ${nf(r.L.pct, 1)} % z maxima ${+r.pos.maxTab || 0}` : r.L.lv.name)}"><span class="lvl l${r.L.n}">${r.L.n}</span><span class="lvlname">${esc(r.L.pct != null ? `${nf(r.L.pct, 0)} %` : r.L.lv.name)}</span>${r.kafeOnly ? '' : `<b class="num">${r.L.base}</b>`}</span>` : `<span class="muted small">${r.pos ? (r.L.legacy ? 'bez úrovně' : 'bez dovedností') : '—'}</span>`),
      foot: rows => `<span class="num">${SUMF(rows, r => r.L.base)}</span>` },
  ];
  const unmatched = prodPeriod() ? prodUnmatched().length : 0;
  if (prodPeriod()) c.push({ k: 'prod', t: 'Ø ks/den', sort: true, cls: 'r', hint: 'Vyrobené kusy dělené odpracovanými dny z docházky',
    cell: r => {
      if (!r.prod) return unmatched ? `<button class="warnbtn" type="button" data-pairopen="${esc(r.e.key)}" title="Nespárováno s evidencí práce, kliknutím přiřadíš jméno">!</button>` : '<span class="muted" title="V evidenci práce za tenhle měsíc nemá žádný záznam">—</span>';
      const a = avgPerDay(r.prod, r.att);
      return a == null ? `<span class="muted" title="${esc(avgTitle(r.prod, r.att))}">—</span>` : `<span class="num" title="${esc(avgTitle(r.prod, r.att))}">${nf(a, 1)}</span>`;
    },
    foot: rows => { const t = SUMF(rows, r => (r.prod ? r.prod.total : 0)); const d = SUMF(rows, r => (r.prod ? workedDays(r.att) : 0)); return d ? `<span class="num">${nf(t / d, 1)}</span>` : ''; } });
  c.push(
    { k: 'att', t: 'Docházka', sort: true, cls: 'r', hint: 'Automatická srážka nebo bonus podle pravidel skupiny, nejvýš do stropu',
      cell: r => (r.lost ? `<span class="losttag" title="${esc(attExplain(r))}">bez nároku</span>` : deltaCell(r.attEff, attExplain(r)) + (r.capped ? `<span class="captag" title="${esc(`Zastropováno na strop ${r.max}`)}">max</span>` : '')),
      foot: rows => { const v = SUMF(rows, r => r.attEff); return v ? deltaCell(v, '') : ''; } },
    { k: 'pen', t: 'Sankce', sort: true, cls: 'r', hint: 'Srážky z nároku za vybraný měsíc (10 / 30 / 50 %)',
      cell: r => ((r.pctSum || r.legacy) ? `<span class="pen" title="${esc(`${reasonsOf(r.e.key)} → −${r.pen} ${tabW(r.pen)}`)}">${r.pctSum ? `−${r.pctSum} %` : ''}</span> <span class="muted small num">(−${r.pen})</span>` : '<span class="muted num">0</span>'),
      foot: rows => { const v = SUMF(rows, r => r.pen); return v ? `<span class="pen">−${v}</span>` : ''; } },
    { k: 'adj', t: 'Ruční úprava', cls: 'c', hint: 'Přidat nebo ubrat tabáky nad rámec výpočtu',
      cell: r => (r.kafeOnly ? '<span class="muted">—</span>' : adjCtrl(r)),
      foot: rows => { const v = SUMF(rows, r => r.adj); return v ? `<span class="num">${sgn(v)}</span>` : ''; } },
    { k: 'score', t: 'Tabáky', sort: true, cls: 'score', hint: 'Dovednosti ± docházka (nejvýš do stropu) − sankce ± ruční úprava',
      cell: r => (r.kafeOnly ? `<span class="onlykafe" title="${esc(`Skupina ${r.pos.name} nemá tabáky, hodnotí se jen Kafe`)}">jen Kafe</span>` : meter(r.max ? r.total / r.max : 0, `<b>${nf(r.total, 0)}</b> <small>/ ${nf(r.max, 0)}</small>`)),
      foot: rows => `<b class="num">${nf(SUMF(rows, r => r.total), 0)} ${tabW(SUMF(rows, r => r.total))}</b>` },
    ...(S.positions.some(normCutRule) ? [{ k: 'ncut', t: 'Srážka ze mzdy', sort: true, cls: 'r', hint: 'Srážka ze mzdy za neproduktivitu podle plnění normy skupiny (benefity nekrátí)',
      cell: r => ncutCell(r),
      foot: rows => { const n = rows.filter(r => r.ncut && r.ncut.pct).length; return n ? `<span class="num pen" title="Lidí se srážkou ze mzdy za neproduktivitu">${n}×</span>` : ''; } }] : []),
    ...(S.positions.some(hasRaise) ? [{ k: 'raise', t: 'Prémie', sort: true, cls: 'r', hint: 'Nejvyšší splněná varianta prémie skupiny za měsíc a navýšení mzdy',
      cell: r => raiseCell(r),
      foot: rows => { const n = rows.filter(r => r.tier.lvl > 0).length; return n ? `<span class="num" title="Lidí s prémií">${n}×</span>` : ''; } }] : []),
    { k: 'iss', t: 'Výdej', sort: true, cls: 'c', hint: 'Potvrzení, že byl benefit vydán',
      cell: r => issueCell(r),
      foot: rows => { const n = rows.filter(r => r.issued).length; const of = rows.filter(r => r.toIssue || r.issued).length; return of ? `<span class="num">${n} / ${of}</span>` : ''; } },
  );
  return c;
}

function issueCell(r) {
  if (!r.p) return '<span class="muted">—</span>';
  const k = esc(r.e.key);
  if (r.issued) {
    const was = issueWhat(r.issued.tabaky, r.issued.kafe);
    return `<span class="issued-box"><span class="issued" title="${esc(`Vydáno ${new Date(r.issued.at).toLocaleString('cs-CZ')}: ${was}`)}">${I.check}vydáno <small>${shortDate(r.issued.at)}</small></span>${r.issuedChanged ? `<span class="chgtag" title="${esc(`Od výdeje se hodnocení změnilo: vydáno ${was}, teď ${issueWhat(r.total, r.kafe)}`)}">změna</span>` : ''}<button class="linkbtn" type="button" data-unissue="${k}" title="Zrušit potvrzení výdeje">zrušit</button></span>`;
  }
  if (!r.toIssue) return '<span class="muted small">nic k výdeji</span>';
  return `<button class="issuebtn" type="button" data-issue="${k}" title="${esc(`Potvrdit, že dostal ${issueWhat(r.total, r.kafe)}`)}">Potvrdit výdej</button>`;
}

async function handleExcludeClick(event) {
  const button = event.target.closest('[data-exclude],[data-include]');
  if (!button) return false;
  if (button.dataset.exclude) {
    if (!(await confirmBox('Vyřadit ze seznamu?', `${nameOf(button.dataset.exclude)} se přestane hodnotit. Data zůstanou a vrátit ho jde v části Lidé.`, 'Vyřadit'))) return true;
    setExcluded(button.dataset.exclude, true);
  } else {
    setExcluded(button.dataset.include, false);
  }
  return true;
}

function setExcluded(key, on) {
  const e = S.employees[key];
  if (!e) return;
  if (on) e.excluded = true; else delete e.excluded;
  save();
  renderAll();
  toast(on ? `${e.last} ${e.first} je vyřazen ze seznamu. Vrátit jde v části Lidé.` : `${e.last} ${e.first} je zpátky v seznamu.`);
}

async function handleIssueClick(event) {
  const button = event.target.closest('[data-issue],[data-unissue]');
  if (!button) return false;
  if (button.dataset.issue) {
    const r = allRows().find(x => x.e.key === button.dataset.issue);
    if (!r) return true;
    setIssued(r.e.key, { at: Date.now(), tabaky: r.total, kafe: r.kafe, pos: r.e.positionId || undefined, lvl: r.e.level || undefined,
      pct: r.L.pct != null ? r.L.pct : undefined, tier: isGroup(r.pos) ? r.tier.lvl : undefined, raise: isGroup(r.pos) && r.tier.lvl ? r.tier.pct : undefined });
    renderAll();
    toast(`${nameOf(r.e.key)}: vydáno ${issueWhat(r.total, r.kafe)}.`);
  } else {
    const key = button.dataset.unissue;
    if (!(await confirmBox('Zrušit potvrzení výdeje?', `U ${nameOf(key)} se výdej znovu ukáže jako nevydaný.`, 'Zrušit potvrzení'))) return true;
    setIssued(key, null);
    renderAll();
    toast('Potvrzení výdeje zrušeno.');
  }
  return true;
}

const LOCKED_COLS = ['rank', 'name', 'score'];
function visibleColumns() {
  const hidden = new Set(P.hiddenCols || []);
  return ovColumns().filter(c => LOCKED_COLS.includes(c.k) || !hidden.has(c.k));
}

function renderColPicker() {
  const hidden = new Set(P.hiddenCols || []);
  const optional = ovColumns().filter(c => !LOCKED_COLS.includes(c.k));
  const count = optional.filter(c => hidden.has(c.k)).length;
  $('#colSum').textContent = `Sloupce${count ? ` (${count} skryté)` : ''}`;
  $('#colPanel').innerHTML = `<p class="eyebrow">Zobrazit v přehledu</p>${optional.map(c => `<label class="colopt"><input type="checkbox" data-col="${esc(c.k)}"${hidden.has(c.k) ? '' : ' checked'}><span>${esc(c.t)}</span></label>`).join('')}
    <p class="tiny muted">Jméno a Tabáky jsou vidět vždy. Výběr platí jen pro tvou kartičku; export do Excelu obsahuje všechny sloupce.</p>
    <div class="row"><button class="btn ghost small" type="button" id="colAll">Zobrazit vše</button><button class="btn ghost small" type="button" id="colCompact" title="Skryje Dny, Víkend, Úroveň a Ø ks/den">Úsporné</button></div>`;
  $$('#colPanel [data-col]').forEach(box => {
    box.onchange = () => {
      const set = new Set(P.hiddenCols || []);
      if (box.checked) set.delete(box.dataset.col); else set.add(box.dataset.col);
      setPref({ hiddenCols: [...set] });
      renderOverview();
    };
  });
  $('#colAll').onclick = () => { setPref({ hiddenCols: [] }); renderOverview(); };
  $('#colCompact').onclick = () => { setPref({ hiddenCols: ['days', 'wk', 'lvl', 'prod'] }); renderOverview(); };
}

function deltaCell(v, title) {
  const t = title ? ` title="${esc(title)}"` : '';
  if (v > 0) return `<span class="dplus"${t}>+${v}</span>`;
  if (v < 0) return `<span class="pen"${t}>−${Math.abs(v)}</span>`;
  return `<span class="muted num"${t}>0</span>`;
}

function kafeCell(r) {
  if (!(r.att && r.att.found)) return '<span class="muted">—</span>';
  if (r.lost) return `<span class="kafe-no" title="${esc(attExplain(r))}">—</span>`;
  const t = `${nf(r.att.totalHours)} h z ${nf(r.kafeTh)} h`;
  return r.kafe ? `<span class="kafe-ok" title="${esc(`Splněno: ${t}`)}" aria-label="Kafe splněno">${I.kafe}</span>` : `<span class="kafe-no" title="${esc(`Chybí ${nf(r.kafeTh - r.att.totalHours)} h (${t})`)}">—</span>`;
}

function ovData() {
  const q = norm($('#ovSearch').value);
  const position = S.positions.some(p => p.id === P.pos) ? P.pos : '';
  let rows = activeRows();
  if (P.onlyImported && curPeriod()) rows = rows.filter(r => r.att && r.att.found);
  if (P.onlyOpen) rows = rows.filter(r => (r.toIssue && !r.issued) || r.issuedChanged);
  if (position) rows = rows.filter(r => r.e.positionId === position);
  if (q) rows = rows.filter(r => norm(`${r.e.last} ${r.e.first}`).includes(q));
  const { k, dir } = P.sort;
  const val = r => ({
    name: norm(`${r.e.last} ${r.e.first}`), days: r.att ? r.att.workDays : -1, hours: r.att ? r.att.totalHours : -1,
    wk: r.att ? r.att.wkDays : -1, kafe: r.kafe ? 1 : 0, lvl: (r.L.pct != null ? r.L.pct : r.L.n * 25) * 1000 + r.L.base, att: r.attEff,
    prod: r.prod ? (avgPerDay(r.prod, r.att) ?? -0.5) : -1, pen: r.pctSum * 1000 + r.pen, score: r.total, adj: r.adj,
    iss: r.issued ? (r.issuedChanged ? 1 : 2) : (r.toIssue ? 0 : -1),
    raise: r.tier.lvl * 1000 + r.tier.pct,
    ncut: r.ncut ? r.ncut.pct * 10 + (r.ncut.done ? 0 : 1) : -1,
  }[k]);
  rows.sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (typeof x === 'string') return dir * x.localeCompare(y, 'cs');
    return dir * (x - y) || norm(a.e.last).localeCompare(norm(b.e.last), 'cs');
  });
  return rows;
}

function renderTodo(all) {
  const items = [];
  if (!Object.keys(S.periods).length) items.push(['Nahraj docházku', 'Bez ní se nespočítají dny, víkendy ani Kafe.', 'dochazka']);
  const noPos = all.filter(r => !r.pos).length;
  const noSkills = [...new Set(all.filter(r => r.pos && isGroup(r.pos) && !groupSkills(r.pos).length).map(r => r.pos.name))];
  const legacy = legacyPending();
  if (noPos) items.push([`Zařaď ${noPos} ${noPos === 1 ? 'člověka' : 'lidí'} do skupiny`, 'Bez skupiny nemají tabáky za dovednosti.', 'lide']);
  if (noSkills.length) items.push([`Doplň dovednosti ${noSkills.length === 1 ? `ve skupině ${noSkills[0]}` : `v ${noSkills.length} skupinách`}`, 'Skupina bez dovedností nedává tabáky.', 'pozice']);
  if (legacy) items.push([`Zkontroluj převod ${legacy} ${legacy === 1 ? 'člověka' : 'lidí'} z verze 2.3`, 'U člověka je okno s původní pozicí a úrovní; po kontrole ho smaž.', 'lide']);
  const unmatched = prodPeriod() ? prodUnmatched().length : 0;
  if (unmatched) items.push([`Spáruj ${unmatched} ${jmenW(unmatched)} z výroby`, 'Jména z evidence práce, která nesedí na nikoho v hodnocení.', 'vyroba']);
  $('#todo').innerHTML = items.length && !S.demo ? `<div class="todo"><p class="eyebrow">Co zbývá udělat</p><div class="todo-list">${items.map(([title, text, view]) => `<button type="button" class="todo-item" data-go="${view}"><span><b>${esc(title)}</b><small>${esc(text)}</small></span>${I.arrow}</button>`).join('')}</div></div>` : '';
}

/* Tabáky a Kafe za předchozí měsíc s docházkou (štítek trendu v souhrnu, 2.59). Výsledek se drží,
   dokud se nezmění data (store.base) nebo vybrané období. */
let _ovPrev = null;
function ovPrevTotals() {
  const ids = Object.keys(S.periods || {}).sort();
  const i = ids.indexOf(S.current);
  if (i <= 0) return null;
  const id = ids[i - 1];
  const sig = `${id}|${store.rev}|${S.log ? S.log.length : 0}`;
  if (_ovPrev && _ovPrev.sig === sig) return _ovPrev.v;
  let v = null;
  try {
    v = withPeriod(id, () => { const rows = activeRows(); return { tab: SUMF(rows, r => r.total), kafe: rows.filter(r => r.kafe).length }; });
    v.name = periodName(S.periods[id]);
  } catch (error) { v = null; }
  _ovPrev = { sig, v };
  return v;
}
function renderOverview() {
  const p = curPeriod();
  const sort = visibleColumns().some(c => c.k === P.sort.k) ? P.sort : { k: 'score', dir: -1 };
  if (sort !== P.sort) P.sort = sort;
  const select = $('#ovPos');
  select.innerHTML = posOptions(P.pos, 'Všechny skupiny');
  select.value = S.positions.some(p => p.id === P.pos) ? P.pos : '';
  $('#ovOnlyImported').checked = P.onlyImported;
  $('#ovOnlyOpen').checked = P.onlyOpen;
  $('#ovFilterDot').hidden = !(select.value || !P.onlyImported || P.onlyOpen);   // na telefonu jsou filtry schované
  $('#ovTitle').textContent = p ? periodName(p) : 'Zatím bez docházky';
  const meta = p ? periodMeta(p) : null;
  $('#ovLede').innerHTML = p
    ? `Pracovních dnů ${meta.work}, fond ${nf(meta.fund)} h (směna ${nf(S.settings.shift)} h), sobot ${meta.sats}${meta.hols ? `, svátků ve všední den ${meta.hols}` : ''}. Tabáky = dovednosti ± docházka − sankce ± ruční úprava.${cutoffDays() ? ` Od ${cutoffDays()} dní absence bez nároku na tabák i kafe.` : ''}`
    : 'Nahraj docházku v části <b>Docházka</b>. Zařazení do skupin a hodnocení dovedností zůstává uložené napříč měsíci.';

  $('#kafeCtl').hidden = !p;
  if (p) {
    const input = $('#kafeTh');
    if (document.activeElement !== input) input.value = n2(kafeThreshold(p));
    $('#kafeHint').textContent = kafeIsCustom(p) ? `vlastní práh, fond je ${nf(meta.fund)} h` : '= měsíční fond';
    $('#kafeReset').hidden = !kafeIsCustom(p);
  }

  const rows = ovData();
  const all = activeRows();
  renderTodo(all);
  const noPos = all.filter(r => !r.pos).length;
  const noLvl = all.filter(r => r.pos && isGroup(r.pos) && !groupSkills(r.pos).length).length;
  const sum = SUMF(rows, r => r.total);
  const kafeN = rows.filter(r => r.kafe).length;
  const kafeOf = rows.filter(r => r.att && r.att.found).length;
  const bon = rows.filter(r => r.attEff > 0);
  const mal = rows.filter(r => r.attEff < 0);
  const sumPen = SUMF(rows, r => r.pen);
  const sumAdj = SUMF(rows, r => r.adj);
  const sanN = rows.reduce((x, r) => x + r.sans.length, 0);
  const sanPeople = rows.filter(r => r.sans.length).length;
  const filtered = rows.length !== all.length;
  const iss = rows.filter(r => r.issued).length;
  const issOf = rows.filter(r => r.toIssue || r.issued).length;
  const chg = rows.filter(r => r.issuedChanged).length;
  const maxSum = SUMF(rows, r => r.max);
  const prev = filtered ? null : ovPrevTotals();
  $('#ovStats').innerHTML = [
    statTile(`${I.tab}Tabáky celkem`, `${nf(sum, 0)}<em>/ ${nf(maxSum, 0)}</em>`, `${filtered ? `za ${rows.length} vybraných lidí` : `za ${rows.length} lidí, z maxim skupin`}${noPos ? `, ${noPos}× bez skupiny` : ''}${noLvl ? `, ${noLvl}× skupina bez dovedností` : ''}`, 'tab',
      { bar: maxSum > 0 ? sum / maxSum : null, trend: prev && prev.tab > 0 ? { pct: (sum - prev.tab) / prev.tab * 100, vs: prev.name } : null }),
    statTile(`${I.kafe}Kafe`, p ? `${kafeN}<em>/ ${kafeOf}</em>` : '—', p ? `splnili ${nf(kafeThreshold(p))} h` : 'bez docházky', 'kafe',
      { bar: p && kafeOf ? kafeN / kafeOf : null, trend: p && prev && prev.kafe > 0 ? { pct: (kafeN - prev.kafe) / prev.kafe * 100, vs: prev.name } : null }),
    statTile('Bonus za víkendy', p ? `+${SUMF(bon, r => r.attEff)}` : '—', p ? `${bon.length} lidí, po stropu skupiny` : 'bez docházky', 'good'),
    statTile('Srážky za docházku', p ? (mal.length ? `−${Math.abs(SUMF(mal, r => r.attEff))}` : '0') : '—', p ? `${mal.length} lidí${rows.some(r => r.lost) ? `, z toho ${rows.filter(r => r.lost).length} bez nároku` : ''}` : 'bez docházky', mal.length ? 'crit' : ''),
    statTile('Sankce', `${sumPen ? `−${sumPen}` : '0'}${sumAdj ? `<em>úprava ${sgn(sumAdj)}</em>` : ''}`, sanN ? `${sanN} sankcí u ${sanPeople} lidí` : 'žádné sankce'),
    statTile('Výdej', p ? `${iss}<em>/ ${issOf}</em>` : '—', !p ? 'bez docházky' : chg ? `${chg}× změna od výdeje` : (issOf - iss > 0 ? `zbývá vydat ${issOf - iss}` : 'vše vydáno'), chg ? 'warn' : '', { bar: p && issOf ? iss / issOf : null }),
  ].join('');
  setWidths($('#ovStats'));

  const cols = visibleColumns();
  renderColPicker();
  const excluded = excludedPeople();
  $('#ovExcluded').innerHTML = excluded.length ? `<p class="hint">Vyřazeno ze seznamu (${excluded.length}): ${excluded.map(e => esc(`${e.last} ${e.first}`)).join(', ')}. Vrátit je můžeš v části <button class="link" type="button" data-go="lide">Lidé</button>.</p>` : '';
  $('#ovHead').innerHTML = cols.map(c => {
    const active = P.sort.k === c.k;
    return `<th class="${c.cls || ''} col-${c.k}${c.sort ? ' sortable' : ''}"${c.sort ? ` data-sort="${c.k}" tabindex="0" role="button" aria-sort="${active ? (P.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}"` : ''}${c.hint ? ` title="${esc(c.hint)}"` : ''}>${esc(c.t)}${active ? ` <span class="ar">${P.sort.dir > 0 ? '▲' : '▼'}</span>` : ''}</th>`;
  }).join('');

  if (!rows.length) {
    $('#ovBody').innerHTML = `<tr class="empty-row"><td colspan="${cols.length}">${all.length ? 'Filtru nic neodpovídá.' : 'Zatím tu nikdo není. Nahraj docházku.'}</td></tr>`;
    $('#ovFoot').innerHTML = '';
    return;
  }
  $('#ovBody').innerHTML = rows.map((r, i) => `<tr data-key="${esc(r.e.key)}" class="${r.lost ? 'is-lost' : ''}">${cols.map(c => `<td class="${c.cls || ''} col-${c.k}" data-label="${esc(c.t)}">${c.cell(r, i)}</td>`).join('')}</tr>`).join('');
  $('#ovFoot').innerHTML = `<tr>${cols.map(c => `<td class="${c.cls || ''} col-${c.k}" data-label="${esc(c.t)}">${c.foot ? c.foot(rows) : ''}</td>`).join('')}</tr>`;
  if (ui.openDetail) openDetail(ui.openDetail);
  setWidths($('#ovTable'));
}

function openDetail(key) {
  $$('#ovBody tr.detail').forEach(row => row.remove());
  $$('#ovBody tr.open').forEach(row => row.classList.remove('open'));
  const tr = $$('#ovBody tr[data-key]').find(row => row.dataset.key === key);
  const r = allRows().find(x => x.e.key === key);
  if (!tr || !r) { ui.openDetail = null; return; }
  ui.openDetail = key;
  tr.classList.add('open');
  tr.insertAdjacentHTML('afterend', ovDetailRow(r));
  setWidths(tr.nextElementSibling);
}

function bumpAdj(key, dir) {
  const r = allRows().find(x => x.e.key === key);
  if (!r) return;
  const step = S.settings.adjStep || 1;
  setAdj(key, clamp(adjOf(key) + dir * step, r.adjMin, r.adjMax));
}

function adjCtrl(r) {
  const step = S.settings.adjStep || 1;
  const canDn = r.adj > r.adjMin;
  const canUp = r.adj < r.adjMax;
  const cls = r.adj > 0 ? 'up' : r.adj < 0 ? 'dn' : 'zero';
  return `<span class="adj"><button class="stepbtn" type="button" data-adj="${esc(r.e.key)}" data-dir="-1" aria-label="Ubrat ${step} ${tabW(step)}"${canDn ? '' : ' disabled'}>−</button><span class="adjv ${cls}">${r.adj ? sgn(r.adj) : '0'}</span><button class="stepbtn" type="button" data-adj="${esc(r.e.key)}" data-dir="1" aria-label="Přidat ${step} ${tabW(step)}"${canUp ? '' : ' disabled'}>+</button></span>`;
}

function attKv(r) {
  const a = r.att;
  const t = r.at;
  if (!(a && a.found)) return '<p class="muted small">Pro vybraný měsíc nemá nahranou docházku.</p>';
  const codes = Object.entries(a.codes);
  return `<dl class="kv">
    <dt>Odpracováno celkem</dt><dd>${nf(a.totalHours)} h</dd>
    <dt>Kafe (práh ${nf(r.kafeTh)} h)</dt><dd>${r.kafe ? `<span class="kafe-ok">${I.kafe}</span>` : r.lost ? '<span class="pen">bez nároku</span>' : '<span class="muted">nesplněno</span>'}</dd>
    <dt>Všední dny</dt><dd>${nf(a.cappedHours)} / ${nf(a.fund)} h</dd>
    ${a.shortFri ? `<dt class="sub">zkrácený pátek (odpolední)</dt><dd>${a.fridays}× ${nf(friShift())} h</dd>` : ''}
    <dt>Absence (dny bez docházky)</dt><dd>${t.gross}</dd>
    ${a.shortDays ? `<dt class="sub">kratší směny (jen pro Kafe)</dt><dd>${a.shortDays}×, −${nf(a.shortHours)} h</dd>` : ''}
    <dt>Víkendové směny</dt><dd>${a.wkDays} (${nf(a.wkHours)} h)</dd>
    ${t.filled ? `<dt class="sub">z toho vyplnily absenci</dt><dd>${t.filled}</dd>` : ''}
    ${t.missing ? `<dt>Absence po vyplnění</dt><dd>${t.missing}</dd>` : `<dt>Víkend. směn navíc</dt><dd>${t.wkLeft}</dd>`}
    ${codes.length ? `<dt>Kódy v docházce</dt><dd>${codes.map(c => `${esc(c[0])}×${c[1]}`).join(', ')}</dd>` : ''}
    <dt class="tot">Tabáky za docházku</dt><dd class="tot">${t.delta > 0 ? '+' : t.delta < 0 ? '−' : ''}${Math.abs(t.delta)}</dd>
  </dl><p class="explain">${esc(attExplain(r))}</p>`;
}

function lvlKv(r) {
  if (!r.pos) return '<p class="muted small">Nemá skupinu. Zařaď ho v části <b>Lidé</b>.</p>';
  if (r.L.legacy) {
    if (!r.L.n) return `<p class="muted small">Skupina ${esc(r.pos.name)}, ale bez úrovně.</p>`;
    return `<div class="lvlcell big"><span class="lvl l${r.L.n}">${r.L.n}</span><b>${esc(r.L.lv.name)}</b><span class="muted">· ${esc(r.pos.name)}</span></div><dl class="kv"><dt class="tot">Základ za úroveň</dt><dd class="tot">${r.L.base}</dd></dl>`;
  }
  const skills = groupSkills(r.pos);
  if (!skills.length) return `<p class="muted small">Skupina ${esc(r.pos.name)} nemá dovednosti. Doplň je v Matici dovedností.</p>`;
  return `<dl class="kv">${skills.map(x => { const v = rateOf(r.e, x.id); return `<dt>${esc(x.name)}${optTag(x, true)}</dt><dd title="${esc(rateTitle(x, v))}">${iluo(v)} ${v}</dd>`; }).join('')}
    <dt>${skills.some(x => x.opt) ? 'Vážený průměr (nepovinné dovednosti ¼)' : 'Průměr (každá úroveň 25 %)'}</dt><dd>${nf(r.L.pct, 1)} %</dd>
    <dt class="tot">Tabáky za dovednosti</dt><dd class="tot">${r.kafeOnly ? 'jen Kafe' : `${r.L.base} <small class="muted">z ${+r.pos.maxTab || 0}</small>`}</dd></dl>`;
}

