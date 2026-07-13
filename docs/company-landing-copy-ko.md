# Harper Company Landing Copy

작성일: 2026-07-11  
목표: `/company` 랜딩을 3개 섹션 안팎의 짧은 company-side 페이지로 재작성한다. 기존 `AI/ML talent`, `top 1%`, `AI search engine` 중심 문구를 걷어내고, Harper가 회사가 만나기 어려운 `Top talent`를 후보자 맥락과 관심도까지 보고 연결한다는 메시지로 정리한다. Harper가 AI이기 때문에 빠르게 기술적/도메인 맥락을 이해하고 후보자를 좁힐 수 있다는 장점도 함께 보여준다. 모든 주요 CTA는 `미팅 신청하기`로 통일한다.

## 리서치 범위

이번 문구는 아래 서비스들의 company-side 랜딩과 CTA 구조를 참고했다.

| 서비스 | 메인 패턴 | Harper에 적용할 점 |
| --- | --- | --- |
| Toptal | 검증된 상위 인재, 전문가와 니즈를 먼저 이야기, hand-selected talent | "검색"보다 "검증/선별/소개"를 먼저 말한다. |
| A.Team | `Tell us what you're building` 이후 2-3명의 curated shortlist | 후보자 수가 아니라 "바로 볼 만한 소수 후보"를 강조한다. |
| Paraform | expert recruiters + AI agents, 회사별 hiring preference 학습 | Harper도 회사의 기준을 학습하고 다음 연결이 좋아진다는 구조를 쓴다. |
| Wellfound Reach / Autopilot | sourcing, personalized outreach, scheduling을 대신 수행 | 회사가 직접 스크롤하고 아웃리치하는 부담을 줄인다는 메시지를 쓴다. |
| Arc | vetted & ready-to-interview talent, human support | "ready to interview"에 가까운 후보자 상태를 강조한다. |
| Turing / Lemon.io / Gun.io | vetted, curated, trial, delivery/governance | "Top talent"만 말하면 비어 보이므로, 어떤 기준으로 좁히는지 보여준다. |
| Dover | expert recruiter + logistics | 초기 팀이 채용 운영까지 직접 떠안지 않아도 된다는 문제를 건드린다. |
| hireEZ / SeekOut / Tezi | agentic AI가 sourcing/screening/outreach/scheduling 자동화 | AI 기능은 뒤에 두고, 결과물은 "후보자 맥락과 다음 대화"로 번역한다. |
| Noxx | 짧은 시간 안에 vetted shortlist, success fee | 짧고 직관적인 promise는 좋지만, 숫자는 Harper가 증명 가능한 범위에서만 쓴다. |

## 리서치에서 나온 결론

1. 가장 많이 반복되는 첫 화면 구조는 `니즈를 말하세요 -> 우리가 선별합니다 -> 빠르게 만나세요`다.
2. 강한 서비스일수록 `candidate database`보다 `curated shortlist`, `vetted`, `ready to interview`, `matched to your requirements`를 앞세운다.
3. AI recruiting 서비스들은 AI를 전면에 세우지만, 신뢰가 필요한 랜딩에서는 `expert recruiter`, `human support`, `judgment`, `personalized outreach`를 같이 둔다.
4. Harper가 그대로 따라 하면 안 되는 부분은 과한 숫자다. `top 1%`, `72 hours`, `12 days`, `70% lower cost` 같은 수치는 검증된 운영 데이터가 없으면 쓰지 않는다.
5. Harper의 진짜 차별점은 후보자 쪽 제품이 있다는 점이다. 후보자는 Harper와 대화하며 경력, 선호, 제약, 관심도, 정보 공유 범위를 남긴다. 회사용 랜딩은 이걸 "후보자 맥락까지 보고 소개한다"로 번역해야 한다.
6. AI의 장점은 전면의 hype가 아니라 속도와 맥락 이해로 써야 한다. 사람이 하나씩 읽기 어려운 기술 스택, 제품 구조, 도메인 배경, 후보자의 실제 프로젝트 신호를 빠르게 연결해 채용팀이 바로 검토할 수 있게 만든다는 식이 Harper에 맞다.

