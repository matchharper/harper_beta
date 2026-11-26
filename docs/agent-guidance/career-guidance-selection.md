# Career 지침 선택과 A 복원

## 현재 선택

2026-11-03 사용자가 **C 전체 변경을 기본 코드에 유지**하도록 결정했다. 이후 별도 변경 요청이 없다면 A/B 실험 결과를 이유로 C를 자동으로 되돌리지 않는다. 이 결정은 로컬 구현 선택이며 운영 배포 승인이 아니다.

- 선택한 C: `994b23729b4ed0de0bdf5df9f9a26e0ef7f2daf0` (`career-guidance-c-2026-11-03`).
- 복원할 A: `463d83cb345a63ecc6fca804c259e1d8441b4443` (`career-guidance-a-2026-11-03`).
- B는 중간 실험 버전 `0967d691`이며 복원 대상이 아니다.
- **A에도 `web_search`·`open_url` 기본 제공과 Career `web_research` 제거가 포함돼 있다.** A 복원은 이 웹 도구 변경을 취소하지 않는다.
- [C 변경·검증 결과](../evaluation/career-agent-autonomy/reports/2026-11-03-retained-guidance.md), [평가 정본](../evaluation/career-agent-autonomy/README.md).

실제 기본 경로는 `buildCareerMainPrompt` → [main.md](../../src/lib/career/prompts/main.md)의 C 본문이다(2026-11-24까지는 `mainPrompt2.ts`의 `CAREER_MAIN_PROMPT_2`). Resume/Application/Opportunity search handbook과 catalog, Career Memory 도구 설명도 C의 구성으로 유지한다. 평가 runner의 `--guidance-revision`은 평가 프로세스만 바꾸며 제품 설정이 아니다. 기존의 명시적 개발용 prompt override도 A/B/C 선택 기능이 아니다.

이 A/B/C 변경의 범위는 일반 Career 텍스트 대화의 main prompt와 공유 handbook/도구 설명이다. 온보딩·음성·백그라운드 전용 main prompt는 원래 별도 계약이며 이번 선택으로 텍스트용 C 본문을 복사하지 않았다.

## A로 되돌리는 방법

사용자가 “A로 돌려”라고 하면 아래 **C→A 패치만 적용**한다. 전체 checkout을 과거 commit으로 reset하거나 다른 기능·평가 기록을 되돌리지 않는다. 작업 전에 현재 미커밋 변경을 확인하고 보존한다.

`harper_beta`에서:

```sh
git status --short
git apply --check docs/evaluation/career-agent-autonomy/restore-a.patch
git apply docs/evaluation/career-agent-autonomy/restore-a.patch
```

첫 번째 `git apply --check`가 실패하면 실제 적용을 중단한다. 이후 변경과 충돌한 구간을 읽고 C에서 A로 돌아가는 변경만 반영한다. 강제 덮어쓰기나 전체 파일 checkout으로 후속 작업을 지우지 않는다. 이 문서의 현재 선택도 A로 갱신하고 필요한 계약 확인 후 새 commit을 만든다. 복원 요청 자체는 배포 승인이 아니다.

패치는 두 기준 commit 사이의 제품 파일 6개와 관련 테스트 2개에 한정한다.

- `src/lib/career/prompts/mainPrompt2.ts`
- `src/lib/career/handbooks/resume.ts`
- `src/lib/career/handbooks/application.ts`
- `src/lib/career/handbooks/opportunitySearch.ts`
- `src/lib/career/handbooks/registry.ts`
- `src/lib/llm/toolDescriptions.ts`의 Career Memory 설명 변경
- `src/lib/career/capabilities/generalRuntime.test.ts`
- `src/lib/career/prompts/promptCaching.test.ts`

2026-11-03 현재 C 코드에 대해 복원 패치의 `git apply --check`가 통과했다. 실제 복원은 실행하지 않았고 C가 유지돼 있다. 기준 commit과 패치를 저장했으므로 태그가 없는 다른 checkout에서도 복원 절차를 사용할 수 있다.

## 2026-11-08 지원 준비 후속 수정 (로컬, 미배포)

현재 요청에 따라 직접 연락을 의무화하던 application 지침과 최소 정보만으로 준비를 끝내게 하던 main/resume 지침을 수정했다. documents capability에는 작성 전 resume handbook을 제공하고, proactive_career는 실제 background invocation에만 제공한다. 웹 조사 사실은 기존 turn record와 메시지 projection으로 다음 턴에 전달한다. 저장 기회 단계 변경은 기존 Jobs executor를 upsert_opportunities의 set_stage로 제공한다. 기존 C 전체를 A로 되돌린 변경이 아니다. 실제 반복 결과와 한계는 [지원 시나리오 평가](../evaluation/career-application-scenarios/README.md)에 기록한다.

