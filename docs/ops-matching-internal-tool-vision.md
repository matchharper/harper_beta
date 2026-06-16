# /ops/matching 내부 운영 도구 기획 문서

작성일: 2026-06-16

## 이 문서의 목적

이 문서는 `/ops/matching`을 어떤 방향의 내부 도구로 발전시켜야 하는지 설명하기 위한 문서다. 개발 방식, 데이터 구조, API, schema 설계는 다루지 않는다.

핵심 질문은 하나다.

> Harper 내부 팀이 훨씬 많은 사람을 관리하게 되었을 때도, 특정 role에 대해 "누구를 먼저 봐야 하는지", "왜 fit인지", "무엇이 부족하거나 위험한지", "다음에 무엇을 해야 하는지"를 빠르게 판단할 수 있는가?

`/ops/matching`은 단순히 talent 목록을 보여주는 페이지가 아니다. Harper가 가진 사람 데이터, 대화 맥락, 선호, 이력, 추천 반응, 내부 메모를 role 기준으로 다시 해석해서, 운영자가 좋은 연결을 더 빠르고 일관되게 만들 수 있게 하는 **내부 매칭 판단 도구**가 되어야 한다.

나중에 회사 측에 일부 화면을 열 수 있다는 가능성은 참고 정보일 뿐이다. 지금 가장 중요한 기준은 Harper 내부 운영 효율과 매칭 품질이다.

## 왜 이 페이지가 중요한가

Harper의 강점은 "검색 결과를 많이 보여주는 것"이 아니다. Harper의 강점은 후보자의 커리어 맥락과 회사의 실제 니즈를 함께 이해해서, 그냥 키워드가 맞는 사람이 아니라 **지금 이 role에 정말 연결해볼 만한 사람**을 찾는 데 있다.

문제는 이 판단이 사람 수가 늘수록 급격히 어려워진다는 점이다.

사람이 100명일 때는 운영자가 기억과 감으로도 어느 정도 처리할 수 있다. 하지만 사람이 수천 명, 수만 명이 되면 이야기가 달라진다. 좋은 후보는 이미 데이터 안에 있어도 발견되지 않을 수 있고, 어떤 후보가 예전에 왜 보류되었는지 기억하기 어렵고, 영어/연봉/지역/관심도 같은 중요한 리스크는 늦게 발견된다. 그러면 Harper가 가진 데이터의 양은 늘어나는데, 실제 매칭 속도와 품질은 오히려 떨어질 수 있다.

Ashby가 좋은 레퍼런스인 이유도 여기에 있다. Ashby의 AI Talent Rediscovery는 기존 후보 데이터베이스를 job criteria 기준으로 다시 읽고, 강한 후보를 우선순위 bucket으로 보여주며, 각 후보가 어떤 기준을 충족하는지 설명한다. Ashby Candidate Search와 Pipeline도 저장된 필터, 고급 필터, bulk action, stage group을 통해 많은 후보를 한 명씩 수동으로 열어보지 않게 만든다. 즉 좋은 레퍼런스의 본질은 예쁜 ATS 화면이 아니라, **대량의 후보를 role 기준으로 다시 정렬하고 판단 비용을 줄이는 운영 방식**이다.

Harper는 여기에 한 가지가 더 필요하다. Harper는 회사의 ATS만이 아니라, 후보자 관점의 에이전트이기도 하다. 따라서 단순히 "이 사람이 기술적으로 맞는가"뿐 아니라 "이 사람이 이 기회에 실제로 관심을 가질 가능성이 있는가", "현재 노출/연락해도 되는 상태인가", "회사에 소개할 만큼 충분히 설명 가능한가", "부족한 정보는 무엇인가"까지 함께 봐야 한다.

`/ops/matching`은 이 모든 질문을 한 화면에서 다루는 곳이어야 한다.

## 현재 상태를 어떻게 봐야 하는가

현재 `/ops/matching`은 이미 중요한 뼈대를 갖고 있다.

- 회사와 role을 선택한다.
- All 탭에서 talent 목록을 본다.
- Harper Review 탭에서 추천된 사람을 stage별로 본다.
- 각 사람에게 role별 태그와 메모를 남긴다.
- 상세 drawer에서 talent profile과 role 관련 진행 기록을 본다.

이 구조는 출발점으로 좋다. 하지만 아직 "운영자가 무엇을 판단해야 하는지"를 시스템이 충분히 도와주지는 않는다. 지금은 사람이 목록을 보고, 직접 상세를 열고, 머릿속에서 role과 후보를 비교해야 한다.

앞으로의 방향은 명확하다.

