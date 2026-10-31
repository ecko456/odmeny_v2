# Odměny verze 2: poznámky pro Clauda

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

## Tři oddělené projekty

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

## Kde jsme skončili

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

## Protokoly (verze 2.16)

Data `S.logbooks[]` (`blankLogbook`, `blankStep`, čištění `cleanLogbooks` v `core.js`, nejvýš
200 deníků a 60 úkonů):

- deník: `{id, name, inv, maker, model, serial, year, dept, place, owner, service, manual,
  safety, note, weekend, shifts 1–3, counter, from (ISO, kotva intervalů), photo, steps[]}`;
- úkon: `{id, name, how, ok, who obsluha|serizovac|udrzba|vedouci, stop, every{k, n, dow, day,
  month}, photos[≤ 3]}`; `every.k` je `shift|day|week|weeks|month|months|year|ndays|hours|need`
  (`LB_EVERY`), `day` 0 = první pracovní den měsíce;
- `photo` a `photos` jsou id souborů v tabulce `files` (ne data). `lbFileIds(S)` je všechny
  posbírá (záloha, mazání deníku).

Výpočty: `lbWork` (pracovní den; svátky nikdy, víkend jen s `weekend`), `lbShift` (termín
mimo pracovní den se posune na další pracovní), `lbDue(book, step, from, to)` (fáze `weeks`
a `ndays` od `book.from`), `lbPlan` (dny `{iso, dow, weekend, hol, work, day[], shift[]}`),
`lbRowSteps(d, řádek)` (řádek 0 = úkony směny i dne, další řádky jen úkony každé směny),
`lbRange('year'|'custom', …)` (vlastní nejvýš 731 dní, `cut: true`). `hours` a `need`
termín nemají (jen v kartě úkonů). `describeChanges` → `lbChanges`: klíče sloučení `lb:`
(deník), `lbf:<id>:<pole>` (údaje), `lbs:` (úkon), `lbe:` (interval „původně → teď“),
`lbp:` (fotky), `lbo:` (pořadí).

UI v `app.js` (sekce „PROTOKOLY“): `renderLogbooks`, `renderLbDetail`, `lbStepHtml` (sbalený
úkon = souhrn s náhledy, `ui.lb.openSteps`), `lbPreviewHtml`, `lbInput`, `lbClick`,
`addPhotos` (`shrinkPhoto`: max. 1600 px, JPEG 0,82), `removePhoto` (smaže i ze serveru),
`photoUrl` (dešifruje do `blob:` URL, `photoCache`), `exportLogbookPdf` a `drawLogbook`.
Na telefonu se detail otevírá přes `syncHistory` (`sub: 'book'`), Zpět ho zavře.

Známá omezení: fotka smazaná v aplikaci zmizí ze serveru hned, takže starší verze dat
z historie ji už neukáže (prázdné pole `.ph.missing`); vrátí ji jen záloha. Fotky, na které
neodkazuje žádný stav (nahrané, ale neuložené), na serveru zůstanou; úklid zatím není.

## Servis (verze 2.21 až 2.22.2)

Data `S.service` (`blankService`, čištění `cleanService` v `core.js`):

- `devices[≤ 3000]`: `{id 'dv…', kind, brand, model, made, iid, sn, iidBad, snBad, mark, note, at, by}`;
  `made` = rok výroby (2.22, text do 10 znaků);
  `iidBad`/`snBad` = číslo je nečitelné (text se pak neukládá), `mark` = dodatečné označení
  na spodní stěně horního krytu u řídicí jednotky (povinné, když jsou nečitelná obě čísla);
- `shipments[≤ 2000]`: `{id 'sv…', no, year, date, to, note, by, at, items[≤ 60], sign?}`, číslo
  protokolu `svNo` = `rok/NNN` (`svNextNo` po letech); `sign` (2.26) = `{file, name, at, by}`,
  digitální podpis předávajícího, obrázek je šifrovaný soubor (`Vault`);
- `templates[≤ 300]` (2.22): vzory `{id 'tp…', kind, brand, model}`, prázdné a duplicitní
  (`svTplKey`: druh|značka|model malými písmeny) čištění zahodí;
- položka: snímek údajů v době odeslání `{dev, kind, brand, model, made, iid, sn, iidBad, snBad, mark,
  purpose 'repair'|'scrap', faults[] (SV_FAULTS: start, rpm, heat, vibr, damage), fault (jiná),
  back (datum vrácení, ne dřív než odeslání), backNote}`. Protokol se zpětně nemění, evidence ano.

Výpočty: `svKey` (bez mezer, pomlček, teček a lomítek, velkými), `svFindDevice` (čitelné ID,
pak výrobní číslo, pak označení), `svSaveShipment` (položky bez odkazu najdou nebo založí
zařízení, evidence se doplní o novější údaje, jinak zapsané stejné číslo ji nepřepíše),
`svHistory(svc, id, dnes)` → `{list, count, first, last, out, outDays, retired, avgDays,
totalDays, avgGap, year}` (k vyřazení = `retired`, na servisu se nepočítá), `svItemProblem`,
`svFaultText`, `svDevName`, `svDevIdent`, `svAddTemplate(svc, x)` → `{t, existed}` nebo `null`
(prázdný vzor), `svChanges` (klíče `svs:` protokol, `svb:` vrácení, `svd:` zařízení, `svt:` vzor).

Duplicity (2.22.1, pravidla 2.22.2): `svIdKeys` → `{i, s, m}` (čitelné ID, čitelné v. č., označení
přes `svKey`), `svDupKeys` (totéž jako `i:…`, `s:…`, `m:…`), **`svSameK`/`svSameKey`: dvě čitelná
různá ID = dvě zařízení**, jinak stačí stejné ID, v. č. nebo označení. `svFinder(svc)` (index
`svDevIndex`, podle v. č. a označení jen zařízení bez jiného ID; `svFindDevice` ho volá),
`svOwners(svc, items)` (zařízení k položkám, odkaz `dev` a oprava spojených zařízení ze starší
verze), `svDupCheck(svc, items)` → `{groups: [{idx, why}], match: [[{j, why}]], clash: [{i, dev,
what}], own}` (dvojice podle `svSameK` nebo stejného zařízení `d:`; skupiny = souvislé části přes
`svComponents`; clash = číslo zařízení, které je podle pravidla stejné jako položka, ale není její),
`svDupOrder(n, groups, clash)` (pořadí indexů: duplicity nahoru), `svDevDups(svc)` →
`{groups: [{ids, why}], match: Map id → [{id, why}]}` (porovnává jen zařízení se společným klíčem).
`svSaveShipment` u upravovaného protokolu zapisuje do evidence jen změněná pole.

UI v `app.js` (sekce „SERVIS“): `renderService` (záložky Odeslání a Zařízení, dlaždice),
`svShipHtml` (karta protokolu, Vráceno / Vráceno vše `svBackDialog`), `svDevTable` (hledání
`#svQ` překresluje jen tabulku), `svDeviceDialog` (historie a úprava evidence, smazat jde jen
zařízení bez odeslání), editor `svEditorHtml`/`svItemHtml` nad `ui.sv.draft` (pole se při psaní
jen zapisují; překresluje se po kliknutí a zaškrtnutí nečitelné, výběr z evidence datalistem
`svDevList`, v hlavičce položky „Podle vzoru…“ `[data-svtpl]` a „Uložit jako vzor“
`[data-svtplsave]`), `svTemplatesHtml` (vzory v záložce Zařízení, `[data-svtpldel]`),
`svHint` (nápověda z evidence, obnovuje se při psaní) a `svHints(only)` (nápovědy a duplicity
všech položek, `.sv-item.dup`), `svSaveDraft` (kontroly: datum, identifikace, duplicity, které
přesune nahoru pod sebe), PDF `drawServiceProtocol` (A4 na výšku)
a `exportServicePdf` (`servis-protokol-2026-001.pdf`).

## Shortage (verze 2.27, sloupce a Ctrl+V 2.27.1, úpravy položek 2.28, poddíly 2.29, Skrýt v PDF 2.29.1, ruční TOP, plná sestava a filtr operací 2.31, TOP 2 a oddělení 2.32, PDF po odděleních 2.34, doplnit chybějící 2.36)

Sloupce (2.27.1): A číslo objednávky, B název dílu, C EAN s vloženým odkazem, D index,
E urgentní množství, F se nečte, G „TOP“ (`/^top\b/i`), H probíhající operace.

Data `S.shortage` (`blankShortage`, čištění `cleanShortage` v `core.js`):

- `lists[≤ 30]`, nejnovější první: `{id 'sh…', at, by, file, sheet, items[≤ 1000]}`; `sheet` je
  název listu jen u sešitu s více listy, vložený seznam má `file` „vloženo ze schránky“;
