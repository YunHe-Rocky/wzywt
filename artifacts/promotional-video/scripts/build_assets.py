from __future__ import annotations

import math
import shutil
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[3]
VIDEO_DIR = Path(__file__).resolve().parents[1]
CAPTURE_DIR = VIDEO_DIR / "captures"
SCENE_DIR = VIDEO_DIR / "scenes"
MUSIC_DIR = VIDEO_DIR / "music"
SCENE_DIR.mkdir(parents=True, exist_ok=True)
MUSIC_DIR.mkdir(parents=True, exist_ok=True)

WIDTH, HEIGHT = 1920, 1080
NAVY = (8, 15, 23)
CARD = (16, 30, 43)
GOLD = (211, 183, 131)
GOLD_LIGHT = (237, 215, 170)
TEXT = (246, 242, 232)
TEXT_SECONDARY = (183, 195, 205)
MINT = (151, 205, 194)
BLUE = (83, 160, 218)
RED = (218, 91, 91)


def find_font(bold: bool) -> str:
    names = (
        ["msyhbd.ttc", "msyhbd.ttf", "simhei.ttf"]
        if bold
        else ["msyh.ttc", "msyh.ttf", "simsun.ttc", "simfang.ttf"]
    )
    for name in names:
        candidate = Path("C:/Windows/Fonts") / name
        if candidate.exists():
            return str(candidate)
    raise FileNotFoundError("No usable Chinese font found")


FONT_REGULAR = find_font(False)
FONT_BOLD = find_font(True)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size=size)


def fit_crop(image: Image.Image, size: tuple[int, int], anchor: tuple[float, float] = (0.5, 0.5)) -> Image.Image:
    target_w, target_h = size
    ratio = max(target_w / image.width, target_h / image.height)
    resized = image.resize((round(image.width * ratio), round(image.height * ratio)), Image.Resampling.LANCZOS)
    left = round((resized.width - target_w) * anchor[0])
    top = round((resized.height - target_h) * anchor[1])
    return resized.crop((left, top, left + target_w, top + target_h))


def make_background(accent: tuple[int, int, int] = (23, 58, 75), seed: int = 7) -> Image.Image:
    yy, xx = np.mgrid[0:HEIGHT, 0:WIDTH]
    x = xx / WIDTH
    y = yy / HEIGHT
    base = np.zeros((HEIGHT, WIDTH, 3), dtype=np.float32)
    base[:] = NAVY
    radial = np.exp(-(((x - 0.78) / 0.52) ** 2 + ((y - 0.12) / 0.72) ** 2) * 2.2)
    gold_glow = np.exp(-(((x - 0.08) / 0.38) ** 2 + ((y - 0.95) / 0.45) ** 2) * 2.8)
    for channel in range(3):
        base[:, :, channel] += radial * accent[channel] * 0.28
        base[:, :, channel] += gold_glow * GOLD[channel] * 0.045
    rng = np.random.default_rng(seed)
    noise = rng.normal(0, 1.3, (HEIGHT, WIDTH, 1)).astype(np.float32)
    base += noise
    return Image.fromarray(np.uint8(np.clip(base, 0, 255)), "RGB").convert("RGBA")


def overlay_gradient(image: Image.Image, left_alpha: int = 235, right_alpha: int = 55, bottom_alpha: int = 180) -> Image.Image:
    arr = np.zeros((HEIGHT, WIDTH, 4), dtype=np.uint8)
    horizontal = np.linspace(left_alpha, right_alpha, WIDTH, dtype=np.float32)
    vertical = np.linspace(0, bottom_alpha, HEIGHT, dtype=np.float32)
    alpha = np.maximum(horizontal[None, :], vertical[:, None])
    arr[:, :, 3] = np.uint8(np.clip(alpha, 0, 255))
    layer = Image.fromarray(arr, "RGBA")
    return Image.alpha_composite(image.convert("RGBA"), layer)


