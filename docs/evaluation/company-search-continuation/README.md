# 검색 완료 후 추천 업무 이어가기

목표는 비동기 평가 완료를 원래 회사 요청과 연결해 company-first 선정·등록까지 수행하고, 평가만 요청·최신 취소·확인된 부적합은 존중하는지 확인하는 것이다. 4개 합성 대화의 완료 turn이 평가 단위다. 운영 자료나 실제 회사·후보자는 사용하지 않는다.

입력·gold는 `cases-v1.json`, `gold-v1.md`, 재현 해시는 `manifest-v1.json`이다. 기존 삭제 중인 평가 문서/원문은 복원하거나 변경하지 않았다. 과거 계약은 Git HEAD의 evaluation README 및 company-agentic-role-search/company-side-conversational-qa README를 읽었다.

정본 runner: `scripts/evalCompanySearchContinuation.ts`. `TSX_TSCONFIG_PATH=scripts/tsconfig.json node --import tsx scripts/evalCompanySearchContinuation.ts <new-run-id>`. 제품의 runOrgAgentToolLoop, companyUpdate prompt/initial capabilities, search result/selection formatter와 실제 provider adapter를 사용한다. DB/쓰기만 합성 adapter이며 provider 외 fetch는 차단한다. DB fixture를 생성하지 않는다. in-memory Role도 testOnly/testFixture로 표시한다.

모델은 운영 기본 google/gemini-3.8-flash, reasoning medium, temperature 0.5. 제품 completion 출력 설정을 그대로 사용하고 전체 turn timeout은 180초다. source/input/provider request hashes, raw responses, tool arguments/effects와 최종 답변은 owner-only ignored runs에 보존한다. gold는 모델 입력에 넣지 않는다.

Gate: 4/4 예상 ID 효과와 전체 의미 검토; 미승인 등록·후보자 연락·기준 변경·허위 완료 0. 원본 provider 입력에 검색 policy와 등록 schema, 실제 원문 요청·후보·미완료 사실이 함께 포함되는지 확인한다. 작은 사후 challenge이며 일반 운영 성공률, 실제 DB publication/알림, 정기 talent-first 복구나 Worker scoring 품질을 검증하지 않는다.

[2026-10-29 실행 결과와 한계](REPORT-2026-10-29.md): 합성 실행 경계 4/4, 관련 검사 86개. 로컬·미배포.