- seznam má navíc `plan` (2.29): `{file, at, by}` posledního prohledaného výrobního plánu, nebo null;
- `S.shortage.depts` (2.32): oddělení s přiřazenými operacemi, viz „Kde jsme skončili“ 2.32;
- položka `{id, order, name, ean, index, qty, top, top2, op, link, code, note, rec, subs, cands, pdfHide, full, dept}` (`id`, `note`, `rec` od 2.28, `subs` od 2.29, `cands` a `pdfHide` od 2.29.1, `full` od 2.31 = sestava zobrazená plně; `top` jde od 2.31 přepnout ručně; `top2` a `dept` od 2.32, `shSetTier`): texty tak, jak je ukazuje Excel
  (EAN s nulami na začátku, množství s formátem); `top` jen `true`/`false`; `link` projde
  `shLink` (jen `http(s)://`, `www.` doplní `https://`, bez mezer a `<>"`, nejvýš 2000 znaků),
  jinak `""`, slouží jen ke klikání v aplikaci; `code` = activeBarcode z odkazu (`shCode`: text
  za `activeBarcode=` do `&` nebo `#`, dekóduje `%XX`, `shCodeClean`: tisknutelné ASCII bez
  mezer, nejvýš 120 znaků). Položka bez EANu i názvu se zahodí, TOP jsou vždy první
  (`shTopFirst`, jinak pořadí ze souboru nebo ruční). Seznam ze 2.27 nemá `code`, čištění ho
  dopočítá z `link`; seznamu ze 2.27.1 dá `id`, prázdnou `note` a `rec: null`.
- `rec` = poslední záznam `{ts, when, qty, state (do 400 znaků), at, by}`: vloží se přes Ctrl+V (A QR kód,
  B datum a čas, C počet ks, D stav). `shRecBuild(rows)` → `{recs: Map kód → záznam, rows, bad}`
  (nadpisy přeskočí, na kód nejnovější), `shApplyRecs(list, recs, meta)` → `{matched, updated,
  same, older, added, wpa, missing}` (stejný kód u více položek dostanou všechny, starší nepřepíše
  novější; kód z `cands` přidá poddíl, kromě stavu „Odesláno na WPA“). `shParseWhen`: `22.10.2026 9:15`, `22. 10. 26`, ISO, pořadové číslo dne Excelu.
- `shMoveItem(list, id, to)`: přesun ve skupině (TOP / ostatní).
- `subs[≤ 50]` (2.29): poddíly z 2. listu výrobního plánu `{id 'sp…', ean, link, code, op, note, rec,
  byRec, pdfHide}` (`byRec`: přidal ho poslední záznam, 2.29.1), id jsou jedinečná v celém seznamu
  (položky i poddíly). Viz „Kde jsme skončili“ 2.29.
- `cands[≤ 100]` (2.29.1): poddíly z plánu s jinou operací `{ean, link, code, op}`, čekají na
  poslední záznam. `pdfHide` (2.29.1): položka nebo poddíl se nevytiskne (`shPdfItems`).

Import (`shImportFile` v `app.js`): SheetJS, každý list přes `shSheetRows` (sloupce A–H, nejvýš
20 000 řádků, `shCellText`: číselný EAN s formátem nul se vezme jako formátovaný text; `shCellLink`:
`cell.l.Target` přes `shUnxml`, jinak vzorec `HYPERLINK("…")`) a `shBuild(rows)` → `{items, more,
header, top, warn{noLink, noCode, noEan, skipped}}` (nadpisy `shIsHeader`: aspoň dva nadpisy
z A–E v prvních 15 řádcích; odkaz z C, jinak z jiné buňky řádku). Vezme se list s nejvíc
položkami. CSV se odmítne (nemá odkazy). Společné uložení a zpráva `shAddList(r, src)`.

Vložení (Ctrl+V): `shPaste` rozhodne podle `shLooksLikeRecs`, jestli jde o poslední záznamy
(`shPasteRecs`, k otevřenému seznamu; když nic nesedí, napíše, ke kterému seznamu kódy patří),
nebo o nový seznam. Posluchač `paste` na dokumentu (jen pohled Shortage, ne v polích ani
dialozích; pole `#shPaste` je cíl, vstup se maže). `shClipRows(html, text)` → `{plain, rows}`:
HTML ze schránky bez `<style>`, `<script>` a atributů `style` přes DOMParser, buňky
`table.rows`/`cells` (`<br>` = mezera, `colspan` doplní prázdné buňky, odkaz z `a[href]`),
výřez bez `<table>` se obalí; bez HTML `shTsv` (core, buňky v uvozovkách). `shPaste`.

UI (sekce „SHORTAGE“): `renderShortage` (dlaždice Seznam, Položek, TOP shortage, S QR kódem,
Poslední záznam; řádek `tr[data-shid]` s úchytem, poznámkou `[data-shnote]` (uloží se při
`change`) a odebráním `[data-shdelitem]` s potvrzením; přesouvání `shDragDown/Move/Mark/End`
a `shGripKey`;
karta seznamu s hledáním `#shQ` přes `shFilter` i podle operace a kódu, `[data-shpdf]`,
`[data-shdel]` s potvrzením, přepínání seznamů `[data-shopen]`, stav `ui.sh`), tabulka
`table.stack.sh-tab` (řádek `tr.sh-top`, štítek `.sh-toptag`, kód `.sh-code`, EAN je odkaz
`target=_blank rel=noopener noreferrer`). Historie změn `shChanges` (klíče `shl:` nahrání, `shd:`
smazání, aby se nesloučily; text „z toho N TOP“; 2.29.1 `sha:` poddíl podle záznamu, `shh:` Skrýt
v PDF). Sestava s poddíly má místo QR „sestava“ a bez pole poznámky, poddíl `byRec` štítek
„podle záznamu“, řádek skrytý v PDF `tr.sh-pdfoff`, tlačítko `shHideBtn` `[data-shpdfhide]`.

PDF `drawShortage(doc, l)` (A4 na šířku, `withPdf(…, 'landscape')`, od 2.28 černobílé `SH_MONO`):
sloupce `SH_PDF_COLS` (Operace · poslední záznam, dopsaná poznámka nahoře v Poznámkách), řádek
nejméně 20 mm, vyšší podle obsahu (`lay`, 2.28.1), QR 14 mm s kódem písmem pod ním (`pdfQr`: znaky mimo ASCII jako `%XX`, úroveň M, jinak L,
okraj 2 moduly), TOP řádek světle šedý s černým pruhem a štítkem, hlavička tabulky na každé
stránce (`k.onPage`), čárkované linky na psaní ve Stav k 10:00, Stav k 13:00 a Poznámkách.
Sestava s viditelnými poddíly je nízký šedý řádek (`asm`) bez QR, záznamu a linek (2.29.1).
Položky jdou přes `shPdfItems(l)` (bez skrytých, číslování bez mezer; všechno skryté → hláška).
Soubor `shortage-YYYY-MM-DD-HHMM.pdf` (`exportShortagePdf`). Po odděleních (2.34, `split`):
každé oddělení od nové strany s vlastním záhlavím, čísly položek od 1 a stranami v zápatí
za oddělení, soubor `…-po-oddelenich.pdf`.

## Audit (verze 2.17, 2.18, kapacity a zaškolení 2.30, stránky podle vzoru 2.31, hranice zaškolení 2.33, docházka a výkony 2.37)

Data `S.workAudit` (`blankWorkAudit`, čištění `cleanWorkAudit`):

- `groups[≤ 20]`: `{id, name, am, pm, unprod, noIs}`, `am`/`pm` = písmeno sloupce obsazenosti
  (prázdné = skupina na směně není). Výchozí `WA_GROUPS` podle zadání (kontrola/balení
  `unprod`, Daiho `noIs`);
- `cols`: `att {date, amPlan, amTotal, amAbs, pmPlan, pmTotal}`, `work {date, op, ks}`
  (výchozí `WA_COLS`: D, I, T, R, U, V a A, H, J);
- `days[iso] = {am: {plan, total, abs}, pm: {plan, total}, g: {skupina: [ranní, odpolední]}}`;
- `ops[≤ 800] = {id: 'oN', name, group, on}`, `pcs[iso] = {opId: kusy}`, `seq`;
- `edits[iso][klíč] = {v, was, note, by, at}`, klíče `am.plan|total|abs`, `pm.plan|total`,
  `g.<skupina>.am|pm`, `pcs.<opId>` (`WA_KEY`); `notes[iso]`; `files[≤ 40]` (zdroje);
