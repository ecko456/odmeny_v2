/* ==========================================================================
   PRAVIDLA DO PDF: vzniká v prohlížeči z dešifrovaných dat, server obsah nevidí
   ========================================================================== */
/* Písma PDF (2.47.1): stáhnou se jednou za otevření stránky a drží se v paměti. Výpadek sítě se
   zkusí ještě jednou, vypršené přihlášení (401) dá srozumitelnou hlášku místo „nepodařilo se načíst“. */
const PDF_ASSETS = new Map();
const PDF_EXPIRED = 'přihlášení na serveru vypršelo. Zamkni aplikaci (zámek nahoře) a odemkni ji znovu, pak PDF stáhni znovu';
async function pdfAssetFetch(name) {
  const url = `app.php?f=${name}&v=${document.body.dataset.privateVersion || '1'}`;
  let res;
  try { res = await fetch(url, { credentials: 'same-origin' }); } catch (error) { res = await fetch(url, { credentials: 'same-origin', cache: 'reload' }); }
  if (res.status === 401) throw new Error(PDF_EXPIRED);
  if (!res.ok) throw new Error(`písmo ${name} se nepodařilo stáhnout ze serveru (HTTP ${res.status})`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function pdfAsset(name) {
  if (!PDF_ASSETS.has(name)) PDF_ASSETS.set(name, pdfAssetFetch(name).catch(error => { PDF_ASSETS.delete(name); throw error; }));
  return PDF_ASSETS.get(name);
}
async function pdfLib() {
  if (window.jspdf) return;
  const src = `app.php?f=jspdf.js&v=${document.body.dataset.privateVersion || '1'}`;
  try { await OdmLock.loadScript(src); } catch (error) {
    const res = await fetch(src, { credentials: 'same-origin', method: 'HEAD' }).catch(() => null);
    if (res && res.status === 401) throw new Error(PDF_EXPIRED);
    await OdmLock.loadScript(`${src}&r=${Date.now()}`).catch(() => { throw new Error('knihovnu pro PDF se nepodařilo stáhnout ze serveru, zkontroluj připojení a zkus to znovu'); });
  }
  if (!window.jspdf) throw new Error('knihovna pro PDF se nenačetla, obnov stránku (Ctrl+Shift+R)');
}

function drawRules(doc, d) {
  const W = 210, H = 297, M = 16, CW = W - 2 * M;
  const INK = [27, 31, 29], MUTED = [85, 92, 88], LINE = [214, 212, 203], ACC = [14, 107, 93], SOFT = [243, 242, 236];
  const mm = pt => pt * 0.3528;
  let y = M;
  const font = (size, bold = false, color = INK) => { doc.setFont('Plex', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color); };
  const lh = size => mm(size) * 1.38;
  const need = h => { if (y + h > H - M - 6) { doc.addPage(); y = M; return true; } return false; };
  const lines = (text, size, width, bold = false) => { font(size, bold); return doc.splitTextToSize(String(text), width); };
  const write = (list, size, x, top, color = INK, bold = false) => { font(size, bold, color); list.forEach((line, i) => doc.text(line, x, top + i * lh(size) + mm(size) * 0.92)); };
  const heading = (text, size) => { need(lh(size) + 12); font(size, true); doc.text(text, M, y + mm(size) * 0.92); y += lh(size) + 1.5; };

  // Titulek
  font(20, true); doc.text(d.title, M, y + mm(20) * 0.92); y += lh(20);
  font(10.5, false, MUTED); doc.text(`${d.sub} · platné k ${d.date}`, M, y + mm(10.5) * 0.92); y += lh(10.5) + 2;
  doc.setDrawColor(...ACC); doc.setLineWidth(0.7); doc.line(M, y, M + 28, y); y += 7;

  // Obecná pravidla: štítek vlevo, text vpravo
  heading('Jak se hodnotí', 12.5);
  const LW = 30;
  d.general.forEach(([label, text]) => {
    const body = lines(text, 9.5, CW - LW);
    const h = body.length * lh(9.5);
    need(h + 2);
    write([label], 9.5, M, y, INK, true);
    write(body, 9.5, M + LW, y, INK);
    y += h + 2.2;
  });
  y += 4;

  // Standardní hodnoticí schéma
  heading('Hodnoticí schéma dovedností', 12.5);
  d.std.forEach(l => {
    const body = lines(`${l.n} · ${l.name}: ${l.desc}`, 9.2, CW - 4);
    need(body.length * lh(9.2) + 1);
    write(body, 9.2, M, y, INK);
    y += body.length * lh(9.2) + 1;
  });
  y += 5;
  // Skupiny: dovednosti, tabáky podle procenta, pravidla docházky a prémie
  d.groups.forEach(g => {
    need(lh(13) + 30);
    font(13, true); doc.text(g.name, M, y + mm(13) * 0.92);
    const tag = [g.dept && g.dept !== g.name ? `oddělení ${g.dept}` : '', g.onlyKafe ? 'jen Kafe, bez tabáků' : ''].filter(Boolean).join(' · ');
    if (tag) { const nameW = doc.getTextWidth(g.name); font(9.5, false, MUTED); doc.text(tag, M + nameW + 3, y + mm(13) * 0.92); }
    y += lh(13) + 1.5;
    if (!g.onlyKafe) {
      const cw = CW / 5;
      doc.setFillColor(...SOFT); doc.rect(M, y, CW, 11, 'F');
      g.steps.forEach((st, i) => {
        font(7.8, false, MUTED); doc.text(`průměr ${st.l} · ${st.pct} %`, M + i * cw + cw / 2, y + 4, { align: 'center' });
        font(10, true); doc.text(`${st.tab} ${tabW(+st.tab || 0)}`, M + i * cw + cw / 2, y + 8.6, { align: 'center' });
      });
      y += 13;
    }
    if (!g.skills.length) { const b2 = lines('Skupina zatím nemá dovednosti.', 9, CW); write(b2, 9, M, y, MUTED); y += lh(9) + 2; }
    g.skills.forEach(x => {
      const head = lines(x.name + (x.opt ? ' (není nutností, v procentu váha ¼)' : '') + (x.desc ? ` – ${x.desc}` : ''), 9.4, CW, true);
      need(head.length * lh(9.4) + 2);
      write(head, 9.4, M, y, INK, true);
      y += head.length * lh(9.4) + 0.6;
      if (!x.std) x.scale.forEach(l => {
        const body = lines(`${l.n} · ${l.name}${l.desc ? `: ${l.desc}` : ''}`, 8.4, CW - 6);
        need(body.length * lh(8.4));
        write(body, 8.4, M + 6, y, MUTED);
        y += body.length * lh(8.4) + 0.3;
      });
      y += 1;
    });
    y += 1.5;
    g.rules.forEach(rule => {
      const body = lines(rule, 8.8, CW);
      need(body.length * lh(8.8));
      write(body, 8.8, M, y, INK);
      y += body.length * lh(8.8) + 0.4;
    });
    g.tiers.forEach(t => {
      const body = lines(`Prémie ${t.name}: ${t.conds.join(', ')} → ${t.reward}.${t.streak ? ` ${t.streak}` : ''}`, 8.8, CW);
      need(body.length * lh(8.8));
      write(body, 8.8, M, y, ACC);
      y += body.length * lh(8.8) + 0.4;
    });
    y += 7;
  });

  if (d.reasons.length) {
    heading('Důvody sankcí', 12.5);
    const body = lines(`${d.reasons.join(' · ')}. Srážka ${SAN_PCTS[0]}–${SAN_PCTS[SAN_PCTS.length - 1]} % (po 5 %) z nároku za vybraný měsíc. Srážka ze mzdy benefity nekrátí, zpracuje se ve mzdách.`, 9.5, CW);
    need(body.length * lh(9.5));
    write(body, 9.5, M, y);
    y += body.length * lh(9.5);
  }

  // Zápatí na každé stránce
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    font(8, false, MUTED);
    doc.text(`${EXPORT_NAME} · ${d.title} · ${d.date}`, M, H - 9);
    doc.text(`strana ${i} / ${pages}`, W - M, H - 9, { align: 'right' });
  }
}

async function exportRulesPdf() {
  const button = $('#btnRulesPdf');
  button.disabled = true;
  try {
    await pdfLib();
    const [regular, semibold] = await Promise.all([pdfAsset('pdf-regular.ttf'), pdfAsset('pdf-semibold.ttf')]);
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    doc.addFileToVFS('Plex-Regular.ttf', regular);
    doc.addFont('Plex-Regular.ttf', 'Plex', 'normal');
    doc.addFileToVFS('Plex-SemiBold.ttf', semibold);
    doc.addFont('Plex-SemiBold.ttf', 'Plex', 'bold');
    const d = rulesDoc();
    doc.setProperties({ title: d.title, subject: d.sub, creator: EXPORT_NAME });
    drawRules(doc, d);
    downloadFile(`pravidla-hodnoceni-${new Date().toISOString().slice(0, 10)}.pdf`, doc.output('blob'), 'application/pdf');
    toast('PDF s pravidly se stahuje.');
  } catch (error) {
    toast(`PDF se nepovedlo: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

