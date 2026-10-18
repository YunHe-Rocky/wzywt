"""Publish only metadata from Playwright traces, with all headers/bodies removed."""
import json
import sys
import zipfile
from urllib.parse import urlsplit, urlunsplit

OMIT = {"params", "result", "headers", "cookies", "postdata", "body", "storage", "storagestate", "sha1", "_sha1",
        "text", "message", "log", "title", "stack", "error", "attachments", "snapshot"}


def redact(value):
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, dict):
        return {key: redact(item) for key, item in value.items()
                if key.lower() not in OMIT and not any(word in key.lower() for word in ("password", "authorization", "cookie", "secret", "token"))}
    if isinstance(value, str) and value.startswith(("http://", "https://")):
        url = urlsplit(value)
        return urlunsplit((url.scheme, url.netloc, url.path, "", ""))
    return value


if __name__ == "__main__":
    with zipfile.ZipFile(sys.argv[1]) as source, zipfile.ZipFile(sys.argv[2], "w", zipfile.ZIP_DEFLATED) as target:
        for name in source.namelist():
            if name.endswith((".trace", ".network")):
                lines = [json.dumps(redact(json.loads(line)), ensure_ascii=False) for line in source.read(name).decode().splitlines() if line.strip()]
                target.writestr(name, "\n".join(lines))
