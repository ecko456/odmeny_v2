/* ==========================================================================
   Zamčení
   ========================================================================== */
let lastActivity = Date.now();

async function lockApp(auto = false) {
  if (ui.locking) return;
  if (!auto && (store.dirty || store.saving) && !store.conflict) {
    await flushSave();
    if (store.dirty && !(await confirmBox('Neuložené změny', 'Poslední změny se nepodařilo uložit a po zamčení se ztratí. Přesto zamknout?', 'Zamknout', true))) return;
  } else if (store.dirty) {
    await Promise.race([flushSave(), new Promise(resolve => setTimeout(resolve, 5000))]);
  }
  if (prefStore.dirty) { clearTimeout(prefStore.timer); await Promise.race([flushPrefs(), new Promise(resolve => setTimeout(resolve, 3000))]); }
  ui.locking = true;
  S = null;
  await Vault.lock();
  location.reload();
}

function checkIdle() {
  const minutes = P.lockMinutes || 15;
  if (Date.now() - lastActivity > minutes * 60000) lockApp(true);
}

/* ==========================================================================
   Pomocníci vykreslení
   ========================================================================== */
function jmenW(n) { return n === 1 ? 'jméno' : n >= 2 && n <= 4 ? 'jména' : 'jmen'; }
function periodName2(p) { return p ? periodName(p) : 'bez docházky'; }
function meter(ratio, label) {
  return `<div class="meter"><div class="track"><div class="fill" data-w="${clamp(ratio * 100, 0, 100).toFixed(1)}"></div></div><div class="val">${label}</div></div>`;
}
function posOptions(sel, blankLabel) {
  return `<option value="">${esc(blankLabel || '— bez skupiny —')}</option>${S.positions.map(p => `<option value="${esc(p.id)}"${p.id === sel ? ' selected' : ''}>${esc(p.name || '(bez názvu)')}</option>`).join('')}`;
}
/* Dlaždice souhrnu. Od 2.59 volitelně pruh pokroku (bar 0–1) a štítek trendu (trend {pct, good, vs}). */
function statTile(label, value, note, tone = '', extra = null) {
  const x = extra || {};
  const trend = x.trend && Number.isFinite(x.trend.pct) ? trendChip(x.trend) : '';
  const bar = x.bar != null && Number.isFinite(x.bar) ? `<div class="stat-bar" aria-hidden="true"><i data-w="${clamp(x.bar * 100, 0, 100).toFixed(1)}"></i></div>` : '';
  return `<div class="stat${tone ? ` ${tone}` : ''}${bar ? ' has-bar' : ''}"><div class="k">${label}${trend}</div><div class="v">${value}</div>${bar}<div class="n">${note}</div></div>`;
}
/** Zelený / červený štítek změny proti minulému období („+12 %“). good = růst je dobře. */
function trendChip({ pct, good = true, vs = '' }) {
  const r = Math.round(pct * 10) / 10;
  const cls = r === 0 ? 'flat' : (r > 0) === good ? 'up' : 'down';
  const txt = `${r > 0 ? '+' : r < 0 ? '−' : '±'}${nf(Math.abs(r), Math.abs(r) < 10 ? 1 : 0)} %`;
  return `<span class="trend ${cls}" title="${esc(vs ? `Proti ${vs}` : 'Proti minulému období')}">${r > 0 ? '▲' : r < 0 ? '▼' : '•'} ${txt}</span>`;
}
/* Barevné pruhy po kategoriích (2.59): jeden skládaný pruh podílů a pod ním řádek za kategorii
   s vlastní barvou (--pie-1…6, pak šedá). items [{name, share (číslo pro podíl), v (hodnota řádku),
   text (popisek hodnoty), sub}]. Řádek je poměrně k největší hodnotě. */
function catBars(items, { title, sub = '', shareText = '' }) {
  const list = items.filter(x => x && x.name);
  if (list.length < 2) return '';
  const tot = list.reduce((a, x) => a + (x.share > 0 ? x.share : 0), 0);
  const max = Math.max(0, ...list.map(x => (x.v > 0 ? x.v : 0)));
  const col = i => (i < 6 ? `c${i + 1}` : 'co');
  const stack = tot > 0 ? `<div class="cat-stack" role="img" aria-label="${esc(shareText || title)}">${list.map((x, i) => (x.share > 0 ? `<i class="${col(i)}" data-w="${(x.share / tot * 100).toFixed(2)}" title="${esc(`${x.name}: ${nf(x.share / tot * 100, 1)} %`)}"></i>` : '')).join('')}</div>` : '';
  const rows = list.map((x, i) => `<div class="cat-row"><span class="cat-name"><i class="cat-sw ${col(i)}" aria-hidden="true"></i>${esc(x.name)}${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span>
    <span class="cat-track"><i class="${col(i)}" data-w="${max > 0 && x.v > 0 ? Math.max(1.5, x.v / max * 100).toFixed(1) : 0}"></i></span><b class="cat-val num">${x.text}</b></div>`).join('');
  return `<div class="card cat-card"><div class="card-head"><div><h3>${esc(title)}</h3>${sub ? `<p class="small muted">${sub}</p>` : ''}</div></div>${stack}${shareText ? `<p class="tiny muted cat-share">${esc(shareText)}</p>` : ''}<div class="cat-rows">${rows}</div></div>`;
}
/* Hladká křivka přes body (2.59, jen grafy v aplikaci; PDF beze změny): Catmull-Rom převedený na
   Bézierovy oblouky, kontrolní body omezené na rozsah úseku, takže křivka nepřekmitne nad ani pod body. */
