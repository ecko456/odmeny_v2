# Odměny: poznámky pro Clauda

Hodnocení operátorů ve výrobě. Každý měsíc dostane člověk benefit:

- **tabáky**: počet;
- **Kafe**: ano, nebo ne;
- od verze 2.1 i **navýšení platu v %**.

Je to samostatná aplikace na `/odmeny/`. Má vlastní kód, data i přihlašování; s Trading Deskem
sdílí jen server a repozitář. Dokumentace pro uživatele je v `odmeny/README.md` (novinky
verzí, instalace, zálohy, postupy testů).

Aplikace vychází z `../hodnoceni-operatoru.html`, původní jednosouborové aplikace uživatele.
Výpočty jsou převzaté, každá změna proti originálu je v kódu označená `Oprava:` a hlídá ji
`tests/test_core.js`.

## Verze a stav

| verze | commit | obsah |
|---|---|---|
| 1.0 | `ffe47d2` | šifrovaný server, kartičky s QR, PIN zařízení, nové UI |
| 2.0 | `a4e5c73` | osobní pohled pro každou kartičku, historie změn, matice dovedností, profil člověka |
| 2.1 | `10f98b5` | **aktuální** (viz níže) |

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

- **Úrovně 1–4** (Nováček, Pokročilý, Samostatný, Profík): každá úroveň pozice má tabáky,
  popis, navýšení platu a podmínky (`minAtt`, `minNorm`, `minUse`; `null` = nehlídá se).
- **Fond** = pracovní dny × směna (výchozí 7,5 h). Kdo má „zkrácený pátek“, má v pátek
  `friShift` (6,5 h).
- **Absence** = celý pracovní den bez hodin a bez omluveného kódu (výchozí omluvené kódy
  jsou `D,DOV,N,NEM,PN,L,P,OČR,ŠK,S,V,NV`; porovnávají se bez diakritiky).
- **Víkendová směna** vyplní jeden den absence. Zbytek absence → **srážka** podle pravidel
  pozice (`penalty [{at,t}]`). Bez absence → zbylé víkendy dají **bonus** (`bonus`).
- **Sankce**: důvod ze seznamu + 10/30/50 % z nároku. Procenta se sčítají, každá sankce stojí
  aspoň 1 tabák, 100 % a víc = vše. Starší záznamy mají pevné `points`.
- **Ruční úprava** (`adjust`) platí jen pro jeden měsíc. Může jít nad strop pozice nejvýš
  o `adjOver`.
- **Výdej** (`issued`): potvrzení, že byl benefit vydán. Ukládá snímek (tabáky, Kafe, pozice,
  úroveň); když se výsledek pak změní, UI to ukáže.
- **Zaučení** (`skills`) na dalších pozicích je jen pro matici dovedností a tabáky nemění.
- **Vyřazený** (`excluded`) zůstává v evidenci, ale nehodnotí se.

## Architektura: server nevidí data

**Server** (`lib/odmeny.php`, `api.php`), PHP + SQLite `odmeny.sqlite3`.

- Tabulky: `cards`, `devices`, `sessions`, `attempts`, `versions`, `prefs`.
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
- **Záloha `.odmeny`** obsahuje data a DEK zabalený každou kartičkou.
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

**Verze tvaru dat.** Tyhle tři konstanty se mění **vždy spolu** a teď jsou `3`:

- `DATA_VERSION` v `private/core.js`;
- `CLIENT_VERSION` v `static/vault.js`;
- `ODM_MIN_CLIENT` v `lib/odmeny.php`.

Když přibude pole do sdílených dat, zvyš všechny tři o 1 a zvedni `ODM_VERSION` (`'2.1'`).
Stránka otevřená ve staré verzi pak dostane 426 a nová pole nesmaže.

## Datový model

Stav `S` definují `blank()` a `sanitizeState()` v `private/core.js`.

- `positions[]`: `{id, name, dept, max, onlyKafe, levels[4], penalty[], bonus[]}`
  - `max: null` = strop je nejvyšší úroveň;
  - úroveň: `{name, tabaky, desc, raise, minAtt, minNorm, minUse}`.
- `employees{key}`:
  - klíč je `norm(příjmení)|norm(jméno)`;
  - hodnota: `{key, first, last, positionId, level, note, shortFri, excluded, wid, skills{posId: 1–4}, hist[{at, pos, lvl}]}`.
- `periods{YYYY-MM}`: docházka, `{days[iso], rows{key: {first, last, h[], c[]}}, codes, file, at, headerRow}`.
- `production{YYYY-MM}`: evidence práce.
  - `{names{normJméno: {name, total, count, days{iso: ks}, spent, norm, nspent}}, records, total, time, file, at}`.
  - Minuty: `spent` = strávený čas; `norm` = norma; `nspent` = čas jen u řádků s normou.
