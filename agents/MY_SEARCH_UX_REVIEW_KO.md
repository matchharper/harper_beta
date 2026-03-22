# Harper Beta `my` Search UX Review

작성일: 2026-03-21

범위: 데스크톱만 검토. `my` 검색 진입 화면, 대화형 criteria 확정, 결과 화면(card/table), 페이지 이동, 후보 상세, shortlist 흐름을 코드와 실제 화면으로 확인했다.

가정한 핵심 사용자:

- 채용 매니저 / 리크루터 / 창업자
- 한 번에 여러 후보를 빠르게 비교하고 shortlist 해야 하는 사람
- 크레딧과 시간 낭비에 민감한 사람

좋았던 점:

- scholar 기반 검색 결과는 근거 텍스트가 꽤 강하고, 후보 상세 화면의 evidence 깊이도 좋다.
- split view 자체는 “대화 맥락”과 “결과 비교”를 함께 보려는 방향성은 맞다.
- profile detail에서 저장 / intro 요청 / 링크 확인까지 이어지는 액션은 비교적 자연스럽다.

## 우선순위 높은 이슈

### P0. 결과 페이지를 넘길 때 크레딧이 차감되는데, 화면에서는 거의 드러나지 않는다

- 실제 확인 결과, scholar 검색 결과에서 `페이지 2`로 이동하는 순간 남은 크레딧이 `10 -> 9`로 감소했다.
- 사용자는 `다음 10명 더 보기`를 단순 pagination으로 인식하기 쉽다. 이 상태에서 과금/차감이 일어나면 신뢰가 크게 깨진다.
- 특히 결과를 “탐색”하는 행위와 “새 검색을 실행”하는 행위가 심리적으로 다르기 때문에, 현재 동작은 비용 체감이 뒤늦게 온다.
- 최소한 버튼 레벨에서 `다음 10명 보기 · 1 credit`처럼 명시해야 한다.
- 더 좋은 방식은 첫 페이지 로드 직후에 “추가 페이지는 1 credit씩 차감”을 상단 또는 페이지네이션 바로 위에 고정 노출하는 것이다.
- 코드 근거: `src/pages/my/c/[id].tsx` 204-224, `src/pages/my/c/ResultBody.tsx` 68-145

### P1. Source 모델은 3개를 전제로 설계돼 있는데, 사용자는 그 규칙을 거의 이해할 수 없다

- 코드상 `linkedin / scholar / github` 3개 source가 모두 준비돼 있지만, 검색 시작 화면의 source 선택 UI는 주석 처리되어 있다.
- 실제 화면에서는 “지금 어느 source로 검색하는지”, “자동으로 결정됐는지”, “복수 source가 포함됐는지”가 거의 보이지 않는다.
- 결과 화면 헤더에서도 scholar일 때만 `from publications`가 표시되고, linkedin/github는 명시적 설명이 없다.
- 사용자는 “왜 이 사람이 나왔는지”만큼 “어떤 데이터 소스를 믿고 나왔는지”도 알고 싶다. 특히 리서처 검색과 빌더 검색은 해석 프레임이 다르다.
- 추천:
- 기본값은 `Auto`로 두고, 검색 박스 우측 상단에 `LinkedIn / Scholar / GitHub` 아이콘 멀티셀렉트를 둔다.
- criteria card 안에 `이번 검색은 Scholar + LinkedIn 기준으로 해석했습니다` 같은 source 해석 문장을 반드시 넣는다.
- 결과 헤더에도 `Source: Scholar`, `Source: Auto (Scholar + LinkedIn)`처럼 일관되게 보여준다.
- 코드 근거: `src/pages/my/index.tsx` 51-155, `src/pages/my/index.tsx` 511-561, `src/pages/my/c/ResultHeader.tsx` 38-44

### P1. 결과 비교를 위한 핵심 제어가 부족하다: view만 있고 sort와 rank 언어가 없다

