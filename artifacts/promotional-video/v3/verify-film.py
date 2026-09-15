from pathlib import Path
import subprocess,re,json
ROOT=Path(__file__).resolve().parent
FF=ROOT.parent/'.deps/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
VIDEO=ROOT/'yanwu-arena-3min-1080p.mp4'
def run(args):
    p=subprocess.run([str(FF),'-hide_banner',*map(str,args)],capture_output=True,text=True,encoding='utf-8',errors='replace')
    if p.returncode:raise RuntimeError(p.stderr)
    return p.stderr

assert VIDEO.exists(),str(VIDEO)
errors=run(['-v','error','-i',VIDEO,'-f','null','-'])
assert not errors.strip(),errors
info=run(['-i',VIDEO,'-t','0.01','-f','null','-'])
for s in ['00:03:00.00','1920x1080','30 fps','Audio: aac','48000 Hz','stereo','yuv420p(tv, bt709']:
    assert s in info,(s,info)
audio=run(['-i',VIDEO,'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-'])
levels=json.loads(audio[audio.rfind('{'):audio.rfind('}')+1])
assert -18<float(levels['input_i'])<-14,levels
assert float(levels['input_tp'])<-.8,levels
detect=run(['-i',VIDEO,'-vf','crop=1920:824:0:128,blackdetect=d=0.35:pix_th=0.035','-an','-f','null','-'])
blacks=re.findall(r'black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)',detect)
for a,b,d in blacks:assert float(b)<1.5 or float(a)>178.6,blacks
times=[3,12,18,24,30,37,44,49,55,63,70,75,81,88,95,101,107,111,115,122,127,136,150,153,158,169,176,178]
for t in times:
    run(['-y','-ss',t,'-i',VIDEO,'-frames:v','1','-update','1',ROOT/'qa'/f'final-{t}.png'])
    if t in [30,63,107,153,178]:print(f'Extracted QA through second {t}',flush=True)
result={'file':str(VIDEO),'duration_seconds':180,'resolution':[1920,1080],'fps':30,'video':'H264 limited-range Rec709','audio':'AAC LC stereo48k','bytes':VIDEO.stat().st_size,'decode':'passed','loudness':levels,'black_intervals':blacks,'visual_review_times':times,'source_labels':['AI宣传美术','理念示意动画','网站实录'],'not_claimed':'Character action video generation or human audition of voice acting'}
(ROOT/'qa/final-verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
