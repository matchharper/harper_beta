# 공통 Talent × Role Fit 평가

## 2026-10-26 온보딩·정기 Role 검색 입력 및 평가 원장 통합

- 사용자 요청: 양쪽 1·2차가 같은 근거를 평가하고, 다른 경로가 이미 완료한 평가를 반복하지 않는다.
- 정본 입력은 Worker `opp/matching/worker_inputs.py`다. 정기 검색의 기존 전체 Profile·Brief 행/시각·동일 version Behavior Context·회사/팀/Role Memory와 Criteria 순서를 그대로 보존한다. 후보자 Memory 원문은 두 경로 모두 1·2차에 직접 넣지 않는다. `worker_behavior_v1`의 기존 fingerprint 형식을 유지한다.
- 정본 실행은 `worker_evaluations.py`와 공통 `scheduled.evaluate`/`evaluate_candidates`/`DecisionsClient`다. 양쪽 모두 `company_role_candidate_evaluations`를 읽고 쓴다. 동일 입력·모델·prompt version의 단계별 결과를 재사용하며, 거래 advisory lock 안에서 재조회한 뒤 호출·저장해 동시 중복을 막는다. 완료된 1차는 2차 실패 뒤에도 남고, 완료된 2차가 있으면 1차를 새로 보충하지 않는다. 원장 재사용 시 새 행·가짜 회사 검색 실행을 만들지 않는다.
- 새 온보딩 평가는 `talent_opportunity_fit`에 쓰지 않는다. 10번은 공통 원장의 현재 2차 점수 상위 최대 10개를 읽고, 기존 추천 선택 지침과 11번 Memory 연락 판단을 유지한다. matching review의 `evaluation_ref`는 정확한 평가 ID와 원래 생산 실행을 보존한다.
- 운영 DB는 승인된 migration `20261026052249`(`shared_worker_role_evaluations`)로 선반영했다. 로컬 정본은 `20261026051109_shared_worker_role_evaluations.sql`이다. 기존 원장 2,318행 보존, 새 계약/Opportunity 행 0건, 함수 본문 정본 일치·SECURITY INVOKER·서버 전용 권한·RLS 유지·신규 security advisory 없음 확인. 웹·Worker는 미배포다.
- 검증 단위/정본: `tests/test_worker_evaluations.py`의 두 경로 실제 request/fingerprint 일치, `test_worker_evaluations_postgres.py`의 양방향 재사용·동시 실행·2차 실패 재시도·변경된 회사 Memory·실행 lease 상실·실제 온보딩 선정 저장, `test_candidate_contact_cadence_postgres.py`의 legacy fit 없이 11번 및 전달 guard. PostgreSQL은 localhost disposable DB이고 모든 Role은 삽입 전 `testOnly`/`testFixture`와 전용 talent allowlist를 기록한다. 양성 경로는 이 임시 DB에서만 isolation reader를 대체하며 저장된 표식은 유지한다.
- 입력/gold/model: 이 검증은 합성 Python fixture와 stub Decisions 결과로 저장·재사용 계약을 검증하는 통합 테스트이며 새로운 LLM 품질 benchmark가 아니다. 기존 frozen LLM gold와 prompt는 변경하지 않았다. 운영 데이터 모델 전송·실제 연락은 없다. 실제 API 중단 뒤 응답을 받지 못한 경우까지 exactly-once 과금을 보장하지는 않는다.
- 결과: 변경 경로 Python 47개·온보딩 상위 10개 선정 14개·웹 공통 평가 조회 24개 통과. 별도 `test_unified_matching.py` 실행에서는 기존 legacy `merge_stored_matching_pool`의 캐시 fixture 기대 불일치 1건을 확인했다(이번 공통 원장 경로 밖). 해당 legacy 구현/기대값은 수정하지 않았다. 실행 환경별 Python 3.9의 ISO `Z` 파싱 및 Python 3.11 임시 환경의 `jsonschema` 미설치 문제는 코드 실패와 구분한다.
- 후속 배포 전 점검: 위 legacy 불일치는 공용 `fetch_all` mock이 수락 후보 reader에도 적용된 fixture 문제였다. 수락 후보가 없음을 명시해 원래 assertion 그대로 통과했으며 제품 로직은 변경하지 않았다. 스케줄러 fixture의 follow-up 테이블 availability mock도 보완했다. 확장된 관련 Worker 226개(+10 subtests)·선정/캐시 15개·웹 45개와 프로덕션 빌드·타입 검사가 통과했다. 운영 DB 읽기 전용으로 한 쌍의 두 로더 객체/fingerprint 일치와 스케줄러 SQL 해석을 확인했다. 새 LLM benchmark·실제 발송·배포는 없다. 남은 설정·서비스별 전환·회사 Role 온보딩 캐시 준비는 [배포 전 점검 기록](../../predeployment-check-2026-10-26-ko.md)을 따른다.

## 2026-10-26 후보자 주기·Memory 연락 판단 검증 (로컬·미배포)

후속 DB 반영: 사용자 승인으로 `20261026044735`(`candidate_contact_cadence`)를 운영 적용했다.
로컬 정본은 `20261026034255_candidate_contact_cadence.sql`이다. 함수 2개의 본문·서버 전용 권한과
없는 pair의 전달 차단을 확인했다. 적용 당시 새 계약의 선정 review는 0건이며 평가·추천·발송 데이터는
만들지 않았다. 아래 합성 평가 당시의 미적용 기록은 당시 이력이다. 웹·Worker는 계속 미배포다.

- `contact-composition-cases-v3.json`/`contact-composition-manifest-v3.json`은 기존 v2의 3건을
  보존하고 합성 Memory 3건을 추가한 frozen challenge다. 회사 전체의 명시적 재제안 거절,
  특정 역할만 거절한 뒤 새 역할에 대한 관심, 이미 지원·면접 중인 역할의 중복 제안을 검증한다.
  정답은 실행 전에 작성했으며 독립 팀원 검토와 대표 표본 성능 측정은 아니다.
- 정본 runner는 기존 `eval_contact_composition.py --dataset v3`다. 실제 `choose_contact`,
  공통 formatter와 두 사례의 final writer를 사용한다. 모델은 현재 설정의
  `internal_contact_selection` (`gpt-6.1-sol`, reasoning `high`)과 `final_delivery`다.
  입력·prompt·source hash, 사용량, 시간, 전체 출력은 ignored owner-only `runs/`에 보존한다.
