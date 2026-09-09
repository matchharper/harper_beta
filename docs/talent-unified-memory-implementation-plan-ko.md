# Talent Memory · Search Brief 최종 설계

문서 기준: 2026-09-08. 이 문서는 목표 설계와 현재 구현 상태를 함께 기록한다.

현재 `codex/talent-unified-memory` 브랜치의 `harper_beta`에는 공통 행 저장소, read/write tool, 온보딩 extraction 전환, 웹·음성 prompt, Search Brief/Memory UI, beta 내부 reader와 이관 migration이 구현돼 있다. 로컬 `harper_worker`에도 공통 context reader와 추천 단계 projection이 구현돼 있다. **migration 적용, commit, push, production 배포는 하지 않았다.** 따라서 아래의 ‘구현됨’은 현재 두 로컬 작업 트리의 코드 상태를 뜻하며 production 동작을 뜻하지 않는다.

## 1. 최종 결정

Harper는 사용자를 이해하며 기회를 탐색하는 커리어 에이전트다. 이번 변경은 대화에서 얻은 중요한 정보를 보존하고, 그중 현재 탐색에 적용하는 기준을 사용자가 확인·수정할 수 있게 하는 작업이다.

다음 구조를 채택한다.

| 영역 | 역할 | 저장 방식 |
| --- | --- | --- |
| Profile + 메모 | 경력·학력·프로젝트 등 프로필과 해당 항목의 보충 설명 | 기존 구조 유지 |
| Search Brief | 현재 기회를 찾고 판단할 때 적용하는 기준과 전제 | 자유로운 label·content가 있는 행 |
| Memory | 이후 대화와 기회 판단에 다시 사용할 사용자 맥락 | 자연어 content 중심의 행 |
| Documents | 이력서·포트폴리오 등 원문 자료 | 기존 구조 유지 |

Brief와 Memory는 물리적으로 하나의 `talent_contexts` 테이블에 저장하고 `collection = brief | memory`로 구분한다. 두 영역에 같은 read/write 계약을 쓴다. 별도의 Career Timeline, Memory 요약 원본, Brief Markdown 원본은 만들지 않는다.

일반 대화에서 Brief를 추가할 때는 **label과 content**, Memory를 추가할 때는 **content와 importance(1~3)**를 작성한다. 수정·삭제는 두 영역 모두 짧은 숫자 ref를 사용한다. Brief의 제목이나 주제를 enum으로 제한하지 않는다. 기존 key는 온보딩·이관·기존 reader 연결에 필요한 선택적 metadata로 보존하며, 일반 대화 tool에는 key를 넣지 않는다. importance는 worker의 제한된 Memory 선택에만 쓰는 작은 우선순위 신호이며 Brief에는 없다.

**온보딩에서는 기존 별도 extraction과 질문 진행 로직을 유지한다. 이후에는 대화하는 원본 LLM이 필요할 때 read/write tool을 사용한다.** 저장 대상 분류, Memory 중요도, 조건의 강도, 기존 내용의 수정·삭제·추가 관계는 LLM이 의미를 보고 판단한다. 일반 대화 앞뒤에 별도 분류·추출·정리 모델을 붙이지 않는다.

모델별 누락률과 실제 비용·지연은 아직 production traffic에서 측정하지 않았다. 아래 수치와 평가는 구현 계약과 로컬 검증 결과이지 production 성능 수치가 아니다.

## 2. 서비스가 주려는 경험

### 2.1 기억은 대화의 연속성을 위한 것이다

사용자가 중요한 경험이나 선택의 이유를 말했으면, 다음 대화에서 다시 설명하지 않아도 되어야 한다. 이력서 항목에 붙일 곳이 없는 정보도 마찬가지다.

오퍼를 받은 일, 공개되지 않은 업무 경험, 이전 선택의 배경, 현재 고민, 소통 방식에 대한 선호는 모두 가능한 예다. 특정 회사나 오퍼 사례를 위한 schema를 만들지 않는다. 새로운 종류의 이야기도 같은 Memory에 담을 수 있어야 한다.

다만 ‘모두 Memory로 통합한다’는 것이 모든 대화 문장을 복사한다는 뜻은 아니다. 원문은 기존 메시지·Documents에 남는다. Memory에는 이후 다시 쓸 만한 맥락을 남긴다. 정보의 가치를 ‘이 사실이 영구불변인가’로 과도하게 제한하지 않는다.

### 2.2 Brief는 현재 Harper가 이해한 탐색 방향을 보여 준다

사용자는 “내가 말한 내용을 Harper가 어떻게 이해했고, 지금 무엇을 기준으로 기회를 보는지” 확인할 수 있어야 한다. Brief는 이를 위한 간결한 현재 상태다.

사용자가 “서울은 선호일 뿐 필수는 아니다”라고 정정하면 화면만 달라지는 것이 아니라 후속 탐색과 추천 판단도 달라져야 한다. 반대로 예전에 한 회사를 거절했다고 같은 업계 전체를 제외해서는 안 된다.

성공은 저장된 행 수가 늘어나는 것이 아니다. 다음 경험이 함께 성립해야 한다.

- 중요한 이야기를 반복해서 설명할 필요가 줄어든다.
- 현재 조건을 눈으로 확인하고 쉽게 고칠 수 있다.
- 기회를 놓치거나 잘못 좁히는 해석이 줄어든다.
- 저장 기능 때문에 대화가 느린 설정 마법사나 저장 영수증으로 변하지 않는다.

## 3. 무엇을 어디에 저장하는가

### 3.1 Brief와 Memory의 구분은 목적의 차이다

**Brief:** “현재 이 내용을 기준으로 기회를 검토하고 있다”고 사용자에게 보여 줄 수 있는 기준과 전제.

**Memory:** 현재 검색 조건 그 자체는 아니지만, 사용자를 이해하거나 기회의 의미를 판단할 때 다시 필요한 맥락.

Brief에는 희망뿐 아니라 기존 insights의 언어 활용 능력, 해외 근무 자격처럼 현재 기회 검토에 필요한 전제도 포함한다. 기존 온보딩 정보를 ‘선호가 아니므로 제외’하지 않는다.

Memory에는 과거 사건뿐 아니라 현재의 미결정 상태도 들어갈 수 있다. “창업을 고민하지만 당장 이직 방향을 바꾸지는 않는다”는 유용한 Memory다. 이 내용을 저장하면서 기존 Brief는 유지할 수 있다.

이 구분은 공개/비공개 구분이 아니다. Memory도 사용자가 확인할 수 있고, Brief에 들어갔다고 회사 공유가 허용되는 것도 아니다.

추천에는 둘 다 쓰인다. Brief는 현재 적용할 조건과 전제를 분명하게 보여 주고, Memory는 왜 어떤 역할이 이 사람에게 의미가 있는지 이해하게 한다. ‘검색에 영향을 주면 전부 Brief’로 분류하지 않는다. 현재 기준은 Brief만 읽어도 이해할 수 있게 쓰고, 그 조건이 생긴 상세 배경은 필요할 때 Memory에서 읽는다.

### 3.2 한 발화에 하나의 저장 위치만 강제하지 않는다

“이전 회사에서 주말 근무 때문에 그만뒀고, 다음에는 주말 근무가 없는 곳을 원한다.”

선택의 배경은 Memory, 다음 역할의 조건은 Brief에 저장할 수 있다. 서로 다른 정보를 담는 것이지 같은 사실의 두 복사본을 만드는 것이 아니다.

“서울 또는 원격을 원한다”는 말만 했다면 Brief로 충분하다. Brief의 모든 내용을 Memory에 복제하거나, Memory에서 Brief를 자동 재생성하는 관계는 두지 않는다.

현재 메시지가 기존 행을 더 이상 사실이 아니게 만들면 기존 행을 update하거나 delete한다. 새 사실을 하나 더 추가해 모순된 두 행을 함께 남기는 것이 기본값이 아니다. 과거 자체가 여전히 의미 있는 사건이면 현재 상태와 혼동되지 않게 그 사실만 보존한다. 과거 Memory가 있다는 이유로 현재 Brief를 조용히 되돌리지 않는다. 조건의 강도·예외·적용 기간은 자연어 안에 남긴다. ‘희망’을 ‘최소 조건’으로, ‘이번 탐색’을 ‘앞으로 항상’으로 바꾸지 않는다.

### 3.3 기존 기능이 소유하는 정보는 그곳에 둔다

특정 경력 행의 상세 설명은 기존 row memo, 문서 전문은 Documents, 추천 저장·거절은 기존 feedback 기능, 발송·연락 설정은 기존 setting 기능을 사용한다. 이 원본들을 Memory로 복사해 대체하지 않는다.

다만 적절한 프로필 행이 없다는 이유로 중요한 이야기를 버려서는 안 된다. “이력서에 없는 보안 사고 대응을 주도했다”는 사실을 붙일 경력 행이 불명확하면 Memory에 보존할 수 있다.

기존 필드와 이름이 비슷해도 의미는 다를 수 있다. 현재 거주지는 Profile, 희망 근무 지역은 Brief다. 현재 `engagement_types`의 full_time·fractional·advisor와 ‘계약직 제외’도 자동으로 같은 뜻은 아니다. 해당 기능의 실제 의미를 읽고 원본 LLM이 알맞은 tool을 사용한다.

### 3.4 서버와 LLM의 책임

| LLM이 판단할 것 | 서버가 처리할 것 |
| --- | --- |
| 기억할 가치, Brief/Memory 구분, Memory 중요도, 기존 내용의 정정·삭제·추가 | 인증된 사용자 범위, 유효한 ref, 필요한 필드 |
| 선호와 필수 조건, 일회성 요청과 지속적인 방향 | DB 저장, 동시 수정 검사, 재시도 중복 방지 |
| 어떤 기억이 현재 대화·기회에 의미 있는지 | 검색 결과 조회, token 예산, 권한과 공유 제한 |
| 무엇이 바뀌었는지 자연스럽게 설명하기 | 실제 저장 결과와 실패 사실 제공 |

문장에 특정 단어가 있다는 이유로 저장 위치·중요도·조건 강도·추천 판단을 결정하지 않는다. 관련도 검색은 정보를 찾는 수단이며, 그 결과로 내용을 재분류하거나 삭제하는 규칙이 아니다. 서버는 importance 범위가 1~3인지 검사하지만 몇 점인지를 대신 결정하지 않는다.

온보딩은 기존 extraction·checklist·질문 진행을 유지하는 예외다. 이 예외를 일반 대화의 룰 엔진으로 확장하지 않는다. 온보딩에서 추출할 내용의 의미도 LLM이 판단한다.

## 4. 저장 구조: 두 종류의 행, 하나의 변경 방식

### 4.1 데이터 형태

`talent_contexts`의 내용 필드는 다음으로 충분하다.

| 필드 | Brief | Memory |
| --- | --- | --- |
| collection | brief | memory |
| label | 사용자와 LLM이 읽는 명확한 자유 형식 제목 | 불필요 |
| content | 해당 항목의 현재 내용을 담은 자연어 | 기억할 맥락을 담은 자연어 |
| importance | 없음 | 추천·매칭 판단에 미치는 중요도 1·2·3 |

