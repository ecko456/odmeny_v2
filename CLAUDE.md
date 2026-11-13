# Odměny verze 2: poznámky pro Clauda

Claude Code si tenhle soubor načte sám na začátku každé session.

Začalo to jako hodnocení operátorů ve výrobě. Každý měsíc dostane člověk benefit:

- **tabáky**: počet;
- **Kafe**: ano, nebo ne;
- od verze 2.1 i **navýšení platu v %**.

Dnes je to aplikace s názvem HALA 2 (v exportech `EXPORT_NAME`) s víc moduly: Odměny (Přehled,
Lidé, Matice dovedností, Sankce, Docházka), KPI, Plán kapacit, Konce trestů, Úkoly, Kontroly,
Rychlá kontrola, Top 5, Protokoly, Servis, Shortage, Po termínu a Rychlý scan.

**Běží jen verze 2 na `/odmeny_v2/`.** Ostrou verzi `/odmeny/` uživatel 7. 11. 2026 zrušil
(viz „Ostrá verze“ níže). Dokumentace pro uživatele je v `README.md` (novinky verzí, instalace,
zálohy, postupy testů).

Aplikace vychází z původní jednosouborové aplikace uživatele, `tests/hodnoceni-operatoru.html`.
Výpočty jsou převzaté, každá změna proti originálu je v kódu označená `Oprava:` a hlídá ji
`tests/test_core.js`.

## Kde co je

Tenhle soubor je od 13. 11. 2026 (2.79.1) zeštíhlený: načítá se celý do každé session,
dřív měl 290 kB a session se zahlcovala. Nic se nesmazalo, jen přesunulo do `docs/`:

| soubor | co tam je | kdy číst |
|---|---|---|
| `CLAUDE.md` (tento) | pravidla, poslední 3 zápisy, architektura, datový model, výpočty, testy v kostce | vždy (načte se sám) |
| `docs/historie.md` | všechny starší zápisy „Kde jsme skončili“ (od 1. 10. 2026 po 2.77) se zadáním uživatele jeho slovy, celá tabulka verzí s commity, původní text o ostré verzi, nezačaté zadání „víc modulů“ | když potřebuješ vědět, proč něco je, jak to uživatel zadal, nebo commit starší verze |
| `docs/moduly.md` | podrobný popis modulů: data, funkce, UI (Matice, Přeformulování, Top 5, Kontroly, Protokoly, Servis, Shortage, KPI, Plán kapacit) | před prací na modulu |
| `docs/testy.md` | všechny průchody v prohlížeči a co hlídají, testy na Apachi | před psaním nebo úpravou testu |
| `README.md` | pro uživatele (novinky, instalace, zálohy) | při každé verzi doplnit „Co je nového“ |

Hledej přes `grep -n "<funkce nebo verze>" docs/*.md`. Historické zápisy se nepřepisují.

**Jak zapisovat (po každé větší práci):**

1. Nový zápis „Stav k D. M. RRRR (verze X)“ přidej **nahoru** do „Kde jsme skončili“.
2. V CLAUDE.md zůstávají **3 poslední** zápisy. Čtvrtý (nejstarší) přesuň beze změny na začátek
   oddílu zápisů v `docs/historie.md`.
3. Nový řádek tabulky verzí přidej do obou tabulek (tady a v `docs/historie.md`); tady drž jen
   posledních zhruba 6 řádků.
4. Nový modul nebo velká změna modulu: popis do `docs/moduly.md`, nový e2e test do `docs/testy.md`.

## Tři oddělené projekty

Do 1. 10. 2026 bylo všechno v jednom repozitáři `trading_desk`. Uživatel chtěl, ať se projekty
nepletou, a teď má každý vlastní repozitář:

| projekt | repozitář | adresa | kód na serveru | data |
|---|---|---|---|---|
| Trading Desk | `ecko456/trading_desk` | `/trading/` | `/var/www/trading-journal` | `/var/lib/trading-journal` |
| Odměny ostré (zrušené 7. 11. 2026) | `ecko456/odmeny` | `/odmeny/` | ~~`/var/www/odmeny`~~ | ~~`/var/lib/odmeny`~~ |
| **Odměny verze 2 (tady)** | `ecko456/odmeny_v2` | `/odmeny_v2/` | `/var/www/odmeny_v2` | `/var/lib/odmeny_v2` |