- `prodMap{normJméno: key}`: ruční spárování.
- Další klíče:
  - `adjust{period: {key: ±n}}`;
  - `sanctions[]`, `sanReasons[]`;
  - `kafe{period: práh v hodinách}`;
  - `issued{period: {key: {at, tabaky, kafe, pos, lvl}}}`;
  - `log[]` (nejvýš 2000 záznamů; kinds `person|level|sanction|adjust|issue|import|position|settings|data`);
  - `settings{shift, excused, excusedReducesFund, friShift, absenceCutoff, adjStep, adjOver, prodCols}`;
  - `current`, `demo`, `v`.
- **Osobní nastavení** (`prefs`, pro každou kartičku zvlášť, `cleanPrefs` v `app.js`):
  - `period, sort, pos, onlyImported, onlyOpen, hiddenCols, sanFilter`;
  - `lockMinutes, logSeen, matrixDept, profileRange, profileFrom, profileTo`.
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
7. `odmeny/README.md` (Co je nového).

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
- `raiseOf(L, perf)`: jde od úrovně člověka dolů. Použije první úroveň, která má `raise > 0`
  a splněné všechny vyplněné podmínky. `own` = podmínky vlastní úrovně, ať UI ukáže, co chybí.
- `allRows()` / `activeRows()`: řádky přehledu (`evaluate` + výroba + `perf` + `raise`).

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
  `vyroba`, `pozice`, `nastaveni`.
- Horní lišta:
  - hodiny = historie změn (`openLog`, odznak nových od posledního otevření);
  - stav ukládání.
- **Přísná CSP**: žádné inline styly ani `on…=` handlery (hlídá to `test_odmeny.py`).
  Šířky se nastavují přes `data-w` a `setWidths`.
- PDF pravidel:
  - `exportRulesPdf` a `drawRules` v `app.js`;
  - obsah dodává `rulesDoc()` v `core.js`;
  - jsPDF + podmnožina IBM Plex Sans (TTF z `private/vendor/`).
- Barevné tokeny pro světlý i tmavý režim jsou v `static/lock.css` (`:root`,
  `prefers-color-scheme`) a `app.css` na ně navazuje přes `var(--…)`.
- Barvy grafů v profilu jsou ověřené validátorem palety (skill dataviz).

## Testy a lokální běh

```bash
python3 -m unittest discover -s odmeny/tests   # server, šifrovaný tok (vault_flow.js), výpočty
node odmeny/tests/test_core.js                 # proti původní aplikaci + opravy + 2.1

# lokální server s čistými daty ($S = scratchpad)
ODMENY_DATA_DIR=$S/odme2e php -S 127.0.0.1:8490 -t odmeny odmeny/dev-router.php &
curl -s -H 'X-Odmeny: 1' http://127.0.0.1:8490/api.php?action=state    # vytvoří setup-token.txt
NO_PROXY=127.0.0.1 PW=/opt/node22/lib/node_modules/playwright S=$S node odmeny/tests/e2e_v21.js
```

- Průchody v prohlížeči:
  - `e2e_browser.js`: celá aplikace;
  - `e2e_v2.js`: novinky 2.0;
  - `e2e_v21.js`: novinky 2.1.
- Snímky ukládají do `$S/oshots*`, prohlédni si je.
- **Test aktualizace** běží na lokálním Apachi v kontejneru a maže lokální `/var/lib/odmeny`.
  Postup je v `odmeny/README.md`.
  - `e2e_upgrade.js`: 1.0 → 2.0.
  - `e2e_upgrade21.js`: 2.0 → 2.1. Porovná sdílený stav položku po položce a ověří, že stará
    otevřená stránka nic neuloží.
  - Další verze potřebuje obdobný test z `10f98b5` (`git archive 10f98b5 odmeny`).
- Poučení z minula:
  - `test_core.js` běží v `vm` kontextu spolu s `core.js`. Stejné top-level jméno v testu
    a v `core.js` koliduje, proto se `r1` přejmenovalo na `round1`.
  - Stavy porovnávej kanonicky (seřazené klíče).
  - `XLSX.writeFile` v Node nefunguje; použij `fs.writeFileSync(XLSX.write(…, {type: 'buffer'}))`.
  - Hodnoty z ukázkových dat nesmí prosáknout do historie změn (`dropDemoRaise`).
  - Snímek „před“ v testu aktualizace ber z čerstvého přihlášení. Paměť stránky se liší
    od uloženého stavu (`hist`).

## Pojistka pro rozpracovanou verzi

Uživatel stahuje větev kdykoli. Když pushuješ **rozpracované** Odměny, vytvoř
`odmeny/ROZPRACOVANO.md` s popisem stavu.

- Dokud soubor existuje, `odmeny/deploy/install.sh` instalaci odmítne a na serveru zůstane
  stará verze. Přebije to jen `ODMENY_FORCE=1`.
- Soubor smaž, až projdou všechny testy včetně prohlížeče a testu aktualizace.
- Instalace před aktualizací zálohuje databázi do `/var/lib/odmeny/backups/` (posledních 10).