- 모델 출력의 `rejectedRoleIds`는 명확한 비추천을 즉시 종료하는 실행 명령이다.
  `handledRoleIds`는 다른 추천과 함께 다룬 제안이며 기존처럼 실제 발송 receipt를 요구한다.
  둘을 구별하지 않으면 한 역할의 발송 실패가 다른 역할의 비추천까지 되살릴 수 있다.
  `reason`은 계속 전체 판단 이유이며 writer와 기존 discovery 원장에 보존한다.
- Role 검색에서 선정된 제안은 역할별 즉시 실행 대신 후보자의 정기 연락 주기에 모아 판단한다.
  별도 `talent_opportunity_fit` 행이 없는 Decisions 평가도 읽는다. 추천 명령과 정확한 review ID를
  저장한 뒤에만 새 추천을 만들 수 있으며, 검색 요일은 이미 선정된 제안의 전달 요일을 제한하지 않는다.
- DB 상태 전이·실패 복구는 `tests/test_candidate_contact_cadence_postgres.py`와
  `tests/test_contact_selection_receipts.py`의 disposable localhost DB로 확인한다.
  테스트 Role은 `testOnly`로 저장한다. 실제 격리 guard를 검증한 뒤 양성 흐름에 한해서만 로컬 함수의
  격리 predicate를 대체하며 운영 코드·DB 또는 fixture marker를 변경하지 않는다.
- Gate: 정확한 ID·출력 구조, 실행 전 required/rejected/handled gold, 추천 보존·링크·설명 전달,
  명시적 거절의 재제안 및 회사 전체로의 과잉 확대 0건. 원문을 직접 읽어 의미를 확인한다.
  실제 provider 호출은 합성 자료만 사용하며 DB 저장·이메일·Slack 전송·운영 배포는 하지 않는다.
  실행 결과는 아래에 남긴다. 기존 v1/v2 결과를 덮어쓰지 않는다.

### 실행 결과: composition-20261026T035450

- 실제 `gpt-6.1-sol high` 연락 판단 **6/6**, 두 사례의 실제 final writer
  (`claude-haiku-5-5`) 출력·추천 부착·정규화 **2/2** 통과했다.
  전체 판단 이유와 두 이메일 원문을 읽었다. 회사 전체 거절은 그 회사만 제외했고,
  역할 한정 거절 뒤의 다른 역할은 유지했으며, 이미 지원·면접 중인 역할은 재제안하지 않았다.
  첫 사례는 새 회사 두 곳과 같은 회사의 유용한 대안을 소개했고, 비추천 사례의 본문에는 제외한 역할을
  대안으로 다시 제안하거나 연결 링크를 넣지 않았다. 회사의 수락·관심을 임의로 주장하지 않았다.
- 원문과 실행 manifest: ignored `runs/composition-20261026T035450/`.
  frozen v3 SHA-256: `997ada1109a348830ca2a38ac9bd1d0207ae50a2a2802b90c547c9ec4972213e`.
  사례별 소요 시간은 52.81 / 8.69 / 11.73 / 33.84 / 8.10 / 7.58초이며 첫·네 번째는 writer를 포함한다.
  런타임 기록의 추정 총 비용은 **$0.06347383**이다. 청구 금액 검증이나 모델 간 성능 비교는 아니다.
- 별도 disposable PostgreSQL 검증은 실제 새 migration과 pending reader를 실행했다.
  legacy fit 행 없이 두 제안을 읽고 하나를 추천·하나를 종료하는 흐름, writer 호출 전 실패와 저장된
  이메일 실패의 재시도, 정확한 선택 receipt 없이는 전달 불가, 입력 변경 후 전달 차단을 확인했다.
  같은 근거의 종료 제안은 재선정하지 않으며, 근거가 변경되어 무효인 과거 review는 새 평가를 막지 않는다.
- 모델 실행 뒤의 추가 수정은 동일 run의 판단 receipt 재사용과 DB 근거 유효성 경계다.
  모델 prompt·출력 계약은 이 실행과 동일하다. 운영 DB migration·배포·실제 발송은 하지 않았다.
- 최종 국소 검증: Python **79건 + subtest 5건**, 웹 실행 원장 **7건** 통과.
  Memory·연락 선택·현재 상태·scheduler/온보딩 재시도·Decisions 저장·회사 선정 transaction을 포함한다.
  기존 PostgreSQL fixture에 빠진 billing 의존 함수와 현재 원장의 컬럼을 보완했고,
  scheduler의 과거 fit-refresh 기대와 follow-up mock을 현재 계약에 맞췄다.
  별도 기존 `profileSubmissionCadenceMigration.test.ts`는 참조하는
  `20260901110000_periodic_profile_submission_cadence.sql` 파일이 로컬에 없어 실행하지 못했다.
  이 누락을 운영 schema 결함으로 추정하거나 migration을 복원·적용하지 않았다.
  실제 회원가입 브라우저, 운영 scheduler 실행, 이메일/Slack 수신은 이번 검증 범위가 아니다.

## 후보자 연락 구성: contact-composition-v1/v2

- 목적/단위: 적합도·추천 결정 이후, 이미 선정된 여러 기회를 한 후보자 연락으로 구성하는 호출.
  frozen `contact-composition-cases-v2.json`의 합성 3건과 그 안의 실행 전 gold/rubric을 사용한다.
  최근 동일 회사의 유사 제안, 여러 새 회사, 역할 한정 거절 뒤 다른 역할을 포함한다.
- 입력 계약: Profile·전체 Brief·Behavior Context, 선정 이유, 관련 회사 추천·전달·반응 사실,
  이전 연락 구성 결과. 이전 판단은 후보자 사실·실제 대안 언급으로 간주하지 않는다.
  출력은 `roleIds`, `handledRoleIds`, 자유 서술 `reason`이며 역할별 fit 재평가나 보류 상태를 만들지 않는다.
  `reason`은 후보자에게 공유 가능한 사실만으로 작성하는 연락 구성 인계이며 최종 writer에도 전달한다.
- Canonical runner: `harper_worker/llm_evals/unified_talent_role_fit/eval_contact_composition.py`.
  실제 `choose_contact`와 입력 formatter, 첫 사례에는 실제 final-delivery builder/호출·추천 부착·정규화를 재사용한다.
  `contact-composition-manifest-v2.json`으로 fixture hash를 동결한다. 새 prompt/model은 새 run을 만든다.
  v1은 보존한다. v2는 합성 카드의 `locationText`를 실제 reader의 `location`으로,
  `candidateResponse`를 실제 추천 원장의 `feedback_reason`으로 맞춘 입력 수정이며 사실·gold는 동일하다.
- 모델: 기존 `company_first_rerank`와 `final_delivery` 설정을 override 없이 사용한다.
  run manifest에 revision·dirty diff hash·prompt hash·effective model config·usage·시간을 기록한다.
