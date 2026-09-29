<?php
declare(strict_types=1);

require __DIR__ . '/lib/odmeny.php';

odm_security_headers();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = (string)($_GET['action'] ?? '');
odm_require_app_request($method);
if (!odm_is_https() && !odm_is_local()) {
    odm_fail('Aplikace běží jen přes HTTPS.', 403);
}

try {
    /* ---------- bez přihlášení */

    if ($action === 'state' && $method === 'GET') {
        $setup = odm_setup_required();
        if ($setup) {
            odm_setup_token();
        }
        $session = odm_session();
        odm_json([
            'setup_required' => $setup,
            'authenticated' => $session !== null,
            'max_blob' => ODM_MAX_BLOB_CHARS,
            'version' => ODM_VERSION,
        ]);
    }

    if ($action === 'setup' && $method === 'POST') {
        odm_throttle('setup_fail', 10);
        $data = odm_input();
        if (!odm_setup_required()) {
            odm_fail('Aplikace už je nastavená. Přihlas se kartičkou.', 409);
        }
        $token = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($data['token'] ?? '')) ?? '');
        $expected = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', odm_setup_token()) ?? '');
        if ($token === '' || !hash_equals($expected, $token)) {
            odm_record('setup_fail');
            odm_fail('Kód pro první spuštění nesedí. Najdeš ho ve výpisu instalace na serveru.', 401);
        }
        $card = is_array($data['card'] ?? null) ? $data['card'] : [];
        $id = odm_card_id($card['id'] ?? null);
        $auth = odm_b64($card['auth'] ?? null, 32, 32, 'otisk kartičky');
        odm_b64($card['wrapped_dek'] ?? null, 60, 60, 'zabalený klíč');
        // Dvě souběžná nastavení nesmí založit dvě kartičky s různými klíči.
        $pdo = odm_db();
        $pdo->exec('BEGIN IMMEDIATE');
        if (!odm_setup_required()) {
            $pdo->exec('ROLLBACK');
            odm_fail('Aplikace už je nastavená. Přihlas se kartičkou.', 409);
        }
        odm_exec('INSERT INTO cards (id, label, auth_hash, wrapped_dek, created_at) VALUES (?, ?, ?, ?, ?)', [
            $id, odm_label($card['label'] ?? '', 'Hlavní kartička'), hash('sha256', $auth), $card['wrapped_dek'], odm_now(),
        ]);
        $pdo->exec('COMMIT');
        @unlink(odm_setup_token_path());
        odm_start_session($id, null);
        if (isset($data['blob'])) {
            odm_store_version(odm_valid_blob($data['blob']), odm_session() ?? []);
        }
        odm_json(['ok' => true, 'card_id' => $id], 201);
    }

    if ($action === 'login' && $method === 'POST') {
        odm_throttle('login_fail', ODM_LOGIN_FAILS_PER_IP);
        $auth = odm_b64(odm_input(ODM_MAX_SMALL_JSON_BYTES)['auth'] ?? null, 32, 32, 'otisk kartičky');
        $card = odm_one('SELECT * FROM cards WHERE auth_hash = ?', [hash('sha256', $auth)]);
        if ($card === null) {
            odm_record('login_fail');
            odm_fail('Tahle kartička tu není platná. Možná byla zrušená.', 401);
        }
        odm_start_session((string)$card['id'], null);
        odm_json(['card_id' => $card['id'], 'label' => $card['label'], 'wrapped_dek' => $card['wrapped_dek']]);
    }

    if ($action === 'unlock' && $method === 'POST') {
        odm_throttle('pin_fail', ODM_LOGIN_FAILS_PER_IP);
        $data = odm_input(ODM_MAX_SMALL_JSON_BYTES);
        $deviceId = (string)($data['device_id'] ?? '');
        $proof = odm_b64($data['pin_proof'] ?? null, 32, 32, 'PIN');
        $device = preg_match('/^[a-f0-9]{32}$/', $deviceId) ? odm_one('SELECT * FROM devices WHERE id = ?', [$deviceId]) : null;
        if ($device === null) {
            odm_record('pin_fail');
            odm_fail('Toto zařízení už není povolené. Přihlas se kartičkou.', 410, ['forget' => true]);
        }
        if (!password_verify(base64_encode($proof), (string)$device['pin_hash'])) {
            odm_record('pin_fail');
            $failures = (int)$device['failures'] + 1;
            if ($failures >= ODM_PIN_ATTEMPTS) {
                odm_exec('DELETE FROM devices WHERE id = ?', [$deviceId]);
                odm_fail('PIN byl zadán špatně ' . ODM_PIN_ATTEMPTS . '×. Zařízení bylo z bezpečnostních důvodů odebráno, přihlas se kartičkou.', 410, ['forget' => true]);
            }
            odm_exec('UPDATE devices SET failures = ? WHERE id = ?', [$failures, $deviceId]);
            odm_fail('PIN nesedí. Zbývá pokusů: ' . (ODM_PIN_ATTEMPTS - $failures) . '.', 403, ['remaining' => ODM_PIN_ATTEMPTS - $failures]);
        }
        odm_exec('UPDATE devices SET failures = 0, last_used_at = ? WHERE id = ?', [odm_now(), $deviceId]);
        odm_start_session((string)$device['card_id'], $deviceId);
        $card = odm_one('SELECT label FROM cards WHERE id = ?', [$device['card_id']]);
        odm_json(['server_share' => $device['server_share'], 'card_id' => $device['card_id'], 'card_label' => $card['label'] ?? '']);
    }

    if ($action === 'logout' && $method === 'POST') {
        odm_end_session();
        odm_json(['ok' => true]);
    }

    /* ---------- přihlášený */

    $session = odm_require_session();

    if ($action === 'me' && $method === 'GET') {
        $card = odm_one('SELECT label, created_at FROM cards WHERE id = ?', [$session['card_id']]);
        $device = $session['device_id'] ? odm_one('SELECT label FROM devices WHERE id = ?', [$session['device_id']]) : null;
        odm_json([
            'card_id' => $session['card_id'], 'card_label' => $card['label'] ?? '', 'card_created' => $card['created_at'] ?? null,
            'device_id' => $session['device_id'], 'device_label' => $device['label'] ?? null,
            'version' => ODM_VERSION,
        ]);
    }

    if ($action === 'prefs' && $method === 'GET') {
        $row = odm_one('SELECT blob, updated_at FROM prefs WHERE card_id = ?', [$session['card_id']]);
        odm_json(['blob' => $row['blob'] ?? null, 'updated_at' => $row['updated_at'] ?? null]);
    }

    if ($action === 'prefs' && $method === 'POST') {
        odm_require_client();
        $blob = odm_input(ODM_MAX_SMALL_JSON_BYTES)['blob'] ?? null;
        odm_b64($blob, 30, ODM_MAX_PREFS_BYTES, 'nastavení');
        odm_exec('INSERT INTO prefs (card_id, blob, updated_at) VALUES (?, ?, ?) ON CONFLICT(card_id) DO UPDATE SET blob = excluded.blob, updated_at = excluded.updated_at', [
            $session['card_id'], $blob, odm_now(),
        ]);
        odm_json(['ok' => true]);
    }

    if ($action === 'data' && $method === 'GET') {
        $current = odm_current_version();
        odm_json(['rev' => $current === null ? 0 : (int)$current['rev'], 'blob' => $current['blob'] ?? null, 'saved_at' => $current['created_at'] ?? null]);
    }

    if ($action === 'data' && $method === 'POST') {
        odm_require_client();
        $data = odm_input();
        $blob = odm_valid_blob($data['blob'] ?? null);
        $pdo = odm_db();
        $pdo->exec('BEGIN IMMEDIATE');
        try {
            $current = odm_one('SELECT rev FROM versions ORDER BY rev DESC LIMIT 1');
            $currentRev = $current === null ? 0 : (int)$current['rev'];
            if ((int)($data['base_rev'] ?? -1) !== $currentRev) {
                $pdo->exec('ROLLBACK');
                odm_fail('Data mezitím změnilo jiné zařízení.', 409, ['rev' => $currentRev]);
            }
            $rev = odm_store_version($blob, $session);
            $pdo->exec('COMMIT');
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->exec('ROLLBACK');
            }
            throw $error;
        }
        odm_json(['rev' => $rev, 'saved_at' => odm_now()]);
    }

    if ($action === 'versions' && $method === 'GET') {
        $rows = odm_all('SELECT v.rev, v.size, v.created_at, c.label AS card_label, d.label AS device_label FROM versions v LEFT JOIN cards c ON c.id = v.card_id LEFT JOIN devices d ON d.id = v.device_id ORDER BY v.rev DESC');
        odm_json(['items' => array_map(static fn(array $row): array => [
            'rev' => (int)$row['rev'], 'size' => (int)$row['size'], 'created_at' => $row['created_at'],
            'by' => $row['device_label'] ?? $row['card_label'] ?? '',
        ], $rows)]);
    }

    if ($action === 'version' && $method === 'GET') {
        $row = odm_one('SELECT rev, blob, created_at FROM versions WHERE rev = ?', [(int)($_GET['rev'] ?? 0)]);
        $row === null ? odm_fail('Verze už neexistuje.', 404) : odm_json(['rev' => (int)$row['rev'], 'blob' => $row['blob'], 'created_at' => $row['created_at']]);
    }

    if ($action === 'cards' && $method === 'GET') {
        $rows = odm_all('SELECT id, label, wrapped_dek, created_at, last_used_at FROM cards ORDER BY created_at');
        odm_json(['items' => array_map(static fn(array $row): array => $row + ['current' => $row['id'] === $session['card_id']], $rows)]);
    }

    if ($action === 'card' && $method === 'POST') {
        $data = odm_input(ODM_MAX_SMALL_JSON_BYTES);
        if ((int)(odm_one('SELECT COUNT(*) AS total FROM cards')['total'] ?? 0) >= ODM_MAX_CARDS) {
            odm_fail('Kartiček je už ' . ODM_MAX_CARDS . '. Nejdřív nějakou zruš.', 409);
        }
        $id = odm_card_id($data['id'] ?? null);
        $auth = odm_b64($data['auth'] ?? null, 32, 32, 'otisk kartičky');
        odm_b64($data['wrapped_dek'] ?? null, 60, 60, 'zabalený klíč');
        if (odm_one('SELECT id FROM cards WHERE id = ? OR auth_hash = ?', [$id, hash('sha256', $auth)]) !== null) {
            odm_fail('Taková kartička už existuje.', 409);
        }
        odm_exec('INSERT INTO cards (id, label, auth_hash, wrapped_dek, created_at) VALUES (?, ?, ?, ?, ?)', [
            $id, odm_label($data['label'] ?? '', 'Kartička'), hash('sha256', $auth), $data['wrapped_dek'], odm_now(),
        ]);
        odm_json(['ok' => true], 201);
    }

    if ($action === 'card' && $method === 'DELETE') {
        $id = odm_card_id($_GET['id'] ?? null);
        if ((int)(odm_one('SELECT COUNT(*) AS total FROM cards')['total'] ?? 0) <= 1) {
            odm_fail('Poslední kartičku zrušit nejde, jinak by se do aplikace nedalo přihlásit.', 409);
        }
        odm_exec('DELETE FROM cards WHERE id = ?', [$id]);
        odm_json(['ok' => true, 'ended' => $id === $session['card_id']]);
    }

    if ($action === 'devices' && $method === 'GET') {
        $rows = odm_all('SELECT d.id, d.label, d.created_at, d.last_used_at, c.label AS card_label FROM devices d JOIN cards c ON c.id = d.card_id ORDER BY d.created_at');
        odm_json(['items' => array_map(static fn(array $row): array => $row + ['current' => $row['id'] === $session['device_id']], $rows)]);
    }

    if ($action === 'device' && $method === 'POST') {
        $data = odm_input(ODM_MAX_SMALL_JSON_BYTES);
        $proof = odm_b64($data['pin_proof'] ?? null, 32, 32, 'PIN');
        if ((int)(odm_one('SELECT COUNT(*) AS total FROM devices')['total'] ?? 0) >= ODM_MAX_DEVICES) {
            odm_fail('Zařízení je už ' . ODM_MAX_DEVICES . '. Nejdřív nějaké odeber.', 409);
        }
        $id = bin2hex(random_bytes(16));
        $share = base64_encode(random_bytes(32));
        odm_exec('INSERT INTO devices (id, card_id, label, pin_hash, server_share, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
            $id, $session['card_id'], odm_label($data['label'] ?? '', 'Zařízení'), password_hash(base64_encode($proof), PASSWORD_DEFAULT), $share, odm_now(), odm_now(),
        ]);
        odm_exec('UPDATE sessions SET device_id = ? WHERE id = ?', [$id, $session['id']]);
        odm_json(['device_id' => $id, 'server_share' => $share], 201);
    }

    if ($action === 'device' && $method === 'DELETE') {
        $id = (string)($_GET['id'] ?? '');
        if (!preg_match('/^[a-f0-9]{32}$/', $id)) {
            odm_fail('Neplatné zařízení.', 422);
        }
        odm_exec('DELETE FROM devices WHERE id = ?', [$id]);
        odm_json(['ok' => true, 'ended' => $id === $session['device_id']]);
    }

    odm_fail('Neznámá operace.', 404);
} catch (Throwable $error) {
    error_log('Odmeny: ' . $error->__toString());
    odm_fail('Server operaci nedokončil.', 500);
}
