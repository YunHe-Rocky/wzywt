"""Linux PM2 controller for this OCR service only (no website release operations)."""
import argparse
import json
import os
from pathlib import Path
import secrets
import shlex
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

from token_store import ensure_token

NAME = "wzywt-ocr"
ARGS = ["-m", "uvicorn", "app:create_app", "--factory", "--host", "127.0.0.1", "--port", "8010",
        "--workers", "1", "--limit-concurrency", "4", "--timeout-keep-alive", "5", "--no-access-log"]


def owned_process(processes, cwd, python):
    matches = [p for p in processes if p.get("name") == NAME]
    if len(matches) > 1:
        raise ValueError("Multiple wzywt-ocr entries exist; inspect PM2 before continuing")
    if not matches:
        return None
    process = matches[0]
    env = process.get("pm2_env", {})
    args = env.get("args", [])
    args = shlex.split(args) if isinstance(args, str) else args
    if (os.path.realpath(env.get("pm_cwd", "")) != os.path.realpath(cwd)
            or os.path.abspath(env.get("pm_exec_path", "")) != os.path.abspath(python)
            or args != ARGS):
        raise ValueError("Existing wzywt-ocr has a different cwd, Python or command; refusing to overwrite it")
    return process


def healthy(payload, process, instance_id):
    return (isinstance(payload, dict) and process is not None
            and payload.get("status") == "ok" and payload.get("service") == "wzywt-ocr-preview"
            and payload.get("instanceId") == instance_id and payload.get("pid") == process.get("pid")
            and process.get("pm2_env", {}).get("status") == "online")


class Controller:
    def __init__(self, pm2, cwd, python, token):
        self.pm2, self.cwd, self.python, self.token = pm2, str(cwd), python, str(token)

    def command(self, *args):
        result = subprocess.run([self.pm2, *args], capture_output=True, text=True, timeout=45)
        if result.returncode:
            raise RuntimeError(f"PM2 {args[0]} failed; inspect the current user's PM2 installation/logs")
        return result.stdout

    def process(self):
        output = self.command("jlist")
        # First invocation can include PM2 daemon startup notices before the JSON.
        decoder = json.JSONDecoder()
        for offset, character in enumerate(output):
            if character != "[":
                continue
            try:
                entries, end = decoder.raw_decode(output, offset)
            except ValueError:
                continue
            if not output[end:].strip() and isinstance(entries, list) and all(isinstance(p, dict) for p in entries):
                return owned_process(entries, self.cwd, self.python)
        raise ValueError("PM2 returned an invalid process list")

    def read_health(self):
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open("http://127.0.0.1:8010/health", timeout=2) as response:
            return json.loads(response.read(65536))

    def start(self):
        process = self.process()
        if process is None:
            with socket.socket() as sock:
                sock.settimeout(1)
                if sock.connect_ex(("127.0.0.1", 8010)) == 0:
                    raise ValueError("Port 8010 is occupied outside this PM2 entry; inspect the existing listener before starting OCR")
        instance_id = secrets.token_hex(16)
        config = {"apps": [{"name": NAME, "script": self.python, "interpreter": "none",
                            "cwd": self.cwd, "args": ARGS, "exec_mode": "fork", "instances": 1,
                            "restart_delay": 3000, "max_restarts": 5, "min_uptime": "10s",
                            "kill_timeout": 10000,
                            "env": {"OCR_TOKEN_FILE": self.token, "OCR_TOKEN": "",
                                    "OCR_INSTANCE_ID": instance_id, "PYTHONDONTWRITEBYTECODE": "1"}}]}
        # PM2 consumes this config immediately; its saved process data lives in PM2_HOME.
        with tempfile.TemporaryDirectory(prefix="wzywt-ocr-") as directory:
            config_path = Path(directory) / "ecosystem.json"
            config_path.write_text(json.dumps(config), encoding="utf-8")
            self.command("startOrRestart", str(config_path), "--only", NAME, "--update-env")
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            process = self.process()
            try:
                if healthy(self.read_health(), process, instance_id):
                    self.command("save")
                    print(f"[ocr] {NAME} healthy; pid={process['pid']}; PM2 state saved")
                    print("[ocr] Background service is running. Reboot recovery uses the existing PM2 startup service.")
                    return
            except (OSError, ValueError):
                pass
            if process and process.get("pm2_env", {}).get("status") == "errored":
                break
            time.sleep(1)
        # Keep the failed OCR entry for diagnosis, but do not save a failed new state.
        raise RuntimeError("OCR health verification failed; PM2 state was not saved. Use --ocr --logs. Website processes were not restarted")


