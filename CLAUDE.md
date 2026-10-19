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

Stav k 19. 10. 2026 (verze 2.24):

- **Plán a skutečnost podle docházky** (Směny a kapacita). Uživatel: „export historické
  obsazenosti podle docházky … vybrat týden zpětně … plán a realita, kolik kdo odpracoval.
  Spárovat to podle jména … jaký byl plán a jaká realita na daných pozicích“.
  - Core: `attDay(key, iso)` (docházka člověka v den, null bez docházky), `attWeeks()` (týdny
    s docházkou), `planReality(weekId)` → `{days (has), rows, groups (week, days), total,
    missing, unpaired, mg, thr}`, `planRealitySheets(weekId)` (Souhrn, Lidé). Plán: skupina
    `levelAt(e, konec týdne)`, směna dnešní, `slotOn` se střídáním `S.capReport.s1am`, hodiny
    `dayShift` (zkrácený pátek), jen pracovní dny s nahranou docházkou. Skutečnost: hodiny,
    kód (omluvený podle `excusedSet`, jinak chybí), navíc = hodiny mimo plán. Páruje se klíčem
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
- `shipments[≤ 2000]`: `{id 'sv…', no, year, date, to, note, by, at, items[≤ 60]}`, číslo
  protokolu `svNo` = `rok/NNN` (`svNextNo` po letech);
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

## Audit (verze 2.17, 2.18)

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

Výrobní plán v UI (sekce „VÝROBNÍ PLÁN“): soubory čte `waPlanOpen` (od 2.18.2 vlastní čtení
xlsx po kouscích, jen vybrané sloupce; záloha SheetJS `dense`, kde je list ve 0.18 pole řádků
a ve 0.19 `ws['!data']`). Soubory jdou do fronty (`waPlanQueueAdd`), zpracování (`waPlanProcess`)
načte uložené díly, sloučí frontu, ukáže souhrn, uloží nové díly, stav přes `store.note`,
a **staré díly smaže až po uložení stavu** (`waWaitSaved`). Chybějící díl (404, třeba po
obnovení starší verze dat) se v souhrnu ohlásí a zpracování pokračuje bez něj.

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
| 2.24 | větev `claude/elegant-clarke-vl5n7d` | **aktuální**: Směny a kapacita – plán a skutečnost podle docházky za týden zpětně, Excel |

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

**Verze tvaru dat.** Tyhle tři konstanty se mění **vždy spolu** a teď jsou `20` (od 2.22):

- `DATA_VERSION` v `private/core.js`;
- `CLIENT_VERSION` v `static/vault.js`;
- `ODM_MIN_CLIENT` v `lib/odmeny.php`.

Když přibude pole do sdílených dat, zvyš všechny tři o 1 a zvedni `ODM_VERSION` (`'2.1'`).
Stránka otevřená ve staré verzi pak dostane 426 a nová pole nesmaže.

## Datový model

Stav `S` definují `blank()` a `sanitizeState()` v `private/core.js`.

- `positions[]` (skupiny): `{id, name, dept, max, onlyKafe, levels[4], skillset[], maxTab, tiers[], penalty[], bonus[], plan{v, unit ks|h}}` (`plan` od 2.9, jen když je zapnutá plánovaná kapacita)
  - `max: null` = bez stropu (maximum + nejvyšší bonus, `posMaxAuto`);
  - `skillset[]`: `{id, name, desc, scale}`; `scale` je 5 úrovní `{name, desc}`, `null` = `STD_SCALE`;
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
  - `capReport{groups[], thr, hidden[], note}`: report Směny a kapacita;
  - `log[]` (nejvýš 2000 záznamů; kinds `person|level|sanction|adjust|issue|import|position|settings|data|eff|audit|logbook`);
  - `logbooks[]` (2.16): Protokoly (viz níže);
  - `service` (2.21, 2.22): Servis, evidence zařízení, odeslání a vzory (viz níže);
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
  `vyroba`, `top5`, `kontroly`, `protokoly`, `servis` (2.21), `audit`, `nastaveni`
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
- `settings{pct}` (výchozí 25).

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
python3 -m unittest discover -s tests   # 28 testů: server, šifrovaný tok, výpočty, kopie dat, oddělení od ostré verze, přeformulování (náhradní API), šifrované fotky
node tests/test_core.js                 # 62 testů: proti původní aplikaci + opravy + 2.1 až 2.24

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
  - `e2e_ai.js`: ✦ Přeformulovat (2.5); sám spustí náhradní API na 127.0.0.1:8598, server
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
