# Odměny, verze 2

Hodnocení operátorů (tabáky a Kafe) jako samostatná aplikace na serveru. **Verze 2 běží na
adrese `/odmeny_v2/`, vedle ostré verze na `/odmeny/`**, která zůstává beze změny. S Trading
Deskem sdílí jen server: má vlastní adresář, vlastní data i vlastní přihlašování.

Vychází z `hodnoceni-operatoru.html`. Výpočty jsou převzaté beze změny
(`private/core.js`, opravy jsou v kódu označené „Oprava:“), rozhraní je nové.

## Verze 2 vedle ostré verze

- **Ostrá verze `/odmeny/`** běží dál tak, jak je. Instalace verze 2 její kód
  (`/var/www/odmeny`), data (`/var/lib/odmeny`) ani konfiguraci Apache (`odmeny.conf`) nemění.
  Její zdrojový kód je v historii gitu (verze 1.0 = commit `ffe47d2`), v aktuální větvi už není.
- **Verze 2 `/odmeny_v2/`** má vlastní kód (`/var/www/odmeny_v2`), vlastní šifrovaná data
  (`/var/lib/odmeny_v2`), vlastní konfiguraci Apache (`odmeny_v2.conf`) a vlastní přihlášení.
  Zapamatované zařízení s PINem si každá verze drží zvlášť, takže si PINy nepřepisují.
- **Data:** verze 2 začne buď prázdná (nová kartička kódem z instalace), nebo s **kopií
  ostrých dat** (`ODMENY_KOPIE=1`, viz níže). Kopie převezme kartičky i historii verzí, takže
  se přihlásíš stejnou kartičkou. Ostrá databáze se při kopírování jen čte.
- Změny ve verzi 2 se do ostré verze **nepropisují** a naopak. Verze 2 je na zkoušení; až se
  osvědčí, domluvíme převod (čerstvá kopie dat a přepnutí adresy).
- V aplikaci i na přihlašovací obrazovce je vidět „verze 2“, ať se okna nepletou.

## Zabezpečení

- **Přístup jen s kartičkou.** Při prvním spuštění aplikace vytvoří přístupovou
  kartičku s QR kódem. Klíč z kartičky se nikam neposílá: prohlížeč z něj odvodí
  otisk pro přihlášení a klíč, kterým odemkne data. Kartičku jde naskenovat
  kamerou, nahrát fotku, nebo klíč opsat (překlep v klíči aplikace pozná).
- **Data jsou šifrovaná v prohlížeči** (AES-256-GCM). Server dostane i uloží jen
  šifrovaný blok. Kdo získá databázi ze serveru, bez kartičky nic nepřečte.
- **Zapamatované zařízení s PINem.** Po přihlášení kartičkou si zařízení může
  pamatovat šestimístný PIN. Klíč k datům se skládá z tajemství v prohlížeči,
  tajemství na serveru a PINu; server vydá svou část jen po ověření PINu. Po pěti
  chybných PINech server zařízení smaže.
- **Relace** platí nejvýš 12 hodin a končí po hodině nečinnosti. Aplikace se sama
  zamkne po nastavené době (výchozí 15 minut) a po obnovení stránky chce znovu PIN
  nebo kartičku. Klíč k datům je jen v paměti otevřené stránky.
- **Kód aplikace** (`private/`) server vydá až po odemčení. Zamčená stránka
  neobsahuje nic z aplikace.
- Přísná bezpečnostní politika stránky (žádné cizí ani vložené skripty), ochrana
  proti požadavkům z cizích stránek, omezení počtu pokusů, HTTPS povinné.
- **Ztráta kartičky:** v Nastavení → Zabezpečení ji zruš. Přestane platit a odeberou
  se i zařízení, která se přes ni zapamatovala. Pozor: když ztratíš všechny
  kartičky a nemáš zapamatované zařízení, k datům se už nedostane nikdo, ani správce
  serveru. Vytiskni si proto dvě kartičky a jednu ulož bokem.

## Co je nového ve verzi 2.1