`/ops/matching`은 "사람 목록"에서 "role별 판단 queue"로 바뀌어야 한다. 운영자가 직접 모든 사람을 훑는 것이 아니라, 시스템이 먼저 후보 풀을 role 기준으로 읽고, 강한 후보와 애매한 후보와 확인이 필요한 후보를 나누고, 운영자는 그 결과를 검증하고 다음 action을 정하는 방식이어야 한다.

## 레퍼런스에서 가져갈 원칙

### Ashby: criteria 기반 rediscovery

Ashby의 가장 중요한 시사점은 "새 role이 열릴 때마다 밖에서 새로 찾기 전에, 이미 우리 데이터베이스 안에 있는 좋은 후보를 다시 찾아야 한다"는 점이다. Ashby AI Talent Rediscovery는 job criteria를 기준으로 기존 후보를 평가하고, prior feedback, application history, criteria match breakdown을 함께 보여준다.

Harper에도 같은 문제가 있다. 좋은 후보가 이미 Harper 안에 있어도, 그 후보가 과거에 어떤 기회에 반응했는지, 지금 어떤 선호를 갖고 있는지, 어떤 role에 다시 맞을 수 있는지 운영자가 매번 기억할 수는 없다.

그래서 `/ops/matching`의 첫 번째 방향은 "검색"이 아니라 "재발견"이어야 한다.

### Ashby Candidate Search / Pipeline: 저장된 관점과 bulk action

Ashby의 Candidate Search와 Pipeline은 단순 필터가 아니라 반복 운영을 위한 장치다. 자주 쓰는 검색 조건을 저장하고, pipeline stage별로 보고, 여러 후보에게 한 번에 action을 취할 수 있다.

Harper도 매번 같은 질문을 반복하게 된다.

- 이 role에 fit이 높은데 아직 태그가 없는 사람은 누구인가?
- 기술은 맞지만 영어 확인이 필요한 사람은 누구인가?
- 좋은데 연봉/지역이 맞지 않을 수 있는 사람은 누구인가?
- 최근 활동이 있어서 지금 연락하면 반응할 가능성이 높은 사람은 누구인가?
- 예전에 보류했지만 이번 role에는 다시 볼 만한 사람은 누구인가?

이런 관점은 매번 수동으로 만드는 필터가 아니라, 저장되고 재사용되는 view가 되어야 한다.

### Ashby Candidate Reviews: 판단을 구조화하고 feedback을 모으기

Ashby Candidate Reviews는 hiring manager가 후보를 빠르게 보고 점수와 코멘트를 남기게 한다. 중요한 점은 후보 검토가 "채팅으로 의견 주고받기"가 아니라, 구조화된 feedback loop이 된다는 것이다.

Harper 내부에서도 비슷한 문제가 생긴다. 특정 후보가 좋은지 애매한지, 왜 보류했는지, 다음에 무엇을 확인해야 하는지가 Slack이나 개인 기억에 남으면 같은 판단을 반복하게 된다. `/ops/matching` 안에서 판단과 이유가 남아야 다음 role, 다음 후보, 다음 운영자에게 이어진다.

### Gem / Greenhouse: talent pool과 rediscovery

Gem과 Greenhouse가 강조하는 talent pool/rediscovery의 핵심은, 후보 풀은 한 번 쓰고 버리는 리스트가 아니라 장기 자산이라는 점이다. 지금 특정 role에 맞지 않아도, 몇 달 뒤 다른 role에는 강한 fit일 수 있다.

Harper는 특히 이 관점이 중요하다. 후보자와 계속 관계를 유지하고, 선호와 상황이 바뀌며, 공개되지 않은 내부 기회가 새로 생기기 때문이다. `/ops/matching`은 "지금 불합격"을 기록하는 도구가 아니라, "이번 role에는 왜 아닌지, 다음에는 어떤 role에서 다시 볼지"를 남기는 도구여야 한다.

### Workable: 자연어 기준과 unified profile

Workable의 Search with AI는 자연어로 원하는 후보를 찾고, AI가 기준을 뽑아 후보를 보여준다. 여기서 가져갈 점은 운영자가 항상 정교한 필터 문법을 기억할 필요가 없다는 것이다.

Harper 운영자는 "최근 agent 제품을 실제 고객 환경에 배포해본 사람", "영어로 founder와 직접 일할 수 있는 ML infra 사람", "현업을 유지하면서 fractional로 들어올 수 있는 robotics 쪽 사람"처럼 자연어로 생각한다. `/ops/matching`도 이 언어를 그대로 받아들일 수 있어야 한다.

## Harper가 Ashby와 달라야 하는 점

Ashby를 그대로 따라 만들면 안 된다. Ashby는 회사의 ATS이고, Harper는 후보자와 회사 사이에서 좋은 연결을 만드는 agent에 가깝다.

Ashby의 기본 질문은 "이 지원자를 이 채용 프로세스에서 다음 단계로 보낼 것인가"에 가깝다. Harper의 질문은 더 넓다.

