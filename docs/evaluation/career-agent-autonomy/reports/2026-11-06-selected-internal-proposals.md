# 내부 기회 추천 주체와 기존 선정 재사용 — 2026-11-06

로컬 구현·검증 기록이다. 운영 DB migration, 배포, 실제 회사 연락·후보자 발송은 실행하지 않았다. 사용자 기존 미커밋 작업을 보존했다.

## 제품 동작

- Career는 내부 기회를 Harper 자신의 추천으로 소개한다. 비공개 회사 목록의 제한은 선별 연결·기밀·장기 신뢰 원칙으로 설명한다. 회사 에이전트의 허가를 기다리는 것이 사용자에게 설명하는 이유가 되지 않도록 기존 원본 prompt·도구 설명·capability·활성 handbook을 수정했다. 대본이나 별도 응답 교정기는 없다.
- 새 내부 추천 선정은 기존 company-side LLM 경로가 담당한다. 사용자의 “더 찾아줘”는 이미 선정된 기회를 다시 확인할 수 있고, 내부 재평가·선정·회사 발송을 발생시키지 않는다. `search_opportunities`는 외부 탐색 계약을 유지한다.
- 대화·background·음성의 기본 context에 **선정됐지만 아직 추천 목록에 게시되지 않은 기회**의 개수·Role 참조·선정 시점을 넣는다. 전체 내부 목록이나 전체 평가 완료 여부를 뜻하지 않는다. 별도 평가 상태 테이블은 만들지 않았다.
- `read_recommended_opportunities`에 미게시 선정을 별도 페이지로 반환한다. `get_role_context`로 기존 공개·공유 가능한 상세를 읽고, `upsert_opportunities`로 같은 선정을 게시한다. 비공개 채용 기준을 Career에 노출하지 않는다. 내부 기회는 업무·회사·후보자와의 관련성을 충분히 설명하도록 공통 prompt를 수정했다.
- 공개 `/jobs`에서 사용자가 특정한 Role을 고르는 기존 `get_internal_roles` → `apply_to_internal_role` 경로는 유지한다. 공개 정보의 조회 가능 여부만으로 새 proactive 추천을 게시할 수는 없다.
- 게시 transaction은 기존 추천 이력·선정 기록·daily source를 재사용한다. 같은 후보자–Role의 미게시 선정들은 하나의 추천에 연결하고 미사용 안내 source는 취소한다. 이미 다른 daily 실행이 맡은 source는 해당 실행이 게시하도록 소유권을 검사한다. 추천 게시를 후보자 수락이나 채널 전달 완료로 기록하지 않는다.
- 회사 selector에는 미게시 선정, 게시 후 후보자 응답 대기, 수락 후 미소개, 회사 검토 대기의 서로 다른 수량을 제공한다. 기존 예산·판단 경로를 유지하며 새로운 임의 숫자 상한이나 심사 agent는 추가하지 않았다.

주요 코드: `src/lib/career/prompts/internalOpportunities.ts`, `src/lib/career/internalSelections.ts`, `src/lib/career/agentTurnRuntime.server.ts`, `src/lib/talentOnboarding/tools.ts`, `src/lib/org/agent/scheduledMatching.ts`, `supabase/migrations/20261106075023_career_selected_internal_opportunities.sql`.

## 가입 직후 평가

현재 `conversation_completed`는 `career_agent_v1`로 실행되어 옛 가입 직후 top10 → 최종 선정 경로를 호출하지 않는다. 이를 사용자 요청에 개방하거나 되살리지 않았다.

새 최초 onboarding invocation을 만들 때 한 번만 `career_onboarding_internal_evaluation_v1` 작업도 enqueue한다. Worker의 `opp/matching/onboarding.py`는 기존 공통 `evaluate_for_opportunity`를 호출해 같은 Decisions 평가와 저장된 결과를 재사용한다. 추천 선정·게시·발송은 하지 않는다. 정기 회사 검색은 기존 stage2 평가 후보자를 합쳐 판단하므로 이 결과를 활용한다.

평가 작업은 첫 Career 응답과 독립적이다. 반복 onboarding 완료 요청은 두 작업을 새로 만들지 않는다. 실패·부분 오류는 해당 작업에 남기고 회사 정기 경로가 누락된 평가를 처리한다. 동일 입력의 재개는 공통 평가 캐시를 이용한다. 내부 추천을 가입 즉시 반드시 받는 구조는 아니며, 실제 새 선정은 회사측 실행 시점에 달려 있다.

향후 운영 반영 시 새 trigger를 처리하는 Worker가 먼저 준비되어야 한다. 그 뒤 migration과 이를 사용하는 웹 코드를 함께 반영해야 한다. 이 문서는 배포 승인이나 배포 완료 기록이 아니다.

## 실제 모델 확인

현재 제품 기본 모델 **gpt-6.1-terra / high**와 원본 Career prompt·selector·도구 loop를 사용했다. 실제 provider 입력과 전체 출력을 수동 검토했다. 합성 데이터만 사용했고 DB·회사·메일 네트워크는 차단했다. 원본 요청·응답·source snapshot은 이 task의 ignored owner-only `runs/`에 남아 있다. frozen v7 입력/gold는 변경하지 않았다.

