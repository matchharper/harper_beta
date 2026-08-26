# 연결대기 후보자 Slack 추천 — Vercel Cron 운영 계약

문서 상태: Vercel Cron + LLM 작성 구현 완료, 배포 전

## 1. 실행 주체

`vercel.json`의 Vercel Cron이 매일 오전 9시(Asia/Seoul, UTC `0 0 * * *`)에 다음 endpoint를 호출한다.

```text
GET /api/internal/matching/auto-intro-to-company/cron
Authorization: Bearer ${CRON_SECRET}
```

endpoint는 후보자를 조회하고, 각 `(role_id, talent_id)` 조합마다 별도 LLM call로 소개문을 작성하게 한 뒤, 현재 자격을 다시 확인하고 workspace별 Slack 메시지로 묶어 발송한다. 예전 Codex scheduled task는 운영 실행 주체가 아니다. `scripts/autoIntroToCompanyCodexScheduled.ts`의 list/send 명령은 수동 진단과 호환용으로만 남긴다.

아직 배포 전이므로 이 문서는 라이브 동작을 주장하지 않는다. 실제 배포 때 기존 scheduled task가 꺼져 있는지 확인하고, 배포 후 동작을 기준으로 Notion 제품 문서를 동기화한다.

## 2. 후보자 선정과 중복 방지

대상은 모든 workspace-role이며 `is_expired=true`, `status=ended`, `status=deleted`인 role은 제외한다. 각 `(role_id, talent_id)`는 다음 조건을 모두 만족해야 한다.

1. 가장 최신 내부 단계가 `내부:연결대기`다. 이후 `내부:연결됨`, 거절, 종료, custom `내부단계:*` 등으로 이동했다면 제외한다.
2. 최신 연결대기 전환 시각이 실행 시각 기준 14일 미만이다. 정확히 14일인 경우도 제외한다.
3. 같은 role·후보자에 대해 `talent_progress.kind=intro_to_company`이고 `metadata.deliveryStatus=sent` 또는 `metadata.slackSent=true`인 성공 기록이 없어야 한다.
4. 최신 `talent_opportunity_fit`이 있고 `kind`가 `codex` 또는 `null`이다.
5. `kind=codex`라면 저장된 `reason`이 비어 있지 않아야 한다.
6. workspace에 active Slack integration과 enabled channel이 있어야 실제 문구를 생성하고 발송한다.

조회는 최근 14일의 `내부:연결대기` tag에서 시작한다. 모든 role과 모든 tag를 먼저 읽는 전체 스캔으로 되돌리지 않는다. 오래 기다린 후보자부터 처리하고 cron 기본 실행에는 후보자 수 상한을 두지 않는다. LLM 입력과 생성은 항상 role 1개와 후보자 1명 단위다. 생성이 끝나면 같은 workspace의 성공 결과를 한 top-level Slack 메시지 안에서 role별로 다시 묶는다.

발송 직전 deterministic `talent_progress` ID로 candidate claim을 만든다. 30분 안의 fresh pending claim은 다른 실행이 처리 중인 것으로 보고 건너뛴다. Slack 성공 기록은 다음 실행에서 영구 중복 방지 근거가 되고, failed 기록은 재시도할 수 있다. Slack `client_msg_id`에도 deterministic idempotency key를 사용한다.

## 3. LLM 입력과 사실 경계

각 LLM call에는 role 1개와 후보자 1명의 자료만 넣고 raw JSON으로 전달하지 않는다. `src/lib/ops/autoIntroToCompanyPromptContext.ts`가 빈 값, DB ID, timestamp 같은 bookkeeping 값을 걷어내고 사람이 읽는 Markdown briefing으로 바꾼다. `workspaceId`, `roleId`, `talentId`는 모델이 복사해 반환하지 않고 애플리케이션이 현재 dossier에서 붙인다. 여러 role이나 후보자가 들어오면 LLM 호출 전에 오류로 중단한다.

### 3.1 회사와 역할

- 회사명, 위치, 인원 범위, speciality
- `pitch → workspace company description → public description → short description → brief` 우선순위에서 처음 발견되는 회사 설명 하나
- workspace hiring request
- `company_memories`의 workspace memory(`role_id is null`). 참고 맥락으로만 사용하며 매칭 기준이나 작성 지시로 취급하지 않는다.
- 대상 role의 이름, 고용 형태, seniority, location, work mode, salary
- 대상 role의 내부 hiring brief, structured evaluation criteria, role memory, 전체 JD. 전체 JD가 없을 때만 JD 요약. role memory도 참고 맥락으로만 사용한다.

