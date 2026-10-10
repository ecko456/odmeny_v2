#!/usr/bin/env bash
set -euo pipefail

# Obnoví přibalené knihovny serveru v lib/vendor (SDK Anthropicu a Guzzle) podle lib/composer.lock.
# Jen pro vývoj: server composer nemá ani nepotřebuje, knihovny jsou v repozitáři.
#   bash deploy/vendor.sh            # stejné verze jako v composer.lock
#   bash deploy/vendor.sh --update   # novější verze podle lib/composer.json (pak spusť testy)
cd "$(dirname "${BASH_SOURCE[0]}")/../lib"
rm -rf vendor
if [[ "${1:-}" == "--update" ]]; then
  composer update --no-interaction --no-progress --no-dev --prefer-dist
else
  composer install --no-interaction --no-progress --no-dev --prefer-dist
fi
# Bez testů, dokumentace a ukázek; ze standard-webhooks jen část pro PHP.
find vendor -name .git -type d -prune -exec rm -rf {} +
for d in tests Tests test docs doc examples fixtures scripts .github; do
  find vendor -type d -name "$d" -prune -exec rm -rf {} +
done
for d in vendor/standard-webhooks/standard-webhooks/libraries/*; do
  [[ "$d" != */php ]] && rm -rf "$d"
done
rm -rf vendor/standard-webhooks/standard-webhooks/spec vendor/standard-webhooks/standard-webhooks/assets
php -r 'require "vendor/autoload.php"; exit(class_exists("Anthropic\\Client") && class_exists("GuzzleHttp\\Client") ? 0 : 1);'
echo "lib/vendor obnoven ($(du -sh vendor | cut -f1))."
