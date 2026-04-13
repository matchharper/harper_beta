# Viral Loop Strategy

이 문서는 Harper의 유저 관점 서비스 중 아래 두 영역에서 제품 주도형 바이럴 루프를 어떻게 설계할지 정리한 기획 메모다.

1. 회사가 search를 사용해 인재를 찾는 흐름
   - 진입: `/search`
   - 사용: `/my`, shortlist, match, scout
2. 후보자가 가입하고 대화하며 기회를 관리하는 흐름
   - 진입: `/network`
   - 사용: `/career`, history, profile, chat

`/index`는 회사의 채용 요청 유입 페이지에 더 가깝기 때문에 이 문서에서는 주 바이럴 대상이 아니라 상단 퍼널 보조 채널로 본다.

## 1. 목표

핵심 목표는 "공유" 자체가 아니라 아래 두 가지다.

- 좋은 유저가 좋은 유저를 자연스럽게 데려오게 만들기
- 공유받은 사람이 단순 방문이 아니라 바로 제품의 핵심 경험을 밟게 만들기

즉, Harper의 바이럴은 대중적 확산보다 "고의도, 고신뢰, 고품질 초대"에 최적화되어야 한다.

## 2. 현재 흐름 해석

### 회사 쪽

- `/search`는 problem-aware 회사가 처음 들어오는 랜딩이다.
- `/my`는 실제 검색, 후보 검토, 폴더 저장, 추천 검토가 일어나는 제품 영역이다.
- 이미 shortlist folder 공유 기능이 일부 존재한다.
- 즉 회사 쪽은 "검색 결과를 혼자 보는 툴"에서 "채용팀이 함께 검토하는 협업 툴"로 확장할 여지가 크다.

### 후보자 쪽

- `/network`는 포지션 탐색과 등록 유입을 담당한다.
- `/network?recommended=...` 구조로 포지션 단위 링크 공유가 이미 존재한다.
- `/career_login`, `/career`는 가입 후 대화, preference, recent opportunity, history 관리로 이어진다.
- 즉 후보자 쪽은 "개인 계정"보다 "기회를 매개로 한 신뢰 기반 네트워크"로 확장할 여지가 크다.

## 3. 바이럴 설계 원칙

### 3.1 무작정 많이 뿌리게 하지 않는다

Harper는 네트워크의 질이 중요하다. 저품질 초대나 보상형 스팸은 장기적으로 브랜드를 해친다.

### 3.2 공유 객체가 분명해야 한다

사람은 제품 자체보다 아래와 같은 구체적 객체를 공유한다.

- 회사: 후보자 묶음, 시장 맵, 검색 결과, interview slate
- 후보자: 특정 기회, 추천 링크, 내 프로필, 친구에게 맞는 포지션

### 3.3 공유받는 사람이 바로 행동할 수 있어야 한다

공유 링크를 열었을 때 단순 랜딩이 아니라 아래 중 하나로 바로 이어져야 한다.

- 후보 보기
- 의견 남기기
- 내 계정 만들기
- 같은 검색 시작하기
- 내 친구/동료 추천하기
- 바로 Harper와 대화 시작하기

### 3.4 보상은 현금보다 품질과 속도로 준다

Harper에서는 아래 보상이 더 자연스럽다.

- 더 빠른 접근
- 더 좋은 매칭
- 더 높은 우선순위
- 더 정교한 추천
- 팀 협업 편의

## 4. North Star와 핵심 지표

### 공통 North Star

- 초대 기반으로 유입된 사용자가 핵심 행동까지 도달하는 비율

### 회사 쪽 KPI

- activated company당 shared object 생성 수
- shared folder/view 링크를 연 고유 reviewer 수
- guest reviewer -> 회사 계정 생성 전환율
- shared artifact를 받은 사람의 첫 검색 실행률
- 한 회사에서 2명 이상 active seat가 되는 비율

### 후보자 쪽 KPI

- active candidate당 opportunity share / friend referral 발송 수
- referral 링크 유입 -> 회원가입 전환율
- referral 유입 -> 대화 완료율
- referral 유입 -> 프로필 완성률
- referral 유입 talent의 매칭 생성률

