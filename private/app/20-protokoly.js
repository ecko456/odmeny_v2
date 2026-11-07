/* ==========================================================================
   PROTOKOLY: provozní deníky strojů (2.16)
   Ke stroji údaje, fotka a úkony (postup, kritérium, kdo, fotky, interval). Z intervalů
   vzniká doporučení na každý den archu; tiskne se na rok nebo vlastní období (do 2 let).
   Fotky jsou šifrované zvlášť (Vault.saveFile), v datech je jen jejich id.
   ========================================================================== */
const LB_TEMPLATE = [
  ['Vizuální kontrola stroje a okolí', 'shift', {}, 'obsluha', false, 'Obejít stroj, zkontrolovat úniky oleje a vzduchu, poškozené kabely a hadice, čistotu pracoviště.', 'Bez úniků a poškození, pracoviště uklizené.'],
  ['Kontrola bezpečnostních prvků', 'shift', {}, 'obsluha', false, 'Vyzkoušet nouzové zastavení, kryty, dveře a světelné závory.', 'Stroj se zastaví, kryty jsou na místě a fungují.'],
  ['Čištění pracovního prostoru', 'day', {}, 'obsluha', true, 'Odstranit třísky a nečistoty z pracovního prostoru a vedení.', 'Pracovní prostor čistý, vedení bez třísek.'],
  ['Kontrola maziva a provozních kapalin', 'week', { dow: 1 }, 'obsluha', false, 'Zkontrolovat hladinu oleje, maziva a chladicí kapaliny, podle potřeby doplnit.', 'Hladina mezi značkami MIN a MAX.'],
  ['Čištění filtrů', 'month', { day: 0 }, 'serizovac', true, 'Vyčistit nebo vyměnit filtry (vzduch, chlazení) podle návodu.', 'Filtr čistý a nepoškozený.'],
  ['Hydraulika a pneumatika', 'month', { day: 0 }, 'udrzba', true, 'Zkontrolovat tlaky, hadice, spoje a těsnost.', 'Tlak v předepsaném rozsahu, bez úniků.'],
  ['Vizuální kontrola elektroinstalace', 'months', { n: 3, day: 0 }, 'udrzba', true, 'Kabely, konektory a rozvaděč bez poškození a známek přehřátí.', 'Bez poškození, rozvaděč zavřený.'],
  ['Preventivní údržba podle návodu výrobce', 'year', { month: 1, day: 0 }, 'udrzba', true, 'Úkony podle návodu k používání (výměna oleje, kontrola vůlí, seřízení).', 'Provedeno a zapsáno v servisní knize stroje.'],
];
const LB_FIELDS = [['name', 'Název stroje', 120], ['inv', 'Evidenční číslo', 60], ['maker', 'Výrobce', 80], ['model', 'Typ / model', 80], ['serial', 'Výrobní číslo', 60],
  ['year', 'Rok výroby', 10], ['place', 'Umístění', 120], ['owner', 'Odpovědná osoba', 80], ['service', 'Kontakt na údržbu', 120], ['manual', 'Návod k používání (kde je)', 300]];
