'use strict';

/* Vzhled aplikace (2.47): „glass“ (výchozí, sklo) nebo „classic“ (původní). Pamatuje si ho
   tento prohlížeč (klíč podle adresy, jako zapamatované zařízení), platí už na zamykací obrazovce. */
(function lookInit() {
  const base = String(location.pathname || '/').replace(/[^/]*$/, '') || '/';
  const key = `odmeny.look.v1:${base}`;
  const read = () => { try { return localStorage.getItem(key) === 'classic' ? 'classic' : 'glass'; } catch { return 'glass'; } };
  const apply = look => {
    document.documentElement.dataset.look = look;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', look === 'glass' ? '#0b0c10' : '#0e6b5d');
  };
  apply(read());
  window.OdmLook = {
    get: read,
    set(look) { look = look === 'classic' ? 'classic' : 'glass'; try { localStorage.setItem(key, look); } catch { /* soukromé okno: platí jen do zavření */ } apply(look); },
  };
})();