- 결과 화면의 상단 제어는 사실상 `table / card` 전환뿐이다.
- 실제 사용자는 “누가 제일 강한 매치인지”, “무엇을 우선해서 정렬 중인지”, “내가 지금 기준을 바꾸면 어떻게 다시 볼 수 있는지”를 먼저 찾는다.
- 현재는 backend 기본 순서가 곧 ranking인데, 사용자는 그 질서를 UI에서 읽을 수 없다.
- 추천:
- `Sort`를 view 왼쪽에 두고 `Default / Best match / Recently active / Evidence strong / Custom` 정도부터 시작한다.
- `Custom`에서는 criteria 우선순위만 바꾸게 하고, 처음부터 너무 복잡한 가중치 편집 UI는 넣지 않는 것이 좋다.
- 이 기능은 점수/매치 요약이 먼저 정의된 뒤 붙어야 한다.
- 코드 근거: `src/components/CandidateViews.tsx` 284-309

### P1. 카드뷰와 테이블뷰의 정보 밀도가 극단적으로 갈린다

- card view는 후보 1명당 이유 텍스트가 길어서 “읽기”에는 좋지만 “비교”에는 너무 느리다.
- table view는 반대로 아이콘 중심이라 빠르지만, hover 전에는 왜 추천됐는지 거의 읽히지 않는다.
- 실제로는 이 둘의 중간이 필요하다. 한 줄짜리 추천 요약과 매치 강도를 보면서 10명 이상을 쭉 비교할 수 있어야 한다.
- 추천:
- 각 후보에 `Top match / Good fit / Partial fit` 같은 tier를 먼저 노출한다.
- 그 옆에 `왜 추천했는지`를 1줄로 요약한다. 예: `ViLT 1저자, TwelveLabs Embedding/Search 리드, CVPR/NeurIPS 직접 근거`.
- table view에서는 각 criteria를 아이콘만 두지 말고, hover 없이도 최소 한 줄 이유가 보이는 `Why shown` 컬럼을 추가하는 것이 좋다.
- 코드 근거: `src/components/CandidatesList.tsx` 322-345, `src/components/information/SummaryCell.tsx` 40-55, `src/components/CandidatesListTable.tsx` 188-199

### P1. 후보가 가진 source footprint가 잘 보이지 않는다

- 현재는 `Scholar Profile`만 예외적으로 보이고, 대부분 후보는 location/company/school만 보인다.
- 하지만 실제 판단에는 “이 후보가 LinkedIn만 있는지”, “Scholar도 있는지”, “GitHub까지 연결되는지”가 매우 중요하다.
- 특히 결과 2페이지에서 `Scholar Profile`만 있는 후보가 섞여 나왔는데, 이 차이를 사용자가 빠르게 구분하기 어렵다.
- 추천:
- 후보 이름 오른쪽이나 index 자리 근처에 `LinkedIn / Scholar / GitHub` source badge를 작은 아이콘으로 노출한다.
- 아이콘은 “검색에 사용된 source”와 “후보가 보유한 source”를 구분해야 한다.
- 예: `searched via Scholar`, `candidate has LinkedIn + Scholar`.
- 코드 근거: `src/components/CandidatesListTable.tsx` 437-457, `src/components/CandidatesList.tsx` 198-215

## 중간 우선순위 이슈

### P2. history에서 run 컨텍스트가 사라져서 결과 복원이 매끄럽지 않다

- history 링크는 `query_id`만 들고 가고 `run`은 포함하지 않는다.
- 실제로 history 재진입 시 페이지가 run을 다시 추론해서 교체하는 로그가 보였고, 사용자는 잠깐 비어 있거나 다른 상태를 보게 된다.
- 검색을 여러 번 돌린 query라면 “마지막 run”, “특정 run”, “page 위치” 복원이 더 중요해진다.
- 추천:
- history는 최근 run 기준 deep-link를 직접 저장하고, 가능하면 마지막 view type / page / sort 상태까지 복원한다.
- 코드 근거: `src/components/layout/HistoryItem.tsx` 29-35, `src/pages/my/c/[id].tsx` 130-138

### P2. 검색 시작/진행 상태 메시지가 chat과 result 영역에서 약간 중복되고 헷갈린다

