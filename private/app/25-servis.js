/* ==========================================================================
   SERVIS: odeslání zařízení na servis (verze 2.21)
   Data a výpočty jsou v core.js (S.service, svSaveShipment, svFindDevice, svHistory,
   svChanges). Tady je seznam odeslání s vrácením ze servisu, evidence zařízení s historií,
   editor protokolu a PDF. Rozepsaný protokol je v ui.sv.draft: pole se při psaní jen
   zapisují, editor se překreslí až po kliknutí (přidat, odebrat, zaškrtnout nečitelné).
   ========================================================================== */
const SV_TABS = [['ship', 'Odeslání'], ['dev', 'Zařízení']];
const SV_SHOW = 30;   // tolik posledních protokolů je vidět, další po kliknutí
function svc() { if (!S.service) S.service = blankService(); return S.service; }
function svDraftNew() { return { id: '', date: todayIso(), to: '', note: '', items: [blankSvItem()] }; }
function svDraftOf(x) { return { id: x.id, date: x.date, to: x.to, note: x.note, items: x.items.map(i => ({ ...i })) }; }
function svLabel(d) { return `${svDevName(d)} · ${svDevIdent(d) || 'bez čísla'}`; }
function svIdCell(v, bad) { return bad ? '<span class="tag crit">nečitelné</span>' : v ? esc(v) : '<span class="muted">—</span>'; }
function svOptions(list) { return [...new Set(list.map(v => String(v || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'cs')).slice(0, 400).map(v => `<option value="${esc(v)}"></option>`).join(''); }
/* Historie bez rozepsaného protokolu (při úpravě by ukazoval sám sebe jako „teď na servisu“). */
function svHistOf(id, skip = '') { const c = svc(); return svHistory(skip ? { ...c, shipments: c.shipments.filter(x => x.id !== skip) } : c, id); }

function renderService() {
  const box = $('#svView');
  if (!box || !S) return;
  const c = svc();
  const d = ui.sv.draft;
  // pole s kurzorem opustit před překreslením: jeho change a blur by jinak sahaly do mizícího obsahu
  if (box.contains(document.activeElement)) document.activeElement.blur();
  $('#svNew').hidden = !!d;
  $('#svTabs').hidden = !!d;
  if (d) {
    box.innerHTML = svEditorHtml(d);
    svHints();
    return;
  }
  const tab = SV_TABS.some(t => t[0] === ui.sv.tab) ? ui.sv.tab : 'ship';
  $('#svTabs').innerHTML = SV_TABS.map(([k, t]) => `<button type="button" class="chip${k === tab ? ' on' : ''}" data-svtab="${k}" aria-pressed="${k === tab}">${t}</button>`).join('');
  const hist = c.devices.map(dv => ({ dv, h: svHistory(c, dv.id) }));
  const out = hist.filter(x => x.h.out);
  const year = todayIso().slice(0, 4);
  const thisYear = c.shipments.filter(x => x.date.startsWith(year));
  const top = hist.filter(x => x.h.year > 1).sort((a, b) => b.h.year - a.h.year)[0];
  const tiles = `<div class="stats">${[
    statTile('Na servisu teď', String(out.length), out.length ? (longest => (longest ? `nejdéle ${longest} ${denN(longest)}` : 'odesláno dnes'))(Math.max(...out.map(x => x.h.outDays))) : 'všechno je zpátky', out.length ? 'warn' : ''),
    statTile(`Odeslání ${year}`, String(thisYear.length), `${thisYear.reduce((a, x) => a + x.items.length, 0)} zařízení`),
    statTile('Zařízení v evidenci', String(c.devices.length), hist.some(x => x.h.retired) ? `z toho ${hist.filter(x => x.h.retired).length} vyřazených` : 'zakládají se při odeslání'),
    statTile('Nejčastěji na servisu', top ? `${top.h.year}×` : '—', top ? `${esc(svDevName(top.dv))} za 12 měsíců` : 'za posledních 12 měsíců'),
  ].join('')}</div>`;
  box.innerHTML = tiles + (tab === 'dev' ? svDevicesHtml() : svShipmentsHtml());
  if (tab === 'dev') svDevTable();
}

/* ---------- odeslání ---------- */
function svShipmentsHtml() {
  const c = svc();
  if (!c.shipments.length) return `<div class="card">${emptyState('Zatím žádné odeslání', 'Tlačítkem Nové odeslání vyplníš předávací protokol: datum a zařízení, která jedou na servis. Zařízení se uloží do evidence a příště je najdeš podle ID nebo výrobního čísla.', '<button class="btn" type="button" data-svnew>Nové odeslání</button>')}</div>`;
  const list = c.shipments.slice().sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
  const shown = ui.sv.all ? list : list.slice(0, SV_SHOW);
  return shown.map(x => svShipHtml(x)).join('') + (shown.length < list.length ? `<button class="btn sec" type="button" data-svall>Zobrazit všechny protokoly (${list.length})</button>` : '');
}
/* ---------- digitální podpis předávajícího (2.26) ----------
   Podpis se kreslí do plochy (myš, prst, pero), ořízne se, uloží jako šifrovaný PNG (Vault.saveFile)
   a protokol má jen {file, name, at, by}. PDF ho vloží nad čáru „Předal (jméno a podpis)“. */
function svDropSignFile(id) {
  // soubor smaž, až když na něj žádný protokol neodkazuje (podpis ani příloha vyřazení)
  if (id && !svFileIds(S).includes(id)) Vault.deleteFile(id).catch(() => {});
}
function svDropFiles(ids) { (ids || []).forEach(svDropSignFile); }
function signPad(canvas, hint) {
  const ctx = canvas.getContext('2d');
  let strokes = 0, last = null, drawing = false;
  const r0 = canvas.getBoundingClientRect(), dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(r0.width * dpr); canvas.height = Math.round(r0.height * dpr);
  ctx.scale(dpr, dpr);
  Object.assign(ctx, { lineCap: 'round', lineJoin: 'round', lineWidth: 2.4, strokeStyle: '#14213d', fillStyle: '#14213d' });
  const pos = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * (r0.width / r.width), (e.clientY - r.top) * (r0.height / r.height)]; };
  const line = p => { ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); last = p; };
  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (error) { /* starší prohlížeč */ }
    drawing = true; last = pos(e); strokes += 1; hint.hidden = true;
    canvas.closest('form')?.querySelector('.dlg-error')?.remove();   // hláška „podepiš se“ už neplatí
    ctx.beginPath(); ctx.arc(last[0], last[1], 1.2, 0, Math.PI * 2); ctx.fill();
  });
  canvas.addEventListener('pointermove', e => {
    if (!drawing) return;
    (e.getCoalescedEvents ? e.getCoalescedEvents() : [e]).forEach(x => line(pos(x)));
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(n => canvas.addEventListener(n, () => { drawing = false; }));
  return {
    empty: () => !strokes,
    clear: () => { ctx.clearRect(0, 0, r0.width, r0.height); strokes = 0; hint.hidden = false; },
    /** Oříznutý podpis jako PNG (Uint8Array), nejvýš 900 × 300 px. */
    png: () => {
      const { width: W, height: H } = canvas, px = ctx.getImageData(0, 0, W, H).data;
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) if (px[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) return null;
      const pad = Math.round(6 * dpr);
      x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
      const w = x1 - x0 + 1, h = y1 - y0 + 1, s = Math.min(1, 900 / w, 300 / h);
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(w * s)); out.height = Math.max(1, Math.round(h * s));
      out.getContext('2d').drawImage(canvas, x0, y0, w, h, 0, 0, out.width, out.height);
      const b64 = out.toDataURL('image/png').split(',')[1];
      return Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
    },
  };
}
async function svSignDialog(id) {
  const c = svc();
  const x = c.shipments.find(s => s.id === id);
  if (!x) return;
  const last = c.shipments.filter(s => s.sign).sort((a, b) => b.sign.at - a.sign.at)[0];
  let pad = null;
  const res = await dialog({
    title: `Podpis předávajícího · protokol ${svNo(x)}`, ok: 'Uložit podpis', wide: true,
    html: `<label class="field"><span>Předal (jméno)</span><input type="text" name="name" maxlength="80" autocomplete="name" value="${esc((x.sign && x.sign.name) || ui.sv.signName || (last && last.sign.name) || '')}" placeholder="jméno a příjmení"></label>
      <div class="field"><span>Podpis</span><div class="sv-signpad"><canvas aria-label="Plocha pro podpis"></canvas><span class="sv-signhint">Podepiš se myší, prstem nebo perem</span></div></div>
      <div class="row gap"><button class="btn ghost small" type="button" data-signclear>Smazat a podepsat znovu</button></div>
      <p class="tiny muted">Podpis se uloží šifrovaně k protokolu a vloží se do všech PDF protokolu ke kolonce Předal (jméno a podpis). Když se protokol později upraví, podpis se odebere a je potřeba podepsat znovu.</p>`,
    onOpen: dlg => { pad = signPad($('.sv-signpad canvas', dlg), $('.sv-signhint', dlg)); $('[data-signclear]', dlg).onclick = () => pad.clear(); },
    validate: form => (!form.elements.namedItem('name').value.trim() ? 'Napiš jméno předávajícího.' : !pad || pad.empty() ? 'Podepiš se do plochy.' : null),
  });
  if (res.value !== 'ok') return;
  const name = res.form.elements.namedItem('name').value.replace(/\s+/g, ' ').trim().slice(0, 80);
  const png = pad && pad.png();
  if (!png) return;
  let file;
  try { file = await Vault.saveFile(png); } catch (error) { toast(`Podpis se nepodařilo uložit: ${error.message}`, true); return; }
  const old = x.sign && x.sign.file;
  x.sign = { file, name, at: Date.now(), by: ui.me.label || '' };
  ui.sv.signName = name;   // předvyplní se u dalšího podpisu (i když tenhle později zmizí)
  save(); renderService();
  if (old) svDropSignFile(old);
  toast(`Podpis uložen: ${name}. PDF protokolu ho má v kolonce Předal.`);
}
/* Části protokolu (2.26): kompletní (oddíly Na opravu a K vyřazení), jen na opravu, jen k vyřazení.
   svPartItems vrací položky s původním indexem j (odkazy Vráceno apod. míří na x.items[j]). */
