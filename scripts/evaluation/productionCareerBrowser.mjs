import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';

export async function openCareer(dir, entry = '/career', locale = 'ko-KR') {
  const context = await chromium.launchPersistentContext(path.join(dir, 'browser'), {
    channel: 'chrome', headless: true, locale, timezoneId: 'Asia/Seoul', viewport: {width:1440,height:1000}
  });
  const page = context.pages()[0] ?? await context.newPage();
  const origin = 'https://matchharper.com';
  const url = new URL(entry, origin);
  if (url.origin !== origin) throw Error('Expected production Harper URL');
  try {
    await page.goto(url.href);
    if (url.pathname === '/career') {
      await page.waitForFunction(() => location.pathname === '/career_login' || document.querySelector('main textarea, [role=tablist], input[type=file]') || document.querySelector('h1,h2')?.textContent?.trim(), null, {timeout:45000});
    }
    if (new URL(page.url()).pathname === '/career_login') await signInOnScreen(page, dir);
    await page.locator('body').waitFor();
    return {context,page};
  } catch(error) {
    await saveScreen(page,dir,"navigation-error").catch(()=>{});
    await context.close();
    throw error;
  }
}

export async function signInOnScreen(page,dir) {
  const {email,password}=JSON.parse(readFileSync(path.join(dir, 'owner.json'), 'utf8'));
  if(new URL(page.url()).origin!=='https://matchharper.com'||new URL(page.url()).pathname!=='/career_login') throw Error('Expected first-party Career login');
  await page.locator('input[type=email]').fill(email);
  await page.locator('form button[type=submit]').click();
  await page.locator('input[type=password]').fill(password);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL(url=>url.pathname!=='/career_login');
}

export async function saveScreen(page, dir, label) {
  if (!/^[a-z0-9-]+$/.test(label)) throw Error('Invalid observation label');
  const record = { observedAt:new Date().toISOString(), url:page.url(), text:await page.locator('body').innerText(), tree:await page.locator('body').ariaSnapshot() };
  writeFileSync(path.join(dir,label+'.json'),JSON.stringify(record,null,2),{mode:0o600});
  const image = path.join(dir,label+'.png');
  await page.screenshot({path:image,fullPage:true});
  chmodSync(image,0o600);
  return record;
}

export async function makePdf(page, dir, doc) {
  const safe = doc.title.replace(/[/\\]/g,'-').replace(/\.pdf$/i,'')+'.pdf';
  const file = path.join(dir,safe);
  const tab = await page.context().newPage();
  try {
    await tab.setContent('<meta charset="utf-8"><style>body{font:16px system-ui;padding:40px}article{white-space:pre-line}</style><h1></h1><article></article>');
    await tab.locator('h1').evaluate((el,text)=>{el.textContent=text;}, doc.title);
    await tab.locator('article').evaluate((el,text)=>{el.textContent=text;}, doc.text);
    await tab.pdf({path:file,format:'A4'});
    chmodSync(file,0o600);
  } finally { await tab.close(); }
  return file;
}