- Gate: 알려진 ID·서로 겹치지 않는 출력과 gold의 새 회사 추천 보존·관련 과거 제안 처리 확인.
  첫 사례의 역할별 summary ID coverage, 정규화 후 추천 보존, 정식 추천에만 연결되는 링크를 검사한다.
  전체 원문의 동의/회사 관심 조작, 회사 영구 제외, 근거 없는 재심사·연락 반복과 구성 판단의 반영을 직접 검토한다.
  실제 PostgreSQL의 exact-review receipt, 미발송/실패 복구, `both` 원본 보존은 별도 단위 검사다.
- Provenance/privacy: 전부 가상 인물·회사이며 production 조회·DB 쓰기·발송이 없다.
  원문 출력·manifest는 ignored `runs/`의 owner-only 파일에 저장한다. 외부 모델은 기존 provider를 사용한다.
- 한계: Codex가 실행 전 사례와 gold를 작성한 작은 challenge이며 독립 팀원 검토나 반응률 평가가 아니다.
  runner는 DB lifecycle·실제 이메일·scheduler를 실행하지 않으며 결과가 배포 완료를 뜻하지 않는다.

### 2026-10-23 로컬 구현과 확인

- 기존 `company_first_rerank` 호출을 연락 구성에 그대로 사용한다. 새 회사 추천을 기본적으로 보존하고
  기존 추천의 반복·겹침을 판단한다. 새 LLM 단계·회사 차단 목록·재평가/연기 상태는 추가하지 않는다.
- `opportunity_discovery_run.context_metrics.internalContactSelection`에 전체 결과·원래 선정 review IDs를
  저장한다. `handledRoleIds`의 exact review만 다음 scheduler/후보 조회에서 제외한다. 원래 fit·선정 이유·
  `both`의 회사측 기록은 수정하지 않는다. 새 review는 별개 제안이며 회사 전체를 차단하지 않는다.
- 직접 소개할 역할이 있으면 그 run의 sent 이메일에 저장된 `recommendationExposures`가 모든 직접 추천을
  포함해야 함께 처리한 제안도 소비된다. 추천 저장만 된 경우, 채팅만 전달된 경우, 실패한 이메일이나
  다른 action만 전달된 경우에는 소비하지 않는다. 발송 본문이 저장된 이후에는 재시도 때 연락 구성도
  보존한다. 연락 없이 처리하는 결과는 발송 사실을 만들지 않는다. 제외 이유는 이후 관련 회사 연락의
  판단 근거로 읽으며 Memory에 쓰지 않는다. 이 receipt를 실제 대안 언급의 증거로 해석하지 않는다.
- `runs/composition-20261023T052207` (v2): 실제 선택 3건 모두 실행 전 gold 조건 충족.
  기존 회사 유사 역할 2개는 별도 연락하지 않고 새 회사 2곳은 전달 대상으로 유지했다.
  다른 사례에서는 역할 한정 거절 뒤 같은 회사 새 방향을 살렸고, 새 회사 4곳은 모두 유지했다.
  첫 사례의 실제 최종 writer는 두 주 역할을 소개했으며, 선택자가 함께 설명하려던 대안은 생략했다.
  후속 검토에서 구성 이유가 writer로 전달되지 않는 결함을 확인했으므로, 이 실행은 최종 경험 통과가 아니다.
- v2 총 추정 비용 $0.02080378, 사례별 선택+첫 사례 작성 시간 39.77/8.64/9.70초.
  이전 v1 실행도 보존하며 v1 writer의 누락 지역 재질문은 합성 필드 오류였다.
- 후속 실행 `runs/composition-20261023T075918`은 대안을 본문에 설명했지만 정식 추천이 아닌 대안에
  링크를 생성했고, provider schema가 단일 summary 객체를 강제하는 불일치도 드러났다. 해당 결과 역시
  최종 경험 통과가 아니다. 대안 projection에서 링크용 ID를 제거하고, provider schema를 기존 prompt와
  동일한 역할별 배열로 수정했다. 새 역할별 의미 상태나 추가 판단 호출은 도입하지 않았다.
- 최종 실제 호출 `runs/composition-20261023T080351`: 선택 3건의 기존 gold를 모두 충족했다.
  첫 메일은 브릿지 플랫폼을 직접 추천하고 개발 생산성 역할은 링크 없이 대안으로 설명하며,
  시더도 직접 추천했다. 오로라는 다시 권하지 않았다. 다른 사례에서는 역할 한정 거절 뒤 같은 회사의
  다른 방향과 새 회사 4곳 모두 보존했다. 총 추정 비용 $0.04268615, 사례별 162.78/12.67/14.42초.
  첫 writer는 기존 JSON 복구 호출(GLM)을 1회 거쳤고, 복구 결과가 `internalSummary` 대신 기존
  `selectedRecommendations` 형태로 돌아와 원래 summary-array 검사에 실패했다. 이 결과를 숨기거나
  덮어쓰지 않았다. 역할 ID로 두 기존 출력 형태를 읽도록 보완한 뒤, 같은 실제 응답을 정본 추천 부착·
  정규화 함수에 재입력했다. `normalization-recheck.json`에서 추천 2개, 각 생성 설명과 정확한 링크의
  보존을 확인한다. 새 LLM 호출이 아닌 후처리 재검증이며, `email-preview.txt`는 그 최종 본문이다.
- 관련 단위 검사 121개와 subtests 15개 통과. 별도 격리 PostgreSQL 1개에서 exact-ID 처리,
  실패/채팅만 전달/부분 이메일 보존, 발송 전후 재시도 시 receipt 보존, 새 review 허용,
  `both` 원본 보존과 실제 선택 reader/receipt SQL을 확인한다.
  넓혀 확인한 구형 `test_internal_fit.py` 11개 실패는 HEAD 원본을 메모리에서 실행해 동일하게 재현했다.
  이번 범위에서 구형 fit 테스트나 제품 계약을 고치지 않는다. 운영 DB/메일/배포는 실행하지 않았다.

## 실제 Role 검색부터 QA Slack 전달까지의 로컬 검증

- Canonical runner: `harper_worker/llm_evals/unified_talent_role_fit/run_role_delivery.py`.
  `prepare`, `case --index 0..9`, `post --index 0..9` 순서로 새 ignored `runs/` 폴더에서 실행한다.
  사용자가 실제 Workspace의 검색·저장·문구 작성과 지정 QA 채널 전송을 명시적으로 요청한 모드다.
