'use strict';

/* Vzhled aplikace: od 2.54 vždy „glass“ (sklo), původní vzhled si uživatel už nevolí. Volba
   uložená ve 2.47–2.53 (localStorage `odmeny.look.v1:<adresa>`) se smaže. Atribut `data-look`
   zůstává, CSS vrstva skla je na něm postavená. */
(function lookInit() {
  const base = String(location.pathname || '/').replace(/[^/]*$/, '') || '/';
  try { localStorage.removeItem(`odmeny.look.v1:${base}`); } catch { /* soukromé okno */ }
  document.documentElement.dataset.look = 'glass';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', '#0b0c10');
  window.OdmLook = { get: () => 'glass' };
})();
