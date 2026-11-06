import { createHash, randomUUID } from 'node:crypto';

// Leave room for multipart headers below Vercel's 4.5 MB request limit.
export const MAX_RESUME_BYTES = 4 * 1024 * 1024;
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page(body, status = 200) {
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Harper · Founding Engineer, AI Agent</title>
<style>
:root{--bg-default:#fff;--bg-basement:#fdfdfc;--bg-weak:#f5f4f3;--text-primary:#1b1b1a;--text-muted:#666662;--stroke:#e7e6e2;--stroke-strong:#cbc9c2;--primary:#f6d66b;--critical:#a32b26}
*{box-sizing:border-box}html{scroll-padding-top:24px}body{margin:0;background:var(--bg-basement);color:var(--text-primary);font:15px/1.75 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}a{color:inherit;text-underline-offset:4px}a:hover{text-decoration:underline}button,input{font:inherit}:focus-visible{outline:2px solid var(--text-primary);outline-offset:4px}h1,h2,h3,p{margin:0}h1{font-size:56px;line-height:1.1;letter-spacing:-2.5px;font-weight:600}h2{font-size:22px;line-height:1.4;letter-spacing:-.6px;font-weight:600}h3{font-size:16px;font-weight:600}.container{width:min(1120px,calc(100% - 80px));margin-inline:auto}.site-header{background:var(--bg-default);border-bottom:1px solid var(--stroke)}.header-inner{height:88px;display:flex;align-items:center;justify-content:space-between;gap:24px}.brand{display:inline-flex;align-items:center;gap:14px;text-decoration:none}.brand-name{font-size:29px;line-height:1;letter-spacing:-1.4px;font-weight:700}.brand-label{border-left:1px solid var(--stroke-strong);padding-left:14px;color:var(--text-muted);font-size:13px}.header-nav{display:flex;align-items:center;gap:28px;font-size:14px}.header-nav a{text-decoration:none}.header-nav a:hover{text-decoration:underline}.button{display:inline-flex;align-items:center;justify-content:center;gap:18px;min-height:44px;padding:10px 20px;border:1px solid var(--text-primary);border-radius:7px;background:var(--text-primary);color:white;font-weight:500;text-decoration:none;cursor:pointer}.button:hover{background:#353532;text-decoration:none}.skip-link{position:absolute;top:-100px;left:20px;z-index:2;background:white;padding:12px}.skip-link:focus{top:12px}
.hero{padding:62px 0 48px;border-bottom:1px solid var(--stroke)}.eyebrow{display:flex;align-items:center;gap:9px;margin-bottom:22px;font-size:12px;font-weight:600;letter-spacing:1.6px}.eyebrow::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--primary)}.hero-copy{margin-top:22px;color:var(--text-muted);font-size:17px;letter-spacing:-.3px}.tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:26px}.tag{padding:4px 11px;border:1px solid var(--stroke);border-radius:5px;font-size:12px;color:var(--text-muted);background:var(--bg-default)}.content-grid{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:88px;align-items:start;padding:48px 0 80px}.job-content{min-width:0}.job-section+ .job-section{margin-top:36px}.job-section h2{margin-bottom:16px}.job-section p,.job-section li{color:#50504d;word-break:keep-all;overflow-wrap:break-word}.job-section p+p{margin-top:12px}.job-section ul{padding-left:20px;margin:0}.job-section li{padding-left:4px;margin:9px 0}.job-section li::marker{color:#999890}.team-note{margin-top:36px;padding:22px 24px;border-left:3px solid var(--primary);background:var(--bg-weak)}.team-note p{margin-top:8px;color:var(--text-muted);font-size:14px}
.application{padding:28px;border:1px solid var(--stroke);border-radius:12px;background:var(--bg-default);min-width:0}.application-heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:24px}.required-note,small{font-size:12px;color:var(--text-muted)}.required{color:var(--text-muted);font-weight:400;font-size:12px}.field+ .field{margin-top:18px}.field label{display:block;margin-bottom:7px;font-size:14px;font-weight:500}.field input{display:block;min-width:0;width:100%;padding:11px 12px;border:1px solid var(--stroke-strong);border-radius:6px;background:var(--bg-default);font-size:14px}.field input::placeholder{color:#8a8984}.field input[type=file]{padding:10px;font-size:12px}.field input::file-selector-button{border:0;border-radius:4px;padding:7px 9px;margin-right:9px;background:var(--bg-weak);color:var(--text-primary);font:inherit;cursor:pointer}.field small{display:block;margin-top:6px}.privacy{margin-top:24px;padding-top:20px;border-top:1px solid var(--stroke)}.privacy summary{font-size:13px;font-weight:500;cursor:pointer}.privacy-copy{margin-top:12px;padding:14px;background:var(--bg-weak);border-radius:6px;font-size:12px;line-height:1.65;color:var(--text-muted)}.privacy-copy dl{margin:0}.privacy-copy dt{font-size:12px;color:var(--text-primary);margin-top:10px;font-weight:500}.privacy-copy dt:first-child{margin-top:0}.privacy-copy dd{margin:3px 0 0}.privacy-copy p{margin-top:12px}.consent{display:flex;align-items:flex-start;gap:10px;margin-top:16px;cursor:pointer;font-size:13px;line-height:1.6}.consent input{flex:0 0 auto;width:17px;height:17px;margin:2px 0 0;accent-color:var(--text-primary)}form .button{width:100%;margin-top:24px;min-height:48px;font-size:14px}button:disabled{opacity:.55;cursor:wait}#error{color:var(--critical);font-size:13px;margin-top:16px}#error:empty{display:none}.receipt{max-width:600px;margin:64px auto}.receipt h1{font-size:32px;letter-spacing:-1px}.receipt-list{margin:24px 0}.receipt-list dt{font-size:12px;color:var(--text-muted);margin-top:16px}.receipt-list dd{margin:2px 0;overflow-wrap:anywhere}.receipt-link{font-size:14px}.site-footer{border-top:1px solid var(--stroke);background:var(--bg-default);padding:32px 0}.footer-top{display:flex;align-items:center;justify-content:space-between;gap:20px}.footer-top .brand-name{font-size:23px}.footer-top a{font-size:13px}.footer-bottom{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-top:22px;font-size:12px;color:var(--text-muted)}.footer-bottom p{max-width:600px}.copyright{white-space:nowrap}
@media(max-width:1000px){.content-grid{gap:40px;grid-template-columns:minmax(0,1fr) 360px}.application{padding:24px}h1{font-size:48px}}
@media(max-width:760px){.container{width:calc(100% - 40px)}.header-inner{height:72px;gap:12px}.brand{gap:10px}.brand-name{font-size:25px}.brand-label{padding-left:10px;font-size:12px}.header-nav{gap:12px}.header-nav .about-link{display:none}.header-nav .button{padding:8px 14px;min-height:40px;font-size:13px}.hero{padding:40px 0 32px}h1{font-size:clamp(34px,8vw,46px);letter-spacing:-1.5px}.hero-copy{font-size:15px}.content-grid{grid-template-columns:1fr;gap:36px;padding:32px 0 48px}.job-section+ .job-section{margin-top:28px}.application{padding:24px}.footer-bottom{display:block}.copyright{margin-top:14px}h2{font-size:20px}.receipt{margin:40px 0}.receipt h1{font-size:28px}}
</style></head><body>
<a class="skip-link" href="#main">본문으로 건너뛰기</a>
<header class="site-header"><div class="container header-inner"><a class="brand" href="/simple" aria-label="Harper 채용 홈"><span class="brand-name">harper</span><span class="brand-label">Careers</span></a><nav class="header-nav" aria-label="주요 메뉴"><a class="about-link" href="/simple#about">Harper 소개</a><a class="button" href="/simple#application">지원하기 <span aria-hidden="true">↗</span></a></nav></div></header>
<main id="main" class="container">${body}</main>
<footer class="site-footer"><div class="container"><div class="footer-top"><span class="brand-name">harper</span><a href="/simple#privacy">개인정보 수집·이용 안내</a></div><div class="footer-bottom"><span class="copyright">© ${new Date().getFullYear()} Harper</span></div></div></footer>
</body></html>`, { status, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
}

export function simpleApplicationPage() {
  return page(`<section class="hero" aria-labelledby="job-title"><p class="eyebrow">ENGINEERING</p><h1 id="job-title">Founding Engineer,<br>AI Agent</h1><p class="hero-copy">사람과 기회를 연결하는 AI 에이전트를 함께 만듭니다.</p><div class="tags"><span class="tag">Engineering</span><span class="tag">AI Agent</span><span class="tag">Product</span></div></section>
<div class="content-grid"><article class="job-content" aria-label="공고 상세">
<section class="job-section" id="about"><h2>Harper를 소개합니다</h2><p>Harper는 개인에게는 다음 커리어 기회를, 회사에는 함께할 팀원을 찾는 과정을 돕는 AI 에이전트입니다.</p><p>대화를 이해하는 데서 그치지 않고, 필요한 정보를 찾고 도구를 사용해 실제 일을 끝까지 수행하는 제품을 만들고 있습니다.</p></section>
<section class="job-section"><h2>함께할 일</h2><ul><li>사용자의 맥락을 이해하고 행동하는 AI 에이전트를 설계하고 개발합니다.</li><li>탐색부터 추천, 지원과 연결까지 이어지는 제품 경험을 만듭니다.</li><li>모델에 필요한 맥락과 도구를 제공하고, 실제 사용 결과를 바탕으로 품질을 개선합니다.</li><li>제품의 문제를 정의하고 프론트엔드와 백엔드를 연결해 해결합니다.</li></ul></section>
<section class="job-section"><h2>이런 분과 함께하고 싶어요</h2><ul><li>사용자의 문제를 이해하고 제품으로 해결하는 과정을 즐기는 분</li><li>웹 서비스를 직접 개발하고 운영해 본 경험이 있는 분</li><li>LLM의 가능성과 한계를 탐구하고, 실제 제품에 적용하는 데 관심이 있는 분</li><li>팀원과 맥락을 공유하며 작은 개선을 빠르게 쌓아가는 분</li></ul></section>
<aside class="team-note"><h3>직접 만든 것을 들려주세요</h3><p>이력서에 참여한 프로젝트와 본인의 역할을 담아주세요. 소개하고 싶은 제품이나 코드가 있다면 링크를 함께 담아주셔도 좋습니다.</p></aside>
</article><section class="application" id="application" aria-labelledby="application-title"><div class="application-heading"><h2 id="application-title">지원하기</h2><span class="required-note">모든 항목 필수</span></div>
<form action="/simple" method="post" enctype="multipart/form-data">
<div class="field"><label for="name">이름</label><input id="name" name="name" autocomplete="name" placeholder="이름을 입력해 주세요" required></div>
<div class="field"><label for="email">이메일</label><input id="email" name="email" type="email" autocomplete="email" placeholder="name@example.com" required></div>
<div class="field"><label for="resume">이력서</label><input id="resume" name="resume" type="file" accept=".pdf,.doc,.docx" required aria-describedby="file-help"><small id="file-help">PDF, Word · 최대 4 MB</small></div>
<details class="privacy" id="privacy" open><summary>개인정보 수집·이용 안내</summary><div class="privacy-copy" id="privacy-copy"><dl><dt>수집·이용 목적</dt><dd>Harper 테스트 지원서 접수 및 첨부 파일 확인</dd><dt>수집 항목</dt><dd>이름, 이메일, 이력서 파일과 파일에 포함된 개인정보</dd><dt>보유 및 이용 기간</dt><dd>접수 요청 처리 중에만 사용하며, 별도로 저장하거나 채용팀에 전달하지 않습니다.</dd></dl><p>동의를 거부할 수 있으나, 동의하지 않으면 이 테스트 지원서를 제출할 수 없습니다.</p></div></details>
<label class="consent" for="privacy-consent"><input id="privacy-consent" name="privacyConsent" type="checkbox" value="accepted" required aria-describedby="privacy-copy"><span>개인정보 수집 및 이용에 동의합니다. <span class="required">(필수)</span></span></label>
<p id="error" role="alert"></p><button class="button" type="submit">지원서 제출 <span aria-hidden="true">↗</span></button></form></section></div>
<script>
document.querySelectorAll('a[href="/simple#privacy"]').forEach(link=>link.addEventListener('click',()=>{document.querySelector('#privacy').open=true;}));
const form=document.querySelector('form'), button=form.querySelector('button'), error=document.querySelector('#error');
form.addEventListener('submit',async event=>{
event.preventDefault();error.textContent='';
if(form.resume.files[0]?.size>${MAX_RESUME_BYTES}){error.textContent='4 MB 이하의 이력서를 첨부해 주세요.';return;}
button.disabled=true;button.textContent='제출 중…';
try{const response=await fetch(form.action,{method:'POST',headers:{Accept:'application/json'},body:new FormData(form)});
if(!response.ok){let message='제출하지 못했습니다. 다시 시도해 주세요.';try{message=(await response.json()).error||message;}catch{}throw Error(message);}
const receipt=await response.json();
const heading=document.querySelector('#application-title');heading.textContent='지원서 접수 완료';heading.tabIndex=-1;document.querySelector('.required-note').remove();
const list=document.createElement('dl');list.className='receipt-list';for(const [label,value] of [['이름',receipt.name],['이메일',receipt.email],['이력서',receipt.file.name],['접수 번호',receipt.id]]){const term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=label;detail.textContent=value;list.append(term,detail);}
const again=document.createElement('a');again.href='/simple';again.className='receipt-link';again.textContent='지원서 다시 작성';
document.querySelector('#application').append(document.querySelector('#privacy'));form.replaceWith(list,again);heading.focus();
}catch(e){error.textContent=e.message;button.disabled=false;button.textContent='지원서 제출';}
});
</script>`);
}

export async function receiveSimpleApplication(request) {
  const json = request.headers.get('accept')?.includes('application/json');
  const fail = (error, status = 400) => json
    ? Response.json({ error }, { status, headers })
    : page(`<section class="application receipt"><h1>제출하지 못했습니다</h1><p>${escape(error)}</p><a href="/simple">지원서로 돌아가기</a></section>`, status);
  let form;
  try { form = await request.formData(); } catch { return fail('지원서 양식을 확인해 주세요.'); }
  const name = form.get('name'), email = form.get('email'), resume = form.get('resume');
  if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return fail('이름과 이메일을 확인해 주세요.');
  if (form.get('privacyConsent') !== 'accepted')
    return fail('개인정보 수집 및 이용에 동의해 주세요.');
  if (!resume || typeof resume === 'string' || !resume.size)
    return fail('이력서를 첨부해 주세요.');
  if (resume.size > MAX_RESUME_BYTES) return fail('4 MB 이하의 이력서를 첨부해 주세요.', 413);
  const bytes = Buffer.from(await resume.arrayBuffer());
  const receipt = {
    id: randomUUID(), receivedAt: new Date().toISOString(), name: name.trim(), email: email.trim(), privacyConsent: true,
    file: { name: resume.name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
  };
  // No DB, object storage, email, invocation secret, or fixed candidate fixture.
  if (json) return Response.json(receipt, { status: 201, headers });
  return page(`<section class="application receipt"><h1>지원서 접수 완료</h1><dl class="receipt-list"><dt>이름</dt><dd>${escape(receipt.name)}</dd><dt>이메일</dt><dd>${escape(receipt.email)}</dd><dt>이력서</dt><dd>${escape(receipt.file.name)}</dd><dt>접수 번호</dt><dd>${receipt.id}</dd></dl><a class="receipt-link" href="/simple">지원서 다시 작성</a></section>`, 201);
}