- 단위/입력: internal Workspace 10개 × 실제 활성 paid Role 1개. Hiring Brief가 있고
  연결 대기·ready 상한에 여유가 있는 Role을 모델 실행 전에 선택한다. 새 snapshot/version으로
  원본을 캡처하며 기존 frozen gold와 과거 run을 수정하지 않는다. 독립 human gold는 없다.
- 실제 `run_claimed`의 SQL/결합 검색, 공유 fit·Behavior 캐시/저장, compact/rerank, 두 번의 live guard,
  presentation/Slack writer, atomic review·intro·outbox 저장을 실행한다. 생산 함수는 복제하지 않는다.
  DB 쓰기는 별도의 localhost snapshot에만 허용하며 후보자 발송 consumer는 실행하지 않는다.
- 재현 조건: 월요일 09:00 KST를 runner의 route clock, atomic commit의 route 재검사 및 DB schedule guard에만 적용한다.
  원본 타임스탬프와 캐시 시각은 실제 캡처 시각이다. 해당 snapshot에서만 회사 선추천과 QA 채널을
  활성화하며 실제 pair 권한·중복·pending/ready 상한은 보존한다. 변경된 guard 정의와 overrides를
  private manifest에 남긴다. 역사적 월요일의 운영 결과로 해석하지 않는다.
  `--continue-from`은 실제 이전 planner 출력을 재검증하고 SQL을 다시 실행한다.
  downstream 검증 도구를 고칠 때 `--replay-retrieval`로 그때 실제 SQL이 반환한 동일 pool을
  유지할 수 있다. 현재 권한·입력·fit/cache·선정·writer·저장은 다시 실행하며 이전 실패·비용은
  보존한다. 이 경우 새 planner/SQL 실행이나 cold-cache 성능으로 집계하지 않는다.
- 모델/지표: 현재 runtime/model/provider 계약을 사용하고 호출별 입력·응답·재시도·비용,
  단계별 지연, fresh/cache/stale fit, 선정 방향, 실제 저장 상태와 QA Slack receipt를 보존한다.
  독립 gold가 없어 추천 정확도나 반응률을 측정하지 않는다.
- privacy/gate: production capture는 canonical read-only 연결뿐이다. 회사 bot credential은
  token-presence로만 캡처한다. raw source와 출력은 ignored owner-only 경로에 저장한다.
  외부 LLM은 기존 provider/client 계약을 사용한다. 발송은 `C0BULQ5K5EJ`와 Harper QA team
  identity를 확인한 뒤 별도 단계에서만 수행한다. 원래 회사 채널과 후보자 outbound는 차단한다.
  성공한 run의 영속 outbox payload만 전송하고 receipts로 재전송 중복을 막는다.
- 한계: 일부 production FK/RLS/index와 실제 회사 delivery API/후보자 이메일은 재현하지 않는다.
  로컬 데이터 캡처 시간은 production inference 성능과 구분한다. 10개 실행 성공은 독립 품질 gate나
  production migration·배포 완료를 뜻하지 않는다.
- 2026-10-09 추가 정성 확인: 같은 원본으로 회사 presentation과 accepted-role rerank를 별도
  private run에서 재확인했다. 명확한 부적합과 미확인을 구별하는 presentation 계약,
  기존 후보자 동의가 회사의 필수 요건을 면제하지 않는 accepted-review 계약을 보완했다.
  최초 결과·수정 후 결과·추가 비용은 함께 보존한다. 이미 완료한 최초 실행의 선정 수를
  수정 후 결과로 덮어쓰지 않으며, 한 사례의 변경을 독립 품질 gate 통과로 해석하지 않는다.

## 고정 입력의 지연·상태 표기 재생 (latency-replay-v1)

- Canonical runner: `harper_worker/llm_evals/unified_talent_role_fit/replay_latency.py`.
  `--from-run <기존 private full-role run> --output <새 private runs 경로>`로 실행한다.
  후속 검토의 exact-ID exclusion은 `--exclude-talent-id`로 기록하며 원본은 수정하지 않는다.
- 목적/단위: 같은 회사 snapshot의 query planner, fit 16쌍 단위 × 최대 5개 병렬 배치,
  기존 회사 공개 소개의 한국어·영어 Slack writer를 각각 실제 runtime 함수로 재생한다.
  Profile·전체 Brief·동일 Behavior 입력과 기존 모델/reasoning을 유지한다.
- 입력/재현: 원본 `events.json`, `pairs.json` hash와 실행 revision·dirty diff·runtime hash,
  실제 모델/timeout/재시도 설정, 단계별 호출 원문·usage·시간을 새 manifest에 남긴다.
  언어 확인용 Headquarters override는 명시하며 dataset/gold를 덮어쓰지 않는다.
- 지표/gate: 전체 pair coverage·오류·단계별 지연을 보고하고, writer의 이름 앞 상태 표시와
  공개 근거·개인정보·다음 행동을 사람이 읽는다. 후보자별 소개는 가볍게 읽혀야 하며,
  bullet을 쓰면 핵심 1~2개로 간결하게 정리하는지도 원문에서 확인한다.
  의미나 이모지를 규칙으로 판정해 후처리하지 않는다.
  독립 gold는 없으며 frozen synthetic v1 gate는 별도로 실행한다.
- `--components writer`는 두 언어 writer만 실행한다. `--components repair`에
  `--repair-call-json <기존 call artifact>`와 `--repair-batch-index <배치 번호>`를 주면
  실제 stage-one 형식 오류 응답만 재생한다. 구조가 유효한 행은 동결 응답에서 읽고,
  잘못되거나 누락된 pairRef만 실제 LLM으로 고친다. source/응답 hash, 전체 coverage,
  정상 행의 보존 여부, 새 호출 비용·지연을 기록한다. duplicate/unknown identity는
  부분 보존하지 않고 전체 재검증한다. 의미 기반 후처리가 아니다.
- privacy/한계: 이미 캡처한 owner-only 입력만 사용한다. DB·추천 저장·발송을 하지 않는다.
  검색 SQL 실행, source capture, global capacity 대기, rerank/presentation/commit은 이 모드의
  시간에 포함되지 않는다. component 합계를 end-to-end 속도 개선으로 주장하지 않는다.
- 사용자가 QA 채널 전송을 승인한 경우에만 검토된 preview를
  `harper_beta/scripts/postMatchingQaWorkObjects.ts`로 전달한다. native Work Object builder와
  native Slack post helper를 사용하며 최신 실제 토큰의 카드 권한과 고정 QA channel/team을 확인한다.
  로컬 intro ID에는 결정 동작을 제공하지 않고 실제 회사 채널·DB·후보자 연락을 변경하지 않는다.
  기존 receipt는 유지하고 전송 결과·카드 fallback·시각 확인을 새 private run에 기록한다.