## 2026-11-12 정기 확인과 예약 (로컬, 미배포)

`isScheduledCareerRun`에 해당하는 매일 챙길 일·정기 기회 확인·일회성/반복 예약은 일반 채팅과 같은 `career_main`을 사용한다. 채팅 화면 표시 지침 대신 예약 실행과 이메일 지침을 추가한다. 기존 별도 background 기본 지침은 이 경로에서 제외하며, 다른 background 호출은 기존 구성을 유지한다. 역할 조회 결과의 실제 internal/external 구분에 따라 추천 설명 handbook을 추가하고, 같은 실행의 중단·재개에도 유지한다. 필요한 경우 기존 handbook 도구로도 읽을 수 있다. 메일의 실제 발송 성공은 후속 LLM 호출 없이 실행을 끝내며, 대기 발송의 재개도 같은 규칙을 따른다. 검증 정본은 [정기 실행 평가](../evaluation/career-daily-processing/README.md)의 scheduled-writing-v3다.

같은 날 후속 요청으로 미실행 사실까지 보고하게 하던 작성 지침을 제거했다. 추천 handbook v2는 Harper 연결 기회를 우선 강조하고, 직접 지원 공고의 설명 분량은 구체적인 추천 가치에 따라 모델이 정한다. 기존 v3 입력 대조와 중복 주의를 정리한 v4 입력의 결과는 [후속 검증 기록](../evaluation/career-daily-processing/results-2026-11-12-scheduled-writing.md)에 구분해 남겼다.

## 2026-11-14 결과 연결과 초안 언어 (로컬, 미배포)

텍스트 표시 지침은 일반 기회·비교 도구가 반환한 실제 상대 경로를 사용할 수 있게 수정했다. 기존 Role 카드의 ID와 일반 기회 ID를 구별한다. 언어 문단은 채팅에서 검토하는 외부용 초안도 예정된 독자의 언어를 따르도록 명확히 했다. C 선택은 유지한다. [8회 실행 및 화면 검증](../evaluation/career-agent-autonomy/reports/2026-11-14-prompt-and-experience-review.md)에 전후 결과와 fixture 한계를 기록했다.

## 2026-11-15 가입 연결·맥락 범위 (로컬, 미배포)

자료 제출을 선택으로 바꾸고, 별도 kickoff 대신 기존 원본 agent admission으로 첫 대화를 이어간다. 첫 실행에만 post-onboarding guide와 실제 공개 유입 공고 본문을 제공한다. 모든 한정 예외를 Brief에 넣도록 하던 Memory 도구 문장을 제거했다. main의 언어 문단은 산출물의 독자와 주변 설명을 구별하도록 수정했으며 회사·시나리오별 규칙을 넣지 않았다. C 선택과 기존 일반 도구 계약을 유지한다. [16개 시나리오의 구현·검증 기록](../evaluation/career-agent-autonomy/reports/2026-11-15-service-review.md)에 성공·실패와 운영 미검증 범위를 함께 남겼다.

## 2026-11-15 회사 발견·개인 적합성 (로컬, 미배포)

기존 discovery guide의 후보 형성·비교·조사 종료 기준을 사용자의 원하는 일과 현실적인 대안에 맞춰 수정했다. 회사 DB·모델 지식·웹 중 경로는 원본 agent가 선택한다. main은 이번 작업에서 바꾸지 않았고 C를 유지한다. 검색 plan과 기회 표시 순서의 실제 계약을 노출하고 Career 웹 도구에 저장된 공개 원문의 정확한 reference를 전달한다. [실제 11회 대화·UI·공개 자료 재사용 검증](../evaluation/career-opportunity-discovery/reports/2026-11-15-discovery-review.md)은 개선과 함께 제약이 강한 사례·희소 정보·조사 시간의 한계를 기록한다. 이 변경을 위해 새 DB migration이나 운영 변경은 필요하지 않았다.

## 2026-11-18 추천 답변의 도입부·연봉·다음 단계·개수 (로컬, 미배포)

신규 가입자 4명 실행에서 나온 문제의 입력 원인을 고쳤다. C 선택은 유지한다.

