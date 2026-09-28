# Odměny 2.0: rozpracováno

Poznámky, kde práce na Odměnách skončila (28. 9. 2026). Dokud tento soubor existuje,
`odmeny/deploy/install.sh` rozpracovanou verzi **odmítne nainstalovat**. Na serveru tak
dál běží verze 1.0 a data se nemění. Po dokončení a otestování se soubor smaže.

Trading Desk se tím nijak neblokuje: jeho instalace (`deploy/install.sh`) složku `odmeny/`
vůbec nekopíruje, takže na Trading Desku jde normálně pracovat a nasazovat.

## Stav

- **Verze 1.0** je hotová a otestovaná. Je v gitu jako commit `ffe47d2` ve větvi
  `claude/elegant-clarke-vl5n7d` a tu instaluj na server.
- **Verze 2.0** je napsaná. Na konci sezení prošly kontrola syntaxe a všechny
  automatické testy:
  - `odmeny/tests`: 17 testů, včetně nových testů verze 2.0, šifrovaného toku a výpočtů
    proti původní aplikaci;
  - `tests` (Trading Desk): 81 testů.

  **Zatím neproběhl** průchod v prohlížeči, vizuální kontrola, test aktualizace 1.0 → 2.0
  na Apachi ani bezpečnostní sken, viz body 3–6 níže. Terminál byl předtím dlouho
  nedostupný, proto se na ně nedostalo.

## Zadání verze 2.0

1. Filtry, vybrané období a sloupce osobně pro každého, ne pro všechny.
2. Ikona pro zobrazení posledních ručních změn.
3. Export lidí s dovednostmi a úrovní: matice dovedností podle oddělení.
4. Profil člověka s historií (docházka, produktivita, úroveň, srážky); období za vybraný
   měsíc nebo od–do.
5. Bezpečnostní test aplikace a opravy.
6. Aktualizace tak, aby se neztratila data z běžící aplikace.

## Co je napsané

**Server**
- `lib/odmeny.php`:
  - verze a klient: `ODM_VERSION = '2.0'`, `ODM_MIN_CLIENT = 2`;
  - tabulka `prefs` (šifrované osobní nastavení na kartičku, maže se se zrušenou kartičkou);
  - `odm_require_client()`: zápis ze staré otevřené stránky vrátí 426 s `reload`;
  - `odm_input($max)` s menším limitem pro přihlášení;
  - `X-Forwarded-Proto` se bere v potaz jen od proxy na stejném stroji;
  - „místní vývoj“ vyžaduje spojení z 127.0.0.1, samotná hlavička Host nestačí.
- `api.php`:
  - nové akce `me` a `prefs` (GET/POST);
  - `unlock` vrací i `card_label`, `state` vrací verzi;
  - zápis `data` a `prefs` vyžaduje hlavičku `X-Odmeny-Client: 2`.
- `bin/backup-db.php`: záloha databáze přes `VACUUM INTO`, drží 10 kopií.
- `deploy/install.sh`:
  - pozná existující data a před aktualizací zazálohuje databázi do `/var/lib/odmeny/backups/`;
  - opraví vlastníka souborů databáze;
  - obsahuje pojistku přes tento soubor.
- `deploy/apache-odmeny.conf`: ochranné hlavičky i pro statické soubory.

**Prohlížeč**
- `static/vault.js`:
  - hlavička verze klienta;
  - `loadPrefs` a `savePrefs` (AAD `odmeny/prefs/v1|card:<id>`);
  - `me()`; `sealData` a `openData` s volitelným AAD.
- `static/lock.js`: počká na `OdmApp.start()`, které je teď asynchronní.
- `private/core.js`:
  - `sanitizeState` zná nová pole: oddělení u pozice, zaučení `skills`, historii zařazení
    `hist`, záznamy změn `log`, zařazení v době výdeje (`issued.pos` a `issued.lvl`), verzi `v`;
  - `migrate` už nemaže nová `skills`;
  - `sharedState`: osobní pole nejdou na server;
  - `describeChanges` a `appendLog`: kdo, co, kdy, slučování úprav do 10 minut;
  - `applyHist`, `levelAt`, `withPeriod`, `monthsBetween`, `personMonths`;
  - `profileData` a `profileSheets`;
  - `departments`, `deptOf`, `skillMatrix` a `matrixSheets` (značky ILUO);
  - v exportu zařazení přibyl sloupec Oddělení.