Klony na serveru jsou `/root/trading_desk` a `/root/odmeny_v2`. Všechny repozitáře jsou
**veřejné**. Historie Odměn je převzatá z `trading_desk`. Verze jsou commity (tagy proxy session
nepushne), celá tabulka je v `docs/historie.md`.

## Kde jsme skončili

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

Starší zápisy (2.77 a dál dozadu) jsou v `docs/historie.md`.

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

## Ostrá verze `/odmeny/` (zrušená) a co z ní platí

- Uživatel 7. 11. 2026: „verzi /odmeny/ už můžeš smazat. využíváme už jen v2“. Dostal příkazy
  pro server (záloha `/root/odmeny-ostra-zaloha-RRRR-MM-DD.tar.gz`, vypnutí, smazání kódu, dat,
  konfigurace a klonu). Repozitář `ecko456/odmeny` na GitHubu zůstává.
- Pořád platí:
  - `deploy/install.sh` nikdy nezapisuje do ostrých cest (`/var/www/odmeny`, `/var/lib/odmeny`,
    `odmeny.conf`); hlídá to `test_version_2_never_touches_live_install`. Jediná zmínka je `LIVE_DB`
    (zdroj kopie); `ODMENY_KOPIE=1` už nemá z čeho kopírovat a nic nezmění.
  - Zapamatované zařízení V2 je v localStorage pod klíčem `odmeny.device.v1:/odmeny_v2/`
    (`deviceStorageKey` ve `vault.js`), cookie relace má cestu podle adresáře.
  - **Řetězce pro kryptografii (`odmeny/v1`, `odmeny/data/v1`, `odmeny/dek|…`, `odmeny/prefs/v1|…`,
    `odmeny/file/v1|…`) se nesmí měnit.** Uložená data by se nedala rozšifrovat.
  - V UI je vidět „verze 2“ (titulek, zámek, boční panel).
- Původní text oddílu (kopie ostrých dat přes `bin/copy-db.php`, plán přechodu) je v `docs/historie.md`.

## Verze (posledních pár)

Celá tabulka od 1.0 (`db14339`) je v `docs/historie.md`. Commit předchozí verze potřebuje test
aktualizace (`e2e_upgrade_prev.js`, archiv v hlavičce).

| verze | commit | obsah |
|---|---|---|
| 2.76 | `b054487` | Shortage – zelená buňka EANu = Hotovo, hotové položky vždy na konci seznamu (data verze 54) |
| 2.77 | `ac24fb4` | Rychlý scan – QR kódy z mobilu do interní evidence Shortage (pozice, hromadné načítání, množství), mobilní záznamy a Excel (data verze 55) |
| 2.78 | `3afd2dd` | Shortage – průvodce nahráním, přednastavení sloupců plánu (AI jen u jiného souboru), všechny řádky velké evidence, poslední 3 záznamy u dílu, K prověření, sestava rozdělená do oddělení podle poddílů, poznámka připnuté položky (data verze 56) |
| 2.79 | `33650cf` | modul Po termínu (tabulka po termínu se skluzem ve sloupci F, AI návrh sloupců ke kontrole, seřazení podle skluzu, plán a evidence jako Shortage, společná oddělení) (data verze 57) |
| 2.79.1 | větev `claude/elegant-clarke-vl5n7d` | **aktuální**: v PDF se netiskne poddíl rozdělené sestavy, který patří jinému oddělení (bez Zobrazit plně) |

## Pojmy

- **Skupina** (od 2.4, v datech pořád `positions[]`): dovednosti `skillset[]` hodnocené 0–4,
  `maxTab` = tabáky, když jsou všechny dovednosti na 4. Každá úroveň je 25 %, procento skupiny
  je průměr dovedností, tabáky = `round(maxTab × procento)`. Varianty prémie `tiers[]` (do 2.10 „stupně“).
- **Úrovně 1–4** (Nováček, Pokročilý, Samostatný, Profík) jsou tvar do verze 2.3: pozice bez
  `skillset` se počítá postaru (`levelOf` větev `legacy`), dnes jen pro porovnání s původní
  aplikací v testech. `sanitizeState` každou takovou pozici převede na skupinu.