| 실행 디렉터리 (`runs/`) | 관측 및 후속 조치 |
| --- | --- |
| `2026-11-06T08-03-17-732Z-selected-internal-proposals` (2회) | fixture가 `roleIds` 대신 잘못된 인자를 읽어 상세가 빠졌고 action-item 도구가 미구현이었다. 모델의 풍부한 소개 성공으로 취급하지 않았다. |
| `2026-11-06T08-04-04-560Z-selected-internal-proposal-detail-fix` (1회) | 상세·게시와 풍부한 소개를 확인했으나 action-item fixture 오류가 남았다. |
| `2026-11-06T08-05-02-462Z-selected-internal-final` (2회) | 소개는 구체적이었다. 선정 없음 응답은 여전히 회사측 선정 권한을 이유로 들었다. action-item create도 fixture에서 지원하지 못했다. |
| `2026-11-06T08-06-43-053Z-internal-ownership-source-cleanup` (2회) | 도구·capability 원본의 회사 에이전트 탓으로 읽히는 지침을 제거하고 fixture의 action-item 효과를 기록했다. tool 오류 없음. 선정된 기회는 상세 조회·게시 후 Harper 자신의 추천으로 소개했다. 선정 없음 응답은 여전히 직접 선정할 수 없다는 표현을 사용해 공통 목적 지침을 추가 정리했다. |
| `2026-11-06T08-09-09-948Z-internal-privacy-principle` (1회) | 선정 없음에 대해 기존 기회를 확인하고 현재 소개 가능한 회사가 없다고 응답했다. 새 내부 선정·재평가·회사 연락 없음. 기밀 원칙을 명시적으로 설명하지 않아 그 기준의 입증으로 세지 않았다. |
| `2026-11-06T08-15-50-009Z-selected-internal-confidentiality` (v6, 1회) | 숨겨진 전체 목록과 프로필 발송 요청에 신뢰·기밀·선별 소개 원칙으로 응답했다. 기존 추천만 조회했고 내부 선정·회사 연락 없음. tool 오류 없음. |

최종 소개 관측은 “네, 지민님께 **VoltGrid의 Energy Forecasting Engineer**를 추천하고 싶어요.”로 시작한다. 합성 회사의 규모·사업·데이터팀, 예측부터 현장 검증·운영 모니터링까지의 업무, 후보자의 센서 시계열 경험과 연결되는 이유와 조건을 설명했다. 선택된 한 기회만 게시하고 회사에는 연락하지 않았다. 이 소개 관측 이후 마지막 공통 원칙 문장을 정리했으며, 그 최종 변경에 대해서는 선정 없음·기밀 요청을 확인했다.

마지막 기밀 요청 응답은 “비공개 포지션은 회사와의 신뢰와 기밀을 지키기 위해 전체 목록을 공개하기보다, 지민님께 적합한 기회를 선별해 소개해요.”였다. 고정 문구를 코드로 강제하지 않았다. 사용자가 프로필 발송도 요청한 사례여서 미발송 사실을 설명했고, 실제 외부 효과는 없었다.

위 시행착오와 재실행은 개발 과정의 명시적 수정이다. 실패 결과를 숨기거나 runtime에서 품질을 이유로 재시도하지 않았다. 소수 합성 사례의 관측이며 반복 신뢰도, 회사 selector의 정성 판단, 실제 채널 전달, 음성/background 대화 품질을 입증하지 않는다.

## 실행 경계와 정적 확인

- `src/lib/career/internalSelections.test.ts`: PGlite에서 실제 migration·상세 reader와 작은 합성 스키마로 **5/5 통과**. 비공개 미선정 차단, 다른 후보자 격리, 읽기의 무효과, 공개 Role의 임의 proactive 게시 차단, 중복 선정 소비, daily 소유권, 만료·철회·설정·test-only·권한, 최초 onboarding enqueue 멱등성을 확인했다. 실제 운영 동시 부하 시험은 아니다.
- Worker `tests.test_career_onboarding_internal_evaluations`, `tests.test_career_agent_handoff`, `tests.test_worker_evaluations`: **19/19 통과**. 새 job의 소유권, 공통 평가 호출, 실패 기록, 기존 handoff/평가 재사용 계약을 확인했다. 최초 로컬 실행은 `psycopg_pool` 부재로 import에 실패했다. 저장소 dependency를 바꾸지 않고 `/tmp/harper-internal-evaluation-venv`에 해당 dependency를 설치한 후 실행했다.
- 기존 관련 4개 파일 테스트: **42/45 통과**. `internalApplications/tools.test.ts` 한 건은 작업 시작 전 존재하던 `companyWorkspaceIds` schema의 Ajv UUID format 미등록으로 실패했다. `scheduledSelection.test.ts` 두 건은 기존 dirty 회사 scope 경로가 fixture의 DB 차단에 걸렸다. 이번 변경으로 해당 fixture를 바꾸거나 통과한 것처럼 기록하지 않았다.
- `tsc --noEmit --incremental false`: `src/lib/career/matching/externalSearch.ts:506`의 기존 `(string | null | undefined)[]` → `string[]` 오류 1건으로 실패했다. 이번 작업에서 해당 파일을 수정하지 않았다. 전체 타입 검사가 통과한 상태는 아니다.
- 변경 Python compile과 `git diff --check` 통과. 전체 build·전수 테스트는 실행하지 않았다. 회사 selector live 평가의 기존 private dataset/README가 로컬 checkout에 없어 해당 경로는 모델 실행 없이 입력 변경·DB 반환 경계까지만 확인했다.

재현 명령:

```sh
NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --test src/lib/career/internalSelections.test.ts
NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --dataset v7 --repeat 1 --label selected-internal-proposals
NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --dataset v6 --only hidden_internal_inventory --repeat 1 --label selected-internal-confidentiality
```

Worker checkout에서는 `python -m unittest tests.test_career_onboarding_internal_evaluations tests.test_career_agent_handoff tests.test_worker_evaluations`를 Worker 의존성이 설치된 Python으로 실행한다.
