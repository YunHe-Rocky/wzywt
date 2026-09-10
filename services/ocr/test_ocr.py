from io import BytesIO
import os
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image

from app import MAX_BODY, MAX_BATCH_BODY, create_app, load_token, recover_small_numbers
from parser import TextBox, number, parse_data, parse_page, PAGE_COLUMNS

TOKEN = "test-only-" * 5
AUTH = {"Authorization": f"Bearer {TOKEN}"}


def fixture(kind="DATA"):
    """Synthetic coordinates based on the supplied layout, not measured OCR accuracy."""
    items = []

    def add(text, x, y, score=.99):
        items.append(TextBox(text, score, [[(x+dx)*2200, (y+dy)*1000]
                                         for dx, dy in ((-.004, -.004), (.004, -.004), (.004, .004), (-.004, .004))]))
    for shift in (0, .44):
        for label, _field, x1, x2, _percent in PAGE_COLUMNS[kind]:
            add(label, (x1+x2)/2+shift, .164)
        for row in range(5):
            top = .192 + row * .1195
            for text, x, y in (("测试玩家", .28, .023), ("上官婉儿", .09, .097), ("12.6", .177, .072)):
                add(text, x+shift, top+y)
            values = {"damageDealt": "130.2k", "damageTaken": "64.2k", "gold": "9.3k",
                      "participationRate": "55%", "damageConversionRate": "2.0",
                      "damageTakenPerDeath": "21.4k", "jungleGold": "437", "minionKills": "39",
                      "kills": "12", "deaths": "3", "assists": "4", "controlScore": "0",
                      "healing": "24.3k", "towerDamage": "5.5k"}
            for _label, field, x1, x2, percent in PAGE_COLUMNS[kind]:
                add(values[field], (x1+x2)/2+shift, top+(.095 if percent else .061))
    return items


def png():
    stream = BytesIO()
    Image.new("RGB", (2200, 1000)).save(stream, "PNG")
    return stream.getvalue()


def output(kind="DATA"):
    boxes = fixture(kind)
    return SimpleNamespace(txts=[b.text for b in boxes], scores=[b.confidence for b in boxes], boxes=[b.box for b in boxes])


