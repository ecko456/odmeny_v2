<?php
declare(strict_types=1);

/*
 * Odměny – server.
 *
 * Server nikdy nevidí data ani přístupový klíč. Prohlížeč data šifruje
 * (AES-GCM, klíč DEK) a sem posílá jen zašifrovaný blok. DEK je zabalený
 * klíčem odvozeným z QR kartičky, takže bez kartičky ho nikdo neotevře:
 * ani správce serveru, ani ten, kdo by ukradl disk nebo zálohu.
 *
 * Server hlídá jen přístup: kdo se smí přihlásit (otisk z kartičky),
 * relace, zařízení s PINem (se sdíleným tajemstvím a limitem pokusů)
 * a historii zašifrovaných verzí.
 */

// Verze aplikace. Klient posílá verzi svého tvaru dat v hlavičce X-Odmeny-Client;
// stránka otevřená ještě před aktualizací už nesmí uložit data ve starém tvaru.
const ODM_VERSION = '2.0';
const ODM_MIN_CLIENT = 2;
const ODM_SESSION_COOKIE = 'odmeny_session';
const ODM_SESSION_HOURS = 12;
const ODM_IDLE_MINUTES = 60;
const ODM_MAX_BLOB_CHARS = 12 * 1024 * 1024;
const ODM_MAX_JSON_BYTES = 16 * 1024 * 1024;
const ODM_MAX_SMALL_JSON_BYTES = 64 * 1024;
const ODM_MAX_PREFS_BYTES = 32 * 1024; // v base64 i s obálkou se vejde do ODM_MAX_SMALL_JSON_BYTES
// Historie: posledních 30 uložení celých, starší jen poslední stav z každé hodiny
// (týden zpátky) a z každého dne, dohromady nejvýš 150 verzí.
const ODM_KEEP_RECENT = 30;
const ODM_KEEP_SNAPSHOTS = 120;
const ODM_HOURLY_DAYS = 7;
const ODM_PIN_ATTEMPTS = 5;
const ODM_MAX_CARDS = 20;
const ODM_MAX_DEVICES = 30;
const ODM_LOGIN_FAILS_PER_IP = 20;
const ODM_FAIL_WINDOW_MINUTES = 15;

function odm_data_dir(): string
{
    $configured = getenv('ODMENY_DATA_DIR');
    return $configured !== false && $configured !== ''
        ? rtrim($configured, DIRECTORY_SEPARATOR)
        : dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data';
}

function odm_now(): string
{
    return gmdate('Y-m-d\TH:i:s\Z');
}

function odm_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $dir = odm_data_dir();
    if (!is_dir($dir) && !mkdir($dir, 0770, true) && !is_dir($dir)) {
        throw new RuntimeException('Nelze vytvořit datový adresář.');
    }
    $pdo = new PDO('sqlite:' . $dir . DIRECTORY_SEPARATOR . 'odmeny.sqlite3');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA synchronous = NORMAL');
    $pdo->exec('PRAGMA busy_timeout = 5000');
    $pdo->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    auth_hash TEXT NOT NULL UNIQUE,
    wrapped_dek TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT
);
CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    server_share TEXT NOT NULL,
    failures INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_used_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    device_id TEXT REFERENCES devices(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT
);
CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,
    ip TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS versions (
    rev INTEGER PRIMARY KEY AUTOINCREMENT,
    blob TEXT NOT NULL,
    size INTEGER NOT NULL,
    card_id TEXT,
    device_id TEXT,
    created_at TEXT NOT NULL
);
-- Osobní nastavení pohledu (filtry, období, sloupce) každé kartičky, šifrované.
CREATE TABLE IF NOT EXISTS prefs (
    card_id TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
    blob TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts ON attempts(kind, ip, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_card ON sessions(card_id);
SQL);
    return $pdo;
}

function odm_all(string $sql, array $params = []): array
{
    $statement = odm_db()->prepare($sql);
    $statement->execute($params);
    return $statement->fetchAll();
}

function odm_one(string $sql, array $params = []): ?array
{
    $statement = odm_db()->prepare($sql);
    $statement->execute($params);
    $row = $statement->fetch();
    return $row === false ? null : $row;
}