서버는 내부 id, talent_id, 근거 위치(source_refs), revision, 생성·수정 시각, 삭제 표시도 관리한다. 기존 Brief 항목의 연결에 필요한 key는 nullable text metadata로 보존한다. key에는 enum이나 주제 allowlist를 두지 않는다. 이 metadata를 일반 대화 LLM이 매번 출력하지는 않는다. embedding은 본문에서 재생성할 수 있는 검색용 데이터이지 별도 기억 원본이 아니다.

Memory importance의 의미는 좁고 단순하다.

- **3:** 이 사실을 놓치면 기회 매칭이나 중요한 커리어 판단이 실질적으로 달라질 가능성이 크다.
- **2:** 판단에 유용하고 후보 간 비교나 설명에 의미 있게 쓰일 수 있다.
- **1:** 대화의 연속성에는 도움이 되지만 일반적인 매칭 판단에는 영향이 작다.

이는 certainty, privacy, 감정 강도, 영구 보존 기한이 아니다. LLM이 발화 의미와 현재 행을 보고 정하며, 키워드 점수나 서버 기본 분류기가 정하지 않는다. 일반 대화의 Memory add에는 명시적으로 필요하고, 기존 Memory를 update할 때 중요성 자체가 달라졌다면 함께 바꿀 수 있다. Brief는 모두 현재 탐색 기준이므로 importance를 받지 않는다. 기존 Behavior Context 이관 행과 사람이 UI에서 직접 만드는 Memory처럼 과거 판단값이 없는 호환 경로만 중립값 2로 시작한다.

두 영역 모두 독립적으로 읽고 고칠 수 있는 주제 단위의 행이다. Brief의 같은 주제는 기존 행에 통합하고, 함께 읽어야 의미가 유지되는 이유·조건·예외는 함께 쓴다. label은 식별자가 아니므로 같은 제목이라는 이유로 서버가 합치거나 덮어쓰지 않는다. 같은 주제인지는 현재 행을 읽은 LLM이 판단한다.

### 4.2 key와 label의 차이, 그리고 key를 어디까지 남기는가

기존 `location`은 코드가 특정 값을 찾는 이름이고, `선호 근무 지역`은 사람이 보는 제목이다. 행 id가 생긴 새 구조에서는 제목을 바꾸어도 같은 행을 수정할 수 있다. 새 항목마다 LLM이 영어 key와 자연어 label을 함께 만드는 일은 필요 없다.

다음과 같이 역할을 한정한다.

- **일반 read/write와 UI:** 자유 형식 label·content, 기존 행은 ref 또는 내부 id로 처리한다. label은 저장된 내용에 맞게 고칠 수 있다.
- **온보딩:** 기존 질문 key·coverage·질문의 의미를 유지한다. extractor는 기존 항목에 연결할 필요가 있을 때만 같은 changes의 Brief add에 key를 함께 출력할 수 있다. 이 key도 자유 문자열이며, 새 주제에 key를 요구하지 않는다.
- **이관·호환:** 표준 온보딩 key는 Brief metadata로 남긴다. 기존 custom key를 Memory로 옮길 때는 원래 key를 migration 출처에 남겨 재실행·감사가 가능하게 한다. 새 일반 Brief에는 key가 없어도 된다. label에서 key를 생성하거나 추측하는 별도 로직은 두지 않는다.

아래는 기존 온보딩 연결과 처음 제안할 제목의 목록이다. 저장 가능한 Brief 주제 전체나 일반 tool의 enum이 아니다.

| key | 기본 label |
| --- | --- |
| search_intensity | 이직 적극도 |
| location | 선호 근무 지역 |
| next_scope | 다음 역할 |
| must_haves | 꼭 있어야 하는 조건 |
| compensation | 기대 보상 조건 |
| cross_border_work_authorization | 거주국 외 국가의 근무 자격 |
| language | 외국어 능력 |
| deal_breakers | 피하고 싶은 조건 |
| team_style_fit | 선호하는 회사의 조건 |

예를 들어 `제품 의사결정 참여`, `함께 일할 동료`, `출장 가능 범위` 같은 제목을 그대로 추가할 수 있다. 목록에 없다는 이유로 거절하거나 모두 must_haves에 밀어 넣지 않는다. 이미 같은 내용을 담은 행이 있으면 그 ref를 고친다.

key를 자유 문자열로 바꾸기만 하고 모든 추가에 계속 요구하는 대안도 가능하다. 그러나 새 행의 안정적인 식별은 id가 맡고 제목은 label이 맡으므로, 이번 설계에서는 key 작성 부담까지 일반 agent에 주지 않는다. 새 제목마다 schema·프롬프트·번역 목록을 배포하는 작업도 필요 없다.

### 4.3 수정은 일반적인 add / update / delete다

Brief나 Memory를 바꿀 때 현재 행을 update한다. 삭제는 기본 조회·추천에서 제외하고, 새 내용은 add한다. 잘못된 저장 영역을 바로잡아야 한다면 필요한 add와 delete를 한 요청으로 처리한다.

수정할 때마다 과거 행을 supersede하고 연결 관계를 만드는 모델은 채택하지 않는다. 모든 변경을 또 다른 Memory로 남기지도 않는다. 더 이상 사실이 아닌 내용은 update/delete하고, 중요한 과거 사건과 현재 상태를 어떻게 보존할지는 내용을 읽은 LLM이 판단한다.

예를 들어 2024년에 받은 제안은 과거 사실로 남을 수 있다. 반면 현재 희망 지역을 수정할 때 예전 희망 지역의 이력을 자동으로 쌓을 필요는 없다. 사용자가 정확한 날짜를 말했다면 보존하되, ‘지난달’처럼 상대 시점만 말했다면 임의의 연월로 변환하지 않고 그대로 저장한다. 말하지 않은 날짜를 만들어 넣지 않는다.

### 4.4 다른 저장 방식과 비교한 결정

| 대안 | 장점 | 이번에 채택하지 않는 이유 |
| --- | --- | --- |
| insights JSON만 확장 | 변경 범위가 작고 기존 reader 유지가 쉬움 | 배경과 현재 조건의 혼재, 개별 기억 조회·관리 문제는 남음 |
| 둘 다 큰 Markdown/text | 모델이 통으로 읽기 쉽고 시작이 단순 | 누적 Memory의 부분 조회·수정·동시 편집을 별도로 해결해야 함 |
| Memory 행 + Brief Markdown | 두 영역의 특성을 따로 최적화 가능 | 서로 다른 편집 계약이 필요하며 현재 요구에서는 이점이 작음 |
| Memory와 Brief를 별도 테이블로 분리 | 물리적 경계가 뚜렷함 | 같은 계약을 두 물리 대상에 연결해야 하며 현재 요구에서는 분리 이점이 작음 |
| 한 테이블에 두 collection의 행 | 같은 CRUD, 개별 수정, 필요한 행만 조회 | 채택. 다른 목적은 collection·읽기 계약으로 분명히 구분 |

큰 문서가 본질적으로 나쁘거나 부분 수정이 불가능해서 행을 고르는 것은 아니다. Harper는 사용자의 기준을 항목별로 편집하고, 누적된 기억 일부만 읽어야 하므로 행이 더 자연스럽다.

## 5. 원본 LLM이 보는 인터페이스

### 5.1 기본 context는 읽을 수 있는 텍스트다

DB가 행 기반이라고 LLM에 DB JSON 전체를 보여 주지는 않는다.

~~~text
Search Brief — 현재 탐색 기준
[1] 선호하는 회사의 조건: 초기 스타트업을 우선 검토한다.
[2] 선호 근무 지역: 서울 또는 원격 근무를 선호한다.
[3] 피하고 싶은 조건: 계약직 역할은 검토하지 않는다.

Relevant memories — 참고 맥락
[4] 2026년 봄, 큰 제품을 운영하는 경험을 더 쌓고 싶다고 말했다.
[5] 이전 팀에서는 제품 방향을 정하는 권한이 부족했던 점을 아쉬워했다.

Memory는 기본 context에 선택된 항목이다. 더 필요한 맥락은 read_talent_context로 조회할 수 있다.
~~~

이 블록은 저장된 행을 문자열로 렌더링한 것이다. 매번 다른 LLM이 요약해서 만드는 문서가 아니다. Brief는 ref·label·내용, Memory는 ref·내용으로 충분하다. importance는 worker가 행을 고르는 데만 쓰고 기본 prompt 문장마다 표시하지 않는다. UUID·호환 key·분류·출처 전체를 반복하지 않는다. 원문 확인이 필요한 경우에만 더 읽는다.

현재 `Known future-matching insights/preferences` 본문은 이 블록으로 교체한다. 기존 insights JSON과 새 Brief를 함께 넣지 않는다. 기존 `Good to remember insights`와 온보딩 후 `Canonical future-matching memory slots`의 빈 key 채우기 유도문도 제거한다. 대화에 도움이 될 추가 질문은 현재 Profile·Brief·Memory를 읽은 원본 LLM이 판단하며, 질문을 다뤘는지 관리하는 checklist는 온보딩에만 남긴다.

[1] 같은 번호는 사용자별로 부여한 짧고 안정적인 ref다. 내부 DB id·UUID와 분리하며 웹 채팅, realtime 음성, 이메일처럼 prompt 생성과 tool 실행 요청이 달라도 같은 행을 가리킨다. 새 행은 해당 사용자 안에서 다음 번호를 받고, 수정한 행은 같은 번호를 유지하며, 삭제한 번호는 재사용하지 않는다.

긴 DB ID를 모델이 기억하거나 생성하게 하지 않는다. ref는 의미나 분류를 담지 않는 사용자 범위 식별자이며, 서버는 인증된 사용자와 revision을 함께 검증한다.

### 5.2 read tool 하나

`read_talent_context`는 collection, 자연어 query, refs, cursor를 지원한다. 관련 검색 결과가 잘렸고 cursor가 없는 경우에는 더 좁은 자연어 query나 더 적은 exact refs로 다시 읽을 수 있다. 대화 원문 전체를 이 tool에 섞지 않는다.

~~~json
{"collection":"memory","query":"이전 조직을 떠난 이유"}
~~~

이미 기본 context에 나온 행을 수정하려고 다시 읽을 필요는 없다. 관련 내용이 빠졌거나 원문이 필요할 때 더 읽는다. 검색 결과가 일부라는 점과 더 읽을 방법도 반환한다.

조회 tool은 사용자의 전체 대화나 Memory를 항상 통째로 반환하지 않는다. 동시에 “검색 결과에 없다”를 “그런 기억은 없다”로 설명하지 않도록, 전체 조회와 검색 결과의 차이를 모델에게 알려 준다.

### 5.3 write tool 하나

`write_talent_context`의 인자는 공통 `changes` 배열이다.

~~~json
{
  "changes": [
    {
      "op": "update",
      "ref": 2,
      "content": "서울 또는 원격 근무를 선호하며, 함께 배울 동료가 좋은 팀이면 수도권도 검토한다."
    },
    {
      "op": "add",
      "collection": "memory",
      "content": "이전 팀에서 동료 피드백을 통해 성장했던 경험을 특히 긍정적으로 기억한다.",
      "importance": 2
    }
  ]
}
~~~

새 Brief는 주제와 관계없이 같은 형태로 추가한다.

~~~json
{"changes":[{"op":"add","collection":"brief","label":"제품 의사결정 참여","content":"제품 방향을 정하는 논의부터 참여할 수 있는 역할을 원한다."}]}
~~~

