#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/ocr-python.sh"
TEST_DIR="$(mktemp -d)"
trap 'rm -f -- "$TEST_DIR/good python" "$TEST_DIR/broken" "$TEST_DIR/error" "$TEST_DIR/probes"; rmdir -- "$TEST_DIR"' EXIT
unset OCR_PYTHON
export PYTHONDONTWRITEBYTECODE=1
export OCR_TEST_PROBES="$TEST_DIR/probes"

# Interpreter stand-ins verify selection; no real Python/model installation required.
cat > "$TEST_DIR/good python" <<'SH'
#!/usr/bin/env bash
[[ "$1" == "-c" && "$2" == *"from rapidocr import RapidOCR"* ]]
SH
cat > "$TEST_DIR/broken" <<'SH'
#!/usr/bin/env bash
printf 'probe\n' >> "$OCR_TEST_PROBES"
exit 1
SH
chmod +x "$TEST_DIR/good python" "$TEST_DIR/broken"

fail() { printf '[test-ocr-python] FAIL: %s\n' "$*" >&2; exit 1; }
good="$TEST_DIR/good python"
broken="$TEST_DIR/broken"
[[ "$(ocr_resolve_python "$TEST_DIR/missing" "$good")" == "$good" ]] || fail 'missing venv must fall back'
[[ "$(ocr_resolve_python "$good" "$broken")" == "$good" ]] || fail 'working preferred interpreter must win'
[[ "$(ocr_resolve_python "$broken" "$broken" "$good" 2>"$TEST_DIR/error")" == "$good" ]] || fail 'broken imports must fall back'
[[ "$(wc -l < "$TEST_DIR/probes" | tr -d '[:space:]')" == 1 ]] || fail 'duplicate candidates probed more than once'
grep -F 'Skipping Python' "$TEST_DIR/error" >/dev/null || fail 'fallback should explain rejected environment'
OCR_PYTHON="$good"
[[ "$(ocr_resolve_python "$broken")" == "$good" ]] || fail 'explicit interpreter must win'
for OCR_PYTHON in "$broken" "$TEST_DIR/missing" python; do
  if ocr_resolve_python "$good" > /dev/null 2>"$TEST_DIR/error"; then
    fail 'invalid explicit interpreter silently fell back'
  fi
  grep -F 'OCR_PYTHON' "$TEST_DIR/error" >/dev/null || fail 'explicit error should name the setting'
done
unset OCR_PYTHON
if ocr_resolve_python "$TEST_DIR/missing" "$broken" > /dev/null 2>"$TEST_DIR/error"; then
  fail 'discovery without dependencies must fail'
fi
grep -F 'No executable Python' "$TEST_DIR/error" >/dev/null || fail 'missing environment diagnostic'
VIRTUAL_ENV='/fake/active env'
mapfile -t candidates < <(ocr_python_candidates '/fake/project')
[[ "${candidates[0]}" == '/fake/project/.venv-ocr/bin/python' ]] || fail 'project priority'
[[ "${candidates[1]}" == '/fake/active env/bin/python' ]] || fail 'active environment priority'
[[ "${candidates[2]}" == '/opt/runtime/Python/python/bin/python' ]] || fail 'WorkSpace runtime priority'
[[ "${candidates[3]}" == '/opt/runtime/python/bin/python' ]] || fail 'lowercase runtime priority'
printf '[test-ocr-python] PASS: priority, fallback, explicit override, import checks, spaces and diagnostics\n'
