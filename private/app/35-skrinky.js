/* ==========================================================================
   SKŘÍŇKY (2.80): soupis skříněk spárovaný s Lidmi. Nahoře Volné, Obsazené, K vyklizení
   a Lidé bez skříňky; skříňka vyřazeného, smazaného nebo „už nepracuje“ = Je třeba vyprázdnit.
   Soupis se vloží z Excelu (Ctrl+V, A písmeno, B číslo, C jméno a příjmení). Ručně psaná jména
   se párují jen v prohlížeči (28-skrinky v core); nejisté řádky se vyberou ručně.
   ========================================================================== */
const LK_PAGE = 300;
function lkUi() { if (!ui.lk) ui.lk = { f: 'all', q: '', n: LK_PAGE }; return ui.lk; }
function lkList() { return (S && S.lockers && S.lockers.list) || []; }
function lkN(n) { return n === 1 ? 'skříňka' : n >= 2 && n <= 4 ? 'skříňky' : 'skříněk'; }
function lkLabels(list) { return list.map(lkLabel).join(', '); }
/** Upozornění do potvrzení vyřazení nebo smazání člověka (prázdné, když skříňku nemá). */
function lkWarnText(key) {
  const ls = lkOf(key);
  if (!ls.length) return '';
  // sdílená skříňka (2.82): když v ní zůstane někdo aktivní, je jen „odebrat“, ne K vyklizení
  const others = l => lkKeys(l).filter(k => k !== key && S.employees[k] && !S.employees[k].excluded);
  const own = ls.filter(l => !others(l).length), shared = ls.filter(l => others(l).length);
  return (own.length ? ` Má ${own.length === 1 ? 'skříňku' : 'skříňky'} ${lkLabels(own)}: ve Skříňkách se ukáže jako K vyklizení (je třeba vyprázdnit).` : '')
    + (shared.length ? ` Sdílí ${shared.length === 1 ? 'skříňku' : 'skříňky'} ${lkLabels(shared)}: jeho věci je třeba vyklidit a odebrat ho ze skříňky.` : '');
}
/** Po vyřazení nebo smazání člověka: je třeba vyprázdnit jeho skříňku, nabídne štítek s výzvou (2.81). */
async function lkAfterLeave(key, name) {
  const all = lkOf(key);
  if (!all.length) return;
  const ls = all.filter(l => lkState(l, S.employees, todayIso()).st === 'clear'), shared = all.filter(l => !ls.includes(l));
  if (!ls.length) { lkLeaveShared(key, name, shared); return; }
  const one = ls.length === 1, until = dayText(lkWorkDaysAdd(todayIso(), LK_NOTICE_DAYS));
  const res = await dialog({
    title: `Je třeba vyprázdnit ${one ? 'skříňku' : 'skříňky'} ${lkLabels(ls)}`, ok: 'Vytisknout výzvu', cancel: 'Později',
    html: `<p>${name ? `<b>${esc(name)}</b> má` : 'Člověk měl'} ${one ? 'skříňku' : 'skříňky'} <b>${esc(lkLabels(ls))}</b>. Ve Skříňkách ${one ? 'je' : 'jsou'} teď K vyklizení.</p>
      <p class="small">Štítek s výzvou (Zebra 100 × 35 mm): uživatel skříňky se má nahlásit u vedoucího do <b>${esc(until)}</b> (${LK_NOTICE_DAYS} pracovních dnů), jinak bude skříňka komisionálně otevřena a vyklizena.</p>
      ${shared.length ? `<p class="small">Sdílená ${shared.length === 1 ? 'skříňka' : 'skříňky'} <b>${esc(lkLabels(shared))}</b>: jeho věci vyklidit a odebrat ho (Skříňky → Odebrat).</p>` : ''}`,
  });
  if (res.value === 'ok') lkNoticePrint(ls.map(l => l.id));
  else toast(`Je třeba vyprázdnit ${one ? 'skříňku' : 'skříňky'} ${lkLabels(ls)}. Výzvu vytiskneš ve Skříňkách.`, true);
}
/** Odchod člověka ze sdílené skříňky (2.82): ostatní ji používají dál, jeho věci vyklidit a odebrat ho. */
async function lkLeaveShared(key, name, ls) {
  const one = ls.length === 1, rest = ls.map(l => `${lkLabel(l)} (${lkKeys(l).filter(k => k !== key).map(k => lkName(S.employees[k]) || lkNameIn(l, k)).join(', ')})`).join(', ');
  const res = await dialog({
    title: `Odebrat ze ${one ? 'sdílené skříňky' : 'sdílených skříněk'} ${lkLabels(ls)}`, ok: 'Odebrat ze skříňky', cancel: 'Později',
    html: `<p>${name ? `<b>${esc(name)}</b>` : 'Člověk'} ${one ? 'sdílí skříňku' : 'sdílí skříňky'} ${esc(rest)}. Skříňku používají dál ostatní, jeho věci je třeba vyklidit.</p>`,
  });
  if (res.value !== 'ok') { toast(`Odeber ${name || 'ho'} ze ${one ? 'skříňky' : 'skříněk'} ${lkLabels(ls)} (Skříňky → Odebrat).`, true); return; }
  const meta = { by: ui.me ? ui.me.label : '' };
  ls.forEach(l => lkRemovePerson(S, l.id, key, meta));
  save();
  renderAll();
  toast(`${name || 'Člověk'} odebrán ze ${one ? 'skříňky' : 'skříněk'} ${lkLabels(ls)}.`);
}
/** Řádek do detailu člověka v Lidech. */
function lkPersonHtml(e) {
  if (!e || !S.lockers) return '';
  const ls = lkOf(e.key), today = todayIso();
  const mates = l => lkKeys(l).filter(k => k !== e.key).map(k => lkName(S.employees[k]) || lkNameIn(l, k));
  if (ls.length && e.excluded) {
    const clr = ls.filter(l => lkState(l, S.employees, today).st === 'clear'), sh = ls.filter(l => !clr.includes(l));
    return `<div class="note e lk-person">${clr.length ? `<b>Je třeba vyprázdnit ${clr.length === 1 ? 'skříňku' : 'skříňky'} ${esc(lkLabels(clr))}.</b> Vyřazený ze seznamu pořád má skříňku. ` : ''}${sh.length ? `<b>Odebrat ze sdílené skříňky ${esc(lkLabels(sh))}</b> a vyklidit jeho věci. ` : ''}<button class="btn small" type="button" data-golk="${clr.length ? 'clear' : 'leave'}">Skříňky</button></div>`;
  }
  if (ls.length) return `<p class="small lk-person">Skříňka <b>${esc(lkLabels(ls))}</b>${ls.some(l => mates(l).length) ? ` <span class="muted">sdílí s ${esc([...new Set(ls.flatMap(mates))].join(', '))}</span>` : ''}${ls.length > 1 ? ' <span class="tag warn">má víc skříněk</span>' : ''} <button class="btn ghost small" type="button" data-golk="">Skříňky</button></p>`;
  if (e.excluded || isLead(e) || !lkList().length) return '';
  return `<p class="small muted lk-person">Bez skříňky. <button class="btn ghost small" type="button" data-lkgive="${esc(e.key)}">Přidělit skříňku</button></p>`;
}
function renderLkBadge() {
  const b = $('#navLockers');
  if (!b || !S) return;
  const ov = lkOverview(S.lockers, S.employees, todayIso()), n = ov.clear + ov.leave;
  b.hidden = !n;
  b.textContent = String(n);
  b.classList.toggle('late', !!n);
  b.title = n ? [ov.clear ? `K vyklizení ${ov.clear} ${lkN(ov.clear)}` : '', ov.leave ? `odebrat ze sdílené ${ov.leave}` : ''].filter(Boolean).join(', ') : '';
}