## 최종 포지셔닝

Harper는 채용 공고를 더 넓게 뿌리는 도구가 아니라, AI가 회사의 기술적/도메인 맥락과 후보자의 실제 맥락을 빠르게 읽고, 대화 가능한 Top talent를 선별해 연결하는 서비스다.

한 문장:

```text
채용 공고로는 닿기 어려운 Top talent를 만나세요.
```

보조 메시지:

```text
Harper는 AI로 회사가 찾는 역할의 기술 스택, 제품/도메인 맥락, 후보자의 실제 경력과 관심도를 함께 읽고
대화해볼 만한 인재만 선별해 소개합니다.
```

페이지 전체에서 반복할 키워드:

```text
Top talent
기술/도메인 맥락
후보자 맥락
빠른 맥락 파악
관심도 확인
선별 소개
미팅 신청
```

페이지 전체에서 피할 키워드:

```text
AI/ML talent
top 1%
AI search engine
autonomous intelligence
research-grade matching
GitHub/논문 기반으로만 찾습니다
2x / 4x / 25x
며칠 안에 반드시 소개
인터뷰 보장
```

## 랜딩 페이지 완성본

### Navigation

왼쪽:

```text
Harper
```

오른쪽 CTA:

```text
미팅 신청하기
```

동작:

- `CompanyMeetingRequestModal` 오픈
- 기존 `Use Search` 버튼은 숨긴다. 이번 페이지의 전환 목표는 self-serve search 사용이 아니라 company-side 미팅 신청이다.

참고:

```text
For teams hiring exceptional people
```

이 문구는 좋지만 페이지 상단에 보이는 보조 문구로는 쓰지 않는다. 필요하면 SEO description, social preview, sales deck 한 줄 소개에만 쓴다.

### Section 1. Hero

목적: 첫 화면에서 Harper가 단순 검색 도구가 아니라 Top talent 연결 서비스라는 점을 바로 이해시킨다.

H1:

```text
채용 공고로는 닿기 어려운
Top talent를 만나세요.
```

Body:

```text
Harper는 AI가 회사의 기술 스택, 제품/도메인 맥락, 후보자의 실제 경력과 관심도를 빠르게 읽고
대화해볼 만한 인재만 선별해 소개합니다.

사람이 수동으로 모두 비교하기 어려운 기술적 맥락과 커리어 신호까지 함께 봅니다.
더 많은 이력서가 아니라, 지금 만나야 할 후보자를 더 빠르게 검토하세요.
```

Primary CTA:

```text
미팅 신청하기
```

CTA 아래 보조 문구:

```text
15분 미팅으로 찾는 역할과 팀 상황을 먼저 듣습니다.
```

Hero visual에 넣을 수 있는 후보자 카드 문구:

```text
Candidate brief

왜 이 후보자인가
기술 스택, 도메인 경험, 최근 관심도, 선호 조건을 함께 정리합니다.

Status
Interest checked before intro
```

보조 trust row가 필요하면:

```text
Fit reason
역할에 맞는 기술/도메인 경험과 강점을 함께 정리

Context read
AI가 역할과 후보자 신호를 빠르게 비교

Candidate signal
최근 관심도와 커리어 방향 반영

Intro status
후보자 검토 후 연결 진행
```

### Section 2. Why Harper

목적: 왜 기존 채용 공고, LinkedIn search, 일반 에이전시와 다른지 짧게 설명한다.

Headline:

```text
AI가 기술과 도메인 맥락을 먼저 읽고,
Harper가 대화할 만한 사람만 좁힙니다.
```

Body:

```text
좋은 후보자는 단순 키워드 검색으로 찾기 어렵습니다.
Harper는 AI로 역할 설명, 기술 스택, 제품 단계, 도메인 배경, 후보자의 실제 프로젝트와 커리어 방향을 함께 해석합니다.
그래서 채용팀이 며칠씩 수동으로 찾고 비교하던 일을 더 빠르게 시작할 수 있습니다.
```

