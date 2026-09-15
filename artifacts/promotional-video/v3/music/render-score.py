"""Create full 48 kHz master and a pitch-preserving 180-second edit."""
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent
FFMPEG = ROOT.parents[1] / '.deps' / 'imageio_ffmpeg' / 'binaries' / 'ffmpeg-win-x86_64-v7.1.exe'
SOURCE = ROOT / 'legionnaire2022-full.mp3'
report = json.loads((ROOT / 'energy-analysis.json').read_text(encoding='utf-8'))
duration = report['decoded_duration_s']
assert 180 <= duration < 190, duration
tempo = duration / 180.0

def run(name, filters=None):
    command = [str(FFMPEG), '-hide_banner', '-y', '-xerror', '-i', str(SOURCE)]
    if filters:
        command += ['-af', filters]
    command += ['-ac', '2', '-ar', '48000', '-c:a', 'pcm_s24le', str(ROOT / name)]
    subprocess.run(command, check=True)

run('legionnaire-full-48k.wav')
run('legionnaire-180s-48k.wav',
    f'atempo={tempo:.12f},apad=whole_dur=180,atrim=duration=180')
print(json.dumps({'source_duration': duration, 'tempo_factor_180s': tempo,
                  'full_master': 'legionnaire-full-48k.wav',
                  'three_minute_edit': 'legionnaire-180s-48k.wav',
                  'mix_processing': 'None; no fades, no ducking, no gain adjustment.'}, indent=2))
