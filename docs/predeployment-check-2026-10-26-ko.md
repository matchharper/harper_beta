# 2026-10-26 배포 전 보완 기록

웹·Worker 코드는 배포하지 않았다. push·release 교체·서비스 재시작·운영 환경변수 변경·캐시 backfill은 수행하지 않았다.

## 2026-10-26 14:37 KST 후속 점검 — 평가 원장 통합 이후

이번 후속 점검은 운영 DB 읽기 전용 조회, 로컬 코드 추적·격리 테스트·타입 검사·빌드와 서버 상태 확인이다. 아래 과거 운영 수치는 당시 기록이며 현재 상태는 이 절을 우선한다. 실제 모델 호출·추천·메시지 전달·운영 변경은 하지 않았다.

### 확인 결과

- 온보딩 완료→Opportunity 1·2차→상위 10개 후보에서 선정→11번 Memory 판단→추천 저장의 연결과, 정기 Role 검색→candidate-first review→후보자 주기→11번 판단의 연결을 확인했다. 11번은 `gpt-6.1-sol` high이며 비추천 review는 발송 실패와 독립적인 영수증으로 종료한다.
- 운영 DB의 실제 유료 Role·기존 Behavior Context가 있는 후보자 한 쌍을 메모리 안에서 읽어 두 입력 로더의 전체 객체와 fingerprint 일치를 확인했다. 원문·식별자는 보고서나 새 파일에 저장하지 않았다. `transaction_read_only=on`을 확인했고 새 스케줄러의 실제 SQL도 운영 스키마에 `EXPLAIN`하여 정상 해석을 확인했다. 이 조회는 모델 판단 품질이나 실제 발송 성공 검증이 아니다.
- 공통 평가 원장 2,318행, `worker_behavior_v1` 0행이다. DB 준비와 새 Worker 운영 활성화는 구분한다. 기존 migration은 재적용하지 않는다. 후속 DB 적용 이력은 `20261026044735`(후보자 연락 주기), `20261026052249`(공통 평가 원장)다.
- 관련 Worker 테스트 226개(+10 subtests), 상위 10개·레거시 캐시 테스트 15개, 웹 테스트 45개 통과. 타입 검사와 `next build --webpack`의 컴파일·타입·407개 정적 페이지·trace 수집을 완료했다.
- 처음 추가 검증에서 실패한 스케줄러 테스트 8개는 DB 없는 fixture가 새 follow-up 테이블 조회를 mock하지 않은 문제였다. 해당 의존성만 fixture에 명시하고 기존 검증을 유지했다. 이전 보고의 레거시 캐시 테스트 1개는 공용 `fetch_all` mock이 수락 후보 조회에도 적용돼 캐시 후보 전원을 수락 후보로 취급한 문제였다. 수락 후보가 없는 fixture를 명시해 동일 assertion이 통과했다. 제품 코드는 변경하지 않았다.
- 웹 회사 선정 테스트는 독립 실행 시 필요한 환경값과 `server-only` 표시 모듈 처리 누락이었다. 합성 키·localhost URL·서버 표시 모듈만 제공한 임시 preload로 실행해 5개 모두 통과했다. 실제 provider 호출과 DB 쓰기는 없다.
- 운영 Opportunity scheduler와 회사 검색 scheduler/worker는 active다. Opportunity release와 회사 검색 두 서비스의 고정 실행 경로는 모두 `d7c220eb08447b9ef406bffb01f2ca9e476ca8ef`다. Opportunity 슬롯은 `Restart=no`, 종료 제한은 `infinity`다. 점검 중 실제 Opportunity 작업 2개가 실행 중이고 7개가 대기 중이었다. 배포 시에는 다시 확인한다.
- 서버 디스크 여유는 현재 약 23 GiB다. 앞선 1.4 GiB 기록은 더 이상 현재 값이 아니다. 주요 API 키·DB 연결·내부 인증 설정은 존재했고 값을 출력하거나 저장하지 않았다. `company_update`의 failed/queued/running 보류 작업은 조회 시 0건이었다.

### 출시 전에 남은 작업

