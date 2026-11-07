/* ==========================================================================
   TOP 5: PDF pro auditora (týdenní report, souhrn, jeden případ)
   Vzniká v prohlížeči z dešifrovaných dat, server obsah nevidí.
   ========================================================================== */
async function newPdf(orientation = 'portrait', opts = {}) {
  await pdfLib();
  const [regular, semibold, mono, monoBold] = await Promise.all([pdfAsset('pdf-regular.ttf'), pdfAsset('pdf-semibold.ttf'),
    ...(opts.mono ? [pdfAsset('pdf-mono.ttf'), pdfAsset('pdf-mono-semibold.ttf')] : [])]);
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation, compress: true });
  doc.addFileToVFS('Plex-Regular.ttf', regular);
  doc.addFont('Plex-Regular.ttf', 'Plex', 'normal');
  doc.addFileToVFS('Plex-SemiBold.ttf', semibold);
  doc.addFont('Plex-SemiBold.ttf', 'Plex', 'bold');
  // Plex Mono jen pro PDF, která ho kreslí (report kapacit a zaškolení podle vzoru), ostatní zůstanou menší
  if (opts.mono) {
    doc.addFileToVFS('PlexMono-Medium.ttf', mono);
    doc.addFont('PlexMono-Medium.ttf', 'PlexMono', 'normal');
    doc.addFileToVFS('PlexMono-SemiBold.ttf', monoBold);
    doc.addFont('PlexMono-SemiBold.ttf', 'PlexMono', 'bold');
  }
  return doc;
}

/** Sada kreslicích funkcí nad jsPDF. k.dry = jen měří výšku (bez kreslení a bez zalomení stránky). */
function pdfKit(doc) {
  const land = doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight();   // A4 na šířku (KPI)
  const k = { doc, W: land ? 297 : 210, H: land ? 210 : 297, M: 16, y: 16, dry: false, onPage: null };
  k.CW = k.W - 2 * k.M;
  k.BOTTOM = k.H - 20;
  k.PAGE = k.BOTTOM - k.M;
  const C = k.C = {
    ink: [27, 31, 29], ink2: [85, 92, 88], ink3: [133, 139, 134], line: [222, 221, 212], line2: [198, 196, 184],
    soft: [243, 242, 236], soft3: [232, 230, 221], acc: [14, 107, 93], accSoft: [220, 235, 230], white: [255, 255, 255],
    good: [46, 125, 70], goodSoft: [223, 238, 227], warn: [156, 106, 18], warnSoft: [244, 234, 212],
    crit: [176, 57, 43], critSoft: [246, 225, 221], wk: [106, 87, 166], wkSoft: [232, 227, 244],
  };
  k.TONE = { new: [C.warnSoft, C.warn], act: [C.accSoft, C.acc], v1: [C.wkSoft, C.wk], v2: [C.wkSoft, C.wk], ok: [C.goodSoft, C.good],
    fail: [C.critSoft, C.crit], late: [C.critSoft, C.crit], zrus: [C.soft3, C.ink3], none: [C.warnSoft, C.warn], plain: [C.soft3, C.ink2] };
  const mm = pt => pt * 0.3528;
  k.mm = mm;
  k.LH = (size, f = 1.32) => mm(size) * f;
  k.font = (size, bold = false, color = C.ink) => { doc.setFont('Plex', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color); };
  k.text = (s, x, top, size, o = {}) => { if (k.dry) return; k.font(size, o.bold, o.color || C.ink); doc.text(String(s), x, top + mm(size) * 0.92, { align: o.align || 'left', charSpace: o.space || 0 }); };
  k.mid = (s, x, cy, size, o = {}) => { if (k.dry) return; k.font(size, o.bold, o.color || C.ink); doc.text(String(s), x, cy + mm(size) * 0.35, { align: o.align || 'left' }); };
  k.split = (s, w, size, bold = false) => { k.font(size, bold); const t = String(s == null ? '' : s).replace(/\s+\n/g, '\n'); return t ? doc.splitTextToSize(t, w) : ['']; };
  k.width = (s, size, bold = false) => { k.font(size, bold); return doc.getTextWidth(String(s)); };
  k.box = (color, x, top, w, h, r = 0) => {
    if (k.dry || w <= 0 || h <= 0) return;
    doc.setFillColor(...color);
    if (r) doc.roundedRect(x, top, w, h, Math.min(r, w / 2, h / 2), Math.min(r, w / 2, h / 2), 'F');
    else doc.rect(x, top, w, h, 'F');
  };
  k.hline = (at, color = C.line, lw = 0.2, x1 = k.M, x2 = k.M + k.CW, dash = null) => {
    if (k.dry) return;
    doc.setDrawColor(...color); doc.setLineWidth(lw);
    if (dash) doc.setLineDashPattern(dash, 0);
    doc.line(x1, at, x2, at);
    if (dash) doc.setLineDashPattern([], 0);
  };
  /** Štítek stavu; vrací šířku. */
  k.pill = (label, x, cy, tone, size = 7.4, align = 'left') => {
    const [bg, fg] = k.TONE[tone] || k.TONE.plain;
    const w = k.width(label, size, true) + 4.4;
    const x0 = align === 'right' ? x - w : x;
    k.box(bg, x0, cy - 2.3, w, 4.6, 2.3);
    k.mid(label, x0 + 2.2, cy, size, { bold: true, color: fg });
    return w;
  };
  /** Zaškrtávací políčko: splněno = zelené se značkou, po termínu = červený rámeček. */
  k.check = (x, cy, done, late) => {
    if (k.dry) return;
    const s = 3.1;
    if (done) {
      doc.setFillColor(...C.good); doc.roundedRect(x, cy - s / 2, s, s, 0.6, 0.6, 'F');
      doc.setDrawColor(...C.white); doc.setLineWidth(0.45);
      doc.line(x + 0.7, cy + 0.05, x + 1.3, cy + 0.7); doc.line(x + 1.3, cy + 0.7, x + 2.45, cy - 0.75);
    } else {
      doc.setDrawColor(...(late ? C.crit : C.line2)); doc.setLineWidth(0.35);
      doc.roundedRect(x, cy - s / 2, s, s, 0.6, 0.6, 'S');
    }
  };
  k.dot = (x, cy, r, fill, stroke) => {
    if (k.dry) return;
    if (fill) doc.setFillColor(...fill);
    if (stroke) { doc.setDrawColor(...stroke); doc.setLineWidth(0.45); }
    doc.circle(x, cy, r, fill && stroke ? 'FD' : fill ? 'F' : 'S');
  };
  k.newPage = () => { doc.addPage(); k.y = k.M; if (k.onPage) k.onPage(); };
  k.need = h => { if (k.dry) return false; if (k.y + h > k.BOTTOM) { k.newPage(); return true; } return false; };
  k.measure = fn => { const y = k.y; const was = k.dry; k.dry = true; k.y = 0; fn(); const h = k.y; k.y = y; k.dry = was; return h; };
  /** Blok se nerozdělí, když se vejde na stránku; jinak začne na nové, pokud zbývá málo místa. */
  k.keep = (fn, min = 40) => {
    const h = k.measure(fn);
    if (k.y + h > k.BOTTOM && (h <= k.PAGE || k.BOTTOM - k.y < min)) k.newPage();
    fn();
  };
  /** Odstavec s řádkovým zalomením přes stránky. */
  k.para = (s, x, w, size, o = {}) => {
    const lines = k.split(s, w, size, o.bold);
    const lh = k.LH(size, o.lh || 1.38);
    lines.forEach(line => { k.need(lh); k.text(line, x, k.y, size, o); k.y += lh; });
  };
  k.header = ({ eyebrow, plain = false, right, title, sub, meta }) => {
    // plain: nadpis nad titulkem normálním písmem, bez prostrkání (Top 5)
    k.text(eyebrow, k.M, k.y, plain ? 9 : 7.5, { bold: true, color: C.acc, space: plain ? 0 : 0.35 });
    if (right) k.text(right, k.M + k.CW, k.y, 8.5, { color: C.ink2, align: 'right' });
    k.y += 7.5;
    k.split(title, k.CW, 20, true).forEach(line => { k.text(line, k.M, k.y, 20, { bold: true }); k.y += mm(20) * 1.2; });
    k.y += 1;
    if (sub) { k.text(sub, k.M, k.y, 11.5, { bold: true, color: C.ink2 }); k.y += mm(11.5) * 1.5; }
    if (meta) { k.para(meta, k.M, k.CW * 0.85, 9, { color: C.ink2 }); }
    k.y += 2.5;
    if (!k.dry) { doc.setDrawColor(...C.acc); doc.setLineWidth(0.7); doc.line(k.M, k.y, k.M + 28, k.y); }
    k.y += 7;
  };
  k.tiles = list => {
    const gap = 4, n = list.length, tw = (k.CW - gap * (n - 1)) / n, th = 20;
    list.forEach(([label, value, note, tone], i) => {
      const x = k.M + i * (tw + gap);
      k.box(C.soft, x, k.y, tw, th, 2.4);
      if (tone) k.box(tone === 'crit' ? C.crit : tone === 'good' ? C.good : C.acc, x, k.y + 3, 0.9, th - 6);
      k.text(label, x + 4, k.y + 3.2, 7.8, { color: C.ink2 });
      k.text(value, x + 4, k.y + 7.4, 15, { bold: true, color: tone === 'crit' ? C.crit : C.ink });
      if (note) k.text(k.split(note, tw - 7, 7)[0], x + 4, k.y + 14.4, 7, { color: C.ink3 });
    });
    k.y += th + 7;
  };
  k.heading = (t, size = 12.5) => { k.text(t, k.M, k.y, size, { bold: true }); k.y += mm(size) * 1.25 + 2.4; };
  k.signoff = () => {
    const sw = (k.CW - 12) / 3;
    ['Zpracovatel', 'Datum', 'Podpis'].forEach((label, i) => {
      const x = k.M + i * (sw + 6);
      k.hline(k.y + 10, C.line2, 0.3, x, x + sw);
      k.text(label, x, k.y + 11.6, 8, { color: C.ink3 });
    });
    k.y += 22;
  };
  // per(i, pages) → { left, right }: vlastní text a číslování stran (Shortage po odděleních)
  k.footer = (left, per = null) => {
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i += 1) {
      doc.setPage(i);
      const f = per ? per(i, pages) : { left, right: `Strana ${i} / ${pages}` };
      doc.setDrawColor(...C.line); doc.setLineWidth(0.2); doc.line(k.M, k.H - 13.5, k.M + k.CW, k.H - 13.5);
      k.font(7.5, false, C.ink3);
      doc.text(f.left, k.M, k.H - 11.5 + mm(7.5) * 0.92);
      doc.text(f.right, k.M + k.CW, k.H - 11.5 + mm(7.5) * 0.92, { align: 'right' });
    }
  };
  return k;
}

