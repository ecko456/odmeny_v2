# Odměny verze 2: testy

Přesunuto z `CLAUDE.md` 13. 11. 2026 (verze 2.79.1) beze změny textu. Aktuální příkazy, počty
testů a postup testu aktualizace jsou v `CLAUDE.md` (oddíl Testy); tady je celý původní oddíl
s popisem, co který průchod v prohlížeči hlídá. Nový test sem dopiš do seznamu průchodů.

## Testy a lokální běh (původní oddíl)

Kontejner cloudové session má předinstalované PHP 8.4 CLI (sqlite3, mbstring), Node 22
a Playwright s Chromiem. Apache ne; pro testy na Apachi ho nainstaluje `deploy/install.sh`
(jen v kontejneru, **nikdy ne na ostrém serveru**).

```bash
python3 -m unittest discover -s tests   # 30 testů: server, šifrovaný tok, výpočty, kopie dat, oddělení od ostré verze, přeformulování (náhradní API), šifrované fotky
node tests/test_core.js                 # 113 testů: proti původní aplikaci + opravy + 2.1 až 2.62
bash tests/run_e2e.sh                   # 2.63: všechny průchody v prohlížeči souběžně (vlastní servery a data)

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
  - `e2e_rucni.js` (2.51): ruční úpravy docházky, zámky, nové nahrání, šířka, požadavek pracovníka v Úkolech, telefon;
  - `e2e_jmena.js` (2.48): kontrola jmen při nahrání docházky postaru (prohozené, překlep, neznámý, dvojí přiřazení, nikdo nový, telefon);
  - `e2e_att_export.js` (2.45.2, 2.50): export docházky za měsíc (Excel jeden list s barvami přes openpyxl, PDF, telefon);
  - `e2e_hledani.js` (2.56): hledání lidí v menu na PC (jméno, ID, šipky, Enter, myš, Escape, „/“, telefon bez kolonky);
  - `e2e_xss.js` (2.62.1): podvržené HTML v datech se nikde nevykreslí;
  - `e2e_shdny.js` (2.73): Shortage po dnech (zabalení, dny na shortage, odbourané, filtr, PDF, Historie, telefon);
  - `e2e_normy.js` (2.74): KPI Normy (sloupec dílu v okně načtení, zkušení, záznamy do 2 min, hledání, Excel, hranice, plnění, telefon);
  - `e2e_shpin.js` (2.75): Shortage Připnout a Duplikovat (tři dny, filtr, oddělení kopie, odebrání kopie, PDF, odepnutí, rychlost velkého seznamu, telefon);
  - `e2e_potermin.js` (2.79): modul Po termínu (AI návrh sloupců se skluzem, seřazení, plán, evidence, společná oddělení, Hotovo, PDF, oddělení od Shortage, nové přihlášení, telefon);
  - `e2e_shpruvodce.js` (2.78): Shortage průvodce nahráním, přednastavení sloupců plánu, velká evidence ze schránky, poslední 3 záznamy, K prověření, poznámka připnuté položky, sestava rozdělená do oddělení, PDF, telefon;
  - `e2e_scan.js` (2.77): Rychlý scan (falešná kamera s QR, pozice, dávka, množství, stejný kód v záběru, čtečka, potvrzení do Shortage, mobilní záznamy, Excel, Odesláno na WPA hned, kamera mimo modul, zabalený seznam, monitor);
  - `e2e_shhotovo.js` (2.76): Shortage zelená = Hotovo (vzorník, pořadí, blok Hotovo za odděleními, ruční stav, filtr, PDF i po odděleních, Doplnit chybějící, pravý panel, historie, telefon);
  - `e2e_soubeh.js` (2.62): dva lidé současně (sloučení, sankce obou, střet, průběžné načtení, rozepsané pole, otevřené okno, telefon);
  - `e2e_shkroky.js` (2.61): Shortage ve třech krocích (sloupce, vzorník barev, plán, evidence pohybu, AI, rozbor, telefon);
  - `e2e_lockbg.js` (2.60): pozadí zámku (kreslí, hýbe se, pauza, omezit pohyb, bez WebGL, po odemčení pryč, telefon);
  - `e2e_panel.js` (2.59): pravý panel (úkoly, rychlé akce, Vrátit zpět), sbalitelné menu, kapsle s pruhy, hladké křivky, oddělení barevně, 1440 / 2560 / telefon;
  - `e2e_vzhled.js` (2.47, 2.54): vzhled Sklo, bez volby vzhledu, stará volba se zahodí, doladění, PDF nezávisí na CSS;
  - `e2e_ukoly.js` (2.46): Úkoly (zadání, stavy, časová osa, opakování, připomínky, historie, Excel, telefon);
  - `e2e_undo.js` (2.45): Poslední změny za 3 dny, Vrátit zpět (částečně, potvrzení, vrácení vrácení, sloučený záznam, telefon);
  - `e2e_vykon.js` (2.44): KPI v menu, Výroba pryč, Výkonnost na osobu (pořadí, řazení, filtr, Excel, profil, telefon);
  - `e2e_konce.js` (2.43): import konců trestů a směnnosti, kontroly řádků, Konce trestů, Excel, PDF (2.45.2), telefon;
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