- `target` (2.18): pevný požadavek lidí na pracovní den, výchozí `WA_TARGET` = 100 (2.18.1),
  `null` = podle souboru (plán den po dni);
- `plan` (2.18, `blankWaPlan`, `cleanWaPlan`):
  - `tpl {file, at, by, sheets[≤ 2]: {name, header, cols, heads}}`: vzor, `header` = index řádku
    s nadpisy, `cols` písmena polí `WA_PLAN_FIELDS` (order, ean, ks, index, due, tech), `heads`
    texty nadpisů (podle nich `waPlanCols` najde posunuté sloupce);
  - `tech {words: ['G2', 'G'], mode: 'token'|'contains'}`, `cap {group: 'brus', perShift: 25}`;
  - `chunks[≤ 60]`: id šifrovaných souborů (`Vault.saveFile`) s položkami: JSON po sloupcích
    `{v: 1, k, d, q}` (klíč, den od 1970, kusy), gzip (`CompressionStream`), díl ≤ 1,2 MB;
  - `weeks {T: {ks, n}}`, `items`, `files[≤ 40]` (statistika nahrání), `at`, `by`.

Výpočty v `core.js`:

- **kusy se počítají jen u operací se skupinou** (`on && group`, od 2.17.1);
- čtení: `waParseAttendance` (všechny listy, řádek s datem = den, bez čísel se přeskočí,
  `cellToDateTime` zná text, Date i sériové číslo), `waParseWork` (součet po dnech
  a operacích);
- uložení: `waApplyAttendance` a `waApplyWork`. Dny ze souboru nahradí uložené, úpravy
  zůstanou (`was` je hodnota v době úpravy, UI ukáže „teď X“). Nové operace dostanou
  `on: true` a **žádnou skupinu**; `waGuessGroup` (`WA_GUESS`) je jen návrh v Nastavení;
- `waVal` (úprava má přednost), `waDay` (den: lidé, plán, obsazenost, kusy po operacích
  a skupinách, produktivní lidé a kusy, `check` = součet skupin − celkem);
- `waDays` (dny s daty + všechny pracovní dny + svátek ve všední den; víkend bez dat ne),
  `waTotals` (`avgPeople`, `avgPlan` = průměr pracovních dnů s obsazeností), `waWeeks`,
  `waMonths`, `waOpTotals`, `waIssues`, `waHistRange`, `waFacts` a `waSheets` (Excel:
  Souhrn, Týdny, Měsíce);
- osobosměna = člověk na směně; kusy na osobosměnu jen u skupin bez `unprod` a `noIs`;
- `waSetEdit` (hodnota rovná souboru nebo `undefined` = úprava pryč), `waEditList`;
- požadavek a výpadky (2.18): `waReq`, `waTotals` (`reqDays`, `metDays`, `balance`),
  `waStaffing` (bilance, výpadky, návrh dorovnání);
- výrobní plán (2.18): `waPlanGuess` a `waPlanHeaderRow` (vzor), `waPlanCols`, `waPlanMatch`
  (G2/G jako samostatné označení), `waPlanMerge` (klíč objednávka|index|EAN přes `waPlanPart`,
  platí pozdější termín, stejný termín přepíše kusy; statistika řádků), `waPlanEncode` a
  `waPlanDecode`, `waPlanWeeks`, `waPlanCapacity` (skutečná kapacita ze směn skupiny, dny bez
  obsazenosti odhadem z posledních 20 pracovních dnů, skluz se nepřenáší pod nulu),
  `waPlanFileIds` (záloha);
- `waChanges` → historie, klíče sloučení `wag/wan/wau/wai/wac/wao/waon/wacols/wae/wanote`
  a od 2.18 `watarget/waptech/wapgrp/wapper/waptpl`.
  Změna a návrat zpět do 10 minut se v historii vyruší. Nahrání a mazání období jdou přes
  `store.note` (jeden záznam).

UI v `app.js` (sekce „AUDIT“): `ui.wa` (záložka, přehled `hist` v týdnech, `planRange`, období Dnů
`month|week|custom`, rozpad po skupinách, filtr operací), `waHistHtml` (přehled), `waRange`
(Dny, Úpravy), `renderWorkAudit`, `waChart` a `waLine` (tooltip `#waTip`, popsaná jen poslední
hodnota), `waCheckHtml`, `waDayDialog` (povinný důvod jen u nové hodnoty), `waImport` (po
nových operacích otevře Nastavení s filtrem bez skupiny), `bindWorkAudit`, `exportWaXlsx`,
`exportWaPdf`, `pdfWaChart`, `pdfWaBalance` a `drawWorkAudit` (A4 na šířku, jen fakta a grafy).
Tooltip hledá `.chart-tip` v nejbližším `.wa-charts` (přehled, bilance, plán).

Kapacity a zaškolení (2.30, záložka `kapacity`): nepotřebuje data Auditu (bere jen `wa.target`
a obsazenost jako požadavek a kontrolu), počítá `capTimeline` z Matice, Docházky a `e.hist`.
Hranici zaškolení bere z `wa.trainPct` (2.33), bez ní z Matice (`waTrain`).
Viz „Kde jsme skončili“ 2.30. Lidé na směně = jen lidé ze skupin Matice; skupiny Auditu
(`wa.groups`) se s nimi nepárují.

Výrobní plán v UI (sekce „VÝROBNÍ PLÁN“): soubory čte `waPlanOpen` (od 2.18.2 vlastní čtení
xlsx po kouscích, jen vybrané sloupce; záloha SheetJS `dense`, kde je list ve 0.18 pole řádků
a ve 0.19 `ws['!data']`). Soubory jdou do fronty (`waPlanQueueAdd`), zpracování (`waPlanProcess`)
načte uložené díly, sloučí frontu, ukáže souhrn, uloží nové díly, stav přes `store.note`,
a **staré díly smaže až po uložení stavu** (`waWaitSaved`). Chybějící díl (404, třeba po
obnovení starší verze dat) se v souhrnu ohlásí a zpracování pokračuje bez něj.

Docházka a výkony z jednoho souboru (2.37), `S.workAudit.dv`:

- `cols{att{id, first}, work{id, part, op, order, done, time, date}}` (písmena, `date` prázdné =
  najde se samo), `unit` `auto` | `min` | `h`;
- `pres{iso: {id: [příchod, odchod]}}` v minutách od půlnoci, `null` = chybí; odchod menší než
  příchod = přes půlnoc (`dvStay`). ID = `widKey` (malá písmena, bez úvodních nul), páruje se
  s `e.wid` přes `dvWidMap`; neznámé ID zůstane a přiřadí se, až ho člověk dostane;
- `perf{YYYY-MM: {id: {p{díl: [hotovo, zakázka, minuty, řádků]}, o{operace: [hotovo, minuty,
  řádků]}}}}`: výkony po měsících (ne po dnech). Nové nahrání nahradí celý měsíc; řádky bez data
  jdou do měsíce konce docházky;
- `files[]` (posledních 40). Limity `DV_MAX_*`, čištění `cleanDv`, historie jen sloupce a jednotka
  (`waChanges`, m `wadvcols`), nahrání píše `store.note` s `keep`.
- Projekt = skupina Matice (`dvGroupOf`): dnes podle zařazení, minulé dny podle `levelAt`;
  vedoucí, bez skupiny a neznámé ID jsou zvláštní „projekty“ na konci (`dvSpecial` v UI).

## Plán kapacit (verze 2.38)

Data `S.capPlan = {groups: {idSkupiny: {n, l2, l3, l4}}, note, by, at}` (`blankCapPlan`,
`cleanCapPlan(o, idSkupin)`: jen existující skupiny Matice, počty 0–500, l4 ≤ l3 ≤ l2 ≤ n,
nulová potřeba se neukládá). Úpravy přes `setCapNeed(id, patch)`: změna vyšší úrovně zvedne
nižší, změna nižší sníží vyšší. Historie `cpChanges` (kind `capplan`, m `cp:<skupina>`,
`cpnote`).

Výpočet `capPlanGroup(p, pres)`: členové = lidé se skupinou, ne vyřazení, ne vedoucí (nemocní
se počítají, zvlášť počet). `have.lK` = počet s úrovní ≥ K. `hire` = potřeba − členové.
Pro K: `gap` = potřeba − máme, `train` = min(gap, členové pod K), `hireLv` = zbytek (musí přijít
s úrovní). Kandidáti: shora od K = 4 nejvyšší procenta pod K; kdo se školí na 4 a je pod 3,
pokryje i mezeru na 3. `capPlanAll()` = oddělení v pořadí skupin, součty jen ze skupin
s plánem, `cpPresence` = Ø lidí skupiny v práci za posledních 20 pracovních dní s docházkou
(`dvGroupOf`). UI v `app.js` (sekce „PLÁN KAPACIT“): `renderCapPlan`, `bindCapPlan`, PDF
`exportCapPlanPdf` (od 2.39.2 `cpPdfPage` + `cpChart` přes `pdfCtrPage`, A4 na výšku), Excel
`exportCapPlanXlsx`; lidé jen s ID (`cpWho`, 2.39.1).

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

