import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { prepareProfile, preparePracticeRole } from './productionCareerProfiles.mjs';
import { openCareer, saveScreen } from './productionCareerBrowser.mjs';

const [branch, run] = process.argv.slice(2);
const entries = {
  cognition: {number: '35', roleId: 'b32e0d9e-48cb-4272-8308-e610c444dfab'},
  choices: {number: '35', roleId: 'b32e0d9e-48cb-4272-8308-e610c444dfab',
    message: 'Cognition · Forward Deployed Engineer - South Korea에 지원하고 싶어. 어떤 준비를 도와줄 수 있어?'},
  wonderful: {number: '35', message: 'Wonderful FDE에 저를 어떻게 소개할지 먼저 보여주세요.'},
  contact: {number: '25', history: 'Harper 팀의 현장 엔지니어 역할에 관심 있어요. 담당자가 문의할 곳은 daniel@matchharper.com이라고 알려줬어요. 메일은 제가 먼저 보고 싶어요.',
    message: '그분께 보낼 메일 써줘요.'},
};
if (!Object.hasOwn(entries, branch) || !run) throw Error('Use cognition, choices, wonderful or contact and a new run label.');
const entry = entries[branch];
const bio = '서울 ML Engineer. 검색 랭킹 모델의 오프라인 평가 기준을 만들고 추론 파이프라인을 배포했다. FDE 경력 없음.';
const {dir, account} = await prepareProfile(entry.number, run, {
  name: '이지원', onboarded: true, profile: {bio},
  docs: [{title: '이지원 이력서', text: '검색 랭킹 평가 및 추론 파이프라인 배포. Python과 PyTorch.'}],
  history: [{role: 'user', content: entry.history ?? '회사에 보내는 것은 먼저 보고 싶어요.'}],
});
const title = entry.roleId && await preparePracticeRole(account, entry.roleId);
const {context, page} = await openCareer(dir);
try {
  const marker = path.join(dir,'fde-' + branch + '-sent.json');
  await page.getByRole('tab', {name: /^채팅/}).waitFor();
  if (!existsSync(marker)) {
    // If the browser exited after the click, inspect the conversation before replaying.
    const submitted = page.getByRole('article').filter({hasText: entry.message ?? title});
    if (!await submitted.count()) {
      if (entry.message) {
        await page.getByRole('tab',{name:/^채팅/}).click();
        await page.locator('main textarea').last().fill(entry.message);
        await page.getByRole('button',{name:'메시지 보내기'}).click();
      } else {
        await page.getByRole('tab',{name:/^기회/}).click();
        await page.getByRole('tab',{name:/저장함/}).click();
        const job = page.getByRole('button', {name: title + ' · Cognition', exact: true});
        await job.click();
        await page.getByRole('button',{name:'지원하기',exact:true}).last().click();
        await page.getByRole('button',{name:'Harper와 지원하기',exact:true}).click();
      }
    }
    writeFileSync(marker,JSON.stringify({at:new Date().toISOString()}),{mode:0o600});
  }
  await page.getByRole('tab',{name:/^채팅/}).click();
  await page.getByText(/Worked for|작업 시간/).first().waitFor({timeout:240000});
  const stop = page.getByRole('button',{name:'중단',exact:true});
  await stop.waitFor({state:'hidden',timeout:180000});
  await saveScreen(page,dir,'fde-'+branch+'-review');
  console.log(path.join(dir,'fde-'+branch+'-review.json'));
} catch (error) {
  await saveScreen(page,dir,'fde-'+branch+'-error');
  throw error;
} finally {
  await context.close();
}
