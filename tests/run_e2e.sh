#!/bin/bash
# Souběžný běh prohlížečových testů (2.63). Každý test dostane vlastní adresář ($OUT/<test>),
# vlastní data a vlastní PHP server na svém portu, takže si testy navzájem nepřekážejí.
#
#   bash tests/run_e2e.sh                    # všechny e2e_*.js (kromě těch, co potřebují Apache)
#   bash tests/run_e2e.sh e2e_shortage e2e_ai
#   JOBS=2 bash tests/run_e2e.sh             # počet testů najednou (výchozí: počet jader)
#
# Proměnné: PW (cesta k balíčku playwright), CHROME (Chromium), OUT (kam výstupy a snímky).
# Testy aktualizace a „vedle ostré verze“ (e2e_upgrade*, e2e_vedle) běží proti Apachi, tady ne.
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
JOBS=${JOBS:-$(nproc 2>/dev/null || echo 4)}
OUT=${OUT:-${TMPDIR:-/tmp}/odmeny-e2e}
export ROOT OUT
export PW=${PW:-$(npm root -g 2>/dev/null)/playwright}
export CHROME=${CHROME:-/opt/pw-browsers/chromium}
export NO_PROXY=127.0.0.1 no_proxy=127.0.0.1

if [ $# -gt 0 ]; then
  TESTS=("$@")
else
  mapfile -t TESTS < <(cd "$ROOT/tests" && ls e2e_*.js | sed 's/\.js$//' | grep -v -E '^e2e_(upgrade|vedle)')
fi
mkdir -p "$OUT"

run_one() {
  local idx=${1%%:*} name=${1#*:}
  local dir="$OUT/$name" port=$((8500 + idx))
  rm -rf "$dir"; mkdir -p "$dir/odme2e"
  local env=(ODMENY_DATA_DIR="$dir/odme2e")
  [ "$name" = e2e_ai ] && env+=(ODMENY_AI_BASE_URL=http://127.0.0.1:8598)
  (cd "$ROOT" && exec env "${env[@]}" php -S 127.0.0.1:$port -t . dev-router.php > "$dir/php.log" 2>&1) &
  local srv=$!
  for _ in $(seq 1 100); do
    curl -s -o /dev/null -H 'X-Odmeny: 1' "http://127.0.0.1:$port/api.php?action=state" && break
    sleep 0.1
  done
  local start=$SECONDS
  (cd "$ROOT" && S="$dir" BASE="http://127.0.0.1:$port/" timeout 900 node "tests/$name.js" > "$dir/out.log" 2>&1)
  local code=$?
  kill "$srv" 2>/dev/null; wait "$srv" 2>/dev/null
  local took=$((SECONDS - start))
  if [ $code -ne 0 ] || grep -q 'PROBLÉMY' "$dir/out.log"; then
    echo "FAIL $name (${took} s, kód $code) – $dir/out.log"
    tail -8 "$dir/out.log" | sed 's/^/     /'
  else
    echo "ok   $name (${took} s): $(tail -1 "$dir/out.log")"
  fi
}
export -f run_one

start=$SECONDS
i=0
for t in "${TESTS[@]}"; do echo "$i:$t"; i=$((i + 1)); done \
  | xargs -P "$JOBS" -I{} bash -c 'run_one "$@"' _ {} | tee "$OUT/summary.txt"
fails=$(grep -c '^FAIL' "$OUT/summary.txt")
echo "Hotovo za $((SECONDS - start)) s: ${#TESTS[@]} testů, chyb $fails (výstupy v $OUT)."
[ "$fails" -eq 0 ]