const pdfH = min => `${nf((+min || 0) / 60, 1)} h`;
const pdfPct = v => (v == null ? '—' : `${nf(v, 1)} %`);
function lidiW(n) { return n === 1 ? 'pracovník' : n >= 2 && n <= 4 ? 'pracovníci' : 'pracovníků'; }

/* ---------- společné části: pole, opatření, ověření, kolo ---------- */
const PDF_LX = 42; // šířka sloupce popisků

function pdfLabel(k, label) { k.text(label, k.M, k.y + 0.4, 7.8, { bold: true, color: k.C.ink2 }); }

function pdfField(k, label, text, o = {}) {
  const lines = k.split(text, k.CW - PDF_LX, 9, o.bold);
  const lh = k.LH(9, 1.36);
  k.need(lh + 1);
  pdfLabel(k, label);
  lines.forEach((line, i) => { if (i) k.need(lh); k.text(line, k.M + PDF_LX, k.y, 9, { color: o.color || k.C.ink, bold: o.bold }); k.y += lh; });
  k.y += 2.2;
}

function pdfActions(k, label, actions, kind, today) {
  const X = k.M + PDF_LX;
  const W = k.CW - PDF_LX;
  const cols = kind === 'process' ? [5, W - 5 - 30 - 21 - 25, 30, 21, 25] : [5, W - 5 - 30 - 25, 30, 25];
  const lh = k.LH(8.8, 1.32);
  if (!actions.length) { pdfField(k, label, 'žádná', { color: k.C.ink3 }); return; }
  k.need(lh * 2 + 5);
  pdfLabel(k, label);
  const heads = kind === 'process' ? ['', 'Opatření', 'Odpovídá', 'Termín', 'Stav'] : ['', 'Opatření', 'Odpovídá', 'Stav'];
  let x = X;
  heads.forEach((t, i) => { if (t) k.text(t, x, k.y, 6.8, { bold: true, color: k.C.ink3 }); x += cols[i]; });
  k.y += 3.8;
  actions.forEach(a => {
    const late = !a.done && a.due && a.due < today;
    const tl = k.split(a.text, cols[1] - 2, 8.8);
    const ol = k.split(a.owner || '—', cols[2] - 2, 8.2);
    const h = Math.max(tl.length, ol.length) * lh + 1.8;
    k.need(h);
    k.check(X + 0.4, k.y + lh / 2 - 0.15, !!a.done, late);
    tl.forEach((line, i) => k.text(line, X + cols[0], k.y + i * lh, 8.8));
    let xx = X + cols[0] + cols[1];
    ol.forEach((line, i) => k.text(line, xx, k.y + i * lh, 8.2, { color: k.C.ink2 }));
    xx += cols[2];
    if (kind === 'process') { k.text(a.due ? dayText(a.due) : '—', xx, k.y, 8.2, { color: late ? k.C.crit : k.C.ink2, bold: !!late }); xx += cols[3]; }
    k.text(a.done ? `splněno ${dayText(a.done)}` : late ? 'po termínu' : 'otevřené', xx, k.y, 8.2, { color: a.done ? k.C.good : late ? k.C.crit : k.C.ink3, bold: !a.done && !!late });
    k.y += h;
  });
  k.y += 1.4;
}