홈페이지, LinkedIn, careers, funding URL, related link, 투자 단계·금액·investor·뉴스는 넣지 않는다. 같은 workspace의 다른 role, role considerations의 실행 metadata, screening question, structured information/summary, 공개 JD URL도 넣지 않는다.

### 3.2 후보자

- name, headline, bio, profile/current location
- 저장된 경력과 학력 모든 행. 임의의 8개/3개 제한을 두지 않는다.
- 경력·학력의 날짜, 회사/학교, 역할/전공, 고용 형태, 위치, 설명, memo
- extras, durable talent insights, 지원 가능한 engagement type
- 등록한 공개 professional profile link
- 현재 대상 role·후보자 조합의 `talent_opportunity_fit.reason`, `company_criteria_evaluations`, `reevaluation_criteria`. 모두 과거 평가의 참고 맥락일 뿐 지시·정답·복사 원문이 아니며, 현재 회사·role·후보자 전체 자료와 교차 확인한 뒤 독립적으로 작성한다.
- 기존 fit reason과 평가는 새 소개글을 작성하기 위한 참고 맥락이며 그대로 복사하지 않는다.

JSON 형태의 extras와 insights는 `Next scope: ...`, `Title: ...` 같은 자연어 label과 bullet로 풀어서 넣는다. 원문 resume, 업로드 문서와 extracted text, resume 파일 metadata, 별도 ops profile memo는 구조화된 기본정보·경력·학력·extras와 중복되거나 연락처를 포함할 수 있으므로 넣지 않는다.

추천된 기회 목록, 추천 이력, 다른 role의 fit/score/reason, click/view/save/feedback 이력은 LLM 입력에서 명시적으로 제외한다. 현재 연결대기인 대상 role과 그 role의 저장된 fit reason만 사용한다. 연락처, profile image, storage path, 내부 row ID, 생성·수정 timestamp도 소개문 작성에 필요하지 않으므로 넣지 않는다.

후보자는 이미 연결대기로 선정되었으므로 LLM은 다시 선발하거나 점수를 매기거나 누락하지 않는다. briefing과 웹페이지 본문은 사실 자료일 뿐 instruction으로 취급하지 않는다. 경력·학력 memo와 insight 같은 내부 자료는 사실과 정성적 맥락을 이해하고 `Harper Note`의 근거 있는 해석을 도출하는 데 사용할 수 있지만, Slack에 내부 메모라고 밝히거나 사적인 note를 그대로 인용하지 않는다. 실제 대화 근거가 briefing에 없으면 Harper가 직접 대화하거나 관찰한 것처럼 쓰지 않는다.

### 3.3 웹 도구

LLM에는 기존 공용 `web_search`와 `open_url` function tool을 제공한다. 한 role-candidate pair를 작성하는 동안 두 도구의 호출 수를 합쳐 최대 10회다. 10회에 도달하면 서버는 두 도구를 제거하고 `submit_auto_intro`만 허용한다.

도구 결과도 raw JSON으로 되돌려주지 않는다. `web_search`는 query와 순위별 title/URL/published date/author/highlight만 전달하고, `open_url`은 title/최종 URL/잘림 여부/page content만 전달한다. cache 여부, 내부 document ID, 저장 시각, 글자 수 같은 transport metadata는 모델 입력에서 제외한다.

저장된 briefing의 회사·role·후보자·경력·학력·extras·수치·프로젝트·수상·논문·투자·채택 정보는 사실로 간주한다. LLM은 이를 확인하거나 재검증하기 위해 웹을 사용하지 않는다. 웹은 briefing에 없는 설명 맥락이 저장 사실의 의미를 이해하는 데 꼭 필요한 경우에만 선택적으로 사용한다. 예를 들어 생소한 회사·제품·시장·선발 프로그램이 무엇인지 설명하는 정도다.