/* ---------- obrazovka ---------- */
const LK_FILTERS = [['all', 'Vše'], ['free', 'Volné'], ['used', 'Obsazené'], ['unknown', 'Nespárované'], ['clear', 'K vyklizení'], ['leave', 'Odebrat'], ['multi', 'Víc skříněk'], ['nokey', 'Bez záložního klíče'], ['without', 'Bez skříňky']];
function lkWho(x) {
  if (x.people) return x.people.map(p => p.name).join(', ');
  return x.l.gone || x.l.name || x.l.raw || '';
}
function lkMatchQ(x, q) {
  if (!q) return true;
  return norm([lkLabel(x.l), lkWho(x), x.l.raw, x.l.note, x.l.serial, ...(x.people || []).map(p => p.e && p.e.wid)].filter(Boolean).join(' ')).includes(q);
}
/** Řádek ve filtru (obrazovka i hromadný tisk). */
function lkInFilter(x, f, ov) {
  if (f === 'all') return true;
  if (f === 'used') return x.st === 'used' || x.st === 'unknown';
  if (f === 'multi') return lkKeys(x.l).some(k => ov.multi.includes(k));
  if (f === 'leave') return !!(x.leaving && x.leaving.length);
  if (f === 'nokey') return !!x.l.nokey;
  return x.st === f;
}
function lkRowHtml(x, ov, today) {
  const l = x.l, id = esc(l.id), ppl = x.people || [], many = ppl.length > 1, multi = ppl.some(p => ov.multi.includes(p.key));
  const grp = x.e ? (S.positions.find(g => g.id === x.e.positionId) || {}).name : '';
  // jeden člověk na řádek; ve sdílené skříňce (2.82) jde každý odebrat
  const person = p => `<span class="lk-pp${p.why ? ' gone' : ''}">${p.e ? `<button class="lk-who" type="button" data-lkperson="${esc(p.key)}">${esc(p.name)}</button>` : `<b>${esc(p.name)}</b>`}${many ? `<button class="icon-btn lk-rm" type="button" data-lkrm="${id}" data-lkkey="${esc(p.key)}" title="Odebrat ze skříňky" aria-label="Odebrat ${esc(p.name)} ze skříňky ${esc(lkLabel(l))}">${I.x}</button>` : ''}${p.why && (many || x.st !== 'clear') ? `<small class="lk-why">${esc(p.why)}</small>` : ''}</span>`;
  let who;
  if (x.st === 'used') who = `${ppl.map(person).join('')}${!many && (grp || x.e.wid) ? `<small class="muted">${esc([grp, x.e.wid ? `ID ${x.e.wid}` : ''].filter(Boolean).join(' · '))}</small>` : ''}<button class="btn ghost small lk-addp" type="button" data-lkaddp="${id}" title="Sdílená skříňka: přidat dalšího člověka">+ další člověk</button>`;
  else if (x.st === 'clear') who = `${ppl.length ? ppl.map(person).join('') : `<b>${esc(lkWho(x) || 'neznámý')}</b>`}<small class="lk-why">${esc(x.why)}</small>${x.notice ? `<small class="lk-notice${x.noticeLate ? ' late' : ''}">${x.noticeLate ? `lhůta výzvy uplynula ${esc(dayText(x.notice.until))}, lze vyklidit` : `výzva vyvěšena ${esc(dayText(x.notice.at))}, lhůta do ${esc(dayText(x.notice.until))}`}</small>` : ''}`;
  else if (x.st === 'unknown') who = `<span class="lk-raw">„${esc(l.raw)}“</span><small class="muted">v Lidech nenalezeno, přiřaď</small>`;
  else who = '<span class="muted">—</span>';
  const tag = { used: '<span class="tag ok">Obsazená</span>', unknown: '<span class="tag warn">Nespárovaná</span>', clear: '<span class="tag crit">Je třeba vyprázdnit</span>', free: '<span class="tag">Volná</span>' }[x.st];
  const sdup = l.serial && ov.serialDup.has(l.serial) ? ov.serialDup.get(l.serial).filter(o => o !== l).map(lkLabel) : [];
  const extra = [sdup.length ? `<span class="tag warn">stejné číslo klíče jako ${esc(sdup.join(', '))}</span>` : '', x.leaving && x.leaving.length ? `<span class="tag crit">odebrat ${esc(x.leaving.map(p => p.name).join(', '))}</span>` : '', many ? `<span class="tag">sdílená · ${ppl.length}</span>` : '', l.nokey ? '<span class="tag">bez záložního klíče</span>' : '', x.noticeLate ? '<span class="tag crit">lhůta uplynula</span>' : x.notice ? '<span class="tag warn">výzva vyvěšena</span>' : '', x.endPast ? `<span class="tag warn" title="Konec trestu ${esc(dayText(x.endPast))}">konec trestu minul</span>` : '', multi ? '<span class="tag warn">má víc skříněk</span>' : ''].join('');
  const act = x.st === 'clear'
    ? `<button class="btn ${x.notice ? 'ghost ' : 'sec '}small" type="button" data-lknotice="${id}" title="Štítek s výzvou k vyklizení (Zebra 100 × 35 mm)${x.notice ? ', stejná lhůta' : `, lhůta ${LK_NOTICE_DAYS} pracovních dnů`}">Výzva</button><button class="btn small" type="button" data-lkfree="${id}" title="Skříňka je prázdná, zůstane volná">Vyprázdněno</button><button class="btn ghost small" type="button" data-lkassign="${id}">Přidělit</button>`
    : x.st === 'free' ? `<button class="btn sec small" type="button" data-lkassign="${id}">Přidělit</button>`
      : `<button class="btn ghost small" type="button" data-lkassign="${id}">${x.st === 'unknown' ? 'Přiřadit' : 'Změnit'}</button><button class="btn ghost small" type="button" data-lkfree="${id}">Uvolnit</button>`;
  return `<tr class="lk-${x.st}" data-lkrow="${id}">
    <td class="lk-lab" data-label="Skříňka"><b>${esc(lkLabel(l))}</b>${l.serial ? `<small class="lk-ser" title="Poslední čísla sériového čísla klíče">klíč …${esc(l.serial)}</small>` : ''}</td>
    <td class="name lk-whocell" data-label="Pracovník">${who}</td>
    <td class="wrap" data-label="Stav"><span class="lk-tags">${tag}${extra}</span></td>
    <td class="lk-notecell" data-label="Poznámka"><input type="text" data-lknote="${id}" value="${esc(l.note || '')}" maxlength="${LK_NOTE}" placeholder="poznámka" aria-label="Poznámka ke skříňce ${esc(lkLabel(l))}"></td>
    <td class="actions lk-act">${act}<button class="btn ghost small" type="button" data-lklbl="${id}" title="${l.nokey ? 'Štítek na skříňku (záložní klíč není)' : 'Štítek na skříňku a na záložní klíč'} (Zebra 100 × 35 mm)">Štítky</button><button class="btn ghost small lk-nokey${l.nokey ? ' on' : ''}" type="button" data-lknokey="${id}" aria-pressed="${!!l.nokey}" title="${l.nokey ? 'Zapnuto: skříňka nemá záložní klíč, štítek klíče se netiskne. Kliknutím vypneš.' : 'Skříňka nemá záložní klíč (štítek klíče se pak netiskne)'}">Není záložní klíč</button><button class="icon-btn lk-del" type="button" data-lkdel="${id}" title="Smazat skříňku ze soupisu" aria-label="Smazat skříňku ${esc(lkLabel(l))}">${I.x}</button></td></tr>`;
}
function lkWithoutHtml(ov, q) {
  const list = ov.without.filter(e => !q || norm(`${lkName(e)} ${e.wid || ''}`).includes(q));
  if (!ov.without.length) return `<div class="card"><p class="lk-okline">${I.check}<span>Každý v seznamu Lidí má skříňku.</span></p></div>`;
  if (!list.length) return '<div class="card"><p class="muted">Nikdo neodpovídá hledání.</p></div>';
  const free = ov.free;
  return `<div class="table-card flat"><table class="stack lk-tab"><thead><tr><th>Pracovník</th><th>Skupina</th><th>Konec trestu</th><th></th></tr></thead><tbody>${list.map(e => {
    const g = (S.positions.find(p => p.id === e.positionId) || {}).name || '';
    return `<tr><td class="name lk-whocell" data-label="Pracovník"><button class="lk-who" type="button" data-lkperson="${esc(e.key)}">${esc(lkName(e))}</button>${e.wid ? `<small class="muted">ID ${esc(e.wid)}</small>` : ''}${isLead(e) ? ' <span class="tag">vedoucí</span>' : ''}</td>
      <td data-label="Skupina">${g ? esc(g) : '<span class="muted">—</span>'}</td><td class="num" data-label="Konec trestu">${e.end ? esc(dayText(e.end)) : '<span class="muted">—</span>'}</td>
      <td class="actions lk-act"><button class="btn sec small" type="button" data-lkgive="${esc(e.key)}" title="${free ? 'Volnou skříňku, nebo sdílet obsazenou' : 'Žádná skříňka není volná: sdílet obsazenou'}">Přidělit skříňku</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function renderLockers() {
  const box = $('#lkView');
  if (!box || !S) return;
  renderLkBadge();
  const u = lkUi(), today = todayIso(), ov = lkOverview(S.lockers, S.employees, today);
  if (!ov.total) {
    box.innerHTML = `<div class="card lk-empty">${emptyState('Zatím žádný soupis skříněk', 'V Excelu označ sloupce <b>A</b> (písmeno řady), <b>B</b> (číslo skříňky) a <b>C</b> (jméno a příjmení), zkopíruj je a tady stiskni <kbd>Ctrl</kbd>+<kbd>V</kbd>. Jména psaná ručně se spárují s Lidmi i s překlepy, nejisté vybereš sám. Nebo nejdřív přidej řadu prázdných skříněk.',
      '<div class="row gap wrap"><button class="btn" type="button" data-lkpaste>Vložit z Excelu</button><button class="btn sec" type="button" data-lkrange>Přidat řadu skříněk</button></div>')}</div>`;
    return;
  }
  // podnabídka Klíče (2.83): hlavně na telefon, zápis čísel klíčů a hledání skříňky podle klíče
  const mode = u.mode === 'keys' ? 'keys' : 'list';
  const modeTabs = `<div class="chips lk-mode" role="tablist" aria-label="Skříňky"><button type="button" class="chip${mode === 'list' ? ' on' : ''}" data-lkmode="list" role="tab" aria-selected="${mode === 'list'}">Soupis</button><button type="button" class="chip${mode === 'keys' ? ' on' : ''}" data-lkmode="keys" role="tab" aria-selected="${mode === 'keys'}">Klíče <em class="t5-count">${ov.serial}/${ov.total}</em></button></div>`;
  if (mode === 'keys') {
    const keep = lkKeysKeep();
    box.innerHTML = modeTabs + lkKeysHtml(ov);
    lkKeysRestore(keep);
    return;
  }
  const q = norm(u.q.trim());
  const occ = ov.used + ov.unknown;
  const count = { all: ov.total, free: ov.free, used: occ, unknown: ov.unknown, clear: ov.clear, leave: ov.leave, nokey: ov.nokey, multi: ov.rows.filter(x => lkInFilter(x, 'multi', ov)).length, without: ov.without.length };
  if (['unknown', 'multi', 'leave', 'nokey'].includes(u.f) && !count[u.f]) u.f = 'all';
  const clearRows = ov.rows.filter(x => x.st === 'clear'), leaveRows = ov.rows.filter(x => lkInFilter(x, 'leave', ov));
  const tiles = `<div class="stats lk-stats">
      ${statTile('Volné skříňky', String(ov.free), ov.free ? `z ${ov.total} ${lkN(ov.total)}` : 'žádná volná', ov.free ? 'good' : '')}
      ${statTile('Obsazené skříňky', String(occ), ov.unknown ? `z toho ${ov.unknown} nespárováno` : 'spárováno s Lidmi', ov.unknown ? 'warn' : '')}
      ${statTile('K vyklizení', String(ov.clear), ov.clear ? 'je třeba vyprázdnit' : 'nic k vyklizení', ov.clear ? 'crit' : '')}
      ${statTile('Lidé bez skříňky', String(ov.without.length), ov.without.length ? 'v seznamu Lidí' : 'každý má skříňku')}</div>`;
  const alert = clearRows.length ? `<div class="note e lk-alert"><div><b>Je třeba vyprázdnit ${clearRows.length} ${lkN(clearRows.length)}:</b> ${clearRows.slice(0, 8).map(x => `${esc(lkLabel(x.l))} <span class="muted">(${esc(lkWho(x) || 'neznámý')}, ${esc(x.why)})</span>`).join(', ')}${clearRows.length > 8 ? ' …' : ''}</div><div class="row gap wrap lk-alertact"><button class="btn small" type="button" data-lknoticeall title="Štítky s výzvou k vyklizení pro všechny skříňky K vyklizení (Zebra 100 × 35 mm)">Vytisknout výzvy (${clearRows.length})</button>${u.f !== 'clear' ? '<button class="btn ghost small" type="button" data-lkf="clear">Ukázat</button>' : ''}</div></div>` : '';
  const leaveNote = leaveRows.length ? `<div class="note w lk-alert"><div><b>Odebrat ze sdílené skříňky:</b> ${leaveRows.slice(0, 8).map(x => `${esc(lkLabel(x.l))} <span class="muted">(${esc(x.leaving.map(p => `${p.name}, ${p.why}`).join('; '))})</span>`).join(', ')}${leaveRows.length > 8 ? ' …' : ''}. Skříňku používají dál ostatní, věci odešlého vyklidit.</div>${u.f !== 'leave' ? '<div class="row gap wrap lk-alertact"><button class="btn ghost small" type="button" data-lkf="leave">Ukázat</button></div>' : ''}</div>` : '';
  const chips = `<div class="chips lk-chips" role="tablist" aria-label="Filtr skříněk">${LK_FILTERS.filter(([k]) => k === 'all' || k === 'free' || k === 'used' || k === 'clear' || k === 'without' || count[k]).map(([k, label]) => `<button type="button" class="chip${u.f === k ? ' on' : ''}" data-lkf="${k}" role="tab" aria-selected="${u.f === k}">${label} <em class="t5-count${(k === 'clear' || k === 'leave') && count[k] ? ' late' : ''}">${count[k]}</em></button>`).join('')}</div>`;
  const tools = `<div class="toolbar lk-tools">${chips}<label class="lk-search"><span class="sr-only">Hledat skříňku nebo člověka</span><input type="search" id="lkQ" value="${esc(u.q)}" placeholder="Hledat skříňku nebo jméno" autocomplete="off"></label></div>`;
  let body;
  if (u.f === 'without') body = lkWithoutHtml(ov, q);
  else {
    const rows = ov.rows.filter(x => lkInFilter(x, u.f, ov) && lkMatchQ(x, q));
    const shown = rows.slice(0, u.n);
    body = rows.length ? `<div class="table-card flat"><table class="stack lk-tab"><thead><tr><th>Skříňka</th><th>Pracovník</th><th>Stav</th><th>Poznámka</th><th></th></tr></thead><tbody>${shown.map(x => lkRowHtml(x, ov, today)).join('')}</tbody></table></div>
      ${rows.length > shown.length ? `<p class="lk-more"><button class="btn ghost" type="button" data-lkmore>Ukázat dalších ${Math.min(LK_PAGE, rows.length - shown.length)} (zbývá ${rows.length - shown.length})</button></p>` : ''}`
      : `<div class="card"><p class="muted">${q ? 'Nic neodpovídá hledání.' : 'V tomhle filtru nic není.'}</p></div>`;
  }
  box.innerHTML = `${modeTabs}${tiles}${alert}${leaveNote}${tools}${body}
    <p class="tiny muted lk-foot">Vložit nebo doplnit soupis: v Excelu zkopíruj sloupce A (písmeno), B (číslo) a C (jméno) a tady stiskni Ctrl+V. Skříňky se stejným písmenem a číslem se přepíšou, ostatní zůstanou.</p>`;
}

/* ---------- Klíče (2.83): poslední čísla sériového čísla klíče ke skříňce ----------
   Na telefonu: napsat skříňku a čísla, Uložit; formulář pak nabídne další skříňku bez čísla. Druhá karta
   najde skříňku podle čísel z neoznačeného klíče. */
function lkKWalk() {
  const u = lkUi();
  if (u.walk !== 'nokey' && u.walk !== 'all') u.walk = lkList().some(l => l.nokey) ? 'nokey' : 'all';
  if (u.walk === 'nokey' && !lkList().some(l => l.nokey)) u.walk = 'all';
  return u.walk;
}
function lkKeysHtml(ov) {
  const missing = ov.total - ov.serial, rec = (lkUi().recent || []).map(r => lkFind(S, r.id)).filter(Boolean), walk = lkKWalk();
  const nk = lkList().filter(l => l.nokey), nkLeft = nk.filter(l => !l.serial).length;
  return `<div class="lk-keys">
    <div class="card lk-kcard">
      <h3>Zapsat číslo klíče</h3>
      ${nk.length ? `<div class="chips lk-kwalk" role="radiogroup" aria-label="Procházet skříňky"><button type="button" class="chip${walk === 'nokey' ? ' on' : ''}" data-lkkwalk="nokey" role="radio" aria-checked="${walk === 'nokey'}">Bez záložního klíče <em class="t5-count">${nkLeft}</em></button><button type="button" class="chip${walk === 'all' ? ' on' : ''}" data-lkkwalk="all" role="radio" aria-checked="${walk === 'all'}">Všechny <em class="t5-count">${missing}</em></button></div>` : ''}
      <p class="small muted" id="lkKLeft">${lkKLeftText(ov)}</p>
      <label class="field"><span>Skříňka</span><input id="lkKLock" list="lkKList" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="např. A 12" enterkeyhint="next"></label>
      <datalist id="lkKList">${lkList().map(l => `<option value="${esc(lkLabel(l))}">`).join('')}</datalist>
      <p class="small lk-kinfo" id="lkKInfo" aria-live="polite"></p>
      <label class="field"><span>Poslední 3 čísla klíče</span><input id="lkKSer" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="123" enterkeyhint="done"></label>
      <div class="row gap wrap lk-kbtns"><button class="btn" type="button" data-lkksave>Uložit</button><button class="btn sec" type="button" data-lkknext>${missing ? 'Další bez čísla' : 'Další skříňka'}</button></div>
      <p class="small lk-kmsg" id="lkKMsg" aria-live="polite"></p>
    </div>
    <div class="card lk-kcard">
      <h3>Najít skříňku podle klíče</h3>
      <label class="field"><span>Čísla z klíče</span><input id="lkKFind" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="123"></label>
      <div id="lkKFound" aria-live="polite"><p class="small muted">Napiš poslední čísla ze sériového čísla neoznačeného klíče.</p></div>
    </div>
    <div class="card lk-kcard lk-krecent" id="lkKRecent"${rec.length ? '' : ' hidden'}><h3>Naposledy zapsané</h3><ul>${rec.map(l => `<li><b>${esc(lkLabel(l))}</b> · klíč …${esc(l.serial || '—')}<span class="muted"> · ${esc(lkKWho(l))}</span></li>`).join('')}</ul></div>
    ${ov.serialDup.size ? `<div class="note w lk-kdup">Stejné číslo klíče má víc skříněk: ${[...ov.serialDup.entries()].slice(0, 10).map(([k, ls]) => `…${esc(k)}: ${esc(ls.map(lkLabel).join(', '))}`).join('; ')}. U posledních 3 čísel se to stát může, zkontroluj klíče.</div>` : ''}
  </div>`;
}
function lkKLeftText(ov) {
  const missing = ov.total - ov.serial;
  if (lkKWalk() === 'nokey') {
    const nk = lkList().filter(l => l.nokey), left = nk.filter(l => !l.serial).length;
    return `Postupně po skříňkách bez záložního klíče: ${left ? `bez čísla zbývá ${left} z ${nk.length}` : 'všechny už mají číslo klíče'}. Na zámku nebo klíči přečti poslední 3 čísla sériového čísla.`;
  }
  return `Napiš skříňku (třeba „a12“) a poslední 3 čísla ze sériového čísla klíče. ${missing ? `Bez čísla zbývá ${missing} z ${ov.total}.` : 'Všechny skříňky mají číslo klíče.'}`;
}
/** Předvyplní první skříňku bez čísla v procházení a kurzor dá do čísel (vstup do Klíčů, změna procházení). */
function lkKStart() {
  const lockIn = $('#lkKLock');
  if (!lockIn) return;
  const nx = lkNextNoSerial(null);
  lockIn.value = nx ? lkLabel(nx) : '';
  lkKInfo();
  $('#lkKMsg').className = 'small lk-kmsg';
  $('#lkKMsg').textContent = nx ? '' : lkKWalk() === 'nokey' ? 'Všechny skříňky bez záložního klíče mají číslo klíče.' : 'Všechny skříňky mají číslo klíče.';
  (nx ? $('#lkKSer') : lockIn).focus();
}
function lkKWho(l) { const x = lkState(l, S.employees, todayIso()); return x.people ? x.people.map(p => p.name).join(', ') : x.st === 'free' ? 'volná' : lkWho({ l, ...x }) || 'volná'; }
function lkKInfo() {
  const inp = $('#lkKLock'), info = $('#lkKInfo');
  if (!inp || !info) return null;
  const v = inp.value.trim(), l = v ? lkByLabel(S.lockers, v) : null;
  info.className = `small lk-kinfo${v && !l ? ' err' : ''}`;
  info.textContent = !v ? '' : l ? `${lkLabel(l)} · ${lkKWho(l)} · ${l.serial ? `klíč …${l.serial} (uložením se přepíše)` : 'klíč zatím bez čísla'}${l.nokey ? ' · bez záložního klíče' : ''}`
    : /^\d+[a-z]?$/i.test(v.replace(/\s+/g, '')) && lkList().filter(x => x.no === lkNoNorm(v)).length > 1 ? `Číslo ${v} je ve víc řadách, napiš i písmeno (třeba A ${v}).` : `Skříňka „${v}“ v soupisu není.`;
  return l;
}
function lkKSerHint() {
  const l = lkByLabel(S.lockers, ($('#lkKLock') || {}).value || ''), v = lkSerialNorm(($('#lkKSer') || {}).value || ''), msg = $('#lkKMsg');
  if (!msg) return;
  const dup = v ? lkBySerial(S.lockers, v, l && l.id).filter(o => o.serial === v) : [];
  msg.className = `small lk-kmsg${dup.length ? ' warn' : ''}`;
  msg.textContent = dup.length ? `Stejné číslo má ${dup.map(lkLabel).join(', ')}.` : '';
}
function lkNextNoSerial(after, any) {
  // procházení „bez záložního klíče“ vede jen po skříňkách s Není záložní klíč
  const L = lkKWalk() === 'nokey' ? lkList().filter(x => x.nokey) : lkList(), i = after ? L.findIndex(x => x.id === after.id) : -1, ok = x => any || !x.serial;
  return L.slice(i + 1).find(ok) || L.slice(0, Math.max(0, i)).find(ok) || null;
}
function lkKeySave() {
  const lockIn = $('#lkKLock'), serIn = $('#lkKSer'), msg = $('#lkKMsg');
  const l = lkByLabel(S.lockers, lockIn.value);
  if (!l) { msg.className = 'small lk-kmsg err'; msg.textContent = 'Napiš skříňku, která je v soupisu (třeba A 12).'; lockIn.focus(); return; }
  const v = lkSerialNorm(serIn.value);
  if (!v) { msg.className = 'small lk-kmsg err'; msg.textContent = 'Napiš čísla z klíče.'; serIn.focus(); return; }
  const r = lkSetSerial(S, l.id, v);
  if (r.err) { toast(r.err, true); return; }
  save();
  const u = lkUi();
  u.recent = [{ id: l.id }, ...(u.recent || []).filter(x => x.id !== l.id)].slice(0, 10);
  // další skříňka bez čísla, kurzor rovnou do čísel
  const nx = lkNextNoSerial(l);
  lockIn.value = nx ? lkLabel(nx) : '';
  serIn.value = '';
  lkKInfo();
  const ov = lkOverview(S.lockers, S.employees, todayIso());
  $('#lkKLeft').textContent = lkKLeftText(ov);
  const rec = $('#lkKRecent');
  rec.hidden = false;
  rec.innerHTML = `<h3>Naposledy zapsané</h3><ul>${u.recent.map(x => lkFind(S, x.id)).filter(Boolean).map(x => `<li><b>${esc(lkLabel(x))}</b> · klíč …${esc(x.serial || '—')}<span class="muted"> · ${esc(lkKWho(x))}</span></li>`).join('')}</ul>`;
  const mode = $('#lkView [data-lkmode="keys"] .t5-count');
  if (mode) mode.textContent = `${ov.serial}/${ov.total}`;
  msg.className = `small lk-kmsg ${r.dup.length ? 'warn' : 'ok'}`;
  msg.textContent = `Uloženo: ${lkLabel(l)} · klíč …${v}.${r.dup.length ? ` Pozor, stejné číslo má i ${r.dup.map(lkLabel).join(', ')}.` : ''}${nx ? ` Další: ${lkLabel(nx)}.` : lkKWalk() === 'nokey' ? ' Všechny skříňky bez záložního klíče mají číslo klíče.' : ' Všechny skříňky mají číslo klíče.'}`;
  const wc = $$('#lkView [data-lkkwalk] .t5-count');
  if (wc.length === 2) { wc[0].textContent = String(lkList().filter(x => x.nokey && !x.serial).length); wc[1].textContent = String(ov.total - ov.serial); }
  (nx ? serIn : lockIn).focus();
}
function lkKFind() {
  const inp = $('#lkKFind'), box = $('#lkKFound');
  if (!inp || !box) return;
  const q = lkSerialNorm(inp.value);
  if (!q) { box.innerHTML = '<p class="small muted">Napiš poslední čísla ze sériového čísla neoznačeného klíče.</p>'; return; }
  const hits = lkBySerial(S.lockers, q);
  box.innerHTML = hits.length ? `<ul class="lk-kfound">${hits.map(l => `<li><b>${esc(lkLabel(l))}</b> · klíč …${esc(l.serial)}<span class="muted"> · ${esc(lkKWho(l))}</span>${l.nokey ? ' <span class="tag">bez záložního klíče</span>' : ''}
      <span class="lk-kfacts">${l.nokey ? `<button class="btn sec small" type="button" data-lkkhave="${esc(l.id)}" title="Tenhle klíč je záložní klíč skříňky: zruší Není záložní klíč">Záložní klíč nalezen</button>` : `<button class="btn ghost small" type="button" data-lkkprint="${esc(l.id)}" title="Štítek na záložní klíč (Zebra 100 × 35 mm)">Štítek klíče</button>`}<button class="btn ghost small" type="button" data-lkkopen="${esc(l.id)}">V soupisu</button></span></li>`).join('')}</ul>`
    : `<p class="small lk-kmsg err">Klíč s čísly …${esc(q)} u žádné skříňky není.</p>`;
}
/** Při překreslení (synchronizace) se rozepsaný formulář nesmí ztratit. */
function lkKeysKeep() {
  const a = document.activeElement;
  return { lock: ($('#lkKLock') || {}).value || '', ser: ($('#lkKSer') || {}).value || '', find: ($('#lkKFind') || {}).value || '', focus: a && /^lkK/.test(a.id) ? a.id : '' };
}
function lkKeysRestore(k) {
  if (!$('#lkKLock')) return;
  $('#lkKLock').value = k.lock; $('#lkKSer').value = k.ser; $('#lkKFind').value = k.find;
  lkKInfo(); lkKFind();
  if (k.focus && $(`#${k.focus}`)) $(`#${k.focus}`).focus();
}

/* ---------- vložení soupisu z Excelu ---------- */
/** Volby výběru člověka (ruční přiřazení): návrhy, bez skříňky, vyřazení, ostatní. */
function lkPeopleOptions(sel, cand, haveLocker, skip) {
  const people = Object.values(S.employees).filter(e => e && e.key && !(skip && skip.has(e.key))).sort((a, b) => lkName(a).localeCompare(lkName(b), 'cs'));
  const opt = e => `<option value="${esc(e.key)}"${e.key === sel ? ' selected' : ''}>${esc(lkName(e))}${e.wid ? ` · ID ${esc(e.wid)}` : ''}${haveLocker.has(e.key) ? ` (má ${esc(haveLocker.get(e.key))})` : ''}${e.excluded ? ' (vyřazen)' : ''}</option>`;
  const sug = (cand || []).map(k => S.employees[k]).filter(e => e && !(skip && skip.has(e.key)));
  const inSug = new Set(sug.map(e => e.key));
  const rest = people.filter(e => !inSug.has(e.key));
  const g = (label, list) => (list.length ? `<optgroup label="${label}">${list.map(opt).join('')}</optgroup>` : '');
  return g('Návrh', sug)
    + g('Ještě bez skříňky', rest.filter(e => !e.excluded && !haveLocker.has(e.key)))
    + g('Vyřazení ze seznamu (skříňka půjde k vyklizení)', rest.filter(e => e.excluded))
    + g('Ostatní (už mají skříňku)', rest.filter(e => !e.excluded && haveLocker.has(e.key)));
}
async function lkPaste(html, text) {
  if (!S) return;
  const clip = shClipRows(html, text);
  const p = lkParse(clip.rows.map(r => (r || []).slice(0, 3)));
  if (!p.items.length) { toast('Ve schránce nejsou skříňky. V Excelu zkopíruj sloupce A (písmeno), B (číslo) a C (jméno a příjmení).', true); return; }
  const named = p.items.filter(x => x.text);
  const labels = new Set(p.items.map(x => `${x.row}|${x.no}`));
  const assign = new Map();   // číslo řádku → klíč člověka ('' = nikdo, rozhodne dec)
  const dec = new Map();      // číslo řádku → '@raw' nechat jméno | '@gone' už nepracuje | '@free' volná
  let replace = false;
  const run = () => {
    const m = lkMatch(named, S.employees, assign), by = new Map();
    named.forEach((x, i) => by.set(x.n, m[i]));
    return by;
  };
  const sure = new Set();     // řádky spárované jistě při prvním výpočtu (zůstanou v seznamu Spárováno)
  let by = run();
  by.forEach((m, n) => { if (m.key) sure.add(n); });
  const haveLocker = () => {
    const h = new Map();
    if (!replace) lkList().forEach(l => { if (!labels.has(`${l.row}|${l.no}`)) lkKeys(l).forEach(k => h.set(k, h.has(k) ? `${h.get(k)}, ${lkLabel(l)}` : lkLabel(l))); });
    by.forEach((m, n) => { if (m.key) { const it = p.items.find(x => x.n === n); h.set(m.key, h.has(m.key) ? `${h.get(m.key)}, ${lkLabel(it)}` : lkLabel(it)); } });
    return h;
  };
  const choice = (x, m) => dec.get(x.n) || (m && m.key) || '@raw';
  const selHtml = (x, m, have) => {
    const v = choice(x, m);
    const own = new Map(have);
    if (m && m.key) own.delete(m.key);   // u vlastního řádku neukazovat „(má A 1)“ sám na sebe
    return `<select data-lka="${x.n}" aria-label="Skříňka ${esc(lkLabel(x))}: ${esc(x.text)}">
      <option value="@raw"${v === '@raw' ? ' selected' : ''}>— nerozhodnuto: nechat napsané jméno —</option>
      <option value="@gone"${v === '@gone' ? ' selected' : ''}>Už u nás nepracuje → K vyklizení</option>
      <option value="@free"${v === '@free' ? ' selected' : ''}>Volná (jméno zahodit)</option>
      ${lkPeopleOptions(v[0] === '@' ? '' : v, m ? [...new Set([...(m.key ? [m.key] : []), ...m.cand])] : [], own)}</select>`;
  };
  const rowHtml = (x, have) => {
    const m = by.get(x.n), v = choice(x, m), e = v[0] !== '@' ? S.employees[v] : null;
    const how = m && m.key ? `<span class="tag ${m.how === 'exact' || m.how === 'manual' ? 'ok' : 'acc'}">${esc(LK_HOW[m.how] || m.how)}</span>` : '';
    const warn = e && e.excluded ? '<span class="tag crit">vyřazený → K vyklizení</span>' : v === '@gone' ? '<span class="tag crit">K vyklizení</span>' : '';
    return `<tr><td class="lk-lab" data-label="Skříňka"><b>${esc(lkLabel(x))}</b></td><td class="lk-raw" data-label="Napsáno">„${esc(x.text)}“</td>
      <td class="lk-pick" data-label="Přiřadit k">${selHtml(x, m, have)}<span class="lk-tags">${how}${warn}</span></td></tr>`;
  };
  const sum = () => {
    let used = 0, unsure = 0, gone = 0, free = p.items.length - named.length, ex = 0;
    named.forEach(x => {
      const v = choice(x, by.get(x.n));
      if (v === '@raw') unsure += 1; else if (v === '@gone') gone += 1; else if (v === '@free') free += 1;
      else { used += 1; if (S.employees[v] && S.employees[v].excluded) ex += 1; }
    });
    return { used, unsure, gone, free, ex };
  };
  const body = () => {
    const have = haveLocker(), s = sum();
    const open = named.filter(x => !sure.has(x.n));
    const auto = named.filter(x => sure.has(x.n));
    const removed = replace ? lkList().filter(l => !labels.has(`${l.row}|${l.no}`)).length : 0;
    return `<div class="stats lk-sum">
        ${statTile('Skříněk', String(p.items.length), p.header ? 'bez řádku s nadpisy' : 'ze schránky')}
        ${statTile('Spárováno', String(s.used), s.ex ? `z toho vyřazení ${s.ex} → K vyklizení` : 's lidmi z Lidí', 'good')}
        ${statTile('K rozhodnutí', String(s.unsure), s.unsure ? 'zůstanou nespárované' : 'všechno rozhodnuto', s.unsure ? 'warn' : '')}
        ${statTile('Volné', String(s.free), s.gone ? `+ ${s.gone} už nepracuje` : 'bez jména')}</div>
      ${p.dup.length ? `<div class="note w">Dvakrát ve schránce (použije se první řádek): ${esc(p.dup.slice(0, 20).join(', '))}${p.dup.length > 20 ? ' …' : ''}</div>` : ''}
      ${p.skipped.length ? `<div class="note w">Bez čísla skříňky (vynechá se): ${p.skipped.slice(0, 12).map(x => `řádek ${x.n}${x.text ? ` „${esc(x.text)}“` : ''}`).join(', ')}${p.skipped.length > 12 ? ' …' : ''}</div>` : ''}
      ${open.length ? `<h3 class="lk-h">K rozhodnutí <span class="tag warn">${open.length}</span></h3>
        <p class="small muted">Jméno nesedí jistě na nikoho z Lidí. Vyber člověka (nahoře návrhy, pak lidé ještě bez skříňky), nebo „Už u nás nepracuje“: skříňka se ukáže jako K vyklizení.</p>
        <div class="table-card flat lk-dlgtab"><table class="stack lk-tab"><thead><tr><th>Skříňka</th><th>Napsáno</th><th>Přiřadit k</th></tr></thead><tbody>${open.map(x => rowHtml(x, have)).join('')}</tbody></table></div>`
        : named.length ? `<p class="lk-okline">${I.check}<span>Všechna jména se spárovala jistě.</span></p>` : ''}
      ${auto.length ? `<details class="lk-auto"${open.length ? '' : ' open'}><summary><b>Spárováno automaticky: ${auto.length}</b> <span class="muted small">přesně, bez háčků, prohozené pořadí, jen příjmení, iniciála nebo překlep; jde změnit</span></summary>
        <div class="table-card flat lk-dlgtab"><table class="stack lk-tab"><thead><tr><th>Skříňka</th><th>Napsáno</th><th>Přiřadit k</th></tr></thead><tbody>${auto.map(x => rowHtml(x, have)).join('')}</tbody></table></div></details>` : ''}
      ${lkList().length ? `<label class="check lk-replace"><input type="checkbox" data-lkreplace${replace ? ' checked' : ''}><span>Nahradit celý soupis: skříňky, které ve schránce nejsou${replace ? ` (${removed})` : ''}, se smažou. Bez zaškrtnutí se jen přepíšou skříňky se stejným písmenem a číslem.</span></label>` : ''}`;
  };
  const res = await dialog({
    title: 'Vložit soupis skříněk', ok: 'Uložit soupis', wide: true,
    html: `<div id="lkBody">${body()}</div><p class="tiny muted">Jména se párovala jen v tomhle prohlížeči, nikam neodešla.</p>`,
    onOpen: dlg => {
      const bx = $('#lkBody', dlg);
      bx.addEventListener('change', event => {
        const t = event.target;
        if (t.dataset.lka != null) {
          const n = +t.dataset.lka, v = t.value;
          if (v[0] === '@') { dec.set(n, v); assign.set(n, ''); } else { dec.delete(n); assign.set(n, v); }
          by = run();
          const det = $('details.lk-auto', bx), wasOpen = det && det.open;
          bx.innerHTML = body();
          if (wasOpen && $('details.lk-auto', bx)) $('details.lk-auto', bx).open = true;
          const again = bx.querySelector(`[data-lka="${n}"]`);
          if (again) again.focus();
        } else if (t.matches('[data-lkreplace]')) { replace = t.checked; bx.innerHTML = body(); }
      });
    },
  });
  if (res.value !== 'ok') return;
  by = run();
  const rows = p.items.map(x => {
    if (!x.text) return { row: x.row, no: x.no };
    const m = by.get(x.n), v = choice(x, m);
    if (v === '@gone') return { row: x.row, no: x.no, gone: x.text, raw: x.text };
    if (v === '@free') return { row: x.row, no: x.no };
    if (v === '@raw') return { row: x.row, no: x.no, raw: x.text };
    return { row: x.row, no: x.no, key: v, raw: x.text };
  });
  const out = lkApply(S, rows, { replace }, { by: ui.me ? ui.me.label : '' });
  const ov = lkOverview(S.lockers, S.employees, todayIso());
  store.note = { kind: 'locker', text: `Vložen soupis skříněk (${p.items.length}): nově ${out.added}, přepsáno ${out.updated}${out.removed ? `, smazáno ${out.removed}` : ''} · obsazené ${ov.used}, nespárované ${ov.unknown}, K vyklizení ${ov.clear}, volné ${ov.free}` };
  save();
  lkUi().f = ov.clear ? 'clear' : ov.unknown ? 'unknown' : 'all';
  lkUi().n = LK_PAGE;
  renderAll();
  toast(`Soupis uložen: ${p.items.length} ${lkN(p.items.length)}${ov.clear ? `, k vyklizení ${ov.clear}` : ''}${ov.unknown ? `, nespárováno ${ov.unknown}` : ''}.`);
}
/** Okno pro vložení (tlačítko, telefon): tabulka vložená do pole se rovnou zpracuje. */
async function lkPasteBox() {
  let got = null;
  const res = await dialog({
    title: 'Vložit soupis skříněk', ok: 'Pokračovat',
    html: `<p class="small">V Excelu označ sloupce <b>A</b> (písmeno řady), <b>B</b> (číslo skříňky) a <b>C</b> (jméno a příjmení), zkopíruj je a vlož sem.</p>
      <label class="field"><span>Tabulka z Excelu</span><textarea name="t" rows="7" class="lk-pastebox" placeholder="A&#9;1&#9;Jan Novák" autofocus></textarea></label>`,
    onOpen: dlg => {
      $('textarea[name="t"]', dlg).addEventListener('paste', event => {
        const d = event.clipboardData;
        if (!d) return;
        const html = d.getData('text/html'), text = d.getData('text/plain');
        if (!(html && /<t[dh][\s>]/i.test(html)) && !/\t/.test(text)) return;   // obyčejný text ať se vloží do pole
        event.preventDefault();
        got = { html, text };
        dlg.close('ok');
      });
    },
  });
  if (res.value !== 'ok') return;
  const src = got || { html: '', text: res.form.elements.namedItem('t').value };
  if (!String(src.text || src.html).trim()) return;
  lkPaste(src.html, src.text);
}

/* ---------- úpravy jedné skříňky ---------- */
async function lkAssignDialog(id) {
  const l = lkFind(S, id);
  if (!l) return;
  const have = new Map();
  lkList().forEach(x => { if (x.id !== id) lkKeys(x).forEach(k => have.set(k, have.has(k) ? `${have.get(k)}, ${lkLabel(x)}` : lkLabel(x))); });
  const cand = l.raw ? lkMatch([{ n: 1, text: l.raw }], S.employees)[0] : null;
  const sug = cand ? [...new Set([...(cand.key ? [cand.key] : []), ...cand.cand])] : [];
  const cur = l.key || (l.gone ? '@gone' : '');
  const res = await dialog({
    title: `Skříňka ${lkLabel(l)}`, ok: 'Uložit',
    html: `${l.raw && !l.key ? `<p class="small">V soupisu bylo napsáno <b>„${esc(l.raw)}“</b>.</p>` : ''}${(l.more || []).length ? `<p class="small">Skříňku sdílí i <b>${esc(l.more.map(m => lkName(S.employees[m.key]) || m.name).join(', '))}</b>: změna hlavního člověka je nechá, volná nebo „už nepracuje“ skříňku uvolní celou.</p>` : ''}
      <label class="field"><span>Komu patří</span><select name="who" autofocus>
        <option value=""${cur === '' ? ' selected' : ''}>— volná (nikdo) —</option>
        <option value="@gone"${cur === '@gone' ? ' selected' : ''}>Už u nás nepracuje → K vyklizení</option>
        ${lkPeopleOptions(cur[0] === '@' ? '' : cur, sug, have)}</select></label>
      <label class="check" id="lkMoveBox" hidden><input type="checkbox" name="move" checked><span id="lkMoveTxt"></span></label>`,
    onOpen: dlg => {
      const sel = $('select[name="who"]', dlg), box = $('#lkMoveBox', dlg);
      const upd = () => { const h = have.get(sel.value); box.hidden = !h; if (h) $('#lkMoveTxt', dlg).textContent = `Přesun: dosavadní skříňku ${h} uvolnit`; };
      sel.addEventListener('change', upd);
      upd();
    },
  });
  if (res.value !== 'ok') return;
  const who = res.form.elements.namedItem('who').value;
  const meta = { by: ui.me ? ui.me.label : '' };
  if (who === (l.key || (l.gone ? '@gone' : ''))) return;
  if (who === '@gone') lkSetGone(S, id, '', meta);
  else if (!who) lkFree(S, id, meta);
  else {
    const r = lkAssign(S, id, who, meta);
    if (r.err) { toast(r.err, true); return; }
    const move = res.form.elements.namedItem('move');
    if (move && move.checked && !$('#lkMoveBox').hidden) lkOf(who).filter(x => x.id !== id).forEach(x => lkRemovePerson(S, x.id, who, meta));
  }
  save();
  renderAll();
}
/** Člověku přidělí skříňku: volnou (první předvybraná), nebo sdílet obsazenou (2.82). */
async function lkGiveDialog(key) {
  const e = S.employees[key];
  if (!e) return;
  const rows = lkOverview(S.lockers, S.employees, todayIso()).rows;
  const free = rows.filter(x => x.st === 'free').map(x => x.l), used = rows.filter(x => x.st === 'used' && !lkHas(x.l, key));
  if (!free.length && !used.length) { toast('Žádná skříňka není volná ani obsazená. Přidej řadu skříněk.', true); return; }
  const res = await dialog({
    title: `Skříňka pro ${lkName(e)}`, ok: 'Přidělit',
    html: `<label class="field"><span>Skříňka</span><select name="lk" autofocus>
      ${free.length ? `<optgroup label="Volné">${free.map((l, i) => `<option value="${esc(l.id)}"${i ? '' : ' selected'}>${esc(lkLabel(l))}${l.note ? ` · ${esc(l.note)}` : ''}</option>`).join('')}</optgroup>` : ''}
      ${used.length ? `<optgroup label="Sdílet obsazenou">${used.map(x => `<option value="${esc(x.l.id)}">${esc(lkLabel(x.l))} · ${esc(lkWho(x))}</option>`).join('')}</optgroup>` : ''}</select></label>
      ${free.length ? '' : '<p class="small muted">Žádná skříňka není volná, jde jen sdílet obsazenou.</p>'}`,
  });
  if (res.value !== 'ok') return;
  const id = res.form.elements.namedItem('lk').value, meta = { by: ui.me ? ui.me.label : '' }, l = lkFind(S, id);
  const r = l && l.key ? lkAddPerson(S, id, key, meta) : lkAssign(S, id, key, meta);
  if (r.err) { toast(r.err, true); return; }
  save();
  renderAll();
  toast(`${lkName(e)}: skříňka ${lkLabel(r.l)}${lkKeys(r.l).length > 1 ? ' (sdílená)' : ''}.`);
}
/** Další člověk do obsazené skříňky (sdílená, 2.82). */
async function lkAddPersonDialog(id) {
  const l = lkFind(S, id);
  if (!l) return;
  const have = new Map();
  lkList().forEach(x => { if (x.id !== id) lkKeys(x).forEach(k => have.set(k, have.has(k) ? `${have.get(k)}, ${lkLabel(x)}` : lkLabel(x))); });
  const inIt = new Set(lkKeys(l));
  const res = await dialog({
    title: `Další člověk do skříňky ${lkLabel(l)}`, ok: 'Přidat',
    html: `<p class="small">Skříňku teď má <b>${esc(lkKeys(l).map(k => lkName(S.employees[k]) || lkNameIn(l, k)).join(', '))}</b>. Přidaný ji bude sdílet.</p>
      <label class="field"><span>Kdo</span><select name="who" autofocus><option value="">— vyber člověka —</option>${lkPeopleOptions('', [], have, inIt)}</select></label>
      <label class="check" id="lkMoveBox" hidden><input type="checkbox" name="move" checked><span id="lkMoveTxt"></span></label>`,
    onOpen: dlg => {
      const sel = $('select[name="who"]', dlg), box = $('#lkMoveBox', dlg);
      const upd = () => { const h = have.get(sel.value); box.hidden = !h; if (h) $('#lkMoveTxt', dlg).textContent = `Přesun: z dosavadní skříňky ${h} ho odebrat`; };
      sel.addEventListener('change', upd);
      upd();
    },
    validate: form => (form.elements.namedItem('who').value ? '' : 'Vyber člověka.'),
  });
  if (res.value !== 'ok') return;
  const who = res.form.elements.namedItem('who').value, meta = { by: ui.me ? ui.me.label : '' };
  const r = lkAddPerson(S, id, who, meta);
  if (r.err) { toast(r.err, true); return; }
  const move = res.form.elements.namedItem('move');
  if (move && move.checked && !$('#lkMoveBox').hidden) lkOf(who).filter(x => x.id !== id).forEach(x => lkRemovePerson(S, x.id, who, meta));
  save();
  renderAll();
  toast(`${lkName(S.employees[who])} přidán do skříňky ${lkLabel(r.l)}.`);
}
async function lkRangeDialog() {
  const res = await dialog({
    title: 'Přidat řadu skříněk', ok: 'Přidat',
    html: `<p class="small muted">Přidá prázdné (volné) skříňky. Ty, které už v soupisu jsou, zůstanou beze změny.</p>
      <div class="form-grid lk-range"><label class="field"><span>Písmeno řady</span><input name="row" maxlength="6" autocapitalize="characters" placeholder="A" autofocus></label>
      <label class="field"><span>Od čísla</span><input name="from" type="number" min="0" step="1" value="1" required></label>
      <label class="field"><span>Do čísla</span><input name="to" type="number" min="0" step="1" value="40" required></label></div>`,
    validate: form => {
      const f = parseInt(form.elements.namedItem('from').value, 10), t = parseInt(form.elements.namedItem('to').value, 10);
      if (!Number.isFinite(f) || !Number.isFinite(t) || f < 0 || t < 0) return 'Zadej čísla od a do.';
      if (Math.abs(t - f) + 1 > LK_RANGE_MAX) return `Najednou nejvýš ${LK_RANGE_MAX} skříněk.`;
      return '';
    },
  });
  if (res.value !== 'ok') return;
  const el = n => res.form.elements.namedItem(n).value;
  const row = lkRowNorm(el('row'));
  const r = lkAddRange(S, row, el('from'), el('to'), { by: ui.me ? ui.me.label : '' });
  if (r.err && !r.added) { toast(r.err, true); return; }
  if (!r.added) { toast(`Všechny skříňky ${row ? `řady ${row} ` : ''}už v soupisu jsou.`); return; }
  const a = Math.min(+el('from'), +el('to')), b = Math.max(+el('from'), +el('to'));
  store.note = { kind: 'locker', text: `Přidána řada skříněk ${row ? `${row} ` : ''}${a}–${b}: ${r.added} ${lkN(r.added)}${r.skip ? ` (${r.skip} už v soupisu byly)` : ''}` };
  save();
  lkUi().f = 'all';
  renderAll();
  toast(`Přidáno ${r.added} ${lkN(r.added)}${r.skip ? `, ${r.skip} už v soupisu bylo` : ''}.${r.err ? ` ${r.err}` : ''}`);
}
async function exportLockersXlsx() {
  const today = todayIso();
  try {
    const X = await xlsx();
    const wb = X.utils.book_new();
    lkSheets(S.lockers, S.employees, today, S.positions).forEach(sh => {
      const ws = X.utils.aoa_to_sheet(sh.rows.map(row => row.map(safeCell)));
      ws['!cols'] = sh.rows[0].map((h, i) => ({ wch: sh.name === 'Skříňky' ? [9, 6, 7, 26, 10, 18, 13, 40, 24, 30][i] || 12 : [28, 10, 20, 9][i] || 12 }));
      X.utils.book_append_sheet(wb, ws, sh.name);
    });
    downloadFile(`skrinky-${today}.xlsx`, new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch (error) { toast(`Export se nepovedl: ${error.message}`, true); }
}

/* ---------- štítky (Zebra 100 × 35 mm) ----------
   Jeden štítek = jedna strana PDF o velikosti štítku. Štítek na skříňku: velké označení, beze jména.
   Štítek na záložní klíč: označení a „ZÁLOŽNÍ KLÍČ“ jen na levé polovině; pravou polovinou se klíč
   zalepí (ochrana proti zneužití: pozná se, jestli byl klíč rozbalený). Značky přehybu uprostřed. */
const LK_LBL = { W: 100, H: 35 };
function lkFit(doc, text, maxW, maxPt) {
  doc.setFontSize(maxPt);
  const w = doc.getTextWidth(text);
  return w > maxW ? Math.max(8, maxPt * maxW / w) : maxPt;
}
function lkDrawLabel(doc, x) {
  const { W, H } = LK_LBL;
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setFillColor(0, 0, 0);
  if (x.kind === 'notice') {
    // výzva k vyklizení (2.81): černý pruh s nadpisem a označením, kdo a do kdy, co bude potom, kdy vyvěšeno
    const t = x.lines, M = 3, CW = W - 2 * M;
    doc.rect(M, 2.5, CW, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('Plex', 'bold');
    doc.setFontSize(lkFit(doc, t.title, CW * 0.52, 11.5));
    doc.text(t.title, M + 2, 6.6, { baseline: 'middle', charSpace: 0.25 });
    doc.setFontSize(lkFit(doc, t.label, CW * 0.42, 12.5));
    doc.text(t.label, W - M - 2, 6.6, { align: 'right', baseline: 'middle' });
    doc.setTextColor(0, 0, 0);
    doc.setFont('Plex', 'normal');
    doc.setFontSize(lkFit(doc, t.ask, CW - 2, 9.2));
    doc.text(t.ask, M + 1, 15.6);
    doc.setFont('Plex', 'bold');
    doc.setFontSize(lkFit(doc, t.until, CW - 2, 10.5));
    doc.text(t.until, M + 1, 20.6);
    doc.setFont('Plex', 'normal');
    doc.setFontSize(lkFit(doc, t.then, CW - 2, 9.2));
    doc.text(t.then, M + 1, 25.6);
    doc.setFontSize(7.5);
    doc.text(t.at, M + 1, 31.4);
    return;
  }
  if (x.kind === 'test') {
    // zkušební štítek: rámeček 1 mm od okraje, čárky po 10 mm, kříž uprostřed (pozná se zmenšení i posun)
    doc.setLineWidth(0.3);
    doc.line(1, 1, W - 1, 1); doc.line(W - 1, 1, W - 1, H - 1); doc.line(W - 1, H - 1, 1, H - 1); doc.line(1, H - 1, 1, 1);
    for (let m = 10; m < W; m += 10) { doc.line(m, 1, m, 3); doc.line(m, H - 1, m, H - 3); }
    doc.line(W / 2 - 3, H / 2, W / 2 + 3, H / 2); doc.line(W / 2, H / 2 - 3, W / 2, H / 2 + 3);
    doc.setFont('Plex', 'bold');
    doc.setFontSize(12);
    doc.text('ZKUŠEBNÍ ŠTÍTEK 100 × 35 mm', W / 2, 9.5, { align: 'center', baseline: 'middle' });
    doc.setFont('Plex', 'normal');
    doc.setFontSize(7.5);
    doc.text('Rámeček má být celý, 1 mm od okraje. Čárky po 10 mm.', W / 2, 26.5, { align: 'center', baseline: 'middle' });
    doc.text(x.text || '', W / 2, 30.5, { align: 'center', baseline: 'middle' });
    return;
  }
  if (x.kind === 'locker') {
    doc.setFont('Plex', 'normal');
    doc.setFontSize(8);
    doc.text('SKŘÍŇKA', 4, 6.2, { charSpace: 0.5 });
    doc.setFont('Plex', 'bold');
    doc.setFontSize(lkFit(doc, x.text, W - 10, 72));
    doc.text(x.text, W / 2, 21.5, { align: 'center', baseline: 'middle' });
    return;
  }
  const hw = W / 2, cx = hw / 2;
  doc.setFont('Plex', 'normal');
  doc.setFontSize(7);
  doc.text('SKŘÍŇKA', 4, 5.8, { charSpace: 0.4 });
  doc.setFont('Plex', 'bold');
  doc.setFontSize(lkFit(doc, x.text, hw - 8, 46));
  doc.text(x.text, cx, 15.6, { align: 'center', baseline: 'middle' });
  // černý pruh s nápisem (bílý text), ať je na první pohled jasné, že jde o záložní klíč
  doc.rect(3, 24.5, hw - 6, 7.4, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(lkFit(doc, 'ZÁLOŽNÍ KLÍČ', hw - 10, 11));
  doc.text('ZÁLOŽNÍ KLÍČ', cx, 28.3, { align: 'center', baseline: 'middle', charSpace: 0.3 });
  doc.setTextColor(0, 0, 0);
  // značky přehybu (pravá polovina zůstane prázdná, tou se klíč zalepí)
  doc.setLineWidth(0.35);
  doc.line(hw, 0, hw, 3);
  doc.line(hw, H - 3, hw, H);
}
async function lkLabelsPdf(list, opts, name, how) { return lkOutput(lkLabelSeq(list, opts), `stitky-skrinky-${name}`, `Štítky skříněk ${name}`, how); }
/* ---------- Tisk štítků (2.81) ----------
   Štítek se nakreslí stejnými příkazy jako do PDF (lkDrawLabel) do černobílé bitmapy 8 bodů na mm
   (Zebra 203 dpi: 800 × 280 bodů). Z ní je:
   1. ZPL (^XA^PW800^LL280^LH0,0 … ^PQ1^XZ, lkZplLabel v core): s aplikací Zebra Browser Print jde rovnou
      do tiskárny, bez okna tisku; nebo se stáhne;
   2. tisk přes okno tisku: obrázky štítků ve stránce, která má @page 100 × 35 mm bez okrajů (Chrome pak
      velikost papíru, okraje ani měřítko nenabízí, vybere se jen tiskárna). Nezávisí na prohlížeči PDF;
      dřívější PDF ve skrytém rámci se v prohlížeči s „PDF stahovat“ jen stáhlo.
   PDF (vektorové, s textem) zůstává jen ke stažení. */
function lkDesktop() { return !(window.matchMedia && window.matchMedia('(max-width: 900px), (pointer: coarse)').matches); }
let lkFontsReady = null;
function lkCanvasFonts() {
  if (!lkFontsReady) {
    lkFontsReady = (async () => {
      const [r, b] = await Promise.all([pdfAsset('pdf-regular.ttf'), pdfAsset('pdf-semibold.ttf')]);
      const buf = x => Uint8Array.from(atob(x), c => c.charCodeAt(0)).buffer;
      const faces = [new FontFace('LkPlex', buf(r), { weight: '400' }), new FontFace('LkPlex', buf(b), { weight: '600' })];
      await Promise.all(faces.map(f => f.load()));
      faces.forEach(f => document.fonts.add(f));
    })().catch(error => { lkFontsReady = null; throw error; });
  }
  return lkFontsReady;
}
/** Stejné rozhraní jako jsPDF (jen to, co kreslí štítky), milimetry → body (K na mm). */
function lkCanvasDoc(ctx, K = LK_DOTS) {
  const PT = 25.4 / 72, st = { size: 10, bold: false, color: '#000', fill: '#000', stroke: '#000', lw: 0.2 };
  const font = () => { ctx.font = `${st.bold ? 600 : 400} ${st.size * PT * K}px LkPlex`; };
  const rgb = (r, g, b) => `rgb(${r},${g},${b})`;
  return {
    setTextColor(r, g, b) { st.color = rgb(r, g, b); },
    setDrawColor(r, g, b) { st.stroke = rgb(r, g, b); },
    setFillColor(r, g, b) { st.fill = rgb(r, g, b); },
    setFont(name, style) { st.bold = style === 'bold'; },
    setFontSize(pt) { st.size = pt; },
    setLineWidth(mm) { st.lw = mm; },
    getTextWidth(t) { font(); ctx.letterSpacing = '0px'; return ctx.measureText(t).width / K; },
    text(t, x, y, o = {}) {
      font();
      ctx.fillStyle = st.color;
      ctx.letterSpacing = `${(o.charSpace || 0) * K}px`;
      ctx.textAlign = o.align === 'center' || o.align === 'right' ? o.align : 'left';
      ctx.textBaseline = o.baseline === 'middle' ? 'middle' : 'alphabetic';
      ctx.fillText(t, x * K, y * K);
      ctx.letterSpacing = '0px';
    },
    rect(x, y, w, h) { ctx.fillStyle = st.fill; ctx.fillRect(x * K, y * K, w * K, h * K); },
    line(x1, y1, x2, y2) { ctx.strokeStyle = st.stroke; ctx.lineWidth = Math.max(1, st.lw * K); ctx.beginPath(); ctx.moveTo(x1 * K, y1 * K); ctx.lineTo(x2 * K, y2 * K); ctx.stroke(); },
  };
}
/** Štítky do černobílých bitmap (bits pro ZPL), nebo do PNG (obrázky pro tisk). */
async function lkRender(seq, out) {
  await lkCanvasFonts();
  const cv = document.createElement('canvas');
  cv.width = LK_ZW;
  cv.height = LK_ZH;
  const ctx = cv.getContext('2d', { willReadFrequently: true }), doc = lkCanvasDoc(ctx), res = [];
  for (const x of seq) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, LK_ZW, LK_ZH);
    lkDrawLabel(doc, x);
    const img = ctx.getImageData(0, 0, LK_ZW, LK_ZH), px = img.data, bits = new Uint8Array(LK_ZW * LK_ZH);
    for (let i = 0; i < bits.length; i += 1) {
      const b = px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2] < 384 ? 1 : 0;
      bits[i] = b;
      if (out === 'png') { const v = b ? 0 : 255; px[i * 4] = v; px[i * 4 + 1] = v; px[i * 4 + 2] = v; px[i * 4 + 3] = 255; }
    }
    if (out === 'png') { ctx.putImageData(img, 0, 0); res.push(await new Promise(r => cv.toBlob(r, 'image/png'))); }
    else res.push(bits);
  }
  return res;
}
async function lkZplFor(seq) { return (await lkRender(seq, 'bits')).map(lkZplLabel).join('\n'); }
/** Tisk přes okno tisku: obrázky štítků, stránka 100 × 35 mm bez okrajů jen po dobu tisku (CSSStyleSheet,
    CSP inline styly nepovoluje), po tisku se vše uklidí. */
let lkPageSheet = null;
function lkPrintCleanup() {
  const a = $('#lkPrintArea');
  if (a) { $$('img', a).forEach(i => URL.revokeObjectURL(i.src)); a.remove(); }
  document.body.classList.remove('lk-printing');
  if (lkPageSheet) document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => s !== lkPageSheet);
}
async function lkPrintImages(blobs) {
  lkPrintCleanup();
  const area = document.createElement('div');
  area.id = 'lkPrintArea';
  area.className = 'lk-printarea';
  area.setAttribute('aria-hidden', 'true');
  const imgs = blobs.map(b => {
    const d = document.createElement('div'), i = new Image();
    d.className = 'lk-plabel';
    i.alt = '';
    i.src = URL.createObjectURL(b);
    d.append(i);
    area.append(d);
    return i;
  });
  document.body.append(area);
  await Promise.all(imgs.map(i => i.decode().catch(() => {})));
  if (!lkPageSheet) { lkPageSheet = new CSSStyleSheet(); lkPageSheet.replaceSync(`@page { size: ${LK_LBL.W}mm ${LK_LBL.H}mm; margin: 0; }`); }
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, lkPageSheet];
  document.body.classList.add('lk-printing');
  window.addEventListener('afterprint', lkPrintCleanup, { once: true });
  window.print();
}
async function lkPdfDownload(seq, file, title) {
  await pdfLib();
  const [regular, semibold] = await Promise.all([pdfAsset('pdf-regular.ttf'), pdfAsset('pdf-semibold.ttf')]);
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: [LK_LBL.W, LK_LBL.H], orientation: 'landscape', compress: true });
  doc.addFileToVFS('Plex-Regular.ttf', regular);
  doc.addFont('Plex-Regular.ttf', 'Plex', 'normal');
  doc.addFileToVFS('Plex-SemiBold.ttf', semibold);
  doc.addFont('Plex-SemiBold.ttf', 'Plex', 'bold');
  doc.setProperties({ title, creator: 'HALA 2' });
  doc.viewerPreferences({ PrintScaling: 'None', PickTrayByPDFSize: true, NumCopies: 1 });
  seq.forEach((x, i) => { if (i) doc.addPage([LK_LBL.W, LK_LBL.H], 'landscape'); lkDrawLabel(doc, x); });
  downloadFile(`${file}.pdf`, doc.output('blob'), 'application/pdf');
}
/** Zebra Browser Print (aplikace od Zebry na počítači): výchozí tiskárna, nebo null. Výsledek se chvíli pamatuje. */
const LK_ZB_HOSTS = ['http://127.0.0.1:9100/', 'https://localhost:9101/'];
async function lkZebra(force = false) {
  const now = Date.now(), z = ui.zebra;
  if (!force && z && now - z.at < (z.dev ? 30 : 5) * 60000) return z.dev ? z : null;
  for (const host of LK_ZB_HOSTS) {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 2500);
    try {
      const r = await fetch(`${host}default?type=printer`, { signal: ctl.signal, cache: 'no-store' });
      const dev = r.ok ? JSON.parse((await r.text()) || 'null') : null;
      if (dev && dev.name) { ui.zebra = { at: now, host, dev }; return ui.zebra; }
    } catch (error) { /* Browser Print tu neběží */ } finally { clearTimeout(tm); }
  }
  ui.zebra = { at: now, dev: null };
  return null;
}
async function lkZebraSend(z, zpl) {
  const r = await fetch(`${z.host}write`, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ device: z.dev, data: zpl }) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}
