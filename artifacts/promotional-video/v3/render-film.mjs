import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url)),ff=path.resolve(dir,'../.deps/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
const narration=JSON.parse(await fs.readFile(path.join(dir,'voice-timing.json'),'utf8'));
if(!Array.isArray(narration)||narration.length!==17)throw Error('Missing 17 narration cues');
await fs.mkdir(path.join(dir,'qa'),{recursive:true});await fs.mkdir(path.join(dir,'rendered'),{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files','--hide-scrollbars']});
async function pageReady(){let p=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});await p.goto(pathToFileURL(path.join(dir,'film.html')).href);await p.evaluate(()=>window.ready);await p.evaluate(v=>window.NARRATION=v,narration);return p}
try {
 const p=await pageReady();const shots=await p.evaluate(()=>window.SHOTS);if(shots[0].a!==0||shots.at(-1).b!==180||shots.some((s,i)=>i&&s.a!==shots[i-1].b))throw Error('Timeline gaps');
 await fs.writeFile(path.join(dir,'shot-timeline.json'),JSON.stringify(shots,null,2));
 for(let t of [3,12,18,24,49,55,63,74,81,88,127,136,150,158,169,176]){await p.evaluate(t=>window.render(t),t);await p.screenshot({path:path.join(dir,'qa',`draft-${t}.png`)});}
 await p.close();console.log(`QA stills ready; ${shots.length} shots span 180 seconds`);
 if(!process.argv.includes('--stills')){
  async function part(index){const pg=await pageReady();const output=path.join(dir,'rendered',`part-${index}.mp4`);const proc=spawn(ff,['-y','-hide_banner','-loglevel','error','-f','image2pipe','-framerate','30','-c:v','mjpeg','-i','pipe:0','-vf','scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p','-an','-c:v','libx264','-preset','fast','-crf','19','-threads','2','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-movflags','+faststart',output],{stdio:['pipe','ignore','pipe'],windowsHide:true});let err='';proc.stderr.on('data',d=>err+=d);let ended=once(proc,'close');
   for(let frame=0;frame<1800;frame++){let data=await pg.evaluate(t=>{window.render(t);return document.getElementById('film').toDataURL('image/jpeg',.92)},index*60+frame/30);if(!proc.stdin.write(Buffer.from(data.slice(data.indexOf(',')+1),'base64')))await once(proc.stdin,'drain');if(frame%300===0)console.log(`Part ${index+1}/3: ${frame}/1800 frames`)}
   proc.stdin.end();let [code]=await ended;await pg.close();if(code)throw Error(err);console.log(`Part ${index+1} done`);
  }
  await Promise.all([0,1,2].map(part));console.log('All 5400 frames rendered');
 }
}finally{await browser.close()}