- **Směna**: `R` stálá ranní, `S1` a `S2` směnnost skupina 1 a 2 (`SHIFTS`).
- **Fond** = pracovní dny × směna (výchozí 7,5 h). Odpolední směna v pátek má od 2.53 sama
  `friShift` (6,5 h), viz `friShort`.
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
- Po odemčení `lock.js` stáhne `app.php?f=app.html|app.css|core.js|app.js` (od 2.63 jsou
  `core.js` a `app.js` spojené díly z `private/core/` a `private/app/`). Bez relace dostane
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

**Ukládání** (`private/app/02-dialogy-ukladani.js`).

1. `onStateChange` čeká 1,2 s. Hned uloží, když je nastavené `store.note` (hromadná změna)
   nebo když změny čekají přes 6 s.
2. `flushSave` pak:
   1. vezme `sharedState(S)`;
   2. zavolá `describeChanges(store.base, shared)`, výsledek přidá do logu a historie
      zařazení (`applyHist`);
   3. uloží přes `Vault.saveData(shared, store.rev)`.
3. Konflikt (409) otevře dialog Přepsat, nebo Načíst. Při přepsání se sloučí log z obou stran.

**Verze tvaru dat.** Tyhle tři konstanty se mění **vždy spolu** a teď jsou `57` (od 2.79):

- `DATA_VERSION` v `private/core/06-kontrola-dat.js`;
- `CLIENT_VERSION` v `static/vault.js`;
- `ODM_MIN_CLIENT` v `lib/odmeny.php`.

Když přibude pole do sdílených dat, zvyš všechny tři o 1 a zvedni `ODM_VERSION` v `lib/odmeny.php`.
Stránka otevřená ve staré verzi pak dostane 426 a nová pole nesmaže.

## Datový model

Stav `S` definují `blank()` (`private/core/01-zaklad-stav.js`) a `sanitizeState()` (`private/core/06-kontrola-dat.js`).

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
  - `log[]` (nejvýš 2000 záznamů; kinds `person|level|sanction|adjust|issue|import|position|settings|data|eff|audit|logbook|workaudit|service|shortage|capplan|task`);
  - `logbooks[]` (2.16): Protokoly (viz níže);
  - `service` (2.21, 2.22): Servis, evidence zařízení, odeslání a vzory (viz níže);
  - `shortage` (2.27): Shortage, nahrané seznamy chybějících dílů (viz níže);
  - `workAudit.dv` (2.37): docházka a výkony z jednoho souboru (viz Audit);
  - `workAudit.dv.sheets` (2.42.3): zapamatované listy souboru docházky a výkonů;
  - `employees[].end` (2.43): konec trestu;
  - `tasks` (2.46): Úkoly (viz Kde jsme skončili 2.46);
  - `attEdits`, `attLocks` (2.51): ruční úpravy docházky a zámky dnů a měsíců;
  - `undo` (2.45): uložené změny za 3 dny pro Vrátit zpět, `log[].u`/`log[].un`;
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

## Výpočty (`private/core/*.js`)

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

## UI (`private/app.html`, `private/app/*.js`, `private/app.css`)

- Pohledy (`data-view`): `prehled`, `lide`, `matice`, `profil`, `sankce`, `dochazka`,
  `konce` (2.43), `ukoly` (2.46), `vyroba`, `top5`, `kontroly`, `rychla` (2.39), `protokoly`, `servis` (2.21), `shortage` (2.27), `potermin` (2.79, sekce `#view-shortage`), `scan` (2.77), `audit`, `nastaveni`
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

## Moduly (podrobně v `docs/moduly.md`)

Kód je v dílech `private/core/NN-*.js` (výpočty, data) a `private/app/NN-*.js` (obrazovky).
`app.php` je vydá spojené v pořadí čísel jako jeden `core.js` a jeden `app.js`, všechno sdílí jeden
globální rozsah. **Nový díl** = nový soubor s číslem na správném místě (jen `NN-`, jinak přečíslovat).