function pdfVerify(k, r, today) {
  const p = roundPlan(r);
  const lh = k.LH(8.8, 1.34);
  const rows = [0, 1].map(idx => {
    const v = r.v[idx];
    const rule = idx ? `${r.d2} dní po 1. ověření` : `${r.d1} dní po dokončení opatření`;
    if (v) {
      const measured = v.eff == null ? `bez hodnot za ${dayText(v.from, false)}–${dayText(v.to)}` : `plnění ${nf(v.eff, 1)} % (strávený čas ${pdfH(v.nspent)}, norma ${pdfH(v.norm)}) za ${dayText(v.from, false)}–${dayText(v.to)}${v.src === 'manual' ? ', zapsáno ručně' : v.src === 'import' ? ', z evidence práce' : ''}`;
      return { tone: v.result === 'ok' ? 'ok' : 'fail', tag: v.result === 'ok' ? 'účinné' : 'neúčinné', text: `${idx + 1}. ověření ${dayText(v.done)}${v.plan && v.plan !== v.done ? ` (plán ${dayText(v.plan)})` : ''}: ${measured}${v.note ? `. ${v.note}` : ''}${v.by ? ` · ${v.by}` : ''}` };
    }
    const due = idx ? p.p2 : p.p1;
    const why = idx ? r.p2why : r.p1why;
    if (due) return { tone: due < today ? 'late' : idx ? 'v2' : 'v1', tag: due < today ? 'po termínu' : 'plánováno', text: `${idx + 1}. ověření ${dayText(due)} (${(idx ? r.p2 : r.p1) ? `posunuto${why ? `: ${why}` : ''}` : rule})` };
    return { tone: 'plain', tag: 'čeká', text: `${idx + 1}. ověření se naplánuje ${idx ? 'po účinném 1. ověření' : 'po dokončení všech opatření'} (${rule})` };
  });
  k.need(lh * 2 + 4);
  pdfLabel(k, 'Ověření účinnosti');
  rows.forEach(row => {
    const tw = k.width(row.tag, 7.2, true) + 4.4;
    const lines = k.split(row.text, k.CW - PDF_LX - tw - 3, 8.8);
    k.need(lines.length * lh + 1.4);
    k.pill(row.tag, k.M + PDF_LX, k.y + lh / 2 - 0.1, row.tone, 7.2);
    lines.forEach((line, i) => k.text(line, k.M + PDF_LX + tw + 3, k.y + i * lh, 8.8));
    k.y += lines.length * lh + 1.4;
  });
  k.y += 1.6;
}

function pdfRound(k, c, r, today) {
  const acts = liveActions(r);
  if (r.reason) pdfField(k, 'Proč znovu', r.reason, { color: k.C.warn });
  pdfField(k, 'Proč se to stalo', `${r.cat ? `${effCatLabel(r.cat)}: ` : ''}${r.cause || 'nevyplněno'}`, { color: r.cause ? k.C.ink : k.C.ink3 });
  pdfField(k, 'Co s tím jde dělat', r.options || 'nevyplněno', { color: r.options ? k.C.ink : k.C.ink3 });
  pdfActions(k, 'Co jde udělat hned', acts.filter(a => a.kind === 'now'), 'now', today);
  pdfActions(k, 'Procesní čas', acts.filter(a => a.kind === 'process'), 'process', today);
  pdfVerify(k, r, today);
}

/** Stručné shrnutí uzavřeného kola (do týdenního reportu). */
function roundBrief(r) {
  const acts = liveActions(r);
  const v = r.v.map((x, i) => `${i + 1}. ověření ${dayText(x.done)} ${x.result === 'ok' ? 'účinné' : 'neúčinné'}${x.eff != null ? ` (${nf(x.eff, 1)} %)` : ''}`);
  return `Kolo ${r.n} (od ${dayText(todayIso(r.at))}): ${r.cat ? `${effCatLabel(r.cat)}: ` : ''}${(r.cause || 'příčina nevyplněna').trim().replace(/[.\s]+$/, '')}. Opatření: ${acts.length ? acts.map(a => a.text).join('; ') : 'žádná'}. ${v.length ? `${v.join(', ')}.` : 'Bez ověření.'}`;
}

function pdfBand(k, left, right, tone, h = 10.5) {
  k.box(k.C.soft, k.M, k.y, k.CW, h);
  k.box(k.C.acc, k.M, k.y, 1.3, h);
  const rw = right ? k.width(right, 7.4, true) + 4.4 : 0;
  const lines = k.split(left, k.CW - rw - 12, 11, true).slice(0, 2);
  lines.forEach((line, i) => k.mid(line, k.M + 5, k.y + h / 2 + (i - (lines.length - 1) / 2) * k.LH(11, 1.15), 11, { bold: true }));
  if (right) k.pill(right, k.M + k.CW - 3.5, k.y + h / 2, tone, 7.4, 'right');
  k.y += h + 3;
}

