/* ==========================================================================
   NASTAVENÍ
   ========================================================================== */
function renderSettings() {
  const s = S.settings;
  const p = curPeriod();
  $('#setScore').innerHTML = `<h3>${I.tab}Tabáky a ${I.kafe}Kafe</h3>
    <p class="eyebrow">Kafe</p>
    <p class="small muted">Stejné pro všechny skupiny. Kafe dostane, kdo odpracuje (včetně víkendů) aspoň práh hodin. Výchozí práh je fond: pracovní dny × délka směny.</p>
    ${p ? `<label class="field"><span>Práh pro ${esc(periodName(p))} (hodin)</span><input type="number" id="sKafe" value="${n2(kafeThreshold(p))}" min="0" step="0.5"></label>
      <p class="small muted">Fond je ${nf(periodMeta(p).fund)} h. ${kafeIsCustom(p) ? '<button class="link" type="button" id="sKafeReset">Vrátit na fond</button>' : 'Teď se používá fond.'}</p>` : '<p class="small muted">Práh jde nastavit, až bude nahraná docházka.</p>'}
    <hr class="sep"><p class="eyebrow">Ztráta nároku</p>
    <label class="field"><span>Bez nároku od dní absence</span><input type="number" id="sCut" value="${cutoffDays() || ''}" min="1" max="31" step="1" placeholder="vypnuto"></label>
    <p class="small muted">Kdo má po vyplnění víkendy tolik a víc dní absence, nedostane nic: ani tabák, ani kafe, nepomůže ani ruční úprava. Prázdné = vypnuto. Dovolená a nemoc se počítají jako chybějící dny, pokud není zapnuté „Omluvená absence snižuje fond“.</p>
    <hr class="sep"><p class="eyebrow">Tabáky</p>
    <p class="small muted">Dovednosti ± docházka, nejvýš do stropu skupiny = nárok. Z nároku se strhnou sankce v % (zaokrouhleno na celé tabáky, aspoň 1 za každou sankci). Nakonec ruční úprava.</p>
    <div class="form-grid">
      <label class="field"><span>Krok ruční úpravy</span><input type="number" id="sStep" value="${s.adjStep}" min="1" max="5" step="1"></label>
      <label class="field"><span>Ruční úprava smí přes maximum o</span><input type="number" id="sOver" value="${+s.adjOver || 0}" min="0" max="10" step="1"></label>
    </div>
    <p class="small muted">Tlačítkem + v přehledu jde jít nad maximum skupiny nejvýš o tolik tabáků. Bonus za víkendy strop nikdy nepřekročí a výsledek neklesne pod nulu.</p>`;

  $('#setAtt').innerHTML = `<h3>Pravidla docházky</h3>
    <div class="form-grid">
      <label class="field"><span>Délka směny (hodin)</span><input type="number" id="sShift" value="${s.shift}" min="1" max="24" step="0.5"></label>
      <label class="field"><span>Zkrácený pátek, odpolední (hodin)</span><input type="number" id="sFri" value="${friShift()}" min="1" max="24" step="0.5"></label>
    </div>
    <p class="small muted">Podle směny se počítá fond (dny × směna) a jestli je den odpracovaný celý. Zkrácený pátek platí sám pro odpolední směnu v pátek (podle příchodu, jinak podle směny člověka a střídání skupin): ${nf(friShift())} h se počítá jako celá směna a o rozdíl se sníží fond i práh Kafe.</p>
    <label class="field"><span>Kódy omluvené absence</span><input type="text" id="sExc" value="${esc(s.excused)}" maxlength="300"></label>
    <p class="small muted">Text v buňce místo hodin (dovolená, nemoc…), oddělený čárkou. Na diakritice nezáleží: OČR i OCR znamená totéž.</p>
    <label class="switch"><input type="checkbox" id="sRed"${s.excusedReducesFund ? ' checked' : ''}><span>Omluvená absence snižuje fond hodin</span></label>
    <p class="small muted">Zapnuto: dovolená ani nemoc nezpůsobí srážku tabáků. Vypnuto: počítá se celý měsíční fond a dovolená se bere jako chybějící den.</p>
    <hr class="sep"><p class="small muted">Svátky ČR (včetně pohyblivých velikonočních) se počítají automaticky a do fondu se nezahrnují. Práce ve svátek se počítá jako víkendová směna.</p>`;

  renderSecurity();

  const people = Object.values(S.employees);
  const withId = people.filter(e => e.wid).length;
  $('#setIds').innerHTML = `<h3>ID pro evidenci práce</h3>
    <p class="small muted">Když evidence práce místo jmen obsahuje ID zaměstnance, nahraj tu seznam, kdo má jaké ID: tabulku se jménem (Příjmení a Jméno, nebo Jméno a příjmení v jednom sloupci) a sloupcem ID. Nejsnáz: stáhni seznam lidí, doplň ID a nahraj ho zpátky. ID jde zadat i u člověka v části Lidé.</p>
    <p class="small"><b>${withId}</b> z ${people.length} lidí má ID.</p>
    <div class="row gap"><button class="btn sec small" type="button" id="idDown">Stáhnout seznam lidí</button><button class="btn small" type="button" id="idUp">Nahrát seznam ID</button></div>
    <input type="file" id="idFile" accept=".xlsx,.xls,.csv,.txt" hidden>
    <div id="idMsg" class="mt-s">${ui.idMsg || ''}</div>`;
  $('#idDown').onclick = exportWids;
  $('#idUp').onclick = () => $('#idFile').click();
  $('#idFile').onchange = event => { const file = event.target.files[0]; event.target.value = ''; if (file) readWids(file); };

  $('#setData').innerHTML = `<h3>Data a zálohy</h3>
    <p class="small muted">Data se ukládají na server zašifrovaná klíčem, který mají jen přístupové kartičky. Server drží posledních 30 uložení, k tomu stav z každé hodiny za poslední týden a z každého dne před tím.</p>
    <div class="action-list">
      <button class="action" type="button" id="dBackup"><b>Stáhnout šifrovanou zálohu</b><small>Soubor .odmeny otevře kterákoli platná kartička, i na novém serveru.</small></button>
      <button class="action" type="button" id="dRestore"><b>Obnovit ze zálohy</b><small>Nahradí současná data obsahem zálohy.</small></button>
      <input type="file" id="dRestoreFile" accept=".odmeny,application/json" hidden>
      <button class="action" type="button" id="dVersions"><b>Historie verzí</b><small>Vrátit data do stavu z dřívějška.</small></button>
      <button class="action" type="button" id="dRoster"><b>Export zařazení (Excel)</b><small>Skupiny, směny, hodnocení dovedností a pravidla všech lidí.</small></button>
      <button class="action" type="button" id="dImp"><b>Načíst data z původní aplikace</b><small>Záloha JSON z hodnoceni-operatoru.html.</small></button>
      <input type="file" id="dFile" accept=".json,application/json" hidden>
    </div>
    <hr class="sep"><button class="btn danger" type="button" id="dReset">Vymazat všechna data</button>`;

  const bindNum = (id, fn) => { const el = $(`#${id}`); if (el) el.onchange = () => { fn(el); save(); renderAll(); }; };
  bindNum('sShift', el => { S.settings.shift = clamp(+String(el.value).replace(',', '.') || 7.5, 1, 24); });
  bindNum('sFri', el => { S.settings.friShift = clamp(+String(el.value).replace(',', '.') || 6.5, 1, 24); });
  bindNum('sStep', el => { S.settings.adjStep = clamp(Math.round(+el.value || 1), 1, 5); });
  bindNum('sOver', el => { S.settings.adjOver = clamp(Math.round(+el.value || 0), 0, 10); });
  bindNum('sKafe', el => { setKafe(el.value); });
  bindNum('sCut', el => { const v = String(el.value).trim(); S.settings.absenceCutoff = (v === '' || !(+v > 0)) ? null : clamp(Math.round(+v), 1, 31); });
  if ($('#sKafeReset')) $('#sKafeReset').onclick = () => { setKafe(''); save(); renderAll(); };
  $('#sExc').onchange = event => { S.settings.excused = event.target.value.slice(0, 300); save(); renderAll(); };
  $('#sRed').onchange = event => { S.settings.excusedReducesFund = event.target.checked; save(); renderAll(); };
  $('#dBackup').onclick = downloadBackup;
  $('#dRestore').onclick = () => $('#dRestoreFile').click();
  $('#dRestoreFile').onchange = event => { const file = event.target.files[0]; event.target.value = ''; if (file) restoreBackup(file); };
  $('#dVersions').onclick = showVersions;
  $('#dRoster').onclick = exportRoster;
  $('#dImp').onclick = () => $('#dFile').click();
  $('#dFile').onchange = event => { const file = event.target.files[0]; event.target.value = ''; if (file) importLegacy(file); };
  $('#dReset').onclick = async () => {
    const result = await dialog({ title: 'Vymazat všechna data?', danger: true, ok: 'Vymazat',
      html: '<p>Smažou se skupiny, lidé, docházka, výroba, sankce i výdeje. Dosavadní stav zůstane v historii verzí, odkud ho jde vrátit.</p><label class="field"><span>Pro potvrzení napiš SMAZAT</span><input name="confirm" autocomplete="off" required autofocus></label>',
      validate: form => (form.elements.confirm.value.trim().toUpperCase() === 'SMAZAT' ? null : 'Napiš SMAZAT velkými písmeny.') });
    if (result.value !== 'ok') return;
    const keepLog = S.log;
    S = blank(); S.log = keepLog; setPeriod(null);
    store.note = { kind: 'data', text: 'Vymazána všechna data (předchozí stav je v historii verzí)' };
    save(); ui.selPerson = null; renderAll(); toast('Vymazáno.');
  };
}

