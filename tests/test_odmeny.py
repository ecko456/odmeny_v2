"""Odměny: server, šifrovaný tok v prohlížečovém kódu a výpočty.

python3 -m unittest discover -s tests
"""

from datetime import datetime, timedelta, timezone
from http.cookiejar import CookieJar
from pathlib import Path
import base64
import http.client
import json
import os
import re
import secrets
import shutil
import socket
import sqlite3
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request

APP = Path(__file__).resolve().parents[1]
PHP = shutil.which("php")
ODM_HOURLY_DAYS = 7
NODE = shutil.which("node")


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def b64(size):
    return base64.b64encode(secrets.token_bytes(size)).decode()


class Server:
    def __init__(self, data=None):
        self.data = Path(data) if data else Path(tempfile.mkdtemp(prefix="odmeny-"))
        self.port = free_port()
        self.base = f"http://127.0.0.1:{self.port}"
        env = dict(os.environ, ODMENY_DATA_DIR=str(self.data), NO_PROXY="*")
        self.process = subprocess.Popen(
            [PHP, "-S", f"127.0.0.1:{self.port}", "dev-router.php"],
            cwd=APP, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        for _ in range(100):
            try:
                with socket.create_connection(("127.0.0.1", self.port), timeout=0.2):
                    return
            except OSError:
                time.sleep(0.05)
        raise RuntimeError("PHP server se nespustil")

    def stop(self):
        self.process.terminate()
        self.process.wait(timeout=5)
        shutil.rmtree(self.data, ignore_errors=True)


class Client:
    def __init__(self, server):
        self.server = server
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(CookieJar()))

    def request(self, method, path, body=None, headers=None):
        data = json.dumps(body).encode() if body is not None else None
        all_headers = {"Content-Type": "application/json"} if data is not None else {}
        all_headers.update(headers or {})
        request = urllib.request.Request(self.server.base + path, data=data, method=method, headers=all_headers)
        try:
            with self.opener.open(request, timeout=10) as response:
                return response.status, dict(response.headers), response.read()
        except urllib.error.HTTPError as error:
            return error.code, dict(error.headers), error.read()

    def api(self, method, action, body=None, headers=None, query=""):
        status, _, raw = self.request(method, f"/api.php?action={action}{query}", body, {"X-Odmeny": "1", "X-Odmeny-Client": "3", "Sec-Fetch-Site": "same-origin", **(headers or {})})
        return status, json.loads(raw or b"{}")

    def setup(self):
        self.api("GET", "state")
        token = (self.server.data / "setup-token.txt").read_text().strip()
        card = {"id": secrets.token_hex(8), "auth": b64(32), "wrapped_dek": b64(60), "label": "Test"}
        status, result = self.api("POST", "setup", {"token": token, "card": card})
        assert status == 201, result
        return card