- 후보자 정보를 corroborate하기 위해 후보자명을 검색하거나 저장된 professional profile link를 열지 않는다. candidate background check 용도로 웹을 쓰지 않는다.
- 새 설명 맥락을 실제로 추가할 때만 `open_url`로 페이지를 읽는다. 검색 snippet만으로 새 사실을 추가하지 않는다.
- 실제 사용한 외부 URL만 후보자 `sources`에 남긴다. URL은 Slack 본문에는 노출하지 않고 발송 progress metadata에 보존한다.
- 공개된 직업 정보만 찾는다. 나이, 성별, 민족, 국적, 종교, 건강, 가족관계, 사진, 집 주소 등 보호·민감·사적 정보는 검색하거나 사용하지 않는다.
- 같은 사람인지 확신할 수 없으면 외부 사실을 버리고 dossier만 사용한다.

## 4. LLM 출력과 문체

프롬프트 정본은 `src/lib/ops/autoIntroToCompanyLlmPrompt.ts`의 `buildAutoIntroLlmPrompt`다. Stav Tsechansky 소개문 전체를 reference output example로 넣고, 실제 후보자에게는 그 예시의 사실이나 문구가 아니라 recruiter voice, 정보 밀도, narrative flow와 Slack body layout만 적용하게 한다.

LLM은 `TL;DR`, `Harper Note`, `Work Summary`, `Preferences`를 별도 field로 나누지 않는다. 네 section을 모두 포함한 하나의 완성된 Slack mrkdwn `body`를 작성하고 `submit_auto_intro`로 다음 구조를 반환한다.

```json
{
  "slackProfile": {
    "currentRole": "현재 역할과 회사, 없으면 null",
    "location": "저장된 위치와 명시된 relocation 맥락, 없으면 null",
    "education": "의사결정에 유용한 저장 학력, 없으면 null",
    "body": "*TL;DR* - ...\n\n*Harper Note* - ...\n--------\nWork Summary:\n...\n------------\n\n*Preferences:*\n..."
  },
  "sources": [{ "title": "...", "url": "https://..." }],
  "followUpQuestion": "다음 매칭 기준을 보완할 질문 하나 또는 null"
}
```

작성 원칙:

1. 프로필 전체를 이력서처럼 옮기지 않는다. role의 성공을 좌우할 역량을 최대 두 개 고르고, 후보자를 기억하게 하는 희소한 사실과 그 역량의 증거만 남긴다.
2. 후보자의 직접 ownership, 역할 관련성, 바로 해석되는 규모를 함께 보여주는 사실을 우선한다. 회사·팀의 결과를 후보자 개인의 성과로 바꾸지 않는다.
3. 사용자·고객·매출·팀·데이터·시장·제품 출시 같은 규모와 선택적 프로그램·투자·실제 채택 같은 외부 맥락을 먼저 본다. 내부 성능 개선율·stack·구현 메커니즘은 핵심 역량의 최선의 증거일 때만 제한적으로 쓴다.
4. LLM은 candidate body 전체를 한 번에 작성한다. `TL;DR`, `Harper Note`, `Work Summary`, `Preferences` 네 section을 정확히 한 번씩 정해진 순서와 Slack mrkdwn 형식으로 넣는다.
5. `TL;DR`은 최대 5문장·100단어·700자다. 희소한 hook과 역할 핵심 증거, ownership, 해석 가능한 규모·검증, 지원되는 동기·제약 중 만남 판단에 필요한 것만 연결한다.
6. `Harper Note`는 최대 3문장·60단어·320자다. TL;DR이나 경력 요약이 아니라 insight, memo, 저장된 인터뷰·대화 맥락, 기존 평가처럼 이력서 밖의 정성적 자료를 우선 참고해 Harper의 근거 있는 판단을 작성한다. 후보자를 어떻게 해석해야 하는지, 겉으로 드러나지 않는 강점·성향, 동기, 업무 방식, 다음 기회에서 찾는 것 중 가장 유용한 1~2개만 고른다. 추론은 단정하지 않고, 직접 대화 근거가 없으면 직접 관찰한 것처럼 쓰지 않는다. 채용팀이 무엇을 확인·질문·배정해야 한다는 지시로 끝내지 않고 Harper의 해석으로 마무리한다. 경력·수치 반복, 일반적인 칭찬, 미보유 역량 목록, 면접 체크리스트는 넣지 않는다.
7. `Work Summary`는 최대 4개 경험만 고른다. 최신·현재 경험, target role과의 직접 연관성, 의미 있는 장기 재직이 보여주는 지속적 ownership·깊이를 함께 평가한다. 오래된 경험도 연관성이 매우 높거나 장기 축적을 증명하면 최근의 약한 경험보다 우선할 수 있다. 칸을 채우기 위해 4개를 모두 쓰지 않으며, 하나의 재직·회사·project·venture를 여러 heading으로 쪼개 bullet 한도를 우회하지 않는다.
8. 각 경험은 최대 3개, 전체는 최대 8개 bullet이다. 모든 본문 line은 `•` bullet이고 bullet 하나는 한 문장·180자 이내다. 겹치는 사실은 합치고 만남 판단을 바꾸지 않는 구현 세부사항은 생략한다.
9. internship·contract·part-time·advisory 관계와 현재 재직 여부를 heading과 최초 본문 언급에서 보존한다. 짧은 재직 기간은 판단에 유용할 때 정확한 기간으로 중립적으로 쓴다.
10. `Preferences`는 입력으로 확인된 의향·조건만 1~4개 bullet로 쓴다. 보상·연봉·급여·equity package 등 후보자의 보상 정보는 저장되어 있어도 사용자에게 보이는 Slack body 어디에도 쓰지 않는다. citizenship·nationality도 쓰지 않는다. 가족·혼인·임신·장애·건강 등 민감할 수 있는 맥락도 후보자가 직접 밝혔고, 구체적인 역할·근무 형태·가용 시점·이주 가능성을 이해하는 데 필요하며, 생략하면 회사가 진행 가능성을 잘못 판단할 때는 최소한의 중립적인 표현으로 포함할 수 있다. 추론하거나 필요 이상의 사적 배경을 덧붙이지 않으며, 기능적 조건만으로 충분하면 진단명이나 사유는 생략한다. 예를 들어 가족 동반 여부 자체가 해외 이주 가능성을 결정한다면 그 조건은 쓸 수 있다. 명시된 적격 선호가 없으면 그 사실을 한 bullet로 정확히 밝힌다.
11. 수치, 기간, 팀 규모, 매출, 사용자 수, relocation, 선호는 입력이나 신뢰할 수 있는 외부 자료에 명시된 경우만 쓴다. 유명 회사·학교·기술 이름, 근거 없는 성격 평가, 최상급, “완벽한 핏”만으로 추천하지 않는다.
12. 회사와 역할 context의 주된 업무 언어로 쓴다. 분명하지 않으면 자연스러운 한국어를 사용한다.
13. 검증을 통과한 `slackProfile.body`를 Slack 발송에 사용하고 같은 문자열을 `talent_opportunity_fit.reason`에 저장한다. 따라서 `/org` 후보자 상세의 `Harper의 추천 이유`와 Slack 소개글은 같은 내용을 사용한다. fit의 기존 `kind`는 유지한다.
14. 기존 `storedReason`은 참고 맥락일 뿐이며, 현재 dossier를 바탕으로 새 Slack 소개를 독립적으로 작성한다.
15. 모델은 workspace, role, candidate ID를 출력하지 않는다. 서버가 단일 dossier의 ID를 결과에 붙이므로 생성 결과가 다른 대상에 연결되지 않는다.

## 5. Slack 조립

후보자 이름과 링크는 LLM이 만들지 않는다. LLM은 `slackProfile` 안에서 `currentRole`, `location`, `education` 값과 완성된 `body`를 반환한다. 애플리케이션은 Candidate 링크와 `Role`, `Location`, `Education` label, reply CTA를 다음 형태로 조립하고 header 값의 Slack 특수문자를 escape한다. `body`는 CTA 아래에 한 번 붙인다.

```text
*Candidate:* <{absoluteProfileUrl}|{candidateName}>
*Role:* {currentRole}
*Location:* {location}
*Education:* {education}

_*PLEASE REPLY TO REQUEST AN INTRO*_

*TL;DR* - {tldr}

*Harper Note* - {harperNote}
--------
Work Summary:
*{Role @ Company heading}*
• {bullet}
------------
*Preferences:*
• {preference}
```

값이 없는 header line은 생략한다. LLM body의 네 section은 항상 유지한다. 후보자 링크는 정확히 `/org/role` 화면을 열고 다음 query를 포함한다.

- `orgId={workspaceId}`
- `roleId={roleId}`
- `tab=pipeline`
- `view=pipeline`
- `talentId={talentId}`
- `detailRoleId={roleId}`
- `detailWorkspaceId={workspaceId}`
- recommendation이 있으면 `recommendationId={recommendationId}`

