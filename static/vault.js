'use strict';

/*
 * Odměny – šifrování v prohlížeči.
 *
 * Přístupový klíč z QR kartičky (152 bitů náhody + kontrolní bajt proti
 * překlepu) se nikdy neposílá na server. Odvodí se z něj:
 *   auth – otisk, kterým se kartička prokáže serveru (server ho zná jen jako hash),
 *   kek  – klíč, který rozbalí datový klíč DEK.
 * DEK (AES-GCM 256) šifruje celý stav aplikace. Server dostane jen šifrovaný blok.
 *
 * Zapamatované zařízení drží v prohlížeči náhodné tajemství a DEK zabalený
 * klíčem z (tajemství zařízení + tajemství ze serveru + PIN). Server tajemství
 * vydá až po ověření PINu a po pěti chybách zařízení smaže, takže PIN nejde hádat.
 */
(function attachVault(root) {
  const cryptoApi = root.crypto;
  const subtle = cryptoApi && cryptoApi.subtle;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const QR_PREFIX = 'ODMENY:';
  const DEVICE_STORAGE = 'odmeny.device.v1';
  const DATA_AAD = 'odmeny/data/v1';
  // Verze tvaru dat, kterou server žádá u zápisu (stará otevřená stránka nové údaje neumí).
  const CLIENT_VERSION = '3';

  /* ------------------------------------------------------------ bajty */

  function toBase64(bytes) {
    let text = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
      text += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
    }
    return btoa(text);
  }

  function fromBase64(text) {
    const binary = atob(String(text || ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function randomBytes(length) {
    const bytes = new Uint8Array(length);
    cryptoApi.getRandomValues(bytes);
    return bytes;
  }

  function toHex(bytes) {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function concatBytes(...parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    parts.forEach(part => { out.set(part, offset); offset += part.length; });
    return out;
  }

  async function sha256(bytes) {
    return new Uint8Array(await subtle.digest('SHA-256', bytes));
  }

  function available() {
    return Boolean(subtle && root.isSecureContext !== false);
  }

  /* ------------------------------------------------------------ přístupový klíč */

  function base32(bytes) {
    let bits = 0;
    let value = 0;
    let out = '';
    bytes.forEach(byte => {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        out += ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    });
    if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
    return out;
  }

  function unbase32(text) {
    let bits = 0;
    let value = 0;
    const out = [];
    for (const char of text) {
      const index = ALPHABET.indexOf(char);
      if (index < 0) return null;
      value = (value << 5) | index;
      bits += 5;
      if (bits >= 8) {
        out.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return new Uint8Array(out);
  }

  /** Sjednotí zápis: bez předpony, mezer a pomlček, velká písmena, zaměnitelné znaky podle Crockforda. */
  function normalizeKey(text) {
    let value = String(text || '').trim().toUpperCase();
    if (value.startsWith(QR_PREFIX)) value = value.slice(QR_PREFIX.length);
    value = value.replace(/[^0-9A-Z]/g, '');
    return value.replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
  }

  async function newAccessKey() {
    const payload = randomBytes(19);
    const check = (await sha256(payload))[0];
    return base32(concatBytes(payload, new Uint8Array([check])));
  }

  /** Vrátí 20 bajtů klíče, nebo vyhodí srozumitelnou chybu (překlep pozná kontrolní bajt). */
  async function parseAccessKey(text) {
    const key = normalizeKey(text);
    if (key.length !== 32) {
      throw new Error(key.length < 32 ? `Klíč je krátký: má ${key.length} z 32 znaků.` : `Klíč je dlouhý: má ${key.length} z 32 znaků.`);
    }
    const bytes = unbase32(key);
    if (!bytes || bytes.length !== 20) throw new Error('Klíč obsahuje neplatné znaky.');
    const check = (await sha256(bytes.subarray(0, 19)))[0];
    if (check !== bytes[19]) throw new Error('Klíč má překlep. Zkontroluj ho podle kartičky.');
    return { key, bytes };
  }

  function formatKey(key) {
    return normalizeKey(key).match(/.{1,4}/g)?.join('-') || '';
  }

  function qrText(key) {
    return QR_PREFIX + normalizeKey(key);
  }

  /* ------------------------------------------------------------ klíče a šifry */

  async function hkdfBits(ikm, salt, info) {
    const base = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: typeof salt === 'string' ? encoder.encode(salt) : salt, info: encoder.encode(info) }, base, 256));
  }

  async function hkdfAesKey(ikm, salt, info) {
    const bits = await hkdfBits(ikm, salt, info);
    return subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  async function cardSecrets(keyBytes) {
    const auth = await hkdfBits(keyBytes, 'odmeny/v1', 'auth');
    const kek = await hkdfAesKey(keyBytes, 'odmeny/v1', 'kek');
    return { auth: toBase64(auth), kek };
  }

  async function seal(key, plain, aad) {
    const iv = randomBytes(12);
    const cipher = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(aad) }, key, plain));
    return concatBytes(iv, cipher);
  }

  async function open(key, sealed, aad) {
    const iv = sealed.subarray(0, 12);
    const cipher = sealed.subarray(12);
    return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(aad) }, key, cipher));
  }

  async function newDek() {
    return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }

  async function wrapDek(dek, wrappingKey, aad) {
    const raw = new Uint8Array(await subtle.exportKey('raw', dek));
    return toBase64(await seal(wrappingKey, raw, aad));
  }

  async function unwrapDek(wrapped, wrappingKey, aad) {
    const raw = await open(wrappingKey, fromBase64(wrapped), aad);
    return subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }

  async function transform(bytes, Stream) {
    const stream = new Blob([bytes]).stream().pipeThrough(new Stream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** Stav → [verze 1][příznaky: 1 = gzip][IV 12][šifra] v base64. */
  async function sealData(dek, value, aad = DATA_AAD) {
    let plain = encoder.encode(JSON.stringify(value));
    let flags = 0;
    if (typeof CompressionStream === 'function') {
      plain = await transform(plain, CompressionStream);
      flags = 1;
    }
    const sealed = await seal(dek, plain, aad);
    return toBase64(concatBytes(new Uint8Array([1, flags]), sealed));
  }

  async function openData(dek, blob, aad = DATA_AAD) {
    const bytes = fromBase64(blob);
    if (bytes[0] !== 1) throw new Error('Neznámý formát dat.');
    let plain = await open(dek, bytes.subarray(2), aad);
    if (bytes[1] & 1) {
      if (typeof DecompressionStream !== 'function') throw new Error('Prohlížeč neumí rozbalit data. Aktualizuj ho.');
      plain = await transform(plain, DecompressionStream);
    }
    return JSON.parse(decoder.decode(plain));
  }

  /* ------------------------------------------------------------ server */

  class ApiError extends Error {
    constructor(message, status, data) {
      super(message);
      this.status = status;
      this.data = data || {};
    }
  }

  async function api(action, { method = 'GET', body, query } = {}) {
    const params = new URLSearchParams({ action, ...(query || {}) });
    let response;
    try {
      response = await fetch(`api.php?${params}`, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'X-Odmeny': '1', 'X-Odmeny-Client': CLIENT_VERSION, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      throw new ApiError('Server není dostupný. Zkontroluj připojení.', 0);
    }
    let data = {};
    try { data = await response.json(); } catch (error) { data = {}; }
    if (!response.ok) throw new ApiError(data.error || `Server vrátil chybu ${response.status}.`, response.status, data);
    return data;
  }

  /* ------------------------------------------------------------ zařízení */

  function readDevice() {
    try {
      const value = JSON.parse(root.localStorage.getItem(DEVICE_STORAGE) || 'null');
      return value && /^[a-f0-9]{32}$/.test(value.id) && value.ds && value.wrapped ? value : null;
    } catch (error) {
      return null;
    }
  }

  function writeDevice(value) {
    root.localStorage.setItem(DEVICE_STORAGE, JSON.stringify(value));
  }

  function forgetDevice() {
    try { root.localStorage.removeItem(DEVICE_STORAGE); } catch (error) { /* nic */ }
  }

  async function pinProof(pin, deviceSecret) {
    return toBase64(await hkdfBits(encoder.encode(String(pin)), deviceSecret, 'odmeny/pin-proof'));
  }

  async function deviceKey(deviceSecret, serverShare, pin) {
    return hkdfAesKey(concatBytes(deviceSecret, serverShare, encoder.encode(String(pin))), 'odmeny/device/v1', 'wrap');
  }

  function deviceLabel() {
    const agent = String(root.navigator?.userAgent || '');
    const system = /iPhone|iPad/.test(agent) ? 'iPhone/iPad' : /Android/.test(agent) ? 'Android' : /Mac OS X/.test(agent) ? 'Mac' : /Windows/.test(agent) ? 'Windows' : /Linux/.test(agent) ? 'Linux' : 'Zařízení';
    const browser = /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : 'prohlížeč';
    return `${system} · ${browser}`;
  }

  /* ------------------------------------------------------------ odemčená relace */

  const session = { dek: null, cardId: null, label: '', deviceId: null };

  function requireDek() {
    if (!session.dek) throw new Error('Aplikace je zamčená.');
    return session.dek;
  }

  async function setup({ token, label, key, dek = null, cardId = null, blob = null }) {
    const parsed = await parseAccessKey(key);
    const secrets = await cardSecrets(parsed.bytes);
    const id = cardId || toHex(randomBytes(8));
    const dataKey = dek || await newDek();
    const wrapped = await wrapDek(dataKey, secrets.kek, `odmeny/dek|card:${id}`);
    await api('setup', { method: 'POST', body: { token, card: { id, label, auth: secrets.auth, wrapped_dek: wrapped }, ...(blob ? { blob } : {}) } });
    Object.assign(session, { dek: dataKey, cardId: id, label, deviceId: null });
    return { cardId: id };
  }

  async function loginWithKey(text) {
    const parsed = await parseAccessKey(text);
    const secrets = await cardSecrets(parsed.bytes);
    const result = await api('login', { method: 'POST', body: { auth: secrets.auth } });
    let dek;
    try {
      dek = await unwrapDek(result.wrapped_dek, secrets.kek, `odmeny/dek|card:${result.card_id}`);
    } catch (error) {
      await api('logout', { method: 'POST' }).catch(() => {});
      throw new Error('Kartička je platná, ale klíč k datům nejde rozbalit. Kontaktuj správce.');
    }
    Object.assign(session, { dek, cardId: result.card_id, label: result.label, deviceId: null });
    return { cardId: result.card_id, label: result.label };
  }

  async function unlockWithPin(pin) {
    const device = readDevice();
    if (!device) throw new Error('Toto zařízení není zapamatované.');
    const secret = fromBase64(device.ds);
    let result;
    try {
      result = await api('unlock', { method: 'POST', body: { device_id: device.id, pin_proof: await pinProof(pin, secret) } });
    } catch (error) {
      if (error.data?.forget) forgetDevice();
      throw error;
    }
    const key = await deviceKey(secret, fromBase64(result.server_share), pin);
    const dek = await unwrapDek(device.wrapped, key, `odmeny/dek|device:${device.id}`);
    Object.assign(session, { dek, cardId: result.card_id, label: result.card_label || device.label, deviceId: device.id });
    return { deviceId: device.id };
  }

  async function enrollDevice(pin, label = deviceLabel()) {
    const dek = requireDek();
    const secret = randomBytes(32);
    const result = await api('device', { method: 'POST', body: { pin_proof: await pinProof(pin, secret), label } });
    const key = await deviceKey(secret, fromBase64(result.server_share), pin);
    const wrapped = await wrapDek(dek, key, `odmeny/dek|device:${result.device_id}`);
    writeDevice({ id: result.device_id, ds: toBase64(secret), wrapped, label, created: new Date().toISOString() });
    session.deviceId = result.device_id;
    return { deviceId: result.device_id, label };
  }

  async function createCard(label) {
    const dek = requireDek();
    const key = await newAccessKey();
    const secrets = await cardSecrets((await parseAccessKey(key)).bytes);
    const id = toHex(randomBytes(8));
    const wrapped = await wrapDek(dek, secrets.kek, `odmeny/dek|card:${id}`);
    await api('card', { method: 'POST', body: { id, label, auth: secrets.auth, wrapped_dek: wrapped } });
    return { key, cardId: id, label };
  }

  async function loadData() {
    const result = await api('data');
    return { rev: result.rev, savedAt: result.saved_at, state: result.blob ? await openData(requireDek(), result.blob) : null };
  }

  async function saveData(state, baseRev) {
    const blob = await sealData(requireDek(), state);
    return api('data', { method: 'POST', body: { base_rev: baseRev, blob } });
  }

  /* Osobní nastavení pohledu: jen pro tuto kartičku, šifrované stejným klíčem jako data,
     ale s jinými přidanými daty (AAD), takže je server nemůže podstrčit místo dat ani cizí kartičce. */
  const prefsAad = cardId => `odmeny/prefs/v1|card:${cardId}`;

  async function loadPrefs() {
    const result = await api('prefs');
    if (!result.blob) return null;
    try {
      return await openData(requireDek(), result.blob, prefsAad(session.cardId));
    } catch (error) {
      return null;
    }
  }

  async function savePrefs(prefs) {
    const blob = await sealData(requireDek(), prefs, prefsAad(session.cardId));
    return api('prefs', { method: 'POST', body: { blob } });
  }

  async function me() {
    const result = await api('me');
    session.cardId = result.card_id;
    return result;
  }

  async function loadVersion(rev) {
    const result = await api('version', { query: { rev } });
    return openData(requireDek(), result.blob);
  }

  /** Šifrovaná záloha: data + DEK zabalený každou kartičkou. Obnovit ji jde kteroukoli z nich. */
  async function backup(state) {
    const cards = await api('cards');
    return {
      format: 'odmeny-backup',
      version: 1,
      created_at: new Date().toISOString(),
      cards: cards.items.map(card => ({ id: card.id, label: card.label, wrapped_dek: card.wrapped_dek })),
      data: await sealData(requireDek(), state),
    };
  }

  /** Otevře zálohu. Bez klíče zkusí aktuální DEK (stejná instalace), jinak klíč z kartičky. */
  async function openBackup(file, keyText = null) {
    if (!file || file.format !== 'odmeny-backup' || !Array.isArray(file.cards) || typeof file.data !== 'string') {
      throw new Error('Tohle není záloha aplikace Odměny.');
    }
    if (!keyText && session.dek) {
      try {
        return { state: await openData(session.dek, file.data), dek: session.dek, card: null };
      } catch (error) { /* záloha z jiné instalace, potřebuje kartičku */ }
    }
    if (!keyText) throw Object.assign(new Error('Záloha je z jiné instalace. Naskenuj kartičku, která k ní patří.'), { needsKey: true });
    const secrets = await cardSecrets((await parseAccessKey(keyText)).bytes);
    for (const card of file.cards) {
      try {
        const dek = await unwrapDek(card.wrapped_dek, secrets.kek, `odmeny/dek|card:${card.id}`);
        return { state: await openData(dek, file.data), dek, card };
      } catch (error) { /* jiná kartička */ }
    }
    throw new Error('Tahle kartička k záloze nepatří.');
  }

  async function lock() {
    session.dek = null;
    await api('logout', { method: 'POST' }).catch(() => {});
  }

  root.OdmVault = {
    available, api, ApiError, session,
    newAccessKey, parseAccessKey, normalizeKey, formatKey, qrText,
    readDevice, forgetDevice, deviceLabel,
    setup, loginWithKey, unlockWithPin, enrollDevice, createCard,
    loadData, saveData, loadVersion, backup, openBackup, lock, loadPrefs, savePrefs, me,
    newDek, sealData, openData, cardSecrets, toBase64, fromBase64,
  };
})(typeof window !== 'undefined' ? window : globalThis);
