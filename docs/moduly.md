# Odměny verze 2: moduly

Přesunuto z `CLAUDE.md` 13. 11. 2026 (verze 2.79.1) beze změny textu. Popis vznikl s modulem; pozdější
změny jsou v zápisech „Kde jsme skončili“ (`CLAUDE.md`, `docs/historie.md`). Při větší změně modulu
popis tady doplň. Rozcestník modul → soubory je v `CLAUDE.md` (oddíl Moduly).

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
  back (datum vrácení, ne dřív než odeslání), backNote, rej? (vyřazeno servisem s přílohou, 2.56)}`. Protokol se zpětně nemění, evidence ano.

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

## Shortage (verze 2.27, tři kroky a rozbor 2.61, sloupce a Ctrl+V 2.27.1, úpravy položek 2.28, poddíly 2.29, Skrýt v PDF 2.29.1, ruční TOP, plná sestava a filtr operací 2.31, TOP 2 a oddělení 2.32, PDF po odděleních 2.34, doplnit chybějící 2.36, zabalení dne a dny na shortage 2.73, připnout a duplikovat 2.75, průvodce, přednastavení sloupců, 3 záznamy, K prověření a rozdělené sestavy 2.78, skrytí v PDF po odděleních, oddělení poddílu a rámečky záznamů 2.84)

Sloupce (2.27.1): A číslo objednávky, B název dílu, C EAN s vloženým odkazem, D index,
E urgentní množství, F se nečte, G „TOP“ (`/^top\b/i`), H probíhající operace.

Data `S.shortage` (`blankShortage`, čištění `cleanShortage` v `core.js`):

- `lists[≤ 30]`, nejnovější první: `{id 'sh…', at, by, file, sheet, items[≤ 1000]}`; `sheet` je
  název listu jen u sešitu s více listy, vložený seznam má `file` „vloženo ze schránky“;
- seznam má navíc `plan` (2.29): `{file, at, by}` posledního prohledaného výrobního plánu, nebo null;
- `S.shortage.depts` (2.32): oddělení s přiřazenými operacemi, viz „Kde jsme skončili“ 2.32;
- seznam `packed` a `out`, položka `since`, `days`, `again`, `S.shortage.hist` (2.73): zabalený den,
  odbourané položky a dny na shortage, viz „Kde jsme skončili“ 2.73;
- položka `{id, order, name, ean, index, qty, top, top2, op, link, code, note, rec, subs, cands, pdfHide, full, dept}` (`id`, `note`, `rec` od 2.28, `subs` od 2.29, `cands` a `pdfHide` od 2.29.1, `full` od 2.31 = sestava zobrazená plně; `top` jde od 2.31 přepnout ručně; `top2` a `dept` od 2.32, `shSetTier`; `pin` a `dup` od 2.75, jen když jsou): texty tak, jak je ukazuje Excel
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

**2.84.** Skrytí v PDF po odděleních: položka `pdfHideIn` (id oddělení, „?“ K prověření, „-“ Nezařazeno; jen když
je), `pdfHide` dál skrývá všude. Oko u rozdělené sestavy (`shHideBtn(i, {off, dept, name})`, `data-shhidein`)
skryje / odkryje jen v oddělení bloku (`shSetHideIn`; skrytá všude se rozepíše na ostatní oddělení). `shHidIn`,
`shHidDept` (Hotovo podle domovského oddělení), `shPdfBlocks` = `shBlocks` bez položek skrytých v oddělení bloku;
v aplikaci `shPdfShown(l, ops, dsel, asel)` → `{items, secs}` pro `drawShortage` i kontrolu „nic k tisku“.
Oddělení poddílu ručně: poddíl `dept` (id oddělení, „-“ = se sestavou), výběr `[data-shsubdept]` (`shSubDeptSel`,
i v řádku „na jiném oddělení“), `shSubDeptIn(sh, it, x)` (ruční, jinak u ručně zařazené sestavy se sestavou, jinak
podle operace) používají `shSplitDepts`, `shSubHere` a `shAutoDept`. Záznamy: `shRecsHtml` (rámeček `.sh-recs`,
každý záznam na řádku, čárkovaná linka mezi nimi), stav odeslání `.sh-sent.sh-sent-<st>` s `shSentParts`
(hlavní údaj, podrobnost); PDF záznamy po řádcích s čárkovanou linkou (`recs`, `recRowH`) a stav v rámečku (`sentH`).

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

## Skříňky (verze 2.80)

Soupis skříněk spárovaný s Lidmi. Data `S.lockers = {list: []}`, položka `{id: "lk…", row (písmeno řady, velkými,
nejvýš 6 znaků), no (číslo jako text, „012“ → „12“), key (člověk), name (snímek jména, zůstane i po smazání
člověka), gone (jméno člověka, který u nás už nepracuje), raw (jméno, jak bylo napsané v importu), note, at, by}`.
Skříňka se pozná podle řady a čísla, v soupisu je jen jednou. Core `private/core/28-skrinky.js`, obrazovka
`private/app/35-skrinky.js`, CSS na konci `app.css` (Skříňky 2.80).

- **Stavy** (`lkState`): `used` (člověk v Lidech, nevyřazený; `endPast` = konec trestu minul), `unknown` (jméno
  z importu bez člověka, počítá se do obsazených, „z toho nespárováno“), `clear` = K vyklizení (vyřazený ze seznamu,
  smazaný z Lidí, nebo `gone`), `free`. `lkOverview`: počty, řádky, `without` (nevyřazení bez skříňky), `multi`.
- **Vložení z Excelu**: Ctrl+V kdekoli ve Skříňkách (mimo pole), nebo tlačítko Vložit z Excelu (okno s polem,
  tabulka vložená do pole se hned zpracuje; funguje i na telefonu). `shClipRows` (HTML i text), `lkParse`
  (A řada, B číslo, C jméno; nadpis, duplicita, řádek bez čísla). Okno: dlaždice, K rozhodnutí (nejisté, výběr:
  nerozhodnuto = nechat jméno, Už u nás nepracuje → K vyklizení, Volná, Návrh, Ještě bez skříňky, Vyřazení,
  Ostatní), Spárováno automaticky (sbalené, jde změnit), Nahradit celý soupis. Bez zaškrtnutí se přepíšou jen
  skříňky se stejnou řadou a číslem (`lkApply`). Do historie jde jeden záznam (`store.note`).
- **Párování** (`lkMatch`, jen v prohlížeči): slova bez diakritiky, titulů a interpunkce (`endTok`), příjmení
  kdekoli v textu, zbytek proti jménu (jedno písmeno = iniciála), podobnost podle překlepů (`attDist`) i po
  „fonetickém“ srovnání (y/i, w/v, q/k, zdvojená písmena). Jistě: přesně; jen příjmení a v Lidech jediné;
  příjmení a iniciála jednoznačně; překlep se skóre ≥ 0,8, náskokem ≥ 0,12 a příjmením ≥ 0,8. Přesná shoda má
  přednost před překlepem, člověk se jistě spáruje jen jednou (druhý řádek je nejistý s návrhem). Vyřazení jsou
  mezi lidmi k párování (jejich skříňka je K vyklizení). Ruční výběr (`assign`) má přednost.
- **Úpravy**: Přidělit / Změnit (`lkAssignDialog`: volná, Už u nás nepracuje, lidé; při přesunu člověka
  zaškrtnuté „dosavadní skříňku uvolnit“), Uvolnit (u obsazené s potvrzením), Vyprázdněno (K vyklizení → volná),
  poznámka v řádku, smazat, Přidat řadu (`lkAddRange`, od–do, nejvýš 500, existující přeskočí), Lidé bez skříňky
  s Přidělit volnou (první volná předvybraná). Excel `skrinky-RRRR-MM-DD.xlsx` (`lkSheets`: Skříňky s upozorněním
  „Je třeba vyprázdnit (důvod)“ / „má víc skříněk“ a sloupcem Z importu, Bez skříňky).
- **Upozornění**: odznak K vyklizení v menu (`#navLockers`, červený), pruh Je třeba vyprázdnit, dlaždice na
  domovské stránce (`homeTileMeta`), detail člověka v Lidech (`lkPersonHtml`), potvrzení vyřazení a smazání
  člověka (`lkWarnText`), hláška po nich (`lkAfterLeave`), import Konců trestů hlásí skříňky vyřazených.