def prepare_owner(source, token, mode):
    import pwd
    account = pwd.getpwuid(source.stat().st_uid)
    current_uid = os.geteuid()
    if current_uid != account.pw_uid:
        if current_uid != 0:
            raise ValueError(f"Run OCR as repository owner {account.pw_name}")
        runuser = shutil.which("runuser")
        if not runuser:
            raise ValueError(f"runuser not found; switch to {account.pw_name} before starting OCR")
        if mode in {"start", "serve"}:
            default_token = Path(str(source) + "-ocr.token")
            ensure_token(token, create=True, owner_uid=account.pw_uid, owner_gid=account.pw_gid,
                         repair_root=(token == default_token))
        env = os.environ.copy()
        # Do not carry root's PM2 instance across a user switch. A custom target can
        # be explicitly selected using OCR_PM2_HOME, and is owner-checked below.
        env.pop("PM2_HOME", None)
        env.pop("OCR_TOKEN", None)
        env["OCR_TOKEN_FILE"] = str(token)
        env["OCR_PYTHON"] = sys.executable
        print(f"[ocr] Switching to repository owner {account.pw_name}", flush=True)
        os.chdir(source)
        os.execvpe(runuser, [runuser, "-u", account.pw_name, "--", "env",
                            f"PATH={env.get('PATH', '')}", f"OCR_PYTHON={sys.executable}",
                            f"OCR_TOKEN_FILE={token}", "bash", str(source / "scripts/deploy-ocr.sh"), f"--{mode}"], env)
    return account


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["start", "check", "serve", "status", "logs"])
    args = parser.parse_args()
    if os.name != "posix":
        parser.error("PM2 lifecycle commands target Linux; use the Python tests on Windows")
    source = Path(__file__).resolve().parents[2]
    if not (source / ".git").exists():
        raise ValueError("Run OCR from the persistent source checkout, not a website release/current directory")
    token = Path(os.environ.get("OCR_TOKEN_FILE", str(source) + "-ocr.token"))
    if not token.is_absolute():
        raise ValueError("OCR_TOKEN_FILE must be absolute")
    account = prepare_owner(source, token, args.mode)
    print(f"[ocr] user={account.pw_name} token-file={token}", flush=True)
    if args.mode in {"start", "serve", "check"}:
        present = ensure_token(token, create=args.mode != "check", owner_uid=account.pw_uid, owner_gid=account.pw_gid)
        if not present:
            print("[ocr] Token not created yet; --ocr will generate it automatically")
    if args.mode == "check":
        from rapidocr import RapidOCR
        RapidOCR()
        print("OCR models loaded; token checked; no service started")
        return
    if args.mode == "serve":
        os.environ["OCR_TOKEN_FILE"] = str(token)
        os.chdir(source / "services/ocr")
        os.execv(sys.executable, [sys.executable, *ARGS])

    pm2 = shutil.which("pm2")
    if not pm2:
        raise ValueError("pm2 is not available in this user's PATH")
    pm2_home = Path(os.environ.get("OCR_PM2_HOME") or os.environ.get("PM2_HOME") or str(Path(account.pw_dir) / ".pm2"))
    if not pm2_home.is_absolute() or pm2_home == Path("/") or pm2_home.is_symlink():
        raise ValueError("PM2_HOME must be an absolute non-root directory, not a symlink")
    if pm2_home.exists() and pm2_home.stat().st_uid != account.pw_uid:
        raise ValueError("PM2_HOME belongs to a different user; refusing to manage that PM2 daemon")
    os.environ["PM2_HOME"] = str(pm2_home)
    print(f"[ocr] PM2_HOME={pm2_home}", flush=True)
    controller = Controller(pm2, source / "services/ocr", sys.executable, token)
    if args.mode == "start":
        # Single host/user lifecycle operation; a simultaneous invocation must not
        # create duplicate entries between jlist and startOrRestart.
        import fcntl
        pm2_home.mkdir(mode=0o700, parents=True, exist_ok=True)
        with open(pm2_home / "wzywt-ocr.lock", "a", encoding="utf-8") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise ValueError("Another OCR start is in progress") from exc
            controller.start()
    else:
        process = controller.process()
        if process is None:
            print("[ocr] wzywt-ocr is not registered in this PM2 instance")
            return
        if args.mode == "logs":
            subprocess.run([pm2, "logs", NAME, "--nostream", "--lines", "50"], check=True)
        else:
            print(f"[ocr] name={NAME} pid={process.get('pid')} status={process['pm2_env'].get('status')} cwd={controller.cwd}")
            payload = controller.read_health()
            if not healthy(payload, process, process["pm2_env"].get("OCR_INSTANCE_ID")):
                raise ValueError("OCR health does not match the PM2 process; run --ocr to update it")
            ready = payload.get("fullMatchReady") is True
            print(f"[ocr] HTTP health matches the PM2 process; fullMatchReady={str(ready).lower()}; manual confirmation required")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as exc:
        print(f"[ocr] ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
