Harper Beta + Worker 성능 개선 종합 계획 (체감 속도 우선)
요약
산출물 위치: harper_beta/agents/CHAT_AND_PLATFORM_PERFORMANCE_PLAN_KO.md (단일 문서)
목표: 사용자 체감 지연(검색/채팅/결과 보기)과 불필요한 리렌더/중복 I/O를 먼저 줄이고, 이후 워커-검색 파이프라인 구조를 단계적으로 개선
범위: harper_beta(프론트 + Next API) + harper_worker(큐 소비, SQL, 리랭킹, 요약)
전략: 빠른 개선(1~2주) → 중간 구조개선(2~4주) → 대형 개편(4~8주)
현재 병목 핵심 진단
채팅 스트리밍 중 setMessages가 청크마다 전체 메시지 배열 갱신되어 렌더 부하가 큼.
runs_pages 실시간 이벤트마다 infinite query 전체 invalidate로 페이지/후보 재조회가 과도함.
검색 실행 시 메시지 조회/파싱/run 생성이 중복 round-trip.
결과 조회가 “최신 runs_pages 1행 전체(candidate_ids 전체)”를 반복 읽는 구조라 page 전환 시 비효율적.
useLogEvent, useCredits 등에서 인증/조회 호출이 잦아 UI 상호작용마다 추가 지연 발생 가능.
워커에서 LLM 호출마다 OpenAI client를 매번 생성.
워커 polling 기반 큐 소비(1s sleep)로 평균 시작 지연과 DB 폴링 비용이 존재.
워커 rerank 중 DB write 빈도(upsert/commit)와 flush 단위가 작은 경우 오버헤드가 큼.
공개 API/인터페이스/타입 변경 사항
신규 API 추가: POST /api/search/launch
입력: { queryId, messageId }
동작: criteria 파싱 + run 생성 + 초기 상태 응답을 단일 호출로 처리
출력: { runId }
기존 훅 인터페이스 변경: runSearch(...)가 내부에서 메시지 재조회하지 않도록 단순화.
검색 결과 조회 API 추가(권장): GET /api/runs/{runId}/pages/{pageIdx}
서버에서 candidate_ids slice + candid join 처리 후 반환
실시간 이벤트 payload 경량화: runs_pages 전체 invalidate 대신 run_progress(count/percent/status) 채널 또는 테이블 도입.
타입 보강:
RunProgress 타입 신설 (current, total, percent, status)
ChatMessage 키에 id 안정 사용(렌더 key 전략 명시)
실행 계획
Phase 0: 기준선 계측 (필수 선행, 2~3일)
지표 정의:
T_search_start: 검색 버튼 클릭 → run row 생성까지
T_first_result: 검색 클릭 → 첫 결과 카드 렌더
T_chat_stream_commit: 토큰 스트리밍 중 React commit 간격/프레임 드랍
T_worker_queue_wait: run queued_at → STARTING
T_worker_total: STARTING → FINISHED
로그/측정 지점 추가:
프론트: ChatPanel, Result 페이지, run launch 호출 지점
API: search/create/launch, chat routes
워커: claim 시각, variant별 SQL/실행, rerank flush
Phase 1: 빠른 개선 (체감 속도 우선, 1~2주)
채팅 렌더 최적화:
스트리밍 업데이트를 requestAnimationFrame 또는 50~100ms 배치로 묶기
ChatMessageList key를 id 기반으로 고정 (idx 제거)
extractUiSegments 반복 파싱 최소화(증분 처리 또는 throttle)
불필요한 invalidate 제거:
runs_pages 실시간 수신 시 전체 invalidate 대신 현재 페이지 데이터만 setQueryData로 패치
useRunDetail에서 매 이벤트 refetchQueries 대신 상태 필드만 부분 반영
검색 실행 왕복 축소:
/api/search/launch로 messages 조회 + criteria 파싱 + runs insert 단일화
onClickSearch의 메시지 조회 중복 제거
인증/조회 경량화:
useLogEvent에서 매 호출 supabase.auth.getSession() 제거, store/session 재사용
useCredits query key를 userId 포함으로 변경, window focus refetch 정책 완화
저위험 코드 정리:
미사용/중복 훅(useSearchChatCandidates vs useStartSearch) 정리
useAutomationResults의 로컬 isLoading 상태 제거(react-query 상태와 단일화)
Phase 2: 중간 구조개선 (2~4주)
결과 페이지 데이터 경로 개편:
클라이언트가 runs_pages 전체 candidate_ids를 계속 읽지 않도록 서버 페이지 API 도입
pageIdx 단위로 정확히 필요한 10개만 조회
진행률 채널 분리:
rerank 진행률은 current/total만 송신하도록 경량화
후보 상세 데이터 스트리밍과 진행률 스트림 분리
후보 카드 렌더 안정화:
summary JSON 파싱 위치를 렌더 함수 밖으로 이동(쿼리 select 후 normalize)
카드/테이블 공통 파생값을 selector 단에서 계산
랜딩/보조 트래픽 최적화:
랜딩 로그 이벤트를 배치 또는 sendBeacon으로 비동기 전송
반복 삽입 이벤트의 샘플링/쿨다운 강화
Phase 3: 대형 개선 (4~8주)
워커 큐 모델 고도화:
polling 중심에서 이벤트 기반(LISTEN/NOTIFY 또는 잡 큐)으로 전환
run claim 지연 단축, DB polling 부하 감소
워커 LLM 호출 효율화:
llm.py에서 client 싱글톤/재사용
variant SQL 생성/수정 프롬프트 캐시 전략 적용
summary 생성 실패 재시도 정책/백오프 정교화
rerank write 전략 개선:
runs_pages 업데이트 배치 크기/주기 재조정(예: 20→50 또는 시간기반 flush)
summary upsert와 page upsert 트랜잭션 단위 최적화
검색 아키텍처 고도화:
precomputed feature 테이블(경력/학력/키워드 벡터) 도입 검토
SQL 생성 실패시 fallback 비용이 큰 경로를 규칙 기반 1차 필터로 완충
테스트 케이스 및 검증 시나리오
채팅 스트리밍:
2분 이상 장문 스트리밍에서 CPU/메모리/프레임 드랍 측정
메시지 200개 스레드에서 스크롤/입력 지연 측정
검색 실행:
검색 시작 클릭 후 run 생성까지 P50/P95 비교(개선 전후)
run 진행 중 페이지 전환 시 추가 네트워크 요청 수 비교
실시간 업데이트:
reranking 중 runs_pages 이벤트 폭주 상황에서 UI 끊김/중복 refetch 확인
워커 처리:
동시 run 1/5/10개에서 queue wait, total latency, DB 쿼리 수 측정
LLM 일시 실패/DB timeout 시 재시도 및 상태 전이 검증
회귀:
크레딧 차감 1회 보장(idempotency)
STOPPED 상태 전이와 재개 불가 조건 확인
기존 billing/scout 흐름 기능 회귀 테스트
수용 기준(성공 기준)
검색 클릭 → 첫 결과 표시 P95 30% 이상 단축.
채팅 스트리밍 중 React commit 횟수 40% 이상 감소.
결과 페이지 네트워크 요청 수(실시간 이벤트 구간) 50% 이상 감소.
워커 queue wait P95 40% 이상 단축.
오류율(검색 실패/중단 제외 비정상 오류) 기존 대비 악화 없음.
가정 및 기본값
문서는 단일 파일로 harper_beta/agents에 작성한다.
우선순위는 “체감 속도”이며, 비용 최적화는 2순위로 병행한다.
DB 스키마 변경(신규 테이블/인덱스)은 Phase 2 이후 배포 창구에서 적용 가능하다고 가정한다.
기존 RLS/권한 정책은 유지하고, API 경량화는 권한 모델을 깨지 않는 방식으로 진행한다.
한국어 사용자 기준 UX를 유지하며, 영문 로케일은 성능 변경의 회귀 테스트 대상에 포함한다.