const LB_DOW = ['', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'];
const photoCache = new Map();

/* Čísla úkonů zkráceně: 1, 2, 3, 4, 7 → „1–4, 7“. */
function lbRangeText(list) {
  const out = [];
  list.forEach(n => {
    const last = out[out.length - 1];
    if (last && n === last[1] + 1) last[1] = n; else out.push([n, n]);
  });
  return out.map(([a, b]) => (a === b ? String(a) : b === a + 1 ? `${a}, ${b}` : `${a}–${b}`)).join(', ');
}
function lbBook() { return (S.logbooks || []).find(b => b.id === ui.lb.sel) || null; }
function lbWhoName(k) { const x = LB_WHO.find(w => w[0] === k); return x ? x[1] : ''; }
function lbName(b) { return b.name || '(bez názvu)'; }
function lbToday(b) {
  const d = lbPlan(b, todayIso(), todayIso())[0];
  return d ? [...new Set(lbRowSteps(d, 0))] : [];
}

/* ---------- fotky: šifrované na serveru, v prohlížeči se dešifrují do blob: URL ---------- */
function photoUrl(id) {
  if (!photoCache.has(id)) {
    photoCache.set(id, Vault.loadFile(id)
      .then(bytes => URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' })))
      .catch(() => { photoCache.delete(id); return ''; }));
  }
  return photoCache.get(id);
}
function hydratePhotos(root) {
  $$('img[data-photo]', root).forEach(img => {
    if (img.getAttribute('src')) return;
    photoUrl(img.dataset.photo).then(url => {
      if (url) img.src = url;
      else img.closest('.ph')?.classList.add('missing');
    });
  });
}
/* Fotka z telefonu zmenšená na 1600 px a uložená jako JPEG (kvůli místu a rychlosti). */
async function shrinkPhoto(file, max = 1600, quality = 0.82) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch (error) { throw new Error('Tenhle formát fotky prohlížeč neumí otevřít. Zkus JPG nebo PNG.'); }
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  if (bmp.close) bmp.close();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Fotku se nepodařilo zpracovat.');
  return new Uint8Array(await blob.arrayBuffer());
}
async function addPhotos(files, target) {
  const book = lbBook();
  if (!book) return;
  const step = target === 'book' ? null : book.steps.find(x => x.id === target);
  const room = step ? LB_PHOTOS - step.photos.length : 1;
  const list = [...files].slice(0, Math.max(0, room));
  if (!list.length) { toast(`Nejvýš ${LB_PHOTOS} fotky k úkonu.`, true); return; }
  toast(list.length > 1 ? `Šifruji a nahrávám ${list.length} fotky…` : 'Šifruji a nahrávám fotku…');
  let done = 0;
  for (const file of list) {
    try {
      const id = await Vault.saveFile(await shrinkPhoto(file));
      if (step) step.photos.push(id);
      else {
        if (book.photo) Vault.deleteFile(book.photo).catch(() => {});
        book.photo = id;
      }
      done += 1;
      save();
    } catch (error) {
      toast(error.message, true);
      break;
    }
  }
  renderLbDetail();
  if (done) toast(done > 1 ? `Fotky uložené (${done}).` : 'Fotka uložená.');
}
async function removePhoto(target, id) {
  const book = lbBook();
  if (!book || !(await confirmBox('Smazat fotku?', 'Fotka se smaže i ze serveru.', 'Smazat', true))) return;
  if (target === 'book') book.photo = '';
  else { const step = book.steps.find(x => x.id === target); if (step) step.photos = step.photos.filter(p => p !== id); }
  Vault.deleteFile(id).catch(() => {});
  save();
  renderLbDetail();
}
async function viewPhoto(id) {
  const url = await photoUrl(id);
  if (!url) { toast('Fotka už na serveru není.', true); return; }
  await dialog({ title: 'Fotka', ok: '', cancel: 'Zavřít', wide: true, html: `<img class="ph-big" src="${url}" alt="">` });
}

/* ---------- seznam a detail ---------- */
function renderLogbooks() {
  const list = (S.logbooks || []).slice().sort((a, b) => norm(lbName(a)).localeCompare(norm(lbName(b)), 'cs'));
  if (!list.some(b => b.id === ui.lb.sel)) ui.lb.sel = list[0] ? list[0].id : null;
  const q = norm($('#lbSearch').value);
  const shown = q ? list.filter(b => norm(`${b.name} ${b.inv} ${b.dept} ${b.place} ${b.model}`).includes(q)) : list;
  $('#lbList').innerHTML = shown.length ? shown.map(b => {
    const today = lbToday(b).length;
    return `<button class="list-item" type="button" data-lbsel="${esc(b.id)}" aria-current="${b.id === ui.lb.sel}">
      <span class="lb-ico" aria-hidden="true">${navIcon('protokoly')}</span>
      <span class="nm"><b>${esc(lbName(b))}</b><span>${esc([b.inv, b.dept || b.place, `${b.steps.length} ${b.steps.length === 1 ? 'úkon' : b.steps.length >= 2 && b.steps.length <= 4 ? 'úkony' : 'úkonů'}`].filter(Boolean).join(' · '))}</span></span>
      ${today ? `<span class="tag acc" title="Doporučené úkony dnes">dnes ${today}</span>` : ''}</button>`;
  }).join('') : emptyState(list.length ? 'Nic nenalezeno' : 'Zatím žádný deník', list.length ? 'Zkus jiný název nebo číslo stroje.' : 'Založ první deník tlačítkem Nový deník.');
  $('#lbSplit').classList.toggle('show-detail', !!(ui.lb.open && lbBook()));
  renderLbDetail();
  syncHistory();
}

function lbEveryControls(x, book) {
  const e = x.every;
  const n = ['weeks', 'months', 'ndays', 'hours'].includes(e.k);
  const dows = book.weekend ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];
  return `<div class="lb-every">
    <select data-lbe="k" data-step="${esc(x.id)}" aria-label="Interval">${LB_EVERY.map(([k, t]) => `<option value="${k}"${k === e.k ? ' selected' : ''}>${t}</option>`).join('')}</select>
    ${n ? `<label class="lb-n"><span>N</span><input type="number" min="1" max="5000" step="1" inputmode="numeric" data-lbe="n" data-step="${esc(x.id)}" value="${e.n}" aria-label="Počet"></label>` : ''}
    ${['week', 'weeks'].includes(e.k) ? `<select data-lbe="dow" data-step="${esc(x.id)}" aria-label="Den v týdnu">${dows.map(d => `<option value="${d}"${d === e.dow ? ' selected' : ''}>${LB_DOW[d]}</option>`).join('')}</select>` : ''}
    ${['month', 'months', 'year'].includes(e.k) ? `<select data-lbe="day" data-step="${esc(x.id)}" aria-label="Den v měsíci"><option value="0"${!e.day ? ' selected' : ''}>1. pracovní den</option>${Array.from({ length: 28 }, (_, i) => i + 1).map(d => `<option value="${d}"${d === e.day ? ' selected' : ''}>${d}. den</option>`).join('')}</select>` : ''}
    ${e.k === 'year' ? `<select data-lbe="month" data-step="${esc(x.id)}" aria-label="Měsíc">${MONTH_NAME.map((m, i) => `<option value="${i + 1}"${i + 1 === e.month ? ' selected' : ''}>${m}</option>`).join('')}</select>` : ''}
  </div>`;
}

function lbPhotosHtml(target, ids, max) {
  return `<div class="ph-row">${ids.map(id => `<div class="ph"><button type="button" class="ph-img" data-phview="${esc(id)}" aria-label="Zobrazit fotku"><img data-photo="${esc(id)}" alt=""></button>
      <button type="button" class="icon-btn ph-del" data-phdel="${esc(id)}" data-phfor="${esc(target)}" title="Smazat fotku" aria-label="Smazat fotku">${I.x}</button></div>`).join('')}
    ${ids.length < max ? `<label class="ph-add" title="Přidat fotku">${I.camera}<span>${ids.length ? 'Další fotka' : 'Přidat fotku'}</span><input type="file" accept="image/*" data-phin="${esc(target)}"${max > 1 ? ' multiple' : ''} hidden></label>` : ''}</div>`;
}

