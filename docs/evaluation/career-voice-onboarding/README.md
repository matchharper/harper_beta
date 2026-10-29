# Career Voice 온보딩 A/B 결과 평가

## 목적과 평가 단위

첫 온보딩에서 통화를 선택한 사용자가 **첫 통화만으로 추천에 필요한 충분하고 정확한 정보를 남겼는지** 비교한다. 1회·8회 발화, 통화 길이, 모델의 완료 선언은 성공의 대체 지표가 아니다. 단위는 사용자이며 A/B 배정은 기존 `assignCareerVoiceModel`을 재사용한다. 실제 model log와 배정의 불일치를 별도로 감사한다.

## Frozen input과 gold

- Dataset `pilot-v1`: `2026-09-28T01:17:29.323990Z`까지의 기록. 실험 최초 attempt 이후 첫 온보딩 선택이 call인 사용자 전체. 내부 `matchharper.com` 계정 제외.
- Dataset `pilot-v2`: 최근 30일 창 `2026-09-06T07:00:00Z`~`2026-10-06T07:00:00Z` 내 같은 조건의 사용자 120명. 실험은 9월 21일 시작했다. 기존 성숙 40명은 당시 동결된 `pilot-v1` packet을 승계하고, 그 외 80명은 새 capture를 사용한다. 첫 선택 후 24시간 성숙 표본은 113명이다.
- 주 분석은 첫 선택 후 24시간의 관찰 기회가 확보된 사용자. 미성숙 표본은 별도 표시한다. 연결 실패·무발화·기록 누락을 성공자 분모에서 임의로 제외하지 않는다.
- 첫 callSessionId의 attempt부터 해당 wrap-up log 또는 다음 attempt 중 이른 시점까지가 첫 통화. 종료 이벤트가 없으면 관측 가능한 발화를 사용하되 통화 경계 한계를 표시한다.
- `private/pilot-v1.json` 원본 캡처와 `private/packets/`의 그룹 비표시 자료를 동결한다. 현재 context 행을 과거 사실로 쓰지 않는다. `talent_context_write_requests.response.applied`에서 당시 내용을 복원하며, 첫 통화 직후 비동기 저장은 최대 5분까지 허용하되 다음 사용자 대화/다음 통화보다 앞선 경우에만 포함한다.
- 최초 rubric은 `rubric-v1.md`. 결과는 `gold-v1.json`(비식별 ID·판정만), 상세 근거는 private. 수정 시 새 버전과 변경 이유를 남긴다. 독립적인 사람 검토 전에는 human gold라고 부르지 않는다.
- `pilot-v2`는 `rubric-v1.md`를 유지하고 `gold-v2.json`에 새 case ID와 최초 판정을 동결한다. 전체 발화 재검토에서 한 판정을 정정한 최종 gold는 `gold-v2-labels-v2.json`이며 비블라인드 수정 이력을 포함한다. 원문·사용량은 `private/pilot-v2.json`, `private/prepared-v2.json`, `private/usage-v2.json`, `private/packets-v2/`에 둔다. 이전 gold를 덮어쓰지 않는다.

## Input / 평가 계약

평가자는 모델명을 숨긴 기존 프로필 증거, 첫 통화, 통화 전후 저장 내용, 기록 가용성만 읽는다. 후속 대화에서 확보된 정보는 첫 통화 점수에 사용할 수 없다. 모델/그룹과 자동 완료 상태는 판정 완료 후 합친다. 현재 Codex가 직접 의미를 평가하며 추가 외부 LLM API 호출은 하지 않는다. 키워드·길이·정규식으로 정성 판정을 만들지 않는다.

## Canonical runner

- `scripts/evalCareerVoiceOnboarding.ts capture <v1|v2>`: GET-only production capture, private 파일 0600, 기존 frozen 파일 덮어쓰기 금지.
- `scripts/evalCareerVoiceOnboarding.ts packets <v1|v2>`: 원본에서 그룹 비표시 review packet 생성. v2는 기존 성숙 40명의 v1 동결 입력을 승계한다.
- `scripts/evalCareerVoiceOnboarding.ts summarize <v1|v2> [labels-v2]`: 동결된 수동 판정과 배정 결합 및 비식별 집계. 최근 30일 최종 판정에는 `summarize v2 labels-v2`를 쓴다.
- `scripts/evalCareerVoiceOnboarding.ts cost-capture v2` / `cost-summarize v2 labels-v2`: 첫 session의 GET-only 사용량 capture와 비용 집계. Live 음성 시간은 초 단위 $0.05/분, `gpt-6.1-sol` 위임은 공식 토큰 단가로 보정한다. 기록 없는 세션과 별도 Realtime 입력 전사 비용은 총액으로 오인하지 않는다.

