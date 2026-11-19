import { saveScreen } from './productionCareerBrowser.mjs';

export async function runIntake(page, dir, {workType='풀타임', resume,portfolio}={}) {
  await page.waitForFunction(()=>document.body.innerText.length>55 && !document.body.innerText.includes('들어오고 있습니다'));
  for(let step=0; step<12; step++){
    const screen = await saveScreen(page, dir, 'intake-'+step);
    const buttons = page.getByRole('button');
    const next = buttons.filter({hasText:/^다음$/}).first();
    if(await page.getByRole('button',{name:'Harper 시작하기',exact:true}).count()){
      await page.getByRole('button',{name:'Harper 시작하기',exact:true}).click();
      await page.getByRole('heading',{name:'어떤 기회를 알아보고 있나요?'}).waitFor();
    }else if(await page.getByRole('heading',{name:'어떤 기회를 알아보고 있나요?'}).count()){
      await page.getByRole('button',{name:new RegExp('^'+workType)}).click();
      await next.click();
      await page.getByRole('heading',{name:'어떤 기회를 알아보고 있나요?'}).waitFor({state:'hidden'});
    }else if(await page.getByRole('heading',{name:'회사에 프로필을 언제 공유할까요?'}).count()){
      await page.getByRole('button',{name:/^내가 먼저 확인해요/}).click();
      await next.click();
      await page.getByRole('heading',{name:'회사에 프로필을 언제 공유할까요?'}).waitFor({state:'hidden'});
    }else if(await page.getByRole('heading',{name:'Harper가 먼저 이해할게요.'}).count()){
      if(portfolio){
        await page.getByRole('button',{name:'개인 사이트'}).click();
        await page.getByRole('textbox').last().fill(portfolio);
        await saveScreen(page,dir,'portfolio-entered');
      }
      if(resume){
        await page.getByRole('button',{name:/CV\/이력서/}).click();
        await page.locator('input[type=file]').setInputFiles(resume);
        await page.waitForTimeout(1400);
      }
      await next.click();
      const moved = await page.getByRole('heading',{name:'Harper가 먼저 이해할게요.'}).waitFor({state:'hidden',timeout:4500}).then(()=>true,()=>false);
      if(!moved) return await saveScreen(page,dir,'material-gate');
    }else if(await page.getByRole('heading',{name:'Harper에게 이런 걸 요청할 수 있어요.'}).count()){
      await next.click();
      await page.getByRole('heading',{name:'Harper에게 이런 걸 요청할 수 있어요.'}).waitFor({state:'hidden'});
    }else{
      return screen;
    }
    await page.waitForTimeout(800);
  }
  throw Error('Intake did not settle');
}