- **Štítky** (Zebra 100 × 35 mm, `lkLabelsPdf`): PDF, kde je každá strana jeden štítek 100 × 35 mm. Ke každé
  skříňce dvojice: štítek na skříňku (malé SKŘÍŇKA, velké označení, beze jména) a štítek na záložní klíč (jen levá
  polovina: SKŘÍŇKA, označení, černý pruh ZÁLOŽNÍ KLÍČ; pravá polovina prázdná, tou se klíč zalepí a pozná se,
  jestli byl rozbalený; značky přehybu nahoře a dole uprostřed). Tlačítko Štítky v řádku (`stitky-skrinky-A12.pdf`),
  Tisk štítků hromadně: všechny, zobrazené ve filtru, nebo jedna řada, a druhy štítků (`lkLabelSeq`). V tisku
  velikost papíru 100 × 35 mm a skutečná velikost (100 %).
- **Výzva k vyklizení** (2.81): štítek 100 × 35 mm u skříňky K vyklizení: černý pruh VÝZVA K VYKLIZENÍ a SKŘÍŇKA
  A 4, „Používáte tuto skříňku? Nahlaste se u vedoucího nejpozději / do 25. 11. 2026 (7 pracovních dnů). / Poté bude
  skříňka komisionálně otevřena a vyklizena. / Vyvěšeno 14. 11. 2026“ (`lkNoticeLines`). Lhůta je 7 pracovních dnů
  bez víkendů a státních svátků (`lkWorkDaysAdd`). Výzva se uloží ke skříňce (`notice {at, until, by}`,
  `lkSetNotice`): opakovaný tisk drží stejnou lhůtu, přidělení, uvolnění (Vyprázdněno) nebo import s jiným
  člověkem ji zruší. Řádek ukáže „výzva vyvěšena …, lhůta do …“, po lhůtě „lhůta uplynula, lze vyklidit“.
  Tisk: tlačítko Výzva v řádku, Vytisknout výzvy (N) v pruhu, a okno po vyřazení nebo smazání člověka se skříňkou
  (`lkAfterLeave`: Vytisknout výzvu / Později). Historie „vyvěšena výzva k vyklizení, lhůta do …“.
