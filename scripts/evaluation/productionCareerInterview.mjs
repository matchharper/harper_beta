import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { saveScreen,signInOnScreen } from './productionCareerBrowser.mjs';
import { prepareProfile,preparePracticeRole } from './productionCareerProfiles.mjs';
import { cases } from './productionCareerCases.mjs';

// Only the candidate's audio is synthesized. The deployed Harper voice session generates the questions.
const run=process.argv[2];
const s=cases['28'];
const {dir,account}=await prepareProfile('28',run,{name:s.name,onboarded:true,profile:{bio:s.bio},docs:s.docs});
const roleName=await preparePracticeRole(account,s.practiceRole);
if(existsSync(path.join(dir,'interview-started.json'))) throw Error('This account already started an interview. Inspect its transcript before starting another.');
const input=path.join(dir,'candidate.aiff'),audio=path.join(dir,'candidate.wav');
for(const [bin,args] of [
  ['say',['-v','Yuna','-o',input,'팀에서 반품 프로세스를 개선했습니다.']],
  ['ffmpeg',['-nostdin','-loglevel','error','-y','-i',input,'-af','adelay=18000:all=1,apad=pad_dur=120','-ar','48000','-ac','2',audio]]
]){const r=spawnSync(bin,args);if(r.status!==0)throw Error(bin+' could not prepare the synthetic microphone');}
const context=await chromium.launchPersistentContext(path.join(dir,'browser'),{channel:'chrome',headless:true,locale:'ko-KR',viewport:{width:1440,height:1000},args:['--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+audio+'%noloop']});
try{
 const origin='https://matchharper.com';await context.grantPermissions(['microphone'],{origin});
 const page=context.pages()[0]??await context.newPage();await page.goto(origin+'/career');
 await page.waitForFunction(()=>location.pathname==='/career_login'||document.querySelector('[role=tablist]'));
 if(new URL(page.url()).pathname==='/career_login')await signInOnScreen(page,dir);
 await page.getByRole('tab',{name:/^기회/}).click();await page.getByRole('tab',{name:/저장함/}).click();
 await page.getByText(roleName,{exact:true}).first().click();
 const button=page.getByRole('button',{name:'모의 면접 해보기'});await button.waitFor({timeout:12000});
 await button.click();
 const consent=page.getByRole('dialog',{name:'모의 인터뷰를 시작할까요?'});
 await consent.getByRole('button',{name:'시작하기',exact:true}).click();
 writeFileSync(path.join(dir,'interview-started.json'),JSON.stringify({at:new Date().toISOString()}),{mode:0o600});
 for(const moment of [0,10,25,45]){
   if(moment)await page.waitForTimeout(moment===10?10000:moment===25?15000:20000);
   const record=await saveScreen(page,dir,'voice-'+moment);
   console.log(moment,record.tree.split('\n').filter(s=>/통화|연결|마이크|전화|면접|종료|음소거|반품/.test(s)).slice(-10).join('\n').slice(-520));
 }
 const end=page.getByRole('button',{name:/통화 종료|통화 끝내기|전화 끊기|End call/}).first();if(await end.isVisible()){await end.click();await saveScreen(page,dir,'voice-ended');}
}finally{await context.close();}