## Metrics와 의사결정

- 주 지표: 첫 통화 정보 충분성 + 저장 정확성 모두 확인된 사용자 / 전체 성숙 배정 사용자.
- `ready`, `not_ready`, `unknown`을 분리한다. unknown은 실패로 단정하지 않는다. confirmed rate와 unknown을 모두 성공으로 보는 상한을 함께 제시한다.
- 충분성: 희망 역할/방향, 시점·탐색 의사, 지역·근무 방식, 보상 기준, 필수·기피 조건/우선순위가 추천을 시작할 만큼 명확한가. 해당 없음·제약 없음·미정도 명시됐다면 유효하다. 경력 원본에 이미 있는 사실을 다시 말할 필요는 없다.
- 정확성: 사용자 확인 사실과 저장된 정보가 일치하고, 추천을 바꿀 중요한 누락·날조·강도 왜곡이 없는가.
- 보조: 24시간 내 실제 완료 event(품질 검증 없는 운영상 완료), 실패/무발화/누락, 반복 통화. 비용은 첫 session 단위의 기록 기반 추정과 누락 건수를 함께 표시한다. 음성 latency는 telemetry가 없으면 N/A.
- 모델 선택에는 주 지표 차이, 불확실성, 중요한 저장 오류를 함께 본다. 작은 pilot만으로 확정 승자/전체 대화 품질을 선언하지 않는다. 배포는 이 평가에 포함되지 않는다.

## 설정·출처·개인정보

- Production observed A=`gpt-realtime-2.1`, B=`gpt-live-1`; historical runtime의 provider/prompt 변경은 재실행한 모델 실험처럼 통제되지 않는다. v2 기간 Live 위임 로그에는 `gpt-5.6-terra`와 `gpt-6.1-sol`이 함께 있다.
- 평가자: 현재 Codex 대화의 직접 검토. 모델명·reasoning의 정확한 runtime 식별자는 제공되지 않으므로 임의로 기록하지 않는다. 추가 API sampling/reasoning/temperature는 해당 없음.
- 데이터: logs, talent_messages, talent_context_write_requests, talent_contexts, talent_documents, talent_users/experiences, talent_calls, talent_activity_events. Supabase GET-only, DB mutation·추천·발송 없음.
- 원문·계정 ID·model mapping은 ignored private에만 보관하고 0600을 적용한다. 공개 gold/manifest/report는 원문·개인정보를 포함하지 않는다. 별도 provider 전송 없음.

## 한계

관측형 pilot이며 이미 전체 그룹별 발화 집계를 본 평가자의 완전한 blind를 보장할 수 없다. 개별 자료에서는 그룹 정보를 숨긴다. 원음/음성 인식 품질·무음·응답 지연은 텍스트만으로 평가하지 않는다. 과거 프로필이나 저장 변경 이력이 없으면 현재값으로 보충하지 않는다. 기존 이력서 원문에는 연락처·학력·주소 등의 개인정보가 포함될 수 있어 review packet도 raw production 자료로 취급하며 ignored private에만 보관한다. 공개 산출물에는 넣지 않는다. 향후 재현은 private snapshot 보존에 의존한다.

## Live prompt 변경 음성 smoke (`live-prompt-v1`)

[2026-10-20 검증 결과](reports/2026-10-20-live-prompt-v1.md): 사례별 최신 유효 음성 실행 4/4 통과, 관련 코드 검사 19개 통과. 로컬·미배포이며 실제 저장 E2E/완료율 개선은 미검증. [재현 manifest](live-prompt-manifest-v1.json).

