"""Six result tabs in the supplied landscape / 双方 layout, in original pixels.

Headers verify the selected tab. Missing/ambiguous fields remain unknown; these
results still require identity, side and statistic confirmation in the website.
"""
import math
import re
from dataclasses import dataclass
from decimal import Decimal


# Label, website metric, horizontal cell bounds, percentage displayed in the bar.
PAGE_COLUMNS = {
    "DATA": (("输出伤害", "damageDealt", .222, .283, False),
             ("承受伤害", "damageTaken", .283, .346, False),
             ("总经济", "gold", .346, .410, False),
             ("参团率", "participationRate", .410, .476, True)),
    "OUTPUT": (("输出伤害", "damageDealt", .222, .350, False),
               ("伤害转化比", "damageConversionRate", .350, .476, False)),
    "SURVIVAL": (("承受伤害", "damageTaken", .222, .350, False),
                 ("每死承伤", "damageTakenPerDeath", .350, .476, False)),
    "DEVELOPMENT": (("总经济", "gold", .222, .309, False),
                    ("野怪经济", "jungleGold", .309, .393, False),
                    ("补刀数", "minionKills", .393, .476, False)),
    "KDA": (("击败", "kills", .222, .309, False),
            ("死亡", "deaths", .309, .393, False),
            ("助攻", "assists", .393, .476, False)),
    "TEAM": (("参团率", "participationRate", .222, .283, True),
             ("控制效果", "controlScore", .283, .346, False),
             ("治疗量", "healing", .346, .410, False),
             ("对塔伤害", "towerDamage", .410, .476, False)),
}
INTEGER_FIELDS = {"kills", "deaths", "assists", "minionKills"}


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


def parse_page(boxes: list[TextBox], width: int, height: int, kind: str):
    if kind not in PAGE_COLUMNS:
        raise ValueError("Unknown screenshot type")
    if width <= 0 or height <= 0 or not 2.0 <= width / height <= 2.35:
        raise ValueError(f"{kind}: 请上传完整横屏结算截图（双方视图），不要裁剪或拼接")
    columns = PAGE_COLUMNS[kind]

    def region(x1, y1, x2, y2):
        return [b for b in boxes if x1 <= b.center[0] / width < x2 and y1 <= b.center[1] / height < y2]

    # Verify both panels' column labels, rather than assuming any image is a match.
    for shift in (0, 0.44):
        for label, _field, x1, x2, _percent in columns:
            if not any(b.text.strip() == label and b.confidence >= .90
                       for b in region(x1 + shift, .14, x2 + shift, .19)):
                raise ValueError(f"{kind}: 未找到“{label}”表头，请检查截图分类、双方视图和清晰度")

    def one(items):
        return items[0] if len(items) == 1 else None

    def metric(items, percent=False, max_value=None, integer=False):
        # Multiple boxes, low confidence and illegible fields stay unknown.
        item = one(items)
        value = number(item.text, percent) if item and item.confidence >= .90 else None
        if value is not None and max_value is not None and value > max_value:
            value = None
        if value is not None and integer and not value.is_integer():
            value = None
        return {"value": value, "confidence": item.confidence if item else None,
                "sourceRegion": ",".join(str(round(n, 2)) for p in item.box for n in p) if item else None}

    players = []
    for side, shift in (("blue", 0), ("red", .44)):
        for row in range(5):
            top = .192 + row * .1195
            bottom = top + .115
            name_boxes = region(.223 + shift, top, .432 + shift, top + .049)
            # Bonus points have a preceding icon that OCR can mistake for a character.
            # Exclude that bounded bonus area, not arbitrary parts of a long nickname.
            bonuses = [min(p[0] for p in b.box)/width for b in name_boxes
                       if re.fullmatch(r"[+\-]\d+", b.text.strip())]
            bonus_start = min(bonuses) - .025 if bonuses else 1
            name = one([b for b in name_boxes if b.confidence >= .90
                        and b.center[0]/width < bonus_start
                        and not (b.text.strip().isnumeric() and len(b.text.strip()) <= 2)])
            hero = one(region(.06 + shift, top + .074, .125 + shift, bottom))
            score_boxes = region(.15 + shift, top + .049, .202 + shift, top + .095)
            # A missing nickname or score alone must not discard the other observed fields.
            if not name and not (one(score_boxes) and one(score_boxes).confidence >= .90
                                 and number(one(score_boxes).text) is not None):
                continue
            metrics = {}
            for _label, field, x1, x2, percent in columns:
                metrics[field] = metric(region(x1 + shift, top + (.078 if percent else .049),
                                              x2 + shift, bottom if percent else top + .078),
                                        percent=percent, integer=field in INTEGER_FIELDS)
            players.append({"side": side, "slot": row + 1,
                            "nickname": name.text if name else None,
                            "heroName": hero.text if hero and hero.confidence >= .90 else None,
                            "heroId": None, "score": metric(score_boxes, max_value=16), "metrics": metrics})
    if len(players) != 10 or sum(p["nickname"] is not None for p in players) < 6:
        raise ValueError(f"{kind}: 无法定位完整十人信息，请上传清晰、未裁剪的双方截图")
    return {"type": kind, "players": players}


def parse_data(boxes: list[TextBox], width: int, height: int):
    return parse_page(boxes, width, height, "DATA")