1. **기능 플래그 전환은 불필요하다(후속 사용자 요청 반영·미배포).** `COMPANY_SCHEDULED_AGENTIC_MATCHING`에 따른 Worker의 legacy 분기와 웹의 503 차단을 제거했다. 새 정기 검색과 Role 활성화 첫 검색은 환경변수가 없거나 `false`여도 공통 새 경로를 사용한다. 접수 실패 때 기존 평가로 우회하지 않는다. 웹 endpoint·후속 작업 처리 코드가 먼저 준비돼야 한다. 관련 Worker 86개(+20 subtests)·웹 4개와 타입 검사로 확인했다.
2. **배포 대상 변경을 커밋에 포함하고 서비스별 실행 경로를 전환한다.** 공통 평가 코드와 관련 웹 파일 중 아직 untracked 파일이 있다. release artifact는 커밋 내용만 포함하므로 빠뜨리면 안 된다. 웹 배포 성공을 먼저 확인한 뒤, Opportunity는 불변 release 포인터를 바꾸고 scheduler만 재시작한다. 회사 검색 scheduler/worker는 별도 고정 release 경로를 사용하므로 Opportunity 포인터 변경만으로 업데이트되지 않는다. 각각 진행 중 작업을 보존하고 새 release 경로로 전환한다. 구 Opportunity 작업·release·venv는 완료 전까지 보존한다.
3. **회사 Role 온보딩 기능까지 함께 출시하면 검색 캐시를 준비한다.** `talent_location_facets`와 `talent_profile_chunk_embeddings`가 여전히 0행이고 `harper-role-start-refresh.timer`는 미설치다. 초기 캐시 생성과 정기 갱신 설치가 필요하다. 서비스 초안의 `WorkingDirectory`/알림 경로는 아직 `/home/ec2-user/harper_worker`이므로 설치할 때 실제 불변 release 경로에 맞춰야 한다. 이 준비는 회사 Role 온보딩 검색의 요건이며, 이번 후보자 온보딩 내부 평가 자체의 의존성은 아니다.
4. **배포 직후 새 revision의 실제 실행을 확인한다.** 격리된 검증 계정으로 공통 원장의 양방향 재사용, 후보자 주기에서 11번 실행, 비추천의 영속 종료, 추천의 실제 전달 receipt를 확인한다. 이번 로컬 검증을 운영 전달 완료로 대신하지 않는다. 성공한 배포의 실제 변경 범위에 맞춰 Notion 문서를 동기화한다.

새 migration 추가나 이미 적용한 migration의 재실행은 현재 확인한 추천 흐름의 선행 조건이 아니다. 이 점검만으로 push·배포·환경 전환·서비스 설치/재시작을 승인받은 것으로 해석하지 않는다.

## 코드 보완

- Role Start 응답에 저장된 보상 질문의 answered/skipped 값을 포함한다. 미응답 session은 필드를 생략한다.
- Slack 기준별 평가에 기존 전용 label 함수를 사용해 limited/conflict도 표시한다.
- swipe 테스트의 matchMedia mock과 직무 벡터 테스트의 number 배열 타입을 수정했다.
- 랜딩 통계 실험의 무작위 배정은 Web Crypto를 사용한다. 브라우저 번들에 Node crypto 모듈이 들어가던 빌드 오류를 제거했다.
- 큐 callback 6개를 Request를 받는 POST 함수로 감쌌다. SDK의 Request/event 공용 입력 타입과 Next route 타입 간 충돌을 해소하며 callback·인증·재시도 처리는 유지한다.
- 기본 빌드를 `next build --webpack`으로 변경했다. 로컬 Turbopack은 반복해서 종료 코드 137로 중단됐고 원인은 확정하지 못했다. Webpack 프로덕션 빌드는 컴파일·타입·407개 정적 페이지 생성·trace 수집을 완료했다.

## 운영 DB

프로젝트: `zzojrniuppueizhnmqfd`. 파일 timestamp와 운영 migration version은 다르다. 아래 내용을 재적용하지 않는다.

| 운영 version | 변경 |
| --- | --- |
| 20261026013436 | Role 재개 시 이번 종료로 닫힌 미전달 Intro만 복원하는 함수·트리거 |
| 20261026013702 | matching review의 evaluation_ref |
| 20261026013714 | 회사 평가 원장의 input_contract_version |
| 20261026013716 | 정기 매칭·Role 활성화 즉시 등록의 함수·index·trigger |
| 20261026013901 | Opportunity Decisions 결과 칼럼·호환 제약 제거·우선 검토 함수 |

정본: `20261023000100`, `20261023000200`, `20261023102919`, `20261025061447`, `20261026001247` migration 파일.