- 이 사람이 이 role에 기술적으로 맞는가?
- 이 role이 이 사람의 커리어 방향과 맞는가?
- 후보자가 이 회사/단계/보상/지역/근무형태에 관심을 가질 가능성이 있는가?
- 회사에 소개했을 때 설득력 있게 설명할 수 있는가?
- 후보자에게 먼저 확인해야 할 정보는 무엇인가?
- 지금 연락하면 후보자 경험을 해치지 않는가?
- 이번에는 아니어도 다음에 어떤 role에서 다시 봐야 하는가?

이 차이 때문에 `/ops/matching`은 ATS pipeline보다 "matching intelligence cockpit"에 가까워야 한다.

## 제품 원칙

### 1. Role 기준으로 생각한다

좋은 후보라는 말은 불완전하다. 중요한 것은 "이 role에 좋은 후보인가"다. 같은 사람이 한 role에는 강한 fit이고, 다른 role에는 애매할 수 있다.

따라서 `/ops/matching`의 모든 판단은 role을 중심으로 돌아가야 한다. 태그, 메모, score, 보류 이유, next action도 가능하면 role 맥락 안에서 보여야 한다.

### 2. 점수보다 이유가 중요하다

AI가 87점을 줬다는 사실만으로는 운영자가 움직일 수 없다. 운영자는 "왜 87점인지", "어떤 근거가 있는지", "무엇이 불확실한지"를 알아야 한다.

특히 Harper에서는 fit이 높아도 바로 소개할 수 없는 경우가 많다.

- 직무는 맞지만 영어가 부족할 수 있다.
- 기술은 좋은데 희망 연봉이 맞지 않을 수 있다.
- 회사는 좋아할 것 같지만 후보자의 관심사는 다를 수 있다.
- 이력은 강한데 최근 상황이 오래되어 stale할 수 있다.
- 프로필은 좋아 보이지만 회사에 소개할 구체적 성과가 부족할 수 있다.

따라서 score는 항상 이유, 근거, 리스크, missing info와 함께 보여야 한다.

### 3. Unknown을 별도 상태로 다룬다

매칭 운영에서 가장 위험한 것은 "모른다"가 "아니다"로 처리되는 것이다. 영어가 확인되지 않았다는 것은 영어가 부족하다는 뜻이 아니다. 연봉 정보가 없다는 것은 연봉이 안 맞는다는 뜻이 아니다.

좋은 도구는 unknown을 탈락 사유로 숨기지 않는다. 대신 "확인해야 할 질문"으로 바꾼다. Harper가 후보자와 직접 대화할 수 있다는 점은 큰 장점이다. `/ops/matching`은 이 장점을 살려서, 좋은 후보인데 정보가 부족한 사람을 놓치지 않게 해야 한다.

### 4. 사람의 판단을 대체하지 않고, 판단의 순서를 바꾼다

AI가 최종 결정을 하면 안 된다. 하지만 AI가 운영자의 시간을 쓰는 순서는 바꿔야 한다.

지금의 수동 방식은 "목록에서 한 명을 열고, 맥락을 읽고, role과 비교하고, 다음 사람으로 넘어가는" 선형 작업이다. 이 방식은 사람 수가 늘수록 무너진다.

좋은 방식은 "AI가 먼저 후보를 bucket으로 나누고, 운영자는 강한 후보부터 검증하고, 애매한 후보는 missing info를 해결하고, 명확한 mismatch는 뒤로 미루는" 방식이다.

### 5. 운영 기록은 다음 판단의 자산이어야 한다

태그와 메모는 단순 annotation이 아니라 미래 판단의 재료다. 어떤 후보를 왜 수락/거절/보류했는지, 후보자가 왜 관심을 보였거나 거절했는지, 회사가 왜 좋아했거나 아쉬워했는지는 다음 role에서 매우 중요하다.

`/ops/matching`은 기록을 남기는 곳이 아니라, 기록이 다음 판단을 더 좋게 만드는 곳이어야 한다.

## 우선순위가 가장 높은 기능들

아래 기능들은 "있으면 좋다" 수준이 아니라, `/ops/matching`이 내부 운영 효율을 크게 높이려면 반드시 필요해지는 순서로 정리했다.

## 1. Criteria 기반 전체 후보 평가

가장 먼저 필요한 기능은 All 탭에서 임의의 기준을 넣고, 그 기준으로 후보 풀 전체를 평가하는 기능이다.

이 기능이 중요한 이유는 단순하다. 운영자가 수많은 사람을 한 명씩 열어보며 role fit을 판단하는 방식은 오래가지 못한다. Harper가 관리해야 하는 사람이 많아질수록, 좋은 후보는 데이터 안에 있어도 발견되지 않을 가능성이 커진다.

