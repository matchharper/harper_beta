 function compose(){const n=active(),s=current();if(!n||n.kind==='step')return {rows:[],tools:[],note:'이 단계 자체는 LLM 호출이 아닙니다.',diff:[],mode:null};
  if(state.mode==='current'&&n.kind==='main'){const live=DATA.calls[current().id+':'+state.node+':'+state.stage];if(live)return live;}
  const proposed=state.mode==='proposed', mock=n.prompt==='mock', converted=proposed&&(n.shared||mock||['application_suggest','application_draft'].includes(n.prompt));
  if(n.kind==='aux'&&!converted){const rows=[{id:'p:'+n.prompt,label:'주요 지침'}];for(const p of n.extra||[])rows.push({id:'p:'+p,label:'함께 참조'});const input='input:'+n.prompt;if(C[input])rows.push({id:input,label:'이 작업의 원문 자료',aux:true});return {rows,tools:(n.tools||[]).map(t=>C['t:'+t]?'t:'+t:t).filter(t=>C[t]),note:n.note||C['p:'+n.prompt].summary,diff:[],mode:'aux'};}
  const mode=n.mode||'chat',isVoice=mode.startsWith('voice'),isOnboarding=mode.includes('onboarding'),extras=n.extra||[], rows=[], diff=[];
  if(!proposed){for(const id of blocks(mode==='background'&&s.commonBackground?'scheduled':mode)){
    rows.push({id,label:'system'});
    if(C[id].key==='dynamic_state'&&mode==='background'){
     rows.push({id:'background_instruction',label:'위 블록 안의 고정 문장',child:true});
     if(s.commonBackground)rows.push({id:'processing_instruction',label:'같은 수집 경로에서 넣는 고정 문장',child:true});
     if(n.eventData)rows.push({id:n.eventData,label:'위 블록 안의 이번 사건·예약 데이터',child:true});
     rows.push({id:'background_context',label:'위 블록 안의 조회 자료',child:true});
    }
    if(C[id].key==='dynamic_state')for(const p of extras.filter(p=>!['return','return_onboarding','voice_back'].includes(p)))rows.push({id:'p:'+p,label:'이번 상황 · 내부',child:true});
   }
   if(isVoice&&extras.includes('voice_back'))rows.push({id:'p:voice_back',label:'Live 판단 모델에 추가'});
   if(s.id==='email_profile'){rows.push({id:byKey('email','email_output_contract'),label:'이메일 작성 지침 추가'});}
  } else {
   rows.push({id:mainId,label:'항상 유지'});
   for(const key of ['visible_actions_guide','profile_context','future_matching_insights','visible_actions','capability_catalog','gmail_capability','dynamic_state','handbook_catalog']){
    const id=byKey('chat',key);if(id)rows.push({id,label:'공통 입력'});
    if(key==='dynamic_state'){
     rows.push({id:n.eventData||'event',label:'실제 사건·목적',child:true});
     if(mode==='background')rows.push({id:'background_context',label:'관련 연락·자료',child:true});
    }
   }
   const display=mode==='email'||s.id==='email_profile'?byKey('email','email_output_contract'):isVoice?byKey('voice','post_onboarding_voice_response_guidance'):byKey('chat','career_chat_display');
   if(display)rows.push({id:display,label:isVoice?'통화에 필요한 내용만 남김':'답변 작성 방법'});
   if(mode==='email')rows.push({id:byKey('email','email_thread_context'),label:'받은 메일'});
   if(isVoice){rows.push({id:byKey('voice','voice_call_rules'),label:'통화 도구 사용법'});if(extras.includes('voice_back'))rows.push({id:'p:voice_back',label:'Live 실행 방법'});}
   if(isOnboarding)rows.push({id:byKey('onboarding','onboarding_rules'),label:'정보 수집·완료 방법만 유지'});
   if(extras.includes('coaching'))rows.push({id:'p:coaching',label:'진행 중인 코칭'});
   if(mock)rows.push({id:'p:mock',label:'면접 역할·목적으로 정리'});
   if(converted&&['application_suggest','application_draft'].includes(n.prompt))rows.push({id:'h:resume',label:'필요한 작성 지침'});
   if(mode==='background'||isVoice||isOnboarding||mock||converted)diff.push('추가: 같은 career_main과 사용자 맥락');
   if(mode==='background')diff.push('정리: chat_core·background_execution·중복 자율 작업 지침 → 기본 지침 + 실제 사건·목적');
   if(isOnboarding)diff.push('정리: 별도 기본 지침·답변 대본 → 같은 기본 지침 + 아직 모르는 사실·완료 방법');
   if(isVoice)diff.push('정리: 별도 기본 지침·중복 행동 제한 → 같은 기본 지침 + 통화 사용법');
   if(extras.length&&!extras.includes('voice_back'))diff.push('상황별 답변 지시 → 원래 요청·실제 사건·이미 실행한 결과');
   if(converted)diff.push('별도 작성 호출 → 원래 Career LLM이 필요한 자료와 일반 도구로 수행');
   diff.push('조회·추출·평가·요약용 보조 모델은 필요한 작업별 입력을 유지');
  }
  const books=new Set(n.books||[]);if(mode==='background')books.add('proactive_career');
  for(const b of books)if(!rows.some(r=>C[r.id]?.key==='handbook:'+b))rows.push({id:'h:'+b,label:state.stage!=='first'?'불러온 업무 지침':'선택된 업무 지침'});
  if(state.stage!=='first'&&n.kind==='main')rows.push({id:'loaded_guidance',label:'불러온 경우 다음 호출에 추가'});
  rows.push({id:'history',label:'messages · 실제 대화'});
  if(!proposed)for(const p of extras.filter(p=>['return','return_onboarding'].includes(p)))rows.push({id:'p:'+p,label:'messages · 출처를 밝힌 앱 이벤트'});
  if(state.stage==='result')rows.push({id:'results',label:'messages · 실행 결과'});
  const tools=n.noTools?[]:!proposed&&n.directTools?n.directTools.map(t=>'t:'+t):!proposed&&(isVoice||isOnboarding)?[isVoice?'tools_voice':'tools_chat']:['tools_core'];
  if(!n.noTools&&!n.directTools&&(proposed||(!isVoice&&!isOnboarding)))tools.push('loaders');
  for(const t of n.directTools&&!proposed||mode==='background'?[]:n.tools||[])if(C['c:'+t])tools.push('c:'+t);
  if(mode==='background'&&!n.noTools)for(const t of ['schedules','career_delivery','company_contact'])tools.push('c:'+t);
  if(state.stage!=='first'&&!n.noTools)tools.push('loaded_tools');
  let note=n.note||'현재 조립 순서의 대표 입력입니다. 실제 사용자 자료·도구 허용 목록·선택된 추가 지침은 실행마다 달라집니다.';
  if(proposed)note='설계 제안입니다. 같은 기본 지침을 유지하고 실제 사건·목적과 필요한 도구·업무 지침을 조합합니다.';
  return {rows:rows.filter(r=>C[r.id]),tools:[...new Set(tools)],note,diff,mode};
 }