- Shared fit 지연 측정은 pair 중복 lock과 실제 모델 호출 capacity를 별도로 기록한다.
  캐시 조회는 global 모델 slot을 사용하지 않으며, 신규 평가의 전역 동시 상한 5개는 유지한다.

### 2026-10-09 지연·Slack 상태 표기 확인

동일 frozen v1 6쌍은 6/6 통과, 2차 3쌍, 28.22초다. 실제 Aeolo 입력의 별도 component replay는
67쌍 전부 평가됐고 planner 116.47초, fresh fit 326.34초였다. 이 fit 시간에는 한 행의
필드 오류로 정상 15행까지 다시 계산한 124.11초 재호출이 포함된다. 이후 부분 repair 변경은
동일 오류 응답에서 정상 15행을 그대로 보존하고 한 쌍만 20.30초에 수정하는 것으로 확인했다.
67쌍 전체 또는 end-to-end 실행을 부분 repair 변경 뒤 다시 측정한 시간으로 해석하지 않는다.

현재 두 언어 Slack writer는 22.59~29.11초였다. 회사 선추천 이름 앞 `☘️`, 연결 대기 이름 앞
`✅`를 prompt에 반영했고 전체 원문을 읽었다. 권한이 최신인 QA team의 native token과 실제
Work Object builder/post helper로 지정 QA 채널에 미리보기 10메시지·5카드를 전송했다.
API receipt와 카드 attachment를 확인했으며 회사 DB·원래 회사 채널·후보자 연락은 변경하지 않았다.
로컬 후보 ID의 결정 동작은 검증 대상이 아니다. Slack 화면은 로그인 세션 만료로 직접 확인하지 못했다.

실제 토큰의 `auth.test` 권한 확인 결과 Sierra·Wonderful은 카드 권한이 있고, Aeolo·Aleph Kids·
Moss·NARWHAL PROJECT·SBVA·vooy·가우디오랩은 links 권한 재승인이 필요하며 Config는 미연결이다.
저장된 scope snapshot만으로 권한을 판정하지 않았다. 원래 QA 전송은 카드 metadata를 생략한
text 전송이며 QA bot 역시 links 권한이 없었다. Workspace별 재승인 문제와 QA 전송 누락을 구분한다.

공유 cache 조회가 전역 모델 capacity를 기다리지 않는 것과 fresh 평가의 상한 5개 유지도
실제 localhost PostgreSQL로 확인했다. 관련 worker 222개(+8 subtests), Slack card/billing notice
47개 검사가 통과했다. 모델·reasoning·completion 상한, 기존 fit cache 의미는 유지했다.
이 결과는 배포 완료나 독립 추천 품질 gate 통과를 뜻하지 않는다. 자세한 원문·receipts·manifest는
ignored owner-only `runs/slack-latency-followup-20261009/`에만 보존한다.

같은 원본의 후속 writer-only run `aeolo-writer-bullets-v5`에서는 Slack 작성 호출 제한을
180초로 늘리고 후보자별 소개에 bullet을 쓰면 핵심 1~2개만 짧게 작성하도록 prompt를 조정했다.
한국어·영어 × 회사 선추천·연결 대기 4회는 모두 완료됐고, 실제 요청의 제한은 모두 180초였다.
전체 소개 10개를 원문으로 검토했다. Bullet을 쓴 8개는 모두 2개씩이고 나머지 2개는 줄글이며,
이름 앞 상태 표시·입력의 공개 근거·경로별 다음 행동이 유지됐다. 호출 시간은 14.04~35.70초다.
관련 검사 21개와 syntax/diff 검사가 통과했다. 의미 기반 후처리·DB 쓰기·Slack 전송·배포는 없고,
한 회사의 고정 입력에 대한 구현자 검토이므로 독립 품질 gate나 전체 실행 성능으로 해석하지 않는다.

## 실제 입력을 보는 노트북 실행 (inspection-v1)

2026-10-08 누적 검색 변경의 inspection은 새 검토와 재평가 retrieval을 각각 기록·재개하며, 병합 목록의 실제 평가 허용 role IDs를 보존한다. 운영 read-only 모드에서는 embedding cache와 fit 만료 갱신도 쓰지 않는다. 읽기 전용 semantic reader를 쓰고 모델/SQL 결과만 관찰한다. 격리 snapshot 모드의 정상 쓰기와 구분하며 새 추천·발송은 계속 차단한다.

2026-10-08 상한 방향·명시적 요청 변경은 기존 두 역할의 원래 retrieval pool을 고정한 새 격리 run에서 확인했다.
Shared fit 300쌍·205쌍은 정식 cache로 재사용하고 실제 일반/요청 rerank·live guard·회사 소개/Slack writer를 실행했다.
연결 대기 상한은 회사 선추천·명시적 검토 요청을 막지 않으며 새 후보자 선추천에만 적용하는 것을 관찰했다.
당시 연결 대기 값은 각 run의 snapshot을 따른다. 과거 run을 같은 수치로 소급하지 않는다.
소개 문구의 원문·공개 경력 근거·요청 언급·강조/목록과 입력은 ignored owner-only runs에 보존했다.
추천 저장·회사 Slack·후보자 연락은 실행하지 않았다. 이 정성 검토는 구현자의 검토이며 독립 gold나 반응률 평가가 아니다.

