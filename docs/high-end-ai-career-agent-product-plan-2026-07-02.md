# Harper High-end AI Career Agent 제품 제안

작성일: 2026-07-02  
범위: Harper `/career` 제품, Supabase DB 대화/행동 집계, 외부 시장/경쟁 제품 리서치

## 1. 결론

Harper가 유저에게 "나의 이직을 완전히 도와주는 High-end AI Career Agent"처럼 느껴지려면, 공고 추천 정확도를 조금 더 올리는 것만으로는 부족하다. 유저가 체감하는 고급감은 추천 자체보다 **Harper가 내 이직 전체를 운영하고 있다는 확신**에서 나온다.

따라서 다음 구현 축은 아래 5개다.

1. **Career Mission Control**: 유저의 목표, 제약, 준비도, 추천, 지원, 연결, 면접, 오퍼를 한 화면에서 관리하는 command center.
2. **Opportunity Diligence & Action Plan**: 각 추천마다 "왜 맞는지", "무엇이 리스크인지", "지금 무엇을 해야 하는지"를 보여주는 기회별 작전 카드.
3. **Application / Intro Packet Builder**: 선택한 기회별로 이력서 버전, 커버레터, LinkedIn/리크루터 메시지, Harper intro brief를 생성하고 승인받는 기능.
4. **Pipeline Agent**: 저장 이후 `지원함 -> 연락함 -> 면접 -> 팔로업 -> 오퍼/종료`까지 next action, due date, 상태 업데이트를 관리하는 에이전트.
5. **Trust & Consent Layer**: 내부 연결/외부 공고/회사 공유 범위/익명성/진행 상태를 투명하게 보여주는 신뢰 레이어.

한 줄로 말하면:

> Harper는 job board나 resume optimizer가 아니라, 후보자 편에서 일하는 executive recruiter + career chief of staff가 되어야 한다.

## 2. 왜 지금 이 방향인가

### 외부 시장

