'use strict';

/*
 * Odměny – zamykací obrazovka.
 *   První spuštění: kód z instalace → vytvoření QR kartičky → (PIN pro zařízení).
 *   Přihlášení: naskenovat kartičku kamerou, z fotky, nebo opsat klíč.
 *   Zapamatované zařízení: PIN (6 číslic); po pěti chybách ho server zapomene.
 * Aplikace se stáhne až po odemčení a data dešifruje jen tento prohlížeč.
 */
(function lockScreen() {
  const V = window.OdmVault;
  const $ = (selector, root = document) => root.querySelector(selector);
  const body = () => $('#lockBody');
  const PIN_LENGTH = 6;
  const ICON_SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v5.5c0 4.2 2.9 8 7 9.5 4.1-1.5 7-5.3 7-9.5V6z"/><path d="m9 12 2 2 4-4"/></svg>';
  const ICON_CAMERA = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
  const ICON_IMAGE = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-5-5-8 8.5"/></svg>';
  const ICON_KEY = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="14" r="4"/><path d="m11 11 8.5-8.5M16 6l2.5 2.5M14 8l2 2"/></svg>';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  function toast(message, error = false) {
    const element = $('#toast');
    element.textContent = message;
    element.className = `toast on${error ? ' err' : ''}`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { element.className = 'toast'; }, error ? 5200 : 3000);
  }
  window.odmToast = toast;

  function show(html, wide = false) {
    stopScanner();
    $('#lockCard').classList.toggle('wide', wide);
    body().innerHTML = html;
    const focus = $('[autofocus]', body());
    if (focus) focus.focus();
  }

  function message(text, kind = 'e') {
    const box = $('#lockMsg');
    if (box) box.innerHTML = text ? `<div class="note ${kind}">${esc(text)}</div>` : '';
  }

  const safeLine = `<p class="lock-safe">${ICON_SHIELD}<span>Data jsou šifrovaná přímo v tomto prohlížeči. Server ukládá jen zašifrovaný obsah a bez kartičky ho nikdo nepřečte, ani správce serveru.</span></p>`;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Nepodařilo se načíst ${src}`));
      document.head.append(script);
    });
  }

  /* ------------------------------------------------------------ QR kartička */

  function qrSvg(text) {
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    let path = '';
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) path += `M${col + 2} ${row + 2}h1v1h-1z`;
      }
    }
    const size = count + 4;
    return `<svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR kód přístupového klíče"><path fill="#0b1f1b" d="${path}"/></svg>`;
  }

  function cardHtml(key, label) {
    const groups = V.formatKey(key).split('-');
    return `<div class="card-wrap"><div class="odm-card">
      <div class="qr">${qrSvg(V.qrText(key))}</div>
      <div class="card-text">
        <span class="card-brand">Odměny</span>
        <span class="card-label">${esc(label || 'Přístupová kartička')}</span>
        <span class="card-key"><span>${esc(groups.slice(0, 4).join('-'))}-</span><span>${esc(groups.slice(4).join('-'))}</span></span>
        <span class="card-warn">Nesdílej. Kdo má kartičku, otevře data.</span>
      </div>
    </div></div>`;
  }

  function printCard(key, label) {
    const holder = $('#printCard');
    holder.innerHTML = `${cardHtml(key, label)}<p class="print-note">Přístupová kartička aplikace Odměny. Ulož ji na bezpečné místo, třeba do peněženky nebo trezoru. Při ztrátě ji v aplikaci zruš (Nastavení → Zabezpečení).</p>`;
    document.body.classList.add('print-card');
    const done = () => { document.body.classList.remove('print-card'); holder.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 60000);
  }

  /** Kartička jako obrázek PNG (1012 × 638 px = 85,6 × 54 mm při 300 dpi). */
  async function downloadCard(key, label) {
    await document.fonts?.ready;
    const canvas = document.createElement('canvas');
    canvas.width = 1012;
    canvas.height = 638;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 1012, 638);
    gradient.addColorStop(0, '#0f6f60');
    gradient.addColorStop(.7, '#0a4d43');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(0, 0, 1012, 638, 44);
    ctx.fill();
    const qr = window.qrcode(0, 'M');
    qr.addData(V.qrText(key));
    qr.make();
    const count = qr.getModuleCount();
    const box = 330;
    const cell = Math.floor((box - 40) / count);
    const size = cell * count;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(60, 154, box, box, 26);
    ctx.fill();
    ctx.fillStyle = '#0b1f1b';
    const offset = 60 + (box - size) / 2;
    const top = 154 + (box - size) / 2;
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) ctx.fillRect(offset + col * cell, top + row * cell, cell, cell);
      }
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 58px "Barlow SC", sans-serif';
    ctx.fillText('ODMĚNY', 440, 210);
    ctx.globalAlpha = .85;
    ctx.font = '500 32px "Plex", sans-serif';
    ctx.fillText(String(label || 'Přístupová kartička').slice(0, 30), 440, 262);
    ctx.globalAlpha = 1;
    ctx.font = '500 34px "Plex Mono", monospace';
    const groups = V.formatKey(key).split('-');
    ctx.fillText(groups.slice(0, 4).join('-'), 440, 360);
    ctx.fillText(groups.slice(4).join('-'), 440, 408);
    ctx.globalAlpha = .75;
    ctx.font = '400 24px "Plex", sans-serif';
    ctx.fillText('Nesdílej. Kdo má kartičku, otevře data.', 440, 470);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `odmeny-karticka-${String(label || 'klic').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  }

  window.OdmCard = { html: cardHtml, print: printCard, download: downloadCard };

  /* ------------------------------------------------------------ skener */

  let scanner = null;

  function stopScanner() {
    if (!scanner) return;
    scanner.active = false;
    scanner.stream?.getTracks().forEach(track => track.stop());
    scanner = null;
  }

  function extractKey(text) {
    const value = String(text || '').trim();
    return /^ODMENY:/i.test(value) || /^[0-9A-Za-z-]{32,40}$/.test(value) ? value : null;
  }

  async function decodeImageData(imageData) {
    if (!window.jsQR) await loadScript('static/vendor/jsQR.js');
    const code = window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
    return code ? extractKey(code.data) : null;
  }

  async function startScanner(video, onKey) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Tento prohlížeč neumí použít kameru. Nahraj fotku kartičky nebo opiš klíč.');
    if (!window.jsQR) await loadScript('static/vendor/jsQR.js');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
    scanner = { stream, active: true };
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    await video.play();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const current = scanner;
    const tick = async () => {
      if (!current.active) return;
      if (video.readyState >= 2 && video.videoWidth) {
        const scale = Math.min(1, 720 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const key = await decodeImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
        if (key && current.active) {
          stopScanner();
          if (navigator.vibrate) navigator.vibrate(60);
          onKey(key);
          return;
        }
      }
      setTimeout(tick, 140);
    };
    tick();
  }

  async function keyFromPhoto(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const key = await decodeImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (!key) throw new Error('Na fotce jsem QR kód kartičky nenašel. Vyfoť ho zblízka a ostře, nebo opiš klíč.');
    return key;
  }

  /* ------------------------------------------------------------ PIN */

  function weakPin(pin) {
    return /^(\d)\1+$/.test(pin) || '0123456789012345678909876543210'.includes(pin);
  }

  /** Číselník s tečkami. onComplete dostane PIN; vrátí false, když se má číselník vyčistit. */
  function pinPad(root, onComplete) {
    let value = '';
    const dots = $('.pin-dots', root);
    const render = () => { [...dots.children].forEach((dot, index) => dot.classList.toggle('on', index < value.length)); };
    const press = async digit => {
      if (value.length >= PIN_LENGTH) return;
      value += digit;
      render();
      if (value.length === PIN_LENGTH) {
        const pin = value;
        root.classList.add('busy');
        const keep = await onComplete(pin);
        root.classList.remove('busy');
        if (keep === false) {
          value = '';
          dots.classList.remove('shake');
          void dots.offsetWidth;
          dots.classList.add('shake');
          render();
        }
      }
    };
    root.addEventListener('click', event => {
      const button = event.target.closest('button[data-digit], button[data-back]');
      if (!button || root.classList.contains('busy')) return;
      if (button.dataset.back !== undefined) { value = value.slice(0, -1); render(); return; }
      press(button.dataset.digit);
    });
    const onKey = event => {
      if (!document.body.contains(root)) { document.removeEventListener('keydown', onKey); return; }
      if (root.classList.contains('busy')) return;
      if (/^\d$/.test(event.key)) press(event.key);
      if (event.key === 'Backspace') { value = value.slice(0, -1); render(); }
    };
    document.addEventListener('keydown', onKey);
  }

  const pinPadHtml = () => `<div class="pin-block">
      <div class="pin-dots" aria-hidden="true">${'<i></i>'.repeat(PIN_LENGTH)}</div>
      <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit => `<button type="button" data-digit="${digit}" aria-label="${digit}">${digit}</button>`).join('')}<span></span><button type="button" data-digit="0" aria-label="0">0</button><button type="button" class="fn" data-back aria-label="Smazat číslici">Smazat</button></div>
    </div>`;

  /* ------------------------------------------------------------ obrazovky */

  function screenUnlock() {
    const device = V.readDevice();
    show(`<h1>Odemknout</h1><p class="lede">Zadej PIN tohoto zařízení${device?.label ? ` (${esc(device.label)})` : ''}.</p>
      <div id="lockMsg" class="lock-msg"></div>
      ${pinPadHtml()}
      <div class="lock-foot"><button type="button" id="useCard">Přihlásit kartičkou</button><button type="button" id="forget">Zapomenout toto zařízení</button></div>
      ${safeLine}`);
    pinPad($('.pin-block'), async pin => {
      message('');
      try {
        await V.unlockWithPin(pin);
        await openApp();
        return true;
      } catch (error) {
        if (error.data?.forget) {
          toast(error.message, true);
          screenCardLogin(error.message);
          return true;
        }
        message(error.message);
        return false;
      }
    });
    $('#useCard').onclick = () => screenCardLogin();
    $('#forget').onclick = () => {
      if (!confirm('Zapomenout toto zařízení? Příště se přihlásíš kartičkou a PIN si nastavíš znovu.')) return;
      V.forgetDevice();
      screenCardLogin();
    };
  }

  function screenCardLogin(notice = '') {
    show(`<h1>Přihlášení kartičkou</h1><p class="lede">Naskenuj QR kód z přístupové kartičky. Klíč se nikam neposílá, jen se z něj ověří přístup a odemknou data.</p>
      <div id="lockMsg" class="lock-msg">${notice ? `<div class="note w">${esc(notice)}</div>` : ''}</div>
      <div class="lock-actions">
        <button class="btn big wide" type="button" id="scan">${ICON_CAMERA}Naskenovat kartičku</button>
        <label class="btn sec wide" for="photo">${ICON_IMAGE}Vyfotit nebo nahrát fotku</label>
        <input type="file" id="photo" accept="image/*" capture="environment" hidden>
        <button class="btn ghost wide" type="button" id="manual">${ICON_KEY}Opsat klíč ručně</button>
      </div>
      ${V.readDevice() ? '<div class="lock-foot"><button type="button" id="usePin">Zpět na PIN</button></div>' : ''}
      ${safeLine}`);
    $('#scan').onclick = () => screenScanner(key => loginWith(key));
    $('#photo').onchange = async event => {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      try { await loginWith(await keyFromPhoto(file)); } catch (error) { message(error.message); }
    };
    $('#manual').onclick = () => screenManualKey(loginWith);
    if ($('#usePin')) $('#usePin').onclick = screenUnlock;
  }

  function screenScanner(onKey, back = screenCardLogin) {
    show(`<h1>Naskenuj kartičku</h1><p class="lede">Namiř kameru na QR kód. Přihlášení proběhne samo.</p>
      <div id="lockMsg" class="lock-msg"></div>
      <div class="scanner"><video muted playsinline aria-label="Náhled kamery"></video><div class="frame"></div><div class="scanner-hint">Drž kartičku v rámečku</div></div>
      <div class="lock-foot"><button type="button" id="back">Zpět</button></div>`);
    $('#back').onclick = () => back();
    startScanner($('.scanner video'), key => onKey(key)).catch(error => {
      const text = error.name === 'NotAllowedError' ? 'Přístup ke kameře je zakázaný. Povol ho v prohlížeči, nebo nahraj fotku kartičky.' : error.message || 'Kameru nejde spustit.';
      message(text);
    });
  }

  function screenManualKey(onKey, back = screenCardLogin) {
    show(`<h1>Opsat klíč</h1><p class="lede">Klíč je na kartičce pod QR kódem: 8 skupin po 4 znacích. Na velikosti písmen a pomlčkách nezáleží.</p>
      <div id="lockMsg" class="lock-msg"></div>
      <form class="lock-stack" id="keyForm" autocomplete="off">
        <label class="field"><span>Přístupový klíč</span><input class="key-input" name="key" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-…" autofocus></label>
        <button class="btn big wide" type="submit">Pokračovat</button>
      </form>
      <div class="lock-foot"><button type="button" id="back">Zpět</button></div>`);
    $('#back').onclick = () => back();
    $('#keyForm').onsubmit = event => {
      event.preventDefault();
      onKey(event.target.elements.key.value);
    };
  }

  async function loginWith(key) {
    show('<div class="spinner" role="status" aria-label="Ověřuji"></div><p class="lede center">Ověřuji kartičku…</p>');
    try {
      await V.loginWithKey(key);
    } catch (error) {
      screenCardLogin(error.message);
      return;
    }
    screenOfferDevice();
  }

  function screenOfferDevice() {
    show(`<h1>Zapamatovat toto zařízení?</h1><p class="lede">Příště ho odemkneš šestimístným PINem a kartičku nebudeš potřebovat. Po pěti chybných PINech zařízení zapomene a znovu bude potřeba kartička.</p>
      <div class="lock-actions">
        <button class="btn big wide" type="button" id="setPin">Nastavit PIN</button>
        <button class="btn ghost wide" type="button" id="skip">Teď ne, jen tentokrát</button>
      </div>
      <p class="small muted mt">Na cizím nebo sdíleném počítači zvol „Teď ne“.</p>`);
    $('#setPin').onclick = () => screenSetPin();
    $('#skip').onclick = () => openApp();
  }

  function screenSetPin(first = '') {
    show(`<h1>${first ? 'Zopakuj PIN' : 'Zvol PIN'}</h1><p class="lede">${first ? 'Pro kontrolu ho zadej ještě jednou.' : 'Šest číslic, které nikde jinde nepoužíváš.'}</p>
      <div id="lockMsg" class="lock-msg"></div>
      ${pinPadHtml()}
      <div class="lock-foot"><button type="button" id="skip">Přeskočit</button></div>`);
    $('#skip').onclick = () => openApp();
    pinPad($('.pin-block'), async pin => {
      if (!first) {
        if (weakPin(pin)) { message('Tenhle PIN je moc snadný na uhodnutí. Zvol jiný.'); return false; }
        screenSetPin(pin);
        return true;
      }
      if (pin !== first) { toast('PINy se neshodují, zkus to znovu.', true); screenSetPin(); return true; }
      try {
        await V.enrollDevice(pin);
        toast('Zařízení je zapamatované. Příště stačí PIN.');
      } catch (error) {
        toast(error.message, true);
      }
      await openApp();
      return true;
    });
  }

  /* První spuštění */
  const setupDraft = { token: '', label: 'Hlavní kartička', key: '', restore: null };

  function steps(active, total = 3) {
    return `<div class="steps" aria-hidden="true">${Array.from({ length: total }, (_, index) => `<i class="${index <= active ? 'on' : ''}"></i>`).join('')}</div>`;
  }

  function screenSetupStart(notice = '') {
    show(`${steps(0)}<h1>Vítej v aplikaci Odměny</h1>
      <p class="lede">Nejdřív vytvoříme přístupovou kartičku s QR kódem. Jen s ní se do aplikace dostaneš a jen ona odemkne data.</p>
      <div id="lockMsg" class="lock-msg">${notice ? `<div class="note e">${esc(notice)}</div>` : ''}</div>
      <form class="lock-stack" id="setupForm" autocomplete="off">
        <label class="field"><span>Kód pro první spuštění</span><input class="key-input" name="token" value="${esc(setupDraft.token)}" placeholder="XXXX-XXXX-XXXX" required autofocus></label>
        <p class="small muted">Kód vypsala instalace na serveru. Znovu ho zobrazí příkaz uvedený v návodu.</p>
        <label class="field"><span>Název kartičky</span><input name="label" maxlength="40" value="${esc(setupDraft.label)}" placeholder="třeba Vedoucí dílny"></label>
        <button class="btn big wide" type="submit">Vytvořit kartičku</button>
      </form>
      <div class="lock-foot"><button type="button" id="restore">Obnovit ze šifrované zálohy</button></div>
      ${safeLine}`);
    $('#setupForm').onsubmit = async event => {
      event.preventDefault();
      setupDraft.token = event.target.elements.token.value.trim();
      setupDraft.label = event.target.elements.label.value.trim() || 'Hlavní kartička';
      setupDraft.key = await V.newAccessKey();
      screenSetupCard();
    };
    $('#restore').onclick = screenRestorePick;
  }

  function screenSetupCard() {
    show(`${steps(1)}<h1>Tvoje přístupová kartička</h1>
      <p class="lede">Vytiskni ji nebo si ulož obrázek. Klíč se nikde jinde neuchovává: když kartičku ztratíš a nemáš jinou ani zapamatované zařízení, k datům se už nikdo nedostane.</p>
      <div class="card-preview">${cardHtml(setupDraft.key, setupDraft.label)}</div>
      <div class="lock-actions">
        <button class="btn sec wide" type="button" id="print">Vytisknout kartičku</button>
        <button class="btn sec wide" type="button" id="download">Stáhnout jako obrázek</button>
      </div>
      <div id="lockMsg" class="lock-msg"></div>
      <label class="check mt"><input type="checkbox" id="saved"><span>Kartičku mám vytištěnou nebo bezpečně uloženou.</span></label>
      <button class="btn big wide mt" type="button" id="finish" disabled>Dokončit nastavení</button>`, true);
    $('#print').onclick = () => printCard(setupDraft.key, setupDraft.label);
    $('#download').onclick = () => downloadCard(setupDraft.key, setupDraft.label).catch(error => toast(error.message, true));
    $('#saved').onchange = event => { $('#finish').disabled = !event.target.checked; };
    $('#finish').onclick = async () => {
      $('#finish').disabled = true;
      try {
        await V.setup({ token: setupDraft.token, label: setupDraft.label, key: setupDraft.key });
      } catch (error) {
        if (error.status === 401 || error.status === 429) { screenSetupStart(error.message); return; }
        if (error.status === 409) { screenCardLogin(error.message); return; }
        message(error.message);
        $('#finish').disabled = false;
        return;
      }
      setupDraft.key = '';
      screenSetupDone();
    };
  }

  function screenSetupDone() {
    show(`${steps(2)}<h1>Hotovo</h1><p class="lede">Kartička platí. Na telefonu nebo dalším počítači otevři stejnou adresu a naskenuj ji. Další kartičky pro kolegy vytvoříš v Nastavení → Zabezpečení.</p>
      <div class="lock-actions">
        <button class="btn big wide" type="button" id="setPin">Zapamatovat toto zařízení s PINem</button>
        <button class="btn ghost wide" type="button" id="skip">Otevřít aplikaci</button>
      </div>`);
    $('#setPin').onclick = () => screenSetPin();
    $('#skip').onclick = () => openApp();
  }

  /* Obnova ze zálohy na nové instalaci */
  function screenRestorePick() {
    show(`${steps(0)}<h1>Obnovit ze zálohy</h1><p class="lede">Vyber soubor šifrované zálohy (.odmeny). Potom naskenuješ kartičku, která k záloze patří.</p>
      <div id="lockMsg" class="lock-msg"></div>
      <div class="lock-actions">
        <label class="btn big wide" for="backupFile">Vybrat zálohu</label>
        <input type="file" id="backupFile" accept=".odmeny,application/json" hidden>
      </div>
      <div class="lock-foot"><button type="button" id="back">Zpět</button></div>`);
    $('#back').onclick = () => screenSetupStart();
    $('#backupFile').onchange = async event => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (data.format !== 'odmeny-backup') throw new Error('Tohle není záloha aplikace Odměny.');
        setupDraft.restore = data;
        screenRestoreKey();
      } catch (error) {
        message(error instanceof SyntaxError ? 'Soubor nejde přečíst.' : error.message);
      }
    };
  }

  function screenRestoreKey() {
    const withKey = async key => {
      try {
        const opened = await V.openBackup(setupDraft.restore, key);
        setupDraft.key = key;
        setupDraft.opened = opened;
        screenRestoreToken();
      } catch (error) {
        screenRestoreKey();
        message(error.message);
      }
    };
    show(`${steps(1)}<h1>Kartička k záloze</h1><p class="lede">Naskenuj nebo opiš kartičku, která platila v době zálohy.</p>
      <div id="lockMsg" class="lock-msg"></div>
      <div class="lock-actions">
        <button class="btn big wide" type="button" id="scan">${ICON_CAMERA}Naskenovat kartičku</button>
        <label class="btn sec wide" for="photo">${ICON_IMAGE}Vyfotit nebo nahrát fotku</label>
        <input type="file" id="photo" accept="image/*" capture="environment" hidden>
        <button class="btn ghost wide" type="button" id="manual">${ICON_KEY}Opsat klíč ručně</button>
      </div>
      <div class="lock-foot"><button type="button" id="back">Zpět</button></div>`);
    $('#scan').onclick = () => screenScanner(withKey, screenRestoreKey);
    $('#photo').onchange = async event => {
      const file = event.target.files[0];
      event.target.value = '';
      if (file) try { await withKey(await keyFromPhoto(file)); } catch (error) { message(error.message); }
    };
    $('#manual').onclick = () => screenManualKey(withKey, screenRestoreKey);
    $('#back').onclick = screenRestorePick;
  }

  function screenRestoreToken(notice = '') {
    const card = setupDraft.opened.card;
    show(`${steps(2)}<h1>Dokončit obnovu</h1><p class="lede">Záloha je v pořádku a kartička „${esc(card.label)}“ k ní patří. Zadej kód pro první spuštění z instalace serveru.</p>
      <div id="lockMsg" class="lock-msg">${notice ? `<div class="note e">${esc(notice)}</div>` : ''}</div>
      <form class="lock-stack" id="restoreForm" autocomplete="off">
        <label class="field"><span>Kód pro první spuštění</span><input class="key-input" name="token" required autofocus></label>
        <button class="btn big wide" type="submit">Obnovit data</button>
      </form>`);
    $('#restoreForm').onsubmit = async event => {
      event.preventDefault();
      try {
        await V.setup({ token: event.target.elements.token.value, label: card.label, key: setupDraft.key, dek: setupDraft.opened.dek, cardId: card.id, blob: setupDraft.restore.data });
      } catch (error) {
        screenRestoreToken(error.message);
        return;
      }
      setupDraft.key = '';
      setupDraft.restore = null;
      toast('Data jsou obnovená. Ostatní kartičky ze zálohy je potřeba vytvořit znovu.');
      screenSetupDone();
    };
  }

  /* ------------------------------------------------------------ aplikace */

  async function openApp() {
    show('<div class="spinner" role="status" aria-label="Načítám"></div><p class="lede center">Dešifruji data…</p>');
    try {
      const version = document.body.dataset.privateVersion || '1';
      const [loaded, markup] = await Promise.all([
        V.loadData(),
        fetch(`app.php?f=app.html&v=${version}`, { credentials: 'same-origin' }).then(response => {
          if (!response.ok) throw new Error('Aplikaci nejde načíst. Obnov stránku.');
          return response.text();
        }),
      ]);
      await new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `app.php?f=app.css&v=${version}`;
        link.onload = resolve;
        link.onerror = () => reject(new Error('Vzhled aplikace se nenačetl.'));
        document.head.append(link);
      });
      await loadScript(`app.php?f=core.js&v=${version}`);
      await loadScript(`app.php?f=app.js&v=${version}`);
      const app = $('#app');
      app.innerHTML = markup;
      await window.OdmApp.start(loaded);
      $('#lock').remove();
      app.hidden = false;
    } catch (error) {
      if (error.status === 401) { start(); return; }
      show(`<h1>Něco se nepovedlo</h1><div class="note e">${esc(error.message)}</div><div class="lock-actions"><button class="btn wide" type="button" id="retry">Zkusit znovu</button></div>`);
      $('#retry').onclick = () => location.reload();
    }
  }

  async function start() {
    if (!V.available()) {
      show('<h1>Nezabezpečené připojení</h1><div class="note e">Šifrování v prohlížeči funguje jen přes HTTPS. Otevři aplikaci přes adresu začínající https://.</div>');
      return;
    }
    let state;
    try {
      state = await V.api('state');
    } catch (error) {
      show(`<h1>Server neodpovídá</h1><div class="note e">${esc(error.message)}</div><div class="lock-actions"><button class="btn wide" type="button" id="retry">Zkusit znovu</button></div>`);
      $('#retry').onclick = start;
      return;
    }
    if (state.setup_required) { screenSetupStart(); return; }
    // Otevřená relace po obnovení stránky: klíč v paměti už není, takže znovu PIN nebo kartička.
    if (state.authenticated) await V.api('logout', { method: 'POST' }).catch(() => {});
    if (V.readDevice()) screenUnlock();
    else screenCardLogin();
  }

  window.OdmLock = { printCard, downloadCard, cardHtml, screenScanner, keyFromPhoto, startScanner, stopScanner, loadScript, pinPadHtml, pinPad, weakPin, toast };
  start();
})();