@unittest.skipIf(PHP is None, "PHP není nainstalované")
class OdmenyHttpTests(unittest.TestCase):
    def setUp(self):
        self.server = Server()
        self.client = Client(self.server)

    def tearDown(self):
        self.server.stop()

    def test_lock_page_headers(self):
        status, headers, body = self.client.request("GET", "/")
        self.assertEqual(status, 200)
        csp = headers["Content-Security-Policy"]
        self.assertIn("script-src 'self'", csp)
        self.assertIn("frame-ancestors 'none'", csp)
        self.assertNotIn("unsafe-inline", csp)
        self.assertEqual(headers["X-Frame-Options"], "DENY")
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertNotIn("X-Powered-By", headers)
        page = body.decode()
        # Zamčená stránka neobsahuje nic z aplikace ani inline skript.
        self.assertNotIn("Tabáky celkem", page)
        self.assertNotIn("<script>", page)
        self.assertNotIn("style=", page)

    def test_private_code_needs_session(self):
        for name in ("app.html", "app.css", "core.js", "app.js", "xlsx.js", "jspdf.js", "pdf-regular.ttf", "pdf-semibold.ttf"):
            status, _, body = self.client.request("GET", f"/app.php?f={name}")
            self.assertEqual(status, 401, name)
            self.assertEqual(body, b"")
        status, _, _ = self.client.request("GET", "/app.php?f=../lib/odmeny.php")
        self.assertEqual(status, 404)
        for path in ("/private/app.js", "/private/core.js", "/lib/odmeny.php", "/bin/setup-token.php", "/data/odmeny.sqlite3",
                     "/tests/test_odmeny.py", "/deploy/install.sh", "/dev-router.php", "/.gitignore", "/static/vendor/LICENSE-jsqr.txt",
                     "/private/vendor/jspdf.umd.min.js", "/private/vendor/plex-sans-regular.ttf", "/CLAUDE.md"):
            status, _, _ = self.client.request("GET", path)
            self.assertEqual(status, 404, path)
        self.client.setup()
        status, headers, body = self.client.request("GET", "/app.php?f=app.js")
        self.assertEqual(status, 200)
        self.assertIn("javascript", headers["Content-Type"])
        self.assertIn(b"OdmApp", body)
        # Knihovna a písma pro PDF s pravidly (PDF vzniká v prohlížeči).
        status, headers, body = self.client.request("GET", "/app.php?f=jspdf.js")
        self.assertEqual(status, 200)
        self.assertIn(b"jsPDF", body[:400])
        status, headers, body = self.client.request("GET", "/app.php?f=pdf-regular.ttf")
        self.assertEqual((status, headers["Content-Type"]), (200, "font/ttf"))
        self.assertEqual(body[:4], b"\x00\x01\x00\x00", "TrueType písmo")

    def test_api_rejects_foreign_requests(self):
        status, _, _ = self.client.request("GET", "/api.php?action=state")
        self.assertEqual(status, 403, "bez hlavičky X-Odmeny")
        status, _ = self.client.api("POST", "login", {"auth": b64(32)}, {"Sec-Fetch-Site": "cross-site"})
        self.assertEqual(status, 403)
        status, _, _ = self.client.request("POST", "/api.php?action=login", {"auth": b64(32)}, {"X-Odmeny": "1", "Origin": "https://evil.example"})
        self.assertEqual(status, 403)
        status, result = self.client.api("GET", "data")
        self.assertEqual(status, 401)
        self.assertTrue(result.get("locked"))

    def test_input_validation(self):
        status, _ = self.client.api("POST", "login", {"auth": "kratky"})
        self.assertEqual(status, 422)
        status, _ = self.client.api("POST", "login", {"auth": b64(31)})
        self.assertEqual(status, 422)
        status, _, _ = self.client.request("POST", "/api.php?action=login", None, {"X-Odmeny": "1", "Content-Type": "application/json"})
        self.assertEqual(status, 422)
        request = urllib.request.Request(self.server.base + "/api.php?action=login", data=b"{nejson", method="POST", headers={"X-Odmeny": "1"})
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.client.opener.open(request, timeout=10)
        self.assertEqual(caught.exception.code, 400)

    def test_setup_is_single_use_and_throttled(self):
        self.client.api("GET", "state")
        for _ in range(10):
            status, _ = self.client.api("POST", "setup", {"token": "SPATNY-KOD", "card": {}})
            self.assertEqual(status, 401)
        status, _ = self.client.api("POST", "setup", {"token": "SPATNY-KOD", "card": {}})
        self.assertEqual(status, 429)

    def test_login_throttled_and_session_flow(self):
        card = self.client.setup()
        status, result = self.client.api("GET", "state")
        self.assertTrue(result["authenticated"])
        self.assertFalse(result["setup_required"])
        self.assertFalse((self.server.data / "setup-token.txt").exists())
        self.client.api("POST", "logout")
        status, _ = self.client.api("GET", "data")
        self.assertEqual(status, 401)
        for _ in range(20):
            status, _ = self.client.api("POST", "login", {"auth": b64(32)})
            self.assertEqual(status, 401)
        status, _ = self.client.api("POST", "login", {"auth": card["auth"]})
        self.assertEqual(status, 429, "po 20 chybách se nepustí ani správná kartička")

    def test_session_cookie_flags(self):
        self.client.api("GET", "state")
        token = (self.server.data / "setup-token.txt").read_text().strip()
        card = {"id": secrets.token_hex(8), "auth": b64(32), "wrapped_dek": b64(60), "label": "Test"}
        status, headers, _ = self.client.request("POST", "/api.php?action=setup", {"token": token, "card": card}, {"X-Odmeny": "1"})
        self.assertEqual(status, 201)
        cookie = headers["Set-Cookie"].lower()
        self.assertIn("httponly", cookie)
        self.assertIn("samesite=strict", cookie)
        # Relace v databázi je jen jako otisk, ne samotný token.
        value = headers["Set-Cookie"].split(";")[0].split("=", 1)[1]
        with sqlite3.connect(self.server.data / "odmeny.sqlite3") as db:
            ids = [row[0] for row in db.execute("SELECT id FROM sessions")]
        self.assertNotIn(value, ids)
        self.assertEqual(len(ids[0]), 64)

    def test_conflict_and_history_thinning(self):
        self.client.setup()
        rev = 0
        for _ in range(40):
            status, result = self.client.api("POST", "data", {"blob": b64(40), "base_rev": rev})
            self.assertEqual(status, 200, result)
            rev = result["rev"]
        status, result = self.client.api("POST", "data", {"blob": b64(40), "base_rev": rev - 1})
        self.assertEqual(status, 409)
        self.assertEqual(result["rev"], rev)
        # Rychlé ukládání: celých zůstane posledních 30, starší z téže hodiny jen jedno.
        with sqlite3.connect(self.server.data / "odmeny.sqlite3") as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM versions").fetchone()[0], 31)
            # Historie rozložená do minulosti: 20 uložení před 12 dny, 30 před dnem a půl.
            now = datetime.now(timezone.utc)
            stamps = [now - timedelta(days=12) + timedelta(minutes=20 * i) for i in range(20)]
            stamps += [now - timedelta(hours=36) + timedelta(minutes=20 * i) for i in range(30)]
            db.execute("DELETE FROM versions")
            for stamp in stamps:
                db.execute("INSERT INTO versions (blob, size, created_at) VALUES (?, 40, ?)", (b64(40), stamp.strftime("%Y-%m-%dT%H:%M:%SZ")))
            rev = db.execute("SELECT MAX(rev) FROM versions").fetchone()[0]
        status, result = self.client.api("POST", "data", {"blob": b64(40), "base_rev": rev})
        self.assertEqual(status, 200, result)
        with sqlite3.connect(self.server.data / "odmeny.sqlite3") as db:
            kept = [(row[0], row[1]) for row in db.execute("SELECT rev, created_at FROM versions ORDER BY rev DESC")]
        self.assertEqual([r for r, _ in kept[:30]], list(range(result["rev"], result["rev"] - 30, -1)), "posledních 30 zůstává celých")
        older = kept[30:]
        self.assertTrue(2 <= len(older) <= 3, older)  # hodina před dnem a půl + den před 12 dny (případně přes půlnoc)
        week = (now - timedelta(days=ODM_HOURLY_DAYS)).strftime("%Y-%m-%dT%H")
        buckets = [stamp[:13] if stamp[:13] >= week else stamp[:10] for _, stamp in older]
        self.assertEqual(len(buckets), len(set(buckets)), "z každé hodiny nebo dne nejvýš jedna verze")
        self.assertTrue(any(stamp[:13] < week for _, stamp in older), "zůstal i denní stav z doby před týdnem")
        status, result = self.client.api("GET", "versions")
        self.assertEqual(len(result["items"]), len(kept))