- **Tisk bez nastavování** (2.81, oprava 2.81.1, `lkOutput`): (1) Zebra Browser Print na počítači (`lkZebra`:
  `GET default?type=printer` na `http://127.0.0.1:9100/`, pak `https://localhost:9101/`; `lkZebraSend`: `POST write`
  s `{device, data}` jako `text/plain`) → ZPL bez okna tisku; (2) jinak okno tisku s **obrázky** štítků
  (`lkRender` → černobílé PNG 800 × 280 bodů, `lkPrintImages`: `#lkPrintArea` s `.lk-plabel` po stránce,
  `@page { size: 100mm 35mm; margin: 0 }` přes `adoptedStyleSheets` jen na dobu tisku, `body.lk-printing`,
  `afterprint` → `lkPrintCleanup`); Chrome pak velikost papíru, okraje ani měřítko nenabízí, vybere se jen tiskárna.
  Stránka se zaokrouhlí na 377 × 132 px (99,75 × 34,92 mm), štítek má stejnou velikost. Na telefonu taky okno
  tisku. (3) Stáhnout PDF (`lkPdfDownload`, vektorově s textem, `PrintScaling None`, `PickTrayByPDFSize`,
  `NumCopies 1`) a Stáhnout ZPL. 2.81 tiskl PDF ve skrytém rámci; prohlížeč s „PDF stahovat“ ho jen stáhl a tisk
  z jiného programu šel na špatnou velikost papíru, proto 2.81.1. ZPL (`lkZplFor`): `lkRender` bez PNG, `lkZplLabel`
  v core (`^XA^PW800^LL280^LH0,0^FO0,0^GFA,28000,28000,100,…^FS^PQ1^XZ`, komprese ZPL v `lkZplGfa`). Hromadný
  tisk: Všechny / Jen zobrazené / Jen řada / **Zkušební štítek** (kind `test`: rámeček 1 mm od okraje, čárky
  po 10 mm, kříž uprostřed), výstup Tisknout / Stáhnout PDF / Stáhnout ZPL a stav Browser Print.
