#!/usr/bin/env bash
set -euo pipefail

# Instalace i aktualizace Odměn verze 2 (Ubuntu + Apache):
#   sudo bash /root/odmeny_v2/deploy/install.sh
# Verze 2 běží samostatně na adrese /odmeny_v2/, vedle ostré verze na /odmeny/. Má vlastní
# kód (/var/www/odmeny_v2), vlastní šifrovaná data (/var/lib/odmeny_v2), vlastní konfiguraci
# Apache i vlastní přihlášení. Ostré verze (/var/www/odmeny, /var/lib/odmeny, odmeny.conf) se
# tahle instalace nikdy nedotkne.
#
# Kopie ostrých dat do verze 2, ať jde zkoušet na skutečných datech:
#   sudo ODMENY_KOPIE=1 bash /root/odmeny_v2/deploy/install.sh
# Ostrá databáze se jen čte. Když už verze 2 nějaká data má, nejdřív se zazálohují do
# /var/lib/odmeny_v2/backups a pak je nahradí čerstvá kopie.
#
# Aktualizace data nemaže: před každou aktualizací se databáze verze 2 zazálohuje do
# /var/lib/odmeny_v2/backups (posledních 10 kopií).

if [[ "${EUID}" -ne 0 ]]; then
  echo "Spusť instalaci přes sudo: sudo bash /root/odmeny_v2/deploy/install.sh"
  exit 1
fi

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Pojistka: rozpracovaná verze (existuje ROZPRACOVANO.md) se neinstaluje, dokud neprojde
# testy. Běžící aplikace na serveru tak zůstane beze změny.
if [[ -f "${SOURCE_DIR}/ROZPRACOVANO.md" && "${ODMENY_FORCE:-}" != "1" ]]; then
  echo "Tahle verze Odměn je rozpracovaná a ještě není ověřená (viz ROZPRACOVANO.md)."
  echo "Instalaci jsem přerušil, na serveru se nic nezměnilo."
  exit 1
fi

TARGET_DIR="/var/www/odmeny_v2"
DATA_DIR="/var/lib/odmeny_v2"
APACHE_CONF="/etc/apache2/conf-available/odmeny_v2.conf"
DB_FILE="${DATA_DIR}/odmeny.sqlite3"
# Ostrá verze: jen zdroj pro ODMENY_KOPIE=1, otevírá se pouze pro čtení.
LIVE_DB="/var/lib/odmeny/odmeny.sqlite3"

COPY=0
if [[ "${ODMENY_KOPIE:-}" == "1" ]]; then
  COPY=1
  if [[ ! -f "${LIVE_DB}" ]]; then
    echo "Ostrá databáze ${LIVE_DB} neexistuje, není co kopírovat. Na serveru se nic nezměnilo."
    exit 1
  fi
fi

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
  echo "Nalezena existující data verze 2, dělám zálohu databáze…"
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
  --exclude 'CLAUDE.md' \
  --exclude '/ROZPRACOVANO.md' \
  --exclude '.*' \
  "${SOURCE_DIR}/" "${TARGET_DIR}/"

chown -R root:www-data "${TARGET_DIR}"
find "${TARGET_DIR}" -type d -exec chmod 0750 {} +
find "${TARGET_DIR}" -type f -exec chmod 0640 {} +
chown www-data:www-data "${DATA_DIR}"
find "${DATA_DIR}" -maxdepth 1 -type f -name 'odmeny.sqlite3*' -exec chown www-data:www-data {} +
chmod 0700 "${DATA_DIR}"

# Kopie ostrých dat: běží jako www-data (soubory SQLite musí patřit webovému serveru), ostrou
# databázi otevře jen pro čtení. Stará data verze 2 jsou v tu chvíli už zazálohovaná.
COPY_RESULT=""
if [[ "${COPY}" -eq 1 ]]; then
  rm -f "${DB_FILE}" "${DB_FILE}-wal" "${DB_FILE}-shm" "${DATA_DIR}/setup-token.txt"
  if ! COPY_RESULT="$(runuser -u www-data -- php "${TARGET_DIR}/bin/copy-db.php" "${LIVE_DB}" "${DB_FILE}")"; then
    echo "Kopie ostrých dat se nepovedla. Ostrá verze /odmeny/ zůstala beze změny."
    [[ -n "${BACKUP_FILE}" ]] && echo "Předchozí data verze 2 jsou v záloze: ${BACKUP_FILE}"
    exit 1
  fi
  UPDATE=1
fi

install -m 0644 "${SOURCE_DIR}/deploy/apache-odmeny_v2.conf" "${APACHE_CONF}"
# Ochranné hlavičky pro statické soubory (apache-odmeny_v2.conf) potřebují mod_headers.
a2enmod headers >/dev/null
a2enconf odmeny_v2 >/dev/null

apache2ctl configtest

if command -v systemctl >/dev/null 2>&1 && systemctl is-system-running >/dev/null 2>&1; then
  systemctl enable apache2 >/dev/null 2>&1 || true
  systemctl reload apache2 || systemctl restart apache2
else
  service apache2 reload || service apache2 start
fi

# Nové tabulky si databáze doplní sama; tady se jen ověří, že jde otevřít.
if [[ "${UPDATE}" -eq 1 ]]; then
  runuser -u www-data -- env ODMENY_DATA_DIR="${DATA_DIR}" php -r 'require "/var/www/odmeny_v2/lib/odmeny.php"; odm_db(); echo "Databáze v pořádku.\n";'
fi

# Dokud neexistuje žádná kartička, vypíše se jednorázový kód pro první spuštění.
SETUP_CODE="$(runuser -u www-data -- env ODMENY_DATA_DIR="${DATA_DIR}" php "${TARGET_DIR}/bin/setup-token.php" 2>/dev/null || true)"

echo
if [[ "${COPY}" -eq 1 ]]; then
  echo "Odměny verze 2 běží s kopií ostrých dat: https://<adresa-serveru>/odmeny_v2/"
  echo "${COPY_RESULT}"
  echo "Přihlas se stejnou kartičkou jako do /odmeny/. Změny ve verzi 2 se do ostré verze nepropíšou."
elif [[ "${UPDATE}" -eq 1 ]]; then
  echo "Odměny verze 2 jsou aktualizované. Data zůstala zachovaná."
else
  echo "Odměny verze 2 jsou nainstalované: https://<adresa-serveru>/odmeny_v2/"
fi
if [[ -n "${BACKUP_FILE}" ]]; then
  echo "Záloha databáze verze 2 před změnou: ${BACKUP_FILE}"
fi
echo "Šifrovaná data verze 2: ${DATA_DIR}. Ostrá verze /odmeny/ zůstala beze změny."
if [[ -n "${SETUP_CODE}" && "${SETUP_CODE}" != *"nastavená"* ]]; then
  echo
  echo "První spuštění: otevři https://<adresa-serveru>/odmeny_v2/, zadej tento kód a vytvoř přístupovou kartičku:"
  echo "  ${SETUP_CODE}"
  echo
  echo "Kód znovu vypíše:"
  echo "  sudo runuser -u www-data -- env ODMENY_DATA_DIR=${DATA_DIR} php ${TARGET_DIR}/bin/setup-token.php"
  echo "Nebo místo nové kartičky vezmi kopii ostrých dat: sudo ODMENY_KOPIE=1 bash /root/odmeny_v2/deploy/install.sh"
fi
