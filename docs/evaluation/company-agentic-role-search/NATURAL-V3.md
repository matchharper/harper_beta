# 앞으로 사용할 자연어 평가 목록 v3

2026-10-23 사용자가 미추천 후보의 이름 검색과 수락자 전원 표시를 평가에서 제외했다. natural-v2의 ARSN03·ARSN05를 제외한 **4개**를 앞으로의 자연어 평가 목록으로 사용한다. 원래 v2 입력·gold·실행 기록은 역사 자료로 보존한다. 제외된 항목은 이후 완료/미완료 판정의 분모에 넣지 않는다.

- 평가 단위: 실제 짧은 사용자 발화 한 번, 실제 도구 실행·응답·저장 상태. 각 사례 한 번 실행한다.
- 입력: `cases-natural-v3.json`. 남은 발화는 v2와 동일하다. 기대 결과는 `gold-natural-v3.json`; 전체 재평가 후 미응답 목록 교체를 이번 사용자 지시대로 명확히 했다. 모델에 gold나 절차를 넣지 않는다.
- 출처: 기존 Notion 시나리오 및 이번 대화의 명시적 범위 변경. 새로운 외부 원문을 추정하지 않는다. 원래 실제 legacy 유료 권한 역할/후보 자료와 frozen baseline을 사용한다.
- 초기 상태: ARSN01·02는 `bootstrap-v3`; ARSN04·06은 `natural-zero-source-v1`. 각 사례를 새 로컬 사본에서 시작하며 서로의 결과를 다음 독립 사례에 남기지 않는다.
- Canonical runner: beta `scripts/runCompanyAgenticRoleSearchMatrix.py` → `scripts/evalCompanyAgenticRoleSearch.ts`, Worker `llm_evals/company_agentic_role_search/run_scoring.py`. `--dataset-manifest=manifest-natural-v3.json`을 명시한다. 첫 baseline은 `--only=ARSN01,ARSN02`, 두 번째는 `--only=ARSN04,ARSN06`으로 실행한다.
- 모델/실행 설정: 실행 시 제품 기본 회사 모델·reasoning을 기록하고 1·2차 Decisions를 유지한다. 전체 payload·source hash·usage·시간을 새 run에 보존한다. 모델/코드 변경은 새 run, 입력/정답 변경은 새 dataset version이다.
- 판단: 기준 변경의 정확한 반영, 적절한 평가 범위 선택, 새 미응답 목록/설명, 기존 결정 보존, 통계의 근거와 제안. 특정 도구 순서·문장 일치로 채점하지 않는다. 완료 답변만으로 통과시키지 않으며 실행 상태와 함께 직접 읽는다.
- 지표/완료 기준: 각 사례의 관찰된 성공·실패·전제 미충족, 모델 호출 수·토큰·경과시간·추정 비용을 분리한다. 무단 연락/결정 변경·사실 조작·비공개 자료 노출은 실패다. 실제로 후보를 더 찾으면 완전 소진 이후 행동은 미관찰로 남긴다.
- 개인정보: 원문 실제 후보/회사·출력은 ignored `private/` 또는 `runs/`에 owner-only로 저장한다. 운영 쓰기·외부 전달·배포는 하지 않는다.
- 한계: 이 문서는 새 목록을 정의한 것이며 실행 통과를 뜻하지 않는다. 과거 v2 결과를 이번 Top N 교체 코드의 검증 결과로 재표기하지 않는다. 전체 5,000명 부하와 운영 인증·완료 알림을 동시에 검증하는 실험도 아니다.