- 목적/단위: 온보딩 완료 후보자 한 명 × 현재 전체 활성 내부 역할의 1·2차 fit, 또는 내부 역할 한 개의 실제 검색 → 기존 pool 병합 → fit/cache → 일반/우선 검토 rerank → live guard를 관찰한다. Gold가 없는 탐색 실행이며 기존 frozen v1을 변경하지 않는다.
- Canonical runner: `harper_worker/llm_evals/unified_talent_role_fit/inspect_matching.py`. `onboarding --email <정확한 가입 이메일> --output <새 runs 경로>` 또는 `role --role-id <ID> --output <새 runs 경로>`. 노트북은 이 runner를 별도 프로세스로 호출한다. 계정 초기화는 이 runner와 노트북의 Run All에 포함하지 않는다.
- 실제 코드 계약: `assess_pairs`, `evaluate_pairs`, `run_claimed`를 직접 호출한다. 해당 함수의 모델, prompt, 텍스트 formatter, cache fingerprint/TTL, SQL planner/retrieval, 합쳐진 pool, hard guard, compact/rerank를 복사하거나 새로 구현하지 않는다. 별도 프로세스의 scoped adapter가 DB publication을 메모리로 바꾸고, Behavior builder는 기존 `dry_run=True`를 사용한다. 후속 reader는 같은 메모리 fit/Behavior를 읽는다. 모든 DB 연결은 canonical read-only helper 또는 retrieval의 기존 read-only SQL executor다.
- 실행 차이: 후보자/역할 write lock과 영속 저장을 생략한다. 회사별 실행은 사용자 요청대로 `is_company_first_search=true`, 회사 제안 허용을 해당 실행에서만 적용한다. 명시적 Run Search의 company-first-only 모드가 아닌 정기 mixed-route다. 운영 DB 설정은 수정하지 않는다. 실제 live guard 다음, 소개/criteria writer·추천 저장·발송 전에 종료한다. 조회 중 원본이 변할 수 있으므로 역사적 snapshot이라고 주장하지 않는다.
- 입력/출력: 호출별 system/user 원문, raw response/repair/fallback/usage, 두 단계의 pair별 출력, 원본 pair 입력, cache 비교, 검색 SQL/명수, priority 요청 현황, rerank/guard 결과를 저장한다. 1차 제외는 2차 미실행으로 표시한다. cache hit는 새 LLM 판단과 구분하며 과거 1차 원문이 없으면 없다고 표시한다.
- 재현: 매 실행 새 디렉터리를 사용한다. manifest에 dirty checkout의 실행 소스 hash와 복사본, 설정·provider/model, 실행 시각/대상/override를 보존한다. 살아 있는 DB를 재조회하면 다른 데이터 버전이므로 새 실행이다. 동일 입력의 완전한 offline replay 및 human gold는 이 inspection의 범위가 아니다.
- privacy/provenance: 사용자가 지정한 실제 계정/역할의 확인을 승인한 실행이다. 원문은 ignored `runs/` 안에만 저장하고 디렉터리 0700, 파일 0600을 적용한다. 모델 provider/endpoint/data-collection 설정은 운영 client를 그대로 사용하며 이 도구가 공급자의 보관 설정을 바꾸지 않는다. raw artifact를 git에 넣지 않는다.
- 지표/gate: 역할 coverage, fresh/cache/stale/error 수, 1·2차 명수, 일반/우선 rerank 명수, 추천 방향, 지연/기록된 비용을 표시한다. 읽기 전용·발송 차단 및 stage 원문 보존을 회귀 검사한다. 결과가 존재한다는 사실은 추천 품질이나 출시 gate 통과의 근거가 아니다.

### 2026-10-07 실제 DB 호환 확인과 격리 실행

실제 연결 DB에서 `talent_opportunity_fit.fit_contract_version`이 없어서 현재 통합 runner가 실패했다.
따라서 이 inspection은 운영 schema를 바꾸지 않고 로컬 PostgreSQL의 전용
`harper_matching_inspection` DB에서 실행한다. 이 사실은 구현/운영 반영 상태를 구분하는 발견이며,
운영 마이그레이션을 적용했다는 뜻이 아니다.

- Snapshot capture: `harper_worker/llm_evals/unified_talent_role_fit/inspection_database.py`.
  운영 읽기는 canonical `connect_read_only`만 사용하고 COPY 전에 read-only transaction을 확인한다.
  검색 모집단의 실제 검색 데이터, 관련 테이블의 column/PK 계약과 원문 COPY를 보존한다.
  대화·이메일·활동 이력은 실제 pool에 들어간 후보자만 후속 capture한다.
  쓰기는 localhost의 지정 DB 이름만 허용한다. 사용하지 않는 vector column은 제외 사실을 manifest에 남긴다.
- 로컬에는 `20261007120000_unified_talent_role_fit.sql`,
  `20261007122000_unified_matching_selection.sql`을 적용한다.
  이 모드에서는 **실제 `assess_pairs`의 lock, fit 저장, Behavior 저장, cache 재사용**까지 실행한다.
  조회용 메모리 publication만 사용하는 위 read-only 모드와 구분한다.
  검색과 rerank는 계속 `run_claimed`를 직접 호출하고 최종 guard 뒤 멈춘다.
- CLI에 `--snapshot-directory <private 경로> --local-database-url <localhost URL>`을 함께 추가한다.
  최초 실행은 후보별 정보 capture를 포함하므로 모델 inference 시간만을 뜻하지 않는다.
  일부 index·RLS·권한 및 전체 production FK topology를 복제하는 테스트는 아니며 배포 검증으로 해석하지 않는다.
- 온보딩의 **최종 선택까지** 보려면 `onboarding --rerank`를 추가한다. 실제 `select_for_talent`를
  호출하며 같은 로컬 DB에 inspection discovery run과 selection review만 남긴다. 운영 DB와
  추천·발송 경로에는 쓰지 않는다. 이 옵션이 없는 기존 온보딩 inspection은 fit까지만 실행한다.
  후보자 최종 선택의 입력 자격은 유효한 현재 계약의 2차 fit이며,
  `roleFit`·`candidateFit`·`companyFit` 중 하나라도 `bad` 또는 `unfit`이면 rerank 입력에서 제외한다.
  세 축 모두 `perfect`·`good`·`worth_considering`인 역할은 최종 비교 대상으로 남는다.
  원래 fit 기록을 유지한 채 노트북 config의 `rerank_result`로 추가 실행을 연결할 수 있다.
- 노트북: `harper_worker/llm_evals/unified_talent_role_fit/matching_inspection.ipynb`.
  `HARPER_MATCHING_INSPECTION_CONFIG`에 ignored run의 `config.json` 경로를 지정한다.
  기본 `RUN_LIVE=False`는 저장된 결과만 읽는다. `True`는 새 결과 폴더로 실제 함수를 재실행하며
  기존 로컬 fit 캐시를 사용한다. `build_inspection_notebook.py --config <경로>`는 실행된 private 노트북과
  검색 가능한 offline HTML을 만든다. 원문 system/user 입력은 JSON string escape 대신 실제 줄바꿈으로 표시한다.
- 계정 초기화는 사용자가 정확한 이메일을 확인한 뒤 별도 일회성 작업으로만 수행했다.
  추천/피드백/fit/연결된 전달·진행 기록을 transaction backup 뒤 제거하고 프로필·온보딩·Brief·Memory는 보존한다.
  재실행 셀에 삭제 기능은 없다. 과거 일반 대화/Memory를 전부 지운 신규 가입 계정으로 해석하지 않는다.

### Role inspection의 중단 재개와 검색 수정 검증

- `role --continue-from <기존 private run>`은 당시 planner 결과·SQL 회수 목록·병합 목록만 고정한다.
  현재 eligibility, 원본 입력, 실제 evaluator의 cache/fit와 compact/rerank/live guard는 다시 실행한다.
  이미 계산한 fit은 로컬 DB의 정식 cache 계약으로만 재사용하며 과거 LLM 출력을 임의로 주입하지 않는다.
  운영 Worker의 장애 복구 기능을 뜻하지 않는다. 새 manifest에는 원본 run과 실행 소스를 보존한다.
