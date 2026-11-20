import { readFileSync } from 'node:fs';
const dataset = version => JSON.parse(readFileSync(`docs/evaluation/career-agent-autonomy/cases-v${version}.json`, 'utf8')).cases;
const resumeOnly = dataset(17)[0];
const toronto = dataset(17)[1];
const offers = dataset(20)[0];
const backend = { name:'이민재', bio:resumeOnly.documents[0].text };
const researcher = {name:'강지수',bio:'서울에서 음성 생성 모델을 개발해 출시했습니다. 한국 근무, 보상과 회사 인지도를 중요하게 봅니다.'};
const designer = {name:'김지우',bio:'서울에 거주하며 한국에서 계속 일하려는 디자이너입니다.'};
const operations = {name:'문서윤',bio:'매장과 본사 사이의 반품 절차를 개선했습니다.'};
const developer = {name:'한예린',bio:'솔잎시스템즈 백엔드 엔지니어. 고객 API 연동 지원.'};
const operator = {name:'Javier',bio:'Based in Singapore. I invest in developer tools and want to operate a business. My base salary target is S$280,000, depending on ownership.'};
const product = {name:'윤주원',bio:offers.profile.experiences[0].description};
const minimum = offers.history;
const texts = entries => entries.map(([title,text])=>({title,text}));
const line = (role,content)=>({role,content});
const notes = texts([['반품 개선 업무 노트','한 점장의 반대로 첫 매장부터 시험했다. 직원 의견을 듣고 파손과 누락을 나눴다. 나머지 두 매장의 표본도 대조했다. 반품 사유를 18종에서 5종으로 줄였다.']]);
const evidence = texts([['고객 워크숍 회고','예린은 고객 엔지니어와 배송 상태 중복 기록 문제를 재현했다. 재시도할 때 같은 멱등성 키를 보내도록 백엔드를 고쳤다. 고객 엔지니어와 다시 재현해 확인했다.']]);
const offerDocs = offers.documents.map(({title,text})=>({title,text}));
const openRole='/jobs/usv-backed-sports-collectibles-startup-strategy-ops-lead-toronto';
export const cases = {
 '01':{...backend, intake:true, upload:resumeOnly.documents[0]},
 '02':{name:toronto.profile.name,intake:true,entry:openRole,upload:toronto.documents[0]},
 '03':{name:'이지안',intake:true,turns:['카페에서 일하는데 다른 일도 좀 보고 싶어요']},
 '04':{name:'이지안',intake:true,needs:['새 프로필의 Gmail 연결과 해당 받은편지함에 도착한 면접·캡스톤 메일']},
 '05':{name:'지후',history:[line('assistant','하셨던 일을 알려주실 때 이메일을 연결해 두시면 제가 거기서 찾아볼 수도 있어요.')],turns:['메일 말고 전화가 편해요'],voice:true},
 '06':{name:'김다은',intake:true,portfolio:{title:'축제 안내 사이트 팀 포트폴리오',text:'네 명이 만든 축제 안내 사이트. 김다은은 프런트엔드를 맡았다. 변경 #17에서 김다은이 휴대폰 시간표의 키보드 이동을 고쳤다. 모바일 v1.1에서 이 화면을 배포했다. 다른 세 팀원은 장소 데이터와 서버를 맡았다.'},needs:['변경 전후 화면 및 원래 커밋']},
 '07':{...backend,turns:['어디가 괜찮을까요?'],scheduled:true},
 '08':{...researcher,history:[line('user','솔음과 다래음성에는 이미 지원했어요.')],turns:['다른 데도 있어?']},
 '09':{...operator,locale:'en',history:[line('assistant','A general business operations role in an established Singapore company is one direction.')],turns:['Anything more startup-ish?']},
 '10':{name:'강민호',bio:'물류 데이터 파이프라인을 운영했다. 첫 데이터팀을 설계하고 싶다.',scheduled:true,needs:['모눈물류 개발 리드의 공개 원글']},
 '11':{...operations,turns:['이음랩은 어때요?'],needs:['두 물류센터 도입 원문과 발표 페이지'],
   privateOnly:{...operations,
     docs:texts([['이음랩 출시 글','제품팀이 주문 예외 처리 소프트웨어를 두 번째 물류센터에 도입했다. 다음 센터의 도입을 준비하고 있다. 채용 페이지에는 영업직만 올라와 있다.'],
       ['문서윤의 반품 예외 발표','매장과 운영팀이 함께 반품 예외를 처리하는 작업대를 만들었다. 나는 반품 사유를 정리하고 직원들이 쓰는 화면을 바꿨다.']]),
     cards:[{doc:'이음랩 출시 글',body:'두 번째 물류센터의 도입 소식'}],turns:['저장한 이음랩은 어때요?']}},
 '12':{...backend,history:[line('user','전에 서버를 혼자 운영했어요.'),line('assistant','보상이 높은 첫 백엔드 엔지니어 자리가 있어요.')],turns:['혼자 하는 건 좀…'],needs:['첫 추천 카드와 팀 인터뷰'],
   privateOnly:{...backend,docs:texts([['새잎페이 첫 백엔드 채용','첫 백엔드 엔지니어로 서버 운영과 장애 대응을 혼자 맡는다. 기본급 1억 3천만 원.'],
       ['여울데이터 스트리밍 팀 인터뷰','백엔드 엔지니어 세 명이 설계안을 같이 검토하고 온콜을 교대로 맡는다. 스트리밍 서버 경험이 있는 동료를 구하고 있다.']]),
     cards:[{doc:'새잎페이 첫 백엔드 채용',body:'첫 백엔드 엔지니어'},{doc:'여울데이터 스트리밍 팀 인터뷰',body:'스트리밍 서버를 만드는 팀'}],
     history:[line('user','전에 서버를 혼자 운영했어요.'),line('assistant','기본급이 1억 3천만 원인 새잎페이 첫 백엔드 자리를 먼저 보실래요?')],turns:['혼자 하는 건 좀…','네, 같이 일할 사람이 있으면 좋겠어요.']}},
 '13':{...designer,docs:texts([['원격 제품 디자이너','공고 지원 자격. 미국 내 거주 필수. 원격 근무.'],['서울 제품 디자이너','서울 제품 디자이너 채용. 지원 마감.']]),cards:[{doc:'원격 제품 디자이너',body:'지원 자격은 공고 참고.'},{doc:'서울 제품 디자이너',body:'서울 디자인팀.'}],turns:['저장한 것 중 어디부터 볼까요?'],needs:['저장한 공고 두 개의 원문과 회사 팔로우']},
 '14':{...designer,history:[line('user','동남아에서 고객이 있는 음성 AI 팀을 알아보고 있어요.')],turns:['ElevenLabs는 싱가포르에서 뭘 하고 있어요?'],second:{name:'민서',bio:'싱가포르에서 음성 AI 제품을 기업에 도입하는 일을 찾고 있다.',history:[line('user','싱가포르에서 음성 AI를 기업 고객에게 도입하는 일을 하고 싶어요.')],turns:['이 지역에서 고객이 생긴 팀이 있나요?']},needs:['원래 여울데이터 인터뷰·공고의 두 버전']},
 '15':{...researcher,history:[line('user','기본급 1억 2천 이상이고 모델을 출시하는 자리면 좋겠어요.')],turns:['좀 많이 보고 싶어요','하나만 고르면?'],needs:['세 회사 공고 아홉 개']},
 '16':{...researcher,scheduled:true,needs:['이미 읽은 공고 두 건과 새 서울 음성 리드 공고']},
 '17':{...researcher,scheduled:true,needs:['지난 조사와 같은 시장 및 읽어 둔 공고 두 건']},
 '18':{...operations,scheduled:true,needs:['팔로우한 회사의 로고 변경과 목요일 서울 공고']},
 '19':{...researcher,docs:texts([['42dot 차량용 음성 합성','차량용 TTS 모델과 기기·서버 최적화. https://www.42dot.ai/ko/careers/open-roles/c184cf35-51e2-4e80-87bc-579089f07472'],['채널톡 상담용 음성 모델','고객 상담의 TTS 모델 학습. https://channel.io/kr/careers/04d1bd56-f75b-4dc1-ad61-c538274bdccf']]),cards:[{doc:'42dot 차량용 음성 합성',body:'차량용 음성 합성'},{doc:'채널톡 상담용 음성 모델',body:'상담용 음성 모델 학습'}],turns:['안녕','저번에 봤던 음성 쪽 어디였지?'],needs:['42dot·채널톡 열람 및 저장 기록']},
 '20':{...designer,scheduled:true,history:[line('user','저장한 자리의 지원 기한은 챙겨주세요.')],docs:texts([['이음랩 결제 제품 디자이너 공고','지원 마감은 {DEADLINE} 한국 시간. 결제 화면 실험 링크가 필요하다.'],['이음랩 지원 초안','모바일 결제 이탈을 개선한 경험을 적었다. 결제 화면 실험 링크만 비어 있다.']]),cards:[{doc:'이음랩 결제 제품 디자이너 공고',body:'지원 마감 {DEADLINE} 한국 시간.'}],needs:['접수증 대조군과 연결된 Gmail']},
 '21':{name:'정민서',bio:'샌프란시스코에서 이메일 연동을 출시했다. 고객이 쓰는 제품을 직접 바꾸고 싶다. 주 4일 출근 가능하다.',needs:['전용 계정에만 보이는 내부 추천']},
 '22':{name:'정민서',needs:['회사 테스트 수신함과 21번의 내부 추천 및 승인한 이력서']},
 '23':{...operations,history:[line('user','이음랩이 다음 물류센터에서 뭘 할지 궁금해요.')],docs:texts([['지수에게 받은 예전 편지','2024년 11월 12일. 반품 프로젝트 같이 했던 지수예요. 이음랩 제품 운영팀으로 옮겼어요. 다음에 또 얘기해요.'],['이음랩 출시 소식','주문 예외 처리 제품을 두 번째 물류센터에 도입했다.']]),turns:['이음랩에 연결할 방법 있어?'],needs:['예전 동료의 실제 테스트 연락처와 소개 가능 여부']},
 '24':{...operations,docs:notes,uploads:[{title:'문서윤 이력서',text:'문서윤. 매장 운영 담당. 반품 업무 담당.'}],turns:['이 공고에 지원하고 싶어요. https://harper-apply-browser-lab-20261022.vercel.app/simple'],needs:['파일·개선 사례·입사일을 받는 격리된 채용 사이트']},
 '25':{...operations,needs:['출시 발표·사용자 발표와 테스트 회사의 발송 초안']},
 '26':{...operations,needs:['테스트 일정과 같은 스레드의 시간 제안·확정 초대']},
 '27':{...operations,docs:[...notes,...texts([['다온커머스 면접 초대','내일 오전 11시, 현장 운영 리드 면접입니다. 세 매장에 반품 정책을 적용한 사례를 10분간 설명해 주세요.']])],interview:{title:'다온커머스 현장 운영 리드 면접',content:'세 매장에 반품 정책을 적용한 사례를 10분간 설명해 주세요.'},scheduled:true,needs:['다음 날 실제 면접 일정과 초대 원문']},
 '28':{...operations,docs:notes,voice:true,practiceRole:'7feac347-90f5-44a0-bd26-67e795a681a2'},
 '29':{...product,history:[line('user','다음에는 제품 로드맵을 직접 맡고 싶어요.'),line('assistant','제품팀 소속인 이음랩을 먼저 알아볼 만해요.')],docs:texts([['여울데이터 면접 메모','입사 후 첫 6개월 동안 새 대시보드의 우선순위를 정한다.'],['이음랩 제품 운영 면접','제품팀 소속으로 안내받았다. 다음 면접 예정.']]),cards:[{doc:'이음랩 제품 운영 면접',body:'후속 면접 예정',stage:'connected'},{doc:'여울데이터 면접 메모',body:'후속 면접 예정',stage:'connected'}],turns:['막상 거의 고객사 상주래요','이음랩은 그만할게요'],needs:['두 지원의 진행 기록']},
 '30':{...product,history:minimum,uploads:offerDocs,turns:[offers.message]},
 '31':{...product,history:minimum,docs:offerDocs,turns:['이음랩에 연봉 협의 메일 좀 써줘'],needs:['기존 회신 스레드와 발송 후 도착한 수정 오퍼']},
 '32':{...product,turns:['여울데이터로 가기로 했어요. 남은 과제는 어떻게 정리할까요?'],docs:texts([['여울데이터 서명한 오퍼','윤주원 계약서. 12월 1일부터 근무하기로 서명했다.'],['이음랩 과제 안내','11월 24일까지 과제를 제출해 주세요.']]),needs:['테스트 회사 메일과 서명 후 첫 출근 시점']},
 '33':{...operations,history:[line('user','매장에서 본사 운영으로 옮겼고 지금 기본급은 6천만 원이에요.')],docs:texts([['외부 제안','기본급 6,000만 원. 한 매장의 운영을 담당한다.'],['상사의 메모','12월부터 세 매장의 운영 개선을 이끌어 주세요.']]),turns:['옮겨야 할까요?','세 매장 기준은 제가 정한대요. 3월 5일에 결과는 보는데 연봉은 약속 못 한대요.']},
 '34':{name:'이바름',turns:['소비자가 서로 쓰는 커뮤니티 AI 앱 만드는 팀이 있을까요?'],privateOnly:{name:'이바름',turns:['제가 저장한 것 중에 소비자가 서로 쓰는 커뮤니티 AI 앱 팀이 있었나요?']},needs:['시장 조사 결과가 0건인 날과 첫 공개일을 고정한 자료']},
 '35':{...developer,docs:[...evidence,...texts([['한예린 이력서','한예린. 솔잎시스템즈 백엔드. 고객 API 연동 지원.'],['리버포트 FDE 공고','고객 현장에서 재시도 때문에 생긴 중복 기록을 해결한 경험을 적어 주세요.']])],cards:[{doc:'리버포트 FDE 공고',body:'고객 현장 엔지니어 지원 준비'}],history:[line('user','리버포트 고객 현장 엔지니어 자리를 보고 있어요.')],turns:['여기 지원 준비 좀 도와주세요.'],needs:['지원할 FDE와 개인 문서·Gmail 단독 대조군']},
 '36':{...developer,history:[line('user','물결랩 고객 현장 엔지니어에 지원할 거예요.')],docs:[...evidence,...texts([['물결랩 지원 질문','고객과 직접 해결한 기술 문제 한 가지를 설명해 주세요.']])],turns:['이 질문에 뭐라고 쓸까요?'],needs:['두 FDE 지원서와 실제 워크숍 메일']},
 '37':{name:'지후',bio:'서울 병원에서 예약 안내를 도왔다. 당일 취소 때문에 안내 문자를 보내는 시간을 바꿨다. 효과는 아직 세지 않았다.',scheduled:true,needs:['LinkedIn Jobs에만 있는 공고']},
 '38':{name:'현아',bio:'화면낭독기 사용성을 테스트한 제품 디자이너. 주 1일 외부 현장 조사 프로젝트를 찾는다.',scheduled:true,needs:['X의 원본 협업 제안']},
 '39':{name:'서윤',history:[line('user','지금 싱가포르에 살고 있고 이사는 어려워요. 다음에도 기업 고객 도입을 직접 이끌고 싶어요.')],bio:'싱가포르에서 B2B 서비스 고객 온보딩을 맡았다. 이사할 수 없고, 다음에도 고객 도입을 직접 이끌고 싶다.',turns:['지금 알아볼 만한 팀 있어요?'],needs:['세 종류의 기회를 포함하는 동일한 시장']},
 '40':{name:'검토자',cohort:true,needs:['같은 기간에 도움을 요청한 네 계정과 당사자의 결과 기록']},
};