function odm_exec(string $sql, array $params = []): int
{
    $statement = odm_db()->prepare($sql);
    $statement->execute($params);
    return $statement->rowCount();
}

/* ---------------------------------------------------------------- HTTP */

function odm_from_loopback(): bool
{
    return in_array((string)($_SERVER['REMOTE_ADDR'] ?? ''), ['127.0.0.1', '::1'], true);
}

function odm_is_https(): bool
{
    $https = strtolower((string)($_SERVER['HTTPS'] ?? ''));
    if ($https !== '' && $https !== 'off') {
        return true;
    }
    // X-Forwarded-Proto může poslat kdokoli; věří se mu jen od proxy na stejném stroji.
    return odm_from_loopback() && strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

/** Vývoj na vlastním počítači: spojení i adresa musí být místní (hlavička Host sama nestačí). */
function odm_is_local(): bool
{
    $host = strtolower((string)parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST));
    return odm_from_loopback() && in_array($host, ['localhost', '127.0.0.1', '[::1]', '::1'], true);
}

function odm_base_path(): string
{
    $directory = str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/')));
    return rtrim($directory, '/') . '/';
}

function odm_security_headers(): void
{
    header_remove('X-Powered-By');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header('Cross-Origin-Opener-Policy: same-origin');
    header('Cross-Origin-Resource-Policy: same-origin');
    header('X-Robots-Tag: noindex, nofollow, noarchive');
    header('Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
    header("Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; form-action 'none'; frame-ancestors 'none'; base-uri 'none'");
    if (odm_is_https()) {
        header('Strict-Transport-Security: max-age=31536000');
    }
}

/** Bez HTTPS nefunguje šifrování v prohlížeči a klíč by šel po síti čitelně. */
function odm_require_https(): void
{
    if (odm_is_https() || odm_is_local()) {
        return;
    }
    $host = (string)($_SERVER['HTTP_HOST'] ?? '');
    if ($host === '' || !preg_match('/^[A-Za-z0-9.:\[\]-]+$/', $host)) {
        http_response_code(400);
        exit;
    }
    header('Location: https://' . $host . (string)($_SERVER['REQUEST_URI'] ?? '/'), true, 301);
    exit;
}

function odm_json(mixed $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function odm_fail(string $message, int $status = 400, array $extra = []): never
{
    odm_json(['error' => $message] + $extra, $status);
}

function odm_input(int $maxBytes = ODM_MAX_JSON_BYTES): array
{
    $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if ($raw === false || $raw === '') {
        return [];
    }
    if (strlen($raw) > $maxBytes) {
        odm_fail('Data jsou příliš velká.', 413);
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        odm_fail('Neplatný požadavek.', 400);
    }
    return $decoded;
}

/**
 * API volá jen stránka aplikace: vlastní hlavička (cizí web ji bez CORS poslat
 * nemůže) a u zápisů kontrola původu. Cookie má navíc SameSite=Strict.
 */
function odm_require_app_request(string $method): void
{
    if (($_SERVER['HTTP_X_ODMENY'] ?? '') !== '1') {
        odm_fail('Požadavek nepřišel z aplikace.', 403);
    }
    if (in_array($method, ['GET', 'HEAD'], true)) {
        return;
    }
    $site = strtolower((string)($_SERVER['HTTP_SEC_FETCH_SITE'] ?? ''));
    if ($site !== '') {
        if ($site !== 'same-origin') {
            odm_fail('Požadavek z cizí stránky byl odmítnut.', 403);
        }
        return;
    }
    $origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin === '') {
        return;
    }
    $host = (string)parse_url($origin, PHP_URL_HOST);
    $port = parse_url($origin, PHP_URL_PORT);
    $authority = strtolower($host . ($port !== null ? ':' . $port : ''));
    if ($host === '' || $authority !== strtolower((string)($_SERVER['HTTP_HOST'] ?? ''))) {
        odm_fail('Požadavek z cizí stránky byl odmítnut.', 403);
    }
}

/** Zápis smí jen aktuální verze aplikace; stará otevřená stránka by jinak smazala nová pole. */
function odm_require_client(): void
{
    if ((int)($_SERVER['HTTP_X_ODMENY_CLIENT'] ?? 0) < ODM_MIN_CLIENT) {
        odm_fail('Aplikace byla aktualizována. Obnov stránku (F5) a přihlas se znovu; poslední změny z této stránky se neuložily.', 426, ['reload' => true]);
    }
}

function odm_client_ip(): string
{
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
}

/* ---------------------------------------------------------------- vstupy */

/** Base64 s přesně danou délkou po dekódování (nebo rozsahem). */
function odm_b64(mixed $value, int $minBytes, int $maxBytes, string $what): string
{
    if (!is_string($value) || $value === '' || strlen($value) > (int)ceil($maxBytes / 3) * 4 + 4 || !preg_match('/^[A-Za-z0-9+\/]+={0,2}$/', $value)) {
        odm_fail("Neplatná hodnota: $what.", 422);
    }
    $decoded = base64_decode($value, true);
    if ($decoded === false || strlen($decoded) < $minBytes || strlen($decoded) > $maxBytes) {
        odm_fail("Neplatná hodnota: $what.", 422);
    }
    return $decoded;
}

function odm_label(mixed $value, string $fallback): string
{
    $label = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string)$value) ?? '');
    $label = mb_substr($label, 0, 40, 'UTF-8');
    return $label !== '' ? $label : $fallback;
}

