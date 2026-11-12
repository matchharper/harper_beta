# Career capability loading evaluation

## 목적과 평가 단위

온보딩 이후 텍스트 Career의 full/progressive 입력을 같은 모델·동결 대화에 비교한다. 기능 인식, 필요한 제안, 승인 후 실행, 이력서 동의 경계, 코칭 상태, 제한된 도구, N턴 복귀를 확인하는 synthetic challenge다. 사례 단위는 전체 사용자 턴과 대화이며 production 사용 분포·실제 DB 저장·브라우저 UX·음성을 대표하지 않는다.

## 동결 입력과 gold

`cases-v1.json`은 실사용 원문·실제 계정 없이 작성한 12개 대화다. `v2`는 v1 입력/정답을 보존하고 자발적 회사 조사 제안, 거절, Memory+이력서 복합 요청, 공개 공고 추천, URL 읽기, 영문 이력서 생성 6건을 추가한 18개 대화다. v3는 기존 제품의 코칭 카드 계약에 맞춰 `coaching_start`의 gold를 수정하고, 다음 턴의 명시적 채팅 선택을 추가했다. 코드 근거와 label review는 manifest-v3에 기록했다. v4는 별도의 품질 challenge 14대화·32사용자 턴이다. 이력서 동의 단계, 이름 있는 사본의 후속 수정, 모호한 대상, Brief 정정, 코칭 중 사용자 정정·문서 작업, 회사 연락 대상, 비공개와 공유 동의, 연결 만료, 문서 내부의 악성 지시, revision 충돌·저장 실패, 조사 제안과 수락, 미지원 기능을 다룬다. `gold-v4.json`과 `gold-v5.json`에 각 턴의 이상적인 답변 예시와 의미 기준이 있으며 예시 문구 일치로 점수를 내거나 모델에게 정답을 주지 않는다. v5는 v4를 보존한 후 연결 대상 사례만 정제한 14대화·33턴이다. v4에서는 한 연결만 면접 시간을 물어 대상 추론이 가능했으므로, v5는 두 역할 모두 면접 시간을 묻도록 바꾸고 재전송 없는 확인 턴을 추가했다. 이 차이를 runtime의 무조건 확인 규칙으로 옮기지 않는다. 기본 실행은 v5이며 `--dataset-version`으로 v1~v4를 그대로 재현한다. 각 version의 `manifest`에 입력 hash·작성자·출처가 있다. 입력/정답 변경은 새 version으로만 한다. 예시는 runtime 분기·키워드 분류로 옮기지 않는다.

## 실행 계약

Canonical runner: `scripts/evalCareerCapabilities.ts`.

- 실제 `resolveCareerChatTools`, `CareerCapabilityRuntime`, prompt builder, lease resolver, `runCareerChatAssistant`와 provider adapter를 재사용한다.
- 문서/이력서/코칭/Memory 등 외부 효과는 메모리 안의 stub만 사용한다. 이력서 입력·부분 변경은 실제 parser/apply 함수를 사용한다. 코칭 후속 지침과 연락 전달 지침, 연락 조회 formatter도 production 함수를 재사용한다. 전달 후에는 가짜 저장 상태에도 보낸 본문과 이력서 공유 ID/null을 기록해 다음 조회에 반영한다.
- 원문 메시지를 유지하고 매 턴 기존 lease 계약으로 복원한다. tool schema를 별도 복사하거나 평가용 prompt 지시를 붙이지 않는다.
- 기본 모델은 실행 시 Career 공통 assistant 설정이다. 현재 로컬 기본값은 `gpt-6.1-sol`, Responses API, reasoning `xhigh`다. 실제 요청 한도는 공통 Responses loop의 `max_output_tokens=4000`이며 native chat 설정의 4096과 구분해 manifest에 기록한다. 요청이 지원하는 temperature 전달 여부도 실제 adapter를 따른다. provider 변경은 `--model`로 새 run을 만든다. full/progressive 순서를 사례별로 교차한다.
- provider 요청별 90초 timeout을 기존 요청 signal과 결합하며 전체 호출은 production 예산이다. `--strict-model`이면 fallback을 포함한 다른 모델 요청을 실패로 집계한다. API 요청 body/usage/지연과 전체 응답을 기록한다. `--mode`, `--only`는 부분 확인용이며 전체 gate로 표시하지 않는다.

```sh
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerCapabilities.ts --validate-only
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerCapabilities.ts --dataset-version v5 --mode progressive --strict-model
```

## 측정과 gate

자동 검사는 tool 이름·action·필수 호출, 실행 오류·runtime 거부, 이력서 revision과 원본 보존, 지정 대상·첨부 유무, 기존 Brief ref 수정, 중복 효과·재시도 상한, 금지된 쓰기 0을 다룬다. 실패 receipt를 성공으로 집계하지 않는다. 구조적 실패가 있으면 raw 결과를 보존한 뒤 종료 코드 1을 반환한다. 실행 횟수, 로딩 횟수, 입력/출력/cache 토큰, repository 가격표 기반 추정 비용, 응답시간도 기록한다. 정성 품질은 원문을 gold와 비교해 검토자를 명시해 검토한다. 이번 실행은 Codex 검토이며 독립된 human review를 받았다고 주장하지 않는다. 단어·길이·정규식으로 의미를 채점하지 않는다.