/* Vzhled aplikace (2.47): sklo nebo původní, jen pro toto zařízení (static/look.js).
   Na tisk ani PDF nemá vliv. */

const secCache = { cards: null, devices: null };

function renderSecurity() {
  const device = Vault.readDevice();
  const lock = P.lockMinutes || 15;
  const spinner = '<div class="spinner small"></div>';
  $('#setSecurity').innerHTML = `<h3>${I.shield}Zabezpečení</h3>
    <p class="small muted">Do aplikace se dostane jen ten, kdo má přístupovou kartičku, nebo zapamatované zařízení s PINem. Každá kartička otevře stejná data.</p>
    <div class="sec-block"><div class="sec-head"><p class="eyebrow">Přístupové kartičky</p><button class="btn sec small" type="button" id="secNewCard">Nová kartička</button></div><div id="secCards" class="sec-list">${secCache.cards ?? spinner}</div></div>
    <div class="sec-block"><div class="sec-head"><p class="eyebrow">Zapamatovaná zařízení</p>${device ? '<button class="btn sec small" type="button" id="secRepin">Změnit PIN</button>' : '<button class="btn sec small" type="button" id="secEnroll">Zapamatovat toto zařízení</button>'}</div><div id="secDevices" class="sec-list">${secCache.devices ?? spinner}</div></div>
    <div class="form-grid">
      <label class="field"><span>Zamknout po nečinnosti (jen tvoje kartička)</span><select id="secLock">${[5, 10, 15, 30, 60].map(m => `<option value="${m}"${m === lock ? ' selected' : ''}>${m} minut</option>`).join('')}</select></label>
      <div class="field"><span>&nbsp;</span><button class="btn sec" type="button" id="secLockNow">Zamknout teď</button></div>
    </div>
    <p class="tiny muted">Přihlášen${ui.me.label ? ` kartičkou <b>${esc(ui.me.label)}</b>` : ''}${ui.me.device ? ` na zařízení ${esc(ui.me.device)}` : ''}. Filtry, vybrané období, řazení a skryté sloupce si aplikace pamatuje zvlášť pro každou kartičku. Verze aplikace ${esc(ui.me.version || '')}.</p>`;
  $('#secLock').onchange = event => { setPref({ lockMinutes: +event.target.value }); toast(`Aplikace se zamkne po ${P.lockMinutes} minutách nečinnosti.`); };
  $('#secLockNow').onclick = () => lockApp();
  $('#secNewCard').onclick = newCard;
  if ($('#secEnroll')) $('#secEnroll').onclick = () => enrollThisDevice(false);
  if ($('#secRepin')) $('#secRepin').onclick = () => enrollThisDevice(true);
  if (secCache.cards === null && ui.view === 'nastaveni') loadSecurityLists();
}