- **Navýšení platu podle úrovně.** U každé úrovně pozice jde nastavit navýšení platu v %
  a podmínky, které je potřeba za měsíc splnit: docházka, plnění normy a využití fondu
  (každá v %, prázdná se nehlídá). Člověk dostane navýšení své úrovně, když splní všechny
  její podmínky; když ne, platí nejvyšší nižší úroveň, jejíž podmínky splnil. V přehledu
  je sloupec **Plat**, v rozpadu člověka ukazatele proti podmínkám a co chybí; profil ukazuje
  navýšení a ukazatele po měsících; vše jde i do Excelu.
  - Docházka = odpracované hodiny ve všední dny (nejvýš celá směna) z fondu hodin měsíce.
  - Plnění normy = normovaný čas ÷ skutečně strávený čas z evidence práce (jen řádky, kde je
    obojí); rychlejší než norma = přes 100 %.
  - Využití fondu = čas strávený nad zakázkami ÷ hodiny v práci podle docházky.
- **Evidence práce se stráveným časem a normou.** Při prvním importu se vybere, co je ve
  kterém sloupci (zaměstnanec, datum, kusy, strávený čas, norma v minutách, norma za řádek
  nebo za kus); aplikace sloupce odhadne podle hlavičky a ukáže náhled. Volba se zapamatuje
  a soubory se stejnou hlavičkou se načtou rovnou. Čas může být v minutách, hodinách, ve tvaru
  1:30 nebo v časovém formátu Excelu. Starý formát (jméno C, datum D, kusy E) funguje dál.
- **ID zaměstnanců.** Evidence práce může místo jmen obsahovat ID. Seznam „kdo má jaké ID“
  se nahraje v Nastavení → ID pro evidenci práce (tabulka se jménem a ID; předvyplněný
  seznam lidí jde stáhnout), ID jde zadat i u člověka v části Lidé a je i v exportu zařazení.
  Neznámé ID se ukáže ve Výrobě jako nespárované a ruční spárování ho uloží k člověku.
- **Pozice jen s Kafe.** Zaškrtávátko „Jen Kafe, bez tabáků“ u pozice: lidé na ní tabáky
  nedostávají (ani ruční úpravou), Kafe a navýšení platu se hodnotí normálně.
- **Pravidla do PDF.** Tlačítko v části Pozice stáhne PDF s pravidly hodnocení: jak se počítají
  tabáky, absence, Kafe a navýšení platu, a u každé pozice úrovně, tabáky, navýšení a podmínky.
  PDF vzniká v prohlížeči (data jsou šifrovaná, server je nevidí).
- **Oprava historie změn:** ruční úprava hned po importu (do vteřiny) se do historie
  nezapsala; hromadné změny se teď ukládají hned a samostatně.
- **Aktualizace bez ztráty dat:** všechna data z 2.0 zůstanou, nové volby mají výchozí
  hodnoty (s tabáky, bez navýšení). Stránka otevřená ještě ve verzi 2.0 už nesmí uložit
  (nová pole by zahodila) a vyzve k obnovení.

## Co je nového ve verzi 2.0

- **Osobní nastavení pohledu.** Vybrané období, filtry a řazení přehledu, skryté
  sloupce, filtr sankcí, oddělení v matici, období v profilu a doba zamčení si aplikace
  pamatuje zvlášť pro každou kartičku (šifrovaně na serveru). Kdo si změní filtr,
  nezmění ho ostatním.
- **Poslední změny.** Ikona hodin v horní liště ukáže historii úprav: kdo (podle
  kartičky), co a kdy změnil – zařazení a úrovně, sankce, ruční úpravy, výdej, importy,
  pozice i nastavení. Červené číslo = nové změny od ostatních od posledního otevření
  historie (u nové kartičky od jejího vydání). Opakovaná úprava téže věci během pár
  minut se sloučí do jednoho záznamu „původně → teď“.
- **Matice dovedností** (nabídka Dovednosti). Lidé podle oddělení a jejich úroveň na
  každé pozici (čtvrtinové kroužky 1–4). Kromě hlavní pozice jde evidovat i zaučení na
  dalších pozicích (kliknutím v matici nebo v detailu člověka) – tabáky to nemění.
  Oddělení se nastaví u pozice. Export do Excelu (list za každé oddělení + popis úrovní)
  a tisk.