일반 write tool의 필드는 아래로 끝난다. 이 표와 예시를 구현 계약으로 사용하며, 별도 intent·분류 이유·confidence를 출력하게 하지 않는다. importance는 worker가 실제로 소비하는 Memory 우선순위 한 필드만 둔다.

| 작업 | 필요한 입력 |
| --- | --- |
| Brief 추가 | op=add, collection=brief, label, content |
| Memory 추가 | op=add, collection=memory, content, importance(1·2·3) |
| 내용 수정 | op=update, ref, content; Memory 중요성도 바뀌면 importance 추가 |
| Brief 제목 수정 | op=update, ref, label; 내용도 바꾸면 content 추가 |
| 삭제 | op=delete, ref |

label과 content는 자유 문자열이다. 일반 tool schema에는 key 필드나 제목 목록이 없다. `op`, `collection`, 1~3의 `importance`처럼 downstream 코드가 실제로 소비하는 구조적 값만 제한한다. 온보딩 extractor가 추가하는 호환 key는 같은 공통 저장 함수가 받는 선택적 metadata이며, 별도 Brief writer를 뜻하지 않는다.

update의 content는 해당 행의 완성된 새 내용이다. 다른 행 전체를 다시 보내지 않는다. 제목만 고칠 때는 본문을 재출력하지 않는다. 내부 id와 기존 호환 key는 그대로 유지한다. 삭제는 `{"op":"delete","ref":5}`다.

성공 결과도 작게 유지한다. 요청 순서대로 적용된 ref를 반환하면 원본 모델은 자신이 보낸 내용이 저장됐음을 알 수 있다.

~~~json
{"applied":[{"ref":2},{"ref":6}]}
~~~

새 행 [6]의 mapping은 서버가 보관한다. 성공한 update의 본문을 결과에 또 길게 반복할 필요는 없다. 충돌이나 실패처럼 모델이 새 내용을 알아야 하는 경우에는 그 내용과 처리 상태를 반환한다.

**write tool 내부에는 생성형 LLM이 없다.** 의미 판단이 끝난 변경을 검증·저장하고 검색 index 갱신을 연결한다. 같은 내용을 다시 추출하거나 문서를 재작성하는 숨은 모델 호출은 없다.

### 5.4 LLM에게 주는 판단 지침

원본 agent와 온보딩 extractor는 저장 의미를 공유한다. 일반 agent의 기본 prompt에는 아래 정도의 짧은 계약을 한 번 제공하고, tool에는 인자·효과·반환값을 설명한다.

~~~text
사용자가 이후에도 다시 설명하지 않아야 할 유용한 맥락을 보존한다.
현재 기회 탐색의 기준과 전제는 Search Brief, 그 밖에 다시 필요한 사용자 맥락은 Memory에 둔다. 추천과 대화에는 둘 다 참고한다.
현재 제공된 행과 사용자의 새 말을 함께 읽고, 더 이상 사실이 아닌 내용은 해당 행을 수정하거나 삭제하며 별개의 새 내용만 추가한다. 표현의 강도·예외·불확실성과 확인 가능한 시점을 보존한다.
Brief의 제목은 내용을 쉽게 이해할 수 있는 자유로운 label로 작성한다. 같은 정보를 두 영역에 복제하지 않는다.
Memory를 추가할 때는 매칭·판단에 미치는 중요도를 1(낮음), 2(중간), 3(높음)으로 정한다. 중요도가 바뀐 기존 Memory는 update한다. Brief에는 중요도를 쓰지 않는다.
Profile·설정·문서·추천 상태에 속하는 작업은 해당 기능을 사용한다. 제공된 맥락이 부족하면 read_talent_context로 더 읽는다.
변경은 write_talent_context의 changes에 함께 담는다. 수정·삭제에는 이번 실행에서 제공된 ref를 사용한다. 저장할 것이 없으면 쓰지 않는다.
사용자의 원래 질문과 작업을 이어 가고, 저장 결과를 확인한 뒤 실제로 반영된 내용을 자연스럽게 설명한다.
~~~

이 지침을 별도 ‘의도 분류 → 저장 계획 → 검증 계획’ JSON으로 쪼개지 않는다. 한 메시지에서 두 영역을 함께 바꾸거나, 저장 없이 검색하거나, Profile 수정과 Memory 저장을 함께 수행할 수 있다.

매번 저장 허락을 다시 묻거나 ‘기억해’라는 단어를 기다리지 않는다. 다만 사용자의 향후 탐색 범위를 크게 바꾸는데 의도가 불분명하면 자연스럽게 확인한다. 확인할지 자체도 원본 LLM의 판단이다.

### 5.5 왜 이 구조가 덜 헷갈리는가

- 읽기와 쓰기가 각각 하나여서 Brief용·Memory용·Behavior용 tool 사이에서 같은 작업을 중복 선택하지 않는다.
- 현재 기준과 참고 맥락을 context의 두 제목으로 구분한다. DB의 복잡한 metadata를 해석할 필요가 없다.
- 기존 항목을 고칠 때는 [2]를 지목하면 된다. key·label·UUID를 다시 맞출 필요가 없다.
- 새 Brief는 label·content만 작성하므로 표준 항목과 custom 항목 중 어느 추가 방식을 골라야 하는지 판단할 필요가 없다.
- 일반 대화에 checklist나 extraction 결과 필드를 노출하지 않는다.
- 기존 profile tool의 talentInsights 쓰기 부분은 새 tool로 이전하고 제거한다. 같은 내용을 두 tool로 저장하는 선택지를 남기지 않는다.

이것은 설계상 혼동을 줄이는 선택이다. 모델이 실제로 저장을 잘 판단하는지, ref를 정확히 쓰는지, tool 때문에 원래 질문을 놓치지 않는지는 대화 단위로 검증해야 한다.

### 5.6 필요한 저장 안전장치만 둔다

한 changes 요청은 원자적으로 적용한다. 다른 화면이나 대화가 먼저 행을 바꿨다면 최신 행을 반환하고 원본 모델이 다시 판단하게 한다. 서버가 자연어를 임의로 병합하지 않는다.

온보딩·이관에서 같은 호환 key를 다시 추가하면 기존 행을 알려 준다. key가 없는 일반 Brief는 제목만으로 upsert하지 않는다. 두 제목이 같거나 다르다는 사실만으로 내용까지 같다고 판단할 수 없기 때문이다.

소유 사용자, 출처의 유효한 범위, revision은 서버가 검증한다. 재시도 중복 방지는 실행과 개별 tool 요청의 식별자를 사용한다. 같은 실행에서 서로 다른 두 쓰기를 막아서는 안 된다.

이 검사는 의미상 같은 Brief/Memory가 다시 추가되는 것을 완벽히 차단하는 기능은 아니다. Brief는 기본 context에 전체가 보이므로 그 안에서 재사용할 행을 찾고, Memory는 중복이 의심되는데 필요한 내용이 없으면 read한다. 모든 add 앞에 의무적인 read나 별도 중복 판정 모델을 붙이지 않는다.

## 6. 온보딩은 기존 흐름을 유지한다

### 6.1 유지하는 것과 바꾸는 것

온보딩은 사용자가 명시적으로 허용한 예외다. 기존의 별도 extraction, 질문 key·label·의도, checklist, 추가 질문, 마지막 확인·종료 흐름을 유지한다. 이번 저장 전환을 온보딩 전체 재설계로 넓히지 않는다.

바꾸는 것은 extraction의 저장 결과다. 기존 extractor 한 번이 Brief와 Memory 변경을 같은 changes로 출력한다.

~~~json
{
  "changes": [
    {
      "op": "add",
      "collection": "brief",
      "key": "location",
      "label": "선호 근무 지역",
      "content": "서울 또는 원격 근무를 선호한다."
    },
    {
      "op": "add",
      "collection": "memory",
      "content": "과거 해외 이직을 준비했지만 당시 일정 때문에 진행하지 않았다.",
      "importance": 2
    }
  ],
  "covered_onboarding_checklist": ["location"]
}
~~~

여기서 `key: location`은 온보딩의 기존 항목 연결을 보존하는 선택적 입력이다. 기존 key·label 목록을 extractor에 제공하되, 목록 밖 주제는 자유로운 label·content로 추가할 수 있다. 질문 coverage는 기존 온보딩 상태에 기록한다. Memory용 extractor와 Brief용 extractor를 따로 호출하지 않는다. 일반 대화 write tool에는 key와 coverage를 넣지 않는다.

입력에는 추출 대상인 새 답변, 해석에 필요한 최근 대화, 현재 Brief, 관련 Memory, checklist를 제공한다. 같은 턴의 원본 LLM이 profile tool을 먼저 호출했다면 전체 Profile을 다시 읽어 넣지 않고, 그 호출 결과에서 실제 저장에 성공한 Profile 변경만 짧게 덧붙인다. extractor는 이를 Memory에 다시 저장하지 않는다. 관련 Memory는 서버가 공통 read 함수로 준비한다. extractor에 새로운 탐색 agent를 덧붙이지 않는다.

### 6.2 insights를 읽던 프롬프트와 연결한다

온보딩 질문 key·promptHint·coverage와 종료 조건은 유지한다. 저장된 현재 내용은 `Current saved context`의 ref·label·content 행으로 **한 번만** 제공한다. checklist 블록에는 질문 정의와 coverage만 넣고 `current_value`를 반복하지 않는다. extractor에서 기존 온보딩 항목을 연결할 때 필요한 호환 key도 이 같은 행에 선택적으로 붙이며, 별도 keyed insight 본문을 만들지 않는다. 메인 대화 prompt도 `talentContextSection`을 필수 입력으로 받고 legacy `currentInsightContent` fallback을 두지 않아, 새 Brief와 예전 keyed view가 함께 들어가는 경로를 막는다.

연결된 기존 항목은 과도기 reader에 한해 `key → content`로 읽을 수 있다. 그러나 이 객체에는 key 없는 새 Brief가 빠지므로, **이를 전체 사용자 조건으로 취급하는 reader는 남기지 않는다.** 채팅·검색·fit·설명·사용자 UI는 모든 Brief 행을 읽는다. 새로운 제목이 기존 key와 의미가 같은지는 LLM이 내용으로 이해하며, label→key 매칭·재분류 모델은 추가하지 않는다.

질문 key가 같지 않거나 해당 key의 값이 비어 있다는 이유로 ‘그 기준을 모른다’고 판정하지 않는다. 온보딩 진행은 coverage, 현재 알고 있는 기준은 전체 Brief를 읽는다. 이렇게 해야 제목을 바꾸거나 새 주제로 저장해도 질문 반복과 정보 누락이 생기지 않는다.

현재 `next_scope` 질문이 `next_scope`와 `must_haves`를 함께 채우는 연결을 유지한다. 기존 coverage도 보존한다. 질문을 다뤘는지와 현재 조건이 있는지는 서로 다른 정보다.

보상 기준이 없는 사용자에게 보상을 물었고 “아직 모르겠어요”라고 답했다면 coverage만 갱신할 수 있다. 추천 조건은 만들지 않는다. 이는 온보딩의 질문 진행이지 일반 대화마다 관리할 checklist가 아니다.

