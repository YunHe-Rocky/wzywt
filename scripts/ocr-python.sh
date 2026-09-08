#!/usr/bin/env bash
# Sourced by deploy-ocr.sh. Keep interpreter discovery separate from service startup.

ocr_python_candidates() {
  local source_dir="$1" command_path name
  printf '%s\n' "$source_dir/.venv-ocr/bin/python"
  if [[ -n "${VIRTUAL_ENV:-}" ]]; then
    printf '%s\n' "$VIRTUAL_ENV/bin/python"
  fi
  printf '%s\n' \
    /opt/runtime/Python/python/bin/python \
    /opt/runtime/python/bin/python
  for name in python3 python; do
    command_path="$(command -v "$name" 2>/dev/null || true)"
    [[ "$command_path" != /* ]] || printf '%s\n' "$command_path"
  done
}

ocr_resolve_python() {
  local candidate
  local -A checked=()
  local imports='import cv2, fastapi, uvicorn, multipart, onnxruntime; from rapidocr import RapidOCR'
  if [[ -n "${OCR_PYTHON:-}" ]]; then
    if [[ "$OCR_PYTHON" != /* || ! -x "$OCR_PYTHON" ]]; then
      printf '[ocr] OCR_PYTHON must be an absolute executable path readable by the current user: %s\n' "$OCR_PYTHON" >&2
      return 1
    fi
    if ! "$OCR_PYTHON" -c "$imports" >/dev/null 2>&1; then
      printf '[ocr] OCR_PYTHON cannot import the OCR dependencies: %s\n' "$OCR_PYTHON" >&2
      printf '[ocr] Check cv2 (including libGL), onnxruntime, rapidocr, fastapi, uvicorn and multipart in that environment.\n' >&2
      return 1
    fi
    printf '%s\n' "$OCR_PYTHON"
    return 0
  fi

  for candidate in "$@"; do
    [[ "$candidate" == /* && -x "$candidate" ]] || continue
    [[ -z "${checked[$candidate]:-}" ]] || continue
    checked["$candidate"]=1
    if "$candidate" -c "$imports" >/dev/null 2>&1; then
      printf '%s\n' "$candidate"
      return 0
    fi
    printf '[ocr] Skipping Python with unavailable OCR dependencies: %s\n' "$candidate" >&2
  done
  printf '[ocr] No executable Python with working OCR dependencies found for the current user.\n' >&2
  printf '[ocr] Checked the project .venv-ocr, VIRTUAL_ENV, /opt/runtime Python and PATH.\n' >&2
  printf '[ocr] Set OCR_PYTHON to an installed environment (export it in the shell, not in the website .env).\n' >&2
  return 1
}
