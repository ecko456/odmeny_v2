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
  return ls.length ? ` Má ${ls.length === 1 ? 'skříňku' : 'skříňky'} ${lkLabels(ls)}: ve Skříňkách se ukáže jako K vyklizení (je třeba vyprázdnit).` : '';
}
/** Po vyřazení nebo smazání člověka: hláška, že je třeba vyprázdnit jeho skříňku. */
function lkAfterLeave(key, name) {
  const ls = lkOf(key);
  if (ls.length) toast(`Je třeba vyprázdnit ${ls.length === 1 ? 'skříňku' : 'skříňky'} ${lkLabels(ls)}${name ? ` (${name})` : ''}.`, true);
}
/** Řádek do detailu člověka v Lidech. */
function lkPersonHtml(e) {
  if (!e || !S.lockers) return '';
  const ls = lkOf(e.key);
  if (ls.length && e.excluded) return `<div class="note e lk-person"><b>Je třeba vyprázdnit ${ls.length === 1 ? 'skříňku' : 'skříňky'} ${esc(lkLabels(ls))}.</b> Vyřazený ze seznamu pořád má skříňku. <button class="btn small" type="button" data-golk="clear">Skříňky</button></div>`;
  if (ls.length) return `<p class="small lk-person">Skříňka <b>${esc(lkLabels(ls))}</b>${ls.length > 1 ? ' <span class="tag warn">má víc skříněk</span>' : ''} <button class="btn ghost small" type="button" data-golk="">Skříňky</button></p>`;
  if (e.excluded || isLead(e) || !lkList().length) return '';
  return `<p class="small muted lk-person">Bez skříňky. <button class="btn ghost small" type="button" data-lkgive="${esc(e.key)}">Přidělit volnou</button></p>`;
}
function renderLkBadge() {
  const b = $('#navLockers');
  if (!b || !S) return;
  const ov = lkOverview(S.lockers, S.employees, todayIso());
  b.hidden = !ov.clear;
  b.textContent = String(ov.clear);
  b.classList.toggle('late', !!ov.clear);
  b.title = ov.clear ? `K vyklizení ${ov.clear} ${lkN(ov.clear)}` : '';
}

