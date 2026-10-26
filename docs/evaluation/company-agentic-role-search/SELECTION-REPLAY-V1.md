# 대화 검색 Top N·3차 설명 관찰 v1

- 목적: 대화 검색의 다단 LLM 선발을 기록된 mutualFit 내림차순 Top N으로 대체하고, 선정된 후보의 criteria/추천 이유를 실제 병렬 작성한다. 정기 검색에는 적용하지 않는다.
- 평가 단위·입력: 기존 read-only-roles-v1 두 실제 역할 capture와 v61의 성공한 평가·당시 추천 가능 상태. 후보 데이터와 1·2차 평가를 다시 만들지 않는다. 입력 hash는 run manifest에 기록한다.
- Gold: selection-gold-v1.json. 새 제품 계약의 구조 기대값이며 후보별 적합성 정답은 없다. 원래 structural-v1 gold를 수정하지 않는다. 사용자 정정(2026-10-23)에 따른 기대 계약 추가이고 결과를 본 뒤 정답을 고치지 않는다.
- Canonical runner: harper_worker/llm_evals/company_agentic_role_search/replay_selection.py. production select_candidates와 write_presentation을 직접 호출한다. LLM client에는 DB connection이 없다. 발행·연락·운영 mutation은 호출하지 않는다.
- 모델·입력: 1·2차 호출 0, selector LLM 호출 0. 3차는 현재 company_candidate_presentation 설정(gpt-6-luna/high), runtime와 같은 충분한 출력 범위, 동시성 64. 실제 model/provider/temperature/usage는 trace와 manifest가 정본이다. 공개 프로필 전체·현재 Hiring Brief/criteria·날짜 있는 Search Brief만 writer에 제공한다. 비공개 Memory와 fit 점수는 제공하지 않는다. 기준 원문은 한 번, 점수는 criterionRef/score/label만 제공한다.
- Writer adapter: capture에 실제 회사 본사 locale와 legacy company behavior가 없으므로 사용자가 요청한 한국어로 지정하고 미기록 behavior는 비워 둔다. 전달 metadata도 새로 조회하지 않는다. 이 관찰은 전체 production snapshot/publish를 실행한 결과가 아니다.
- 지표: Top N/동점 순서, stage1 제외자 미선정, API 호출 수, criteria coverage·점수 보존, 후보별 출력 원문과 근거 검토, 비용·병렬 wall time. 관찰한 문장 오류와 미확인을 보존한다. 20명 설명으로 전체 점수 정확도를 인증하지 않는다.
- 조회 별도 진단: 동결 role·schema로 planner를 한 번 호출해 canonical read-only DB에서 실행한다. 기존 가입 cutoff는 유지하되 현재 원문 변경은 가능하다. 새 후보 수·기존 capture/통과자/Top N과 겹치는 수를 기록한다. 이 쿼리에서 새로 찾은 후보를 점수 비교 집합에 섞지 않는다. 불러온 인원 감소는 재현율 인증이 아니다.
- 개인정보·출처: 사용자가 승인한 실제 역할·후보 원문을 기존 승인된 provider 호출에만 사용한다. 원문과 출력은 ignored runs의 owner-only 파일, 공개 문서는 비식별 집계만. 운영 DB 쓰기·발송·배포 0.
- 재현 한계: 원문은 로컬 private artifact여서 clone만으로 재현되지 않는다. 가격은 저장된 provider usage와 versioned pricing.py의 표준 요율 추정이며 실제 청구액과 구별한다. 1·2차 시간/비용을 이번 3차 비용에 포함하지 않는다.

## 설명 계약 보완 실험

첫 Top N 실행에서 3차 writer가 2차 라벨과 별도의 fitness/finalFit을 다시 판정하는 이중 평가를 확인했다. 다음 run은 같은 capture·평가·Top N·gold를 유지하고, 대화 검색 writer 출력에서 이 두 판정 필드를 제거한다. criterionRef/content, TL;DR, Harper Note, 추천 이유만 작성하고 원래 Decisions 라벨을 그대로 회사 카드에 전달한다. 기존 정기 writer의 fitness/finalFit은 유지한다. 별도 finalFit을 없앴으므로 null이 정상이며 이를 미완료로 세지 않는다. 첫 run과 raw 출력은 보존한다.

조회 첫 진단은 직무 관련 WHERE를 생성했지만 구절만 매칭하는 쿼리가 인접 경력을 놓쳤다. 일반 언어의 조사·활용·띄어쓰기, 프로젝트 원문과 수행 업무 대안을 포함하는 planner 지침을 보완한 새 관찰을 남긴다. 특정 후보 ID·문장이나 역할 이름을 prompt 분기에 넣지 않는다.