const T5_EYEBROW = 'Top 5 nejméně efektivně';

/* ---------- týdenní report ---------- */
function drawWeekReport(doc, rep) {
  const k = pdfKit(doc);
  const d = rep.data;
  const today = todayIso(rep.at);
  const w = weekById(rep.week);
  const cases = new Map(d.cases.map(c => [c.id, c]));
  const sum = d.summary || {};
  k.header({ eyebrow: T5_EYEBROW, plain: true, right: `Revize ${rep.rev}`,
    title: 'Týdenní report', sub: weekLong(rep.week),
    meta: `Vydáno ${tsText(rep.at)}${rep.by ? ` · ${rep.by}` : ''}. ${d.src === 'import'
      ? `Hodnoty z evidence práce (jen řádky s časem i normou), díly pod 100 % s aspoň ${nf(d.settings.min / 60, 2)} h práce v týdnu; pod normou ${d.under} z ${d.items} dílů.`
      : 'Strávený čas a norma dílu za týden podle zápisu vedoucího.'} Plnění = norma ÷ strávený čas, neplnění = 100 % − plnění, ztráta = strávený čas nad normou. Pořadí od nejnižšího plnění.` });
  const worst = d.top[0];
  k.tiles([
    ['Plnění Top 5', pdfPct(d.tot.eff), `norma ${pdfH(d.tot.norm)} z ${pdfH(d.tot.nspent)} práce`],
    ['Nejhorší plnění', worst ? pdfPct(worst.eff) : '—', worst ? `EAN ${worst.ean}` : 'nic zapsáno', worst && worst.eff < 50 ? 'crit' : ''],
    ['Ztráta Top 5', pdfH(d.tot.lost), 'strávený čas nad normou', d.tot.lost ? 'crit' : ''],
    ['Rozpracované případy', String((sum.open || 0) + (sum.verify || 0) + (sum.fail || 0)), sum.late ? `${sum.late} po termínu` : 'nic po termínu', sum.late ? 'crit' : ''],
  ]);

  // Pořadí týdne
  k.heading('Pořadí týdne');
  const cols = [[7, '#', 'r'], [47, 'Díl'], [31, 'Plnění normy'], [15, 'Neplnění', 'r'], [17, 'Strávený čas', 'r'], [14, 'Norma', 'r'], [14, 'Ztráta', 'r'], [12, 'V Top 5', 'r'], [21, 'Případ']];
  const head = () => {
    let x = k.M;
    cols.forEach(([cw, t, al]) => { k.text(t, al === 'r' ? x + cw - 1.5 : x, k.y, 7.2, { bold: true, color: k.C.ink2, align: al === 'r' ? 'right' : 'left' }); x += cw; });
    k.y += 4.6;
    k.hline(k.y, k.C.line2, 0.3);
  };
  head();
  if (!d.top.length) { k.y += 2; k.text(`V ${weekName(rep.week)} není zapsaný žádný díl pod normou.`, k.M, k.y, 9, { color: k.C.ink2 }); k.y += 8; }
  d.top.forEach(t => {
    const c = t.case ? cases.get(t.case) : null;
    const nm = k.split(t.name || 'bez názvu', cols[1][0] - 2, 7.8);
    const h = Math.max(9.6, 5.4 + nm.length * k.LH(7.8, 1.2));
    k.need(h);
    const top = k.y;
    let x = k.M;
    k.text(t.rank, x + cols[0][0] - 1.5, top + 2.2, 9, { bold: true, color: k.C.ink3, align: 'right' }); x += cols[0][0];
    k.text(t.ean, x, top + 2, 9, { bold: true });
    nm.forEach((line, i) => k.text(line, x, top + 5.6 + i * k.LH(7.8, 1.2), 7.8, { color: k.C.ink2 })); x += cols[1][0];
    const tone = effTone(t.eff);
    const bw = 15;
    k.box(k.C.soft3, x, top + 3.4, bw, 2.2, 1.1);
    k.box(tone === 'crit' ? k.C.crit : tone === 'warn' ? k.C.warn : k.C.good, x, top + 3.4, Math.max(1, bw * Math.min(100, t.eff || 0) / 100), 2.2, 1.1);
    k.text(pdfPct(t.eff), x + bw + 2, top + 2.2, 8.8, { bold: true }); x += cols[2][0];
    [[t.eff != null && t.eff < 100 ? pdfPct(100 - t.eff) : '—', 1], [pdfH(t.nspent)], [pdfH(t.norm)], [pdfH(t.lost), 2], [`${t.times}×`]].forEach(([v, b], i) => {
      const cw = cols[3 + i][0];
      k.text(v, x + cw - 1.5, top + 2.2, 8.6, { align: 'right', bold: !!b, color: b === 2 ? k.C.crit : k.C.ink }); x += cw;
    });
    if (c) {
      const s = caseState(c, today);
      k.text(caseLabel(c), x, top + 1.6, 8.4, { bold: true });
      k.pill(s.k === 'zrus' ? 'zrušeno' : s.label.split(',')[0].replace('Čeká na ', ''), x, top + 7.2, s.late ? 'late' : s.k, 6.4);
    } else k.pill('bez řešení', x, top + 4.4, 'none', 6.6);
    k.y = top + h;
    k.hline(k.y);
  });
  k.y += 4;

  // Termíny
  if (d.deadlines.length) {
    k.keep(() => {
      k.heading('Termíny v příštích třech týdnech', 11);
      d.deadlines.slice(0, 14).forEach(x => {
        const lines = k.split(`${x.text}${x.owner ? ` · ${x.owner}` : ''}`, k.CW - 62, 8.6);
        const h = lines.length * k.LH(8.6, 1.3) + 1.6;
        k.need(h);
        k.text(dayText(x.date), k.M, k.y, 8.6, { bold: true, color: x.late ? k.C.crit : k.C.ink });
        k.text(`P-${x.no}`, k.M + 24, k.y, 8.6, { bold: true, color: k.C.ink2 });
        lines.forEach((line, i) => k.text(line, k.M + 46, k.y + i * k.LH(8.6, 1.3), 8.6));
        if (x.late) k.pill('po termínu', k.M + k.CW, k.y + 1.6, 'late', 6.4, 'right');
        k.y += h;
      });
      k.y += 3;
    }, 30);
  }

  // Řešení po položkách
  d.top.forEach(t => {
    const c = t.case ? cases.get(t.case) : null;
    const draw = () => {
      const s = c ? caseState(c, today) : null;
      pdfBand(k, `${t.rank} · ${t.ean} · ${t.name || 'bez názvu'}`, c ? (s.k === 'zrus' ? 'zrušeno' : s.label) : 'bez řešení', c ? (s.late ? 'late' : s.k) : 'none');
      const metr = `Plnění ${pdfPct(t.eff)} · neplnění ${t.eff != null && t.eff < 100 ? pdfPct(100 - t.eff) : '—'} · čas ${pdfH(t.nspent)} · norma ${pdfH(t.norm)} · ztráta ${pdfH(t.lost)}${d.src === 'import' ? ` · ${nf(t.ks, 0)} ks · ${t.workers} ${lidiW(t.workers)}${t.wmin != null ? ` (plnění ${t.wmin}–${t.wmax} %)` : ''}` : ''} · v Top 5 ${t.times}×`;
      const TW = 50;
      const startY = k.y;
      k.para(metr, k.M, k.CW - TW - 6, 8.6, { color: k.C.ink2 });
      // trend posledních týdnů (malé sloupce)
      if (!k.dry) {
        const vals = t.trend;
        const bw = TW / vals.length;
        const base = startY + 9;
        vals.forEach((v, i) => {
          const x = k.M + k.CW - TW + i * bw;
          if (v != null) {
            const h = Math.max(0.6, Math.min(v, 120) / 120 * 8);
            k.box(i === vals.length - 1 ? k.C.acc : k.C.line2, x + 1, base - h, bw - 2, h, 0.5);
          } else k.box(k.C.soft3, x + 1, base - 0.4, bw - 2, 0.4);
          k.text(v == null ? '—' : `${Math.round(v)}`, x + bw / 2, base + 0.6, 6.2, { color: i === vals.length - 1 ? k.C.ink : k.C.ink3, align: 'center' });
        });
        k.hline(base - 8 * 100 / 120, k.C.ink3, 0.15, k.M + k.CW - TW, k.M + k.CW, [0.6, 0.6]);
        k.text('plnění v posledních týdnech (%)', k.M + k.CW - TW, startY - 0.4, 6.2, { color: k.C.ink3 });
      }
      k.y = Math.max(k.y, startY + 13) + 1.5;
      if (!c) {
        k.box(k.C.warnSoft, k.M, k.y, k.CW, 9, 2);
        k.mid('Řešení zatím není založené. Do příštího reportu doplnit příčinu, opatření a termíny.', k.M + 4, k.y + 4.5, 8.8, { color: k.C.warn, bold: true });
        k.y += 13;
        return;
      }
      const r = curRound(c);
      k.text(`Případ ${caseLabel(c)} · kolo ${r.n}${c.rounds.length > 1 ? ` (znovu otevřeno ${dayText(todayIso(r.at))})` : ''} · založen ${dayText(todayIso(c.at))}${c.by ? `, ${c.by}` : ''}`, k.M, k.y, 8.4, { bold: true, color: k.C.ink2 });
      k.y += 5.5;
      pdfRound(k, c, r, today);
      const prev = c.rounds.slice(0, -1);
      if (prev.length) {
        const texts = prev.map(p => roundBrief(p) + (c.rounds[p.n] && c.rounds[p.n].reason ? ` Důvod nového kola: ${c.rounds[p.n].reason}` : ''));
        const lines = texts.map(tx => k.split(tx, k.CW - 8, 8.2));
        const h = lines.reduce((a, l) => a + l.length * k.LH(8.2, 1.32) + 1.6, 0) + 9;
        k.need(Math.min(h, 60));
        const top = k.y;
        if (h < k.BOTTOM - k.y) k.box(k.C.soft, k.M, top, k.CW, h, 2);
        k.text('PŘEDCHOZÍ ŘEŠENÍ (CO SE UŽ ZKOUŠELO)', k.M + 4, k.y + 3, 6.8, { bold: true, color: k.C.ink3, space: 0.2 });
        k.y += 7.5;
        lines.forEach(ls => { ls.forEach(line => { k.need(k.LH(8.2, 1.32)); k.text(line, k.M + 4, k.y, 8.2, { color: k.C.ink2 }); k.y += k.LH(8.2, 1.32); }); k.y += 1.6; });
        k.y += 2;
      }
      k.y += 4;
    };
    // Zalomení před blokem není pokračování; popisek „pokračování“ až uvnitř bloku.
    const h = k.measure(draw);
    if (k.y + h > k.BOTTOM && (h <= k.PAGE || k.BOTTOM - k.y < 60)) k.newPage();
    k.onPage = () => { k.text(`${t.rank} · ${t.ean} · pokračování`, k.M, k.y, 8, { bold: true, color: k.C.ink3 }); k.y += 6; };
    draw();
    k.onPage = null;
  });
  k.footer(`Top 5 nejméně efektivně · ${weekName(rep.week)} (${weekRange(w)}) · revize ${rep.rev}`);
}

