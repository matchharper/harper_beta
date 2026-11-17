import { createClient } from '@supabase/supabase-js';
import { writeFileSync,existsSync } from 'node:fs';
import path from 'node:path';
import { prepareProfile,preparePracticeRole,root } from './productionCareerProfiles.mjs';
import { openCareer,saveScreen } from './productionCareerBrowser.mjs';

const run = process.argv[2];
if(!run || !/^[a-z0-9-]+$/.test(run)) throw Error('Supply a new or previously used cohort name');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const people=[
  {name:'선아',action:'open'},
  {name:'준호',action:'interview'},
  {name:'소라',feedback:'아무 결과도 없었고 도움을 못 받았어요.'},
  {name:'윤지',feedback:'매일 왕복 세 시간인 걸 미리 알아서 지원하지 않기로 했어요. 이게 도움이 됐어요.'},
];
const report=[];
const checked=r=>{if(r.error)throw Error(r.error.message);return r.data;};
for(const [index,person] of people.entries()){
  const {account,dir}=await prepareProfile('40',run+'-'+index,{name:person.name,onboarded:true,
    history:[{role:'user',content:'요즘 다른 일을 알아보는데 도움을 받고 싶어요.'}],
    interview:person.action==='interview'?{title:'테스트 팀 첫 면접',content:'면접 초대에 응한 후보자'}:undefined});
  const label=person.action==='open'?await preparePracticeRole(account,'7feac347-90f5-44a0-bd26-67e795a681a2'):null;
  const {page,context}=await openCareer(dir);
  try{
    if(label){
      await page.getByRole('tab',{name:/^기회/}).click();
      const saved=page.getByRole('tab',{name:/저장함/});await saved.click();
      await page.getByText(label,{exact:true}).first().click();
      const source=page.getByRole('button',{name:'원문 보기'});
      await source.waitFor({timeout:12000});
      if(!existsSync(path.join(dir,'link-opened.json'))){
        const opened=context.waitForEvent('page',{timeout:7000}).catch(()=>null);
        await source.click();const original=await opened;
        if(original){await original.waitForLoadState('domcontentloaded',{timeout:9000}).catch(()=>{});if(new URL(original.url()).protocol==='https:')writeFileSync(path.join(dir,'link-opened.json'),JSON.stringify({source:original.url(),title:await original.title()}),{mode:0o600});}
      }
    }else if(person.feedback){
      // Ask for the opinion by ordinary chat only when there is no prior copy.
      const prior=checked(await db.from('talent_messages').select('id').eq('user_id',account.userId).eq('role','user').eq('content',person.feedback));
      if(!prior.length){
        const editor=page.locator('textarea:visible').first();await editor.fill(person.feedback);
        await page.getByRole('button',{name:'메시지 보내기'}).click();
        await page.getByText(person.feedback,{exact:true}).first().waitFor();
        const until=Date.now()+30000;
        let persisted=false;
        while(!persisted && Date.now()<until){
          persisted=checked(await db.from('talent_messages').select('id').eq('user_id',account.userId).eq('role','user').eq('content',person.feedback)).length>0;
          if(!persisted)await new Promise(resolve=>setTimeout(resolve,500));
        }
        if(!persisted)throw Error('Feedback was visible but not persisted. Reopen this account before recording the result.');
      }
    }
    await saveScreen(page,dir,'cohort-screen');
  }finally{await context.close();}
  const messages=checked(await db.from('talent_messages').select('id,content,created_at').eq('user_id',account.userId).eq('role','user').order('id'));
  const meetings=checked(await db.from('meeting_schedules').select('id,status,title,confirmed_start_at').eq('talent_id',account.userId).eq('status','confirmed'));
  const clicks=checked(await db.from('talent_opportunity_recommendation').select('id,clicked_at,viewed_at').eq('talent_id',account.userId));
  report.push({person:person.name,helpRequest:messages[0],feedback:messages.slice(1),meetings,clicks,sourceOpenedInUi:existsSync(path.join(dir,'link-opened.json'))});
  writeFileSync(path.join(root,run+'-0','40','cohort-evidence.json'),JSON.stringify(report,null,2),{mode:0o600});
  console.log(person.name,{help:!!messages[0],laterUserMessages:messages.length-1,meetings:meetings.length,sourceOpenedInUi:report.at(-1).sourceOpenedInUi});
}
