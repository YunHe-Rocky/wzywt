#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SOURCE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
MODE="${1:---check}"
if [[ $# -gt 1 || ( "$MODE" != "--check" && "$MODE" != "--serve" ) ]]; then
  printf 'Usage: bash scripts/deploy.sh --ocr [--check|--serve]\n' >&2
  exit 2
fi
PYTHON_BIN="${OCR_PYTHON:-$SOURCE_DIR/.venv-ocr/bin/python}"
[[ "$PYTHON_BIN" == /* && -x "$PYTHON_BIN" ]] || {
  printf 'Set OCR_PYTHON to the absolute executable in your installed OCR environment.\n' >&2
  exit 1
}
export PYTHONDONTWRITEBYTECODE=1
"$PYTHON_BIN" -c 'import cv2, fastapi, uvicorn, multipart, onnxruntime; from rapidocr import RapidOCR; print("OCR imports OK")'
if [[ "$MODE" == "--check" ]]; then
  "$PYTHON_BIN" -c 'from rapidocr import RapidOCR; RapidOCR(); print("OCR models loaded; no service started")'
  exit 0
fi
# No secret on command line and no sourcing of the website .env as shell code.
if [[ -z "${OCR_TOKEN:-}" && -z "${OCR_TOKEN_FILE:-}" ]]; then
  printf 'Set OCR_TOKEN_FILE (preferred) or OCR_TOKEN before starting OCR.\n' >&2
  exit 1
fi
cd -- "$SOURCE_DIR/services/ocr"
exec "$PYTHON_BIN" -m uvicorn app:create_app --factory \
  --host 127.0.0.1 --port 8010 --workers 1 \
  --limit-concurrency 4 --timeout-keep-alive 5 --no-access-log
