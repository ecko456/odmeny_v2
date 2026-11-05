'use strict';

/*
 * Úvodní animace zámku (2.55): ohnivá koule přiletí po dráze, narazí do středu panelu,
 * rozletí se na jiskry s rázovou vlnou a z nárazu se složí přihlašovací panel.
 * Kreslí se na <canvas> (CSP: žádné inline styly ani skripty), nic neblokuje:
 * přihlášení se mezitím načítá a pole s PINem má fokus, takže psaní nebo klepnutí
 * animaci přeskočí.
 *   - celá animace jednou za otevření karty prohlížeče (sessionStorage), po zamknutí
 *     a znovu načtení stránky jen krátké složení panelu;
 *   - s „omezit pohyb“ (prefers-reduced-motion) žádná animace;
 *   - pojistka: nejpozději po 4 s je panel vidět vždy.
 * Spouští se v <head>, aby se panel před animací vůbec neukázal.
 */
(function lockIntro() {
  const root = document.documentElement;
  const base = String(location.pathname || '/').replace(/[^/]*$/, '') || '/';
  const KEY = `odmeny.intro.v1:${base}`;
  let reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* starý prohlížeč */ }
  if (reduce || document.visibilityState === 'hidden' || typeof requestAnimationFrame !== 'function') {
    window.OdmIntro = { mode: 'none', done: Promise.resolve() };
    return;
  }
  let seen = false;
  try { seen = sessionStorage.getItem(KEY) === '1'; sessionStorage.setItem(KEY, '1'); } catch { /* soukromé okno */ }
  const mode = seen ? 'short' : 'full';
  root.classList.add('intro-on', `intro-${mode}`);

  let finish;
  const done = new Promise(resolve => { finish = resolve; });
  window.OdmIntro = { mode, done, skip: () => {} };

  /* Panel se ukáže (CSS animace složení), animace na plátně může ještě doznívat. */
  let revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    root.classList.add('intro-reveal');
  }
  let ended = false;
  let cleanup = null;
  function end() {
    if (ended) return;
    ended = true;
    if (cleanup) cleanup();
    reveal();
    // `intro-reveal` zůstává: bez ní by se znovu spustila běžná animace panelu (rise)
    root.classList.remove('intro-on');
    finish();
  }
  setTimeout(end, 4000);

  if (mode === 'short') {
    const go = () => requestAnimationFrame(() => { reveal(); setTimeout(end, 700); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true });
    else go();
    const skipShort = () => {
      document.removeEventListener('pointerdown', skipShort, true);
      document.removeEventListener('keydown', skipShort, true);
      if (!ended) { root.classList.add('intro-skip'); end(); }
    };
    document.addEventListener('pointerdown', skipShort, true);
    document.addEventListener('keydown', skipShort, true);
    window.OdmIntro.skip = skipShort;
    return;
  }

  /* ------------------------------------------------------------ plná animace */

  const T_FLY0 = 0.28;   // start letu (s)
  const T_HIT = 1.3;     // náraz
  const T_END = 2.75;    // konec plátna

  function run() {
    const lock = document.getElementById('lock');
    const card = document.getElementById('lockCard');
    if (!lock || !card) { end(); return; }
    const canvas = document.createElement('canvas');
    canvas.className = 'intro-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.append(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) { canvas.remove(); end(); return; }

    let W = 0, H = 0, dpr = 1;
    function size() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    window.addEventListener('resize', size);

    // cíl = střed panelu (panel je zatím neviditelný, ale rozložený)
    function target() {
      const r = card.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + Math.min(r.height, 420) / 2 };
    }
    let aim = target();
    const small = W < 640;
    const scale = small ? 0.75 : 1;
    // dráha: z pravého horního rohu (odtud svítí oranžová záře pozadí) obloukem do cíle
    const P0 = { x: W * 1.08, y: -H * 0.12 };
    const P1 = { x: W * 0.78, y: H * 0.55 };

    const parts = [];   // částice: x, y, vx, vy, life, max, r, kind (t = ohon, s = jiskra, e = žhavý uhlík, m = kouř)
    const rings = [];
    let flash = 0;
    let shake = 0;
    let hit = false;
    let last = 0;
    let t0 = 0;
    let prevBall = null;

    const easeIn = x => x * x * (1.6 - 0.6 * x);
    function ballAt(t) {
      const k = Math.max(0, Math.min(1, (t - T_FLY0) / (T_HIT - T_FLY0)));
      const e = easeIn(k);
      const u = 1 - e;
      return {
        k,
        x: u * u * P0.x + 2 * u * e * P1.x + e * e * aim.x,
        y: u * u * P0.y + 2 * u * e * P1.y + e * e * aim.y,
        r: (7 + 17 * e) * scale,
      };
    }

    function spawn(kind, x, y, vx, vy, life, r) {
      if (parts.length > 900) return;
      parts.push({ kind, x, y, vx, vy, life, max: life, r });
    }

    function explode(x, y) {
      hit = true;
      flash = 1;
      shake = 14 * scale;
      rings.push({ x, y, t: 0, dur: 0.75, max: Math.max(W, H) * 0.75, w: 3 });
      rings.push({ x, y, t: -0.08, dur: 1.0, max: Math.max(W, H) * 0.5, w: 1.4 });
      const n = Math.round((small ? 110 : 170));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = (260 + Math.random() * 900) * scale;
        spawn('s', x, y, Math.cos(a) * v, Math.sin(a) * v, 0.45 + Math.random() * 0.7, 1 + Math.random() * 1.6);
      }
      for (let i = 0; i < n * 0.45; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = (60 + Math.random() * 320) * scale;
        spawn('e', x, y, Math.cos(a) * v, Math.sin(a) * v, 0.8 + Math.random() * 1.0, 1.5 + Math.random() * 2.5);
      }
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = (30 + Math.random() * 120) * scale;
        spawn('m', x, y, Math.cos(a) * v, Math.sin(a) * v, 0.9 + Math.random() * 0.6, (18 + Math.random() * 26) * scale);
      }
      reveal();
    }

    // barva ohně podle stáří částice (0 = nová): bílá → žlutá → oranžová → červená
    function fire(age, alpha) {
      const r = 255;
      const g = Math.round(Math.max(40, 245 - age * 230));
      const b = Math.round(Math.max(0, 200 - age * 520));
      return `rgba(${r},${g},${b},${alpha})`;
    }

    /* HUD: mřížka obzoru, zaměřovač na cíli a telemetrie v rozích */
    function hud(t, fade) {
      if (fade <= 0) return;
      ctx.save();
      ctx.globalAlpha = fade;
      // perspektivní mřížka u spodního okraje
      const hy = H * 0.7;
      ctx.strokeStyle = 'rgba(255,122,46,.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = -12; i <= 12; i++) {
        ctx.moveTo(W / 2 + i * 18, hy);
        ctx.lineTo(W / 2 + i * W * 0.16, H);
      }
      const drift = (t * 0.6) % 1;
      for (let j = 0; j < 9; j++) {
        const q = (j + drift) / 9;
        const y = hy + (H - hy) * q * q;
        ctx.moveTo(0, y); ctx.lineTo(W, y);
      }
      ctx.stroke();
      const grd = ctx.createLinearGradient(0, hy - 2, 0, hy + 60);
      grd.addColorStop(0, 'rgba(11,12,16,0)');
      grd.addColorStop(0.02, 'rgba(255,140,60,.18)');
      grd.addColorStop(1, 'rgba(11,12,16,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, hy - 2, W, 62);

      // zaměřovač: oblouky se stahují k cíli, při zásahu zmizí
      if (!hit) {
        const k = Math.max(0, Math.min(1, (t - 0.1) / (T_HIT - 0.15)));
        const R = (150 - 95 * k) * scale;
        ctx.strokeStyle = `rgba(255,145,80,${0.35 + 0.45 * k})`;
        ctx.lineWidth = 1.5;
        const rot = t * 1.8;
        for (let i = 0; i < 4; i++) {
          const a = rot + i * Math.PI / 2;
          ctx.beginPath();
          ctx.arc(aim.x, aim.y, R, a, a + Math.PI / 4);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,255,255,.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const g = 10 * scale, L = 22 * scale;
        ctx.moveTo(aim.x - R - L, aim.y); ctx.lineTo(aim.x - R + g, aim.y);
        ctx.moveTo(aim.x + R - g, aim.y); ctx.lineTo(aim.x + R + L, aim.y);
        ctx.moveTo(aim.x, aim.y - R - L); ctx.lineTo(aim.x, aim.y - R + g);
        ctx.moveTo(aim.x, aim.y + R - g); ctx.lineTo(aim.x, aim.y + R + L);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,145,80,.9)';
        ctx.beginPath(); ctx.arc(aim.x, aim.y, 2, 0, Math.PI * 2); ctx.fill();
        // předpověď dráhy (čárkovaně)
        ctx.setLineDash([4, 7]);
        ctx.strokeStyle = 'rgba(255,255,255,.18)';
        ctx.beginPath();
        for (let s = 0; s <= 24; s++) {
          const b = ballAt(T_FLY0 + (T_HIT - T_FLY0) * (s / 24));
          if (b.k < ballAt(t).k) continue;
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // telemetrie
      const font = small ? 10 : 11;
      ctx.font = `600 ${font}px "Jakarta", "Segoe UI", system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      const k = Math.max(0, Math.min(1, (t - T_FLY0) / (T_HIT - T_FLY0)));
      const pad = small ? 16 : 28;
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.textAlign = 'left';
      ctx.fillText('HALA 2 · ODMĚNY v2', pad, pad);
      ctx.fillStyle = 'rgba(255,145,80,.85)';
      ctx.fillText(hit ? 'KONTAKT · PANEL AKTIVNÍ' : 'NAVÁDĚNÍ NA CÍL', pad, pad + font + 6);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      const mach = (0.4 + 2.2 * easeIn(k)).toFixed(2);
      const alt = Math.round(12000 * (1 - k)).toString().padStart(5, '0');
      ctx.fillText(`M ${mach}   ALT ${alt} m`, W - pad, pad);
      ctx.fillText(`HDG ${String(Math.round(218 + 14 * k)).padStart(3, '0')}°   AES-256`, W - pad, pad + font + 6);
      ctx.restore();
    }

    function frame(now) {
      if (ended) return;
      if (!t0) { t0 = now; last = now; }
      const t = (now - t0) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (t < T_HIT) aim = target();

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // ztmavení: plné na začátku, po nárazu odchází a odkryje panel
      const dim = hit ? Math.max(0, 1 - (t - T_HIT) / 0.5) : Math.min(1, t / 0.15);
      if (dim > 0) { ctx.fillStyle = `rgba(7,8,11,${0.82 * dim})`; ctx.fillRect(0, 0, W, H); }

      if (shake > 0.2) {
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        shake *= Math.pow(0.0009, dt);
      }

      const hudFade = hit ? Math.max(0, 1 - (t - T_HIT) / 0.6) : Math.min(1, t / 0.35);
      hud(t, hudFade);

      // koule
      if (!hit && t >= T_FLY0) {
        const b = ballAt(t);
        // ohon: částice podél dráhy od minulé polohy (souvislý i při trhání snímků)
        const from = prevBall || b;
        const steps = 6;
        for (let s = 0; s < steps; s++) {
          const q = s / steps;
          const x = from.x + (b.x - from.x) * q, y = from.y + (b.y - from.y) * q;
          const sp = 40 * scale;
          spawn('t', x + (Math.random() - 0.5) * b.r * 0.8, y + (Math.random() - 0.5) * b.r * 0.8,
            (Math.random() - 0.5) * sp, (Math.random() - 0.5) * sp - 10, 0.28 + Math.random() * 0.35, b.r * (0.5 + Math.random() * 0.5));
        }
        if (Math.random() < 0.6) spawn('m', b.x, b.y, (Math.random() - 0.5) * 30, -20, 0.7, b.r * 1.2);
        prevBall = b;
        if (b.k >= 1) explode(b.x, b.y);
      }

      // kouř (normální míchání), pak oheň (sčítání světla)
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalCompositeOperation = pass ? 'lighter' : 'source-over';
        for (const p of parts) {
          if ((p.kind === 'm') !== (pass === 0)) continue;
          const age = 1 - p.life / p.max;
          if (p.kind === 'm') {
            ctx.fillStyle = `rgba(40,30,28,${0.22 * (1 - age)})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + age * 1.5), 0, Math.PI * 2); ctx.fill();
          } else if (p.kind === 't') {
            const r = p.r * (1 - age * 0.6);
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
            g.addColorStop(0, fire(age, 0.55 * (1 - age)));
            g.addColorStop(1, fire(age + 0.3, 0));
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
          } else {
            // jiskra = krátká čárka ve směru letu, uhlík = tečka
            ctx.strokeStyle = fire(age * 0.9, 1 - age);
            ctx.lineWidth = p.r;
            ctx.lineCap = 'round';
            const len = p.kind === 's' ? 0.022 : 0.008;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * len, p.y - p.vy * len);
            ctx.stroke();
          }
        }
      }
      ctx.globalCompositeOperation = 'lighter';
      // jádro koule s ohnivou září
      if (!hit && t >= T_FLY0 && prevBall) {
        const b = prevBall;
        const glow = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 4.2);
        glow.addColorStop(0, 'rgba(255,170,90,.55)');
        glow.addColorStop(0.35, 'rgba(255,100,20,.25)');
        glow.addColorStop(1, 'rgba(255,80,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 4.2, 0, Math.PI * 2); ctx.fill();
        const core = ctx.createRadialGradient(b.x - b.r * 0.2, b.y - b.r * 0.2, 0, b.x, b.y, b.r);
        core.addColorStop(0, 'rgba(255,255,245,1)');
        core.addColorStop(0.45, 'rgba(255,215,120,1)');
        core.addColorStop(1, 'rgba(255,110,20,.0)');
        ctx.fillStyle = core;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      }
      // rázové vlny
      for (const ring of rings) {
        ring.t += dt;
        if (ring.t <= 0 || ring.t > ring.dur) continue;
        const q = ring.t / ring.dur;
        const r = ring.max * (1 - Math.pow(1 - q, 3));
        ctx.strokeStyle = `rgba(255,${Math.round(200 - 90 * q)},${Math.round(140 - 120 * q)},${0.8 * (1 - q)})`;
        ctx.lineWidth = ring.w * (1 + 3 * (1 - q));
        ctx.beginPath(); ctx.arc(ring.x, ring.y, r, 0, Math.PI * 2); ctx.stroke();
      }
      // záblesk
      if (flash > 0.01) {
        const f = ctx.createRadialGradient(aim.x, aim.y, 0, aim.x, aim.y, Math.max(W, H) * 0.7);
        f.addColorStop(0, `rgba(255,250,235,${0.95 * flash})`);
        f.addColorStop(0.25, `rgba(255,160,70,${0.45 * flash})`);
        f.addColorStop(1, 'rgba(255,90,0,0)');
        ctx.fillStyle = f;
        ctx.fillRect(-20, -20, W + 40, H + 40);
        flash *= Math.pow(0.002, dt);
      }
      ctx.globalCompositeOperation = 'source-over';

      // pohyb částic
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= dt;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        const drag = p.kind === 's' ? 2.6 : p.kind === 'e' ? 1.6 : 1.2;
        p.vx *= Math.exp(-drag * dt);
        p.vy *= Math.exp(-drag * dt);
        if (p.kind === 'e') p.vy += 160 * dt * scale;
        if (p.kind === 'm') p.vy -= 18 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      if (t >= T_END || (hit && t > T_HIT + 0.4 && !parts.length)) { stop(); return; }
      requestAnimationFrame(frame);
    }

    cleanup = () => {
      window.removeEventListener('resize', size);
      document.removeEventListener('pointerdown', skip, true);
      document.removeEventListener('keydown', skip, true);
      canvas.classList.add('out');
      setTimeout(() => canvas.remove(), 260);
    };
    function stop() {
      end();
    }
    // přeskočení ukáže panel hned: složení (oříznutí kruhem) by kliku pod prstem uhnulo
    function skip() { if (!ended) { root.classList.add('intro-skip'); stop(); } }
    window.OdmIntro.skip = skip;
    // klepnutí nebo psaní (PIN má fokus) animaci přeskočí; plátno samo kliky nebere
    document.addEventListener('pointerdown', skip, true);
    document.addEventListener('keydown', skip, true);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') skip(); });
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})();
