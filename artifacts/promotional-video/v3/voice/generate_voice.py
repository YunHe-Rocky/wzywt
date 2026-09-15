"""Render the approved public trailer narration with the established neural voice."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
import re
import subprocess
import sys
import wave

HERE = Path(__file__).resolve().parent
PROMO = HERE.parents[1]
sys.path.insert(0, str(PROMO / 'v2' / '.deps'))
sys.path.insert(0, str(PROMO / '.deps'))

import edge_tts
import imageio_ffmpeg

VOICE = 'zh-CN-YunxiNeural'
RATE = '-2%'
PITCH = '+0Hz'
LINES = [
    '今晚，还差你一个。',
    '熟悉的名字，再次亮起。',
    '平时一起上分。今天，做一回对手。',
    '把朋友叫齐，把这一局，交给认真。',
    '有人擅长冲锋，有人习惯守护。',
    '分路偏好，先被看见。',
    '再兼顾实力差距，让两边都值得全力以赴。',
    '胜负，不必提前写好。',
    '查英雄，看技能，找到今晚的拿手选择。',
    '看属性，想搭配。细节，也能成为底气。',
    '当熟悉的队友，站到峡谷另一边。',
    '不必客气。因为懂你的人，更值得认真。',
    '这一场，有交锋，也有默契。',
    '记下结果，也记住一起打过的这一晚。',
    '王者演武堂。',
    '和朋友，好好打一场。',
    '今晚，峡谷见。',
]


def analyze(wav: Path) -> dict:
    with wave.open(str(wav), 'rb') as source:
        duration = source.getnframes() / source.getframerate()
        sample_rate = source.getframerate()
        channels = source.getnchannels()
        width = source.getsampwidth()
    result = subprocess.run([
        imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-i', str(wav),
        '-af', 'silencedetect=noise=-42dB:d=0.06,volumedetect', '-f', 'null', '-'
    ], capture_output=True, text=True, encoding='utf-8', errors='replace', check=True)
    events = [(kind, float(value)) for kind, value in re.findall(
        r'silence_(start|end): ([0-9.]+)', result.stderr
    )]
    audible_start = 0.0
    audible_end = duration
    if len(events) > 1 and events[0][0] == 'start' and events[0][1] < 0.01:
        audible_start = events[1][1]
    if len(events) > 1 and events[-1][0] == 'end' and abs(events[-1][1] - duration) < 0.01:
        audible_end = events[-2][1]
    peak = re.search(r'max_volume: (-?[0-9.]+) dB', result.stderr)
    mean = re.search(r'mean_volume: (-?[0-9.]+) dB', result.stderr)
    return {
        'source_duration_seconds': round(duration, 6),
        'audible_start_seconds': round(audible_start, 6),
        'audible_end_seconds': round(audible_end, 6),
        'audible_span_seconds': round(audible_end - audible_start, 6),
        'sample_rate_hz': sample_rate,
        'channels': channels,
        'bits_per_sample': width * 8,
        'peak_dbfs': float(peak.group(1)) if peak else None,
        'mean_dbfs': float(mean.group(1)) if mean else None,
    }


async def main() -> None:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    manifest = {
        'engine': 'edge-tts', 'voice': VOICE, 'rate': RATE, 'pitch': PITCH,
        'silence_analysis': {'threshold_dbfs': -42, 'minimum_silence_seconds': 0.06},
        'clips': [],
    }
    jobs = list(enumerate(LINES, 1))
    jobs = [job for job in jobs if job[0] != 14] + [jobs[13]]
    for number, text in jobs:
        mp3 = HERE / f'{number:02d}.mp3'
        wav = HERE / f'{number:02d}.wav'
        print(f'{number:02d} {text}', flush=True)
        if not wav.exists():
            for attempt in range(3):
                try:
                    communication = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH)
                    await asyncio.wait_for(communication.save(str(mp3)), timeout=45)
                    break
                except (edge_tts.exceptions.NoAudioReceived, TimeoutError):
                    if attempt == 2:
                        raise
                    print(f'Retrying {number:02d}, attempt {attempt + 2}', flush=True)
                    await asyncio.sleep(1.0)
            subprocess.run([
                imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-hide_banner', '-loglevel', 'error',
                '-i', str(mp3), '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', str(wav),
            ], check=True)
        clip = {'number': number, 'text': text, 'wav': str(wav), 'mp3': str(mp3), **analyze(wav)}
        manifest['clips'].append(clip)
        manifest['clips'].sort(key=lambda entry: entry['number'])
        manifest['total_source_duration_seconds'] = round(sum(
            entry['source_duration_seconds'] for entry in manifest['clips']
        ), 6)
        manifest['total_audible_span_seconds'] = round(sum(
            entry['audible_span_seconds'] for entry in manifest['clips']
        ), 6)
        (HERE / 'manifest.json').write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8'
        )
        print(json.dumps(clip, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    asyncio.run(main())