function odm_card_id(mixed $value): string
{
    if (!is_string($value) || !preg_match('/^[a-f0-9]{16}$/', $value)) {
        odm_fail('Neplatné označení kartičky.', 422);
    }
    return $value;
}

/* ---------------------------------------------------------------- brzda proti hádání */

function odm_record(string $kind): void
{
    odm_exec('INSERT INTO attempts (kind, ip, created_at) VALUES (?, ?, ?)', [$kind, odm_client_ip(), odm_now()]);
    if (random_int(1, 40) === 1) {
        odm_exec('DELETE FROM attempts WHERE created_at < ?', [gmdate('Y-m-d\TH:i:s\Z', time() - 86400)]);
    }
}

function odm_throttle(string $kind, int $max): void
{
    $since = gmdate('Y-m-d\TH:i:s\Z', time() - ODM_FAIL_WINDOW_MINUTES * 60);
    $row = odm_one('SELECT COUNT(*) AS total FROM attempts WHERE kind = ? AND ip = ? AND created_at >= ?', [$kind, odm_client_ip(), $since]);
    if ((int)($row['total'] ?? 0) >= $max) {
        odm_fail('Příliš mnoho neúspěšných pokusů. Zkus to znovu za čtvrt hodiny.', 429);
    }
}

/* ---------------------------------------------------------------- první spuštění */

function odm_setup_required(): bool
{
    return odm_one('SELECT id FROM cards LIMIT 1') === null;
}

function odm_setup_token_path(): string
{
    return odm_data_dir() . DIRECTORY_SEPARATOR . 'setup-token.txt';
}

/** Jednorázový kód pro založení první kartičky. Leží jen na disku serveru. */
function odm_setup_token(): string
{
    $path = odm_setup_token_path();
    if (is_file($path)) {
        $token = trim((string)file_get_contents($path));
        if ($token !== '') {
            return $token;
        }
    }
    odm_db();
    $token = implode('-', str_split(strtoupper(bin2hex(random_bytes(6))), 4));
    $temporary = $path . '.tmp-' . bin2hex(random_bytes(4));
    file_put_contents($temporary, $token . "\n", LOCK_EX);
    @chmod($temporary, 0600);
    rename($temporary, $path);
    return $token;
}

/* ---------------------------------------------------------------- relace */

