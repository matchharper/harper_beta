# 정기 검색 구현의 실제 회사 3곳 읽기 전용 검증 — v1

2026-10-23 사용자 요청. 정기 회사 AI 판단 → 공통 검색/Decisions → 추천 방향 선정 → 공개 설명/Slack 소개문 → 결과 후속 판단을 실제 저장 사실과 실제 모델로 실행한다. DB와 연락 경계는 읽기 전용이며, 결과는 파일로만 수집한다.

- 목적·평가 단위: 활성 정기 검색 Role 하나의 전체 실행. 실제 회사 세 곳에서 한 Role씩 선택한다. 성공 사례를 고르지 않으며 선택 seed와 전체 적격 목록 hash를 private manifest에 보존한다.
- 동결 입력·gold: `scheduled-readonly-v1`, `structural-v1`. Role/criteria/회사 Memory/실제 대화/후보 Profile/전체 Search Brief/Behavior Context와 버전/현재 관계/기존 평가를 최초 capture에 보존한다. 정답 후보 명단은 없다. 성공률이나 통과율을 정확도라고 부르지 않는다.
- 입력: 회사 측은 공개 허용 사실과 간결한 재고만 읽는다. Worker는 `worker_behavior_v1`을 사용하며 후보 raw Memory를 단계별 입력에 넣지 않는다. 같은 후보의 모든 단계가 같은 Behavior Context 버전을 사용한다. 수동 raw-Memory 평가를 같은 입력으로 간주하지 않는다.
- 정본 runner: `harper_worker/llm_evals/company_agentic_role_search/scheduled_read_only.py`; 회사 AI는 `harper_beta/scripts/evalScheduledMatching.ts`에서 실제 `runScheduledMatchingLoop`를 호출한다. 공통 평가·선정은 `opp/matching/scheduled.py`, 공개 설명과 Slack 문구는 기존 writer를 사용한다.
- 설정: 실제 코드의 모델/이유 추론 설정을 사용한다. 회사 AI가 scope/limit/방향별 희망 수량을 선택한다. 평가 동시성 64. 요청/응답/usage/모델/소스 hash/경과 시간을 private run에 남긴다. 새 실행은 새 디렉터리이며 과거 capture·gold·출력을 덮어쓰지 않는다.
- 데이터 출처·개인정보: 운영 DB는 canonical `connect_read_only`만 사용하고 read-only barrier를 확인한다. LLM 계측에는 DB 연결을 주지 않는다. private `runs/`는 git ignored, 디렉터리 0700·파일 0600. 회사 AI의 조회는 동결된 공개 projection으로 제한한다. Slack·메일·큐·추천/평가 저장 API는 호출하지 않는다. 운영과 로컬 DB 모두 쓰기 0이어야 한다.
- 구조 gate: 알려진 ID만 선정, 실제 허용 방향 준수, 평가 실패를 제외로 바꾸지 않음, `evaluated`에서 Decisions 요청 0, 동일 입력 단계 재사용, 평가 전용에서 lifecycle 효과 0, 기존 회사 추천 유지, 수락 소개 인원 cap 없음, 회사 비공개 후보 정보 미노출, 실제 발송 0.
- 의미 검토: 선정 후보의 원문/현재 조건/criteria/방향 근거와 완성 Slack 원문을 직접 읽는다. 잘못된 attribution·미확인 관심·공개 불가 선호·중복 소개·부적합한 quota 채우기를 확인하고 발견한 한계를 보고한다. 구조 gate만으로 좋은 추천이라고 결론내리지 않는다.
- 비용: provider usage 기반 추정과 실제 제공된 비용을 구분한다. 재사용한 단계는 새 호출 수·비용에서 제외한다. 실패 요청 usage 누락은 0원으로 표시하지 않는다. 준비/검색/평가/선정/작성 시간을 분리한다.
- 비용 집계 정본: `harper_worker/llm_evals/company_agentic_role_search/report_scheduled_read_only.py`. 회사 모델의 provider 응답, Worker 호출 trace, Decisions 원본 응답을 읽는다. 최종 trace와 개별 호출 파일을 중복 합산하지 않는다. 폐기·수정한 시도도 별도로 집계하고, 기록 전 중단된 호출 비용은 알 수 없다고 보고한다. 보고서와 토큰 원문은 같은 ignored run 아래에만 저장한다.
- 소개문 수정은 `slack --refresh-presentations <talent-id>`로 동일 동결 원문과 평가를 사용한 새 실행을 남긴다. 선정·Decisions를 재실행하거나 기존 결과 파일을 덮어쓰지 않는다. 최종 run에서 회사 AI가 요청하지 않은 추가 검색의 결과는 최종 추천 수에 합산하지 않는다.
- 한계: 연속 read-only capture이지 전역 MVCC snapshot이 아니다. 실제 DB commit, 동시 실행 잠금, durable 복구, 실제 수신 화면은 이 실행으로 검증하지 못한다. 소개문은 보낼 초안이며 발송 완료가 아니다. 세 회사의 관찰은 전체 모집단 정확도 인증이나 배포 완료가 아니다.
