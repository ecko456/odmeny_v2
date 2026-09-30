<?php
declare(strict_types=1);

// Kopie dat ostré verze Odměn do verze 2 (na zkoušku):
//   php bin/copy-db.php /var/lib/odmeny/odmeny.sqlite3 /var/lib/odmeny_v2/odmeny.sqlite3
// Ostrá databáze se otevře jen pro čtení a nic se v ní nemění. Kopie je konzistentní i za
// běhu (VACUUM INTO) a data v ní zůstávají šifrovaná. Kartičky i historie verzí se přenesou,
// takže se do verze 2 přihlásíš stejnou kartičkou. Relace, pokusy o přihlášení a zapamatovaná
// zařízení s PINem se nepřenáší: verze 2 má v prohlížeči vlastní zařízení.
// Spouští ho deploy/install.sh jako www-data (soubory databáze musí patřit webovému serveru).
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$source = (string)($argv[1] ?? '');
$target = (string)($argv[2] ?? '');
if ($source === '' || !is_file($source)) {
    fwrite(STDERR, "Ostrá databáze neexistuje: $source\n");
    exit(1);
}
if ($target === '' || !is_dir(dirname($target))) {
    fwrite(STDERR, "Cílový adresář neexistuje: " . dirname($target) . "\n");
    exit(1);
}
if (realpath(dirname($source)) === realpath(dirname($target))) {
    fwrite(STDERR, "Zdroj a cíl jsou ve stejném adresáři, kopii nedělám.\n");
    exit(1);
}
if (file_exists($target)) {
    fwrite(STDERR, "Cílová databáze už existuje: $target (nejdřív ji zazálohuj a odstraň).\n");
    exit(1);
}

$temporary = dirname($target) . DIRECTORY_SEPARATOR . 'kopie-' . bin2hex(random_bytes(4)) . '.sqlite3';
try {
    $live = new PDO('sqlite:' . $source, null, null, [PDO::SQLITE_ATTR_OPEN_FLAGS => PDO::SQLITE_OPEN_READONLY]);
    $live->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $live->exec('PRAGMA busy_timeout = 10000');
    $live->prepare('VACUUM INTO ?')->execute([$temporary]);
    $live = null;

    $copy = new PDO('sqlite:' . $temporary);
    $copy->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $tables = $copy->query("SELECT name FROM sqlite_master WHERE type = 'table'")->fetchAll(PDO::FETCH_COLUMN);
    foreach (['sessions', 'attempts', 'devices'] as $table) {
        if (in_array($table, $tables, true)) {
            $copy->exec("DELETE FROM $table");
        }
    }
    $cards = (int)$copy->query('SELECT COUNT(*) FROM cards')->fetchColumn();
    $versions = (int)$copy->query('SELECT COUNT(*) FROM versions')->fetchColumn();
    $copy = null;
} catch (Throwable $error) {
    @unlink($temporary);
    fwrite(STDERR, 'Kopie se nepovedla: ' . $error->getMessage() . "\n");
    exit(1);
}
@chmod($temporary, 0600);
if (!rename($temporary, $target)) {
    @unlink($temporary);
    fwrite(STDERR, "Kopii nejde přesunout na místo: $target\n");
    exit(1);
}
fwrite(STDOUT, "Zkopírováno: kartiček $cards, uložených verzí $versions.\n");