function odm_set_cookie(string $value, int $expires): void
{
    setcookie(ODM_SESSION_COOKIE, $value, [
        'expires' => $expires,
        'path' => odm_base_path(),
        'secure' => odm_is_https(),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

function odm_start_session(string $cardId, ?string $deviceId): void
{
    $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    $now = time();
    odm_exec('INSERT INTO sessions (id, card_id, device_id, created_at, last_seen_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
        hash('sha256', $token), $cardId, $deviceId, odm_now(), odm_now(),
        gmdate('Y-m-d\TH:i:s\Z', $now + ODM_SESSION_HOURS * 3600), odm_client_ip(),
        substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 200),
    ]);
    if (random_int(1, 20) === 1) {
        odm_exec('DELETE FROM sessions WHERE expires_at < ? OR last_seen_at < ?', [odm_now(), gmdate('Y-m-d\TH:i:s\Z', $now - ODM_IDLE_MINUTES * 60)]);
    }
    odm_exec('UPDATE cards SET last_used_at = ? WHERE id = ?', [odm_now(), $cardId]);
    odm_set_cookie($token, 0);
    $GLOBALS['odm_session'] = odm_one('SELECT * FROM sessions WHERE id = ?', [hash('sha256', $token)]);
}

function odm_session(): ?array
{
    if (array_key_exists('odm_session', $GLOBALS)) {
        return $GLOBALS['odm_session'];
    }
    $GLOBALS['odm_session'] = null;
    $token = (string)($_COOKIE[ODM_SESSION_COOKIE] ?? '');
    if ($token === '' || strlen($token) > 100) {
        return null;
    }
    $id = hash('sha256', $token);
    $session = odm_one('SELECT * FROM sessions WHERE id = ?', [$id]);
    if ($session === null) {
        return null;
    }
    $idle = strtotime((string)$session['last_seen_at']) < time() - ODM_IDLE_MINUTES * 60;
    if ($idle || strtotime((string)$session['expires_at']) < time()) {
        odm_exec('DELETE FROM sessions WHERE id = ?', [$id]);
        return null;
    }
    if (strtotime((string)$session['last_seen_at']) < time() - 60) {
        odm_exec('UPDATE sessions SET last_seen_at = ? WHERE id = ?', [odm_now(), $id]);
    }
    return $GLOBALS['odm_session'] = $session;
}

function odm_require_session(): array
{
    $session = odm_session();
    if ($session === null) {
        odm_fail('Aplikace je zamčená. Přihlas se znovu.', 401, ['locked' => true]);
    }
    return $session;
}

function odm_end_session(): void
{
    $session = odm_session();
    if ($session !== null) {
        odm_exec('DELETE FROM sessions WHERE id = ?', [$session['id']]);
    }
    odm_set_cookie('', time() - 3600);
    $GLOBALS['odm_session'] = null;
}

/* ---------------------------------------------------------------- data */

function odm_current_version(): ?array
{
    return odm_one('SELECT rev, blob, created_at FROM versions ORDER BY rev DESC LIMIT 1');
}

function odm_store_version(string $blob, array $session): int
{
    odm_exec('INSERT INTO versions (blob, size, card_id, device_id, created_at) VALUES (?, ?, ?, ?, ?)', [
        $blob, strlen($blob), $session['card_id'] ?? null, $session['device_id'] ?? null, odm_now(),
    ]);
    $rev = (int)odm_db()->lastInsertId();
    odm_prune_versions();
    return $rev;
}

/** Automatické ukládání vytváří verzi každých pár vteřin; starší verze se proto prořeďují. */
function odm_prune_versions(): void
{
    $rows = odm_all('SELECT rev, created_at FROM versions ORDER BY rev DESC');
    $buckets = [];
    $drop = [];
    $hourlySince = time() - ODM_HOURLY_DAYS * 86400;
    foreach ($rows as $index => $row) {
        if ($index < ODM_KEEP_RECENT) {
            continue;
        }
        $time = strtotime((string)$row['created_at']) ?: 0;
        $bucket = $time >= $hourlySince ? 'h' . gmdate('YmdH', $time) : 'd' . gmdate('Ymd', $time);
        if (isset($buckets[$bucket]) || count($buckets) >= ODM_KEEP_SNAPSHOTS) {
            $drop[] = (int)$row['rev'];
            continue;
        }
        $buckets[$bucket] = true;
    }
    foreach (array_chunk($drop, 400) as $chunk) {
        odm_exec('DELETE FROM versions WHERE rev IN (' . implode(',', array_fill(0, count($chunk), '?')) . ')', $chunk);
    }
}

function odm_valid_blob(mixed $blob): string
{
    if (!is_string($blob) || strlen($blob) > ODM_MAX_BLOB_CHARS) {
        odm_fail('Data jsou příliš velká.', 413);
    }
    odm_b64($blob, 30, ODM_MAX_BLOB_CHARS, 'data');
    return $blob;
}
