/* ==========================================================================
   PRÉMIE (stupně skupiny podle dovedností, docházky, normy a bodů vedoucího)
   ========================================================================== */
function raiseTip(r) {
  const x = r.tier;
  const lines = [x.lvl ? `${x.name}${x.pct ? `: +${nf(x.pct, 1)} % mzdy` : ''}${x.reward ? `, ${x.reward}` : ''}` : 'Bez prémie'];
  if (x.next) lines.push(`Do stupně ${x.next.t.name} chybí: ${x.next.checks.filter(c => !c.ok).map(c => `${c.label} (${c.txt})`).join(', ')}`);
  (x.streaks || []).forEach(s => lines.push(`${s.name}: ${s.have} z ${s.months} měsíců v řadě${s.ok ? ` – ${s.label}` : ''}`));
  return lines.join('\n');
}

/* Srážka ze mzdy za neproduktivitu v přehledu (2.12). */
function ncutCell(r) {
  const x = r.ncut;
  if (!x) return '<span class="muted">—</span>';
  const why = x.done ? `Zpracováno ${dayText(todayIso(x.done.at), false)}: plnění normy ${x.done.norm == null ? '—' : `${nf(x.done.norm, 1)} %`}, srážka ${x.pct} % ze mzdy`
    : x.norm == null ? 'Plnění normy za měsíc zatím není (evidence práce s normou)' : `Plnění normy ${nf(x.norm, 1)} %${x.band ? ` → srážka ${x.pct} % ze mzdy` : ' – bez srážky'}`;
  if (!x.pct) return `<span class="muted num" title="${esc(why)}">${x.norm == null ? '—' : '0'}</span>`;
  return `<span class="pen num" title="${esc(why)}">−${x.pct} %</span>${x.done ? ` <span class="ok-mark" title="${esc(why)}">${I.check}</span>` : ''}`;
}
function raiseCell(r) {
  if (!r.pos || !hasRaise(r.pos)) return '<span class="muted">—</span>';
  const x = r.tier;
  const tip = esc(raiseTip(r));
  const streak = (x.streaks || []).find(s => s.ok);
  if (!x.lvl) return `<span class="raise-no" title="${tip}">—</span>`;
  return `<span class="raise-cell" title="${tip}"><span class="raise-ok">${esc(x.name)}</span>${x.pct ? `<small class="raise-lvl">+${nf(x.pct, 1)} %</small>` : ''}${streak ? `<small class="tag acc">${esc(streak.label)}</small>` : ''}</span>`;
}

function raiseKv(r) {
  const pf = r.perf;
  const notes = [];
  if (!pf.time) notes.push(prodPeriod() ? 'Evidence práce za tento měsíc nemá sloupec se stráveným časem, plnění normy a využití fondu se nespočítá.' : 'Pro tento měsíc není nahraná evidence práce, plnění normy se nespočítá.');
  else if (pf.norm == null) notes.push('V evidenci práce nejsou řádky se stráveným časem i normou, plnění normy se nespočítá.');
  const perf = `<dl class="kv">${PERF_KEYS.map(([k, label]) => `<dt>${esc(label[0].toUpperCase() + label.slice(1))}</dt><dd>${pf[k] == null ? '<span class="muted">—</span>' : `${nf(pf[k], 1)} %`}</dd>`).join('')}</dl>`;
  return `${tierHtml(r, false)}${perf}${notes.map(n => `<p class="small muted">${esc(n)}</p>`).join('')}`;
}