- `private/app.js`:
  - osobní nastavení `P` (`cleanPrefs`, `setPref`, `flushPrefs`); první otevření převezme
    dosavadní společné nastavení;
  - `flushSave` zapisuje historii změn;
  - panel změn `openLog` s odznakem nepřečtených;
  - matice (`renderMatrix`, `setSkill`, `exportMatrix`);
  - profil (`renderProfile`, grafy `columnChart`, rozpad měsíce, export);
  - zaučení v detailu člověka, oddělení u pozice, tlačítka „Profil a historie“;
  - oprava: „Vymazat ukázku“ nechá pozice a nastavení, jak slibuje.
- `private/app.html` a `private/app.css`:
  - ikona historie `#logBtn` a položka menu „Dovednosti“;
  - pohledy `view-matice` a `view-profil`;
  - styly a tisk na šířku.

**Testy** (unit a server testy prošly; `e2e_*` zatím nespuštěné)
- `tests/test_core.js`: nové testy historie změn, slučování, `sanitizeState` v2, profilu a matice.
- `tests/test_odmeny.py`: třída `OdmenyVersion2Tests` (426 pro starou stránku, osobní nastavení
  pro každou kartičku, limity, hlavičky proxy a Host, zálohovací skript).
- `tests/e2e_browser.js`: celý průchod v prohlížeči.
- `tests/e2e_upgrade.js`: test aktualizace 1.0 → 2.0 na Apachi.

## Postup dokončení

1. ~~Syntaxe~~ (prošla):
   ```bash
   for f in odmeny/private/app.js odmeny/private/core.js odmeny/static/vault.js odmeny/static/lock.js; do node --check $f; done
   php -l odmeny/api.php && php -l odmeny/lib/odmeny.php && php -l odmeny/bin/backup-db.php
   ```
2. ~~Testy~~ (prošly, po dalších změnách pustit znovu):
   ```bash
   python3 -m unittest discover -s odmeny/tests
   python3 -m unittest discover -s tests
   ```
3. Průchod v prohlížeči na lokálním serveru (návod je v hlavičce `tests/e2e_browser.js`),
   screenshoty projít očima: počítač, mobil, tmavý režim, matice, profil, panel změn.
4. Barvy grafů ověřit validátorem ze skillu dataviz. Grafy používají barvy `--tab`, `--acc`
   a `--wknd` na podkladech `#fdfdfb` a `#171d1b`.
5. Test aktualizace na lokálním Apachi:
   ```bash
   rm -rf /tmp/stara && mkdir /tmp/stara && git archive ffe47d2 odmeny | tar -x -C /tmp/stara
   sudo rm -rf /var/lib/odmeny /var/www/odmeny
   sudo bash /tmp/stara/odmeny/deploy/install.sh        # stará verze 1.0
   node odmeny/tests/e2e_upgrade.js old                 # vytvoří data ve staré verzi
   sudo ODMENY_FORCE=1 bash odmeny/deploy/install.sh    # aktualizace na 2.0 (záloha DB!)
   node odmeny/tests/e2e_upgrade.js new                 # data zůstala, nové funkce fungují
   ```
6. Bezpečnostní test: projít API (hlavičky; odpovědi 401, 403, 413, 422, 426; požadavky
   z cizích stránek) a revize `innerHTML` v nových částech.
7. Smazat tento soubor (odemkne instalaci), commit, push a uživateli poslat příkazy pro
   server: `git fetch` + `checkout` větve a `sudo bash odmeny/deploy/install.sh`.

## Rozhodnutí a poznámky

- HTTPS na serveru řeší přímo Apache (uživatel potvrdil), takže užší důvěra
  k `X-Forwarded-Proto` nic nerozbije.
- Úroveň ve starších měsících profilu: podle zařazení uloženého při potvrzení výdeje,
  jinak podle zařazení platného na konci měsíce. Pravidla pozic (tabáky, srážky) se berou
  dnešní.
- Údaj „kdo“ v historii změn zapisuje prohlížeč, kdo má platnou kartičku, ho tedy může
  podvrhnout. Server nezávisle eviduje kartičku u každé verze (Historie verzí).
- Kdo má během aktualizace otevřenou starou stránku, dostane při ukládání výzvu k obnovení
  (odpověď 426). Jeho neuložené změny z posledních vteřin se ztratí.
- Drobnost k doladění: druhý řádek hlavičky matice (sticky) má napevno odsazení 35 px.