운영자는 이런 식으로 묻고 싶을 것이다.

- "이 role은 AI agent를 실제 고객 환경에 배포해본 사람이 필요해."
- "연구만 한 사람보다 product engineering과 고객 문제 해결 경험이 있는 사람이 좋아."
- "영어로 해외 founder와 직접 일할 수 있어야 해."
- "정규직이 아니라 fractional 가능성이 있는 사람도 보고 싶어."
- "연봉이 너무 높을 가능성이 있으면 뒤로 미뤄줘."

이 기준을 넣으면 시스템은 후보들을 role 기준으로 읽고, 누가 먼저 볼 만한지 정렬해줘야 한다. 여기서 중요한 것은 AI가 "정답"을 내리는 것이 아니다. 운영자가 볼 순서를 바꿔주는 것이다.

이 기능이 있으면 `/ops/matching`은 목록 페이지에서 판단 도구로 바뀐다. 운영자는 "전체 후보 중 누가 먼저 볼 사람인가"라는 가장 큰 질문에 빠르게 답할 수 있다.

성공적인 결과 화면은 단순한 score ranking이 아니다. 각 후보에 대해 아래가 한눈에 보여야 한다.

- fit 점수 또는 fit band
- 왜 fit인지 한 줄 이유
- 가장 강한 근거
- 가장 큰 리스크
- 확인이 필요한 정보
- AI 판단의 확신도
- 추천되는 다음 action

예를 들어 한 후보는 이렇게 보일 수 있다.

> Fit 높음. Agent workflow를 실제 제품에 배포한 경험이 role과 강하게 맞음. 다만 영어 협업 경험과 희망 보상은 확인 필요.

이 정도가 되어야 운영자는 "이 사람은 지금 열어볼 가치가 있다"는 판단을 할 수 있다.

## 2. Role fit을 세부 항목으로 쪼개서 보여주기

두 번째로 중요한 것은 fit 점수를 한 덩어리로 보여주지 않는 것이다.

사용자가 말한 예시가 정확하다.

- "이 사람은 직무는 맞는데 영어가 부족하구나."
- "이 사람은 다 좋은데 연봉 요구가 다르구나."
- "이 사람은 기술은 맞는데 지금 원하는 방향과 다르구나."

이런 판단은 전체 점수 하나로는 보이지 않는다. 점수가 80점이어도 80점의 의미가 다를 수 있다. 어떤 사람은 기술 95점, 영어 unknown, 보상 risk일 수 있고, 어떤 사람은 기술 70점이지만 후보자 관심도와 timing이 매우 좋을 수 있다.

따라서 `/ops/matching`에는 role fit breakdown이 필요하다.

최소한 아래 관점은 분리해서 보여줘야 한다.

- 직무/기술 fit
- 도메인 fit
- seniority fit
- 회사 stage fit
- 영어/커뮤니케이션 risk
- location/timezone/근무형태 fit
- 보상 mismatch 가능성
- 후보자의 관심도/전환 의향
- 최근 활동성과 timing
- 프로필 설명 가능성
- 정보 부족 여부

이 breakdown은 운영자의 시간을 크게 줄인다. 운영자는 후보를 볼 때마다 "어디가 문제지?"를 다시 읽지 않아도 된다. 이미 시스템이 "좋은 점"과 "확인해야 할 점"을 분리해주기 때문이다.

또 하나 중요한 효과가 있다. 이 breakdown은 후보를 무작정 탈락시키지 않게 만든다. 예를 들어 영어가 unknown이면 "탈락"이 아니라 "확인 필요"로 남는다. Harper가 후보자에게 직접 물어볼 수 있다면, unknown은 해결 가능한 운영 task다.

## 3. Strong Fit / 확인 필요 / 나중에 다시 보기 같은 bucket

정렬된 목록만으로는 부족하다. 사람이 많은 상황에서는 1등부터 500등까지 줄 세우는 것보다, 지금 해야 할 일을 기준으로 나누는 것이 훨씬 더 유용하다.

Ashby AI Talent Rediscovery가 후보를 Warm Lead, Silver Medalist, High Fit, Re-Visit Overlooked 같은 bucket으로 나누는 이유도 같다. 사람은 끝없는 리스트보다 "어디부터 보면 되는지"가 정리된 queue를 더 잘 처리한다.

Harper의 `/ops/matching`에도 이런 bucket이 필요하다.

예시는 다음과 같다.

- Strong Fit: 바로 검토하고 shortlist에 넣을 후보
- Verify First: 좋은데 영어/보상/관심도 등 확인이 필요한 후보
- Good but Not Now: 좋은 사람이지만 지금 role/timing과는 맞지 않는 후보
- Stretch: 가능성은 있지만 role 기준에는 약간 부족한 후보
- Revisit Later: 이번에는 뒤로 미루지만 다른 role에서 다시 볼 후보
- Not This Role: 이번 role에는 명확히 맞지 않는 후보

