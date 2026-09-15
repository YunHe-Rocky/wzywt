import {chromium} from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--allow-file-access-from-files','--autoplay-policy=no-user-gesture-required']});
try{const page=await browser.newPage();await page.goto(pathToFileURL(path.join(root,'playback.html')).href);await page.waitForFunction(()=>{const v=document.querySelector('video');return v.readyState>=1&&v.duration===180},null,{timeout:15000});
 const results=[];for(const t of [0.5,35,98,120,153,178]){await page.evaluate(t=>{document.querySelector('video').currentTime=t},t);await page.waitForFunction(t=>{const v=document.querySelector('video');return !v.seeking&&Math.abs(v.currentTime-t)<.1&&v.readyState>=2},t,{timeout:15000});results.push(await page.evaluate(()=>{const v=document.querySelector('video');return {time:v.currentTime,width:v.videoWidth,height:v.videoHeight,readyState:v.readyState,error:v.error?.message||null}}));}
 await page.evaluate(async()=>{const v=document.querySelector('video');v.muted=true;v.currentTime=30;await v.play()});await page.waitForTimeout(1000);const advanced=await page.evaluate(()=>document.querySelector('video').currentTime);if(advanced<=30.4)throw Error('Playback did not advance');
 await fs.writeFile(path.join(root,'qa/browser-playback.json'),JSON.stringify({passed:true,duration:180,seekChecks:results,playbackAdvancedTo:advanced},null,2));console.log('Browser metadata, seeking and active playback passed.');
}finally{await browser.close()}