권한 위반·원치 않는 이력서 쓰기·중복 부작용·기능을 못 찾음·명시적 쓰기 누락·거짓 완료 0, 모든 사례 의미 검토 pass가 품질 gate다. 전체 비용 절감/대표 p95는 별도 대표 표본에서 확인한다. 이 작은 challenge의 비용은 실행 관측일 뿐 서비스 전체 절감률이 아니다. 배포 gate는 구현 계획 §10.4를 따른다.

## 데이터·개인정보 경계

외부 provider로 나가는 데이터는 합성 fixture와 repository prompt뿐이다. revision 충돌, 저장 불가, 만료된 Gmail 같은 장애 주입은 runner의 가짜 executor에만 있으며 production 분기에는 추가하지 않는다. 네트워크는 선택한 모델 provider API만 허용하고 DB/검색/메시지 전송은 차단한다. `llm_logs` 삽입도 가로채 로컬에만 기록한다. raw 요청·응답·로그는 gitignored `runs/` 아래 owner-only 파일에만 쓴다. 비밀 키를 산출물에 저장하지 않는다. production fixture·role을 생성하지 않는다.

## 한계

Stub는 실제 동시성·DB 권한·PDF 출력·연락 전송을 검증하지 않는다. provider/SSE/fallback/CAS/격리는 별도 `src/lib/career/capabilities/*.test.ts`와 기존 Career tests로 검증한다. 정해진 사용자 발화와 작은 표본은 자유 대화의 다양성, production 비용 분포, cache hit 비율을 대표하지 않는다. 모델 확률적 실패 가능성 0을 보장하지 않는다.


## 결과와 실행 이력

2026-10-15 오류 복구 보강: 같은 frozen v5에서 `resume_revision_conflict`, `resume_storage_failure`만 progressive로 재실행했다. `runs/2026-10-14T15-57-42-218Z/`의 구조 검사와 Codex 원문 의미 검토는 2/2이며, 최신 revision 재조회·다른 편집 보존·실패 시 사본 미생성 설명을 확인했다. 원문은 유지하고 별도 `review.json`에 검토를 기록했다. 합성 실패를 사용하는 부분 회귀이며 전체 Career gate나 실제 DB 저장을 증명하지 않는다. 새 근거 조회·검색/URL 오류 반환은 별도 runtime 단위 테스트로 검증했다. 로컬·미배포다.

[2026-10-09 구현·검증 보고서](reports/2026-10-09-implementation.md)를 참조한다. 초기 core 5개, 공통 근거 문구 보완, 최종 core 6개의 결과는 각각 다른 run으로 보존했다. v1/v2의 코칭 시작 gold 중 “선택 재요구 없음”은 현재 제품의 최초 suggestion card 계약과 충돌해 v3에서 코드 근거를 명시하고 수정했다. 최초 코칭 stub에 실제 executor의 후속 지침이 빠졌던 문제도 수정 후 별도 run으로 재검증했다. 운영 비용/자유 대화 성공률과 독립 human review는 이 synthetic 실행만으로 확정하지 않는다.

## 로컬 회귀 검사

아래는 mock API와 합성 값이며 실제 credential이나 production DB를 사용하지 않는다. 기존 의존 모듈이 import 시 환경변수를 요구하므로 dummy 값을 지정한다.

```sh
OPENAI_API_KEY=test-key ANTHROPIC_API_KEY=test-key OPENROUTER_API_KEY=test-key NEXT_PUBLIC_SUPABASE_URL=https://test.invalid NEXT_PUBLIC_SUPABASE_ANON_KEY=test-key SUPABASE_SERVICE_ROLE_KEY=test-key pnpm exec tsx --tsconfig scripts/tsconfig.json --test src/lib/career/capabilities/*.test.ts src/lib/career/llm.stream.test.ts src/lib/career/llm.toolBudget.test.ts src/lib/talentOnboarding/llmOpenAIResponses.test.ts src/lib/llm/usageLogging.test.ts src/lib/companyTalentRequests/connectionDocuments.test.ts
```

`requests.json`을 token/cost 집계 원본으로 사용한다. 초기 실행의 비동기 usage 로그는 일부 늦게 도착해 top-level 사례 라벨이 다음 사례로 이동하거나 마지막 행이 저장되지 않을 수 있었다. 해당 초기 raw 로그로 case별 비용을 계산하지 않는다. 현재 runner는 요청별 async context로 라벨을 고정하며, 프로세스가 끝날 때까지 외부 effect 차단을 유지한다. 모든 raw 실행은 수정하지 않고 보존한다.