## 5. 서비스 1: 회사 Search 바이럴 루프

회사 쪽은 외부 대중 확산보다 "채용 관련 의사결정자들이 제품 안으로 함께 들어오는 것"이 핵심이다.

### Loop A. Shared Shortlist Review

가장 강력한 1차 루프다.

1. 회사 유저가 search 결과에서 후보를 shortlist folder에 저장한다.
2. "이 5명만 hiring manager에게 보내기" 형태로 공유 링크를 만든다.
3. 링크를 받은 hiring manager, founder, interviewer, advisor가 읽고 의견을 남긴다.
4. 의견을 남기려면 lightweight guest flow 또는 간단한 회사 계정 생성으로 이어진다.
5. reviewer가 제품 안에서 "비슷한 사람 더 보기" 또는 "내 역할도 만들어보기"를 누른다.
6. 새 seat 또는 새 company user가 생긴다.

왜 잘 도는가:

- 이미 후보자 폴더 공유가 있어 제품 적합성이 높다.
- 채용은 원래 여러 명이 함께 본다.
- 공유 이유가 강하다. "이 후보 어떤가요?"는 자연스러운 업무 문맥이다.

필수 기능:

- read-only guest reviewer 모드
- 후보별 thumbs up/down, short comment
- "이 기준으로 더 찾아보기" CTA
- 공유 링크에 role, why now, reviewer 요청 문구 포함
- 링크 수신자 이메일 수집 후 워크스페이스 전환

### Loop B. Search Result as Shareable Artifact

search 결과를 "툴 화면"이 아니라 "전달 가능한 채용 artifact"로 바꾼다.

공유 객체 예시:

- Top 10 candidate slate
- AI/ML market map
- "GitHub signal 기반 backend shortlist"
- "논문 기반 researcher longlist"

루프:

1. recruiter/hiring lead가 search를 돌린다.
2. 결과를 one-pager나 digest 형태로 export/share 한다.
3. founder, cofounder, hiring manager가 링크를 본다.
4. 그 중 일부가 직접 search를 열어본다.
5. team 내 다수 seat 사용으로 이어진다.

필수 기능:

- 링크 공유 가능한 digest view
- 후보 3~10명 요약 카드
- role brief + selection rationale
- "Open in Harper Search" CTA
- Slack/Email용 compact share format

### Loop C. Stakeholder Invite During Hiring Workflow

회사가 사람을 찾을 때 실제 의사결정자는 recruiter 1명이 아니다.

대상:

- founder
- hiring manager
- tech lead
- interviewer
- external advisor

루프:

1. recruiter가 search 또는 shortlist를 만든다.
2. Harper가 자연스럽게 "같이 볼 사람 초대"를 제안한다.
3. 초대받은 사람이 review만 해도 제품 안으로 들어온다.
4. 그 사람이 다른 role에서도 Harper를 쓰기 시작한다.

핵심은 협업 요청을 제품 내 고정 행동으로 만드는 것이다.

추천 기능:

- "리뷰 요청 보내기" CTA를 shortlist, match, scout 전반에 배치
- reviewer별 권한 분리
- "의견 남긴 사람이 많을수록 shortlist 품질이 올라간다" 메시지
- reviewer activity digest

### Loop D. Internal Template Propagation

좋은 search는 재사용된다.

루프:

1. 한 유저가 high-signal query와 source 조합을 만든다.
2. 이를 팀 템플릿으로 공유한다.
3. 다른 팀원이 자신의 role에 맞게 clone해서 다시 실행한다.
4. 템플릿이 조직 안에서 Harper 사용을 퍼뜨린다.

추천 기능:

- "이 검색 저장"
- "팀에 공유"
- "이 search로 새 role 만들기"
- source별 best practice preset

### 회사 쪽 추천 우선순위

#### P0

- shared folder guest review
- 공유 링크에서 바로 의견 남기기
- "내 워크스페이스에서 이어보기" CTA

#### P1