- Indeed는 2025년 Career Scout를 "job seeker를 사람처럼 이해하는 AI career coach"로 포지셔닝했다. skills, commute, schedule, salary처럼 resume 밖의 정보를 학습해 job discovery, preparation, landing을 돕는다고 설명하며, 내부 데이터 기준 Career Scout 사용자가 관련 job을 찾고 지원하는 속도가 7배 빠르고, hire 가능성이 38% 높다고 주장한다. ([Indeed FutureWorks 2025](https://www.indeed.com/lead/indeed-talent-scout-futureworks-2025))
- ZipRecruiter 2026 Q2 New Hire Survey는 AI tool을 사용한 신입사자가 non-user보다 offer를 두 배 받았고, median 기준 16 applications, 5 interviews, 2 offers, 5 weeks가 현재 job search의 기본 effort라고 보고했다. ([ZipRecruiter New Hire Survey 2026 Q2](https://www.ziprecruiter-research.org/workplace-trends/new-hire-survey-2026-q2))
- LinkedIn Future of Recruiting 2025는 AI가 recruiter의 반복 업무를 줄이면서 recruiter가 더 strategic talent advisor / career coach 역할로 이동한다고 설명한다. ([LinkedIn Future of Recruiting 2025](https://business.linkedin.com/hire/resources/future-of-recruiting))
- LinkedIn Economic Graph의 skills-based hiring 리포트는 과거 title이 아니라 skill overlap으로 talent pool을 보면 전세계 median 6.1배, AI role은 8.2배까지 pool이 커진다고 분석한다. Harper도 "이전 직함과 정확히 같은 공고 추천"을 넘어 skill transfer와 career transition을 설명해야 한다. ([LinkedIn Skills-Based Hiring 2025 PDF](https://economicgraph.linkedin.com/content/dam/me/economicgraph/en-us/PDF/skills-based-hiring-march-2025.pdf))
- 반대로 SHRM은 AI resume/cover letter 남용으로 지원서가 비슷해지고, employer와 candidate 모두 신뢰가 깨지는 "AI arms race"를 지적한다. 즉 Harper가 mass auto-apply처럼 보이면 high-end가 아니라 low-quality automation처럼 느껴질 위험이 있다. ([SHRM, Recruitment Is Broken](https://www.shrm.org/topics-tools/news/hr-trends/recruitment-is-broken))

### 경쟁 제품 baseline

Teal, Huntr, Careerflow, Jobscan은 이미 job tracker, resume tailoring, cover letter, keyword match, Chrome extension, autofill, interview tracker를 묶고 있다.

- Teal: AI resume, job tracker, job board bookmark, job insight, negotiation guidance. ([Teal](https://www.tealhq.com/))
- Huntr: job tracker, tailored resume, autofill, contact tracker, interview tracker, metrics. ([Huntr](https://huntr.co/))
- Careerflow: browser extension에서 job save, autofill, keyword match, LinkedIn/Indeed/Glassdoor/company career page 연동. ([Careerflow Browser Extension](https://www.careerflow.ai/browser-extension))
- Jobscan: resume-based job matching, tracker, resume tailoring, interview scheduling/follow-up를 한 platform에서 제공. ([Jobscan Jobs](https://www.jobscan.co/job-search))

따라서 Harper가 단순히 "좋은 공고를 찾고 이력서를 고쳐주는 앱"이 되면 이미 crowded category다. Harper의 차별점은 **내부 연결, candidate-side representation, 신뢰 가능한 판단, 추천 이후 실행 관리**여야 한다.

## 3. DB에서 보이는 현재 신호

개인 식별 정보나 원문 대화는 문서에 넣지 않았다. 아래는 2026-07-02 기준 DB 집계와 regex 기반 근사치다.

### 제품 사용량

- `talent_users`: 1,071명
- `talent_conversations`: 1,263개
- `talent_messages`: 48,531개
- `talent_opportunity_recommendation`: 9,874개
- `opportunity_discovery_run`: 2,899개
- `career_email_messages`: 2,425개
- `email_reply_jobs`: 95개

### 대화 유형

- user `chat`: 12,502개
- user `opportunity_feedback_note`: 3,459개
- user `call_transcript`: 3,261개
- user `profile_submit`: 1,023개

유저는 이미 단순 온보딩보다 훨씬 많은 정보를 대화로 제공하고 있다. 특히 추천 반응, 조건 변경, 지원 상태, 외부 공고 요청, 내부 연결 질문이 반복된다.

### 최근 30일 주요 니즈

최근 30일 user message 18,351개 중 regex 기반 근사:

- 외부 공고, LinkedIn, 공고 관련 언급: 4,085회
- 내부 연결, intro, Harper network 관련 언급: 539회
- 정기 알림, 이메일, 주기적 업데이트 관련 언급: 629회
- 지원, 탈락, 합격, 면접, 오퍼 등 outcome 관련 언급: 546회

핵심은 "추천해줘"가 아니라 "추천 이후 내가 무엇을 해야 하는지, Harper가 실제로 어디까지 해주는지, 진행 상태가 무엇인지"다.

### 추천 히스토리

`talent_opportunity_recommendation` 기준:

| Type | Recommendations | Viewed | Clicked | Staged | Feedback |
| --- | ---: | ---: | ---: | ---: | ---: |
| external_jd | 9,629 | 3,599 | 886 | 1,446 | 3,374 |
| internal_recommendation | 245 | 143 | 69 | 109 | 177 |

`saved_stage`는 아직 `saved` 중심이다.

| Stage | Count |
| --- | ---: |
| saved | 1,347 |
| connected | 111 |
| applied | 41 |
| closed | 31 |
| hidden | 25 |

이는 Harper가 "추천은 많이 하는데, 지원/연결/면접/오퍼까지 운영한다"는 체감은 아직 약할 수 있음을 뜻한다.

### 현재 강점

- resume / LinkedIn / profile ingestion 기반이 있다.
- `talent_insights`는 732 rows, 평균 9.07 keys로 유저별 선호/조건을 어느 정도 저장하고 있다.
- `opportunity_discovery_run`과 periodic refresh가 이미 동작한다.
- post-onboarding chat tools는 web search, open URL, external JD recommendation, internal role lookup, priority review, role context, feedback update, company research, activity read, setting/profile update를 포함한다.
- `career_email_messages`와 `email_reply_jobs`가 있어 이메일 기반 re-engagement와 reply 처리 기반도 있다.

### 현재 약점

- 추천 이후 상태 모델이 얕다. `saved/applied/connected/closed/hidden`만으로는 실제 이직 pipeline을 표현하기 어렵다.
- external JD와 Harper-connected internal opportunity의 차이가 유저에게 항상 선명하지 않다.
- 유저가 각 기회에 대해 "지금 해야 할 next action"을 받는 구조가 약하다.
- resume/LinkedIn을 가지고 있어도, 특정 role에 맞춘 application packet은 아직 제품의 중심이 아니다.
- internal 연결은 high-end perception의 핵심인데, 실제 연결 상태/회사 측 응답/Harper가 뒤에서 하는 일을 더 투명하게 보여줄 필요가 있다.

## 4. 제품 원칙

### 4.1 High-end는 자동화량이 아니라 판단력이다

사용자는 더 많은 공고나 더 빠른 자동지원을 high-end로 느끼지 않는다. 오히려 최근 채용 시장에서는 AI mass-apply가 신뢰를 훼손하고 있다. Harper는 "많이 뿌리는 agent"가 아니라 "좋은 기회를 선별하고, 내 서사를 회사가 이해할 수 있게 만드는 agent"여야 한다.

### 4.2 Harper는 추천자가 아니라 operator다

현재 제품은 "추천을 만들고 저장한다"에 강하다. 다음 단계는 "선택한 기회가 결과로 이어질 때까지 운영한다"다.

좋은 답변/화면은 항상 다음을 포함해야 한다.

- 판단: 왜 이 기회가 맞는가
- 리스크: 무엇이 불확실한가
- 액션: 지금 무엇을 해야 하는가
- 책임 주체: 유저가 할 일과 Harper가 할 일
- 일정: 언제 다시 확인하는가
- 공유 범위: 회사에 무엇이 전달되는가

### 4.3 내부 연결은 black box가 되면 안 된다

유저가 internal opportunity를 수락했을 때 "이제 실제로 진행되나?"가 가장 큰 불안이다. Harper-connected opportunity는 외부 공고와 다르게 상태, 예상 다음 단계, 회사 전달 준비도, 누락 정보, consent를 보여줘야 한다.

### 4.4 외부 공고도 단순 링크가 아니라 diligence가 있어야 한다

유저가 이미 LinkedIn, Indeed, company career page를 볼 수 있다면 Harper는 아래를 더 해줘야 한다.

- posting freshness / liveness 확인
- 중복 추천 방지
- 이미 지원/탈락/진행 중인 회사 반영
- JD의 모호함, seniority mismatch, compensation/location/visa 리스크 표시
- 왜 지금 지원해야 하는지 또는 왜 보류해야 하는지 판단
- apply packet 생성

## 5. 구현 제안

### P0. Career Mission Control

**목표**  
Home을 "대화 시작 화면"에서 "내 이직 작전실"로 바꾼다.

**유저가 보는 것**

- 현재 Career Mandate: 목표 role, target company type, location/remote/visa, compensation, timing, dealbreakers.
- Search Mode: actively applying / passively open / internal only / external periodic / paused.
- Intro Readiness: 회사에 소개 가능한 상태인지, 부족한 정보가 무엇인지.
- This Week: Harper가 찾은 기회, 걸러낸 기회, 기다리는 응답, 유저 next action.
- Pipeline: Saved, Preparing, Applied, Contacted, Interviewing, Offer, Closed.

**왜 high-end로 느껴지는가**

유저가 "Harper가 나를 이해하고 있고, 내 이직을 운영 중이다"라고 즉시 느낀다. 채팅을 다시 열어 물어보지 않아도 현재 상태가 보인다.

**구현 메모**

- 기존 `talent_setting`, `talent_insights`, `talent_activity_events`, `talent_opportunity_recommendation`, `opportunity_discovery_run`을 조합해 v1을 만들 수 있다.
- 장기적으로는 `talent_career_mandate`를 별도 table로 분리하는 편이 좋다.
- HomePanel의 recent opportunity 섹션을 "작전실"로 확장한다.

### P0. Opportunity Action Plan Card

**목표**  
추천 카드가 단순 "좋아요/싫어요/저장"이 아니라, 기회별 action plan을 갖게 한다.

**카드 구성**

- Fit thesis: 이 기회가 맞는 이유 2-3개.
- Risk / unknown: Harper가 아직 모르는 것.
- Next action: `지원 패키지 만들기`, `회사에 연결 요청`, `리크루터 메시지 작성`, `면접 준비`, `보류`.
- Deadline: early apply가 중요한 경우 "24시간 내 지원 권장".
- Evidence: Harper가 사용한 내 경험/성과/선호.
- Source truth: external public JD인지, Harper-connected internal인지.

**DB 근거**

external recommendations는 많지만 `applied` stage는 41개로 작다. 추천에서 행동으로 넘어가는 step이 더 강해야 한다.

**구현 메모**

- 기존 `fit_summary`, `fit_reasons`, `tradeoffs`, `preference_fit`, `evidence`를 카드에 더 적극적으로 노출한다.
- `saved_stage`와 별도로 `next_action`, `action_due_at`, `action_owner`를 저장하는 `talent_opportunity_action` table을 추가한다.

### P0. Trust & Consent Center

**목표**  
Harper가 "진짜 연결해주는가", "내 정보가 어디에 공유되는가", "외부 공고와 내부 기회가 어떻게 다른가"에 명확히 답한다.

**필수 UI**

- Internal connected opportunity: 회사에 공유 전 user approval 필요 여부, 현재 company-side status, Harper가 준비 중인 brief.
- External JD: Harper가 직접 회사와 연결하지 않는 public application임을 명확히 표시.
- Share preview: 회사에 전달될 candidate brief preview.
- Privacy toggles: 익명 profile, 회사명 숨김, 현재 회사/민감 조건 share 금지.
- Activity log: "Harper가 이 기회에 대해 한 일".

**왜 high-end로 느껴지는가**

고급 리크루터는 후보자의 정보 공유 범위를 함부로 넘기지 않는다. 신뢰 레이어는 기능이 아니라 브랜드의 핵심이다.

### P1. Application / Intro Packet Builder

**목표**  
유저가 기회를 선택하면 Harper가 바로 "지원 가능한 패키지"를 만든다.

**패킷 구성**

- Role-specific resume version.
- Cover letter or short application note.
- LinkedIn recruiter message / referral request.
- Harper intro brief for internal opportunities.
- 5-bullet proof map: JD requirement -> user evidence -> wording.
- ATS / keyword gap, 단 keyword stuffing이 아니라 "증거 기반"으로 제안.

**경쟁 대비**

Teal/Huntr/Jobscan도 resume tailoring과 cover letter를 제공한다. Harper는 여기에 "내가 왜 이 role에 설득력 있는 후보인지"라는 narrative와 internal intro brief를 붙여야 한다.

**구현 메모**

- `talent_application_packet` table 추가:
  - `recommendation_id`
  - `resume_variant_text` 또는 generated document reference
  - `cover_letter_text`
  - `outreach_message_text`
  - `harper_intro_brief`
  - `proof_points`
  - `approved_at`
  - `sent_or_used_at`
- v1은 PDF/DOCX export보다 text preview + copy/download로 시작해도 된다.

### P1. Pipeline Agent

**목표**  
Harper가 "지원 이후"를 챙긴다.

**상태 모델**

기존:

```text
saved / applied / connected / closed / hidden
```

제안:

```text
discovered
shortlisted
packet_needed
packet_ready
user_approved
applied
recruiter_contacted
waiting_company
screen_scheduled
interviewing
followup_due
offer
negotiating
accepted
rejected
closed
```

**유저 경험**

- "오늘 해야 할 일"이 생긴다.
- 지원 후 3/5/7일 follow-up draft를 자동 준비한다.
- 탈락/무응답/면접 결과를 입력하면 다음 추천과 packet이 개선된다.
- email reply를 ingest해 상태를 자동 업데이트한다.

**구현 메모**

- `career_email_messages`와 `email_reply_jobs`를 pipeline state update에 연결한다.
- Gmail/LinkedIn 직접 연동이 없어도 v1은 "이메일 붙여넣기 / 결과 입력"으로 충분하다.
- 이후 Chrome extension 또는 Gmail connector로 확장한다.

### P1. Interview & Assessment Coach

**목표**  
지원/연결 이후 면접 대비까지 이어진다는 느낌을 만든다.

**기능**

- Role-specific interview plan.
- Company-specific likely questions.
- User evidence 기반 STAR answer bank.
- Mock interview voice/text.
- Interview debrief: 끝나고 무슨 질문을 받았는지 기록하면 thank-you note, follow-up, 다음 면접 전략 생성.
- Technical / business / leadership / culture-fit track 분리.

**DB 근거**

면접/준비 관련 user message가 regex 기준 693회 이상 잡힌다. 또한 ZipRecruiter는 2026 Q2 기준 median 5 interviews가 job search의 기본 effort라고 보고했다. 면접 대비는 주변 기능이 아니라 core flow여야 한다.

### P1. Weekly Agent Report

**목표**  
Harper가 계속 일하고 있다는 신호를 매주 준다.

**형식**

- 이번 주 검토한 기회 수.
- 추천한 기회와 제외한 이유.
- 새로 바뀐 내 mandate.
- 지금 apply하면 좋은 기회.
- 기다리는 응답.
- 다음 3가지 action.

**중요한 점**

이미 periodic refresh가 많이 돈다. 하지만 유저에게 "Harper가 무엇을 했는지"가 충분히 보이지 않으면 비용 대비 체감가치가 낮다. periodic run의 산출물을 report 형태로 묶어야 한다.

### P2. Browser / Job Page Companion

**목표**  
유저가 LinkedIn, Indeed, company career page에서 보는 공고를 Harper workspace로 가져온다.

**기능**

- Save to Harper.
- JD vs my mandate fit check.
- 이미 추천/지원/탈락한 회사인지 확인.
- Packet 생성.
- Pipeline stage update.

**왜 필요한가**

경쟁 제품들은 모두 browser extension을 강하게 밀고 있다. Careerflow는 extension 안에서 save, autofill, keyword match를 제공하고, Teal/Huntr도 job board bookmark/clipper를 강조한다. Harper가 external job search를 직접 다 먹지 못한다면, 유저가 이미 탐색하는 곳에 붙어야 한다.

**주의**

auto-apply를 핵심 메시지로 밀지 않는다. Harper extension은 mass apply tool이 아니라 "quality apply companion"이어야 한다.

### P2. Offer & Negotiation Desk

**목표**  
이직의 마지막 구간까지 돕는다.

**기능**

- Offer comparison: salary, equity, bonus, relocation, visa, remote, growth, risk.
- Negotiation strategy and scripts.
- Counteroffer decision.
- Start date / notice period / relocation checklist.
- Accept/decline email draft.

**왜 high-end인가**

고급 career agent는 추천과 면접만 하지 않는다. 최종 선택, 협상, 전환 리스크까지 함께 판단한다.

## 6. 추천 구현 순서

### 0-2주: High-end perception quick win

1. Home에 Career Mission Control v1 추가.
2. History detail에 Opportunity Action Plan 섹션 추가.
3. internal vs external opportunity label/copy를 전면 정리.
4. "Harper가 아는 것 / 모르는 것 / 다음에 할 일" summary 추가.
5. Internal 수락 후 진행 상태와 consent preview 노출.

이 단계는 새 LLM 기능보다 UI/state 재배치가 핵심이다. 이미 DB와 tool이 있는 만큼 빠르게 체감이 바뀐다.

### 2-6주: 추천 이후 실행 관리

1. `talent_opportunity_action` 또는 `career_pipeline_items` table 추가.
2. saved stage를 pipeline stage로 확장.
3. 지원/연결/팔로업 next action 생성.
4. Application / Intro Packet Builder v1.
5. Email paste/import 기반 상태 업데이트.

### 6-10주: Agentic loop

1. Weekly Agent Report.
2. Periodic refresh 결과를 "검토/추천/제외"로 보여주기.
3. Interview plan + debrief.
4. 추천 quality feedback을 다음 packet/recommendation에 연결.

### 10주 이후: distribution and defensibility

1. Browser companion.
2. Gmail/Calendar/LinkedIn workflow 연동.
3. Offer & negotiation desk.
4. Human concierge / expert review tier.

## 7. 데이터 모델 제안

### `talent_career_mandate`

유저의 현재 이직 mandate를 구조화한다.

- `talent_id`
- `mode`: active / passive / paused / internal_only
- `target_roles`
- `target_company_types`
- `must_haves`
- `dealbreakers`
- `location_constraints`
- `remote_preference`
- `visa_relocation`
- `compensation_target`
- `timing`
- `privacy_rules`
- `freshness_checked_at`
- `confidence`

현재 `talent_insights.content`에 흩어진 정보를 user-facing summary와 agent planning용으로 승격한다.

### `talent_opportunity_action`

각 recommendation의 next action을 저장한다.

- `recommendation_id`
- `stage`
- `next_action`
- `action_owner`: user / harper / ops / company
- `due_at`
- `status`: open / done / skipped / blocked
- `source`: user / agent / ops / email
- `last_activity_at`

### `talent_application_packet`

지원/소개 패키지.

- `recommendation_id`
- `packet_type`: external_application / internal_intro / recruiter_outreach / referral
- `proof_points`
- `resume_variant`
- `cover_letter`
- `outreach_message`
- `intro_brief`
- `risk_notes`
- `approved_at`
- `used_at`

### `talent_interview_case`

면접 대비/결과.

- `recommendation_id`
- `interview_type`
- `scheduled_at`
- `prep_plan`
- `answer_bank`
- `debrief_notes`
- `followup_draft`
- `outcome`

## 8. 제품 카피 방향

피해야 할 표현:

- "공고를 찾아드렸어요."
- "저장해둘게요."
- "지원해보세요."
- "연결 요청을 저장했습니다."

좋은 표현:

- "이 기회는 지금 프로필 기준으로 strong fit이지만, seniority와 remote 조건은 확인이 필요합니다."
- "지원하려면 이력서에서 A/B/C 경험을 앞으로 빼는 편이 좋습니다. 제가 role-specific packet을 준비해둘게요."
- "이 기회는 external public JD라 Harper가 회사에 직접 전달하지는 않습니다. 대신 지원 문서와 follow-up까지 같이 준비할 수 있습니다."
- "이 internal 기회는 유저 승인 후 회사에 전달됩니다. 전달 전 preview에서 공유 범위를 확인할 수 있습니다."
- "다음 action은 두 가지입니다. 오늘은 packet 확인, 3일 뒤에는 follow-up 여부 확인입니다."

## 9. 성공 지표

Product metric:

- 추천 카드에서 action 생성률
- action completion rate
- saved -> packet_ready conversion
- packet_ready -> applied / connected conversion
- applied / connected -> interview conversion
- internal accepted -> company delivered median time
- status question 감소율
- "Harper가 실제로 무엇을 해주나요?"류 질문 감소율

Trust metric:

- internal opportunity consent preview open rate
- share preview approval rate
- privacy setting edit rate
- recommendation unsubscribe / pause rate
- negative feedback reason 중 "not relevant", "already applied", "not real/open" 비중

Quality metric:

- 추천 1건당 viewed/clicked/feedback ratio
- user-specified constraints violation rate
- stale/closed job recommendation rate
- application outcome captured rate
- interview generated from Harper-originated opportunity

## 10. 구현하지 말아야 할 것

### Full auto-apply first

시장 리서치상 AI mass application은 recruiter 신뢰를 떨어뜨리고 지원서를 비슷하게 만든다. Harper의 high-end positioning과 맞지 않는다. 자동지원은 나중에 하더라도 user-approved, high-fit, high-quality packet 기반이어야 한다.

### "AI career coach"만 강조하는 범용 상담

상담은 차별화가 약하다. Harper는 상담보다 실제 opportunity, packet, intro, pipeline, follow-up을 잡아야 한다.

### 공고 수 늘리기

유저는 이미 LinkedIn과 여러 job board를 쓴다. Harper가 더 많은 링크를 보내는 것보다 적은 기회를 더 강하게 판단하고 실행까지 연결하는 편이 high-end다.

## 11. 최종 권장안

가장 먼저 만들 것은 **Career Mission Control + Opportunity Action Plan + Trust/Consent Center**다.

이 세 가지가 붙으면 Harper의 현재 강점인 대화, 추천, periodic search, internal opportunity, email reply 기반이 하나의 제품 경험으로 묶인다. 이후 Application Packet Builder와 Pipeline Agent를 붙이면 유저는 Harper를 "공고 추천 챗봇"이 아니라 "내 이직을 실제로 굴리는 agent"로 인식할 가능성이 높다.

핵심 메시지는 이것이다.

> Harper is not here to help you apply to more jobs. Harper is here to help you make better moves, with better evidence, better timing, and better representation.

