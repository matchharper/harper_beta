import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { prepareProfile,portfolioLink } from './productionCareerProfiles.mjs';
import { openCareer,saveScreen,makePdf,signInOnScreen } from './productionCareerBrowser.mjs';
import { runIntake } from './productionCareerIntake.mjs';
import { cases } from './productionCareerCases.mjs';
const [mode,run,...ids]=process.argv.slice(2);
if(!['prepare','inspect','observe','act'].includes(mode)||!run||!ids.length||ids.some(id=>!cases[id])) throw Error('Use prepare | inspect | observe | act, a run label, and case IDs 01–40.');
export async function runCase(id) {
  const variant=process.env.CAREER_QA_PERSONA;
  if(variant && !['second','privateOnly'].includes(variant)) throw Error('Unknown persona variant');
  const s=variant ? cases[id][variant] : cases[id];
  if(!s) throw Error('No such variant for this case');
  const prepared=await prepareProfile(id,run,{name:s.name,locale:s.locale,onboarded:!s.intake,profile:!s.intake && s.bio?{bio:s.bio}:{},history:s.history,docs:s.docs,cards:s.cards,interview:s.interview});
  if(mode==='prepare') return console.log(id,'profile ready');
  const {dir}=prepared;
  const {context,page}=await openCareer(dir,mode==='observe'?'/career':s.entry??'/career',s.locale==='en'?'en-US':'ko-KR');
  try {
    if(s.entry && mode!=='observe'){
      const entry=await saveScreen(page,dir,'job-entry');
      const talk=page.getByRole('button',{name:/Talk to Harper|Harper와.*대화|Harper에게|하퍼와/i}).or(page.getByRole('link',{name:/Talk to Harper|Harper와.*대화|Harper에게|하퍼와/i})).first();
      if(mode==='act' && await talk.count()) {
        await talk.click();
        await page.waitForURL(u=>u.pathname.startsWith('/career'));
        if(new URL(page.url()).pathname==='/career_login') await signInOnScreen(page,dir);
      }
      else { console.log(id,entry.tree.slice(-700));return; }
    }
    if(mode==='observe'){
      await page.getByRole('button',{name:/메시지 보내기|Send message|기회 더 찾아줘|Find more opportunities/i}).first().waitFor({timeout:20000}).catch(()=>{});
      await page.waitForFunction(()=>document.querySelector('[data-career-message-role=assistant]')?.innerText.trim(),null,{timeout:5500}).catch(()=>{});
      await saveScreen(page,dir,'observed-final');
      console.log(id,'observed the current screen');
      return;
    }
    if(s.intake && mode==='act'){
      const resume=s.upload?await makePdf(page,dir,s.upload):undefined;
      const portfolio=s.portfolio ? await portfolioLink(prepared,await makePdf(page,dir,s.portfolio)) : undefined;
      const screen=await runIntake(page,dir,{resume,portfolio});
      console.log(id,'intake',screen.tree.slice(0,1500));return;
    }
    await page.waitForFunction(()=>document.body.innerText.length>55 && !/들어오고 있습니다|Loading Career Page/.test(document.body.innerText),null,{timeout:36000}).catch(()=>{});
    await page.waitForTimeout(1200);
    const before=await saveScreen(page,dir,'workspace');
    if(mode==='inspect') { console.log(id,'workspace',before.tree.slice(0,1150));return; }
    if(!s.turns?.length) {
      const next=s.cohort?'use productionCareerCohort.mjs':s.voice?'use productionCareerInterview.mjs':s.scheduled?'use productionCareerSchedules.mjs':(s.needs??[]).join(', ');
      throw Error('Only the workspace was opened. To run this case: '+next);
    }
    const editor=page.locator('textarea:visible,[contenteditable=true]:visible').first();
    await page.waitForFunction(()=>{const el=document.querySelector('textarea');return el&&!el.disabled;},null,{timeout:18000}).catch(()=>{});
    if(!await editor.count() || !await editor.isEnabled()) { console.log(id,'no chat',before.tree.slice(0,480));return; }
    if(s.uploads?.length && !existsSync(path.join(dir,'attached.json'))){
      for(const doc of s.uploads){
        const file=await makePdf(page,dir,doc);
        await page.getByRole('button',{name:'추가 메뉴 열기'}).click();
        const picker=page.waitForEvent('filechooser');
        await page.getByRole('menuitem',{name:/파일 업로드/}).click();
        await (await picker).setFiles(file);
        await page.getByText(doc.title,{exact:false}).first().waitFor({timeout:35000});
        await page.waitForTimeout(600);
      }
      await saveScreen(page,dir,'attached-offers');
      writeFileSync(path.join(dir,'attached.json'),JSON.stringify(s.uploads.map(doc=>doc.title)),{mode:0o600});
    }
    for(const [index,message] of s.turns.entries()){
      const submitted=path.join(dir,'submitted-'+index+'.json');
      if(existsSync(submitted)) { console.log(id,'previously submitted',index);continue; }
      const replies=page.locator('[data-career-message-role=assistant]');
      const initial=await replies.count();
      await editor.fill(message);
      const send=page.getByRole('button',{name:/메시지 보내기|Send message/i}).first();
      await send.click();
      writeFileSync(submitted,JSON.stringify({message,at:new Date().toISOString()}),{mode:0o600});
      await page.waitForFunction(n=>document.querySelectorAll('[data-career-message-role=assistant]').length>n && (Array.from(document.querySelectorAll('[data-career-message-role=assistant]')).at(-1)?.innerText.trim().length??0)>0,initial,{timeout:130000}).catch(()=>{});
      await page.waitForTimeout(900);
      const stop=page.getByRole('button',{name:/중단|멈추기|^stop$|stop generating/i}).first();
      if(await stop.isVisible()) await stop.waitFor({state:'hidden',timeout:120000}).catch(()=>{});
      const after=await saveScreen(page,dir,'reply-'+index);
      const last=await replies.last().innerText().catch(()=>'');
      console.log(id,'reply',index,last.slice(0,190),after.url);
      if(await replies.count()<=initial) break;
    }
  } finally {await context.close();}
}
let i=0;
await Promise.all(Array.from({length:Math.min(2,ids.length)},async()=>{while(i<ids.length){const id=ids[i++];try{await runCase(id);}catch(e){console.error(id,'failed:',e.message.split('\n')[0]);process.exitCode=1;}}}));