function lbStepHtml(x, i, book) {
  const tools = `<div class="row lb-step-tools"><button type="button" class="icon-btn" data-lsmove="-1" data-step="${esc(x.id)}" title="Posunout nahoru" aria-label="Posunout nahoru"${i ? '' : ' disabled'}>${I.up}</button>
        <button type="button" class="icon-btn" data-lsmove="1" data-step="${esc(x.id)}" title="Posunout dolů" aria-label="Posunout dolů"${i < book.steps.length - 1 ? '' : ' disabled'}>${I.down}</button>
        <button type="button" class="icon-btn" data-lsdel="${esc(x.id)}" title="Odebrat úkon" aria-label="Odebrat úkon">${I.x}</button></div>`;
  if (!ui.lb.openSteps.has(x.id)) {
    // sbalený úkon: přehled, klepnutím se otevře editor
    return `<article class="lb-step closed" data-stepcard="${esc(x.id)}">
      <div class="lb-step-head"><button type="button" class="lb-step-sum" data-lsopen="${esc(x.id)}" aria-expanded="false"><span class="lb-num">${i + 1}</span>
        <span class="nm"><b>${esc(x.name || 'Bez názvu')}</b><span>${esc([lbEveryText(x.every), lbWhoName(x.who), x.stop ? 'za klidu stroje' : '', x.photos.length ? `${x.photos.length} ${x.photos.length === 1 ? 'fotka' : 'fotky'}` : ''].filter(Boolean).join(' · '))}</span></span>
        ${x.photos.length ? `<span class="lb-thumbs">${x.photos.map(id => `<img data-photo="${esc(id)}" alt="">`).join('')}</span>` : ''}</button>${tools}</div>
    </article>`;
  }
  return `<article class="lb-step" data-stepcard="${esc(x.id)}">
    <div class="lb-step-head"><span class="lb-num">${i + 1}</span>
      <input type="text" class="lb-step-name" data-lsf="name" data-step="${esc(x.id)}" value="${esc(x.name)}" placeholder="Název úkonu" maxlength="160" aria-label="Název úkonu">
      ${tools}</div>
    <div class="lb-step-grid">
      <div class="field"><span>Interval</span>${lbEveryControls(x, book)}</div>
      <label class="field"><span>Provádí</span><select data-lsf="who" data-step="${esc(x.id)}">${LB_WHO.map(([k, t]) => `<option value="${k}"${k === x.who ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    </div>
    <label class="field"><span>Postup</span><textarea data-lsf="how" data-step="${esc(x.id)}" rows="2" maxlength="2000" placeholder="Co a jak udělat">${esc(x.how)}</textarea></label>
    <label class="field"><span>V pořádku, když</span><input type="text" data-lsf="ok" data-step="${esc(x.id)}" value="${esc(x.ok)}" maxlength="600" placeholder="Kritérium, např. hladina mezi MIN a MAX"></label>
    <label class="switch"><input type="checkbox" data-lsf="stop" data-step="${esc(x.id)}"${x.stop ? ' checked' : ''}><span>Za klidu stroje (zastavit a zajistit proti spuštění)</span></label>
    ${lbPhotosHtml(x.id, x.photos, LB_PHOTOS)}
    <button type="button" class="btn ghost small lb-step-close" data-lsopen="${esc(x.id)}" aria-expanded="true">Sbalit úkon</button>
  </article>`;
}

function lbPreviewHtml(book) {
  const from = todayIso(), days = lbPlan(book, from, addDays(from, 13));
  const rows = days.map(d => {
    const recs = Array.from({ length: book.shifts }, (_, r) => lbRowSteps(d, r));
    const any = recs.some(r => r.length);
    const shiftTxt = book.shifts > 1 ? recs.map((r, j) => `<span class="lb-sh">${'ROD'[j]}</span>${r.length ? r.join(', ') : '—'}`).join(' ') : (recs[0].length ? recs[0].join(', ') : '—');
    return `<tr class="${d.weekend || d.hol ? 'off' : ''}"><th scope="row">${DOW_SHORT[d.dow]} ${dayText(d.iso, false)}${d.hol ? `<small>${esc(d.hol)}</small>` : ''}</th>
      <td>${d.work || any ? shiftTxt : `<span class="muted">${d.hol ? 'svátek' : 'víkend'}</span>`}</td></tr>`;
  }).join('');
  return `<table class="lb-plan"><thead><tr><th>Den</th><th>Doporučeno${book.shifts > 1 ? ' (R ranní, O odpolední, D noční)' : ''}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderLbDetail() {
  const box = $('#lbDetail');
  const book = lbBook();
  if (!book) { box.innerHTML = ''; return; }
  const deps = departments();
  const y = new Date().getFullYear();
  const lb = ui.lb;
  box.innerHTML = `<button class="btn ghost small back-btn" type="button" id="lbBack">${I.back}Seznam strojů</button>
  <div class="stack">
    <div class="card lb-machine">
      <div class="card-head"><div><p class="eyebrow">Provozní deník</p><h2>${esc(lbName(book))}</h2></div>
        <div class="row gap"><button class="btn ghost small" type="button" id="lbCopy" title="Nový deník se stejnými úkony">Kopie pro další stroj</button><button class="btn ghost small" type="button" id="lbDel">Smazat</button></div></div>
      <div class="lb-machine-grid">
        <div class="lb-photo">${book.photo ? `<div class="ph ph-main"><button type="button" class="ph-img" data-phview="${esc(book.photo)}" aria-label="Zobrazit fotku stroje"><img data-photo="${esc(book.photo)}" alt=""></button>
          <button type="button" class="icon-btn ph-del" data-phdel="${esc(book.photo)}" data-phfor="book" title="Smazat fotku" aria-label="Smazat fotku stroje">${I.x}</button></div>`
          : `<label class="ph-add ph-main" title="Fotka stroje">${I.camera}<span>Fotka stroje</span><input type="file" accept="image/*" data-phin="book" hidden></label>`}</div>
        <div class="form-grid lb-fields">
          ${LB_FIELDS.map(([k, label, max]) => `<label class="field${k === 'name' ? ' lb-wide' : ''}"><span>${label}${k === 'name' ? ' *' : ''}</span><input type="text" data-lbf="${k}" value="${esc(book[k])}" maxlength="${max}"${k === 'year' ? ' inputmode="numeric"' : ''}></label>`).join('')}
          <label class="field"><span>Oddělení</span><select data-lbf="dept"><option value="">— bez oddělení —</option>${[...new Set([...deps, ...(book.dept && !deps.includes(book.dept) ? [book.dept] : [])])].map(d => `<option value="${esc(d)}"${d === book.dept ? ' selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
        </div>
      </div>
      <label class="field"><span>Bezpečnost a OOPP</span><textarea data-lbf="safety" rows="2" maxlength="1500" placeholder="Např. brýle a rukavice, při čištění stroj vypnout a zajistit hlavní vypínač">${esc(book.safety)}</textarea></label>
      <label class="field"><span>Poznámka</span><textarea data-lbf="note" rows="2" maxlength="1500">${esc(book.note)}</textarea></label>
      <div class="lb-run">
        <label class="switch"><input type="checkbox" data-lbf="weekend"${book.weekend ? ' checked' : ''}><span>Stroj pracuje i o víkendu</span></label>
        <label class="switch"><input type="checkbox" data-lbf="counter"${book.counter ? ' checked' : ''}><span>Zapisovat stav počitadla (motohodiny, kusy)</span></label>
        <label class="field lb-shifts"><span>Záznamů za den</span><select data-lbf="shifts">${[[1, '1 (jeden řádek na den)'], [2, '2 (ranní a odpolední)'], [3, '3 (ranní, odpolední, noční)']].map(([v, t]) => `<option value="${v}"${v === book.shifts ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="field lb-from"><span>Intervaly počítat od</span><input type="date" data-lbf="from" value="${esc(book.from)}"></label>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><div><h3>Úkony</h3><p class="small muted">Číslo úkonu se tiskne do archu jako doporučení dne. Fotky ukazují, co přesně zkontrolovat.</p></div>
        ${book.steps.length ? '' : '<button class="btn sec small" type="button" id="lbTpl">Vložit vzorové úkony</button>'}</div>
      <div class="lb-steps">${book.steps.map((x, i) => lbStepHtml(x, i, book)).join('') || '<p class="small muted">Zatím žádný úkon. Přidej vlastní, nebo vlož vzor a uprav ho podle návodu ke stroji.</p>'}</div>
      <button class="btn sec" type="button" id="lbAddStep">+ Přidat úkon</button>
    </div>

    <div class="card">
      <h3>Doporučení na příštích 14 dní</h3>
      <p class="small muted">Tak, jak vyjde v archu. Víkendy${book.weekend ? '' : ' a svátky'} jsou šedé${book.weekend ? '; stroj pracuje i o víkendu, nepracuje se jen ve svátek' : ', stroj v nich nepracuje a termín se posune na další pracovní den'}.</p>
      ${book.steps.length ? lbPreviewHtml(book) : '<p class="small muted">Bez úkonů není co plánovat.</p>'}
    </div>

    <div class="card lb-print">
      <h3>Tisk deníku</h3>
      <div class="chips" role="radiogroup" aria-label="Období">
        <button type="button" class="chip${lb.mode === 'year' ? ' on' : ''}" data-lbmode="year" aria-pressed="${lb.mode === 'year'}">Celý rok</button>
        <button type="button" class="chip${lb.mode === 'custom' ? ' on' : ''}" data-lbmode="custom" aria-pressed="${lb.mode === 'custom'}">Vlastní období</button>
      </div>
      ${lb.mode === 'year' ? `<label class="field lb-year"><span>Rok</span><select id="lbYear">${[y - 1, y, y + 1, y + 2].map(v => `<option value="${v}"${v === +lb.year ? ' selected' : ''}>${v}</option>`).join('')}</select></label>`
        : `<div class="row gap lb-range"><label class="field"><span>Od</span><input type="date" id="lbFrom" value="${esc(lb.from)}"></label><label class="field"><span>Do</span><input type="date" id="lbTo" value="${esc(lb.to)}"></label></div>
           <p class="tiny muted">Nejvýš dva roky. Doporučení se spočítá na každý den podle intervalů.</p>`}
      <label class="switch"><input type="checkbox" id="lbIntro"${lb.intro ? ' checked' : ''}><span>Na začátek kartu stroje a úkony s fotkami</span></label>
      <label class="switch"><input type="checkbox" id="lbExtra"${lb.extra ? ' checked' : ''}><span>Na konec záznam oprav a seznam zaškolené obsluhy</span></label>
      <div class="row gap"><button class="btn" type="button" id="lbPdf"${book.steps.length ? '' : ' disabled'}>Stáhnout PDF k tisku</button></div>
      <div class="note i lb-legal"><b>Doporučení není záznam.</b> Předtištěná čísla úkonů jsou jen plán podle intervalů. Záznamem je až řádek, kde obsluha zakroužkuje „Dle doporučení“, nebo vypíše provedené úkony, a podepíše ho. Intervaly mají vycházet z návodu výrobce a místního provozního předpisu. Revize vyhrazených zařízení (elektro, tlakové, zdvihací) tenhle deník nenahrazuje.</div>
    </div>
  </div>`;
  hydratePhotos(box);
}

/* ---------- úpravy ---------- */
function lbInput(event) {
  const book = lbBook();
  if (!book) return;
  const t = event.target;
  if (t.dataset.lbf) {
    const k = t.dataset.lbf;
    book[k] = t.type === 'checkbox' ? t.checked : k === 'shifts' ? +t.value : t.value;
    save();
    if (['name', 'inv', 'dept', 'place', 'model'].includes(k)) {
      const item = $(`#lbList [data-lbsel="${CSS.escape(book.id)}"] .nm`);
      if (item) $('b', item).textContent = lbName(book);
      if (k === 'name') { const h = $('#lbDetail .lb-machine h2'); if (h) h.textContent = lbName(book); }
    }
    if (event.type === 'change' && ['weekend', 'shifts', 'from', 'dept'].includes(k)) renderLogbooks();
    return;
  }
  const step = t.dataset.step && book.steps.find(x => x.id === t.dataset.step);
  if (!step) return;
  if (t.dataset.lsf) {
    step[t.dataset.lsf] = t.type === 'checkbox' ? t.checked : t.value;
    save();
    return;
  }
  if (t.dataset.lbe && event.type === 'change') {
    const k = t.dataset.lbe;
    step.every[k] = k === 'k' ? t.value : Math.max(k === 'day' ? 0 : 1, Math.round(+t.value) || (k === 'day' ? 0 : 1));
    if (k === 'k' && t.value === 'weeks' && step.every.n < 2) step.every.n = 2;
    if (k === 'k' && t.value === 'months' && step.every.n < 2) step.every.n = 3;
    if (k === 'k' && t.value === 'ndays' && step.every.n < 2) step.every.n = 7;
    if (k === 'k' && t.value === 'hours' && step.every.n < 2) step.every.n = 250;
    save();
    renderLbDetail();
  }
}

async function lbClick(event) {
  const t = event.target;
  const sel = t.closest('[data-lbsel]');
  if (sel) {
    if (!ui.lb.open) ui.lb.listY = window.scrollY;
    ui.lb.sel = sel.dataset.lbsel;
    ui.lb.open = true;
    renderLogbooks();
    if (isPhone()) window.scrollTo({ top: 0, behavior: 'instant' });
    return;
  }
  const book = lbBook();
  if (t.closest('#lbBack')) { navBack(prev => prev.odmView === 'protokoly' && !prev.sub, closeLbDetail); return; }
  if (!book) return;
  const view = t.closest('[data-phview]');
  if (view) { viewPhoto(view.dataset.phview); return; }
  const del = t.closest('[data-phdel]');
  if (del) { removePhoto(del.dataset.phfor, del.dataset.phdel); return; }
  const mode = t.closest('[data-lbmode]');
  if (mode) { ui.lb.mode = mode.dataset.lbmode; renderLbDetail(); return; }
  const open = t.closest('[data-lsopen]');
  if (open) {
    const id = open.dataset.lsopen;
    if (ui.lb.openSteps.has(id)) ui.lb.openSteps.delete(id); else ui.lb.openSteps.add(id);
    renderLbDetail();
    const card = $(`[data-stepcard="${CSS.escape(id)}"]`);
    if (card && !ui.lb.openSteps.has(id)) card.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (t.closest('#lbAddStep')) {
    const step = blankStep();
    ui.lb.openSteps.add(step.id);
    book.steps.push(step);
    save();
    renderLbDetail();
    const input = $(`[data-stepcard="${CSS.escape(step.id)}"] .lb-step-name`);
    if (input) input.focus();
    return;
  }
  if (t.closest('#lbTpl')) {
    book.steps = LB_TEMPLATE.map(([name, k, e, who, stop, how, ok]) => Object.assign(blankStep(), { name, who, stop, how, ok, every: { k, n: 1, dow: 1, day: 1, month: 1, ...e } }));
    save();
    renderLogbooks();
    toast('Vzorové úkony jsou vložené. Uprav je podle návodu ke stroji.');
    return;
  }
  const move = t.closest('[data-lsmove]');
  if (move) {
    const i = book.steps.findIndex(x => x.id === move.dataset.step), j = i + +move.dataset.lsmove;
    if (i < 0 || j < 0 || j >= book.steps.length) return;
    [book.steps[i], book.steps[j]] = [book.steps[j], book.steps[i]];
    save();
    renderLbDetail();
    return;
  }
  const sdel = t.closest('[data-lsdel]');
  if (sdel) {
    const step = book.steps.find(x => x.id === sdel.dataset.lsdel);
    if (!step) return;
    if ((step.name || step.how || step.photos.length) && !(await confirmBox('Odebrat úkon?', `„${step.name || 'bez názvu'}“ zmizí z deníku${step.photos.length ? ' i s fotkami' : ''}. Čísla dalších úkonů se posunou.`, 'Odebrat', true))) return;
    step.photos.forEach(id => Vault.deleteFile(id).catch(() => {}));
    book.steps = book.steps.filter(x => x !== step);
    save();
    renderLogbooks();
    return;
  }
  if (t.closest('#lbCopy')) {
    const copy = Object.assign(blankLogbook(), JSON.parse(JSON.stringify(book)), { id: uid('lb'), name: `${book.name} (kopie)`, inv: '', serial: '', photo: '' });
    copy.steps = book.steps.map(x => Object.assign(JSON.parse(JSON.stringify(x)), { id: uid('u'), photos: [] }));
    S.logbooks.push(copy);
    ui.lb.sel = copy.id;
    save();
    renderLogbooks();
    toast('Kopie je založená, bez fotek a výrobního čísla. Doplň údaje nového stroje.');
    return;
  }
  if (t.closest('#lbDel')) {
    const n = lbFileIds({ logbooks: [book] }).length;
    if (!(await confirmBox('Smazat deník?', `Deník stroje ${lbName(book)} se smaže${n ? ` i s fotkami (${n})` : ''}. Vytištěné archy zůstanou platné.`, 'Smazat', true))) return;
    lbFileIds({ logbooks: [book] }).forEach(id => Vault.deleteFile(id).catch(() => {}));
    S.logbooks = S.logbooks.filter(b => b !== book);
    ui.lb.sel = null;
    ui.lb.open = false;
    save();
    renderLogbooks();
    return;
  }
  if (t.closest('#lbPdf')) exportLogbookPdf(book, t.closest('#lbPdf'));
}

function closeLbDetail() {
  ui.lb.open = false;
  renderLogbooks();
  if (isPhone()) window.scrollTo({ top: ui.lb.listY || 0, behavior: 'instant' });
}

async function addLogbook() {
  const name = await promptBox('Nový provozní deník', 'Název stroje', '', 'Založit', 'např. Lis LP 160');
  if (!name) return;
  const book = Object.assign(blankLogbook(), { name, from: `${new Date().getFullYear()}-01-01` });
  S.logbooks.push(book);
  ui.lb.sel = book.id;
  ui.lb.open = true;
  save();
  if (ui.view !== 'protokoly') showView('protokoly');
  renderLogbooks();
}

function bindLogbooks() {
  const view = $('#view-protokoly');
  $('#lbAdd').onclick = addLogbook;
  $('#lbSearch').addEventListener('input', renderLogbooks);
  view.addEventListener('click', lbClick);
  view.addEventListener('input', lbInput);
  view.addEventListener('change', event => {
    const t = event.target;
    if (t.dataset.phin) { if (t.files.length) addPhotos(t.files, t.dataset.phin); t.value = ''; return; }
    if (t.id === 'lbYear') { ui.lb.year = +t.value; return; }
    if (t.id === 'lbFrom') { ui.lb.from = t.value; return; }
    if (t.id === 'lbTo') { ui.lb.to = t.value; return; }
    if (t.id === 'lbIntro') { ui.lb.intro = t.checked; return; }
    if (t.id === 'lbExtra') { ui.lb.extra = t.checked; return; }
    lbInput(event);
  });
}

/* ---------- PDF: karta stroje, úkony s fotkami, denní archy, opravy, obsluha ---------- */
async function exportLogbookPdf(book, button) {
  const lb = ui.lb;
  const range = lb.mode === 'year' ? lbRange('year', lb.year) : lbRange('custom', 0, lb.from, lb.to);
  if (!range) { toast(lb.mode === 'year' ? 'Vyber rok.' : 'Zadej období od–do (od musí být dřív než do).', true); return; }
  if (range.cut) toast('Období je delší než dva roky, arch končí ' + dayText(range.to) + '.');
  const photos = {};
  if (lb.intro) {
    for (const id of lbFileIds({ logbooks: [book] })) {
      try { photos[id] = await Vault.loadFile(id); } catch (error) { /* chybějící fotka se vynechá */ }
    }
  }
  await withPdf(button, doc => {
    doc.setProperties({ title: `Provozní deník · ${lbName(book)}`, subject: `${dayText(range.from)} – ${dayText(range.to)}`, creator: EXPORT_NAME });
    drawLogbook(doc, book, range, { intro: lb.intro, extra: lb.extra, photos });
    const slug = norm(`${book.inv || ''} ${book.name}`).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'stroj';
    downloadFile(`provozni-denik-${slug}-${range.from}-${range.to}.pdf`, doc.output('blob'), 'application/pdf');
    toast('Provozní deník se stahuje.');
  });
}

function drawLogbook(doc, book, range, opt) {
  const k = pdfKit(doc);
  k.M = 12; k.y = 12; k.CW = k.W - 2 * k.M; k.BOTTOM = k.H - 18; k.PAGE = k.BOTTOM - k.M;
  const C = k.C;
  const title = `${lbName(book)}${book.inv ? ` · ${book.inv}` : ''}`;
  const period = `${dayText(range.from)} – ${dayText(range.to)}`;
  const img = (id, x, top, maxW, maxH) => {
    const bytes = opt.photos[id];
    if (!bytes || k.dry) return 0;
    let p;
    try { p = doc.getImageProperties(bytes); } catch (error) { return 0; }
    const s = Math.min(maxW / p.width, maxH / p.height);
    const w = p.width * s, h = p.height * s;
    doc.addImage(bytes, 'JPEG', x, top, w, h, undefined, 'FAST');
    doc.setDrawColor(...C.line); doc.setLineWidth(0.2); doc.rect(x, top, w, h, 'S');
    return h;
  };
  const imgH = (id, maxW, maxH) => {
    const bytes = opt.photos[id];
    if (!bytes) return 0;
    try { const p = doc.getImageProperties(bytes); return p.height * Math.min(maxW / p.width, maxH / p.height); } catch (error) { return 0; }
  };

  if (opt.intro) {
    /* karta stroje */
    k.header({ eyebrow: 'PROVOZNÍ DENÍK STROJE', right: EXPORT_NAME, title: lbName(book), sub: [book.inv && `Evidenční číslo ${book.inv}`, book.dept].filter(Boolean).join(' · ') || null, meta: `Deník na období ${period}.` });
    const photoW = book.photo && opt.photos[book.photo] ? 62 : 0;
    const top = k.y;
    const rows = [['Výrobce', book.maker], ['Typ / model', book.model], ['Výrobní číslo', book.serial], ['Rok výroby', book.year], ['Oddělení', book.dept], ['Umístění', book.place],
      ['Odpovědná osoba', book.owner], ['Kontakt na údržbu', book.service], ['Návod k používání', book.manual],
      ['Provoz', `${book.weekend ? 'i o víkendu' : 'pracovní dny'} · ${book.shifts === 1 ? 'jeden záznam za den' : book.shifts === 2 ? 'záznam za ranní a odpolední směnu' : 'záznam za každou ze tří směn'}`]].filter(r => r[1]);
    const lw = 36, vw = k.CW - photoW - (photoW ? 6 : 0) - lw;
    rows.forEach(([label, value]) => {
      const lines = k.split(value, vw, 9.5);
      k.text(label, k.M, k.y + 0.3, 8.2, { bold: true, color: C.ink2 });
      lines.forEach((line, i) => k.text(line, k.M + lw, k.y + i * k.LH(9.5), 9.5));
      k.y += Math.max(1, lines.length) * k.LH(9.5) + 2.2;
    });
    if (photoW) k.y = Math.max(k.y, top + img(book.photo, k.M + k.CW - photoW, top, photoW, 70) + 2);
    k.y += 3;
    if (book.safety) {
      const lines = k.split(book.safety, k.CW - 10, 9.5);
      const h = lines.length * k.LH(9.5) + 11;
      k.need(h);
      k.box(C.warnSoft, k.M, k.y, k.CW, h, 2.5);
      k.text('BEZPEČNOST A OOPP', k.M + 5, k.y + 3.5, 7.8, { bold: true, color: C.warn, space: 0.3 });
      lines.forEach((line, i) => k.text(line, k.M + 5, k.y + 8 + i * k.LH(9.5), 9.5));
      k.y += h + 5;
    }
    if (book.note) { k.heading('Poznámka', 11); k.para(book.note, k.M, k.CW, 9.5, { color: C.ink2 }); k.y += 3; }
    const how = [
      'Ve sloupci Doporučeno jsou čísla úkonů, které jsou ten den podle plánu na řadě. Seznam úkonů s postupem a fotkami je na dalších stranách.',
      'Po provedení zakroužkuj „Dle doporučení“. Když se udělalo něco jiného nebo jen část, zakroužkuj „Provedené úkony“ a vypiš jejich čísla.',
      'Zjištěnou závadu a provedené opatření zapiš do sloupce Závady / opatření. Závadu, která ohrožuje bezpečnost, ohlas hned vedoucímu a stroj nespouštěj.',
      'Každý řádek podepiš. Šedé řádky jsou víkendy a svátky; když se v ně pracuje, vyplní se stejně.',
      'Vedoucí jednou měsíčně deník zkontroluje a potvrdí podpisem dole na stránce.',
      'Doporučení je plán podle intervalů. Záznamem je teprve vyplněný a podepsaný řádek.',
    ];
    k.keep(() => {
      k.heading('Jak deník vyplňovat', 11.5);
      how.forEach((line, i) => {
        const lines = k.split(line, k.CW - 8, 9.3);
        k.need(lines.length * k.LH(9.3));
        k.text(`${i + 1}.`, k.M, k.y, 9.3, { bold: true, color: C.acc });
        lines.forEach((l, j) => k.text(l, k.M + 6, k.y + j * k.LH(9.3), 9.3));
        k.y += lines.length * k.LH(9.3) + 1.6;
      });
    }, 30);

    /* úkony s postupem a fotkami */
    k.newPage();
    k.heading('Úkony', 16);
    k.text(`${book.steps.length} ${book.steps.length === 1 ? 'úkon' : book.steps.length <= 4 ? 'úkony' : 'úkonů'} · čísla odpovídají sloupci Doporučeno v archu`, k.M, k.y - 2, 8.8, { color: C.ink2 });
    k.y += 4;
    book.steps.forEach((x, i) => {
      const ph = x.photos.filter(id => opt.photos[id]);
      const pw = ph.length ? (k.CW - 12 - (ph.length - 1) * 4) / Math.max(ph.length, 2) : 0;
      const block = () => {
        const top = k.y;
        k.dot(k.M + 4, top + 3.6, 3.6, C.acc);
        k.mid(String(i + 1), k.M + 4, top + 3.6, 9.5, { bold: true, color: C.white, align: 'center' });
        const nameLines = k.split(x.name || 'Bez názvu', k.CW - 14, 11.5, true);
        nameLines.forEach((l, j) => k.text(l, k.M + 11, top + j * k.LH(11.5), 11.5, { bold: true }));
        k.y = top + nameLines.length * k.LH(11.5) + 1.2;
        let px = k.M + 11;
        px += k.pill(lbEveryText(x.every), px, k.y + 2.4, 'act') + 2;
        px += k.pill(lbWhoName(x.who), px, k.y + 2.4, 'plain') + 2;
        if (x.stop) k.pill('Za klidu stroje', px, k.y + 2.4, 'none');
        k.y += 7;
        if (x.how) { k.text('Postup', k.M + 11, k.y, 7.8, { bold: true, color: C.ink2 }); k.y += 3.6; k.para(x.how, k.M + 11, k.CW - 11, 9.3); k.y += 0.6; }
        if (x.ok) { k.text('V pořádku, když', k.M + 11, k.y, 7.8, { bold: true, color: C.ink2 }); k.y += 3.6; k.para(x.ok, k.M + 11, k.CW - 11, 9.3); k.y += 0.6; }
        if (ph.length) {
          const h = Math.max(...ph.map(id => imgH(id, pw, 48)));
          ph.forEach((id, j) => img(id, k.M + 11 + j * (pw + 4), k.y + 1, pw, 48));
          k.y += h + 3;
        }
        k.y += 2;
        k.hline(k.y, C.line, 0.2);
        k.y += 4;
      };
      k.keep(block, 50);
    });
    const loose = book.steps.map((x, i) => [x, i]).filter(([x]) => x.every.k === 'hours' || x.every.k === 'need');
    if (loose.length) k.para(`Úkony ${loose.map(([, i]) => i + 1).join(', ')} nemají pevný termín (podle motohodin nebo potřeby); v archu se zapisují do „Provedené úkony“, když se udělají.`, k.M, k.CW, 8.8, { color: C.ink2 });
    k.newPage();
  }

  /* denní archy: měsíc na stranu (při více záznamech za den se měsíc rozdělí) */
  const plan = lbPlan(book, range.from, range.to);
  const shifts = book.shifts;
  const cols = [['den', 'Den', 16], ...(shifts > 1 ? [['sh', 'Směna', 9]] : []), ['rec', 'Doporučeno', 20], ['done', 'Provedeno (zakroužkuj)', 56],
    ...(book.counter ? [['cnt', 'Počitadlo', 16]] : []), ['def', 'Závady / opatření', 0], ['who', 'Jméno', 22], ['sig', 'Podpis', 18]];
  const fixed = cols.reduce((x, c) => x + c[2], 0);
  cols.find(c => c[0] === 'def')[2] = k.CW - fixed;
  const rowH = shifts > 1 ? 6.2 : 7.2, headH = 7.5;
  const months = [];
  plan.forEach(d => { const id = d.iso.slice(0, 7); if (!months.length || months[months.length - 1].id !== id) months.push({ id, days: [] }); months[months.length - 1].days.push(d); });
  const pageTop = () => {
    k.text('PROVOZNÍ DENÍK', k.M, k.y, 7.5, { bold: true, color: C.acc, space: 0.35 });
    k.text(EXPORT_NAME, k.M + k.CW, k.y, 7.5, { bold: true, color: C.ink3, align: 'right' });
    k.y += 4.6;
  };
  const tableHead = () => {
    let x = k.M;
    k.box(C.soft3, k.M, k.y, k.CW, headH);
    cols.forEach(([, label, w]) => { k.mid(label, x + 1.6, k.y + headH / 2, 7.2, { bold: true, color: C.ink2 }); x += w; });
    k.y += headH;
  };
  const signoff = () => {
    const y0 = k.BOTTOM - 9;
    k.text('Měsíční kontrola vedoucím', k.M, y0, 7.8, { bold: true, color: C.ink2 });
    [['Datum', 46, 56, 84], ['Jméno', 90, 101, 146], ['Podpis', 152, 163, k.CW]].forEach(([label, lx, from, to]) => {
      k.text(label, k.M + lx, y0, 7.8, { color: C.ink3 });
      k.hline(y0 + 3.6, C.line2, 0.3, k.M + from, k.M + to);
    });
  };
  const optX = 2 + k.width('Dle doporučení', 7.2) + 4.5;
  const perPage = Math.floor((k.BOTTOM - 13 - (k.M + 4.6 + 14 + headH)) / rowH);
  let first = true;
  months.forEach(mo => {
    const [yy, mm] = mo.id.split('-').map(Number);
    const rows = mo.days.flatMap(d => Array.from({ length: shifts }, (_, r) => ({ d, r })));
    for (let start = 0; start < rows.length;) {
      // řádky jednoho dne zůstanou na stejné stránce
      let end = Math.min(rows.length, start + perPage);
      while (end < rows.length && rows[end].r) end -= 1;
      if (!first) k.newPage();
      first = false;
      pageTop();
      k.text(`${MONTH_NAME[mm - 1].replace(/^./, c => c.toUpperCase())} ${yy}${start ? ' (pokračování)' : ''}`, k.M, k.y, 15, { bold: true });
      k.text(title, k.M + k.CW, k.y + 1.5, 9.5, { bold: true, color: C.ink2, align: 'right' });
      k.y += 9;
      tableHead();
      rows.slice(start, end).forEach(({ d, r }) => {
        const off = d.weekend || !!d.hol;
        if (off) k.box(d.hol ? C.wkSoft : C.soft, k.M, k.y, k.CW, rowH);
        const recs = lbRowSteps(d, r);
        let x = k.M;
        const cy = k.y + rowH / 2;
        cols.forEach(([key, , w]) => {
          if (key === 'den' && !r) {
            k.mid(`${DOW_SHORT[d.dow]} ${d.iso.slice(8).replace(/^0/, '')}.`, x + 1.6, d.hol ? cy - 1 : cy, 8.6, { bold: true, color: off ? C.ink3 : C.ink });
            if (d.hol) k.mid(k.split(d.hol, w - 2.4, 5.4)[0], x + 1.6, cy + 1.9, 5.4, { color: C.wk });
          }
          if (key === 'sh') k.mid('ROD'[r], x + w / 2, cy, 8, { bold: true, color: C.ink2, align: 'center' });
          if (key === 'rec') {
            // čísla úkonů vypsaná (1, 2, 4); jen když se nevejdou, zkráceně (1–4, 7)
            const full = recs.join(', '), fit = (t, sz) => k.width(t, sz, true) <= w - 3;
            const [txt, size] = fit(full, 8.6) ? [full, 8.6] : fit(full, 7) ? [full, 7] : [lbRangeText(recs), 7];
            if (recs.length) k.mid(k.split(txt, w - 2.4, size, true)[0], x + 1.6, cy, size, { bold: true, color: C.acc });
            else k.mid(off && !d.work ? (d.hol ? 'svátek' : 'víkend') : '—', x + 1.6, cy, 7.2, { color: C.ink3 });
          }
          if (key === 'done') {
            k.mid('Dle doporučení', x + 2, cy, 7.2, { color: C.ink2 });
            k.mid('Provedené úkony:', x + optX, cy, 7.2, { color: C.ink2 });
          }
          x += w;
          if (!k.dry) { doc.setDrawColor(...C.line); doc.setLineWidth(0.15); doc.line(x, k.y, x, k.y + rowH); }
        });
        k.hline(k.y + rowH, r < shifts - 1 ? C.line : C.line2, r < shifts - 1 ? 0.12 : 0.25);
        k.y += rowH;
      });
      if (!k.dry) { doc.setDrawColor(...C.line2); doc.setLineWidth(0.25); doc.rect(k.M, k.y - (end - start) * rowH - headH, k.CW, (end - start) * rowH + headH, 'S'); }
      signoff();
      start = end;
    }
  });

  /* záznam oprav a mimořádných událostí, zaškolená obsluha */
  if (opt.extra) {
    const blankTable = (heading, note, heads, n) => {
      k.newPage();
      pageTop();
      k.text(heading, k.M, k.y, 15, { bold: true });
      k.text(title, k.M + k.CW, k.y + 1.5, 9.5, { bold: true, color: C.ink2, align: 'right' });
      k.y += 8;
      k.para(note, k.M, k.CW, 8.8, { color: C.ink2 });
      k.y += 2;
      const total = heads.reduce((x, h) => x + h[1], 0);
      const ws = heads.map(h => h[1] / total * k.CW);
      let x = k.M;
      k.box(C.soft3, k.M, k.y, k.CW, headH);
      heads.forEach(([label], i) => { k.mid(label, x + 1.6, k.y + headH / 2, 7.2, { bold: true, color: C.ink2 }); x += ws[i]; });
      k.y += headH;
      const top = k.y - headH;
      for (let i = 0; i < n && k.y + 9 <= k.BOTTOM - 2; i += 1) {
        x = k.M;
        ws.forEach(w => { x += w; if (!k.dry) { doc.setDrawColor(...C.line); doc.setLineWidth(0.15); doc.line(x, k.y, x, k.y + 9); } });
        k.hline(k.y + 9, C.line, 0.2);
        k.y += 9;
      }
      if (!k.dry) { doc.setDrawColor(...C.line2); doc.setLineWidth(0.25); doc.rect(k.M, top, k.CW, k.y - top, 'S'); }
    };
    blankTable('Opravy a mimořádné události', 'Poruchy, opravy, výměny dílů, servisní zásahy a úrazy nebo skoronehody u stroje.',
      [['Datum', 18], ['Popis závady nebo události', 70], ['Provedené opatření / oprava', 60], ['Provedl', 26], ['Podpis', 20]], 26);
    blankTable('Zaškolená obsluha', 'Kdo je seznámen s návodem k používání a bezpečnou obsluhou stroje a smí ho obsluhovat.',
      [['Jméno a příjmení', 52], ['Datum zaškolení', 26], ['Zaškolil', 44], ['Podpis obsluhy', 34], ['Podpis školitele', 34]], 26);
  }
  k.footer(`${EXPORT_NAME} · Provozní deník · ${title} · ${period}`);
}