/* ---------- souhrn všech případů ---------- */
function pdfDumbbell(k, rows, target) {
  const X0 = k.M + 50, X1 = k.M + k.CW - 30, max = 120;
  const x = v => X0 + (Math.min(Math.max(v, 0), max) / max) * (X1 - X0);
  const RH = 6.2;
  const axis = () => {
    [0, 50, 100].forEach(v => k.text(`${v} %`, x(v), k.y, 6.8, { color: k.C.ink3, align: 'center' }));
    k.y += 3.6;
  };
  axis();
  const top = k.y;
  rows.forEach(r => {
    k.need(RH);
    const cy = k.y + RH / 2;
    k.text(k.split(r.label, X0 - k.M - 3, 7.8)[0], k.M, cy - k.mm(7.8) * 0.5, 7.8, { color: k.C.ink2 });
    k.hline(cy, k.C.line, 0.15, X0, X1);
    if (r.before != null && r.after != null) k.hline(cy, r.after >= target ? k.C.good : k.C.crit, 0.7, x(Math.min(r.before, r.after)), x(Math.max(r.before, r.after)));
    if (r.before != null) k.dot(x(r.before), cy, 1.2, k.C.white, k.C.ink3);
    if (r.after != null) k.dot(x(r.after), cy, 1.3, r.after >= target ? k.C.good : k.C.crit, null);
    k.text(`${r.before == null ? '—' : nf(r.before, 0)} → ${r.after == null ? '—' : nf(r.after, 0)} %`, k.M + k.CW, cy - k.mm(8) * 0.5, 8, { bold: true, align: 'right' });
    k.y += RH;
  });
  // referenční čáry (100 % a cíl) přes celou výšku grafu
  const bottom = k.y;
  if (!k.dry && bottom > top) {
    [[100, k.C.ink3, null], [target, k.C.ink3, [0.8, 0.8]]].forEach(([v, col, dash]) => {
      doc_line(k, x(v), top, x(v), bottom, col, dash);
    });
  }
  k.y += 2;
  // legenda
  k.dot(k.M + 1.2, k.y + 1.5, 1.2, k.C.white, k.C.ink3);
  k.text('při zjištění', k.M + 3.6, k.y, 7.4, { color: k.C.ink2 });
  k.dot(k.M + 25, k.y + 1.5, 1.3, k.C.good, null);
  k.text(`po opatřeních (poslední ověření), cíl ${target} % splněn`, k.M + 27.4, k.y, 7.4, { color: k.C.ink2 });
  k.dot(k.M + 96, k.y + 1.5, 1.3, k.C.crit, null);
  k.text('pod cílem', k.M + 98.4, k.y, 7.4, { color: k.C.ink2 });
  k.text(`svisle: 100 % (norma), čárkovaně cíl ${target} %`, k.M + k.CW, k.y, 7.4, { color: k.C.ink3, align: 'right' });
  k.y += 7;
}
function doc_line(k, x1, y1, x2, y2, color, dash) {
  if (k.dry) return;
  const doc = k.doc;
  doc.setDrawColor(...color); doc.setLineWidth(0.2);
  if (dash) doc.setLineDashPattern(dash, 0);
  doc.line(x1, y1, x2, y2);
  if (dash) doc.setLineDashPattern([], 0);
}

