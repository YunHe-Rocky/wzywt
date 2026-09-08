from io import BytesIO
import os
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image

from app import MAX_BODY, create_app, load_token
from parser import TextBox, number, parse_data

TOKEN = "test-only-" * 5
AUTH = {"Authorization": f"Bearer {TOKEN}"}


def fixture():
    """Synthetic coordinates based on the supplied layout, not measured OCR accuracy."""
    items = []

    def add(text, x, y, score=.99):
        items.append(TextBox(text, score, [[(x+dx)*2200, (y+dy)*1000]
                                         for dx, dy in ((-.004, -.004), (.004, -.004), (.004, .004), (-.004, .004))]))
    for shift in (0, .44):
        for text, x in (("输出伤害", .25), ("承受伤害", .315), ("总经济", .37), ("参团率", .44)):
            add(text, x+shift, .164)
        for row in range(5):
            top = .192 + row * .1195
            for text, x, y in (("测试玩家", .28, .023), ("上官婉儿", .09, .097),
                               ("12.6", .177, .072), ("130.2k", .245, .061),
                               ("64.2k", .305, .061), ("9.3k", .365, .061), ("55%", .456, .095)):
                add(text, x+shift, top+y)
    return items


def png():
    stream = BytesIO()
    Image.new("RGB", (2200, 1000)).save(stream, "PNG")
    return stream.getvalue()


def output():
    boxes = fixture()
    return SimpleNamespace(txts=[b.text for b in boxes], scores=[b.confidence for b in boxes], boxes=[b.box for b in boxes])


class ParserTests(unittest.TestCase):
    def test_numbers(self):
        self.assertEqual(number("130.2k"), 130200)
        self.assertEqual(number("1.2万"), 12000)
        self.assertEqual(number("0"), 0)
        self.assertIsNone(number("O"))
        self.assertIsNone(number("101%", True))
        self.assertEqual(number("55%", True), 55)
        self.assertIsNone(number("55", True))

    def test_order_and_missing_fields(self):
        boxes = list(reversed(fixture()))
        boxes = [b for b in boxes if b.text != "上官婉儿"]
        result = parse_data(boxes, 2200, 1000)
        self.assertEqual(len(result["players"]), 10)
        player = result["players"][0]
        self.assertEqual((player["side"], player["slot"]), ("blue", 1))
        self.assertIsNone(player["heroName"])
        self.assertEqual(player["metrics"]["damageDealt"]["value"], 130200)
        self.assertEqual(player["metrics"]["participationRate"]["value"], 55)

    def test_ambiguous_or_low_confidence_numbers_stay_null(self):
        boxes = fixture()
        damage = next(b for b in boxes if b.text == "130.2k")
        boxes.append(damage)
        self.assertIsNone(parse_data(boxes, 2200, 1000)["players"][0]["metrics"]["damageDealt"]["value"])
        boxes = [TextBox(b.text, .7 if b.text == "9.3k" else b.confidence, b.box) for b in fixture()]
        self.assertIsNone(parse_data(boxes, 2200, 1000)["players"][0]["metrics"]["gold"]["value"])

    def test_unknown_layout_and_missing_players_rejected(self):
        for boxes, width in ((fixture(), 1000), ([], 2200), ([b for b in fixture() if b.text != "测试玩家"], 2200)):
            with self.assertRaises(ValueError):
                parse_data(boxes, width, 1000)


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.calls = 0

        def engine(_image):
            self.calls += 1
            return output()

        self.app = create_app(lambda: engine, TOKEN)
        self.client = TestClient(self.app)
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)

    def post(self, path="/recognize", data=None, kind="DATA"):
        return self.client.post(path, headers=AUTH, data={"types": kind},
                                files={"screenshots": ("test.png", png() if data is None else data, "image/png")})

    def test_health_and_raw_and_structured(self):
        self.assertFalse(self.client.get("/health").json()["fullMatchReady"])
        raw = self.post("/ocr", kind="TEAM")
        self.assertEqual(raw.status_code, 200)
        self.assertIn("box", raw.json()["boxes"][0])
        structured = self.post()
        self.assertEqual(structured.status_code, 200)
        self.assertEqual(len(structured.json()["pages"][0]["players"]), 10)

    def test_jpeg_png_webp_decoded_by_signature(self):
        for kind in ("JPEG", "PNG", "WEBP"):
            with self.subTest(kind=kind):
                stream = BytesIO()
                Image.new("RGB", (2200, 1000)).save(stream, kind)
                self.assertEqual(self.post(data=stream.getvalue()).status_code, 200)

    def test_animation_rejected(self):
        stream = BytesIO()
        frames = [Image.new("RGB", (20, 20), color) for color in ("red", "blue")]
        frames[0].save(stream, "PNG", save_all=True, append_images=frames[1:], duration=100, loop=0)
        self.assertEqual(self.post(data=stream.getvalue()).status_code, 422)
        self.assertEqual(self.calls, 0)

    def test_unauthorized_before_upload_and_bad_format(self):
        self.assertEqual(self.client.post("/recognize", content=b"invalid").status_code, 401)
        self.assertEqual(self.client.post("/recognize", headers=AUTH, json={}).status_code, 415)
        self.assertEqual(self.calls, 0)

    def test_invalid_image_unknown_tab_and_unsupported_tab(self):
        self.assertEqual(self.post(data=b"not an image").status_code, 422)
        self.assertEqual(self.post(kind="KDA").status_code, 422)
        self.assertEqual(self.post("/ocr", kind="BOGUS").status_code, 422)
        self.assertEqual(self.calls, 0)

    def test_oversized_dimensions_rejected_before_inference(self):
        stream = BytesIO()
        Image.new("RGB", (4000, 3100)).save(stream, "PNG")
        self.assertEqual(self.post(data=stream.getvalue()).status_code, 422)
        self.assertEqual(self.calls, 0)

    def test_inference_failure_does_not_leak_details(self):
        def broken(_image):
            raise RuntimeError("private-path-or-token")
        self.app.state.engine = broken
        response = self.post()
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private-path-or-token", response.text)

    def test_missing_and_weak_token_refuse_start(self):
        for token in ("", "short", " " * 32):
            with patch.dict(os.environ, {"OCR_TOKEN": token}, clear=True):
                with self.assertRaises(RuntimeError):
                    load_token()

    def test_both_declared_and_chunked_body_limits(self):
        headers = {**AUTH, "Content-Type": "multipart/form-data; boundary=test"}
        self.assertEqual(self.client.post("/ocr", headers={**headers, "Content-Length": str(MAX_BODY+1)}, content=b"").status_code, 413)
        self.assertEqual(self.client.post("/ocr", headers=headers, content=iter([b"x" * (MAX_BODY+1)])).status_code, 413)

    def test_two_files_rejected_not_fake_six_page_success(self):
        response = self.client.post("/recognize", headers=AUTH, data={"types": "DATA"},
                                    files=[("screenshots", ("a.png", png())), ("screenshots", ("b.png", png()))])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.calls, 0)

    def test_busy_and_health_remain_responsive(self):
        entered, release = threading.Event(), threading.Event()

        def slow(_image):
            entered.set()
            release.wait(5)
            return output()

        self.app.state.engine = slow
        results = []
        worker = threading.Thread(target=lambda: results.append(self.post()))
        worker.start()
        try:
            self.assertTrue(entered.wait(3))
            self.assertEqual(self.post().status_code, 429)
            self.assertEqual(self.client.get("/health").status_code, 200)
        finally:
            release.set()
            worker.join(5)
        self.assertEqual(results[0].status_code, 200)


if __name__ == "__main__":
    unittest.main()
