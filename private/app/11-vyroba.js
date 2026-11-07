/* ==========================================================================
   VÝROBA
   ========================================================================== */
function renderProduction() {
  const pp = prodPeriod();
  const months = Object.keys(S.production).sort().reverse();
  const box = $('#prodView');
  const pair = $('#prodPair');
  if (!months.length) { pair.innerHTML = ''; box.innerHTML = `<div class="card">${emptyState('Zatím nic nahráno', 'Po nahrání tu uvidíš vyrobené kusy a průměr na odpracovaný den.')}</div>`; return; }
  if (!pp) {
    pair.innerHTML = '';
    box.innerHTML = `<div class="note w"><b>Pro vybrané období nejsou data o výrobě.</b> Nahrané mám: ${months.map(m => `${esc(monthLabel(m))} (${S.production[m].records} zápisů)`).join(', ')}. Přepni období vlevo nahoře, nebo nahraj evidenci za ${esc(S.current ? monthLabel(S.current) : 'vybraný měsíc')}.</div>`;
    return;
  }
  const unmatched = prodUnmatched();
  const people = Object.values(S.employees).filter(e => !e.excluded && !isLead(e)).sort((a, b) => norm(a.last).localeCompare(norm(b.last), 'cs'));
  const manual = Object.entries(S.prodMap).filter(([n, k]) => S.employees[k] && pp.names[n]);
  pair.innerHTML = (unmatched.length ? `<div class="card warn-card"><h3>Nespárováno · ${unmatched.length} ${jmenW(unmatched.length)} z evidence</h3><p class="small muted">Tahle jména nebo ID v evidenci práce nesedí na nikoho v hodnocení. Přiřaď je ručně (ID se uloží k člověku), nebo nahraj seznam ID v Nastavení. Volba platí i pro další měsíce.</p>
      <div class="pair-list">${unmatched.map(rec => `<div class="pair-row"><div><b>${esc(prodLabel(rec.name))}</b><div class="tiny muted num">${nf(rec.total, 0)} ks · ${rec.count} zápisů</div></div>
        <select data-pairsel="${esc(norm(rec.name))}" aria-label="Přiřadit k"><option value="">— přiřadit k —</option>${people.map(e => `<option value="${esc(e.key)}">${esc(`${e.last} ${e.first}`)}</option>`).join('')}</select>
        <button class="btn sec small" type="button" data-pairgo="${esc(norm(rec.name))}">Spárovat</button></div>`).join('')}</div></div>` : '')
    + (manual.length ? `<div class="card"><h3>Ruční párování</h3>${manual.map(([n, k]) => `<div class="manual-pair"><span><b>${esc(prodLabel(pp.names[n].name))}</b> <span class="muted">→</span> ${esc(nameOf(k))}</span><button class="icon-btn" type="button" data-unpair="${esc(n)}" aria-label="Zrušit párování">${I.x}</button></div>`).join('')}</div>` : '');
  const rows = activeRows().filter(r => r.prod || (r.att && r.att.found) || r.e.positionId)
    .sort((a, b) => (b.prod ? (avgPerDay(b.prod, b.att) ?? -0.5) : -1) - (a.prod ? (avgPerDay(a.prod, a.att) ?? -0.5) : -1));
  const matched = rows.filter(r => r.prod).length;
  const totalKs = Object.values(pp.names).reduce((x, r) => x + r.total, 0);
  const time = !!pp.time;
  const shop = rows.filter(r => r.prod);
  const shopNorm = SUMF(shop, r => r.prod.norm);
  const shopNs = SUMF(shop, r => r.prod.nspent);
  const shopSpent = SUMF(shop, r => r.prod.spent);
  const shopHours = SUMF(shop, r => (r.att && r.att.found ? r.att.totalHours : 0));
  const pctTd = (label, v, min) => `<td data-label="${label}" class="r num">${v == null ? '<span class="muted">—</span>' : `<span class="${min != null && v < min - 1e-9 ? 'pen' : ''}">${nf(v, 1)} %</span>`}</td>`;
  box.innerHTML = `<div class="stats">${[
    statTile('Vyrobeno kusů', nf(pp.total, 0), esc(monthLabel(pp.id))),
    statTile('Zápisů', pp.records, esc(pp.file || '')),
    statTile('Spárováno lidí', `${matched}<em>/ ${Object.keys(pp.names).length}</em>`, unmatched.length ? `${unmatched.length} ${jmenW(unmatched.length)} ${unmatched.length >= 2 && unmatched.length <= 4 ? 'čekají' : 'čeká'} na přiřazení` : 'všechna jména sedí'),
    statTile('Ø kusů na den', nf(rows.reduce((x, r) => x + (r.prod ? r.prod.total : 0), 0) / Math.max(1, rows.reduce((x, r) => x + (r.prod ? workedDays(r.att) : 0), 0)), 1), 'na odpracovaný den, napříč dílnou'),
    ...(time ? [
      statTile('Plnění normy', shopNs ? `${nf(shopNorm / shopNs * 100, 1)} %` : '—', shopNs ? `norma ${nf(shopNorm / 60, 0)} h za ${nf(shopNs / 60, 0)} h práce` : 'v evidenci chybí norma'),
      statTile('Využití fondu', shopHours ? `${nf(shopSpent / (shopHours * 60) * 100, 1)} %` : '—', `${nf(shopSpent / 60, 0)} h nad zakázkami z ${nf(shopHours, 0)} h v práci`),
    ] : []),
  ].join('')}</div>
  <div class="table-card"><table class="stack"><thead><tr><th>Zaměstnanec</th><th class="r">Kusy</th><th class="r">Odprac. dny</th><th class="r">Ø ks/den</th><th class="r">Ø ks/h</th>${time ? '<th class="r">Čas nad zak.</th><th class="r" title="Norma ÷ strávený čas">Plnění normy</th><th class="r" title="Strávený čas ÷ hodiny v práci">Využití fondu</th>' : ''}<th class="r">Zápisů</th><th class="r">Ø v den zápisu</th></tr></thead><tbody>${rows.map(r => {
    const pr = r.prod;
    const who = `<td data-label="Zaměstnanec" class="name"><div class="who"><b>${esc(`${r.e.last} ${r.e.first}`)}${probIcon(r.e)}</b><span class="pos">${r.pos ? esc(r.pos.name) + (r.L.n ? ` · ${esc(r.L.lv.name)}` : '') : ''}</span></div></td>`;
    if (!pr) return `<tr class="muted-row">${who}<td colspan="${time ? 9 : 6}" class="muted small">bez záznamu v evidenci práce</td></tr>`;
    const own = r.raise.own ? r.pos.levels[r.raise.own.lvl - 1] : (r.tier && (r.tier.next ? r.tier.next.t : r.tier.tier)) || null;
    const days = workedDays(r.att);
    const hours = r.att ? r.att.totalHours : 0;
    const avg = avgPerDay(pr, r.att);
    return `<tr>${who}<td data-label="Kusy" class="r num">${nf(pr.total, 0)}</td><td data-label="Odprac. dny" class="r num">${days || '<span class="muted">—</span>'}</td><td data-label="Ø ks/den" class="r num"><b>${avg == null ? '—' : nf(avg, 1)}</b></td><td data-label="Ø ks/h" class="r num">${hours ? nf(pr.total / hours, 2) : '—'}</td>${time ? `<td data-label="Čas nad zak." class="r num">${nf(pr.spent / 60, 1)} h</td>${pctTd('Plnění normy', r.perf.norm, own ? own.minNorm : null)}${pctTd('Využití fondu', r.perf.use, own ? own.minUse : null)}` : ''}<td data-label="Zápisů" class="r num muted">${pr.entries}</td><td data-label="Ø v den zápisu" class="r num muted">${nf(pr.avgEntryDay, 1)}</td></tr>`;
  }).join('')}</tbody><tfoot><tr><td><b>Celkem</b></td><td class="r num" data-label="Kusy"><b>${nf(totalKs, 0)}</b></td><td class="r num" data-label="Odprac. dny">${rows.reduce((x, r) => x + (r.prod ? workedDays(r.att) : 0), 0)}</td><td colspan="${time ? 7 : 4}"></td></tr></tfoot></table></div>
  <p class="hint">Ø ks/den = vyrobené kusy dělené odpracovanými dny z docházky (všední i víkendové směny), takže díl rozdělaný přes několik dnů průměr nezkreslí. Poslední dva sloupce jsou kontrola evidence. Výroba se do tabáků nezapočítává.${time ? ' Plnění normy a využití fondu můžou být podmínkou prémie; červeně je hodnota pod podmínkou nejbližšího stupně prémie.' : ''}</p>`;
  $$('#prodPair [data-pairgo]').forEach(button => {
    button.onclick = () => {
      const n = button.dataset.pairgo;
      const sel = button.parentElement.querySelector('[data-pairsel]');
      if (!sel || !sel.value) { toast('Vyber, ke komu jméno patří.', true); return; }
      pairProd(pp.names[n] ? pp.names[n].name : n, sel.value); save(); renderAll(); toast(`Spárováno s ${nameOf(sel.value)}.`);
    };
  });
  $$('#prodPair [data-unpair]').forEach(button => {
    button.onclick = () => { delete S.prodMap[button.dataset.unpair]; save(); renderAll(); toast('Párování zrušeno.'); };
  });
}