이미 저장된 보상 기준을 사용자가 철회했다면 해당 Brief를 수정·삭제한다. 같은 ‘모르겠다’라는 단어라도 앞선 맥락과 사용자 의도를 보고 처리한다.

### 6.3 유지하면서 놓치면 안 되는 입력·실행 문제

현재 구현은 최근 대화에서 최대 5개 메시지를 extractor transcript로 구성한다. 새로 추출할 최신 사용자 답변은 기존의 앞 1,200자 절단을 적용하지 않고, 오래된 긴 메시지만 앞뒤 맥락을 모두 남기는 명시적 축약 표시와 함께 줄인다. Memory 검색 query는 직전 대화와 최신 메시지를 함께 사용하고 전체 길이를 제한할 때 최신 쪽을 보존한다. 긴 문서 원문은 Documents와 기존 조회 경로를 사용한다.

온보딩 extraction은 assistant 메시지 저장 뒤, 완료 처리와 첫 추천 전에 기다린다. 따라서 background extraction이 역순으로 끝나 최신 조건을 이전 답변으로 되돌리는 경로를 두지 않고, 마지막 답변이 최종 Brief와 첫 추천에 반영된다. 첫 모델과 fallback 모델의 출력이 모두 유효하지 않거나 저장이 실패하면 `변경 없음`으로 성공 처리하지 않고 해당 turn을 실패시킨다.

웹·음성·이메일의 기존 실행 주체가 다르다는 점도 유지한다. 이메일 온보딩의 기존 progress tool 경로에 웹과 같아 보이기 위한 새 추출 호출을 추가하지 않는다.

## 7. 읽기와 추천: 저장한 사실이 실제로 쓰여야 한다

### 7.1 기본 읽기 정책

대화 agent와 온보딩에는 현재 Brief의 전체 활성 항목을 제공한다. Memory는 token 예산 안에서 최근 수정 항목 최대 5개를 작은 별도 예산으로 먼저 확보하고, 나머지를 현재 작업과 의미상 관련된 항목으로 채운다. 두 후보군은 중복을 제거한 뒤 LLM에게 하나의 `Relevant memories` 목록으로 제공한다. 부족하면 원본 agent가 read tool로 더 읽는다.

초기 기본 Memory 예산은 약 1,000 tokens 이내에서 시작해 조정한다. 예산을 채우려고 불필요한 행을 넣지는 않는다. ASCII와 비 ASCII 문자의 token 밀도 차이를 반영한 보수적 근사로 실제 입력량을 제한하며, 축약한 행에는 전체를 같은 ref로 다시 읽을 수 있음을 표시한다. exact-ref 조회는 적어도 첫 요청 행의 전문을 반환해 축약문만 반복하는 상황을 피한다. 8개 같은 예시 숫자는 고정된 검색 규칙이 아니다.

Memory가 적어 모두 예산 안에 들어가는 사용자는 전부 제공해도 된다. 많아지면 관련 기억과 최근 변경을 제한된 범위로 제공한다. ‘최근 몇 행’만 읽는 것을 관련 Memory 검색이라고 부르지는 않는다.

검색 입력은 마지막 한 문장만이 아니라 현재 작업의 목적과 직전 맥락을 포함한다. “왜 그렇게 생각해?”에도 앞서 검토하던 역할의 맥락이 필요하다. 사용자에게 답하는 작업과 JD를 평가하는 작업이 필요로 하는 기억도 다르다.

기본 입력을 일부 제공하는 이유는 모델이 존재조차 모르는 기억을 스스로 찾아야 하는 부담을 줄이기 위해서다. 그렇다고 모든 자료를 기본 context에 넣지는 않는다.

### 7.2 초기 검색 구현은 작게 시작한다

기존 PostgreSQL 안에서 사용자별 행을 제한해 조회하고, 자연어 query의 embedding과 비교하는 의미 검색을 기본으로 구현한다. 작은 사용자별 집합부터 검증하고, 별도 vector 서비스·graph DB·생성형 query rewrite·reranker는 도입하지 않는다.

특정 ref나 페이지 조회는 일반 DB 조회다. 검색 결과를 개선해야 할 때도 우선 query 맥락과 입력 내용을 개선한다. 특정 단어를 보고 Memory/Brief를 재분류하거나 importance를 덮어쓰거나 자동 삭제하는 코드는 만들지 않는다.

본문이 바뀐 Memory만 embedding을 갱신한다. 저장 완료는 embedding 완료에 묶지 않으며, 갱신은 한 번 재시도한다. 아직 index에 반영되지 않았거나 embedding model이 다른 최신 행은 의미 검색 결과보다 먼저 기본 후보에 합쳐 즉시 읽을 수 있게 한다. 오래된 vector가 최신 본문인 것처럼 사용되지 않도록 본문 변경 시 embedding metadata를 함께 비운다.

같은 실행의 동일 query embedding과 읽은 행은 재사용한다. 개인정보가 다른 사용자 결과에 섞이지 않도록 사용자 범위를 먼저 적용하고, 결과는 개수뿐 아니라 token 예산으로 제한한다. 예산을 넘는 기억이 존재함을 숨기지 않는다.

### 7.3 Worker는 한 번 고른 bounded snapshot을 공유한다

Worker에서는 역할·batch마다 embedding search를 반복하지 않는다. 한 추천 run 시작 시 DB를 한 번 읽어 다음 snapshot을 만든다.

- 전체 활성 Brief: 최대 40개이며 저장 계약상 label+content 합계가 8,000자를 넘지 않는다.
- Memory: 최대 12개, 렌더링한 합계 6,000자 이내다.
- Memory 점수: `0.65 × (importance - 1) / 2 + 0.35 × 0.5^(수정 후 경과일 / 180)`이다.
- 같은 점수면 `updated_at`, 그다음 내부 id 최신순으로 고른다.

importance 65%는 매칭에 중요한 오래된 사실을 보존하고, freshness 35%는 최근 바뀐 맥락이 실제로 앞설 여지를 준다. 180일은 자동 삭제 기한이 아니라 최신성 성분의 반감기다. 이 수치는 production 분포와 추천 평가로 조정할 수 있지만, 키워드나 역할별 분기 없이 모든 Memory에 같은 식을 적용한다. 더 이상 사실이 아닌 행을 낮은 freshness로 무시하는 방식에 기대지 않고 write 시점에 update/delete하는 계약이 먼저다.

이 snapshot을 검색 계획, internal fit, external fit·reranking, 최종 추천 작성에 재사용한다. 각 단계는 같은 `Search Brief`와 `Relevant memories`를 보므로 서로 다른 사용자상을 만들지 않는다. 즉시 외부 검색 경로도 같은 reader를 한 번 호출한다. Worker의 scorer에는 Memory write 권한이나 역할별 검색 agent를 추가하지 않는다.

Beta repository의 회사 역할 반복 매칭 스크립트도 같은 가중치·12개·6,000자 계약을 사용하고 Talent Behavior Context fallback을 제거한다. 여러 후보자를 한 번에 읽는 SQL이므로 후보자별 partition 안에서 같은 점수를 계산한다.

이 조회는 선택적 부가기능으로 fail-open하지 않는다. migration 누락이나 DB 오류를 ‘저장된 정보 없음’으로 바꾸면 사용자 기준 없이 추천할 수 있으므로 run을 실패시켜 재시도·운영 확인 대상으로 남긴다. 실제로 행이 0개인 사용자는 정상적인 빈 snapshot이다.

이 방식은 대화 agent의 의미 검색과 의도적으로 다르다. 대화에서는 현재 질문과 관련된 오래된 세부 기억을 on-demand로 찾을 가치가 있지만, Worker는 여러 후보를 한 번에 비교하므로 후보별 retrieval이 비용과 결과 변동을 크게 만든다. 제한된 공통 snapshot은 호출 수와 token 상한을 예측 가능하게 하면서 Brief 전체와 가장 중요한 최근 Memory를 모든 후보에 동일하게 적용한다.

### 7.4 채널과 추천 단계에 연결한다

| 읽는 곳 | 필요한 내용 |
| --- | --- |
| 온보딩 | 현재 Brief, 관련 Memory, 기존 Profile·checklist·대화 |
| 일반 채팅·음성·이메일 | 현재 Brief, 관련 Memory, 현재 요청과 운영 상태 |
| 대화 중 검색 방향 결정 | Brief, Profile, 탐색에 관련된 배경 Memory |
| Worker의 internal/external fit 판단 | 전체 Brief, 공통 bounded Memory snapshot, Profile와 JD |
| 추천 이유 설명 | 실제 판단에 사용한 기준·맥락과 기회 정보 |
| 회사측 조회 | 기존 공유 범위에 허용된 정보만 |

여기서 `talent_contexts` 전체를 모든 기존 `talent_insights` reader에 넘긴다는 뜻은 아니다. `talent_insights`라는 하나의 저장 형태를 여러 소비자가 우연히 같이 읽고 있던 현재 구조를, 소비 목적에 맞는 공통 projection으로 바꾼다.

| 현재 `talent_insights` 소비 경로 | 전환 후 입력 | 전환 원칙 |
| --- | --- | --- |
| 채팅·realtime 음성·통화 wrap-up·일반 이메일 agent | 전체 활성 Brief + token 예산 안의 관련 Memory | 원본 agent가 같은 사용자 context 형식을 읽는다. DB 행·embedding·metadata 전체를 prompt에 넣지 않는다. |
| kickoff·외부 JD 검토·internal opportunity call request·추천/fit worker | 전체 활성 Brief + 중요도·최신성 점수 상위의 bounded Memory + 기존 Profile/JD | 한 추천 run에서 공통 context를 한 번 만들고 모든 단계에서 재사용한다. 역할별 Memory retrieval은 하지 않는다. |
| 웹·음성 온보딩 | 전체 활성 Brief + 필요한 Memory + 기존 checklist/대화 | 질문 진행 여부는 기존 coverage가 담당한다. 기존 질문과 연결된 Brief의 선택적 `key`는 이관과 호환에 쓸 수 있지만, 자유 형식 Brief를 고정 key 체계로 되돌리지 않는다. |
| 이메일 온보딩 progress | 기존 call/checklist progress + 현재 Brief | 모든 Brief를 checklist 응답으로 간주하지 않는다. 연결된 `key`는 이관 기간의 보조 근거일 뿐이고, 일반 이메일 대화에 새 turn별 extractor를 만들지 않는다. |
| Career 프로필·기존 insights UI/API | 전체 활성 Brief 행 | `label`, `content`, 짧은 `ref`로 표시·수정한다. Memory는 별도 보조 관리 화면과 read 경로에서 다룬다. |
| Ops 후보 목록·후보 상세 | 우선 전체 활성 Brief | 목록마다 Memory 전체를 싣지 않는다. 업무상 필요한 상세 화면이나 판단 실행에서만 관련 Memory를 추가 조회한다. |
| 회사측 Harper 정보·자동 소개 | 기존 동의와 공유 범위가 허용한 projection만 | Brief와 Memory 전체를 절대 넘기지 않는다. 기존 연결 `key`는 허용된 과거 필드의 호환에만 사용하고, 자유 형식 label이 비슷하다는 이유로 새 항목을 자동 공유하지 않는다. |
| 계정 삭제·network claim/계정 병합·사용자 데이터 export | 해당 사용자의 Brief와 Memory 행 전체 | 이것은 prompt 입력이 아니라 소유권과 lifecycle 처리다. 두 collection을 모두 빠짐없이 이동·삭제·내보내야 한다. |

