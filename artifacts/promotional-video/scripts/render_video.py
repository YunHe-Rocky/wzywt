from __future__ import annotations

import subprocess
import sys
from pathlib import Path


VIDEO_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(VIDEO_DIR / ".deps"))

import imageio_ffmpeg  # noqa: E402


FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SCENE_DIR = VIDEO_DIR / "scenes"
NARRATION_DIR = VIDEO_DIR / "narration"
MUSIC = VIDEO_DIR / "music" / "yanwu-original-score.wav"
OUTPUT = VIDEO_DIR / "yanwu-arena-promo-1080p.mp4"

SCENE_DURATIONS = [7.0, 7.0, 7.5, 8.5, 8.5, 8.5, 8.5, 10.0]
TRANSITION = 0.65
VOICE_STARTS = [0.65, 6.95, 13.25, 19.95, 27.80, 35.65, 43.45, 51.20]
NARRATION_FILES = [
    "01-hook.wav",
    "02-pain.wav",
    "03-position.wav",
    "04-profile.wav",
    "05-balance.wav",
    "06-room.wav",
    "07-prepare.wav",
    "08-finale.wav",
]


def build_filter() -> tuple[str, float]:
    parts: list[str] = []

    for index, duration in enumerate(SCENE_DURATIONS):
        phase = index * 0.72
        parts.append(
            f"[{index}:v]"
            "scale=2048:1152:flags=lanczos,"
            f"crop=1920:1080:x='64+28*sin(t*0.32+{phase:.2f})':y='36+16*cos(t*0.27+{phase:.2f})',"
            f"trim=duration={duration:.2f},setpts=PTS-STARTPTS,setsar=1,fps=30,format=yuv420p[v{index}]"
        )

    previous = "v0"
    running_duration = SCENE_DURATIONS[0]
    for index in range(1, len(SCENE_DURATIONS)):
        offset = running_duration - TRANSITION
        output_label = f"vx{index}"
        transition_name = "fade" if index in (1, 3, 5, 7) else "smoothleft"
        parts.append(
            f"[{previous}][v{index}]xfade=transition={transition_name}:duration={TRANSITION:.2f}:offset={offset:.2f}[{output_label}]"
        )
        previous = output_label
        running_duration += SCENE_DURATIONS[index] - TRANSITION

    parts.append(f"[{previous}]fade=t=in:st=0:d=0.45,fade=t=out:st={running_duration - 1.15:.2f}:d=1.15[vout]")

    voice_labels: list[str] = []
    for index, start in enumerate(VOICE_STARTS):
        input_index = len(SCENE_DURATIONS) + index
        delay = round(start * 1000)
        label = f"n{index}"
        parts.append(
            f"[{input_index}:a]aresample=48000,aformat=channel_layouts=stereo,"
            f"highpass=f=72,lowpass=f=11500,volume=1.42,adelay={delay}|{delay}[{label}]"
        )
        voice_labels.append(f"[{label}]")

    parts.append(
        "".join(voice_labels)
        + f"amix=inputs={len(voice_labels)}:duration=longest:normalize=0,"
        "acompressor=threshold=0.10:ratio=3.2:attack=8:release=120,alimiter=limit=0.92,"
        f"apad=whole_dur={running_duration:.2f},asplit=2[voice_sc][voice_mix]"
    )

    music_input = len(SCENE_DURATIONS) + len(NARRATION_FILES)
    parts.append(
        f"[{music_input}:a]aresample=48000,atrim=duration={running_duration:.2f},"
        f"afade=t=in:st=0:d=1.2,afade=t=out:st={running_duration - 3.2:.2f}:d=3.2,volume=0.34[music]"
    )
    parts.append(
        "[music][voice_sc]sidechaincompress=threshold=0.012:ratio=9:attack=18:release=320[ducked]"
    )
    parts.append(
        "[ducked][voice_mix]amix=inputs=2:duration=first:normalize=0:weights='0.92 1.28',"
        "loudnorm=I=-15.5:TP=-1.2:LRA=9,alimiter=limit=0.96[aout]"
    )
    return ";".join(parts), running_duration


def main() -> None:
    filter_complex, duration = build_filter()
    command = [FFMPEG, "-y", "-hide_banner"]

    for index, scene_duration in enumerate(SCENE_DURATIONS, start=1):
        command.extend(
            [
                "-loop",
                "1",
                "-framerate",
                "30",
                "-t",
                f"{scene_duration:.2f}",
                "-i",
                str(SCENE_DIR / f"scene-{index:02d}.png"),
            ]
        )

    for narration_file in NARRATION_FILES:
        command.extend(["-i", str(NARRATION_DIR / narration_file)])
    command.extend(["-i", str(MUSIC)])

    command.extend(
        [
            "-filter_complex",
            filter_complex,
            "-map",
            "[vout]",
            "-map",
            "[aout]",
            "-t",
            f"{duration:.2f}",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-profile:v",
            "high",
            "-level",
            "4.1",
            "-pix_fmt",
            "yuv420p",
            "-r",
            "30",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-movflags",
            "+faststart",
            str(OUTPUT),
        ]
    )

    print(f"ffmpeg={FFMPEG}")
    print(f"duration={duration:.2f}")
    print(f"output={OUTPUT}")
    result = subprocess.run(
        command,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    if result.returncode != 0:
        tail = "\n".join(result.stdout.splitlines()[-120:])
        print(tail)
        raise SystemExit(result.returncode)
    for line in result.stdout.splitlines():
        if "frame=" in line or "video:" in line:
            print(line)


if __name__ == "__main__":
    main()