이 bucket이 있으면 운영자는 "좋은 사람 찾기"와 "확인해야 할 사람 처리"를 분리할 수 있다. 특히 `Verify First` bucket은 Harper에 매우 중요하다. 많은 매칭 실패는 사람이 없어서가 아니라, 좋은 후보에 대해 결정적인 정보 하나가 부족해서 생긴다.

## 4. Candidate-role dossier

일반적인 후보 상세 페이지와 role별 판단 페이지는 다르다.

후보 상세 페이지는 "이 사람이 누구인가"를 보여준다. 하지만 matching dossier는 "이 사람이 이 role에 왜 맞거나 안 맞는가"를 보여줘야 한다.

운영자가 후보를 클릭했을 때 가장 먼저 보고 싶은 것은 긴 프로필 전체가 아니다. 먼저 보고 싶은 것은 role과 연결된 판단 요약이다.

좋은 dossier는 아래 질문에 답해야 한다.

- 이 사람을 이 role에서 봐야 하는 이유는 무엇인가?
- 어떤 근거에서 그렇게 판단했는가?
- 이전에 어떤 role에 추천되었고, 후보자나 회사가 어떻게 반응했는가?
- 후보자가 말한 선호와 이 role은 충돌하지 않는가?
- 회사에 소개한다면 어떤 narrative로 소개할 수 있는가?
- 소개 전에 꼭 확인해야 할 정보는 무엇인가?
- 마지막으로 누가 무엇을 했고, 다음 action은 무엇인가?

이 기능이 중요한 이유는 context switching을 줄이기 때문이다. 현재처럼 프로필, 메모, 추천 기록, role 설명을 운영자가 머릿속에서 조합하면 매 후보마다 똑같은 인지 비용이 든다. dossier는 그 비용을 줄여준다.

특히 Harper에서는 "회사에 소개할 수 있을 만큼 설명 가능한가"가 중요하다. 이력서가 좋아 보여도 회사에 전달할 narrative가 약하면 좋은 매칭으로 이어지기 어렵다. dossier는 단순 profile viewer가 아니라 소개 가능성을 판단하는 화면이어야 한다.

## 5. Missing info를 next action으로 바꾸는 기능

매칭 운영에서 자주 막히는 지점은 "이 사람이 나쁜 후보"가 아니라 "이 사람에 대해 중요한 걸 모른다"는 상태다.

예를 들어:

- 영어로 founder와 일할 수 있는지 모른다.
- 희망 연봉이나 근무형태를 모른다.
- 지금 이직 의향이 있는지 모른다.
- 특정 도메인에 관심이 있는지 모른다.
- 현재 회사 노출을 꺼리는지 모른다.
- 이력서에는 직함만 있고 실제 성과가 없다.

이런 정보가 없으면 운영자는 후보를 확신 있게 소개하지 못한다. 결국 좋은 후보가 `보류` 상태로 오래 남는다.

따라서 `/ops/matching`은 missing info를 명확히 보여주고, 그것을 다음 action으로 바꿔야 한다.

예를 들어 "영어 확인 필요"가 있으면 단순 경고로 끝나는 것이 아니라:

- 후보자에게 물어볼 질문을 제안한다.
- 내부 메모로 남길 수 있게 한다.
- 확인 완료 후 fit 판단이 자동으로 업데이트되게 한다.
- 같은 unknown을 가진 후보들을 한 번에 모아볼 수 있게 한다.

이 기능은 Harper의 운영 방식과 잘 맞는다. Harper는 후보자와 직접 대화하고, 커리어 맥락을 계속 학습하는 제품이다. 정보 부족은 약점이 아니라, 잘 다루면 매칭 품질을 높이는 기회다.

## 6. Bulk triage와 빠른 검토 workflow

사람이 많아지면 좋은 판단 기능만으로는 부족하다. 그 판단 결과를 빠르게 처리할 수 있어야 한다.

운영자는 여러 후보를 한 번에 선택해서 다음과 같은 일을 하고 싶을 것이다.

- Strong Fit 후보를 shortlist에 넣기
- 명확한 mismatch 후보를 이번 role에서 제외하기
- 영어 확인 필요 후보에게 같은 종류의 follow-up task 만들기
- 태그나 메모를 일괄 적용하기
- 특정 기준으로 다시 평가 요청하기
- Harper Review로 넘기기
- 나중에 다시 볼 후보 pool에 넣기

Ashby Candidate Search와 Pipeline이 bulk action을 중요하게 다루는 이유도 같다. 대량 후보 운영에서는 "정확한 판단"만큼 "많은 판단을 안전하게 처리하는 속도"가 중요하다.