- **도입부:** main의 "Earlier messages remain visible"를 실제 화면대로 고쳤다. 작업 중 메시지는 답변이 오면 접힌 작업 기록으로 들어간다. 검색 작업량은 처음 비교한 후보를 한 번씩만 세고, system 대신 추천 게시 결과에 붙인다.
- **연봉:** main 예시의 "pay against what they earn now"와 handbook의 연봉 미확인 구절을 지웠다. 검색 후보 줄과 게시 결과에는 회사가 공개한 연봉만 둔다. 환율표는 handbook 대신 `search_opportunities`의 `targetSalaryKrw` 설명에 둔다. 게시 결과는 이번 요청에서 이미 보인 회사 개요를 다시 싣지 않는다.
- **다음 단계:** main의 추천 문장에 Harper가 이어서 할 수 있는 일을 포함했다. handbook(`opportunity_search` v32)에 기회 종류별로 Harper가 할 수 있는 일을 사실로 적었다.
- **개수:** handbook 목적의 "few"와 검색 결과·도구 설명의 "Top 3"를 없앴다. 장부는 새 후보의 최고 순위로 바꿨다. 개수를 정하는 근거(사람의 상황과 찾은 결과)를 handbook에 두고, 옵션별 긴 설명은 앞세우는 기회에만 요구한다. 가입·설정에서 고른 구직 형태를 settings 사실로 넣었다.

검증 기록은 [신규 가입자 실행 보고서](../evaluation/career-opportunity-discovery/private/new-users-4/report.md)와 그 후속 실행에 남긴다.

## 2026-11-19 회사 자체 추천의 연락 경로 문턱 제거 (로컬, 미배포)

`opportunity_search` handbook 목적 문단에서 회사 자체를 추천할 때 요구하던 "and a credible route to its people"를 지웠다(v33). 같은 handbook에 공고 없는 회사의 다음 단계(사람과 경로 찾기, 팔로우)가 이미 있어서 대신할 문장은 넣지 않았다. 판단 근거는 [좋은 기회를 어떻게 추천할까](../career-good-opportunity-recommendation-ko.md) 2.13절에 있다. 실제 모델 입력에 바뀐 handbook이 실리는 것만 확인했고, 추천 결과는 다시 돌려 보지 않았다. C 선택은 유지한다.

## 2026-11-19 note 도입 (로컬, 미배포)

매칭 노트를 note(`think`/`work`)로 옮기면서 main의 연속성 문장과 opportunity_search handbook(v34)의 노트 문단을 바꿨다. note가 왜 있는지(다음 요청과 예약 실행이 note에서 시작한다)만 사실로 적고, 쓰라는 지시는 넣지 않았다. `read_matching`·`upsert_matching` 설명에서 노트 부분을 빼고 `read_notes`·`upsert_note` 설명을 더했다. C 선택은 유지한다. A 복원 패치는 `opportunitySearch.ts`와 `toolDescriptions.ts`에서 충돌할 수 있으므로 적용 전 `git apply --check`로 확인한다. 구조는 [Career harness](../career-agent-harness-ko.md) 4.1을 따른다.

## 2026-11-19 예약·팔로우 실행의 연속성 (로컬, 미배포)

예약 실행 지침(`scheduledWork.ts`)과 background 지침(`background/prompt.ts`)에, 전달되지 않는 마지막 글이 그 실행의 결론으로 남고 같은 예약이나 같은 팔로우의 다음 실행이 거기서 시작한다는 사실을 한 문장씩 더했다. proactive_career handbook(v5)은 Gmail 검토를 'private Memory'에서 시작하라던 문장을 note, 지난 결론, 이미 한 검색에서 시작하는 문장으로 바꿨다. 결론을 쓰라는 지시는 넣지 않았다. 구조는 [Career harness](../career-agent-harness-ko.md) 5절 13번을 따른다.

## 2026-11-19 가입 직후 첫 추천 (로컬, 미배포)

[첫 추천 평가](../evaluation/career-first-recommendation/README.md)에서 합성 페르소나 4명을 2회씩 돌렸다. 고치기 전에는 8회 중 5회가 기회를 하나도 게시하지 않고 "찾아볼게요"와 Gmail 연결 권유로 끝났다. 게시한 3회도 같은 뼈대(비교한 수 → 공고 목록 → 질문 → Gmail 문단)였다. 입력에서 찾은 원인과 고친 곳은 다음과 같다. C 선택은 유지한다. [결과 보고](../evaluation/career-first-recommendation/reports/2026-11-19-first-recommendation.md)