function pdfCaseDetail(k, c, today, short = false) {
  const s = caseState(c, today);
  const ba = caseBeforeAfter(c);
  const base = c.base;
  k.need(40);
  k.onPage = () => { k.text(`${caseLabel(c)} · ${c.ean} · pokračování`, k.M, k.y, 8, { bold: true, color: k.C.ink3 }); k.y += 6; };
  pdfBand(k, `${caseLabel(c)} · ${c.ean} · ${c.name || 'bez názvu'}`, s.k === 'zrus' ? 'zrušeno' : s.label, s.late ? 'late' : s.k);
  k.para(`Založeno ${dayText(todayIso(c.at))}${c.by ? ` (${c.by})` : ''} · ${c.week ? `zjištěno v ${weekName(c.week)}` : 'založeno ručně'} · plnění při zjištění ${pdfPct(base ? base.eff : null)}${base ? ` (strávený čas ${pdfH(base.nspent)}, norma ${pdfH(base.norm)})` : ''} · po opatřeních ${pdfPct(ba.after)} · kol ${c.rounds.length}${c.cancelled ? ` · zrušeno ${dayText(todayIso(c.cancelled.at))}: ${c.cancelled.reason}` : ''}`, k.M, k.CW, 8.6, { color: k.C.ink2 });
  k.y += 2.5;
  c.rounds.forEach(r => {
    k.need(18);
    k.text(`Kolo ${r.n} · otevřeno ${dayText(todayIso(r.at))}${r.by ? ` (${r.by})` : ''}${r.week ? ` · ${weekName(r.week)}${r.base && r.base.eff != null ? `, plnění ${nf(r.base.eff, 1)} %` : ''}` : ''}`, k.M, k.y, 9, { bold: true, color: k.C.acc });
    k.y += 5.5;
    pdfRound(k, c, r, today);
  });
  if (!short && c.comments && c.comments.length) {
    k.need(14);
    k.text('Vývoj případu (komentáře)', k.M, k.y, 9, { bold: true, color: k.C.acc });
    k.y += 5.5;
    c.comments.forEach(e => {
      // komentář má nejvýš 2000 znaků (asi 20 řádků), vejde se na stránku vcelku
      const lines = k.split(e.text, k.CW - 30 - 32, 8.4);
      const h = Math.max(lines.length * k.LH(8.4, 1.32), c.rounds.length > 1 ? 7.4 : 0) + 1.8;
      k.need(h);
      k.text(tsText(e.at), k.M, k.y, 7.6, { color: k.C.ink3 });
      if (c.rounds.length > 1) k.text(`kolo ${e.round}`, k.M, k.y + 3.6, 7, { color: k.C.ink3 });
      lines.forEach((line, i) => k.text(line, k.M + 30, k.y + i * k.LH(8.4, 1.32), 8.4));
      k.text(k.split(e.by || '—', 30, 7.6)[0], k.M + k.CW, k.y, 7.6, { color: k.C.ink3, align: 'right' });
      k.y += h;
    });
    k.y += 2;
  }
  if (!short && c.log && c.log.length) {
    k.need(14);
    k.text('Historie případu', k.M, k.y, 9, { bold: true, color: k.C.acc });
    k.y += 5.5;
    c.log.forEach(e => {
      const lines = k.split(e.t, k.CW - 30 - 32, 8);
      const h = lines.length * k.LH(8, 1.3) + 1.2;
      k.need(h);
      k.text(tsText(e.at), k.M, k.y, 7.6, { color: k.C.ink3 });
      lines.forEach((line, i) => k.text(line, k.M + 30, k.y + i * k.LH(8, 1.3), 8));
      k.text(k.split(e.by || '—', 30, 7.6)[0], k.M + k.CW, k.y, 7.6, { color: k.C.ink3, align: 'right' });
      k.y += h;
    });
  }
  k.y += 6;
  k.onPage = null;
}

/* short = osekaná verze: bez historie případu (kdo a kdy co změnil). Jde auditorovi, proto
   v PDF (ani v názvu souboru) nesmí být, že je osekaná: vypadá jako běžný záznam. */