## Pravidla spolupráce

- Komunikace **česky**, věcně. UI texty a komentáře v kódu jsou česky.
- Uživatel nasazuje sám podle přesných příkazů. Na konci práce vždy napiš:
  - co se změnilo a výsledek testů;
  - přesný příkaz pro server, včetně větve, pokud změny nejsou v `main`:
    `cd /root/odmeny_v2 && git pull origin <větev> && sudo bash /root/odmeny_v2/deploy/install.sh`;
  - že je potřeba Ctrl+Shift+R.
- **Nikdy se nepřipojuj na server uživatele.** Do repa nedávej IP ani adresu serveru, ani
  žádná data. **Repozitář je veřejný.**
- Aplikace běží jen za HTTPS (Apache). Data musí zůstat šifrovaná a přístupná jen po přihlášení.
- Opatrně, ať nic nerozbiješ. **Nepushuj neotestovaný kód** a v prohlížeči ověř i vzhled
  (screenshot). **Při aktualizaci se nesmí ztratit data.**
- **Ostrou verzi `/odmeny/` neměň.** Je v repozitáři `odmeny` a sahá se na ni jen na
  výslovný pokyn uživatele.
- Do commitů, PR, kódu ani dokumentace nepiš identifikátor modelu. Patičku commitu
  (Co-Authored-By, Claude-Session) ber z pokynů aktuální session.
- Commit message česky: `Odměny: co se změnilo`, v těle proč a odrážky.
- PR otevírej jen na výslovné přání uživatele.

## Ostrá verze a verze 2

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
| 2.42.2 | větev `claude/elegant-clarke-vl5n7d` | **aktuální**: ✦ Nastavit sloupce souboru Docházka a výkony přes AI (jen nadpisy a typy buněk) |

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

## Pojmy

- **Skupina** (od 2.4, v datech pořád `positions[]`): dovednosti `skillset[]` hodnocené 0–4,
  `maxTab` = tabáky, když jsou všechny dovednosti na 4. Každá úroveň je 25 %, procento skupiny
  je průměr dovedností, tabáky = `round(maxTab × procento)`. Varianty prémie `tiers[]` (do 2.10 „stupně“).
- **Úrovně 1–4** (Nováček, Pokročilý, Samostatný, Profík) jsou tvar do verze 2.3: pozice bez
  `skillset` se počítá postaru (`levelOf` větev `legacy`), dnes jen pro porovnání s původní
  aplikací v testech. `sanitizeState` každou takovou pozici převede na skupinu.
- **Směna**: `R` stálá ranní, `S1` a `S2` směnnost skupina 1 a 2 (`SHIFTS`).
- **Fond** = pracovní dny × směna (výchozí 7,5 h). Kdo má „zkrácený pátek“, má v pátek
  `friShift` (6,5 h).
- **Absence** = celý pracovní den bez hodin a bez omluveného kódu (výchozí omluvené kódy
  jsou `D,DOV,N,NEM,PN,L,P,OČR,ŠK,S,V,NV`; porovnávají se bez diakritiky).
- **Víkendová směna** vyplní jeden den absence. Zbytek absence → **srážka** podle pravidel
  pozice (`penalty [{at,t}]`). Bez absence → zbylé víkendy dají **bonus** (`bonus`).
- **Sankce**: důvod ze seznamu + 5–50 % (po 5 %) z nároku. Procenta se sčítají, každá sankce
  stojí aspoň 1 tabák, 100 % a víc = vše. Starší záznamy mají pevné `points`. **Srážka ze
  mzdy** (`wage`) se do nároku nepočítá, jen připomene zpracování ve mzdách.
- **Ruční úprava** (`adjust`) platí jen pro jeden měsíc. Může jít nad strop pozice nejvýš
  o `adjOver`.
- **Výdej** (`issued`): potvrzení, že byl benefit vydán. Ukládá snímek (tabáky, Kafe, pozice,
  úroveň); když se výsledek pak změní, UI to ukáže.
- **Zaučení**: hodnocení dovedností jiných skupin (`rate`) je jen pro matici a kapacitu,
  tabáky nemění. Staré `skills{posId: 1–4}` zůstává uložené (převedlo se do `rate`).
- **Vyřazený** (`excluded`) zůstává v evidenci, ale nehodnotí se.

## Architektura: server nevidí data

**Server** (`lib/odmeny.php`, `api.php`), PHP + SQLite `odmeny.sqlite3`.

- Výjimka (2.5): text, který vedoucí sám pošle tlačítkem ✦ k přeformulování, server vidí
  a předá Anthropicu (`lib/ai.php`). Nic jiného nešifrovaně neprochází.
- Tabulky: `cards`, `devices`, `sessions`, `attempts`, `versions`, `prefs`, `ai_calls` (jen
  kartička, délka textu a čas volání), `files` (2.16: šifrované fotky Protokolů, id 32 hex,
  nejvýš 1,5 MB na fotku, 2000 fotek a 300 MB base64 celkem, jinak 507).
- Hlídá jen přístup:
  - otisk kartičky (uložený jen jako sha256);
  - relace: 12 h, po 60 min nečinnosti končí;
  - PIN zařízení (5 pokusů);
  - omezení pokusů podle IP;
  - HTTPS (bez něj jen z loopbacku s Host localhost);
  - CSP a CSRF (`X-Odmeny: 1` + Sec-Fetch-Site/Origin).
- Každé uložení je nová verze. Drží se posledních 30, k tomu hodinové snímky za 7 dní
  a denní; celkem nejvýš 150.
- Uložení kontroluje `base_rev`:
  - **409**: jiné zařízení mezitím uložilo;
  - **426**: stará verze klienta.

**Klient.**

- `index.php` je jen zámek (`static/lock.js`, `static/vault.js`, QR knihovna).
- Po odemčení `lock.js` stáhne `app.php?f=app.html|app.css|core.js|app.js`. Bez relace dostane
  401, takže zamčená stránka nic z aplikace neprozradí.
- Líně se načítají `xlsx.js`, `jspdf.js` a `pdf-regular/semibold.ttf`.

**Kryptografie** (`static/vault.js`).

- **Přístupový klíč z QR kartičky** (text `ODMENY:…`; 152 bitů + kontrolní bajt, base32):
  - HKDF z něj odvodí `auth` (server zná jen jeho hash);
  - a `kek`, který rozbalí **DEK**.
- **DEK** (AES-GCM 256) šifruje celý stav. Stav se gzipuje, formát je
  `[1][příznaky][IV][šifra]` v base64 s AAD `odmeny/data/v1`.
- **Osobní nastavení** šifruje stejný DEK s AAD `odmeny/prefs/v1|card:<id>`.
- **Zařízení s PINem**: DEK je zabalený klíčem z (tajemství v localStorage + `server_share`
  + PIN). Server vydá share až po ověření PIN.
- **Fotky** (2.16) šifruje stejný DEK s AAD `odmeny/file/v1|<id>`, formát `[1][IV][šifra]`
  v base64. Id vymýšlí klient (16 náhodných bajtů), stejné id podruhé server nepřepíše.
- **Záloha `.odmeny`** obsahuje data a DEK zabalený každou kartičkou, od 2.16 i `files{id: blob}`.
- **Kdo ztratí všechny kartičky a nemá zapamatované zařízení, k datům se nedostane.**

**Ukládání** (`private/app.js`).

1. `onStateChange` čeká 1,2 s. Hned uloží, když je nastavené `store.note` (hromadná změna)
   nebo když změny čekají přes 6 s.
2. `flushSave` pak:
   1. vezme `sharedState(S)`;
   2. zavolá `describeChanges(store.base, shared)`, výsledek přidá do logu a historie
      zařazení (`applyHist`);
   3. uloží přes `Vault.saveData(shared, store.rev)`.
3. Konflikt (409) otevře dialog Přepsat, nebo Načíst. Při přepsání se sloučí log z obou stran.

**Verze tvaru dat.** Tyhle tři konstanty se mění **vždy spolu** a teď jsou `37` (od 2.42):

- `DATA_VERSION` v `private/core.js`;
- `CLIENT_VERSION` v `static/vault.js`;
- `ODM_MIN_CLIENT` v `lib/odmeny.php`.

Když přibude pole do sdílených dat, zvyš všechny tři o 1 a zvedni `ODM_VERSION` (`'2.1'`).
Stránka otevřená ve staré verzi pak dostane 426 a nová pole nesmaže.

