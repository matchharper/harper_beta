# 실제 역할 읽기 전용 검색 — v1

2026-10-23 사용자 요청. 실제 소비자 제품 Designer 역할과 고객 대응 FDE 역할 각각 한 번의 검색·평가·선정을 관찰한다. 운영 기준·후보를 수정하지 않는다.

- 목적·단위: 실제 활성 유료 권한 internal Role 하나의 retrieval → 1차 → 2차 → 추천 선정. 새 v60의 넓은 1차 검토와 공통 원문 1회 전달 구조를 확인한다.
- 동결 입력: 역할별 실제 capture.json의 Role/Brief/criteria/Memory, 검색 SQL·후보 원문·당시 추천 가능 상태를 각 run에 저장한다. 최초 capture를 덮어쓰지 않는다. 역할 ID와 실제 인물 데이터는 ignored runs에만 보존한다.
- Gold v1: 합성 후보·가짜 점수 없이 실행, DB 쓰기/발송 0, 1차 통과자만 신규 2차, 평가 실패를 탈락으로 바꾸지 않음, 기준별 분모가 성공한 2차 수와 일치, 조회된 식별자만 선정. 후보별 적합성 gold는 없으며 통과율을 정확도로 부르지 않는다.
- 입력 계약: gpt-6-luna Decisions의 공통 developer policy와 user source 1회, 질문에는 해당 판단만. 프로필·전체 Brief/Memory의 원문과 기록 날짜를 보존한다. 수정용 ref/revision은 scoring projection에서 제외한다. 2차 criterion 원문은 공통 입력의 번호로 참조한다.
- Canonical runner: `harper_worker/llm_evals/company_agentic_role_search/read_only_role.py`. 실제 `plan_retrieval`, `retrieve_candidates`, `load_inputs`, `evaluate_candidates`, `select_candidates`를 재사용한다. `run_requested`, enqueue, save/publish, 소개·연락은 호출하지 않는다.
- 설정: scope=all, startStage=1, 새 평가 예산 5,000명, 추천 목표 10명, 1·2차 동시성 64. 목표 수는 강제 quota가 아니다. 실제 검색·선정 모델과 전체 provider 요청/응답/usage는 run trace에 보존한다.
- 개인정보·경계: 모든 PostgreSQL 연결은 canonical `connect_read_only`의 read-only transaction이며 barrier를 확인한다. LLM client에는 DB connection을 주지 않는다. 실제 후보 입력과 출력은 owner-only ignored runs에만 기록한다. 회사·후보에게 전송하지 않는다.
- 지표·release gate: 검색/프로필 로드/1차 통과·제외/2차/기준별 label/선정 수와 기존·신규 구분, 시간·토큰·입력 중복 검사. 이 관찰은 배포 gate나 전체 정확도 인증이 아니다. 변경 경로의 기존 구조 검사를 실행하고 실제 입력·출력 표본을 직접 검토한다.
- 재현·한계: capture는 연속 read-only 조회이며 단일 전역 MVCC snapshot이 아니다. 실제 기준은 수정하지 않는다. 과거 성공 평가를 섞지 않고 이번 새 평가를 비교한다. 현재 회사 결정·공유 경계 때문에 2차 인원과 선정 비교 인원은 다를 수 있다. 추천 선정까지만 실행하므로 3차 소개문 생성·발행·전달 수는 0이다. 다른 모델 비교는 동일 capture에 새 run을 만들며 새 snapshot은 별도 버전으로 남긴다.

## 같은 입력의 업무 판단 보완 — v61

v60의 실제 첫 실행에서 Designer의 업무 축이 3,503명 중 대부분을 유지했고, 명확한 다른 전문 업무 경력이 있는데 디자인 업무 근거가 없는 후보도 2차로 넘겼다. 정보가 빈약한 경우와 다른 주된 업무가 충분히 기록된 경우를 구별하는 일반 업무 질문으로 수정한다. 원문의 직함·키워드로 분기하거나 후보별 정답을 prompt에 넣지 않는다. 실무조건 질문·2차 rubric은 그대로 유지한다.

두 최초 capture와 structural-v1 gold를 그대로 사용한다. 새 실험은 다른 폴더에 기록하며 DB를 다시 읽지 않는다. 1차는 전원 새로 호출한다. 2차는 실제 전송 payload가 이전 2차 payload와 완전히 같은 후보만 원래 영수증으로 재사용하고, 새로 1차를 통과했거나 payload가 다른 후보는 새로 평가한다. 재사용한 값과 새 호출의 시간·토큰을 구별한다. 변경하지 않은 2차를 재호출해 비용을 중복 지출하지 않는다. 최종 선정은 이번 통과 모집단으로 다시 실행한다. v60의 결과·실패·원문과 관찰은 덮어쓰지 않는다.
