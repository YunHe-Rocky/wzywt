"""Mix the verified neural speech and licensed score, then insert real UI motion."""
from pathlib import Path
import subprocess, json, wave
import numpy as np

ROOT=Path(__file__).resolve().parent
FFMPEG=ROOT.parent/'.deps/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe'
SR=48000
DURATION=22
def run(args,**kw):
    return subprocess.run([str(FFMPEG),'-hide_banner','-loglevel','warning',*map(str,args)],check=True,**kw)
def read_audio(p):
    raw=run(['-i',p,'-f','f32le','-ar',SR,'-ac','2','pipe:1'],stdout=subprocess.PIPE).stdout
    return np.frombuffer(raw,dtype='<f4').reshape(-1,2).copy()
def save_audio(p,a):
    with wave.open(str(p),'wb') as w:
        w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR)
        w.writeframes((np.clip(a,-.999,.999)*32767).astype('<i2').tobytes())

n=SR*DURATION
music=read_audio(ROOT/'music-probe/legionnaire-12to34-raw.wav')[:n]
if len(music)<n:raise RuntimeError('Music excerpt is incomplete')
voice=np.zeros((n,2),dtype=np.float32)
duck=np.ones(n,dtype=np.float32)
clips=[('01-tonight',.85,1.86),('02-usual-teammates',4.78,1.42),('03-tonight-rivals',7.88,1.94),('04-brand',16.12,1.45),('05-with-friends',18.64,1.80)]
metadata=[]
for slug,start,end in clips:
    a=read_audio(ROOT/'audio-probe'/f'{slug}.wav')[int(.12*SR):int(end*SR)]
    peak=float(np.max(np.abs(a)));a*=.63/max(peak,.001)
    # Very short edge fades remove edit clicks without changing consonants.
    env=np.ones(len(a));q=int(.012*SR);env[:q]=np.linspace(0,1,q);env[-q:]=np.linspace(1,0,q);a*=env[:,None]
    s=int(start*SR);e=s+len(a);voice[s:e]+=a
    ds=max(0,s-int(.12*SR));de=min(n,e+int(.30*SR))
    duck[ds:s]=np.minimum(duck[ds:s],np.linspace(1,.36,s-ds))
    duck[s:e]=np.minimum(duck[s:e],.36)
    duck[e:de]=np.minimum(duck[e:de],np.linspace(.36,1,de-e))
    metadata.append({'text_clip':slug,'start':start,'end':e/SR})
rms=float(np.sqrt(np.mean(music**2)));music*=min(3,.16/max(rms,.001))
music*=duck[:,None]
music[:int(.65*SR)]*=np.linspace(0,1,int(.65*SR))[:,None]
music[int(20.35*SR):]*=np.linspace(1,0,n-int(20.35*SR))[:,None]
mix=voice+music
peak=float(np.max(np.abs(mix)))
if peak>.93:mix*=.93/peak
save_audio(ROOT/'soundtrack-mix.wav',mix)
(ROOT/'mix-timing.json').write_text(json.dumps({'duration':DURATION,'voice':metadata,'source':'Legionnaire, original seconds 12–34','mix_peak_dbfs':20*np.log10(float(np.max(np.abs(mix))))},ensure_ascii=False,indent=2),encoding='utf-8')

# Actual page content is enlarged as an editorial close-up; its internal UI is not altered.
graph=(
 '[1:v]trim=start=2.5:duration=4.95,setpts=PTS-STARTPTS,'
 'crop=1600:900:160:110,scale=1920:1080,crop=1920:816:0:80,'
 'setsar=1,format=yuv420p,fade=t=in:st=0:d=0.12,fade=t=out:st=4.81:d=0.14,'
 'setpts=PTS+10.7/TB[ui];'
 '[0:v][ui]overlay=x=0:y=132:enable=\'gte(t,10.7)*lt(t,15.65)\':eof_action=pass[v];'
 '[2:a]loudnorm=I=-16:TP=-1.5:LRA=9,aresample=48000[a]'
)
run(['-y','-i',ROOT/'visuals.mp4','-i',ROOT/'motion-probe/hero-ui-motion.mp4','-i',ROOT/'soundtrack-mix.wav',
     '-filter_complex',graph,'-map','[v]','-map','[a]','-t',DURATION,
     '-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p',
     '-c:a','aac','-b:a','256k','-movflags','+faststart',ROOT/'yanwu-trailer-v2-preview-1080p.mp4'])
print('Exported 22-second voiced trailer sample.')
