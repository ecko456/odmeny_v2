<?php
declare(strict_types=1);

require __DIR__ . '/lib/odmeny.php';

// Stránka je jen zámek. Aplikace se načte až po odemčení (app.php) a data
// přijdou zašifrovaná; bez kartičky nebo PINu tu nikdo nic nevidí.
odm_require_https();
odm_security_headers();
header('Cache-Control: no-store');

$asset = static function (string $path): string {
    $file = __DIR__ . '/' . $path;
    return htmlspecialchars($path . '?v=' . (is_file($file) ? (string)filemtime($file) : '1'), ENT_QUOTES);
};
$privateVersion = (string)max(array_map(static fn(string $file): int => (int)filemtime($file), glob(__DIR__ . '/private/*') ?: [__FILE__]));
?><!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light dark">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <meta name="theme-color" content="#0e6b5d">
  <title>Odměny 2</title>
  <link rel="icon" href="<?= $asset('static/icon.svg') ?>" type="image/svg+xml">
  <link rel="stylesheet" href="<?= $asset('static/lock.css') ?>">
</head>
<body data-private-version="<?= htmlspecialchars($privateVersion, ENT_QUOTES) ?>">
  <main class="lock" id="lock">
    <section class="lock-card" id="lockCard" aria-live="polite">
      <div class="lock-brand">
        <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14.5" r="5.5"/><path d="M9 9.5 6.5 3h4L12 6.5 13.5 3h4L15 9.5"/><path d="m12 11.8.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z"/></svg></span>
        <div><strong>Odměny</strong><small>Hodnocení operátorů · verze 2</small></div>
      </div>
      <div id="lockBody"><div class="spinner" role="status" aria-label="Načítám"></div></div>
    </section>
  </main>
  <div id="app" hidden></div>
  <div id="printCard" aria-hidden="true"></div>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <noscript><p class="note e">Aplikace potřebuje zapnutý JavaScript.</p></noscript>
  <script src="<?= $asset('static/vendor/qrcode.js') ?>"></script>
  <script src="<?= $asset('static/vault.js') ?>"></script>
  <script src="<?= $asset('static/lock.js') ?>"></script>
</body>
</html>