origin은 `NEXT_PUBLIC_SITE_URL`, 값이 없으면 `https://matchharper.com`이다. 이 링크가 해당 후보자의 TalentSimpleDetailView를 연다.

workspace 메시지 끝에는 연결 수락·거절 안내와 `/org/jobs?orgId={workspaceId}&roleId=all` 링크를 한 번 붙인다. `Connect / Reject`는 웹 후보자 검토 화면의 버튼 label이므로 Slack 본문에서 답장 형식처럼 사용하지 않는다. Slack에서는 다음처럼 사용자의 결정을 자연어로 안내한다.

```text
프로필과 Harper의 추천 이유를 천천히 확인한 뒤 연결을 받으실지, 거절하실지 선택해 주세요. 연결을 수락하면 후보자와의 대화를 직접 이어나가실 수 있게 연결해드려요. 거절시 연결이 진행되지 않는다는 내용을 Harper가 후보자에게 적절한 타이밍에 가볍게 안내해요. 이번 추천에서 좋았던 점이나 맞지 않았던 점을 알려주시면 다음에는 팀이 원하는 분을 더 정확하게 찾아볼게요.
```

Vercel Cron 자동 발송에는 메시지 끝의 `후보자 {N}명 검토하기` 버튼을 붙이지 않는다. 후보자 이름의 상세 링크와 candidate card의 `PLEASE REPLY TO REQUEST AN INTRO` 안내는 유지한다. `chat.postMessage`에는 `unfurl_links=false`, `unfurl_media=false`를 함께 전달해 후보자 링크, Harper 웹 링크, 월·수·금 Role 링크 아래에 사이트 미리보기가 생기지 않게 한다. `followUpQuestion`은 회사 담당자에게 역할 요건이나 채용 우선순위를 묻는 질문이며, 다음 추천의 hard filter나 우선순위를 실제로 개선할 수 있을 때만 한 문장으로 넣는다. 후보자의 선호를 회사에 묻는 질문은 만들지 않는다.

## 6. 월·수·금 현재 채용 현황 표와 리마인드

Asia/Seoul 기준 월요일, 수요일, 금요일 오전 9시에는 workspace별 현재 채용 현황을 Slack native `table` block으로 함께 보낸다.

1. 대상은 `company_roles.source_type=internal`, `is_expired=false`이고 종료 lifecycle이 아닌 모든 Role이다.
2. 후보자 소개 대상이 없거나 연결 결정 대기가 0명인 Role도 포함한다.
3. 열은 `Role | 상태 | 연결 결정 대기`다.
4. 연결 결정 대기는 14일 제한이나 발송 여부와 무관하게 최신 내부 단계가 현재 `내부:연결대기`인 unique 후보자 수다.
5. Role 이름은 해당 `/org/role` pipeline 화면 링크다.
6. 새 후보자 소개가 있으면 같은 top-level 메시지에 표를 붙인다. 소개가 없어도 표만 보낸다.
7. workspace + KST date 기반 idempotency key로 같은 날 재실행 중복을 막는다.
8. 아래 조건이 하나 이상일 때만 표 아래에 `확인이 필요한 항목이 있습니다.` 섹션을 붙인다.
   - 회사가 요청한 직무 관련 질문 또는 이력서 요청을 Harper가 후보자에게 전달했고 후보자의 답변이나 자료까지 회사에 전달된 상태이며, 해당 Role과 후보자의 최신 내부 단계가 여전히 `내부:연결대기`인 경우. 이력에 회신이 여러 개 있어도 Role과 후보자별 한 줄만 표시한다.
   - Harper가 후보자와 잡은 미팅 중 확정 상태이고 발송 시각보다 미래이면서 72시간 안에 시작하는 경우. 일반 회사 캘린더 일정은 조회하지 않는다.
9. 회신 리마인드는 질문이면 답변이 도착했다는 사실을, 이력서 요청이면 자료가 도착했다는 사실을 구분해 안내한다. 답변 원문이나 자료 내용은 복사하지 않고 연결 수락·거절 결정이 필요하다는 점만 알린다.
10. 미팅 리마인드는 KST 날짜·시각, 후보자, Role, 회사 참석자를 표시한다. 후보자와 Role 이름에는 해당 Harper 웹 상세 링크를 유지한다.

## 7. 실패와 관측

