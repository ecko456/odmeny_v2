/* ==========================================================================
   START
   ========================================================================== */
function bindEvents() {
  $('#nav').addEventListener('click', event => {
    const button = event.target.closest('[data-view]');
    if (button) showView(button.dataset.view);
  });
  document.addEventListener('click', event => {
    // zkušební doba: na dotykovém displeji není najetí myší, info ukáže klepnutí
    const pb = event.target.closest('[data-prob]');
    if (pb && window.matchMedia('(hover: none)').matches) toast(pb.dataset.prob);
    const go = event.target.closest('[data-go]');
    if (go) { showView(go.dataset.go); return; }
    const pick = $('#colPick');
    if (pick.open && !pick.contains(event.target)) pick.open = false;
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') $('#colPick').open = false; });
  bindPerPick();
  bindSideSearch();
  bindSideMini();
  bindRail();
  $('#lockBtn').onclick = () => lockApp();
  $('#lockBtnTop').onclick = () => lockApp();
  $('#logBtn').onclick = () => openLog();
  bindPhoneUi();
  bindLogbooks();
  bindService();
  bindShortage();
  bindWorkAudit();
  bindCapPlan();
  bindTasks();

  // Filtry přehledu jsou osobní: pamatují se jen pro tuto kartičku.
  $('#ovSearch').addEventListener('input', renderOverview);
  $('#ovPos').addEventListener('change', event => { setPref({ pos: event.target.value }); renderOverview(); });
  $('#ovOnlyImported').addEventListener('change', event => { setPref({ onlyImported: event.target.checked }); renderOverview(); });
  $('#ovOnlyOpen').addEventListener('change', event => { setPref({ onlyOpen: event.target.checked }); renderOverview(); });
  $('#kafeTh').addEventListener('change', event => { setKafe(event.target.value); save(); renderAll(); });
  $('#kafeTh').addEventListener('keydown', event => { if (event.key === 'Enter') event.target.blur(); });
  $('#kafeReset').onclick = () => { setKafe(''); save(); renderAll(); toast('Kafe se zase počítá z fondu.'); };
  $('#ovHead').addEventListener('click', event => {
    const th = event.target.closest('[data-sort]');
    if (!th) return;
    const k = th.dataset.sort;
    setPref({ sort: { k, dir: P.sort.k === k ? -P.sort.dir : (k === 'name' ? 1 : -1) } });
    renderOverview();
  });
  $('#ovHead').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.target.click(); } });
  $('#ovBody').addEventListener('click', async event => {
    const adj = event.target.closest('[data-adj]');
    if (adj) { bumpAdj(adj.dataset.adj, +adj.dataset.dir); renderOverview(); renderPeople(); return; }
    if (await handleIssueClick(event)) return;
    if (await handleExcludeClick(event)) return;
    const pairOpen = event.target.closest('[data-pairopen]');
    if (pairOpen) { openDetail(pairOpen.dataset.pairopen); return; }
    const pairSet = event.target.closest('[data-pairset]');
    if (pairSet) {
      const select = pairSet.parentElement.querySelector('[data-pairfor]');
      if (!select || !select.value) { toast('Vyber jméno z evidence práce.', true); return; }
      const rec = prodPeriod() && prodPeriod().names[select.value];
      pairProd(rec ? rec.name : select.value, pairSet.dataset.pairset);
      save(); renderAll(); toast('Spárováno s evidencí práce.');
      return;
    }
    const edit = event.target.closest('[data-edit]');
    if (edit) { ui.selPerson = edit.dataset.edit; ui.personOpen = true; renderPeople(); showView('lide'); return; }
    const prof = event.target.closest('[data-profile]');
    if (prof) { openProfile(prof.dataset.profile); return; }
    if (event.target.closest('button, select, input, a, label')) return;
    const tr = event.target.closest('tr[data-key]');
    if (!tr) return;
    if (ui.openDetail === tr.dataset.key) { ui.openDetail = null; $$('#ovBody tr.detail').forEach(row => row.remove()); tr.classList.remove('open'); return; }
    openDetail(tr.dataset.key);
  });
  $('#setSecurity').addEventListener('click', handleSecurityClick);
  $('#btnCopy').onclick = copyTable;
  $('#btnXlsx').onclick = exportXlsx;
  $('#btnPrint').onclick = () => window.print();

  $('#lSearch').addEventListener('input', () => renderPeople({ refilter: true }));
  $('#lFilters').addEventListener('change', event => { if (event.target.id === 'lScope') setLideFilter({ g: event.target.value }); });
  $('#lFilters').addEventListener('click', event => {
    const chip = event.target.closest('[data-lst]');
    if (chip) { const st = chip.dataset.lst; setLideFilter({ st: st === lideFilter().st ? '' : st }); return; }
    if (event.target.closest('[data-lclear]')) setLideFilter({ g: '', st: '' });
  });
  $('#lList').addEventListener('click', event => {
    const button = event.target.closest('[data-key]');
    if (!button) return;
    if (!ui.personOpen) ui.listY = window.scrollY;
    ui.selPerson = button.dataset.key;
    ui.personOpen = true;
    renderPeople();
    if (isPhone()) window.scrollTo({ top: 0, behavior: 'instant' });
  });
  $('#lDetail').addEventListener('click', async event => {
    if (await handleIssueClick(event)) return;
    if (await handleExcludeClick(event)) return;
    const prof = event.target.closest('[data-profile]');
    if (prof) { openProfile(prof.dataset.profile); return; }
    const rate = event.target.closest('[data-rate]');
    if (rate) {
      setRate(rate.dataset.key, rate.dataset.rate, +rate.dataset.lvl);
      renderPeople(); renderOverview(); renderMatrix();
      const again = $(`#lDetail [data-rate="${CSS.escape(rate.dataset.rate)}"][data-lvl="${rate.dataset.lvl}"]`);
      if (again) again.focus();
      return;
    }
    const legacy = event.target.closest('[data-legacydone]');
    if (legacy) {
      const e = S.employees[legacy.dataset.legacydone];
      if (!e || !e.legacy) return;
      if (!(await confirmBox('Smazat původní zařazení?', `Okno s původním zařazením (${legacyText(e.legacy)}) zmizí. Záznam o tom zůstane v historii změn.`, 'Převedeno, smazat'))) return;
      delete e.legacy;
      save(); renderPeople(); renderOverview(); toast('Původní zařazení smazáno.');
      return;
    }
    const mark = event.target.closest('[data-mark]');
    if (mark && S.current) {
      if (mark.dataset.on === '1') {
        const res = await dialog({ title: 'Bod prémie nesplněn', ok: 'Označit nesplněno',
          html: `<p class="small muted">Platí jen pro ${esc(nameOf(mark.dataset.key))} a ${esc(monthLabel(S.current))}. Prémie, která bod vyžaduje, se za tento měsíc nepřizná.</p><label class="field"><span>Důvod (nepovinné)</span><input name="value" maxlength="300" placeholder="např. opakované pozdní příchody" autofocus></label>` });
        if (res.value !== 'ok') return;
        setMark(S.current, mark.dataset.key, mark.dataset.mark, res.form.elements.namedItem('value').value.trim());
      } else setMark(S.current, mark.dataset.key, mark.dataset.mark, null);
      save(); renderPeople(); renderOverview();
      return;
    }
    const gg = event.target.closest('[data-gogroup]');
    if (gg) { ui.selPos = gg.dataset.gogroup; ui.posOpen = true; ui.mxTab = 'groups'; showView('matice'); return; }
    const nc = event.target.closest('[data-ncdone], [data-ncundo]');
    if (nc && S.current) { markWage(`n:${S.current}:${nc.dataset.ncdone || nc.dataset.ncundo}`, 'ncdone' in nc.dataset); return; }
    if (event.target.closest('[data-goleads]')) { ui.mxTab = 'leads'; showView('matice'); return; }
    const adj = event.target.closest('[data-adj]');
    if (!adj) return;
    bumpAdj(adj.dataset.adj, +adj.dataset.dir);
    renderPersonDetail(); renderPeople(); renderOverview();
  });
  $('#btnAddPerson').onclick = async () => {
    const res = await dialog({
      title: 'Přidat člověka', ok: 'Přidat',
      html: `<label class="field"><span>Jméno a příjmení</span><input name="value" placeholder="Jan Novák" maxlength="100" required autofocus></label>
        <label class="check opt-check"><input type="checkbox" name="lead"><span><b>Vedoucí pracovník</b><small>Nepočítá se do tabáků, Kafe, prémií ani sankcí. V Matici dovedností bude jako vedoucí zaškrtnutých oddělení.</small></span></label>
        <div class="lead-pick" hidden><p class="small"><b>Oddělení, která má na starosti</b></p>${leadDeptsHtml([], 'data-newdept')}</div>`,
      onOpen: dlg => { const box = $('[name="lead"]', dlg); box.addEventListener('change', () => { $('.lead-pick', dlg).hidden = !box.checked; }); },
      validate: form => (form.elements.namedItem('value').value.trim() ? null : 'Napiš jméno a příjmení.'),
    });
    if (res.value !== 'ok') return;
    const value = res.form.elements.namedItem('value').value.trim();
    const asLead = res.form.elements.namedItem('lead').checked;
    const leadDepts = $$('[data-newdept]', res.form).filter(x => x.checked).map(x => x.dataset.newdept);
    if (!value) return;
    const parts = value.trim().split(/\s+/);
    const first = parts.shift() || '';
    const last = parts.join(' ') || first;
    const key = `${norm(last)}|${norm(first)}`;
    if (S.employees[key]) { toast('Takový už v seznamu je.'); ui.selPerson = key; ui.personOpen = true; renderPeople(); return; }
    S.employees[key] = { key, first: first.slice(0, 80), last: last.slice(0, 80), positionId: null, level: null, note: '' };
    if (asLead) S.employees[key].lead = leadDepts;
    ui.selPerson = key; ui.personOpen = true;
    save(); renderPeople(); renderOverview(); renderPeriodBits();
  };
  $('#btnExpRoster').onclick = exportRoster;
  $('#btnImpRoster').onclick = () => $('#rosterFile').click();
  $('#rosterFile').onchange = event => { readRoster(event.target.files[0]); event.target.value = ''; };

  $('#sanSearch').addEventListener('input', renderSanctions);
  $('#sanFilter').addEventListener('change', event => { setPref({ sanFilter: event.target.value }); renderSanctions(); });

  $('#posList').addEventListener('click', event => {
    const button = event.target.closest('[data-selpos]');
    if (!button) return;
    ui.selPos = button.dataset.selpos;
    ui.posOpen = true;
    renderPositions();
  });
  $('#btnAddPos').onclick = async () => {
    const value = await promptBox('Nová skupina', 'Název skupiny', '', 'Přidat', 'třeba Frézování');
    if (!value) return;
    const position = mkPos(uid('p'), value.slice(0, 80), []);
    S.positions.push(position);
    ui.selPos = position.id; ui.posOpen = true; ui.mxTab = 'groups';
    save(); renderMatrix(); renderOverview(); renderPeople();
  };
  bindMatrixEvents();
  bindGroupEditor();

  $('#attView').addEventListener('click', event => {
    if (event.target.closest('[data-attxlsx]')) { exportAttXlsx(); return; }
    const lk = event.target.closest('[data-attlock]');
    if (lk) { attToggleLock(lk.dataset.attlock); return; }
    const cell = event.target.closest('[data-attcell]');
    if (cell) { attEditDialog(cell.closest('[data-attkey]').dataset.attkey, cell.dataset.attcell); return; }
    if (event.target.closest('[data-attrehours]')) {
      const r = dvRehours(true);
      store.note = { text: `Docházka: hodiny přepočítané se zaokrouhlením příchodů a odchodů (${r.cells} ${r.cells === 1 ? 'den' : r.cells <= 4 ? 'dny' : 'dní'}, ${r.months.map(monthLabel).join(', ')})`, kind: 'import' };
      save(); renderAll(); toast(`Přepočítáno ${r.cells} dní.`); return;
    }
    const b = event.target.closest('[data-attpdf]');
    if (b) exportAttPdf(b);
  });
  $('#btnDelPeriod').onclick = async () => {
    const p = curPeriod();
    if (!p) return;
    if (attLocked(p.id)) { toast(`Docházka za ${periodName(p)} je uzamčená. Před smazáním ji odemkni.`, true); return; }
    if (!(await confirmBox('Smazat období?', `Smaže se docházka za ${periodName(p)} i ruční úpravy a výdeje toho měsíce. Lidé, skupiny a sankce zůstanou.`, 'Smazat', true))) return;
    delete S.periods[S.current];
    delete S.adjust[S.current];
    if (S.issued) delete S.issued[S.current];
    if (S.attEdits) delete S.attEdits[S.current];
    if (S.attLocks) delete S.attLocks[S.current];
    setPeriod(Object.keys(S.periods).sort().reverse()[0] || null);
    save(); renderAll(); toast('Období smazáno.');
  };
  const wireDrop = (zone, button, input, fn) => {
    // 2.50: v Docházce už plocha pro přetažení ani tlačítko nejsou (nahrává se v KPI), zůstal jen skrytý vstup
    if ($(`#${button}`)) $(`#${button}`).onclick = () => $(`#${input}`).click();
    $(`#${input}`).onchange = event => { fn(event.target.files[0]); event.target.value = ''; };
    const dz = $(`#${zone}`);
    if (!dz) return;
    ['dragenter', 'dragover'].forEach(type => dz.addEventListener(type, event => { event.preventDefault(); dz.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(type => dz.addEventListener(type, event => { event.preventDefault(); dz.classList.remove('over'); }));
    dz.addEventListener('drop', event => { if (event.dataTransfer.files && event.dataTransfer.files[0]) fn(event.dataTransfer.files[0]); });
  };
  wireDrop('drop', 'btnPick', 'file', readFile);
  wireDrop('pdrop', 'pbtnPick', 'pfile', readProdFile);

  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(type => document.addEventListener(type, () => { lastActivity = Date.now(); }, { passive: true }));
  setInterval(checkIdle, 15000);
  setInterval(() => syncCheck(), window.ODM_SYNC_EVERY || SYNC_EVERY);
  window.addEventListener('focus', () => syncCheck());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { flushSave(); flushPrefs(); }
    else { checkIdle(); syncCheck(true); }
  });
  bindExtraEvents();
  bindTop5Events();
  bindKontrolyEvents();
  bindQuick();
  bindEnds();
  window.addEventListener('beforeunload', event => {
    if (store.dirty || store.saving) { event.preventDefault(); event.returnValue = ''; }
  });
}