- 실제 운영 정의에 없던 `slack_notifications_enabled` 참조를 제거했다. Slack 자격은 기존 채널 활성 및 Role별 opt-out으로 확인하며 이메일 수신 설정도 유지한다. 가상의 칼럼을 추가하지 않았다.
- 우선 검토 함수의 기존 paid Role 조건을 보존했다. 새 migration 초안에서 빠져 있던 권한 경계다.
- 최종 함수 17개의 본문 hash가 로컬 정본과 일치한다. 새 함수의 anon/authenticated 실행 차단·service_role 실행 권한 및 관련 trigger 활성 상태를 확인했다.
- 새 칼럼 3개가 존재하고 이전 정성 평가 CHECK는 제거됐다. 잘못된 activation/delivery 식별자는 false, 존재하지 않는 Role의 inventory는 null을 반환했다.
- 보안 advisor를 전후 대조했으며 새 finding은 없었다. 기존 경고를 이번 작업에서 해소했다고 주장하지 않는다.
- 잠금·정의 오류로 실패한 migration 시도는 롤백됐다. 테이블별 칼럼 추가를 분리한 후 나머지 정의를 적용했다.

### 잠금 충돌 영향

DB 변경 중 잠금 대기가 기존 회사 검색 `d6aa1b37-624b-4d5c-957e-836a1ffa3816`의 평가와 겹쳤다. 첫 실행은 `scoring_failure_rate_exceeded:4/6`으로 실패했으며 선정 0명, matching review 0건, outbox 0건이었다. 사용자는 처음에 실패 기록 유지를 선택했으나, 설명을 들은 뒤 재실행을 명시적으로 요청했다.

2026-10-26 11:26 KST에 해당 실행의 미선정·미전달 상태 및 같은 Role의 후속/진행 중 중복 실행이 없음을 다시 확인하고, 같은 run을 기존 대기열로 복구했다. 이전 오류·시작/종료 시각·결과는 `result.manualRetry`에 보존했다. 11:27 확인 시 아직 queued이며 운영 Worker는 active, 다른 실행의 heartbeat도 갱신 중이었다. 별도 배포나 서비스 재시작은 하지 않았다.

## Worker 운영 확인

- Opportunity 현재 release: `d7c220eb08447b9ef406bffb01f2ca9e476ca8ef`.
- scheduler 및 회사 검색·이메일 reply·Slack agent 서비스가 active였다. Opportunity 슬롯은 최대 6개, Restart=no, TimeoutStopSec=infinity, scheduler와 BindsTo/PartOf 연결 없음이 확인됐다.
- standalone contact worker는 disabled다. 기존 email reply worker의 통합 운영을 유지했다.
- Python 3.9 venv와 email용 Python 3.11 의존성 검사 모두 통과했다. 주요 API 키·DB 연결 설정·내부 worker secret은 존재하며 값은 보고서에 기록하지 않았다. gpt-6-luna 모델 조회는 200이었다. 실제 Decisions 추론·발송 smoke는 수행하지 않았다.
- 디스크 약 1.4 GiB 여유, 메모리 available 약 8 GiB를 확인했다. 실행 중인 release/venv를 정리하지 않았다.

## 배포 시 남은 준비 항목

- 당시 운영 `COMPANY_SCHEDULED_AGENTIC_MATCHING`은 unset이었다. 후속 로컬 변경에서 해당 플래그 의존성을 제거했으므로 배포 시 별도 설정 전환은 필요하지 않다. 웹 endpoint를 먼저 배포한다.
- 운영 `talent_location_facets`·`talent_profile_chunk_embeddings`는 점검 시 0건이었다. `job_title_embeddings`는 13,241건이다. 위치/프로필 캐시 초기 준비와 새 `harper-role-start-refresh.timer` 설치는 아직 하지 않았다. 캐시가 준비됐다고 가정하고 새 온보딩 검색을 출시하지 않는다.
- Worker 배포 시 기존 실행과 구 release를 보존하며 운영 계약대로 전환해야 한다. 이번 점검은 실제 배포·전달 E2E 성공을 뜻하지 않는다.

## 검증과 문서

- 웹 관련 테스트 13개, 랜딩 배정 테스트 3개, Worker 관련 테스트 23개 통과.
- 타입 검사 및 Webpack 프로덕션 빌드 통과.
- DB에서 즉시 효과가 생기는 Role 재개/활성화 동작은 Notion 회사 제품 종합 문서와 Role lifecycle 문서에 반영했다. 새 웹·Worker 미배포 범위를 명시했다.