## Datový model

Stav `S` definují `blank()` a `sanitizeState()` v `private/core.js`.

- `positions[]` (skupiny): `{id, name, dept, max, onlyKafe, levels[4], skillset[], maxTab, tiers[], penalty[], bonus[], plan{v, unit ks|h}}` (`plan` od 2.9, jen když je zapnutá plánovaná kapacita)
  - `max: null` = bez stropu (maximum + nejvyšší bonus, `posMaxAuto`);
  - `skillset[]`: `{id, name, desc, scale, opt?}`; `scale` je 5 úrovní `{name, desc}`, `null` = `STD_SCALE`;
    `opt: true` (2.25) = není nutností, v procentu skupiny váha ¼;
  - `normCut` (2.12): `{from, rows[{max, pct}]}`, srážky ze mzdy za neproduktivitu (jen když jsou zapnuté);
  - `tiers[]` (varianty prémie): `{id, name, minSkill 0–4, skills[{id, lvl}], raise %, reward, maxAbs, minWknd, minAtt, minNorm, minUse, maxKt, moral, manual[{id, text}], streak{months, label}|null}` (`skills`, `maxKt`, `moral` od 2.11);
    prázdná podmínka = `null` = nehlídá se;
  - `levels[4]` (`{name, tabaky, desc, raise, minAtt, minNorm, minUse}`) je tvar z verze 2.3,
    zůstává uložený kvůli převodu a starým datům.
- `employees{key}`:
  - klíč je `norm(příjmení)|norm(jméno)`;
  - hodnota: `{key, first, last, positionId, level, note, shortFri, excluded, lead[], wid, skills{posId: 1–4}, rate{skillId: 1–4}, shift, legacy, hist[{at, pos, lvl, pct}]}`;
  - `rate`: hodnocení dovedností (0 se neukládá); `shift`: `R|O|S1|S2` (O = stálá odpolední, 2.8);
  - `sick` (2.9): datum, od kdy je nemocný; dočasně mimo kapacity;
  - `lead` (2.7): vedoucí pracovník, pole oddělení, která má na starosti (může být prázdné);
    kdo ho má, nehodnotí se a v matici je jen jako vedoucí v hlavičce oddělení; dovednosti
    vedoucích (2.10) má v `rate` pod id z `leadSkills`;
  - `legacy`: snímek zařazení z 2.3 `{at, pos, dept, level, levelName, levelDesc, tabaky, onlyKafe, raise, skills[{pos, level, levelName}]}`,
    dokud ho vedoucí nesmaže; `hist.pct` = procento dovedností (na 0,1).
- `normCutDone{YYYY-MM: {klíč: {pct, norm, at, by}}}` (2.12): zpracované srážky za neproduktivitu (snímek).
- `leadSkills[]` (2.10): dovednosti vedoucích `{id, name, desc}`, jeden seznam pro všechny,
  hodnotí se `STD_SCALE` (0–4).
- `periods{YYYY-MM}`: docházka, `{days[iso], rows{key: {first, last, h[], c[]}}, codes, file, at, headerRow}`.
- `production{YYYY-MM}`: evidence práce.
  - `{names{normJméno: {name, total, count, days{iso: ks}, spent, norm, nspent}}, records, total, time, file, at}`.
  - Minuty: `spent` = strávený čas; `norm` = norma; `nspent` = čas jen u řádků s normou.
- `prodMap{normJméno: key}`: ruční spárování.
- Další klíče:
  - `adjust{period: {key: ±n}}`;
  - `sanctions[]` (`{id, key, period, name, pct, note, at, wage?, done?{at, by}}`), `sanReasons[]`;
  - `kafe{period: práh v hodinách}`;
  - `issued{period: {key: {at, tabaky, kafe, pos, lvl, pct, tier, raise}}}` (snímek při výdeji);
  - `marks{period: {key: {bodId: důvod}}}`: body prémie, které vedoucí označil jako nesplněné;
  - `capReport{groups[], thr, hidden[], note, s1am, detail?}`: report Směny a kapacita (`detail` 2.25: `all` | `none`, výchozí se neukládá);
  - `log[]` (nejvýš 2000 záznamů; kinds `person|level|sanction|adjust|issue|import|position|settings|data|eff|audit|logbook|workaudit|service|shortage|capplan`);
  - `logbooks[]` (2.16): Protokoly (viz níže);
  - `service` (2.21, 2.22): Servis, evidence zařízení, odeslání a vzory (viz níže);
  - `shortage` (2.27): Shortage, nahrané seznamy chybějících dílů (viz níže);
  - `workAudit.dv` (2.37): docházka a výkony z jednoho souboru (viz Audit);
  - `workAudit.drep` (2.41): skupiny Reportu docházky a značky dnů (přesčas, práce ve svátek);
  - `capPlan` (2.38): Plán kapacit, potřeba lidí po skupinách (viz níže);
  - `eff`: Top 5 nejméně efektivně (viz níže);
  - `audit`: Kontroly (viz níže);
  - `settings{shift, excused, excusedReducesFund, friShift, absenceCutoff, adjStep, adjOver, prodCols}`;
  - `current`, `demo`, `v`.
- **Osobní nastavení** (`prefs`, pro každou kartičku zvlášť, `cleanPrefs` v `app.js`):
  - `period, sort, pos, onlyImported, onlyOpen, hiddenCols, sanFilter`;
  - `lockMinutes, logSeen, matrixDept` (vybraná skupina v matici), `matrixShift, mxTab`;
  - `profileRange, profileFrom, profileTo, t5PdfShort`, `matrixIds` (2.20), `lideF {g, st}` (filtr Lidí, 2.23).
  - `sharedState()` proto ze sdílených dat vyhazuje `current`, `hiddenCols` a `lockMinutes`.

### Když přidáváš pole (jinak se data ztratí)

1. `sanitizeState()`: **bez toho se pole při načtení tiše zahodí.** Výchozí hodnota musí
   zachovat chování starých dat.
2. Starší tvar převádí `migrate()` nebo `sanitizeState()`. Stará data se nikdy nemažou.
3. `describeChanges()`: záznam do historie změn.
4. Exporty: Excel (`exportRows`, `rosterSheets`, `profileSheets`), PDF (`rulesDoc`),
   `demoData()` (případně `dropDemoRaise`).
5. Zvýšit verze tvaru dat (viz výše).
6. Testy:
   - `test_core.js`;
   - `test_odmeny.py`;
   - e2e průchod novinek;
   - **test aktualizace z předchozí verze**.
7. `README.md` (Co je nového).

## Výpočty (`private/core.js`)

- `attendance(p, key)` vrací `workDays/Hours`, `cappedHours` (nejvýš směna za den), `wkDays`,
  `absDays`, `excused…`, `fund`, `fundRatio`, `totalHours` a `friDiff`.
- `attTabaky(att, pos)`: vyplnění absence víkendy, pak srážka nebo bonus.
  - Pravidlo je nejvyšší splněné `at`.
  - U `onlyKafe` se nepoužije.
- `evaluate(e, p)`: výsledek za člověka a měsíc.
  1. Základ úrovně + docházka.
  2. Strop `posMax`.
  3. `absenceCutoff`: při velké absenci ztráta nároku na všechno.
  4. Sankce (`sanDeduct`).
  5. Ruční úprava.
  6. Kafe = `totalHours ≥ práh − friDiff`; práh je bez ručního nastavení fond.
- `perfOf(att, prod)`, zaokrouhleno na 0,1:
  - docházka % = `cappedHours / fund`;
  - plnění normy % = `norm / nspent`;
  - využití % = `spent / (totalHours × 60)`, jen když evidence obsahuje čas.
- `levelOf(e)`: u skupiny `{pos, n (průměr zaokrouhlený), pct, base = skillTab, min, skills}`;
  `e._pct` přepíše procento (profil počítá minulé měsíce z výdeje nebo z `hist`).
- `tierOf(e, ev, perf, pid, withStreak)`: nejvyšší stupeň, jehož `tierChecks` jsou splněné
  (dovednosti `minRate ≥ minSkill`, docházka nahraná, `absDays ≤ maxAbs`, `wkDays ≥ minWknd`,
  ukazatele, body vedoucího `markOf`, ztráta nároku = nesplněno). `next` = další stupeň,
  `streaks` z `tierStreak` (snímek výdeje, jinak výpočet za měsíc).
- `raiseOf(L, perf)`: jen stará data (pozice s úrovněmi), přes `legacyTier`.
- `capacity(groupIds, thr, hidden)`: počty lidí s úrovní ≥ práh po směnách a varianty
  A (ráno R + S1, odpoledne S2) a B (ráno R + S2, odpoledne S1). `skillGrid` = matice.
