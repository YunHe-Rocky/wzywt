import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const ffmpeg=path.resolve(dir,'../.deps/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe');
const onlyStills=process.argv.includes('--stills');
await fs.mkdir(path.join(dir,'qa'),{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files','--hide-scrollbars']});
try {
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 await page.goto(pathToFileURL(path.join(dir,'trailer.html')).href);
 await page.evaluate(()=>window.ready);
 for(const t of [2.7,5.8,8.8,18.6]){await page.evaluate(t=>window.render(t),t);await page.screenshot({path:path.join(dir,'qa',`shot-${t}.png`)});}
 if(onlyStills){console.log('Four composition frames rendered');}
 else {
  const proc=spawn(ffmpeg,['-y','-hide_banner','-loglevel','warning','-f','image2pipe','-framerate','30','-c:v','mjpeg','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',path.join(dir,'visuals.mp4')],{stdio:['pipe','ignore','pipe'],windowsHide:true});
  let errors='';proc.stderr.on('data',d=>errors+=d);const ended=once(proc,'close');
  for(let frame=0;frame<660;frame++){
   const url=await page.evaluate(t=>{window.render(t);return document.getElementById('film').toDataURL('image/jpeg',.94)},frame/30);
   const buf=Buffer.from(url.slice(url.indexOf(',')+1),'base64');
   if(!proc.stdin.write(buf))await once(proc.stdin,'drain');
   if(frame%90===0)console.log(`Rendered ${frame}/660 frames`);
  }
  proc.stdin.end();const [code]=await ended;if(code!==0)throw new Error(errors);console.log('22-second picture edit complete');
 }
} finally {await browser.close();}