다만 Harper에서는 bulk action이 위험할 수도 있다. AI 점수만 보고 대량 제외를 해버리면 좋은 후보를 놓칠 수 있다. 그래서 bulk action은 항상 사람이 확인하고, 이유가 남고, 되돌릴 수 있거나 추적 가능해야 한다.

핵심은 자동화가 아니라 반복 작업을 줄이는 것이다.

## 7. Saved views와 role-family pool

운영자가 매번 같은 필터와 기준을 다시 만드는 것은 낭비다. `/ops/matching`에는 자주 쓰는 관점을 저장하는 기능이 필요하다.

예를 들어 이런 saved view가 있어야 한다.

- 이 role의 Strong Fit
- Fit은 높은데 아직 태그 없는 사람
- 영어 확인 필요
- 보상 mismatch 가능성
- 최근 활동한 high-fit 후보
- 후보자가 관심을 보였던 유사 role
- 과거에는 보류했지만 이번 role에는 다시 볼 후보
- profile quality가 낮아 소개 전 보강이 필요한 후보

또한 role 하나에만 묶이지 않는 pool도 필요하다.

예를 들어 "AI Agent Engineer", "Founding ML Engineer", "Robotics / Embodied AI", "Forward Deployed Engineer", "Fractional Advisor" 같은 role-family pool이 있으면, 새 role이 생길 때 완전히 처음부터 찾지 않아도 된다.

이것은 Harper의 장기 자산을 만드는 기능이다. 좋은 후보를 한 번 발견하고 끝내는 것이 아니라, 어떤 종류의 기회에서 다시 볼 사람인지 기억하게 만든다.

## 8. 결과 feedback이 다음 매칭에 반영되는 loop

좋은 매칭 도구는 한 번의 추천에서 끝나면 안 된다. 후보자와 회사의 반응이 다음 판단을 더 좋게 만들어야 한다.

예를 들어:

- 후보자가 "회사는 좋은데 role이 애매하다"고 하면, 다음에는 role scope를 더 강하게 봐야 한다.
- 후보자가 "연봉 range가 안 맞다"고 하면, 비슷한 budget의 role에서 risk로 보여야 한다.
- 회사가 "기술은 좋은데 customer-facing이 약하다"고 하면, 해당 role-family criteria가 조정되어야 한다.
- 운영자가 어떤 후보를 계속 Strong Fit으로 옮기는데 회사 반응이 낮다면, criteria가 너무 느슨한 것일 수 있다.
- 반대로 AI가 낮게 평가한 후보가 실제로 좋은 반응을 얻었다면, 그 이유를 학습해야 한다.

지금의 메모와 태그는 이 loop의 시작점이 될 수 있다. 하지만 장기적으로는 feedback이 더 명확히 구조화되어야 한다. "왜 accept", "왜 reject", "왜 hold", "무엇을 확인해야 함"이 남아야 다음 role에서 같은 실수를 반복하지 않는다.

이 기능은 단순 분석 기능이 아니다. Harper의 매칭 품질이 시간이 지나며 좋아지게 만드는 핵심 장치다.

## 9. Shortlist와 소개 준비 화면

`/ops/matching`의 최종 목적은 좋은 후보를 찾는 것에서 끝나지 않는다. 결국 Harper는 후보자와 회사를 연결해야 한다.

따라서 role별로 shortlist를 만들고, shortlist 안에서 후보들을 비교하고, 소개 전에 필요한 정보를 정리하는 화면이 필요하다.

좋은 shortlist 화면은 아래 질문에 답해야 한다.

- 이번 role에서 가장 먼저 소개할 3-5명은 누구인가?
- 각 후보를 소개하는 핵심 논리는 무엇인가?
- 후보별 risk는 무엇이고, 소개 전에 확인해야 하는가?
- 회사에 전달할 때 어떤 순서와 narrative가 좋은가?
- 후보자에게 이 role을 설명할 때 어떤 점을 강조해야 하는가?
- 같은 후보를 다른 회사에도 동시에 제안 중인가?

이 기능이 중요한 이유는 Harper의 output이 단순 후보 리스트가 아니기 때문이다. Harper의 output은 "왜 이 사람을 지금 이 회사가 만나야 하는지"에 대한 설득이다. Shortlist 화면은 운영자가 그 설득을 준비하는 곳이어야 한다.

## 10. Timing과 relationship signal

좋은 후보라도 지금 연락하면 안 되는 경우가 있다. 반대로 약간 애매해 보여도 지금 관심이 높은 후보라면 먼저 확인할 가치가 있다.

Harper는 후보자와의 관계를 중시하기 때문에 timing signal이 중요하다.

봐야 할 신호는 예를 들어 다음과 같다.