function drawEffSummary(doc, single, short = false) {
  const k = pdfKit(doc);
  const now = Date.now();
  const today = todayIso(now);
  const set = effSet();
  const right = `Stav k ${dayText(today)}`;
  if (single) {
    k.header({ eyebrow: T5_EYEBROW, plain: true, right, title: `Případ ${caseLabel(single)}`, sub: `${single.ean}${single.name ? ` · ${single.name}` : ''}`,
      meta: short ? 'Záznam případu: všechna kola řešení, opatření a ověření účinnosti.'
        : 'Kompletní záznam případu: všechna kola řešení, opatření, ověření účinnosti, komentáře o vývoji a historie změn s tím, kdo a kdy je udělal.' });
    pdfCaseDetail(k, single, today, short);
    k.footer(`Top 5 nejméně efektivně · případ ${caseLabel(single)} · stav k ${dayText(today)}`);
    return;
  }
  const sum = effSummary(today);
  const cases = S.eff.cases.slice().sort((a, b) => (a.no < b.no ? -1 : 1));
  const first = cases.length ? todayIso(Math.min(...cases.map(c => c.at))) : today;
  k.header({ eyebrow: T5_EYEBROW, plain: true, right, title: 'Souhrn problémových dílů', sub: `${dayText(first)} – ${dayText(today)}`,
    meta: `Všechny případy z týdenních Top 5: co se řešilo, kdy, jak dopadla ověření účinnosti (1. ověření ${set.d1} dní po dokončení opatření, 2. ověření ${set.d2} dní po prvním, cíl plnění ${set.target} %).` });
  k.tiles([
    ['Případů celkem', String(sum.total), `${sum.reopened} znovu otevřených`],
    ['Rozpracované', String(sum.open + sum.verify + sum.fail), `${sum.verify} v ověřování`],
    ['Uzavřeno účinně', String(sum.ok), sum.zrus ? `${sum.zrus} zrušených` : 'bez zrušených', sum.ok ? 'good' : ''],
    ['Po termínu', String(sum.late), sum.late ? 'termíny k řešení' : 'vše v termínu', sum.late ? 'crit' : ''],
  ]);
  k.tiles([
    ['Úspěšnost ověření', sum.verifs ? `${Math.round(sum.verifOk / sum.verifs * 100)} %` : '—', `${sum.verifOk} z ${sum.verifs} ověření účinných`],
    ['Doba do uzavření', sum.leadAvg == null ? '—' : `${nf(sum.leadAvg, 0)} dní`, 'průměr u uzavřených účinně'],
    ['Ztráta při zjištění', pdfH(sum.lost), 'čas nad normou při zjištění'],
    ['Vydané reporty', String(S.eff.reports.length), S.eff.reports.length ? `poslední ${weekName(S.eff.reports[S.eff.reports.length - 1].week)}` : 'zatím žádný'],
  ]);
  // Stavy (pruh s legendou)
  const order = [['new', 'Analýza'], ['act', 'Opatření'], ['v1', '1. ověření'], ['v2', '2. ověření'], ['fail', 'Neúčinné'], ['ok', 'Účinné'], ['zrus', 'Zrušené']];
  const states = cases.map(c => caseState(c, today).k);
  if (cases.length) {
    k.heading('Stav případů', 11);
    const counts = order.map(([key, label]) => [key, label, states.filter(x => x === key).length]).filter(x => x[2]);
    let x = k.M;
    const gap = 0.8, avail = k.CW - gap * (counts.length - 1);
    counts.forEach(([key, , n]) => { const w = avail * n / cases.length; k.box(k.TONE[key][1], x, k.y, w, 5, 1); if (w > 8) k.mid(String(n), x + w / 2, k.y + 2.5, 7.4, { bold: true, color: k.C.white, align: 'center' }); x += w + gap; });
    k.y += 8;
    x = k.M;
    counts.forEach(([key, label, n]) => { k.box(k.TONE[key][1], x, k.y + 0.4, 2.6, 2.6, 0.6); k.text(`${label} ${n}`, x + 3.8, k.y, 7.8, { color: k.C.ink2 }); x += k.width(`${label} ${n}`, 7.8) + 10; });
    k.y += 8;
    const rows = cases.map(c => ({ label: `${caseLabel(c)} · ${c.ean}`, ...caseBeforeAfter(c) })).filter(r => r.before != null || r.after != null);
    if (rows.length) {
      k.keep(() => { k.heading('Plnění normy před a po opatřeních', 11); pdfDumbbell(k, rows, set.target); }, 50);
    }
  } else {
    k.text('Zatím nebyl založen žádný případ.', k.M, k.y, 9.5, { color: k.C.ink2 });
    k.y += 10;
  }

  if (cases.length) {
    // Registr
    k.newPage();
    k.heading('Registr případů');
    const cols = [[22, 'Případ'], [38, 'Díl'], [15, 'Zjištěno'], [8, 'Kol', 'r'], [31, 'Příčina'], [14, 'Opatření', 'r'], [17, '1. ověření'], [17, '2. ověření'], [16, 'Před → po', 'r']];
    const head = () => {
      let x = k.M;
      cols.forEach(([cw, t, al]) => { k.text(t, al === 'r' ? x + cw - 1.5 : x, k.y, 7, { bold: true, color: k.C.ink2, align: al === 'r' ? 'right' : 'left' }); x += cw; });
      k.y += 4.4;
      k.hline(k.y, k.C.line2, 0.3);
      k.y += 0.6;
    };
    k.onPage = head;
    head();
    cases.forEach(c => {
      const s = caseState(c, today);
      const r = curRound(c);
      const ba = caseBeforeAfter(c);
      const acts = liveActions(r);
      const vtext = i => {
        const v = r.v[i];
        if (v) return [v.result === 'ok' ? 'účinné' : 'neúčinné', dayText(v.done), v.result === 'ok' ? k.C.good : k.C.crit];
        const p = roundPlan(r);
        const due = i ? p.p2 : p.p1;
        return due ? ['plán', dayText(due), due < today ? k.C.crit : k.C.ink2] : ['—', '', k.C.ink3];
      };
      const nm = k.split(c.name || 'bez názvu', cols[1][0] - 2, 7.4).slice(0, 2);
      const cause = k.split(r.cat ? effCatLabel(r.cat) : (r.cause ? r.cause : 'nevyplněno'), cols[4][0] - 2, 7.4).slice(0, 3);
      const h = Math.max(10, 4.6 + Math.max(nm.length, cause.length) * k.LH(7.4, 1.25));
      k.need(h);
      const top = k.y;
      let x = k.M;
      k.text(caseLabel(c), x, top + 1.2, 8.2, { bold: true });
      k.pill(s.k === 'zrus' ? 'zrušeno' : s.label.split(',')[0].replace('Čeká na ', ''), x, top + 7, s.late ? 'late' : s.k, 6);
      x += cols[0][0];
      k.text(c.ean, x, top + 1.2, 8.2, { bold: true });
      nm.forEach((line, i) => k.text(line, x, top + 4.8 + i * k.LH(7.4, 1.25), 7.4, { color: k.C.ink2 }));
      x += cols[1][0];
      k.text(c.week ? weekName(c.week) : dayText(todayIso(c.at), false), x, top + 1.2, 8); x += cols[2][0];
      k.text(String(c.rounds.length), x + cols[3][0] - 1.5, top + 1.2, 8, { align: 'right', bold: c.rounds.length > 1, color: c.rounds.length > 1 ? k.C.warn : k.C.ink }); x += cols[3][0];
      cause.forEach((line, i) => k.text(line, x, top + 1.2 + i * k.LH(7.4, 1.25), 7.4, { color: r.cat || r.cause ? k.C.ink : k.C.ink3 })); x += cols[4][0];
      k.text(`${acts.filter(a => a.done).length}/${acts.length}`, x + cols[5][0] - 1.5, top + 1.2, 8, { align: 'right' }); x += cols[5][0];
      [0, 1].forEach(i => { const [a, b, col] = vtext(i); k.text(a, x, top + 1.2, 7.6, { bold: true, color: col }); if (b) k.text(b, x, top + 4.8, 7.4, { color: k.C.ink2 }); x += cols[6 + i][0]; });
      k.text(`${ba.before == null ? '—' : nf(ba.before, 0)} → ${ba.after == null ? '—' : nf(ba.after, 0)} %`, x + cols[8][0] - 1.5, top + 1.2, 7.8, { align: 'right', bold: true });
      k.y = top + h;
      k.hline(k.y);
      k.y += 0.6;
    });
    k.onPage = null;
    // Detail
    k.newPage();
    k.heading(short ? 'Detail případů' : 'Detail případů a kompletní historie');
    cases.forEach(c => pdfCaseDetail(k, c, today, short));
  }
  k.footer(`Top 5 nejméně efektivně · souhrn problémových dílů · stav k ${dayText(today)}`);
}

