# Career 지침 선택과 A 복원

## 현재 선택

2026-11-03 사용자가 **C 전체 변경을 기본 코드에 유지**하도록 결정했다. 이후 별도 변경 요청이 없다면 A/B 실험 결과를 이유로 C를 자동으로 되돌리지 않는다. 이 결정은 로컬 구현 선택이며 운영 배포 승인이 아니다.

- 선택한 C: `994b23729b4ed0de0bdf5df9f9a26e0ef7f2daf0` (`career-guidance-c-2026-11-03`).
- 복원할 A: `463d83cb345a63ecc6fca804c259e1d8441b4443` (`career-guidance-a-2026-11-03`).
- B는 중간 실험 버전 `0967d691`이며 복원 대상이 아니다.
- **A에도 `web_search`·`open_url` 기본 제공과 Career `web_research` 제거가 포함돼 있다.** A 복원은 이 웹 도구 변경을 취소하지 않는다.
- [C 변경·검증 결과](../evaluation/career-agent-autonomy/reports/2026-11-03-retained-guidance.md), [평가 정본](../evaluation/career-agent-autonomy/README.md).

실제 기본 경로는 `buildCareerMainPrompt` → `CAREER_MAIN_PROMPT_2`의 C 본문이다. Resume/Application/Opportunity search handbook과 catalog, Career Memory 도구 설명도 C의 구성으로 유지한다. 평가 runner의 `--guidance-revision`은 평가 프로세스만 바꾸며 제품 설정이 아니다. 기존의 명시적 개발용 prompt override도 A/B/C 선택 기능이 아니다.

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