def rounded_paste(
    canvas: Image.Image,
    image: Image.Image,
    box: tuple[int, int, int, int],
    radius: int = 28,
    outline: tuple[int, int, int, int] = (211, 183, 131, 80),
    shadow: bool = True,
) -> None:
    left, top, right, bottom = box
    size = (right - left, bottom - top)
    fitted = fit_crop(image.convert("RGB"), size)
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    if shadow:
        shadow_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        shadow_mask = Image.new("L", canvas.size, 0)
        ImageDraw.Draw(shadow_mask).rounded_rectangle((left - 10, top + 10, right + 10, bottom + 30), radius=radius + 10, fill=155)
        shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(24))
        shadow_layer.paste((0, 0, 0, 150), (0, 0, WIDTH, HEIGHT), shadow_mask)
        canvas.alpha_composite(shadow_layer)
    canvas.paste(fitted.convert("RGBA"), (left, top), mask)
    draw = ImageDraw.Draw(canvas, "RGBA")
    draw.rounded_rectangle((left, top, right, bottom), radius=radius, outline=outline, width=2)


def draw_brand(draw: ImageDraw.ImageDraw, x: int = 74, y: int = 52, compact: bool = False) -> None:
    shield = [(x + 24, y), (x + 48, y + 14), (x + 42, y + 48), (x + 24, y + 62), (x + 6, y + 48), (x, y + 14)]
    draw.line(shield + [shield[0]], fill=GOLD_LIGHT, width=4, joint="curve")
    draw.line([(x + 13, y + 19), (x + 24, y + 31), (x + 35, y + 19)], fill=GOLD, width=3)
    draw.line([(x + 13, y + 34), (x + 24, y + 46), (x + 35, y + 34)], fill=GOLD, width=3)
    draw.text((x + 66, y + 1), "王者演武堂", font=font(30 if compact else 36, True), fill=TEXT)
    draw.text((x + 68, y + 43), "YANWU ARENA", font=font(15), fill=GOLD, spacing=4)


def draw_kicker(draw: ImageDraw.ImageDraw, text: str, x: int, y: int) -> None:
    draw.line((x, y + 15, x + 30, y + 15), fill=GOLD, width=2)
    draw.text((x + 44, y), text, font=font(22, True), fill=GOLD_LIGHT)


def draw_scene_number(draw: ImageDraw.ImageDraw, number: int) -> None:
    draw.text((1770, 60), f"0{number} / 08", font=font(18), fill=(151, 165, 177, 190))