/* Ruční spárování: ID z evidence se uloží jako ID člověka (uvidí se v Nastavení i v detailu),
   pokud už jiné nemá; jinak jako spárování jména. */
function pairProd(raw, key) {
  const e = S.employees[key];
  if (looksLikeId(raw) && e && !e.wid && setWid(key, raw)) return;
  S.prodMap[norm(raw)] = key;
}

function showProdMsg(html) { $('#prodMsg').innerHTML = html; }

function doProdImport(aoa, name, map) {
  const res = buildProduction(aoa, name, map);
  if (!res.ok) { showProdMsg(`<div class="note e"><b>Import selhal.</b> ${esc(res.err)} <button class="link" type="button" data-prodcols>Vybrat sloupce</button></div>`); return; }
  const skip = Object.keys(res.buckets).filter(dvOwns).sort();   // od listopadu 2026 ze souboru docházky a výkonů
  skip.forEach(id => { delete res.buckets[id]; });
  const ids = Object.keys(res.buckets).sort();
  if (!ids.length) { showProdMsg(`<div class="note e"><b>Nic se nenahrálo.</b> Evidence práce za ${esc(skip.map(monthLabel).join(', '))} se od listopadu 2026 nahrává v KPI tlačítkem Nahrát docházku a výkony. <button class="link" type="button" data-go="audit">Otevřít KPI</button></div>`); return; }
  ids.forEach(id => { S.production[id] = res.buckets[id]; });
  const wa = prodToAudit(aoa, name, map);
  if (wa && wa.added) Object.assign(ui.wa, { tab: 'nastaveni', opFilter: 'nogroup', opQ: '' });   // Otevřít KPI = rovnou přiřadit skupiny
  save();
  const current = S.current && res.buckets[S.current];
  const time = map && map.spent != null;
  const items = new Set(ids.flatMap(i => Object.keys(res.buckets[i].items || {}))).size;
  showProdMsg((skip.length ? `<div class="note w">Evidence práce za ${esc(skip.map(monthLabel).join(', '))} se přeskočila: od listopadu 2026 se nahrává v KPI (Nahrát docházku a výkony).</div>` : '') + `<div class="note i"><b>Načteno:</b> ${esc(name)}: ${res.used} řádků, měsíce: ${ids.map(i => `${esc(monthLabel(i))} (${res.buckets[i].records})`).join(', ')}.${res.skipped ? ` Přeskočeno ${res.skipped} řádků bez data, kusů nebo času.` : ''} ${time ? `Strávený čas${map.norm != null ? ' a norma' : ''} načteny.` : 'Bez stráveného času, plnění normy a využití fondu se nespočítá.'} ${map && map.item != null ? `Položky (EAN): ${items}, vyhodnocení je v části <button class="link" type="button" data-go="top5">Top 5</button>.` : ''} <button class="link" type="button" data-prodcols>Změnit sloupce</button></div>`
    + (wa ? `<div class="note i"><b>KPI:</b> ${wa.text} <button class="link" type="button" data-go="audit">Otevřít KPI</button></div>` : '')
    + (!S.current ? '<div class="note w">Zatím není nahraná žádná docházka. Hodnocený měsíc se vybírá podle ní, takže se výroba zobrazí až po nahrání docházky.</div>'
      : (!current ? `<div class="note w">Vybrané období je ${esc(monthLabel(S.current))} a pro něj soubor data nemá. Období zůstává beze změny.</div>` : '')));
  renderAll();
  const un = prodUnmatched().length;
  toast(un ? `Načteno, ${un} ${jmenW(un)} ${un >= 2 && un <= 4 ? 'čekají' : 'čeká'} na spárování.` : 'Evidence práce načtena.');
}