/** Výstup štítků: how '' = tisk (Zebra Browser Print, jinak okno tisku), 'download' = PDF, 'zpl' = soubor ZPL. */
async function lkOutput(seq, file, title, how = '') {
  if (!seq.length) { toast('Není co tisknout.', true); return; }
  const n = `${seq.length} ${seq.length === 1 ? 'štítek' : seq.length <= 4 ? 'štítky' : 'štítků'} 100 × 35 mm`;
  try {
    if (how === 'zpl') { downloadFile(`${file}.zpl`, await lkZplFor(seq), 'text/plain'); toast(`ZPL pro Zebru: ${n}.`); return; }
    if (how === 'download') { await lkPdfDownload(seq, file, title); toast(`PDF: ${n}.`); return; }
    const zb = lkDesktop() ? await lkZebra() : null;
    if (zb) {
      try { await lkZebraSend(zb, await lkZplFor(seq)); toast(`Odesláno na Zebru ${zb.dev.name}: ${n}.`); return; }
      catch (error) { ui.zebra = null; toast(`Zebra Browser Print neodpověděl (${error.message}), otevírám okno tisku.`, true); }
    }
    toast(`Tisk: ${n}.`);
    await lkPrintImages(await lkRender(seq, 'png'));
  } catch (error) { toast(`Štítky se nepodařilo připravit: ${error.message}`, true); }
}
/** Výzvy k vyklizení (2.81): u skříňky bez výzvy se vyvěsí nová (dnes + 7 pracovních dnů, uloží se),
    u vyvěšené se vytiskne znovu se stejnou lhůtou. Skříňky, které už nejsou K vyklizení, se přeskočí. */
