"""Mix the approved 180-second score and timed Mandarin narration."""
from __future__ import annotations

from array import array
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import wave

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / '.deps'))
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
STARTS = [2.2, 11, 22, 34, 48, 61, 72, 84, 96, 110, 122, 135, 146, 156, 167, 172, 177]
DURATION = 180.0
RATE = 48000
VOICE_LUFS = -18.0
MUSIC_LUFS = -20.0
MASTER_LUFS = -16.0
MASTER_TP = -1.5


def execute(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, check=True, capture_output=True, text=True,
                          encoding='utf-8', errors='replace')


def loudness_report(stderr: str) -> dict:
    reports = re.findall(r'\{\s*"input_i".*?\}', stderr, flags=re.DOTALL)
    if not reports:
        raise RuntimeError('No loudness measurement returned by FFmpeg')
    return json.loads(reports[-1])


def main() -> None:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    manifest = json.loads((HERE / 'voice' / 'manifest.json').read_text(encoding='utf-8'))
    clips = sorted(manifest['clips'], key=lambda clip: clip['number'])
    assert len(clips) == len(STARTS) == 17
    inputs = [FFMPEG, '-y', '-hide_banner', '-nostats', '-filter_complex_threads', '2',
              '-i', str(HERE / 'music' / 'legionnaire-180s-48k.wav')]
    filters = []
    voice_labels = []
    timings = []
    duck_envelopes = []
    for index, (clip, speech_start) in enumerate(zip(clips, STARTS), 1):
        inputs += ['-i', clip['wav']]
        trim_start = max(0.0, clip['audible_start_seconds'] - 0.06)
        trim_end = min(clip['source_duration_seconds'], clip['audible_end_seconds'] + 0.06)
        retained_head = clip['audible_start_seconds'] - trim_start
        timeline_audio_start = speech_start - retained_head
        speech_end = speech_start + clip['audible_span_seconds']
        delay_samples = round(timeline_audio_start * RATE)
        next_start = STARTS[index] if index < len(STARTS) else 180.0
        timings.append({
            'number': clip['number'], 'text': clip['text'],
            'start': speech_start, 'end': round(speech_end, 6),
            'displayEnd': round(min(speech_end + 0.7, next_start - 0.25, 179.5), 6),
        })
        filters.append(
            f'[{index}:a]atrim=start={trim_start:.6f}:end={trim_end:.6f},'
            'asetpts=PTS-STARTPTS,highpass=f=70,lowpass=f=11000,'
            f'loudnorm=I={VOICE_LUFS}:TP=-3:LRA=7,aresample={RATE},'
            'pan=stereo|c0=0.70710678*c0|c1=0.70710678*c0,'
            f'adelay=delays={delay_samples}S:all=1[v{index}]'
        )
        voice_labels.append(f'[v{index}]')
        duck_envelopes.append(
            f'clip((t-{speech_start - .1:.6f})/0.1,0,1)'
            f'*clip(({speech_end + .4:.6f}-t)/0.4,0,1)'
        )
    duck_depth = 1.0 - 10 ** (-9.0 / 20.0)
    envelope = '+'.join(duck_envelopes)
    filters.append(
        '[0:a]atrim=duration=180,asetpts=PTS-STARTPTS,'
        f'loudnorm=I={MUSIC_LUFS}:TP=-3:LRA=11,aresample={RATE},'
        f"volume='1-{duck_depth:.9f}*min(1,{envelope})':eval=frame,"
        'afade=t=in:st=0:d=0.8,afade=t=out:st=177.5:d=2.5[music]'
    )
    filters.append(
        '[music]' + ''.join(voice_labels) +
        ':'.join([f'amix=inputs={len(clips) + 1}', 'duration=first', 'normalize=0']) +
        ',atrim=duration=180,apad=whole_dur=180[premaster]'
    )
    base_graph = ';'.join(filters)
    (HERE / 'voice-timing.json').write_text(
        json.dumps(timings, ensure_ascii=False, indent=2), encoding='utf-8'
    )
    print('Measuring the complete mix for two-pass normalization...', flush=True)
    measure_filter = f'loudnorm=I={MASTER_LUFS}:TP={MASTER_TP}:LRA=11:print_format=json'
    measurement = execute(inputs + [
        '-filter_complex', base_graph + ';[premaster]' + measure_filter + '[master]',
        '-map', '[master]', '-t', '180', '-f', 'null', '-'
    ])
    measured = loudness_report(measurement.stderr)
    print(json.dumps({'premaster': measured}), flush=True)
    master_filter = (
        f'loudnorm=I={MASTER_LUFS}:TP={MASTER_TP}:LRA=11:'
        f'measured_I={measured["input_i"]}:measured_TP={measured["input_tp"]}:'
        f'measured_LRA={measured["input_lra"]}:measured_thresh={measured["input_thresh"]}:'
        f'offset={measured["target_offset"]}:linear=true:print_format=json,'
        f'aresample={RATE}'
    )
    output = HERE / 'soundtrack.wav'
    print('Rendering 180-second 48 kHz stereo PCM master...', flush=True)
    rendered = execute(inputs + [
        '-filter_complex', base_graph + ';[premaster]' + master_filter + '[master]',
        '-map', '[master]', '-t', '180', '-ar', str(RATE), '-ac', '2',
        '-c:a', 'pcm_s16le', str(output)
    ])
    render_report = loudness_report(rendered.stderr)
    print('Measuring final WAV loudness and true peak...', flush=True)
    final_analysis = execute([
        FFMPEG, '-hide_banner', '-nostats', '-i', str(output), '-af',
        f'loudnorm=I={MASTER_LUFS}:TP={MASTER_TP}:LRA=11:print_format=json',
        '-f', 'null', '-'
    ])
    final_report = loudness_report(final_analysis.stderr)
    with wave.open(str(output), 'rb') as wav:
        duration = wav.getnframes() / wav.getframerate()
        sample_rate = wav.getframerate()
        channels = wav.getnchannels()
        width = wav.getsampwidth()
        peak_sample = 0
        clipped_samples = 0
        while block := wav.readframes(48000):
            samples = array('h', block)
            if sys.byteorder != 'little':
                samples.byteswap()
            high = max(samples)
            low = min(samples)
            peak_sample = max(peak_sample, high, -low)
            clipped_samples += sum(sample in (-32768, 32767) for sample in samples)
    integrated = float(final_report['input_i'])
    true_peak = float(final_report['input_tp'])
    qa = {
        'file': str(output), 'duration_seconds': duration, 'sample_rate_hz': sample_rate,
        'channels': channels, 'bits_per_sample': width * 8,
        'integrated_lufs': integrated, 'true_peak_dbtp': true_peak,
        'sample_peak_dbfs': round(20 * math.log10(peak_sample / 32768.0), 4),
        'clipped_sample_count': clipped_samples,
        'voice_count': len(timings), 'duck_depth_db': 9,
        'duck_attack_ms': 100, 'duck_release_ms': 400,
        'music_fade_in_seconds': 0.8, 'music_fade_out_seconds': 2.5,
        'target_lufs': MASTER_LUFS, 'target_true_peak_dbtp': MASTER_TP,
        'premaster_measurement': measured, 'render_measurement': render_report,
        'final_measurement': final_report,
        'human_listening_performed': False,
        'passed': (
            duration == DURATION and sample_rate == RATE and channels == 2 and width == 2
            and abs(integrated - MASTER_LUFS) <= 0.25
            and true_peak <= MASTER_TP and clipped_samples == 0
        ),
    }
    (HERE / 'audio-qa.json').write_text(json.dumps(qa, indent=2), encoding='utf-8')
    print(json.dumps(qa, ensure_ascii=False, indent=2), flush=True)
    if not qa['passed']:
        raise RuntimeError('Final soundtrack did not meet the specified audio measurements')


if __name__ == '__main__':
    main()