- **이 턴의 목적:** 온보딩 완료 이벤트 문장(`postOnboardingGuide.ts`의 `buildOnboardingCompletionHandoffInstruction`)에, 앞의 대화가 온보딩 인터뷰였고 사용자가 Harper가 찾아 줄 기회를 기다리며 이 실행이 그 일이라는 사실을 넣었다. 인터뷰 질문을 '이미 아는 조건을 다시 물은 것'으로 읽고 사과하는 답변이 있었기 때문이다. post-onboarding guide는 사람을 더 알아 가는 대화 안내였다. 이제는 이 답장이 보통 첫 추천이고, 기록에서 무엇을 보고 어디를 왜 찾았는지가 보여야 추천이 그 사람을 위해 고른 것으로 읽힌다는 목적을 말한다. 기회를 그 기회를 찾게 된 이유 옆에 두고, 분량·순서·형식은 그 사람과 찾은 것에 따른다는 문장도 함께 둔다.
- **잘못된 상태 사실:** 이 턴의 자기 실행이 `activeOpportunitySearchStatus: handed_off`로 보였다. 모델은 다른 곳에서 탐색이 진행 중이라고 읽고 검색 없이 끝냈다("기회 탐색은 시작된 상태예요"). 온보딩 완료 턴에서는 이 두 줄을 빼고 온보딩 완료 시각만 남긴다(`conversationPlan.ts`). 근본 원인은 `chatTurn.ts`가 현재 background 실행의 run을 활성 탐색으로 넘기는 데 있다. 이 파일은 이번 작업 범위 밖이라 고치지 않았다.
- **초기 대화 안내:** 가입 초기의 Gmail 연결 권유와 '새 사용자 알아 가기' 안내가 이 턴에도 붙었다. 그래서 모든 첫 추천이 같은 Gmail 문단으로 끝났고, 이미 들은 조건을 다시 물었다고 사과하는 문장도 나왔다. 이 두 안내는 사용자가 직접 보낸 첫 메시지들에만 적용하고, 온보딩 완료 턴에는 post-onboarding guide만 둔다.
- **현재 시각:** `current_time` 블록이 연도 없이 "11월 19일 10:40"이었다. 모델이 2026년 10월 투자·조직 신설을 "작년"이라고 썼다. LLM 날짜 계약대로 `YYYY-MM-DD HH:mm (시간대)`로 바꿨다.
- **개수 기준:** opportunity_search handbook의 "two or three contrasting options"를 지웠다. "Tell the person what you compared"는 "which directions you looked into and why"로 바꿨다(v36).
- **글의 틀:** main의 "Let them see what you searched and compared and why these rose to the top"와 "others can be listed briefly or left to the matching view"는 모든 답변을 '비교한 수 + 앞세운 목록 + 나머지 목록'으로 만들었다. 두 구절을 지우고, 추천에 이른 판단과 각 기회가 옮길 만한 사실을 보여 주라는 한 문장으로 합쳤다.
- 사용자가 요청한 대로 예시를 handbook에 그대로 넣어(v35) 시험했다. 이름·숫자·문장을 베끼지는 않았지만 품질도 달라지지 않았고(8회 중 6회가 여전히 추천 없이 끝남), 남기지 않았다.
- **note와 웹 회사 탐색(v37):** `read_notes`·`upsert_note` 설명은 이제 note의 목적으로 시작한다. 한 일을 기록해 나중 요청과 예약 실행이 같은 일을 다시 하지 않게 하는 것이다. matching의 work note에는 탐색에서 배운 점과 전체 작업의 요약을 담는다고 `upsert_note` 설명과 handbook에 적고, 그 자리에 있던 '너만 아는 것' 목록은 지웠다. handbook에는 웹에서 회사를 그만 찾을 때를 넣었다. Harper 회사 디렉터리에 찾을 만한 회사가 이미 충분하다고 판단될 때(이름으로 찾은 회사의 검색 결과가 디렉터리에 이미 있던 수를 알려 준다), 또는 더 찾는 데 드는 시간과 비용에 비해 바뀔 것이 적을 때다.
- **살펴보지 않은 범위(v38):** handbook의 "Tell the person which directions you looked into and why, and what you have not looked at yet"를 지웠다. 살핀 방향과 이유는 main과 post-onboarding guide가 이미 말한다. 남은 '아직 보지 않은 것'은 필수 설명 항목이 되어, 1회차 답변 6개 중 3개가 "아직 모든 채용 경로를 확인한 것은 아니에요" 같은 같은 꼴의 문장으로 끝났다. 살펴보지 않은 방향을 나중에 예약으로 이어 갈 수 있다는 사실만 남겼다.
- **인터뷰에서 저장된 기록:** 온보딩 완료 이벤트 문장에 "인터뷰에서 말한 내용이 Search Brief와 Memory에 저장됐다"는 사실을 더했다. Brief와 Memory에는 언제 어디서 저장됐는지가 보이지 않는다. 그래서 모델은 인터뷰 질문을 이미 아는 조건을 다시 물은 것으로 읽었다. 1회차 백엔드는 "이미 알려주신 조건을 다시 여쭤봐서 죄송해요"라고 썼고, 2회차 전직 교사는 실제로 처음 물은 지역과 연봉을 "다시 여쭤봤네요"라고 썼다.
- **날짜(4회차부터, 남김):** 입력의 날짜는 맞았다. 그런데도 3회차 답변 6개 중 3개가 2026년 일을 "지난해"라고 쓰거나 "지난해가 아닌 2026년 8월"처럼 고쳐 썼다. agent가 읽는 채용 신호 줄과 웹 검색 게시일에 경과 기간을 붙였다(`formatLlmElapsed`). 평가 입력의 회사 줄은 fingerprint라서 그대로 둔다. 날짜 문제는 4~7회차에 1·1·0·1건이었다. 7회차 백엔드는 2024년에 세운 회사를 "작년에 설립된"이라고 썼다. 3회차에도 같은 회사의 설립 연도를 틀렸으므로, 설립 연도에도 달력 기준의 경과(this year, last year, N years ago)를 붙였다(`formatLlmYearsAgo`, 8회차부터). 8회차에도 백엔드가 2026년 9월 투자를 "지난해"라고 썼다. 1~3회차 18회 중 6건이던 날짜 문제가 4~8회차 32회 중 5건으로 줄었지만, 한 회사에 여러 해의 사실이 있으면 모델이 연도를 섞는다.
- **도구 결과 잡음과 회사 등록(4회차부터, 남김):** 페이지 읽기 결과에서 값이 없을 때 나오던 "Provider source fetched: unknown." 줄을 뺐다. 이 줄은 3회차 note에 "fetch 여부 미확인"으로 옮겨졌고, 4회차부터는 없었다. 기사 주소를 이름 지정에 넣으면 뉴스 사이트가 회사로 등록되던 것도 고쳤다. 이제 사이트 자체 주소나 LinkedIn 회사 페이지만 새 회사를 만든다. 5회차 ML 기록에서는 `https://www.scatterlab.co.kr`가 "Co"라는 회사로 등록됐다. 주소에서 이름을 만들 때 `.co.kr`·`.com.au`처럼 국가 도메인 아래 두 번째 단계는 건너뛰게 고쳤다.
- **모르는 조건(4~6회차에 시험, 되돌림):** 3회차 답변 6개 모두 기회마다 "확인이 필요해요"를 붙였다. main의 "Include an alternative or uncertainty when it changes that current decision"을 2026-11-18 지침대로 고쳐 봤다. 남은 조건은 대개 첫 대화에서 정해지고, 결정을 바꿀 수 있는 조건만 찾아보고 말한다는 뜻이다. '확인' 표현은 3회차 30번, 4회차 28번, 6회차 30번으로 줄지 않았다. "알아보는 것은 사용자가 아니라 Harper의 일"이라는 판(5회차)은 26번이었지만, ML이 웹 검색을 10번 하다가 평가 데이터의 `.example` 주소를 실재하지 않는 회사로 보고 아무것도 추천하지 않았다. 효과가 없어 원래 문장으로 되돌렸다. 대부분은 페르소나가 직접 말한 조건(기본급, 주말 온콜, 영업 목표, 실무·리딩 비중)을 frozen 자료로 확인할 수 없는 경우였다.
- **공고 카드(4~6회차에 시험, 되돌림):** 답변의 `[posting](roleId)`는 쓴 자리에 보이지 않는다. 한 줄로 쓴 것은 본문에서 빠지고, 모든 카드가 답변 아래 한 줄에 모인다. 이 화면 사실을 main에 적어 봤다. 번호 매긴 섹션을 쓴 답변은 3~6회차에 3·4·3·3개로 줄지 않았다. 대신 백엔드가 `[Ledgerly · …](roleId)`처럼 이름을 붙인 링크를 쓴 회차가 4~6회차 18회 중 2번 나왔다(1~3회차는 0번). 화면은 이 링크로 카드도 링크도 만들지 않는다. 링크 글자를 posting 그대로 두라는 사실을 더해도 다시 나와서, 원래 문장으로 되돌렸다.
- **마크다운(5회차에 시험, 되돌림):** "Use Markdown for readability"를 "Markdown renders in this chat"이라는 사실로 바꿔 봤다. 번호 매긴 섹션이 줄지 않아 되돌렸다.
- **기회마다 설명하라는 handbook 문장(9회차, 남김):** opportunity_search handbook의 "Explain the options you lead with by what makes each worth this person's move compared with the alternatives, and the tradeoffs that matter for that choice"를 지웠다(v39). main("make each worth moving for")과 post-onboarding guide("why each option would be worth leaving")가 같은 것을 이미 말한다. 6명을 두 번씩 돌렸다. 번호를 매긴 답변(제목이나 목록)은 12개 중 9개로, 지금 코드의 7·8회차 12개 중 11개와 큰 차이가 없었다. '확인' 표현도 1회 평균 4.3번으로 같았다. 나빠진 것은 없었다. 시니어 리더는 두 번 모두 Helio 하나만 추천했고, Ledgerly를 뺀 이유(연봉 하단 2.4억, 지분 언급 없음)를 밝혔다. 중복을 없앤 상태로 두되, 뼈대 문제는 이것으로 풀리지 않았다.

