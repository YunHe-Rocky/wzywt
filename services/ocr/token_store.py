"""Private token creation/reuse; never overwrite an existing credential."""
import os
from pathlib import Path
import secrets
import stat


def ensure_token(path, *, create=False, owner_uid=None, owner_gid=None, repair_root=False):
    path = Path(path)
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    if path.is_symlink():
        raise ValueError("OCR token must not be a symbolic link")
    created = False
    try:
        fd = os.open(path, flags)
    except FileNotFoundError:
        if not create:
            return False
        try:
            fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
        except FileExistsError:
            return ensure_token(path, create=False, owner_uid=owner_uid, owner_gid=owner_gid, repair_root=repair_root)
        created = True
    except PermissionError as exc:
        raise ValueError("OCR token is unreadable. Run bash scripts/deploy.sh --ocr once as root to repair the default token owner") from exc
    with os.fdopen(fd, "r+" if created else "r", encoding="utf-8") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise ValueError("OCR token must be a regular file with one hard link")
        if info.st_size > 4096:
            raise ValueError("OCR token file is unexpectedly large")
        if owner_uid is not None and info.st_uid != owner_uid:
            if not ((repair_root or created) and info.st_uid == 0 and os.geteuid() == 0):
                raise ValueError("OCR token belongs to a different user; only the default root-owned token can be repaired automatically")
            os.fchown(stream.fileno(), owner_uid, owner_gid)
        if os.name == "posix" and stat.S_IMODE(info.st_mode) != 0o600:
            # Check mode reports an unsafe file; startup may tighten its permissions.
            if not create:
                raise ValueError("OCR token permissions must be 600; run --ocr to correct them")
            os.fchmod(stream.fileno(), 0o600)
        if created:
            stream.write(secrets.token_urlsafe(32) + "\n")
            stream.flush()
            stream.seek(0)
        value = stream.read(4097).strip()
        if len(value) < 32 or not value.isascii() or any(c.isspace() for c in value):
            raise ValueError("OCR token is invalid; existing contents were not replaced")
    return True