최신 runner는 `usage-summary.json`에 실제 요청 usage와 repository 단가 기반 추정 비용을 함께 남긴다. 모델 크레딧·청구 잔액은 확인하지 않으며 업무 도구의 내부 모델 비용은 포함하지 않는다. 정성 검토는 별도 `review.json`에 남기고 원본 `results.json`의 응답을 바꾸지 않는다.

[6.1 Sol 실제 평가·개선 보고서](reports/2026-10-09-sol-quality.md)에는 v3/v4 전체 실행, v5 입력 정제, 실패와 수정, 재검증, 실제 토큰·비용을 기록한다. 이전 결과를 성공으로 덮어쓰지 않는다.

## PR #155 로컬 통합 challenge (v6/v7/v8)

v6는 v5를 보존하고 활성 지원 모드의 Memory, Brief, Profile, 확인 후 다른 작업 전환 4대화를 추가했다. 외부 공고 지원 가능성의 gold만 새 기능 계약으로 수정했다. v6의 Profile 사례는 기존 도구가 지원하지 않는 경력 회사명 직접 수정을 요구한 잘못된 gold였다. v7는 이를 실제 지원 필드인 현재 거주지 수정으로 바로잡고, 현재 지원을 계속하는 일회성 결정을 지속적 Brief 예외로 저장하지 않는 의미 기준을 명확히 했다. v5/v6 입력·gold·실패 run은 보존한다. 두 manifest에 변경 이유와 코드 근거를 기록했다.

Canonical runner는 그대로 `scripts/evalCareerCapabilities.ts`다. `activeApplication` fixture만 production session 생성/변경 함수와 선택기를 재사용하며, 모드 종료 receipt도 `applicationSessionToolResult`를 그대로 쓴다. 상태 변경 후 도구 및 terminal 목록을 다시 선택한다. 평가 사례별 production 분기는 추가하지 않는다. Profile 변경·Memory/Brief 저장은 합성 stub이고, 실제 저장·권한·동시성은 공통 tool/database tests에서 따로 검증한다. 네트워크·개인정보 경계, 모델 설정과 gate는 위 계약을 유지한다. v8은 입력을 유지하고, v7 gold가 session 도구 전체를 금지하면서 동시에 일회성 결정을 그 activity에 남기라고 요구한 모순을 바로잡았다. 종료·전환 action만 금지하고 save_fact는 허용한다. 이전 입력·gold·run은 보존한다. v8 부분 실행은 전체 데이터셋 gate를 뜻하지 않는다.

```sh
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerCapabilities.ts --dataset-version v8 --validate-only
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerCapabilities.ts --dataset-version v8 --mode progressive --strict-model --only application_memory,application_brief,application_profile,application_switch
```

## 지원 준비 전환 challenge (v9)

4개의 독립 합성 대화로 명확한 다른 공고 시작, 이미 확인한 전환, 가능 여부 질문, 저장 후 종료를 확인한다. 실제 사용자 사건은 읽기 전용으로 조사했고 재사용 입력에는 이름·회사·공고 ID·이력서·원문을 넣지 않았다. `cases-v9.json`, `gold-v9.json`, `manifest-v9.json`은 실행 전에 동결한다. 기존 버전은 유지한다.

Canonical runner는 `scripts/evalCareerCapabilities.ts`다. session mutation, 종료 결과, 실제 preparation prompt·lazy loader·공통 assistant loop를 사용하고 시작 카드는 실제 schema로 검증하는 stub로 대체한다. 모델은 해당 incident와 활성 지원 모드에서 쓰는 `claude-haiku-5-5`, 별도 reasoning override 없이 production 설정을 쓴다. 네트워크는 모델 provider만 허용하고 실제 사용자·공고 상태, 지원 사이트, 발송에는 접근하지 않는다. Raw run은 기존 ignored `runs/` 아래 owner-only로 보관한다.

Gate는 두 전환 모두 같은 턴의 end→새 공고 카드, 정확한 공고·기존 문서 유지, 중복 질문/실행/접수 없음, 안내 원문 의미 검토 통과다. 질문과 단순 종료가 전환을 실행하면 실패한다. 자동 검사는 도구·상태·ID만 판단하고 자연어는 Codex가 원문을 읽는다. 실제 DB 저장·재개는 `savedApplications.test.ts`, 안내의 UI 보존은 `ApplicationStartCard.test.tsx`로 별도 확인한다. 자유 대화 전체나 운영 배포 완료를 증명하지 않는 좁은 로컬 검증이다.

```sh
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerCapabilities.ts --dataset-version v9 --validate-only
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerCapabilities.ts --dataset-version v9 --mode progressive --model claude-haiku-5-5 --strict-model
```

[2026-10-23 전환 검증 보고서](reports/2026-10-23-application-switch.md): 구조 4/4, 안내 수정 후 관련 2사례 부분 재실행과 원문 의미 검토. 기존 실패 보존, 로컬·미배포.