- 목적/단위: 조기 종료, 마지막 확인 반복, 중단 요청, 저장 진행 갱신을 합성 음성 4개로 확인한다. 모델 간 승률 비교가 아닌 변경 경로의 짧은 점검이다.
- Frozen input/gold: `live-prompt-cases-v1.json`의 프로필·대화·coverage·다음 발화·정성 기대값. 2026-10-20 합성 작성, 운영 개인정보·원문 없음. 독립 human gold는 아니다. 변경 사례는 새 버전으로 보존한다.
- Canonical runner: `TSX_TSCONFIG_PATH=scripts/tsconfig.json node --env-file=.env.local --import tsx scripts/evalCareerLiveOnboardingPrompt.ts [case-id ...]`. macOS `say`의 Yuna와 ffmpeg로 만든 PCM16/24kHz를 실제 시간에 맞춰 Live WebSocket에 보내고, 실제 공통 prompt와 backend `end_call` 정의를 사용한다. 제품 DB·외부 도구 실행은 없다.
- 계약: 시작 시 기존 합성 대화를 제공하고, backend에는 같은 대화와 checklist를 제공한다. 갱신 사례는 실제 `session.update`와 `session.thinking.append`를 보낸다. 답변·도구 호출·에러·종료 이벤트를 기록한다. 정성 출력은 Codex가 문맥을 직접 읽으며 키워드/정규식으로 채점하지 않는다.
- 설정/재현: 현재 `getCareerLiveSessionConfig()`의 모델·음성·reasoning 사용. 각 새 run의 manifest에 설정·fixture/audio SHA-256·git revision/diff hash, case별 전체 prompt를 기록한다. 기존 raw audio와 출력은 덮어쓰지 않는다.
- 개인정보: OpenAI에는 합성 입력만 전송한다. 원음·모델 출력·전체 요청/이벤트는 ignored `private/live-prompt-v1/`와 `runs/`에만 저장하고 파일 0600/디렉터리 0700으로 제한한다. 공개 보고서는 비식별 결과만 기록한다.
- Gate: API 오류 없이 완료, 누락된 필수 항목을 완료로 처리하지 않기, 최종 확인 반복 없음, 중단 요청 존중, 갱신 후 이미 답한 질문 반복 없음. 4개 모두 문맥 검토를 통과해야 이 제한된 smoke가 통과한다. 미실행/판정 불가를 통과로 세지 않는다.
- 한계: 합성 history/coverage이며 실제 추출·저장, 브라우저 WebRTC, 소음·말 끊기·사용자별 지연·실서비스 완료율은 검증하지 않는다. 이 smoke만으로 완료율 개선이나 전체 rollout 승인을 주장하지 않는다.

## 모의 면접 Live 시작·음성 입력 smoke (`mock-interview-v1`)

[2026-10-26 검증 결과](reports/2026-10-26-live-mock-interview.md): prompt만 고친 최초 실행은 실패했고, backend 시작 요청을 추가한 실행은 첫 기술 질문·음성 끼어들기 응답을 통과했다. 온보딩 완료 회귀와 코드 검사 16개도 통과했다. 실제 사용자 마이크/WebRTC는 미검증이며 로컬·미배포다. [재현 manifest](mock-interview-manifest-v1.json).

- 목적/단위: 인사만 하고 멈추던 Live 시작 경로에서 실제 위임·질문 준비·사용자 음성 응답을 합성 통화 한 건으로 확인한다. 온보딩 비교와 별개인 변경 경로 점검이다.
- Frozen input/gold: `live-prompt-cases-mock-interview-v1.json`. 운영 개인정보 없는 합성 프로필·Role·음성·검색 결과와 실행 전 기대 행동을 동결한다. 기존 v1/v2는 유지한다.
- Canonical runner: `CAREER_VOICE_EVAL_VERSION=mock-interview-v1 TSX_TSCONFIG_PATH=scripts/tsconfig.json node --env-file=.env.local --import tsx scripts/evalCareerLiveOnboardingPrompt.ts opening-and-spoken-interruption`. 공통 frontend/모의 면접 prompt와 `buildLiveSessionOpeningEvents`의 백엔드 시작 요청을 사용한다. 30초 동안 무음을 보낸 뒤 Yuna PCM16/24kHz 발화를 보낸다. `web_search`는 합성 빈 검색 결과를 돌려주며 실제 검색·DB·제품 도구 실행은 없다.
- 설정/재현/개인정보: 제품 Live/위임 모델·reasoning·voice를 재사용한다. run별 manifest는 fixture/runner SHA-256·revision/diff hash·모델 설정을 기록하고 전체 입력·이벤트·음성을 ignored `runs/`와 `private/mock-interview-v1/`에 owner-only로 저장한다. OpenAI에는 합성 입력만 전송한다. 출력 상한이나 별도 sampling 설정을 추가하지 않는다.
- Gate: 발화 이전 실제 위임·검색, 인사를 넘어 첫 기술 질문, 실제 입력 전사와 설명 요청에 맞는 후속 응답, API 오류 0건. Codex가 이벤트와 전체 대화를 직접 읽으며 키워드로 의미를 채점하지 않는다. 미실행·실패는 통과가 아니다.
- 한계: 한 건의 합성 WebSocket smoke이며 사용자 마이크·WebRTC·실제 검색·생산 환경 성공률을 검증하지 않는다. 기존 온보딩 완료 사례를 별도 짧은 회귀 점검으로 재실행한다.

