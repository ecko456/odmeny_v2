#!/usr/bin/env bash
set -euo pipefail

# Instalace i aktualizace aplikace Odměny (Ubuntu + Apache):
#   sudo bash odmeny/deploy/install.sh
# Aplikace běží na adrese /odmeny/ vedle Trading Desku, ale nemá s ním nic společného:
# vlastní adresář, vlastní data i vlastní přihlašování.
#
# Aktualizace data nemaže: šifrovaná databáze leží mimo web v /var/lib/odmeny a před
# každou aktualizací se zazálohuje do /var/lib/odmeny/backups (posledních 10 kopií).

if [[ "${EUID}" -ne 0 ]]; then
  echo "Spusť instalaci přes sudo: sudo bash odmeny/deploy/install.sh"
  exit 1
fi

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Pojistka: rozpracovaná verze (existuje odmeny/ROZPRACOVANO.md) se neinstaluje, dokud neprojde
# testy. Běžící aplikace na serveru tak zůstane beze změny.
if [[ -f "${SOURCE_DIR}/ROZPRACOVANO.md" && "${ODMENY_FORCE:-}" != "1" ]]; then
  echo "Tahle verze Odměn je rozpracovaná a ještě není ověřená (viz odmeny/ROZPRACOVANO.md)."
  echo "Instalaci jsem přerušil, na serveru se nic nezměnilo."
  exit 1
fi

TARGET_DIR="/var/www/odmeny"
DATA_DIR="/var/lib/odmeny"
APACHE_CONF="/etc/apache2/conf-available/odmeny.conf"
DB_FILE="${DATA_DIR}/odmeny.sqlite3"

UPDATE=0
if [[ -f "${DB_FILE}" ]]; then
  UPDATE=1
fi

apt-get update
apt-get install -y apache2 php php-cli php-sqlite3 php-mbstring rsync

install -d -m 0750 -o root -g www-data "${TARGET_DIR}"
install -d -m 0700 -o www-data -g www-data "${DATA_DIR}"

BACKUP_FILE=""
if [[ "${UPDATE}" -eq 1 ]]; then
  echo "Nalezena existující data, dělám zálohu databáze před aktualizací…"
  install -d -m 0700 -o root -g root "${DATA_DIR}/backups"
  BACKUP_FILE="$(ODMENY_DATA_DIR="${DATA_DIR}" php "${SOURCE_DIR}/bin/backup-db.php" "${DATA_DIR}/backups")"
  # Záloha běžela jako root: soubory databáze musí dál patřit webovému serveru.
  chown www-data:www-data "${DATA_DIR}"/odmeny.sqlite3* 2>/dev/null || true
  if [[ ! -s "${BACKUP_FILE}" ]]; then
    echo "Záloha databáze se nepovedla, aktualizaci přerušuji. Data zůstala beze změny."
    exit 1
  fi
fi

rsync -a --delete \
  --exclude '/data/' \
  --exclude '/tests/' \
  --exclude '/deploy/' \
  --exclude '/dev-router.php' \
  --exclude '/README.md' \
  --exclude '/ROZPRACOVANO.md' \
  --exclude '.*' \
  "${SOURCE_DIR}/" "${TARGET_DIR}/"

chown -R root:www-data "${TARGET_DIR}"
find "${TARGET_DIR}" -type d -exec chmod 0750 {} +
find "${TARGET_DIR}" -type f -exec chmod 0640 {} +
chown www-data:www-data "${DATA_DIR}"
find "${DATA_DIR}" -maxdepth 1 -type f -name 'odmeny.sqlite3*' -exec chown www-data:www-data {} +
chmod 0700 "${DATA_DIR}"

install -m 0644 "${SOURCE_DIR}/deploy/apache-odmeny.conf" "${APACHE_CONF}"
# Ochranné hlavičky pro statické soubory (apache-odmeny.conf) potřebují mod_headers.
a2enmod headers >/dev/null
a2enconf odmeny >/dev/null

apache2ctl configtest

if command -v systemctl >/dev/null 2>&1 && systemctl is-system-running >/dev/null 2>&1; then
  systemctl enable apache2 >/dev/null 2>&1 || true
  systemctl reload apache2 || systemctl restart apache2
else
  service apache2 reload || service apache2 start
fi

# Nové tabulky (osobní nastavení) si databáze doplní sama; tady se jen ověří, že jde otevřít.
if [[ "${UPDATE}" -eq 1 ]]; then
  runuser -u www-data -- env ODMENY_DATA_DIR="${DATA_DIR}" php -r 'require "/var/www/odmeny/lib/odmeny.php"; odm_db(); echo "Databáze v pořádku.\n";'
fi

# Dokud neexistuje žádná kartička, vypíše se jednorázový kód pro první spuštění.
SETUP_CODE="$(runuser -u www-data -- env ODMENY_DATA_DIR="${DATA_DIR}" php "${TARGET_DIR}/bin/setup-token.php" 2>/dev/null || true)"

echo
if [[ "${UPDATE}" -eq 1 ]]; then
  echo "Odměny jsou aktualizované. Data zůstala zachovaná."
  echo "Záloha databáze před aktualizací: ${BACKUP_FILE}"
  echo "Kdo měl aplikaci otevřenou, obnoví stránku a přihlásí se znovu."
else
  echo "Odměny jsou nainstalované: https://<adresa-serveru>/odmeny/"
fi
echo "Šifrovaná data: ${DATA_DIR}"
if [[ -n "${SETUP_CODE}" && "${SETUP_CODE}" != *"nastavená"* ]]; then
  echo
  echo "První spuštění: otevři aplikaci přes HTTPS, zadej tento kód a vytvoř přístupovou kartičku:"
  echo "  ${SETUP_CODE}"
  echo
  echo "Kód znovu vypíše:"
  echo "  sudo runuser -u www-data -- env ODMENY_DATA_DIR=${DATA_DIR} php ${TARGET_DIR}/bin/setup-token.php"
fi
