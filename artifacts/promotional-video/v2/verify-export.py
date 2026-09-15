"""Decode all media, inspect timeline/levels, and extract frames for visual review."""
from pathlib import Path
import subprocess, json, re
ROOT=Path(__file__).resolve().parent
FF=ROOT.parent/'.deps/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
VIDEO=ROOT/'yanwu-trailer-v2-preview-1080p.mp4'
def run(args):
    p=subprocess.run([str(FF),'-hide_banner',*map(str,args)],capture_output=True,text=True,encoding='utf-8',errors='replace')
    if p.returncode:raise RuntimeError(p.stderr)
    return p.stderr
decode=run(['-v','error','-i',VIDEO,'-f','null','-'])
assert not decode.strip(),decode
info=run(['-i',VIDEO,'-t','0.01','-f','null','-'])
assert '1920x1080' in info and '30 fps' in info and 'Audio: aac' in info,info
assert '00:00:22.00' in info,info
levels=run(['-i',VIDEO,'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-'])
stats=json.loads(levels[levels.rfind('{'):levels.rfind('}')+1])
assert float(stats['input_tp'])<0,stats
assert -18<float(stats['input_i'])<-14,stats
times=[.7,2.7,5.8,8.8,11.5,14.5,19.1]
for t in times:run(['-y','-ss',t,'-i',VIDEO,'-frames:v','1','-update','1',ROOT/'qa'/f'export-{t}.png'])
blacks=run(['-i',VIDEO,'-vf','crop=1920:816:0:132,blackdetect=d=0.12:pix_th=0.05','-an','-f','null','-'])
black_intervals=re.findall(r'black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)',blacks)
for start,end,duration in black_intervals:
    assert float(end)<.85 or float(start)>21.1,black_intervals
result={'file':str(VIDEO),'bytes':VIDEO.stat().st_size,'video':'H264 1920x1080 30fps','audio':'AAC stereo 48kHz','duration_seconds':22,'full_decode':'pass','loudness':stats,'black_intervals':black_intervals,'review_frames':times,'limitations':'Visual/art/voice acting quality requires human playback review. Static source artwork is animated; no generated character-performance footage is claimed.'}
(ROOT/'qa/verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