## 2026-11-23 여러 지원을 한 번에 확인 (로컬, 미배포)

여러 곳을 함께 맡긴 사용자가 지원마다 준비를 기다렸다가 확인하는 일을 반복했다(11/23 미팅, 여러 곳을 맡긴 8명 중 5명이 확인 폼을 남긴 채 떠남). `application` handbook(v27)의 검토 문단에 "여러 지원을 함께 맡으면 모두 검토 직전까지 준비한 뒤 검토를 한데 모아 보여 준다"는 목적 문장을 더했다. 표시 방법은 main의 기존 묶음 폼 참조를 그대로 쓰고, 특정 도구를 해결 방법으로 지시하지 않았다. 화면에서는 한 답의 묶음 폼에 승인 버튼이 있는 폼이 둘 이상이면 "모두 승인 (N)"으로 폼마다 자기 승인을 한 번에 보낸다. 사용자가 보류를 고른 폼은 보류로 남는다. C 선택은 유지한다. 실제 모델로 여러 지원을 맡겨 한 답에 모아 보여 주는지는 아직 돌려 보지 않았다. 이 문서의 A 복원 패치(`restore-a.patch`)는 이 변경 전 dev에서도 `application.ts`·`opportunitySearch.ts`에서 이미 적용되지 않는다.