따라서 전체 행을 읽는 경우도 의미가 다르다.

- 사용자측 탐색 기준을 보여 주거나 판단할 때는 **전체 활성 Brief**를 읽는다. 자유 형식 항목이 key가 없다는 이유로 빠지면 안 된다.
- Memory는 현재 대화나 역할에 필요한 것만 token 예산 안에서 읽고, 필요하면 원본 agent가 공통 read tool로 더 가져온다.
- 회사측 공유에는 별도의 기존 권한 경계를 적용한다. 사용자측에서 읽을 수 있다는 사실은 회사에 공유해도 된다는 뜻이 아니다.
- 데이터 이관·삭제·export 같은 lifecycle 작업만 두 collection의 전체 행을 대상으로 한다.

구현 이행 중에는 기존 `key -> content` 형태만 이해하는 reader를 위한 얇은 호환 projection을 둘 수 있다. 이 projection은 `key`가 있는 이관/온보딩 Brief만 표현할 수 있으므로 임시 장치다. 새 자유 형식 Brief를 누락시키는 이 projection을 최종 reader로 남겨 두지 않고, 위 표의 사용자측 reader부터 행 목록 입력으로 전환한다. `talent_insights`와 `talent_contexts`를 계속 이중 저장해 맞추는 구조도 만들지 않는다.

현재 존재하는 post-onboarding `refresh-insights`류 경로는 새 저장소를 자동 채우는 상시 extractor로 바꾸지 않는다. 이관 또는 온보딩 예외에 필요한 범위를 확인한 뒤 종료한다. 일반 대화에서는 대화하는 원본 LLM이 공통 read/write tool을 사용한다.

Realtime 음성의 온보딩 후 allowlist에도 같은 read/write tool과 실행 경로를 연결했다. 온보딩 중에는 기존 별도 extractor가 소유하므로 이 tool을 노출하지 않는다. 채팅과 음성이 서로 다른 저장 계약을 쓰지 않는다.

추천 run에서는 공통 사용자 context를 한 번 준비하고 기존 단계별 입력 구성에 전달한다. 모든 후보 역할마다 전체 Memory를 읽거나 다시 요약하지 않는다. 현재 Worker에는 단계별 추가 Memory 조회를 두지 않는다.

### 7.5 최신 기준을 사용하는 책임

write가 성공하면 같은 실행의 후속 검색은 수정된 Brief를 사용한다. 저장 이전 context를 그대로 닫아 둔 채 검색 tool에 넘기지 않는다. 의존하는 검색은 저장 결과를 확인한 뒤 실행한다.

일반적인 write 후 응답에는 모델이 이미 보낸 변경과 짧은 성공 결과면 충분하다. 같은 tool loop에서 사용자 context 전체를 다시 생성하거나 새 번호를 부여하지 않는다. 서버의 행 mapping과 후속 검색 입력만 최신화하고, 다음 사용자 turn에서 최신 기본 블록을 렌더링한다. 동시 수정 충돌 등으로 실제 값이 달라졌을 때는 최신 행을 tool 결과로 제공한다.

정기 추천·fit cache는 해당 판단에 사용한 사용자 context와 이후 변경을 구분할 수 있어야 한다. Brief가 변경됐는데 이전 snapshot에서 평가한 후보를 최종 추천하려면 최신 기준으로 다시 검토한다. 의미가 달라졌는지를 판정하는 별도 규칙 대신 선택된 행의 id·revision·updated_at fingerprint를 확인한다. External fit cache의 입력 fingerprint에도 실제 Profile, Brief, Memory, 현재 interaction과 matching setting을 포함한다. 따라서 Behavior Context version 없이도 사용한 입력이 바뀌면 오래된 fit cache를 재사용하지 않는다.

현재 메시지나 Memory가 기존 동의·공유 권한·설정의 적용 범위를 넘어설 수는 없다. 사용자가 원하는 내용과 시스템상 허용된 행동의 경계는 계속 서버가 지킨다.

## 8. Behavior Context 종료와 이관

Behavior Context를 Brief·Memory 옆의 세 번째 사용자 이해 저장소로 유지하지 않는다. 같은 목표·제약이 서로 다른 시점과 형식으로 겹치고, 별도 LLM이 큰 문서를 재작성하는 비용이 생기며, 어느 값이 현재 기준인지 불명확해지기 때문이다.

최종 소유권은 다음처럼 단순화한다.

| 정보 | 최종 위치 |
| --- | --- |
| 현재 명시적 목표·조건·기회 판단 전제 | Brief 또는 기존 setting |
| 이후 다시 쓸 사용자 배경·경험·판단 맥락 | Memory |
| 추천·거절·조회·메시지 등의 원본 사건 | 기존 feedback·활동·대화 이력 |
| 한 Worker run에서 LLM이 읽는 사용자 context | Brief 전체 + bounded Memory snapshot + Profile·현재 실행 정보 |

로컬 구현에서 production Worker 경로는 다음을 하지 않는다.

- `talent_behavior_contexts`를 읽어 prompt에 넣지 않는다.
- Behavior Context 변경 queue를 읽거나 소비하지 않는다.
- Behavior Context를 갱신하는 별도 LLM을 호출하지 않는다.
- 새 Behavior Context 문서나 version을 쓰지 않는다.
- 같은 run에 Behavior Context와 Memory를 함께 넣지 않는다.

대신 Worker는 `talent_contexts`를 한 번 읽은 snapshot을 모든 추천 단계에 전달한다. 대화에서 새로 알게 된 지속 정보는 온보딩 이후 원본 대화 agent가 같은 Memory/Brief write tool로 관리한다. Worker의 scorer나 orchestration에 Memory write tool을 추가하지 않는다. 추천 반응 같은 원본 사건이 중요해도 Worker가 숨은 장기 판단을 새로 저장하는 구조는 이번 범위에 없다. 나중에 필요성이 검증되면 원본 agent가 일반 read/write 계약을 쓰는 별도 사용자-visible 흐름에서 다루며 Behavior 문서 writer를 되살리지 않는다.

이관 migration은 기존 Behavior Context가 가진 내용을 버리지 않기 위해 기존 heading/bullet을 Memory 행으로 한 번 복사한다. 별도 LLM이나 의미 재분류를 호출하지 않고, 당시 importance 판단이 없으므로 중립값 2를 준다. 그 뒤 메시지·이메일·추천·활동이 legacy change queue를 쌓던 trigger를 제거한다. 기존 Behavior 테이블과 deprecated 호환 코드는 rollback·audit 및 기존 테스트를 위해 잠시 남길 수 있지만 현재 Worker와 beta 추천 실행 경로에서는 읽거나 쓰지 않는다.

이관 완료의 조건은 테이블 삭제가 아니라 실제 실행 경로에 Behavior read/write/LLM call이 없고, Profile·Brief·Memory가 검색 계획부터 최종 추천까지 동일한 snapshot으로 전달되는 것이다. legacy 테이블의 물리 삭제는 rollback 기간과 운영 확인 뒤 별도 migration으로 할 수 있다.

## 9. 사용자 화면과 통제

### 9.1 기존 insights 자리는 ‘탐색 기준’으로 바꾼다

~~~text
탐색 기준
현재 이 내용을 기준으로 기회를 살펴보고 있어요.

다음 역할
제품 방향과 구현을 함께 맡는 엔지니어 역할

선호 근무 지역
서울 또는 원격. 좋은 팀이면 수도권도 검토 가능

기대 보상 조건
총보상 1.2억 원 이상을 기대하되 역할에 따라 협의 가능

                         항목 수정 · 기준 추가
~~~

저장된 label과 content를 그대로 보여 준다. 화면용 요약을 생성하는 LLM 호출은 없다. 항목 추가는 제목과 내용을 입력하는 자유 형식 편집이며, 정해진 유형을 먼저 고르는 절차가 없다. 제목을 고쳐도 같은 행의 내용을 수정한다. 표시 순서는 안정적인 ref 순서를 사용해 기존 항목을 수정할 때 화면과 prompt가 재배열되지 않게 한다.

기존 항목의 초기 제목과 순서는 기존 정의를 활용할 수 있지만, label을 다시 key로 분류하거나 저장된 제목을 고정 번역으로 덮어쓰지 않는다. 이관 시에만 사용자의 `setting_locale`, 없으면 `preferred_locale`에 따라 기존 표준 key의 한국어·영어 초기 label을 선택한다. 따라서 영어 사용자의 기존 insight가 한국어 제목으로 일괄 이관되지 않는다. 이관 뒤 label은 일반 데이터이며 언어 설정을 바꿀 때 자동 재번역하지 않는다. 새 제목도 사용자 언어의 데이터로 저장하고 제목마다 번역 key를 등록하지 않는다. 화면 버튼 등 고정 UI 문구는 기존 번역 체계를 사용한다.

한 항목을 편집하면 해당 행만 저장한다. Profile 수정과 Brief 전체 초안 저장을 묶지 않는다. 직접 입력·삭제에는 LLM을 호출하지 않는다. 추가·편집·Memory 관리·삭제 확인은 `/career`의 공통 `TalentCareerModal`을 사용하며, 삭제 안내에는 저장 행만 없어지고 원본 대화·문서는 유지된다는 범위를 명시한다.

빈 항목을 전부 필수 폼으로 펼치지 않는다. 현재 조건이 있는 항목부터 보여 주고, 온보딩 진행 상태는 기존 흐름에서 관리한다. ‘보상 질문에 답했지만 기준 미정’은 조건 행과 별개다.

### 9.2 대화에서는 적용된 의미를 설명한다

사용자는 내부 저장 구분을 배울 필요가 없다. “수도권까지 넓혀서 살펴볼게요”처럼 무엇이 달라지는지 설명하고 원래 질문이나 검색을 이어 간다. 모든 답변에 Memory 저장 문구를 붙이지 않는다.

조용히 저장한 변경은 작은 표시와 관리 진입점으로 확인할 수 있게 한다. 저장 전에 성공을 단정하지 않고, 저장은 성공했지만 검색이 실패한 상황도 구분해 설명한다.

### 9.3 Memory는 별도의 보조 관리 화면에서 확인한다

Memory 목록을 찾아보고 수정·삭제할 수 있게 한다. 이를 기본 프로필에 모두 펼치거나 Career Timeline으로 재구성하지 않는다. 중요한 기억이 추천 이유에 영향을 줬다면 필요한 근거를 사용자에게 설명할 수 있어야 한다.

구현에서는 Search Brief만 session/chat 응답으로 갱신한다. Memory 전체를 매 응답에 복사하지 않고, 사용자가 관리 화면을 열 때 50개씩 cursor pagination으로 읽으며 필요할 때 더 불러온다. 직접 수정한 행만 원자적으로 저장하고, 대화 agent가 Memory를 바꾼 뒤에는 다음 관리 화면 조회에서 최신 목록을 읽는다. 이 UI 조회 정책은 LLM prompt의 관련 Memory 검색과 별개다.

‘조건을 더 이상 적용하지 않기’와 ‘그 기억을 지우기’는 다르다. 삭제한 행은 기본 context·검색·캐시에서 제외하고, 같은 원본을 자동 재처리하는 이관·갱신 경로로 되살리지 않는다. Memory 삭제와 원문 대화·문서 삭제는 별개임을 명확히 한다. 모든 표현의 의미를 대조하는 삭제 키워드 목록이나 별도 판단 그래프는 만들지 않는다.