- `--retrieval-only`는 실제 SQL 검색과 현재 hard guard 뒤 종료한다. Fit·rerank를 완료했다고 표시하지 않는다.
- `--continue-from ... --reexecute-retrieval`은 기존 실제 planner의 마지막 전체 출력 JSON을 현재 SQL 검사기로
  다시 검증하고 실제 SQL·pool 병합을 실행한다. 새 planner LLM 호출과는 구분한다. 후보 UUID replay와도 구분한다.
- 로컬 snapshot은 검색 테이블의 실제 운영 index 정의를 가능한 범위에서 복제하고 `ANALYZE`한다.
  제외한 vector 컬럼 때문에 만들 수 없는 index는 private `retrieval-indexes.json`에 기록한다.
  전체 운영 성능·RLS·FK 재현의 주장은 유지하지 않는다.
- 일반 회사/후보자 추천 rerank는 세 축 중 하나라도 `bad`/`unfit`이면 입력에서 제외한다.
  후보자의 명시적 우선 검토 요청은 낮은 fit도 별도 회사 검토 pool에 남는다.
  다만 실제 허용되는 actionable route가 없는 pair는 compact LLM에 보내지 않는다.
  Compact는 회사·역할의 현재 Hiring Brief와 설명, 각 후보의 전체 Profile/Brief/Behavior,
  1차 결과만 있는 요청의 screening reason도 읽는다.
- 지표는 SQL repair/fallback, 회수/병합/eligible 수, 현재 fit coverage·cache·오류,
  일반/우선 pool과 최종 선택·guard 탈락 수다. 선택자·경계 후보·1차 제외자의 근거는 사람이 직접 비교한다.
  이 검토는 독립 gold나 실제 추천 반응률 평가를 대체하지 않는다. 원문과 개인별 검토는 ignored runs에만 둔다.
- `--timeout-seconds`는 inspection 프로세스의 모델 요청 제한만 바꾸고 manifest에 기록한다.
  운영 timeout은 변경하지 않는다. 진행 중 호출은 private `active-calls/`에 남기며,
  중단 전 돌아오지 않은 provider 호출의 비용은 알려진 usage와 구분한다.
- `RunView.export_text()`는 같은 private run에 짧은 결과 요약, 전체 pair의 fit TSV,
  일반/우선 rerank 결정 TSV, 실제 rerank 입력·출력 원문을 owner-only로 저장한다.
  화면이나 브라우저를 열지 않아도 단계별 원문을 확인할 수 있다.
- 테스트 오염이 확인된 계정은 inspection의 정확한 ID exclusion으로 제외한 별도 run을 만든다.
  원래 실행과 데이터는 덮어쓰지 않고 원본 프로필도 수정하지 않는다.
  적용한 exclusion ID는 private manifest의 `evaluationOverrides.excludedTalentIds`에 기록한다.
- 2026-10-08 지정 역할의 원래 retrieval pool을 실제 fit/rerank/live guard까지 완료했다.
  검색 prompt/SQL alias 검사를 보완한 새로운 query는 retrieval-only로 확인했으므로,
  새 query의 모집단까지 fit/rerank 품질이 검증됐다고 해석하지 않는다.
  같은 원래 pool의 후속 rerank에서는 수행 근거와 회사가 요구한 수준을 함께 연결하고,
  알려진 핵심 부족을 단순한 회사 확인 사항으로 바꾸지 않는 공통 evidence 계약을 보완했다.
  모델이 재실행에서 경계 후보를 다르게 고른 사실도 보존하며, 소규모 정성 검토를 정확도로 환산하지 않는다.

### 실제 회사용 메시지 확인

- 2026-10-08 추가 로컬 검증: 회사가 만나보고 싶은 후보자를 대화에서 요청하면 Harper가 대신 제안을 보낸다는 intro 안내로 변경했다. 저장된 공개용 preview를 실제 writer로 재생한 한 사례에서 해당 행동을 확인했다. 발송·DB 접근은 없다. 기존 frozen history challenge의 route 2/4 실패와 writer 미호출도 별도로 기록했다. [변경·검증·한계](reports/2026-10-08-company-request-intro-cta.md).

- 같은 canonical runner의 `message --from-run <완료된 local role run> --output <새 private run>
  --channel-id <검증 채널> --local-database-url <격리 DB>`는 저장된 최종 회사 방향 선정만 읽는다.
  실제 `write_presentations`와 `write_channel_bundles`를 호출하고 원문 입력·응답·최종 Slack text를 보존한다.
  프로필·역할·기준은 저장된 입력이며 새 검색이나 실제 회사 후보 등록을 뜻하지 않는다.
- DB는 읽기 전용이고 추천·intro·outbox·대화 저장과 발송은 하지 않는다.
  첫 회사 전달 여부는 캡처된 DB의 기존 전달 사실을 실제 helper로 읽는다.
  추적 파일 충돌을 피하기 위해 모델 요청만 순차 실행하며 지연을 운영 성능으로 해석하지 않는다.
- 원문은 ignored runs의 owner-only 파일이다. 검증 채널 발송은 별도의 명시적 사용자 지시가 있을 때만
  지정 채널로 수행하고 실제 발송 receipt를 같은 private run에 남긴다.
  원래 company workspace의 후보 ledger나 채널 routing 설정을 변경하지 않는다.
- 2026-10-08 회사용 문구 검토에서 언어 수준과 프로젝트 성과를 원문보다 강하게 표현한 첫 출력을
  발송하지 않고 보존했다. 실제 presentation prompt의 근거 범위 계약을 보완한 새 run을 검토한 뒤
  사용자가 지정한 검증 채널에 미리보기로 발송하고 읽기 확인 및 receipt를 남겼다.
  의미 기반 후처리는 추가하지 않았으며, Slack markup 변환은 전송 형식에만 적용했다.
  이 검토는 독립 gold 평가나 추천 반응률 개선의 증거가 아니다.

합성 challenge `v1`, 2026-10-07. 새 공통 evaluator의 1차 통과, 2차 세 축·두 이유·드문 missingInfo를 검증한다. 추천 반응률이나 운영 모집단 성능을 추정하는 평가는 아니다.

## 고정 입력과 gold