/* Stejný soubor pro KPI (2.35): se sloupcem Operace se kusy podle operací a dnů zapíšou i do
   KPI, jako by se tam nahrál výkaz práce (dny ze souboru se nahradí, úpravy zůstanou, nové
   operace čekají na skupinu). Vrací text pro hlášku, nebo null. */
function prodToAudit(aoa, name, map) {
  const parsed = waParseProd(aoa, map);
  if (!parsed || !parsed.rows) return null;
  if (!waDropOwned(parsed, 'byDay')) return null;
  const r = waApplyWork(S.workAudit, parsed, { name, by: ui.me.label || '', at: Date.now() });
  const added = r.added.length;
  const range = `${dayText(parsed.from)} – ${dayText(parsed.to)}`;
  store.note = { kind: 'workaudit', keep: true, text: `KPI: kusy podle operací z evidence práce ${name} (${r.days} ${denN(r.days)}, ${range}${added ? `, ${added} ${added === 1 ? 'nová operace' : added <= 4 ? 'nové operace' : 'nových operací'} bez skupiny` : ''})` };
  return { days: r.days, added, text: `kusy podle operací doplněny za ${r.days} ${denN(r.days)} (${esc(range)}).${added ? ` <b>${added} ${added === 1 ? 'nová operace čeká' : added <= 4 ? 'nové operace čekají' : 'nových operací čeká'} na skupinu</b> v Nastavení KPI, do té doby se ${added === 1 ? 'její' : 'jejich'} kusy nepočítají.` : ''}` };
}

