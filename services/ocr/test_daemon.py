import json
import os
from pathlib import Path
import stat
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from daemon import ARGS, NAME, Controller, healthy, owned_process, prepare_owner
from token_store import ensure_token


def process(cwd, python, pid=123):
    return {"name": NAME, "pid": pid, "pm2_env": {"pm_cwd": str(cwd), "pm_exec_path": python,
             "args": ARGS, "status": "online", "OCR_INSTANCE_ID": "old"}}


class TokenTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / "ocr.token"

    def tearDown(self):
        self.directory.cleanup()

    def test_create_and_reuse_never_rotates(self):
        self.assertFalse(ensure_token(self.path))
        self.assertFalse(self.path.exists())
        self.assertTrue(ensure_token(self.path, create=True))
        original = self.path.read_bytes()
        self.assertGreaterEqual(len(original.strip()), 32)
        self.assertTrue(ensure_token(self.path, create=True))
        self.assertEqual(self.path.read_bytes(), original)

    def test_invalid_existing_file_is_not_replaced(self):
        self.path.write_text("bad", encoding="utf-8")
        with self.assertRaises(ValueError):
            ensure_token(self.path, create=True)
        self.assertEqual(self.path.read_text(), "bad")

    def test_symlinks_are_rejected(self):
        with patch.object(Path, "is_symlink", return_value=True):
            with self.assertRaisesRegex(ValueError, "symbolic"):
                ensure_token(self.path, create=True)
        self.assertFalse(self.path.exists())

    def test_hardlinks_are_rejected(self):
        ensure_token(self.path, create=True)
        os.link(self.path, self.path.with_name("linked"))
        with self.assertRaisesRegex(ValueError, "hard link"):
            ensure_token(self.path, create=True)

    def test_permission_error_gives_single_repair_command(self):
        with patch("token_store.os.open", side_effect=PermissionError):
            with self.assertRaisesRegex(ValueError, "--ocr once as root"):
                ensure_token(self.path, create=True)

    def test_only_root_owned_default_can_be_repaired(self):
        ensure_token(self.path, create=True)
        original = self.path.read_bytes()
        metadata = SimpleNamespace(st_mode=stat.S_IFREG | 0o600, st_nlink=1, st_size=44, st_uid=0)
        with patch("token_store.os.fstat", return_value=metadata), \
                patch("token_store.os.geteuid", return_value=0, create=True), \
                patch("token_store.os.fchown", create=True) as chown:
            with self.assertRaisesRegex(ValueError, "different user"):
                ensure_token(self.path, create=True, owner_uid=1001, owner_gid=1001)
            chown.assert_not_called()
            ensure_token(self.path, create=True, owner_uid=1001, owner_gid=1001, repair_root=True)
            chown.assert_called_once()
            self.assertEqual(chown.call_args.args[1:], (1001, 1001))
        self.assertEqual(self.path.read_bytes(), original)


class OwnershipTests(unittest.TestCase):
    def test_unrelated_and_duplicate_pm2_entries_refused(self):
        cwd, python = "/repo/services/ocr", "/runtime/python"
        self.assertIsNone(owned_process([{"name": "web"}], cwd, python))
        entry = process(cwd, python)
        self.assertIs(owned_process([entry], cwd, python), entry)
        with self.assertRaises(ValueError):
            owned_process([entry, entry], cwd, python)
        for field, value in (("pm_cwd", "/other"), ("pm_exec_path", "/other/python"), ("args", ["unrelated.py"])):
            changed = process(cwd, python)
            changed["pm2_env"][field] = value
            with self.assertRaises(ValueError):
                owned_process([changed], cwd, python)

    def test_root_reexec_clears_root_pm2_and_repairs_only_default(self):
        account = SimpleNamespace(pw_uid=1001, pw_gid=1001, pw_name="project", pw_dir="/opt/project")
        for custom in (False, True):
            source = Path("/opt/project/wzywt")
            token = Path(str(source) + "-ocr.token") if not custom else Path("/custom/token")
            with patch.dict("sys.modules", {"pwd": SimpleNamespace(getpwuid=lambda uid: account)}), \
                    patch.object(Path, "stat", return_value=SimpleNamespace(st_uid=1001)), \
                    patch("daemon.os.geteuid", return_value=0, create=True), \
                    patch("daemon.shutil.which", return_value="/usr/sbin/runuser"), \
                    patch("daemon.ensure_token") as ensure, \
                    patch("daemon.os.chdir"), \
                    patch("daemon.os.execvpe", side_effect=SystemExit) as execute, \
                    patch.dict(os.environ, {"PM2_HOME": "/root/.pm2", "OCR_TOKEN": "do-not-forward"}):
                with self.assertRaises(SystemExit):
                    prepare_owner(source, token, "start")
                self.assertEqual(ensure.call_args.kwargs["repair_root"], not custom)
                argv, env = execute.call_args.args[1:]
                self.assertEqual(argv[1:4], ["-u", "project", "--"])
                self.assertNotIn("PM2_HOME", env)
                self.assertNotIn("OCR_TOKEN", env)

    def test_check_root_does_not_modify_token(self):
        account = SimpleNamespace(pw_uid=1001, pw_name="project")
        with patch.dict("sys.modules", {"pwd": SimpleNamespace(getpwuid=lambda uid: account)}), \
                patch.object(Path, "stat", return_value=SimpleNamespace(st_uid=1001)), \
                patch("daemon.os.geteuid", return_value=0, create=True), \
                patch("daemon.shutil.which", return_value="/usr/sbin/runuser"), \
                patch("daemon.ensure_token") as ensure, \
                patch("daemon.os.chdir"), \
                patch("daemon.os.execvpe", side_effect=SystemExit):
            with self.assertRaises(SystemExit):
                prepare_owner(Path("/repo"), Path("/repo-ocr.token"), "check")
            ensure.assert_not_called()


