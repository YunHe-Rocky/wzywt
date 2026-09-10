"""Recorded real OCR boxes; numbers independently transcribed from public/test images.

These fixtures exercise parsing without models. The model/HTTP test in
scripts/test-ocr-samples.py additionally validates crop recovery on actual pixels.
"""
import json
from pathlib import Path
import unittest

from parser import TextBox, parse_page

# Blue rows 1–5, then red rows 1–5, in the screenshot's visual order.
EXPECTED = {
    "damageDealt": [130200, 35400, 72500, 79800, 28000, 62900, 42500, 62700, 70700, 25600],
    "damageTaken": [64200, 49600, 38800, 42300, 69400, 64600, 78200, 69200, 51400, 82400],
    "gold": [9300, 8200, 11400, 12400, 7900, 6700, 8600, 7100, 9400, 6600],
    "participationRate": [55, 27, 37, 34, 62, 63, 63, 72, 54, 54],
    "damageConversionRate": [2, .6, .9, .9, .5, 1.4, .7, 1.3, 1, .6],
    "damageTakenPerDeath": [21400, 16500, 38800, 21200, 34700, 8100, 19600, 8600, 17100, 13700],
    "jungleGold": [437, 551, 1400, 4100, 236, 91, 372, 323, 1700, 70],
    "minionKills": [39, 32, 53, 31, 7, 24, 42, 23, 33, 12],
    "kills": [12, 2, 4, 9, 2, 2, 3, 3, 3, 0],
    "deaths": [3, 3, 1, 2, 2, 8, 4, 8, 3, 6],
    "assists": [4, 6, 7, 1, 16, 5, 4, 5, 3, 6],
    "controlScore": [3, 10, 6, 10, 5, 0, 1, 6, 0, 18],
    "healing": [24300, 21500, 24200, 6700, 69600, 4600, 25100, 8600, 3800, 3800],
    "towerDamage": [5500, 8900, 4300, 21000, 4500, 1900, 2100, 84, 0, 507],
}
SCORES = [12.6, 6.2, 8.3, 9.5, 9.3, 5.7, 7.5, 5.8, 7.4, 4.6]


def assert_values(page, require_complete=False):
    assert len(page["players"]) == 10
    known = 0
    for index, player in enumerate(page["players"]):
        assert player["side"] == ("blue" if index < 5 else "red")
        assert player["slot"] == index % 5 + 1
        assert player["score"]["value"] == SCORES[index]
        for field, metric in player["metrics"].items():
            value = metric["value"]
            if value is not None:
                assert value == EXPECTED[field][index], (page["type"], index, field, value, EXPECTED[field][index])
                assert metric["sourceRegion"]
                known += 1
            elif require_complete:
                raise AssertionError((page["type"], index, field, "missing"))
    return known


class RealSampleTests(unittest.TestCase):
    def test_six_real_layouts_and_transcribed_values(self):
        known = 0
        files = list((Path(__file__).parent / "fixtures").glob("*.json"))
        self.assertEqual(len(files), 6)
        for path in files:
            raw = json.loads(path.read_text(encoding="utf-8"))
            boxes = [TextBox(**b) for b in raw["boxes"]]
            page = parse_page(boxes, raw["width"], raw["height"], path.stem)
            known += assert_values(page)
            with self.assertRaises(ValueError):
                parse_page(boxes, raw["width"], raw["height"], "TEAM" if path.stem != "TEAM" else "DATA")
        self.assertGreaterEqual(known, 176)


if __name__ == "__main__":
    unittest.main()