/* ---------- obrazovka ---------- */
const LK_FILTERS = [['all', 'Vše'], ['free', 'Volné'], ['used', 'Obsazené'], ['unknown', 'Nespárované'], ['clear', 'K vyklizení'], ['multi', 'Víc skříněk'], ['without', 'Bez skříňky']];
function lkWho(x) {
  if (x.e) return lkName(x.e);
  return x.l.gone || x.l.name || x.l.raw || '';
}
function lkMatchQ(x, q) {
  if (!q) return true;
  return norm([lkLabel(x.l), lkWho(x), x.l.raw, x.l.note, x.e && x.e.wid].filter(Boolean).join(' ')).includes(q);
}
function lkRowHtml(x, ov, today) {
  const l = x.l, id = esc(l.id), multi = l.key && ov.multi.includes(l.key);
  const grp = x.e ? (S.positions.find(g => g.id === x.e.positionId) || {}).name : '';
  let who;
  if (x.st === 'used') who = `<button class="lk-who" type="button" data-lkperson="${esc(l.key)}">${esc(lkName(x.e))}</button>${grp || x.e.wid ? `<small class="muted">${esc([grp, x.e.wid ? `ID ${x.e.wid}` : ''].filter(Boolean).join(' · '))}</small>` : ''}`;
  else if (x.st === 'clear') who = `${x.e ? `<button class="lk-who" type="button" data-lkperson="${esc(l.key)}">${esc(lkName(x.e))}</button>` : `<b>${esc(lkWho(x) || 'neznámý')}</b>`}<small class="lk-why">${esc(x.why)}</small>`;
  else if (x.st === 'unknown') who = `<span class="lk-raw">„${esc(l.raw)}“</span><small class="muted">v Lidech nenalezeno, přiřaď</small>`;
  else who = '<span class="muted">—</span>';
  const tag = { used: '<span class="tag ok">Obsazená</span>', unknown: '<span class="tag warn">Nespárovaná</span>', clear: '<span class="tag crit">Je třeba vyprázdnit</span>', free: '<span class="tag">Volná</span>' }[x.st];
  const extra = [x.endPast ? `<span class="tag warn" title="Konec trestu ${esc(dayText(x.endPast))}">konec trestu minul</span>` : '', multi ? '<span class="tag warn">má víc skříněk</span>' : ''].join('');
  const act = x.st === 'clear'
    ? `<button class="btn small" type="button" data-lkfree="${id}" title="Skříňka je prázdná, zůstane volná">Vyprázdněno</button><button class="btn ghost small" type="button" data-lkassign="${id}">Přidělit</button>`
    : x.st === 'free' ? `<button class="btn sec small" type="button" data-lkassign="${id}">Přidělit</button>`
      : `<button class="btn ghost small" type="button" data-lkassign="${id}">${x.st === 'unknown' ? 'Přiřadit' : 'Změnit'}</button><button class="btn ghost small" type="button" data-lkfree="${id}">Uvolnit</button>`;
  return `<tr class="lk-${x.st}" data-lkrow="${id}">
    <td class="lk-lab" data-label="Skříňka"><b>${esc(lkLabel(l))}</b></td>
    <td class="name lk-whocell" data-label="Pracovník">${who}</td>
    <td class="wrap" data-label="Stav"><span class="lk-tags">${tag}${extra}</span></td>
    <td class="lk-notecell" data-label="Poznámka"><input type="text" data-lknote="${id}" value="${esc(l.note || '')}" maxlength="${LK_NOTE}" placeholder="poznámka" aria-label="Poznámka ke skříňce ${esc(lkLabel(l))}"></td>
    <td class="actions lk-act">${act}<button class="btn ghost small" type="button" data-lklbl="${id}" title="Štítek na skříňku a na záložní klíč (Zebra 100 × 35 mm)">Štítky</button><button class="icon-btn lk-del" type="button" data-lkdel="${id}" title="Smazat skříňku ze soupisu" aria-label="Smazat skříňku ${esc(lkLabel(l))}">${I.x}</button></td></tr>`;
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
      <td class="actions lk-act"><button class="btn sec small" type="button" data-lkgive="${esc(e.key)}"${free ? '' : ' disabled title="Žádná skříňka není volná"'}>Přidělit volnou</button></td></tr>`;
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
  const q = norm(u.q.trim());
  const occ = ov.used + ov.unknown;
  const count = { all: ov.total, free: ov.free, used: occ, unknown: ov.unknown, clear: ov.clear, multi: ov.rows.filter(x => x.l.key && ov.multi.includes(x.l.key)).length, without: ov.without.length };
  if ((u.f === 'unknown' || u.f === 'multi') && !count[u.f]) u.f = 'all';
  const clearRows = ov.rows.filter(x => x.st === 'clear');
  const tiles = `<div class="stats lk-stats">
      ${statTile('Volné skříňky', String(ov.free), ov.free ? `z ${ov.total} ${lkN(ov.total)}` : 'žádná volná', ov.free ? 'good' : '')}
      ${statTile('Obsazené skříňky', String(occ), ov.unknown ? `z toho ${ov.unknown} nespárováno` : 'spárováno s Lidmi', ov.unknown ? 'warn' : '')}
      ${statTile('K vyklizení', String(ov.clear), ov.clear ? 'je třeba vyprázdnit' : 'nic k vyklizení', ov.clear ? 'crit' : '')}
      ${statTile('Lidé bez skříňky', String(ov.without.length), ov.without.length ? 'v seznamu Lidí' : 'každý má skříňku')}</div>`;
  const alert = clearRows.length ? `<div class="note e lk-alert"><div><b>Je třeba vyprázdnit ${clearRows.length} ${lkN(clearRows.length)}:</b> ${clearRows.slice(0, 8).map(x => `${esc(lkLabel(x.l))} <span class="muted">(${esc(lkWho(x) || 'neznámý')}, ${esc(x.why)})</span>`).join(', ')}${clearRows.length > 8 ? ' …' : ''}</div>${u.f !== 'clear' ? '<button class="btn small" type="button" data-lkf="clear">Ukázat</button>' : ''}</div>` : '';
  const chips = `<div class="chips lk-chips" role="tablist" aria-label="Filtr skříněk">${LK_FILTERS.filter(([k]) => k === 'all' || k === 'free' || k === 'used' || k === 'clear' || k === 'without' || count[k]).map(([k, label]) => `<button type="button" class="chip${u.f === k ? ' on' : ''}" data-lkf="${k}" role="tab" aria-selected="${u.f === k}">${label} <em class="t5-count${k === 'clear' && count[k] ? ' late' : ''}">${count[k]}</em></button>`).join('')}</div>`;
  const tools = `<div class="toolbar lk-tools">${chips}<label class="lk-search"><span class="sr-only">Hledat skříňku nebo člověka</span><input type="search" id="lkQ" value="${esc(u.q)}" placeholder="Hledat skříňku nebo jméno" autocomplete="off"></label></div>`;
  let body;
  if (u.f === 'without') body = lkWithoutHtml(ov, q);
  else {
    const rows = ov.rows.filter(x => (u.f === 'all' || (u.f === 'used' ? x.st === 'used' || x.st === 'unknown' : u.f === 'multi' ? x.l.key && ov.multi.includes(x.l.key) : x.st === u.f)) && lkMatchQ(x, q));
    const shown = rows.slice(0, u.n);
    body = rows.length ? `<div class="table-card flat"><table class="stack lk-tab"><thead><tr><th>Skříňka</th><th>Pracovník</th><th>Stav</th><th>Poznámka</th><th></th></tr></thead><tbody>${shown.map(x => lkRowHtml(x, ov, today)).join('')}</tbody></table></div>
      ${rows.length > shown.length ? `<p class="lk-more"><button class="btn ghost" type="button" data-lkmore>Ukázat dalších ${Math.min(LK_PAGE, rows.length - shown.length)} (zbývá ${rows.length - shown.length})</button></p>` : ''}`
      : `<div class="card"><p class="muted">${q ? 'Nic neodpovídá hledání.' : 'V tomhle filtru nic není.'}</p></div>`;
  }
  box.innerHTML = `${tiles}${alert}${tools}${body}
    <p class="tiny muted lk-foot">Vložit nebo doplnit soupis: v Excelu zkopíruj sloupce A (písmeno), B (číslo) a C (jméno) a tady stiskni Ctrl+V. Skříňky se stejným písmenem a číslem se přepíšou, ostatní zůstanou.</p>`;
}

/* ---------- vložení soupisu z Excelu ---------- */
/** Volby výběru člověka (ruční přiřazení): návrhy, bez skříňky, vyřazení, ostatní. */
function lkPeopleOptions(sel, cand, haveLocker) {
  const people = Object.values(S.employees).filter(e => e && e.key).sort((a, b) => lkName(a).localeCompare(lkName(b), 'cs'));
  const opt = e => `<option value="${esc(e.key)}"${e.key === sel ? ' selected' : ''}>${esc(lkName(e))}${e.wid ? ` · ID ${esc(e.wid)}` : ''}${haveLocker.has(e.key) ? ` (má ${esc(haveLocker.get(e.key))})` : ''}${e.excluded ? ' (vyřazen)' : ''}</option>`;
  const sug = (cand || []).map(k => S.employees[k]).filter(Boolean);
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
    if (!replace) lkList().forEach(l => { if (l.key && !labels.has(`${l.row}|${l.no}`)) h.set(l.key, h.has(l.key) ? `${h.get(l.key)}, ${lkLabel(l)}` : lkLabel(l)); });
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
  lkList().forEach(x => { if (x.key && x.id !== id) have.set(x.key, have.has(x.key) ? `${have.get(x.key)}, ${lkLabel(x)}` : lkLabel(x)); });
  const cand = l.raw ? lkMatch([{ n: 1, text: l.raw }], S.employees)[0] : null;
  const sug = cand ? [...new Set([...(cand.key ? [cand.key] : []), ...cand.cand])] : [];
  const cur = l.key || (l.gone ? '@gone' : '');
  const res = await dialog({
    title: `Skříňka ${lkLabel(l)}`, ok: 'Uložit',
    html: `${l.raw && !l.key ? `<p class="small">V soupisu bylo napsáno <b>„${esc(l.raw)}“</b>.</p>` : ''}
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
    if (move && move.checked && !$('#lkMoveBox').hidden) lkOf(who).filter(x => x.id !== id).forEach(x => lkFree(S, x.id, meta));
  }
  save();
  renderAll();
}
/** Člověku bez skříňky přidělí volnou (výběr, první volná předvybraná). */
async function lkGiveDialog(key) {
  const e = S.employees[key];
  if (!e) return;
  const free = lkOverview(S.lockers, S.employees, todayIso()).rows.filter(x => x.st === 'free').map(x => x.l);
  if (!free.length) { toast('Žádná skříňka není volná. Přidej řadu, nebo nejdřív vyprázdni skříňku K vyklizení.', true); return; }
  const res = await dialog({
    title: `Skříňka pro ${lkName(e)}`, ok: 'Přidělit',
    html: `<label class="field"><span>Volná skříňka</span><select name="lk" autofocus>${free.map((l, i) => `<option value="${esc(l.id)}"${i ? '' : ' selected'}>${esc(lkLabel(l))}${l.note ? ` · ${esc(l.note)}` : ''}</option>`).join('')}</select></label>`,
  });
  if (res.value !== 'ok') return;
  const r = lkAssign(S, res.form.elements.namedItem('lk').value, key, { by: ui.me ? ui.me.label : '' });
  if (r.err) { toast(r.err, true); return; }
  save();
  renderAll();
  toast(`${lkName(e)}: skříňka ${lkLabel(r.l)}.`);
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
async function lkLabelsPdf(list, opts, name) {
  const seq = lkLabelSeq(list, opts);
  if (!seq.length) { toast('Není co tisknout.', true); return; }
  try {
    await pdfLib();
    const [regular, semibold] = await Promise.all([pdfAsset('pdf-regular.ttf'), pdfAsset('pdf-semibold.ttf')]);
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: [LK_LBL.W, LK_LBL.H], orientation: 'landscape', compress: true });
    doc.addFileToVFS('Plex-Regular.ttf', regular);
    doc.addFont('Plex-Regular.ttf', 'Plex', 'normal');
    doc.addFileToVFS('Plex-SemiBold.ttf', semibold);
    doc.addFont('Plex-SemiBold.ttf', 'Plex', 'bold');
    doc.setProperties({ title: `Štítky skříněk ${name}`, creator: 'HALA 2' });
    seq.forEach((x, i) => { if (i) doc.addPage([LK_LBL.W, LK_LBL.H], 'landscape'); lkDrawLabel(doc, x); });
    downloadFile(`stitky-skrinky-${name}.pdf`, doc.output('blob'), 'application/pdf');
    toast(`Štítky: ${seq.length} ${seq.length === 1 ? 'štítek' : seq.length <= 4 ? 'štítky' : 'štítků'} (100 × 35 mm). V tisku nastav skutečnou velikost (100 %).`);
  } catch (error) { toast(`PDF štítků se nepovedlo: ${error.message}`, true); }
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
  const shown = u.f === 'without' ? [] : ov.rows.filter(x => (u.f === 'all' || (u.f === 'used' ? x.st === 'used' || x.st === 'unknown' : u.f === 'multi' ? x.l.key && ov.multi.includes(x.l.key) : x.st === u.f)) && lkMatchQ(x, q)).map(x => x.l);
  const rows = [...new Set(all.map(l => l.row))];
  const filtered = shown.length && shown.length < all.length;
  const res = await dialog({
    title: 'Tisk štítků skříněk', ok: 'Vytvořit PDF',
    html: `<div class="lk-lblpick">
        <label class="check"><input type="radio" name="which" value="all" checked><span>Všechny skříňky (${all.length})</span></label>
        ${filtered ? `<label class="check"><input type="radio" name="which" value="shown"><span>Jen zobrazené ve filtru (${shown.length})</span></label>` : ''}
        ${rows.length > 1 ? `<label class="check lk-lblrow"><input type="radio" name="which" value="row"><span>Jen řada</span><select name="row" aria-label="Řada">${rows.map(r => `<option value="${esc(r)}">${esc(r || '(bez písmene)')} · ${all.filter(l => l.row === r).length}</option>`).join('')}</select></label>` : ''}
      </div>
      <div class="lk-lblpick"><label class="check"><input type="checkbox" name="locker" checked><span>Štítek na skříňku (označení, beze jména)</span></label>
        <label class="check"><input type="checkbox" name="key" checked><span>Štítek na záložní klíč (polovina s nápisem, druhou polovinou se klíč zalepí)</span></label></div>
      <p class="small muted">Zebra 100 × 35 mm: každý štítek je jedna strana PDF, ke každé skříňce po dvojicích. V tisku nastav velikost papíru 100 × 35 mm a skutečnou velikost (100 %).</p>`,
    onOpen: dlg => { const sel = $('select[name="row"]', dlg); if (sel) sel.addEventListener('change', () => { $('input[value="row"]', dlg).checked = true; }); },
    validate: form => (form.elements.namedItem('locker').checked || form.elements.namedItem('key').checked ? '' : 'Vyber aspoň jeden druh štítku.'),
  });
  if (res.value !== 'ok') return;
  const f = res.form.elements, which = f.namedItem('which').value;
  const row = which === 'row' ? f.namedItem('row').value : null;
  const list = which === 'shown' ? shown : row != null ? all.filter(l => l.row === row) : all;
  lkLabelsPdf(list, { locker: f.namedItem('locker').checked, key: f.namedItem('key').checked }, which === 'row' ? `rada-${row || 'bez'}` : todayIso());
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
    if (t.matches('[data-lkmore]')) { u.n += LK_PAGE; renderLockers(); return; }
    if (t.matches('[data-lkpaste]')) { lkPasteBox(); return; }
    if (t.matches('[data-lkrange]')) { lkRangeDialog(); return; }
    if (t.dataset.lkperson) { openPersonKey(t.dataset.lkperson); return; }
    if (t.dataset.lkassign) { lkAssignDialog(t.dataset.lkassign); return; }
    if (t.dataset.lklbl) { lkLabelsOne(t.dataset.lklbl); return; }
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
    if (t.dataset.lkgive) lkGiveDialog(t.dataset.lkgive);
  });
  view.addEventListener('input', event => {
    if (event.target.id !== 'lkQ') return;
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
  view.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target.dataset && event.target.dataset.lknote != null) event.target.blur(); });
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
