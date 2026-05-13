# `pages/index.tsx` 카피/디자인 리서치

조사일: 2026-05-13  
대상 파일: `src/pages/index.tsx`  
타겟: 이직을 준비 중이거나, 당장 이직 의사는 없지만 진짜 좋은 회사라면 합류할 의향이 있는 뛰어난 인재, 현재는 주로 엔지니어.

## 결론

현재 페이지의 큰 방향은 맞다. "내가 채용공고를 뒤지는 대신 Harper가 좋은 기회를 찾아준다", "수락하기 전까지 조용하다", "회사와 직접 연결된다"는 축은 타겟에게 매력적이다.

다만 지금 표현은 신뢰가 필요한 타겟에게 약간 추상적이고 과하다. 특히 `탤런트`, `AI 커리어 agent`, `완벽한 기회`, `압도적으로`, `역량 5%` 같은 표현은 제품을 정확히 설명하기보다 AI 랜딩 페이지처럼 보이게 만든다. 이 타겟은 "새로운 AI 서비스"보다 "뛰어난 헤드헌터가 나를 알고 있다가 좋은 기회만 조용히 가져오는 느낌"에 더 반응할 가능성이 높다.

추천 포지셔닝:

> Harper는 뛰어난 엔지니어가 지금 일에 집중하는 동안, 조건에 맞는 글로벌 커리어 기회를 조용히 찾아 브리핑하고, 수락한 기회만 직접 연결하는 전담 커리어 파트너입니다.

히어로 후보:

> 이직을 서두르지 않아도, 좋은 기회는 놓치지 않게.

보조 문구:

> 원하는 역할, 보상, 지역, 비자, 근무 방식을 Harper에게 알려주세요. Harper가 맞는 회사와 포지션을 선별해 브리핑하고, 관심 있는 기회만 창업자나 채용 리더에게 직접 연결합니다. 동의 전에는 프로필이 공개되지 않습니다.

## 외부 자료에서 얻은 기준

### 1. 이 타겟은 "구직자"보다 "open talent"에 가깝다

LinkedIn은 passive candidate를 "적극적으로 새 직장을 찾지는 않지만 좋은 역할에는 열려 있는 사람"으로 설명한다. 이들에게는 짧고 개인화된 접근, "나에게 왜 좋은가", 다음 단계의 명확성이 중요하다고 정리한다. 또한 passive candidate는 긴 지원서나 복잡한 절차에 시간을 쓰지 않는다고 한다.

시사점:

- "이직 준비 중인 사람"만 부르면 타겟이 좁아진다.
- "좋은 기회라면 열려 있는 엔지니어"를 직접 호명해야 한다.
- 지원서 작성, 공고 검색, 반복 지원을 줄여주는 가치가 앞에 와야 한다.
- "수락한 기회만 직접 연결"과 "동의 전 비공개"를 초반에 보여줘야 한다.

참고:

- LinkedIn, [How to Recruit Passive Candidates](https://www.linkedin.com/business/talent/blog/talent-acquisition/how-to-recruit-passive-candidates)
- LinkedIn, [Beyond Active vs. Passive: Open Talent](https://www.linkedin.com/business/talent/blog/product-tips/beyond-active-vs-passive-how-brands-like-dropbox-tap-into-open-talent)

### 2. 엔지니어에게는 AI 자체보다 신뢰, 맥락, 조건이 더 중요하다

LinkedIn의 2025 후보자 우선순위 자료는 엔지니어가 보상, 워라밸, 유연근무를 중요하게 보고, 다른 직군 대비 innovative projects, talented employees, challenging and impactful work에 더 반응한다고 정리한다.

Stack Overflow 2025 Developer Survey는 개발자가 AI 도구를 많이 쓰지만 정확도 신뢰는 낮다고 설명한다. 또 개발자가 기술을 평가할 때 AI 기능 자체보다 API, 품질, 신뢰성, 비용 같은 기본 요소를 우선한다고 한다. 직장 만족도 측면에서는 autonomy and trust, competitive pay, solving real-world problems가 중요하게 언급된다.

시사점:

- "AI agent"를 헤드라인에 세우면 차별점이 아니라 의심 포인트가 될 수 있다.
- 엔지니어 타겟에게는 회사/역할 판단 정보가 더 중요하다: 보상 범위, 비자, 리모트, 팀 수준, 프로젝트 난이도, 제품/기술 맥락, 왜 나와 맞는지.
- "AI가 찾아준다"보다 "조건을 이해하고, 좋은 기회만 브리핑한다"가 더 설득력 있다.

참고:

- LinkedIn, [What Candidates Want in 2025](https://www.linkedin.com/business/talent/blog/talent-acquisition/what-candidates-want-in-2025)
- Stack Overflow, [2025 Developer Survey](https://survey.stackoverflow.co/2025/)
- Stack Overflow, [2025 Developer Survey - Work](https://survey.stackoverflow.co/2025/work)
- Stack Overflow Blog, [Developers remain willing but reluctant to use AI](https://stackoverflow.blog/2025/12/29/developers-remain-willing-but-reluctant-to-use-ai-the-2025-developer-survey-results-are-here/)

### 3. 전문가에게도 쉬운 문구가 더 좋다

NN/g는 전문가도 불필요한 전문용어보다 짧고 명확한 정보를 선호한다고 정리한다. 웹에서는 첫 10초 안에 가치 제안을 명확히 전달해야 하고, 사용자는 많은 텍스트를 읽기보다 스캔한다.

시사점:

- "커리어의 지평", "최고의 모습", "완벽한 기회"보다 "조건에 맞는 기회만", "수락 전 비공개", "직접 소개"가 낫다.
- 문단은 짧게. 한 문단에 한 메시지만.
- 섹션 제목만 훑어도 제품이 이해돼야 한다.

참고:

- NN/g, [How Long Do Users Stay on Web Pages?](https://www.nngroup.com/articles/how-long-do-users-stay-on-web-pages/)
- NN/g, [Plain Language Is for Everyone, Even Experts](https://www.nngroup.com/articles/plain-language-experts/)

### 4. Footer는 신뢰에 도움 된다. 다만 footer만으로 해결되지 않는다

NN/g는 footer가 사용자가 연락처, 회사 정보, 개인정보, 약관, 보조 탐색을 찾는 곳이라고 설명한다. About Us 요약도 신뢰 형성에 도움이 된다. 다만 중요한 신뢰 요소를 footer에만 숨기면 늦다. privacy와 company legitimacy는 본문 중간에도 한 번 보여주는 편이 낫다.

시사점:

- 현재 footer는 너무 얇다. "개인정보", "Linkedin" 오타성 링크, "문의"만으로는 신뢰가 부족하다.
- footer에는 법인명, 연락처, 회사 소개, For Companies, Privacy, Terms, LinkedIn, help/docs가 있어야 한다.
- "동의 전 프로필 비공개" 같은 핵심 신뢰 메시지는 hero/demo 근처에도 있어야 한다.

참고:

- NN/g, [Footers 101](https://www.nngroup.com/articles/footers/)
- NN/g, [Great Summaries on About Us Pages Engage Users and Build Trust](https://www.nngroup.com/articles/about-us-summaries/)

### 5. `탤런트`는 한국어 페이지의 주 타겟 표현으로 부적합하다

한국민족문화대백과사전은 `탤런트`를 방송 출연 연기자 의미로 설명한다. WordReference도 talent의 사람 의미를 `인재`로 먼저 번역하고, `탤런트/연예인`은 별도 의미로 제시한다.

시사점:

- 한글 카피에서는 `탤런트` 대신 `인재`, `엔지니어`, `후보자`, `회원님`, `전문가`를 쓰는 편이 자연스럽다.
- 영어 `Talent`를 꼭 쓰고 싶다면 한국어 본문에서는 `인재`로 풀고, 내부 상태명이나 B2B 문맥에만 제한적으로 쓰는 것이 낫다.

참고:

- 한국민족문화대백과사전, [탤런트](https://encykorea.aks.ac.kr/Article/E0059136)
- WordReference, [talent 영한 사전](https://www.wordreference.com/enko/talent)

### 6. "바이브코딩스러움"은 추상 카피와 무의미한 장식에서 온다

Fountain Institute는 vibe-coded UI의 신호로 제품 맥락 없는 장식, 과한 컬러, 모든 것을 카드로 감싸는 패턴, 의미 없는 상태 표시를 지적한다. designdotmd는 AI 랜딩 페이지가 보라/파랑 그라데이션, 유리 카드, pill 버튼, 3개 feature card 같은 기본값으로 수렴한다고 설명한다.

시사점:

- 현재 페이지는 보라 그라데이션은 없지만, 베이지 단일 톤, 큰 세리프 헤딩, 둥근 카드, 장식 오브젝트, "agent" 반복이 합쳐져 약간 생성형 랜딩 느낌이 난다.
- 시각적으로는 "업무 화면", "브리핑", "조건표", "비공개 상태" 같은 실제 제품 정보가 장식보다 앞서야 한다.

참고:

- The Fountain Institute, [7 Signs a UI Has Been Vibe Coded](https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui)
- designdotmd, [Why every AI landing page looks the same](https://freedesignmd.com/blog/why-ai-landing-page-looks-generic)

### 7. 유사 서비스는 "AI"보다 "좋은 기회, 선별, 검증, 수고 절감"을 앞세운다

Mercor는 "elite opportunities", "single application", "remote AI roles"처럼 기회와 편의성을 앞세운다. A.Team은 "vetted network", "curated matches", "zero admin overhead", "high-impact work"를 강조한다. YC Work at a Startup은 "single profile"로 여러 스타트업에 닿는 편의성을 강조한다.

시사점:

- Harper도 "AI"보다 "선별된 기회", "좋은 회사와 직접 연결", "내 기준에 맞는 브리핑", "지원 반복 제거"를 앞세우는 편이 더 선명하다.
- 단, Harper는 Mercor/A.Team 같은 공개 프로젝트 마켓플레이스가 아니라 개인 헤드헌터 경험에 가까워야 한다. "내가 고르는 job board"보다 "나를 알고 좋은 기회를 가져오는 파트너"가 차별점이다.

참고:

- Mercor, [Home](https://www.mercor.com/)
- A.Team, [Join](https://www.a.team/join)
- Y Combinator, [Jobs](https://www.ycombinator.com/jobs/)

## 현재 페이지 진단

### 좋은 점

- 타겟의 실제 욕구와 맞는 방향이 있다: 좋은 기회만, 조용히, 직접 연결.
- 데모 섹션이 단순 랜딩보다 제품을 보여준다.
- `비공개 대화`, `익명 보장`, `Open to matches` 같은 신뢰 요소의 씨앗이 있다.
- 회사/포지션 예시가 글로벌 AI 엔지니어 타겟과 맞는다.

### 아쉬운 점

| 현재 요소 | 문제 | 수정 방향 |
|---|---|---|
| `탤런트만을 위해 설계된 AI 커리어 agent` | 한국어 `탤런트`가 어색하고, `AI agent`가 먼저 보여서 기능보다 유행어처럼 보임 | `좋은 기회라면 열려 있는 엔지니어를 위한 전담 커리어 파트너` |
| `나를 위한 완벽한 기회` | 완벽함은 검증 불가능하고 과장으로 보임 | `조건에 맞는 좋은 기회`, `내 기준을 통과한 기회` |
| `이제 Agent가 찾아옵니다` | agent가 무엇을 하는지 불명확 | `Harper가 먼저 브리핑합니다`, `Harper가 조용히 찾아옵니다` |
| `1시간 이내 첫 매칭` | 실제 SLA가 아니면 신뢰 리스크 | `몇 분 안에 기준 정리`, `좋은 기회가 생기면 먼저 알림` |
| `완전 무료` | 가볍고 B2C 앱 느낌 | `후보자에게 비용 없음` |
| `익명 보장` | 어디까지 익명인지 모호 | `동의 전 프로필 비공개`, `수락한 기회에만 소개` |
| `역량 5%도 담아낼 수 없다` | 근거 없는 숫자 | `이력서만으로는 최근 성과와 선호를 설명하기 어렵습니다` |
| `수락시` | 맞춤법/톤 문제 | `수락하면` |
| `Founder에게 직접 소개` | 모든 케이스가 founder는 아닐 수 있음 | `창업자 또는 채용 리더에게 직접 소개` |
| `96% 적합` | 가짜 정밀도처럼 보임 | `소개 가능`, `조건 맞음`, `비자 이력 확인`, `보상 범위 확인` |
| `Talk to Harper` | 한국어 페이지에서 CTA가 영어라 거리감 | `Harper와 기준 정하기`, `조용히 시작하기`, `기회 받아보기` |

## 추천 메시지 원칙

1. `AI`를 전면이 아니라 방법으로 둔다.
2. `탤런트` 대신 `엔지니어`, `인재`, `후보자`, `회원님`을 쓴다.
3. "구직 중"이 아니라 "좋은 기회에는 열려 있음"을 호명한다.
4. 결과보다 과정의 신뢰를 말한다: 기준 정리, 선별, 브리핑, 수락, 직접 연결.
5. 익명과 정보 공개 범위를 구체적으로 쓴다.
6. 채용 공고/리크루터 DM과 비교하되, 리크루터를 너무 악역화하지 않는다. 사용자가 이미 좋은 헤드헌터 경험을 원한다고 보기 때문이다.
7. 과장형 형용사를 줄인다: 완벽한, 압도적인, 최고의, 모든, 누구도 가지지 못한.
8. 숫자는 실제 근거가 있을 때만 쓴다.

## 히어로 카피 후보

### 1안: 가장 추천

태그:

> 좋은 기회라면 열려 있는 엔지니어를 위해

H1:

> 이직을 서두르지 않아도,  
> 좋은 기회는 놓치지 않게.

본문:

> 원하는 역할, 보상, 지역, 비자, 근무 방식을 Harper에게 알려주세요. Harper가 맞는 회사와 포지션을 선별해 브리핑하고, 관심 있는 기회만 창업자나 채용 리더에게 직접 연결합니다.

보조 신뢰 문구:

> 후보자에게 비용 없음 · 동의 전 프로필 비공개 · 수락한 기회만 연결

CTA:

> Harper와 기준 정하기

### 2안: 헤드헌터 니즈를 더 직접적으로

태그:

> 엔지니어를 위한 전담 커리어 파트너

H1:

> 좋은 헤드헌터가 나를 전담한다면,  
> 이런 방식이어야 합니다.

본문:

> Harper는 당신의 경력과 선호를 이해한 뒤, 맞을 가능성이 높은 회사만 조용히 가져옵니다. 공고를 뒤지거나 불필요한 DM을 받을 필요 없이, 관심 있는 기회만 직접 소개로 이어집니다.

CTA:

> 내 기준 알려주기

주의: 이 버전은 강하지만 "헤드헌터" 단어가 너무 전면에 오면 AI/제품 차별점이 흐려질 수 있다.

### 3안: 글로벌 기회 강조

태그:

> 한국의 뛰어난 엔지니어에게 글로벌 기회를

H1:

> 내 기준에 맞는 글로벌 AI 회사,  
> Harper가 먼저 찾아봅니다.

본문:

> 보상, 비자, 리모트, 팀 규모까지 한 번에 고려해 좋은 기회만 브리핑합니다. 관심이 생긴 기회는 Harper가 창업자나 채용 리더에게 직접 연결합니다.

CTA:

> 글로벌 기회 받아보기

주의: 글로벌 기회를 실제로 충분히 제공할 수 있을 때만 사용.

## 섹션 구조 제안

### 1. Hero

목표: 10초 안에 누구를 위한 서비스인지, 무엇을 대신 해주는지, 안전한지 전달.

구성:

- 타겟 태그
- 명확한 H1
- 2문장 이하 설명
- CTA
- 신뢰 칩 3개: `후보자에게 비용 없음`, `동의 전 비공개`, `수락한 기회만 연결`
- decorative `objects.png`보다 실제 브리핑/대화 UI를 첫 화면에 노출

### 2. Social proof

현재:

> 150+ engineers and researchers From  
> Partnering with Most Exciting Tech companies funded by the world's elite.

수정:

> 서울대, KAIST, Stanford 출신 엔지니어와 연구자 150명 이상이 Harper에 합류했습니다.

또는 근거가 애매하면:

> Harper는 글로벌 AI 회사와 성장 스타트업 기회를 추적하고 있습니다.

파트너 로고는 실제 파트너/고객/관계가 명확해야 한다. 단순 추천 대상 회사나 투자자 로고라면 법적/신뢰 리스크가 있다. `Partnering with`는 특히 조심해야 한다.

### 3. Demo

현재 demo는 방향이 좋다. 다만 제목을 더 구체화한다.

제목 후보:

> 기준을 말하면, Harper가 기회를 브리핑합니다.

본문 후보:

> 지역, 비자, 보상, 근무 방식처럼 검색으로 확인하기 번거로운 조건을 먼저 정리합니다. Harper는 공개 포지션과 직접 연결 가능한 기회를 함께 살피고, 맞는 이유와 확인할 리스크를 브리핑합니다.

데모 카드에서 바꿀 것:

- `96% 적합` 제거
- `소개 가능`, `비자 스폰서 이력`, `보상 범위 확인`, `리모트 가능성`, `확인 필요` 같은 판단 가능한 라벨 사용
- 회사 브리핑에는 "왜 맞는지", "확인된 조건", "리스크", "다음 단계"를 보여주기

### 4. How it works

현재 3단계를 더 단단하게 바꾼다.

1. `기준을 정리합니다`  
   전화나 채팅으로 역할, 보상, 지역, 비자, 회사 단계, 피하고 싶은 조건을 정리합니다. 이력서를 새로 쓰기보다 지금의 성과와 선호를 최신 상태로 맞춥니다.

2. `맞는 기회만 브리핑합니다`  
   Harper가 공개 포지션과 직접 연결 가능한 기회를 함께 살피고, 당신의 기준을 통과한 기회만 이유와 리스크까지 정리해 전달합니다.

3. `수락한 기회만 직접 연결합니다`  
   관심 있다고 답한 기회만 창업자, hiring manager, 채용 리더와의 소개로 이어집니다. 수락 전에는 프로필이 자동으로 공유되지 않습니다.

### 5. Why Harper

현재 `Harper는, 이렇게 달라요`는 유지 가능하다. 단, 문구를 덜 선언적으로.

수정안:

1. `공고가 아니라, 내 기준에서 시작합니다.`  
   Harper는 열려 있는 포지션을 많이 보여주는 대신, 당신이 실제로 옮길 만한 조건을 먼저 이해합니다.

2. `이력서보다 최근 맥락을 봅니다.`  
   이력서에 없는 최근 프로젝트, 관심 분야, 피하고 싶은 환경까지 반영해 추천을 조정합니다.

3. `지금 일하는 동안에도 조용히 봅니다.`  
   당장 지원하지 않아도 됩니다. 맞는 기회가 생겼을 때만 브리핑을 받습니다.

4. `풀타임만 보지 않습니다.`  
   풀타임, 계약, 단기 자문, 어드바이저리처럼 전문성을 활용할 수 있는 기회를 함께 검토합니다.

### 6. Trust/Privacy 섹션 추가 권장

현재 footer와 hero 칩만으로는 부족하다. 중간에 작은 trust 섹션을 둔다.

제목:

> 회사에 공유되는 정보는 당신이 정합니다.

본문:

> Harper는 먼저 기회가 맞는지 회원님에게 확인합니다. 연결을 수락하지 않은 상태에서 프로필 전체가 자동으로 회사에 전달되지 않습니다. `Open to matches`를 켠 경우에도 실제 연결 요청이 오면 먼저 검토하고 수락할 수 있습니다.

근거: 이 내용은 현재 `docs/career-help/general/connection-data-visibility.mdx`의 제품 설명과도 맞다.

### 7. Success stories

현재 문구는 쓸 수 있지만 더 신뢰 있게 정리해야 한다.

주의:

- 실제 사용자가 아니라면 "Success Stories" 대신 "초기 사용자 인터뷰"나 "Harper가 만들고 싶은 경험"처럼 낮춰야 한다.
- 익명 후기는 괜찮지만 최소한 역할, 지역, 연결 유형을 구체적으로 둬야 한다.
- "곧 합류할 예정" 같은 결과성 문구는 실제 사실일 때만 사용.

### 8. CTA

현재:

> 모두가 원했지만 누구도 가지지 못했던, 당신만을 위해 움직이는 agent.

수정:

> 좋은 기회에만 열려 있고 싶다면,  
> 기준부터 조용히 정리해두세요.

본문:

> 몇 분만 대화하면 Harper가 원하는 역할, 보상, 지역, 비자, 근무 방식을 이해합니다. 맞는 기회가 생기면 이유와 리스크를 함께 브리핑합니다.

CTA:

> Harper와 기준 정하기

## Footer 제안

현재 footer:

- `© 2026 Harper — 오직 탤런트만을 위해 만들었습니다.`
- `채용 담당자이신가요? →`
- `개인정보`
- `Linkedin`
- `문의`

문제:

- 회사 정보가 거의 없다.
- `Linkedin`이 terms 링크로 연결되어 있어 오타/신뢰 문제로 보인다.
- B2B와 B2C 링크가 섞여 있다.
- 연락처는 있지만 회사 실체를 확인할 단서가 부족하다.

추천 footer 구조:

```text
Harper
좋은 기회라면 열려 있는 엔지니어를 위한 전담 커리어 파트너.
hello@matchharper.com

For Talent
- Harper 시작하기
- 기회 추천 방식
- 개인정보 공개 범위
- 도움말

For Companies
- 인재 추천 요청
- Harper for Companies
- 문의하기

Company
- About
- Blog
- LinkedIn
- Careers

Legal
- 개인정보처리방침
- 이용약관
- 후보자 데이터 처리 안내
```

법인명, 대표자, 사업자등록번호, 주소, 직업정보제공사업 신고 여부가 있다면 footer 하단에 넣는 것을 권장한다. 채용/헤드헌팅에 가까운 서비스라면 회사 실체와 개인정보 처리 신뢰가 특히 중요하다.

단, footer에만 의존하지 말고 본문 중간에도 privacy/trust 블록을 둬야 한다.

## 디자인 수정 방향

### 폰트 크기

현재 크기:

- Hero H1: mobile 34px, sm 44px, desktop 약 54px
- Section H2: desktop 44px
- Final CTA H2: desktop 54px
- Body: 15-18px

판단:

- 숫자만 보면 과하게 큰 편은 아니지만, 중앙 정렬, 세리프 헤딩, 넓은 여백, 추상 카피가 합쳐져 "마케팅 hero" 느낌이 강하다.
- 타겟이 엔지니어이고 서비스가 신뢰 기반이면 hero를 조금 낮추고 product UI/브리핑 정보를 더 올리는 편이 낫다.

추천:

| 요소 | 현재 | 추천 |
|---|---:|---:|
| Hero H1 desktop | 54px | 44-48px |
| Hero H1 mobile | 34px | 30-32px |
| Section H2 desktop | 44px | 34-40px |
| Final CTA H2 desktop | 54px | 40-44px |
| Card title | 22-30px | 18-24px |
| Body | 15-18px | 15-16px 유지 |
| Letter spacing | `tracking-[-0.03em]` 일부 사용 | 한국어는 0 권장 |

### 폰트

현재 `font-instrument`가 한국어 heading에 많이 쓰인다. Instrument Serif는 영어에는 개성이 있지만, 한국어 페이지 전체에 쓰면 고급스럽다기보다 에디토리얼/포트폴리오 느낌이 날 수 있다.

추천:

- 한국어 H1/H2는 `PretendardVariable` 중심으로 간다.
- `Instrument Serif`는 Harper 로고, 짧은 영어 단어, 숫자, 인용 정도에 제한한다.
- `Agent`, `Open to matches`, `Founder` 같은 영어를 꼭 써야 하는 경우에는 설명을 붙이거나 한국어로 바꾼다.

### Radius와 카드

현재 카드/폰 mockup에 `rounded-[22px]`, `rounded-[24px]`, `rounded-[26px]`가 많다. 부드럽지만 "AI 랜딩 카드" 느낌을 키운다.

추천:

- 일반 정보 카드: 10-12px
- 제품 mockup: 16-20px
- 버튼: 10-12px
- 태그/chip: 8-10px
- nested card를 줄이고, 표/브리핑/리스트는 선과 여백으로 계층을 만든다.

### 색

현재 beige 계열이 강하다. 따뜻하고 브랜드감은 있지만, 전체가 한 톤으로 읽혀 정보 계층이 흐려질 수 있다.

추천:

- 배경은 beige 유지 가능.
- 텍스트는 더 중립적인 ink 계열을 늘린다.
- trust/privacy/action 상태에는 muted green 또는 slate를 제한적으로 쓴다.
- accent color는 1개만 정해서 CTA와 핵심 상태에 사용한다.
- 보라/파랑 AI gradient, glass card, 의미 없는 glow는 사용하지 않는다.

### 첫 화면 구성

현재 첫 화면은 큰 선언문과 장식 이미지가 중심이다. 타겟에게는 실제로 어떤 브리핑을 받는지가 더 중요하다.

추천:

- hero 오른쪽 또는 아래에 실제 Harper briefing preview를 둔다.
- `objects.png`는 제거하거나 하단 장식으로 낮춘다.
- 첫 화면 안에서 최소한 아래 4개가 보여야 한다:
  - 누구를 위한 서비스인가
  - Harper가 무엇을 대신 하는가
  - 개인정보가 어떻게 보호되는가
  - 시작하면 무엇을 하게 되는가

## 바로 적용 가능한 카피 세트

### SEO

Title:

> Harper - 좋은 기회라면 열려 있는 엔지니어를 위한 커리어 파트너

Description:

> Harper는 엔지니어의 경력과 선호를 이해하고, 조건에 맞는 회사와 포지션만 선별해 브리핑합니다. 관심 있는 기회만 창업자나 채용 리더에게 직접 연결합니다.

### Header

- `Success Stories` -> `후기`
- `For Companies` -> `기업용`
- `Join` -> `시작하기`

### Hero

태그:

> 좋은 기회라면 열려 있는 엔지니어를 위해

H1:

> 이직을 서두르지 않아도,  
> 좋은 기회는 놓치지 않게.

본문:

> 원하는 역할, 보상, 지역, 비자, 근무 방식을 Harper에게 알려주세요. Harper가 맞는 회사와 포지션을 선별해 브리핑하고, 관심 있는 기회만 직접 연결합니다.

CTA:

> Harper와 기준 정하기

칩:

- 후보자에게 비용 없음
- 동의 전 프로필 비공개
- 수락한 기회만 연결

### Demo

태그:

> 기회 브리핑

H2:

> 기준을 말하면,  
> Harper가 맞는 기회를 정리합니다.

본문:

> 지역, 비자, 보상, 근무 방식처럼 직접 확인하기 번거로운 조건을 먼저 정리합니다. Harper는 공개 포지션과 직접 연결 가능한 기회를 함께 살피고, 맞는 이유와 확인할 리스크를 브리핑합니다.

### Workflow

H2:

> 지원하기 전에, 먼저 맞는지 판단하세요.

본문:

> Harper는 회사와 역할의 맥락을 먼저 정리합니다. 관심 있는 기회만 수락하면 창업자나 채용 리더와의 직접 연결로 이어집니다.

Cards:

1. `기준을 정리합니다`  
   역할, 보상, 지역, 비자, 회사 단계, 선호하지 않는 조건까지 대화로 정리합니다.

2. `기회만 골라 브리핑합니다`  
   조건에 맞는 회사와 포지션을 찾고, 왜 맞는지와 확인할 리스크를 함께 전달합니다.

3. `수락한 기회만 연결합니다`  
   관심 있다고 답한 기회만 창업자나 채용 리더에게 소개합니다. 수락 전에는 프로필이 자동 공유되지 않습니다.

### Why Harper

H2:

> Harper는 공고 목록이 아니라,  
> 당신의 기준에서 시작합니다.

Rows:

- `좋은 기회라면 열려 있는 사람을 위해`  
  당장 이직을 결심하지 않아도 괜찮습니다. Harper는 지금 일에 집중하는 동안에도 맞는 기회가 생기면 알려줍니다.

- `이력서보다 최근 맥락까지`  
  최근 프로젝트, 관심 있는 문제, 피하고 싶은 환경까지 반영해 추천을 조정합니다.

- `스팸이 아니라 브리핑`  
  회사명과 직무명만 던지는 대신, 왜 맞는지, 어떤 조건이 확인됐는지, 무엇을 더 봐야 하는지 정리합니다.

- `직접 연결까지`  
  수락한 기회는 창업자, hiring manager, 채용 리더와의 대화로 이어질 수 있게 Harper가 조율합니다.

### Trust

H2:

> 회사에 공유되는 정보는 당신이 정합니다.

본문:

> Harper는 먼저 기회가 맞는지 회원님에게 확인합니다. 연결을 수락하지 않은 상태에서 프로필 전체가 자동으로 회사에 전달되지 않습니다. 원하지 않는 제안은 거절할 수 있고, 그 피드백은 다음 추천에 반영됩니다.

### CTA

H2:

> 좋은 기회에만 열려 있고 싶다면,  
> 기준부터 정리해두세요.

본문:

> 몇 분만 대화하면 Harper가 원하는 역할, 보상, 지역, 비자, 근무 방식을 이해합니다. 맞는 기회가 생기면 이유와 리스크를 함께 브리핑합니다.

CTA:

> Harper와 기준 정하기

## 우선순위

### P0: 신뢰와 이해를 바로 고치는 변경

- `탤런트` 전부 제거 또는 `인재/엔지니어/회원님`으로 변경
- `AI 커리어 agent`를 hero에서 내리고 `전담 커리어 파트너`로 변경
- `완벽한`, `압도적`, `5%`, `모두가 원했지만 누구도` 같은 과장 제거
- `익명 보장`을 `동의 전 프로필 비공개`로 구체화
- CTA를 한국어로 변경
- `1시간 이내 첫 매칭`이 실제 보장값이 아니면 제거

### P1: 첫 화면과 demo를 제품 중심으로

- 장식 이미지보다 실제 브리핑 UI를 위로 올리기
- `96% 적합` 같은 pseudo precision 제거
- 회사/포지션 카드에 보상, 비자, 리모트, 소개 가능 여부, 리스크를 보여주기
- social proof 문구의 사실관계 정리

### P2: 디자인 톤 낮추기

- hero/CTA heading 크기 한 단계 축소
- 한국어 heading은 Pretendard 중심으로 변경
- `tracking-[-0.03em]` 제거
- 큰 radius 줄이기
- 베이지 단일 톤을 ink/muted green/slate로 보완

### P3: footer와 trust 정보 정리

- footer에 회사 정보, 제품 링크, 도움말, 법적 문서, contact, social 링크 추가
- `Linkedin` 링크 오류 수정
- privacy/trust 블록을 본문 중간에도 추가

## 구현 시 주의할 점

- 실제 파트너가 아닌 회사/투자자 로고에는 `Partnering with`를 쓰지 않는다.
- 실제 사용자가 아닌 후기는 success story처럼 쓰지 않는다.
- "후보자에게 비용 없음"은 비즈니스 모델상 사실이면 사용한다.
- "동의 전 프로필 비공개"는 실제 구현과 약관/도움말 문구가 일치해야 한다.
- direct intro가 모든 회사에서 가능한 게 아니면 `직접 소개 가능한 기회`, `창업자 또는 채용 리더`처럼 범위를 둔다.