def draw_caption(draw: ImageDraw.ImageDraw, text: str) -> None:
    box = draw.textbbox((0, 0), text, font=font(31, True))
    text_w = box[2] - box[0]
    left = (WIDTH - text_w) // 2 - 46
    right = (WIDTH + text_w) // 2 + 46
    draw.rounded_rectangle((left, 954, right, 1023), radius=18, fill=(5, 12, 19, 220), outline=(211, 183, 131, 80), width=2)
    draw.text(((WIDTH - text_w) // 2, 970), text, font=font(31, True), fill=TEXT)


def draw_browser(canvas: Image.Image, screenshot: Image.Image, box: tuple[int, int, int, int]) -> None:
    left, top, right, bottom = box
    draw = ImageDraw.Draw(canvas, "RGBA")
    draw.rounded_rectangle((left, top, right, bottom), radius=28, fill=(7, 14, 21, 245), outline=(211, 183, 131, 80), width=2)
    bar_h = 54
    for index, color in enumerate(((234, 100, 89), (236, 190, 79), (95, 196, 116))):
        cx = left + 28 + index * 25
        draw.ellipse((cx, top + 20, cx + 11, top + 31), fill=(*color, 220))
    draw.rounded_rectangle((left + 130, top + 13, right - 28, top + 40), radius=12, fill=(22, 37, 51, 240))
    draw.text((left + 154, top + 17), "ywt.yunhe.ink", font=font(16), fill=(175, 187, 198))
    rounded_paste(canvas, screenshot, (left + 2, top + bar_h, right - 2, bottom - 2), radius=22, shadow=False)


def save_scene(number: int, canvas: Image.Image) -> None:
    canvas.convert("RGB").save(SCENE_DIR / f"scene-{number:02d}.png", quality=96)


def build_scenes() -> None:
    home = Image.open(CAPTURE_DIR / "home.png")
    home_flow = Image.open(CAPTURE_DIR / "home-flow.png")
    heroes = Image.open(CAPTURE_DIR / "heroes.png")
    equipment = Image.open(CAPTURE_DIR / "equipment.png")
    mobile = Image.open(CAPTURE_DIR / "mobile-home.png")
    arena = Image.open(ROOT / "public" / "art" / "arena.webp")

    # 01 - Cinematic hook.
    scene = fit_crop(arena, (WIDTH, HEIGHT), anchor=(0.58, 0.5)).convert("RGBA")
    scene = overlay_gradient(scene, 248, 80, 200)
    draw = ImageDraw.Draw(scene, "RGBA")
    rng = np.random.default_rng(10)
    for _ in range(46):
        px, py = int(rng.uniform(980, 1840)), int(rng.uniform(90, 890))
        radius = int(rng.uniform(1, 4))
        draw.ellipse((px - radius, py - radius, px + radius, py + radius), fill=(237, 215, 170, int(rng.uniform(45, 150))))
    draw_brand(draw)
    draw_scene_number(draw, 1)
    draw_kicker(draw, "王者荣耀 · 好友内战", 128, 220)
    draw.text((128, 284), "十个人，", font=font(78, True), fill=TEXT)
    draw.text((128, 382), "一场内战。", font=font(92, True), fill=GOLD_LIGHT)
    draw.text((132, 520), "怎么分，才够公平？", font=font(37, True), fill=TEXT_SECONDARY)
    draw_caption(draw, "十个人，一场内战。怎么分队，才够公平？")
    save_scene(1, scene)

    # 02 - Pain points.
    scene = make_background((72, 37, 48), 12)
    draw = ImageDraw.Draw(scene, "RGBA")
    draw_brand(draw, compact=True)
    draw_scene_number(draw, 2)
    draw_kicker(draw, "每次开局，都要面对同一道题", 128, 170)
    draw.text((128, 223), "人齐了，队却不好分。", font=font(64, True), fill=TEXT)
    panels = [
        (128, 366, 875, 830, "随机分队", "撞位置", "大家都想玩擅长的路"),
        (1045, 366, 1792, 830, "凭感觉分队", "有人不服", "阵容与实力难以说清"),
    ]
    for index, (left, top, right, bottom, title, warning, detail) in enumerate(panels):
        draw.rounded_rectangle((left, top, right, bottom), radius=28, fill=(17, 29, 42, 235), outline=(218, 91, 91, 115), width=2)
        draw.text((left + 44, top + 40), title, font=font(28, True), fill=TEXT_SECONDARY)
        for person in range(5):
            cx = left + 84 + person * 123
            cy = top + 160 + (person % 2) * 70
            draw.ellipse((cx - 30, cy - 30, cx + 30, cy + 30), fill=(53, 72, 87), outline=(183, 195, 205, 110), width=2)
            draw.text((cx - 11, cy - 18), str(person + 1 + index * 5), font=font(21, True), fill=TEXT)
        draw.rounded_rectangle((left + 44, bottom - 146, right - 44, bottom - 76), radius=18, fill=(111, 43, 52, 165))
        draw.text((left + 70, bottom - 127), warning, font=font(29, True), fill=(255, 190, 190))
        draw.text((left + 44, bottom - 50), detail, font=font(21), fill=TEXT_SECONDARY)
    draw_caption(draw, "靠猜，容易撞位置；凭感觉，又总有人不服。")
    save_scene(2, scene)

    # 03 - Product positioning with real homepage.
    scene = make_background((18, 60, 76), 13)
    draw = ImageDraw.Draw(scene, "RGBA")
    draw_brand(draw, compact=True)
    draw_scene_number(draw, 3)
    draw.text((128, 152), "为好友内战而生", font=font(58, True), fill=TEXT)
    draw.text((130, 226), "从“人齐了”，到“开打了”。", font=font(28), fill=GOLD_LIGHT)
    draw_browser(scene, home, (120, 300, 1800, 918))
    draw_caption(draw, "王者演武堂，为王者荣耀好友内战而生。")
    save_scene(3, scene)

    # 04 - Inputs to deterministic split.
    scene = make_background((23, 74, 70), 14)
    draw = ImageDraw.Draw(scene, "RGBA")
    draw_brand(draw, compact=True)
    draw_scene_number(draw, 4)
    draw_kicker(draw, "不靠猜，用玩家自己的数据说话", 128, 166)
    draw.text((128, 220), "懂实力，也懂你想走的路。", font=font(58, True), fill=TEXT)
    cards = [
        (126, 392, "分路偏好", "对抗 · 打野 · 中路 · 发育 · 游走", "路"),
        (126, 572, "段位实力", "当前段位 · 巅峰分 · 历史表现", "段"),
        (126, 752, "英雄战力", "常用英雄 · 分路战力 · 擅长组合", "战"),
    ]
    for left, top, title, detail, badge in cards:
        draw.rounded_rectangle((left, top, 1010, top + 138), radius=24, fill=(16, 33, 46, 236), outline=(151, 205, 194, 80), width=2)
        draw.rounded_rectangle((left + 28, top + 25, left + 116, top + 113), radius=20, fill=(31, 72, 75, 220))
        draw.text((left + 52, top + 47), badge, font=font(28, True), fill=MINT)
        draw.text((left + 150, top + 28), title, font=font(31, True), fill=TEXT)
        draw.text((left + 150, top + 78), detail, font=font(20), fill=TEXT_SECONDARY)
        draw.line((1035, top + 69, 1160, top + 69), fill=GOLD, width=3)
        draw.polygon([(1160, top + 69), (1140, top + 58), (1140, top + 80)], fill=GOLD)
    draw.rounded_rectangle((1215, 430, 1765, 838), radius=44, fill=(24, 39, 51, 245), outline=(211, 183, 131, 140), width=3)
    draw.ellipse((1388, 512, 1592, 716), fill=(211, 183, 131, 25), outline=(211, 183, 131, 150), width=3)
    draw.text((1433, 563), "分", font=font(76, True), fill=GOLD_LIGHT)
    draw.text((1360, 744), "确定性分队", font=font(36, True), fill=TEXT)
    draw.text((1374, 796), "偏好优先 · 实力均衡", font=font(21), fill=TEXT_SECONDARY)
    draw_caption(draw, "记录分路偏好、段位实力和英雄战力，让每位玩家都更合适。")
    save_scene(4, scene)

    # 05 - Balanced teams.
    scene = make_background((31, 50, 76), 15)
    draw = ImageDraw.Draw(scene, "RGBA")
    draw_brand(draw, compact=True)
    draw_scene_number(draw, 5)
    draw_kicker(draw, "每次输入相同，结果都可重现", 128, 166)
    draw.text((128, 220), "分个好队，打得有来有回。", font=font(58, True), fill=TEXT)
    team_boxes = [(120, 360, 820, 855, BLUE, "蓝方"), (1100, 360, 1800, 855, RED, "红方")]
    roles = ["对抗路", "打野", "中路", "发育路", "游走"]
    for left, top, right, bottom, color, name in team_boxes:
        draw.rounded_rectangle((left, top, right, bottom), radius=30, fill=(16, 30, 43, 240), outline=(*color, 145), width=3)
        draw.text((left + 42, top + 28), name, font=font(34, True), fill=color)
        draw.text((right - 226, top + 37), "5 / 5", font=font(22, True), fill=TEXT_SECONDARY)
        for idx, role in enumerate(roles):
            row_y = top + 108 + idx * 68
            draw.ellipse((left + 44, row_y, left + 88, row_y + 44), fill=(*color, 55), outline=(*color, 160), width=2)
            draw.text((left + 58, row_y + 7), str(idx + 1), font=font(18, True), fill=TEXT)
            draw.text((left + 112, row_y + 6), role, font=font(25, True), fill=TEXT)
            draw.rounded_rectangle((right - 215, row_y + 3, right - 42, row_y + 41), radius=14, fill=(28, 43, 56, 235))
            draw.text((right - 184, row_y + 8), "偏好匹配", font=font(18), fill=MINT)
    draw.ellipse((850, 500, 1070, 720), fill=(8, 15, 23, 245), outline=(211, 183, 131, 150), width=3)
    draw.text((904, 548), "VS", font=font(60, True), fill=GOLD_LIGHT)
    draw.text((858, 738), "位置 · 实力", font=font(22, True), fill=TEXT_SECONDARY)
    draw_caption(draw, "确定性均衡分队，兼顾位置与实力。红蓝双方，有来有回。")
    save_scene(5, scene)

    # 06 - Room flow + mobile readiness.
    scene = make_background((20, 60, 78), 16)
    draw = ImageDraw.Draw(scene, "RGBA")
    draw_brand(draw, compact=True)
    draw_scene_number(draw, 6)
    draw.text((126, 152), "一个房间号，把朋友都叫齐。", font=font(55, True), fill=TEXT)
    draw.text((128, 220), "创建 · 分享 · 加入 · 开打", font=font(25, True), fill=GOLD_LIGHT)
    draw_browser(scene, home_flow, (102, 306, 1460, 910))
    phone_box = (1510, 182, 1832, 912)
    draw.rounded_rectangle(phone_box, radius=52, fill=(5, 10, 16, 255), outline=(211, 183, 131, 150), width=4)
    rounded_paste(scene, mobile, (1524, 208, 1818, 884), radius=40, shadow=False)
    draw.rounded_rectangle((1611, 194, 1731, 208), radius=7, fill=(31, 44, 55, 255))
    draw_caption(draw, "创建房间、分享房间号、快速集结；临时补位，也能轻松加入。")
    save_scene(6, scene)

    # 07 - Hero and equipment preparation.
    scene = make_background((56, 48, 45), 17)
    draw = ImageDraw.Draw(scene, "RGBA")
    draw_brand(draw, compact=True)
    draw_scene_number(draw, 7)
    draw.text((128, 150), "等人时，也是备战时间。", font=font(58, True), fill=TEXT)
    draw.text((130, 225), "132 位英雄 · 121 件装备", font=font(26, True), fill=GOLD_LIGHT)
    draw_browser(scene, heroes, (90, 326, 960, 900))
    draw_browser(scene, equipment, (990, 326, 1860, 900))
    draw.rounded_rectangle((655, 292, 925, 346), radius=15, fill=(32, 72, 75, 230))
    draw.text((708, 304), "英雄图鉴", font=font(23, True), fill=MINT)
    draw.rounded_rectangle((1575, 292, 1840, 346), radius=15, fill=(82, 66, 43, 230))
    draw.text((1623, 304), "装备图鉴", font=font(23, True), fill=GOLD_LIGHT)
    draw_caption(draw, "查英雄、看技能、琢磨出装。赛后记录，也清晰留存。")
    save_scene(7, scene)

    # 08 - Final CTA.
    scene = fit_crop(arena, (WIDTH, HEIGHT), anchor=(0.56, 0.5)).convert("RGBA")
    scene = overlay_gradient(scene, 250, 120, 215)
    draw = ImageDraw.Draw(scene, "RGBA")
    draw_brand(draw)
    draw_scene_number(draw, 8)
    draw_kicker(draw, "熟悉的朋友，也可以是好对手。", 128, 222)
    draw.text((128, 292), "今晚，", font=font(86, True), fill=TEXT)
    draw.text((128, 400), "峡谷见。", font=font(106, True), fill=GOLD_LIGHT)
    draw.rounded_rectangle((130, 580, 750, 660), radius=22, fill=(237, 215, 170, 235))
    draw.text((184, 597), "ywt.yunhe.ink", font=font(34, True), fill=(13, 26, 36))
    draw.text((132, 704), "王者演武堂", font=font(40, True), fill=TEXT)
    draw.text((132, 766), "和朋友，好好打一场。", font=font(30), fill=TEXT_SECONDARY)
    phone_box = (1370, 120, 1770, 930)
    draw.rounded_rectangle(phone_box, radius=58, fill=(5, 10, 16, 250), outline=(237, 215, 170, 170), width=4)
    rounded_paste(scene, mobile, (1387, 150, 1753, 900), radius=44, shadow=False)
    draw.rounded_rectangle((1500, 134, 1640, 149), radius=8, fill=(31, 44, 55, 255))
    draw_caption(draw, "王者演武堂，和朋友，好好打一场。")
    save_scene(8, scene)
    shutil.copy2(SCENE_DIR / "scene-08.png", VIDEO_DIR / "poster.png")


def add_tone(track: np.ndarray, sample_rate: int, start: float, duration: float, frequency: float, amplitude: float, pan: float = 0.0, decay: float | None = None) -> None:
    begin = max(0, int(start * sample_rate))
    end = min(len(track), begin + int(duration * sample_rate))
    if end <= begin:
        return
    t = np.arange(end - begin, dtype=np.float32) / sample_rate
    envelope = np.ones_like(t)
    attack = min(int(0.08 * sample_rate), len(t) // 3)
    if attack:
        envelope[:attack] = np.linspace(0, 1, attack, dtype=np.float32)
    release = min(int(0.18 * sample_rate), len(t) // 3)
    if release:
        envelope[-release:] *= np.linspace(1, 0, release, dtype=np.float32)
    if decay:
        envelope *= np.exp(-t / decay)
    signal = (np.sin(2 * np.pi * frequency * t) + 0.22 * np.sin(2 * np.pi * frequency * 2 * t)) * amplitude * envelope
    left_gain = math.sqrt((1 - pan) / 2)
    right_gain = math.sqrt((1 + pan) / 2)
    track[begin:end, 0] += signal * left_gain
    track[begin:end, 1] += signal * right_gain


def add_kick(track: np.ndarray, sample_rate: int, start: float, amplitude: float) -> None:
    duration = 0.42
    begin = int(start * sample_rate)
    end = min(len(track), begin + int(duration * sample_rate))
    if begin < 0 or end <= begin:
        return
    t = np.arange(end - begin, dtype=np.float32) / sample_rate
    phase = 2 * np.pi * (78 * t - 36 * t * t)
    signal = np.sin(phase) * np.exp(-t * 9.5) * amplitude
    track[begin:end, 0] += signal
    track[begin:end, 1] += signal


def add_noise_hit(track: np.ndarray, sample_rate: int, start: float, duration: float, amplitude: float, seed: int, pan: float = 0.0) -> None:
    begin = int(start * sample_rate)
    end = min(len(track), begin + int(duration * sample_rate))
    if begin < 0 or end <= begin:
        return
    rng = np.random.default_rng(seed)
    t = np.arange(end - begin, dtype=np.float32) / sample_rate
    noise = rng.normal(0, 1, end - begin).astype(np.float32)
    smooth = np.convolve(noise, np.ones(4, dtype=np.float32) / 4, mode="same")
    signal = smooth * np.exp(-t * 18) * amplitude
    left_gain = math.sqrt((1 - pan) / 2)
    right_gain = math.sqrt((1 + pan) / 2)
    track[begin:end, 0] += signal * left_gain
    track[begin:end, 1] += signal * right_gain


def build_music(duration: float = 61.2, sample_rate: int = 48000) -> None:
    samples = int(duration * sample_rate)
    track = np.zeros((samples, 2), dtype=np.float32)
    tempo = 104
    beat = 60 / tempo
    chord_roots = [146.83, 116.54, 130.81, 110.00]
    pentatonic = [293.66, 349.23, 392.00, 440.00, 523.25, 587.33]

    # Wide atmospheric pads in a D-minor / pentatonic palette.
    bar = beat * 4
    bar_index = 0
    start = 0.0
    while start < duration:
        root = chord_roots[bar_index % len(chord_roots)]
        intensity = 0.045 if start < 12.5 else 0.065
        if start > 50:
            intensity *= 1.15
        for interval, pan in ((1.0, -0.35), (1.5, 0.25), (2.0, 0.48)):
            add_tone(track, sample_rate, start, bar * 1.12, root * interval, intensity, pan)
        bar_index += 1
        start += bar

    # Cinematic drum pulse and Chinese war-drum accents.
    beat_index = 0
    start = 0.0
    while start < duration:
        section_gain = 0.18 if start < 12.5 else 0.26
        if start > 50:
            section_gain = 0.31
        add_kick(track, sample_rate, start, section_gain)
        if beat_index % 4 in (1, 3) and start > 6:
            add_noise_hit(track, sample_rate, start, 0.26, 0.075, 1000 + beat_index)
        if beat_index % 4 == 0:
            add_tone(track, sample_rate, start, 0.85, 62.0, 0.14 if start < 12 else 0.20, 0.0, decay=0.22)
        beat_index += 1
        start += beat

    # Crisp electronic hats from the product reveal onward.
    start = 12.5
    hat_index = 0
    while start < 55:
        pan = -0.6 if hat_index % 2 == 0 else 0.6
        add_noise_hit(track, sample_rate, start, 0.08, 0.034, 3000 + hat_index, pan)
        start += beat / 2
        hat_index += 1

    # Original pentatonic plucks; sparse enough to leave room for narration.
    start = 13.0
    note_index = 0
    sequence = [0, 2, 3, 1, 4, 3, 2, 5, 3, 1, 2, 0]
    while start < 57:
        note = pentatonic[sequence[note_index % len(sequence)]]
        pan = -0.45 + (note_index % 4) * 0.3
        add_tone(track, sample_rate, start, 0.58, note, 0.075, pan, decay=0.18)
        note_index += 1
        start += beat

    # Transition swells.
    for swell_index, transition in enumerate((6.35, 12.70, 19.55, 27.40, 35.25, 43.10, 50.95)):
        begin = max(0, int((transition - 0.8) * sample_rate))
        end = min(samples, int((transition + 0.12) * sample_rate))
        rng = np.random.default_rng(5000 + swell_index)
        t = np.linspace(0, 1, end - begin, dtype=np.float32)
        noise = rng.normal(0, 1, end - begin).astype(np.float32)
        swell = np.convolve(noise, np.ones(18, dtype=np.float32) / 18, mode="same") * (t**2) * 0.065
        track[begin:end, 0] += swell * (0.8 if swell_index % 2 else 1.0)
        track[begin:end, 1] += swell * (1.0 if swell_index % 2 else 0.8)

    fade_in = int(1.4 * sample_rate)
    fade_out = int(3.2 * sample_rate)
    track[:fade_in] *= np.linspace(0, 1, fade_in, dtype=np.float32)[:, None]
    track[-fade_out:] *= np.linspace(1, 0, fade_out, dtype=np.float32)[:, None]
    peak = float(np.max(np.abs(track))) or 1.0
    track = np.tanh(track / peak * 1.35) * 0.76
    pcm = np.int16(np.clip(track, -1, 1) * 32767)
    target = MUSIC_DIR / "yanwu-original-score.wav"
    with wave.open(str(target), "wb") as wav_file:
        wav_file.setnchannels(2)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm.tobytes())


if __name__ == "__main__":
    build_scenes()
    build_music()
    print(f"scenes={SCENE_DIR}")
    print(f"music={MUSIC_DIR / 'yanwu-original-score.wav'}")