- chat 영역에 `검색을 시작하겠습니다. 최대 1~3분이 소요될 수 있습니다.`가 뜨고, 결과 영역에도 별도 진행 UI가 뜬다.
- 메시지에는 `클릭하면 검색 진행 화면으로 이동합니다`가 보이는데, 실제로는 이미 split result 화면 안에 있다.
- 이 구조는 “지금 검색이 이미 시작됐는지”를 헷갈리게 한다.
- 추천:
- confirm 직후에는 chat에 짧은 확인만 두고, 진행 상태는 우측 result 패널의 단일 시스템으로 몰아주는 편이 낫다.
- 코드 근거: `src/components/chat/ChatPanel.tsx` 365-389

### P2. 검색 기본 설정은 너무 깊숙이 있고, 너무 약하다

- gear 안에 있는 기본 설정은 사실상 `한국 관련 사람만 보기` 한 개뿐이었다.
- 사용자는 source, 지역, seniority, must-have, exclude rule 같은 반복 조건을 저장하고 싶어한다.
- 추천:
- 기본 설정을 “고급 옵션”이 아니라 “항상 적용되는 search defaults”로 승격시키고, source / location / seniority / language / must-have rule 정도는 포함하는 것이 좋다.

## 사용자가 제안한 아이디어에 대한 평가

### 1. Source 선택 규칙을 채팅 과정에서 정하고, 그걸 말하게 하기

- 좋다.
- 다만 “말만 해주는 것”으로는 부족하고, 사용자가 바로 수정할 수 있어야 한다.
- 추천 형태: criteria card 상단에 `Source interpretation: Scholar + LinkedIn` 문구 노출 + 바로 옆 `수정` 액션.
- 우선순위: 높음

### 2. 검색 박스 오른쪽 위에서 source 3개 포함 여부를 아이콘으로 선택

- 좋다.
- 가장 추천하는 방식은 `Auto` + `LinkedIn` + `Scholar` + `GitHub` 4상태다.
- 아이콘만 두되 hover text와 selected state는 매우 명확해야 한다.
- 우선순위: 높음

### 3. 이 사람이 가진 source를 아이콘으로 보여주기

- 좋다.
- 특히 scholar-only 후보와 mixed-source 후보를 빠르게 구분하는 데 매우 유용하다.
- index 옆 또는 이름 오른쪽 작은 badge가 적절하다.
- 우선순위: 높음

### 4. 점수를 같이 출력해서 정렬하기

- 방향은 맞다.
- 다만 처음부터 `87점`처럼 정밀 숫자를 전면에 두면 오히려 허위 정밀도로 보일 수 있다.
- 첫 버전은 `Strong / Good / Partial` 같은 tier + 한 줄 이유를 추천한다.
- 내부적으로는 숫자 점수를 써도 되지만, 사용자 노출은 tier 중심이 더 안전하다.
- 숫자를 꼭 보여주고 싶다면 `87/100`보다 `Match 87`처럼 ranking indicator로 쓰는 편이 낫다.
- 우선순위: 높음

### 5. Sort: Default, 그리고 custom(criteria 우선순위 조정)

- 필요하다.
- 다만 `sort`는 score/tier와 같이 설계돼야 의미가 있다.
- 추천 1차안: `Default / Best match / Custom weights`
- 추천 2차안: `Custom weights` 안에서 criteria drag reorder만 허용
- 우선순위: 중상

## 바로 적용하면 효과가 큰 실행 순서

1. 페이지네이션 크레딧 차감 고지 추가
2. 검색 박스 source selector 복구 또는 `Auto + 3 icon` 방식으로 재도입
3. criteria card와 결과 헤더에 source interpretation 노출
4. 결과 row/card에 `match tier + one-line why` 추가
5. 후보별 source badge 추가
6. `Sort` 추가
7. history deep-link를 run 기준으로 복원

## 한 줄 결론

현재 `my` 검색은 “좋은 evidence를 깊게 보여주는 도구”로는 강하지만, “짧은 시간 안에 여러 후보를 신뢰감 있게 비교하고 비용을 통제하는 도구”로서는 아직 거친 편이다. 우선은 `비용 고지`, `source 명확화`, `match 표현`, `sort` 네 축을 먼저 다듬는 것이 가장 효과가 크다.
