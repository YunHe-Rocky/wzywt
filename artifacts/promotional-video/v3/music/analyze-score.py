"""Measure score energy for editorial planning; does not assert listening QA."""
import array
import json
import math
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent
FFMPEG = ROOT.parents[1] / '.deps' / 'imageio_ffmpeg' / 'binaries' / 'ffmpeg-win-x86_64-v7.1.exe'
SOURCE = ROOT / 'legionnaire2022-full.mp3'
command = [str(FFMPEG), '-v', 'error', '-xerror', '-i', str(SOURCE),
           '-f', 'f32le', '-ac', '1', '-ar', '4000', 'pipe:1']
result = subprocess.run(command, capture_output=True, check=True)
samples = array.array('f')
samples.frombytes(result.stdout)
duration = len(samples) / 4000
blocks = []
for start in range(0, math.ceil(duration), 5):
    block = samples[start * 4000:(start + 5) * 4000]
    if not block:
        continue
    rms = math.sqrt(sum(x * x for x in block) / len(block))
    peak = max(abs(x) for x in block)
    blocks.append({'source_start_s': start, 'source_end_s': min(start + 5, round(duration, 6)),
                   'rms_dbfs': round(20 * math.log10(max(rms, 1e-12)), 2),
                   'peak_dbfs': round(20 * math.log10(max(peak, 1e-12)), 2)})
one_second = []
for start in range(math.floor(duration)):
    block = samples[start * 4000:(start + 1) * 4000]
    rms = math.sqrt(sum(x * x for x in block) / len(block))
    one_second.append(round(20 * math.log10(max(rms, 1e-12)), 2))
report = {'source': SOURCE.name, 'decoded_duration_s': duration,
          'decode_errors': result.stderr.decode('utf-8', errors='replace'),
          'measurement': '4 kHz mono downmix RMS/peak; editorial indicators, not mastering true peak',
          'five_second_energy': blocks, 'one_second_rms_dbfs': one_second}
(ROOT / 'energy-analysis.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