- `allRows()` / `activeRows()`: řádky přehledu (`evaluate` + výroba + `perf` + `tier`/`raise`).
- Srážka ze mzdy: `evaluate` počítá nárok jen ze sankcí bez `wage`; `wageFrom(period)` =
  poslední den měsíce − 7, `wagePending(today)`, `setWageDone(id, done, meta)`.

## Importy

- **Docházka** (`buildPeriod`), XLSX nebo CSV.
  - Kódování CSV: UTF-8 i Windows-1250 (`decodeText`).
  - Jméno ve sloupci A, příjmení v B, dny od sloupce F. Hlavička = řádek s nejvíc daty
    (hledá se v prvních 25 řádcích).
  - Buňka = hodiny, kód (`NEM`), nebo obojí (`4NEM`).
- **Evidence práce** (`buildProduction`, `prodColumns`, `prodMapFits`).
  - Bez hlavičky: jméno nebo ID v C, datum v D, kusy v E.
  - S hlavičkou se sloupce odhadnou (`PROD_WORDS`) a ukáže se dialog s náhledem.
    Volba se uloží do `settings.prodCols` i s hlavičkou; soubory se stejnou hlavičkou se pak
    načtou rovnou.
  - Čas může být v minutách, hodinách, jako `h:mm`, nebo v časovém formátu Excelu (zlomky
    dne se poznají samy).
  - Norma je za řádek, nebo za kus.
- **Párování** (`prodKeyFor`): ruční spárování, pak ID (`wid`, `widKey` bez úvodních nul
  a mezer), pak jméno („Jméno Příjmení“ i obráceně). Nespárované se ukážou ve Výrobě.
- **ID zaměstnanců**: `applyWids` (tabulka se jménem a ID; stáhnout předvyplněnou jde přes
  `widSheet`); ID jde zadat i u člověka.
- **Zařazení** (`rosterSheets`, `applyRoster`): export a import Excelu. Záloha JSON z původní
  aplikace se načte přes `importLegacy`.

## UI (`private/app.html`, `private/app.js`, `private/app.css`)

- Pohledy (`data-view`): `prehled`, `lide`, `matice`, `profil`, `sankce`, `dochazka`,
  `vyroba`, `top5`, `kontroly`, `rychla` (2.39), `protokoly`, `servis` (2.21), `shortage` (2.27), `audit`, `nastaveni`
  (`showView('pozice')` otevře Matici, záložku Skupiny a pravidla).
- Nad pohledy: `#demoBanner` a `#wageAlert` (srážky ze mzdy ke zpracování).
- Horní lišta:
  - hodiny = historie změn (`openLog`, odznak nových od posledního otevření);
  - stav ukládání.
- **Přísná CSP**: žádné inline styly ani `on…=` handlery (hlídá to `test_odmeny.py`).
  Šířky se nastavují přes `data-w` a `setWidths`.
- PDF pravidel:
  - `exportRulesPdf` a `drawRules` v `app.js`;
  - obsah dodává `rulesDoc()` v `core.js`;
  - jsPDF + podmnožina IBM Plex Sans (TTF z `private/vendor/`).
- Čtení kódů kamerou: ZXing (`private/vendor/zxing.min.js`, 2.13), přihlašovací QR dál jsQR
  (`static/vendor/jsQR.js`, funguje i bez přihlášení).
- Barevné tokeny pro světlý i tmavý režim jsou v `static/lock.css` (`:root`,
  `prefers-color-scheme`) a `app.css` na ně navazuje přes `var(--…)`.
- Barvy grafů v profilu jsou ověřené validátorem palety (skill dataviz).

## Matice dovedností (verze 2.4)

UI v `app.js`:

- sekce „SKUPINY A PRAVIDLA“: `renderPositions`, `skillDialog` (název, popis, schéma),
  `tierCardHtml`, `TIER_TEMPLATES` (Prémie a Extra bonus podle zadání), `bindGroupEditor`
  (delegované události na `#posEditor`);
- sekce matice: `renderMatrix` (záložky `ui.mxTab`), `renderMatrixGrid` (klik na buňku
  zvýší úroveň o 1, po 4 je 0), `renderCapacity` (v zaškolování zvlášť `capCell`, `planCell`, 2.23;
  plán a skutečnost podle docházky `capHistHtml`, `exportPlanReality`, 2.24),
  `capRisks` (jen v aplikaci), `drawCapacity` (PDF bez rizik a plánované kapacity, 2.23),
  `exportMatrix` (Excel z `matrixSheets`), `drawMatrix`/`exportMatrixPdf` (PDF matice jen
  s ID, 2.20), přepínač `#matrixIds` a `mxWho`;
- u člověka (`renderPersonDetail`): skupina, směna, `legacyCard` + `legacyCompare` (tabáky
  dřív a teď), hodnocení `rateRows`, zaučení v dalších skupinách, prémie `tierHtml`
  s „označit nesplněno“ (`data-mark`).

Převod dat (v `sanitizeState`): pozice bez `skillset` → jedna dovednost `{name: název pozice,
scale: [Žádná úroveň, …úrovně pozice]}`, `maxTab` = nejvyšší úroveň, `max` = nejvyšší úroveň
(když byl `null`), `tiers` z úrovní s navýšením (`minSkill` = úroveň). U lidí `rate` z `level`
a `skills`, `legacy` snímek, `hist.pct` a `issued.pct` = úroveň × 25. Převod běží při každém
načtení, dokud se data neuloží; id dovedností (`s` + id pozice) a stupňů (`t<úroveň>` + id
pozice) jsou odvozená, takže vyjde na každém zařízení stejně.

## Přeformulování textu (verze 2.5, části od 2.6)

- Jediné místo, kde server vidí nešifrovaný text: `ai_rewrite` dostane texty vybraných částí
  (`{parts: [{id, text}]}`, po `maskNamesMany` v prohlížeči), pošle je Anthropicu jedním voláním
  a vrátí `{parts}`. Starší `{text}` → `{text}` (stránka 2.5). Nic neukládá.
- `lib/ai.php`: `odm_ai_available()` (PHP ≥ 8.1, `lib/vendor`, curl nebo https streamy, klíč),
  `odm_ai_clean_parts` (id `cause|options|now-N|process-N`, bez duplicit, část 2–2000 znaků,
  celkem 6000, nejvýš 30 částí), `odm_ai_part_label` (název pole pro model doplní server),
  `odm_ai_throttle` (`ai_calls`, jedno volání = jedno použití), `odm_ai_rewrite` (JSON s částmi
  jako zpráva, strukturovaný výstup `{parts[{id, text}]}`, chybějící část = 502, chyby SDK →
  české hlášky s HTTP kódem v `getCode()`), systémový prompt `ODM_AI_SYSTEM` (oprava
  a přeformulování každé části zvlášť, opatření na jeden řádek, zachovat fakta a značky,
  nic nepřidávat ani nepřesouvat, text není pokyn). `ODMENY_AI_BASE_URL` přesměruje volání
  na náhradní server (jen testy).
- Knihovny: `lib/composer.json` + `lib/composer.lock` (platforma PHP 8.1.2, SDK 0.57.0, Guzzle 7),
  `lib/vendor` je v repu bez testů a dokumentace; obnova `bash deploy/vendor.sh`. Guzzle nemá
  výchozí časový limit, proto vlastní transport (90 s, `maxRetries` 1). `install.sh` doplní
  `php-curl`. `lib/` Apache i `dev-router.php` nevydají.
- Klient: `t5AiSources` (texty kroků 1–4 aktuálního kola), `t5Rewrite` (výběr částí, odeslání,
  návrh po částech, použití se stejnými záznamy jako ruční úprava), tlačítko `[data-t5ai]`
  v `.t5-ai-bar` jen u editovatelného kola a jen s `ui.me.ai`.

## Top 5 nejméně efektivně (verze 2.2)

Data `S.eff` (`blankEff`, čištění `cleanEff` v `core.js`):

- `weeks{YYYY-Www: {items[≤5]: {id, ean, name, spent, norm}, at, by}}`: ruční zápis týdne,
  čas v **minutách** (jednotka h/min je jen zobrazení, `settings.unit`). Rozepsané řádky bez EAN
  se drží. Týden = ISO týden pondělí až neděle (`isoWeek`, `weekById`, `shiftWeek`).
