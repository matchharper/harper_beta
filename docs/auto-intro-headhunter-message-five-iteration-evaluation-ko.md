# 회사용 후보자 소개 프롬프트 — 조사와 5회 개선 기록

문서 상태: 로컬 구현·평가 진행 중, 배포 전

## 1. 목표

이 작업의 목표는 후보자의 이력서를 길게 요약하는 것이 아니다. 회사의 채용 담당자가 Slack 첫 화면에서 다음 질문에 빠르게 답할 수 있는 헤드헌터 소개를 만드는 것이다.

1. 이 후보자는 무엇이 유니크해서 한 번 만나볼 만한가?
2. 그 유니크함이 이번 역할의 실제 성공 조건과 어떻게 연결되는가?
3. 주장 중 무엇이 직관적인 규모나 외부 선택·채택 맥락으로 의미가 커지는가?
4. 연결 전에 알아야 할 경력 기간, 제약, 미확인 영역은 무엇인가?
5. 후보자가 실제로 확인한 관심과 조건은 무엇인가?

## 2. 인터넷 조사

### 2.1 사람이 읽는 방식

- Ladders의 recruiter eye-tracking 연구에서는 최초 resume 검토가 평균 7.4초였고, 읽기 좋은 문서는 명확한 section·job title과 짧은 bullet을 사용했다. 반대로 긴 문장, 빽빽한 레이아웃, 약한 heading은 성과가 낮았다. 이 수치를 모든 채용 환경의 보편 법칙으로 과장하지는 않지만, Slack 소개의 첫 화면과 시각적 계층이 중요하다는 근거로 사용한다. ([Ladders eye-tracking study](https://www.theladders.com/static/images/basicSite/pdfs/TheLadders-EyeTracking-StudyC2.pdf?type=standard))
- 별도의 recruiter eye-tracking 연구에서도 Experience와 Education 영역에 쓴 시간, 전체 내용을 쉽게 흡수하고 생각할 수 있는 간결한 구성이 판단과 관련됐다. ([MDPI recruiter eye-tracking study](https://doi.org/10.3390/make5030038))

### 2.2 무엇을 판단하려는가

- SHRM 연구는 초기 지원자 평가에서 recruiter가 가장 크게 보는 요소가 관련 경험이며, 너무 적거나 역할보다 과도한 seniority 모두 문제라고 정리한다. ([SHRM recruiter research](https://www.shrm.org/in/topics-tools/news/talent-acquisition/recruiters-say-experience-top-factor-applicant-evaluation))
- LinkedIn의 2025 Future of Recruiting은 1,000명 이상의 talent professional과 플랫폼 데이터를 바탕으로 quality of hire와 skills-based hiring을 핵심 과제로 제시한다. 93%가 정확한 skill 평가가 quality of hire 개선에 중요하다고 답했고, skills-based search를 쓰는 회사는 quality hire 가능성이 12% 높았다고 보고한다. ([LinkedIn Future of Recruiting 2025](https://business.linkedin.com/content/dam/me/business/en-us/talent-solutions/resources/pdfs/future-of-recruiting-2025.pdf))
- 따라서 소개문은 학교·회사 이름이나 JD keyword보다 이번 역할에서 필요한 일을 실제로 해본 범위와 ownership을 먼저 보여줘야 한다.

### 2.3 이력서식 성과 문구의 한계

이 연구는 어떤 사실을 소개문에서 더 중요하게 선택할지 판단하기 위한 근거다. Harper의 운영 계약에서는 DB briefing에 저장된 회사·role·후보자·경력·학력·extras의 사실을 참으로 간주하며, LLM이 웹으로 재검증하거나 corroborate하지 않는다. 아래의 `외부 검증` 또는 `external validation`은 a16z 선발·투자·실제 제품 채택처럼 저장 사실 자체가 가진 외부 선택 맥락을 뜻하지, 웹 fact-check 절차를 뜻하지 않는다.

- SHRM이 인용한 HireRight 조사에서는 응답 기업의 85%가 이력서나 지원서에서 거짓 또는 왜곡을 발견했다고 답했다. 숫자가 있다는 이유만으로 주장의 신뢰도가 자동으로 높아지지 않는다. ([SHRM resume fraud overview](https://www.shrm.org/topics-tools/news/employee-relations/checking-resumes-fraud))
- 미국 Merit Systems Protection Board의 검토도 resume 같은 자기서술 자료는 직무 능력 예측력이 낮고 과장 위험이 있어, 구조화된 검증과 함께 사용해야 한다고 설명한다. ([MSPB applicant evaluation report](https://www.mspb.gov/studies/studies/Evaluating_Job_Applicants_The_Role_of_Training_and_Experience_in_Hiring_968357.pdf))
- 그러므로 `처리 시간 50% 개선`, `API 안정성 향상` 같은 내부 최적화 지표는 baseline, 사업 결과 또는 이번 역할과의 직접 연결이 없으면 우선순위를 낮춘다. 대신 사용자·매출·팀·데이터·시장·제품 출시처럼 규모를 즉시 해석할 수 있는 신호, 또는 외부에서 확인 가능한 선택·투자·수상·출시 맥락을 우선한다.

### 2.4 소개문은 최종 평가가 아니라 좋은 인터뷰를 여는 자료다

- CIPD는 clear, objective, structured한 selection과 실제 업무를 닮은 work sample을 권장하며, 전통적인 경력·학력 검토나 비구조화 면접보다 직무 수행 예측에 유용할 수 있다고 정리한다. ([CIPD selection methods](https://www.cipd.org/uk/knowledge/factsheets/selection-factsheet/))
- 2022년 personnel-selection meta-analysis에서도 structured interview가 재검토된 selection procedure 중 가장 높은 순위를 보였다. ([Sackett et al., 2022](https://pubmed.ncbi.nlm.nih.gov/34968080/))
- 회사용 소개는 후보자를 확정적으로 판정하지 않는다. “왜 대화할 가치가 있는가”를 증거로 설명하고, 아직 검증할 핵심 한 가지를 정직하게 남겨야 한다.

### 2.5 헤드헌터 소개에 기대되는 부가가치

- AESC는 좋은 candidate presentation이 resume summary를 넘어 전략적 narrative로 client confidence와 의사결정 속도를 높여야 한다고 설명한다. ([AESC candidate presentation workshop](https://www.aesc.org/events/presenting-with-precision-elevating-candidate-shortlists-and-research-recommendations/))
- 최근 practitioner guide도 hiring manager가 원하는 candidate submission을 `왜 이 사람인가`, 실제 role requirement에 대한 증거, upfront risk, 보상·notice·location 같은 logistics, 비교 가능한 형식으로 요약한다. 이는 학술 근거라기보다 현장 가설로 사용한다. ([Spott candidate-submission guide](https://spott.io/resources/what-hiring-managers-want-candidate-submissions))

### 2.6 경력 기간

- SHRM은 짧은 재직이 반복되면 hiring manager의 질문을 유발할 수 있지만, 맥락을 설명하고 다양한 경험의 장점을 함께 볼 수 있다고 설명한다. 짧은 경력을 자동 감점하면 안 된다. ([SHRM job-hopping guidance](https://www.shrm.org/topics-tools/news/talent-acquisition/how-to-explain-job-hopping-interview))
- BLS의 2024 자료에서도 tenure는 연령·직군별 차이가 크다. 하나의 보편적 “정상 재직 기간”을 만들 수 없다. ([BLS Employee Tenure 2024](https://www.bls.gov/news.release/archives/tenure_09262024.pdf))
- 소개에서는 선택한 경력이 12개월 미만이면 저장된 정확한 `N months`를 중립적으로 heading에 붙인다. internship·contract·창업 프로젝트를 job hopping으로 해석하지 않으며, 회사가 short tenure를 신경 쓰지 않는다고 명시했다면 강조하지 않는다.

## 3. 작성 원칙

### 3.1 “재미있는 후보자”의 정의

재미는 화려한 문체가 아니다. 다음 세 요소가 동시에 높을 때 생기는 정보 가치다.

1. **희소성:** 흔하지 않은 창업·리딩·전환·선택·규모·도메인 경험인가?
2. **역할 관련성:** 이번 role의 핵심 성공 조건을 직접 보여주는가?
3. **신뢰 가능한 구체성:** 후보자의 직접 ownership이 분리되어 있고, 직관적인 규모나 검증 가능한 맥락이 있는가?

`유명 회사에서 일함`, `성능을 개선함`, `다양한 프로젝트를 수행함`은 하나만으로 재미있는 신호가 아니다.

### 3.2 정보 우선순위

1. role과 관련된 가장 희소한 differentiator
2. end-to-end, zero-to-one, 리딩, 의사결정처럼 책임 범위를 보여주는 경험
3. 사용자가 바로 해석할 수 있는 규모와 결과
4. 저장된 selective external selection·adoption 맥락
5. 확인된 후보자 관심·조건
6. 연결 전에 확인할 핵심 caveat와 경력 chronology
7. 위 항목을 증명하지 못하는 구현 세부·JD keyword·반복 성과는 삭제

### 3.3 평가 rubric

각 항목을 0~5점으로 평가한다. 총점은 30점이다.

| 항목 | 5점 기준 |
| --- | --- |
| 즉시 흥미도 | 첫 2문장만으로 후보자의 희소한 이야기가 기억된다 |
| 역할 관련성 | 핵심 경험이 target role의 실제 성공 조건과 직접 연결된다 |
| 증거·지표 품질 | ownership이 분리되고 규모·외부 선택·채택 맥락을 즉시 해석할 수 있다 |
| 스캔 가능성 | 첫 화면과 heading만 읽어도 판단 가능하고 중복이 없다 |
| 의사결정 완결성 | chronology, 후보자 조건, 중요한 caveat가 필요한 만큼 보인다 |
| 사실 충실성 | 과장·추론·회사 성과의 개인 귀속이 없고 불확실성이 구분된다 |

## 4. 고정 평가 세트

각 iteration은 아래 세 pair를 한 번씩 실제 `gpt-5.6-luna`로 생성한다. Slack 발송과 fit reason 저장은 하지 않는다.

1. Wonderful — Forward Deployed Engineer (FDE) × 김호진
2. Wonderful — Forward Deployed Engineer (FDE) - Singapore × cedric
3. SBVA — Senior Associate / VP × Sooyun Choi

## 5. Baseline 관찰

- 김호진: `데이터 1,800만 개`, `사용자 7.3만 명`, 제품 출시보다 학습시간 3배·LoRA 10분 같은 구현 최적화가 비슷한 무게로 나열됐다. 창업자·팀 리더·a16z 맥락이 첫 화면에서 충분히 살아나지 않았다.
- cedric: Palantir FDE라는 직접적인 role match는 좋았지만 Spark 50%, API 90%, idempotent API 같은 resume bullet이 길게 반복됐다. 이 사람이 어떤 규모와 고객 책임을 맡았는지보다 구현 항목이 앞섰다.
- Sooyun: 여러 deal의 수치와 분석 항목이 길게 나열되어 transaction advisory에서 투자 역할로 전환할 때의 차별점과 핵심 검증점이 흐려졌다.

## 6. Iteration 기록

아래에는 각 단계의 prompt 변경, 실제 생성 결과의 핵심 문구, 점수, 문제와 다음 변경을 기록한다.

### Iteration 1

#### 개선

- 헤드헌터가 busy hiring manager에게 한 화면으로 설명한다는 목적을 명시했다.
- `희소성 × 역할 관련성 × 신뢰 가능한 구체성`을 interestingness 정의로 추가했다.
- 사실 우선순위를 `희소한 differentiator → end-to-end/zero-to-one/leadership/decision ownership → 직관적 규모 → 외부 검증 → caveat`로 정했다.
- rendered profile 1,200~1,800자, 최대 3개 role, role당 최대 3개 bullet을 권장했다.
- 선택된 일반 고용 경력이 12개월 미만이면 `(N months)`를 중립적으로 표시하게 했다.

#### 실제 결과

모든 case는 `gpt-5.6-luna`, web tool 0회였다. 첫 병렬 실행 결과가 실행 래퍼에서 유실되어 같은 version을 재실행해 아래 결과를 기록했다.

| Case | 글자 수 | 핵심 hook | Work Summary 관찰 |
| --- | ---: | --- | --- |
| 김호진 × FDE | 1,435 | `1,800만 데이터 → 3억 파라미터 모델 → 서빙 → 7.3만 사용자`를 한 이야기로 묶음 | thingsflow와 Surfee의 6개월 tenure가 표시됨 |
| cedric × Singapore FDE | 1,735 | Palantir FDE + PayPal의 190개 관할권 workflow | 50%·90%·95% 개선율과 기술 구현 항목이 여전히 많음 |
| Sooyun × 투자 역할 | 1,550 | 투자위원회가 판단할 성장 근거를 만드는 M&A leader | 6개월 startup advisory tenure가 표시됨 |

대표 출력:

> 3인 팀의 공동창업자로 1,800만 개 오디오 데이터부터 3억 파라미터 생성 모델, 추론 서빙, 제품 출시까지 혼자 연결해본 드문 end-to-end AI builder입니다.

> 싱가포르 시민권자이자 PayPal 현직 백엔드 엔지니어이며, Palantir에서 이미 고객 환경을 다루는 Forward Deployed Software Engineer를 경험한 후보자입니다.

#### 평가

| Case | 흥미 | 역할 | 증거 | 스캔 | 완결성 | 충실성 | 합계 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 김호진 | 4 | 5 | 4 | 4 | 4 | 4 | 25 |
| cedric | 3 | 5 | 3 | 3 | 4 | 5 | 23 |
| Sooyun | 3 | 4 | 4 | 4 | 4 | 4 | 23 |

평균 23.7/30.

#### 문제와 다음 개선

1. 김호진 dossier에 `a16z Speedrun cohort 002`와 funding/adoption이 명시되어 있지만 external validation을 선택하지 않았다.
2. cedric은 더 직관적인 `190개 관할권`, 외부 고객 시스템, Palantir FDE 경험이 있는데도 local optimization percentage가 많은 공간을 차지했다.
3. Harper Note가 `LLM/agent, CRM·ERP, voice`처럼 missing-keyword checklist가 됐다.
4. Preferences에 영어 커뮤니케이션 능력 같은 qualification이 섞였다.

Iteration 2에서는 external validation이 경험의 의미를 바꿀 때 우선하고, low-context optimization과 missing-keyword checklist를 억제하며, Preferences를 후보자 본인의 확인된 의향·조건으로 한정한다.

### Iteration 2

#### 개선

- competitive program 선발, 투자, 실제 고객 채택, acquisition, 논문·수상처럼 경험의 난이도나 선택성을 설명하는 external validation을 별도 신호로 정의했다.
- 후보자의 venture·project·research·creative work에서는 extras까지 확인해 가장 강한 외부 맥락을 선택하도록 했다.
- 더 직관적인 규모가 있으면 implementation-level optimization percentage의 우선순위를 낮췄다.
- Harper Note를 하나의 가장 중요한 verification point로 제한하고, Preferences에서 qualification·언어 능력·현재 위치·추론한 관심사를 금지했다.

#### 실제 결과

| Case | 모델 / web | 글자 수 | 확인된 변화 | 남은 문제 |
| --- | --- | ---: | --- | --- |
| 김호진 × FDE | `gpt-5.6-luna` / 1회 | 1,439 | `a16z Speedrun Cohort 002 참여와 투자 유치`가 OptimizerAI의 의미를 강화함 | Harper Note에 enterprise integration, 고객 커뮤니케이션, onsite 여부가 다시 묶임 |
| cedric × Singapore FDE | `gpt-5.6-luna` / 0회 | 1,684 | Preferences가 실제 역할·근무·보상 선호만 포함함 | TL;DR과 Palantir bullet에 50%·90%·95%가 여전히 큰 비중을 차지함 |
| Sooyun × 투자 역할 | `gpt-5.6-luna` / 0회 | 1,750 | AI 제품의 채택·cohort를 투자 판단으로 바꾼 경험을 hook으로 선택함 | 세 deal의 숫자와 분석 항목이 많아 Slack 첫 화면에서는 여전히 무거움 |

대표 출력:

> 3명 규모 팀의 공동창업자로 1,800만 개 원천 오디오 데이터를 제품으로 전환하고, 3억 파라미터 생성 모델의 설계·학습·추론 서빙까지 직접 연결한 AI builder입니다.

> a16z Speedrun Cohort 002 참여와 투자 유치 이후 Devsisters·Krafton·Mihoyo·Roblox의 채택 또는 평가까지 연결했습니다.

#### 평가

| Case | 흥미 | 역할 | 증거 | 스캔 | 완결성 | 충실성 | 합계 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 김호진 | 5 | 5 | 5 | 4 | 4 | 4 | 27 |
| cedric | 3 | 5 | 3 | 3 | 4 | 5 | 23 |
| Sooyun | 4 | 4 | 5 | 4 | 4 | 4 | 25 |

평균 25.0/30.

#### 문제와 다음 개선

1. 신호의 종류는 좋아졌지만 출력의 구조는 여전히 resume summary에 가깝다.
2. `더 좋은 수치가 있으면 percentage를 낮춘다`는 상대적 지시만으로는 모델이 모든 수치를 함께 보존한다.
3. TL;DR, Work Summary, Harper Note가 같은 강점과 caveat를 반복한다.
4. 1,200~1,800자 목표는 좋은 정보가 많은 후보자에게 사실상 장문 작성을 허용한다.

Iteration 3에서는 전체 메시지를 짧은 hiring case로 재구성하고, 각 section의 역할과 삭제 기준을 명확히 분리한다.

### Iteration 3

#### 개선

- 전체 메시지를 `기억할 희소한 사실 → 역할 핵심 역량의 증거 → 해석 가능한 규모·검증` 순서의 hiring case로 정의했다.
- rendered profile 목표를 950~1,450자로 줄이고 TL;DR을 정확히 두 문장으로 제한했다.
- Work Summary를 role당 보통 1~2개 bullet로 줄이고, implementation detail은 전체 profile에서 최대 1개만 허용했다.
- Harper Note는 하나의 synthesis 또는 verification point만 담는 한 문장으로 제한했다.
- 어느 section을 지워도 미팅 여부나 확인할 내용이 달라지지 않는다면 삭제하는 편집 기준을 추가했다.

#### 실제 결과

| Case | 모델 / web | 글자 수 | 핵심 hook | 남은 문제 |
| --- | --- | ---: | --- | --- |
| 김호진 × FDE | `gpt-5.6-luna` / 0회 | 1,105 | `a16z Speedrun` 창업사에서 7.3만 사용자, 데이터→모델→서빙 소유 | TL;DR과 OptimizerAI 첫 bullet에서 주요 수치가 일부 반복됨 |
| cedric × Singapore FDE | `gpt-5.6-luna` / 0회 | 1,433 | Palantir FDE → PayPal 190개 관할권 → 외부 기관 시스템 리딩 | profile 전체 1개 제한을 어기고 구현 bullet과 50%·90%·95%를 모두 유지함 |
| Sooyun × 투자 역할 | `gpt-5.6-luna` / 0회 | 1,159 | KRW 500bn AI HR tech 딜의 8인 실사팀 리딩과 투자 가설 검증 | 자문 경험을 투자 경험으로 읽지 않게 한 문장 더 신중할 여지가 있음 |

대표 출력:

> a16z Speedrun Cohort 002에 참여한 AI 스타트업을 공동창업해 약 1년 만에 7만 3천 명의 사용자를 만든, 연구와 제품화를 함께 해온 빌더입니다.

> 가장 먼저 검증할 지점은 자문형 딜리전스에서 직접 투자 소싱·포트폴리오 지원으로 확장할 수 있는 실제 경험입니다.

#### 평가

| Case | 흥미 | 역할 | 증거 | 스캔 | 완결성 | 충실성 | 합계 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 김호진 | 5 | 5 | 5 | 5 | 4 | 4 | 28 |
| cedric | 4 | 5 | 3 | 4 | 4 | 5 | 25 |
| Sooyun | 5 | 4 | 5 | 5 | 4 | 4 | 27 |

평균 26.7/30.

#### 문제와 다음 개선

1. 길이와 narrative는 개선됐지만 많은 사실이 있을 때 모델이 여전히 가장 기술적인 bullet을 버리지 못한다.
2. target role의 어떤 1~2개 판단축을 증명하는지 정하지 않은 채 “좋은 사실”을 고르므로 신호가 다시 늘어난다.
3. 회사·팀의 결과와 후보자 개인의 ownership을 더 엄격하게 구분할 필요가 있다.

Iteration 4에서는 먼저 explicit role context에서 핵심 판단축을 최대 두 개만 정하고, 각 문장에 그 판단축과 후보자의 ownership을 요구한다.

### Iteration 4

#### 개선

- role·company context에서 성공을 좌우할 역량을 최대 두 개만 정하고, 그 둘을 증명하지 않는 bullet은 좋은 이력서 문장이어도 버리게 했다.
- 여러 좁은 기술 사실보다 ownership·역할 관련성·규모를 함께 설명하는 한 사실을 우선했다.
- leadership에는 팀 크기뿐 아니라 후보자가 직접 이끈 결정·구축·책임이 필요하도록 했다.
- 회사의 투자·매출·채택·수상을 후보자의 개인 성과처럼 귀속하지 않고, 지원되는 역할의 맥락으로만 쓰게 했다.
- 상대 성능 수치는 선택한 두 역량 중 하나를 증명하는 최선의 자료일 때만 한 개를 허용했다.

#### 실행 안정성

첫 병렬 실행에서는 한 case가 제한된 tool loop 안에 최종 제출을 완료하지 않아 `Auto-intro LLM did not submit complete output`으로 전체 호출이 실패했다. 같은 prompt를 순차 재실행하자 세 case 모두 정상 제출했다. Prompt 평가에는 순차 재실행 결과를 사용하되, 운영 시 pair별 실패 격리가 중요하다는 관찰을 남긴다.

#### 실제 결과

| Case | 모델 / web | 글자 수 | 확인된 변화 | 남은 문제 |
| --- | --- | ---: | --- | --- |
| 김호진 × FDE | `gpt-5.6-luna` / 0회 | 1,083 | a16z·end-to-end 모델 구축·7.3만 사용자·Surfee 4인 리딩이 선명함 | 대표 수치가 TL;DR과 Work Summary에서 반복됨 |
| cedric × Singapore FDE | `gpt-5.6-luna` / 0회 | 1,503 | 190개 관할권과 외부 기관용 시스템 리딩을 유지함 | 상대 수치와 기술 메커니즘 제한을 여전히 어겼고, 국적을 TL;DR에 노출하는 새 문제가 발생함 |
| Sooyun × 투자 역할 | `gpt-5.6-luna` / 0회 | 1,156 | 자문에서의 팀 리딩과 투자 판단 지원을 설명한 뒤 직접 투자 경험은 별도 검증점으로 분리함 | deal 이름·수치가 일부 반복되지만 역할 경계는 비교적 명확함 |

대표 출력:

> 현재 PayPal에서는 190개 이상 관할권의 컴플라이언스 플랫폼을 Java/Spring Boot·Bigtable 기반으로 구축하며 장기 실행 워크플로와 재시도 안전성을 직접 다루고…

이 문장은 규모보다 stack과 구현 메커니즘이 다시 전면에 나오며, 같은 출력의 `현재 싱가포르에 기반을 둔 시민`은 사용하지 말아야 할 국적 정보다.

#### 평가

| Case | 흥미 | 역할 | 증거 | 스캔 | 완결성 | 충실성 | 합계 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 김호진 | 5 | 5 | 5 | 5 | 4 | 4 | 28 |
| cedric | 3 | 5 | 3 | 3 | 4 | 2 | 20 |
| Sooyun | 5 | 4 | 5 | 5 | 4 | 4 | 27 |

평균 25.0/30. 국적 노출 때문에 cedric의 사실 충실성 점수를 크게 감점했다.

#### 문제와 다음 개선

1. `우선`, `보통`, `가능하면` 형태의 지시는 사실이 많을 때 하드 제한처럼 작동하지 않는다.
2. 기본 정보로 이미 렌더링되는 현재 위치·직장 등을 TL;DR이 다시 소비한다.
3. work authorization을 허용한 문장이 citizenship·nationality 노출로 잘못 확장될 수 있다.

Iteration 5에서는 profile 전체 bullet·구현 상세·상대 수치에 명시적 하드 캡을 두고, TL;DR의 금지 항목과 제출 전 자체 점검을 추가한다.

### Iteration 5

#### 개선

- Work Summary를 최대 3개 role, profile 전체 최대 4개 bullet로 제한했다.
- implementation mechanic과 상대 성능 수치를 각각 전체 profile에서 최대 하나로 제한했다.
- TL;DR에서 stack·구현 메커니즘·상대 수치·기본 정보 반복을 금지했다.
- 시민권·국적은 어느 field에도 쓰지 않고, 필요하면 중립적인 근무 자격만 Preferences에 쓰도록 했다.
- 제출 직전 모든 hard cap, ownership, 중복, 민감정보를 자체 점검하도록 했다.

#### 실제 결과

| Case | 모델 / web | 글자 수 | 확인된 변화 | 남은 문제 |
| --- | --- | ---: | --- | --- |
| 김호진 × FDE | `gpt-5.6-luna` / 5회 | 988 | a16z, 1,800만 데이터, 3억 파라미터 모델, 7.3만 사용자, 1.3억 매출만 남겨 빠르게 읽힘 | Surfee의 4인 팀 리딩 신호가 선택되지 않음 |
| cedric × Singapore FDE | `gpt-5.6-luna` / 0회 | 1,187 | 50%·90%·95% 나열을 모두 버리고 네 bullet hard cap 및 국적 금지를 지킴 | Preferences가 위치·보상보다 `full-time`, `backend` 같은 일반 선호를 선택함 |
| Sooyun × 투자 역할 | `gpt-5.6-luna` / 0회 | 1,932 | 네 bullet, 하나의 caveat, 자문/직접투자 경계를 지킴 | 영어 출력은 문장 수를 지켜도 rendered character 목표를 크게 초과함 |

대표 출력:

> Palantir의 Forward Deployed Software Engineer 인턴으로 실제 고객 데이터 파이프라인의 병목을 찾아 해결하고 주간 수천 시간의 컴퓨트 사용을 절감한 후보입니다.

> 프로덕션 LLM·에이전트 시스템으로 확장할 수 있는 설계와 평가 역량을 면접에서 확인하면 좋습니다.

#### 평가

| Case | 흥미 | 역할 | 증거 | 스캔 | 완결성 | 충실성 | 합계 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 김호진 | 5 | 5 | 5 | 5 | 4 | 4 | 28 |
| cedric | 4 | 5 | 4 | 5 | 4 | 5 | 27 |
| Sooyun | 5 | 4 | 5 | 3 | 4 | 4 | 25 |

평균 26.7/30.

#### 최종 개선점

1. 역할에서 leadership가 명시적인 핵심 조건이면 가장 강한 실제 people/team leadership 근거를 선택한다.
2. Preferences는 location·work mode·authorization·start timing·compensation처럼 연결 결정에 바로 필요한 logistics를 generic full-time·직무 선호보다 먼저 보존한다.
3. 언어에 따라 character 밀도가 달라지는 문제를 줄이기 위해 TL;DR, Harper Note, bullet 각각에 단어 수 hard cap을 둔다.
4. internship·contract가 지원되는 경우 heading에서도 고용 관계를 숨기지 않는다.

#### 최종 개선 후 회귀 확인

5회차 평가에서 찾은 문제를 최종 prompt에 반영한 뒤 별도 회귀 확인을 했다.

- 세 case 전체 확인: 김호진 894자, cedric 1,151자, Sooyun 1,731자. 김호진에는 `4인 팀의 CEO 겸 엔지니어`였던 Surfee 리딩 근거가 다시 포함됐고, cedric에는 `internship`, `part-time`, 중립적인 싱가포르 근무 자격, 위치·보상 조건이 정확히 분리됐다.
- 영어 길이와 preference 의미 보존을 한 번 더 강화한 문제 case 재확인: cedric 1,030자, Sooyun 1,402자. cedric은 첫 문장부터 `Forward Deployed Software Engineer 인턴`으로 관계를 보존했고, Sooyun은 네 bullet에서 세 bullet로 줄었다.
- Sooyun 결과는 약 1,350자 목표를 52자 넘었다. 이 목표는 생성 실패를 만들 수 있는 parser hard validation이 아니라 prompt 편집 목표다. 최종 prompt는 두 문장·50단어 TL;DR, 15단어 Harper Note, bullet당 18단어, role당 2개·전체 4개 bullet이라는 검증 가능한 상한을 함께 둔다.

## 7. 최종 결론

### 7.1 최종 메시지의 판단 방식

좋은 소개는 후보자의 장점을 많이 말하는 글이 아니라, 회사가 미팅 여부와 확인 질문을 빨리 결정하게 하는 작은 decision memo다.

1. 첫 두 문장에는 이 사람을 기억하게 하는 희소한 사실과 target role의 핵심 성공 조건을 증명하는 근거만 둔다.
2. `50% 개선` 같은 상대 수치는 그 자체로 강한 증거가 아니다. 사용자·고객·매출·팀·데이터·시장·제품 출시처럼 바로 해석되는 규모, 또는 선택적 프로그램·투자·실제 채택 같은 맥락을 먼저 본다.
3. 회사·팀의 성과, 후보자의 직접 ownership, 저장된 외부 선택·채택 맥락을 서로 구분한다. 유명 회사·학교·stack은 능력의 대리 증거로 사용하지 않는다.
4. Work Summary는 최대 3개 role과 전체 4개 bullet로, 선택한 두 핵심 역량을 증명하는 사실만 남긴다.
5. 짧은 일반 고용 경력은 `(N months)`로 중립적으로 보이고, internship·contract·part-time·advisory 관계도 숨기지 않는다. 회사가 short tenure를 보지 않는다고 명시했다면 기간을 강조하지 않는다.
6. Harper Note는 하나의 가장 중요한 synthesis 또는 검증점만 말한다. 미보유 keyword 목록을 만들지 않는다.
7. Preferences는 후보자가 명시한 사실만 사용하고, location·work mode·근무 자격·start timing·보상처럼 연결 결정에 필요한 logistics를 먼저 보여준다. 최소·목표·유연성·수용 가능의 의미를 바꾸지 않는다.
8. citizenship·nationality와 보호·민감정보는 사용하지 않는다.

### 7.2 5회 개선의 결과

- 정성 rubric 평균은 Iteration 1의 23.7/30에서 Iteration 5의 26.7/30으로 상승했다.
- 김호진은 구현 최적화의 나열에서 `a16z → 1,800만 데이터 → 모델·서빙 end-to-end → 7.3만 사용자 → Surfee 4인 팀 리딩`이라는 기억 가능한 이야기로 바뀌었다.
- cedric은 50%·90%·95%와 stack 나열에서 `Palantir FDE internship → 190개 관할권 → 외부 기관용 시스템의 8인 팀 리딩`으로 중심이 이동했다.
- Sooyun은 deal 분석 항목 나열에서 `실제 운영 데이터로 투자 가설을 검증하고 7~8인 buy-side 팀을 이끈 자문 리더`로 정리하면서, 직접 투자·sourcing·portfolio support는 검증점으로 분리했다.
- `gpt-5.6-luna`의 출력은 확률적이라 같은 prompt에서도 선택·길이·web call 수가 달라졌다. 한 병렬 실행에서 최종 제출 실패도 관찰했다. 실제 운영은 pair별 실패를 격리하지만, 품질 지표와 생성 실패율은 배포 후 별도로 관측해야 한다.

### 7.3 이번 작업의 범위

실제 생성 함수만 호출해 결과를 평가했다. 회사 Slack 발송, fit reason 저장, 배포는 수행하지 않았다.