## Pilot 결과와 release gate (관측 결과)

[2026-10-06 최근 30일 재평가](reports/2026-10-06-month-v2.md): 성숙 113명의 성공 확인 비율은 Realtime 23/59=39.0%, Live 13/54=24.1%. 첫 session 기록 기반 비용은 배정 사용자당 각각 $0.63, $0.34이며 성공 확인 1명당 $1.61, $1.42다. Realtime을 온보딩 기본 선택으로 유지하는 운영 판단이다. 판정 불가 45명, 95% 차이 구간의 0 포함, 누락된 비용 때문에 확정적 모델 우열이나 자동 rollout 승인은 아니다. 배정/배포는 변경하지 않았다.

[2026-09-28 결과](reports/2026-09-28-pilot-v1.md): 성숙 40명의 성공 확인 비율은 Realtime 9/18=50.0%, Live 5/22=22.7%. 기록 부족 17명 및 정성 평가 불확실성으로 확정 승자는 아니다. Realtime 우선 선택의 잠정 근거이며, 자동 rollout 승인 gate는 충족하지 않는다. 실제 전환 판단에는 동일 session 단위 관측 누락 해소, 독립적인 기준 검토, 주 지표의 불확실성과 실패·지연·비용 확인이 필요하다. 배포 또는 실험 비율 변경은 수행하지 않았다.

## 최종 확인 선택화와 실제 종료 (`live-prompt-v2`)

[2026-10-25 검증 결과](reports/2026-10-25-completion-v2.md): A/B 각각 합성 5개 사례의 최신 유효 실행 통과, 코드 검사 41개 통과. 최초 실패·연결 오류를 보존했다. 로컬·미배포이며 운영 DB/브라우저 전체 E2E는 미검증. [재현 manifest](completion-manifest-v2.json).

- 목적/단위: 마지막 필수 답변 이후 별도 최종 확인 없이 정상 완료·종료하는지, 필수 정보 누락과 중도 종료를 구별하는지 확인하는 합성 사례별 1회 응답이다. v1은 보존한다.
- Frozen input/gold: `live-prompt-cases-v2.json`의 5개 합성 대화·coverage·다음 발화·기대 행동. 2026-10-25 작성. 운영 원문·식별자 없음. 독립 human gold가 아니다.
- Canonical runners: B는 기존 `scripts/evalCareerLiveOnboardingPrompt.ts`에 `CAREER_VOICE_EVAL_VERSION=v2`를 설정한다. A는 `scripts/evalCareerRealtimeOnboardingPrompt.ts [case-id ...]`. 둘 다 실제 제품 prompt builder·모델 설정·end_call schema를 재사용한다. B는 Yuna 음성 입력, A는 합성 텍스트 입력과 실제 Realtime 음성 응답이므로 음성 인식 품질을 비교하지 않는다.
- 실행: `TSX_TSCONFIG_PATH=scripts/tsconfig.json node --env-file=.env.local --import tsx <runner> [case-id ...]`. 명시한 사례만 실행한다. 제품 DB·도구 실행은 없으며 OpenAI에는 합성 입력만 전송한다.
- 설정: 각 ignored run manifest에 fixture/runner/prompt 코드 diff fingerprint, revision, 모델·reasoning(해당 시)·선택 사례를 보존한다. 전체 요청·응답·음성은 `runs/` 또는 `private/live-prompt-v2/`에 owner-only로 저장한다. sampling은 제품/서비스 기본값이며 출력 상한을 추가하지 않는다.
- Gate: 입력/응답이 유효하고, 필수 주제 완료 시 end_call complete_onboarding=true, 중도 종료 시 false, 누락 시 실제 필요한 한 질문, 최종 확인 재강제 없음. Codex가 문맥과 도구 인자를 직접 읽는다. 실패·연결 오류·미실행은 통과로 세지 않는다. 사례별 최신 유효 결과를 보고하고 최초 실패를 보존한다.
- 저장 경계: `src/app/api/talent/chat/call-wrapup/route.test.ts`는 실제 route를 격리된 저장·추출 의존성과 실행해 저장 지연/누락/실패/중도 종료를 확인한다. `src/hooks/career/useCareerOnboardingVoice.test.ts`는 실제 콜백을 격리된 hook host/transport에서 실행해 마지막 전사·저장·완료 이전에 연결을 끊지 않는지 확인한다.
- 한계: 합성 사례이며 운영 DB transaction, 브라우저 WebRTC 재생, 실제 잡음·지연, 서비스 전체 완료율은 검증하지 않는다. hook 검사는 React 렌더링 검증이 아니다. 모델 smoke와 격리된 저장 검사를 합쳐 production E2E 통과라고 부르지 않는다.