- digest / one-pager share view
- Slack share
- search template share

#### P2

- org-level collaboration graph
- hiring committee workspace
- 외부 advisor용 lightweight seat

## 6. 서비스 2: 후보자 Network / Career 바이럴 루프

후보자 쪽은 "좋은 기회를 받은 사람이 비슷한 좋은 사람을 데려오는 구조"가 핵심이다.

### Loop A. Opportunity Referral

가장 자연스러운 루프다.

후보자는 자주 아래 상황을 만난다.

- "나는 지금은 타이밍이 아닌데 이 포지션은 내 친구에게 잘 맞는다."
- "이 회사는 내 동료가 더 잘 맞는다."
- "이 역할은 우리 연구실 / 팀의 누군가에게 정확히 맞는다."

루프:

1. 후보자가 `/network` 또는 `/career/history`에서 기회를 본다.
2. "친구에게 추천하기"를 누른다.
3. 친구는 해당 기회 문맥이 담긴 링크로 들어온다.
4. 가입 후 바로 해당 기회를 보고 Harper와 대화를 시작한다.
5. Harper는 더 많은 고품질 talent pool을 확보한다.

필수 기능:

- 포지션 단위 referral CTA
- referrer가 왜 추천했는지 한 줄 남기기
- referral 링크 유입 시 personalized landing
- 가입 후 해당 role context 자동 반영
- referrer에게 상태 피드백 제공

현재 `/network?recommended=...`는 이미 시작점이 있으므로, 가장 먼저 고도화하기 좋다.

### Loop B. Invite-Only Network Pass

좋은 후보자에게 "친구 2~3명만 초대할 수 있는 네트워크 패스"를 준다.

루프:

1. 대화/프로필을 일정 수준 이상 완료한 후보자에게 pass를 준다.
2. 후보자는 실력 있는 지인에게만 초대 링크를 보낸다.
3. 지인이 가입하고 대화를 완료한다.
4. Harper는 고품질 후보자 풀을 확보한다.
5. 원래 후보자는 더 좋은 추천 속도나 우선 노출을 받는다.

핵심은 mass invite가 아니라 curated invite다.

추천 기능:

- 월 2~3개 invite cap
- invite quality에 따라 추가 pass 지급
- "Harper가 바로 추천할 만한 사람만 초대해 달라"는 명확한 포지셔닝
- referrer별 invite conversion / match quality 추적

### Loop C. "Not For Me, But For Someone I Know"

Negative signal을 바이럴 진입점으로 바꾸는 루프다.

루프:

1. 후보자가 기회를 넘긴다.
2. 제품이 "혹시 떠오르는 분이 있나요?"를 묻는다.
3. 그 자리에서 이름, LinkedIn, 이메일, 혹은 링크 공유를 받는다.
4. Harper가 warm intro 기반으로 새 후보자에게 진입한다.

좋은 이유:

- 거절 순간은 추천 순간이 되기 쉽다.
- user가 스스로 이유를 알고 있다.
- 기존 feedback flow와 잘 붙는다.

추천 기능:

- negative feedback 제출 직후 referral prompt
- 간단한 이유 선택: "나보다 이 사람에게 더 맞음"
- referrer에게 이후 진행 상황의 최소 피드백 제공

### Loop D. Shareable Talent Identity

후보자가 자신의 Harper 프로필을 외부에 보여줄 수 있어야 한다.

공유 객체 예시:

- Harper profile card
- 내가 찾는 역할 / engagement / location
- GitHub / Scholar / resume 기반 summary
- Harper가 정리한 strengths snapshot

루프:

1. 후보자가 대화와 profile을 채운다.
2. Harper가 public-shareable card를 만들어준다.
3. 후보자가 친구, 동료, mentor, 채용담당자에게 보낸다.
4. 링크를 받은 사람이 Harper를 인지하고 유입된다.

주의:

- 완전 공개 프로필보다 "선택적 공유"가 낫다.
- privacy by default를 유지해야 한다.

### Loop E. Peer Review Before Match