class ParserTests(unittest.TestCase):
    def test_crop_recovery_requires_two_agreeing_confident_observations(self):
        boxes = [b for b in fixture("KDA") if b.text != "3"]
        for outputs, expected in [([("1", .999), ("1", .998)], 1),
                                  ([("1", .999), ("7", .999)], None),
                                  ([("1", .8)], None), ([("?", .999)], None)]:
            page = parse_page(boxes, 2200, 1000, "KDA")
            # Limit this unit to one missing cell; other rows are not inference inputs.
            page["players"] = page["players"][:1]
            readings = iter(outputs)
            def engine(_image, **kwargs):
                self.assertFalse(kwargs["use_det"])
                text, score = next(readings)
                return SimpleNamespace(txts=[text], scores=[score])
            with Image.new("RGB", (2200, 1000)) as image:
                recover_small_numbers(engine, image, page, boxes)
            self.assertEqual(page["players"][0]["metrics"]["deaths"]["value"], expected)

    def test_crop_recovery_does_not_override_ambiguous_cells(self):
        boxes = fixture("KDA")
        boxes.append(next(b for b in boxes if b.text == "3"))
        page = parse_page(boxes, 2200, 1000, "KDA")
        def forbidden(_image, **_kwargs):
            self.fail("Conflicting boxes must remain for human review")
        with Image.new("RGB", (2200, 1000)) as image:
            recover_small_numbers(forbidden, image, page, boxes)
        self.assertIsNone(page["players"][0]["metrics"]["deaths"]["value"])

    def test_all_six_templates_and_wrong_tab(self):
        for kind in PAGE_COLUMNS:
            page = parse_page(list(reversed(fixture(kind))), 2200, 1000, kind)
            self.assertEqual(page["type"], kind)
            self.assertEqual(len(page["players"]), 10)
            self.assertTrue(all(m["value"] is not None for p in page["players"] for m in p["metrics"].values()))
        with self.assertRaises(ValueError):
            parse_page(fixture("OUTPUT"), 2200, 1000, "DATA")

    def test_numeric_nickname_and_missing_score_are_reviewable(self):
        boxes = [TextBox("123456" if b.text == "测试玩家" else b.text, b.confidence, b.box)
                 for b in fixture() if b.text != "12.6"]
        page = parse_data(boxes, 2200, 1000)
        self.assertEqual(len(page["players"]), 10)
        self.assertEqual(page["players"][0]["nickname"], "123456")
        self.assertIsNone(page["players"][0]["score"]["value"])

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

        def engine(_image, **_kwargs):
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
        self.assertTrue(self.client.get("/health").json()["fullMatchReady"])
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

    def test_invalid_image_unknown_tab_and_mislabeled_tab(self):
        self.assertEqual(self.post(data=b"not an image").status_code, 422)
        self.assertEqual(self.post(kind="KDA").status_code, 422)
        self.assertEqual(self.post("/ocr", kind="BOGUS").status_code, 422)
        self.assertEqual(self.calls, 1)  # KDA must be checked against actual header anchors.

    def test_oversized_dimensions_rejected_before_inference(self):
        stream = BytesIO()
        Image.new("RGB", (4000, 3100)).save(stream, "PNG")
        self.assertEqual(self.post(data=stream.getvalue()).status_code, 422)
        self.assertEqual(self.calls, 0)

    def test_inference_failure_does_not_leak_details(self):
        def broken(_image, **_kwargs):
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
        self.assertEqual(self.client.post("/recognize", headers={**headers, "Content-Length": str(MAX_BATCH_BODY+1)}, content=b"").status_code, 413)
        with patch("app.MAX_BATCH_BODY", 128):
            self.assertEqual(self.client.post("/recognize", headers=headers, content=iter([b"x"*80, b"x"*80])).status_code, 413)

    def test_raw_endpoint_still_rejects_multiple_files_and_batch_has_six_file_limit(self):
        for endpoint, count in [("/ocr", 2), ("/recognize", 7)]:
            response = self.client.post(endpoint, headers=AUTH,
                                        files=[("screenshots", ("image.png", png())) for _ in range(count)])
            self.assertEqual(response.status_code, 400)
        self.assertEqual(self.calls, 0)

    def test_unpaired_files_rejected_before_inference(self):
        response = self.client.post("/recognize", headers=AUTH, data={"types": "DATA"},
                                    files=[("screenshots", ("a.png", png())), ("screenshots", ("b.png", png()))])
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.calls, 0)

    def test_six_files_are_inferred_in_type_order(self):
        kinds = list(PAGE_COLUMNS)
        calls = []

        def engine(_image, **_kwargs):
            kind = kinds[len(calls)]
            calls.append(kind)
            return output(kind)

        self.app.state.engine = engine
        parts = [("types", (None, kind)) for kind in kinds]
        parts += [("screenshots", (f"{kind}.png", png(), "image/png")) for kind in kinds]
        response = self.client.post("/recognize", headers=AUTH, files=parts)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([p["type"] for p in response.json()["pages"]], kinds)
        self.assertEqual(calls, kinds)
        self.assertTrue(response.json()["requiresConfirmation"])

    def test_duplicate_types_and_invalid_later_image_rejected_before_inference(self):
        for kinds, images in [(["DATA", "DATA"], [png(), png()]),
                              (["DATA", "TEAM"], [png(), b"bad-image"])]:
            parts = [("types", (None, kind)) for kind in kinds]
            parts += [("screenshots", ("image.png", data)) for data in images]
            response = self.client.post("/recognize", headers=AUTH, files=parts)
            self.assertEqual(response.status_code, 422)
            self.assertEqual(self.calls, 0)

    def test_busy_and_health_remain_responsive(self):
        entered, release = threading.Event(), threading.Event()

        def slow(_image, **_kwargs):
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