- **Víc lidí v jedné skříňce** (2.82): vedle hlavního `key` (a snímku `name`) pole `more: [{key, name}]` (jen když
  jsou, nejvýš 9). `lkKeys(l)` = všichni, `lkHas`, `lkNameIn`. `lkAddPerson` (volná skříňka = hlavní), `lkRemovePerson`
  (za hlavního nastoupí první další, poslední odebraný skříňku uvolní); `lkAssign` mění jen hlavního, `lkFree`,
  `lkSetGone` a import s jiným hlavním další lidi smažou. Stav: K vyklizení, až když nikdo není aktivní (důvod
  „nikdo z nich už není v seznamu“); jinak obsazená a `leaving` = kdo odešel (vyřazený, smazaný) → štítek
  „odebrat X“, žlutý pruh Odebrat ze sdílené skříňky, filtr Odebrat, odznak v menu K vyklizení + odebrat.
  Obrazovka: každý člověk na svém řádku s ✕ (Odebrat ze skříňky, potvrzení), „+ další člověk“
  (`lkAddPersonDialog`), Přidělit skříňku (`lkGiveDialog`: Volné / Sdílet obsazenou), po vyřazení nebo smazání
  člověka ze sdílené skříňky `lkLeaveShared` (Odebrat ze skříňky / Později). Excel: všichni lidé a ID, „odebrat …“.
  Historie: „přidán další člověk X“ (`lk:id:a:klíč`), „odebrán X“ (`lk:id:r:klíč`).
- **Není záložní klíč** (2.82): `nokey: true` (jen když je), přepínač v řádku (`aria-pressed`), štítek „bez záložního
  klíče“, filtr; `lkLabelSeq` štítek klíče vynechá, Excel sloupec Záložní klíč, historie (`lk:id:z`).
- **Klíče** (2.83, podnabídka pro telefon, přepínač Soupis / Klíče, `ui.lk.mode`): `serial` u skříňky = poslední
  čísla sériového čísla klíče (`lkSerialNorm`: písmena a číslice, nejvýš 6 posledních; jen když je). Zapsat číslo
  klíče: Procházet **Bez záložního klíče** (výchozí, když nějaké jsou) / **Všechny** (`ui.lk.walk`); `lkKStart`
  předvyplní první skříňku bez čísla v procházení, po Uložit (`lkKeySave`) další (`lkNextNoSerial`), kurzor do čísel,
  Enter = další pole / Uložit; skříňka se píše jako „a12“ (`lkByLabel`), `lkKInfo` ukáže lidi, číslo, bez
  záložního klíče a nejednoznačné číslo; stejné číslo jinde varuje (`lkKSerHint`, `lkSetSerial().dup`). Najít
  skříňku podle klíče (`lkBySerial`: stejné, nebo končí na zadaná čísla): u skříňky bez záložního klíče **Záložní
  klíč nalezen** (zruší `nokey`), jinak **Štítek klíče** (jen štítek klíče), V soupisu. Soupis: „klíč …123“ pod
  označením, štítek „stejné číslo klíče jako …“, hledání podle čísla, Excel sloupec Číslo klíče, historie
  (`lk:id:s`). Rozepsaný formulář přežije překreslení (`lkKeysKeep`).
- **Historie** (kind `locker`, filtr Skříňky): přidání a smazání skříňky, přidělení, uvolnění, „už nepracuje“,
  poznámka. Přidělení / uvolnění / „už nepracuje“ mají každé vlastní `m` (`lk:id:k:p|f|g`), takže se při rychlém
  sledu v historii neslučují (vyprázdnění zůstane vidět); poznámky se slučují (`lk:id:t`).