Memory를 추가한다고 기존 수집·안전·공유 범위를 넓히지 않는다. 기회 판단에 필요한 맥락과 불필요한 민감 상세를 구분한다. 회사 reader에는 기존 허용 정보 구성 경로만 연결하며, Memory 전체를 노출하지 않는다. 허용된 Brief key라도 사적인 이유까지 통째로 공유해도 된다는 뜻은 아니다.

현재 회사측 `readHarperSharedInformation`은 고정 key로 허용 필드를 읽는다. 이관된 연결과 온보딩에서 생성한 연결은 보존한다. key 없는 새 항목도 사용자측 탐색·추천에는 쓰지만, 제목이 비슷하다는 이유로 회사 공유 필드에 자동 편입하지 않는다. 회사에 전달할 내용은 기존 공유 절차에서 허용된 범위로 구성한다. 자유 형식 저장과 자동 회사 공유는 서로 다른 기능이다.

## 10. 실제 대화에서 끝까지 어떻게 작동하는가

아래는 설계를 확인하기 위한 예시다. 이 문장들을 production의 키워드·시나리오 분기로 만들지 않는다.

### A. 중요한 과거 이야기를 말한다

사용자: “예전에 한 회사에서 오퍼가 왔었는데 면접을 보다가 그냥 안 갔어.”

1. 원본 agent가 현재 대화와 제공된 기억을 읽고, 이후에 유용한 이야기라고 판단한다.
2. write에서 Memory add와 importance를 요청한다. 저장할 문장은 사용자가 말한 제안과 중단 사실, 확인 가능한 시점을 보존한다.
3. DB에 Memory 행 하나가 생긴다. 기존 회사 선호·검색 조건·지원 workflow는 자동으로 바뀌지 않는다.
4. 원본 agent는 사용자의 원래 이야기나 고민에 답한다. “면접을 마친 정식 오퍼” 등 말하지 않은 단계로 보강하지 않는다.
5. 이후 관련 역할을 검토할 때 이 기억을 조회할 수 있다. 회사 이름만으로 능력을 점수화하는 로직은 없다.

표현이 불명확하면 그 수준 그대로 기억하고, 정확한 단계가 필요한 시점에 확인한다. 단순 관심 연락을 오퍼로 부풀리거나, 반대로 사용자가 말한 오퍼를 임의로 지우지 않는다.

### B. 현재 기준을 바꾸면서 새 탐색을 요청한다

기존 [2] 선호 근무 지역: “서울만 검토한다.”
기존 [7] 선호하는 회사의 조건: “초기 스타트업을 선호한다.”

사용자: “이제 좋은 동료한테 배울 수 있으면 수도권도 괜찮아. 그 기준으로 찾아줘.”

원본 agent는 같은 write 요청으로 두 행을 수정할 수 있다.

~~~json
{
  "changes": [
    {"op":"update","ref":2,"content":"서울을 선호하며, 함께 배울 동료가 좋은 팀이면 수도권도 검토한다."},
    {"op":"update","ref":7,"content":"초기 스타트업을 선호하며, 함께 배울 동료가 있는 팀을 중요하게 본다."}
  ]
}
~~~

서버는 두 행만 수정하고 성공한 ref를 반환한다. Memory·Profile·온보딩 coverage는 바꾸지 않는다. 그 뒤 기존 검색 기능이 최신 Brief를 사용한다.

검색에 맞는 후보가 없었다면 응답은 예를 들어 “수도권까지 넓히고, 함께 배울 동료가 있는 팀을 중요하게 볼게요. 이번 조회에서는 두 조건에 맞는 후보를 찾지 못했어요”가 된다. 저장 성공을 검색 성공으로 바꾸어 말하지 않는다.

### C. 현재 고민을 말하지만 방향은 유지한다

사용자: “창업을 고민하긴 하는데 당장 이직 방향을 바꾸진 않을래.”

원본 agent는 고민을 Memory로 남기고 매칭에 미치는 중요도를 판단할 수 있다. 현재 Brief는 유지한다. 다음에 역할 선택을 고민하면 이 맥락을 참고하되 창업 관련 역할만 찾는 조건으로 바꾸지는 않는다. 미결정 상태를 보존하기 위해 별도 confidence enum이나 상태 머신은 필요 없다.

### D. 온보딩에서 보상을 아직 정하지 못했다

기존 보상 Brief가 없고, 보상 질문에 “아직 모르겠어요”라고 답했다면 기존 extractor는 다음과 같이 출력할 수 있다.

~~~json
{"changes":[],"covered_onboarding_checklist":["compensation"]}
~~~

새 보상 행은 없다. 기존 온보딩 진행에는 답한 주제로 남아 같은 질문을 반복하지 않는다. 일반 대화 agent에 이 checklist를 관리하는 일을 넘기지 않는다.

### E. 다른 상황도 같은 계약으로 처리한다

| 상황 | 처리와 데이터 변화 | 사용자 경험 |
| --- | --- | --- |
| “서울은 필수가 아니라 선호야” | 현재 선호 근무 지역 ref update | 화면과 후속 판단에서 강도가 완화됨 |
| “제품의 방향을 정하는 논의부터 참여하고 싶어” | 기존 행을 읽고 필요하면 자유로운 label의 Brief add | 기존 목록에 없는 기준도 화면과 추천에 반영됨 |
| “그 항목 제목을 ‘제품 의사결정 참여’로 바꿔줘” | 같은 Brief ref에 label만 update | 새 행이나 본문 재작성 없이 제목이 바뀜 |
| 이력서에 없는 중요한 업무를 말함 | 알맞은 경력 row memo, 붙일 곳이 없으면 Memory | 저장할 곳이 없다고 누락하지 않음 |
| “이 역할은 이번에 패스” | 기존 feedback 원본 수정 | 역할 반응을 반영하되 업계 전체 제외로 확대하지 않음 |
| “이번에는 일본도 한번 보자” | 맥락상 단발성이면 현재 검색만 수행 | 영구 Brief를 바꾸지 않고도 탐색 가능 |
| 이전 기억을 정정함 | 기본 ref 또는 read 후 해당 행 update | 원문을 다시 설명하거나 전체 문서를 쓰지 않음 |
| “이 기억은 지워줘” | ref 확인 후 delete | 다음 기본 읽기·Memory 검색에서 제외 |
| UI에서 보상 항목만 수정 | 해당 Brief 행 DB update, LLM 없음 | 다른 항목의 오래된 초안을 덮어쓰지 않음 |
| UI·채팅이 같은 행을 동시 수정 | revision 충돌, 최신 내용 반환 | 서버의 임의 병합 없이 최신 내용을 보고 처리 |
| 통화에서 조건 수정 후 웹으로 복귀 | realtime 원본 agent가 같은 write 사용 | 채널이 바뀌어도 같은 기준을 봄 |
| 몇 달 전 맥락을 고유명사 없이 질문 | 의미 검색 후 필요한 원문 read | 최근 행이나 회사 이름에만 의존하지 않고 과거 맥락을 찾음 |

## 11. 비용·확장성에 대한 판단

### 11.1 비용효율적인 방향이지만 ‘공짜 저장’은 아니다

현재 일반 채팅도 변경 insight key만 출력하고 서버가 JSON을 병합한다. 행으로 바꾼다는 이유만으로 현재보다 쓰기 tokens가 크게 줄어든다고 주장하지 않는다.

기존에는 버렸을 맥락도 보존하므로 저장 tool을 쓰는 대화의 비율은 오히려 높아질 수 있다. 이 추가 비용은 새로운 기억 기능의 비용이며, 저장 단위를 행으로 바꿔 절약하는 비용과 구분해서 계산한다. Worker에서는 기존 Behavior Context 재작성 모델 호출을 제거했으므로 갱신이 필요했던 run은 생성형 호출 하나가 줄어든다. 실제 총절감은 일반 대화의 새 write 빈도와 기존 Behavior 갱신 빈도를 함께 측정해야 한다.

행의 이점은 저장·편집·조회 단위를 일치시키는 데 있다. 큰 문서 전체를 생성하는 대안에 비해서는 작은 변경만 출력한다. 하지만 원본 모델이 tool 결과를 받아 답하는 후속 모델 요청은 생길 수 있다.

| 상황 | 모델·저장 비용 |
| --- | --- |
| 일반 대화, 저장할 내용 없음 | 원래 대화 호출과 기본 context. 별도 extractor 없음 |
| 제공된 행 수정 또는 Memory 추가 | 원본 agent의 tool 출력 + DB 쓰기 + 통상 후속 응답 호출 |
| 먼저 기억을 검색해야 함 | query embedding·DB 조회 + tool 결과를 읽는 원본 모델 비용 |
| 여러 변경을 함께 처리 | 하나의 changes 요청에 묶음. 행마다 별도 모델 호출하지 않음 |
| 온보딩 | 기존 extractor 유지. Memory/Brief별로 호출을 늘리지 않음 |
| Worker 추천 run | context DB 조회 한 번. 별도 Behavior 재작성 LLM과 단계별 Memory retrieval 없음 |
| UI 직접 편집 | DB 변경. 생성형 모델 호출 없음 |

원본 tool loop라는 것은 별도 전문 추출기를 두지 않는다는 뜻이지, 총 모델 API 호출이 항상 한 번이라는 뜻이 아니다. 쓰기 성공을 확인한 후 답하면 지연도 추가될 수 있다. 숨은 background extraction으로 이 비용을 감추는 방식은 채택하지 않는다.

### 11.2 어디서 실제로 비용을 줄이는가

1. 기본 context에 있는 행을 수정하기 위한 재조회는 생략한다.
2. 한 메시지에서 나온 여러 변경은 한 write에 묶는다.
3. UUID, 반복 label, 분류 근거, 전체 수정 문서를 출력하지 않는다.
4. 정상 write 결과는 적용 ref 중심으로 반환한다.
5. Memory 전체를 매 turn 읽지 않고 필요한 양만 읽는다.
6. 추천 run에서는 Brief 전체와 상위 Memory snapshot을 DB 한 번으로 읽어 모든 단계에서 재사용한다.
7. embedding은 본문이 바뀐 행만 갱신한다.
8. 화면용 요약, 일반 대화 extractor, 별도 Behavior 문서 재작성 호출을 두지 않는다.

예를 들어 Brief 1,200 tokens와 Memory 500개 × 평균 70 tokens를 모두 넣으면 이 부분만 약 36,200 tokens다. 대화 agent에서 관련 Memory 8개를 넣으면 약 1,760 tokens다. Worker는 Brief 합계 최대 8,000자와 Memory 합계 최대 6,000자로 context를 제한하므로 한국어·영어 혼합 내용에서 대략 수천 tokens 범위다. Worker의 여러 LLM 단계에는 같은 snapshot tokens가 각각 입력되지만, Memory 수 증가에 따라 무제한 커지거나 역할별 retrieval 호출이 늘지는 않는다. 이는 산술 예시이며 실제 계정 측정이나 검색 정확도 보장은 아니다. 대화·Profile·tool schema·후속 요청 비용은 별도로 포함해야 한다.