3개 포인트:

```text
01. 역할 맥락부터 이해
포지션명만 받지 않습니다. 팀 단계, 필요한 책임 범위, 꼭 맞아야 하는 조건과 타협 가능한 조건을 먼저 정리합니다.

02. 기술/도메인 맥락을 빠르게 해석
일반적인 키워드 매칭이 놓치기 쉬운 아키텍처, 툴체인, 제품 단계, 산업 배경까지 함께 읽습니다.

03. 후보자 맥락과 관심도 확인
경력 키워드만 보는 대신 실제 프로젝트, 공개 작업물, 커리어 방향, 근무 조건을 함께 봅니다.
후보자가 검토할 수 있는 맥락을 먼저 전달하고, 관심이 확인된 경우에만 회사와의 연결로 이어갑니다.
```

Section CTA:

```text
미팅 신청하기
```

CTA 주변 짧은 문구:

```text
찾는 역할이 아직 정리되지 않았어도 괜찮습니다.
```

### Section 3. How It Works

목적: 프로세스를 단순하게 보여주고 마지막 CTA로 전환시킨다.

Headline:

```text
미팅 한 번으로 시작하고,
후보자는 Harper가 좁혀드립니다.
```

Body:

```text
채용팀이 모든 후보자를 직접 찾고 설득할 필요가 없도록,
Harper가 AI로 기술적/도메인 적합도를 먼저 읽고 소개 가능한 후보자를 추립니다.
```

3단계:

```text
1. 니즈를 듣습니다
역할, 팀 상황, 필요한 역량, 지금 채용에서 막히는 지점을 15분 미팅에서 정리합니다.

2. 후보자를 좁힙니다
Harper의 후보자 네트워크와 공개 시그널을 바탕으로, 기술 스택과 도메인 맥락까지 맞을 가능성이 높은 인재를 빠르게 검토합니다.

3. 맥락과 함께 소개합니다
관심이 확인된 후보자를 이력서만이 아니라 fit 이유와 함께 전달해, 바로 의미 있는 대화로 이어질 수 있게 합니다.
```

Closing headline:

```text
지금 필요한 Top talent를 함께 찾아보세요.
```

Closing body:

```text
채용 중인 역할과 팀 상황을 남겨주시면,
Harper가 어떤 후보자 풀을 열 수 있는지 먼저 확인해드리겠습니다.
```

Final CTA:

```text
미팅 신청하기
```

CTA 아래 보조 문구:

```text
보통 영업일 기준 1일 내에 연락드립니다.
```

## 미팅 신청 모달 문구

현재 `CompanyMeetingRequestModal`의 `AI/ML 엔지니어` 예시를 일반 Top talent 중심으로 바꾼다.

Modal title:

```text
미팅 신청하기
```

Modal description:

```text
팀의 상황, 찾고 있는 역할, 지금 채용에서 막히는 지점을 간단히 남겨주세요.
Harper가 확인 후 영업일 기준 1일 내에 연락드리겠습니다.
```

Fields:

```text
이름
이메일
회사
찾고 있는 역할 또는 채용 목표
```

Goal placeholder:

```text
예: 초기 제품팀에 합류할 시니어 엔지니어를 찾고 있어요. 기술 역량뿐 아니라 작은 팀에서 직접 문제를 정의해본 경험이 중요합니다.
```

Submit button:

```text
미팅 신청하기
```

Submitting:

```text
신청 중...
```

Success toast:

```text
미팅 신청이 접수되었습니다. 영업일 기준 1일 내에 연락드리겠습니다.
```

## 현재 `/company` 문구 교체표

```text
Built by & for AI Talents
-> 삭제. Hero 위 작은 라벨은 쓰지 않는다.
   `For teams hiring exceptional people`은 필요하면 SEO description, social preview, sales deck 한 줄 소개에만 쓴다.
```

```text
Hire the top 1% of AI/ML talent in days, not months.
-> 채용 공고로는 닿기 어려운 Top talent를 만나세요.
```