- **Profil člověka.** Docházka, výroba, úroveň, sankce, tabáky a výdej po měsících za
  vybraný měsíc, 3/6/12 měsíců, rok, celou historii nebo vlastní období od–do. Grafy,
  tabulka s rozpadem po dnech, historie zařazení a změn, export do Excelu a tisk.
  Otevře se tlačítkem „Profil a historie“ u člověka, v přehledu, z matice nebo z historie.
- **Bezpečnost:** hlavička `X-Forwarded-Proto` se bere v potaz jen od proxy na stejném
  stroji a „místní vývoj“ už nejde předstírat hlavičkou `Host`; menší limity velikosti
  požadavků bez přihlášení; stará otevřená stránka (před aktualizací) už nesmí uložit
  data a dostane výzvu k obnovení stránky; ochranné hlavičky dostanou i statické soubory
  (instalace zapne modul Apache `headers`).

## Instalace na server (Ubuntu + Apache)

```bash
cd /root/trading_desk
git pull origin claude/elegant-clarke-vl5n7d
sudo ODMENY_KOPIE=1 bash odmeny_v2/deploy/install.sh    # verze 2 s kopií ostrých dat
```

Pak otevři `https://<server>/odmeny_v2/` a přihlas se stejnou kartičkou jako do `/odmeny/`
(PIN si na zařízení nastavíš znovu, verze 2 má zařízení zvlášť).

Bez `ODMENY_KOPIE=1` začne verze 2 prázdná: instalace vypíše **kód pro první spuštění**,
zadáš ho na `https://<server>/odmeny_v2/` a vytvoříš novou kartičku. Kód jde vypsat znovu
(dokud neexistuje žádná kartička):

```bash
sudo runuser -u www-data -- env ODMENY_DATA_DIR=/var/lib/odmeny_v2 php /var/www/odmeny_v2/bin/setup-token.php
```

**Čerstvá kopie ostrých dat** kdykoli později: stejný příkaz s `ODMENY_KOPIE=1`. Dosavadní
data verze 2 se nejdřív zazálohují do `/var/lib/odmeny_v2/backups/` a pak je nahradí kopie.

### Aktualizace verze 2 (data zůstanou)

```bash
cd /root/trading_desk
git pull origin claude/elegant-clarke-vl5n7d
sudo bash odmeny_v2/deploy/install.sh
```

Skript pozná existující data, **nejdřív zazálohuje databázi** do `/var/lib/odmeny_v2/backups/`
(drží posledních 10 záloh), pak vymění jen kód aplikace v `/var/www/odmeny_v2`. Data
v `/var/lib/odmeny_v2` nemění; nové tabulky si databáze doplní sama a starší data se převedou
při prvním otevření. Kdo měl aplikaci během aktualizace otevřenou, dostane výzvu k obnovení
stránky.

Vrácení databáze verze 2 ze zálohy (jen kdyby něco selhalo):

```bash
sudo ls /var/lib/odmeny_v2/backups/
sudo cp /var/lib/odmeny_v2/backups/odmeny-RRRRMMDD-HHMMSS.sqlite3 /var/lib/odmeny_v2/odmeny.sqlite3
sudo rm -f /var/lib/odmeny_v2/odmeny.sqlite3-wal /var/lib/odmeny_v2/odmeny.sqlite3-shm
sudo chown www-data:www-data /var/lib/odmeny_v2/odmeny.sqlite3
```

- Aplikace: `/var/www/odmeny_v2`, šifrovaná data: `/var/lib/odmeny_v2` (SQLite).
- Apache: `/etc/apache2/conf-available/odmeny_v2.conf` (z `deploy/apache-odmeny_v2.conf`).
- Aplikace běží jen přes HTTPS (šifrování v prohlížeči bez něj nefunguje).
- `odmeny/deploy/install.sh` (instalace ostré verze) v aktuální větvi není, ostrou verzi
  tak nejde omylem přepsat.

## Zálohy a historie

- Před každou aktualizací aplikace se databáze zazálohuje do `/var/lib/odmeny_v2/backups/`.
- Každé uložení je nová verze. Server drží posledních 30 uložení a k tomu stav
  z každé hodiny za poslední týden a z každého dne před tím (nejvýš 150 verzí).
  Vrátit jde v Nastavení → Data a zálohy → Historie verzí.
- **Šifrovaná záloha** (`.odmeny`) otevře kterákoli platná kartička, i na novém
  serveru (při prvním spuštění „Obnovit ze šifrované zálohy“).
