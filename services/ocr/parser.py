"""Experimental DATA/both-sides layout. Coordinates use the original image size.

Only the supplied landscape layout is supported. Never invent players or treat
missing text as zero. Other tabs need their own labelled fixtures before release.
"""
import math
import re
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class TextBox:
    text: str
    confidence: float
    box: list[list[float]]

    @property
    def center(self):
        return (sum(p[0] for p in self.box) / 4, sum(p[1] for p in self.box) / 4)


def number(text: str, percent: bool = False):
    match = re.fullmatch(r"(\d+(?:\.\d+)?)([kK万%]?)", text.strip().replace(",", ""))
    if not match or (percent != (match[2] == "%")):
        return None
    value = float(Decimal(match[1]) * {"k": 1000, "K": 1000, "万": 10000}.get(match[2], 1))
    if not math.isfinite(value) or (percent and value > 100):
        return None
    return value


def parse_data(boxes: list[TextBox], width: int, height: int):
    if not 2.0 <= width / height <= 2.35:
        raise ValueError("Unsupported screenshot aspect ratio; expected DATA / 双方 landscape layout")

    def region(x1, y1, x2, y2):
        return [b for b in boxes if x1 <= b.center[0] / width < x2 and y1 <= b.center[1] / height < y2]

    # Verify both panels' column labels, rather than assuming any image is a match.
    for shift in (0, 0.44):
        for label, x1, x2 in (("输出伤害", .22, .285), ("承受伤害", .285, .348),
                              ("总经济", .348, .409), ("参团率", .409, .473)):
            if not any(b.text.strip() == label for b in region(x1 + shift, .14, x2 + shift, .19)):
                raise ValueError("DATA header anchors not found; unsupported layout or unreadable screenshot")

    def one(items):
        return items[0] if len(items) == 1 else None

    def metric(items, percent=False, max_value=None):
        # Multiple boxes, low confidence and illegible fields stay unknown.
        item = one(items)
        value = number(item.text, percent) if item and item.confidence >= .90 else None
        if value is not None and max_value is not None and value > max_value:
            value = None
        return {"value": value, "confidence": item.confidence if item else None,
                "sourceRegion": ",".join(str(round(n, 2)) for p in item.box for n in p) if item else None}

    players = []
    for side, shift in (("blue", 0), ("red", .44)):
        for row in range(5):
            top = .192 + row * .1195
            bottom = top + .115
            name = one([b for b in region(.223 + shift, top, .432 + shift, top + .049)
                        if b.confidence >= .90 and not re.fullmatch(r"[+\-]?\d+", b.text.strip())])
            hero = one(region(.06 + shift, top + .074, .125 + shift, bottom))
            score_boxes = region(.15 + shift, top + .049, .202 + shift, top + .095)
            # At least a nickname and a numeric score must be observed to emit a row.
            if not name or number(one(score_boxes).text if one(score_boxes) else "") is None:
                continue
            metrics = {}
            for field, x1, x2 in (("damageDealt", .222, .282), ("damageTaken", .283, .345), ("gold", .346, .410)):
                metrics[field] = metric(region(x1 + shift, top + .049, x2 + shift, top + .078))
            metrics["participationRate"] = metric(region(.440 + shift, top + .078, .476 + shift, bottom), percent=True)
            players.append({"side": side, "slot": row + 1,
                            "nickname": name.text if name.confidence >= .90 else None,
                            "heroName": hero.text if hero and hero.confidence >= .90 else None,
                            "heroId": None, "score": metric(score_boxes, max_value=16), "metrics": metrics})
    if len(players) != 10:
        raise ValueError("Could not locate all ten players; use raw /ocr results to inspect coordinates")
    return {"type": "DATA", "players": players}