function relTime(iso) {
  if (!iso) return 'nikdy';
  return new Date(iso).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Kartičky a zařízení ze serveru; načítají se při otevření Nastavení a po každé změně. */
async function loadSecurityLists() {
  try {
    const [cards, devices] = await Promise.all([Vault.api('cards'), Vault.api('devices')]);
    secCache.cards = cards.items.map(card => `<div class="sec-item"><div><b>${esc(card.label)}</b>${card.current ? ' <span class="tag acc">tato relace</span>' : ''}<small>vytvořena ${esc(relTime(card.created_at))} · naposledy ${esc(relTime(card.last_used_at))}</small></div>
      ${cards.items.length > 1 ? `<button class="btn danger small" type="button" data-revoke-card="${esc(card.id)}" data-label="${esc(card.label)}">Zrušit</button>` : '<span class="tiny muted">jediná</span>'}</div>`).join('');
    secCache.devices = devices.items.length ? devices.items.map(device => `<div class="sec-item"><div><b>${esc(device.label)}</b>${device.current ? ' <span class="tag acc">toto zařízení</span>' : ''}<small>přes kartičku ${esc(device.card_label)} · naposledy ${esc(relTime(device.last_used_at))}</small></div>
      <button class="btn danger small" type="button" data-revoke-device="${esc(device.id)}" data-label="${esc(device.label)}">Odebrat</button></div>`).join('') : '<p class="small muted">Žádné zařízení si PIN nepamatuje.</p>';
  } catch (error) {
    secCache.cards = `<div class="note e">${esc(error.message)}</div>`;
    secCache.devices = '';
  }
  if ($('#secCards')) $('#secCards').innerHTML = secCache.cards;
  if ($('#secDevices')) $('#secDevices').innerHTML = secCache.devices;
}

async function handleSecurityClick(event) {
  const card = event.target.closest('[data-revoke-card]');
  const device = event.target.closest('[data-revoke-device]');
  if (card) {
    if (!(await confirmBox('Zrušit kartičku?', `Kartička „${card.dataset.label}“ přestane platit a odeberou se i zařízení, která se přes ni zapamatovala. Použij to hlavně při ztrátě kartičky.`, 'Zrušit kartičku', true))) return;
    try {
      const result = await Vault.api('card', { method: 'DELETE', query: { id: card.dataset.revokeCard } });
      if (result.ended) { toast('Kartička, přes kterou jsi přihlášený, je zrušená. Aplikace se zamkne.'); setTimeout(() => lockApp(true), 1500); return; }
      toast('Kartička je zrušená.');
      loadSecurityLists();
    } catch (error) { toast(error.message, true); }
  } else if (device) {
    if (!(await confirmBox('Odebrat zařízení?', `„${device.dataset.label}“ se příště bude muset přihlásit kartičkou.`, 'Odebrat', true))) return;
    try {
      const result = await Vault.api('device', { method: 'DELETE', query: { id: device.dataset.revokeDevice } });
      const own = Vault.readDevice();
      if (own && own.id === device.dataset.revokeDevice) Vault.forgetDevice();
      if (result.ended) { toast('Toto zařízení je odebrané. Aplikace se zamkne.'); setTimeout(() => lockApp(true), 1500); return; }
      toast('Zařízení je odebrané.');
      renderSecurity();
      loadSecurityLists();
    } catch (error) { toast(error.message, true); }
  }
}

async function newCard() {
  const label = await promptBox('Nová přístupová kartička', 'Pro koho kartička je', '', 'Vytvořit', 'třeba Mistr – noční směna');
  if (!label) return;
  let card;
  try { card = await Vault.createCard(label.slice(0, 40)); } catch (error) { toast(error.message, true); return; }
  await dialog({
    title: 'Kartička je vytvořená', wide: true, ok: 'Hotovo', cancel: '',
    html: `<p class="small muted">Vytiskni ji nebo ulož obrázek. Klíč se ukazuje jen teď a nikde se neuchovává.</p><div class="card-preview">${OdmCard.html(card.key, card.label)}</div>
      <div class="row gap"><button class="btn sec" type="button" id="cPrint">Vytisknout</button><button class="btn sec" type="button" id="cPng">Stáhnout obrázek</button></div>`,
    onOpen: () => {
      $('#cPrint').onclick = () => OdmCard.print(card.key, card.label);
      $('#cPng').onclick = () => OdmCard.download(card.key, card.label).catch(error => toast(error.message, true));
    },
  });
  loadSecurityLists();
}

async function askPin(title, text) {
  let pin = null;
  const result = await dialog({
    title, ok: '', cancel: 'Zrušit',
    html: `<p class="small muted">${esc(text)}</p><div id="pinMsg"></div>${OdmLock.pinPadHtml()}`,
    onOpen: dlg => {
      OdmLock.pinPad($('.pin-block', dlg), value => {
        if (OdmLock.weakPin(value)) { $('#pinMsg').innerHTML = '<div class="note w">Tenhle PIN je moc snadný. Zvol jiný.</div>'; return false; }
        pin = value; dlg.close('ok'); return true;
      });
    },
  });
  return result.value === 'ok' ? pin : null;
}

async function enrollThisDevice(replace) {
  const first = await askPin('Zvol PIN', 'Šest číslic, kterými toto zařízení příště odemkneš.');
  if (!first) return;
  const second = await askPin('Zopakuj PIN', 'Pro kontrolu ho zadej ještě jednou.');
  if (!second) return;
  if (first !== second) { toast('PINy se neshodují, zkus to znovu.', true); return; }
  try {
    const old = Vault.readDevice();
    await Vault.enrollDevice(first);
    if (replace && old) await Vault.api('device', { method: 'DELETE', query: { id: old.id } }).catch(() => {});
    toast(replace ? 'PIN je změněný.' : 'Zařízení je zapamatované. Příště stačí PIN.');
  } catch (error) { toast(error.message, true); }
  renderSecurity();
  loadSecurityLists();
}

function downloadFile(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
}

async function downloadBackup() {
  try {
    await flushSave();
    const file = await Vault.backup(S, [...lbFileIds(S), ...waPlanFileIds(S), ...svFileIds(S)]);
    downloadFile(`hala2-zaloha-${new Date().toISOString().slice(0, 10)}.odmeny`, JSON.stringify(file), 'application/json');
    toast('Záloha stažená. Je šifrovaná, otevře ji jen platná kartička.');
  } catch (error) { toast(error.message, true); }
}

async function askKeyForBackup() {
  let key = null;
  const result = await dialog({
    title: 'Kartička k záloze', ok: 'Otevřít zálohu',
    html: `<p class="small muted">Záloha je z jiné instalace. Opiš nebo vyfoť kartičku, která k ní patří.</p>
      <label class="field"><span>Přístupový klíč</span><input class="key-input" name="key" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-…" autofocus></label>
      <label class="btn sec small" for="keyPhoto">Načíst z fotky kartičky</label><input type="file" id="keyPhoto" accept="image/*" capture="environment" hidden>`,
    onOpen: dlg => {
      $('#keyPhoto', dlg).onchange = async event => {
        const file = event.target.files[0];
        if (!file) return;
        try { dlg.querySelector('[name="key"]').value = Vault.formatKey(await OdmLock.keyFromPhoto(file)); } catch (error) { toast(error.message, true); }
      };
    },
  });
  if (result.value === 'ok') key = result.form.elements.key.value;
  return key;
}

/** Nahradí data (záloha, starší verze, původní aplikace). Historie změn pokračuje dál, jeden záznam o obnovení. */
async function replaceState(next, message, note) {
  const keepLog = S.log;
  S = sanitizeState(next);
  S.log = keepLog;
  applyPeriodPref();
  store.note = { kind: 'data', text: note || message };
  ui.selPerson = null; ui.selPos = null; ui.openDetail = null; ui.profileKey = null;
  if (ui.view === 'profil') showView('lide');
  save();
  renderAll();
  toast(message);
}

async function restoreBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (error) { toast('Soubor zálohy nejde přečíst.', true); return; }
  let opened;
  try {
    opened = await Vault.openBackup(data);
  } catch (error) {
    if (!error.needsKey) { toast(error.message, true); return; }
    const key = await askKeyForBackup();
    if (!key) return;
    try { opened = await Vault.openBackup(data, key); } catch (inner) { toast(inner.message, true); return; }
  }
  const when = data.created_at ? new Date(data.created_at).toLocaleString('cs-CZ') : 'neznámé datum';
  if (!(await confirmBox('Obnovit ze zálohy?', `Současná data se nahradí zálohou z ${when}. Dosavadní stav zůstane v historii verzí.`, 'Obnovit'))) return;
  replaceState(opened.state, 'Data jsou obnovená ze zálohy.', `Obnoveno ze zálohy z ${when}`);
  if (data.files && typeof data.files === 'object') {
    const n = await Vault.restoreFiles(data.files, opened.dek);
    if (n) toast(`Data i fotky (${n}) jsou obnovené ze zálohy.`);
    photoCache.clear();
  }
}