## 2026-11-23 알 수 있는 칸은 채우고, 필수는 표시 (로컬, 미배포)

11/18 이후 "제출 안 됨"으로 끝난 웹 지원 42건 중 8건은 준비 때 본 필수 칸을 빈칸으로 승인한 뒤 실행에서 막혔다(연봉·추천인·후리가나 등). 이력서에 있는 학교도 빈칸으로 둔 사례가 있었다. `application` handbook(v28)의 "그래도 모르는 사실은 비워 두고"를, 프로필·이력서·문서·Memory에 있는 사실은 출처로 채워 확인받고 어디에서도 확인할 수 없는 사실만 비운다는 문장으로 바꿨다. 양식이 필수로 표시한 질문은 폼 항목에도 필수(`required`)로 표시한다는 사실을 더했다. 화면은 필수 칸에 '필수'를 붙이고, 필수 칸이 빈 채로 승인하면 한 번 알려 준 뒤 같은 답으로 다시 누르면 보낸다(막지 않음). 모델에게 가는 응답에는 비어 있는 필수 칸이 사실로 붙는다. C 선택은 유지한다. 실제 모델로는 아직 돌려 보지 않았다.

## 2026-11-23 웹 지원의 후보 요약 링크는 폼 체크 상태로 (로컬, 미배포)

웹 지원 64건 중 15건만 링크가 들어갔고, 빠진 49건 중 19건은 하퍼가 실행 때 `profile_link`를 넘기지 않았다. 그중 12건은 사용자가 채팅으로 승인한 것을 "체크 안 됨"으로 읽은 경우였다. `application` handbook(v29)에서 웹 지원은 그 역할에 연결된 폼의 체크 상태를 코드가 실행 때마다 따른다는 사실로 바꾸고, 하퍼는 사용자가 채팅으로 링크를 빼거나 넣어 달라고 했을 때만 `profile_link`(false 또는 회사·공고)를 넘긴다. 메일은 지금처럼 하퍼가 넘긴다. C 선택은 유지한다. 실제 모델로는 아직 돌려 보지 않았다.

## 2026-11-23 지원 메일 서명에 전화번호를 넣지 않기 (로컬, 미배포)

최근 30일 후보 Gmail로 보낸 첨부 메일 39통 중 5통의 본문에 휴대폰 번호가 있었다. 지원 메일은 서명 아래에 후보 요약 링크 P.S.가 붙으므로 서명은 이름으로 끝내기로 했다(팀 결정). `application` handbook(v30)의 초안 문장 뒤에 지원 메일의 서명은 후보자 이름으로 끝내고 전화번호는 사용자가 넣어 달라고 할 때만 쓴다는 한 문장을 더했다. 실제 모델로는 아직 돌려 보지 않았다.
## 2026-11-23 답변 끝맺음 (로컬, 미배포)