@unittest.skipIf(PHP is None, "PHP není nainstalované")
class OdmenyVersion2Tests(unittest.TestCase):
    """Osobní nastavení, ochrana proti staré otevřené stránce, zálohy a hlavičky proxy."""

    def setUp(self):
        self.server = Server()
        self.client = Client(self.server)

    def tearDown(self):
        self.server.stop()

    def test_old_page_cannot_overwrite_new_data(self):
        self.client.setup()
        status, result = self.client.api("POST", "data", {"blob": b64(40), "base_rev": 0}, {"X-Odmeny-Client": ""})
        self.assertEqual(status, 426)
        self.assertTrue(result.get("reload"))
        status, result = self.client.api("POST", "data", {"blob": b64(40), "base_rev": 0}, {"X-Odmeny-Client": "1"})
        self.assertEqual(status, 426)
        # Stránka verze 2.0 by zahodila navýšení platu a „jen Kafe“ z verze 2.1.
        status, result = self.client.api("POST", "data", {"blob": b64(40), "base_rev": 0}, {"X-Odmeny-Client": "2"})
        self.assertEqual(status, 426)
        status, result = self.client.api("POST", "data", {"blob": b64(40), "base_rev": 0})
        self.assertEqual(status, 200, result)
        # Čtení a přihlášení staré stránce nevadí, jen zápis.
        status, _ = self.client.api("GET", "data", headers={"X-Odmeny-Client": ""})
        self.assertEqual(status, 200)

    def test_prefs_are_per_card(self):
        first = self.client.setup()
        status, result = self.client.api("GET", "me")
        self.assertEqual(status, 200)
        self.assertEqual(result["card_id"], first["id"])
        self.assertEqual(result["card_label"], "Test")
        self.assertEqual(result["version"], "2.1")
        status, result = self.client.api("GET", "prefs")
        self.assertEqual((status, result["blob"]), (200, None))
        mine = b64(80)
        self.assertEqual(self.client.api("POST", "prefs", {"blob": mine}, {"X-Odmeny-Client": ""})[0], 426)
        self.assertEqual(self.client.api("POST", "prefs", {"blob": "není base64!"})[0], 422)
        self.assertEqual(self.client.api("POST", "prefs", {"blob": b64(33 * 1024)})[0], 422)
        self.assertEqual(self.client.api("POST", "prefs", {"blob": b64(32 * 1024)})[0], 200, "největší povolené nastavení projde")
        self.assertEqual(self.client.api("POST", "prefs", {"blob": mine})[0], 200)
        self.assertEqual(self.client.api("GET", "prefs")[1]["blob"], mine)
        second = {"id": secrets.token_hex(8), "auth": b64(32), "wrapped_dek": b64(60), "label": "Kolega"}
        self.assertEqual(self.client.api("POST", "card", second)[0], 201)
        self.client.api("POST", "logout")
        self.assertEqual(self.client.api("GET", "prefs")[0], 401)
        self.assertEqual(self.client.api("POST", "login", {"auth": second["auth"]})[0], 200)
        self.assertIsNone(self.client.api("GET", "prefs")[1]["blob"], "druhá kartička má vlastní nastavení")
        theirs = b64(80)
        self.client.api("POST", "prefs", {"blob": theirs})
        self.client.api("POST", "logout")
        self.client.api("POST", "login", {"auth": first["auth"]})
        self.assertEqual(self.client.api("GET", "prefs")[1]["blob"], mine)
        # Zrušená kartička si nastavení neodnese do databáze.
        self.client.api("DELETE", "card", query=f"&id={second['id']}")
        with sqlite3.connect(self.server.data / "odmeny.sqlite3") as db:
            self.assertEqual([row[0] for row in db.execute("SELECT card_id FROM prefs")], [first["id"]])

    def test_small_endpoints_reject_large_bodies(self):
        status, _ = self.client.api("POST", "login", {"auth": b64(32), "pad": "x" * 70000})
        self.assertEqual(status, 413)

    def raw_get(self, path, headers):
        """GET bez sledování přesměrování (přesměrování vede na cizí adresu)."""
        connection = http.client.HTTPConnection("127.0.0.1", self.server.port, timeout=10)
        try:
            connection.request("GET", path, headers=headers)
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_forwarded_proto_and_host(self):
        # Cizí adresa přes HTTP: přesměrování na HTTPS, API nic neudělá.
        status, headers, _ = self.raw_get("/", {"Host": "odmeny.example"})
        self.assertEqual(status, 301)
        self.assertEqual(headers["Location"], "https://odmeny.example/")
        status, _, _ = self.raw_get("/api.php?action=state", {"Host": "odmeny.example", "X-Odmeny": "1"})
        self.assertEqual(status, 403)
        # Proxy na stejném stroji smí říct, že spojení je HTTPS (Secure cookie, HSTS).
        status, headers, _ = self.raw_get("/", {"Host": "odmeny.example", "X-Forwarded-Proto": "https"})
        self.assertEqual(status, 200)
        self.assertIn("max-age", headers.get("Strict-Transport-Security", ""))

    def test_backup_script(self):
        card = self.client.setup()
        self.client.api("POST", "data", {"blob": b64(40), "base_rev": 0})
        target = self.server.data / "zalohy"
        result = subprocess.run([PHP, str(APP / "bin" / "backup-db.php"), str(target)], capture_output=True, text=True, timeout=30,
                                env=dict(os.environ, ODMENY_DATA_DIR=str(self.server.data)))
        self.assertEqual(result.returncode, 0, result.stderr)
        files = list(target.glob("odmeny-*.sqlite3"))
        self.assertEqual(len(files), 1)
        self.assertEqual(Path(result.stdout.strip()), files[0])
        self.assertEqual(files[0].stat().st_mode & 0o777, 0o600)
        with sqlite3.connect(files[0]) as db:
            self.assertEqual([row[0] for row in db.execute("SELECT id FROM cards")], [card["id"]])
            self.assertEqual(db.execute("SELECT COUNT(*) FROM versions").fetchone()[0], 1)
        # Nechává se jen posledních 10 záloh.
        for index in range(12):
            (target / f"odmeny-2000010{index:02d}-000000.sqlite3").write_bytes(b"")
        subprocess.run([PHP, str(APP / "bin" / "backup-db.php"), str(target)], capture_output=True, timeout=30,
                       env=dict(os.environ, ODMENY_DATA_DIR=str(self.server.data)))
        self.assertEqual(len(list(target.glob("odmeny-*.sqlite3"))), 10)
        status, _, _ = self.client.request("GET", "/bin/backup-db.php")
        self.assertEqual(status, 404)

    def test_copy_of_live_data(self):
        # Kopie ostrých dat do verze 2: ostrá databáze se jen čte, kartičky a verze se přenesou,
        # relace, pokusy a zapamatovaná zařízení ne (verze 2 má v prohlížeči vlastní zařízení).
        card = self.client.setup()
        self.client.api("POST", "data", {"blob": b64(40), "base_rev": 0})
        self.client.api("POST", "device", {"pin_proof": b64(32), "label": "Telefon"})
        self.client.api("POST", "login", {"auth": b64(32)})  # neplatná kartička = záznam v attempts
        live = self.server.data / "odmeny.sqlite3"
        wal = Path(f"{live}-wal")
        snapshot = lambda: (live.read_bytes(), wal.read_bytes() if wal.exists() else b"")
        before = snapshot()
        target_dir = Path(tempfile.mkdtemp(prefix="odmeny-v2-"))
        self.addCleanup(shutil.rmtree, target_dir, True)
        target = target_dir / "odmeny.sqlite3"
        copy = lambda *args: subprocess.run([PHP, str(APP / "bin" / "copy-db.php"), *map(str, args)], capture_output=True, text=True, timeout=30)
        result = copy(live, target)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("kartiček 1, uložených verzí 1", result.stdout)
        self.assertEqual(target.stat().st_mode & 0o777, 0o600)
        with sqlite3.connect(target) as db:
            self.assertEqual([row[0] for row in db.execute("SELECT id FROM cards")], [card["id"]])
            self.assertEqual(db.execute("SELECT COUNT(*) FROM versions").fetchone()[0], 1)
            for table in ("sessions", "attempts", "devices"):
                self.assertEqual(db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0], 0, table)
        self.assertEqual(snapshot(), before, "ostrá databáze se kopií nezměnila")
        with sqlite3.connect(live) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM devices").fetchone()[0], 1, "ostrá zařízení zůstala")
        # Existující data verze 2 kopie nepřepíše a do stejného adresáře nekopíruje.
        self.assertNotEqual(copy(live, target).returncode, 0)
        self.assertNotEqual(copy(live, self.server.data / "jina.sqlite3").returncode, 0)
        self.assertNotEqual(copy(target_dir / "neni.sqlite3", target_dir / "b.sqlite3").returncode, 0)
        self.assertEqual(sorted(path.name for path in target_dir.iterdir()), ["odmeny.sqlite3"], "po chybě nezůstal rozdělaný soubor")
        # Verze 2 nad kopií funguje: stejná kartička se přihlásí a vidí data.
        other = Server(target_dir)
        self.addCleanup(other.stop)
        client = Client(other)
        status, state = client.api("GET", "state")
        self.assertEqual((status, state["setup_required"]), (200, False))
        status, result = client.api("POST", "login", {"auth": card["auth"]})
        self.assertEqual(status, 200, result)
        self.assertEqual(client.api("GET", "data")[1]["rev"], 1)
        self.assertEqual(client.api("GET", "devices")[1]["items"], [])
        status, _, _ = self.client.request("GET", "/bin/copy-db.php")
        self.assertEqual(status, 404)