const SV_PARTS = [['all', 'Kompletní'], ['repair', 'Na opravu'], ['scrap', 'K vyřazení']];
function svPartItems(x, part) {
  const list = x.items.map((it, j) => ({ it, j }));
  const rep = list.filter(({ it }) => it.purpose !== 'scrap'), scr = list.filter(({ it }) => it.purpose === 'scrap');
  return part === 'repair' ? rep : part === 'scrap' ? scr : [...rep, ...scr];
}
function svShipHtml(x) {
  const c = svc();
  // 2.53: uzamčený protokol je sbalený na jeden řádek, rozbalí se ikonou a jde jen číst
  const lk = !!x.lock, exp = lk && ui.sv.exp && ui.sv.exp.has(x.id);
  if (lk && !exp) {
    const scrapL = x.items.filter(i => i.purpose === 'scrap').length;
    return `<article class="card sv-ship sv-locked" data-svship="${esc(x.id)}">
      <button type="button" class="sv-lockrow" data-svexpand="${esc(x.id)}" aria-expanded="false" aria-label="Rozbalit protokol ${esc(svNo(x))}">
        <span class="sv-lockic" aria-hidden="true">${I.lock}</span>
        <span class="sv-lockmain"><b>Protokol ${esc(svNo(x))}</b><small class="muted">${esc(dayText(x.date))} · ${x.to ? esc(x.to) : 'servis neuveden'} · ${x.items.length} zařízení${scrapL ? ` (k vyřazení ${scrapL})` : ''}</small></span>
        <span class="tag ok">${x.items.some(i => i.rej) ? 'vše vyřízeno' : 'vše vráceno'}</span><span class="sv-chev" aria-hidden="true">${I.back}</span></button></article>`;
  }
  const outN = x.items.filter(i => !i.back && !i.rej && i.purpose !== 'scrap').length;
  const rejN = x.items.filter(i => i.rej).length;
  const scrapN = x.items.filter(i => i.purpose === 'scrap').length;
  const repN = x.items.length - scrapN;
  const both = scrapN > 0 && repN > 0;   // oddíly jen, když jsou v protokolu obě části
  const today = todayIso();
  const sec = (t, n) => `<tr class="sv-sec"><th colspan="5">${t} <span class="muted">(${n})</span></th></tr>`;
  const ro = lk;   // uzamčený = jen ke čtení
  const rows = svPartItems(x, 'all').map(({ it: i, j }, n) => {
    const dv = c.devices.find(d => d.id === i.dev);
    const days = daysBetween(x.date, i.back || today);
    const rejBtn = ro ? '' : `<button class="btn sec small sv-rejbtn" type="button" data-svrej="${esc(x.id)}" data-j="${j}">Vyřazeno servisem</button>`;
    const state = i.rej
      ? `<span class="tag crit">vyřazeno servisem ${esc(dayText(i.rej.date))}</span><small>${i.rej.note ? `${esc(i.rej.note)} · ` : ''}${esc(i.rej.by || '')}</small>
        <button class="linkish sv-rejfile" type="button" data-svrejview="${esc(x.id)}" data-j="${j}">protokol k vyřazení</button>${ro ? '' : `<button class="linkish" type="button" data-svunrej="${esc(x.id)}" data-j="${j}">zrušit vyřazení</button>`}`
      : i.purpose === 'scrap' && !i.back ? `<span class="tag crit">k vyřazení</span>${rejBtn}`
      : i.back
      ? `<span class="tag ok">vráceno ${esc(dayText(i.back))}</span><small>${days} ${denN(days)} na servisu${i.backNote ? ` · ${esc(i.backNote)}` : ''}</small>${ro ? '' : `<button class="linkish" type="button" data-svunback="${esc(x.id)}" data-j="${j}">zrušit vrácení</button>`}`
      : `<span class="tag warn">na servisu${days > 0 ? ` ${days} ${denN(days)}` : ''}</span><span class="sv-stbtns"><button class="btn sec small" type="button" data-svback="${esc(x.id)}" data-j="${j}">Vráceno</button>${rejBtn}</span>`;
    const row = `<tr>
      <td class="name" data-label="Zařízení"><b>${esc(svDevName(i))}</b>${i.made ? `<small class="sv-made">rok výroby ${esc(i.made)}</small>` : ''}${dv ? `<button class="linkish" type="button" data-svdev="${esc(dv.id)}">historie</button>` : ''}</td>
      <td data-label="Interní ID">${svIdCell(i.iid, i.iidBad)}</td>
      <td data-label="Výrobní číslo">${svIdCell(i.sn, i.snBad)}</td>
      <td class="sv-block" data-label="Závada">${svFaultText(i) ? esc(svFaultText(i)) : '<span class="muted">—</span>'}${i.iidBad && i.snBad ? `<small class="sv-mark">Dodatečně označeno na spodní stěně horního krytu, kde je řídicí jednotka: <b>${esc(i.mark)}</b></small>` : ''}</td>
      <td class="sv-state sv-block" data-label="Stav">${state}</td></tr>`;
    return `${both && n === 0 ? sec('Na opravu', repN) : ''}${both && n === repN ? sec('K vyřazení', scrapN) : ''}${row}`;
  }).join('');
  const done = svShipDone(x);
  return `<article class="card sv-ship${ui.sv.open === x.id ? ' fresh' : ''}${lk ? ' sv-locked open' : ''}" data-svship="${esc(x.id)}">
    ${lk ? `<button type="button" class="sv-lockrow" data-svexpand="${esc(x.id)}" aria-expanded="true" aria-label="Sbalit protokol ${esc(svNo(x))}"><span class="sv-lockic" aria-hidden="true">${I.lock}</span><span class="sv-lockmain"><b>Uzamčeno</b><small class="muted">${x.lock.by ? `${esc(x.lock.by)}, ` : ''}${esc(tsText(x.lock.at))} · jen ke čtení</small></span><span class="sv-chev" aria-hidden="true">${I.back}</span></button>` : ''}
    <div class="card-head"><div><h3>Protokol ${esc(svNo(x))}</h3>
      <p class="small muted">${esc(dayText(x.date))} · ${x.to ? esc(x.to) : 'servis neuveden'} · ${x.items.length} zařízení${x.by ? ` · zapsal ${esc(x.by)}` : ''}</p>
      ${x.note ? `<p class="small">${esc(x.note)}</p>` : ''}
      <p class="small sv-signline">${x.sign ? `<span class="tag ok">podepsáno</span> Předal: <b>${esc(x.sign.name)}</b>${x.sign.at ? ` · ${esc(dayText(todayIso(x.sign.at)))}` : ''}
        ${ro ? '' : `<button class="linkish" type="button" data-svsign="${esc(x.id)}">změnit podpis</button><button class="linkish" type="button" data-svunsign="${esc(x.id)}">odebrat</button>`}`
        : `<span class="muted">Předal: bez podpisu</span>${ro ? '' : ` <button class="btn sec small" type="button" data-svsign="${esc(x.id)}">Podepsat (Předal)</button>`}`}</p></div>
      <div class="row gap wrap sv-actions">${outN ? `<span class="tag warn">na servisu ${outN}</span>` : scrapN === x.items.length ? '' : `<span class="tag ok">${rejN ? 'vše vyřízeno' : 'vše vráceno'}</span>`}${scrapN ? `<span class="tag crit">k vyřazení ${scrapN}</span>` : ''}${rejN ? `<span class="tag crit">vyřazeno servisem ${rejN}</span>` : ''}
        ${outN > 1 ? `<button class="btn sec small" type="button" data-svbackall="${esc(x.id)}">Vráceno vše</button>` : ''}
        <span class="sv-pdfs" role="group" aria-label="PDF protokolu ${esc(svNo(x))}"><span class="small muted">PDF:</span>${SV_PARTS.map(([p, t]) => {
          const n = p === 'all' ? x.items.length : p === 'scrap' ? scrapN : repN;
          return `<button class="btn small${p === 'all' ? '' : ' sec'}" type="button" data-svpdf="${esc(x.id)}" data-svpart="${p}"${n ? '' : ` disabled title="V protokolu není žádné zařízení ${p === 'scrap' ? 'k vyřazení' : 'na opravu'}"`}>${t}${p === 'all' ? '' : ` (${n})`}</button>`;
        }).join('')}</span>
        ${ro ? `<button class="btn ghost small" type="button" data-svunlock="${esc(x.id)}">${I.unlock}Odemknout</button>` : `${done ? `<button class="btn small sv-lockbtn" type="button" data-svlock="${esc(x.id)}" title="Protokol se sbalí, nepůjde upravit ani smazat">${I.lock}Uzamknout</button>` : ''}
        <button class="btn sec small" type="button" data-svedit="${esc(x.id)}">Upravit</button>
        <button class="icon-btn" type="button" data-svshipdel="${esc(x.id)}" title="Smazat protokol" aria-label="Smazat protokol ${esc(svNo(x))}">${I.x}</button>`}</div></div>
    <div class="table-card flat"><table class="stack sv-items-tab"><thead><tr><th>Zařízení</th><th>Interní ID</th><th>Výrobní číslo</th><th>Závada</th><th>Stav</th></tr></thead><tbody>${rows}</tbody></table></div>
  </article>`;
}
async function svBackDialog(shipId, idx) {
  const x = svc().shipments.find(s => s.id === shipId);
  if (!x) return;
  const items = idx == null ? x.items.filter(i => !i.back && !i.rej && i.purpose !== 'scrap') : [x.items[idx]].filter(i => i && !i.rej);
  if (!items.length) return;
  const res = await dialog({
    title: idx == null ? 'Vráceno ze servisu – vše' : 'Vráceno ze servisu', ok: 'Zapsat',
    html: `<p>${idx == null ? `Protokol ${esc(svNo(x))}: ${items.length} zařízení` : `<b>${esc(svDevName(items[0]))}</b>${svDevIdent(items[0]) ? ` (${esc(svDevIdent(items[0]))})` : ''}, protokol ${esc(svNo(x))}`}, odesláno ${esc(dayText(x.date))}.</p>
      <label class="field"><span>Datum vrácení</span><input type="date" name="back" value="${esc(todayIso() < x.date ? x.date : todayIso())}" min="${esc(x.date)}" required></label>
      <label class="field"><span>Poznámka (nepovinné)</span><input type="text" name="note" maxlength="300" placeholder="např. vyměněn vypínač"></label>`,
    validate: form => { const v = form.elements.namedItem('back').value; return !SV_ISO.test(v) ? 'Vyplň datum vrácení.' : v < x.date ? 'Vrácení nemůže být dřív než odeslání.' : null; },
  });
  if (res.value !== 'ok') return;
  const back = res.form.elements.namedItem('back').value;
  const note = res.form.elements.namedItem('note').value.trim().slice(0, 300);
  items.forEach(i => { i.back = back; i.backNote = note; });
  save();
  renderService();
  toast(`Zapsáno: ${items.length === 1 ? 'zařízení je' : `${items.length} zařízení jsou`} zpátky ze servisu (${dayText(back)}).`);
}

