# Odměny, verze 2

Hodnocení operátorů (tabáky a Kafe) jako samostatná aplikace na serveru. **Verze 2 běží na
adrese `/odmeny_v2/`, vedle ostré verze na `/odmeny/`**, která zůstává beze změny. S Trading
Deskem sdílí jen server: má vlastní adresář, vlastní data i vlastní přihlašování.

Vychází z původní aplikace `hodnoceni-operatoru.html` (pro porovnání výpočtů je v `tests/`).
Výpočty jsou převzaté beze změny (`private/core.js`, opravy jsou v kódu označené „Oprava:“),
rozhraní je nové.

Tři oddělené projekty, každý ve vlastním repozitáři:

| projekt | repozitář | adresa |
|---|---|---|
| Trading Desk | [`ecko456/trading_desk`](https://github.com/ecko456/trading_desk) | `/trading/` |
| Odměny, ostrá verze 1.0 | [`ecko456/odmeny`](https://github.com/ecko456/odmeny) | `/odmeny/` |
| **Odměny, verze 2 (tady)** | [`ecko456/odmeny_v2`](https://github.com/ecko456/odmeny_v2) | `/odmeny_v2/` |

## Verze 2 vedle ostré verze

- **Ostrá verze `/odmeny/`** běží dál tak, jak je. Instalace verze 2 její kód
  (`/var/www/odmeny`), data (`/var/lib/odmeny`) ani konfiguraci Apache (`odmeny.conf`) nemění.
  Její kód je v repozitáři `odmeny` (a tady v historii jako commit `db14339`).
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
- **Přeformulování textu (✦) je jediná výjimka**: když v případu Top 5 klikneš na
  „Přeformulovat“ a vybereš části (kroky 1–4), odejde text jen těch částí přes server do
  API Anthropicu (Claude Sonnet 5.5). Jména lidí z evidence prohlížeč předtím nahradí
  značkami `[osoba 1]`; odpovědné osoby, termíny ani údaje o dílu se neposílají. Server
  text neukládá ani nezapisuje do logu, v databázi je jen počet volání kvůli limitu. Bez
  klíče k API je funkce vypnutá a tlačítko se neukáže.

## Co je nového ve verzi 2.12

- **Srážky ze mzdy za neproduktivitu.** V Matici dovedností → Skupiny a pravidla jde
  u vybraných skupin zapnout **Srážky za neproduktivitu**. Nastaví se pásma plnění normy
  a srážka ze mzdy, například:
  - plnění normy do 50 % → srážka 50 % ze mzdy;
  - nad 50 do 60 % → srážka 25 % ze mzdy;
  - nad posledním pásmem srážka není.
- Platí nejnižší pásmo, do kterého plnění spadá (hranice „do X %“ včetně). Pásmo jde přidat,
  upravit i smazat. U pravidla se nastaví, od kterého měsíce platí.
- Plnění normy se bere z evidence práce (normovaný čas ÷ strávený čas). Bez údaje o normě
  srážka není.
- Benefity (tabáky, Kafe, prémie) se nekrátí, srážka se zpracuje ve mzdách:
  - týden před koncem měsíce se objeví v upozornění „Zpracuj srážky ze mzdy“ spolu
    s ručními srážkami, se štítkem „automaticky“;
  - „Srážka zpracována“ uloží procento a plnění normy v tu chvíli, pozdější změna evidence
    nebo pásem už zpracovanou srážku nezmění. Zpracování jde zrušit.
- V přehledu je sloupec **Srážka ze mzdy** (jen když ji má nějaká skupina zapnutou) a stejný
  údaj je v exportu do Excelu. U člověka v Lidech je karta se srážkou za vybraný měsíc.
  Pásma jsou i v pravidlech do PDF a v exportu zařazení.
- Stránka otevřená ještě ve verzi 2.11 po aktualizaci nic neuloží a vyzve k obnovení.

## Co je nového ve verzi 2.11

- **Varianty prémie se zaškrtávanými podmínkami.** V Matici dovedností → Skupiny a pravidla
  má každá skupina **varianty prémie** (dřív „stupně“). U každé varianty se zaškrtne, co musí
  člověk za měsíc splnit, a u zaškrtnuté podmínky se nastaví hodnota:
  - plnění normy aspoň X %;
  - **bezproblémové kontroly**: provedené namátkové kontroly v měsíci nejvýš s X nálezy
    (výchozí 0; bez kontroly v měsíci je podmínka splněná);
  - docházka aspoň X %, absence nejvýš X dní, víkendové směny aspoň X, využití fondu aspoň X %;
  - **pracovní morálka**: posoudí vedoucí. Platí, dokud ji u člověka a měsíce neoznačí jako
    nesplněnou. Jedno označení platí pro všechny varianty;
  - všechny dovednosti skupiny aspoň na úrovni X.
- **Vybrané dovednosti s úrovní.** U varianty jdou zaškrtnout konkrétní dovednosti skupiny,
  každá s vlastní úrovní 1–4. Pod nimi jsou i dovednosti z jiných skupin (zaučení).
- Další body vedoucího (vlastní text) zůstávají, stejně jako odměna (navýšení mzdy, jiná
  odměna) a nárok po několika měsících v řadě.
- Platí nejvyšší varianta, kterou člověk za měsíc splnil, stejně jako dřív.
- **Převod při aktualizaci:** bod vedoucího „Dodržování řádné pracovní morálky“ ze starších
  stupňů se změní na zaškrtnutou pracovní morálku. Označení „nesplněno“ i s důvodem se
  převede. Ostatní vlastní body zůstanou, jak jsou.
- Stránka otevřená ještě ve verzi 2.10 po aktualizaci nic neuloží a vyzve k obnovení.

## Co je nového ve verzi 2.10.1

- **Matice dovedností po odděleních.** Na záložce Matice už nejsou všechny skupiny vedle sebe
  v jedné široké tabulce. Každé oddělení má vlastní kartu a karty jsou pod sebou.
  - V hlavičce karty je název oddělení, jeho skupiny a vedoucí. Vedle jsou souhrnná čísla:
    počet lidí, zaučení z jiných oddělení, průměr dovedností a kolik dovedností má na úrovni
    3–4 méně než 2 lidi.
  - Tabulka má jen dovednosti daného oddělení. Lidé odjinud, kteří v nich mají hodnocení,
    jsou v ní se štítkem „zaučení“.
  - Pod tabulkou je pokrytí po směnách a celkem. Když je v oddělení jen jedna směna, řádek za
    směnu se neopakuje.
  - Sloupce mají ve všech kartách stejnou šířku, takže jsou pod sebou zarovnané.
- **Filtr** nabízí všechna oddělení, celé oddělení (když má víc skupin) nebo jednu skupinu.
  S filtrem směny se ukážou jen oddělení, kde na směně někdo je.
- Pás „Vedoucí oddělení“ nad maticí nahradila jména vedoucích v hlavičce každého oddělení.
- Data se nemění.

## Co je nového ve verzi 2.10

- **Dovednosti vedoucích.** Vedoucí pracovníci mají vlastní seznam dovedností, **stejný pro
  všechny vedoucí**. Každý vedoucí má u každé dovednosti svou úroveň **0–4 podle standardního
  schématu** (žádná, základní, střední, pokročilá, odborná úroveň).
  - Seznam se spravuje v Matici dovedností na nové záložce **Vedoucí**: přidat, upravit
    název a popis, změnit pořadí, smazat (smazáním zmizí i hodnocení u všech vedoucích).
  - Na stejné záložce je **matice vedoucích**: kliknutím do buňky se úroveň zvedne o jedna
    (po 4 zase 0), u každého je oddělení a průměr v procentech (každá úroveň 25 %).
  - Hodnotit jde i v detailu vedoucího v Lidech (karta Dovednosti vedoucího, tlačítko
    Upravit seznam vede na záložku Vedoucí).
  - Do tabáků, Kafe, prémií ani kapacity směn se dovednosti vedoucích nepočítají.
  - Excel matice má nový list **Vedoucí**, změny jsou v historii změn.
- Stránka otevřená ještě ve verzi 2.9 po aktualizaci nic neuloží a vyzve k obnovení.

## Co je nového ve verzi 2.9

- **Plánovaná kapacita skupiny.** V Matici dovedností → Skupiny a pravidla jde u skupiny
  zaškrtnout **Plánovaná kapacita** a zadat, kolik zvládne jeden člověk za směnu, v **kusech**
  nebo v **hodinách** (např. 25 ks, nebo 7,5 h).
  - Hned pod tím se ukáže, kolik skupina zvládne **na ranní, na odpolední, za den a za týden**,
    pro tento a příští týden podle střídání skupin (ranní = stálá ranní + skupina s ranní,
    odpolední = stálá odpolední + druhá skupina; týden = den × pracovní dny bez svátků).
  - Totéž je u skupiny v reportu Směny a kapacita a v jeho PDF.
- **Nemoc.** U člověka v Lidech jde zaškrtnout **Nemoc**: dočasně se nepočítá do kapacit
  (dovednosti po směnách i plánovaná kapacita). V seznamu lidí a v matici je u něj
  „nemoc“, v reportu kapacit dlaždice s počtem nemocných. Po odškrtnutí se zase počítá.
- Stránka otevřená ještě ve verzi 2.8 po aktualizaci nic neuloží a vyzve k obnovení.

## Co je nového ve verzi 2.8

- **Nová směna Stálá odpolední.** Vybírá se u člověka v Lidech stejně jako ostatní směny
  (a jde i přes import zařazení, stačí napsat „stálá odpolední“).
  - V Matici dovedností má vlastní oddíl za stálou ranní a jde podle ní filtrovat.
- **Směny a kapacita po týdnech.** Skupiny 1 a 2 se střídají po týdnu. V reportu jednou
  nastavíš, která skupina má **tento týden ranní**, a report pak místo variant A/B ukazuje
  **tento a příští týden** se sloučenými směnami: ranní = stálá ranní + skupina, která má
  ranní; odpolední = stálá odpolední + ta druhá. Stejně v PDF a v seznamu rizik
  („odpoledne bez schopného člověka“). Bez nastavení se ukážou obě varianty jako dřív.
- Stránka otevřená ještě ve verzi 2.7 po aktualizaci nic neuloží a vyzve k obnovení.

## Co je nového ve verzi 2.7

- **Vedoucí pracovníci v Lidech.** Při **Přidat člověka** jde zaškrtnout **Vedoucí
  pracovník** a hned vybrat oddělení, která má na starosti. Z běžného člověka se vedoucí
  udělá přepínačem v jeho detailu (a stejně se to vrátí).
  - Vedoucí se nepočítá do tabáků, Kafe, prémií ani sankcí a není v přehledu, výrobě,
    kontrolách ani v kapacitě směn.
  - V Lidech má vlastní oddíl **Vedoucí pracovníci**; u každého se zaškrtávají oddělení.
  - V **Matici dovedností** je nad tabulkou pás **Vedoucí oddělení** (i při filtru skupiny,
    v tisku a v Excelu). Oddělení bez vedoucího ukáže „bez vedoucího“.
  - Export a import zařazení mají sloupec **Vedoucí oddělení** (oddělení oddělená čárkou,
    „ano“ = vedoucí bez oddělení, prázdné = není vedoucí).
  - Když se oddělení u skupiny přejmenuje, vedoucí ho má zaškrtnuté dál.
- Stránka otevřená ještě ve verzi 2.6 po aktualizaci nic neuloží a vyzve k obnovení.
- Jednoduché dialogy (např. Nová skupina) mají zase normálně orámované textové pole.

## Co je nového ve verzi 2.6

- **Přeformulovat vše, nebo jen vybrané části.** Tlačítko ✦ je teď pod krokem 4 případu.
  Po kliknutí vybereš, co se má přeformulovat: Proč se to stalo, Co s tím jde dělat, Co
  jde udělat hned a Co si vyžádá procesní čas (u opatření se posílá jen jejich text, každé
  zvlášť). Vše jde jedním voláním.
  - Návrh se ukáže po částech vedle původního textu; každou část jde ještě upravit nebo
    odškrtnout. **Použít vybrané** zapíše jen zaškrtnuté části (do historie případu stejně
    jako ruční úprava), **Zahodit** nic nezmění.
  - Co jsi během čekání na návrh sám přepsal, se nepřepíše.
  - Jedna část nejvýš 2000 znaků, všechny vybrané dohromady 6000.
- **Zrušený případ jde smazat natrvalo** (v detailu případu, nebo v seznamu Zrušené).
  Zmizí ze seznamu případů, souhrnů, termínů, PDF i z vydaných týdenních reportů (položka
  v žebříčku tam zůstane, jen bez odkazu na případ) a nikde se už nepočítá. V historii
  změn zůstane jen záznam, kdo ho kdy smazal; vrátit ho jde obnovením starší verze dat.
  Číslo smazaného případu se znovu nepoužije.
- Stránka otevřená ještě ve verzi 2.5 po aktualizaci nic neuloží a vyzve k obnovení.

## Co je nového ve verzi 2.5

- **Přeformulování příčiny v Top 5.** U pole „Proč se to stalo“ je tlačítko
  **✦ Přeformulovat** (od 2.6 pod krokem 4 pro všechny části, viz výše). Claude Sonnet 5.5 zkontroluje pravopis a přepíše text do věcné,
  profesionální češtiny pro auditora; fakta, čísla, EAN a názvy nechá, nic nepřidá.
  - Odejde **jen text toho pole**, nic dalšího z aplikace. Jména lidí z evidence se
    předtím nahradí značkami (i ve skloňovaných tvarech) a v návrhu se vrátí zpátky.
  - Návrh se ukáže vedle původního textu; jde ho ještě upravit. **Použít** ho uloží
    (a zapíše do historie případu), **Zahodit** nic nezmění.
  - Limit 30 použití za hodinu na kartičku a 300 za den na celou aplikaci. Jedno
    použití stojí zhruba desetník (Sonnet 5.5: 2 $ za milion tokenů vstupu, 10 $ výstupu).
  - Funkce je vypnutá, dokud na server neuložíš klíč k API (viz níže).

**Zapnutí:** klíč k API vytvoříš na console.anthropic.com (samostatný účet s předplaceným
kreditem, předplatné Claude.ai API nezahrnuje). Na serveru ho ulož příkazem níže (klíč se
při psaní nezobrazuje) a vyzkoušej:

```bash
sudo runuser -u www-data -- env ODMENY_DATA_DIR=/var/lib/odmeny_v2 php /var/www/odmeny_v2/bin/ai-key.php
sudo runuser -u www-data -- env ODMENY_DATA_DIR=/var/lib/odmeny_v2 php /var/www/odmeny_v2/bin/ai-key.php --test
```

Vypnutí: stejný příkaz s `--smazat`, stav: `--stav`. Klíč leží v
`/var/lib/odmeny_v2/anthropic-api-key` (práva jen pro www-data, z webu nedostupný). Po uložení
klíče se stačí v aplikaci znovu přihlásit.

## Co je nového ve verzi 2.4

- **Matice dovedností místo Pozic.** Část Pozice zmizela, všechno je v Matici dovedností
  (záložky Matice, Skupiny a pravidla, Směny a kapacita).
  - **Skupina** má název, oddělení, maximum tabáků za dovednosti, pravidla docházky a stupně
    prémie. Tlačítkem **Přidat dovednost** se zadá název, popis a hodnoticí schéma 0–4
    (standardní: Žádná, Základní, Střední, Pokročilá a Odborná úroveň; jde upravit).
  - **Tabáky za dovednosti**: každá úroveň je 25 % (0 = 0 %, 4 = 100 %), procento skupiny je
    průměr všech jejích dovedností (dvě dovednosti, jedna na 4 = 50 %). Tabáky = maximum
    skupiny × procento, zaokrouhleno na celé.
  - **Docházka** jako dřív: srážka za absenci nad limit (např. 3 dny −1, 4 dny −2, 5 dnů −3)
    a bonus za víkendy (např. 2 víkendy +1, 4 víkendy +2). Kdo si absenci nadělá víkendem,
    srážku nemá, ale bonus za ten víkend nedostane.
  - **Prémie**: stupně s podmínkami za měsíc (všechny dovednosti skupiny aspoň na úrovni,
    absence v pracovní dny nejvýš, víkendové směny aspoň, plnění normy, docházka, využití fondu
    a body, které posuzuje vedoucí, např. pracovní morálka) a odměnou (navýšení mzdy v % nebo
    jiná odměna). Platí nejvyšší splněný stupeň. Stupeň může dávat nárok po několika měsících
    v řadě (např. 4 měsíce Extra bonusu = možnost 2. platové třídy). Body vedoucího platí jako
    splněné, dokud je u člověka a měsíce neoznačí jako nesplněné.
  - **Směna** u každého člověka: Stálá ranní, Směnnost – skupina 1, Směnnost – skupina 2.
    Matice jde filtrovat podle skupiny a směny a ukazuje, kolik lidí na které směně zvládá
    dovednost aspoň na úrovni 3.
  - **Směny a kapacita**: upravitelný report (výběr skupin, práh úrovně, vyřazené dovednosti,
    závěr) s porovnáním variant: ráno stálá ranní + skupina 1 proti odpoledni skupiny 2,
    a naopak. Tisk i PDF.
  - Hodnocení dovedností se zadává u člověka v Lidech nebo kliknutím přímo v matici. Excel
    zařazení má list s hodnocením dovedností a jde zase načíst.
- **Převod bez ztráty dat**: každá pozice se převedla na skupinu s jednou dovedností stejného
  jména, jejíž úrovně 1–4 jsou původní úrovně pozice. Úroveň člověka = hodnocení té dovednosti,
  maximum = tabáky nejvyšší úrovně, strop jako dřív a navýšení platu u úrovní = stupně prémie.
  Tabáky, Kafe i navýšení proto vycházejí stejně. U každého člověka je navíc okno **Původní
  zařazení z verze 2.3** (pozice, úroveň, tabáky, zaučení) s tlačítkem **Převedeno do nové
  verze, smazat**; zmizí, až ho vedoucí smaže, a záznam zůstane v historii změn.
- **Sankce**: procento srážky je posuvník 5–50 % po 5 %. Nová volba **Srážka ze mzdy**:
  benefity (tabáky a Kafe) se nekrátí, ale týden před koncem měsíce sankce se objeví
  upozornění se seznamem lidí. U každého se odklikne **Srážka zpracována**; když jsou
  zpracované všechny, upozornění zmizí.
- **Top 5 do PDF**: souhrn i PDF případu ve dvou verzích, kompletní a **osekaná** (bez
  historie případu). Nahoře „Top 5 nejméně efektivně“, bez řádku pro zpracovatele, datum
  a podpis, bez slova Odměny a u stavu jen datum. Osekaná verze jde auditorovi, proto v PDF
  ani v názvu souboru nestojí, že je osekaná (od 2.6).
- **Aktualizace bez ztráty dat:** stránka otevřená ještě ve verzi 2.3 už nesmí uložit
  a vyzve k obnovení.

## Co je nového ve verzi 2.3

- **Namátkové kontroly** (nová část Kontroly v menu).
  - **Nutné úkony**: ke každému oddělení seznam bodů, co musí operátor dělat (přidat,
    upravit, změnit pořadí, smazat). Oddělení je podle pozice (pole Oddělení u pozice, jinak
    název pozice).
  - **Plán na týden dopředu**: z každého oddělení se vybere 25 % lidí (zaokrouhleno nahoru,
    aspoň jeden; podíl jde změnit v Nastavení) a rozloží se postupně do pracovních dnů bez
    státních svátků, lidé z jednoho oddělení na různé dny. Výběr je náhodný, ale přednost mají
    ti, kdo nejdéle nebyli kontrolovaní, takže se za čtyři týdny vystřídají všichni. Vyřazení
    a lidé bez pozice se nekontrolují.
  - **Zápis kontroly**: u každého bodu splněno / nesplněno a poznámka, datum a kdo
    kontroloval. Když člověk chybí: „Neproběhlo“ s důvodem, nebo náhradník z téhož oddělení
    na stejný den. Člověka jde přesunout na jiný den, přidat ručně nebo odebrat; přegenerování
    nahradí jen neprovedené kontroly.
  - **Karta člověka**: v Lidech i v Profilu je karta Namátkové kontroly (počet kontrol,
    plnění bodů, nesplněné body s poznámkou, další naplánovaná kontrola).
  - **Výsledky**: plnění po odděleních, nejčastěji nesplněné body a seznam kontrol za 4 týdny
    až celou dobu; PDF výsledků a PDF plánu týdne s kontrolními listy k tisku (políčka
    splněno / nesplněno a podpisy, zapsané kontroly s výsledkem).
  - Odznak v menu ukazuje dnešní a nezapsané kontroly; vše jde do historie změn.
- Historie změn má filtry Top 5 a Kontroly.
- **Aktualizace bez ztráty dat:** všechna data z 2.2 zůstanou, Kontroly začnou prázdné.
  Stránka otevřená ještě ve verzi 2.2 už nesmí uložit a vyzve k obnovení.

## Co je nového ve verzi 2.2

- **Top 5 nejméně efektivně** (nová část v menu, pro auditora průtoku dílů a dodávek včas).
  - **Týden** (pondělí až neděle): ruční zápis pěti dílů s nejhorším plněním normy. U každého
    se zapíše EAN, název dílu, strávený čas a norma (v hodinách, nebo v minutách podle
    Nastavení modulu, čas jde psát i jako 13:30). Plnění = norma ÷ strávený čas, neplnění =
    100 % − plnění, ztráta = strávený čas nad normou; řádky se seřadí od nejhoršího. Název
    dílu se doplní podle EAN, když už ho aplikace zná.
  - **Případ** ke každému dílu: proč se to stalo (kategorie a popis), co s tím jde dělat,
    co jde udělat hned (okamžitá opatření), co si vyžádá procesní čas (např. žádost
    o pohledovost, přípravek s technologií) s odpovědnou osobou a termínem.
  - **Ověření účinnosti**: 1. ověření 14 dní po dokončení všech opatření, 2. ověření 30 dní
    po prvním (lhůty i cílové plnění jdou změnit, termín jde posunout s důvodem). U ověření
    se zapíše strávený čas a norma za období, plnění se dopočítá. Neúčinné ověření uzavře kolo.
  - **Žádné duplicitní řešení**: jeden díl = jeden případ. Když se díl vrátí do Top 5 nebo
    ověření ukáže, že řešení nestačilo, otevře se v témž případu nové kolo s důvodem.
    Předchozí kola zůstanou vidět („co se už zkoušelo“). Každá změna se zapíše do historie
    případu i do historie změn aplikace (kdo a kdy).
  - **Termíny**: opatření a ověření po termínu, do 7 dní a později; odznak v menu.
  - **PDF pro auditora**: týdenní report (pořadí, ukazatele, řešení u každého dílu, termíny,
    podpisy; vydaný report se uloží a jde znovu stáhnout, změna obsahu zvýší revizi),
    souhrn všech případů (stavy, plnění před a po opatřeních, registr, úspěšnost ověření)
    a PDF jednoho případu s kompletní historií.
  - **Do budoucna z evidence práce**: když import evidence práce obsahuje sloupec EAN,
    týden bez ručního zápisu ukáže výpočet z importu a jde ho jedním tlačítkem převzít
    do zápisu.
- **Oprava importu evidence práce**: ručně vybraný sloupec EAN se v dialogu sloupců nenačetl.
- **Aktualizace bez ztráty dat:** všechna data z 2.1 zůstanou, Top 5 začne prázdný. Stránka
  otevřená ještě ve verzi 2.1 už nesmí uložit (nová data by zahodila) a vyzve k obnovení.

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
git clone https://github.com/ecko456/odmeny_v2.git /root/odmeny_v2
sudo ODMENY_KOPIE=1 bash /root/odmeny_v2/deploy/install.sh    # verze 2 s kopií ostrých dat
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
cd /root/odmeny_v2 && git pull
sudo bash /root/odmeny_v2/deploy/install.sh
```

Když je nová verze zatím jen ve vývojové větvi (napíše ti ji Claude), stáhni ji příkazem
`git pull origin <větev>`.

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
- Instalace ostré verze je jen v repozitáři `odmeny`, odsud ji nejde omylem přepsat.

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
# lokální server (bez HTTPS jen na 127.0.0.1), z kořene repozitáře
ODMENY_DATA_DIR=/tmp/odmeny php -S 127.0.0.1:8490 -t . dev-router.php

# testy: server, šifrovaný tok, výpočty proti původní aplikaci, kopie ostrých dat
python3 -m unittest discover -s tests
node tests/test_core.js
```

Přibalené knihovny serveru (`lib/vendor`: oficiální SDK Anthropicu pro PHP a Guzzle) obnoví
`bash deploy/vendor.sh` podle `lib/composer.lock`; `--update` vezme novější verze.

Průchody v prohlížeči (Playwright) na čistých datech lokálního serveru, návod je
v hlavičce každého skriptu:

- `tests/e2e_browser.js`: celá aplikace (první spuštění, import, zařazení, sankce, výdej,
  zálohy, mobil, tmavý režim);
- `tests/e2e_v2.js`: novinky 2.0 (osobní nastavení dvou kartiček, historie změn
  s odznakem, matice, profil, export);
- `tests/e2e_v21.js`: novinky 2.1 (seznam ID, evidence práce s ID, časem a normou a výběr
  sloupců, navýšení platu, jen Kafe, PDF s pravidly, historie, mobil);
- `tests/e2e_top5.js`: novinky 2.2 (ruční zápis Top 5 týdne, případ, opatření, ověření
  s ručními hodnotami, nové kolo, termíny, vydaný report, souhrn a PDF případu, jednotka
  času, předvyplnění z evidence práce s EAN, mobil, tmavý režim, od 2.6 i smazání zrušeného
  případu natrvalo);
- `tests/e2e_kontroly.js`: novinky 2.3 (nutné úkony, plán 25 % z oddělení, zápis kontroly,
  neproběhlo, náhradník, přesun, ruční přidání, přegenerování, PDF plánu a výsledků, karta
  člověka, výsledky, historie, nastavení, mobil, tmavý režim);
- `tests/e2e_matice.js`: novinky 2.4 (skupiny, dovednosti a schémata, hodnocení u člověka
  i v matici, směny a kapacita, PDF, prémie a body vedoucího, sankce s posuvníkem, srážka ze
  mzdy s upozorněním, od 2.8 stálá odpolední směna a kapacita po týdnech, od 2.9 plánovaná
  kapacita a nemoc, od 2.10.1 oddělení pod sebou a filtr celého oddělení, od 2.11 varianty
  prémie se zaškrtávanými podmínkami a vybranými dovednostmi, od 2.12 srážky ze mzdy za
  neproduktivitu, mobil, tmavý režim);
- `tests/e2e_ai.js`: novinky 2.5 a 2.6 (✦ Přeformulovat s náhradním API Anthropicu:
  tlačítko jen s klíčem, výběr částí, odchází jen jejich text s jmény nahrazenými značkami,
  návrh po částech, Použít vybrané, Zahodit, souběh s ruční úpravou, historie případu, chyba
  služby, mobil, tmavý režim). Server musí běžet s `ODMENY_AI_BASE_URL=http://127.0.0.1:8598`;
- `tests/e2e_vedouci.js`: novinky 2.7 a 2.10 (vedoucí pracovníci: přidání s odděleními,
  oddíl v Lidech, z běžného člověka vedoucí a zpět, mimo přehled a sankce, pás v matici
  i v oddělení při filtru skupiny; dovednosti vedoucích: záložka Vedoucí, přidání, pořadí, přejmenování,
  hodnocení v matici vedoucích i v detailu, list Vedoucí v Excelu; historie změn, mobil,
  tmavý režim).

**Aktualizace na místě** na lokálním Apachi v kontejneru (stará stránka dostane 426, sdílená
data, výpočty a historie zůstanou, novinky se uloží nad převzatými daty). 2.3 → 2.4:

```bash
rm -rf /tmp/v23 && mkdir /tmp/v23 && git archive b7a6f7d | tar -x -C /tmp/v23
sudo rm -rf /var/lib/odmeny_v2 /var/www/odmeny_v2 && sudo bash /tmp/v23/deploy/install.sh
UPGRADE_CMD='bash deploy/install.sh' node tests/e2e_upgrade24.js
```

S `EXPECT_VERSION='2\.12'` jde stejný test pustit na aktualizaci 2.3 → 2.12 (data verze 5 → 13).
Stejně `tests/e2e_upgrade23.js` pro 2.2 → 2.3 (výchozí verze `git archive 28d6bde`)
a `tests/e2e_upgrade22.js` pro 2.1 → 2.2 (`git archive e762813`).

**Verze 2 vedle ostré verze** na lokálním Apachi v kontejneru (maže lokální `/var/lib/odmeny*`
a `/var/www/odmeny*`, **nikdy ne na ostrém serveru**). Ověří, že instalace ostrou verzi
nezmění (kód, konfigurace i databáze bajt po bajtu), že kopie dat sedí, že verze 2 nad
zkopírovanými daty umí všechny novinky a že si verze nepletou data ani PINy:

```bash
rm -rf /tmp/v10 && mkdir /tmp/v10 && git archive db14339 | tar -x -C /tmp/v10
sudo rm -rf /var/lib/odmeny /var/www/odmeny /var/lib/odmeny_v2 /var/www/odmeny_v2
sudo bash /tmp/v10/deploy/install.sh                            # ostrá verze 1.0 na /odmeny/
BASE=http://127.0.0.1/odmeny/ node tests/e2e_upgrade.js old     # data ve verzi 1.0
node tests/e2e_vedle.js instalace                               # verze 2 s kopií dat
BASE=http://127.0.0.1/odmeny_v2/ node tests/e2e_upgrade.js new  # data a novinky ve verzi 2
node tests/e2e_vedle.js oddeleni                                # ostrá verze beze změn, PINy zvlášť
```

Proměnné pro skripty: `PW` (cesta k Playwrightu), `S` (pracovní adresář pro snímky a klíč).
`tests/e2e_upgrade21.js` je historický test aktualizace 2.0 → 2.1 na místě (`/odmeny/`)
z doby před oddělením verze 2. Verze: 1.0 = commit `db14339`, 2.0 = `9f26efa`, 2.1 = `019af97`.

Rozpracovanou verzi jde zamknout souborem `ROZPRACOVANO.md`: dokud existuje,
`deploy/install.sh` ji odmítne nainstalovat (přebije jen `ODMENY_FORCE=1`).

Knihovny: QR kódy (qrcode-generator, MIT), čtení QR (jsQR, Apache 2.0), Excel
(SheetJS, Apache 2.0), PDF (jsPDF, MIT), písma IBM Plex a Barlow (SIL OFL; pro PDF
podmnožina IBM Plex Sans v TTF). Vše je přibalené,
aplikace nic nenačítá z cizích serverů.