운영 대화에서 Harper가 결과 보고, "이해했어요", 사과로 끝나면 사용자가 "그래서 다음은?"이라고 되물었다. main prompt 끝에 `## Ending a reply` 절을 더했다. 현재 요청과 기존 위임 안의 다음 일은 제안하지 말고 한다. 사람이 필요하면 그 요청으로 끝내되 채널의 답변 수단으로 쉽게 답하게 한다. 결과나 새 정보가 무엇을 바꾸고 다음에 무엇이 오는지(열려 있는 관련 작업 포함) 말한다. 마무리하는 대화는 닫는다. "항상 질문으로 끝내라"는 규칙은 바로 할 일을 허락받는 질문을 늘리므로 넣지 않았다. 같은 내용을 Communication 문단 안에 넣은 두 안은 효과가 없었다. 첫 문단의 "A clear small request can finish within that scope"를 바꾸는 실험도 효과가 분명하지 않아 되돌렸다. C 선택은 유지한다. A 복원 패치는 `mainPrompt2.ts`에서 충돌할 수 있으니 `git apply --check`로 먼저 확인한다. 전후 결과와 남은 문제(CV 수정 보고 사례, 남아 있는 "원하시면" 제안)는 [답변 끝맺음 평가](../evaluation/career-reply-continuation/reports/2026-11-23-ending-a-reply.md)에 있다.

## 2026-11-24 대화의 목표를 '결정 돕기'에서 '회사와의 대화'로 (로컬, 미배포)

사용자는 Harper가 추천하고 끝내지 않고, 마음에 드는지와 이유를 듣고 지원과 연결까지 이끌기를 바랐다. 강압적인 규칙은 원하지 않았다. main `## Work toward the outcome`의 첫 문단에서 "Help the candidate decide what to do next."와 "the candidate decides whether to approach anyone."을 지웠다. 그 자리에 성공을 '원하는 회사와 실제로 이야기하게 되는 것'으로 정의하는 문장을 넣었다. 끌리는 기회가 있으면 그 기회로 가는 일과 회사가 답할 확률을 높이는 일을 돕는다는 내용이다. 다른 문장은 지우지 않았다. 목적이 범위를 정한다는 문장과 권한 문장은 그대로다.

같은 대본으로 페르소나 네 명을 변경 전·후 한 번씩 돌렸다(기록 이름 "11/24 적극성 · 변경 전/후", `localhost:3200`, 운영 DB). 대본은 가입, 상황 답, 첫 추천, "○○ 괜찮네요", "나머지는 좀 별로예요" 순서다.

- **변경 후 늘어난 것:** 호진·Javier에서 관심 기회의 연락 경로를 찾았다. Suno 연구원이 공개 글에서 연락하라고 한 경로를 찾아 미국 취업 자격을 물었다. 'Suno 지원 조건 확인', 'AIsa 지원 준비하기' 같은 할 일도 만들었다. 변경 전 같은 자리에는 'Sierra 역할 확인하기' 정도였다.
- **그대로인 것:** 채팅은 여전히 "어떤 점이 끌리세요?" 같은 선호 질문으로 끝났다. 다음 메시지가 다른 기회 이야기("나머지는 별로예요")면 세 명 모두 그 이유만 묻고, 관심 기회의 흐름을 놓았다. Shaun은 변경 전에만 '지원 준비' 선택지 버튼이 나왔다.
- **부작용:** 시장만 보려는 Chris에게는 두 조건 모두 지원을 권하지 않았고 마무리 말에 대화를 닫았다.
- **한계:** 사람마다 한 번씩만 돌렸고 웹 검색 결과가 실행마다 달라, 차이의 일부는 흔들림일 수 있다.

## 2026-11-24 main prompt를 마크다운으로 (로컬, 미배포)

사용자 요청으로 Career main prompt 본문을 [main.md](../../src/lib/career/prompts/main.md)로 옮겼다. `mainPrompts.ts`는 이 파일을 import해 `{internal_opportunities}`(공유 문단 [internal-opportunities.md](../../src/lib/career/prompts/internal-opportunities.md)), `{output_language}`, `{positions_tab_label}`만 채운다. 화면 표시 계약은 `mainPrompt2.ts`에서 [textChatDisplay.ts](../../src/lib/career/prompts/textChatDisplay.ts)로 이름을 바꿨다. 안 쓰던 옛 main prompt(`CAREER_MAIN_PROMPT`)와 다른 미사용 프롬프트는 `prompts/archive/`, dev 말투 실험(friendly)과 끝맺음 평가의 `light` 변형은 `prompts/experiments/`로 옮겼다. 조립 결과는 맨 앞 빈 줄 하나가 빠진 것 말고 글자까지 같다(professional·friendly, 한국어·영어). C 선택은 유지한다.