function lkNoticePrint(ids, how = '') {
  const today = todayIso(), meta = { by: ui.me ? ui.me.label : '' }, seq = [];
  let fresh = 0;
  ids.forEach(id => {
    const r = lkSetNotice(S, id, today, meta);
    if (r.err) return;
    if (r.fresh) fresh += 1;
    seq.push({ kind: 'notice', id, lines: lkNoticeLines(r.l, r.n) });
  });
  if (!seq.length) { toast('Žádná z vybraných skříněk není K vyklizení.', true); return; }
  if (fresh) { save(); renderAll(); }
  const one = seq.length === 1 ? lkLabel(lkFind(S, seq[0].id)).replace(/\s+/g, '') : '';
  lkOutput(seq, one ? `vyzva-skrinka-${one}` : `vyzvy-skrinky-${today}`, 'Výzva k vyklizení skříňky', how);
}
/** Štítky jedné skříňky (oba). */
function lkLabelsOne(id) {
  const l = lkFind(S, id);
  if (l) lkLabelsPdf([l], {}, lkLabel(l).replace(/\s+/g, ''));
}
/** Hromadný tisk: všechny, zobrazené ve filtru, nebo jedna řada; druhy štítků. */
async function lkLabelsDialog() {
  const all = lkList();
  if (!all.length) { toast('Soupis skříněk je prázdný.', true); return; }
  const u = lkUi(), ov = lkOverview(S.lockers, S.employees, todayIso()), q = norm(u.q.trim());
  const shown = u.f === 'without' ? [] : ov.rows.filter(x => lkInFilter(x, u.f, ov) && lkMatchQ(x, q)).map(x => x.l);
  const rows = [...new Set(all.map(l => l.row))];
  const filtered = shown.length && shown.length < all.length;
  const res = await dialog({
    title: 'Tisk štítků skříněk', ok: 'Tisknout',
    html: `<div class="lk-lblpick">
        <label class="check"><input type="radio" name="which" value="all" checked><span>Všechny skříňky (${all.length})</span></label>
        ${filtered ? `<label class="check"><input type="radio" name="which" value="shown"><span>Jen zobrazené ve filtru (${shown.length})</span></label>` : ''}
        ${rows.length > 1 ? `<label class="check lk-lblrow"><input type="radio" name="which" value="row"><span>Jen řada</span><select name="row" aria-label="Řada">${rows.map(r => `<option value="${esc(r)}">${esc(r || '(bez písmene)')} · ${all.filter(l => l.row === r).length}</option>`).join('')}</select></label>` : ''}
        <label class="check"><input type="radio" name="which" value="test"><span>Zkušební štítek (kontrola velikosti a okrajů)</span></label>
      </div>
      <div class="lk-lblpick"><label class="check"><input type="checkbox" name="locker" checked><span>Štítek na skříňku (označení, beze jména)</span></label>
        <label class="check"><input type="checkbox" name="key" checked><span>Štítek na záložní klíč (polovina s nápisem, druhou polovinou se klíč zalepí)${ov.nokey ? `; ${ov.nokey} ${lkN(ov.nokey)} bez záložního klíče se vynechá` : ''}</span></label></div>
      <label class="field lk-out"><span>Výstup</span><select name="out"><option value="">Tisknout</option><option value="download">Stáhnout PDF</option><option value="zpl">Stáhnout ZPL pro Zebru</option></select></label>
      <p class="small muted lk-printhint" id="lkZbState">Hledám Zebra Browser Print…</p>`,
    onOpen: dlg => {
      const sel = $('select[name="row"]', dlg);
      if (sel) sel.addEventListener('change', () => { $('input[value="row"]', dlg).checked = true; });
      lkZebra(true).then(z => {
        const p = $('#lkZbState', dlg);
        if (!p) return;
        p.textContent = z ? `Tiskne se rovnou na Zebru ${z.dev.name} (Zebra Browser Print), bez okna tisku: ZPL 203 dpi, 800 × 280 bodů, 1 kopie.`
          : 'Otevře se okno tisku se štítky 100 × 35 mm bez okrajů (velikost papíru a měřítko jsou dané), stačí vybrat Zebru; prohlížeč si ji příště pamatuje. Úplně bez okna tisku tiskne aplikace Zebra Browser Print (od Zebry, nainstaluje se jednou do počítače).';
      });
    },
    validate: form => (form.elements.namedItem('which').value === 'test' || form.elements.namedItem('locker').checked || form.elements.namedItem('key').checked ? '' : 'Vyber aspoň jeden druh štítku.'),
  });
  if (res.value !== 'ok') return;
  const f = res.form.elements, which = f.namedItem('which').value;
  const row = which === 'row' ? f.namedItem('row').value : null;
  if (which === 'test') { lkOutput([{ kind: 'test', text: `HALA 2 · ${dayText(todayIso())}` }], 'zkusebni-stitek', 'Zkušební štítek', f.namedItem('out').value); return; }
  const list = which === 'shown' ? shown : row != null ? all.filter(l => l.row === row) : all;
  lkLabelsPdf(list, { locker: f.namedItem('locker').checked, key: f.namedItem('key').checked }, which === 'row' ? `rada-${row || 'bez'}` : todayIso(), f.namedItem('out').value);
}

