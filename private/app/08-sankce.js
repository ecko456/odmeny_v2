/* ==========================================================================
   SANKCE
   ========================================================================== */
function sanPreview() {
  const d = ui.sanDraft;
  const e = d.key ? S.employees[d.key] : null;
  if (!e) return '';
  if (d.wage) return `<div class="note w">Srážka ze mzdy: tabáky ani Kafe se nekrátí. Od ${esc(dayText(wageFrom(d.period)))} se objeví upozornění, že je potřeba srážku zpracovat ve mzdách.</div>`;
  if (d.period !== S.current || !curPeriod()) return `<p class="small muted">Nárok uvidíš, až bude ${esc(monthLabel(d.period))} vybrané období s docházkou.</p>`;
  const ev = evaluate(e, curPeriod());
  const next = Math.min(100, ev.pctSum + (+d.pct || 0));
  const left = ev.narok - sanDeduct(ev.narok, next, ev.pctCount + 1) - ev.legacy;
  return `<div class="note i">${esc(`${e.last} ${e.first}`)} má za ${esc(monthLabel(d.period))} nárok <b>${ev.narok} ${tabW(ev.narok)}</b>${ev.pctSum ? `, už má sankce <b>−${ev.pctSum} %</b>` : ''}. Po této sankci (celkem −${next} %) zůstane <b>${Math.max(0, left)}</b> před ruční úpravou.</div>`;
}