후보자가 신뢰하는 동료에게 내 프로필을 먼저 보여주고 피드백 받게 만든다.

루프:

1. candidate가 내 profile card를 공유한다.
2. peer가 "이 강점은 더 강조해야 한다", "이 역할이 더 맞다" 같은 피드백을 남긴다.
3. candidate가 profile을 더 정교하게 만든다.
4. Harper의 매칭 품질이 올라간다.
5. peer도 Harper를 경험하게 된다.

이 루프는 direct referral보다 conversion은 낮을 수 있지만 profile quality를 높인다.

### 후보자 쪽 추천 우선순위

#### P0

- `/network` 포지션 share 고도화
- `/career/history`의 opportunity referral
- rejection 이후 "지인 추천" prompt

#### P1

- invite-only network pass
- referrer status tracking
- personalized onboarding for referrals

#### P2

- shareable talent card
- peer profile review
- small curated circles

## 7. 기능 아이디어를 현재 화면에 매핑

### `/network`

- 포지션 상세 모달에 `친구에게 보내기`
- `이 포지션에 추천받으셨습니다` 문구를 referrer context로 확장
- 링크 유입 시 "누가 왜 추천했는지" 보여주기
- 가입 후 바로 해당 role로 대화 시작

### `/career`

- home의 recent opportunities에서 `지인 추천`
- history에서 `나 대신 다른 사람 추천`
- profile 완료 후 `trusted friends 초대`
- chat 완료 milestone마다 network pass 제안

### `/my`

- folder/share를 reviewer collaboration entry point로 승격
- 후보 카드에 reviewer note 수집
- 공유 링크 수신자의 account creation 유도
- share된 shortlist를 기반으로 새 role 또는 새 search 생성

## 8. 보상 설계

### 회사 유저 보상

- 추가 reviewer seat
- faster review workflow
- 후보 요약 artifact 자동 생성
- 팀 내 search template 저장

### 후보자 보상

- 더 빠른 매칭 우선순위
- 더 높은 품질의 기회 추천
- curated network pass
- early access to selective roles

초기에는 현금 보상보다 제품 가치 보상이 더 적합하다.

## 9. 하지 말아야 할 것

- 무차별 친구 초대 배너
- 가입 직후 대량 연락처 업로드 요청
- SNS 자동 포스팅 중심 전략
- 현금 리워드만으로 유입 품질을 사는 구조
- privacy를 희생하는 public exposure

## 10. 추천 실행 순서

### Step 1

현재 이미 있는 공유 구조를 강화한다.

- `/network?recommended=...` 고도화
- `/my/list/bookmarkPage` 공유를 guest review로 확장

### Step 2

referral을 명시적 제품 행동으로 만든다.

- opportunity referral
- rejection after referral
- personalized invite onboarding

### Step 3

품질 기반 네트워크를 만든다.

- invite-only pass
- talent card
- reviewer / referrer quality scoring

## 11. 가장 먼저 실험할 5개

1. `/network` 포지션 상세에서 `친구에게 추천하기`
2. referral 유입 landing에 referrer context 추가
3. `/career/history`에서 `나보다 어울리는 사람 추천`
4. `/my` shortlist 공유 링크에 guest reviewer note
5. shared shortlist 링크에서 `내 search로 이어보기`

## 12. 최종 제안

Harper의 바이럴은 "콘텐츠 확산형"보다 "신뢰 이동형"이 맞다.

정리하면:

- 회사 쪽은 `협업`이 바이럴 객체다.
- 후보자 쪽은 `기회 추천`이 바이럴 객체다.
- 둘 다 무작정 넓게 퍼뜨리기보다 "이 사람에게 보내는 것이 의미 있다"는 맥락이 있어야 한다.

가장 좋은 첫 루프는 아래 두 개다.

1. 회사: shortlist 공유 -> reviewer 유입 -> 자기 workspace 생성
2. 후보자: opportunity 공유 -> 친구 가입 -> Harper 대화 시작

이 두 루프만 잘 만들어도 Harper는 paid acquisition 없이도 질 좋은 네트워크를 점점 넓힐 수 있다.
