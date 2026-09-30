// Verze 2 vedle ostré verze na skutečném Apachi: node e2e_vedle.js instalace|oddeleni
//   instalace = nainstaluje verzi 2 s kopií ostrých dat (INSTALL_CMD) a ověří, že se ostrá
//               verze nezměnila: kód, konfigurace Apache ani databáze (bajt po bajtu);
//   oddeleni  = ostrá verze po práci ve verzi 2 dál ukazuje svoje data, zapamatovaná zařízení
//               s PINem si verze nepřepisují a každá má vlastní data.
// Postup (jen lokální Apache v kontejneru, nikdy ne ostrý server) je v odmeny_v2/README.md.
// Proměnné: PW (cesta k playwright), S (pracovní adresář), HOST (výchozí http://127.0.0.1),
// INSTALL_CMD (výchozí "ODMENY_KOPIE=1 bash odmeny_v2/deploy/install.sh").
const { chromium } = require(process.env.PW);
const { execSync, execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const S = process.env.S;
const HOST = process.env.HOST || 'http://127.0.0.1';
const LIVE = `${HOST}/odmeny/`;
const V2 = `${HOST}/odmeny_v2/`;
const MODE = process.argv[2];
const shots = path.join(S, 'vshots');
const stateFile = path.join(S, 'vedle-hashes.json');
const problems = [];
const check = (ok, message) => { if (!ok) problems.push(message); };

/** Otisk všech souborů v adresáři (kód ostré verze). */
function treeHash(dir) {
  const hash = crypto.createHash('sha256');
  const walk = current => fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).forEach(entry => {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) walk(full);
    else hash.update(`${path.relative(dir, full)}\0`).update(fs.readFileSync(full));
  });
  walk(dir);
  return hash.digest('hex');
}
const fileHash = file => (fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : '');

/** Obsah databáze jen pro čtení, jako www-data (soubory SQLite musí patřit webovému serveru). */
function dbInfo(file) {
  const code = `$p = new PDO("sqlite:" . $argv[1], null, null, [PDO::SQLITE_ATTR_OPEN_FLAGS => PDO::SQLITE_OPEN_READONLY]);
    $n = fn($t) => (int)$p->query("SELECT COUNT(*) FROM $t")->fetchColumn();
    $last = $p->query("SELECT rev, blob FROM versions ORDER BY rev DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC) ?: ["rev" => 0, "blob" => ""];
    echo json_encode(["cards" => $n("cards"), "devices" => $n("devices"), "sessions" => $n("sessions"), "versions" => $n("versions"),
      "rev" => (int)$last["rev"], "blob" => hash("sha256", (string)$last["blob"])]);`;
  return JSON.parse(execFileSync('runuser', ['-u', 'www-data', '--', 'php', '-r', code, file], { encoding: 'utf8' }));
}

function liveFiles() {
  return {
    code: treeHash('/var/www/odmeny'),
    conf: fileHash('/etc/apache2/conf-available/odmeny.conf'),
    db: fileHash('/var/lib/odmeny/odmeny.sqlite3'),
    wal: fs.existsSync('/var/lib/odmeny/odmeny.sqlite3-wal') && fs.statSync('/var/lib/odmeny/odmeny.sqlite3-wal').size ? fileHash('/var/lib/odmeny/odmeny.sqlite3-wal') : '',
  };
}

