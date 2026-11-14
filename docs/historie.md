# Odměny verze 2: historie

Přesunuto z `CLAUDE.md` 13. 11. 2026 (verze 2.79.1) beze změny textu. Zápisy jsou od nejnovějšího;
nejstarší ze tří zápisů v `CLAUDE.md` se při dalším zápisu přesouvá sem na začátek oddílu zápisů.
Text zápisů se nepřepisuje (jsou to zadání uživatele a rozhodnutí v době, kdy padla).

Obsah:

- Zápisy „Kde jsme skončili“ (od 2.79.1 dozadu po 1. 10. 2026)
- Verze a stav (celá tabulka verzí s commity, zadání 2.1)
- Ostrá verze a verze 2 (původní text, platil do 7. 11. 2026)
- Plán: víc modulů v jedné aplikaci (zadání 2. 10. 2026, nezačato)
- Původní úvod a Tři oddělené projekty

## Zápisy „Kde jsme skončili“

Stav k 13. 11. 2026 (verze 2.79.1):

- Uživatel: „u položek, kde bude ‚Tento díl se zpracovává na jiném oddělení: …‘ a nebude mít plné
  zobrazení, tak v PDF reportech ať nejsou nakonec viditelné vůbec, zabírá to zbytečně místo.“
  - `drawShortage`: `pdfOne(sec, it)` (před `title`) vrátí sestavu jen s poddíly, které do bloku
    patří (`shSubHere`) nebo jsou `full`; používá ho nadpis oddělení (`k.need`), řádky i počet
    poddílů v záhlaví po odděleních. Nízký řádek „jiné oddělení“ z 2.78 v PDF zrušený. Sestava,
    které v bloku nezůstane žádný poddíl, se vytiskne jako obyčejný řádek s QR kódem.
  - V aplikaci beze změny (řádek `tr.sh-subaway` s textem a Zobrazit plně zůstal).
  - Testy: `e2e_shpruvodce` (PDF po odděleních bez cizího poddílu a s počtem 1 poddíl, po
    Zobrazit plně cizí poddíl i v Brusu). `ODM_VERSION` 2.79.1, data beze změny (57).
- Uživatel se ptal, jestli půjde využít `Graphify-Labs/graphify`, `emilkowalski/skills` nebo `affaan-m/ECC`.
  Prošli jsme je, graphify vyzkoušen na našem kódu (offline, jen kód): volání mezi díly nespojí
  (jeden globální rozsah bez importů), tak ne. Celé ECC ne (314 skillů, hooky, většina mimo nás).
  Doporučení: 1. zeštíhlit CLAUDE.md, 2. zátěžový test obrazovek nejhoršími daty (postup break-ui
  z emilkowalski/skills) na Shortage a Po termínu i v PDF, 3. kontrola klikání a tichých chyb
  (click-path-audit, silent-failure-hunter z ECC) nad ukládáním, sloučením dvou lidí a importy,
  4. kontrola animací jen na přání. Uživatel: „začni prvním bodem“.
  - CLAUDE.md 290 kB → 38 kB: zápisy od 2.77 dozadu, celá tabulka verzí, původní text o ostré verzi
    a zadání víc modulů v `docs/historie.md`, popisy modulů v `docs/moduly.md`, seznam e2e testů
    v `docs/testy.md`, vše beze změny textu (skript ověřil, že každý původní řádek někde je).
    Nové oddíly Kde co je (a jak zapisovat), Ostrá verze (co z ní platí), Moduly (rozcestník
    modul → díly kódu), Testy v kostce. Opravené zastaralé cesty `private/app.js` a `private/core.js`.
  - `deploy/install.sh` `--exclude '/docs/'` (Apache `.md` stejně nevydá), test
    `test_notes_for_claude_stay_small` (CLAUDE.md pod 60 kB, nejvýš 3 zápisy, odkazy na docs).
  - Čeká se, jestli uživatel chce body 2–4.

Stav k 13. 11. 2026 (verze 2.79):

- Uživatel: „převzít modul shortage a udělat druhý modul s podobnými funkcemi ‚Po termínu‘ … nahrál
  místo shortage položky po termínu, spárovalo by to s výrobním plánem následně evidencí a měl bych
  stejný list jako je v shortage, ale … tříděné namísto TOP shortage podle skluzu, ten je ve sloupci F
  … čím větší skluz, tím je to horší. Zase AI může pomoci rozpoznat sloupce podle prvního řádku
  a přidělit v návrhu ke kontrole co je co“.
  - **Jeden kód, dva moduly**: pohled `potermin` ukazuje stejnou sekci `#view-shortage` (showView
    přepne sekci a `shSwitch`). `shKey()` = `late` | `shortage` podle `ui.view`, `shLate()`, `shc()`
    vrací `S.late` nebo `S.shortage`, **`shPut(x)`** uloží vyčištěné do otevřeného modulu (všechna
    dřívější `S.shortage = cleanShortage(…)` v 26-shortage). `ui.sh` je pro každý modul zvlášť
    (`ui.shStates`), výrobní plán v paměti okna (`ui.sh.plan`) společný. `SH_TXT` / `shT()` texty
    (název, PDF, soubor, záhlaví, krok 1, dny), `shHeadDraw` záhlaví a lede, `.sh-late` na sekci.
    Rychlý scan a pravý panel jsou jen pro Shortage.
  - Data (verze 57): `S.late = {lists, hist, scans: []}` (stejný tvar seznamů jako Shortage, položka
    `delay` = skluz, číslo). `depts`, `cols` a `colors` jsou na `S.late` **nevypisované přístupy**
    do `S.shortage` (`shLateLink(st)`, getter i setter), neukládají se (sharedState je nevidí);
    sloupce tabulky po termínu jsou proto v `S.shortage.cols.late`. `cleanLate(o, sh)` čistí se
    společnými odděleními (ruční oddělení položky zůstane) a řadí `shLateOrder`; `sanitizeState`
    `out.late = cleanLate(…, out.shortage)` + `shLateLink(out)`.
  - Core: `SH_COLS.late` (A–E, delay F), `SH_COL_NAMES/NEED/WORDS.late`, `shBuild(rows, cols, colors,
    kind)` (late: skluz, bez TOP a barev, `warn.noDelay`), `shDelayNum`, `shLateOrder` (skluz sestupně,
    bez skluzu na konci otevřených, Hotovo na konci, stabilní), `shDelayTiers` (crit = čtvrtina,
    warn = polovina otevřených se skluzem), `lateChanges` (historie kind `late`, „Po termínu:“, m `pt…`,
    bez oddělení a sloupců), `LOG_KINDS` + `late`, `MERGE_TOP.late`, `blank().late`.
  - UI 26-shortage: import seznamu `shLK()` (`late` / `list`) v `shImportFile`, `shPaste` (v Po termínu
    bez seznamu nebo s nadpisem Skluz = seznam, ne záznamy), `shColsFor` (`listKind`: okno vždy, bez
    přednastavení), poznámka o skluzu v okně, `SH_LATE_NONE`; `renderShortage` pořadí podle skluzu
    (srovná i po změně stavu), dlaždice Největší skluz, `shDelayTag`, řádky `sh-latecrit/sh-latewarn`,
    bez TOP tlačítek, sloupec Množství, nápověda, oddělení jen ke čtení `.sh-deptsro`
    + `[data-shtoshortage]`; šipky na úchytu jen hláška; PDF (`late`, `lab`, `lateCrit`: SKLUZ N
    jako TOP / TOP 2, záhlaví HALA 2 · PO TERMÍNU, název Položky po termínu, soubor `po-terminu-…`).
    34-průvodce: `SH_WIZ_STEPS_ALL`, `shWizSteps()`, texty. Menu `#nav [data-view="potermin"]`,
    `HOME_TILES`, `homeTileMeta`, historie filtr a ikona `late`. Okno sloupců `dialog.dlg.wide:has(.sh-coldlg)` 900 px.
  - Server `lib/ai.php`: `ODM_AI_SH_FIELDS.late` (order, name, ean, index, qty, delay, op, note), prompt.
  - Testy: core „Po termínu (2.79)“, nový `tests/e2e_potermin.js`, `test_odmeny` (late, 426 pro 56),
    `e2e_mobil` (18 položek menu), `e2e_upgrade_prev` 2.78 → 2.79 (archiv `3afd2dd`). `ODM_VERSION` 2.79.

Stav k 13. 11. 2026 (verze 2.78):

- Uživatel (Shortage): „1. Při importu výrobního plánu … AI, aby rozpoznala sloupce a nadefinovala je
  v přednastavení … když to bude dělat nějaký kolega. 2. Pokud zabalím den … hezký grafický průvodce
  ‚Spustit nahrávání shortage‘ (2.1 urgenty vložit / nahrát / ze schránky, 2.2 výrobní plán 7 měsíců zpět
  + 8 dopředu, 2.3 evidence interní ze schránky; zkontroluj, zda se pojde víc než 3000 řádků). 3. … u dílů
  aspoň 3 záznamy poslední. 4. … položky, které mají u nás záznam, ale nemají poslední status ‚Expedováno
  na WPA‘ a operace neodpovídají žádné naší … do oddělení ‚K prověření‘.“ Během práce: „u připnutých
  položek ať se zachovává poznámka“ a „sestava má více poddílů a každý má být na jiném oddělení …
  duplicity sestav … poddíl, který na to oddělení nepatří … ‚Tento díl se zpracovává na jiném oddělení‘
  … ‚plné zobrazení‘ a ukáže se QR“.
  - Data (verze 56): záznam `rec.prev[≤ 2]` = `{ts, when, qty, state, op}` (jen když je, `SH_REC_HIST` 3),
    položka `dept: '?'` (`SH_CHECK_DEPT`, ručně K prověření), poddíl `full: true` (jen když je),
    `S.shortage.cols[kind].heads {pole: nadpis}` a `set {at, by}` (přednastavení, jen když jsou).
  - Core 23-shortage: `shRecMerge` (sloučení, bez zdvojení, nejnovější hlavní s at/by/n), `shRecList`,
    `shRecBuild` drží 3 ke kódu, `shApplyRecs` slučuje (starší = `older` + `hist`, jen když je), `shOwnCodes`,
    `shRecordsKeep(list, records, foreign)` (kódy seznamu vždy, cizí nejnovější `SH_MAX_RECORDS`; zabalený
    seznam cizí ne, i v `cleanShortage`), `out.cached` = opravdu uložené. `shWpa` zná Expedováno na WPA.
    K prověření: `shCheckHit` (záznam položky, bez něj poddílů, poslední ne WPA), `shAutoFull` (oddělení
    podle operace, jinak „?“, jen s odděleními), `shDeptOf`, `shDeptName`, `shSections` (oddělení,
    K prověření, Nezařazeno), `shDrop` a `shDuplicate` s „?“. Rozdělení: `shSplitDepts` (domovské + oddělení
    poddílů; ručně zařazená, bez poddílů nebo bez oddělení se nerozdělí), `shSubDept`, `shSubHere`,
    `shSplitView` (pohled `{...it, splitDept, splitOf}` v `shSections`, data jen v originálu).
    Připnutí: `shPinNote` v `shCarryPins` (ruční poznámka bez staré poznámky od plánování, poddíly když nové nejsou).
  - Core 24-shortage-kroky: přednastavení `shHeadNorm`, `shColsLetters`, `shColsHeads`, `shColsPreset`
    (`same` = stejné nadpisy na místech, `moved` = každý nadpis v řádku jednou jinde, jinak null; nadpisy
    aspoň 2 a u povinných polí), `shColsClean` s `heads`/`set`, historie „· uloženo jako přednastavení“,
    `shsf:` poddíl plně, rozbor sloupec Předchozí záznamy (poslední), názvy K prověření v historii.
  - UI 26-shortage: `shColsFor` (kromě urgentů: přednastavení → bez AI a okna; jinak AI a okno s `.sh-prewarn`,
    potvrzené sloupce uloží nadpisy; bez okna nadpisy jen když je soubor má a přednastavení ještě není;
    bez nadpisů v souboru postaru), `shColsDialog` vrací `header`, `shColsNote` (přednastavení, posunuté).
    Velká evidence: `shClipRecs` (TSV, `SH_MAX_REC_ROWS` 300 000), `shReadClipboard` velké HTML přeskočí,
    `shSheetCols` (soubor evidence: jen potřebné sloupce), zpráva „přečteno N řádků“. `shRecPrevHtml`
    (`ol.sh-recprev`), PDF `L.prev` / `recH`. K prověření ve výběru u položky, Duplikovat, nadpis
    `tr.sh-chkhead`, panel Oddělení. Rozdělení: `rowHtml(i, j, secId)`, `shSubAwayHtml` (`tr.sh-subaway`,
    `[data-shaway]`, `[data-shsubfull]`), plně `tr.sh-subfull` + `.sh-awaytag`, `.sh-splitnote`, výběr
    „Podle poddílů: A + B“, `shDeptPick` podle `shSplitDepts`, PDF bloky jen vybraných oddělení a poddíl
    jinde = nízký řádek „jiné oddělení“. `shPackList` hned `cleanShortage`. `shNewDayHtml` pryč.
  - Nový díl `private/app/34-shortage-pruvodce.js`: `ui.sh.wiz {at, step 1–4, adv}`, `shWizDone`,
    `shWizSync` (po dokončení kroku jednou dál), `shWizPlanRange` (7 zpět, 8 dopředu, konec měsíce),
    `shWizIntroHtml` (`.sh-wizintro`, `.sh-newday` u zabaleného dne), `shWizHtml`, `shWizStepHtml`,
    `shWizDrop` (`[data-shwzdrop]`: Ctrl+V a přetažení souboru, `bindShWizDrop`), `[data-shwiz]`,
    `[data-shwzfile]`, `[data-shwzclip]` (klikne `#shClipboard`). `renderShortage` průvodce / úvod
    a tři kroky nahoře `.sh-steps` schované. Ikony `I.upload`, `I.clipboard`.
  - Testy: core „Shortage (2.78)“ (+ starší test 2.28 older = historie, rozbor sloupce), nový
    `tests/e2e_shpruvodce.js` (průvodce, AI náhradní odpověď, přednastavení, posunutý a jiný plán, 25 000
    řádků ze schránky, 3 záznamy v tabulce i PDF, K prověření, poznámka připnuté, rozdělená sestava
    v tabulce i PDF po odděleních, telefon), `e2e_shortage` (úvod průvodce, blok K prověření, přetažení na
    nadpis za Montáží), `e2e_shkroky` (stejná evidence podle přednastavení bez AI), `e2e_shpin` (volby
    oddělení), `test_odmeny` (426 pro 55), `e2e_upgrade_prev` 2.77 → 2.78 (archiv `ac24fb4`). `ODM_VERSION` 2.78.

Stav k 13. 11. 2026 (verze 2.77):

- Uživatel: „modul spíše pro mobil pro ‚Rychlý scan‘ … doplnění dat pomocí mobilu a rychlého čtení
  QR kódů, nastavím třeba hromadné načítání a nastavím jednu pozici a budu moct načíst rychle více
  kódů a poté to potvrdit. Po každém scanu to jen bude chtít množství. A poté to doplní do shortage.
  Je to doplnění evidenci interní.“ a „ať je možné udělat z těchto mobilních záznamů výstup třeba
  do excelu“. Pozice = stav záznamu evidence pohybu (sloupec D), operace se nevyplňuje.
  - Data (verze 55): `S.shortage.scans[≤ SC_MAX_LOG 3000]` = deník potvrzených načtení
    `{id 'sc…', ts, code, qty, n, pos, by, list, hit, kind item|sub|qr, ean, name, order, index}`
    (snímek dílu v době načtení, nejnovější první, `scClean` v `cleanShortage`).
  - Core nový díl `private/core/27-rychly-scan.js`: `scCode` (odkaz → activeBarcode jako `shCode`,
    jinak text přes `shCodeClean`; odkaz bez activeBarcode = ""), `scQty`, `scPos`, `scAdd` (stejný
    kód se sečte, `n` načtení, `SC_MAX_BATCH` 500), `scFind` (položka, poddíl, varianta QR),
    `scRecs` (tvar `shRecBuild`: stav = pozice, `n`, sent jen u Odesláno na WPA), `scApply(sh, list,
    batch, pos, meta)` (`shApplyRecs`, `list.moves` „Rychlý scan · pozice“, deník), `scPositions`,
    `scRange` (today | week | all), `scSheets` (Záznamy, Souhrn). Historie `shChanges` „rychlý scan
    pozice N kódů (M ks)“, m `shsc:`.
  - UI nový díl `private/app/33-rychly-scan.js`, pohled `scan` (`#view-scan`, `#scView`): části
    `#scHead`, `#scSet` (pozice `#scPos` + datalist a čipy `[data-scpos]`, `#scBatchOn`, `#scList`
    při víc nezabalených seznamech), `#scCamBox` (kamera `#scCam` se nepřekresluje, `[data-sccam]`,
    `#scCode` + Enter / `#scCodeAdd`), `#scBatch` (dávka, `[data-scqty]`, `[data-scdel]`,
    `[data-scok]`, `[data-scclear]`, hláška `ui.sc.done`), `#scLog` (`[data-scrange]`, `[data-scxlsx]`
    → `exportScXlsx`). Kamera přes `startCodeScan` (ZXing / BarcodeDetector ze 2.13), `scSeen`
    (během okna množství nic; stejný kód v záběru obnovuje `lastAt`, znovu až po `SC_SAME_MS` 2,5 s
    mimo záběr; po zapnutí kamery se paměť vynuluje), `scQtyDialog` (`.sc-found`, −/+, rychlé
    volby urgentně / poslední, validace), `scConfirm`. Stav `ui.sc` (dávka jen v paměti okna),
    prefs `scanPos`, `scanBatch`. `showView` mimo `scan` → `scStop`, `visibilitychange` taky.
    Menu: `#nav`, `HOME_TILES`, `FAB_ITEMS` (druhá položka), `homeTileMeta`.
  - Testy: core „Rychlý scan (2.77)“ (+ prázdný Shortage se `scans`, verze 55), nový
    `tests/e2e_scan.js` (falešná kamera Y4M s QR z `static/vendor/qrcode.js`, telefon, Excel přes
    openpyxl), `test_odmeny` (426 pro 54), `e2e_upgrade_prev` 2.76 → 2.77 (archiv `b054487`).
    `ODM_VERSION` 2.77.

Stav k 13. 11. 2026 (verze 2.76):

- Uživatel: „do shortage, když bude zeleně vyplněná buňka, tak u těchto položek bude možné
  nadefinovat ‚Hotovo‘ a bude vždy na konci seznamu se statusem ‚Hotovo‘“. Vzali jsme to jako
  buňku s EANem (stejně jako červená = TOP z 2.61); kdyby byla zelená jinde, je potřeba doplnit.
  - Data (verze 54): `S.shortage.colors` zná `done` (`SH_TIERS`), stav položky `st: 'done'` je ze 2.65.
    `sanitizeState` u dat starších než 54: zelená (`shColorGuess` = done) uložená jako `none` → `done`.
  - Core (23-shortage): `shRank` = 3 pro `st === 'done'` (i TOP), `shTopFirst` [0,1,2,3];
    `shSetStatus` u položky (ne poddílu) při změně Hotovo zavolá `shDoneMove` (hotová na úplný konec,
    bez Hotovo na konec své skupiny); `shMergeDone(list, items, meta, dry)` (doplnění chybějících:
    položka ze souboru s Hotovo dá Hotovo stejné položce v seznamu podle `shItemKey`, nejdřív se
    započítají už hotové); `shBlocks(sh, items)` = `shSections` a hotové v posledním bloku
    `SH_DONE_SEC` („=done“, Hotovo), jen s odděleními; `shBuild` vrací `done`, `top`/`top2` bez hotových.
    24-shortage-kroky: `shApplyColors(items, colors, meta)` (done = stav Hotovo s `stAt`, `stBy`),
    `shColorGuess` zelená (g ≥ 100 a o 12 víc než r i b) = done, historie „barva … = Hotovo“,
    nahrání „hotovo N“.
  - UI (26-shortage): vzorník volba Hotovo, hláška po nahrání, řádek `tr.sh-done` + `data-shtier="done"`,
    štítek `.sh-donetag` místo TOP, hotové mimo blok Nelze přidělit odkaz, blok `tr.sh-donehead`,
    dlaždice a karta seznamu „hotovo N“, filtr TOP / TOP 2 bez hotových (`shAgeHit`, `shAgeChips`),
    výběr stavu při změně Hotovo překreslí a ohlásí přesun, `shRowDept` a `shDragMark` (přetažená
    hotová položka i položka puštěná na hotový řádek si nechá oddělení), `shGripKey` po blocích `shBlocks`, `shMergeInto` (`doneN`, `.sh-mdone`).
    Filtr oddělení a jeho čipy dál podle `shSections` (skutečné oddělení). PDF: `shBlocks`, štítek
    HOTOVO bez pruhu TOP, záhlaví „hotovo N (na konci)“, po odděleních vlastní strana Hotovo.
    Pravý panel (15): hotové za ostatními, „hotovo N“, značka ✓.
  - Testy: core „Shortage (2.76)“ (+ odhad 00B050 v 2.61, verze 54), nový `tests/e2e_shhotovo.js`,
    `test_odmeny` (426 pro 53), `e2e_upgrade_prev` 2.75.2 → 2.76 (archiv `e18cb06`, hotová TOP ze
    staré verze po aktualizaci na konci, ruční Hotovo a barva v kroku 5). `ODM_VERSION` 2.76.
  - Pozor v testech: s `ctx.clock.setFixedTime` stojí přechody CSS, čtverečky barev ve vzorníku jsou
    na snímku prázdné (barvy hlídá `e2e_shkroky` bez pevných hodin).

Stav k 12. 11. 2026 (verze 2.75.2):