/* Výběr sloupců evidence práce. Uloží se pro všechny a další soubory se stejnou hlavičkou
   se načtou rovnou; soubor s jinou hlavičkou se zeptá znovu. */
async function chooseProdColumns(aoa, name, info) {
  const saved = S.settings.prodCols;
  const start = saved && prodMapFits(saved, info) ? saved : info.guess;
  const opts = (field, optional) => `${optional ? '<option value="">— není v souboru —</option>' : ''}${info.cols.map(c => `<option value="${c.i}"${start[field] === c.i ? ' selected' : ''}>${esc(`${c.letter}${c.head ? ` · ${c.head}` : ''}${c.sample ? ` (${c.sample})` : ''}`)}</option>`).join('')}`;
  const field = (f, label, optional, hint) => `<label class="field"><span>${esc(label)}${hint ? ` <small class="muted">${esc(hint)}</small>` : ''}</span><select name="${f}">${opts(f, optional)}</select></label>`;
  const read = form => {
    // namedItem: form.elements.item je vestavěná metoda kolekce, ne pole se jménem „item“.
    const v = n => { const el = form.elements.namedItem(n); return !el || el.value === '' ? null : +el.value; };
    return { header: info.header, name: v('name'), date: v('date'), ks: v('ks'), spent: v('spent'), norm: v('norm'),
      unit: form.elements.unit.value === 'h' ? 'h' : 'min', normPer: form.elements.normPer.value === 'piece' ? 'piece' : 'row',
      item: v('item'), iname: v('iname'), op: v('op') };
  };
  const preview = form => {
    const map = read(form);
    const res = buildProduction(aoa, name, map);
    const box = $('#prodColsPreview');
    if (!res.ok) { box.className = 'note e'; box.textContent = res.err; return; }
    const recs = Object.values(res.buckets).flatMap(b => Object.values(b.names));
    const spent = recs.reduce((x, r) => x + (r.spent || 0), 0);
    const normMin = recs.reduce((x, r) => x + (r.norm || 0), 0);
    const nspent = recs.reduce((x, r) => x + (r.nspent || 0), 0);
    const items = new Set(Object.values(res.buckets).flatMap(b => Object.keys(b.items || {})));
    box.className = 'note i';
    box.textContent = `Použitelných řádků ${res.used} (${recs.length} jmen, ${Object.keys(res.buckets).map(monthLabel).join(', ')}).`
      + (map.spent != null ? ` Strávený čas celkem ${nf(spent / 60, 1)} h.` : '')
      + (map.norm != null ? (nspent ? ` Plnění normy ${nf(normMin / nspent * 100, 1)} %.` : ' Norma: žádný řádek s časem i normou.') : '')
      + (map.item != null ? ` Položek (EAN): ${items.size}.` : ' Bez sloupce EAN se Top 5 z evidence nepředvyplní.')
      + (map.op == null ? '' : map.ks == null ? ' Operace bez kusů do KPI nepůjde.' : (w => (w && w.rows ? ` KPI: kusy podle operací za ${Object.keys(w.byDay).length} ${denN(Object.keys(w.byDay).length)} (${Object.keys(w.ops).length} ${operaceN(Object.keys(w.ops).length)}).` : ' Ve sloupci operace nejsou kusy pro KPI.'))(waParseProd(aoa, map)));
  };
  const result = await dialog({
    title: 'Sloupce evidence práce', ok: 'Načíst', wide: true,
    html: `<p class="small muted">${info.header >= 0 ? `Hlavička je na řádku ${info.header + 1}.` : 'Soubor nemá rozpoznanou hlavičku, beru data od prvního řádku.'} Vyber, co je ve kterém sloupci; volba se zapamatuje pro další soubory se stejnou hlavičkou.</p>
      <div class="form-grid prodcols">
        ${field('name', 'Zaměstnanec', false, 'jméno nebo ID')}${field('date', 'Datum', false)}${field('ks', 'Kusy', true)}
        ${field('spent', 'Strávený čas', true, 'nad zakázkou')}
        <label class="field"><span>Čas je v</span><select name="unit"><option value="min"${start.unit !== 'h' ? ' selected' : ''}>minutách</option><option value="h"${start.unit === 'h' ? ' selected' : ''}>hodinách</option></select></label>
        ${field('norm', 'Norma', true, 'v minutách')}
        <label class="field"><span>Norma platí</span><select name="normPer"><option value="row"${start.normPer !== 'piece' ? ' selected' : ''}>za celý řádek</option><option value="piece"${start.normPer === 'piece' ? ' selected' : ''}>za 1 kus (× kusy)</option></select></label>
        ${field('item', 'EAN / položka', true, 'pro Top 5')}${field('iname', 'Název položky', true)}
        ${field('op', 'Operace', true, 'kusy i do KPI')}
      </div>
      <p class="tiny muted">Se sloupcem Operace se kusy podle operací a dnů zapíšou i do KPI, výkaz práce tam pak nemusíš nahrávat znovu. Čas ve tvaru 1:30 nebo v časovém formátu Excelu se pozná sám. Plnění normy = norma ÷ strávený čas (jen řádky, kde je obojí), využití fondu = strávený čas ÷ hodiny v práci podle docházky.</p>
      <div id="prodColsPreview" class="note i" role="status"></div>`,
    onOpen: () => { const form = $('#dlgForm'); preview(form); $$('#dlgBody select').forEach(sel => { sel.onchange = () => preview(form); }); },
    validate: form => { const m = read(form); if (m.name == null || m.date == null) return 'Vyber sloupec se zaměstnancem (jméno nebo ID) a s datem.'; if (m.ks == null && m.spent == null) return 'Vyber aspoň kusy, nebo strávený čas.'; return buildProduction(aoa, name, m).ok ? null : 'S tímhle výběrem nejde načíst žádný řádek.'; },
  });
  if (result.value !== 'ok') return;
  const map = read(result.form);
  S.settings.prodCols = cleanProdCols({ ...map, heads: info.heads });
  doProdImport(aoa, name, map);
}

async function readProdFile(file, forceChoose = false) {
  if (!file) return;
  try {
    const sheets = await readTable(file);
    const saved = S.settings.prodCols;
    let best = null;
    let bestN = -Infinity;
    sheets.forEach(sheet => {
      const info = prodColumns(sheet.aoa);
      const map = saved && prodMapFits(saved, info) ? saved : info.guess;
      const t = buildProduction(sheet.aoa, file.name, map);
      const score = t.ok ? t.used : info.header >= 0 ? 0 : -1;
      if (score > bestN) { bestN = score; best = { ...sheet, info, known: map === saved }; }
    });
    if (!best) { showProdMsg('<div class="note e"><b>Import selhal.</b> Soubor neobsahuje žádný list.</div>'); return; }
    ui.lastProd = { aoa: best.aoa, name: best.name, info: best.info };
    if (best.known && !forceChoose) doProdImport(best.aoa, best.name, saved);
    else await chooseProdColumns(best.aoa, best.name, best.info);
  } catch (error) {
    showProdMsg(`<div class="note e">Soubor se nepodařilo otevřít: ${esc(error.message)}</div>`);
  }
}