| modul | pohled | data `S.…` | core | app |
|---|---|---|---|---|
| Přehled, Lidé, Profil, Sankce | `prehled`, `lide`, `profil`, `sankce` | `employees`, `sanctions`, `adjust`, `issued`, `marks` | 01–05 | 05–08, 17 |
| Matice dovedností, skupiny, kapacita | `matice` | `positions`, `leadSkills`, `capReport` | 03, 04 | 09, 16 |
| Docházka (postaru, úpravy, zámky) | `dochazka` | `periods`, `attEdits`, `attLocks` | 02, 03, 16, 17 | 10 |
| Docházka a výkony z jednoho souboru | (KPI, Docházka) | `workAudit.dv` | 14 | 31 |
| Výroba (starší evidence práce) | `vyroba` | `production`, `prodMap` | 02 | 11 |
| KPI (dřív Audit), Report docházky, Výkonnost, Normy | `audit` | `workAudit` | 04, 13, 18, 19 | 27, 28, 31, 32 |
| Plán kapacit | `plankap` | `capPlan` | 20 | 29 |
| Konce trestů | `konce` | `employees[].end` | 15 | 23 |
| Úkoly, kalendář, časová osa (pravý panel) | `ukoly` | `tasks`, `calNotes`, `agenda` | 21, 25, 26 | 15, 30 |
| Top 5 nejméně efektivně | `top5` | `eff` | 10 | 18, 19 |
| Kontroly, Rychlá kontrola | `kontroly`, `rychla` | `audit` | 11 | 22, 24 |
| Protokoly (provozní deníky) | `protokoly` | `logbooks` (+ šifrované fotky) | 12 | 20 |
| Servis | `servis` | `service` | 22 | 25 |
| Shortage, Po termínu (stejný kód, 2.79) | `shortage`, `potermin` | `shortage`, `late` | 23, 24 | 26, 34 |
| Rychlý scan | `scan` | `shortage.scans` | 27 | 33 |
| Historie změn, Vrátit zpět, sloučení dvou lidí | — | `log`, `undo` | 07, 08, 09 | 02, 14 |

## Testy a lokální běh

Kontejner cloudové session má předinstalované PHP 8.4 CLI (sqlite3, mbstring), Node 22
a Playwright s Chromiem. Apache ne; pro testy na Apachi ho nainstaluje `deploy/install.sh`
(jen v kontejneru, **nikdy ne na ostrém serveru**).

```bash
python3 -m unittest discover -s tests   # 33 testů: server, šifrovaný tok, kopie dat, oddělení od ostré verze, AI (náhradní API), šifrované soubory
node tests/test_core.js                 # 132 testů: proti původní aplikaci + opravy + každá verze od 2.1
OUT=$S/e2e PW=/opt/node22/lib/node_modules/playwright bash tests/run_e2e.sh [testy…]   # průchody v prohlížeči souběžně
```

- `run_e2e.sh` (od 2.63): každý test má vlastní adresář, data a PHP server (port 8500 + pořadí),
  `JOBS` = počet najednou, souhrn `$OUT/summary.txt`, výstupy `$OUT/<test>/out.log`, snímky
  `$OUT/<test>/oshots-*` (**prohlédni si je**). Bez `e2e_upgrade*` a `e2e_vedle` (ty běží na Apachi).
  Celá sada (44 testů) trvá kolem 8 minut.
- Playwright: `require('/opt/node22/lib/node_modules/playwright')`, Chromium
  `/opt/pw-browsers/chromium`. Příkaz `playwright install` nespouštěj.
- **Test aktualizace z předchozí verze** (`tests/e2e_upgrade_prev.js`, lokální Apache v kontejneru):
  `git archive <commit předchozí verze> | tar -x -C $S/vNNN && sudo bash $S/vNNN/deploy/install.sh`,
  pak `NO_PROXY=127.0.0.1 PW=… S=$S UPGRADE_CMD='sudo bash deploy/install.sh' node tests/e2e_upgrade_prev.js`
  (předtím `sudo apache2ctl start`). Při nové verzi uprav v hlavičce archiv, `PREV_VERSION`,
  `EXPECT_VERSION`, `ADDED`, `SAME_DATA` a krok 5. Pouštěj vždy, když se mění tvar dat.
- Lokální server ručně (jeden test):
  `ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t . dev-router.php &`, pak
  `curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state` (vytvoří setup-token.txt)
  a `NO_PROXY=127.0.0.1 PW=… S=$S node tests/e2e_….js`.
- Co který test hlídá: `docs/testy.md`.
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