@unittest.skipIf(PHP is None or NODE is None, "chybí PHP nebo Node.js")
class OdmenyBrowserCodeTests(unittest.TestCase):
    def test_encrypted_vault_flow(self):
        server = Server()
        try:
            result = subprocess.run([NODE, str(APP / "tests" / "vault_flow.js"), server.base, str(server.data)],
                                    capture_output=True, text=True, timeout=120, env=dict(os.environ, NO_PROXY="*", no_proxy="*"))
        finally:
            server.stop()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("vault flow ok", result.stdout)

    def test_calculations_match_original(self):
        result = subprocess.run([NODE, str(APP / "tests" / "test_core.js")], capture_output=True, text=True, timeout=120)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("core ok", result.stdout)


class OdmenyStaticTests(unittest.TestCase):
    def test_no_inline_styles_or_handlers(self):
        # Přísná CSP by inline styly a handlery zablokovala; aplikace je nesmí potřebovat.
        for path in list((APP / "private").glob("*.html")) + list((APP / "private").glob("*.js")) + list((APP / "static").glob("*.js")) + [APP / "index.php"]:
            text = path.read_text(encoding="utf-8")
            self.assertNotIn(' style="', text, path.name)
            self.assertNotRegex(text, r'\son(click|load|error|change|input)="', path.name)

    def test_deploy_keeps_apps_apart(self):
        install = (APP / "deploy" / "install.sh").read_text(encoding="utf-8")
        # Testy (i s původní aplikací), poznámky pro vývoj a dokumentace se na server nekopírují.
        for pattern in ("--exclude '/tests/'", "--exclude 'CLAUDE.md'", "--exclude '/README.md'", "--exclude '/deploy/'"):
            self.assertIn(pattern, install)
        conf = (APP / "deploy" / "apache-odmeny_v2.conf").read_text(encoding="utf-8")
        self.assertIn("private", conf.split("DirectoryMatch")[1])
        self.assertIn("SetEnv ODMENY_DATA_DIR /var/lib/odmeny_v2\n", conf)
        self.assertIn("/data/", (APP / ".gitignore").read_text(encoding="utf-8"))

    def test_version_2_never_touches_live_install(self):
        # Verze 2 má vlastní adresu, kód, data i konfiguraci Apache. Ostrá /odmeny/ se jen čte
        # (zdroj kopie dat), nikdy se do ní nezapisuje.
        install = (APP / "deploy" / "install.sh").read_text(encoding="utf-8")
        for line in ('TARGET_DIR="/var/www/odmeny_v2"', 'DATA_DIR="/var/lib/odmeny_v2"',
                     'APACHE_CONF="/etc/apache2/conf-available/odmeny_v2.conf"', "a2enconf odmeny_v2",
                     'LIVE_DB="/var/lib/odmeny/odmeny.sqlite3"'):
            self.assertIn(line, install)
        code = "\n".join(line for line in install.splitlines() if not line.lstrip().startswith("#"))
        live = re.findall(r"/var/(?:www|lib)/odmeny(?!_v2)[^\s\"']*|conf-available/odmeny\.conf|a2enconf odmeny\b(?!_v2)", code)
        self.assertEqual(live, ["/var/lib/odmeny/odmeny.sqlite3"], "jediná zmínka o ostré verzi je zdroj kopie")
        self.assertIn('runuser -u www-data -- php "${TARGET_DIR}/bin/copy-db.php" "${LIVE_DB}" "${DB_FILE}"', install)
        conf = (APP / "deploy" / "apache-odmeny_v2.conf").read_text(encoding="utf-8")
        directives = "\n".join(line for line in conf.splitlines() if not line.lstrip().startswith("#"))
        self.assertEqual(re.findall(r"/odmeny(?!_v2)\b", directives), [], "konfigurace verze 2 nezmiňuje ostré cesty")
        self.assertIn("Alias /odmeny_v2/ /var/www/odmeny_v2/", conf)
        self.assertIn("RedirectMatch 301 ^/odmeny_v2$ /odmeny_v2/", conf)
        # Zapamatované zařízení s PINem má verze 2 v prohlížeči pod vlastním klíčem.
        vault = (APP / "static" / "vault.js").read_text(encoding="utf-8")
        self.assertIn("const DEVICE_STORAGE = deviceStorageKey(root.location && root.location.pathname);", vault)

if __name__ == "__main__":
    unittest.main()