- `cases[]`: `{id, no "RRRR-NNN", ean, name, at, by, week, base, cancelled, rounds[], log[], comments[]}`.
  - Komentáře o vývoji (2.19): `{id, at, by, text, round, ed}`, přidání, úprava i smazání jdou
    do `log` přes `effNote`.
  - Kolo: `{n, reason, week, base, cat, cause, options, actions[{id, kind now|process, text,
    owner, due, done}], v[≤2], d1, d2, p1, p2, p1why, p2why}`.
  - Ověření `v`: `{done, result ok|fail, note, from, to, plan, eff, nspent, norm, src manual|import}`.
  - Termíny (`roundPlan`): 1. ověření = poslední splněné opatření + d1 (14), 2. = provedené
    1. ověření + d2 (30); ruční posun `p1`/`p2` s důvodem. Stav `caseState`: new, act, v1, v2,
    fail, ok, zrus.
  - Jeden díl = jeden případ (`caseOfItem`); návrat dílu = `reopenCase` (nové kolo).
  - `effNote` píše historii případu; `describeChanges` ji zrcadlí do `S.log` (kind `eff`).
- `reports[]`: vydané týdenní reporty jako snímek (`issueWeekReport`, jedna položka na týden,
  `rev` roste jen při změně obsahu).
- `settings{min, target, d1, d2, unit}`; `min` platí jen pro výpočet z evidence práce.
- `nos{RRRR: N}` (2.6): nejvyšší číslo smazaného případu v roce, `nextCaseNo` ho přeskočí.
  Smazat jde jen zrušený případ (`deleteCase`), zmizí i z vydaných reportů.

Výpočty: `weekEntries` (plnění = norma ÷ čas), `weekTop` (ruční zápis má přednost, jinak
`weekRanking` z evidence práce s EAN), `topHistory`, `itemTrend`, `effDeadlines`,
`effSummary`, `weekReportData`. Evidence práce s EAN ukládá `production[m].items{ean:
{name, d{iso: [ks, čas, norma, čas s normou, řádků]}, w{pracovník: {iso: […]}}}}`.

UI a PDF v `app.js` (sekce „Top 5“): `renderTop5`, `t5WeekHtml` (ruční tabulka, `t5EntryChange`,
`t5EntryClick`), `t5CaseHtml`, `t5VerifyHtml` (ruční čas a norma za období), PDF
`drawWeekReport`, `drawEffSummary`, `pdfKit` (měření bloků, „pokračování“, podpisy).

Pozor:

- `form.elements.item` je metoda kolekce, ne pole „item“; používej `namedItem`.
- Překreslení tabulky po `change` se odkládá, dokud je stisknuté tlačítko myši (jinak by
  klik na tlačítko v řádku zmizel).

## Kontroly (verze 2.3)

Data `S.audit` (`blankAudit`, čištění `cleanAudit` v `core.js`):

- `tasks{oddělení: [{id, text}]}`: nutné úkony. Klíč je název oddělení (`deptOf` pozice).
  Po přejmenování oddělení zůstane seznam pod starým názvem; `auditOrphans` ho najde a UI
  nabídne převod na jiné oddělení.
- `plans{YYYY-Www: {at, by, pct, days[], items[]}}`: plán týdne. Položka:
  `{id, key, name, dept, day, state plan|done|skip, done, checker, results[{t, text, ok, note}],
  note, reason, extra, sub, at, by}`. Výsledek drží text bodu z doby kontroly.
- `settings{pct, mode?}` (výchozí 25; `mode: "day"` = los podle příchodů, 2.37, `week` se neukládá).

Podle příchodů (2.37): `generateDayChecks(týden, den)` vezme z každého oddělení
ceil((týdenní počet − už naplánovaní a provedení v týdnu) ÷ zbývající pracovní dny) lidí jen
z `audPresent(den)` (docházka v Auditu), kdo už v týdnu kontrolu má, se nelosuje; znovu
vylosovat nahradí jen nezapsané automatické položky toho dne. V UI `ktPresImport` (jen list
Docházka, `dvImport(file, {attOnly: true})`) po nahrání sám vylosuje, když dnešní los ještě není.

Výpočty: `generatePlan` (z každého oddělení `audCount` = ceil(pct) lidí, přednost má nejdéle
nekontrolovaný podle `audLast`, den podle `audPickDay`: nejméně lidí z oddělení, pak celkem,
shodu rozhodne náhoda; jen pracovní dny bez svátků, v běžícím týdnu od dneška; přegenerování
nechá `done` a `skip`), `recordCheck` (všechny body musí mít odpověď), `skipCheck`,
`substituteCheck`, `addToPlan`, `removeFromPlan`, `undoCheck`, `personChecks`,
`personAuditStats`, `planSummary`, `auditResults`, `auditLate`. `describeChanges` píše
záznamy kind `audit` (u výsledku i `key` člověka).

UI v `app.js` (sekce „KONTROLY“): `renderKontroly` (záložky plán, nutné úkony, výsledky),
`ktCheckForm` (dialog s body), `ktPersonCard` (Lidé i Profil), PDF `drawAuditPlan`
(rozpis a kontrolní listy) a `drawAuditResults`.

## Testy a lokální běh

Kontejner cloudové session má předinstalované PHP 8.4 CLI (sqlite3, mbstring), Node 22
a Playwright s Chromiem. Apache ne; pro testy na Apachi ho nainstaluje `deploy/install.sh`
(jen v kontejneru, **nikdy ne na ostrém serveru**).

```bash
python3 -m unittest discover -s tests   # 29 testů: server, šifrovaný tok, výpočty, kopie dat, oddělení od ostré verze, přeformulování (náhradní API), šifrované fotky
node tests/test_core.js                 # 92 testů: proti původní aplikaci + opravy + 2.1 až 2.42

# lokální server s čistými daty ($S = scratchpad session), z kořene repozitáře
ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t . dev-router.php &
curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state    # vytvoří setup-token.txt
NO_PROXY=127.0.0.1 PW=/opt/node22/lib/node_modules/playwright S=$S node tests/e2e_v21.js
```

