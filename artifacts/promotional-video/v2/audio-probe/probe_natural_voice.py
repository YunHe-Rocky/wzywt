"""Generate two public-copy Mandarin neural narration auditions in this folder."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
import subprocess
import sys
import wave

HERE = Path(__file__).resolve().parent
V2 = HERE.parent
sys.path.insert(0, str(V2 / '.deps'))
sys.path.insert(0, str(V2.parent / '.deps'))

import edge_tts
import imageio_ffmpeg

COPY = '今晚，人齐了。平时一起上分，这次，做一回对手。王者演武堂。和朋友，好好打一场。'
AUDITIONS = [
    ('yunxi-conversational', 'zh-CN-YunxiNeural', '-2%', '+0Hz'),
    ('yunyang-composed', 'zh-CN-YunyangNeural', '-3%', '+0Hz'),
]
PHRASES = [
    ('01-tonight', '今晚，人齐了。'),
    ('02-usual-teammates', '平时一起上分，'),
    ('03-tonight-rivals', '这次，做一回对手。'),
    ('04-brand', '王者演武堂。'),
    ('05-with-friends', '和朋友，好好打一场。'),
]


async def main() -> None:
    report = {'text': COPY, 'engine': 'edge-tts', 'clips': []}
    jobs = [(slug, 'zh-CN-YunxiNeural', '-2%', '+0Hz', phrase) for slug, phrase in PHRASES]
    jobs += [(slug, voice, rate, pitch, COPY) for slug, voice, rate, pitch in AUDITIONS]
    for slug, voice, rate, pitch, text in jobs:
        mp3 = HERE / f'{slug}.mp3'
        wav = HERE / f'{slug}.wav'
        print(f'Generating {voice}', flush=True)
        stream = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
        await asyncio.wait_for(stream.save(str(mp3)), timeout=65)
        subprocess.run([
            imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-hide_banner', '-loglevel', 'error',
            '-i', str(mp3), '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', str(wav)
        ], check=True)
        with wave.open(str(wav), 'rb') as source:
            duration = source.getnframes() / source.getframerate()
        clip = {
            'slug': slug, 'voice': voice, 'rate': rate, 'pitch': pitch, 'text': text,
            'mp3': str(mp3), 'wav': str(wav),
            'duration_seconds': round(duration, 3), 'mp3_bytes': mp3.stat().st_size
        }
        report['clips'].append(clip)
        (HERE / 'auditions.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps(clip, ensure_ascii=False), flush=True)
    (HERE / 'auditions.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')


if __name__ == '__main__':
    asyncio.run(main())
