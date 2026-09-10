"""Run real repository screenshots without a server or credentials; cache raw evidence."""
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "services" / "ocr"))
from app import create_app, load_engine
from fastapi.testclient import TestClient
from test_samples import assert_values

SAMPLES = {"DATA": "数据", "OUTPUT": "输出", "SURVIVAL": "生存",
           "DEVELOPMENT": "发育", "KDA": "战绩", "TEAM": "团队"}

if __name__ == "__main__":
    cache = ROOT / ".cache" / "ocr-samples"
    cache.mkdir(parents=True, exist_ok=True)
    engine = load_engine()
    token = "test-only-local-ocr-sample-token-123456"
    parts = [("types", (None, kind)) for kind in SAMPLES]
    parts += [("screenshots", (f"{kind}.jpg", (ROOT / "public" / "test" / f"{name}.jpg").read_bytes(), "image/jpeg"))
              for kind, name in SAMPLES.items()]
    started = time.monotonic()
    with TestClient(create_app(lambda: engine, token)) as client:
        response = client.post("/recognize", headers={"Authorization": f"Bearer {token}"}, files=parts)
    assert response.status_code == 200, response.text
    result = response.json()
    assert [page["type"] for page in result["pages"]] == list(SAMPLES)
    known = 0
    for page in result["pages"]:
        count = assert_values(page, require_complete=True)
        known += count
        print(f"{page['type']}: 10 players, 10 scores, {count} verified statistics", flush=True)
    (cache / "recognized.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    print(f"Six-file HTTP /recognize: {known}/180 transcribed statistics verified, {time.monotonic()-started:.1f}s", flush=True)