- A 복원 패치(`restore-a.patch`)와 `scripts/evaluation/careerAutonomyGuidance.ts`의 과거 commit 재생은 `mainPrompt2.ts`를 기준으로 한다. 이 변경 이후 commit에는 그 파일이 없으므로, 복원하려면 A의 본문을 main.md에 옮겨 적는다.

## 2026-11-24 정기 실행이 기회 도구로 시작 (로컬, 미배포)

사용자는 Haiku 정기 추천이 웹 검색만 하다 끝나고, 저장된 검색이나 후보를 읽고 역할을 한 번에 본 뒤 골라 추천하는 흐름으로 간 적이 없다고 했다. 원인은 도구였다. background 실행은 selector 없이 고정 묶음(`CAREER_BACKGROUND_PRELOAD`: 예약·발송·회사 연락)으로 시작하고, 늘 열린 도구 가운데 탐색 수단은 `web_search`·`open_url`뿐이었다. `search_opportunities`·`read_matching`·`get_role_context`·`upsert_opportunities`는 모델이 직접 불러와야 열렸다.

- 정기 실행은 `careerBackgroundPreload`로 `opportunities`와 `opportunity_search`를 더해 시작한다. 다른 background 실행은 그대로다. 같은 고정 입력에서 첫 호출 도구가 23개에서 32개가 되고, 위 다섯 도구가 처음부터 들어간다. 입력은 도구 설명 약 2.9만 자와 handbook 약 5천 자만큼 늘었다.
- 탐색을 잇는 정기 실행(정기 확인 예약, 매칭을 이어 가는 예약, 공개 자료 변화: `isCareerDiscoveryRun`)은 재방문 호출과 같은 함수로, 그 매칭에서 아직 추천하지 않은 상위 후보 10개와 검색 상태를 함께 받는다. 실행이 특정 매칭을 이어 가면 그 매칭을 읽고, 검색 기록이 없으면 옛 후보를 대신 넣지 않는다.
- 순서를 지시하는 문장은 넣지 않았다. LLM 지도와 run debug 미리보기, 정기 실행을 쓰는 평가 두 개(`evalCareerAgentAutonomy`, `evalCareerFirstMessage`)도 같은 선택을 쓴다.
- 확인: 첫 호출 도구 목록을 변경 전후로 조립해 비교했고, 후보 읽기는 실제 SQL 테스트에 매칭 지정 사례를 더했다. 실제 Haiku 정기 실행을 다시 돌려 행동이 바뀌는지는 확인하지 않았다.

## 2026-11-26 지원은 시작에서 한 번 묻기 (로컬, 미배포)

최근 7일 공고가 연결된 지원 요청 399건 중 67건만 제출됐다. 159건은 확인 폼에 답이 없었고, 28건은 폼에 답한 뒤 로그인·Gmail을 다시 물어 멈췄다. 검토 폼 539장 중 198장은 빈칸이 없었고(답 40%) 70장은 연봉·비자·주소 같은 공통 질문만 비어 있었다. 답이 안 온 338장 중 167장이 이 둘이다. `application` handbook(v31)에 두 가지를 더했다.

- 지원을 맡으면 그 자리에서 시작 폼 하나로 맡은 공고, 알 수 없는 공통 사실, 맡기는 범위(새로 물을 것이 없으면 검토 없이 제출할지)를 묻는다. 계정으로만 지원받는 사이트가 있으면 로그인 기억하기를 id가 `save_login`인 checkbox로 체크된 채 함께 담고(사용자가 끌 수 있음, 11/26 사용자 결정), 답을 받으면 그 사이트마다 한 번 로그인을 받은 뒤 준비를 함께 시작한다. 제출까지 맡기면 회사 양식의 필수 동의는 지원에 필요한 범위로 맡긴 것이고 선택 동의는 체크하지 않는다는 것을 폼에 적는다.
- 제출까지 맡겼고 준비한 답이 모두 사용자가 준 사실에서 왔으며 Harper가 새로 쓴 서술형 답이 없으면, 검토 폼 없이 시작 폼 답을 권한으로 제출한다. 그렇지 않으면 새로 물을 질문과 새로 쓴 답만 검토에 담는다.

코드는 두 곳이다. 역할이 연결된 새 준비는 브라우저를 열기 전에 공고가 닫혔는지 본다(`browser/postingCheck.ts`: Harper에서 이미 마감, HTTP 404·410, 분명한 마감 문구). 닫혔으면 브라우저를 열지 않고 그 사실만 돌려준다. `save_login`은 폼 답이 권한일 때 그 답에서 `save_login`을 실제로 체크한 경우에만 켠다. C 선택은 유지한다. 실제 모델로는 아직 돌려 보지 않았다.