- 최근 Career 페이지에 접속했는가?
- 최근 추천에 반응했는가?
- 어떤 추천을 좋아하거나 싫어했는가?
- 외부 기회 추천을 멈춘 상태인가?
- 내부 연결은 받을 수 있는 상태인가?
- 현재 회사 노출을 걱정하는가?
- 지금 적극적으로 이직 중인가, 좋은 기회만 보는 상태인가?
- 마지막으로 Harper가 연락한 지 얼마나 되었는가?

이 신호가 `/ops/matching`에 보여야 하는 이유는 후보자 경험 때문이다. Harper가 좋은 agent처럼 느껴지려면, 아무 때나 아무 role이나 보내는 것이 아니라 후보자의 상황을 존중해야 한다.

매칭 효율은 단순히 fit이 높은 사람을 찾는 것이 아니라, 지금 연락해도 좋은 사람을 찾는 것까지 포함한다.

## 11. Role coverage와 운영 health

운영자는 role별로 "지금 우리가 충분히 좋은 후보를 갖고 있는가"를 알아야 한다.

예를 들어 어떤 role을 열었을 때:

- Strong Fit 후보가 몇 명인가?
- 확인 필요 후보가 몇 명인가?
- 아직 아무 판단도 안 된 후보가 얼마나 많은가?
- shortlist까지 간 후보는 몇 명인가?
- 후보자가 거절한 주된 이유는 무엇인가?
- 회사가 거절한 주된 이유는 무엇인가?
- 이 role은 sourcing을 더 해야 하는가, 아니면 내부 pool에서 충분한가?

이 기능은 dashboard처럼 보일 수 있지만, 목적은 reporting이 아니라 운영 의사결정이다. "이 role은 후보가 부족하다", "이 role은 후보는 많은데 영어 확인에서 막힌다", "이 role은 보상 mismatch가 반복된다" 같은 결론을 빨리 내리게 해야 한다.

Ashby의 analytics가 중요한 이유도 단순히 숫자를 보기 위해서가 아니라, recruiting 활동의 병목을 찾기 위해서다. Harper도 role별 health를 봐야 운영 리소스를 어디에 써야 하는지 알 수 있다.

## 12. 자연어 ad-hoc search

정식 criteria run과 별개로, 운영자는 빠르게 이런 질문을 던지고 싶을 때가 많다.

- "B2B SaaS에서 agent 제품 만들어본 사람만 보여줘."
- "최근 1년 안에 반응이 있었고, 영어 가능성이 높고, seed-stage startup에 관심 있을 만한 사람."
- "research background는 있는데 product engineering도 해본 사람."
- "정규직보다 part-time advisor로 더 맞을 것 같은 사람."
- "이 role에는 너무 senior한 사람은 빼줘."

이런 검색은 단순 keyword search로는 어렵다. 자연어 ad-hoc search는 운영자의 생각을 그대로 도구에 입력하게 해준다.

다만 이 기능은 "검색 결과를 믿고 바로 action"하는 도구가 아니라, 빠른 탐색 도구여야 한다. 검색 결과에는 항상 어떤 기준으로 해석했는지, 어떤 조건이 적용되었는지, 어떤 부분은 추정인지가 보여야 한다.

## 13. 판단 기준의 calibration

AI 평가가 유용하려면 기준이 좋아야 한다. 기준이 애매하면 결과도 애매하다.

Ashby의 AI-Assisted Application Review도 criteria를 명확하고, 단일하고, 객관적으로 검증 가능하게 쓰는 것을 강조한다. Harper도 같은 문제가 있다.

예를 들어 "좋은 AI engineer"는 너무 넓다. 대신 아래처럼 나뉘어야 한다.

- LLM application을 production에 배포한 경험
- 고객 요구를 기술 요구사항으로 바꾼 경험
- 빠른 iteration과 product sense
- 영어로 technical discussion 가능
- seed-stage ambiguity를 견딜 수 있음

`/ops/matching`은 운영자가 criteria를 더 잘 쓰도록 도와야 한다. 좋은 기준 예시를 제안하고, 너무 모호한 기준은 더 구체화하도록 유도하고, 이전 role에서 효과가 좋았던 criteria를 다시 사용할 수 있게 해야 한다.

이 기능은 AI 품질을 높이는 동시에 팀의 판단을 맞춘다. 운영자마다 "좋은 후보"의 의미가 다르면 매칭 품질은 흔들린다. Criteria calibration은 팀이 같은 기준으로 후보를 보게 만드는 장치다.

## 기능보다 더 중요한 화면의 감각

`/ops/matching`은 예쁜 CRM이 아니라 빠른 운영 도구여야 한다. 첫 화면에서 많은 정보를 밀도 있게 보여줘야 하고, 상세는 필요할 때 열려야 한다.