/* ---------- export ---------- */
async function withPdf(button, fn, orientation = 'portrait', opts = {}) {
  if (button) button.disabled = true;
  try {
    const doc = await newPdf(orientation, opts);
    return await fn(doc);
  } catch (error) {
    console.error(error);
    toast(`PDF se nepovedlo vytvořit: ${error && error.message ? error.message : error}`, true);
    return null;
  } finally {
    if (button) button.disabled = false;
  }
}

async function exportWeekPdf(id, button) {
  if (!id || !weekRanking(id)) return;
  const before = S.eff.reports.find(r => r.week === id);
  const prevRev = before ? before.rev : 0;
  const rep = issueWeekReport(id, effMeta());
  if (rep.rev !== prevRev) save();
  const ok = await withPdf(button, doc => {
    doc.setProperties({ title: `Top 5 nejméně efektivně · ${weekName(id)}`, subject: weekLong(id) });
    drawWeekReport(doc, rep);
    const w = weekById(id);
    downloadFile(`top5-tyden-${w.w}-${w.y}-revize-${rep.rev}.pdf`, doc.output('blob'), 'application/pdf');
    return true;
  });
  if (ok) {
    renderTop5();
    toast(rep.rev !== prevRev ? `Report ${weekName(id)} vydán (revize ${rep.rev}) a stahuje se.` : `Report ${weekName(id)} se od revize ${rep.rev} nezměnil, stahuje se znovu.`);
  }
}

async function exportIssuedPdf(week, button) {
  const rep = S.eff.reports.find(r => r.week === week);
  if (!rep) return;
  await withPdf(button, doc => {
    doc.setProperties({ title: `Top 5 nejméně efektivně · ${weekName(week)}`, subject: weekLong(week) });
    drawWeekReport(doc, rep);
    const w = weekById(week);
    downloadFile(`top5-tyden-${w.w}-${w.y}-revize-${rep.rev}.pdf`, doc.output('blob'), 'application/pdf');
  });
}

/* Souhrn a PDF případu jsou ve dvou verzích: kompletní a osekaná (bez historie případu). */
async function pickT5Variant(single) {
  const { value, form } = await dialog({
    title: single ? `PDF případu ${caseLabel(single)}` : 'Souhrn do PDF', ok: 'Stáhnout PDF',
    html: `<div class="variant-pick" role="radiogroup" aria-label="Verze PDF">
      <label><input type="radio" name="variant" value="full"${P.t5PdfShort ? '' : ' checked'}><span><b>Kompletní verze</b><small>Všechna kola řešení, opatření, ověření účinnosti a historie případu (kdo a kdy co změnil).</small></span></label>
      <label><input type="radio" name="variant" value="short"${P.t5PdfShort ? ' checked' : ''}><span><b>Osekaná verze</b><small>Totéž bez historie případu. V PDF ani v názvu souboru nebude, že je osekaná.</small></span></label></div>`,
  });
  if (value !== 'ok') return null;
  const short = form.elements.namedItem('variant').value === 'short';
  if (short !== P.t5PdfShort) setPref({ t5PdfShort: short });
  return short ? 'short' : 'full';
}

async function exportEffSummaryPdf(caseId, button, variant) {
  const single = caseId ? effCase(caseId) : null;
  const pick = variant || await pickT5Variant(single);
  if (!pick) return;
  const short = pick === 'short';
  await withPdf(button || $('#t5SummaryPdf'), doc => {
    // Název souboru ani vlastnosti PDF neprozradí, která verze to je (jde auditorovi).
    doc.setProperties({ title: single ? `Případ ${caseLabel(single)}` : 'Souhrn problémových dílů', subject: 'Top 5 nejméně efektivně' });
    drawEffSummary(doc, single, short);
    downloadFile(single ? `top5-pripad-${caseLabel(single)}.pdf` : `top5-souhrn-${todayIso()}.pdf`, doc.output('blob'), 'application/pdf');
    toast(`${single ? `PDF případu ${caseLabel(single)}` : 'Souhrn'}${short ? ' (osekaná verze)' : ''} se stahuje.`);
  });
}