function smoothPath(pts) {
  if (!pts.length) return '';
  const f = v => v.toFixed(1);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, clamp(p1[1] + (p2[1] - p0[1]) / 6, lo, hi)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, clamp(p2[1] - (p3[1] - p1[1]) / 6, lo, hi)];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}
/** Plocha pod křivkou (jemný přechod barvy řady). */
function smoothArea(pts, base) {
  if (pts.length < 2) return '';
  return `${smoothPath(pts)}L${pts[pts.length - 1][0].toFixed(1)} ${base}L${pts[0][0].toFixed(1)} ${base}Z`;
}
/** Místo pro najetí myší: svislá čárkovaná linka, zvýrazněný bod a průhledný obdélník s popiskem. */
function chartHover(x0, w, top, base, cx, cy, tip) {
  const dot = cy != null ? `<circle class="xd" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5"/>` : '';
  return `<g class="hp"><line class="xh" x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${top}" y2="${base}"/>${dot}<rect class="hit" x="${x0.toFixed(1)}" y="${top}" width="${w.toFixed(1)}" height="${(base - top).toFixed(1)}" tabindex="0" data-tip="${esc(tip)}"/></g>`;
}
function emptyState(title, text, action = '') {
  return `<div class="empty"><strong>${title}</strong><p>${text}</p>${action}</div>`;
}
async function xlsx() {
  if (!window.XLSX) await OdmLock.loadScript(`app.php?f=xlsx.js&v=${document.body.dataset.privateVersion || '1'}`);
  return window.XLSX;
}

function renderAll() {
  _prodIdx = null;
  renderPeriodBits();
  renderDemoBanner();
  renderWageAlert();
  renderOverview();
  renderPeople();
  renderSanctions();
  renderAttendance();
  renderProduction();
  renderSettings();
  renderMatrix();
  if (ui.view === 'profil') renderProfile();
  if (ui.view === 'top5') renderTop5(); else renderTop5Badge();
  if (ui.view === 'kontroly') renderKontroly(); else renderKtBadge();
  if (ui.view === 'domu') renderHome();
  if (ui.view === 'protokoly') renderLogbooks();
  if (ui.view === 'servis') renderService();
  if (ui.view === 'shortage') renderShortage();
  if (ui.view === 'audit') renderWorkAudit(); else renderWaBadge();
  if (ui.view === 'plankap') renderCapPlan();
  if (ui.view === 'rychla') renderQuick();
  if (ui.view === 'scan') renderScan();
  if (ui.view === 'konce') renderEnds();
  if (ui.view === 'ukoly') renderTasks(); else renderTaskBadge();
  renderTaskAlert();
  renderSaveState();
  renderLogBadge();
}

function showView(name) {
  if (name === 'pozice') { name = 'matice'; ui.mxTab = 'groups'; }   // dřívější část Pozice je v Matici dovedností
  if (name === 'matice' && !ui.mxTab) ui.mxTab = P.mxTab || 'matrix';
  if (name !== 'profil' && ui.view !== 'profil') ui.prevView = name;
  else if (name === 'profil' && ui.view !== 'profil') ui.prevView = ui.view;
  ui.view = name;
  if (name === 'profil') renderProfile();
  if (name === 'matice') renderMatrix();
  if (name === 'top5') renderTop5();
  if (name === 'kontroly') renderKontroly();
  if (name === 'domu') renderHome();
  if (name === 'protokoly') renderLogbooks();
  if (name === 'servis') renderService();
  if (name === 'shortage') renderShortage();
  if (name === 'audit') renderWorkAudit();
  if (name === 'plankap') renderCapPlan();
  if (name === 'rychla') renderQuick();
  if (name === 'scan') renderScan(); else scStop();   // kamera se mimo Rychlý scan vypne
  if (name === 'konce') renderEnds();
  if (name === 'ukoly') renderTasks();
  closeFab();
  $$('#nav [data-view]').forEach(button => button.setAttribute('aria-current', String(button.dataset.view === (name === 'vyroba' ? 'audit' : name))));
  $$('.view').forEach(view => view.classList.toggle('on', view.id === `view-${name}`));
  $('#main').dataset.view = name;
  document.body.dataset.view = name;
  $$(`#view-${name} .chips.t5-tabs`).forEach(showActiveChip);
  window.scrollTo({ top: 0, behavior: 'instant' });
  renderTaskAlert();
  if (name === 'nastaveni') loadSecurityLists();
  syncHistory();
}

