<?php
declare(strict_types=1);

/*
 * Klíč k API Anthropicu pro přeformulování textu v Top 5 (tlačítko ✦).
 * Spouští se jako www-data, aby soubor patřil uživateli webového serveru:
 *
 *   sudo runuser -u www-data -- env ODMENY_DATA_DIR=/var/lib/odmeny_v2 php /var/www/odmeny_v2/bin/ai-key.php          # uložit klíč (zeptá se, nezobrazuje ho)
 *   sudo runuser -u www-data -- env ODMENY_DATA_DIR=/var/lib/odmeny_v2 php /var/www/odmeny_v2/bin/ai-key.php --test   # zkušební přeformulování
 *   sudo runuser -u www-data -- env ODMENY_DATA_DIR=/var/lib/odmeny_v2 php /var/www/odmeny_v2/bin/ai-key.php --stav   # je zapnuté?
 *   sudo runuser -u www-data -- env ODMENY_DATA_DIR=/var/lib/odmeny_v2 php /var/www/odmeny_v2/bin/ai-key.php --smazat # vypnout (smaže klíč)
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require dirname(__DIR__) . '/lib/odmeny.php';
require dirname(__DIR__) . '/lib/ai.php';

$command = $argv[1] ?? '';
$path = odm_ai_key_path();
$say = static fn(string $text) => fwrite(STDOUT, $text . "\n");

if ($command === '--smazat') {
    if (is_file($path)) {
        unlink($path);
    }
    $say('Klíč smazán, přeformulování je vypnuté.');
    exit(0);
}

if ($command === '--stav') {
    $key = odm_ai_key();
    $say($key === null ? 'Klíč není uložený, přeformulování je vypnuté.' : 'Klíč je uložený (…' . substr($key, -4) . ').');
    if (PHP_VERSION_ID < 80100) {
        $say('Pozor: PHP ' . PHP_VERSION . ' je starší než 8.1, knihovna Anthropicu na něm neběží.');
    }
    if (!extension_loaded('curl')) {
        $say('Chybí rozšíření PHP curl (sudo apt-get install php-curl). Zkusí se náhradní spojení přes https.');
    }
    $say(odm_ai_available() ? 'Přeformulování je zapnuté (' . ODM_AI_MODEL . ').' : 'Přeformulování je vypnuté.');
    exit(0);
}

if ($command === '--test') {
    try {
        $say('Odesílám zkušební větu…');
        $say('Výsledek: ' . odm_ai_rewrite('dil se upina rucne bez dorazu a kazdej kus se musi dorovnat, to trva'));
        exit(0);
    } catch (RuntimeException $error) {
        $say('Chyba: ' . $error->getMessage());
        exit(1);
    }
}

if ($command !== '') {
    $say('Neznámý příkaz. Bez parametru uloží klíč, dále --test, --stav, --smazat.');
    exit(2);
}

/* Uložení klíče: z terminálu bez zobrazení, nebo ze standardního vstupu. */
$tty = function_exists('posix_isatty') ? posix_isatty(STDIN) : true;
fwrite(STDOUT, 'Vlož klíč k API Anthropicu (sk-ant-…) a stiskni Enter: ');
if ($tty) {
    shell_exec('stty -echo 2>/dev/null');
}
$key = trim((string)fgets(STDIN));
if ($tty) {
    shell_exec('stty echo 2>/dev/null');
    fwrite(STDOUT, "\n");
}
if (!preg_match('/^[A-Za-z0-9_\-]{8,400}$/', $key)) {
    $say('Tohle nevypadá jako klíč, nic jsem neuložil.');
    exit(1);
}
$dir = dirname($path);
if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
    $say('Datový adresář neexistuje: ' . $dir);
    exit(1);
}
$tmp = $path . '.tmp';
$old = umask(0077);
$ok = file_put_contents($tmp, $key . "\n") !== false && chmod($tmp, 0600) && rename($tmp, $path);
umask($old);
if (!$ok) {
    @unlink($tmp);
    $say('Klíč se nepodařilo uložit do ' . $path . '.');
    exit(1);
}
$say('Klíč uložen (…' . substr($key, -4) . '). Vyzkoušej ho: stejný příkaz s --test.');
