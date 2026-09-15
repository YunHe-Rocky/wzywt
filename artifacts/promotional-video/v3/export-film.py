"""Composite real browser footage onto the 180-second animated picture edit."""
from pathlib import Path
import subprocess,json

ROOT=Path(__file__).resolve().parent
FF=ROOT.parent/'.deps/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
OUTPUT=ROOT/'yanwu-arena-3min-1080p.mp4'
def run(args):
    p=subprocess.run([str(FF),'-hide_banner','-loglevel','warning',*map(str,args)],capture_output=True,text=True,encoding='utf-8',errors='replace')
    if p.returncode:raise RuntimeError(p.stderr)
    return p.stderr

parts=ROOT/'rendered'
for i in range(3):
    if not (parts/f'part-{i}.mp4').exists():raise RuntimeError(f'Missing rendered part {i}')
concat=parts/'concat.ffconcat'
concat.write_text('\n'.join(f"file 'part-{i}.mp4'" for i in range(3))+'\n',encoding='utf-8')
run(['-y','-f','concat','-safe','0','-i',concat,'-c','copy',ROOT/'picture-master.mp4'])

# Browser images are editorially cropped or scaled, never repainted or populated with fake data.
# A is an already-cropped homepage focus derivative. Hero/equipment use an editorial zoom.
sources=['A-home-focus.mp4','B-hero-role-and-search.mp4','B2-zhaoyun-stats-and-skills.mp4','C-equipment-filter-and-passives.mp4','D-mobile-home.mp4']
args=['-y','-i',ROOT/'picture-master.mp4']
for f in sources:args+=['-i',ROOT/'captures'/f]
args+=['-i',ROOT/'soundtrack.wav']
filters=[]
specs=[
 {'i':1,'sourceStart':0,'sourceDuration':18,'start':28,'duration':18,'crop':'scale=1464:824,pad=1920:824:228:0:color=0x07111d','x':0,'y':128},
 {'i':2,'sourceStart':0,'sourceDuration':18,'start':92,'duration':12,'crop':'crop=1660:1000:130:50,scale=1920:1156,crop=1920:824:0:55','x':0,'y':128},
 {'i':3,'sourceStart':0,'sourceDuration':12,'start':104,'duration':9,'crop':'scale=1920:1080,crop=1920:824:0:70','x':0,'y':128},
 {'i':4,'sourceStart':0,'sourceDuration':18,'start':113,'duration':12,'crop':'crop=1700:1000:110:70,scale=1920:1128,crop=1920:824:0:60','x':0,'y':128},
]
for j,s in enumerate(specs):
    ratio=s['duration']/s['sourceDuration']
    filters.append(f"[{s['i']}:v]trim=start={s['sourceStart']}:duration={s['sourceDuration']},setpts=(PTS-STARTPTS)*{ratio},{s['crop']},setsar=1,format=yuv420p,fade=t=in:st=0:d=0.16,fade=t=out:st={s['duration']-.16}:d=0.16,setpts=PTS+{s['start']}/TB[u{j}]")
filters.append('[5:v]split=2[phone1][phone2]')
for j,(name,ss,span,ts,dur) in enumerate([('phone1',0,2.5,149,2.5),('phone2',9.4,2.5,151.5,3.5)],4):
    filters.append(f'[{name}]trim=start={ss}:duration={span},setpts=(PTS-STARTPTS)*{dur/span},scale=436:776,setsar=1,format=yuv420p,setpts=PTS+{ts}/TB[u{j}]')
    specs.append({'i':5,'sourceStart':ss,'sourceDuration':span,'start':ts,'duration':dur,'x':1287,'y':156})
previous='0:v'
for j,s in enumerate(specs):
    out=f'v{j}';filters.append(f"[{previous}][u{j}]overlay=x={s['x']}:y={s['y']}:enable='gte(t,{s['start']})*lt(t,{s['start']+s['duration']})':eof_action=pass:repeatlast=0[{out}]");previous=out
filters.append(f'[{previous}]format=yuv420p[v]')
args+=['-filter_complex',';'.join(filters),'-map','[v]','-map','6:a','-t','180','-c:v','libx264','-preset','fast','-crf','19','-threads','6','-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:a','aac','-b:a','256k','-ar','48000','-movflags','+faststart',OUTPUT]
run(args)
(ROOT/'ui-edit-timing.json').write_text(json.dumps(specs,indent=2),encoding='utf-8')
print(f'Exported {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)')
