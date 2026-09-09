"""Local token provisioning and a single-image HTTP probe (Python standard library)."""
import argparse
import json
import mimetypes
import os
from pathlib import Path
import secrets
import urllib.error
import urllib.request
from token_store import ensure_token


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    token = commands.add_parser("init-token")
    token.add_argument("path", type=Path)
    probe = commands.add_parser("probe")
    probe.add_argument("image", type=Path)
    probe.add_argument("--raw", action="store_true")
    probe.add_argument("--type", default="DATA", choices=["DATA", "OUTPUT", "SURVIVAL", "DEVELOPMENT", "KDA", "TEAM"])
    args = parser.parse_args()
    if args.command == "init-token":
        ensure_token(args.path, create=True, owner_uid=os.geteuid() if os.name == "posix" else None)
        print("OCR token file ready (created or reused); contents were not printed.")
        return
    from app import load_token
    if args.image.stat().st_size > 12 * 1024 * 1024:
        parser.error("Image exceeds 12 MiB")
    boundary = secrets.token_hex(24)
    # Use a fixed filename so arbitrary local filenames cannot inject form headers.
    mime = mimetypes.guess_type(args.image.name)[0] or "application/octet-stream"
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="types"\r\n\r\n{args.type}\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="screenshots"; filename="image"\r\n'
            f'Content-Type: {mime}\r\n\r\n').encode() + args.image.read_bytes() + f'\r\n--{boundary}--\r\n'.encode()
    endpoint = "http://127.0.0.1:8010/" + ("ocr" if args.raw else "recognize")
    request = urllib.request.Request(endpoint, body, headers={
        "Authorization": f"Bearer {load_token()}", "Content-Type": f"multipart/form-data; boundary={boundary}"})
    # This diagnostic only contacts local OCR; ignore proxy environment variables.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(request, timeout=90) as response:
            print(json.dumps(json.load(response), ensure_ascii=False, indent=2))
    except urllib.error.HTTPError as exc:
        print(f"HTTP {exc.code}: {exc.read().decode('utf-8', errors='replace')}")
        raise SystemExit(1) from exc


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as exc:
        print(f"OCR setup failed: {exc}")
        raise SystemExit(1) from exc