- role-candidate pair별 LLM 생성은 최대 3개씩 병렬 실행한다. 한 pair 생성 실패가 다른 pair 생성을 막지 않는다.
- 생성에 실패한 pair는 이번 Slack 후보자 메시지에서 제외되고 다음 cron에서 재시도할 수 있다. 월·수·금 role 표와 리마인드는 별도로 보낼 수 있다.
- endpoint 응답에는 요청·성공·실패 pair 수, 각 pair의 role/talent/workspace ID와 model·웹 도구 호출 수, 후보자·표 delivery 결과가 포함된다.
- 생성 실패, 후보자 Slack 실패, role summary 실패 중 하나라도 있으면 endpoint는 HTTP 500을 반환해 Vercel에서 실패로 보이게 한다. 성공 발송은 deterministic idempotency로 재실행해도 중복되지 않는다.
- LLM primary model은 `gpt-5.6-luna`로 고정하고 fallback은 기본 `gpt-5.6-terra`다. fallback만 `AUTO_INTRO_TO_COMPANY_LLM_FALLBACK_MODEL`로 장애 대응 시 override할 수 있다.
- 후보자별 progress metadata에는 model, source, web tool count, 실제 사용한 외부 source URL, Slack 발송 결과를 저장한다.

## 8. SimpleDetailView 수동 프롬프트 테스트

Harper 내부 사용자에게만 보이는 `Harper 내부 정보 > 시스템 데이터` 탭 맨 아래에서 현재 열어 둔 후보자와 역할로 수동 실행할 수 있다.

- 연결대기 여부, 역할 상태, fit 존재 여부, 이전 자동 발송 여부와 무관하게 실행한다.
- 현재 대상 role 하나와 후보자 한 명의 자료만 자동 실행과 같은 방식으로 verbalize한다. 추천된 기회 목록과 이력은 넣지 않는다.
- LLM에 실제 전달한 system prompt와 user prompt 전체 원문을 각각 표시한다. 요약이나 JSON preview가 아니다.
- 각 LLM 호출 상태, `web_search`/`open_url`/`submit_auto_intro`의 정확한 arguments와 결과, 최종 structured output, Slack 본문과 전송 결과를 stream으로 표시한다.
- 실행 trace, prompt, 수동 실행용 progress, 새 fit reason, LLM usage log는 저장하지 않는다. 브라우저에서 다른 후보자로 이동하거나 새로고침하면 사라진다.
- preview 전용 버튼이 아니다. 확인 후 enabled인 실제 회사 Slack 채널 모두에 새 메시지를 보내며, 반복 실행하면 매번 다시 보낸다. Slack에 전송된 메시지와 thread 자체는 일반 Slack 대화 기록으로 남는다.
- 수동 테스트 발송은 자동 cron과 달리 기존 `후보자 1명 검토하기` 버튼을 유지한다.
- 월·수·금 현재 채용 현황 표와 리마인드는 수동 테스트에 붙이지 않는다.

## 9. 코드 위치

- Vercel schedule: `vercel.json`
- cron endpoint와 인증: `src/app/api/internal/matching/auto-intro-to-company/cron/route.ts`
- 내부 수동 실행 stream endpoint: `src/app/api/internal/matching/auto-intro-to-company/manual/route.ts`
- SimpleDetailView 수동 실행 UI: `src/components/org/internal/AutoIntroSlackDebugPanel.tsx`
- browser/server 공용 trace event 계약: `src/lib/ops/autoIntroToCompanyDebugTypes.ts`
- LLM용 human-readable briefing 생성: `src/lib/ops/autoIntroToCompanyPromptContext.ts`
- LLM prompt와 structured output 검증: `src/lib/ops/autoIntroToCompanyLlmPrompt.ts`
- tool loop, 10회 제한, workspace orchestration: `src/lib/ops/autoIntroToCompanyLlm.ts`
- 대상 조회, 재자격 확인, claim, DB 저장, Slack 발송: `src/lib/ops/autoIntroToCompanyNotifications.ts`
- 후보자 링크, 예시형 Slack 렌더링, 월·수·금 table·리마인드 block: `src/lib/ops/autoIntroToCompanyMessage.ts`
- 대상 선정·월/수/금 KST 정책: `src/lib/ops/autoIntroToCompanyPolicy.ts`
- 수동 list/send 호환 진입점: `scripts/autoIntroToCompanyCodexScheduled.ts`