async function showVersions() {
  let items;
  try { items = (await Vault.api('versions')).items; } catch (error) { toast(error.message, true); return; }
  let chosen = null;
  await dialog({
    title: 'Historie verzí', wide: true, ok: '', cancel: 'Zavřít',
    html: items.length ? `<p class="small muted">Každé uložení vytvoří verzi. Obnovení vrátí data do vybraného stavu a uloží je jako novou verzi.</p><div class="version-list">${items.map((item, index) => `<div class="version"><div><b>${esc(new Date(item.created_at).toLocaleString('cs-CZ'))}</b><small>${esc(item.by || '')} · ${Math.max(1, Math.round(item.size / 1024))} kB${index === 0 ? ' · aktuální' : ''}</small></div>${index === 0 ? '' : `<button class="btn sec small" type="button" data-rev="${item.rev}">Obnovit</button>`}</div>`).join('')}</div>` : '<p>Zatím žádné verze.</p>',
    onOpen: dlg => { $$('[data-rev]', dlg).forEach(button => { button.onclick = () => { chosen = +button.dataset.rev; dlg.close('ok'); }; }); },
  });
  if (!chosen) return;
  try {
    const state = await Vault.loadVersion(chosen);
    const item = items.find(x => x.rev === chosen);
    replaceState(state, 'Data jsou vrácená do vybrané verze.', `Data vrácena do verze z ${item ? new Date(item.created_at).toLocaleString('cs-CZ') : 'historie'}`);
  } catch (error) { toast(error.message, true); }
}

async function importLegacy(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (error) { toast('Soubor nejde přečíst.', true); return; }
  if (!data || typeof data !== 'object' || !data.positions || !data.employees) { toast('Tohle není záloha původní aplikace (chybí pozice a lidé).', true); return; }
  if (!(await confirmBox('Načíst data z původní aplikace?', 'Současná data se nahradí obsahem souboru. Dosavadní stav zůstane v historii verzí.', 'Načíst'))) return;
  replaceState(data, 'Data z původní aplikace jsou načtená a zašifrovaná.', `Načtena data z původní aplikace (${file.name})`);
}