class FakeController(Controller):
    def __init__(self, cwd, existing=False):
        super().__init__("pm2", cwd, "/runtime/python", "/private/token")
        self.entry = process(cwd, self.python) if existing else None
        self.calls = []
        self.mismatch = False

    def command(self, *args):
        self.calls.append(args)
        if args[0] == "jlist":
            return "[PM2] Daemon started\n" + json.dumps([{"name": "website-web"}] + ([self.entry] if self.entry else []))
        if args[0] == "startOrRestart":
            config = json.loads(Path(args[1]).read_text())
            app = config["apps"][0]
            assert app["name"] == NAME and app["args"] == ARGS and len(config["apps"]) == 1
            assert app["env"]["OCR_TOKEN"] == ""
            self.entry = process(self.cwd, self.python, 234)
            self.entry["pm2_env"].update(app["env"])
        return ""

    def read_health(self):
        return {"status": "ok", "service": "wzywt-ocr-preview", "pid": self.entry["pid"],
                "instanceId": "wrong" if self.mismatch else self.entry["pm2_env"]["OCR_INSTANCE_ID"]}


class ControllerTests(unittest.TestCase):
    def test_start_and_repeat_manage_only_ocr_then_save(self):
        controller = FakeController("/repo/services/ocr")
        with patch("daemon.socket.socket") as socket:
            socket.return_value.__enter__.return_value.connect_ex.return_value = 1
            controller.start()
            controller.start()
        mutations = [args[0] for args in controller.calls if args[0] != "jlist"]
        self.assertEqual(mutations, ["startOrRestart", "save", "startOrRestart", "save"])
        self.assertEqual(controller.entry["pid"], 234)

    def test_occupied_port_does_not_mutate_pm2(self):
        controller = FakeController("/repo/services/ocr")
        with patch("daemon.socket.socket") as socket:
            socket.return_value.__enter__.return_value.connect_ex.return_value = 0
            with self.assertRaisesRegex(ValueError, "8010"):
                controller.start()
        self.assertEqual(controller.calls, [("jlist",)])

    def test_wrong_health_instance_never_saved(self):
        controller = FakeController("/repo/services/ocr", existing=True)
        controller.mismatch = True
        with patch("daemon.time.monotonic", side_effect=[0, 1, 100]), patch("daemon.time.sleep"):
            with self.assertRaisesRegex(RuntimeError, "not saved"):
                controller.start()
        self.assertNotIn(("save",), controller.calls)

    def test_wrong_pid_not_healthy_even_when_http_ok(self):
        entry = process("/repo/services/ocr", "/runtime/python")
        health = {"status": "ok", "service": "wzywt-ocr-preview", "instanceId": "new", "pid": 999}
        self.assertFalse(healthy(health, entry, "new"))
        health["pid"] = 123
        self.assertTrue(healthy(health, entry, "new"))


if __name__ == "__main__":
    unittest.main()