function bindLockers() {
  $('#lkLabelsBtn').onclick = () => lkLabelsDialog();
  $('#lkPasteBtn').onclick = () => lkPasteBox();
  $('#lkRangeBtn').onclick = () => lkRangeDialog();
  $('#lkXlsx').onclick = () => exportLockersXlsx();
  const view = $('#lkView');
  view.addEventListener('click', async event => {
    const t = event.target.closest('button');
    if (!t || !S) return;
    const u = lkUi(), meta = { by: ui.me ? ui.me.label : '' };
    if (t.dataset.lkf != null) { u.f = t.dataset.lkf; u.n = LK_PAGE; renderLockers(); return; }
    if (t.dataset.lkmode) { u.mode = t.dataset.lkmode; renderLockers(); if (u.mode === 'keys') lkKStart(); return; }
    if (t.matches('[data-lkksave]')) { lkKeySave(); return; }
    if (t.matches('[data-lkknext]')) {
      const cur = lkByLabel(S.lockers, $('#lkKLock').value), nx = lkNextNoSerial(cur) || lkNextNoSerial(cur, true);
      $('#lkKLock').value = nx ? lkLabel(nx) : '';
      lkKInfo();
      $('#lkKSer').value = '';
      $('#lkKMsg').textContent = '';
      $('#lkKSer').focus();
      return;
    }
    if (t.dataset.lkkwalk) {
      u.walk = t.dataset.lkkwalk;
      $$('#lkView [data-lkkwalk]').forEach(b => { b.classList.toggle('on', b === t); b.setAttribute('aria-checked', String(b === t)); });
      $('#lkKLeft').textContent = lkKLeftText(lkOverview(S.lockers, S.employees, todayIso()));
      lkKStart();
      return;
    }
    if (t.dataset.lkkhave) {
      const l = lkFind(S, t.dataset.lkkhave);
      if (!l) return;
      lkSetNoKey(S, l.id, false);
      save();
      lkKFind();
      toast(`Skříňka ${lkLabel(l)}: záložní klíč nalezen. Vytiskni na něj štítek (Štítek klíče).`);
      return;
    }
    if (t.dataset.lkkprint) { const l = lkFind(S, t.dataset.lkkprint); if (l) lkOutput(lkLabelSeq([l], { locker: false }), `stitek-klice-${lkLabel(l).replace(/\s+/g, '')}`, 'Štítek klíče'); return; }
    if (t.dataset.lkkopen) { const l = lkFind(S, t.dataset.lkkopen); if (l) { u.mode = 'list'; u.f = 'all'; u.q = lkLabel(l); renderLockers(); } return; }
    if (t.matches('[data-lkmore]')) { u.n += LK_PAGE; renderLockers(); return; }
    if (t.matches('[data-lkpaste]')) { lkPasteBox(); return; }
    if (t.matches('[data-lkrange]')) { lkRangeDialog(); return; }
    if (t.dataset.lkperson) { openPersonKey(t.dataset.lkperson); return; }
    if (t.dataset.lkassign) { lkAssignDialog(t.dataset.lkassign); return; }
    if (t.dataset.lklbl) { lkLabelsOne(t.dataset.lklbl); return; }
    if (t.dataset.lknotice) { lkNoticePrint([t.dataset.lknotice]); return; }
    if (t.matches('[data-lknoticeall]')) { lkNoticePrint(lkOverview(S.lockers, S.employees, todayIso()).rows.filter(x => x.st === 'clear').map(x => x.l.id)); return; }
    if (t.dataset.lkfree) {
      const l = lkFind(S, t.dataset.lkfree);
      if (!l) return;
      const st = lkState(l, S.employees, todayIso()).st;
      if (st === 'used' && !(await confirmBox(`Uvolnit skříňku ${lkLabel(l)}?`, `${lkName(S.employees[l.key])} skříňku mít nebude, skříňka bude volná.`, 'Uvolnit'))) return;
      lkFree(S, l.id, meta);
      save();
      renderAll();
      if (st === 'clear') toast(`Skříňka ${lkLabel(l)} vyprázdněna, je volná.`);
      return;
    }
    if (t.dataset.lkdel) {
      const l = lkFind(S, t.dataset.lkdel);
      if (!l || !(await confirmBox(`Smazat skříňku ${lkLabel(l)}?`, 'Skříňka zmizí ze soupisu (třeba když fyzicky není). Jde vrátit přes Vrátit zpět v historii změn.', 'Smazat', true))) return;
      lkDelete(S, l.id);
      save();
      renderAll();
      return;
    }
    if (t.dataset.lkaddp) { lkAddPersonDialog(t.dataset.lkaddp); return; }
    if (t.dataset.lkrm) {
      const l = lkFind(S, t.dataset.lkrm), k = t.dataset.lkkey;
      if (!l || !lkHas(l, k)) return;
      const nm = lkName(S.employees[k]) || lkNameIn(l, k);
      if (!(await confirmBox(`Odebrat ze skříňky ${lkLabel(l)}?`, `${nm} skříňku ${lkLabel(l)} mít nebude, ostatní ji mají dál.`, 'Odebrat'))) return;
      lkRemovePerson(S, l.id, k, meta);
      save();
      renderAll();
      return;
    }
    if (t.dataset.lknokey) {
      const l = lkFind(S, t.dataset.lknokey);
      if (!l) return;
      lkSetNoKey(S, l.id, !l.nokey);
      save();
      renderLockers();
      toast(l.nokey ? `Skříňka ${lkLabel(l)}: není záložní klíč, štítek klíče se netiskne.` : `Skříňka ${lkLabel(l)}: záložní klíč je.`);
      return;
    }
    if (t.dataset.lkgive) lkGiveDialog(t.dataset.lkgive);
  });
  view.addEventListener('input', event => {
    const id = event.target.id;
    if (id === 'lkKLock') { lkKInfo(); lkKSerHint(); return; }
    if (id === 'lkKSer') { lkKSerHint(); return; }
    if (id === 'lkKFind') { lkKFind(); return; }
    if (id !== 'lkQ') return;
    clearTimeout(ui.lkQT);
    ui.lkQT = setTimeout(() => {
      const pos = event.target.selectionStart;
      lkUi().q = event.target.value; lkUi().n = LK_PAGE;
      renderLockers();
      const q = $('#lkQ');
      if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) { /* type=search */ } }
    }, 200);
  });
  view.addEventListener('change', event => {
    const t = event.target;
    if (t.dataset.lknote == null) return;
    const l = lkFind(S, t.dataset.lknote);
    if (!l) return;
    const note = String(t.value || '').replace(/\s+/g, ' ').trim().slice(0, LK_NOTE);
    if (note === (l.note || '')) return;
    lkSetNote(S, l.id, note);
    save();
  });
  view.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    const t = event.target;
    if (t.dataset && t.dataset.lknote != null) t.blur();
    else if (t.id === 'lkKLock') { event.preventDefault(); $('#lkKSer').focus(); }
    else if (t.id === 'lkKSer') { event.preventDefault(); lkKeySave(); }
  });
  // odkazy na Skříňky odjinud (detail člověka v Lidech)
  document.addEventListener('click', event => {
    const b = event.target.closest('[data-golk],[data-lkgive]');
    if (!b || !S || b.closest('#lkView')) return;
    if (b.dataset.lkgive) { lkGiveDialog(b.dataset.lkgive); return; }
    const u = lkUi(); u.f = b.dataset.golk || 'all'; u.q = ''; u.n = LK_PAGE;
    showView('skrinky');
  });
  // Ctrl+V kdekoli ve Skříňkách (mimo pole) vloží soupis z Excelu
  document.addEventListener('paste', event => {
    if (!S || ui.view !== 'skrinky' || document.querySelector('dialog[open]')) return;
    const t = event.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
    const d = event.clipboardData;
    if (!d) return;
    event.preventDefault();
    lkPaste(d.getData('text/html'), d.getData('text/plain'));
  });
}
