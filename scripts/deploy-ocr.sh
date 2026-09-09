#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SOURCE_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
MODE="${1:---start}"
if [[ $# -gt 1 || ( "$MODE" != "--check" && "$MODE" != "--serve" && "$MODE" != "--start" && "$MODE" != "--status" && "$MODE" != "--logs" ) ]]; then
  printf 'Usage: bash scripts/deploy.sh --ocr [--start|--check|--serve|--status|--logs]\n' >&2
  exit 2
fi
export PYTHONDONTWRITEBYTECODE=1
source "$SCRIPT_DIR/ocr-python.sh"
mapfile -t PYTHON_CANDIDATES < <(ocr_python_candidates "$SOURCE_DIR")
PYTHON_BIN="$(ocr_resolve_python "${PYTHON_CANDIDATES[@]}")" || exit 1
printf '[ocr] Python=%s (OCR imports OK)\n' "$PYTHON_BIN"
exec "$PYTHON_BIN" "$SOURCE_DIR/services/ocr/daemon.py" "${MODE#--}"
