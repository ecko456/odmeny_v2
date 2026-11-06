'use strict';

/*
 * Úvodní animace zámku (2.55, od 2.57 ruka z částic): na temném pozadí se z částic v barvách
 * panelu složí ruka „inteligence“ (body propojené jako neuronová síť), rozevře dlaň a částice
 * odletí a postupně utvoří přihlašovací panel, který se z nich zhmotní.
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

  /* ------------------------------------------------------------ plná animace (2.57)
     Ruka „inteligence“ z částic v barvách panelu: částice se slétnou do sevřené ruky, ta se
     rozevře (prsty se natáhnou a rozprostřou, body jsou propojené jako neuronová síť) a pak
     částice odletí a postupně utvoří obrys a plochu přihlašovacího panelu, který se z nich
     zhmotní. */

  const T_FORM = 0.75;   // částice se slétnou do ruky
  const T_OPEN0 = 0.45;  // ruka se začne rozevírat
  const T_OPEN1 = 1.35;  // ruka je otevřená
  const T_FLY0 = 1.45;   // částice letí k panelu
  const T_FLY1 = 2.35;   // poslední dorazí
  const T_SHOW = 2.1;    // panel se začne zhmotňovat
  const T_END = 3.05;    // konec plátna

  /* barvy panelu: oranžový akcent, jeho světlejší tón, jantar, teplá bílá, tyrkys z pozadí */
  const COLORS = [[255, 122, 46, 40], [255, 145, 80, 24], [242, 176, 78, 16], [255, 222, 196, 15], [44, 213, 196, 5]];
  const ease = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const easeOut = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  const easeIo = x => { x = Math.min(1, Math.max(0, x)); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

  /* Ruka v jednotkách: dlaň kolem počátku, y dolů, výška dlaně 1. Prsty jsou úsečky od kloubu,
     úhel od svislice (záporný = doleva), délka; „pose“ 0 = sevřená, 1 = otevřená. */
  const FINGERS = [
    { bx: -0.37, by: -0.47, len: 0.72, w: 0.2, a0: 0.05, a1: -0.24 },
    { bx: -0.12, by: -0.52, len: 0.9, w: 0.21, a0: 0.02, a1: -0.08 },
    { bx: 0.13, by: -0.51, len: 0.84, w: 0.21, a0: -0.02, a1: 0.08 },
    { bx: 0.37, by: -0.44, len: 0.66, w: 0.19, a0: -0.05, a1: 0.25 },
    { bx: -0.47, by: 0.12, len: 0.62, w: 0.22, a0: -0.35, a1: -1.05, thumb: true },
  ];
  function inPalm(x, y) {
    // zaoblený obdélník dlaně a zápěstí
    if (y > 0.5 && y < 1.15) return Math.abs(x) < 0.33 - (y - 0.5) * 0.05;
    if (y < -0.5 || y > 0.5) return false;
    const hw = 0.5 - Math.max(0, y - 0.25) * 0.55;
    return Math.abs(x) < hw - (y < -0.38 ? (y + 0.38) * (y + 0.38) * 4 : 0);
  }
  function fingerAt(f, pose, t, s) {
    const a = f.a0 + (f.a1 - f.a0) * pose;
    const L = f.len * (0.5 + 0.5 * pose);
    // kloub prstu se při rozevření mírně ohne (oblouk), u sevřené ruky leží konec přes dlaň
    const bend = (1 - pose) * (f.thumb ? 0.5 : 0.9) * t;
    const ang = a + (f.thumb ? -bend : bend * Math.sign(-f.bx || 1) * 0.2);
    const dx = Math.sin(ang), dy = -Math.cos(ang);
    const w = f.w * (1 - 0.3 * t) / 2;
    return [f.bx + dx * L * t - dy * w * s, f.by + dy * L * t + dx * w * s + (1 - pose) * (f.thumb ? 0 : 0.18) * t];
  }

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
    const small = W < 640;

    // zářící body jako předkreslené obrázky (rychlé i při tisíci částicích)
    const sprites = COLORS.map(([r, g, b]) => {
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const x = c.getContext('2d');
      const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.18, `rgba(${r},${g},${b},0.95)`);
      gr.addColorStop(0.5, `rgba(${r},${g},${b},0.28)`);
      gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
      x.fillStyle = gr;
      x.fillRect(0, 0, 32, 32);
      return c;
    });
    const pickColor = () => {
      let v = Math.random() * 100;
      for (let i = 0; i < COLORS.length; i++) { v -= COLORS[i][3]; if (v <= 0) return i; }
      return 0;
    };

    // panel: obrys (zaoblený obdélník), hlavička a plocha; ruka stojí tam, kde bude panel
    const box = () => {
      const r = card.getBoundingClientRect();
      const top = Math.max(r.top, 8), bottom = Math.min(r.bottom, H - 8);
      return { x: r.left, y: top, w: r.width, h: Math.max(120, bottom - top), r: Math.min(30, r.width / 8), full: r };
    };
    let B = box();
    const hand = () => {
      const hs = Math.min(B.h * 0.36, H * 0.3, W * (small ? 0.34 : 0.22));
      return { cx: B.x + B.w / 2, cy: B.y + B.h * 0.52, s: hs };
    };
    function rectPoint(u) {
      // bod na obvodu zaobleného obdélníku, u ∈ [0, 1)
      const { x, y, w, h, r } = B;
      const seg = [w - 2 * r, Math.PI * r / 2, h - 2 * r, Math.PI * r / 2, w - 2 * r, Math.PI * r / 2, h - 2 * r, Math.PI * r / 2];
      let d = u * seg.reduce((a, b) => a + b, 0);
      const arc = (cx, cy, a0, t) => [cx + r * Math.cos(a0 + t * Math.PI / 2), cy + r * Math.sin(a0 + t * Math.PI / 2)];
      for (let i = 0; i < 8; i++) {
        if (d <= seg[i] || i === 7) {
          const t = seg[i] ? d / seg[i] : 0;
          switch (i) {
            case 0: return [x + r + t * (w - 2 * r), y];
            case 1: return arc(x + w - r, y + r, -Math.PI / 2, t);
            case 2: return [x + w, y + r + t * (h - 2 * r)];
            case 3: return arc(x + w - r, y + h - r, 0, t);
            case 4: return [x + w - r - t * (w - 2 * r), y + h];
            case 5: return arc(x + r, y + h - r, Math.PI / 2, t);
            case 6: return [x, y + h - r - t * (h - 2 * r)];
            default: return arc(x + r, y + r, Math.PI, t);
          }
        }
        d -= seg[i];
      }
      return [x, y];
    }

    // částice: kde v ruce leží (dlaň nebo prst s parametry), odkud přiletí a kam v panelu míří
    const N = small ? 620 : 1050;
    const parts = [];
    for (let i = 0; i < N; i++) {
      let kind, fx = 0, fy = 0, fi = 0, t = 0, s = 0;
      if (i < N * 0.42) {
        kind = 'palm';
        do { fx = (Math.random() - 0.5) * 1.05; fy = -0.52 + Math.random() * 1.65; } while (!inPalm(fx, fy));
        // víc bodů u okraje dlaně = čitelnější obrys
        if (Math.random() < 0.35) { for (let k = 0; k < 6 && inPalm(fx * 1.06, fy); k++) fx *= 1.06; }
      } else {
        kind = 'finger';
        fi = Math.floor(Math.random() * FINGERS.length);
        t = Math.pow(Math.random(), 0.8);
        s = Math.random() < 0.45 ? (Math.random() < 0.5 ? -1 : 1) * (0.85 + Math.random() * 0.15) : Math.random() * 2 - 1;
      }
      const u = i / N;
      const slot = Math.random();
      parts.push({
        kind, fx, fy, fi, t, s, c: pickColor(), size: (small ? 2.2 : 2.6) + Math.random() * 2.4,
        a: 0.55 + Math.random() * 0.45, tw: Math.random() * Math.PI * 2,
        // start: rozptýlené po obrazovce, pomalý drift
        sx: Math.random(), sy: Math.random(),
        // cíl v panelu: 58 % obrys, 12 % hlavička (linka pod logem), zbytek plocha
        dest: slot < 0.58 ? { k: 'edge', u: (u * 7.31 + Math.random() * 0.002) % 1 } : slot < 0.7 ? { k: 'head', u: Math.random() } : { k: 'fill', u: Math.random(), v: Math.random() },
        delay: Math.random() * 0.28,
        x: 0, y: 0,
      });
    }
    function handPos(p, pose, tm, hd) {
      let x, y;
      if (p.kind === 'palm') { x = p.fx; y = p.fy; }
      else [x, y] = fingerAt(FINGERS[p.fi], pose, p.t, p.s);
      // jemné dýchání a pootočení ruky při rozevírání
      const rot = (1 - pose) * 0.18 - 0.04 + Math.sin(tm * 1.6) * 0.015;
      const cs = Math.cos(rot), sn = Math.sin(rot);
      const k = hd.s * (0.92 + 0.08 * pose);
      return [hd.cx + (x * cs - y * sn) * k, hd.cy + (x * sn + y * cs) * k];
    }
    function destPos(p) {
      const d = p.dest;
      if (d.k === 'edge') return rectPoint(d.u);
      if (d.k === 'head') return [B.x + 26 + d.u * (B.w - 52), B.y + Math.min(86, B.h * 0.2)];
      return [B.x + 18 + d.u * (B.w - 36), B.y + 18 + d.v * (B.h - 36)];
    }

    // sousedé pro „neuronovou síť“ spočítaní jednou v otevřené ruce (kreslí se jen čáry mezi nimi)
    const links = [];
    {
      const hd0 = { cx: 0, cy: 0, s: 100 };
      const pts = parts.map(p => handPos(p, 1, 0, hd0));
      const cell = 14, grid = new Map();
      pts.forEach(([x, y], i) => { const k = `${Math.floor(x / cell)},${Math.floor(y / cell)}`; (grid.get(k) || grid.set(k, []).get(k)).push(i); });
      const maxL = small ? 700 : 1300;
      for (let i = 0; i < pts.length && links.length < maxL; i += 1) {
        if (Math.random() > 0.55) continue;
        const [x, y] = pts[i], gx = Math.floor(x / cell), gy = Math.floor(y / cell);
        let best = null, bd = 1e9;
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
          for (const j of grid.get(`${gx + ox},${gy + oy}`) || []) {
            if (j <= i) continue;
            const d = (pts[j][0] - x) ** 2 + (pts[j][1] - y) ** 2;
            if (d > 25 && d < bd) { bd = d; best = j; }
          }
        }
        if (best != null && bd < cell * cell) links.push([i, best, Math.random()]);
      }
    }

    let t0 = 0;
    function frame(now) {
      if (ended) return;
      if (!t0) t0 = now;
      const t = (now - t0) / 1000;
      if (t < T_FLY0) B = box();
      const hd = hand();
      const pose = easeIo((t - T_OPEN0) / (T_OPEN1 - T_OPEN0));

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      // temné pozadí: odchází, až se panel zhmotní
      const dim = t < T_SHOW ? Math.min(1, t / 0.2) : Math.max(0, 1 - (t - T_SHOW) / 0.7);
      if (dim > 0) {
        ctx.fillStyle = `rgba(5,6,9,${0.9 * dim})`;
        ctx.fillRect(0, 0, W, H);
        // tlumená záře pod rukou
        const g = ctx.createRadialGradient(hd.cx, hd.cy, 0, hd.cx, hd.cy, hd.s * 2.4);
        g.addColorStop(0, `rgba(255,110,30,${0.13 * dim * (0.5 + 0.5 * pose)})`);
        g.addColorStop(1, 'rgba(255,110,30,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      // poloha částic
      const formK = easeOut(t / T_FORM);
      for (const p of parts) {
        const [hx, hy] = handPos(p, pose, t, hd);
        if (t < T_FLY0) {
          const sx = p.sx * W + Math.sin(t * 0.9 + p.tw) * 12, sy = p.sy * H + Math.cos(t * 0.7 + p.tw) * 12;
          const k = Math.min(1, Math.max(0, (formK - p.delay * 0.6) / (1 - p.delay * 0.6)));
          p.x = sx + (hx - sx) * easeOut(k); p.y = sy + (hy - sy) * easeOut(k);
          p.hx = hx; p.hy = hy;
        } else {
          const k = easeIo((t - T_FLY0 - p.delay) / (T_FLY1 - T_FLY0 - 0.28));
          const [dx, dy] = destPos(p);
          // oblouk letu: střed dráhy vybočí do strany podle polohy v ruce
          const mx = (p.hx + dx) / 2 + (p.hy - dy) * 0.18, my = (p.hy + dy) / 2 - (p.hx - dx) * 0.12;
          const u = 1 - k;
          p.x = u * u * p.hx + 2 * u * k * mx + k * k * dx;
          p.y = u * u * p.hy + 2 * u * k * my + k * k * dy;
          p.k = k;
        }
      }

      // síť: čáry mezi sousedy, nejvýraznější v otevřené ruce, při letu mizí
      const net = (t < T_FLY0 ? formK * (0.35 + 0.65 * pose) : Math.max(0, 1 - (t - T_FLY0) / 0.45)) * dim;
      if (net > 0.02) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = small ? 0.6 : 0.7;
        ctx.beginPath();
        for (const [i, j] of links) { ctx.moveTo(parts[i].x, parts[i].y); ctx.lineTo(parts[j].x, parts[j].y); }
        ctx.strokeStyle = `rgba(255,150,90,${0.22 * net})`;
        ctx.stroke();
        // vzruchy: pár spojů se rozsvítí jako signál v síti
        ctx.beginPath();
        for (const [i, j, ph] of links) {
          const pulse = Math.sin(t * 5 + ph * 40);
          if (pulse < 0.93) continue;
          ctx.moveTo(parts[i].x, parts[i].y); ctx.lineTo(parts[j].x, parts[j].y);
        }
        ctx.strokeStyle = `rgba(255,220,180,${0.75 * net})`;
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }

      // body
      ctx.globalCompositeOperation = 'lighter';
      const fade = t < T_FLY1 ? 1 : Math.max(0, 1 - (t - T_FLY1) / (T_END - T_FLY1));
      for (const p of parts) {
        let a = p.a * (0.75 + 0.25 * Math.sin(t * 3 + p.tw)) * fade;
        if (t < T_FLY0) a *= 0.25 + 0.75 * formK;
        else if (p.dest.k === 'fill') a *= 1 - 0.6 * (p.k || 0);
        if (a <= 0.01) continue;
        const sz = p.size * (t >= T_FLY0 && p.dest.k === 'edge' ? 1 + 0.4 * (p.k || 0) : 1);
        ctx.globalAlpha = a;
        ctx.drawImage(sprites[p.c], p.x - sz * 2, p.y - sz * 2, sz * 4, sz * 4);
      }
      ctx.globalAlpha = 1;
      // obrys panelu se rozsvítí, když ho částice dotvoří
      if (t > T_FLY1 - 0.4) {
        const q = Math.min(1, (t - (T_FLY1 - 0.4)) / 0.4) * fade;
        ctx.strokeStyle = `rgba(255,150,80,${0.55 * q})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(B.x, B.y, B.w, B.h, B.r) : ctx.rect(B.x, B.y, B.w, B.h);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';

      if (t >= T_SHOW) reveal();
      if (t >= T_END) { stop(); return; }
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
    // přeskočení ukáže panel hned: skládání by kliku pod prstem uhnulo
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
