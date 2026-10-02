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
nepushne): 1.0 = `db14339`, 2.0 = `9f26efa`, 2.1 = `019af97`. Hashe commitů jsou jiné
než v `trading_desk`.

## Kde jsme skončili

Stav k 1. 10. 2026:

- Odměny se oddělily do vlastních repozitářů. Kód verze 2 je stejný jako 2.1, jen běží
  samostatně na `/odmeny_v2/` a umí si zkopírovat ostrá data.
- Uživatel má verzi 2 nainstalovat s kopií dat a vyzkoušet ji:
  `git clone https://github.com/ecko456/odmeny_v2.git /root/odmeny_v2 && sudo ODMENY_KOPIE=1 bash /root/odmeny_v2/deploy/install.sh`.
- Další zadání k Odměnám se čeká.

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
- Až se V2 osvědčí, bude potřeba domluvit převod: čerstvá kopie dat a přepnutí adresy,
  nebo instalace V2 na `/odmeny/`. Zatím se nic takového nedělá.

## Verze a stav

| verze | commit | obsah |
|---|---|---|
| 1.0 | `db14339` | šifrovaný server, kartičky s QR, PIN zařízení, nové UI (= ostrá verze) |
| 2.0 | `9f26efa` | osobní pohled pro každou kartičku, historie změn, matice dovedností, profil člověka |
| 2.1 | `019af97` | navýšení platu, evidence práce s časem a ID, jen Kafe, PDF pravidel |
| 2.1 na `/odmeny_v2/` | `main` | **aktuální**: stejný kód, oddělený od ostré verze |

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

Kontejner cloudové session má předinstalované PHP 8.4 CLI (sqlite3, mbstring), Node 22
a Playwright s Chromiem. Apache ne; pro testy na Apachi ho nainstaluje `deploy/install.sh`
(jen v kontejneru, **nikdy ne na ostrém serveru**).

```bash
python3 -m unittest discover -s tests   # 19 testů: server, šifrovaný tok, výpočty, kopie dat, oddělení od ostré verze
node tests/test_core.js                 # proti původní aplikaci + opravy + 2.1

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
  - `e2e_v21.js`: novinky 2.1.
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

## Pojistka pro rozpracovanou verzi

Uživatel stahuje větev kdykoli. Když pushuješ **rozpracované** Odměny, vytvoř
`ROZPRACOVANO.md` s popisem stavu.

- Dokud soubor existuje, `deploy/install.sh` instalaci odmítne a na serveru zůstane
  stará verze. Přebije to jen `ODMENY_FORCE=1`.
- Soubor smaž, až projdou všechny testy včetně prohlížeče a testu aktualizace.
- Instalace před aktualizací zálohuje databázi do `/var/lib/odmeny_v2/backups/` (posledních 10).