function sumKv(r) {
  if (r.kafeOnly) {
    return `<p class="small">Skupina <b>${esc(r.pos.name)}</b> nemá tabáky, hodnotí se jen Kafe.</p>
    <dl class="kv"><dt class="tot">Kafe</dt><dd class="tot">${r.kafe ? `<span class="kafe-ok">${I.kafe}</span>` : r.lost ? '<span class="pen">bez nároku</span>' : '<span class="muted">nesplněno</span>'}</dd></dl>
    ${r.issued ? `<div class="note ${r.issuedChanged ? 'w' : 'i'}"><b>Vydáno ${new Date(r.issued.at).toLocaleDateString('cs-CZ')}:</b> ${issueWhat(r.issued.tabaky, r.issued.kafe)}.</div>` : ''}`;
  }
  return `<div class="total-big"><span class="num">${nf(r.total, 0)}</span> <span class="muted">${tabW(r.total)}</span></div>
    ${meter(r.max ? r.total / r.max : 0, `z ${r.max} max.`)}
    <dl class="kv">
      <dt>Dovednosti</dt><dd>${r.L.base}</dd>
      <dt>Docházka</dt><dd>${r.at.delta ? sgn(r.at.delta) : '0'}</dd>
      ${r.lost ? `<dt>Absence ${r.at.missing} ${dnW(r.at.missing)} (hranice ${r.cut})</dt><dd><span class="pen">bez nároku</span></dd>` : ''}
      ${r.capped ? `<dt>Strop skupiny</dt><dd>${r.max}</dd>` : ''}
      <dt class="tot">Nárok</dt><dd class="tot">${r.narok}</dd>
      ${r.pctSum ? `<dt>Sankce −${r.pctSum} %</dt><dd><span class="pen">${r.sanT ? `−${r.sanT}` : '0'}</span></dd>` : ''}
      ${r.legacy ? `<dt>Sankce (starý záznam)</dt><dd><span class="pen">−${r.legacy}</span></dd>` : ''}
      <dt>Ruční úprava</dt><dd>${r.adj ? sgn(r.adj) : '0'}</dd>
      <dt class="tot">Tabáky</dt><dd class="tot">${r.total}</dd>
    </dl>
    ${r.total > r.max ? `<p class="explain">O ${r.total - r.max} nad maximum díky ruční úpravě (povoleno nejvýš +${+S.settings.adjOver || 0}).</p>` : ''}
    ${r.sans.length ? `<ul class="sanlist">${r.sans.map(s => `<li>${esc(sanLabel(s))}</li>`).join('')}</ul>` : ''}
    ${r.pctSum && r.pctSum < 100 && r.narok ? `<p class="explain">${r.pctSum} % z ${r.narok} = ${nf(r.narok * r.pctSum / 100, 1)} → strženo ${r.sanT} (zaokrouhleno, aspoň 1 za každou sankci)</p>` : ''}
    ${r.issued ? `<div class="note ${r.issuedChanged ? 'w' : 'i'}"><b>Vydáno ${new Date(r.issued.at).toLocaleDateString('cs-CZ')}:</b> ${issueWhat(r.issued.tabaky, r.issued.kafe)}.${r.issuedChanged ? ` Hodnocení se od té doby změnilo, teď vychází ${issueWhat(r.total, r.kafe)}.` : ''}</div>` : ''}`;
}

function ovDetailRow(r) {
  const a = r.att;
  const p = curPeriod();
  return `<tr class="detail"><td colspan="${visibleColumns().length}"><div class="detail-grid">
    <div><p class="eyebrow">Docházka</p>${attKv(r)}</div>
    <div><p class="eyebrow">Dovednosti${r.pos ? ` · ${esc(r.pos.name)}` : ''}</p>${lvlKv(r)}</div>
    <div><p class="eyebrow">${r.kafeOnly ? 'Kafe' : 'Tabáky'}</p>${sumKv(r)}
      <div class="row gap">${r.kafeOnly ? '' : adjCtrl(r)}<button class="btn sec small" type="button" data-edit="${esc(r.e.key)}">Upravit zařazení</button><button class="btn sec small" type="button" data-profile="${esc(r.e.key)}">Profil a historie</button>${issueCell(r)}</div>
      <button class="btn ghost small" type="button" data-exclude="${esc(r.e.key)}" title="Přestane se hodnotit, data zůstanou; vrátit jde v části Lidé">Vyřadit ze seznamu</button>
    </div>
    ${(r.pos && hasRaise(r.pos)) || r.perf.time ? `<div><p class="eyebrow">Prémie</p>${raiseKv(r)}</div>` : ''}
    ${r.prod ? `<div><p class="eyebrow">Výroba · mimo tabáky</p>${prodKv(r)}</div>` : pairBlock(r)}
    ${a && a.found && p ? `<div class="span-all"><p class="eyebrow">Měsíc po dnech</p>${calStrip(a)}</div>` : ''}
  </div></td></tr>`;
}