function renderSanctions() {
  const d = ui.sanDraft;
  const people = Object.values(S.employees).filter(e => !e.excluded && !isLead(e)).sort((a, b) => norm(a.last).localeCompare(norm(b.last), 'cs'));
  if (!d.period) d.period = S.current || thisMonthId();
  const reasons = S.sanReasons || [];
  if (d.reason && d.reason !== '__other' && !reasons.includes(d.reason)) d.reason = '';
  $('#sanForm').innerHTML = `<h3>Nová sankce</h3>${people.length ? `<div class="stack">
    <div class="field"><label for="sanWho">Zaměstnanec</label><div class="who-scan"><select id="sanWho"><option value="">— vyber —</option>${people.map(e => `<option value="${esc(e.key)}"${e.key === d.key ? ' selected' : ''}>${esc(`${e.last} ${e.first}`)}</option>`).join('')}</select>
      <button class="icon-btn scan-btn" type="button" id="sanScan" title="Naskenovat kartičku (ID v evidenci práce)" aria-label="Naskenovat kartičku zaměstnance">${I.scan}</button></div></div>
    <label class="field"><span>Měsíc</span><input type="month" id="sanMonth" value="${esc(d.period)}"></label>
    <label class="field"><span>Důvod</span><select id="sanWhy"><option value="">— vyber důvod —</option>${reasons.map(n => `<option value="${esc(n)}"${n === d.reason ? ' selected' : ''}>${esc(n)}</option>`).join('')}<option value="__other"${d.reason === '__other' ? ' selected' : ''}>Jiný důvod…</option></select></label>
    ${d.reason === '__other' ? `<label class="field"><span>Jiný důvod</span><input type="text" id="sanOther" value="${esc(d.other)}" placeholder="napiš důvod" maxlength="100"></label>` : ''}
    <div class="field san-range"><span><span id="sanPctLabel">${d.wage ? 'Srážka ze mzdy' : 'Srážka z nároku'}</span><b id="sanPctOut">${+d.pct} %</b></span>
      <input type="range" id="sanPct" min="${SAN_PCTS[0]}" max="${SAN_PCTS[SAN_PCTS.length - 1]}" step="5" value="${+d.pct}" list="sanTicks" aria-label="Srážka v procentech">
      <datalist id="sanTicks">${SAN_PCTS.map(v => `<option value="${v}"></option>`).join('')}</datalist>
      <div class="range-scale" aria-hidden="true">${SAN_PCTS.map(v => `<i>${v % 10 ? '' : v}</i>`).join('')}</div></div>
    <label class="check wage-check"><input type="checkbox" id="sanWage"${d.wage ? ' checked' : ''}><span><b>Srážka ze mzdy</b><small>Benefity (tabáky a Kafe) se nekrátí. Týden před koncem měsíce vyskočí upozornění, že je potřeba srážku zpracovat ve mzdách.</small></span></label>
    <label class="field"><span>Poznámka</span><input type="text" id="sanNote" value="${esc(d.note)}" placeholder="volitelné, co se stalo" maxlength="300"></label>
    <div id="sanPrev">${sanPreview()}</div>
    <button class="btn" type="button" id="sanAdd">Přidat sankci</button>
  </div>` : `<p class="muted small">V evidenci zatím nikdo není. Nahraj docházku, nebo přidej člověka v části <b>Lidé</b>.</p>`}`;

  $('#sanReasons').innerHTML = `<h3>Důvody sankcí</h3><p class="small muted">Společný seznam pro všechny. Procento se volí u každé sankce zvlášť. Přejmenování nemění už zadané sankce.</p>
    <div class="reasons">${reasons.map((n, i) => `<div class="reasonrow" data-rsi="${i}"><input type="text" value="${esc(n)}" aria-label="Důvod sankce" maxlength="100"><button class="icon-btn" type="button" data-rsdel aria-label="Odebrat důvod">${I.x}</button></div>`).join('')}</div>
    <button class="btn sec small" type="button" id="sanReasonAdd">Přidat důvod</button>`;

  const months = [...new Set(S.sanctions.map(s => s.period))].sort().reverse();
  const sanFilter = months.includes(P.sanFilter) ? P.sanFilter : '';
  $('#sanFilter').innerHTML = `<option value="">Všechny měsíce</option>${months.map(m => `<option value="${esc(m)}"${m === sanFilter ? ' selected' : ''}>${esc(monthLabel(m))}</option>`).join('')}`;
  $('#sanFilter').value = sanFilter;
  const q = norm($('#sanSearch').value);
  let list = S.sanctions.slice().sort((a, b) => String(b.period).localeCompare(String(a.period)) || b.at - a.at);
  if (sanFilter) list = list.filter(s => s.period === sanFilter);
  if (q) list = list.filter(s => norm(`${nameOf(s.key)} ${sanLabel(s)}`).includes(q));
  /* srážka ze mzdy: stav zpracování ve mzdách přímo pod částkou */
  const wageCell = s => {
    if (!s.wage) return '';
    if (s.done) return `<div class="wage-cell"><span class="ok-mark" title="${esc(s.done.by ? `Zpracoval(a) ${s.done.by}` : '')}">${I.check}zpracováno ${esc(dayText(todayIso(s.done.at), false))}</span> <button class="linkbtn" type="button" data-wageundo="${esc(s.id)}">zrušit</button></div>`;
    const from = wageFrom(s.period), due = todayIso() >= from;
    return `<div class="wage-cell"><button class="btn ${due ? '' : 'sec '}small" type="button" data-wagedone="${esc(s.id)}">Srážka zpracována</button>${due ? '' : `<small class="muted d-block">upozornění od ${esc(dayText(from, false))}</small>`}</div>`;
  };
  $('#sanList').innerHTML = list.length ? `<div class="table-card"><table class="stack"><thead><tr><th>Měsíc</th><th>Zaměstnanec</th><th>Důvod</th><th class="r">Srážka</th><th>Poznámka</th><th></th></tr></thead><tbody>${list.map(s => `<tr${s.wage && !s.done ? ' class="wage-row"' : ''}>
      <td data-label="Měsíc" class="small nowrap">${esc(monthLabel(s.period))}<small class="muted d-block" title="Zadáno">zadáno ${esc(dayText(todayIso(s.at), false))}</small></td>
      <td data-label="Zaměstnanec" class="name"><b>${esc(nameOf(s.key))}</b>${S.employees[s.key] ? '' : ' <span class="tag">není v evidenci</span>'}</td>
      <td data-label="Důvod" class="wrap">${esc(s.pct != null ? s.name : (s.reason || 'Sankce'))}</td>
      <td data-label="Srážka" class="r"><span class="pen nowrap">${s.pct != null ? `−${s.pct} %` : `−${+s.points || 0} tab.`}</span>${s.wage ? ' <span class="tag warn nowrap">ze mzdy</span>' : ''}${wageCell(s)}</td>
      <td data-label="Poznámka" class="wrap small">${esc(s.pct != null ? (s.note || '') : 'starý záznam, pevná srážka')}</td>
      <td class="c actions"><button class="icon-btn" type="button" data-del="${esc(s.id)}" aria-label="Smazat sankci">${I.x}</button></td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="6"><b>${list.length} ${list.length === 1 ? 'sankce' : list.length < 5 ? 'sankce' : 'sankcí'}</b></td></tr></tfoot></table></div>`
    : `<div class="card">${emptyState(S.sanctions.length ? 'Filtru nic neodpovídá' : 'Zatím žádné sankce', S.sanctions.length ? 'Zkus jiný měsíc nebo hledání.' : 'Sankci přidáš formulářem vlevo.')}</div>`;

  const preview = () => { const el = $('#sanPrev'); if (el) el.innerHTML = sanPreview(); };
  if (people.length) {
    $('#sanWho').onchange = event => { d.key = event.target.value; preview(); };
    $('#sanScan').onclick = async () => {
      const key = await scanEmployee(e => (e.excluded ? 'vyřazení ze seznamu, sankce se nezadává' : isLead(e) ? 'vedoucí pracovník, sankce se nezadává' : ''));
      if (!key) return;
      d.key = key; renderSanctions();
      toast(`Vybráno: ${nameOf(key)}`);
      const why = $('#sanWhy'); if (why && !why.value) why.focus();
    };
    $('#sanMonth').onchange = event => { d.period = event.target.value; preview(); };
    $('#sanWhy').onchange = event => { const was = d.reason === '__other'; d.reason = event.target.value; if (was !== (d.reason === '__other')) renderSanctions(); };
    if ($('#sanOther')) $('#sanOther').oninput = event => { d.other = event.target.value; };
    $('#sanPct').oninput = event => { d.pct = +event.target.value; $('#sanPctOut').textContent = `${d.pct} %`; preview(); };
    $('#sanWage').onchange = event => { d.wage = event.target.checked; $('#sanPctLabel').textContent = d.wage ? 'Srážka ze mzdy' : 'Srážka z nároku'; preview(); };
    $('#sanNote').oninput = event => { d.note = event.target.value; };
    $('#sanNote').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); addSanction(); } };
    $('#sanAdd').onclick = addSanction;
  }
  $$('#sanReasons [data-rsi]').forEach(row => {
    const i = +row.dataset.rsi;
    $('input', row).onchange = event => {
      const v = event.target.value.trim();
      if (v) S.sanReasons[i] = v; else event.target.value = S.sanReasons[i];
      save();
    };
    $('[data-rsdel]', row).onclick = async () => {
      if (!(await confirmBox('Odebrat důvod?', `„${S.sanReasons[i]}“ zmizí z nabídky. Už zadané sankce zůstanou.`, 'Odebrat'))) return;
      S.sanReasons.splice(i, 1); save(); renderSanctions();
    };
  });
  $('#sanReasonAdd').onclick = async () => {
    const value = await promptBox('Nový důvod sankce', 'Důvod', '', 'Přidat');
    if (!value) return;
    if (!S.sanReasons.some(x => norm(x) === norm(value))) S.sanReasons.push(value.slice(0, 100));
    save(); renderSanctions();
  };
  $$('#sanList [data-wagedone]').forEach(button => { button.onclick = () => markWage(button.dataset.wagedone, true); });
  $$('#sanList [data-wageundo]').forEach(button => {
    button.onclick = async () => {
      const s = S.sanctions.find(x => x.id === button.dataset.wageundo);
      if (!s || !(await confirmBox('Zrušit zpracování?', `${nameOf(s.key)}: ${sanLabel(s)}. Srážka se znovu objeví v upozornění.`, 'Zrušit zpracování'))) return;
      markWage(s.id, false);
    };
  });
  $$('#sanList [data-del]').forEach(button => {
    button.onclick = async () => {
      const s = S.sanctions.find(x => x.id === button.dataset.del);
      if (!s) return;
      if (!(await confirmBox('Smazat sankci?', `${nameOf(s.key)}: ${sanLabel(s)}`, 'Smazat', true))) return;
      S.sanctions = S.sanctions.filter(x => x.id !== s.id);
      save(); renderAll(); toast('Sankce smazána.');
    };
  });
}

function addSanction() {
  const d = ui.sanDraft;
  const pctValue = +d.pct;
  const name = d.reason === '__other' ? String(d.other || '').trim().slice(0, 100) : d.reason;
  if (!d.key) { toast('Vyber zaměstnance.', true); return; }
  if (!/^\d{4}-\d{2}$/.test(d.period || '')) { toast('Vyber měsíc.', true); return; }
  if (!name) { toast('Vyber nebo napiš důvod sankce.', true); return; }
  if (!SAN_PCTS.includes(pctValue)) { toast('Zvol srážku 5–50 % (po 5 %).', true); return; }
  S.sanctions.push({ id: uid('x'), key: d.key, period: d.period, name, pct: pctValue, ...(d.wage ? { wage: true } : {}), note: String(d.note || '').trim().slice(0, 300), at: Date.now() });
  const wage = d.wage;
  d.note = ''; d.other = ''; d.wage = false;
  save(); renderAll();
  toast(`${nameOf(d.key)}: ${name} −${pctValue} %${wage ? ' ze mzdy' : ''} za ${monthLabel(d.period)}.`);
}

/* ---------- skener kartičky zaměstnance (2.13) ----------
   Kód z kartičky (čárový nebo QR) nese ID v evidenci práce. Kamerou: BarcodeDetector, kde ho
   prohlížeč má (Android, macOS), jinak knihovna ZXing. Čtečka, která píše jako klávesnice,
   zapíše kód do pole a Enter ho vyhledá; ID jde i napsat ručně. */
let codeScan = null;
function stopCodeScan() {
  if (!codeScan) return;
  codeScan.active = false;
  codeScan.stream?.getTracks().forEach(track => track.stop());
  codeScan = null;
}
async function zxingDecoder() {
  if (!window.ZXing) await OdmLock.loadScript(`app.php?f=zxing.js&v=${document.body.dataset.privateVersion || '1'}`);
  const Z = window.ZXing;
  const reader = new Z.MultiFormatReader();
  reader.setHints(new Map([[Z.DecodeHintType.TRY_HARDER, true]]));
  return canvas => {
    try { return reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)))).getText(); } catch { return null; } finally { reader.reset(); }
  };
}
/* Čte kódy z kamery, dokud onText nevrátí true (nalezeno) nebo se skener nezastaví. */
async function startCodeScan(video, onText) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Tento prohlížeč neumí použít kameru.');
  stopCodeScan();
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
  const cur = { stream, active: true };
  codeScan = cur;
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  await video.play();
  let native = null;
  if ('BarcodeDetector' in window) {
    try { const formats = await window.BarcodeDetector.getSupportedFormats(); if (formats.length) native = new window.BarcodeDetector({ formats }); } catch { native = null; }
  }
  const zx = native ? null : await zxingDecoder();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const tick = async () => {
    if (!cur.active) return;
    let text = null;
    if (video.readyState >= 2 && video.videoWidth) {
      if (native) { try { const codes = await native.detect(video); text = codes[0]?.rawValue || null; } catch { text = null; } }
      else {
        const scale = Math.min(1, 960 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        text = zx(canvas);
      }
    }
    if (text && cur.active && onText(text)) return;
    setTimeout(tick, 160);
  };
  tick();
}
/* Dialog skeneru: vrátí klíč nalezeného člověka, nebo null. blocked(e) = důvod, proč ho vybrat nejde. */
async function scanEmployee(blocked) {
  let found = null;
  let last = '';
  await dialog({
    title: 'Naskenovat kartičku', ok: '', cancel: 'Zavřít',
    html: `<div class="emp-scan">
      <div class="scanner wide-scan" id="scanCam"><video muted playsinline aria-label="Náhled kamery"></video><div class="frame"></div><div class="scanner-hint">Kód kartičky do rámečku</div></div>
      <p class="small muted" id="scanState">Zapínám kameru…</p>
      <label class="field"><span>ID v evidenci práce</span><span class="scan-row"><input type="text" id="scanInput" autocomplete="off" spellcheck="false" placeholder="naskenuj čtečkou, nebo napiš" maxlength="120" autofocus><button class="btn sec" type="button" id="scanFind">Najít</button></span></label>
      <div id="scanMsg" aria-live="polite"></div></div>`,
    onOpen: dlg => {
      const msg = (text, cls = 'w') => { $('#scanMsg', dlg).innerHTML = text ? `<div class="note ${cls}">${text}</div>` : ''; };
      // vrátí true, když je hotovo (dialog se zavře s vybraným člověkem)
      const tryCode = (raw, typed) => {
        const code = String(raw || '').trim();
        if (!code) return false;
        if (!typed && code === last) return false;   // stejný kód z kamery: hláška už je vidět
        last = code;
        const key = keyByScan(code);
        const e = key ? S.employees[key] : null;
        if (!e) { msg(`Kód <b>${esc(code)}</b> nemá nikdo jako ID v evidenci práce. ID doplníš v Lidech u člověka.`); return false; }
        const why = blocked ? blocked(e) : '';
        if (why) { msg(`${esc(`${e.last} ${e.first}`)}: ${esc(why)}.`); return false; }
        found = key;
        if (navigator.vibrate) navigator.vibrate(60);
        stopCodeScan();
        dlg.close('ok');
        return true;
      };
      const input = $('#scanInput', dlg);
      input.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault(); event.stopPropagation();   // Enter by jinak dialog zavřel
        if (!tryCode(input.value, true)) input.select();
      });
      $('#scanFind', dlg).onclick = () => { if (!tryCode(input.value, true)) { input.focus(); input.select(); } };
      dlg.addEventListener('close', stopCodeScan, { once: true });
      startCodeScan($('#scanCam video', dlg), text => tryCode(text, false))
        .then(() => { const st = $('#scanState', dlg); if (st) st.textContent = 'Kamera běží. Drž čárový nebo QR kód kartičky v rámečku.'; })
        .catch(() => {
          const cam = $('#scanCam', dlg); if (cam) cam.hidden = true;
          const st = $('#scanState', dlg); if (st) st.textContent = 'Kamera není k dispozici (nebo k ní prohlížeč nemá povolení). Naskenuj kartičku čtečkou, nebo napiš ID.';
        });
    },
  });
  stopCodeScan();
  return found;
}

/* ---------- srážky ze mzdy: upozornění a „Srážka zpracována“ ---------- */
function markWage(id, done) {
  if (id.startsWith('n:')) {
    // srážka za neproduktivitu: n:měsíc:klíč (zpracování uloží snímek, aby se už nepřepočítala)
    const pid = id.slice(2, 9), key = id.slice(10), e = S.employees[key];
    if (!e) return;
    if (done) { const x = normCutOf(e, pid); if (!x || !x.pct) return; setNormCutDone(pid, key, { pct: x.pct, norm: x.norm }, effMeta()); } else setNormCutDone(pid, key, null);
  } else if (!setWageDone(id, done, effMeta())) return;
  save(); renderAll();
  const left = wageAllPending().length;
  toast(done ? (left ? `Srážka zpracována. Zbývá ${left}.` : 'Srážka zpracována. Všechny srážky ze mzdy jsou hotové.') : 'Zpracování zrušeno, srážka je zase v upozornění.');
}
function wageListHtml() {
  const list = wageAllPending();
  if (!list.length) return `<div class="note i">Všechny srážky ze mzdy jsou zpracované.</div>`;
  return `<p class="small muted">Srážky ze mzdy, které je potřeba zpracovat ve mzdách. Po zpracování klikni na „Srážka zpracována“; když budou hotové všechny, upozornění zmizí.</p>
    <div class="wage-list">${list.map(s => `<div class="wage-item" data-wageitem="${esc(s.id)}">
      <div><b>${esc(nameOf(s.key))}</b><small>${esc(monthLabel(s.period))} · ${esc(s.name)} · <span class="pen">−${s.pct} % ze mzdy</span>${s.note ? ` · ${esc(s.note)}` : ''}${s.kind === 'norm' ? ' · <span class="tag">automaticky</span>' : ''}</small></div>
      <button class="btn small" type="button" data-wageok="${esc(s.id)}">Srážka zpracována</button></div>`).join('')}</div>`;
}
async function openWageList() {
  await dialog({
    title: 'Srážky ze mzdy ke zpracování', html: `<div id="wageDlg">${wageListHtml()}</div>`, ok: '', cancel: 'Zavřít', wide: true,
    onOpen: dlg => {
      $('#wageDlg', dlg).addEventListener('click', event => {
        const b = event.target.closest('[data-wageok]');
        if (!b) return;
        markWage(b.dataset.wageok, true);
        $('#wageDlg', dlg).innerHTML = wageListHtml();
        const next = $('[data-wageok]', dlg);
        if (next) next.focus();
      });
    },
  });
}
function renderWageAlert() {
  const box = $('#wageAlert');
  if (!box) return;
  const list = wageAllPending();
  if (!list.length) { box.innerHTML = ''; return; }
  const people = [...new Set(list.map(s => s.key))].map(nameOf);
  const last = list.reduce((x, s) => (s.period > x ? s.period : x), list[0].period);
  const end = isoOf(Date.UTC(+last.slice(0, 4), +last.slice(5, 7), 0));
  box.innerHTML = `<div class="banner wage-alert" role="alert"><div><b>Zpracuj srážky ze mzdy</b> (${list.length}): ${esc(people.slice(0, 4).join(', '))}${people.length > 4 ? ` a další (${people.length - 4})` : ''}. ${todayIso() <= end ? `Měsíc končí ${esc(dayText(end))}.` : 'Termín už uplynul.'}</div>
    <div class="banner-actions"><button class="btn small" type="button" id="wageOpen">Zobrazit seznam</button></div></div>`;
  $('#wageOpen').onclick = openWageList;
}

