<?php
declare(strict_types=1);

require __DIR__ . '/lib/odmeny.php';

// Soubory samotné aplikace dostane jen odemčená relace. Zamčená stránka tak
// neprozradí ani to, co aplikace obsahuje.
odm_security_headers();

const ODM_PRIVATE_FILES = [
    'app.html' => ['private/app.html', 'text/html; charset=utf-8'],
    'app.css' => ['private/app.css', 'text/css; charset=utf-8'],
    'core.js' => ['private/core.js', 'text/javascript; charset=utf-8'],
    'app.js' => ['private/app.js', 'text/javascript; charset=utf-8'],
    'xlsx.js' => ['private/vendor/xlsx.full.min.js', 'text/javascript; charset=utf-8'],
    // Export pravidel do PDF vzniká v prohlížeči (data jsou šifrovaná, server je nevidí).
    'jspdf.js' => ['private/vendor/jspdf.umd.min.js', 'text/javascript; charset=utf-8'],
    'pdf-regular.ttf' => ['private/vendor/plex-sans-regular.ttf', 'font/ttf'],
    'pdf-semibold.ttf' => ['private/vendor/plex-sans-semibold.ttf', 'font/ttf'],
];

$name = (string)($_GET['f'] ?? '');
if (!isset(ODM_PRIVATE_FILES[$name])) {
    http_response_code(404);
    exit;
}
if (odm_session() === null) {
    http_response_code(401);
    header('Cache-Control: no-store');
    exit;
}
[$path, $type] = ODM_PRIVATE_FILES[$name];
$file = __DIR__ . '/' . $path;
header('Content-Type: ' . $type);
header('Content-Length: ' . (string)filesize($file));
header('Cache-Control: private, max-age=86400');
readfile($file);