```text
Skip the months of searching. Connect with proven researchers and engineers for both full-time roles and part-time projects today.
-> Harper는 AI가 회사의 기술 스택, 제품/도메인 맥락, 후보자의 실제 경력과 관심도를 빠르게 읽고 대화해볼 만한 인재만 선별해 소개합니다.
```

```text
Get Started Now / Schedule Demo
-> 미팅 신청하기
```

```text
Our Approach
-> 삭제. 섹션 위 작은 보조 라벨은 쓰지 않는다.
```

```text
Hire at the speed of AI
-> AI가 기술과 도메인 맥락을 먼저 읽고, Harper가 대화할 만한 사람만 좁힙니다.
```

```text
Deep indexing
-> 역할 맥락부터 이해
```

```text
High-velocity matching
-> 기술/도메인 맥락을 빠르게 해석
```

```text
Harper remembers
-> 후보자 맥락과 관심도 확인
```

```text
Hyper-focused on AI/ML
-> Top talent, matched with context
```

```text
Traditional agencies
-> 기존 채용 방식
```

```text
Weeks of manual filtering for generic, mismatched profiles.
-> 많은 지원자와 반복 아웃리치 속에서 진짜 맞는 후보자를 찾기 어렵습니다.
```

```text
Harper
-> Harper
```

```text
Within 7 days, research-grade matching for the top of AI Talent.
-> AI가 역할의 기술적/도메인 맥락과 후보자 관심도를 함께 보고, 소개 가능한 후보자만 빠르게 좁혀드립니다.
```

## 대안 헤드라인

추천 H1:

```text
채용 공고로는 닿기 어려운 Top talent를 만나세요.
```

더 담백한 버전:

```text
회사에 꼭 맞는 Top talent를 더 빠르게 만나세요.
```

더 founder/초기팀 대상:

```text
핵심 포지션에 맞는 사람을 찾는 일, Harper가 먼저 좁혀드립니다.
```

더 candidate-side 차별점을 살린 버전:

```text
후보자의 관심도까지 확인된 Top talent를 만나세요.
```

AI 장점을 더 직접적으로 살린 버전:

```text
AI가 기술 맥락까지 읽고, 대화할 만한 Top talent를 좁혀드립니다.
```

짧은 CTA 옆 보조 문구 후보:

```text
찾는 역할이 정리되지 않았어도 괜찮습니다.
```

```text
후보자 풀과 진행 가능성을 먼저 확인해드립니다.
```

```text
팀 상황을 듣고 가장 빠른 연결 방식을 제안드립니다.
```

## 톤 가이드

써야 하는 톤:

- 담백한 B2B 톤
- 과장보다 선별과 신뢰
- "후보자를 많이 보여준다"보다 "대화할 만한 사람을 좁힌다"
- AI는 숨기지 않는다. 다만 "AI라서 빠르게 기술/도메인 맥락을 읽고 후보자를 좁힌다"로 표현한다.
- "AI가 자동으로 다 한다"보다 "Harper가 AI로 후보자 맥락까지 보고 판단한다"

피해야 하는 톤:

- 너무 미국식 hype
- 검증되지 않은 숫자
- `AI recruiter`를 전면에 세우는 표현
- 후보자 동의 없이 회사에 프로필을 보낸다는 인상
- "무조건 인터뷰로 이어진다"는 보장성 표현

## 참고 링크

- Toptal: https://www.toptal.com/
- A.Team hire tech talent: https://www.a.team/hire-tech-talent
- A.Team get started: https://www.a.team/get-started
- Paraform: https://www.paraform.com/
- Wellfound Reach: https://reach.wellfound.com/
- Wellfound Autopilot: https://reach.wellfound.com/autopilot
- Arc: https://arc.dev/
- Turing: https://www.turing.com/hire-developers
- Gun.io: https://gun.io/
- Lemon.io: https://lemon.io/
- Dover: https://www.dover.com/
- hireEZ: https://hireez.com/
- SeekOut: https://www.seekout.com/
- Noxx: https://www.noxx.ai/
- Tezi: https://tezi.ai/
