/* Pozadí přihlašovací stránky (2.60): pomalu se přelévající barevná pole (tmavá, oranžová,
   teplá bílá) se zrnem, kreslená WebGL shaderem na celou plochu za panelem zámku.
   - Plátno je uvnitř #lock: po odemčení se #lock odstraní a kreslení se samo zastaví.
   - „Omezit pohyb“ = jeden stojící snímek; skrytá karta = pauza; bez WebGL zůstane CSS pozadí.
   - Kreslí se v rozlišení displeje (nejvýš 2×), jen jedna plocha, výkon to nezatíží.
   Inspirace: ukázka „Shader R“, kterou poslal uživatel (Gaussova barevná pole v deformovaném
   prostoru). Barvy jsou z tokenů vzhledu Sklo. */
(function () {
  'use strict';
  const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FRAG = [
    'precision highp float;',
    'uniform vec2 res;uniform float t;uniform vec3 cW,cD,cO;',
    'float wt(vec2 p,vec2 c,float w){vec2 d=p-c;return exp(-dot(d,d)/w);}',
    'float nz(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}',
    'void main(){',
    '  vec2 uv=gl_FragCoord.xy/res;',
    '  float asp=res.x/res.y;',
    '  vec2 p=uv;',
    '  float s=t*.48;',
    '  p+=.65*.12*vec2(sin(p.y*5.+s),cos(p.x*4.-s*.8));',
    '  vec2 a=vec2(.44+.25*(cos(s+1.3)-cos(1.3)),.88+.4*(sin(s+1.3)-sin(1.3)));',
    '  vec2 b=vec2(.75+.1*sin(s),.16+.6*sin(s));',
    '  vec2 c=vec2(.9+.1*sin(s),.86-.65*sin(s));',
    '  vec2 d=vec2(.12+.16*sin(s*.8),.12+.17*cos(s));',
    '  vec4 w=vec4(2.8*wt(p,c,.13)+1.4*wt(p,vec2(-.12,1.15),.065),wt(p,d,.2),wt(p,b,.1),wt(p,a,.09));',
    '  vec3 col=(cD*w.x+cO*(w.y+w.z)+cW*w.w)/dot(w,vec4(1.));',
    '  col=(col-.5)*1.08+.5;',
    '  col+=(nz(gl_FragCoord.xy)-.5)*.4*.18;',
    '  gl_FragColor=vec4(clamp(col,0.,1.),1.);',
    '}'].join('\n');
  // teplá bílá místo čisté (panel je skleněný, čistá bílá za ním by bila do očí), oranžová akcentu
  const COLORS = { cW: [0.96, 0.92, 0.88], cD: [0.063, 0.063, 0.063], cO: [1.0, 0.475, 0.0] };
  // rozlišení kreslení: plné rozlišení displeje, na ostrých displejích nejvýš 2× (2.60.1)
  const scale = () => Math.min(window.devicePixelRatio || 1, 2);

  function start() {
    const lock = document.getElementById('lock');
    if (!lock || !window.WebGLRenderingContext) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'lock-bg';
    canvas.setAttribute('aria-hidden', 'true');
    let gl = null;
    try { gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false }); } catch (error) { gl = null; }
    if (!gl) return;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const at = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    const u = {}; ['res', 't', 'cW', 'cD', 'cO'].forEach(k => { u[k] = gl.getUniformLocation(prog, k); });
    Object.keys(COLORS).forEach(k => gl.uniform3fv(u[k], COLORS[k]));

    lock.insertBefore(canvas, lock.firstChild);
    document.documentElement.classList.add('lock-bg-on');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let time = 7.5, last = 0, frame = 0, lost = false;
    const state = { frames: 0, running: false };
    function draw() {
      if (lost) return;
      const k = scale();
      const w = Math.max(1, Math.round(canvas.clientWidth * k)), h = Math.max(1, Math.round(canvas.clientHeight * k));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(u.res, w, h);
      gl.uniform1f(u.t, time);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      state.frames += 1;
    }
    function stop() { if (frame) cancelAnimationFrame(frame); frame = 0; last = 0; state.running = false; }
    function tick(now) {
      frame = 0;
      if (!canvas.isConnected) { cleanup(); return; }
      if (last) time += Math.min((now - last) / 1000, 0.1);
      last = now;
      draw();
      schedule();
    }
    function schedule() {
      if (frame || lost || !canvas.isConnected || document.hidden || reduced.matches) { state.running = !!frame; return; }
      frame = requestAnimationFrame(tick);
      state.running = true;
    }
    function refresh() { stop(); if (canvas.isConnected) { draw(); schedule(); } }
    function cleanup() {
      stop();
      document.removeEventListener('visibilitychange', refresh);
      reduced.removeEventListener('change', refresh);
      window.removeEventListener('resize', refresh);
      document.documentElement.classList.remove('lock-bg-on');
      try { gl.deleteBuffer(buf); gl.deleteProgram(prog); gl.deleteShader(vs); gl.deleteShader(fs); const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (error) { /* nic */ }
    }
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true; stop(); });
    canvas.addEventListener('webglcontextrestored', () => { lost = false; refresh(); });
    document.addEventListener('visibilitychange', refresh);
    reduced.addEventListener('change', refresh);
    window.addEventListener('resize', refresh);
    // po odemčení lock.js #lock odstraní: zachytí to tick, ale při pauze (skrytá karta) i tohle
    new MutationObserver((list, obs) => { if (!canvas.isConnected) { obs.disconnect(); cleanup(); } }).observe(document.body, { childList: true });
    window.OdmLockBg = state;
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
