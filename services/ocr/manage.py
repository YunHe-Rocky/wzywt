"""Local token provisioning and a single-image HTTP probe (Python standard library)."""
import argparse
import json
import mimetypes
import os
from pathlib import Path
import secrets
import urllib.error
import urllib.request


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
        # Never overwrite an existing credential, including symlinks.
        descriptor = os.open(args.path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            stream.write(secrets.token_urlsafe(32) + "\n")
        print("Created OCR token file; keep it private and outside the repository.")
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
    main()