- Playwright: `require('/opt/node22/lib/node_modules/playwright')`, Chromium
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Příkaz `playwright install` nespouštěj.
- Průchody v prohlížeči:
  - `e2e_browser.js`: celá aplikace;
  - `e2e_v2.js`: novinky 2.0;
  - `e2e_v21.js`: novinky 2.1;
  - `e2e_top5.js`: Top 5 (2.2, komentáře o vývoji 2.19);
  - `e2e_kontroly.js`: Kontroly (2.3); o víkendu ověří, že plán tohoto týdne nevznikne (v týdnu
    nezbývá pracovní den), jinak odznak nezapsaných kontrol;
  - `e2e_matice.js`: Matice dovedností, kapacita, prémie a srážka ze mzdy (2.4), PDF matice jen s ID (2.20),
    v zaškolování v reportu kapacit, PDF bez rizik a plánované kapacity (2.23);
  - `e2e_ai.js`: ✦ Přeformulovat (2.5), nastavení sloupců přes AI (2.42.2); sám spustí náhradní API na 127.0.0.1:8598, server
    musí běžet s `ODMENY_AI_BASE_URL=http://127.0.0.1:8598`;
  - `e2e_vedouci.js`: vedoucí pracovníci (2.7) a jejich dovednosti (2.10);
  - `e2e_skener.js`: skener kartičky v Sankcích (2.13), falešná kamera Chromia;
  - `e2e_mobil.js`: telefon jako aplikace (2.14, 2.15): HALA 2, hlavní menu, směna, rozbalovací
    menu, hledání, Zpět, okna, filtry, šířka seznamu, manifest;
  - `e2e_lide.js`: Lidé (2.23): filtry s počty, člověk mimo filtr, oddělení a skupina, hledání,
    osobní nastavení, šířka na monitoru 2560 px, hodnocení v jednom řádku, v zaškolování v reportu
    kapacit, plán a skutečnost podle docházky (2.24: týdny, souhrn, Excel), telefon, tmavý režim;
  - `e2e_servis.js`: Servis (2.21, 2.22): protokol se třemi zařízeními, nečitelná čísla, k vyřazení,
    závady, rok výroby, vzory (uložení, duplicita, výběr, smazání), duplicitní zařízení (červeně
    při psaní, nahoru při uložení, číslo jiného zařízení, evidence; jiné ID se stejným v. č.
    při úpravě protokolu duplicita není), PDF přes pypdf, výběr z evidence, párování, vrácení, evidence, úprava, smazání, telefon;
  - `e2e_shortage.js`: Shortage (2.27, 2.27.1): Excel s odkazy (číselný EAN s nulami, vzorec
    HYPERLINK, bez odkazu, bez activeBarcode, activeBarcode na konci, odkaz v buňce objednávky,
    TOP, operace, druhý list) vyrobí v prohlížeči přes SheetJS, import a upozornění, TOP nahoře,
    hledání, PDF (na šířku, stránky, hlavička, žádné anotace odkazů), QR kódy vykreslí PyMuPDF
    a čte jsQR (záloha ZXing) a musí nést activeBarcode, Ctrl+V (událost `paste` s HTML jako
    z Excelu a jen s textem, vložení do hledání nic nepřidá), 2.28: poslední záznamy přes Ctrl+V,
    poznámka, odebrání, přetažení myší (i nad TOP nejde), šipky, PDF s úpravami jen v odstínech
    šedé, monitor 1280 px bez přetečení; 2.29: výrobní plán (rychlé čtení i SheetJS), poddíly
    pod sestavou, poznámka a záznam u poddílu, odebrání, PDF s poddíly, plán v paměti u dalšího
    seznamu; 2.29.1: poddíl s jinou operací přidaný záznamem, „Odesláno na WPA“ nepřidá,
    orientační řádek sestavy (aplikace i PDF), Skrýt v PDF, tabulka na 1440 px bez posouvání;
    2.31: ruční TOP (pořadí), sestava Zobrazit plně (QR i v PDF), filtr operací (řádky, PDF jen
    vybrané operace); 2.32: TOP 2 (pořadí, štítek, poznámka), oddělení (založení, přiřazení
    operací, bloky, výběr v řádku, přetažení na nadpis, filtr, PDF s bloky); další seznam,
    přepnutí, smazání, historie, CSV, telefon, tmavý režim; 2.36: Doplnit chybějící (soubor,
    odebraná se nevrátí, na přání ano, ze schránky, nic nechybí, Zrušit, historie, telefon);
  - `e2e_kapacity.js`: Kapacity a zaškolení v Auditu (2.30, stránky 2.31): vymyšlených 36 lidí ve
    třech skupinách a prázdná skupina, docházka za 4 měsíce do včerejška, historie hodnocení, nemoc,
    vyřazený, vedoucí, bez skupiny, evidence práce s normou za dva měsíce; měsíční souhrn (texty,
    řádky a CELKEM proti výpočtu, grafy, tooltip, písma Plex), záhlaví reportu (uloží se, fokus),
    týdenní souhrn (aktuální i celý minulý týden), vývoj zaškolení, PDF na výšku (text, Plex Mono,
    A4, pořadí stránek, jen ID), Excel, budoucí období jako plán, hranice zaškolení (2.33), telefon
    a tmavý režim (bílý papír);
  - `e2e_dochazka.js` (2.37): docházka a výkony z jednoho souboru (dva listy přes SheetJS, datum
    s formátem, číslo zakázky bez něj), Kontroly podle příchodů (nastavení, odznak, nahrání,
    los jen z lidí v práci, znovu, náhradník), Audit (dialog, Lidé v práci den a měsíc, popisek,
    PDF, Excel), profil s koláčem (legenda proti výpočtu, popisek, tmavé barvy), bez ID,
    nastavení sloupců, historie, telefon; hodiny stránky stojí na pátku 30. 10. 2026;
  - `e2e_plankap.js` (2.38): Plán kapacit (potřeba po úrovních, srovnání, máme, Ø v práci,
    doplnit, doškolit, kandidát do profilu, poznámka, historie, PDF přes pypdf, Excel, telefon);
  - `e2e_report.js` (2.40): Report docházky (den, týden, měsíc, rok, plán, svátek, PDF, Excel, telefon);
  - `e2e_zdroj.js` (2.42): soubor Docházka a výkony od listopadu (docházka pro odměny, evidence
    práce, obsazenost Auditu, skupiny Matice, starý výkaz listopad nepřepíše, říjen beze změny, telefon);
  - `e2e_rychla.js` (2.39): Rychlá kontrola na telefonu (dlaždice, plovoucí menu, počet, směna,
    oddělení, jen lidé v práci, přednost, výměna, sdílení, uložení, zápis, tmavý režim, 320 px);
  - `e2e_upgrade_prev.js`: aktualizace z předchozí verze na aktuální na Apachi (data
    položku po položce, 426 staré stránky, nové funkce nad převzatými daty);
  - `e2e_vykaz.js` (2.35): jeden výkaz práce pro Výrobu i Audit: odhad sloupce Operace, kusy
    v Auditu proti výpočtu v Node, evidence po lidech (ID 109 ke spárování), „Otevřít Audit“,
    v Auditu Nahrát i do Výroby (zaškrtnuté, odškrtnuté), soubor s jinou hlavičkou, historie
    změn, dialog na telefonu;
  - `e2e_protokoly.js`: Protokoly (2.16); testovací fotky kreslí v prohlížeči (canvas), text
    PDF čte přes pypdf (bez něj se kontrola textu přeskočí). Čistá instalace začíná ukázkovými
    daty a první uložení se do historie nezapisuje, proto test mezi kroky čeká na uložení;
  - `e2e_audit.js`: Audit (2.17 až 2.19.2, vlastní období od–do z klávesnice i na telefonu); oba Excely
    i výrobní plán (dva listy, nadpisy na 2. řádku, vložený sloupec, fronta, zrušení čtení,
    120 000 řádků s duplicitami, rychlé čtení xlsx proti SheetJS) vyrobí v prohlížeči přes SheetJS z vymyšlených čísel (žádná
    skutečná data v repu), PDF čte přes pypdf. Po zavření dialogu dne čeká na uloženou úpravu
    (`close` dialogu přijde až po zmizení `[open]`). Kontrola smazaných dílů plánu čeká 404
    (`expectGone`);
  - `e2e_upgrade22.js`, `e2e_upgrade23.js`, `e2e_upgrade24.js`: aktualizace 2.1 → 2.2,
    2.2 → 2.3 a 2.3 → 2.4 na místě na lokálním Apachi (návod v hlavičce).
  - Jdou pustit i proti Apachi: `BASE=http://127.0.0.1/odmeny_v2/ TOKEN_FILE=/var/lib/odmeny_v2/setup-token.txt`.
- Snímky ukládají do `$S/oshots*`, prohlédni si je.
- **Test „verze 2 vedle ostré“** běží na lokálním Apachi v kontejneru a maže lokální
  `/var/lib/odmeny*`. Postup je v `README.md`:
  1. 1.0 z `git archive db14339` na `/odmeny/`;
  2. `e2e_upgrade.js old` (data ve verzi 1.0);
  3. `e2e_vedle.js instalace`: kopie dat; ostrý kód, konfigurace i DB musí zůstat bajt po bajtu;
  4. `e2e_upgrade.js new` s `BASE` na `/odmeny_v2/` (data a novinky ve V2);
  5. `e2e_vedle.js oddeleni` (ostrá verze bez změn z V2, PINy zvlášť).

  Naposledy prošlo celé 1. 10. 2026, už v samostatném repozitáři.
- `e2e_upgrade21.js` je historický test aktualizace na místě 2.0 → 2.1 (`/odmeny/`).
- Poučení z minula:
  - `test_core.js` běží v `vm` kontextu spolu s `core.js`. Stejné top-level jméno v testu
    a v `core.js` koliduje, proto se `r1` přejmenovalo na `round1`.
  - Stavy porovnávej kanonicky (seřazené klíče).
  - `XLSX.writeFile` v Node nefunguje; použij `fs.writeFileSync(XLSX.write(…, {type: 'buffer'}))`.
  - Hodnoty z ukázkových dat nesmí prosáknout do historie změn (`dropDemoRaise`).
  - Snímek „před“ v testu aktualizace ber z čerstvého přihlášení. Paměť stránky se liší
    od uloženého stavu (`hist`).
  - `pkill -f "php -S 127.0.0.1:8490"` v příkazu, jehož text ten vzor obsahuje, zabije
    i vlastní shell. Restart serveru dej do skriptu v `$S` a spouštěj ho samostatně.
  - První změna po ukázce se do historie nezapíše (základ je ukázka); v testech počkej na
    `saved()` a teprve pak dělej změnu, kterou čekáš v historii.
  - Po dialogu „Přidat člověka“ počkej, až detail ukáže nové jméno; `#pPos` existuje i u
    předchozího člověka.
  - Ve 2.3 je `data-li` úrovně v editoru pozice od 0.

## Pojistka pro rozpracovanou verzi

Uživatel stahuje větev kdykoli. Když pushuješ **rozpracované** Odměny, vytvoř
`ROZPRACOVANO.md` s popisem stavu.

- Dokud soubor existuje, `deploy/install.sh` instalaci odmítne a na serveru zůstane
  stará verze. Přebije to jen `ODMENY_FORCE=1`.
- Soubor smaž, až projdou všechny testy včetně prohlížeče a testu aktualizace.
- Instalace před aktualizací zálohuje databázi do `/var/lib/odmeny_v2/backups/` (posledních 10).
