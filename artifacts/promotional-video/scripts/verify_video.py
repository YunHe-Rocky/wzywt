from __future__ import annotations

import math
import subprocess
import sys
from pathlib import Path


VIDEO_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(VIDEO_DIR / ".deps"))

import imageio_ffmpeg  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw, ImageFont  # noqa: E402


FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
VIDEO = VIDEO_DIR / "yanwu-arena-promo-1080p.mp4"
VERIFY_DIR = VIDEO_DIR / "verification"
VERIFY_DIR.mkdir(parents=True, exist_ok=True)


def run(command: list[str], capture: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        command,
        check=False,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT,
    )


def main() -> None:
    if not VIDEO.exists() or VIDEO.stat().st_size < 1_000_000:
        raise SystemExit("FAIL: final MP4 is missing or unexpectedly small")

    reader = imageio_ffmpeg.read_frames(str(VIDEO), pix_fmt="rgb24")
    metadata = next(reader)
    reader.close()

    width, height = metadata["size"]
    fps = float(metadata["fps"])
    duration = float(metadata["duration"])
    if (width, height) != (1920, 1080):
        raise SystemExit(f"FAIL: resolution is {width}x{height}")
    if not 29.9 <= fps <= 30.1:
        raise SystemExit(f"FAIL: frame rate is {fps}")
    if not 60.0 <= duration <= 61.5:
        raise SystemExit(f"FAIL: duration is {duration}")

    decode = run(
        [
            FFMPEG,
            "-v",
            "error",
            "-i",
            str(VIDEO),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0",
            "-f",
            "null",
            "-",
        ]
    )
    if decode.returncode != 0:
        raise SystemExit("FAIL: full audio/video decode reported an error\n" + decode.stdout.decode("utf-8", errors="replace"))

    audio = subprocess.check_output(
        [
            FFMPEG,
            "-v",
            "error",
            "-i",
            str(VIDEO),
            "-map",
            "0:a:0",
            "-f",
            "s16le",
            "-ac",
            "2",
            "-ar",
            "48000",
            "-",
        ]
    )
    samples = np.frombuffer(audio, dtype=np.int16).astype(np.float32) / 32768.0
    rms = float(np.sqrt(np.mean(samples**2)))
    peak = float(np.max(np.abs(samples)))
    rms_dbfs = 20 * math.log10(max(rms, 1e-12))
    peak_dbfs = 20 * math.log10(max(peak, 1e-12))
    audio_duration = len(samples) / (48000 * 2)
    if audio_duration < 60.0 or rms_dbfs < -35 or peak > 0.9999:
        raise SystemExit(
            f"FAIL: audio metrics duration={audio_duration:.2f}s rms={rms_dbfs:.2f}dBFS peak={peak_dbfs:.2f}dBFS"
        )

    frame_times = [1.0, 8.0, 14.5, 21.5, 29.5, 37.5, 45.5, 53.0, 60.0]
    frames: list[tuple[float, Path]] = []
    for index, timestamp in enumerate(frame_times, start=1):
        target = VERIFY_DIR / f"frame-{index:02d}-{timestamp:04.1f}s.png"
        extract = run(
            [
                FFMPEG,
                "-y",
                "-v",
                "error",
                "-ss",
                f"{timestamp:.2f}",
                "-i",
                str(VIDEO),
                "-frames:v",
                "1",
                "-vf",
                "scale=640:360:flags=lanczos",
                str(target),
            ]
        )
        if extract.returncode != 0 or not target.exists():
            raise SystemExit(f"FAIL: could not extract verification frame at {timestamp:.2f}s")
        frames.append((timestamp, target))

    sheet = Image.new("RGB", (1920, 1140), (8, 15, 23))
    draw = ImageDraw.Draw(sheet)
    label_font_path = Path("C:/Windows/Fonts/msyhbd.ttc")
    if not label_font_path.exists():
        label_font_path = Path("C:/Windows/Fonts/simhei.ttf")
    label_font = ImageFont.truetype(str(label_font_path), 24)
    for index, (timestamp, target) in enumerate(frames):
        row, col = divmod(index, 3)
        x, y = col * 640, row * 380
        frame = Image.open(target).convert("RGB")
        sheet.paste(frame, (x, y))
        draw.rectangle((x, y + 330, x + 132, y + 360), fill=(5, 12, 19))
        draw.text((x + 12, y + 332), f"{timestamp:04.1f} s", font=label_font, fill=(237, 215, 170))
    contact_sheet = VERIFY_DIR / "timeline-contact-sheet.png"
    sheet.save(contact_sheet)

    print(f"PASS file_bytes={VIDEO.stat().st_size}")
    print(f"PASS video={width}x{height} fps={fps:.3f} duration={duration:.3f}s")
    print(f"PASS audio=stereo 48000Hz decoded_duration={audio_duration:.3f}s rms={rms_dbfs:.2f}dBFS peak={peak_dbfs:.2f}dBFS")
    print("PASS full_decode=video+audio")
    print(f"contact_sheet={contact_sheet}")


if __name__ == "__main__":
    main()