좋은 화면의 느낌은 다음과 같다.

- role을 선택하면 바로 "지금 볼 사람들"이 보인다.
- Strong Fit, Verify First, Not This Role 같은 queue가 눈에 들어온다.
- table에서 fit, reason, risk, missing info, next action이 한 줄에 보인다.
- 후보를 열면 role-specific dossier가 먼저 보인다.
- 중요한 action은 한두 번의 클릭으로 끝난다.
- 메모와 판단이 다음 후보/다음 role에서 다시 살아난다.

반대로 피해야 할 화면은 다음과 같다.

- 후보 상세를 열어야만 판단 가능한 화면
- 태그가 많지만 무엇을 해야 할지 모르는 화면
- AI 점수는 있지만 이유가 없어 믿기 어려운 화면
- dashboard는 많지만 실제 후보 처리 속도는 그대로인 화면
- 회사 측 공개를 의식해서 내부 운영 속도가 희생된 화면

## 지금 당장 우선순위를 낮춰도 되는 것

아래 기능들은 언젠가 필요할 수 있지만, 지금 `/ops/matching`의 핵심 목적에는 덜 중요하다.

- 회사 측 공개용 polished view
- 면접 일정/offer/계약까지 포함한 full ATS 기능
- 복잡한 권한 체계
- 지나치게 많은 stage
- 자동 outreach sequence
- 시각적으로 화려한 dashboard
- 모든 후보에 대한 완벽한 profile enrichment

이런 기능은 내부 매칭 판단이 충분히 빨라진 뒤에 붙여도 늦지 않다. 지금은 "누구를 왜 먼저 볼지"를 해결하는 것이 먼저다.

## 가장 설득하고 싶은 결론

`/ops/matching`이 성공하려면 단순히 후보를 더 많이 보여줘서는 안 된다. 오히려 반대다. 너무 많은 후보를 그대로 보여주는 것은 운영자의 일을 줄이는 것이 아니라 늘린다.

이 페이지의 목적은 많은 후보를 **판단 가능한 형태로 압축**하는 것이다.

좋은 `/ops/matching`은 운영자에게 이렇게 말해주는 도구다.

> 이 role에서는 먼저 이 사람들을 보세요.  
> 이 사람은 이런 이유로 강합니다.  
> 이 사람은 좋아 보이지만 영어를 확인해야 합니다.  
> 이 사람은 기술은 맞지만 보상 risk가 있습니다.  
> 이 사람은 지금은 아니지만 다른 role에서 다시 볼 만합니다.  
> 이 후보군 전체를 보면, 우리가 막히는 지점은 영어가 아니라 role scope입니다.  
> 다음 action은 이 세 명을 shortlist에 넣고, 이 다섯 명에게 missing info를 확인하는 것입니다.

이 정도가 되어야 Harper 내부 운영자는 더 많은 사람을 관리하면서도 매칭 품질을 유지할 수 있다. Ashby가 보여주는 방향도 결국 이것이다. 대량 후보 운영에서 중요한 것은 "모든 정보를 보여주는 것"이 아니라, criteria, evidence, bucket, bulk action, feedback loop을 통해 사람이 더 좋은 결정을 더 빨리 하게 만드는 것이다.

Harper는 여기서 한 단계 더 나아갈 수 있다. 후보자의 선호와 관계, timing, 소개 가능성까지 함께 보는 도구가 되면, `/ops/matching`은 단순 ATS 화면이 아니라 Harper의 핵심 운영 엔진이 된다.

## 참고한 레퍼런스

- Ashby, AI Talent Rediscovery: https://www.ashbyhq.com/product-updates/ai-talent-rediscovery
- Ashby, AI in Recruiting: https://www.ashbyhq.com/ai
- Ashby, Candidate Search: https://docs.ashbyhq.com/candidate-search
- Ashby, Candidate Pipeline: https://docs.ashbyhq.com/candidate-pipeline
- Ashby, AI-Assisted Application Review: https://docs.ashbyhq.com/ai-assisted-application-review
- Ashby, Candidate Reviews: https://www.ashbyhq.com/product-updates/candidate-reviews
- Ashby, Analytics and Reporting: https://www.ashbyhq.com/platform/recruiting/analytics
- Gem, Recruiting CRM: https://www.gem.com/product/crm
- Greenhouse, Talent Filtering and Talent Rediscovery: https://www.greenhouse.com/blog/find-talent-faster-and-easier-with-greenhouse-talent-filtering-and-talent-rediscovery
- Greenhouse, Talent Pools: https://www.greenhouse.com/resources/glossary/what-are-talent-pools
- Workable, Search with AI: https://help.workable.com/hc/en-us/articles/115012750768-Using-Search-with-AI
