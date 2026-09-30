<?php
declare(strict_types=1);

// Router pro vestavěný PHP server (testy a vývoj). Na serveru s Apachem se
// nepoužívá; stejná pravidla tam drží deploy/apache-odmeny_v2.conf.
$path = rawurldecode((string)(parse_url((string)($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/'));

if (preg_match('#(^|/)(data|lib|bin|private|tests|deploy)(/|$)#i', $path) || preg_match('#(^|/)\.#', $path)
    || preg_match('#\.(md|txt|zip|py|sh|ini|json|sqlite3|lock|log|bak)$#i', $path) || basename($path) === 'dev-router.php') {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Nenalezeno.';
    return true;
}
return false;