/* ---------- vyřazeno servisem (2.56) ----------
   Servis zařízení neopravil, ale vyřadil: povinná příloha je PDF nebo fotka jeho protokolu k vyřazení.
   Příloha se šifruje (Vault.saveFile) po dílech do 1 MB, takže projde i větší PDF ze skeneru.
   Fotka se zmenší na nejvýš 2400 px (text protokolu musí zůstat čitelný). */
const SV_REJ_PART = 1000000;
const SV_REJ_MAX = 10 * 1024 * 1024;
async function svRejBytes(file) {
  const type = String(file.type || '').toLowerCase();
  const pdf = type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  if (pdf) {
    if (file.size > SV_REJ_MAX) throw new Error(`PDF je moc velké (${(file.size / 1048576).toFixed(1)} MB), nejvýš 10 MB.`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') throw new Error('Soubor není PDF.');
    return { bytes, type: 'application/pdf' };
  }
  if (!/^image\//.test(type) && !/\.(jpe?g|png|heic|webp)$/i.test(file.name || '')) throw new Error('Nahraj PDF nebo fotku protokolu.');
  return { bytes: await shrinkPhoto(file, 2400, 0.85), type: 'image/jpeg' };
}
async function svRejDialog(shipId, j) {
  const x = svc().shipments.find(s => s.id === shipId);
  const it = x && x.items[j];
  if (!it || it.rej) return;
  let picked = null;
  const res = await dialog({
    title: 'Vyřazeno servisem', ok: 'Zapsat vyřazení',
    html: `<p><b>${esc(svDevName(it))}</b>${svDevIdent(it) ? ` (${esc(svDevIdent(it))})` : ''}, protokol ${esc(svNo(x))}, odesláno ${esc(dayText(x.date))}.</p>
      <p class="small muted">Servis zařízení neopraví a vyřadí ho. Přilož jeho protokol k vyřazení: PDF, nebo fotku. Zařízení se v evidenci povede jako vyřazené.</p>
      <label class="field"><span>Datum vyřazení</span><input type="date" name="date" value="${esc(todayIso() < x.date ? x.date : todayIso())}" min="${esc(x.date)}" required></label>
      <div class="field"><span>Protokol k vyřazení (PDF nebo fotka)</span>
        <label class="btn sec sv-rejpick">${I.up}<span data-rejname>Vybrat soubor nebo vyfotit…</span><input type="file" name="file" accept="application/pdf,.pdf,image/*" class="sr-only"></label></div>
      <label class="field"><span>Poznámka (nepovinné)</span><input type="text" name="note" maxlength="300" placeholder="např. oprava se nevyplatí"></label>`,
    onOpen: dlg => {
      const inp = $('input[name="file"]', dlg);
      inp.addEventListener('change', () => {
        picked = inp.files && inp.files[0] || null;
        $('[data-rejname]', dlg).textContent = picked ? `${picked.name} (${(picked.size / 1024 < 1024 ? `${Math.max(1, Math.round(picked.size / 1024))} kB` : `${(picked.size / 1048576).toFixed(1)} MB`)})` : 'Vybrat soubor nebo vyfotit…';
        dlg.querySelector('.dlg-error')?.remove();
      });
    },
    validate: form => { const v = form.elements.namedItem('date').value; return !SV_ISO.test(v) ? 'Vyplň datum vyřazení.' : v < x.date ? 'Vyřazení nemůže být dřív než odeslání.' : !picked ? 'Přilož PDF nebo fotku protokolu k vyřazení.' : null; },
  });
  if (res.value !== 'ok' || !picked) return;
  const date = res.form.elements.namedItem('date').value;
  const note = res.form.elements.namedItem('note').value.replace(/\s+/g, ' ').trim().slice(0, 300);
  let data;
  try { data = await svRejBytes(picked); } catch (error) { toast(error.message, true); return; }
  toast('Šifruji a nahrávám protokol k vyřazení…');
  const files = [];
  try {
    for (let o = 0; o < data.bytes.length; o += SV_REJ_PART) files.push(await Vault.saveFile(data.bytes.subarray(o, o + SV_REJ_PART)));
  } catch (error) {
    files.forEach(f => Vault.deleteFile(f).catch(() => {}));
    toast(`Protokol se nepodařilo nahrát: ${error.message}`, true);
    return;
  }
  // mezitím mohl protokol zmizet nebo se změnit
  const x2 = svc().shipments.find(s => s.id === shipId);
  const it2 = x2 && x2.items[j];
  if (!it2 || it2.rej || x2.lock) { files.forEach(f => Vault.deleteFile(f).catch(() => {})); toast('Protokol se mezitím změnil, zkus to znovu.', true); return; }
  it2.rej = { date, note, files, name: String(picked.name || 'protokol').slice(0, 120), type: data.type, size: data.bytes.length, at: Date.now(), by: ui.me.label || '' };
  it2.back = ''; it2.backNote = '';
  save();
  renderService();
  toast(`Zapsáno: ${svDevName(it2)} vyřazeno servisem (${dayText(date)}), protokol přiložen.`);
}
const svRejUrls = new Map();
async function svRejBlobUrl(r) {
  const key = r.files.join(',');
  if (svRejUrls.has(key)) return svRejUrls.get(key);
  const parts = [];
  for (const f of r.files) parts.push(await Vault.loadFile(f));
  const url = URL.createObjectURL(new Blob(parts, { type: r.type }));
  svRejUrls.set(key, url);
  return url;
}
async function svRejView(shipId, j) {
  const x = svc().shipments.find(s => s.id === shipId);
  const it = x && x.items[j];
  if (!it || !it.rej) return;
  const r = it.rej;
  let url;
  try { url = await svRejBlobUrl(r); } catch (error) { toast(error.status === 404 ? 'Příloha na serveru chybí (obnovená starší verze dat?).' : `Přílohu se nepodařilo načíst: ${error.message}`, true); return; }
  const ext = r.type === 'application/pdf' ? 'pdf' : 'jpg';
  const fname = `vyrazeni-${svNo(x).replace('/', '-')}-${String(it.iid || it.sn || it.mark || svDevName(it)).replace(/[^0-9A-Za-z_-]+/g, '-').slice(0, 40)}.${ext}`;
  await dialog({
    title: `Protokol k vyřazení · ${svDevName(it)}`, ok: 'Zavřít', cancel: '', wide: true,
    html: `<p class="small">Vyřazeno servisem ${esc(dayText(r.date))}${r.note ? ` · ${esc(r.note)}` : ''}${r.by ? ` · zapsal ${esc(r.by)}` : ''} · soubor ${esc(r.name)}</p>
      ${r.type === 'application/pdf' ? '' : `<img class="sv-rejimg" src="${esc(url)}" alt="Protokol k vyřazení">`}
      <div class="row gap wrap"><a class="btn${r.type === 'application/pdf' ? '' : ' sec'}" href="${esc(url)}" target="_blank" rel="noopener">${r.type === 'application/pdf' ? 'Otevřít PDF' : 'Otevřít ve velkém'}</a><a class="btn sec" href="${esc(url)}" download="${esc(fname)}">Stáhnout</a></div>`,
  });
}

/* ---------- evidence zařízení ---------- */
function svDevicesHtml() {
  const c = svc();
  if (!c.devices.length) return `<div class="card">${emptyState('Evidence je prázdná', 'Zařízení se do evidence zapíšou samy při prvním odeslání na servis.')}</div>`;
  return `<div class="toolbar"><input type="search" id="svQ" value="${esc(ui.sv.q)}" placeholder="Hledat zařízení (druh, značka, ID, výrobní číslo…)" aria-label="Hledat zařízení"></div><div id="svDevTable"></div>
    <p class="hint">Na servisu = kolikrát zařízení odjelo na servis. Průměrně na servisu = dny od odeslání do vrácení. Odstup = průměrná doba mezi dvěma odesláními. Klepnutím na zařízení otevřeš jeho historii a údaje.</p>
    ${svTemplatesHtml()}`;
}
/* Vzory zařízení (2.22): druh, značka a model; ukládají se v editoru protokolu u položky. */
function svTemplatesHtml() {
  const list = (svc().templates || []).slice().sort((a, b) => svDevName(a).localeCompare(svDevName(b), 'cs'));
  return `<div class="card sv-tpls"><h3>Vzory zařízení</h3>
    <p class="small muted">Vzor si pamatuje druh zařízení, značku a model. V novém odeslání ho vybereš v nabídce Podle vzoru u zařízení a zbývá doplnit interní ID, výrobní číslo a rok výroby. Vzor uložíš v protokolu tlačítkem Uložit jako vzor u zařízení.</p>
    ${list.length ? `<ul class="sv-tpl-list">${list.map(t => `<li><span>${esc(svDevName(t))}</span><button type="button" class="icon-btn" data-svtpldel="${esc(t.id)}" title="Smazat vzor" aria-label="Smazat vzor ${esc(svDevName(t))}">${I.x}</button></li>`).join('')}</ul>` : '<p class="small muted">Zatím žádný vzor.</p>'}
  </div>`;
}
function svDevTable() {
  const el = $('#svDevTable');
  if (!el) return;
  const c = svc();
  const q = norm(ui.sv.q || '');
  // duplicity (stejné číslo nebo označení u víc zařízení) jsou nahoře pod sebou a červeně
  const { groups: dups, match: dupMatch } = svDevDups(c);
  const dupOf = new Map();
  dups.forEach((g, n) => g.ids.forEach((id, j) => dupOf.set(id, { n, j, why: dupMatch.get(id)[0].why })));
  const dupCmp = (a, b) => { const x = dupOf.get(a.dv.id), y = dupOf.get(b.dv.id); return x || y ? (!x ? 1 : !y ? -1 : (x.n - y.n) || (x.j - y.j)) : 0; };
  const rows = c.devices.map(dv => ({ dv, h: svHistory(c, dv.id) }))
    .filter(x => !q || norm(`${svDevName(x.dv)} ${x.dv.iid} ${x.dv.sn} ${x.dv.mark} ${x.dv.note}`).includes(q))
    .sort((a, b) => dupCmp(a, b) || (b.h.out - a.h.out) || (!!a.h.retired - !!b.h.retired) || (b.h.count - a.h.count) || svDevName(a.dv).localeCompare(svDevName(b.dv), 'cs'));
  const warn = dups.length ? `<div class="note e sv-dupwarn"><b>V evidenci jsou duplicity</b> (${dups.length === 1 ? esc(dups[0].why) : `${dups.length} ${dups.length < 5 ? 'skupiny' : 'skupin'}`}). Zařízení se stejným číslem nebo označením jsou nahoře pod sebou a označená červeně. Otevři je a oprav číslo, které nesedí.</div>` : '';
  el.innerHTML = warn + (rows.length ? `<div class="table-card"><table class="stack sv-dev-tab"><thead><tr><th>Zařízení</th><th>Identifikace</th><th class="r">Na servisu</th><th class="r">Za 12 měsíců</th><th>Naposledy</th><th class="r">Průměrně na servisu</th><th class="r">Odstup</th><th>Stav</th></tr></thead><tbody>${rows.map(({ dv, h }) => `<tr class="sv-row${dupOf.has(dv.id) ? ' dup' : ''}" data-svdev="${esc(dv.id)}" tabindex="0">
      <td class="name" data-label="Zařízení"><b>${esc(svDevName(dv))}</b>${dv.made ? `<small class="sv-made">rok výroby ${esc(dv.made)}</small>` : ''}${dupOf.has(dv.id) ? `<small class="sv-dupnote">Duplicita: ${esc(dupOf.get(dv.id).why)}</small>` : ''}</td>
      <td data-label="Identifikace">${esc(svDevIdent(dv) || '—')}</td>
      <td class="r num" data-label="Na servisu">${h.count}×</td>
      <td class="r num" data-label="Za 12 měsíců">${h.year}×</td>
      <td class="num" data-label="Naposledy">${h.last ? esc(dayText(h.last)) : '—'}</td>
      <td class="r num" data-label="Průměrně na servisu">${h.avgDays != null ? `${h.avgDays} ${denN(h.avgDays)}` : '—'}</td>
      <td class="r num" data-label="Odstup">${h.avgGap != null ? `${h.avgGap} ${denN(h.avgGap)}` : '—'}</td>
      <td data-label="Stav">${h.out ? `<span class="tag warn">na servisu ${h.outDays} ${denN(h.outDays)}</span>` : h.retired ? `<span class="tag crit">vyřazeno ${esc(dayText(h.retired))}</span>` : h.count ? '<span class="tag ok">v provozu</span>' : '<span class="muted">bez odeslání</span>'}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="card">${emptyState('Nic nenalezeno', 'Zkus jiný název nebo číslo.')}</div>`);
}
async function svDeviceDialog(id) {
  const c = svc();
  const dv = c.devices.find(d => d.id === id);
  if (!dv) return;
  const h = svHistory(c, id);
  const hist = h.list.slice().reverse().map(({ ship, item }) => {
    const days = daysBetween(ship.date, item.back || todayIso());
    return `<tr><td class="num" data-label="Odesláno">${esc(dayText(ship.date))}</td><td data-label="Protokol">${esc(svNo(ship))}</td><td data-label="Servis">${esc(ship.to || '—')}</td>
      <td class="sv-block" data-label="Účel a závada">${item.purpose === 'scrap' ? '<span class="tag crit">k vyřazení</span> ' : ''}${esc(svFaultText(item) || (item.purpose === 'scrap' ? '' : '—'))}</td>
      <td class="sv-block" data-label="Vráceno">${item.rej ? `<span class="tag crit">vyřazeno servisem ${esc(dayText(item.rej.date))}</span>${item.rej.note ? `<small> · ${esc(item.rej.note)}</small>` : ''}` : item.back ? `${esc(dayText(item.back))} <small>(${days} ${denN(days)})</small>${item.backNote ? `<small> · ${esc(item.backNote)}</small>` : ''}` : item.purpose === 'scrap' ? '<span class="muted">—</span>' : `<span class="tag warn">na servisu ${days} ${denN(days)}</span>`}</td></tr>`;
  }).join('');
  const sum = h.count ? [`na servisu ${h.count}× (za 12 měsíců ${h.year}×)`, h.avgDays != null ? `průměrně ${h.avgDays} ${denN(h.avgDays)} na servisu` : '', h.avgGap != null ? `odstup mezi odesláními ${h.avgGap} ${denN(h.avgGap)}` : '', h.out ? `teď na servisu ${h.outDays} ${denN(h.outDays)}` : '', h.retired ? `${h.rejBy ? 'vyřazeno servisem' : 'odesláno k vyřazení'} ${dayText(h.retired)}` : ''].filter(Boolean).join(' · ') : 'zatím bez odeslání';
  const f = (name, label, val, max, list = '') => `<label class="field"><span>${label}</span><input type="text" name="${name}" value="${esc(val)}" maxlength="${max}"${list ? ` list="${list}"` : ''}></label>`;
  const dm = svDevDups(c).match.get(id) || [];
  const dupNote = dm.length ? `<p class="note e"><b>Duplicita v evidenci:</b> ${dm.map(m => `${esc(m.why)} má i ${esc(svLabel(c.devices.find(d => d.id === m.id)))}`).join('; ')}. Oprav číslo, které nesedí.</p>` : '';
  const res = await dialog({
    title: svDevName(dv), ok: 'Uložit údaje', cancel: 'Zavřít', wide: true,
    html: `${dupNote}<p class="small">${esc(sum)}</p>
      <div class="table-card flat"><table class="stack sv-hist-tab"><thead><tr><th>Odesláno</th><th>Protokol</th><th>Servis</th><th>Účel a závada</th><th>Vráceno</th></tr></thead><tbody>${hist || '<tr><td colspan="5" class="muted">Zatím bez odeslání.</td></tr>'}</tbody></table></div>
      <h3 class="sv-dlg-h">Údaje v evidenci</h3>
      <div class="sv-grid">${f('kind', 'Druh zařízení', dv.kind, 80)}${f('brand', 'Značka', dv.brand, 80)}${f('model', 'Model', dv.model, 80)}</div>
      <div class="sv-grid ids">
        <div class="field"><span>Interní ID</span><div class="sv-num"><input type="text" name="iid" value="${esc(dv.iid)}" maxlength="60"${dv.iidBad ? ' disabled' : ''}><label class="sv-bad"><input type="checkbox" name="iidBad"${dv.iidBad ? ' checked' : ''}><span>nečitelné</span></label></div></div>
        <div class="field"><span>Výrobní číslo</span><div class="sv-num"><input type="text" name="sn" value="${esc(dv.sn)}" maxlength="80"${dv.snBad ? ' disabled' : ''}><label class="sv-bad"><input type="checkbox" name="snBad"${dv.snBad ? ' checked' : ''}><span>nečitelné</span></label></div></div>
        <label class="field"><span>Rok výroby</span><input type="text" name="made" inputmode="numeric" value="${esc(dv.made || '')}" maxlength="10"></label>
      </div>
      ${f('mark', 'Dodatečné označení (spodní stěna horního krytu u řídicí jednotky)', dv.mark, 60)}
      <label class="field"><span>Poznámka</span><textarea name="note" rows="2" maxlength="1000">${esc(dv.note)}</textarea></label>
      <p class="tiny muted">Úprava změní jen evidenci. Vydané protokoly zůstanou, jak byly.</p>
      ${h.count ? '' : '<button class="btn ghost small wa-danger" type="button" id="svDevDel">Smazat zařízení z evidence</button>'}`,
    onOpen: dlg => {
      ['iid', 'sn'].forEach(k => {
        const box = dlg.querySelector(`[name="${k}Bad"]`);
        box.addEventListener('change', () => { const inp = dlg.querySelector(`[name="${k}"]`); inp.disabled = box.checked; if (box.checked) inp.value = ''; });
      });
      const del = dlg.querySelector('#svDevDel');
      if (del) del.addEventListener('click', () => dlg.close('delete'));
    },
    validate: form => {
      const e = form.elements;
      const x = { kind: e.kind.value.trim(), brand: e.brand.value.trim(), model: e.model.value.trim(), iid: e.iid.value.trim(), sn: e.sn.value.trim(), iidBad: e.iidBad.checked, snBad: e.snBad.checked, mark: e.mark.value.trim() };
      const p = svItemProblem(x);
      if (p) return `Zařízení: ${p}.`;
      const same = c.devices.find(d => d.id !== dv.id && svSameKey(x, d));
      return same ? `Stejné číslo už má v evidenci ${svLabel(same)}.` : null;
    },
  });
  if (res.value === 'delete') {
    if (!(await confirmBox('Smazat zařízení?', `${svDevName(dv)} zmizí z evidence. Na servisu zatím nebylo, žádný protokol se nemění.`, 'Smazat', true))) return;
    c.devices = c.devices.filter(d => d.id !== dv.id);
    save(); renderService(); return;
  }
  if (res.value !== 'ok') return;
  const e = res.form.elements;
  Object.assign(dv, { kind: e.kind.value.trim().slice(0, 80), brand: e.brand.value.trim().slice(0, 80), model: e.model.value.trim().slice(0, 80),
    iidBad: e.iidBad.checked, snBad: e.snBad.checked, iid: e.iidBad.checked ? '' : e.iid.value.trim().slice(0, 60), sn: e.snBad.checked ? '' : e.sn.value.trim().slice(0, 80),
    made: e.made.value.trim().slice(0, 10), mark: e.mark.value.trim().slice(0, 60), note: e.note.value.trim().slice(0, 1000) });
  save();
  renderService();
}

/* ---------- editor protokolu ---------- */
function svEditorHtml(d) {
  const c = svc();
  const ship = d.id && c.shipments.find(x => x.id === d.id);
  const all = [...c.devices, ...c.shipments.flatMap(x => x.items), ...(c.templates || [])];
  return `<div class="card sv-editor">
    <div class="card-head"><div><h2>${ship ? `Upravit protokol ${esc(svNo(ship))}` : 'Nové odeslání na servis'}</h2>
      <p class="small muted">Datum odeslání a zařízení, která jedou na servis. Po uložení se zařízení zapíšou do evidence (nebo se přiřadí k těm, která už v ní jsou) a stáhne se předávací protokol v PDF.</p></div></div>
    <div class="sv-grid two">
      <label class="field"><span>Datum odeslání</span><input type="date" data-svd="date" value="${esc(d.date)}" required></label>
      <label class="field"><span>Servis (komu se zařízení předávají)</span><input type="text" data-svd="to" value="${esc(d.to)}" list="svToList" maxlength="160" placeholder="název servisu"></label>
    </div>
    <label class="field"><span>Poznámka k protokolu (nepovinné)</span><textarea data-svd="note" rows="2" maxlength="1000">${esc(d.note)}</textarea></label>
    <div class="sv-items">${d.items.map((it, i) => svItemHtml(it, i, d.items.length)).join('')}</div>
    <button class="btn sec" type="button" data-svadd>Přidat další zařízení</button>
    <div class="row gap wrap sv-editor-foot"><button class="btn ghost" type="button" data-svcancel>Zrušit</button><span class="spacer"></span>
      <button class="btn sec" type="button" data-svsave="plain">Uložit</button><button class="btn" type="button" data-svsave="pdf">Uložit a stáhnout PDF</button></div>
    <datalist id="svToList">${svOptions(c.shipments.map(x => x.to))}</datalist>
    <datalist id="svKindList">${svOptions(all.map(x => x.kind))}</datalist>
    <datalist id="svBrandList">${svOptions(all.map(x => x.brand))}</datalist>
    <datalist id="svModelList">${svOptions(all.map(x => x.model))}</datalist>
    <datalist id="svDevList">${c.devices.map(dv => `<option value="${esc(svLabel(dv))}"></option>`).join('')}</datalist>
  </div>`;
}
function svItemHtml(it, i, n) {
  const both = it.iidBad && it.snBad;
  const field = (f, label, max, list, ph = '') => `<label class="field"><span>${label}</span><input type="text" data-svf="${f}" data-svi="${i}" value="${esc(it[f])}" maxlength="${max}"${list ? ` list="${list}"` : ''}${ph ? ` placeholder="${esc(ph)}"` : ''}></label>`;
  const num = (f, label, max) => `<div class="field"><span>${label}</span><div class="sv-num">
      <input type="text" data-svf="${f}" data-svi="${i}" value="${esc(it[f])}" maxlength="${max}" aria-label="${label}"${it[`${f}Bad`] ? ' disabled placeholder="nečitelné"' : ''}>
      <label class="sv-bad"><input type="checkbox" data-svf="${f}Bad" data-svi="${i}"${it[`${f}Bad`] ? ' checked' : ''}><span>nečitelné</span></label></div></div>`;
  return `<article class="sv-item" data-svitem="${i}">
    <div class="sv-item-head"><span class="lb-num">${i + 1}</span>
      ${svc().devices.length ? `<input type="search" class="sv-pick" data-svpick="${i}" list="svDevList" placeholder="Vybrat z evidence (ID, výrobní číslo, značka…)" aria-label="Vybrat zařízení z evidence">` : '<b>Zařízení</b>'}
      ${(svc().templates || []).length ? `<select class="sv-tpl" data-svtpl="${i}" aria-label="Vyplnit podle vzoru"><option value="">Podle vzoru…</option>${svc().templates.slice().sort((a, b) => svDevName(a).localeCompare(svDevName(b), 'cs')).map(t => `<option value="${esc(t.id)}">${esc(svDevName(t))}</option>`).join('')}</select>` : ''}
      <button type="button" class="btn ghost small sv-tplsave" data-svtplsave="${i}" title="Uložit druh, značku a model jako vzor">Uložit jako vzor</button>
      <button type="button" class="icon-btn" data-svdel="${i}" title="Odebrat zařízení" aria-label="Odebrat zařízení ${i + 1}"${n > 1 ? '' : ' disabled'}>${I.x}</button></div>
    <div class="sv-grid">${field('kind', 'Druh zařízení', 80, 'svKindList', 'např. bruska')}${field('brand', 'Značka', 80, 'svBrandList')}${field('model', 'Model', 80, 'svModelList')}</div>
    <div class="sv-grid ids">${num('iid', 'Interní ID', 60)}${num('sn', 'Výrobní číslo', 80)}<label class="field"><span>Rok výroby</span><input type="text" inputmode="numeric" data-svf="made" data-svi="${i}" value="${esc(it.made)}" maxlength="10" placeholder="např. 2019"></label></div>
    ${both ? `<div class="note w sv-markbox"><p>${esc(SV_MARK_TEXT)}</p>${field('mark', 'Dodatečné označení (co je napsané na spodní stěně horního krytu)', 60, '', 'např. S-014')}</div>` : ''}
    <div class="field"><span>Odesíláme</span><div class="sv-purpose" role="radiogroup" aria-label="Účel odeslání zařízení ${i + 1}">${SV_PURPOSE.map(([k, t]) => `<label class="sv-opt${k === 'scrap' ? ' scrap' : ''}"><input type="radio" name="svp${i}" data-svp="${k}" data-svi="${i}" value="${k}"${(it.purpose || 'repair') === k ? ' checked' : ''}><span>${t}</span></label>`).join('')}</div></div>
    <div class="field"><span>Závada</span><div class="sv-faults">${SV_FAULTS.map(([k, t]) => `<label class="sv-fault"><input type="checkbox" data-svfault="${k}" data-svi="${i}"${(it.faults || []).includes(k) ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div></div>
    ${field('fault', 'Jiná závada nebo poznámka (nepovinné)', 600, '', 'např. prasklý kabel')}
    <p class="small sv-hint" data-svhint="${i}"></p>
  </article>`;
}
/* Nápověda u položky: zařízení z evidence, nebo nové (bez překreslení, aby se dalo psát dál).
   Obnovuje se už při psaní: kdyby se změnila až při opuštění pole, posunula by tlačítko pod
   kurzorem a klik na Přidat další zařízení by se ztratil. */
function svHint(i, dup = [], clash = null, own) {
  const el = $(`[data-svhint="${i}"]`);
  const d = ui.sv.draft;
  const it = d && d.items[i];
  if (!el || !it) return;
  const set = html => { if (el.innerHTML !== html) el.innerHTML = html; };
  const unlink = it.dev ? ` <button class="linkish" type="button" data-svunlink="${i}">odpojit</button>` : '';
  el.closest('.sv-item')?.classList.toggle('dup', !!(dup.length || clash));
  if (dup.length) { set(`<b>Duplicita:</b> stejné zařízení jako č. ${svNums(dup.map(m => m.j))} (${esc(dup[0].why)}). V protokolu může být jen jednou.`); return; }
  if (clash) { set(`<b>Duplicita v evidenci:</b> ${esc(svCap(clash.what))} má v evidenci jiné zařízení: ${esc(svDevName(clash.dev))}${svDevIdent(clash.dev) ? ` (${esc(svDevIdent(clash.dev))})` : ''}. Oprav číslo tady, nebo v evidenci.${unlink}`); return; }
  const c = svc();
  const found = own !== undefined ? own : (it.dev && c.devices.find(x => x.id === it.dev)) || svFindDevice(c, it);
  const linked = found && it.dev === found.id;
  if (!found) { set(it.iid || it.sn || it.mark ? 'Nové zařízení: po uložení se založí v evidenci.' : ''); return; }
  const h = svHistOf(found.id, d.id);
  set(`${linked ? 'Z evidence' : 'V evidenci už je'}: <b>${esc(svDevName(found))}</b>${svDevIdent(found) ? ` (${esc(svDevIdent(found))})` : ''} · na servisu ${h.count}×${h.last ? `, naposledy ${esc(dayText(h.last))}` : ''}${h.out ? ' · <b>podle evidence je teď na servisu</b>' : ''}${h.retired ? ` · <b>podle evidence odesláno k vyřazení ${esc(dayText(h.retired))}</b>` : ''}${linked ? ` <button class="linkish" type="button" data-svunlink="${i}">odpojit</button>` : ''}`);
}
/* Duplicity v protokolu (2.22.1): stejné zařízení víckrát, nebo číslo jiného zařízení z evidence.
   Červeně se označí hned při psaní (barva, text v nápovědě, rozložení se nemění); při uložení
   jdou nahoru pod sebe. only = položka, ve které se píše: ostatní se překreslí, jen když se
   jejich duplicita změnila (nápověda s evidencí je jinak zbytečně dělaná pořád dokola). */
function svHints(only = null) {
  const d = ui.sv.draft;
  if (!d) return;
  const { match, clash, own } = svDupCheck(svc(), d.items);
  const clashOf = new Map(clash.map(x => [x.i, x]));
  d.items.forEach((_, i) => {
    const card = $(`[data-svitem="${i}"]`);
    if (!card) return;
    const m = match[i], x = clashOf.get(i);
    const st = m.length ? `g:${m.map(y => y.j).join()}:${m[0].why}` : x ? `x:${x.dev.id}:${x.what}` : `-:${own[i] ? own[i].id : ''}`;
    if (only != null && i !== only && card.dataset.dupst === st) return;
    card.dataset.dupst = st;
    svHint(i, m, x, own[i]);
  });
}
/* Čísla položek lidsky: „2“, „2 a 5“, „2, 5 a 7“ (indexy od nuly). */
function svNums(list) {
  const n = list.map(j => j + 1);
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} a ${n[n.length - 1]}` : String(n[0] || '');
}
function svCap(t) { return t ? t[0].toUpperCase() + t.slice(1) : t; }
/* Obsah protokolu bez vrácení (to se zapisuje až po předání): podle něj se pozná úprava. */
function svContentKey(x) { return JSON.stringify([x.date, x.to, x.note, x.items.map(i => [i.dev, i.kind, i.brand, i.model, i.made, i.iid, i.sn, i.iidBad, i.snBad, i.mark, i.purpose, i.faults, i.fault])]); }
function svDraftDirty(d) {
  const ship = d.id && svc().shipments.find(x => x.id === d.id);
  const base = ship ? svDraftOf(ship) : svDraftNew();
  return svContentKey(base) !== svContentKey({ ...d, date: ship ? d.date : base.date });
}
async function svSaveDraft(pdf) {
  const d = ui.sv.draft;
  const c = svc();
  if (!SV_ISO.test(d.date)) { toast('Vyplň datum odeslání.', true); $('[data-svd="date"]')?.focus(); return; }
  const keep = d.items.map((it, i) => ({ it, i })).filter(x => svItemProblem(x.it) !== 'prázdná položka');
  if (!keep.length) { toast('Přidej aspoň jedno zařízení.', true); return; }
  const bad = keep.find(x => svItemProblem(x.it));
  if (bad) {
    toast(`Zařízení ${bad.i + 1}: ${svItemProblem(bad.it)}.`, true);
    $(`[data-svitem="${bad.i}"] input[data-svf="${bad.it.iidBad && bad.it.snBad ? 'mark' : 'iid'}"]`)?.focus();
    return;
  }
  // stejné zařízení víckrát, nebo číslo jiného zařízení z evidence: duplicity jdou nahoru pod sebe
  // a zůstanou označené červeně, dokud se neopraví
  const { groups, clash } = svDupCheck(c, d.items);
  if (groups.length || clash.length) {
    d.items = svDupOrder(d.items.length, groups, clash).map(i => d.items[i]);
    renderService();
    $('[data-svitem="0"]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    const g = groups[0], x = clash[0];
    toast(groups.length === 1 && !clash.length
      ? `Zařízení ${svNums(g.idx.map((_, j) => j))} je stejné zařízení (${g.why}). Duplicity jsou teď nahoře pod sebou a označené červeně. V protokolu může být jen jednou: jedno odeber, nebo oprav číslo.`
      : !groups.length && clash.length === 1
        ? `Zařízení 1: ${svCap(x.what)} má v evidenci jiné zařízení (${svDevName(x.dev)}). Je teď nahoře a označené červeně. Oprav číslo tady, nebo v evidenci.`
        : 'Protokol má duplicity: stejné zařízení víckrát, nebo číslo, které v evidenci patří jinému zařízení. Jsou teď nahoře pod sebou a označené červeně. Odeber je, nebo oprav čísla.', true);
    return;
  }
  const was = d.id && c.shipments.find(x => x.id === d.id);
  const signedKey = was && was.sign ? svContentKey(was) : null;
  const { ship, created } = svSaveShipment(c, { ...d, items: keep.map(x => x.it) }, { by: ui.me.label || '', at: Date.now() });
  // podpis předávajícího platí pro obsah, který podepsal: po změně protokolu se odebere (2.26)
  let unsigned = '';
  if (signedKey && ship.sign && svContentKey(ship) !== signedKey) {
    const old = ship.sign;
    delete ship.sign;
    unsigned = old.name;
    svDropSignFile(old.file);
  }
  ui.sv.draft = null;
  ui.sv.tab = 'ship';
  ui.sv.open = ship.id;
  save();
  renderService();
  toast(`Protokol ${svNo(ship)} uložen${created.length ? `, v evidenci ${created.length === 1 ? 'přibylo 1 zařízení' : `přibyla ${created.length} zařízení`}` : ''}.${unsigned ? ` Protokol se změnil, podpis předávajícího (${unsigned}) byl odebrán: podepiš ho znovu.` : ''}`, !!unsigned);
  if (pdf) exportServicePdf(ship.id);
}

function bindService() {
  const view = $('#view-servis');
  view.addEventListener('click', async event => {
    const t = event.target;
    const tab = t.closest('[data-svtab]');
    if (tab) { ui.sv.tab = tab.dataset.svtab; renderService(); return; }
    if (t.closest('#svNew, [data-svnew]')) {
      ui.sv.draft = svDraftNew();
      renderService();
      $('[data-svf="kind"]', view)?.focus();
      return;
    }
    const d = ui.sv.draft;
    if (d) {
      if (t.closest('[data-svadd]')) { d.items.push(blankSvItem()); renderService(); $(`[data-svitem="${d.items.length - 1}"] [data-svf="kind"]`)?.focus(); return; }
      const del = t.closest('[data-svdel]');
      if (del) { d.items.splice(+del.dataset.svdel, 1); if (!d.items.length) d.items.push(blankSvItem()); renderService(); return; }
      const tps = t.closest('[data-svtplsave]');
      if (tps) {
        const it = d.items[+tps.dataset.svtplsave];
        const r = it && svAddTemplate(svc(), it);
        if (!r) { toast('Vyplň druh zařízení, značku nebo model.', true); return; }
        if (r.existed) { toast(`Vzor ${svDevName(r.t)} už je uložený.`); return; }
        save();
        renderService();
        toast(`Vzor uložen: ${svDevName(r.t)}. Příště ho vybereš v Podle vzoru.`);
        return;
      }
      const un = t.closest('[data-svunlink]');
      if (un) { d.items[+un.dataset.svunlink].dev = ''; svHints(+un.dataset.svunlink); return; }
      if (t.closest('[data-svcancel]')) {
        if (svDraftDirty(d) && !(await confirmBox('Zahodit rozepsaný protokol?', 'Vyplněné údaje se neuloží.', 'Zahodit', true))) return;
        ui.sv.draft = null; renderService(); return;
      }
      const sv = t.closest('[data-svsave]');
      if (sv) { await svSaveDraft(sv.dataset.svsave === 'pdf'); return; }
      return;
    }
    const devBtn = t.closest('[data-svdev]');
    if (devBtn) { await svDeviceDialog(devBtn.dataset.svdev); return; }
    const tpd = t.closest('[data-svtpldel]');
    if (tpd) {
      const c = svc();
      const tp = (c.templates || []).find(x => x.id === tpd.dataset.svtpldel);
      if (!tp || !(await confirmBox('Smazat vzor?', `Vzor ${svDevName(tp)} zmizí z nabídky Podle vzoru. Zařízení ani protokoly se nemění.`, 'Smazat', true))) return;
      c.templates = c.templates.filter(x => x !== tp);
      save(); renderService(); return;
    }
    if (t.closest('[data-svall]')) { ui.sv.all = true; renderService(); return; }
    const exb = t.closest('[data-svexpand]');
    if (exb) { ui.sv.exp = ui.sv.exp || new Set(); const id = exb.dataset.svexpand; if (ui.sv.exp.has(id)) ui.sv.exp.delete(id); else ui.sv.exp.add(id); renderService(); return; }
    const lockB = t.closest('[data-svlock]');
    if (lockB) {
      const x = svc().shipments.find(s => s.id === lockB.dataset.svlock);
      if (!x || !svShipDone(x)) { toast('Uzamknout jde jen protokol, kde je všechno vrácené.', true); return; }
      x.lock = { at: Date.now(), by: ui.me.label || '' };
      if (ui.sv.exp) ui.sv.exp.delete(x.id);
      save(); renderService(); toast(`Protokol ${svNo(x)} uzamčen a sbalený.`); return;
    }
    const unlockB = t.closest('[data-svunlock]');
    if (unlockB) {
      const x = svc().shipments.find(s => s.id === unlockB.dataset.svunlock);
      if (!x || !(await confirmBox(`Odemknout protokol ${svNo(x)}?`, 'Protokol půjde zase upravit a smazat.', 'Odemknout'))) return;
      delete x.lock;
      save(); renderService(); return;
    }
    const lockedOf = el => { const x = svc().shipments.find(s => s.id === el); return x && x.lock ? x : null; };
    const rv = t.closest('[data-svrejview]');
    if (rv) { await svRejView(rv.dataset.svrejview, +rv.dataset.j); return; }
    const guard = t.closest('[data-svback], [data-svbackall], [data-svunback], [data-svedit], [data-svshipdel], [data-svsign], [data-svunsign], [data-svrej], [data-svunrej]');
    if (guard) {
      const id = guard.dataset.svback || guard.dataset.svbackall || guard.dataset.svunback || guard.dataset.svedit || guard.dataset.svshipdel || guard.dataset.svsign || guard.dataset.svunsign || guard.dataset.svrej || guard.dataset.svunrej;
      if (lockedOf(id)) { toast('Protokol je uzamčený. Nejdřív ho odemkni.', true); return; }
    }
    const rej = t.closest('[data-svrej]');
    if (rej) { await svRejDialog(rej.dataset.svrej, +rej.dataset.j); return; }
    const unrej = t.closest('[data-svunrej]');
    if (unrej) {
      const x = svc().shipments.find(s => s.id === unrej.dataset.svunrej);
      const i = x && x.items[+unrej.dataset.j];
      if (!i || !i.rej || !(await confirmBox('Zrušit vyřazení servisem?', `${svDevName(i)} bude zase vedené jako na servisu (nebo k vyřazení). Přiložený protokol k vyřazení se smaže.`, 'Zrušit vyřazení', true))) return;
      const files = i.rej.files;
      delete i.rej;
      save(); renderService();
      svDropFiles(files);
      return;
    }
    const back = t.closest('[data-svback]');
    if (back) { await svBackDialog(back.dataset.svback, +back.dataset.j); return; }
    const backAll = t.closest('[data-svbackall]');
    if (backAll) { await svBackDialog(backAll.dataset.svbackall, null); return; }
    const unback = t.closest('[data-svunback]');
    if (unback) {
      const x = svc().shipments.find(s => s.id === unback.dataset.svunback);
      const i = x && x.items[+unback.dataset.j];
      if (!i || !(await confirmBox('Zrušit vrácení?', `${svDevName(i)} bude zase vedené jako na servisu.`, 'Zrušit vrácení'))) return;
      i.back = ''; i.backNote = '';
      save(); renderService(); return;
    }
    const pdf = t.closest('[data-svpdf]');
    if (pdf) { exportServicePdf(pdf.dataset.svpdf, pdf, pdf.dataset.svpart || 'all'); return; }
    const edit = t.closest('[data-svedit]');
    if (edit) {
      const x = svc().shipments.find(s => s.id === edit.dataset.svedit);
      if (x) { ui.sv.draft = svDraftOf(x); renderService(); window.scrollTo({ top: 0, behavior: 'instant' }); }
      return;
    }
    const sdel = t.closest('[data-svshipdel]');
    if (sdel) {
      const c = svc();
      const x = c.shipments.find(s => s.id === sdel.dataset.svshipdel);
      if (!x || !(await confirmBox(`Smazat protokol ${svNo(x)}?`, `Protokol z ${dayText(x.date)} (${x.items.length} zařízení) zmizí i z historie zařízení. Zařízení v evidenci zůstanou.`, 'Smazat', true))) return;
      c.shipments = c.shipments.filter(s => s !== x);
      save(); renderService();
      if (x.sign) svDropSignFile(x.sign.file);
      svDropFiles(x.items.flatMap(i => i.rej ? i.rej.files : []));
      return;
    }
    const sign = t.closest('[data-svsign]');
    if (sign) { await svSignDialog(sign.dataset.svsign); return; }
    const unsign = t.closest('[data-svunsign]');
    if (unsign) {
      const x = svc().shipments.find(s => s.id === unsign.dataset.svunsign);
      if (!x || !x.sign || !(await confirmBox('Odebrat podpis?', `Podpis předávajícího (${x.sign.name}) zmizí z protokolu ${svNo(x)} i z jeho PDF.`, 'Odebrat', true))) return;
      const old = x.sign;
      delete x.sign;
      save(); renderService();
      svDropSignFile(old.file);
      return;
    }
  });
  view.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.matches('tr[data-svdev]')) { event.preventDefault(); svDeviceDialog(event.target.dataset.svdev); }
  });
  view.addEventListener('input', event => {
    const t = event.target;
    if (t.id === 'svQ') { ui.sv.q = t.value; svDevTable(); return; }
    const d = ui.sv.draft;
    if (!d) return;
    if (t.dataset.svd) { d[t.dataset.svd] = t.value; return; }
    if (t.dataset.svf && t.type !== 'checkbox') {
      const it = d.items[+t.dataset.svi];
      if (!it) return;
      it[t.dataset.svf] = t.value;
      if (['iid', 'sn', 'mark'].includes(t.dataset.svf)) svHints(+t.dataset.svi);
    }
  });
  view.addEventListener('change', event => {
    const t = event.target;
    const d = ui.sv.draft;
    if (!d) return;
    if (t.dataset.svpick != null) {
      const i = +t.dataset.svpick;
      const dv = svc().devices.find(x => svLabel(x) === t.value);
      if (!dv) return;
      Object.assign(d.items[i], { dev: dv.id, kind: dv.kind, brand: dv.brand, model: dv.model, made: dv.made || '', iid: dv.iid, sn: dv.sn, iidBad: dv.iidBad, snBad: dv.snBad, mark: dv.mark });
      renderService();
      $(`[data-svitem="${i}"] [data-svf="fault"]`)?.focus();
      return;
    }
    if (t.dataset.svtpl != null) {
      const i = +t.dataset.svtpl;
      const tp = (svc().templates || []).find(x => x.id === t.value);
      if (!tp || !d.items[i]) return;
      Object.assign(d.items[i], { kind: tp.kind, brand: tp.brand, model: tp.model });
      renderService();
      $(`[data-svitem="${i}"] [data-svf="iid"]`)?.focus();
      return;
    }
    if (t.type === 'checkbox' && t.dataset.svf) {
      const i = +t.dataset.svi;
      const it = d.items[i];
      const f = t.dataset.svf;
      it[f] = t.checked;
      if (t.checked) it[f.replace('Bad', '')] = '';
      renderService();
      $(`[data-svitem="${i}"] [data-svf="${f}"]`)?.focus();
      return;
    }
    if (t.dataset.svp) { const it = d.items[+t.dataset.svi]; if (it && t.checked) it.purpose = t.dataset.svp; return; }
    if (t.dataset.svfault) {
      const it = d.items[+t.dataset.svi];
      if (!it) return;
      const set = new Set(it.faults || []);
      if (t.checked) set.add(t.dataset.svfault); else set.delete(t.dataset.svfault);
      it.faults = SV_FAULT_KEYS.filter(k => set.has(k));
      return;
    }
    if (['iid', 'sn', 'mark'].includes(t.dataset.svf)) svHints(+t.dataset.svi);
  });
}

/* ---------- PDF: předávací protokol (A4 na výšku) ---------- */
/* Předávací protokol (A4 na výšku). part (2.26): 'all' = kompletní, položky v oddílech Na opravu
   a K vyřazení; 'repair' = jen na opravu (čistý protokol pro servis); 'scrap' = jen k vyřazení. */
const SV_PART_DOC = {
  all: { title: 'Předávací protokol', sub: 'Odeslání zařízení na servis', file: '', foot: 'předávací protokol' },
  repair: { title: 'Předávací protokol – na opravu', sub: 'Odeslání zařízení na servis k opravě', file: '-na-opravu', foot: 'předávací protokol na opravu' },
  scrap: { title: 'Protokol – zařízení k vyřazení', sub: 'Předání zařízení k vyřazení', file: '-k-vyrazeni', foot: 'protokol zařízení k vyřazení' },
};
function drawServiceProtocol(doc, x, part = 'all', sign = null) {
  const k = pdfKit(doc);
  const C = k.C;
  const P0 = SV_PART_DOC[part] || SV_PART_DOC.all;
  const list = svPartItems(x, part);
  k.header({ eyebrow: `${EXPORT_NAME} · ODESLÁNÍ NA SERVIS`, right: `Protokol č. ${svNo(x)}`, title: P0.title, sub: P0.sub });
  // údaje protokolu: dva sloupce popisek + hodnota
  const scrapN = x.items.filter(i => i.purpose === 'scrap').length;
  const repN = x.items.length - scrapN;
  const count = part === 'repair' ? `${list.length} (na opravu)` : part === 'scrap' ? `${list.length} (k vyřazení)`
    : `${x.items.length}${scrapN ? ` (k opravě ${repN}, k vyřazení ${scrapN})` : ''}`;
  const info = [['Datum odeslání', dayText(x.date)], ['Číslo protokolu', svNo(x)], [part === 'scrap' ? 'Předáno komu' : 'Servis', x.to || '—'], ['Počet zařízení', count]];
  const cw = (k.CW - 6) / 2;
  for (let r = 0; r < info.length; r += 2) {
    const cells = info.slice(r, r + 2).map(([l, v]) => ({ l, lines: k.split(v, cw - 8, 11, true) }));
    const h = 7 + Math.max(...cells.map(c => c.lines.length)) * k.LH(11, 1.25) + 3;
    cells.forEach((c, i) => {
      const x0 = k.M + i * (cw + 6);
      k.box(C.soft, x0, k.y, cw, h, 2);
      k.text(c.l, x0 + 4, k.y + 2.6, 7.6, { bold: true, color: C.ink2 });
      c.lines.forEach((line, li) => k.text(line, x0 + 4, k.y + 7 + li * k.LH(11, 1.25), 11, { bold: true }));
    });
    k.y += h + 3;
  }
  if (x.note) { k.y += 1; k.para(x.note, k.M, k.CW, 9.2, { color: C.ink2 }); }
  k.y += 5;
  // tabulka zařízení
  const cols = [[7, '#'], [30, 'Druh zařízení'], [24, 'Značka'], [28, 'Model'], [16, 'Rok výroby'], [34, 'Interní ID'], [39, 'Výrobní číslo']];
  const head = () => {
    k.box(C.soft3, k.M, k.y, k.CW, 6.4, 1.2);
    let cx = k.M;
    cols.forEach(([w, t]) => { k.mid(t, cx + 1.6, k.y + 3.2, 7.6, { bold: true, color: C.ink2 }); cx += w; });
    k.y += 7.6;
  };
  const lh = k.LH(9, 1.3);
  // oddíly jen v kompletním protokolu, když jsou v něm obě části
  const both = part === 'all' && scrapN > 0 && repN > 0;
  const section = (t, n, scrap) => {
    k.need(7.4 + 6.4 + 7.6 + 12);   // nadpis oddílu s hlavičkou a první položkou na stejné straně
    k.text(`${t} (${n})`, k.M, k.y + 0.8, 10.4, { bold: true, color: scrap ? C.crit : C.ink });
    k.y += 7.4;
  };
  if (both) section('Na opravu', repN, false);
  head();
  list.forEach(({ it }, n) => {
    if (both && n === repN) { k.y += 3; section('K vyřazení', scrapN, true); head(); }
    const vals = [[String(n + 1)], ...[it.kind, it.brand, it.model, it.made].map((v, i) => k.split(v || '—', cols[i + 1][0] - 3, 9)),
      it.iidBad ? ['nečitelné'] : k.split(it.iid || '—', cols[5][0] - 3, 9, true), it.snBad ? ['nečitelné'] : k.split(it.sn || '—', cols[6][0] - 3, 9, true)];
    // v části (jen opravy nebo jen vyřazení) je účel daný nadpisem, u položky zůstane jen závada
    const purpose = part === 'all' ? (it.purpose === 'scrap' ? 'K VYŘAZENÍ' : 'K opravě') : '';
    const fault = svFaultText(it) ? `Závada: ${svFaultText(it)}` : '';
    const sub = [purpose || fault ? { t: [purpose, fault].filter(Boolean).join(' · '), mark: false, scrap: part === 'all' && it.purpose === 'scrap' } : null].filter(Boolean);
    if (it.iidBad && it.snBad) sub.push({ t: `${SV_MARK_TEXT}${it.mark ? ` Dodatečné označení: ${it.mark}` : ''}`, mark: true });
    const subLines = sub.map(s => ({ ...s, lines: k.split(s.t, k.CW - cols[0][0] - 6, 8.2, s.mark || s.scrap) }));
    const h = Math.max(...vals.map(v => v.length)) * lh + 2.4 + subLines.reduce((a, s) => a + s.lines.length * k.LH(8.2, 1.3) + (s.mark ? 3.4 : 1), 0);
    if (k.need(h)) head();
    let cx = k.M;
    vals.forEach((lines, i) => {
      const bad = (i === 5 && it.iidBad) || (i === 6 && it.snBad);
      lines.forEach((line, li) => k.text(line, cx + 1.6, k.y + 1 + li * lh, 9, { bold: bad || i >= 5 || i === 0, color: bad ? C.crit : i === 0 ? C.ink3 : C.ink }));
      cx += cols[i][0];
    });
    k.y += Math.max(...vals.map(v => v.length)) * lh + 1.6;
    subLines.forEach(s => {
      const x0 = k.M + cols[0][0];
      const sh = s.lines.length * k.LH(8.2, 1.3);
      if (s.mark) { k.box(C.warnSoft, x0, k.y - 0.4, k.CW - cols[0][0], sh + 2.4, 1.4); k.y += 1; }
      s.lines.forEach((line, li) => k.text(line, x0 + (s.mark ? 2.4 : 1.6), k.y + li * k.LH(8.2, 1.3), 8.2, { bold: s.mark || s.scrap, color: s.mark ? C.warn : s.scrap ? C.crit : C.ink2 }));
      k.y += sh + (s.mark ? 2.4 : 1);
    });
    k.y += 0.8;
    k.hline(k.y, C.line, 0.2);
    k.y += 1.2;
  });
  k.y += 6;
  // potvrzení a podpisy
  k.keep(() => {
    k.para(part === 'scrap' ? 'Předávající a přebírající svým podpisem potvrzují předání a převzetí uvedených zařízení k vyřazení.'
      : 'Předávající a přebírající svým podpisem potvrzují předání a převzetí uvedených zařízení k servisu.', k.M, k.CW, 9, { color: C.ink2 });
    k.y += 4;
    const sw = (k.CW - 12) / 3;
    const signed = !!(sign && x.sign);
    ['Předal (jméno a podpis)', part === 'scrap' ? 'Převzal (jméno a podpis)' : 'Převzal za servis (jméno a podpis)', 'Datum převzetí'].forEach((label, i) => {
      const x0 = k.M + i * (sw + 6);
      // digitální podpis předávajícího (2.26) nad čárou, jméno pod ní
      if (i === 0 && signed && !k.dry) {
        try {
          const p = doc.getImageProperties(sign);
          const sc = Math.min((sw - 2) / p.width, 13 / p.height), w = p.width * sc, h = p.height * sc;
          doc.addImage(sign, 'PNG', x0 + 1, k.y + 13.4 - h, w, h, undefined, 'FAST');
        } catch (error) { /* poškozený obrázek: PDF bez podpisu */ }
      }
      k.hline(k.y + 14, C.line2, 0.3, x0, x0 + sw);
      k.text(label, x0, k.y + 15.6, 8, { color: C.ink3 });
      if (i === 0 && signed) {
        k.text(k.split(x.sign.name, sw, 9, true)[0], x0, k.y + 19.4, 9, { bold: true });
        k.text(`podepsáno digitálně${x.sign.at ? ` ${dayText(todayIso(x.sign.at))}` : ''}`, x0, k.y + 23.4, 7.2, { color: C.ink3 });
      }
    });
    k.y += signed ? 29 : 24;
    k.text(`Protokol vystavil${x.by ? ` ${x.by}` : 'a aplikace'}, ${dayText(todayIso(x.at || Date.now()))}.`, k.M, k.y, 7.6, { color: C.ink3 });
    k.y += 5;
  }, 40);
  k.footer(`${EXPORT_NAME} · ${P0.foot} ${svNo(x)} · odesláno ${dayText(x.date)}`);
}
async function exportServicePdf(id, button = null, part = 'all') {
  const x = svc().shipments.find(s => s.id === id);
  if (!x) return;
  const P0 = SV_PART_DOC[part] ? part : 'all';
  if (!svPartItems(x, P0).length) { toast(`V protokolu ${svNo(x)} není žádné zařízení ${P0 === 'scrap' ? 'k vyřazení' : 'na opravu'}.`, true); return; }
  let sign = null;
  if (x.sign) { try { sign = await Vault.loadFile(x.sign.file); } catch (error) { toast('Podpis předávajícího se nepodařilo načíst, PDF bude bez něj.', true); } }
  await withPdf(button, doc => {
    doc.setProperties({ title: `${SV_PART_DOC[P0].title} ${svNo(x)}`, creator: EXPORT_NAME });
    drawServiceProtocol(doc, x, P0, sign);
    downloadFile(`servis-protokol-${svNo(x).replace('/', '-')}${SV_PART_DOC[P0].file}.pdf`, doc.output('blob'), 'application/pdf');
  });
}