- Záloha JSON z původní aplikace se načte přes „Načíst data z původní aplikace“.

## Rozdíly proti původní aplikaci

- Kódy nepřítomnosti se porovnávají bez ohledu na diakritiku (OČR = OCR).
- Každá sankce strhne aspoň jeden tabák (dřív při více sankcích v měsíci jen jeden
  za všechny dohromady).
- CSV v UTF-8 se čte správně (dřív rozbitá diakritika), Windows-1250 dál funguje.
- Když soubor nejde přečíst, aplikace to řekne (dřív se neukázalo nic).
- Před přepsáním už nahrané docházky se aplikace zeptá.
- Export do Excelu nespustí vzorce z buněk (=, +, −, @).
- Načítaná data (zálohy, import) se kontrolují a čistí.

## Vývoj a testy

```bash
# lokální server (bez HTTPS jen na 127.0.0.1)
ODMENY_DATA_DIR=/tmp/odmeny php -S 127.0.0.1:8490 -t odmeny_v2 odmeny_v2/dev-router.php

# testy: server, šifrovaný tok, výpočty proti původní aplikaci, kopie ostrých dat
python3 -m unittest discover -s odmeny_v2/tests
node odmeny_v2/tests/test_core.js
```

Průchody v prohlížeči (Playwright) na čistých datech lokálního serveru, návod je
v hlavičce každého skriptu:

- `tests/e2e_browser.js`: celá aplikace (první spuštění, import, zařazení, sankce, výdej,
  zálohy, mobil, tmavý režim);
- `tests/e2e_v2.js`: novinky 2.0 (osobní nastavení dvou kartiček, historie změn
  s odznakem, matice, profil, export);
- `tests/e2e_v21.js`: novinky 2.1 (seznam ID, evidence práce s ID, časem a normou a výběr
  sloupců, navýšení platu, jen Kafe, PDF s pravidly, historie, mobil).

**Verze 2 vedle ostré verze** na lokálním Apachi v kontejneru (maže lokální `/var/lib/odmeny*`
a `/var/www/odmeny*`, **nikdy ne na ostrém serveru**). Ověří, že instalace ostrou verzi
nezmění (kód, konfigurace i databáze bajt po bajtu), že kopie dat sedí, že verze 2 nad
zkopírovanými daty umí všechny novinky a že si verze nepletou data ani PINy:

```bash
rm -rf /tmp/v10 && mkdir /tmp/v10 && git archive ffe47d2 odmeny | tar -x -C /tmp/v10
sudo rm -rf /var/lib/odmeny /var/www/odmeny /var/lib/odmeny_v2 /var/www/odmeny_v2
sudo bash /tmp/v10/odmeny/deploy/install.sh                     # ostrá verze 1.0 na /odmeny/
BASE=http://127.0.0.1/odmeny/ node odmeny_v2/tests/e2e_upgrade.js old     # data ve verzi 1.0
node odmeny_v2/tests/e2e_vedle.js instalace                     # verze 2 s kopií dat
BASE=http://127.0.0.1/odmeny_v2/ node odmeny_v2/tests/e2e_upgrade.js new  # data a novinky ve verzi 2
node odmeny_v2/tests/e2e_vedle.js oddeleni                      # ostrá verze beze změn, PINy zvlášť
```

Proměnné pro skripty: `PW` (cesta k Playwrightu), `S` (pracovní adresář pro snímky a klíč).
`tests/e2e_upgrade21.js` je historický test aktualizace 2.0 → 2.1 na místě (`/odmeny/`)
z doby před oddělením verze 2.

Rozpracovanou verzi jde zamknout souborem `odmeny_v2/ROZPRACOVANO.md`: dokud existuje,
`deploy/install.sh` ji odmítne nainstalovat (přebije jen `ODMENY_FORCE=1`).

Knihovny: QR kódy (qrcode-generator, MIT), čtení QR (jsQR, Apache 2.0), Excel
(SheetJS, Apache 2.0), PDF (jsPDF, MIT), písma IBM Plex a Barlow (SIL OFL; pro PDF
podmnožina IBM Plex Sans v TTF). Vše je přibalené,
aplikace nic nenačítá z cizích serverů.