## Internal 회사 연결 통화의 기록 도구 (`internal-call-v1`)

2026-10-28 최신 유효 음성 실행 2/2 통과. 첫 실행 한 건은 입력 처리 전에 닫힌 harness 문제로 무효 처리하고 보존했다. [재현 manifest와 사례별 결과](internal-call-manifest-v1.json). 로컬·미배포이며 운영 DB/브라우저 전체 E2E는 미검증이다.

- 목적/단위: 실제 Live 음성 모델에 회사·직무·질문·저장 응답을 직접 주고, 응답 기록 도구와 종료가 이어지는지 합성 통화 2건으로 확인한다. 일반 성능 비교가 아니다.
- Frozen input/gold: `live-prompt-cases-internal-call-v1.json`. 2026-10-28 작성한 합성 회사·질문·대화·음성과 실행 전 기대 행동이며 운영 원문은 없다. 기존 버전을 덮어쓰지 않는다. 독립 human gold는 아니다.
- Canonical runner: `CAREER_VOICE_EVAL_VERSION=internal-call-v1 TSX_TSCONFIG_PATH=scripts/tsconfig.json node --env-file=.env.local --import tsx scripts/evalCareerLiveOnboardingPrompt.ts`. 실제 shared frontend/내부 통화/backend prompt와 도구 정의를 사용한다. 합성 음성은 Yuna PCM16/24kHz이며 `record_call_answers`의 실제 executor와 SQL을 격리된 메모리 PGlite에서 실행한다. 운영 DB·메시지·추천·회사 연락은 없다.
- 계약: 음성 모델은 전체 질문과 저장된 응답을 직접 받는다. LLM이 질문 번호와 응답을 기록하고, 결과의 전용 텍스트 projection 및 실제 `session.update`/`session.thinking.append`로 최신 사실을 전달한다. 첫 사례는 시작·모름·거절·종료, 둘째는 저장 응답 유지·다음 질문 기록·종료를 확인한다.
- 설정/재현: 제품의 `getCareerLiveSessionConfig()`를 재사용하며 sampling/출력 상한은 별도로 추가하지 않는다. run manifest에는 모델·reasoning·fixture/runner SHA-256·revision/diff hash와 전체 입력을 보존한다. 외부 provider에는 합성 입력만 전송한다. 음성·전체 응답은 ignored `private/internal-call-v1/`와 `runs/`에 owner-only로 저장한다.
- 지표/gate: 두 사례 모두 회사/직무/질문 유지, 사용자 의미에 맞는 실제 응답 저장, 기존 응답 보존, 이미 답하거나 거절한 질문의 불필요한 반복 없음, 실제 `end_call(false)`, API 오류 0건. Codex가 발화·도구 인자·저장 결과를 직접 읽고 판단한다. 문구 일치·키워드로 의미를 채점하지 않는다. 실패/미실행은 통과로 세지 않는다.
- 한계: 합성 WebSocket + 메모리 DB 검사다. 사용자 마이크/WebRTC 재생, 운영 DB/배포, 소음/중첩발화 및 전체 서비스 성공률은 검증하지 않는다. 실제 모델 출력은 확률적이며 이 두 사례로 모든 통화의 품질을 보장하지 않는다.