전체 비용은 생성형 모델의 모든 입력·출력, embedding, DB/검색, 저장량을 합쳐 비교한다. 평균뿐 아니라 기억이 많은 사용자와 tool을 연달아 쓰는 대화의 지연도 본다.

### 11.3 초기 input 예산과 추가 비용

이번 대화의 간이 계산에서는 기존 insights 저장 schema·지침을 빼고 새 공통 tool·짧은 지침·label/ref를 넣는 순증을 약 300~600 tokens, 관련 Memory를 약 400~800 tokens로 보았다. 합계 약 700~1,400 tokens, 예산 중심값은 호출당 약 1,000 tokens다. key를 일반 tool에서 뺀 이번 계약에 정밀 측정한 수치는 아니며, 로컬 tokenizer와 예상 schema를 사용한 규모 추정이다. 실제 모델·언어·행 길이로 검증한다.

기존 insights의 내용은 Brief로 대체되므로 Brief 전체를 순증으로 더하지 않는다. Memory 수가 늘어도 기본 입력에는 예산 안의 일부만 제공한다. 반면 tool 정의는 사용하지 않는 호출에도 입력 비용이 든다. 설계 문서 전체나 시나리오 목록을 system prompt에 복사하지 않는다.

2026-09-07 로컬 기본 모델은 Claude Sonnet 5이며, 공식 단가는 input $2/100만 tokens, cache read $0.20/100만 tokens, 5분 cache write $2.50/100만 tokens, output $10/100만 tokens다. 아래는 일반 input 단가만 사용한 예산 예시다. [공식 요금](https://platform.claude.com/docs/en/about-claude/pricing)

| 가정 | 추가 input 비용 |
| --- | --- |
| 모델 요청마다 1,000 tokens 추가 | 요청 1,000회당 $2 |
| 같은 조건으로 월 100,000회 모델 요청 | 월 $200 |
| 원래 1회 호출로 끝나던 대화의 20%에서 10,000-token 후속 호출이 새로 생김 | 기본 순증 포함 대화 1,000회당 $6, 월 100,000회당 $600 |

마지막 행의 산식은 `1,000 + 0.2 × 10,000 = 대화당 평균 추가 3,000 tokens`다. 20%는 측정된 저장 빈도가 아니라 가정이며, 기존에도 insights 저장이나 다른 tool 때문에 했을 호출은 새 추가 호출로 세지 않는다. 기존 대화가 여러 모델 요청을 썼다면 고정 순증도 그 요청 수만큼 계산한다.

위 금액은 원래 대화 비용·추가 output·embedding·DB 비용을 포함하지 않는다. 캐시 할인도 적용하지 않았다. 비용을 가장 크게 바꾸는 것은 key 몇 tokens보다 기본 Memory 양과 **새로 생기는 모델 왕복 수**다. 구현 후에는 tool 하나의 비용보다 사용자 메시지 하나를 끝까지 처리한 전체 요청·tokens·지연을 본다.

### 11.4 반복 입력을 실제로 캐시할 수 있게 한다

공통 tool 정의와 짧은 고정 지침은 안정적인 앞부분에, 사용자별 Brief·Memory와 변하는 작업 정보는 그 뒤에 둔다. 같은 tool loop에서 변하지 않은 블록의 내용·순서를 유지하고, write 후에는 변경 인자와 성공 결과를 재사용한다. prompt cache는 prefix가 같아야 재사용되므로 단순히 ‘캐시 사용’ 설정만 켠 것으로 절감 효과를 가정하지 않는다. [Anthropic의 캐시 구성 설명](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)

현재 `career/llm.ts`에는 tools와 system 블록의 캐시 지점이 있지만, streaming 후속 단계에서 tool 목록과 정책을 좁히거나 tool 없이 최종 답하는 경로도 있다. 새 read/write가 이 흐름에서 어떻게 이어지는지 확인한다. 권한과 필요한 실행 기능이 동일한 단계에서는 불필요하게 정의를 바꾸지 않되, 캐시를 위해 실행 권한을 넓히지는 않는다.

같은 실행에서는 Memory 검색 결과와 ref를 재사용한다. 검색 결과를 매번 다시 정렬하거나 현재 시각·revision·내부 key를 모든 행에 출력해서 앞부분을 바꾸지 않는다. 현재 날짜처럼 의미 판단에 필요한 정보는 필요한 위치에 한 번 제공한다. 다음 사용자 turn에서는 최신 상태로 시작한다.

### 11.5 규모가 커져도 같은 계약을 유지할 수 있다

사용자별 행 조회와 제한된 Memory context를 사용하므로 Memory 저장량 증가가 매번 LLM 입력 증가로 그대로 이어지지는 않는다. 대화 retrieval을 나중에 개선해도 LLM의 read/write 계약과 Brief UI는 유지할 수 있다. Worker 역시 사용자별 한 query와 12개·6,000자 상한이어서 후보 수가 늘어도 context 조회 횟수는 늘지 않는다. Brief는 전체를 읽지만 저장 계약에서 40개·8,000자로 제한한다. Profile과 역할 데이터까지 포함한 전체 prompt가 고정 크기라는 뜻은 아니다.

반면 DB 비용은 증가한다. 사용자 10만 명 × Memory 200개면 2천만 행이다. 본문 평균 1 KB면 본문만 약 20 GB, 1,536차원 float32 vector를 모두 붙이면 원시 vector 값만 약 123 GB다. index·복제·backup은 제외한 산술 예시다.

따라서 처음부터 무제한 저장·조회가 싸다고 가정하지 않는다. 실제 사용자별 분포로 조회 지연과 저장 비용을 검증하고, 필요할 때 index·embedding 크기·검색 실행을 최적화한다. 이 문제를 해결하려고 의미 없는 세부 Memory taxonomy나 graph를 먼저 도입하지 않는다.

Brief는 항목별로 통합해 간결하게 유지한다. 저장 상한을 넘기려는 새 변경은 거절하고 기존 항목을 정리하게 하며, 이미 저장된 활성 조건을 Worker가 임의로 잘라 숨기지는 않는다. Memory도 오래됐다는 이유만으로 삭제하지 않는다. Worker의 최신성은 제한된 입력에서 순서를 정할 뿐 사실의 유효성을 대신하지 않는다.

### 11.6 최종 평가

- **비용:** 매 turn 전체 재독해·별도 추출·전체 재출력을 피하므로 통제 가능한 방향이다. 기존 대비 실제 절감은 측정해야 한다.
- **확장성:** 저장량과 모델 context를 분리하고 read 계약을 유지할 수 있다. 큰 사용자 집합의 검색과 DB 비용은 실제 부하로 검증해야 한다.
- **LLM 사용성:** 짧은 ref와 하나의 변경 계약이 유리하다. 관련 context가 부족하거나 기존 tool과 역할이 겹치면 여전히 실패할 수 있다.
- **사용자 경험:** 연속성·투명성·직접 수정이 좋아질 수 있다. 잘못 기억하거나 적용 강도를 높이면 오히려 해롭기 때문에 저장 성공률만으로 판단하지 않는다.

## 12. 다른 서비스·공개 설계에서 참고한 것

2026-09-07 공식 자료 재확인 기준. 소비자 서비스의 공개 기능과 agent framework의 설계를 구분했다. 비공개 DB schema를 추정하거나 vendor 성능 수치를 Harper의 성능처럼 사용하지 않는다.

| 참고 대상 | 공개 문서에서 확인한 내용 | 채택할 점과 채택하지 않을 점 |
| --- | --- | --- |
| [Claude의 memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context) | 현재 안내는 대화 중 개별 주제로 기억을 저장하고, 사용자가 항목을 확인·수정·삭제할 수 있다고 설명한다 | 항목별 관리와 대화 간 연속성을 참고한다. 공개 설명만으로 실제 DB가 행 기반이라고 단정하지 않는다 |
| [Anthropic의 context 설계](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | 유한한 context, 일부 기본 입력과 필요할 때의 tool 조회, 최소한의 명확한 tool 구성을 강조한다 | 작은 기본 Memory + on-demand 조회를 채택한다. 모든 맥락을 미리 요약하는 agent를 추가하지 않는다 |
| [Anthropic의 tool 설계](https://www.anthropic.com/engineering/writing-tools-for-agents) | 기능이 겹치지 않는 tool, 관련 내용 위주의 결과, UUID보다 이해하기 쉬운 identifier를 권한다 | 공통 read/write와 [1] ref를 사용한다. 정확한 효율 개선 폭은 Harper에서 따로 검증한다 |
| [LangGraph memory 개념](https://docs.langchain.com/oss/python/concepts/memory) | collection의 부분 갱신 이점과 과잉 추가·과잉 수정·검색 부담, 대화 중 저장의 지연과 attention 비용을 설명한다 | 기존 행을 함께 제공해 불필요한 add를 줄이고, 원래 요청의 완료와 저장 품질을 함께 본다. 이 문서의 일반 대화 저장은 원본 agent tool로 유지한다 |
| [Mem0 add](https://docs.mem0.ai/core-concepts/memory-operations/add) | 기본 add에는 LLM 추출이 있고 infer=false는 그대로 저장하는 경로다 | 외형상 tool 한 번이어도 내부 추출 비용이 있을 수 있음을 확인한다. Harper는 이 추가 생성형 pipeline을 도입하지 않는다 |
| [Zep graph](https://help.getzep.com/graph-overview) | 사용자별 entity·관계·시점 정보를 자동으로 구성하는 temporal graph를 설명한다 | 시간에 따른 변화의 중요성은 참고하되, 현재 요구에는 graph·관계 추출·사실별 수명 모델을 도입하지 않는다 |

공통 교훈은 ‘어떤 memory 제품을 붙이면 해결된다’가 아니다. 남길 정보, 읽히는 맥락, 실제 적용과 사용자 통제를 함께 설계해야 한다. Harper는 그 목적을 현재의 프로필·온보딩·추천 흐름 위에서 가장 적은 새 구조로 달성한다.

Harper에서 Brief를 따로 두는 이유는 범용 memory 서비스의 분류 체계를 복제하기 위해서가 아니다. 사용자가 ‘지금 무엇을 기준으로 기회를 보고 있는지’를 확인·수정하게 하려는 제품상의 필요다. Memory의 풍부한 배경을 보존하면서도 탐색 기준 화면을 간결하게 유지하는 것이 이 분리의 이점이다. 실제 저장·조회·수정은 하나의 행 구조와 공통 tool로 처리한다.

## 13. 구현 범위와 완료 조건

### 13.1 구현 상태와 남은 전환

| 영역 | 현재 브랜치 상태 | production cutover 전 남은 일 |
| --- | --- | --- |
| 공통 저장·조회 | `talent_contexts`, 사용자별 안정적인 숫자 ref, revision/idempotency RPC, Memory importance 1~3, 의미 검색, 최신 unindexed Memory 우선 포함, embedding 재시도와 backfill 명령 구현. 새 변경으로 활성 Brief가 40개 또는 label+content 합계 8,000자를 넘어 더 커지는 것은 원자적 RPC에서 막되, 기존 초과 계정은 삭제·축소와 Memory 변경을 계속 허용 | 두 migration을 검토·적용하고 실제 DB 권한·vector query·부하 확인 |
| 일반 웹 채팅 | 원본 agent에 공통 read/write 노출. post-onboarding 별도 extractor 없음 | 대화 단위 저장·정정·검색 회귀 평가 |
| realtime 음성 | post-onboarding에 같은 read/write와 tool-call idempotency 연결. 온보딩에는 노출하지 않음 | 실제 통화 저장→웹 UI 반영 E2E |
| 온보딩 | 기존 extractor 한 번이 공통 `changes[]`로 Brief/Memory를 함께 저장. checklist 유지 | 긴 답변·동시 turn·마지막 답변 반영 평가 |
| 이메일 대화 | post-onboarding 원본 이메일 agent에 같은 ref 기반 read/write를 노출. `update_talent_profile.talentInsights`를 제거하고 기본 prompt에는 전체 Brief와 중요도·최신성 상위 Memory만 한 번 조회해 제공. 이메일 온보딩은 기존 progress tool 하나를 유지하되 `contextChanges[]`를 같은 RPC에 저장. 이메일에서 바뀐 Memory도 발송 후 한 embedding batch로 갱신하며 실패 시 한 번 재시도한다 | 실제 이메일 답장→저장→웹 UI/다음 추천 반영 E2E |
| 사용자 UI | 기존 insights 영역을 자유 label/content Brief와 lazy-paginated Memory 관리로 전환 | 실제 모바일/데스크톱 시각·동시수정 검증 |
| beta 추천·Ops reader | 웹 추천, full-JD, kickoff, call request, Ops 상세/목록, 회사측 제한 projection 전환. 반복 매칭 script도 Talent Behavior fallback 없이 전체 Brief와 같은 중요도·최신성 상위 Memory 12개/6,000자를 읽음 | 실제 DB query와 반복 매칭 prompt 크기·추천 품질 검증 |
| 기존 데이터 | keyed insights→사용자 locale에 맞는 초기 label의 Brief, 기존 Behavior Context bullet→importance 2 Memory의 일회성 SQL과 Memory embedding backfill 명령 구현. 이미 첫 migration을 적용한 환경을 위한 보완 migration도 추가 | production 표본 audit와 migration/backfill 실행. legacy table은 rollback 기간 뒤 별도 제거 |
| `harper_worker` | production v2 경로에서 Behavior Context read/write/LLM 갱신을 제거. 한 DB 조회로 전체 Brief와 중요도 65%·최신성 35% 상위 Memory 12개/6,000자 snapshot을 만들고 internal/external fit·rerank·delivery에 재사용. 실제 context를 external fit cache fingerprint에 포함. 이메일·온보딩 contact·기존 worker profile loader의 `talent_insights` DB reader/writer도 공통 행과 keyed Brief 호환 projection으로 전환 | 깨끗한 test environment에서 전체 관련 suite, 실제 DB query plan·context 크기·추천 품질 검증 후 beta와 함께 cutover |

같은 저장 처리를 TypeScript와 Python에서 제각각 재구현하지 않도록 DB의 원자적 변경 계약을 공유한다. 채널별 adapter는 인증된 사용자·원문 출처·ref를 연결한다. 의미 판단 코드를 공통 유틸리티라는 이름으로 추가하지 않는다.

이는 개발 순서이며 새 writer만 먼저 운영에 켜라는 뜻이 아니다. 전환할 사용자의 writer와 reader가 함께 준비돼야 한다. 이관은 일회성 변환이며 두 원본을 영구 동기화하는 구조가 아니다. 이전 경로로 복구할 때도 전환 후의 새 쓰기를 버리는 방식은 허용하지 않는다.

schema migration은 기존 `talent_insights`를 먼저 손실 없이 keyed 행으로 가져오고, cutover용 partition script가 표준 온보딩 key만 locale에 맞는 label의 Brief로 유지한다. `technical_strengths` 같은 custom key는 현재 탐색 기준으로 단정하지 않고 importance 2 Memory로 옮기며 원래 key는 migration 출처에 남긴다. 네트워크 가입의 신규 seed도 `dreamTeams`는 Brief, `impactSummary`는 Memory로 직접 구분해 Technical Strength가 Brief에 다시 생기지 않게 한다. 기존 Behavior Context는 이미 LLM이 작성한 heading/bullet 문서이므로 bullet별 importance 2 Memory로 구조적으로 옮기며, 예상 형식이 아닌 문서는 전체 text를 보존한다. 한 행의 DB 길이 한도를 넘는 비정상적으로 긴 원문은 누락시키지 않고 순서가 있는 여러 행으로 나눈다. 이 과정에서 별도 생성형 LLM을 호출하거나 일반 대화의 의미 분류를 키워드 규칙으로 대체하지 않는다. production 적용 전에는 custom insight와 Behavior 문서 형식을 표본 audit한다. 의미 재정리가 필요하면 일회성 검토 작업으로 하되 일반 대화 extractor로 남기지 않는다.

### 13.2 이번 beta 구현에서 연결한 지점

- beta와 worker 이메일 모두 `update_talent_profile.talentInsights` 쓰기를 제거하고 일반 대화에는 `read_talent_context`와 `write_talent_context`만 노출했다.
- 일반 write schema에는 key와 label enum이 없다. 구조적 제한은 `op`, `collection`, Memory importance 1~3뿐이다.
- 온보딩 질문 key·label·coverage와 기존 추가 질문 흐름은 유지하고, 저장 결과만 공통 `changes[]`로 전환했다.
- chat/realtime prompt의 기존 insights 본문은 ref가 있는 Search Brief/Relevant memories 텍스트 하나로 교체했다. 현재 값은 checklist나 legacy fallback에 반복하지 않고, 온보딩 coverage 계산만 keyed Brief projection을 사용한다.
- Search Brief는 UI·채팅·beta 추천/fit·Ops reader가 자유 label 행까지 읽는다. 회사측에는 기존에 허용된 keyed subset만 전달하고 Memory와 자유 Brief는 자동 공유하지 않는다.
- UI는 Profile 전체 초안과 분리된 행 단위 쓰기와 `TalentCareerModal`을 사용한다. Memory 목록은 일반 응답에 포함하지 않고 관리 화면에서 페이지 단위로 읽는다.
- `refresh-insights`와 `update-insights` post-onboarding API는 상시 extractor로 전환하지 않고 종료 응답을 반환한다.
- `harper_worker`의 production v2 loader는 Behavior Context writer를 호출하지 않고 새 snapshot을 사용한다. Beta의 full-JD fallback도 legacy Behavior Context를 읽지 않는다. legacy 모듈·테이블·generic cache column은 rollback과 호환을 위해 남아 있으나 현재 실행 입력의 원본이 아니다.

### 13.3 검증은 실제 사용자 경험 단위로 한다

실제 평가를 만들 때는 repository의 evaluation registry 계약을 따른다. 이번 문서 작업에서는 모델 평가나 production 데이터 처리를 실행하지 않는다.

첫 문장에서 저장했는지뿐 아니라, 여러 turn 뒤 새로운 표현으로 물었을 때 회수되는지 확인한다. 정정한 조건이 UI·검색·fit·설명까지 일치하는지, 저장을 하느라 원래 질문을 놓치지 않는지 확인한다.

특히 다음 실패는 전환 전에 확인한다.

- 긴 답변 뒤쪽의 중요한 정보, 오래된 사실, 고유명사 없는 질의에서 기억이 누락된다.
- 희망을 하드 조건으로 바꾸거나 일회성 요청을 영구 기준으로 만든다.
- Brief/Memory 또는 기존 profile writer에 같은 사실을 반복 저장한다.
- 새로운 label로 만든 조건이 고정 key reader에서 빠지거나, 제목 변경으로 같은 조건을 새로 저장한다.
- ref를 잘못 쓰거나 동시 수정으로 다른 조건을 덮어쓴다.
- 저장 실패를 성공으로 말하거나 검색 실패를 저장 실패와 혼동한다.
- Memory가 권한 밖 사용자·회사 context로 넘어가거나 삭제 행이 재노출된다.
- 온보딩 coverage가 사라지거나 마지막 답변이 첫 추천에 반영되지 않는다.
- Memory가 많아질수록 기본 context와 모델 왕복 수가 제한 없이 증가한다.

같은 대화 조건에서 기존 방식과 새 방식의 모델 호출 수·입출력 tokens·저장/조회 지연을 비교한다. 구조는 이 문서대로 고정하되, 결과가 부족하면 prompt·제공 context·tool 설명·검색 품질을 개선한다. 사례별 키워드 분기나 별도 판단 상태 머신으로 우회하지 않는다.

## 14. 코드 근거와 운영 지침

현재 브랜치의 구현 근거가 되는 주요 파일이다.

| 확인 내용 | 파일 |
| --- | --- |
| 공통 저장·조회·prompt projection | `src/lib/talentOnboarding/talentContexts.ts` |
| DB schema·RPC·기존 데이터 이관 | `supabase/migrations/20260907170000_talent_contexts.sql`, `supabase/migrations/20260908190000_talent_context_importance.sql` |
| 항목 key·label·질문 연결 | `src/lib/talentOnboarding/insightChecklist.ts` |
| 현재값·coverage 프롬프트 | `src/lib/career/prompts/conversationSections.ts` |
| extraction 입력·실행 | `src/lib/talentOnboarding/chatInsights.ts`, `src/lib/career/prompts/cases/insightExtractionPrompts.ts` |
| 일반 대화 tool·채널별 노출 | `src/lib/talentOnboarding/tools.ts`, `src/lib/career/llmTools.ts` |
| 원본 모델 tool loop | `src/lib/career/llm.ts` |
| 채팅·공유 실행·음성 저장 | `src/app/api/talent/chat/route.ts`, `src/lib/career/chatTurn.ts`, `src/app/api/talent/chat/save/route.ts` |
| Brief/Memory API와 UI | `src/app/api/talent/contexts/route.ts`, `src/components/career/profile/CareerTalentContextSection.tsx`, `src/hooks/career/useCareerTalentContexts.ts` |
| 즉시 추천·회사측 제한 reader | `src/lib/talentOnboarding/jobPostingRecommendations.ts`, `src/lib/org/agent/data.ts` |
| embedding backfill | `scripts/backfillTalentContextEmbeddings.ts` |
| beta 반복 매칭 reader | `scripts/company_role_recurring_matching.py` |
| Worker bounded context 조회·점수 | `harper_worker/opp/agentic/talent_context.py` |
| Worker 실행 projection·Behavior cutover | `harper_worker/opp/agentic/current_state.py`, `harper_worker/opp/agentic/user_context.py`, `harper_worker/opp/new_harper_agent_v2.py` |
| Worker fit prompt·cache fingerprint | `harper_worker/opp/agentic/prompts.py`, `harper_worker/opp/utils/internal_fit.py`, `harper_worker/opp/utils/external_deepseek_selector.py` |
| Worker 이메일 context·tool·온보딩 호환 projection | `harper_worker/email_reply/db.py`, `harper_worker/email_reply/prompt.py`, `harper_worker/email_reply/tools.py`, `harper_worker/email_reply/contact_queue.py` |

설계 원칙은 workspace와 Harper repository의 AGENTS.md에도 남긴다. 온보딩의 기존 예외를 존중하면서, 일반 대화의 의미 판단을 원본 LLM과 명확한 tool 계약에 맡긴다는 원칙을 이후 구현·리뷰에서도 유지한다.