async function watch(page, name) {
  page.on('pageerror', error => problems.push(`${name}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error' && !/status of 4\d\d/.test(message.text())) problems.push(`${name} konzole: ${message.text()}`); });
}

async function state(url) {
  const response = await fetch(`${url}api.php?action=state`, { headers: { 'X-Odmeny': '1' } });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function status(url) {
  return (await fetch(url, { redirect: 'manual' })).status;
}

async function typePin(page, pin) {
  await page.waitForSelector('.pin-pad');
  await page.keyboard.type(pin, { delay: 60 });
}

async function loginWithKey(page, base, key) {
  await page.goto(base);
  await page.waitForSelector('#manual');
  await page.click('#manual');
  await page.fill('[name="key"]', key);
  await page.click('#keyForm button[type="submit"]');
  await page.waitForSelector('#setPin');
}

async function rememberWithPin(page, pin) {
  await page.click('#setPin');
  await typePin(page, pin);
  await page.waitForFunction(() => /Zopakuj/.test(document.querySelector('h1')?.textContent || ''));
  await typePin(page, pin);
  await page.waitForSelector('#view-prehled.on', { timeout: 20000 });
  await page.waitForTimeout(500);
}

async function unlockWithPin(page, base, pin) {
  await page.goto(base);
  await page.waitForSelector('.pin-pad', { timeout: 10000 });
  await typePin(page, pin);
  await page.waitForSelector('#view-prehled.on', { timeout: 20000 });
  await page.waitForTimeout(500);
}

const summary = page => page.evaluate(() => ({ people: Object.keys(S.employees).length, sanctions: S.sanctions.length, total: allRows().reduce((x, r) => x + r.total, 0) }));

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  if (MODE === 'instalace') {
    const before = liveFiles();
    const liveBefore = dbInfo('/var/lib/odmeny/odmeny.sqlite3');
    execSync(process.env.INSTALL_CMD || 'ODMENY_KOPIE=1 bash odmeny_v2/deploy/install.sh', { stdio: 'inherit' });
    const after = liveFiles();
    for (const key of Object.keys(before)) check(before[key] === after[key], `ostrá verze se instalací změnila: ${key}`);
    const liveAfter = dbInfo('/var/lib/odmeny/odmeny.sqlite3');
    check(JSON.stringify(liveAfter) === JSON.stringify(liveBefore), `obsah ostré databáze se změnil: ${JSON.stringify(liveBefore)} → ${JSON.stringify(liveAfter)}`);
    const copy = dbInfo('/var/lib/odmeny_v2/odmeny.sqlite3');
    check(copy.cards === liveBefore.cards && copy.versions === liveBefore.versions && copy.rev === liveBefore.rev && copy.blob === liveBefore.blob,
      `kopie nesedí: ${JSON.stringify(copy)} proti ${JSON.stringify(liveBefore)}`);
    check(copy.devices === 0 && copy.sessions === 0, `do kopie se přenesla zařízení nebo relace: ${JSON.stringify(copy)}`);
    const v2 = await state(V2);
    check(v2.status === 200 && v2.body.setup_required === false && v2.body.version === '2.1', `verze 2 neběží s kopií dat: ${JSON.stringify(v2)}`);
    const live = await state(LIVE);
    check(live.status === 200 && live.body.setup_required === false && live.body.version === undefined, `ostrá verze se chová jinak: ${JSON.stringify(live)}`);
    for (const hidden of ['CLAUDE.md', 'README.md', 'bin/copy-db.php', 'lib/odmeny.php', 'private/app.js', 'deploy/install.sh', 'tests/e2e_vedle.js']) {
      const code = await status(`${V2}${hidden}`);
      check(code === 403 || code === 404, `z webu je vidět ${hidden} (${code})`);
    }
    check(await status(`${HOST}/odmeny_v2`) === 301, 'adresa bez lomítka nepřesměruje');
    fs.writeFileSync(stateFile, JSON.stringify({ code: after.code, conf: after.conf }));
    console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'instalace ok');
    return;
  }

  // oddeleni: po průchodu verzí 2 (e2e_upgrade.js new s BASE na /odmeny_v2/)
  const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const now = liveFiles();
  check(now.code === saved.code && now.conf === saved.conf, 'kód nebo konfigurace ostré verze se změnily');
  const key = fs.readFileSync(path.join(S, 'upgrade-key.txt'), 'utf8').trim();
  const before = JSON.parse(fs.readFileSync(path.join(S, 'upgrade-before.json'), 'utf8'));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  await watch(page, 'vedle');

  // 1. ostrá verze: data jako před verzí 2, zařízení s PINem
  await loginWithKey(page, LIVE, key);
  await rememberWithPin(page, '470913');
  check(JSON.stringify(await summary(page)) === JSON.stringify(before), `ostrá verze ukazuje jiná data: ${JSON.stringify(await summary(page))} místo ${JSON.stringify(before)}`);
  await page.screenshot({ path: `${shots}/01-ostra.png` });
  const liveRev = dbInfo('/var/lib/odmeny/odmeny.sqlite3').rev;

  // 2. verze 2 ve stejném prohlížeči: zařízení ostré verze nezná, chce kartičku
  await page.goto(V2);
  await page.waitForSelector('#manual, .pin-pad');
  check(await page.locator('.pin-pad').count() === 0, 'verze 2 převzala zapamatované zařízení ostré verze');
  check(/verze 2/.test(await page.textContent('.lock-brand')), 'zámek verze 2 není označený');
  await page.screenshot({ path: `${shots}/02-v2-zamek.png` });
  await loginWithKey(page, V2, key);
  await rememberWithPin(page, '582604');
  check(/verze 2/.test(await page.textContent('.side-brand')), 'aplikace verze 2 není označená');
  const v2Summary = await summary(page);
  check(JSON.stringify(v2Summary) !== JSON.stringify(before), 'změny z průchodu verzí 2 chybí (čekal jsem jiný součet)');
  await page.evaluate(() => { const e = Object.values(S.employees)[0]; e.note = 'Poznámka jen ve verzi 2'; save(); });
  await page.waitForFunction(() => document.querySelector('#saveState').dataset.state === 'saved', null, { timeout: 15000 });
  await page.screenshot({ path: `${shots}/03-v2.png` });
  const stored = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, JSON.parse(localStorage.getItem(k)).id])));
  check(stored['odmeny.device.v1'] && stored['odmeny.device.v1:/odmeny_v2/'] && stored['odmeny.device.v1'] !== stored['odmeny.device.v1:/odmeny_v2/'],
    `zařízení nejsou oddělená: ${JSON.stringify(stored)}`);
  check(dbInfo('/var/lib/odmeny/odmeny.sqlite3').rev === liveRev, 'verze 2 zapsala do ostré databáze');

  // 3. zpět do ostré verze: PIN pořád funguje, data bez změn z verze 2
  await unlockWithPin(page, LIVE, '470913');
  check(JSON.stringify(await summary(page)) === JSON.stringify(before), 'ostrá verze po práci ve verzi 2 ukazuje jiná data');
  check(!(await page.evaluate(() => Object.values(S.employees).some(e => e.note === 'Poznámka jen ve verzi 2'))), 'změna z verze 2 se objevila v ostré verzi');
  await page.screenshot({ path: `${shots}/04-ostra-pin.png` });

  // 4. a zase verze 2: svůj PIN, svoje změna
  await unlockWithPin(page, V2, '582604');
  check(await page.evaluate(() => Object.values(S.employees).some(e => e.note === 'Poznámka jen ve verzi 2')), 'verze 2 ztratila svou změnu');
  await page.screenshot({ path: `${shots}/05-v2-pin.png` });

  await browser.close();
  console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'oddeleni ok');
})().catch(error => { console.error(error); console.log(problems.join('\n')); process.exit(1); });