`cases-v1.json`은 개인·회사 식별자가 없는 합성 6쌍이다. 실제 모델 실행 전에 기대값을 작성했다. 평가 단위는 pair이며 명백한 제약 충돌, 직무 전환, 상호 수준 불일치, 현실적인 미확인 조건과 회사 정책의 불확실성을 포함한다. 기대 축의 허용 집합과 1차 통과 여부를 구조적으로 채점하고 이유·질문의 적절성은 원문을 사람이 검토한다. 독립적인 사용자 gold 승인은 아직 없다. 예제를 운영 분기나 키워드 규칙으로 옮기지 않는다.

## 실행 계약

Canonical runner: `harper_worker/llm_evals/unified_talent_role_fit/eval.py`. 운영 `opp.matching.fit.evaluate_pairs`의 prompt·batch·parser·repair를 직접 사용한다. DB 연결·추천 저장·연락 발송을 하지 않는다. 모델은 checkout의 `INTERNAL_FIT_PREFILTER_CALL` / `INTERNAL_FIT_EVALUATION_CALL` 설정 그대로이며 실제 provider/model/reasoning/temperature/maxTokens/fallback, 원문 결과, 호출 비용과 지연을 run manifest에 기록한다. Provider timeout은 운영 client 설정을 따른다.

모델 입력은 `opp.matching.text`와 `opp.utils.llm_input_text`의 별도 읽기용 문서다.
Profile·전체 Brief·Behavior·역할별 근거와 pairRef를 제목·목록으로 표현하고
native user message의 문자열로 전달한다. 날짜 정밀도·미제공 정보·여러 줄 근거를 보존한다.
저장/출력 계약과 frozen fixture는 그대로이며, 입력 표현 변경은 새 run으로 비교한다.
Manifest에는 입력 표현 version과 formatter/transport의 실제 소스 hash도 기록한다.

```sh
cd harper_worker
venv/bin/python llm_evals/unified_talent_role_fit/eval.py
```

## 지표·gate·보안

- 응답 pair coverage, gold 계약 충족 수, 1차 false rejection, 2차 호출 pair 수, 비용, 지연.
- 이 challenge의 release gate는 구조/coverage 오류 0, 명확한 조건 충돌 누락 0, 직무 전환 단독 탈락 0, 무의미한 missingInfo 0. 이 6쌍 통과만으로 전체 배포 가능 판정을 내리지 않는다.
- 전체 입력은 합성이므로 production PII 전송은 없다. 원문 응답은 registry의 gitignored `runs/`에 owner-only로 저장한다. API key는 출력하지 않는다.
- 동일 입력을 새 모델/prompt로 실행할 때 gold는 유지하고 새 run을 만든다. 입력/기대값 변경은 새 dataset version이 필요하다. 실행 전 파일 hash와 소스 hash를 manifest에 남긴다.
- 비용 절감과 실질 추천 반응률은 별도의 실제 데이터 평가가 필요하다. 6쌍은 대표 random sample이 아니다.

## 연락 준비 challenge contact-v1

`contact-cases-v1.json`은 첫 실행 전에 작성한 별도 합성 입력/gold 2건이다. 50개의 부족 정보와 과거 연락 11개를 가진 후보자, 특정 역할에만 이전 예외를 준 후보자를 다룬다. 평가 단위는 한 후보자의 연락 준비이며, 평가 대상은 공통 fit 결과를 후보자 연락 판단에 넣을 만큼 좁히는 과정이다.

Canonical runner는 `harper_worker/llm_evals/unified_talent_role_fit/eval_contacts.py`다. Production `contact_information`의 batching·prompt·parser를 그대로 사용하며 DB reader/cache만 고정 fixture로 대체한다. 원본 LLM의 답변 해석, 최종 이메일 문장, 실제 발송은 이 평가에 포함하지 않는다. 운영 `INTERNAL_FIT_PREFILTER_CALL` 모델/timeout/repair 계약을 사용하고 config·입력/소스/prompt hash·usage·지연을 manifest에 기록한다.

Machine gate는 이미 물었던 조건과 명시 거절 범위의 역할 재선택 0, 새로 답할 가치가 있는 보상 조건의 범위 보존, 묶음 수 상한이다. 조건을 묶은 이유와 범위·재질문 여부는 원문 전체를 별도로 읽어 검토한다. 금지어·문장 패턴 검사로 의미를 판정하지 않는다. 모든 입력은 합성이며 원문 출력은 ignored `runs/`, owner-only다. 독립 human gold 검토가 없는 작은 challenge이므로 모든 질문 경험의 통과 판정으로 확대하지 않는다. Input/gold 변경은 새 버전, 모델·prompt 변경은 같은 세트의 새 run이다.

## 2026-10-07 추가 재실행

`20261007T092816.294545Z`: 동일 frozen v1 6쌍, gold 범위 6/6, 2차 호출 3쌍, 전체 29.33초,
추정 API 비용 $0.02542312. 전체 이유를 읽어 명시적인 이전 거부, 역할 수준·보상 불일치의 1차 제외,
PM 전환 증거 보존, 답변 가치가 높은 이전 조건의 missingInfo를 확인했다. 모델·gold는 변경하지 않았다.
이 결과는 독립 gold 검토나 실사용자 추천 반응률 개선의 증거가 아니다.

## 2026-10-07 읽기용 텍스트 입력 재실행

Frozen fixture/gold와 모델은 유지하고 입력 formatter 및 provider 전송을 변경했다.
최종 코드 실행 `20261007T101601.215819Z`는 fit 6/6, 2차 3쌍, 32.75초,
추정 비용 $0.02242762다. `contacts-20261007T101601.210082Z`는 질문 준비 2/2,
36.70초, $0.00205378다. 두 실행의 원문을 Codex가 검토했다.
명시 제약·수준/보상 충돌의 제외, PM 전환 근거 보존, 미확인 이전 의향만 missingInfo로 남기는
판단이 유지됐다. 부족 정보 50개와 과거 질문 11개 사례에서는 이미 물었던 이전 조건을
다시 고르지 않고 국내 역할 5개의 보상 조건만 하나로 묶었다. 역할별 예외를 일반 이전 의향으로
확장하지 않은 사례도 확인했다. 독립 human review나 운영 추천 반응률 검증은 아니다.

Formatter 최종 호환 보완 전 실행은 `20261007T101402.459892Z`(fit 6/6),
`contacts-20261007T101402.454509Z`(contact 2/2)로 별도 보존한다.
추가 보완은 기존 Career profile의 `start`/`end`와 공통 fit profile의
`startDate`/`endDate`를 동일한 경력 기간 표현으로 읽는 입력 호환 처리다.
입력/transport/매칭 단위 검사 97개도 통과했다. 실제 후보자·회사 데이터 조회,
fit 저장·추천·발송·배포는 하지 않았다.