function pairBlock(r) {
  if (!prodPeriod()) return '';
  const unmatched = prodUnmatched();
  return `<div class="span-all"><p class="eyebrow">Výroba · nespárováno</p>${unmatched.length
    ? `<p class="small muted">${esc(`${r.e.last} ${r.e.first}`)} nemá v evidenci práce za ${esc(monthLabel(prodPeriod().id))} žádný záznam. Vyber jméno, pod kterým je tam vedený. Volba platí i pro další měsíce.</p>
      <div class="row gap"><select data-pairfor="${esc(r.e.key)}"><option value="">— jméno v evidenci —</option>${unmatched.map(rec => `<option value="${esc(norm(rec.name))}">${esc(prodLabel(rec.name))} · ${nf(rec.total, 0)} ks</option>`).join('')}</select><button class="btn sec small" type="button" data-pairset="${esc(r.e.key)}">Přiřadit</button></div>`
    : `<p class="small muted">V evidenci práce za tenhle měsíc nezbývá žádné nespárované jméno; ${esc(`${r.e.last} ${r.e.first}`)} tam nejspíš nic nevyrobil.</p>`}</div>`;
}

function prodKv(r) {
  const pr = r.prod;
  if (!pr) return '';
  const hours = r.att ? r.att.totalHours : 0;
  const days = workedDays(r.att);
  const avg = avgPerDay(pr, r.att);
  return `<dl class="kv">
    <dt>Vyrobeno kusů</dt><dd>${nf(pr.total, 0)}</dd>
    <dt>Odpracované dny</dt><dd>${days || '—'}</dd>
    <dt>Zápisů v evidenci</dt><dd>${pr.entries} ve ${pr.prodDays} dnech</dd>
    <dt class="tot">Ø kusů na odpracovaný den</dt><dd class="tot">${avg == null ? '—' : nf(avg, 1)}</dd>
    ${hours ? `<dt>Ø na hodinu</dt><dd>${nf(pr.total / hours, 2)}</dd>` : ''}
    ${pr.prodDays ? `<dt>Ø v den se zápisem</dt><dd>${nf(pr.avgEntryDay, 1)}</dd>` : ''}
    ${r.perf && r.perf.time ? `<dt>Strávený čas nad zakázkami</dt><dd>${nf(pr.spent / 60, 1)} h</dd>${pr.nspent ? `<dt>Norma (u řádků s normou)</dt><dd>${nf(pr.norm / 60, 1)} h za ${nf(pr.nspent / 60, 1)} h</dd>` : ''}` : ''}
    ${pr.sources.length > 1 || norm(pr.sources[0]) !== norm(`${r.e.first} ${r.e.last}`) ? `<dt>V evidenci jako</dt><dd class="text">${esc(pr.sources.join(', '))}</dd>` : ''}
  </dl>`;
}

function calStrip(a, e, opt) {
  // 2.51: opt = {m, key}: buňky jsou tlačítka ruční úpravy, ručně upravený den a uzamčený den
  // mají značku
  return `<div class="calwrap"><div class="calrow">${a.cells.map(c => {
    let cls = 'cell';
    // 2.50: s člověkem (e) barva podle směny dne: ranní, odpolední, přesčas o víkendu / ve svátek
    const kind = e !== undefined && c.h > 0 ? attDayKind(e, c) : '';
    if (c.d.weekend || c.d.hol) cls += c.h > 0 ? ' wk' : ' wk0';
    else if (c.h >= (c.ds || S.settings.shift) - 1e-9) cls += ' full';
    else if (c.h > 0) cls += ' part';
    else if (c.isEx || c.c) cls += ' abs';
    else cls += ' miss';
    if (kind === 'am' || kind === 'pm') cls += ` sh-${kind}`;
    const ed = opt ? attEditOf(opt.m, opt.key, c.d.iso) : null, lk = opt ? attLocked(opt.m, c.d.iso) : false;
    if (ed) cls += ' ed';
    if (lk) cls += ' lk';
    const title = `${DOW[c.d.dow]} ${c.d.d}.${c.d.m}. ${c.h > 0 ? `${nf(c.h)} h` : (c.c ? `${c.c}${c.ah ? ` (${nf(c.ah, 2)} h u kódu, nepočítají se)` : ''}` : 'nic')}${kind ? ` · ${ATT_KIND[kind]}` : ''}${c.d.hol ? ` — ${c.d.hol}` : ''}${ed ? ` · ručně upraveno (ze souboru ${attValText(ed.wh, ed.wc)}): ${ed.note}` : ''}${lk ? ' · uzamčeno' : ''}`;
    if (opt) return `<button type="button" class="${cls}" data-attcell="${esc(c.d.iso)}" title="${esc(title)}" aria-label="${esc(`Upravit ${title}`)}">${c.d.d}</button>`;
    return `<div class="${cls}" title="${esc(title)}">${c.d.d}</div>`;
  }).join('')}</div></div>`;
}