- Uživatel: „možnost v ‚Lidé, kteří v souboru nejsou‘ přidělení jména ze seznamu, stále mi to
  nesedí“ a „Právě mi to vložilo třeba ‚Zaměstnanec SASÁK Invalid Date‘“. „Zaměstnanec“ je nadpis
  sloupce okna; „SASÁK Invalid Date“ je nejspíš člověk, kterého dřívější import založil z buňky
  jména s neplatným datem (`String(Date)`). Soubor jsme neviděli.
  - Core (15-konce-trestu): `endParse` čte jména přes `nameTxt` (Date, číslo, „Invalid Date“,
    #N/A = prázdné; popisek „Zaměstnanec:“ / „Odsouzený“ před jménem pryč), řádek jen ze slov
    `END_HEAD` bez platného data se přeskočí kdekoli, řádek bez jména i data taky; nový člověk
    s číslicemi ve jméně = chyba, `row.bad`, nezaloží se (`endApply`, `sum.fresh`).
    `endBadName(e)` → `missingP[].bad`. `endMissingHints(parsed)` → Map klíč → `{cand, pick}`:
    řádky bez páru (`!e`, jméno nebo příjmení) podle společných slov a `attDist`; `pick` jen při
    silné shodě (2 společná slova, nebo příjmení + iniciála jména), jednoznačné z obou stran.
  - UI (23-konce-trestu): `endExcludeDialog(parsed, file)` vrací `{exclude, assign}` (klíč →
    řádek), sloupec „Je v souboru jako“ (`select[name="ea"][data-eakey]`, Návrh / Ostatní řádky
    bez páru, `.end-hint`), kontrola dvojího přidělení (`validate`), přidělený člověk se nevyřazuje,
    tlačítko Vyřadit vybrané / Přidělit vybrané / Přidělit a vyřadit, Zrušit = Přeskočit. Chybné
    jméno `.end-badname` předvybrané k vyřazení. `endImport` po přidělení znovu `parse()` s `assign`.
    U zaškrtávátka nových lidí jejich jména.
  - Testy: core „Konce trestů (2.75.2)“ ×2, `e2e_konce` (návrh předvybraný, dvojí přidělení,
    chybné jméno, nadpis uprostřed, nikdo „Invalid Date“). `ODM_VERSION` 2.75.2, data beze změny.

Stav k 12. 11. 2026 (verze 2.75.1):

- Uživatel: „lepší spárování v Konec trestů, když dám nahrát soubor, tak mi to nedokáže spárovat
  správně jména i když v seznamu jsou“. Příčina: `endParse` hledal jen `S.employees[norm(příjmení)|
  norm(jméno)]` (a prohozené); klíč je z doby založení, takže přejmenovaný člověk, druhé jméno,
  titul, pomlčka, celé jméno v jednom sloupci nebo překlep = „nový“.
  - Core (15-konce-trestu, blok „Párování jmen“): `END_TITLES`, `endTok` (bez diakritiky,
    interpunkce, pomlček a titulů, Ph.D.), `endNameT`, `endMatch(rows, emps, assign)` po stupních
    přes všechny řádky: ruční (`assign` Map číslo řádku → klíč, "" = nový), ID (`cols.wid`,
    `widKey`), přesně (klíč nebo jméno v Lidech; stejný člověk víckrát zůstane a hlásí se),
    prohozené, stejná slova (`sig`), část jména (všechna slova kratšího v delším, aspoň 2),
    podobné (`attDist`, do 1 znaku u 5–8 písmen, do 2 od 9; jinak `cand` návrhy). Každý člověk
    nejvýš jednou a jen jednoznačně. `endParse` řádky nejdřív posbírá, pak páruje; řádek má
    `how` a `cand`; spárovaný řádek s celým jménem v jednom sloupci už není chyba (i `endApply`).
  - UI (23-konce-trestu): `END_HOW`, `endPickHtml` (`select[data-enda]` pod jménem: Návrh, Všichni
    v Lidech bez vedoucích, nový člověk), souhrn `.end-howline`, pole „ID (nepovinné)“ v
    `.end-cols`, okno importu širší (`dialog.dlg.wide:has(.end-tab)` 940 px, dlaždice v jedné
    řadě), řádky bez přesné shody vždy vidět.
  - Docházka postaru (`attMatch`, 2.48) má vlastní párování, beze změny.
  - Testy: core „Konce trestů (2.75.1)“, `e2e_konce` (soubor s jinak zapsanými jmény, ruční
    přiřazení, nikdo nový). `ODM_VERSION` 2.75.1, data beze změny (53).

Stav k 12. 11. 2026 (verze 2.75):

- Uživatel: „optimalizaci shortage, přijde mi ta stránka hrozně zasekaná a pomalá odezva. Dále
  udělej u shortage možnost ‚Připnout‘ a bude se objevovat stále v následujících shortage, dokud
  položku ‚Neodepneme‘“ a „po kliknutí na ‚Duplikovat‘ aby vyskočilo do jakého oddělení chci
  vložit duplicitu“.
  - Měřeno v Playwrightu na vymyšleném stavu (30 seznamů po 400 položkách, třetina s poddíly,
    13 MB JSON; skript v paměti session, do repa nepatří). **Příčina zasekávání:** `shNotesSize`
    nastavovalo výšku každé poznámky zvlášť (zápis `height`, čtení `scrollHeight`) = nové
    rozložení celé tabulky pro každé pole: 25 s při každém vykreslení, filtru i `resize`.
    Teď CSS `field-sizing: content` (`SH_FIELD_SIZING`, JS nic neměří), jinak měření najednou
    (zápis všem, čtení všem, zápis) a jen neprázdná pole. Vykreslení 12,5 s → 0,4 s.
  - `nf` (core 01) drží `Intl.NumberFormat` v `NF_CACHE` (toLocaleString s volbami ho stavěl při
    každém volání; ve vykreslení Shortage 110 ms). Výsledky stejné, hlídá test.
  - Vrátit zpět (core 08): `undoDiff` porovnává pole položek se stejnými id ve stejném pořadí
    po položkách, segment cesty `@id` (`undoSameIds`, `undoIdx`; `undoGet`/`undoSet` ho umí jen
    u pole, u objektu je „@…“ obyčejný klíč). Jiné pořadí nebo jiné položky = celé pole jako dřív.
    Dřív každá poznámka v Shortage ukládala celé `lists` (u velkých dat nad `UNDO_PATCH_MAX`,
    takže Vrátit zpět u Shortage nešlo) a uložení se zdrželo; undoRecord 330 → 110 ms.
  - Ikony v řádcích Shortage (úchyt, oko, propiska, ×, nové špendlík a kopie) jsou CSS masky
    (`SH_IC(n)` → `span.icon.sh-ic.sh-ic-…`, data URI v `app.css`, CSP `img-src data:`), o 5 000
    prvků méně. Tlačítka v řádku 30 px, tři v řadě (`.sh-acts` min 96 px, buňka bez velkého
    odsazení), tabulka se na 1440 px vejde.
  - Hledání `#shQ`: nad 300 řádků (`shRowsN`) filtr po 160 ms pauzy (`shQTimer`), jinak hned.
  - Zkoušeno a zamítnuto: `table-layout: fixed` a `content-visibility` na buňkách (bez měřitelného
    přínosu). Posouvání velké tabulky v headless Chromiu stojí ~100 ms na krok (vykreslení
    50 000 prvků, ne CSS skla); se skutečnou grafickou kartou nejspíš méně, neřešeno.
  - Data (verze 53): položka `pin {at, by}` (`shPinClean`) a `dup: true` (jen když jsou).
  - Core (23-shortage, blok „Připnout a duplikovat“): `shItemCopy`, `shCarryPins(prev, items)`
    (nejnovější dosavadní seznam; stejný `shItemKey` v urgentech převezme připnutí, jinak kopie
    celé položky na konec skupiny, `shTopFirst`), `shSetPin`, `shDuplicate(sh, list, id, dept)`
    (hned pod originálem, bez připnutí, oddělení jako výběr v řádku). `shLinkDays`: kopie má dny
    jako originál v tomtéž seznamu, páruje se jen bez originálu; zbylá kopie se neodbourá, když
    díl v seznamu zůstal nebo odešel i originál (jinak jednou). Historie `shpin:`, `shdup:`,
    nahrání seznamu „připnuté N“, kopie není „doplněná“.
  - UI (26-shortage): `shPinBtn` (`[data-shpin]`, `.sh-pinbtn.on`), `shDupBtn` (`[data-shdup]` →
    `shDupDialog`: radio `name="dept"`, `.sh-dupdepts`, výchozí jiné oddělení než teď),
    `shPinTags` (PŘIPNUTO, KOPIE, i v zabaleném seznamu), řádek `tr.sh-pinned` + `data-shpinned`
    (i poddíly, filtr), `shNewest`, filtr věku `age = 'pin'` (čip Připnuté, i PDF), `shAddList`
    přenese připnuté (`.sh-pinnote`; zpráva počítá jen vložené urgenty), ruční přidání bez
    seznamu taky. Odebrání kopie (×) „Odebrat kopii?“, bez `out` a `gone`. PDF: „Připnuto ·
    Kopie · N. den na shortage“ pod EANem.
  - Testy: core „Shortage (2.75)“ a „Vrátit zpět (2.75)“, nový `tests/e2e_shpin.js` (tři dny,
    připnout, filtr, duplikovat, odebrat kopii, PDF, odepnout, velký seznam pod limitem, telefon),
    `e2e_xss` (připnutí, kopie, okno Duplikovat), `test_odmeny` (426 pro 52), `e2e_upgrade_prev`
    2.74 → 2.75 (archiv `fd89a32`, připnutí, kopie a další den nad převzatými daty).
    `ODM_VERSION` 2.75.

Stav k 12. 11. 2026 (verze 2.74):

- Uživatel: „v KPI … by si systém tvořil sám normy podle odvedených časů … tabulka obsahuje i název
  dílu, myslím ve sloupci B, ale to bych případně definoval při načítání … aby se při průměrování
  počítali normy zkušenějších pracovníků, tedy všichni co mají hodnocení zkušenosti nad 45% …
  pokud bude odvedený čas do 2 minut, tak to nepočítat“.
  - Data (verze 52): `dv.perf[m][id].n {díl: {operace: [kusy, minuty, řádků]}}` jen ze záznamů
    s kusy a časem nad `DV_NORM_MIN` 2 min (při nahrání, `dvApply`), `perf[m][id].s` = počet
    krátkých záznamů (kusy a čas ≤ 2 min), `dv.files[].short`; `S.workAudit.normPct` (1–99, null
    = `KPI_NORM_PCT` 45). Bez `n` a `s` se nic neukládá (starší data beze změny tvaru). `DV_MAX_NORM`
    1000 položek na člověka a měsíc.
  - Core (19-kpi-vykonnost, blok „Normy z vykázaných časů“): `kpiNormPct`, `kpiNormMonths` (`with`
    = s daty pro normy, `without` = nahrané před 2.74), `kpiExpAt(e, měsíc, dnes)` (procento skupiny
    ke konci měsíce: `dvGroupOf` + `ctPctAt`; vedoucí, bez skupiny, neznámé ID = null),
    `kpiNorms({month, now})` (zkušený = procento **nad** hranicí; norma = Σ min ÷ Σ ks zkušených,
    bez nich všech; `src` exp|all, `allNorm`, součet operací za díl), `kpiNormOf`, `kpiAutoNorm`
    (normominuty ÷ minuty po lidech), `kpiNormSheets`. `kpiPerf`: bez normy v evidenci
    (`nspent` 0) plnění podle norem systému (`autoN`, `opts.auto === false` vypne), `kpiSheets`
    poznámka. Historie `wanormpct`.
  - UI: záložka KPI `normy` (`nmHtml`, `ui.wa.nm {month, q}`, `nmState`, `#nmMonth`, `#nmQ`
    filtruje řádky bez překreslení `nmFilter`, `[data-nmxlsx]` → `exportNmXlsx`, poznámka `.nm-old`
    o měsících bez dat), karta `#waNormCard` v Nastavení (`#waNormPct`), Výkonnost: poznámka
    a dlaždice. Sloupec dílu je dál `dv.cols.work.part` (výchozí D, uživatel ho mění v okně Jak se
    soubor načte).
  - Normy se do odměn (prémie, `perfOf`) **nepromítají**, jen do KPI. Kdyby uživatel chtěl, je to
    další krok.
  - Testy: core „KPI normy (2.74)“ (+ tvar `perf` v 2.37, verze 52), nový `tests/e2e_normy.js`
    (díl ve sloupci B nastavený v okně načtení, hodiny stránky 20. 11. 2026), `e2e_upgrade_prev`
    2.73 → 2.74 (archiv `b190c78`, Normy nad daty ze staré verze, hranice v kroku 5). `ODM_VERSION` 2.74.

Stav k 11. 11. 2026 (verze 2.73):

- Uživatel: „za předchozí den shortage půjde ‚zabalit‘ a budu moct nahrát nové? … Položka tam je již
  2. den nebo tato položka byla odstraněna ze shortage v dnešním soupisu urgentů není … filtrovat jen
  TOP shortage, TOP2 shortage, položky co tu jsou 2. dny a více … historický přehled … jak se co
  podaří rychle odbourat.“
  - Data (verze 51): seznam `packed {at, by} | null` (zabalený = jen ke čtení), `out[≤ SH_MAX_OUT 1000]`
    = odbourané položky `{key (shItemKey), ean, name, order, index, qty, top, top2, op, since, days,
    day (kdy se odbourala), manual, at, by, rec {state, when}}`; položka `since` (první den na
    shortage), `days` (kolikátý den s nahraným seznamem), `again` (den posledního odbourání, když se
    vrátila); `S.shortage.hist[≤ 400]` = souhrn dne seznamu, který vypadl nad 30 (`shDaySummary`,
    i s `out`, celkem nejvýš 6000 odbouraných).
  - Core (23-shortage, blok „Zabalení dne a dny na shortage“): `shLinkDays(lists)` v `cleanShortage`
    (řada od nejstaršího, předchozí seznam podle `at`; stejný den den nepřičte; nejstarší si nechá
    uložené hodnoty; auto `out` se pokaždé přepočítá, `manual` zůstane a stejná položka se pak
    nepočítá podruhé), `shOutOf`, `shOutClean`, `shDaySummary`, `shHistClean`, `shHistory` (dny,
    odbourané, Ø, do 1 dne, TOP, rozložení), `shDaysText`, `shHistorySheets`. Historie změn `shpk:`
    (zabalen / rozbalen). **Seznam se nezabalí sám** při nahrání dalšího (staré chování přepínání
    seznamů zůstalo), hláška po nahrání nabídne Zabalit předchozí.
  - UI (26-shortage): `shList()` = vybraný, jinak nejnovější nezabalený; **`shWork()`** = jen
    nezabalený (importy, Ctrl+V záznamů, plán, poznámky z Excelu, ruční přidání). `shPackList`,
    `[data-shpack]`, `[data-shunpack]`, `shPackedHtml` (tabulka jen ke čtení, `data-shopen=""`
    Zavřít), `shNewDayHtml` (vše zabalené), `shAgeTag`, filtr `ui.sh.tiers` + `ui.sh.age`
    (`shAgeSel`, `shAgeHit`, `shAgePick`, `[data-shtierf]`, `[data-shagef]`, i PDF a `sh-nodrag`),
    `shOutHtml` (**bez tabulky**: `#shView tbody tr` patří položkám, přetahování i testy), `shModeBar`
    (Historie), `shHistHtml`, `exportShHistXlsx`, `shVsNote`, `shPrevList`, šest dlaždic `.sh-six`
    (3 + 3, na široké ploše 6; `#shView` má `container-type`). PDF: „N. den na shortage (od …)“.
    Pravý panel bere nejnovější nezabalený seznam.
  - Oprava mimochodem: řádek poddílu neměl za třídou uvozovku (`data-shsub` se nečetl).
  - Testy: core „Shortage (2.73)“ (+ tvary 2.27, prázdný Shortage s `hist`, verze 51), nový
    `tests/e2e_shdny.js` (tři dny s hodinami stránky), `e2e_xss` (zabalený den, historie),
    `e2e_upgrade_prev` 2.72.1 → 2.73 (archiv `a986739`, předchozí den v datech, zabalení v kroku 5).
    `ODM_VERSION` 2.73.

Stav k 11. 11. 2026 (verze 2.72.1):

- Uživatel: „aby šlo v časové ose scrollovat a vyjetí mimo myší, aby se plynule vrátilo na aktuální
  čas. Jen klidně bych odebral ten postranní scrolovací panel pokud to jde, ruší to celkem vzhled panelu.“
  - `railAgenda` bere `agWindow(…, AG_SPAN_BACK 12, AG_SPAN_AHEAD 24)`, řádky mají `data-agts`, osa je
    v `.ag-scroll[data-agscroll]` (tabindex, title). `agAxisHome(sc)` = výchozí poloha a výška
    (první řádek od teď − `AG_BACK`, poslední do teď + `AG_AHEAD`, výška 180–440 px), `agAxisInit()`
    po každém `renderRail` (výška přes `style`, posluchače na novém prvku), stav `agUi {away, user,
    hover, top, timer, raf}`: posunutá osa zůstane i po překreslení. Návrat `agGoHome` je vlastní
    animace přes `requestAnimationFrame` (ease-out, 320–750 ms; `scrollTo` smooth v prohlížeči
    s vypnutým plynulým posouváním skočí), s `prefers-reduced-motion` hned. Myš: po odjetí 120 ms, nad osou
    je podle jednoho `pointermove` na stránce (`agBindMove`; nový prvek osy po minutovém překreslení
    by vjetí ani odjetí nezachytil, v souběžných testech to padalo), dotyk: `AG_TOUCH_HOME` 5 s,
    klávesnice: `focusout`.
  - CSS na konci `app.css`: `.ag-scroll` (`overscroll-behavior: contain`, maska na okrajích 8 px,
    `padding-left` 4 px kvůli kroužkům úkolů), bez posuvníku i `.rail` a `html.rail-open .rail`.
  - Testy: `e2e_panel` (posouvání bez posuvníku, výchozí okno, úkol za 6 h jen posunutím, panel se
    nehýbe, překreslení, plynulý návrat přes `emulateMedia` no-preference, s omezeným pohybem hned).
    `ODM_VERSION` 2.72.1, data beze změny (50).

Stav k 11. 11. 2026 (verze 2.72):

- Uživatel: „Pokud nastane ‚Neshoda objednávky / line‘ tak bych potřeboval mít možnost rozevíracího
  menu s nabídkou alternativních objednávek, kde budu mít číslo objednávky, index, počet ks, poslední
  interní záznam, probíhající operaci“.
  - Data (verze 50): položka `planAlts[≤ SH_MAX_ALTS 30] = {order, index, link, code, op, qty, rec}`
    (`shAltsClean`, jen při `planMismatch` nebo s `was`), `was = {order, index, link, code, op, oqty?}`
    = objednávka z urgentů před prvním výběrem (`shWasClean`).
  - Core (23-shortage): plán `eanKeys` (EAN → klíče 1. listu), `label` (klíč → objednávka a index
    jako text v plánu), plní `shPlanDirectRow`. `shPlanAlts(plan, it, records)` (po QR kódu, bez
    odkazu jedna položka; množství z `plan.qty`, operace z `plan.operations`, záznam z `shRecordMap`;
    pořadí `shAltRank`: stejná objednávka, stejný index, ostatní, podle urgentu), `shApplyPlan` je
    dává při neshodě i s `was`. `shPickAlt(list, id, n)` (QR z plánu, bez něj z urgentu; operace,
    množství, záznam; `was` jen poprvé), `shAltBack(list, id)` (zpátky, `planMismatch` = je nabídka).
    `shItemKey` bere objednávku a index z `was` (Doplnit chybějící, poznámky z urgentů, odebrané).
    Historie `shalt:` (výběr z nabídky, návrat; ruční úprava tužkou ne).
  - UI (26-shortage): `shAltPick(item, recs)` v buňce QR (`select[data-shalt]`, optgroup
    `SH_ALT_GROUPS`, popisek `shAltLabel`: objednávka | Index | ks | Záznam | Operace),
    `.sh-was` + `[data-shaltback]`, `shAltPlan` (plán v paměti okna doplní poddíly a varianty QR
    nové objednávky), `shUsePlan` při ponechaných poddílech převezme i `planAlts` a `oqty`, ruční
    úprava s jiným EANem `was` a nabídku zahodí, text sekce Nelze přidělit odkaz a hláška plánu.
    Telefon (≤ 760 px): buňky operace, QR a poznámky celou šířkou pod popiskem (dřív se text lámal po písmenech).
  - Testy: core „Shortage (2.72)“ (+ tvar položky v 2.27), `test_odmeny` (426 pro 49), `e2e_shkroky`
    (tři alternativy ve skupinách, výběr, jiná, Vrátit z urgentů, historie, další plán, telefon),
    `e2e_upgrade_prev` 2.71.1 → 2.72 (archiv `8184841`). `ODM_VERSION` 2.72.

Stav k 11. 11. 2026 (verze 2.71.1):

- Uživatel na otázku k 2.71 (poslední záznam je „Odesláno na WPA“, ale do zakázky kusy chybí):
  „ať to počítá jako u nás“.
  - `shSentOf`: chybí kusy a díl má záznam (jakýkoli) nebo se už něco odeslalo = `here`; stav
    `part` zrušený (`SH_SENT_ST`, `shSentText`, `sentHtml`, `shSentSum`, hláška bez „částečně“).
    `open` zůstává jen pro zakázku bez záznamu a bez odeslání.
  - Historie `shw:` má v klíči počet uložených odeslání, takže druhé nahrání do 10 minut nepřepíše
    počet prvního.
  - Testy: core „Shortage (2.71)“ (B.1 a data ze 2.70 = `here`, nový případ poslední záznam WPA),
    `e2e_shkroky` (druhá evidence `pohyb2.xlsx`, poslední záznam odeslání, „U nás 5 ks“, historie).
    `ODM_VERSION` 2.71.1, data beze změny (49).

Stav k 11. 11. 2026 (verze 2.71):

- Uživatel: „ty shortage načtou množství zakázky z výrobního plánu a dokud to množství nevyplní
  v evidenci ‚Odesláno na WPA‘ … pokud tam budou nějaké ks chybět a zároveň urgentní položka měla
  interní záznam jiný než ‚Odesláno na WPA‘ tak to počítá s tím, že díl je stále u nás“.
  - Data (verze 49): položka i poddíl `oqty` (číslo, jen když je), seznam `sent {kód: [[ts, ks]]}`
    (`shSentClean`: bez duplicit ts|ks, nejnovější do `SH_MAX_SENT` 3000, i pro nepřiřazené kódy).
  - Core (23-shortage): `shQtyNum` („1 200“, „12 ks“, „2,5“), `shRecBuild` vrací i `sent` (každý
    řádek se stavem `shWpa` a číselnými kusy), `shApplyRecs(list, recs, meta, sent)` → `out.sent`,
    `sentCodes`; `shSentEntries` (uložené + poslední záznam, když je odeslání: data ze 2.70),
    `shSentOf(list, x)` → `{st done|here|part|open|info, order, sent, left, n, last}`,
    `SH_SENT_ST`, `shSentText`. Plán: `SH_COLS.planItem.qty`, `SH_COLS.plan.qty` (volitelné),
    `shPlanDirectRow(…, qty)` (`plan.qty` klíč → kód → ks, stejný řádek víckrát = větší),
    `shPlanRow(…, qty)`, `shApplyPlan` (1. list podle kódu, jinak největší; bez 1. listu vlastní
    řádek sestavy ve 2. listu; poddíly ze 2. listu; bez hodnoty zůstane dřívější/ruční), `out.qty`.
    `SH_COL_WORDS` order bez slov o množství (lookahead). `shAnalysis(it, list)` (`sent`, věta),
    `shAnalysisSheet` 4 sloupce na konci.
  - UI: `shSentSum(l)`, `sentHtml` v buňce operace (položka, sestava i poddíl, `[data-shsent]`),
    dlaždice Poslední záznam „u nás N“, hláška po evidenci, `shPlanNote` (`res.qty`), PDF pod
    záznamem (`L.sent`, „U nás“ tučně; orientační řádek sestavy bez stavu), rozbor, pole
    `oqty` v `shManualDialog`, kontrola vlastního sloupce množství v `shColsDialog`.
  - Server: `ODM_AI_SH_FIELDS` planItem/plan + `qty`, prompt.
  - Výklad (od 2.71.1): „u nás“ = chybí kusy a díl má záznam nebo se část odeslala; v 2.71 poslední
    záznam odeslání s chybějícími kusy ukazoval „odesláno X z Y, zbývá“ (`part`).
  - Testy: core „Shortage (2.71)“, upravené 2.28/2.29/2.61/2.70 (nová pole výsledků), `test_odmeny`
    (`qty`, 426 pro 48), `e2e_shkroky` (plán s množstvím, evidence s WPA, tabulka, hláška, PDF,
    Excel rozboru, úprava tužkou), `e2e_upgrade_prev` 2.70 → 2.71 (archiv `04478bb`).
    `ODM_VERSION` 2.71.

Stav k 11. 11. 2026 (verze 2.70):

- Uživatel upravoval Shortage externě v samostatné aplikaci `ecko456/shortage` (Electron pro
  Windows, offline, verze 1.6.0, vychází z V2 `ce1ae20`) a chtěl změny vidět. Na otázku vybral
  „Převzít do V2“. Samostatný repozitář se neměnil.
  - Převod: deklarace, které byly ve V2 stejné jako v původní samostatné verzi (bez komentářů),
    nahrazené novým textem, nové vložené; `renderShortage`, `drawShortage` a `shColsFor` sloučené
    třícestně (AI návrh sloupců zůstal, ruční volba sloupce poznámek má přednost i před AI).
  - Core (23-shortage, 24-shortage-kroky): `SH_URGENT_COLS` (A–S), `shListBase` (A–S, nebo
    Kooperace A–H, nebo uložené), `shPlanningNote`, `shApplyNotes` (`notesTarget`), `SH_MAX_NOTE`
    2000, `SH_MAX_SUBS` 500, `SH_MAX_RECORDS` **3000** (samostatná 20 000; ve V2 méně kvůli
    šifrovanému stavu, limit serveru 12 MB), `list.records` (evidence i pro nepřiřazené kódy),
    `shRecordMap`, `shQrChoices`, `shSelectQr`, `shPlanDirectRow` (1. list: přesná shoda EAN +
    objednávka + line), `shApplyPlan` (qrChoices, `qrConflict`, `planMismatch`, operace z plánu,
    ruční poddíly `manual`/`sourceKey` zůstanou), `shAllSubs` (staré `cands` → `subs`, náhodné id
    při převodu, čištění je idempotentní), `SH_COLS.planItem`, `cols.list.note/noteChosen`,
    `cols.planItem.sheet/matchVersion`. `shPlanRow` bere všechny operace (`SH_SUB_OPS` už nefiltruje).
  - UI (26-shortage): okno sloupců urgentů vždy, plán = dvě okna (`planItem`, pak `plan`; podruhé
    jen když se liší), `shQrSelect`, `shEditBtn` (`[data-shedit]` → `shManualDialog` s id),
    poznámka = `textarea.sh-note` (Ctrl+Enter, mezery a zalomení se slijí), `#shClipboard`
    (`shReadClipboard`: Clipboard API, HTML i text), `#shSkipMove`, `#shPaste` pryč (Ctrl+V na
    stránce zůstal), sloupec PDF „Oddělení / Probíhající operace“, akce poddílu v `.sh-acts`
    (jinak tabulka na 1440 px přetékala o 7 px). Čeština hlášky po vložení záznamů opravená
    („uloženy 4 záznamy“).
  - Server `lib/ai.php`: `ODM_AI_SH_FIELDS` (`list` + `note`, nový `planItem`), prompt popisuje
    tabulku A–S a oba listy plánu.
  - Testy: core „Shortage (2.70)“ (převzaté testy samostatné aplikace), upravené 2.27–2.61,
    `test_odmeny` (`note`, `planItem`, 426 pro 47), e2e `e2e_shortage`, `e2e_shkroky` (plán se dvěma
    listy, kontrola různých sloupců), `e2e_upgrade_prev` 2.69.1 → 2.70 (seznam Shortage s `cands`
    ze starší verze: nic původního nechybí, čekající poddíl mezi poddíly).
  - Verze dat **48**, `ODM_VERSION` 2.70.

Stav k 9. 11. 2026 (verze 2.69.1):

- Uživatel: „v KPI přehledu mi to vypočítá kolik se zpracovalo kusů, ale už to nedokáže dát
  dohromady kolik bylo lidí v práci a kusy na osobu“.
  - Příčiny: lidé po skupinách KPI jsou jen u skupin s přiřazenými skupinami Matice (`mg`, jinak
    podle shodného názvu), bez nich kusy na osobosměnu chybí; dny bez souboru obsazenosti (říjen,
    kusy z Výroby) neměly lidi vůbec.
  - Core `waAttPeople(iso)` (13-kpi, cache podle objektu měsíce v `S.periods`): v práci = hodiny
    bez kódu, bez vedoucích, po skupinách Matice (`dvGroupOf`). `waDay`: bez `wa.days[iso]`
    doplní lidi z docházky (`attFb`), skupiny KPI přes `dvAuditGroups`; bez lidí ve skupinách
    kusy na osobu na všechny v práci bez neproduktivních a neevidovaných (`perAll`).
    `waTotals` → `perAll`, `attFb` (počet dní). UI `waHistHtml`: poznámka `.note.i` s odkazem do
    Nastavení, popisek dlaždice.
  - Testy: core „KPI (2.69.1)“, „KPI (2.17)“ bez docházky z ukázky (`S.periods = {}`),
    `e2e_zdroj`. `ODM_VERSION` 2.69.1, data beze změny (47).

Stav k 9. 11. 2026 (verze 2.69):

- Uživatel: „V KPI v kapacity a zaškolení mi to ukazuje nějaký nesmyslný plán, ať se plán řídí
  podle plán kapacit. A plán kapacit v reporty docházky, ať se o přesčasu a svátku stáhnou na
  polovinu. Protože se pracuje jen na jednu směnu a ne na dvě.“
  - Core (18-report-dochazky): `drHalf(iso)` (značka dne `ot`/`hol` v `drep.marks`), `drHalfN(n, iso)`
    (polovina nahoru), `capNeed(gid, iso)` (potřeba celkem z `S.capPlan`, v přesčas poloviční, bez
    plánu null). `drDay`: plán řádků i `req` dne poloviční, vrací `half`, `req` je za den.
  - `capTimeline`: den má `need[]` (po skupinách), `needTot`, `half`; `req` = pevný požadavek
    z Nastavení KPI (v přesčas poloviční), bez něj s Plánem kapacit null (platí plán skupin),
    jinak jako dřív. `capWeekReport`: plán skupiny = `need`, skupina bez plánu postaru (kdo měl
    přijít), `cap`, `half`, u skupiny `cap`. Texty `ctrWeek` (dlaždice, poznámka, štítek
    „přesčas“ v grafu), Report docházky den bere `d.req`.
  - Testy: core „Kapacity a zaškolení (2.69)“, upravený „Report docházky (2.41)“ (přesčas na
    polovinu). `ODM_VERSION` 2.69, data beze změny (47).

Stav k 8. 11. 2026 (verze 2.68):

- Uživatel: „pro tablety nebo pc s menším monitorem … ten pravý panel budou moct rozevřít a poté
  opět zavřít“.
  - 901 až 1599 px: tlačítko `#railTab` u pravého okraje (počet úkolů po termínu a blížících se,
    `railTabDraw`), úzké (28 px), leží v pravém okraji stránky (Shortage na 1440 px by s vyhrazeným místem přetekla). Klepnutí → `railDrawer(true)` (`html.rail-open`,
    panel `position: fixed` zprava, šířka do 440 px, závoj `#railScrim`). Zavře Esc (nejdřív
    bublina kalendáře), závoj, křížek `[data-railclose]` (jen ve vysunutém panelu) a přechod na
    stránku nebo úkol z panelu. Dialogy z panelu (nový úkol, poznámka, časová osa) ho nezavřou.
  - `railOn()` = široký monitor (`railWide`) nebo vysunutý panel; při změně šířky mimo rozsah se
    panel zavře. Stav vysunutí se nikam neukládá. Telefon beze změny.
  - Testy: `e2e_panel` (1440 a 1024: otevření, zavření Esc, závojem, křížkem, přechodem; 1700 bez
    tlačítka; telefon). `ODM_VERSION` 2.68, data beze změny (47).

Stav k 8. 11. 2026 (verze 2.67):

- Uživatel: „do ‚úkol na časové ose‘ nějaký přehled zadaných úkolů s možností úprav … do modulu
  ‚Úkoly‘ … pod skupinu ‚Úkoly na časové ose‘ ať se to nemotá do běžných úkolů“.
  - Modul Úkoly má přepínač `[data-tkpart]` `list|agenda` (`ui.tk.part`, jen v paměti okna):
    Běžné úkoly beze změny, Úkoly na časové ose = `tkAgendaHtml` (dlaždice, hledání `#tkAgQ`
    překreslí jen `#tkAgBody`, tabulka čas, úkol, opakování, od, příště `agNext`, dnes,
    `[data-agtedit]` → `agDialog`, `[data-agtdel]` s potvrzením, `[data-agtnew]`; `#tkNew`
    v této části přidá úkol na časovou osu). `agDialog` po uložení obnoví i Úkoly.
  - Core `agNext(x, od)` (nejbližší den výskytu, nejvýš 400 dní). Data beze změny (47).
  - Testy: `e2e_panel` (přehled, oddělení od běžných, hledání, úprava, smazání). `ODM_VERSION` 2.67.

Stav k 8. 11. 2026 (verze 2.66):

- Uživatel: „pod kalendář … vertikální časovou osu, kde bych mohl přidat úkol na nějaký čas
  a opakování ‚Každý den, každý týden, každý měsíc, každý sudý týden, každý lichý týden‘ … 2 hodiny
  před aktuální hodinou a 3 hodiny dopředu“ a „ať jde nastavit, zda to platí jen pro pracovní dny“.
  - Data (verze 47): `S.agenda[≤ 500] = {id 'ag…', title, time 'HH:MM', rep (`AG_REP`: once, day,
    week, even, odd, month), date (od kdy; den v týdnu a v měsíci se bere z něj), note, work (jen
    pracovní dny = Po–Pá bez svátků), at, by, done{iso: {at, by}} (nejvýš 400)}` (`cleanAgenda`).
    Historie `agChanges` (kind task, m `ag:`, `age:`, `agd:`, `agx:`).
  - Core nový díl `private/core/26-casova-osa.js`: `agWorkDay`, `agOn(x, iso)` (sudý/lichý podle
    ISO týdne `isoWeek().w`, měsíc 31. → poslední den kratšího měsíce), `agWindow(list, now)`
    (výskyty včera/dnes/zítra v okně now − 2 h … now + 3 h, `past`, `done`, `other`), `agAdd`,
    `agSet`, `agDel`, `agDone`, `agText`.
  - Pravý panel: karta `.rail-agenda` pod kalendářem (skupina a): hodinové značky `.ag-hour`,
    čára `.ag-now`, úkoly `.ag-item` (`[data-agdone]` splněno v ten den, `[data-agedit]` →
    `agDialog` s volbou Smazat), `[data-agadd]`. Panel se překresluje každou minutu (podpis
    s minutou, jinak nic nemění). Jen pracovní dny je u nového úkolu zaškrtnuté.
  - Testy: core „Časová osa (2.66)“, `e2e_panel` (přidání, pořadí proti „teď“, hodiny, splněno,
    úprava, smazání, historie), `test_odmeny` (426 pro 46). `ODM_VERSION` 2.66.

Stav k 8. 11. 2026 (verze 2.65):

- Uživatel: „napravo přidat ještě kalendář … události, svátky, víkendy a při najetí na datum
  … soupis události … ‚Přidat poznámku‘“, „kompletně projeď všechny panely … někdy to panel hodí
  zbytečně na spodek … řád a pořádek“, „v panelu napravo ‚Shortage‘ … prokliknout na odkaz a při
  najetí … status ‚Rozpracováno‘ ‚Hotovo‘ ‚Bude rozpracováno‘ ‚Čekáme na díl‘ … i v modulu shortage.
  Jen v PDF … jen zvolený status“ a „přidávat položky do shortage manuálně“.
  - Data (verze 46): `S.calNotes[≤ 3000] = {id 'cn…', date, text ≤ 1000, at, by}` (`cleanCalNotes`),
    položka i poddíl Shortage `st` (`SH_ST`: plan, run, wait, done) + `stAt`, `stBy` (jen když je
    stav, `shStClean`). Historie: `calChanges` (kind task, m `cal:`), Shortage `shst:` (p/v0/v1).
  - Core nový díl `private/core/25-kalendar.js`: `calNoteAdd`, `calNoteDel`, `calHoliday`,
    `calEvents(od, do, st, dnes)` (svátky, otevřené úkoly s termínem, konce trestů, poznámky),
    `calGrid(měsíc)` (týdny od pondělí). Shortage `shSetStatus(list, id, st, meta)`, `shStName`.
  - Pravý panel: karta Kalendář (`railCalendar`, `ui.railCal`, `[data-calday]`, `[data-calmove]`
    −1/0/1, bublina `#railCalPop` po najetí, klepnutí ji připíchne, `[data-calnote]` →
    `railCalNote`, `[data-calnotedel]`, `[data-caltask]`, `[data-calperson]`). Karty v pevných
    skupinách `.rail-col` a (kdo, akce, kalendář), b (úkoly, Shortage), c (poslední změny); úzký
    panel pod sebou, od 640 px dva sloupce (a | b nad c), od 980 px tři.
  - Shortage v panelu: název otevře modul, EAN je odkaz (`target=_blank`), po najetí čtyři stavy
    `[data-railshst]` (znovu klepnutí stav zruší). Modul: výběr `.sh-stsel[data-shst]` nad
    poznámkou (položka i poddíl), `[data-shmanual]` → `shManualDialog` (EAN, objednávka, název,
    index, množství, operace, odkaz, priorita, stav, poznámka; bez seznamu založí „zadáno
    ručně“). PDF: v Poznámkách „Stav: …“ před dopsanou poznámkou.
  - Řád karet na stránkách: `.settings-grid`, `.kt-depts`, `.dv-projs` vícesloupcová sazba
    (`columns`, `break-inside: avoid`), `.rule-grid` stejná výška.
  - Testy: core „Kalendář (2.65)“ a „Shortage (2.65)“, `e2e_panel` (kalendář), nový
    `tests/e2e_shstav.js`, `test_odmeny` (426 pro 45). `ODM_VERSION` 2.65.

Stav k 8. 11. 2026 (verze 2.64):

- Uživatel: „pro širokoúhlé monitory … adaptivní šířky toho panelu napravo … aktuální šířku bych
  definoval jako minimální“, „do rychlé akce … sub menu pro ‚Nový úkol‘ … ‚Požadavek pracovníka‘“,
  „v hlavním menu nalevo bych odstranil možnost přepínat ‚Hodnocené období‘ … přepínat měsíce jen
  v přehledu a docházce … skleněné buňky se šipkou dolu“ a „pokud tam zůstane místo … panel se
  Shortage“.
  - Pravý panel: mřížka `.shell` od 1600 px `254px minmax(0, var(--main-max, 1920px)) minmax(312px,
    1fr)`, `--main-max` 2400 px pro datové pohledy (`.shell:has(> .main > #view-….on)`, stejný
    seznam jako `max-width` `.main`, plus Lidé). Střed tedy nikdy není užší než dřív a panel
    vezme zbytek. `.rail` má `container-type: inline-size`, od 640 px karty `auto-fill
    minmax(290px, 1fr)`.
  - Rychlá akce Nový úkol: `railActHtml`, `.rail-split` s podnabídkou `.rail-sub` (najetí nebo
    fokus), `[data-railact="taskreq"]` → `tkReqDialog(null)`: pole Pracovník s nabídkou
    (`tkReqWhoText`, `tkReqPerson` = přesný text z nabídky, jinak jednoznačný `personFind`,
    vyřazení ne), zbytek jako požadavek u člověka.
  - Karta Shortage v panelu (`railShortage`, `.rail-short`): nejnovější seznam, počty, prvních
    5 položek (TOP, TOP 2, ostatní), klepnutí = Shortage. Jen v širším panelu (container ≥ 640 px).
  - Levé menu: `#periodNow` = dnešní měsíc (jen text, `.period-box > b`), `#periodSel` pryč.
    Výběr měsíce `perPickHtml(key)` v `#ovTitle` (Přehled) a `#attPick` (Docházka),
    `bindPerPick` (klik, mimo = zavřít, Escape, šipky), `setPeriod` + `renderAll`.
  - Testy: `e2e_panel` (podnabídka, požadavek s výběrem pracovníka, šířky 2560/3840, Nastavení
    do 1920, Shortage jen v širokém, výběr měsíce v Přehledu a Docházce). Data beze změny (45).

Stav k 7. 11. 2026 (verze 2.63):

- Uživatel si z hodnocení aplikace (8 úhlů, pořadí návrhů) vybral bod 7: rozdělení kódu po
  modulech a rychlejší testy.
  - **`private/app.js` a `private/core.js` už nejsou.** Kód je v `private/app/NN-nazev.js`
    (32 dílů) a `private/core/NN-nazev.js` (24 dílů), rozdělený na hranicích oddílů (`/* ===`).
    `app.php` vydá `app.js` / `core.js` jako spojení dílů v pořadí čísel (`glob('[0-9][0-9]-*.js')`,
    `sort`), takže prohlížeč dostane stejný jeden skript; při rozdělení ověřeno, že spojení je
    bajt po bajtu původní soubor. Všechno sdílí jeden globální rozsah jako dřív (pořadí dílů
    je pořadí kódu, nic se nepřesouvalo).
  - **Nový díl** = nový soubor s číslem na správném místě (třeba `26b-…` nejde, jen `NN-`;
    přečíslovat). Hledej přes `grep -rn … private/app private/core`.
  - `index.php`: `privateVersion` bere i `private/*/*` (bez toho by změna dílu nezměnila verzi
    a prohlížeč by držel starý kód 24 h).
  - Testy: `test_core.js` `coreSource()` spojí díly; `test_odmeny` ověří, že vydaný skript je
    přesně spojení dílů a že změna dílu změní verzi; CSP test čte díly.
  - **Souběžné testy:** `bash tests/run_e2e.sh [testy…]` (`JOBS`, `OUT`, `PW`, `CHROME`): každý
    test vlastní adresář, data a PHP server na portu 8500 + pořadí; `e2e_ai` s náhradním API
    (port 8598, jen jeden najednou). Bez `e2e_upgrade*` a `e2e_vedle` (Apache). Souhrn
    `$OUT/summary.txt`, výstupy `$OUT/<test>/out.log`, snímky v `$OUT/<test>/oshots-*`.
  - `ODM_VERSION` 2.63, data beze změny (45).

Stav k 7. 11. 2026 (ostrá verze se ruší):

- Uživatel: „verzi /odmeny/ už můžeš smazat. využíváme už jen v2“. Dostal příkazy pro server:
  záloha (`/root/odmeny-ostra-zaloha-RRRR-MM-DD.tar.gz`: `/var/www/odmeny`, `/var/lib/odmeny`,
  `odmeny.conf`), vypnutí (`a2disconf odmeny`, reload Apache), smazání kódu, dat, konfigurace
  a klonu `/root/odmeny`. Repozitář `ecko456/odmeny` na GitHubu zůstává (smazat ho může jen on).
  - Od teď platí: jediná běžící verze je `/odmeny_v2/`. `ODMENY_KOPIE=1` už nemá z čeho kopírovat
    (`install.sh` to ohlásí a nic nezmění). Pravidlo „ostrou verzi neměň“ je bezpředmětné.
  - Zapamatovaná zařízení a záložky prohlížeče na `/odmeny/` přestanou fungovat (pro V2 jsou zvlášť).

Stav k 7. 11. 2026 (verze 2.62.1):

- Uživatel: „Udělej ještě kompletní audit aplikace“ a „jak hodnotíš bezpečnost?“ (odpověď: vysoká,
  server data nevidí; omezení: všechny kartičky mají stejná práva, ztráta všech kartiček = ztráta
  přístupu, bezpečnost serveru mimo aplikaci).
  - Opraveno: akce `rev` neprodlužuje nečinnost relace (`$GLOBALS['odm_passive']` v api.php,
    `odm_session` pak nepíše `last_seen_at`; test v `test_rev_without_data`); `sanitizeState`
    kód docházky prázdný → null hned; `cleanWorkAudit` duplicita id podle textu;
    `blankWorkAudit` výchozí skupiny s `mg: []`. Test core „Audit (2.62)“ (dvakrát čištění =
    jednou, 40 náhodně poškozených stavů), nový `tests/e2e_xss.js` (podvržené HTML ve všech
    částech, ověří i, že text je vidět jako text).
  - SheetJS 0.18.5 → **0.20.3** (`private/vendor/xlsx.full.min.js`, z cdn.sheetjs.com
    `/xlsx-0.20.3/package/dist/`, Apache-2.0; uživatel výslovně souhlasil): opravuje CVE-2023-30533
    (prototype pollution) a CVE-2024-22363 (ReDoS). Prošla celá sada. Zmínky „SheetJS 0.18.5“
    ve starších poznámkách výš jsou historické; `shUnxml` a čtení `dense` zůstaly (neškodí).

Stav k 7. 11. 2026 (verze 2.62):

- Uživatel: „pokud pracuji v systému dva lidé, tak nemohou současně pracovat, protože to uzná data
  jen jednoho“. Navrženo 1. sloučení v prohlížeči, 2. průběžná aktualizace, 3. kdo je v aplikaci,
  4. data po modulech; vybral 1 a 2. Na dotaz, jestli šifrovat jen jména: ne, plynulost to samo
  nezlepší a odkryla by se hodnocení, sankce, docházka (vysvětleno, souhlasil).
  - Core (před `applyHist`): `mergeStates(base, mine, theirs, picks)` (tříbodově; objekty po
    klíčích, pole objektů s jedinečným `id` po položkách včetně přidání, smazání a pořadí, jinak
    hodnota; střet = oba změnili jinak, `picks[key]` mine|theirs, výchozí moje; `conflicts[{key,
    path (čitelně, `MERGE_TOP`, `MERGE_FIELD`, jméno člověka, název položky), mine, theirs}]`),
    `mergeIdArr`, `mergeInto` (zápis na místě: obsluha polí drží odkazy na objekty v S),
    `mergeShow`. Log a undo se slučují obecně (moje = base → jejich).
  - Server: akce `rev` (GET, `{rev, saved_at, by, mine}`, bez dat), `Vault.dataRev`.
  - UI (před `renderSaveState`): `resolveConflict` = `waitNoDialog` → `loadData` → `mergeTheirs`
    (`mergeDialog` jen při střetu) → `refreshView` (při rozepsaném poli až po blur) → `flushSave`;
    při chybě starý dialog `resolveConflictOld`. `syncCheck` každých `SYNC_EVERY` 20 s (test
    `window.ODM_SYNC_EVERY`), na focus a návrat do karty; bez mých změn rovnou načte, s nimi
    uloží (409 → sloučení), při otevřeném okně čeká. `describeChanges` při dalším uložení proti
    jejich verzi zapíše do historie jen moje změny.
  - Testy: core „Sloučení změn dvou lidí (2.62)“, `test_odmeny` `test_rev_without_data`, nový
    `tests/e2e_soubeh.js` (dvě okna se stejnou kartičkou). `ODM_VERSION` 2.62, data beze změny (45).

Stav k 7. 11. 2026 (verze 2.61):

- Uživatel: „zlepšit modul shortage, aby tam byly 3. kroky. 1. krok import tabulky urgentních dílů
  (… když je v excelu vyplň v buňce eanu červena, je to TOP shortage … vzorník barev … TOP nebo TOP2
  případně jen Shortage) 2. import výrobního plánu 3. import evidence o pohybu … ke každé položce
  … poznámky, právě probíhající operace a poslední dokončena, zda máme nějaký záznam interní. A u
  sestav bych viděl všechny poddily“ a „při každém importu … aby AI nadefinovala sloupce podle
  prvních dvou řádku“.
  - Data (verze 45): `S.shortage.cols {list, plan (+ sheet), move}` (`shColsClean`, výchozí
    `SH_COLS`), `S.shortage.colors {HEX: top|top2|none}`, seznam `moves {file, at, by, rows}`,
    položka `pop` (operace sestavy z plánu, jen když je), záznam `rec.op`, `rec.n`; `cands` drží
    i poddíly bez kódu (rozbor), `res.cands` počítá jen s kódem, `candsAll` všechny.
  - Core (blok „Shortage ve třech krocích (2.61)“): `shColsGuess` (nadpisy, `SH_COL_WORDS`),
    `shColsFromAi`, `shColIdx`, `shColsOf`, `shBuild(rows, cols, colors)` (vrací `fills`),
    `shApplyColors`, `shColorGuess`, `SH_INDEXED`, `shRecBuild(rows, cols)`, `shAiSample`
    (vlastní hranice nadpisů: nad 1. řádkem s číslem/datem/3+ číslicemi, nejvýš 3 řádky; zbytek
    jen typy), `shAnalysis`, `shAnalysisSheet`. Historie `shc:`, `shk:`, `shv:`.
  - Server: `odm_ai_shcols`, `ODM_AI_SH_SYSTEM`, akce `ai_shcols` (`{kind, sheets}`).
  - UI: panel `.sh-steps` (`#shSt1–3`, `shStepsDraw`, `#shMoveBtn`/`#shMoveFile`), `shColsFor`
    (AI nebo odhad; okno `shColsDialog` jen když se liší od uloženého bez ohledu na list, nebo AI
    napsala poznámku), `shColorDialog` (vzorník, swatch přes `style` z JS kvůli CSP),
    `shIndexedFills` (SheetJS barvy z palety zahodí, čte se `styles.xml` přes `waZip`),
    `shCellFill`, `shCssHex` (barvy ze schránky), `shMoveImport`, `shPasteRecs(rows, src)`,
    plán podle sloupců (`shPcOf`, `shPlanFast(…, pc, sheet)`), `ui.sh.last` + `[data-shrecols]`
    (Upravit sloupce), pohled `ui.sh.mode` `list|rozbor` (`shRozborHtml`, `[data-shanote]`
    `shAnalysisToNotes`, `[data-shaxlsx]` `exportShAnalysisXlsx`). PDF beze změny.
  - Testy: core „Shortage (2.61)“, `test_odmeny` `test_shortage_columns` (mock pozná `shortage`,
    426 pro 44), nový `tests/e2e_shkroky.js` (openpyxl: výplně RGB, motiv, paleta; plán; pohyb;
    AI přes `page.route`). `ODM_VERSION` 2.61.
- Uživatel se mezitím ptal na současnou práci dvou lidí (409 a Přepsat / Načíst). Dostal návrhy,
  čeká se na volbu.

Stav k 6. 11. 2026 (verze 2.60.1):

- Uživatel: „přihlašovací kartu udělal více skleněnou a takové matnější sklo, aby se ty barevné
  přechody více rozlévali“. První pokus (tmavé matné sklo se zrnem) odmítl: „moc tmavé
  a nepřirozené … zachovej efekt glass liquid“. Teď `lock.css` za `.lock-bg-on .lock-card`:
  tekuté sklo, `backdrop-filter: blur(44px) saturate(165%)` bez ztmavení, podklad jen
  rgba(24, 22, 22, .18) + bílé odlesky (radial nahoře vlevo, dole vpravo), hrana rgba(255,255,255,.34),
  vnitřní stíny jako lom světla, světlejší `--ink-2/--ink-3` a jemný `text-shadow` kvůli čitelnosti
  na světlých místech. Bez WebGL (bez `lock-bg-on`) panel beze změny.
- Uživatel: „jde zlepšit rozlišení toho pozadí?“ `lockbg.js` kreslí v rozlišení displeje
  (`devicePixelRatio`, nejvýš 2×) místo 0,6. `e2e_lockbg` to hlídá.

Stav k 6. 11. 2026 (verze 2.60):

- Uživatel poslal ukázku „Shader R“ (WebGL, Gaussova barevná pole bílá / tmavá / oranžová v
  deformovaném prostoru, zrno) a ptal se, jestli ji dát jako pozadí přihlašovací stránky.
  - `static/lockbg.js` (v index.php před lock.js): plátno `.lock-bg` jako první dítě `#lock`,
    `html.lock-bg-on`, shader převzatý z ukázky (teplá bílá místo čisté, `SCALE` 0,6 rozlišení),
    `window.OdmLockBg {frames, running}`. Skrytá karta = pauza, `prefers-reduced-motion` =
    jeden snímek, bez WebGL nic (zůstane `body::before`), po odemčení (`#lock` odstraněn)
    `cleanup` přes `isConnected` a MutationObserver. CSS v `lock.css` (závoj `.lock::after`).
  - Animace zámku z 2.55/2.57 se uživateli nelíbily; tohle je klidné pozadí, ne skládání panelu.
  - Test `tests/e2e_lockbg.js`. `ODM_VERSION` 2.60, data beze změny (44).

Stav k 6. 11. 2026 (verze 2.59):

- Uživatel (k návrhu dashboardu, 7 návrhů): „a co na širokém monitoru dát doprava náhled na úkoly?
  ostatní body 1 až 7 můžeš také aplikovat. dám na tvé doporučení“. Jen vzhled, data beze změny (44),
  PDF beze změny (`e2e_vzhled`).
  - Pravý panel `#rail` (`app.html` za `</main>`): `renderRail` (volá ho `renderTaskAlert`
    i `renderLogBadge`, překreslí se jen při změně podpisu `_railSig`), `bindRail`, `RAIL_MIN`
    1600, `railOn()`. Obsah: přihlášený (`ui.me.label`, iniciály), `RAIL_ACTS`
    (`[data-railact]`: task = `tkNewDialog`, jinak `showView`), úkoly (po termínu, blíží se,
    požadavky high, další otevřené, nejvýš 6, `[data-railtask]` → `openTaskFromPerson`),
    poslední 4 změny za 3 dny s `[data-logundo]` → `undoChange`, `[data-raillog]` → `openLog`.
    Když je panel vidět, `#taskAlert` se nekreslí.
  - Sbalitelné menu: `#sideMini` v `.side-foot`, `html.side-mini`, `SIDE_KEY`
    `odmeny.side.v1:<adresa>` v localStorage (jen zařízení), `applySideMini` dá tlačítkům menu
    `title` a `aria-label`.
  - `statTile(label, value, note, tone, {bar, trend})`, `trendChip`, `ovPrevTotals` (Tabáky
    a Kafe za předchozí měsíc s docházkou přes `withPeriod`, drží se podle `store.rev`).
    Pruhy: Přehled (Tabáky, Kafe, Výdej), Úkoly (Otevřené v termínu, Hotovo), Plán kapacit (Máme,
    Skupiny v pořádku). Kdo používá `data-w`, musí volat `setWidths`.
  - `catBars(items, {title, sub, shareText})` (barvy `.c1`–`.c6` = `--pie-1…6`, `.co`):
    KPI `kpHtml` (bez filtru oddělení) a `renderEnds`.
  - `smoothPath`, `smoothArea` (Catmull-Rom, kontrolní body omezené na rozsah úseku),
    `chartHover` (`g.hp` s `.xh`, `.xd` a `.hit`; CSS i `:has(.hit.on)`). `waLine` a `columnChart`
    s `line: true` (profil Docházka a Výroba). Grafy PDF (`ctr*`, `dr*`, `pdf*`) beze změny.
  - CSS na konci `app.css` „Prvky z návrhu dashboardu (2.59)“: kapsle `.stats` (monitor, sklo),
    skleněná plocha `.main > .view.on`, panel, úzké menu.
  - Testy: nový `tests/e2e_panel.js`, `e2e_lide` a `e2e_rucni` počítají šířku obsahu bez panelu.
    `ODM_VERSION` 2.59.

Stav k 6. 11. 2026 (verze 2.58):

- Uživatel po zkoušce dalšího návrhu (dvě ruce z písku): „animaci můžeš odstranit. Nelíbí se mi
  to.“ Úvodní animace zámku (2.55 ohnivá koule, 2.57 ruka z částic) je pryč: `static/intro.js`,
  řádek v `index.php`, CSS `intro-*` v `lock.css` a `tests/e2e_intro.js` smazané. Panel má zase
  jen původní animaci `rise`. Návrh se dvěma rukama se neodeslal. Kdyby ji chtěl zpátky,
  je v historii gitu (2.57 = `5f8ec48`). `ODM_VERSION` 2.58, data beze změny (44).
- Úvodní animace „HALA 2“ po přihlášení na telefonu (`playSplash`, 2.15) zůstala, to je jiná věc.

Stav k 6. 11. 2026 (verze 2.57):

- Uživatel: „temné pozadí a ruku inteligence tvořenou z částic z barev co používáme v panelu co se
  rozevře a částice utvoří postupně přihlašovací panel“. Nahradilo to ohnivou kouli z 2.55.
  - `static/intro.js` plná animace: `FINGERS` (4 prsty a palec: kloub, délka, úhel sevřený
    `a0` a otevřený `a1`), `inPalm`, `fingerAt(f, pose, t, s)`; částice (1050, telefon 620)
    mají místo v ruce, start rozptýlený po obrazovce a cíl v panelu (`dest`: 58 % obrys
    `rectPoint`, 12 % linka pod hlavičkou, zbytek plocha). Časy `T_FORM` 0,75 s, rozevření
    `T_OPEN0`–`T_OPEN1` 0,45–1,35 s, let `T_FLY0`–`T_FLY1` 1,45–2,35 s (oblouk, zpoždění do
    0,28 s), panel `T_SHOW` 2,1 s, konec `T_END` 3,05 s. Síť = sousedé spočítaní jednou
    (mřížka, `links`), vzruchy podle `sin`. Body jsou předkreslené sprity (`COLORS` z tokenů
    skla), `lighter`. Panel `introCard` už bez ořezu kruhem (průhlednost, rozmazání, 0,975).
  - Režimy, přeskočení a pojistka 4 s beze změny. `e2e_intro` (snímky po snímcích).
    `ODM_VERSION` 2.57, data beze změny (44).

Stav k 6. 11. 2026 (verze 2.56):

- Uživatel: „do modulu servis, možnost u položek co byly odeslány na servis ‚Vyřazeno servisem‘
  vedle tlačítka ‚Vráceno‘ a bude to chtít nahrát přílohu PDF nebo fotku protokolu k vyřazení“.
  - Data (verze 44): položka `rej {date (≥ odeslání), note ≤ 300, files[1–12] (id šifrovaných
    dílů, `SV_FILE_ID`), name ≤ 120, type `SV_REJ_TYPES` (pdf, jpeg, png), size, at, by}`,
    `svRejClean` (bez souboru nebo s datem před odesláním neplatí), s `rej` je `back` prázdné.
    `svShipDone` bere i `rej`, `svHistory` → `retired` = `rej.date`, `rejBy`, do průměru dní
    na servisu se nepočítá. `svFileIds` přidává díly příloh (záloha). Historie `svr:`.
  - UI: `[data-svrej]` (vedle Vráceno, `.sv-stbtns`; i u zařízení k vyřazení), `svRejDialog`
    (datum, soubor `accept="application/pdf,image/*"`, poznámka; bez souboru hláška),
    `svRejBytes` (PDF podle `%PDF-`, nejvýš `SV_REJ_MAX` 10 MB; fotka `shrinkPhoto(file, 2400,
    0.85)`), nahrání po dílech `SV_REJ_PART` 1 MB (limit serveru 1,5 MB base64 na soubor),
    `svRejView` (obrázek v dialogu, odkazy Otevřít PDF a Stáhnout s blob URL, `svRejUrls`),
    `[data-svunrej]` (smaže díly), smazání protokolu smaže díly (`svDropFiles`,
    `svDropSignFile` maže jen soubory, na které nic neodkazuje). Uzamčený: příloha jen ke čtení.
    Štítek „vše vyřízeno“ místo „vše vráceno“, když je něco vyřazené servisem.
- Uživatel: „v PC verzi přidej do menu pod Hodnocené období vyhledávací kolonku, která bude
  vyhledávat lidi podle jména nebo ID“.
  - `app.html` `#sideSearch` (`#sideQ`, `#sideQList`) v `.side-top`, na telefonu skryté.
    `personFind(raw)` (společné i pro `openPersonSearch`: přesné ID bez nul, začátek jména,
    část jména, část ID; vyřazení na konci), `openPersonKey`, `sideSearchDraw` (8 výsledků),
    `bindSideSearch` (šipky, Enter, Escape, výběr na mousedown, zkratka „/“ mimo pole).
  - Testy: core „Servis (2.56)“, `e2e_servis` (vyřazení s PDF 2,4 MB po dílech, fotka, otevření
    a stažení se stejným obsahem, uzamčení, zrušení a smazání maže přílohy), nový
    `tests/e2e_hledani.js`, `test_odmeny` (426 pro 43). `ODM_VERSION` 2.56.

Stav k 5. 11. 2026 (verze 2.55):

- Uživatel: „elegantní loading … při načítání přihlašovacího panelu … letící ohnivá koule co se
  rozletí nárazem a vznikne přihlašovací panel … moderní futuristické a pro letecký průmysl“.
  - `static/intro.js` (v `<head>` index.php za look.js): `html.intro-on` + `intro-full|short`
    skryje `.lock-card`, plátno `.intro-canvas` (pointer-events none): HUD (mřížka obzoru,
    zaměřovač na středu panelu, telemetrie), koule po Bézierově křivce z pravého horního rohu
    (`T_HIT` 1,3 s), náraz = záblesk, 2 rázové vlny, jiskry, uhlíky, kouř, otřes; `intro-reveal`
    spustí CSS složení panelu (`introCard`: clip-path kruh, rozmazání, okraj a skenovací linka).
  - Plná jednou za kartu (`sessionStorage odmeny.intro.v1:<adresa>`), pak `short` (0,6 s),
    `prefers-reduced-motion` = `none`. Přeskočení: pointerdown, keydown, skrytá karta;
    pojistka 4 s. `intro-reveal` zůstává (jinak by se znovu spustila animace `rise`).
    `window.OdmIntro {mode, done, skip}`.
  - Test `tests/e2e_intro.js` (snímky po snímcích). `ODM_VERSION` 2.55, data beze změny (43).

Stav k 5. 11. 2026 (verze 2.54):

- Uživatel (k hodnocení vzhledu: moc oranžové, barvy v Docházce, kontrast, malé písmo,
  prosvítání pozadí): „proveď všechny body a starý vzhled už můžeš z nastavení smazat, tento
  si nechám“.
  - `static/look.js`: vždy `data-look="glass"`, starý klíč `odmeny.look.v1:<adresa>` smaže,
    `window.OdmLook = {get}`. `#secLook`, `lookNow`, `setLook` pryč. CSS původního vzhledu
    zůstalo jako základ, sklo je pořád vrstva nad ním (`:root[data-look="glass"]`).
  - Tokeny skla: `--ink-2` #cdd1da, `--ink-3` #a6abb8. Konec `app.css` „Doladění skla (2.54)“:
    malá primární tlačítka neutrální, `.chip.on` jen `--acc-soft` + okraj, `.note.i` neutrální,
    `.cell.full/.part` bez směny šedé, `.cell.ed` tečka 7 px, `.cell.lk` šrafování
    (`:root .cell.cell.lk` kvůli síle selektoru), kalendář 25 px / 11 px, `body::before`
    opacity .4 na datových stránkách nad 900 px.
  - Testy: `e2e_vzhled` (bez volby, stará volba se zahodí, doladění, PDF nezávisí na CSS).
    `ODM_VERSION` 2.54, data beze změny (43).

Stav k 5. 11. 2026 (verze 2.53):

- Uživatel (telefon): „když kliknu na první stránce na ranní, otevře se pod tím kompletní menu.
  Spíše … hned od začátku vpravo dole ikona rozevíracího menu … ‚hlavní stránka‘ … dolu ‚Ostatní‘
  … scrolovací výběr modulů … jen v tom rozevíracím menu … maximálně plynulý systém“.
  - `homeOpenHtml` jen rizika (dlaždice pryč), plovoucí tlačítko i na `domu`. `openFab`: Hlavní
    stránka (`data-fab="domu"`, `I.home`), `.fab-quick` (`FAB_ITEMS`), `#fabMore` (`fabMoreHtml`,
    `fabOthers` = `HOME_TILES` bez rychlých, `.fab-mi` s ikonou, stavem `homeTileMeta` a odznakem),
    `[data-fabmore]` → `fabMore(on)` (`body.fab-more-on`, bez přechodu na stránku). Tečka na FAB
    při odznaku kterékoli části. Testy jdou na části přes FAB (Ostatní).
- Uživatel: „zkrácených směn … automaticky identifikuje lidi na odpolední směně v pátek. Zkrácená
  směna je pouze odpolední v pátek na 6,5“.
  - Core `friShort(e, d)` (pátek a `attSlotOf` = pm), `attendance` po dnech (`fridays` = zkrácené
    pátky, `friDiff` z nich), `planReality` a `capTimeline` taky. `e.shortFri` zůstává v datech,
    nepoužívá se (UI přepínač pryč, Excel sloupec ukazuje počet odpoledních pátků). Označeno
    `Oprava (2.53…)`, porovnání s původní aplikací maže `shortFri` v `comparableState`.
- Uživatel (Servis): „pokud potvrdím, že bylo již vráceno, odemkne se funkce ‚uzamknout‘ a protokol
  se zabalí … nepůjde již smazat … ikona pro rozevření“.
  - Data `shipment.lock {at, by}` (verze 43), `svShipDone(x)` (vše vrácené nebo k vyřazení), čištění
    zámek bez splnění zahodí, historie `svlock:`. UI: `[data-svlock]`, sbalená karta `.sv-locked`
    s `[data-svexpand]` (`ui.sv.exp`, jen v paměti), rozbalená jen ke čtení s `[data-svunlock]`,
    pojistka v click handleru proti úpravám uzamčeného.
  - Testy: core „Zkrácený pátek (2.53)“ a „Servis (2.53)“, upravené 2.24 a 2.49, `e2e_mobil`
    (Ostatní), `e2e_servis` (uzamčení), navigace v e2e přes FAB, `test_odmeny` (426 pro 42).
    `ODM_VERSION` 2.53.

Stav k 5. 11. 2026 (verze 2.52):

- Uživatel: „funkci, která rozpozná kdy evidujeme první záznam o tom, že u nás pracovník pracuje.
  A vždy tam bude ikona … ve zkušebce … když na tu ikonu najedu … od kdy u nás pracuje a kdy mu
  končí zkušební doba. Zkušební doba je vždy na 3 měsíce.“
  - Core (před `endDeptOf`): `probStarts()` (první den s hodinami bez kódu v `S.periods`, nebo
    s příchodem v `dv.pres` přes `dvWidMap`; `first` = první den evidence vůbec; cache podle
    `probSig`), `probEnd` (+ 3 měsíce − 1 den, chybějící den = konec měsíce), `probationOf(e,
    today)` (null: bez záznamu, začátek = první den evidence vůbec, po konci), `probText`.
    **Nic se neukládá**, data beze změny (42).
  - UI: `probIcon(e)` (`.prob-ic`, `.soon` posledních 14 dní, `title` + `data-prob`, na dotyku
    toast v globálním click handleru) v seznamu Lidí, detailu (+ `.prob-line`), profilu, Přehledu,
    Docházce a Matici (`mxWhoHtml`). `I.hourglass`.
  - Kdyby uživatel chtěl začátek opravit ručně (lidé z doby před evidencí), přidat pole
    u člověka (to už by byla změna dat).
  - Testy: core „Zkušební doba (2.52)“, `e2e_rucni` krok 9. `ODM_VERSION` 2.52.

Stav k 5. 11. 2026 (verze 2.51):

- Uživatel: „možnost v docházce úpravy hodin a vždy to bude vyžadovat důvod úpravy … ať pak už
  nepřepíše opětovné nahrání … zámek … uzamknout celý měsíc“, „panely jsou zbytečně smrsknuté …
  lépe využívat širší monitory“ a „k danému odsouzenému … ‚Požadavek pracovníka‘ … co osoba chce,
  termín a závažnost … vyskakovat v modulu ‚Úkoly‘“.
  - Data (verze 42): `S.attEdits[měsíc][klíč][den] = {h, c, note (povinný), at, by, wh, wc}`
    (wh/wc = hodnota ze souboru), `S.attLocks[měsíc] = {all, days[], at, by}` (`cleanAttEdits`,
    `cleanAttLocks`). Úprava se zapisuje i přímo do `S.periods` (výpočty beze změny).
  - Core (před `endDeptOf`): `attEditSet` (hodnota rovná souboru úpravu zruší), `attEditDel`,
    `attLockSet` (iso prázdné = měsíc), `attLocked`, `attEditOf`, `attProtect(m, old)` po každém
    nahrání (uzamčené dny z předchozí docházky, úpravy znovu, `wh/wc` = nový soubor),
    `attEditChanges` (historie kind `adjust`, m `atte:`/`attl:`). `dvToPeriods` uzamčený měsíc
    přeskočí (`{locked: true}`) a vrací `lockedDays`, `edits`; `dvRehours` úpravy a zámky vynechá.
  - UI: `calStrip(a, e, {m, key})` = tlačítka `[data-attcell]` (`.ed`, `.lk`), hlavička se zámky
    `[data-attlock="iso"]` a `[data-attlock=""]` (měsíc, potvrzení), `attEditDialog`,
    `attToggleLock`, `dvPeriodsText`. `doImport` uzamčený měsíc odmítne, smazání období taky.
  - Šířka: `.main` nad 1100 px max 1920 px, datové pohledy (`:has(> #view-….on)`) 2400 px.
  - Úkoly: `person` (klíč), `pname`, `sev` low|mid|high (`TK_SEV`, `tkIsReq`, `tkPersonName`),
    řazení podle závažnosti při stejném termínu, `tkOverview.req/reqHigh`, Excel sloupce Druh,
    Pracovník, Závažnost. UI: karta `tkReqCard` v detailu člověka (`[data-tkreqadd]`,
    `tkReqDialog`, `[data-tkreqopen]`), filtr `req`, `#tkSev`, odkaz `[data-tkperson]`,
    připomínka `#taskAlert` i pro otevřené požadavky s vysokou závažností bez termínu.
  - Testy: core „Docházka (2.51)“, nový `tests/e2e_rucni.js`, `test_odmeny` (426 pro 41),
    `e2e_upgrade_prev` (`ADDED` attEdits, attLocks). `ODM_VERSION` 2.51.

Stav k 5. 11. 2026 (verze 2.50):

- Uživatel: „V docházce už můžeš tedy odstranit ‚XLSX, XLSM nebo CSV.‘ Říjen mám uzavřený … v docházce
  bude jiná barva pro ranní a jiná pro odpolední. A jiná pro přesčasy ve svátek nebo o víkendu.
  A ať to je takto rozdělené i v excelu … do jednoho listu pod sebe. Jméno, příjmení, ID, součet
  hodin … jednotlivé dny rozepsané a barevně oddělené … seřadit podle skupin směn a v těch směnách
  podle jména.“
  - `app.html`: plocha `#drop`, `#btnPick` a nápověda formátu pryč, zůstal skrytý `#file`
    (testy přes `setInputFiles`, první nahrání ukázky). `wireDrop` snese chybějící plochu.
    Pruh ukázky: „Otevřít KPI“ (`data-go="audit"`).
  - Core (před `endDeptOf`): `ATT_KIND`, `attSlotOf(e, iso)` (příchod z `dv.pres` < `DV_PM_FROM`
    = ranní, jinak odpolední; bez příchodu `slotOn` s `morningGroup` a `capReport.s1am`; `rot`/`none`
    = null), `attDayKind(e, c)` (am|pm|ot víkend/svátek s hodinami|work|abs|miss|off),
    `attShiftSheet(p)` (skupiny `SHIFTS` + Bez směny, řazení příjmení a jméno, `dayTot`, `total`).
    `attExport`/`attExportSheets` zůstaly (PDF a core testy).
  - UI: `calStrip(a, e)` třídy `sh-am`/`sh-pm` (CSS přes `--pie-1`/`--pie-3`, `color-mix` u části
    směny), legenda; Excel vlastním zápisem `xlsxStyled(sheets)` (SheetJS CE styly nezapisuje):
    `XS_STYLES`, `xsZip` (stored + CRC32), `xsSheetXml` (inlineStr, ukotvení `freeze`, šířky),
    `attXlsxSheet(x)`, `exportAttXlsx` → jeden list „Docházka“. Noční příchod (≥ 12:00) je odpolední.
  - Testy: `e2e_att_export` (jeden list, hlavička, člověk proti `attendance`, pořadí skupin,
    CELKEM, barvy přes openpyxl proti `attDayKind`, kalendář s `sh-am`/`sh-pm`, bez plochy).
    `ODM_VERSION` 2.50, data beze změny (41).

Stav k 5. 11. 2026 (verze 2.49):

- Uživatel: „Prověř zda v KPI výkonost na osobu, přepočítává ks/den na počet odpracovaných dnů
  z docházky, pokud byl celou směnu, tak 7,5 hodiny, pokud méně, tak den má méně hodin“.
  - Nebylo tak: `kpiPerf` bral `workedDays` (každý den s hodinami = 1).
  - Core `shiftDays(att)` (za `workedDays`): součet min(h, `ds`) ÷ `ds` přes `att.cells`
    (`ds` = `dayShift`, tj. `S.settings.shift` 7,5 h, zkrácený pátek `friShift`), kód
    nepřítomnosti = 0 h, na 0,01. `kpiPerf`: `days` = `shiftDays`, navíc `wd` (dny v práci)
    a `hrs`; `kpiAvg` sčítá i `wd`, `hrs`. `kpiSheets`: sloupce Dny v práci, Odpracované
    hodiny, Odpracované dny (přepočet na směnu).
  - UI `kpHtml`: Dny `nf(days, 1)` + `.kp-wd` „z N“, dlaždice „ks ÷ N odpracovaných dnů (h)“,
    vysvětlivka. **Kapacity a zaškolení (`perfOf`) zůstávají na `workedDays`**, uživatel chtěl
    jen KPI; kdyby chtěl stejně i tam, změnit `perfOf`.
  - Testy: core „KPI (2.49)“ a upravený „KPI (2.44)“ (Excel), `e2e_vykon` (Excel, kratší den).
    `ODM_VERSION` 2.49, data beze změny (41).

Stav k 5. 11. 2026 (verze 2.48):

- Uživatel: „Budu naposledy nahrávat excel s docházkou za říjen, můžeš přidat raději AI na kontrolu
  správnosti? Může se stát, že bude prohozené jméno a příjmení. Ať to jen přiřadí hlavně hodiny do
  docházky a nikoho nepřidává do systému apod.“
  - **Bez AI, schválně:** AI by musela dostat jména lidí (pravidlo: žádná osobní data třetí
    straně). Párování běží v prohlížeči a na prohozené jméno a překlepy stačí. Uživateli řečeno.
  - Core (před evidencí práce): `attDist` (Levenshtein), `attSig` (slova seřazená),
    `attMatch(per, emps)` → `rows[{k, first, last, emp, how exact|swap|fuzzy|none|dup, cand, dupOf}]`,
    `n`, `missing` (bez vyřazených a vedoucích). Přesně, pak prohozené (`swap` i slova v jiném
    pořadí), pak podobnost ≤ 2 znaky (jen jednoznačně), každý člověk nejvýš jednou.
    `attRemap(per, assign)` → řádky pod klíčem a jménem ze systému, nepřiřazené pryč (`skipped`).
  - UI `doImport`: mimo ukázková data `attMatchDialog(m, file)` (jen když něco nesedí přesně nebo
    někdo chybí; tabulka `.att-matchtab`, `select[name="am-i"]`, validace dvojího přiřazení,
    `<details class="att-miss">`), pak `store.note` „Nahrána docházka za … : přiřazeno lidí …“,
    zpráva `.att-matchmsg`. Lidé se nepřidávají a jména se nepřepisují. Ukázková data (první
    nahrání) beze změny.
  - Testy: core „Docházka postaru (2.48)“, nový `tests/e2e_jmena.js`. `ODM_VERSION` 2.48, data
    beze změny (41).

Stav k 5. 11. 2026 (verze 2.47.1):

- Uživatel: „V KPI v Report docházky mi nejde stáhnout PDF, vyskočí chyba, že se PDF nepovedlo
  načíst. Dále v ‚Poznámka‘ uvádět jen počty, kolik nepřišlo a kolik má neschopenku, nemusíš
  uvádět ID.“
  - Chybu jsme nevyvolali: PDF vzniklo ve všech režimech na ukázkových datech, na 30 skupinách
    (2 strany), na neobvyklých ID a názvech (azbuka, emoji), se skupinami reportu i s neznámými
    ID. Nevyšlo NaN v obsahu ani poškozený soubor (pymupdf). Nejpravděpodobnější příčina je
    hláška „PDF se nepovedlo: nepodařilo se načíst …“ z `pdfAsset` nebo `loadScript`, tedy
    stažení písma nebo jsPDF ze serveru (401 po vypršení relace, výpadek sítě).
  - `pdfAsset` drží písma v paměti (`PDF_ASSETS`), síť zkusí znovu, 401 → `PDF_EXPIRED`
    (zamknout a odemknout). `pdfLib()` načte jsPDF (opakování a rozlišení 401). `withPdf` píše
    „PDF se nepovedlo vytvořit: …“ a chybu do konzole. Report docházky bez `mono`.
  - `drDay` poznámka: „nepřišlo N“ (vždy, když někdo chybí) · „neschopenka N“, bez ID.
  - **Když se chyba bude opakovat, chtít od uživatele přesný text hlášky.**
  - Testy: core „Report docházky (2.41)“, `e2e_report` (poznámka 27. 10., hláška při 401).
    `ODM_VERSION` 2.47.1, data beze změny (41).

Stav k 4. 11. 2026 (verze 2.47):

- Uživatel poslal návrh (Google Drive, `dashbordv11.zip`: React + Vite finanční dashboard,
  sklo, oranžová) a chtěl: „převezmi ten vzhled do odměny, jen pdf exporty apod. neměň … jde
  pouze o vzhled systému a udělej zálohu ať se můžeme přirozeně vrátit zpět“. Archiv do repa
  nepatří (fotka pozadí a avatary jsou cizí díla), převzat jen styl.
  - **Vzhled je vrstva `:root[data-look="glass"]`**: tokeny, písmo Jakarta (`static/fonts/plus-
    jakarta-sans-*`, OFL) a základ (tlačítka, pole, zámek) v `static/lock.css`, komponenty na
    konci `private/app.css`. Bez atributu / s `classic` platí původní CSS beze změny.
  - `static/look.js` (v `<head>` index.php, před vykreslením): `localStorage`
    `odmeny.look.v1:<adresa>` → `html[data-look]`, výchozí `glass`, `meta theme-color`,
    `window.OdmLook {get, set}`. V app.js `lookNow`/`setLook`, výběr `#secLook` v Nastavení →
    Zabezpečení („Vzhled aplikace (toto zařízení)“). Volba je jen pro zařízení, ne ve stavu
    ani v prefs (verze dat beze změny, 41).
  - Papíry `.ctr-paper`/`.dr-*` zůstávají bílé, PDF se kreslí bez CSS. `e2e_vzhled` porovná
    PDF Plánu kapacit v obou vzhledech (text i pixely přes PyMuPDF).
  - Návrat kódu: 2.46 = `1019df6` (poslední bez nového vzhledu).
  - Testy: nový `tests/e2e_vzhled.js`, ostatní e2e běží ve skle (výchozí). `ODM_VERSION` 2.47.

Stav k 4. 11. 2026 (verze 2.46):

- Uživatel: „modul ‚Úkoly‘ kde půjde zadat úkol, termín, zodpovědná osoba a půjde měnit stavy
  a přidávat komentáře s časovou osou. Případně připomínky, pokud se bude blížit termín. A možnost
  zadat ‚Opakovat úkol‘ každý týden, měsíc, půl rok, rok.“
  - Data `S.tasks = {list[≤ 1000]: {id 'tk…', title ≤ 200, desc ≤ 4000, due ISO|'', owner ≤ 80
    (volný text, nabídka z Lidí, vedoucích, dřívějších osob a kartičky), state `TK_STATES`
    new|run|wait|done|cancel, repeat ''|week|month|half|year, remind `TK_REMIND` (dní předem,
    výchozí 2), at, by, done, doneBy, series, next (id dalšího opakování), tl[≤ 500]: {id 'te…',
    at, by, k new|c (komentář, text)|s (stav, v0, v1)|f (pole f: title|due|owner|repeat|remind|desc,
    v0, v1)|r (založeno opakování, text)}}}` (`blankTasks`, `cleanTasks`). Verze dat 41.
  - Core (před SERVIS): `tkAdd`, `tkSet` (každá změna do `tl`; Hotovo u opakovaného založí další
    úkol jen jednou přes `t.next`), `tkStep` (měsíc zarovná konec měsíce), `tkNextDue` (aspoň
    dnešek), `tkComment`, `tkDelComment`, `tkDelete`, `tkDue`/`tkDueText`, `tkOverview` (late, soon
    = do `remind` dní, done30, owners), `tkSort`, `tkTlText`, `tkSheets`, `tkChanges` (kind `task`,
    m `tkn/tks/tkd/tko/tkt/tkr/tkm/tkp/tkc/tkx:`).
  - UI (sekce ÚKOLY za Plánem kapacit): pohled `ukoly` (`#view-ukoly`, `#tkView`, `#tkNew`,
    `#tkXlsx`), `ui.tk {sel, filter, owner, q, draft, alertOff}`, `renderTasks` (dlaždice, čipy
    `[data-tkf]`, `#tkOwnerF`, `#tkQ` překreslí jen `#tkList`), detail `tkDetailHtml` (pole se
    ukládají na `change` bez překreslení formuláře, `tkRefresh` hlavičky, `#tkRep` a časové osy;
    termín `#tkDue` po 1,5 s nebo na focusout, Chrome posílá change po číslicích), stavy
    `[data-tkstate]`, komentář `#tkNewC` + Ctrl+Enter, `[data-tkcdel]`, `[data-tkdel]`, odkazy na
    předchozí a další opakování. Připomínky: odznak `#navTasks` (`.late` červeně), pruh
    `#taskAlert` (`renderTaskAlert`, mimo Úkoly, Skrýt do další změny). Telefon: dlaždice,
    položka plovoucího menu, `navSub` `task` (Zpět zavře detail). Historie filtr Úkoly.
  - Uživatel pak: „v Docházka, ať to vždy propisuje maximálně 7,5 hodiny a příchody do 6:15 …
    jako příchod v 6:00, to samé odchod. Od 13:45 do 14:15 odchod ve 14:00. To samé pro odpolední
    … pokud … čipne si později, tak to vždy zaokrouhlí na 15 minut (7:31 → 7:45)“.
    - Core `dvRound(a, b)` (směna podle příchodu: před 12:00 ranní 6–14, před 21:00 odpolední 14–22,
      jinak noční 22–6, tu jsme doplnili sami; příchod ≤ začátek + 15 = začátek, jinak nahoru na
      čtvrthodinu; odchod ≥ konec − 15 = konec, jinak dolů), `dvHours` = zaokrouhlený pobyt − 30 min,
      nejvýš `DV_MAX_H` 7,5. Odchod dřív než 15 min před koncem dolů (přísně, uživatel výslovně
      neřekl). `dvRehours(apply)` přepočítá hodiny listopadu a dál uložené postaru; UI
      `attRehoursHtml` v Docházce s `[data-attrehours]`. `dvPreview` vrací `rin/rout`, vzor ukáže
      „7:31 → 7:45“. Lidé v práci a výkon v KPI dál ze skutečného pobytu (`dvStay`).
  - Testy: core „Úkoly (2.46)“ a „Docházka (2.46)“ (příklady ze zadání), staré testy 2.42 čekají
    7,5 h místo 8 h, nový `tests/e2e_ukoly.js`, `e2e_mobil` (16 položek menu, Úkoly v plovoucím
    menu), `e2e_upgrade_prev` 2.41 → 2.46 (`ADDED` tasks, úkol v kroku 5), `test_odmeny` (426 pro 40).
    `ODM_VERSION` 2.46.
  - `e2e_matice` měl pevné plnění normy 84,9 % z ukázkových dat a od listopadu padal i na 2.45.4
    (ověřeno); teď bere `normPctOf(productionOf(…))`. Pozor: test končí `process.exit(1)`
    a chyby vypisuje bez slova PROBLÉMY, hlídej návratový kód.

Stav k 4. 11. 2026 (verze 2.45.4):

- Uživatel: „Pod ‚Vývoj počtu lidí proti potřebě‘ máš řádek ‚Chybí‘ … uvádět čistě hodnoty ze
  souhrnu celku … splněno zeleně 0 … pod potřebou červeně − číslo. A pod Oddělení po měsících
  dej chybí souhrn podle oddělení“.
  - Core `capPlanOutlook`: `tot.gap[]` a `tot.nowGap` = max(0, potřeba celku − lidé celku), jen
    s plánem (jinak null). `tot.short` / `nowShort` zůstal součet po odděleních.
  - UI `cpOverviewPdf`: řádek pod grafem z `gap` (0 zeleně, −N červeně), podklad ohroženého
    měsíce v grafu podle `gap`; pod tabulkou oddělení řádek „chybí · součet po odděleních“.
  - Testy: core 2.45.3 (gap, případ, kdy přebytek Obrobny vyrovná celek), `e2e_plankap`.
    `ODM_VERSION` 2.45.4, data beze změny (40).

Stav k 4. 11. 2026 (verze 2.45.3):

- Uživatel (k PDF Plánu kapacit): „na první slide manažerský pohled na ohrožené měsíce nebo
  požadavek počtu lidí v daných měsících, dal trendovou křivku vývoje … oddělit barevné roky
  v pod textem 2026 … modré a zelené rok 2027“.
  - Core (před `cpChanges`): `capPlanOutlook(all, today, n)` → `ids`, `depts[{name, set, need,
    now, overdue, months (zůstane), leave, short, nowShort}]` (oddělení s lidmi nebo plánem),
    `planned`, `tot{now, need, months, leave, short, risk}` (jen oddělení s plánem, bez plánu
    všechna), `riskN`, `first`, `min`, `maxShort`, `nowShort`. Ohrožený měsíc = aspoň jedno
    oddělení s plánem pod potřebou.
  - UI: `cpOverviewPdf(P, o)` jako 1. strana `exportCapPlanPdf` (štítek OHROŽENO N Z 12 MĚSÍCŮ /
    BEZ OHROŽENÍ / BEZ PLÁNU, 4 dlaždice, křivka proti čárkované potřebě s červeným podkladem
    ohrožených měsíců a řádkem „chybí“, tabulka oddělení × měsíce se záhlavím, legenda).
    `cpYearC(id)` (sudý rok `blue`, lichý `green`), `cpYearAxis(P, cols, x0, cw, y)` (barevná
    linka a rok pod měsíci) i na stranách oddělení místo roku pod prvním měsícem.
  - Testy: core „Plán kapacit (2.45.3)“, `e2e_plankap` (3 strany, text 1. strany proti
    `capPlanOutlook`, oba roky). `ODM_VERSION` 2.45.3, data beze změny (40).

Stav k 3. 11. 2026 (verze 2.45.2):

- Uživatel: „v Kapacity a zaškolení to PDF stahuje se všemi daty, chtěl bych vždy export jen za
  zvolené období“ a „v Konce trestů neukazuj ‚Vedoucí‘ a udělej možnost exportu do PDF … podíl
  kdo končí, zda se jedná o zaškolené nebo v zaškolení“.
  - Zvolené období = vybraná stránka reportu (`ui.wa.ctShown`). `exportCtPdf(button, noPerf)`
    kreslí jen ji: soubor `kapacity-zaskoleni-RRRR-MM[-bez-vykonu].pdf`, `…-RRRR-Wtt.pdf`,
    `…-vyvoj-OD-DO.pdf`. Excel zůstal za celé období.
  - Core `endsOverview`: bez vedoucích (žádný řádek Vedoucí), `lim` = `waTrain().pct`, u člověka
    `pct` a `st` `ok|tr|none` (`END_ST`), `months[].st`, `depts[].st/goneSt`,
    `st{head, gone, stay, overdue}`. Excel Lidé má Zkušenost a Dovednosti %.
  - UI: `[data-endpdf]` → `exportEndsPdf`, `endsPdf(P, ov)` přes `ctrPdf` (dlaždice, 100% pruhy
    Odchází / Zůstane, sloupce po měsících po zkušenosti, oddělení, další strany seznam jen
    s ID), `END_ST_C`, `endPdfBar`. V seznamu lidí je „zaškolený 100 %“ / „v zácviku …“.
  - Uživatel pak: „v docházce udělej možnost exportu do excelu nebo do pdf za daný měsíc se
    celkovým součtem hodin a u každého ať je vidět i oddělení“. Core `attExport(p)` (lidé
    s `endDeptOf` nebo „Není v Lidech“, ID, skupina, `workDays/workHours/wkDays/wkHours/
    totalHours`, absence, omluveno; po odděleních v pořadí skupin; součty `tot`) a
    `attExportSheets` (listy Docházka, Po dnech a Oddělení; Po dnech z `cells`: hodiny, kód nebo
    „D (8 h)“, součty dne z `dh` jen odpracovaných hodin). UI: lišta `.att-bar` v `renderAttendance`
    (`[data-attxlsx]`, `[data-attpdf]`), `exportAttXlsx`, `attPdf`/`exportAttPdf` přes `ctrPdf`
    (dlaždice, pruhy hodin po odděleních, tabulka s oddělením, součtem a CELKEM), soubory
    `dochazka-RRRR-MM.xlsx|pdf`. Test `tests/e2e_att_export.js` (ukázková data).
  - Testy: core „Konce trestů (2.45.2)“, `e2e_konce` (vedoucí skrytý, zkušenost, PDF),
    `e2e_kapacity` (PDF měsíce, bez výkonu, týdne a vývoje). `ODM_VERSION` 2.45.2, data beze
    změny (40).

Stav k 3. 11. 2026 (verze 2.45.1):

- Uživatel: „V KPI v Report docházky mi stále neukazuje žádná data v ‚Výkon na odpracovanou hodinu
  (index, Ø září = 100)‘ mělo by to načítat z ‚Nahrát docházku a výkony‘ … tisknout PDF s Výkonem
  nebo bez výkonu. A výkon měř primárně na odpracovaný den“ a „v sekci lidí by měl fungovat
  vyhledávač i podle ID“.
  - Příčina: `capTimeline` → `perfOf` bral jen normohodiny (`rec.norm`) ÷ hodiny, soubor
    Docházka a výkony normu nemá.
  - Core: `perfOf` = kusy ÷ odpracované dny (`workedDays(attendance)`, ve `withPeriod`). Kusy
    z `dv.perf[m]` (součet `p[díl][0]`, ID přes `dvWidMap`), bez nich z `S.production[m]`
    (`prodKeyFor`). Počítá se jen člověk s kusy > 0 a dny > 0. Části `{ks, days, normH, workH}`,
    `ctPerfFin` → `ok/tr/all` = ks/den, `nh` = normohodiny/h (doplňkově), `ks`, `days`, `src`
    `dv|prod`. Excel Po měsících: Dokončené kusy, Odpracované dny lidí s výkonem, Ø ks na den.
  - UI: `ctrMonth(month, {noPerf})` (bez dlaždic výkonu, grafu, sloupců a vysvětlivek;
    `ctrStackChart(r, 1280)` přes celou šířku), tlačítka `[data-wactpdf=""]` (s výkonem)
    a `[data-wactpdf="noperf"]`, `exportCtPdf(button, noPerf)`, soubor `…-bez-vykonu.pdf`.
    Texty „Výkon na den (index)“, „Výkon na odpracovaný den (index, Ø … = 100)“.
  - Lidé: `renderPeople` hledá i v `e.wid` (text i `widKey`, bez úvodních nul), při hledání
    řádek ukáže „ID …“. Placeholder „Hledat jméno nebo ID…“.
  - Testy: core „Kapacity a zaškolení (2.30)“ (kusy na den, přednost `dv.perf`), `e2e_kapacity`
    (PDF bez výkonu), `e2e_lide` (hledání podle ID). `ODM_VERSION` 2.45.1, data beze změny (40).

Stav k 3. 11. 2026 (verze 2.45):

- Uživatel: „přidat tlačítko do ‚Poslední změny‘ Vrátit zpět? Vždy ať tam jsou poslední změny jen
  za poslední 3 dny.“
  - Data: `S.undo[≤ 400] = {id 'u…', at, by, card, ch[{p (cesta), b (hodnota před) | d: 1 (předtím
    nebylo), h (otisk po změně, „-“ = smazáno)}], size}` (`cleanUndo`), záznam historie má `u`
    (ids uložení, slučování v `appendLog` je sjednotí) a `un {at, by}` (vráceno). Verze dat 40.
  - Core (před `applyHist`): `undoCanon`/`undoHash` (kanonický JSON, pořadí klíčů nevadí),
    `undoEq`, `undoDiff` (objekty po klíčích, pole celé; bez `log`, `undo`, `v`), `undoRecord`
    (nad `UNDO_PATCH_MAX` 1 MB → `{big}`, bez vrácení), `undoPrune` (3 dny `UNDO_DAYS`, celkem
    `UNDO_TOTAL_MAX` 2,5 MB), `undoable(entry)`, `undoApply(st, ids, meta)` (od nejnovějšího,
    jen cesty se sedícím otiskem; přeskočené zůstanou v `S.undo`, `un` jen záznamy, jejichž
    všechna uložení se vracela).
  - UI: `flushSave` k uložení se záznamy přidá `undoRecord(store.base, shared)` a `u` do záznamů;
    `openLog` jen poslední 3 dny, `logListHtml(…, withUndo)` (`.log-acts`, `[data-logundo]`
    = `at|ids`, štítek vráceno), `undoChange(ref)` (potvrzení s `.log-undolist`, `sanitizeState`,
    jeden záznam „Vráceno zpět: …“ přes `store.note` bez `keep`, aby se neslučoval), `I.undo`.
  - Test `test_core` „srážky ze mzdy … (2.12)“ závisel na měsíci ukázkových dat (od listopadu
    padal i bez změn): teď bere měsíc a pásmo, ne pevné 84,9 % a září.
  - Testy: core „Vrátit zpět (2.45)“, nový `tests/e2e_undo.js`, `test_odmeny` (426 pro 39),
    `e2e_upgrade_prev` 2.41 → 2.45 (`ADDED` undo). `ODM_VERSION` 2.45.

Stav k 31. 10. 2026 (verze 2.44.2):

- Uživatel: „Přepracuj ‚Plán kapacit‘ PDF … divočina nepřehledná … neuváděj ani ID … souhrn
  na každé oddělení na jeden list a zakomponuj přehled kdy kdo bude končit a jak zkušený.
  Vše graficky bez extra textů“.
  - Core: `capPlanEnds(d, today, n)` (oddělení z `capPlanAll`: `now`, `overdue` (konec už
    minul), `months[{m, leave, remain, leaveN, remainN}]` po úrovních 4/3/2/0, `later`, `noEnd`).
  - UI: `cpPdfDepts` (oddělení s lidmi nebo plánem), `cpDeptPdf(P, d, today, page)` přes `ctrPdf`
    (A4 na výšku: záhlaví se štítkem `cpDeptState`, 4 dlaždice s proužkem `cpExact`/`cpPdfStack`,
    skupiny jako pruhy, tečky odchodů, sloupce zůstane s čárkovanou potřebou, legenda `CP_LV`),
    `CP_MON` (zkratky měsíců, čvn/čvc). Staré `cpPdfPage` a `cpChart` pryč. Excel beze změny.
  - Testy: `e2e_plankap` (text bez jmen a ID, stav, strany, `capPlanEnds` v Brusu, snímky stran
    `pdf-N.png` přes PyMuPDF, když je). `ODM_VERSION` 2.44.2, data beze změny (39).

Stav k 31. 10. 2026 (verze 2.44.1):

- Uživatel: „do ‚Nahrát konce trestů a směnnost‘ pokud budeme mít v systému člověka, který
  v importovaném seznamu není, tak mi vyskočí tabulka a odkliknu, zda ho vyřadíme“.
  - Core: `endParse` vrací navíc `missingP` (`{key, name, wid, dept, end, sick}`, bez vedoucích
    a vyřazených; `missing` = jen jména zůstalo), `endApply(…, {exclude: [klíče]})` nastaví
    `excluded` jen lidem z `missingP` (ne vedoucím), `out.excluded`.
  - UI: po potvrzení importu `endExcludeDialog(list, file)` (tabulka `.end-extab`, `input[name="ex"]`,
    `[data-endex="all|none"]`, `#endExN`, OK „Vyřadit vybrané“ bez výběru zakázané, Zrušit =
    „Nikoho nevyřazovat“); v prvním dialogu jen věta `.end-miss`. Historie přes `store.note`
    („vyřazeno ze seznamu N“) a „… vyřazen ze seznamu“ u člověka.
  - Testy: core „Konce trestů (2.44.1)“, `e2e_konce` (tabulka, Nikoho nevyřazovat, znovu
    a vyřadit, vyřazený se znovu nenabízí). `ODM_VERSION` 2.44.1, data beze změny (39).

Stav k 31. 10. 2026 (verze 2.44):

- Uživatel: „modul ‚Audit‘ přejmenuj na ‚KPI‘ … smazat modul ‚Výroba‘ … smazat v KPI ‚Výrobní
  plán‘ + ‚Úpravy‘ a nahradit je ‚Výkonost na osobu‘ … rozpad na osoby, jejich průměr na den podle
  oddělení … řazení od nejlepších po nejhorší“.
  - Přejmenování jen ve viditelných textech (i historie změn, PDF „HALA 2 · KPI · …“); identifikátory
    (`audit`, `workAudit`, `wa*`) zůstaly. Pohled `audit` = KPI.
  - Výroba: pryč z `#nav` a `HOME_TILES`, pohled `vyroba` zůstal (odkaz z KPI Nastavení → Starší
    soubory, `showView('vyroba')` rozsvítí v menu KPI). Testy ji otevírají přes `showView`.
  - `WA_TABS` bez `plan` a `upravy`; `WA_OLD_TABS` je pořád umí vykreslit (`ui.wa.tab`), jen ne
    z rozhraní (e2e_audit je tak zkouší). Data a kód plánu zůstaly.
  - Core (před PLÁN KAPACIT): `KPI_SORT`, `kpiMonths`, `kpiPerf(month, {sort, dir, now})` (přes
    `withPeriod`, `prodIndex`, `attendance`, `workedDays`; oddělení z `dvGroupOf` ke konci měsíce;
    `v{ks, h, ph, norm, use}`, `rank`, `depts[].avg` vážený `kpiAvg`, `unmatched`, `noAtt`), `kpiCmp`
    (bez hodnoty vždy na konci), `kpiSheets`.
  - UI: záložka `vykon` (`kpHtml`, `ui.wa.kp {month, sort, dir, dept}`, `#kpMonth`, `#kpDept`,
    `#kpSort`, `[data-kpdir]`, `[data-kpxlsx]` → `exportKpXlsx`, řádek `data-dvperson` = profil),
    CSS `.kp-*`.
  - Testy: core „KPI (2.44)“, nový `tests/e2e_vykon.js`, `e2e_mobil` (15 položek menu),
    `e2e_upgrade_prev` 2.41 → 2.44. `ODM_VERSION` 2.44, data beze změny (39).

Stav k 31. 10. 2026 (verze 2.43):

- Uživatel: „v docházce modul pro import dat … A příjmení, B jméno, C konec trestu, D směnnost
  (Stálá ranní, Stálá odpolední, Skupina 1, Skupina 2, NEMOC) … modul ‚Konce trestů‘ … přehled po
  měsících, kdy nám z jakého oddělení odejdou zaměstnanci … AI, ať zkontroluje správnost“;
  pak „v mobilní verzi ‚Teď v práci‘ rozevírací seznam … rozpad přítomných na oddělení
  s porovnáním vůči plánu a kdo nedorazil“.
  - Data: `e.end` (ISO, konec trestu), sanitize, historie `end:` a jen jedna `shift:` (duplicita
    pryč). Verze dat 39.
  - Core (před „od listopadu 2026 jediný zdroj“): `END_COLS`, `END_SHIFT_T`, `endShiftOf` (texty →
    R/O/S1/S2/SICK, `labels` ruční nebo AI), `endDateOf`, `endParse(aoa, cols, {today, labels})`
    (řádky s `issues` e/w/i, `unknown` texty, `missing` lidé, `sum`), `endApply` (poslední řádek
    člověka vyhrává, `add` noví), `endsOverview(today, n)` (měsíce, oddělení `endDeptOf`: Vedoucí /
    Bez skupiny, po termínu, bez data, `remain`), `endsSheets`, `endAiSample` (bez dat!),
    `staffNow(sd, slot, {now})` (plán směny po odděleních proti `dvDay`, `missing`, `wait`
    odpolední před 14:00, `extra`).
  - Server: `odm_ai_ends`, `ODM_AI_ENDS_SYSTEM`, akce `ai_ends` (`{sheet, labels ≤ 20}`).
  - UI: `#btnEnds`/`#endFile` v Docházce, `endImport` (dialog, `[data-endc]` sloupce,
    `[data-endl]` texty, `[data-endall]`), pohled `konce` (`renderEnds`, `ui.end.n`,
    `[data-endn]`, `[data-endxlsx]`, `[data-endperson]`), `#pEnd` u člověka (uloží na focusout),
    dlaždice a `homeTileMeta`. Úvod: `<details class="hh-nowbox">` + `homeNowHtml` (`#homeNow`,
    `ui.homeNowOpen`, překreslí i `chooseShift`).
  - Testy: core „Konce trestů (2.43)“ a „Teď v práci (2.43)“, `test_odmeny` `test_ends_check`
    (426 pro 38), nový `tests/e2e_konce.js`, `e2e_rychla` (rozbalení), `e2e_mobil` (16 částí),
    `e2e_upgrade_prev` 2.41 → 2.43.

Stav k 31. 10. 2026 (verze 2.42.4):

- Uživatel poslal vzor docházky (prázdná hlavička, jen list „Docházka“, A–BN): A1 „WPA kód“,
  B1 „01.10. Čt“ (sloučeno B1:C1), D1 „02.10. Pá“ … BJ1 „31.10. So“, ve 2. řádku Příchod / Odchod,
  na konci BL „Všední dny (h)“, BM „Víkend (h)“, BN „Celkem (h)“ (sloučené přes 2 řádky). Datové
  řádky ve vzoru nejsou, formát časů ani tvar WPA kódu tedy pořád nevíme. Vzor do repa nepatří.
  - **Příčina, proč se nikdo nenačetl:** datum v hlavičce bez roku `dvDate` neznal. Teď
    `dvDate(v, ref)` čte „DD.MM.“, „DD.MM. Čt“, „DD.MM.RRRR Čt“; rok bez roku = nejblíž `ref`
    (výchozí dnešek). `dvParse(…, ref)` → `dvParseAtt(sheet, c, ref)`. AI prompt zná „01.10. Čt“
    a „WPA kód“.
  - Testy: core „Docházka podle vzoru … (2.42.4)“, `e2e_zdroj` má hlavičku podle vzoru a docházku
    na 2. listu. `ODM_VERSION` 2.42.4, data beze změny (38).

Stav k 31. 10. 2026 (verze 2.42.3):

- Uživatel: „docházka je vždy v tom 2. listu … jeden den má dva sloupce, příchod a odchod …
  ať to klidně AI vždy zmapuje a ukáže třeba vzor prvního člověka z docházky, abych to mohl
  případně upravit“.
  - Data: `S.workAudit.dv.sheets = {att, work}` (název listu bez „soubor ›“, prázdné = sám),
    `cleanDv`, historie v `wadvcols`. Verze dat 38.
  - Core: `dvSheetName`, `dvSheets(sheets, pick)` (zapamatovaný list, pak název Docházka /
    vykázaná práce, pak **docházka = 2. list**, práce = jiný list), `dvParse` bere `dv.sheets`,
    `dvPreview(p, n)` (první člověk s příchodem: dny s příchodem, odchodem, kódem a hodinami
    `dvHours`, jeho záznamy práce, jinak první záznamy). AI prompt: docházka bývá na 2. listu.
  - UI: `dvMapDialog(sheets, file, {noAi})` při každém `dvImport` (i Kontroly): návrh AI
    (`dvAiPropose`, změny `.dv-aichg`), výběr listů a písmen `[data-dvm]`, vzor `#dvmPrev`
    (`dvPrevHtml`, přepočet na `input` po 250 ms), uloží `dv.cols/unit/sheets`. V souhrnu
    a v dialogu bez dat tlačítko `value="map"` → znovu bez AI. `dvAiSetup` a `DV_AI_BTN` pryč,
    v Nastavení `[data-dvaipick]` otevře stejné okno.
  - Testy: core „Jak se soubor načte (2.42.3)“, `test_odmeny` (426 pro klienta 37),
    `e2e_dochazka`, `e2e_zdroj` (vzor, ruční oprava písmene), `e2e_ai` (docházka na 2. listu
    bez názvu), `e2e_upgrade_prev` 2.41 → 2.42.3 (`ADDED` i `dv.sheets`).

Stav k 31. 10. 2026 (verze 2.42.2):

- Uživatel: „Nemůžeš to napojit přes API na AI co jsme již používali v TOP 5? Aby jen vždy
  nastavil vstupní data … stačí přečíst první dva řádky a přiřadit kde co bude načítat.“
  - Další výjimka z pravidla „AI neposílá data“: jen nadpisy prvních řádků souboru a typy
    buněk, uživatel o to požádal. `dvAiSample(sheets, employees)` (core): ≤ 4 listy, 6 řádků,
    70 sloupců; text jen v řádcích před prvním datovým řádkem (datový = první buňka v A–C je
    číslo / ID s číslicí), jména z Lidí `maskNamesMany`; ostatní `<celé číslo>`, `<čas>`,
    `<datum ISO>`, `<text>`, `<text s číslicemi>`.
  - Server: `odm_ai_call` (společné volání, chyby, `fallbacks`), `odm_ai_rewrite` přes něj,
    `odm_ai_clean_sample`, `odm_ai_columns` (`ODM_AI_COLS_SYSTEM`, schéma `att{id, first}`,
    `work{id, part, op, order, done, time, date, norm}`, `unit`, `att_sheet`, `work_sheet`,
    `note`; jen písmena A–ZZZ), akce `ai_columns` v `api.php`, limity `odm_ai_throttle`
    (hlášky „AI je omezená…“).
  - UI: `dvAiSetup(sheets, file)` (dialog `.dv-aitab`, změny `.dv-aichg`, povinné sloupce, které
    AI nenajde, zůstanou), tlačítko `DV_AI_BTN` (`value="ai"`) v dialogu bez dat i v dialogu
    nahrání (`.dv-aibar`), `[data-dvaipick]` v Nastavení; po použití `dvImport` znovu.
  - Testy: core „Nastavení sloupců přes AI (2.42.2)“, `test_odmeny` `test_columns_sends_only_the_sample`
    (mock pozná `listy`), `e2e_ai` (soubor se sloupci jinde, návrh, znovu načtení, historie).
    `ODM_VERSION` 2.42.2, data 37.

Stav k 31. 10. 2026 (verze 2.42.1):

- Uživatel: „Norma zatím nebude uváděna. Přestávka je vždy 30 minut“ (`dvHours`: pobyt − 30 min
  vždy), pak „Při importu mi stále nepropisuje lidi do Reportu docházky“ a „u rychlých kontrol …
  nemám možnost rozkliknout člověka, abych viděl body co mám kontrolovat a označit splněno“.
  - Příčinu u Reportu jsme bez souboru nezjistili (s ID v Lidech funguje). Doplněno: `dvWidMap`
    s náhradou podle číslic ID (jen jednoznačně, aspoň 2 číslice), `dvGroupOf` bez skupiny
    v historii bere dnešní skupinu, `drPairing` + `drCheckHtml` (`.dr-check`, `[data-drgo]`)
    vysvětlí den bez příchodů, neznámá ID a lidi bez skupiny; `dvImportAudit` nastaví report
    na nahraný den (a v Reportu zůstane). Když se to bude opakovat, chtít text upozornění.
  - Rychlá kontrola: `qkItemOf`, `qkOpen` (přidá do dnešního plánu přes `quickSave`, pak
    `ktCheckForm`), řádek `button.qk-open[data-qkopen]`, hotový řádek s výsledkem; v Dnes ke
    kontrole je jméno `[data-qkcheck]` (i úprava hotové).
  - Testy: core „Report docházky (2.42.1)“, `e2e_zdroj` (report po nahrání, upozornění),
    `e2e_rychla` (zápis z vylosovaného seznamu). `ODM_VERSION` 2.42.1, data 37.

Stav k 31. 10. 2026 (verze 2.42):

- Uživatel: „celý modul Audit, ať funguje na ‚Nahrát docházku a výkon‘. Nahradí to i modul
  Výroba a od listopadu se takto bude i evidovat docházka, tento měsíc říjen bude ještě docházka
  po staru“.
  - Core (za `dvApply`): `DV_FROM = "2026-11"`, `dvOwns(měsíc|den)`, `dvHours` (pobyt − 30 min vždy,
    přání uživatele; bez jednoho času `S.settings.shift`), `dvToPeriods` (S.periods měsíce: dny od 1. do
    posledního nahraného, dny ze souboru nahradí, řádek pro každé ID listu spárované s Lidmi,
    kód z buňky bez času `a.abs`), `dvToProduction` (S.production měsíce celý, jméno = ID,
    `time: true`, norma z volitelného sloupce `dv.cols.work.norm`), `dvAuditGroups` (skupina
    Matice → skupina Auditu: `wa.groups[].mg`, bez výběru podle názvu skupiny/oddělení),
    `dvToAudit` (wa.days: ranní před `DV_PM_FROM`, vedoucí ne, absence = kódy), `dvAuditRefresh`.
    `dvApply` vrací navíc `periods`, `prod`, `occ`; kusy do Auditu od listopadu vždy.
    `dvParseAtt` vrací `abs` a `ids`. Historie `wam:` (skupiny Matice).
  - UI: dialog nahrání vypíše, co se plní (`.dv-owns`); starší dny jen zaškrtnutím (výchozí
    nezaškrtnuté, když soubor má listopad). `waDropOwned` vyřadí dny od listopadu ze starých
    importů Auditu a z kusů z Výroby; `doImport` (Docházka) a `doProdImport` listopad odmítnou.
    Nastavení: `waMgHtml` (`.wa-mg`, `[data-wagmg]`, `ui.wa.mgOpen`), starší soubory v
    `<details class="wa-old">` (`ui.wa.oldOpen`); tlačítka obsazenosti a výkazu z hlavičky pryč.
    Výroba zůstává v menu (říjen), Docházka i Výroba mají pruh `.dv-src`.
  - Uživatel potvrdil: přestávka je vždy 30 min; norma zatím v souboru nebude (plnění normy
    za listopad se nespočítá, sloupec normy v Nastavení zůstává prázdný). Neověřeno se skutečným
    souborem: hodiny bez odchodu = délka směny.
  - Verze dat 37, `ODM_VERSION` 2.42. Testy: core „Docházka a výkony jediný zdroj (2.42)“, nový
    `tests/e2e_zdroj.js` (hodiny stránky 3. 11. 2026), `e2e_upgrade_prev` 2.41 → 2.42 (archiv
    `48ad143`, `ADDED` mg a norm), `test_odmeny` (426 pro klienta 36).

Stav k 31. 10. 2026 (verze 2.41):

- Uživatel: „u Report docházky udělej možnost, že budu moct vytvořit skupiny a do těch skupin
  budu moct přidělit oddělení … u každého dne zakliknout, zda jde o přesčas nebo práce ve
  svátek, v takovém případě se dané dny nebudou v týdenním a měsíčním reportu počítat do
  Plnění normy. Tam se počítají jen pracovní dny.“
  - Data `S.workAudit.drep = {groups[≤ 20]: {id 'rg…', name, depts[] (názvy oddělení
    `deptOf`, oddělení nejvýš v jedné skupině)}, marks{iso: 'ot' | 'hol'}}` (`blankDrep`,
    `cleanDrep`, `DR_MARK`). Historie `waChanges`: `wadrg:` skupina, `wadrn:` název, `wadrd:`
    oddělení, `wadrm:` značka dne.
  - `drCtx`: řádky = skupiny reportu (součet plánů a členů skupin Matice z jejich oddělení,
    `parts`) + skupiny Matice z nepřiřazených oddělení; `rowOf` (skupina Matice → řádek).
    `drDay`: `mark`, `norm = work && !mark`; `drReport` počítá jen `norm` dny, `marked`
    (seznam s počtem v práci), `weekend` jen neoznačené dny mimo pracovní.
  - UI: `drSetHtml` (`<details class="dr-set">`, `ui.wa.drSet`, `[data-drrgadd]`,
    `[data-drrgname]` na `change`, `[data-drrgdept]` přesun, `[data-drrgdel]`), lišta značky
    dne `.dr-mark` `[data-drmark]` jen v režimu Den; výrok „PŘESČAS / PRÁCE VE SVÁTEK“,
    poznámky v týdnu a měsíci.
  - Verze dat 36 (`DATA_VERSION`, `CLIENT_VERSION`, `ODM_MIN_CLIENT`), `ODM_VERSION` 2.41.
    Testy: core „Report docházky (2.41)“, `e2e_report` (skupiny, přesun oddělení, přesčas),
    `test_odmeny` (426 pro klienta 35), `e2e_upgrade_prev` 2.38 → 2.41 (`ADDED` drep,
    `SAME_DATA` false). `e2e_rychla`: pátý příchozí se vybírá mimo čtyři pevné (náhodný los
    občas trefil stejného a test padal).

Stav k 31. 10. 2026 (verze 2.40.1):

- Uživatel (v sobotu): „v mobilní verzi po přihlášení nevidím aktuální stav. Ukazuje mi to plán
  na pondělí a dnes nevidím nic.“ `staffDay` skáče na další pracovní den a skutečnost
  (`staffReal`) se brala jen pro pracovní den.
  - Core: `staffDay(from, exact)` (exact = přesně ten den i o víkendu), `dvLastPres(to)`
    (poslední den s příchodem do data, prázdné řádky ne).
  - `renderHome`: když má dnešek příchody a není pracovní den (`off`), úvod je za dnešek
    (`staffDay(today, true)`), čísla „mimo plán“ bez rozdílu, bez plánu v oddělení, podnadpis
    „víkend / svátek, směna mimo plán“. Bez dnešních příchodů flag Nahrát dnešní příchody
    i o víkendu a `[data-hgo="lastpres"]` (Audit, Lidé v práci na tom dni).
  - Testy: core „Úvod HALA 2 (2.40.1)“, `e2e_rychla` (sobota s příchody a bez nich, hodiny
    stránky přepnuté na 31. 10.). `ODM_VERSION` 2.40.1, data beze změny (35).

Stav k 31. 10. 2026 (verze 2.40):

- Uživatel (s přílohou: HTML „Report docházky“, plnění denního požadavku po skupinách, Den /
  Týden / Měsíc / Rok, PDF na jednu stranu): „z nahraných dat do kapacity potřeboval mít možnost
  stahovat reporty po vzorku v příloze“. Příloha obsahuje název organizace a logo: do repa ne.
  - Core (za `staffReal`): `drCtx` (skupiny Matice, plán = `capPlan.n`, jinak členové bez
    vyřazených a vedoucích; požadavek `wa.target`, jinak součet plánů), `drDay(iso)` (`kind`
    real | plan | none; real z `dv.pres` přes `dvGroupOf`, vedoucí ne, Bez skupiny / Neznámé ID
    jako `extra`; poznámka nemoc a „nepřišli ID …“; plan = plán − nemocní od data), `drDates`,
    `drReport(mode, ref)` (n, met, pct, nf, futMet, onlyPlan, noData, weekend, groupsReal/Plan,
    trend; rok po měsících), `drSheets` (Přehled dní, Skupiny).
  - UI (`app.js`, sekce REPORT DOCHÁZKY): záložka Auditu `report` (`WA_TABS`), `ui.wa.dr {mode,
    ref}`, `drView` (výrok, ukazatel, dlaždice, graf, tabulka, poznámky; texty po vzoru),
    grafy `drColChart`, `drTrendChart` jako značky (`ctrSvg`, `pdfCtrChart`), `drPaperHtml`
    (papír `.dr-*` bílý i v tmavém režimu, barvy přes `data-c` a `drPaint`), `pdfDrPage` (ctrPdf,
    A4 na výšku, ukazatel jako kruh z `P.poly`), `exportDrPdf`, `exportDrXlsx`.
    Datum: pole `#drDate` + Zobrazit / Enter (nepřekreslovat na `change`).
  - Testy: core „Report docházky (2.40)“, nový `tests/e2e_report.js`. `e2e_kapacity` čeká pruh
    vykázáno a plán jen když měsíc má plánované dny (31. 10. 2026 je sobota, padalo i na 2.39.3).
  - `ODM_VERSION` 2.40, data beze změny (35).

Stav k 31. 10. 2026 (verze 2.39.3):

- Uživatel: „V telefonu při přihlášení, ať mi to ukáže vždy obsazenost podle toho, kolik je lidí
  v práci podle toho co jsem ráno nahrál do kapacit“ (= dnešní příchody `S.workAudit.dv.pres`).
  - Core `staffReal(iso, mg, opts)` (za `dvDay`): lidé s dnešním příchodem po směnách
    (`DV_PM_FROM` 12:00; bez příchodu podle `slotOn`), oddělení `empDept` / „Bez skupiny“ /
    „Neznámé ID“, vedoucí zvlášť (`lead`), `now` z `dvDay`, `at`/`by` z posledního souboru
    `dv.files`, který den pokrývá. Bez příchodů null.
  - UI `renderHome`: `homeRows(sd, real)` (plán + skutečnost, oddělení navíc), velká čísla se
    skutečností a „plán N“ + rozdíl (`.hb small em.neg/pos`), odpolední do 14:00 bez rozdílu,
    `.hh-now` (teď v práci), nadpis „V práci podle příchodů · nahráno HH:MM“, `.hs-cell.short`.
    Bez příchodů flag `[data-hgo="pres"]` → `#ktPresFile` (`ktPresImport` pak překreslí úvod).
  - Testy: core „Úvod HALA 2 (2.39.3)“, `e2e_rychla` (úvod bez a s příchody), aktualizace
    2.38 → 2.39.3. `ODM_VERSION` 2.39.3, data beze změny (35).

Stav k 31. 10. 2026 (verze 2.39.2):

- Uživatel: „Plán kapacit ať ukazuje jen ID zaměstnance a ne jména“ a „ten PDF export udělej
  v grafickém podání, něco jako je v Audit sekce Kapacity a zaškolení“.
  - 2.39.1 (`03b273c`): `cpWho(c)` („ID 101“ / „bez ID“) v `cpRecHtml` (odkaz `data-cpperson`
    do profilu zůstal), v PDF a v Excelu (list Doškolit má sloupec ID zaměstnance místo jména).
  - 2.39.2: PDF přes `ctrPdf` + `pdfCtrPage` (stejný stroj jako Kapacity a zaškolení, A4 na výšku,
    `withPdf(…, 'portrait', {mono: true})`). Model stránky `cpPdfPage(all)` (`kind: 'cap'`,
    záhlaví s `ctrRep().place` a `ctrSub`, rámečky, dlaždice, graf, tabulka se span řádky
    doporučení, součty oddělení a CELKEM, Bez plánu, vysvětlivky s poznámkou). Graf `cpChart`
    (vb 1128 × 276): sloupec po úrovních `CP_LV` (4 tmavě, 3+, 2+, pod 2 jantarově), potřeba
    čárkovaně (celkem zeleně), nad sloupcem „máme / potřeba“, pod ním doplnit / doškolit,
    dlouhé názvy se zkrátí „…“. Starý pdfKit kód plánu je pryč.
  - Testy: `e2e_plankap` (bez jmen v aplikaci, PDF i Excelu, text PDF, krajní případy: bez
    plánu, 18 skupin), aktualizace 2.38 → 2.39.2.
  - `ODM_VERSION` 2.39.2, data beze změny (35).

Stav k 30. 10. 2026 (verze 2.39):

- Uživatel: „pro mobil udělej funkci na kontrolu, že nadefinuji kolik lidí chci zkontrolovat
  a vygeneruje mi to list jmen. ať je to intuitivní a optimalizované pro telefon … pěkný design
  a zároveň zachovat business design moderní firmy“.
  - Nový pohled `rychla` (Rychlá kontrola): dlaždice v hlavním menu za Kontrolami, položka
    plovoucího menu (`FAB_ITEMS`) hned pod Vyhledat člověka, tlačítko `[data-go="rychla"]`
    v Kontrolách, položka v `#nav` (monitor).
  - Core (za `generateDayChecks`): `quickLastDone` (poslední provedená kontrola), `quickPool(opt)`
    (`{n, dept, slot am|pm, present, today, not}`; bez nemocných, vedoucích, vyřazených a lidí
    s kontrolou v týdnu, směna `slotOn` se střídáním `S.capReport.s1am`, příchody `audPresent`),
    `quickPick` (podíl oddělení největšími zbytky, v oddělení nejdéle nekontrolovaní, shoda
    náhodně), `quickSwap` (náhradník ze stejného oddělení), `quickSave` (do dnešního plánu přes
    `addToPlan`, `extra: true`; víkend a svátek chyba).
  - UI (`app.js`, sekce RYCHLÁ KONTROLA): `ui.qk` (jen v paměti okna, směna se poprvé převezme
    z `ui.homeShift`), `renderQuick`, `qkDraw`, `qkShare` (`navigator.share`, jinak schránka),
    `qkSave`, `bindQuick`; zápis přes `ktCheckForm`. CSS `.qk-*` (hero jako HALA 2, počítadlo,
    segment směny s jezdcem, animace řádků, `prefers-reduced-motion`).
  - Data beze změny (35), `ODM_VERSION` 2.39. Test aktualizace má `SAME_DATA` (krok 3 se
    vynechá) a krok 5 s Rychlou kontrolou; `e2e_mobil` počítá s novou dlaždicí a položkou menu.
  - Testy: core „Rychlá kontrola (2.39)“, nový `tests/e2e_rychla.js`.
  - V kontejneru je teď Chromium v `/opt/pw-browsers/chromium` (testy berou `CHROME=…`).

Stav k 30. 10. 2026 (verze 2.38):

- Uživatel: „plánovací modul kapacit, ať jde nastavit kolik potřebujeme s jakými zkušenostmi na
  daných odděleních a jak jsme na tom a kolik potřebujeme doškolit nebo doplnit zaměstnanců“.
  - Nová část `plankap` (menu pod Maticí, dlaždice na telefonu), viz modul „Plán kapacit“ níže.
  - Zkušenost = úroveň z procenta dovedností skupiny (`cpLevel`: dolů, 50/75/100 %), stejné
    měřítko jako „zkušený pracovník“ v reportu kapacit. Plán je po skupinách Matice (projekt),
    oddělení je součet.
  - Testy: core „Plán kapacit (2.38)“, nový `tests/e2e_plankap.js`, `e2e_mobil` (14 částí),
    `e2e_upgrade_prev.js` přepnutý na 2.37 → 2.38 (archiv `f6dacfb`).
  - Verze dat 35, `ODM_VERSION` 2.38.

Stav k 30. 10. 2026 (verze 2.37):

- Uživatel: „Zakomponuj do auditu možnost importu docházky a výkonů z jednoho souboru. … první
  list Docházka, ve sloupci A ID zaměstnance, sloupce B a C první datum (příchod, odchod) … denní
  reporty obsazenosti, i pro aktuální den, kolik máme lidí v práci na jaké projekty … druhý list
  vykázaná práce: A ID, D název dílu, E operace, F množství v zakázce, G dokončené množství,
  J strávený čas … každý profil zaměstnance ať vidí produktivitu a název dílů jako koláč“.
  Na dotaz: projekt = skupina v Matici; do modulu Docházka (odměny) se nic nezapisuje.
  Doplnění: „aplikuj i do kontrol, ať si kontrola vyžádá soubor s dnešními příchody, aby systém
  poznal, kdo je v práci, a na ty se náhodně vygenerovala kontrola“.
  - Core (sekce „AUDIT: docházka a výkony z jednoho souboru“): `S.workAudit.dv` =
    `{cols, unit, pres, perf, files}` (viz modul Audit níže). `dvParse` → `dvParseAtt`
    (hlavička = řádek s nejvíc daty bez času, dvojice sloupců) a `dvParseWork` (datum: hlavička
    Datum, jinak jen buňky formátované jako datum, `sheet.dateCols` z `readTable`/`sheetDateCols`
    s `cellNF`; čísla zakázek 45100 vypadají jako data). `dvApply` nahradí dny docházky ze souboru
    a celé měsíce výkonů, volitelně kusy do Auditu přes `waApplyWork`. Výpočty `dvDay`, `dvMonth`,
    `dvPerson`, projekt `dvGroupOf` (minulost podle `levelAt`).
  - Kontroly: `audSet().mode` `week` | `day` (ukládá se jen `day`, starší data beze změny),
    `audPresent(iso)`, `generateDayChecks(week, iso)`, `substituteCheck` bere s příchody jen
    lidi v práci.
  - UI: záložka Auditu `lide` (`dvHtml`, `dvDayHtml`, `dvMonthHtml`), import `dvImport`
    (`attOnly` v Kontrolách), `dvImportAudit`, `ktPresImport`, `ktDayChecks`, `ktPresHtml`,
    `ktAway`; PDF `exportDvPdf`, Excel `exportDvXlsx`; profil `dvPersonCard` s koláčem
    `dvPieHtml` (barvy `--pie-1..6`, `--pie-o` v `static/lock.css`, ověřené validátorem palet).
  - Testy: core „Audit (2.37)“ a „Kontroly (2.37)“, nový `tests/e2e_dochazka.js` (hodiny stránky
    na 30. 10. 2026 přes `clock.setFixedTime`) a nový **`tests/e2e_upgrade_prev.js`**: aktualizace
    z předchozí verze na Apachi; při další verzi uprav `ADDED`, krok 5 a archiv v hlavičce.
  - **Se skutečným souborem z docházkového systému to nikdo nezkoušel.** Nejisté: formát času
    (zlomek dne, text „6:30“, datum s časem — vše se čte), jednotka stráveného času (auto podle
    hlavičky a hodnot), kódy nepřítomnosti.
  - Verze dat 34, `ODM_VERSION` 2.37.

Stav k 26. 10. 2026 (verze 2.36):

- Uživatel: „přidej do modulu Shortage možnost znovu vložit urgenty, a doplní se jen chybějící“.
  - Core: `shItemKey(i)` = `shPlanKeyPart(ean)` (bez EANu `#` + `shOpNorm(name)`) | index |
    objednávka. `shMergePlan(list, items, back)` → `{add, have, gone}`, stejná položka víckrát se
    počítá po kusech. Seznam má `gone[]` (klíče ručně odebraných, `SH_MAX_GONE` 1000, bez
    duplicit), plní ho odebrání ×. Historie `shChanges`: nové id položek v existujícím seznamu =
    „do seznamu … doplněno N položek: …“, klíč `shm:<seznam>:<první id>` (každé doplnění zvlášť,
    jinak by `appendLog` do 10 minut sloučil).
  - UI: tlačítko `[data-shmerge]` na kartě seznamu přepíná `ui.sh.merge` (id seznamu), pruh
    `#shMergeBar` (`shMergeBar()` z `renderShortage`, `.sh-paste.merge`), `[data-shmergeoff]`.
    `shTake(r, src)` místo `shAddList` v importu souboru i vložení: v režimu `shMergeInto`
    (dialog `.sh-mprev`, checkbox `back` `.sh-mgone`), jinak nový seznam. Doplněné položky:
    `shApplyPlan` jen na ně (dočasný seznam), `shTopFirst`, `cleanShortage` dá id. Režim končí
    po doplnění, po „nic nechybí“ i při přepnutí seznamu. Poslední záznamy (`shLooksLikeRecs`)
    mají přednost i v režimu.
  - Položky odebrané před 2.36 seznam nezná, při prvním doplnění se nabídnou jako chybějící.
  - Testy: core „Shortage (2.36)“, `e2e_shortage.js` na konci (soubor, odebraná, vrátit na
    přání, ze schránky, nic nechybí, Zrušit = nový seznam, historie, telefon), `up218` počítá
    s `gone: []`.
  - Verze dat 33, `ODM_VERSION` 2.36.

Stav k 24. 10. 2026 (verze 2.35):

- Uživatel: „v modulu Audit rozšířit import výkazu práce o sloupec ID zaměstnance, případně ať
  to bere data z modulu Výroba, ať to nemusím nahrávat 2×“. Je to stejný export z IS, takže
  jedno nahrání teď plní oba moduly, ať se nahraje kdekoli:
  - **Výroba → Audit:** `S.settings.prodCols.op` (sloupec operace, `PROD_WORDS.op`, odhad po
    ks a před item, `skip` pro „Číslo/Kód/Norma/Čas operace“). `waParseProd(aoa, map)` volá
    `waParseWork` se sloupci z mapování Výroby (`colLetter`), takže kusy jsou přesně jako při
    importu v Auditu (i řádek bez pracovníka, bez souhrnu „Celkem“). `prodToAudit` v
    `doProdImport` → `waApplyWork`, hláška v `#prodMsg` a s novými operacemi `ui.wa` na
    Nastavení s filtrem bez skupiny (`data-go="audit"`).
  - **Audit → Výroba:** `waProdFrom(sheets, name)`: list, který sedí na uložené
    `S.settings.prodCols` (`prodMapFits`), `buildProduction`. V dialogu `.wa-toprod`
    s checkboxem `toProd` (zaškrtnutý), jinak `.wa-noprod` s vysvětlením. Po potvrzení se měsíce
    přepíšou jako při importu ve Výrobě. Toast počítá nespárovaná jména v nahraných měsících
    (`prodUnmatched` bere jen vybrané období).
  - **Historie:** `store.note.keep` (nové): poznámka + spočítané změny (`describeChanges`), jinak
    by poznámka Auditu přebila „Nahrána evidence práce …“. Bez `keep` beze změny.
  - Nastavení Auditu: `waOneFileText()` pod sloupci výkazu práce.
  - Testy: core „Výroba a Audit (2.35)“, nový `tests/e2e_vykaz.js` (odhad sloupců, kusy proti
    výpočtu, Výroba po lidech, odškrtnutá volba, jiná hlavička, historie, telefon),
    `e2e_upgrade24` počítá s `prodCols.op = null`.
  - Verze dat 32, `ODM_VERSION` 2.35.
  - **Se skutečným exportem z IS to nikdo nezkoušel.** Test běží na vymyšleném souboru se
    sloupci jako v Auditu (A datum, H operace, J kusy) a s pracovníkem, normou a časem.

Stav k 24. 10. 2026 (verze 2.34):

- Uživatel: „v modulu Shortage generovat PDF s rozdělením oddělení na papír … každé oddělení
  zvlášť v tisku a neměl jsem třeba 2 oddělení na jednom papíře“.
  - Tlačítko `[data-shpdfdept]` „PDF po odděleních“ (jen když `S.shortage.depts` není prázdné)
    vedle `[data-shpdf]`; `exportShortagePdf(id, button, split)`, soubor `…-po-oddelenich.pdf`.
    Žádné nové uložené nastavení, data beze změny (31).
  - `drawShortage(doc, l, ops, dsel, split)`: záhlaví je funkce `title(sec)` (počty a nadpis
    „Chybějící díly · oddělení“, bez řádku „Oddělení:“), každé oddělení od `doc.addPage()`
    (`k.onPage = null` před přidáním, ať se nekreslí záhlaví sloupců navíc), čísla položek od 1,
    další strany přes `cont` („… · pokračování“ + `head`). Nadpis i řádek filtru se oříznou
    podle šířky (`clip`), dlouhý název oddělení (60 znaků) nepřeteče přes pokyn vpravo.
  - `k.footer(left, per)`: volitelné `per(i, pages) → {left, right}`; Shortage po odděleních
    čísluje strany za oddělení (`starts` = první strana každého oddělení).
  - Testy: `e2e_shortage.js` (každá strana patří jednomu oddělení, oddělení za sebou, díly jen
    na stranách svého oddělení, pokračování, číslování stran, filtr Brus, snímky stran
    `pdf-po-oddelenich-N.png`), aktualizace 2.33 → 2.34 se stejnými daty (SAME_DATA).
  - `ODM_VERSION` 2.34.

Stav k 24. 10. 2026 (verze 2.33):

- Uživatel: „V Audit bych potřeboval mít v nastavení možnost nastavit, do kolika % dovedností
  u pracovníka se počítá, že je v zaškolení“ a „toto nastavení bude výchozí pro celý modul Audit“.
  - `S.workAudit.trainPct`: celé procento 1–100, `null` = podle Matice (`S.capReport.thr` × 25).
    Starší data dostanou `null`, takže se po aktualizaci nic nezmění. Historie `watrain`.
  - `waTrain()` (core) vrací `{pct, own, thr}`. `capTimeline` z něj bere `lim` (zaškolený =
    procento ≥ pct) i `prog` (Ø zaškolení = procento ÷ pct) a vrací `okPct`, `okOwn`; souhrny
    `capMonthReport` a `capWeekReport` je předávají dál. Texty poznámek (`ctrMonth`, `ctrWeek`,
    `ctrDev`, Excel `capTimelineSheets`) píšou procento a zdroj (`ctTrainSrc`).
  - V Auditu se zaškolení počítá jen v Kapacitách a zaškolení. Matice, úvod (`staffDay`),
    plán a skutečnost i report kapacit v Matici dál berou `thr` z Matice. Kusy na směnu ve
    výrobním plánu s dovednostmi nesouvisí.
  - UI: karta `#waTrainCard` v Nastavení Auditu vedle požadavku lidí (`.grid-2`), pole
    `#waTrainPct` (prázdné, „50“ i „50 %“; mimo 1–100 hláška a nic se neuloží), věta
    `waTrainText()` i v Kapacitách (`.ctr-train`) s odkazem `data-watabgo="nastaveni"`
    `data-wafocus="waTrainPct"` (skok na pole).
  - Testy: core „Audit (2.33)“, `e2e_kapacity.js` (Nastavení, neplatná hodnota, poznámky měsíce,
    týdne a vývoje, PDF, Excel, návrat k Matici, telefon), aktualizace 2.32 → 2.33 v `up218.js`.
  - Verze dat 31, `ODM_VERSION` 2.33.

Stav k 24. 10. 2026 (verze 2.32):

- Uživatel: „nastavit TOP2 … v řazení hned pod TOP SHORTAGE s poznámkou ‚Zpracovat hned po TOP
  shortage‘ … třídění do oddělení, kde si vytvořím oddělení a přiřadím probíhající operace …
  systém si bude pamatovat … v přehledu stále možnost ručního přesunutí i do jiného oddělení“.
  - Core: `item.top2` (TOP vyhrává), `shRank` (TOP 0, TOP 2 1, ostatní 2), `shTopFirst` řadí
    podle něj, `shSetTier(list, id, "top" | "top2" | "")` (`shSetTop` zůstal), `shMoveItem` jen
    uvnitř skupiny. Import G: `/^top\s*-?\s*2\b/i` = TOP 2.
  - Oddělení `S.shortage.depts[≤ 20] = {id 'sd…', name, ops[≤ 100]: {key (shOpKey), label}}`,
    operace nejvýš v jednom oddělení (`shAssignOp`). `item.dept`: "" = podle operace, id =
    ručně, „-“ = ručně nezařazená; smazané oddělení čištění vrátí na "". `shAutoDept` (operace,
    jinak první poddíl), `shDeptOf`, `shSections` (bloky v pořadí oddělení, Nezařazeno na konci,
    bez oddělení jeden blok), `shDrop(sh, list, id, dept, before)` (ruční přesun i pořadí,
    zpátky do oddělení podle operace = ""), `shOpsAll` (operace všech seznamů a nastavení).
    Historie `shdp:`/`shdx:` oddělení, `shdo:` operace, `shdi:` ruční přesun, `sht:` i TOP 2;
    přesun kvůli TOP nebo oddělení se jako změna pořadí nepíše.
  - **`shAddList` musí předat celé `S.shortage`** (`cleanShortage({ ...c, lists })`), jinak
    nový seznam smaže oddělení. e2e to hlídá (oddělení přežijí další import).
  - UI: panel `<details id="shDepts">` (mřížka `.sh-optab`, ne tabulka: `#shView tbody tr`
    používá přetahování i testy), nadpisy bloků `tr.sh-depthead[data-shdepthead]` („-“ =
    Nezařazeno), řádky `data-shdeptrow`, výběr `[data-shdept]`, tlačítko `[data-shtop2]`, filtr
    `ui.sh.depts` (`shDeptSel`, `shDeptPick`, čipy `[data-shdf]`). Přetahování: cíl je položka
    (před ni) nebo nadpis (konec oddělení nad ním), `shRowDept`, `shDrop`; šipky na úchytu
    v rámci oddělení. Akce v řádku `.sh-acts` (TOP a TOP2 nad okem a ×), tabulka se vejde na
    1440 px. PDF: bloky s nadpisem (drží se s prvním řádkem), TOP 2 štítek v rámečku, šedý pruh
    a poznámka, filtr oddělení v záhlaví.
  - Testy: core „Shortage (2.32)“, `e2e_shortage.js` (TOP 2, oddělení, výběr, přetažení na nadpis,
    PDF s bloky a filtrem, historie).
  - **Oprava `flushSave`:** `store.note` nastavená během běžícího uložení (další import) se po
    jeho dokončení mazala, záznam importu v historii chyběl. Teď se maže jen poznámka, která se
    právě uložila. Na plném běhu testů to jednou shodilo `e2e_audit` („importy v historii“);
    test teď uložení zpomalí přes `page.route` (2,5 s) a import potvrdí během něj (bez opravy
    selže vždy). Rozbalí i celou historii (tlačítko Zobrazit starší, 80 záznamů).
  - `e2e_protokoly`: o víkendu dlaždice píše „v den plánu N úkonů“, test to bere.
  - Verze dat 30, `ODM_VERSION` 2.32.

Stav k 23. 10. 2026 (verze 2.31):

- Uživatel k Kapacitám 2.30: „udělej to co nejvíce identické tomu vzoru co jsem ti poslal“
  (vzor: měsíční souhrn zaškolenosti a výkonu a týdenní souhrn s požadavkem, šířka 1280 px,
  IBM Plex Sans a Plex Mono). Potom k Shortage: „přidej možnost nastavit manuálně jako top
  shortage … sestav dej možnost ‚Zobrazit plně‘ aby bylo vidět QR … filtr na probíhající operace“.
  - Core: `capMonthReport(month)` (3 měsíce do grafu, stav skupin k poslednímu pracovnímu dni,
    `dOk` proti minulému měsíci, výkon s indexem první měsíc okna = 100), `capWeekReport(weekId)`
    (5 slotů Po–Pá `{kind real|plan|off, on, ok, tr, plan, req, met}`; plán skupiny ve vykázaném
    dni = `planN − excused`; den v normě = s požadavkem z Auditu `tot.on ≥ req`, bez něj
    `on ≥ plán`; stav `ctState`: vše ok, ≥ 80 % warn, jinak crit), `capReportPages(from, to)`
    (za měsícem jeho týdny podle čtvrtka). `S.workAudit.rep = {place, firm}` (záhlaví, historie
    `warep`).
  - UI (`app.js`, oddíl KAPACITY A ZAŠKOLENÍ): obsah stránky skládají `ctrMonth`, `ctrWeek`,
    `ctrDev` (texty, dlaždice, rámečky `CTR_BOX`, tabulka s buňkami a barvami jako klíči `CTR`),
    kreslí ho `ctrHtml` (papír `.ctr-paper`, CSS podle vzoru, bílý i v tmavém režimu) i
    `pdfCtrPage` (A4 na výšku, souřadnice v px vzoru, 1280 px = 210 mm, `ctrPdf`: písmo v px →
    pt, účaří = horní okraj řádku + 1,025 em, řádek 1,3 em; šířky sloupců jako auto-layout
    prohlížeče, pokračování tabulky s hlavičkou). Grafy jsou značky (`ctrStackChart`,
    `ctrPerfChart`, `ctrDaysChart`) → `ctrSvg` i `pdfCtrChart`, takže aplikace a PDF mají
    stejný graf. Výběr stránky `ui.wa.ctPage` (`month:…`, `week:…`, `dev`), po změně záhlaví se
    překreslí jen `#ctrPage` (Tab do dalšího pole nezahodí fokus). Na telefonu se graf v kartě
    posouvá do strany (tooltip počítá `scrollLeft`).
  - Plex Mono do PDF: `private/vendor/plex-mono-medium.ttf` a `-semibold.ttf` (OFL, podmnožina
    Latin a Latin Extended z balíčku `@ibm/plex-mono` převedená fontTools z WOFF),
    `app.php?f=pdf-mono.ttf` / `pdf-mono-semibold.ttf`, `newPdf(orientation, {mono: true})`.
  - Shortage: `item.full` (sestava zobrazená plně: v aplikaci QR a poznámka, v PDF celý řádek),
    ruční TOP `shSetTop(list, id, on)` (na konec TOP / začátek ostatních), filtr operací
    `shOpKey` (`shOpNorm` nebo „-“), `shOpList`, `shOpPick` (poddíl jen se svou operací, sestava
    i kvůli poddílu), `ui.sh.ops`, `shOpSel`, PDF podle filtru (`shPdfItems(l, ops)`, v záhlaví
    „Jen operace: …“). Historie `sht:` a `shf:`; přesun kvůli TOP se jako změna pořadí nepíše.
  - Testy: core 2.31 (souhrny, záhlaví, Shortage, norma bez požadavku), `e2e_kapacity.js`
    přepsaný na stránky reportu, `e2e_shortage.js` s ručním TOP, plnou sestavou a filtrem.
  - Verze dat 29, `ODM_VERSION` 2.31.

Stav k 22. 10. 2026 (verze 2.30):

- Uživatel (s přílohou: návrh „Report docházky – měsíční zaškolenost a výkon“ a týdenní souhrn KW42):
  „v modulu Audit export kapacit jak historie podle docházky s reálnými čísly … tak i budoucnost
  co plánujeme … export od do … co již má data z docházky bude vykázané a budoucí datumy jako
  plánováno … jak se u koho kdy měnili zkušenosti … historie vývoje školení“.
  - Příloha je zabalená HTML stránka (bundler, dvě vnořené stránky v Reactu). Rozbalit jde bez
    prohlížeče: `<script type="__bundler/manifest">` (base64 + gzip) a `__bundler/template`.
    Obsahuje název organizace a skutečné počty lidí: do repa nepatří, ani v testech.
  - Core `capTimeline(from, to, {now})` (vedle Plánu a skutečnosti): jen pracovní dny; den je
    `real`, když má v Docházce aspoň u někoho hodiny nebo kód (`attFilledDays`), jinak `plan`.
    Vykázaný den: lidé s řádkem v docházce toho měsíce a skupinou podle `levelAt` ke konci dne,
    bez vedoucích; přišel = hodiny bez kódu. Plán: dnešní `positionId`, bez vyřazených,
    vedoucích a nemocných (`e.sick` je datum „od“, `sick <= den`), směna `slotOn` se střídáním.
    Buňka `ctCell` (`CT_KEYS`): plán (planN/Ok/Tr/H), přítomní (present/presOk/presTr, realH,
    okH/trH), excused, miss, sick, směny, `on*` = na směně (vykázáno přítomní, plán plán),
    `rPlanH` = plán hodin jen ve vykázaných dnech (plnění), `trS*` = součet zaškolení v zácviku.
  - Procento k datu `ctPctAt(e, pos, ts)`: poslední zápis `e.hist` pro tu skupinu do ts, jinak
    nejbližší pozdější (`near`, odhad), jinak dnešní `skillPct` (`now`). Počty `est`, `noHist`.
  - Výsledek: `days`, `weeks` (+ `roster`), `months` (+ `roster`, `perf`), `total`, `real`,
    `plan`, `start`/`end` (`rosterAt`: stav skupin k datu, v minulosti z historie a jen lidé
    v docházce toho měsíce), `dev` (vývoj zaškolení: změny `e.hist` v období, `became`, `lost`,
    `steps`), `perf` (normohodiny `rec.norm` ÷ hodiny z docházky bez kódu, index první měsíc =
    100), `missing` (lidé ze skupin bez řádku v docházce), `pastPlan`, `noGroup`, `newOk`.
    `capTimelineSheets(x)`: Souhrn, Po dnech, Po týdnech, Po měsících, Vývoj zaškolení.
  - UI (ve 2.31 grafy, tabulky a PDF nahrazené stránkami podle vzoru, viz výše; zůstalo
    `waCtRange` a Excel): záložka Auditu `kapacity` (`WA_TABS`, běží i bez dat Auditu), `waCtRange` (`ui.wa.ctPre`
    m | b3 | n2 | custom, `ctFrom`/`ctTo`, data `waCt`), `waCtHtml`, `ctBars` (skládané sloupce,
    plán `.plan` světlejší s čárkovaným okrajem, `ct-req` požadavek, `ct-now` předěl), `ctPoints`
    (měsíce od 3, jinak týdny; dny do 31, jinak Ø po týdnech), `exportCtXlsx`, `exportCtPdf`,
    `drawCapTimeline`, `pdfCtBars`, `pdfCtTable` (hlavička se opakuje přes `k.onPage`, sloupec
    s pruhem podílu). PDF: lidé jen s ID (jako matice 2.20). Barvy `--ch-acc`/`--ch-tab` prošly
    validátorem dataviz (světlý, tmavý, bílý papír).
  - Testy: core „Kapacity a zaškolení (2.30)“ (ruční scénář: historie, dovolená, nemoc,
    vyřazený, vedoucí, bez skupiny, mimo docházku, výkon, Excel) a nezávislý přepočet na
    náhodných datech; `e2e_kapacity.js`.
  - Pozor: `pkill -f "php -S 127.0.0.1:8490"` ve `fresh.sh` zabije i shell, jehož příkaz ten text
    obsahuje (třeba heredoc s hlavičkou e2e testu). Soubor zapsat zvlášť, test spustit zvlášť.
  - `ODM_VERSION` 2.30, data beze změny (28).

Stav k 22. 10. 2026 (verze 2.29.1):

- Uživatel: „některé poddíly to nevložilo, že neodpovídá operace … pokud se u položky objeví
  záznam, tak ho to přidá, jedinou výjimkou je záznam obsahující ‚Odesláno na WPA‘“; „položku
  se sestavou můžeš částečně skrýt, … nepotřebuji vidět QR apod. … zajímá mě jen ten poddíl“;
  „rychlé tlačítko ‚Skrýt v PDF‘“.
  - Čekající poddíly: řádky plánu s jinou operací, ale s kódem (`shPlanRow` → `plan.other`
    počet, `plan.cands`), se uloží k položce jako `cands[≤ 100]` = `{ean, link, code, op}`.
    `shApplyRecs` kód, který není v položkách ani poddílech, hledá v `cands`: přidá poddíl
    s `byRec: true` a záznamem a vyřadí ho z `cands`; stav s „Odesláno na WPA“ (`shWpa`, bez
    diakritiky) ne. Výsledek má navíc `added`, `wpa`. Historie `sha:`.
  - `shApplyPlan` dá položce nové `cands` (bez těch, co už jsou poddílem). Poddíl `byRec`
    zůstane, dokud je jeho klíč v `cands`; poddíly drží `id`, `note`, `rec`, `byRec`, `pdfHide`.
  - `shPlanFast` teď drží odkazy u všech řádků (i jiné operace), regex na vzorec běží jen
    u buněk s `<f`.
  - Sestava s poddíly: v tabulce místo QR „sestava“ a bez pole poznámky. V PDF (`lay` → `asm`)
    nízký řádek (≥ 11 mm, `SH_MONO.asm` šedá), bez QR, záznamu a linek; jen když má viditelné poddíly.
    `row(…, keep)`: sestava potřebuje na stránce místo i pro první poddíl.
  - `pdfHide` u položky i poddílu, tlačítko `shHideBtn` (`[data-shpdfhide]`, oko) před ×.
    `shPdfItems(l)` je jediný zdroj pro PDF (počty, číslování bez mezer). Historie `shh:`.
  - Nadpisy `table.sh-tab th` se zalomí (`white-space: normal`): se dvěma tlačítky tabulka
    na 1440 px přetékala o 64 px a × bylo schované. e2e to hlídá.
  - Verze dat 28, `ODM_VERSION` 2.29.1.

Stav k 22. 10. 2026 (verze 2.29):

- Uživatel: „některé urgenty mají poddíly … prolustrovat vždy výrobní plán … v 2. listu …
  ve sloupci A je ean sestavy, E ean poddílu, H index, M číslo objednávky, AM probíhající
  operace … shodu u EAN sestavy, index a číslo objednávky … jedna z možností u probíhající
  operace“ (11 operací Hala 2, `SH_SUB_OPS`).
  - Core: `item.subs[≤ 50]` = `{id 'sp…', ean, link, code, op, note, rec}`, `list.plan` =
    `{file, at, by}` nebo null. `shPlanRow`, `shPlanKey` (bez mezer, velkými, čísla bez nul
    na začátku: EAN z plánu bývá číslo), `shSubOp` (`shOpNorm`: bez diakritiky, pomlčky jako
    mezery), `shApplyPlan` (nahradí poddíly podle plánu, zachová id/poznámku/záznam),
    `shEntry`. `shApplyRecs` bere i poddíly. Historie: `shp:` plán, `shr:`/`shn:` i u poddílů.
  - Čtení plánu (`shPlanFast` v `app.js`): stejný proud jako výrobní plán v Auditu (`waZip`,
    `waXlsxSst`, `waXlsxCells`), jen sloupce A, E, H, M, AM a jen řádky s operací Hala 2.
    Odkaz u E: `<hyperlinks>` na konci listu (i oblast E12:E20), cíl v
    `xl/worksheets/_rels/sheetN.xml.rels` (čte se proudem, jen potřebná Id), jinak vzorec
    HYPERLINK v `<f>`. Záloha SheetJS (`window.SH_PLAN_SHEETJS` ji vynutí v testu).
  - Plán zůstává v paměti okna (`ui.sh.plan`), neukládá se. `shAddList` ho použije u nového
    seznamu, `shUsePlan` nechá poddíly být, když plán k seznamu nenajde nic.
  - Se skutečným plánem nikdo nezkoušel. e2e vyrábí plán přes SheetJS (2 010 řádků, odkazy
    vložené i vzorcem, EAN číslem).
  - Verze dat 27, `ODM_VERSION` 2.29.

Stav k 22. 10. 2026 (verze 2.28.1):

- Uživatel: „poslední záznam je občas moc dlouhý a v PDF pro tisk nejde vidět celý“.
  `drawShortage` počítá výšku řádku z obsahu (`lay(it)` → řádky a `h`, nejméně 20 mm):
  poslední záznam bez ořezu (nejvýš 16 řádků), operace 8, název a objednávka 6, poznámka 12;
  linky na psaní jsou u spodku řádku. Stav záznamu se v datech držel jen 80 znaků, teď 400,
  operace 300. Verze dat 26, `ODM_VERSION` 2.28.1.

Stav k 22. 10. 2026 (verze 2.28):

- Uživatel: „1. možnost odmazat položky 2. importovat poslední záznamy k položkám … z excelu
  CTRL + V … A QR kód … B datum a čas záznamu, C počet ks, D STAV 3. měnit pořadí položek …
  přesouváním myší 4. dopsat ručně poznámku k položce 5. barevné schéma pro černobílý tisk“.
  - Položka má `id` (`si…`, unikátní v seznamu, starším seznamům ho dá čištění), `note`
    a `rec` (`{ts, when, qty, state, at, by}` nebo null). Core: `shRecBuild`, `shApplyRecs`,
    `shLooksLikeRecs` (Ctrl+V pozná záznamy podle data ve sloupci B), `shParseWhen`,
    `shMoveItem` (TOP se hýbou jen mezi sebou). Historie: `shr:` odebrání, `shn:` poznámka,
    `shz:` záznamy, `sho:` pořadí.
  - Přesouvání je vlastní (pointer events, ne HTML drag and drop): myš kdekoli na řádku mimo
    pole, dotyk jen za úchyt `[data-shgrip]` (`touch-action: none`), šipky na úchytu,
    u okraje okna se stránka posouvá. Při hledání vypnuté (`.sh-nodrag`).
  - **`.sr-only` v hlavičce tabulky je absolutně umístěný.** Bez `position: relative` na
    `.table-card` utekl z posuvné tabulky a stránka na monitoru 1280 px přetekla o 96 px.
  - PDF jen v odstínech šedé (`SH_MONO`, přepíše i `k.C` kvůli zápatí). e2e to hlídá
    vykreslením přes PyMuPDF (rozdíl barevných složek nejvýš 3).
  - Verze dat 25, `ODM_VERSION` 2.28.

Stav k 22. 10. 2026 (verze 2.27.1):

- Uživatel: „A číslo objednávky, B název dílu, C EAN dílu, D index, E urgentní množství, G pokud
  zde bude ‚TOP‘, tak bude označeno jako TOP SHORTAGE a na seznamu bude vždy nahoře, H probíhající
  operace … do QR vyextrahovat jen část … je to vždy za activeBarcode a končí &“ a „nejde udělat,
  že bych tam tu tabulku vložil ctrl + v“.
  - Položka má navíc `top` (bool), `op` (operace) a `code` (activeBarcode, `shCode`). TOP první
    (`shTopFirst`) v `shBuild` i `cleanShortage`. Seznam ze 2.27 nemá `code`: čištění ho dopočítá
    z `link`. Varování `noCode` místo `badLink`.
  - Ctrl+V: `paste` na dokumentu, když je otevřený Shortage (mimo pole a dialogy), pole
    `#shPaste`. `shClipRows(html, text)`: HTML ze schránky (Excel dává odkazy do `<a href>`)
    přes DOMParser, styly a skripty se předem odstraní (jinak CSP hlásí porušení i v netečném
    dokumentu), výřez bez `<table>` se obalí. Bez HTML `shTsv` (core). **Se skutečným Excelem
    to nikdo nezkoušel**, test vkládá HTML ve tvaru, jaký Excel dává (CF_HTML, StartFragment).
  - Odkazy ve vymyšlených datech testů a dokumentace mají host `is.example`, skutečnou adresu
    informačního systému do repa nedávej.
  - `e2e_servis.js` po přihlášení čeká na první uložení. Bez toho do něj (nezapisuje se do
    historie) podle rychlosti stroje spadl i první protokol a kontrola historie občas selhala.
  - Verze dat 24, `ODM_VERSION` 2.27.1.

Stav k 22. 10. 2026 (verze 2.27):

- Uživatel: „modul ‚Shortage‘ … importovat excel … A sloupec bude ean, B název dílu, C Číslo
  objednávky, D index, E urgentní množství … export do PDF … prostor pro poznámky, a stav
  k 10:00 a k 13:00 … ean má vždy v sobě vložený hypertextový odkaz a ten bych potřeboval mít
  i v QR kódu … orientaci na ležato“.
  - Nový modul `S.shortage` (viz oddíl Shortage níže), pohled `shortage` pod Servisem, dlaždice
    v hlavním menu telefonu, filtr a ikona v historii změn.
  - **SheetJS 0.18.5 nechává v `cell.l.Target` entity XML** (`&amp;`), proto `shUnxml`.
  - **jsPDF 4.2.1 v URI odkazu (`doc.link`) přepíše `&` na `&amp;`**, odkaz s parametry by vedl
    jinam. PDF proto klikací odkazy nemá, jen QR kódy (e2e hlídá, že anotace odkazů chybí).
  - QR kreslí `pdfQr` z qrcode-generatoru (`window.qrcode`, načítá index.php) jako vyplněné
    obdélníky, úroveň M, a když se nevejde, L. Ověřeno vykreslením PDF (PyMuPDF) a čtením
    jsQR. **ZXing JS některé platné symboly nepřečte** (verze 4, 33 modulů, i ideálně
    vykreslený); jsQR je přečte, proto e2e čte nejdřív jsQR.
  - Verze dat 23 (`DATA_VERSION` = `CLIENT_VERSION` = `ODM_MIN_CLIENT`), `ODM_VERSION` 2.27.

Stav k 20. 10. 2026 (verze 2.26):

- Uživatel: „Servis … v PDF možnost stáhnout tři verze ‚Kompletní‘ ‚K vyřazení‘ ‚Na opravu‘ …
  čistý protokol s položkami na opravu“ a „ať tam mohu dát digitální podpis do Předal (jméno
  a podpis)“.
  - Účel položky už v datech byl (`purpose 'repair'|'scrap'`). `SV_PARTS`, `svPartItems(x, part)`
    → `[{it, j}]` (j = původní index, odkazy Vráceno míří na `x.items[j]`), opravy první.
    `drawServiceProtocol(doc, x, part, sign)`, `SV_PART_DOC` (nadpis, soubor `-na-opravu`,
    `-k-vyrazeni`, zápatí). Kompletní má oddíly jen když jsou obě části; v části se u položky
    neopakuje „K opravě“. Karta protokolu: řádky `tr.sv-sec`, tlačítka `[data-svpdf][data-svpart]`.
  - Podpis: `shipment.sign {file, name, at, by}` (čištění `svSignClean`, `SV_FILE_ID`), obrázek je
    šifrovaný PNG přes `Vault.saveFile` (`signPad` kreslí pointer eventy, ořízne, max 900 × 300 px).
    `svSignDialog`, `[data-svsign]`, `[data-svunsign]`, `svDropSignFile` (smaže soubor, když na něj
    nic neodkazuje), `svFileIds` do zálohy. Úprava obsahu podepsaného protokolu (`svContentKey`)
    podpis odebere; vrácení ne. Log `svsign:` (slučuje se jako ostatní změny).
  - Verze dat 22 (`DATA_VERSION` = `CLIENT_VERSION` = `ODM_MIN_CLIENT`), `ODM_VERSION` 2.26.

Stav k 20. 10. 2026 (verze 2.25.2):

- Uživatel: „PDF report matice dovedností … dvě možnosti, s benefity a bez, čistě jen hodnoticí
  matice … v kapacitách v PDF reportu ať u zaškolovaných ukazuje průměr zaškolení s tím, že 100 %
  je dosáhnout nastavené úrovně ‚Kdo se počítá jako zkušený pracovník‘“.
  - Matice: tlačítka `#btnMatrixPdf` (Matice do PDF, čistá) a `#btnMatrixPdfBen` (PDF s benefity).
    `drawMatrix(doc, withBen)`: sloupce `BEN` mezi % a dovednostmi (Tab. dov. = `L.base`, Tab. celk.
    = `total`, Kafe, Prémie = `tier.name` + `pct`), dovednosti začínají na `SK0`. Benefity jen
    u `r.home` (zaučení odjinud je mají u své skupiny), z `allRows()` za `S.current`. Dlaždice
    „Tabáky celkem · období“, v souhrnu oddělení součet. Soubor `matice-dovednosti-benefity-*.pdf`.
  - Kapacity: `capacity()` má u `bySh[k].trS`, `score.A/B.amTs/pmTs`, `none.trS`, `g.trS` součet
    zaškolení (`min(1, skillPct ÷ (thr × 25))`), `capScoreByDept` sčítá i `trS`. `trainAvg(sum, n)`
    → % na desetiny, bez lidí `null`. Zobrazení `trainNote`/`trainCell`/`trainText` („Ø 58 %“,
    „Ø zaškolení 58 %“) v aplikaci i v PDF (`trainCells`).
  - `ODM_VERSION` 2.25.2, data beze změny (21).

Stav k 20. 10. 2026 (verze 2.25.1):

- Uživatel: „Sjednoť i docházku, ať nepočítá 8D jako docházku.“ `attendance()`: buňka s kódem
  je nepřítomnost i s hodinami (`h = c ? 0 : raw`, označeno `Oprava (2.25.1…)`). Omluvená, když
  je kód v `excusedSet()`, jinak neomluvená (`missed`). Víkendová buňka s kódem není víkendová
  směna. Hodiny u kódu jen pro informaci: `codedDays`, `codedHours`, v buňce `ah` (kalendáře
  `calStrip` a `pfCalendar` je ukazují v popisku).
  - Mění se tím Kafe (`totalHours`), absence, srážky a bonus za víkendy, `fundRatio`, využití.
    Vydané měsíce mají snímek (`issued`), nemění se. Porovnání s původní aplikací prochází,
    protože ukázková data žádné „hodiny + kód“ nemají.
  - Test „Docházka (2.25.1)“ a nezávislá kontrola z 2.24.2 teď porovnává `workHours` přímo.
  - `ODM_VERSION` 2.25.1, data beze změny (21).

Stav k 19. 10. 2026 (verze 2.25):

- **Dovednost „Není nutností“ a celkové skóre v reportu kapacit.** Uživatel: „u dovedností
  zakliknout ‚Není nutností‘ a nebralo by to v celkovém hodnocení tolik v potaz … přehlednější
  report o kapacitách na dané oddělení … aby to vypovídalo spíše o celkovém skóre“. Na dotaz
  zvolil: **jedno skóre všude** (i tabáky a prémie) a **čtvrtinovou váhu**.
  - `skillset[].opt: true` (jen `true`, nutná dovednost pole nemá). `OPT_W = 0.25`, `skillW`,
    `needSkills` (když jsou všechny nepovinné, platí všechny), `optText`.
  - `skillPct` = vážený průměr. Bez nepovinných přesně stejné číslo jako dřív (test na 420
    náhodných kombinacích, `===`). Tím se mění i tabáky (`skillTab`), schopní (`capableIn`),
    historie zařazení (`pct` při změně). Vydané měsíce mají snímek, nemění se.
  - `minRate` jen z nutných dovedností: prémie „všechny **nutné** dovednosti aspoň X“ (`tierChecks`
    i `tierConds(t, p)` pro Excel a PDF pravidel; když jsou nepovinné všechny, bez slova „nutné“).
  - Rizika: úvod HALA 2 (`staffDay`), pokrytí v matici (`coverage[].opt`) a `capRisks` nepovinné
    dovednosti nehlásí. Log: „dovednost „X“ není nutností / je zase nutná“.
  - `capacity()`: `skills[].opt`, `g.opt` (počet), `g.score` `{A, B, none, weaker}` = zkušení
    pracovníci (`am/pm`) a pracovníci v zácviku (`amT/pmT`) skupiny podle procenta skupiny;
    `bySh[k].tr`. `capScoreByDept(cap)`: skupiny po odděleních, u víc skupin `total`.
  - Report: `capReport.detail` (`#capDetail`) `all` | `none`, výchozí `need` se **neukládá**
    (aktualizace data nezmění). `need` = skóre + nutné dovednosti, nepovinné sbalené do řádku
    `tr.cap-fold`; `all` = i nepovinné (`tr.cap-opt`, bez barvy rizika); `none` = jedna tabulka
    `capScoreHtml` (`.cap-score-card`, dvojice `tr.cap-pro` / `tr.cap-train`, oddělení `tr.cap-dept`
    jen když nese informaci, `capDeptHead`). PDF stejně (`drawCapacity`).
  - Uživatel pak: „V reportech ať je vidět ‚Zkušení pracovníci‘ a ‚Pracovníci v zácviku‘.“ Místo
    „schopní“ a „v zaškolování“ v reportu kapacit (aplikace i PDF, `CAP_PRO`, `CAP_TR`), v plánované
    kapacitě a v Plánu a skutečnosti (karta i Excel: `Zkušení pracovníci: …`, `Pracovníci
    v zácviku: …`, sloupec `Zkušený pracovník`). V kódu zůstávají názvy `ok`/`tr`, `capable`.
  - Rozhraní: zaškrtávátko `[data-skopt]` v řádku dovednosti a `name="opt"` v dialogu
    (`applySkill`), štítek `optTag`, v matici `th.mx-col.is-opt` „nepovinná“, v PDF matice `*`.
  - `ODM_VERSION` 2.25, `DATA_VERSION` = `CLIENT_VERSION` = `ODM_MIN_CLIENT` = 21.

Stav k 19. 10. 2026 (verze 2.24.2):

- Uživatel: „Plán a skutečnost podle docházky nesedí nějak hodiny. Udělej kompletní kontrolu,
  potřebuji mít odpracované hodiny a plnění hodin jak pro schopné, tak ty, co se zaučují.“
  - Chyby 2.24: odpracováno skupiny obsahovalo hodiny lidí mimo plán (vyřazených ve skupině),
    Celkem i hodiny lidí bez skupiny; lidé ve skupině bez směny nebyli v plánu.
  - Teď: v plánu každý ve skupině (ne vedoucí; bez směny `slot: 'noshift'`; dnes vyřazený jen
    s docházkou v tom týdnu), `realH` jen lidé v plánu, `extraH` zvlášť (skupina „Mimo plán“),
    u buněk `ok` a `tr` (schopní / v zaškolování: planN, present, planH, realH, excusedH),
    `excusedH`, `totalDays`. Pomocné `prBlank`, `prAdd`, `prRound`, `prPct`.
  - Uživatel pak: „Počítej jen pokud jsou v práci. Pokud mají nepřítomnost, tak to nepočítej jako
    odpracované hodiny.“ Buňka s kódem je nepřítomnost i s hodinami („8 D“): `kind` podle kódu
    (excused / code), odpracované hodiny buňky `w` = 0, hodiny u kódu jen `absH` (Excel: „D (8 h)“
    a sloupec Hodiny u nepřítomnosti). Všechny součty berou `c.w`, ne `c.h`.
    Docházku (`attendance`) uživatel nechal sjednotit ve 2.25.1 (viz výš).
  - Excel: Souhrn (týden po skupinách), Po dnech, Lidé (plnění u člověka, mimo plán h).
  - Test „Plán a skutečnost (2.24.2): nezávislá kontrola“ přepočítá vše ze surové docházky na
    ukázkových i náhodných datech (40 lidí, 2 měsíce, i dny „hodiny + kód“) a porovná
    s `attendance().workHours` minus hodiny u kódu.
  - `ODM_VERSION` 2.24.2, data beze změny.

Stav k 19. 10. 2026 (verze 2.24.1):

- Uživatel: „Plán a skutečnost podle docházky ber vždy jen pracovní dny.“ `planReality` má
  `days` jen pracovní (`d.work`), víkend a svátek se nepočítají ani s hodinami; `holidays`
  (svátky v týdnu) se jen uvedou v kartě a v Excelu. `ODM_VERSION` 2.24.1, data beze změny.

Stav k 19. 10. 2026 (verze 2.24):

- **Plán a skutečnost podle docházky** (Směny a kapacita). Uživatel: „export historické
  obsazenosti podle docházky … vybrat týden zpětně … plán a realita, kolik kdo odpracoval.
  Spárovat to podle jména … jaký byl plán a jaká realita na daných pozicích“.
  - Core: `attDay(key, iso)` (docházka člověka v den, null bez docházky), `attWeeks()` (týdny
    s docházkou), `planReality(weekId)` → `{days (has), rows, groups (week, days), total,
    missing, unpaired, mg, thr}`, `planRealitySheets(weekId)` (Souhrn, Po dnech, Lidé). Plán: skupina
    `levelAt(e, konec týdne)`, směna dnešní, `slotOn` se střídáním `S.capReport.s1am`, hodiny
    `dayShift` (zkrácený pátek), jen pracovní dny s nahranou docházkou. Skutečnost: hodiny,
    kód (omluvený podle `excusedSet`, jinak chybí), mimo plán = hodiny lidí mimo plán zvlášť (2.24.2); víkend a svátek
    se nepočítají vůbec (2.24.1). Páruje se klíčem
    `příjmení|jméno` (řádky docházky a lidé mají stejný); poznámky „v docházce není (jiné
    jméno?)“, „v Lidech není“, „bez skupiny“, „bez směny“, „vyřazen“, „vedoucí“.
  - UI: `capHistHtml` (karta `.cap-hist`, `noprint`, `#capHistWeek`, `ui.capHist`),
    `exportPlanReality` (`plan-a-skutecnost-RRRR-Wtt.xlsx`).
  - Skupina se bere na konci týdne: kdo změnil skupinu uprostřed týdne, je celý týden v nové.
  - `ODM_VERSION` 2.24, verze dat beze změny (20).

Stav k 19. 10. 2026 (verze 2.23):

- Uživatel: „lepšího filtrování v modulu Lidé … jen bez skupiny, bez zařazení nebo podle
  oddělení … ten box můžeš rozšířit … na velkém monitoru vidím jen část“ a „Směny a kapacity …
  lidé, co nesplní ‚Kdo se počítá jako schopný‘, ať se počítají do kapacity ‚V zaškolování‘
  a je tato kapacita oddělena od kapacity schopných“, potom „ať v PDF exportu nemá ty
  upozornění ‚Odpoledne bez schopného člověka‘“ a „odstraň i Plánovaná kapacita (25 ks na osobu
  za směnu), ať také není v PDF exportu“.
  - Lidé: `LIDE_STATES` (nogroup, noshift, norate, sick, lead, out), `lideState`, `lideScope`
    (`d:` + oddělení, nebo id skupiny; vedoucí podle `e.lead`), `lideScopeOptions`,
    `#lFilters` (`#lScope`, `[data-lst]`, `[data-lclear]`), prefs `lideF {g, st}`.
    `renderPeople({refilter})`: po změně filtru nebo hledání se vybere první shoda, jinak
    vybraný člověk zůstane v seznamu (`.held`, „mimo filtr“). „Bez zařazení“ jsme vzali jako
    bez směny (ve skupině je zvlášť Bez skupiny); kdyby to uživatel myslel jinak, doplnit.
  - Šířka: `.main:has(> #view-lide.on)` až 2400 px, `#peopleSplit` seznam `clamp(300px, 26%,
    520px)` (jen nad 1100 px). Oprava: `.seg` z úvodu HALA 2 (2.15) přebíjel `.rate-seg`
    (mřížka 3 sloupce), teď je jen pod `.home`.
  - Kapacita: `capacity()` má u dovednosti `by[k].tr` (+ `trK` klíče lidí), `A/B.amT/pmT`,
    `training`; u skupiny `ok`, `training`, `bySh[k].ok` (`capableIn`: průměr dovedností aspoň
    práh). `groupPlan(p, v, days, thr)` s prahem přidá `ok` a `tr`, celkové hodnoty zůstaly
    (úvod HALA 2 a Audit je berou beze změny). UI `capCell(n, risk, tr)`, `planCell`, rizika
    počítají různé lidi v zaškolování. PDF bez oddílu rizik a bez plánované kapacity (v aplikaci
    obojí zůstává).
  - `ODM_VERSION` 2.23, verze dat beze změny (20).

Stav k 19. 10. 2026 (verze 2.22.2):

- **Servis: interní ID rozhoduje.** Uživatel: „Když upravuji záznamy, tak mi to hlásí duplicitu
  i když interní ID je jiné u každé položky.“ Pravidla z 2.22.1 braly za stejné zařízení i stejné
  výrobní číslo nebo označení (sjednocení přes všechny klíče).
  - Nové pravidlo `svSameKey`/`svSameK`: dvě čitelná různá interní ID = dvě zařízení. V. č.
    a označení rozhodují, jen když jednomu z nich ID chybí. Platí všude: `svFindDevice` (přes
    `svFinder`), duplicity v protokolu (dvojice, ne sjednocení klíčů), `clash`, `svDevDups`,
    kontrola v dialogu zařízení.
  - `svOwners`: odkaz `dev` platí i s jiným ID (oprava čísla, evidence mezitím opravená), ledaže
    na stejné zařízení odkazuje víc položek: pak se ta s jiným ID hledá podle svých čísel.
    Opraví to protokoly z 2.21/2.22, kde druhá položka se stejným v. č. přepsala ID první
    a obě skončily u jednoho zařízení (`svSaveShipment` hledal podle v. č. i při jiném ID).
  - `svSaveShipment` u upravovaného protokolu zapíše do evidence jen pole, která se proti
    původní položce změnila (dřív starý snímek vrátil ID opravené v evidenci).
  - Nejspíš šlo o prohazování nebo opravu výrobních čísel, nebo o protokol ze starší verze.
    Jistě to nevíme: když se to bude opakovat, potřebujeme přesný text hlášky (v závorce je důvod).
  - `ODM_VERSION` 2.22.2, verze dat beze změny (20).

Stav k 19. 10. 2026 (verze 2.22.1):

- **Servis: duplicity červeně a nahoře.** Uživatel: „V případě duplicit, ať mi to označí červeně
  duplicitní zařízení a dá je to nad sebe třeba nahoru“.
  - Editor: `svDupCheck` (core) při každém psaní v ID, v. č. nebo označení; `svHints(only)`
    přebarví karty (`.sv-item.dup`) a nápovědy jen tam, kde se stav změnil (`data-dupst`).
    Jen barva a text v nápovědě dole, rozložení se pod rukama nemění. Při uložení `svDupOrder`
    dá duplicity nahoru pod sebe a protokol se neuloží.
  - Nově se hlídá i „číslo jiného zařízení z evidence“ (`clash`): ID jednoho zařízení
    a výrobní číslo jiného by uložení zapsalo do evidence a vznikla by duplicita. Duplicita,
    která v evidenci už je, odeslání neblokuje (jen čísla, která zařízení ještě nemá).
  - Evidence: `svDevDups` → řádky `tr.dup` nahoře pod sebou, `.sv-dupwarn`, upozornění v detailu.
    Z rozhraní už duplicita v evidenci vzniknout nemá (dialog i protokol ji hlídají), test ji
    vkládá přímo do `S`.
  - Oprava z 2.22: na telefonu bez vzorů se výběr z evidence v hlavičce smrskl na pár písmen.
  - `ODM_VERSION` 2.22.1, verze dat beze změny (20).

Stav k 19. 10. 2026 (verze 2.22):

- **Servis: rok výroby a vzory zařízení.** Uživatel: „kolonku pro rok výroby a možnost uložit
  zařízení jako vzor, a bude si to pamatovat Druh zařízení, značku a Model“.
  - Položka i zařízení mají `made` (text do 10 znaků, nepovinné), v PDF je sloupec Rok výroby.
  - `S.service.templates[≤ 300]` `{id 'tp…', kind, brand, model}`, bez duplicit (`svTplKey`),
    ukládá `svAddTemplate`. V editoru hlavička položky: výběr z evidence, „Podle vzoru…“
    (`[data-svtpl]`, jen když nějaký vzor je) a „Uložit jako vzor“ (`[data-svtplsave]`).
    Seznam a mazání v záložce Zařízení (`svTemplatesHtml`, `[data-svtpldel]`).
  - Tlačítko vzoru je v hlavičce schválně: mezi Modelem a ID rozbíjelo Tab z klávesnice.
  - `ODM_VERSION` 2.22, `DATA_VERSION` = `CLIENT_VERSION` = `ODM_MIN_CLIENT` = 20.

Stav k 19. 10. 2026 (verze 2.21):

- **Servis: odeslání zařízení na servis.** Uživatel: „modul ‚Odeslání na servis‘, kde se
  následně vygeneruje jednoduché PDF, předávací protokol … datum odeslání, jednotlivá zařízení,
  jejich interní ID, výrobní číslo, značka, model a druh zařízení. U ID nebo výrobního čísla ať
  jde zaškrtnout, že číslo je nečitelné a pokud budou obě nečitelné, tak proto bylo označeno
  dodatečně na spodní stěnu horního krytu, jak je řídicí jednotka. Při odeslání na servis modul
  vytvoří zařízení a bude k němu uvádět historii“ a doplnil: „zda odesíláme k opravě nebo na
  vyřazení … závada: Nelze spustit, Nedrží stabilně otáčky, Přehřívá se, Nadběrné rezonace –
  nejde dlouho držet v ruce, poškozené zařízení“ (v aplikaci opraveno na „Nadměrné rezonance“).
  - Data `S.service` (verze dat 19), podrobnosti v sekci Servis níže. Pohled `#view-servis`,
    v menu za Protokoly, dlaždice v hlavním menu telefonu, historie změn kind `service`.
  - Chyby nalezené testem: nápověda u položky se obnovovala až při opuštění pole, posunula
    tlačítko pod kurzorem a klik na Přidat další zařízení se ztratil (teď se obnovuje při psaní
    a jen když se text změní). Překreslení s kurzorem v poli házelo chybu (před překreslením
    `blur()`).
  - `ODM_VERSION` 2.21, `DATA_VERSION` = `CLIENT_VERSION` = `ODM_MIN_CLIENT` = 19.
  - **Se skutečným servisem a jeho postupem to nikdo nezkoušel**: zpětnou vazbu na protokol
    (co v něm chybí, jestli servis chce i jiné údaje) je potřeba od uživatele.

Stav k 15. 10. 2026 (verze 2.20):

- Uživatel: „export v matici dovednosti, že report PDF nebude obsahovat jména, ale jen ID
  v evidenci práce … report do PDF z MATICE … ať se nezohledňují vyřazení lidé a je maximálně
  vidět, že někteří jsou aktuálně nemocní, ať je jen povědomí, ale aktuálně se nepočítá do
  kapacity“.
  - Core: `skillGrid(groupId, shift, dept, byId)`: `byId` řadí uvnitř skupiny podle ID
    (`widCmp`, čísla podle hodnoty, bez ID na konci); pokrytí (`coverage`) počítá jen lidi bez
    `sick`, výsledek má `sick` (počet nemocných v řádcích). Excel (`matrixSheets`) má řádek
    „V nemoci: N“. Vyřazené vynechává `matrixPeople` jako dřív.
  - UI: přepínač `#matrixIds` (pref `P.matrixIds`, `cleanPrefs`), `mxWho`/`mxWhoHtml` (jméno,
    nebo `ID x` / „bez ID“) v řádcích, aria-label a u vedoucích v hlavičce oddělení; KPI
    „v nemoci“, součty „bez nemocných“, legenda se štítkem nemoc.
  - PDF: `drawMatrix(doc)` (A4 na šířku, filtr z Matice, vždy jen ID), `pdfIluo` (čtvrtinový
    kruh přes `doc.lines`), svislé názvy dovedností (`angle: 90`, výška podle nejdelšího,
    nejvýš 36 mm, delší na dva řádky), skupiny nad sloupci, víc než ~27 dovedností = víc
    tabulek, hlavička se opakuje na nové stránce, řádek směny drží s prvním člověkem a poslední
    řádek se součty. `exportMatrixPdf` (tlačítko `#btnMatrixPdf`) upozorní na lidi bez ID.
  - Testy: core „matice (2.20)“, e2e_matice (ID na obrazovce, PDF bez jmen a bez vyřazeného,
    nemoc, pokrytí bez nemocných; po kontrole vrátí ID, nemoc a vyřazení zpátky).
  - `ODM_VERSION` 2.20, data beze změny (verze 18).

Stav k 15. 10. 2026 (verze 2.19.2):

- Uživatel po nasazení 2.19.1: „stále v přehledu u Audit nemohu vybrat od jakého data do jakého
  data“. Příčina: `<input type="date">` v Chrome posílá `change` (i `input`) po **každé napsané
  číslici**, jakmile je datum platné. Překreslení na `change` pole nahradilo novým, fokus zmizel
  a datum nešlo dopsat (výběr z kalendáře fungoval). Stejná chyba byla u vlastního období v Dnech.
  **Pole s datem nikdy nepřekreslovat na `change`.**
  - `waDatesHtml(id, v)` (pole Od, Do a tlačítko Zobrazit, `data-wadates`, `data-wadate`,
    `data-waapply`), `waDatesMark` (změněné období zvýrazní tlačítko), `waApplyDates(id)` (obě
    data povinná, obrácené prohodí; `waH` → `hist: 'custom'`, `waPlan` → `planRange: 'custom'`,
    `wa` → `mode: 'custom'`). Enter v poli = Zobrazit.
  - Pole jsou v přehledu a plánu vidět vždy (předvyplněná viděným obdobím), čipy Vlastní zmizely
    z `WA_HIST` a `WA_PLAN_RANGES`; `waPlanWeekIds` bere `custom` zvlášť.
  - e2e píše datum z klávesnice (`keyboard.type('10142026')`, formát mm/dd/yyyy headless
    Chromia) a hlídá, že pole zůstane ve stránce s fokusem. Zrušení čtení velkého plánu kliká
    přes `evaluate`: `page.click` čeká na snímky vykreslení a při rychlém čtení (2 s) klikl pozdě.
  - `ODM_VERSION` 2.19.2, data beze změny (verze 18).

Stav k 14. 10. 2026 (verze 2.19.1):

- Uživatel: „Udělej ještě v Audit možnost vybrat od do podle sebe ne fixní týdny.“
  - Core: `waCustomRange(wa, from, to)` vrací `{from, to, wFrom, want, clipped}` oříznuté na dny
    s daty (`waSpan`), nebo `{…, empty: true}`; obrácené meze prohodí. Dny mimo data by se jinak
    počítaly jako pracovní dny bez lidí (stejný důvod jako u `waHistRange`).
  - UI: `ui.wa.hist = 'custom'` (čip Vlastní v `WA_HIST`), `ui.wa.hFrom/hTo`, vstupy `#waHFrom`,
    `#waHTo`; při přepnutí se předvyplní aktuálně viděné období. `waOverviewRange()` je jediný
    zdroj období pro přehled, PDF i Excel (názvy souborů `report-OD-DO`). `waShortRange(x, r)`
    u vlastního období (`r.want`) ukazuje jen dny týdne v období; u pevných voleb celé týdny
    jako dřív. Od za Do posune druhou mez (`waSetRange` v obsluze `change`).
  - Výrobní plán: `WA_PLAN_RANGES` má `custom` (`ui.wa.pFrom/pTo`, `#waPlanFrom`, `#waPlanTo`),
    bere celé ISO týdny, do kterých dny spadají.
  - `ODM_VERSION` 2.19.1, data beze změny (verze 18), `ODM_MIN_CLIENT` 18.

Stav k 14. 10. 2026 (verze 2.19):

- Uživatel: „přidat do TOP5 možnost přidání komentáře o vývoji ke každému případu pro lepší
  přehlednost co se děje.“
  - Data: `case.comments[≤ 500] = {id 'k…', at, by, text ≤ 2000, round, ed {at, by} | null}`
    (`cleanEff`, `CASE_COMMENT_MAX`). `addCaseComment`, `editCaseComment`, `deleteCaseComment`
    píšou i `effNote` (historie případu → `S.log`, kind `eff`); `lastComment`, `commentShort`.
    `caseCopy` a vydané reporty komentáře nekopírují.
  - UI: `t5CommentsHtml` (karta Vývoj případu nahoře v detailu, koncept `ui.t5.cdraft`,
    Ctrl+Enter), úprava v dialogu s textarea, smazání s potvrzením; seznam případů má sloupec
    Vývoj (poslední komentář) a hledání v něm. PDF: `pdfCaseDetail` oddíl „Vývoj případu
    (komentáře)“ jen v plné verzi.
  - Data verze 18, `CLIENT_VERSION` = `ODM_MIN_CLIENT` = 18 (stránka 2.18.x by komentáře
    zahodila), `ODM_VERSION` 2.19.

Stav k 14. 10. 2026 (verze 2.18.2):

- Uživatel: „výrobní plán má vždy dva listy … identifikovat sloupce vždy podle druhého řádku, kde
  jsou názvy … jeden má až 7 MB a bude jich třeba 30 … klidně bych to nahrával postupně
  jednotlivě po souboru a pak jen dal zpracovat soubory.“
  - **Fronta** (`ui.wa.planQ` jen v paměti okna): `waPlanQueueAdd` přečte soubor
    (`waPlanReadFile`), sloučí řádky do `q.map` (`waPlanMerge`, statistika po souborech),
    duplicitní soubor pozná podle SHA-256 obsahu. `waPlanProcess` načte uložené díly,
    `waPlanMergeMap` (core, statistika proti uloženému plánu), souhrn, uložení jako dřív.
    Průběh `waProgress` (u čtení tlačítko Zrušit → chyba `{aborted}` z `step`).
  - **Rychlé čtení xlsx** (`waZip`, `waZipReader` s `DecompressionStream('deflate-raw')`,
    `waXlsxSst`, `waXlsxRead`, `waXlsxOpen`; `waPlanOpen` jednotné rozhraní listů
    `read({top, pick, onRow, progress})`, záloha SheetJS a CSV přes `waMemSheet`). Změřeno
    v Chromiu: 7 MB / 56 000 řádků 2,0 s a 79 MB paměti (SheetJS 5,6 s, 241 MB); 25 MB / 200 000
    řádků 5,6 s (SheetJS 15,8 s). e2e porovnává hodnoty se SheetJS (sdílené texty i inline).
  - Vzor: nadpisy výchozí na 2. řádku (když má aspoň dva texty). `waPlanCols` zkouší nejdřív
    řádek ze vzoru, při stejném názvu víckrát bere sloupec se stejným písmenem jako ve vzoru,
    nenalezená pole vrací v `missing` (fronta upozorní). List bez sloupce technologie: řádky
    mají sedmou hodnotu 1 a filtr se na ně nepoužije.
  - `ODM_VERSION` 2.18.2, data beze změny (verze 17).
  - Pořád se čeká na vzorek skutečného souboru plánu.

Stav k 14. 10. 2026 (verze 2.18.1):

- Uživatel potvrdil: „100 je pevné číslo.“ Požadavek lidí na pracovní den je výchozí pevných
  100 (`WA_TARGET` v `core.js`, `blankWorkAudit`). Data verze 17: `sanitizeState` u dat starších
  než 17 nastaví `target` 100, když není vlastní číslo (2.18 ukládala `null` = podle souboru).
  Od verze 17 je `null` volba uživatele (prázdné pole v Nastavení) a zůstane.
  - `CLIENT_VERSION` = `ODM_MIN_CLIENT` = 17, `ODM_VERSION` 2.18.1.
  - Ověřeno: core testy (nová data 100, z 2.18 100, vlastní číslo zůstane, null od 17 zůstane),
    e2e Auditu (výchozí 100 v přehledu a Nastavení), aktualizace 2.3, 2.17.2 a 2.18 → 2.18.1
    na Apachi v kontejneru (u 2.18 i s uloženým výrobním plánem).
  - Pořád se čeká na vzorek souboru výrobního plánu.

Stav k 13. 10. 2026 (verze 2.18):

- Uživatel: „Obsazenost proti plánu … podíl, kolik dnů bylo dodrženo požadované množství 100 lidí
  a více na pracovní den, a jak dlouhý zpětný dopad má výpadek lidí, než se to statisticky
  dorovná (dva týdny chybí 3 lidi → další dva týdny 3 lidi navíc). Osobosměny odstranit, po
  měsících ne, jen týdny. Import výrobního plánu (vždy dva listy), jeden jako vzor se sloupci
  číslo objednávky, EAN, počet ks, index, termín dokončení a technologie; jen položky
  s technologií ‚G2‘ nebo ‚G‘; statisíce řádků, precizní filtrace duplicit podle objednávky,
  indexu a EAN, platí nejdelší termín; linie kusů k dodání proti kapacitě brusičů (25 ks na
  směnu).“
  - „100 lidí a více“ = v práci ≥ 100 % požadavku (`waReq`: pevné `wa.target` z Nastavení,
    jinak plán ze souboru). Uživatel pak potvrdil pevných 100 lidí → 2.18.1.
  - `waTotals`: `reqDays`, `metDays`, `metShare`, `balance`, `avgReq`. `waStaffing(wa, days)`:
    kumulovaná bilance po dnech, výpadky (od poklesu pod nulu po návrat na nulu), otevřený
    výpadek s návrhem `extra` (Ø chybějících, zaokrouhleno nahoru) × `needDays`.
  - Přehled jen po týdnech (`WA_HIST` 13/26/52/vše), `waHistRange` od prvního dne s daty
    (`wFrom` = pondělí). Karta „Výpadek lidí a dorovnání“ (`waStaffHtml`, `waBalanceChart`),
    tabulka týdnů se Splněno dní, Bilance a Kumulovaně. PDF: dlaždice, výpadek (fakta + graf
    `pdfWaBalance`), skupiny, týdny. Excel: Souhrn, Skupiny, Výpadky, Týdny. Bez osobosměn
    a měsíců.
  - Výrobní plán: `wa.plan` (sekce Audit níže), záložka `plan` (`waPlanHtml`), vzor
    (`waPlanTemplate`), import (`waPlanImport`), díly souborů (`waPlanStore`, `waPlanLoad`),
    smazání (`waPlanClear`), kapacita `waPlanCapacity`.
  - Data verze 16, `ODM_MIN_CLIENT` 16 (stránka 2.17 by plán a požadavek zahodila).
  - Ověřeno: core testy, e2e Auditu (vzor, dva soubory s posunutými termíny, 120 000 řádků,
    smazání plánu, záloha), aktualizace 2.3 → 2.18 a 2.17.2 → 2.18 na Apachi v kontejneru.
  - **Se skutečným souborem plánu to nikdo nezkoušel.** Od uživatele se čeká vzorek plánu
    (bez osobních údajů).

Stav k 13. 10. 2026 (verze 2.17.2):

- Uživatel: „HALA 2 · AUDIT v reportu přepiš na ‚HALA 2 · REPORT‘ a v přehledu udělej rozpad na
  jednotlivé skupiny.“
  - PDF: hlavička `HALA 2 · REPORT`, zápatí „report“, soubory `report-…` (PDF i Excel). Slovo
    audit v exportech není (hlídá e2e).
  - `waTotals` u skupiny: `work` (součet na pracovních dnech s obsazeností), `avg` a `share`
    (podíl na lidech v práci). `waFx(t, gid)` sjednotí čísla celku a skupiny (skupina nemá
    plán ani obsazenost). `waSheets(wa, r, gid)`: bez skupiny listy Souhrn, Skupiny, Týdny,
    Měsíce; se skupinou jen její Souhrn, Týdny, Měsíce.
  - Přehled: `ui.wa.group` (výběr `#waGroup`, nebo klepnutí na řádek `[data-wagrp]`), karta
    Po skupinách (`.wa-gtab`, pruhy `.wa-gbar` přes `data-w`), dlaždice, grafy a tabulka
    období pro skupinu. PDF (`drawWorkAudit(doc, r, gid)`) a Excel podle výběru.
  - `ODM_VERSION` 2.17.2, data beze změny.

Stav k 13. 10. 2026 (verze 2.17.1):

- **Audit osekaný pro auditora.** Uživatel: „započítává to všechny kusy a já potřebuji jen
  operace, které jsou zařazené do skupiny … přehled historický ohledně kapacit lidí a produkci
  … po týdnech a měsících. Osekej to, ať tam má auditor co nejméně dat a jen fakta a graficky
  hezky udělané s grafy.“
  - Kusy jen z operací se skupinou (`waDay`: `on && group`). Import novou operaci nepřiřadí
    (`group: ''`), `waGuessGroup` je jen návrh na klepnutí. V UI není přepínač Zohlednit,
    výběr skupiny nastaví `on: true`, „— nepočítat —“ = bez skupiny.
  - Přehled = historie (`waHistHtml`): `ui.wa.grain` week/month, `ui.wa.hist` 3/6/12/0 měsíců
    (`waHistRange`: měsíce do posledního dne s daty, týdny od pondělí). Tři grafy (`waChart`
    sloupce s čárkou plánu, `waLine` čára), tabulka období (klik → Dny).
  - Záložky: Přehled, Dny (+ `waCheckHtml` Ke kontrole), Úpravy, Nastavení. Týdny a měsíce
    a Skupiny a operace jsou pryč.
  - PDF (`drawWorkAudit`, `pdfWaChart`): souhrn, měsíce (grafy + tabulka, jen při ≥ 2
    měsících), týdny (grafy + tabulka ve dvou sloupcích), věta s definicemi. Excel (`waSheets`):
    Souhrn, Týdny, Měsíce. Interní věci (dny, kontrola, úpravy, operace, soubory) jen v aplikaci.
  - `ODM_VERSION` 2.17.1, data beze změny (verze 15).

Stav k 13. 10. 2026 (verze 2.17):

- **Audit: lidé v práci a zpracované kusy.** Uživatel: „modul pro audit, kde bude přehled lidí
  v práci historicky, kolik se kdy zpracovalo ks, denně, týdně … ve sloupci D datum a pro ranní
  směnu: I kolik mělo dorazit, K brusiči, L brush, M frézování, N lepení a značení dílů,
  O kontrola/balení/brigadýr/školitelé, P obsluha tryskací kabiny, R absence, S projekt Daiho,
  T celkem … odpolední: U požadavek, V skutečně, W frézování, X brusiči, Y brush, Z tryskací
  kabina, AA kontrola/balení/brigadýr/školitelé … výkaz práce, kde A datum, H operace, J počet
  ks … nastavení, jaké operace chci zohlednit … rozdělit do oddělení … Pískování – hala 2 …
  obsluha tryskací kabiny … zaškrtnout ‚Neproduktivní pozice‘ nebo ‚Tento projekt není evidován
  v IS‘ … pro auditora … pěkné a přehledné … modifikovat výsledky … víkendy a státní svátky“.
  - Data `S.workAudit` (verze dat 15), čištění `cleanWorkAudit`, výpočty a export v `core.js`
    (`wa*`), historie `waChanges` (kind `workaudit`). Podrobnosti v sekci Audit níže.
  - UI: pohled `#view-audit` (`renderWorkAudit`, záložky Přehled, Dny, Týdny a měsíce, Skupiny
    a operace, Úpravy, Nastavení), detail dne s úpravami (`waDayDialog`), nahrání se souhrnem
    (`waImport`), PDF na šířku (`drawWorkAudit`, `newPdf('landscape')`, `pdfKit` pozná
    orientaci), Excel (`waSheets`). Odznak `#navWa` = operace bez skupiny.
  - Historie změn má nově filtry Protokoly a Audit (Protokoly v 2.16 filtr ani ikonu neměly).
  - **Se skutečnými soubory to nikdo nezkoušel.** Rozložení sloupců je přesně podle zadání,
    test běží na vymyšleném Excelu vyrobeném v prohlížeči. Od uživatele se čeká vzorek obou
    souborů (bez osobních údajů), hlavně jestli je v obsazenosti řádek na den, v jakém tvaru
    je datum a jestli výkaz práce nemá víc listů nebo souhrnné řádky s datem.
- `ODM_VERSION` 2.17, `DATA_VERSION` = `CLIENT_VERSION` = `ODM_MIN_CLIENT` = 15.

Stav k 12. 10. 2026 (verze 2.16):

- **Protokoly: provozní deníky strojů.** Uživatel: „modul ‚Protokoly‘, kde bude možné vytvořit
  provozní deník pro jednotlivé stroje … jednotlivé kroky i s fotkami … a intervalem provedení
  … tisk … pro jaký rok … nebo individuální od kdy do kdy … víkendy vždy nějak označ … Doporučení
  pro dnešek: 1, 2, 4 … na dva roky dopředu … zakroužkovat ‚Dle doporučení‘ nebo ‚Provedené
  úkony:‘“. Ptal se i, jestli je legislativně v pořádku předtisknout doporučení (viz níže).
  - Data `S.logbooks[]` (verze dat 14), čištění `cleanLogbooks`, plánovač v `core.js`
    (`lbDue`, `lbPlan`, `lbRowSteps`, `lbRange`, `lbEveryText`), historie `lbChanges` (kind
    `logbook`). Podrobnosti v sekci Protokoly níže.
  - **Fotky jsou mimo stav**: tabulka `files` na serveru, `api.php?action=file`
    (GET/POST/DELETE), šifruje je `Vault.saveFile` stejným DEK (AAD `odmeny/file/v1|<id>`).
    Ukládání stavu tak zůstává malé a verze se nenafukují. Záloha `.odmeny` je nese v `files`,
    obnova je vrátí (`Vault.restoreFiles`, záloha z jiné instalace se přešifruje).
  - UI: pohled `#view-protokoly` (seznam strojů a detail jako Lidé), karta stroje, úkony
    (sbalené, rozbalí se klepnutím), náhled 14 dní, tisk. PDF `drawLogbook` (jsPDF, `pdfKit`):
    karta stroje a úkony s fotkami, měsíční archy, opravy a zaškolená obsluha.
  - Legislativa (odpověď uživateli, není to právní rada): předtištěné doporučení je plán,
    záznamem je až zakroužkovaný/vypsaný a podepsaný řádek. Intervaly mají vycházet z návodu
    výrobce a místního provozního předpisu (NV 378/2001 Sb., zákoník práce). Revize vyhrazených
    technických zařízení deník nenahrazuje. Totéž je v UI (`.lb-legal`) i v PDF.
  - Čeká se na zpětnou vazbu uživatele (vzhled archu, vzorové úkony, co v deníku chybí).
- `ODM_VERSION` 2.16, `DATA_VERSION` = `CLIENT_VERSION` = `ODM_MIN_CLIENT` = 14.

Stav k 11. 10. 2026 (verze 2.15):

- **HALA 2, hlavní menu a rozbalovací menu na telefonu.** Uživatel: „dole napravo …
  rozevírací menu … ‚Vyhledat člověka‘ ‚Sankce‘ ‚TOP 5‘ ‚Kontroly‘ a při přihlášení … krátká
  hezká animace ‚Hala 2‘ a rychlý přehled plánované obsazenosti pro dnešní den … ‚Ranní /
  Odpolední / Obě směny‘ a až po zvolení se animací rozevře menu“; „ať to je fakt pěkně
  udělané … a zároveň pro byznys“. Spodní lišta a nabídka Více z 2.14 jsou pryč.
  - `core.js`: `slotOn(e, mg)` (am/pm/rot/none) a `staffDay(from)`: nejbližší pracovní den,
    střídání podle `S.capReport.s1am`, po odděleních lidé na směně, nemoc, bez směny,
    kapacita (ks/h na osobu × lidé skupiny), rizika dovedností (≤ 1 člověk s úrovní ≥ práh
    z reportu kapacit, jen kde skupina na směně někoho má), kontroly dne, termíny Top 5.
    Test v `test_core.js`.
  - `app.js`: pohled `domu` (`#view-domu`, `renderHome`, `homeOpenHtml`, `chooseShift` mění
    jen dotčené části, aby přepínač plynule přejel), `playSplash` (`#splash`, 2 s, klepnutím
    přeskočit, s `prefers-reduced-motion` se neukáže), `countUp`, plovoucí menu (`openFab`,
    `closeFab`, `renderFabDot`, `ui.fabOpen`, Zpět ho zavře v `onPopState`),
    `openPersonSearch` (dialog `tall`, filtr směny z `ui.homeShift`, akce detail / sankce /
    profil / kartička přes `scanEmployee`). Na telefonu se po přihlášení nastaví
    `ui.view = 'domu'` ještě před `renderAll`, takže hlavní menu je první záznam historie.
  - `app.html`: logo je tlačítko `#brandHome` (telefon → hlavní menu, desktop → Přehled;
    desktop je pixelově stejný), `.brand-text`, `#fabWrap`, `#fabScrim`, `#splash`.
  - Oprava seznamu lidí: `.list` a `.split-list` mají `grid-template-columns: minmax(0, 1fr)`,
    `.list-item` `min-width: 0`, oddělení vedoucího na dva řádky.
  - **Pozor na testy přetečení:** v mobilním režimu Playwrightu (`isMobile`) se okno při
    přetečení samo rozšíří a `innerWidth` roste. Měř `scrollWidth - clientWidth`
    (opraveno ve všech e2e).
  - Testy na telefonu: po přihlášení čekají na `#view-prehled.on, #view-domu.on` a konec
    animace; pomocník `nav()` jde přes logo → hlavní menu → dlaždici.
- Data beze změny (verze dat zůstává 13), jen `ODM_VERSION` 2.15.

Stav k 11. 10. 2026 (verze 2.14):

- **Telefon jako aplikace.** Uživatel: „V telefonu mi to přijde trošku rozházené … ať to je
  na telefonu jako aplikace a přívětivé … Jen to dělej opatrně, ať nic nerozbiješ.“
  Všechno je v `@media screen and (max-width: 900px)`; desktop je beze změny (ověřeno
  souřadnicemi postranního panelu před a po).
  - `app.html`: období (`.period-box`) je uvnitř `.side-top` (desktop: mřížka, období pod
    logem jako dřív; telefon: jedna lepivá lišta logo | období | uložení, historie, zámek).
    Méně používané části mají v `#nav` třídu `nav-sec`, přibylo `#navMore` (Více)
    a `<dialog class="sheet" id="moreSheet">`. Filtry přehledu: `#ovTools` s `#ovFilterBtn`
    (`mob-only`) a třídou `ov-extra` u skupiny, přepínačů a sloupců.
  - Spodní lišta: `#nav` je `position: fixed` mřížka 5 tlačítek, `.nav-sec` skryté.
    `openMoreSheet()` staví dlaždice z `#nav .nav-sec` (i s odznaky), `renderMoreDot()`
    (volá ji `renderTop5Badge`) ukáže tečku u Více.
  - Historie: `syncHistory()` (volá `showView`, `renderPeople`, `renderPositions`,
    `renderTop5`) zapisuje `{odmView, sub, i}`; `sub` z `navSub()` = `person`/`pos` jen na
    telefonu, `case` v Top 5. `ui.hist` zrcadlí záznamy této stránky. `onPopState`: otevřený
    `#dlg`/`#moreSheet` zavře (událost `cancel` jako Esc) a záznam vrátí; jinak přepne část
    nebo zavře podstránku. Tlačítka zpět v aplikaci (`#pBack`, `#posBack`, `[data-t5back]`,
    `[data-pfback]`) jdou přes `navBack(isTarget, fallback)`: `history.back()` jen když je
    předchozí záznam přesně cíl, jinak původní akce (záznam se přepíše).
  - `#main[data-view]` (pruh s ukázkou jen v Přehledu), `#view-lide:has(.split.show-detail)`
    schová záhlaví, `.page-head .lede` sevřená na 2 řádky (klik přepne `.open`),
    `showActiveChip()` posune záložky vodorovně (ne stránku), dialogy `dialog.dlg` zespodu
    (`sheet-up`), `scroll-padding` kvůli lištám, 16px písmo polí jen na iOS (`@supports
    (-webkit-touch-callout: none)`).
  - PWA bez service workeru: `static/manifest.webmanifest` (start a scope `../`), ikony
    `static/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`
    (vyrenderované z loga v Chromiu), odkazy a meta v `index.php`, CSP `manifest-src 'self'`,
    v Apache `AddType application/manifest+json .webmanifest`.
  - Testy: nový `e2e_mobil.js`; testy, které na telefonu klikaly na skryté části, mají
    pomocníka `nav()` přes Více; `e2e_top5` ověří Zpět z případu; `test_odmeny.py`
    `test_home_screen_manifest`.
- Data beze změny (verze dat zůstává 13), jen `ODM_VERSION` 2.14.

Stav k 11. 10. 2026 (verze 2.13):

- **Skener kartičky v Sankcích.** Uživatel: „ikonu scanneru k Zaměstnanec … scan kartičky
  ‚ID v evidenci práce‘ a tím si urychlil hledání“.
  - `keyByScan(raw)` v `core.js`: `keyByWid` celého kódu, pak částí (nejdřív oddělených
    mezerou nebo `;,:|=/`, pak jen písmena a číslice).
  - `app.js`: `#sanScan` vedle `#sanWho`, `scanEmployee(blocked)` (dialog s kamerou,
    polem `#scanInput` pro čtečku jako klávesnici + Enter, `#scanFind`), `startCodeScan`
    (BarcodeDetector, jinak ZXing přes `app.php?f=zxing.js`, každých 160 ms),
    `stopCodeScan` při zavření. Vyřazený a vedoucí se nevybere.
  - Knihovna `private/vendor/zxing.min.js` = `@zxing/library` 0.23.0 (UMD, Apache-2.0,
    `LICENSE-zxing.txt`), bez eval a síťových volání; jen pro odemčenou relaci.
  - Test: `e2e_skener.js` s `--use-file-for-fake-video-capture` (MJPEG z
    `tests/fixtures/code128-4711.jpg`); Chromium na Linuxu nemá BarcodeDetector, takže
    test ověřuje cestu přes ZXing.
- **„HALA 2“ v exportech.** Uživatel: „ve všech exportech apod. namísto názvu aplikace
  ‚ODMĚNY‘ uváděj ‚HALA 2‘“. `EXPORT_NAME` v `app.js`: zápatí a záhlaví PDF (pravidla,
  kapacita, kontroly), `creator` PDF, název zálohy `hala2-zaloha-….odmeny` (formát zálohy
  `odmeny-backup` a přípona zůstávají kvůli obnově). Top 5 je bez názvu (dřívější přání),
  aplikace samotná a přístupová kartička se dál jmenují Odměny.
- Data beze změny (verze dat zůstává 13).

Stav k 11. 10. 2026 (verze 2.12):

- **Srážky ze mzdy za neproduktivitu.** Uživatel: „možnost srážek u některých skupin jen za
  neproduktivitu ve formě srážek ze mzdy. Např. Plnění normy pod 50% je srážka 50% ze mzdy,
  Plnění mezi 51 až 60% je 25% srážka ze mzdy.“
  - Data (verze 13): skupina `normCut {from: 'YYYY-MM' | '', rows[{max, pct}]}` (pásma
    vzestupně, „do X %“ včetně, nejvýš 10, bez dvojic), `S.normCutDone {měsíc: {klíč: {pct,
    norm, at, by}}}` = snímek při „Srážka zpracována“ (už se nepřepočítá).
  - Výpočet: `normCutRule`, `normCutBand`, `normPctOf(prod)` (stejně jako `perfOf().norm`),
    `normCutOf(e, pid, prod)` (`allRows` → `r.ncut`), `normCutPending(today)` (měsíce
    v `S.production` od `wageFrom`, `withPeriod` kvůli evidenci toho měsíce),
    `wageAllPending` = ruční srážky ze mzdy + za neproduktivitu (`kind: 'san' | 'norm'`,
    id `n:měsíc:klíč`), `setNormCutDone`, `normCutText` (historie, PDF).
  - UI: `normCutEditorHtml` v editoru skupiny (`#posNormCut`, `[data-ncrow]` s `data-ncmax`
    a `data-ncpct`, `data-ncadd/ncdel`, `#posNormCutFrom`; výchozí pásma 50 → 50 %, 60 → 25 %,
    platí od vybraného měsíce, když je tento nebo minulý, jinak od tohoto), sloupec přehledu
    `ncut` (jen když má skupina pravidlo, jde skrýt), karta `normCutCardHtml` v detailu
    (`data-ncdone/ncundo`), upozornění a seznam (`markWage` zná id `n:`).
  - Benefity nekrátí, do tabáků ani prémií nezasahuje.

Stav k 10. 10. 2026 (verze 2.11):

- **Varianty prémie.** Uživatel: „přepracoval prémie, ať mohu přidat více variant a pro každou
  variantu zaškrtat co vše musí plnit např.: Norma, bezproblémové kontroly, docházka, pracovní
  morálka a zaškrtat jaké dovednosti musí mít a na jaké úrovni“.
  - Data (verze 12): u varianty (`tiers[]`, v UI „varianta“, v kódu dál tier) přibylo
    `skills[{id, lvl 1–4}]` (dovednosti skupin, i cizích; sanitize je zúží na existující
    a `dropTierSkills` je smaže se skupinou nebo dovedností), `maxKt` (null = nehlídá se,
    jinak nejvýš tolik kontrol s nálezem v měsíci, `ktOf(key, pid)` z `S.audit.plans`)
    a `moral` (bod `MORAL_ID = 'moral'` v `S.marks`, jedno označení pro všechny varianty).
  - Převod (jen data `v < 12`): bod vedoucího s textem „Dodržování řádné pracovní morálky“
    (nebo „Pracovní morálka“, „Řádná pracovní morálka“) → `moral: true`, označení v `marks`
    se přesunou na `moral` (při dvou označeních platí první důvod). Jiné body zůstanou.
  - UI: `tierCardHtml` = zaškrtávací podmínky `[data-tc]` (`TIER_CONDS`: pole a výchozí
    hodnota po zapnutí; prázdné pole vrátí výchozí, vypíná se jen zaškrtnutím), dovednosti
    `[data-tsk]` + `[data-tsklvl]`, cizí skupiny v `<details class="tsk-other">`. Kopie
    variant do ostatních skupin vlastní dovednosti skupiny nekopíruje.
  - `tierChecks` nové kontroly `k: skill1 | kt`, morálka jako `k: manual, id: 'moral'`;
    `tierConds` (PDF, Excel) a `tierText` (historie) je vypisují.

Stav k 10. 10. 2026 (verze 2.10.1):

- **Matice po odděleních.** Uživatel: „mi přijde jako nesmysl, aby skupiny byly v řadě za sebou.
  Je to pak nepřehledné … třeba podle oddělení jednotlivých a dát je pod sebe“.
  - `skillGrid(groupId, shift, dept)`: třetí parametr omezí sloupce na skupiny oddělení,
    řádky jsou jeho lidé a zaučení odjinud (`home: false`).
  - UI: `renderMatrixGrid` skládá karty `mxSectionHtml` (`.mx-sec[data-mxdept]`): hlavička
    s vedoucími (`.mx-sec-lead`, nahradila pás `.mx-leads` z 2.7) a souhrnem `.mx-kpi`,
    tabulka s pevnými šířkami sloupců a prázdným sloupcem `.mx-fill` (zarovnání pod sebou).
    Řádek za směnu jen při víc směnách, `tr.mx-guest` + štítek „zaučení“.
  - Filtr `#matrixGroup`: `''`, id skupiny, nebo `d:` + oddělení (jen u oddělení s víc
    skupinami, `mxFilter`/`mxFilterOptions`; oddělení s jednou skupinou = ta skupina).
    `P.matrixDept` drží až 80 znaků. Excel se nezměnil.
  - Data beze změny (verze dat zůstává 11).

Stav k 10. 10. 2026 (verze 2.10):

- **Dovednosti vedoucích.** Uživatel: „U vedoucích pracovníků, ať je možné také přidat
  dovednosti, budou stejné pro všechny jen každý bude mít jinou úroveň podle standartního
  schématu 1 až 4“.
  - Data: `S.leadSkills[]` = `{id, name, desc}` (id s předponou `l`, vždy `STD_SCALE`, bez
    vlastního schématu). Hodnocení je v `e.rate[id]` jako u skupin; sanitize přidá id do
    `skillIds`, takže se hodnocení vedoucích uloží. `leadPct(e)` = průměr × 25 % (bez
    dovedností `null`). Do `levelOf`, tabáků, prémií ani `capacity` nezasahuje.
  - UI: záložka **Vedoucí** v Matici (`MX_TABS` `leads`, `#mxPanelLeads`/`#leadView`,
    `renderLeadMatrix`): matice vedoucích (stejná tlačítka `data-mxr`/`data-skill` jako
    hlavní matice, klik po setRate volá `renderMatrix()`), seznam `leadSkillRowHtml`
    (`data-lsrow`, `data-lsup/lsdown/lsedit/lsdel`, `leadSkillClick`), dialog `leadSkillDialog`
    (jen název a popis). Detail vedoucího: karta `.lead-rate` s `rateRows(e, S.leadSkills)`
    a `[data-goleads]`. Excel: list „Vedoucí“ (`matrixSheets`). Historie: „Dovednosti vedoucích: …“
    a u člověka „vedoucí – název“ (`skillLabel`).
  - `.table-card` má `container-type: inline-size`; karta s `width: fit-content` ho musí
    vypnout (`.lead-wrap`), jinak se smrskne na nulu.
- Data verze 11.

Stav k 10. 10. 2026 (verze 2.9):

- **Plánovaná kapacita skupiny.** Uživatel: „ať jde u některých skupin zaškrtnout plánovaná
  kapacita na osobu v počtu kusů … ukáže plánovanou kapacitu, kolik můžeme až zpracovat kusů na
  ranní, kolik na odpolední, kolik za den a kolik za týden“ a „ať je možnost uvést kapacitu na
  ks nebo hodiny“. Skupina `plan{v, unit: ks|h}` (h na 0,1), `groupPlan(p, v, days)` (ranní/
  odpolední podle varianty A/B, den, týden), `workDays(week)` (Po–Pá bez svátků). UI: editor
  skupiny (`#posPlan`, `#posPlanV` textové pole s čárkou, `#posPlanUnit`), `planHtml`/`planRows`
  v reportu kapacit a v editoru, řádek v PDF kapacity.
- **Nemoc.** Uživatel: „ať jde u lidí zaškrtnout NEMOC a dočasně ho to nebude počítat do
  kapacit“. `e.sick` = datum, od kdy; `capacity()` a `groupPlan` nemocné vynechají (`cap.sick`,
  dlaždice „Nemoc“), v seznamu lidí a v matici štítek „nemoc“. Do benefitů ani kontrol nezasahuje.
- Data verze 10.

Stav k 10. 10. 2026 (verze 2.8):

- **Stálá odpolední směna** (uživatel: „přidej ještě do směn STÁLÁ ODPOLEDNÍ“). Klíč `O`
  v `SHIFTS` (pořadí R, O, S1, S2), všechny seznamy směn berou `SHIFT_KEYS`. Kapacita:
  `A.pm = O + S2`, `B.pm = O + S1`, `head.O`, `bySh.O`; dlaždice se stálou odpolední vždy.
  Import zařazení pozná „odpolední“.
- **Kapacita po týdnech.** Uživatel: „můžeš sloučit S1 třeba se stálou ranní a S2 se stálou
  odpolední. Příští týden má Skupina 1 ranní a Skupina 2 odpolední a točí se klasicky po týdnu.“
  `S.capReport.s1am` = ISO týden, kdy má skupina 1 ranní (výběr `#capS1` „Ranní tento týden
  má“); `morningGroup`, `capWeekVar` (A = skupina 1 ranní). `capWeeks(rep)` dá tento a příští
  týden (bez nastavení varianty A/B), tabulka i PDF mají za týden sloupce Ranní a Odpolední
  (sloučené směny), `capRisks(cap, weeks)`. Uživatel ještě musí v reportu jednou nastavit,
  kdo má tento týden ranní (podle něj příští týden T42/2026 skupina 1, tedy T41 skupina 2).
- Data verze 9 (stará stránka by směnu `O` a `capReport.s1am` při čištění zahodila).

Stav k 10. 10. 2026 (verze 2.7):

- **Vedoucí pracovníci.** Uživatel: „možnost přidat mezi lidé vedoucí pracovníky a ty se nebudou
  promítat do benefitů apod.. jen budou v kvalifikační matici jako vedoucí daného oddělení,
  … ať vždy u těchto lidí mohu zaklikat jaké oddělení mají na starosti“.
  - Data: `e.lead` = pole názvů oddělení (`deptOf` skupin), prázdné = vedoucí bez oddělení;
    `isLead(e)`, `leadsOf(dept)`, `leadPeople()`, `leadsFollowDept` (přejmenování oddělení
    u skupiny), `leadLine` (řádek do Excelu matice). Nové pole ⇒ data verze 8.
  - Vedoucí je vyřazený z `activeRows` (přehled, tabáky, Kafe, prémie, výdej), `matrixPeople`,
    `skillGrid`/`skillMatrix`, `capacity`, `audPeople` (kontroly), nabídky sankcí, párování
    výroby, počtu nezařazených a počtu lidí ve skupině. `excludedPeople` vedoucí neukazuje.
  - UI: dialog Přidat člověka (volba vedoucího + oddělení), oddíl „Vedoucí pracovníci“ v seznamu,
    `renderLeadDetail` (zaškrtávání oddělení `[data-leaddept]`, poznámka, přepínač `#pLead`),
    přepínač `#pLead` i u běžného člověka (`setLead`, předvyplní oddělení jeho skupiny),
    pás `.mx-leads` nad maticí (`mxLeadsHtml`, od 2.10.1 jména v hlavičce oddělení), sloupec „Vedoucí oddělení“ v exportu/importu
    zařazení, záznamy v historii změn („je vedoucí pracovník (…)“, „už není vedoucí“, změna oddělení).
  - Opraveno mimochodem: `input` bez `type` (jednoduché dialogy přes `promptBox`) neměl styl.

Stav k 10. 10. 2026 (verze 2.6):

- **✦ Přeformulovat vše, nebo vybrané části.** Uživatel: „vyplním veškeré kolonky a poté budu
  mít tlačítko ‚Přeformulovat vše nebo přeformulovat určitou část‘ … Chci úpravy pro Proč se to
  stalo, Co s tím jde dělat, Co jde udělat hned a Co si vyžádá procesní čas.“
  - Jedno tlačítko `[data-t5ai]` v liště `.t5-ai-bar` mezi krokem 4 a 5 (místo tlačítka
    u příčiny). Dialog „Co přeformulovat“ (Vše + 4 části, prázdné a delší než 2000 znaků nejdou
    vybrat), pak dialog s návrhem po částech (`use-<část>`, `v-<id>`), „Použít vybrané“.
  - Na server jde `{parts: [{id, text}]}`; id `cause`, `options`, `now-N`, `process-N`
    (opatření každé zvlášť, jen text; odpovědná osoba ani termín ne). Název pole pro model
    doplní server (`odm_ai_part_label`). Jedno volání pro všechny části, odpověď `{parts}`;
    chybí-li část, 502. Starý tvar `{text}` (stránka 2.5) server pořád umí.
  - Použití jde stejnou cestou jako ruční úprava (`effNote`), část změněná během čekání se
    přeskočí (porovnává se s odeslaným originálem).
- **Definitivní smazání zrušeného případu.** Uživatel: „udělej možnost definitivního smazání
  pokud bude případ v sekci Zrušené. A tato položka se smaže a nikde nebude zohledňována“.
  - `deleteCase(id)` v `core.js` (jen `cancelled`): pryč ze `S.eff.cases` a z vydaných
    reportů (`top[].case` = "", `cases`, `deadlines`); položka v žebříčku zůstává.
    `describeChanges` zapíše „zrušený případ smazán natrvalo“. Tlačítko `[data-t5delete]`
    v detailu (u „Případ je zrušený“) a ve sloupci seznamu při filtru Zrušené.
  - Výklad „položka“ = případ; data dílu z evidence práce a ručního zápisu týdne zůstávají.
    Historie změn (`S.log`) se nemaže (je to záznam, kdo co dělal).
  - `S.eff.nos{rok: číslo}`: nejvyšší smazané číslo, aby se číslo případu znovu nepoužilo.
    Nové pole ⇒ `DATA_VERSION`, `CLIENT_VERSION`, `ODM_MIN_CLIENT` = 7.
- Top 5 PDF: osekaná verze už v PDF ani v názvu souboru neuvádí, že je osekaná (jde auditorovi).
- Ověřeno: unit testy, serverové testy, všechny průchody v prohlížeči a aktualizace 2.3 → 2.6
  na lokálním Apachi (`EXPECT_VERSION='2\.6' … e2e_upgrade24.js`).

Stav k 10. 10. 2026 (verze 2.5):

- **✦ Přeformulovat u příčiny v Top 5** přes Claude Sonnet 5.5 (`claude-sonnet-5-5`). Uživatel
  chtěl „tlačítko s hvězdičkami“, které text „zkontroluje a přeformuluje do profesionálního
  znění“. Upozornil jsem ho, že to porušuje jeho pravidlo z 2. 10. („AI nesmí posílat data
  třetí straně“); odpověděl: „Pošle jen danou část textu bez ostatních informací“. Výjimka
  tedy platí **jen pro text toho jednoho pole** po kliknutí, nic jiného se neposílá.
  - Server: `lib/ai.php` (oficiální PHP SDK přibalené v `lib/vendor`, beta `messages->create`
    s `fallbacks: 'default'`, `effort: low`, strukturovaný výstup `{text}`), akce `ai_rewrite`
    v `api.php`, `me.ai` říká, jestli je funkce zapnutá. Klíč v datovém adresáři
    (`anthropic-api-key`, 0600), ukládá ho `bin/ai-key.php` (`--test`, `--stav`, `--smazat`).
  - Text se neukládá ani neloguje; tabulka `ai_calls` drží jen kartičku, délku a čas (limit
    30/h na kartičku, 300/den). V `error_log` jsou jen třídy chyb, nikdy text.
  - Klient: `maskNames`/`unmaskNames` v `core.js` (jména z evidence → `[osoba N]`, i skloňované
    tvary), `t5Rewrite` v `app.js` (návrh v dialogu, Použít = stejná cesta jako ruční psaní).
  - Uživatel musí vytvořit klíč na console.anthropic.com a uložit ho na serveru (README).
    **S reálným klíčem to nikdo nezkoušel**; ověřeno náhradním API a v kontejneru proti
    skutečnému API s neplatným klíčem (správně odmítnut, hláška „Klíč k API nefunguje“).

Stav k 9. 10. 2026 (verze 2.4):

- **Matice dovedností místo Pozic** (pohled `matice` se záložkami Matice, Skupiny a pravidla,
  Směny a kapacita; starý `pozice` je jen alias). Zadání uživatele (zkráceně): vytvořit
  skupiny s názvem, u každé „Přidat dovednost“ (název, popis, hodnoticí schéma 0–4 se
  standardními texty Žádná až Odborná úroveň); u skupiny maximum tabáků za dovednosti, každá
  úroveň 25 %, procento skupiny = průměr („dvě dovednosti, jedna na 4 = 50 %“); sankce za
  absence nad limit a bonus za víkendy; prémie, když má všechny dovednosti aspoň na 3 a splní
  body (absence do 3 dnů, aspoň 2 víkendy, norma 80 %, „dodržování řádné pracovní morálky“)
  → např. +20 % mzdy, další stupeň Extra bonus a „4 měsíce v řadě → možnost 2. platové
  třídy“; u každého směna Stálá ranní / Směnnost skupina 1 / skupina 2; report rozložení
  a kapacit „vždy spojíš Skupinu 1 s ranní stálou a porovnáš proti Skupině 2 a pak naopak“,
  upravitelný a k tisku. A: „současné pozice zůstanou u každého člověka v okně s tlačítkem
  Převedeno do nové verze, smazat … ať se nám nevypaří data“.
- Rozhodnutí 2.4 (uživateli řečeno v závěru práce):
  - tabáky = `round(maxTab × procento)`, zaokrouhleno na celé (`skillTab`);
  - nová skupina nemá strop (`max: null`): bonus za víkendy se přičte k dovednostem;
    převedené pozice dostaly strop = nejvyšší úroveň (jako dřív);
  - body vedoucího platí jako splněné, dokud je vedoucí u člověka a měsíce neoznačí;
  - série měsíců v řadě se počítá ze snímku výdeje (`issued.tier`), jinak z výpočtu;
  - převod: pozice → skupina s jednou dovedností (úrovně = původní úrovně), úroveň člověka
    i zaučení → hodnocení, navýšení u úrovní → stupně prémie, `e.legacy` = okno s původním
    zařazením. Původní pole (`levels`, `level`, `skills`) zůstávají uložená.
- **Sankce (2.4)**: procento je posuvník 5–50 % po 5 % (`SAN_PCTS`). **Srážka ze mzdy**
  (`wage: true`): benefity nekrátí; od 7 dní před koncem měsíce sankce je nahoře upozornění
  (`#wageAlert`, `wagePending`) se seznamem a tlačítkem „Srážka zpracována“ (`done{at, by}`),
  zmizí, až jsou zpracované všechny. Zadání: „týden před koncem měsíce vyskočí upozornění …
  budu muset odkliknout Srážka zpracována a pokud to bude u všech, tak upozornění zmizí“.
- **Top 5 PDF (2.4)**: souhrn a PDF případu ve dvou verzích, kompletní a osekaná (bez
  historie případu, volba v dialogu, pamatuje se v `prefs.t5PdfShort`). Záhlaví „Top 5
  nejméně efektivně“ bez prostrkání, bez řádku Zpracovatel/Datum/Podpis, bez slova Odměny,
  „Stav k“ jen s datem. Od 2.6 osekaná verze o sobě nic neříká (ani v záhlaví, zápatí,
  vlastnostech PDF, ani v názvu souboru). Uživatel: „Je to přímo pro auditora a nechceme
  zveřejňovat extra detaily interní a když tam dáš ‚osekaná verze‘ tak to je špatný.“
- Od uživatele se čeká zpětná vazba na Matici (texty, report kapacit), na srážku ze mzdy
  (kdy přesně má upozornění přijít) a na Top 5 PDF.

Stav k 9. 10. 2026 (verze 2.2 a 2.3):

- **Verze 2.2: modul Top 5 nejméně efektivně** (pohled `top5`, data `S.eff`). Uživatel
  zapisuje Top 5 týdne **ručně** (EAN, název dílu, strávený čas, norma), import evidence
  práce s EAN je jen předvyplnění „do budoucna“. Případy s koly, opatřeními a ověřením
  14/30 dní, PDF týdenního reportu, souhrnu a případu pro auditora. Podrobnosti v části
  „Top 5 nejméně efektivně“ níže.
- Zadání uživatele k Top 5 (jeho slovy, zkráceně): týdenní report 5 položek s nejhorším
  poměrem výkaz práce a norma, „na profi úrovni pro auditora, který se zaobírá průtokem dílu
  a nedodáváním včas“; u každé proč se to stalo, co s tím jde dělat, co jde udělat hned, co si
  zadá procesní čas (žádost o pohledovost, přípravek s technologií…), termíny ověření (14 dní
  po dokončení úkonů, pak 30 dní od předchozí kontroly); soupis problémových EAN s kompletní
  historií, „ať se neřeší duplicitně, jen se otevře znovu původní problém“; PDF týdenních
  reportů a celkový souhrn. „Top 5 budu vkládat vždy manuálně … do budoucna z importu.“
- **Verze 2.3: Kontroly** (pohled `kontroly`, data `S.audit`). Zadání uživatele: „ke každému
  oddělení Nutné úkony, co musí operátor dělat v jednotlivých bodech. A vždy půjde vygenerovat
  na týden dopředu namátková kontrola, vždy to vybere 25 % zaměstnanců z každého oddělení
  a rozloží je to postupně na různé dny. U každého pracovníka se uvede u každého bodu, zda
  bylo splněno, nebo ne, a zavede se to do systému do jeho karty.“ Podrobnosti v části
  „Kontroly“ níže.
- Obě verze (2.2 a 2.3) jsou na větvi `claude/elegant-clarke-vl5n7d`, do `main` zatím ne.
- Od uživatele se čeká zpětná vazba na Top 5 a Kontroly (vzhled PDF, rozložení plánu,
  texty bodů) a případně vzorek exportu evidence práce s EAN.

Stav k 1. 10. 2026:

- Odměny se oddělily do vlastních repozitářů. Kód verze 2 je stejný jako 2.1, jen běží
  samostatně na `/odmeny_v2/` a umí si zkopírovat ostrá data.
- Uživatel má verzi 2 nainstalovat s kopií dat a vyzkoušet ji:
  `git clone https://github.com/ecko456/odmeny_v2.git /root/odmeny_v2 && sudo ODMENY_KOPIE=1 bash /root/odmeny_v2/deploy/install.sh`.
- **Ostrá verze se už nebude aktualizovat** (rozhodnutí uživatele, 2. 10. 2026). Jen poběží
  a až bude verze 2 hotová, přejde se na ni. Veškerý vývoj Odměn je tady.
- **Nové zadání:** víc modulů v jedné aplikaci (viz „Plán: víc modulů v jedné aplikaci“).
  Čeká se na odpovědi na otevřené otázky.

## Verze a stav

| verze | commit | obsah |
|---|---|---|
| 1.0 | `db14339` | šifrovaný server, kartičky s QR, PIN zařízení, nové UI (= ostrá verze) |
| 2.0 | `9f26efa` | osobní pohled pro každou kartičku, historie změn, matice dovedností, profil člověka |
| 2.1 | `019af97` | navýšení platu, evidence práce s časem a ID, jen Kafe, PDF pravidel |
| 2.1 na `/odmeny_v2/` | `e762813` | stejný kód, oddělený od ostré verze |
| 2.2 | `28d6bde` | Top 5 nejméně efektivně, oprava sloupce EAN v importu |
| 2.3 | `b7a6f7d` | Kontroly (nutné úkony, namátkové kontroly 25 % z oddělení) |
| 2.4 | `ca9f5c7` | Matice dovedností (skupiny, dovednosti 0–4, směny a kapacita, prémie), srážka ze mzdy, Top 5 PDF ve dvou verzích |
| 2.5 | `f2fd3f2` | ✦ Přeformulovat u příčiny v Top 5 (Claude Sonnet 5.5, jen text pole, jména nahrazena) |
| 2.6 | `9d8f98e` | ✦ Přeformulovat vše nebo vybrané části kroků 1–4, smazání zrušeného případu natrvalo (data verze 7) |
| 2.6.1 | `485e678` | osekané PDF Top 5 neuvádí, že je osekané (ani v názvu souboru) |
| 2.7 | `7554e68` | vedoucí pracovníci (mimo benefity, v matici jako vedoucí oddělení; data verze 8) |
| 2.8 | `a3bc6cb` | stálá odpolední směna, kapacita po týdnech se sloučenými směnami (data verze 9) |
| 2.9 | `d70331b` | plánovaná kapacita skupiny (ks/h na osobu), nemoc u lidí (data verze 10) |
| 2.10 | `42f5539` | dovednosti vedoucích, společné pro všechny, úroveň 0–4 (data verze 11) |
| 2.10.1 | `ab18e3f` | matice po odděleních pod sebou (jen vzhled, data beze změny) |
| 2.11 | `f7951ed` | varianty prémie se zaškrtávanými podmínkami, vybrané dovednosti, kontroly, morálka (data verze 12) |
| 2.12 | `78e1cbc` | srážky ze mzdy za neproduktivitu podle pásem plnění normy (data verze 13) |
| 2.13 | `6d0a74f` | skener kartičky v Sankcích (kamera, čtečka), „HALA 2“ v exportech |
| 2.14 | `655e374` | telefon jako aplikace (spodní lišta, Více, Zpět, okna zespodu), přidání na plochu |
| 2.15 | `f21b39b` | HALA 2 a hlavní menu s obsazeností dne, rozbalovací menu vpravo dole, vyhledání člověka |
| 2.16 | `2044632` | Protokoly – provozní deníky strojů s úkony, fotkami, intervaly a tiskem archů (data verze 14) |
| 2.17 | `e66c6c6` | Audit – lidé v práci a zpracované kusy pro auditora (data verze 15) |
| 2.17.1 | `370a5d3` | Audit – kusy jen ze skupin, historie, osekané PDF a Excel |
| 2.17.2 | `a0ec3ab` | Audit – „HALA 2 · REPORT“, rozpad po skupinách |
| 2.18 | `0c9912a` | obsazenost proti požadavku, výpadky a dorovnání, jen týdny, výrobní plán proti kapacitě brusičů (data verze 16) |
| 2.18.1 | `ef847ad` | požadavek lidí pevně 100 na pracovní den (data verze 17) |
| 2.18.2 | `7783c11` | fronta souborů výrobního plánu, rychlé čtení xlsx, nadpisy na 2. řádku |
| 2.19 | `5b70d7e` | Top 5 – komentáře o vývoji případu (data verze 18) |
| 2.19.1 | `7f76bb1` | Audit – vlastní období od–do v přehledu a výrobním plánu |
| 2.19.2 | `a1ffc39` | Audit – pole od–do vždy vidět, použití tlačítkem Zobrazit (psaní data z klávesnice) |
| 2.20 | `0cf0ad7` | Matice – report do PDF jen s ID zaměstnanců, přepínač Jen ID, nemocní mimo počty úrovní |
| 2.21 | `c7d1af4` | Servis – odeslání zařízení na servis, předávací protokol v PDF, evidence zařízení s historií (data verze 19) |
| 2.22 | `ea74466` | Servis – rok výroby, vzory zařízení (druh, značka, model) (data verze 20) |
| 2.22.1 | `3b6c7d8` | Servis – duplicity červeně a nahoře (protokol i evidence), číslo jiného zařízení z evidence |
| 2.22.2 | `e6c4825` | Servis – interní ID rozhoduje (bez falešných duplicit při úpravě), oprava spojených zařízení, úprava protokolu nepřepíše evidenci |
| 2.23 | `96f54c0` | Lidé – filtry a celá šířka monitoru; Směny a kapacita – v zaškolování zvlášť, PDF bez upozornění |
| 2.24 | `c91b119` | Směny a kapacita – plán a skutečnost podle docházky za týden zpětně, Excel |
| 2.24.1 | `2320230` | plán a skutečnost jen za pracovní dny (víkend a svátek se nepočítají) |
| 2.24.2 | `77e4b94` | plán a skutečnost – opravené hodiny, schopní a v zaškolování zvlášť, hodiny jen ze dnů v práci, kontrola proti docházce |
| 2.25 | `2864d5e` | dovednost „Není nutností“ (váha ¼ i v tabácích), celkové skóre v reportu kapacit, Zkušení pracovníci a Pracovníci v zácviku (data verze 21) |
| 2.25.1 | `35c337a` | Docházka – den s kódem nepřítomnosti (i „8 D“) není docházka |
| 2.25.2 | `41a5fa1` | PDF matice s benefity a bez, průměr zaškolení u pracovníků v zácviku |
| 2.26 | `2abb107` | Servis – PDF Kompletní / Na opravu / K vyřazení, digitální podpis předávajícího (data verze 22) |
| 2.27 | `16b12fd` | Shortage – import chybějících dílů z Excelu, PDF na šířku s QR kódem odkazu z EANu (data verze 23) |
| 2.27.1 | `2f75738` | Shortage – nové sloupce, TOP SHORTAGE nahoře, probíhající operace, do QR jen activeBarcode, vložení přes Ctrl+V (data verze 24) |
| 2.28 | `8d74714` | Shortage – odebrání položky, poslední záznamy přes Ctrl+V, přesouvání myší, poznámka, PDF pro černobílý tisk (data verze 25) |
| 2.28.1 | `9c921cc` | Shortage – celý poslední záznam v PDF (řádek podle obsahu), stav do 400 znaků (data verze 26) |
| 2.29 | `16ffd5b` | Shortage – poddíly z výrobního plánu pod sestavou (2. list, shoda EAN + index + objednávka, operace Hala 2) (data verze 27) |
| 2.29.1 | `e18144f` | Shortage – poddíly s jinou operací podle posledního záznamu (kromě „Odesláno na WPA“), orientační řádek sestavy, Skrýt v PDF (data verze 28) |
| 2.30 | `3cd4eb0` | Audit – Kapacity a zaškolení od–do (vykázáno z docházky, plán ze zařazení, zkušení podle historie hodnocení, vývoj zaškolení, výkon, PDF a Excel) (data verze 28) |
| 2.31 | `b40b6d3` | Kapacity a zaškolení jako vzor (měsíční a týdenní souhrn, vývoj zaškolení, PDF na výšku s Plex Mono, záhlaví reportu); Shortage – ruční TOP, sestava Zobrazit plně, filtr probíhajících operací (data verze 29) |
| 2.32 | `913c38d` | Shortage – TOP 2 hned pod TOP SHORTAGE, oddělení podle probíhajících operací (uložené nastavení, bloky, filtr, PDF), ruční přesun výběrem i přetažením (data verze 30) |
| 2.33 | `5944f8d` | Audit – hranice zaškolení v % v Nastavení, platí pro celé Kapacity a zaškolení (aplikace, PDF, Excel), prázdné = podle Matice (data verze 31) |
| 2.34 | `bfc9e06` | Shortage – PDF po odděleních (každé oddělení od nového papíru, vlastní záhlaví, číslování položek i stran) (data verze 31) |
| 2.35 | `7f3c6c7` | výkaz práce jednou pro Výrobu i Audit (sloupec Operace ve Výrobě, Nahrát i do Výroby v Auditu) (data verze 32) |
| 2.36 | `5dc3da0` | Shortage – Doplnit chybějící (znovu vložené urgenty přidají jen chybějící položky, odebrané se nevrátí) (data verze 33) |
| 2.37 | `f6dacfb` | Audit – docházka a výkony z jednoho souboru, Lidé v práci (den, měsíc, PDF, Excel), produktivita a koláč dílů v profilu; Kontroly podle dnešních příchodů (data verze 34) |
| 2.38 | `59470af` | Plán kapacit – potřeba lidí celkem a po úrovních 2, 3, 4 u skupin, jak jsme na tom, doplnit, doškolit s kandidáty, PDF, Excel (data verze 35) |
| 2.39 | `6278dda` | Rychlá kontrola na telefonu – počet lidí, směna, oddělení, jen lidé v práci, seznam jmen, výměna, sdílení, uložení do dnešních kontrol a zápis (data verze 35) |
| 2.39.1 | `03b273c` | Plán kapacit jen s ID zaměstnanců (aplikace, PDF, Excel) |
| 2.39.2 | `b89b1c5` | PDF Plánu kapacit v grafickém podání jako Kapacity a zaškolení (rámečky, dlaždice, graf po úrovních proti potřebě, tabulka) |
| 2.39.3 | `aca21b0` | úvod HALA 2 na telefonu podle dnešních příchodů (v práci po směnách a odděleních proti plánu, teď v práci, nahrát příchody) |
| 2.40 | `abc9792` | Audit – Report docházky po vzoru (plnění denního požadavku z příchodů, Den / Týden / Měsíc / Rok, PDF a Excel) |
| 2.40.1 | `16e5802` | úvod HALA 2 o víkendu a ve svátek podle dnešních příchodů, poslední nahrané příchody |
| 2.41 | `48ad143` | Report docházky – vlastní skupiny z oddělení, značka dne přesčas / práce ve svátek mimo normu (data verze 36) |
| 2.42 | `351e34c` | od listopadu 2026 soubor Docházka a výkony jediný zdroj (docházka pro odměny, evidence práce místo Výroby, obsazenost a kusy v Auditu, skupiny Matice u skupin Auditu) (data verze 37) |
| 2.42.1 | `952edb7` | Report docházky – nahraný den, upozornění na párování, ID podle číslic; Rychlá kontrola – klepnutím na člověka body kontroly a zápis |
| 2.42.2 | `9df70cc` | ✦ Nastavit sloupce souboru Docházka a výkony přes AI (jen nadpisy a typy buněk) |
| 2.42.3 | `ecfee9f` | docházka z 2. listu, okno Jak se soubor načte při každém nahrání (AI návrh, vzor prvního člověka, úprava) (data verze 38) |
| 2.42.4 | `fa9101b` | docházka podle vzoru – datum v hlavičce bez roku („01.10. Čt“), WPA kód, součty na konci |
| 2.43 | `accd6f4` | Konce trestů (import se směnností a kontrolou, AI kontrola, přehled po měsících a odděleních), rozbalovací Teď v práci na telefonu (data verze 39) |
| 2.44 | `ee9fee7` | Audit přejmenovaný na KPI, Výroba pryč z menu, KPI bez Výrobního plánu a Úprav, nová záložka Výkonnost na osobu (po odděleních, průměr na den, řazení od nejlepších i nejhorších, Excel) |
| 2.44.1 | `2bcc414` | Nahrát konce trestů a směnnost – tabulka lidí, kteří v souboru nejsou, s volbou vyřadit ze seznamu |
| 2.44.2 | `457f6d5` | PDF Plánu kapacit – list na oddělení, bez jmen a ID, skupiny podle zkušenosti, kdy lidé končí a kolik zůstane |
| 2.45 | `590779e` | Poslední změny za 3 dny s tlačítkem Vrátit zpět (jen ta změna, pozdější změny zůstanou) (data verze 40) |
| 2.45.1 | `9b0dab2` | výkon v Kapacitách a zaškolení na odpracovaný den z Docházky a výkonů, PDF s výkonem i bez, hledání v Lidech podle ID |
| 2.45.2 | `f72b98b` | PDF Kapacit a zaškolení jen za zvolenou stránku, Konce trestů bez vedoucích, se zkušeností a PDF, export Docházky za měsíc (Excel, PDF) |
| 2.45.3 | `da36d15` | PDF Plánu kapacit s manažerským přehledem na 1. straně (ohrožené měsíce, potřeba po měsících, křivka vývoje), roky barevně |
| 2.45.4 | `c4f0f7e` | PDF Plánu kapacit – chybí celkem pod grafem (0 zeleně, −N červeně), chybí po odděleních pod tabulkou |
| 2.46 | `1019df6` | Úkoly (termín, zodpovědná osoba, stavy, komentáře na časové ose, opakování, připomínky), docházka zaokrouhlená na směnu a čtvrthodiny, nejvýš 7,5 h (data verze 41) |
| 2.47 | `b38bfd2` | vzhled Sklo (tmavé sklo, oranžový akcent, Plus Jakarta Sans), přepínač zpět na původní vzhled v Nastavení, PDF beze změny |
| 2.47.1 | `5e01612` | poznámka v Reportu docházky jen s počty (nepřišlo, neschopenka), spolehlivější stahování PDF a přesná chybová hláška |
| 2.48 | `f4f8d79` | kontrola jmen při nahrání docházky postaru (prohozené jméno a příjmení, překlep, ruční přiřazení), nikdo nový se nepřidá |
| 2.49 | `9580809` | KPI Výkonnost na osobu – odpracované dny přepočtené na směnu 7,5 h (kratší den = část dne) |
| 2.50 | `44ea59f` | Docházka bez nahrávání, barvy dnů (ranní, odpolední, přesčas), Excel za měsíc v jednom listu po skupinách směn s barvami |
| 2.51 | `6048aa2` | ruční úpravy docházky s důvodem, zámky dnů a měsíce (nahrání je nepřepíše), širší rozložení, požadavky pracovníka v Úkolech (data verze 42) |
| 2.52 | `3f22515` | zkušební doba 3 měsíce od prvního evidovaného dne práce, ikona u jména s datem nástupu a konce |
| 2.53 | `dc2dcf8` | plovoucí menu na telefonu s Hlavní stránkou a Ostatní, zkrácený pátek jen u odpolední sám od sebe, uzamčení vyřízeného protokolu Servisu (data verze 43) |
| 2.54 | `3152b80` | jen vzhled Sklo (volba v Nastavení pryč), méně oranžové, lepší kontrast, čitelnější kalendář Docházky, tlumené pozadí |
| 2.55 | `a1808ae` | úvodní animace přihlášení (ohnivá koule, náraz, složení panelu), přeskočí se klepnutím nebo psaním |
| 2.56 | `2afa6a0` | Servis – Vyřazeno servisem s přílohou (PDF nebo fotka protokolu), hledání lidí v menu na PC (data verze 44) |
| 2.57 | `5f8ec48` | úvodní animace přihlášení – ruka z částic, která se rozevře a utvoří panel |
| 2.58 | `b697d6d` | úvodní animace přihlášení odstraněná |
| 2.59 | `ce2ac43` | pravý panel s úkoly a rychlými akcemi, sbalitelné menu, souhrn v kapsli s pruhy a trendem, hladké křivky, barevná oddělení, skleněná plocha |
| 2.60 | `83eedbb` | pozadí přihlašovací stránky z barevných polí (WebGL) |
| 2.60.1 | `5325fd4` | přihlašovací panel z tekutého skla, pozadí v plném rozlišení |
| 2.61 | `b12a82a` | Shortage ve třech krocích (barvy EANu, výrobní plán, evidence pohybu), sloupce importů přes AI, rozbor položek se všemi poddíly (data verze 45) |
| 2.62 | `b3eefb4` | souběžná práce víc lidí (sloučení změn, okno jen u stejného údaje, průběžná aktualizace) |
| 2.62.1 | `5752b91` | audit (relace při průběžné kontrole, stálé čištění dat, test podvrženého HTML, SheetJS 0.20.3) |
| 2.63 | `7fe5cad` | kód rozdělený po modulech (`private/app/`, `private/core/`), souběžné testy v prohlížeči (`tests/run_e2e.sh`) |
| 2.64 | `3600e58` | pravý panel se roztáhne do volného místa (se Shortage), Nový úkol s Požadavkem pracovníka, výběr měsíce jen v Přehledu a Docházce |
| 2.65 | `d45d394` | kalendář v pravém panelu s poznámkami, pevné rozložení karet, stav položek Shortage (modul, panel, PDF), ruční přidání položky (data verze 46) |
| 2.66 | `78ff72c` | časová osa v pravém panelu (2 h zpět, 3 h dopředu, opakování, jen pracovní dny, splněno) (data verze 47) |
| 2.67 | `178d8f0` | Úkoly na časové ose jako samostatná část modulu Úkoly (přehled, hledání, úpravy, smazání) |
| 2.68 | `2d4e65e` | vysouvací pravý panel na tabletu a menším monitoru (tlačítko u pravého okraje) |
| 2.69 | `ad4daf6` | plán v Kapacitách a zaškolení z Plánu kapacit, v přesčas a práci ve svátek plán poloviční |
| 2.69.1 | `ce1ae20` | KPI přehled spojí kusy s lidmi v práci (lidé z docházky, kusy na osobu i bez skupin Matice) |
| 2.70 | `04478bb` | Shortage ze samostatné aplikace (urgenty A–S, poznámka od plánování, plán ze dvou listů, QR varianty, evidence předem, úprava položek, poddíly všech operací) (data verze 48) |
| 2.71 | `b3256ac` | Shortage – množství zakázky z výrobního plánu, odesláno na WPA z evidence pohybu, díl u nás (data verze 49) |
| 2.71.1 | `8184841` | Shortage – chybějící kusy po odeslání na WPA jsou u nás |
| 2.72 | `ce9ffce` | Shortage – nabídka alternativních objednávek z plánu při neshodě objednávky / line (data verze 50) |
| 2.72.1 | `a986739` | časová osa se posouvá a vrací na teď, panel bez posuvníku |
| 2.73 | `b190c78` | Shortage po dnech – zabalení dne, kolikátý den na shortage, odbourané položky, filtr TOP / TOP 2 / 2 a více dní, Historie (data verze 51) |
| 2.74 | `fd89a32` | KPI Normy – normy z vykázaných časů (zkušení nad 45 %, bez záznamů do 2 minut), plnění ve Výkonnosti na osobu (data verze 52) |
| 2.75 | `14ecc9d` | rychlejší Shortage (výška poznámek, ikony, uložení), Připnout / Odepnout do dalších seznamů, Duplikovat do vybraného oddělení (data verze 53) |
| 2.75.1 | `5099564` | Konce trestů – párování jmen po stupních (ID, přejmenovaný, prohozené, titul, část jména, překlep), ruční přiřazení v okně importu |
| 2.75.2 | `e18cb06` | Konce trestů – chybějícím lidem přidělit řádek souboru, jméno z buňky s datem („Invalid Date“) už nevznikne |
| 2.76 | `b054487` | Shortage – zelená buňka EANu = Hotovo, hotové položky vždy na konci seznamu (data verze 54) |
| 2.77 | `ac24fb4` | Rychlý scan – QR kódy z mobilu do interní evidence Shortage (pozice, hromadné načítání, množství), mobilní záznamy a Excel (data verze 55) |
| 2.78 | `3afd2dd` | Shortage – průvodce nahráním, přednastavení sloupců plánu (AI jen u jiného souboru), všechny řádky velké evidence, poslední 3 záznamy u dílu, K prověření, sestava rozdělená do oddělení podle poddílů, poznámka připnuté položky (data verze 56) |
| 2.79 | `33650cf` | modul Po termínu (tabulka po termínu se skluzem ve sloupci F, AI návrh sloupců ke kontrole, seřazení podle skluzu, plán a evidence jako Shortage, společná oddělení) (data verze 57) |
| 2.79.1 | `4582f62` | v PDF se netiskne poddíl rozdělené sestavy, který patří jinému oddělení (bez Zobrazit plně) |
| 2.79.2 | `fb58f73` | kontrola UI nejhoršími daty (čipy a tabulky na telefonu i monitoru, poznámka, Docházka s dlouhými jmény, PDF bez textu mimo stranu, celá objednávka a množství), test e2e_zatez |
| 2.80 | `f9883e0` | modul Skříňky (soupis z Excelu Ctrl+V, párování ručně psaných jmen v prohlížeči, Volné / Obsazené / K vyklizení, Je třeba vyprázdnit u vyřazených a odešlých, štítky Zebra 100 × 35 mm na skříňku a záložní klíč) (data verze 58) |
| 2.81 | větev `claude/elegant-clarke-vl5n7d` | **aktuální**: Skříňky – výzva k vyklizení (štítek s datem a lhůtou 7 pracovních dnů, nabídka po vyřazení, lhůta uplynula), tisk štítků bez nastavování (ZPL 203 dpi přes Zebra Browser Print, jinak okno tisku s PDF ve skutečné velikosti, stažení ZPL) (data verze 59) |

Verze 2.1 přidala:

- navýšení platu podle úrovně a podmínek;
- evidenci práce se stráveným časem, normou a ID;
- pozice „jen Kafe“;
- PDF s pravidly pozic.

Otevřené body:

- Uživatel možná pošle **vzorek skutečného exportu evidence práce**. Pak ověř:
  - autodetekci sloupců (`prodColumns`, `PROD_WORDS`);
  - formát času a normy;
  - párování podle ID.
- Na další práci na Odměnách se čeká na zadání.

Zadání uživatele k 2.1 (jeho slovy, zkráceně):

- Podmínky jsou navázané na **pozice a úrovně**. Např. u 2. úrovně „plnění 80 % = +5 % platu“,
  u 3. úrovně 10 %, u 4. úrovně 15 %. U každé úrovně jde nastavit docházka %, plnění normy %
  a využití fondu %.
- Export má jeden sloupec se stráveným časem a druhý s normou v minutách.
  - Plnění normy = norma ÷ strávený čas.
  - Rychlejší práce než norma znamená přes 100 %.
- Využití fondu = čas strávený nad zakázkami ÷ hodiny v práci podle docházky.
- „V evidenci práce bude jen ID zaměstnance“. Seznam „kdo má jaké ID“ se importuje v Nastavení.
- Některé pozice mají jen Kafe, bez tabáků: zaškrtávátko u pozice.
- Pravidla včetně tabáků jdou vyexportovat do PDF „Pravidla pozic“.
- **„Hlavně při update, ať se mi zachovají data.“**

## Ostrá verze a verze 2 (původní text, platil do 7. 11. 2026)

Uživatel chtěl, ať V2 **nepoškodí fungující ostrou verzi**. Proto od 30. 9. 2026 platí:

- **Ostrá verze `/odmeny/`**: `/var/www/odmeny`, `/var/lib/odmeny`, `odmeny.conf`.
  - Nejspíš běží 1.0 (`db14339`); ověř u uživatele, pokud na tom něco závisí.
    Kontrola na serveru: `grep -o "ODM_VERSION = '[^']*'" /var/www/odmeny/lib/odmeny.php`
    (1.0 nevypíše nic).
  - Její kód je v repozitáři `ecko456/odmeny` (tady jako commit `db14339`). Odsud ji nejde omylem
    přeinstalovat.
  - **Nikdy na ni nesahej** bez výslovného pokynu uživatele.
- **Verze 2 `/odmeny_v2/`** (tento repozitář): `/var/www/odmeny_v2`, `/var/lib/odmeny_v2`,
  `odmeny_v2.conf`.
  - Instalace `deploy/install.sh` ostré cesty nikdy nezapisuje. Hlídá to test
    `test_version_2_never_touches_live_install`.
  - Jediná zmínka o ostré verzi je `LIVE_DB`, zdroj kopie.
- **Kopie ostrých dat**: `sudo ODMENY_KOPIE=1 bash /root/odmeny_v2/deploy/install.sh`.
  - Používá `bin/copy-db.php`: ostrou DB otevře jen pro čtení (`SQLITE_OPEN_READONLY`
    + `VACUUM INTO`) a běží jako **www-data**. Kdyby běžel jako root, vytvořil by rootovi
    patřící `-shm`/`-wal` a aplikace by přestala zapisovat.
  - Přenese kartičky a historii verzí, ne relace, pokusy ani zařízení.
  - Existující data V2 se před kopií zazálohují.
- **Zapamatované zařízení** má V2 v localStorage pod klíčem `odmeny.device.v1:/odmeny_v2/`
  (`deviceStorageKey` ve `vault.js`); `/odmeny/` a `/` mají původní `odmeny.device.v1`.
  Obě verze jsou na stejné doméně. Se stejným klíčem by si zařízení přepisovaly a neznámé
  zařízení by druhá verze smazala.
- Cookie relace má stejný název, ale cestu podle adresáře (`/odmeny/` vs. `/odmeny_v2/`),
  takže se nepotkají.
- **Řetězce pro kryptografii (`odmeny/v1`, `odmeny/data/v1`, `odmeny/dek|…`, `odmeny/prefs/v1|…`)
  se nesmí měnit.** Kopie ostrých dat by se pak nedala rozšifrovat.
- V UI je vidět „verze 2“ (titulek, zámek, boční panel).
- **Přechod na verzi 2** (až bude hotová a uživatel ho odsouhlasí) bude potřeba naplánovat
  a vyzkoušet na lokálním Apachi:
  1. čerstvá kopie ostrých dat (`ODMENY_KOPIE=1`, starší data V2 jdou do zálohy);
  2. kontrola dat ve V2 uživatelem;
  3. přepnutí adresy: buď přesměrovat `/odmeny/` na `/odmeny_v2/`, nebo nainstalovat V2
     na `/odmeny/`. Pozor na klíč zapamatovaného zařízení, ten závisí na cestě.

  Ostrá data zůstanou jako záloha, dokud uživatel přechod nepotvrdí. Zatím se nic
  takového nedělá.

## Plán: víc modulů v jedné aplikaci (zadání 2. 10. 2026, zatím nezačato)

Uživatel chce z verze 2 udělat **jednu multifunkční aplikaci s moduly**, ať se nemusí
tvořit další aplikace:

1. **Odměny**: dnešní aplikace, **jediný šifrovaný modul** (zero-knowledge jako dnes).
2. **Třídění zakázek**: s AI asistentem.
3. **Výdej nářadí**.
4. **Expedice na WPA**.
5. **Příjem a zaskladnění**.

Požadavky uživatele:

- Po načtení stránky se ukáže **jen přihlášení**. **Admin vidí všechno.**
- Admin si **vygeneruje odkazy do konkrétního modulu**: kdo přijde přes odkaz, vidí jen
  ten modul.
- **Šifrované jsou jen Odměny**, ostatní moduly bez šifrování (data na serveru).
- Moduly nesmí nijak zasahovat do Odměn.
- **AI nesmí posílat data třetí straně, vše jen na serveru.** (Výjimka od 10. 10. 2026 na výslovné
  přání uživatele: ✦ Přeformulovat u příčiny v Top 5 pošle Anthropicu text toho pole, viz výše.)
  Claude ani jiná cloudová AI proto
  nepřipadá v úvahu. Řešení je lokální model s otevřenými váhami na serveru (llama.cpp nebo
  Ollama, poslouchá jen na 127.0.0.1, PHP k němu pouští až po přihlášení). Pozor: model data
  při zpracování vidí nešifrovaná, i když neopustí server. Pro jasná pravidla (termín, stroj,
  oddělení) může být lepší třídit bez AI a AI použít jen na volný text.

Navržený postup:

1. Platforma: přihlášení, role admin, odkazy (přístupy) do modulů, oddělená úložiště
   modulů. Testy musí ukázat, že Odměny zůstaly beze změny.
2. Pak moduly po jednom, každý podle zadání a vzorových dat od uživatele.

Otevřené otázky (zeptáno 2. 10. 2026, čeká se na odpověď):

- Mají být odkazy do modulů pro stanoviště (tablet), nebo osobní (kdo co udělal)?
- Smí být seznam lidí (jméno + osobní číslo) nešifrovaně na serveru pro ostatní moduly?
  Dnes je jen v šifrovaných Odměnách.
- Popis každého modulu: co se eviduje, kdo s ním pracuje, vzorová data.
- Co znamená třídění zakázek, odkud zakázky přijdou a kolik jich je.
- ~~Parametry serveru~~ (zjištěno 2. 10. 2026):
  - VPS s 1,9 GB RAM (volné asi 1,5 GB), **bez swapu a bez GPU** (virtio VGA);
  - AMD EPYC, 45 GB volného disku; počet jader zatím neznámý (`nproc` chyběl ve výstupu).
  - Závěr: **jazykový model na tomhle serveru ne.** Modely, které by se vešly (0,5–1,5 mld.
    parametrů), česky skoro nerozumí. Bez swapu by navíc hrozilo, že systém při nedostatku
    paměti shodí Apache, a s ním Odměny i Trading Desk.
  - Doporučeno: třídění pravidly a „učícím se třídičem“ (malý statistický model naučený na
    dříve roztříděných zakázkách, pár MB RAM, vše na serveru).
  - Jazykový model až po navýšení RAM na 8–16 GB, pokud bude potřeba.
- Který modul jako první.

## Původní úvod a Tři oddělené projekty (do 13. 11. 2026)

Claude Code si tenhle soubor načte sám na začátku každé session.

Je to hodnocení operátorů ve výrobě. Každý měsíc dostane člověk benefit:

- **tabáky**: počet;
- **Kafe**: ano, nebo ne;
- od verze 2.1 i **navýšení platu v %**.

**Verze 2 běží na `/odmeny_v2/`, vedle ostré verze na `/odmeny/`** (viz „Ostrá verze a verze 2“).
Dokumentace pro uživatele je v `README.md` (novinky verzí, instalace, kopie dat, zálohy,
postupy testů). Po každé větší práci **aktualizuj sekci „Kde jsme skončili“**.

Aplikace vychází z původní jednosouborové aplikace uživatele, `tests/hodnoceni-operatoru.html`.
Výpočty jsou převzaté, každá změna proti originálu je v kódu označená `Oprava:` a hlídá ji
`tests/test_core.js`.

### Tři oddělené projekty

Do 1. 10. 2026 bylo všechno v jednom repozitáři `trading_desk`. Uživatel chtěl, ať se projekty
nepletou, a teď má každý vlastní repozitář:

| projekt | repozitář | adresa | kód na serveru | data |
|---|---|---|---|---|
| Trading Desk | `ecko456/trading_desk` | `/trading/` | `/var/www/trading-journal` | `/var/lib/trading-journal` |
| Odměny ostré | `ecko456/odmeny` | `/odmeny/` | `/var/www/odmeny` | `/var/lib/odmeny` |
| **Odměny verze 2 (tady)** | `ecko456/odmeny_v2` | `/odmeny_v2/` | `/var/www/odmeny_v2` | `/var/lib/odmeny_v2` |

Klony na serveru jsou `/root/trading_desk`, `/root/odmeny` a `/root/odmeny_v2`. Všechny
repozitáře jsou **veřejné**. Historie Odměn je převzatá z `trading_desk`. Verze jsou commity (tagy proxy session
nepushne): 1.0 = `db14339`, 2.0 = `9f26efa`, 2.1 = `019af97`, 2.16 = `2044632`. Hashe commitů jsou jiné
než v `trading_desk`.
